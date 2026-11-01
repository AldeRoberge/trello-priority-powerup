'use strict';

// The Triage progress bar sets its value on pointerdown and saves on release. When the browser takes the gesture
// for a scroll it sends pointercancel instead: that must put the value back and save nothing.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function node(tag) {
  return {
    tag,
    children: [],
    style: {},
    attrs: {},
    listeners: {},
    className: '',
    textContent: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); },
    getBoundingClientRect: () => ({ left: 0, width: 100 }),
    fire(type, evt) { (this.listeners[type] || []).slice().forEach((fn) => fn(Object.assign({ type, preventDefault() {}, stopPropagation() {} }, evt))); },
  };
}

function load() {
  const doc = node('document');
  doc.createElement = node;
  const win = { ProgressRing: { create: () => node('span'), set() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'components', 'dashboard', 'triage-tree.js'), 'utf8'), { window: win, document: doc });
  return { TT: win.TriageTree, doc };
}

function build(pct, saved) {
  const { TT, doc } = load();
  const cell = TT.progressEl(pct, { onSet: (v) => saved.push(v) });
  const bar = cell.children.find((c) => c.className === 'tt-prog-bar');
  const num = cell.children.find((c) => c.className === 'tt-prog-t');
  assert.ok(bar && num, 'the live progress cell has a bar and a percentage');
  return { bar, num, doc };
}

test('a drag on the bar sets the value live and saves it once on release', () => {
  const saved = [];
  const { bar, num, doc } = build(50, saved);
  bar.fire('pointerdown', { button: 0, clientX: 80 });
  assert.equal(num.textContent, '80%');
  doc.fire('pointermove', { clientX: 90 });
  assert.equal(num.textContent, '90%');
  assert.deepEqual(saved, [], 'nothing is saved while the finger is down');
  doc.fire('pointerup', { clientX: 90 });
  assert.deepEqual(saved, [90]);
  assert.equal((doc.listeners.pointermove || []).length, 0, 'the document listeners are removed');
});

test('a pointercancel (the page scrolled) restores the value and saves nothing', () => {
  const saved = [];
  const { bar, num, doc } = build(50, saved);
  bar.fire('pointerdown', { button: 0, clientX: 80 });
  assert.equal(num.textContent, '80%');
  doc.fire('pointercancel', {});
  assert.deepEqual(saved, [], 'a scroll must not change a task\'s progress');
  assert.equal(num.textContent, '50%');
  assert.equal((doc.listeners.pointercancel || []).length, 0, 'the document listeners are removed');
});

test('releasing on the value it already had saves nothing', () => {
  const saved = [];
  const { bar, doc } = build(50, saved);
  bar.fire('pointerdown', { button: 0, clientX: 50 });
  doc.fire('pointerup', {});
  assert.deepEqual(saved, []);
});
