'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SRC = path.join(__dirname, '..', 'workers', 'trello-sheet-sync', 'src');
const load = (f) => import(pathToFileURL(path.join(SRC, f)).href);

const CARD = 'a'.repeat(24);
const CARD2 = 'b'.repeat(24);
const pack = (body, rev = 1) => `${body}\n\n<!--cerveau-meta\ntype: document\nrev: ${rev}\n-->`;

describe('Documents -> Google Drive mirror (worker)', () => {
  let drive;
  let env;
  let realFetch;
  let trelloCards; // id -> card
  let driveFiles; // id -> { id, name, appProperties, content, trashed }
  let calls;
  let nextId;

  before(async () => {
    drive = await load('drive.js');
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    env = {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@example.iam.gserviceaccount.com',
      GOOGLE_SERVICE_ACCOUNT_KEY: privateKey,
      GOOGLE_DRIVE_FOLDER_ID: 'FOLDER1234567890',
      TRELLO_KEY: 'k',
      TRELLO_TOKEN: 't',
      TRELLO_BOARD_ID: 'board1',
    };
  });

  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    trelloCards = new Map();
    driveFiles = new Map();
    calls = [];
    nextId = 1;
    realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      url = String(url);
      const method = init.method || 'GET';
      if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'tok', expires_in: 3600 });
      if (url.startsWith('https://api.trello.com/1/boards/board1/cards/closed')) {
        return json([...trelloCards.values()].filter((c) => c.closed));
      }
      const tc = /^https:\/\/api\.trello\.com\/1\/cards\/([^?]+)/.exec(url);
      if (tc) return trelloCards.has(tc[1]) ? json(trelloCards.get(tc[1])) : new Response('not found', { status: 404 });
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
        const q = decodeURIComponent(new URL(url).searchParams.get('q'));
        const only = /value='([^']+)'/.exec(q);
        const files = [...driveFiles.values()].filter((f) => !f.trashed && (!only || f.appProperties.trelloCardId === only[1]));
        calls.push('list');
        return json({ files: files.map(({ id, name, appProperties }) => ({ id, name, appProperties })) });
      }
      const up = /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files(?:\/([^?]+))?\?/.exec(url);
      if (up) {
        const parts = String(init.body).split(/--cerveau[0-9a-f]+/).filter((p) => /Content-Type/.test(p));
        const meta = JSON.parse(parts[0].split('\r\n\r\n')[1].trim());
        const content = parts[1].split('\r\n\r\n')[1].replace(/\r\n$/, '');
        if (method === 'POST') {
          const id = `f${nextId++}`;
          driveFiles.set(id, { id, ...meta, content, trashed: false });
          calls.push('create');
          assert.deepEqual(meta.parents, ['FOLDER1234567890']);
        } else {
          Object.assign(driveFiles.get(up[1]), meta, { content });
          calls.push('update');
        }
        return json({ id: up[1] || `f${nextId - 1}` });
      }
      const patch = /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?/.exec(url);
      if (patch && method === 'PATCH') {
        Object.assign(driveFiles.get(patch[1]), JSON.parse(init.body));
        calls.push('trash');
        return json({ id: patch[1] });
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const doc = (id, title, body, rev = 1, extra = {}) => trelloCards.set(id, { id, name: `📄 ${title}`, desc: pack(body, rev), closed: true, ...extra });
  const live = () => [...driveFiles.values()].filter((f) => !f.trashed);

  it('names files safely and drops the hidden meta block from the content', () => {
    assert.equal(drive.fileName('Plan: Q3/Q4?'), 'Plan- Q3-Q4-.md');
    assert.equal(drive.fileName('   '), 'Sans titre.md');
    assert.equal(drive.docMarkdown(pack('# Titre\n\ntexte', 4)), '# Titre\n\ntexte\n');
    assert.equal(drive.driveEnabled({}), false);
    assert.equal(drive.driveEnabled(env), true);
  });

  it('does nothing without a configured folder', async () => {
    assert.deepEqual(await drive.syncAllDocuments({}), { enabled: false });
    assert.equal(await drive.syncDocumentCard({}, CARD), null);
  });

  it('full pass: creates one .md per document, ignores other archived cards, then is a no-op', async () => {
    doc(CARD, 'Bienvenue', '# Salut');
    doc(CARD2, 'Plan', 'un deux');
    trelloCards.set('x'.repeat(24), { id: 'x'.repeat(24), name: 'Vieille tâche', desc: 'x', closed: true });
    const first = await drive.syncAllDocuments(env);
    assert.equal(first.created, 2);
    assert.deepEqual(live().map((f) => f.name).sort(), ['Bienvenue.md', 'Plan.md']);
    assert.equal(live().find((f) => f.name === 'Plan.md').content, 'un deux\n');
    assert.equal(live().find((f) => f.name === 'Plan.md').mimeType, 'text/markdown');
    calls.length = 0;
    const second = await drive.syncAllDocuments(env);
    assert.equal(second.unchanged, 2);
    assert.ok(!calls.some((c) => c !== 'list'), `no write on an unchanged board: ${calls}`);
  });

  it('updates the file on a text change and renames it on a title change', async () => {
    doc(CARD, 'Notes', 'v1');
    await drive.syncAllDocuments(env);
    doc(CARD, 'Notes', 'v2', 2);
    assert.equal((await drive.syncAllDocuments(env)).updated, 1);
    assert.equal(live()[0].content, 'v2\n');
    doc(CARD, 'Notes 2026', 'v2', 2);
    await drive.syncAllDocuments(env);
    assert.equal(live().length, 1);
    assert.equal(live()[0].name, 'Notes 2026.md');
  });

  it('trashes the file of a deleted document, but never files it did not create', async () => {
    doc(CARD, 'A', 'a');
    await drive.syncAllDocuments(env);
    driveFiles.set('mine', { id: 'mine', name: 'Notes perso.md', appProperties: {}, trashed: false });
    trelloCards.delete(CARD);
    const r = await drive.syncAllDocuments(env);
    assert.equal(r.trashed, 1);
    assert.deepEqual(live().map((f) => f.id), ['mine']);
  });

  it('single document (webhook): create, update, and trash when the card is gone or restored', async () => {
    doc(CARD, 'Un', 'a');
    assert.equal(await drive.syncDocumentCard(env, CARD), 'created');
    doc(CARD, 'Un', 'b', 2);
    assert.equal(await drive.syncDocumentCard(env, CARD), 'updated');
    assert.equal(await drive.syncDocumentCard(env, CARD), 'unchanged');
    doc(CARD, 'Un', 'b', 2, { closed: false }); // restored to the board: it is a task now
    assert.equal(await drive.syncDocumentCard(env, CARD), 'trashed');
    assert.equal(live().length, 0);
    assert.equal(await drive.syncDocumentCard(env, CARD2), 'none'); // unknown card
    assert.equal(await drive.syncDocumentCard(env, 'not-an-id'), null);
  });

  it('collapses duplicate files created by racing webhooks', async () => {
    doc(CARD, 'Dup', 'a');
    const sig = await drive.signature('Dup', 'a\n');
    driveFiles.set('d1', { id: 'd1', name: 'Dup.md', appProperties: { trelloCardId: CARD, sig }, trashed: false });
    driveFiles.set('d2', { id: 'd2', name: 'Dup.md', appProperties: { trelloCardId: CARD, sig }, trashed: false });
    await drive.syncDocumentCard(env, CARD);
    assert.equal(live().length, 1);
  });

  it('reports a Drive failure (with a hint for the storage-quota error) instead of throwing from a full pass', async () => {
    doc(CARD, 'Q', 'a');
    const inner = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('/upload/drive/')) return new Response('{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}', { status: 403 });
      return inner(url, init);
    };
    const r = await drive.syncAllDocuments(env);
    assert.match(r.error, /403/);
    assert.match(r.error, /Drive partagé/);
    assert.equal(drive.docSyncStatus.ok, false);
  });
});
