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
      if (url.startsWith('https://api.trello.com/1/boards/board1/lists')) {
        return json([{ id: 'list1', name: 'Faire' }]);
      }
      if (method === 'POST' && url.startsWith('https://api.trello.com/1/cards?')) {
        const body = JSON.parse(init.body);
        const id = nextId.toString(16).padStart(24, 'c');
        nextId += 1;
        const card = { id, name: body.name, desc: body.desc || '', closed: false, idList: body.idList };
        trelloCards.set(id, card);
        calls.push('trello-create');
        return json(card);
      }
      const tc = /^https:\/\/api\.trello\.com\/1\/cards\/([^?]+)/.exec(url);
      if (tc && method === 'PUT') {
        const card = trelloCards.get(tc[1]);
        Object.assign(card, JSON.parse(init.body));
        calls.push('trello-update');
        return json(card);
      }
      if (tc) return trelloCards.has(tc[1]) ? json(trelloCards.get(tc[1])) : new Response('not found', { status: 404 });
      if (method === 'GET' && url.includes('alt=media')) {
        const id = /\/files\/([^?]+)/.exec(url)[1];
        const f = driveFiles.get(id);
        calls.push('download');
        return new Response(f ? f.content : '', { status: f ? 200 : 404 });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
        const q = decodeURIComponent(new URL(url).searchParams.get('q'));
        const only = /value='([^']+)'/.exec(q);
        const files = [...driveFiles.values()].filter((f) => !f.trashed && (!only || (f.appProperties && f.appProperties.trelloCardId === only[1])));
        calls.push('list');
        return json({
          files: files.map(({ id, name, mimeType, md5Checksum, appProperties }) => ({ id, name, mimeType, md5Checksum, appProperties })),
        });
      }
      const up = /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files(?:\/([^?]+))?\?/.exec(url);
      if (up) {
        const parts = String(init.body).split(/--cerveau[0-9a-f]+/).filter((p) => /Content-Type/.test(p));
        const meta = JSON.parse(parts[0].split('\r\n\r\n')[1].trim());
        const content = parts[1].split('\r\n\r\n')[1].replace(/\r\n$/, '');
        const md5Checksum = crypto.createHash('md5').update(content).digest('hex');
        if (method === 'POST') {
          const id = `f${nextId++}`;
          driveFiles.set(id, { id, ...meta, content, md5Checksum, trashed: false });
          calls.push('create');
          assert.deepEqual(meta.parents, ['FOLDER1234567890']);
          return json({ id, md5Checksum });
        }
        Object.assign(driveFiles.get(up[1]), meta, { content, md5Checksum });
        calls.push('update');
        return json({ id: up[1], md5Checksum });
      }
      const patch = /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?/.exec(url);
      if (patch && method === 'PATCH') {
        const body = JSON.parse(init.body);
        const file = driveFiles.get(patch[1]);
        calls.push(body.trashed ? 'trash' : 'stamp');
        if (body.appProperties) file.appProperties = body.appProperties;
        Object.assign(file, body);
        return json({ id: patch[1], md5Checksum: file.md5Checksum || '' });
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
    assert.equal(drive.titleFromFile('Plan: Q3.md'), 'Plan: Q3');
    const built = drive.cardFromDrive(
      { desc: 'ancien\n\n<!--cerveau-meta\ntype: document\nrev: 4\ncover: color:#abc\n-->' },
      'Nouveau',
      'nouveau texte\n',
    );
    assert.equal(built.name, '📄 Nouveau');
    assert.match(built.desc, /^nouveau texte\n\n<!--cerveau-meta/);
    assert.match(built.desc, /rev: 5/);
    assert.match(built.desc, /cover: color:#abc/);
    assert.equal(drive.cardFromDrive(null, 'Gros', 'x'.repeat(20000)), null);
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
    driveFiles.set('mine', { id: 'mine', name: 'photo.jpg', mimeType: 'image/jpeg', appProperties: {}, content: 'x', trashed: false });
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

  it('applies a Drive edit to the document and keeps the hidden block', async () => {
    trelloCards.set(CARD, {
      id: CARD,
      name: '📄 Notes',
      desc: 'v1\n\n<!--cerveau-meta\ntype: document\nrev: 4\ncover: color:#abc\n-->',
      closed: true,
    });
    await drive.syncAllDocuments(env);
    const file = live()[0];
    file.content = 'depuis drive\n';
    file.md5Checksum = crypto.createHash('md5').update(file.content).digest('hex');
    const r = await drive.syncAllDocuments(env);
    assert.equal(r.pulled, 1);
    const card = trelloCards.get(CARD);
    assert.match(card.desc, /depuis drive/);
    assert.match(card.desc, /rev: 5/);
    assert.match(card.desc, /cover: color:#abc/);
    assert.equal(file.content, 'depuis drive\n');
    calls.length = 0;
    const second = await drive.syncAllDocuments(env);
    assert.equal(second.unchanged, 1);
    assert.ok(!calls.some((c) => c !== 'list'), `no write after the pull: ${calls}`);
  });

  it('lets Trello win when the document and the file both changed', async () => {
    doc(CARD, 'Notes', 'v1');
    await drive.syncAllDocuments(env);
    const file = live()[0];
    file.content = 'depuis drive\n';
    file.md5Checksum = crypto.createHash('md5').update(file.content).digest('hex');
    doc(CARD, 'Notes', 'depuis trello', 2);
    const r = await drive.syncAllDocuments(env);
    assert.equal(r.updated, 1);
    assert.equal(file.content, 'depuis trello\n');
    assert.match(trelloCards.get(CARD).desc, /depuis trello/);
  });

  it('renames the document when the file is renamed in Drive', async () => {
    doc(CARD, 'Notes', 'v1');
    await drive.syncAllDocuments(env);
    live()[0].name = 'Carnet.md';
    const r = await drive.syncAllDocuments(env);
    assert.equal(r.pulled, 1);
    assert.equal(trelloCards.get(CARD).name, '📄 Carnet');
    assert.match(trelloCards.get(CARD).desc, /v1/);
  });

  it('does not treat its own sanitized file name as a Drive rename', async () => {
    doc(CARD, 'Plan: Q3', 'v1');
    await drive.syncAllDocuments(env);
    assert.equal(live()[0].name, 'Plan- Q3.md');
    calls.length = 0;
    const r = await drive.syncAllDocuments(env);
    assert.equal(r.unchanged, 1);
    assert.equal(trelloCards.get(CARD).name, '📄 Plan: Q3');
    assert.ok(!calls.some((c) => c !== 'list'), `no write: ${calls}`);
  });

  it('creates a document from a new .md file and leaves other files alone', async () => {
    const content = 'salut\n';
    driveFiles.set('new', {
      id: 'new',
      name: 'Bonjour.md',
      mimeType: 'text/markdown',
      content,
      md5Checksum: crypto.createHash('md5').update(content).digest('hex'),
      appProperties: {},
      trashed: false,
    });
    driveFiles.set('pic', { id: 'pic', name: 'photo.jpg', mimeType: 'image/jpeg', content: 'x', appProperties: {}, trashed: false });
    const r = await drive.syncAllDocuments(env);
    assert.equal(r.imported, 1);
    assert.equal(trelloCards.size, 1);
    const card = [...trelloCards.values()][0];
    assert.equal(card.closed, true);
    assert.equal(card.name, '📄 Bonjour');
    assert.equal(card.idList, 'list1');
    assert.match(card.desc, /^salut\n\n<!--cerveau-meta/);
    assert.equal(driveFiles.get('new').appProperties.trelloCardId, card.id);
    assert.equal(driveFiles.get('pic').appProperties.trelloCardId, undefined);
    const second = await drive.syncAllDocuments(env);
    assert.equal(second.imported || 0, 0);
    assert.equal(second.unchanged, 1);
    assert.equal(trelloCards.size, 1);
  });

  it('skips a markdown file that would not fit in a card description', async () => {
    driveFiles.set('big', {
      id: 'big',
      name: 'Gros.md',
      mimeType: 'text/markdown',
      content: 'x'.repeat(17000),
      md5Checksum: 'abc',
      appProperties: {},
      trashed: false,
    });
    const r = await drive.syncAllDocuments(env);
    assert.equal(r.skipped, 1);
    assert.equal(trelloCards.size, 0);
  });

  it('records the Drive checksum once on a file that predates it', async () => {
    const sig = await drive.signature('Notes', 'v1\n');
    const sum = crypto.createHash('md5').update('v1\n').digest('hex');
    doc(CARD, 'Notes', 'v1');
    driveFiles.set('old', {
      id: 'old',
      name: 'Notes.md',
      mimeType: 'text/markdown',
      content: 'v1\n',
      md5Checksum: sum,
      appProperties: { trelloCardId: CARD, sig },
      trashed: false,
    });
    const r = await drive.syncAllDocuments(env);
    assert.equal(r.stamped, 1);
    assert.equal(driveFiles.get('old').appProperties.md5, sum);
    const second = await drive.syncAllDocuments(env);
    assert.equal(second.unchanged, 1);
  });
});
