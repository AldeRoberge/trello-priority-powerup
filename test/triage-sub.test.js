'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

loadComponent('dashboard/dashboard-model.js');
const UI = loadComponent('dashboard/triage-ui.js').TriageUI;

function El(tag) {
  this.tag = tag;
  this.className = '';
  this.textContent = '';
  this.children = [];
  this.attrs = {};
  this.listeners = {};
  this.style = {};
  this.scrollHeight = 20;
  const self = this;
  this.classList = {
    toggle(name, on) {
      const parts = String(self.className || '').split(/\s+/).filter(Boolean);
      const has = parts.indexOf(name) >= 0;
      const want = on == null ? !has : !!on;
      if (want && !has) parts.push(name);
      if (!want && has) parts.splice(parts.indexOf(name), 1);
      self.className = parts.join(' ');
      return want;
    },
    add(name) { this.toggle(name, true); },
    remove(name) { this.toggle(name, false); },
    contains(name) { return String(self.className || '').split(/\s+/).indexOf(name) >= 0; },
  };
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return this.attrs[k] == null ? null : this.attrs[k]; };
El.prototype.appendChild = function (c) { this.children.push(c); if (c) c.parent = this; return c; };
El.prototype.addEventListener = function (type, fn) {
  (this.listeners[type] || (this.listeners[type] = [])).push(fn);
};
El.prototype.querySelector = function (sel) {
  const cls = sel.charAt(0) === '.' ? sel.slice(1) : '';
  let found = null;
  (function walk(n) {
    if (found || !n) return;
    (n.children || []).forEach(function (c) {
      if (found) return;
      if (cls && String(c.className || '').split(/\s+/).indexOf(cls) >= 0) found = c;
      else walk(c);
    });
  })(this);
  return found;
};

function texts(node, out) {
  out = out || [];
  if (node && node.textContent) out.push(node.textContent);
  (node.children || []).forEach(function (c) { texts(c, out); });
  return out;
}

function clickTitle(root, title) {
  let found = null;
  (function walk(n) {
    if (found || !n) return;
    if (n.attrs && n.attrs.title === title && n.listeners && n.listeners.click) found = n;
    else (n.children || []).forEach(walk);
  })(root);
  assert.ok(found, 'button ' + title);
  found.listeners.click.forEach(function (fn) { fn({}); });
}

function clickLabel(root, label) {
  let found = null;
  (function walk(n) {
    if (found || !n) return;
    if (n.listeners && n.listeners.click && texts(n).indexOf(label) >= 0) found = n;
    else (n.children || []).forEach(walk);
  })(root);
  assert.ok(found, 'button ' + label);
  found.listeners.click.forEach(function (fn) {
    fn({ preventDefault() {}, stopPropagation() {}, key: 'Enter' });
  });
}

function mountDom() {
  global.document.createElement = function (tag) { return new El(tag); };
  global.document.createTextNode = function (t) { return { textContent: t, children: [] }; };
}

const hostBase = {
  today: '2026-10-22',
  dayLabel: function (iso) { return iso; },
  showCard() {},
  openCard() {},
  rename() {},
  setEstimate() {},
  openEstimate() {},
  plan() {},
  openDay() {},
  setProgress() {},
  toggleBlocked() {},
  toggleChild() {},
  addChild() {},
};

test('a subtask pane sets its duration, day, progress and block', () => {
  mountDom();
  const calls = [];
  const host = Object.assign({}, hostBase, {
    showCard() { calls.push(['back']); },
    setEstimate(m) { calls.push(['est', m]); },
    plan(iso) { calls.push(['plan', iso]); },
    setProgress(p) { calls.push(['prog', p]); },
    toggleBlocked() { calls.push(['block']); },
  });
  const el = UI.subDetail({
    card: { id: 'c1', name: 'Qualité des vidéos' },
    item: {
      id: 'i1',
      text: 'Tester sur Instagram',
      progress: 0,
      items: [{ id: 'i2', text: 'Publier', progress: 0 }],
    },
    parent: null,
  }, host);
  const labels = texts(el);
  assert.ok(labels.indexOf('Estimation') >= 0);
  assert.ok(labels.indexOf('Jour prévu') >= 0);
  assert.ok(labels.indexOf('Avancement') >= 0);
  assert.ok(labels.indexOf('Bloquer') >= 0);
  assert.ok(labels.indexOf('Sous-tâches') >= 0);
  assert.ok(labels.indexOf('Publier') >= 0);
  assert.equal(labels.indexOf('Impact'), -1);
  clickLabel(el, '15 min');
  clickLabel(el, 'Demain');
  clickLabel(el, '50 %');
  clickLabel(el, 'Bloquer');
  clickLabel(el, 'Qualité des vidéos');
  assert.deepEqual(calls, [
    ['est', 15],
    ['plan', '2026-10-23'],
    ['prog', 50],
    ['block'],
    ['back'],
  ]);
});

test('a nested step keeps duration, day and progress, and has no block row', () => {
  mountDom();
  const el = UI.subDetail({
    card: { id: 'c1', name: 'Tâche' },
    item: { id: 'i2', text: 'Détail', progress: 25 },
    parent: { id: 'i1' },
  }, hostBase);
  const labels = texts(el);
  assert.ok(labels.indexOf('Estimation') >= 0);
  assert.equal(labels.indexOf('Bloquer'), -1);
  assert.equal(labels.indexOf('Sous-tâches'), -1);
});

test('a linked subtask whose card is missing only offers its title and an open button', () => {
  mountDom();
  const calls = [];
  const el = UI.subDetail({
    card: { id: 'c1', name: 'Tâche' },
    item: { id: 'i1', text: 'Carte liée', linkedCardId: 'c9', progress: 0 },
    parent: null,
  }, Object.assign({}, hostBase, { openCard() { calls.push('open'); } }));
  const labels = texts(el);
  assert.equal(labels.indexOf('Estimation'), -1);
  clickTitle(el, 'Ouvrir la carte');
  assert.deepEqual(calls, ['open']);
});
