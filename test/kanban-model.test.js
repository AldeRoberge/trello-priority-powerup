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

  it('finds the column insert index from the pointer x', () => {
    const rects = [{ left: 0, right: 100 }, { left: 110, right: 210 }];
    assert.equal(KM.columnInsertIndex(rects, 20), 0);
    assert.equal(KM.columnInsertIndex(rects, 80), 1);
    assert.equal(KM.columnInsertIndex(rects, 200), 2);
    assert.equal(KM.columnInsertIndex([], 5), 0);
  });

  it('reorders lists without mutating the input', () => {
    const lists = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(KM.reorderLists(lists, 'c', 0).map((l) => l.id), ['c', 'a', 'b']);
    assert.deepEqual(KM.reorderLists(lists, 'a', 2).map((l) => l.id), ['b', 'c', 'a']);
    assert.deepEqual(KM.reorderLists(lists, 'b', 1).map((l) => l.id), ['a', 'b', 'c']);
    assert.deepEqual(KM.reorderLists(lists, 'zzz', 0).map((l) => l.id), ['a', 'b', 'c']);
    assert.deepEqual(lists.map((l) => l.id), ['a', 'b', 'c']);
  });

  it('filters blocked and overdue independently, and ignores a past date on a closed list', () => {
    const today = '2026-10-13';
    const extra = rows.concat([
      { id: 'e', listId: 'l1', pos: 2, name: 'Late', due: '2020-01-01', statutKey: 'unstarted', blocked: false },
      { id: 'f', listId: 'l2', pos: 3, name: 'Hold', due: '2026-12-01', statutKey: 'started', blocked: true },
      { id: 'g', listId: 'l3', pos: 2, name: 'Done late', due: '2020-01-01', statutKey: 'completed', blocked: true },
    ]);
    assert.equal(KM.isOverdueRow(extra[4], today), true);
    assert.equal(KM.isOverdueRow(extra[6], today), false);
    assert.equal(KM.isBlockedRow(extra[5]), true);
    const late = KM.buildColumns(extra, lists, { overdue: true, today });
    assert.deepEqual(late.map((c) => c.cards.map((r) => r.id)), [['e'], [], []]);
    const held = KM.buildColumns(extra, lists, { blocked: true, today });
    assert.deepEqual(held[1].cards.map((r) => r.id), ['f']);
    assert.deepEqual(held[2].cards.map((r) => r.id), ['g']);
    const both = KM.buildColumns(extra, lists, { blocked: true, overdue: true, today });
    assert.deepEqual(both.map((c) => c.cards.length), [0, 0, 0]);
    const counts = KM.facetCounts(KM.rowsInView(extra, lists, { hideDone: true }), today);
    assert.deepEqual(counts, { blocked: 1, overdue: 1 });
  });

  describe('priority rows (buildLanes)', () => {
    const tiered = [
      { id: 'a', listId: 'l2', pos: 20, name: 'Beta', tierI: 3 },
      { id: 'b', listId: 'l1', pos: 5, name: 'Alpha', tierI: 0 },
      { id: 'c', listId: 'l2', pos: 10, name: 'Gamma', tierI: 3 },
      { id: 'd', listId: 'l3', pos: 1, name: 'Delta', tierI: 6 },
      { id: 'e', listId: 'l1', pos: 8, name: 'Epsilon', tierI: null },
      { id: 'f', listId: 'l1', pos: 2, name: 'Zeta' },
    ];
    const laneIds = (model, key) => model.lanes.filter((l) => l.key === key)[0].cells.map((c) => c.cards.map((r) => r.id));

    it('maps a tier index to its row key, anything else to none', () => {
      assert.equal(KM.laneKey({ tierI: 0 }), 'tier:0');
      assert.equal(KM.laneKey({ tierI: 6 }), 'tier:6');
      assert.equal(KM.laneKey({ tierI: 7 }), 'none');
      assert.equal(KM.laneKey({ tierI: -1 }), 'none');
      assert.equal(KM.laneKey({ tierI: null }), 'none');
      assert.equal(KM.laneKey({}), 'none');
      assert.equal(KM.laneKey(null), 'none');
    });

    it('lists the seven tiers most urgent first, then Sans priorité', () => {
      const model = KM.buildLanes(tiered, lists);
      assert.deepEqual(model.lanes.map((l) => l.key), ['tier:0', 'tier:1', 'tier:2', 'tier:3', 'tier:4', 'tier:5', 'tier:6', 'none']);
      assert.deepEqual(model.lanes.map((l) => l.label), ['Critique', 'Urgente', 'Prioritaire', 'Importante', 'Flexible', 'Secondaire', 'Optionnelle', 'Sans priorité']);
    });

    it('keeps the board columns on the X axis and cuts each into rows, cards in pos order', () => {
      const model = KM.buildLanes(tiered, lists);
      assert.deepEqual(model.columns.map((c) => c.list.id), ['l1', 'l2', 'l3']);
      assert.ok(model.lanes.every((l) => l.cells.length === 3));
      assert.deepEqual(laneIds(model, 'tier:0'), [['b'], [], []]);
      assert.deepEqual(laneIds(model, 'tier:3'), [[], ['c', 'a'], []]);
      assert.deepEqual(laneIds(model, 'none'), [['f', 'e'], [], []]);
    });

    it('puts every visible card in exactly one row and counts them', () => {
      const model = KM.buildLanes(tiered, lists);
      const seen = model.lanes.reduce((all, l) => all.concat(l.cells.reduce((n, c) => n.concat(c.cards.map((r) => r.id)), [])), []);
      assert.deepEqual(seen.slice().sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
      assert.deepEqual(model.lanes.map((l) => l.count), [1, 0, 0, 2, 0, 0, 1, 2]);
    });

    it('applies the same filter and hide-done rules as the columns, and keeps empty rows', () => {
      const hidden = KM.buildLanes(tiered, lists, { hideDone: true });
      assert.equal(hidden.lanes.filter((l) => l.key === 'tier:6')[0].count, 0);
      assert.equal(hidden.columns[2].hidden, true);
      assert.equal(hidden.lanes.length, 8);
      const found = KM.buildLanes(tiered, lists, { filter: 'gamma' });
      assert.deepEqual(found.lanes.map((l) => l.count), [0, 0, 0, 1, 0, 0, 0, 0]);
    });

    it('takes tier names and colours from the caller', () => {
      const model = KM.buildLanes(tiered, lists, { tiers: [{ i: 0, label: 'Très urgent', color: '#c00' }] });
      assert.equal(model.lanes[0].label, 'Très urgent');
      assert.equal(model.lanes[0].color, '#c00');
      assert.equal(model.lanes[1].label, 'Urgente');
      assert.equal(model.lanes[1].color, '');
    });
  });
});
