'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('TodayModel', () => {
  let TM;
  let DM;
  before(() => {
    loadComponent('dashboard/dashboard-model.js');
    loadComponent('dashboard/today-model.js');
    TM = global.TodayModel;
    DM = global.DashboardModel;
    assert.ok(TM);
  });

  const TODAY = '2026-10-14';
  const at = (h, m) => h * 60 + (m || 0);
  const row = (id, o) =>
    Object.assign({
      id, name: id, statutKey: 'unstarted', pos: 1, priority: 5, due: '', start: '', estimate: 30,
      dueDone: false, blocked: false, startTime: '', dueTime: '', dueVague: '',
    }, o);
  /** A task planned today, optionally at a clock time. */
  const today = (id, o) => row(id, Object.assign({ due: TODAY, start: TODAY }, o || {}));
  const timed = (id, hhmm, o) => today(id, Object.assign({ startTime: hhmm, dueTime: hhmm }, o || {}));

  describe('words', () => {
    it('greets by the time of day, in Québec French', () => {
      assert.equal(TM.hello(new Date(2026, 9, 14, 7, 0)), 'Bon matin');
      assert.equal(TM.hello(new Date(2026, 9, 14, 12, 0)), 'Bon après-midi');
      assert.equal(TM.hello(new Date(2026, 9, 14, 17, 59)), 'Bon après-midi');
      assert.equal(TM.hello(new Date(2026, 9, 14, 18, 0)), 'Bonsoir');
      assert.equal(TM.hello(new Date(2026, 9, 14, 2, 0)), 'Bonsoir');
    });

    it('keeps a first name and drops anything that is not a name', () => {
      assert.equal(TM.firstName('Alexandre D. Roberge'), 'Alexandre');
      assert.equal(TM.firstName('Jean-Philippe Tremblay'), 'Jean-Philippe');
      assert.equal(TM.firstName('  Éloïse  '), 'Éloïse');
      assert.equal(TM.firstName('rotmg'), '');
      assert.equal(TM.firstName('user_42'), '');
      assert.equal(TM.firstName('alex@example.com'), '');
      assert.equal(TM.firstName(''), '');
      assert.equal(TM.firstName(null), '');
    });

    it('writes the day, the clock and the waiting time', () => {
      assert.equal(TM.dayTitle('2026-10-14'), 'mercredi 14 octobre');
      assert.equal(TM.dayTitle('2026-01-01'), 'jeudi 1 janvier');
      assert.equal(TM.dayTitle('nope'), '');
      assert.equal(TM.fmtClock(at(9)), '9 h');
      assert.equal(TM.fmtClock(at(14, 30)), '14 h 30');
      assert.equal(TM.fmtClock(at(14, 5)), '14 h 05');
      assert.equal(TM.fmtRange(at(9), at(9, 30)), '9 h à 9 h 30');
      assert.equal(TM.inWords(0), 'maintenant');
      assert.equal(TM.inWords(25), 'dans 25 min');
      assert.equal(TM.inWords(70), 'dans 1 h 10');
      assert.equal(TM.inWords(120), 'dans 2 h');
    });

    it('writes the distance from now with a sign', () => {
      assert.equal(TM.fmtOffset(-180), '-3 h');
      assert.equal(TM.fmtOffset(-50), '-50 min');
      assert.equal(TM.fmtOffset(75), '+1 h 15');
      assert.equal(TM.fmtOffset(15), '+15 min');
      assert.equal(TM.fmtOffset(0), 'Maintenant');
    });

    it('lists the times of a time menu, every half hour, on one level', () => {
      const slots = TM.timeSlots(6, 8);
      assert.deepEqual(slots.map((s) => s.time), ['06:00', '06:30', '07:00', '07:30', '08:00', '08:30']);
      assert.equal(slots[2].label, '7 h');
      assert.equal(slots[3].label, '7 h 30');
      assert.equal(slots[3].minute, at(7, 30));
      assert.equal(TM.timeSlots().length, 34);
      assert.equal(TM.timeSlots().pop().time, '22:30');
      assert.deepEqual(TM.timeSlots(9, 9, 15).map((s) => s.time), ['09:00', '09:15', '09:30']);
    });

    it('snaps and rounds on the 5-minute grid', () => {
      assert.equal(TM.snap(at(9, 7)), at(9, 5));
      assert.equal(TM.snap(at(9, 8)), at(9, 10));
      assert.equal(TM.ceilTo(at(14, 37)), at(14, 40));
      assert.equal(TM.ceilTo(at(14, 40)), at(14, 40));
      assert.equal(TM.toClock(at(9, 5)), '09:05');
      assert.equal(TM.toClock(2000), '23:59');
    });
  });

  describe('splitClock', () => {
    it('takes "à 15 h 30" off the end of a title', () => {
      assert.deepEqual(TM.splitClock('Dentiste à 15 h 30'), { name: 'Dentiste', time: '15:30' });
      assert.deepEqual(TM.splitClock('Dentiste à 15h30'), { name: 'Dentiste', time: '15:30' });
      assert.deepEqual(TM.splitClock('Dentiste à 15h'), { name: 'Dentiste', time: '15:00' });
      assert.deepEqual(TM.splitClock('Appel vers 9h'), { name: 'Appel', time: '09:00' });
      assert.deepEqual(TM.splitClock('Appel À 9:15'), { name: 'Appel', time: '09:15' });
      assert.deepEqual(TM.splitClock('Dîner à midi'), { name: 'Dîner', time: '12:00' });
    });

    it('reads a 24 h clock without a preposition', () => {
      assert.deepEqual(TM.splitClock('Rapport 14:00'), { name: 'Rapport', time: '14:00' });
    });

    it('leaves a bare "2h" alone, it is more likely a duration', () => {
      assert.equal(TM.splitClock('Rapport 2h'), null);
      assert.equal(TM.splitClock('Version 2.5'), null);
      assert.equal(TM.splitClock('Chapitre 3'), null);
    });

    it('refuses an impossible time and never leaves an empty name', () => {
      assert.equal(TM.splitClock('Appel à 25h'), null);
      assert.equal(TM.splitClock('Appel à 10h75'), null);
      assert.equal(TM.splitClock('à 15h'), null);
      assert.equal(TM.splitClock(''), null);
    });
  });

  describe('rowRange', () => {
    it('is null for a task without a time, on another day or on a vague horizon', () => {
      assert.equal(TM.rowRange(today('a'), TODAY), null);
      assert.equal(TM.rowRange(timed('b', '10:00', { due: '2026-10-15', start: '2026-10-15' }), TODAY), null);
      assert.equal(TM.rowRange(timed('c', '10:00', { dueVague: 'bientot' }), TODAY), null);
      assert.equal(TM.rowRange(null, TODAY), null);
    });

    it('lasts the estimate from its time (30 min when it has none)', () => {
      assert.deepEqual(TM.rowRange(timed('a', '14:00', { estimate: 45 }), TODAY), { start: at(14), end: at(14, 45), explicit: false });
      assert.deepEqual(TM.rowRange(timed('b', '14:00', { estimate: 0 }), TODAY), { start: at(14), end: at(14, 30), explicit: false });
    });

    it('is a span when the card gives a start and a later due time on the same day', () => {
      const r = today('m', { startTime: '10:00', dueTime: '11:30', estimate: 15 });
      assert.deepEqual(TM.rowRange(r, TODAY), { start: at(10), end: at(11, 30), explicit: true });
    });

    it('ignores a due time that belongs to another day of a range', () => {
      const r = row('r', { start: TODAY, due: '2026-10-16', dueTime: '09:00' });
      assert.equal(TM.rowRange(r, TODAY), null);
      const s = row('s', { start: TODAY, due: '2026-10-16', startTime: '13:00', dueTime: '09:00', estimate: 60 });
      assert.deepEqual(TM.rowRange(s, TODAY), { start: at(13), end: at(14), explicit: false });
    });

    it('uses a due time alone as the start (the orchestrator treats it the same way)', () => {
      const r = row('d', { due: TODAY, dueTime: '16:00', estimate: 30 });
      assert.deepEqual(TM.rowRange(r, TODAY), { start: at(16), end: at(16, 30), explicit: false });
    });

    it('stops at midnight', () => {
      const r = timed('late', '23:45', { estimate: 60 });
      assert.equal(TM.rowRange(r, TODAY).end, 1440);
    });
  });

  describe('flowPlan', () => {
    it('lays tasks one after the other from the start, in order', () => {
      const a = row('a', { estimate: 30 });
      const b = row('b', { estimate: 15 });
      const out = TM.flowPlan([], [a, b], { start: at(9) });
      assert.deepEqual(out.blocks.map((x) => [x.id, x.start, x.end]), [['a', at(9), at(9, 30)], ['b', at(9, 30), at(9, 45)]]);
      assert.equal(out.overflow.length, 0);
    });

    it('starts on the 5-minute grid and keeps it after an odd duration', () => {
      const out = TM.flowPlan([], [row('a', { estimate: 7 }), row('b', { estimate: 10 })], { start: at(14, 37) });
      assert.deepEqual(out.blocks.map((x) => [x.start, x.end]), [[at(14, 40), at(14, 47)], [at(14, 50), at(15)]]);
    });

    it('jumps over a fixed block instead of overlapping it', () => {
      const fixed = [{ start: at(9, 30), end: at(10, 30) }];
      const out = TM.flowPlan(fixed, [row('a', { estimate: 30 }), row('b', { estimate: 30 })], { start: at(9) });
      assert.deepEqual(out.blocks.map((x) => [x.id, x.start]), [['a', at(9)], ['b', at(10, 30)]]);
    });

    it('fills the gap before a fixed block with shorter tasks the best one is too long for', () => {
      const fixed = [{ start: at(9, 30), end: at(11) }];
      const out = TM.flowPlan(fixed, [row('big', { estimate: 120 }), row('s1', { estimate: 15 }), row('s2', { estimate: 15 })], { start: at(9) });
      assert.deepEqual(out.blocks.map((x) => [x.id, x.start]), [['s1', at(9)], ['s2', at(9, 15)], ['big', at(11)]]);
    });

    it('keeps best first when everything fits in order', () => {
      const out = TM.flowPlan([{ start: at(12), end: at(13) }], [row('a', { estimate: 60 }), row('b', { estimate: 30 }), row('c', { estimate: 30 })], { start: at(9) });
      assert.deepEqual(out.blocks.map((x) => x.id), ['a', 'b', 'c']);
    });

    it('does not squeeze a task into a gap that is too short', () => {
      const fixed = [{ start: at(9, 15), end: at(10) }];
      const out = TM.flowPlan(fixed, [row('big', { estimate: 30 })], { start: at(9) });
      assert.equal(out.blocks[0].start, at(10));
    });

    it('flags a block that starts after the end of the workday, not one that merely ends after it', () => {
      const evening = TM.flowPlan([], [row('a', { estimate: 60 })], { start: at(18) });
      assert.equal(evening.blocks[0].late, true);
      const edge = TM.flowPlan([], [row('b', { estimate: 60 })], { start: at(17, 30) });
      assert.equal(edge.blocks[0].late, false);
      const early = TM.flowPlan([], [row('c', { estimate: 60 })], { start: at(9) });
      assert.equal(early.blocks[0].late, false);
    });

    it('puts what cannot end before the limit in overflow, and still tries the next ones', () => {
      const out = TM.flowPlan([], [row('big', { estimate: 120 }), row('small', { estimate: 15 })], { start: at(20, 30), limit: at(22) });
      assert.deepEqual(out.overflow.map((r) => r.id), ['big']);
      assert.deepEqual(out.blocks.map((x) => x.id), ['small']);
    });

    it('uses the default estimate for a task without one', () => {
      const out = TM.flowPlan([], [row('a', { estimate: 0 })], { start: at(9) });
      assert.equal(out.blocks[0].end - out.blocks[0].start, DM.DEFAULT_ESTIMATE);
    });
  });

  describe('layoutLanes', () => {
    const blk = (id, s, e) => ({ id, start: s, end: e });

    it('gives a single block the whole width', () => {
      const [a] = TM.layoutLanes([blk('a', at(9), at(10))]);
      assert.deepEqual([a.lane, a.lanes], [0, 1]);
    });

    it('keeps back-to-back blocks in one lane: touching is not overlapping', () => {
      const list = TM.layoutLanes([blk('a', at(9), at(10)), blk('b', at(10), at(11))]);
      assert.deepEqual(list.map((b) => [b.lane, b.lanes]), [[0, 1], [0, 1]]);
    });

    it('puts overlapping blocks side by side', () => {
      const list = TM.layoutLanes([blk('a', at(9), at(11)), blk('b', at(10), at(12))]);
      assert.deepEqual(list.map((b) => [b.lane, b.lanes]), [[0, 2], [1, 2]]);
    });

    it('reuses a free lane and sizes every block of a cluster the same', () => {
      const list = TM.layoutLanes([
        blk('a', at(9), at(12)),
        blk('b', at(9, 30), at(10)),
        blk('c', at(10, 30), at(11)),
        blk('later', at(13), at(14)),
      ]);
      const by = {};
      list.forEach((b) => { by[b.id] = b; });
      assert.deepEqual([by.a.lane, by.b.lane, by.c.lane], [0, 1, 1]);
      assert.equal(by.a.lanes, 2);
      assert.equal(by.c.lanes, 2);
      assert.deepEqual([by.later.lane, by.later.lanes], [0, 1]);
    });
  });

  describe('elasticScale', () => {
    const blk = (s, e) => ({ start: s, end: e });

    it('is linear when every block is tall enough', () => {
      const sc = TM.elasticScale([blk(at(9), at(10))], { from: at(8), to: at(12), pxPerHour: 60, minBlockPx: 24 });
      assert.equal(sc.height, 240);
      assert.equal(sc.yOf(at(9)), 60);
      assert.equal(sc.yOf(at(10, 30)), 150);
    });

    it('gives a short block its minimum height and moves what follows down', () => {
      const sc = TM.elasticScale([blk(at(9), at(9, 5))], { from: at(8), to: at(12), pxPerHour: 60, minBlockPx: 24 });
      assert.ok(Math.abs(sc.yOf(at(9, 5)) - sc.yOf(at(9)) - 24) < 1e-9);
      assert.ok(sc.height > 240);
      assert.equal(sc.yOf(at(8)), 0);
    });

    it('never lets two short back-to-back blocks overlap', () => {
      const blocks = [blk(at(9), at(9, 5)), blk(at(9, 5), at(9, 10)), blk(at(9, 10), at(9, 25))];
      const sc = TM.elasticScale(blocks, { from: at(8), to: at(12), pxPerHour: 56, minBlockPx: 24 });
      blocks.forEach((b) => assert.ok(sc.yOf(b.end) - sc.yOf(b.start) >= 24 - 1e-9));
      assert.ok(sc.yOf(blocks[0].end) <= sc.yOf(blocks[1].start) + 1e-9);
      assert.ok(sc.yOf(blocks[1].end) <= sc.yOf(blocks[2].start) + 1e-9);
    });

    it('is monotonic and minOf inverts yOf', () => {
      const blocks = [blk(at(9), at(9, 10)), blk(at(11), at(11, 5))];
      const sc = TM.elasticScale(blocks, { from: at(8), to: at(14), pxPerHour: 56, minBlockPx: 24 });
      let prev = -1;
      for (let m = at(8); m <= at(14); m += 5) {
        const y = sc.yOf(m);
        assert.ok(y >= prev);
        prev = y;
        assert.ok(Math.abs(sc.minOf(y) - m) < 1e-6, 'round trip at ' + m);
      }
    });

    it('clamps outside the window', () => {
      const sc = TM.elasticScale([], { from: at(8), to: at(10), pxPerHour: 60 });
      assert.equal(sc.yOf(at(5)), 0);
      assert.equal(sc.yOf(at(23)), sc.height);
      assert.equal(sc.minOf(-50), at(8));
      assert.equal(sc.minOf(99999), at(10));
    });

    it('lists hour lines through yOf', () => {
      const sc = TM.elasticScale([blk(at(9), at(9, 5))], { from: at(8), to: at(11), pxPerHour: 60, minBlockPx: 24 });
      const ticks = sc.ticks(60);
      assert.deepEqual(ticks.map((t) => t.minute), [at(8), at(9), at(10), at(11)]);
      assert.equal(ticks[1].y, sc.yOf(at(9)));
      assert.ok(ticks.every((t) => t.hour));
    });

    it('survives an empty or inverted window', () => {
      const sc = TM.elasticScale([], { from: at(10), to: at(10) });
      assert.ok(sc.height > 0);
    });
  });

  describe('offRanges', () => {
    const WED = '2026-10-14'; // mercredi
    const FRI = '2026-10-16';
    const SAT = '2026-10-17';
    const SUN = '2026-10-18';

    it('strikes early morning and late afternoon on a weekday', () => {
      assert.deepEqual(TM.offRanges(WED, at(6), at(19)), [
        { start: at(6), end: TM.WORK_START },
        { start: TM.AFTERNOON_OFF, end: at(19) },
      ]);
      assert.equal(TM.WORK_START, at(8, 15));
      assert.equal(TM.AFTERNOON_OFF, at(16, 45));
    });

    it('strikes Friday from noon, and the whole weekend', () => {
      assert.deepEqual(TM.offRanges(FRI, at(6), at(19)), [
        { start: at(6), end: TM.WORK_START },
        { start: TM.FRIDAY_OFF, end: at(19) },
      ]);
      assert.equal(TM.FRIDAY_OFF, at(12));
      assert.deepEqual(TM.offRanges(SAT, at(8), at(18)), [{ start: at(8), end: at(18) }]);
      assert.deepEqual(TM.offRanges(SUN, at(8), at(18)), [{ start: at(8), end: at(18) }]);
    });

    it('drops a band that the window does not show, and treats a bad day as a weekday', () => {
      assert.deepEqual(TM.offRanges(WED, at(9), at(16)), []);
      assert.deepEqual(TM.offRanges(FRI, at(9), at(12)), []);
      assert.deepEqual(TM.offRanges('', at(6), at(19)), TM.offRanges(WED, at(6), at(19)));
      assert.deepEqual(TM.offRanges(WED, at(10), at(10)), []);
    });
  });

  describe('windowRange and freeGaps', () => {
    it('shows at least 6 h to 19 h, so early morning and late afternoon stay on screen', () => {
      assert.deepEqual(TM.windowRange([], null), { from: at(6), to: at(19) });
    });

    it('widens for blocks outside that and for the clock', () => {
      assert.deepEqual(TM.windowRange([{ start: at(6, 30), end: at(7) }, { start: at(19), end: at(21, 15) }], null), { from: at(6), to: at(22) });
      assert.equal(TM.windowRange([], at(20, 10)).to, at(22));
      assert.equal(TM.windowRange([], at(6, 30)).from, at(6));
      assert.equal(TM.windowRange([], at(2)).from, at(6));
    });

    it('lists free stretches of at least the asked length', () => {
      const blocks = [{ start: at(9), end: at(10) }, { start: at(10, 15), end: at(11) }, { start: at(13), end: at(14) }];
      const gaps = TM.freeGaps(blocks, at(8), at(15), 30);
      assert.deepEqual(gaps, [{ start: at(8), end: at(9) }, { start: at(11), end: at(13) }, { start: at(14), end: at(15) }]);
    });

    it('counts a block that started before the window and one that overlaps another', () => {
      const gaps = TM.freeGaps([{ start: at(7), end: at(9) }, { start: at(8, 30), end: at(10) }], at(8), at(12), 30);
      assert.deepEqual(gaps, [{ start: at(10), end: at(12) }]);
    });
  });

  describe('buildDay', () => {
    it('separates overdue, timed and untimed work and counts completed work planned today', () => {
      const rows = [
        row('late', { due: '2026-10-13', start: '2026-10-13', priority: 9 }),
        timed('meet', '10:00', { estimate: 60, priority: 4 }),
        today('plain', { priority: 6 }),
        today('done1', { statutKey: 'completed', dueDone: true }),
        today('done2', { statutKey: 'completed', dueDone: true }),
        today('cancelled', { statutKey: 'canceled' }),
        row('other-day', { due: '2026-10-20', start: '2026-10-20' }),
        row('triage', { statutKey: 'triage', due: TODAY, start: TODAY }),
      ];
      const day = TM.buildDay(rows, { today: TODAY, nowMin: at(8, 10), capacity: 360 });
      assert.deepEqual(day.overdue.map((r) => r.id), ['late']);
      assert.deepEqual(day.planned.map((r) => r.id), ['meet', 'plain']);
      assert.deepEqual(day.done.map((r) => r.id).sort(), ['done1', 'done2']);
      assert.equal(day.stats.open, 3);
      assert.equal(day.stats.done, 2);
      assert.equal(day.stats.total, 5);
      assert.equal(day.stats.pct, 40);
      assert.equal(day.stats.overdue, 1);
      assert.equal(day.stats.timed, 1);
      assert.equal(day.stats.minutes, 30 + 60 + 30);
      assert.equal(day.stats.remaining, 360 - 120);
      assert.equal(day.stats.over, false);
    });

    it('starts the flow at 9 h before the workday and at the next 5 minutes after', () => {
      const rows = [today('a', { estimate: 30 })];
      assert.equal(TM.buildDay(rows, { today: TODAY, nowMin: at(7, 12) }).flow[0].start, at(9));
      assert.equal(TM.buildDay(rows, { today: TODAY, nowMin: at(14, 37) }).flow[0].start, at(14, 40));
      assert.equal(TM.buildDay(rows, { today: TODAY, nowMin: null }).flow[0].start, at(9));
    });

    it('flows overdue work first and around the fixed blocks', () => {
      const rows = [
        today('plain', { priority: 6, estimate: 30 }),
        row('late', { due: '2026-10-13', start: '2026-10-13', startTime: '16:00', dueTime: '16:00', priority: 1, estimate: 30 }),
        timed('meet', '09:30', { estimate: 60 }),
      ];
      const day = TM.buildDay(rows, { today: TODAY, nowMin: at(8) });
      assert.deepEqual(day.fixed.map((b) => b.id), ['meet']);
      assert.deepEqual(day.flow.map((b) => [b.id, b.start]), [['late', at(9)], ['plain', at(10, 30)]]);
      assert.deepEqual(day.blocks.map((b) => b.id), ['late', 'meet', 'plain']);
    });

    it('keeps blocked work out of the flow but in the list', () => {
      const rows = [today('stuck', { blocked: true }), today('ok')];
      const day = TM.buildDay(rows, { today: TODAY, nowMin: at(9) });
      assert.deepEqual(day.flow.map((b) => b.id), ['ok']);
      assert.ok(day.planned.some((r) => r.id === 'stuck'));
      assert.equal(day.stats.blocked, 1);
    });

    it('lists what cannot fit before the limit as overflow', () => {
      const rows = [today('a', { estimate: 240 }), today('b', { estimate: 60 })];
      const day = TM.buildDay(rows, { today: TODAY, nowMin: at(19) });
      assert.deepEqual(day.overflow.map((r) => r.id), ['a']);
      assert.deepEqual(day.flow.map((b) => b.id), ['b']);
      assert.equal(day.flow[0].late, true);
    });

    it('flags a day that is over capacity', () => {
      const rows = [today('a', { estimate: 240 }), today('b', { estimate: 240 })];
      const day = TM.buildDay(rows, { today: TODAY, nowMin: at(9), capacity: 360 });
      assert.equal(day.stats.over, true);
      assert.equal(day.stats.remaining, 0);
    });

    it('widens the window for late blocks and for the clock', () => {
      const day = TM.buildDay([timed('x', '20:00', { estimate: 60 })], { today: TODAY, nowMin: at(7) });
      assert.equal(day.window.to, at(21));
      assert.equal(day.window.from, at(6));
    });

    it('gives overlapping fixed blocks their own lanes', () => {
      const rows = [timed('a', '10:00', { estimate: 60 }), timed('b', '10:30', { estimate: 60 })];
      const day = TM.buildDay(rows, { today: TODAY, nowMin: at(8) });
      assert.deepEqual(day.fixed.map((b) => b.lanes), [2, 2]);
    });

    it('treats a day that is not today as plain planning (no clock)', () => {
      const tomorrow = '2026-10-15';
      const day = TM.buildDay([row('a', { due: tomorrow, start: tomorrow })], { today: tomorrow, nowMin: null });
      assert.equal(day.flow[0].start, at(9));
      assert.equal(day.focus.state, 'soon');
    });

    it('keeps completed timed work apart, for the "show completed" view', () => {
      const rows = [timed('done', '09:00', { statutKey: 'completed', dueDone: true }), today('a')];
      const day = TM.buildDay(rows, { today: TODAY, nowMin: at(9, 10) });
      assert.deepEqual(day.doneBlocks.map((b) => b.id), ['done']);
      assert.deepEqual(day.blocks.map((b) => b.id), ['a']);
    });
  });

  describe('focus', () => {
    it('is the block under the clock, with how far along it is', () => {
      const rows = [timed('meet', '10:00', { estimate: 60 }), today('plain')];
      const f = TM.buildDay(rows, { today: TODAY, nowMin: at(10, 15) }).focus;
      assert.equal(f.row.id, 'meet');
      assert.equal(f.state, 'now');
      assert.equal(f.progress, 0.25);
    });

    it('is the next block, "soon" when it starts later', () => {
      const rows = [timed('meet', '15:00', { estimate: 60 })];
      const f = TM.buildDay(rows, { today: TODAY, nowMin: at(14, 10) }).focus;
      assert.equal(f.row.id, 'meet');
      assert.equal(f.state, 'soon');
      assert.equal(f.minutesTo, 50);
    });

    it('is "now" for the first flow block, which starts at the next 5 minutes', () => {
      const f = TM.buildDay([today('a'), today('b', { priority: 1 })], { today: TODAY, nowMin: at(11, 1) }).focus;
      assert.equal(f.row.id, 'a');
      assert.equal(f.state, 'now');
    });

    it('skips blocked work', () => {
      const rows = [today('stuck', { blocked: true, priority: 9 }), today('ok', { priority: 1 })];
      assert.equal(TM.buildDay(rows, { today: TODAY, nowMin: at(11) }).focus.row.id, 'ok');
    });

    it('falls back to the best open task, "late", when the clock has passed everything', () => {
      const rows = [timed('old', '08:00', { estimate: 30 })];
      const day = TM.buildDay(rows, { today: TODAY, nowMin: at(15) });
      assert.equal(day.focus.row.id, 'old');
      assert.equal(day.focus.state, 'late');
    });

    it('suggests backlog work when nothing is planned', () => {
      const rows = [row('idea', { priority: 8 })];
      const f = TM.buildDay(rows, { today: TODAY, nowMin: at(9) }).focus;
      assert.equal(f.row.id, 'idea');
      assert.equal(f.state, 'backlog');
    });

    it('is null on an empty board', () => {
      assert.equal(TM.buildDay([], { today: TODAY, nowMin: at(9) }).focus, null);
    });
  });

  describe('suggest and headline', () => {
    it('suggests unplanned, unblocked work best first and skips one id', () => {
      const rows = [row('a', { priority: 3 }), row('b', { priority: 8 }), row('c', { priority: 9, blocked: true }), today('planned')];
      assert.deepEqual(TM.suggest(rows, TODAY, 5).map((r) => r.id), ['b', 'a']);
      assert.deepEqual(TM.suggest(rows, TODAY, 5, 'b').map((r) => r.id), ['a']);
      assert.equal(TM.suggest(rows, TODAY, 1).length, 1);
    });

    it('says in one line how the day stands', () => {
      assert.equal(TM.headline({ total: 0, open: 0 }), 'Journée libre');
      assert.equal(TM.headline({ total: 3, open: 0 }), 'Tout est fait. Belle journée !');
      assert.equal(TM.headline({ total: 3, open: 1 }), '1 tâche à faire');
      assert.equal(TM.headline({ total: 3, open: 2 }), '2 tâches à faire');
      assert.equal(TM.headline(null), 'Journée libre');
    });
  });

  describe('widget board', () => {
    const L = () => TM.layout;
    const ids = (layout) => layout.items.map((it) => it.id);
    const item = (layout, id) => layout.items.filter((it) => it.id === id)[0];
    function overlaps(items) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          if (a.c < b.c + b.w && a.c + a.w > b.c && a.r < b.r + b.h && a.r + a.h > b.r) return true;
        }
      }
      return false;
    }

    it('starts with every widget, the clock beside the list, and nothing on top of anything', () => {
      const board = L().defaults();
      assert.deepEqual(ids(board).sort(), ['focus', 'hello', 'late', 'plan', 'review', 'sugg', 'tasks', 'weather']);
      const hello = item(board, 'hello');
      const weather = item(board, 'weather');
      assert.equal(hello.r, 0);
      assert.equal(weather.r, 0);
      assert.equal(hello.c + hello.w, weather.c);
      assert.equal(hello.w + weather.w, 12);
      const plan = item(board, 'plan');
      const focus = item(board, 'focus');
      assert.equal(plan.c, weather.c);
      assert.equal(plan.r, focus.r);
      assert.equal(overlaps(board.items), false);
      board.items.forEach((it) => {
        assert.ok(it.w >= L().MIN_W && it.c + it.w <= L().COLS);
        assert.ok(it.h >= L().MIN_H);
      });
    });

    it('keeps a saved board, drops what it does not know, and falls back when nothing was saved', () => {
      const saved = L().normalize({
        titles: { tasks: '  Mes tâches  ', nope: 'x', hello: '' },
        items: [
          { id: 'tasks', c: 0, r: 2, w: 20, h: 1 },
          { id: 'tasks', c: 1, r: 1, w: 4, h: 6 },
          { id: 'ghost', c: 0, r: 0, w: 4, h: 6 },
          { id: 'plan', c: 9, r: 0, w: 5, h: 8 },
        ],
      });
      assert.deepEqual(ids(saved), ['tasks', 'plan']);
      assert.equal(item(saved, 'tasks').w, 12);
      assert.equal(item(saved, 'tasks').h, L().MIN_H);
      assert.equal(item(saved, 'plan').c, 7);
      assert.equal(saved.titles.tasks, 'Mes tâches');
      assert.equal(saved.titles.hello, undefined);
      assert.equal(L().label(saved, 'tasks'), 'Mes tâches');
      assert.equal(L().label(saved, 'plan'), 'Planning');
      assert.deepEqual(ids(L().normalize(null)), ids(L().defaults()));
      assert.deepEqual(L().normalize({ items: [] }).items, []);
    });

    it('closes a widget and lets the one under it move up', () => {
      const board = L().defaults();
      const tasksR = item(board, 'tasks').r;
      const late = item(board, 'late');
      const closed = L().close(board, 'late');
      assert.equal(item(closed, 'late'), undefined);
      assert.ok(item(closed, 'tasks').r <= late.r);
      assert.ok(item(closed, 'tasks').r < tasksR);
      assert.equal(overlaps(closed.items), false);
      assert.equal(L().hidden(closed).some((w) => w.id === 'late'), true);
    });

    it('opens a closed widget without covering the others', () => {
      const closed = L().close(L().defaults(), 'review');
      const opened = L().open(closed, 'review');
      assert.ok(item(opened, 'review'));
      assert.equal(overlaps(opened.items), false);
      assert.equal(L().same(L().open(opened, 'review'), opened), true);
      assert.equal(L().open(opened, 'nope').items.length, opened.items.length);
    });

    it('gives the width it takes to the widget on its right', () => {
      const board = L().defaults();
      const grown = L().resize(board, 'hello', 9, null);
      assert.equal(item(grown, 'hello').w, 9);
      assert.equal(item(grown, 'weather').w, 3);
      assert.equal(item(grown, 'weather').c, 9);
      assert.equal(item(grown, 'hello').w + item(grown, 'weather').w, 12);
      const stuck = L().resize(grown, 'hello', 11, null);
      assert.equal(item(stuck, 'weather').w, L().MIN_W);
      assert.equal(item(stuck, 'hello').w, 12 - L().MIN_W);
    });

    it('pushes the widget below when one grows taller', () => {
      const board = L().defaults();
      const suggR = item(board, 'sugg').r;
      const taller = L().resize(board, 'tasks', null, item(board, 'tasks').h + 6);
      assert.equal(item(taller, 'tasks').h, item(board, 'tasks').h + 6);
      assert.ok(item(taller, 'sugg').r >= suggR);
      assert.equal(overlaps(taller.items), false);
      assert.equal(item(taller, 'tasks').r, item(board, 'tasks').r);
    });

    it('moves a widget and keeps the board free of overlaps', () => {
      const board = L().defaults();
      const moved = L().move(board, 'focus', 7, 0);
      const focus = item(moved, 'focus');
      assert.equal(focus.c + focus.w <= 12, true);
      assert.equal(overlaps(moved.items), false);
    });

    it('renames a widget and forgets a name that is blank or the original', () => {
      const named = L().rename(L().defaults(), 'plan', '  Horloge  ');
      assert.equal(L().label(named, 'plan'), 'Horloge');
      assert.equal(L().label(L().rename(named, 'plan', 'Planning'), 'plan'), 'Planning');
      assert.equal(L().label(L().rename(named, 'plan', '   '), 'plan'), 'Planning');
      const long = 'x'.repeat(80);
      assert.equal(L().rename(named, 'tasks', long).titles.tasks.length, 40);
    });

    it('stacks the open widgets on a narrow screen without saving that', () => {
      const board = L().defaults();
      const stacked = L().present(board, true);
      let r = 0;
      stacked.forEach((it) => {
        assert.equal(it.c, 0);
        assert.equal(it.w, 12);
        assert.equal(it.r, r);
        r += it.h;
      });
      assert.equal(L().same(board, L().defaults()), true);
      assert.deepEqual(L().present(board, false).map((it) => it.id), board.items.map((it) => it.id));
    });
  });
});
