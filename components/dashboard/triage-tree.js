/*
 * Role: the Triage list as a tree: projects, under them their tasks, under those the subtasks. The projects are
 * the ones of the Mindmap goal map (WorkOS.projectOf); the subtasks are the checklist items of the card
 * (row.items, as CompletionTrello stores them, one level of nesting). Tasks that belong to no project sit under
 * "Sans projet"; when no task belongs to a project at all the tree is just the flat list.
 *
 *   TriageTree.build(rows, { projectOf(row) -> {id, name}|null, collapsed: {key: true} })
 *     -> { nodes, tasks }   nodes: every visible line in order; tasks: the task rows in display order (j / k keys)
 *     node kinds: 'project' { key, name, count, open, free }
 *                 'task'    { key, row, depth, open, kids, done, total }
 *                 'sub'     { key, taskId, text, done, blocked, linked, depth, open, kids }
 *   TriageTree.render(built, ctx) -> DocumentFragment
 *     ctx: { taskEl(row) -> element (the existing Triage row), toggle(key), select(taskId) }
 *   TriageTree.carryOver(oldEl, newEl, ctx)  puts the tree decoration of a redrawn task row back
 *   TriageTree.prefs.{treeOn, setTreeOn, collapsed, setCollapsed}  remembered in localStorage
 *
 * `build` is pure (unit tests: test/triage-tree.test.js). Keys: "p:<projectId>", "t:<cardId>", "s:<cardId>:<path>".
 */
