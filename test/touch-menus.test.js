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
    el.offsetWidth = 220; // a menu has a size once it is on the page
    el.offsetHeight = 160;
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
  if (opts.viewShell) win.ViewShell = opts.viewShell;
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

/* ── TableMenu as a bottom sheet on a phone, submenus unfolding in place ─────── */

const withKids = () => {
  const ran = [];
  const act = (name) => () => ran.push(name);
  return {
    ran,
    items: [
      { label: 'Archiver', action: act('archiver') },
      { label: 'Modifier', children: [{ label: 'Nom', action: act('nom') }, { label: 'Échéance', action: act('echeance') }] },
      { label: 'Trier', children: [{ label: 'Priorité', action: act('priorite') }] },
      { label: 'Ouvrir', action: act('ouvrir') },
    ],
  };
};
const rowNamed = (menu, label) => findAll(menu, (n) => n.classList.contains('tbm-item') && /tbm-label/.test(JSON.stringify(n.children.map((c) => c.className))) && n.children.some((c) => c.className === 'tbm-label' && c.textContent === label))[0];
const tap = (row) => row.fire('click', {});

test('TableMenu sheet: on a narrow screen the menu lies along the bottom edge, above the home bar', () => {
  const env = tableMenu({ width: 390 });
  env.TM.show({ x: 200, y: 300 }, withKids().items);
  const st = env.menu().style;
  assert.ok(env.menu().classList.contains('tbm-sheet'));
  assert.deepEqual([st.left, st.right, st.top, st.width], ['8px', '8px', 'auto', 'auto']);
  assert.match(st.bottom, /env\(safe-area-inset-bottom/);
  assert.equal(st.maxHeight, '480px'.replace('480', String(Math.round(Math.min(480, 800 * 0.7)))), 'at most 70 % of the screen, 480 px');
});

test('TableMenu sheet: on a wide screen nothing changes (a floating menu at the touch point)', () => {
  const env = tableMenu({ width: 1280 });
  env.TM.show({ x: 200, y: 300 }, withKids().items);
  const m = env.menu();
  assert.ok(!m.classList.contains('tbm-sheet'));
  assert.equal(m.style.left, '200px');
  assert.equal(m.style.top, '300px');
  assert.equal(m.style.bottom, undefined);
});

test('TableMenu sheet: ViewShell decides when it is loaded (the same rule as the other menus)', () => {
  const narrow = tableMenu({ width: 1280, viewShell: { isNarrow: () => true } });
  narrow.TM.show({ x: 5, y: 5 }, withKids().items);
  assert.ok(narrow.menu().classList.contains('tbm-sheet'));
  const wide = tableMenu({ width: 390, viewShell: { isNarrow: () => false } });
  wide.TM.show({ x: 5, y: 5 }, withKids().items);
  assert.ok(!wide.menu().classList.contains('tbm-sheet'));
});

test('TableMenu sheet: a submenu unfolds right under its row, inside the sheet, and folds back on a second tap', () => {
  const env = tableMenu({ width: 390 });
  env.TM.show({ x: 5, y: 5 }, withKids().items);
  const menu = env.menu();
  const modifier = rowNamed(menu, 'Modifier');
  tap(modifier);
  const group = classes(menu, 'tbm-subgroup')[0];
  assert.ok(group, 'the children are in the sheet');
  assert.equal(menu.children[menu.children.indexOf(modifier) + 1], group, 'right under Modifier');
  assert.equal(classes(env.doc.body, 'tbm-sub').length, 0, 'no floating flyout');
  assert.ok(modifier.classList.contains('is-open'));
  assert.deepEqual(group.children.map((r) => r.children.find((c) => c.className === 'tbm-label').textContent), ['Nom', 'Échéance']);
  tap(modifier);
  assert.equal(classes(menu, 'tbm-subgroup').length, 0, 'folded back');
  assert.ok(!modifier.classList.contains('is-open'));
  assert.ok(env.menu(), 'and the menu stays open');
});

test('TableMenu sheet: opening another submenu folds the first, and a child runs its action once and closes the menu', () => {
  const kids = withKids();
  const env = tableMenu({ width: 390 });
  env.TM.show({ x: 5, y: 5 }, kids.items);
  const menu = env.menu();
  tap(rowNamed(menu, 'Modifier'));
  tap(rowNamed(menu, 'Trier'));
  const groups = classes(menu, 'tbm-subgroup');
  assert.equal(groups.length, 1, 'one at a time');
  assert.ok(!rowNamed(menu, 'Modifier').classList.contains('is-open'));
  assert.ok(rowNamed(menu, 'Trier').classList.contains('is-open'));
  tap(groups[0].children[0]);
  assert.deepEqual(kids.ran, ['priorite']);
  assert.equal(env.menu(), undefined, 'the menu closed');
});

test('TableMenu sheet: a plain row still runs its action and closes the menu', () => {
  const kids = withKids();
  const env = tableMenu({ width: 390 });
  env.TM.show({ x: 5, y: 5 }, kids.items);
  tap(rowNamed(env.menu(), 'Archiver'));
  assert.deepEqual(kids.ran, ['archiver']);
  assert.equal(env.menu(), undefined);
});

test('TableMenu sheet: rows have no hover handlers (the mouse events of a tap must not act before the click)', () => {
  const sheet = tableMenu({ width: 390 });
  sheet.TM.show({ x: 5, y: 5 }, withKids().items);
  assert.equal(findAll(sheet.menu(), (n) => n.classList.contains('tbm-item') && (n.listeners.mousemove || []).length).length, 0);
  tap(rowNamed(sheet.menu(), 'Modifier'));
  assert.equal(findAll(sheet.menu(), (n) => n.classList.contains('tbm-item') && (n.listeners.mousemove || []).length).length, 0, 'children too');
  const wide = tableMenu({ width: 1280 });
  wide.TM.show({ x: 5, y: 5 }, withKids().items);
  assert.ok(findAll(wide.menu(), (n) => n.classList.contains('tbm-item') && (n.listeners.mousemove || []).length).length >= 3, 'desktop keeps hover');
});

test('TableMenu on a wide screen: the submenu is still a floating flyout beside its row', () => {
  const env = tableMenu({ width: 1280 });
  env.TM.show({ x: 5, y: 5 }, withKids().items);
  tap(rowNamed(env.menu(), 'Modifier'));
  assert.equal(classes(env.doc.body, 'tbm-sub').length, 1);
  assert.equal(classes(env.menu(), 'tbm-subgroup').length, 0);
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
