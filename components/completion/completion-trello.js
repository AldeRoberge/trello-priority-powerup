/* Trello Power-Up bridge — card completion / subtask storage and badges. */
(function (global) {
  'use strict';

  var CARD_COMPLETION_KEY = 'cardCompletion';
  var COMPLETION_COLOR_SCHEME_SETTINGS_KEY = 'completionColorScheme';
  var COMPLETION_COLOR_SCHEME_REV_KEY = 'completionColorSchemeRev';
  var COMPLETION_COLOR_GRADIENT_SETTINGS_KEY = 'completionColorGradient';
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

  function formatEstimatedRemainingLabel(remainingMinutes) {
    var m = clampEstimatedMinutes(remainingMinutes);
    if (m == null) {
      if (remainingMinutes === 0) return '0 min restantes';
      return '';
    }
    var compact = formatEstimatedMinutesCompact(m).replace(/^~/, '');
    return compact + ' restantes';
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
    var progress = computeCardProgress(normalized);
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
    var linkedCardId = itemLinkedCardId(raw);
    var text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (text.length > ITEM_TEXT_MAX) text = text.slice(0, ITEM_TEXT_MAX);
    // Linked board cards may resolve the title asynchronously; keep a placeholder.
    if (!text) {
      if (!linkedCardId) return null;
      text = 'Carte li\u00e9e';
    }
    // Legacy `difficulty` fields are ignored (equal-weight progress).

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
   * overall average approaches targetPercent. Linked board-card items keep
   * their cached remote progress (not scaled here).
   */
  function applyMasterProgress(items, targetPercent) {
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

    var n = working.length;
    var linkedSum = 0;
    for (var li = 0; li < working.length; li++) {
      if (isLinkedItem(working[li])) linkedSum += itemProgress(working[li]);
    }
    // Solve for local average so overall average ≈ target.
    var desiredLocalSum = target * n - linkedSum;
    var localCount = localIndexes.length;
    var localTarget = clampProgress(desiredLocalSum / localCount);

    var localCurrentSum = 0;
    localIndexes.forEach(function (idx) {
      localCurrentSum += itemProgress(working[idx]);
    });
    var localCurrent = Math.round(localCurrentSum / localCount);
    if (localCurrent === localTarget) return working;

    if (localCurrent === 0) {
      localIndexes.forEach(function (idx) {
        working[idx].progress = localTarget;
        syncDoneFromProgress(working[idx]);
      });
      return working;
    }

    var scale = localTarget / localCurrent;
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
    COMPLETION_COLOR_GRADIENT_SETTINGS_KEY: COMPLETION_COLOR_GRADIENT_SETTINGS_KEY,
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
    normalizeItem: normalizeItem,
    normalizeCompletionData: normalizeCompletionData,
    clampEstimatedMinutes: clampEstimatedMinutes,
    formatEstimatedMinutesCompact: formatEstimatedMinutesCompact,
    formatEstimatedRemainingLabel: formatEstimatedRemainingLabel,
    itemEstimatedMinutes: itemEstimatedMinutes,
    computeItemsEstimateBase: computeItemsEstimateBase,
    computeEstimatedTotal: computeEstimatedTotal,
    computeEstimatedRemaining: computeEstimatedRemaining,
    itemsNeedingEstimate: itemsNeedingEstimate,
    applyItemEstimates: applyItemEstimates,
    applyMasterEstimate: applyMasterEstimate,
    applyItemEstimate: applyItemEstimate,
    migrateEstimateFromPriority: migrateEstimateFromPriority,
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
