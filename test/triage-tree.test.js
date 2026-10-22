'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const win = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'components', 'dashboard', 'triage-tree.js'), 'utf8'), { window: win });
const TT = win.TriageTree;

// Values built inside the vm context are not reference-equal to this realm's arrays: compare their JSON.
const eq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);
const card = (id, items) => ({ id, name: 'Carte ' + id, items: items || [] });
const projects = { a: { id: 'P1', name: 'Site web' }, b: { id: 'P1', name: 'Site web' }, c: { id: 'P2', name: 'Fête' } };
const projectOf = (row) => projects[row.id] || null;
const kinds = (built) => built.nodes.map((n) => n.kind + ':' + (n.key || ''));

test('no project anywhere: the tree is the plain list, subtasks still hang under their task', () => {
  const rows = [card('x', [{ text: 'un' }]), card('y')];
  const b = TT.build(rows, { projectOf: () => null });
  eq(kinds(b), ['task:t:x', 'sub:s:x:0', 'task:t:y']);
  assert.equal(b.nodes[0].depth, 0);
  assert.equal(b.nodes[1].depth, 1);
  eq(b.tasks.map((r) => r.id), ['x', 'y']);
});

test('tasks are grouped under their project, projects in order of their first task, free tasks last under "Sans projet"', () => {
  const rows = [card('free1'), card('c'), card('a'), card('b'), card('free2')];
  const b = TT.build(rows, { projectOf });
  eq(kinds(b), ['project:p:P2', 'task:t:c', 'project:p:P1', 'task:t:a', 'task:t:b', 'project:p:', 'task:t:free1', 'task:t:free2']);
  const p = b.nodes.filter((n) => n.kind === 'project');
  eq(p.map((n) => [n.name, n.count, n.free]), [['Fête', 1, false], ['Site web', 2, false], ['Sans projet', 2, true]]);
  assert.ok(b.nodes.filter((n) => n.kind === 'task').every((n) => n.depth === 1));
  eq(b.tasks.map((r) => r.id), ['c', 'a', 'b', 'free1', 'free2']);
});

test('a project without free tasks has no "Sans projet" line', () => {
  const b = TT.build([card('a'), card('c')], { projectOf });
  assert.equal(b.nodes.filter((n) => n.free).length, 0);
});

test('subtasks: counts, done, blocked, linked and nesting', () => {
  const items = [
    { text: 'fait', progress: 100 },
    { text: 'bloquée', blocked: true, progress: 10 },
    { text: 'carte liée', linkedCardId: 'zz' },
    { text: 'parent', items: [{ text: 'enfant', done: true }] },
  ];
  const b = TT.build([card('a', items)], { projectOf });
  const task = b.nodes.find((n) => n.kind === 'task');
  assert.equal(task.total, 4);
  assert.equal(task.done, 1);
  const subs = b.nodes.filter((n) => n.kind === 'sub');
  eq(subs.map((s) => [s.text, s.depth]), [['fait', 2], ['bloquée', 2], ['carte liée', 2], ['parent', 2], ['enfant', 3]]);
  assert.equal(subs[0].done, true);
  assert.equal(subs[1].blocked, true);
  assert.equal(subs[2].linked, true);
  assert.equal(subs[3].kids, true);
  assert.equal(subs[4].done, true);
  assert.equal(subs[4].key, 's:a:3.0');
});

test('a blocked subtask that is done is shown done, not blocked', () => {
  const b = TT.build([card('a', [{ text: 'x', blocked: true, progress: 100 }])], { projectOf });
  const s = b.nodes.find((n) => n.kind === 'sub');
  assert.equal(s.done, true);
  assert.equal(s.blocked, false);
});

test('collapsing a project hides its tasks (and they leave the j / k order); collapsing a task hides its subtasks', () => {
  const rows = [card('a', [{ text: 's' }]), card('b'), card('c')];
  const closedProject = TT.build(rows, { projectOf, collapsed: { 'p:P1': true } });
  eq(kinds(closedProject), ['project:p:P1', 'project:p:P2', 'task:t:c']);
  assert.equal(closedProject.nodes[0].open, false);
  eq(closedProject.tasks.map((r) => r.id), ['c']);
  const closedTask = TT.build(rows, { projectOf, collapsed: { 't:a': true } });
  eq(kinds(closedTask), ['project:p:P1', 'task:t:a', 'task:t:b', 'project:p:P2', 'task:t:c']);
  assert.equal(closedTask.nodes[1].open, false);
  assert.equal(closedTask.nodes[1].kids, true);
  eq(closedTask.tasks.map((r) => r.id), ['a', 'b', 'c'], 'a folded task is still a task you can select');
});

test('collapsing a nested subtask hides only its children', () => {
  const items = [{ text: 'parent', items: [{ text: 'enfant' }] }];
  const open = TT.build([card('a', items)], { projectOf });
  assert.equal(open.nodes.filter((n) => n.kind === 'sub').length, 2);
  const shut = TT.build([card('a', items)], { projectOf, collapsed: { 's:a:0': true } });
  assert.equal(shut.nodes.filter((n) => n.kind === 'sub').length, 1);
});

