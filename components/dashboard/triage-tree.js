/*
 * Role: the Triage list as a tree: projects, under them their tasks, under those the subtasks. The projects are
 * the ones of the Mindmap goal map (WorkOS.projectOf); the subtasks are the checklist items of the card
 * (row.items, as CompletionTrello stores them, one level of nesting). Tasks that belong to no project sit under
 * "Sans projet"; when no task belongs to a project at all the tree is just the flat list.
 *
 *   TriageTree.build(rows, { projectOf(row) -> {id, name, icon?}|null, collapsed: {key: true} })
 *     -> { nodes, tasks }   nodes: every visible line in order; tasks: the task rows in display order (j / k keys)
 *     node kinds: 'project' { key, name, count, open, free, icon, blocked }
 *                 'task'    { key, row, depth, open, kids, done, total }
 *                 'sub'     { key, taskId, text, done, blocked, linked, depth, open, kids }
 *   TriageTree.render(built, ctx) -> DocumentFragment
 *     ctx: { taskEl(row) -> element (the existing Triage row), toggle(key), select(taskId),
 *            selectSub(node), selectedKey,
 *            pickIcon(node, icon), selectProject(projectId), selectedProject, setProgress(node, pct) }
 *   TriageTree.pinAdd(row, info, ctx) / addField(node, ctx)  the left count, and the "+" that replaces it
 *     adding: 't:id' | 's:id:path' | { key, mode: 'task'|'sub' }  'task' inserts a sibling card
 *   TriageTree.carryOver(oldEl, newEl, ctx)  puts the tree decoration of a redrawn task row back
 *   TriageTree.colHead(ctx) / colsEl(row, ctx)  the right-hand columns (Avancement and Priorité, plus any the user shows)
 *   TriageTree.normalizeColumns / sortRows / cycleSort / moveColumn / shiftColumn / widthOf / catalog
 *     ctx.columns, sorts, widths, onSorts(next), onColumns(next), onWidths(next), onWidth(key, w),
 *     edit(row, key, anchor), priorityEl(row), taskProgress(row), label(row, key)
 *   TriageTree.prefs.{treeOn, setTreeOn, collapsed, setCollapsed, columns, sorts, widths}  remembered in localStorage
 *
 * `build` is pure (unit tests: test/triage-tree.test.js). Keys: "p:<projectId>", "t:<cardId>", "s:<cardId>:<path>".
 * A sub node also carries id, parentId ('' at the first level) and linkedCardId. Clicking it calls selectSub.
 */
