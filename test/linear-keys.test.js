'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file) {
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', file), 'utf8'), {
    window: win,
    URL,
  });
  return win;
}

const LK = load('linear-keys.js').LinearKeys;

test('single keys map to the shared card actions', () => {
  assert.equal(LK.actionFor({ key: 's' }), 'status');
  assert.equal(LK.actionFor({ key: 'P' }), 'urgency');
  assert.equal(LK.actionFor({ key: 'd' }), 'due');
  assert.equal(LK.actionFor({ key: 'c' }), 'new');
});

test('other keys and modifier combinations are not shortcuts', () => {
  assert.equal(LK.actionFor({ key: 'x' }), null);
  assert.equal(LK.actionFor({ key: 's', ctrlKey: true }), null);
  assert.equal(LK.actionFor({ key: 'c', metaKey: true }), null);
  assert.equal(LK.actionFor({ key: 'd', shiftKey: true }), null);
  assert.equal(LK.actionFor({ key: 'p', altKey: true }), null);
  assert.equal(LK.actionFor(null), null);
});

test('urgency labels map to picker ids', () => {
  assert.equal(LK.LABEL_TO_ID.Vite, 'vite');
  assert.equal(LK.LABEL_TO_ID['Au plus vite'], 'au-plus-vite');
});
