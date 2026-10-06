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

  async function restAuth(t) {
    var api = await t.getRestApi();
    if (!(await api.isAuthorized())) throw Object.assign(new Error('not-authorized'), { reason: 'not-authorized' });
    var cfg = global.PriorityRestConfig;
    var token = await api.getToken();
    if (!cfg || !cfg.appKey || !token) throw Object.assign(new Error('no-token'), { reason: 'no-token' });
    return '?key=' + encodeURIComponent(cfg.appKey) + '&token=' + encodeURIComponent(token);
  }

  /** Uploads a File (image, document...) as a Trello attachment of the card. */
  async function attachFile(t, cardId, file) {
    var auth = await restAuth(t);
    var form = new FormData();
    form.append('file', file, file.name || 'fichier');
    form.append('name', file.name || 'fichier');
    var res = await fetch('https://api.trello.com/1/cards/' + encodeURIComponent(cardId) + '/attachments' + auth, { method: 'POST', body: form });
    if (!res.ok) throw new Error('Pièce jointe refusée (' + res.status + ')');
  }

  /** Adds a link as a Trello attachment (Trello shows a preview). */
  async function attachUrl(t, cardId, url) {
    var auth = await restAuth(t);
    var res = await fetch('https://api.trello.com/1/cards/' + encodeURIComponent(cardId) + '/attachments' + auth + '&url=' + encodeURIComponent(url), { method: 'POST' });
    if (!res.ok) throw new Error('Lien refusé (' + res.status + ')');
  }

  /**
   * Creates one card per task in the triage list (fallback: backlog, then the first list).
   * A task is a name or { title, desc, urls: [string], files: [File] }; description and attachments are
   * best effort: a failure is reported in `failed` and never loses the card.
   */
  async function ingest(t, tasks, lists) {
    var list = listFor(lists, ['triage', 'backlog', 'unstarted']) || lists[0];
    if (!list) throw new Error('Aucune liste disponible');
    var created = [];
    var failed = [];
    for (var i = 0; i < tasks.length; i++) {
      var task = typeof tasks[i] === 'string' ? { title: tasks[i] } : tasks[i];
      var res = await TT().createRow(t, task.title, list.id);
      var id = res && res.cardId;
      created.push(id);
      if (!id) continue;
      if (task.desc) {
        try {
          var put = await PT().restPutCard(t, id, { desc: task.desc });
          if (put && put.ok === false) throw new Error(put.reason);
        } catch (e) {
          failed.push('description de « ' + task.title + ' »');
        }
      }
      var urls = task.urls || [];
      for (var u = 0; u < urls.length; u++) {
        try {
          await attachUrl(t, id, urls[u]);
        } catch (e) {
          failed.push('lien ' + urls[u]);
        }
      }
      var files = task.files || [];
      for (var f = 0; f < files.length; f++) {
        try {
          await attachFile(t, id, files[f]);
        } catch (e) {
          failed.push((files[f] && files[f].name) || 'fichier');
        }
      }
    }
    return { list: list, created: created, failed: failed };
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
    attachFile: attachFile,
    attachUrl: attachUrl,
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
