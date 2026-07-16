/* Trello Power-Up bridge — card priority storage and badges. */
(function (global) {
  'use strict';

  var CARD_PRIORITY_KEY = 'cardPriority';
  var LEGACY_PRIORITY_KEY = 'priority';
  var MATRIX_SETTINGS_KEY = 'matrixLabelSettings';
  var FORMULA_SETTINGS_KEY = 'priorityFormula';
  var COLOR_SCHEME_SETTINGS_KEY = 'priorityColorScheme';
  var COLOR_SCHEME_REV_KEY = 'priorityColorSchemeRev';
  var CUSTOM_TASK_TYPES_KEY = 'customTaskTypes';
  // Last agreed Trello `due` ISO ('' = no due). Used for Échéance ↔ Dates conflict detection.
  var CARD_DUE_SYNCED_KEY = 'cardDueSyncedIso';
  // Last agreed Trello `start` ISO ('' = no start).
  var CARD_START_SYNCED_KEY = 'cardStartSyncedIso';
  var boardFormulaKey = 'baseline';
  var boardColorSchemeKey = null;
  var boardCustomTaskTypes = null;
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

  function dbg() {
    return global.TpDebug || null;
  }

  function dbgLog(event, meta) {
    var d = dbg();
    if (d && typeof d.log === 'function') d.log('priorityTrello', event, meta);
  }

  function dbgError(event, err, meta) {
    var d = dbg();
    if (d && typeof d.error === 'function') d.error('priorityTrello', event, err, meta);
    else if (err) console.error('PriorityTrello.' + event, err);
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
    // Sidecar: estimated work duration in minutes (Facilité UI); does not alter ease score.
    var durationMin = asNumber(raw.estimatedDurationMinutes);
    if (isFinite(durationMin) && durationMin > 0) {
      normalized.estimatedDurationMinutes = Math.max(
        1,
        Math.min(2 * 365.25 * 24 * 60, Math.round(durationMin))
      );
    }
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

    var startDate = '';
    if (typeof raw.startDate === 'string') {
      var PUStart = priorityUI();
      startDate = PUStart && PUStart.normalizeDueDate
        ? PUStart.normalizeDueDate(raw.startDate)
        : raw.startDate.trim();
      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) startDate = '';
    }
    if (startDate) normalized.startDate = startDate;

    var PURec = priorityUI();
    var recurrence =
      PURec && typeof PURec.normalizeRecurrence === 'function'
        ? PURec.normalizeRecurrence(raw.recurrence)
        : null;
    if (recurrence) normalized.recurrence = recurrence;

    // Multi-label task taxonomy (Information + AI); sidecar, not an axis.
    var PUTypes = priorityUI();
    var taskTypes =
      PUTypes && typeof PUTypes.normalizeTaskTypes === 'function'
        ? PUTypes.normalizeTaskTypes(raw.taskTypes)
        : (function () {
            if (!Array.isArray(raw.taskTypes)) return [];
            return raw.taskTypes
              .map(function (id) {
                return typeof id === 'string' ? id.trim() : '';
              })
              .filter(Boolean);
          })();
    if (taskTypes.length) normalized.taskTypes = taskTypes;
    if (raw.taskTypesLocked === true) normalized.taskTypesLocked = true;

    var dismissedTaskTypeSuggestions =
      PUTypes && typeof PUTypes.normalizeTaskTypes === 'function'
        ? PUTypes.normalizeTaskTypes(raw.dismissedTaskTypeSuggestions)
        : (function () {
            if (!Array.isArray(raw.dismissedTaskTypeSuggestions)) return [];
            return raw.dismissedTaskTypeSuggestions
              .map(function (id) {
                return typeof id === 'string' ? id.trim() : '';
              })
              .filter(Boolean);
          })();
    if (dismissedTaskTypeSuggestions.length) {
      normalized.dismissedTaskTypeSuggestions = dismissedTaskTypeSuggestions;
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
    if (typeof inputs.startDate === 'string' && inputs.startDate) {
      cleared.startDate = inputs.startDate;
    }
    if (inputs.recurrence && typeof inputs.recurrence === 'object') {
      cleared.recurrence = inputs.recurrence;
    }
    if (Array.isArray(inputs.taskTypes) && inputs.taskTypes.length) {
      cleared.taskTypes = inputs.taskTypes.slice();
    }
    if (inputs.taskTypesLocked === true) cleared.taskTypesLocked = true;
    if (
      Array.isArray(inputs.dismissedTaskTypeSuggestions) &&
      inputs.dismissedTaskTypeSuggestions.length
    ) {
      cleared.dismissedTaskTypeSuggestions =
        inputs.dismissedTaskTypeSuggestions.slice();
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

  async function getCustomTaskTypes(t) {
    var PU = priorityUI();
    try {
      var stored = await t.get('board', 'shared', CUSTOM_TASK_TYPES_KEY);
      var list =
        PU && typeof PU.normalizeCustomTaskTypes === 'function'
          ? PU.normalizeCustomTaskTypes(stored)
          : Array.isArray(stored)
            ? stored
            : [];
      boardCustomTaskTypes = list;
      if (PU && typeof PU.setCustomTaskTypes === 'function') {
        PU.setCustomTaskTypes(list);
      }
      return list.slice();
    } catch (err) {
      console.error('Priority custom task types load failed', err);
      boardCustomTaskTypes = boardCustomTaskTypes || [];
      return boardCustomTaskTypes.slice();
    }
  }

  async function saveCustomTaskTypes(t, raw) {
    var PU = priorityUI();
    var list =
      PU && typeof PU.normalizeCustomTaskTypes === 'function'
        ? PU.normalizeCustomTaskTypes(raw)
        : Array.isArray(raw)
          ? raw
          : [];
    boardCustomTaskTypes = list;
    if (PU && typeof PU.setCustomTaskTypes === 'function') {
      PU.setCustomTaskTypes(list);
    }
    await t.set('board', 'shared', CUSTOM_TASK_TYPES_KEY, list);
    return list.slice();
  }

  function getCachedCustomTaskTypes() {
    return Array.isArray(boardCustomTaskTypes)
      ? boardCustomTaskTypes.slice()
      : [];
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
    await getCustomTaskTypes(t);
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
      dbgError('computeDisplay', err);
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

  function brandAppName() {
    var brand = global.PriorityBrand;
    if (brand && typeof brand.getAppName === 'function') return brand.getAppName();
    if (brand && typeof brand.appName === 'string' && brand.appName.trim()) {
      return brand.appName.trim();
    }
    var cfg = global.PriorityRestConfig;
    if (cfg && typeof cfg.appName === 'string' && cfg.appName.trim()) {
      return cfg.appName.trim();
    }
    var PU = priorityUI();
    return (PU && PU.DEFINE_PRIORITY_LABEL) || 'Cerveau';
  }

  function definePriorityLabel() {
    return brandAppName();
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

  async function getCardDesc(t) {
    try {
      var card = await cardDataPromise(t, 'desc');
      if (card && typeof card.desc === 'string') return card.desc;
      var scalar = await cardFieldPromise(t, 'desc');
      if (typeof scalar === 'string') return scalar;
      if (scalar && typeof scalar === 'object' && typeof scalar.desc === 'string') {
        return scalar.desc;
      }
      return '';
    } catch (err) {
      console.error('Priority card desc failed', err);
      return '';
    }
  }

  function normalizeMemberList(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (member) {
      return (
        member &&
        typeof member === 'object' &&
        !isPowerUpRequestChain(member) &&
        member.id
      );
    });
  }

  /**
   * Members assigned to the current card (`t.card('members')`).
   * Each entry typically has id, fullName, username, initials,
   * and avatar (ready URL) and/or avatarHash/avatarUrl.
   */
  async function getCardMembers(t) {
    try {
      var card = await cardDataPromise(t, 'members');
      var list = null;
      if (card && Array.isArray(card.members)) list = card.members;
      else if (Array.isArray(card)) list = card;
      else {
        var scalar = await cardFieldPromise(t, 'members');
        if (Array.isArray(scalar)) list = scalar;
        else if (scalar && Array.isArray(scalar.members)) list = scalar.members;
      }
      return normalizeMemberList(list);
    } catch (err) {
      console.error('Priority card members failed', err);
      return [];
    }
  }

  /**
   * The member viewing the Power-Up (`t.member(...)`).
   * Used to distinguish "me" vs other assignees on a card.
   */
  async function getCurrentMember(t) {
    try {
      if (!t || typeof t.member !== 'function') return null;
      var member = await new Promise(function (resolve, reject) {
        t.member('id', 'fullName', 'username', 'initials').then(resolve, reject);
      });
      if (!member || typeof member !== 'object' || isPowerUpRequestChain(member)) {
        return null;
      }
      if (!member.id) return null;
      return member;
    } catch (err) {
      console.error('Priority current member failed', err);
      return null;
    }
  }

  /**
   * Board members available to assign (`t.board('members')`).
   */
  async function getBoardMembers(t) {
    try {
      if (!t || typeof t.board !== 'function') return [];
      var board = await new Promise(function (resolve, reject) {
        t.board('members').then(resolve, reject);
      });
      var list = null;
      if (board && Array.isArray(board.members)) list = board.members;
      else if (Array.isArray(board)) list = board;
      if (isPowerUpRequestChain(list)) return [];
      return normalizeMemberList(list);
    } catch (err) {
      console.error('Priority board members failed', err);
      return [];
    }
  }

  function parseIdMemberCreator(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'string') {
      var trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'object' && !isPowerUpRequestChain(value)) {
      if (value.idMemberCreator != null && value.idMemberCreator !== '') {
        return String(value.idMemberCreator);
      }
      if (value.id != null && value.id !== '' && typeof value.fullName === 'string') {
        // Already a member-shaped object from some clients.
        return String(value.id);
      }
    }
    return null;
  }

  async function fetchMemberByIdRest(t, memberId) {
    var id = memberId != null ? String(memberId).trim() : '';
    if (!id) return null;
    if (!restClientOptions()) return null;
    try {
      var api = await t.getRestApi();
      var authorized = await api.isAuthorized();
      if (!authorized) return null;
      var token = await api.getToken();
      if (!token) return null;
      var cfg = restClientOptions();
      var url =
        'https://api.trello.com/1/members/' +
        encodeURIComponent(id) +
        '?fields=fullName,username,initials,avatarUrl,avatarHash' +
        '&key=' +
        encodeURIComponent(cfg.appKey) +
        '&token=' +
        encodeURIComponent(token);
      var response = await fetch(url, { method: 'GET' });
      if (!response.ok) return null;
      var member = await response.json();
      if (!member || !member.id) return null;
      return member;
    } catch (err) {
      console.error('Priority member fetch failed', err);
      return null;
    }
  }

  /**
   * idMemberCreator is not an allowed t.card() field — load it via REST.
   */
  async function fetchCardIdMemberCreatorRest(t) {
    if (!restClientOptions()) return null;
    try {
      var cardId = await resolveCurrentCardId(t);
      if (!cardId) return null;
      var api = await t.getRestApi();
      var authorized = await api.isAuthorized();
      if (!authorized) return null;
      var token = await api.getToken();
      if (!token) return null;
      var cfg = restClientOptions();
      var url =
        'https://api.trello.com/1/cards/' +
        encodeURIComponent(cardId) +
        '?fields=idMemberCreator' +
        '&key=' +
        encodeURIComponent(cfg.appKey) +
        '&token=' +
        encodeURIComponent(token);
      var response = await fetch(url, { method: 'GET' });
      if (!response.ok) return null;
      var card = await response.json();
      return parseIdMemberCreator(card);
    } catch (err) {
      console.error('Priority card idMemberCreator REST failed', err);
      return null;
    }
  }

  /**
   * Member who created the card, resolved via REST (idMemberCreator) then
   * board members / member REST lookup.
   * @param {object} t Power-Up client
   * @param {Array} [knownBoardMembers] Optional board members (avoids a second fetch)
   */
  async function getCardCreator(t, knownBoardMembers) {
    try {
      // t.card() does not expose idMemberCreator — REST only.
      var creatorId = await fetchCardIdMemberCreatorRest(t);
      if (!creatorId) return null;

      var boardMembers = Array.isArray(knownBoardMembers)
        ? normalizeMemberList(knownBoardMembers)
        : await getBoardMembers(t);
      for (var i = 0; i < boardMembers.length; i++) {
        var boardMember = boardMembers[i];
        if (boardMember && String(boardMember.id) === creatorId) {
          return boardMember;
        }
      }

      var fromRest = await fetchMemberByIdRest(t, creatorId);
      if (fromRest) return fromRest;

      return { id: creatorId };
    } catch (err) {
      console.error('Priority card creator failed', err);
      return null;
    }
  }

  /**
   * If the card has no assignees, assign the card creator.
   * No-op when already assigned, creator unknown, or REST unavailable.
   *
   * @param {object} t Power-Up client
   * @param {{ members?: Array, boardMembers?: Array, creator?: object|null }} [options]
   * @returns {Promise<{ ok: boolean, changed: boolean, reason?: string, members?: Array, creator?: object|null, memberId?: string }>}
   */
  async function ensureCreatorAssigned(t, options) {
    options = options || {};
    try {
      var members = Array.isArray(options.members)
        ? normalizeMemberList(options.members)
        : await getCardMembers(t);
      if (members.length) {
        return {
          ok: true,
          changed: false,
          reason: 'already-assigned',
          members: members,
          creator: options.creator || null
        };
      }

      var creator =
        options.creator && options.creator.id
          ? options.creator
          : await getCardCreator(t, options.boardMembers);
      if (!creator || !creator.id) {
        return { ok: false, changed: false, reason: 'no-creator', members: members };
      }

      var addResult = await addCardMember(t, creator.id);
      if (!addResult || addResult.ok === false) {
        return {
          ok: false,
          changed: false,
          reason: (addResult && addResult.reason) || 'add-failed',
          members: members,
          creator: creator
        };
      }

      var nextMembers = await getCardMembers(t);
      if (!nextMembers.length) nextMembers = [creator];
      return {
        ok: true,
        changed: true,
        members: nextMembers,
        creator: creator,
        memberId: String(creator.id)
      };
    } catch (err) {
      console.error('Priority ensureCreatorAssigned failed', err);
      return {
        ok: false,
        changed: false,
        reason: 'error',
        error: (err && err.message) || String(err || 'Erreur')
      };
    }
  }

  function normalizeLabelList(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (label) {
      return (
        label &&
        typeof label === 'object' &&
        !isPowerUpRequestChain(label) &&
        label.id
      );
    });
  }

  /**
   * Labels on the current card (`t.card('labels')`).
   * Each entry typically has id, name, color, idBoard.
   */
  async function getCardLabels(t) {
    try {
      var card = await cardDataPromise(t, 'labels');
      var list = null;
      if (card && Array.isArray(card.labels)) list = card.labels;
      else if (Array.isArray(card)) list = card;
      else {
        var scalar = await cardFieldPromise(t, 'labels');
        if (Array.isArray(scalar)) list = scalar;
        else if (scalar && Array.isArray(scalar.labels)) list = scalar.labels;
      }
      return normalizeLabelList(list);
    } catch (err) {
      console.error('Priority card labels failed', err);
      return [];
    }
  }

  /**
   * All labels available on the board (`t.board('labels')`).
   */
  async function getBoardLabels(t) {
    try {
      if (!t || typeof t.board !== 'function') return [];
      var board = await new Promise(function (resolve, reject) {
        t.board('labels').then(resolve, reject);
      });
      var list = null;
      if (board && Array.isArray(board.labels)) list = board.labels;
      else if (Array.isArray(board)) list = board;
      if (isPowerUpRequestChain(list)) return [];
      return normalizeLabelList(list);
    } catch (err) {
      console.error('Priority board labels failed', err);
      return [];
    }
  }

  async function resolveCurrentBoardId(t) {
    try {
      if (t && typeof t.board === 'function') {
        var board = await new Promise(function (resolve, reject) {
          t.board('id').then(resolve, reject);
        });
        if (typeof board === 'string' && board.trim()) return board.trim();
        if (board && typeof board === 'object' && !isPowerUpRequestChain(board)) {
          if (board.id != null && String(board.id).trim()) return String(board.id).trim();
        }
      }
    } catch (err) {
      /* ignore */
    }
    try {
      var cardId = await resolveCurrentCardId(t);
      if (!cardId || !restClientOptions()) return null;
      var api = await t.getRestApi();
      var authorized = await api.isAuthorized();
      if (!authorized) return null;
      var token = await api.getToken();
      if (!token) return null;
      var cfg = restClientOptions();
      var url =
        'https://api.trello.com/1/cards/' +
        encodeURIComponent(cardId) +
        '?fields=idBoard' +
        '&key=' +
        encodeURIComponent(cfg.appKey) +
        '&token=' +
        encodeURIComponent(token);
      var response = await fetch(url, { method: 'GET' });
      if (!response.ok) return null;
      var card = await response.json();
      if (card && card.idBoard != null && String(card.idBoard).trim()) {
        return String(card.idBoard).trim();
      }
    } catch (restErr) {
      console.error('Priority board id REST failed', restErr);
    }
    return null;
  }

  var BOARD_LABEL_COLORS = [
    'green',
    'yellow',
    'orange',
    'red',
    'purple',
    'blue',
    'sky',
    'lime',
    'pink',
    'black'
  ];

  function normalizeBoardLabelColor(color) {
    if (color == null || color === '') return null;
    var base = String(color)
      .replace(/_(light|dark)$/i, '')
      .toLowerCase()
      .trim();
    if (BOARD_LABEL_COLORS.indexOf(base) !== -1) return base;
    return null;
  }

  function pickUnusedLabelColor(existingLabels) {
    var used = Object.create(null);
    var list = Array.isArray(existingLabels) ? existingLabels : [];
    for (var i = 0; i < list.length; i++) {
      var c = normalizeBoardLabelColor(list[i] && list[i].color);
      if (c) used[c] = true;
    }
    for (var j = 0; j < BOARD_LABEL_COLORS.length; j++) {
      if (!used[BOARD_LABEL_COLORS[j]]) return BOARD_LABEL_COLORS[j];
    }
    return BOARD_LABEL_COLORS[list.length % BOARD_LABEL_COLORS.length] || 'blue';
  }

  /**
   * Create a board label via REST POST /labels, then optionally attach it to the card.
   * Requires OAuth (same as title / description edits).
   *
   * @param {object} t Power-Up client
   * @param {{ name: string, color?: string|null, addToCard?: boolean, existingLabels?: Array }} options
   */
  async function createBoardLabel(t, options) {
    options = options || {};
    var name = typeof options.name === 'string' ? options.name.trim() : '';
    if (!name) return { ok: false, reason: 'empty-name', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var boardId = await resolveCurrentBoardId(t);
    if (!boardId) return { ok: false, reason: 'no-board-id', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var color =
      options.color !== undefined
        ? normalizeBoardLabelColor(options.color)
        : pickUnusedLabelColor(options.existingLabels);

    var url =
      'https://api.trello.com/1/labels' +
      '?name=' +
      encodeURIComponent(name.slice(0, 16384)) +
      '&idBoard=' +
      encodeURIComponent(boardId) +
      '&key=' +
      encodeURIComponent(cfg.appKey) +
      '&token=' +
      encodeURIComponent(token);
    if (color) url += '&color=' + encodeURIComponent(color);

    var response = await fetch(url, { method: 'POST' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST POST /labels failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }

    var created = await response.json();
    if (!created || !created.id) {
      return { ok: false, reason: 'no-label', changed: false };
    }

    var label = {
      id: String(created.id),
      name: typeof created.name === 'string' ? created.name : name,
      color: created.color != null ? created.color : color,
      idBoard: created.idBoard != null ? String(created.idBoard) : boardId
    };

    var addToCard = options.addToCard !== false;
    if (addToCard) {
      var addResult = await addCardLabel(t, label.id);
      if (!addResult || addResult.ok === false) {
        return {
          ok: false,
          reason: (addResult && addResult.reason) || 'add-failed',
          changed: false,
          label: label
        };
      }
    }

    return { ok: true, changed: true, label: label, labelId: label.id };
  }

  /**
   * Update a board label via REST PUT /labels/{id}.
   * Accepts name and/or color. Requires OAuth (same as title / description edits).
   *
   * @param {object} t Power-Up client
   * @param {string} labelId
   * @param {{ color?: string|null, name?: string }} options
   */
  async function updateBoardLabel(t, labelId, options) {
    options = options || {};
    var id = labelId != null ? String(labelId).trim() : '';
    if (!id) return { ok: false, reason: 'no-label-id', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var hasColor = Object.prototype.hasOwnProperty.call(options, 'color');
    var hasName = Object.prototype.hasOwnProperty.call(options, 'name');
    if (!hasColor && !hasName) {
      return { ok: false, reason: 'no-changes', changed: false };
    }

    var color = null;
    if (hasColor) {
      color = normalizeBoardLabelColor(options.color);
      if (!color) return { ok: false, reason: 'invalid-color', changed: false };
    }
    var name = null;
    if (hasName) {
      name = typeof options.name === 'string' ? options.name.trim() : '';
      if (name.length > 16384) {
        return { ok: false, reason: 'name-too-long', changed: false };
      }
    }

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var params = [
      'key=' + encodeURIComponent(cfg.appKey),
      'token=' + encodeURIComponent(token)
    ];
    if (hasColor) params.push('color=' + encodeURIComponent(color));
    if (hasName) params.push('name=' + encodeURIComponent(name));

    var url =
      'https://api.trello.com/1/labels/' +
      encodeURIComponent(id) +
      '?' +
      params.join('&');

    var response = await fetch(url, { method: 'PUT' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST PUT /labels/' +
          id +
          ' failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }

    var updated = null;
    try {
      updated = await response.json();
    } catch (parseErr) {
      updated = null;
    }

    var label = {
      id: id,
      name:
        updated && typeof updated.name === 'string'
          ? updated.name
          : hasName
            ? name
            : undefined,
      color:
        updated && Object.prototype.hasOwnProperty.call(updated, 'color')
          ? updated.color
          : hasColor
            ? color
            : undefined,
      idBoard:
        updated && updated.idBoard != null ? String(updated.idBoard) : undefined
    };

    return {
      ok: true,
      changed: true,
      label: label,
      labelId: id,
      color: label.color,
      name: label.name
    };
  }

  /**
   * Add an existing board label to the card via REST POST /cards/{id}/idLabels.
   * Requires OAuth (same as title / description edits).
   */
  async function addCardLabel(t, labelId) {
    var id = labelId != null ? String(labelId).trim() : '';
    if (!id) return { ok: false, reason: 'no-label-id', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var url =
      'https://api.trello.com/1/cards/' +
      encodeURIComponent(cardId) +
      '/idLabels?value=' +
      encodeURIComponent(id) +
      '&key=' +
      encodeURIComponent(cfg.appKey) +
      '&token=' +
      encodeURIComponent(token);

    var response = await fetch(url, { method: 'POST' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST POST /cards/' +
          cardId +
          '/idLabels failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }
    return { ok: true, changed: true, labelId: id };
  }

  /**
   * Remove a label from the card via REST DELETE /cards/{id}/idLabels/{idLabel}.
   * Requires OAuth (same as title / description edits).
   */
  async function removeCardLabel(t, labelId) {
    var id = labelId != null ? String(labelId).trim() : '';
    if (!id) return { ok: false, reason: 'no-label-id', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var url =
      'https://api.trello.com/1/cards/' +
      encodeURIComponent(cardId) +
      '/idLabels/' +
      encodeURIComponent(id) +
      '?key=' +
      encodeURIComponent(cfg.appKey) +
      '&token=' +
      encodeURIComponent(token);

    var response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST DELETE /cards/' +
          cardId +
          '/idLabels/' +
          id +
          ' failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }
    return { ok: true, changed: true, labelId: id };
  }

  /**
   * Permanently delete a board label via REST DELETE /labels/{id}.
   * Removes it from every card on the board. Requires OAuth.
   */
  async function deleteBoardLabel(t, labelId) {
    var id = labelId != null ? String(labelId).trim() : '';
    if (!id) return { ok: false, reason: 'no-label-id', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var url =
      'https://api.trello.com/1/labels/' +
      encodeURIComponent(id) +
      '?key=' +
      encodeURIComponent(cfg.appKey) +
      '&token=' +
      encodeURIComponent(token);

    var response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST DELETE /labels/' +
          id +
          ' failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }
    return { ok: true, changed: true, labelId: id };
  }

  /**
   * Assign a board member to the card via REST POST /cards/{id}/idMembers.
   * Requires OAuth (same as title / description edits).
   */
  async function addCardMember(t, memberId) {
    var id = memberId != null ? String(memberId).trim() : '';
    if (!id) return { ok: false, reason: 'no-member-id', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var url =
      'https://api.trello.com/1/cards/' +
      encodeURIComponent(cardId) +
      '/idMembers?value=' +
      encodeURIComponent(id) +
      '&key=' +
      encodeURIComponent(cfg.appKey) +
      '&token=' +
      encodeURIComponent(token);

    var response = await fetch(url, { method: 'POST' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST POST /cards/' +
          cardId +
          '/idMembers failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }
    return { ok: true, changed: true, memberId: id };
  }

  /**
   * Unassign a member from the card via REST DELETE /cards/{id}/idMembers/{idMember}.
   * Requires OAuth (same as title / description edits).
   */
  async function removeCardMember(t, memberId) {
    var id = memberId != null ? String(memberId).trim() : '';
    if (!id) return { ok: false, reason: 'no-member-id', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var url =
      'https://api.trello.com/1/cards/' +
      encodeURIComponent(cardId) +
      '/idMembers/' +
      encodeURIComponent(id) +
      '?key=' +
      encodeURIComponent(cfg.appKey) +
      '&token=' +
      encodeURIComponent(token);

    var response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST DELETE /cards/' +
          cardId +
          '/idMembers/' +
          id +
          ' failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }
    return { ok: true, changed: true, memberId: id };
  }

  /**
   * Update the card description via REST PUT. Requires OAuth (same as due sync).
   */
  async function setCardDesc(t, desc) {
    var want = typeof desc === 'string' ? desc : '';
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var current = await getCardDesc(t);
    if (current === want) {
      return { ok: true, changed: false, desc: want };
    }

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var put = await restPutCard(t, cardId, { desc: want });
    if (!put.ok) return Object.assign({ changed: false }, put);
    return { ok: true, changed: true, desc: want };
  }

  /**
   * Update the card name via REST PUT. Requires OAuth (same as due sync).
   */
  async function setCardName(t, name) {
    var want = typeof name === 'string' ? name.trim() : '';
    if (!want) return { ok: false, reason: 'empty-name', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var current = await getCardName(t);
    if (current === want) {
      return { ok: true, changed: false, name: want };
    }

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var put = await restPutCard(t, cardId, { name: want });
    if (!put.ok) return Object.assign({ changed: false }, put);
    return { ok: true, changed: true, name: want };
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

  function parseCardStartValue(value) {
    if (value == null || value === false) return null;
    if (typeof value === 'string') {
      var trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'object' && !isPowerUpRequestChain(value)) {
      if (typeof value.start === 'string' && value.start.trim()) {
        return value.start.trim();
      }
      if (
        value.badges &&
        typeof value.badges === 'object' &&
        !isPowerUpRequestChain(value.badges)
      ) {
        if (typeof value.badges.start === 'string' && value.badges.start.trim()) {
          return value.badges.start.trim();
        }
      }
    }
    return null;
  }

  async function getCardStart(t) {
    try {
      var start = await cardFieldPromise(t, 'start');
      if (isPowerUpRequestChain(start)) start = null;
      var parsed = parseCardStartValue(start);
      if (parsed) return parsed;

      var badges = await cardFieldPromise(t, 'badges');
      if (isPowerUpRequestChain(badges)) return null;
      return parseCardStartValue(badges && { badges: badges });
    } catch (err) {
      console.error('Priority card start failed', err);
      return null;
    }
  }

  async function getCardStartSyncedIso(t) {
    try {
      var stored = await t.get('card', 'shared', CARD_START_SYNCED_KEY);
      if (stored == null || stored === '') return '';
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

  async function setCardStartSyncedIso(t, iso) {
    try {
      await t.set(
        'card',
        'shared',
        CARD_START_SYNCED_KEY,
        typeof iso === 'string' ? iso : ''
      );
    } catch (err) {
      console.error('Priority start sync marker failed', err);
    }
  }

  function applyStartToInputs(inputs, startDate) {
    var next = inputs
      ? Object.assign({}, inputs)
      : Object.assign({}, DEFAULT_INPUTS, { priorityEnabled: false });
    delete next.startDate;
    var normalized = '';
    if (startDate) {
      var PU = priorityUI();
      normalized =
        PU && PU.normalizeDueDate
          ? PU.normalizeDueDate(startDate)
          : String(startDate).trim();
      if (normalized && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) normalized = '';
    }
    if (normalized) next.startDate = normalized;
    return normalizeInputs(next);
  }

  function inputsToCanonicalStartIso(inputs) {
    var PU = priorityUI();
    if (PU && PU.inputsToTrelloStartIso) return PU.inputsToTrelloStartIso(inputs) || '';
    return '';
  }

  async function setCardStart(t, startIso) {
    var want = startIso ? canonicalizeDueIso(startIso) : '';
    if (startIso && !want) return { ok: false, reason: 'invalid-start', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var currentRaw = await getCardStart(t);
    var currentCanon = canonicalizeDueIso(currentRaw);
    if (currentCanon === want) {
      return { ok: true, changed: false, start: want || null };
    }

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var put = await restPutCard(t, cardId, { start: want || null });
    if (!put.ok) return Object.assign({ changed: false }, put);
    return { ok: true, changed: true, start: want || null };
  }

  /**
   * Two-way sync: Échéance startDate ↔ Trello Dates `start`.
   * Same conflict rules as syncCardDueWithTrello.
   */
  async function syncCardStartWithTrello(t, options) {
    options = options || {};
    var prefer = options.prefer === 'powerup' ? 'powerup' : 'trello';
    var inputs = options.inputs !== undefined ? options.inputs : await getCardInputs(t);
    if (inputs) inputs = normalizeInputs(inputs) || inputs;

    var PU = priorityUI();
    var trelloRaw = await getCardStart(t);
    var actualCanon = canonicalizeDueIso(trelloRaw);
    var expectedCanon = inputsToCanonicalStartIso(inputs);
    var lastSynced = await getCardStartSyncedIso(t);

    if (actualCanon === expectedCanon) {
      if (lastSynced !== actualCanon) await setCardStartSyncedIso(t, actualCanon);
      return {
        ok: true,
        changed: false,
        inputs: inputs,
        start: actualCanon || null,
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
        if (!inputs || !inputs.startDate) {
          if (lastSynced !== '') await setCardStartSyncedIso(t, '');
          return {
            ok: true,
            changed: false,
            inputs: inputs,
            start: null,
            direction: 'pull',
          };
        }
        var cleared = applyStartToInputs(inputs, null);
        await t.set('card', 'shared', CARD_PRIORITY_KEY, cleared);
        await setCardStartSyncedIso(t, '');
        return {
          ok: true,
          changed: true,
          direction: 'pull',
          inputs: cleared,
          start: null,
        };
      }
      var parts =
        PU && PU.parseTrelloDueToParts
          ? PU.parseTrelloDueToParts(actualCanon)
          : null;
      if (!parts && trelloRaw && PU && PU.parseTrelloDueToParts) {
        parts = PU.parseTrelloDueToParts(trelloRaw);
      }
      if (!parts || !parts.dueDate) {
        return {
          ok: false,
          reason: 'invalid-trello-start',
          changed: false,
          inputs: inputs,
          start: trelloRaw,
        };
      }
      var nextInputs = applyStartToInputs(inputs, parts.dueDate);
      var nextCanon = inputsToCanonicalStartIso(nextInputs);
      var inputsChanged =
        !inputs || (inputs.startDate || '') !== (nextInputs.startDate || '');
      if (inputsChanged) {
        await t.set('card', 'shared', CARD_PRIORITY_KEY, nextInputs);
      }
      await setCardStartSyncedIso(t, nextCanon);
      return {
        ok: true,
        changed: inputsChanged,
        direction: 'pull',
        inputs: nextInputs,
        start: nextCanon || null,
      };
    }

    var put = await setCardStart(t, expectedCanon || null);
    if (!put.ok) {
      return {
        ok: false,
        reason: put.reason || 'push-failed',
        changed: false,
        direction: 'push',
        inputs: inputs,
        start: actualCanon || null,
      };
    }
    await setCardStartSyncedIso(t, expectedCanon);
    return {
      ok: true,
      changed: !!put.changed,
      direction: 'push',
      inputs: inputs,
      start: expectedCanon || null,
    };
  }

  async function getBadgeData(t) {
    try {
      await syncCardDueWithTrello(t, { prefer: 'trello' });
    } catch (syncErr) {
      console.error('Priority due sync (badge) failed', syncErr);
    }
    try {
      await syncCardStartWithTrello(t, { prefer: 'trello' });
    } catch (startErr) {
      console.error('Priority start sync (badge) failed', startErr);
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
      appName: brandAppName(),
    };
    if (cfg.appAuthor) opts.appAuthor = cfg.appAuthor;
    else if (global.PriorityBrand && global.PriorityBrand.appAuthor) {
      opts.appAuthor = global.PriorityBrand.appAuthor;
    }
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
    dbgLog('iframe.init.start');
    return createIframeClientDeferred().then(function (t) {
      dbgLog('iframe.client.ready');
      return runWhenIframeReady(t, function () {
        dbgLog('iframe.handshake.ready');
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
    dbgLog('save.start', {
      syncDue: options.syncDue !== false,
      autoSort: options.autoSort !== false,
      wasBlocked: wasBlocked,
      nowBlocked: !!normalized.enAttente
    });
    await t.set('card', 'shared', CARD_PRIORITY_KEY, normalized);
    if (options.syncDue !== false) {
      try {
        await syncCardDueWithTrello(t, { inputs: normalized, prefer: 'powerup' });
      } catch (syncErr) {
        dbgError('due.sync.save', syncErr);
      }
      try {
        await syncCardStartWithTrello(t, { inputs: normalized, prefer: 'powerup' });
      } catch (startErr) {
        dbgError('start.sync.save', startErr);
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
        dbgLog('statut.autoMove.blocked');
      } catch (moveErr) {
        dbgError('statut.autoMove.blocked', moveErr);
      }
    }
    // Unblocked → restore previous Statut list (En cours, etc.) when still on Bloqué.
    if (
      options.skipStatutAutoMove !== true &&
      wasBlocked &&
      !normalized.enAttente &&
      global.StatutTrello &&
      typeof global.StatutTrello.restorePreviousStatutFromUnblocked === 'function'
    ) {
      try {
        await global.StatutTrello.restorePreviousStatutFromUnblocked(t);
        dbgLog('statut.restore.unblocked');
      } catch (restoreErr) {
        dbgError('statut.restore.unblocked', restoreErr);
      }
    }
    dbgLog('save.end');
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
    var sortBy = options.sortBy === 'activity' ? 'activity' : '';

    var lists = [];
    var cards = [];
    try {
      lists = (await t.lists('id', 'name')) || [];
    } catch (err) {
      console.error('PriorityTrello.scanBoardCards lists failed', err);
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
          'pos',
          'dateLastActivity'
        )) || [];
    } catch (err) {
      console.error('PriorityTrello.scanBoardCards cards failed', err);
      cards = [];
    }

    if (sortBy === 'activity' && cards.length > 1) {
      cards = cards.slice().sort(function (a, b) {
        var ta = a && a.dateLastActivity ? Date.parse(a.dateLastActivity) || 0 : 0;
        var tb = b && b.dateLastActivity ? Date.parse(b.dateLastActivity) || 0 : 0;
        return tb - ta;
      });
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
        listId: card.idList || null,
        due: card.due || null,
        pos: typeof card.pos === 'number' ? card.pos : Number(card.pos) || 0,
        dateLastActivity: card.dateLastActivity || null,
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

  /**
   * Same-list neighbors + recently created cards for card interview context.
   * @returns {Promise<{ surrounding: Array, recentCreated: Array, current: object|null }>}
   */
  async function getCardNeighborhood(t, options) {
    options = options || {};
    var neighborRadius =
      typeof options.neighborRadius === 'number' ? options.neighborRadius : 4;
    var recentMax = typeof options.recentMax === 'number' ? options.recentMax : 8;
    var descMax = typeof options.descMax === 'number' ? options.descMax : 120;
    var includePriority = options.includePriority === true;

    var currentId = options.cardId || null;
    if (!currentId && t && typeof t.card === 'function') {
      try {
        var me = await t.card('id');
        currentId = (me && me.id) || null;
      } catch (e) {
        currentId = null;
      }
    }

    var scan;
    try {
      scan = await scanBoardCards(t, {
        maxCards: 80,
        descMax: descMax,
        includePriority: includePriority
      });
    } catch (err) {
      console.error('PriorityTrello.getCardNeighborhood scan failed', err);
      return { surrounding: [], recentCreated: [], current: null };
    }

    var cards = (scan && scan.cards) || [];
    var current = null;
    var idx = -1;
    for (var i = 0; i < cards.length; i++) {
      if (currentId && cards[i].id === currentId) {
        current = cards[i];
        idx = i;
        break;
      }
    }

    var surrounding = [];
    if (current && current.listId) {
      var sameList = cards
        .filter(function (c) {
          return c && String(c.listId) === String(current.listId);
        })
        .slice()
        .sort(function (a, b) {
          return (a.pos || 0) - (b.pos || 0);
        });
      var localIdx = -1;
      for (var si = 0; si < sameList.length; si++) {
        if (sameList[si].id === current.id) {
          localIdx = si;
          break;
        }
      }
      if (localIdx >= 0) {
        var from = Math.max(0, localIdx - neighborRadius);
        var to = Math.min(sameList.length, localIdx + neighborRadius + 1);
        for (var ni = from; ni < to; ni++) {
          if (ni === localIdx) continue;
          var n = sameList[ni];
          surrounding.push({
            id: n.id,
            name: n.name,
            desc: n.desc,
            list: n.list,
            due: n.due,
            priority: n.priority,
            relation: ni < localIdx ? 'above' : 'below'
          });
        }
      }
    }

    var Mem = global.AgentMemory;
    var recentCreated = cards
      .slice()
      .map(function (c) {
        var at =
          (Mem && typeof Mem.cardIdCreatedAt === 'function' && Mem.cardIdCreatedAt(c.id)) ||
          c.dateLastActivity ||
          '';
        return {
          id: c.id,
          name: c.name,
          list: c.list,
          at: at,
          due: c.due,
          priority: c.priority
        };
      })
      .filter(function (c) {
        return c.id && c.id !== currentId;
      })
      .sort(function (a, b) {
        var ta = Date.parse(a.at) || 0;
        var tb = Date.parse(b.at) || 0;
        if (tb !== ta) return tb - ta;
        return String(b.id).localeCompare(String(a.id));
      })
      .slice(0, recentMax);

    return {
      surrounding: surrounding,
      recentCreated: recentCreated,
      current: current
        ? {
            id: current.id,
            name: current.name,
            desc: current.desc,
            list: current.list,
            due: current.due,
            priority: current.priority
          }
        : null
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

  /**
   * Create a board card via REST POST /cards.
   * Defaults idList to the current card's list when omitted.
   */
  async function createCard(t, options) {
    options = options || {};
    var name = typeof options.name === 'string' ? options.name.trim() : '';
    if (!name) return { ok: false, reason: 'no-name', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var idList = options.idList != null ? String(options.idList).trim() : '';
    if (!idList) {
      var ids = await readCardIdAndListId(t);
      idList = ids && ids.listId ? String(ids.listId) : '';
    }
    if (!idList) return { ok: false, reason: 'no-list-id', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var pos =
      options.pos != null && String(options.pos).trim()
        ? String(options.pos).trim()
        : 'bottom';

    var url =
      'https://api.trello.com/1/cards' +
      '?name=' +
      encodeURIComponent(name) +
      '&idList=' +
      encodeURIComponent(idList) +
      '&pos=' +
      encodeURIComponent(pos) +
      '&key=' +
      encodeURIComponent(cfg.appKey) +
      '&token=' +
      encodeURIComponent(token);

    var response = await fetch(url, { method: 'POST' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST POST /cards failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }

    var created = await response.json();
    if (!created || !created.id) {
      return { ok: false, reason: 'no-card', changed: false };
    }

    return {
      ok: true,
      changed: true,
      cardId: String(created.id),
      card: {
        id: String(created.id),
        name: typeof created.name === 'string' ? created.name : name,
        idList: created.idList != null ? String(created.idList) : idList,
        url: typeof created.url === 'string' ? created.url : undefined,
        shortUrl: typeof created.shortUrl === 'string' ? created.shortUrl : undefined,
      },
    };
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
    if (!cfg) {
      dbgLog('rest.put.skip', { reason: 'no-app-key' });
      return { ok: false, reason: 'no-app-key' };
    }

    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) {
      dbgLog('rest.put.skip', { reason: 'not-authorized' });
      return { ok: false, reason: 'not-authorized' };
    }

    var token = await api.getToken();
    if (!token) {
      dbgLog('rest.put.skip', { reason: 'no-token' });
      return { ok: false, reason: 'no-token' };
    }

    var keys = body && typeof body === 'object' ? Object.keys(body) : [];
    var t0 = Date.now();
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
      dbgError('rest.put', new Error('http_' + response.status), {
        status: response.status,
        fields: keys.length,
        durationMs: Math.max(0, Date.now() - t0)
      });
      throw new Error('Trello REST PUT /cards/' + cardId + ' failed: ' + response.status + (detail ? ' ' + detail : ''));
    }
    dbgLog('rest.put.ok', {
      fields: keys.length,
      durationMs: Math.max(0, Date.now() - t0)
    });
    return { ok: true };
  }

  /**
   * Mark (or unmark) the card as Done via REST PUT dueComplete.
   * Requires OAuth (same path as auto-sort). No-ops when already at target.
   * When recurrence is set and marking complete: advance due/start, persist,
   * push dates, then leave dueComplete false (Trello-like roll-forward).
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

    if (want) {
      var inputs = await getCardInputs(t);
      var PU = priorityUI();
      var recurrence =
        inputs && PU && typeof PU.normalizeRecurrence === 'function'
          ? PU.normalizeRecurrence(inputs.recurrence)
          : inputs && inputs.recurrence
            ? inputs.recurrence
            : null;
      if (recurrence && inputs && inputs.dueDate && PU && PU.nextOccurrenceParts) {
        var nextParts = PU.nextOccurrenceParts(
          {
            dueDate: inputs.dueDate,
            dueTime: inputs.dueTime || '',
            startDate: inputs.startDate || '',
          },
          recurrence
        );
        if (nextParts && nextParts.dueDate) {
          var rolled = Object.assign({}, inputs, {
            dueDate: nextParts.dueDate,
            dueTime: nextParts.dueTime || inputs.dueTime || '',
            dueEnabled: true,
          });
          if (nextParts.startDate) rolled.startDate = nextParts.startDate;
          else delete rolled.startDate;
          rolled = normalizeInputs(rolled);
          await t.set('card', 'shared', CARD_PRIORITY_KEY, rolled);
          try {
            await syncCardDueWithTrello(t, {
              inputs: rolled,
              prefer: 'powerup',
            });
          } catch (dueRollErr) {
            console.error('Priority due roll-forward failed', dueRollErr);
          }
          try {
            await syncCardStartWithTrello(t, {
              inputs: rolled,
              prefer: 'powerup',
            });
          } catch (startRollErr) {
            console.error('Priority start roll-forward failed', startRollErr);
          }
          // Ensure card is not left complete after rolling the schedule.
          if (current === true) {
            var reset = await restPutCard(t, cardId, { dueComplete: false });
            if (!reset.ok) {
              return Object.assign({ changed: false, rolled: true }, reset);
            }
          }
          return {
            ok: true,
            changed: true,
            rolled: true,
            dueComplete: false,
            inputs: rolled,
          };
        }
      }
    }

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
        dbgLog('statut.autoMove.completed');
      } catch (moveErr) {
        dbgError('statut.autoMove.completed', moveErr);
      }
    }

    return { ok: true, changed: true, dueComplete: want };
  }

  async function autoSortCardInList(t) {
    if (!restClientOptions()) {
      dbgLog('autoSort.skip', { reason: 'no-app-key' });
      return { moved: false, reason: 'no-app-key' };
    }

    var ids = await readCardIdAndListId(t);
    if (!ids) {
      dbgLog('autoSort.skip', { reason: 'no-card-context' });
      return { moved: false, reason: 'no-card-context' };
    }

    var settings = await ensureBoardPriorityContext(t);
    var entries = await buildListPriorityEntries(t, ids.listId, settings);
    if (entries.length < 2) {
      dbgLog('autoSort.skip', { reason: 'single-card-list' });
      return { moved: false, reason: 'single-card-list' };
    }

    var move = computeCardMovePosition(entries, ids.cardId);
    if (!move) {
      dbgLog('autoSort.skip', { reason: 'already-sorted' });
      return { moved: false, reason: 'already-sorted' };
    }

    await restPutCard(t, ids.cardId, { pos: move.pos });
    dbgLog('autoSort.moved', { entryCount: entries.length });
    return { moved: true, pos: move.pos };
  }

  function scheduleAutoSortCard(t) {
    if (!restClientOptions()) return Promise.resolve({ moved: false, reason: 'no-app-key' });

    var state = getAutoSortDebounceState(t);
    if (state.timer) clearTimeout(state.timer);
    dbgLog('autoSort.schedule');

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
        dbgError('autoSort', err);
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
      dbgError('rest.authCheck', err);
      return false;
    }
  }

  // Default key used by TrelloPowerUp RestApi client (localStorage + member private).
  var REST_TOKEN_STORAGE_KEY = 'trello_token';

  function isLikelyRestToken(token) {
    // Tokens are opaque (legacy hex or ATTA…). Only reject empty/short values and JWTs.
    return typeof token === 'string' && token.length >= 20 && token.indexOf('.') === -1;
  }

  function authReturnUrl() {
    var url = pageUrl('./auth-return.html');
    try {
      return new URL(url, global.location.href).href.split('#')[0].split('?')[0];
    } catch (err) {
      if (typeof global.location !== 'undefined' && global.location.origin) {
        return global.location.origin + global.location.pathname.replace(/[^/]+$/, 'auth-return.html');
      }
      return url;
    }
  }

  function buildRestAuthorizeUrl(cfg, returnUrl) {
    var params = {
      expiration: 'never',
      scope: 'read,write',
      name: brandAppName(),
      key: cfg.appKey,
      // fragment + return_url: popup lands on auth-return.html with #token=…
      callback_method: 'fragment',
      response_type: 'fragment',
      return_url: returnUrl,
    };
    if (cfg.appAuthor) params.author = cfg.appAuthor;
    return (
      'https://trello.com/1/authorize?' +
      Object.keys(params)
        .map(function (key) {
          return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        })
        .join('&')
    );
  }

  function isPluginDataConflict(err) {
    var msg = String((err && (err.message || err.name || err)) || '');
    return /\b409\b|Conflict/i.test(msg);
  }

  /**
   * Persist the OAuth token once under the RestApi client's storage key.
   * Do not also seed localStorage: getToken()/isAuthorized() would then call
   * fetchAndStoreToken → storeToken and POST pluginData a second time (409).
   */
  function storeRestToken(t, token) {
    return Promise.resolve()
      .then(function () {
        var api = typeof t.getRestApi === 'function' ? t.getRestApi() : null;
        if (api && typeof api.storeToken === 'function') {
          return api.storeToken(token);
        }
        return t.set('member', 'private', REST_TOKEN_STORAGE_KEY, token);
      })
      .then(function () {
        return token;
      })
      .catch(function (err) {
        // Concurrent member pluginData write — only treat as ok if readable.
        if (!isPluginDataConflict(err)) throw err;
        return isRestAuthorized(t).then(function (ok) {
          if (ok) return token;
          throw err;
        });
      });
  }

  /**
   * Kick off Trello REST OAuth via t.authorize (not getRestApi().authorize).
   *
   * getRestApi().authorize() opens the consent popup then immediately calls
   * getToken(); if anything looks like a token (or the popup appears "closed"
   * to the poll), it closes the window in ~0.1s — the bug users saw.
   *
   * t.authorize + auth-return.html avoids that race: the return page calls
   * window.opener.authorize(token). Must stay synchronous through window.open
   * (call only from a direct click handler).
   */
  function authorizeRestForAutoSort(t) {
    var cfg = restClientOptions();
    if (!cfg) {
      return Promise.reject(new Error('REST appKey is not configured'));
    }
    if (!t || typeof t.authorize !== 'function') {
      return Promise.reject(new Error('t.authorize is not available'));
    }

    var returnUrl = authReturnUrl();
    var authUrl = buildRestAuthorizeUrl(cfg, returnUrl);

    // Drop a leftover local token so follow-up isAuthorized checks stay honest.
    try {
      global.localStorage.removeItem(REST_TOKEN_STORAGE_KEY);
    } catch (err) {
      /* ignore */
    }

    return new Promise(function (resolve, reject) {
      var settled = false;
      var authWindow = null;
      var openedAt = Date.now();
      var closeTimer = null;

      function clearAuthTimers() {
        clearInterval(poll);
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
      }

      function finishOk(token) {
        if (settled) return;
        settled = true;
        clearAuthTimers();
        resolve(token);
      }

      function deny(err) {
        if (settled) return;
        settled = true;
        clearAuthTimers();
        reject(
          err ||
            (global.TrelloPowerUp &&
            TrelloPowerUp.restApiError &&
            TrelloPowerUp.restApiError.AuthDeniedError
              ? new TrelloPowerUp.restApiError.AuthDeniedError()
              : new Error('AuthDeniedError'))
        );
      }

      // Ignore brief startup closed=true; after grace, defer deny so
      // opener.authorize(token) can settle before we treat close as cancel.
      var poll = setInterval(function () {
        if (settled) return;
        if (!authWindow) return;
        if (Date.now() - openedAt < 1500) return;
        if (!authWindow.closed) return;
        if (closeTimer) return;
        closeTimer = setTimeout(function () {
          closeTimer = null;
          if (!settled) deny();
        }, 600);
      }, 500);

      // Promise executor runs sync → window.open keeps the click user-gesture.
      t.authorize(authUrl, {
        width: 550,
        height: 725,
        windowCallback: function (win) {
          authWindow = win;
          if (!win) deny(new Error('Popup blocked — allow popups for Trello'));
        },
        validToken: isLikelyRestToken,
      })
        .then(function (token) {
          finishOk(token);
        })
        .catch(function (err) {
          deny(err);
        });
    }).then(function (token) {
      return storeRestToken(t, token);
    });
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
    getCustomTaskTypes: getCustomTaskTypes,
    getCachedCustomTaskTypes: getCachedCustomTaskTypes,
    saveCustomTaskTypes: saveCustomTaskTypes,
    preloadBoardPriorityContext: preloadBoardPriorityContext,
    ensureBoardPriorityContext: ensureBoardPriorityContext,
    computeDisplay: computeDisplay,
    getCardDisplay: getCardDisplay,
    getCardName: getCardName,
    getCardDesc: getCardDesc,
    getCardMembers: getCardMembers,
    getCurrentMember: getCurrentMember,
    getBoardMembers: getBoardMembers,
    getCardCreator: getCardCreator,
    ensureCreatorAssigned: ensureCreatorAssigned,
    getCardLabels: getCardLabels,
    getBoardLabels: getBoardLabels,
    createBoardLabel: createBoardLabel,
    updateBoardLabel: updateBoardLabel,
    addCardLabel: addCardLabel,
    removeCardLabel: removeCardLabel,
    deleteBoardLabel: deleteBoardLabel,
    addCardMember: addCardMember,
    removeCardMember: removeCardMember,
    setCardDesc: setCardDesc,
    setCardName: setCardName,
    createCard: createCard,
    getCardDueComplete: getCardDueComplete,
    setCardDueComplete: setCardDueComplete,
    getCardDue: getCardDue,
    setCardDue: setCardDue,
    syncCardDueWithTrello: syncCardDueWithTrello,
    CARD_DUE_SYNCED_KEY: CARD_DUE_SYNCED_KEY,
    getCardStart: getCardStart,
    setCardStart: setCardStart,
    syncCardStartWithTrello: syncCardStartWithTrello,
    CARD_START_SYNCED_KEY: CARD_START_SYNCED_KEY,
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
    getCardNeighborhood: getCardNeighborhood,
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
