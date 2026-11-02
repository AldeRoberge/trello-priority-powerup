/**
 * Trello Power-Up bridge — card priority storage, badges, board settings.
 * Exposes window.PriorityTrello (no bundler).
 *
 * Role: all Trello I/O for priority (pluginData + REST). Pure scoring/UI is
 * PriorityUI. index.html capabilities (card-badges, list-sorters, …) call here.
 *
 * Key pluginData
 * ──────────────
 * cardPriority (card/shared)     — axes + blocked + due meta
 * priorityFormula / colorScheme  — board/shared settings
 * customTaskTypes, memberRoleCatalog, customAssigneeCatalog, placeCatalog — board catalogs
 * cardDueSyncedIso / cardStartSyncedIso — conflict detection vs Trello dates
 *
 * Table of contents
 * ─────────────────
 *  1. Normalize / read / write card inputs + board context cache
 *  2. Badge builders (face + detail) and list sort by tier
 *  3. Card name/desc/members/labels REST helpers
 *  4. Due/start sync + auto-sort after priority change
 *  5. Power-Up capability handlers + PriorityTrello public API
 */

/**
 * priority-trello: part 1 of 3 (board).
 * Names are shared with the other parts through window.PriorityTrelloParts (see priority-trello.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityTrelloParts = global.PriorityTrelloParts || {});

  // from other parts (functions, resolved at call time)
  function addCardMember() { return S.addCardMember.apply(this, arguments); }
  function cardPluginScope() { return S.cardPluginScope.apply(this, arguments); }
  function getCardDueComplete() { return S.getCardDueComplete.apply(this, arguments); }
  function readPowerUpArg() { return S.readPowerUpArg.apply(this, arguments); }
  function resolveCurrentCardId() { return S.resolveCurrentCardId.apply(this, arguments); }
  function restClientOptions() { return S.restClientOptions.apply(this, arguments); }

var CARD_PRIORITY_KEY = 'cardPriority';
  var LEGACY_PRIORITY_KEY = 'priority';
  var MATRIX_SETTINGS_KEY = 'matrixLabelSettings';
  var FORMULA_SETTINGS_KEY = 'priorityFormula';
  var COLOR_SCHEME_SETTINGS_KEY = 'priorityColorScheme';
  var COLOR_SCHEME_REV_KEY = 'priorityColorSchemeRev';
  var CUSTOM_TASK_TYPES_KEY = 'customTaskTypes';
  var MEMBER_ROLE_CATALOG_KEY = 'memberRoleCatalog';
  var CUSTOM_ASSIGNEE_CATALOG_KEY = 'customAssigneeCatalog';
  var PLACE_CATALOG_KEY = 'placeCatalog';
  // Last agreed Trello `due` ISO ('' = no due). Used for Échéance ↔ Dates conflict detection.
  var CARD_DUE_SYNCED_KEY = 'cardDueSyncedIso';
  // Last agreed Trello `start` ISO ('' = no start).
  var CARD_START_SYNCED_KEY = 'cardStartSyncedIso';
  S.boardFormulaKey = 'baseline';
  var boardColorSchemeKey = null;
  var boardCustomTaskTypes = null;
  var boardMemberRoleCatalog = null;
  var boardCustomAssigneeCatalog = null;
  var boardPlaceCatalog = null;
  var boardMatrixSettings = null;
  var boardContextAt = 0;
  var boardContextInflight = null;
  var BOARD_CONTEXT_TTL_MS = 10000;
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
    return { impact: 5, ease: 5, empressement: 'aucun' };
  }

  var IMPORTANT_INPUTS = importantInputs();
  // axesScaledTo10 marks fresh cards as already on the new 0–10 Impact/Facilité
  // scale, so normalizeInputs never mistakes them for pre-adaptation values.
  var DEFAULT_INPUTS = Object.assign({ axesScaledTo10: true }, IMPORTANT_INPUTS);

  var LEGACY_ID_TO_INPUTS = {
    1: { impact: 10, ease: 10, empressement: 'vite', axesScaledTo10: true },
    2: { impact: 7.5, ease: 2.5, empressement: 'assez-vite', axesScaledTo10: true },
    3: { impact: 5, ease: 5, empressement: 'bientot', axesScaledTo10: true },
    4: { impact: 2.5, ease: 2.5, empressement: 'aucun', axesScaledTo10: true },
    5: { impact: 0, ease: 2.5, empressement: 'aucun', axesScaledTo10: true },
  };

  var PRIORITY_DIMENSIONS = [
    {
      key: 'impact',
      label: 'Impact',
      icon: 'ti-target-arrow',
      wordsKey: 'impact',
      min: 0,
      max: 10,
      value: 5,
    },
    {
      key: 'ease',
      label: 'Facilité',
      icon: 'ti-gauge',
      wordsKey: 'ease',
      min: 0,
      max: 10,
      value: 5,
    },
    {
      key: 'empressement',
      label: 'Empressement',
      icon: 'ti-flame',
      wordsKey: 'empressement',
      min: 0,
      max: 4,
      value: 0,
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

  /** Sanitizes the impactFactors / easeCosts checkbox maps against known defs. */
  function normalizeFactorEntries(raw, defs) {
    if (!raw || typeof raw !== 'object') return null;
    if (!Array.isArray(defs) || !defs.length) {
      // PriorityUI not loaded yet: keep the raw shape rather than dropping data.
      return Object.keys(raw).length ? raw : null;
    }
    var out = {};
    defs.forEach(function (def) {
      var entry = raw[def.id];
      if (!entry || typeof entry !== 'object') return;
      var clean = { checked: !!entry.checked };
      if (def.kind === 'named') {
        var stepId = typeof entry.stepId === 'string' ? entry.stepId : '';
        var validStep =
          Array.isArray(def.steps) &&
          def.steps.some(function (step) {
            return step.id === stepId;
          });
        clean.stepId = validStep ? stepId : def.defaultStepId;
      } else {
        var intensity = asNumber(entry.intensity);
        clean.intensity = isFinite(intensity)
          ? Math.max(1, Math.min(10, Math.round(intensity)))
          : def.defaultIntensity || 5;
      }
      out[def.id] = clean;
    });
    return Object.keys(out).length ? out : null;
  }

  /** Ids of the cards this card depends on (Mindmap "Dépend de"): unique non-empty strings, capped. */
  function normalizeDependsOn(raw) {
    var out = [];
    (Array.isArray(raw) ? raw : []).forEach(function (v) {
      var id = typeof v === 'string' ? v.trim() : '';
      if (id && out.indexOf(id) < 0 && out.length < 30) out.push(id);
    });
    return out;
  }

  // Kind of a task → task link ("depends" is the default and is not stored).
  var DEP_TYPES = ['needs', 'after', 'parts'];

  /** { depId: type } kept only for ids still in dependsOn and for known non-default types. */
  function normalizeDepTypes(raw, dependsOn) {
    var out = {};
    var n = 0;
    if (raw && typeof raw === 'object') {
      dependsOn.forEach(function (id) {
        if (DEP_TYPES.indexOf(raw[id]) >= 0) {
          out[id] = raw[id];
          n++;
        }
      });
    }
    return n ? out : null;
  }

  function normalizeInputs(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var impact = asNumber(raw.impact);
    var ease = asNumber(raw.ease);
    if (!isFinite(impact) || !isFinite(ease)) return null;
    var normalized = {
      impact: Math.max(0, Math.min(10, impact)),
      ease: Math.max(0, Math.min(10, ease)),
    };

    var PU = priorityUI();

    // Empressement (id or 0–4 index); defaults to "Aucun" when absent.
    if (raw.empressement != null) {
      normalized.empressement =
        PU && typeof PU.normalizeEmpressementId === 'function'
          ? PU.normalizeEmpressementId(raw.empressement)
          : typeof raw.empressement === 'string'
            ? raw.empressement
            : 'aucun';
    }

    if (raw.dateFixe === true) normalized.dateFixe = true;
    if (raw.dueLimitState === 'has' || raw.dueLimitState === 'none') {
      normalized.dueLimitState = raw.dueLimitState;
    }

    var impactFactors = normalizeFactorEntries(
      raw.impactFactors,
      PU && PU.IMPACT_FACTOR_DEFS
    );
    if (impactFactors) normalized.impactFactors = impactFactors;
    var easeCosts = normalizeFactorEntries(raw.easeCosts, PU && PU.EASE_COST_DEFS);
    if (easeCosts) normalized.easeCosts = easeCosts;

    // Legacy Urgence axis: kept as a sidecar (back-compat) while migration
    // helpers derive Empressement + a one-time Impact/Facilité rescale.
    if (raw.urgency != null) normalized.urgency = asNumber(raw.urgency);
    if (raw.axesScaledTo10 === true) normalized.axesScaledTo10 = true;
    if (raw.legacyUrgency != null) normalized.legacyUrgency = asNumber(raw.legacyUrgency);
    if (raw.urgencyMigrated === true) normalized.urgencyMigrated = true;
    if (raw.urgencyReviewNeeded === true) normalized.urgencyReviewNeeded = true;

    if (PU) {
      var scalePatch =
        typeof PU.migrateLegacyAxisScales === 'function'
          ? PU.migrateLegacyAxisScales(raw)
          : null;
      if (scalePatch) {
        normalized.impact = scalePatch.impact;
        normalized.ease = scalePatch.ease;
        normalized.axesScaledTo10 = true;
      }
      var urgencyPatch =
        typeof PU.migrateLegacyUrgency === 'function' ? PU.migrateLegacyUrgency(raw) : null;
      if (urgencyPatch) {
        normalized.legacyUrgency = urgencyPatch.legacyUrgency;
        normalized.urgencyMigrated = true;
        normalized.empressement = urgencyPatch.empressement;
        if (urgencyPatch.urgencyReviewNeeded) normalized.urgencyReviewNeeded = true;
      }
    }

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

    var PUVague = priorityUI();
    var dueVague =
      PUVague && typeof PUVague.normalizeDueVague === 'function'
        ? PUVague.normalizeDueVague(raw.dueVague)
        : typeof raw.dueVague === 'string'
          ? raw.dueVague.trim()
          : '';
    var dueMode =
      PUVague && typeof PUVague.normalizeDueMode === 'function'
        ? PUVague.normalizeDueMode(raw.dueMode)
        : raw.dueMode === 'vague'
          ? 'vague'
          : 'precise';
    if (dueVague) dueMode = 'vague';
    if (dueMode === 'vague' && dueVague) {
      normalized.dueMode = 'vague';
      normalized.dueVague = dueVague;
      if (!dueDate && PUVague && PUVague.resolveDueVagueToDate) {
        dueDate = PUVague.resolveDueVagueToDate(dueVague) || '';
        if (dueDate) normalized.dueDate = dueDate;
      }
      delete normalized.dueTime;
      if (raw.dueEnabled === false) normalized.dueEnabled = false;
      else if (normalized.dueDate) {
        /* keep enabled when vague horizon is set */
      }
    } else if (dueDate) {
      /* precise: omit dueMode/dueVague for compact storage */
    }

    var startDate = '';
    if (typeof raw.startDate === 'string') {
      var PUStart = priorityUI();
      startDate = PUStart && PUStart.normalizeDueDate
        ? PUStart.normalizeDueDate(raw.startDate)
        : raw.startDate.trim();
      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) startDate = '';
    }
    if (startDate) {
      normalized.startDate = startDate;
      if (typeof raw.startTime === 'string') {
        var PUStartTime = priorityUI();
        var startTime = PUStartTime && PUStartTime.normalizeDueTime
          ? PUStartTime.normalizeDueTime(raw.startTime)
          : raw.startTime.trim();
        if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) startTime = '';
        if (startTime) normalized.startTime = startTime;
      }
    }

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

    var memberRoles =
      PUTypes && typeof PUTypes.normalizeMemberRoles === 'function'
        ? PUTypes.normalizeMemberRoles(raw.memberRoles)
        : {};
    if (Object.keys(memberRoles).length) normalized.memberRoles = memberRoles;

    var memberRoleCustoms =
      PUTypes && typeof PUTypes.normalizeMemberRoleCustoms === 'function'
        ? PUTypes.normalizeMemberRoleCustoms(raw.memberRoleCustoms)
        : [];
    if (
      PUTypes &&
      typeof PUTypes.pruneMemberRoleCustoms === 'function' &&
      memberRoleCustoms.length
    ) {
      memberRoleCustoms = PUTypes.pruneMemberRoleCustoms(
        memberRoleCustoms,
        memberRoles
      );
    }
    if (memberRoleCustoms.length) {
      normalized.memberRoleCustoms = memberRoleCustoms;
    }

    var customAssignees =
      PUTypes && typeof PUTypes.normalizeCustomAssignees === 'function'
        ? PUTypes.normalizeCustomAssignees(raw.customAssignees)
        : [];
    if (customAssignees.length) {
      normalized.customAssignees = customAssignees;
    }

    var teamLinks =
      PUTypes && typeof PUTypes.normalizeTeamLinks === 'function'
        ? PUTypes.normalizeTeamLinks(raw.teamLinks)
        : [];
    if (teamLinks.length) normalized.teamLinks = teamLinks;

    var places =
      PUTypes && typeof PUTypes.normalizePlaces === 'function'
        ? PUTypes.normalizePlaces(raw.places)
        : raw.places && typeof raw.places === 'object' && !Array.isArray(raw.places)
          ? raw.places
          : {};
    if (
      places &&
      (places.from || places.to || places.at || (places.via && places.via.length))
    ) {
      normalized.places = places;
    }

    var dependsOn = normalizeDependsOn(raw.dependsOn);
    if (dependsOn.length) normalized.dependsOn = dependsOn;
    var depTypes = normalizeDepTypes(raw.depTypes, dependsOn);
    if (depTypes) normalized.depTypes = depTypes;

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
      impact: inputs.impact,
      ease: inputs.ease,
    };
    if (inputs.urgency != null) cleared.urgency = inputs.urgency;
    if (inputs.empressement != null) cleared.empressement = inputs.empressement;
    if (inputs.dateFixe != null) cleared.dateFixe = inputs.dateFixe;
    if (inputs.dueLimitState != null) cleared.dueLimitState = inputs.dueLimitState;
    if (inputs.impactFactors != null) cleared.impactFactors = inputs.impactFactors;
    if (inputs.easeCosts != null) cleared.easeCosts = inputs.easeCosts;
    if (inputs.legacyUrgency != null) cleared.legacyUrgency = inputs.legacyUrgency;
    if (inputs.urgencyMigrated != null) cleared.urgencyMigrated = inputs.urgencyMigrated;
    if (inputs.urgencyReviewNeeded != null) cleared.urgencyReviewNeeded = inputs.urgencyReviewNeeded;
    if (inputs.axesScaledTo10 != null) cleared.axesScaledTo10 = inputs.axesScaledTo10;
    if (inputs.priorityEnabled === false) cleared.priorityEnabled = false;
    if (typeof inputs.dueDate === 'string' && inputs.dueDate) {
      cleared.dueDate = inputs.dueDate;
      if (typeof inputs.dueTime === 'string' && inputs.dueTime) {
        cleared.dueTime = inputs.dueTime;
      }
      if (inputs.dueEnabled === false) cleared.dueEnabled = false;
    }
    if (inputs.dueMode === 'vague' || inputs.dueVague) {
      cleared.dueMode = 'vague';
      if (typeof inputs.dueVague === 'string' && inputs.dueVague) {
        cleared.dueVague = inputs.dueVague;
      }
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
    if (inputs.memberRoles && typeof inputs.memberRoles === 'object') {
      cleared.memberRoles = inputs.memberRoles;
    }
    if (
      Array.isArray(inputs.memberRoleCustoms) &&
      inputs.memberRoleCustoms.length
    ) {
      cleared.memberRoleCustoms = inputs.memberRoleCustoms.slice();
    }
    if (Array.isArray(inputs.customAssignees) && inputs.customAssignees.length) {
      cleared.customAssignees = inputs.customAssignees.slice();
    }
    if (Array.isArray(inputs.teamLinks) && inputs.teamLinks.length) {
      cleared.teamLinks = inputs.teamLinks.slice();
    }
    if (
      inputs.places &&
      typeof inputs.places === 'object' &&
      (inputs.places.from ||
        inputs.places.to ||
        inputs.places.at ||
        (inputs.places.via && inputs.places.via.length))
    ) {
      cleared.places = inputs.places;
    }
    if (Array.isArray(inputs.dependsOn) && inputs.dependsOn.length) {
      cleared.dependsOn = inputs.dependsOn.slice();
      if (inputs.depTypes) cleared.depTypes = Object.assign({}, inputs.depTypes);
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
    await t.set(await cardPluginScope(t), 'shared', CARD_PRIORITY_KEY, cleared);
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
    return readStoredCardInputs(t, await cardPluginScope(t));
  }

  async function getMatrixSettings(t) {
    if (boardMatrixSettings && Date.now() - boardContextAt < BOARD_CONTEXT_TTL_MS) {
      return boardMatrixSettings;
    }
    var stored = await t.get('board', 'shared', MATRIX_SETTINGS_KEY);
    if (typeof PriorityMatrix !== 'undefined' && PriorityMatrix.normalizeSettings) {
      boardMatrixSettings = PriorityMatrix.normalizeSettings(stored);
    } else if (stored && typeof stored === 'object') {
      boardMatrixSettings = stored;
    } else {
      boardMatrixSettings = { enabled: true, overrides: {} };
    }
    return boardMatrixSettings;
  }

  async function getBoardFormula(t) {
    var PU = priorityUI();
    if (!PU) return 'baseline';
    try {
      var stored = await t.get('board', 'shared', FORMULA_SETTINGS_KEY);
      if (typeof stored === 'string') {
        S.boardFormulaKey = PU.normalizeFormulaKey(stored);
      } else if (stored && typeof stored === 'object' && stored.formula) {
        S.boardFormulaKey = PU.normalizeFormulaKey(stored.formula);
      }
    } catch (err) {
      console.error('Priority board formula load failed', err);
    }
    return S.boardFormulaKey;
  }

  async function saveBoardFormula(t, formulaKey) {
    var PU = priorityUI();
    if (!PU) return 'baseline';
    var key = PU.normalizeFormulaKey(formulaKey);
    S.boardFormulaKey = key;
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
    if (Array.isArray(boardCustomTaskTypes)) {
      return boardCustomTaskTypes.slice();
    }
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

  async function getMemberRoleCatalog(t) {
    var PU = priorityUI();
    if (Array.isArray(boardMemberRoleCatalog)) {
      return boardMemberRoleCatalog.slice();
    }
    try {
      var stored = await t.get('board', 'shared', MEMBER_ROLE_CATALOG_KEY);
      var list =
        PU && typeof PU.normalizeMemberRoleCatalog === 'function'
          ? PU.normalizeMemberRoleCatalog(stored)
          : Array.isArray(stored) && stored.length
            ? stored
            : PU && typeof PU.defaultMemberRoleCatalog === 'function'
              ? PU.defaultMemberRoleCatalog()
              : [];
      boardMemberRoleCatalog = list;
      if (PU && typeof PU.setMemberRoleCatalog === 'function') {
        PU.setMemberRoleCatalog(list);
      }
      // Seed board once on first empty load so Settings sees the defaults.
      if (!Array.isArray(stored) || !stored.length) {
        await t.set('board', 'shared', MEMBER_ROLE_CATALOG_KEY, list);
      }
      return list.slice();
    } catch (err) {
      console.error('Priority member role catalog load failed', err);
      boardMemberRoleCatalog =
        boardMemberRoleCatalog ||
        (PU && typeof PU.defaultMemberRoleCatalog === 'function'
          ? PU.defaultMemberRoleCatalog()
          : []);
      return boardMemberRoleCatalog.slice();
    }
  }

  async function saveMemberRoleCatalog(t, raw) {
    var PU = priorityUI();
    var list =
      PU && typeof PU.normalizeMemberRoleCatalog === 'function'
        ? PU.normalizeMemberRoleCatalog(raw)
        : Array.isArray(raw)
          ? raw
          : [];
    boardMemberRoleCatalog = list;
    if (PU && typeof PU.setMemberRoleCatalog === 'function') {
      PU.setMemberRoleCatalog(list);
    }
    await t.set('board', 'shared', MEMBER_ROLE_CATALOG_KEY, list);
    return list.slice();
  }

  function getCachedMemberRoleCatalog() {
    return Array.isArray(boardMemberRoleCatalog)
      ? boardMemberRoleCatalog.slice()
      : [];
  }

  async function getCustomAssigneeCatalog(t) {
    var PU = priorityUI();
    if (Array.isArray(boardCustomAssigneeCatalog)) {
      return boardCustomAssigneeCatalog.slice();
    }
    try {
      var stored = await t.get('board', 'shared', CUSTOM_ASSIGNEE_CATALOG_KEY);
      var list =
        PU && typeof PU.normalizeCustomAssignees === 'function'
          ? PU.normalizeCustomAssignees(stored)
          : Array.isArray(stored)
            ? stored
            : [];
      boardCustomAssigneeCatalog = list;
      if (PU && typeof PU.setCustomAssigneeCatalog === 'function') {
        PU.setCustomAssigneeCatalog(list);
      }
      return list.slice();
    } catch (err) {
      console.error('Priority custom assignee catalog load failed', err);
      boardCustomAssigneeCatalog = boardCustomAssigneeCatalog || [];
      return boardCustomAssigneeCatalog.slice();
    }
  }

  async function saveCustomAssigneeCatalog(t, raw) {
    var PU = priorityUI();
    var list =
      PU && typeof PU.normalizeCustomAssignees === 'function'
        ? PU.normalizeCustomAssignees(raw)
        : Array.isArray(raw)
          ? raw
          : [];
    boardCustomAssigneeCatalog = list;
    if (PU && typeof PU.setCustomAssigneeCatalog === 'function') {
      PU.setCustomAssigneeCatalog(list);
    }
    await t.set('board', 'shared', CUSTOM_ASSIGNEE_CATALOG_KEY, list);
    return list.slice();
  }

  function getCachedCustomAssigneeCatalog() {
    return Array.isArray(boardCustomAssigneeCatalog)
      ? boardCustomAssigneeCatalog.slice()
      : [];
  }

  async function getPlaceCatalog(t) {
    var PU = priorityUI();
    if (Array.isArray(boardPlaceCatalog)) {
      return boardPlaceCatalog.slice();
    }
    try {
      var stored = await t.get('board', 'shared', PLACE_CATALOG_KEY);
      var list =
        PU && typeof PU.normalizePlaceCatalog === 'function'
          ? PU.normalizePlaceCatalog(stored)
          : Array.isArray(stored)
            ? stored
            : [];
      boardPlaceCatalog = list;
      if (PU && typeof PU.setPlaceCatalog === 'function') {
        PU.setPlaceCatalog(list);
      }
      return list.slice();
    } catch (err) {
      console.error('Priority place catalog load failed', err);
      boardPlaceCatalog = boardPlaceCatalog || [];
      return boardPlaceCatalog.slice();
    }
  }

  async function savePlaceCatalog(t, raw) {
    var PU = priorityUI();
    var list =
      PU && typeof PU.normalizePlaceCatalog === 'function'
        ? PU.normalizePlaceCatalog(raw)
        : Array.isArray(raw)
          ? raw
          : [];
    boardPlaceCatalog = list;
    if (PU && typeof PU.setPlaceCatalog === 'function') {
      PU.setPlaceCatalog(list);
    }
    await t.set('board', 'shared', PLACE_CATALOG_KEY, list);
    return list.slice();
  }

  function getCachedPlaceCatalog() {
    return Array.isArray(boardPlaceCatalog)
      ? boardPlaceCatalog.slice()
      : [];
  }

  async function preloadBoardPriorityContext(t) {
    return ensureBoardPriorityContext(t);
  }

  function getCachedBoardColorSchemeKey() {
    return boardColorSchemeKey || defaultColorSchemeKey();
  }

  async function ensureBoardPriorityContext(t) {
    if (
      boardMatrixSettings &&
      Date.now() - boardContextAt < BOARD_CONTEXT_TTL_MS
    ) {
      return boardMatrixSettings;
    }
    if (boardContextInflight) return boardContextInflight;

    boardContextInflight = (async function () {
      var settings = await getMatrixSettings(t);
      var PU = priorityUI();
      if (PU && PU.setMatrixSettings) {
        PU.setMatrixSettings(settings);
      }
      await getBoardFormula(t);
      await getBoardColorScheme(t);
      await getCustomTaskTypes(t);
      await getMemberRoleCatalog(t);
      await getCustomAssigneeCatalog(t);
      await getPlaceCatalog(t);
      boardContextAt = Date.now();
      return settings;
    })().finally(function () {
      boardContextInflight = null;
    });

    return boardContextInflight;
  }

  function computeDisplay(inputs, labelSettings, formulaKey) {
    try {
      var PU = priorityUI();
      if (!PU || !PU.calc) return null;
      var key = formulaKey || S.boardFormulaKey || 'baseline';
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

  var CARD_FIELD_TIMEOUT_MS = 6000;

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(label || 'timeout'));
      }, ms || CARD_FIELD_TIMEOUT_MS);
      Promise.resolve(promise).then(
        function (value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        function (err) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /** Build GET /cards/{id} query for Power-Up field names (Gantt overlay REST path). */
  function buildRestCardQuery(fields) {
    var fieldList = [];
    var wantMembers = false;
    (fields || []).forEach(function (f) {
      if (f === 'members') wantMembers = true;
      else if (f) fieldList.push(String(f));
    });
    if (!fieldList.length) fieldList.push('id');
    var parts = ['fields=' + fieldList.map(encodeURIComponent).join(',')];
    if (wantMembers) {
      parts.push('members=true');
      parts.push(
        'member_fields=' +
          encodeURIComponent('id,fullName,username,initials,avatarHash,avatarUrl')
      );
    }
    return parts.join('&');
  }

  async function restGetCardJson(t, cardId, queryExtra) {
    if (!cardId || !restClientOptions()) return null;
    try {
      var api = await t.getRestApi();
      var authorized = await api.isAuthorized();
      if (!authorized) return null;
      var token = await api.getToken();
      if (!token) return null;
      var cfg = restClientOptions();
      var url =
        'https://api.trello.com/1/cards/' +
        encodeURIComponent(cardId) +
        '?key=' +
        encodeURIComponent(cfg.appKey) +
        '&token=' +
        encodeURIComponent(token) +
        (queryExtra ? '&' + queryExtra : '');
      var response = await fetch(url, { method: 'GET' });
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      console.error('Priority REST GET card failed', err);
      return null;
    }
  }

  /**
   * Read a card field. When opened from Gantt (cardId arg, board context),
   * t.card() has no card localization and can hang — use REST instead.
   */
  function cardFieldPromise(t, field) {
    var argId = readPowerUpArg(t, 'cardId');
    if (argId) {
      return restGetCardJson(t, argId, buildRestCardQuery([field])).then(
        function (card) {
          if (!card) return null;
          if (field === 'members') return card.members || null;
          return Object.prototype.hasOwnProperty.call(card, field)
            ? card[field]
            : null;
        }
      );
    }
    return withTimeout(
      new Promise(function (resolve, reject) {
        t.card(field).get(field).then(resolve, reject);
      }),
      CARD_FIELD_TIMEOUT_MS,
      't.card timeout: ' + field
    );
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
    if (!trimmed || trimmed === 'Bloqu\u00e9') return label;
    return trimmed + ' (' + label + ')';
  }

  function formatProgressFaceSuffix(progress) {
    var CT = global.CompletionTrello;
    if (!progress || !(progress.percent > 0)) return '';
    if (CT && typeof CT.formatFaceBadgeText === 'function') {
      return CT.formatFaceBadgeText(progress) || '';
    }
    if (progress.percent === 100) return '\u2713 ' + progress.percent + '\u00a0%';
    return progress.percent + '\u00a0%';
  }

  function formatBadgeText(display, completed, progress) {
    var priorityText = '';
    if (display) {
      if (completed) {
        priorityText =
          tierBadgeDot(display, true) + ' ' + formatCompletedBadgeLabel(incompleteBadgeLabel(display));
      } else if (display.blocked) {
        priorityText = tierBadgeDot(display, false) + ' ' + formatBlockedBoardBadgeText(display);
      } else {
        var PU = priorityUI();
        if (display.priorityEnabled === false) {
          if (PU && display.dueCountdown) {
            priorityText = tierBadgeDot(display, false) + ' ' + display.dueCountdown;
          }
        } else if (PU && PU.formatDueBadgeText && display.dueCountdown) {
          priorityText = tierBadgeDot(display, false) + ' ' + PU.formatDueBadgeText(display);
        } else if (display.priorityEnabled !== false) {
          priorityText = tierBadgeDot(display, false) + ' ' + incompleteBadgeLabel(display);
        }
      }
    }
    var progressText = formatProgressFaceSuffix(progress);
    if (priorityText && progressText) return priorityText + ' \u00b7 ' + progressText;
    return priorityText || progressText || '';
  }

  function tierDetailBadgeColor(display) {
    var PU = priorityUI();
    if (PU && PU.tierTrelloBadgeColor) {
      return PU.tierTrelloBadgeColor(display);
    }
    return trelloBadgeMuted();
  }

  function progressFaceBadgeColor(progress) {
    if (
      typeof global.CompletionUI !== 'undefined' &&
      global.CompletionUI.completionTrelloBadgeColor
    ) {
      return global.CompletionUI.completionTrelloBadgeColor(progress.percent);
    }
    if (progress && progress.percent === 100) return 'green';
    if (progress && progress.percent >= 50) return 'blue';
    return 'sky';
  }

  function buildCardFaceBadge(display, completed, progress) {
    var text = formatBadgeText(display, completed, progress);
    if (!text) return null;
    if (display) {
      return {
        text: text,
        color: completed ? trelloBadgeComplete() : tierDetailBadgeColor(display),
      };
    }
    if (progress && progress.percent > 0) {
      return {
        text: text,
        color: progressFaceBadgeColor(progress),
      };
    }
    return null;
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
    return (PU && PU.DEFINE_PRIORITY_LABEL) || 'Trello Cerveau';
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
    var argId = readPowerUpArg(t, 'cardId');
    if (argId) {
      return restGetCardJson(t, argId, buildRestCardQuery(fields));
    }
    return withTimeout(
      new Promise(function (resolve, reject) {
        t.card.apply(t, fields).then(resolve, reject);
      }),
      CARD_FIELD_TIMEOUT_MS,
      't.card timeout'
    );
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

  // exports
  S.BADGE_REFRESH_SEC = BADGE_REFRESH_SEC;
  S.BOARD_CONTEXT_TTL_MS = BOARD_CONTEXT_TTL_MS;
  S.CARD_DETAIL_BADGE_TITLE = CARD_DETAIL_BADGE_TITLE;
  S.CARD_DUE_SYNCED_KEY = CARD_DUE_SYNCED_KEY;
  S.CARD_FIELD_TIMEOUT_MS = CARD_FIELD_TIMEOUT_MS;
  S.CARD_PRIORITY_KEY = CARD_PRIORITY_KEY;
  S.CARD_START_SYNCED_KEY = CARD_START_SYNCED_KEY;
  S.COLOR_SCHEME_REV_KEY = COLOR_SCHEME_REV_KEY;
  S.COLOR_SCHEME_SETTINGS_KEY = COLOR_SCHEME_SETTINGS_KEY;
  S.CUSTOM_ASSIGNEE_CATALOG_KEY = CUSTOM_ASSIGNEE_CATALOG_KEY;
  S.CUSTOM_TASK_TYPES_KEY = CUSTOM_TASK_TYPES_KEY;
  S.DEFAULT_INPUTS = DEFAULT_INPUTS;
  S.DEP_TYPES = DEP_TYPES;
  S.FORMULA_SETTINGS_KEY = FORMULA_SETTINGS_KEY;
  S.IMPORTANT_INPUTS = IMPORTANT_INPUTS;
  S.LEGACY_ID_TO_INPUTS = LEGACY_ID_TO_INPUTS;
  S.LEGACY_PRIORITY_KEY = LEGACY_PRIORITY_KEY;
  S.MATRIX_SETTINGS_KEY = MATRIX_SETTINGS_KEY;
  S.MEMBER_ROLE_CATALOG_KEY = MEMBER_ROLE_CATALOG_KEY;
  S.PLACE_CATALOG_KEY = PLACE_CATALOG_KEY;
  S.PRIORITY_DIMENSIONS = PRIORITY_DIMENSIONS;
  S.SORT_TIER_INUTILE = SORT_TIER_INUTILE;
  S.SORT_TIER_NONE = SORT_TIER_NONE;
  S.asNumber = asNumber;
  S.boardColorSchemeKey = boardColorSchemeKey;
  S.boardContextAt = boardContextAt;
  S.boardContextInflight = boardContextInflight;
  S.boardCustomAssigneeCatalog = boardCustomAssigneeCatalog;
  S.boardCustomTaskTypes = boardCustomTaskTypes;
  S.boardMatrixSettings = boardMatrixSettings;
  S.boardMemberRoleCatalog = boardMemberRoleCatalog;
  S.boardPlaceCatalog = boardPlaceCatalog;
  S.brandAppName = brandAppName;
  S.buildCardFaceBadge = buildCardFaceBadge;
  S.buildRestCardQuery = buildRestCardQuery;
  S.cardDataPromise = cardDataPromise;
  S.cardFieldPromise = cardFieldPromise;
  S.clearBlockedFromInputs = clearBlockedFromInputs;
  S.clearBlockedIfComplete = clearBlockedIfComplete;
  S.computeDisplay = computeDisplay;
  S.dbg = dbg;
  S.dbgError = dbgError;
  S.dbgLog = dbgLog;
  S.defaultColorSchemeKey = defaultColorSchemeKey;
  S.definePriorityLabel = definePriorityLabel;
  S.ensureBoardPriorityContext = ensureBoardPriorityContext;
  S.ensureCreatorAssigned = ensureCreatorAssigned;
  S.fetchCardIdMemberCreatorRest = fetchCardIdMemberCreatorRest;
  S.fetchMemberByIdRest = fetchMemberByIdRest;
  S.formatBadgeText = formatBadgeText;
  S.formatBlockedBoardBadgeText = formatBlockedBoardBadgeText;
  S.formatCompletedBadgeLabel = formatCompletedBadgeLabel;
  S.formatProgressFaceSuffix = formatProgressFaceSuffix;
  S.getBoardColorScheme = getBoardColorScheme;
  S.getBoardFormula = getBoardFormula;
  S.getBoardLabels = getBoardLabels;
  S.getBoardMembers = getBoardMembers;
  S.getCachedBoardColorSchemeKey = getCachedBoardColorSchemeKey;
  S.getCachedCustomAssigneeCatalog = getCachedCustomAssigneeCatalog;
  S.getCachedCustomTaskTypes = getCachedCustomTaskTypes;
  S.getCachedMemberRoleCatalog = getCachedMemberRoleCatalog;
  S.getCachedPlaceCatalog = getCachedPlaceCatalog;
  S.getCardCreator = getCardCreator;
  S.getCardDesc = getCardDesc;
  S.getCardDisplay = getCardDisplay;
  S.getCardInputs = getCardInputs;
  S.getCardLabels = getCardLabels;
  S.getCardMembers = getCardMembers;
  S.getCardName = getCardName;
  S.getCurrentMember = getCurrentMember;
  S.getCustomAssigneeCatalog = getCustomAssigneeCatalog;
  S.getCustomTaskTypes = getCustomTaskTypes;
  S.getMatrixSettings = getMatrixSettings;
  S.getMemberRoleCatalog = getMemberRoleCatalog;
  S.getPlaceCatalog = getPlaceCatalog;
  S.importantInputs = importantInputs;
  S.importanteTierIndex = importanteTierIndex;
  S.incompleteBadgeLabel = incompleteBadgeLabel;
  S.isCardMarkedComplete = isCardMarkedComplete;
  S.isPowerUpRequestChain = isPowerUpRequestChain;
  S.normalizeDepTypes = normalizeDepTypes;
  S.normalizeDependsOn = normalizeDependsOn;
  S.normalizeFactorEntries = normalizeFactorEntries;
  S.normalizeInputs = normalizeInputs;
  S.normalizeLabelList = normalizeLabelList;
  S.normalizeMemberList = normalizeMemberList;
  S.parseCardNameValue = parseCardNameValue;
  S.parseIdMemberCreator = parseIdMemberCreator;
  S.preloadBoardPriorityContext = preloadBoardPriorityContext;
  S.priorityUI = priorityUI;
  S.progressFaceBadgeColor = progressFaceBadgeColor;
  S.readStoredCardInputs = readStoredCardInputs;
  S.restGetCardJson = restGetCardJson;
  S.saveBoardColorScheme = saveBoardColorScheme;
  S.saveBoardFormula = saveBoardFormula;
  S.saveCustomAssigneeCatalog = saveCustomAssigneeCatalog;
  S.saveCustomTaskTypes = saveCustomTaskTypes;
  S.saveMemberRoleCatalog = saveMemberRoleCatalog;
  S.savePlaceCatalog = savePlaceCatalog;
  S.tierBadgeDot = tierBadgeDot;
  S.tierDetailBadgeColor = tierDetailBadgeColor;
  S.trelloBadgeComplete = trelloBadgeComplete;
  S.trelloBadgeMuted = trelloBadgeMuted;
  S.withTimeout = withTimeout;
})(typeof window !== 'undefined' ? window : this);
