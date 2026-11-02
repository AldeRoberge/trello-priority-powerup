/**
 * completion-trello-estimate-scales: part 2 of 2 (setItemBlockedReasons).
 * Names are shared with the other parts through window.CompletionTrelloParts (see completion-trello-estimate-scales.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.CompletionTrelloParts = global.CompletionTrelloParts || {});

  // from earlier parts (values)
  var COMPLETION_MARKED_DUE_COMPLETE_KEY = S.COMPLETION_MARKED_DUE_COMPLETE_KEY;
  var COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY = S.COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY;
  var COMPLETION_SUPPRESS_DUE_COMPLETE_KEY = S.COMPLETION_SUPPRESS_DUE_COMPLETE_KEY;
  var ITEM_TEXT_MAX = S.ITEM_TEXT_MAX;
  var PROGRESS_MAX = S.PROGRESS_MAX;
  var PROGRESS_MIN = S.PROGRESS_MIN;
  var PROGRESS_NEAR_COMPLETE = S.PROGRESS_NEAR_COMPLETE;

  // from other parts (functions, resolved at call time)
  function asNumber() { return S.asNumber.apply(this, arguments); }
  function cardPluginScope() { return S.cardPluginScope.apply(this, arguments); }
  function clampEstimatedMinutes() { return S.clampEstimatedMinutes.apply(this, arguments); }
  function clampProgress() { return S.clampProgress.apply(this, arguments); }
  function copyBlockedReasons() { return S.copyBlockedReasons.apply(this, arguments); }
  function copyEstimateFields() { return S.copyEstimateFields.apply(this, arguments); }
  function copyScheduleFields() { return S.copyScheduleFields.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function generateId() { return S.generateId.apply(this, arguments); }
  function hasAnyBlocked() { return S.hasAnyBlocked.apply(this, arguments); }
  function hasBlockedSubtasks() { return S.hasBlockedSubtasks.apply(this, arguments); }
  function isItemBlocked() { return S.isItemBlocked.apply(this, arguments); }
  function isMasterBlocked() { return S.isMasterBlocked.apply(this, arguments); }
  function itemAggregateEstimateMinutes() { return S.itemAggregateEstimateMinutes.apply(this, arguments); }
  function itemHasChecklist() { return S.itemHasChecklist.apply(this, arguments); }
  function itemLinkedCardId() { return S.itemLinkedCardId.apply(this, arguments); }
  function itemProgress() { return S.itemProgress.apply(this, arguments); }
  function normalizeBlockedReasons() { return S.normalizeBlockedReasons.apply(this, arguments); }
  function setItemBlocked() { return S.setItemBlocked.apply(this, arguments); }
  function syncDoneFromProgress() { return S.syncDoneFromProgress.apply(this, arguments); }
  function applyMasterProgress() { return S.applyMasterProgress.apply(this, arguments); }
  function saveCardCompletion() { return S.saveCardCompletion.apply(this, arguments); }

  /**
   * Replace Motifs on a blocked item. Non-empty reasons enable blocked;
   * clearing reasons alone does not unblock.
   */
  function setItemBlockedReasons(data, itemId, reasons) {
    var id = typeof itemId === 'string' ? itemId : '';
    if (!id) return normalizeCompletionData(data || { items: [] });
    var list = normalizeBlockedReasons(reasons);
    var next = list.length
      ? setItemBlocked(data, id, true)
      : normalizeCompletionData(data || { items: [] });
    next.items = next.items.map(function (item) {
      if (item.id !== id) return item;
      var copy = Object.assign({}, item);
      if (list.length) copy.blockedReasons = list;
      else delete copy.blockedReasons;
      return copy;
    });
    return normalizeCompletionData(next);
  }

  /** Clear master + all item blocked flags. */
  function clearAllBlocked(data) {
    var next = normalizeCompletionData(data || { items: [] });
    delete next.blocked;
    delete next.blockedReasons;
    delete next.blockedOrigin;
    next.items = next.items.map(function (item) {
      if (!item.blocked && !item.blockedReasons) return item;
      var copy = Object.assign({}, item);
      delete copy.blocked;
      delete copy.blockedReasons;
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

  /**
   * Seed card-level Motifs onto completion entities that are blocked but have
   * no per-entity reasons yet (migration from legacy cardPriority Motifs).
   * Skips pure "En attente de [this item]" provisionals — those stay card-only.
   */
  function seedBlockedReasonsFromPriority(data, priorityReasons) {
    var next = normalizeCompletionData(data || { items: [] });
    var seed = normalizeBlockedReasons(priorityReasons);
    if (!seed.length || !hasAnyBlocked(next)) return next;

    var masterHas = isMasterBlocked(next) && (next.blockedReasons || []).length > 0;
    var blockedItems = [];
    for (var i = 0; i < next.items.length; i++) {
      if (isItemBlocked(next.items[i])) blockedItems.push(next.items[i]);
    }
    var anyItemHas = false;
    for (var b = 0; b < blockedItems.length; b++) {
      if ((blockedItems[b].blockedReasons || []).length) {
        anyItemHas = true;
        break;
      }
    }
    if (masterHas || anyItemHas) return next;

    function isSelfWaiting(reason, title) {
      if (
        global.PriorityAgent &&
        typeof global.PriorityAgent.isPureWaitingOnTaskReason === 'function'
      ) {
        return global.PriorityAgent.isPureWaitingOnTaskReason(reason, title);
      }
      var r = String(reason || '')
        .trim()
        .toLocaleLowerCase('fr-FR');
      var name = String(title || '').trim();
      if (!r || !name) return false;
      var lower =
        name.charAt(0).toLocaleLowerCase('fr-FR') + name.slice(1);
      var rest = r
        .replace(/^en\s+attente\s+(de|d')\s*/i, '')
        .replace(/^\(|\)$/g, '')
        .trim();
      return (
        rest === name.toLocaleLowerCase('fr-FR') ||
        rest === lower.toLocaleLowerCase('fr-FR')
      );
    }

    if (isMasterBlocked(next)) {
      next.blockedReasons = seed.slice();
      return normalizeCompletionData(next);
    }
    if (blockedItems.length === 1) {
      var only = blockedItems[0];
      var filtered = seed.filter(function (reason) {
        return !isSelfWaiting(reason, only.text);
      });
      if (!filtered.length) return next;
      return setItemBlockedReasons(next, only.id, filtered);
    }
    // Multiple item blockers: copy shared Motifs onto each (aggregate dedupes),
    // but never copy a pure waiting-on-[that item] provisional onto itself.
    next.items = next.items.map(function (item) {
      if (!isItemBlocked(item)) return item;
      var itemSeed = seed.filter(function (reason) {
        return !isSelfWaiting(reason, item.text);
      });
      if (!itemSeed.length) return item;
      var copy = Object.assign({}, item);
      copy.blockedReasons = itemSeed.slice();
      return copy;
    });
    return normalizeCompletionData(next);
  }

  /**
   * Checklist (sub-sub-task) under a local subtask. No links, blocked, or nesting.
   */
  function normalizeChecklistItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (text.length > ITEM_TEXT_MAX) text = text.slice(0, ITEM_TEXT_MAX);
    if (!text) return null;

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
    copyEstimateFields(raw, out);
    copyScheduleFields(raw, out);
    return out;
  }

  function normalizeChecklistItems(rawItems) {
    if (!Array.isArray(rawItems) || !rawItems.length) return [];
    var nested = [];
    var seenIds = Object.create(null);
    for (var i = 0; i < rawItems.length; i++) {
      var child = normalizeChecklistItem(rawItems[i]);
      if (!child) continue;
      if (seenIds[child.id]) continue;
      seenIds[child.id] = true;
      nested.push(child);
    }
    return nested;
  }

  /**
   * Scale a local item's checklist toward targetPercent and derive item.progress.
   * No-op shape when there is no checklist — sets progress directly.
   */
  function syncItemChecklistProgress(item, targetPercent) {
    if (!item || typeof item !== 'object') return item;
    var target = clampProgress(targetPercent);
    if (!itemHasChecklist(item)) {
      item.progress = target;
      syncDoneFromProgress(item);
      return item;
    }
    item.items = applyMasterProgress(item.items, target);
    var rolled = computeWeightedProgress(item.items);
    item.progress = rolled.percent;
    syncDoneFromProgress(item);
    return item;
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
    if (!linkedCardId) copyScheduleFields(raw, out);

    // Local checklist only (never on linked items; no further nesting).
    if (!linkedCardId) {
      var nested = normalizeChecklistItems(raw.items);
      if (nested.length) {
        out.items = nested;
        var rolled = computeWeightedProgress(nested);
        out.progress = rolled.percent;
        syncDoneFromProgress(out);
      }
    }

    // Persist blocked only when true; cleared when done/100%.
    if (raw.blocked === true && !out.done) {
      out.blocked = true;
      copyBlockedReasons(raw, out);
    }
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
      copyBlockedReasons(raw, out);
      // Persist origin only while blocked; legacy/missing → 'user'.
      out.blockedOrigin = raw.blockedOrigin === 'status' ? 'status' : 'user';
    }
    // Status-origin master is only a stand-in until subtasks carry the block
    // (or until the user presses pause). If raw still had blocked items that
    // are now clear (completed/unblocked), drop the leftover status mirror so
    // Statut can clear via hasAnyBlocked.
    if (
      out.blocked === true &&
      out.blockedOrigin === 'status' &&
      out.items.length > 0 &&
      !hasBlockedSubtasks(out)
    ) {
      var rawHadBlockedItem = false;
      var rawItems = Array.isArray(raw.items) ? raw.items : [];
      for (var ri = 0; ri < rawItems.length; ri++) {
        if (rawItems[ri] && rawItems[ri].blocked === true) {
          rawHadBlockedItem = true;
          break;
        }
      }
      if (rawHadBlockedItem) {
        delete out.blocked;
        delete out.blockedReasons;
        delete out.blockedOrigin;
      }
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
      var mins = itemAggregateEstimateMinutes(items[i], snapshotsByCardId);
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
    var mins = itemAggregateEstimateMinutes(item, snapshotsByCardId);
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

  /**
   * Leave 100% for En cours: restore a prior incomplete snapshot, or drop to
   * 99% when there was none (already complete before Terminé).
   * No-op when already incomplete.
   */
  function restoreProgressLeavingComplete(data, previous) {
    var next = normalizeCompletionData(data || { items: [] });
    if (!isAllSubtasksComplete(next)) return next;
    var prev = previous ? normalizeCompletionData(previous) : null;
    if (prev && !isAllSubtasksComplete(prev)) {
      delete prev.progressEnabled;
      return normalizeCompletionData(prev);
    }
    if (next.items && next.items.length) {
      next.items = applyMasterProgress(next.items, PROGRESS_NEAR_COMPLETE);
    } else {
      next.progress = PROGRESS_NEAR_COMPLETE;
    }
    delete next.progressEnabled;
    return normalizeCompletionData(next);
  }

  async function getPreviousCompletionBeforeComplete(t) {
    try {
      var raw = await t.get(
        await cardPluginScope(t),
        'shared',
        COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY
      );
      if (!raw || typeof raw !== 'object') return null;
      var normalized = normalizeCompletionData(raw);
      if (isAllSubtasksComplete(normalized)) return null;
      return normalized;
    } catch (err) {
      console.error('Completion previous-before-complete get failed', err);
      return null;
    }
  }

  async function setPreviousCompletionBeforeComplete(t, data) {
    try {
      var scope = await cardPluginScope(t);
      if (!data) {
        await t.set(scope, 'shared', COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY, null);
        return null;
      }
      var normalized = normalizeCompletionData(data);
      if (isAllSubtasksComplete(normalized)) {
        await t.set(scope, 'shared', COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY, null);
        return null;
      }
      await t.set(scope, 'shared', COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY, normalized);
      return normalized;
    } catch (err) {
      console.error('Completion previous-before-complete set failed', err);
      return null;
    }
  }

  async function clearPreviousCompletionBeforeComplete(t) {
    return setPreviousCompletionBeforeComplete(t, null);
  }

  /**
   * Remember Progrès before forcing 100% via Terminé. Clears the snapshot when
   * already complete so En cours falls back to 99%.
   */
  async function capturePreviousCompletionBeforeComplete(t, data) {
    var normalized = normalizeCompletionData(data || { items: [] });
    if (isAllSubtasksComplete(normalized)) {
      await clearPreviousCompletionBeforeComplete(t);
      return null;
    }
    return setPreviousCompletionBeforeComplete(t, normalized);
  }

  async function getMarkedDueCompleteFlag(t) {
    try {
      var flagged = await t.get(
        await cardPluginScope(t),
        'shared',
        COMPLETION_MARKED_DUE_COMPLETE_KEY
      );
      return flagged === true;
    } catch (err) {
      return false;
    }
  }

  async function setMarkedDueCompleteFlag(t, value) {
    try {
      var scope = await cardPluginScope(t);
      if (value) {
        await t.set(scope, 'shared', COMPLETION_MARKED_DUE_COMPLETE_KEY, true);
      } else {
        await t.set(scope, 'shared', COMPLETION_MARKED_DUE_COMPLETE_KEY, false);
      }
    } catch (err) {
      console.error('Completion marked-due-complete flag failed', err);
    }
  }

  async function getDueCompleteSuppressed(t) {
    try {
      return (
        (await t.get(
          await cardPluginScope(t),
          'shared',
          COMPLETION_SUPPRESS_DUE_COMPLETE_KEY
        )) === true
      );
    } catch (err) {
      return false;
    }
  }

  async function setDueCompleteSuppressed(t, value) {
    try {
      var scope = await cardPluginScope(t);
      if (value) {
        await t.set(scope, 'shared', COMPLETION_SUPPRESS_DUE_COMPLETE_KEY, true);
      } else {
        await t.set(scope, 'shared', COMPLETION_SUPPRESS_DUE_COMPLETE_KEY, false);
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
      dbgLog('completionTrello', 'syncDueComplete', {
        outcome: 'no-op',
        reason: 'no-setCardDueComplete',
        allComplete: allComplete,
        suppressed: suppressed,
      });
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
        if (markResult.rolled) {
          var reopened = markNotFullyComplete(data);
          await saveCardCompletion(t, reopened);
          await setMarkedDueCompleteFlag(t, false);
          await setDueCompleteSuppressed(t, false);
          var rolledStatutRestore = null;
          if (
            global.StatutTrello &&
            typeof global.StatutTrello.restorePreviousStatutFromIncomplete === 'function'
          ) {
            try {
              rolledStatutRestore =
                await global.StatutTrello.restorePreviousStatutFromIncomplete(t);
            } catch (rolledRestoreErr) {
              dbgError('completionTrello', 'syncDueComplete.rolledRestoreStatut', rolledRestoreErr);
              rolledStatutRestore = {
                ok: false,
                restored: false,
                reason: 'restore-threw',
              };
            }
          }
          dbgLog('completionTrello', 'syncDueComplete', {
            outcome: 'rolled',
            allComplete: true,
            changed: !!markResult.changed,
          });
          return {
            allComplete: false,
            synced: true,
            changed: !!markResult.changed,
            dueComplete: false,
            rolled: true,
            inputs: markResult.inputs || null,
            completion: reopened,
            statutRestore: rolledStatutRestore,
          };
        }
        await setMarkedDueCompleteFlag(t, true);
        dbgLog('completionTrello', 'syncDueComplete', {
          outcome: markResult.changed ? 'marked' : 'no-op',
          reason: markResult.changed ? 'marked' : 'already-complete',
          allComplete: true,
          changed: !!markResult.changed,
        });
        return {
          allComplete: true,
          synced: true,
          changed: !!markResult.changed,
          dueComplete: true,
          alreadyComplete: !markResult.changed,
        };
      }
      dbgLog('completionTrello', 'syncDueComplete', {
        outcome: 'no-op',
        reason: (markResult && markResult.reason) || 'mark-failed',
        allComplete: true,
      });
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
        dbgError('completionTrello', 'syncDueComplete.restoreStatut', restoreErr);
        statutRestore = { ok: false, restored: false, reason: 'restore-threw' };
      }
    }

    var unmarkOutcome = allComplete && suppressed ? 'suppressed' : 'unmarked';
    dbgLog('completionTrello', 'syncDueComplete', {
      outcome: unmarkOutcome,
      reason: unmarkResult && !unmarkResult.ok ? unmarkResult.reason : undefined,
      allComplete: allComplete,
      changed: !!(unmarkResult && unmarkResult.changed),
      statutRestored: !!(statutRestore && statutRestore.restored),
    });
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

  // exports
  S.averageEstimateFallback = averageEstimateFallback;
  S.blockedLinksFromCompletion = blockedLinksFromCompletion;
  S.capturePreviousCompletionBeforeComplete = capturePreviousCompletionBeforeComplete;
  S.clearAllBlocked = clearAllBlocked;
  S.clearPreviousCompletionBeforeComplete = clearPreviousCompletionBeforeComplete;
  S.computeCardProgress = computeCardProgress;
  S.computeWeightedProgress = computeWeightedProgress;
  S.detectDonePendingMismatch = detectDonePendingMismatch;
  S.getDueCompleteSuppressed = getDueCompleteSuppressed;
  S.getMarkedDueCompleteFlag = getMarkedDueCompleteFlag;
  S.getPreviousCompletionBeforeComplete = getPreviousCompletionBeforeComplete;
  S.isAllSubtasksComplete = isAllSubtasksComplete;
  S.itemProgressWeight = itemProgressWeight;
  S.markFullyComplete = markFullyComplete;
  S.markNotFullyComplete = markNotFullyComplete;
  S.normalizeChecklistItem = normalizeChecklistItem;
  S.normalizeChecklistItems = normalizeChecklistItems;
  S.normalizeCompletionData = normalizeCompletionData;
  S.normalizeItem = normalizeItem;
  S.restoreProgressLeavingComplete = restoreProgressLeavingComplete;
  S.seedBlockedReasonsFromPriority = seedBlockedReasonsFromPriority;
  S.setDueCompleteSuppressed = setDueCompleteSuppressed;
  S.setItemBlockedReasons = setItemBlockedReasons;
  S.setMarkedDueCompleteFlag = setMarkedDueCompleteFlag;
  S.setPreviousCompletionBeforeComplete = setPreviousCompletionBeforeComplete;
  S.syncCardDueCompleteFromProgress = syncCardDueCompleteFromProgress;
  S.syncItemChecklistProgress = syncItemChecklistProgress;
})(typeof window !== 'undefined' ? window : this);
