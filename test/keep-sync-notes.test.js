'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');
const FakeTrello = require('../sandbox/e2e/fake-trello.js');

describe('Notes sync (device <-> Documents cards)', () => {
  let KM;
  let KS;
  let KST;
  let DT;
  let DM;
  let fake;
  let store;
  let sync;
  let offline;

  before(() => {
    loadComponent('docs/docs-model.js');
    loadComponent('docs/docs-trello.js');
    loadComponent('keep/keep-model.js');
    loadComponent('keep/keep-store.js');
    loadComponent('keep/keep-sync.js');
    KM = global.KeepModel;
    KS = global.KeepSync;
    KST = global.KeepStore;
    DT = global.DocsTrello;
    DM = global.DocsModel;
  });

  beforeEach(() => {
    fake = FakeTrello.create({ cards: [] });
    global.SheetsTrello = { trelloRest: fake.trelloRest };
    store = KST.create(KST.memoryAdapter());
    offline = false;
    const real = KS.trelloApi(fake.t);
    const guard = (fn) => (...a) => (offline ? Promise.reject(new Error('offline')) : fn(...a));
    const api = { list: guard(real.list), create: guard(real.create), rename: guard(real.rename), save: guard(real.save), remove: guard(real.remove) };
    sync = KS.create({ store, api });
  });

  const remoteCards = () => fake.cards.filter((c) => c.closed && DM.isDocName(c.name));

  it('creates a note offline, then sends it as an archived document when back online', async () => {
    offline = true;
    const rec = await sync.save({ title: 'Courses', body: '- [ ] lait', color: 'yellow' });
    assert.ok(KS.isLocalId(rec.id));
    const res = await sync.run();
    assert.equal(res.offline, true);
    assert.equal(res.pending, 1);
    assert.equal(remoteCards().length, 0);

    offline = false;
    const done = await sync.run();
    assert.equal(done.pending, 0);
    const cards = remoteCards();
    assert.equal(cards.length, 1);
    assert.equal(cards[0].name, '📄 Courses');
    assert.match(cards[0].desc, /keep: color=yellow/);
    const local = await store.visible();
    assert.equal(local.length, 1);
    assert.equal(local[0].id, cards[0].id, 'the temporary local id is replaced by the card id');
  });

  it('sends an edit made offline and keeps tags the Documents view set', async () => {
    const doc = await DT.createDoc(fake.t, 'Liste', '- [ ] a', { props: { tags: ['maison'] } });
    await sync.run();
    offline = true;
    await sync.save({ ...(await store.get(doc.id)), body: '- [x] a', pin: true });
    offline = false;
    await sync.run();
    const card = fake.cards.find((c) => c.id === doc.id);
    const u = DM.unpackDesc(card.desc);
    assert.equal(u.body, '- [x] a');
    assert.equal(u.props.keep, 'pin');
    assert.deepEqual(u.props.tags, ['maison']);
    assert.equal(u.rev, 2);
  });

  it('pulls a change made elsewhere', async () => {
    const doc = await DT.createDoc(fake.t, 'Liste', 'v1');
    await sync.run();
    const loaded = await DT.loadDoc(fake.t, doc.id);
    await DT.saveDoc(fake.t, { ...loaded, body: 'v2' });
    await sync.run();
    assert.equal((await store.get(doc.id)).body, 'v2');
  });

  it('keeps both versions when a note changed on both sides', async () => {
    const doc = await DT.createDoc(fake.t, 'Liste', 'v1');
    await sync.run();
    offline = true;
    await sync.save({ ...(await store.get(doc.id)), body: 'ici' });
    offline = false;
    const loaded = await DT.loadDoc(fake.t, doc.id);
    await DT.saveDoc(fake.t, { ...loaded, body: 'ailleurs' });
    await sync.run();
    const notes = await store.visible();
    assert.equal(notes.length, 2);
    assert.ok(notes.some((n) => n.body === 'ailleurs' && n.title === 'Liste'));
    assert.ok(notes.some((n) => n.body === 'ici' && n.title === 'Liste (conflit)'));
    assert.equal(remoteCards().length, 2);
  });

  it('deletes a note remotely, and drops one deleted elsewhere', async () => {
    const a = await DT.createDoc(fake.t, 'A', 'a');
    const b = await DT.createDoc(fake.t, 'B', 'b');
    await sync.run();
    await sync.remove(a.id);
    assert.equal((await store.visible()).length, 1);
    await DT.deleteDoc(fake.t, b.id);
    await sync.run();
    assert.equal(remoteCards().length, 0);
    assert.equal((await store.all()).length, 0);
  });

  it('never sends an empty new note, and removes a local note that was never sent', async () => {
    await sync.save({ title: '', body: '' });
    const res = await sync.run();
    assert.equal(res.pending, 0);
    assert.equal(remoteCards().length, 0);
    const rec = await sync.save({ title: 'x', body: 'y' });
    await sync.remove(rec.id);
    assert.equal((await store.all()).length, 0);
  });

  it('keeps an edit when the note was deleted elsewhere', async () => {
    const doc = await DT.createDoc(fake.t, 'A', 'a');
    await sync.run();
    await DT.deleteDoc(fake.t, doc.id);
    await sync.save({ ...(await store.get(doc.id)), body: 'a2' });
    await sync.run();
    assert.equal(remoteCards().length, 1);
    assert.equal(DM.unpackDesc(remoteCards()[0].desc).body, 'a2');
  });
});
