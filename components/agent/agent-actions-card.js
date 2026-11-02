/**
 * AI agent actions: card fields
 *
 * Tools that edit the open card: priority, task types, statut, project, due date, blocked, formula, name, description, progress.
 * Each tool registers one handler through registerAction (agent-base.js); executeAction in
 * agent-actions.js looks the tool up. A handler gets (bridge, action, tool, args) and returns the result object.
 * Part of the agent (see agent.parts.json); names are shared through window.PriorityAgentParts.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var FORMULA_KEYS = S.FORMULA_KEYS;
  var TOOL_LABELS = S.TOOL_LABELS;
  var WAITING_OTHER_TASK_REASON = S.WAITING_OTHER_TASK_REASON;

  // from other parts (functions, resolved at call time)
  function bridgeMissingFailure() { return S.bridgeMissingFailure.apply(this, arguments); }
  function clampInt() { return S.clampInt.apply(this, arguments); }
  function detailForTool() { return S.detailForTool.apply(this, arguments); }
  function dueFromOffsetMinutes() { return S.dueFromOffsetMinutes.apply(this, arguments); }
  function fallbackBlockedReasonPair() { return S.fallbackBlockedReasonPair.apply(this, arguments); }
  function getPeopleFromBridge() { return S.getPeopleFromBridge.apply(this, arguments); }
  function getPlacesFromBridge() { return S.getPlacesFromBridge.apply(this, arguments); }
  function isPureWaitingOnTaskReason() { return S.isPureWaitingOnTaskReason.apply(this, arguments); }
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }
  function registerAction() { return S.registerAction.apply(this, arguments); }
  function resolveAliasesInText() { return S.resolveAliasesInText.apply(this, arguments); }
  function resolveBlockedLinkArgs() { return S.resolveBlockedLinkArgs.apply(this, arguments); }
  function resolveDueVagueArg() { return S.resolveDueVagueArg.apply(this, arguments); }
  function resolveDueVagueToDateSafe() { return S.resolveDueVagueToDateSafe.apply(this, arguments); }
  function resolveEstimateMinutesArg() { return S.resolveEstimateMinutesArg.apply(this, arguments); }
  function resolveHeatSegment() { return S.resolveHeatSegment.apply(this, arguments); }
  function resolvePeopleInReason() { return S.resolvePeopleInReason.apply(this, arguments); }
  function resolveStatutListId() { return S.resolveStatutListId.apply(this, arguments); }
  function snapshotCompletion() { return S.snapshotCompletion.apply(this, arguments); }
  function snapshotPriority() { return S.snapshotPriority.apply(this, arguments); }
  function suggestBlockedReasonPair() { return S.suggestBlockedReasonPair.apply(this, arguments); }
  function taskTypesEqual() { return S.taskTypesEqual.apply(this, arguments); }
  function validateDueDate() { return S.validateDueDate.apply(this, arguments); }
  function validateDueTime() { return S.validateDueTime.apply(this, arguments); }

  function registerAction() { return S.registerAction.apply(this, arguments); }

  // set_priority
  registerAction(['set_priority'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyPriority !== 'function') {
      return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
    }
    var beforeP = snapshotPriority(bridge);
    var partial = {};
    var heatSeg = resolveHeatSegment(args.tier, args.heatTarget);
    if (heatSeg) {
      var formulaKey = 'baseline';
      if (typeof bridge.getFormulaKey === 'function') {
        try {
          formulaKey = bridge.getFormulaKey() || 'baseline';
        } catch (e) { /* ignore */ }
      }
      var stateNow =
        typeof bridge.getPriorityState === 'function'
          ? bridge.getPriorityState() || {}
          : {};
      var formulaDef =
        typeof PriorityUI !== 'undefined' &&
        PriorityUI.FORMULAS &&
        PriorityUI.FORMULAS[formulaKey]
          ? PriorityUI.FORMULAS[formulaKey]
          : null;
      if (heatSeg.preset && (!formulaDef || formulaKey === 'baseline')) {
        if (heatSeg.preset.empressement != null) partial.empressement = heatSeg.preset.empressement;
        if (heatSeg.preset.impact != null) partial.impact = heatSeg.preset.impact;
        if (heatSeg.preset.ease != null) partial.ease = heatSeg.preset.ease;
      } else if (formulaDef && typeof formulaDef.override === 'function') {
        var overridden = formulaDef.override(heatSeg.target, stateNow) || {};
        // Baseline returns empressement; the legacy formulas (Eisenhower/WSJF/
        // Valeur-Effort) still return urgency (kept as a back-compat sidecar).
        if (overridden.empressement != null) partial.empressement = overridden.empressement;
        else if (overridden.urgency != null) partial.urgency = overridden.urgency;
        if (overridden.impact != null) partial.impact = overridden.impact;
        if (overridden.ease != null) partial.ease = overridden.ease;
      } else if (heatSeg.preset) {
        if (heatSeg.preset.empressement != null) partial.empressement = heatSeg.preset.empressement;
        if (heatSeg.preset.impact != null) partial.impact = heatSeg.preset.impact;
        if (heatSeg.preset.ease != null) partial.ease = heatSeg.preset.ease;
      }
    }
    if (args.urgency != null) partial.urgency = clampInt(args.urgency, 0, 4, 0);
    if (args.impact != null) partial.impact = clampInt(args.impact, 0, 10, 5);
    if (args.ease != null) partial.ease = clampInt(args.ease, 0, 10, 5);
    if (args.empressement != null) {
      partial.empressement =
        typeof PriorityUI !== 'undefined' &&
        typeof PriorityUI.normalizeEmpressementId === 'function'
          ? PriorityUI.normalizeEmpressementId(args.empressement)
          : args.empressement;
    }
    // Duration now lives in Progrès — redirect legacy Facilité duration args.
    var redirectedEstimate = resolveEstimateMinutesArg({
      estimatedMinutes:
        args.estimatedDurationMinutes !== undefined
          ? args.estimatedDurationMinutes
          : undefined,
      estimatedDuration:
        typeof args.estimatedDuration === 'string'
          ? args.estimatedDuration
          : undefined
    });
    var hasRedirectedEstimate =
      args.estimatedDurationMinutes !== undefined ||
      (typeof args.estimatedDuration === 'string' &&
        !!args.estimatedDuration.trim());
    if (args.priorityEnabled != null) {
      partial.priorityEnabled = !!args.priorityEnabled;
    } else if (
      (partial.urgency != null ||
        partial.impact != null ||
        partial.ease != null ||
        partial.empressement != null) &&
      !beforeP.priorityEnabled
    ) {
      // Writing axis values must activate Priorité or the UI stays off.
      partial.priorityEnabled = true;
    }
    if (!Object.keys(partial).length && !hasRedirectedEstimate) {
      return {
        ok: false,
        tool: tool,
        error: 'Aucun champ priorit\u00e9 \u00e0 modifier'
      };
    }
    if (Object.keys(partial).length) {
      bridge.applyPriority(partial);
    }
    var beforeCRedirect = null;
    var afterCRedirect = null;
    if (
      hasRedirectedEstimate &&
      typeof bridge.applyCompletion === 'function' &&
      typeof bridge.getCompletion === 'function' &&
      typeof CompletionTrello !== 'undefined' &&
      typeof CompletionTrello.applyMasterEstimate === 'function'
    ) {
      beforeCRedirect = snapshotCompletion(bridge);
      var redirected = CompletionTrello.applyMasterEstimate(
        bridge.getCompletion() || { items: [] },
        redirectedEstimate == null ? null : redirectedEstimate,
        { lock: false }
      );
      bridge.applyCompletion(redirected);
      afterCRedirect = snapshotCompletion(bridge);
    }
    var afterP = snapshotPriority(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_priority,
      detail: detailForTool(
        tool,
        beforeP,
        afterP,
        beforeCRedirect,
        afterCRedirect,
        args
      )
    };
  });

  // set_task_types
  registerAction(['set_task_types'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyPriority !== 'function') {
      return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
    }
    var beforeTypes = snapshotPriority(bridge);
    var nextTypes = normalizeAgentTaskTypes(
      args.types != null ? args.types : args.taskTypes
    );
    if (
      beforeTypes.taskTypesLocked &&
      args.force !== true &&
      !taskTypesEqual(nextTypes, beforeTypes.taskTypes)
    ) {
      return {
        ok: false,
        tool: tool,
        error: 'Types verrouill\u00e9s par l\'utilisateur (force requis)'
      };
    }
    var typesPartial = { taskTypes: nextTypes };
    // AI writes stay unlocked; user edits set the lock in Information.
    // When forcing over a user lock, keep the lock so AI still cannot silently rewrite later.
    if (beforeTypes.taskTypesLocked) {
      typesPartial.taskTypesLocked = true;
    }
    bridge.applyPriority(typesPartial);
    var afterTypes = snapshotPriority(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_task_types,
      detail: detailForTool(
        tool,
        beforeTypes,
        afterTypes,
        null,
        null,
        args
      )
    };
  });

  // set_statut
  registerAction(['set_statut'], async function (bridge, action, tool, args) {
    if (typeof bridge.selectStatut !== 'function') {
      return bridgeMissingFailure(tool, 'Statut indisponible', [
        'selectStatut'
      ]);
    }
    var statutCtx =
      typeof bridge.getStatut === 'function' ? bridge.getStatut() : null;
    var targetListId = resolveStatutListId(statutCtx, args);
    if (!targetListId) {
      return {
        ok: false,
        tool: tool,
        error: 'Liste statut introuvable'
      };
    }
    var listName = '';
    if (statutCtx && Array.isArray(statutCtx.lists)) {
      for (var li = 0; li < statutCtx.lists.length; li++) {
        if (String(statutCtx.lists[li].id) === String(targetListId)) {
          listName = statutCtx.lists[li].name || '';
          break;
        }
      }
    }
    var selectResult = await Promise.resolve(
      bridge.selectStatut(targetListId)
    );
    if (!selectResult || !selectResult.ok) {
      return {
        ok: false,
        tool: tool,
        error:
          (selectResult &&
            (selectResult.reason || selectResult.error)) ||
          'D\u00e9placement statut \u00e9chou\u00e9'
      };
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_statut,
      detail: detailForTool(tool, null, null, null, null, args, {
        listId: targetListId,
        listName: listName
      }),
      visual: {
        type: 'statut',
        listId: targetListId,
        listName: listName,
        category: args.category || undefined
      }
    };
  });

  // set_project
  registerAction(['set_project'], async function (bridge, action, tool, args) {
    if (typeof bridge.setProject !== 'function') {
      return bridgeMissingFailure(tool, 'Objectifs indisponibles', [
        'setProject'
      ]);
    }
    var clearProject = args.clear === true;
    var projectId = null;
    var projectName = '';
    if (!clearProject) {
      var goalsCtx =
        typeof bridge.getGoals === 'function' ? bridge.getGoals() : null;
      var projects =
        goalsCtx && Array.isArray(goalsCtx.projects) ? goalsCtx.projects : [];
      var matched =
        typeof GoalsTrello !== 'undefined' && GoalsTrello.findProjectByMatch
          ? GoalsTrello.findProjectByMatch(projects, args)
          : null;
      if (!matched && typeof args.projectId === 'string' && args.projectId.trim()) {
        for (var pi = 0; pi < projects.length; pi++) {
          if (projects[pi].id === args.projectId.trim()) {
            matched = projects[pi];
            break;
          }
        }
      }
      if (!matched) {
        return { ok: false, tool: tool, error: 'Projet introuvable' };
      }
      if (matched.retired) {
        return { ok: false, tool: tool, error: 'Projet retir\u00e9' };
      }
      projectId = matched.id;
      projectName = matched.name || '';
    }
    var projectResult = await Promise.resolve(bridge.setProject(projectId));
    if (!projectResult || !projectResult.ok) {
      return {
        ok: false,
        tool: tool,
        error:
          (projectResult &&
            (projectResult.reason || projectResult.error)) ||
          'Liaison projet \u00e9chou\u00e9e'
      };
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: clearProject
        ? 'Projet d\u00e9li\u00e9.'
        : TOOL_LABELS.set_project,
      detail: detailForTool(tool, null, null, null, null, args, {
        projectId: projectId,
        projectName: projectName,
        cleared: clearProject
      }),
      visual: clearProject
        ? { type: 'project', cleared: true }
        : {
            type: 'project',
            projectId: projectId,
            name: projectName,
            linked: true
          }
    };
  });

  // set_due
  registerAction(['set_due'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyPriority !== 'function') {
      return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
    }
    var beforeDue = snapshotPriority(bridge);
    var duePartial = {};
    var vagueId = '';
    var clearDue =
      args.clear === true ||
      args.clearDue === true ||
      (args.dueDate === null &&
        args.dueEnabled === false &&
        !Object.prototype.hasOwnProperty.call(args, 'dueVague') &&
        args.relativeMinutes == null &&
        args.relativeHours == null);

    if (clearDue) {
      duePartial.dueEnabled = false;
      duePartial.dueDate = '';
      duePartial.dueTime = '';
      duePartial.dueVague = '';
      duePartial.dueMode = 'precise';
    } else {
      if (Object.prototype.hasOwnProperty.call(args, 'dueVague')) {
        vagueId = resolveDueVagueArg(args.dueVague);
        if (args.dueVague != null && args.dueVague !== '' && !vagueId) {
          return {
            ok: false,
            tool: tool,
            error:
              'dueVague invalide (proche|lointain|eventuellement)'
          };
        }
      } else if (
        args.dueMode === 'vague' &&
        Object.prototype.hasOwnProperty.call(args, 'dueDate') === false &&
        args.relativeMinutes == null &&
        args.relativeHours == null
      ) {
        return {
          ok: false,
          tool: tool,
          error: 'dueVague requis en mode vague'
        };
      }
      var hasRelative =
        args.relativeMinutes != null || args.relativeHours != null;
      if (vagueId) {
        var vagueDate = resolveDueVagueToDateSafe(vagueId);
        if (!vagueDate) {
          return {
            ok: false,
            tool: tool,
            error: 'Impossible de r\u00e9soudre l\'horizon vague'
          };
        }
        duePartial.dueVague = vagueId;
        duePartial.dueMode = 'vague';
        duePartial.dueDate = vagueDate;
        duePartial.dueTime = '';
        // Vague UI clears start + recurrence.
        duePartial.startDate = '';
        duePartial.startTime = '';
        duePartial.recurrence = null;
      } else if (hasRelative) {
        var offsetMins = 0;
        if (args.relativeHours != null) {
          var hours = Number(args.relativeHours);
          if (!isFinite(hours)) {
            return { ok: false, tool: tool, error: 'relativeHours invalide' };
          }
          offsetMins += hours * 60;
        }
        if (args.relativeMinutes != null) {
          var minutes = Number(args.relativeMinutes);
          if (!isFinite(minutes)) {
            return { ok: false, tool: tool, error: 'relativeMinutes invalide' };
          }
          offsetMins += minutes;
        }
        offsetMins = Math.round(offsetMins);
        if (offsetMins < 0) {
          return {
            ok: false,
            tool: tool,
            error: 'd\u00e9lai relatif doit \u00eatre \u2265 0'
          };
        }
        var resolvedRelative = dueFromOffsetMinutes(offsetMins);
        if (!resolvedRelative) {
          return { ok: false, tool: tool, error: 'd\u00e9lai relatif invalide' };
        }
        duePartial.dueDate = resolvedRelative.dueDate;
        duePartial.dueTime = resolvedRelative.dueTime;
        duePartial.dueMode = 'precise';
        duePartial.dueVague = '';
      } else {
        if (Object.prototype.hasOwnProperty.call(args, 'dueDate')) {
          var dueDate = validateDueDate(args.dueDate);
          if (dueDate === undefined) {
            return { ok: false, tool: tool, error: 'dueDate invalide (YYYY-MM-DD)' };
          }
          duePartial.dueDate = dueDate || '';
          duePartial.dueMode = 'precise';
          duePartial.dueVague = '';
        }
        if (Object.prototype.hasOwnProperty.call(args, 'dueTime')) {
          var dueTime = validateDueTime(args.dueTime);
          if (dueTime === undefined) {
            return { ok: false, tool: tool, error: 'dueTime invalide (HH:MM)' };
          }
          duePartial.dueTime = dueTime || '';
          duePartial.dueMode = 'precise';
          duePartial.dueVague = '';
        }
      }
      if (args.dueEnabled != null) {
        duePartial.dueEnabled = !!args.dueEnabled;
      } else if (
        (Object.prototype.hasOwnProperty.call(duePartial, 'dueDate') ||
          Object.prototype.hasOwnProperty.call(duePartial, 'dueTime') ||
          Object.prototype.hasOwnProperty.call(duePartial, 'dueVague')) &&
        !beforeDue.dueEnabled
      ) {
        duePartial.dueEnabled = true;
      }
    }

    // Start date / time (precise mode only — ignored when going vague).
    if (args.clearStart === true) {
      duePartial.startDate = '';
      duePartial.startTime = '';
    } else if (!vagueId) {
      if (Object.prototype.hasOwnProperty.call(args, 'startDate')) {
        var startDate = validateDueDate(args.startDate);
        if (startDate === undefined) {
          return {
            ok: false,
            tool: tool,
            error: 'startDate invalide (YYYY-MM-DD)'
          };
        }
        duePartial.startDate = startDate || '';
        if (!startDate) duePartial.startTime = '';
      }
      if (Object.prototype.hasOwnProperty.call(args, 'startTime')) {
        var startTime = validateDueTime(args.startTime);
        if (startTime === undefined) {
          return {
            ok: false,
            tool: tool,
            error: 'startTime invalide (HH:MM)'
          };
        }
        duePartial.startTime = startTime || '';
      }
    }

    // Recurrence (precise mode only; null / clearRecurrence clears).
    if (vagueId) {
      /* already cleared above */
    } else if (
      args.clearRecurrence === true ||
      args.recurrence === null ||
      args.recurrence === ''
    ) {
      duePartial.recurrence = null;
    } else if (
      Object.prototype.hasOwnProperty.call(args, 'recurrence') &&
      args.recurrence &&
      typeof args.recurrence === 'object'
    ) {
      var rule = null;
      if (
        typeof PriorityUI !== 'undefined' &&
        typeof PriorityUI.normalizeRecurrence === 'function'
      ) {
        rule = PriorityUI.normalizeRecurrence(args.recurrence);
      }
      if (!rule) {
        return {
          ok: false,
          tool: tool,
          error:
            'recurrence invalide (frequency: daily|weekly|monthly|yearly)'
        };
      }
      duePartial.recurrence = rule;
      duePartial.dueMode = 'precise';
      duePartial.dueVague = '';
    }

    if (!Object.keys(duePartial).length) {
      return {
        ok: false,
        tool: tool,
        error: 'Aucun champ \u00e9ch\u00e9ance \u00e0 modifier'
      };
    }
    bridge.applyPriority(duePartial);
    var afterDue = snapshotPriority(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_due,
      detail: detailForTool(tool, beforeDue, afterDue, null, null, args)
    };
  });

  // set_blocked
  registerAction(['set_blocked'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyPriority !== 'function') {
      return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
    }
    var beforeBlocked = snapshotPriority(bridge);
    var completionForLinks =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var blockedPartial = {};
    if (Array.isArray(args.blockedReasons)) {
      var peopleForReasons = getPeopleFromBridge(bridge);
      var placesForReasons = getPlacesFromBridge(bridge);
      blockedPartial.blockedReasons = args.blockedReasons
        .filter(function (r) {
          return typeof r === 'string' && r.trim();
        })
        .map(function (r) {
          return resolveAliasesInText(
            resolvePeopleInReason(r, peopleForReasons),
            peopleForReasons,
            placesForReasons
          );
        })
        .filter(Boolean);
    }
    if (Object.prototype.hasOwnProperty.call(args, 'blockedLinks')) {
      var resolvedLinks = resolveBlockedLinkArgs(
        args.blockedLinks,
        (completionForLinks && completionForLinks.items) || []
      );
      if (resolvedLinks == null) {
        return {
          ok: false,
          tool: tool,
          error: 'blockedLinks invalide'
        };
      }
      blockedPartial.blockedLinks = resolvedLinks;
      if (
        resolvedLinks.length &&
        Array.isArray(blockedPartial.blockedReasons)
      ) {
        var hasWaiting = blockedPartial.blockedReasons.some(function (r) {
          return r === WAITING_OTHER_TASK_REASON;
        });
        if (!hasWaiting) {
          blockedPartial.blockedReasons =
            blockedPartial.blockedReasons.concat([
              WAITING_OTHER_TASK_REASON
            ]);
        }
      }
    }
    if (args.enAttente != null) {
      blockedPartial.enAttente = !!args.enAttente;
    } else if (
      (blockedPartial.blockedReasons &&
        blockedPartial.blockedReasons.length) ||
      (blockedPartial.blockedLinks && blockedPartial.blockedLinks.length)
    ) {
      // Providing reasons/links without enAttente implies enabling Bloqué.
      blockedPartial.enAttente = true;
    }
    if (!Object.keys(blockedPartial).length) {
      return {
        ok: false,
        tool: tool,
        error: 'Aucun champ blocage \u00e0 modifier'
      };
    }
    var beforeBlockedCompletion =
      typeof bridge.getCompletion === 'function'
        ? snapshotCompletion(bridge)
        : null;
    bridge.applyPriority(blockedPartial);
    var afterBlockedCompletion = beforeBlockedCompletion;
    // Keep Progrès blocked flags in sync with card Bloqué (bidirectional).
    if (
      typeof bridge.applyCompletion === 'function' &&
      typeof bridge.getCompletion === 'function' &&
      typeof CompletionTrello !== 'undefined'
    ) {
      var completionWhileBlocked = bridge.getCompletion() || { items: [] };
      var nextBlockedCompletion = completionWhileBlocked;
      if (blockedPartial.enAttente === false) {
        if (typeof CompletionTrello.clearAllBlocked === 'function') {
          nextBlockedCompletion =
            CompletionTrello.clearAllBlocked(completionWhileBlocked);
        }
      } else if (blockedPartial.enAttente === true) {
        if (
          typeof CompletionTrello.isAllSubtasksComplete === 'function' &&
          typeof CompletionTrello.markNotFullyComplete === 'function' &&
          CompletionTrello.isAllSubtasksComplete(completionWhileBlocked)
        ) {
          nextBlockedCompletion = CompletionTrello.markNotFullyComplete(
            completionWhileBlocked
          );
        }
        // Mirror linked items → item.blocked; otherwise master.blocked.
        var linkIds = [];
        if (Array.isArray(blockedPartial.blockedLinks)) {
          blockedPartial.blockedLinks.forEach(function (link) {
            if (link && link.id) linkIds.push(String(link.id));
          });
        }
        if (
          linkIds.length &&
          typeof CompletionTrello.setItemBlocked === 'function'
        ) {
          linkIds.forEach(function (id) {
            nextBlockedCompletion = CompletionTrello.setItemBlocked(
              nextBlockedCompletion,
              id,
              true
            );
          });
        } else if (
          typeof CompletionTrello.hasAnyBlocked === 'function' &&
          !CompletionTrello.hasAnyBlocked(nextBlockedCompletion) &&
          typeof CompletionTrello.setMasterBlocked === 'function'
        ) {
          nextBlockedCompletion = CompletionTrello.setMasterBlocked(
            nextBlockedCompletion,
            true,
            { origin: 'status' }
          );
        }
        if (
          Array.isArray(blockedPartial.blockedReasons) &&
          blockedPartial.blockedReasons.length
        ) {
          if (
            linkIds.length === 1 &&
            typeof CompletionTrello.setItemBlockedReasons === 'function'
          ) {
            var linkItem = null;
            var linkItems =
              (nextBlockedCompletion && nextBlockedCompletion.items) || [];
            for (var li = 0; li < linkItems.length; li++) {
              if (
                linkItems[li] &&
                String(linkItems[li].id) === String(linkIds[0])
              ) {
                linkItem = linkItems[li];
                break;
              }
            }
            var linkHadReasons =
              linkItem &&
              Array.isArray(linkItem.blockedReasons) &&
              linkItem.blockedReasons.length > 0;
            var whyText = blockedPartial.blockedReasons[
              blockedPartial.blockedReasons.length - 1
            ];
            var canPair =
              !linkHadReasons &&
              linkItem &&
              whyText &&
              typeof fallbackBlockedReasonPair === 'function' &&
              !isPureWaitingOnTaskReason(whyText, linkItem.text);
            if (canPair) {
              var pair =
                typeof suggestBlockedReasonPair === 'function'
                  ? await suggestBlockedReasonPair(
                      bridge.provider || null,
                      {
                        subtaskTitle: linkItem.text,
                        why: whyText,
                        cardTitle:
                          (bridge.getCardName && bridge.getCardName()) ||
                          '',
                      }
                    )
                  : fallbackBlockedReasonPair({
                      subtaskTitle: linkItem.text,
                      why: whyText,
                    });
              nextBlockedCompletion =
                CompletionTrello.setItemBlockedReasons(
                  nextBlockedCompletion,
                  linkIds[0],
                  pair.subtaskReason ? [pair.subtaskReason] : []
                );
              if (pair.cardReason) {
                blockedPartial.blockedReasons = [pair.cardReason];
                bridge.applyPriority({
                  blockedReasons: [pair.cardReason],
                  enAttente: true,
                });
              }
            } else {
              linkIds.forEach(function (id) {
                nextBlockedCompletion =
                  CompletionTrello.setItemBlockedReasons(
                    nextBlockedCompletion,
                    id,
                    blockedPartial.blockedReasons
                  );
              });
            }
          } else if (
            linkIds.length &&
            typeof CompletionTrello.setItemBlockedReasons === 'function'
          ) {
            linkIds.forEach(function (id) {
              nextBlockedCompletion =
                CompletionTrello.setItemBlockedReasons(
                  nextBlockedCompletion,
                  id,
                  blockedPartial.blockedReasons
                );
            });
          } else if (
            typeof CompletionTrello.setMasterBlockedReasons === 'function'
          ) {
            // Card Motifs from set_blocked → master entity Motifs.
            nextBlockedCompletion =
              CompletionTrello.setMasterBlockedReasons(
                nextBlockedCompletion,
                blockedPartial.blockedReasons,
                { origin: 'status' }
              );
          }
        }
      }
      if (
        JSON.stringify(
          CompletionTrello.normalizeCompletionData(completionWhileBlocked)
        ) !==
        JSON.stringify(
          CompletionTrello.normalizeCompletionData(nextBlockedCompletion)
        )
      ) {
        bridge.applyCompletion(nextBlockedCompletion);
        afterBlockedCompletion = snapshotCompletion(bridge);
      }
    }
    var afterBlocked = snapshotPriority(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_blocked,
      detail: detailForTool(
        tool,
        beforeBlocked,
        afterBlocked,
        beforeBlockedCompletion,
        afterBlockedCompletion,
        args
      )
    };
  });

  // set_formula
  registerAction(['set_formula'], async function (bridge, action, tool, args) {
    if (typeof bridge.setFormulaKey !== 'function') {
      return { ok: false, tool: tool, error: 'Formule indisponible' };
    }
    var formula =
      typeof args.formula === 'string' ? args.formula.trim() : '';
    if (FORMULA_KEYS.indexOf(formula) === -1) {
      return {
        ok: false,
        tool: tool,
        error: 'Formule invalide (baseline|eisenhower|wsjf|valueEffort)'
      };
    }
    bridge.setFormulaKey(formula);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_formula,
      detail: detailForTool(tool, null, null, null, null, args, {
        formula: formula
      })
    };
  });

  // rename_card
  registerAction(['rename_card'], async function (bridge, action, tool, args) {
    if (typeof bridge.setCardName !== 'function') {
      return bridgeMissingFailure(tool, 'Renommage carte indisponible', [
        'setCardName'
      ]);
    }
    var newCardName =
      typeof args.name === 'string' && args.name.trim()
        ? args.name.trim()
        : typeof args.text === 'string'
          ? args.text.trim()
          : '';
    if (!newCardName) {
      return { ok: false, tool: tool, error: 'Nouveau nom requis' };
    }
    var beforeCardName =
      typeof bridge.getCardName === 'function' ? bridge.getCardName() || '' : '';
    var renameCardResult = await Promise.resolve(bridge.setCardName(newCardName));
    if (!renameCardResult || !renameCardResult.ok) {
      var renameReason =
        (renameCardResult &&
          (renameCardResult.reason || renameCardResult.error)) ||
        'Renommage \u00e9chou\u00e9';
      if (renameReason === 'not-authorized') {
        renameReason = 'Autorisation Trello requise';
      } else if (renameReason === 'no-app-key') {
        renameReason = 'Cl\u00e9 API Trello manquante';
      } else if (renameReason === 'empty-name') {
        renameReason = 'Nouveau nom requis';
      } else if (renameReason === 'no-card-id') {
        renameReason = 'Carte introuvable';
      }
      return { ok: false, tool: tool, error: renameReason };
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.rename_card,
      detail: detailForTool(tool, null, null, null, null, args, {
        before: beforeCardName,
        after: newCardName
      })
    };
  });

  // set_description
  registerAction(['set_description'], async function (bridge, action, tool, args) {
    if (typeof bridge.setCardDesc !== 'function') {
      return {
        ok: false,
        tool: tool,
        error: 'Description carte indisponible'
      };
    }
    var newCardDesc =
      typeof args.desc === 'string'
        ? args.desc
        : typeof args.description === 'string'
          ? args.description
          : typeof args.text === 'string'
            ? args.text
            : null;
    if (newCardDesc == null) {
      return { ok: false, tool: tool, error: 'Description requise' };
    }
    var beforeCardDesc =
      typeof bridge.getCardDesc === 'function' ? bridge.getCardDesc() || '' : '';
    var setDescResult = await Promise.resolve(bridge.setCardDesc(newCardDesc));
    if (!setDescResult || !setDescResult.ok) {
      var descReason =
        (setDescResult && (setDescResult.reason || setDescResult.error)) ||
        'Mise \u00e0 jour description \u00e9chou\u00e9e';
      if (descReason === 'not-authorized') {
        descReason = 'Autorisation Trello requise';
      } else if (descReason === 'no-app-key') {
        descReason = 'Cl\u00e9 API Trello manquante';
      } else if (descReason === 'no-card-id') {
        descReason = 'Carte introuvable';
      }
      return { ok: false, tool: tool, error: descReason };
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_description,
      detail: detailForTool(tool, null, null, null, null, args, {
        before: beforeCardDesc,
        after: newCardDesc
      })
    };
  });

  // set_progress
  registerAction(['set_progress'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyCompletion !== 'function') {
      return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
    }
    var beforeProg = snapshotCompletion(bridge);
    var current =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var next = Object.assign({}, current);
    if (args.progressEnabled != null) {
      if (args.progressEnabled === false) next.progressEnabled = false;
      else delete next.progressEnabled;
    } else if (args.progress != null && current.progressEnabled === false) {
      delete next.progressEnabled;
    }
    if (args.progress != null) {
      var masterPct = clampInt(args.progress, 0, 100, 0);
      if (
        current.items &&
        current.items.length &&
        typeof CompletionTrello !== 'undefined' &&
        CompletionTrello.applyMasterProgress
      ) {
        next.items = CompletionTrello.applyMasterProgress(
          current.items,
          masterPct
        );
      } else {
        next.progress = masterPct;
      }
    }
    bridge.applyCompletion(next);
    var afterProg = snapshotCompletion(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_progress,
      detail: detailForTool(tool, null, null, beforeProg, afterProg, args)
    };
  });

  // set_timer, cancel_timer
  registerAction(['set_timer', 'cancel_timer'], async function (bridge, action, tool, args) {
    if (tool === 'cancel_timer') {
      if (typeof bridge.cancelTimer !== 'function') return { ok: false, tool: tool, error: 'Minuteur indisponible' };
      await bridge.cancelTimer();
      return { ok: true, tool: tool, args: args, summary: TOOL_LABELS.cancel_timer };
    }
    if (typeof bridge.setTimer !== 'function') return { ok: false, tool: tool, error: 'Minuteur indisponible' };
    var minutes = typeof Timers !== 'undefined' ? Timers.parseDuration(args.minutes != null ? args.minutes : args.duration) : null;
    if (!minutes) return { ok: false, tool: tool, error: 'Durée du minuteur invalide' };
    await bridge.setTimer(minutes, typeof args.label === 'string' ? args.label.trim() : '');
    return { ok: true, tool: tool, args: args, summary: TOOL_LABELS.set_timer };
  });

  // set_progress_estimate
  registerAction(['set_progress_estimate'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyCompletion !== 'function') {
      return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
    }
    var masterMins = resolveEstimateMinutesArg(args);
    if (masterMins === undefined && args.estimatedMinutes !== null) {
      return { ok: false, tool: tool, error: 'Dur\u00e9e estim\u00e9e invalide' };
    }
    var beforeMaster = snapshotCompletion(bridge);
    var masterBase =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion()
        : { items: [] };
    var nextMaster =
      typeof CompletionTrello !== 'undefined' &&
      typeof CompletionTrello.applyMasterEstimate === 'function'
        ? CompletionTrello.applyMasterEstimate(masterBase, masterMins, {
            lock: true
          })
        : Object.assign({}, masterBase, {
            estimatedMinutes: masterMins
          });
    bridge.applyCompletion(nextMaster);
    var afterMaster = snapshotCompletion(bridge);
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_progress_estimate,
      detail: detailForTool(
        tool,
        null,
        null,
        beforeMaster,
        afterMaster,
        args
      )
    };
  });
})(typeof window !== 'undefined' ? window : this);
