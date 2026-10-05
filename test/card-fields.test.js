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

const CF = load('card-fields.js').CardFields;
const VT = load('view-tabs.js').ViewTabs;

test('CardFields exposes the field kinds shared by Table and Gantt', () => {
  assert.deepEqual([...CF.KINDS].sort(), ['blocked', 'desc', 'due', 'priority', 'progress']);
  assert.equal(CF.open('nope', { anchor: {} }), false);
  assert.equal(CF.open('desc', { anchor: {} }), false, 'desc needs a save callback');
  assert.equal(CF.open('progress', { anchor: {} }), false, 'card fields need t + cardId');
});

test('wrapSelection wraps and toggles inline markdown', () => {
  const r = CF.wrapSelection('hello world', 0, 5, '**');
  assert.equal(r.text, '**hello** world');
  assert.deepEqual([r.start, r.end], [2, 7]);
  const back = CF.wrapSelection(r.text, r.start, r.end, '**');
  assert.equal(back.text, 'hello world');
});

test('wrapSelection with an empty selection inserts a pair around the caret', () => {
  const r = CF.wrapSelection('ab', 1, 1, '_');
  assert.equal(r.text, 'a__b');
  assert.equal(r.start, 2);
});

test('formatLines prefixes / unprefixes every selected line', () => {
  const r = CF.formatLines('one\ntwo\nthree', 0, 7, '- ');
  assert.equal(r.text, '- one\n- two\nthree');
  const off = CF.formatLines(r.text, r.start, r.end, '- ');
  assert.equal(off.text, 'one\ntwo\nthree');
});

test('formatLines numbers lists and only touches the selected lines', () => {
  const r = CF.formatLines('a\nb\nc', 2, 5, '1.');
  assert.equal(r.text, 'a\n1. b\n2. c');
  const off = CF.formatLines(r.text, r.start, r.end, '1.');
  assert.equal(off.text, 'a\nb\nc');
});

test('ViewTabs.hrefFor keeps the Trello iframe context (search + hash)', () => {
  const loc = { href: 'https://x.github.io/app/table.html?a=1#%7B%22ctx%22%3A1%7D', search: '?a=1', hash: '#%7B%22ctx%22%3A1%7D' };
  assert.equal(VT.hrefFor('./gantt.html', loc), 'https://x.github.io/app/gantt.html?a=1#%7B%22ctx%22%3A1%7D');
  assert.deepEqual([...VT.VIEWS.map((v) => v.key)], ['gantt', 'table', 'kanban', 'docs', 'entities']);
});
