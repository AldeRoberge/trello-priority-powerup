/* Statut Trello bridge — board mapping, list moves, auto-move roles. */
(function (global) {
  'use strict';

  var STATUT_SETTINGS_KEY = 'statutSettings';

  function matchApi() {
    return global.StatutMatch || null;
  }

  function priorityTrello() {
    return global.PriorityTrello || null;
  }

  function defaultSettings() {
    return {
      initialized: false,
      listCategories: {},
      roleLists: { blocked: null, completed: null },
      autoMoveBlocked: true,
      autoMoveCompleted: true,
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

    return {
      initialized: !!raw.initialized,
      listCategories: listCategories,
      roleLists: roleLists,
      autoMoveBlocked: raw.autoMoveBlocked !== false,
      autoMoveCompleted: raw.autoMoveCompleted !== false,
    };
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
      console.error('StatutTrello.getBoardLists failed', err);
      return [];
    }
  }

  async function readStatutSettings(t) {
    try {
      var stored = await t.get('board', 'shared', STATUT_SETTINGS_KEY);
      return normalizeSettings(stored);
    } catch (err) {
      console.error('StatutTrello.readStatutSettings failed', err);
      return defaultSettings();
    }
  }

  async function saveStatutSettings(t, settings) {
    var normalized = normalizeSettings(settings);
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
      autoMoveBlocked: base.autoMoveBlocked !== false,
      autoMoveCompleted: base.autoMoveCompleted !== false,
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
      lists.forEach(function (list) {
        if (!(list.id in current.listCategories)) {
          current.listCategories[list.id] = null;
          changed = true;
        }
      });
      if (changed) {
        current = await saveStatutSettings(t, current);
      }
      return { settings: current, lists: lists, detected: false };
    }

    var next = applyDetection(lists, current);
    next = await saveStatutSettings(t, next);
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
    var ensured = await ensureStatutSettings(t);
    var settings = ensured.settings;
    if (!settings.autoMoveBlocked) {
      return { ok: true, moved: false, reason: 'auto-move-disabled' };
    }
    var target = settings.roleLists && settings.roleLists.blocked;
    if (!target) return { ok: true, moved: false, reason: 'no-blocked-list' };
    return setCardList(t, target, { pos: 'bottom' });
  }

  async function maybeAutoMoveForCompleted(t) {
    var ensured = await ensureStatutSettings(t);
    var settings = ensured.settings;
    if (!settings.autoMoveCompleted) {
      return { ok: true, moved: false, reason: 'auto-move-disabled' };
    }
    var target = settings.roleLists && settings.roleLists.completed;
    if (!target) return { ok: true, moved: false, reason: 'no-completed-list' };
    return setCardList(t, target, { pos: 'bottom' });
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
        console.error('StatutTrello.applyStatutSideEffects getCardInputs failed', err);
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
    }

    if (isCompleted) {
      var CT = global.CompletionTrello;
      if (CT && typeof CT.getCardCompletion === 'function' && typeof CT.markFullyComplete === 'function') {
        try {
          var stored = await CT.getCardCompletion(t);
          var completeData = CT.markFullyComplete(stored);
          await CT.saveCardCompletion(t, completeData);
          side.progressComplete = true;
          side.completion = completeData;
        } catch (err) {
          console.error('StatutTrello.applyStatutSideEffects mark progress complete failed', err);
        }
      }

      if (PT && typeof PT.setCardDueComplete === 'function') {
        var mark = await PT.setCardDueComplete(t, true, { skipStatutAutoMove: true });
        side.dueComplete = mark;
        if (typeof PT.clearBlockedIfComplete === 'function') {
          await PT.clearBlockedIfComplete(t);
        }
      }
    }

    return side;
  }

  async function selectCardStatut(t, listId) {
    var move = await setCardList(t, listId, { pos: 'bottom' });
    if (!move.ok) return move;
    var side = await applyStatutSideEffects(t, listId);
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
  };
})(typeof window !== 'undefined' ? window : this);
