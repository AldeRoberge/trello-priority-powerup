/*
 * Role: the Triage list as a tree: projects, under them their tasks, under those the subtasks. The projects are
 * the ones of the Mindmap goal map (WorkOS.projectOf); the subtasks are the checklist items of the card
 * (row.items, as CompletionTrello stores them, one level of nesting). Tasks that belong to no project sit under
 * "Sans projet"; when no task belongs to a project at all the tree is just the flat list.
 *
 *   TriageTree.build(rows, { projectOf(row) -> {id, name, icon?}|null, collapsed: {key: true} })
 *     -> { nodes, tasks }   nodes: every visible line in order; tasks: the task rows in display order (j / k keys)
 *     node kinds: 'project' { key, name, count, open, free, icon }
 *                 'task'    { key, row, depth, open, kids, done, total }
 *                 'sub'     { key, taskId, text, done, blocked, linked, depth, open, kids }
 *   TriageTree.render(built, ctx) -> DocumentFragment
 *     ctx: { taskEl(row) -> element (the existing Triage row), toggle(key), select(taskId),
 *            pickIcon(node, icon), selectProject(projectId), selectedProject }
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
  function subNodes(taskId, items, depth, path, collapsed, out, adding) {
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
        id: it.id || '',
        canAdd: !path && !it.linkedCardId && !!it.id, // one level of nesting under a subtask

        text: it.text,
        done: isDone(it),
        blocked: it.blocked === true && !isDone(it),
        linked: !!it.linkedCardId,
        depth: depth,
        open: open,
        kids: !!kids,
      });
      if (kids && open) subNodes(taskId, it.items, depth + 1, p, collapsed, out, adding);
      if (adding === key) out.push({ kind: 'add', key: 'a:' + key, taskId: taskId, parentId: it.id || '', depth: depth + 1 });
    });
  }

  function taskNodes(row, depth, collapsed, out, tasks, adding) {
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
    if (items.length && open) subNodes(row.id, items, depth + 1, '', collapsed, out, adding);
    if (adding === key) out.push({ kind: 'add', key: 'a:' + key, taskId: row.id, parentId: '', depth: depth + 1 });
  }

  /** A project line's score: its best task priority, and the mean progress of its tasks (null when none has one). */
  function summary(rows) {
    var best = null;
    var total = 0;
    var n = 0;
    rows.forEach(function (r) {
      if (typeof r.priority === 'number' && (!best || r.priority > best.priority)) best = r;
      if (typeof r.progress === 'number') { total += Math.max(0, Math.min(100, r.progress)); n++; }
    });
    return {
      priority: best ? best.priority : null,
      tierI: best ? best.tierI : null,
      progress: n ? Math.round(total / n) : null,
    };
  }

  function build(rows, opts) {
    opts = opts || {};
    var collapsed = opts.collapsed || {};
    var adding = opts.adding || '';
    var projectOf = typeof opts.projectOf === 'function' ? opts.projectOf : function () { return null; };
    var groups = [];
    var byId = Object.create(null);
    var free = [];
    (rows || []).forEach(function (row, i) {
      var p = projectOf(row);
      if (!p || !p.id) { free.push(row); return; }
      var g = byId[p.id];
      if (!g) {
        g = byId[p.id] = { id: String(p.id), name: p.name || '', icon: p.icon || null, rows: [], first: i };
        groups.push(g);
      }
      g.rows.push(row);
    });
    var nodes = [];
    var tasks = [];
    if (!groups.length) {
      // No project in sight: the tree is the plain list, subtasks still hang under their task.
      free.forEach(function (row) { taskNodes(row, 0, collapsed, nodes, tasks, adding); });
      return { nodes: nodes, tasks: tasks };
    }
    groups.sort(function (a, b) { return a.first - b.first; });
    if (free.length) groups.push({ id: '', name: FREE_NAME, rows: free, first: Infinity, free: true });
    groups.forEach(function (g) {
      var key = 'p:' + g.id;
      var open = !collapsed[key];
      var sum = summary(g.rows);
      nodes.push({
        kind: 'project', key: key, id: g.id, name: g.name, icon: g.icon || null, count: g.rows.length, open: open, free: !!g.free,
        priority: sum.priority, tierI: sum.tierI, progress: sum.progress,
      });
      if (!open) return;
      g.rows.forEach(function (row) { taskNodes(row, 1, collapsed, nodes, tasks, adding); });
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

  /** The project glyph. A click chooses another icon; it does not fold the line. "Sans projet" stays an inbox. */
  function projectGlyph(n, ctx) {
    var mark = n.icon;
    var name = n.free ? 'inbox' : ((mark && mark.i) || 'stack-2');
    if (n.free || typeof ctx.pickIcon !== 'function' || !global.IconPick) return icon(name);
    return global.IconPick.button({
      icon: mark,
      fallback: 'stack-2',
      className: 'ip-glyph',
      onChoose: function (next) { ctx.pickIcon(n, next); },
    });
  }

  /** Progress column: a small bar and the percentage. The slot stays (empty) when there is no value, so the priority never moves. */
  function progressEl(pct, opts) {
    opts = opts || {};
    var live = !!opts.onSet && !!global.ProgressRing;
    if (live && typeof pct !== 'number') pct = 0; // a task without progress yet starts at 0 so it can be set
    var has = typeof pct === 'number';
    var c = el('span', 'tt-prog' + (has ? '' : ' is-empty') + (has && pct >= 100 ? ' is-done' : '') + (live ? ' is-live' : ''), has ? { title: 'Avancement ' + pct + ' %' } : {});
    if (!has) return c;
    var ring = null;
    if (global.ProgressRing) {
      ring = global.ProgressRing.create(pct, !!opts.blocked);
      ring.classList.add('tt-prog-ring');
      if (live) {
        ring.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        ring.addEventListener('click', function (e) {
          e.stopPropagation();
          if (opts.blocked) { if (opts.onUnblock) opts.onUnblock(); return; }
          opts.onSet(pct >= 100 ? 0 : 100);
        });
      }
      c.appendChild(ring);
    }
    var bar = el('span', 'tt-prog-bar');
    var fill = el('i');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    c.appendChild(bar);
    var num = el('span', 'tt-prog-t', { text: pct + '%' });
    c.appendChild(num);
    if (live) {
      // Click or drag on the bar sets the % in place; it saves on release (same gesture as the Tableau).
      bar.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        var cur = pct;
        function at(x) {
          var r = bar.getBoundingClientRect();
          return r.width ? Math.max(0, Math.min(100, Math.round(((x - r.left) / r.width) * 100))) : cur;
        }
        function paint() {
          fill.style.width = cur + '%';
          num.textContent = cur + '%';
          global.ProgressRing.set(ring, cur);
          c.classList.toggle('is-done', cur >= 100);
        }
        function move(ev) { cur = at(ev.clientX); paint(); }
        function up() {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.removeEventListener('pointercancel', up);
          if (cur !== pct) opts.onSet(cur);
        }
        move(e);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
      });
      bar.addEventListener('click', function (e) { e.stopPropagation(); });
    }
    return c;
  }

  /** Priority column of a project line: same badge as the tasks, read-only (it is the best of its tasks). */
  function prioCol(priority, tierI) {
    var c = el('span', 'tt-prio-col');
    if (typeof priority === 'number') {
      c.appendChild(el('span', 'db-prio db-prio--' + (tierI == null ? 'n' : Math.min(tierI, 4)), { text: 'P' + String(priority), title: 'Meilleure priorité du projet' }));
    }
    return c;
  }

  function projectEl(n, ctx) {
    var pickable = !n.free && n.id && typeof ctx.selectProject === 'function';
    var row = el('div', 'tt-project' + (n.free ? ' is-free' : '') + (pickable && ctx.selectedProject === n.id ? ' is-sel' : ''), {
      role: 'treeitem',
      'aria-level': '1',
      'aria-expanded': String(n.open),
      'data-key': n.key,
      tabindex: '-1',
      'data-iso-project': n.free ? null : (n.id || null),
      'data-iso-label': n.free ? null : (n.name || null),
    });
    indent(row, 0);
    row.appendChild(chevron(n.open, true, function () { ctx.toggle(n.key); }));
    row.appendChild(projectGlyph(n, ctx));
    var name = el('span', 'tt-name', { text: n.name, title: n.name });
    // The name folds, same as the arrow. A real project also opens in the pane.
    name.addEventListener('click', function (e) {
      e.stopPropagation();
      ctx.toggle(n.key);
      if (pickable) ctx.selectProject(n.id);
    });
    row.appendChild(name);
    row.appendChild(progressEl(n.progress));
    row.appendChild(prioCol(n.priority, n.tierI));
    row.appendChild(el('span', 'tt-count', { text: String(n.count) }));
    // The rest of the line opens the project in the pane (the free group has none: it folds).
    row.addEventListener('click', function () {
      if (pickable) ctx.selectProject(n.id);
      else ctx.toggle(n.key);
    });
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
    rowEl.appendChild(addButton(info.key, ctx));
    return rowEl;
  }

  /** The hover "+" that creates a subtask under this line. Its slot is always there, so nothing shifts when it appears. */
  function addButton(key, ctx) {
    var b = el('button', 'tt-add', { type: 'button', 'aria-label': 'Nouvelle sous-tâche', title: 'Nouvelle sous-tâche' });
    b.appendChild(icon('plus'));
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof ctx.startAdd === 'function') ctx.startAdd(key);
    });
    return b;
  }

  /** The inline field of a new subtask: Enter adds it and stays open for the next one, Escape or leaving closes it. */
  function addEl(n, ctx) {
    var row = el('div', 'tt-sub tt-adding', { role: 'treeitem', 'aria-level': String(n.depth + 1), 'data-key': n.key });
    indent(row, n.depth);
    row.appendChild(el('span', 'tt-chev is-empty', { 'aria-hidden': 'true' }));
    row.appendChild(icon('circle'));
    var input = el('input', 'tt-input', { type: 'text', placeholder: 'Nouvelle sous-tâche', 'aria-label': 'Nouvelle sous-tâche', maxlength: '200' });
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (typeof ctx.stopAdd === 'function') ctx.stopAdd();
    }
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var text = input.value.replace(/\s+/g, ' ').trim();
        if (!text) { close(); return; }
        input.value = '';
        if (typeof ctx.addSub === 'function') ctx.addSub(n.taskId, n.parentId, text);
      }
    });
    input.addEventListener('click', function (e) { e.stopPropagation(); });
    input.addEventListener('blur', function () {
      // Let a click on a button finish before the field disappears.
      setTimeout(function () { if (input.isConnected && !input.value.trim()) close(); }, 150);
    });
    row.appendChild(input);
    setTimeout(function () { if (input.isConnected) input.focus(); }, 0);
    return row;
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
    row.appendChild(n.canAdd ? addButton(n.key, ctx) : el('span', 'tt-add is-empty', { 'aria-hidden': 'true' }));
    row.addEventListener('click', function () { ctx.select(n.taskId); });
    return row;
  }

  function render(built, ctx) {
    var frag = document.createDocumentFragment();
    built.nodes.forEach(function (n) {
      if (n.kind === 'project') frag.appendChild(projectEl(n, ctx));
      else if (n.kind === 'task') frag.appendChild(decorateTask(ctx.taskEl(n.row), n, ctx));
      else if (n.kind === 'add') frag.appendChild(addEl(n, ctx));
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
    progressEl: progressEl,
    build: build,
    render: render,
    carryOver: carryOver,
    prefs: prefs,
    FREE_NAME: FREE_NAME,
    FREE_KEY: FREE_KEY,
  };
})(typeof window !== 'undefined' ? window : this);
