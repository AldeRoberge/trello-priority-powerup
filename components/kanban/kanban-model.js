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

  /**
   * One column per board list (in board order), each with its cards sorted by Trello `pos`.
   * opts: { filter: string, hideDone: bool } — hideDone drops the cards of completed/canceled lists
   * (the column itself stays so cards can still be dropped into it).
   */
  function buildColumns(rows, lists, opts) {
    opts = opts || {};
    var TM = global.TableModel;
    var q = String(opts.filter || '').trim();
    var visible = q && TM ? TM.filterRows(rows, q) : rows;
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
    siblingsFor: siblingsFor,
    insertIndex: insertIndex,
    isClosedKey: isClosedKey,
  };
})(typeof window !== 'undefined' ? window : this);
