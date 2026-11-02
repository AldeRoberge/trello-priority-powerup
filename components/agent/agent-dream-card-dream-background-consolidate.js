/**
 * AI agent: card dream
 *
 * Part of the agent (see agent.parts.json). Status brief, progress summary and the background consolidation after a chat.
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
 */

/**
 * agent-dream: part 1 of 3 (15. Card dream — background consolidate after chat settles).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-dream.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var MAX_DREAM_DESC_LEN = S.MAX_DREAM_DESC_LEN;
  var MAX_TURN_ACTIONS = S.MAX_TURN_ACTIONS;

  // from other parts (functions, resolved at call time)
  function resolveSubtaskItem() { return S.resolveSubtaskItem.apply(this, arguments); }
  function buildContext() { return S.buildContext.apply(this, arguments); }
  function buildDonePendingSanityFallback() { return S.buildDonePendingSanityFallback.apply(this, arguments); }
  function buildDreamCardSnapshot() { return S.buildDreamCardSnapshot.apply(this, arguments); }
  function buildDreamHistoryExcerpt() { return S.buildDreamHistoryExcerpt.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function cloneJsonSafe() { return S.cloneJsonSafe.apply(this, arguments); }
  function ensureFollowUpActionVerb() { return S.ensureFollowUpActionVerb.apply(this, arguments); }
  function executeActions() { return S.executeActions.apply(this, arguments); }
  function extractUsageFromRaw() { return S.extractUsageFromRaw.apply(this, arguments); }
  function isConfigured() { return S.isConfigured.apply(this, arguments); }
  function normalizeActionsWithMeta() { return S.normalizeActionsWithMeta.apply(this, arguments); }
  function normalizeAgentColorArg() { return S.normalizeAgentColorArg.apply(this, arguments); }
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }
  function normalizeDescForCompare() { return S.normalizeDescForCompare.apply(this, arguments); }
  function normalizeEffectId() { return S.normalizeEffectId.apply(this, arguments); }
  function normalizePointField() { return S.normalizePointField.apply(this, arguments); }
  function normalizePointLevel() { return S.normalizePointLevel.apply(this, arguments); }
  function normalizePointSection() { return S.normalizePointSection.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function normalizeSuggestionList() { return S.normalizeSuggestionList.apply(this, arguments); }
  function polishFollowUpActions() { return S.polishFollowUpActions.apply(this, arguments); }
  function profileLanguageInstruction() { return S.profileLanguageInstruction.apply(this, arguments); }
  function stripSpaceBeforePunctuation() { return S.stripSpaceBeforePunctuation.apply(this, arguments); }

var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});
  var MAX_DREAM_DESC_LEN = S.MAX_DREAM_DESC_LEN;
  var MAX_TURN_ACTIONS = S.MAX_TURN_ACTIONS;
  function buildContext() { return S.buildContext.apply(this, arguments); }
  function buildDonePendingSanityFallback() { return S.buildDonePendingSanityFallback.apply(this, arguments); }
  function buildDreamCardSnapshot() { return S.buildDreamCardSnapshot.apply(this, arguments); }
  function buildDreamHistoryExcerpt() { return S.buildDreamHistoryExcerpt.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function cloneJsonSafe() { return S.cloneJsonSafe.apply(this, arguments); }
  function ensureFollowUpActionVerb() { return S.ensureFollowUpActionVerb.apply(this, arguments); }
  function executeActions() { return S.executeActions.apply(this, arguments); }
  function extractUsageFromRaw() { return S.extractUsageFromRaw.apply(this, arguments); }
  function isConfigured() { return S.isConfigured.apply(this, arguments); }
  function normalizeActionsWithMeta() { return S.normalizeActionsWithMeta.apply(this, arguments); }
  function normalizeAgentColorArg() { return S.normalizeAgentColorArg.apply(this, arguments); }
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }
  function normalizeDescForCompare() { return S.normalizeDescForCompare.apply(this, arguments); }
  function normalizeEffectId() { return S.normalizeEffectId.apply(this, arguments); }
  function normalizePointField() { return S.normalizePointField.apply(this, arguments); }
  function normalizePointLevel() { return S.normalizePointLevel.apply(this, arguments); }
  function normalizePointSection() { return S.normalizePointSection.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function normalizeSuggestionList() { return S.normalizeSuggestionList.apply(this, arguments); }
  function polishFollowUpActions() { return S.polishFollowUpActions.apply(this, arguments); }
  function profileLanguageInstruction() { return S.profileLanguageInstruction.apply(this, arguments); }
  function stripSpaceBeforePunctuation() { return S.stripSpaceBeforePunctuation.apply(this, arguments); }

  /**
   * Dream stage: between chats, keep the Trello Description as a short task
   * summary + misc notes that are not already visible on other card fields.
   * Silent consolidation pass — not a user-facing conversation turn.
   *
   * Returns { ok, skipped?, reason?, updated?, desc?, applied?, usage?, debug }.
   */
  // ── 15. Card dream — background consolidate after chat settles ───────────
  // Writes card memory / status brief / progress summary; must stay cheap.

  async function cardDreamTurn(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var context = buildContext(bridge);
    var facts =
      context.cardMemory && Array.isArray(context.cardMemory.facts)
        ? context.cardMemory.facts.filter(Boolean)
        : [];
    if (!facts.length) {
      return { ok: true, skipped: true, reason: 'no-facts' };
    }

    var currentDesc =
      typeof context.cardDesc === 'string' ? context.cardDesc : '';
    var historyExcerpt = buildDreamHistoryExcerpt(options.history);
    var cardSnapshot = buildDreamCardSnapshot(context);

    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      return { ok: false, skipped: true, reason: 'not-configured' };
    }

    var messages = [
      {
        role: 'system',
        content: [
          'Tu es en phase R\u00caVE (consolidation asynchrone entre conversations) pour une carte Trello (Power-Up Cerveau).',
          profileLanguageInstruction(context && context.profile),
          'Mission\u00a0: maintenir une Description COURTE = r\u00e9sum\u00e9 de la t\u00e2che + infos misc absentes des autres champs carte.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
          '{"shouldUpdate":true,"desc":"\u2026","reason":"courte justification priv\u00e9e"}',
          'ou {"shouldUpdate":false,"reason":"\u2026"} si la description actuelle est d\u00e9j\u00e0 bonne (courte, utile, sans redites).',
          'R\u00e8gles\u00a0:',
          '- Description = 1\u20133 phrases max (ou un court paragraphe). R\u00e9sum\u00e9 du quoi / p\u00e9rim\u00e8tre + notes misc (liens, style, d\u00e9tail ponctuel utile).',
          '- INTERDIT les sections structur\u00e9es ## Pourquoi / Livrable / But / Qui / Contraintes / D\u00e9j\u00e0 fait / Reste (ou listes \u00e9quivalentes).',
          '- INTERDIT de recopier ce qui est d\u00e9j\u00e0 visible ailleurs\u00a0: titre, \u00e9ch\u00e9ance (cardSnapshot.due), statut, priorit\u00e9, % / sous-t\u00e2ches (d\u00e9j\u00e0 fait / reste), blocage, faits cardMemory (Pourquoi:, Livrable:, Qui:, etc.).',
          '- Les faits cardMemory restent en m\u00e9moire interne\u00a0: s\'en servir pour \u00e9crire le r\u00e9sum\u00e9, sans les dump section par section.',
          '- Si la description actuelle est un long brief structur\u00e9 redondant\u00a0: shouldUpdate:true et r\u00e9\u00e9cris-la en version courte.',
          '- Conserve seulement les infos misc d\u00e9j\u00e0 en description qui restent utiles et non contredites.',
          '- N\'invente rien\u00a0: seulement facts / cardDesc / historyExcerpt / titre / cardSnapshot.',
          '- Markdown minimal (pas de ## obligatoire). Pas de blabla, pas d\'emoji superflus.',
          '- desc = texte COMPLET de remplacement (pas un diff). Max ~' +
            MAX_DREAM_DESC_LEN +
            ' caract\u00e8res (vise beaucoup moins).',
          '- shouldUpdate:false si rien \u00e0 ajouter/couper de net.',
          '- INTERDIT d\'\u00e9mettre des actions outils\u00a0: tu proposes seulement le desc.',
          'Ex. BON\u00a0: "Vid\u00e9o bon coup au parc (nouvelle roulotte) pour les r\u00e9seaux. Montage + SFX + sous-titres avant publication."',
          'Ex. MAUVAIS\u00a0: brief avec ## Pourquoi / ## Livrable / ## Qui / ## Contraintes / ## D\u00e9j\u00e0 fait / ## Reste.',
          'Contexte\u00a0:',
          JSON.stringify({
            cardName: context.cardName || '',
            cardDesc: currentDesc.slice(0, MAX_DREAM_DESC_LEN),
            cardSnapshot: cardSnapshot,
            facts: facts.slice(0, 8),
            historyExcerpt: historyExcerpt
          })
        ].join('\n')
      },
      {
        role: 'user',
        content:
          'Phase R\u00caVE\u00a0: si besoin, r\u00e9\u00e9cris une Description courte (r\u00e9sum\u00e9 + misc, sans redites). Sinon shouldUpdate:false.'
      }
    ];

    var debug = {
      id: 'dream-' + Date.now().toString(36),
      kind: 'cardDreamTurn',
      label: 'R\u00eave (consolidation description)',
      startedAt: Date.now(),
      attempts: []
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('cardDreamTurn onDebug failed', cbErr);
      }
    }

    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 400,
          temperature: 0.25
        });
        if (response.meta) debug.attempts.push(Object.assign({ label: 'json' }, response.meta));
      } catch (err) {
        if (err && err.debugMeta) {
          debug.attempts.push(Object.assign({ label: 'json' }, err.debugMeta));
        }
        if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 400,
            temperature: 0.25
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
      return {
        ok: false,
        skipped: false,
        reason: 'llm-error',
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
      response.meta || (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response.meta && response.meta.status,
      content: response.content,
      raw: cloneJsonSafe(response.raw),
      parsed: data
    };
    debug.usage = usage;
    emitDebug();

    if (!data || data.shouldUpdate !== true) {
      return {
        ok: true,
        skipped: true,
        reason:
          (data && typeof data.reason === 'string' && data.reason.trim()) ||
          'no-update',
        usage: usage,
        debug: debug
      };
    }

    var nextDesc =
      typeof data.desc === 'string'
        ? data.desc
        : typeof data.description === 'string'
          ? data.description
          : '';
    nextDesc = String(nextDesc).slice(0, MAX_DREAM_DESC_LEN);
    if (normalizeDescForCompare(nextDesc) === normalizeDescForCompare(currentDesc)) {
      return {
        ok: true,
        skipped: true,
        reason: 'unchanged',
        usage: usage,
        debug: debug
      };
    }

    var applied = await executeActions(bridge, [
      { tool: 'set_description', args: { desc: nextDesc } }
    ]);
    var updated = !!(applied && applied.ok);
    return {
      ok: updated,
      skipped: false,
      updated: updated,
      desc: nextDesc,
      reason:
        (typeof data.reason === 'string' && data.reason.trim()) ||
        (updated ? 'updated' : 'apply-failed'),
      applied: applied || null,
      usage: usage,
      debug: debug
    };
  }

  /**
   * On-card-open sanity check: detect discontinuities (esp. Termin\u00e9 + pending tasks).
   * Returns null when nothing to ask; otherwise { message, suggestions, followUps, kind, mismatch }.
   */
  async function cardSanityCheck(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var context = buildContext(bridge);
    var mismatch = null;
    if (
      typeof CompletionTrello !== 'undefined' &&
      typeof CompletionTrello.detectDonePendingMismatch === 'function'
    ) {
      try {
        mismatch = CompletionTrello.detectDonePendingMismatch(
          context.statut,
          typeof bridge.getCompletion === 'function' ? bridge.getCompletion() : null
        );
      } catch (detectErr) {
        console.error('cardSanityCheck detectDonePendingMismatch failed', detectErr);
        mismatch = null;
      }
    }

    var fallback = mismatch
      ? buildDonePendingSanityFallback(mismatch, context.statut)
      : null;

    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      return fallback;
    }

    var messages = [
      {
        role: 'system',
        content: [
          'Tu fais un contr\u00f4le de coh\u00e9rence (sanity check) \u00e0 l\'ouverture d\'une carte Trello (Power-Up Cerveau).',
          'Cherche les discontinuit\u00e9s / contradictions entre statut, sous-t\u00e2ches, blocage et \u00e9ch\u00e9ance.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
          '{"hasIssue":true,"message":"…","suggestions":["…"],"followUps":[{"label":"…","actions":[…]}]}',
          'ou {"hasIssue":false} si tout est coh\u00e9rent.',
          'R\u00e8gles\u00a0:',
          '- Si detected.donePendingMismatch est pr\u00e9sent (statut Termin\u00e9 + sous-t\u00e2ches non finies)\u00a0: hasIssue DOIT \u00eatre true.',
          '- Pose ALORS la question dichotomique\u00a0: t\u00e2ches obsol\u00e8tes OU statut Termin\u00e9 incorrect?',
          '- followUps OBLIGATOIRES avec actions exactes\u00a0:',
          '  1) complete_all_subtasks {} (t\u00e2ches obsol\u00e8tes)',
          '  2) set_statut { category: "started" } (ou unstarted/backlog si plus pertinent d\'apr\u00e8s context.statut.lists)',
          '- message\u00a0: 1–3 phrases, cite 1–2 noms de t\u00e2ches restantes si dispo. Pas de \"Que puis-je faire?\".',
          '- N\'applique AUCUNE action automatiquement (actions:[] ou omit). confirmation via followUps seulement.',
          '- Autres incoh\u00e9rences (bloqu\u00e9 + Termin\u00e9, \u00e9ch\u00e9ance pass\u00e9e + Termin\u00e9 sans t\u00e2ches, etc.)\u00a0: tu PEUX signaler si nettes; sinon hasIssue:false.',
          '- Si rien de net\u00a0: {"hasIssue":false}.',
          'Contexte carte\u00a0:',
          JSON.stringify(context),
          'D\u00e9tections d\u00e9terministes\u00a0:',
          JSON.stringify({
            donePendingMismatch: mismatch || null
          })
        ].join('\n')
      },
      {
        role: 'user',
        content: mismatch
          ? 'Sanity check\u00a0: Termin\u00e9 avec des t\u00e2ches encore ouvertes. Pose la question obsol\u00e8tes vs statut incorrect.'
          : 'Y a-t-il une incoh\u00e9rence nette \u00e0 signaler sur cette carte? Sinon hasIssue:false.'
      }
    ];

    var debug = {
      id: 'sanity-' + Date.now().toString(36),
      kind: 'cardSanityCheck',
      label: 'Contr\u00f4le de coh\u00e9rence',
      startedAt: Date.now(),
      attempts: []
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('cardSanityCheck onDebug failed', cbErr);
      }
    }

    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 480,
          temperature: 0.3
        });
        if (response.meta) debug.attempts.push(Object.assign({ label: 'json' }, response.meta));
      } catch (err) {
        if (err && err.debugMeta) {
          debug.attempts.push(Object.assign({ label: 'json' }, err.debugMeta));
        }
        if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 480,
            temperature: 0.3
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
      return fallback;
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
      response.meta || (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response.meta && response.meta.status,
      content: response.content,
      raw: cloneJsonSafe(response.raw),
      parsed: data
    };
    debug.usage = usage;
    emitDebug();

    if (!data || data.hasIssue === false) {
      // Deterministic mismatch always surfaces even if the model said no.
      return fallback;
    }

    var message =
      typeof data.message === 'string' && data.message.trim()
        ? stripSpaceBeforePunctuation(data.message.trim())
        : fallback
          ? fallback.message
          : '';
    if (!message) return fallback;

    var followUps = [];
    if (Array.isArray(data.followUps)) {
      data.followUps.forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        var label = typeof item.label === 'string' ? item.label.trim() : '';
        if (!label) return;
        var actionsMeta = normalizeActionsWithMeta(item.actions);
        var actions = polishFollowUpActions(actionsMeta.actions || []);
        if (!actions.length) return;
        followUps.push({
          label: ensureFollowUpActionVerb(label, actions),
          actions: actions
        });
      });
    }
    if (mismatch && followUps.length < 2 && fallback) {
      followUps = fallback.followUps.slice();
    }

    var suggestions = normalizeSuggestionList(data.suggestions);
    if (!suggestions.length && fallback) {
      suggestions = fallback.suggestions.slice();
    }

    return {
      kind: mismatch ? 'done_pending_tasks' : 'discontinuity',
      message: message,
      suggestions: suggestions,
      followUps: followUps,
      mismatch: mismatch || null
    };
  }

  function validateDueDate(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return undefined;
    var trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
    return trimmed;
  }

  function validateDueTime(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return undefined;
    var trimmed = value.trim();
    if (!/^\d{2}:\d{2}$/.test(trimmed)) return undefined;
    return trimmed;
  }

  /**
   * Resolve a Vague échéance id from set_due args (catalog id or natural phrase).
   * Continuum includes bientot → tres-lointain (proche / lointain / eventuellement kept).
   */
  function resolveDueVagueArg(raw) {
    if (raw == null || raw === '') return '';
    var asString = typeof raw === 'string' ? raw : String(raw);
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.normalizeDueVague === 'function'
    ) {
      var catalogId = PriorityUI.normalizeDueVague(asString);
      if (catalogId) return catalogId;
    }
    var t = asString
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[''`]/g, ' ')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return '';
    if (
      t === 'eventuellement' ||
      t === 'eventually' ||
      t === 'someday' ||
      t === 'some day' ||
      t === 'todo eventually' ||
      t === 'a faire eventuellement' ||
      t === 'faire eventuellement' ||
      t.indexOf('eventuel') >= 0
    ) {
      return 'eventuellement';
    }
    if (
      t.indexOf('tres lointain') >= 0 ||
      t.indexOf('very far') >= 0 ||
      t === 'tres-lointain'
    ) {
      return 'tres-lointain';
    }
    if (
      t.indexOf('assez lointain') >= 0 ||
      t === 'assez-lointain'
    ) {
      return 'assez-lointain';
    }
    if (
      t === 'lointain' ||
      t === 'far future' ||
      t === 'long term' ||
      t === 'long-term' ||
      t.indexOf('futur lointain') >= 0
    ) {
      return 'lointain';
    }
    if (
      t === 'proche' ||
      t === 'near future' ||
      t === 'soonish' ||
      t.indexOf('futur proche') >= 0 ||
      t.indexOf('near term') >= 0
    ) {
      return 'proche';
    }
    if (
      t === 'bientot' ||
      t === 'soon' ||
      t.indexOf('bientot') >= 0
    ) {
      return 'bientot';
    }
    if (t.indexOf('sous peu') >= 0) return 'sous-peu';
    if (t.indexOf('quelques semaines') >= 0) return 'quelques-semaines';
    if (t.indexOf('quelques mois') >= 0) return 'quelques-mois';
    if (t.indexOf('semestre') >= 0) return 'semestre';
    if (t.indexOf('an ou deux') >= 0 || t.indexOf('un an ou deux') >= 0) {
      return 'an-ou-deux';
    }
    if (t.indexOf('mois qui vient') >= 0 || t === 'prochain-mois') {
      return 'prochain-mois';
    }
    return '';
  }

  function resolveDueVagueToDateSafe(id) {
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.resolveDueVagueToDate === 'function'
    ) {
      return PriorityUI.resolveDueVagueToDate(id) || '';
    }
    return '';
  }

  function normalizeMatchKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Match a board member by id, fullName, or username.
   * Spec can be a string, or { id?, matchText?, name?, username? }.
   */
  function matchBoardMember(members, spec) {
    var list = Array.isArray(members) ? members : [];
    if (!list.length || spec == null || spec === '') return null;
    var idWant = '';
    var textWant = '';
    if (typeof spec === 'string' || typeof spec === 'number') {
      textWant = String(spec).trim();
      idWant = textWant;
    } else if (typeof spec === 'object') {
      idWant =
        spec.id != null
          ? String(spec.id).trim()
          : spec.memberId != null
            ? String(spec.memberId).trim()
            : '';
      textWant =
        (typeof spec.matchText === 'string' && spec.matchText) ||
        (typeof spec.name === 'string' && spec.name) ||
        (typeof spec.fullName === 'string' && spec.fullName) ||
        (typeof spec.username === 'string' && spec.username) ||
        '';
      textWant = String(textWant).trim();
    }
    if (idWant) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].id) === idWant) return list[i];
      }
    }
    var key = normalizeMatchKey(textWant);
    if (!key) return null;
    var exact = null;
    var partial = null;
    for (var j = 0; j < list.length; j++) {
      var m = list[j];
      if (!m) continue;
      var full = normalizeMatchKey(m.fullName || '');
      var user = normalizeMatchKey(m.username || '');
      if (full === key || user === key) {
        exact = m;
        break;
      }
      if (
        !partial &&
        ((full && full.indexOf(key) >= 0) || (user && user.indexOf(key) >= 0))
      ) {
        partial = m;
      }
    }
    return exact || partial;
  }

  /**
   * Match a board/card label by id or name (optional color).
   */
  function matchBoardLabel(labels, spec) {
    var list = Array.isArray(labels) ? labels : [];
    if (!list.length || spec == null || spec === '') return null;
    var idWant = '';
    var textWant = '';
    var colorWant = '';
    if (typeof spec === 'string' || typeof spec === 'number') {
      textWant = String(spec).trim();
      idWant = textWant;
    } else if (typeof spec === 'object') {
      idWant =
        spec.id != null
          ? String(spec.id).trim()
          : spec.labelId != null
            ? String(spec.labelId).trim()
            : '';
      textWant =
        (typeof spec.matchText === 'string' && spec.matchText) ||
        (typeof spec.name === 'string' && spec.name) ||
        '';
      textWant = String(textWant).trim();
      colorWant = typeof spec.color === 'string' ? spec.color.trim().toLowerCase() : '';
    }
    if (idWant) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].id) === idWant) return list[i];
      }
    }
    var key = normalizeMatchKey(textWant);
    if (!key && !colorWant) return null;
    var exact = null;
    var partial = null;
    for (var j = 0; j < list.length; j++) {
      var l = list[j];
      if (!l) continue;
      var name = normalizeMatchKey(l.name || '');
      var color = typeof l.color === 'string' ? l.color.toLowerCase() : '';
      if (colorWant && color !== colorWant) continue;
      if (key && name === key) {
        exact = l;
        break;
      }
      if (key && !partial && name && name.indexOf(key) >= 0) partial = l;
      if (!key && colorWant && color === colorWant && !partial) partial = l;
    }
    return exact || partial;
  }

  /** Resolve a member role id from catalog id or French label. */
  function resolveMemberRoleId(raw) {
    if (raw == null || raw === '') return '';
    var asString = String(raw).trim();
    if (!asString) return '';
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.isValidMemberRoleId === 'function' &&
      PriorityUI.isValidMemberRoleId(asString)
    ) {
      return asString;
    }
    var key = normalizeMatchKey(asString);
    var catalog = [];
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.getMemberRoleCatalog === 'function'
    ) {
      catalog = PriorityUI.getMemberRoleCatalog() || [];
    } else if (
      typeof PriorityUI !== 'undefined' &&
      Array.isArray(PriorityUI.BUILTIN_MEMBER_ROLES)
    ) {
      catalog = PriorityUI.BUILTIN_MEMBER_ROLES;
    }
    for (var i = 0; i < catalog.length; i++) {
      var entry = catalog[i];
      if (!entry) continue;
      if (String(entry.id) === asString) return entry.id;
      if (normalizeMatchKey(entry.label || '') === key) return entry.id;
    }
    // Common aliases
    if (key === 'sous-titres' || key === 'sous titres' || key === 'captions') {
      return 'subtitles';
    }
    if (key === 'etalonnage' || key === 'color' || key === 'color grading') {
      return 'coloring';
    }
    if (key === 'montage' || key === 'editing' || key === 'edit') {
      return 'editing';
    }
    if (key.indexOf('musique') >= 0 || key === 'music' || key === 'sfx') {
      return 'music';
    }
    return '';
  }

  function matchCustomAssignee(list, spec, peopleDirectory) {
    var people = Array.isArray(list) ? list : [];
    if (spec == null || spec === '') return null;

    // Resolve aliases via People directory first (ma boss → Jane Doe).
    var resolved = null;
    if (
      global.People &&
      typeof global.People.resolveAssigneeSpec === 'function' &&
      peopleDirectory
    ) {
      try {
        resolved = global.People.resolveAssigneeSpec(peopleDirectory, spec);
      } catch (e) {
        resolved = null;
      }
    }

    var idWant = '';
    var textWant = '';
    if (typeof spec === 'string' || typeof spec === 'number') {
      textWant = String(spec).trim();
      idWant = textWant;
    } else if (typeof spec === 'object') {
      idWant = spec.id != null ? String(spec.id).trim() : '';
      textWant =
        (typeof spec.matchText === 'string' && spec.matchText) ||
        (typeof spec.name === 'string' && spec.name) ||
        (typeof spec.fullName === 'string' && spec.fullName) ||
        '';
      textWant = String(textWant).trim();
    }
    if (resolved) {
      if (resolved.id) idWant = resolved.id;
      if (resolved.name) textWant = resolved.name;
    }

    if (!people.length) return null;

    if (idWant) {
      for (var i = 0; i < people.length; i++) {
        if (people[i] && String(people[i].id) === idWant) return people[i];
      }
    }
    var key = normalizeMatchKey(textWant);
    if (!key) return null;
    for (var j = 0; j < people.length; j++) {
      if (normalizeMatchKey((people[j] && people[j].name) || '') === key) {
        return people[j];
      }
    }
    for (var k = 0; k < people.length; k++) {
      var name = normalizeMatchKey((people[k] && people[k].name) || '');
      if (name && name.indexOf(key) >= 0) return people[k];
    }
    return null;
  }

  /**
   * Build a Hors Trello draft from an add-spec, preferring People directory
   * (shared person-* id + canonical name).
   */
  function draftCustomAssigneeFromSpec(spec, peopleDirectory) {
    if (
      global.People &&
      typeof global.People.resolveAssigneeSpec === 'function' &&
      peopleDirectory
    ) {
      try {
        var fromPeople = global.People.resolveAssigneeSpec(peopleDirectory, spec);
        if (fromPeople && fromPeople.name) {
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.createCustomAssignee === 'function'
          ) {
            return PriorityUI.createCustomAssignee(fromPeople);
          }
          return fromPeople;
        }
      } catch (e) { /* fall through */ }
    }
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.createCustomAssignee === 'function'
    ) {
      return PriorityUI.createCustomAssignee(spec);
    }
    if (typeof spec === 'string' && spec.trim()) {
      return { name: spec.trim() };
    }
    if (spec && typeof spec === 'object' && typeof spec.name === 'string') {
      return { name: spec.name.trim(), id: spec.id, trelloMemberId: spec.trelloMemberId };
    }
    return null;
  }

  function resolveChecklistParent(items, args) {
    var parentArgs = {
      id:
        args && typeof args.parentId === 'string'
          ? args.parentId
          : args && typeof args.parent === 'string'
            ? args.parent
            : '',
      matchText:
        args && typeof args.parentMatchText === 'string'
          ? args.parentMatchText
          : args && typeof args.parentText === 'string'
            ? args.parentText
            : ''
    };
    return resolveSubtaskItem(items, parentArgs);
  }

  function resolveChecklistChild(parent, args) {
    if (!parent || !Array.isArray(parent.items)) return null;
    return resolveSubtaskItem(parent.items, args);
  }

  // exports
  S.cardDreamTurn = cardDreamTurn;
  S.cardSanityCheck = cardSanityCheck;
  S.draftCustomAssigneeFromSpec = draftCustomAssigneeFromSpec;
  S.matchBoardLabel = matchBoardLabel;
  S.matchBoardMember = matchBoardMember;
  S.matchCustomAssignee = matchCustomAssignee;
  S.normalizeMatchKey = normalizeMatchKey;
  S.resolveChecklistChild = resolveChecklistChild;
  S.resolveChecklistParent = resolveChecklistParent;
  S.resolveDueVagueArg = resolveDueVagueArg;
  S.resolveDueVagueToDateSafe = resolveDueVagueToDateSafe;
  S.resolveMemberRoleId = resolveMemberRoleId;
  S.validateDueDate = validateDueDate;
  S.validateDueTime = validateDueTime;
})(typeof window !== 'undefined' ? window : this);
