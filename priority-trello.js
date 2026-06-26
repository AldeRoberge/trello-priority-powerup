/* Trello Power-Up bridge — card priority storage and badges. */
(function (global) {
  'use strict';

  var CARD_PRIORITY_KEY = 'cardPriority';
  var LEGACY_PRIORITY_KEY = 'priority';
  var MATRIX_SETTINGS_KEY = 'matrixLabelSettings';
  // Trello minimum for dynamic badge polling (card-badges / card-detail-badges).
  var BADGE_REFRESH_SEC = 10;

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
    if (raw.enAttente === true) normalized.enAttente = true;
    return normalized;
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

  function tierBadgeDot(display) {
    if (!display) return '\u25CF';
    if (display.blocked) return BADGE_DOT_BLOCKED;
    if (display.inutile) return BADGE_DOT_INUTILE;
    var i = display.tierI;
    if (i != null && Object.prototype.hasOwnProperty.call(BADGE_DOTS_BY_TIER, i)) {
      return BADGE_DOTS_BY_TIER[i];
    }
    return '\u25CF';
  }

  function formatBadgeText(display) {
    if (!display) return '';
    if (display.blocked && typeof PriorityUI !== 'undefined' && PriorityUI.BLOCKED_DISPLAY) {
      return PriorityUI.BLOCKED_DISPLAY;
    }
    var label = (typeof PriorityUI !== 'undefined' && PriorityUI.classicTierLabel)
      ? PriorityUI.classicTierLabel(display)
      : (display.tierLabel || display.label);
    return tierBadgeDot(display) + ' ' + label;
  }

  function tierDetailBadgeColor(display) {
    if (!display) return 'light-gray';
    if (display.blocked) return 'pink';
    if (display.inutile) return 'light-gray';
    var i = display.tierI;
    if (i === 0) return 'red';
    if (i === 1 || i === 2) return 'orange';
    if (i === 3) return 'green';
    if (i === 4) return 'sky';
    if (i === 5) return 'blue';
    return 'light-gray';
  }

  function buildCardFaceBadge(display) {
    if (!display) return null;
    return {
      text: formatBadgeText(display),
      color: tierDetailBadgeColor(display),
    };
  }

  function withBadgeRefresh(badge) {
    if (!badge) return { refresh: BADGE_REFRESH_SEC };
    return Object.assign({ refresh: BADGE_REFRESH_SEC }, badge);
  }

  function dynamicCardFaceBadge(t) {
    return {
      dynamic: function () {
        return getCardDisplay(t).then(function (display) {
          if (!display) return { refresh: BADGE_REFRESH_SEC };
          return withBadgeRefresh(buildCardFaceBadge(display));
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
        return getCardDisplay(t)
          .then(function (display) {
            if (!display) {
              return withBadgeRefresh({
                text: 'Définir la priorité',
                color: 'green',
                callback: openCallback,
              });
            }
            var badge = buildCardFaceBadge(display);
            return withBadgeRefresh({
              text: badge.text,
              color: badge.color,
              callback: openCallback,
            });
          })
          .catch(function (err) {
            console.error('Priority card-detail-badges dynamic failed', err);
            return withBadgeRefresh({
              text: 'Définir la priorité',
              color: 'green',
              callback: openCallback,
            });
          });
      },
    }];
  }

  async function saveCardInputs(t, inputs) {
    var normalized = normalizeInputs(inputs);
    if (!normalized) return;
    if (inputs && inputs.enAttente === true) {
      normalized.enAttente = true;
    } else {
      delete normalized.enAttente;
    }
    await t.set('card', 'shared', CARD_PRIORITY_KEY, normalized);
  }

  global.PriorityTrello = {
    CARD_PRIORITY_KEY: CARD_PRIORITY_KEY,
    MATRIX_SETTINGS_KEY: MATRIX_SETTINGS_KEY,
    IMPORTANT_INPUTS: IMPORTANT_INPUTS,
    DEFAULT_INPUTS: DEFAULT_INPUTS,
    PRIORITY_DIMENSIONS: PRIORITY_DIMENSIONS,
    normalizeInputs: normalizeInputs,
    getCardInputs: getCardInputs,
    getMatrixSettings: getMatrixSettings,
    computeDisplay: computeDisplay,
    getCardDisplay: getCardDisplay,
    formatBadgeText: formatBadgeText,
    tierBadgeDot: tierBadgeDot,
    tierDetailBadgeColor: tierDetailBadgeColor,
    buildCardFaceBadge: buildCardFaceBadge,
    cardFaceBadges: cardFaceBadges,
    cardDetailBadges: cardDetailBadges,
    saveCardInputs: saveCardInputs,
    BADGE_REFRESH_SEC: BADGE_REFRESH_SEC,
    BADGE_DOT_BLOCKED: BADGE_DOT_BLOCKED,
  };
})(typeof window !== 'undefined' ? window : this);
