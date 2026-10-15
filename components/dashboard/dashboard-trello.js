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
      row.dueVague = (rec.inputs && rec.inputs.dueVague) || '';
      row.dueMode = (rec.inputs && rec.inputs.dueMode) || '';
      row.startTime = rec.startTime || '';
      row.dueTime = rec.dueTime || '';
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

  /**
   * Makes sure the board has a triage list: an existing list whose name reads like one ("Inbox", "À trier"...)
   * is assigned the triage Statut, otherwise an "Inbox" list is created at the left of the board.
   */
  async function ensureInbox(t, lists) {
    var SM = global.StatutMatch;
    var ST = global.StatutTrello;
    var plain = (lists || []).map(function (l) { return { id: String(l.id), name: l.name }; });
    var found = null;
    if (SM && typeof SM.detectFromLists === 'function') {
      var cats = SM.detectFromLists(plain).listCategories || {};
      found = Object.keys(cats).filter(function (id) { return cats[id] === 'triage'; })[0] || null;
    }
    var created = false;
    if (!found) {
      var boardId = (await t.board('id')).id;
      var res = await global.SheetsTrello.trelloRest(t, '/lists?name=' + encodeURIComponent('Inbox') + '&idBoard=' + encodeURIComponent(boardId) + '&pos=top', 'POST');
      if (!res.ok || !res.data || !res.data.id) throw Object.assign(new Error(res.reason || 'list-create-failed'), { reason: res.reason });
      found = String(res.data.id);
      created = true;
    }
    var settings = await ST.readStatutSettings(t);
    settings.listCategories = Object.assign({}, settings.listCategories);
    settings.listCategories[found] = 'triage';
    settings.initialized = true;
    await ST.saveStatutSettings(t, settings);
    return { listId: found, created: created };
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
    var list = listFor(lists, ['triage']);
    if (!list) throw Object.assign(new Error('no-triage-list'), { reason: 'no-triage-list' });
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
      if (task.due) {
        try {
          await planDay(t, id, task.due);
        } catch (e) {
          failed.push('échéance de « ' + task.title + ' »');
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

  /**
   * What a board row shows for stored priority inputs: { priority, tier, tierI }, the same numbers
   * GanttTrello.loadBoard puts on a row. null when the priority is off or cannot be computed.
   */
  async function displayOf(t, inputs) {
    var pt = PT();
    if (!inputs || !pt || typeof pt.computeDisplay !== 'function' || typeof pt.ensureBoardPriorityContext !== 'function') return null;
    try {
      var settings = await pt.ensureBoardPriorityContext(t);
      var d = pt.computeDisplay(inputs, settings);
      if (!d || d.priorityEnabled === false || typeof d.score !== 'number') return null;
      return {
        priority: Math.round(d.score * 10) / 10,
        tier: d.matrixLabel || d.tierLabel || d.label || '',
        tierI: d.tierI != null ? d.tierI : null,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Patch of { impact, ease, empressement } merged into the card's stored priority inputs.
   * Resolves the new { priority, tier, tierI } (or null) so a view can show the score without reloading the board.
   */
  async function savePriority(t, cardId, patch) {
    var pt = PT();
    var cur = (await pt.getCardInputsById(t, cardId)) || {};
    var saved = await pt.saveCardInputsById(t, cardId, Object.assign({}, cur, patch));
    return displayOf(t, saved);
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

  /**
   * Place a card on a calendar day, or on a vague horizon.
   * A horizon clears the hard date (same idea as setSomeday) so it stays off the day board.
   * A day clears the horizon.
   */
  async function planAt(t, cardId, iso, vagueId, time) {
    var hhmm = time || '';
    if (vagueId) {
      await savePriority(t, cardId, {
        dueMode: 'vague',
        dueVague: vagueId,
        dueDate: '',
        startDate: '',
        startTime: '',
        dueTime: '',
      });
      try {
        var put = await PT().restPutCard(t, cardId, { due: null, start: null });
        if (put && put.ok === false) throw new Error(put.reason || 'dates-failed');
      } catch (e) {
        /* the horizon still keeps the card off the day board */
      }
      return;
    }
    var saved = await GT().saveCardDates(t, cardId, {
      startDate: iso || '',
      dueDate: iso || '',
      startTime: hhmm,
      dueTime: hhmm,
    });
    if (!saved || !saved.ok) {
      var err = new Error((saved && saved.reason) || 'dates-failed');
      err.reason = saved && saved.reason;
      throw err;
    }
    await savePriority(t, cardId, {
      dueMode: 'precise',
      dueVague: '',
      dueDate: iso || '',
      startDate: iso || '',
      startTime: hhmm,
      dueTime: hhmm,
    });
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

  async function setSomeday(t, row, lists) {
    await savePriority(t, row.id, {
      dueMode: 'vague',
      dueVague: 'eventuellement',
      dueDate: '',
      startDate: '',
    });
    try {
      var put = await PT().restPutCard(t, row.id, { due: null, start: null });
      if (put && put.ok === false) throw new Error(put.reason || 'dates-failed');
    } catch (e) {
      /* the vague flag keeps the card off the planner even if Trello keeps a date */
    }
    row.dueVague = 'eventuellement';
    row.due = '';
    row.start = '';
    row.dueTime = '';
    return moveToCategory(t, row, lists, ['backlog', 'unstarted']);
  }

  async function setWaiting(t, row, lists, who) {
    var name = String(who || '').replace(/\s+/g, ' ').trim();
    if (!name) return null;
    var meta = global.DescMeta;
    var desc = row.fullDesc || row.desc || '';
    if (meta && typeof meta.setMeta === 'function') {
      desc = meta.setMeta(desc, 'waiting', name);
      desc = meta.setMeta(desc, 'waiting-since', new Date().toISOString().slice(0, 10));
    }
    var put = await PT().restPutCard(t, row.id, { desc: desc });
    if (put && put.ok === false) throw new Error(put.reason || 'desc-failed');
    row.fullDesc = desc;
    row.waiting = name;
    row.waitingSince = desc && meta ? meta.getMeta(desc, 'waiting-since') : '';
    return moveToCategory(t, row, lists, ['backlog', 'unstarted']);
  }

  /**
   * Makes `text` the card's next step (DashboardModel.withNextStep): it rewrites the open first step or adds
   * one on top, so typing the same field twice never stacks two steps.
   */
  async function saveNextStep(t, cardId, text) {
    var ct = CT();
    var clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean || !ct) return;
    var data = ct.normalizeCompletionData((await ct.getCardCompletionById(t, cardId)) || { items: [] });
    var items = global.DashboardModel.withNextStep(data.items, clean);
    if (items === data.items) return;
    await ct.saveCardCompletionById(t, cardId, Object.assign({}, data, { items: items }));
  }

  /**
   * Keeps the card's title (and note) as a line of the "Références" document.
   * Resolves { docId, added }: what to take out again to undo it (unfileReference).
   */
  async function fileReference(t, row) {
    var docs = global.DocsTrello;
    if (!docs || typeof docs.listDocs !== 'function') {
      throw Object.assign(new Error('no-docs'), { reason: 'no-docs' });
    }
    var line = '- ' + (row.name || 'Note');
    var extra = row.desc ? '\n\n' + row.desc : '';
    var list = await docs.listDocs(t);
    var found = (list || []).filter(function (d) { return d.title === 'Références'; })[0];
    if (!found) {
      var made = await docs.createDoc(t, 'Références', line + extra);
      return { docId: made && made.id ? String(made.id) : '', added: line + extra };
    }
    var full = await docs.loadDoc(t, found.id);
    var body = String(full.body || '').replace(/\s+$/, '');
    var added = (body ? '\n' : '') + line + extra;
    await docs.saveDoc(t, { id: full.id, body: body + added, rev: full.rev, cover: full.cover, subject: full.subject, props: full.props });
    return { docId: String(full.id), added: added };
  }

  /** Takes a line filed by fileReference out of the "Références" document; a document edited since stays as it is. */
  async function unfileReference(t, ref) {
    var docs = global.DocsTrello;
    if (!ref || !ref.added || !docs || typeof docs.listDocs !== 'function') return;
    var list = await docs.listDocs(t);
    var found = (list || []).filter(function (d) { return ref.docId ? d.id === ref.docId : d.title === 'Références'; })[0];
    if (!found) return;
    var full = await docs.loadDoc(t, found.id);
    var body = String(full.body || '');
    var at = body.lastIndexOf(ref.added);
    if (at < 0) return;
    var next = (body.slice(0, at) + body.slice(at + ref.added.length)).replace(/\s+$/, '');
    await docs.saveDoc(t, { id: full.id, body: next, rev: full.rev, cover: full.cover, subject: full.subject, props: full.props });
  }

  /** Writes back the dates of a card as they were: { start, due, startTime, dueTime, dueVague, dueMode }. */
  async function restoreDates(t, cardId, d) {
    var saved = await GT().saveCardDates(t, cardId, {
      startDate: d.start || '',
      dueDate: d.due || '',
      startTime: d.startTime || '',
      dueTime: d.dueTime || '',
    });
    if (!saved || !saved.ok) {
      var err = new Error((saved && saved.reason) || 'dates-failed');
      err.reason = saved && saved.reason;
      throw err;
    }
    await savePriority(t, cardId, {
      dueMode: d.dueMode || '',
      dueVague: d.dueVague || '',
      dueDate: d.due || '',
      startDate: d.start || '',
      startTime: d.startTime || '',
      dueTime: d.dueTime || '',
    });
  }

  /**
   * Puts a card back in the triage list, at its old place, and undoes what the decision wrote.
   * snap: { id, listId, pos, archived?, reference?, restoreDesc?, fullDesc?, restoreDates?, local? }
   *   archived       the decision archived the card (no "Annulé" list)
   *   reference      what fileReference returned
   *   restoreDesc    write `fullDesc` back (a waiting name lives in the description)
   *   restoreDates   write the dates of `local` back (a "Un jour" horizon cleared them)
   */
  async function restoreTriage(t, snap) {
    if (snap.reference) await unfileReference(t, snap.reference);
    if (snap.archived) await TT().unarchiveCard(t, snap.id);
    await TT().moveCard(t, snap.id, snap.listId, snap.pos);
    if (snap.restoreDesc) {
      var put = await PT().restPutCard(t, snap.id, { desc: snap.fullDesc || '' });
      if (put && put.ok === false) throw new Error(put.reason || 'desc-failed');
    }
    if (snap.restoreDates) await restoreDates(t, snap.id, snap.local || {});
  }

  var SCALE_KEY = 'tp-dashboard-scale';

  function getScale() {
    try {
      var id = global.localStorage.getItem(SCALE_KEY) || 'day';
      var known = global.DashboardModel && global.DashboardModel.SCALES;
      if (known && !known.some(function (s) { return s.id === id; })) return 'day';
      return id;
    } catch (e) {
      return 'day';
    }
  }

  function setScale(id) {
    try {
      global.localStorage.setItem(SCALE_KEY, id || 'day');
    } catch (e) {
      /* storage unavailable: the scale stays for this session */
    }
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
    ensureInbox: ensureInbox,
    attachFile: attachFile,
    attachUrl: attachUrl,
    moveToCategory: moveToCategory,
    savePriority: savePriority,
    saveEstimate: saveEstimate,
    planDay: planDay,
    planAt: planAt,
    complete: complete,
    cancel: cancel,
    saveNextStep: saveNextStep,
    fileReference: fileReference,
    unfileReference: unfileReference,
    restoreTriage: restoreTriage,
    setWaiting: setWaiting,
    setSomeday: setSomeday,
    getCapacity: getCapacity,
    setCapacity: setCapacity,
    getScale: getScale,
    setScale: setScale,
  };
})(typeof window !== 'undefined' ? window : this);
