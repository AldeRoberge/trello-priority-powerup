'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');
const FakeTrello = require('../sandbox/e2e/fake-trello.js');

describe('DocsTrello (against an in-memory Trello)', () => {
  let DT;
  let DM;
  let fake;

  before(() => {
    loadComponent('docs/docs-model.js');
    loadComponent('docs/docs-trello.js');
    DT = global.DocsTrello;
    DM = global.DocsModel;
    assert.ok(DT && DM);
  });

  beforeEach(() => {
    fake = FakeTrello.create({
      cards: [
        { id: 'task1', name: 'Une tâche ouverte', idList: 'l1' },
        { id: 'old1', name: 'Tâche archivée', idList: 'l1', closed: true },
      ],
      members: [{ id: 'm1', fullName: 'Marie Tremblay', username: 'marie' }],
    });
    global.SheetsTrello = { trelloRest: fake.trelloRest };
  });

  it('creates a document as an ARCHIVED card in the first list, named with the marker', async () => {
    const doc = await DT.createDoc(fake.t, 'Plan de projet', '# Plan');
    assert.equal(doc.title, 'Plan de projet');
    assert.equal(doc.rev, 1);
    const card = fake.cards.find((c) => c.id === doc.id);
    assert.equal(card.name, '📄 Plan de projet');
    assert.equal(card.closed, true, 'archived so it never shows on the board');
    assert.equal(card.idList, 'l1');
    assert.equal(DM.unpackDesc(card.desc).body, '# Plan');
    assert.ok(!fake.cards.some((c) => c.id !== 'old1' && c.id !== doc.id && c.closed), 'nothing else archived');
    // the open board is untouched: only the original open task is visible to the client
    assert.deepEqual((await fake.t.cards('id', 'name')).map((c) => c.name), ['Une tâche ouverte']);
  });

  it('lists only documents (not other archived cards), newest first', async () => {
    const a = await DT.createDoc(fake.t, 'A', '');
    const b = await DT.createDoc(fake.t, 'B', '');
    const docs = await DT.listDocs(fake.t);
    assert.deepEqual(docs.map((d) => d.title), ['B', 'A']);
    assert.deepEqual(docs.map((d) => d.id), [b.id, a.id]);
    assert.ok(!docs.some((d) => d.id === 'old1'));
  });

  it('creates a default archived document when the board has none, and only then', async () => {
    const first = await DT.ensureDefaultDoc(fake.t, await DT.listDocs(fake.t));
    assert.equal(first.created.title, DM.DEFAULT_TITLE);
    assert.equal(first.docs.length, 1);
    const card = fake.cards.find((c) => c.id === first.created.id);
    assert.equal(card.closed, true);
    assert.equal(DM.unpackDesc(card.desc).body, DM.DEFAULT_BODY);
    const again = await DT.ensureDefaultDoc(fake.t, await DT.listDocs(fake.t));
    assert.equal(again.created, null);
    assert.equal((await DT.listDocs(fake.t)).length, 1);
  });

  it('loads a document with its text and revision', async () => {
    const created = await DT.createDoc(fake.t, 'Notes', 'bonjour **monde**');
    const loaded = await DT.loadDoc(fake.t, created.id);
    assert.equal(loaded.title, 'Notes');
    assert.equal(loaded.body, 'bonjour **monde**');
    assert.equal(loaded.rev, 1);
    await assert.rejects(() => DT.loadDoc(fake.t, 'old1'), { reason: 'not-a-document' });
    await assert.rejects(() => DT.loadDoc(fake.t, 'nope'), { reason: 'http-404' });
  });

  it('saves a new revision and detects a concurrent edit', async () => {
    const created = await DT.createDoc(fake.t, 'Partagé', 'v1');
    const mine = await DT.loadDoc(fake.t, created.id);
    const theirs = await DT.loadDoc(fake.t, created.id);

    const saved = await DT.saveDoc(fake.t, { id: mine.id, body: 'v2 de moi', rev: mine.rev });
    assert.equal(saved.rev, 2);

    await assert.rejects(
      () => DT.saveDoc(fake.t, { id: theirs.id, body: 'v2 de lui', rev: theirs.rev }),
      (err) => err.reason === 'conflict' && err.remote.rev === 2 && err.remote.body === 'v2 de moi'
    );
    assert.equal((await DT.loadDoc(fake.t, created.id)).body, 'v2 de moi', 'the newer text was not overwritten');

    const forced = await DT.saveDoc(fake.t, { id: theirs.id, body: 'v2 de lui', rev: theirs.rev }, { force: true });
    assert.equal(forced.rev, 2);
    assert.equal((await DT.loadDoc(fake.t, created.id)).body, 'v2 de lui');
  });

  it('refuses a document that does not fit in a Trello description', async () => {
    const created = await DT.createDoc(fake.t, 'Gros', '');
    await assert.rejects(() => DT.saveDoc(fake.t, { id: created.id, body: 'x'.repeat(DM.MAX_DESC), rev: 1 }), { reason: 'too-long' });
    await assert.rejects(() => DT.createDoc(fake.t, 'Trop gros', 'x'.repeat(DM.MAX_DESC)), { reason: 'too-long' });
  });

  it('renames only the title, keeping the marker', async () => {
    const created = await DT.createDoc(fake.t, 'Ancien', 'texte');
    const res = await DT.renameDoc(fake.t, created.id, '  Nouveau   titre ');
    assert.equal(res.title, 'Nouveau titre');
    assert.equal(fake.cards.find((c) => c.id === created.id).name, '📄 Nouveau titre');
    assert.equal((await DT.loadDoc(fake.t, created.id)).body, 'texte');
  });

  it('deletes a document for good', async () => {
    const created = await DT.createDoc(fake.t, 'Éphémère', '');
    await DT.deleteDoc(fake.t, created.id);
    assert.ok(!fake.cards.some((c) => c.id === created.id));
    assert.deepEqual(await DT.listDocs(fake.t), []);
  });

  it('cleans up the card if archiving fails, so nothing visible is left on the board', async () => {
    const real = fake.trelloRest;
    global.SheetsTrello = {
      trelloRest: (t, path, method, body) =>
        method === 'PUT' && body && body.closed ? Promise.resolve({ ok: false, reason: 'http-500' }) : real(t, path, method, body),
    };
    await assert.rejects(() => DT.createDoc(fake.t, 'Raté', 'x'), { reason: 'http-500' });
    assert.ok(!fake.cards.some((c) => c.name === '📄 Raté'), 'the half-created card was deleted');
  });

  it('needs a list to file documents in', async () => {
    const empty = FakeTrello.create({ lists: [] });
    global.SheetsTrello = { trelloRest: empty.trelloRest };
    empty.t.lists = () => Promise.resolve([]);
    await assert.rejects(() => DT.createDoc(empty.t, 'x', ''), { reason: 'no-list' });
  });

  it('surfaces a missing Trello authorization as a reason the UI can act on', async () => {
    fake.setAuthorized(false);
    await assert.rejects(() => DT.listDocs(fake.t), { reason: 'not-authorized' });
    await assert.rejects(() => DT.createDoc(fake.t, 'x', ''), { reason: 'not-authorized' });
  });

  it('gathers mention sources without failing when a source is unavailable', async () => {
    global.PriorityTrello = { getBoardMembers: async () => [{ id: 'm1', fullName: 'Marie Tremblay', username: 'marie' }] };
    global.People = { load: async () => { throw new Error('boom'); } };
    const src = await DT.loadMentionSources(fake.t);
    assert.equal(src.members.length, 1);
    assert.deepEqual(src.contacts, []);
    assert.deepEqual(src.failed, ['contacts'], 'a failing source is reported, not silently treated as empty');
    assert.deepEqual(src.cards.map((c) => c.id), ['task1'], 'archived cards (documents included) are not offered');
    assert.equal(src.lists.length, 2);
    const ix = DM.buildMentionIndex(Object.assign({}, src, { docs: [{ id: 'd1', title: 'Plan' }] }));
    assert.equal(ix.person.length + ix.task.length + ix.doc.length, 3);
    delete global.PriorityTrello;
    delete global.People;
  });
});
