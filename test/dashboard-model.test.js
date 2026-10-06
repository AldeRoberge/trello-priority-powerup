'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('DashboardModel', () => {
  let DM;
  before(() => {
    loadComponent('dashboard/dashboard-model.js');
    DM = global.DashboardModel;
    assert.ok(DM);
  });

  const row = (id, o) =>
    Object.assign({ id, statutKey: 'unstarted', pos: 1, priority: 5, due: '', start: '', estimate: 60, dueDone: false }, o);

  it('parseLines strips bullets, numbering, checkboxes and duplicates', () => {
    const out = DM.parseLines('- Appeler Paul\n1. Payer facture\n[ ] appeler paul\n\n  * Écrire rapport  \n- [x] Ranger');
    assert.deepEqual(out, ['Appeler Paul', 'Payer facture', 'Écrire rapport', 'Ranger']);
  });

  it('addDays / nextDays cross month ends', () => {
    assert.equal(DM.addDays('2026-10-31', 1), '2026-11-01');
    assert.deepEqual(DM.nextDays('2026-10-30', 3), ['2026-10-30', '2026-10-31', '2026-11-01']);
    assert.equal(DM.addDays('nope', 1), '');
  });

  it('triageQueue keeps only triage cards in board order', () => {
    const q = DM.triageQueue([row('a', { statutKey: 'triage', pos: 5 }), row('b'), row('c', { statutKey: 'triage', pos: 2 })]);
    assert.deepEqual(q.map((r) => r.id), ['c', 'a']);
  });

  it('unplanned excludes triage, done and dated cards, best priority first', () => {
    const rows = [
      row('a', { priority: 2 }),
      row('b', { priority: 9 }),
      row('c', { statutKey: 'triage' }),
      row('d', { statutKey: 'completed' }),
      row('e', { due: '2026-10-08' }),
      row('f', { dueDone: true }),
    ];
    assert.deepEqual(DM.unplanned(rows).map((r) => r.id), ['b', 'a']);
  });

  it('weekPlan carries late tasks on the first day and flags overload', () => {
    const rows = [
      row('late', { due: '2026-10-01', estimate: 120 }),
      row('t', { start: '2026-10-06', estimate: 300 }),
      row('n', { due: '2026-10-07', estimate: 60 }),
    ];
    const plan = DM.weekPlan(rows, '2026-10-06', 3, 360);
    assert.equal(plan.length, 3);
    assert.deepEqual(plan[0].tasks.map((r) => r.id), ['late', 't']);
    assert.equal(plan[0].used, 420);
    assert.equal(plan[0].over, true);
    assert.equal(plan[1].used, 60);
    assert.equal(plan[1].over, false);
  });

  it('autoPlan fills days by priority within capacity', () => {
    const rows = [
      row('a', { priority: 9, estimate: 240 }),
      row('b', { priority: 8, estimate: 240 }),
      row('c', { priority: 1, estimate: 60 }),
    ];
    const out = DM.autoPlan(rows, '2026-10-06', 3, 360);
    assert.deepEqual(out, [
      { id: 'a', date: '2026-10-06' },
      { id: 'b', date: '2026-10-07' },
      { id: 'c', date: '2026-10-06' },
    ]);
  });

  it('autoPlan puts an oversized task on an empty day and drops what does not fit', () => {
    const rows = [row('big', { priority: 9, estimate: 900 }), row('x', { priority: 5, estimate: 300 }), row('y', { priority: 4, estimate: 300 })];
    const out = DM.autoPlan(rows, '2026-10-06', 2, 360);
    assert.deepEqual(out, [
      { id: 'big', date: '2026-10-06' },
      { id: 'x', date: '2026-10-07' },
    ]);
  });

  it('autoPlan uses a default estimate and respects tasks already planned', () => {
    const rows = [row('p', { due: '2026-10-06', estimate: 330 }), row('q', { estimate: 0 })];
    const out = DM.autoPlan(rows, '2026-10-06', 2, 360);
    assert.deepEqual(out, [{ id: 'q', date: '2026-10-06' }]);
  });

  it('todayList puts late work before today', () => {
    const rows = [row('t', { due: '2026-10-06', priority: 9 }), row('l', { due: '2026-10-05', priority: 1 }), row('f', { due: '2026-10-07' })];
    assert.deepEqual(DM.todayList(rows, '2026-10-06').map((r) => r.id), ['l', 't']);
  });

  it('timeline stacks blocks from 09:00', () => {
    const tl = DM.timeline([row('a', { estimate: 90 }), row('b', { estimate: 30 })]);
    assert.deepEqual(tl, [
      { id: 'a', start: 540, end: 630 },
      { id: 'b', start: 630, end: 660 },
    ]);
    assert.equal(DM.hhmm(630), '10:30');
  });

  it('formatMinutes', () => {
    assert.equal(DM.formatMinutes(45), '45 min');
    assert.equal(DM.formatMinutes(120), '2 h');
    assert.equal(DM.formatMinutes(90), '1 h 30');
  });

  it('counts feeds the sidebar badges', () => {
    const rows = [row('a', { statutKey: 'triage' }), row('b'), row('c', { due: '2026-10-06' })];
    assert.deepEqual(DM.counts(rows, '2026-10-06'), { triage: 1, orchestrator: 1, today: 1 });
  });
});
