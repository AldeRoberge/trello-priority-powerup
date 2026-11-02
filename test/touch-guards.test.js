'use strict';

// Touch guards of view-shell.js: the long-press menu must leave text fields to the phone's own menu (caret, selection,
// paste), and a pinch-zoom must not squash the layout (--vvh).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { node, createDocument, createTimers } = require('./helpers/fake-dom');

function load(extra) {
  const doc = createDocument();
  doc.documentElement = Object.assign(node('html'), { clientHeight: 700 });
  const timers = createTimers();
  const win = Object.assign(
    {
      document: doc,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      addEventListener() {},
      removeEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      innerHeight: 700,
      innerWidth: 390,
    },
    extra
  );
  class MouseEvent {
    constructor(type, init) { this.type = type; Object.assign(this, init); }
  }
  const ctx = vm.createContext({ window: win, document: doc, MouseEvent });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', 'view-shell.js'), 'utf8'), ctx);
  return { win, doc, timers, VS: win.ViewShell };
}

/** A touch target that records the events dispatched on it; `closest` answers the editable selector like a browser. */
function target(tag, attrs) {
  const el = node(tag);
  Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
  el.events = [];
  el.dispatchEvent = (e) => { el.events.push(e.type); return true; };
  el.closest = (sel) => {
    const parts = sel.split(',').map((s) => s.trim());
    if (parts.includes(tag)) return el;
    if (el.getAttribute('contenteditable') === 'true' && parts.includes('[contenteditable="true"]')) return el;
    return null;
  };
  return el;
}

const touch = (x, y) => ({ touches: [{ clientX: x, clientY: y }] });

test('long-press: a hold on a card still opens the app menu (a synthetic contextmenu after 480 ms)', () => {
  const { doc, timers } = load();
  const card = target('div');
  doc.fire('touchstart', Object.assign(touch(10, 20), { target: card }));
  timers.run(479);
  assert.deepEqual(card.events, []);
  timers.run(480);
  assert.deepEqual(card.events, ['contextmenu']);
});

test('long-press: a hold on a text field is left to the phone (no app menu over the caret / paste bubble)', () => {
  for (const [tag, attrs] of [['input'], ['textarea'], ['select'], ['div', { contenteditable: 'true' }]]) {
    const { doc, timers } = load();
    const field = target(tag, attrs);
    doc.fire('touchstart', Object.assign(touch(10, 20), { target: field }));
    assert.equal(timers.count(), 0, tag + ': no timer is armed');
    timers.run(10000);
    assert.deepEqual(field.events, [], tag + ': no contextmenu');
  }
});

test('long-press: it asks ContextMenu what an editable target is when that module is loaded', () => {
  const { doc, timers } = load({ ContextMenu: { isNativeEditableTarget: (el) => el && el.tag === 'section' } });
  const odd = target('section');
  doc.fire('touchstart', Object.assign(touch(1, 1), { target: odd }));
  assert.equal(timers.count(), 0);
  const plain = target('div');
  doc.fire('touchstart', Object.assign(touch(1, 1), { target: plain }));
  timers.run(480);
  assert.deepEqual(plain.events, ['contextmenu']);
});

test('long-press: moving the finger cancels it, as before', () => {
  const { doc, timers } = load();
  const card = target('div');
  doc.fire('touchstart', Object.assign(touch(10, 20), { target: card }));
  doc.fire('touchmove', touch(10, 80));
  timers.run(10000);
  assert.deepEqual(card.events, []);
});

test('viewportHeight: a pinch-zoom (scale 2) does not halve the height, the keyboard still shrinks it', () => {
  assert.equal(load({ visualViewport: { height: 400, scale: 2 } }).VS.viewportHeight(), 800, 'zoomed: 400 x 2');
  assert.equal(load({ visualViewport: { height: 700, scale: 1 } }).VS.viewportHeight(), 700, 'no zoom, no keyboard');
  assert.equal(load({ visualViewport: { height: 420, scale: 1 } }).VS.viewportHeight(), 420, 'keyboard up (scale 1): the layout follows');
});

test('viewportHeight: a missing scale counts as 1, and with no visualViewport it is the window height', () => {
  assert.equal(load({ visualViewport: { height: 500 } }).VS.viewportHeight(), 500);
  assert.equal(load().VS.viewportHeight(), 700);
});

