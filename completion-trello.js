/* Trello Power-Up bridge — card completion / subtask storage and badges. */
(function (global) {
  'use strict';

  var CARD_COMPLETION_KEY = 'cardCompletion';
  var COMPLETION_COLOR_SCHEME_SETTINGS_KEY = 'completionColorScheme';
  var COMPLETION_COLOR_SCHEME_REV_KEY = 'completionColorSchemeRev';
  // Set when this Power-Up marks the card dueComplete from all-subtasks-done.
  // Used to reverse Done only when we own the mark (not a user/manual Done).
  var COMPLETION_MARKED_DUE_COMPLETE_KEY = 'completionMarkedDueComplete';
  var CARD_DETAIL_BADGE_TITLE = 'Progrès';
  var boardCompletionColorSchemeKey = 'traffic';
  var BADGE_REFRESH_SEC =
    global.PriorityTrello && global.PriorityTrello.BADGE_REFRESH_SEC
      ? global.PriorityTrello.BADGE_REFRESH_SEC
      : 10;

  var ITEM_TEXT_MAX = 500;
  var PROGRESS_MIN = 0;
  var PROGRESS_MAX = 100;

  function asNumber(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string' && value !== '') {
      var parsed = Number(value);
      if (isFinite(parsed)) return parsed;
    }
    return NaN;
  }

  function clampProgress(value) {
    var p = asNumber(value);
    if (!isFinite(p)) return 0;
    return Math.max(PROGRESS_MIN, Math.min(PROGRESS_MAX, Math.round(p)));
  }

  function itemProgress(item) {
    if (!item || typeof item !== 'object') return 0;
    if (typeof item.progress === 'number' && isFinite(item.progress)) {
      return clampProgress(item.progress);
    }
    return item.done === true ? PROGRESS_MAX : PROGRESS_MIN;
  }

  function syncDoneFromProgress(item) {
    item.progress = clampProgress(item.progress);
    item.done = item.progress >= PROGRESS_MAX;
    return item;
  }

  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (!text) return null;
    if (text.length > ITEM_TEXT_MAX) text = text.slice(0, ITEM_TEXT_MAX);
    // Legacy `difficulty` fields are ignored (equal-weight progress).

    var progress = asNumber(raw.progress);
    if (!isFinite(progress)) {
      progress = raw.done === true ? PROGRESS_MAX : PROGRESS_MIN;
    }
    progress = clampProgress(progress);

    return syncDoneFromProgress({
      id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
      text: text,
      done: progress >= PROGRESS_MAX,
      progress: progress,
    });
  }

  function normalizeCompletionData(raw) {
    if (!raw || typeof raw !== 'object') return { items: [] };
    var items = Array.isArray(raw.items) ? raw.items : [];
    var normalized = [];
    var seenIds = Object.create(null);
    for (var i = 0; i < items.length; i++) {
      var item = normalizeItem(items[i]);
      if (!item) continue;
      if (seenIds[item.id]) continue;
      seenIds[item.id] = true;
      normalized.push(item);
    }
    var out;
    if (normalized.length) out = { items: normalized };
    else out = { items: [], progress: clampProgress(raw.progress) };
    if (raw.progressEnabled === false) out.progressEnabled = false;
    return out;
  }

  // Equal-weight average of item progress percentages.
  function computeWeightedProgress(items) {
    if (!items || !items.length) {
      return {
        percent: 0,
        doneCount: 0,
        totalCount: 0,
        doneWeight: 0,
        totalWeight: 0,
        hasItems: false,
      };
    }
    var progressSum = 0;
    var doneCount = 0;
    for (var i = 0; i < items.length; i++) {
      var p = itemProgress(items[i]);
      progressSum += p / PROGRESS_MAX;
      if (p >= PROGRESS_MAX) doneCount++;
    }
    var totalWeight = items.length;
    var percent = Math.round((progressSum / totalWeight) * 100);
    return {
      percent: percent,
      doneCount: doneCount,
      totalCount: items.length,
      doneWeight: Math.round(progressSum * 10) / 10,
      totalWeight: totalWeight,
      hasItems: true,
    };
  }

  function computeCardProgress(data) {
    var normalized = normalizeCompletionData(data);
    if (normalized.items.length) return computeWeightedProgress(normalized.items);
    return {
      percent: clampProgress(normalized.progress),
      doneCount: 0,
      totalCount: 0,
      doneWeight: 0,
      totalWeight: 0,
      hasItems: false,
    };
  }

  /** True when overall completedness is 100% (subtasks average or card-level progress). */
  function isAllSubtasksComplete(data) {
    var progress = computeCardProgress(data);
    return !!(progress && progress.percent >= 100);
  }

  /**
   * Force completion data to 100% (all subtasks, or card-level progress).
   * Clears progressEnabled:false so Progrès is treated as on.
   */
  function markFullyComplete(data) {
    var next = normalizeCompletionData(data || { items: [] });
    if (next.items && next.items.length) {
      next.items = applyMasterProgress(next.items, PROGRESS_MAX);
    } else {
      next.progress = PROGRESS_MAX;
    }
    delete next.progressEnabled;
    return normalizeCompletionData(next);
  }

  async function getMarkedDueCompleteFlag(t) {
    try {
      var flagged = await t.get('card', 'shared', COMPLETION_MARKED_DUE_COMPLETE_KEY);
      return flagged === true;
    } catch (err) {
      return false;
    }
  }

  async function setMarkedDueCompleteFlag(t, value) {
    try {
      if (value) {
        await t.set('card', 'shared', COMPLETION_MARKED_DUE_COMPLETE_KEY, true);
      } else {
        await t.set('card', 'shared', COMPLETION_MARKED_DUE_COMPLETE_KEY, false);
      }
    } catch (err) {
      console.error('Completion marked-due-complete flag failed', err);
    }
  }

  /**
   * When progress reaches 100% → mark card Done (dueComplete) via REST if available.
   * When leaving 100% → undo Done only if this feature set it.
   */
  async function syncCardDueCompleteFromProgress(t, data) {
    var allComplete = isAllSubtasksComplete(data);
    var PT = global.PriorityTrello;
    var weMarked = await getMarkedDueCompleteFlag(t);

    if (!PT || typeof PT.setCardDueComplete !== 'function') {
      return {
        allComplete: allComplete,
        synced: false,
        reason: 'no-setCardDueComplete',
      };
    }

    if (allComplete) {
      var markResult = await PT.setCardDueComplete(t, true);
      if (markResult && markResult.ok && markResult.changed) {
        await setMarkedDueCompleteFlag(t, true);
        return {
          allComplete: true,
          synced: true,
          changed: true,
          dueComplete: true,
        };
      }
      if (markResult && markResult.ok && !markResult.changed) {
        // Already Done (user/prior) — do not claim ownership for undo.
        return {
          allComplete: true,
          synced: true,
          changed: false,
          dueComplete: true,
          alreadyComplete: true,
        };
      }
      return {
        allComplete: true,
        synced: false,
        reason: (markResult && markResult.reason) || 'mark-failed',
        result: markResult,
      };
    }

    if (weMarked) {
      var unmarkResult = await PT.setCardDueComplete(t, false);
      await setMarkedDueCompleteFlag(t, false);
      return {
        allComplete: false,
        synced: !!(unmarkResult && unmarkResult.ok),
        changed: !!(unmarkResult && unmarkResult.changed),
        dueComplete: false,
        reason: unmarkResult && !unmarkResult.ok ? unmarkResult.reason : undefined,
      };
    }

    return { allComplete: false, synced: true, changed: false };
  }

  /**
   * Master slider: proportionally scale each item's progress so the average
   * approaches targetPercent. Items at 0% when current is 0 are set
   * uniformly to the target. Caps at 100% per item; done syncs from progress.
   */
  function applyMasterProgress(items, targetPercent) {
    if (!items || !items.length) return [];
    var target = clampProgress(targetPercent);
    var working = items.map(function (item) {
      return syncDoneFromProgress({
        id: item.id,
        text: item.text,
        progress: itemProgress(item),
        done: item.done === true,
      });
    });

    if (target === PROGRESS_MAX) {
      working.forEach(function (item) {
        item.progress = PROGRESS_MAX;
        syncDoneFromProgress(item);
      });
      return working;
    }
    if (target === PROGRESS_MIN) {
      working.forEach(function (item) {
        item.progress = PROGRESS_MIN;
        syncDoneFromProgress(item);
      });
      return working;
    }

    var current = computeWeightedProgress(working).percent;
    if (current === target) return working;

    if (current === 0) {
      working.forEach(function (item) {
        item.progress = target;
        syncDoneFromProgress(item);
      });
      return working;
    }

    var scale = target / current;
    working.forEach(function (item) {
      item.progress = clampProgress(item.progress * scale);
      syncDoneFromProgress(item);
    });

    return working;
  }

  async function getCardCompletion(t) {
    var stored = await t.get('card', 'shared', CARD_COMPLETION_KEY);
    return normalizeCompletionData(stored);
  }

  async function saveCardCompletion(t, data) {
    var normalized = normalizeCompletionData(data);
    await t.set('card', 'shared', CARD_COMPLETION_KEY, normalized);
    return normalized;
  }

  function formatFaceBadgeText(progress) {
    if (!progress || progress.percent <= 0) return '';
    if (progress.percent === 100) {
      return '\u2713 ' + progress.percent + '\u00a0%';
    }
    return progress.percent + '\u00a0%';
  }

  function faceBadgeColor(progress) {
    if (!progress || progress.percent <= 0) return 'light-gray';
    if (typeof global.CompletionUI !== 'undefined' && global.CompletionUI.completionTrelloBadgeColor) {
      return global.CompletionUI.completionTrelloBadgeColor(progress.percent);
    }
    if (progress.percent === 100) return 'green';
    if (progress.percent >= 50) return 'blue';
    return 'sky';
  }

  async function getBoardCompletionColorScheme(t) {
    if (typeof global.CompletionUI === 'undefined') return 'traffic';
    try {
      var stored = await t.get('board', 'shared', COMPLETION_COLOR_SCHEME_SETTINGS_KEY);
      if (typeof stored === 'string') {
        boardCompletionColorSchemeKey = global.CompletionUI.normalizeCompletionSchemeKey(stored);
        global.CompletionUI.applyCompletionColorScheme(boardCompletionColorSchemeKey);
        return boardCompletionColorSchemeKey;
      }
    } catch (err) {
      console.error('Completion board color scheme load failed', err);
    }
    var fromLocal = global.CompletionUI.loadStoredCompletionSchemeKey();
    boardCompletionColorSchemeKey = fromLocal || global.CompletionUI.DEFAULT_COMPLETION_SCHEME_KEY || 'traffic';
    global.CompletionUI.applyCompletionColorScheme(boardCompletionColorSchemeKey);
    return boardCompletionColorSchemeKey;
  }

  async function saveBoardCompletionColorScheme(t, schemeKey) {
    if (typeof global.CompletionUI === 'undefined') return 'traffic';
    var key = global.CompletionUI.normalizeCompletionSchemeKey(schemeKey);
    boardCompletionColorSchemeKey = key;
    global.CompletionUI.applyCompletionColorScheme(key);
    global.CompletionUI.saveStoredCompletionSchemeKey(key);
    await t.set('board', 'shared', COMPLETION_COLOR_SCHEME_SETTINGS_KEY, key);
    await t.set('board', 'shared', COMPLETION_COLOR_SCHEME_REV_KEY, Date.now());
    return key;
  }

  async function preloadBoardCompletionContext(t) {
    return getBoardCompletionColorScheme(t);
  }

  function getCachedBoardCompletionColorSchemeKey() {
    return boardCompletionColorSchemeKey || 'traffic';
  }

  function buildCardFaceBadge(progress) {
    if (!progress || progress.percent <= 0) return null;
    return {
      text: formatFaceBadgeText(progress),
      color: faceBadgeColor(progress),
    };
  }

  function formatDetailBadgeText(progress) {
    if (!progress) return 'D\u00e9finir le progr\u00e8s';
    if (!progress.hasItems) {
      return progress.percent > 0 ? progress.percent + '\u00a0%' : 'D\u00e9finir le progr\u00e8s';
    }
    return progress.percent + '\u00a0% (' + progress.doneCount + '/' + progress.totalCount + ')';
  }

  function withBadgeRefresh(badge) {
    if (!badge) return { refresh: BADGE_REFRESH_SEC };
    return Object.assign({ refresh: BADGE_REFRESH_SEC }, badge);
  }

  async function getBadgeData(t) {
    var results = await Promise.all([
      getCardCompletion(t),
      t.get('board', 'shared', COMPLETION_COLOR_SCHEME_REV_KEY).catch(function () { return null; }),
    ]);
    var data = results[0];
    await getBoardCompletionColorScheme(t);
    var progress = computeCardProgress(data);
    return { data: data, progress: progress };
  }

  function dynamicCardFaceBadge(t) {
    return {
      dynamic: function () {
        return getBadgeData(t).then(function (result) {
          if (result.data && result.data.progressEnabled === false) {
            return { refresh: BADGE_REFRESH_SEC };
          }
          if (result.progress.percent <= 0) {
            return { refresh: BADGE_REFRESH_SEC };
          }
          return withBadgeRefresh(buildCardFaceBadge(result.progress));
        });
      },
    };
  }

  function cardFaceBadges(t) {
    return getCardCompletion(t)
      .then(function (data) {
        if (data && data.progressEnabled === false) return [];
        var progress = computeCardProgress(data);
        if (progress.percent <= 0) return [];
        return [dynamicCardFaceBadge(t)];
      })
      .catch(function (err) {
        console.error('Completion card-badges failed', err);
        return [];
      });
  }

  function cardDetailBadges(t, openCallback) {
    return [{
      dynamic: function () {
        return getBadgeData(t)
          .then(function (result) {
            if (result.data && result.data.progressEnabled === false) {
              return withBadgeRefresh({
                title: CARD_DETAIL_BADGE_TITLE,
                text: 'D\u00e9finir le progr\u00e8s',
                color: 'blue',
                callback: openCallback,
              });
            }
            var progress = result.progress;
            return withBadgeRefresh({
              title: CARD_DETAIL_BADGE_TITLE,
              text: formatDetailBadgeText(progress),
              color: progress.percent > 0 ? faceBadgeColor(progress) : 'blue',
              callback: openCallback,
            });
          })
          .catch(function (err) {
            console.error('Completion card-detail-badges dynamic failed', err);
            return withBadgeRefresh({
              title: CARD_DETAIL_BADGE_TITLE,
              text: 'D\u00e9finir le progr\u00e8s',
              color: 'blue',
              callback: openCallback,
            });
          });
      },
    }];
  }

  function pageUrl(relativePath) {
    if (global.PriorityTrello && typeof global.PriorityTrello.pageUrl === 'function') {
      return global.PriorityTrello.pageUrl(relativePath);
    }
    var path = relativePath || '';
    if (
      typeof global.TrelloPowerUp !== 'undefined' &&
      global.TrelloPowerUp.util &&
      typeof global.TrelloPowerUp.util.relativeUrl === 'function'
    ) {
      return global.TrelloPowerUp.util.relativeUrl(path);
    }
    try {
      return new URL(path, global.location.href).href.split('#')[0];
    } catch (err) {
      return path;
    }
  }

  function initIframePage(onReady) {
    if (global.PriorityTrello && typeof global.PriorityTrello.initIframePage === 'function') {
      return global.PriorityTrello.initIframePage(onReady);
    }
    throw new Error('PriorityTrello.initIframePage is required for completion iframe pages');
  }

  async function getCardName(t) {
    if (global.PriorityTrello && typeof global.PriorityTrello.getCardName === 'function') {
      return global.PriorityTrello.getCardName(t);
    }
    if (typeof t.arg === 'function') {
      var fromArg = t.arg('cardName');
      if (typeof fromArg === 'string' && fromArg.trim()) return fromArg.trim();
    }
    return null;
  }

  global.CompletionTrello = {
    CARD_COMPLETION_KEY: CARD_COMPLETION_KEY,
    COMPLETION_COLOR_SCHEME_SETTINGS_KEY: COMPLETION_COLOR_SCHEME_SETTINGS_KEY,
    COMPLETION_COLOR_SCHEME_REV_KEY: COMPLETION_COLOR_SCHEME_REV_KEY,
    COMPLETION_MARKED_DUE_COMPLETE_KEY: COMPLETION_MARKED_DUE_COMPLETE_KEY,
    ITEM_TEXT_MAX: ITEM_TEXT_MAX,
    PROGRESS_MIN: PROGRESS_MIN,
    PROGRESS_MAX: PROGRESS_MAX,
    clampProgress: clampProgress,
    itemProgress: itemProgress,
    syncDoneFromProgress: syncDoneFromProgress,
    generateId: generateId,
    normalizeItem: normalizeItem,
    normalizeCompletionData: normalizeCompletionData,
    computeWeightedProgress: computeWeightedProgress,
    computeCardProgress: computeCardProgress,
    isAllSubtasksComplete: isAllSubtasksComplete,
    markFullyComplete: markFullyComplete,
    syncCardDueCompleteFromProgress: syncCardDueCompleteFromProgress,
    applyMasterProgress: applyMasterProgress,
    getCardCompletion: getCardCompletion,
    saveCardCompletion: saveCardCompletion,
    getBoardCompletionColorScheme: getBoardCompletionColorScheme,
    saveBoardCompletionColorScheme: saveBoardCompletionColorScheme,
    preloadBoardCompletionContext: preloadBoardCompletionContext,
    getCachedBoardCompletionColorSchemeKey: getCachedBoardCompletionColorSchemeKey,
    formatFaceBadgeText: formatFaceBadgeText,
    formatDetailBadgeText: formatDetailBadgeText,
    buildCardFaceBadge: buildCardFaceBadge,
    getBadgeData: getBadgeData,
    cardFaceBadges: cardFaceBadges,
    cardDetailBadges: cardDetailBadges,
    pageUrl: pageUrl,
    initIframePage: initIframePage,
    getCardName: getCardName,
    BADGE_REFRESH_SEC: BADGE_REFRESH_SEC,
  };
})(typeof window !== 'undefined' ? window : this);
