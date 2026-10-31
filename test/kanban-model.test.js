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

describe('KanbanModel projects', () => {
  let KM;
  before(() => {
    loadComponent('shared/desc-meta.js');
    loadComponent('table/table-model.js');
    loadComponent('kanban/kanban-model.js');
    loadComponent('mindmap/mindmap-model.js');
    loadComponent('shared/work-os.js');
    KM = global.KanbanModel;
  });

  const lists = [
    { id: 'back', name: 'Backlog', category: 'backlog' },
    { id: 'todo', name: 'À faire', category: 'unstarted' },
    { id: 'doing', name: 'En cours', category: 'started' },
    { id: 'done', name: 'Terminé', category: 'completed' },
  ];

  it('puts a project in its saved column and keeps tasks of other columns as guests', () => {
    const rows = [
      { id: 'a', projectId: 'p1', listId: 'todo', pos: 1 },
      { id: 'b', projectId: 'p1', listId: 'doing', pos: 2 },
      { id: 'c', projectId: '', listId: 'back', pos: 1 },
    ];
    const projects = [{ id: 'p1', name: 'Lancement', listId: 'todo' }];
    const cols = KM.buildProjectColumns(rows, lists, projects);
    const todo = cols.filter((c) => c.list.id === 'todo')[0];
    const doing = cols.filter((c) => c.list.id === 'doing')[0];
    const back = cols.filter((c) => c.list.id === 'back')[0];
    assert.deepEqual(todo.blocks.map((b) => b.project.id), ['p1']);
    assert.deepEqual(todo.blocks[0].tasks.map((r) => r.id), ['a']);
    assert.equal(todo.blocks[0].guest, false);
    assert.equal(doing.blocks.length, 0);
    assert.deepEqual(doing.guests[0].tasks.map((r) => r.id), ['b']);
    assert.equal(doing.guests[0].guest, true);
    assert.deepEqual(back.loose.map((r) => r.id), ['c']);
  });

  it('follows the least-finished task when the project has no column yet', () => {
    const rows = [
      { id: 'a', projectId: 'p1', listId: 'done', pos: 1 },
      { id: 'b', projectId: 'p1', listId: 'doing', pos: 1 },
      { id: 'c', projectId: 'p1', listId: 'todo', pos: 1 },
    ];
    assert.equal(KM.projectListId({ id: 'p1' }, rows, lists), 'doing');
    const cols = KM.buildProjectColumns(rows, lists, [{ id: 'p1', name: 'Site' }]);
    const doing = cols.filter((c) => c.list.id === 'doing')[0];
    assert.deepEqual(doing.blocks[0].tasks.map((r) => r.id), ['b']);
    assert.equal(cols.filter((c) => c.list.id === 'todo')[0].guests[0].tasks[0].id, 'c');
  });

  it('parks an empty project in Backlog and keeps a saved column that still exists', () => {
    assert.equal(KM.projectListId({ id: 'p1', listId: 'gone' }, [], lists), 'back');
    assert.equal(KM.projectListId({ id: 'p1', listId: 'done' }, [], lists), 'done');
    const cols = KM.buildProjectColumns([], lists, [{ id: 'p1', name: 'Vide' }]);
    assert.equal(cols.filter((c) => c.list.id === 'back')[0].blocks[0].project.name, 'Vide');
  });

  it('remembers the project column on the goal map', () => {
    const goals = {
      nodes: [{ id: 'p1', level: 'project', name: 'Site', icon: { i: 'rocket', c: '#112233' } }],
      links: [],
    };
    const next = global.WorkOS.withProjectList(goals, 'p1', 'doing');
    const clean = global.MindmapModel.normalizeGoals(next);
    assert.equal(clean.nodes[0].listId, 'doing');
    assert.equal(clean.nodes[0].icon.i, 'rocket');
    const cleared = global.MindmapModel.normalizeGoals(global.WorkOS.withProjectList(clean, 'p1', ''));
    assert.equal(cleared.nodes[0].listId, undefined);
  });

  describe('card sort', () => {
    const l = [{ id: 'l1', name: 'A', category: 'unstarted' }];
    const r = [
      { id: 'a', listId: 'l1', pos: 1, name: 'a', priority: 3, progress: 10 },
      { id: 'b', listId: 'l1', pos: 2, name: 'b', priority: 8, progress: 90 },
      { id: 'c', listId: 'l1', pos: 3, name: 'c', progress: 50 },
    ];
    const ids = (o) => KM.buildColumns(r, l, o)[0].cards.map((x) => x.id).join('');
    it('keeps manual order by default', () => assert.equal(ids({}), 'abc'));
    it('sorts by priority, highest first, none last', () => assert.equal(ids({ sort: 'priority' }), 'bac'));
    it('sorts by progress, most complete first', () => assert.equal(ids({ sort: 'progress' }), 'bca'));
    it('sorts by place name, empty last', () => {
      const p = { a: 'Zoo', b: 'Alpha' };
      assert.equal(ids({ sort: 'place', placeOf: (x) => p[x.id] }), 'bac');
    });
  });

  describe('matchesSmart', () => {
    const row = { id: 'r', name: 'Appeler le garage', desc: 'Pneus à Val-d’Or', statutKey: 'started', due: '2026-11-03', items: [{ text: 'Apporter chèque à Kate' }] };
    const ctx = { today: '2026-10-31', placeOf: () => 'Chalet' };
    it('matches terms regardless of accents, case and punctuation', () => {
      assert.equal(KM.matchesSmart(row, { terms: ["val d'or"] }, ctx), true);
      assert.equal(KM.matchesSmart(row, { terms: ['VAL-D-OR'] }, ctx), true);
      assert.equal(KM.matchesSmart(row, { terms: ['kate'] }, ctx), true);
      assert.equal(KM.matchesSmart(row, { terms: ['chalet'] }, ctx), true);
      assert.equal(KM.matchesSmart(row, { terms: ['montreal'] }, ctx), false);
    });
    it('applies states and due window together', () => {
      assert.equal(KM.matchesSmart(row, { terms: ['kate'], states: ['unstarted'] }, ctx), false);
      assert.equal(KM.matchesSmart(row, { dueWithinDays: 3 }, ctx), true);
      assert.equal(KM.matchesSmart(row, { dueWithinDays: 2 }, ctx), false);
      assert.equal(KM.matchesSmart({ name: 'x' }, { dueWithinDays: 9 }, ctx), false);
    });
    it('never matches finished cards unless asked', () => {
      assert.equal(KM.matchesSmart({ name: 'kate', statutKey: 'completed' }, { terms: ['kate'] }, ctx), false);
    });
  });
});
