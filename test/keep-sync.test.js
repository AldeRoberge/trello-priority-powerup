'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SRC = path.join(__dirname, '..', 'workers', 'trello-sheet-sync', 'src');
const load = (f) => import(pathToFileURL(path.join(SRC, f)).href);
const pack = (body, rev = 1) => `${body}\n\n<!--cerveau-meta\ntype: document\nrev: ${rev}\n-->`;

describe('Documents <-> Google Keep (worker)', () => {
  let keep;
  let env;
  let realFetch;
  let cards; // id -> card
  let notes; // name -> note
  let calls;
  let nextId;
  let keepStatus;

  before(async () => {
    keep = await load('keep.js');
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    env = {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@example.iam.gserviceaccount.com',
      GOOGLE_SERVICE_ACCOUNT_KEY: privateKey,
      KEEP_USER_EMAIL: 'moi@exemple.com',
      TRELLO_KEY: 'k',
      TRELLO_TOKEN: 't',
      TRELLO_BOARD_ID: 'board1',
    };
  });

  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    cards = new Map();
    notes = new Map();
    calls = [];
    nextId = 1;
    keepStatus = 200;
    realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      url = String(url);
      const method = init.method || 'GET';
      if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'tok', expires_in: 3600 });
      if (url.startsWith('https://keep.googleapis.com/v1/')) {
        if (keepStatus !== 200) return new Response('denied', { status: keepStatus });
        if (method === 'GET' && url.includes('/notes?')) return json({ notes: [...notes.values()] });
        if (method === 'POST') {
          const body = JSON.parse(init.body);
          const name = `notes/n${nextId++}`;
          notes.set(name, { name, ...body });
          calls.push('keep-create');
          return json(notes.get(name));
        }
        if (method === 'DELETE') {
          notes.delete(url.replace('https://keep.googleapis.com/v1/', ''));
          calls.push('keep-delete');
          return json({});
        }
      }
      if (url.startsWith('https://api.trello.com/1/boards/board1/cards/closed')) return json([...cards.values()].filter((c) => c.closed));
      if (url.startsWith('https://api.trello.com/1/boards/board1/lists')) return json([{ id: 'list1', name: 'Faire' }]);
      if (method === 'POST' && url.startsWith('https://api.trello.com/1/cards?')) {
        const body = JSON.parse(init.body);
        const id = (100 + nextId++).toString(16).padStart(24, 'c');
        cards.set(id, { id, name: body.name, desc: body.desc || '', closed: false });
        return json(cards.get(id));
      }
      const tc = /^https:\/\/api\.trello\.com\/1\/cards\/([^?]+)/.exec(url);
      if (tc && method === 'PUT') {
        Object.assign(cards.get(tc[1]), JSON.parse(init.body));
        calls.push('trello-update');
        return json(cards.get(tc[1]));
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const doc = (id, title, body) => cards.set(id, { id, name: `📄 ${title}`, desc: pack(body), closed: true });
  const note = (name, title, body) => notes.set(name, { name, title, body });
  const listBody = (...texts) => ({ list: { listItems: texts.map((t) => ({ text: { text: t }, checked: false })) } });

  it('converts sections, checkboxes and links to a Keep list and back', () => {
    const md = '- [ ] Seul\n\n## eBay\n\n- [ ] Vendre consoles\n- [x] Vendre [@Sony](task:abc)';
    const body = keep.markdownToBody(md, 'list');
    assert.equal(body.list.listItems[0].text.text, 'Seul');
    assert.equal(body.list.listItems[1].text.text, 'eBay');
    assert.deepEqual(
      body.list.listItems[1].childListItems.map((i) => [i.text.text, i.checked]),
      [['Vendre consoles', false], ['Vendre Sony', true]],
    );
    assert.equal(keep.bodyToMarkdown(body, md), '- [ ] Seul\n\n## eBay\n\n- [ ] Vendre consoles\n- [x] Vendre [@Sony](task:abc)');
    assert.equal(keep.bodyToMarkdown(body, ''), '- [ ] Seul\n\n## eBay\n\n- [ ] Vendre consoles\n- [x] Vendre Sony');
  });

  it('keeps a text note as text, identically both ways', () => {
    const md = 'eBay\n- Vendre consoles\n- Vendre caméras rétro';
    assert.equal(keep.kindOfMarkdown(md), 'text');
    const body = keep.markdownToBody(md, 'text');
    assert.equal(keep.bodyToMarkdown(body, md), md);
  });

  it('tracks the configured titles and every "To bring to" list', () => {
    assert.equal(keep.isTracked(env, 'To sell/to buy'), true);
    assert.equal(keep.isTracked(env, 'To bring to Kate in Kirkland Lake'), true);
    assert.equal(keep.isTracked(env, 'Recette de crêpes'), false);
    assert.equal(keep.keepEnabled({}), false);
    assert.equal(keep.keepEnabled(env), true);
  });

  it('creates a note for a new tracked document, then leaves it alone', async () => {
    doc('a'.repeat(24), 'To bring to Kate in Kirkland Lake', '- [ ] [@Pain](task:x1)\n- [ ] Café');
    doc('b'.repeat(24), 'Recette privée', 'texte');
    const first = await keep.syncAllKeep(env);
    assert.equal(first.created, 1);
    assert.equal(notes.size, 1);
    const n = [...notes.values()][0];
    assert.equal(n.title, 'To bring to Kate in Kirkland Lake');
    assert.deepEqual(n.body.list.listItems.map((i) => i.text.text), ['Pain', 'Café']);
    const second = await keep.syncAllKeep(env);
    assert.equal(second.unchanged, 1);
    assert.equal(notes.size, 1);
  });

  it('pulls a Keep edit into the document and keeps task links', async () => {
    doc('a'.repeat(24), 'To bring to Kate', '- [ ] [@Pain](task:x1)\n- [ ] Café');
    await keep.syncAllKeep(env);
    const n = [...notes.values()][0];
    n.body.list.listItems[0].checked = true;
    n.body.list.listItems.push({ text: { text: 'Lait' }, checked: false });
    const res = await keep.syncAllKeep(env);
    assert.equal(res.pulled, 1);
    assert.match(cards.get('a'.repeat(24)).desc, /^- \[x\] \[@Pain\]\(task:x1\)\n- \[ \] Café\n- \[ \] Lait\n\n<!--cerveau-meta/);
    assert.match(cards.get('a'.repeat(24)).desc, /rev: 2/);
  });

  it('Trello wins: a document edit replaces the note (create first, then delete)', async () => {
    doc('a'.repeat(24), 'To bring to Kate', '- [ ] Pain');
    await keep.syncAllKeep(env);
    const before = [...notes.keys()][0];
    cards.get('a'.repeat(24)).desc = pack('- [ ] Pain\n- [ ] Beurre', 2);
    calls.length = 0;
    const res = await keep.syncAllKeep(env);
    assert.equal(res.updated, 1);
    assert.deepEqual(calls.filter((c) => c.startsWith('keep')), ['keep-create', 'keep-delete']);
    assert.equal(notes.size, 1);
    assert.notEqual([...notes.keys()][0], before);
  });

  it('never deletes a note it does not own', async () => {
    note('notes/perso', 'Courses', listBody('lait'));
    doc('a'.repeat(24), 'To bring to Kate', '- [ ] Pain');
    await keep.syncAllKeep(env);
    cards.get('a'.repeat(24)).desc = pack('- [ ] Pain\n- [ ] Beurre', 2);
    await keep.syncAllKeep(env);
    assert.ok(notes.has('notes/perso'));
  });

  it('imports an untracked Keep note with a tracked title as a document', async () => {
    note('notes/ebay', 'To sell/to buy', { text: { text: 'eBay\n- Vendre consoles' } });
    note('notes/autre', 'Idée', listBody('x'));
    const res = await keep.syncAllKeep(env);
    assert.equal(res.imported, 1);
    const imported = [...cards.values()].find((c) => c.name === '📄 To sell/to buy');
    assert.ok(imported);
    assert.equal(imported.closed, true);
    assert.match(imported.desc, /^eBay\n- Vendre consoles\n\n<!--cerveau-meta/);
    const again = await keep.syncAllKeep(env);
    assert.equal(again.imported, 0);
    assert.equal(notes.size, 2);
  });

  it('writes the note out again when it was deleted in Keep', async () => {
    doc('a'.repeat(24), 'To bring to Kate', '- [ ] Pain');
    await keep.syncAllKeep(env);
    notes.clear();
    const res = await keep.syncAllKeep(env);
    assert.equal(res.updated, 1);
    assert.equal(notes.size, 1);
  });

  it('reports a clear error when Keep refuses access', async () => {
    doc('a'.repeat(24), 'To bring to Kate', '- [ ] Pain');
    keepStatus = 403;
    const res = await keep.syncAllKeep(env);
    assert.match(res.error, /délégation/);
    assert.equal(notes.size, 0);
  });

  it('does nothing without KEEP_USER_EMAIL', async () => {
    assert.deepEqual(await keep.syncAllKeep({}), { enabled: false });
  });
});
