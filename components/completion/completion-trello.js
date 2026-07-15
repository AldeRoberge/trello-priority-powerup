/* Trello Power-Up bridge — card completion / subtask storage and badges. */
(function (global) {
  'use strict';

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
  var CARD_DETAIL_BADGE_TITLE = 'Progrès';
  var boardCompletionColorSchemeKey = 'traffic';
  var BADGE_REFRESH_SEC =
    global.PriorityTrello && global.PriorityTrello.BADGE_REFRESH_SEC
      ? global.PriorityTrello.BADGE_REFRESH_SEC
      : 10;

  var ITEM_TEXT_MAX = 500;
  var PROGRESS_MIN = 0;
  var PROGRESS_MAX = 100;
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
      emptyTitle: 'D\u00e9finir une dur\u00e9e estim\u00e9e',
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
      icon: 'clocks',
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

  function itemEstimatedMinutes(item, snapshotsByCardId) {
    if (!item || typeof item !== 'object') return null;
    var linkedId = itemLinkedCardId(item);
    if (linkedId && snapshotsByCardId && snapshotsByCardId[linkedId]) {
      var snap = snapshotsByCardId[linkedId];
      var snapTotal = clampEstimatedMinutes(snap.estimatedTotalMinutes);
      if (snapTotal != null) return snapTotal;
    }
    return clampEstimatedMinutes(item.estimatedMinutes);
  }

  function copyEstimateFields(from, to) {
    if (!from || !to) return to;
    var mins = clampEstimatedMinutes(from.estimatedMinutes);
    if (mins != null) to.estimatedMinutes = mins;
    if (from.estimatedMinutesLocked === true) to.estimatedMinutesLocked = true;
    return to;
  }

  function computeItemsEstimateBase(items, snapshotsByCardId) {
    if (!items || !items.length) return 0;
    var sum = 0;
    for (var i = 0; i < items.length; i++) {
      var m = itemEstimatedMinutes(items[i], snapshotsByCardId);
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
    if (item.done && item.blocked) delete item.blocked;
    return item;
  }

  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function isItemBlocked(item) {
    return !!(item && item.blocked === true && item.done !== true);
  }

  function isMasterBlocked(data) {
    var normalized = data && typeof data === 'object' ? data : null;
    if (!normalized) return false;
    return normalized.blocked === true;
  }

  /** True when the master task or any incomplete subtask is blocked. */
  function hasAnyBlocked(data) {
    var normalized = normalizeCompletionData(data || { items: [] });
    if (isMasterBlocked(normalized)) return true;
    for (var i = 0; i < normalized.items.length; i++) {
      if (isItemBlocked(normalized.items[i])) return true;
    }
    return false;
  }

  /**
   * Set/clear master blocked. When enabling at 100% (no items or all done),
   * drop progress off complete first.
   */
  function setMasterBlocked(data, blocked) {
    var next = normalizeCompletionData(data || { items: [] });
    if (blocked === true) {
      if (isAllSubtasksComplete(next)) {
        next = markNotFullyComplete(next);
      }
      next.blocked = true;
    } else {
      delete next.blocked;
    }
    return normalizeCompletionData(next);
  }

  /**
   * Set/clear blocked on a single item by id. Enabling clears done/100% on
   * that item; disabling only clears the flag.
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
      }
      return copy;
    });
    if (!found) return next;
    return normalizeCompletionData(next);
  }

  /** Clear master + all item blocked flags. */
  function clearAllBlocked(data) {
    var next = normalizeCompletionData(data || { items: [] });
    delete next.blocked;
    next.items = next.items.map(function (item) {
      if (!item.blocked) return item;
      var copy = Object.assign({}, item);
      delete copy.blocked;
      return copy;
    });
    return normalizeCompletionData(next);
  }

  /**
   * Build priority blockedLinks entries from currently blocked local items.
   * Master-only blocked (no item flags) yields an empty list.
   */
  function blockedLinksFromCompletion(data) {
    var normalized = normalizeCompletionData(data || { items: [] });
    var links = [];
    for (var i = 0; i < normalized.items.length; i++) {
      var item = normalized.items[i];
      if (!isItemBlocked(item)) continue;
      links.push({
        type: 'subtask',
        id: item.id,
        label: item.text,
      });
    }
    return links;
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var linkedCardId = itemLinkedCardId(raw);
    var text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (text.length > ITEM_TEXT_MAX) text = text.slice(0, ITEM_TEXT_MAX);
    // Linked board cards may resolve the title asynchronously; keep a placeholder.
    if (!text) {
      if (!linkedCardId) return null;
      text = 'Carte li\u00e9e';
    }
    // Legacy `difficulty` fields are ignored; estimates weight progress.

    var progress = asNumber(raw.progress);
    if (!isFinite(progress)) {
      progress = raw.done === true ? PROGRESS_MAX : PROGRESS_MIN;
    }
    progress = clampProgress(progress);

    var out = syncDoneFromProgress({
      id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
      text: text,
      done: progress >= PROGRESS_MAX,
      progress: progress,
    });
    if (linkedCardId) out.linkedCardId = linkedCardId;
    copyEstimateFields(raw, out);
    // Persist blocked only when true; cleared when done/100%.
    if (raw.blocked === true && !out.done) out.blocked = true;
    return out;
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
    if (normalized.length) {
      out = { items: normalized };
      var offset = asNumber(raw.estimatedMinutesOffset);
      if (isFinite(offset) && offset !== 0) {
        out.estimatedMinutesOffset = Math.round(offset);
      }
    } else {
      out = { items: [], progress: clampProgress(raw.progress) };
      var cardMins = clampEstimatedMinutes(raw.estimatedMinutes);
      if (cardMins != null) out.estimatedMinutes = cardMins;
    }
    if (raw.estimatedMinutesLocked === true) out.estimatedMinutesLocked = true;
    if (raw.progressEnabled === false) out.progressEnabled = false;
    // Master blocked: omit when false; drop when fully complete.
    // Inline completeness check — avoid isAllSubtasksComplete (re-enters normalize).
    var masterComplete = false;
    if (out.items.length) {
      masterComplete = out.items.every(function (item) {
        return itemProgress(item) >= PROGRESS_MAX;
      });
    } else {
      masterComplete = clampProgress(out.progress) >= PROGRESS_MAX;
    }
    if (raw.blocked === true && !masterComplete) {
      out.blocked = true;
    }
    // estimateScale is board-level now; drop any legacy per-card value.
    return out;
  }

  /**
   * Fallback weight when an item has no estimate: 1 if none of the siblings
   * are estimated, otherwise the average of sibling estimates (so unestimated
   * items still count without drowning out long tasks).
   */
  function averageEstimateFallback(items, snapshotsByCardId) {
    if (!items || !items.length) return 1;
    var sum = 0;
    var count = 0;
    for (var i = 0; i < items.length; i++) {
      var mins = itemEstimatedMinutes(items[i], snapshotsByCardId);
      if (mins != null) {
        sum += mins;
        count++;
      }
    }
    if (!count) return 1;
    return Math.max(1, Math.round(sum / count));
  }

  /** Effort weight for Progrès: estimated minutes, else average/equal fallback. */
  function itemProgressWeight(item, snapshotsByCardId, fallbackWeight) {
    var mins = itemEstimatedMinutes(item, snapshotsByCardId);
    if (mins != null) return mins;
    var fb = asNumber(fallbackWeight);
    return isFinite(fb) && fb > 0 ? fb : 1;
  }

  // Estimate-weighted average of item progress (equal weight when none estimated).
  function computeWeightedProgress(items, snapshotsByCardId) {
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
    var fallback = averageEstimateFallback(items, snapshotsByCardId);
    var weightedProgressSum = 0;
    var totalWeight = 0;
    var doneCount = 0;
    for (var i = 0; i < items.length; i++) {
      var p = itemProgress(items[i]);
      var w = itemProgressWeight(items[i], snapshotsByCardId, fallback);
      weightedProgressSum += (p / PROGRESS_MAX) * w;
      totalWeight += w;
      if (p >= PROGRESS_MAX) doneCount++;
    }
    var percent =
      totalWeight > 0
        ? Math.round((weightedProgressSum / totalWeight) * 100)
        : 0;
    return {
      percent: percent,
      doneCount: doneCount,
      totalCount: items.length,
      doneWeight: Math.round(weightedProgressSum * 10) / 10,
      totalWeight: Math.round(totalWeight * 10) / 10,
      hasItems: true,
    };
  }

  function computeCardProgress(data, snapshotsByCardId) {
    var normalized = normalizeCompletionData(data);
    if (normalized.items.length) {
      return computeWeightedProgress(normalized.items, snapshotsByCardId);
    }
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
   * Detect Statut Terminé / completed while some subtasks remain unfinished.
   * Returns null when consistent; otherwise a structured mismatch for UI / AI.
   */
  function detectDonePendingMismatch(statut, completion) {
    if (!statut || typeof statut !== 'object') return null;
    var category = statut.category || null;
    var listId = statut.listId != null ? String(statut.listId) : null;
    var roleCompleted =
      statut.roleLists && statut.roleLists.completed != null
        ? String(statut.roleLists.completed)
        : null;
    var isCompleted =
      category === 'completed' || (!!listId && !!roleCompleted && listId === roleCompleted);
    if (!isCompleted) return null;

    var normalized = normalizeCompletionData(completion || { items: [] });
    if (normalized.progressEnabled === false) return null;
    var progress = computeCardProgress(normalized);
    if (!progress.hasItems || progress.doneCount >= progress.totalCount) return null;

    var pendingItems = [];
    for (var i = 0; i < normalized.items.length; i++) {
      var item = normalized.items[i];
      if (!item || item.done === true || itemProgress(item) >= PROGRESS_MAX) continue;
      pendingItems.push({
        id: item.id,
        text: item.text,
        progress: itemProgress(item),
      });
    }
    if (!pendingItems.length) return null;

    return {
      kind: 'done_pending_tasks',
      category: 'completed',
      listId: listId,
      listName: typeof statut.listName === 'string' ? statut.listName : '',
      pendingCount: pendingItems.length,
      totalCount: progress.totalCount,
      doneCount: progress.doneCount,
      percent: progress.percent,
      pendingItems: pendingItems,
    };
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

  /**
   * Inverse of markFullyComplete when a card cannot stay "done"
   * (e.g. marked Bloqué). No-op when already incomplete.
   */
  function markNotFullyComplete(data) {
    var next = normalizeCompletionData(data || { items: [] });
    if (!isAllSubtasksComplete(next)) return next;
    if (next.items && next.items.length) {
      next.items = applyMasterProgress(next.items, PROGRESS_MIN);
    } else {
      next.progress = PROGRESS_MIN;
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

  async function getDueCompleteSuppressed(t) {
    try {
      return (await t.get('card', 'shared', COMPLETION_SUPPRESS_DUE_COMPLETE_KEY)) === true;
    } catch (err) {
      return false;
    }
  }

  async function setDueCompleteSuppressed(t, value) {
    try {
      if (value) {
        await t.set('card', 'shared', COMPLETION_SUPPRESS_DUE_COMPLETE_KEY, true);
      } else {
        await t.set('card', 'shared', COMPLETION_SUPPRESS_DUE_COMPLETE_KEY, false);
      }
    } catch (err) {
      console.error('Completion suppress-due-complete flag failed', err);
    }
  }

  /**
   * When progress reaches 100% → mark card Done (dueComplete) via REST if available.
   * When progress leaves 100% → always turn Done off.
   * options.clearSuppress: user edited progress — allow Done again at 100%.
   */
  async function syncCardDueCompleteFromProgress(t, data, options) {
    options = options || {};
    var allComplete = isAllSubtasksComplete(data);
    var PT = global.PriorityTrello;

    if (options.clearSuppress) {
      await setDueCompleteSuppressed(t, false);
    }

    var suppressed = await getDueCompleteSuppressed(t);

    if (!PT || typeof PT.setCardDueComplete !== 'function') {
      return {
        allComplete: allComplete,
        synced: false,
        reason: 'no-setCardDueComplete',
        suppressed: suppressed,
      };
    }

    if (allComplete && !suppressed) {
      var markResult = await PT.setCardDueComplete(t, true);
      if (markResult && markResult.ok) {
        await setMarkedDueCompleteFlag(t, true);
        return {
          allComplete: true,
          synced: true,
          changed: !!markResult.changed,
          dueComplete: true,
          alreadyComplete: !markResult.changed,
        };
      }
      return {
        allComplete: true,
        synced: false,
        reason: (markResult && markResult.reason) || 'mark-failed',
        result: markResult,
      };
    }

    // Progress < 100%, or Done suppressed after leaving Terminé: always unmark.
    var unmarkResult = await PT.setCardDueComplete(t, false);
    await setMarkedDueCompleteFlag(t, false);
    if (!allComplete) {
      await setDueCompleteSuppressed(t, false);
    }

    var statutRestore = null;
    // Leaving 100%: move off Terminé back to the previous Statut list when possible.
    if (
      !allComplete &&
      global.StatutTrello &&
      typeof global.StatutTrello.restorePreviousStatutFromIncomplete === 'function'
    ) {
      try {
        statutRestore = await global.StatutTrello.restorePreviousStatutFromIncomplete(t);
      } catch (restoreErr) {
        console.error('Completion restore previous Statut failed', restoreErr);
        statutRestore = { ok: false, restored: false, reason: 'restore-threw' };
      }
    }

    return {
      allComplete: false,
      synced: !!(unmarkResult && unmarkResult.ok),
      changed: !!(unmarkResult && unmarkResult.changed),
      dueComplete: false,
      suppressed: suppressed,
      reason: unmarkResult && !unmarkResult.ok ? unmarkResult.reason : undefined,
      statutRestored: !!(statutRestore && statutRestore.restored),
      statutRestore: statutRestore,
    };
  }

  /**
   * Master slider: proportionally scale each local item's progress so the
   * estimate-weighted overall approaches targetPercent. Linked board-card
   * items keep their cached remote progress (not scaled here).
   */
  function applyMasterProgress(items, targetPercent, snapshotsByCardId) {
    if (!items || !items.length) return [];
    var target = clampProgress(targetPercent);
    var working = items.map(function (item) {
      var copy = syncDoneFromProgress({
        id: item.id,
        text: item.text,
        progress: itemProgress(item),
        done: item.done === true,
      });
      var linkedId = itemLinkedCardId(item);
      if (linkedId) copy.linkedCardId = linkedId;
      copyEstimateFields(item, copy);
      return copy;
    });

    var localIndexes = [];
    for (var i = 0; i < working.length; i++) {
      if (!isLinkedItem(working[i])) localIndexes.push(i);
    }

    if (!localIndexes.length) {
      // Only linked items — progress is remote; leave cache as-is.
      return working;
    }

    if (target === PROGRESS_MAX) {
      localIndexes.forEach(function (idx) {
        working[idx].progress = PROGRESS_MAX;
        syncDoneFromProgress(working[idx]);
      });
      return working;
    }
    if (target === PROGRESS_MIN) {
      localIndexes.forEach(function (idx) {
        working[idx].progress = PROGRESS_MIN;
        syncDoneFromProgress(working[idx]);
      });
      return working;
    }

    var fallback = averageEstimateFallback(working, snapshotsByCardId);
    var weights = [];
    var totalWeight = 0;
    var linkedContrib = 0;
    var localWeight = 0;
    for (var wi = 0; wi < working.length; wi++) {
      var w = itemProgressWeight(working[wi], snapshotsByCardId, fallback);
      weights[wi] = w;
      totalWeight += w;
      if (isLinkedItem(working[wi])) {
        linkedContrib += (itemProgress(working[wi]) / PROGRESS_MAX) * w;
      } else {
        localWeight += w;
      }
    }
    if (!(totalWeight > 0) || !(localWeight > 0)) return working;

    // Solve for local contribution so estimate-weighted overall ≈ target.
    var desiredLocalContrib =
      (target / PROGRESS_MAX) * totalWeight - linkedContrib;
    var localTargetFrac = desiredLocalContrib / localWeight;
    var localTarget = clampProgress(localTargetFrac * PROGRESS_MAX);

    var localCurrentContrib = 0;
    localIndexes.forEach(function (idx) {
      localCurrentContrib +=
        (itemProgress(working[idx]) / PROGRESS_MAX) * weights[idx];
    });
    var localCurrentFrac = localCurrentContrib / localWeight;
    var localCurrent = Math.round(localCurrentFrac * PROGRESS_MAX);
    if (localCurrent === localTarget) return working;

    if (localCurrentContrib <= 0) {
      localIndexes.forEach(function (idx) {
        working[idx].progress = localTarget;
        syncDoneFromProgress(working[idx]);
      });
      return working;
    }

    var scale = desiredLocalContrib / localCurrentContrib;
    localIndexes.forEach(function (idx) {
      working[idx].progress = clampProgress(working[idx].progress * scale);
      syncDoneFromProgress(working[idx]);
    });

    return working;
  }

  async function getCardCompletion(t) {
    var stored = await t.get('card', 'shared', CARD_COMPLETION_KEY);
    return normalizeCompletionData(stored);
  }

  async function getCardCompletionById(t, cardId) {
    var id = typeof cardId === 'string' ? cardId.trim() : '';
    if (!id) return normalizeCompletionData({ items: [] });
    try {
      var stored = await t.get(id, 'shared', CARD_COMPLETION_KEY);
      return normalizeCompletionData(stored);
    } catch (err) {
      console.error('Completion getCardCompletionById failed', err);
      return normalizeCompletionData({ items: [] });
    }
  }

  async function saveCardCompletion(t, data) {
    var normalized = normalizeCompletionData(data);
    await t.set('card', 'shared', CARD_COMPLETION_KEY, normalized);
    return normalized;
  }

  async function saveCardCompletionById(t, cardId, data) {
    var id = typeof cardId === 'string' ? cardId.trim() : '';
    if (!id) {
      throw new Error('saveCardCompletionById requires cardId');
    }
    var normalized = normalizeCompletionData(data);
    await t.set(id, 'shared', CARD_COMPLETION_KEY, normalized);
    return normalized;
  }

  /**
   * Remove all items that link to childCardId from a completion payload.
   * Pure helper (no I/O) for reparenting / tests.
   */
  function removeLinkedChildFromCompletion(data, childCardId) {
    var childId = typeof childCardId === 'string' ? childCardId.trim() : '';
    var normalized = normalizeCompletionData(data);
    if (!childId) return { data: normalized, removed: 0 };
    var nextItems = [];
    var removed = 0;
    for (var i = 0; i < normalized.items.length; i++) {
      var item = normalized.items[i];
      if (itemLinkedCardId(item) === childId) {
        removed += 1;
        continue;
      }
      nextItems.push(item);
    }
    if (!removed) return { data: normalized, removed: 0 };
    return {
      data: normalizeCompletionData(
        Object.assign({}, normalized, { items: nextItems })
      ),
      removed: removed,
    };
  }

  /**
   * Ensure completion has a linked item pointing at childCardId.
   * Pure helper (no I/O) for reparenting / tests.
   */
  function ensureLinkedChildInCompletion(data, childCardId, opts) {
    opts = opts || {};
    var childId = typeof childCardId === 'string' ? childCardId.trim() : '';
    var normalized = normalizeCompletionData(data);
    if (!childId) return { data: normalized, added: false, changed: false };
    for (var i = 0; i < normalized.items.length; i++) {
      if (itemLinkedCardId(normalized.items[i]) === childId) {
        return { data: normalized, added: false, changed: false };
      }
    }
    var text =
      typeof opts.text === 'string' && opts.text.trim()
        ? opts.text.trim()
        : 'Carte li\u00e9e';
    var progress =
      typeof opts.progress === 'number' && isFinite(opts.progress)
        ? clampProgress(opts.progress)
        : 0;
    var item = normalizeItem({
      id: generateId(),
      text: text,
      progress: progress,
      linkedCardId: childId,
    });
    if (!item) return { data: normalized, added: false, changed: false };
    return {
      data: normalizeCompletionData(
        Object.assign({}, normalized, {
          items: normalized.items.concat([item]),
        })
      ),
      added: true,
      changed: true,
    };
  }

  /** True if data directly links to targetCardId. */
  function completionLinksToCard(data, targetCardId) {
    var target = typeof targetCardId === 'string' ? targetCardId.trim() : '';
    if (!target) return false;
    var items = normalizeCompletionData(data).items;
    for (var i = 0; i < items.length; i++) {
      if (itemLinkedCardId(items[i]) === target) return true;
    }
    return false;
  }

  /**
   * Whether startCardId eventually links to targetCardId within maxDepth hops.
   * Used to reject parent picks that would create a cycle.
   */
  async function isLinkedDescendantOf(t, startCardId, targetCardId, maxDepth) {
    var start = typeof startCardId === 'string' ? startCardId.trim() : '';
    var target = typeof targetCardId === 'string' ? targetCardId.trim() : '';
    if (!start || !target || start === target) return start === target;
    var depthCap =
      typeof maxDepth === 'number' && maxDepth > 0
        ? Math.min(maxDepth, LINK_NEST_MAX_DEPTH)
        : LINK_NEST_MAX_DEPTH;
    var visited = Object.create(null);

    async function walk(cardId, depth) {
      if (!cardId || depth > depthCap) return false;
      if (visited[cardId]) return false;
      visited[cardId] = true;
      var completion = await getCardCompletionById(t, cardId);
      var items = completion.items || [];
      for (var i = 0; i < items.length; i++) {
        var linkedId = itemLinkedCardId(items[i]);
        if (!linkedId) continue;
        if (linkedId === target) return true;
        if (depth < depthCap && (await walk(linkedId, depth + 1))) return true;
      }
      return false;
    }

    return walk(start, 1);
  }

  /**
   * Scan board cards for parents that link to childCardId via linkedCardId.
   * @returns {Promise<Array<{ id: string, name: string, list: string }>>}
   */
  async function findParentCards(t, childCardId, options) {
    options = options || {};
    var childId = typeof childCardId === 'string' ? childCardId.trim() : '';
    if (!childId) return [];
    var maxCards =
      typeof options.maxCards === 'number' && options.maxCards > 0
        ? options.maxCards
        : 100;

    var cards = [];
    if (Array.isArray(options.cards) && options.cards.length) {
      cards = options.cards;
    } else if (
      global.PriorityTrello &&
      typeof global.PriorityTrello.scanBoardCards === 'function'
    ) {
      try {
        var scan = await global.PriorityTrello.scanBoardCards(t, {
          maxCards: maxCards,
          includePriority: false,
        });
        cards = (scan && scan.cards) || [];
      } catch (err) {
        console.error('findParentCards scanBoardCards failed', err);
        cards = [];
      }
    } else if (t && typeof t.cards === 'function') {
      try {
        var raw = (await t.cards('id', 'name', 'idList')) || [];
        cards = raw.map(function (c) {
          return {
            id: c && c.id,
            name: (c && c.name) || '',
            list: '',
          };
        });
      } catch (err) {
        console.error('findParentCards t.cards failed', err);
        cards = [];
      }
    }

    var candidates = cards
      .filter(function (card) {
        return card && card.id && String(card.id) !== childId;
      })
      .slice(0, maxCards);

    var parents = [];
    await Promise.all(
      candidates.map(function (card) {
        return getCardCompletionById(t, card.id).then(function (completion) {
          if (completionLinksToCard(completion, childId)) {
            parents.push({
              id: String(card.id),
              name: typeof card.name === 'string' ? card.name : '',
              list: typeof card.list === 'string' ? card.list : '',
            });
          }
        });
      })
    );
    return parents;
  }

  /**
   * Set or clear the parent of childCardId by mutating parents' cardCompletion
   * linked items. At most one parent is kept after the operation.
   *
   * @param {object} t
   * @param {string} childCardId
   * @param {string|null} parentCardId - null/'' clears all parents
   * @param {{ childName?: string, childProgress?: number, maxCards?: number }} [opts]
   * @returns {Promise<{ ok: boolean, reason?: string, parent?: object|null, parentsRemoved?: number }>}
   */
  async function setParentCard(t, childCardId, parentCardId, opts) {
    opts = opts || {};
    var childId = typeof childCardId === 'string' ? childCardId.trim() : '';
    var nextParentId =
      parentCardId == null || parentCardId === ''
        ? ''
        : String(parentCardId).trim();
    if (!childId) return { ok: false, reason: 'no-child' };
    if (nextParentId && nextParentId === childId) {
      return { ok: false, reason: 'self' };
    }

    if (nextParentId) {
      var cycle = await isLinkedDescendantOf(
        t,
        childId,
        nextParentId,
        LINK_NEST_MAX_DEPTH
      );
      if (cycle) return { ok: false, reason: 'cycle' };
    }

    var existingParents = await findParentCards(t, childId, {
      maxCards: opts.maxCards,
      cards: opts.cards,
    });
    var parentsRemoved = 0;
    var touchIds = Object.create(null);
    existingParents.forEach(function (p) {
      if (p && p.id) touchIds[p.id] = true;
    });
    if (nextParentId) touchIds[nextParentId] = true;

    var childName =
      typeof opts.childName === 'string' && opts.childName.trim()
        ? opts.childName.trim()
        : 'Carte li\u00e9e';
    var childProgress =
      typeof opts.childProgress === 'number' && isFinite(opts.childProgress)
        ? clampProgress(opts.childProgress)
        : null;
    if (childProgress == null) {
      try {
        var childCompletion = await getCardCompletionById(t, childId);
        childProgress = computeCardProgress(childCompletion).percent;
      } catch (e) {
        childProgress = 0;
      }
    }

    var idList = Object.keys(touchIds);
    for (var i = 0; i < idList.length; i++) {
      var pid = idList[i];
      var data = await getCardCompletionById(t, pid);
      var stripped = removeLinkedChildFromCompletion(data, childId);
      var nextData = stripped.data;
      if (stripped.removed) parentsRemoved += stripped.removed;
      if (pid === nextParentId) {
        var ensured = ensureLinkedChildInCompletion(nextData, childId, {
          text: childName,
          progress: childProgress,
        });
        nextData = ensured.data;
      }
      if (
        stripped.removed ||
        (pid === nextParentId &&
          JSON.stringify(normalizeCompletionData(data)) !==
            JSON.stringify(nextData))
      ) {
        await saveCardCompletionById(t, pid, nextData);
      }
    }

    var parentMeta = null;
    if (nextParentId) {
      var parentName =
        typeof opts.parentName === 'string' ? opts.parentName.trim() : '';
      var parentList =
        typeof opts.parentList === 'string' ? opts.parentList : '';
      if (!parentName || !parentList) {
        for (var j = 0; j < existingParents.length; j++) {
          if (existingParents[j] && existingParents[j].id === nextParentId) {
            if (!parentName) parentName = existingParents[j].name || '';
            if (!parentList) parentList = existingParents[j].list || '';
            break;
          }
        }
      }
      if ((!parentName || !parentList) && Array.isArray(opts.cards)) {
        for (var k = 0; k < opts.cards.length; k++) {
          if (opts.cards[k] && String(opts.cards[k].id) === nextParentId) {
            if (!parentName) parentName = opts.cards[k].name || '';
            if (!parentList) parentList = opts.cards[k].list || '';
            break;
          }
        }
      }
      parentMeta = {
        id: nextParentId,
        name: parentName,
        list: parentList,
      };
    }

    return {
      ok: true,
      parent: parentMeta,
      parentsRemoved: parentsRemoved,
    };
  }

  /**
   * Apply resolved remote progress / titles onto local linked items (mutates copy).
   * Used so badges and weighted average reflect linked cards without editing them.
   */
  function applyLinkedSnapshots(data, snapshotsByCardId) {
    var normalized = normalizeCompletionData(data);
    if (!snapshotsByCardId || typeof snapshotsByCardId !== 'object') return normalized;
    var changed = false;
    normalized.items = normalized.items.map(function (item) {
      var linkedId = itemLinkedCardId(item);
      if (!linkedId) return item;
      var snap = snapshotsByCardId[linkedId];
      if (!snap || typeof snap !== 'object') return item;
      var next = {
        id: item.id,
        text: item.text,
        progress: item.progress,
        done: item.done,
        linkedCardId: linkedId,
      };
      copyEstimateFields(item, next);
      if (typeof snap.name === 'string' && snap.name.trim() && snap.name.trim() !== item.text) {
        next.text = snap.name.trim().slice(0, ITEM_TEXT_MAX);
        changed = true;
      }
      if (typeof snap.percent === 'number' && isFinite(snap.percent)) {
        var p = clampProgress(snap.percent);
        if (p !== itemProgress(item)) {
          next.progress = p;
          syncDoneFromProgress(next);
          changed = true;
        }
      }
      var snapTotal = clampEstimatedMinutes(snap.estimatedTotalMinutes);
      if (snapTotal != null && clampEstimatedMinutes(item.estimatedMinutes) !== snapTotal) {
        next.estimatedMinutes = snapTotal;
        changed = true;
      }
      return next;
    });
    return changed ? normalizeCompletionData(normalized) : normalized;
  }

  /**
   * Load linked-card completion trees for UI nesting.
   * Depth 1 = direct items; depth 2 = nested under a link. Cycles are marked
   * (isCycle) and not expanded further.
   *
   * @returns {Promise<{
   *   data: object,
   *   snapshots: Object.<string, { name: string, percent: number, items: Array }>,
   *   byItemId: Object.<string, { children: Array, isCycle?: boolean, missing?: boolean }>
   * }>}
   */
  async function resolveLinkedCompletionTree(t, data, options) {
    options = options || {};
    var maxDepth =
      typeof options.maxDepth === 'number' && options.maxDepth > 0
        ? Math.min(options.maxDepth, LINK_NEST_MAX_DEPTH)
        : LINK_NEST_MAX_DEPTH;
    var currentCardId =
      typeof options.currentCardId === 'string' ? options.currentCardId.trim() : '';
    var cardNameById =
      options.cardNameById && typeof options.cardNameById === 'object'
        ? options.cardNameById
        : {};
    var normalized = normalizeCompletionData(data);
    var snapshots = Object.create(null);
    var byItemId = Object.create(null);
    var loading = Object.create(null);

    async function loadCardSnapshot(cardId) {
      if (!cardId) return null;
      if (snapshots[cardId]) return snapshots[cardId];
      if (loading[cardId]) return loading[cardId];
      loading[cardId] = (async function () {
        var completion = await getCardCompletionById(t, cardId);
        var progress = computeCardProgress(completion);
        var name =
          (typeof cardNameById[cardId] === 'string' && cardNameById[cardId].trim()) ||
          '';
        var snap = {
          name: name,
          percent: progress.percent,
          items: completion.items.slice(),
          progressEnabled: completion.progressEnabled !== false,
          estimatedTotalMinutes: computeEstimatedTotal(completion),
        };
        snapshots[cardId] = snap;
        return snap;
      })();
      try {
        return await loading[cardId];
      } finally {
        delete loading[cardId];
      }
    }

    function mapNestedItem(item, depth, ancestors) {
      var linkedId = itemLinkedCardId(item);
      var node = {
        id: item.id,
        text: item.text,
        progress: itemProgress(item),
        done: !!item.done,
        linkedCardId: linkedId || undefined,
        depth: depth,
        children: [],
        isCycle: false,
        missing: false,
      };
      if (!linkedId) return node;
      if (ancestors[linkedId]) {
        node.isCycle = true;
        return node;
      }
      // Resolve title/progress for links; expand children only below maxDepth.
      node._expandCardId = linkedId;
      return node;
    }

    async function expandNode(node, ancestors) {
      if (!node || !node._expandCardId) return;
      var cardId = node._expandCardId;
      delete node._expandCardId;
      if (ancestors[cardId]) {
        node.isCycle = true;
        return;
      }
      var nextAncestors = Object.assign(Object.create(null), ancestors);
      nextAncestors[cardId] = true;
      var snap = await loadCardSnapshot(cardId);
      if (!snap) {
        node.missing = true;
        return;
      }
      if (snap.name) node.text = snap.name;
      node.progress = snap.percent;
      node.done = snap.percent >= PROGRESS_MAX;
      // Nested children only when this node is above the depth cap.
      if (node.depth >= maxDepth) return;
      var childDepth = node.depth + 1;
      node.children = (snap.items || []).map(function (item) {
        return mapNestedItem(item, childDepth, nextAncestors);
      });
      for (var i = 0; i < node.children.length; i++) {
        await expandNode(node.children[i], nextAncestors);
      }
    }

    var rootAncestors = Object.create(null);
    if (currentCardId) rootAncestors[currentCardId] = true;

    for (var i = 0; i < normalized.items.length; i++) {
      var item = normalized.items[i];
      var linkedId = itemLinkedCardId(item);
      if (!linkedId) continue;
      var rootNode = mapNestedItem(item, 1, rootAncestors);
      await expandNode(rootNode, rootAncestors);
      byItemId[item.id] = rootNode;
    }

    var synced = applyLinkedSnapshots(normalized, snapshots);
    return {
      data: synced,
      snapshots: snapshots,
      byItemId: byItemId,
    };
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
    var UI = global.CompletionUI;
    try {
      var storedGradient = await t.get('board', 'shared', COMPLETION_COLOR_GRADIENT_SETTINGS_KEY);
      var storedKey = await t.get('board', 'shared', COMPLETION_COLOR_SCHEME_SETTINGS_KEY);
      if (Array.isArray(storedGradient) && storedGradient.length >= 2) {
        var stops = UI.normalizeGradientStops(storedGradient);
        var key =
          typeof storedKey === 'string'
            ? UI.normalizeCompletionSchemeKey(storedKey)
            : UI.CUSTOM_COMPLETION_SCHEME_KEY;
        boardCompletionColorSchemeKey = key;
        UI.applyCompletionGradient(stops, key);
        return boardCompletionColorSchemeKey;
      }
      if (typeof storedKey === 'string') {
        boardCompletionColorSchemeKey = UI.normalizeCompletionSchemeKey(storedKey);
        UI.applyCompletionColorScheme(boardCompletionColorSchemeKey);
        return boardCompletionColorSchemeKey;
      }
    } catch (err) {
      console.error('Completion board color scheme load failed', err);
    }
    var fromLocalGradient = UI.loadStoredCompletionGradient && UI.loadStoredCompletionGradient();
    if (fromLocalGradient && fromLocalGradient.length >= 2) {
      var localKey = UI.loadStoredCompletionSchemeKey() || UI.CUSTOM_COMPLETION_SCHEME_KEY;
      boardCompletionColorSchemeKey = UI.normalizeCompletionSchemeKey(localKey);
      UI.applyCompletionGradient(fromLocalGradient, boardCompletionColorSchemeKey);
      return boardCompletionColorSchemeKey;
    }
    var fromLocal = UI.loadStoredCompletionSchemeKey();
    boardCompletionColorSchemeKey = fromLocal || UI.DEFAULT_COMPLETION_SCHEME_KEY || 'traffic';
    UI.applyCompletionColorScheme(boardCompletionColorSchemeKey);
    return boardCompletionColorSchemeKey;
  }

  async function saveBoardCompletionColorScheme(t, schemeKey) {
    if (typeof global.CompletionUI === 'undefined') return 'traffic';
    var UI = global.CompletionUI;
    var key = UI.normalizeCompletionSchemeKey(schemeKey);
    UI.applyCompletionColorScheme(key);
    var stops = UI.getActiveCompletionGradient();
    boardCompletionColorSchemeKey = key;
    UI.saveStoredCompletionSchemeKey(key);
    if (UI.saveStoredCompletionGradient) UI.saveStoredCompletionGradient(stops);
    await t.set('board', 'shared', COMPLETION_COLOR_SCHEME_SETTINGS_KEY, key);
    await t.set('board', 'shared', COMPLETION_COLOR_GRADIENT_SETTINGS_KEY, stops);
    await t.set('board', 'shared', COMPLETION_COLOR_SCHEME_REV_KEY, Date.now());
    return key;
  }

  async function saveBoardCompletionGradient(t, stops, schemeKey) {
    if (typeof global.CompletionUI === 'undefined') return null;
    var UI = global.CompletionUI;
    var key =
      schemeKey != null
        ? UI.normalizeCompletionSchemeKey(schemeKey)
        : UI.CUSTOM_COMPLETION_SCHEME_KEY;
    var normalized = UI.applyCompletionGradient(stops, key);
    boardCompletionColorSchemeKey = key;
    UI.saveStoredCompletionSchemeKey(key);
    if (UI.saveStoredCompletionGradient) UI.saveStoredCompletionGradient(normalized);
    await t.set('board', 'shared', COMPLETION_COLOR_SCHEME_SETTINGS_KEY, key);
    await t.set('board', 'shared', COMPLETION_COLOR_GRADIENT_SETTINGS_KEY, normalized);
    await t.set('board', 'shared', COMPLETION_COLOR_SCHEME_REV_KEY, Date.now());
    return { schemeKey: key, stops: normalized };
  }

  async function getBoardCompletionGradient(t) {
    await getBoardCompletionColorScheme(t);
    if (typeof global.CompletionUI === 'undefined') return [];
    return global.CompletionUI.getActiveCompletionGradient();
  }

  async function preloadBoardCompletionContext(t) {
    await Promise.all([
      getBoardCompletionColorScheme(t),
      getBoardEstimateScales(t).catch(function () {
        return getCachedBoardEstimateScales();
      }),
    ]);
    return boardCompletionColorSchemeKey;
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
    COMPLETION_COLOR_GRADIENT_SETTINGS_KEY: COMPLETION_COLOR_GRADIENT_SETTINGS_KEY,
    ESTIMATE_SCALES_SETTINGS_KEY: ESTIMATE_SCALES_SETTINGS_KEY,
    COMPLETION_MARKED_DUE_COMPLETE_KEY: COMPLETION_MARKED_DUE_COMPLETE_KEY,
    COMPLETION_SUPPRESS_DUE_COMPLETE_KEY: COMPLETION_SUPPRESS_DUE_COMPLETE_KEY,
    ITEM_TEXT_MAX: ITEM_TEXT_MAX,
    PROGRESS_MIN: PROGRESS_MIN,
    PROGRESS_MAX: PROGRESS_MAX,
    LINK_NEST_MAX_DEPTH: LINK_NEST_MAX_DEPTH,
    clampProgress: clampProgress,
    itemProgress: itemProgress,
    itemLinkedCardId: itemLinkedCardId,
    isLinkedItem: isLinkedItem,
    syncDoneFromProgress: syncDoneFromProgress,
    generateId: generateId,
    isItemBlocked: isItemBlocked,
    isMasterBlocked: isMasterBlocked,
    hasAnyBlocked: hasAnyBlocked,
    setMasterBlocked: setMasterBlocked,
    setItemBlocked: setItemBlocked,
    clearAllBlocked: clearAllBlocked,
    blockedLinksFromCompletion: blockedLinksFromCompletion,
    normalizeItem: normalizeItem,
    normalizeCompletionData: normalizeCompletionData,
    ESTIMATE_SCALES: ESTIMATE_SCALES,
    ESTIMATE_SCALE_ORDER: ESTIMATE_SCALE_ORDER,
    ESTIMATE_TIME_TICKS: ESTIMATE_TIME_TICKS,
    DEFAULT_ESTIMATE_SCALE: DEFAULT_ESTIMATE_SCALE,
    DEFAULT_ESTIMATE_SCALES: DEFAULT_ESTIMATE_SCALES,
    normalizeEstimateScale: normalizeEstimateScale,
    normalizeEstimateScales: normalizeEstimateScales,
    getEstimateScale: getEstimateScale,
    getEstimateScaleTicks: getEstimateScaleTicks,
    nearestEstimateTick: nearestEstimateTick,
    formatEstimateForScale: formatEstimateForScale,
    formatEstimateForScales: formatEstimateForScales,
    clampEstimatedMinutes: clampEstimatedMinutes,
    formatEstimatedMinutesCompact: formatEstimatedMinutesCompact,
    formatEstimatedRemainingLabel: formatEstimatedRemainingLabel,
    getBoardEstimateScales: getBoardEstimateScales,
    saveBoardEstimateScales: saveBoardEstimateScales,
    getCachedBoardEstimateScales: getCachedBoardEstimateScales,
    setCachedBoardEstimateScales: setCachedBoardEstimateScales,
    itemEstimatedMinutes: itemEstimatedMinutes,
    computeItemsEstimateBase: computeItemsEstimateBase,
    computeEstimatedTotal: computeEstimatedTotal,
    computeEstimatedRemaining: computeEstimatedRemaining,
    itemsNeedingEstimate: itemsNeedingEstimate,
    applyItemEstimates: applyItemEstimates,
    applyMasterEstimate: applyMasterEstimate,
    applyItemEstimate: applyItemEstimate,
    migrateEstimateFromPriority: migrateEstimateFromPriority,
    averageEstimateFallback: averageEstimateFallback,
    itemProgressWeight: itemProgressWeight,
    computeWeightedProgress: computeWeightedProgress,
    computeCardProgress: computeCardProgress,
    isAllSubtasksComplete: isAllSubtasksComplete,
    detectDonePendingMismatch: detectDonePendingMismatch,
    markFullyComplete: markFullyComplete,
    markNotFullyComplete: markNotFullyComplete,
    setDueCompleteSuppressed: setDueCompleteSuppressed,
    getDueCompleteSuppressed: getDueCompleteSuppressed,
    syncCardDueCompleteFromProgress: syncCardDueCompleteFromProgress,
    applyMasterProgress: applyMasterProgress,
    applyLinkedSnapshots: applyLinkedSnapshots,
    resolveLinkedCompletionTree: resolveLinkedCompletionTree,
    getCardCompletion: getCardCompletion,
    getCardCompletionById: getCardCompletionById,
    saveCardCompletion: saveCardCompletion,
    saveCardCompletionById: saveCardCompletionById,
    removeLinkedChildFromCompletion: removeLinkedChildFromCompletion,
    ensureLinkedChildInCompletion: ensureLinkedChildInCompletion,
    completionLinksToCard: completionLinksToCard,
    isLinkedDescendantOf: isLinkedDescendantOf,
    findParentCards: findParentCards,
    setParentCard: setParentCard,
    getBoardCompletionColorScheme: getBoardCompletionColorScheme,
    saveBoardCompletionColorScheme: saveBoardCompletionColorScheme,
    getBoardCompletionGradient: getBoardCompletionGradient,
    saveBoardCompletionGradient: saveBoardCompletionGradient,
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
