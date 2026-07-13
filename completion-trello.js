/* Trello Power-Up bridge — card completion / subtask storage and badges. */
(function (global) {
  'use strict';

  var CARD_COMPLETION_KEY = 'cardCompletion';
  var COMPLETION_COLOR_SCHEME_SETTINGS_KEY = 'completionColorScheme';
  var COMPLETION_COLOR_SCHEME_REV_KEY = 'completionColorSchemeRev';
  var CARD_DETAIL_BADGE_TITLE = 'Progrès';
  var boardCompletionColorSchemeKey = 'traffic';
  var BADGE_REFRESH_SEC =
    global.PriorityTrello && global.PriorityTrello.BADGE_REFRESH_SEC
      ? global.PriorityTrello.BADGE_REFRESH_SEC
      : 10;

  // Difficulty 0–4 (Facile → Très difficile), aligned with priority sliders.
  // Weight = difficulty + 1 → range 1–5 (easy tasks count less toward total work).
  var DIFFICULTY_MIN = 0;
  var DIFFICULTY_MAX = 4;
  var ITEM_TEXT_MAX = 500;
  var PROGRESS_MIN = 0;
  var PROGRESS_MAX = 100;

  var DIFFICULTY_LEVELS = [
    { value: 0, label: 'Facile', short: 'F' },
    { value: 1, label: 'Assez facile', short: 'AF' },
    { value: 2, label: 'Moyen', short: 'M' },
    { value: 3, label: 'Difficile', short: 'D' },
    { value: 4, label: 'Très difficile', short: 'TD' },
  ];

  function difficultyWeight(difficulty) {
    var d = asNumber(difficulty);
    if (!isFinite(d)) d = 2;
    d = Math.max(DIFFICULTY_MIN, Math.min(DIFFICULTY_MAX, Math.round(d)));
    return d + 1;
  }

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
    var difficulty = asNumber(raw.difficulty);
    if (!isFinite(difficulty)) difficulty = 2;
    difficulty = Math.max(DIFFICULTY_MIN, Math.min(DIFFICULTY_MAX, Math.round(difficulty)));

    var progress = asNumber(raw.progress);
    if (!isFinite(progress)) {
      progress = raw.done === true ? PROGRESS_MAX : PROGRESS_MIN;
    }
    progress = clampProgress(progress);

    return syncDoneFromProgress({
      id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
      text: text,
      done: progress >= PROGRESS_MAX,
      difficulty: difficulty,
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
    if (normalized.length) return { items: normalized };
    return { items: [], progress: clampProgress(raw.progress) };
  }

  // Weighted total: sum(weight * progress/100) / sum(weight) * 100
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
    var weightedSum = 0;
    var totalWeight = 0;
    var doneCount = 0;
    for (var i = 0; i < items.length; i++) {
      var w = difficultyWeight(items[i].difficulty);
      var p = itemProgress(items[i]);
      totalWeight += w;
      weightedSum += w * (p / PROGRESS_MAX);
      if (p >= PROGRESS_MAX) doneCount++;
    }
    var percent = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;
    return {
      percent: percent,
      doneCount: doneCount,
      totalCount: items.length,
      doneWeight: Math.round(weightedSum * 10) / 10,
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

  /**
   * Master slider: proportionally scale each item's progress so the weighted
   * average approaches targetPercent. Items at 0% when current is 0 are set
   * uniformly to the target. Caps at 100% per item; done syncs from progress.
   */
  function applyMasterProgress(items, targetPercent) {
    if (!items || !items.length) return [];
    var target = clampProgress(targetPercent);
    var working = items.map(function (item) {
      return syncDoneFromProgress({
        id: item.id,
        text: item.text,
        difficulty: item.difficulty,
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
    ITEM_TEXT_MAX: ITEM_TEXT_MAX,
    DIFFICULTY_MIN: DIFFICULTY_MIN,
    DIFFICULTY_MAX: DIFFICULTY_MAX,
    PROGRESS_MIN: PROGRESS_MIN,
    PROGRESS_MAX: PROGRESS_MAX,
    DIFFICULTY_LEVELS: DIFFICULTY_LEVELS,
    difficultyWeight: difficultyWeight,
    clampProgress: clampProgress,
    itemProgress: itemProgress,
    syncDoneFromProgress: syncDoneFromProgress,
    generateId: generateId,
    normalizeItem: normalizeItem,
    normalizeCompletionData: normalizeCompletionData,
    computeWeightedProgress: computeWeightedProgress,
    computeCardProgress: computeCardProgress,
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
