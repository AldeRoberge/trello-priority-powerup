/**
 * AI agent: chat turn
 *
 * Part 7/10 of agent. chatTurn, the main conversational loop (task or project scope).
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
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
    options = options || {};
    dbgLog('agent', 'chatTurn.start', {});
    var onDelta = typeof options.onDelta === 'function' ? options.onDelta : null;
    var p = normalizeProvider(provider);
    var resolvedModel = resolveChatModel(p, history, options.modelTier);
    if (resolvedModel && resolvedModel !== p.model) {
      p = normalizeProvider(Object.assign({}, p, { model: resolvedModel }));
    }
    var context = buildContext(bridge);
    var live = localClock();
    context.today = live.today;
    context.nowTime = live.nowTime;
    context.timeZone = live.timeZone;
    context.utcOffset = live.utcOffset;
    if (context.appBuiltAt) context.appBuiltLocal = localStamp(context.appBuiltAt);
    var messages = [
      {
        role: 'system',
        content: systemPrompt(context, { userText: userText })
      }
    ];
    (history || []).forEach(function (entry) {
      if (!entry || !entry.role || !entry.content) return;
      if (entry.role === 'user' || entry.role === 'assistant') {
        messages.push({
          role: entry.role,
          content:
            entry.role === 'assistant' && entry.rawJson
              ? entry.rawJson
              : String(entry.content)
        });
      }
    });
    messages.push({ role: 'user', content: userTurnWithClock(userText) });

    var debug = {
      id: 'chat-' + Date.now().toString(36),
      kind: 'chatTurn',
      label: 'Tour de conversation',
      startedAt: Date.now(),
      attempts: []
    };

    function recordAttempt(label, metaOrErr) {
      if (metaOrErr && metaOrErr.meta) {
        debug.attempts.push(Object.assign({ label: label }, metaOrErr.meta));
        dbgLog('agent', 'chatTurn.fetch', dbgFetchMeta(label, metaOrErr));
        return;
      }
      if (metaOrErr && metaOrErr.debugMeta) {
        debug.attempts.push(Object.assign({ label: label }, metaOrErr.debugMeta));
        dbgLog('agent', 'chatTurn.fetch', dbgFetchMeta(label, metaOrErr));
        return;
      }
      debug.attempts.push({
        label: label,
        error: (metaOrErr && metaOrErr.message) || String(metaOrErr || 'error'),
        ok: false
      });
      dbgLog('agent', 'chatTurn.fetch', dbgFetchMeta(label, metaOrErr));
    }

    function notifyVisible(accumulated) {
      if (!onDelta) return;
      var visible = extractStreamingMessage(accumulated);
      if (!visible) return;
      try {
        onDelta(visible, accumulated);
      } catch (cbErr) {
        console.error('chatTurn onDelta failed', cbErr);
      }
    }

    var t0 = Date.now();
    var response;
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          stream: true,
          onDelta: function (_piece, accumulated) {
            notifyVisible(accumulated);
          }
        });
        recordAttempt('stream + json', response);
      } catch (err) {
        recordAttempt('stream + json', err);
        if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            stream: true,
            onDelta: function (_piece, accumulated) {
              notifyVisible(accumulated);
            }
          });
          recordAttempt('stream (sans json mode)', response);
        } else if (err && /stream/i.test((err && err.message) || '')) {
          dbgLog('agent', 'chatTurn.fetch', {
            attempt: 'stream + json',
            ok: false,
            fallback: 'stream-rejected'
          });
          // Provider rejected streaming — fall back to a blocking call.
          try {
            response = await chatCompletions(p, messages, { jsonMode: true, stream: false });
            recordAttempt('non-stream + json', response);
          } catch (err2) {
            recordAttempt('non-stream + json', err2);
            if (err2 && err2.message && /response_format|json_object|json mode/i.test(err2.message)) {
              response = await chatCompletions(p, messages, { jsonMode: false, stream: false });
              recordAttempt('non-stream (sans json mode)', response);
            } else {
              throw err2;
            }
          }
          notifyVisible(response.content);
        } else {
          throw err;
        }
      }
    } catch (fatal) {
      debug.endedAt = Date.now();
      debug.latencyMs = Date.now() - t0;
      debug.ok = false;
      debug.error = (fatal && fatal.message) || String(fatal || 'Erreur');
      dbgError('agent', 'chatTurn.end', fatal, { latencyMs: debug.latencyMs, ok: false });
      debug.request = debug.attempts.length
        ? debug.attempts[debug.attempts.length - 1]
        : buildRequestMeta(p, {
            model: p.model,
            messages: messages,
            temperature: 0.3,
            stream: true,
            response_format: { type: 'json_object' }
          });
      fatal.debug = debug;
      throw fatal;
    }
    var latencyMs = Date.now() - t0;
    var parsed = parseAssistantPayload(response.content);
    parsed = await enrichSubtaskPickTurn(parsed, context, {
      suggestTitles: function () {
        return suggestSubtasks(p, {
          cardName: (context && context.cardName) || '',
          cardDesc: (context && context.cardDesc) || '',
          priorityLabel:
            context && context.display && context.display.label
              ? context.display.label
              : '',
          existingSubtasks: [],
          memory: (context && context.memory) || null,
          boardDigest: (context && context.boardDigest) || '',
          profile: (context && context.profile) || null
        });
      }
    });
    parsed.suggestions = ensurePersonalImpactSuggestion(
      parsed.suggestions,
      context && context.userName,
      parsed.message
    );
    var actions = rewriteActionsForRelativeDue(parsed.actions || [], userText);
    var tierRewrite = rewriteActionsForPriorityTier(actions, userText);
    actions = tierRewrite.actions;
    var message = polishAssistantVisibleText(
      stripScaleLegendParenthetical(
        polishMessageAfterTierApply(
          parsed.message,
          tierRewrite.tier,
          tierRewrite.injected
        )
      )
    );
    var colorRewrite = rewriteActionsForAgentColor(
      actions,
      userText,
      message,
      parsed.color
    );
    actions = colorRewrite.actions;
    var progressGuard = applyProgressCompleteGuards(
      {
        message: message,
        actions: actions,
        suggestions: parsed.suggestions,
        emotion: parsed.emotion || null
      },
      context
    );
    message = progressGuard.message;
    actions = progressGuard.actions;
    actions = ensureQuebecLibreEffect(actions, userText);
    actions = ensureUnblockedIntent(actions, userText);
    var liftedChat = liftPatchTools(actions, parsed.cardPatches, parsed.patches);
    actions = liftedChat.actions;
    parsed.cardPatches = normalizeCardPatches(liftedChat.cardPatches);
    parsed.patches = normalizeBoardPatches(liftedChat.patches);
    var projectScope = isProjectScope(context && context.scope);
    if (projectScope) {
      var droppedForScope = [];
      actions = (actions || []).filter(function (a) {
        if (a && PROJECT_SCOPE_TOOLS[a.tool]) return true;
        if (a && a.tool) {
          droppedForScope.push({
            tool: a.tool,
            code: 'project-scope',
            reason: 'project-scope',
            error: a.tool + ': indisponible en mode projet',
            hint:
              'Ouvre la carte dans le popup Power-Up pour appliquer cet outil. L\'assistant projet ne modifie pas les cartes.'
          });
        }
        return false;
      });
      parsed.droppedActions = (parsed.droppedActions || []).concat(droppedForScope);
      parsed.cardPatches = [];
      // Project window: no card self-review cycle.
      parsed.selfPrompt = false;
      parsed.selfPromptFocus = '';
    }
    parsed.suggestions = linkSuggestionColorsToHighlights(
      progressGuard.suggestions || parsed.suggestions,
      message
    );
    parsed.suggestions = orderSuggestionsGreenToRed(
      parsed.suggestions,
      context && context.userName
    );
    var replyEmotion = progressGuard.emotion;
    if (looksLikeQuebecLibrePhrase(userText) && !replyEmotion) {
      replyEmotion = 'happy';
    }
    var replyColor =
      colorRewrite.color || parsed.color || null;
    var prompts = projectScope
      ? []
      : ensurePriorityAxesPrompt(
          normalizePrompts(parsed.prompts, context),
          actions,
          context
        );
    var blocks = normalizeBlocks(parsed.blocks, context);
    if (onDelta && message) {
      try {
        onDelta(message, response.content);
      } catch (finalCbErr) {
        console.error('chatTurn final onDelta failed', finalCbErr);
      }
    }
    var usage = extractUsageFromRaw(response.raw, messages, response.content, p.model);
    usage.latencyMs = latencyMs;
    usage.historyTurns = (history || []).length;
    debug.endedAt = Date.now();
    debug.latencyMs = latencyMs;
    debug.ok = true;
    debug.request = response.meta || (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response.meta && response.meta.status,
      content: response.content,
      raw: cloneJsonSafe(response.raw),
      parsed: {
        message: message,
        followUps: parsed.followUps,
        suggestions: parsed.suggestions,
        prompts: prompts,
        blocks: blocks,
        actions: actions,
        droppedActions: parsed.droppedActions || [],
        modelTier: parsed.modelTier || null,
        tierInjected: !!tierRewrite.injected,
        colorInjected: !!colorRewrite.injected,
        scope: (context && context.scope) || ASSISTANT_SCOPES.TASK
      }
    };
    debug.usage = usage;
    dbgLog('agent', 'chatTurn.end', {
      ok: true,
      latencyMs: latencyMs,
      actionCount: (actions || []).length,
      droppedCount: (parsed.droppedActions || []).length
    });
    return {
      message: message,
      emotion: replyEmotion || parsed.emotion || null,
      color: replyColor,
      modelTier: parsed.modelTier || null,
      followUps: parsed.followUps,
      suggestions: parsed.suggestions,
      suggestionsMulti: !!parsed.suggestionsMulti,
      prompts: prompts,
      blocks: blocks,
      actions: actions,
      droppedActions: parsed.droppedActions || [],
      cardPatches: projectScope ? [] : parsed.cardPatches || [],
      patches: parsed.patches || [],
      selfPrompt: projectScope ? false : !!parsed.selfPrompt,
      selfPromptFocus: projectScope ? '' : parsed.selfPromptFocus || '',
      rawJson: response.content,
      context: context,
      usage: usage,
      debug: debug
    };
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

  /** Keep suggestions that have at least one action that would change the card. */
  function filterNoOpImprovementSuggestions(list, context) {
    if (!Array.isArray(list) || !list.length) return [];
    return list.filter(function (item) {
      if (!item || !Array.isArray(item.actions) || !item.actions.length) {
        return false;
      }
      for (var i = 0; i < item.actions.length; i++) {
        if (!isNoOpImprovementAction(item.actions[i], context)) return true;
      }
      return false;
    });
  }

  /**
   * Few-shot JSON shaped by real gaps — avoids always teaching "set due tomorrow".
   */
  function buildImprovementExampleJson(context, gaps, today, tomorrow) {
    var first = gaps && gaps.length ? gaps[0] : '';
    if (!first) {
      return '{"suggestions":[]}';
    }
    if (first.indexOf('échéance absente') === 0) {
      return (
        '{"suggestions":[{"label":"D\u00e9finir l\'\u00e9ch\u00e9ance \u00e0 demain","actions":[{"tool":"set_due","args":{"dueDate":"' +
        tomorrow +
        '","dueEnabled":true}}]}]}'
      );
    }
    if (first.indexOf('échéance passée') === 0) {
      return (
        '{"suggestions":[{"label":"Reporter l\'\u00e9ch\u00e9ance \u00e0 demain","actions":[{"tool":"set_due","args":{"dueDate":"' +
        tomorrow +
        '","dueEnabled":true}}]}]}'
      );
    }
    if (first.indexOf('priorité') === 0) {
      return '{"suggestions":[{"label":"D\u00e9finir la priorit\u00e9","actions":[{"tool":"set_priority","args":{"priorityEnabled":true,"urgency":2,"impact":2,"ease":3}}]}]}';
    }
    if (first.indexOf('statut Terminé') === 0) {
      return '{"suggestions":[{"label":"Marquer les sous-t\u00e2ches termin\u00e9es","actions":[{"tool":"complete_all_subtasks","args":{}}]}]}';
    }
    if (first.indexOf('projet') >= 0 && context.goals && context.goals.projects && context.goals.projects[0]) {
      var proj = context.goals.projects[0];
      var match = proj.name || proj.id || '';
      return (
        '{"suggestions":[{"label":"Lier au projet ' +
        String(match).replace(/"/g, '') +
        '","actions":[{"tool":"set_project","args":{"matchText":"' +
        String(match).replace(/"/g, '') +
        '"}}]}]}'
      );
    }
    if (first.indexOf('bloqué sans cause') === 0) {
      return '{"suggestions":[{"label":"Pr\u00e9ciser la cause de blocage","actions":[{"tool":"set_blocked","args":{"enAttente":true,"blockedReasons":["En attente d\'une r\u00e9ponse"]}}]}]}';
    }
    if (first.indexOf('sous-tâches') >= 0 || first.indexOf('progrès') >= 0) {
      return '{"suggestions":[{"label":"Ajouter une sous-t\u00e2che concr\u00e8te","actions":[{"tool":"add_subtask","args":{"text":"Clarifier la prochaine \u00e9tape"}}]}]}';
    }
    return '{"suggestions":[]}';
  }

  /**
   * On-card-open / Coup de pouce: AI proposes applyable improvements.
   * Pass options.previousContext when reacting to a user edit so we never
   * re-offer the field they just changed.
   * @returns {Promise<Array<{label:string, actions:Array}>>}
   */
  async function suggestCardImprovements(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var previousContext =
      options.previousContext && typeof options.previousContext === 'object'
        ? options.previousContext
        : null;
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var context = buildContext(bridge);
    var today = (context && context.today) || todayIsoLocal();
    var tomorrow = addDaysIsoLocal(today, 1);
    var nowTime = (context && context.nowTime) || nowTimeLocal();
    var dueAlready = context.due && context.due.enabled && context.due.dueDate;
    var gaps = listCardImprovementGaps(context);
    var recentLines = describeRecentCardChanges(previousContext, context);
    var recentKeys = listRecentCardChanges(previousContext, context);
    // Gaps the model should ignore because the user just handled that field.
    var gapsForPrompt = gaps.filter(function (gap) {
      if (recentKeys.indexOf('due') >= 0 && /échéance/i.test(gap)) return false;
      if (recentKeys.indexOf('priority') >= 0 && /priorité/i.test(gap)) return false;
      if (recentKeys.indexOf('blocked') >= 0 && /bloqu/i.test(gap)) return false;
      if (recentKeys.indexOf('project') >= 0 && /projet/i.test(gap)) return false;
      if (recentKeys.indexOf('statut') >= 0 && /statut/i.test(gap)) return false;
      return true;
    });
    var exampleJson = buildImprovementExampleJson(
      context,
      gapsForPrompt,
      today,
      tomorrow
    );
    var systemLines = [
      'Tu analyses une carte Trello (Power-Up Cerveau) et proposes le PROCHAIN coup de pouce utile.',
      'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
      exampleJson,
      'R\u00e8gles\u00a0:',
      '- 0 \u00e0 3 suggestions max. Si rien d\'utile (carte d\u00e9j\u00e0 en ordre, ou seul le champ que l\'utilisateur vient de changer)\u00a0: {"suggestions":[]}.',
      '- Chaque suggestion DOIT avoir actions non vides (outils ex\u00e9cutables), pas seulement une question.',
      '- label\u00a0: verbe \u00e0 l\'infinitif, court, en fran\u00e7ais.',
      '- Outils autoris\u00e9s\u00a0: set_due, set_priority, set_blocked, set_progress, add_subtask, set_project, set_statut, complete_all_subtasks.',
      '- Priorise les vrais manques / incoh\u00e9rences list\u00e9s ci-dessous. Ne propose PAS un changement cosm\u00e9tique si un vrai trou existe.',
      '- Si context.goals.projectId est null et context.goals.projects n\'est pas vide, tu PEUX proposer de lier un projet pertinent (set_project avec matchText ou projectId).',
      '- Incoh\u00e9rence\u00a0: si statut.category=completed et sous-t\u00e2ches ouvertes, propose complete_all_subtasks OU set_statut vers started/unstarted/backlog.',
      '- Dates\u00a0: aujourd\'hui = ' +
        today +
        ', demain = ' +
        tomorrow +
        ', heure actuelle = ' +
        nowTime +
        '.',
      '- INTERDIT noop\u00a0: ne re-bloque pas si d\u00e9j\u00e0 bloqu\u00e9\u00a0; ne red\u00e9finis pas priorit\u00e9/statut/projet identiques\u00a0; ne propose pas complete_all_subtasks si tout est \u00e0 100%.',
      '- \u00c9ch\u00e9ance\u00a0: INTERDIT set_due vers une date d\u00e9j\u00e0 active' +
        (dueAlready ? ' (active\u00a0: ' + dueAlready + ')' : '') +
        '. Propose set_due SEULEMENT si absente, d\u00e9sactiv\u00e9e, pass\u00e9e, ou clairement \u00e0 d\u00e9caler \u2014 jamais pour redire «\u00a0demain\u00a0» juste apr\u00e8s que l\'utilisateur l\'ait mis.',
      '- L\'exemple JSON n\'est un mod\u00e8le de format que s\'il correspond aux manques restants\u00a0; sinon adapte ou renvoie [].',
      '- add_subtask.text obligatoire et concret si utilis\u00e9.'
    ];
    if (gapsForPrompt.length) {
      systemLines.push('Manques / incoh\u00e9rences \u00e0 combler (dans l\'ordre)\u00a0:');
      gapsForPrompt.forEach(function (gap, idx) {
        systemLines.push((idx + 1) + '. ' + gap);
      });
    } else {
      systemLines.push(
        'Aucun manque prioritaires d\u00e9tect\u00e9 \u2014 renvoie {"suggestions":[]} sauf vraie incoh\u00e9rence absente de cette liste.'
      );
    }
    if (recentLines.length) {
      systemLines.push(
        'CHANGEMENTS TOUT JUSTE FAITS PAR L\'UTILISATEUR (ne pas les refaire, ni les redemander)\u00a0:'
      );
      recentLines.forEach(function (line) {
        systemLines.push('- ' + line);
      });
      systemLines.push(
        'Propose plut\u00f4t le prochain compl\u00e9ment utile (autre section), ou [].'
      );
    }
    systemLines.push('Contexte carte\u00a0:');
    systemLines.push(JSON.stringify(context));

    var messages = [
      {
        role: 'system',
        content: systemLines.join('\n')
      },
      {
        role: 'user',
        content: recentLines.length
          ? 'L\'utilisateur vient de modifier la carte. Quel prochain coup de pouce utile (sans refaire ce qu\'il vient de faire)? Sinon suggestions vides.'
          : 'Y a-t-il une am\u00e9lioration concr\u00e8te \u00e0 appliquer sur cette carte? Sinon renvoie suggestions vides.'
      }
    ];
    var debug = {
      id: 'improve-' + Date.now().toString(36),
      kind: 'suggestCardImprovements',
      label: 'Suggestions applicables',
      startedAt: Date.now(),
      attempts: [],
      gaps: gapsForPrompt.slice(),
      recentChanges: recentKeys.slice()
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('suggestCardImprovements onDebug failed', cbErr);
      }
    }

    // Fast path: user just edited the only meaningful surface and nothing else to do.
    if (recentKeys.length && !gapsForPrompt.length) {
      debug.endedAt = Date.now();
      debug.latencyMs = 0;
      debug.ok = true;
      debug.skippedApi = true;
      debug.response = { suggestions: [] };
      emitDebug();
      return [];
    }

    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 420,
          temperature: 0.35
        });
        if (response.meta) debug.attempts.push(Object.assign({ label: 'json' }, response.meta));
      } catch (err) {
        if (err && err.debugMeta) {
          debug.attempts.push(Object.assign({ label: 'json' }, err.debugMeta));
        }
        if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 420,
            temperature: 0.35
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
      emitDebug();
      throw fatal;
    }

    var parsed = parseAssistantPayload(response.content);
    var list = [];
    // Prefer applyable followUps-shaped items; also accept suggestions with actions.
    var rawItems = [];
    try {
      var data = JSON.parse(
        (function () {
          var text = typeof response.content === 'string' ? response.content.trim() : '';
          var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
          if (fence) return fence[1].trim();
          var start = text.indexOf('{');
          var end = text.lastIndexOf('}');
          return start >= 0 && end > start ? text.slice(start, end + 1) : text;
        })()
      );
      if (Array.isArray(data.suggestions)) rawItems = data.suggestions;
      else if (Array.isArray(data.followUps)) rawItems = data.followUps;
    } catch (parseErr) {
      rawItems = parsed.followUps || [];
    }
    rawItems.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var label = typeof item.label === 'string' ? item.label.trim() : '';
      if (!label && typeof item.text === 'string') label = item.text.trim();
      if (!isWorthySuggestion(label)) return;
      var actionsMeta = normalizeActionsWithMeta(item.actions);
      var actions = polishFollowUpActions(actionsMeta.actions || []);
      if (!actions.length) return;
      label = ensureFollowUpActionVerb(label, actions);
      list.push({ label: label, actions: actions });
    });

    // Re-read live card state: user may have finished editing during the API round-trip.
    var liveContext = buildContext(bridge);
    list = filterNoOpImprovementSuggestions(list, liveContext);
    list = filterImprovementsAgainstRecentChanges(
      list,
      previousContext,
      liveContext
    );
    list = list.slice(0, 3);

    var usage = extractUsageFromRaw(response.raw, messages, response.content, p.model);
    usage.latencyMs = Date.now() - t0;
    debug.endedAt = Date.now();
    debug.latencyMs = usage.latencyMs;
    debug.ok = true;
    debug.request =
      response.meta || (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
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

  /**
   * Preferred non-completed Statut category when reversing a wrong "done".
   */
  function preferReopenStatutCategory(statut) {
    var lists = statut && Array.isArray(statut.lists) ? statut.lists : [];
    var preferred = ['started', 'unstarted', 'backlog', 'triage'];
    for (var p = 0; p < preferred.length; p++) {
      var want = preferred[p];
      for (var i = 0; i < lists.length; i++) {
        if (lists[i] && lists[i].category === want) return want;
      }
    }
    return 'started';
  }

  function buildDonePendingSanityFallback(mismatch, statut) {
    var pending = (mismatch && mismatch.pendingItems) || [];
    var names = pending
      .slice(0, 3)
      .map(function (item) {
        return item && item.text ? String(item.text) : '';
      })
      .filter(Boolean);
    var count = (mismatch && mismatch.pendingCount) || names.length || 0;
    var listHint =
      mismatch && mismatch.listName
        ? ' (\u00ab\u00a0' + mismatch.listName + '\u00a0\u00bb)'
        : '';
    var taskHint = '';
    if (names.length === 1) {
      taskHint = ' (\u00ab\u00a0' + names[0] + '\u00a0\u00bb)';
    } else if (names.length > 1) {
      taskHint =
        ' (\u00ab\u00a0' +
        names.join('\u00a0\u00bb, \u00ab\u00a0') +
        (count > names.length ? '\u00a0\u00bb\u2026' : '\u00a0\u00bb') +
        ')';
    }
    var reopen = preferReopenStatutCategory(statut);
    return {
      kind: 'done_pending_tasks',
      message:
        'Le statut est Termin\u00e9' +
        listHint +
        ', mais il reste ' +
        (count === 1 ? 'une sous-t\u00e2che' : count + ' sous-t\u00e2ches') +
        ' en cours' +
        taskHint +
        '. Ces t\u00e2ches sont-elles obsol\u00e8tes, ou le statut Termin\u00e9 est-il incorrect?',
      suggestions: [
        'T\u00e2ches obsol\u00e8tes',
        'Statut incorrect',
        'Ignorer pour l\'instant'
      ],
      followUps: [
        {
          label: 'Marquer les t\u00e2ches obsol\u00e8tes termin\u00e9es',
          actions: [{ tool: 'complete_all_subtasks', args: {} }]
        },
        {
          label: 'Sortir du statut Termin\u00e9',
          actions: [{ tool: 'set_statut', args: { category: reopen } }]
        }
      ],
      mismatch: mismatch || null
    };
  }

  var MAX_DREAM_DESC_LEN = 900;
  var MAX_DREAM_HISTORY_CHARS = 1200;

  function normalizeDescForCompare(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function buildDreamHistoryExcerpt(history) {
    var list = Array.isArray(history) ? history : [];
    var chunks = [];
    var budget = MAX_DREAM_HISTORY_CHARS;
    for (var i = list.length - 1; i >= 0 && budget > 0; i--) {
      var entry = list[i];
      if (!entry || (entry.role !== 'user' && entry.role !== 'assistant')) continue;
      var content = String(entry.content || '').trim();
      if (!content) continue;
      if (/^\[Auto-revue\b/i.test(content) || /^\[R[eê]ve\b/i.test(content)) continue;
      var line =
        (entry.role === 'user' ? 'U: ' : 'A: ') +
        content.replace(/\s+/g, ' ').slice(0, 280);
      if (line.length > budget) line = line.slice(0, budget);
      chunks.unshift(line);
      budget -= line.length + 1;
    }
    return chunks.join('\n');
  }

  /**
   * True when Description looks like the old verbose structured brief
   * (## Pourquoi / Livrable / Qui / …) that Dream used to emit.
   */
  function isVerboseStructuredDesc(desc) {
    var t = String(desc || '');
    if (t.length < 120) return false;
    var hits = 0;
    if (/#{1,3}\s*Pourquoi\b/i.test(t)) hits++;
    if (/#{1,3}\s*Livrable\b/i.test(t) || /#{1,3}\s*But\b/i.test(t)) hits++;
    if (/#{1,3}\s*Qui\b/i.test(t)) hits++;
    if (/#{1,3}\s*Contraintes?\b/i.test(t)) hits++;
    if (/#{1,3}\s*D[e\u00e9]j[a\u00e0]\s*fait\b/i.test(t)) hits++;
    if (/#{1,3}\s*Reste\b/i.test(t)) hits++;
    return hits >= 2;
  }

  var MAX_STATUS_BRIEF_LEN = 140;
  var MAX_STATUS_BRIEF_DESC_LEN = 160;

  function firstNameFromFullName(fullName) {
    var s = String(fullName || '').trim();
    if (!s) return '';
    var part = s.split(/\s+/)[0] || '';
    return part.length > 24 ? part.slice(0, 24) : part;
  }

  function truncateStatusBriefLabel(text, maxLen) {
    var s = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    var lim = maxLen || 60;
    if (s.length <= lim) return s;
    return s.slice(0, lim - 1).replace(/[,:;\-–—\s]+$/, '') + '\u2026';
  }

  /** Short plain excerpt of the card description for the status brief. */
  function excerptStatusBriefDesc(desc) {
    var s = String(desc || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/#{1,6}\s+/g, '')
      .replace(/[*_`>~]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return truncateStatusBriefLabel(s, MAX_STATUS_BRIEF_DESC_LEN);
  }

  /**
   * Prefer concrete open leaf work; fall back to open parents.
   * Walks nested checklist items (items/children).
   */
  function collectStatusBriefNextOpenItems(items, max) {
    var out = [];
    var limit = max || 2;
    function itemText(it) {
      if (!it || typeof it !== 'object') return '';
      if (typeof it.text === 'string') return it.text.trim();
      if (typeof it.name === 'string') return it.name.trim();
      return '';
    }
    function kidsOf(it) {
      if (!it || typeof it !== 'object') return null;
      if (Array.isArray(it.items) && it.items.length) return it.items;
      if (Array.isArray(it.children) && it.children.length) return it.children;
      return null;
    }
    function hasOpenKid(kids) {
      if (!kids) return false;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] && !kids[i].done) return true;
      }
      return false;
    }
    function walk(list) {
      if (!Array.isArray(list) || out.length >= limit) return;
      for (var i = 0; i < list.length && out.length < limit; i++) {
        var it = list[i];
        if (!it || typeof it !== 'object' || it.done) continue;
        var kids = kidsOf(it);
        if (hasOpenKid(kids)) {
          walk(kids);
          continue;
        }
        var text = truncateStatusBriefLabel(itemText(it), 60);
        if (text) out.push(text);
      }
    }
    walk(items);
    return out;
  }

  /**
   * Compact facts for the Overview "what's going on" sentence
   * (boss-style status brief).
   */
  function buildStatusBriefSnapshot(context) {
    var due = context && context.due;
    var progress = context && context.progress;
    var blocked = context && context.blocked;
    var statut = context && context.statut;
    var priority = context && context.priority;
    var display = context && context.display;
    var ownership = context && context.ownership;

    var category =
      statut && typeof statut.category === 'string' ? statut.category : '';
    var listName =
      statut && typeof statut.listName === 'string' ? statut.listName : '';
    var stuck = !!(
      (blocked && blocked.enabled) ||
      category === 'blocked' ||
      (progress && progress.blocked)
    );
    var reasons = [];
    if (blocked && blocked.enabled && Array.isArray(blocked.blockedReasons)) {
      reasons = blocked.blockedReasons
        .map(function (r) {
          return typeof r === 'string' ? r.trim() : '';
        })
        .filter(Boolean)
        .slice(0, 2);
    } else if (
      progress &&
      progress.blocked &&
      Array.isArray(progress.blockedReasons)
    ) {
      reasons = progress.blockedReasons
        .map(function (r) {
          return typeof r === 'string' ? r.trim() : '';
        })
        .filter(Boolean)
        .slice(0, 2);
    }

    var percent = null;
    if (progress) {
      if (typeof progress.percent === 'number' && isFinite(progress.percent)) {
        percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
      } else if (
        typeof progress.cardProgress === 'number' &&
        isFinite(progress.cardProgress)
      ) {
        percent = Math.max(0, Math.min(100, Math.round(progress.cardProgress)));
      }
    }
    var doneCount =
      progress && typeof progress.doneCount === 'number'
        ? progress.doneCount
        : 0;
    var totalCount =
      progress && typeof progress.totalCount === 'number'
        ? progress.totalCount
        : Array.isArray(progress && progress.items)
          ? progress.items.length
          : 0;
    var remainingMinutes =
      progress &&
      typeof progress.estimatedRemainingMinutes === 'number' &&
      isFinite(progress.estimatedRemainingMinutes)
        ? progress.estimatedRemainingMinutes
        : null;

    var nextOpenItems = collectStatusBriefNextOpenItems(
      progress && Array.isArray(progress.items) ? progress.items : [],
      2
    );

    var dueEnabled = !(due && due.enabled === false);
    var dueDate = due && due.dueDate ? String(due.dueDate) : '';
    var dueTime =
      dueEnabled && due && typeof due.dueTime === 'string' && due.dueTime
        ? String(due.dueTime).trim()
        : '';
    if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) dueTime = '';
    var dueMissing = dueEnabled && !dueDate;
    var duePast = !!(display && display.duePast);
    var dueCountdown =
      display && typeof display.dueCountdown === 'string'
        ? display.dueCountdown
        : '';
    // Match PriorityUI soon band (≤14 days): worth naming timing in the brief.
    var today = (context && context.today) || todayIsoLocal();
    var daysUntil = dueDate ? daysBetweenIsoLocal(today, dueDate) : NaN;
    var dueSoon =
      !dueMissing &&
      !duePast &&
      isFinite(daysUntil) &&
      daysUntil >= 0 &&
      daysUntil <= 14;

    var ease =
      priority && priority.enabled !== false && priority.ease != null
        ? clampInt(priority.ease, 1, 5, 3)
        : null;
    var tier =
      (display && (display.label || display.tier)) ||
      (priority && priority.labels && priority.labels.urgency) ||
      '';

    // French-only scale keys (never "quick"/"project" — those leak into LLM copy).
    var scale = 'moyen';
    if (
      (ease != null && ease >= 4 && totalCount <= 2 && (remainingMinutes == null || remainingMinutes < 60)) ||
      (totalCount <= 1 && (remainingMinutes == null || remainingMinutes < 45) && (ease == null || ease >= 3))
    ) {
      scale = 'petit';
    }
    if (
      totalCount >= 5 ||
      (remainingMinutes != null && remainingMinutes >= 240) ||
      (ease != null && ease <= 2 && totalCount >= 3)
    ) {
      scale = 'gros';
    }

    var phase = 'idle';
    if (category === 'completed' || (percent != null && percent >= 100)) {
      phase = 'done';
    } else if (stuck) {
      phase = 'stuck';
    } else if (
      category === 'started' ||
      (percent != null && percent > 0) ||
      doneCount > 0
    ) {
      phase = 'in_progress';
    } else if (category === 'todo' || category === 'backlog' || !category) {
      phase = 'not_started';
    }

    var members = ownership && Array.isArray(ownership.members)
      ? ownership.members
      : [];
    var youId =
      ownership && ownership.you && ownership.you.id
        ? String(ownership.you.id)
        : '';
    var youAssigned = !!(ownership && ownership.youAssigned);
    var unassigned = members.length === 0;
    if (ownership && typeof ownership.unassigned === 'boolean') {
      unassigned = ownership.unassigned;
    }

    var otherNames = members
      .filter(function (m) {
        return !youId || m.id !== youId;
      })
      .map(function (m) {
        return firstNameFromFullName(m.fullName || m.username);
      })
      .filter(Boolean)
      .slice(0, 3);

    var cardName =
      context && context.cardName
        ? truncateStatusBriefLabel(String(context.cardName), 72)
        : '';
    var cardDesc = excerptStatusBriefDesc(
      context && context.cardDesc ? context.cardDesc : ''
    );

    return {
      cardName: cardName,
      cardDesc: cardDesc,
      phase: phase,
      stuck: stuck,
      statutCategory: category || null,
      statutListName: listName || null,
      blockedReasons: reasons,
      progressPercent: percent,
      subtasksDone: doneCount,
      subtasksTotal: totalCount,
      subtasksOpen: Math.max(0, totalCount - doneCount),
      nextOpenItems: nextOpenItems,
      estimatedRemainingMinutes: remainingMinutes,
      dueMissing: dueMissing,
      duePast: duePast,
      dueSoon: dueSoon,
      dueCountdown: dueCountdown || null,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      priorityTier: typeof tier === 'string' ? tier : '',
      ease: ease,
      scale: scale,
      youAssigned: youAssigned,
      unassigned: unassigned,
      otherNames: otherNames,
      assigneeCount: members.length
    };
  }

  function fingerprintStatusBriefSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    try {
      return JSON.stringify({
        v: 3,
        cardName: snapshot.cardName || '',
        cardDesc: snapshot.cardDesc || '',
        phase: snapshot.phase,
        stuck: !!snapshot.stuck,
        statutCategory: snapshot.statutCategory || null,
        blockedReasons: snapshot.blockedReasons || [],
        progressPercent: snapshot.progressPercent,
        subtasksDone: snapshot.subtasksDone,
        subtasksTotal: snapshot.subtasksTotal,
        subtasksOpen: snapshot.subtasksOpen,
        nextOpenItems: snapshot.nextOpenItems || [],
        estimatedRemainingMinutes: snapshot.estimatedRemainingMinutes,
        dueMissing: !!snapshot.dueMissing,
        duePast: !!snapshot.duePast,
        dueSoon: !!snapshot.dueSoon,
        dueCountdown: snapshot.dueCountdown || null,
        dueDate: snapshot.dueDate || null,
        dueTime: snapshot.dueTime || null,
        priorityTier: snapshot.priorityTier || '',
        ease: snapshot.ease,
        scale: snapshot.scale,
        youAssigned: !!snapshot.youAssigned,
        unassigned: !!snapshot.unassigned,
        otherNames: snapshot.otherNames || [],
        assigneeCount: snapshot.assigneeCount || 0
      });
    } catch (e) {
      return '';
    }
  }

  function clampStatusBriefSentence(text) {
    var s = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    if (s.length <= MAX_STATUS_BRIEF_LEN) return s;
    var cut = s.slice(0, MAX_STATUS_BRIEF_LEN - 1);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 80) cut = cut.slice(0, lastSpace);
    return cut.replace(/[,:;.\-–—\s]+$/, '') + '\u2026';
  }

  function normalizeStatusBriefScale(scale) {
    var s = String(scale || '').toLowerCase();
    if (s === 'petit' || s === 'quick') return 'petit';
    if (s === 'gros' || s === 'project') return 'gros';
    return 'moyen';
  }

  /** Compact French clock for status brief (e.g. "14 h", "14 h 30"). */
  function formatStatusBriefDueTime(time) {
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.formatDueTimeCompactFr === 'function'
    ) {
      return PriorityUI.formatDueTimeCompactFr(time) || '';
    }
    var s = String(time || '').trim();
    if (!/^\d{2}:\d{2}$/.test(s)) return '';
    var parts = s.split(':');
    var hours = +parts[0];
    var minutes = +parts[1];
    if (!isFinite(hours) || !isFinite(minutes)) return '';
    if (minutes === 0) return String(hours) + ' h';
    return (
      String(hours) +
      ' h ' +
      (minutes < 10 ? '0' + minutes : String(minutes))
    );
  }

  /**
   * Due clause for the brief: missing / late / soon timing (+ clock when set).
   * Far-away dues stay silent so the sentence keeps focusing on work.
   */
  function formatStatusBriefDueGap(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    if (snapshot.duePast) return 'en retard';
    if (snapshot.dueMissing) return 'pas d\'\u00e9ch\u00e9ance';
    if (!snapshot.dueSoon) return '';

    var when = '';
    if (typeof snapshot.dueCountdown === 'string' && snapshot.dueCountdown) {
      when = snapshot.dueCountdown.replace(/\s+/g, ' ').trim();
      if (when) {
        when = when.charAt(0).toLocaleLowerCase('fr-FR') + when.slice(1);
      }
    }
    var clock = formatStatusBriefDueTime(snapshot.dueTime);
    var countdownHasClock = /\b(h|heure|heures|minute|minutes)\b/i.test(when);

    if (when && clock && !countdownHasClock) {
      return when + ' \u00e0 ' + clock;
    }
    if (when) return when;
    if (clock) return '\u00e0 ' + clock;
    return '';
  }

  /**
   * Deterministic French boss-style status sentence when AI is unavailable.
   * Substance first: next work / card topic / blocker / owner / due gap.
   * Never empty scale fluff (« petit reste à finir »).
   */
  function buildHeuristicStatusBrief(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    var you = !!snapshot.youAssigned;
    var unassigned = !!snapshot.unassigned;
    var other =
      Array.isArray(snapshot.otherNames) && snapshot.otherNames.length
        ? snapshot.otherNames[0]
        : '';
    var reason =
      Array.isArray(snapshot.blockedReasons) && snapshot.blockedReasons[0]
        ? String(snapshot.blockedReasons[0]).trim()
        : '';
    if (reason.length > 48) reason = reason.slice(0, 45) + '\u2026';
    var scale = normalizeStatusBriefScale(snapshot.scale);
    var next =
      Array.isArray(snapshot.nextOpenItems) && snapshot.nextOpenItems[0]
        ? String(snapshot.nextOpenItems[0]).trim()
        : '';
    if (next.length > 52) next = next.slice(0, 49) + '\u2026';
    var open =
      snapshot.subtasksOpen != null && isFinite(+snapshot.subtasksOpen)
        ? Math.max(0, Math.round(+snapshot.subtasksOpen))
        : null;
    var topic = truncateStatusBriefLabel(snapshot.cardName || '', 42);
    var descHint = truncateStatusBriefLabel(snapshot.cardDesc || '', 48);

    var who = you
      ? '\u00c0 toi'
      : unassigned
        ? 'Personne assign\u00e9'
        : other
          ? 'Chez ' + other
          : 'En cours';

    var dueGap = formatStatusBriefDueGap(snapshot);

    var sentence = '';
    if (snapshot.phase === 'done') {
      sentence = you
        ? 'Termin\u00e9 de ton c\u00f4t\u00e9' +
          (topic ? ' (\u00ab\u00a0' + topic + '\u00a0\u00bb)' : '') +
          '.'
        : 'Marqu\u00e9 termin\u00e9' + (other ? ' (chez ' + other + ')' : '') + '.';
    } else if (snapshot.stuck || snapshot.phase === 'stuck') {
      if (you) {
        sentence = reason
          ? '\u00c0 toi \u2014 bloqu\u00e9\u00a0: ' + reason + '.'
          : '\u00c0 toi \u2014 bloqu\u00e9, cause pas claire.';
      } else if (other) {
        sentence = reason
          ? 'Chez ' + other + ' \u2014 bloqu\u00e9\u00a0: ' + reason + '.'
          : 'Chez ' + other + ' \u2014 bloqu\u00e9.';
      } else if (unassigned) {
        sentence = reason
          ? 'Bloqu\u00e9 sans assign\u00e9 \u2014 ' + reason + '.'
          : 'Bloqu\u00e9 et personne n\'est assign\u00e9.';
      } else {
        sentence = reason ? 'Bloqu\u00e9\u00a0: ' + reason + '.' : 'Bloqu\u00e9.';
      }
    } else if (snapshot.phase === 'in_progress') {
      var workBit = '';
      if (next) {
        workBit = 'prochaine\u00a0: ' + next;
      } else if (topic) {
        workBit =
          scale === 'petit'
            ? 'petit fix \u00ab\u00a0' + topic + '\u00a0\u00bb encore ouvert'
            : scale === 'gros'
              ? 'gros chantier \u00ab\u00a0' + topic + '\u00a0\u00bb encore ouvert'
              : '\u00ab\u00a0' + topic + '\u00a0\u00bb encore ouvert';
      } else if (descHint) {
        workBit = 'encore ouvert\u00a0: ' + descHint;
      } else if (open != null && open > 0) {
        workBit =
          open === 1
            ? '1 sous-t\u00e2che restante'
            : open + ' sous-t\u00e2ches restantes';
      } else if (scale === 'gros') {
        workBit = 'gros chantier encore ouvert';
      } else {
        workBit = 'encore en cours, d\u00e9tail flou';
      }
      sentence = who + ' \u2014 ' + workBit;
      if (dueGap) sentence += ' ; ' + dueGap;
      sentence += '.';
    } else {
      // not_started / idle
      if (you) {
        if (dueGap === 'pas d\'\u00e9ch\u00e9ance') {
          sentence =
            '\u00c0 toi \u2014 pas commenc\u00e9' +
            (topic ? ' sur \u00ab\u00a0' + topic + '\u00a0\u00bb' : '') +
            ', et pas d\'\u00e9ch\u00e9ance.';
        } else if (dueGap === 'en retard') {
          sentence =
            '\u00c0 toi \u2014 pas commenc\u00e9' +
            (topic ? ' sur \u00ab\u00a0' + topic + '\u00a0\u00bb' : '') +
            ' et d\u00e9j\u00e0 en retard.';
        } else if (dueGap) {
          sentence =
            '\u00c0 toi \u2014 pas commenc\u00e9' +
            (topic ? ' sur \u00ab\u00a0' + topic + '\u00a0\u00bb' : '') +
            ' ; ' +
            dueGap +
            '.';
        } else if (next) {
          sentence =
            '\u00c0 toi \u2014 pas commenc\u00e9 ; premi\u00e8re \u00e9tape\u00a0: ' +
            next +
            '.';
        } else if (topic && scale === 'petit') {
          sentence =
            '\u00c0 toi \u2014 petit fix \u00ab\u00a0' +
            topic +
            '\u00a0\u00bb pas encore commenc\u00e9.';
        } else if (topic && scale === 'gros') {
          sentence =
            '\u00c0 toi \u2014 gros chantier \u00ab\u00a0' +
            topic +
            '\u00a0\u00bb pas encore lanc\u00e9.';
        } else if (topic) {
          sentence =
            '\u00c0 toi \u2014 \u00ab\u00a0' +
            topic +
            '\u00a0\u00bb pas encore commenc\u00e9.';
        } else if (scale === 'petit') {
          sentence = '\u00c0 toi \u2014 petit fix pas encore commenc\u00e9.';
        } else if (scale === 'gros') {
          sentence = '\u00c0 toi \u2014 gros chantier pas encore lanc\u00e9.';
        } else {
          sentence = '\u00c0 toi \u2014 pas encore commenc\u00e9.';
        }
      } else if (other) {
        sentence =
          'Chez ' +
          other +
          ' \u2014 pas commenc\u00e9' +
          (topic ? ' sur \u00ab\u00a0' + topic + '\u00a0\u00bb' : '') +
          (dueGap ? ' ; ' + dueGap : '') +
          '.';
      } else if (unassigned) {
        sentence = dueGap
          ? 'Personne assign\u00e9, ' + dueGap + ' \u2014 \u00e7a dort.'
          : 'Personne assign\u00e9 \u2014 pas commenc\u00e9.';
      } else {
        sentence =
          'Pas commenc\u00e9' + (dueGap ? ' ; ' + dueGap : '') + '.';
      }
    }

    return clampStatusBriefSentence(sentence);
  }

  /** Reject empty / glaze / English-scale AI sentences; fall back to heuristic. */
  function isVacuousStatusBrief(sentence) {
    var s = String(sentence || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!s) return true;
    if (
      /petit reste\s*[àa]\s*finir|travail encore ouvert|encore en cours, d[eé]tail flou/.test(
        s
      )
    ) {
      return true;
    }
    if (
      /\b(quick|project|stuck|medium|status)\b/.test(s) ||
      /(?:^|[^\wàâäéèêëïîôùûüç])(?:quick|project)\b/.test(s)
    ) {
      return true;
    }
    if (
      /devrait aller vite|t['']inqui[eè]te|tu g[eè]res|bien avanc|glaze|bravo/.test(
        s
      )
    ) {
      return true;
    }
    if (
      /c['']est en cours de ton c[oô]t[eé]|avanc[eé]\s*[àa]\s*\d+\s*%/.test(s)
    ) {
      return true;
    }
    // Pure owner + due with no work noun: « À toi — demain. »
    if (/^(?:à toi|chez \w+|personne assign[eé])\s*[—\-–]\s*[^.]{0,28}\.?$/.test(s)) {
      if (
        !/prochaine|bloqu|sous-t|fix|chantier|pas commenc|termin|\u00ab/.test(s) &&
        !/[a-zàâäéèêëïîôùûüç]{4,}/.test(
          s.replace(
            /à toi|chez \w+|personne assigné|demain|aujourd.?hui|en retard|pas d.?échéance|à \d+|h\b|\d+/gi,
            ''
          )
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * AI Overview status brief: one boss-style sentence about what's going on.
   * Returns { ok, skipped?, reason?, sentence?, usage?, debug }.
   */
  async function cardStatusBriefTurn(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var context = options.context || buildContext(bridge);
    var snapshot =
      options.snapshot || buildStatusBriefSnapshot(context);
    var heuristic = buildHeuristicStatusBrief(snapshot);

    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      return {
        ok: true,
        skipped: true,
        reason: 'not-configured',
        sentence: heuristic,
        source: 'heuristic'
      };
    }

    var messages = [
      {
        role: 'system',
        content: [
          'Tu r\u00e9diges UNE phrase de statut pour le r\u00e9sum\u00e9 d\'une carte Trello (Power-Up Cerveau).',
          profileLanguageInstruction(context && context.profile),
          'Le boss r\u00e9pond \u00e0\u00a0: \u00ab\u00a0Hey, \u00e0 propos de cette t\u00e2che\u2026 qu\'est-ce qui se passe\u00a0?\u00a0\u00bb',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"sentence":"\u2026"}',
          'R\u00e8gles\u00a0:',
          '- Une seule phrase, ton sec et factuel (manager press\u00e9), dans la langue/dialecte ci-dessus.',
          '- Max ~' + MAX_STATUS_BRIEF_LEN + ' caract\u00e8res.',
          '- SUBSTANCE OBLIGATOIRE\u00a0: nomme LE TRAVAIL concret (cardName, cardDesc, ou nextOpenItems) + qui porte + le fait utile (prochaine \u00e9tape, motif de blocage, \u00e9ch\u00e9ance manquante/retard).',
          '- Si nextOpenItems non vide\u00a0: cite la prochaine \u00e9tape. Sinon\u00a0: ancre la phrase sur cardName (et cardDesc si \u00e7a pr\u00e9cise).',
          '- scale (petit|moyen|gros) = adjectif seulement, JAMAIS le sujet. Interdit de r\u00e9pondre seulement avec la taille.',
          '- Si dueSoon=true\u00a0: mentionne le timing (dueCountdown) et l\'heure (dueTime) si elle est d\u00e9finie \u2014 ex. \u00ab\u00a0demain \u00e0 14 h\u00a0\u00bb. Si dueSoon=false et pas dueMissing/duePast\u00a0: ne parle PAS de l\'\u00e9ch\u00e9ance.',
          '- INTERDIT d\'encourager / flatter / rassurer\u00a0: pas de \u00ab\u00a0\u00e7a devrait aller vite\u00a0\u00bb, \u00ab\u00a0bien avanc\u00e9\u00a0\u00bb, \u00ab\u00a0t\'inqui\u00e8te\u00a0\u00bb, \u00ab\u00a0tu g\u00e8res\u00a0\u00bb.',
          '- INTERDIT les mots anglais dans une r\u00e9ponse fran\u00e7aise (quick, project, stuck, medium, status\u2026).',
          '- INTERDIT de citer le % de progr\u00e8s (d\u00e9j\u00e0 visible dans l\'UI).',
          '- INTERDIT les phrases vides\u00a0: \u00ab\u00a0petit reste \u00e0 finir\u00a0\u00bb, \u00ab\u00a0travail encore ouvert\u00a0\u00bb, \u00ab\u00a0c\'est en cours de ton c\u00f4t\u00e9\u00a0\u00bb, \u00ab\u00a0\u00c0 toi \u2014 demain\u00a0\u00bb sans dire QUOI.',
          '- N\'invente rien\u00a0: seulement le snapshot. Pas de pr\u00e9noms hors otherNames.',
          '- Ex. BON\u00a0: "\u00c0 toi \u2014 prochaine\u00a0: finaliser le montage ; pas d\'\u00e9ch\u00e9ance."',
          '- Ex. BON\u00a0: "\u00c0 toi \u2014 prochaine\u00a0: finaliser le montage ; demain \u00e0 14 h."',
          '- Ex. BON\u00a0: "\u00c0 toi \u2014 \u00ab\u00a0Fix login SSO\u00a0\u00bb encore ouvert ; demain."',
          '- Ex. BON\u00a0: "Chez Sam \u2014 bloqu\u00e9\u00a0: attente API."',
          '- Ex. MAUVAIS\u00a0: "\u00c0 toi \u2014 petit reste \u00e0 finir ; demain."',
          '- Ex. MAUVAIS\u00a0: "C\'est en cours de ton c\u00f4t\u00e9, avanc\u00e9 \u00e0 31\u00a0% ; c\'est un quick, donc \u00e7a devrait aller vite."',
          'Snapshot\u00a0:',
          JSON.stringify(snapshot)
        ].join('\n')
      },
      {
        role: 'user',
        content:
          'Donne la phrase de statut (JSON {"sentence":"\u2026"}). Ancre-toi sur le travail r\u00e9el du snapshot (titre / desc / prochaine \u00e9tape). Heuristique de secours\u00a0: ' +
          heuristic
      }
    ];

    var debug = {
      id: 'status-brief-' + Date.now().toString(36),
      kind: 'cardStatusBriefTurn',
      label: 'R\u00e9sum\u00e9 statut (overview)',
      startedAt: Date.now(),
      attempts: []
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('cardStatusBriefTurn onDebug failed', cbErr);
      }
    }

    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 120,
          temperature: 0.35
        });
        if (response.meta) {
          debug.attempts.push(Object.assign({ label: 'json' }, response.meta));
        }
      } catch (err) {
        if (err && err.debugMeta) {
          debug.attempts.push(Object.assign({ label: 'json' }, err.debugMeta));
        }
        if (
          err &&
          err.message &&
          /response_format|json_object|json mode/i.test(err.message)
        ) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 120,
            temperature: 0.35
          });
          if (response.meta) {
            debug.attempts.push(
              Object.assign({ label: 'sans json mode' }, response.meta)
            );
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
      debug.request = debug.attempts.length
        ? debug.attempts[debug.attempts.length - 1]
        : null;
      emitDebug();
      return {
        ok: true,
        skipped: false,
        reason: 'llm-error',
        sentence: heuristic,
        source: 'heuristic',
        error: debug.error,
        debug: debug
      };
    }

    var data = null;
    try {
      var text = typeof response.content === 'string' ? response.content.trim() : '';
      var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) text = fence[1].trim();
      var start = text.indexOf('{');
      var end = text.lastIndexOf('}');
      if (start >= 0 && end > start) text = text.slice(start, end + 1);
      data = JSON.parse(text);
    } catch (parseErr) {
      data = null;
    }

    var usage = extractUsageFromRaw(response.raw, messages, response.content, p.model);
    usage.latencyMs = Date.now() - t0;
    debug.endedAt = Date.now();
    debug.latencyMs = usage.latencyMs;
    debug.ok = true;
    debug.request =
      response.meta ||
      (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response.meta && response.meta.status,
      content: response.content,
      raw: cloneJsonSafe(response.raw),
      parsed: data
    };
    debug.usage = usage;
    emitDebug();

    var aiSentence =
      data && typeof data.sentence === 'string'
        ? clampStatusBriefSentence(data.sentence)
        : '';
    if (!aiSentence || isVacuousStatusBrief(aiSentence)) {
      return {
        ok: true,
        skipped: true,
        reason: !aiSentence ? 'empty-sentence' : 'vacuous-sentence',
        sentence: heuristic,
        source: 'heuristic',
        usage: usage,
        debug: debug
      };
    }

    return {
      ok: true,
      skipped: false,
      sentence: aiSentence,
      source: 'ai',
      usage: usage,
      debug: debug
    };
  }

  var MAX_PROGRESS_SUMMARY_LEN = 120;

  function truncateProgressLabel(text, maxLen) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    var lim = maxLen || 48;
    if (s.length <= lim) return s;
    return s.slice(0, lim - 1).replace(/[,:;\-–—\s]+$/, '') + '\u2026';
  }

  /**
   * Map a progress item (local checklist or linked-tree child) into a compact
   * outline node for the Progrès tab AI summary.
   */
  function mapProgressOutlineNode(raw, depth) {
    if (!raw || typeof raw !== 'object') return null;
    var text =
      typeof raw.text === 'string'
        ? raw.text.trim()
        : typeof raw.name === 'string'
          ? raw.name.trim()
          : '';
    if (!text) return null;
    var node = {
      text: truncateProgressLabel(text, depth > 1 ? 40 : 56),
      done: !!raw.done
    };
    if (raw.linkedCardId || raw.linked) node.linked = true;
    var kids = [];
    var sourceKids = Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.children)
        ? raw.children
        : null;
    if (sourceKids && sourceKids.length && depth < 3) {
      for (var i = 0; i < sourceKids.length; i++) {
        var child = mapProgressOutlineNode(sourceKids[i], depth + 1);
        if (child) kids.push(child);
        if (kids.length >= 8) break;
      }
    }
    if (kids.length) node.children = kids;
    return node;
  }

  /**
   * Merge local checklists with resolved linked-card children for one subtask.
   */
  function outlineChildrenForItem(item, linkedNode) {
    var kids = [];
    var seen = Object.create(null);
    function pushKid(raw) {
      var node = mapProgressOutlineNode(raw, 2);
      if (!node) return;
      var key = node.text.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      kids.push(node);
    }
    if (item && Array.isArray(item.items)) {
      item.items.forEach(pushKid);
    }
    if (linkedNode && Array.isArray(linkedNode.children)) {
      linkedNode.children.forEach(pushKid);
    }
    return kids.slice(0, 8);
  }

  /**
   * Unique Motifs for the Progrès summary when the card / a task is blocked.
   * Prefer card-level causes, then master progress, then item Motifs.
   */
  function collectProgressSummaryBlockedReasons(context, progress, items) {
    var reasons = [];
    var seen = Object.create(null);
    function pushAll(list) {
      if (!Array.isArray(list)) return;
      for (var i = 0; i < list.length; i++) {
        var reason = typeof list[i] === 'string' ? list[i].trim() : '';
        if (!reason) continue;
        var key = reason.toLowerCase();
        if (seen[key]) continue;
        seen[key] = true;
        reasons.push(reason);
      }
    }
    var blocked = context && context.blocked;
    if (blocked && blocked.enabled) pushAll(blocked.blockedReasons);
    if (progress && progress.blocked) pushAll(progress.blockedReasons);
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      if (!item || item.done || !item.blocked) continue;
      pushAll(item.blockedReasons);
    }
    return reasons.slice(0, 4);
  }

  function isProgressSummaryStuck(context, progress, items) {
    var blocked = context && context.blocked;
    if (blocked && blocked.enabled) return true;
    if (progress && progress.blocked) return true;
    if (progress && progress.hasBlockedSubtasks) return true;
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].blocked && !items[i].done) return true;
    }
    return false;
  }

  /**
   * Compact hierarchy for the Progrès collapsed-summary sentence.
   * options.linkedTreeByItemId: optional map from completion-ui linked resolve.
   */
  function buildProgressSummarySnapshot(context, options) {
    options = options || {};
    var progress = context && context.progress;
    var linkedTreeByItemId =
      options.linkedTreeByItemId && typeof options.linkedTreeByItemId === 'object'
        ? options.linkedTreeByItemId
        : null;

    var percent = null;
    if (progress) {
      if (typeof progress.percent === 'number' && isFinite(progress.percent)) {
        percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
      } else if (
        typeof progress.cardProgress === 'number' &&
        isFinite(progress.cardProgress)
      ) {
        percent = Math.max(0, Math.min(100, Math.round(progress.cardProgress)));
      }
    }

    var items = progress && Array.isArray(progress.items) ? progress.items : [];
    var outline = [];
    var openLabels = [];
    var doneCount = 0;
    var totalCount = 0;

    function walkCount(node) {
      if (!node) return;
      totalCount += 1;
      if (node.done) doneCount += 1;
      else if (node.text) openLabels.push(node.text);
      if (Array.isArray(node.children)) {
        node.children.forEach(walkCount);
      }
    }

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || typeof item !== 'object') continue;
      var text = typeof item.text === 'string' ? item.text.trim() : '';
      if (!text) continue;
      var linkedNode =
        linkedTreeByItemId && item.id != null
          ? linkedTreeByItemId[item.id] || linkedTreeByItemId[String(item.id)]
          : null;
      var node = {
        text: truncateProgressLabel(text, 56),
        done: !!item.done
      };
      if (item.linkedCardId || (linkedNode && linkedNode.linkedCardId)) {
        node.linked = true;
      }
      if (item.blocked) node.blocked = true;
      var kids = outlineChildrenForItem(item, linkedNode);
      if (kids.length) node.children = kids;
      outline.push(node);
      walkCount(node);
      if (outline.length >= 12) break;
    }

    // Prefer hierarchy walk counts; fall back to progress meta when empty.
    if (!totalCount && progress) {
      doneCount =
        typeof progress.doneCount === 'number' ? progress.doneCount : 0;
      totalCount =
        typeof progress.totalCount === 'number'
          ? progress.totalCount
          : items.length;
    }

    var openCount = Math.max(0, totalCount - doneCount);
    var stuck = isProgressSummaryStuck(context, progress, items);
    var blockedReasons = stuck
      ? collectProgressSummaryBlockedReasons(context, progress, items)
      : [];
    var phase = 'idle';
    if (percent != null && percent >= 100) phase = 'done';
    else if (totalCount > 0 && openCount <= 0) phase = 'done';
    else if (stuck) phase = 'blocked';
    else if ((percent != null && percent > 0) || doneCount > 0) {
      phase = 'in_progress';
    } else if (totalCount > 0) {
      phase = 'not_started';
    }

    return {
      cardName: context && context.cardName ? String(context.cardName) : '',
      phase: phase,
      stuck: stuck,
      blockedReasons: blockedReasons,
      progressPercent: percent,
      tasksDone: doneCount,
      tasksTotal: totalCount,
      tasksOpen: openCount,
      openLabels: openLabels.slice(0, 6),
      outline: outline
    };
  }

  function fingerprintProgressSummarySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    try {
      return JSON.stringify({
        v: 2,
        phase: snapshot.phase,
        stuck: !!snapshot.stuck,
        blockedReasons: snapshot.blockedReasons || [],
        progressPercent: snapshot.progressPercent,
        tasksDone: snapshot.tasksDone,
        tasksTotal: snapshot.tasksTotal,
        tasksOpen: snapshot.tasksOpen,
        openLabels: snapshot.openLabels || [],
        outline: snapshot.outline || []
      });
    } catch (e) {
      return '';
    }
  }

  function clampProgressSummarySentence(text) {
    var s = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    if (s.length <= MAX_PROGRESS_SUMMARY_LEN) return s;
    var cut = s.slice(0, MAX_PROGRESS_SUMMARY_LEN - 1);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 60) cut = cut.slice(0, lastSpace);
    return cut.replace(/[,:;.\-–—\s]+$/, '') + '\u2026';
  }

  /**
   * Deterministic Progrès summary when AI is unavailable.
   * Prefer a short synthesis of open task names over bare counts.
   * When blocked: show Motifs (block reasons), never the remaining task list.
   */
  function buildHeuristicProgressSummary(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    var open = snapshot.tasksOpen;
    var total = snapshot.tasksTotal;
    var labels = Array.isArray(snapshot.openLabels)
      ? snapshot.openLabels.filter(Boolean)
      : [];

    if (snapshot.stuck || snapshot.phase === 'blocked') {
      var reasons = Array.isArray(snapshot.blockedReasons)
        ? snapshot.blockedReasons.filter(Boolean)
        : [];
      if (!reasons.length) return 'Bloqu\u00e9';
      if (reasons.length === 1) {
        return clampProgressSummarySentence(reasons[0]);
      }
      var joined = reasons.join(', ');
      if (joined.length <= 42) return clampProgressSummarySentence(joined);
      return clampProgressSummarySentence(
        reasons[0] + ' +' + (reasons.length - 1)
      );
    }

    if (!total) {
      if (snapshot.phase === 'done' || snapshot.progressPercent >= 100) {
        return 'Compl\u00e9t\u00e9';
      }
      if (
        snapshot.progressPercent != null &&
        snapshot.progressPercent > 0 &&
        snapshot.progressPercent < 100
      ) {
        return snapshot.progressPercent + '\u00a0%';
      }
      return 'En attente';
    }

    if (snapshot.phase === 'done' || open <= 0) return 'Compl\u00e9t\u00e9';

    if (labels.length === 1) {
      return clampProgressSummarySentence('Reste\u00a0: ' + labels[0] + '.');
    }
    if (labels.length === 2) {
      return clampProgressSummarySentence(
        'Reste\u00a0: ' + labels[0] + ' et ' + labels[1] + '.'
      );
    }
    if (labels.length >= 3) {
      return clampProgressSummarySentence(
        'Reste\u00a0: ' +
          labels[0] +
          ', ' +
          labels[1] +
          ' et ' +
          (open - 2) +
          ' autre' +
          (open - 2 > 1 ? 's' : '') +
          '.'
      );
    }

    if (open === 1) return 'Une t\u00e2che restante';
    if (open === 2) return 'Deux t\u00e2ches restantes';
    return open + ' t\u00e2ches restantes';
  }

  /**
   * AI Progrès tab summary: one short sentence combining the task hierarchy.
   * Returns { ok, skipped?, reason?, sentence?, source, usage?, debug }.
   */
  async function cardProgressSummaryTurn(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var context = options.context || buildContext(bridge);
    var snapshot =
      options.snapshot ||
      buildProgressSummarySnapshot(context, {
        linkedTreeByItemId: options.linkedTreeByItemId
      });
    var heuristic = buildHeuristicProgressSummary(snapshot);

    // Blocked: Motifs are structured — skip AI so the reason replaces open tasks.
    if (snapshot.stuck || snapshot.phase === 'blocked') {
      return {
        ok: true,
        skipped: true,
        reason: 'blocked',
        sentence: heuristic,
        source: 'heuristic'
      };
    }

    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      return {
        ok: true,
        skipped: true,
        reason: 'not-configured',
        sentence: heuristic,
        source: 'heuristic'
      };
    }

    if (!snapshot.tasksTotal && !(snapshot.outline && snapshot.outline.length)) {
      return {
        ok: true,
        skipped: true,
        reason: 'no-tasks',
        sentence: heuristic,
        source: 'heuristic'
      };
    }

    var messages = [
      {
        role: 'system',
        content: [
          'Tu r\u00e9diges UNE phrase courte pour le r\u00e9sum\u00e9 de l\'onglet Progr\u00e8s d\'une carte Trello.',
          'Objectif\u00a0: synth\u00e9tiser le sens de TOUTES les t\u00e2ches, sous-t\u00e2ches et sous-sous-t\u00e2ches (outline) en une phrase utile.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"sentence":"\u2026"}',
          'R\u00e8gles\u00a0:',
          '- Une seule phrase, fran\u00e7ais, ton clair et factuel.',
          '- Max ~' + MAX_PROGRESS_SUMMARY_LEN + ' caract\u00e8res.',
          '- Combine / synth\u00e9tise\u00a0: ne liste pas tout comme un inventaire robotique.',
          '- Si stuck/phase=blocked\u00a0: r\u00e9sume UNIQUEMENT les causes (blockedReasons), pas les t\u00e2ches ouvertes.',
          '- Si du travail reste (non bloqu\u00e9)\u00a0: dis ce qui reste \u00e0 faire (th\u00e8me + prochaines \u00e9tapes utiles).',
          '- Si tout est done\u00a0: dis que c\'est termin\u00e9, en rappelant bri\u00e8vement le sujet.',
          '- INTERDIT de citer le % de progr\u00e8s.',
          '- INTERDIT d\'encourager / flatter.',
          '- N\'invente aucune \u00e9tape absente de outline / openLabels / blockedReasons.',
          '- Ex. BON\u00a0: "Reste la validation client (maquette + feedback) avant publication."',
          '- Ex. BON\u00a0: "R\u00e9daction du brief termin\u00e9e\u00a0; encha\u00eene sur relecture et envoi."',
          '- Ex. BON (bloqu\u00e9)\u00a0: "En attente d\'une approbation."',
          '- Ex. MAUVAIS\u00a0: "3 t\u00e2ches restantes."',
          '- Ex. MAUVAIS (bloqu\u00e9)\u00a0: citer une t\u00e2che ouverte au lieu de blockedReasons.',
          'Snapshot\u00a0:',
          JSON.stringify(snapshot)
        ].join('\n')
      },
      {
        role: 'user',
        content:
          'Donne la phrase de r\u00e9sum\u00e9 Progr\u00e8s (JSON {"sentence":"\u2026"}). Heuristique de secours\u00a0: ' +
          heuristic
      }
    ];

    var debug = {
      id: 'progress-summary-' + Date.now().toString(36),
      kind: 'cardProgressSummaryTurn',
      label: 'R\u00e9sum\u00e9 Progr\u00e8s',
      startedAt: Date.now(),
      attempts: []
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('cardProgressSummaryTurn onDebug failed', cbErr);
      }
    }

    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 120,
          temperature: 0.35
        });
        if (response.meta) {
          debug.attempts.push(Object.assign({ label: 'json' }, response.meta));
        }
      } catch (err) {
        if (err && err.debugMeta) {
          debug.attempts.push(Object.assign({ label: 'json' }, err.debugMeta));
        }
        if (
          err &&
          err.message &&
          /response_format|json_object|json mode/i.test(err.message)
        ) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 120,
            temperature: 0.35
          });
          if (response.meta) {
            debug.attempts.push(
              Object.assign({ label: 'sans json mode' }, response.meta)
            );
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
      debug.request = debug.attempts.length
        ? debug.attempts[debug.attempts.length - 1]
        : null;
      emitDebug();
      return {
        ok: true,
        skipped: false,
        reason: 'llm-error',
        sentence: heuristic,
        source: 'heuristic',
        error: debug.error,
        debug: debug
      };
    }

    var data = null;
    try {
      var text = typeof response.content === 'string' ? response.content.trim() : '';
      var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) text = fence[1].trim();
      var start = text.indexOf('{');
      var end = text.lastIndexOf('}');
      if (start >= 0 && end > start) text = text.slice(start, end + 1);
      data = JSON.parse(text);
    } catch (parseErr) {
      data = null;
    }

    var usage = extractUsageFromRaw(response.raw, messages, response.content, p.model);
    usage.latencyMs = Date.now() - t0;
    debug.endedAt = Date.now();
    debug.latencyMs = usage.latencyMs;
    debug.ok = true;
    debug.request =
      response.meta ||
      (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response.meta && response.meta.status,
      content: response.content,
      raw: cloneJsonSafe(response.raw),
      parsed: data
    };
    debug.usage = usage;
    emitDebug();

    var aiSentence =
      data && typeof data.sentence === 'string'
        ? clampProgressSummarySentence(data.sentence)
        : '';
    if (!aiSentence) {
      return {
        ok: true,
        skipped: true,
        reason: 'empty-sentence',
        sentence: heuristic,
        source: 'heuristic',
        usage: usage,
        debug: debug
      };
    }

    return {
      ok: true,
      skipped: false,
      sentence: aiSentence,
      source: 'ai',
      usage: usage,
      debug: debug
    };
  }

  /** Compact snapshot of fields already visible on the card (so dream does not repeat them). */
  function buildDreamCardSnapshot(context) {
    var due = context && context.due;
    var progress = context && context.progress;
    var blocked = context && context.blocked;
    var items =
      progress && Array.isArray(progress.items)
        ? progress.items
            .map(function (it) {
              if (!it || typeof it !== 'object') return null;
              var text = typeof it.text === 'string' ? it.text.trim() : '';
              if (!text) return null;
              return (it.done ? '[x] ' : '[ ] ') + text.slice(0, 80);
            })
            .filter(Boolean)
            .slice(0, 8)
        : [];
    return {
      due:
        due && due.enabled && due.dueDate
          ? {
              dueDate: due.dueDate,
              dueTime: due.dueTime || null
            }
          : null,
      progress:
        progress && progress.enabled !== false
          ? {
              percent:
                typeof progress.percent === 'number'
                  ? progress.percent
                  : typeof progress.cardProgress === 'number'
                    ? progress.cardProgress
                    : null,
              items: items
            }
          : null,
      blocked:
        blocked && blocked.enabled
          ? {
              reasons: Array.isArray(blocked.blockedReasons)
                ? blocked.blockedReasons.slice(0, 4)
                : []
            }
          : null,
      statut:
        context && context.statut && context.statut.listName
          ? context.statut.listName
          : null
    };
  }

  // exports
  S.LANE_CONTINUATION_RE = LANE_CONTINUATION_RE;
  S.LANE_PREFIX_RE = LANE_PREFIX_RE;
  S.MAX_DREAM_DESC_LEN = MAX_DREAM_DESC_LEN;
  S.MAX_DREAM_HISTORY_CHARS = MAX_DREAM_HISTORY_CHARS;
  S.MAX_PROGRESS_SUMMARY_LEN = MAX_PROGRESS_SUMMARY_LEN;
  S.MAX_STATUS_BRIEF_DESC_LEN = MAX_STATUS_BRIEF_DESC_LEN;
  S.MAX_STATUS_BRIEF_LEN = MAX_STATUS_BRIEF_LEN;
  S.PARALLEL_LANE_MAX = PARALLEL_LANE_MAX;
  S.addDaysIsoLocal = addDaysIsoLocal;
  S.buildDonePendingSanityFallback = buildDonePendingSanityFallback;
  S.buildDreamCardSnapshot = buildDreamCardSnapshot;
  S.buildDreamHistoryExcerpt = buildDreamHistoryExcerpt;
  S.buildHeuristicProgressSummary = buildHeuristicProgressSummary;
  S.buildHeuristicStatusBrief = buildHeuristicStatusBrief;
  S.buildImprovementExampleJson = buildImprovementExampleJson;
  S.buildProgressSummarySnapshot = buildProgressSummarySnapshot;
  S.buildStatusBriefSnapshot = buildStatusBriefSnapshot;
  S.cardProgressSummaryTurn = cardProgressSummaryTurn;
  S.cardStatusBriefTurn = cardStatusBriefTurn;
  S.chatTurn = chatTurn;
  S.clampProgressSummarySentence = clampProgressSummarySentence;
  S.clampStatusBriefSentence = clampStatusBriefSentence;
  S.collectProgressSummaryBlockedReasons = collectProgressSummaryBlockedReasons;
  S.collectStatusBriefNextOpenItems = collectStatusBriefNextOpenItems;
  S.daysBetweenIsoLocal = daysBetweenIsoLocal;
  S.describeRecentCardChanges = describeRecentCardChanges;
  S.excerptStatusBriefDesc = excerptStatusBriefDesc;
  S.filterImprovementsAgainstRecentChanges = filterImprovementsAgainstRecentChanges;
  S.filterNoOpImprovementSuggestions = filterNoOpImprovementSuggestions;
  S.fingerprintProgressSummarySnapshot = fingerprintProgressSummarySnapshot;
  S.fingerprintStatusBriefSnapshot = fingerprintStatusBriefSnapshot;
  S.firstNameFromFullName = firstNameFromFullName;
  S.formatStatusBriefDueGap = formatStatusBriefDueGap;
  S.formatStatusBriefDueTime = formatStatusBriefDueTime;
  S.isNoOpImprovementAction = isNoOpImprovementAction;
  S.isProgressSummaryStuck = isProgressSummaryStuck;
  S.isVacuousStatusBrief = isVacuousStatusBrief;
  S.isVerboseStructuredDesc = isVerboseStructuredDesc;
  S.listCardImprovementGaps = listCardImprovementGaps;
  S.listRecentCardChanges = listRecentCardChanges;
  S.mapProgressOutlineNode = mapProgressOutlineNode;
  S.normalizeDescForCompare = normalizeDescForCompare;
  S.normalizeStatusBriefScale = normalizeStatusBriefScale;
  S.outlineChildrenForItem = outlineChildrenForItem;
  S.preferReopenStatutCategory = preferReopenStatutCategory;
  S.resolveImprovementDueArgs = resolveImprovementDueArgs;
  S.routeMessage = routeMessage;
  S.suggestCardImprovements = suggestCardImprovements;
  S.suggestQuestions = suggestQuestions;
  S.truncateProgressLabel = truncateProgressLabel;
  S.truncateStatusBriefLabel = truncateStatusBriefLabel;
})(typeof window !== 'undefined' ? window : this);
