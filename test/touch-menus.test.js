'use strict';

// Menus and pickers on a phone: the keyboard must not open over them, a tap outside closes them (iOS sends no
// mousedown for a tap on a plain area, so the document-level listener is pointerdown), a resize that only changes the
// height (the on-screen keyboard) leaves them open while a rotation closes them, and a sheet keeps the home-bar inset.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { node, findAll, createDocument, createTimers } = require('./helpers/fake-dom');

const SHARED = path.join(__dirname, '..', 'components', 'shared');
const TABLE = path.join(__dirname, '..', 'components', 'table');

/** Runs one component in a vm with a fake document, a window that records listeners, and fake timers. */
function load(file, opts) {
  opts = opts || {};
  const doc = createDocument();
  const timers = createTimers();
  const focused = [];
  const create = doc.createElement;
  doc.createElement = (tag) => {
    const el = create(tag);
    el.focus = () => focused.push(el);
    return el;
  };
  const win = node('window');
  Object.assign(win, {
    document: doc,
    innerWidth: opts.width || 1280,
    innerHeight: 800,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    matchMedia: (q) => ({ matches: /coarse/.test(q) && !!opts.coarse }),
  });
  const ctx = vm.createContext({ window: win, document: doc, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return { win, doc, timers, focused };
}

const rows = (n) => Array.from({ length: n }, (_, i) => ({ label: 'Action ' + i, action() {} }));
const classes = (root, cls) => findAll(root, (n) => n.classList.contains(cls));

/* ── TableMenu (Table and Kanban card menus) ─────────────────────────── */

function tableMenu(opts) {
  const env = load(path.join(TABLE, 'table-menu.js'), opts);
  env.TM = env.win.TableMenu;
  env.menu = () => classes(env.doc.body, 'tbm')[0];
  return env;
}

test('TableMenu: the search field takes focus on a desktop, not on a phone (the keyboard would cover the menu)', () => {
  const desktop = tableMenu();
  desktop.TM.show({ x: 10, y: 10 }, rows(8));
  assert.equal(desktop.focused.filter((el) => el.tag === 'input').length, 1, 'desktop: focused');
  const phone = tableMenu({ coarse: true, width: 390 });
  phone.TM.show({ x: 10, y: 10 }, rows(8));
  assert.equal(phone.focused.filter((el) => el.tag === 'input').length, 0, 'phone: not focused');
});

test('TableMenu: a tap outside closes it (pointerdown), a tap inside does not, and mousedown is no longer what it listens to', () => {
  const { TM, doc, menu } = tableMenu({ coarse: true, width: 390 });
  TM.show({ x: 10, y: 10 }, rows(3));
  assert.ok(menu());
  assert.equal((doc.listeners.mousedown || []).length, 0, 'no document mousedown listener');
  doc.fire('pointerdown', { target: menu().children[0] });
  assert.ok(menu(), 'inside: stays');
  doc.fire('pointerdown', { target: node('div') });
  assert.equal(menu(), undefined, 'outside: closed');
});

test('TableMenu: a resize that only changes the height (the keyboard) keeps it open, a width change (rotation) closes it', () => {
  const env = tableMenu({ coarse: true, width: 390 });
  env.TM.show({ x: 10, y: 10 }, rows(3));
  env.win.innerHeight = 420; // the keyboard
  env.win.fire('resize');
  assert.ok(env.menu(), 'height only: stays');
  env.win.innerWidth = 844; // rotation
  env.win.fire('resize');
  assert.equal(env.menu(), undefined, 'width changed: closed');
});

test('TableMenu: hiding removes its listeners (nothing left behind)', () => {
  const env = tableMenu({ width: 390 });
  env.TM.show({ x: 10, y: 10 }, rows(3));
  env.TM.hide();
  assert.equal(env.menu(), undefined);
  assert.equal((env.doc.listeners.pointerdown || []).length, 0);
  assert.equal((env.win.listeners.resize || []).length, 0);
});

/* ── LinearPick (statut, urgence, échéance pickers) ───────────────────── */

function pick(opts) {
  const env = load(path.join(SHARED, 'linear-pick.js'), opts);
  env.LP = env.win.LinearPick;
  env.open = () => env.LP.open({ anchor: { x: 20, y: 20 }, items: [{ id: 'a', label: 'Backlog' }, { id: 'b', label: 'En cours' }], placeholder: 'Choisir…', onPick() {} });
  env.root = () => classes(env.doc.body, 'lp-pop')[0];
  return env;
}

test('LinearPick: on a narrow screen the sheet keeps the home-bar inset instead of a plain 8px', () => {
  const env = pick({ width: 390 });
  env.open();
  const root = env.root();
  assert.ok(root.classList.contains('is-sheet'));
  assert.match(root.style.bottom, /env\(safe-area-inset-bottom/);
});

test('LinearPick: the search field takes focus on a desktop, not on a phone', () => {
  const desktop = pick();
  desktop.open();
  assert.equal(desktop.focused.filter((el) => el.tag === 'input').length, 1);
  const phone = pick({ coarse: true, width: 390 });
  phone.open();
  assert.equal(phone.focused.filter((el) => el.tag === 'input').length, 0);
});

test('LinearPick: a tap outside closes it (pointerdown), a tap inside does not', () => {
  const env = pick({ coarse: true, width: 390 });
  env.open();
  env.timers.run(0); // the listener is registered on the next tick
  assert.equal((env.doc.listeners.mousedown || []).length, 0, 'no document mousedown listener');
  env.doc.fire('pointerdown', { target: env.root().children[0] || env.root() });
  assert.ok(env.root(), 'inside: stays');
  env.doc.fire('pointerdown', { target: node('div') });
  assert.equal(env.root(), undefined, 'outside: closed');
});

/* ── The rest of the document-level outside-dismiss listeners ─────────── */

test('no picker or popover is closed by a document-level mousedown any more (iOS does not send it for a plain-area tap)', () => {
  for (const f of ['linear-pick.js', 'icon-pick.js', 'assistant-dock.js', 'context-menu-core-agent.js']) {
    const src = fs.readFileSync(path.join(SHARED, f), 'utf8');
    assert.doesNotMatch(src, /(document|\bd)\.addEventListener\(\s*'mousedown'/, f + ' listens to pointerdown outside');
  }
  assert.doesNotMatch(fs.readFileSync(path.join(TABLE, 'table-menu.js'), 'utf8'), /document\.addEventListener\(\s*'mousedown'/);
});