test('rows without items, odd items and a missing projectOf do not break it', () => {
  const b = TT.build([{ id: 'q', name: 'Q' }, card('r', [null, { text: 5 }, { text: 'ok' }])], {});
  eq(kinds(b), ['task:t:q', 'task:t:r', 'sub:s:r:0']);
  assert.equal(b.nodes[1].total, 1);
  eq(TT.build([], {}).nodes, []);
  eq(TT.build(null).tasks, []);
});

test('a project line keeps the icon reported with its tasks', () => {
  const b = TT.build([card('a')], {
    projectOf: (row) => (row.id === 'a' ? { id: 'P1', name: 'Site web', icon: { i: 'rocket', c: '#0c66e4' } } : null),
  });
  const p = b.nodes.find((n) => n.kind === 'project');
  assert.deepEqual(p.icon, { i: 'rocket', c: '#0c66e4' });
});

test('preferences survive a blocked or broken storage', () => {
  // no localStorage in this context: reads fall back to the defaults, writes do nothing
  assert.equal(TT.prefs.treeOn(), true);
  eq(TT.prefs.collapsed(), {});
  TT.prefs.setTreeOn(false);
  TT.prefs.setCollapsed({ 'p:P1': true });
});

test('clicking a project name folds it, the same as the arrow', () => {
  function Node(tag) {
    this.className = '';
    this.textContent = '';
    this.children = [];
    this.listeners = {};
    this.style = { setProperty() {} };
    this.parent = null;
    const self = this;
    this.classList = { add(c) { self.className += (self.className ? ' ' : '') + c; } };
  }
  Node.prototype.setAttribute = function () {};
  Node.prototype.appendChild = function (c) { this.children.push(c); c.parent = this; return c; };
  Node.prototype.insertBefore = function (node, before) {
    const i = this.children.indexOf(before);
    if (i < 0) this.children.push(node);
    else this.children.splice(i, 0, node);
    node.parent = this;
    return node;
  };
  Node.prototype.querySelector = function () { return null; };
  Object.defineProperty(Node.prototype, 'firstChild', { get() { return this.children[0] || null; } });
  Node.prototype.addEventListener = function (type, fn) {
    (this.listeners[type] || (this.listeners[type] = [])).push(fn);
  };
  Node.prototype.dispatch = function (type) {
    const e = { stopPropagation() { e.stopped = true; }, stopped: false };
    (this.listeners[type] || []).forEach((fn) => fn(e));
    if (!e.stopped && this.parent && this.parent.dispatch) this.parent.dispatch(type);
  };
  function find(node, pred) {
    if (pred(node)) return node;
    for (const c of node.children || []) {
      const hit = find(c, pred);
      if (hit) return hit;
    }
    return null;
  }
  const document = {
    createElement: (tag) => new Node(tag),
    createDocumentFragment() {
      const frag = { children: [] };
      frag.appendChild = (c) => { frag.children.push(c); return c; };
      return frag;
    },
  };
  const win = { document };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'components', 'dashboard', 'triage-tree.js'), 'utf8'), { window: win, document });
  const Tree = win.TriageTree;
  const toggled = [];
  const selected = [];
  const built = Tree.build([card('a'), card('free1')], { projectOf });
  const frag = Tree.render(built, {
    taskEl: () => new Node('div'),
    toggle: (key) => toggled.push(key),
    select() {},
    selectProject: (id) => selected.push(id),
    selectedProject: '',
  });
  const site = frag.children.find((n) => find(n, (c) => c.className === 'tt-name' && c.textContent === 'Site web'));
  const free = frag.children.find((n) => find(n, (c) => c.className === 'tt-name' && c.textContent === 'Sans projet'));

  find(site, (c) => c.className === 'tt-name').dispatch('click');
  eq(toggled, ['p:P1']);
  eq(selected, ['P1'], 'the name still opens the project in the pane');

  find(site, (c) => c.className === 'tt-chev').dispatch('click');
  eq(toggled, ['p:P1', 'p:P1']);
  eq(selected, ['P1'], 'the arrow only folds');

  find(free, (c) => c.className === 'tt-name').dispatch('click');
  eq(toggled, ['p:P1', 'p:P1', 'p:']);
  eq(selected, ['P1'], 'Sans projet has no pane');
});

test('adding: the new-subtask line comes after the task and its subtasks; only top-level subtasks can take a child', () => {
  const rows = [card('x', [{ id: 'i1', text: 'un', items: [{ id: 'i2', text: 'deux' }] }, { id: 'i3', text: 'trois' }])];
  const onTask = TT.build(rows, { projectOf: () => null, adding: 't:x' });
  eq(kinds(onTask), ['task:t:x', 'sub:s:x:0', 'sub:s:x:0.0', 'sub:s:x:1', 'add:a:t:x']);
  assert.equal(onTask.nodes[4].parentId, '');
  assert.equal(onTask.nodes[4].depth, 1);
  eq(onTask.nodes.filter((n) => n.kind === 'sub').map((n) => n.canAdd), [true, false, true]);

  const onSub = TT.build(rows, { projectOf: () => null, adding: 's:x:0' });
  eq(kinds(onSub), ['task:t:x', 'sub:s:x:0', 'sub:s:x:0.0', 'add:a:s:x:0', 'sub:s:x:1']);
  assert.equal(onSub.nodes[3].parentId, 'i1');
  assert.equal(onSub.nodes[3].depth, 2);
});