(function (global) {
  'use strict';

  var FREE_KEY = 'p:';
  var FREE_NAME = 'Sans projet';

  function isDone(item) {
    return !!item && (item.done === true || Number(item.progress) >= 100);
  }

  /**
   * What the open composer is: a string key (a subtask, the old shape) or { key, mode }
   * with mode 'task' (a sibling card) or 'sub' (a checklist line).
   */
  function addingSpec(adding) {
    if (!adding) return null;
    if (typeof adding === 'string') return { key: adding, mode: 'sub' };
    if (typeof adding === 'object') return { key: String(adding.key || ''), mode: adding.mode === 'task' ? 'task' : 'sub' };
    return null;
  }

  /** Subtask lines of one task (and the nested ones of an open subtask). parentId is '' on the first level. */
  function subNodes(taskId, items, depth, path, parentId, collapsed, out, adding) {
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
        parentId: parentId || '',
        canAdd: !path && !it.linkedCardId && !!it.id, // one level of nesting under a subtask
        linkedCardId: it.linkedCardId || '',

        text: it.text,
        done: isDone(it),
        blocked: it.blocked === true && !isDone(it),
        linked: !!it.linkedCardId,
        count: Array.isArray(it.items) ? it.items.length : 0,
        depth: depth,
        open: open,
        kids: !!kids,
      });
      if (kids && open) subNodes(taskId, it.items, depth + 1, p, it.id || '', collapsed, out, adding);
      if (adding && adding.key === key) out.push({ kind: 'add', key: 'a:' + key, taskId: taskId, parentId: it.id || '', depth: depth + 1, mode: 'sub' });
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
    if (items.length && open) subNodes(row.id, items, depth + 1, '', '', collapsed, out, adding);
    if (adding && adding.key === key) {
      var asTask = adding.mode === 'task';
      out.push({
        kind: 'add',
        key: 'a:' + key,
        taskId: row.id,
        parentId: '',
        depth: asTask ? depth : depth + 1,
        mode: asTask ? 'task' : 'sub',
      });
    }
  }

  /** A paused checklist item (not a finished one). Same rule as TableModel.taskBlocksProject. */
  function itemsBlock(items) {
    var i, it;
    for (i = 0; i < (items || []).length; i++) {
      it = items[i];
      if (!it) continue;
      if (it.blocked === true && !isDone(it)) return true;
      if (itemsBlock(it.items)) return true;
    }
    return false;
  }

  /** An open task blocks its project. A finished task does not. */
  function blocksProject(r) {
    var TM = global.TableModel;
    if (TM && typeof TM.taskBlocksProject === 'function') return TM.taskBlocksProject(r);
    if (!r) return false;
    if (typeof r.progress === 'number' && r.progress >= 100) return false;
    if (r.statutKey === 'completed' || r.statutKey === 'canceled') return false;
    if (r.blocked || r.statutKey === 'blocked') return true;
    return itemsBlock(r.items);
  }

  /** A project line's score: its best task priority, the mean progress of its tasks, and whether one is paused. */
  function summary(rows) {
    var best = null;
    var total = 0;
    var n = 0;
    var blocked = false;
    rows.forEach(function (r) {
      if (typeof r.priority === 'number' && (!best || r.priority > best.priority)) best = r;
      if (typeof r.progress === 'number') { total += Math.max(0, Math.min(100, r.progress)); n++; }
      if (blocksProject(r)) blocked = true;
    });
    return {
      priority: best ? best.priority : null,
      tierI: best ? best.tierI : null,
      progress: n ? Math.round(total / n) : (blocked ? 0 : null),
      blocked: blocked,
    };
  }

  function build(rows, opts) {
    opts = opts || {};
    var collapsed = opts.collapsed || {};
    var adding = addingSpec(opts.adding);
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
        priority: sum.priority, tierI: sum.tierI, progress: sum.progress, blocked: !!sum.blocked,
      });
      if (!open) return;
      g.rows.forEach(function (row) { taskNodes(row, 1, collapsed, nodes, tasks, adding); });
      if (adding && adding.key === key && adding.mode === 'task') {
        nodes.push({ kind: 'add', key: 'a:' + key, taskId: '', projectId: g.id, parentId: '', depth: 1, mode: 'task' });
      }
    });
    return { nodes: nodes, tasks: tasks };
  }

  /* ── Columns (pure): which ones, in which order, how they sort ─────────────── */

  var COLLAPSED = 36;
  var MAX_W = 320;
  // edit: which existing editor a cell opens. Progress is the bar itself. Priority is the badge.
  var COLUMNS = {
    progress: { header: 'Avancement', icon: 'chart-donut', width: 106, kind: 'number' },
    priority: { header: 'Priorité', icon: 'flag', width: 84, kind: 'number', edit: 'priority' },
    statut: { header: 'Statut', icon: 'progress-check', width: 120, kind: 'text' },
    urgency: { header: 'Urgence', icon: 'flame', width: 110, kind: 'text', edit: 'priority' },
    due: { header: 'Échéance', icon: 'calendar-event', width: 112, kind: 'date', edit: 'due' },
    estimate: { header: 'Durée', icon: 'clock', width: 88, kind: 'number', edit: 'estimate' },
    tier: { header: 'Palier', icon: 'stack-2', width: 100, kind: 'text', edit: 'priority' },
    desc: { header: 'Description', icon: 'align-left', width: 180, kind: 'text', edit: 'desc' },
  };
  var DEFAULT_COLUMNS = ['progress', 'priority'];

  function normalizeColumns(input) {
    var list = Array.isArray(input) ? input : [];
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var key = String(list[i] || '');
      if (COLUMNS[key] && !seen[key]) { seen[key] = true; out.push(key); }
    }
    return out.length ? out : DEFAULT_COLUMNS.slice();
  }

  /** Visible columns first, then the ones that can be added, in catalog order. */
  function catalog(columns) {
    var cur = normalizeColumns(columns);
    return cur.concat(Object.keys(COLUMNS).filter(function (k) { return cur.indexOf(k) === -1; }));
  }

  function widthOf(widths, key) {
    var spec = COLUMNS[key];
    var fallback = spec ? spec.width : 80;
    var w = widths && widths[key];
    if (typeof w !== 'number' || !isFinite(w)) return fallback;
    return Math.max(COLLAPSED, Math.min(MAX_W, Math.round(w)));
  }

  function resetWidth(widths, key) {
    var next = Object.assign({}, widths || {});
    delete next[key];
    return next;
  }

  function toggleCollapse(widths, key) {
    var next = Object.assign({}, widths || {});
    next[key] = widthOf(next, key) <= COLLAPSED + 2 ? (COLUMNS[key] ? COLUMNS[key].width : 80) : COLLAPSED;
    return next;
  }

  function cleanSorts(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (s) {
      if (!s || !COLUMNS[s.key] || (s.dir !== 'asc' && s.dir !== 'desc')) return;
      if (out.some(function (x) { return x.key === s.key; })) return;
      out.push({ key: s.key, dir: s.dir });
    });
    return out;
  }

  /** dir null removes the column. add=false replaces the whole sort; add=true keeps the other levels. */
  function setSort(sorts, key, dir, add) {
    sorts = cleanSorts(sorts);
    if (!key || !COLUMNS[key]) return add ? sorts : [];
    if (!add) return dir ? [{ key: key, dir: dir }] : [];
    var at = -1;
    sorts.forEach(function (s, i) { if (s.key === key) at = i; });
    var rest = sorts.filter(function (s) { return s.key !== key; });
    if (dir) rest.splice(at === -1 ? rest.length : at, 0, { key: key, dir: dir });
    return rest;
  }

  /** Click: asc, then desc, then off. A multi-sort click collapses onto this column. */
  function cycleSort(sorts, key, add) {
    sorts = cleanSorts(sorts);
    var cur = null;
    sorts.forEach(function (s) { if (s.key === key) cur = s; });
    var next = !cur ? 'asc' : cur.dir === 'asc' ? 'desc' : null;
    if (!add && cur && sorts.length > 1) next = 'asc';
    return setSort(sorts, key, next, !!add);
  }

  function sortPhrase(key) {
    if (key === 'urgency') return { asc: 'du moins au plus urgent', desc: 'du plus au moins urgent' };
    if (key === 'estimate') return { asc: 'de la plus courte à la plus longue', desc: 'de la plus longue à la plus courte' };
    if (key === 'due') return { asc: 'de la plus proche à la plus lointaine', desc: 'de la plus lointaine à la plus proche' };
    if (key === 'tier') return { asc: 'du plus au moins critique', desc: 'du moins au plus critique' };
    if (COLUMNS[key] && COLUMNS[key].kind === 'number') return { asc: 'du plus petit au plus grand', desc: 'du plus grand au plus petit' };
    return { asc: 'de A à Z', desc: 'de Z à A' };
  }

  function sortValue(row, key, sctx) {
    var TM = global.TableModel;
    if (TM && typeof TM.sortValue === 'function' && TM.COLUMNS && TM.COLUMNS[key]) return TM.sortValue(row, key, sctx);
    if (!row) return null;
    if (key === 'estimate') return row.estimate > 0 ? row.estimate : null;
    if (key === 'due') return row.due || row.start || '';
    if (key === 'progress') return typeof row.progress === 'number' ? row.progress : null;
    if (key === 'priority') return typeof row.priority === 'number' ? row.priority : null;
    var v = row[key];
    return v == null || v === '' ? null : v;
  }

  /** Empties stay last in both directions. Order is otherwise kept when values tie. */
  function sortRows(rows, sorts, ctx) {
    var levels = cleanSorts(sorts);
    var list = (rows || []).slice();
    if (!levels.length) return list;
    var listRank = {};
    ((ctx && ctx.lists) || []).forEach(function (l, i) { if (l && l.id) listRank[l.id] = i; });
    var sctx = { listRank: listRank };
    return list.sort(function (a, b) {
      for (var i = 0; i < levels.length; i++) {
        var av = sortValue(a, levels[i].key, sctx);
        var bv = sortValue(b, levels[i].key, sctx);
        var emptyA = av == null || av === '';
        var emptyB = bv == null || bv === '';
        if (emptyA && emptyB) continue;
        if (emptyA) return 1;
        if (emptyB) return -1;
        var cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'fr', { sensitivity: 'base', numeric: true });
        if (cmp) return levels[i].dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  function moveColumn(columns, fromKey, toKey, before) {
    var cur = normalizeColumns(columns);
    if (!COLUMNS[fromKey] || !COLUMNS[toKey] || fromKey === toKey || cur.indexOf(fromKey) < 0) return cur;
    var next = cur.filter(function (k) { return k !== fromKey; });
    var at = next.indexOf(toKey);
    if (at < 0) return cur;
    next.splice(before ? at : at + 1, 0, fromKey);
    return next;
  }

  function shiftColumn(columns, key, delta) {
    var cur = normalizeColumns(columns);
    var i = cur.indexOf(key);
    var j = i + delta;
    if (i < 0 || j < 0 || j >= cur.length) return cur;
    var next = cur.slice();
    next.splice(i, 1);
    next.splice(j, 0, key);
    return next;
  }

  function hideColumn(columns, key) {
    var cur = normalizeColumns(columns);
    if (cur.length <= 1) return cur;
    var next = cur.filter(function (k) { return k !== key; });
    return next.length ? next : cur;
  }

  function cellLabel(row, key) {
    if (!row) return '';
    if (key === 'progress') return typeof row.progress === 'number' ? row.progress + ' %' : '';
    if (key === 'priority') {
      if (typeof row.priority !== 'number') return '';
      var txt = global.TableModel && global.TableModel.formatPriority ? global.TableModel.formatPriority(row.priority) : String(row.priority);
      return txt ? 'P' + txt : '';
    }
    if (key === 'statut') return row.statut || '';
    if (key === 'urgency') return row.urgency || '';
    if (key === 'tier') return row.tier || '';
    if (key === 'due') return row.dueVague || row.due || row.start || '';
    if (key === 'estimate') return row.estimate > 0 ? String(row.estimate) : '';
    if (key === 'desc') return String(row.desc || '').replace(/\s+/g, ' ').trim();
    return row[key] == null ? '' : String(row[key]);
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
    var c = el('span', 'tt-prog' + (has ? '' : ' is-empty') + (has && pct >= 100 && !opts.blocked ? ' is-done' : '') + (live ? ' is-live' : '') + (opts.blocked ? ' is-blocked' : ''), has ? { title: (opts.blocked ? 'Bloqué · ' : 'Avancement ') + pct + ' %' } : {});
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
      c.appendChild(el('span', 'db-prio db-prio--' + (tierI == null ? 'n' : Math.min(tierI, 4)), { text: 'P' + (global.TableModel ? global.TableModel.formatPriority(priority) : Number(priority).toFixed(1)), title: 'Meilleure priorité du projet' }));
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
    pinAdd(row, { key: n.key, count: n.count, depth: 0, choices: 'project' }, ctx);
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
    row.appendChild(colsEl({
      progress: n.progress,
      priority: n.priority,
      tierI: n.tierI,
      blocked: n.blocked,
    }, ctx, { project: n }));
    // The rest of the line opens the project in the pane (the free group has none: it folds).
    row.addEventListener('click', function () {
      if (pickable) ctx.selectProject(n.id);
      else ctx.toggle(n.key);
    });
    return row;
  }

  /** What a task row gets in the tree: depth, fold arrow, left subtask count; remembered in data-* for carryOver. */
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
    pinAdd(rowEl, {
      key: info.key,
      count: info.total,
      done: info.done,
      total: info.total,
      depth: info.depth,
      choices: 'menu',
    }, ctx);
    return rowEl;
  }

  /**
   * Left slot shared by every line: the child count, and the "+" that takes its place on hover.
   * Depth 0 keeps the slot in the row. Deeper lines pin it to the same left edge as the project count.
   * choices: 'menu' (sibling or subtask), 'project' (a task in the project), 'sub' (a nested line), '' (count only).
   */
  function pinAdd(row, info, ctx) {
    if (!row || !info) return null;
    var adding = ctx && ctx.addingKey === info.key;
    var slot = el('span', 'tt-side' + (info.depth > 0 ? ' is-fixed' : ''));
    var n = info.count > 0 ? String(info.count) : '';
    var doneAll = info.total > 0 && info.done === info.total;
    var title = info.total ? info.done + ' sur ' + info.total : null;
    slot.appendChild(el('span', 'tt-count' + (doneAll ? ' is-done' : '') + (n ? '' : ' is-empty'), { text: n, title: title }));
    if (!adding && info.choices) {
      var label = info.choices === 'sub' ? 'Nouvelle sous-tâche' : 'Ajouter';
      var b = el('button', 'tt-add', { type: 'button', 'aria-label': label, title: label });
      b.appendChild(icon('plus'));
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        if (info.choices === 'menu' && ctx && typeof ctx.chooseAdd === 'function') ctx.chooseAdd(info.key, b);
        else if (ctx && typeof ctx.startAdd === 'function') ctx.startAdd(info.key, info.choices === 'project' ? 'task' : 'sub');
      });
      // Under the line, on its seam with the next one: the count slot stays put.
      row.appendChild(b);
    }
    if (info.depth > 0) row.appendChild(slot);
    else row.insertBefore(slot, row.firstChild);
    return slot;
  }

  /** The inline field: Enter adds and stays open for the next one, Escape or leaving closes it. */
  function addEl(n, ctx) {
    var taskMode = n.mode === 'task';
    var label = taskMode ? 'Nouvelle tâche' : 'Nouvelle sous-tâche';
    var row = el('div', 'tt-adding' + (taskMode ? '' : ' tt-sub'), { role: 'treeitem', 'aria-level': String(n.depth + 1), 'data-key': n.key });
    indent(row, n.depth);
    row.appendChild(el('span', 'tt-chev is-empty', { 'aria-hidden': 'true' }));
    if (!taskMode) row.appendChild(icon('circle'));
    var input = el('input', 'tt-input', { type: 'text', placeholder: label, 'aria-label': label, maxlength: '200' });
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
        if (taskMode && !n.taskId) { if (typeof ctx.addInProject === 'function') ctx.addInProject(n.projectId || '', text); }
        else if (taskMode) { if (typeof ctx.addTask === 'function') ctx.addTask(n.taskId, text); }
        else if (typeof ctx.addSub === 'function') ctx.addSub(n.taskId, n.parentId, text);
      }
    });
    input.addEventListener('click', function (e) { e.stopPropagation(); });
    input.addEventListener('blur', function () {
      // Let a click on a button finish before the field disappears.
      setTimeout(function () { if (input.isConnected && !input.value.trim()) close(); }, 150);
    });
    row.appendChild(input);
    row.appendChild(colsEl(null, ctx, { blank: true }));
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
    if (ctx.selectedKey && ctx.selectedKey === n.key) {
      row.classList.add('is-sel');
      row.setAttribute('aria-selected', 'true');
    }
    indent(row, n.depth);
    row.appendChild(chevron(n.open, n.kids, function () { ctx.toggle(n.key); }));
    row.appendChild(icon(n.blocked ? 'player-pause' : n.done ? 'circle-check' : n.linked ? 'link' : 'circle'));
    row.appendChild(el('span', 'tt-name', { text: n.text, title: n.text }));
    if (n.canAdd || n.count) {
      pinAdd(row, { key: n.key, count: n.count || 0, depth: n.depth, choices: n.canAdd ? 'sub' : '' }, ctx);
    }
    // The line itself is the selection: the pane then edits this subtask, not its parent card.
    row.addEventListener('click', function () {
      if (typeof ctx.selectSub === 'function') ctx.selectSub(n);
      else ctx.select(n.taskId);
    });
    row.appendChild(colsEl(null, ctx, { blank: true }));
    return row;
  }

  function sizeEl(node, w) {
    node.style.width = w + 'px';
    node.style.flex = '0 0 ' + w + 'px';
  }

  function paintWidth(key, w) {
    if (!document || typeof document.querySelectorAll !== 'function') return;
    var nodes = document.querySelectorAll('[data-col="' + key + '"]');
    var collapsed = w <= COLLAPSED + 2;
    for (var i = 0; i < nodes.length; i++) {
      sizeEl(nodes[i], w);
      if (nodes[i].classList) nodes[i].classList.toggle('is-collapsed', collapsed);
    }
  }

  function labelOf(row, key, ctx) {
    if (ctx && typeof ctx.label === 'function') return ctx.label(row, key) || '';
    return cellLabel(row, key);
  }

  function editButton(key, row, ctx, text) {
    var empty = !text;
    var b = el('button', 'tt-cell' + (empty ? ' is-empty' : ''), {
      type: 'button',
      title: empty ? 'Cliquer pour ajouter…' : text,
    });
    b.textContent = empty ? 'Cliquer pour ajouter…' : text;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof ctx.edit === 'function') ctx.edit(row, key, b);
    });
    return b;
  }

  function emptyPriority(row, ctx) {
    var b = el('button', 'tt-cell is-empty', { type: 'button', title: 'Cliquer pour ajouter…', 'aria-label': 'Cliquer pour ajouter…' });
    b.appendChild(icon('flag'));
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof ctx.edit === 'function') ctx.edit(row, 'priority', b);
    });
    return b;
  }

  /** One property cell. A blank line keeps the slot so the columns stay aligned. */
  function colCell(key, index, row, ctx, opts) {
    opts = opts || {};
    var w = widthOf(ctx && ctx.widths, key);
    var cell = el('span', 'tt-col' + (index % 2 ? ' is-alt' : '') + (w <= COLLAPSED + 2 ? ' is-collapsed' : ''), { 'data-col': key });
    sizeEl(cell, w);
    if (opts.blank || !row) return cell;
    if (key === 'progress') {
      var popts = opts.project
        ? {
          blocked: !!row.blocked,
          onSet: function (pct) { if (typeof ctx.setProgress === 'function') ctx.setProgress(opts.project, pct); },
        }
        : (typeof ctx.taskProgress === 'function' ? ctx.taskProgress(row) : {});
      cell.appendChild(progressEl(row.progress, popts || {}));
      return cell;
    }
    if (key === 'priority') {
      if (opts.project) { cell.appendChild(prioCol(row.priority, row.tierI)); return cell; }
      var badge = typeof ctx.priorityEl === 'function' ? ctx.priorityEl(row) : null;
      cell.appendChild(badge || emptyPriority(row, ctx));
      return cell;
    }
    if (opts.project) return cell;
    var text = labelOf(row, key, ctx);
    var spec = COLUMNS[key];
    cell.title = text || (spec && spec.header) || '';
    if (spec && spec.edit) cell.appendChild(editButton(key, row, ctx, text));
    else if (text) cell.appendChild(el('span', 'tt-cell', { text: text, title: text }));
    return cell;
  }

  function colsEl(row, ctx, opts) {
    ctx = ctx || {};
    var keys = normalizeColumns(ctx.columns);
    var wrap = el('span', 'tt-cols');
    keys.forEach(function (key, i) { wrap.appendChild(colCell(key, i, row, ctx, opts)); });
    return wrap;
  }

  var dragKey = null;

  function headerItems(key, ctx) {
    var spec = COLUMNS[key];
    var sorts = cleanSorts(ctx.sorts);
    var cur = null;
    sorts.forEach(function (s) { if (s.key === key) cur = s; });
    var others = sorts.some(function (s) { return s.key !== key; });
    var phrase = sortPhrase(key);
    var columns = normalizeColumns(ctx.columns);
    var idx = columns.indexOf(key);
    var collapsed = widthOf(ctx.widths, key) <= COLLAPSED + 2;
    return [
      { title: spec.header },
      { icon: 'sort-ascending', label: 'Trier ' + phrase.asc, checked: cur && cur.dir === 'asc' && !others, action: function () { if (ctx.onSorts) ctx.onSorts(setSort(sorts, key, 'asc', false)); } },
      { icon: 'sort-descending', label: 'Trier ' + phrase.desc, checked: cur && cur.dir === 'desc' && !others, action: function () { if (ctx.onSorts) ctx.onSorts(setSort(sorts, key, 'desc', false)); } },
      { icon: 'arrows-sort', label: 'Retirer le tri', disabled: !cur, action: function () { if (ctx.onSorts) ctx.onSorts(setSort(sorts, key, null, true)); } },
      { sep: true },
      { icon: 'arrow-left', label: 'Déplacer à gauche', disabled: idx <= 0, action: function () { if (ctx.onColumns) ctx.onColumns(shiftColumn(columns, key, -1)); } },
      { icon: 'arrow-right', label: 'Déplacer à droite', disabled: idx < 0 || idx >= columns.length - 1, action: function () { if (ctx.onColumns) ctx.onColumns(shiftColumn(columns, key, 1)); } },
      { icon: collapsed ? 'arrows-maximize' : 'arrows-minimize', label: collapsed ? 'Élargir' : 'Réduire', action: function () { if (ctx.onWidths) ctx.onWidths(toggleCollapse(ctx.widths, key)); } },
      { icon: 'eye-off', label: 'Masquer la colonne', disabled: columns.length <= 1, action: function () { if (ctx.onColumns) ctx.onColumns(hideColumn(columns, key)); } },
      { icon: 'columns-3', label: 'Colonnes…', action: function () { openColumns(null, ctx); } },
    ];
  }

  function bindResize(handle, key, ctx) {
    handle.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      var th = handle.parentNode;
      if (th) th.draggable = false;
      var startX = e.clientX;
      var startW = widthOf(ctx.widths, key);
      var cur = startW;
      function move(ev) {
        cur = Math.max(COLLAPSED, Math.min(MAX_W, Math.round(startW + (startX - ev.clientX))));
        paintWidth(key, cur);
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
        if (th) th.draggable = true;
        if (typeof ctx.onWidth === 'function') ctx.onWidth(key, cur);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    });
    handle.addEventListener('dblclick', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof ctx.onWidths === 'function') ctx.onWidths(resetWidth(ctx.widths, key));
    });
  }

  /** Names the columns and lets them be sorted, moved, resized, hidden. */
  function colHead(ctx) {
    ctx = ctx || {};
    var head = el('div', 'tt-colhead', { role: 'row' });
    var keys = normalizeColumns(ctx.columns);
    var sorts = cleanSorts(ctx.sorts);
    var wrap = el('span', 'tt-cols');
    keys.forEach(function (key, index) {
      var spec = COLUMNS[key];
      var w = widthOf(ctx.widths, key);
      var cur = null;
      sorts.forEach(function (s) { if (s.key === key) cur = s; });
      var th = el('span', 'tt-th' + (index % 2 ? ' is-alt' : '') + (cur ? ' is-sorted' : '') + (w <= COLLAPSED + 2 ? ' is-collapsed' : ''), {
        'data-col': key,
        role: 'columnheader',
        tabindex: '0',
        draggable: 'true',
        title: spec.header + ' · cliquer pour trier',
        'aria-sort': cur ? (cur.dir === 'asc' ? 'ascending' : 'descending') : 'none',
      });
      sizeEl(th, w);
      var grip = el('button', 'tt-th-resize', { type: 'button', 'aria-label': 'Largeur', tabindex: '-1' });
      bindResize(grip, key, ctx);
      grip.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); });
      th.appendChild(grip);
      var mark = icon(spec.icon);
      mark.className += ' tt-th-icon';
      th.appendChild(mark);
      th.appendChild(el('span', 'tt-th-text', { text: spec.header }));
      var slot = el('span', 'tt-th-sort');
      slot.appendChild(icon(cur ? (cur.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrows-sort'));
      if (cur && sorts.length > 1) slot.appendChild(el('span', 'tt-sort-n', { text: String(sorts.indexOf(cur) + 1) }));
      th.appendChild(slot);
      var skipClick = false;
      th.addEventListener('click', function (e) {
        if (skipClick) { skipClick = false; return; }
        if (typeof ctx.onSorts !== 'function') return;
        ctx.onSorts(cycleSort(ctx.sorts, key, !!(e.shiftKey || e.ctrlKey || e.metaKey)));
      });
      th.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (typeof ctx.onSorts === 'function') ctx.onSorts(cycleSort(ctx.sorts, key, !!(e.shiftKey || e.ctrlKey || e.metaKey)));
      });
      th.addEventListener('dragstart', function (e) {
        dragKey = key;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', key); } catch (err) { /* ignore */ }
        }
        if (th.classList) th.classList.add('is-col-dragging');
      });
      th.addEventListener('dragend', function () {
        skipClick = true;
        dragKey = null;
        if (th.classList) th.classList.remove('is-col-dragging', 'is-col-drop-before', 'is-col-drop-after');
      });
      th.addEventListener('dragover', function (e) {
        if (!dragKey || dragKey === key) return;
        e.preventDefault();
        var before = e.offsetX < (th.offsetWidth || w) / 2;
        if (!th.classList) return;
        th.classList.toggle('is-col-drop-before', before);
        th.classList.toggle('is-col-drop-after', !before);
      });
      th.addEventListener('dragleave', function () {
        if (th.classList) th.classList.remove('is-col-drop-before', 'is-col-drop-after');
      });
      th.addEventListener('drop', function (e) {
        if (!dragKey || dragKey === key) return;
        e.preventDefault();
        var before = th.classList && th.classList.contains('is-col-drop-before');
        var from = dragKey;
        dragKey = null;
        if (typeof ctx.onColumns === 'function') ctx.onColumns(moveColumn(ctx.columns, from, key, before));
      });
      th.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var CM = global.ContextMenu;
        if (!CM || typeof CM.show !== 'function') return;
        CM.show({ clientX: e.clientX, clientY: e.clientY }, headerItems(key, ctx));
      });
      wrap.appendChild(th);
    });
    head.appendChild(wrap);
    return head;
  }

  var colPop = null;
  var colPopOff = null;

  function closeColumns() {
    if (colPop && colPop.parentNode) colPop.parentNode.removeChild(colPop);
    colPop = null;
    if (colPopOff) { colPopOff(); colPopOff = null; }
  }

  function placePop(pop, anchor) {
    if (!anchor || anchor.isConnected === false || typeof anchor.getBoundingClientRect !== 'function') return;
    var r = anchor.getBoundingClientRect();
    var pw = pop.offsetWidth || 240;
    var ph = pop.offsetHeight || 200;
    var left = Math.max(8, Math.min(r.right - pw, (global.innerWidth || 800) - pw - 8));
    var top = r.bottom + 4;
    if (top + ph > (global.innerHeight || 600) - 8) top = Math.max(8, r.top - ph - 4);
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
  }

  function fillPop(pop, ctx, anchor) {
    pop.textContent = '';
    var visible = normalizeColumns(ctx.columns);
    catalog(ctx.columns).forEach(function (key) {
      var spec = COLUMNS[key];
      var on = visible.indexOf(key) !== -1;
      var idx = visible.indexOf(key);
      var row = el('div', 'tt-colpop-row');
      var label = el('label');
      var box = el('input', '', { type: 'checkbox' });
      if (on) box.checked = true;
      box.addEventListener('change', function () {
        var cur = normalizeColumns(ctx.columns);
        if (!box.checked && cur.length <= 1) { box.checked = true; return; }
        var next = box.checked ? cur.concat([key]) : hideColumn(cur, key);
        ctx.columns = next;
        if (typeof ctx.onColumns === 'function') ctx.onColumns(next);
        fillPop(pop, ctx, anchor);
        placePop(pop, anchor);
      });
      label.appendChild(box);
      label.appendChild(icon(spec.icon));
      label.appendChild(el('span', '', { text: spec.header }));
      row.appendChild(label);
      if (on) {
        var moves = el('span', 'tt-colpop-move');
        [-1, 1].forEach(function (dir) {
          var disabled = dir < 0 ? idx <= 0 : idx >= visible.length - 1;
          var b = el('button', '', { type: 'button', title: dir < 0 ? 'Déplacer à gauche' : 'Déplacer à droite', disabled: disabled });
          b.appendChild(icon(dir < 0 ? 'arrow-left' : 'arrow-right'));
          b.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (disabled) return;
            var next = shiftColumn(ctx.columns, key, dir);
            ctx.columns = next;
            if (typeof ctx.onColumns === 'function') ctx.onColumns(next);
            fillPop(pop, ctx, anchor);
            placePop(pop, anchor);
          });
          moves.appendChild(b);
        });
        row.appendChild(moves);
      }
      pop.appendChild(row);
    });
  }

  /** The column list, anchored under a button. A second call on the same button closes it. */
  function openColumns(anchor, ctx) {
    ctx = ctx || {};
    if (colPop && anchor && colPop._anchor === anchor) { closeColumns(); return; }
    closeColumns();
    if (!document || typeof document.createElement !== 'function') return;
    var pop = el('div', 'tt-colpop');
    pop._anchor = anchor;
    fillPop(pop, ctx, anchor);
    document.body.appendChild(pop);
    placePop(pop, anchor);
    colPop = pop;
    function onDoc(e) {
      if (!colPop) return;
      if (colPop.contains(e.target)) return;
      if (anchor && (e.target === anchor || (anchor.contains && anchor.contains(e.target)))) return;
      closeColumns();
    }
    function onKey(e) { if (e.key === 'Escape') closeColumns(); }
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey);
    colPopOff = function () {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }

  function render(built, ctx) {
    var frag = document.createDocumentFragment();
    frag.appendChild(colHead(ctx));
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
  var COLS_KEY = 'tp-triage-columns';
  var SORT_KEY = 'tp-triage-sort';
  var WIDTH_KEY = 'tp-triage-widths';
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
    columns: function () {
      try { return normalizeColumns(JSON.parse(read(COLS_KEY) || 'null')); } catch (e) { return normalizeColumns(null); }
    },
    setColumns: function (list) { write(COLS_KEY, JSON.stringify(normalizeColumns(list))); },
    sorts: function () {
      try { return cleanSorts(JSON.parse(read(SORT_KEY) || '[]')); } catch (e) { return []; }
    },
    setSorts: function (list) { write(SORT_KEY, JSON.stringify(cleanSorts(list))); },
    widths: function () {
      try {
        var map = JSON.parse(read(WIDTH_KEY) || '{}');
        var out = {};
        if (!map || typeof map !== 'object') return out;
        Object.keys(map).forEach(function (k) {
          if (COLUMNS[k] && typeof map[k] === 'number' && isFinite(map[k])) out[k] = widthOf(map, k);
        });
        return out;
      } catch (e) { return {}; }
    },
    setWidths: function (map) {
      var clean = {};
      Object.keys(map || {}).forEach(function (k) {
        if (COLUMNS[k] && typeof map[k] === 'number' && isFinite(map[k])) clean[k] = widthOf(map, k);
      });
      write(WIDTH_KEY, JSON.stringify(clean));
    },
  };

  global.TriageTree = {
    progressEl: progressEl,
    colHead: colHead,
    colsEl: colsEl,
    openColumns: openColumns,
    build: build,
    render: render,
    pinAdd: pinAdd,
    addField: function (n, ctx) { return addEl(n, ctx); },
    carryOver: carryOver,
    prefs: prefs,
    COLUMNS: COLUMNS,
    DEFAULT_COLUMNS: DEFAULT_COLUMNS,
    normalizeColumns: normalizeColumns,
    catalog: catalog,
    sortRows: sortRows,
    cycleSort: cycleSort,
    setSort: setSort,
    moveColumn: moveColumn,
    shiftColumn: shiftColumn,
    hideColumn: hideColumn,
    widthOf: widthOf,
    cellLabel: cellLabel,
    FREE_NAME: FREE_NAME,
    FREE_KEY: FREE_KEY,
  };
})(typeof window !== 'undefined' ? window : this);