/* ── Hover-only controls stay reachable on touch ─────────────────────────── */

/** The text between the braces of the first `@media (hover: none)` block of a stylesheet. */
function hoverNoneBlock(file) {
  const css = fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const at = css.indexOf('@media (hover: none)');
  assert.ok(at >= 0, file + ' has a (hover: none) block');
  let depth = 0;
  let i = css.indexOf('{', at);
  const start = i + 1;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) break;
  }
  return css.slice(start, i);
}

test('hover-only controls of the card views are shown, quietly, on touch (view-shell.css)', () => {
  const block = hoverNoneBlock('view-shell.css');
  for (const cls of ['.tt-add', '.kb-ai-toggle', '.gantt-bar-clear', '.td-pin']) {
    assert.ok(block.includes(cls), cls + ' is revealed');
  }
  assert.match(block, /opacity:\s*0\.55\s*!important/);
  assert.match(block, /pointer-events:\s*auto\s*!important/);
});

test('the assistant message controls (copy, edit, thumbs) are shown on touch (touch-base.css, the Assistant and Tâche pages)', () => {
  const block = hoverNoneBlock('touch-base.css');
  for (const cls of ['.agent-msg-copy', '.agent-msg-edit', '.agent-msg-feedback']) {
    assert.ok(block.includes(cls), cls + ' is revealed');
  }
  assert.match(block, /max-width:\s*26px\s*!important/, 'the collapsed user-message buttons get their width back');
});

test('every control revealed on touch really is hidden by its own base rule (the list cannot go stale)', () => {
  const owners = {
    '.tt-add': 'dashboard/triage-tree.css',
    '.kb-ai-toggle': 'kanban/kanban-ui.css',
    '.gantt-bar-clear': 'gantt/gantt-ui.css',
    '.td-pin': 'dashboard/today-ui.css',
    '.agent-msg-feedback': 'agent/agent-ui.css',
  };
  for (const [cls, file] of Object.entries(owners)) {
    const css = fs.readFileSync(path.join(__dirname, '..', 'components', file), 'utf8');
    const rule = new RegExp('(^|\\n)[^{}]*' + cls.replace('.', '\\.') + '\\s*\\{[^}]*opacity:\\s*0;', 'm');
    assert.match(css, rule, cls + ' starts at opacity 0 in ' + file);
  }
});

/* ── Touch polish: menu rows, the active tab's name, the touch baseline ───── */

const readShared = (file) => fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('the Table and Kanban menu rows are as tall as the other menus on a touch screen (40 px)', () => {
  const css = readShared('view-shell.css');
  const rule = css.match(/\n\s*\.tp-context-menu-item,[^{}]*\{[^}]*\}/);
  assert.ok(rule, 'the shared coarse row rule exists');
  assert.match(rule[0], /\.tbm-item/);
  assert.match(rule[0], /min-height:\s*40px/);
});

test('on a phone the active tab keeps its name: only the inactive tabs collapse to an icon', () => {
  const css = readShared('view-shell.css');
  const collapsing = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/font-size:\s*0\s*[;}]/.test(m[2] + ';') && /\.vt-tab/.test(m[1])) collapsing.push(m[1].replace(/\s+/g, ' ').trim());
  }
  assert.ok(collapsing.length > 0, 'the phone collapse rule exists');
  for (const selector of collapsing) assert.equal(selector, '.vt-tab:not(.is-on)', 'only the inactive tabs collapse');
});

test('both stylesheets that cover every page carry the same touch baseline (no scroll chaining, no text inflation, no double-tap zoom)', () => {
  for (const file of ['view-shell.css', 'touch-base.css']) {
    const css = readShared(file);
    assert.match(css, /html\s*\{[^}]*overscroll-behavior:\s*none/, file + ': html does not chain overscroll to the Trello page');
    assert.match(css, /body\s*\{\s*overscroll-behavior:\s*none/, file + ': body too');
    assert.match(css, /text-size-adjust:\s*100%/, file + ': no text inflation');
    assert.match(css, /@media \(pointer: coarse\)\s*\{[^@]*button, a, label, select, summary, \[role='button'\]\s*\{\s*touch-action:\s*manipulation/, file + ': controls do not double-tap zoom');
  }
});
