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

  global.KanbanModel = {
    buildColumns: buildColumns,
    siblingsFor: siblingsFor,
    insertIndex: insertIndex,
    isClosedKey: isClosedKey,
  };
})(typeof window !== 'undefined' ? window : this);
