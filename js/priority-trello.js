/* Trello Power-Up bridge — card priority storage and badges. */
(function (global) {
  'use strict';

  var CARD_PRIORITY_KEY = 'cardPriority';
  var LEGACY_PRIORITY_KEY = 'priority';
  var MATRIX_SETTINGS_KEY = 'matrixLabelSettings';
  var FORMULA_SETTINGS_KEY = 'priorityFormula';
  var COLOR_SCHEME_SETTINGS_KEY = 'priorityColorScheme';
  var COLOR_SCHEME_REV_KEY = 'priorityColorSchemeRev';
  // Last agreed Trello `due` ISO ('' = no due). Used for Échéance ↔ Dates conflict detection.
  var CARD_DUE_SYNCED_KEY = 'cardDueSyncedIso';
  var boardFormulaKey = 'baseline';
  var boardColorSchemeKey = null;
  // Trello minimum for dynamic badge polling (card-badges / card-detail-badges).
  var BADGE_REFRESH_SEC = 10;
  // Label above the card-back badge; without this Trello shows the Power-Up admin name.
  var CARD_DETAIL_BADGE_TITLE = 'Priorité';
  // Lower tier rank = higher priority (Critique=0 … Optionnelle=6, Inutile=7, none=100).
  var SORT_TIER_INUTILE = 7;
  var SORT_TIER_NONE = 100;

  function priorityUI() {
    return global.PriorityUI || null;
  }

  function defaultColorSchemeKey() {
    var PU = priorityUI();
    return (PU && PU.DEFAULT_COLOR_SCHEME_KEY) || 'blue';
  }

  function trelloBadgeMuted() {
    var PU = priorityUI();
    return (PU && PU.TRELLO_BADGE_COLOR_MUTED) || 'light-gray';
  }

  function trelloBadgeComplete() {
    var PU = priorityUI();
    return (PU && PU.TRELLO_BADGE_COLOR_COMPLETE) || 'green';
  }

  function importanteTierIndex() {
    var PU = priorityUI();
    if (PU && PU.TIER_I && PU.TIER_I.IMPORTANTE != null) return PU.TIER_I.IMPORTANTE;
    return 3;
  }

  function importantInputs() {
    var PU = priorityUI();
    var segments = PU && PU.HEAT_SEGMENTS;
    var targetI = importanteTierIndex();
    if (segments) {
      for (var i = 0; i < segments.length; i++) {
        if (segments[i].i === targetI && segments[i].preset) {
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
      label: 'Facilité',
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
    if (raw.priorityEnabled === false) {
      normalized.priorityEnabled = false;
    }

    // Keep blockedReasons even when off so re-enable restores the draft.
    var PU = priorityUI();
    var reasons =
      PU && PU.normalizeBlockedReasons
        ? PU.normalizeBlockedReasons(raw)
        : (function () {
            if (Array.isArray(raw.blockedReasons)) {
              return raw.blockedReasons
                .map(function (r) {
                  return typeof r === 'string' ? r.trim() : '';
                })
                .filter(Boolean);
            }
            if (typeof raw.blockedReason === 'string') {
              var legacy = raw.blockedReason.trim();
              return legacy ? [legacy] : [];
            }
            return [];
          })();
    if (reasons.length) {
      var validReasons = [];
      for (var ri = 0; ri < reasons.length; ri++) {
        var reason = reasons[ri];
        if (
          !PU ||
          !PU.isValidBlockedReason ||
          PU.isValidBlockedReason(reason)
        ) {
          validReasons.push(reason);
        }
      }
      if (validReasons.length) normalized.blockedReasons = validReasons;
      reasons = validReasons;
    }
    if (raw.enAttente === true) {
      normalized.enAttente = true;
    }
    // Links to completion subtasks when waiting on other tasks (multi).
    var links =
      PU && PU.normalizeBlockedLinks
        ? PU.normalizeBlockedLinks(raw)
        : (function () {
            if (Array.isArray(raw.blockedLinks)) return raw.blockedLinks;
            if (raw.blockedLink && typeof raw.blockedLink === 'object') {
              return [raw.blockedLink];
            }
            if (typeof raw.blockedSubtaskId === 'string' && raw.blockedSubtaskId.trim()) {
              return [{ type: 'subtask', id: raw.blockedSubtaskId.trim() }];
            }
            return [];
          })();
    var waitingOther =
      (reasons.length > 0 &&
        PU &&
        PU.isBlockedWaitingOtherTask &&
        PU.isBlockedWaitingOtherTask(reasons)) ||
      links.length > 0;
    if (waitingOther && links.length) {
      var validLinks = [];
      var seenLinkIds = Object.create(null);
      for (var li = 0; li < links.length; li++) {
        var link =
          PU && PU.normalizeBlockedLink
            ? PU.normalizeBlockedLink(links[li])
            : links[li] && links[li].type === 'subtask' && links[li].id
              ? { type: 'subtask', id: String(links[li].id).trim() }
              : null;
        if (!link || seenLinkIds[link.id]) continue;
        seenLinkIds[link.id] = true;
        validLinks.push(link);
      }
      if (validLinks.length) {
        normalized.blockedLinks = validLinks;
        // Soft back-compat for older readers.
        normalized.blockedLink = validLinks[0];
        if (
          PU &&
          PU.isBlockedWaitingOtherTask &&
          !PU.isBlockedWaitingOtherTask(reasons) &&
          PU.BLOCKED_REASON_WAITING_OTHER_TASK
        ) {
          reasons = reasons.concat([PU.BLOCKED_REASON_WAITING_OTHER_TASK]);
          normalized.blockedReasons = reasons;
        }
      }
    }

    var dueDate = '';
    if (typeof raw.dueDate === 'string') {
      var PUDue = priorityUI();
      dueDate = PUDue && PUDue.normalizeDueDate
        ? PUDue.normalizeDueDate(raw.dueDate)
        : raw.dueDate.trim();
      if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) dueDate = '';
    }
    if (dueDate) {
      normalized.dueDate = dueDate;
      if (typeof raw.dueTime === 'string') {
        var PUTime = priorityUI();
        var dueTime = PUTime && PUTime.normalizeDueTime
          ? PUTime.normalizeDueTime(raw.dueTime)
          : raw.dueTime.trim();
        if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) dueTime = '';
        if (dueTime) normalized.dueTime = dueTime;
      }
      // Back-compat: missing dueEnabled + dueDate ⇒ enabled.
      if (raw.dueEnabled === false) normalized.dueEnabled = false;
    }
    return normalized;
  }

  function clearBlockedFromInputs(inputs) {
    var hasReasons =
      inputs &&
      ((Array.isArray(inputs.blockedReasons) && inputs.blockedReasons.length > 0) ||
        (typeof inputs.blockedReason === 'string' && inputs.blockedReason));
    var hasLinks =
      inputs &&
      ((Array.isArray(inputs.blockedLinks) && inputs.blockedLinks.length > 0) ||
        inputs.blockedLink);
    if (!inputs || (!inputs.enAttente && !hasReasons && !hasLinks)) {
      return inputs;
    }
    var cleared = {
      urgency: inputs.urgency,
      impact: inputs.impact,
      ease: inputs.ease,
    };
    if (inputs.priorityEnabled === false) cleared.priorityEnabled = false;
    if (typeof inputs.dueDate === 'string' && inputs.dueDate) {
      cleared.dueDate = inputs.dueDate;
      if (typeof inputs.dueTime === 'string' && inputs.dueTime) {
        cleared.dueTime = inputs.dueTime;
      }
      if (inputs.dueEnabled === false) cleared.dueEnabled = false;
    }
    return cleared;
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

  async function readStoredCardInputs(t, scope) {
    var stored = await t.get(scope, 'shared', CARD_PRIORITY_KEY);
    var normalized = normalizeInputs(stored);
    if (normalized) return normalized;

    var legacyId = await t.get(scope, 'shared', LEGACY_PRIORITY_KEY);
    if (legacyId != null && legacyId !== '') {
      var mapped = LEGACY_ID_TO_INPUTS[+legacyId];
      if (mapped) return Object.assign({}, mapped);
    }
    return null;
  }

  async function getCardInputs(t) {
    return readStoredCardInputs(t, 'card');
  }

  async function getMatrixSettings(t) {
    var stored = await t.get('board', 'shared', MATRIX_SETTINGS_KEY);
    if (typeof PriorityMatrix !== 'undefined' && PriorityMatrix.normalizeSettings) {
      return PriorityMatrix.normalizeSettings(stored);
    }
    if (stored && typeof stored === 'object') return stored;
    return { enabled: true, overrides: {} };
  }

  async function getBoardFormula(t) {
    var PU = priorityUI();
    if (!PU) return 'baseline';
    try {
      var stored = await t.get('board', 'shared', FORMULA_SETTINGS_KEY);
      if (typeof stored === 'string') {
        boardFormulaKey = PU.normalizeFormulaKey(stored);
      } else if (stored && typeof stored === 'object' && stored.formula) {
        boardFormulaKey = PU.normalizeFormulaKey(stored.formula);
      }
    } catch (err) {
      console.error('Priority board formula load failed', err);
    }
    return boardFormulaKey;
  }

  async function saveBoardFormula(t, formulaKey) {
    var PU = priorityUI();
    if (!PU) return 'baseline';
    var key = PU.normalizeFormulaKey(formulaKey);
    boardFormulaKey = key;
    await t.set('board', 'shared', FORMULA_SETTINGS_KEY, key);
    return key;
  }

  async function getBoardColorScheme(t) {
    var PU = priorityUI();
    if (!PU) return defaultColorSchemeKey();
    try {
      var stored = await t.get('board', 'shared', COLOR_SCHEME_SETTINGS_KEY);
      if (typeof stored === 'string') {
        boardColorSchemeKey = PU.normalizeColorSchemeKey(stored);
        PU.applyColorScheme(boardColorSchemeKey);
        return boardColorSchemeKey;
      }
    } catch (err) {
      console.error('Priority board color scheme load failed', err);
    }
    var fromLocal = PU.loadStoredColorSchemeKey();
    boardColorSchemeKey = fromLocal || PU.DEFAULT_COLOR_SCHEME_KEY || defaultColorSchemeKey();
    PU.applyColorScheme(boardColorSchemeKey);
    return boardColorSchemeKey;
  }

  async function saveBoardColorScheme(t, schemeKey) {
    var PU = priorityUI();
    if (!PU) return defaultColorSchemeKey();
    var key = PU.normalizeColorSchemeKey(schemeKey);
    boardColorSchemeKey = key;
    PU.applyColorScheme(key);
    PU.saveStoredColorSchemeKey(key);
    await t.set('board', 'shared', COLOR_SCHEME_SETTINGS_KEY, key);
    await t.set('board', 'shared', COLOR_SCHEME_REV_KEY, Date.now());
    return key;
  }

  async function preloadBoardPriorityContext(t) {
    return ensureBoardPriorityContext(t);
  }

  function getCachedBoardColorSchemeKey() {
    return boardColorSchemeKey || defaultColorSchemeKey();
  }

  async function ensureBoardPriorityContext(t) {
    var settings = await getMatrixSettings(t);
    var PU = priorityUI();
    if (PU && PU.setMatrixSettings) {
      PU.setMatrixSettings(settings);
    }
    await getBoardFormula(t);
    await getBoardColorScheme(t);
    return settings;
  }

  function computeDisplay(inputs, labelSettings, formulaKey) {
    try {
      var PU = priorityUI();
      if (!PU || !PU.calc) return null;
      var key = formulaKey || boardFormulaKey || 'baseline';
      var calcFn = PU.calc[key] || PU.calc.baseline;
      var result = calcFn(inputs);
      return PU.resolveDisplay(result, inputs, labelSettings);
    } catch (err) {
      console.error('PriorityTrello.computeDisplay failed', err);
      return null;
    }
  }

  async function getCardDisplay(t) {
    var inputs = await getCardInputs(t);
    if (!inputs) return null;
    var settings = await ensureBoardPriorityContext(t);
    return computeDisplay(inputs, settings);
  }

  // Tier-indexed badge dots delegate to PriorityUI tier metadata.
  function tierBadgeDot(display, completed) {
    var PU = priorityUI();
    if (PU && PU.tierBadgeDotChar) {
      return PU.tierBadgeDotChar(display, completed);
    }
    if (completed) return (PU && PU.BADGE_DOT_COMPLETE) || '\u2713';
    if (!display) return (PU && PU.BADGE_DOT_DEFAULT) || '\u25CF';
    if (display.blocked) return (PU && PU.BLOCKED_SYMBOL) || '\u2298';
    if (display.inutile) return (PU && PU.BADGE_DOT_INUTILE) || '\u00B7';
    return (PU && PU.BADGE_DOT_DEFAULT) || '\u25CF';
  }

  function incompleteBadgeLabel(display) {
    var PU = priorityUI();
    if (PU && PU.taskBadgeLabel) {
      return PU.taskBadgeLabel(display);
    }
    if (PU && PU.taskBadgeLabelForTierKey) {
      return PU.taskBadgeLabelForTierKey(String(display.tierLabel || display.label || ''));
    }
    var tierKey = String(display.tierLabel || display.label || '');
    return tierKey ? 'T\u00e2che ' + tierKey.charAt(0).toLowerCase() + tierKey.slice(1) : '';
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
    var PU = priorityUI();
    if (PU && PU.formatCompletedBadgeLabel) {
      return PU.formatCompletedBadgeLabel(taskLabel);
    }
    var prefix = (PU && PU.COMPLETED_BADGE_PREFIX) || 'Compl\u00e9t\u00e9';
    return prefix + ' (' + taskLabel + ')';
  }

  function formatBlockedBoardBadgeText(display) {
    var d = display || {};
    var PU = priorityUI();
    if (PU && PU.formatBlockedBadgeText) {
      var summary =
        PU.formatBlockedReasonsSummary
          ? PU.formatBlockedReasonsSummary(
              d.blockedReasons != null ? d.blockedReasons : d.blockedReason,
              { empty: '', links: d.blockedLinks || d.blockedLink }
            )
          : typeof d.blockedReason === 'string'
            ? d.blockedReason.trim()
            : '';
      return PU.formatBlockedBadgeText(d, summary || undefined);
    }
    var label = incompleteBadgeLabel(d) || 'T\u00e2che';
    var trimmed =
      PU && PU.formatBlockedReasonsSummary
        ? PU.formatBlockedReasonsSummary(
            d.blockedReasons != null ? d.blockedReasons : d.blockedReason,
            { empty: '', links: d.blockedLinks || d.blockedLink }
          )
        : typeof d.blockedReason === 'string'
          ? d.blockedReason.trim()
          : '';
    var suffix = trimmed || ((PU && PU.BLOCKED_LABEL) || 'Bloqu\u00e9');
    return label + ' (' + suffix + ')';
  }

  function formatBadgeText(display, completed) {
    if (!display) return '';
    if (completed) {
      return tierBadgeDot(display, true) + ' ' + formatCompletedBadgeLabel(incompleteBadgeLabel(display));
    }
    if (display.blocked) {
      return tierBadgeDot(display, false) + ' ' + formatBlockedBoardBadgeText(display);
    }
    var PU = priorityUI();
    if (display.priorityEnabled === false) {
      if (PU && display.dueCountdown) {
        return tierBadgeDot(display, false) + ' ' + display.dueCountdown;
      }
      return '';
    }
    if (PU && PU.formatDueBadgeText && display.dueCountdown) {
      return tierBadgeDot(display, false) + ' ' + PU.formatDueBadgeText(display);
    }
    return tierBadgeDot(display, false) + ' ' + incompleteBadgeLabel(display);
  }

  function tierDetailBadgeColor(display) {
    var PU = priorityUI();
    if (PU && PU.tierTrelloBadgeColor) {
      return PU.tierTrelloBadgeColor(display);
    }
    return trelloBadgeMuted();
  }

  function buildCardFaceBadge(display, completed) {
    if (!display) return null;
    return {
      text: formatBadgeText(display, completed),
      color: completed ? trelloBadgeComplete() : tierDetailBadgeColor(display),
    };
  }

  function definePriorityLabel() {
    var PU = priorityUI();
    return (PU && PU.DEFINE_PRIORITY_LABEL) || 'D\u00e9finir la priorit\u00e9';
  }

  function parseCardNameValue(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'string') {
      var trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'object' && !isPowerUpRequestChain(value)) {
      if (typeof value.name === 'string') {
        var fromName = value.name.trim();
        if (fromName) return fromName;
      }
    }
    return null;
  }

  function cardDataPromise(t) {
    var fields = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      t.card.apply(t, fields).then(resolve, reject);
    });
  }

  async function getCardName(t) {
    if (typeof t.arg === 'function') {
      var fromArg = parseCardNameValue(t.arg('cardName'));
      if (fromArg) return fromArg;
    }

    try {
      // Documented API: t.card('name').then(card => card.name) — not .get('name'),
      // which often returns the unresolved chain (has .get → isPowerUpRequestChain).
      var card = await cardDataPromise(t, 'name');
      var name = parseCardNameValue(card);
      if (name) return name;

      var scalar = await cardFieldPromise(t, 'name');
      if (!isPowerUpRequestChain(scalar)) {
        name = parseCardNameValue(scalar);
        if (name) return name;
      }
      return null;
    } catch (err) {
      console.error('Priority card name failed', err);
      return null;
    }
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

  function parseCardDueValue(value) {
    if (value == null || value === false) return null;
    if (typeof value === 'string') {
      var trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'object' && !isPowerUpRequestChain(value)) {
      if (typeof value.due === 'string' && value.due.trim()) return value.due.trim();
      if (value.badges && typeof value.badges === 'object' && !isPowerUpRequestChain(value.badges)) {
        if (typeof value.badges.due === 'string' && value.badges.due.trim()) {
          return value.badges.due.trim();
        }
      }
    }
    return null;
  }

  async function getCardDue(t) {
    try {
      var due = await cardFieldPromise(t, 'due');
      if (isPowerUpRequestChain(due)) due = null;
      var parsed = parseCardDueValue(due);
      if (parsed) return parsed;

      var badges = await cardFieldPromise(t, 'badges');
      if (isPowerUpRequestChain(badges)) return null;
      return parseCardDueValue(badges && { badges: badges });
    } catch (err) {
      console.error('Priority card due failed', err);
      return null;
    }
  }

  async function resolveCurrentCardId(t) {
    var ids = await readCardIdAndListId(t);
    var cardId = ids && ids.cardId;
    if (cardId) return cardId;
    try {
      var rawId = await cardFieldPromise(t, 'id');
      if (isPowerUpRequestChain(rawId)) rawId = null;
      if (typeof rawId === 'object' && rawId) rawId = rawId.id;
      if (rawId) return String(rawId);
    } catch (err) {
      /* ignore */
    }
    return null;
  }

  async function getCardDueSyncedIso(t) {
    try {
      var stored = await t.get('card', 'shared', CARD_DUE_SYNCED_KEY);
      if (stored == null) return '';
      if (stored === '') return '';
      if (typeof stored !== 'string') return '';
      var PU = priorityUI();
      if (PU && PU.canonicalizeTrelloDueIso) {
        return PU.canonicalizeTrelloDueIso(stored);
      }
      return stored;
    } catch (err) {
      return '';
    }
  }

  async function setCardDueSyncedIso(t, iso) {
    try {
      await t.set('card', 'shared', CARD_DUE_SYNCED_KEY, typeof iso === 'string' ? iso : '');
    } catch (err) {
      console.error('Priority due sync marker failed', err);
    }
  }

  function applyDuePartsToInputs(inputs, parts) {
    var next = inputs
      ? Object.assign({}, inputs)
      : Object.assign({}, DEFAULT_INPUTS, { priorityEnabled: false });
    delete next.dueDate;
    delete next.dueTime;
    delete next.dueEnabled;
    if (parts && parts.dueDate) {
      next.dueDate = parts.dueDate;
      if (parts.dueTime) next.dueTime = parts.dueTime;
    }
    return normalizeInputs(next);
  }

  function inputsToCanonicalDueIso(inputs) {
    var PU = priorityUI();
    if (PU && PU.inputsToTrelloDueIso) return PU.inputsToTrelloDueIso(inputs) || '';
    return '';
  }

  function canonicalizeDueIso(value) {
    var PU = priorityUI();
    if (!value) return '';
    if (PU && PU.canonicalizeTrelloDueIso) return PU.canonicalizeTrelloDueIso(value) || '';
    return String(value);
  }

  /**
   * Set or clear the card's Trello Dates due via REST PUT.
   * Requires OAuth (same path as auto-sort / dueComplete).
   */
  async function setCardDue(t, dueIso) {
    var want = dueIso ? canonicalizeDueIso(dueIso) : '';
    if (dueIso && !want) return { ok: false, reason: 'invalid-due', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var currentRaw = await getCardDue(t);
    var currentCanon = canonicalizeDueIso(currentRaw);
    if (currentCanon === want) {
      return { ok: true, changed: false, due: want || null };
    }

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var put = await restPutCard(t, cardId, { due: want || null });
    if (!put.ok) return Object.assign({ changed: false }, put);
    return { ok: true, changed: true, due: want || null };
  }

  /**
   * Two-way sync: Échéance (cardPriority dueDate/dueTime) ↔ Trello Dates `due`.
   * Uses CARD_DUE_SYNCED_KEY to detect which side changed since last agreement.
   * options.prefer: 'trello' (default, pull on conflict) | 'powerup' (push on conflict)
   */
  async function syncCardDueWithTrello(t, options) {
    options = options || {};
    var prefer = options.prefer === 'powerup' ? 'powerup' : 'trello';
    var inputs = options.inputs !== undefined ? options.inputs : await getCardInputs(t);
    if (inputs) inputs = normalizeInputs(inputs) || inputs;

    var PU = priorityUI();
    var trelloRaw = await getCardDue(t);
    var actualCanon = canonicalizeDueIso(trelloRaw);
    var expectedCanon = inputsToCanonicalDueIso(inputs);
    var lastSynced = await getCardDueSyncedIso(t);

    if (actualCanon === expectedCanon) {
      if (lastSynced !== actualCanon) await setCardDueSyncedIso(t, actualCanon);
      return {
        ok: true,
        changed: false,
        inputs: inputs,
        due: actualCanon || null,
      };
    }

    var trelloChanged = actualCanon !== lastSynced;
    var powerUpChanged = expectedCanon !== lastSynced;
    var action = 'pull';
    if (powerUpChanged && !trelloChanged) action = 'push';
    else if (trelloChanged && !powerUpChanged) action = 'pull';
    else if (powerUpChanged && trelloChanged) {
      action = prefer === 'powerup' ? 'push' : 'pull';
    } else {
      action = prefer === 'powerup' ? 'push' : 'pull';
    }

    if (action === 'pull') {
      if (!actualCanon) {
        if (!inputs || !inputs.dueDate) {
          if (lastSynced !== '') await setCardDueSyncedIso(t, '');
          return { ok: true, changed: false, inputs: inputs, due: null, direction: 'pull' };
        }
        var cleared = applyDuePartsToInputs(inputs, null);
        await t.set('card', 'shared', CARD_PRIORITY_KEY, cleared);
        await setCardDueSyncedIso(t, '');
        return {
          ok: true,
          changed: true,
          direction: 'pull',
          inputs: cleared,
          due: null,
        };
      }
      var parts =
        PU && PU.parseTrelloDueToParts
          ? PU.parseTrelloDueToParts(actualCanon)
          : null;
      if (!parts && trelloRaw && PU && PU.parseTrelloDueToParts) {
        parts = PU.parseTrelloDueToParts(trelloRaw);
      }
      if (!parts) {
        return {
          ok: false,
          reason: 'invalid-trello-due',
          changed: false,
          inputs: inputs,
          due: trelloRaw,
        };
      }
      var nextInputs = applyDuePartsToInputs(inputs, parts);
      var nextCanon = inputsToCanonicalDueIso(nextInputs);
      var inputsChanged =
        !inputs ||
        inputs.dueDate !== nextInputs.dueDate ||
        (inputs.dueTime || '') !== (nextInputs.dueTime || '') ||
        (inputs.dueEnabled === false) !== (nextInputs.dueEnabled === false);
      if (inputsChanged) {
        await t.set('card', 'shared', CARD_PRIORITY_KEY, nextInputs);
      }
      await setCardDueSyncedIso(t, nextCanon);
      return {
        ok: true,
        changed: inputsChanged,
        direction: 'pull',
        inputs: nextInputs,
        due: nextCanon || null,
      };
    }

    var put = await setCardDue(t, expectedCanon || null);
    if (!put.ok) {
      return {
        ok: false,
        reason: put.reason || 'push-failed',
        changed: false,
        direction: 'push',
        inputs: inputs,
        due: actualCanon || null,
      };
    }
    await setCardDueSyncedIso(t, expectedCanon);
    return {
      ok: true,
      changed: !!put.changed,
      direction: 'push',
      inputs: inputs,
      due: expectedCanon || null,
    };
  }

  async function getBadgeData(t) {
    try {
      await syncCardDueWithTrello(t, { prefer: 'trello' });
    } catch (syncErr) {
      console.error('Priority due sync (badge) failed', syncErr);
    }
    var results = await Promise.all([
      getCardInputs(t),
      getCardDueComplete(t),
      t.get('board', 'shared', COLOR_SCHEME_REV_KEY).catch(function () { return null; }),
    ]);
    var completed = results[1] === true;
    var inputs = await clearBlockedIfComplete(t, results[0], completed);
    var display = null;
    if (inputs) {
      var settings = await ensureBoardPriorityContext(t);
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
          var badge = buildCardFaceBadge(data.display, data.completed);
          if (!badge || !badge.text) return { refresh: BADGE_REFRESH_SEC };
          return withBadgeRefresh(badge);
        });
      },
    };
  }

  function cardFaceBadges(t) {
    return getCardDisplay(t)
      .then(function (display) {
        if (!display) return [];
        if (
          display.priorityEnabled === false &&
          !display.blocked &&
          !display.dueCountdown
        ) {
          return [];
        }
        if (display.priorityEnabled === false && !display.blocked && !formatBadgeText(display, false)) {
          return [];
        }
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
            if (
              !data.display ||
              (
                data.display.priorityEnabled === false &&
                !data.display.blocked &&
                !data.display.dueCountdown
              )
            ) {
              return withBadgeRefresh({
                title: CARD_DETAIL_BADGE_TITLE,
                text: definePriorityLabel(),
                color: trelloBadgeComplete(),
                callback: openCallback,
              });
            }
            var badge = buildCardFaceBadge(data.display, data.completed);
            if (!badge || !badge.text) {
              return withBadgeRefresh({
                title: CARD_DETAIL_BADGE_TITLE,
                text: definePriorityLabel(),
                color: trelloBadgeComplete(),
                callback: openCallback,
              });
            }
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
              text: definePriorityLabel(),
              color: trelloBadgeComplete(),
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

  function restClientOptions() {
    var cfg = global.PriorityRestConfig;
    if (!cfg || !cfg.appKey) return null;
    var opts = {
      appKey: cfg.appKey,
      appName: cfg.appName || 'Priorité',
    };
    if (cfg.appAuthor) opts.appAuthor = cfg.appAuthor;
    return opts;
  }

  function createIframeClient() {
    if (typeof global.TrelloPowerUp === 'undefined') {
      throw new Error('TrelloPowerUp is not loaded');
    }
    var restOpts = restClientOptions();
    if (restOpts) return global.TrelloPowerUp.iframe(restOpts);
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

  // Shared iframe bootstrap: DOM-ready client + post-handshake callback.
  function initIframePage(onReady) {
    return createIframeClientDeferred().then(function (t) {
      return runWhenIframeReady(t, function () {
        return onReady(t);
      });
    });
  }

  async function saveCardInputs(t, inputs, options) {
    options = options || {};
    var previous = null;
    try {
      previous = await getCardInputs(t);
    } catch (readErr) {
      previous = null;
    }
    var wasBlocked = !!(previous && previous.enAttente);
    var normalized = normalizeInputs(inputs);
    if (!normalized) return;
    await t.set('card', 'shared', CARD_PRIORITY_KEY, normalized);
    if (options.syncDue !== false) {
      try {
        await syncCardDueWithTrello(t, { inputs: normalized, prefer: 'powerup' });
      } catch (syncErr) {
        console.error('Priority due sync (save) failed', syncErr);
      }
    }
    if (options.autoSort !== false) {
      scheduleAutoSortCard(t);
    }
    // Newly blocked → move to the board's Bloqué list when configured.
    if (
      options.skipStatutAutoMove !== true &&
      normalized.enAttente &&
      !wasBlocked &&
      global.StatutTrello &&
      typeof global.StatutTrello.maybeAutoMoveForBlocked === 'function'
    ) {
      try {
        await global.StatutTrello.maybeAutoMoveForBlocked(t);
      } catch (moveErr) {
        console.error('Statut auto-move (blocked) failed', moveErr);
      }
    }
  }

  async function getCardInputsById(t, cardId) {
    return readStoredCardInputs(t, cardId);
  }

  /**
   * Compact board digest for AI memory / suggestions.
   * Caps cards and truncates descriptions to stay prompt-friendly.
   * @returns {Promise<{ digest: string, cards: Array, lists: Array }>}
   */
  async function scanBoardCards(t, options) {
    options = options || {};
    var maxCards = typeof options.maxCards === 'number' ? options.maxCards : 40;
    var descMax = typeof options.descMax === 'number' ? options.descMax : 200;
    var includePriority = options.includePriority !== false;

    var lists = [];
    var cards = [];
    try {
      lists = (await t.lists('id', 'name')) || [];
    } catch (err) {
      console.error('PriorityTrello.scanBoardCards lists failed', err);
      lists = [];
    }
    try {
      cards = (await t.cards('id', 'name', 'desc', 'idList', 'due')) || [];
    } catch (err) {
      console.error('PriorityTrello.scanBoardCards cards failed', err);
      cards = [];
    }

    var listNameById = {};
    for (var li = 0; li < lists.length; li++) {
      if (lists[li] && lists[li].id) {
        listNameById[lists[li].id] = lists[li].name || '';
      }
    }

    var slice = cards.slice(0, maxCards);
    var settings = null;
    if (includePriority) {
      try {
        settings = await ensureBoardPriorityContext(t);
      } catch (e) {
        settings = null;
      }
    }

    var lines = [];
    lines.push('Listes (' + lists.length + ')\u00a0:');
    for (var lj = 0; lj < lists.length; lj++) {
      lines.push('- ' + (lists[lj].name || lists[lj].id));
    }
    lines.push('Cartes ouvertes (' + Math.min(cards.length, maxCards) + '/' + cards.length + ')\u00a0:');

    var enriched = [];
    for (var ci = 0; ci < slice.length; ci++) {
      var card = slice[ci];
      var name = (card && card.name) || '';
      var desc = typeof card.desc === 'string' ? card.desc.trim() : '';
      if (desc.length > descMax) desc = desc.slice(0, descMax - 1) + '\u2026';
      var listLabel = listNameById[card.idList] || card.idList || '?';
      var priorityLabel = '';
      if (includePriority && settings && card.id) {
        try {
          var inputs = await getCardInputsById(t, card.id);
          var display = inputs ? computeDisplay(inputs, settings) : null;
          if (display && display.priorityEnabled !== false) {
            priorityLabel = formatBadgeText(display, false) || display.label || '';
          }
        } catch (e) {
          /* ignore per-card */
        }
      }
      enriched.push({
        id: card.id,
        name: name,
        desc: desc,
        list: listLabel,
        due: card.due || null,
        priority: priorityLabel || null
      });
      var bit = '- [' + listLabel + '] ' + name;
      if (priorityLabel) bit += ' (' + priorityLabel + ')';
      if (card.due) bit += ' due:' + String(card.due).slice(0, 10);
      if (desc) bit += ' \u2014 ' + desc.replace(/\s+/g, ' ');
      lines.push(bit);
    }

    return {
      digest: lines.join('\n'),
      cards: enriched,
      lists: lists.map(function (l) {
        return { id: l.id, name: l.name };
      })
    };
  }

  // ── List-sorters (native Trello sortedIds) ──────────────────────────────

  function prioritySortRank(display) {
    if (!display) return { tier: SORT_TIER_NONE, score: -1 };
    if (display.priorityEnabled === false && !display.blocked) {
      return { tier: SORT_TIER_NONE, score: -1 };
    }
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

    var settings = await ensureBoardPriorityContext(t);
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

  // ── Auto-sort (REST PUT /cards/{id} pos) ─────────────────────────────────

  var autoSortDebounceByClient = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var autoSortDebounceFallback = null;

  function autoSortDebounceMs() {
    var cfg = global.PriorityRestConfig;
    var ms = cfg && cfg.autoSortDebounceMs;
    return typeof ms === 'number' && ms >= 0 ? ms : 400;
  }

  function getAutoSortDebounceState(t) {
    if (autoSortDebounceByClient) {
      var state = autoSortDebounceByClient.get(t);
      if (!state) {
        state = { timer: null, chain: Promise.resolve() };
        autoSortDebounceByClient.set(t, state);
      }
      return state;
    }
    if (!autoSortDebounceFallback) {
      autoSortDebounceFallback = { timer: null, chain: Promise.resolve() };
    }
    return autoSortDebounceFallback;
  }

  function comparePriorityEntries(entryA, entryB) {
    var cmp = comparePriorityDisplays(entryA.display, entryB.display);
    if (cmp !== 0) return cmp;
    return (entryA.pos || 0) - (entryB.pos || 0);
  }

  function sortEntriesByPriority(entries) {
    return entries.slice().sort(comparePriorityEntries);
  }

  function indexByPos(entries) {
    var byPos = entries.slice().sort(function (a, b) {
      return (a.pos || 0) - (b.pos || 0);
    });
    var indexById = {};
    for (var i = 0; i < byPos.length; i++) {
      indexById[byPos[i].id] = i;
    }
    return indexById;
  }

  // Returns null when the card is already at the correct rank; otherwise { pos }.
  function computeCardMovePosition(entries, cardId) {
    if (!entries || entries.length < 2 || !cardId) return null;

    var byPriority = sortEntriesByPriority(entries);
    var targetIdx = -1;
    for (var i = 0; i < byPriority.length; i++) {
      if (byPriority[i].id === cardId) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx < 0) return null;

    var posIndex = indexByPos(entries);
    if (posIndex[cardId] === targetIdx) return null;

    var above = targetIdx > 0 ? byPriority[targetIdx - 1] : null;
    var below = targetIdx < byPriority.length - 1 ? byPriority[targetIdx + 1] : null;

    if (!above) return { pos: 'top' };
    if (!below) return { pos: 'bottom' };

    var posAbove = above.pos;
    var posBelow = below.pos;
    if (typeof posAbove !== 'number' || typeof posBelow !== 'number' || posAbove >= posBelow) {
      return { pos: 'bottom' };
    }
    return { pos: (posAbove + posBelow) / 2 };
  }

  async function readCardIdAndListId(t) {
    var results = await Promise.all([
      cardFieldPromise(t, 'id'),
      cardFieldPromise(t, 'idList'),
    ]);
    var cardId = results[0];
    var listId = results[1];
    if (isPowerUpRequestChain(cardId) || isPowerUpRequestChain(listId)) return null;
    if (typeof cardId === 'object' && cardId) cardId = cardId.id;
    if (typeof listId === 'object' && listId) listId = listId.idList || listId.id;
    if (!cardId || !listId) return null;
    return { cardId: String(cardId), listId: String(listId) };
  }

  async function buildListPriorityEntries(t, listId, settings) {
    var cards = await t.cards('id', 'idList', 'pos');
    if (!Array.isArray(cards)) return [];

    var inList = cards.filter(function (card) {
      return card && String(card.idList) === String(listId);
    });
    if (!inList.length) return [];

    return Promise.all(
      inList.map(async function (card) {
        var inputs = await getCardInputsById(t, card.id);
        var display = inputs ? computeDisplay(inputs, settings) : null;
        return {
          id: String(card.id),
          pos: typeof card.pos === 'number' ? card.pos : Number(card.pos) || 0,
          display: display,
        };
      })
    );
  }

  async function restPutCard(t, cardId, body) {
    var cfg = restClientOptions();
    if (!cfg) return { ok: false, reason: 'no-app-key' };

    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized' };

    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token' };

    var url =
      'https://api.trello.com/1/cards/' + encodeURIComponent(cardId) +
      '?key=' + encodeURIComponent(cfg.appKey) +
      '&token=' + encodeURIComponent(token);

    var response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error('Trello REST PUT /cards/' + cardId + ' failed: ' + response.status + (detail ? ' ' + detail : ''));
    }
    return { ok: true };
  }

  /**
   * Mark (or unmark) the card as Done via REST PUT dueComplete.
   * Requires OAuth (same path as auto-sort). No-ops when already at target.
   */
  async function setCardDueComplete(t, dueComplete, options) {
    options = options || {};
    var want = !!dueComplete;
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var current = await getCardDueComplete(t);
    if (current === want) {
      return { ok: true, changed: false, alreadyComplete: want };
    }

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var put = await restPutCard(t, cardId, { dueComplete: want });
    if (!put.ok) return Object.assign({ changed: false }, put);

    // Newly completed → move to the board's Terminé list when configured.
    if (
      want &&
      options.skipStatutAutoMove !== true &&
      global.StatutTrello &&
      typeof global.StatutTrello.maybeAutoMoveForCompleted === 'function'
    ) {
      try {
        await global.StatutTrello.maybeAutoMoveForCompleted(t);
      } catch (moveErr) {
        console.error('Statut auto-move (completed) failed', moveErr);
      }
    }

    return { ok: true, changed: true, dueComplete: want };
  }

  async function autoSortCardInList(t) {
    if (!restClientOptions()) return { moved: false, reason: 'no-app-key' };

    var ids = await readCardIdAndListId(t);
    if (!ids) return { moved: false, reason: 'no-card-context' };

    var settings = await ensureBoardPriorityContext(t);
    var entries = await buildListPriorityEntries(t, ids.listId, settings);
    if (entries.length < 2) return { moved: false, reason: 'single-card-list' };

    var move = computeCardMovePosition(entries, ids.cardId);
    if (!move) return { moved: false, reason: 'already-sorted' };

    await restPutCard(t, ids.cardId, { pos: move.pos });
    return { moved: true, pos: move.pos };
  }

  function scheduleAutoSortCard(t) {
    if (!restClientOptions()) return Promise.resolve({ moved: false, reason: 'no-app-key' });

    var state = getAutoSortDebounceState(t);
    if (state.timer) clearTimeout(state.timer);

    state.chain = state.chain
      .catch(function () { /* keep chain alive after a failed sort */ })
      .then(function () {
        return new Promise(function (resolve) {
          state.timer = setTimeout(resolve, autoSortDebounceMs());
        });
      })
      .then(function () {
        state.timer = null;
        return autoSortCardInList(t);
      })
      .catch(function (err) {
        console.error('Priority auto-sort failed', err);
        return { moved: false, reason: 'error' };
      });

    return state.chain;
  }

  async function isRestAuthorized(t) {
    if (!restClientOptions()) return false;
    try {
      var api = await t.getRestApi();
      return api.isAuthorized();
    } catch (err) {
      console.error('Priority REST auth check failed', err);
      return false;
    }
  }

  async function authorizeRestForAutoSort(t) {
    if (!restClientOptions()) {
      throw new Error('REST appKey is not configured');
    }
    var api = await t.getRestApi();
    return api.authorize({ scope: 'read,write', expiration: 'never' });
  }

  function getCachedBoardFormulaKey() {
    return boardFormulaKey || 'baseline';
  }

  global.PriorityTrello = {
    CARD_PRIORITY_KEY: CARD_PRIORITY_KEY,
    MATRIX_SETTINGS_KEY: MATRIX_SETTINGS_KEY,
    FORMULA_SETTINGS_KEY: FORMULA_SETTINGS_KEY,
    COLOR_SCHEME_SETTINGS_KEY: COLOR_SCHEME_SETTINGS_KEY,
    COLOR_SCHEME_REV_KEY: COLOR_SCHEME_REV_KEY,
    IMPORTANT_INPUTS: IMPORTANT_INPUTS,
    DEFAULT_INPUTS: DEFAULT_INPUTS,
    PRIORITY_DIMENSIONS: PRIORITY_DIMENSIONS,
    normalizeInputs: normalizeInputs,
    clearBlockedFromInputs: clearBlockedFromInputs,
    clearBlockedIfComplete: clearBlockedIfComplete,
    getCardInputs: getCardInputs,
    getMatrixSettings: getMatrixSettings,
    getBoardFormula: getBoardFormula,
    getCachedBoardFormulaKey: getCachedBoardFormulaKey,
    saveBoardFormula: saveBoardFormula,
    getBoardColorScheme: getBoardColorScheme,
    getCachedBoardColorSchemeKey: getCachedBoardColorSchemeKey,
    saveBoardColorScheme: saveBoardColorScheme,
    preloadBoardPriorityContext: preloadBoardPriorityContext,
    ensureBoardPriorityContext: ensureBoardPriorityContext,
    computeDisplay: computeDisplay,
    getCardDisplay: getCardDisplay,
    getCardName: getCardName,
    getCardDueComplete: getCardDueComplete,
    setCardDueComplete: setCardDueComplete,
    getCardDue: getCardDue,
    setCardDue: setCardDue,
    syncCardDueWithTrello: syncCardDueWithTrello,
    CARD_DUE_SYNCED_KEY: CARD_DUE_SYNCED_KEY,
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
    scanBoardCards: scanBoardCards,
    prioritySortRank: prioritySortRank,
    comparePriorityDisplays: comparePriorityDisplays,
    sortListCardsByPriority: sortListCardsByPriority,
    listPrioritySorters: listPrioritySorters,
    comparePriorityEntries: comparePriorityEntries,
    computeCardMovePosition: computeCardMovePosition,
    autoSortCardInList: autoSortCardInList,
    scheduleAutoSortCard: scheduleAutoSortCard,
    isRestAuthorized: isRestAuthorized,
    authorizeRestForAutoSort: authorizeRestForAutoSort,
    restClientOptions: restClientOptions,
    restPutCard: restPutCard,
    readCardIdAndListId: readCardIdAndListId,
    resolveCurrentCardId: resolveCurrentCardId,
    pageUrl: pageUrl,
    createIframeClient: createIframeClient,
    createIframeClientDeferred: createIframeClientDeferred,
    initIframePage: initIframePage,
    runWhenIframeReady: runWhenIframeReady,
    BADGE_REFRESH_SEC: BADGE_REFRESH_SEC,
  };
})(typeof window !== 'undefined' ? window : this);
