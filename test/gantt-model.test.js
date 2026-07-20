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
    assert.equal(parent.children[1].kind, 'card');
    assert.equal(parent.children[1].cardId, 'child');
    assert.equal(parent.children[1].name, 'Child card');
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
});
