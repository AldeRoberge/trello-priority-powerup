'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const win = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'components', 'dashboard', 'triage-dnd.js'), 'utf8'), { window: win });
const D = win.TriageDnd;
const eq = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);

test('moveWithin puts the dragged id before or after the target', () => {
  eq(D.moveWithin(['a', 'b', 'c', 'd'], 'd', 'b', false), ['a', 'd', 'b', 'c']);
  eq(D.moveWithin(['a', 'b', 'c', 'd'], 'a', 'c', true), ['b', 'c', 'a', 'd']);
});

test('moveWithin leaves the list alone for unknown ids or a drop on itself', () => {
  eq(D.moveWithin(['a', 'b'], 'a', 'a', true), ['a', 'b']);
  eq(D.moveWithin(['a', 'b'], 'x', 'a', true), ['a', 'b']);
  eq(D.moveWithin(['a', 'b'], 'a', 'x', true), ['a', 'b']);
});

test('applyOrder follows the remembered order and keeps unknown items after, in their own order', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  eq(D.applyOrder(items, ['c', 'a'], (x) => x.id).map((x) => x.id), ['c', 'a', 'b', 'd']);
  eq(D.applyOrder(items, [], (x) => x.id).map((x) => x.id), ['a', 'b', 'c', 'd']);
  eq(D.applyOrder(items, ['zz', 'd'], (x) => x.id).map((x) => x.id), ['d', 'a', 'b', 'c']);
});

test('zoneOf splits a line in before / into / after, or before / after without a subtask drop', () => {
  assert.equal(D.zoneOf(0.1, true), 'before');
  assert.equal(D.zoneOf(0.5, true), 'into');
  assert.equal(D.zoneOf(0.9, true), 'after');
  assert.equal(D.zoneOf(0.4, false), 'before');
  assert.equal(D.zoneOf(0.6, false), 'after');
});
