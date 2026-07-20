/* Gantt chart — board load + by-cardId date persistence. */
(function (global) {
  'use strict';

  var GANTT_SETTINGS_KEY = 'ganttSettings';
  var DEFAULT_GANTT_SETTINGS = {
    dayStart: '08:15',
    dayEnd: '16:45',
  };

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


  function normalizeGanttSettings(raw) {
    var model = GM();
    var dayStart =
      model && typeof model.normalizeWorkTime === 'function'
        ? model.normalizeWorkTime(
            raw && raw.dayStart,
            DEFAULT_GANTT_SETTINGS.dayStart
          )
        : DEFAULT_GANTT_SETTINGS.dayStart;
    var dayEnd =
      model && typeof model.normalizeWorkTime === 'function'
        ? model.normalizeWorkTime(
            raw && raw.dayEnd,
            DEFAULT_GANTT_SETTINGS.dayEnd
          )
        : DEFAULT_GANTT_SETTINGS.dayEnd;
    var parse =
      model && typeof model.parseTime === 'function' ? model.parseTime : null;
    var startParts = parse ? parse(dayStart) : null;
    var endParts = parse ? parse(dayEnd) : null;
    if (
      startParts &&
      endParts &&
      startParts.hours * 60 + startParts.minutes >=
        endParts.hours * 60 + endParts.minutes
    ) {
      dayStart = DEFAULT_GANTT_SETTINGS.dayStart;
      dayEnd = DEFAULT_GANTT_SETTINGS.dayEnd;
    }
    return { dayStart: dayStart, dayEnd: dayEnd };
  }

  async function getGanttSettings(t) {
    try {
      var raw = await t.get('board', 'shared', GANTT_SETTINGS_KEY);
      return normalizeGanttSettings(raw);
    } catch (err) {
      console.error('GanttTrello.getGanttSettings failed', err);
      return normalizeGanttSettings(null);
    }
  }

  async function saveGanttSettings(t, settings) {
    var normalized = normalizeGanttSettings(settings);
    await t.set('board', 'shared', GANTT_SETTINGS_KEY, normalized);
    return normalized;
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

  function isoTimeFromTrello(value) {
    var ui = PU();
    if (!value) return '';
    if (ui && typeof ui.parseTrelloDueToParts === 'function') {
      var parts = ui.parseTrelloDueToParts(value);
      return parts && parts.dueTime ? parts.dueTime : '';
    }
    return '';
  }

  function resolveCardDates(card, inputs) {
    var startDate = '';
    var dueDate = '';
    var startTime = '';
    var dueTime = '';

    if (inputs) {
      if (typeof inputs.startDate === 'string' && inputs.startDate) {
        startDate = inputs.startDate;
      }
      if (typeof inputs.dueDate === 'string' && inputs.dueDate) {
        dueDate = inputs.dueDate;
      }
      if (typeof inputs.startTime === 'string' && inputs.startTime) {
        startTime = inputs.startTime;
      }
      if (typeof inputs.dueTime === 'string' && inputs.dueTime) {
        dueTime = inputs.dueTime;
      }
    }

    if (!dueDate && card && card.due) {
      dueDate = isoDateFromTrello(card.due);
      if (!dueTime) dueTime = isoTimeFromTrello(card.due);
    }
    if (!startDate && card && card.start) {
      startDate = isoDateFromTrello(card.start);
      if (!startTime) startTime = isoTimeFromTrello(card.start);
    }

    return {
      startDate: startDate,
      dueDate: dueDate,
      startTime: startTime,
      dueTime: dueTime,
    };
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
          'desc',
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
        var ensured = await statut.ensureStatutSettings(t);
        // ensureStatutSettings returns { settings, lists, detected }.
        settings =
          ensured && ensured.settings ? ensured.settings : ensured || null;
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
    var prioritySettings = null;
    if (pt && typeof pt.ensureBoardPriorityContext === 'function') {
      try {
        prioritySettings = await pt.ensureBoardPriorityContext(t);
      } catch (e) {
        prioritySettings = null;
      }
    }

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
      var match = SM();
      var catStyle =
        match && typeof match.categoryStyle === 'function'
          ? match.categoryStyle(category || '_none')
          : null;

      var display = null;
      if (inputs && pt && typeof pt.computeDisplay === 'function') {
        try {
          display = pt.computeDisplay(inputs, prioritySettings);
        } catch (e) {
          display = null;
        }
      }

      var rank =
        pt && typeof pt.prioritySortRank === 'function'
          ? pt.prioritySortRank(display)
          : { tier: 100, score: -1 };

      var items = Array.isArray(completion.items) ? completion.items : [];

      records.push({
        id: cardId,
        name: card.name || '',
        desc: typeof card.desc === 'string' ? card.desc : '',
        listId: listId,
        listName: listId ? listNameById[listId] || '' : '',
        pos: typeof card.pos === 'number' ? card.pos : Number(card.pos) || 0,
        due: card.due || null,
        start: card.start || null,
        dueComplete: !!card.dueComplete,
        startDate: dates.startDate,
        dueDate: dates.dueDate,
        startTime: dates.startTime,
        dueTime: dates.dueTime,
        progress: progress,
        estimatedMinutes: estimatedMinutesFromCompletion(completion),
        items: items,
        subtaskCount: items.length,
        category: category,
        categoryIcon: catStyle && catStyle.icon ? catStyle.icon : null,
        categoryLabel:
          match && typeof match.categoryLabel === 'function' && category
            ? match.categoryLabel(category)
            : category || '',
        color: colorForCategory(category, settings),
        inputs: inputs,
        display: display,
        priorityScore:
          display && typeof display.score === 'number' ? display.score : null,
        priorityTierI:
          display && display.tierI != null ? display.tierI : null,
        priorityLabel:
          (display && (display.matrixLabel || display.tierLabel || display.label)) ||
          '',
        priorityFill: (display && display.fill) || null,
        priorityEnabled: !(display && display.priorityEnabled === false),
        blocked: !!(display && display.blocked),
        duePast: !!(display && display.duePast),
        dueCountdown: (display && display.dueCountdown) || '',
        priorityRankTier: rank.tier,
        priorityRankScore: rank.score,
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
      ganttSettings: await getGanttSettings(t),
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


  function buildInputsForDates(existingInputs, startDate, dueDate, dueTime, startTime) {
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
    var nextStartTime =
      startTime && ui && ui.normalizeDueTime
        ? ui.normalizeDueTime(startTime)
        : startTime
          ? String(startTime).trim()
          : '';
    var nextDueTime =
      dueTime && ui && ui.normalizeDueTime
        ? ui.normalizeDueTime(dueTime)
        : dueTime
          ? String(dueTime).trim()
          : '';

    if (nextStart) {
      base.startDate = nextStart;
      if (nextStartTime) base.startTime = nextStartTime;
      else delete base.startTime;
    } else {
      delete base.startDate;
      delete base.startTime;
    }

    if (nextDue) {
      base.dueDate = nextDue;
      if (nextDueTime) base.dueTime = nextDueTime;
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

  function toStartIso(startDate, startTime) {
    var ui = PU();
    if (!startDate) return '';
    if (ui && typeof ui.inputsToTrelloStartIso === 'function') {
      return (
        ui.inputsToTrelloStartIso({
          startDate: startDate,
          startTime: startTime || '',
        }) || ''
      );
    }
    return toDueIso(startDate, startTime || null);
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
    var clearing = !startDate && !dueDate;
    var dueTime = clearing
      ? ''
      : parts && Object.prototype.hasOwnProperty.call(parts, 'dueTime')
        ? parts.dueTime || ''
        : existing && existing.dueTime
          ? existing.dueTime
          : '';
    var startTime = clearing
      ? ''
      : parts && Object.prototype.hasOwnProperty.call(parts, 'startTime')
        ? parts.startTime || ''
        : existing && existing.startTime
          ? existing.startTime
          : '';

    var nextInputs = buildInputsForDates(
      existing,
      startDate,
      dueDate,
      dueTime,
      startTime
    );

    var dueIso = toDueIso(dueDate, dueTime);
    var startIso = toStartIso(startDate, startTime);

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
      startTime: startTime,
      dueTime: dueTime,
      dueIso: dueIso || null,
      startIso: startIso || null,
      inputs: nextInputs,
    };
  }

  function removeTopLevelItem(data, itemId) {
    var ct = CT();
    if (!ct || typeof ct.normalizeCompletionData !== 'function') {
      return data || { items: [] };
    }
    var normalized = ct.normalizeCompletionData(data || { items: [] });
    var id = itemId != null ? String(itemId) : '';
    if (!id) return normalized;
    var nextItems = (normalized.items || []).filter(function (item) {
      return !item || item.id !== id;
    });
    if (nextItems.length === (normalized.items || []).length) return normalized;
    return ct.normalizeCompletionData(
      Object.assign({}, normalized, { items: nextItems })
    );
  }

  /**
   * Toggle or set a local / checklist / linked subtask done, then persist.
   * rowMeta: { kind, parentCardId, itemId, parentItemId, cardId, linkParentCardId }
   */
  async function setSubtaskDone(t, rowMeta, done) {
    var ct = CT();
    if (!ct) return { ok: false, reason: 'no-completion' };
    rowMeta = rowMeta || {};
    var wantDone = !!done;
    var progress = wantDone
      ? ct.PROGRESS_MAX != null
        ? ct.PROGRESS_MAX
        : 100
      : ct.PROGRESS_MIN != null
        ? ct.PROGRESS_MIN
        : 0;

    if (rowMeta.kind === 'local') {
      var parentId = rowMeta.parentCardId;
      var itemId = rowMeta.itemId;
      if (!parentId || !itemId) return { ok: false, reason: 'missing-ids' };
      var data = await ct.getCardCompletionById(t, parentId);
      var next = ct.applyItemProgress(data, itemId, progress);
      await ct.saveCardCompletionById(t, parentId, next);
      return { ok: true, parentCardId: parentId, data: next };
    }

    if (rowMeta.kind === 'checklist') {
      var pCard = rowMeta.parentCardId;
      var pItem = rowMeta.parentItemId;
      var nestedId = rowMeta.itemId;
      if (!pCard || !pItem || !nestedId) {
        return { ok: false, reason: 'missing-ids' };
      }
      var checkData = await ct.getCardCompletionById(t, pCard);
      var checkNext = ct.applyChecklistItemProgress(
        checkData,
        pItem,
        nestedId,
        progress
      );
      await ct.saveCardCompletionById(t, pCard, checkNext);
      return { ok: true, parentCardId: pCard, data: checkNext };
    }

    if (rowMeta.kind === 'card' && rowMeta.cardId) {
      var childId = String(rowMeta.cardId);
      var childData = await ct.getCardCompletionById(t, childId);
      var childNext = wantDone
        ? ct.markFullyComplete(childData)
        : ct.markNotFullyComplete(childData);
      await ct.saveCardCompletionById(t, childId, childNext);
      return { ok: true, cardId: childId, data: childNext };
    }

    return { ok: false, reason: 'unsupported-kind' };
  }

  /**
   * Delete a local/checklist subtask, unlink a nested linked card,
   * or archive a top-level board card (closed: true).
   */
  async function deleteSubtask(t, rowMeta) {
    rowMeta = rowMeta || {};

    if (rowMeta.kind === 'card' && rowMeta.cardId && !rowMeta.linkParentCardId) {
      var archiveId = String(rowMeta.cardId);
      var ptArchive = PT();
      if (!ptArchive || typeof ptArchive.restPutCard !== 'function') {
        return { ok: false, reason: 'no-restPutCard' };
      }
      var authArchive = await ensureRestAuthorized(t);
      if (!authArchive.ok) {
        return {
          ok: false,
          reason: authArchive.reason || 'auth-failed',
        };
      }
      try {
        var putArchive = await ptArchive.restPutCard(t, archiveId, {
          closed: true,
        });
        if (!putArchive || !putArchive.ok) {
          return { ok: false, reason: 'archive-failed', cardId: archiveId };
        }
        return { ok: true, archived: true, cardId: archiveId };
      } catch (archiveErr) {
        console.error('GanttTrello.deleteSubtask archive failed', archiveErr);
        return {
          ok: false,
          reason: 'archive-failed',
          error:
            archiveErr && archiveErr.message
              ? archiveErr.message
              : String(archiveErr),
        };
      }
    }

    var ct = CT();
    if (!ct) return { ok: false, reason: 'no-completion' };

    if (rowMeta.kind === 'local') {
      var parentId = rowMeta.parentCardId;
      var itemId = rowMeta.itemId;
      if (!parentId || !itemId) return { ok: false, reason: 'missing-ids' };
      var data = await ct.getCardCompletionById(t, parentId);
      var next = removeTopLevelItem(data, itemId);
      await ct.saveCardCompletionById(t, parentId, next);
      return { ok: true, parentCardId: parentId, data: next };
    }

    if (rowMeta.kind === 'checklist') {
      var pCard = rowMeta.parentCardId;
      var pItem = rowMeta.parentItemId;
      var nestedId = rowMeta.itemId;
      if (!pCard || !pItem || !nestedId) {
        return { ok: false, reason: 'missing-ids' };
      }
      var checkData = await ct.getCardCompletionById(t, pCard);
      var checkNext = ct.removeChecklistItem(checkData, pItem, nestedId);
      await ct.saveCardCompletionById(t, pCard, checkNext);
      return { ok: true, parentCardId: pCard, data: checkNext };
    }

    if (rowMeta.kind === 'card' && rowMeta.linkParentCardId && rowMeta.cardId) {
      var linkParent = String(rowMeta.linkParentCardId);
      var linkedId = String(rowMeta.cardId);
      var parentData = await ct.getCardCompletionById(t, linkParent);
      var removed = ct.removeLinkedChildFromCompletion(parentData, linkedId);
      await ct.saveCardCompletionById(t, linkParent, removed.data);
      return {
        ok: true,
        parentCardId: linkParent,
        data: removed.data,
        unlinked: removed.removed,
      };
    }

    return { ok: false, reason: 'unsupported-kind' };
  }

  /**
   * Rename a local / checklist / linked subtask and persist.
   */
  async function renameSubtask(t, rowMeta, text) {
    var ct = CT();
    if (!ct) return { ok: false, reason: 'no-completion' };
    rowMeta = rowMeta || {};
    var nextText = typeof text === 'string' ? text.trim() : '';
    var max =
      ct.ITEM_TEXT_MAX != null && isFinite(ct.ITEM_TEXT_MAX)
        ? ct.ITEM_TEXT_MAX
        : 500;
    if (nextText.length > max) nextText = nextText.slice(0, max);
    if (!nextText) return { ok: false, reason: 'empty' };

    if (rowMeta.kind === 'local') {
      var parentId = rowMeta.parentCardId;
      var itemId = rowMeta.itemId;
      if (!parentId || !itemId) return { ok: false, reason: 'missing-ids' };
      var data = await ct.getCardCompletionById(t, parentId);
      var next = ct.applyItemText(data, itemId, nextText);
      await ct.saveCardCompletionById(t, parentId, next);
      return { ok: true, parentCardId: parentId, data: next, name: nextText };
    }

    if (rowMeta.kind === 'checklist') {
      var pCard = rowMeta.parentCardId;
      var pItem = rowMeta.parentItemId;
      var nestedId = rowMeta.itemId;
      if (!pCard || !pItem || !nestedId) {
        return { ok: false, reason: 'missing-ids' };
      }
      var checkData = await ct.getCardCompletionById(t, pCard);
      var checkNext = ct.applyChecklistItemText(
        checkData,
        pItem,
        nestedId,
        nextText
      );
      await ct.saveCardCompletionById(t, pCard, checkNext);
      return { ok: true, parentCardId: pCard, data: checkNext, name: nextText };
    }

    if (rowMeta.kind === 'card' && rowMeta.cardId) {
      var childId = String(rowMeta.cardId);
      var linkParent =
        rowMeta.linkParentCardId != null
          ? String(rowMeta.linkParentCardId)
          : '';
      var linkItemId =
        rowMeta.linkItemId != null ? String(rowMeta.linkItemId) : '';

      if (linkParent && linkItemId && typeof ct.applyItemText === 'function') {
        var parentData = await ct.getCardCompletionById(t, linkParent);
        var parentNext = ct.applyItemText(parentData, linkItemId, nextText);
        await ct.saveCardCompletionById(t, linkParent, parentNext);
      }

      var pt = PT();
      var nameOk = false;
      if (pt && typeof pt.restPutCard === 'function') {
        var auth = await ensureRestAuthorized(t);
        if (auth.ok) {
          try {
            var put = await pt.restPutCard(t, childId, { name: nextText });
            nameOk = !!(put && put.ok);
          } catch (restErr) {
            console.error('GanttTrello.renameSubtask REST failed', restErr);
          }
        }
      }

      return {
        ok: true,
        cardId: childId,
        name: nextText,
        cardNameUpdated: nameOk,
      };
    }

    return { ok: false, reason: 'unsupported-kind' };
  }

  /** Prefer these list categories when dropping into En attente. */
  var PENDING_LIST_CATEGORIES = ['unstarted', 'backlog', 'triage'];
  var STARTED_LIST_CATEGORIES = ['started'];

  /**
   * First board list (in board order) mapped to any of the given categories.
   */
  function firstListIdForCategories(lists, settings, categories) {
    var cats = (settings && settings.listCategories) || {};
    var wants = categories || [];
    for (var c = 0; c < wants.length; c++) {
      var want = wants[c];
      for (var j = 0; j < (lists || []).length; j++) {
        var lid = lists[j] && lists[j].id != null ? String(lists[j].id) : null;
        if (lid && cats[lid] === want) return lid;
      }
    }
    return null;
  }

  /**
   * Resolve the Trello list id for a Gantt state section drop.
   * @param {'started'|'pending'|'blocked'} sectionKey
   */
  function resolveStateSectionListId(lists, settings, sectionKey) {
    var key =
      sectionKey === 'started' || sectionKey === 'blocked' ? sectionKey : 'pending';
    if (key === 'started') {
      return firstListIdForCategories(lists, settings, STARTED_LIST_CATEGORIES);
    }
    if (key === 'blocked') {
      var role =
        settings && settings.roleLists && settings.roleLists.blocked
          ? String(settings.roleLists.blocked)
          : null;
      if (role) {
        for (var i = 0; i < (lists || []).length; i++) {
          if (lists[i] && String(lists[i].id) === role) return role;
        }
      }
      return firstListIdForCategories(lists, settings, ['blocked']);
    }
    return firstListIdForCategories(lists, settings, PENDING_LIST_CATEGORIES);
  }

  /**
   * Set or clear Bloqué (enAttente) on an arbitrary board card and persist plugin data.
   * Enabling blocks without requiring Motifs; clearing uses clearBlockedFromInputs.
   * When enabling and the card has no inputs yet, seeds DEFAULT_INPUTS.
   */
  async function setCardBlocked(t, cardId, blocked) {
    var pt = PT();
    if (!pt) return { ok: false, reason: 'no-priority-trello' };
    var id = cardId != null ? String(cardId).trim() : '';
    if (!id) return { ok: false, reason: 'no-card-id' };
    var wantBlocked = !!blocked;

    var existing = null;
    if (typeof pt.getCardInputsById === 'function') {
      try {
        existing = await pt.getCardInputsById(t, id);
      } catch (e) {
        existing = null;
      }
    }
    if (!existing) {
      if (!wantBlocked) {
        return { ok: false, reason: 'no-inputs' };
      }
      existing = Object.assign(
        {},
        pt.DEFAULT_INPUTS || { urgency: 2, impact: 2, ease: 3 },
        { priorityEnabled: false }
      );
    }

    var already = !!existing.enAttente;
    if (already === wantBlocked) {
      return { ok: true, already: true, cardId: id, inputs: existing };
    }

    var next;
    if (wantBlocked) {
      next = Object.assign({}, existing, { enAttente: true });
    } else {
      if (typeof pt.clearBlockedFromInputs !== 'function') {
        return { ok: false, reason: 'no-clear-blocked' };
      }
      next = pt.clearBlockedFromInputs(existing);
    }
    if (typeof pt.normalizeInputs === 'function') {
      next = pt.normalizeInputs(next) || next;
    }
    try {
      await t.set(id, 'shared', pt.CARD_PRIORITY_KEY || 'cardPriority', next);
    } catch (storeErr) {
      console.error('GanttTrello.setCardBlocked store failed', storeErr);
      return {
        ok: false,
        reason: 'store-failed',
        error: storeErr && storeErr.message ? storeErr.message : String(storeErr),
      };
    }
    return { ok: true, cardId: id, inputs: next, blocked: wantBlocked };
  }

  /** Clear Bloqué (enAttente) on an arbitrary board card and persist plugin data. */
  async function clearCardBlocked(t, cardId) {
    return setCardBlocked(t, cardId, false);
  }

  /**
   * Move a board card into a Gantt state section: list move + set/clear enAttente.
   * Bloqué: set blocked (+ move to blocked list when mapped).
   * En cours / En attente: clear blocked first, then move to started or
   * unstarted/backlog/triage.
   */
  async function moveCardToStateSection(t, cardId, sectionKey) {
    var pt = PT();
    var st = ST();
    var id = cardId != null ? String(cardId).trim() : '';
    if (!id) return { ok: false, reason: 'no-card-id' };
    var key =
      sectionKey === 'started' || sectionKey === 'blocked' ? sectionKey : 'pending';

    var settings = null;
    var lists = [];
    if (st && typeof st.ensureStatutSettings === 'function') {
      try {
        var ensured = await st.ensureStatutSettings(t);
        settings = ensured && ensured.settings ? ensured.settings : null;
      } catch (ensureErr) {
        settings = null;
      }
    }
    if (!settings && st && typeof st.readStatutSettings === 'function') {
      try {
        settings = await st.readStatutSettings(t);
      } catch (readErr) {
        settings = null;
      }
    }
    if (st && typeof st.getBoardLists === 'function') {
      try {
        lists = (await st.getBoardLists(t)) || [];
      } catch (listsErr) {
        lists = [];
      }
    } else if (t && typeof t.lists === 'function') {
      try {
        lists = (await t.lists('id', 'name')) || [];
      } catch (tListsErr) {
        lists = [];
      }
    }

    var listId = resolveStateSectionListId(lists, settings, key);

    var blockedRes;
    if (key === 'blocked') {
      blockedRes = await setCardBlocked(t, id, true);
    } else {
      blockedRes = await setCardBlocked(t, id, false);
      if (blockedRes && !blockedRes.ok && blockedRes.reason === 'no-inputs') {
        blockedRes = { ok: true, skipped: true, reason: 'no-inputs' };
      }
    }
    if (!blockedRes || !blockedRes.ok) {
      return Object.assign(
        { ok: false, sectionKey: key, listId: listId || null },
        blockedRes || { reason: 'blocked-failed' }
      );
    }

    if (!listId) {
      return {
        ok: true,
        cardId: id,
        sectionKey: key,
        listId: null,
        moved: false,
        noListMapped: true,
        blocked: blockedRes,
      };
    }

    if (!pt || typeof pt.restPutCard !== 'function') {
      return {
        ok: false,
        reason: 'no-restPutCard',
        sectionKey: key,
        listId: listId,
        blocked: blockedRes,
      };
    }

    var put = await pt.restPutCard(t, id, {
      idList: String(listId),
      pos: 'bottom',
    });
    if (!put || !put.ok) {
      return {
        ok: false,
        reason: (put && put.reason) || 'move-failed',
        sectionKey: key,
        listId: listId,
        blocked: blockedRes,
        put: put || null,
      };
    }

    return {
      ok: true,
      cardId: id,
      sectionKey: key,
      listId: listId,
      moved: true,
      blocked: blockedRes,
    };
  }

  global.GanttTrello = {
    GANTT_SETTINGS_KEY: GANTT_SETTINGS_KEY,
    DEFAULT_GANTT_SETTINGS: DEFAULT_GANTT_SETTINGS,
    normalizeGanttSettings: normalizeGanttSettings,
    getGanttSettings: getGanttSettings,
    saveGanttSettings: saveGanttSettings,
    loadBoard: loadBoard,
    ensureRestAuthorized: ensureRestAuthorized,
    saveCardDates: saveCardDates,
    resolveCardDates: resolveCardDates,
    buildInputsForDates: buildInputsForDates,
    firstListIdForCategories: firstListIdForCategories,
    resolveStateSectionListId: resolveStateSectionListId,
    moveCardToStateSection: moveCardToStateSection,
    setCardBlocked: setCardBlocked,
    clearCardBlocked: clearCardBlocked,
    setSubtaskDone: setSubtaskDone,
    deleteSubtask: deleteSubtask,
    renameSubtask: renameSubtask,
    removeTopLevelItem: removeTopLevelItem,
  };
})(typeof window !== 'undefined' ? window : this);
