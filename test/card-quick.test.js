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

test('resizeRect grows from any corner and keeps the opposite corner', () => {
  var start = { left: 100, top: 80, width: 320, height: 200 };
  var se = CQ.resizeRect(start, 'se', 40, 30, 260, 160);
  assert.deepEqual(se, { left: 100, top: 80, width: 360, height: 230 });
  var nw = CQ.resizeRect(start, 'nw', -20, -10, 260, 160);
  assert.deepEqual(nw, { left: 80, top: 70, width: 340, height: 210 });
  var ne = CQ.resizeRect(start, 'ne', 10, 50, 260, 160);
  assert.equal(ne.left, 100);
  assert.equal(ne.width, 330);
  assert.equal(ne.height, 160, 'cannot shrink past the minimum');
  assert.equal(ne.top, 80 + (200 - 160), 'the bottom edge stays');
  var sw = CQ.resizeRect(start, 'sw', 200, 20, 260, 160);
  assert.equal(sw.width, 260);
  assert.equal(sw.left, 100 + 320 - 260, 'the right edge stays');
});

test('zoomAt keeps the point under the cursor', () => {
  var box = { left: 100, top: 50, width: 200, height: 100 };
  var at = CQ.zoomAt(box, 150, 80, 1, 2);
  assert.equal(at.scale, 2);
  assert.equal(at.left, 100, 'the center of the box stays when the cursor is there');
  assert.equal(at.top, 20);
  var corner = CQ.zoomAt(box, 100, 50, 1, 2);
  assert.equal(corner.left, 100);
  assert.equal(corner.top, 50, 'zooming on the top-left does not move that corner');
});
