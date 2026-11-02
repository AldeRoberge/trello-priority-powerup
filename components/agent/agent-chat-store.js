/**
 * AI agent: interview and chat history
 *
 * Part 5/10 of agent. Card first-open interview and per-card or board chat history (budget-capped pluginData).
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var BOARD_CHAT_KEY = S.BOARD_CHAT_KEY;
  var CARD_CHAT_KEY = S.CARD_CHAT_KEY;
  var CARD_INTERVIEW_KEY = S.CARD_INTERVIEW_KEY;
  var MAX_CHAT_CONTENT = S.MAX_CHAT_CONTENT;
  var MAX_CHAT_MESSAGES = S.MAX_CHAT_MESSAGES;
  var MAX_CHAT_SERIALIZED = S.MAX_CHAT_SERIALIZED;
  var MAX_CHAT_SERIALIZED_HARD = S.MAX_CHAT_SERIALIZED_HARD;
  var MAX_INTERVIEW_ASKED = S.MAX_INTERVIEW_ASKED;

  // from other parts (functions, resolved at call time)
  function applyInterviewEchoGuards() { return S.applyInterviewEchoGuards.apply(this, arguments); }
  function applyInterviewWhyGuards() { return S.applyInterviewWhyGuards.apply(this, arguments); }
  function applyKnownDueGuards() { return S.applyKnownDueGuards.apply(this, arguments); }
  function applyProgressCompleteGuards() { return S.applyProgressCompleteGuards.apply(this, arguments); }
  function buildContext() { return S.buildContext.apply(this, arguments); }
  function buildInterviewNextPivot() { return S.buildInterviewNextPivot.apply(this, arguments); }
  function buildRequestMeta() { return S.buildRequestMeta.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function cloneJsonSafe() { return S.cloneJsonSafe.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgFetchMeta() { return S.dbgFetchMeta.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function detectMessageLanguage() { return S.detectMessageLanguage.apply(this, arguments); }
  function ensurePersonalImpactSuggestion() { return S.ensurePersonalImpactSuggestion.apply(this, arguments); }
  function ensurePriorityAxesPrompt() { return S.ensurePriorityAxesPrompt.apply(this, arguments); }
  function ensureQuebecLibreEffect() { return S.ensureQuebecLibreEffect.apply(this, arguments); }
  function ensureUnblockedIntent() { return S.ensureUnblockedIntent.apply(this, arguments); }
  function extractStreamingMessage() { return S.extractStreamingMessage.apply(this, arguments); }
  function extractUsageFromRaw() { return S.extractUsageFromRaw.apply(this, arguments); }
  function filterDueSuggestionsWhenComplete() { return S.filterDueSuggestionsWhenComplete.apply(this, arguments); }
  function isConfigured() { return S.isConfigured.apply(this, arguments); }
  function liftPatchTools() { return S.liftPatchTools.apply(this, arguments); }
  function linkSuggestionColorsToHighlights() { return S.linkSuggestionColorsToHighlights.apply(this, arguments); }
  function looksLikeQuebecLibrePhrase() { return S.looksLikeQuebecLibrePhrase.apply(this, arguments); }
  function normalizeBlocks() { return S.normalizeBlocks.apply(this, arguments); }
  function normalizeBoardPatches() { return S.normalizeBoardPatches.apply(this, arguments); }
  function normalizeCardPatches() { return S.normalizeCardPatches.apply(this, arguments); }
  function normalizePrompts() { return S.normalizePrompts.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function normalizeSuggestionEntries() { return S.normalizeSuggestionEntries.apply(this, arguments); }
  function orderSuggestionsGreenToRed() { return S.orderSuggestionsGreenToRed.apply(this, arguments); }
  function parseAssistantPayload() { return S.parseAssistantPayload.apply(this, arguments); }
  function polishAssistantVisibleText() { return S.polishAssistantVisibleText.apply(this, arguments); }
  function polishMessageAfterTierApply() { return S.polishMessageAfterTierApply.apply(this, arguments); }
  function profileLanguageInstruction() { return S.profileLanguageInstruction.apply(this, arguments); }
  function rewriteActionsForAgentColor() { return S.rewriteActionsForAgentColor.apply(this, arguments); }
  function rewriteActionsForPriorityTier() { return S.rewriteActionsForPriorityTier.apply(this, arguments); }
  function rewriteActionsForRelativeDue() { return S.rewriteActionsForRelativeDue.apply(this, arguments); }
  function spreadScaleHeat() { return S.spreadScaleHeat.apply(this, arguments); }
  function stripScaleLegendParenthetical() { return S.stripScaleLegendParenthetical.apply(this, arguments); }
  function summarizeInterviewAlreadyKnown() { return S.summarizeInterviewAlreadyKnown.apply(this, arguments); }
  function userTurnWithClock() { return S.userTurnWithClock.apply(this, arguments); }
  function wantsSuggestionScale() { return S.wantsSuggestionScale.apply(this, arguments); }
  function wantsSuggestionsMulti() { return S.wantsSuggestionsMulti.apply(this, arguments); }

  // ── Card first-open interview (Akinator / Q20) ────────────────────────────

  /** Strip [[g:/r:/y:/a:…]] markers for question matching. */
  function stripInterviewMarkup(text) {
    return String(text || '')
      .replace(/\[\[\s*[a-z]\s*:\s*([^\]]*)\s*\]\]?/gi, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Classify progress-scout interview questions so we can block
   * déjà-fait ↔ reste-à-faire loops (same topic, oscillating wording).
   * Returns 'done' | 'remaining' | 'both' | 'started' | ''.
   */
  function interviewProgressScoutKind(text) {
    var t = stripInterviewMarkup(text).toLocaleLowerCase('fr-FR');
    if (!t || t.indexOf('?') < 0) return '';
    var isRemaining =
      /reste\s*[àa]\s*faire/.test(t) ||
      /qu['']?est[- ]ce\s+qui\s+reste/.test(t) ||
      /il\s+reste\s+quoi/.test(t) ||
      /quoi\s+reste/.test(t) ||
      /ce\s+qui\s+reste/.test(t);
    var isDone =
      /d[ée]j[àa]\s+fait/.test(t) ||
      /qu['']?est[- ]ce\s+qui\s+(?:est|a\s+[ée]t[ée])\s+(?:d[ée]j[àa]\s+)?fait/.test(
        t
      ) ||
      /ce\s+qui\s+est\s+(?:d[ée]j[àa]\s+)?fait/.test(t) ||
      /qu['']?est[- ]ce\s+qui\s+a\s+[ée]t[ée]\s+fait/.test(t);
    if (isRemaining && isDone) return 'both';
    if (isRemaining) return 'remaining';
    if (isDone) return 'done';
    if (
      (/commenc/.test(t) || /pas\s+encore/.test(t)) &&
      (/d[ée]j[àa]/.test(t) || /pas\s+encore/.test(t) || /avanc/.test(t))
    ) {
      return 'started';
    }
    return '';
  }

  function cardMemoryHasProgressFact(cardMemory, kind) {
    var facts =
      cardMemory && Array.isArray(cardMemory.facts) ? cardMemory.facts : [];
    var re =
      kind === 'remaining'
        ? /^\s*reste\b/i
        : kind === 'done'
          ? /^\s*d[ée]j[àa]\s+fait\b/i
          : null;
    if (!re) return false;
    for (var i = 0; i < facts.length; i++) {
      var f = facts[i];
      var text =
        typeof f === 'string'
          ? f
          : f && typeof f === 'object'
            ? String(f.text || f.fact || '')
            : '';
      if (re.test(text)) return true;
    }
    return false;
  }

  /**
   * Summarize which progress-scout angles were already covered
   * (asked[], cardMemory, or recent assistant history).
   */
  function summarizeInterviewProgressScout(context, history) {
    var asked =
      context && context.interview && Array.isArray(context.interview.asked)
        ? context.interview.asked
        : [];
    var state = {
      askedDone: false,
      askedRemaining: false,
      askedStarted: false,
      memoryHasDone: cardMemoryHasProgressFact(
        context && context.cardMemory,
        'done'
      ),
      memoryHasRemaining: cardMemoryHasProgressFact(
        context && context.cardMemory,
        'remaining'
      )
    };
    function absorb(text) {
      var kind = interviewProgressScoutKind(text);
      if (kind === 'both') {
        state.askedDone = true;
        state.askedRemaining = true;
      } else if (kind === 'done') state.askedDone = true;
      else if (kind === 'remaining') state.askedRemaining = true;
      else if (kind === 'started') state.askedStarted = true;
    }
    asked.forEach(absorb);
    (Array.isArray(history) ? history : []).forEach(function (entry) {
      if (!entry || entry.role !== 'assistant') return;
      absorb(entry.content || '');
    });
    state.doneCovered = state.askedDone || state.memoryHasDone;
    state.remainingCovered = state.askedRemaining || state.memoryHasRemaining;
    state.blockScout =
      (state.doneCovered && state.remainingCovered) ||
      (state.askedDone && state.askedRemaining);
    return state;
  }

  /**
   * If the model re-asks déjà-fait / reste (or oscillates), pivot off
   * progress scouting so the interview cannot stall in a repérage loop.
   * Allowed once: déjà-fait → reste. Blocked: same kind twice, reste→déjà-fait,
   * or any scout once both angles (or memory) already cover progress.
   */
  function applyInterviewProgressScoutGuards(turn, context, history) {
    turn = turn && typeof turn === 'object' ? turn : {};
    var message = typeof turn.message === 'string' ? turn.message : '';
    var kind = interviewProgressScoutKind(message);
    if (kind !== 'done' && kind !== 'remaining' && kind !== 'both') return turn;

    var scout = summarizeInterviewProgressScout(context, history);
    var blocked = false;
    if (kind === 'both') {
      // Combined ask is fine once; never after either angle was already used.
      if (
        scout.askedDone ||
        scout.askedRemaining ||
        scout.memoryHasDone ||
        scout.memoryHasRemaining
      ) {
        blocked = true;
      }
    } else {
      // Same angle again (any wording).
      if (kind === 'done' && scout.askedDone) blocked = true;
      if (kind === 'remaining' && scout.askedRemaining) blocked = true;
      // Fact already memorized — no need to re-scout.
      if (kind === 'done' && scout.memoryHasDone) blocked = true;
      if (kind === 'remaining' && scout.memoryHasRemaining) blocked = true;
      // Reverse / ping-pong: "déjà fait" after "reste" was already asked.
      if (kind === 'done' && scout.askedRemaining) blocked = true;
      // Both angles already spent — leave progress scouting entirely.
      if (scout.askedDone && scout.askedRemaining) blocked = true;
      if (scout.memoryHasDone && scout.memoryHasRemaining) blocked = true;
    }

    if (!blocked) return turn;

    // Never fall through to "C'est pour quand?" when due is already set.
    var next = buildInterviewNextPivot(context);
    return Object.assign({}, turn, {
      message: next.message,
      suggestions: next.suggestions,
      suggestionsMulti: next.suggestionsMulti,
      suggestionScale: next.suggestionScale,
      completeInterview: !!next.completeInterview
    });
  }

  function emptyCardInterview() {
    return {
      complete: false,
      asked: [],
      startedAt: '',
      completedAt: ''
    };
  }

  function normalizeCardInterview(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var asked = Array.isArray(src.asked)
      ? src.asked
          .map(function (q) {
            return String(q || '')
              .trim()
              .slice(0, 120);
          })
          .filter(Boolean)
          .slice(0, MAX_INTERVIEW_ASKED)
      : [];
    return {
      complete: !!src.complete,
      asked: asked,
      startedAt: typeof src.startedAt === 'string' ? src.startedAt : '',
      completedAt: typeof src.completedAt === 'string' ? src.completedAt : ''
    };
  }

  async function loadCardInterview(t) {
    if (!t || typeof t.get !== 'function') return emptyCardInterview();
    try {
      var stored = await t.get('card', 'shared', CARD_INTERVIEW_KEY);
      return normalizeCardInterview(stored);
    } catch (err) {
      console.error('PriorityAgent.loadCardInterview failed', err);
      return emptyCardInterview();
    }
  }

  async function saveCardInterview(t, interview) {
    var next = normalizeCardInterview(interview);
    if (!t || typeof t.set !== 'function') return next;
    try {
      await t.set('card', 'shared', CARD_INTERVIEW_KEY, next);
    } catch (err) {
      console.error('PriorityAgent.saveCardInterview failed', err);
    }
    return next;
  }

  function markInterviewQuestionAsked(interview, question) {
    var next = normalizeCardInterview(interview);
    var q = String(question || '')
      .trim()
      .slice(0, 120);
    if (!q) return next;
    var key = q.toLocaleLowerCase('fr-FR');
    var already = next.asked.some(function (x) {
      return String(x).toLocaleLowerCase('fr-FR') === key;
    });
    if (!already) {
      next.asked = [q].concat(next.asked).slice(0, MAX_INTERVIEW_ASKED);
    }
    if (!next.startedAt) next.startedAt = new Date().toISOString();
    return next;
  }

  function markInterviewComplete(interview) {
    var next = normalizeCardInterview(interview);
    next.complete = true;
    next.completedAt = new Date().toISOString();
    if (!next.startedAt) next.startedAt = next.completedAt;
    return next;
  }

  // ── Per-card chat history (survives close/reopen) ─────────────────────────

  function emptyCardChat() {
    return {
      version: 1,
      messages: [],
      updatedAt: ''
    };
  }

  function normalizeCardChatMessage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var role = raw.role === 'user' || raw.role === 'assistant' ? raw.role : '';
    if (!role) return null;
    var content = String(raw.content != null ? raw.content : '')
      .trim()
      .slice(0, MAX_CHAT_CONTENT);
    if (!content) return null;
    return { role: role, content: content };
  }

  function chatSerializedSize(chat) {
    try {
      var json = JSON.stringify(chat);
      // Prefer UTF-8 byte length when available (closer to Trello’s count for accents/emoji).
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(json).length;
      }
      return unescape(encodeURIComponent(json)).length;
    } catch (e) {
      return MAX_CHAT_SERIALIZED + 1;
    }
  }

  function enforceCardChatBudget(chat, maxBytes) {
    var budget =
      typeof maxBytes === 'number' && maxBytes > 0 ? maxBytes : MAX_CHAT_SERIALIZED;
    var next = {
      version: 1,
      messages: Array.isArray(chat && chat.messages) ? chat.messages.slice() : [],
      updatedAt: (chat && typeof chat.updatedAt === 'string' && chat.updatedAt) || ''
    };
    // Persist only role + content (drop selfPrompt and any UI-only fields).
    next.messages = next.messages
      .map(function (msg) {
        return normalizeCardChatMessage(msg);
      })
      .filter(Boolean);
    while (next.messages.length > MAX_CHAT_MESSAGES) {
      next.messages.shift();
    }
    while (
      next.messages.length > 1 &&
      chatSerializedSize(next) > budget
    ) {
      next.messages.shift();
    }
    if (chatSerializedSize(next) > budget && next.messages.length === 1) {
      var slimCap = Math.max(60, Math.floor(MAX_CHAT_CONTENT / 2));
      while (
        slimCap >= 40 &&
        chatSerializedSize(next) > budget
      ) {
        next.messages[0] = {
          role: next.messages[0].role,
          content: String(next.messages[0].content || '').slice(0, slimCap)
        };
        slimCap = Math.floor(slimCap * 0.7);
      }
    }
    if (chatSerializedSize(next) > budget) {
      next.messages = [];
    }
    return next;
  }

  function normalizeCardChat(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var messages = [];
    if (Array.isArray(src.messages)) {
      for (var i = 0; i < src.messages.length; i++) {
        var msg = normalizeCardChatMessage(src.messages[i]);
        if (msg) messages.push(msg);
      }
    }
    return enforceCardChatBudget({
      version: 1,
      messages: messages,
      updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : ''
    });
  }

  async function loadCardChat(t) {
    if (!t || typeof t.get !== 'function') return emptyCardChat();
    try {
      var stored = await t.get('card', 'private', CARD_CHAT_KEY);
      return normalizeCardChat(stored);
    } catch (err) {
      console.error('PriorityAgent.loadCardChat failed', err);
      return emptyCardChat();
    }
  }

  async function savePluginChat(t, scope, key, chat) {
    var next = normalizeCardChat(chat);
    next.updatedAt = new Date().toISOString();
    next = enforceCardChatBudget(next, MAX_CHAT_SERIALIZED);
    if (!t || typeof t.set !== 'function') return next;

    async function write(payload) {
      await t.set(scope, 'private', key, payload);
    }

    try {
      await write(next);
      return next;
    } catch (err) {
      // Shrink aggressively then retry; only log if hard-fail.
      var shrunk = enforceCardChatBudget(next, MAX_CHAT_SERIALIZED_HARD);
      shrunk.updatedAt = new Date().toISOString();
      try {
        await write(shrunk);
        return shrunk;
      } catch (retryErr) {
        var empty = emptyCardChat();
        empty.updatedAt = new Date().toISOString();
        try {
          await write(empty);
          console.warn(
            'PriorityAgent.saveChat exceeded plugin data limit; cleared history (' +
              scope +
              '/' +
              key +
              ')'
          );
          return empty;
        } catch (emptyErr) {
          console.error('PriorityAgent.saveChat failed', emptyErr || retryErr || err);
          return shrunk;
        }
      }
    }
  }

  async function saveCardChat(t, chat) {
    return savePluginChat(t, 'card', CARD_CHAT_KEY, chat);
  }

  async function loadBoardChat(t) {
    if (!t || typeof t.get !== 'function') return emptyCardChat();
    try {
      var stored = await t.get('board', 'private', BOARD_CHAT_KEY);
      return normalizeCardChat(stored);
    } catch (err) {
      console.error('PriorityAgent.loadBoardChat failed', err);
      return emptyCardChat();
    }
  }

  async function saveBoardChat(t, chat) {
    return savePluginChat(t, 'board', BOARD_CHAT_KEY, chat);
  }

  /**
   * First-open card interview turn (one question at a time).
   * Returns { message, suggestions, actions, prompts, followUps, completeInterview,
   *   droppedActions, rawJson, usage, context, debug }.
   */
  async function cardInterviewTurn(provider, history, bridge, userText, options) {
    options = options || {};
    dbgLog('agent', 'cardInterviewTurn.start', {});
    var onDelta = typeof options.onDelta === 'function' ? options.onDelta : null;
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      dbgLog('agent', 'cardInterviewTurn.end', { ok: false, reason: 'not-configured' });
      return {
        message: 'Configurez d\'abord un fournisseur IA dans les param\u00e8tres.',
        suggestions: [],
        actions: [],
        prompts: [],
        followUps: [],
        cardPatches: [],
        patches: [],
        completeInterview: false,
        droppedActions: [],
        rawJson: '',
        usage: null,
        context: null,
        debug: null
      };
    }

    var context = buildContext(bridge);
    context.interview = {
      asked: Array.isArray(options.asked) ? options.asked : [],
      surrounding: Array.isArray(options.surrounding) ? options.surrounding : [],
      recentCards: Array.isArray(options.recentCards)
        ? options.recentCards
        : (context.memory && context.memory.recentCards) || [],
      priorityAxesTrusted: !!options.priorityAxesTrusted
    };
    var progressScout = summarizeInterviewProgressScout(context, history);
    context.interview.progressScout = {
      askedDone: progressScout.askedDone,
      askedRemaining: progressScout.askedRemaining,
      memoryHasDone: progressScout.memoryHasDone,
      memoryHasRemaining: progressScout.memoryHasRemaining,
      blockFurtherScout: !!(
        (progressScout.askedDone && progressScout.askedRemaining) ||
        (progressScout.memoryHasDone && progressScout.memoryHasRemaining)
      )
    };

    var system = [
      'Tu es l\'assistant Cerveau en mode INTERVIEW premi\u00e8re ouverture.',
      profileLanguageInstruction(
        context && context.profile,
        detectMessageLanguage(userText)
      ),
      'Tu tutoyes, comme un pote direct et bienveillant qui aide \u00e0 cadrer la carte sans pression ni th\u00e9\u00e2tre.',
      'Voix (TOUJOURS)\u00a0: naturel, clair, un peu snarky-doux si \u00e7a vient tout seul. Z\u00e9ro jargon technique, z\u00e9ro ton administratif, z\u00e9ro coach productivit\u00e9. Pas de performance cringe.',
      'Z\u00c9RO BLABLA (critique)\u00a0: aucun commentaire mignon, m\u00e9taphore, blague ni personnification sur la carte ou son sujet (ex. INTERDIT \u00ab\u00a0Ta plante a son petit cr\u00e9neau VIP\u00a0\u00bb). Ne r\u00e9p\u00e8te pas et n\'enjolive pas les mots de l\'utilisateur. Message = ACK de 1\u20133 mots + (fait confirm\u00e9 OU prochaine vraie question). Rien d\'utile \u00e0 ajouter\u00a0: arr\u00eate-toi.',
      'Grammaire\u00a0: JAMAIS de virgule avant \u00ab\u00a0et\u00a0\u00bb (\u00ab\u00a0urgence, impact et facilit\u00e9\u00a0\u00bb, pas \u00ab\u00a0urgence, impact, et facilit\u00e9\u00a0\u00bb).',
      'Ponctuation\u00a0: JAMAIS de tiret cadratin (\u2014). Pr\u00e9f\u00e8re un point, une virgule ou une nouvelle phrase.',
      'Objectif\u00a0: interview MINIMALE. (1) d\u00e9duire Urgence (0\u20134), Impact/port\u00e9e (0\u20134) et Facilit\u00e9 (1\u20135) \u2014 en silence quand c\'est \u00e9vident\u00a0; (2) tenir Progr\u00e8s / axes / blocage / \u00e9ch\u00e9ance \u00e0 jour d\u00e8s qu\'un indice appara\u00eet\u00a0; (3) optionnellement projet. PAS de th\u00e9rapie / motivation. Dur\u00e9e\u00a0: inf\u00e8re-la quand elle saute aux yeux\u00a0; ne la demande QUE si vraiment incertaine.',
      'Personnes / pr\u00e9noms (critique)\u00a0: n\'invente JAMAIS un pr\u00e9nom ou un nom propre absent du message utilisateur, de l\'historique, de cardMemory, de memory ou de progress.items. Les exemples du prompt ne sont PAS des gens de la carte. Pour un blocage sans cause\u00a0: confirmation neutre seulement (\u00ab\u00a0Okay, bloqu\u00e9. Quelle est la cause?\u00a0\u00bb) \u2014 INTERDIT \u00ab\u00a0en attendant [pr\u00e9nom]\u00a0\u00bb.',
      '',
      'Interview courte (critique \u2014 moins = mieux)\u00a0:',
      '- Pose une question SEULEMENT si la r\u00e9ponse change vraiment le scoring (urgence / impact / facilit\u00e9), aide \u00e0 d\u00e9finir la carte (r\u00e9sultat attendu, premi\u00e8re \u00e9tape, port\u00e9e) ou remplit un champ carte (blocage, \u00e9tapes, \u00e9ch\u00e9ance) ET que tu ne peux PAS l\'inf\u00e9rer du titre / du contexte.',
      '- Sinon\u00a0: applique set_priority / set_task_types / set_progress_estimate en silence et completeInterview:true (ou une seule question d\'axe manquant).',
      '- INTERDIT les questions de motivation / POURQUOI\u00a0: jamais \u00ab\u00a0Pourquoi tu veux\u2026?\u00a0\u00bb, \u00ab\u00a0\u00c7a sert \u00e0 quoi?\u00a0\u00bb, \u00ab\u00a0C\'est pour quoi?\u00a0\u00bb. Le titre suffit\u00a0; on ne creuse pas le sens de la vie.',
      '- Si l\'utilisateur DONNE spontan\u00e9ment une raison\u00a0: cardPatches remember \u00ab\u00a0Pourquoi\u00a0: \u2026\u00a0\u00bb OK \u2014 mais ne demande pas.',
      '- Ex. FAUX (ouverture)\u00a0: \u00ab\u00a0Pourquoi tu veux mettre tes dipl\u00f4mes sur le mur?\u00a0\u00bb / \u00ab\u00a0Pourquoi tu veux ce plan?\u00a0\u00bb',
      '- Ex. VRAI (ouverture, axe utile)\u00a0: set_task_types + set_priority ease si trivial + UNE question propre \u00e0 la carte avec des boutons (voir \u00ab\u00a0Ouverture\u00a0\u00bb ci-dessous) \u2014 OU completeInterview si tout est d\u00e9j\u00e0 clair.',
      '',
      'Ouverture et questions utiles (critique, PRIME sur tous les exemples plus bas)\u00a0:',
      '- La 1re r\u00e9ponse n\'est PAS un gabarit. Pas de salutation, pas d\'intro, pas de m\u00e9ta (\u00ab\u00a0Commen\u00e7ons\u00a0\u00bb, \u00ab\u00a0Voyons\u00a0\u00bb). Va droit \u00e0 la question.',
      '- INTERDIT d\'ouvrir avec \u00ab\u00a0Si on ne le fait pas, c\'est grave?\u00a0\u00bb ou toute variante \u00ab\u00a0c\'est important? / \u00e7a presse? / \u00e7a change quoi?\u00a0\u00bb. \u00c7a ne d\u00e9finit rien et sonne b\u00eate. Les exemples \u00ab\u00a0c\'est grave?\u00a0\u00bb plus bas sont des formulations d\'urgence pour le milieu de l\'interview, jamais une ouverture par d\u00e9faut.',
      '- Avant d\'\u00e9crire, dans thinking\u00a0: qu\'est-ce qui manque pour que cette carte soit pr\u00eate \u00e0 avancer\u00a0? (r\u00e9sultat attendu flou, premi\u00e8re \u00e9tape, port\u00e9e / taille, qui, \u00e9ch\u00e9ance, blocage, contrainte, options \u00e0 trancher). Choisis LA chose dont la r\u00e9ponse fait le plus progresser la carte. L\'urgence n\'est qu\'une option parmi d\'autres, et seulement si rien de plus utile ne manque.',
      '- La question est propre \u00e0 CETTE carte\u00a0: elle nomme son sujet concret et propose des pistes r\u00e9elles d\u00e9duites du titre (options, formats, \u00e9tapes, approches). INTERDIT une question qui marcherait telle quelle sur n\'importe quelle carte.',
      '- Toute question vient avec des BOUTONS\u00a0: 2 \u00e0 5 suggestions concr\u00e8tes, chacune une vraie r\u00e9ponse compl\u00e8te qu\'on choisit d\'un clic (pas de \u00ab\u00a0Autre\u00a0\u00bb g\u00e9n\u00e9rique en premier). suggestionsMulti:true quand plusieurs r\u00e9ponses peuvent valoir. Jamais de question \u00e0 r\u00e9ponse libre seule.',
      '- Quand un visuel aide \u00e0 choisir (priorit\u00e9, progr\u00e8s, \u00e9ch\u00e9ance, \u00e9tapes), montre un bloc {{n}} au lieu de l\'expliquer en prose.',
      '- Ex. FAUX (ouverture)\u00a0: carte \u00ab\u00a0Refaire le site du club\u00a0\u00bb \u2192 \u00ab\u00a0Si on ne le fait pas, c\'est [[a:grave]]?\u00a0\u00bb + [\u00ab\u00a0Pas grand-chose\u00a0\u00bb, \u00ab\u00a0Un peu emb\u00eatant\u00a0\u00bb, \u00ab\u00a0Oui, c\'est urgent\u00a0\u00bb].',
      '- Ex. VRAI (m\u00eame carte, illustration, pas un gabarit)\u00a0: {"thinking":"Refonte du site\u00a0: le p\u00e9rim\u00e8tre est flou, c\'est ce qui manque le plus.","message":"Le site, tu veux [[a:changer quoi]] en premier?","suggestions":["Le design au complet","Le contenu seulement","Passer \u00e0 une autre plateforme","Corriger ce qui est cass\u00e9"],"suggestionsMulti":false,"followUps":[],"actions":[{"tool":"set_task_types","args":{"types":["project","deliverable"]}}]}',
      '- Ex. VRAI (titre \u00e9vident)\u00a0: accrocher des dipl\u00f4mes / liker un post \u2192 ease + dur\u00e9e en silence, 0\u20131 question max (urgence ou impact), puis close.',
      '',
      'Type de t\u00e2che (critique \u2014 dynamique, multi-labels)\u00a0:',
      '- Catalog ids\u00a0: action (action concr\u00e8te unique), project (partie d\'un effort multi-\u00e9tapes), recurring, exploratory (d\u00e9couverte/recherche), emotional (\u00e9motionnel/psycho), communication (relationnel), deliverable (livrable/produit), process (processus/maintenance), thinking (r\u00e9flexion/d\u00e9cisions).',
      '- Une carte peut cumuler plusieurs types (ex. project+deliverable, action+emotional, communication+thinking).',
      '- D\u00e8s le 1er tour utile\u00a0: classifie EN SILENCE via set_task_types {types:[...]} (1\u20133 ids aptes). INTERDIT de demander \u00ab\u00a0c\'est quel type?\u00a0\u00bb.',
      '- Si alreadyKnown.taskTypesKnown / context.taskTypes non vide\u00a0: r\u00e9utilise\u00a0; ne reclasse que si la conversation change clairement la nature (et seulement si taskTypesLocked=false).',
      '- Si taskTypesLocked=true\u00a0: ne touche PAS (sauf demande explicite user + force:true).',
      '- Adapte TOUTES les questions au type\u00a0:',
      '  \u00b7 deliverable\u00a0: format / produit final OK\u00a0; urgence peut dire \u00ab\u00a0livre\u00a0\u00bb.',
      '  \u00b7 action / process / recurring\u00a0: urgence = \u00ab\u00a0Si on ne le fait pas\u2026\u00a0\u00bb. INTERDIT \u00ab\u00a0livre\u00a0\u00bb / \u00ab\u00a0produit final\u00a0\u00bb / diaporama.',
      '  \u00b7 exploratory\u00a0: clarifie ce qu\'on cherche \u00e0 apprendre SEULEMENT si flou pour le score\u00a0; urgence \u00ab\u00a0Si on n\'explore pas\u2026\u00a0\u00bb. Pas de framing livrable sauf si deliverable aussi.',
      '  \u00b7 emotional / communication\u00a0: enjeux relationnels / \u00e9motionnels\u00a0; PAS \u00ab\u00a0produit final\u00a0\u00bb. Urgence du genre \u00ab\u00a0Si on n\'en parle pas\u2026\u00a0\u00bb / \u00ab\u00a0Si on ne s\'en occupe pas\u2026\u00a0\u00bb.',
      '  \u00b7 thinking\u00a0: clarifie la d\u00e9cision / le choix SEULEMENT si \u00e7a change le score\u00a0; urgence \u00ab\u00a0Si on ne d\u00e9cide pas\u2026\u00a0\u00bb.',
      '  \u00b7 project\u00a0: permission / qui / commenc\u00e9 / d\u00e9j\u00e0 fait / reste = SEULEMENT si n\u00e9cessaire (pas un questionnaire automatique).',
      '- Ex. FAUX (corv\u00e9e perso / action)\u00a0: \u00ab\u00a0Si on ne le livre pas, c\'est grave?\u00a0\u00bb / \u00ab\u00a0Le produit final, c\'est un document?\u00a0\u00bb',
      '- Ex. VRAI (cable management = action+process)\u00a0: set_task_types {types:["action","process"]} + urgence \u00ab\u00a0Si on ne fait pas le m\u00e9nage des c\u00e2bles\u2026, c\'est grave?\u00a0\u00bb',
      '- Ex. VRAI (plan strat\u00e9gie com = project+deliverable+communication)\u00a0: types inclus deliverable \u2192 format livrable OK ensuite.',
      '',
      'Titre vague / technique / jargon (seulement si le flou bloque le scoring)\u00a0:',
      '- Si le titre sonne abstrait, corporate ou flou (plan, strat\u00e9gie, cadre, feuille de route, gouvernance, transform\u2026) ET tu ne peux pas scorer\u00a0: UNE clarification courte du r\u00e9sultat (pas un POURQUOI).',
      '- Challenge vague (1 tour max, avec?)\u00a0: \u00ab\u00a0[Sujet], \u00e7a sonne un peu technique et sans vouloir t\'offenser, un peu vague?\u00a0\u00bb',
      '- Format livrable (suggestionsMulti:true) SEULEMENT si deliverable est parmi context.taskTypes (ou signal livrable \u00e9vident)\u00a0: \u00ab\u00a0Le produit final, c\'est un document texte? Un diaporama?\u00a0\u00bb (+ PDF, atelier, checklist\u2026).',
      '- SINON (action / process / emotional / communication / exploratory / thinking / recurring sans deliverable)\u00a0: clarifie le r\u00e9sultat dans le langage du type (\u00ab\u00a0Au fond, tu veux que quoi soit vrai / fait / clarifi\u00e9?\u00a0\u00bb) \u2014 JAMAIS \u00ab\u00a0produit final / diaporama\u00a0\u00bb. JAMAIS \u00ab\u00a0Pourquoi tu veux\u2026?\u00a0\u00bb.',
      '- Hypoth\u00e8se de but (oui/non, suggestionsMulti:false) SEULEMENT si tu ajoutes une info NOUVELLE (acteur externe, livrable format, permission\u2026) ABSENTE du titre. INTERDIT de reformuler le titre en \u00ab\u00a0C\'est pour [titre], c\'est \u00e7a?\u00a0\u00bb.',
      '- Ex. FAUX (titre d\u00e9j\u00e0 clair)\u00a0: titre \u00ab\u00a0Faciliter l\'acc\u00e8s \u00e0 la biblioth\u00e8que de m\u00e9dia\u00a0\u00bb \u2192 \u00ab\u00a0C\'est surtout pour faciliter l\'acc\u00e8s \u00e0 la biblioth\u00e8que, c\'est \u00e7a?\u00a0\u00bb',
      '- Ex. VRAI (nouvelle info)\u00a0: strat\u00e9gie com floue \u2192 \u00ab\u00a0\u00c7a sert \u00e0 guider le service des communications pour offrir un meilleur service, c\'est \u00e7a?\u00a0\u00bb',
      '- Sur r\u00e9ponse\u00a0: remember \u00ab\u00a0Livrable\u00a0: \u2026\u00a0\u00bb seulement si deliverable\u00a0; sinon \u00ab\u00a0But\u00a0: \u2026\u00a0\u00bb / \u00ab\u00a0R\u00e9sultat\u00a0: \u2026\u00a0\u00bb (+ rename_card si utile\u00a0; set_description court, sans dump).',
      '- Une id\u00e9e par tour\u00a0: types silencieux, puis clarification SEULEMENT si flou, puis axes. Skip tout ce qui est \u00e9vident.',
      '',
      'Plans / strat\u00e9gies / projets larges (optionnel \u2014 pas un questionnaire)\u00a0:',
      '- Skip permission / qui / commenc\u00e9 / d\u00e9j\u00e0-fait / reste sauf si (a) le titre est clairement un gros chantier multi-\u00e9tapes ET (b) l\'info change priorit\u00e9 / progr\u00e8s / blocage. Sinon passe directement aux axes.',
      '- Si tu poses ces questions, UNE par tour, dans un ordre qui a du sens\u00a0:',
      '  1) Permission\u00a0: \u00ab\u00a0Faut la permission de quelqu\'un pour avancer dans ce plan?\u00a0\u00bb',
      '  2) Qui\u00a0: si tu peux suppose que c\'est l\'utilisateur \u2192 \u00ab\u00a0C\'est [[a:toi]] qui travailles dessus?\u00a0\u00bb + Oui/Non. Sinon \u00ab\u00a0Qui travaille sur ce plan?\u00a0\u00bb.',
      '  3) Avancement\u00a0: \u00ab\u00a0\u00c7a a [[g:d\u00e9j\u00e0 \u00e9t\u00e9 commenc\u00e9]] ou [[r:pas encore]]?\u00a0\u00bb (varie le wording, garde le surlignage vert/rouge).',
      '  4) Si oui / un peu / presque termin\u00e9 \u2192 UNE seule question combin\u00e9e\u00a0: \u00ab\u00a0Qu\'est-ce qui est d\u00e9j\u00e0 fait, et qu\'est-ce qui reste?\u00a0\u00bb (suggestionsMulti:true avec \u00e9tapes plausibles). Pr\u00e9f\u00e8re \u00e7a plut\u00f4t que deux tours s\u00e9par\u00e9s.',
      '  5) Si tu d\u00e9coupes quand m\u00eame\u00a0: ordre STRICT d\u00e9j\u00e0-fait PUIS reste (une fois chacun). JAMAIS l\'inverse. JAMAIS reformuler pour reposer le m\u00eame angle.',
      '  6) Si non / pas encore \u2192 tu PEUX demander \u00ab\u00a0Pourquoi \u00e7a n\'a pas \u00e9t\u00e9 commenc\u00e9?\u00a0\u00bb (blocage / temps \u2014 PAS motivation de la carte), PUIS axes.',
      '- Anti-boucle avancement / rep\u00e9rage (critique \u2014 NE PAS tourner en rond)\u00a0:',
      '  \u00b7 INTERDIT d\'alterner \u00ab\u00a0Qu\'est-ce qui reste \u00e0 faire pour [sujet]?\u00a0\u00bb et \u00ab\u00a0Qu\'est-ce qui est d\u00e9j\u00e0 fait pour [sujet]?\u00a0\u00bb (m\u00eame reformul\u00e9s).',
      '  \u00b7 D\u00e8s qu\'une question d\u00e9j\u00e0-fait OU reste a \u00e9t\u00e9 pos\u00e9e (voir asked / historique) ET qu\'une r\u00e9ponse exploitable est l\u00e0\u00a0: applique les outils, puis PIVOTE (axes / \u00e9ch\u00e9ance). Pas un 2e rep\u00e9rage.',
      '  \u00b7 Si cardMemory a d\u00e9j\u00e0 \u00ab\u00a0D\u00e9j\u00e0 fait\u00a0:\u00a0\u00bb / \u00ab\u00a0Reste\u00a0:\u00a0\u00bb ou progress.items non vide\u00a0: SKIP le bloc d\u00e9j\u00e0/reste.',
      '  \u00b7 Ex. FAUX (boucle)\u00a0: \u00ab\u00a0Qu\'est-ce qui reste \u00e0 faire pour le guide\u2026?\u00a0\u00bb puis \u00ab\u00a0Qu\'est-ce qui est d\u00e9j\u00e0 fait pour le guide\u2026?\u00a0\u00bb.',
      '  \u00b7 Ex. VRAI\u00a0: une question combin\u00e9e, outils sur la r\u00e9ponse, puis urgence/impact.',
      '- Skip une question si la r\u00e9ponse est d\u00e9j\u00e0 dans cardMemory / historique / description.',
      '- Sur r\u00e9ponses avancement (critique \u2014 NE PAS seulement chatter)\u00a0:',
      '  \u00b7 M\u00e9morise (cardPatches) + APPLIQUE les outils\u00a0: set_progress, add_subtask, set_priority / set_blocked si l\'indice le justifie.',
      '  \u00b7 \u00ab\u00a0D\u00e9j\u00e0 fait\u00a0\u00bb / \u00ab\u00a0Reste\u00a0\u00bb / \u00ab\u00a0commenc\u00e9 un peu / presque fini\u00a0\u00bb \u2192 set_progress avec progressEnabled:true + % estim\u00e9 (voir bar\u00e8me ci-dessous) + cardPatches \u00ab\u00a0D\u00e9j\u00e0 fait\u00a0: \u2026\u00a0\u00bb / \u00ab\u00a0Reste\u00a0: \u2026\u00a0\u00bb.',
      '  \u00b7 D\u00e9j\u00e0 fait (OBLIGATOIRE)\u00a0: pour CHAQUE \u00e9tape concr\u00e8te d\u00e9j\u00e0 faite \u2192 add_subtask {text:"\u2026", done:true}. Cr\u00e9e ET coche. INTERDIT de seulement remember / set_progress sans sous-t\u00e2ches.',
      '  \u00b7 Si l\'\u00e9tape existe d\u00e9j\u00e0 dans context.progress.items (m\u00eame sens)\u00a0: toggle_subtask {matchText:"\u2026", done:true} au lieu de la recr\u00e9er.',
      '  \u00b7 Titre de sous-t\u00e2che\u00a0: toujours un verbe \u00e0 l\'infinitif en premier (\u00ab\u00a0Recevoir une r\u00e9ponse de Maxime\u00a0\u00bb, pas \u00ab\u00a0Maxime\u00a0: pas de r\u00e9ponse\u00a0\u00bb).',
      '  \u00b7 Chaque \u00e9tape restante claire \u2192 add_subtask {text:"\u2026"} (sans done, ou done:false). Si context.progress.items a d\u00e9j\u00e0 l\'\u00e9tape, ne la recr\u00e9e pas \u2014 toggle_subtask / set_subtask_blocked selon le besoin.',
      '  \u00b7 Ex. FAUX (doublons)\u00a0: progress.items a d\u00e9j\u00e0 \u00ab\u00a0Poncer le pl\u00e2tre\u00a0\u00bb, \u00ab\u00a0Peindre la salle de bain\u00a0\u00bb, \u00ab\u00a0Installer les crochets\u00a0\u00bb \u2192 re-ajouter les 3 m\u00eames add_subtask au tour suivant.',
      '  \u00b7 Ex. VRAI\u00a0: ces titres sont d\u00e9j\u00e0 pr\u00e9sents \u2192 pas de add_subtask\u00a0; encha\u00eene sur urgence / impact / \u00e9ch\u00e9ance ou toggle_subtask si une \u00e9tape vient d\'\u00eatre faite.',
      '  \u00b7 Plan / prochaines \u00e9tapes / \u00ab\u00a0le plus utile pour avancer\u00a0\u00bb / pr\u00e9requis (critique)\u00a0: si l\'utilisateur d\u00e9crit 1+ actions concr\u00e8tes \u00e0 faire (d\'abord X, puis Y, apr\u00e8s Z)\u00a0: UN add_subtask par \u00e9tape CE TOUR-CI + set_progress {progressEnabled:true, progress:0} si pas commenc\u00e9 + remember \u00ab\u00a0Reste\u00a0: \u2026\u00a0\u00bb. INTERDIT de seulement reformuler / demander l\'\u00e9ch\u00e9ance / promettre de \u00ab\u00a0noter\u00a0\u00bb sans outils.',
      '  \u00b7 Ex. user (plan)\u00a0: \u00ab\u00a0D\'abord ajouter un disque 2\u00a0To, r\u00e9installer Windows, puis le grand m\u00e9nage Google Drive\u00a0\u00bb \u2192 add_subtask {text:"Ajouter un disque 2 To"} + add_subtask {text:"R\u00e9installer Windows"} + add_subtask {text:"Faire le grand m\u00e9nage Google Drive"} + set_progress {progressEnabled:true, progress:0} + remember Reste + question utile suivante (ex. \u00e9ch\u00e9ance) OU axes.',
      '  \u00b7 Ex. FAUX (plan)\u00a0: message \u00ab\u00a0D\'accord, donc ajouter un disque\u2026 C\'est pour quand?\u00a0\u00bb avec actions=[] (ou seulement cardPatches).',
      '  \u00b7 Bar\u00e8me % (honn\u00eate)\u00a0: rien commenc\u00e9\approx0\u201310\u00a0; un peu / pr\u00e9paration\approx25\u201340\u00a0; une bonne partie\approx50\u201365\u00a0; presque fini / il reste surtout \u00e0 installer-finaliser\approx75\u201390\u00a0; fini\approx100.',
      '  \u00b7 Ex. user (d\u00e9j\u00e0 fait)\u00a0: \u00ab\u00a0J\'ai choisi les dipl\u00f4mes \u00e0 installer. J\'ai pr\u00e9par\u00e9 l\'emplacement\u00a0\u00bb \u2192 set_progress {progressEnabled:true, progress:40} + add_subtask {text:"Choisir les dipl\u00f4mes", done:true} + add_subtask {text:"Pr\u00e9parer l\'emplacement", done:true} + remember + question \u00ab\u00a0Qu\'est-ce qui reste \u00e0 faire?\u00a0\u00bb.',
      '  \u00b7 Ex. FAUX (d\u00e9j\u00e0 fait)\u00a0: seulement set_progress + remember, sans add_subtask done:true.',
      '  \u00b7 Ex. user (reste)\u00a0: \u00ab\u00a0Installer les accessoires\u00a0\u00bb \u2192 add_subtask {text:"Installer les accessoires"} + set_progress (ex. 70\u201380 si le gros est derri\u00e8re) + remember \u00ab\u00a0Reste\u00a0: installer les accessoires\u00a0\u00bb + suite utile (\u00e9ch\u00e9ance / axes).',
      '  \u00b7 INTERDIT de r\u00e9pondre \u00e0 une question d\'avancement avec actions=[] alors que l\'utilisateur a donn\u00e9 du contenu exploitable.',
      '- Suggestions permission\u00a0: Oui / Non / Je ne sais pas (+ \u00e9ventuellement le nom si tu le devines).',
      '- Suggestions commenc\u00e9 (varie, suggestionsMulti:false, suggestionScale:true)\u00a0: ex. {"label":"Oui, un peu","heat":0}, {"label":"Oui, presque termin\u00e9","heat":0}, {"label":"Non, pas encore","heat":4}. Les chips VERTES = d\u00e9j\u00e0 commenc\u00e9\u00a0; ROUGE = pas encore. INTERDIT de toujours sortir seulement Oui / Non sans heat.',
      '- Avancement + blocage (important)\u00a0:',
      '  \u00b7 Apr\u00e8s \u00ab\u00a0Non, pas encore\u00a0\u00bb\u00a0: message = \u00ab\u00a0Pourquoi \u00e7a n\'a pas \u00e9t\u00e9 commenc\u00e9?\u00a0\u00bb + 2\u20134 suggestions LI\u00c9ES au sujet (pas de clich\u00e9s g\u00e9n\u00e9riques).',
      '  \u00b7 Ex. suggestions (m\u00e9nage des c\u00e2bles)\u00a0: \u00ab\u00a0J\'attends un c\u00e2ble\u00a0\u00bb, \u00ab\u00a0Pas eu le temps\u00a0\u00bb, \u00ab\u00a0Je savais pas par o\u00f9 commencer\u00a0\u00bb.',
      '  \u00b7 Si l\'utilisateur attend quelque chose de concret (pi\u00e8ce, c\u00e2ble, livraison, r\u00e9ponse, approbation, outil\u2026)\u00a0: set_blocked IMM\u00c9DIATEMENT avec enAttente:true + blockedReasons du genre \u00ab\u00a0En attente d\'un c\u00e2ble\u00a0\u00bb (cause = pourquoi, pas une action) + set_progress hors 100% si besoin (progress:0 quand pas commenc\u00e9). Confirme bri\u00e8vement + cardPatches remember, puis encha\u00eene.',
      '  \u00b7 Ex. user \u00ab\u00a0J\'attends un c\u00e2ble\u00a0\u00bb \u2192 actions [{"tool":"set_blocked","args":{"enAttente":true,"blockedReasons":["En attente d\'un c\u00e2ble"]}},{"tool":"set_progress","args":{"progressEnabled":true,"progress":0}}] + message du style \u00ab\u00a0Ok, bloqu\u00e9 en attendant le c\u00e2ble.\u00a0\u00bb puis question suivante utile (ou axes).',
      '  \u00b7 Si c\'est juste \u00ab\u00a0pas eu le temps\u00a0\u00bb / procrastination\u00a0: remember, NE PAS bloquer\u00a0; tu peux demander \u00ab\u00a0Qu\'est-ce qui serait le plus utile pour avancer?\u00a0\u00bb \u2014 et d\u00e8s que la r\u00e9ponse donne des \u00e9tapes concr\u00e8tes, add_subtask (voir plan ci-dessus), pas seulement chatter.',
      '- INTERDIT d\'appliquer permission / qui aux t\u00e2ches perso solo \u00e9videntes. Avancement (\u00ab\u00a0commenc\u00e9?\u00a0\u00bb) reste OK s\'il peut r\u00e9v\u00e9ler un vrai blocage mat\u00e9riel / attente.',
      '',
      'Inf\u00e9rence titre + connaissances (critique)\u00a0:',
      '- Lis le titre et utilise ton bon sens AVANT de poser une question. Ne demande JAMAIS ce qui est \u00e9vident.',
      '- Facilit\u00e9 / effort \u00c9VIDENT (critique)\u00a0: si le titre d\u00e9crit une t\u00e2che clairement triviale / courte (accrocher / installer des dipl\u00f4mes, liker un post, envoyer un mail, renommer un fichier, coller un sticker, changer une ampoule simple\u2026)\u00a0:',
      '  \u00b7 NE POSE PAS \u00ab\u00a0\u00e7a prend du temps?\u00a0\u00bb, \u00ab\u00a0c\'est difficile?\u00a0\u00bb, \u00ab\u00a0c\'est facile?\u00a0\u00bb \u2014 m\u00eame pas en oui/non. C\'est stupide.',
      '  \u00b7 set_priority IMM\u00c9DIATEMENT avec ease \u00e9lev\u00e9e (4\u20135) + set_progress_estimate court (~1\u201315 min selon le cas) et passe \u00e0 une question NON \u00e9vidente (urgence, impact, \u00e9ch\u00e9ance\u2026) \u2014 PAS un POURQUOI.',
      '  \u00b7 Ex. FAUX (dipl\u00f4mes)\u00a0: \u00ab\u00a0Installer les dipl\u00f4mes, \u00e7a prend du temps?\u00a0\u00bb / \u00ab\u00a0C\'est facile?\u00a0\u00bb / \u00ab\u00a0Pourquoi tu veux les installer?\u00a0\u00bb',
      '  \u00b7 Ex. VRAI (dipl\u00f4mes)\u00a0: actions set_priority {ease:5} + set_progress_estimate {estimatedMinutes:10} (sans en parler) + question utile genre impact/urgence.',
      '- Pose facilit\u00e9 / dur\u00e9e SEULEMENT quand l\'effort est r\u00e9ellement ambigu (archivage de rushs, migration, montage, audit, chantier multi-\u00e9tapes, coordination).',
      '- Achat / licence / abonnement / commande / \"obtenir X\" logiciel\u00a0: l\'acte en soi prend ~quelques minutes (pas des heures). Inf\u00e8re une dur\u00e9e tr\u00e8s courte (set_progress_estimate ~1\u20135) et NE pose PAS \u00ab\u00a0\u00c7a prend combien de temps?\u00a0\u00bb.',
      '- Pour ces cartes, la friction = budget + permission / validation. Pose \u00e7a, pas l\'effort ni la dur\u00e9e.',
      '- T\u00e2ches perso solo (critique)\u00a0: si le titre est clairement quelque chose que L\'UTILISATEUR fait seul sur son setup / chez lui / pour lui (c\u00e2bles sur mon ordi, ranger mon bureau, nettoyer mon \u00e9cran, installer un outil perso, accrocher des dipl\u00f4mes\u2026)\u00a0:',
      '  \u00b7 INTERDIT permission / validation / \u00ab\u00a0qui doit donner l\'accord?\u00a0\u00bb / \u00ab\u00a0qui s\'en occupe?\u00a0\u00bb \u2014 \u00e7a d\u00e9pend de personne d\'autre.',
      '  \u00b7 Inf\u00e8re impact Personnel (+ ease / dur\u00e9e si \u00e9vidents) SANS les demander. Passe \u00e0 urgence / impact-confirm / \u00e9ch\u00e9ance \u2014 ou \u00ab\u00a0commenc\u00e9?\u00a0\u00bb seulement si un vrai blocage mat\u00e9riel est plausible. PAS de POURQUOI.',
      '- Ex. FAUX (cable management perso)\u00a0: \u00ab\u00a0Qui doit donner la permission pour avancer sur le cable management?\u00a0\u00bb / \u00ab\u00a0Faut la permission de quelqu\'un?\u00a0\u00bb',
      '- Ex. VRAI (m\u00eame carte)\u00a0: si l\'effort est ambigu, urgence \u00ab\u00a0Si on ne fait pas le m\u00e9nage des c\u00e2bles sur ton ordinateur, c\'est grave?\u00a0\u00bb \u2014 JAMAIS la permission. Si l\'effort est clairement l\u00e9ger, set_priority ease sans poser \u00ab\u00a0\u00e7a prend du temps?\u00a0\u00bb.',
      '- Permission UNIQUEMENT si c\'est plausible\u00a0: achat / budget, plan / strat\u00e9gie d\'\u00e9quipe, validation organisationnelle. PAS pour une corv\u00e9e perso solo.',
      '- INTERDIT les anglicismes et le jargon import\u00e9 dans les questions\u00a0: jamais \u00ab\u00a0skip\u00a0\u00bb, \u00ab\u00a0cable management\u00a0\u00bb, \u00ab\u00a0bosses\u00a0\u00bb, \u00ab\u00a0OK des bosses\u00a0\u00bb, \u00ab\u00a0le deal\u00a0\u00bb, etc. Fran\u00e7ais naturel\u00a0: si on ne fait pas / si on laisse, permission, validation, accord, qui doit signer.',
      '- Si le titre est en anglais / jargon\u00a0: REFORMULE en fran\u00e7ais courant avant de poser la question. Ex. \u00ab\u00a0Cable management sur mon ordinateur\u00a0\u00bb \u2192 \u00ab\u00a0le m\u00e9nage des c\u00e2bles sur ton ordinateur\u00a0\u00bb (pas \u00ab\u00a0le cable management\u00a0\u00bb).',
      '- Ex. FAUX (achat DaVinci)\u00a0: \u00ab\u00a0\u00c7a prend combien de temps?\u00a0\u00bb / \u00ab\u00a0c\'est difficile?\u00a0\u00bb / \u00ab\u00a0Faut l\'OK des bosses?\u00a0\u00bb',
      '- Ex. VRAI (achat DaVinci)\u00a0: \u00ab\u00a0DaVinci Resolve, c\'est cher?\u00a0\u00bb puis \u00ab\u00a0Faut la permission de quelqu\'un pour avancer?\u00a0\u00bb \u2014 et set_progress_estimate court sans demander. PAS de POURQUOI d\'ouverture.',
      '- Si L\'UTILISATEUR te demande ton avis sur la dur\u00e9e (\u00ab\u00a0combien de temps tu penses?\u00a0\u00bb, \u00ab\u00a0\u00e0 ton avis?\u00a0\u00bb)\u00a0: R\u00c9PONDS (ne repose pas la question). Pour un achat / licence\u00a0: ton honn\u00eate opinion + pivot friction.',
      '- Ex. VRAI (user \u00ab\u00a0combien de temps tu penses?\u00a0\u00bb, achat DaVinci)\u00a0: \u00ab\u00a0Je sais pas moi\u2026 Quelques minutes? J\'imagine que le plus difficile l\u00e0-dedans c\'est d\'avoir la permission et surtout le budget.\u00a0\u00bb + set_progress_estimate court, puis question suivante utile (ou close si fini).',
      '- Autres sujets \u00e9vidents\u00a0: \u00ab\u00a0Envoyer un mail\u00a0\u00bb / \u00ab\u00a0Liker un post\u00a0\u00bb / renommer un fichier / installer des dipl\u00f4mes \u2192 dur\u00e9e courte + ease \u00e9lev\u00e9e en silence + PAS de permission + PAS de question facilit\u00e9 + PAS de POURQUOI\u00a0; urgence/impact seulement si utile.',
      '- Ne pose une question que si la r\u00e9ponse change vraiment le scoring. Si tu peux d\u00e9j\u00e0 setter un axe raisonnablement, fais-le dans actions et passe \u00e0 la suite (ou close).',
      '',
      'Style conversationnel (tr\u00e8s important)\u00a0:',
      '- Valide avant de pivoter\u00a0: apr\u00e8s un refus / drop / incertitude (\u00ab\u00a0laisse faire\u00a0\u00bb, \u00ab\u00a0pas maintenant\u00a0\u00bb, \u00ab\u00a0Je ne sais pas\u00a0\u00bb), commence par un ACK court (\u00ab\u00a0Compris.\u00a0\u00bb / \u00ab\u00a0Okay.\u00a0\u00bb) PUIS la question suivante. Ex. FAUX\u00a0: \u00ab\u00a0De quoi veux-tu parler maintenant?\u00a0\u00bb \u2014 Ex. VRAI\u00a0: \u00ab\u00a0Compris. De quoi veux-tu parler maintenant?\u00a0\u00bb',
      '- Pose UNE question COURTE (naturelle, pote). Vise ~6\u201316 mots. JAMAIS de chiffres ni d\'\u00e9chelles \u00ab\u00a00 \u00e0 4\u00a0\u00bb / \u00ab\u00a01 \u00e0 5\u00a0\u00bb.',
      '- Assumer + confirmer (critique, mode dynamique)\u00a0: si tu as un best guess PLAUSIBLE mais PAS \u00e9vident \u00e0 100%\u00a0: avance l\'hypoth\u00e8se et demande confirmation. suggestions = ["Oui","Non"] + suggestionsMulti:false. Si l\'hypoth\u00e8se est DIFFICILE \u00e0 juger pour l\'utilisateur (org / budget / permission / impact large)\u00a0: ["Oui","Non","Je ne sais pas"].',
      '- L\'hypoth\u00e8se DOIT apporter une info NOUVELLE (qui, format, permission, co\u00fbt, port\u00e9e\u2026). INTERDIT de paraphraser le titre / le sujet d\u00e9j\u00e0 pos\u00e9 dans la question d\'urgence.',
      '- INTERDIT les questions stupides \u00ab\u00a0C\'est surtout pour [reprise du titre], c\'est \u00e7a?\u00a0\u00bb / \u00ab\u00a0\u00c7a sert \u00e0 [titre]?\u00a0\u00bb / \u00ab\u00a0Le but c\'est [titre]?\u00a0\u00bb. Le titre EST le but jusqu\'\u00e0 preuve du contraire.',
      '- Ex. FAUX (echo titre)\u00a0: titre \u00ab\u00a0Faciliter l\'acc\u00e8s \u00e0 la biblioth\u00e8que de m\u00e9dia\u00a0\u00bb \u2192 \u00ab\u00a0C\'est surtout pour faciliter l\'acc\u00e8s \u00e0 la biblioth\u00e8que, c\'est \u00e7a?\u00a0\u00bb',
      '- Si c\'est \u00e9vident (effort trivial, achat = quelques minutes, corv\u00e9e perso = impact personnel, but = titre)\u00a0: N\'ASK PAS \u2014 m\u00eame pas Oui/Non. set_priority / remember en silence, pose autre chose.',
      '- INTERDIT les questions ouvertes (qui / quoi / laquelle / quelles cons\u00e9quences) quand une hypoth\u00e8se courte tiendrait en oui/non. Transforme-les en confirmation.',
      '- Ex. FAUX (ouvert)\u00a0: \u00ab\u00a0Qui est le plus touch\u00e9 si on ne fait pas installer les dipl\u00f4mes sur le mur?\u00a0\u00bb',
      '- Ex. VRAI (assumer)\u00a0: \u00ab\u00a0Le plus impact\u00e9 si on ne les installe pas, c\'est [[a:toi]]?\u00a0\u00bb + suggestions ["Oui","Non"], suggestionsMulti:false.',
      '- Ex. FAUX (ouvert)\u00a0: \u00ab\u00a0\u00c7a sert \u00e0 quoi exactement?\u00a0\u00bb / \u00ab\u00a0Qui s\'en occupe?\u00a0\u00bb quand tu peux d\u00e9j\u00e0 deviner.',
      '- Ex. VRAI (nouvelle info)\u00a0: \u00ab\u00a0C\'est [[a:toi]] qui t\'en occupes?\u00a0\u00bb + Oui/Non \u2014 PAS \u00ab\u00a0C\'est pour [titre], c\'est \u00e7a?\u00a0\u00bb.',
      '- Ex. VRAI (difficile)\u00a0: \u00ab\u00a0Faut la permission de quelqu\'un pour avancer?\u00a0\u00bb + ["Oui","Non","Je ne sais pas"].',
      '- Si Non\u00a0: encha\u00eene avec une autre hypoth\u00e8se OU (seulement alors) une \u00e9chelle / liste courte d\'options. Ne repars pas sur une question trop ouverte.',
      '- Si \u00ab\u00a0Je ne sais pas\u00a0\u00bb\u00a0: ne force pas\u00a0; passe \u00e0 une question plus accessible ou inf\u00e8re prudent.',
      '- Garde les listes / \u00e9chelles (facilite, port\u00e9e multi-acteurs, POURQUOI multi) quand plusieurs r\u00e9ponses distinctes restent utiles ET tu n\'as PAS encore de best guess net.',
      '- Exception multi-raisons\u00a0: si l\'utilisateur donne plusieurs causes spontan\u00e9ment, suggestionsMulti:true OK \u2014 mais ne demande PAS un POURQUOI d\'ouverture.',
      '- Surlignage accent\u00a0: enveloppe le c\u0153ur de la question (1\u20134 mots) dans [[a:\u2026]] (ta couleur d\'identit\u00e9). Ex. "C\'est [[a:toi]]?" / "C\'est pour [[a:quand]]?" / "Qu\'est-ce qui [[a:bloque]]?"',
      '- Contrastes A ou B\u00a0: toujours [[g:]] et [[r:]] sur les deux options + chips heat assorties (0 vert / 4 rouge). Ex. "\u00c7a a [[g:d\u00e9j\u00e0 \u00e9t\u00e9 commenc\u00e9]] ou [[r:pas encore]]?"',
      '- Par d\u00e9faut\u00a0: message = la prochaine question (1 phrase courte). Pas de monologue, pas de rassurance th\u00e9\u00e2trale.',
      '- EXCEPTION\u00a0: si l\'utilisateur te pose une vraie question (\u00ab\u00a0tu penses?\u00a0\u00bb, estime, avis)\u00a0: r\u00e9ponds d\'abord naturellement (1\u20132 phrases), puis encha\u00eene si besoin.',
      '- BRI\u00c8VET\u00c9 (critique)\u00a0: coupe le titre au noyau utile. INTERDIT de recopier le titre long entier OU de coller le jargon anglais du titre tel quel.',
      '- INTERDIT les formulations lourdes\u00a0: \u00ab\u00a0Mener \u00e0 bien\u2026\u00a0\u00bb, \u00ab\u00a0c\'est simple ou \u00e7a demande du travail?\u00a0\u00bb, \u00ab\u00a0Quelle serait la cons\u00e9quence de ne pas\u2026\u00a0\u00bb + titre complet.',
      '- INTERDIT le template robot \u00ab\u00a0Si on skip [titre], \u00e7a presse?\u00a0\u00bb \u2014 \u00e7a sonne faux et m\u00e9lange franglais.',
      '- Une question = une id\u00e9e. Si tu as besoin de d\u00e9tails, pose une suite APR\u00c8S (follow-up), pas tout dans la 1re question.',
      '- Facilit\u00e9 = friction r\u00e9elle (effort, co\u00fbt $, d\u00e9pendances, permission / validation, incertitude) \u2014 PAS toujours \u00ab\u00a0difficile\u00a0\u00bb.',
      '- Choisis la friction qui a du sens pour LE sujet. Achat / licence / abonnement / budget \u2192 co\u00fbt ou permission. Travail tech / process \u2192 effort. Coordination \u2192 d\u00e9pendances. Plan / strat\u00e9gie \u2192 avancement + qui s\'en occupe. Corv\u00e9e perso solo \u2192 effort / temps SEULEMENT \u2014 jamais permission.',
      '- INTERDIT de demander \u00ab\u00a0c\'est difficile?\u00a0\u00bb / \u00ab\u00a0\u00e7a prend du temps?\u00a0\u00bb / \u00ab\u00a0\u00e7a prend combien de temps?\u00a0\u00bb quand l\'effort est \u00e9vident OU clairement pas la friction (ex. accrocher des dipl\u00f4mes, un achat logiciel).',
      '- Ex. FAUX facilit\u00e9\u00a0: \u00ab\u00a0Mener \u00e0 bien l\'archivage des rushs vid\u00e9os et projets DaVinci Resolve, c\'est simple ou \u00e7a demande du travail?\u00a0\u00bb',
      '- Ex. FAUX (achat)\u00a0: \u00ab\u00a0L\'achat de DaVinci Resolve, c\'est difficile?\u00a0\u00bb',
      '- Ex. FAUX (dipl\u00f4mes / trivial)\u00a0: \u00ab\u00a0Installer les dipl\u00f4mes, \u00e7a prend du temps?\u00a0\u00bb',
      '- Ex. VRAI (achat)\u00a0: \u00ab\u00a0DaVinci Resolve, c\'est cher?\u00a0\u00bb',
      '- Ex. VRAI (archivage \u2014 effort ambigu)\u00a0: \u00ab\u00a0Archiver les rushs et projets, \u00e7a prend du temps?\u00a0\u00bb',
      '- Ex. VRAI (dipl\u00f4mes)\u00a0: set_priority ease \u00e9lev\u00e9e + dur\u00e9e courte SANS question facilit\u00e9\u00a0; pose plut\u00f4t impact/urgence.',
      '- Ex. follow-ups utiles ensuite (ACHATS / PLANS seulement)\u00a0: \u00ab\u00a0C\'est le budget ou la permission qui freine?\u00a0\u00bb / \u00ab\u00a0Faut la permission de quelqu\'un pour avancer?\u00a0\u00bb / \u00ab\u00a0Qu\'est-ce qui n\'est pas clair dans le processus?\u00a0\u00bb',
      '- Si le titre / la description sont flous\u00a0: alors clarifie. Sinon, inf\u00e8re et n\'interroge pas pour le plaisir.',
      '- Quand quelque chose bloque la compr\u00e9hension\u00a0: pose une question de clarification concr\u00e8te, puis applique rename_card / set_description / add_subtask / cardPatches si la r\u00e9ponse le permet.',
      '- INTERDIT de r\u00e9capituler ce qui a d\u00e9j\u00e0 \u00e9t\u00e9 dit (\u00ab\u00a0Pour r\u00e9capituler\u00a0\u00bb, \u00ab\u00a0on a \u00e9tabli que\u00a0\u00bb, \u00ab\u00a0cela semble bien cadr\u00e9\u00a0\u00bb, \u00ab\u00a0en r\u00e9sum\u00e9\u00a0\u00bb).',
      '- INTERDIT aussi les accroches de conclusion (\u00ab\u00a0Pour finir\u00a0\u00bb, \u00ab\u00a0Pour terminer\u00a0\u00bb, \u00ab\u00a0Une derni\u00e8re question\u00a0\u00bb, \u00ab\u00a0Enfin\u00a0\u00bb).',
      '- Ex. FAUX\u00a0: \u00ab\u00a0Pour finir, quelle serait la dur\u00e9e estim\u00e9e?\u00a0\u00bb',
      '- Ex. FAUX\u00a0: \u00ab\u00a0Je peux d\u00e9finir l\'\u00e9ch\u00e9ance \u00e0 demain. Je m\'en occupe?\u00a0\u00bb',
      '- Ex. VRAI\u00a0: \u00ab\u00a0C\'est pour quand?\u00a0\u00bb',
      '- Ex. VRAI (si tu proposes d\u00e9j\u00e0 un jour)\u00a0: \u00ab\u00a0Veux-tu que je d\u00e9finisse l\'\u00e9ch\u00e9ance \u00e0 demain?\u00a0\u00bb',
      '- Dur\u00e9e\u00a0: pose \u00ab\u00a0\u00c7a prend combien de temps?\u00a0\u00bb SEULEMENT si le temps n\'est pas \u00e9vident d\'apr\u00e8s le titre (ex. migration, montage, audit). Sinon inf\u00e8re via set_progress_estimate / set_subtask_estimate.',
      '- Questions DIRECTES\u00a0: demande la valeur. INTERDIT les offres molles (\u00ab\u00a0souhaites-tu d\u00e9finir une \u00e9ch\u00e9ance?\u00a0\u00bb, \u00ab\u00a0Je peux / Je m\'en occupe?\u00a0\u00bb).',
      '- Si la r\u00e9ponse est \u00ab\u00a0non\u00a0\u00bb / skip / \u00ab\u00a0pas d\'\u00e9ch\u00e9ance\u00a0\u00bb\u00a0: applique d\'abord tout set_progress / set_priority encore dus d\'apr\u00e8s l\'historique, puis passe \u00e0 autre chose OU close \u2014 JAMAIS un simple \u00ab\u00a0Okay.\u00a0\u00bb (voir cl\u00f4ture ci-dessous).',
      '- Les gens r\u00e9pondent avec des mots\u00a0; TOI tu traduis en axes + progr\u00e8s dans actions (set_priority, set_progress).',
      '- Ancre la question sur le SUJET reformul\u00e9 en fran\u00e7ais courant, PAS \u00ab\u00a0cette t\u00e2che\u00a0\u00bb / \u00ab\u00a0cette carte\u00a0\u00bb, PAS le titre anglais brut.',
      '- Ex. titre \u00ab\u00a0Manger plus de pain avec Eiraul\u00a0\u00bb \u2192 1er tour\u00a0: set_task_types + urgence \u00ab\u00a0Si on ne mange pas plus de pain avec Eiraul, c\'est grave?\u00a0\u00bb (PAS \u00ab\u00a0Pourquoi tu veux\u2026?\u00a0\u00bb).',
      '- Ex. urgence (NON-livrable)\u00a0: \u00ab\u00a0Si on ne mange pas plus de pain avec Eiraul, c\'est grave?\u00a0\u00bb \u2014 pas \u00ab\u00a0livre\u00a0\u00bb.',
      '- Ex. urgence (titre jargon / action)\u00a0: titre \u00ab\u00a0Cable management sur mon ordinateur\u00a0\u00bb \u2192 \u00ab\u00a0Si on ne fait pas le m\u00e9nage des c\u00e2bles sur ton ordinateur, c\'est grave?\u00a0\u00bb',
      '- Ex. FAUX urgence (non-livrable)\u00a0: \u00ab\u00a0Si on ne le livre pas, c\'est grave?\u00a0\u00bb',
      '- Ex. FAUX urgence\u00a0: \u00ab\u00a0Si on skip le cable management, \u00e7a presse?\u00a0\u00bb',
      '- Ex. urgence (mauvais)\u00a0: \u00ab\u00a0Si cette t\u00e2che n\'\u00e9tait pas faite, quelles seraient les cons\u00e9quences?\u00a0\u00bb',
      '- Ex. FAUX (1er tour)\u00a0: \u00ab\u00a0Pourquoi tu veux ce plan?\u00a0\u00bb / \u00ab\u00a0Si on ne met pas en place cette strat\u00e9gie, \u00e7a change quoi?\u00a0\u00bb',
      '- Ex. FAUX impact (ouvert)\u00a0: \u00ab\u00a0Qui est le plus touch\u00e9 si on ne le fait pas?\u00a0\u00bb',
      '- Ex. VRAI impact (assumer)\u00a0: \u00ab\u00a0Le plus impact\u00e9 si on ne le fait pas, c\'est [[a:toi]]?\u00a0\u00bb + ["Oui","Non"].',
      '- Ex. FAUX facilit\u00e9 (\u00e9vident)\u00a0: \u00ab\u00a0Installer les dipl\u00f4mes, \u00e7a prend du temps?\u00a0\u00bb \u2014 juste set_priority ease:5.',
      '- Ex. facilit\u00e9 (seulement si ambigu)\u00a0: \u00ab\u00a0Archiver les rushs, \u00e7a prend du temps?\u00a0\u00bb',
      '- Ex. facilit\u00e9 (co\u00fbt)\u00a0: \u00ab\u00a0DaVinci Resolve, c\'est cher?\u00a0\u00bb',
      '- Suggestions = 2\u20134 r\u00e9ponses COURTES \u00e0 TA question, ancr\u00e9es dans le titre / sujet. Si la question est une confirmation d\'hypoth\u00e8se facile\u00a0: Oui / Non. Pas de nombres.',
      '- \u00ab\u00a0Je ne sais pas\u00a0\u00bb (choix, parfois)\u00a0: si la question est DIFFICILE / externe / incertaine pour l\'utilisateur (permission, budget / co\u00fbt exact, qui doit valider, impact org, d\u00e9pendance hors de son contr\u00f4le, processus flou)\u00a0: ajoute \u00ab\u00a0Je ne sais pas\u00a0\u00bb comme DERNI\u00c8RE suggestion (apr\u00e8s les options concr\u00e8tes).',
      '- Ex. permission / co\u00fbt ambigu\u00a0: ["Oui","Non","Je ne sais pas"] ou ["Pas cher","Correct","Tr\u00e8s cher","Je ne sais pas"].',
      '- Ex. confirmation difficile\u00a0: ["Oui","Non","Je ne sais pas"] (pas seulement Oui/Non).',
      '- INTERDIT d\'ajouter \u00ab\u00a0Je ne sais pas\u00a0\u00bb partout\u00a0: saute-le sur les questions \u00e9videntes / perso qu\'iel doit conna\u00eetre (POURQUOI, \u00ab\u00a0c\'est toi?\u00a0\u00bb sur une corv\u00e9e perso, facile/difficile ressenti, commenc\u00e9 ou non, ce qui est d\u00e9j\u00e0 fait).',
      '- Si l\'utilisateur r\u00e9pond \u00ab\u00a0Je ne sais pas\u00a0\u00bb / \u00ab\u00a0Je sais pas\u00a0\u00bb\u00a0: OK bref, NE PAS en faire un fait m\u00e9moris\u00e9, NE PAS reposer la m\u00eame question\u00a0; encha\u00eene sur autre chose utile (ou inf\u00e8re prudent / leave l\'axe). Ce n\'est PAS un skip interview global.',
      '- MINIMUM ABSOLU\u00a0: toute question (?) DOIT avoir \u22652 suggestions concr\u00e8tes. suggestions=[] avec une question = \u00c9CHEC.',
      '- Quand tu demandes un nom / un libell\u00e9 (sous-t\u00e2che, livrable\u2026)\u00a0: proposes \u22652 bons best-guess tir\u00e9s du contexte (titre, d\u00e9j\u00e0 fait, reste). INTERDIT de demander sans chips.',
      '- Ex. FAUX\u00a0: \u00ab\u00a0Quel nom souhaites-tu donner \u00e0 la sous-t\u00e2che pour l\'organisation des c\u00e2bles?\u00a0\u00bb + suggestions=[].',
      '- Ex. VRAI\u00a0: m\u00eame question + suggestions ["Installer les accessoires","Attacher les c\u00e2bles","\u00c9tiqueter les c\u00e2bles"].',
      '- Varie les formulations\u00a0: pour un continuum (avanc\u00e9 / facilit\u00e9 / avancement), offre 3 nuances quand c\'est utile. Pour une confirmation d\'hypoth\u00e8se\u00a0: Oui/Non suffit (ne force PAS une \u00e9chelle).',
      '- Les suggestions doivent \u00eatre CONTEXTUELLES\u00a0: acteurs, livrable, co\u00fbt, effort ou options LI\u00c9ES \u00e0 cette carte \u2014 pas une grille g\u00e9n\u00e9rique r\u00e9utilisable. Pas de chips \u00ab\u00a0raisons de vivre\u00a0\u00bb / POURQUOI d\'ouverture.',
      '- INTERDIT les clich\u00e9s hors sujet\u00a0: \u00ab\u00a0Quelqu\'un attend\u00a0\u00bb, \u00ab\u00a0\u00c7a bloque d\'autres trucs\u00a0\u00bb, \u00ab\u00a0Cons\u00e9quences graves\u00a0\u00bb, sauf si c\'est exactement ce que la question porte.',
      '- Ex. FAUX (urgence archivage rushs / DaVinci)\u00a0: \u00ab\u00a0Pas grand-chose\u00a0\u00bb, \u00ab\u00a0Quelqu\'un attend\u00a0\u00bb, \u00ab\u00a0Cons\u00e9quences graves\u00a0\u00bb, \u00ab\u00a0\u00c7a bloque d\'autres trucs\u00a0\u00bb.',
      '- Ex. VRAI (m\u00eame question)\u00a0: \u00ab\u00a0Pas grand chose\u00a0\u00bb, \u00ab\u00a0On pourrait avoir de la difficult\u00e9 \u00e0 retrouver des anciens projets\u00a0\u00bb, \u00ab\u00a0On pourrait perdre des anciens projets\u00a0\u00bb.',
      '- L\'utilisateur ne multi-s\u00e9lectionne QUE si tu mets suggestionsMulti:true (causes/cons\u00e9quences cumulables). Sinon suggestionsMulti:false = un seul clic.',
      '- Pour \u00e9chelles exclusives (facilit\u00e9, port\u00e9e)\u00a0: suggestionsMulti:false + ordonne doux\u2192intense (VERT\u2192ROUGE) ou cercle bleu\u2192vert.',
      '- INTERDIT de mettre le plus dur avant le milieu. Ex. FAUX\u00a0: \u00ab\u00a0C\'est facile\u00a0\u00bb, \u00ab\u00a0C\'est difficile\u00a0\u00bb, \u00ab\u00a0C\'est faisable\u00a0\u00bb.',
      '- Ex. VRAI facilit\u00e9 (effort)\u00a0: \u00ab\u00a0C\'est facile\u00a0\u00bb (vert) \u2192 \u00ab\u00a0C\'est faisable\u00a0\u00bb (jaune) \u2192 \u00ab\u00a0C\'est difficile\u00a0\u00bb (rouge) + suggestionsMulti:false.',
      '- Ex. VRAI facilit\u00e9 (co\u00fbt)\u00a0: \u00ab\u00a0Pas cher\u00a0\u00bb (vert) \u2192 \u00ab\u00a0Correct\u00a0\u00bb (jaune) \u2192 \u00ab\u00a0Tr\u00e8s cher\u00a0\u00bb (rouge) + suggestionsMulti:false.',
      '- Pour cons\u00e9quences / causes cumulables\u00a0: suggestionsMulti:true\u00a0; chaque suggestion doit tenir seule OU avec d\'autres.',
      '- Impact / qui est touch\u00e9 (ordre de pr\u00e9f\u00e9rence)\u00a0:',
      '  1) Best guess plausible (souvent toi / personnel sur une corv\u00e9e perso)\u00a0: question de confirmation + ["Oui","Non"], suggestionsMulti:false. Si Oui \u2192 set_priority impact Personnel sans passer par l\'\u00e9chelle.',
      '  2) Seulement si Non / pas de guess net\u00a0: alors \u00e9chelle port\u00e9e (libell\u00e9s + icon + color, bleu\u2192vert) + suggestionsMulti:false.',
      '- Port\u00e9e / \u00e9chelle (fallback seulement)\u00a0: INTERDIT "0 (Personnel)", "1 (\u00c9quipe)"\u2026 Utilise\u00a0:',
      '  Personnel circle-xs/blue \u00b7 \u00c9quipe circle-sm/teal \u00b7 Interne circle-md/yellow \u00b7 Population circle-lg/green \u00b7 Global circle-xl/green.',
      '- Sur \u00e9chelle impact\u00a0: si context.userName est connu, inclus TOUJOURS l\'utilisateur (ex. pr\u00e9nom + circle-xs/blue). INTERDIT de ne lister que \u00e9quipe / utilisateurs / clients en omettant la personne.',
      '- Ex. VRAI impact (assumer, dipl\u00f4mes)\u00a0: {"message":"Le plus impact\u00e9 si on ne les installe pas, c\'est toi?","suggestions":["Oui","Non"],"suggestionsMulti":false}',
      '- Ex. VRAI impact (fallback \u00e9chelle apr\u00e8s Non)\u00a0: \u00ab\u00a0Impact sur Alex\u00a0\u00bb, \u00ab\u00a0Impact sur l\'\u00e9quipe\u00a0\u00bb, \u00ab\u00a0Impact sur les utilisateurs\u00a0\u00bb.',
      '- Ex. port\u00e9e JSON (pr\u00e9nom connu, fallback)\u00a0: {"suggestions":[{"label":"Alex","icon":"circle-xs","color":"blue"},{"label":"\u00c9quipe","icon":"circle-sm","color":"teal"},{"label":"Population","icon":"circle-lg","color":"green"}],"suggestionScale":true,"suggestionsMulti":false}',
      '- Ic\u00f4nes dispo\u00a0: circle-xs|circle-sm|circle-md|circle-lg|circle-xl|dots|hammer|calm-face|exclaim|user|users|building|globe|flame|check|ban|clock|bolt|layers|hourglass.',
      '- Urgence\u00a0: calm-face (\u00ab\u00a0Pas urgent\u00a0\u00bb) et exclaim (!! pour Urgent). INTERDIT hammer/bolt pour l\'urgence.',
      '- Colorie les \u00e9chelles de gravit\u00e9 avec heat 0\u20134 (0=vert, 4=rouge), OU suggestionScale:true + strings ordonn\u00e9es.',
      '- Ex. facilit\u00e9 JSON (effort)\u00a0: {"suggestions":[{"label":"C\'est facile","heat":0},{"label":"C\'est faisable","heat":2},{"label":"C\'est difficile","heat":4}],"suggestionScale":true,"suggestionsMulti":false}',
      '- Ex. facilit\u00e9 JSON (co\u00fbt)\u00a0: {"suggestions":[{"label":"Pas cher","heat":0},{"label":"Correct","heat":2},{"label":"Tr\u00e8s cher","heat":4}],"suggestionScale":true,"suggestionsMulti":false}',
      '- Ex. port\u00e9e JSON (sans pr\u00e9nom)\u00a0: {"suggestions":[{"label":"Personnel","icon":"circle-xs","color":"blue"},{"label":"\u00c9quipe","icon":"circle-sm","color":"teal"},{"label":"Population","icon":"circle-lg","color":"green"}],"suggestionScale":true,"suggestionsMulti":false}',
      '- Ex. multi JSON\u00a0: {"suggestions":[{"label":"On perd le contexte des rushs"},{"label":"La direction serait vraiment f\u00e2ch\u00e9e"}],"suggestionsMulti":true}',
      '- Utilise \u2026 seulement pour une r\u00e9ponse \u00e0 compl\u00e9ter (ex. \u00ab\u00a0On risque de perdre\u2026\u00a0\u00bb).',
      '',
      'Inf\u00e9rence + clarification carte\u00a0:',
      '- D\u00e8s le 1er tour\u00a0: PAS de POURQUOI. Inf\u00e8re set_task_types + axes \u00e9vidents (ex. achat logiciel \u2192 dur\u00e9e courte) et pose UNE question utile seulement si un axe reste ambigu.',
      '- D\u00e8s qu\'une r\u00e9ponse laisse assez d\'indices\u00a0: set_priority IMM\u00c9DIATEMENT avec les axes d\u00e9duits + remember but/livrable si donn\u00e9 spontan\u00e9ment + set_task_types si pas encore pos\u00e9 / \u00e0 raffiner (unlocked), puis pose directement la question suivante (sans r\u00e9sumer) OU close.',
      '- Mise \u00e0 jour des propri\u00e9t\u00e9s (TOUJOURS \u00e0 l\'\u0153il \u2014 c\'est le job)\u00a0:',
      '  \u00b7 \u00c0 CHAQUE r\u00e9ponse utilisateur, demande-toi\u00a0: types?\u00a0progr\u00e8s?\u00a0urgence?\u00a0impact?\u00a0facilit\u00e9?\u00a0blocage?\u00a0\u00e9ch\u00e9ance? Si oui \u2192 actions correspondantes ce tour-ci.',
      '  \u00b7 Chatter sans actions alors que l\'info change clairement un champ = \u00c9CHEC.',
      '  \u00b7 thinking DOIT lister bri\u00e8vement les champs \u00e0 mettre \u00e0 jour (ou \u00ab\u00a0aucun\u00a0\u00bb).',
      '- Une r\u00e9ponse peut combiner plusieurs suggestions (s\u00e9par\u00e9es par \u00ab\u00a0. \u00a0\u00bb)\u00a0: inf\u00e8re en tenant compte de TOUT le message.',
      '- Ex. POURQUOI spontan\u00e9\u00a0: user \u00ab\u00a0Aligner les messages entre services. Mieux joindre les citoyens\u00a0\u00bb \u2192 cardPatches [{"op":"remember","text":"Pourquoi\u00a0: aligner les messages entre services\u00a0; mieux joindre les citoyens"}] + prochaine question utile (ou axes) \u2014 sans avoir demand\u00e9 le pourquoi.',
      '- Ex.\u00a0: user \u00ab\u00a0La direction serait vraiment tr\u00e8s f\u00e2ch\u00e9e\u00a0\u00bb \u2192 urgence \u00e9lev\u00e9e (3\u20134) + cardPatches remember + message = seule la question suivante courte.',
      '- Ex. achat logiciel\u00a0: user \u00ab\u00a0Tr\u00e8s cher\u00a0\u00bb \u2192 ease bas (1\u20132) + cardPatches remember co\u00fbt + estimatedDurationMinutes court + question \u00ab\u00a0Faut la permission de quelqu\'un pour avancer?\u00a0\u00bb.',
      '- Ex. plan commenc\u00e9\u00a0: user \u00ab\u00a0Oui, un peu\u00a0\u00bb \u2192 cardPatches [{"op":"remember","text":"Plan d\u00e9j\u00e0 commenc\u00e9 (un peu)"}] + set_progress {progressEnabled:true, progress:30} + question \u00ab\u00a0Qu\'est-ce qui est d\u00e9j\u00e0 fait?\u00a0\u00bb.',
      '- Ex. d\u00e9j\u00e0 fait (critique)\u00a0: user \u00ab\u00a0J\'ai choisi les dipl\u00f4mes \u00e0 installer. J\'ai pr\u00e9par\u00e9 l\'emplacement\u00a0\u00bb \u2192 add_subtask {text:"Choisir les dipl\u00f4mes", done:true} + add_subtask {text:"Pr\u00e9parer l\'emplacement", done:true} + set_progress {progressEnabled:true, progress:40} + remember + question reste \u00e0 faire.',
      '- Ex. plan presque fini\u00a0: user \u00ab\u00a0Oui, presque termin\u00e9\u00a0\u00bb \u2192 set_progress {progressEnabled:true, progress:85} + remember + question sur le reste (PAS l\'\u00e9ch\u00e9ance tant qu\'il reste du travail).',
      '- Ex. plan fini / 100%\u00a0: user \u00ab\u00a0Oui, c\'est termin\u00e9\u00a0\u00bb / \u00ab\u00a0100%\u00a0\u00bb \u2192 set_progress {progressEnabled:true, progress:100} + trigger_effect confetti + message f\u00e9licitations (Bravo\u2026). INTERDIT \u00e9ch\u00e9ance. Si axes d\u00e9j\u00e0 ok\u00a0: completeInterview:true\u00a0; sinon question d\'axe utile ensuite.',
      '- Ex. plan pas commenc\u00e9\u00a0: user \u00ab\u00a0Non, pas encore\u00a0\u00bb \u2192 cardPatches remember + set_progress {progressEnabled:true, progress:0} (ou laisse 0) + message \u00ab\u00a0Pourquoi \u00e7a n\'a pas \u00e9t\u00e9 commenc\u00e9?\u00a0\u00bb + suggestions contextuelles.',
      '- Ex. attente mat\u00e9riel\u00a0: user \u00ab\u00a0J\'attends un c\u00e2ble\u00a0\u00bb \u2192 set_blocked enAttente:true blockedReasons ["En attente d\'un c\u00e2ble"] + set_progress {progress:0} si pas commenc\u00e9 / encore \u00e0 100% + remember + message \u00ab\u00a0Ok, bloqu\u00e9 en attendant le c\u00e2ble.\u00a0\u00bb + suite.',
      '- Ex. user \u00ab\u00a0L\'\u00e9quipe com s\'en occupe\u00a0\u00bb \u2192 cardPatches {"op":"remember","text":"Qui\u00a0: \u00e9quipe com"} + patches {"op":"remember","text":"L\'\u00e9quipe com travaille sur le plan de strat\u00e9gie de communication"} (utile au tableau).',
      '- Ex. permission\u00a0: user \u00ab\u00a0Faut l\'accord du responsable\u00a0\u00bb \u2192 cardPatches + patches {"op":"remember","text":"Le responsable valide / donne la permission pour avancer sur ce genre de plan"}.',
      '- M\u00e9moire \u2014 deux niveaux (critique)\u00a0:',
      '  \u00b7 cardPatches = d\u00e9pendant de CETTE t\u00e2che (POURQUOI, livrable, but, d\u00e9j\u00e0 fait, reste \u00e0 faire, contraintes locales).',
      '  \u00b7 patches = projet / tableau (qui approuve, qui travaille sur quoi, r\u00f4les, normes, faits r\u00e9utilisables sur d\'autres cartes).',
      '  \u00b7 Tr\u00e8s important et vrai au-del\u00e0 de la carte \u2192 patches (remember si durable, note si provisoire). Sinon \u2192 cardPatches.',
      '- Formats cardPatches utiles\u00a0: \u00ab\u00a0Pourquoi\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0Livrable\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0Qui\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0Permission\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0D\u00e9j\u00e0 fait\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0Reste\u00a0: \u2026\u00a0\u00bb.',
      '- Si la r\u00e9ponse clarifie le p\u00e9rim\u00e8tre\u00a0: rename_card (titre plus clair), set_description (r\u00e9sum\u00e9 court + misc absents des autres champs\u00a0; INTERDIT dump Pourquoi/Livrable/Qui/D\u00e9j\u00e0 fait/Reste), add_subtask (\u00e9tapes concr\u00e8tes) \u2014 sans inventer.',
      '- Ex. user explique les \u00e9tapes d\'archivage \u2192 add_subtask pour chaque \u00e9tape claire + remember le process + question courte suivante.',
      '- Ne repose pas ce qui est d\u00e9j\u00e0 dans context.cardMemory.facts, context.memory, ou l\'historique (surtout un \u00ab\u00a0Pourquoi\u00a0:\u00a0\u00bb d\u00e9j\u00e0 not\u00e9).',
      '',
      'Le SUJET de la carte (cardName raccourci) est ta piste\u00a0: ancre sans recopier le titre verbatim. Voisinage / r\u00e9cent = indices seulement.',
      'Les axes priority actuels sont des VALEURS PAR D\u00c9FAUT non fiables sauf si priorityAxesTrusted=true.',
      '',
      'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
      '{"thinking":"...","message":"...","suggestions":[{"label":"...","icon":"circle-sm","color":"teal","heat":0}],"suggestionScale":true,"suggestionsMulti":false,"prompts":[],"actions":[{"tool":"...","args":{}}],"cardPatches":[{"op":"remember","text":"..."}],"patches":[{"op":"remember","text":"..."}],"completeInterview":false}',
      '',
      'R\u00e8gles interview\u00a0:',
      '- Une question claire \u00e0 la fois (sauf avis / cl\u00f4ture / apart\u00e9). Reste court.',
      '- Apart\u00e9s / questions hors fil (critique)\u00a0: l\'utilisateur PEUT digresser sans casser l\'interview.',
      '  \u00b7 Identit\u00e9 (change ta couleur / ton nom / ta perso)\u00a0: APPLIQUE set_agent_color / set_agent_name / set_agent_personality TOUT DE SUITE + confirme en 1 demi-phrase, PUIS encha\u00eene directement la PROCHAINE vraie question d\'interview (sujet/axes/avancement).',
      '  \u00b7 Autre hors-sujet (blague, calcul, culture, \u00ab\u00a0t\'es une IA?\u00a0\u00bb)\u00a0: r\u00e9ponds bri\u00e8vement, puis reprend la prochaine question utile. Ne refuse jamais.',
      '  \u00b7 INTERDIT les meta-questions du genre \u00ab\u00a0On continue avec l\'installation des dipl\u00f4mes?\u00a0\u00bb / \u00ab\u00a0On reprend?\u00a0\u00bb / \u00ab\u00a0Tu veux continuer?\u00a0\u00bb \u2014 reprise = la vraie question suivante, sans demander la permission.',
      '  \u00b7 Ex. FAUX\u00a0: user \u00ab\u00a0change ta couleur pour dor\u00e9\u00a0\u00bb \u2192 message \u00ab\u00a0On continue avec l\'installation des dipl\u00f4mes?\u00a0\u00bb (et z\u00e9ro set_agent_color).',
      '  \u00b7 Ex. VRAI\u00a0: user \u00ab\u00a0change ta couleur pour dor\u00e9\u00a0\u00bb \u2192 set_agent_color {color:"yellow"} + color:"yellow" + message \u00ab\u00a0Okay, dor\u00e9! Le plus impact\u00e9 si on ne les accroche pas, c\'est [[a:toi]]?\u00a0\u00bb + suggestions Oui/Non.',
      '  \u00b7 Ex. VRAI\u00a0: user \u00ab\u00a0change ta propre couleur pour orange\u00a0\u00bb \u2192 set_agent_color {color:"orange"} + color:"orange" + OK bref + prochaine question (pas \u00ab\u00a0On continue?\u00a0\u00bb).',
      '  \u00b7 completeInterview reste false sur un apart\u00e9 \u2014 l\'interview continue.',
      '- INTERDIT les r\u00e9caps / synth\u00e8ses entre questions. Le contexte et les actions suffisent.',
      '- INTERDIT de cadrer une question comme \u00ab\u00a0la derni\u00e8re\u00a0\u00bb ou une conclusion\u00a0: jamais \u00ab\u00a0Pour finir\u00a0\u00bb, \u00ab\u00a0Pour terminer\u00a0\u00bb, \u00ab\u00a0Pour conclure\u00a0\u00bb, \u00ab\u00a0Enfin\u00a0\u00bb, \u00ab\u00a0Une derni\u00e8re question\u00a0\u00bb.',
      '- Pose la prochaine question utile. Ne dis JAMAIS que c\'est la fin / le dernier tour.',
      '- Cl\u00f4ture (completeInterview:true) \u2014 tr\u00e8s important\u00a0:',
      '- Quand plus de question utile (urgence+impact+ease fix\u00e9s ou inf\u00e9rables, skip \u00e9ch\u00e9ance, passer / plus tard)\u00a0: completeInterview:true. Le POURQUOI n\'est PAS requis.',
      '- Avant de cl\u00f4turer\u00a0: v\u00e9rifie que set_progress / set_priority / add_subtask dus d\'apr\u00e8s l\'historique sont bien dans actions de CE tour (ne laisse pas la carte \u00e0 jour \u00ab\u00a0seulement dans ta t\u00eate\u00a0\u00bb).',
      '- \u00ab\u00a0Noter la priorit\u00e9\u00a0\u00bb = APPLIQUER set_priority (critique)\u00a0:',
      '  \u00b7 Si TU proposes de noter / enregistrer / figer la priorit\u00e9 et l\'utilisateur dit oui / note / vas-y / ok\u00a0: CE TOUR doit contenir set_priority avec les axes d\u00e9duits (urgence/impact/ease ou tier) + TOUS les add_subtask encore dus d\'apr\u00e8s l\'historique (plans / \u00e9tapes d\u00e9crites mais absentes de progress.items) + completeInterview:true si plus de question utile.',
      '  \u00b7 INTERDIT de r\u00e9pondre \u00ab\u00a0Okay, j\'ai not\u00e9\u2026\u00a0\u00bb / \u00ab\u00a0C\'est not\u00e9\u00a0\u00bb avec actions=[] (ou seulement cardPatches)\u00a0: sans set_priority (+ sous-t\u00e2ches dues) = \u00c9CHEC.',
      '  \u00b7 Ex. VRAI (confirm)\u00a0: user \u00ab\u00a0Oui, note la priorit\u00e9\u00a0\u00bb apr\u00e8s un plan disque/Windows/Drive \u2192 set_priority {urgency:3, impact:0, \u2026} + add_subtask pour chaque \u00e9tape manquante + completeInterview:true + message court ancr\u00e9 (pas un faux \u00ab\u00a0j\'ai not\u00e9\u00a0\u00bb sans outils).',
      '  \u00b7 Ex. FAUX\u00a0: {"message":"Okay, j\'ai not\u00e9 la priorit\u00e9\u2026","actions":[],"completeInterview":true}.',
      '- INTERDIT de terminer avec seulement \u00ab\u00a0Okay.\u00a0\u00bb / \u00ab\u00a0C\'est not\u00e9.\u00a0\u00bb / \u00ab\u00a0Ok.\u00a0\u00bb / \u00ab\u00a0D\'accord.\u00a0\u00bb',
      '- \u00c0 la place\u00a0: UNE remarque courte, un peu s\u00e8che / maligne, ancr\u00e9e dans CE qu\'on vient de discuter (sujet de la carte, budget, permission, avancement, ce que tu peux / ne peux pas faire) \u2014 ET les actions carte correspondantes.',
      '- Varie\u00a0: pique sur l\'\u00e9change, offre concr\u00e8te d\'aide, aveu d\'impuissance utile, ou nudge (\u00ab\u00a0va demander si y\'a le budget\u00a0\u00bb). Montre que tu as compris le contexte.',
      '- Ex. FAUX (apr\u00e8s \u00ab\u00a0Pas d\'\u00e9ch\u00e9ance\u00a0\u00bb sur achat DaVinci)\u00a0: \u00ab\u00a0Okay.\u00a0\u00bb',
      '- Ex. VRAI\u00a0: \u00ab\u00a0Bon, sans deadline c\'est surtout une question de thunes et de permission. Si on veut vraiment Resolve, faut aller demander s\'ils ont le budget.\u00a0\u00bb + set_priority si axes connus.',
      '- Ex. VRAI (autre, message de cl\u00f4ture)\u00a0: \u00ab\u00a0Moi je peux te noter la priorit\u00e9\u00a0; le reste, c\'est plut\u00f4t une conversation avec la compta.\u00a0\u00bb \u2014 et si l\'utilisateur accepte ensuite, APPLIQUE set_priority (ne te contente pas de le dire).',
      '- Ex. VRAI (skip total)\u00a0: \u00ab\u00a0Ok on laisse \u00e7a. Reviens quand t\'auras une id\u00e9e du budget ou qui doit valider.\u00a0\u00bb',
      '- INTERDIT de demander \u00ab\u00a0sur une \u00e9chelle de 0 \u00e0 4\u00a0\u00bb, des chiffres seuls, ou des l\u00e9gendes.',
      '- Maximise le gain d\'info avec le MOINS de questions\u00a0: inf\u00e8re axes d\'abord\u00a0; clarifie le titre seulement s\'il est trop vague pour scorer\u00a0; (plans / achats seulement, si n\u00e9cessaire) permission / qui / commenc\u00e9 / d\u00e9j\u00e0 fait / reste\u00a0; pose seulement ce qui reste ambigu. Sur une corv\u00e9e perso solo\u00a0: saute permission/qui et passe aux axes utiles (urgence, effort) en mode assumer+Oui/Non quand possible. INTERDIT le POURQUOI motivation.',
      '- N\'invente PAS d\'\u00e9ch\u00e9ance, projet, sous-t\u00e2ches ou description sans indice (titre, r\u00e9ponse, voisinage). La dur\u00e9e COURTE pour un achat / un clic / un mail\u00a0: OK \u00e0 inf\u00e9rer.',
      '- Si l\'utilisateur dit passer / plus tard / skip / non merci\u00a0: completeInterview:true, actions=[] (sauf ce que tu as d\u00e9j\u00e0 assez pour appliquer) + message de cl\u00f4ture malin (pas \u00ab\u00a0Okay.\u00a0\u00bb).',
      '- Quand urgence+impact+ease sont fix\u00e9s\u00a0: tu peux encore poser UNE question courte utile (projet, clarification, OU \u00e9ch\u00e9ance SEULEMENT si elle manque) SANS dire que c\'est la derni\u00e8re\u00a0; sinon completeInterview:true + cl\u00f4ture maligne. Pas de question dur\u00e9e si d\u00e9j\u00e0 inf\u00e9r\u00e9e.',
      '- Pour \u00e9ch\u00e9ance\u00a0: \u00ab\u00a0C\'est pour quand?\u00a0\u00bb (+ Aujourd\'hui / Demain / Pas d\'\u00e9ch\u00e9ance) \u2014 SEULEMENT si due N\'EST PAS d\u00e9j\u00e0 active (voir alreadyKnown.dueActive / context.due) ET la t\u00e2che n\'est PAS d\u00e9j\u00e0 \u00e0 100% / termin\u00e9e.',
      '- INTERDIT d\'offrir / demander une \u00e9ch\u00e9ance si set_progress\u2192100, complete_all_subtasks, ou context.progress d\u00e9j\u00e0 \u00e0 100. F\u00e9licite \u00e0 la place.',
      '- INTERDIT d\'offrir / demander une \u00e9ch\u00e9ance si alreadyKnown.dueActive=true (due.enabled + dueDate). L\'\u00e9ch\u00e9ance est d\u00e9j\u00e0 pos\u00e9e\u00a0: passe aux axes ou cl\u00f4ture.',
      '- Ex. FAUX (due d\u00e9j\u00e0 l\u00e0)\u00a0: apr\u00e8s le POURQUOI, message \u00ab\u00a0C\'est pour quand?\u00a0\u00bb alors que context.due.dueDate est d\u00e9fini.',
      '- Ex. VRAI (due d\u00e9j\u00e0 l\u00e0)\u00a0: apr\u00e8s le POURQUOI \u2192 urgence / impact / facilit\u00e9 (ou completeInterview si axes ok).',
      '- Pour dur\u00e9e\u00a0: seulement si incertaine \u2192 \u00ab\u00a0\u00c7a prend combien de temps?\u00a0\u00bb. Sinon set_progress_estimate sans demander. Pour projet\u00a0: \u00ab\u00a0Quel projet?\u00a0\u00bb.',
      '- completeInterview:true quand l\'interview est termin\u00e9e.',
      '- \u00c9vite de reposer les questions d\u00e9j\u00e0 pos\u00e9es.',
      '- INTERDIT\u00a0: \u00ab\u00a0Comment puis-je vous aider?\u00a0\u00bb / questions vagues ouvertes sans ancrage.',
      '',
      'Champs / faits d\u00e9j\u00e0 connus (critique \u2014 LIS before asking)\u00a0:',
      '- Consulte alreadyKnown + context.due / cardMemory / asked / historique AVANT chaque question.',
      '- INTERDIT de demander ce qui est d\u00e9j\u00e0 renseign\u00e9 ou \u00e9vident d\'apr\u00e8s le titre / la m\u00e9moire / le contexte carte.',
      '- Si alreadyKnown.dueActive\u00a0: z\u00e9ro question d\'\u00e9ch\u00e9ance.',
      '- Si alreadyKnown.whyKnown\u00a0: z\u00e9ro POURQUOI (de toute fa\u00e7on INTERDIT).',
      '- INTERDIT toute question motivation \u00ab\u00a0Pourquoi tu veux\u2026?\u00a0\u00bb m\u00eame si whyKnown=false.',
      '- Si alreadyKnown.taskTypesKnown\u00a0: ne repose pas la classification\u00a0; adapte tes questions \u00e0 context.taskTypes.',
      '- Si tu peux setter un axe / une dur\u00e9e / des types raisonnablement\u00a0: fais-le dans actions, ne pose pas la question.',
      '',
      'Anti-boucle avancement (runtime \u2014 OBLIGATOIRE)\u00a0:',
      '- Lis context.interview.progressScout avant de poser d\u00e9j\u00e0-fait / reste.',
      '- Si askedDone=true\u00a0: INTERDIT toute reformulation \u00ab\u00a0d\u00e9j\u00e0 fait\u00a0\u00bb.',
      '- Si askedRemaining=true\u00a0: INTERDIT toute reformulation \u00ab\u00a0reste \u00e0 faire\u00a0\u00bb.',
      '- Si askedRemaining=true et askedDone=false\u00a0: NE pose PAS \u00ab\u00a0d\u00e9j\u00e0 fait\u00a0\u00bb ensuite (ordre invers\u00e9 = boucle). Passe aux axes.',
      '- Si blockFurtherScout=true OU (memoryHasDone et memoryHasRemaining)\u00a0: plus AUCUN rep\u00e9rage d\u00e9j\u00e0/reste\u00a0; axes / \u00e9ch\u00e9ance (si absente) / cl\u00f4ture.',
      '',
      'Correction de liste (critique)\u00a0:',
      '- Si l\'utilisateur corrige une sous-t\u00e2che existante (titre, \u00e9tat, avancement) : MODIFIE-la avec rename_subtask / toggle_subtask / set_subtask_progress. N\'ajoute JAMAIS une nouvelle sous-t\u00e2che pour la remplacer.',
      '- Sous-t\u00e2che en double ou fausse : remove_subtask dessus. Ne rajoute pas la version corrig\u00e9e \u00e0 c\u00f4t\u00e9.',
      '- Ne r\u00e9-ajoute jamais un item d\u00e9j\u00e0 pr\u00e9sent dans context.progress.items, m\u00eame formul\u00e9 autrement.',
      '- Maximum 5 actions par tour (le runtime coupe au-del\u00e0). Si la correction en demande plus, garde les 5 plus importantes et dis dans message ce qui reste \u00e0 faire.',
      '- Ne donne pas un pourcentage dans message qui ne correspond ni \u00e0 progress.percent ni \u00e0 l\'action appliqu\u00e9e. Si tu ne peux pas appliquer une correction, dis-le clairement.',
      '',
      'Outils autoris\u00e9s dans actions\u00a0:',
      '- set_priority: { urgency?, impact?, ease?, tier?, priorityEnabled? }',
      '- set_task_types: { types: string[], force?: boolean } (multi\u00a0; ids catalog\u00a0; silencieux\u00a0; respect taskTypesLocked)',
      '- set_due: { dueDate?: YYYY-MM-DD, dueTime?: HH:MM, relativeHours?, relativeMinutes?, dueVague?: proche|lointain|eventuellement, startDate?, recurrence?, clear? }',
      '- set_blocked: { enAttente?: boolean, blockedReasons?: string[] } (si l\'utilisateur attend quelque chose de concret\u00a0: enAttente:true + cause \u00ab\u00a0En attente de\u2026\u00a0\u00bb)',
      '- set_members: { add?, remove? }',
      '- set_labels: { add?, remove?, create? }',
      '- set_progress: { progress?:0-100, progressEnabled?: boolean } (active le bloc Progr\u00e8s + % carte\u00a0; OBLIGATOIRE d\u00e8s qu\'on parle d\'avancement)',
      '- set_project: { projectId?, matchText?, name?, clear? }',
      '- rename_card: { name } (titre plus clair / plus court si la r\u00e9ponse le justifie)',
      '- set_description: { desc } (r\u00e9sum\u00e9 court + misc\u00a0; pas de dump Pourquoi/Livrable/Qui/\u00e9ch\u00e9ance/d\u00e9j\u00e0 fait/reste\u00a0; desc = texte complet)',
      '- add_subtask: { text, estimatedMinutes? } (quand une \u00e9tape concr\u00e8te \u00e9merge clairement\u00a0; done:true si d\u00e9j\u00e0 faite)',
      '- toggle_subtask: { id?|matchText?, done?: boolean } (cocher une \u00e9tape d\u00e9j\u00e0 dans progress.items)',
      '- rename_subtask: { text: string, id?: string, matchText?: string } (nouveau text ; id OU matchText)',
      '- remove_subtask: { id?: string, matchText?: string } (id OU matchText)',
      '- set_subtask_progress: { id?|matchText?, progress: 0-100 }',
      '- set_subtask_estimate / set_progress_estimate: dur\u00e9es Progr\u00e8s',
      '- trigger_effect: { effect } (confetti / flowers quand progress=100 \u2014 f\u00e9licitations)',
      '- set_agent_color: { color } (apart\u00e9 couleur\u00a0: orange|yellow|green|purple|blue|pink|red|teal|coral|sky ou #RRGGBB\u00a0; dor\u00e9/gold \u2192 yellow)',
      '- set_agent_name: { name } (apart\u00e9 nom)',
      '- set_agent_personality: { personality } (apart\u00e9 perso)',
      '- prompts optionnels: [{ "type":"priority_axes", "urgency":n, "impact":n, "ease":n }] (apr\u00e8s inf\u00e9rence)',
      '',
      'Contexte carte / interview\u00a0:',
      JSON.stringify({
        today: context.today,
        nowTime: context.nowTime,
        cardName: context.cardName,
        cardDesc: context.cardDesc,
        priority: context.priority,
        taskTypes: context.taskTypes || [],
        taskTypesLocked: !!context.taskTypesLocked,
        due: context.due || null,
        blocked: context.blocked || null,
        progress: context.progress || null,
        goals: context.goals || null,
        memory: context.memory,
        cardMemory: context.cardMemory || { facts: [] },
        profile: context.profile,
        userName: context.userName || '',
        asked: context.interview.asked,
        surrounding: context.interview.surrounding,
        recentCards: context.interview.recentCards,
        priorityAxesTrusted: context.interview.priorityAxesTrusted,
        progressScout: context.interview.progressScout,
        alreadyKnown: summarizeInterviewAlreadyKnown(context)
      })
    ].join('\n');

    var messages = [{ role: 'system', content: system }];
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
      id: 'interview-' + Date.now().toString(36),
      kind: 'cardInterviewTurn',
      label: 'Tour d\u2019interview',
      startedAt: Date.now(),
      attempts: []
    };

    function recordAttempt(label, metaOrErr) {
      if (metaOrErr && metaOrErr.meta) {
        debug.attempts.push(Object.assign({ label: label }, metaOrErr.meta));
        dbgLog('agent', 'cardInterviewTurn.fetch', dbgFetchMeta(label, metaOrErr));
        return;
      }
      if (metaOrErr && metaOrErr.debugMeta) {
        debug.attempts.push(Object.assign({ label: label }, metaOrErr.debugMeta));
        dbgLog('agent', 'cardInterviewTurn.fetch', dbgFetchMeta(label, metaOrErr));
        return;
      }
      debug.attempts.push({
        label: label,
        error: (metaOrErr && metaOrErr.message) || String(metaOrErr || 'error'),
        ok: false
      });
      dbgLog('agent', 'cardInterviewTurn.fetch', dbgFetchMeta(label, metaOrErr));
    }

    function notifyVisible(accumulated) {
      if (!onDelta) return;
      var visible = extractStreamingMessage(accumulated);
      if (!visible) return;
      try {
        onDelta(visible, accumulated);
      } catch (cbErr) {
        console.error('cardInterviewTurn onDelta failed', cbErr);
      }
    }

    var t0 = Date.now();
    var response;
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          stream: !!onDelta,
          max_tokens: 720,
          temperature: 0.45,
          onDelta: onDelta
            ? function (_piece, accumulated) {
                notifyVisible(accumulated);
              }
            : undefined
        });
        recordAttempt(onDelta ? 'stream + json' : 'non-stream + json', response);
      } catch (err) {
        recordAttempt(onDelta ? 'stream + json' : 'non-stream + json', err);
        if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            stream: !!onDelta,
            max_tokens: 720,
            temperature: 0.45,
            onDelta: onDelta
              ? function (_piece, accumulated) {
                  notifyVisible(accumulated);
                }
              : undefined
          });
          recordAttempt(
            onDelta ? 'stream (sans json mode)' : 'non-stream (sans json mode)',
            response
          );
        } else if (err && /stream/i.test((err && err.message) || '')) {
          dbgLog('agent', 'cardInterviewTurn.fetch', {
            attempt: onDelta ? 'stream + json' : 'non-stream + json',
            ok: false,
            fallback: 'stream-rejected'
          });
          response = await chatCompletions(p, messages, {
            jsonMode: true,
            stream: false,
            max_tokens: 720,
            temperature: 0.45
          });
          recordAttempt('non-stream + json', response);
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
      dbgError('agent', 'cardInterviewTurn.end', fatal, { latencyMs: debug.latencyMs, ok: false });
      debug.request = debug.attempts.length
        ? debug.attempts[debug.attempts.length - 1]
        : buildRequestMeta(p, {
            model: p.model,
            messages: messages,
            temperature: 0.45,
            stream: !!onDelta,
            max_tokens: 720,
            response_format: { type: 'json_object' }
          });
      fatal.debug = debug;
      throw fatal;
    }

    var content = response && response.content ? response.content : '';
    var parsed = parseAssistantPayload(content);
    var data = null;
    try {
      data = JSON.parse(content.trim());
    } catch (e) {
      var start = content.indexOf('{');
      var end = content.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          data = JSON.parse(content.slice(start, end + 1));
        } catch (e2) {
          data = null;
        }
      }
    }

    var actions = rewriteActionsForRelativeDue(parsed.actions || [], userText);
    var tierRewrite = rewriteActionsForPriorityTier(actions, userText);
    actions = tierRewrite.actions;
    var colorRewrite = rewriteActionsForAgentColor(
      actions,
      userText,
      parsed.message || '',
      parsed.color
    );
    actions = colorRewrite.actions;

    var message = polishAssistantVisibleText(
      stripScaleLegendParenthetical(
        polishMessageAfterTierApply(
          parsed.message || (data && data.message) || '',
          tierRewrite.tier,
          tierRewrite.injected
        )
      )
    );
    var progressGuard = applyProgressCompleteGuards(
      {
        message: message,
        actions: actions,
        suggestions: null,
        emotion: parsed.emotion || null
      },
      context
    );
    message = progressGuard.message;
    actions = progressGuard.actions;
    actions = ensureQuebecLibreEffect(actions, userText);
    actions = ensureUnblockedIntent(actions, userText);
    var emotion = progressGuard.emotion;
    if (looksLikeQuebecLibrePhrase(userText) && !emotion) {
      emotion = 'happy';
    }
    var replyColor = colorRewrite.color || parsed.color || null;
    var prompts = ensurePriorityAxesPrompt(
      normalizePrompts(parsed.prompts, context),
      actions,
      context
    );
    var blocks = normalizeBlocks(parsed.blocks, context);

    var suggestionScale = wantsSuggestionScale(data) || wantsSuggestionScale(parsed);
    var scoutGuard = applyInterviewProgressScoutGuards(
      {
        message: message,
        suggestions: (data && data.suggestions) || parsed.suggestions,
        suggestionsMulti:
          wantsSuggestionsMulti(data) || wantsSuggestionsMulti(parsed),
        suggestionScale: suggestionScale
      },
      context,
      history
    );
    var scoutRedirected = scoutGuard.message !== message;
    message = scoutGuard.message;
    if (scoutRedirected) {
      suggestionScale = !!scoutGuard.suggestionScale || suggestionScale;
    }

    var whyGuard = applyInterviewWhyGuards(
      {
        message: message,
        suggestions: scoutRedirected
          ? scoutGuard.suggestions
          : (data && data.suggestions) || parsed.suggestions,
        suggestionsMulti: scoutRedirected
          ? scoutGuard.suggestionsMulti
          : wantsSuggestionsMulti(data) || wantsSuggestionsMulti(parsed),
        suggestionScale: suggestionScale,
        completeInterview: !!(
          (data && data.completeInterview) ||
          scoutGuard.completeInterview
        )
      },
      context,
      history
    );
    var whyRedirected = whyGuard.message !== message;
    message = whyGuard.message;
    if (whyRedirected) {
      suggestionScale = !!whyGuard.suggestionScale || suggestionScale;
      scoutRedirected = true;
      scoutGuard = whyGuard;
    }

    var echoGuard = applyInterviewEchoGuards(
      {
        message: message,
        suggestions: scoutRedirected
          ? scoutGuard.suggestions
          : (data && data.suggestions) || parsed.suggestions,
        suggestionsMulti: scoutRedirected
          ? scoutGuard.suggestionsMulti
          : wantsSuggestionsMulti(data) || wantsSuggestionsMulti(parsed),
        suggestionScale: suggestionScale,
        completeInterview: !!(
          (data && data.completeInterview) ||
          scoutGuard.completeInterview
        )
      },
      context,
      history
    );
    var echoRedirected = echoGuard.message !== message;
    message = echoGuard.message;
    if (echoRedirected) {
      suggestionScale = !!echoGuard.suggestionScale || suggestionScale;
      scoutRedirected = true;
      scoutGuard = echoGuard;
    }

    var dueGuard = applyKnownDueGuards(
      {
        message: message,
        suggestions: scoutRedirected
          ? scoutGuard.suggestions
          : (data && data.suggestions) || parsed.suggestions,
        suggestionsMulti:
          scoutRedirected
            ? scoutGuard.suggestionsMulti
            : wantsSuggestionsMulti(data) || wantsSuggestionsMulti(parsed),
        suggestionScale: suggestionScale,
        completeInterview: !!(
          (data && data.completeInterview) ||
          scoutGuard.completeInterview
        )
      },
      context
    );
    var dueRedirected = dueGuard.message !== message;
    message = dueGuard.message;
    if (dueRedirected) {
      suggestionScale = !!dueGuard.suggestionScale || suggestionScale;
      scoutRedirected = true;
      scoutGuard = dueGuard;
    }

    if (onDelta && message) {
      try {
        onDelta(message, content);
      } catch (finalCbErr) {
        console.error('cardInterviewTurn final onDelta failed', finalCbErr);
      }
    }

    var completeInterview = !!(
      (data && data.completeInterview) ||
      scoutGuard.completeInterview ||
      dueGuard.completeInterview
    );
    var skipPhrase = /^\s*(passer|plus\s+tard|skip|non\s+merci|arr[eê]te|stop)\b/i.test(
      String(userText || '')
    );
    if (skipPhrase) completeInterview = true;

    var usage = extractUsageFromRaw(response && response.raw, messages, content, p.model);
    usage.latencyMs = Date.now() - t0;
    usage.historyTurns = (history || []).length;

    var lifted = liftPatchTools(
      actions,
      (data && data.cardPatches) || (parsed && parsed.cardPatches),
      (data && data.patches) || (parsed && parsed.patches)
    );
    actions = lifted.actions;
    var cardPatches = normalizeCardPatches(lifted.cardPatches);
    var patches = normalizeBoardPatches(lifted.patches);

    var suggestionEntries = normalizeSuggestionEntries(
      scoutRedirected
        ? scoutGuard.suggestions
        : (data && data.suggestions) || parsed.suggestions,
      5,
      {
        scale: suggestionScale,
        rankGreenToRed: true,
        userName: context.userName,
        message: message
      }
    );
    // Interview answer chips (no "?") are ordinal soft→intense when unmarked.
    if (
      suggestionEntries.length >= 2 &&
      suggestionEntries.length <= 5 &&
      suggestionEntries.every(function (entry) {
        return entry.text.indexOf('?') < 0;
      })
    ) {
      suggestionEntries = orderSuggestionsGreenToRed(
        suggestionEntries,
        context.userName
      );
      var hasHeat = suggestionEntries.some(function (entry) {
        return entry.heat != null;
      });
      var hasNamedColor = suggestionEntries.some(function (entry) {
        return !!entry.color;
      });
      if (!hasHeat && !hasNamedColor) {
        var interviewSteps = spreadScaleHeat(suggestionEntries.length);
        suggestionEntries.forEach(function (entry, i) {
          entry.heat = interviewSteps[i];
        });
        suggestionEntries = orderSuggestionsGreenToRed(
          suggestionEntries,
          context.userName
        );
      }
    }
    suggestionEntries = ensurePersonalImpactSuggestion(
      suggestionEntries,
      context.userName,
      message
    );
    suggestionEntries = linkSuggestionColorsToHighlights(
      suggestionEntries,
      message
    );
    suggestionEntries = orderSuggestionsGreenToRed(
      suggestionEntries,
      context.userName
    );
    suggestionEntries = filterDueSuggestionsWhenComplete(
      suggestionEntries,
      actions,
      context
    );

    var latencyMs = Date.now() - t0;
    usage.latencyMs = latencyMs;
    debug.endedAt = Date.now();
    debug.latencyMs = latencyMs;
    debug.ok = true;
    debug.request =
      (response && response.meta) ||
      (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response && response.meta && response.meta.status,
      content: content,
      raw: cloneJsonSafe(response && response.raw),
      parsed: {
        message: message,
        suggestions: suggestionEntries,
        prompts: prompts,
        blocks: blocks,
        actions: actions,
        completeInterview: completeInterview,
        droppedActions: parsed.droppedActions || []
      }
    };
    debug.usage = usage;

    dbgLog('agent', 'cardInterviewTurn.end', {
      ok: true,
      latencyMs: latencyMs,
      actionCount: (actions || []).length,
      droppedCount: (parsed.droppedActions || []).length,
      completeInterview: completeInterview
    });

    return {
      message: message,
      emotion: emotion || parsed.emotion || null,
      color: replyColor,
      suggestions: suggestionEntries,
      suggestionsMulti: scoutRedirected
        ? !!scoutGuard.suggestionsMulti
        : wantsSuggestionsMulti(data) || wantsSuggestionsMulti(parsed),
      actions: actions,
      prompts: prompts,
      blocks: blocks,
      followUps: parsed.followUps || [],
      cardPatches: cardPatches,
      patches: patches,
      completeInterview: completeInterview,
      droppedActions: parsed.droppedActions || [],
      rawJson: content,
      context: context,
      usage: usage,
      debug: debug
    };
  }

  // exports
  S.applyInterviewProgressScoutGuards = applyInterviewProgressScoutGuards;
  S.cardInterviewTurn = cardInterviewTurn;
  S.cardMemoryHasProgressFact = cardMemoryHasProgressFact;
  S.chatSerializedSize = chatSerializedSize;
  S.emptyCardChat = emptyCardChat;
  S.emptyCardInterview = emptyCardInterview;
  S.enforceCardChatBudget = enforceCardChatBudget;
  S.interviewProgressScoutKind = interviewProgressScoutKind;
  S.loadBoardChat = loadBoardChat;
  S.loadCardChat = loadCardChat;
  S.loadCardInterview = loadCardInterview;
  S.markInterviewComplete = markInterviewComplete;
  S.markInterviewQuestionAsked = markInterviewQuestionAsked;
  S.normalizeCardChat = normalizeCardChat;
  S.normalizeCardChatMessage = normalizeCardChatMessage;
  S.normalizeCardInterview = normalizeCardInterview;
  S.saveBoardChat = saveBoardChat;
  S.saveCardChat = saveCardChat;
  S.saveCardInterview = saveCardInterview;
  S.savePluginChat = savePluginChat;
  S.stripInterviewMarkup = stripInterviewMarkup;
  S.summarizeInterviewProgressScout = summarizeInterviewProgressScout;
})(typeof window !== 'undefined' ? window : this);
