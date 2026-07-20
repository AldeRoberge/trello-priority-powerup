/* Gantt chart — board load + by-cardId date persistence. */
(function (global) {
  'use strict';

  function GM() {
    return global.GanttModel || null;
  }

  function PT() {
    return global.PriorityTrello || null;
  }

  function CT() {
    return global.CompletionTrello || null;
  }

  function ST() {
    return global.StatutTrello || null;
  }

  function SM() {
    return global.StatutMatch || null;
  }

  function PU() {
    return global.PriorityUI || null;
  }

  function isoDateFromTrello(value) {
    var ui = PU();
    if (!value) return '';
    if (ui && typeof ui.parseTrelloDueToParts === 'function') {
      var parts = ui.parseTrelloDueToParts(value);
      return parts && parts.dueDate ? parts.dueDate : '';
    }
    var model = GM();
    if (model && typeof model.parseIsoDate === 'function') {
      var d = model.parseIsoDate(String(value));
      return d ? model.toIsoDate(d) : '';
    }
    return '';
  }

  function resolveCardDates(card, inputs) {
    var startDate = '';
    var dueDate = '';
    var dueTime = '';

    if (inputs) {
      if (typeof inputs.startDate === 'string' && inputs.startDate) {
        startDate = inputs.startDate;
      }
      if (typeof inputs.dueDate === 'string' && inputs.dueDate) {
        dueDate = inputs.dueDate;
      }
      if (typeof inputs.dueTime === 'string' && inputs.dueTime) {
        dueTime = inputs.dueTime;
      }
    }

    if (!dueDate && card && card.due) {
      dueDate = isoDateFromTrello(card.due);
    }
    if (!startDate && card && card.start) {
      startDate = isoDateFromTrello(card.start);
    }

    return { startDate: startDate, dueDate: dueDate, dueTime: dueTime };
  }

  function categoryForList(settings, listId) {
    if (!settings || !listId) return null;
    var cats = settings.listCategories || {};
    var cat = cats[String(listId)];
    return cat || null;
  }

  function colorForCategory(category, settings) {
    var match = SM();
    if (settings && settings.stateColors && match && match.applyStateColors) {
      match.applyStateColors(settings.stateColors);
    }
    if (match && typeof match.categoryStyle === 'function') {
      var style = match.categoryStyle(category || '_none');
      return style && style.color ? style.color : '#626f86';
    }
    return '#626f86';
  }

  function estimatedMinutesFromCompletion(completion) {
    var ct = CT();
    if (!ct || !completion) return null;
    if (typeof ct.computeEstimatedTotal === 'function') {
      var mins = ct.computeEstimatedTotal(completion);
      return typeof mins === 'number' && mins > 0 ? mins : null;
    }
    if (
      typeof completion.estimatedMinutes === 'number' &&
      completion.estimatedMinutes > 0
    ) {
      return Math.round(completion.estimatedMinutes);
    }
    return null;
  }

  /**
   * Load all open board cards with dates, progress, statut, and nest tree.
   */
  async function loadBoard(t) {
    var lists = [];
    var cards = [];
    try {
      lists = (await t.lists('id', 'name')) || [];
    } catch (err) {
      console.error('GanttTrello.loadBoard lists failed', err);
      lists = [];
    }
    try {
      cards =
        (await t.cards(
          'id',
          'name',
          'idList',
          'due',
          'start',
          'dueComplete',
          'pos'
        )) || [];
    } catch (err) {
      console.error('GanttTrello.loadBoard cards failed', err);
      cards = [];
    }

    var listNameById = Object.create(null);
    for (var li = 0; li < lists.length; li++) {
      if (lists[li] && lists[li].id) {
        listNameById[String(lists[li].id)] = lists[li].name || '';
      }
    }

    var settings = null;
    var statut = ST();
    if (statut && typeof statut.ensureStatutSettings === 'function') {
      try {
        settings = await statut.ensureStatutSettings(t);
      } catch (e) {
        settings = null;
      }
    } else if (statut && typeof statut.readStatutSettings === 'function') {
      try {
        settings = await statut.readStatutSettings(t);
      } catch (e) {
        settings = null;
      }
    }

    var pt = PT();
    var ct = CT();
    var records = [];

    for (var ci = 0; ci < cards.length; ci++) {
      var card = cards[ci];
      if (!card || !card.id) continue;
      var cardId = String(card.id);
      var inputs = null;
      var completion = { items: [] };

      if (pt && typeof pt.getCardInputsById === 'function') {
        try {
          inputs = await pt.getCardInputsById(t, cardId);
        } catch (e) {
          inputs = null;
        }
      }
      if (ct && typeof ct.getCardCompletionById === 'function') {
        try {
          completion = (await ct.getCardCompletionById(t, cardId)) || {
            items: [],
          };
        } catch (e) {
          completion = { items: [] };
        }
      }

      var dates = resolveCardDates(card, inputs);
      var progress = 0;
      if (ct && typeof ct.computeCardProgress === 'function') {
        var prog = ct.computeCardProgress(completion);
        progress = prog && typeof prog.percent === 'number' ? prog.percent : 0;
      }

      var listId = card.idList != null ? String(card.idList) : null;
      var category = categoryForList(settings, listId);

      records.push({
        id: cardId,
        name: card.name || '',
        listId: listId,
        listName: listId ? listNameById[listId] || '' : '',
        pos: typeof card.pos === 'number' ? card.pos : Number(card.pos) || 0,
        due: card.due || null,
        start: card.start || null,
        dueComplete: !!card.dueComplete,
        startDate: dates.startDate,
        dueDate: dates.dueDate,
        dueTime: dates.dueTime,
        progress: progress,
        estimatedMinutes: estimatedMinutesFromCompletion(completion),
        items: Array.isArray(completion.items) ? completion.items : [],
        category: category,
        color: colorForCategory(category, settings),
        inputs: inputs,
      });
    }

    records.sort(function (a, b) {
      return (a.pos || 0) - (b.pos || 0);
    });

    var model = GM();
    var tree =
      model && typeof model.buildNestTree === 'function'
        ? model.buildNestTree(records)
        : [];

    return {
      lists: lists,
      cards: records,
      tree: tree,
      settings: settings,
    };
  }

  async function ensureRestAuthorized(t) {
    var pt = PT();
    if (!pt) return { ok: false, reason: 'no-priority-trello' };
    if (typeof pt.isRestAuthorized === 'function') {
      try {
        var ok = await pt.isRestAuthorized(t);
        if (ok) return { ok: true, already: true };
      } catch (e) {
        /* fall through */
      }
    }
    if (typeof pt.authorizeRestForAutoSort !== 'function') {
      return { ok: false, reason: 'no-authorize' };
    }
    try {
      await pt.authorizeRestForAutoSort(t);
      return { ok: true, already: false };
    } catch (err) {
      return {
        ok: false,
        reason: 'auth-failed',
        error: err && err.message ? err.message : String(err),
      };
    }
  }

  function buildInputsForDates(existingInputs, startDate, dueDate, dueTime) {
    var pt = PT();
    var base = existingInputs
      ? Object.assign({}, existingInputs)
      : Object.assign({}, (pt && pt.DEFAULT_INPUTS) || { urgency: 2, impact: 2, ease: 3 }, {
          priorityEnabled: false,
        });

    var ui = PU();
    var nextStart =
      startDate && ui && ui.normalizeDueDate
        ? ui.normalizeDueDate(startDate)
        : startDate
          ? String(startDate).trim()
          : '';
    var nextDue =
      dueDate && ui && ui.normalizeDueDate
        ? ui.normalizeDueDate(dueDate)
        : dueDate
          ? String(dueDate).trim()
          : '';

    if (nextStart) base.startDate = nextStart;
    else delete base.startDate;

    if (nextDue) {
      base.dueDate = nextDue;
      if (dueTime) base.dueTime = dueTime;
      else delete base.dueTime;
      delete base.dueEnabled;
    } else {
      delete base.dueDate;
      delete base.dueTime;
      delete base.dueEnabled;
    }

    if (pt && typeof pt.normalizeInputs === 'function') {
      var normalized = pt.normalizeInputs(base);
      return normalized || base;
    }
    return base;
  }

  function toDueIso(dueDate, dueTime) {
    var ui = PU();
    if (!dueDate) return '';
    if (ui && typeof ui.inputsToTrelloDueIso === 'function') {
      return ui.inputsToTrelloDueIso({ dueDate: dueDate, dueTime: dueTime }) || '';
    }
    if (ui && typeof ui.canonicalizeTrelloDueIso === 'function') {
      return ui.canonicalizeTrelloDueIso(dueDate + 'T12:00:00') || '';
    }
    return dueDate + 'T12:00:00.000Z';
  }

  function toStartIso(startDate) {
    var ui = PU();
    if (!startDate) return '';
    if (ui && typeof ui.inputsToTrelloStartIso === 'function') {
      return ui.inputsToTrelloStartIso({ startDate: startDate }) || '';
    }
    return toDueIso(startDate, null);
  }

  /**
   * Persist start/due for an arbitrary card id (board Gantt context).
   * Writes cardPriority + sync markers + Trello REST due/start.
   */
  async function saveCardDates(t, cardId, parts, options) {
    options = options || {};
    var id = cardId != null ? String(cardId).trim() : '';
    if (!id) return { ok: false, reason: 'no-card-id' };

    var pt = PT();
    if (!pt || typeof pt.restPutCard !== 'function') {
      return { ok: false, reason: 'no-rest' };
    }

    var auth = await ensureRestAuthorized(t);
    if (!auth.ok) return Object.assign({ ok: false }, auth);

    var existing = null;
    if (typeof pt.getCardInputsById === 'function') {
      try {
        existing = await pt.getCardInputsById(t, id);
      } catch (e) {
        existing = null;
      }
    }
    if (options.existingInputs) existing = options.existingInputs;

    var startDate = parts && parts.startDate ? parts.startDate : '';
    var dueDate = parts && parts.dueDate ? parts.dueDate : '';
    var dueTime =
      parts && parts.dueTime
        ? parts.dueTime
        : existing && existing.dueTime
          ? existing.dueTime
          : '';

    // Single-day bars: if start === due keep both; clear start when only due intended is ok.
    var nextInputs = buildInputsForDates(existing, startDate, dueDate, dueTime);

    var dueIso = toDueIso(dueDate, dueTime);
    var startIso = toStartIso(startDate);

    var ui = PU();
    if (ui && typeof ui.canonicalizeTrelloDueIso === 'function') {
      dueIso = dueIso ? ui.canonicalizeTrelloDueIso(dueIso) || dueIso : '';
      startIso = startIso ? ui.canonicalizeTrelloDueIso(startIso) || startIso : '';
    }

    try {
      await t.set(id, 'shared', pt.CARD_PRIORITY_KEY || 'cardPriority', nextInputs);
      await t.set(
        id,
        'shared',
        pt.CARD_DUE_SYNCED_KEY || 'cardDueSyncedIso',
        dueIso || ''
      );
      await t.set(
        id,
        'shared',
        pt.CARD_START_SYNCED_KEY || 'cardStartSyncedIso',
        startIso || ''
      );
    } catch (storeErr) {
      console.error('GanttTrello.saveCardDates store failed', storeErr);
      return {
        ok: false,
        reason: 'store-failed',
        error: storeErr && storeErr.message ? storeErr.message : String(storeErr),
      };
    }

    var body = {
      due: dueIso || null,
      start: startIso || null,
    };

    try {
      var put = await pt.restPutCard(t, id, body);
      if (!put || !put.ok) {
        return Object.assign({ ok: false, reason: 'rest-failed' }, put || {});
      }
    } catch (restErr) {
      console.error('GanttTrello.saveCardDates REST failed', restErr);
      return {
        ok: false,
        reason: 'rest-failed',
        error: restErr && restErr.message ? restErr.message : String(restErr),
      };
    }

    return {
      ok: true,
      cardId: id,
      startDate: startDate,
      dueDate: dueDate,
      dueIso: dueIso || null,
      startIso: startIso || null,
      inputs: nextInputs,
    };
  }

  global.GanttTrello = {
    loadBoard: loadBoard,
    ensureRestAuthorized: ensureRestAuthorized,
    saveCardDates: saveCardDates,
    resolveCardDates: resolveCardDates,
    buildInputsForDates: buildInputsForDates,
  };
})(typeof window !== 'undefined' ? window : this);
