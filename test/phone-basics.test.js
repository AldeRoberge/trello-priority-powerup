'use strict';

// The phone basics: a floating "Annuler" after an archive, a search button, a "+" new-card button.
// Each widget is run in a vm context with a tiny fake DOM (test/helpers/fake-dom.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { node, findAll, textOf, createDocument, createTimers } = require('./helpers/fake-dom');

const COMPONENTS = path.join(__dirname, '..', 'components');

function run(files, extra) {
  const doc = createDocument();
  const timers = createTimers();
  const win = Object.assign(
    {
      document: doc,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      addEventListener() {},
      removeEventListener() {},
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      innerHeight: 700,
    },
    extra
  );
  const ctx = vm.createContext({ window: win, document: doc, URL });
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(COMPONENTS, f), 'utf8'), ctx));
  return { win, doc, timers };
}

const byClass = (root, cls) => findAll(root, (n) => n.classList.contains(cls));
const buttonWith = (root, text) => findAll(root, (n) => n.tag === 'button' && textOf(n).indexOf(text) !== -1)[0];

/* ── HistoryPanel#toast ─────────────────────────────────────────────── */

function panel(extra, cfgExtra) {
  const env = run(['shared/history-panel.js'], extra);
  const applied = [];
  const hp = env.win.HistoryPanel.create(
    Object.assign({ key: 'k', shortcuts: false, verb: () => 'archivée', apply: (e, back) => { applied.push([e.id, back]); return Promise.resolve(); } }, cfgExtra)
  );
  return Object.assign(env, { hp, applied });
}

test('toast: shows the message with Annuler, and Annuler undoes the entry once and hides the toast', async () => {
  const { doc, hp, applied } = panel();
  const entry = hp.record({ type: 'archive', title: 'Écrire' });
  hp.toast(entry, '« Écrire » archivée');
  const toast = byClass(doc.body, 'hp-toast')[0];
  assert.ok(toast, 'the toast is on the page');
  assert.equal(toast.getAttribute('role'), 'status');
  assert.match(textOf(toast), /« Écrire » archivée/);
  buttonWith(toast, 'Annuler').fire('click');
  assert.equal(byClass(doc.body, 'hp-toast').length, 0, 'the toast goes away at once');
  assert.deepEqual(applied, [[entry.id, true]], 'apply(entry, back = true) ran once');
  await new Promise((r) => setImmediate(r));
  assert.equal(entry.state, 'undone');
});

test('toast: fades after 8 s, not before', () => {
  const { doc, hp, timers } = panel();
  hp.toast(hp.record({ type: 'archive', title: 'A' }), 'A archivée');
  timers.run(7999);
  assert.equal(byClass(doc.body, 'hp-toast').length, 1);
  timers.run(8000);
  assert.equal(byClass(doc.body, 'hp-toast').length, 0);
});

test('toast: a new toast replaces the old one (one at a time, one timer)', () => {
  const { doc, hp, timers } = panel();
  hp.toast(hp.record({ type: 'archive', title: 'A' }), 'A archivée');
  hp.toast(hp.record({ type: 'archive', title: 'B' }), 'B archivée');
  const toasts = byClass(doc.body, 'hp-toast');
  assert.equal(toasts.length, 1);
  assert.match(textOf(toasts[0]), /B archivée/);
  assert.equal(timers.count(), 1);
});

test('toast: an entry that cannot be undone gets no Annuler, only the message and the history button', () => {
  const { doc, hp } = panel();
  hp.toast(hp.record({ type: 'field', title: 'A' }), 'Champ modifié');
  const toast = byClass(doc.body, 'hp-toast')[0];
  assert.equal(buttonWith(toast, 'Annuler'), undefined);
  assert.ok(findAll(toast, (n) => n.tag === 'button' && n.getAttribute('aria-label') === 'Historique')[0]);
});

test('toast: sits just above the assistant dock when the page has one', () => {
  const withDock = panel({ ViewShell: { dockBottom: (gap) => (gap === 12 ? 148 : null) } });
  withDock.hp.toast(withDock.hp.record({ type: 'archive', title: 'A' }), 'x');
  assert.equal(byClass(withDock.doc.body, 'hp-toast')[0].style.bottom, '148px');
  const noDock = panel({ ViewShell: { dockBottom: () => null } });
  noDock.hp.toast(noDock.hp.record({ type: 'archive', title: 'A' }), 'x');
  assert.equal(byClass(noDock.doc.body, 'hp-toast')[0].style.bottom, undefined, 'the CSS margin applies');
});

/* ── Search: CommandPalette.open, QuickFind.request, the tab strip button ── */

function palette(extra) {
  const opened = [];
  const env = run(['shared/command-palette.js'], Object.assign({
    LinearPick: { isOpen: () => false, open: (cfg) => opened.push(cfg) },
    ViewTabs: { VIEWS: [{ key: 'gantt', label: 'Gantt', icon: 'timeline', page: './gantt.html' }], UTILS: [], hrefFor: () => '' },
  }, extra));
  return Object.assign(env, { opened });
}

test('CommandPalette.open opens the attached palette, and does nothing once it is detached', () => {
  const { win, opened } = palette();
  const CP = win.CommandPalette;
  assert.equal(CP.open(), false, 'nothing attached yet');
  const detach = CP.attach({ cards: () => [{ id: 'c1', name: 'Écrire' }] });
  assert.equal(CP.open(), true);
  assert.equal(opened.length, 1);
  assert.ok(JSON.stringify(opened[0].items).indexOf('Écrire') !== -1, 'the cards are in the list');
  detach();
  assert.equal(CP.open(), false);
  assert.equal(opened.length, 1);
});

