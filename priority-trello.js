/* Trello Power-Up bridge — card priority storage and badges. */
(function (global) {
  'use strict';

  var CARD_PRIORITY_KEY = 'cardPriority';
  var LEGACY_PRIORITY_KEY = 'priority';
  var MATRIX_SETTINGS_KEY = 'matrixLabelSettings';
  // Trello minimum for dynamic badge polling (card-badges / card-detail-badges).
  var BADGE_REFRESH_SEC = 10;
  // Label above the card-back badge; without this Trello shows the Power-Up admin name.
  var CARD_DETAIL_BADGE_TITLE = 'Priorité';

  function importantInputs() {
    var segments = typeof PriorityUI !== 'undefined' && PriorityUI.HEAT_SEGMENTS;
    if (segments) {
      for (var i = 0; i < segments.length; i++) {
        if (segments[i].label === 'Important' && segments[i].preset) {
          return Object.assign({}, segments[i].preset);
        }
      }
    }
    return { urgency: 2, impact: 2, ease: 3 };
  }

  var IMPORTANT_INPUTS = importantInputs();
  var DEFAULT_INPUTS = IMPORTANT_INPUTS;

  var LEGACY_ID_TO_INPUTS = {
    1: { urgency: 4, impact: 4, ease: 5 },
    2: { urgency: 3, impact: 3, ease: 2 },
    3: { urgency: 2, impact: 2, ease: 3 },
    4: { urgency: 1, impact: 1, ease: 2 },
    5: { urgency: 0, impact: 0, ease: 2 },
  };

  var PRIORITY_DIMENSIONS = [
    {
      key: 'urgency',
      label: 'Urgence',
      icon: 'ti-flame',
      wordsKey: 'urgency',
      min: 0,
      max: 4,
      value: 2,
    },
    {
      key: 'impact',
      label: 'Impact',
      icon: 'ti-target-arrow',
      wordsKey: 'impact',
      min: 0,
      max: 4,
      value: 2,
    },
    {
      key: 'ease',
      label: 'Effort',
      icon: 'ti-gauge',
      wordsKey: 'ease',
      min: 1,
      max: 5,
      value: 3,
    },
  ];

  function asNumber(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string' && value !== '') {
      var parsed = Number(value);
      if (isFinite(parsed)) return parsed;
    }
    return NaN;
  }

  function normalizeInputs(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var urgency = asNumber(raw.urgency);
    var impact = asNumber(raw.impact);
    var ease = asNumber(raw.ease);
    if (!isFinite(urgency) || !isFinite(impact) || !isFinite(ease)) return null;
    var normalized = {
      urgency: Math.max(0, Math.min(4, urgency)),
      impact: Math.max(0, Math.min(4, impact)),
      ease: Math.max(1, Math.min(5, ease)),
    };
    if (raw.enAttente === true) {
      normalized.enAttente = true;
      var reason = typeof raw.blockedReason === 'string' ? raw.blockedReason.trim() : '';
      if (
        reason &&
        typeof PriorityUI !== 'undefined' &&
        PriorityUI.isValidBlockedReason &&
        PriorityUI.isValidBlockedReason(reason)
      ) {
        normalized.blockedReason = reason;
      }
    }
    return normalized;
  }

  function clearBlockedFromInputs(inputs) {
    if (!inputs || !inputs.enAttente) return inputs;
    return {
      urgency: inputs.urgency,
      impact: inputs.impact,
      ease: inputs.ease,
    };
  }

  async function clearBlockedIfComplete(t, inputs, completed) {
    if (completed === undefined) {
      var dueResults = await Promise.all([getCardInputs(t), getCardDueComplete(t)]);
      inputs = dueResults[0];
      completed = dueResults[1] === true;
    } else if (inputs === undefined) {
      inputs = await getCardInputs(t);
    }
    if (!completed || !inputs || !inputs.enAttente) return inputs;
    var cleared = clearBlockedFromInputs(inputs);
    await t.set('card', 'shared', CARD_PRIORITY_KEY, cleared);
    return cleared;
  }

  async function getCardInputs(t) {
    var stored = await t.get('card', 'shared', CARD_PRIORITY_KEY);
    var normalized = normalizeInputs(stored);
    if (normalized) return normalized;

    var legacyId = await t.get('card', 'shared', LEGACY_PRIORITY_KEY);
    if (legacyId != null && legacyId !== '') {
      var mapped = LEGACY_ID_TO_INPUTS[+legacyId];
      if (mapped) return Object.assign({}, mapped);
    }
    return null;
  }

  async function getMatrixSettings(t) {
    var stored = await t.get('board', 'shared', MATRIX_SETTINGS_KEY);
    if (typeof PriorityMatrix !== 'undefined' && PriorityMatrix.normalizeSettings) {
      return PriorityMatrix.normalizeSettings(stored);
    }
    if (stored && typeof stored === 'object') return stored;
    return { enabled: true, overrides: {} };
  }

  function computeDisplay(inputs, labelSettings) {
    try {
      var result = PriorityUI.calc.baseline(inputs);
      return PriorityUI.resolveDisplay(result, inputs, labelSettings);
    } catch (err) {
      console.error('PriorityTrello.computeDisplay failed', err);
      return null;
    }
  }

  async function getCardDisplay(t) {
    var inputs = await getCardInputs(t);
    if (!inputs) return null;
    var settings = await getMatrixSettings(t);
    PriorityUI.setMatrixSettings(settings);
    return computeDisplay(inputs, settings);
  }

  // Tier-indexed badge dots (largest = highest priority). Unicode only — Trello badge text.
  var BADGE_DOTS_BY_TIER = {
    0: '\u2B24', // ⬤ Critique
    1: '\u2B24', // ⬤ Urgent (largest)
    2: '\u25CF', // ● Prioritaire
    3: '\u2022', // • Important (middle)
    4: '\u00B7', // · Flexible
    5: '\u00B7', // · Secondaire
    6: '\u00B7', // · Optionnel
  };
  var BADGE_DOT_INUTILE = '\u00B7'; // · inutile
  var BADGE_DOT_BLOCKED = '\u2298'; // ⊘ blocked / en attente
  var BADGE_DOT_COMPLETE = '\u2713'; // ✓ card marked complete in Trello
  var BLOCKED_BOARD_BADGE_ICON = './badges/blocked.svg';

  function tierBadgeDot(display, completed) {
    if (completed) return BADGE_DOT_COMPLETE;
    if (!display) return '\u25CF';
    if (display.blocked) return BADGE_DOT_BLOCKED;
    if (display.inutile) return BADGE_DOT_INUTILE;
    var i = display.tierI;
    if (i != null && Object.prototype.hasOwnProperty.call(BADGE_DOTS_BY_TIER, i)) {
      return BADGE_DOTS_BY_TIER[i];
    }
    return '\u25CF';
  }

  function incompleteBadgeLabel(display) {
    if (typeof PriorityUI !== 'undefined' && PriorityUI.taskBadgeLabel) {
      return PriorityUI.taskBadgeLabel(display);
    }
    var tierKey = String(display.tierLabel || display.label || '');
    if (tierKey === 'Important') return 'T\u00e2che Importante';
    return tierKey ? 'T\u00e2che ' + tierKey.toLowerCase() : '';
  }

  // Any t.card().get() chain object exposes .get — truthy, not completion data.
  function isPowerUpRequestChain(value) {
    return !!(value && typeof value === 'object' && typeof value.get === 'function');
  }

  function isCardMarkedComplete(card) {
    if (card === true) return true;
    if (card === false || card == null) return false;
    if (typeof card !== 'object') return false;
    if (isPowerUpRequestChain(card)) return false;
    if (card.dueComplete === true) return true;
    if (card.dueComplete === false) return false;
    if (card.badges && typeof card.badges === 'object' && !isPowerUpRequestChain(card.badges)) {
      if (card.badges.dueComplete === true) return true;
      if (card.badges.dueComplete === false) return false;
    }
    return false;
  }

  function cardFieldPromise(t, field) {
    return new Promise(function (resolve, reject) {
      t.card(field).get(field).then(resolve, reject);
    });
  }

  function formatCompletedBadgeLabel(taskLabel) {
    return 'Compl\u00e9t\u00e9 (' + taskLabel + ')';
  }

  function blockedBoardBadgeLabel(display) {
    var label;
    if (typeof PriorityUI !== 'undefined' && PriorityUI.blockedTaskBadgeLabel) {
      label = PriorityUI.blockedTaskBadgeLabel(display);
    } else {
      var tierKey = String(display.tierLabel || display.label || '');
      label = tierKey ? 'T\u00e2che ' + tierKey.toLowerCase() + ' bloqu\u00e9e' : 'T\u00e2che bloqu\u00e9e';
    }
    var trimmed = typeof display.blockedReason === 'string' ? display.blockedReason.trim() : '';
    if (trimmed) return label + ' \u2014 ' + trimmed;
    return label;
  }

  function formatBlockedBoardBadgeText(display) {
    return BADGE_DOT_BLOCKED + ' ' + blockedBoardBadgeLabel(display || {});
  }

  function completedBadgeTaskLabel(display) {
    return incompleteBadgeLabel(display);
  }

  function formatBadgeText(display, completed) {
    if (!display) return '';
    if (completed) {
      return BADGE_DOT_COMPLETE + ' ' + formatCompletedBadgeLabel(completedBadgeTaskLabel(display));
    }
    if (display.blocked) {
      return formatBlockedBoardBadgeText(display);
    }
    return tierBadgeDot(display, false) + ' ' + incompleteBadgeLabel(display);
  }

  function tierDetailBadgeColor(display) {
    if (!display) return 'light-gray';
    // Trello card badges only accept named colors (red, orange, …), not hex or CSS.
    if (display.inutile) return 'light-gray';
    var i = display.tierI;
    if (i === 0) return 'red';
    if (i === 1 || i === 2) return 'orange';
    if (i === 3) return 'green';
    if (i === 4) return 'sky';
    if (i === 5) return 'blue';
    return 'light-gray';
  }

  function buildCardFaceBadge(display, completed) {
    if (!display) return null;
    var badge = {
      text: formatBadgeText(display, completed),
      color: completed ? 'green' : tierDetailBadgeColor(display),
    };
    if (display.blocked && !completed) {
      badge.icon = pageUrl(BLOCKED_BOARD_BADGE_ICON);
      badge.monochrome = false;
    }
    return badge;
  }

  async function getCardDueComplete(t) {
    try {
      // Documented pattern: t.card(field).get(field).then(value) — resolves the scalar/object.
      // Never bare await t.card(...) (returns chain) or !!chain (always truthy → every ✓).
      var dueComplete = await cardFieldPromise(t, 'dueComplete');
      if (dueComplete === true) return true;
      if (dueComplete === false) return false;
      if (isPowerUpRequestChain(dueComplete)) {
        dueComplete = null;
      } else if (typeof dueComplete === 'object' && dueComplete !== null) {
        var fromObject = isCardMarkedComplete(dueComplete);
        if (fromObject) return true;
        if (dueComplete.dueComplete === false || (dueComplete.badges && dueComplete.badges.dueComplete === false)) {
          return false;
        }
      }

      var badges = await cardFieldPromise(t, 'badges');
      if (isPowerUpRequestChain(badges)) return false;
      if (badges && typeof badges === 'object') {
        if (badges.dueComplete === true) return true;
        if (badges.dueComplete === false) return false;
      }
      return false;
    } catch (err) {
      console.error('Priority card dueComplete failed', err);
      return false;
    }
  }

  async function getBadgeData(t) {
    var results = await Promise.all([getCardInputs(t), getCardDueComplete(t)]);
    var completed = results[1] === true;
    var inputs = await clearBlockedIfComplete(t, results[0], completed);
    var display = null;
    if (inputs) {
      var settings = await getMatrixSettings(t);
      PriorityUI.setMatrixSettings(settings);
      display = computeDisplay(inputs, settings);
    }
    return { display: display, completed: completed };
  }

  function withBadgeRefresh(badge) {
    if (!badge) return { refresh: BADGE_REFRESH_SEC };
    return Object.assign({ refresh: BADGE_REFRESH_SEC }, badge);
  }

  function dynamicCardFaceBadge(t) {
    return {
      dynamic: function () {
        return getBadgeData(t).then(function (data) {
          if (!data.display) return { refresh: BADGE_REFRESH_SEC };
          return withBadgeRefresh(buildCardFaceBadge(data.display, data.completed));
        });
      },
    };
  }

  function cardFaceBadges(t) {
    return getCardDisplay(t)
      .then(function (display) {
        if (!display) return [];
        return [dynamicCardFaceBadge(t)];
      })
      .catch(function (err) {
        console.error('Priority card-badges failed', err);
        return [];
      });
  }

  function cardDetailBadges(t, openCallback) {
    return [{
      dynamic: function () {
        return getBadgeData(t)
          .then(function (data) {
            if (!data.display) {
              return withBadgeRefresh({
                title: CARD_DETAIL_BADGE_TITLE,
                text: 'Définir la priorité',
                color: 'green',
                callback: openCallback,
              });
            }
            var badge = buildCardFaceBadge(data.display, data.completed);
            return withBadgeRefresh({
              title: CARD_DETAIL_BADGE_TITLE,
              text: badge.text,
              color: badge.color,
              callback: openCallback,
            });
          })
          .catch(function (err) {
            console.error('Priority card-detail-badges dynamic failed', err);
            return withBadgeRefresh({
              title: CARD_DETAIL_BADGE_TITLE,
              text: 'Définir la priorité',
              color: 'green',
              callback: openCallback,
            });
          });
      },
    }];
  }

  // Resolve a connector-relative path to an absolute URL for t.modal / t.popup.
  // Do not pre-sign — Trello signs modal/popup iframe URLs once. t.signUrl() here
  // double-signs and triggers "url that already has a hash" warnings.
  function pageUrl(relativePath) {
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

  function whenDomReady() {
    return new Promise(function (resolve) {
      if (typeof document === 'undefined' || document.readyState !== 'loading') {
        resolve();
        return;
      }
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  function createIframeClient() {
    if (typeof global.TrelloPowerUp === 'undefined') {
      throw new Error('TrelloPowerUp is not loaded');
    }
    return global.TrelloPowerUp.iframe();
  }

  // Call after DOM is ready so TrelloPowerUp.iframe() theme init finds document.body.
  function createIframeClientDeferred() {
    return whenDomReady().then(function () {
      return createIframeClient();
    });
  }

  // Defer t.get/set until Trello finishes the iframe handshake.
  // Residual feature-gate noise in power-up.min.js is Trello-internal (see README).
  function runWhenIframeReady(t, fn) {
    var started = false;
    return new Promise(function (resolve, reject) {
      if (!t || typeof t.render !== 'function') {
        Promise.resolve().then(fn).then(resolve, reject);
        return;
      }
      t.render(function () {
        if (started) return;
        started = true;
        Promise.resolve().then(fn).then(resolve, reject);
      });
    });
  }

  async function saveCardInputs(t, inputs) {
    var normalized = normalizeInputs(inputs);
    if (!normalized) return;
    await t.set('card', 'shared', CARD_PRIORITY_KEY, normalized);
  }

  async function getCardInputsById(t, cardId) {
    var stored = await t.get(cardId, 'shared', CARD_PRIORITY_KEY);
    var normalized = normalizeInputs(stored);
    if (normalized) return normalized;

    var legacyId = await t.get(cardId, 'shared', LEGACY_PRIORITY_KEY);
    if (legacyId != null && legacyId !== '') {
      var mapped = LEGACY_ID_TO_INPUTS[+legacyId];
      if (mapped) return Object.assign({}, mapped);
    }
    return null;
  }

  // Lower tier rank = higher priority (Critique=0 … Optionnel=6, Inutile=7, none=100).
  var SORT_TIER_INUTILE = 7;
  var SORT_TIER_NONE = 100;

  function prioritySortRank(display) {
    if (!display) return { tier: SORT_TIER_NONE, score: -1 };
    if (display.inutile) return { tier: SORT_TIER_INUTILE, score: 0 };
    var tier = display.tierI != null ? display.tierI : SORT_TIER_INUTILE;
    return { tier: tier, score: display.score || 0 };
  }

  function comparePriorityDisplays(displayA, displayB) {
    var rankA = prioritySortRank(displayA);
    var rankB = prioritySortRank(displayB);
    if (rankA.tier !== rankB.tier) return rankA.tier - rankB.tier;
    if (rankA.score !== rankB.score) return rankB.score - rankA.score;
    return 0;
  }

  async function sortListCardsByPriority(t, cards) {
    if (!cards || !cards.length) return { sortedIds: [] };

    var settings = await getMatrixSettings(t);
    var entries = await Promise.all(
      cards.map(async function (card) {
        var inputs = await getCardInputsById(t, card.id);
        var display = inputs ? computeDisplay(inputs, settings) : null;
        return { id: card.id, display: display };
      })
    );

    entries.sort(function (a, b) {
      return comparePriorityDisplays(a.display, b.display);
    });

    return { sortedIds: entries.map(function (entry) { return entry.id; }) };
  }

  function listPrioritySorters(t) {
    return [{
      text: 'Priorité',
      callback: function (ctx, opts) {
        return sortListCardsByPriority(ctx, opts.cards);
      },
    }];
  }

  global.PriorityTrello = {
    CARD_PRIORITY_KEY: CARD_PRIORITY_KEY,
    MATRIX_SETTINGS_KEY: MATRIX_SETTINGS_KEY,
    IMPORTANT_INPUTS: IMPORTANT_INPUTS,
    DEFAULT_INPUTS: DEFAULT_INPUTS,
    PRIORITY_DIMENSIONS: PRIORITY_DIMENSIONS,
    normalizeInputs: normalizeInputs,
    clearBlockedFromInputs: clearBlockedFromInputs,
    clearBlockedIfComplete: clearBlockedIfComplete,
    getCardInputs: getCardInputs,
    getMatrixSettings: getMatrixSettings,
    computeDisplay: computeDisplay,
    getCardDisplay: getCardDisplay,
    getCardDueComplete: getCardDueComplete,
    getBadgeData: getBadgeData,
    formatBadgeText: formatBadgeText,
    formatBlockedBoardBadgeText: formatBlockedBoardBadgeText,
    incompleteBadgeLabel: incompleteBadgeLabel,
    isCardMarkedComplete: isCardMarkedComplete,
    tierBadgeDot: tierBadgeDot,
    tierDetailBadgeColor: tierDetailBadgeColor,
    buildCardFaceBadge: buildCardFaceBadge,
    cardFaceBadges: cardFaceBadges,
    cardDetailBadges: cardDetailBadges,
    saveCardInputs: saveCardInputs,
    getCardInputsById: getCardInputsById,
    prioritySortRank: prioritySortRank,
    comparePriorityDisplays: comparePriorityDisplays,
    sortListCardsByPriority: sortListCardsByPriority,
    listPrioritySorters: listPrioritySorters,
    pageUrl: pageUrl,
    createIframeClient: createIframeClient,
    createIframeClientDeferred: createIframeClientDeferred,
    runWhenIframeReady: runWhenIframeReady,
    BADGE_REFRESH_SEC: BADGE_REFRESH_SEC,
    BADGE_DOT_BLOCKED: BADGE_DOT_BLOCKED,
    BADGE_DOT_COMPLETE: BADGE_DOT_COMPLETE,
  };
})(typeof window !== 'undefined' ? window : this);
