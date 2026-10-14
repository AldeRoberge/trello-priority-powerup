'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');
const FakeTrello = require('../sandbox/e2e/fake-trello.js');

describe('document icon', () => {
  let DM;
  let DT;
  let fake;

  before(() => {
    loadComponent('docs/docs-model.js');
    loadComponent('docs/docs-trello.js');
    DM = global.DocsModel;
    DT = global.DocsTrello;
  });

  beforeEach(() => {
    fake = FakeTrello.create({ cards: [{ id: 'task1', name: 'Ouverte', idList: 'l1' }] });
    global.SheetsTrello = { trelloRest: fake.trelloRest };
  });

  it('stores a glyph and a color, and drops anything else', () => {
    const icon = { i: 'book', c: '#0c66e4' };
    const back = DM.unpackDesc(DM.packDesc('texte', { rev: 2, icon: icon }));
    assert.equal(back.body, 'texte');
    assert.deepEqual(back.icon, icon);
    assert.deepEqual(DM.normalizeIcon('book|#0c66e4'), icon);
    assert.deepEqual(DM.normalizeIcon('|#c9372c'), { c: '#c9372c' });
    assert.deepEqual(DM.normalizeIcon('cross'), { i: 'cross' });
    assert.equal(DM.normalizeIcon('not-an-icon|#ffffff'), null);
    assert.equal(DM.normalizeIcon(null), null);
    assert.equal(DM.unpackDesc(DM.packDesc('x', { rev: 1 })).icon, null);
  });

  it('searches icons by name or French keyword', () => {
    const hit = DM.searchDocIcons('église').map((x) => x.i);
    assert.ok(hit.indexOf('building-church') >= 0);
    assert.ok(DM.searchDocIcons('book').some((x) => x.i === 'book'));
    assert.equal(DM.searchDocIcons('zzzz').length, 0);
  });

  it('keeps the icon when the text or the cover is saved', async () => {
    const created = await DT.createDoc(fake.t, 'Psaume', 'v1', { icon: { i: 'book', c: '#0c66e4' } });
    const loaded = await DT.loadDoc(fake.t, created.id);
    assert.deepEqual(loaded.icon, { i: 'book', c: '#0c66e4' });
    await DT.saveDoc(fake.t, { id: created.id, body: 'v2', rev: loaded.rev, cover: loaded.cover });
    const afterBody = await DT.loadDoc(fake.t, created.id);
    assert.equal(afterBody.body, 'v2');
    assert.deepEqual(afterBody.icon, { i: 'book', c: '#0c66e4' });
    const painted = await DT.setIcon(fake.t, { id: created.id, rev: null }, { i: 'cross', c: '#c9372c' });
    assert.deepEqual(painted.icon, { i: 'cross', c: '#c9372c' });
    const listed = await DT.listDocs(fake.t);
    assert.deepEqual(listed.find((d) => d.id === created.id).icon, { i: 'cross', c: '#c9372c' });
    const cleared = await DT.setIcon(fake.t, { id: created.id, rev: painted.rev }, null);
    assert.equal(cleared.icon, null);
    assert.equal((await DT.loadDoc(fake.t, created.id)).icon, null);
  });
});