test('CommandPalette.open keeps the Ctrl+K guards (an inline editor is open)', () => {
  const { win, opened } = palette();
  win.CommandPalette.attach({ cards: () => [], isBusy: () => true });
  win.CommandPalette.open();
  assert.equal(opened.length, 0);
});

test('QuickFind.request opens the search once, and refuses while a view editor is busy', () => {
  const env = run(['shared/command-palette.js', 'shared/quick-find.js']);
  const QF = env.win.QuickFind;
  assert.equal(typeof QF.request, 'function');
  let busy = true;
  env.win.CommandPalette.attach({ cards: () => [{ id: 'c1', name: 'Écrire' }], isBusy: () => busy });
  assert.equal(QF.request(), false, 'busy');
  assert.equal(byClass(env.doc.body, 'qf-scrim').length, 0);
  busy = false;
  assert.equal(QF.request(), true);
  assert.equal(byClass(env.doc.body, 'qf-scrim').length, 1);
  assert.equal(QF.request(), false, 'already open');
  assert.equal(byClass(env.doc.body, 'qf-scrim').length, 1);
});

function tabs(extra) {
  const env = run(['shared/view-tabs.js'], Object.assign({ location: { href: 'https://x.test/table.html', search: '', hash: '' } }, extra));
  const container = node('div');
  env.win.ViewTabs.mount(container, { active: 'table' });
  return Object.assign(env, { container });
}

test('tab strip: a search button on pages that have a palette, none on pages without one', () => {
  const none = tabs();
  assert.equal(byClass(none.container, 'vt-search').length, 0, 'Assistant and Réglages have nothing to search');
  const calls = [];
  const env = tabs({ CommandPalette: { open: () => calls.push('palette') } });
  const btn = byClass(env.container, 'vt-search')[0];
  assert.ok(btn);
  assert.equal(btn.tag, 'button');
  assert.equal(btn.getAttribute('aria-label'), 'Chercher');
  assert.ok(btn.parentNode.classList.contains('vt-utils'), 'pinned with the other utilities');
});

test('tab strip: the search button opens QuickFind, or the palette when QuickFind is not loaded', () => {
  const calls = [];
  const withQf = tabs({ CommandPalette: { open: () => calls.push('palette') }, QuickFind: { request: () => calls.push('quickfind') } });
  byClass(withQf.container, 'vt-search')[0].fire('click');
  assert.deepEqual(calls, ['quickfind']);
  calls.length = 0;
  const noQf = tabs({ CommandPalette: { open: () => calls.push('palette') } });
  byClass(noQf.container, 'vt-search')[0].fire('click');
  assert.deepEqual(calls, ['palette']);
});

/* ── LinearKeys: the "+" new-card button ─────────────────────────────── */

function keys(extra, opts) {
  const env = run(['shared/linear-keys.js'], extra);
  const made = [];
  const detach = env.win.LinearKeys.attach(Object.assign({ newCard: () => made.push('new') }, opts));
  return Object.assign(env, { made, detach, button: () => byClass(env.doc.body, 'lk-new')[0] });
}

test('"+" button: mounted only when the view can create a card, labelled for screen readers', () => {
  const env = keys();
  const b = env.button();
  assert.ok(b);
  assert.equal(b.tag, 'button');
  assert.equal(b.getAttribute('aria-label'), 'Nouvelle carte');
  const without = run(['shared/linear-keys.js']);
  without.win.LinearKeys.attach({});
  assert.equal(byClass(without.doc.body, 'lk-new').length, 0);
});

test('"+" button: a tap starts a new card, unless an editor, picker or composer is open', () => {
  let busy = false;
  const open = { pick: false, composer: false, fields: false };
  const env = keys(
    { LinearPick: { isOpen: () => open.pick }, NewCard: { isOpen: () => open.composer }, CardFields: { isOpen: () => open.fields } },
    { isBusy: () => busy }
  );
  env.button().fire('click');
  assert.deepEqual(env.made, ['new']);
  busy = true;
  env.button().fire('click');
  busy = false;
  open.pick = true;
  env.button().fire('click');
  open.pick = false;
  open.composer = true;
  env.button().fire('click');
  open.composer = false;
  open.fields = true;
  env.button().fire('click');
  assert.deepEqual(env.made, ['new'], 'blocked taps start nothing');
});

test('"+" button: steps aside while a text field has focus (keyboard up), and comes back', () => {
  const env = keys();
  env.doc.fire('focusin', { target: node('input') });
  assert.ok(env.button().classList.contains('is-hidden'));
  env.doc.fire('focusout', {});
  assert.ok(!env.button().classList.contains('is-hidden'));
  env.doc.fire('focusin', { target: node('button') });
  assert.ok(!env.button().classList.contains('is-hidden'), 'a button taking focus does not hide it');
});

test('"+" button: hangs above the assistant dock, or keeps a safe-area margin with no dock', () => {
  assert.equal(keys({ ViewShell: { dockBottom: () => 112 } }).button().style.bottom, '112px');
  assert.equal(keys({ ViewShell: { dockBottom: () => null } }).button().style.bottom, 'calc(16px + env(safe-area-inset-bottom, 0px))');
  assert.equal(keys().button().style.bottom, 'calc(16px + env(safe-area-inset-bottom, 0px))', 'no ViewShell at all');
});

test('"+" button: detach removes it and its timers', () => {
  const env = keys();
  assert.ok(env.timers.count() > 0, 'it looks for the dock a few times');
  env.detach();
  assert.equal(env.button(), undefined);
  assert.equal(env.timers.count(), 0);
});
