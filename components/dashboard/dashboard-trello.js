/*
 * Role: Trello I/O for the Dashboard view. Trello stays the source of truth (no storage of its own):
 *  - load        rows = TableModel rows + { start, dueDone, estimate } from GanttTrello.loadBoard
 *  - ingest      creates cards in the board's triage list (TableTrello.createRow)
 *  - triage      moves a card to the list of a Statut category, sets priority inputs / estimate
 *  - plan        writes a card's planned day as start + due (GanttTrello.saveCardDates)
 *  - complete    dueComplete + move to the completed list
 */
(function (global) {
  'use strict';

  var CAPACITY_KEY = 'tp-dashboard-capacity';

  function GT() {
    return global.GanttTrello;
  }
  function PT() {
    return global.PriorityTrello;
  }
  function TT() {
    return global.TableTrello;
  }
  function CT() {
    return global.CompletionTrello;
  }
  function TM() {
    return global.TableModel;
  }

  async function load(t) {
    var board = await GT().loadBoard(t);
    var rows = board.cards.map(function (rec) {
      var row = TM().rowFromRecord(rec, '');
      row.start = rec.startDate || '';
      row.dueDone = !!rec.dueComplete;
      row.estimate = rec.estimatedMinutes || 0;
      return row;
    });
    return {
      lists: TM().enrichLists(board.lists, board.settings, global.StatutMatch),
      rows: TM().orderByLists(rows, board.lists),
    };
  }

  /** First list of a category, trying `cats` in order (e.g. ['unstarted', 'backlog']). */
  function listFor(lists, cats) {
    for (var i = 0; i < cats.length; i++) {
      for (var j = 0; j < lists.length; j++) if (lists[j].category === cats[i]) return lists[j];
    }
    return null;
  }

  /** Creates one card per name in the triage list (fallback: backlog, then the first list). */
  async function ingest(t, names, lists) {
    var list = listFor(lists, ['triage', 'backlog', 'unstarted']) || lists[0];
    if (!list) throw new Error('Aucune liste disponible');
    var created = [];
    for (var i = 0; i < names.length; i++) {
      var res = await TT().createRow(t, names[i], list.id);
      created.push(res && res.cardId);
    }
    return { list: list, created: created };
  }

  async function moveToCategory(t, row, lists, cats) {
    var list = listFor(lists, cats);
    if (!list) return null;
    await TT().moveCard(t, row.id, list.id, 'bottom');
    return list;
  }

  /** Patch of { impact, ease, empressement } merged into the card's stored priority inputs. */
  async function savePriority(t, cardId, patch) {
    var pt = PT();
    var cur = (await pt.getCardInputsById(t, cardId)) || {};
    await pt.saveCardInputsById(t, cardId, Object.assign({}, cur, patch));
  }

  async function saveEstimate(t, cardId, minutes) {
    var ct = CT();
    var data = ct.normalizeCompletionData((await ct.getCardCompletionById(t, cardId)) || { items: [] });
    await ct.saveCardCompletionById(t, cardId, Object.assign({}, data, { estimatedMinutes: minutes > 0 ? Math.round(minutes) : 0 }));
  }

  /** Planned day → start + due on that day ('' clears both). */
  async function planDay(t, cardId, iso) {
    var res = await GT().saveCardDates(t, cardId, { startDate: iso || '', dueDate: iso || '' });
    if (!res || !res.ok) {
      var err = new Error((res && res.reason) || 'dates-failed');
      err.reason = res && res.reason;
      throw err;
    }
  }

  async function complete(t, row, lists, done) {
    var auth = await GT().ensureRestAuthorized(t);
    if (!auth.ok) throw Object.assign(new Error(auth.reason || 'not-authorized'), { reason: auth.reason });
    var res = await PT().restPutCard(t, row.id, { dueComplete: !!done });
    if (res && res.ok === false) throw new Error(res.reason || 'trello-write-failed');
    if (done) await moveToCategory(t, row, lists, ['completed']);
  }

  async function cancel(t, row, lists) {
    var moved = await moveToCategory(t, row, lists, ['canceled']);
    if (!moved) await TT().archiveCard(t, row.id);
  }

  function getCapacity() {
    try {
      var n = Number(global.localStorage.getItem(CAPACITY_KEY));
      return n >= 60 && n <= 1440 ? n : global.DashboardModel.DEFAULT_CAPACITY;
    } catch (e) {
      return global.DashboardModel.DEFAULT_CAPACITY;
    }
  }

  function setCapacity(minutes) {
    try {
      global.localStorage.setItem(CAPACITY_KEY, String(minutes));
    } catch (e) {
      /* storage unavailable: capacity stays per session */
    }
  }

  global.DashboardTrello = {
    load: load,
    listFor: listFor,
    ingest: ingest,
    moveToCategory: moveToCategory,
    savePriority: savePriority,
    saveEstimate: saveEstimate,
    planDay: planDay,
    complete: complete,
    cancel: cancel,
    getCapacity: getCapacity,
    setCapacity: setCapacity,
  };
})(typeof window !== 'undefined' ? window : this);
