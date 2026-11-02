/**
 * priority-ui: part 12 of 12 (mountVariant).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */

/**
 * priority-ui-mini-editors-api: part 1 of 2 (mountVariant).
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
  function advanceDateByRecurrence() { return S.advanceDateByRecurrence.apply(this, arguments); }
  function affirmationDisplayText() { return S.affirmationDisplayText.apply(this, arguments); }
  function affirmationFor() { return S.affirmationFor.apply(this, arguments); }
  function applyCardTierTint() { return S.applyCardTierTint.apply(this, arguments); }
  function applyColorScheme() { return S.applyColorScheme.apply(this, arguments); }
  function applyDueProximityBand() { return S.applyDueProximityBand.apply(this, arguments); }
  function applyMarkdownBlockFormat() { return S.applyMarkdownBlockFormat.apply(this, arguments); }
  function applyPrioritySectionTint() { return S.applyPrioritySectionTint.apply(this, arguments); }
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
  function clearCardTierTint() { return S.clearCardTierTint.apply(this, arguments); }
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
  function loadSliderValues() { return S.loadSliderValues.apply(this, arguments); }
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
  function mountVariantFailedStub() { return S.mountVariantFailedStub.apply(this, arguments); }
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
  function playPriorityUiSound() { return S.playPriorityUiSound.apply(this, arguments); }
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
  function saveSliderValues() { return S.saveSliderValues.apply(this, arguments); }
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
  function tierVisuals() { return S.tierVisuals.apply(this, arguments); }
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

var S = (global.PriorityUIParts = global.PriorityUIParts || {});
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
  function advanceDateByRecurrence() { return S.advanceDateByRecurrence.apply(this, arguments); }
  function affirmationDisplayText() { return S.affirmationDisplayText.apply(this, arguments); }
  function affirmationFor() { return S.affirmationFor.apply(this, arguments); }
  function applyCardTierTint() { return S.applyCardTierTint.apply(this, arguments); }
  function applyColorScheme() { return S.applyColorScheme.apply(this, arguments); }
  function applyDueProximityBand() { return S.applyDueProximityBand.apply(this, arguments); }
  function applyMarkdownBlockFormat() { return S.applyMarkdownBlockFormat.apply(this, arguments); }
  function applyPrioritySectionTint() { return S.applyPrioritySectionTint.apply(this, arguments); }
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
  function clearCardTierTint() { return S.clearCardTierTint.apply(this, arguments); }
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
  function loadSliderValues() { return S.loadSliderValues.apply(this, arguments); }
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
  function mountVariantFailedStub() { return S.mountVariantFailedStub.apply(this, arguments); }
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
  function playPriorityUiSound() { return S.playPriorityUiSound.apply(this, arguments); }
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
  function saveSliderValues() { return S.saveSliderValues.apply(this, arguments); }
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
  function tierVisuals() { return S.tierVisuals.apply(this, arguments); }
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

  function mountVariant(containerEl, variantConfig) {
    var variantId = variantConfig.id || 'unknown';
    try {
    var formulaKey = variantConfig.formula || loadStoredFormulaKey() || 'baseline';
    var formulaDef = FORMULAS[formulaKey] || FORMULAS.baseline;
    var calcFn = formulaDef.calc;
    var overrideFn = formulaDef.override;

    var card = document.createElement('article');
    card.className = 'variant-card';
    card.dataset.variant = variantConfig.id;

    var defaults = variantConfig.defaults || {};
    var fields = {};
    var state = {};
    var enAttenteField;
    var dueDateField;
    var dueSection;
    var blockedSection;
    var heat;
    var priorityField;
    var calcGraph;
    var formulaSwitcher;
    var sliderAnimFrame = null;
    var focusSection = variantConfig.focusSection || null;

    function sectionExpandedDefault(key, enabledFallback) {
      // Opening focused on one section should not auto-expand the others.
      if (focusSection && key !== focusSection) return false;
      if (focusSection && key === focusSection) return true;
      return !!enabledFallback;
    }

    function sectionExpanded(key, enabledFallback) {
      // Mirror Progrès: focused entry expands that section even if collapse prefs say otherwise.
      if (focusSection && key === focusSection) return true;
      return resolveSectionExpanded(key, sectionExpandedDefault(key, enabledFallback));
    }

    function persistSectionExpanded(key) {
      return function (isExpanded) {
        var patch = {};
        patch[key] = !!isExpanded;
        saveSectionCollapseState(patch);
      };
    }

    function applyFormulaMode(key) {
      formulaKey = key || 'baseline';
      formulaDef = FORMULAS[formulaKey] || FORMULAS.baseline;
      calcFn = formulaDef.calc;
      overrideFn = formulaDef.override;
      card.dataset.formula = formulaKey;
      if (heat) {
        heat.setFormulaKey(formulaKey);
        heat.setHideSegments(formulaKey === 'eisenhower');
      }
    }

    function persistFormulaChange(nextKey) {
      applyFormulaMode(nextKey);
      saveStoredFormulaKey(nextKey);
      if (typeof variantConfig.onFormulaChange === 'function') {
        variantConfig.onFormulaChange(nextKey);
      }
      repaint();
    }

    var defaultState = {};
    variantConfig.dimensions.forEach(function (dim) {
      defaultState[dim.key] = sliderAxisValue(
        dim,
        defaults[dim.key] != null ? defaults[dim.key] : dim.value
      );
    });
    state = typeof variantConfig.loadState === 'function'
      ? variantConfig.loadState(defaultState)
      : loadSliderValues(defaultState, variantConfig.dimensions);
    state.enAttente = !!(state.enAttente || defaults.enAttente);
    state.blockedReasons = normalizeBlockedReasons(
      state.blockedReasons != null || state.blockedReason != null
        ? state
        : defaults
    );
    delete state.blockedReason;
    state.blockedLinks = normalizeBlockedLinks(
      state.blockedLinks != null || state.blockedLink != null
        ? state
        : defaults
    );
    if (!isBlockedWaitingOtherTask(state.blockedReasons) && !state.blockedLinks.length) {
      state.blockedLinks = [];
    } else if (state.blockedLinks.length && !isBlockedWaitingOtherTask(state.blockedReasons)) {
      state.blockedReasons = normalizeBlockedReasons(
        state.blockedReasons.concat([BLOCKED_REASON_WAITING_OTHER_TASK])
      );
    }
    delete state.blockedLink;
    state.dueDate = normalizeDueDate(state.dueDate || defaults.dueDate || '');
    state.dueTime = state.dueDate
      ? normalizeDueTime(state.dueTime || defaults.dueTime || '')
      : '';
    state.dueVague = normalizeDueVague(state.dueVague || defaults.dueVague || '');
    state.dueMode = normalizeDueMode(
      state.dueMode ||
        (state.dueVague ? DUE_DATE_MODE_VAGUE : defaults.dueMode) ||
        DUE_DATE_MODE_PRECISE
    );
    if (state.dueVague) state.dueMode = DUE_DATE_MODE_VAGUE;
    if (state.dueMode === DUE_DATE_MODE_VAGUE && state.dueVague && !state.dueDate) {
      state.dueDate = resolveDueVagueToDate(state.dueVague);
    }
    if (state.dueMode === DUE_DATE_MODE_VAGUE) {
      state.dueTime = '';
    } else {
      state.dueVague = '';
    }
    if (defaults.dueEnabled === false || state.dueEnabled === false) {
      state.dueEnabled = false;
    } else {
      state.dueEnabled = state.dueDate || state.dueVague
        ? true
        : defaults.dueEnabled !== false;
      if (!state.dueDate && !state.dueVague) state.dueEnabled = false;
    }
    state.startDate = normalizeDueDate(
      state.startDate || defaults.startDate || ''
    );
    state.recurrence = normalizeRecurrence(
      state.recurrence != null ? state.recurrence : defaults.recurrence
    );
    // Priorité is always on (no enable checkbox).
    state.priorityEnabled = true;
    state.estimatedDurationMinutes = clampDurationMinutes(
      state.estimatedDurationMinutes != null
        ? state.estimatedDurationMinutes
        : defaults.estimatedDurationMinutes
    );
    // Impact/Facilité are always on the 0–10 scale once saved through this editor.
    state.axesScaledTo10 = true;
    state.dueLimitState =
      state.dueLimitState || defaults.dueLimitState ||
      (state.dueDate || state.dueVague ? DUE_LIMIT_STATE_HAS : DUE_LIMIT_STATE_NONE);
    state.dateFixe = !!(state.dateFixe != null ? state.dateFixe : defaults.dateFixe);
    state.impactFactors =
      state.impactFactors && typeof state.impactFactors === 'object'
        ? state.impactFactors
        : defaults.impactFactors && typeof defaults.impactFactors === 'object'
          ? defaults.impactFactors
          : {};
    state.easeCosts =
      state.easeCosts && typeof state.easeCosts === 'object'
        ? state.easeCosts
        : defaults.easeCosts && typeof defaults.easeCosts === 'object'
          ? defaults.easeCosts
          : {};
    if (state.legacyUrgency == null && defaults.legacyUrgency != null) {
      state.legacyUrgency = defaults.legacyUrgency;
    }
    if (state.urgencyMigrated == null && defaults.urgencyMigrated != null) {
      state.urgencyMigrated = defaults.urgencyMigrated;
    }
    state.urgencyReviewNeeded = !!(
      state.urgencyReviewNeeded != null ? state.urgencyReviewNeeded : defaults.urgencyReviewNeeded
    );

    var priorityCollapse = null;
    var lastPriorityDisplay = null;
    var lastPrioritySoundTierI = null;

    function seedPrioritySoundTier(display) {
      if (!display || display.inutile || display.tierI == null) {
        lastPrioritySoundTierI = null;
        return;
      }
      lastPrioritySoundTierI = display.tierI;
    }

    function maybePlayPriorityTierSound(display) {
      if (!display || display.inutile || display.tierI == null) return;
      var tierI = display.tierI;
      if (lastPrioritySoundTierI == null) {
        lastPrioritySoundTierI = tierI;
        return;
      }
      if (tierI === lastPrioritySoundTierI) return;
      var prev = lastPrioritySoundTierI;
      lastPrioritySoundTierI = tierI;
      // Lower tierI = higher priority (Critique=0).
      playPriorityUiSound('priority', {
        tierI: tierI,
        direction: tierI < prev ? 'up' : 'down',
      });
    }

    function buildPrioritySummary() {
      var d = lastPriorityDisplay;
      var label = d && d.label ? d.label : '';
      if (!label) return '';
      var wrap = document.createElement('span');
      wrap.className = 'priority-summary';
      var visualSource = d.inutile
        ? { inutile: true, label: INUTILE_LABEL }
        : { i: d.tierI, label: d.label };
      var v = tierVisuals(visualSource);
      var dot = document.createElement('span');
      dot.className = 'heat-tier-dot priority-summary-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.style.setProperty(
        '--heat-tier-dot-size',
        heatTierDotSizePx(d).toFixed(2) + 'px'
      );
      if (v.seg) dot.style.background = v.seg;
      wrap.classList.toggle('is-inutile', !!d.inutile);
      var text = document.createElement('span');
      text.className = 'priority-summary-label';
      text.textContent = label;
      wrap.appendChild(dot);
      wrap.appendChild(text);
      return wrap;
    }

    var suppressPersist = false;

    function persistSliderState(skipFieldSync) {
      if (suppressPersist) return;
      if (!skipFieldSync) syncStateFromFields();
      if (typeof variantConfig.onStateChange === 'function') {
        // Copy so callers (popup save / Information recap) are not affected when
        // animation frames or getState() later sync from in-flight slider DOM.
        variantConfig.onStateChange(Object.assign({}, state));
      } else {
        saveSliderValues(state);
      }
    }

    function syncStateFromFields() {
      Object.keys(fields).forEach(function (key) {
        state[key] = fields[key].getValue();
      });
      if (priorityCollapse) {
        state.priorityEnabled = true;
      }
      if (enAttenteField) {
        state.enAttente = enAttenteField.getValue();
        state.blockedReasons = enAttenteField.getBlockedReasons
          ? enAttenteField.getBlockedReasons()
          : normalizeBlockedReasons(enAttenteField.getBlockedReason());
        delete state.blockedReason;
        state.blockedLinks = enAttenteField.getBlockedLinks
          ? enAttenteField.getBlockedLinks()
          : normalizeBlockedLinks(
              enAttenteField.getBlockedLink ? enAttenteField.getBlockedLink() : null
            );
        delete state.blockedLink;
      }
      if (dueDateField) {
        var dueValues = dueDateField.getValues();
        state.dueDate = dueValues.dueDate;
        state.dueTime = dueValues.dueTime;
        state.dueEnabled = !!dueValues.dueEnabled;
        state.dueMode = dueValues.dueMode || DUE_DATE_MODE_PRECISE;
        state.dueVague = dueValues.dueVague || '';
        state.startDate = dueValues.startDate || '';
        state.recurrence = dueValues.recurrence || null;
        state.dueLimitState = dueValues.dueLimitState || DUE_LIMIT_STATE_NONE;
        state.dateFixe = !!dueValues.dateFixe;
      }
      if (impactFactorsWidget) state.impactFactors = impactFactorsWidget.getValues();
      if (easeCostsWidget) state.easeCosts = easeCostsWidget.getValues();
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
        from[key] = fields[key] ? fields[key].getValue() : (state[key] != null ? state[key] : targets[key]);
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
        persistSliderState();
        return;
      }

      // Persist target values before the visual animation so a fast modal close
      // cannot skip the Trello save while sliders are still animating.
      keys.forEach(function (key) {
        state[key] = targets[key];
      });
      persistSliderState(true);

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
      try {
        syncStateFromFields();
        var result = calcFn(state);
        var display = resolveDisplay(result, state);
        lastPriorityDisplay = display;
        if (priorityCollapse) priorityCollapse.refreshSummary();
        var cardTier = display.cardTier;
        // Blocked/overdue red is section-scoped (Bloqué / Échéance), not a full-card wash.
        // Never force --card-tier-tint to blocked crimson on .variant-card.
        card.classList.remove('is-blocked', 'is-overdue');
        if (state.priorityEnabled === false && !display.blocked && !display.duePast) {
          card.classList.remove('is-inutile');
          card.dataset.tier = '';
          clearCardTierTint(card);
        } else {
          applyCardTierTint(card, cardTier);
          card.classList.toggle('is-inutile', !!display.inutile);
          card.dataset.tier = display.label || '';
        }
        if (blockedSection) {
          blockedSection.classList.toggle('is-blocked', !!display.blocked);
        }
        if (dueSection) {
          var dueBand =
            state.dueEnabled !== false && normalizeDueDate(state.dueDate)
              ? dueProximityBand(state.dueDate, state.dueTime)
              : '';
          applyDueProximityBand(dueSection, dueBand);
        }
        applyPrioritySectionTint(
          priorityField,
          display,
          state.priorityEnabled !== false
        );
        if (heat) heat.paint(result, display);
        if (calcGraph) calcGraph.paint(result, state, display);
      } catch (err) {
        console.error('PriorityUI.mountVariant repaint failed', { id: variantId, error: err });
      }
    }

    if (variantConfig.showFormulaSwitcher === true) {
      formulaSwitcher = createFormulaSwitcher({
        el: card,
        formulaKey: formulaKey,
        onChange: persistFormulaChange
      });
    }

    // Card title lives in the Information panel (createInfoField) when mounted by the popup.
    if (variantConfig.showCardHeader === true && !variantConfig.hideCardHeader) {
      var cardHeader = document.createElement('header');
      cardHeader.className = 'tp-priority-card-header';
      var cardNameLabel = document.createElement('p');
      cardNameLabel.className = 'tp-priority-card-name is-loading';
      cardNameLabel.id = 'cardName';
      cardNameLabel.setAttribute('aria-live', 'polite');
      cardNameLabel.textContent = 'Chargement\u2026';
      cardHeader.appendChild(cardNameLabel);
      card.appendChild(cardHeader);
    }

    var prioritySection = document.createElement('div');
    prioritySection.className = 'variant-priority-section';

    priorityField = document.createElement('div');
    priorityField.className = 'field field--priority';

    var priorityBodyId = 'priority-section-body-' + Math.random().toString(36).slice(2, 9);
    var priorityChrome = createCollapsibleEnableChrome({
      title: 'Priorit\u00e9',
      bodyId: priorityBodyId,
      hideEnable: true,
      leadingIcon: 'ti-flame',
      iconClass: 'priority-leading-icon',
      titleClass: 'priority-enable-title',
      collapseLabel: 'Replier Priorit\u00e9',
      expandLabel: 'D\u00e9velopper Priorit\u00e9'
    });
    priorityField.appendChild(priorityChrome.head);

    var priorityBody = document.createElement('div');
    priorityBody.className = 'priority-section-body section-toggle-body';
    priorityBody.id = priorityBodyId;

    heat = createHeatPanel({
      el: priorityBody,
      formulaKey: formulaKey,
      hideSegments: formulaKey === 'eisenhower',
      onSegmentClick: function (targetP) {
        if (state.priorityEnabled === false) return;
        syncStateFromFields();
        var delta = heatSegmentDelta(state, targetP, overrideFn);
        if (!Object.keys(delta).length) return;
        var preview = resolveDisplay(calcFn(Object.assign({}, state, delta)), state);
        maybePlayPriorityTierSound(preview);
        animateFieldsTo(delta);
      }
    });

    var fieldsSection = document.createElement('div');
    fieldsSection.className = 'variant-fields-section';

    var fieldsWrap = document.createElement('div');
    fieldsWrap.className = 'variant-fields';

    fieldsSection.appendChild(fieldsWrap);
    priorityBody.appendChild(fieldsSection);
    priorityField.appendChild(priorityBody);
    prioritySection.appendChild(priorityField);
    card.appendChild(prioritySection);

    priorityCollapse = bindCollapsibleEnable({
      field: priorityField,
      body: priorityBody,
      chrome: priorityChrome,
      alwaysEnabled: true,
      enabled: true,
      expanded: sectionExpanded('priority', true),
      getSummary: function () {
        return buildPrioritySummary();
      },
      onLayoutChange: function () {
        if (typeof variantConfig.onLayoutChange === 'function') {
          variantConfig.onLayoutChange();
        }
      },
      onExpandChange: persistSectionExpanded('priority'),
      onEnableChange: function () {
        state.priorityEnabled = true;
        cancelSliderAnim();
        persistSliderState(true);
        repaint();
        if (typeof variantConfig.onLayoutChange === 'function') {
          variantConfig.onLayoutChange();
        }
      },
      getContextMenuItems: function (api) {
        if (
          !global.ContextMenu ||
          typeof global.ContextMenu.buildPriorityItems !== 'function'
        ) {
          return [];
        }
        return ContextMenu.buildPriorityItems({
          isExpanded: api.isExpanded,
          setExpanded: api.setExpanded,
          graphExpanded: !!(calcGraph && calcGraph.isExpanded && calcGraph.isExpanded()),
          toggleGraph: function (wantOpen) {
            if (calcGraph && typeof calcGraph.setCollapsed === 'function') {
              calcGraph.setCollapsed(!wantOpen);
            }
          },
        });
      },
    });

    var wizardHooks = {
      getValue: function (key) {
        return fields[key] ? fields[key].getValue() : state[key];
      },
      setValue: function (key, level) {
        if (fields[key]) fields[key].setValue(level);
        state[key] = level;
        cancelSliderAnim();
        repaint();
        maybePlayPriorityTierSound(lastPriorityDisplay);
        persistSliderState();
      }
    };

    variantConfig.dimensions.forEach(function (dim, dimIndex) {
      fields[dim.key] = createField({
        el: fieldsWrap,
        id: variantConfig.id + '-' + dim.key,
        label: dim.label,
        icon: dim.icon,
        wordsKey: dim.wordsKey || dim.key,
        min: dim.min,
        max: dim.max,
        value: state[dim.key],
        onChange: function () {
          cancelSliderAnim();
          repaint();
          maybePlayPriorityTierSound(lastPriorityDisplay);
          persistSliderState();
        },
        wizard: {
          dimensions: variantConfig.dimensions,
          step: dimIndex,
          getValue: wizardHooks.getValue,
          setValue: wizardHooks.setValue
        }
      });
    });

    var impactFactorsWidget = null;
    if (fields.impact && fields.impact.el && fields.impact.el.parentNode) {
      impactFactorsWidget = createAxisFactorsWidget({
        title: 'Nous permet de\u2026',
        defs: IMPACT_FACTOR_DEFS,
        getInitial: function () { return state.impactFactors; },
        onChange: function (values) {
          state.impactFactors = values;
          var computed = computeImpactFromFactors(values);
          if (computed != null) fields.impact.setValue(computed);
          cancelSliderAnim();
          repaint();
          maybePlayPriorityTierSound(lastPriorityDisplay);
          persistSliderState();
        }
      });
      fields.impact.el.parentNode.insertBefore(
        impactFactorsWidget.el,
        fields.impact.el.nextSibling
      );
    }

    var easeCostsWidget = null;
    if (fields.ease && fields.ease.el && fields.ease.el.parentNode) {
      easeCostsWidget = createAxisFactorsWidget({
        title: 'Ce que \u00e7a co\u00fbte\u2026',
        defs: EASE_COST_DEFS,
        getInitial: function () { return state.easeCosts; },
        onChange: function (values) {
          state.easeCosts = values;
          var computed = computeEaseFromCosts(values);
          if (computed != null) fields.ease.setValue(computed);
          cancelSliderAnim();
          repaint();
          maybePlayPriorityTierSound(lastPriorityDisplay);
          persistSliderState();
        }
      });
      fields.ease.el.parentNode.insertBefore(
        easeCostsWidget.el,
        fields.ease.el.nextSibling
      );
    }

    var urgencyNudge = document.createElement('div');
    urgencyNudge.className = 'urgency-review-nudge';
    var urgencyNudgeText = document.createElement('span');
    urgencyNudgeText.className = 'urgency-review-nudge-text';
    urgencyNudgeText.textContent = URGENCY_REVIEW_PROMPT;
    var urgencyNudgeDismiss = document.createElement('button');
    urgencyNudgeDismiss.type = 'button';
    urgencyNudgeDismiss.className = 'urgency-review-nudge-dismiss';
    urgencyNudgeDismiss.setAttribute('aria-label', 'Masquer ce rappel');
    urgencyNudgeDismiss.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
    urgencyNudge.appendChild(urgencyNudgeText);
    urgencyNudge.appendChild(urgencyNudgeDismiss);
    fieldsWrap.insertBefore(urgencyNudge, fieldsWrap.firstChild);

    function paintUrgencyNudge() {
      urgencyNudge.hidden = !state.urgencyReviewNeeded;
    }
    urgencyNudgeDismiss.addEventListener('click', function () {
      state.urgencyReviewNeeded = false;
      paintUrgencyNudge();
      persistSliderState();
    });
    paintUrgencyNudge();

    try {
      calcGraph = createCalcGraphPanel({
        el: fieldsSection,
        fields: fields,
        expanded: sectionExpanded('graph', true),
        onExpandChange: persistSectionExpanded('graph'),
        onChange: function () {
          cancelSliderAnim();
          repaint();
          maybePlayPriorityTierSound(lastPriorityDisplay);
          persistSliderState();
        },
        onToggle: function () {
          if (typeof variantConfig.onLayoutChange === 'function') {
            variantConfig.onLayoutChange();
          }
        }
      });
    } catch (err) {
      console.error('PriorityUI.createCalcGraphPanel failed', { id: variantId, error: err });
    }

    dueSection = document.createElement('div');
    dueSection.className = 'variant-due-section';
    card.appendChild(dueSection);

    var dueEnabledInitial =
      state.dueEnabled !== false &&
      (!!state.dueDate || !!normalizeDueVague(state.dueVague));
    dueDateField = createDueDateField({
      el: dueSection,
      value: {
        dueDate: state.dueDate,
        dueTime: state.dueTime,
        dueEnabled: dueEnabledInitial,
        dueMode: state.dueMode || DUE_DATE_MODE_PRECISE,
        dueVague: state.dueVague || '',
        startDate: state.startDate,
        recurrence: state.recurrence
      },
      expanded: sectionExpanded('due', dueEnabledInitial),
      onExpandChange: persistSectionExpanded('due'),
      onChange: function () {
        cancelSliderAnim();
        repaint();
        persistSliderState();
      },
      onLayoutChange: function () {
        if (typeof variantConfig.onLayoutChange === 'function') {
          variantConfig.onLayoutChange();
        }
      }
    });

    // Bloqué reasons live inside Progrès → Statut (mounted by the popup into statut's slot).
    blockedSection = document.createElement('div');
    blockedSection.className = 'variant-blocked-section';

    enAttenteField = createEnAttenteField({
      el: blockedSection,
      embedded: true,
      value: state.enAttente,
      blockedReasons: state.blockedReasons,
      blockedLinks: state.blockedLinks,
      getSubtasks: function () {
        return typeof variantConfig.getBlockedSubtasks === 'function'
          ? variantConfig.getBlockedSubtasks() || []
          : [];
      },
      onBlockedReasonAdded: function (reason) {
        if (typeof variantConfig.onBlockedReasonAdded === 'function') {
          variantConfig.onBlockedReasonAdded(reason);
        }
      },
      onChange: function () {
        cancelSliderAnim();
        repaint();
        persistSliderState();
        if (typeof variantConfig.onBlockedStateChange === 'function') {
          try {
            variantConfig.onBlockedStateChange(Object.assign({}, state));
          } catch (err) {
            console.error('onBlockedStateChange failed', err);
          }
        }
      },
      onLayoutChange: function () {
        if (typeof variantConfig.onLayoutChange === 'function') {
          variantConfig.onLayoutChange();
        }
      }
    });

    containerEl.appendChild(card);

    // Single-section modal: its header already names the section, so the field
    // can't be collapsed and doesn't repeat its title.
    if (focusSection) {
      var focusedField = card.querySelector(
        '.field--' + (focusSection === 'due' ? 'due-date' : focusSection)
      );
      if (focusedField) focusedField.classList.add('is-focus-locked');
    }

    var themeObserver = new MutationObserver(function () {
      repaint();
      if (calcGraph && calcGraph.updateTheme) calcGraph.updateTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-color-mode']
    });

    applyFormulaMode(formulaKey);
    repaint();
    seedPrioritySoundTier(lastPriorityDisplay);

    var progressCompleteLock = false;
    var savedDueEnabledBeforeLock = null;
    var savedBlockedEnabledBeforeLock = null;

    function setProgressCompleteLock(locked) {
      locked = !!locked;
      if (locked === progressCompleteLock) return;
      console.debug('[tp-blocked] setProgressCompleteLock', {
        locked: locked,
        wasLocked: progressCompleteLock,
        savedBlockedEnabledBeforeLock: savedBlockedEnabledBeforeLock,
        enAttenteNow: enAttenteField ? !!enAttenteField.getValue() : !!state.enAttente,
      });
      progressCompleteLock = locked;
      if (locked) {
        savedDueEnabledBeforeLock = dueDateField && dueDateField.isEnabled
          ? !!dueDateField.isEnabled()
          : !!state.dueEnabled;
        savedBlockedEnabledBeforeLock = enAttenteField
          ? !!enAttenteField.getValue()
          : !!state.enAttente;
        if (dueDateField) {
          if (dueDateField.setEnableAllowed) {
            dueDateField.setEnableAllowed(false, { expand: false });
          }
          if (dueDateField.setExpanded) dueDateField.setExpanded(false);
        }
        if (enAttenteField) {
          // Align with clearBlockedIfComplete / Done celebration: drop blocked when complete.
          if (enAttenteField.getValue()) enAttenteField.setValue(false);
          if (enAttenteField.setEnableAllowed) {
            enAttenteField.setEnableAllowed(false, { expand: false });
          }
          if (enAttenteField.setExpanded) enAttenteField.setExpanded(false);
        }
      } else {
        if (dueDateField && dueDateField.setEnableAllowed) {
          dueDateField.setEnableAllowed(true);
          if (savedDueEnabledBeforeLock && dueDateField.setEnabled) {
            dueDateField.setEnabled(true);
          }
        }
        if (enAttenteField && enAttenteField.setEnableAllowed) {
          enAttenteField.setEnableAllowed(true);
          if (savedBlockedEnabledBeforeLock) enAttenteField.setValue(true);
        }
        savedDueEnabledBeforeLock = null;
        savedBlockedEnabledBeforeLock = null;
      }
    }

    return {
      card: card,
      getState: function () {
        syncStateFromFields();
        return Object.assign({}, state);
      },
      getFormulaKey: function () {
        return formulaKey;
      },
      setFormulaKey: function (key) {
        applyFormulaMode(key);
        if (formulaSwitcher) formulaSwitcher.setFormulaKey(key);
        saveStoredFormulaKey(key);
        repaint();
      },
      setState: function (next, options) {
        options = options || {};
        var preserveCollapse = options.preserveCollapse === true;
        // silent: apply UI state without notifying onStateChange (live remote sync).
        var silent = options.silent === true;
        if (silent) suppressPersist = true;
        try {
          Object.keys(next).forEach(function (key) {
            state[key] = next[key];
            if (fields[key]) fields[key].setValue(next[key]);
          });
          if (next.priorityEnabled != null && priorityCollapse) {
            var priorityOpts = { notifyLayout: false };
            if (preserveCollapse) priorityOpts.preserveCollapse = true;
            else if (next.priorityEnabled) priorityOpts.expand = true;
            // Priorité cannot be disabled — ignore priorityEnabled:false.
            priorityCollapse.setEnabled(true, priorityOpts);
            state.priorityEnabled = true;
          }
          // Apply links/reasons BEFORE enAttente so setValue→onChange→syncStateFromFields
          // does not wipe freshly-written blockedLinks (item block → Statut sync).
          if (
            (next.blockedReasons != null || next.blockedReason != null) &&
            enAttenteField
          ) {
            if (enAttenteField.setBlockedReasons) {
              enAttenteField.setBlockedReasons(
                next.blockedReasons != null ? next.blockedReasons : next.blockedReason
              );
            } else {
              enAttenteField.setBlockedReason(
                next.blockedReason != null
                  ? next.blockedReason
                  : (next.blockedReasons && next.blockedReasons[0]) || ''
              );
            }
          }
          if (
            (next.blockedLinks !== undefined || next.blockedLink !== undefined) &&
            enAttenteField
          ) {
            if (enAttenteField.setBlockedLinks) {
              enAttenteField.setBlockedLinks(
                next.blockedLinks != null
                  ? next.blockedLinks
                  : next.blockedLink != null
                    ? [next.blockedLink]
                    : []
              );
            } else if (enAttenteField.setBlockedLink) {
              enAttenteField.setBlockedLink(
                next.blockedLinks && next.blockedLinks[0]
                  ? next.blockedLinks[0]
                  : next.blockedLink
              );
            }
          }
          if (next.enAttente != null && enAttenteField) {
            if (next.enAttente && enAttenteField.setEnableAllowed) {
              enAttenteField.setEnableAllowed(true);
            }
            if (preserveCollapse) {
              enAttenteField.setValue(next.enAttente, { preserveCollapse: true });
            } else {
              enAttenteField.setValue(next.enAttente);
              if (next.enAttente && enAttenteField.setExpanded) {
                enAttenteField.setExpanded(true);
              }
            }
          }
          if (
            (next.dueDate != null ||
              next.dueTime != null ||
              next.dueEnabled != null ||
              next.dueMode != null ||
              next.dueVague != null ||
              next.startDate !== undefined ||
              next.recurrence !== undefined ||
              next.dueLimitState != null ||
              next.dateFixe != null) &&
            dueDateField
          ) {
            var duePayload = {
              dueDate: next.dueDate != null ? next.dueDate : state.dueDate,
              dueTime: next.dueTime != null ? next.dueTime : state.dueTime,
              dueEnabled: next.dueEnabled != null ? next.dueEnabled : state.dueEnabled,
              dueMode: next.dueMode != null ? next.dueMode : state.dueMode,
              dueVague: next.dueVague != null ? next.dueVague : state.dueVague,
              startDate:
                next.startDate !== undefined ? next.startDate : state.startDate,
              recurrence:
                next.recurrence !== undefined ? next.recurrence : state.recurrence,
              dueLimitState:
                next.dueLimitState != null ? next.dueLimitState : state.dueLimitState,
              dateFixe: next.dateFixe != null ? next.dateFixe : state.dateFixe
            };
            if (preserveCollapse) {
              dueDateField.setValue(duePayload, { preserveCollapse: true });
            } else {
              dueDateField.setValue(duePayload);
            }
          }
          if (next.impactFactors !== undefined && impactFactorsWidget) {
            impactFactorsWidget.setValues(next.impactFactors);
          }
          if (next.easeCosts !== undefined && easeCostsWidget) {
            easeCostsWidget.setValues(next.easeCosts);
          }
          if (next.urgencyReviewNeeded != null) {
            paintUrgencyNudge();
          }
          if (next.estimatedDurationMinutes !== undefined) {
            state.estimatedDurationMinutes = clampDurationMinutes(
              next.estimatedDurationMinutes
            );
          }
          repaint();
          if (silent) {
            syncStateFromFields();
            seedPrioritySoundTier(lastPriorityDisplay);
          } else {
            persistSliderState();
            maybePlayPriorityTierSound(lastPriorityDisplay);
          }
        } finally {
          if (silent) suppressPersist = false;
        }
      },
      refreshBlockedSubtasks: function () {
        if (enAttenteField && enAttenteField.refreshSubtasks) {
          enAttenteField.refreshSubtasks();
        }
      },
      /**
       * Toggle a named section open/closed and return its root element (for scroll/focus).
       * Re-clicking from Information collapses when already expanded.
       * Keys: 'priority' | 'due' | 'blocked'
       * Bloqué is nested under Progrès (Statut) — openSection('blocked') returns the panel root
       * (popup expands Progrès and scrolls).
       */
      openSection: function (key, options) {
        options = options || {};
        var forceExpand = options.expand === true;
        var target = null;
        if (key === 'priority') {
          target = prioritySection;
          if (priorityCollapse && priorityCollapse.setExpanded) {
            var priorityOpen = priorityCollapse.isExpanded
              ? priorityCollapse.isExpanded()
              : false;
            if (forceExpand) {
              if (!priorityOpen) priorityCollapse.setExpanded(true);
            } else {
              priorityCollapse.setExpanded(!priorityOpen);
            }
          }
        } else if (key === 'due') {
          target = dueSection;
          if (dueDateField && dueDateField.setExpanded) {
            var dueOpen = dueDateField.isExpanded ? dueDateField.isExpanded() : false;
            if (forceExpand) {
              if (!dueOpen) dueDateField.setExpanded(true);
            } else {
              dueDateField.setExpanded(!dueOpen);
            }
          }
        } else if (key === 'blocked') {
          target = blockedSection;
        }
        return target;
      },
      getBlockedSection: function () {
        return blockedSection;
      },
      setProgressCompleteLock: setProgressCompleteLock,
      isProgressCompleteLock: function () {
        return progressCompleteLock;
      },
      repaint: repaint
    };
    } catch (err) {
      return mountVariantFailedStub(containerEl, variantConfig, err);
    }
  }

  // exports
  S.mountVariant = mountVariant;
})(typeof window !== 'undefined' ? window : this);