(function (global) {
  'use strict';

  var FREE_KEY = 'p:';
  var FREE_NAME = 'Sans projet';

  function isDone(item) {
    return !!item && (item.done === true || Number(item.progress) >= 100);
  }

  /** Subtask lines of one task (and the nested ones of an open subtask). */
  function subNodes(taskId, items, depth, path, collapsed, out) {
    (items || []).forEach(function (it, i) {
      if (!it || typeof it.text !== 'string') return;
      var p = path + (path ? '.' : '') + i;
      var kids = Array.isArray(it.items) && it.items.length;
      var key = 's:' + taskId + ':' + p;
      var open = !collapsed[key];
      out.push({
        kind: 'sub',
        key: key,
        taskId: taskId,
        text: it.text,
        done: isDone(it),
        blocked: it.blocked === true && !isDone(it),
        linked: !!it.linkedCardId,
        depth: depth,
        open: open,
        kids: !!kids,
      });
      if (kids && open) subNodes(taskId, it.items, depth + 1, p, collapsed, out);
    });
  }

  function taskNodes(row, depth, collapsed, out, tasks) {
    var items = Array.isArray(row.items) ? row.items.filter(function (i) { return i && typeof i.text === 'string'; }) : [];
    var key = 't:' + row.id;
    var open = !collapsed[key];
    out.push({
      kind: 'task',
      key: key,
      row: row,
      depth: depth,
      open: open,
      kids: items.length > 0,
      done: items.filter(isDone).length,
      total: items.length,
    });
    tasks.push(row);
    if (items.length && open) subNodes(row.id, items, depth + 1, '', collapsed, out);
  }

  function build(rows, opts) {
    opts = opts || {};
    var collapsed = opts.collapsed || {};
    var projectOf = typeof opts.projectOf === 'function' ? opts.projectOf : function () { return null; };
    var groups = [];
    var byId = Object.create(null);
    var free = [];
    (rows || []).forEach(function (row, i) {
      var p = projectOf(row);
      if (!p || !p.id) { free.push(row); return; }
      var g = byId[p.id];
      if (!g) {
        g = byId[p.id] = { id: String(p.id), name: p.name || '', rows: [], first: i };
        groups.push(g);
      }
      g.rows.push(row);
    });
    var nodes = [];
    var tasks = [];
    if (!groups.length) {
      // No project in sight: the tree is the plain list, subtasks still hang under their task.
      free.forEach(function (row) { taskNodes(row, 0, collapsed, nodes, tasks); });
      return { nodes: nodes, tasks: tasks };
    }
    groups.sort(function (a, b) { return a.first - b.first; });
    if (free.length) groups.push({ id: '', name: FREE_NAME, rows: free, first: Infinity, free: true });
    groups.forEach(function (g) {
      var key = 'p:' + g.id;
      var open = !collapsed[key];
      nodes.push({ kind: 'project', key: key, name: g.name, count: g.rows.length, open: open, free: !!g.free });
      if (!open) return;
      g.rows.forEach(function (row) { taskNodes(row, 1, collapsed, nodes, tasks); });
    });
    return { nodes: nodes, tasks: tasks };
  }

  /* ── DOM ───────────────────────────────────────────────────────── */

  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : v);
    });
    return n;
  }

  function icon(name) {
    return el('i', 'ti ti-' + name, { 'aria-hidden': 'true' });
  }

  /** The fold arrow. Lines with nothing to fold keep an empty slot so the text of every line starts at the same place. */
  function chevron(open, has, onclick) {
    if (!has) return el('span', 'tt-chev is-empty', { 'aria-hidden': 'true' });
    var b = el('button', 'tt-chev', { type: 'button', 'aria-label': open ? 'Replier' : 'Déplier', title: open ? 'Replier' : 'Déplier' });
    b.appendChild(icon(open ? 'chevron-down' : 'chevron-right'));
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      onclick();
    });
    return b;
  }

  function indent(node, depth) {
    node.style.setProperty('--tt-depth', String(depth));
  }

  function projectEl(n, ctx) {
    var row = el('div', 'tt-project' + (n.free ? ' is-free' : ''), { role: 'treeitem', 'aria-level': '1', 'aria-expanded': String(n.open), 'data-key': n.key, tabindex: '-1' });
    indent(row, 0);
    row.appendChild(chevron(n.open, true, function () { ctx.toggle(n.key); }));
    row.appendChild(icon(n.free ? 'inbox' : 'stack-2'));
    row.appendChild(el('span', 'tt-name', { text: n.name, title: n.name }));
    row.appendChild(el('span', 'tt-count', { text: String(n.count) }));
    row.addEventListener('click', function () { ctx.toggle(n.key); });
    return row;
  }

  /** What a task row gets in the tree: depth, fold arrow, "2/5" subtasks; remembered in data-* for carryOver. */
  function decorateTask(rowEl, info, ctx) {
    rowEl.classList.add('tt-task');
    rowEl.setAttribute('role', 'treeitem');
    rowEl.setAttribute('aria-level', String(info.depth + 1));
    if (info.kids) rowEl.setAttribute('aria-expanded', String(info.open));
    rowEl.setAttribute('data-tt', '1');
    rowEl.setAttribute('data-depth', String(info.depth));
    rowEl.setAttribute('data-key', info.key);
    rowEl.setAttribute('data-kids', info.kids ? '1' : '0');
    rowEl.setAttribute('data-open', info.open ? '1' : '0');
    rowEl.setAttribute('data-sub', info.total ? info.done + '/' + info.total : '');
    indent(rowEl, info.depth);
    rowEl.insertBefore(chevron(info.open, info.kids, function () { ctx.toggle(info.key); }), rowEl.firstChild);
    var main = rowEl.querySelector('.db-row-main');
    var count = el('span', 'tt-sub-count' + (info.total && info.done === info.total ? ' is-done' : ''), {
      text: info.total ? info.done + '/' + info.total : '',
      title: info.total ? info.done + ' sous-tâche' + (info.done > 1 ? 's' : '') + ' faite' + (info.done > 1 ? 's' : '') + ' sur ' + info.total : null,
    });
    if (main && main.nextSibling) rowEl.insertBefore(count, main.nextSibling);
    else rowEl.appendChild(count);
    return rowEl;
  }

  function carryOver(oldEl, newEl, ctx) {
    if (!oldEl || !newEl || oldEl.getAttribute('data-tt') !== '1') return newEl;
    var sub = oldEl.getAttribute('data-sub') || '';
    var parts = sub.split('/');
    decorateTask(newEl, {
      key: oldEl.getAttribute('data-key'),
      depth: Number(oldEl.getAttribute('data-depth')) || 0,
      kids: oldEl.getAttribute('data-kids') === '1',
      open: oldEl.getAttribute('data-open') === '1',
      done: Number(parts[0]) || 0,
      total: Number(parts[1]) || 0,
    }, ctx);
    return newEl;
  }

  function subEl(n, ctx) {
    var cls = 'db-row tt-sub' + (n.done ? ' is-done' : '') + (n.blocked ? ' is-blocked' : '');
    var row = el('div', cls, { role: 'treeitem', 'aria-level': String(n.depth + 1), 'data-key': n.key, 'data-task': n.taskId });
    if (n.kids) row.setAttribute('aria-expanded', String(n.open));
    indent(row, n.depth);
    row.appendChild(chevron(n.open, n.kids, function () { ctx.toggle(n.key); }));
    row.appendChild(icon(n.blocked ? 'player-pause' : n.done ? 'circle-check' : n.linked ? 'link' : 'circle'));
    row.appendChild(el('span', 'tt-name', { text: n.text, title: n.text }));
    row.addEventListener('click', function () { ctx.select(n.taskId); });
    return row;
  }

  function render(built, ctx) {
    var frag = document.createDocumentFragment();
    built.nodes.forEach(function (n) {
      if (n.kind === 'project') frag.appendChild(projectEl(n, ctx));
      else if (n.kind === 'task') frag.appendChild(decorateTask(ctx.taskEl(n.row), n, ctx));
      else frag.appendChild(subEl(n, ctx));
    });
    return frag;
  }

  /* ── Preferences (remembered in this browser; the page works without) ─────────────── */

  var TREE_KEY = 'tp-triage-tree';
  var FOLD_KEY = 'tp-triage-collapsed';
  function read(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* storage blocked: the choice lasts until reload */ }
  }
  var prefs = {
    /** The tree is the default view; "0" means the flat list. */
    treeOn: function () { return read(TREE_KEY) !== '0'; },
    setTreeOn: function (on) { write(TREE_KEY, on ? '1' : '0'); },
    collapsed: function () {
      try {
        var o = JSON.parse(read(FOLD_KEY) || '{}');
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
      } catch (e) {
        return {};
      }
    },
    setCollapsed: function (map) {
      var keep = {};
      Object.keys(map || {}).forEach(function (k) { if (map[k]) keep[k] = true; });
      write(FOLD_KEY, JSON.stringify(keep));
    },
  };

  global.TriageTree = {
    build: build,
    render: render,
    carryOver: carryOver,
    prefs: prefs,
    FREE_NAME: FREE_NAME,
    FREE_KEY: FREE_KEY,
  };
})(typeof window !== 'undefined' ? window : this);
