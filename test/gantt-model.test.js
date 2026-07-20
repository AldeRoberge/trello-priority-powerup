'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('GanttModel', () => {
  let GanttModel;

  before(() => {
    loadComponent('gantt/gantt-model.js');
    GanttModel = global.GanttModel;
    assert.ok(GanttModel);
  });

  it('viewRange week spans Monday–Sunday around anchor', () => {
    const range = GanttModel.viewRange('week', '2026-07-22'); // Wednesday
    assert.equal(GanttModel.toIsoDate(range.start), '2026-07-20');
    assert.equal(GanttModel.toIsoDate(range.end), '2026-07-26');
    assert.equal(range.columns.length, 7);
  });

  it('viewRange month covers full calendar month', () => {
    const range = GanttModel.viewRange('month', '2026-07-15');
    assert.equal(GanttModel.toIsoDate(range.start), '2026-07-01');
    assert.equal(GanttModel.toIsoDate(range.end), '2026-07-31');
    assert.equal(range.columns.length, 31);
  });

  it('viewRange year has 12 month columns', () => {
    const range = GanttModel.viewRange('year', '2026-07-15');
    assert.equal(GanttModel.toIsoDate(range.start), '2026-01-01');
    assert.equal(GanttModel.toIsoDate(range.end), '2026-12-31');
    assert.equal(range.columns.length, 12);
  });

  it('resolveBarInterval uses start→due when both set', () => {
    const iv = GanttModel.resolveBarInterval({
      startDate: '2026-07-01',
      dueDate: '2026-07-10',
    });
    assert.equal(GanttModel.toIsoDate(iv.start), '2026-07-01');
    assert.equal(GanttModel.toIsoDate(iv.end), '2026-07-10');
  });

  it('resolveBarInterval due-only is one day without estimate', () => {
    const iv = GanttModel.resolveBarInterval({ dueDate: '2026-07-10' });
    assert.equal(GanttModel.toIsoDate(iv.start), '2026-07-10');
    assert.equal(GanttModel.toIsoDate(iv.end), '2026-07-10');
  });

  it('resolveBarInterval due-only backdates by estimated minutes', () => {
    // 3 days of work → start = due - 2
    const iv = GanttModel.resolveBarInterval({
      dueDate: '2026-07-10',
      estimatedMinutes: 3 * 24 * 60,
    });
    assert.equal(GanttModel.toIsoDate(iv.start), '2026-07-08');
    assert.equal(GanttModel.toIsoDate(iv.end), '2026-07-10');
  });

  it('resolveBarInterval start-only is one day', () => {
    const iv = GanttModel.resolveBarInterval({ startDate: '2026-07-05' });
    assert.equal(GanttModel.toIsoDate(iv.start), '2026-07-05');
    assert.equal(GanttModel.toIsoDate(iv.end), '2026-07-05');
  });

  it('resolveBarInterval returns null without dates', () => {
    assert.equal(GanttModel.resolveBarInterval({}), null);
  });

  it('dateToX / xToDate round-trip within week', () => {
    const range = GanttModel.viewRange('week', '2026-07-22');
    const width = 700;
    const mid = GanttModel.parseIsoDate('2026-07-23');
    const x = GanttModel.dateToX(mid, range, width);
    const back = GanttModel.xToDate(x, range, width);
    assert.equal(GanttModel.toIsoDate(back), '2026-07-23');
  });

  it('xToDate maps each day column without half-day hover offset', () => {
    const range = GanttModel.viewRange('week', '2026-07-22');
    const width = 700;
    const dayW = width / 7;
    // Late in Thursday's column must stay Thursday (not round into Friday).
    const lateThu = GanttModel.xToDate(3 * dayW + dayW * 0.85, range, width);
    assert.equal(GanttModel.toIsoDate(lateThu), '2026-07-23');
    const earlyFri = GanttModel.xToDate(4 * dayW + 1, range, width);
    assert.equal(GanttModel.toIsoDate(earlyFri), '2026-07-24');
  });

  it('snapDate year snaps to month start', () => {
    const snapped = GanttModel.snapDate('2026-07-18', 'year');
    assert.equal(GanttModel.toIsoDate(snapped), '2026-07-01');
  });

  it('shiftInterval and resizeInterval', () => {
    const iv = GanttModel.resolveBarInterval({
      startDate: '2026-07-01',
      dueDate: '2026-07-05',
    });
    const shifted = GanttModel.shiftInterval(iv, 2);
    assert.equal(GanttModel.toIsoDate(shifted.start), '2026-07-03');
    assert.equal(GanttModel.toIsoDate(shifted.end), '2026-07-07');

    const resized = GanttModel.resizeInterval(iv, 'end', 3);
    assert.equal(GanttModel.toIsoDate(resized.start), '2026-07-01');
    assert.equal(GanttModel.toIsoDate(resized.end), '2026-07-08');
  });

  it('buildNestTree nests linked cards and local items; dedupes linked from roots', () => {
    const tree = GanttModel.buildNestTree([
      {
        id: 'parent',
        name: 'Parent',
        dueDate: '2026-07-20',
        items: [
          { id: 'l1', text: 'Local A', progress: 40 },
          { id: 'lk', text: 'Child link', linkedCardId: 'child', progress: 10 },
        ],
      },
      {
        id: 'child',
        name: 'Child card',
        startDate: '2026-07-18',
        dueDate: '2026-07-19',
        items: [],
      },
      {
        id: 'other',
        name: 'Standalone',
        dueDate: '2026-07-22',
        items: [],
      },
    ]);

    const rootIds = tree.map((n) => n.cardId).sort();
    assert.deepEqual(rootIds, ['other', 'parent']);

    const parent = tree.find((n) => n.cardId === 'parent');
    assert.ok(parent);
    assert.equal(parent.children.length, 2);
    assert.equal(parent.children[0].kind, 'local');
    assert.equal(parent.children[0].name, 'Local A');
    assert.equal(parent.children[0].parentCardId, 'parent');
    assert.equal(parent.children[0].itemId, 'l1');
    assert.equal(parent.children[1].kind, 'card');
    assert.equal(parent.children[1].cardId, 'child');
    assert.equal(parent.children[1].name, 'Child card');
    assert.equal(parent.children[1].linkParentCardId, 'parent');
    assert.equal(parent.children[1].linkItemId, 'lk');
  });

  it('buildNestTree attaches checklist parentItemId', () => {
    const tree = GanttModel.buildNestTree([
      {
        id: 'p',
        name: 'P',
        items: [
          {
            id: 'sub',
            text: 'Sub',
            progress: 50,
            items: [{ id: 'c1', text: 'Check', progress: 0 }],
          },
        ],
      },
    ]);
    const local = tree[0].children[0];
    assert.equal(local.kind, 'local');
    assert.equal(local.children[0].kind, 'checklist');
    assert.equal(local.children[0].parentCardId, 'p');
    assert.equal(local.children[0].parentItemId, 'sub');
    assert.equal(local.children[0].itemId, 'c1');
  });

  it('flattenVisible expands root children by default', () => {
    const tree = GanttModel.buildNestTree([
      {
        id: 'p',
        name: 'P',
        items: [{ id: 'a', text: 'Sub', progress: 0 }],
      },
    ]);
    const flat = GanttModel.flattenVisible(tree, {});
    assert.equal(flat.length, 2);
    assert.equal(flat[0].kind, 'card');
    assert.equal(flat[1].kind, 'local');
  });

  it('sortTreeRoots by priority puts higher priority first', () => {
    const tree = GanttModel.buildNestTree([
      {
        id: 'low',
        name: 'Low',
        dueDate: '2026-07-01',
        priorityRankTier: 5,
        priorityRankScore: 2,
      },
      {
        id: 'high',
        name: 'High',
        dueDate: '2026-07-20',
        priorityRankTier: 0,
        priorityRankScore: 9.5,
      },
      {
        id: 'mid',
        name: 'Mid',
        dueDate: '2026-07-10',
        priorityRankTier: 2,
        priorityRankScore: 6,
      },
    ]);
    const byPriority = GanttModel.sortTreeRoots(tree, 'priority');
    assert.deepEqual(
      byPriority.map((n) => n.cardId),
      ['high', 'mid', 'low']
    );
    const byDate = GanttModel.sortTreeRoots(tree, 'date');
    assert.deepEqual(
      byDate.map((n) => n.cardId),
      ['low', 'mid', 'high']
    );
  });

  it('sortTreeRoots by name is alphabetical', () => {
    const tree = GanttModel.buildNestTree([
      { id: 'b', name: 'Bravo', dueDate: '2026-07-01' },
      { id: 'a', name: 'Alpha', dueDate: '2026-07-20' },
      { id: 'c', name: 'Charlie', dueDate: '2026-07-10' },
    ]);
    const byName = GanttModel.sortTreeRoots(tree, 'name');
    assert.deepEqual(
      byName.map((n) => n.cardId),
      ['a', 'b', 'c']
    );
  });

  it('shiftAnchor moves week/month/year windows', () => {
    assert.equal(
      GanttModel.toIsoDate(GanttModel.shiftAnchor('week', '2026-07-22', 1)),
      '2026-07-29'
    );
    assert.equal(
      GanttModel.toIsoDate(GanttModel.shiftAnchor('month', '2026-07-15', -1)),
      '2026-06-01'
    );
    assert.equal(
      GanttModel.toIsoDate(GanttModel.shiftAnchor('year', '2026-07-15', 1)),
      '2027-07-01'
    );
  });

  it('intervalToParts and barGeometry cover visible range', () => {
    const iv = GanttModel.resolveBarInterval({
      startDate: '2026-07-22',
      dueDate: '2026-07-24',
    });
    assert.deepEqual(GanttModel.intervalToParts(iv), {
      startDate: '2026-07-22',
      dueDate: '2026-07-24',
    });
    const range = GanttModel.viewRange('week', '2026-07-22');
    const geo = GanttModel.barGeometry(iv, range, 700);
    assert.ok(geo.visible);
    assert.ok(geo.width > 0);
    assert.equal(GanttModel.rangeDayCount(range), 7);
  });

  it('resolveBarInterval swaps inverted start/due', () => {
    const iv = GanttModel.resolveBarInterval({
      startDate: '2026-07-10',
      dueDate: '2026-07-01',
    });
    assert.equal(GanttModel.toIsoDate(iv.start), '2026-07-01');
    assert.equal(GanttModel.toIsoDate(iv.end), '2026-07-10');
  });

  it('orderedInterval orders paint drag endpoints either way', () => {
    const forward = GanttModel.orderedInterval('2026-07-20', '2026-07-23');
    assert.equal(GanttModel.toIsoDate(forward.start), '2026-07-20');
    assert.equal(GanttModel.toIsoDate(forward.end), '2026-07-23');
    const backward = GanttModel.orderedInterval('2026-07-23', '2026-07-20');
    assert.equal(GanttModel.toIsoDate(backward.start), '2026-07-20');
    assert.equal(GanttModel.toIsoDate(backward.end), '2026-07-23');
    assert.equal(GanttModel.orderedInterval(null, '2026-07-20'), null);
  });

  it('selectAllCheckboxState covers empty / partial / all', () => {
    assert.deepEqual(GanttModel.selectAllCheckboxState(0, 0), {
      checked: false,
      indeterminate: false,
    });
    assert.deepEqual(GanttModel.selectAllCheckboxState(0, 5), {
      checked: false,
      indeterminate: false,
    });
    assert.deepEqual(GanttModel.selectAllCheckboxState(2, 5), {
      checked: false,
      indeterminate: true,
    });
    assert.deepEqual(GanttModel.selectAllCheckboxState(5, 5), {
      checked: true,
      indeterminate: false,
    });
  });

  it('filterRows hides completed and undated when asked', () => {
    const rows = [
      { id: '1', done: true, dueDate: '2026-07-01' },
      { id: '2', done: false, dueDate: '2026-07-02' },
      { id: '3', done: false },
      { id: '4', category: 'completed', dueDate: '2026-07-03' },
    ];
    assert.deepEqual(
      GanttModel.filterRows(rows, { hideCompleted: true }).map((r) => r.id),
      ['2', '3']
    );
    assert.deepEqual(
      GanttModel.filterRows(rows, { hideUndated: true }).map((r) => r.id),
      ['1', '2', '4']
    );
  });

  it('flattenVisible respects collapsed expandable roots', () => {
    const tree = GanttModel.buildNestTree([
      {
        id: 'p',
        name: 'P',
        items: [{ id: 'a', text: 'Sub', progress: 0 }],
      },
    ]);
    const collapsed = GanttModel.flattenVisible(tree, { [tree[0].id]: false });
    assert.equal(collapsed.length, 1);
    assert.equal(collapsed[0].kind, 'card');
  });

  it('collectSubtreeIds includes master and nested subtasks', () => {
    const tree = GanttModel.buildNestTree([
      {
        id: 'p',
        name: 'Parent',
        items: [
          {
            id: 'sub',
            text: 'Sub',
            progress: 0,
            items: [{ id: 'c1', text: 'Check', progress: 0 }],
          },
          { id: 'lk', text: 'Child', linkedCardId: 'child', progress: 0 },
        ],
      },
      {
        id: 'child',
        name: 'Child card',
        items: [],
      },
    ]);
    const parent = GanttModel.findNodeById(tree, 'card:p');
    assert.ok(parent);
    assert.deepEqual(GanttModel.collectSubtreeIds(parent).sort(), [
      'card:child',
      'card:p',
      'check:c1',
      'local:sub',
    ]);
    assert.equal(GanttModel.findNodeById(tree, 'missing'), null);
  });

  it('snapDate week keeps day; xToDate clamps to range', () => {
    assert.equal(
      GanttModel.toIsoDate(GanttModel.snapDate('2026-07-18', 'week')),
      '2026-07-18'
    );
    const range = GanttModel.viewRange('week', '2026-07-22');
    const last = GanttModel.xToDate(9999, range, 700);
    assert.equal(GanttModel.toIsoDate(last), '2026-07-26');
    const first = GanttModel.xToDate(-10, range, 700);
    assert.equal(GanttModel.toIsoDate(first), '2026-07-20');
  });
});
