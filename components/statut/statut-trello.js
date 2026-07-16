/* Statut Trello bridge — board mapping, list moves, auto-move roles. */
(function (global) {
  'use strict';

  function dbg() { return global.TpDebug || null; }
  function dbgLog(domain, event, meta) { var d = dbg(); if (d && d.log) d.log(domain, event, meta); }
  function dbgError(domain, event, err, meta) { var d = dbg(); if (d && d.error) d.error(domain, event, err, meta); else if (err) console.error(domain + '.' + event, err); }

  var STATUT_SETTINGS_KEY = 'statutSettings';
  // Card shared: listId before the card entered Terminé (for restore when Progrès leaves 100%).
  var STATUT_PREVIOUS_LIST_KEY = 'statutPreviousListId';
  // Card shared: listId before the card entered Bloqué (for restore when last subtask unblocks).
  var STATUT_PREVIOUS_BLOCKED_LIST_KEY = 'statutPreviousListBeforeBlocked';
  var FALLBACK_RESTORE_CATEGORIES = ['started', 'unstarted', 'backlog'];

  function matchApi() {
    return global.StatutMatch || null;
  }

  function priorityTrello() {
    return global.PriorityTrello || null;
  }

  function isCompletedListId(listId, settings) {
    if (!listId || !settings) return false;
    var id = String(listId);
    var cats = settings.listCategories || {};
    if (cats[id] === 'completed') return true;
    var role =
      settings.roleLists && settings.roleLists.completed
        ? String(settings.roleLists.completed)
        : null;
    return !!(role && role === id);
  }

  function isBlockedListId(listId, settings) {
    if (!listId || !settings) return false;
    var id = String(listId);
    var cats = settings.listCategories || {};
    if (cats[id] === 'blocked') return true;
    var role =
      settings.roleLists && settings.roleLists.blocked
        ? String(settings.roleLists.blocked)
        : null;
    return !!(role && role === id);
  }

  /**
   * First board list mapped to started → unstarted → backlog (never blocked/completed).
   * Scans in board list order within each category preference.
   */
  function firstFallbackIncompleteListId(lists, settings) {
    var cats = (settings && settings.listCategories) || {};
    for (var c = 0; c < FALLBACK_RESTORE_CATEGORIES.length; c++) {
      var want = FALLBACK_RESTORE_CATEGORIES[c];
      for (var j = 0; j < (lists || []).length; j++) {
        var lid = lists[j] && lists[j].id ? String(lists[j].id) : null;
        if (lid && cats[lid] === want) return lid;
      }
    }
    return null;
  }

  /**
   * Whether capturePreviousListBeforeCompleted should persist currentListId.
   * Never saves a completed/Terminé list (preserves any existing previous).
   */
  function shouldCapturePreviousListId(currentListId, settings) {
    if (!currentListId) return false;
    return !isCompletedListId(currentListId, settings);
  }

  /**
   * Whether capturePreviousListBeforeBlocked should persist currentListId.
   * Never saves Bloqué or Terminé (preserves any existing previous).
   */
  function shouldCapturePreviousListBeforeBlocked(currentListId, settings) {
    if (!currentListId) return false;
    if (isBlockedListId(currentListId, settings)) return false;
    if (isCompletedListId(currentListId, settings)) return false;
    return true;
  }

  /**
   * Resolve which list to restore when leaving completed.
   * @returns {string|null} target listId, or null if no restore / already not completed.
   */
  function resolvePreviousListRestoreTarget(currentListId, storedPreviousListId, lists, settings) {
    if (!isCompletedListId(currentListId, settings)) return null;

    var byId = {};
    (lists || []).forEach(function (list) {
      if (list && list.id) byId[String(list.id)] = true;
    });

    if (storedPreviousListId && byId[String(storedPreviousListId)]) {
      var stored = String(storedPreviousListId);
      if (!isCompletedListId(stored, settings)) return stored;
    }

    return firstFallbackIncompleteListId(lists, settings);
  }

  /**
   * Resolve which list to restore when leaving Bloqué.
   * Stored target must not be Bloqué or Terminé.
   * @returns {string|null} target listId, or null if no restore / already not blocked.
   */
  function resolvePreviousListRestoreTargetFromBlocked(
    currentListId,
    storedPreviousListId,
    lists,
    settings
  ) {
    if (!isBlockedListId(currentListId, settings)) return null;

    var byId = {};
    (lists || []).forEach(function (list) {
      if (list && list.id) byId[String(list.id)] = true;
    });

    if (storedPreviousListId && byId[String(storedPreviousListId)]) {
      var stored = String(storedPreviousListId);
      if (
        !isBlockedListId(stored, settings) &&
        !isCompletedListId(stored, settings)
      ) {
        return stored;
      }
    }

    return firstFallbackIncompleteListId(lists, settings);
  }

  async function getPreviousListId(t) {
    try {
      var raw = await t.get('card', 'shared', STATUT_PREVIOUS_LIST_KEY);
      if (raw == null || raw === '') return null;
      return String(raw);
    } catch (err) {
      dbgError('statutTrello', 'getPreviousListId', err);
      return null;
    }
  }

  async function setPreviousListId(t, listId) {
    try {
      if (!listId) {
        await t.set('card', 'shared', STATUT_PREVIOUS_LIST_KEY, null);
        return null;
      }
      await t.set('card', 'shared', STATUT_PREVIOUS_LIST_KEY, String(listId));
      return String(listId);
    } catch (err) {
      dbgError('statutTrello', 'setPreviousListId', err);
      return null;
    }
  }

  async function clearPreviousListId(t) {
    return setPreviousListId(t, null);
  }

  async function getPreviousBlockedListId(t) {
    try {
      var raw = await t.get('card', 'shared', STATUT_PREVIOUS_BLOCKED_LIST_KEY);
      if (raw == null || raw === '') return null;
      return String(raw);
    } catch (err) {
      dbgError('statutTrello', 'getPreviousBlockedListId', err);
      return null;
    }
  }

  async function setPreviousBlockedListId(t, listId) {
    try {
      if (!listId) {
        await t.set('card', 'shared', STATUT_PREVIOUS_BLOCKED_LIST_KEY, null);
        return null;
      }
      await t.set('card', 'shared', STATUT_PREVIOUS_BLOCKED_LIST_KEY, String(listId));
      return String(listId);
    } catch (err) {
      dbgError('statutTrello', 'setPreviousBlockedListId', err);
      return null;
    }
  }

  async function clearPreviousBlockedListId(t) {
    return setPreviousBlockedListId(t, null);
  }

  async function readCurrentCardListId(t) {
    var PT = priorityTrello();
    try {
      if (PT && typeof PT.readCardIdAndListId === 'function') {
        var ids = await PT.readCardIdAndListId(t);
        if (ids && ids.listId) return String(ids.listId);
      }
      var card = await t.card('idList');
      if (card && card.idList) return String(card.idList);
      if (typeof card === 'string' && card) return String(card);
    } catch (err) {
      dbgError('statutTrello', 'readCurrentCardListId', err);
    }
    return null;
  }

  /**
   * Remember the card's list before it enters Terminé (auto-move or manual Statut).
   */
  async function capturePreviousListBeforeCompleted(t) {
    var ensured = await ensureStatutSettings(t);
    var settings = ensured.settings;
    var currentListId = await readCurrentCardListId(t);
    if (!shouldCapturePreviousListId(currentListId, settings)) {
      return {
        ok: true,
        captured: false,
        reason: currentListId ? 'already-completed' : 'no-list-id',
        listId: currentListId,
      };
    }
    await setPreviousListId(t, currentListId);
    return { ok: true, captured: true, listId: String(currentListId) };
  }

  /**
   * When Progrès leaves 100% and the card is still on Terminé, move it back
   * to the stored previous list (or started → unstarted → backlog fallback).
   */
  async function restorePreviousStatutFromIncomplete(t) {
    var ensured = await ensureStatutSettings(t);
    var settings = ensured.settings;
    var lists = ensured.lists || (await getBoardLists(t));
    var currentListId = await readCurrentCardListId(t);
    if (!isCompletedListId(currentListId, settings)) {
      dbgLog('statutTrello', 'restore.incomplete', { restored: false, reason: 'not-on-completed' });
      return {
        ok: true,
        restored: false,
        reason: 'not-on-completed',
        listId: currentListId,
      };
    }

    var stored = await getPreviousListId(t);
    var target = resolvePreviousListRestoreTarget(
      currentListId,
      stored,
      lists,
      settings
    );
    if (!target) {
      dbgLog('statutTrello', 'restore.incomplete', { restored: false, reason: 'no-restore-target' });
      return {
        ok: true,
        restored: false,
        reason: 'no-restore-target',
        listId: currentListId,
      };
    }
    if (String(target) === String(currentListId)) {
      await clearPreviousListId(t);
      dbgLog('statutTrello', 'restore.incomplete', { restored: false, reason: 'already-there' });
      return {
        ok: true,
        restored: false,
        reason: 'already-there',
        listId: currentListId,
      };
    }

    var move = await setCardList(t, target, { pos: 'bottom' });
    if (!move || !move.ok) {
      var failReason = (move && move.reason) || 'move-failed';
      dbgLog('statutTrello', 'restore.incomplete', { restored: false, reason: failReason });
      return Object.assign(
        { restored: false, reason: failReason },
        move || { ok: false }
      );
    }

    var side = await applyStatutSideEffects(t, target, settings);
    await clearPreviousListId(t);
    var restored = !!move.moved || !!move.alreadyThere;
    dbgLog('statutTrello', 'restore.incomplete', {
      restored: restored,
      reason: move.moved ? 'moved' : 'already-there',
      moved: !!move.moved,
    });
    return {
      ok: true,
      restored: !!move.moved || !!move.alreadyThere,
      moved: !!move.moved,
      listId: String(target),
      previousListId: stored,
      sideEffects: side,
    };
  }

  /**
   * Remember the card's list before it enters Bloqué (auto-move or manual Statut).
   */
  async function capturePreviousListBeforeBlocked(t) {
    var ensured = await ensureStatutSettings(t);
    var settings = ensured.settings;
    var currentListId = await readCurrentCardListId(t);
    if (!shouldCapturePreviousListBeforeBlocked(currentListId, settings)) {
      return {
        ok: true,
        captured: false,
        reason: currentListId
          ? isBlockedListId(currentListId, settings)
            ? 'already-blocked'
            : isCompletedListId(currentListId, settings)
              ? 'on-completed'
              : 'skip'
          : 'no-list-id',
        listId: currentListId,
      };
    }
    await setPreviousBlockedListId(t, currentListId);
    return { ok: true, captured: true, listId: String(currentListId) };
  }

  /**
   * When Bloqué clears (last status-origin subtask unblocked) and the card is
   * still on Bloqué, move it back to the stored previous list (or started →
   * unstarted → backlog fallback).
   */
  async function restorePreviousStatutFromUnblocked(t) {
    var ensured = await ensureStatutSettings(t);
    var settings = ensured.settings;
    var lists = ensured.lists || (await getBoardLists(t));
    var currentListId = await readCurrentCardListId(t);
    if (!isBlockedListId(currentListId, settings)) {
      dbgLog('statutTrello', 'restore.unblocked', { restored: false, reason: 'not-on-blocked' });
      return {
        ok: true,
        restored: false,
        reason: 'not-on-blocked',
        listId: currentListId,
      };
    }

    var stored = await getPreviousBlockedListId(t);
    var target = resolvePreviousListRestoreTargetFromBlocked(
      currentListId,
      stored,
      lists,
      settings
    );
    if (!target) {
      dbgLog('statutTrello', 'restore.unblocked', { restored: false, reason: 'no-restore-target' });
      return {
        ok: true,
        restored: false,
        reason: 'no-restore-target',
        listId: currentListId,
      };
    }
    if (String(target) === String(currentListId)) {
      await clearPreviousBlockedListId(t);
      dbgLog('statutTrello', 'restore.unblocked', { restored: false, reason: 'already-there' });
      return {
        ok: true,
        restored: false,
        reason: 'already-there',
        listId: currentListId,
      };
    }

    var move = await setCardList(t, target, { pos: 'bottom' });
    if (!move || !move.ok) {
      var unblockFailReason = (move && move.reason) || 'move-failed';
      dbgLog('statutTrello', 'restore.unblocked', { restored: false, reason: unblockFailReason });
      return Object.assign(
        { restored: false, reason: unblockFailReason },
        move || { ok: false }
      );
    }

    var side = await applyStatutSideEffects(t, target, settings);
    await clearPreviousBlockedListId(t);
    var unblockedRestored = !!move.moved || !!move.alreadyThere;
    dbgLog('statutTrello', 'restore.unblocked', {
      restored: unblockedRestored,
      reason: move.moved ? 'moved' : 'already-there',
      moved: !!move.moved,
    });
    return {
      ok: true,
      restored: !!move.moved || !!move.alreadyThere,
      moved: !!move.moved,
      listId: String(target),
      previousListId: stored,
      sideEffects: side,
    };
  }

  function defaultSettings() {
    return {
      initialized: false,
      listCategories: {},
      roleLists: { blocked: null, completed: null },
      showUnassigned: false,
      autoMoveBlocked: true,
      autoMoveCompleted: true,
      stateColors: null
    };
  }

  function normalizeSettings(raw) {
    var base = defaultSettings();
    if (!raw || typeof raw !== 'object') return base;

    var SM = matchApi();
    var listCategories = {};
    if (raw.listCategories && typeof raw.listCategories === 'object') {
      Object.keys(raw.listCategories).forEach(function (listId) {
        var cat = raw.listCategories[listId];
        if (cat == null || cat === '') {
          listCategories[listId] = null;
        } else if (!SM || SM.isCategoryKey(cat)) {
          listCategories[listId] = String(cat);
        } else {
          listCategories[listId] = null;
        }
      });
    }

    var roleLists = { blocked: null, completed: null };
    if (raw.roleLists && typeof raw.roleLists === 'object') {
      if (raw.roleLists.blocked) roleLists.blocked = String(raw.roleLists.blocked);
      if (raw.roleLists.completed) {
        roleLists.completed = String(raw.roleLists.completed);
      }
    }

    var stateColors =
      SM && typeof SM.normalizeStateColors === 'function'
        ? SM.normalizeStateColors(raw.stateColors)
        : Object.assign(
            {},
            (SM && SM.DEFAULT_STATE_COLORS) || {
              gray: '#626f86',
              blue: '#0c66e4',
              red: '#e34935',
              green: '#22a06b'
            }
          );

    return {
      initialized: !!raw.initialized,
      listCategories: listCategories,
      roleLists: roleLists,
      showUnassigned: !!raw.showUnassigned,
      autoMoveBlocked: raw.autoMoveBlocked !== false,
      autoMoveCompleted: raw.autoMoveCompleted !== false,
      stateColors: stateColors
    };
  }

  function applySettingsColors(settings) {
    var SM = matchApi();
    if (!SM || typeof SM.applyStateColors !== 'function') return;
    SM.applyStateColors(settings && settings.stateColors);
  }

  async function readStatutSettings(t) {
    try {
      var raw = await t.get('board', 'shared', STATUT_SETTINGS_KEY);
      var settings = normalizeSettings(raw);
      applySettingsColors(settings);
      return settings;
    } catch (err) {
      dbgError('statutTrello', 'readStatutSettings', err);
      var fallback = defaultSettings();
      applySettingsColors(fallback);
      return fallback;
    }
  }

  async function getBoardLists(t) {
    try {
      var lists = await t.lists('id', 'name');
      if (!Array.isArray(lists)) return [];
      return lists
        .filter(function (list) {
          return list && list.id;
        })
        .map(function (list) {
          return {
            id: String(list.id),
            name: typeof list.name === 'string' ? list.name : String(list.name || ''),
          };
        });
    } catch (err) {
      dbgError('statutTrello', 'getBoardLists', err);
      return [];
    }
  }

  async function saveStatutSettings(t, settings) {
    var normalized = normalizeSettings(settings);
    applySettingsColors(normalized);
    await t.set('board', 'shared', STATUT_SETTINGS_KEY, normalized);
    return normalized;
  }

  function applyDetection(lists, previous) {
    var SM = matchApi();
    var base = previous ? normalizeSettings(previous) : defaultSettings();
    if (!SM || typeof SM.detectFromLists !== 'function') {
      return Object.assign({}, base, { initialized: true });
    }
    var detected = SM.detectFromLists(lists);
    return {
      initialized: true,
      listCategories: detected.listCategories || {},
      roleLists: {
        blocked: detected.roleLists.blocked || null,
        completed: detected.roleLists.completed || null,
      },
      showUnassigned: !!base.showUnassigned,
      autoMoveBlocked: base.autoMoveBlocked !== false,
      autoMoveCompleted: base.autoMoveCompleted !== false,
      stateColors: base.stateColors
    };
  }

  /**
   * Load settings; on first use run fuzzy detection and persist.
   * options.forceRedetect — re-run matching and overwrite categories.
   */
  async function ensureStatutSettings(t, options) {
    options = options || {};
    var current = await readStatutSettings(t);
    var lists = await getBoardLists(t);

    if (current.initialized && !options.forceRedetect) {
      // Merge newly appeared lists as uncategorized so settings UI can show them.
      var changed = false;
      var newListCount = 0;
      lists.forEach(function (list) {
        if (!(list.id in current.listCategories)) {
          current.listCategories[list.id] = null;
          changed = true;
          newListCount += 1;
        }
      });
      if (changed) {
        current = await saveStatutSettings(t, current);
      }
      dbgLog('statutTrello', 'ensureSettings.loaded', {
        listCount: lists.length,
        newListCount: newListCount,
      });
      return { settings: current, lists: lists, detected: false };
    }

    var next = applyDetection(lists, current);
    next = await saveStatutSettings(t, next);
    dbgLog('statutTrello', 'ensureSettings.defaulted', { listCount: lists.length });
    return { settings: next, lists: lists, detected: true };
  }

  async function getCardStatut(t) {
    var PT = priorityTrello();
    var lists = await getBoardLists(t);
    var ensured = await ensureStatutSettings(t);
    var settings = ensured.settings;

    var listId = null;
    try {
      if (PT && typeof PT.readCardIdAndListId === 'function') {
        var ids = await PT.readCardIdAndListId(t);
        if (ids) listId = ids.listId;
      } else {
        var card = await t.card('idList');
        if (card && card.idList) listId = String(card.idList);
        else if (typeof card === 'string') listId = card;
      }
    } catch (err) {
      console.error('StatutTrello.getCardStatut list id failed', err);
    }

    var list = null;
    if (listId) {
      for (var i = 0; i < lists.length; i++) {
        if (lists[i].id === listId) {
          list = lists[i];
          break;
        }
      }
    }

    var category = listId && settings.listCategories
      ? settings.listCategories[listId]
      : null;

    return {
      listId: listId,
      listName: list ? list.name : '',
      category: category || null,
      lists: lists,
      settings: settings,
    };
  }

  async function setCardList(t, listId, options) {
    options = options || {};
    var PT = priorityTrello();
    if (!PT || typeof PT.restPutCard !== 'function') {
      return { ok: false, reason: 'no-restPutCard', moved: false };
    }
    if (!listId) return { ok: false, reason: 'no-list-id', moved: false };

    var cardId = null;
    var currentListId = null;
    if (typeof PT.readCardIdAndListId === 'function') {
      var ids = await PT.readCardIdAndListId(t);
      if (ids) {
        cardId = ids.cardId;
        currentListId = ids.listId;
      }
    }
    if (!cardId && typeof PT.resolveCurrentCardId === 'function') {
      cardId = await PT.resolveCurrentCardId(t);
    }
    if (!cardId) return { ok: false, reason: 'no-card-id', moved: false };

    if (currentListId && String(currentListId) === String(listId)) {
      return { ok: true, moved: false, alreadyThere: true, listId: String(listId) };
    }

    var body = { idList: String(listId) };
    if (options.pos != null) body.pos = options.pos;
    else body.pos = 'bottom';

    var put = await PT.restPutCard(t, cardId, body);
    if (!put || !put.ok) {
      return Object.assign({ moved: false }, put || { ok: false, reason: 'put-failed' });
    }
    return { ok: true, moved: true, listId: String(listId) };
  }

  async function roleTargetListId(t, role) {
    var ensured = await ensureStatutSettings(t);
    var settings = ensured.settings;
    if (!settings.roleLists) return null;
    var target = settings.roleLists[role];
    return target ? String(target) : null;
  }

  async function maybeAutoMoveForBlocked(t) {
    try {
      await capturePreviousListBeforeBlocked(t);
    } catch (captureErr) {
      dbgError('statutTrello', 'autoMove.blocked.capture', captureErr);
    }
    var ensured = await ensureStatutSettings(t);
    var settings = ensured.settings;
    if (!settings.autoMoveBlocked) {
      dbgLog('statutTrello', 'autoMove.blocked', { moved: false, reason: 'auto-move-disabled' });
      return { ok: true, moved: false, reason: 'auto-move-disabled' };
    }
    var target = settings.roleLists && settings.roleLists.blocked;
    if (!target) {
      dbgLog('statutTrello', 'autoMove.blocked', { moved: false, reason: 'no-blocked-list' });
      return { ok: true, moved: false, reason: 'no-blocked-list' };
    }
    var blockedMove = await setCardList(t, target, { pos: 'bottom' });
    dbgLog('statutTrello', 'autoMove.blocked', {
      moved: !!(blockedMove && blockedMove.moved),
      reason: blockedMove && blockedMove.moved
        ? 'moved'
        : (blockedMove && blockedMove.reason) || 'no-move',
    });
    return blockedMove;
  }

  async function maybeAutoMoveForCompleted(t) {
    try {
      await capturePreviousListBeforeCompleted(t);
    } catch (captureErr) {
      dbgError('statutTrello', 'autoMove.completed.capture', captureErr);
    }
    var ensured = await ensureStatutSettings(t);
    var settings = ensured.settings;
    if (!settings.autoMoveCompleted) {
      dbgLog('statutTrello', 'autoMove.completed', { moved: false, reason: 'auto-move-disabled' });
      return { ok: true, moved: false, reason: 'auto-move-disabled' };
    }
    var target = settings.roleLists && settings.roleLists.completed;
    if (!target) {
      dbgLog('statutTrello', 'autoMove.completed', { moved: false, reason: 'no-completed-list' });
      return { ok: true, moved: false, reason: 'no-completed-list' };
    }
    var completedMove = await setCardList(t, target, { pos: 'bottom' });
    dbgLog('statutTrello', 'autoMove.completed', {
      moved: !!(completedMove && completedMove.moved),
      reason: completedMove && completedMove.moved
        ? 'moved'
        : (completedMove && completedMove.reason) || 'no-move',
    });
    return completedMove;
  }

  /**
   * After the user picks a Statut list: light reverse sync for blocked/completed.
   */
  async function applyStatutSideEffects(t, listId, settings) {
    settings = settings || (await ensureStatutSettings(t)).settings;
    var category =
      settings.listCategories && listId ? settings.listCategories[String(listId)] : null;
    var isBlockedRole =
      !!(
        settings.roleLists &&
        settings.roleLists.blocked &&
        String(settings.roleLists.blocked) === String(listId)
      );
    var isBlocked = category === 'blocked' || isBlockedRole;
    if (isBlocked && category !== 'blocked') {
      category = 'blocked';
    }
    var isCompletedRole =
      !!(
        settings.roleLists &&
        settings.roleLists.completed &&
        String(settings.roleLists.completed) === String(listId)
      );
    var isCompleted = category === 'completed' || isCompletedRole;
    if (isCompleted && category !== 'completed') {
      category = 'completed';
    }
    var PT = priorityTrello();
    var side = { category: category || null };

    if (isBlocked && PT && typeof PT.getCardInputs === 'function') {
      var inputs = null;
      try {
        inputs = await PT.getCardInputs(t);
      } catch (err) {
        dbgError('statutTrello', 'sideEffects.getCardInputs', err);
      }
      if (!inputs || !inputs.enAttente) {
        var blocked = Object.assign({}, inputs || {}, { enAttente: true });
        await PT.saveCardInputs(t, blocked, {
          autoSort: false,
          syncDue: false,
          skipStatutAutoMove: true,
        });
      }
      side.enAttenteSet = true;
      side.enAttente = true;

      // Bloqué contradicts Terminé / 100%: drop progress off complete.
      var CTb = global.CompletionTrello;
      if (
        CTb &&
        typeof CTb.getCardCompletion === 'function' &&
        typeof CTb.markNotFullyComplete === 'function' &&
        typeof CTb.isAllSubtasksComplete === 'function'
      ) {
        try {
          var blockedCompletion = await CTb.getCardCompletion(t);
          if (CTb.isAllSubtasksComplete(blockedCompletion)) {
            var incompleteData = CTb.markNotFullyComplete(blockedCompletion);
            await CTb.saveCardCompletion(t, incompleteData);
            side.progressIncomplete = true;
            side.completion = incompleteData;
            if (typeof CTb.setDueCompleteSuppressed === 'function') {
              await CTb.setDueCompleteSuppressed(t, false);
            }
          }
        } catch (progressErr) {
          dbgError('statutTrello', 'sideEffects.clearProgressComplete', progressErr);
        }
      }
    }

    if (isCompleted) {
      var CT = global.CompletionTrello;
      if (CT && typeof CT.getCardCompletion === 'function' && typeof CT.markFullyComplete === 'function') {
        try {
          var stored = await CT.getCardCompletion(t);
          if (typeof CT.capturePreviousCompletionBeforeComplete === 'function') {
            await CT.capturePreviousCompletionBeforeComplete(t, stored);
          }
          var completeData = CT.markFullyComplete(stored);
          await CT.saveCardCompletion(t, completeData);
          side.progressComplete = true;
          side.completion = completeData;
        } catch (err) {
          dbgError('statutTrello', 'sideEffects.markProgressComplete', err);
        }
      }
      if (CT && typeof CT.setDueCompleteSuppressed === 'function') {
        try {
          await CT.setDueCompleteSuppressed(t, false);
        } catch (suppressErr) {
          dbgError('statutTrello', 'sideEffects.clearDueCompleteSuppress', suppressErr);
        }
      }

      if (PT && typeof PT.setCardDueComplete === 'function') {
        var mark = await PT.setCardDueComplete(t, true, { skipStatutAutoMove: true });
        side.dueComplete = mark;
        if (typeof PT.clearBlockedIfComplete === 'function') {
          await PT.clearBlockedIfComplete(t);
        }
      }
    } else {
      // Any status other than Terminé: turn off Trello "Mark completed".
      if (PT && typeof PT.setCardDueComplete === 'function') {
        var unmark = await PT.setCardDueComplete(t, false, { skipStatutAutoMove: true });
        side.dueComplete = unmark;
        side.dueCompleteCleared = true;
      }
      var CTu = global.CompletionTrello;
      if (CTu) {
        try {
          var current =
            typeof CTu.getCardCompletion === 'function'
              ? await CTu.getCardCompletion(t)
              : null;
          var stillComplete =
            current &&
            typeof CTu.isAllSubtasksComplete === 'function' &&
            CTu.isAllSubtasksComplete(current);

          // En cours: pull the slider off 100% (previous Progrès, or 99%).
          if (
            stillComplete &&
            category === 'started' &&
            typeof CTu.restoreProgressLeavingComplete === 'function' &&
            typeof CTu.saveCardCompletion === 'function'
          ) {
            var previous =
              typeof CTu.getPreviousCompletionBeforeComplete === 'function'
                ? await CTu.getPreviousCompletionBeforeComplete(t)
                : null;
            var restored = CTu.restoreProgressLeavingComplete(current, previous);
            await CTu.saveCardCompletion(t, restored);
            if (typeof CTu.clearPreviousCompletionBeforeComplete === 'function') {
              await CTu.clearPreviousCompletionBeforeComplete(t);
            }
            side.progressIncomplete = true;
            side.completion = restored;
            stillComplete = false;
            current = restored;
          }

          // Keep Done from bouncing back on reopen while progress is still 100%.
          if (typeof CTu.setDueCompleteSuppressed === 'function') {
            await CTu.setDueCompleteSuppressed(t, !!stillComplete);
          }
        } catch (err) {
          dbgError('statutTrello', 'sideEffects.unmarkComplete', err);
        }
      }
    }

    dbgLog('statutTrello', 'sideEffects', {
      category: category || null,
      blocked: !!isBlocked,
      completed: !!isCompleted,
      enAttenteSet: !!side.enAttenteSet,
      progressComplete: !!side.progressComplete,
      progressIncomplete: !!side.progressIncomplete,
      dueCompleteCleared: !!side.dueCompleteCleared,
    });
    return side;
  }

  async function selectCardStatut(t, listId) {
    var ensured = await ensureStatutSettings(t);
    var settings = ensured.settings;
    var currentListId = await readCurrentCardListId(t);
    var fromCategory =
      currentListId && settings.listCategories
        ? settings.listCategories[String(currentListId)] || null
        : null;
    if (isCompletedListId(listId, settings)) {
      try {
        await capturePreviousListBeforeCompleted(t);
      } catch (captureErr) {
        dbgError('statutTrello', 'selectStatut.captureCompleted', captureErr);
      }
    } else if (isBlockedListId(listId, settings)) {
      try {
        await capturePreviousListBeforeBlocked(t);
      } catch (captureErr) {
        dbgError('statutTrello', 'selectStatut.captureBlocked', captureErr);
      }
    }
    var move = await setCardList(t, listId, { pos: 'bottom' });
    if (!move.ok) return move;
    var side = await applyStatutSideEffects(t, listId, settings);
    var toCategory =
      settings.listCategories && listId
        ? settings.listCategories[String(listId)] || null
        : null;
    dbgLog('statutTrello', 'selectStatut', {
      fromCategory: fromCategory,
      toCategory: toCategory,
      moved: !!move.moved,
    });
    return Object.assign({}, move, { sideEffects: side });
  }

  /**
   * Group lists by category key for UI (uncategorized → '_none').
   * @param {object} [options]
   * @param {boolean} [options.includeUnassigned=true] Include Non assigné group.
   */
  function groupListsByCategory(lists, settings, options) {
    options = options || {};
    var includeUnassigned = options.includeUnassigned !== false;
    var SM = matchApi();
    var categories = SM ? SM.CATEGORIES.slice() : [];
    var groups = [];
    var byKey = {};

    categories.forEach(function (cat) {
      var style = SM && SM.categoryStyle ? SM.categoryStyle(cat.key) : null;
      var group = {
        key: cat.key,
        label: cat.label,
        lists: [],
        color: style ? style.color : null,
        icon: style ? style.icon : null,
      };
      byKey[cat.key] = group;
      groups.push(group);
    });

    var noneStyle = SM && SM.categoryStyle ? SM.categoryStyle('_none') : null;
    var uncategorized = {
      key: '_none',
      label: 'Non assigné',
      lists: [],
      color: noneStyle ? noneStyle.color : null,
      icon: noneStyle ? noneStyle.icon : null,
    };
    byKey._none = uncategorized;

    var cats = (settings && settings.listCategories) || {};
    (lists || []).forEach(function (list) {
      var cat = cats[list.id];
      if (cat && byKey[cat]) byKey[cat].lists.push(list);
      else uncategorized.lists.push(list);
    });

    if (includeUnassigned && uncategorized.lists.length) {
      groups.push(uncategorized);
    }
    return groups.filter(function (g) {
      return g.lists.length > 0;
    });
  }

  global.StatutTrello = {
    STATUT_SETTINGS_KEY: STATUT_SETTINGS_KEY,
    STATUT_PREVIOUS_LIST_KEY: STATUT_PREVIOUS_LIST_KEY,
    STATUT_PREVIOUS_BLOCKED_LIST_KEY: STATUT_PREVIOUS_BLOCKED_LIST_KEY,
    FALLBACK_RESTORE_CATEGORIES: FALLBACK_RESTORE_CATEGORIES,
    defaultSettings: defaultSettings,
    normalizeSettings: normalizeSettings,
    getBoardLists: getBoardLists,
    readStatutSettings: readStatutSettings,
    saveStatutSettings: saveStatutSettings,
    ensureStatutSettings: ensureStatutSettings,
    getCardStatut: getCardStatut,
    setCardList: setCardList,
    selectCardStatut: selectCardStatut,
    maybeAutoMoveForBlocked: maybeAutoMoveForBlocked,
    maybeAutoMoveForCompleted: maybeAutoMoveForCompleted,
    applyStatutSideEffects: applyStatutSideEffects,
    groupListsByCategory: groupListsByCategory,
    roleTargetListId: roleTargetListId,
    isCompletedListId: isCompletedListId,
    isBlockedListId: isBlockedListId,
    shouldCapturePreviousListId: shouldCapturePreviousListId,
    shouldCapturePreviousListBeforeBlocked: shouldCapturePreviousListBeforeBlocked,
    firstFallbackIncompleteListId: firstFallbackIncompleteListId,
    resolvePreviousListRestoreTarget: resolvePreviousListRestoreTarget,
    resolvePreviousListRestoreTargetFromBlocked: resolvePreviousListRestoreTargetFromBlocked,
    getPreviousListId: getPreviousListId,
    setPreviousListId: setPreviousListId,
    clearPreviousListId: clearPreviousListId,
    getPreviousBlockedListId: getPreviousBlockedListId,
    setPreviousBlockedListId: setPreviousBlockedListId,
    clearPreviousBlockedListId: clearPreviousBlockedListId,
    capturePreviousListBeforeCompleted: capturePreviousListBeforeCompleted,
    capturePreviousListBeforeBlocked: capturePreviousListBeforeBlocked,
    restorePreviousStatutFromIncomplete: restorePreviousStatutFromIncomplete,
    restorePreviousStatutFromUnblocked: restorePreviousStatutFromUnblocked,
  };
})(typeof window !== 'undefined' ? window : this);
