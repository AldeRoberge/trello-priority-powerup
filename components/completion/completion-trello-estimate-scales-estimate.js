/**
 * Completion / Progrès Trello bridge — subtask storage, estimates, badges.
 * Exposes window.CompletionTrello (no bundler).
 *
 * Role: persist cardCompletion pluginData, aggregate progress/blocked/estimates,
 * sync Trello dueComplete when all subtasks done (with suppress/restore keys
 * so Statut ↔ Progrès do not fight). UI is CompletionUI.
 *
 * Notable keys: cardCompletion, estimateScales, completionMarkedDueComplete,
 * completionSuppressDueComplete, completionPreviousBeforeComplete.
 */

/**
 * completion-trello: part 1 of 2 (dbg).
 * Names are shared with the other parts through window.CompletionTrelloParts (see completion-trello.parts.json for the load order).
 */

/**
 * completion-trello-estimate-scales: part 1 of 2 (dbg).
 * Names are shared with the other parts through window.CompletionTrelloParts (see completion-trello-estimate-scales.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.CompletionTrelloParts = global.CompletionTrelloParts || {});

  // from other parts (functions, resolved at call time)
  function computeCardProgress() { return S.computeCardProgress.apply(this, arguments); }
  function isAllSubtasksComplete() { return S.isAllSubtasksComplete.apply(this, arguments); }
  function markNotFullyComplete() { return S.markNotFullyComplete.apply(this, arguments); }
  function normalizeCompletionData() { return S.normalizeCompletionData.apply(this, arguments); }
  function applyMasterProgress() { return S.applyMasterProgress.apply(this, arguments); }
  function saveCardCompletion() { return S.saveCardCompletion.apply(this, arguments); }

var S = (global.CompletionTrelloParts = global.CompletionTrelloParts || {});
  function applyMasterProgress() { return S.applyMasterProgress.apply(this, arguments); }
  function saveCardCompletion() { return S.saveCardCompletion.apply(this, arguments); }

function dbg() { return global.TpDebug || null; }
  function dbgLog(domain, event, meta) { var d = dbg(); if (d && d.log) d.log(domain, event, meta); }
  function dbgError(domain, event, err, meta) { var d = dbg(); if (d && d.error) d.error(domain, event, err, meta); else if (err) console.error(domain + '.' + event, err); }

  var CARD_COMPLETION_KEY = 'cardCompletion';
  var COMPLETION_COLOR_SCHEME_SETTINGS_KEY = 'completionColorScheme';
  var COMPLETION_COLOR_SCHEME_REV_KEY = 'completionColorSchemeRev';
  var COMPLETION_COLOR_GRADIENT_SETTINGS_KEY = 'completionColorGradient';
  var ESTIMATE_SCALES_SETTINGS_KEY = 'estimateScales';
  // Set when this Power-Up marks the card dueComplete from all-subtasks-done.
  // Used to reverse Done only when we own the mark (not a user/manual Done).
  var COMPLETION_MARKED_DUE_COMPLETE_KEY = 'completionMarkedDueComplete';
  // When Statut leaves Terminé while progress is still 100%, keep Done off until
  // the user edits progress (or returns to Terminé).
  var COMPLETION_SUPPRESS_DUE_COMPLETE_KEY = 'completionSuppressDueComplete';
  // Snapshot of Progrès before Statut forced 100% (Terminé) — restored on En cours.
  var COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY = 'completionPreviousBeforeComplete';
  var CARD_DETAIL_BADGE_TITLE = 'Progrès';
  S.boardCompletionColorSchemeKey = 'traffic';
  var BADGE_REFRESH_SEC =
    global.PriorityTrello && global.PriorityTrello.BADGE_REFRESH_SEC
      ? global.PriorityTrello.BADGE_REFRESH_SEC
      : 10;

  var ITEM_TEXT_MAX = 500;
  var PROGRESS_MIN = 0;

  async function cardPluginScope(t) {
    try {
      if (
        global.PriorityTrello &&
        typeof global.PriorityTrello.resolveCurrentCardId === 'function'
      ) {
        var id = await global.PriorityTrello.resolveCurrentCardId(t);
        if (id) return id;
      }
    } catch (e) {
      /* fall through */
    }
    try {
      if (t && typeof t.arg === 'function') {
        var fromArg = t.arg('cardId');
        if (fromArg != null && String(fromArg).trim()) {
          return String(fromArg).trim();
        }
      }
    } catch (e2) {
      /* ignore */
    }
    return 'card';
  }
  var PROGRESS_MAX = 100;
  /** Near-complete fallback when reopening En cours from 100% with no prior snapshot. */
  var PROGRESS_NEAR_COMPLETE = 99;
  /** Nested linked-card subtasks shown under a master item (master → link → nested). */
  var LINK_NEST_MAX_DEPTH = 2;
  var ESTIMATE_MIN_MINUTES = 1;
  var ESTIMATE_MAX_MINUTES = Math.round(2 * 365.25 * 24 * 60);
  var DEFAULT_ESTIMATE_SCALE = 'time';
  /** Board default: time-based estimates only. */
  var DEFAULT_ESTIMATE_SCALES = ['time'];
  var boardEstimateScales = DEFAULT_ESTIMATE_SCALES.slice();

  /**
   * Estimation display systems. Values stay as minutes under the hood so
   * Progrès weighting and remaining-effort math stay consistent across scales.
   * Subtask / Progrès estimates use Temps only (Tailles kept for legacy lookup).
   */
  var ESTIMATE_SCALES = {
    time: {
      id: 'time',
      label: 'Temps',
      shortLabel: 'temps',
      emptyLabel: 'Estimer',
      emptyTitle: 'Ajouter une dur\u00e9e estim\u00e9e (optionnel)',
      popoverLabel: 'Choisir une dur\u00e9e',
      freeform: true,
      freeformPlaceholder: 'ex. 2 h',
      freeformAria: 'Dur\u00e9e personnalis\u00e9e',
      ticks: null, // filled at runtime from PriorityUI duration ticks
    },
    tshirt: {
      id: 'tshirt',
      label: 'Tailles',
      shortLabel: 'taille',
      emptyLabel: 'Taille',
      emptyTitle: 'Choisir une taille (XS\u2013XL)',
      popoverLabel: 'Choisir une taille',
      freeform: false,
      ticks: [
        { id: 'XS', label: 'XS', title: 'XS \u2014 tr\u00e8s petite', minutes: 15 },
        { id: 'S', label: 'S', title: 'S \u2014 petite', minutes: 60 },
        { id: 'M', label: 'M', title: 'M \u2014 moyenne', minutes: 4 * 60 },
        { id: 'L', label: 'L', title: 'L \u2014 grande', minutes: 2 * 24 * 60 },
        { id: 'XL', label: 'XL', title: 'XL \u2014 tr\u00e8s grande', minutes: 5 * 24 * 60 },
      ],
    },
  };

  var ESTIMATE_SCALE_ORDER = ['time'];

  /**
   * Discrete Temps picker ticks (Progrès estimate chip). Full phrases — not the
   * Facilité duration grid, which shortens labels.
   * icon = Tabler class suffix; color = always-visible accent (dim when idle).
   */
  var ESTIMATE_TIME_TICKS = [
    {
      id: 't15',
      label: 'Quelques minutes',
      minutes: 15,
      icon: 'bolt',
      color: '#61BD4F',
    },
    {
      id: 't60',
      label: 'Une heure',
      minutes: 60,
      icon: 'clock',
      color: '#7BC86C',
    },
    {
      id: 't180',
      label: 'Quelques heures',
      minutes: 3 * 60,
      icon: 'clock-2',
      color: '#B5D033',
    },
    {
      id: 't1440',
      label: 'Un jour',
      minutes: 24 * 60,
      icon: 'sun',
      color: '#F2D600',
    },
    {
      id: 't4320',
      label: 'Quelques jours',
      minutes: 3 * 24 * 60,
      icon: 'calendar',
      color: '#FFAF3F',
    },
    {
      id: 't10080',
      label: 'Une semaine',
      minutes: 7 * 24 * 60,
      icon: 'calendar-week',
      color: '#FF9F1A',
    },
    {
      id: 't30240',
      label: 'Plusieurs semaines',
      minutes: 3 * 7 * 24 * 60,
      icon: 'calendar-stats',
      color: '#EB5A46',
    },
    {
      id: 't43200',
      label: 'Un mois',
      minutes: 30 * 24 * 60,
      icon: 'moon',
      color: '#C25100',
    },
    {
      id: 't86400',
      label: 'Plus d\u2019un mois',
      minutes: 2 * 30 * 24 * 60,
      icon: 'hourglass-high',
      color: '#C377E0',
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

  function clampProgress(value) {
    var p = asNumber(value);
    if (!isFinite(p)) return 0;
    return Math.max(PROGRESS_MIN, Math.min(PROGRESS_MAX, Math.round(p)));
  }

  /** Clamp estimated effort minutes (1 … ~2 years). */
  function clampEstimatedMinutes(minutes) {
    var n = asNumber(minutes);
    if (!isFinite(n) || n <= 0) return null;
    var max = ESTIMATE_MAX_MINUTES;
    var PU = global.PriorityUI;
    if (PU && typeof PU.DURATION_MAX_MINUTES === 'number' && isFinite(PU.DURATION_MAX_MINUTES)) {
      max = PU.DURATION_MAX_MINUTES;
    }
    return Math.max(ESTIMATE_MIN_MINUTES, Math.min(max, Math.round(n)));
  }

  function normalizeEstimateScale(value) {
    var key = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (key === 'temps') key = 'time';
    if (key === 'taille' || key === 'tailles' || key === 'size') key = 'tshirt';
    // Legacy café scale removed — treat as default time.
    if (
      key === 'coffee' ||
      key === 'cafe' ||
      key === 'cafes' ||
      key === 'caf\u00e9' ||
      key === 'caf\u00e9s'
    ) {
      key = 'time';
    }
    return ESTIMATE_SCALES[key] ? key : DEFAULT_ESTIMATE_SCALE;
  }

  /**
   * Normalize one or more enabled scales. Order follows ESTIMATE_SCALE_ORDER.
   * At least one scale is always returned (defaults to Temps).
   */
  function normalizeEstimateScales(value) {
    var seen = Object.create(null);
    var collected = [];

    function pushRaw(raw) {
      if (raw == null) return;
      if (typeof raw === 'string') {
        var key = normalizeEstimateScale(raw);
        if (ESTIMATE_SCALES[key] && !seen[key]) {
          seen[key] = true;
          collected.push(key);
        }
        return;
      }
      if (typeof raw === 'object' && typeof raw.id === 'string') {
        pushRaw(raw.id);
      }
    }

    if (Array.isArray(value)) {
      value.forEach(pushRaw);
    } else if (value != null && value !== '') {
      pushRaw(value);
    }

    var ordered = [];
    for (var i = 0; i < ESTIMATE_SCALE_ORDER.length; i++) {
      var id = ESTIMATE_SCALE_ORDER[i];
      if (seen[id]) ordered.push(id);
    }
    if (!ordered.length) return DEFAULT_ESTIMATE_SCALES.slice();
    return ordered;
  }

  function getEstimateScale(scaleId) {
    return ESTIMATE_SCALES[normalizeEstimateScale(scaleId)] || ESTIMATE_SCALES.time;
  }

  function getCachedBoardEstimateScales() {
    return boardEstimateScales.slice();
  }

  function setCachedBoardEstimateScales(scales) {
    boardEstimateScales = normalizeEstimateScales(scales);
    return boardEstimateScales.slice();
  }

  async function getBoardEstimateScales(t) {
    try {
      var stored = await t.get('board', 'shared', ESTIMATE_SCALES_SETTINGS_KEY);
      if (stored != null) {
        boardEstimateScales = normalizeEstimateScales(stored);
        return boardEstimateScales.slice();
      }
    } catch (err) {
      console.error('Board estimate scales load failed', err);
    }
    boardEstimateScales = DEFAULT_ESTIMATE_SCALES.slice();
    return boardEstimateScales.slice();
  }

  async function saveBoardEstimateScales(t, scales) {
    var next = normalizeEstimateScales(scales);
    boardEstimateScales = next;
    await t.set('board', 'shared', ESTIMATE_SCALES_SETTINGS_KEY, next);
    return next.slice();
  }

  function getEstimateScaleTicks(scaleId) {
    var scale = getEstimateScale(scaleId);
    if (scale.id === 'time') {
      return ESTIMATE_TIME_TICKS.map(function (tick) {
        return {
          id: tick.id,
          label: tick.label,
          title: tick.label,
          minutes: tick.minutes,
          icon: tick.icon || '',
          color: tick.color || '',
        };
      });
    }
    return (scale.ticks || []).slice();
  }

  /** Nearest discrete tick for a minute value (log distance). */
  function nearestEstimateTick(minutes, scaleId) {
    var m = clampEstimatedMinutes(minutes);
    if (m == null) return null;
    var ticks = getEstimateScaleTicks(scaleId);
    if (!ticks.length) return null;
    var best = ticks[0];
    var bestDist = Infinity;
    var logM = Math.log(Math.max(m, 1));
    for (var i = 0; i < ticks.length; i++) {
      var tm = clampEstimatedMinutes(ticks[i].minutes);
      if (tm == null) continue;
      var dist = Math.abs(logM - Math.log(Math.max(tm, 1)));
      if (dist < bestDist) {
        bestDist = dist;
        best = ticks[i];
      }
    }
    return best;
  }

  function formatEstimatedMinutesCompact(minutes) {
    var m = clampEstimatedMinutes(minutes);
    if (m == null) return '';
    var PU = global.PriorityUI;
    if (PU && typeof PU.formatDurationFr === 'function') {
      var long = PU.formatDurationFr(m);
      if (long) {
        return long
          .replace(/^environ\s+/i, '~')
          .replace(/\s+minutes?/i, ' min')
          .replace(/\s+heures?/i, ' h')
          .replace(/\s+jours?/i, ' j')
          .replace(/\s+semaines?/i, ' sem')
          .replace(/\s+mois/i, ' mois')
          .replace(/\s+ans?/i, ' an');
      }
    }
    if (m < 90) return '~' + m + ' min';
    if (m < 36 * 60) {
      var h = Math.round((m / 60) * 10) / 10;
      return '~' + h + ' h';
    }
    var d = Math.round(m / (24 * 60));
    return '~' + d + ' j';
  }

  function formatEstimateForScale(minutes, scaleId) {
    var m = clampEstimatedMinutes(minutes);
    if (m == null) return '';
    var scale = getEstimateScale(scaleId);
    if (scale.id === 'time') return formatEstimatedMinutesCompact(m);
    var tick = nearestEstimateTick(m, scale.id);
    return tick ? tick.label : formatEstimatedMinutesCompact(m);
  }

  /** Join labels for every enabled scale (e.g. "~2 h · M"). */
  function formatEstimateForScales(minutes, scaleIds) {
    var m = clampEstimatedMinutes(minutes);
    if (m == null) return '';
    var scales = normalizeEstimateScales(scaleIds);
    var parts = [];
    for (var i = 0; i < scales.length; i++) {
      var part = formatEstimateForScale(m, scales[i]);
      if (part) parts.push(part);
    }
    return parts.join(' \u00b7 ');
  }

  function formatEstimatedRemainingLabel(remainingMinutes, scaleIds) {
    if (remainingMinutes === 0) return 'Termin\u00e9';
    var m = clampEstimatedMinutes(remainingMinutes);
    if (m == null) return '';
    var scales = normalizeEstimateScales(scaleIds);
    var parts = [];
    for (var i = 0; i < scales.length; i++) {
      var scale = getEstimateScale(scales[i]);
      if (scale.id === 'time') {
        parts.push(formatEstimatedMinutesCompact(m).replace(/^~/, '') + ' restantes');
      } else {
        var tick = nearestEstimateTick(m, scale.id);
        if (tick) parts.push('~' + tick.label + ' restantes');
        else parts.push(formatEstimatedMinutesCompact(m) + ' restantes');
      }
    }
    return parts.join(' \u00b7 ');
  }

  function itemHasChecklist(item) {
    return !!(item && Array.isArray(item.items) && item.items.length);
  }

  function itemEstimatedMinutes(item, snapshotsByCardId) {
    if (!item || typeof item !== 'object') return null;
    var linkedId = itemLinkedCardId(item);
    if (linkedId && snapshotsByCardId && snapshotsByCardId[linkedId]) {
      var snap = snapshotsByCardId[linkedId];
      var snapTotal = clampEstimatedMinutes(snap.estimatedTotalMinutes);
      if (snapTotal != null) return snapTotal;
    }
    var explicit = clampEstimatedMinutes(item.estimatedMinutes);
    // Locked: honor the user's value, including an intentional clear (null).
    if (item.estimatedMinutesLocked === true) return explicit;
    if (itemHasChecklist(item) && !linkedId) {
      var sum = 0;
      var hasAny = false;
      for (var i = 0; i < item.items.length; i++) {
        var m = clampEstimatedMinutes(item.items[i] && item.items[i].estimatedMinutes);
        if (m != null) {
          sum += m;
          hasAny = true;
        }
      }
      if (hasAny) return sum;
    }
    return explicit;
  }

  /** Minutes that should still count in totals/weights (even if display was cleared). */
  function itemAggregateEstimateMinutes(item, snapshotsByCardId) {
    var display = itemEstimatedMinutes(item, snapshotsByCardId);
    if (display != null) return display;
    if (
      !item ||
      item.estimatedMinutesLocked !== true ||
      !itemHasChecklist(item) ||
      itemLinkedCardId(item)
    ) {
      return null;
    }
    var sum = 0;
    var hasAny = false;
    for (var i = 0; i < item.items.length; i++) {
      var m = clampEstimatedMinutes(item.items[i] && item.items[i].estimatedMinutes);
      if (m != null) {
        sum += m;
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  }

  /** Gantt schedule of a subtask: ISO dates (YYYY-MM-DD) and optional HH:MM times, kept only when valid. */
  function copyScheduleFields(from, to) {
    if (!from || !to) return to;
    ['startDate', 'dueDate'].forEach(function (k) {
      if (typeof from[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(from[k])) to[k] = from[k];
    });
    if (!to.startDate && !to.dueDate) return to;
    ['startTime', 'dueTime'].forEach(function (k) {
      if (typeof from[k] === 'string' && /^\d{2}:\d{2}$/.test(from[k])) to[k] = from[k];
    });
    return to;
  }

  function copyEstimateFields(from, to) {
    if (!from || !to) return to;
    var mins = clampEstimatedMinutes(from.estimatedMinutes);
    if (mins != null) to.estimatedMinutes = mins;
    if (from.estimatedMinutesLocked === true) to.estimatedMinutesLocked = true;
    return to;
  }

  /** Copy blocked flag + Motifs onto a working item (before syncDoneFromProgress). */
  function copyBlockedFields(from, to) {
    if (!from || !to) return to;
    if (from.blocked === true) {
      to.blocked = true;
      copyBlockedReasons(from, to);
    }
    return to;
  }

  function computeItemsEstimateBase(items, snapshotsByCardId) {
    if (!items || !items.length) return 0;
    var sum = 0;
    for (var i = 0; i < items.length; i++) {
      var m = itemAggregateEstimateMinutes(items[i], snapshotsByCardId);
      if (m != null) sum += m;
    }
    return sum;
  }

  /**
   * Total estimated minutes for a completion payload.
   * With items: sum(item estimates) + hidden offset.
   * Without items: card-level estimatedMinutes.
   */
  function computeEstimatedTotal(data, snapshotsByCardId) {
    var normalized = normalizeCompletionData(data);
    if (normalized.items.length) {
      var base = computeItemsEstimateBase(normalized.items, snapshotsByCardId);
      var offset =
        typeof normalized.estimatedMinutesOffset === 'number' &&
        isFinite(normalized.estimatedMinutesOffset)
          ? Math.round(normalized.estimatedMinutesOffset)
          : 0;
      var total = base + offset;
      return total > 0 ? total : null;
    }
    return clampEstimatedMinutes(normalized.estimatedMinutes);
  }

  /**
   * Remaining estimated minutes weighted by incomplete progress.
   */
  function computeEstimatedRemaining(data, snapshotsByCardId) {
    var normalized = normalizeCompletionData(data);
    var progress = computeCardProgress(normalized, snapshotsByCardId);
    if (normalized.items.length) {
      var remaining = 0;
      var hasAny = false;
      for (var i = 0; i < normalized.items.length; i++) {
        var item = normalized.items[i];
        var mins = itemEstimatedMinutes(item, snapshotsByCardId);
        if (mins == null) continue;
        hasAny = true;
        var p = itemProgress(item);
        remaining += mins * (1 - p / PROGRESS_MAX);
      }
      var offset =
        typeof normalized.estimatedMinutesOffset === 'number' &&
        isFinite(normalized.estimatedMinutesOffset)
          ? Math.round(normalized.estimatedMinutesOffset)
          : 0;
      if (offset > 0) {
        hasAny = true;
        remaining += offset * (1 - progress.percent / PROGRESS_MAX);
      }
      if (!hasAny) return null;
      return Math.max(0, Math.round(remaining));
    }
    var cardMins = clampEstimatedMinutes(normalized.estimatedMinutes);
    if (cardMins == null) return null;
    return Math.max(
      0,
      Math.round(cardMins * (1 - progress.percent / PROGRESS_MAX))
    );
  }

  function itemsNeedingEstimate(data) {
    var normalized = normalizeCompletionData(data);
    return normalized.items.filter(function (item) {
      if (isLinkedItem(item)) return false;
      if (item.estimatedMinutesLocked === true) return false;
      return clampEstimatedMinutes(item.estimatedMinutes) == null;
    });
  }

  /**
   * Apply AI / bulk estimates. Skips locked items and existing values unless force.
   */
  function applyItemEstimates(data, estimates, options) {
    options = options || {};
    var force = options.force === true;
    var lock = options.lock === true;
    var normalized = normalizeCompletionData(data);
    var list = Array.isArray(estimates) ? estimates : [];
    if (!list.length || !normalized.items.length) return normalized;

    var byId = Object.create(null);
    var byText = Object.create(null);
    for (var e = 0; e < list.length; e++) {
      var est = list[e];
      if (!est || typeof est !== 'object') continue;
      var mins = clampEstimatedMinutes(est.estimatedMinutes);
      if (mins == null) continue;
      if (typeof est.id === 'string' && est.id) byId[est.id] = mins;
      var match =
        typeof est.matchText === 'string'
          ? est.matchText.trim().toLowerCase()
          : typeof est.text === 'string'
            ? est.text.trim().toLowerCase()
            : '';
      if (match) byText[match] = mins;
    }

    var changed = false;
    normalized.items = normalized.items.map(function (item) {
      if (isLinkedItem(item)) return item;
      if (!force && item.estimatedMinutesLocked === true) return item;
      if (!force && clampEstimatedMinutes(item.estimatedMinutes) != null) return item;
      var nextMins = byId[item.id];
      if (nextMins == null) {
        nextMins = byText[String(item.text || '').trim().toLowerCase()];
      }
      if (nextMins == null) return item;
      changed = true;
      var next = Object.assign({}, item, { estimatedMinutes: nextMins });
      if (lock) next.estimatedMinutesLocked = true;
      return next;
    });
    return changed ? normalizeCompletionData(normalized) : normalized;
  }

  /**
   * User (or AI-locked) edit of master total.
   * With items → hidden offset; without → card-level estimatedMinutes.
   */
  function applyMasterEstimate(data, totalMinutes, options) {
    options = options || {};
    var lock = options.lock !== false;
    var normalized = normalizeCompletionData(data);
    var mins = clampEstimatedMinutes(totalMinutes);
    if (normalized.items.length) {
      var base = computeItemsEstimateBase(normalized.items, options.snapshotsByCardId);
      if (mins == null) {
        delete normalized.estimatedMinutesOffset;
      } else {
        normalized.estimatedMinutesOffset = Math.round(mins - base);
      }
      if (lock) normalized.estimatedMinutesLocked = true;
      else if (options.lock === false) delete normalized.estimatedMinutesLocked;
      delete normalized.estimatedMinutes;
      return normalizeCompletionData(normalized);
    }
    if (mins == null) {
      delete normalized.estimatedMinutes;
    } else {
      normalized.estimatedMinutes = mins;
    }
    if (lock) normalized.estimatedMinutesLocked = true;
    else if (options.lock === false) delete normalized.estimatedMinutesLocked;
    delete normalized.estimatedMinutesOffset;
    return normalizeCompletionData(normalized);
  }

  /**
   * Set one item's estimate. lock defaults true for user edits.
   */
  function applyItemEstimate(data, itemId, minutes, options) {
    options = options || {};
    var lock = options.lock !== false;
    var normalized = normalizeCompletionData(data);
    var mins = clampEstimatedMinutes(minutes);
    var found = false;
    normalized.items = normalized.items.map(function (item) {
      if (item.id !== itemId) return item;
      found = true;
      var next = Object.assign({}, item);
      if (mins == null) {
        delete next.estimatedMinutes;
      } else {
        next.estimatedMinutes = mins;
      }
      if (lock) next.estimatedMinutesLocked = true;
      return next;
    });
    return found ? normalizeCompletionData(normalized) : normalized;
  }

  /**
   * One-time seed from legacy Facilité estimatedDurationMinutes.
   * Returns null when no migration needed; otherwise new completion data.
   */
  function migrateEstimateFromPriority(completion, priorityEstimatedMinutes) {
    var normalized = normalizeCompletionData(completion || { items: [] });
    var legacy = clampEstimatedMinutes(priorityEstimatedMinutes);
    if (legacy == null) return null;

    var hasItemEstimate = normalized.items.some(function (item) {
      return clampEstimatedMinutes(item.estimatedMinutes) != null;
    });
    var hasCardEstimate = clampEstimatedMinutes(normalized.estimatedMinutes) != null;
    var hasOffset =
      typeof normalized.estimatedMinutesOffset === 'number' &&
      isFinite(normalized.estimatedMinutesOffset) &&
      normalized.estimatedMinutesOffset !== 0;
    if (hasItemEstimate || hasCardEstimate || hasOffset) return null;

    if (normalized.items.length) {
      normalized.estimatedMinutesOffset = legacy;
      return normalizeCompletionData(normalized);
    }
    normalized.estimatedMinutes = legacy;
    return normalizeCompletionData(normalized);
  }

  function itemLinkedCardId(item) {
    if (!item || typeof item !== 'object') return '';
    var id =
      typeof item.linkedCardId === 'string'
        ? item.linkedCardId.trim()
        : typeof item.cardId === 'string'
          ? item.cardId.trim()
          : '';
    return id || '';
  }

  function isLinkedItem(item) {
    return !!itemLinkedCardId(item);
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
    // Done and blocked are mutually exclusive.
    if (item.done && item.blocked) {
      delete item.blocked;
      delete item.blockedReasons;
    }
    return item;
  }

  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function normalizeBlockedReason(reason) {
    if (typeof reason !== 'string') return '';
    return reason.trim() || '';
  }

  function blockedReasonKey(reason) {
    return normalizeBlockedReason(reason).toLocaleLowerCase('fr-FR');
  }

  /**
   * Normalize blocked Motifs to a de-duplicated string[].
   * Accepts string[], a single string, or an object with blockedReasons /
   * legacy blockedReason.
   */
  function normalizeBlockedReasons(raw) {
    var list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (typeof raw === 'string') {
      list = [raw];
    } else if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.blockedReasons)) {
        list = raw.blockedReasons;
      } else if (typeof raw.blockedReason === 'string' && raw.blockedReason.trim()) {
        list = [raw.blockedReason];
      }
    }
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var reason = normalizeBlockedReason(list[i]);
      if (!reason) continue;
      var key = blockedReasonKey(reason);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(reason);
    }
    return out;
  }

  function copyBlockedReasons(raw, out) {
    var reasons = normalizeBlockedReasons(
      raw && raw.blockedReasons != null ? raw.blockedReasons : raw
    );
    if (reasons.length) out.blockedReasons = reasons;
    else delete out.blockedReasons;
  }

  function isItemBlocked(item) {
    return !!(item && item.blocked === true && item.done !== true);
  }

  function isMasterBlocked(data) {
    var normalized = data && typeof data === 'object' ? data : null;
    if (!normalized) return false;
    return normalized.blocked === true;
  }

  /**
   * Why master.blocked is set:
   * - 'user'   — user pressed the Progrès pause on the master task
   * - 'status' — Statut Bloqué (or bridge) with no blocking subtasks yet
   * Missing origin on legacy data is treated as 'user'.
   */
  function masterBlockedOrigin(data) {
    if (!isMasterBlocked(data)) return null;
    return data.blockedOrigin === 'status' ? 'status' : 'user';
  }

  function isMasterBlockedByUser(data) {
    return masterBlockedOrigin(data) === 'user';
  }

  /** True when any incomplete subtask is blocked (ignores master flag). */
  function hasBlockedSubtasks(data) {
    var items =
      data && Array.isArray(data.items)
        ? data.items
        : normalizeCompletionData(data || { items: [] }).items;
    for (var i = 0; i < items.length; i++) {
      if (isItemBlocked(items[i])) return true;
    }
    return false;
  }

  /** True when the master task or any incomplete subtask is blocked. */
  function hasAnyBlocked(data) {
    var normalized = normalizeCompletionData(data || { items: [] });
    if (isMasterBlocked(normalized)) return true;
    return hasBlockedSubtasks(normalized);
  }

  /**
   * Unique ordered union of master + blocked-item Motifs.
   */
  function aggregateBlockedReasons(data) {
    var normalized = normalizeCompletionData(data || { items: [] });
    var out = [];
    var seen = Object.create(null);
    function pushAll(list) {
      if (!list || !list.length) return;
      for (var i = 0; i < list.length; i++) {
        var reason = normalizeBlockedReason(list[i]);
        if (!reason) continue;
        var key = blockedReasonKey(reason);
        if (seen[key]) continue;
        seen[key] = true;
        out.push(reason);
      }
    }
    if (isMasterBlocked(normalized)) {
      pushAll(normalized.blockedReasons);
    }
    for (var j = 0; j < normalized.items.length; j++) {
      var item = normalized.items[j];
      if (!isItemBlocked(item)) continue;
      pushAll(item.blockedReasons);
    }
    return out;
  }

  /**
   * Set/clear master blocked. When enabling at 100% (no items or all done),
   * drop progress off complete first.
   *
   * opts.origin: 'user' (default) | 'status'
   *   'user'   — explicit pause on the master task
   *   'status' — mirror of Statut Bloqué (no subtask blockers yet)
   */
  function setMasterBlocked(data, blocked, opts) {
    opts = opts || {};
    var next = normalizeCompletionData(data || { items: [] });
    if (blocked === true) {
      if (isAllSubtasksComplete(next)) {
        next = markNotFullyComplete(next);
      }
      var prevOrigin = next.blocked === true ? masterBlockedOrigin(next) : null;
      next.blocked = true;
      // Explicit user pause wins over a later status-only mirror.
      if (prevOrigin === 'user' && opts.origin === 'status') {
        next.blockedOrigin = 'user';
      } else {
        next.blockedOrigin = opts.origin === 'status' ? 'status' : 'user';
      }
    } else {
      delete next.blocked;
      delete next.blockedReasons;
      delete next.blockedOrigin;
    }
    return normalizeCompletionData(next);
  }

  /**
   * Replace master Motifs. Non-empty reasons enable master blocked; clearing
   * reasons alone does not unblock (use setMasterBlocked(false)).
   */
  function setMasterBlockedReasons(data, reasons, opts) {
    var list = normalizeBlockedReasons(reasons);
    var next;
    if (list.length) {
      next = setMasterBlocked(data, true, opts);
      next.blockedReasons = list;
    } else {
      next = normalizeCompletionData(data || { items: [] });
      delete next.blockedReasons;
    }
    return normalizeCompletionData(next);
  }

  /**
   * Set/clear blocked on a single item by id. Enabling clears done/100% on
   * that item; disabling only clears the flag.
   * When the last subtask unblocks, drops a status-origin master block so
   * Statut can clear (user-origin master block is kept).
   */
  function setItemBlocked(data, itemId, blocked) {
    var next = normalizeCompletionData(data || { items: [] });
    var id = typeof itemId === 'string' ? itemId : '';
    if (!id) return next;
    var found = false;
    next.items = next.items.map(function (item) {
      if (item.id !== id) return item;
      found = true;
      var copy = Object.assign({}, item);
      if (blocked === true) {
        if (itemProgress(copy) >= PROGRESS_MAX) {
          copy.progress = PROGRESS_MIN;
          syncDoneFromProgress(copy);
        }
        copy.blocked = true;
      } else {
        delete copy.blocked;
        delete copy.blockedReasons;
      }
      return copy;
    });
    if (!found) return next;
    next = normalizeCompletionData(next);
    // Last subtask unblocked: clear auto/status master so Statut can drop.
    if (
      blocked !== true &&
      !hasBlockedSubtasks(next) &&
      masterBlockedOrigin(next) === 'status'
    ) {
      next = setMasterBlocked(next, false);
    }
    return next;
  }

  // exports
  S.BADGE_REFRESH_SEC = BADGE_REFRESH_SEC;
  S.CARD_COMPLETION_KEY = CARD_COMPLETION_KEY;
  S.CARD_DETAIL_BADGE_TITLE = CARD_DETAIL_BADGE_TITLE;
  S.COMPLETION_COLOR_GRADIENT_SETTINGS_KEY = COMPLETION_COLOR_GRADIENT_SETTINGS_KEY;
  S.COMPLETION_COLOR_SCHEME_REV_KEY = COMPLETION_COLOR_SCHEME_REV_KEY;
  S.COMPLETION_COLOR_SCHEME_SETTINGS_KEY = COMPLETION_COLOR_SCHEME_SETTINGS_KEY;
  S.COMPLETION_MARKED_DUE_COMPLETE_KEY = COMPLETION_MARKED_DUE_COMPLETE_KEY;
  S.COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY = COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY;
  S.COMPLETION_SUPPRESS_DUE_COMPLETE_KEY = COMPLETION_SUPPRESS_DUE_COMPLETE_KEY;
  S.DEFAULT_ESTIMATE_SCALE = DEFAULT_ESTIMATE_SCALE;
  S.DEFAULT_ESTIMATE_SCALES = DEFAULT_ESTIMATE_SCALES;
  S.ESTIMATE_MAX_MINUTES = ESTIMATE_MAX_MINUTES;
  S.ESTIMATE_MIN_MINUTES = ESTIMATE_MIN_MINUTES;
  S.ESTIMATE_SCALES = ESTIMATE_SCALES;
  S.ESTIMATE_SCALES_SETTINGS_KEY = ESTIMATE_SCALES_SETTINGS_KEY;
  S.ESTIMATE_SCALE_ORDER = ESTIMATE_SCALE_ORDER;
  S.ESTIMATE_TIME_TICKS = ESTIMATE_TIME_TICKS;
  S.ITEM_TEXT_MAX = ITEM_TEXT_MAX;
  S.LINK_NEST_MAX_DEPTH = LINK_NEST_MAX_DEPTH;
  S.PROGRESS_MAX = PROGRESS_MAX;
  S.PROGRESS_MIN = PROGRESS_MIN;
  S.PROGRESS_NEAR_COMPLETE = PROGRESS_NEAR_COMPLETE;
  S.aggregateBlockedReasons = aggregateBlockedReasons;
  S.applyItemEstimate = applyItemEstimate;
  S.applyItemEstimates = applyItemEstimates;
  S.applyMasterEstimate = applyMasterEstimate;
  S.asNumber = asNumber;
  S.blockedReasonKey = blockedReasonKey;
  S.boardEstimateScales = boardEstimateScales;
  S.cardPluginScope = cardPluginScope;
  S.clampEstimatedMinutes = clampEstimatedMinutes;
  S.clampProgress = clampProgress;
  S.computeEstimatedRemaining = computeEstimatedRemaining;
  S.computeEstimatedTotal = computeEstimatedTotal;
  S.computeItemsEstimateBase = computeItemsEstimateBase;
  S.copyBlockedFields = copyBlockedFields;
  S.copyBlockedReasons = copyBlockedReasons;
  S.copyEstimateFields = copyEstimateFields;
  S.copyScheduleFields = copyScheduleFields;
  S.dbg = dbg;
  S.dbgError = dbgError;
  S.dbgLog = dbgLog;
  S.formatEstimateForScale = formatEstimateForScale;
  S.formatEstimateForScales = formatEstimateForScales;
  S.formatEstimatedMinutesCompact = formatEstimatedMinutesCompact;
  S.formatEstimatedRemainingLabel = formatEstimatedRemainingLabel;
  S.generateId = generateId;
  S.getBoardEstimateScales = getBoardEstimateScales;
  S.getCachedBoardEstimateScales = getCachedBoardEstimateScales;
  S.getEstimateScale = getEstimateScale;
  S.getEstimateScaleTicks = getEstimateScaleTicks;
  S.hasAnyBlocked = hasAnyBlocked;
  S.hasBlockedSubtasks = hasBlockedSubtasks;
  S.isItemBlocked = isItemBlocked;
  S.isLinkedItem = isLinkedItem;
  S.isMasterBlocked = isMasterBlocked;
  S.isMasterBlockedByUser = isMasterBlockedByUser;
  S.itemAggregateEstimateMinutes = itemAggregateEstimateMinutes;
  S.itemEstimatedMinutes = itemEstimatedMinutes;
  S.itemHasChecklist = itemHasChecklist;
  S.itemLinkedCardId = itemLinkedCardId;
  S.itemProgress = itemProgress;
  S.itemsNeedingEstimate = itemsNeedingEstimate;
  S.masterBlockedOrigin = masterBlockedOrigin;
  S.migrateEstimateFromPriority = migrateEstimateFromPriority;
  S.nearestEstimateTick = nearestEstimateTick;
  S.normalizeBlockedReason = normalizeBlockedReason;
  S.normalizeBlockedReasons = normalizeBlockedReasons;
  S.normalizeEstimateScale = normalizeEstimateScale;
  S.normalizeEstimateScales = normalizeEstimateScales;
  S.saveBoardEstimateScales = saveBoardEstimateScales;
  S.setCachedBoardEstimateScales = setCachedBoardEstimateScales;
  S.setItemBlocked = setItemBlocked;
  S.setMasterBlocked = setMasterBlocked;
  S.setMasterBlockedReasons = setMasterBlockedReasons;
  S.syncDoneFromProgress = syncDoneFromProgress;
})(typeof window !== 'undefined' ? window : this);
