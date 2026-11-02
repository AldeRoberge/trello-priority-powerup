/**
 * completion-trello: part 2 of 2 (applyMasterProgress).
 * Names are shared with the other parts through window.CompletionTrelloParts (see completion-trello.parts.json for the load order).
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

  /**
   * Add, remove, or clear parent link(s) for childCardId by mutating parents'
   * cardCompletion linked items.
   *
   * - parentCardId set → add that parent (keeps existing parents unless
   *   opts.replace is true).
   * - parentCardId null/'' + opts.removeParentId → remove that one parent.
   * - parentCardId null/'' without removeParentId → clear all parents.
   *
   * @param {object} t
   * @param {string} childCardId
   * @param {string|null} parentCardId
   * @param {{
   *   childName?: string,
   *   childProgress?: number,
   *   maxCards?: number,
   *   replace?: boolean,
   *   removeParentId?: string,
   *   parentName?: string,
   *   parentList?: string,
   *   cards?: Array
   * }} [opts]
   * @returns {Promise<{
   *   ok: boolean,
   *   reason?: string,
   *   parent?: object|null,
   *   parents?: Array,
   *   parentsRemoved?: number
   * }>}
   */
  async function setParentCard(t, childCardId, parentCardId, opts) {
    opts = opts || {};
    var childId = typeof childCardId === 'string' ? childCardId.trim() : '';
    var nextParentId =
      parentCardId == null || parentCardId === ''
        ? ''
        : String(parentCardId).trim();
    var removeOnlyId =
      typeof opts.removeParentId === 'string' && opts.removeParentId.trim()
        ? opts.removeParentId.trim()
        : '';
    var replaceAll = !!opts.replace;
    if (!childId) {
      dbgLog('completionTrello', 'setParentCard', { outcome: 'reject', reason: 'no-child' });
      return { ok: false, reason: 'no-child' };
    }
    if (nextParentId && nextParentId === childId) {
      dbgLog('completionTrello', 'setParentCard', { outcome: 'reject', reason: 'self' });
      return { ok: false, reason: 'self' };
    }

    if (nextParentId) {
      var cycle = await isLinkedDescendantOf(
        t,
        childId,
        nextParentId,
        LINK_NEST_MAX_DEPTH
      );
      if (cycle) {
        dbgLog('completionTrello', 'setParentCard', { outcome: 'cycle-reject' });
        return { ok: false, reason: 'cycle' };
      }
    }

    var existingParents = await findParentCards(t, childId, {
      maxCards: opts.maxCards,
      cards: opts.cards,
    });
    var parentsRemoved = 0;
    var touchIds = Object.create(null);

    if (nextParentId) {
      // Add (default) or replace: touch new parent + optionally strip others.
      touchIds[nextParentId] = true;
      if (replaceAll) {
        existingParents.forEach(function (p) {
          if (p && p.id && p.id !== nextParentId) touchIds[p.id] = true;
        });
      }
    } else if (removeOnlyId) {
      touchIds[removeOnlyId] = true;
    } else {
      // Clear all.
      existingParents.forEach(function (p) {
        if (p && p.id) touchIds[p.id] = true;
      });
    }

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
      var nextData = data;
      var stripped = { removed: 0 };

      if (nextParentId) {
        if (replaceAll && pid !== nextParentId) {
          stripped = removeLinkedChildFromCompletion(data, childId);
          nextData = stripped.data;
          if (stripped.removed) parentsRemoved += stripped.removed;
        } else if (pid === nextParentId) {
          var ensured = ensureLinkedChildInCompletion(nextData, childId, {
            text: childName,
            progress: childProgress,
          });
          nextData = ensured.data;
        }
      } else {
        // Remove one or clear all — strip this parent.
        stripped = removeLinkedChildFromCompletion(data, childId);
        nextData = stripped.data;
        if (stripped.removed) parentsRemoved += stripped.removed;
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

    var parentsAfter = await findParentCards(t, childId, {
      maxCards: opts.maxCards,
      cards: opts.cards,
    });

    var parentOutcome;
    if (nextParentId) {
      parentOutcome = replaceAll ? 'replace' : 'add';
    } else if (removeOnlyId) {
      parentOutcome = 'remove';
    } else {
      parentOutcome = 'clear';
    }
    dbgLog('completionTrello', 'setParentCard', {
      outcome: parentOutcome,
      parentsAfterCount: parentsAfter.length,
      parentsRemoved: parentsRemoved,
    });

    return {
      ok: true,
      parent: parentMeta,
      parents: parentsAfter,
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
      copyBlockedFields(item, next);
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
    var startMs = Date.now();
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
    var cycleCount = 0;
    var missingCount = 0;
    function countTreeFlags(node) {
      if (!node) return;
      if (node.isCycle) cycleCount += 1;
      if (node.missing) missingCount += 1;
      var children = node.children || [];
      for (var ci = 0; ci < children.length; ci++) {
        countTreeFlags(children[ci]);
      }
    }
    Object.keys(byItemId).forEach(function (itemId) {
      countTreeFlags(byItemId[itemId]);
    });
    dbgLog('completionTrello', 'resolveLinkedTree', {
      cardCount: Object.keys(snapshots).length,
      maxDepth: maxDepth,
      cycleCount: cycleCount,
      missingCount: missingCount,
      durationMs: Date.now() - startMs,
    });
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
        S.boardCompletionColorSchemeKey = key;
        UI.applyCompletionGradient(stops, key);
        return S.boardCompletionColorSchemeKey;
      }
      if (typeof storedKey === 'string') {
        S.boardCompletionColorSchemeKey = UI.normalizeCompletionSchemeKey(storedKey);
        UI.applyCompletionColorScheme(S.boardCompletionColorSchemeKey);
        return S.boardCompletionColorSchemeKey;
      }
    } catch (err) {
      console.error('Completion board color scheme load failed', err);
    }
    var fromLocalGradient = UI.loadStoredCompletionGradient && UI.loadStoredCompletionGradient();
    if (fromLocalGradient && fromLocalGradient.length >= 2) {
      var localKey = UI.loadStoredCompletionSchemeKey() || UI.CUSTOM_COMPLETION_SCHEME_KEY;
      S.boardCompletionColorSchemeKey = UI.normalizeCompletionSchemeKey(localKey);
      UI.applyCompletionGradient(fromLocalGradient, S.boardCompletionColorSchemeKey);
      return S.boardCompletionColorSchemeKey;
    }
    var fromLocal = UI.loadStoredCompletionSchemeKey();
    S.boardCompletionColorSchemeKey = fromLocal || UI.DEFAULT_COMPLETION_SCHEME_KEY || 'traffic';
    UI.applyCompletionColorScheme(S.boardCompletionColorSchemeKey);
    return S.boardCompletionColorSchemeKey;
  }

  async function saveBoardCompletionColorScheme(t, schemeKey) {
    if (typeof global.CompletionUI === 'undefined') return 'traffic';
    var UI = global.CompletionUI;
    var key = UI.normalizeCompletionSchemeKey(schemeKey);
    UI.applyCompletionColorScheme(key);
    var stops = UI.getActiveCompletionGradient();
    S.boardCompletionColorSchemeKey = key;
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
    S.boardCompletionColorSchemeKey = key;
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
    return S.boardCompletionColorSchemeKey;
  }

  function getCachedBoardCompletionColorSchemeKey() {
    return S.boardCompletionColorSchemeKey || 'traffic';
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

  function cardFaceBadges(_t) {
    // Progress is shown on the Priority face badge (combined). No separate face badge.
    return Promise.resolve([]);
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

  /** Trello card id on a row. Tree ids (`card:…`, `section:…`) are not card ids. */
  function cardIdOf(row) {
    if (!row || typeof row !== 'object') return '';
    var card = row.cardId != null ? String(row.cardId).trim() : '';
    if (card) return card;
    var id = row.id != null ? String(row.id).trim() : '';
    if (!id || id.indexOf('section:') === 0 || id.indexOf('card:') === 0) return '';
    return id;
  }

  /** The card and every linked subtask under it (and nested cards), each id once. */
  function collectProgressCardIds(rows) {
    var ids = [];
    var seen = Object.create(null);
    function add(id) {
      id = id == null ? '' : String(id).trim();
      if (!id || seen[id]) return;
      seen[id] = true;
      ids.push(id);
    }
    function walk(list) {
      (list || []).forEach(function (it) {
        if (!it || typeof it !== 'object') return;
        var linked = it.linkedCardId != null ? String(it.linkedCardId).trim() : '';
        if (linked) add(linked);
        if (it.kind === 'card' && it.cardId) add(String(it.cardId).trim());
        if (it.items) walk(it.items);
        if (it.children) walk(it.children);
      });
    }
    (rows || []).forEach(function (row) {
      add(cardIdOf(row));
      if (!row) return;
      walk(row.items);
      walk(row.children);
    });
    return ids;
  }

  /** A click on a parent progress ring: 100 % reopens, anything else finishes. */
  function parentClickPercent(progress) {
    var n = Number(progress);
    return isFinite(n) && n >= PROGRESS_MAX ? PROGRESS_MIN : PROGRESS_MAX;
  }

  function stampLinkedProgress(items, pct) {
    return (items || []).map(function (it) {
      if (!it) return it;
      var copy = Object.assign({}, it);
      if (itemLinkedCardId(copy)) {
        copy.progress = pct;
        copy.done = pct >= PROGRESS_MAX;
        if (copy.done) {
          delete copy.blocked;
          delete copy.blockedReasons;
        }
      }
      if (copy.items) copy.items = stampLinkedProgress(copy.items, pct);
      return copy;
    });
  }

  /**
   * Next completion payload for one card. At 0 % or 100 % linked subtasks are
   * stamped to the same value and their card ids are returned so the caller
   * can write those cards too. A partial % leaves linked cards alone.
   */
  function prepareProgressWrite(data, pct) {
    var normalized = normalizeCompletionData(data || { items: [] });
    var target = clampProgress(pct);
    var follow = target === PROGRESS_MIN || target === PROGRESS_MAX;
    var linked = [];
    var seen = Object.create(null);
    if (follow) {
      (function walk(items) {
        (items || []).forEach(function (it) {
          if (!it) return;
          var id = itemLinkedCardId(it);
          if (id && !seen[id]) {
            seen[id] = true;
            linked.push(id);
          }
          walk(it.items);
        });
      })(normalized.items);
    }
    var items = normalized.items && normalized.items.length
      ? applyMasterProgress(normalized.items, target)
      : null;
    if (items && follow) items = stampLinkedProgress(items, target);
    var next = items
      ? Object.assign({}, normalized, { items: items })
      : Object.assign({}, normalized, { progress: target });
    return { data: normalizeCompletionData(next), linked: linked };
  }

  /** Writes `pct` on every card in `rows` and, at 0 % or 100 %, on linked subtasks. */
  function saveProgressTree(t, rows, pct) {
    var queue = collectProgressCardIds(rows);
    var seen = Object.create(null);
    var saved = [];
    queue.forEach(function (id) { seen[id] = true; });
    var target = clampProgress(pct);
    function run() {
      if (!queue.length) return Promise.resolve(saved.slice());
      var id = queue.shift();
      saved.push(id);
      return getCardCompletionById(t, id).then(function (data) {
        var prep = prepareProgressWrite(data, target);
        (prep.linked || []).forEach(function (linked) {
          if (seen[linked]) return;
          seen[linked] = true;
          queue.push(linked);
        });
        return saveCardCompletionById(t, id, prep.data);
      }).then(run);
    }
    return run();
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
    COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY: COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY,
    PROGRESS_NEAR_COMPLETE: PROGRESS_NEAR_COMPLETE,
    ITEM_TEXT_MAX: ITEM_TEXT_MAX,
    PROGRESS_MIN: PROGRESS_MIN,
    PROGRESS_MAX: PROGRESS_MAX,
    LINK_NEST_MAX_DEPTH: LINK_NEST_MAX_DEPTH,
    clampProgress: clampProgress,
    itemProgress: itemProgress,
    itemLinkedCardId: itemLinkedCardId,
    isLinkedItem: isLinkedItem,
    itemHasChecklist: itemHasChecklist,
    syncDoneFromProgress: syncDoneFromProgress,
    syncItemChecklistProgress: syncItemChecklistProgress,
    generateId: generateId,
    isItemBlocked: isItemBlocked,
    isMasterBlocked: isMasterBlocked,
    masterBlockedOrigin: masterBlockedOrigin,
    isMasterBlockedByUser: isMasterBlockedByUser,
    hasBlockedSubtasks: hasBlockedSubtasks,
    hasAnyBlocked: hasAnyBlocked,
    normalizeBlockedReason: normalizeBlockedReason,
    normalizeBlockedReasons: normalizeBlockedReasons,
    aggregateBlockedReasons: aggregateBlockedReasons,
    setMasterBlocked: setMasterBlocked,
    setMasterBlockedReasons: setMasterBlockedReasons,
    setItemBlocked: setItemBlocked,
    setItemBlockedReasons: setItemBlockedReasons,
    clearAllBlocked: clearAllBlocked,
    blockedLinksFromCompletion: blockedLinksFromCompletion,
    seedBlockedReasonsFromPriority: seedBlockedReasonsFromPriority,
    normalizeItem: normalizeItem,
    normalizeChecklistItem: normalizeChecklistItem,
    normalizeChecklistItems: normalizeChecklistItems,
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
    itemAggregateEstimateMinutes: itemAggregateEstimateMinutes,
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
    restoreProgressLeavingComplete: restoreProgressLeavingComplete,
    getPreviousCompletionBeforeComplete: getPreviousCompletionBeforeComplete,
    setPreviousCompletionBeforeComplete: setPreviousCompletionBeforeComplete,
    clearPreviousCompletionBeforeComplete: clearPreviousCompletionBeforeComplete,
    capturePreviousCompletionBeforeComplete: capturePreviousCompletionBeforeComplete,
    setDueCompleteSuppressed: setDueCompleteSuppressed,
    getDueCompleteSuppressed: getDueCompleteSuppressed,
    syncCardDueCompleteFromProgress: syncCardDueCompleteFromProgress,
    applyMasterProgress: applyMasterProgress,
    collectProgressCardIds: collectProgressCardIds,
    parentClickPercent: parentClickPercent,
    prepareProgressWrite: prepareProgressWrite,
    saveProgressTree: saveProgressTree,
    applyItemProgress: applyItemProgress,
    applyChecklistItemProgress: applyChecklistItemProgress,
    applyChecklistItemEstimate: applyChecklistItemEstimate,
    applyChecklistItemText: applyChecklistItemText,
    applyItemText: applyItemText,
    applyItemDates: applyItemDates,
    addChecklistItem: addChecklistItem,
    addLocalItem: addLocalItem,
    removeChecklistItem: removeChecklistItem,
    attachStep: attachStep,
    buildChildCompletionFromSubtask: buildChildCompletionFromSubtask,
    replaceSubtaskWithLinkedCard: replaceSubtaskWithLinkedCard,
    promoteSubtaskToCard: promoteSubtaskToCard,
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

  // exports
  S.addChecklistItem = addChecklistItem;
  S.addLocalItem = addLocalItem;
  S.applyChecklistItemEstimate = applyChecklistItemEstimate;
  S.applyChecklistItemProgress = applyChecklistItemProgress;
  S.applyChecklistItemText = applyChecklistItemText;
  S.applyItemDates = applyItemDates;
  S.applyItemProgress = applyItemProgress;
  S.applyItemText = applyItemText;
  S.applyLinkedSnapshots = applyLinkedSnapshots;
  S.applyMasterProgress = applyMasterProgress;
  S.attachStep = attachStep;
  S.buildCardFaceBadge = buildCardFaceBadge;
  S.buildChildCompletionFromSubtask = buildChildCompletionFromSubtask;
  S.cardDetailBadges = cardDetailBadges;
  S.cardFaceBadges = cardFaceBadges;
  S.cardIdOf = cardIdOf;
  S.collectProgressCardIds = collectProgressCardIds;
  S.completionLinksToCard = completionLinksToCard;
  S.dynamicCardFaceBadge = dynamicCardFaceBadge;
  S.ensureLinkedChildInCompletion = ensureLinkedChildInCompletion;
  S.faceBadgeColor = faceBadgeColor;
  S.findItemIndex = findItemIndex;
  S.findParentCards = findParentCards;
  S.formatDetailBadgeText = formatDetailBadgeText;
  S.formatFaceBadgeText = formatFaceBadgeText;
  S.getBadgeData = getBadgeData;
  S.getBoardCompletionColorScheme = getBoardCompletionColorScheme;
  S.getBoardCompletionGradient = getBoardCompletionGradient;
  S.getCachedBoardCompletionColorSchemeKey = getCachedBoardCompletionColorSchemeKey;
  S.getCardCompletion = getCardCompletion;
  S.getCardCompletionById = getCardCompletionById;
  S.getCardName = getCardName;
  S.initIframePage = initIframePage;
  S.isLinkedDescendantOf = isLinkedDescendantOf;
  S.locateStep = locateStep;
  S.pageUrl = pageUrl;
  S.parentClickPercent = parentClickPercent;
  S.preloadBoardCompletionContext = preloadBoardCompletionContext;
  S.prepareProgressWrite = prepareProgressWrite;
  S.promoteSubtaskToCard = promoteSubtaskToCard;
  S.removeChecklistItem = removeChecklistItem;
  S.removeLinkedChildFromCompletion = removeLinkedChildFromCompletion;
  S.replaceSubtaskWithLinkedCard = replaceSubtaskWithLinkedCard;
  S.resolveLinkedCompletionTree = resolveLinkedCompletionTree;
  S.saveBoardCompletionColorScheme = saveBoardCompletionColorScheme;
  S.saveBoardCompletionGradient = saveBoardCompletionGradient;
  S.saveCardCompletion = saveCardCompletion;
  S.saveCardCompletionById = saveCardCompletionById;
  S.saveProgressTree = saveProgressTree;
  S.setParentCard = setParentCard;
  S.stampLinkedProgress = stampLinkedProgress;
  S.stepPayload = stepPayload;
  S.withBadgeRefresh = withBadgeRefresh;
})(typeof window !== 'undefined' ? window : this);
