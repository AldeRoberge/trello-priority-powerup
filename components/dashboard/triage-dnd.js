/**
 * Triage list: drag and drop.
 *   - a project line moves among the projects (manual order, remembered);
 *   - a task moves among the tasks of its project (manual order, remembered);
 *   - a task dropped on the middle of another task becomes its subtask;
 *   - a task dropped on a project line joins that project.
 * Only the drop marker changes while dragging (a line or a tint), nothing moves under the pointer.
 * The pure helpers (moveWithin, applyOrder, zoneOf) are tested in test/triage-dnd.test.js.
 */
(function (global) {
  'use strict';

  var ORDER_KEY = 'tp-triage-order';
  var drag = null;

  /** `ids` with `fromId` moved next to `toId` (before it, or after it). Unknown ids leave the list as it is. */
  function moveWithin(ids, fromId, toId, after) {
    var list = (ids || []).slice();
    if (!fromId || !toId || fromId === toId || list.indexOf(fromId) < 0 || list.indexOf(toId) < 0) return list;
    list = list.filter(function (x) { return x !== fromId; });
    var at = list.indexOf(toId);
    list.splice(after ? at + 1 : at, 0, fromId);
    return list;
  }

  /** `items` in the remembered order; the ones the order does not know keep their place, after the known ones. */
  function applyOrder(items, order, idOf) {
    if (!Array.isArray(order) || !order.length) return (items || []).slice();
    var rank = Object.create(null);
    order.forEach(function (id, i) { if (rank[id] == null) rank[id] = i; });
    return (items || [])
      .map(function (it, i) { var r = rank[idOf(it)]; return { it: it, k: r == null ? order.length + i : r }; })
      .sort(function (a, b) { return a.k - b.k; })
      .map(function (x) { return x.it; });
  }

  /** Where in a line the pointer is: 'before' (top), 'after' (bottom) or 'into' (middle, tasks and projects only). */
  function zoneOf(fraction, allowInto) {
    if (allowInto) {
      if (fraction < 0.28) return 'before';
      if (fraction > 0.72) return 'after';
      return 'into';
    }
    return fraction < 0.5 ? 'before' : 'after';
  }

  function readOrder() {
    try {
      var o = JSON.parse(global.localStorage.getItem(ORDER_KEY) || '{}');
      return {
        projects: o && Array.isArray(o.projects) ? o.projects.filter(function (x) { return typeof x === 'string'; }) : [],
        tasks: o && o.tasks && typeof o.tasks === 'object' && !Array.isArray(o.tasks) ? o.tasks : {},
      };
    } catch (e) {
      return { projects: [], tasks: {} };
    }
  }
  function writeOrder(o) {
    try { global.localStorage.setItem(ORDER_KEY, JSON.stringify(o)); } catch (e) { /* storage blocked: the order lasts until reload */ }
  }

  function clearMarks(root) {
    var list = (root || document).querySelectorAll('.tt-drop-before, .tt-drop-after, .tt-drop-into');
    for (var i = 0; i < list.length; i++) list[i].classList.remove('tt-drop-before', 'tt-drop-after', 'tt-drop-into');
  }

  function mark(el, zone) {
    clearMarks(el.parentNode);
    if (zone) el.classList.add('tt-drop-' + zone);
  }

  function fractionOf(e, el) {
    var r = el.getBoundingClientRect();
    return r.height ? (e.clientY - r.top) / r.height : 0.5;
  }

  /** Ids of the projects on screen, in order (the free group has no id and never moves). */
  function projectIds(el) {
    var root = el.parentNode;
    var out = [];
    var list = root ? root.querySelectorAll('.tt-project[data-iso-project]') : [];
    for (var i = 0; i < list.length; i++) out.push(list[i].getAttribute('data-iso-project'));
    return out;
  }

  /** Ids of the tasks of the project line `proj`, in order. */
  function taskIds(proj) {
    var out = [];
    var n = proj.nextElementSibling;
    while (n && !n.classList.contains('tt-project')) {
      if (n.classList.contains('tt-task') && n.getAttribute('data-depth') === '1' && n.getAttribute('data-card')) out.push(n.getAttribute('data-card'));
      n = n.nextElementSibling;
    }
    return out;
  }

  function projectOfTask(taskEl) {
    var n = taskEl.previousElementSibling;
    while (n && !n.classList.contains('tt-project')) n = n.previousElementSibling;
    return n;
  }

  /** Make a project line draggable among the projects, and a drop target for tasks. */
  function bindProject(row, node, ctx) {
    if (!ctx || !row) return;
    if (!node.free && node.id) {
      row.setAttribute('draggable', 'true');
      row.addEventListener('dragstart', function (e) {
        if (e.target !== row && e.target.closest && e.target.closest('input, button')) { e.preventDefault(); return; }
        drag = { kind: 'project', id: node.id };
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', node.name || node.id); } catch (err) { /* synthetic event */ }
        row.classList.add('is-dragging');
      });
      row.addEventListener('dragend', function () {
        drag = null;
        row.classList.remove('is-dragging');
        clearMarks(row.parentNode);
      });
    }
    row.addEventListener('dragover', function (e) {
      if (!drag) return;
      if (drag.kind === 'project') {
        if (node.free || drag.id === node.id) return;
        e.preventDefault();
        mark(row, zoneOf(fractionOf(e, row), false));
      } else if (drag.kind === 'task' && typeof ctx.moveToProject === 'function') {
        e.preventDefault();
        mark(row, 'into');
      }
    });
    row.addEventListener('dragleave', function (e) {
      if (!row.contains(e.relatedTarget)) row.classList.remove('tt-drop-before', 'tt-drop-after', 'tt-drop-into');
    });
    row.addEventListener('drop', function (e) {
      if (!drag) return;
      e.preventDefault();
      var cur = drag;
      var zone = zoneOf(fractionOf(e, row), false);
      drag = null;
      clearMarks(row.parentNode);
      if (cur.kind === 'project' && !node.free && cur.id !== node.id && typeof ctx.reorderProject === 'function') {
        ctx.reorderProject(moveWithin(projectIds(row), cur.id, node.id, zone === 'after'));
      } else if (cur.kind === 'task' && typeof ctx.moveToProject === 'function') {
        ctx.moveToProject(cur.id, node.free ? '' : node.id);
      }
    });
  }

  /** Make a task line draggable, and a drop target (before, after, or into = subtask). */
  function bindTask(row, info, ctx) {
    if (!ctx || !row || !info || !info.row) return;
    var id = info.row.id;
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', function (e) {
      if (e.target !== row && e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]')) { e.preventDefault(); return; }
      e.stopPropagation();
      drag = { kind: 'task', id: id };
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', info.row.name || id); } catch (err) { /* synthetic event */ }
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', function () {
      drag = null;
      row.classList.remove('is-dragging');
      clearMarks(row.parentNode);
    });
    row.addEventListener('dragover', function (e) {
      if (!drag || drag.kind !== 'task' || drag.id === id) return;
      var zone = zoneOf(fractionOf(e, row), typeof ctx.makeSubtask === 'function');
      e.preventDefault();
      mark(row, zone);
    });
    row.addEventListener('dragleave', function (e) {
      if (!row.contains(e.relatedTarget)) row.classList.remove('tt-drop-before', 'tt-drop-after', 'tt-drop-into');
    });
    row.addEventListener('drop', function (e) {
      if (!drag || drag.kind !== 'task' || drag.id === id) return;
      e.preventDefault();
      e.stopPropagation();
      var cur = drag;
      var zone = zoneOf(fractionOf(e, row), typeof ctx.makeSubtask === 'function');
      drag = null;
      clearMarks(row.parentNode);
      if (zone === 'into') {
        ctx.makeSubtask(cur.id, id);
        return;
      }
      var proj = projectOfTask(row);
      var mine = proj ? taskIds(proj) : [];
      if (mine.indexOf(cur.id) < 0) {
        // From another project: join this one, next to the task it was dropped on.
        if (proj && typeof ctx.moveToProject === 'function') ctx.moveToProject(cur.id, proj.getAttribute('data-iso-project') || '', { near: id, after: zone === 'after' });
        return;
      }
      if (typeof ctx.reorderTask === 'function') {
        ctx.reorderTask(proj ? (proj.getAttribute('data-iso-project') || '') : '', moveWithin(mine, cur.id, id, zone === 'after'));
      }
    });
  }

  global.TriageDnd = {
    moveWithin: moveWithin,
    applyOrder: applyOrder,
    zoneOf: zoneOf,
    bindProject: bindProject,
    bindTask: bindTask,
    order: readOrder,
    setOrder: writeOrder,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.TriageDnd;
})(typeof window !== 'undefined' ? window : this);
