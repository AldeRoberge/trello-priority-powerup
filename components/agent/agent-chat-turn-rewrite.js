/**
 * agent-chat-turn: chatTurn() part 1 of 1.
 * The body of chatTurn runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see agent-chat-turn.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});
  var P = (global.PriorityAgentPartsMountChatTurn = global.PriorityAgentPartsMountChatTurn || { list: [] });

  P.list.push({
    define: function (M) {
    M.recordAttempt = function recordAttempt(label, metaOrErr) {
      if (metaOrErr && metaOrErr.meta) {
        M.debug.attempts.push(Object.assign({ label: label }, metaOrErr.meta));
        S.dbgLog('agent', 'chatTurn.fetch', S.dbgFetchMeta(label, metaOrErr));
        return;
      }
      if (metaOrErr && metaOrErr.debugMeta) {
        M.debug.attempts.push(Object.assign({ label: label }, metaOrErr.debugMeta));
        S.dbgLog('agent', 'chatTurn.fetch', S.dbgFetchMeta(label, metaOrErr));
        return;
      }
      M.debug.attempts.push({
        label: label,
        error: (metaOrErr && metaOrErr.message) || String(metaOrErr || 'error'),
        ok: false
      });
      S.dbgLog('agent', 'chatTurn.fetch', S.dbgFetchMeta(label, metaOrErr));
    };
    M.notifyVisible = function notifyVisible(accumulated) {
      if (!M.onDelta) return;
      var visible = S.extractStreamingMessage(accumulated);
      if (!visible) return;
      try {
        M.onDelta(visible, accumulated);
      } catch (cbErr) {
        console.error('chatTurn onDelta failed', cbErr);
      }
    };
    },
    run: async function (M) {
    M.options = M.options || {};
    S.dbgLog('agent', 'chatTurn.start', {});
    M.onDelta = typeof M.options.onDelta === 'function' ? M.options.onDelta : null;
    M.p = S.normalizeProvider(M.provider);
    M.resolvedModel = S.resolveChatModel(M.p, M.history, M.options.modelTier);
    if (M.resolvedModel && M.resolvedModel !== M.p.model) {
      M.p = S.normalizeProvider(Object.assign({}, M.p, { model: M.resolvedModel }));
    }
    M.context = S.buildContext(M.bridge);
    M.live = S.localClock();
    M.context.today = M.live.today;
    M.context.nowTime = M.live.nowTime;
    M.context.timeZone = M.live.timeZone;
    M.context.utcOffset = M.live.utcOffset;
    if (M.context.appBuiltAt) M.context.appBuiltLocal = S.localStamp(M.context.appBuiltAt);
    M.messages = [
      {
        role: 'system',
        content: S.systemPrompt(M.context, { userText: M.userText })
      }
    ];
    (M.history || []).forEach(function (entry) {
      if (!entry || !entry.role || !entry.content) return;
      if (entry.role === 'user' || entry.role === 'assistant') {
        M.messages.push({
          role: entry.role,
          content:
            entry.role === 'assistant' && entry.rawJson
              ? entry.rawJson
              : String(entry.content)
        });
      }
    });
    M.messages.push({ role: 'user', content: S.userTurnWithClock(M.userText) });
    M.debug = {
      id: 'chat-' + Date.now().toString(36),
      kind: 'chatTurn',
      label: 'Tour de conversation',
      startedAt: Date.now(),
      attempts: []
    };
    M.t0 = Date.now();
    M.response;
    try {
      try {
        M.response = await S.chatCompletions(M.p, M.messages, {
          jsonMode: true,
          stream: true,
          onDelta: function (_piece, accumulated) {
            M.notifyVisible(accumulated);
          }
        });
        M.recordAttempt('stream + json', M.response);
      } catch (err) {
        M.recordAttempt('stream + json', err);
        if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
          M.response = await S.chatCompletions(M.p, M.messages, {
            jsonMode: false,
            stream: true,
            onDelta: function (_piece, accumulated) {
              M.notifyVisible(accumulated);
            }
          });
          M.recordAttempt('stream (sans json mode)', M.response);
        } else if (err && /stream/i.test((err && err.message) || '')) {
          S.dbgLog('agent', 'chatTurn.fetch', {
            attempt: 'stream + json',
            ok: false,
            fallback: 'stream-rejected'
          });
          // Provider rejected streaming — fall back to a blocking call.
          try {
            M.response = await S.chatCompletions(M.p, M.messages, { jsonMode: true, stream: false });
            M.recordAttempt('non-stream + json', M.response);
          } catch (err2) {
            M.recordAttempt('non-stream + json', err2);
            if (err2 && err2.message && /response_format|json_object|json mode/i.test(err2.message)) {
              M.response = await S.chatCompletions(M.p, M.messages, { jsonMode: false, stream: false });
              M.recordAttempt('non-stream (sans json mode)', M.response);
            } else {
              throw err2;
            }
          }
          M.notifyVisible(M.response.content);
        } else {
          throw err;
        }
      }
    } catch (fatal) {
      M.debug.endedAt = Date.now();
      M.debug.latencyMs = Date.now() - M.t0;
      M.debug.ok = false;
      M.debug.error = (fatal && fatal.message) || String(fatal || 'Erreur');
      S.dbgError('agent', 'chatTurn.end', fatal, { latencyMs: M.debug.latencyMs, ok: false });
      M.debug.request = M.debug.attempts.length
        ? M.debug.attempts[M.debug.attempts.length - 1]
        : S.buildRequestMeta(M.p, {
            model: M.p.model,
            messages: M.messages,
            temperature: 0.3,
            stream: true,
            response_format: { type: 'json_object' }
          });
      fatal.debug = M.debug;
      throw fatal;
    }
    M.latencyMs = Date.now() - M.t0;
    M.parsed = S.parseAssistantPayload(M.response.content);
    M.parsed = await S.enrichSubtaskPickTurn(M.parsed, M.context, {
      suggestTitles: function () {
        return S.suggestSubtasks(M.p, {
          cardName: (M.context && M.context.cardName) || '',
          cardDesc: (M.context && M.context.cardDesc) || '',
          priorityLabel:
            M.context && M.context.display && M.context.display.label
              ? M.context.display.label
              : '',
          existingSubtasks: [],
          memory: (M.context && M.context.memory) || null,
          boardDigest: (M.context && M.context.boardDigest) || '',
          profile: (M.context && M.context.profile) || null
        });
      }
    });
    M.parsed.suggestions = S.ensurePersonalImpactSuggestion(
      M.parsed.suggestions,
      M.context && M.context.userName,
      M.parsed.message
    );
    M.actions = S.rewriteActionsForRelativeDue(M.parsed.actions || [], M.userText);
    M.tierRewrite = S.rewriteActionsForPriorityTier(M.actions, M.userText);
    M.actions = M.tierRewrite.actions;
    M.message = S.polishAssistantVisibleText(
      S.stripScaleLegendParenthetical(
        S.polishMessageAfterTierApply(
          M.parsed.message,
          M.tierRewrite.tier,
          M.tierRewrite.injected
        )
      )
    );
    M.colorRewrite = S.rewriteActionsForAgentColor(
      M.actions,
      M.userText,
      M.message,
      M.parsed.color
    );
    M.actions = M.colorRewrite.actions;
    M.progressGuard = S.applyProgressCompleteGuards(
      {
        message: M.message,
        actions: M.actions,
        suggestions: M.parsed.suggestions,
        emotion: M.parsed.emotion || null
      },
      M.context
    );
    M.message = M.progressGuard.message;
    M.actions = M.progressGuard.actions;
    M.actions = S.ensureQuebecLibreEffect(M.actions, M.userText);
    M.actions = S.ensureUnblockedIntent(M.actions, M.userText);
    M.liftedChat = S.liftPatchTools(M.actions, M.parsed.cardPatches, M.parsed.patches);
    M.actions = M.liftedChat.actions;
    M.parsed.cardPatches = S.normalizeCardPatches(M.liftedChat.cardPatches);
    M.parsed.patches = S.normalizeBoardPatches(M.liftedChat.patches);
    M.projectScope = S.isProjectScope(M.context && M.context.scope);
    if (M.projectScope) {
      M.droppedForScope = [];
      M.actions = (M.actions || []).filter(function (a) {
        if (a && S.PROJECT_SCOPE_TOOLS[a.tool]) return true;
        if (a && a.tool) {
          M.droppedForScope.push({
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
      M.parsed.droppedActions = (M.parsed.droppedActions || []).concat(M.droppedForScope);
      M.parsed.cardPatches = [];
      // Project window: no card self-review cycle.
      M.parsed.selfPrompt = false;
      M.parsed.selfPromptFocus = '';
    }
    M.parsed.suggestions = S.linkSuggestionColorsToHighlights(
      M.progressGuard.suggestions || M.parsed.suggestions,
      M.message
    );
    M.parsed.suggestions = S.orderSuggestionsGreenToRed(
      M.parsed.suggestions,
      M.context && M.context.userName
    );
    M.replyEmotion = M.progressGuard.emotion;
    if (S.looksLikeQuebecLibrePhrase(M.userText) && !M.replyEmotion) {
      M.replyEmotion = 'happy';
    }
    M.replyColor =
      M.colorRewrite.color || M.parsed.color || null;
    M.prompts = M.projectScope
      ? []
      : S.ensurePriorityAxesPrompt(
          S.normalizePrompts(M.parsed.prompts, M.context),
          M.actions,
          M.context
        );
    M.blocks = S.normalizeBlocks(M.parsed.blocks, M.context);
    if (M.onDelta && M.message) {
      try {
        M.onDelta(M.message, M.response.content);
      } catch (finalCbErr) {
        console.error('chatTurn final onDelta failed', finalCbErr);
      }
    }
    M.usage = S.extractUsageFromRaw(M.response.raw, M.messages, M.response.content, M.p.model);
    M.usage.latencyMs = M.latencyMs;
    M.usage.historyTurns = (M.history || []).length;
    M.debug.endedAt = Date.now();
    M.debug.latencyMs = M.latencyMs;
    M.debug.ok = true;
    M.debug.request = M.response.meta || (M.debug.attempts.length ? M.debug.attempts[M.debug.attempts.length - 1] : null);
    M.debug.response = {
      status: M.response.meta && M.response.meta.status,
      content: M.response.content,
      raw: S.cloneJsonSafe(M.response.raw),
      parsed: {
        message: M.message,
        followUps: M.parsed.followUps,
        suggestions: M.parsed.suggestions,
        prompts: M.prompts,
        blocks: M.blocks,
        actions: M.actions,
        droppedActions: M.parsed.droppedActions || [],
        modelTier: M.parsed.modelTier || null,
        tierInjected: !!M.tierRewrite.injected,
        colorInjected: !!M.colorRewrite.injected,
        scope: (M.context && M.context.scope) || S.ASSISTANT_SCOPES.TASK
      }
    };
    M.debug.usage = M.usage;
    S.dbgLog('agent', 'chatTurn.end', {
      ok: true,
      latencyMs: M.latencyMs,
      actionCount: (M.actions || []).length,
      droppedCount: (M.parsed.droppedActions || []).length
    });
    return { v: {
      message: M.message,
      emotion: M.replyEmotion || M.parsed.emotion || null,
      color: M.replyColor,
      modelTier: M.parsed.modelTier || null,
      followUps: M.parsed.followUps,
      suggestions: M.parsed.suggestions,
      suggestionsMulti: !!M.parsed.suggestionsMulti,
      prompts: M.prompts,
      blocks: M.blocks,
      actions: M.actions,
      droppedActions: M.parsed.droppedActions || [],
      cardPatches: M.projectScope ? [] : M.parsed.cardPatches || [],
      patches: M.parsed.patches || [],
      selfPrompt: M.projectScope ? false : !!M.parsed.selfPrompt,
      selfPromptFocus: M.projectScope ? '' : M.parsed.selfPromptFocus || '',
      rawJson: M.response.content,
      context: M.context,
      usage: M.usage,
      debug: M.debug
    } };
    }
  });
})(typeof window !== 'undefined' ? window : this);
