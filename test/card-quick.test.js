'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const win = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', 'card-quick.js'), 'utf8'), { window: win });
const CQ = win.CardQuick;

test('CardQuick exposes the panel and its pure helpers', () => {
  assert.equal(typeof CQ.mount, 'function');
  assert.equal(typeof CQ.describe, 'function');
  assert.equal(typeof CQ.pctFromX, 'function');
});

test('describe: progress is clamped and a card without progress reads 0', () => {
  assert.equal(CQ.describe({ progress: 45 }, '2026-10-13').pct, 45);
  assert.equal(CQ.describe({ progress: 140 }, '2026-10-13').pct, 100);
  assert.equal(CQ.describe({ progress: -5 }, '2026-10-13').pct, 0);
  assert.equal(CQ.describe({ progress: null }, '2026-10-13').pct, 0);
});

test('describe: done = 100 % or a completed / canceled list; blocked follows the flag', () => {
  assert.equal(CQ.describe({ progress: 100 }).done, true);
  assert.equal(CQ.describe({ progress: 10, statutKey: 'completed' }).done, true);
  assert.equal(CQ.describe({ progress: 10, statutKey: 'canceled' }).done, true);
  assert.equal(CQ.describe({ progress: 10, statutKey: 'started' }).done, false);
  assert.equal(CQ.describe({ progress: 10, blocked: true }).blocked, true);
  assert.equal(CQ.describe({ progress: 10 }).blocked, false);
});

test('describe: overdue only for a past dated card that is not closed', () => {
  assert.equal(CQ.describe({ due: '2026-09-01', statutKey: 'started' }, '2026-10-13').overdue, true);
  assert.equal(CQ.describe({ due: '2026-09-01', statutKey: 'completed' }, '2026-10-13').overdue, false);
  assert.equal(CQ.describe({ due: '2026-10-13' }, '2026-10-13').overdue, false, 'today is not late');
  assert.equal(CQ.describe({ due: 'bientôt' }, '2026-10-13').overdue, false, 'a vague due date is never late');
  assert.equal(CQ.describe({ due: '' }, '2026-10-13').overdue, false);
});

test('describe: urgency tone and description presence', () => {
  assert.equal(CQ.describe({ urgency: 'Aucun' }).urgencyTone, 0);
  assert.equal(CQ.describe({ urgency: 'Au plus vite' }).urgencyTone, 4);
  assert.equal(CQ.describe({ urgency: 'Inconnue' }).urgencyTone, 0);
  assert.equal(CQ.describe({}).urgencyTone, null);
  assert.equal(CQ.describe({ desc: '  \n ' }).hasDesc, false);
  assert.equal(CQ.describe({ desc: 'Quelque chose' }).hasDesc, true);
});

test('pctFromX maps the pointer onto 0-100 and ignores a zero-width bar', () => {
  assert.equal(CQ.pctFromX(100, 200, 100, 7), 0);
  assert.equal(CQ.pctFromX(100, 200, 200, 7), 50);
  assert.equal(CQ.pctFromX(100, 200, 300, 7), 100);
  assert.equal(CQ.pctFromX(100, 200, 50, 7), 0, 'left of the bar');
  assert.equal(CQ.pctFromX(100, 200, 999, 7), 100, 'right of the bar');
  assert.equal(CQ.pctFromX(100, 0, 150, 7), 7, 'no width: keeps the current value');
});
