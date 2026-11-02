/**
 * completion-trello: part 2 of 2 (applyMasterProgress).
 * Names are shared with the other parts through window.CompletionTrelloParts (see completion-trello.parts.json for the load order).
 */

/**
 * completion-trello-completion-data: part 1 of 2 (applyMasterProgress).
 * Names are shared with the other parts through window.CompletionTrelloParts (see completion-trello-completion-data.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.CompletionTrelloParts = global.CompletionTrelloParts || {});

  // from earlier parts (values)
  var BADGE_REFRESH_SEC = S.BADGE_REFRESH_SEC;
  var CARD_COMPLETION_KEY = S.CARD_COMPLETION_KEY;
  var CARD_DETAIL_BADGE_TITLE = S.CARD_DETAIL_BADGE_TITLE;
  var COMPLETION_COLOR_GRADIENT_SETTINGS_KEY = S.COMPLETION_COLOR_GRADIENT_SETTINGS_KEY;
  var COMPLETION_COLOR_SCHEME_REV_KEY = S.COMPLETION_COLOR_SCHEME_REV_KEY;
  var COMPLETION_COLOR_SCHEME_SETTINGS_KEY = S.COMPLETION_COLOR_SCHEME_SETTINGS_KEY;
  var COMPLETION_MARKED_DUE_COMPLETE_KEY = S.COMPLETION_MARKED_DUE_COMPLETE_KEY;
  var COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY = S.COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY;
  var COMPLETION_SUPPRESS_DUE_COMPLETE_KEY = S.COMPLETION_SUPPRESS_DUE_COMPLETE_KEY;
  var DEFAULT_ESTIMATE_SCALE = S.DEFAULT_ESTIMATE_SCALE;
  var DEFAULT_ESTIMATE_SCALES = S.DEFAULT_ESTIMATE_SCALES;
  var ESTIMATE_SCALES = S.ESTIMATE_SCALES;
  var ESTIMATE_SCALES_SETTINGS_KEY = S.ESTIMATE_SCALES_SETTINGS_KEY;
  var ESTIMATE_SCALE_ORDER = S.ESTIMATE_SCALE_ORDER;
  var ESTIMATE_TIME_TICKS = S.ESTIMATE_TIME_TICKS;
  var ITEM_TEXT_MAX = S.ITEM_TEXT_MAX;
  var LINK_NEST_MAX_DEPTH = S.LINK_NEST_MAX_DEPTH;
  var PROGRESS_MAX = S.PROGRESS_MAX;
  var PROGRESS_MIN = S.PROGRESS_MIN;
  var PROGRESS_NEAR_COMPLETE = S.PROGRESS_NEAR_COMPLETE;

  // from other parts (functions, resolved at call time)
  function aggregateBlockedReasons() { return S.aggregateBlockedReasons.apply(this, arguments); }
  function applyItemEstimate() { return S.applyItemEstimate.apply(this, arguments); }
  function applyItemEstimates() { return S.applyItemEstimates.apply(this, arguments); }
  function applyMasterEstimate() { return S.applyMasterEstimate.apply(this, arguments); }
  function averageEstimateFallback() { return S.averageEstimateFallback.apply(this, arguments); }
  function blockedLinksFromCompletion() { return S.blockedLinksFromCompletion.apply(this, arguments); }
  function capturePreviousCompletionBeforeComplete() { return S.capturePreviousCompletionBeforeComplete.apply(this, arguments); }
  function cardPluginScope() { return S.cardPluginScope.apply(this, arguments); }
  function clampEstimatedMinutes() { return S.clampEstimatedMinutes.apply(this, arguments); }
  function clampProgress() { return S.clampProgress.apply(this, arguments); }
  function clearAllBlocked() { return S.clearAllBlocked.apply(this, arguments); }
  function clearPreviousCompletionBeforeComplete() { return S.clearPreviousCompletionBeforeComplete.apply(this, arguments); }
  function computeCardProgress() { return S.computeCardProgress.apply(this, arguments); }
  function computeEstimatedRemaining() { return S.computeEstimatedRemaining.apply(this, arguments); }
  function computeEstimatedTotal() { return S.computeEstimatedTotal.apply(this, arguments); }
  function computeItemsEstimateBase() { return S.computeItemsEstimateBase.apply(this, arguments); }
  function computeWeightedProgress() { return S.computeWeightedProgress.apply(this, arguments); }
  function copyBlockedFields() { return S.copyBlockedFields.apply(this, arguments); }
  function copyEstimateFields() { return S.copyEstimateFields.apply(this, arguments); }
  function copyScheduleFields() { return S.copyScheduleFields.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function detectDonePendingMismatch() { return S.detectDonePendingMismatch.apply(this, arguments); }
  function formatEstimateForScale() { return S.formatEstimateForScale.apply(this, arguments); }
  function formatEstimateForScales() { return S.formatEstimateForScales.apply(this, arguments); }
  function formatEstimatedMinutesCompact() { return S.formatEstimatedMinutesCompact.apply(this, arguments); }
  function formatEstimatedRemainingLabel() { return S.formatEstimatedRemainingLabel.apply(this, arguments); }
  function generateId() { return S.generateId.apply(this, arguments); }
  function getBoardEstimateScales() { return S.getBoardEstimateScales.apply(this, arguments); }
  function getCachedBoardEstimateScales() { return S.getCachedBoardEstimateScales.apply(this, arguments); }
  function getDueCompleteSuppressed() { return S.getDueCompleteSuppressed.apply(this, arguments); }
  function getEstimateScale() { return S.getEstimateScale.apply(this, arguments); }
  function getEstimateScaleTicks() { return S.getEstimateScaleTicks.apply(this, arguments); }
  function getPreviousCompletionBeforeComplete() { return S.getPreviousCompletionBeforeComplete.apply(this, arguments); }
  function hasAnyBlocked() { return S.hasAnyBlocked.apply(this, arguments); }
  function hasBlockedSubtasks() { return S.hasBlockedSubtasks.apply(this, arguments); }
  function isAllSubtasksComplete() { return S.isAllSubtasksComplete.apply(this, arguments); }
  function isItemBlocked() { return S.isItemBlocked.apply(this, arguments); }
  function isLinkedItem() { return S.isLinkedItem.apply(this, arguments); }
  function isMasterBlocked() { return S.isMasterBlocked.apply(this, arguments); }
  function isMasterBlockedByUser() { return S.isMasterBlockedByUser.apply(this, arguments); }
  function itemAggregateEstimateMinutes() { return S.itemAggregateEstimateMinutes.apply(this, arguments); }
  function itemEstimatedMinutes() { return S.itemEstimatedMinutes.apply(this, arguments); }
  function itemHasChecklist() { return S.itemHasChecklist.apply(this, arguments); }
  function itemLinkedCardId() { return S.itemLinkedCardId.apply(this, arguments); }
  function itemProgress() { return S.itemProgress.apply(this, arguments); }
  function itemProgressWeight() { return S.itemProgressWeight.apply(this, arguments); }
  function itemsNeedingEstimate() { return S.itemsNeedingEstimate.apply(this, arguments); }
  function markFullyComplete() { return S.markFullyComplete.apply(this, arguments); }
  function markNotFullyComplete() { return S.markNotFullyComplete.apply(this, arguments); }
  function masterBlockedOrigin() { return S.masterBlockedOrigin.apply(this, arguments); }
  function migrateEstimateFromPriority() { return S.migrateEstimateFromPriority.apply(this, arguments); }
  function nearestEstimateTick() { return S.nearestEstimateTick.apply(this, arguments); }
  function normalizeBlockedReason() { return S.normalizeBlockedReason.apply(this, arguments); }
  function normalizeBlockedReasons() { return S.normalizeBlockedReasons.apply(this, arguments); }
  function normalizeChecklistItem() { return S.normalizeChecklistItem.apply(this, arguments); }
  function normalizeChecklistItems() { return S.normalizeChecklistItems.apply(this, arguments); }
  function normalizeCompletionData() { return S.normalizeCompletionData.apply(this, arguments); }
  function normalizeEstimateScale() { return S.normalizeEstimateScale.apply(this, arguments); }
  function normalizeEstimateScales() { return S.normalizeEstimateScales.apply(this, arguments); }
  function normalizeItem() { return S.normalizeItem.apply(this, arguments); }
  function restoreProgressLeavingComplete() { return S.restoreProgressLeavingComplete.apply(this, arguments); }
  function saveBoardEstimateScales() { return S.saveBoardEstimateScales.apply(this, arguments); }
  function seedBlockedReasonsFromPriority() { return S.seedBlockedReasonsFromPriority.apply(this, arguments); }
  function setCachedBoardEstimateScales() { return S.setCachedBoardEstimateScales.apply(this, arguments); }
  function setDueCompleteSuppressed() { return S.setDueCompleteSuppressed.apply(this, arguments); }
  function setItemBlocked() { return S.setItemBlocked.apply(this, arguments); }
  function setItemBlockedReasons() { return S.setItemBlockedReasons.apply(this, arguments); }
  function setMasterBlocked() { return S.setMasterBlocked.apply(this, arguments); }
  function setMasterBlockedReasons() { return S.setMasterBlockedReasons.apply(this, arguments); }
  function setPreviousCompletionBeforeComplete() { return S.setPreviousCompletionBeforeComplete.apply(this, arguments); }
  function syncCardDueCompleteFromProgress() { return S.syncCardDueCompleteFromProgress.apply(this, arguments); }
  function syncDoneFromProgress() { return S.syncDoneFromProgress.apply(this, arguments); }
  function syncItemChecklistProgress() { return S.syncItemChecklistProgress.apply(this, arguments); }

var S = (global.CompletionTrelloParts = global.CompletionTrelloParts || {});
  var BADGE_REFRESH_SEC = S.BADGE_REFRESH_SEC;
  var CARD_COMPLETION_KEY = S.CARD_COMPLETION_KEY;
  var CARD_DETAIL_BADGE_TITLE = S.CARD_DETAIL_BADGE_TITLE;
  var COMPLETION_COLOR_GRADIENT_SETTINGS_KEY = S.COMPLETION_COLOR_GRADIENT_SETTINGS_KEY;
  var COMPLETION_COLOR_SCHEME_REV_KEY = S.COMPLETION_COLOR_SCHEME_REV_KEY;
  var COMPLETION_COLOR_SCHEME_SETTINGS_KEY = S.COMPLETION_COLOR_SCHEME_SETTINGS_KEY;
  var COMPLETION_MARKED_DUE_COMPLETE_KEY = S.COMPLETION_MARKED_DUE_COMPLETE_KEY;
  var COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY = S.COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY;
  var COMPLETION_SUPPRESS_DUE_COMPLETE_KEY = S.COMPLETION_SUPPRESS_DUE_COMPLETE_KEY;
  var DEFAULT_ESTIMATE_SCALE = S.DEFAULT_ESTIMATE_SCALE;
  var DEFAULT_ESTIMATE_SCALES = S.DEFAULT_ESTIMATE_SCALES;
  var ESTIMATE_SCALES = S.ESTIMATE_SCALES;
  var ESTIMATE_SCALES_SETTINGS_KEY = S.ESTIMATE_SCALES_SETTINGS_KEY;
  var ESTIMATE_SCALE_ORDER = S.ESTIMATE_SCALE_ORDER;
  var ESTIMATE_TIME_TICKS = S.ESTIMATE_TIME_TICKS;
  var ITEM_TEXT_MAX = S.ITEM_TEXT_MAX;
  var LINK_NEST_MAX_DEPTH = S.LINK_NEST_MAX_DEPTH;
  var PROGRESS_MAX = S.PROGRESS_MAX;
  var PROGRESS_MIN = S.PROGRESS_MIN;
  var PROGRESS_NEAR_COMPLETE = S.PROGRESS_NEAR_COMPLETE;
  function aggregateBlockedReasons() { return S.aggregateBlockedReasons.apply(this, arguments); }
  function applyItemEstimate() { return S.applyItemEstimate.apply(this, arguments); }
  function applyItemEstimates() { return S.applyItemEstimates.apply(this, arguments); }
  function applyMasterEstimate() { return S.applyMasterEstimate.apply(this, arguments); }
  function averageEstimateFallback() { return S.averageEstimateFallback.apply(this, arguments); }
  function blockedLinksFromCompletion() { return S.blockedLinksFromCompletion.apply(this, arguments); }
  function capturePreviousCompletionBeforeComplete() { return S.capturePreviousCompletionBeforeComplete.apply(this, arguments); }
  function cardPluginScope() { return S.cardPluginScope.apply(this, arguments); }
  function clampEstimatedMinutes() { return S.clampEstimatedMinutes.apply(this, arguments); }
  function clampProgress() { return S.clampProgress.apply(this, arguments); }
  function clearAllBlocked() { return S.clearAllBlocked.apply(this, arguments); }
  function clearPreviousCompletionBeforeComplete() { return S.clearPreviousCompletionBeforeComplete.apply(this, arguments); }
  function computeCardProgress() { return S.computeCardProgress.apply(this, arguments); }
  function computeEstimatedRemaining() { return S.computeEstimatedRemaining.apply(this, arguments); }
  function computeEstimatedTotal() { return S.computeEstimatedTotal.apply(this, arguments); }
  function computeItemsEstimateBase() { return S.computeItemsEstimateBase.apply(this, arguments); }
  function computeWeightedProgress() { return S.computeWeightedProgress.apply(this, arguments); }
  function copyBlockedFields() { return S.copyBlockedFields.apply(this, arguments); }
  function copyEstimateFields() { return S.copyEstimateFields.apply(this, arguments); }
  function copyScheduleFields() { return S.copyScheduleFields.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function detectDonePendingMismatch() { return S.detectDonePendingMismatch.apply(this, arguments); }
  function formatEstimateForScale() { return S.formatEstimateForScale.apply(this, arguments); }
  function formatEstimateForScales() { return S.formatEstimateForScales.apply(this, arguments); }
  function formatEstimatedMinutesCompact() { return S.formatEstimatedMinutesCompact.apply(this, arguments); }
  function formatEstimatedRemainingLabel() { return S.formatEstimatedRemainingLabel.apply(this, arguments); }
  function generateId() { return S.generateId.apply(this, arguments); }
  function getBoardEstimateScales() { return S.getBoardEstimateScales.apply(this, arguments); }
  function getCachedBoardEstimateScales() { return S.getCachedBoardEstimateScales.apply(this, arguments); }
  function getDueCompleteSuppressed() { return S.getDueCompleteSuppressed.apply(this, arguments); }
  function getEstimateScale() { return S.getEstimateScale.apply(this, arguments); }
  function getEstimateScaleTicks() { return S.getEstimateScaleTicks.apply(this, arguments); }
  function getPreviousCompletionBeforeComplete() { return S.getPreviousCompletionBeforeComplete.apply(this, arguments); }
  function hasAnyBlocked() { return S.hasAnyBlocked.apply(this, arguments); }
  function hasBlockedSubtasks() { return S.hasBlockedSubtasks.apply(this, arguments); }
  function isAllSubtasksComplete() { return S.isAllSubtasksComplete.apply(this, arguments); }
  function isItemBlocked() { return S.isItemBlocked.apply(this, arguments); }
  function isLinkedItem() { return S.isLinkedItem.apply(this, arguments); }
  function isMasterBlocked() { return S.isMasterBlocked.apply(this, arguments); }
  function isMasterBlockedByUser() { return S.isMasterBlockedByUser.apply(this, arguments); }
  function itemAggregateEstimateMinutes() { return S.itemAggregateEstimateMinutes.apply(this, arguments); }
  function itemEstimatedMinutes() { return S.itemEstimatedMinutes.apply(this, arguments); }
  function itemHasChecklist() { return S.itemHasChecklist.apply(this, arguments); }
  function itemLinkedCardId() { return S.itemLinkedCardId.apply(this, arguments); }
  function itemProgress() { return S.itemProgress.apply(this, arguments); }
  function itemProgressWeight() { return S.itemProgressWeight.apply(this, arguments); }
  function itemsNeedingEstimate() { return S.itemsNeedingEstimate.apply(this, arguments); }
  function markFullyComplete() { return S.markFullyComplete.apply(this, arguments); }
  function markNotFullyComplete() { return S.markNotFullyComplete.apply(this, arguments); }
  function masterBlockedOrigin() { return S.masterBlockedOrigin.apply(this, arguments); }
  function migrateEstimateFromPriority() { return S.migrateEstimateFromPriority.apply(this, arguments); }
  function nearestEstimateTick() { return S.nearestEstimateTick.apply(this, arguments); }
  function normalizeBlockedReason() { return S.normalizeBlockedReason.apply(this, arguments); }
  function normalizeBlockedReasons() { return S.normalizeBlockedReasons.apply(this, arguments); }
  function normalizeChecklistItem() { return S.normalizeChecklistItem.apply(this, arguments); }
  function normalizeChecklistItems() { return S.normalizeChecklistItems.apply(this, arguments); }
  function normalizeCompletionData() { return S.normalizeCompletionData.apply(this, arguments); }
  function normalizeEstimateScale() { return S.normalizeEstimateScale.apply(this, arguments); }
  function normalizeEstimateScales() { return S.normalizeEstimateScales.apply(this, arguments); }
  function normalizeItem() { return S.normalizeItem.apply(this, arguments); }
  function restoreProgressLeavingComplete() { return S.restoreProgressLeavingComplete.apply(this, arguments); }
  function saveBoardEstimateScales() { return S.saveBoardEstimateScales.apply(this, arguments); }
  function seedBlockedReasonsFromPriority() { return S.seedBlockedReasonsFromPriority.apply(this, arguments); }
  function setCachedBoardEstimateScales() { return S.setCachedBoardEstimateScales.apply(this, arguments); }
  function setDueCompleteSuppressed() { return S.setDueCompleteSuppressed.apply(this, arguments); }
  function setItemBlocked() { return S.setItemBlocked.apply(this, arguments); }
  function setItemBlockedReasons() { return S.setItemBlockedReasons.apply(this, arguments); }
  function setMasterBlocked() { return S.setMasterBlocked.apply(this, arguments); }
  function setMasterBlockedReasons() { return S.setMasterBlockedReasons.apply(this, arguments); }
  function setPreviousCompletionBeforeComplete() { return S.setPreviousCompletionBeforeComplete.apply(this, arguments); }
  function syncCardDueCompleteFromProgress() { return S.syncCardDueCompleteFromProgress.apply(this, arguments); }
  function syncDoneFromProgress() { return S.syncDoneFromProgress.apply(this, arguments); }
  function syncItemChecklistProgress() { return S.syncItemChecklistProgress.apply(this, arguments); }

  /**
   * Master slider: proportionally scale each local item's progress so the
   * estimate-weighted overall approaches targetPercent. Linked board-card
   * items keep their cached remote progress (not scaled here).
   *
   * Must preserve item.blocked / blockedReasons — dropping them mid-drag lets
   * the Statut bridge re-apply the block onto the master task instead.
   * Local items with checklists keep nested items and scale them too.
   */
  function applyMasterProgress(items, targetPercent, snapshotsByCardId) {
    if (!items || !items.length) return [];
    var target = clampProgress(targetPercent);
    var working = items.map(function (item) {
      var copy = {
        id: item.id,
        text: item.text,
        progress: itemProgress(item),
        done: item.done === true,
      };
      var linkedId = itemLinkedCardId(item);
      if (linkedId) copy.linkedCardId = linkedId;
      copyEstimateFields(item, copy);
      copyBlockedFields(item, copy);
      if (!linkedId && itemHasChecklist(item)) {
        copy.items = item.items.map(function (nested) {
          var n = {
            id: nested.id,
            text: nested.text,
            progress: itemProgress(nested),
            done: nested.done === true,
          };
          copyEstimateFields(nested, n);
          syncDoneFromProgress(n);
          return n;
        });
      }
      syncDoneFromProgress(copy);
      return copy;
    });

    if (typeof console !== 'undefined' && console.debug) {
      var blockedBefore = 0;
      var blockedAfter = 0;
      for (var bi = 0; bi < items.length; bi++) {
        if (items[bi] && items[bi].blocked === true) blockedBefore++;
      }
      for (var ba = 0; ba < working.length; ba++) {
        if (working[ba] && working[ba].blocked === true) blockedAfter++;
      }
      if (blockedBefore || blockedAfter) {
        console.debug('[tp-blocked] applyMasterProgress', {
          target: target,
          blockedBefore: blockedBefore,
          blockedAfter: blockedAfter,
          itemCount: items.length,
        });
      }
    }

    var localIndexes = [];
    for (var i = 0; i < working.length; i++) {
      if (!isLinkedItem(working[i])) localIndexes.push(i);
    }

    if (!localIndexes.length) {
      // Only linked items — progress is remote; leave cache as-is.
      return working;
    }

    function applyLocalTarget(idx, localTarget) {
      if (itemHasChecklist(working[idx])) {
        syncItemChecklistProgress(working[idx], localTarget);
      } else {
        working[idx].progress = clampProgress(localTarget);
        syncDoneFromProgress(working[idx]);
      }
    }

    if (target === PROGRESS_MAX) {
      localIndexes.forEach(function (idx) {
        applyLocalTarget(idx, PROGRESS_MAX);
      });
      return working;
    }
    if (target === PROGRESS_MIN) {
      localIndexes.forEach(function (idx) {
        applyLocalTarget(idx, PROGRESS_MIN);
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
        applyLocalTarget(idx, localTarget);
      });
      return working;
    }

    var scale = desiredLocalContrib / localCurrentContrib;
    localIndexes.forEach(function (idx) {
      applyLocalTarget(idx, working[idx].progress * scale);
    });

    return working;
  }

  /**
   * Set one local subtask's progress. With a checklist, scales nested items.
   */
  function applyItemProgress(data, itemId, progress) {
    var id = typeof itemId === 'string' ? itemId : '';
    var normalized = normalizeCompletionData(data);
    if (!id) return normalized;
    var target = clampProgress(progress);
    var found = false;
    normalized.items = normalized.items.map(function (item) {
      if (item.id !== id) return item;
      found = true;
      if (isLinkedItem(item)) return item;
      var next = Object.assign({}, item);
      if (itemHasChecklist(next)) {
        syncItemChecklistProgress(next, target);
      } else {
        next.progress = target;
        syncDoneFromProgress(next);
      }
      return next;
    });
    return found ? normalizeCompletionData(normalized) : normalized;
  }

  function findItemIndex(items, itemId) {
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].id === itemId) return i;
    }
    return -1;
  }

  function applyChecklistItemProgress(data, parentId, nestedId, progress) {
    var pid = typeof parentId === 'string' ? parentId : '';
    var nid = typeof nestedId === 'string' ? nestedId : '';
    var normalized = normalizeCompletionData(data);
    if (!pid || !nid) return normalized;
    var idx = findItemIndex(normalized.items, pid);
    if (idx < 0) return normalized;
    var parent = normalized.items[idx];
    if (isLinkedItem(parent) || !itemHasChecklist(parent)) return normalized;
    var target = clampProgress(progress);
    var nextItems = parent.items.map(function (nested) {
      if (nested.id !== nid) return nested;
      var next = Object.assign({}, nested, { progress: target });
      syncDoneFromProgress(next);
      return next;
    });
    var nextParent = Object.assign({}, parent, { items: nextItems });
    var rolled = computeWeightedProgress(nextItems);
    nextParent.progress = rolled.percent;
    syncDoneFromProgress(nextParent);
    normalized.items = normalized.items.slice();
    normalized.items[idx] = nextParent;
    return normalizeCompletionData(normalized);
  }

  function applyChecklistItemEstimate(data, parentId, nestedId, minutes, options) {
    options = options || {};
    var lock = options.lock !== false;
    var pid = typeof parentId === 'string' ? parentId : '';
    var nid = typeof nestedId === 'string' ? nestedId : '';
    var normalized = normalizeCompletionData(data);
    if (!pid || !nid) return normalized;
    var idx = findItemIndex(normalized.items, pid);
    if (idx < 0) return normalized;
    var parent = normalized.items[idx];
    if (isLinkedItem(parent) || !itemHasChecklist(parent)) return normalized;
    var mins = clampEstimatedMinutes(minutes);
    var found = false;
    var nextItems = parent.items.map(function (nested) {
      if (nested.id !== nid) return nested;
      found = true;
      var next = Object.assign({}, nested);
      if (mins == null) delete next.estimatedMinutes;
      else next.estimatedMinutes = mins;
      if (lock) next.estimatedMinutesLocked = true;
      return next;
    });
    if (!found) return normalized;
    var nextParent = Object.assign({}, parent, { items: nextItems });
    var rolled = computeWeightedProgress(nextItems);
    nextParent.progress = rolled.percent;
    syncDoneFromProgress(nextParent);
    normalized.items = normalized.items.slice();
    normalized.items[idx] = nextParent;
    return normalizeCompletionData(normalized);
  }

  function applyChecklistItemText(data, parentId, nestedId, text) {
    var pid = typeof parentId === 'string' ? parentId : '';
    var nid = typeof nestedId === 'string' ? nestedId : '';
    var normalized = normalizeCompletionData(data);
    if (!pid || !nid) return normalized;
    var idx = findItemIndex(normalized.items, pid);
    if (idx < 0) return normalized;
    var parent = normalized.items[idx];
    if (isLinkedItem(parent) || !itemHasChecklist(parent)) return normalized;
    var nextText = typeof text === 'string' ? text.trim() : '';
    if (nextText.length > ITEM_TEXT_MAX) nextText = nextText.slice(0, ITEM_TEXT_MAX);
    if (!nextText) return normalized;
    var found = false;
    var nextItems = parent.items.map(function (nested) {
      if (nested.id !== nid) return nested;
      found = true;
      return Object.assign({}, nested, { text: nextText });
    });
    if (!found) return normalized;
    normalized.items = normalized.items.slice();
    normalized.items[idx] = Object.assign({}, parent, { items: nextItems });
    return normalizeCompletionData(normalized);
  }

  /**
   * Rename a top-level completion item (local or linked label).
   */
  /**
   * Set (or clear, with empty dates) the Gantt schedule of a local item, or of a checklist item
   * when nestedId is given. parts: { startDate, dueDate, startTime, dueTime }.
   */
  function applyItemDates(data, itemId, nestedId, parts) {
    var id = typeof itemId === 'string' ? itemId : '';
    var nid = typeof nestedId === 'string' ? nestedId : '';
    var normalized = normalizeCompletionData(data);
    if (!id) return normalized;
    var p = parts || {};
    function patch(target) {
      var next = Object.assign({}, target);
      ['startDate', 'dueDate', 'startTime', 'dueTime'].forEach(function (k) {
        delete next[k];
        if (typeof p[k] === 'string' && p[k]) next[k] = p[k];
      });
      return next;
    }
    var idx = findItemIndex(normalized.items, id);
    if (idx < 0) return normalized;
    var item = normalized.items[idx];
    var replacement;
    if (nid) {
      if (isLinkedItem(item) || !itemHasChecklist(item)) return normalized;
      var found = false;
      var nested = item.items.map(function (n) {
        if (n.id !== nid) return n;
        found = true;
        return patch(n);
      });
      if (!found) return normalized;
      replacement = Object.assign({}, item, { items: nested });
    } else {
      if (isLinkedItem(item)) return normalized;
      replacement = patch(item);
    }
    normalized.items = normalized.items.slice();
    normalized.items[idx] = replacement;
    return normalizeCompletionData(normalized);
  }

  function applyItemText(data, itemId, text) {
    var id = typeof itemId === 'string' ? itemId : '';
    var normalized = normalizeCompletionData(data);
    if (!id) return normalized;
    var nextText = typeof text === 'string' ? text.trim() : '';
    if (nextText.length > ITEM_TEXT_MAX) nextText = nextText.slice(0, ITEM_TEXT_MAX);
    if (!nextText) return normalized;
    var found = false;
    normalized.items = normalized.items.map(function (item) {
      if (!item || item.id !== id) return item;
      found = true;
      return Object.assign({}, item, { text: nextText });
    });
    return found ? normalizeCompletionData(normalized) : normalized;
  }

  /** Append a top-level local subtask to a card's completion data. */
  function addLocalItem(data, text) {
    var normalized = normalizeCompletionData(data);
    var item = normalizeItem({ id: generateId(), text: text, progress: PROGRESS_MIN });
    if (!item) return { data: normalized, item: null };
    return {
      data: normalizeCompletionData(
        Object.assign({}, normalized, { items: normalized.items.concat([item]) })
      ),
      item: item,
    };
  }

  function addChecklistItem(data, parentId, text, opts) {
    opts = opts || {};
    var pid = typeof parentId === 'string' ? parentId : '';
    var normalized = normalizeCompletionData(data);
    if (!pid) return { data: normalized, item: null };
    var idx = findItemIndex(normalized.items, pid);
    if (idx < 0) return { data: normalized, item: null };
    var parent = normalized.items[idx];
    if (isLinkedItem(parent)) return { data: normalized, item: null };
    var child = normalizeChecklistItem({
      id: generateId(),
      text: text,
      progress:
        opts.done === true || opts.progress === PROGRESS_MAX
          ? PROGRESS_MAX
          : typeof opts.progress === 'number'
            ? opts.progress
            : PROGRESS_MIN,
      estimatedMinutes: opts.estimatedMinutes,
    });
    if (!child) return { data: normalized, item: null };
    var nextItems = (parent.items || []).concat([child]);
    var nextParent = Object.assign({}, parent, { items: nextItems });
    var rolled = computeWeightedProgress(nextItems);
    nextParent.progress = rolled.percent;
    syncDoneFromProgress(nextParent);
    if (nextParent.done) {
      delete nextParent.blocked;
      delete nextParent.blockedReasons;
    }
    normalized.items = normalized.items.slice();
    normalized.items[idx] = nextParent;
    return {
      data: normalizeCompletionData(normalized),
      item: child,
    };
  }

  function removeChecklistItem(data, parentId, nestedId) {
    var pid = typeof parentId === 'string' ? parentId : '';
    var nid = typeof nestedId === 'string' ? nestedId : '';
    var normalized = normalizeCompletionData(data);
    if (!pid || !nid) return normalized;
    var idx = findItemIndex(normalized.items, pid);
    if (idx < 0) return normalized;
    var parent = normalized.items[idx];
    if (isLinkedItem(parent) || !Array.isArray(parent.items)) return normalized;
    var nextItems = parent.items.filter(function (nested) {
      return nested.id !== nid;
    });
    if (nextItems.length === parent.items.length) return normalized;
    var nextParent = Object.assign({}, parent);
    if (nextItems.length) {
      nextParent.items = nextItems;
      var rolled = computeWeightedProgress(nextItems);
      nextParent.progress = rolled.percent;
      syncDoneFromProgress(nextParent);
    } else {
      delete nextParent.items;
      // Keep last derived progress as editable leaf progress.
      syncDoneFromProgress(nextParent);
    }
    normalized.items = normalized.items.slice();
    normalized.items[idx] = nextParent;
    return normalizeCompletionData(normalized);
  }

  function locateStep(items, id) {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item) continue;
      if (item.id === id) return { item: item, parent: null, index: i };
      var kids = item.items || [];
      for (var j = 0; j < kids.length; j++) {
        if (kids[j] && kids[j].id === id) return { item: kids[j], parent: item, index: j };
      }
    }
    return null;
  }

  function stepPayload(item) {
    var raw = { id: item.id, text: item.text, progress: item.progress };
    copyEstimateFields(item, raw);
    copyScheduleFields(item, raw);
    return raw;
  }

  /**
   * Move a step under another top-level step (parentId) or back to the top (parentId null).
   * Checklist items cannot hold a link, a block, or their own children.
   */
  function attachStep(data, nodeId, parentId) {
    var id = typeof nodeId === 'string' ? nodeId : '';
    var pid = parentId == null || parentId === '' ? '' : String(parentId);
    var normalized = normalizeCompletionData(data);
    if (!id) return { data: normalized, ok: false, reason: 'missing-id' };
    var loc = locateStep(normalized.items, id);
    if (!loc) return { data: normalized, ok: false, reason: 'no-item' };
    var currentParent = loc.parent ? loc.parent.id : '';
    if (currentParent === pid) return { data: normalized, ok: false, reason: 'same' };
    if (pid) {
      if (pid === id) return { data: normalized, ok: false, reason: 'cycle' };
      var parent = null;
      for (var p = 0; p < normalized.items.length; p++) {
        if (normalized.items[p].id === pid) parent = normalized.items[p];
      }
      if (!parent) return { data: normalized, ok: false, reason: 'no-parent' };
      if (isLinkedItem(parent)) return { data: normalized, ok: false, reason: 'parent-linked' };
      if (!loc.parent) {
        if (isLinkedItem(loc.item)) return { data: normalized, ok: false, reason: 'linked' };
        if (itemHasChecklist(loc.item)) return { data: normalized, ok: false, reason: 'has-children' };
        if (loc.item.blocked) return { data: normalized, ok: false, reason: 'blocked' };
      }
    }

    var items = normalized.items.map(function (item) {
      return Object.assign({}, item, item.items ? { items: item.items.slice() } : {});
    });
    if (loc.parent) {
      var oldIdx = findItemIndex(items, loc.parent.id);
      if (oldIdx < 0) return { data: normalized, ok: false, reason: 'no-item' };
      var old = items[oldIdx];
      var kids = (old.items || []).filter(function (child) { return child.id !== id; });
      if (kids.length) {
        old.items = kids;
        var rolled = computeWeightedProgress(kids);
        old.progress = rolled.percent;
        syncDoneFromProgress(old);
      } else {
        delete old.items;
        syncDoneFromProgress(old);
      }
    } else {
      items = items.filter(function (item) { return item.id !== id; });
    }

    if (!pid) {
      items.push(normalizeItem(stepPayload(loc.item)));
    } else {
      var destIdx = findItemIndex(items, pid);
      if (destIdx < 0) return { data: normalized, ok: false, reason: 'no-parent' };
      var dest = items[destIdx];
      var child = normalizeChecklistItem(stepPayload(loc.item));
      if (!child) return { data: normalized, ok: false, reason: 'invalid' };
      dest.items = (dest.items || []).concat([child]);
      var rolledDest = computeWeightedProgress(dest.items);
      dest.progress = rolledDest.percent;
      syncDoneFromProgress(dest);
      if (dest.done) {
        delete dest.blocked;
        delete dest.blockedReasons;
      }
    }
    return {
      data: normalizeCompletionData(Object.assign({}, normalized, { items: items })),
      ok: true,
    };
  }

  /**
   * Child cardCompletion payload when promoting a local subtask to a real card.
   */
  function buildChildCompletionFromSubtask(item) {
    if (!item || typeof item !== 'object') {
      return normalizeCompletionData({ items: [] });
    }
    if (itemHasChecklist(item)) {
      return normalizeCompletionData({ items: item.items.slice() });
    }
    var out = {
      items: [],
      progress: itemProgress(item),
    };
    copyEstimateFields(item, out);
    return normalizeCompletionData(out);
  }

  /**
   * Replace a local subtask with a linkedCardId item (drops checklist / local progress).
   */
  function replaceSubtaskWithLinkedCard(data, itemId, childCardId) {
    var id = typeof itemId === 'string' ? itemId.trim() : '';
    var childId = typeof childCardId === 'string' ? childCardId.trim() : '';
    var normalized = normalizeCompletionData(data);
    if (!id || !childId) return { data: normalized, ok: false, reason: 'missing-id' };
    var found = false;
    var progressCache = 0;
    normalized.items = normalized.items.map(function (item) {
      if (item.id !== id) return item;
      found = true;
      progressCache = itemProgress(item);
      var linked = normalizeItem({
        id: item.id,
        text: item.text,
        progress: progressCache,
        linkedCardId: childId,
      });
      return linked || item;
    });
    if (!found) return { data: normalized, ok: false, reason: 'no-item' };
    return {
      data: normalizeCompletionData(normalized),
      ok: true,
      progress: progressCache,
    };
  }

  /**
   * Create a Trello card from a local subtask (same list as parent) and link it.
   */
  async function promoteSubtaskToCard(t, itemId, options) {
    options = options || {};
    var id = typeof itemId === 'string' ? itemId.trim() : '';
    if (!id) return { ok: false, reason: 'no-item-id', changed: false };

    var normalized = await getCardCompletion(t);
    var item = null;
    for (var i = 0; i < normalized.items.length; i++) {
      if (normalized.items[i].id === id) {
        item = normalized.items[i];
        break;
      }
    }
    if (!item) return { ok: false, reason: 'no-item', changed: false };
    if (isLinkedItem(item)) return { ok: false, reason: 'already-linked', changed: false };

    var PT = global.PriorityTrello;
    if (!PT || typeof PT.createCard !== 'function') {
      return { ok: false, reason: 'no-createCard', changed: false };
    }

    var createResult = await PT.createCard(t, {
      name: item.text,
      idList: options.idList,
      pos: options.pos || 'bottom',
    });
    if (!createResult || !createResult.ok) {
      return {
        ok: false,
        reason: (createResult && createResult.reason) || 'create-failed',
        changed: false,
        result: createResult,
      };
    }

    var childId =
      (createResult.cardId && String(createResult.cardId)) ||
      (createResult.card && createResult.card.id
        ? String(createResult.card.id)
        : '');
    if (!childId) {
      return { ok: false, reason: 'no-card-id', changed: false, result: createResult };
    }

    var childCompletion = buildChildCompletionFromSubtask(item);
    await saveCardCompletionById(t, childId, childCompletion);

    var replaced = replaceSubtaskWithLinkedCard(normalized, id, childId);
    if (!replaced.ok) {
      return {
        ok: false,
        reason: replaced.reason || 'replace-failed',
        changed: false,
        cardId: childId,
        childCompletion: childCompletion,
      };
    }

    var saved = await saveCardCompletion(t, replaced.data);
    dbgLog('completionTrello', 'promoteSubtaskToCard', {
      itemId: id,
      cardId: childId,
      hadChecklist: itemHasChecklist(item),
    });
    return {
      ok: true,
      changed: true,
      cardId: childId,
      card: createResult.card || null,
      data: saved,
      childCompletion: childCompletion,
    };
  }

  async function getCardCompletion(t) {
    var stored = await t.get(await cardPluginScope(t), 'shared', CARD_COMPLETION_KEY);
    return normalizeCompletionData(stored);
  }

  async function getCardCompletionById(t, cardId) {
    var id = typeof cardId === 'string' ? cardId.trim() : '';
    if (!id) return normalizeCompletionData({ items: [] });
    try {
      var stored = await t.get(id, 'shared', CARD_COMPLETION_KEY);
      return normalizeCompletionData(stored);
    } catch (err) {
      dbgError('completionTrello', 'getCardCompletionById', err);
      return normalizeCompletionData({ items: [] });
    }
  }

  async function saveCardCompletion(t, data) {
    var normalized = normalizeCompletionData(data);
    var progress = computeCardProgress(normalized);
    dbgLog('completionTrello', 'save', {
      itemCount: normalized.items.length,
      progress: progress.percent,
    });
    await t.set(await cardPluginScope(t), 'shared', CARD_COMPLETION_KEY, normalized);
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
        dbgError('completionTrello', 'findParentCards.scan', err);
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
        dbgError('completionTrello', 'findParentCards.cards', err);
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

  // exports
  S.addChecklistItem = addChecklistItem;
  S.addLocalItem = addLocalItem;
  S.applyChecklistItemEstimate = applyChecklistItemEstimate;
  S.applyChecklistItemProgress = applyChecklistItemProgress;
  S.applyChecklistItemText = applyChecklistItemText;
  S.applyItemDates = applyItemDates;
  S.applyItemProgress = applyItemProgress;
  S.applyItemText = applyItemText;
  S.applyMasterProgress = applyMasterProgress;
  S.attachStep = attachStep;
  S.buildChildCompletionFromSubtask = buildChildCompletionFromSubtask;
  S.completionLinksToCard = completionLinksToCard;
  S.ensureLinkedChildInCompletion = ensureLinkedChildInCompletion;
  S.findItemIndex = findItemIndex;
  S.findParentCards = findParentCards;
  S.getCardCompletion = getCardCompletion;
  S.getCardCompletionById = getCardCompletionById;
  S.isLinkedDescendantOf = isLinkedDescendantOf;
  S.locateStep = locateStep;
  S.promoteSubtaskToCard = promoteSubtaskToCard;
  S.removeChecklistItem = removeChecklistItem;
  S.removeLinkedChildFromCompletion = removeLinkedChildFromCompletion;
  S.replaceSubtaskWithLinkedCard = replaceSubtaskWithLinkedCard;
  S.saveCardCompletion = saveCardCompletion;
  S.saveCardCompletionById = saveCardCompletionById;
  S.stepPayload = stepPayload;
})(typeof window !== 'undefined' ? window : this);
