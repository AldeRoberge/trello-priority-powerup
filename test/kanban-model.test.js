'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('KanbanModel', () => {
  let KM;
  before(() => {
    loadComponent('shared/desc-meta.js');
    loadComponent('table/table-model.js');
    loadComponent('kanban/kanban-model.js');
    KM = global.KanbanModel;
    assert.ok(KM);
  });

  const lists = [
    { id: 'l1', name: 'À faire', category: 'unstarted' },
    { id: 'l2', name: 'En cours', category: 'started' },
    { id: 'l3', name: 'Terminé', category: 'completed' },
  ];
  const rows = [
    { id: 'a', listId: 'l2', pos: 20, name: 'Beta', category: '', statut: 'En cours', tier: '', desc: '' },
    { id: 'b', listId: 'l1', pos: 5, name: 'Alpha', category: '', statut: 'À faire', tier: '', desc: '' },
    { id: 'c', listId: 'l2', pos: 10, name: 'Gamma', category: '', statut: 'En cours', tier: '', desc: '' },
    { id: 'd', listId: 'l3', pos: 1, name: 'Delta', category: '', statut: 'Terminé', tier: '', desc: '' },
  ];

  it('makes one column per list in board order, cards sorted by pos', () => {
    const cols = KM.buildColumns(rows, lists);
    assert.deepEqual(cols.map((c) => c.list.id), ['l1', 'l2', 'l3']);
    assert.deepEqual(cols[1].cards.map((r) => r.id), ['c', 'a']);
  });

  it('filters cards but keeps every column and the real totals', () => {
    const cols = KM.buildColumns(rows, lists, { filter: 'alpha' });
    assert.equal(cols.length, 3);
    assert.deepEqual(cols.map((c) => c.cards.length), [1, 0, 0]);
    assert.equal(cols[1].total, 2);
  });

  it('hides cards of completed lists but keeps the column as a drop target', () => {
    const cols = KM.buildColumns(rows, lists, { hideDone: true });
    assert.equal(cols[2].cards.length, 0);
    assert.equal(cols[2].hidden, true);
    assert.equal(cols[2].total, 1);
  });

  it('lists the target siblings without the moved card, by pos', () => {
    assert.deepEqual(KM.siblingsFor(rows, 'l2', 'a').map((r) => r.id), ['c']);
    assert.deepEqual(KM.siblingsFor(rows, 'l2', 'zzz').map((r) => r.id), ['c', 'a']);
  });

  it('finds the insert index from the pointer position', () => {
    const rects = [{ top: 0, bottom: 40 }, { top: 48, bottom: 88 }];
    assert.equal(KM.insertIndex(rects, 10), 0);
    assert.equal(KM.insertIndex(rects, 30), 1);
    assert.equal(KM.insertIndex(rects, 80), 2);
    assert.equal(KM.insertIndex([], 5), 0);
  });
});
