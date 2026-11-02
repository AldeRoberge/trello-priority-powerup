/**
 * AI agent: public API
 *
 * Part of the agent (see agent.parts.json). Builds and exposes window.PriorityAgent.
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var ASSISTANT_SCOPES = S.ASSISTANT_SCOPES;
  var BUILD_CONTEXT_GETTERS = S.BUILD_CONTEXT_GETTERS;
  var CARD_INTERVIEW_KEY = S.CARD_INTERVIEW_KEY;
  var CHAT_WARMUP_USER_TURNS = S.CHAT_WARMUP_USER_TURNS;
  var MODEL_MODES = S.MODEL_MODES;
  var MODEL_TIERS = S.MODEL_TIERS;
  var OPENAI_MODELS = S.OPENAI_MODELS;
  var PARALLEL_LANE_MAX = S.PARALLEL_LANE_MAX;
  var PRESETS = S.PRESETS;
  var PROVIDER_STORAGE_KEY = S.PROVIDER_STORAGE_KEY;

  // from other parts (functions, resolved at call time)
  function actionFailure() { return S.actionFailure.apply(this, arguments); }
  function actionsReachFullProgress() { return S.actionsReachFullProgress.apply(this, arguments); }
  function addDaysIsoLocal() { return S.addDaysIsoLocal.apply(this, arguments); }
  function applyInterviewEchoGuards() { return S.applyInterviewEchoGuards.apply(this, arguments); }
  function applyInterviewProgressScoutGuards() { return S.applyInterviewProgressScoutGuards.apply(this, arguments); }
  function applyInterviewWhyGuards() { return S.applyInterviewWhyGuards.apply(this, arguments); }
  function applyKnownDueGuards() { return S.applyKnownDueGuards.apply(this, arguments); }
  function applyProgressCompleteGuards() { return S.applyProgressCompleteGuards.apply(this, arguments); }
  function buildChatDebugExport() { return S.buildChatDebugExport.apply(this, arguments); }
  function buildContext() { return S.buildContext.apply(this, arguments); }
  function buildEaseExplanation() { return S.buildEaseExplanation.apply(this, arguments); }
  function buildHeuristicProgressSummary() { return S.buildHeuristicProgressSummary.apply(this, arguments); }
  function buildHeuristicStatusBrief() { return S.buildHeuristicStatusBrief.apply(this, arguments); }
  function buildInterviewNextPivot() { return S.buildInterviewNextPivot.apply(this, arguments); }
  function buildPriorityExplanation() { return S.buildPriorityExplanation.apply(this, arguments); }
  function buildProgressSummarySnapshot() { return S.buildProgressSummarySnapshot.apply(this, arguments); }
  function buildStatusBriefSnapshot() { return S.buildStatusBriefSnapshot.apply(this, arguments); }
  function cardDreamTurn() { return S.cardDreamTurn.apply(this, arguments); }
  function cardInterviewTurn() { return S.cardInterviewTurn.apply(this, arguments); }
  function cardProgressSummaryTurn() { return S.cardProgressSummaryTurn.apply(this, arguments); }
  function cardSanityCheck() { return S.cardSanityCheck.apply(this, arguments); }
  function cardStatusBriefTurn() { return S.cardStatusBriefTurn.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function chatTurn() { return S.chatTurn.apply(this, arguments); }
  function classifyModelClass() { return S.classifyModelClass.apply(this, arguments); }
  function clearVerified() { return S.clearVerified.apply(this, arguments); }
  function contextHasActiveDue() { return S.contextHasActiveDue.apply(this, arguments); }
  function contextWindowForModel() { return S.contextWindowForModel.apply(this, arguments); }
  function countUserTurns() { return S.countUserTurns.apply(this, arguments); }
  function describeActionStep() { return S.describeActionStep.apply(this, arguments); }
  function detectAgentColorInText() { return S.detectAgentColorInText.apply(this, arguments); }
  function detectMessageLanguage() { return S.detectMessageLanguage.apply(this, arguments); }
  function detectPriorityTierInText() { return S.detectPriorityTierInText.apply(this, arguments); }
  function draftCustomAssigneeFromSpec() { return S.draftCustomAssigneeFromSpec.apply(this, arguments); }
  function dueFromOffsetMinutes() { return S.dueFromOffsetMinutes.apply(this, arguments); }
  function emptyCardChat() { return S.emptyCardChat.apply(this, arguments); }
  function emptyCardInterview() { return S.emptyCardInterview.apply(this, arguments); }
  function enrichResultVisual() { return S.enrichResultVisual.apply(this, arguments); }
  function enrichSubtaskPickTurn() { return S.enrichSubtaskPickTurn.apply(this, arguments); }
  function ensureContrastHighlights() { return S.ensureContrastHighlights.apply(this, arguments); }
  function ensureProgressCelebration() { return S.ensureProgressCelebration.apply(this, arguments); }
  function ensureQuebecLibreEffect() { return S.ensureQuebecLibreEffect.apply(this, arguments); }
  function ensureUnblockedIntent() { return S.ensureUnblockedIntent.apply(this, arguments); }
  function estimateCostUsd() { return S.estimateCostUsd.apply(this, arguments); }
  function estimateSubtaskDurations() { return S.estimateSubtaskDurations.apply(this, arguments); }
  function executeAction() { return S.executeAction.apply(this, arguments); }
  function executeActions() { return S.executeActions.apply(this, arguments); }
  function extractHighlightSpans() { return S.extractHighlightSpans.apply(this, arguments); }
  function extractStreamingMessage() { return S.extractStreamingMessage.apply(this, arguments); }
  function extractUsageFromRaw() { return S.extractUsageFromRaw.apply(this, arguments); }
  function fallbackBlockedReasonPair() { return S.fallbackBlockedReasonPair.apply(this, arguments); }
  function fallbackBlockedReasonText() { return S.fallbackBlockedReasonText.apply(this, arguments); }
  function fallbackUnblockSubtaskText() { return S.fallbackUnblockSubtaskText.apply(this, arguments); }
  function filterImprovementsAgainstRecentChanges() { return S.filterImprovementsAgainstRecentChanges.apply(this, arguments); }
  function filterNoOpImprovementSuggestions() { return S.filterNoOpImprovementSuggestions.apply(this, arguments); }
  function findExistingSubtaskByText() { return S.findExistingSubtaskByText.apply(this, arguments); }
  function fingerprintProgressSummarySnapshot() { return S.fingerprintProgressSummarySnapshot.apply(this, arguments); }
  function fingerprintStatusBriefSnapshot() { return S.fingerprintStatusBriefSnapshot.apply(this, arguments); }
  function formatActionErrors() { return S.formatActionErrors.apply(this, arguments); }
  function formatChangeRecap() { return S.formatChangeRecap.apply(this, arguments); }
  function getProvider() { return S.getProvider.apply(this, arguments); }
  function heuristicSubtaskEstimates() { return S.heuristicSubtaskEstimates.apply(this, arguments); }
  function humanProfileJobLines() { return S.humanProfileJobLines.apply(this, arguments); }
  function interviewMotivationWhyAlreadyAsked() { return S.interviewMotivationWhyAlreadyAsked.apply(this, arguments); }
  function interviewProgressScoutKind() { return S.interviewProgressScoutKind.apply(this, arguments); }
  function isConfigured() { return S.isConfigured.apply(this, arguments); }
  function isNoOpImprovementAction() { return S.isNoOpImprovementAction.apply(this, arguments); }
  function isProjectScope() { return S.isProjectScope.apply(this, arguments); }
  function isPureWaitingOnTaskReason() { return S.isPureWaitingOnTaskReason.apply(this, arguments); }
  function isUniversalMotiveText() { return S.isUniversalMotiveText.apply(this, arguments); }
  function isVacuousStatusBrief() { return S.isVacuousStatusBrief.apply(this, arguments); }
  function isVerboseStructuredDesc() { return S.isVerboseStructuredDesc.apply(this, arguments); }
  function isVerified() { return S.isVerified.apply(this, arguments); }
  function liftPatchTools() { return S.liftPatchTools.apply(this, arguments); }
  function linkSuggestionColorsToHighlights() { return S.linkSuggestionColorsToHighlights.apply(this, arguments); }
  function listCardImprovementGaps() { return S.listCardImprovementGaps.apply(this, arguments); }
  function listProgressSubtaskLabels() { return S.listProgressSubtaskLabels.apply(this, arguments); }
  function listRecentCardChanges() { return S.listRecentCardChanges.apply(this, arguments); }
  function loadBoardChat() { return S.loadBoardChat.apply(this, arguments); }
  function loadCardChat() { return S.loadCardChat.apply(this, arguments); }
  function loadCardInterview() { return S.loadCardInterview.apply(this, arguments); }
  function localClock() { return S.localClock.apply(this, arguments); }
  function looksLikeAgentColorChangeClaim() { return S.looksLikeAgentColorChangeClaim.apply(this, arguments); }
  function looksLikeAgentColorChangeRequest() { return S.looksLikeAgentColorChangeRequest.apply(this, arguments); }
  function looksLikeAppliedClaim() { return S.looksLikeAppliedClaim.apply(this, arguments); }
  function looksLikeDueAskMessage() { return S.looksLikeDueAskMessage.apply(this, arguments); }
  function looksLikeMotivationWhyAsk() { return S.looksLikeMotivationWhyAsk.apply(this, arguments); }
  function looksLikeQuebecLibrePhrase() { return S.looksLikeQuebecLibrePhrase.apply(this, arguments); }
  function looksLikeSubtaskPickQuestion() { return S.looksLikeSubtaskPickQuestion.apply(this, arguments); }
  function looksLikeTitleEchoConfirmAsk() { return S.looksLikeTitleEchoConfirmAsk.apply(this, arguments); }
  function looksLikeUnblockedPhrase() { return S.looksLikeUnblockedPhrase.apply(this, arguments); }
  function markInterviewComplete() { return S.markInterviewComplete.apply(this, arguments); }
  function markInterviewQuestionAsked() { return S.markInterviewQuestionAsked.apply(this, arguments); }
  function markVerified() { return S.markVerified.apply(this, arguments); }
  function matchBoardLabel() { return S.matchBoardLabel.apply(this, arguments); }
  function matchBoardMember() { return S.matchBoardMember.apply(this, arguments); }
  function matchCustomAssignee() { return S.matchCustomAssignee.apply(this, arguments); }
  function memoryTurn() { return S.memoryTurn.apply(this, arguments); }
  function modelForTier() { return S.modelForTier.apply(this, arguments); }
  function normalizeActionsWithMeta() { return S.normalizeActionsWithMeta.apply(this, arguments); }
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }
  function normalizeAssistantScope() { return S.normalizeAssistantScope.apply(this, arguments); }
  function normalizeBlocks() { return S.normalizeBlocks.apply(this, arguments); }
  function normalizeCardChat() { return S.normalizeCardChat.apply(this, arguments); }
  function normalizeCardInterview() { return S.normalizeCardInterview.apply(this, arguments); }
  function normalizeCardPatches() { return S.normalizeCardPatches.apply(this, arguments); }
  function normalizeModelMode() { return S.normalizeModelMode.apply(this, arguments); }
  function normalizeModelTier() { return S.normalizeModelTier.apply(this, arguments); }
  function normalizePointField() { return S.normalizePointField.apply(this, arguments); }
  function normalizePointLevel() { return S.normalizePointLevel.apply(this, arguments); }
  function normalizePointSection() { return S.normalizePointSection.apply(this, arguments); }
  function normalizePrompts() { return S.normalizePrompts.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function normalizeSplitBlockedReasonResult() { return S.normalizeSplitBlockedReasonResult.apply(this, arguments); }
  function normalizeSplitTaskResult() { return S.normalizeSplitTaskResult.apply(this, arguments); }
  function normalizeSubtaskTitleKey() { return S.normalizeSubtaskTitleKey.apply(this, arguments); }
  function normalizeSuggestionEntries() { return S.normalizeSuggestionEntries.apply(this, arguments); }
  function nowTimeLocal() { return S.nowTimeLocal.apply(this, arguments); }
  function parseAssistantPayload() { return S.parseAssistantPayload.apply(this, arguments); }
  function parseDurationMinutes() { return S.parseDurationMinutes.apply(this, arguments); }
  function parseMetric() { return S.parseMetric.apply(this, arguments); }
  function parseRelativeDueOffset() { return S.parseRelativeDueOffset.apply(this, arguments); }
  function polishMessageAfterProgressComplete() { return S.polishMessageAfterProgressComplete.apply(this, arguments); }
  function profileLanguageInstruction() { return S.profileLanguageInstruction.apply(this, arguments); }
  function providerFingerprint() { return S.providerFingerprint.apply(this, arguments); }
  function providersEqual() { return S.providersEqual.apply(this, arguments); }
  function resolveChatModel() { return S.resolveChatModel.apply(this, arguments); }
  function resolveDueVagueArg() { return S.resolveDueVagueArg.apply(this, arguments); }
  function resolveMemberRoleId() { return S.resolveMemberRoleId.apply(this, arguments); }
  function resolvePeopleInReason() { return S.resolvePeopleInReason.apply(this, arguments); }
  function rewriteActionsForAgentColor() { return S.rewriteActionsForAgentColor.apply(this, arguments); }
  function rewriteActionsForPriorityTier() { return S.rewriteActionsForPriorityTier.apply(this, arguments); }
  function rewriteActionsForRelativeDue() { return S.rewriteActionsForRelativeDue.apply(this, arguments); }
  function rewriteWinkEmoticons() { return S.rewriteWinkEmoticons.apply(this, arguments); }
  function routeMessage() { return S.routeMessage.apply(this, arguments); }
  function runProviderTests() { return S.runProviderTests.apply(this, arguments); }
  function saveBoardChat() { return S.saveBoardChat.apply(this, arguments); }
  function saveCardChat() { return S.saveCardChat.apply(this, arguments); }
  function saveCardInterview() { return S.saveCardInterview.apply(this, arguments); }
  function saveProvider() { return S.saveProvider.apply(this, arguments); }
  function splitBlockedReason() { return S.splitBlockedReason.apply(this, arguments); }
  function splitTaskTitle() { return S.splitTaskTitle.apply(this, arguments); }
  function suggestBlockedReasonPair() { return S.suggestBlockedReasonPair.apply(this, arguments); }
  function suggestBlockedReasonText() { return S.suggestBlockedReasonText.apply(this, arguments); }
  function suggestCardImprovements() { return S.suggestCardImprovements.apply(this, arguments); }
  function suggestGoals() { return S.suggestGoals.apply(this, arguments); }
  function suggestLabels() { return S.suggestLabels.apply(this, arguments); }
  function suggestMetrics() { return S.suggestMetrics.apply(this, arguments); }
  function suggestQuestions() { return S.suggestQuestions.apply(this, arguments); }
  function suggestSubtasks() { return S.suggestSubtasks.apply(this, arguments); }
  function suggestTaskTypes() { return S.suggestTaskTypes.apply(this, arguments); }
  function suggestUnblockSubtaskText() { return S.suggestUnblockSubtaskText.apply(this, arguments); }
  function summarizeInterviewAlreadyKnown() { return S.summarizeInterviewAlreadyKnown.apply(this, arguments); }
  function summarizeInterviewProgressScout() { return S.summarizeInterviewProgressScout.apply(this, arguments); }
  function systemPrompt() { return S.systemPrompt.apply(this, arguments); }
  function titleMayBeCompound() { return S.titleMayBeCompound.apply(this, arguments); }
  function urgencyAskForTaskTypes() { return S.urgencyAskForTaskTypes.apply(this, arguments); }

  global.PriorityAgent = {
    PROVIDER_STORAGE_KEY: PROVIDER_STORAGE_KEY,
    CARD_INTERVIEW_KEY: CARD_INTERVIEW_KEY,
    PRESETS: PRESETS,
    OPENAI_MODELS: OPENAI_MODELS,
    MODEL_TIERS: MODEL_TIERS,
    MODEL_MODES: MODEL_MODES,
    CHAT_WARMUP_USER_TURNS: CHAT_WARMUP_USER_TURNS,
    normalizeProvider: normalizeProvider,
    detectMessageLanguage: detectMessageLanguage,
    systemPrompt: systemPrompt,
    buildChatDebugExport: buildChatDebugExport,
    humanProfileJobLines: humanProfileJobLines,
    profileLanguageInstruction: profileLanguageInstruction,
    normalizeModelTier: normalizeModelTier,
    normalizeModelMode: normalizeModelMode,
    classifyModelClass: classifyModelClass,
    modelForTier: modelForTier,
    resolveChatModel: resolveChatModel,
    countUserTurns: countUserTurns,
    parseAssistantPayload: parseAssistantPayload,
    providerFingerprint: providerFingerprint,
    providersEqual: providersEqual,
    isConfigured: isConfigured,
    isVerified: isVerified,
    markVerified: markVerified,
    clearVerified: clearVerified,
    getProvider: getProvider,
    saveProvider: saveProvider,
    buildContext: buildContext,
    BUILD_CONTEXT_GETTERS: BUILD_CONTEXT_GETTERS,
    buildPriorityExplanation: buildPriorityExplanation,
    buildEaseExplanation: buildEaseExplanation,
    dueFromOffsetMinutes: dueFromOffsetMinutes,
    nowTimeLocal: nowTimeLocal,
    localClock: localClock,
    parseRelativeDueOffset: parseRelativeDueOffset,
    resolveDueVagueArg: resolveDueVagueArg,
    matchBoardMember: matchBoardMember,
    matchBoardLabel: matchBoardLabel,
    matchCustomAssignee: matchCustomAssignee,
    draftCustomAssigneeFromSpec: draftCustomAssigneeFromSpec,
    resolveMemberRoleId: resolveMemberRoleId,
    rewriteActionsForRelativeDue: rewriteActionsForRelativeDue,
    detectPriorityTierInText: detectPriorityTierInText,
    rewriteActionsForPriorityTier: rewriteActionsForPriorityTier,
    detectAgentColorInText: detectAgentColorInText,
    looksLikeAgentColorChangeRequest: looksLikeAgentColorChangeRequest,
    looksLikeAgentColorChangeClaim: looksLikeAgentColorChangeClaim,
    rewriteActionsForAgentColor: rewriteActionsForAgentColor,
    normalizePrompts: normalizePrompts,
    normalizeBlocks: normalizeBlocks,
    enrichResultVisual: enrichResultVisual,
    normalizeCardPatches: normalizeCardPatches,
    liftPatchTools: liftPatchTools,
    chatTurn: chatTurn,
    looksLikeSubtaskPickQuestion: looksLikeSubtaskPickQuestion,
    enrichSubtaskPickTurn: enrichSubtaskPickTurn,
    listProgressSubtaskLabels: listProgressSubtaskLabels,
    actionsReachFullProgress: actionsReachFullProgress,
    looksLikeDueAskMessage: looksLikeDueAskMessage,
    contextHasActiveDue: contextHasActiveDue,
    summarizeInterviewAlreadyKnown: summarizeInterviewAlreadyKnown,
    urgencyAskForTaskTypes: urgencyAskForTaskTypes,
    normalizeAgentTaskTypes: normalizeAgentTaskTypes,
    buildInterviewNextPivot: buildInterviewNextPivot,
    applyKnownDueGuards: applyKnownDueGuards,
    looksLikeMotivationWhyAsk: looksLikeMotivationWhyAsk,
    isUniversalMotiveText: isUniversalMotiveText,
    interviewMotivationWhyAlreadyAsked: interviewMotivationWhyAlreadyAsked,
    applyInterviewWhyGuards: applyInterviewWhyGuards,
    looksLikeTitleEchoConfirmAsk: looksLikeTitleEchoConfirmAsk,
    applyInterviewEchoGuards: applyInterviewEchoGuards,
    polishMessageAfterProgressComplete: polishMessageAfterProgressComplete,
    ensureProgressCelebration: ensureProgressCelebration,
    looksLikeQuebecLibrePhrase: looksLikeQuebecLibrePhrase,
    ensureQuebecLibreEffect: ensureQuebecLibreEffect,
    describeActionStep: describeActionStep,
    looksLikeUnblockedPhrase: looksLikeUnblockedPhrase,
    ensureUnblockedIntent: ensureUnblockedIntent,
    applyProgressCompleteGuards: applyProgressCompleteGuards,
    rewriteWinkEmoticons: rewriteWinkEmoticons,
    ensureContrastHighlights: ensureContrastHighlights,
    linkSuggestionColorsToHighlights: linkSuggestionColorsToHighlights,
    normalizeSuggestionEntries: normalizeSuggestionEntries,
    extractHighlightSpans: extractHighlightSpans,
    memoryTurn: memoryTurn,
    cardInterviewTurn: cardInterviewTurn,
    loadCardInterview: loadCardInterview,
    saveCardInterview: saveCardInterview,
    normalizeCardInterview: normalizeCardInterview,
    emptyCardInterview: emptyCardInterview,
    markInterviewQuestionAsked: markInterviewQuestionAsked,
    markInterviewComplete: markInterviewComplete,
    interviewProgressScoutKind: interviewProgressScoutKind,
    summarizeInterviewProgressScout: summarizeInterviewProgressScout,
    applyInterviewProgressScoutGuards: applyInterviewProgressScoutGuards,
    loadCardChat: loadCardChat,
    saveCardChat: saveCardChat,
    loadBoardChat: loadBoardChat,
    saveBoardChat: saveBoardChat,
    ASSISTANT_SCOPES: ASSISTANT_SCOPES,
    normalizeAssistantScope: normalizeAssistantScope,
    isProjectScope: isProjectScope,
    normalizeCardChat: normalizeCardChat,
    emptyCardChat: emptyCardChat,
    suggestQuestions: suggestQuestions,
    suggestCardImprovements: suggestCardImprovements,
    filterNoOpImprovementSuggestions: filterNoOpImprovementSuggestions,
    filterImprovementsAgainstRecentChanges: filterImprovementsAgainstRecentChanges,
    listCardImprovementGaps: listCardImprovementGaps,
    listRecentCardChanges: listRecentCardChanges,
    isNoOpImprovementAction: isNoOpImprovementAction,
    addDaysIsoLocal: addDaysIsoLocal,
    cardSanityCheck: cardSanityCheck,
    cardDreamTurn: cardDreamTurn,
    buildStatusBriefSnapshot: buildStatusBriefSnapshot,
    fingerprintStatusBriefSnapshot: fingerprintStatusBriefSnapshot,
    buildHeuristicStatusBrief: buildHeuristicStatusBrief,
    isVacuousStatusBrief: isVacuousStatusBrief,
    cardStatusBriefTurn: cardStatusBriefTurn,
    buildProgressSummarySnapshot: buildProgressSummarySnapshot,
    fingerprintProgressSummarySnapshot: fingerprintProgressSummarySnapshot,
    buildHeuristicProgressSummary: buildHeuristicProgressSummary,
    cardProgressSummaryTurn: cardProgressSummaryTurn,
    isVerboseStructuredDesc: isVerboseStructuredDesc,
    suggestSubtasks: suggestSubtasks,
    titleMayBeCompound: titleMayBeCompound,
    normalizeSplitTaskResult: normalizeSplitTaskResult,
    splitTaskTitle: splitTaskTitle,
    normalizeSplitBlockedReasonResult: normalizeSplitBlockedReasonResult,
    splitBlockedReason: splitBlockedReason,
    estimateSubtaskDurations: estimateSubtaskDurations,
    fallbackBlockedReasonText: fallbackBlockedReasonText,
    suggestBlockedReasonText: suggestBlockedReasonText,
    isPureWaitingOnTaskReason: isPureWaitingOnTaskReason,
    fallbackBlockedReasonPair: fallbackBlockedReasonPair,
    suggestBlockedReasonPair: suggestBlockedReasonPair,
    fallbackUnblockSubtaskText: fallbackUnblockSubtaskText,
    suggestUnblockSubtaskText: suggestUnblockSubtaskText,
    heuristicSubtaskEstimates: heuristicSubtaskEstimates,
    parseDurationMinutes: parseDurationMinutes,
    suggestGoals: suggestGoals,
    suggestLabels: suggestLabels,
    suggestTaskTypes: suggestTaskTypes,
    suggestMetrics: suggestMetrics,
    parseMetric: parseMetric,
    executeAction: executeAction,
    executeActions: executeActions,
    resolvePeopleInReason: resolvePeopleInReason,
    normalizeSubtaskTitleKey: normalizeSubtaskTitleKey,
    findExistingSubtaskByText: findExistingSubtaskByText,
    formatChangeRecap: formatChangeRecap,
    formatActionErrors: formatActionErrors,
    actionFailure: actionFailure,
    normalizeActionsWithMeta: normalizeActionsWithMeta,
    looksLikeAppliedClaim: looksLikeAppliedClaim,
    routeMessage: routeMessage,
    PARALLEL_LANE_MAX: PARALLEL_LANE_MAX,
    normalizePointSection: normalizePointSection,
    normalizePointField: normalizePointField,
    normalizePointLevel: normalizePointLevel,
    runProviderTests: runProviderTests,
    chatCompletions: chatCompletions,
    extractStreamingMessage: extractStreamingMessage,
    estimateCostUsd: estimateCostUsd,
    extractUsageFromRaw: extractUsageFromRaw,
    contextWindowForModel: contextWindowForModel
  };

  // exports

})(typeof window !== 'undefined' ? window : this);
