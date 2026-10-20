/*
 * Role: pure helpers for the Kanban view (board columns = Trello lists, cards = Table rows).
 * No Trello / DOM access so it can be unit-tested (test/kanban-model.test.js). Rows come from
 * TableModel.rowFromRecord, so Kanban and Table share one data shape.
 */
(function (global) {
  'use strict';

  function isClosedKey(key) {
    return key === 'completed' || key === 'canceled';
  }

  function isBlockedRow(row) {
    return !!(row && (row.blocked || row.statutKey === 'blocked'));
  }

  /** Past due date on a card that is not in a completed or canceled list. */
  function isOverdueRow(row, today) {
    if (!row || isClosedKey(row.statutKey)) return false;
    var due = String(row.due || '');
    return /^\d{4}-\d{2}-\d{2}/.test(due) && due.slice(0, 10) < String(today || '');
  }

  /**
   * Rows that pass the text search and the hide-completed rule.
   * Facets (blocked, overdue) are applied by the caller so chip counts stay stable while a facet is on.
   */
  function rowsInView(rows, lists, opts) {
    opts = opts || {};
    var TM = global.TableModel;
    var q = String(opts.filter || '').trim();
    var visible = q && TM ? TM.filterRows(rows, q) : (rows || []).slice();
    if (opts.hideDone) {
      var closed = Object.create(null);
      (lists || []).forEach(function (l) {
        if (isClosedKey(l.category)) closed[l.id] = true;
      });
      visible = visible.filter(function (r) { return !closed[r.listId]; });
    }
    return visible;
  }

  /** How many of `rows` are blocked, and how many are overdue on `today` (YYYY-MM-DD). */
  function facetCounts(rows, today) {
    var blocked = 0;
    var overdue = 0;
    (rows || []).forEach(function (r) {
      if (isBlockedRow(r)) blocked += 1;
      if (isOverdueRow(r, today)) overdue += 1;
    });
    return { blocked: blocked, overdue: overdue };
  }

  /**
   * One column per board list (in board order), each with its cards sorted by Trello `pos`.
   * opts: { filter, hideDone, blocked, overdue, today } — hideDone drops the cards of completed/canceled
   * lists (the column itself stays so cards can still be dropped into it). blocked and overdue are
   * AND facets on top of the text filter.
   */
  function buildColumns(rows, lists, opts) {
    opts = opts || {};
    var visible = rowsInView(rows, lists, opts);
    if (opts.blocked) visible = visible.filter(isBlockedRow);
    if (opts.overdue) visible = visible.filter(function (r) { return isOverdueRow(r, opts.today); });
    var byList = Object.create(null);
    visible.forEach(function (r) {
      (byList[r.listId] = byList[r.listId] || []).push(r);
    });
    return (lists || []).map(function (l) {
      var all = rows.filter(function (r) {
        return r.listId === l.id;
      }).length;
      var closed = isClosedKey(l.category);
      var cards = opts.hideDone && closed ? [] : (byList[l.id] || []).slice().sort(function (a, b) {
        return a.pos - b.pos;
      });
      return { list: l, cards: cards, total: all, hidden: !!(opts.hideDone && closed && all) };
    });
  }

  /** Priority tiers, most urgent first (same order and names as PriorityUI.TIER_DEFS; `tierI` is the index). */
  var TIER_LABELS = ['Critique', 'Urgente', 'Prioritaire', 'Importante', 'Flexible', 'Secondaire', 'Optionnelle'];
  var NO_PRIORITY_LANE = 'none';

  /** Swimlane a card sits in: `tier:<tierI>` (0 = Critique), or `none` when it has no priority tier. */
  function laneKey(row) {
    var i = row && row.tierI;
    return typeof i === 'number' && isFinite(i) && i >= 0 && i < TIER_LABELS.length ? 'tier:' + Math.round(i) : NO_PRIORITY_LANE;
  }

  /**
   * Lanes for the priority view: the same columns as buildColumns (X axis), cut into one horizontal lane per
   * priority tier, Critique at the top, "Sans priorité" last (Y axis). Every lane is returned, even an empty one.
   * opts: same as buildColumns, plus `tiers` ([{ i, label, color }]) to override the built-in names / add colours.
   * Returns { columns, lanes: [{ key, label, color, count, cells: [{ list, cards, hidden }] }] }; a lane's cells
   * line up with `columns`, and a card is in exactly one lane, so dropping inside its own lane never changes its priority.
   */
  function buildLanes(rows, lists, opts) {
    opts = opts || {};
    var columns = buildColumns(rows, lists, opts);
    var defs = TIER_LABELS.map(function (label, i) {
      var custom = (opts.tiers || []).filter(function (t) { return t && t.i === i; })[0] || {};
      return { key: 'tier:' + i, label: custom.label || label, color: custom.color || '' };
    });
    defs.push({ key: NO_PRIORITY_LANE, label: 'Sans priorité', color: '' });
    var lanes = defs.map(function (def) {
      var cells = columns.map(function (c) {
        return { list: c.list, hidden: c.hidden, cards: c.cards.filter(function (r) { return laneKey(r) === def.key; }) };
      });
      var count = cells.reduce(function (n, cell) { return n + cell.cards.length; }, 0);
      return { key: def.key, label: def.label, color: def.color, count: count, cells: cells };
    });
    return { columns: columns, lanes: lanes };
  }

  /** Cards of the target list (minus the moved one) in pos order — what `dropPos` needs. */
  function siblingsFor(rows, listId, movedId) {
    return rows
      .filter(function (r) {
        return r.listId === listId && r.id !== movedId;
      })
      .sort(function (a, b) {
        return a.pos - b.pos;
      });
  }

  /** Index at which a card dropped at vertical position `y` lands among card rects (top/bottom). */
  function insertIndex(rects, y) {
    for (var i = 0; i < rects.length; i++) {
      if (y < rects[i].top + (rects[i].bottom - rects[i].top) / 2) return i;
    }
    return rects.length;
  }

  /** Index at which a column dropped at horizontal position `x` lands among column rects (left/right), dragged one excluded. */
  function columnInsertIndex(rects, x) {
    for (var i = 0; i < rects.length; i++) {
      if (x < rects[i].left + (rects[i].right - rects[i].left) / 2) return i;
    }
    return rects.length;
  }

  /** `lists` with the one `id` moved to `index` among the others. Returns a new array (unchanged if `id` is unknown). */
  function reorderLists(lists, id, index) {
    var moved = lists.filter(function (l) { return l.id === id; })[0];
    if (!moved) return lists.slice();
    var rest = lists.filter(function (l) { return l.id !== id; });
    var at = Math.max(0, Math.min(index, rest.length));
    return rest.slice(0, at).concat([moved], rest.slice(at));
  }

  global.KanbanModel = {
    columnInsertIndex: columnInsertIndex,
    reorderLists: reorderLists,
    buildColumns: buildColumns,
    buildLanes: buildLanes,
    laneKey: laneKey,
    TIER_LABELS: TIER_LABELS,
    rowsInView: rowsInView,
    facetCounts: facetCounts,
    isBlockedRow: isBlockedRow,
    isOverdueRow: isOverdueRow,
    siblingsFor: siblingsFor,
    insertIndex: insertIndex,
    isClosedKey: isClosedKey,
  };
})(typeof window !== 'undefined' ? window : this);
