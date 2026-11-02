/**
 * AI agent: chat turn
 *
 * Part of the agent (see agent.parts.json). chatTurn, the main conversational loop (task or project scope).
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
 */

/**
 * agent-chat-turn: part 1 of 3 (14. chatTurn — primary conversational entry (task or project scope)).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-chat-turn.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var ASSISTANT_SCOPES = S.ASSISTANT_SCOPES;
  var PROJECT_SCOPE_TOOLS = S.PROJECT_SCOPE_TOOLS;

  // from other parts (functions, resolved at call time)
  function applyProgressCompleteGuards() { return S.applyProgressCompleteGuards.apply(this, arguments); }
  function buildContext() { return S.buildContext.apply(this, arguments); }
  function buildRequestMeta() { return S.buildRequestMeta.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function clampInt() { return S.clampInt.apply(this, arguments); }
  function cloneJsonSafe() { return S.cloneJsonSafe.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgFetchMeta() { return S.dbgFetchMeta.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function dueFromOffsetMinutes() { return S.dueFromOffsetMinutes.apply(this, arguments); }
  function enrichSubtaskPickTurn() { return S.enrichSubtaskPickTurn.apply(this, arguments); }
  function ensureFollowUpActionVerb() { return S.ensureFollowUpActionVerb.apply(this, arguments); }
  function ensurePersonalImpactSuggestion() { return S.ensurePersonalImpactSuggestion.apply(this, arguments); }
  function ensurePriorityAxesPrompt() { return S.ensurePriorityAxesPrompt.apply(this, arguments); }
  function ensureQuebecLibreEffect() { return S.ensureQuebecLibreEffect.apply(this, arguments); }
  function ensureUnblockedIntent() { return S.ensureUnblockedIntent.apply(this, arguments); }
  function extractStreamingMessage() { return S.extractStreamingMessage.apply(this, arguments); }
  function extractUsageFromRaw() { return S.extractUsageFromRaw.apply(this, arguments); }
  function isConfigured() { return S.isConfigured.apply(this, arguments); }
  function isProjectScope() { return S.isProjectScope.apply(this, arguments); }
  function isWorthySuggestion() { return S.isWorthySuggestion.apply(this, arguments); }
  function liftPatchTools() { return S.liftPatchTools.apply(this, arguments); }
  function linkSuggestionColorsToHighlights() { return S.linkSuggestionColorsToHighlights.apply(this, arguments); }
  function localClock() { return S.localClock.apply(this, arguments); }
  function localStamp() { return S.localStamp.apply(this, arguments); }
  function looksLikeQuebecLibrePhrase() { return S.looksLikeQuebecLibrePhrase.apply(this, arguments); }
  function normalizeActionsWithMeta() { return S.normalizeActionsWithMeta.apply(this, arguments); }
  function normalizeAgentBlockedReason() { return S.normalizeAgentBlockedReason.apply(this, arguments); }
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }
  function normalizeBlocks() { return S.normalizeBlocks.apply(this, arguments); }
  function normalizeBoardPatches() { return S.normalizeBoardPatches.apply(this, arguments); }
  function normalizeCardPatches() { return S.normalizeCardPatches.apply(this, arguments); }
  function normalizePrompts() { return S.normalizePrompts.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function normalizeSuggestionList() { return S.normalizeSuggestionList.apply(this, arguments); }
  function nowTimeLocal() { return S.nowTimeLocal.apply(this, arguments); }
  function orderSuggestionsGreenToRed() { return S.orderSuggestionsGreenToRed.apply(this, arguments); }
  function parseAssistantPayload() { return S.parseAssistantPayload.apply(this, arguments); }
  function polishAssistantVisibleText() { return S.polishAssistantVisibleText.apply(this, arguments); }
  function polishFollowUpActions() { return S.polishFollowUpActions.apply(this, arguments); }
  function polishMessageAfterTierApply() { return S.polishMessageAfterTierApply.apply(this, arguments); }
  function profileLanguageInstruction() { return S.profileLanguageInstruction.apply(this, arguments); }
  function resolveChatModel() { return S.resolveChatModel.apply(this, arguments); }
  function resolveDueVagueArg() { return S.resolveDueVagueArg.apply(this, arguments); }
  function resolveDueVagueToDateSafe() { return S.resolveDueVagueToDateSafe.apply(this, arguments); }
  function rewriteActionsForAgentColor() { return S.rewriteActionsForAgentColor.apply(this, arguments); }
  function rewriteActionsForPriorityTier() { return S.rewriteActionsForPriorityTier.apply(this, arguments); }
  function rewriteActionsForRelativeDue() { return S.rewriteActionsForRelativeDue.apply(this, arguments); }
  function stripScaleLegendParenthetical() { return S.stripScaleLegendParenthetical.apply(this, arguments); }
  function suggestSubtasks() { return S.suggestSubtasks.apply(this, arguments); }
  function systemPrompt() { return S.systemPrompt.apply(this, arguments); }
  function taskTypesEqual() { return S.taskTypesEqual.apply(this, arguments); }
  function todayIsoLocal() { return S.todayIsoLocal.apply(this, arguments); }
  function userTurnWithClock() { return S.userTurnWithClock.apply(this, arguments); }
  function validateDueDate() { return S.validateDueDate.apply(this, arguments); }
  function validateDueTime() { return S.validateDueTime.apply(this, arguments); }

var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});
  var ASSISTANT_SCOPES = S.ASSISTANT_SCOPES;
  var PROJECT_SCOPE_TOOLS = S.PROJECT_SCOPE_TOOLS;
  function applyProgressCompleteGuards() { return S.applyProgressCompleteGuards.apply(this, arguments); }
  function buildContext() { return S.buildContext.apply(this, arguments); }
  function buildRequestMeta() { return S.buildRequestMeta.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function clampInt() { return S.clampInt.apply(this, arguments); }
  function cloneJsonSafe() { return S.cloneJsonSafe.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgFetchMeta() { return S.dbgFetchMeta.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function dueFromOffsetMinutes() { return S.dueFromOffsetMinutes.apply(this, arguments); }
  function enrichSubtaskPickTurn() { return S.enrichSubtaskPickTurn.apply(this, arguments); }
  function ensureFollowUpActionVerb() { return S.ensureFollowUpActionVerb.apply(this, arguments); }
  function ensurePersonalImpactSuggestion() { return S.ensurePersonalImpactSuggestion.apply(this, arguments); }
  function ensurePriorityAxesPrompt() { return S.ensurePriorityAxesPrompt.apply(this, arguments); }
  function ensureQuebecLibreEffect() { return S.ensureQuebecLibreEffect.apply(this, arguments); }
  function ensureUnblockedIntent() { return S.ensureUnblockedIntent.apply(this, arguments); }
  function extractStreamingMessage() { return S.extractStreamingMessage.apply(this, arguments); }
  function extractUsageFromRaw() { return S.extractUsageFromRaw.apply(this, arguments); }
  function isConfigured() { return S.isConfigured.apply(this, arguments); }
  function isProjectScope() { return S.isProjectScope.apply(this, arguments); }
  function isWorthySuggestion() { return S.isWorthySuggestion.apply(this, arguments); }
  function liftPatchTools() { return S.liftPatchTools.apply(this, arguments); }
  function linkSuggestionColorsToHighlights() { return S.linkSuggestionColorsToHighlights.apply(this, arguments); }
  function localClock() { return S.localClock.apply(this, arguments); }
  function localStamp() { return S.localStamp.apply(this, arguments); }
  function looksLikeQuebecLibrePhrase() { return S.looksLikeQuebecLibrePhrase.apply(this, arguments); }
  function normalizeActionsWithMeta() { return S.normalizeActionsWithMeta.apply(this, arguments); }
  function normalizeAgentBlockedReason() { return S.normalizeAgentBlockedReason.apply(this, arguments); }
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }
  function normalizeBlocks() { return S.normalizeBlocks.apply(this, arguments); }
  function normalizeBoardPatches() { return S.normalizeBoardPatches.apply(this, arguments); }
  function normalizeCardPatches() { return S.normalizeCardPatches.apply(this, arguments); }
  function normalizePrompts() { return S.normalizePrompts.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function normalizeSuggestionList() { return S.normalizeSuggestionList.apply(this, arguments); }
  function nowTimeLocal() { return S.nowTimeLocal.apply(this, arguments); }
  function orderSuggestionsGreenToRed() { return S.orderSuggestionsGreenToRed.apply(this, arguments); }
  function parseAssistantPayload() { return S.parseAssistantPayload.apply(this, arguments); }
  function polishAssistantVisibleText() { return S.polishAssistantVisibleText.apply(this, arguments); }
  function polishFollowUpActions() { return S.polishFollowUpActions.apply(this, arguments); }
  function polishMessageAfterTierApply() { return S.polishMessageAfterTierApply.apply(this, arguments); }
  function profileLanguageInstruction() { return S.profileLanguageInstruction.apply(this, arguments); }
  function resolveChatModel() { return S.resolveChatModel.apply(this, arguments); }
  function resolveDueVagueArg() { return S.resolveDueVagueArg.apply(this, arguments); }
  function resolveDueVagueToDateSafe() { return S.resolveDueVagueToDateSafe.apply(this, arguments); }
  function rewriteActionsForAgentColor() { return S.rewriteActionsForAgentColor.apply(this, arguments); }
  function rewriteActionsForPriorityTier() { return S.rewriteActionsForPriorityTier.apply(this, arguments); }
  function rewriteActionsForRelativeDue() { return S.rewriteActionsForRelativeDue.apply(this, arguments); }
  function stripScaleLegendParenthetical() { return S.stripScaleLegendParenthetical.apply(this, arguments); }
  function suggestSubtasks() { return S.suggestSubtasks.apply(this, arguments); }
  function systemPrompt() { return S.systemPrompt.apply(this, arguments); }
  function taskTypesEqual() { return S.taskTypesEqual.apply(this, arguments); }
  function todayIsoLocal() { return S.todayIsoLocal.apply(this, arguments); }
  function userTurnWithClock() { return S.userTurnWithClock.apply(this, arguments); }
  function validateDueDate() { return S.validateDueDate.apply(this, arguments); }
  function validateDueTime() { return S.validateDueTime.apply(this, arguments); }

  /**
   * @param {object} [options]
   * @param {(visibleMessage: string, accumulatedRaw: string) => void} [options.onDelta]
   *   Called as tokens arrive with the best-effort visible assistant message.
   */
  // ── 14. chatTurn — primary conversational entry (task or project scope) ──
  // Builds messages, calls model, runs guards, returns { message, actions… }.

  /** Max concurrent side lanes next to the main turn. */
  var PARALLEL_LANE_MAX = 3;
  var LANE_PREFIX_RE = /^\s*(?:&&?|\/\/+|(?:en\s+)?parall[eè]le\s*:)\s*/i;
  var LANE_CONTINUATION_RE =
    /^(?:et|aussi|plus|puis|non|oui|ok|attends?|finalement|en fait|sinon|c'est|merci)\b/i;

  /**
   * Router for messages sent while a turn is already in flight.
   * 'main' — nothing in flight (normal turn); 'queue' — fold into the pending turn
   * (short follow-ups / corrections); 'lane' — independent request, runs in parallel.
   * Returns { route, text, tier } (tier = model hint for a lane).
   */
  function routeMessage(text, ctx) {
    ctx = ctx || {};
    var raw = String(text || '').trim();
    if (!ctx.busy) return { route: 'main', text: raw, tier: null };
    var explicit = LANE_PREFIX_RE.test(raw);
    var body = explicit ? raw.replace(LANE_PREFIX_RE, '').trim() : raw;
    if (!body) return { route: 'queue', text: raw, tier: null };
    var lanes = ctx.activeLanes || 0;
    var max = ctx.maxLanes || PARALLEL_LANE_MAX;
    if (lanes >= max) return { route: 'queue', text: body, tier: null };
    var words = body.split(/\s+/).length;
    if (!explicit && (words <= 3 || LANE_CONTINUATION_RE.test(body))) {
      return { route: 'queue', text: body, tier: null };
    }
    var quick = /\?\s*$/.test(body) && words <= 14;
    return { route: 'lane', text: body, tier: quick ? 'efficient' : 'balanced' };
  }

  async function chatTurn(provider, history, bridge, userText, options) {
    var M = Object.create(null);
    M.provider = provider;
    M.history = history;
    M.bridge = bridge;
    M.userText = userText;
    M.options = options;
    var __parts = (global.PriorityAgentPartsMountChatTurn || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = await __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  /**
   * Lightweight call: AI-generated question chips for the card (opening state
   * or refresh after structural changes). Returns string[].
   */
  async function suggestQuestions(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var context = buildContext(bridge);
    var projectScope = isProjectScope(context && context.scope);
    var historyHint = '';
    if (options.history && options.history.length) {
      var last = options.history[options.history.length - 1];
      if (last && last.content) {
        historyHint =
          '\nDernier \u00e9change\u00a0: ' +
          String(last.role || '') +
          ' \u2014 ' +
          String(last.content).slice(0, 280);
      }
    }
    var messages = [
      {
        role: 'system',
        content: [
          'Tu sugg\u00e8res des questions ou intentions pour l\'assistant Cerveau.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":["Quelle est la priorit\u00e9?","D\u00e9finir une \u00e9ch\u00e9ance"]}',
          '2 \u00e0 4 formulations courtes en fran\u00e7ais, ancr\u00e9es dans le contexte.',
          'INTERDIT\u00a0: placeholders comme "..." ou "\u2026"\u00a0; chaque entr\u00e9e doit \u00eatre un vrai texte cliquable.',
          'Tu peux inclure des intentions d\'action (ex. \u00ab\u00a0Ajouter une sous-t\u00e2che\u00a0\u00bb)\u00a0: l\'assistant posera ensuite les questions manquantes.',
          'Respecte enabled=false des sections (ne suppose pas un blocage/une \u00e9ch\u00e9ance active si d\u00e9sactiv\u00e9).',
          'Si progress.percent/cardProgress est d\u00e9j\u00e0 \u00e0 100\u00a0: NE propose PAS \u00ab\u00a0D\u00e9finir une \u00e9ch\u00e9ance\u00a0\u00bb.',
          'Contexte carte\u00a0:',
          JSON.stringify(context),
          historyHint
        ]
          .filter(Boolean)
          .join('\n')
      },
      {
        role: 'user',
        content:
          projectScope
            ? 'Propose des questions utiles que l\'utilisateur pourrait poser maintenant au niveau projet / tableau (m\u00e9moire, vue d\'ensemble, \u00e9quipe). Pas de questions propres \u00e0 une seule carte.'
            : 'Propose des questions utiles que l\'utilisateur pourrait poser maintenant sur cette carte.'
      }
    ];
    var debug = {
      id: 'suggest-' + Date.now().toString(36),
      kind: 'suggestQuestions',
      label: 'Suggestions de questions',
      startedAt: Date.now(),
      attempts: []
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('suggestQuestions onDebug failed', cbErr);
      }
    }
    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 180,
          temperature: 0.7
        });
        if (response.meta) debug.attempts.push(Object.assign({ label: 'json' }, response.meta));
      } catch (err) {
        if (err && err.debugMeta) {
          debug.attempts.push(Object.assign({ label: 'json' }, err.debugMeta));
        }
        if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 180,
            temperature: 0.7
          });
          if (response.meta) {
            debug.attempts.push(Object.assign({ label: 'sans json mode' }, response.meta));
          }
        } else {
          throw err;
        }
      }
    } catch (fatal) {
      debug.endedAt = Date.now();
      debug.latencyMs = Date.now() - t0;
      debug.ok = false;
      debug.error = (fatal && fatal.message) || String(fatal || 'Erreur');
      debug.request = debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null;
      fatal.debug = debug;
      throw fatal;
    }
    var parsed = parseAssistantPayload(response.content);
    var list = [];
    if (parsed.suggestions && parsed.suggestions.length) {
      list = parsed.suggestions;
    } else {
      try {
        var raw = JSON.parse(response.content);
        list = normalizeSuggestionList(raw.suggestions || raw.questions);
      } catch (e) {
        list = [];
      }
    }
    var usage = extractUsageFromRaw(response.raw, messages, response.content, p.model);
    usage.latencyMs = Date.now() - t0;
    debug.endedAt = Date.now();
    debug.latencyMs = usage.latencyMs;
    debug.ok = true;
    debug.request = response.meta || (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response.meta && response.meta.status,
      content: response.content,
      raw: cloneJsonSafe(response.raw),
      suggestions: list
    };
    debug.usage = usage;
    emitDebug();
    return list;
  }

  /** Local calendar date shifted by N days (YYYY-MM-DD). */
  function addDaysIsoLocal(isoOrToday, days) {
    var base =
      typeof isoOrToday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(isoOrToday)
        ? isoOrToday
        : todayIsoLocal();
    var parts = base.split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    d.setDate(d.getDate() + (Number(days) || 0));
    return todayIsoLocal(d);
  }

  /** Whole local calendar days from `fromIso` to `toIso` (YYYY-MM-DD). */
  function daysBetweenIsoLocal(fromIso, toIso) {
    if (
      typeof fromIso !== 'string' ||
      typeof toIso !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fromIso) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toIso)
    ) {
      return NaN;
    }
    var a = fromIso.split('-');
    var b = toIso.split('-');
    var from = new Date(+a[0], +a[1] - 1, +a[2]);
    var to = new Date(+b[0], +b[1] - 1, +b[2]);
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  /**
   * Real gaps on the card worth a Coup de pouce / apply suggestion.
   * Ordered by usefulness so the model can prioritize.
   */
  function listCardImprovementGaps(context) {
    var gaps = [];
    if (!context) return gaps;
    var due = context.due;
    var priority = context.priority;
    var blocked = context.blocked;
    var progress = context.progress;
    var goals = context.goals;
    var statut = context.statut;
    var display = context.display;
    var items = progress && Array.isArray(progress.items) ? progress.items : [];
    var pendingItems = items.filter(function (item) {
      return (
        item &&
        !item.done &&
        !(item.progress != null && +item.progress >= 100)
      );
    });

    if (statut && statut.category === 'completed' && pendingItems.length) {
      gaps.push(
        'statut Terminé alors que ' +
          pendingItems.length +
          (pendingItems.length > 1 ? ' sous-tâches restent ouvertes' : ' sous-tâche reste ouverte')
      );
    }
    if (!due || !due.enabled || !due.dueDate) {
      gaps.push('échéance absente');
    } else if (display && display.duePast) {
      gaps.push('échéance passée (' + due.dueDate + ')');
    }
    if (!priority || !priority.enabled) {
      gaps.push('priorité non définie');
    }
    if (blocked && blocked.enabled) {
      var reasons = Array.isArray(blocked.blockedReasons)
        ? blocked.blockedReasons
        : [];
      var links = Array.isArray(blocked.blockedLinks) ? blocked.blockedLinks : [];
      if (!reasons.length && !links.length) {
        gaps.push('bloqué sans cause');
      }
    }
    if (
      goals &&
      !goals.projectId &&
      Array.isArray(goals.projects) &&
      goals.projects.length
    ) {
      gaps.push('aucun projet lié');
    }
    if (progress && progress.enabled && !items.length) {
      var desc = typeof context.cardDesc === 'string' ? context.cardDesc.trim() : '';
      if (desc.length >= 40) {
        gaps.push('progrès activé sans sous-tâches');
      }
    }
    if (
      progress &&
      progress.enabled &&
      pendingItems.length &&
      statut &&
      (statut.category === 'unstarted' || statut.category === 'backlog')
    ) {
      gaps.push('sous-tâches en cours mais statut encore « à faire »');
    }
    return gaps;
  }

  /**
   * Which top-level card fields differ between two buildContext snapshots.
   * Used so Coup de pouce does not re-offer what the user just changed.
   */
  function listRecentCardChanges(previousContext, currentContext) {
    var changes = [];
    if (!previousContext || !currentContext) return changes;

    function dueKey(due) {
      if (!due) return '';
      return [
        due.enabled ? '1' : '0',
        due.dueDate || '',
        due.dueTime || ''
      ].join('|');
    }
    function priorityKey(priority) {
      if (!priority) return '';
      return [
        priority.enabled ? '1' : '0',
        priority.urgency,
        priority.impact,
        priority.ease,
        priority.estimatedDurationMinutes != null
          ? priority.estimatedDurationMinutes
          : ''
      ].join('|');
    }
    function blockedKey(blocked) {
      if (!blocked) return '';
      var reasons = Array.isArray(blocked.blockedReasons)
        ? blocked.blockedReasons.slice()
        : [];
      var links = Array.isArray(blocked.blockedLinks)
        ? blocked.blockedLinks
            .map(function (link) {
              if (!link) return '';
              if (typeof link === 'string') return link;
              return link.id != null ? String(link.id) : '';
            })
            .filter(Boolean)
            .sort()
        : [];
      return [
        blocked.enabled ? '1' : '0',
        JSON.stringify(reasons),
        JSON.stringify(links)
      ].join('|');
    }
    function progressKey(progress) {
      if (!progress) return '';
      var items = Array.isArray(progress.items)
        ? progress.items.map(function (item) {
            if (!item) return '';
            return [
              item.id || '',
              item.text || '',
              item.done ? '1' : '0',
              item.progress != null ? item.progress : ''
            ].join(':');
          })
        : [];
      return [
        progress.enabled ? '1' : '0',
        progress.percent != null ? progress.percent : '',
        items.join(';')
      ].join('|');
    }
    function statutKey(statut) {
      if (!statut) return '';
      return [statut.listId || '', statut.category || '', statut.listName || ''].join(
        '|'
      );
    }
    function goalsKey(goals) {
      if (!goals) return '';
      return String(goals.projectId || '');
    }

    if (dueKey(previousContext.due) !== dueKey(currentContext.due)) {
      changes.push('due');
    }
    if (
      priorityKey(previousContext.priority) !== priorityKey(currentContext.priority)
    ) {
      changes.push('priority');
    }
    if (
      blockedKey(previousContext.blocked) !== blockedKey(currentContext.blocked)
    ) {
      changes.push('blocked');
    }
    if (
      progressKey(previousContext.progress) !==
      progressKey(currentContext.progress)
    ) {
      changes.push('progress');
    }
    if (
      statutKey(previousContext.statut) !== statutKey(currentContext.statut)
    ) {
      changes.push('statut');
    }
    if (goalsKey(previousContext.goals) !== goalsKey(currentContext.goals)) {
      changes.push('project');
    }
    if (
      String(previousContext.cardName || '') !== String(currentContext.cardName || '') ||
      String(previousContext.cardDesc || '') !== String(currentContext.cardDesc || '')
    ) {
      changes.push('card');
    }
    return changes;
  }

  function describeRecentCardChanges(previousContext, currentContext) {
    var keys = listRecentCardChanges(previousContext, currentContext);
    if (!keys.length) return [];
    var lines = [];
    var i;
    for (i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key === 'due') {
        var due = currentContext.due;
        if (due && due.enabled && due.dueDate) {
          lines.push(
            'échéance définie à ' +
              due.dueDate +
              (due.dueTime ? ' ' + due.dueTime : '') +
              ' — NE PAS redemander / redéfinir une échéance'
          );
        } else if (due && !due.enabled) {
          lines.push('échéance désactivée — ne pas la réactiver sauf vraie raison');
        } else {
          lines.push('échéance modifiée');
        }
      } else if (key === 'priority') {
        lines.push('priorité / axes modifiés — ne pas les remettre à l\'identique');
      } else if (key === 'blocked') {
        var blocked = currentContext.blocked;
        if (blocked && blocked.enabled) {
          lines.push('carte marquée bloquée — ne pas re-bloquer');
        } else {
          lines.push('blocage retiré — ne pas re-bloquer');
        }
      } else if (key === 'progress') {
        lines.push('progrès / sous-tâches modifiés');
      } else if (key === 'statut') {
        var statut = currentContext.statut;
        lines.push(
          'statut / liste modifié' +
            (statut && statut.listName ? ' (' + statut.listName + ')' : '')
        );
      } else if (key === 'project') {
        lines.push('lien projet modifié');
      } else if (key === 'card') {
        lines.push('titre ou description modifié');
      }
    }
    return lines;
  }

  /**
   * Drop improvement suggestions that redo a field the user just changed.
   * (e.g. set_due right after they set due to tomorrow.)
   */
  function filterImprovementsAgainstRecentChanges(
    list,
    previousContext,
    currentContext
  ) {
    if (!Array.isArray(list) || !list.length) return [];
    var recent = listRecentCardChanges(previousContext, currentContext);
    if (!recent.length) return list;
    var blockedTools = {};
    if (recent.indexOf('due') >= 0) blockedTools.set_due = true;
    if (recent.indexOf('priority') >= 0) blockedTools.set_priority = true;
    if (recent.indexOf('blocked') >= 0) blockedTools.set_blocked = true;
    if (recent.indexOf('statut') >= 0) blockedTools.set_statut = true;
    if (recent.indexOf('project') >= 0) blockedTools.set_project = true;
    if (!Object.keys(blockedTools).length) return list;

    return list.filter(function (item) {
      if (!item || !Array.isArray(item.actions) || !item.actions.length) {
        return false;
      }
      for (var i = 0; i < item.actions.length; i++) {
        var tool = item.actions[i] && item.actions[i].tool;
        if (tool && blockedTools[tool]) return false;
      }
      return true;
    });
  }

  /**
   * Resolve proposed dueDate/dueTime from set_due args (absolute, relative, or vague).
   * @returns {{dueDate:?string, dueTime:?string, dueVague:?string, dueMode:?string, hasDate:boolean, hasTime:boolean, hasVague:boolean}|null}
   */
  function resolveImprovementDueArgs(args, context) {
    if (!args || typeof args !== 'object') return null;
    if (
      Object.prototype.hasOwnProperty.call(args, 'dueVague') ||
      args.dueMode === 'vague'
    ) {
      var vagueId = resolveDueVagueArg(args.dueVague);
      if (!vagueId) return null;
      var vagueDate = resolveDueVagueToDateSafe(vagueId);
      if (!vagueDate) return null;
      return {
        dueDate: vagueDate,
        dueTime: null,
        dueVague: vagueId,
        dueMode: 'vague',
        hasDate: true,
        hasTime: false,
        hasVague: true
      };
    }
    var hasRelative =
      args.relativeMinutes != null || args.relativeHours != null;
    if (hasRelative) {
      var offsetMins = 0;
      if (args.relativeHours != null) {
        var hours = Number(args.relativeHours);
        if (!isFinite(hours)) return null;
        offsetMins += hours * 60;
      }
      if (args.relativeMinutes != null) {
        var minutes = Number(args.relativeMinutes);
        if (!isFinite(minutes)) return null;
        offsetMins += minutes;
      }
      offsetMins = Math.round(offsetMins);
      if (offsetMins < 0) return null;
      var from = null;
      if (context && context.today && context.nowTime) {
        var tp = String(context.nowTime).split(':');
        var dp = String(context.today).split('-');
        if (dp.length === 3 && tp.length >= 2) {
          from = new Date(
            +dp[0],
            +dp[1] - 1,
            +dp[2],
            +tp[0] || 0,
            +tp[1] || 0,
            0,
            0
          );
        }
      }
      var resolved = dueFromOffsetMinutes(offsetMins, from || undefined);
      if (!resolved) return null;
      return {
        dueDate: resolved.dueDate,
        dueTime: resolved.dueTime,
        dueVague: null,
        dueMode: 'precise',
        hasDate: true,
        hasTime: true,
        hasVague: false
      };
    }
    var out = {
      dueDate: null,
      dueTime: null,
      dueVague: null,
      dueMode: 'precise',
      hasDate: false,
      hasTime: false,
      hasVague: false
    };
    if (Object.prototype.hasOwnProperty.call(args, 'dueDate')) {
      var dueDate = validateDueDate(args.dueDate);
      if (dueDate === undefined) return null;
      out.dueDate = dueDate;
      out.hasDate = true;
    }
    if (Object.prototype.hasOwnProperty.call(args, 'dueTime')) {
      var dueTime = validateDueTime(args.dueTime);
      if (dueTime === undefined) return null;
      out.dueTime = dueTime;
      out.hasTime = true;
    }
    return out;
  }

  /**
   * True when an improvement action would not change the card given context.
   * Used to drop nonsensical Coup de pouce / apply suggestions (e.g. set due
   * to tomorrow when it is already tomorrow).
   */
  function isNoOpImprovementAction(action, context) {
    if (!action || !action.tool) return true;
    var args = action.args && typeof action.args === 'object' ? action.args : {};
    var tool = action.tool;
    var due = context && context.due;
    var priority = context && context.priority;
    var blocked = context && context.blocked;
    var progress = context && context.progress;
    var goals = context && context.goals;
    var statut = context && context.statut;

    if (tool === 'set_due') {
      if (!due) return false;
      var proposed = resolveImprovementDueArgs(args, context);
      // Bad/unresolvable args are noise — treat as no-op when a due already exists.
      if (!proposed) return !!(due.enabled && due.dueDate);
      var wantEnabled =
        args.dueEnabled != null
          ? !!args.dueEnabled
          : proposed.hasDate || proposed.hasTime || proposed.hasVague
            ? true
            : !!due.enabled;
      if (wantEnabled !== !!due.enabled) return false;
      if (!wantEnabled) return true;
      var curVague =
        due.dueMode === 'vague' && due.dueVague ? String(due.dueVague) : '';
      if (proposed.hasVague) {
        return curVague === String(proposed.dueVague || '');
      }
      if (curVague) {
        // Switching from vague → precise is a real change.
        if (proposed.hasDate || proposed.hasTime) return false;
      }
      var nextDate = proposed.hasDate ? proposed.dueDate : due.dueDate || null;
      var nextTime = proposed.hasTime ? proposed.dueTime : due.dueTime || null;
      var curDate = due.dueDate || null;
      var curTime = due.dueTime || null;
      // Same calendar day, suggestion only restates the date (no new time) → no-op.
      if (
        proposed.hasDate &&
        !proposed.hasTime &&
        nextDate &&
        curDate &&
        nextDate === curDate &&
        wantEnabled &&
        !curVague
      ) {
        return true;
      }
      if ((nextDate || null) !== (curDate || null)) return false;
      if ((nextTime || null) !== (curTime || null)) return false;
      return true;
    }

    if (tool === 'set_blocked') {
      if (!blocked) return false;
      var wantBlocked =
        args.enAttente != null
          ? !!args.enAttente
          : Array.isArray(args.blockedReasons) && args.blockedReasons.length
            ? true
            : Array.isArray(args.blockedLinks) && args.blockedLinks.length
              ? true
              : !!blocked.enabled;
      if (wantBlocked !== !!blocked.enabled) return false;
      if (!wantBlocked) return true;
      if (Array.isArray(args.blockedReasons)) {
        var nextReasons = args.blockedReasons
          .filter(function (r) {
            return typeof r === 'string' && r.trim();
          })
          .map(function (r) {
            return normalizeAgentBlockedReason(r) || String(r).trim();
          });
        var curReasons = Array.isArray(blocked.blockedReasons)
          ? blocked.blockedReasons.slice()
          : [];
        if (JSON.stringify(nextReasons) !== JSON.stringify(curReasons)) {
          return false;
        }
      }
      if (Object.prototype.hasOwnProperty.call(args, 'blockedLinks')) {
        var nextLinks = Array.isArray(args.blockedLinks)
          ? args.blockedLinks
              .map(function (link) {
                if (!link) return '';
                if (typeof link === 'string') return link.trim();
                if (typeof link === 'object' && link.id != null) {
                  return String(link.id).trim();
                }
                return '';
              })
              .filter(Boolean)
              .sort()
          : [];
        var curLinks = Array.isArray(blocked.blockedLinks)
          ? blocked.blockedLinks
              .map(function (link) {
                return link && link.id != null ? String(link.id).trim() : '';
              })
              .filter(Boolean)
              .sort()
          : [];
        if (JSON.stringify(nextLinks) !== JSON.stringify(curLinks)) {
          return false;
        }
      }
      return true;
    }

    if (tool === 'set_task_types') {
      var proposedTypes = normalizeAgentTaskTypes(
        args.types != null ? args.types : args.taskTypes
      );
      var curTypes = normalizeAgentTaskTypes(
        (context && context.taskTypes) ||
          (priority && priority.taskTypes) ||
          []
      );
      if (taskTypesEqual(proposedTypes, curTypes)) return true;
      if (context && context.taskTypesLocked && args.force !== true) {
        return true;
      }
      return false;
    }

    if (tool === 'set_priority') {
      if (!priority) return false;
      var wantPri =
        args.priorityEnabled != null
          ? !!args.priorityEnabled
          : args.urgency != null ||
              args.impact != null ||
              args.ease != null ||
              args.empressement != null ||
              args.tier != null ||
              args.heatTarget != null ||
              args.estimatedDurationMinutes !== undefined ||
              (typeof args.estimatedDuration === 'string' &&
                !!args.estimatedDuration.trim())
            ? true
            : !!priority.enabled;
      if (wantPri !== !!priority.enabled) return false;
      if (!wantPri) return true;
      if (args.urgency != null && +args.urgency !== +priority.urgency) {
        return false;
      }
      if (args.impact != null && +args.impact !== +priority.impact) {
        return false;
      }
      if (args.ease != null && +args.ease !== +priority.ease) return false;
      if (
        args.empressement != null &&
        String(args.empressement) !== String(priority.empressement)
      ) {
        return false;
      }
      if (args.estimatedDurationMinutes !== undefined) {
        var nextDur =
          args.estimatedDurationMinutes === null ||
          args.estimatedDurationMinutes === ''
            ? null
            : +args.estimatedDurationMinutes;
        var curDur =
          priority.estimatedDurationMinutes != null
            ? +priority.estimatedDurationMinutes
            : null;
        if (nextDur !== curDur) return false;
      }
      if (args.tier != null || args.heatTarget != null) {
        var curTier =
          context.display && context.display.tier
            ? String(context.display.tier)
            : '';
        var wantTier = args.tier != null ? String(args.tier) : '';
        if (wantTier && curTier && wantTier.toLowerCase() === curTier.toLowerCase()) {
          // Same palier label — no-op unless axes/duration also change (already checked).
        } else if (wantTier && curTier) {
          return false;
        } else {
          return false;
        }
      }
      return true;
    }

    if (tool === 'set_progress') {
      if (!progress) return false;
      var wantProgEnabled =
        args.progressEnabled != null
          ? !!args.progressEnabled
          : args.progress != null
            ? true
            : !!progress.enabled;
      if (wantProgEnabled !== !!progress.enabled) return false;
      if (!wantProgEnabled) return true;
      if (args.progress != null) {
        var curPct =
          progress.percent != null
            ? progress.percent
            : progress.cardProgress != null
              ? progress.cardProgress
              : null;
        if (curPct == null || +args.progress !== +curPct) return false;
      }
      return true;
    }

    if (tool === 'set_project') {
      var curProjectId = goals && goals.projectId ? String(goals.projectId) : '';
      if (args.clear === true) return !curProjectId;
      var wantProjectId =
        typeof args.projectId === 'string' ? args.projectId.trim() : '';
      if (wantProjectId) return wantProjectId === curProjectId;
      var match =
        (typeof args.matchText === 'string' && args.matchText.trim()) ||
        (typeof args.name === 'string' && args.name.trim()) ||
        '';
      if (match && goals && goals.project && goals.project.name) {
        var curName = String(goals.project.name).trim().toLowerCase();
        if (match.trim().toLowerCase() === curName) return true;
      }
      return false;
    }

    if (tool === 'set_statut') {
      if (!statut) return false;
      if (typeof args.listId === 'string' && args.listId.trim()) {
        return String(args.listId.trim()) === String(statut.listId || '');
      }
      if (typeof args.category === 'string' && args.category.trim()) {
        var wantCat = args.category.trim().toLowerCase();
        var curCat = statut.category ? String(statut.category).toLowerCase() : '';
        if (wantCat && curCat && wantCat === curCat) return true;
      }
      if (typeof args.matchList === 'string' && args.matchList.trim()) {
        var wantList = args.matchList.trim().toLowerCase();
        var curList = statut.listName
          ? String(statut.listName).trim().toLowerCase()
          : '';
        if (wantList && curList && wantList === curList) return true;
      }
      return false;
    }

    if (tool === 'add_subtask') {
      var text =
        typeof args.text === 'string' ? args.text.trim().toLowerCase() : '';
      if (!text || !progress || !Array.isArray(progress.items)) return false;
      for (var si = 0; si < progress.items.length; si++) {
        var existing = progress.items[si] && progress.items[si].text;
        if (
          typeof existing === 'string' &&
          existing.trim().toLowerCase() === text
        ) {
          return true;
        }
      }
      return false;
    }

    if (tool === 'complete_all_subtasks') {
      if (!progress || !Array.isArray(progress.items) || !progress.items.length) {
        if (progress && progress.cardProgress === 100) return true;
        return !progress || !progress.items || !progress.items.length;
      }
      return progress.items.every(function (item) {
        return (
          item &&
          (!!item.done ||
            (item.progress != null && +item.progress >= 100))
        );
      });
    }

    return false;
  }

  // exports
  S.LANE_CONTINUATION_RE = LANE_CONTINUATION_RE;
  S.LANE_PREFIX_RE = LANE_PREFIX_RE;
  S.PARALLEL_LANE_MAX = PARALLEL_LANE_MAX;
  S.addDaysIsoLocal = addDaysIsoLocal;
  S.chatTurn = chatTurn;
  S.daysBetweenIsoLocal = daysBetweenIsoLocal;
  S.describeRecentCardChanges = describeRecentCardChanges;
  S.filterImprovementsAgainstRecentChanges = filterImprovementsAgainstRecentChanges;
  S.isNoOpImprovementAction = isNoOpImprovementAction;
  S.listCardImprovementGaps = listCardImprovementGaps;
  S.listRecentCardChanges = listRecentCardChanges;
  S.resolveImprovementDueArgs = resolveImprovementDueArgs;
  S.routeMessage = routeMessage;
  S.suggestQuestions = suggestQuestions;
})(typeof window !== 'undefined' ? window : this);
