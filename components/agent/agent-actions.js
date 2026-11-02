/**
 * AI agent: actions
 *
 * Part 9/10 of agent. executeAction and executeActions: apply model tools to the board, with user-facing error formatting.
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var EFFECT_IDS = S.EFFECT_IDS;
  var FORMULA_KEYS = S.FORMULA_KEYS;
  var TOOL_LABELS = S.TOOL_LABELS;
  var WAITING_OTHER_TASK_REASON = S.WAITING_OTHER_TASK_REASON;

  // from other parts (functions, resolved at call time)
  function actionFailure() { return S.actionFailure.apply(this, arguments); }
  function apiFetch() { return S.apiFetch.apply(this, arguments); }
  function bridgeMissingFailure() { return S.bridgeMissingFailure.apply(this, arguments); }
  function bridgeOpFailure() { return S.bridgeOpFailure.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function clampInt() { return S.clampInt.apply(this, arguments); }
  function classifyFetchError() { return S.classifyFetchError.apply(this, arguments); }
  function currentAppBuildInfo() { return S.currentAppBuildInfo.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function detailForTool() { return S.detailForTool.apply(this, arguments); }
  function draftCustomAssigneeFromSpec() { return S.draftCustomAssigneeFromSpec.apply(this, arguments); }
  function dueFromOffsetMinutes() { return S.dueFromOffsetMinutes.apply(this, arguments); }
  function enrichActionError() { return S.enrichActionError.apply(this, arguments); }
  function fallbackBlockedReasonPair() { return S.fallbackBlockedReasonPair.apply(this, arguments); }
  function findExistingSubtaskByText() { return S.findExistingSubtaskByText.apply(this, arguments); }
  function firstNonEmptyString() { return S.firstNonEmptyString.apply(this, arguments); }
  function formatActionErrors() { return S.formatActionErrors.apply(this, arguments); }
  function formatChangeRecap() { return S.formatChangeRecap.apply(this, arguments); }
  function getPeopleFromBridge() { return S.getPeopleFromBridge.apply(this, arguments); }
  function getPlacesFromBridge() { return S.getPlacesFromBridge.apply(this, arguments); }
  function isPureWaitingOnTaskReason() { return S.isPureWaitingOnTaskReason.apply(this, arguments); }
  function localStamp() { return S.localStamp.apply(this, arguments); }
  function localizeEffectText() { return S.localizeEffectText.apply(this, arguments); }
  function matchBoardLabel() { return S.matchBoardLabel.apply(this, arguments); }
  function matchBoardMember() { return S.matchBoardMember.apply(this, arguments); }
  function matchCustomAssignee() { return S.matchCustomAssignee.apply(this, arguments); }
  function normalizeAgentColorArg() { return S.normalizeAgentColorArg.apply(this, arguments); }
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }
  function normalizeEffectId() { return S.normalizeEffectId.apply(this, arguments); }
  function normalizeMatchKey() { return S.normalizeMatchKey.apply(this, arguments); }
  function normalizePointField() { return S.normalizePointField.apply(this, arguments); }
  function normalizePointLevel() { return S.normalizePointLevel.apply(this, arguments); }
  function normalizePointSection() { return S.normalizePointSection.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function normalizeSubtaskTitleKey() { return S.normalizeSubtaskTitleKey.apply(this, arguments); }
  function parseAssistantPayload() { return S.parseAssistantPayload.apply(this, arguments); }
  function resolveAliasesInText() { return S.resolveAliasesInText.apply(this, arguments); }
  function resolveBlockedLinkArgs() { return S.resolveBlockedLinkArgs.apply(this, arguments); }
  function resolveChecklistChild() { return S.resolveChecklistChild.apply(this, arguments); }
  function resolveChecklistParent() { return S.resolveChecklistParent.apply(this, arguments); }
  function resolveDueVagueArg() { return S.resolveDueVagueArg.apply(this, arguments); }
  function resolveDueVagueToDateSafe() { return S.resolveDueVagueToDateSafe.apply(this, arguments); }
  function resolveEffectLanguage() { return S.resolveEffectLanguage.apply(this, arguments); }
  function resolveEstimateMinutesArg() { return S.resolveEstimateMinutesArg.apply(this, arguments); }
  function resolveHeatSegment() { return S.resolveHeatSegment.apply(this, arguments); }
  function resolveMemberRoleId() { return S.resolveMemberRoleId.apply(this, arguments); }
  function resolvePeopleInReason() { return S.resolvePeopleInReason.apply(this, arguments); }
  function resolveStatutListId() { return S.resolveStatutListId.apply(this, arguments); }
  function resolveSubtaskItem() { return S.resolveSubtaskItem.apply(this, arguments); }
  function snapshotCompletion() { return S.snapshotCompletion.apply(this, arguments); }
  function snapshotPriority() { return S.snapshotPriority.apply(this, arguments); }
  function suggestBlockedReasonPair() { return S.suggestBlockedReasonPair.apply(this, arguments); }
  function summarizeMemberSpec() { return S.summarizeMemberSpec.apply(this, arguments); }
  function taskTypesEqual() { return S.taskTypesEqual.apply(this, arguments); }
  function validateDueDate() { return S.validateDueDate.apply(this, arguments); }
  function validateDueTime() { return S.validateDueTime.apply(this, arguments); }

  // ── 16. executeAction(s) — apply one tool call to Trello via bridge ──────
  // Keep side-effects here (not in the UI). Unknown types → soft error.

  async function executeAction(bridge, action) {
    if (!bridge || !action || !action.tool) {
      return actionFailure(action && action.tool, 'Action invalide', {
        code: 'invalid-action',
        hint: 'Action sans outil ou pont manquant.'
      });
    }
    var tool = action.tool;
    var args = action.args && typeof action.args === 'object' ? action.args : {};
    try {
      if (tool === 'show_guide' || tool === 'schedule_check') {
        var Guides = typeof AgentGuides !== 'undefined' ? AgentGuides : null;
        if (tool === 'show_guide') {
          var guide = Guides && Guides.normalizeGuide(args);
          if (!guide) {
            return { ok: false, tool: tool, error: 'show_guide: kind breathe ou stretch' };
          }
          return {
            ok: true,
            tool: tool,
            args: args,
            guide: guide,
            summary: TOOL_LABELS.show_guide
          };
        }
        var check = Guides && Guides.normalizeCheck(args);
        if (!check) {
          return { ok: false, tool: tool, error: 'schedule_check: seconds et message requis' };
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          schedule: check,
          summary: TOOL_LABELS.schedule_check
        };
      }
      if (tool === 'set_priority') {
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
      }
      if (tool === 'set_task_types') {
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
      }
      if (tool === 'set_statut') {
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
      }
      if (tool === 'set_project') {
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
      }
      if (tool === 'set_due') {
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
      }
      if (tool === 'set_blocked') {
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
      }
      if (tool === 'set_formula') {
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
      }
      if (tool === 'rename_card') {
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
      }
      if (tool === 'set_description') {
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
      }
      if (tool === 'set_progress') {
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
      }
      if (tool === 'add_subtask') {
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
      }
      if (tool === 'set_subtask_blocked') {
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
      }
      if (tool === 'set_subtask_estimate') {
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
      }
      if (tool === 'set_progress_estimate') {
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
      }
      if (tool === 'rename_subtask') {
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
      }
      if (tool === 'remove_subtask') {
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
      }
      if (tool === 'complete_all_subtasks') {
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
      }
      if (tool === 'reset_progress') {
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
      }
      if (tool === 'trigger_effect') {
        var effectRaw = args.effect || args.name || args.id;
        var effectId = normalizeEffectId(effectRaw);
        if (!effectId) {
          return {
            ok: false,
            tool: tool,
            error:
              'Effet inconnu. Valeurs\u00a0: ' + EFFECT_IDS.join(', ')
          };
        }
        var effectText = '';
        if (typeof args.text === 'string' && args.text.trim()) {
          effectText = args.text.trim().slice(0, 48);
        } else if (typeof args.label === 'string' && args.label.trim()) {
          effectText = args.label.trim().slice(0, 48);
        } else if (typeof args.message === 'string' && args.message.trim()) {
          effectText = args.message.trim().slice(0, 48);
        }
        if (effectText) {
          effectText = localizeEffectText(effectText, resolveEffectLanguage(bridge));
        }
        if (effectId === 'banner' && !effectText) {
          return {
            ok: false,
            tool: tool,
            error: 'banner exige un text (plein \u00e9cran)',
            args: { effect: effectId }
          };
        }
        var soundOverride = null;
        if (typeof args.sound === 'string' && args.sound.trim()) {
          soundOverride = normalizeEffectId(args.sound);
        } else if (typeof args.soundEffect === 'string' && args.soundEffect.trim()) {
          soundOverride = normalizeEffectId(args.soundEffect);
        } else if (typeof args.sfx === 'string' && args.sfx.trim()) {
          soundOverride = normalizeEffectId(args.sfx);
        }
        if (typeof bridge.playEffect !== 'function') {
          return bridgeMissingFailure(tool, 'Effets indisponibles', [
            'playEffect'
          ]);
        }
        var playOpts = { sound: soundOverride || true };
        if (effectText) playOpts.text = effectText;
        var played = bridge.playEffect(effectId, playOpts);
        if (played && played.ok === false) {
          return {
            ok: false,
            tool: tool,
            error: (played && played.error) || 'Effet \u00e9chou\u00e9',
            args: { effect: effectId, text: effectText || undefined }
          };
        }
        var resultArgs = { effect: effectId };
        if (effectText) resultArgs.text = effectText;
        if (soundOverride) resultArgs.sound = soundOverride;
        return {
          ok: true,
          tool: tool,
          args: resultArgs,
          summary: TOOL_LABELS.trigger_effect,
          detail: detailForTool(tool, null, null, null, null, args, {
            effect: effectId,
            text: effectText || undefined
          })
        };
      }
      if (tool === 'point_at') {
        var pointSection = normalizePointSection(
          args.section || args.target || args.area || args.panel
        );
        var pointField = normalizePointField(
          args.field || args.axis || args.dim
        );
        var pointLevel = normalizePointLevel(
          args.level != null ? args.level : args.value
        );
        if (pointLevel == null) {
          var inferredLevel = normalizePointLevel(
            args.field || args.axis || args.dim
          );
          if (inferredLevel != null) pointLevel = inferredLevel;
        }
        if (!pointSection && !pointField) {
          return {
            ok: false,
            tool: tool,
            error: 'section ou field requis'
          };
        }
        if (pointField && !pointSection) {
          pointSection = 'priority';
        }
        if (typeof bridge.pointAt !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Pointage indisponible'
          };
        }
        var pointArgs = {};
        if (pointSection) pointArgs.section = pointSection;
        if (pointField) pointArgs.field = pointField;
        if (pointLevel != null) pointArgs.level = pointLevel;
        var pointed = bridge.pointAt(pointArgs);
        if (pointed && typeof pointed.then === 'function') {
          pointed = await pointed;
        }
        if (pointed && pointed.ok === false) {
          return {
            ok: false,
            tool: tool,
            error: (pointed && pointed.error) || 'Cible introuvable',
            args: pointArgs
          };
        }
        return {
          ok: true,
          tool: tool,
          args: pointArgs,
          summary: TOOL_LABELS.point_at,
          detail: detailForTool(tool, null, null, null, null, args, {
            section: pointSection || undefined,
            field: pointField || undefined,
            level: pointLevel != null ? pointLevel : undefined
          })
        };
      }
      if (tool === 'set_agent_name') {
        if (typeof bridge.setAgentName !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Changement de nom indisponible'
          };
        }
        var newAgentName =
          typeof args.name === 'string' && args.name.trim()
            ? args.name.trim()
            : typeof args.text === 'string'
              ? args.text.trim()
              : '';
        if (!newAgentName) {
          return { ok: false, tool: tool, error: 'Nouveau nom requis' };
        }
        var beforeAgentName = '';
        if (typeof bridge.getProfile === 'function') {
          try {
            var profSnap = bridge.getProfile();
            if (profSnap && typeof profSnap.agentName === 'string') {
              beforeAgentName = profSnap.agentName.trim();
            }
          } catch (e) { /* ignore */ }
        }
        var renameAgentResult = await Promise.resolve(
          bridge.setAgentName(newAgentName)
        );
        if (!renameAgentResult || !renameAgentResult.ok) {
          var agentRenameReason =
            (renameAgentResult &&
              (renameAgentResult.reason || renameAgentResult.error)) ||
            'Changement de nom \u00e9chou\u00e9';
          if (agentRenameReason === 'empty-name') {
            agentRenameReason = 'Nouveau nom requis';
          }
          return { ok: false, tool: tool, error: agentRenameReason };
        }
        var afterAgentName =
          (renameAgentResult && renameAgentResult.name) || newAgentName;
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_agent_name,
          detail: detailForTool(tool, null, null, null, null, args, {
            before: beforeAgentName,
            after: afterAgentName
          })
        };
      }
      if (tool === 'set_agent_color') {
        if (typeof bridge.setAgentColor !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Changement de couleur indisponible'
          };
        }
        var newAgentColor = normalizeAgentColorArg(
          (typeof args.color === 'string' && args.color) ||
            (typeof args.aura === 'string' && args.aura) ||
            (typeof args.value === 'string' && args.value) ||
            (typeof args.text === 'string' && args.text) ||
            ''
        );
        if (!newAgentColor) {
          return {
            ok: false,
            tool: tool,
            error:
              'Couleur invalide (orange|yellow|\u2026|sky ou #RRGGBB)'
          };
        }
        var beforeAgentColor = '';
        if (typeof bridge.getProfile === 'function') {
          try {
            var colorSnap = bridge.getProfile();
            if (colorSnap && typeof colorSnap.agentColor === 'string') {
              beforeAgentColor = colorSnap.agentColor.trim();
            }
          } catch (eColor) { /* ignore */ }
        }
        var recolorResult = await Promise.resolve(
          bridge.setAgentColor(newAgentColor)
        );
        if (!recolorResult || !recolorResult.ok) {
          var recolorReason =
            (recolorResult && (recolorResult.reason || recolorResult.error)) ||
            'Changement de couleur \u00e9chou\u00e9';
          if (recolorReason === 'empty-color' || recolorReason === 'invalid-color') {
            recolorReason =
              'Couleur invalide (orange|yellow|\u2026|sky ou #RRGGBB)';
          }
          return { ok: false, tool: tool, error: recolorReason };
        }
        var afterAgentColor =
          (recolorResult && recolorResult.color) || newAgentColor;
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_agent_color,
          detail: detailForTool(tool, null, null, null, null, args, {
            before: beforeAgentColor,
            after: afterAgentColor
          })
        };
      }
      if (tool === 'set_agent_personality') {
        if (typeof bridge.setAgentPersonality !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Changement de personnalit\u00e9 indisponible'
          };
        }
        var newPersonality =
          typeof args.personality === 'string' && args.personality.trim()
            ? args.personality.trim()
            : typeof args.text === 'string' && args.text.trim()
              ? args.text.trim()
              : typeof args.value === 'string' && args.value.trim()
                ? args.value.trim()
                : '';
        if (!newPersonality) {
          return {
            ok: false,
            tool: tool,
            error: 'Personnalit\u00e9 requise'
          };
        }
        var personalityResult = await Promise.resolve(
          bridge.setAgentPersonality(newPersonality)
        );
        if (!personalityResult || !personalityResult.ok) {
          var personalityReason =
            (personalityResult &&
              (personalityResult.reason || personalityResult.error)) ||
            'Changement de personnalit\u00e9 \u00e9chou\u00e9';
          if (personalityReason === 'empty-personality') {
            personalityReason = 'Personnalit\u00e9 requise';
          }
          return { ok: false, tool: tool, error: personalityReason };
        }
        var afterPersonality =
          (personalityResult && personalityResult.personality) || newPersonality;
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_agent_personality,
          detail: detailForTool(tool, null, null, null, null, args, {
            after: afterPersonality
          })
        };
      }
      if (tool === 'upsert_person') {
        if (typeof bridge.upsertPerson !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Annuaire Personnes indisponible'
          };
        }
        var personPatch = {
          name: typeof args.name === 'string' ? args.name.trim() : '',
          matchText:
            typeof args.matchText === 'string'
              ? args.matchText.trim()
              : typeof args.id === 'string'
                ? args.id.trim()
                : '',
          relation: args.relation,
          aliases: args.aliases,
          roles: args.roles,
          email: args.email,
          phone: args.phone,
          notes: args.notes,
          addAlias: args.addAlias,
          addRole: args.addRole,
          trelloMemberId: args.trelloMemberId
        };
        if (typeof args.id === 'string' && args.id.trim()) {
          personPatch.id = args.id.trim();
        }
        if (!personPatch.name && !personPatch.matchText && !personPatch.id) {
          return { ok: false, tool: tool, error: 'Nom ou matchText requis' };
        }
        var peopleBeforeUpsert = getPeopleFromBridge(bridge);
        var personBeforeUpsert = null;
        if (
          global.People &&
          typeof global.People.findByAliasOrName === 'function'
        ) {
          if (personPatch.id) {
            for (var pbi = 0; pbi < peopleBeforeUpsert.length; pbi++) {
              if (peopleBeforeUpsert[pbi].id === personPatch.id) {
                personBeforeUpsert = peopleBeforeUpsert[pbi];
                break;
              }
            }
          }
          if (!personBeforeUpsert && personPatch.matchText) {
            personBeforeUpsert = global.People.findByAliasOrName(
              peopleBeforeUpsert,
              personPatch.matchText
            );
          }
          if (!personBeforeUpsert && personPatch.name) {
            personBeforeUpsert = global.People.findByAliasOrName(
              peopleBeforeUpsert,
              personPatch.name
            );
          }
        }
        var upsertResult = await Promise.resolve(
          bridge.upsertPerson(personPatch)
        );
        if (!upsertResult || !upsertResult.ok) {
          return {
            ok: false,
            tool: tool,
            error:
              (upsertResult && (upsertResult.reason || upsertResult.error)) ||
              'Mise \u00e0 jour personne \u00e9chou\u00e9e'
          };
        }
        // Sync into board Hors Trello catalog (same person-* id) so the
        // assignee picker and set_custom_assignees share the contact.
        if (
          upsertResult.person &&
          typeof bridge.upsertCustomAssigneeCatalog === 'function'
        ) {
          try {
            var horsDraft =
              global.People && typeof global.People.toCustomAssignee === 'function'
                ? global.People.toCustomAssignee(upsertResult.person)
                : {
                    id: upsertResult.person.id,
                    name: upsertResult.person.name,
                    trelloMemberId: upsertResult.person.trelloMemberId
                  };
            if (horsDraft && horsDraft.name) {
              await Promise.resolve(
                bridge.upsertCustomAssigneeCatalog(horsDraft)
              );
            }
          } catch (eSyncHors) { /* non-fatal */ }
        }
        var personAfterUpsert = upsertResult.person || null;
        var personCreated = !personBeforeUpsert;
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: personCreated
            ? 'Personne ajout\u00e9e.'
            : TOOL_LABELS.upsert_person,
          detail: detailForTool(tool, null, null, null, null, args, {
            name:
              (personAfterUpsert && personAfterUpsert.name) ||
              personPatch.name,
            person: personAfterUpsert,
            before: personBeforeUpsert,
            created: personCreated
          })
        };
      }
      if (tool === 'remove_person') {
        if (typeof bridge.removePerson !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Annuaire Personnes indisponible'
          };
        }
        var removeMatch =
          (typeof args.id === 'string' && args.id.trim()) ||
          (typeof args.matchText === 'string' && args.matchText.trim()) ||
          (typeof args.name === 'string' && args.name.trim()) ||
          (typeof args.text === 'string' && args.text.trim()) ||
          '';
        if (!removeMatch) {
          return { ok: false, tool: tool, error: 'matchText / name / id requis' };
        }
        var peopleBeforeRemove = getPeopleFromBridge(bridge);
        var personBeforeRemove = null;
        if (
          global.People &&
          typeof global.People.findByAliasOrName === 'function'
        ) {
          if (typeof args.id === 'string' && args.id.trim()) {
            for (var pri = 0; pri < peopleBeforeRemove.length; pri++) {
              if (peopleBeforeRemove[pri].id === args.id.trim()) {
                personBeforeRemove = peopleBeforeRemove[pri];
                break;
              }
            }
          }
          if (!personBeforeRemove) {
            personBeforeRemove = global.People.findByAliasOrName(
              peopleBeforeRemove,
              removeMatch
            );
          }
        }
        var removeResult = await Promise.resolve(
          bridge.removePerson({
            id: typeof args.id === 'string' ? args.id.trim() : '',
            matchText: removeMatch,
            name: typeof args.name === 'string' ? args.name.trim() : ''
          })
        );
        if (!removeResult || !removeResult.ok) {
          return {
            ok: false,
            tool: tool,
            error:
              (removeResult && (removeResult.reason || removeResult.error)) ||
              'Suppression personne \u00e9chou\u00e9e'
          };
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.remove_person,
          detail: detailForTool(tool, null, null, null, null, args, {
            match: removeMatch,
            name:
              (personBeforeRemove && personBeforeRemove.name) || removeMatch
          })
        };
      }
      if (tool === 'upsert_place') {
        if (typeof bridge.upsertPlace !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Annuaire Lieux indisponible'
          };
        }
        var placePatch = {
          name: typeof args.name === 'string' ? args.name.trim() : '',
          matchText:
            typeof args.matchText === 'string'
              ? args.matchText.trim()
              : typeof args.id === 'string'
                ? args.id.trim()
                : '',
          kind: args.kind,
          aliases: args.aliases,
          notes: args.notes,
          addAlias: args.addAlias
        };
        if (typeof args.id === 'string' && args.id.trim()) {
          placePatch.id = args.id.trim();
        }
        if (!placePatch.name && !placePatch.matchText && !placePatch.id) {
          return { ok: false, tool: tool, error: 'Nom ou matchText requis' };
        }
        var placesBeforeUpsert = getPlacesFromBridge(bridge);
        var placeBeforeUpsert = null;
        if (
          global.Places &&
          typeof global.Places.findByAliasOrName === 'function'
        ) {
          if (placePatch.id) {
            for (var pli = 0; pli < placesBeforeUpsert.length; pli++) {
              if (placesBeforeUpsert[pli].id === placePatch.id) {
                placeBeforeUpsert = placesBeforeUpsert[pli];
                break;
              }
            }
          }
          if (!placeBeforeUpsert && placePatch.matchText) {
            placeBeforeUpsert = global.Places.findByAliasOrName(
              placesBeforeUpsert,
              placePatch.matchText
            );
          }
          if (!placeBeforeUpsert && placePatch.name) {
            placeBeforeUpsert = global.Places.findByAliasOrName(
              placesBeforeUpsert,
              placePatch.name
            );
          }
        }
        var upsertPlaceResult = await Promise.resolve(
          bridge.upsertPlace(placePatch)
        );
        if (!upsertPlaceResult || !upsertPlaceResult.ok) {
          return {
            ok: false,
            tool: tool,
            error:
              (upsertPlaceResult &&
                (upsertPlaceResult.reason || upsertPlaceResult.error)) ||
              'Mise \u00e0 jour lieu \u00e9chou\u00e9e'
          };
        }
        if (
          upsertPlaceResult.place &&
          typeof bridge.upsertPlaceCatalog === 'function'
        ) {
          try {
            var placeDraft =
              global.Places && typeof global.Places.toCatalogEntry === 'function'
                ? global.Places.toCatalogEntry(upsertPlaceResult.place)
                : {
                    id: upsertPlaceResult.place.id,
                    name: upsertPlaceResult.place.name
                  };
            if (placeDraft && placeDraft.name) {
              await Promise.resolve(bridge.upsertPlaceCatalog(placeDraft));
            }
          } catch (eSyncPlace) { /* non-fatal */ }
        }
        var placeAfterUpsert = upsertPlaceResult.place || null;
        var placeCreated = !placeBeforeUpsert;
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: placeCreated
            ? 'Lieu ajout\u00e9.'
            : TOOL_LABELS.upsert_place,
          detail: detailForTool(tool, null, null, null, null, args, {
            name:
              (placeAfterUpsert && placeAfterUpsert.name) || placePatch.name,
            place: placeAfterUpsert,
            before: placeBeforeUpsert,
            created: placeCreated
          })
        };
      }
      if (tool === 'remove_place') {
        if (typeof bridge.removePlace !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Annuaire Lieux indisponible'
          };
        }
        var removePlaceMatch =
          (typeof args.id === 'string' && args.id.trim()) ||
          (typeof args.matchText === 'string' && args.matchText.trim()) ||
          (typeof args.name === 'string' && args.name.trim()) ||
          (typeof args.text === 'string' && args.text.trim()) ||
          '';
        if (!removePlaceMatch) {
          return { ok: false, tool: tool, error: 'matchText / name / id requis' };
        }
        var placesBeforeRemove = getPlacesFromBridge(bridge);
        var placeBeforeRemove = null;
        if (
          global.Places &&
          typeof global.Places.findByAliasOrName === 'function'
        ) {
          if (typeof args.id === 'string' && args.id.trim()) {
            for (var priP = 0; priP < placesBeforeRemove.length; priP++) {
              if (placesBeforeRemove[priP].id === args.id.trim()) {
                placeBeforeRemove = placesBeforeRemove[priP];
                break;
              }
            }
          }
          if (!placeBeforeRemove) {
            placeBeforeRemove = global.Places.findByAliasOrName(
              placesBeforeRemove,
              removePlaceMatch
            );
          }
        }
        var removePlaceResult = await Promise.resolve(
          bridge.removePlace({
            id: typeof args.id === 'string' ? args.id.trim() : '',
            matchText: removePlaceMatch,
            name: typeof args.name === 'string' ? args.name.trim() : ''
          })
        );
        if (!removePlaceResult || !removePlaceResult.ok) {
          return {
            ok: false,
            tool: tool,
            error:
              (removePlaceResult &&
                (removePlaceResult.reason || removePlaceResult.error)) ||
              'Suppression lieu \u00e9chou\u00e9e'
          };
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.remove_place,
          detail: detailForTool(tool, null, null, null, null, args, {
            match: removePlaceMatch,
            name:
              (placeBeforeRemove && placeBeforeRemove.name) || removePlaceMatch
          })
        };
      }
      if (tool === 'set_places') {
        if (typeof bridge.setPlaces !== 'function') {
          return { ok: false, tool: tool, error: 'Lieux carte indisponibles' };
        }
        var placesDir = getPlacesFromBridge(bridge);
        var stateForPlaces =
          typeof bridge.getPriorityState === 'function'
            ? bridge.getPriorityState() || {}
            : {};
        var currentPlaces =
          global.Places && typeof global.Places.normalizePlaces === 'function'
            ? global.Places.normalizePlaces(stateForPlaces.places)
            : stateForPlaces.places && typeof stateForPlaces.places === 'object'
              ? stateForPlaces.places
              : {};
        var nextPlaces = args.clear === true ? {} : Object.assign({}, currentPlaces);
        function resolveSlot(spec) {
          if (spec == null || spec === '' || spec === false) return null;
          if (spec === true) return null;
          var resolved =
            global.Places && typeof global.Places.resolvePlaceSpec === 'function'
              ? global.Places.resolvePlaceSpec(placesDir, spec)
              : null;
          if (resolved) return resolved;
          var name =
            typeof spec === 'string'
              ? spec.trim()
              : spec && typeof spec.name === 'string'
                ? spec.name.trim()
                : '';
          if (!name) return null;
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.createPlaceRef === 'function'
          ) {
            return PriorityUI.createPlaceRef(name);
          }
          return { id: 'place-temp-' + Math.random().toString(36).slice(2, 8), name: name };
        }
        if (Object.prototype.hasOwnProperty.call(args, 'from')) {
          var fromRef = resolveSlot(args.from);
          if (fromRef) nextPlaces.from = fromRef;
          else delete nextPlaces.from;
        }
        if (Object.prototype.hasOwnProperty.call(args, 'to')) {
          var toRef = resolveSlot(args.to);
          if (toRef) nextPlaces.to = toRef;
          else delete nextPlaces.to;
        }
        if (Object.prototype.hasOwnProperty.call(args, 'at')) {
          var atRef = resolveSlot(args.at);
          if (atRef) nextPlaces.at = atRef;
          else delete nextPlaces.at;
        }
        if (
          global.Places &&
          typeof global.Places.normalizePlaces === 'function'
        ) {
          nextPlaces = global.Places.normalizePlaces(nextPlaces);
        }
        var setPlacesResult = await Promise.resolve(bridge.setPlaces(nextPlaces));
        if (!setPlacesResult || setPlacesResult.ok === false) {
          return {
            ok: false,
            tool: tool,
            error:
              (setPlacesResult &&
                (setPlacesResult.reason || setPlacesResult.error)) ||
              'Mise \u00e0 jour lieux \u00e9chou\u00e9e'
          };
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_places,
          detail: detailForTool(tool, null, null, null, null, args, {
            places: (setPlacesResult && setPlacesResult.places) || nextPlaces
          })
        };
      }
      if (tool === 'toggle_subtask' || tool === 'set_subtask_progress') {
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
      }
      if (tool === 'set_members') {
        if (
          typeof bridge.addMember !== 'function' &&
          typeof bridge.removeMember !== 'function'
        ) {
          return bridgeMissingFailure(
            tool,
            'Assign\u00e9s indisponibles',
            ['addMember', 'removeMember']
          );
        }
        var boardMembers = [];
        if (typeof bridge.loadBoardMembers === 'function') {
          boardMembers = await Promise.resolve(bridge.loadBoardMembers());
        } else if (typeof bridge.getBoardMembers === 'function') {
          boardMembers = await Promise.resolve(bridge.getBoardMembers());
        }
        if (!Array.isArray(boardMembers)) boardMembers = [];
        var addSpecs = [];
        if (Array.isArray(args.add)) addSpecs = args.add.slice();
        else if (args.add != null) addSpecs = [args.add];
        else if (args.memberId != null || args.matchText || args.name) {
          addSpecs = [args];
        }
        var removeSpecs = [];
        if (Array.isArray(args.remove)) removeSpecs = args.remove.slice();
        else if (args.remove != null) removeSpecs = [args.remove];
        if (args.clear === true && typeof bridge.getOwnership === 'function') {
          var own = bridge.getOwnership() || {};
          var cur = Array.isArray(own.members) ? own.members : [];
          removeSpecs = removeSpecs.concat(cur);
        }
        if (!addSpecs.length && !removeSpecs.length) {
          return actionFailure(tool, 'Aucun membre \u00e0 ajouter ou retirer', {
            code: 'empty-ops',
            hint: 'Passe add[], remove[], ou clear:true.',
            args: args
          });
        }
        var memberOps = [];
        var mi;
        for (mi = 0; mi < removeSpecs.length; mi++) {
          var rm = matchBoardMember(boardMembers, removeSpecs[mi]);
          if (!rm && removeSpecs[mi] && removeSpecs[mi].id != null) {
            rm = { id: String(removeSpecs[mi].id) };
          }
          if (!rm || !rm.id) {
            return actionFailure(tool, 'Membre \u00e0 retirer introuvable', {
              code: 'member-not-found',
              cause: 'spec: ' + summarizeMemberSpec(removeSpecs[mi]),
              hint:
                'Aucun membre du tableau ne correspond. Utilise context.boardMembers / ownership.',
              args: args
            });
          }
          if (typeof bridge.removeMember !== 'function') {
            return bridgeMissingFailure(
              tool,
              'Retrait membre indisponible',
              ['removeMember']
            );
          }
          var rmRes = await Promise.resolve(bridge.removeMember(rm.id));
          if (!rmRes || rmRes.ok === false) {
            return bridgeOpFailure(tool, 'Retrait membre \u00e9chou\u00e9', rmRes);
          }
          memberOps.push('−' + (rm.fullName || rm.username || rm.id));
        }
        for (mi = 0; mi < addSpecs.length; mi++) {
          var am = matchBoardMember(boardMembers, addSpecs[mi]);
          if (!am || !am.id) {
            return actionFailure(tool, 'Membre \u00e0 assigner introuvable', {
              code: 'member-not-found',
              cause: 'spec: ' + summarizeMemberSpec(addSpecs[mi]),
              hint:
                'Aucun membre du tableau ne correspond. Utilise context.boardMembers / ownership.',
              args: args
            });
          }
          if (typeof bridge.addMember !== 'function') {
            return bridgeMissingFailure(
              tool,
              'Ajout membre indisponible',
              ['addMember']
            );
          }
          var amRes = await Promise.resolve(bridge.addMember(am.id));
          if (!amRes || amRes.ok === false) {
            return bridgeOpFailure(tool, 'Ajout membre \u00e9chou\u00e9', amRes);
          }
          memberOps.push('+' + (am.fullName || am.username || am.id));
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_members,
          detail: detailForTool(tool, null, null, null, null, args, {
            ops: memberOps
          })
        };
      }
      if (tool === 'set_labels') {
        if (
          typeof bridge.addLabel !== 'function' &&
          typeof bridge.removeLabel !== 'function' &&
          typeof bridge.createLabel !== 'function'
        ) {
          return bridgeMissingFailure(
            tool,
            '\u00c9tiquettes indisponibles',
            ['addLabel', 'removeLabel', 'createLabel']
          );
        }
        var boardLabels = [];
        if (typeof bridge.loadBoardLabels === 'function') {
          boardLabels = await Promise.resolve(bridge.loadBoardLabels());
        } else if (typeof bridge.getBoardLabels === 'function') {
          boardLabels = await Promise.resolve(bridge.getBoardLabels());
        }
        if (!Array.isArray(boardLabels)) boardLabels = [];
        var cardLabels = [];
        if (typeof bridge.loadCardLabels === 'function') {
          cardLabels = await Promise.resolve(bridge.loadCardLabels());
        } else if (typeof bridge.getCardLabels === 'function') {
          cardLabels = await Promise.resolve(bridge.getCardLabels());
        }
        if (!Array.isArray(cardLabels)) cardLabels = [];
        var labelPool = boardLabels.length ? boardLabels : cardLabels;
        var addLabelSpecs = [];
        if (Array.isArray(args.add)) addLabelSpecs = args.add.slice();
        else if (args.add != null) addLabelSpecs = [args.add];
        var removeLabelSpecs = [];
        if (Array.isArray(args.remove)) removeLabelSpecs = args.remove.slice();
        else if (args.remove != null) removeLabelSpecs = [args.remove];
        if (args.clear === true) {
          removeLabelSpecs = removeLabelSpecs.concat(cardLabels);
        }
        var createSpec =
          args.create && typeof args.create === 'object' ? args.create : null;
        if (
          !addLabelSpecs.length &&
          !removeLabelSpecs.length &&
          !createSpec
        ) {
          return {
            ok: false,
            tool: tool,
            error: 'Aucune \u00e9tiquette \u00e0 modifier'
          };
        }
        var labelOps = [];
        var li;
        for (li = 0; li < removeLabelSpecs.length; li++) {
          var rl =
            matchBoardLabel(cardLabels, removeLabelSpecs[li]) ||
            matchBoardLabel(labelPool, removeLabelSpecs[li]);
          if (!rl || !rl.id) {
            return {
              ok: false,
              tool: tool,
              error: '\u00c9tiquette \u00e0 retirer introuvable'
            };
          }
          if (typeof bridge.removeLabel !== 'function') {
            return {
              ok: false,
              tool: tool,
              error: 'Retrait \u00e9tiquette indisponible'
            };
          }
          var rlRes = await Promise.resolve(bridge.removeLabel(rl.id));
          if (!rlRes || rlRes.ok === false) {
            return {
              ok: false,
              tool: tool,
              error:
                (rlRes && (rlRes.reason || rlRes.error)) ||
                'Retrait \u00e9tiquette \u00e9chou\u00e9'
            };
          }
          labelOps.push('−' + (rl.name || rl.id));
        }
        for (li = 0; li < addLabelSpecs.length; li++) {
          var al = matchBoardLabel(labelPool, addLabelSpecs[li]);
          if (!al || !al.id) {
            return {
              ok: false,
              tool: tool,
              error: '\u00c9tiquette \u00e0 ajouter introuvable'
            };
          }
          if (typeof bridge.addLabel !== 'function') {
            return {
              ok: false,
              tool: tool,
              error: 'Ajout \u00e9tiquette indisponible'
            };
          }
          var alRes = await Promise.resolve(bridge.addLabel(al.id));
          if (!alRes || alRes.ok === false) {
            return {
              ok: false,
              tool: tool,
              error:
                (alRes && (alRes.reason || alRes.error)) ||
                'Ajout \u00e9tiquette \u00e9chou\u00e9'
            };
          }
          labelOps.push('+' + (al.name || al.id));
        }
        if (createSpec) {
          var createName =
            typeof createSpec.name === 'string'
              ? createSpec.name.trim()
              : typeof createSpec.matchText === 'string'
                ? createSpec.matchText.trim()
                : '';
          if (!createName) {
            return {
              ok: false,
              tool: tool,
              error: 'create.name requis'
            };
          }
          if (typeof bridge.createLabel !== 'function') {
            return {
              ok: false,
              tool: tool,
              error: 'Cr\u00e9ation \u00e9tiquette indisponible'
            };
          }
          var crRes = await Promise.resolve(
            bridge.createLabel({
              name: createName,
              color: createSpec.color
            })
          );
          if (!crRes || crRes.ok === false) {
            return {
              ok: false,
              tool: tool,
              error:
                (crRes && (crRes.reason || crRes.error)) ||
                'Cr\u00e9ation \u00e9tiquette \u00e9chou\u00e9e'
            };
          }
          labelOps.push(
            '+new:' +
              ((crRes.label && crRes.label.name) || createName)
          );
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_labels,
          detail: detailForTool(tool, null, null, null, null, args, {
            ops: labelOps
          })
        };
      }
      if (tool === 'set_custom_assignees') {
        if (typeof bridge.applyPriority !== 'function') {
          return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
        }
        var beforePri = snapshotPriority(bridge);
        var stateForPeople =
          typeof bridge.getPriorityState === 'function'
            ? bridge.getPriorityState() || {}
            : {};
        var people = Array.isArray(stateForPeople.customAssignees)
          ? stateForPeople.customAssignees.slice()
          : [];
        if (
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.normalizeCustomAssignees === 'function'
        ) {
          people = PriorityUI.normalizeCustomAssignees(people);
        }
        var peopleDirForAssign = getPeopleFromBridge(bridge);
        if (args.clear === true) {
          people = [];
        }
        var removePeople = [];
        if (Array.isArray(args.remove)) removePeople = args.remove;
        else if (args.remove != null) removePeople = [args.remove];
        for (var rpi = 0; rpi < removePeople.length; rpi++) {
          var hit = matchCustomAssignee(
            people,
            removePeople[rpi],
            peopleDirForAssign
          );
          if (!hit) {
            return {
              ok: false,
              tool: tool,
              error: 'Personne \u00e0 retirer introuvable'
            };
          }
          people = people.filter(function (p) {
            return !p || String(p.id) !== String(hit.id);
          });
        }
        var addPeople = [];
        if (Array.isArray(args.add)) addPeople = args.add;
        else if (args.add != null) addPeople = [args.add];
        for (var api = 0; api < addPeople.length; api++) {
          var spec = addPeople[api];
          var existing = matchCustomAssignee(
            people,
            spec,
            peopleDirForAssign
          );
          if (existing) continue;
          // Also try board Hors Trello catalog before creating a new entry.
          if (
            typeof bridge.getCustomAssigneeCatalog === 'function' &&
            typeof PriorityUI !== 'undefined'
          ) {
            try {
              var catalog = bridge.getCustomAssigneeCatalog() || [];
              var catalogHit = matchCustomAssignee(
                catalog,
                spec,
                peopleDirForAssign
              );
              if (catalogHit) {
                people.push(catalogHit);
                continue;
              }
            } catch (eCat) { /* ignore */ }
          }
          var created = draftCustomAssigneeFromSpec(spec, peopleDirForAssign);
          if (!created || !created.name) {
            return {
              ok: false,
              tool: tool,
              error: 'Nom de personne requis'
            };
          }
          people.push(created);
        }
        if (
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.normalizeCustomAssignees === 'function'
        ) {
          people = PriorityUI.normalizeCustomAssignees(people);
        }
        if (typeof bridge.setCustomAssignees === 'function') {
          var peopleRes = await Promise.resolve(bridge.setCustomAssignees(people));
          if (peopleRes && peopleRes.ok === false) {
            return {
              ok: false,
              tool: tool,
              error:
                (peopleRes.reason || peopleRes.error) ||
                'Personnes assign\u00e9es \u00e9chou\u00e9es'
            };
          }
        } else {
          bridge.applyPriority({ customAssignees: people });
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_custom_assignees,
          detail: detailForTool(
            tool,
            beforePri,
            snapshotPriority(bridge),
            null,
            null,
            args,
            { count: people.length }
          )
        };
      }
      if (tool === 'set_member_roles') {
        if (typeof bridge.applyPriority !== 'function') {
          return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
        }
        var stateRoles =
          typeof bridge.getPriorityState === 'function'
            ? bridge.getPriorityState() || {}
            : {};
        var rolesMap =
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.normalizeMemberRoles === 'function'
            ? PriorityUI.normalizeMemberRoles(stateRoles.memberRoles)
            : stateRoles.memberRoles && typeof stateRoles.memberRoles === 'object'
              ? Object.assign({}, stateRoles.memberRoles)
              : {};
        var boardMembersForRoles = [];
        if (typeof bridge.loadBoardMembers === 'function') {
          boardMembersForRoles = await Promise.resolve(bridge.loadBoardMembers());
        } else if (typeof bridge.getBoardMembers === 'function') {
          boardMembersForRoles = bridge.getBoardMembers() || [];
        }
        var ownershipForRoles =
          typeof bridge.getOwnership === 'function'
            ? bridge.getOwnership() || {}
            : {};
        var poolMembers = (boardMembersForRoles || []).concat(
          ownershipForRoles.members || []
        );
        var customsForRoles = Array.isArray(stateRoles.customAssignees)
          ? stateRoles.customAssignees
          : [];
        var peopleDirForRoles = getPeopleFromBridge(bridge);
        var targetMember =
          matchBoardMember(poolMembers, args) ||
          matchCustomAssignee(customsForRoles, args, peopleDirForRoles);
        if ((!targetMember || !targetMember.id) && args.memberId) {
          targetMember = { id: String(args.memberId) };
        }
        if (!targetMember || !targetMember.id) {
          return {
            ok: false,
            tool: tool,
            error: 'Assign\u00e9 introuvable pour les r\u00f4les'
          };
        }
        var mid = String(targetMember.id);
        if (args.clear === true) {
          delete rolesMap[mid];
        } else {
          var roleSpecs = Array.isArray(args.roles)
            ? args.roles
            : args.role != null
              ? [args.role]
              : [];
          if (!roleSpecs.length) {
            return {
              ok: false,
              tool: tool,
              error: 'roles requis (ex. subtitles|Montage)'
            };
          }
          var nextRoles = [];
          for (var ri = 0; ri < roleSpecs.length; ri++) {
            var rid = resolveMemberRoleId(roleSpecs[ri]);
            if (!rid) {
              return {
                ok: false,
                tool: tool,
                error: 'R\u00f4le inconnu\u00a0: ' + String(roleSpecs[ri])
              };
            }
            if (nextRoles.indexOf(rid) === -1) nextRoles.push(rid);
          }
          rolesMap[mid] = nextRoles;
        }
        if (
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.normalizeMemberRoles === 'function'
        ) {
          rolesMap = PriorityUI.normalizeMemberRoles(rolesMap);
        }
        if (typeof bridge.setMemberRoles === 'function') {
          var rolesRes = await Promise.resolve(bridge.setMemberRoles(rolesMap));
          if (rolesRes && rolesRes.ok === false) {
            return {
              ok: false,
              tool: tool,
              error:
                (rolesRes.reason || rolesRes.error) ||
                'R\u00f4les \u00e9chou\u00e9s'
            };
          }
        } else {
          bridge.applyPriority({ memberRoles: rolesMap });
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_member_roles,
          detail: detailForTool(tool, null, null, null, null, args, {
            memberId: mid,
            roles: rolesMap[mid] || []
          })
        };
      }
      if (tool === 'add_checklist_item') {
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
      }
      if (
        tool === 'remove_checklist_item' ||
        tool === 'rename_checklist_item' ||
        tool === 'set_checklist_progress'
      ) {
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
      }
      if (
        tool === 'history_undo' ||
        tool === 'history_redo' ||
        tool === 'history_revert'
      ) {
        if (tool === 'history_undo') {
          if (typeof bridge.historyUndo !== 'function') {
            return { ok: false, tool: tool, error: 'Historique indisponible' };
          }
          var undoRes = await Promise.resolve(bridge.historyUndo());
          if (!undoRes) {
            return { ok: false, tool: tool, error: 'Rien \u00e0 annuler' };
          }
          return {
            ok: true,
            tool: tool,
            args: args,
            summary: TOOL_LABELS.history_undo
          };
        }
        if (tool === 'history_redo') {
          if (typeof bridge.historyRedo !== 'function') {
            return { ok: false, tool: tool, error: 'Historique indisponible' };
          }
          var redoRes = await Promise.resolve(bridge.historyRedo());
          if (!redoRes) {
            return { ok: false, tool: tool, error: 'Rien \u00e0 r\u00e9tablir' };
          }
          return {
            ok: true,
            tool: tool,
            args: args,
            summary: TOOL_LABELS.history_redo
          };
        }
        if (typeof bridge.historyRevert !== 'function') {
          return { ok: false, tool: tool, error: 'Historique indisponible' };
        }
        var entryId =
          typeof args.entryId === 'string'
            ? args.entryId.trim()
            : typeof args.id === 'string'
              ? args.id.trim()
              : '';
        if (!entryId && typeof bridge.getHistory === 'function') {
          var hist = bridge.getHistory() || {};
          var entries = Array.isArray(hist.entries) ? hist.entries : [];
          var matchLabel =
            typeof args.matchLabel === 'string'
              ? args.matchLabel.trim()
              : typeof args.label === 'string'
                ? args.label.trim()
                : '';
          if (matchLabel) {
            var needle = normalizeMatchKey(matchLabel);
            for (var hi = 0; hi < entries.length; hi++) {
              if (
                entries[hi] &&
                !entries[hi].undone &&
                normalizeMatchKey(entries[hi].label || '').indexOf(needle) >= 0
              ) {
                entryId = entries[hi].id;
                break;
              }
            }
          } else if (args.steps != null) {
            var steps = Math.max(1, Math.round(Number(args.steps)) || 1);
            var active = entries.filter(function (e) {
              return e && !e.undone;
            });
            var target = active[Math.min(steps, active.length) - 1];
            if (target) entryId = target.id;
          }
        }
        if (!entryId) {
          return {
            ok: false,
            tool: tool,
            error: 'entryId ou matchLabel requis'
          };
        }
        var revertRes = await Promise.resolve(bridge.historyRevert(entryId));
        if (!revertRes) {
          return {
            ok: false,
            tool: tool,
            error: 'Entr\u00e9e d\'historique introuvable'
          };
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.history_revert,
          detail: detailForTool(tool, null, null, null, null, args, {
            entryId: entryId
          })
        };
      }
      return { ok: false, tool: tool, error: 'Outil inconnu\u00a0: ' + tool };
    } catch (err) {
      var msg = (err && err.message) || '\u00c9chec d\'ex\u00e9cution';
      var causeLine = '';
      if (err && err.stack) {
        causeLine = String(err.stack).split('\n')[0];
      } else if (err != null) {
        causeLine = String(err);
      }
      dbgError('agent', 'actions.executeOne', err, { tool: tool });
      return actionFailure(tool, msg, {
        code: 'exception',
        cause: causeLine || undefined,
        hint: 'Exception pendant l\'ex\u00e9cution de l\'outil.'
      });
    }
  }

  /**
   * Attach a structured `visual` payload for chat result cards when missing.
   * Uses post-action bridge snapshots so the synthesizer stays dumb.
   */
  function enrichResultVisual(bridge, result) {
    if (!result || !result.ok || result.visual) return result;
    var tool = result.tool;
    var args = result.args || {};
    try {
      if (tool === 'set_priority') {
        var pri = snapshotPriority(bridge);
        var tierLabel = '';
        var matrixLabel = '';
        if (
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.baselineScore === 'function' &&
          typeof PriorityUI.tierFor === 'function' &&
          pri.priorityEnabled !== false
        ) {
          var score = PriorityUI.baselineScore(pri.urgency, pri.impact, pri.ease);
          var tier = PriorityUI.tierFor(score);
          if (tier && tier.label) tierLabel = tier.label;
          if (typeof PriorityUI.resolveDisplay === 'function') {
            try {
              var display = PriorityUI.resolveDisplay(
                {
                  score: score,
                  urgency: pri.urgency,
                  impact: pri.impact,
                  ease: pri.ease
                },
                {
                  urgency: pri.urgency,
                  impact: pri.impact,
                  ease: pri.ease,
                  priorityEnabled: pri.priorityEnabled !== false
                }
              );
              if (display && display.matrixLabel) {
                matrixLabel = String(display.matrixLabel);
              }
              if (
                (!tierLabel || tierLabel === 'Priorit\u00e9') &&
                display &&
                display.label
              ) {
                tierLabel = String(display.label);
              }
            } catch (eDisplay) {
              /* ignore */
            }
          }
        }
        if (!tierLabel && args.tier) tierLabel = String(args.tier);
        var visual = {
          type: 'priority',
          tier: tierLabel || 'Priorit\u00e9',
          urgency: pri.urgency,
          impact: pri.impact,
          ease: pri.ease,
          priorityEnabled: pri.priorityEnabled !== false
        };
        if (matrixLabel) visual.matrixLabel = matrixLabel;
        result.visual = visual;
        return result;
      }
      if (
        tool === 'add_subtask' ||
        tool === 'rename_subtask' ||
        tool === 'toggle_subtask' ||
        tool === 'set_subtask_blocked' ||
        tool === 'set_subtask_progress' ||
        tool === 'set_subtask_estimate' ||
        tool === 'remove_subtask'
      ) {
        var comp = snapshotCompletion(bridge);
        var item = null;
        var id = result.id || args.id;
        if (id && comp.items) {
          for (var i = 0; i < comp.items.length; i++) {
            if (String(comp.items[i].id) === String(id)) {
              item = comp.items[i];
              break;
            }
          }
        }
        if (!item && args.matchText && comp.items) {
          var needle = normalizeSubtaskTitleKey(args.matchText);
          for (var j = 0; j < comp.items.length; j++) {
            if (normalizeSubtaskTitleKey(comp.items[j].text) === needle) {
              item = comp.items[j];
              break;
            }
          }
        }
        if (tool === 'remove_subtask') {
          result.visual = {
            type: 'subtask',
            text:
              (item && item.text) ||
              (typeof args.matchText === 'string' ? args.matchText : '') ||
              'Sous-t\u00e2che',
            removed: true,
            id: id != null ? String(id) : undefined
          };
          return result;
        }
        var text =
          (item && item.text) ||
          (typeof args.text === 'string' ? args.text.trim() : '') ||
          (typeof args.matchText === 'string' ? args.matchText.trim() : '') ||
          'Sous-t\u00e2che';
        result.visual = {
          type: 'subtask',
          text: text,
          id: (item && item.id) || (id != null ? String(id) : undefined),
          done: item ? !!item.done : !!args.done,
          blocked: item ? !!item.blocked : !!args.blocked,
          progress: item && item.progress != null ? item.progress : undefined,
          estimatedMinutes:
            item && item.estimatedMinutes != null
              ? item.estimatedMinutes
              : resolveEstimateMinutesArg(args)
        };
        return result;
      }
      if (tool === 'set_due') {
        var dueSnap = snapshotPriority(bridge);
        if (!dueSnap.dueEnabled && !dueSnap.dueVague) {
          result.visual = { type: 'due', cleared: true };
        } else if (dueSnap.dueVague) {
          result.visual = {
            type: 'due',
            dueVague: dueSnap.dueVague,
            dueMode: 'vague',
            dueBand: 'far'
          };
        } else {
          var dueBand = '';
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.dueProximityBand === 'function' &&
            dueSnap.dueDate
          ) {
            try {
              dueBand =
                PriorityUI.dueProximityBand(dueSnap.dueDate, dueSnap.dueTime) ||
                '';
            } catch (eBand) {
              dueBand = '';
            }
          }
          result.visual = {
            type: 'due',
            dueDate: dueSnap.dueDate || '',
            dueTime: dueSnap.dueTime || '',
            dueMode: 'precise',
            recurrence: dueSnap.recurrence || undefined,
            startDate: dueSnap.startDate || undefined
          };
          if (dueBand) result.visual.dueBand = dueBand;
        }
        return result;
      }
      if (tool === 'set_blocked') {
        var blockedSnap = snapshotPriority(bridge);
        if (!blockedSnap.enAttente) {
          result.visual = { type: 'blocked', enabled: false, cleared: true };
        } else {
          var blockedVisual = { type: 'blocked', enabled: true };
          if (
            Array.isArray(blockedSnap.blockedReasons) &&
            blockedSnap.blockedReasons.length
          ) {
            blockedVisual.reasons = blockedSnap.blockedReasons.slice();
          } else if (Array.isArray(args.blockedReasons) && args.blockedReasons.length) {
            blockedVisual.reasons = args.blockedReasons
              .map(function (r) {
                return typeof r === 'string' ? r.trim() : '';
              })
              .filter(Boolean);
          }
          var linkSrc =
            Array.isArray(blockedSnap.blockedLinks) && blockedSnap.blockedLinks.length
              ? blockedSnap.blockedLinks
              : Array.isArray(args.blockedLinks)
                ? args.blockedLinks
                : [];
          if (linkSrc.length) {
            blockedVisual.links = linkSrc
              .map(function (link) {
                if (!link) return null;
                if (typeof link === 'string') return { label: link };
                var label =
                  (typeof link.label === 'string' && link.label.trim()) ||
                  (typeof link.matchText === 'string' && link.matchText.trim()) ||
                  '';
                var id = link.id != null ? String(link.id) : '';
                if (!label && !id) return null;
                var entry = {};
                if (label) entry.label = label;
                if (id) entry.id = id;
                return entry;
              })
              .filter(Boolean);
          }
          result.visual = blockedVisual;
        }
        return result;
      }
      if (tool === 'set_task_types') {
        var typeSnap = snapshotPriority(bridge);
        var typeIds =
          Array.isArray(typeSnap.taskTypes) && typeSnap.taskTypes.length
            ? typeSnap.taskTypes
            : Array.isArray(args.types)
              ? args.types
              : [];
        if (typeIds.length) {
          result.visual = {
            type: 'task_types',
            types: typeIds.map(function (id) {
              return typeof id === 'string' ? id : id && id.id;
            }).filter(Boolean)
          };
        }
        return result;
      }
      if (tool === 'set_statut') {
        result.visual = {
          type: 'statut',
          listName:
            (args && (args.listName || args.matchList)) ||
            '',
          listId: args.listId || undefined,
          category: args.category || undefined
        };
        if (result.detail && typeof result.detail === 'string') {
          var listMatch = result.detail.match(/list\s*[:=→>]\s*([^;]+)/i);
          if (listMatch) result.visual.listName = listMatch[1].trim();
          var idMatch = result.detail.match(/\bid\s*[:=]\s*([^;]+)/i);
          if (idMatch) result.visual.listId = idMatch[1].trim();
        }
        if (!result.visual.listName && args.matchList) {
          result.visual.listName = String(args.matchList);
        }
        return result;
      }
      if (tool === 'set_project') {
        if (args.clear === true) {
          result.visual = { type: 'project', cleared: true };
        } else {
          result.visual = {
            type: 'project',
            name: args.name || args.matchText || '',
            projectId: args.projectId || undefined
          };
          if (result.detail && typeof result.detail === 'string') {
            var pn = result.detail.match(/projet\s*[:=→>]\s*([^;]+)/i);
            if (pn) result.visual.name = pn[1].trim();
          }
        }
        return result;
      }
      if (
        tool === 'set_progress' ||
        tool === 'set_progress_estimate' ||
        tool === 'complete_all_subtasks' ||
        tool === 'reset_progress'
      ) {
        var prog = snapshotCompletion(bridge);
        var doneCount = 0;
        (prog.items || []).forEach(function (it) {
          if (it.done) doneCount += 1;
        });
        result.visual = {
          type: 'progress',
          progress: prog.progress,
          progressEnabled: prog.progressEnabled !== false,
          estimatedMinutes: prog.estimatedMinutes,
          doneCount: doneCount,
          totalCount: (prog.items || []).length
        };
        return result;
      }
      if (tool === 'set_members' || tool === 'set_custom_assignees') {
        var people = [];
        if (result.detail && typeof result.detail === 'string') {
          result.detail.split(/[;,]/).forEach(function (part) {
            var t = part.trim();
            if (!t) return;
            if (t.charAt(0) === '+' || t.charAt(0) === '−' || t.charAt(0) === '-') {
              people.push({
                name: t.slice(1).trim(),
                op: t.charAt(0) === '+' ? 'add' : 'remove'
              });
            }
          });
        }
        if (!people.length && Array.isArray(args.add)) {
          args.add.forEach(function (a) {
            var n =
              typeof a === 'string'
                ? a
                : a && (a.fullName || a.name || a.username);
            if (n) people.push({ name: String(n), op: 'add' });
          });
        }
        if (people.length) {
          result.visual = { type: 'members', people: people };
        }
        return result;
      }
      if (tool === 'set_labels') {
        var labels = [];
        if (result.detail && typeof result.detail === 'string') {
          result.detail.split(/[;,]/).forEach(function (part) {
            var t = part.trim();
            if (!t) return;
            if (t.charAt(0) === '+' || t.charAt(0) === '−' || t.charAt(0) === '-') {
              labels.push({
                name: t.slice(1).trim(),
                op: t.charAt(0) === '+' ? 'add' : 'remove'
              });
            }
          });
        }
        if (labels.length) {
          result.visual = { type: 'labels', labels: labels };
        }
        return result;
      }
    } catch (err) {
      console.error('enrichResultVisual failed', err);
    }
    return result;
  }

  /** Present-tense, user-facing label for one action ("Je débloque la tâche"). */
  function describeActionStep(action) {
    var tool = action && action.tool;
    var args = (action && action.args) || {};
    var has = function (k) {
      return Object.prototype.hasOwnProperty.call(args, k);
    };
    switch (tool) {
      case 'set_blocked':
        if (args.enAttente === false) return 'Je débloque la tâche';
        if (Array.isArray(args.blockedReasons) && args.blockedReasons.length) {
          return 'Je note la cause du blocage';
        }
        return 'Je marque la tâche comme bloquée';
      case 'set_subtask_blocked':
        return args.blocked === false
          ? 'Je débloque la sous-tâche'
          : 'Je bloque la sous-tâche';
      case 'set_priority': return 'Je mets à jour la priorité';
      case 'set_due': return 'Je définis l\'échéance';
      case 'set_progress':
        return has('progress') ? 'Je mets le progrès à jour' : 'Je configure le progrès';
      case 'set_statut': return 'Je change le statut';
      case 'add_subtask': return 'J\'ajoute une sous-tâche';
      case 'rename_subtask': return 'Je renomme la sous-tâche';
      case 'remove_subtask': return 'Je supprime la sous-tâche';
      case 'complete_all_subtasks': return 'Je termine toutes les sous-tâches';
      case 'reset_progress': return 'Je réinitialise le progrès';
      case 'rename_card': return 'Je renomme la carte';
      case 'set_description': return 'Je mets la description à jour';
      case 'set_project': return 'Je lie la carte au projet';
      case 'trigger_effect': return 'Je lance un effet';
      case 'point_at': return 'Je te montre la section';
      default:
        return TOOL_LABELS[tool]
          ? 'Je fais : ' + TOOL_LABELS[tool].replace(/\.$/, '').toLowerCase()
          : 'J\'applique une modification';
    }
  }

  async function executeActions(bridge, actions, hooks) {
    var list = Array.isArray(actions) ? actions : [];
    var results = [];
    var summaries = [];
    var errors = [];
    var executed = 0;
    var rejected = 0;
    hooks = hooks || {};
    for (var i = 0; i < list.length; i++) {
      if (typeof hooks.onStart === 'function') {
        try { hooks.onStart(i, list[i]); } catch (hookErr) { /* UI only */ }
      }
      var result = await executeAction(bridge, list[i]);
      result = enrichActionError(result);
      result = enrichResultVisual(bridge, result);
      results.push(result);
      if (typeof hooks.onDone === 'function') {
        try { hooks.onDone(i, result); } catch (hookErr2) { /* UI only */ }
      }
      if (result.ok) {
        executed += 1;
        if (result.summary) summaries.push(result.summary);
      } else {
        rejected += 1;
        if (result.error) errors.push(result.error);
        dbgLog('agent', 'actions.reject', {
          tool: result.tool,
          error: result.error,
          code: result.code || null,
          cause: result.cause || null,
          hint: result.hint || null
        });
      }
    }
    dbgLog('agent', 'actions.execute', {
      total: list.length,
      executed: executed,
      rejected: rejected
    });
    var applied = {
      results: results,
      summary: summaries.filter(Boolean).join(' ') || (errors.length ? '' : 'OK'),
      errors: errors,
      ok: errors.length === 0 && results.length > 0
    };
    applied.recap = formatChangeRecap(applied);
    applied.errorSummary = formatActionErrors(applied);
    return applied;
  }

  async function runProviderTests(provider, onResult) {
    var p = normalizeProvider(provider);
    var results = [];

    function paint() {
      return new Promise(function (resolve) {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function () {
            resolve();
          });
        } else {
          setTimeout(resolve, 0);
        }
      });
    }

    async function push(id, label, status, detail, ms) {
      var item = {
        id: id,
        label: label,
        status: status,
        detail: detail || '',
        ms: typeof ms === 'number' ? ms : null
      };
      var idx = -1;
      for (var i = 0; i < results.length; i++) {
        if (results[i].id === id) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) results[idx] = item;
      else results.push(item);
      if (typeof onResult === 'function') {
        try {
          onResult(item, results.slice());
        } catch (cbErr) {
          console.error('runProviderTests onResult failed', cbErr);
        }
      }
      await paint();
      return item;
    }

    // 1. Config
    if (!p.apiKey) {
      await push('config', 'Configuration', 'fail', 'Cl\u00e9 API manquante');
      return results;
    }
    if (!p.baseUrl) {
      await push('config', 'Configuration', 'fail', 'URL de base manquante');
      return results;
    }
    if (!p.model) {
      await push('config', 'Configuration', 'fail', 'Mod\u00e8le manquant');
      return results;
    }
    await push(
      'config',
      'Configuration',
      'pass',
      p.preset + ' \u00b7 ' + p.model + ' \u00b7 ' + p.baseUrl
    );

    // 2. Reachability / CORS (+ auth signal)
    await push('reach', 'Accessibilit\u00e9 / CORS', 'running', 'En cours\u2026');
    var t0 = Date.now();
    var modelsRes = null;
    var reachErr = null;
    try {
      modelsRes = await apiFetch(p, '/models', { method: 'GET' });
    } catch (err) {
      reachErr = err;
    }
    var reachMs = Date.now() - t0;

    if (reachErr && reachErr.code === 'cors_or_network') {
      await push('reach', 'Accessibilit\u00e9 / CORS', 'fail', reachErr.message, reachMs);
      await push('auth', 'Authentification', 'skip', 'Non test\u00e9 (CORS / r\u00e9seau)');
      await push('chat', '\u00c9change chat', 'skip', 'Non test\u00e9');
      await push('json', 'Mode JSON', 'skip', 'Non test\u00e9');
      return results;
    }

    if (reachErr) {
      // Fallback: try a tiny chat completion to prove reachability
      await push('reach', 'Accessibilit\u00e9 / CORS', 'running', 'Tentative via chat\u2026');
      t0 = Date.now();
      try {
        await chatCompletions(
          p,
          [{ role: 'user', content: 'Reply with OK' }],
          { jsonMode: false, max_tokens: 5, temperature: 0 }
        );
        await push(
          'reach',
          'Accessibilit\u00e9 / CORS',
          'pass',
          '/models indisponible, chat OK',
          Date.now() - t0
        );
        await push('auth', 'Authentification', 'pass', 'Cl\u00e9 accept\u00e9e via chat');
      } catch (chatErr) {
        var classified = chatErr.code === 'cors_or_network'
          ? chatErr
          : classifyFetchError(chatErr);
        if (chatErr.code === 'cors_or_network' || classified.code === 'cors_or_network') {
          await push(
            'reach',
            'Accessibilit\u00e9 / CORS',
            'fail',
            chatErr.message || classified.message,
            Date.now() - t0
          );
        } else if (chatErr.status === 401 || chatErr.status === 403 || chatErr.code === 'auth') {
          await push(
            'reach',
            'Accessibilit\u00e9 / CORS',
            'pass',
            'Endpoint joignable',
            Date.now() - t0
          );
          await push(
            'auth',
            'Authentification',
            'fail',
            chatErr.message || 'Cl\u00e9 refus\u00e9e',
            Date.now() - t0
          );
        } else {
          await push(
            'reach',
            'Accessibilit\u00e9 / CORS',
            'fail',
            chatErr.message || String(chatErr),
            Date.now() - t0
          );
        }
        if (results.every(function (r) { return r.id !== 'auth'; })) {
          await push('auth', 'Authentification', 'skip', 'Non conclu');
        }
        await push('chat', '\u00c9change chat', 'skip', 'Non test\u00e9');
        await push('json', 'Mode JSON', 'skip', 'Non test\u00e9');
        return results;
      }
    } else if (modelsRes) {
      if (modelsRes.status === 401 || modelsRes.status === 403) {
        await push(
          'reach',
          'Accessibilit\u00e9 / CORS',
          'pass',
          'Endpoint joignable (HTTP ' + modelsRes.status + ')',
          reachMs
        );
        await push(
          'auth',
          'Authentification',
          'fail',
          (modelsRes.data &&
            modelsRes.data.error &&
            modelsRes.data.error.message) ||
            'Cl\u00e9 refus\u00e9e (HTTP ' + modelsRes.status + ')',
          reachMs
        );
        await push('chat', '\u00c9change chat', 'skip', 'Non test\u00e9 (auth)');
        await push('json', 'Mode JSON', 'skip', 'Non test\u00e9 (auth)');
        return results;
      }
      if (modelsRes.ok) {
        var modelCount =
          modelsRes.data && Array.isArray(modelsRes.data.data)
            ? modelsRes.data.data.length
            : null;
        await push(
          'reach',
          'Accessibilit\u00e9 / CORS',
          'pass',
          modelCount != null
            ? modelCount + ' mod\u00e8les list\u00e9s'
            : 'GET /models OK',
          reachMs
        );
        await push('auth', 'Authentification', 'pass', 'Cl\u00e9 accept\u00e9e', reachMs);
      } else {
        await push(
          'reach',
          'Accessibilit\u00e9 / CORS',
          'warn',
          'GET /models HTTP ' + modelsRes.status + ' \u2014 on tente le chat',
          reachMs
        );
        await push(
          'auth',
          'Authentification',
          'warn',
          'Ind\u00e9termin\u00e9 via /models',
          reachMs
        );
      }
    }

    // 3/4. Chat round-trip
    await push('chat', '\u00c9change chat', 'running', 'En cours\u2026');
    t0 = Date.now();
    try {
      var chatRes = await chatCompletions(
        p,
        [{ role: 'user', content: 'R\u00e9ponds uniquement OK' }],
        { jsonMode: false, max_tokens: 8, temperature: 0 }
      );
      var okText = (chatRes.content || '').trim();
      await push(
        'chat',
        '\u00c9change chat',
        /ok/i.test(okText) ? 'pass' : 'warn',
        okText
          ? 'R\u00e9ponse\u00a0: ' + okText.slice(0, 80)
          : 'R\u00e9ponse vide',
        Date.now() - t0
      );
      if (results.every(function (r) { return r.id !== 'auth' || r.status === 'warn' || r.status === 'skip'; })) {
        // Upgrade auth if still warn/skip
        for (var i = 0; i < results.length; i++) {
          if (results[i].id === 'auth' && results[i].status !== 'pass') {
            await push(
              'auth',
              'Authentification',
              'pass',
              'Cl\u00e9 accept\u00e9e via chat',
              results[i].ms
            );
            break;
          }
        }
      }
    } catch (chatErr2) {
      await push(
        'chat',
        '\u00c9change chat',
        'fail',
        chatErr2.message || String(chatErr2),
        Date.now() - t0
      );
      await push('json', 'Mode JSON', 'skip', 'Non test\u00e9');
      return results;
    }

    // 5. JSON mode
    await push('json', 'Mode JSON', 'running', 'En cours\u2026');
    t0 = Date.now();
    try {
      var jsonRes = await chatCompletions(
        p,
        [
          {
            role: 'user',
            content:
              'R\u00e9ponds uniquement avec JSON {"message":"OK","followUps":[]}'
          }
        ],
        { jsonMode: true, max_tokens: 40, temperature: 0 }
      );
      var parsed = parseAssistantPayload(jsonRes.content);
      if (parsed && parsed.message) {
        await push(
          'json',
          'Mode JSON',
          'pass',
          'response_format json_object OK',
          Date.now() - t0
        );
      } else {
        await push(
          'json',
          'Mode JSON',
          'warn',
          'JSON difficile \u00e0 parser',
          Date.now() - t0
        );
      }
    } catch (jsonErr) {
      await push(
        'json',
        'Mode JSON',
        'warn',
        (jsonErr.message || String(jsonErr)) +
          ' \u2014 les follow-ups peuvent \u00eatre moins fiables',
        Date.now() - t0
      );
    }

    return results;
  }

  /** Markdown fence that cannot be closed by backticks inside `text`. */
  function debugFenced(lang, text) {
    var body = String(text == null ? '' : text);
    var fence = '```';
    var runs = body.match(/`{3,}/g) || [];
    for (var r = 0; r < runs.length; r++) {
      if (runs[r].length >= fence.length) fence = runs[r] + '`';
    }
    return fence + (lang || '') + '\n' + body + '\n' + fence;
  }

  function debugJsonText(value) {
    if (value == null) return '';
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch (e) {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (e) {
      return String(value);
    }
  }

  function debugIsoStamp(value) {
    var d = typeof value === 'number' || typeof value === 'string' ? new Date(value) : null;
    return d && !isNaN(d.getTime()) ? localStamp(d.toISOString()) : '?';
  }

  /**
   * Texte copiable pour déboguer une conversation : les messages tels que
   * l'utilisateur les voit, puis ce qui s'est passé sous le capot pour chaque
   * appel (requête, réponse brute, tentatives, métriques). Le contexte système
   * n'est écrit qu'une fois par version. La clé API n'est jamais incluse.
   */
  function buildChatDebugExport(input) {
    var src = input || {};
    var provider = normalizeProvider(src.provider);
    var history = Array.isArray(src.history) ? src.history : [];
    var debugLog = Array.isArray(src.debugLog) ? src.debugLog : [];
    var appInfo = currentAppBuildInfo() || {};
    var out = [];

    out.push('# Débogage — conversation avec l’Assistant');
    out.push('');
    out.push('- Exporté : ' + debugIsoStamp(Date.now()) + ' (heure locale)');
    if (appInfo.builtAt) out.push('- App compilée : ' + debugIsoStamp(appInfo.builtAt));
    out.push(
      '- Fournisseur : ' + provider.preset + ' · modèle ' + provider.model + ' · ' + provider.baseUrl
    );
    out.push('- Niveau de statut : ' + (src.statusLevel || 'inconnu'));
    out.push('');

    out.push('## 1. Conversation (' + history.length + ' message(s))');
    out.push('');
    for (var h = 0; h < history.length; h++) {
      var entry = history[h];
      if (!entry || !entry.content) continue;
      var who = entry.role === 'user' ? 'Utilisateur' : entry.role === 'assistant' ? 'Assistant' : String(entry.role);
      out.push('### ' + (h + 1) + '. ' + who + (entry.selfPrompt ? ' (relance automatique)' : ''));
      out.push(String(entry.content));
      if (entry.role === 'assistant' && entry.rawJson) {
        out.push('');
        out.push('JSON brut :');
        out.push(debugFenced('json', debugJsonText(entry.rawJson)));
      }
      out.push('');
    }

    out.push('## 2. Sous le capot (' + debugLog.length + ' appel(s))');
    out.push('');
    var systemVersions = [];
    for (var c = 0; c < debugLog.length; c++) {
      var d = debugLog[c] || {};
      var req = d.request || null;
      var body = req && req.body ? req.body : null;
      out.push('### Appel ' + (c + 1) + ' — ' + (d.label || d.kind || 'appel'));
      out.push('- Type : ' + (d.kind || '?'));
      out.push('- Début : ' + debugIsoStamp(d.startedAt));
      out.push('- Durée : ' + (d.latencyMs != null ? d.latencyMs + ' ms' : '?'));
      out.push('- Résultat : ' + (d.ok === false ? 'erreur' : 'ok'));
      if (d.error) out.push('- Erreur : ' + d.error);
      if (req) {
        out.push(
          '- Requête : ' + (req.method || 'POST') + ' ' + (req.url || '') +
            ' · modèle ' + (req.model || '?') +
            ' · stream ' + (req.stream ? 'oui' : 'non') +
            ' · mode JSON ' + (req.jsonMode ? 'oui' : 'non') +
            ' · température ' + (req.temperature != null ? req.temperature : '?') +
            ' · max_tokens ' + (req.max_tokens != null ? req.max_tokens : '?') +
            ' · ' + (req.messageCount || 0) + ' messages'
        );
        if (req.status != null) out.push('- Statut HTTP : ' + req.status);
        if (req.note) out.push('- Note : ' + req.note);
      }
      if (body && Array.isArray(body.messages)) {
        var sysText = null;
        var lastUser = null;
        for (var m = 0; m < body.messages.length; m++) {
          var msg = body.messages[m];
          if (!msg) continue;
          if (msg.role === 'system' && sysText == null) sysText = String(msg.content || '');
          if (msg.role === 'user') lastUser = String(msg.content || '');
        }
        if (sysText != null) {
          var version = -1;
          for (var v = 0; v < systemVersions.length; v++) {
            if (systemVersions[v].text === sysText) version = v;
          }
          if (version < 0) {
            systemVersions.push({ text: sysText, calls: [] });
            version = systemVersions.length - 1;
          }
          systemVersions[version].calls.push(c + 1);
          out.push('- Contexte système : version ' + (version + 1) + ' (section 3)');
        }
        if (lastUser != null) {
          out.push('');
          out.push('Dernier message envoyé :');
          out.push(debugFenced('', lastUser));
        }
      }
      if (d.attempts && d.attempts.length) {
        out.push('');
        out.push('Tentatives :');
        for (var a = 0; a < d.attempts.length; a++) {
          var at = d.attempts[a] || {};
          out.push(
            '- ' + (at.label || 'essai') + (at.status != null ? ' · HTTP ' + at.status : '') +
              (at.ok === false || at.error ? ' · échec' : '') +
              (at.error ? ' : ' + at.error : '')
          );
        }
      }
      if (d.response) {
        out.push('');
        out.push('Réponse brute du modèle :');
        out.push(debugFenced('', d.response.content || '(vide)'));
        if (d.response.parsed) {
          out.push('');
          out.push('Sortie analysée :');
          out.push(debugFenced('json', debugJsonText(d.response.parsed)));
        }
        if (d.response.raw) {
          out.push('');
          out.push('Réponse API brute :');
          out.push(debugFenced('json', debugJsonText(d.response.raw)));
        }
      }
      if (d.usage) {
        out.push('');
        out.push('Métriques :');
        out.push(debugFenced('json', debugJsonText(d.usage)));
      }
      out.push('');
    }

    out.push('## 3. Contexte système envoyé au modèle (' + systemVersions.length + ' version(s))');
    out.push('');
    for (var sv = 0; sv < systemVersions.length; sv++) {
      out.push('### Version ' + (sv + 1) + ' (appels ' + systemVersions[sv].calls.join(', ') + ')');
      out.push(debugFenced('', systemVersions[sv].text));
      out.push('');
    }
    if (!systemVersions.length) out.push('Aucun appel avec contexte.');

    return out.join('\n');
  }

  // exports
  S.buildChatDebugExport = buildChatDebugExport;
  S.debugFenced = debugFenced;
  S.debugIsoStamp = debugIsoStamp;
  S.debugJsonText = debugJsonText;
  S.describeActionStep = describeActionStep;
  S.enrichResultVisual = enrichResultVisual;
  S.executeAction = executeAction;
  S.executeActions = executeActions;
  S.runProviderTests = runProviderTests;
})(typeof window !== 'undefined' ? window : this);
