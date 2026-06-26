/* Trello Power-Up bridge — card priority storage and badges. */
(function (global) {
  'use strict';

  var CARD_PRIORITY_KEY = 'cardPriority';
  var LEGACY_PRIORITY_KEY = 'priority';
  var CARD_BADGE_REFRESH_SEC = 10;

  var DEFAULT_INPUTS = { urgency: 2, impact: 2, ease: 3 };

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

  function normalizeInputs(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.urgency !== 'number' || typeof raw.impact !== 'number' || typeof raw.ease !== 'number') {
      return null;
    }
    return {
      urgency: Math.max(0, Math.min(4, raw.urgency)),
      impact: Math.max(0, Math.min(4, raw.impact)),
      ease: Math.max(1, Math.min(5, raw.ease)),
    };
  }

  function formatScore(score) {
    return Math.abs(score - Math.round(score)) < 0.01
      ? String(Math.round(score))
      : score.toFixed(1);
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

  function computeDisplay(inputs) {
    var result = PriorityUI.calc.baseline(inputs);
    return PriorityUI.resolveDisplay(result, inputs);
  }

  async function getCardDisplay(t) {
    var inputs = await getCardInputs(t);
    if (!inputs) return null;
    return computeDisplay(inputs);
  }

  function formatBadgeText(display) {
    if (!display) return '';
    return formatScore(display.score) + ' · ' + display.label;
  }

  function tierDetailBadgeColor(display) {
    if (!display || display.inutile) return 'light-gray';
    var i = display.tierI;
    if (i === 0 || i === 1) return 'red';
    if (i === 2) return 'orange';
    if (i === 3) return 'green';
    if (i === 4) return 'sky';
    if (i === 5) return 'blue';
    return 'light-gray';
  }

  function tierDotIcon(hex) {
    var safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#9B9890';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">'
      + '<circle cx="5" cy="5" r="4.5" fill="' + safe + '"/></svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function buildCardFaceBadge(display) {
    if (!display) return null;
    return {
      icon: tierDotIcon(display.seg),
      text: formatBadgeText(display),
      color: tierDetailBadgeColor(display),
      monochrome: false,
      refresh: CARD_BADGE_REFRESH_SEC,
    };
  }

  function cardFaceBadges(t) {
    return getCardDisplay(t).then(function (display) {
      var badge = buildCardFaceBadge(display);
      if (!badge) return [];
      var staticBadge = Object.assign({}, badge);
      delete staticBadge.refresh;
      return [staticBadge];
    });
  }

  function cardFaceBadgesCapability(t) {
    return [{
      dynamic: function () {
        return getCardDisplay(t).then(function (display) {
          if (!display) {
            return { refresh: CARD_BADGE_REFRESH_SEC };
          }
          return buildCardFaceBadge(display);
        });
      },
    }];
  }

  async function saveCardInputs(t, inputs) {
    var normalized = normalizeInputs(inputs);
    if (!normalized) return;
    await t.set('card', 'shared', CARD_PRIORITY_KEY, normalized);
    var legacyId = await t.get('card', 'shared', LEGACY_PRIORITY_KEY);
    if (legacyId != null && legacyId !== '') {
      await t.remove('card', 'shared', LEGACY_PRIORITY_KEY);
    }
  }

  async function clearCardPriority(t) {
    await t.remove('card', 'shared', CARD_PRIORITY_KEY);
    await t.remove('card', 'shared', LEGACY_PRIORITY_KEY);
  }

  global.PriorityTrello = {
    CARD_PRIORITY_KEY: CARD_PRIORITY_KEY,
    DEFAULT_INPUTS: DEFAULT_INPUTS,
    PRIORITY_DIMENSIONS: PRIORITY_DIMENSIONS,
    normalizeInputs: normalizeInputs,
    getCardInputs: getCardInputs,
    computeDisplay: computeDisplay,
    getCardDisplay: getCardDisplay,
    formatBadgeText: formatBadgeText,
    tierDetailBadgeColor: tierDetailBadgeColor,
    tierDotIcon: tierDotIcon,
    buildCardFaceBadge: buildCardFaceBadge,
    cardFaceBadges: cardFaceBadges,
    cardFaceBadgesCapability: cardFaceBadgesCapability,
    saveCardInputs: saveCardInputs,
    clearCardPriority: clearCardPriority,
  };
})(typeof window !== 'undefined' ? window : this);
