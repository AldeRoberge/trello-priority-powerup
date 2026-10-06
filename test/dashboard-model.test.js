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

  describe('parseCapture', () => {
    const T = (a) => DM.captureToken(a);

    it('plain lines separated by blank lines are one task each, no description', () => {
      const out = DM.parseCapture('Appeler Paul\n\nPayer facture');
      assert.deepEqual(out.map((t) => [t.title, t.desc]), [['Appeler Paul', ''], ['Payer facture', '']]);
    });

    it('a list block becomes one task per item', () => {
      const out = DM.parseCapture('- Lait\n- Pain\n- Oeufs');
      assert.deepEqual(out.map((t) => t.title), ['Lait', 'Pain', 'Oeufs']);
    });

    it('bold and links keep their Markdown in the description, title is plain text', () => {
      const [t] = DM.parseCapture('Appeler **Paul** avant [le contrat](https://ex.com/c).');
      assert.equal(t.title, 'Appeler Paul avant le contrat.');
      assert.equal(t.desc, 'Appeler **Paul** avant [le contrat](https://ex.com/c).');
      assert.deepEqual(t.urls, ['https://ex.com/c']);
    });

    it('extra lines of a block are the description', () => {
      const [t] = DM.parseCapture('Réserver la salle\nCapacité 12 personnes\nPrévoir le café');
      assert.equal(t.title, 'Réserver la salle');
      assert.equal(t.desc, 'Capacité 12 personnes\n\nPrévoir le café');
    });

    it('a bare URL becomes a task titled after the site and keeps the link', () => {
      const [t] = DM.parseCapture('https://www.example.com/articles/42?utm=1');
      assert.equal(t.title, 'example.com/articles/42');
      assert.deepEqual(t.urls, ['https://www.example.com/articles/42?utm=1']);
      assert.ok(t.desc.includes('https://www.example.com'));
    });

    it('attachment tokens are removed from the text and listed', () => {
      const [t] = DM.parseCapture('Corriger ce bug ' + T('a1') + '\nvoir capture ' + T('a2'), { a1: 'x.png' });
      assert.equal(t.title, 'Corriger ce bug');
      assert.deepEqual(t.aids, ['a1', 'a2']);
      assert.equal(t.desc, 'voir capture');
    });

    it('a block with only an attachment is named after the file', () => {
      const out = DM.parseCapture(T('a1') + '\n\nAutre', { a1: 'Capture d’écran.png' });
      assert.equal(out[0].title, 'Capture d’écran');
      assert.deepEqual(out[0].aids, ['a1']);
      assert.equal(out[0].desc, '');
      assert.equal(out[1].title, 'Autre');
    });

    it('a long first line is cut at a word and kept whole in the description', () => {
      const long = ('mot '.repeat(60)).trim();
      const [t] = DM.parseCapture(long);
      assert.ok(t.title.length <= 141 && t.title.endsWith('…'));
      assert.equal(t.desc, long);
    });

    it('headings, quotes and escaped characters do not leak into titles', () => {
      const out = DM.parseCapture('## Titre\n\n> citation\n\nPrix 5\\.00 \\(taxes\\)');
      assert.deepEqual(out.map((t) => t.title), ['Titre', 'citation', 'Prix 5.00 (taxes)']);
      assert.equal(out[2].desc, '');
    });

    it('empty-paragraph markers are ignored and escaped bullets are stripped', () => {
      const out = DM.parseCapture('Un\n\n<!--blank-->\n\n\\- Lait\n\n2\\. Pain');
      assert.deepEqual(out.map((t) => [t.title, t.desc]), [['Un', ''], ['Lait', ''], ['Pain', '']]);
    });

    it('extractUrls dedupes and strips trailing punctuation', () => {
      assert.deepEqual(DM.extractUrls('voir https://a.io/x, puis https://a.io/x. et http://b.io'), ['https://a.io/x', 'http://b.io']);
    });
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

  it('nextAction prefers today\'s list (late first), else the best unplanned task', () => {
    const rows = [row('t', { due: '2026-10-06', priority: 9 }), row('l', { due: '2026-10-05', priority: 1 }), row('u', { priority: 8 })];
    assert.deepEqual(DM.nextAction(rows, '2026-10-06'), { row: rows[1], from: 'today' });
    const none = [row('u1', { priority: 3 }), row('u2', { priority: 8 }), row('done', { dueDone: true })];
    const n = DM.nextAction(none, '2026-10-06');
    assert.equal(n.row.id, 'u2');
    assert.equal(n.from, 'backlog');
    assert.equal(DM.nextAction([row('d', { dueDone: true })], '2026-10-06'), null);
  });

  it('suggestions lists the best unplanned work without repeating the next action', () => {
    const rows = [row('a', { priority: 9 }), row('b', { priority: 7 }), row('c', { priority: 5 }), row('x', { due: '2026-10-06' })];
    assert.deepEqual(DM.suggestions(rows, '2026-10-06', 5).map((r) => r.id), ['a', 'b', 'c']);
    const onlyBacklog = [row('a', { priority: 9 }), row('b', { priority: 7 })];
    assert.deepEqual(DM.suggestions(onlyBacklog, '2026-10-06', 5).map((r) => r.id), ['b']);
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
