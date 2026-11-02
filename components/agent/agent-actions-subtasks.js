/**
 * AI agent actions: subtasks and checklists
 *
 * Tools that add, rename, remove, complete or estimate subtasks and checklist items.
 * Each tool registers one handler through registerAction (agent-base.js); executeAction in
 * agent-actions.js looks the tool up. A handler gets (bridge, action, tool, args) and returns the result object.
 * Part of the agent (see agent.parts.json); names are shared through window.PriorityAgentParts.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var TOOL_LABELS = S.TOOL_LABELS;

  // from other parts (functions, resolved at call time)
  function clampInt() { return S.clampInt.apply(this, arguments); }
  function detailForTool() { return S.detailForTool.apply(this, arguments); }
  function fallbackBlockedReasonPair() { return S.fallbackBlockedReasonPair.apply(this, arguments); }
  function findExistingSubtaskByText() { return S.findExistingSubtaskByText.apply(this, arguments); }
  function firstNonEmptyString() { return S.firstNonEmptyString.apply(this, arguments); }
  function getPeopleFromBridge() { return S.getPeopleFromBridge.apply(this, arguments); }
  function getPlacesFromBridge() { return S.getPlacesFromBridge.apply(this, arguments); }
  function isPureWaitingOnTaskReason() { return S.isPureWaitingOnTaskReason.apply(this, arguments); }
  function registerAction() { return S.registerAction.apply(this, arguments); }
  function resolveAliasesInText() { return S.resolveAliasesInText.apply(this, arguments); }
  function resolveChecklistChild() { return S.resolveChecklistChild.apply(this, arguments); }
  function resolveChecklistParent() { return S.resolveChecklistParent.apply(this, arguments); }
  function resolveEstimateMinutesArg() { return S.resolveEstimateMinutesArg.apply(this, arguments); }
  function resolvePeopleInReason() { return S.resolvePeopleInReason.apply(this, arguments); }
  function resolveSubtaskItem() { return S.resolveSubtaskItem.apply(this, arguments); }
  function snapshotCompletion() { return S.snapshotCompletion.apply(this, arguments); }
  function suggestBlockedReasonPair() { return S.suggestBlockedReasonPair.apply(this, arguments); }

  function registerAction() { return S.registerAction.apply(this, arguments); }

  // add_subtask
  registerAction(['add_subtask'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyCompletion !== 'function') {
      return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
    }
    var text =
      typeof args.text === 'string'
        ? args.text.trim()
        : firstNonEmptyString(args.title, args.name, args.label);
    if (!text) {
      return { ok: false, tool: tool, error: 'Texte de sous-t\u00e2che requis' };
    }
    var peopleForSubtask = getPeopleFromBridge(bridge);
    var placesForSubtask = getPlacesFromBridge(bridge);
    text = resolveAliasesInText(text, peopleForSubtask, placesForSubtask);
    var beforeAdd = snapshotCompletion(bridge);
    var data =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var items = (data.items || []).slice();
    var existingAdd = findExistingSubtaskByText(items, text);
    var addDone = !!args.done;
    var addBlocked = !addDone && !!args.blocked;
    if (existingAdd) {
      var existingId = existingAdd.id;
      if (addDone && !existingAdd.done) {
        var doneItems = items.map(function (item) {
          if (item.id !== existingId) return item;
          var copy = Object.assign({}, item);
          copy.done = true;
          copy.progress = 100;
          delete copy.blocked;
          return copy;
        });
        var donePayload = Object.assign({}, data, { items: doneItems });
        if (donePayload.progressEnabled === false) {
          delete donePayload.progressEnabled;
        }
        bridge.applyCompletion(donePayload);
        var afterDone = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.toggle_subtask,
          id: existingId,
          detail: detailForTool(
            'toggle_subtask',
            null,
            null,
            beforeAdd,
            afterDone,
            { id: existingId, done: true },
            { id: existingId }
          )
        };
      }
      if (
        addBlocked &&
        !existingAdd.done &&
        !existingAdd.blocked &&
        typeof CompletionTrello !== 'undefined' &&
        typeof CompletionTrello.setItemBlocked === 'function'
      ) {
        var blockedNext = CompletionTrello.setItemBlocked(
          data,
          existingId,
          true
        );
        bridge.applyCompletion(blockedNext);
        if (typeof bridge.applyPriority === 'function') {
          var blockedPriExisting = { enAttente: true };
          blockedPriExisting.blockedLinks =
            CompletionTrello.blockedLinksFromCompletion
              ? CompletionTrello.blockedLinksFromCompletion(blockedNext)
              : [{ type: 'subtask', id: existingId, label: text }];
          bridge.applyPriority(blockedPriExisting);
        }
        var afterBlocked = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_subtask_blocked,
          id: existingId,
          detail: detailForTool(
            'set_subtask_blocked',
            null,
            null,
            beforeAdd,
            afterBlocked,
            { id: existingId, blocked: true },
            { id: existingId, blocked: true }
          )
        };
      }
      return {
        ok: true,
        skipped: true,
        tool: tool,
        args: args,
        id: existingId,
        detail: '"' + text + '" d\u00e9j\u00e0 pr\u00e9sente'
      };
    }
    var id =
      'agent-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 8);
    var newItem = {
      id: id,
      text: text,
      done: addDone,
      progress: addDone ? 100 : 0
    };
    if (addBlocked) newItem.blocked = true;
    var addEst = resolveEstimateMinutesArg(args);
    if (addEst != null) newItem.estimatedMinutes = addEst;
    items.push(newItem);
    var added = Object.assign({}, data, { items: items });
    delete added.progress;
    if (added.progressEnabled === false) delete added.progressEnabled;
    bridge.applyCompletion(added);
    // Blocked subtask implies card Bloqué (same rule as Progrès UI).
    if (addBlocked && typeof bridge.applyPriority === 'function') {
      var blockedPri = { enAttente: true };
      blockedPri.blockedLinks = [
        { type: 'subtask', id: id, label: text }
      ];
      bridge.applyPriority(blockedPri);
    }
    var afterAdd = snapshotCompletion(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.add_subtask,
      id: id,
      detail: detailForTool(tool, null, null, beforeAdd, afterAdd, args, {
        id: id
      }),
      visual: {
        type: 'subtask',
        id: id,
        text: text,
        done: addDone,
        blocked: addBlocked,
        estimatedMinutes: addEst != null ? addEst : undefined
      }
    };
  });

  // set_subtask_blocked
  registerAction(['set_subtask_blocked'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyCompletion !== 'function') {
      return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
    }
    if (typeof CompletionTrello === 'undefined') {
      return { ok: false, tool: tool, error: 'CompletionTrello indisponible' };
    }
    var beforeItemBlocked = snapshotCompletion(bridge);
    var itemBlockedBase =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var itemBlockedTarget = resolveSubtaskItem(itemBlockedBase.items, args);
    if (!itemBlockedTarget) {
      return { ok: false, tool: tool, error: 'Sous-t\u00e2che introuvable' };
    }
    var wantBlocked =
      args.blocked != null ? !!args.blocked : !itemBlockedTarget.blocked;
    var nextItemBlocked;
    var pairCardReason = null;
    if (
      wantBlocked &&
      Array.isArray(args.blockedReasons) &&
      typeof CompletionTrello.setItemBlockedReasons === 'function'
    ) {
      var peopleForItemReasons = getPeopleFromBridge(bridge);
      var placesForItemReasons = getPlacesFromBridge(bridge);
      var whyArg = args.blockedReasons
        .filter(function (r) {
          return typeof r === 'string' && r.trim();
        })
        .map(function (r) {
          return (
            resolveAliasesInText(
              resolvePeopleInReason(r, peopleForItemReasons),
              peopleForItemReasons,
              placesForItemReasons
            ) || String(r).trim()
          );
        })
        .filter(Boolean);
      var itemHadMotifs =
        Array.isArray(itemBlockedTarget.blockedReasons) &&
        itemBlockedTarget.blockedReasons.length > 0;
      var whyText = whyArg.length ? whyArg[whyArg.length - 1] : '';
      if (
        !itemHadMotifs &&
        whyText &&
        !isPureWaitingOnTaskReason(whyText, itemBlockedTarget.text)
      ) {
        var itemPair = fallbackBlockedReasonPair({
          subtaskTitle: itemBlockedTarget.text,
          why: whyText,
        });
        try {
          itemPair = await suggestBlockedReasonPair(null, {
            subtaskTitle: itemBlockedTarget.text,
            why: whyText,
          });
        } catch (pairErr) {
          /* keep fallback */
        }
        nextItemBlocked = CompletionTrello.setItemBlockedReasons(
          itemBlockedBase,
          itemBlockedTarget.id,
          itemPair.subtaskReason ? [itemPair.subtaskReason] : whyArg
        );
        pairCardReason = itemPair.cardReason || null;
      } else {
        nextItemBlocked = CompletionTrello.setItemBlockedReasons(
          itemBlockedBase,
          itemBlockedTarget.id,
          whyArg.length ? whyArg : args.blockedReasons
        );
      }
    } else {
      nextItemBlocked = CompletionTrello.setItemBlocked(
        itemBlockedBase,
        itemBlockedTarget.id,
        wantBlocked
      );
    }
    bridge.applyCompletion(nextItemBlocked);
    if (typeof bridge.applyPriority === 'function') {
      if (wantBlocked) {
        var priPartial = {
          enAttente: true,
          blockedLinks: CompletionTrello.blockedLinksFromCompletion(
            nextItemBlocked
          ),
        };
        if (pairCardReason) {
          priPartial.blockedReasons = [pairCardReason];
        } else if (CompletionTrello.aggregateBlockedReasons) {
          priPartial.blockedReasons =
            CompletionTrello.aggregateBlockedReasons(nextItemBlocked);
        }
        bridge.applyPriority(priPartial);
      } else if (
        typeof CompletionTrello.hasAnyBlocked === 'function' &&
        !CompletionTrello.hasAnyBlocked(nextItemBlocked)
      ) {
        bridge.applyPriority({ enAttente: false, blockedLinks: [] });
      } else {
        bridge.applyPriority({
          blockedLinks: CompletionTrello.blockedLinksFromCompletion(
            nextItemBlocked
          ),
          blockedReasons: CompletionTrello.aggregateBlockedReasons
            ? CompletionTrello.aggregateBlockedReasons(nextItemBlocked)
            : undefined,
        });
      }
    }
    var afterItemBlocked = snapshotCompletion(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_subtask_blocked,
      detail: detailForTool(
        tool,
        null,
        null,
        beforeItemBlocked,
        afterItemBlocked,
        args,
        { id: itemBlockedTarget.id, blocked: wantBlocked }
      )
    };
  });

  // set_subtask_estimate
  registerAction(['set_subtask_estimate'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyCompletion !== 'function') {
      return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
    }
    var estMins = resolveEstimateMinutesArg(args);
    if (estMins === undefined && args.estimatedMinutes !== null) {
      return { ok: false, tool: tool, error: 'Dur\u00e9e estim\u00e9e invalide' };
    }
    var beforeEst = snapshotCompletion(bridge);
    var estBase =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var estTarget = resolveSubtaskItem(estBase.items, args);
    if (!estTarget) {
      return { ok: false, tool: tool, error: 'Sous-t\u00e2che introuvable' };
    }
    var nextEst =
      typeof CompletionTrello !== 'undefined' &&
      typeof CompletionTrello.applyItemEstimate === 'function'
        ? CompletionTrello.applyItemEstimate(estBase, estTarget.id, estMins, {
            lock: true
          })
        : (function () {
            var copy = Object.assign({}, estBase, {
              items: (estBase.items || []).map(function (item) {
                if (item.id !== estTarget.id) return item;
                var row = Object.assign({}, item);
                if (estMins == null) delete row.estimatedMinutes;
                else row.estimatedMinutes = estMins;
                row.estimatedMinutesLocked = true;
                return row;
              })
            });
            return copy;
          })();
    bridge.applyCompletion(nextEst);
    var afterEst = snapshotCompletion(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_subtask_estimate,
      id: estTarget.id,
      detail: detailForTool(tool, null, null, beforeEst, afterEst, args, {
        id: estTarget.id
      })
    };
  });

  // rename_subtask
  registerAction(['rename_subtask'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyCompletion !== 'function') {
      return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
    }
    var renameText = typeof args.text === 'string' ? args.text.trim() : '';
    if (!renameText) {
      return { ok: false, tool: tool, error: 'Nouveau texte requis' };
    }
    var beforeRename = snapshotCompletion(bridge);
    var renameBase =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var target = resolveSubtaskItem(renameBase.items, args);
    if (!target) {
      return { ok: false, tool: tool, error: 'Sous-t\u00e2che introuvable' };
    }
    var renamedItems = (renameBase.items || []).map(function (item) {
      if (item.id !== target.id) return item;
      return Object.assign({}, item, { text: renameText });
    });
    var renamedPayload = Object.assign({}, renameBase, {
      items: renamedItems
    });
    if (renamedPayload.progressEnabled === false) {
      delete renamedPayload.progressEnabled;
    }
    bridge.applyCompletion(renamedPayload);
    var afterRenameSnap = snapshotCompletion(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.rename_subtask,
      id: target.id,
      detail: detailForTool(
        tool,
        null,
        null,
        beforeRename,
        afterRenameSnap,
        args,
        { id: target.id }
      )
    };
  });

  // remove_subtask
  registerAction(['remove_subtask'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyCompletion !== 'function') {
      return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
    }
    var beforeRemove = snapshotCompletion(bridge);
    var removeBase =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var removeTarget = resolveSubtaskItem(removeBase.items, args);
    if (!removeTarget) {
      return { ok: false, tool: tool, error: 'Sous-t\u00e2che introuvable' };
    }
    var nextRemoveItems = (removeBase.items || []).filter(function (item) {
      return item.id !== removeTarget.id;
    });
    var removePayload = Object.assign({}, removeBase, {
      items: nextRemoveItems
    });
    if (!nextRemoveItems.length && (removeBase.items || []).length) {
      var priorPct = 0;
      if (
        typeof CompletionTrello !== 'undefined' &&
        CompletionTrello.computeCardProgress
      ) {
        priorPct = CompletionTrello.computeCardProgress(removeBase).percent;
      }
      removePayload.progress = priorPct;
    }
    if (removePayload.progressEnabled === false) {
      delete removePayload.progressEnabled;
    }
    bridge.applyCompletion(removePayload);
    var afterRemove = snapshotCompletion(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.remove_subtask,
      id: removeTarget.id,
      detail: detailForTool(
        tool,
        null,
        null,
        beforeRemove,
        afterRemove,
        args,
        { id: removeTarget.id }
      )
    };
  });

  // complete_all_subtasks
  registerAction(['complete_all_subtasks'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyCompletion !== 'function') {
      return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
    }
    var beforeComplete = snapshotCompletion(bridge);
    var completeBase =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var completeNext;
    if (
      typeof CompletionTrello !== 'undefined' &&
      CompletionTrello.markFullyComplete
    ) {
      completeNext = CompletionTrello.markFullyComplete(completeBase);
    } else if (completeBase.items && completeBase.items.length) {
      completeNext = Object.assign({}, completeBase, {
        items: (completeBase.items || []).map(function (item) {
          return Object.assign({}, item, { done: true, progress: 100 });
        })
      });
      delete completeNext.progressEnabled;
    } else {
      completeNext = Object.assign({}, completeBase, { progress: 100 });
      delete completeNext.progressEnabled;
    }
    bridge.applyCompletion(completeNext);
    var afterComplete = snapshotCompletion(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.complete_all_subtasks,
      detail: detailForTool(
        tool,
        null,
        null,
        beforeComplete,
        afterComplete,
        args
      )
    };
  });

  // reset_progress
  registerAction(['reset_progress'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyCompletion !== 'function') {
      return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
    }
    var includeCompleted = args.includeCompleted !== false;
    var beforeReset = snapshotCompletion(bridge);
    var resetBase =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var resetNext;
    if (resetBase.items && resetBase.items.length) {
      resetNext = Object.assign({}, resetBase, {
        items: (resetBase.items || []).map(function (item) {
          if (!includeCompleted && item.done) return item;
          return Object.assign({}, item, { done: false, progress: 0 });
        })
      });
    } else {
      resetNext = Object.assign({}, resetBase, { progress: 0 });
    }
    if (resetNext.progressEnabled === false) {
      delete resetNext.progressEnabled;
    }
    bridge.applyCompletion(resetNext);
    var afterReset = snapshotCompletion(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.reset_progress,
      detail: detailForTool(
        tool,
        null,
        null,
        beforeReset,
        afterReset,
        args
      )
    };
  });

  // toggle_subtask, set_subtask_progress
  registerAction(['toggle_subtask','set_subtask_progress'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyCompletion !== 'function') {
      return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
    }
    var beforeSub = snapshotCompletion(bridge);
    var base =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var resolved = resolveSubtaskItem(base.items, args);
    if (!resolved) {
      return { ok: false, tool: tool, error: 'Sous-t\u00e2che introuvable' };
    }
    var targetId = resolved.id;
    var nextItems = (base.items || []).map(function (item) {
      if (item.id !== targetId) return item;
      var copy = Object.assign({}, item);
      if (tool === 'toggle_subtask') {
        var done = args.done != null ? !!args.done : !item.done;
        copy.done = done;
        copy.progress = done
          ? 100
          : args.progress != null
            ? clampInt(args.progress, 0, 100, 0)
            : 0;
        if (done) delete copy.blocked;
      } else {
        copy.progress = clampInt(args.progress, 0, 100, item.progress || 0);
        copy.done = copy.progress >= 100;
        if (copy.done) delete copy.blocked;
      }
      return copy;
    });
    var togglePayload = Object.assign({}, base, { items: nextItems });
    if (togglePayload.progressEnabled === false) {
      delete togglePayload.progressEnabled;
    }
    bridge.applyCompletion(togglePayload);
    var afterSub = snapshotCompletion(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary:
        tool === 'toggle_subtask'
          ? TOOL_LABELS.toggle_subtask
          : TOOL_LABELS.set_subtask_progress,
      id: targetId,
      detail: detailForTool(tool, null, null, beforeSub, afterSub, args, {
        id: targetId
      })
    };
  });

  // add_checklist_item
  registerAction(['add_checklist_item'], async function (bridge, action, tool, args) {
    if (
      typeof bridge.applyCompletion !== 'function' ||
      typeof CompletionTrello === 'undefined' ||
      typeof CompletionTrello.addChecklistItem !== 'function'
    ) {
      return {
        ok: false,
        tool: tool,
        error: 'Checklist indisponible'
      };
    }
    var completionCl =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var parentCl = resolveChecklistParent(
      (completionCl && completionCl.items) || [],
      args
    );
    if (!parentCl || !parentCl.id) {
      return {
        ok: false,
        tool: tool,
        error: 'Sous-t\u00e2che parente introuvable'
      };
    }
    var childText =
      typeof args.text === 'string'
        ? args.text.trim()
        : typeof args.name === 'string'
          ? args.name.trim()
          : '';
    if (!childText) {
      return { ok: false, tool: tool, error: 'text requis' };
    }
    var beforeCl = snapshotCompletion(bridge);
    var addedCl = CompletionTrello.addChecklistItem(
      completionCl,
      parentCl.id,
      childText,
      {
        done: args.done === true,
        progress: args.progress,
        estimatedMinutes: args.estimatedMinutes
      }
    );
    if (!addedCl || !addedCl.item) {
      return {
        ok: false,
        tool: tool,
        error:
          'Impossible d\'ajouter (parente li\u00e9e ou texte invalide)'
      };
    }
    bridge.applyCompletion(addedCl.data);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.add_checklist_item,
      detail: detailForTool(
        tool,
        null,
        null,
        beforeCl,
        snapshotCompletion(bridge),
        args,
        { parentId: parentCl.id, id: addedCl.item.id }
      )
    };
  });

  // remove_checklist_item, rename_checklist_item, set_checklist_progress
  registerAction(['remove_checklist_item','rename_checklist_item','set_checklist_progress'], async function (bridge, action, tool, args) {
    if (
      typeof bridge.applyCompletion !== 'function' ||
      typeof CompletionTrello === 'undefined'
    ) {
      return {
        ok: false,
        tool: tool,
        error: 'Checklist indisponible'
      };
    }
    var completionNest =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var parentNest = resolveChecklistParent(
      (completionNest && completionNest.items) || [],
      args
    );
    if (!parentNest || !parentNest.id) {
      return {
        ok: false,
        tool: tool,
        error: 'Sous-t\u00e2che parente introuvable'
      };
    }
    var childNest = resolveChecklistChild(parentNest, args);
    if (!childNest || !childNest.id) {
      return {
        ok: false,
        tool: tool,
        error: 'Sous-sous-t\u00e2che introuvable'
      };
    }
    var beforeNest = snapshotCompletion(bridge);
    var nextNest = completionNest;
    if (tool === 'remove_checklist_item') {
      nextNest = CompletionTrello.removeChecklistItem(
        completionNest,
        parentNest.id,
        childNest.id
      );
    } else if (tool === 'rename_checklist_item') {
      var newNestText =
        typeof args.text === 'string'
          ? args.text.trim()
          : typeof args.name === 'string'
            ? args.name.trim()
            : '';
      if (!newNestText) {
        return { ok: false, tool: tool, error: 'Nouveau text requis' };
      }
      nextNest = CompletionTrello.applyChecklistItemText(
        completionNest,
        parentNest.id,
        childNest.id,
        newNestText
      );
    } else {
      var nestProgress = Number(args.progress);
      if (!isFinite(nestProgress)) {
        if (args.done === true) nestProgress = 100;
        else if (args.done === false) nestProgress = 0;
        else {
          return {
            ok: false,
            tool: tool,
            error: 'progress 0-100 requis'
          };
        }
      }
      nextNest = CompletionTrello.applyChecklistItemProgress(
        completionNest,
        parentNest.id,
        childNest.id,
        nestProgress
      );
    }
    bridge.applyCompletion(nextNest);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS[tool],
      detail: detailForTool(
        tool,
        null,
        null,
        beforeNest,
        snapshotCompletion(bridge),
        args,
        { parentId: parentNest.id, id: childNest.id }
      )
    };
  });
})(typeof window !== 'undefined' ? window : this);
