/**
 * priority-ui-mini-editors-api: part 2 of 2 (10b. Mini editors (Gantt popovers)).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui-mini-editors-api.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var AXIS_SCORE_MAX = S.AXIS_SCORE_MAX;
  var AXIS_UI_MAX = S.AXIS_UI_MAX;
  var BADGE_DOT_COMPLETE = S.BADGE_DOT_COMPLETE;
  var BADGE_DOT_DEFAULT = S.BADGE_DOT_DEFAULT;
  var BADGE_DOT_INUTILE = S.BADGE_DOT_INUTILE;
  var BASELINE_RAW_MAX = S.BASELINE_RAW_MAX;
  var BASELINE_SCORE_SCALE = S.BASELINE_SCORE_SCALE;
  var BASE_EASE_WEIGHT = S.BASE_EASE_WEIGHT;
  var BASE_IMPACT_WEIGHT = S.BASE_IMPACT_WEIGHT;
  var BLOCKED_DESCRIPTION = S.BLOCKED_DESCRIPTION;
  var BLOCKED_DISPLAY = S.BLOCKED_DISPLAY;
  var BLOCKED_LABEL = S.BLOCKED_LABEL;
  var BLOCKED_LINK_TYPE_SUBTASK = S.BLOCKED_LINK_TYPE_SUBTASK;
  var BLOCKED_REASON_CLEAR_LABEL = S.BLOCKED_REASON_CLEAR_LABEL;
  var BLOCKED_REASON_CORE_PRESETS = S.BLOCKED_REASON_CORE_PRESETS;
  var BLOCKED_REASON_EDIT_LABEL = S.BLOCKED_REASON_EDIT_LABEL;
  var BLOCKED_REASON_EMPTY_SUGGESTION_CAP = S.BLOCKED_REASON_EMPTY_SUGGESTION_CAP;
  var BLOCKED_REASON_FILTER_SUGGESTION_CAP = S.BLOCKED_REASON_FILTER_SUGGESTION_CAP;
  var BLOCKED_REASON_FREQ_STORAGE_KEY = S.BLOCKED_REASON_FREQ_STORAGE_KEY;
  var BLOCKED_REASON_OPTIONS = S.BLOCKED_REASON_OPTIONS;
  var BLOCKED_REASON_PLACEHOLDER = S.BLOCKED_REASON_PLACEHOLDER;
  var BLOCKED_REASON_SUGGESTIONS_LABEL = S.BLOCKED_REASON_SUGGESTIONS_LABEL;
  var BLOCKED_REASON_WAITING_OTHER_TASK = S.BLOCKED_REASON_WAITING_OTHER_TASK;
  var BLOCKED_SUBTASK_FALLBACK_LABEL = S.BLOCKED_SUBTASK_FALLBACK_LABEL;
  var BLOCKED_SYMBOL = S.BLOCKED_SYMBOL;
  var BLOCKED_WAITING_ON_PREFIX = S.BLOCKED_WAITING_ON_PREFIX;
  var BUILTIN_MEMBER_ROLES = S.BUILTIN_MEMBER_ROLES;
  var BUILTIN_TASK_TYPES = S.BUILTIN_TASK_TYPES;
  var COLOR_SCHEMES = S.COLOR_SCHEMES;
  var COLOR_SCHEME_OPTIONS = S.COLOR_SCHEME_OPTIONS;
  var COMPLETED_BADGE_PREFIX = S.COMPLETED_BADGE_PREFIX;
  var COUNTDOWN_DAYS_PER_WEEK = S.COUNTDOWN_DAYS_PER_WEEK;
  var COUNTDOWN_WEEK_THRESHOLD_DAYS = S.COUNTDOWN_WEEK_THRESHOLD_DAYS;
  var COUNTDOWN_YEAR_THRESHOLD_DAYS = S.COUNTDOWN_YEAR_THRESHOLD_DAYS;
  var CUSTOM_TASK_TYPE_ICON_KEYS = S.CUSTOM_TASK_TYPE_ICON_KEYS;
  var DATE_GAIN_FIXED = S.DATE_GAIN_FIXED;
  var DATE_GAIN_MOVABLE = S.DATE_GAIN_MOVABLE;
  var DATE_PROXIMITY_TAU_DAYS = S.DATE_PROXIMITY_TAU_DAYS;
  var DAYS_PER_MONTH_AVG = S.DAYS_PER_MONTH_AVG;
  var DAYS_PER_YEAR_AVG = S.DAYS_PER_YEAR_AVG;
  var DEFAULT_COLOR_SCHEME_KEY = S.DEFAULT_COLOR_SCHEME_KEY;
  var DEFINE_PRIORITY_LABEL = S.DEFINE_PRIORITY_LABEL;
  var DUE_DATE_FIXE_COPY = S.DUE_DATE_FIXE_COPY;
  var DUE_DATE_MODE_PRECISE = S.DUE_DATE_MODE_PRECISE;
  var DUE_DATE_MODE_VAGUE = S.DUE_DATE_MODE_VAGUE;
  var DUE_DATE_QUICK_SUGGESTIONS = S.DUE_DATE_QUICK_SUGGESTIONS;
  var DUE_DATE_TIME_DEFAULT = S.DUE_DATE_TIME_DEFAULT;
  var DUE_DATE_VAGUE_DEFAULT_ID = S.DUE_DATE_VAGUE_DEFAULT_ID;
  var DUE_DATE_VAGUE_OPTIONS = S.DUE_DATE_VAGUE_OPTIONS;
  var DUE_LIMIT_STATE_HAS = S.DUE_LIMIT_STATE_HAS;
  var DUE_LIMIT_STATE_NONE = S.DUE_LIMIT_STATE_NONE;
  var DURATION_MAX_MINUTES = S.DURATION_MAX_MINUTES;
  var DURATION_MIN_MINUTES = S.DURATION_MIN_MINUTES;
  var EASE_COST_DEFS = S.EASE_COST_DEFS;
  var EASE_QUICK_WINS = S.EASE_QUICK_WINS;
  var EASE_UI_MAX = S.EASE_UI_MAX;
  var EISENHOWER_IMPACT_THRESHOLD = S.EISENHOWER_IMPACT_THRESHOLD;
  var EISENHOWER_QUADRANTS = S.EISENHOWER_QUADRANTS;
  var EISENHOWER_URGENCY_THRESHOLD = S.EISENHOWER_URGENCY_THRESHOLD;
  var EMPRESSEMENT_DEFAULT_ID = S.EMPRESSEMENT_DEFAULT_ID;
  var EMPRESSEMENT_OPTIONS = S.EMPRESSEMENT_OPTIONS;
  var EMPRESSEMENT_PULL_MAX = S.EMPRESSEMENT_PULL_MAX;
  var EMPRESSEMENT_UI_MAX = S.EMPRESSEMENT_UI_MAX;
  var FORMULAS = S.FORMULAS;
  var FORMULA_OPTIONS = S.FORMULA_OPTIONS;
  var HEAT_SEGMENTS = S.HEAT_SEGMENTS;
  var HEAT_TIER_DOT_SIZES = S.HEAT_TIER_DOT_SIZES;
  var IMPACT_FACTOR_DEFS = S.IMPACT_FACTOR_DEFS;
  var IMPACT_SYNERGY_PER_EXTRA = S.IMPACT_SYNERGY_PER_EXTRA;
  var IMPACT_UI_MAX = S.IMPACT_UI_MAX;
  var INUTILE_EPS = S.INUTILE_EPS;
  var INUTILE_LABEL = S.INUTILE_LABEL;
  var INUTILE_STYLES = S.INUTILE_STYLES;
  var KEYWORDS = S.KEYWORDS;
  var LABELS = S.LABELS;
  var MS_PER_DAY = S.MS_PER_DAY;
  var MS_PER_HOUR = S.MS_PER_HOUR;
  var MS_PER_MINUTE = S.MS_PER_MINUTE;
  var PLACE_SLOTS = S.PLACE_SLOTS;
  var PRESSURE_MAX = S.PRESSURE_MAX;
  var PRIORITY_BLUE_STOPS = S.PRIORITY_BLUE_STOPS;
  var QUESTIONS = S.QUESTIONS;
  var RECURRENCE_FREQUENCIES = S.RECURRENCE_FREQUENCIES;
  var SCORE_MAX = S.SCORE_MAX;
  var SECTION_COLLAPSE_STORAGE_KEY = S.SECTION_COLLAPSE_STORAGE_KEY;
  var SLIDER_ANIM_MS = S.SLIDER_ANIM_MS;
  var STATUT_EMBEDDED_DETAILS_STORAGE_KEY = S.STATUT_EMBEDDED_DETAILS_STORAGE_KEY;
  var TASK_BADGE_LABELS = S.TASK_BADGE_LABELS;
  var TASK_TYPES = S.TASK_TYPES;
  var TASK_TYPE_TABLER_ICONS = S.TASK_TYPE_TABLER_ICONS;
  var TIER_BADGE_DOTS = S.TIER_BADGE_DOTS;
  var TIER_DEFS = S.TIER_DEFS;
  var TIER_I = S.TIER_I;
  var TIER_I_MAX = S.TIER_I_MAX;
  var TIER_I_SCHEME_MAPPED_MAX = S.TIER_I_SCHEME_MAPPED_MAX;
  var TIER_LABEL_SHORT = S.TIER_LABEL_SHORT;
  var TIER_SURFACE_MIX = S.TIER_SURFACE_MIX;
  var TRELLO_BADGE_COLOR_COMPLETE = S.TRELLO_BADGE_COLOR_COMPLETE;
  var TRELLO_BADGE_COLOR_HEX = S.TRELLO_BADGE_COLOR_HEX;
  var TRELLO_BADGE_COLOR_MUTED = S.TRELLO_BADGE_COLOR_MUTED;
  var TRELLO_BADGE_COLOR_NAMES = S.TRELLO_BADGE_COLOR_NAMES;
  var URGENCY_MIGRATION_MODE = S.URGENCY_MIGRATION_MODE;
  var URGENCY_REVIEW_PROMPT = S.URGENCY_REVIEW_PROMPT;
  var URGENCY_REVIEW_THRESHOLD_10 = S.URGENCY_REVIEW_THRESHOLD_10;
  var WB = S.WB;
  var WI = S.WI;
  var WI_EASE = S.WI_EASE;
  var WT = S.WT;

  // from other parts (functions, resolved at call time)
  function mountVariant() { return S.mountVariant.apply(this, arguments); }
  function advanceDateByRecurrence() { return S.advanceDateByRecurrence.apply(this, arguments); }
  function affirmationDisplayText() { return S.affirmationDisplayText.apply(this, arguments); }
  function affirmationFor() { return S.affirmationFor.apply(this, arguments); }
  function applyColorScheme() { return S.applyColorScheme.apply(this, arguments); }
  function applyMarkdownBlockFormat() { return S.applyMarkdownBlockFormat.apply(this, arguments); }
  function baselineScore() { return S.baselineScore.apply(this, arguments); }
  function bindCollapsibleEnable() { return S.bindCollapsibleEnable.apply(this, arguments); }
  function blockedTaskBadgeLabel() { return S.blockedTaskBadgeLabel.apply(this, arguments); }
  function buildOverviewEnrichment() { return S.buildOverviewEnrichment.apply(this, arguments); }
  function buildOverviewSummaryText() { return S.buildOverviewSummaryText.apply(this, arguments); }
  function buildOverviewTasksFromCompletion() { return S.buildOverviewTasksFromCompletion.apply(this, arguments); }
  function buildProgressSummaryNode() { return S.buildProgressSummaryNode.apply(this, arguments); }
  function bumpBlockedReasonFreq() { return S.bumpBlockedReasonFreq.apply(this, arguments); }
  function calcBaseline() { return S.calcBaseline.apply(this, arguments); }
  function calcBaselineTerms() { return S.calcBaselineTerms.apply(this, arguments); }
  function calcBaselineTermsFromInputs() { return S.calcBaselineTermsFromInputs.apply(this, arguments); }
  function calcBaselineTermsRaw() { return S.calcBaselineTermsRaw.apply(this, arguments); }
  function calcEisenhower() { return S.calcEisenhower.apply(this, arguments); }
  function calcValueEffort() { return S.calcValueEffort.apply(this, arguments); }
  function calcWSJF() { return S.calcWSJF.apply(this, arguments); }
  function canonicalizeTrelloDueIso() { return S.canonicalizeTrelloDueIso.apply(this, arguments); }
  function cardHasDueDate() { return S.cardHasDueDate.apply(this, arguments); }
  function clampDurationMinutes() { return S.clampDurationMinutes.apply(this, arguments); }
  function classicTierLabel() { return S.classicTierLabel.apply(this, arguments); }
  function closeHelpModal() { return S.closeHelpModal.apply(this, arguments); }
  function computeBaseScore() { return S.computeBaseScore.apply(this, arguments); }
  function computeDatePull() { return S.computeDatePull.apply(this, arguments); }
  function computeEaseFromCosts() { return S.computeEaseFromCosts.apply(this, arguments); }
  function computeEmpressePull() { return S.computeEmpressePull.apply(this, arguments); }
  function computeImpactFromFactors() { return S.computeImpactFromFactors.apply(this, arguments); }
  function connectTeamPeople() { return S.connectTeamPeople.apply(this, arguments); }
  function createAxisFactorsWidget() { return S.createAxisFactorsWidget.apply(this, arguments); }
  function createCalcGraphPanel() { return S.createCalcGraphPanel.apply(this, arguments); }
  function createCollapsibleEnableChrome() { return S.createCollapsibleEnableChrome.apply(this, arguments); }
  function createCustomAssignee() { return S.createCustomAssignee.apply(this, arguments); }
  function createCustomMemberRole() { return S.createCustomMemberRole.apply(this, arguments); }
  function createCustomTaskType() { return S.createCustomTaskType.apply(this, arguments); }
  function createDueDateField() { return S.createDueDateField.apply(this, arguments); }
  function createEnAttenteField() { return S.createEnAttenteField.apply(this, arguments); }
  function createField() { return S.createField.apply(this, arguments); }
  function createFormulaSwitcher() { return S.createFormulaSwitcher.apply(this, arguments); }
  function createHeatPanel() { return S.createHeatPanel.apply(this, arguments); }
  function createInfoField() { return S.createInfoField.apply(this, arguments); }
  function createOverviewField() { return S.createOverviewField.apply(this, arguments); }
  function createPlaceRef() { return S.createPlaceRef.apply(this, arguments); }
  function createStatutField() { return S.createStatutField.apply(this, arguments); }
  function curveImpact() { return S.curveImpact.apply(this, arguments); }
  function customAssigneeToMember() { return S.customAssigneeToMember.apply(this, arguments); }
  function dampenCurve() { return S.dampenCurve.apply(this, arguments); }
  function daysUntilDue() { return S.daysUntilDue.apply(this, arguments); }
  function defaultMemberRoleCatalog() { return S.defaultMemberRoleCatalog.apply(this, arguments); }
  function deriveLegacyUrgency() { return S.deriveLegacyUrgency.apply(this, arguments); }
  function detectMarkdownLineFormat() { return S.detectMarkdownLineFormat.apply(this, arguments); }
  function dueBadgeSuffix() { return S.dueBadgeSuffix.apply(this, arguments); }
  function dueBandAccent() { return S.dueBandAccent.apply(this, arguments); }
  function dueProximityBand() { return S.dueProximityBand.apply(this, arguments); }
  function dueVagueIdAtIndex() { return S.dueVagueIdAtIndex.apply(this, arguments); }
  function dueVagueIndex() { return S.dueVagueIndex.apply(this, arguments); }
  function durationToSlider() { return S.durationToSlider.apply(this, arguments); }
  function easeCostDefById() { return S.easeCostDefById.apply(this, arguments); }
  function easeForScore() { return S.easeForScore.apply(this, arguments); }
  function easeOutCubic() { return S.easeOutCubic.apply(this, arguments); }
  function effectiveEase() { return S.effectiveEase.apply(this, arguments); }
  function effectiveImpact() { return S.effectiveImpact.apply(this, arguments); }
  function eisenhowerQuadrantFor() { return S.eisenhowerQuadrantFor.apply(this, arguments); }
  function empressementIndex() { return S.empressementIndex.apply(this, arguments); }
  function empressementOptionById() { return S.empressementOptionById.apply(this, arguments); }
  function empressementOptionByIndex() { return S.empressementOptionByIndex.apply(this, arguments); }
  function expandBlockedReasonsForDisplay() { return S.expandBlockedReasonsForDisplay.apply(this, arguments); }
  function fetchLinkPreviewMeta() { return S.fetchLinkPreviewMeta.apply(this, arguments); }
  function findCustomAssigneeCatalogById() { return S.findCustomAssigneeCatalogById.apply(this, arguments); }
  function findCustomAssigneeCatalogByName() { return S.findCustomAssigneeCatalogByName.apply(this, arguments); }
  function findPlaceCatalogById() { return S.findPlaceCatalogById.apply(this, arguments); }
  function findPlaceCatalogByName() { return S.findPlaceCatalogByName.apply(this, arguments); }
  function firstRowEditControl() { return S.firstRowEditControl.apply(this, arguments); }
  function formatBaseline() { return S.formatBaseline.apply(this, arguments); }
  function formatBlockedBadgeText() { return S.formatBlockedBadgeText.apply(this, arguments); }
  function formatBlockedReasonsSummary() { return S.formatBlockedReasonsSummary.apply(this, arguments); }
  function formatBlockedWaitingOnLabel() { return S.formatBlockedWaitingOnLabel.apply(this, arguments); }
  function formatCompletedBadgeLabel() { return S.formatCompletedBadgeLabel.apply(this, arguments); }
  function formatDueBadgeText() { return S.formatDueBadgeText.apply(this, arguments); }
  function formatDueCountdown() { return S.formatDueCountdown.apply(this, arguments); }
  function formatDueCountdownFromInputs() { return S.formatDueCountdownFromInputs.apply(this, arguments); }
  function formatDueDateCompactSummary() { return S.formatDueDateCompactSummary.apply(this, arguments); }
  function formatDueDateDisplay() { return S.formatDueDateDisplay.apply(this, arguments); }
  function formatDueDateHumanReadable() { return S.formatDueDateHumanReadable.apply(this, arguments); }
  function formatDueDateTriggerTitle() { return S.formatDueDateTriggerTitle.apply(this, arguments); }
  function formatDueTimeCompactFr() { return S.formatDueTimeCompactFr.apply(this, arguments); }
  function formatDueTimeDisplay() { return S.formatDueTimeDisplay.apply(this, arguments); }
  function formatDueTimePeriodLabel() { return S.formatDueTimePeriodLabel.apply(this, arguments); }
  function formatDueTimeTriggerTitle() { return S.formatDueTimeTriggerTitle.apply(this, arguments); }
  function formatDueVagueCountdown() { return S.formatDueVagueCountdown.apply(this, arguments); }
  function formatDueVagueLabel() { return S.formatDueVagueLabel.apply(this, arguments); }
  function formatDurationFr() { return S.formatDurationFr.apply(this, arguments); }
  function formatEisenhower() { return S.formatEisenhower.apply(this, arguments); }
  function formatRecurrenceLabelFr() { return S.formatRecurrenceLabelFr.apply(this, arguments); }
  function formatScoreBreakdown() { return S.formatScoreBreakdown.apply(this, arguments); }
  function formatValueEffort() { return S.formatValueEffort.apply(this, arguments); }
  function formatWSJF() { return S.formatWSJF.apply(this, arguments); }
  function getActiveColorSchemeKey() { return S.getActiveColorSchemeKey.apply(this, arguments); }
  function getCustomAssigneeCatalog() { return S.getCustomAssigneeCatalog.apply(this, arguments); }
  function getCustomTaskTypes() { return S.getCustomTaskTypes.apply(this, arguments); }
  function getMatrixSettings() { return S.getMatrixSettings.apply(this, arguments); }
  function getMemberRoleCatalog() { return S.getMemberRoleCatalog.apply(this, arguments); }
  function getMemberRoleCustoms() { return S.getMemberRoleCustoms.apply(this, arguments); }
  function getMemberRoleEntry() { return S.getMemberRoleEntry.apply(this, arguments); }
  function getPlaceCatalog() { return S.getPlaceCatalog.apply(this, arguments); }
  function getTaskTypeCatalog() { return S.getTaskTypeCatalog.apply(this, arguments); }
  function getTaskTypeIconKeys() { return S.getTaskTypeIconKeys.apply(this, arguments); }
  function getTimeFormat() { return S.getTimeFormat.apply(this, arguments); }
  function heatSegmentDelta() { return S.heatSegmentDelta.apply(this, arguments); }
  function heatTierDotSizePx() { return S.heatTierDotSizePx.apply(this, arguments); }
  function hydrateSmartLinkPreviews() { return S.hydrateSmartLinkPreviews.apply(this, arguments); }
  function impactFactorDefById() { return S.impactFactorDefById.apply(this, arguments); }
  function impactTerm() { return S.impactTerm.apply(this, arguments); }
  function inputsToTrelloDueIso() { return S.inputsToTrelloDueIso.apply(this, arguments); }
  function inputsToTrelloStartIso() { return S.inputsToTrelloStartIso.apply(this, arguments); }
  function isBlockedWaitingOtherTask() { return S.isBlockedWaitingOtherTask.apply(this, arguments); }
  function isBuiltinMemberRoleId() { return S.isBuiltinMemberRoleId.apply(this, arguments); }
  function isCustomAssigneeId() { return S.isCustomAssigneeId.apply(this, arguments); }
  function isCustomMemberRoleId() { return S.isCustomMemberRoleId.apply(this, arguments); }
  function isCustomTaskTypeId() { return S.isCustomTaskTypeId.apply(this, arguments); }
  function isDueDateQuickSuggestionAvailable() { return S.isDueDateQuickSuggestionAvailable.apply(this, arguments); }
  function isDueEnabled() { return S.isDueEnabled.apply(this, arguments); }
  function isDuePast() { return S.isDuePast.apply(this, arguments); }
  function isDueVagueEligible() { return S.isDueVagueEligible.apply(this, arguments); }
  function isDueVagueMode() { return S.isDueVagueMode.apply(this, arguments); }
  function isEisenhowerImportant() { return S.isEisenhowerImportant.apply(this, arguments); }
  function isEisenhowerUrgent() { return S.isEisenhowerUrgent.apply(this, arguments); }
  function isEnAttente() { return S.isEnAttente.apply(this, arguments); }
  function isHour12() { return S.isHour12.apply(this, arguments); }
  function isInutile() { return S.isInutile.apply(this, arguments); }
  function isPlaceId() { return S.isPlaceId.apply(this, arguments); }
  function isValidBlockedReason() { return S.isValidBlockedReason.apply(this, arguments); }
  function isValidMemberRoleId() { return S.isValidMemberRoleId.apply(this, arguments); }
  function isValidTaskTypeId() { return S.isValidTaskTypeId.apply(this, arguments); }
  function layoutTeamGraph() { return S.layoutTeamGraph.apply(this, arguments); }
  function lerp() { return S.lerp.apply(this, arguments); }
  function levelIconSvg() { return S.levelIconSvg.apply(this, arguments); }
  function linkMarkdownSelection() { return S.linkMarkdownSelection.apply(this, arguments); }
  function loadSectionCollapseState() { return S.loadSectionCollapseState.apply(this, arguments); }
  function loadStatutEmbeddedDetailsExpanded() { return S.loadStatutEmbeddedDetailsExpanded.apply(this, arguments); }
  function loadStoredColorSchemeKey() { return S.loadStoredColorSchemeKey.apply(this, arguments); }
  function loadStoredFormulaKey() { return S.loadStoredFormulaKey.apply(this, arguments); }
  function markdownFromRichRoot() { return S.markdownFromRichRoot.apply(this, arguments); }
  function memberRoleIconKey() { return S.memberRoleIconKey.apply(this, arguments); }
  function memberRoleLabel() { return S.memberRoleLabel.apply(this, arguments); }
  function mergeAssigneesForDisplay() { return S.mergeAssigneesForDisplay.apply(this, arguments); }
  function mergeIntoCustomAssigneeCatalog() { return S.mergeIntoCustomAssigneeCatalog.apply(this, arguments); }
  function mergeIntoPlaceCatalog() { return S.mergeIntoPlaceCatalog.apply(this, arguments); }
  function mergePressure() { return S.mergePressure.apply(this, arguments); }
  function migrateLegacyAxisScales() { return S.migrateLegacyAxisScales.apply(this, arguments); }
  function migrateLegacyUrgency() { return S.migrateLegacyUrgency.apply(this, arguments); }
  function msUntilDue() { return S.msUntilDue.apply(this, arguments); }
  function nextOccurrenceParts() { return S.nextOccurrenceParts.apply(this, arguments); }
  function normalizeBlockedLink() { return S.normalizeBlockedLink.apply(this, arguments); }
  function normalizeBlockedLinks() { return S.normalizeBlockedLinks.apply(this, arguments); }
  function normalizeBlockedReason() { return S.normalizeBlockedReason.apply(this, arguments); }
  function normalizeBlockedReasons() { return S.normalizeBlockedReasons.apply(this, arguments); }
  function normalizeColorSchemeKey() { return S.normalizeColorSchemeKey.apply(this, arguments); }
  function normalizeCustomAssignees() { return S.normalizeCustomAssignees.apply(this, arguments); }
  function normalizeCustomTaskTypes() { return S.normalizeCustomTaskTypes.apply(this, arguments); }
  function normalizeDueDate() { return S.normalizeDueDate.apply(this, arguments); }
  function normalizeDueMode() { return S.normalizeDueMode.apply(this, arguments); }
  function normalizeDueTime() { return S.normalizeDueTime.apply(this, arguments); }
  function normalizeDueVague() { return S.normalizeDueVague.apply(this, arguments); }
  function normalizeEmpressementId() { return S.normalizeEmpressementId.apply(this, arguments); }
  function normalizeFormulaKey() { return S.normalizeFormulaKey.apply(this, arguments); }
  function normalizeMemberRoleCatalog() { return S.normalizeMemberRoleCatalog.apply(this, arguments); }
  function normalizeMemberRoleCustoms() { return S.normalizeMemberRoleCustoms.apply(this, arguments); }
  function normalizeMemberRoleIds() { return S.normalizeMemberRoleIds.apply(this, arguments); }
  function normalizeMemberRoles() { return S.normalizeMemberRoles.apply(this, arguments); }
  function normalizePasteableMarkdownUrl() { return S.normalizePasteableMarkdownUrl.apply(this, arguments); }
  function normalizePlaceCatalog() { return S.normalizePlaceCatalog.apply(this, arguments); }
  function normalizePlaceRef() { return S.normalizePlaceRef.apply(this, arguments); }
  function normalizePlaces() { return S.normalizePlaces.apply(this, arguments); }
  function normalizeRecurrence() { return S.normalizeRecurrence.apply(this, arguments); }
  function normalizeTaskTypes() { return S.normalizeTaskTypes.apply(this, arguments); }
  function normalizeTeamLinks() { return S.normalizeTeamLinks.apply(this, arguments); }
  function openCriteriaWizard() { return S.openCriteriaWizard.apply(this, arguments); }
  function openHelpModal() { return S.openHelpModal.apply(this, arguments); }
  function overrideBaseline() { return S.overrideBaseline.apply(this, arguments); }
  function overrideEisenhower() { return S.overrideEisenhower.apply(this, arguments); }
  function overrideValueEffort() { return S.overrideValueEffort.apply(this, arguments); }
  function overrideWSJF() { return S.overrideWSJF.apply(this, arguments); }
  function parseDurationNl() { return S.parseDurationNl.apply(this, arguments); }
  function parseTrelloDueToParts() { return S.parseTrelloDueToParts.apply(this, arguments); }
  function placeRefsOf() { return S.placeRefsOf.apply(this, arguments); }
  function pressureToUrgencyLevel() { return S.pressureToUrgencyLevel.apply(this, arguments); }
  function pruneMemberRoleCustoms() { return S.pruneMemberRoleCustoms.apply(this, arguments); }
  function randomTaskTypeIconKey() { return S.randomTaskTypeIconKey.apply(this, arguments); }
  function rankBlockedReasonSuggestions() { return S.rankBlockedReasonSuggestions.apply(this, arguments); }
  function rebuildTrelloBadgeColors() { return S.rebuildTrelloBadgeColors.apply(this, arguments); }
  function removeMemberFromRoles() { return S.removeMemberFromRoles.apply(this, arguments); }
  function removePersonFromTeamLinks() { return S.removePersonFromTeamLinks.apply(this, arguments); }
  function removeTeamLink() { return S.removeTeamLink.apply(this, arguments); }
  function renderMarkdownToHtml() { return S.renderMarkdownToHtml.apply(this, arguments); }
  function renderSmartCardHtml() { return S.renderSmartCardHtml.apply(this, arguments); }
  function resolveDisplay() { return S.resolveDisplay.apply(this, arguments); }
  function resolveDueDateQuickSuggestion() { return S.resolveDueDateQuickSuggestion.apply(this, arguments); }
  function resolveDueVagueToDate() { return S.resolveDueVagueToDate.apply(this, arguments); }
  function resolveMatrixLabel() { return S.resolveMatrixLabel.apply(this, arguments); }
  function resolveSectionExpanded() { return S.resolveSectionExpanded.apply(this, arguments); }
  function routeTeamLink() { return S.routeTeamLink.apply(this, arguments); }
  function saveSectionCollapseState() { return S.saveSectionCollapseState.apply(this, arguments); }
  function saveStatutEmbeddedDetailsExpanded() { return S.saveStatutEmbeddedDetailsExpanded.apply(this, arguments); }
  function saveStoredColorSchemeKey() { return S.saveStoredColorSchemeKey.apply(this, arguments); }
  function saveStoredFormulaKey() { return S.saveStoredFormulaKey.apply(this, arguments); }
  function schemeBadgePreviewSamples() { return S.schemeBadgePreviewSamples.apply(this, arguments); }
  function setCustomAssigneeCatalog() { return S.setCustomAssigneeCatalog.apply(this, arguments); }
  function setCustomTaskTypes() { return S.setCustomTaskTypes.apply(this, arguments); }
  function setMatrixSettings() { return S.setMatrixSettings.apply(this, arguments); }
  function setMemberRoleCatalog() { return S.setMemberRoleCatalog.apply(this, arguments); }
  function setMemberRoleCustoms() { return S.setMemberRoleCustoms.apply(this, arguments); }
  function setPlaceCatalog() { return S.setPlaceCatalog.apply(this, arguments); }
  function setTimeFormat() { return S.setTimeFormat.apply(this, arguments); }
  function shortTierLabel() { return S.shortTierLabel.apply(this, arguments); }
  function sliderAxisValue() { return S.sliderAxisValue.apply(this, arguments); }
  function sliderToDuration() { return S.sliderToDuration.apply(this, arguments); }
  function smartCardModeForLink() { return S.smartCardModeForLink.apply(this, arguments); }
  function stripMarkdownLinePrefix() { return S.stripMarkdownLinePrefix.apply(this, arguments); }
  function taskBadgeLabel() { return S.taskBadgeLabel.apply(this, arguments); }
  function taskBadgeLabelForTierKey() { return S.taskBadgeLabelForTierKey.apply(this, arguments); }
  function taskTypeHint() { return S.taskTypeHint.apply(this, arguments); }
  function taskTypeIconKey() { return S.taskTypeIconKey.apply(this, arguments); }
  function taskTypeIconSvg() { return S.taskTypeIconSvg.apply(this, arguments); }
  function taskTypeLabel() { return S.taskTypeLabel.apply(this, arguments); }
  function tierBadgeDotChar() { return S.tierBadgeDotChar.apply(this, arguments); }
  function tierFor() { return S.tierFor.apply(this, arguments); }
  function tierLabelForSpace() { return S.tierLabelForSpace.apply(this, arguments); }
  function tierTrelloBadgeColor() { return S.tierTrelloBadgeColor.apply(this, arguments); }
  function trelloDueIsoFromParts() { return S.trelloDueIsoFromParts.apply(this, arguments); }
  function upsertCustomAssigneeCatalog() { return S.upsertCustomAssigneeCatalog.apply(this, arguments); }
  function upsertPlaceCatalog() { return S.upsertPlaceCatalog.apply(this, arguments); }
  function upsertTeamLink() { return S.upsertTeamLink.apply(this, arguments); }
  function urgencyBoost() { return S.urgencyBoost.apply(this, arguments); }
  function urgencyLevelToPressure() { return S.urgencyLevelToPressure.apply(this, arguments); }
  function withDueDateDisplay() { return S.withDueDateDisplay.apply(this, arguments); }
  function wordFor() { return S.wordFor.apply(this, arguments); }
  function wordHtmlFor() { return S.wordHtmlFor.apply(this, arguments); }
  function wrapMarkdownInlineSelection() { return S.wrapMarkdownInlineSelection.apply(this, arguments); }

  // ── 10b. Mini editors (Gantt popovers) ──────────────────────────────────

  var DEFAULT_MINI_DIMENSIONS = [
    {
      key: 'impact',
      label: 'Impact',
      icon: 'ti-target-arrow',
      wordsKey: 'impact',
      min: 0,
      max: AXIS_SCORE_MAX,
      value: 5
    },
    {
      key: 'ease',
      label: 'Facilit\u00e9',
      icon: 'ti-gauge',
      wordsKey: 'ease',
      min: 0,
      max: AXIS_SCORE_MAX,
      value: 5
    },
    {
      key: 'empressement',
      label: 'Empressement',
      icon: 'ti-flame',
      wordsKey: 'empressement',
      min: 0,
      max: EMPRESSEMENT_UI_MAX,
      value: 0
    }
  ];

  /**
   * Compact Priorité editor: heat panel + Urgence / Impact / Facilité sliders.
   * Reuses createHeatPanel + createField (same as mountVariant Priorité body).
   */
  function mountMiniPriority(containerEl, config) {
    if (!containerEl) throw new Error('mountMiniPriority: container required');
    config = config || {};
    var onStateChange =
      typeof config.onStateChange === 'function' ? config.onStateChange : function () {};
    var dimensions =
      Array.isArray(config.dimensions) && config.dimensions.length
        ? config.dimensions
        : DEFAULT_MINI_DIMENSIONS;
    var formulaKey = normalizeFormulaKey(config.formula || 'baseline');
    var formula = FORMULAS[formulaKey] || FORMULAS.baseline;
    var calcFn = formula.calc;
    var overrideFn = formula.override;
    var defaults = config.defaults && typeof config.defaults === 'object' ? config.defaults : {};
    var idPrefix = config.id || 'mini';

    var state = {};
    dimensions.forEach(function (dim) {
      state[dim.key] = sliderAxisValue(
        dim,
        defaults[dim.key] != null ? defaults[dim.key] : dim.value
      );
    });
    state.priorityEnabled = true;

    var root = document.createElement('div');
    root.className = 'tp-mini-priority';
    containerEl.appendChild(root);

    var heat = null;
    var fields = {};
    var sliderAnimFrame = null;

    function syncStateFromFields() {
      Object.keys(fields).forEach(function (key) {
        state[key] = fields[key].getValue();
      });
    }

    function emitChange(skipFieldSync) {
      if (!skipFieldSync) syncStateFromFields();
      onStateChange(Object.assign({}, state));
    }

    function cancelSliderAnim() {
      if (sliderAnimFrame != null) {
        cancelAnimationFrame(sliderAnimFrame);
        sliderAnimFrame = null;
      }
    }

    function animateFieldsTo(targets) {
      cancelSliderAnim();
      var from = {};
      var keys = Object.keys(targets);
      keys.forEach(function (key) {
        from[key] = fields[key]
          ? fields[key].getValue()
          : state[key] != null
            ? state[key]
            : targets[key];
      });
      var allSame = keys.every(function (key) {
        return Math.abs(from[key] - targets[key]) < 1e-9;
      });
      if (allSame) {
        keys.forEach(function (key) {
          state[key] = targets[key];
          if (fields[key]) fields[key].setValue(targets[key]);
        });
        repaint();
        emitChange(true);
        return;
      }
      keys.forEach(function (key) {
        state[key] = targets[key];
      });
      // Save the preset before the sliders animate. emitChange() would read the
      // still-old fields and the card would keep its previous level.
      emitChange(true);
      var startTime = null;
      function step(ts) {
        if (startTime == null) startTime = ts;
        var t = Math.min(1, (ts - startTime) / SLIDER_ANIM_MS);
        var eased = easeOutCubic(t);
        keys.forEach(function (key) {
          if (fields[key]) {
            fields[key].updateDisplay(lerp(from[key], targets[key], eased));
          }
        });
        repaint();
        if (t < 1) {
          sliderAnimFrame = requestAnimationFrame(step);
        } else {
          sliderAnimFrame = null;
          keys.forEach(function (key) {
            if (fields[key]) fields[key].setValue(targets[key]);
          });
          repaint();
        }
      }
      sliderAnimFrame = requestAnimationFrame(step);
    }

    function repaint() {
      syncStateFromFields();
      var result = calcFn(state);
      var display = resolveDisplay(result, state);
      if (heat) heat.paint(result, display);
      return display;
    }

    heat = createHeatPanel({
      el: root,
      formulaKey: formulaKey,
      hideSegments: formulaKey === 'eisenhower',
      onSegmentClick: function (targetP) {
        syncStateFromFields();
        var delta = heatSegmentDelta(state, targetP, overrideFn);
        if (!Object.keys(delta).length) return;
        animateFieldsTo(delta);
      }
    });

    var fieldsWrap = document.createElement('div');
    fieldsWrap.className = 'variant-fields tp-mini-priority-fields';
    root.appendChild(fieldsWrap);

    dimensions.forEach(function (dim) {
      fields[dim.key] = createField({
        el: fieldsWrap,
        id: idPrefix + '-' + dim.key,
        label: dim.label,
        icon: dim.icon,
        wordsKey: dim.wordsKey || dim.key,
        min: dim.min,
        max: dim.max,
        value: state[dim.key],
        onChange: function () {
          cancelSliderAnim();
          repaint();
          emitChange();
        }
      });
    });

    repaint();

    return {
      el: root,
      getState: function () {
        syncStateFromFields();
        return Object.assign({}, state);
      },
      setState: function (next) {
        if (!next || typeof next !== 'object') return;
        dimensions.forEach(function (dim) {
          if (next[dim.key] == null) return;
          state[dim.key] = sliderAxisValue(dim, next[dim.key]);
          if (fields[dim.key]) fields[dim.key].setValue(state[dim.key]);
        });
        repaint();
      },
      destroy: function () {
        cancelSliderAnim();
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  /**
   * Compact Échéance editor wrapping createDueDateField.
   */
  function mountMiniDue(containerEl, config) {
    if (!containerEl) throw new Error('mountMiniDue: container required');
    config = config || {};
    var onChange =
      typeof config.onChange === 'function' ? config.onChange : function () {};
    var root = document.createElement('div');
    root.className = 'tp-mini-due';
    containerEl.appendChild(root);

    var dueField = createDueDateField({
      el: root,
      value: config.value || {},
      expanded: true,
      onChange: function () {
        onChange(dueField.getValues());
      },
      onExpandChange: function () {},
      onLayoutChange: function () {}
    });
    if (dueField && dueField.setExpanded) {
      dueField.setExpanded(true, { persist: false });
    }

    return {
      el: root,
      getValues: function () {
        return dueField.getValues();
      },
      setValue: function (v, opts) {
        dueField.setValue(v, opts);
      },
      destroy: function () {
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  /**
   * Compact Bloqué editor wrapping createEnAttenteField (embedded).
   */
  function mountMiniBlocked(containerEl, config) {
    if (!containerEl) throw new Error('mountMiniBlocked: container required');
    config = config || {};
    var onChange =
      typeof config.onChange === 'function' ? config.onChange : function () {};
    var root = document.createElement('div');
    root.className = 'tp-mini-blocked';
    containerEl.appendChild(root);

    var field = createEnAttenteField({
      el: root,
      value: !!config.value,
      blockedReasons: config.blockedReasons,
      blockedLinks: config.blockedLinks,
      embedded: true,
      hideSubtaskPicker: config.hideSubtaskPicker !== false,
      getSubtasks: config.getSubtasks || null,
      onChange: function () {
        onChange({
          enAttente: field.getValue(),
          blockedReasons: field.getBlockedReasons
            ? field.getBlockedReasons()
            : [],
          blockedLinks: field.getBlockedLinks ? field.getBlockedLinks() : []
        });
      },
      onLayoutChange: function () {}
    });

    return {
      el: root,
      getValue: function () {
        return {
          enAttente: field.getValue(),
          blockedReasons: field.getBlockedReasons
            ? field.getBlockedReasons()
            : [],
          blockedLinks: field.getBlockedLinks ? field.getBlockedLinks() : []
        };
      },
      setValue: function (next) {
        if (!next || typeof next !== 'object') return;
        if (next.enAttente != null) field.setValue(!!next.enAttente);
        if (next.blockedReasons != null && field.setBlockedReasons) {
          field.setBlockedReasons(next.blockedReasons);
        }
        if (next.blockedLinks != null && field.setBlockedLinks) {
          field.setBlockedLinks(next.blockedLinks);
        }
      },
      destroy: function () {
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  // ── 11. PriorityUI public API ───────────────────────────────────────────

  var PriorityUI = {
    WEIGHTS: { time: WT, blocking: WB, impact: WI, ease: WI_EASE },
    PRESSURE_MAX: PRESSURE_MAX,
    SCORE_MAX: SCORE_MAX,
    AXIS_UI_MAX: AXIS_UI_MAX,
    AXIS_SCORE_MAX: AXIS_SCORE_MAX,
    IMPACT_UI_MAX: IMPACT_UI_MAX,
    EASE_UI_MAX: EASE_UI_MAX,
    EMPRESSEMENT_UI_MAX: EMPRESSEMENT_UI_MAX,
    // ── Priority adaptation (Impact + Facilité + Échéance + Empressement) ──
    BASE_IMPACT_WEIGHT: BASE_IMPACT_WEIGHT,
    BASE_EASE_WEIGHT: BASE_EASE_WEIGHT,
    EASE_QUICK_WINS: EASE_QUICK_WINS,
    DATE_PROXIMITY_TAU_DAYS: DATE_PROXIMITY_TAU_DAYS,
    DATE_GAIN_MOVABLE: DATE_GAIN_MOVABLE,
    DATE_GAIN_FIXED: DATE_GAIN_FIXED,
    EMPRESSEMENT_PULL_MAX: EMPRESSEMENT_PULL_MAX,
    IMPACT_SYNERGY_PER_EXTRA: IMPACT_SYNERGY_PER_EXTRA,
    URGENCY_MIGRATION_MODE: URGENCY_MIGRATION_MODE,
    URGENCY_REVIEW_THRESHOLD_10: URGENCY_REVIEW_THRESHOLD_10,
    EMPRESSEMENT_OPTIONS: EMPRESSEMENT_OPTIONS,
    EMPRESSEMENT_DEFAULT_ID: EMPRESSEMENT_DEFAULT_ID,
    IMPACT_FACTOR_DEFS: IMPACT_FACTOR_DEFS,
    EASE_COST_DEFS: EASE_COST_DEFS,
    DUE_LIMIT_STATE_NONE: DUE_LIMIT_STATE_NONE,
    DUE_LIMIT_STATE_HAS: DUE_LIMIT_STATE_HAS,
    DUE_DATE_FIXE_COPY: DUE_DATE_FIXE_COPY,
    URGENCY_REVIEW_PROMPT: URGENCY_REVIEW_PROMPT,
    empressementOptionById: empressementOptionById,
    empressementOptionByIndex: empressementOptionByIndex,
    normalizeEmpressementId: normalizeEmpressementId,
    empressementIndex: empressementIndex,
    impactFactorDefById: impactFactorDefById,
    easeCostDefById: easeCostDefById,
    computeImpactFromFactors: computeImpactFromFactors,
    computeEaseFromCosts: computeEaseFromCosts,
    effectiveImpact: effectiveImpact,
    effectiveEase: effectiveEase,
    easeForScore: easeForScore,
    cardHasDueDate: cardHasDueDate,
    computeDatePull: computeDatePull,
    computeEmpressePull: computeEmpressePull,
    computeBaseScore: computeBaseScore,
    deriveLegacyUrgency: deriveLegacyUrgency,
    migrateLegacyUrgency: migrateLegacyUrgency,
    migrateLegacyAxisScales: migrateLegacyAxisScales,
    calcBaselineTermsFromInputs: calcBaselineTermsFromInputs,
    createAxisFactorsWidget: createAxisFactorsWidget,
    TIER_I: TIER_I,
    TIER_I_MAX: TIER_I_MAX,
    TIER_I_SCHEME_MAPPED_MAX: TIER_I_SCHEME_MAPPED_MAX,
    TRELLO_BADGE_COLOR_MUTED: TRELLO_BADGE_COLOR_MUTED,
    TRELLO_BADGE_COLOR_COMPLETE: TRELLO_BADGE_COLOR_COMPLETE,
    TRELLO_BADGE_COLOR_HEX: TRELLO_BADGE_COLOR_HEX,
    TRELLO_BADGE_COLOR_NAMES: TRELLO_BADGE_COLOR_NAMES,
    LABELS: LABELS,
    KEYWORDS: KEYWORDS,
    QUESTIONS: QUESTIONS,
    TIERS: S.TIERS,
    TIER_DEFS: TIER_DEFS,
    PRIORITY_BLUE_STOPS: PRIORITY_BLUE_STOPS,
    COLOR_SCHEMES: COLOR_SCHEMES,
    COLOR_SCHEME_OPTIONS: COLOR_SCHEME_OPTIONS,
    DEFAULT_COLOR_SCHEME_KEY: DEFAULT_COLOR_SCHEME_KEY,
    normalizeColorSchemeKey: normalizeColorSchemeKey,
    applyColorScheme: applyColorScheme,
    getActiveColorSchemeKey: getActiveColorSchemeKey,
    loadStoredColorSchemeKey: loadStoredColorSchemeKey,
    saveStoredColorSchemeKey: saveStoredColorSchemeKey,
    TIER_LABEL_SHORT: TIER_LABEL_SHORT,
    TIER_SURFACE_MIX: TIER_SURFACE_MIX,
    HEAT_SEGMENTS: HEAT_SEGMENTS,
    heatSegmentDelta: heatSegmentDelta,
    sliderAxisValue: sliderAxisValue,
    shortTierLabel: shortTierLabel,
    tierLabelForSpace: tierLabelForSpace,
    FORMULAS: FORMULAS,
    FORMULA_OPTIONS: FORMULA_OPTIONS,
    EISENHOWER_QUADRANTS: EISENHOWER_QUADRANTS,
    EISENHOWER_URGENCY_THRESHOLD: EISENHOWER_URGENCY_THRESHOLD,
    EISENHOWER_IMPACT_THRESHOLD: EISENHOWER_IMPACT_THRESHOLD,
    normalizeFormulaKey: normalizeFormulaKey,
    loadStoredFormulaKey: loadStoredFormulaKey,
    saveStoredFormulaKey: saveStoredFormulaKey,
    SECTION_COLLAPSE_STORAGE_KEY: SECTION_COLLAPSE_STORAGE_KEY,
    loadSectionCollapseState: loadSectionCollapseState,
    saveSectionCollapseState: saveSectionCollapseState,
    resolveSectionExpanded: resolveSectionExpanded,
    STATUT_EMBEDDED_DETAILS_STORAGE_KEY: STATUT_EMBEDDED_DETAILS_STORAGE_KEY,
    loadStatutEmbeddedDetailsExpanded: loadStatutEmbeddedDetailsExpanded,
    saveStatutEmbeddedDetailsExpanded: saveStatutEmbeddedDetailsExpanded,
    eisenhowerQuadrantFor: eisenhowerQuadrantFor,
    isEisenhowerUrgent: isEisenhowerUrgent,
    isEisenhowerImportant: isEisenhowerImportant,
    calc: {
      baseline: calcBaseline,
      eisenhower: calcEisenhower,
      wsjf: calcWSJF,
      valueEffort: calcValueEffort,
      threeDMerged: calcBaseline,
      mergePressure: mergePressure,
      urgencyLevelToPressure: urgencyLevelToPressure,
      pressureToUrgencyLevel: pressureToUrgencyLevel,
      impactTerm: impactTerm,
      curveImpact: curveImpact,
      dampenCurve: dampenCurve,
      urgencyBoost: urgencyBoost,
      calcBaselineTerms: calcBaselineTerms,
      calcBaselineTermsRaw: calcBaselineTermsRaw,
      baselineScore: baselineScore,
      BASELINE_RAW_MAX: BASELINE_RAW_MAX,
      BASELINE_SCORE_SCALE: BASELINE_SCORE_SCALE
    },
    format: {
      baseline: formatBaseline,
      eisenhower: formatEisenhower,
      wsjf: formatWSJF,
      valueEffort: formatValueEffort,
      threeD: formatBaseline,
      scoreBreakdown: formatScoreBreakdown
    },
    override: {
      baseline: overrideBaseline,
      eisenhower: overrideEisenhower,
      wsjf: overrideWSJF,
      valueEffort: overrideValueEffort,
      threeD: overrideBaseline
    },
    openHelpModal: openHelpModal,
    closeHelpModal: closeHelpModal,
    openCriteriaWizard: openCriteriaWizard,
    createField: createField,
    createStatutField: createStatutField,
    createEnAttenteField: createEnAttenteField,
    createDueDateField: createDueDateField,
    createHeatPanel: createHeatPanel,
    createCalcGraphPanel: createCalcGraphPanel,
    createFormulaSwitcher: createFormulaSwitcher,
    mountVariant: mountVariant,
    mountMiniPriority: mountMiniPriority,
    mountMiniDue: mountMiniDue,
    mountMiniBlocked: mountMiniBlocked,
    tierFor: tierFor,
    isInutile: isInutile,
    isEnAttente: isEnAttente,
    resolveDisplay: resolveDisplay,
    classicTierLabel: classicTierLabel,
    TASK_BADGE_LABELS: TASK_BADGE_LABELS,
    taskBadgeLabel: taskBadgeLabel,
    taskBadgeLabelForTierKey: taskBadgeLabelForTierKey,
    blockedTaskBadgeLabel: blockedTaskBadgeLabel,
    formatCompletedBadgeLabel: formatCompletedBadgeLabel,
    COMPLETED_BADGE_PREFIX: COMPLETED_BADGE_PREFIX,
    DEFINE_PRIORITY_LABEL: DEFINE_PRIORITY_LABEL,
    tierTrelloBadgeColor: tierTrelloBadgeColor,
    schemeBadgePreviewSamples: schemeBadgePreviewSamples,
    rebuildTrelloBadgeColors: rebuildTrelloBadgeColors,
    tierBadgeDotChar: tierBadgeDotChar,
    heatTierDotSizePx: heatTierDotSizePx,
    HEAT_TIER_DOT_SIZES: HEAT_TIER_DOT_SIZES,
    TIER_TRELLO_BADGE_COLORS: S.TIER_TRELLO_BADGE_COLORS,
    TIER_BADGE_DOTS: TIER_BADGE_DOTS,
    BADGE_DOT_DEFAULT: BADGE_DOT_DEFAULT,
    BADGE_DOT_COMPLETE: BADGE_DOT_COMPLETE,
    BADGE_DOT_INUTILE: BADGE_DOT_INUTILE,
    setMatrixSettings: setMatrixSettings,
    getMatrixSettings: getMatrixSettings,
    resolveMatrixLabel: resolveMatrixLabel,
    INUTILE_EPS: INUTILE_EPS,
    INUTILE_LABEL: INUTILE_LABEL,
    INUTILE_STYLES: INUTILE_STYLES,
    BLOCKED_SYMBOL: BLOCKED_SYMBOL,
    BLOCKED_LABEL: BLOCKED_LABEL,
    BLOCKED_DISPLAY: BLOCKED_DISPLAY,
    BLOCKED_DESCRIPTION: BLOCKED_DESCRIPTION,
    BLOCKED_REASON_PLACEHOLDER: BLOCKED_REASON_PLACEHOLDER,
    BLOCKED_REASON_SUGGESTIONS_LABEL: BLOCKED_REASON_SUGGESTIONS_LABEL,
    BLOCKED_REASON_CLEAR_LABEL: BLOCKED_REASON_CLEAR_LABEL,
    BLOCKED_REASON_EDIT_LABEL: BLOCKED_REASON_EDIT_LABEL,
    BLOCKED_REASON_OPTIONS: BLOCKED_REASON_OPTIONS,
    BLOCKED_REASON_CORE_PRESETS: BLOCKED_REASON_CORE_PRESETS,
    BLOCKED_REASON_FREQ_STORAGE_KEY: BLOCKED_REASON_FREQ_STORAGE_KEY,
    BLOCKED_REASON_EMPTY_SUGGESTION_CAP: BLOCKED_REASON_EMPTY_SUGGESTION_CAP,
    BLOCKED_REASON_FILTER_SUGGESTION_CAP: BLOCKED_REASON_FILTER_SUGGESTION_CAP,
    BLOCKED_REASON_WAITING_OTHER_TASK: BLOCKED_REASON_WAITING_OTHER_TASK,
    BLOCKED_LINK_TYPE_SUBTASK: BLOCKED_LINK_TYPE_SUBTASK,
    BLOCKED_SUBTASK_FALLBACK_LABEL: BLOCKED_SUBTASK_FALLBACK_LABEL,
    BLOCKED_WAITING_ON_PREFIX: BLOCKED_WAITING_ON_PREFIX,
    isValidBlockedReason: isValidBlockedReason,
    normalizeBlockedReason: normalizeBlockedReason,
    normalizeBlockedReasons: normalizeBlockedReasons,
    formatBlockedReasonsSummary: formatBlockedReasonsSummary,
    formatBlockedWaitingOnLabel: formatBlockedWaitingOnLabel,
    expandBlockedReasonsForDisplay: expandBlockedReasonsForDisplay,
    rankBlockedReasonSuggestions: rankBlockedReasonSuggestions,
    bumpBlockedReasonFreq: bumpBlockedReasonFreq,
    isBlockedWaitingOtherTask: isBlockedWaitingOtherTask,
    normalizeBlockedLink: normalizeBlockedLink,
    normalizeBlockedLinks: normalizeBlockedLinks,
    formatBlockedBadgeText: formatBlockedBadgeText,
    TASK_TYPES: TASK_TYPES,
    BUILTIN_TASK_TYPES: BUILTIN_TASK_TYPES,
    CUSTOM_TASK_TYPE_ICON_KEYS: CUSTOM_TASK_TYPE_ICON_KEYS,
    TASK_TYPE_TABLER_ICONS: TASK_TYPE_TABLER_ICONS,
    randomTaskTypeIconKey: randomTaskTypeIconKey,
    getTaskTypeIconKeys: getTaskTypeIconKeys,
    isValidTaskTypeId: isValidTaskTypeId,
    isCustomTaskTypeId: isCustomTaskTypeId,
    taskTypeLabel: taskTypeLabel,
    taskTypeHint: taskTypeHint,
    taskTypeIconKey: taskTypeIconKey,
    taskTypeIconSvg: taskTypeIconSvg,
    getTaskTypeCatalog: getTaskTypeCatalog,
    getCustomTaskTypes: getCustomTaskTypes,
    setCustomTaskTypes: setCustomTaskTypes,
    normalizeCustomTaskTypes: normalizeCustomTaskTypes,
    createCustomTaskType: createCustomTaskType,
    normalizeTaskTypes: normalizeTaskTypes,
    BUILTIN_MEMBER_ROLES: BUILTIN_MEMBER_ROLES,
    isCustomMemberRoleId: isCustomMemberRoleId,
    isBuiltinMemberRoleId: isBuiltinMemberRoleId,
    isValidMemberRoleId: isValidMemberRoleId,
    defaultMemberRoleCatalog: defaultMemberRoleCatalog,
    getMemberRoleCatalog: getMemberRoleCatalog,
    setMemberRoleCatalog: setMemberRoleCatalog,
    normalizeMemberRoleCatalog: normalizeMemberRoleCatalog,
    getMemberRoleCustoms: getMemberRoleCustoms,
    setMemberRoleCustoms: setMemberRoleCustoms,
    normalizeMemberRoleCustoms: normalizeMemberRoleCustoms,
    createCustomMemberRole: createCustomMemberRole,
    memberRoleLabel: memberRoleLabel,
    memberRoleIconKey: memberRoleIconKey,
    getMemberRoleEntry: getMemberRoleEntry,
    normalizeMemberRoleIds: normalizeMemberRoleIds,
    normalizeMemberRoles: normalizeMemberRoles,
    pruneMemberRoleCustoms: pruneMemberRoleCustoms,
    removeMemberFromRoles: removeMemberFromRoles,
    isCustomAssigneeId: isCustomAssigneeId,
    normalizeCustomAssignees: normalizeCustomAssignees,
    createCustomAssignee: createCustomAssignee,
    getCustomAssigneeCatalog: getCustomAssigneeCatalog,
    setCustomAssigneeCatalog: setCustomAssigneeCatalog,
    findCustomAssigneeCatalogById: findCustomAssigneeCatalogById,
    findCustomAssigneeCatalogByName: findCustomAssigneeCatalogByName,
    upsertCustomAssigneeCatalog: upsertCustomAssigneeCatalog,
    mergeIntoCustomAssigneeCatalog: mergeIntoCustomAssigneeCatalog,
    customAssigneeToMember: customAssigneeToMember,
    mergeAssigneesForDisplay: mergeAssigneesForDisplay,
    normalizeTeamLinks: normalizeTeamLinks,
    upsertTeamLink: upsertTeamLink,
    connectTeamPeople: connectTeamPeople,
    removeTeamLink: removeTeamLink,
    removePersonFromTeamLinks: removePersonFromTeamLinks,
    layoutTeamGraph: layoutTeamGraph,
    routeTeamLink: routeTeamLink,
    isPlaceId: isPlaceId,
    normalizePlaceRef: normalizePlaceRef,
    normalizePlaces: normalizePlaces,
    placeRefsOf: placeRefsOf,
    normalizePlaceCatalog: normalizePlaceCatalog,
    createPlaceRef: createPlaceRef,
    getPlaceCatalog: getPlaceCatalog,
    setPlaceCatalog: setPlaceCatalog,
    findPlaceCatalogById: findPlaceCatalogById,
    findPlaceCatalogByName: findPlaceCatalogByName,
    upsertPlaceCatalog: upsertPlaceCatalog,
    mergeIntoPlaceCatalog: mergeIntoPlaceCatalog,
    PLACE_SLOTS: PLACE_SLOTS.slice(),
    MS_PER_DAY: MS_PER_DAY,
    MS_PER_HOUR: MS_PER_HOUR,
    MS_PER_MINUTE: MS_PER_MINUTE,
    COUNTDOWN_DAYS_PER_WEEK: COUNTDOWN_DAYS_PER_WEEK,
    COUNTDOWN_WEEK_THRESHOLD_DAYS: COUNTDOWN_WEEK_THRESHOLD_DAYS,
    COUNTDOWN_YEAR_THRESHOLD_DAYS: COUNTDOWN_YEAR_THRESHOLD_DAYS,
    DAYS_PER_MONTH_AVG: DAYS_PER_MONTH_AVG,
    DAYS_PER_YEAR_AVG: DAYS_PER_YEAR_AVG,
    DUE_DATE_TIME_DEFAULT: DUE_DATE_TIME_DEFAULT,
    DUE_DATE_QUICK_SUGGESTIONS: DUE_DATE_QUICK_SUGGESTIONS,
    normalizeDueDate: normalizeDueDate,
    normalizeDueTime: normalizeDueTime,
    trelloDueIsoFromParts: trelloDueIsoFromParts,
    parseTrelloDueToParts: parseTrelloDueToParts,
    canonicalizeTrelloDueIso: canonicalizeTrelloDueIso,
    inputsToTrelloDueIso: inputsToTrelloDueIso,
    inputsToTrelloStartIso: inputsToTrelloStartIso,
    normalizeRecurrence: normalizeRecurrence,
    advanceDateByRecurrence: advanceDateByRecurrence,
    nextOccurrenceParts: nextOccurrenceParts,
    formatRecurrenceLabelFr: formatRecurrenceLabelFr,
    RECURRENCE_FREQUENCIES: RECURRENCE_FREQUENCIES,
    isDueDateQuickSuggestionAvailable: isDueDateQuickSuggestionAvailable,
    resolveDueDateQuickSuggestion: resolveDueDateQuickSuggestion,
    DUE_DATE_MODE_PRECISE: DUE_DATE_MODE_PRECISE,
    DUE_DATE_MODE_VAGUE: DUE_DATE_MODE_VAGUE,
    DUE_DATE_VAGUE_OPTIONS: DUE_DATE_VAGUE_OPTIONS,
    DUE_DATE_VAGUE_DEFAULT_ID: DUE_DATE_VAGUE_DEFAULT_ID,
    normalizeDueMode: normalizeDueMode,
    normalizeDueVague: normalizeDueVague,
    dueVagueIndex: dueVagueIndex,
    dueVagueIdAtIndex: dueVagueIdAtIndex,
    resolveDueVagueToDate: resolveDueVagueToDate,
    formatDueVagueLabel: formatDueVagueLabel,
    formatDueVagueCountdown: formatDueVagueCountdown,
    isDueVagueMode: isDueVagueMode,
    isDueVagueEligible: isDueVagueEligible,
    daysUntilDue: daysUntilDue,
    msUntilDue: msUntilDue,
    isDuePast: isDuePast,
    setTimeFormat: setTimeFormat,
    getTimeFormat: getTimeFormat,
    isHour12: isHour12,
    formatDueCountdown: formatDueCountdown,
    formatDueCountdownFromInputs: formatDueCountdownFromInputs,
    formatDueTimeDisplay: formatDueTimeDisplay,
    formatDueTimeCompactFr: formatDueTimeCompactFr,
    formatDueDateDisplay: formatDueDateDisplay,
    formatDueDateCompactSummary: formatDueDateCompactSummary,
    dueProximityBand: dueProximityBand,
    dueBandAccent: dueBandAccent,
    formatDueDateHumanReadable: formatDueDateHumanReadable,
    formatDueDateTriggerTitle: formatDueDateTriggerTitle,
    formatDueTimeTriggerTitle: formatDueTimeTriggerTitle,
    formatDueTimePeriodLabel: formatDueTimePeriodLabel,
    formatDueBadgeText: formatDueBadgeText,
    dueBadgeSuffix: dueBadgeSuffix,
    isDueEnabled: isDueEnabled,
    withDueDateDisplay: withDueDateDisplay,
    buildProgressSummaryNode: buildProgressSummaryNode,
    buildOverviewTasksFromCompletion: buildOverviewTasksFromCompletion,
    buildOverviewSummaryText: buildOverviewSummaryText,
    buildOverviewEnrichment: buildOverviewEnrichment,
    createOverviewField: createOverviewField,
    createInfoField: createInfoField,
    firstRowEditControl: firstRowEditControl,
    renderMarkdownToHtml: renderMarkdownToHtml,
    markdownFromRichRoot: markdownFromRichRoot,
    wrapMarkdownInlineSelection: wrapMarkdownInlineSelection,
    linkMarkdownSelection: linkMarkdownSelection,
    normalizePasteableMarkdownUrl: normalizePasteableMarkdownUrl,
    applyMarkdownBlockFormat: applyMarkdownBlockFormat,
    detectMarkdownLineFormat: detectMarkdownLineFormat,
    stripMarkdownLinePrefix: stripMarkdownLinePrefix,
    smartCardModeForLink: smartCardModeForLink,
    renderSmartCardHtml: renderSmartCardHtml,
    fetchLinkPreviewMeta: fetchLinkPreviewMeta,
    hydrateSmartLinkPreviews: hydrateSmartLinkPreviews,
    createCollapsibleEnableChrome: createCollapsibleEnableChrome,
    bindCollapsibleEnable: bindCollapsibleEnable,
    wordFor: wordFor,
    wordHtmlFor: wordHtmlFor,
    levelIconSvg: levelIconSvg,
    affirmationFor: affirmationFor,
    affirmationDisplayText: affirmationDisplayText,
    formatDurationFr: formatDurationFr,
    parseDurationNl: parseDurationNl,
    durationToSlider: durationToSlider,
    sliderToDuration: sliderToDuration,
    clampDurationMinutes: clampDurationMinutes,
    DURATION_MIN_MINUTES: DURATION_MIN_MINUTES,
    DURATION_MAX_MINUTES: DURATION_MAX_MINUTES
  };

  global.PriorityUI = PriorityUI;

  try {
    applyColorScheme(DEFAULT_COLOR_SCHEME_KEY);
  } catch (bootstrapErr) {
    console.error('PriorityUI color scheme bootstrap failed', bootstrapErr);
  }

  // exports
  S.DEFAULT_MINI_DIMENSIONS = DEFAULT_MINI_DIMENSIONS;
  S.PriorityUI = PriorityUI;
  S.mountMiniBlocked = mountMiniBlocked;
  S.mountMiniDue = mountMiniDue;
  S.mountMiniPriority = mountMiniPriority;
})(typeof window !== 'undefined' ? window : this);
