/**
 * AI agent: card dream
 *
 * Part 8/10 of agent. Status brief, progress summary and the background consolidation after a chat.
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var MAX_DREAM_DESC_LEN = S.MAX_DREAM_DESC_LEN;
  var MAX_TURN_ACTIONS = S.MAX_TURN_ACTIONS;

  // from other parts (functions, resolved at call time)
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

  function snapshotPriority(bridge) {
    var s =
      typeof bridge.getPriorityState === 'function' ? bridge.getPriorityState() || {} : {};
    var links = Array.isArray(s.blockedLinks)
      ? s.blockedLinks
          .map(function (link) {
            if (!link || typeof link !== 'object') return null;
            var lid = link.id != null ? String(link.id).trim() : '';
            if (!lid) return null;
            return {
              type: 'subtask',
              id: lid,
              label:
                typeof link.label === 'string' && link.label.trim()
                  ? link.label.trim()
                  : undefined
            };
          })
          .filter(Boolean)
      : [];
    var dueVague =
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.normalizeDueVague === 'function'
        ? PriorityUI.normalizeDueVague(s.dueVague)
        : typeof s.dueVague === 'string'
          ? s.dueVague.trim()
          : '';
    var dueMode =
      dueVague || s.dueMode === 'vague'
        ? 'vague'
        : 'precise';
    return {
      urgency: s.urgency,
      impact: s.impact,
      ease: s.ease,
      empressement: s.empressement,
      estimatedDurationMinutes:
        s.estimatedDurationMinutes != null && isFinite(+s.estimatedDurationMinutes)
          ? +s.estimatedDurationMinutes
          : null,
      priorityEnabled: s.priorityEnabled !== false,
      dueDate: s.dueDate || '',
      dueTime: s.dueTime || '',
      dueEnabled: !!s.dueEnabled,
      dueMode: dueMode,
      dueVague: dueVague,
      startDate: s.startDate || '',
      startTime: s.startTime || '',
      recurrence: (function () {
        if (
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.normalizeRecurrence === 'function'
        ) {
          return PriorityUI.normalizeRecurrence(s.recurrence);
        }
        return s.recurrence && typeof s.recurrence === 'object' ? s.recurrence : null;
      })(),
      enAttente: !!s.enAttente,
      blockedReasons: Array.isArray(s.blockedReasons)
        ? s.blockedReasons.slice()
        : s.blockedReason
          ? [s.blockedReason]
          : [],
      blockedLinks: links,
      taskTypes: normalizeAgentTaskTypes(s.taskTypes),
      taskTypesLocked: s.taskTypesLocked === true
    };
  }

  function snapshotCompletion(bridge) {
    var c =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion() || { items: [] }
        : { items: [] };
    return {
      progress: c.progress,
      progressEnabled: c.progressEnabled !== false,
      estimatedMinutes:
        c.estimatedMinutes != null && isFinite(+c.estimatedMinutes)
          ? +c.estimatedMinutes
          : null,
      estimatedMinutesOffset:
        typeof c.estimatedMinutesOffset === 'number' &&
        isFinite(c.estimatedMinutesOffset)
          ? c.estimatedMinutesOffset
          : null,
      items: (c.items || []).map(function (it) {
        return {
          id: it.id,
          text: it.text,
          done: !!it.done,
          progress: it.progress != null ? it.progress : 0,
          estimatedMinutes:
            it.estimatedMinutes != null && isFinite(+it.estimatedMinutes)
              ? +it.estimatedMinutes
              : null
        };
      })
    };
  }

  function resolveEstimateMinutesArg(args) {
    args = args || {};
    if (args.estimatedMinutes === null || args.estimatedMinutes === '') {
      return null;
    }
    if (args.estimatedMinutes !== undefined && args.estimatedMinutes !== '') {
      if (
        typeof CompletionTrello !== 'undefined' &&
        typeof CompletionTrello.clampEstimatedMinutes === 'function'
      ) {
        return CompletionTrello.clampEstimatedMinutes(args.estimatedMinutes);
      }
      var n = +args.estimatedMinutes;
      return isFinite(n) && n > 0 ? Math.round(n) : null;
    }
    var text =
      typeof args.estimatedDuration === 'string'
        ? args.estimatedDuration
        : typeof args.duration === 'string'
          ? args.duration
          : '';
    if (!text.trim()) return undefined;
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.parseDurationNl === 'function'
    ) {
      var parsed = PriorityUI.parseDurationNl(text);
      if (
        typeof CompletionTrello !== 'undefined' &&
        typeof CompletionTrello.clampEstimatedMinutes === 'function'
      ) {
        return CompletionTrello.clampEstimatedMinutes(parsed);
      }
      return parsed;
    }
    return undefined;
  }

  function fmtVal(v) {
    if (v == null || v === '') return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (Array.isArray(v)) return '[' + v.join(', ') + ']';
    return String(v);
  }

  function pushChange(parts, key, before, after) {
    if (before === after) return;
    if (
      Array.isArray(before) &&
      Array.isArray(after) &&
      JSON.stringify(before) === JSON.stringify(after)
    ) {
      return;
    }
    parts.push(key + ' ' + fmtVal(before) + ' \u2192 ' + fmtVal(after));
  }

  function findItem(items, id) {
    for (var i = 0; i < (items || []).length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  /** Normalize subtask title for exact duplicate checks (trim + locale lower). */
  function normalizeSubtaskTitleKey(text) {
    return String(text || '')
      .trim()
      .toLocaleLowerCase('fr-FR');
  }

  /** Find an existing progress item by exact title (case/accent insensitive). */
  function findExistingSubtaskByText(items, text) {
    var needle = normalizeSubtaskTitleKey(text);
    if (!needle) return null;
    var list = items || [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item) continue;
      if (normalizeSubtaskTitleKey(item.text) === needle) return item;
    }
    return null;
  }

  /** Resolve a subtask by id, or by case-insensitive text match (exact then contains). */
  function resolveSubtaskItem(items, args) {
    var list = items || [];
    var id = args && typeof args.id === 'string' ? args.id.trim() : '';
    if (id) {
      var byId = findItem(list, id);
      if (byId) return byId;
    }
    var matchRaw =
      args && typeof args.matchText === 'string'
        ? args.matchText.trim()
        : args && typeof args.from === 'string'
          ? args.from.trim()
          : '';
    if (!matchRaw) return null;
    var needle = matchRaw.toLocaleLowerCase('fr-FR');
    var exact = null;
    var contains = null;
    for (var i = 0; i < list.length; i++) {
      var text = String(list[i].text || '').trim();
      var key = text.toLocaleLowerCase('fr-FR');
      if (key === needle) {
        exact = list[i];
        break;
      }
      if (!contains && key.indexOf(needle) !== -1) contains = list[i];
    }
    return exact || contains;
  }

  /** Resolve blockedLinks args against live subtasks (id or matchText). */
  function resolveBlockedLinkArgs(rawLinks, items) {
    if (!Array.isArray(rawLinks)) return null;
    var out = [];
    var seen = {};
    for (var i = 0; i < rawLinks.length; i++) {
      var raw = rawLinks[i];
      if (!raw || typeof raw !== 'object') continue;
      var target = resolveSubtaskItem(items, raw);
      if (!target && typeof raw.id === 'string' && raw.id.trim()) {
        target = { id: raw.id.trim(), text: raw.label || '' };
      }
      if (!target || !target.id) continue;
      var id = String(target.id);
      if (seen[id]) continue;
      seen[id] = true;
      var label =
        typeof raw.label === 'string' && raw.label.trim()
          ? raw.label.trim()
          : target.text
            ? String(target.text).trim()
            : undefined;
      out.push({
        type: 'subtask',
        id: id,
        label: label
      });
    }
    return out;
  }

  function resolveHeatSegment(tier, heatTarget) {
    var segs =
      typeof PriorityUI !== 'undefined' && Array.isArray(PriorityUI.HEAT_SEGMENTS)
        ? PriorityUI.HEAT_SEGMENTS
        : [];
    if (heatTarget != null && isFinite(Number(heatTarget))) {
      var target = Number(heatTarget);
      var best = null;
      var bestDist = Infinity;
      for (var i = 0; i < segs.length; i++) {
        var dist = Math.abs(segs[i].target - target);
        if (dist < bestDist) {
          bestDist = dist;
          best = segs[i];
        }
      }
      if (best && bestDist < 0.6) return best;
    }
    if (typeof tier !== 'string' || !tier.trim()) return null;
    var needle = tier.trim().toLocaleLowerCase('fr-FR');
    var aliases = {
      critique: 'Critique',
      urgente: 'Urgente',
      urgent: 'Urgente',
      prioritaire: 'Prioritaire',
      importante: 'Importante',
      important: 'Importante',
      flexible: 'Flexible',
      secondaire: 'Secondaire',
      optionnelle: 'Optionnelle',
      optionnel: 'Optionnelle'
    };
    if (aliases[needle]) needle = aliases[needle].toLocaleLowerCase('fr-FR');
    for (var j = 0; j < segs.length; j++) {
      var label = String(segs[j].label || '').toLocaleLowerCase('fr-FR');
      if (label === needle) return segs[j];
    }
    return null;
  }

  function resolveStatutListId(statut, args) {
    if (!statut || typeof statut !== 'object') return null;
    var lists = Array.isArray(statut.lists) ? statut.lists : [];
    var roleLists =
      statut.roleLists && typeof statut.roleLists === 'object'
        ? statut.roleLists
        : {};

    if (typeof args.listId === 'string' && args.listId.trim()) {
      var wantId = args.listId.trim();
      for (var i = 0; i < lists.length; i++) {
        if (String(lists[i].id) === wantId) return wantId;
      }
      return wantId;
    }

    if (typeof args.category === 'string' && args.category.trim()) {
      var catRaw = args.category.trim().toLocaleLowerCase('fr-FR');
      var roleAlias = {
        blocked: 'blocked',
        bloque: 'blocked',
        'bloqu\u00e9': 'blocked',
        bloquee: 'blocked',
        completed: 'completed',
        complete: 'completed',
        termine: 'completed',
        'termin\u00e9': 'completed',
        terminee: 'completed',
        done: 'completed',
        triage: 'triage',
        backlog: 'backlog',
        unstarted: 'unstarted',
        'a faire': 'unstarted',
        todo: 'unstarted',
        started: 'started',
        active: 'started',
        'en cours': 'started',
        waiting: 'waiting',
        attente: 'waiting',
        canceled: 'canceled',
        cancelled: 'canceled',
        annule: 'canceled'
      };
      var role = roleAlias[catRaw] || catRaw;
      // Role lists only define blocked/completed targets.
      if (
        (role === 'blocked' || role === 'completed') &&
        roleLists[role]
      ) {
        return String(roleLists[role]);
      }
      for (var c = 0; c < lists.length; c++) {
        var listCat = lists[c].category
          ? String(lists[c].category).toLocaleLowerCase('fr-FR')
          : '';
        if (listCat === role || listCat === catRaw) return String(lists[c].id);
      }
    }

    if (typeof args.matchList === 'string' && args.matchList.trim()) {
      var needle = args.matchList.trim().toLocaleLowerCase('fr-FR');
      var exact = null;
      var contains = null;
      for (var m = 0; m < lists.length; m++) {
        var name = String(lists[m].name || '')
          .trim()
          .toLocaleLowerCase('fr-FR');
        if (name === needle) {
          exact = lists[m];
          break;
        }
        if (!contains && name.indexOf(needle) !== -1) contains = lists[m];
      }
      var hit = exact || contains;
      return hit ? String(hit.id) : null;
    }

    return null;
  }

  function detailForTool(tool, beforeP, afterP, beforeC, afterC, args, extra) {
    var parts = [];
    args = args || {};
    extra = extra || {};
    if (tool === 'set_priority') {
      pushChange(parts, 'priorityEnabled', beforeP.priorityEnabled, afterP.priorityEnabled);
      pushChange(parts, 'empressement', beforeP.empressement, afterP.empressement);
      pushChange(parts, 'impact', beforeP.impact, afterP.impact);
      pushChange(parts, 'ease', beforeP.ease, afterP.ease);
      pushChange(
        parts,
        'estimatedDurationMinutes',
        beforeP.estimatedDurationMinutes,
        afterP.estimatedDurationMinutes
      );
    } else if (tool === 'set_task_types') {
      pushChange(
        parts,
        'taskTypes',
        (beforeP.taskTypes || []).join(','),
        (afterP.taskTypes || []).join(',')
      );
    } else if (tool === 'set_due') {
      pushChange(parts, 'dueEnabled', beforeP.dueEnabled, afterP.dueEnabled);
      pushChange(parts, 'dueDate', beforeP.dueDate, afterP.dueDate);
      pushChange(parts, 'dueTime', beforeP.dueTime, afterP.dueTime);
      pushChange(parts, 'dueMode', beforeP.dueMode, afterP.dueMode);
      pushChange(parts, 'dueVague', beforeP.dueVague, afterP.dueVague);
      pushChange(parts, 'startDate', beforeP.startDate, afterP.startDate);
      pushChange(parts, 'startTime', beforeP.startTime, afterP.startTime);
      pushChange(
        parts,
        'recurrence',
        beforeP.recurrence
          ? JSON.stringify(beforeP.recurrence)
          : '',
        afterP.recurrence ? JSON.stringify(afterP.recurrence) : ''
      );
    } else if (tool === 'set_blocked') {
      pushChange(parts, 'enAttente', beforeP.enAttente, afterP.enAttente);
      pushChange(
        parts,
        'blockedReasons',
        beforeP.blockedReasons,
        afterP.blockedReasons
      );
      pushChange(
        parts,
        'blockedLinks',
        (beforeP.blockedLinks || []).map(function (l) {
          return l.id + (l.label ? ':' + l.label : '');
        }),
        (afterP.blockedLinks || []).map(function (l) {
          return l.id + (l.label ? ':' + l.label : '');
        })
      );
      if (beforeC && afterC) {
        pushChange(parts, 'progress', beforeC.progress, afterC.progress);
      }
    } else if (tool === 'set_progress') {
      pushChange(
        parts,
        'progressEnabled',
        beforeC.progressEnabled,
        afterC.progressEnabled
      );
      pushChange(parts, 'progress', beforeC.progress, afterC.progress);
      if (
        (beforeC.items && beforeC.items.length) ||
        (afterC.items && afterC.items.length)
      ) {
        parts.push(
          'items ' +
            (beforeC.items || []).length +
            ' \u2192 ' +
            (afterC.items || []).length
        );
      }
    } else if (tool === 'set_formula') {
      parts.push('formula \u2192 ' + ((extra && extra.formula) || args.formula || '?'));
    } else if (tool === 'set_statut') {
      parts.push(
        'list \u2192 ' +
          ((extra && extra.listName) || args.matchList || args.category || args.listId || '?')
      );
      if (extra && extra.listId) parts.push('id: ' + extra.listId);
    } else if (tool === 'rename_card') {
      var beforeCard =
        (extra && typeof extra.before === 'string' && extra.before) ||
        '';
      var afterCard =
        (extra && typeof extra.after === 'string' && extra.after) ||
        (typeof args.name === 'string' && args.name.trim()) ||
        (typeof args.text === 'string' && args.text.trim()) ||
        '?';
      if (beforeCard) {
        parts.push('"' + beforeCard + '" \u2192 "' + afterCard + '"');
      } else {
        parts.push('name \u2192 "' + afterCard + '"');
      }
    } else if (tool === 'set_description') {
      var beforeDesc =
        (extra && typeof extra.before === 'string' && extra.before) || '';
      var afterDesc =
        (extra && typeof extra.after === 'string' && extra.after) ||
        (typeof args.desc === 'string' && args.desc) ||
        (typeof args.description === 'string' && args.description) ||
        (typeof args.text === 'string' && args.text) ||
        '';
      var preview = function (s) {
        var t = String(s || '').replace(/\s+/g, ' ').trim();
        if (!t) return '(vide)';
        return t.length > 80 ? t.slice(0, 79) + '\u2026' : t;
      };
      if (beforeDesc) {
        parts.push('"' + preview(beforeDesc) + '" \u2192 "' + preview(afterDesc) + '"');
      } else {
        parts.push('desc \u2192 "' + preview(afterDesc) + '"');
      }
    } else if (tool === 'add_subtask') {
      var text = typeof args.text === 'string' ? args.text.trim() : '';
      parts.push('+ "' + text + '"' + (extra.id ? ' (id: ' + extra.id + ')' : ''));
      parts.push('items ' + beforeC.items.length + ' \u2192 ' + afterC.items.length);
    } else if (tool === 'rename_subtask') {
      var beforeRename = findItem(beforeC.items, (extra && extra.id) || args.id);
      var afterRename = findItem(afterC.items, (extra && extra.id) || args.id);
      if (beforeRename && afterRename) {
        parts.push('id: ' + afterRename.id);
        parts.push(
          '"' +
            (beforeRename.text || '') +
            '" \u2192 "' +
            (afterRename.text || '') +
            '"'
        );
      } else {
        parts.push('id: ' + ((extra && extra.id) || args.id || '?'));
      }
    } else if (tool === 'remove_subtask') {
      var removed = findItem(beforeC.items, (extra && extra.id) || args.id);
      parts.push(
        '- "' +
          ((removed && removed.text) || args.matchText || '?') +
          '"' +
          (extra && extra.id ? ' (id: ' + extra.id + ')' : '')
      );
      parts.push('items ' + beforeC.items.length + ' \u2192 ' + afterC.items.length);
    } else if (
      tool === 'toggle_subtask' ||
      tool === 'set_subtask_progress' ||
      tool === 'set_subtask_blocked'
    ) {
      var tid = (extra && extra.id) || args.id;
      var beforeItem = findItem(beforeC.items, tid);
      var afterItem = findItem(afterC.items, tid);
      if (beforeItem && afterItem) {
        parts.push('id: ' + tid);
        if (beforeItem.text) parts.push('"' + beforeItem.text + '"');
        pushChange(parts, 'done', beforeItem.done, afterItem.done);
        pushChange(parts, 'progress', beforeItem.progress, afterItem.progress);
        pushChange(parts, 'blocked', !!beforeItem.blocked, !!afterItem.blocked);
      } else {
        parts.push('id: ' + (tid || '?'));
      }
    } else if (tool === 'complete_all_subtasks' || tool === 'reset_progress') {
      pushChange(parts, 'progress', beforeC.progress, afterC.progress);
      parts.push('items ' + beforeC.items.length + ' \u2192 ' + afterC.items.length);
    } else if (tool === 'trigger_effect') {
      var effectId =
        (extra && extra.effect) ||
        normalizeEffectId(args.effect || args.name || args.id) ||
        '?';
      parts.push('effect \u2192 ' + effectId);
      var fxText =
        (extra && extra.text) ||
        (typeof args.text === 'string' && args.text.trim()) ||
        (typeof args.label === 'string' && args.label.trim()) ||
        '';
      if (fxText) parts.push('text \u2192 ' + fxText);
    } else if (tool === 'point_at') {
      var pointSection =
        (extra && extra.section) ||
        normalizePointSection(args.section || args.target || args.area) ||
        '';
      var pointField =
        (extra && extra.field) ||
        normalizePointField(args.field || args.axis) ||
        '';
      var pointLevel =
        extra && extra.level != null
          ? extra.level
          : normalizePointLevel(args.level != null ? args.level : args.value);
      if (pointSection) parts.push('section \u2192 ' + pointSection);
      if (pointField) parts.push('field \u2192 ' + pointField);
      if (pointLevel != null) parts.push('level \u2192 ' + pointLevel);
    } else if (tool === 'set_agent_name') {
      var beforeAgent =
        (extra && typeof extra.before === 'string' && extra.before) || '';
      var afterAgent =
        (extra && typeof extra.after === 'string' && extra.after) ||
        (typeof args.name === 'string' && args.name.trim()) ||
        (typeof args.text === 'string' && args.text.trim()) ||
        '?';
      if (beforeAgent) {
        parts.push('"' + beforeAgent + '" \u2192 "' + afterAgent + '"');
      } else {
        parts.push('name \u2192 "' + afterAgent + '"');
      }
    } else if (tool === 'set_agent_color') {
      var beforeColor =
        (extra && typeof extra.before === 'string' && extra.before) || '';
      var afterColor =
        (extra && typeof extra.after === 'string' && extra.after) ||
        normalizeAgentColorArg(
          (args && (args.color || args.aura || args.value || args.text)) || ''
        ) ||
        '?';
      if (beforeColor) {
        parts.push(beforeColor + ' \u2192 ' + afterColor);
      } else {
        parts.push('color \u2192 ' + afterColor);
      }
    } else if (tool === 'set_agent_personality') {
      var afterPersonality =
        (extra && typeof extra.after === 'string' && extra.after) ||
        (typeof args.personality === 'string' && args.personality.trim()) ||
        (typeof args.text === 'string' && args.text.trim()) ||
        (typeof args.value === 'string' && args.value.trim()) ||
        '?';
      if (afterPersonality.length > 48) {
        afterPersonality = afterPersonality.slice(0, 47) + '\u2026';
      }
      parts.push('personality \u2192 "' + afterPersonality + '"');
    } else if (tool === 'upsert_person') {
      var personAfter =
        (extra && extra.person && typeof extra.person === 'object'
          ? extra.person
          : null) || null;
      var personBefore =
        (extra && extra.before && typeof extra.before === 'object'
          ? extra.before
          : null) || null;
      var personName =
        (personAfter && personAfter.name) ||
        (typeof extra.name === 'string' && extra.name.trim()) ||
        (typeof args.name === 'string' && args.name.trim()) ||
        (typeof args.matchText === 'string' && args.matchText.trim()) ||
        '?';
      if (extra && extra.created) {
        parts.push('"' + personName + '" cr\u00e9\u00e9e');
        if (personAfter) {
          if (personAfter.relation) {
            parts.push('relation: ' + personAfter.relation);
          }
          if (personAfter.aliases && personAfter.aliases.length) {
            parts.push('aliases: ' + personAfter.aliases.join(', '));
          }
          if (personAfter.roles && personAfter.roles.length) {
            parts.push('roles: ' + personAfter.roles.join(', '));
          }
          if (personAfter.email) parts.push('email: ' + personAfter.email);
          if (personAfter.phone) parts.push('phone: ' + personAfter.phone);
        } else {
          if (typeof args.relation === 'string' && args.relation.trim()) {
            parts.push('relation: ' + args.relation.trim());
          }
          if (typeof args.addAlias === 'string' && args.addAlias.trim()) {
            parts.push('+alias: ' + args.addAlias.trim());
          }
        }
      } else if (personBefore && personAfter) {
        var personChanges = [];
        pushChange(personChanges, 'name', personBefore.name, personAfter.name);
        pushChange(
          personChanges,
          'relation',
          personBefore.relation || '',
          personAfter.relation || ''
        );
        pushChange(
          personChanges,
          'aliases',
          personBefore.aliases || [],
          personAfter.aliases || []
        );
        pushChange(
          personChanges,
          'roles',
          personBefore.roles || [],
          personAfter.roles || []
        );
        pushChange(
          personChanges,
          'email',
          personBefore.email || '',
          personAfter.email || ''
        );
        pushChange(
          personChanges,
          'phone',
          personBefore.phone || '',
          personAfter.phone || ''
        );
        pushChange(
          personChanges,
          'notes',
          personBefore.notes || '',
          personAfter.notes || ''
        );
        if (personChanges.length) {
          parts.push('"' + personName + '" mise \u00e0 jour');
          Array.prototype.push.apply(parts, personChanges);
        } else {
          parts.push('"' + personName + '" d\u00e9j\u00e0 \u00e0 jour');
        }
      } else {
        parts.push('"' + personName + '" mise \u00e0 jour');
        if (typeof args.relation === 'string' && args.relation.trim()) {
          parts.push('relation: ' + args.relation.trim());
        }
        if (typeof args.addAlias === 'string' && args.addAlias.trim()) {
          parts.push('+alias: ' + args.addAlias.trim());
        }
        if (typeof args.addRole === 'string' && args.addRole.trim()) {
          parts.push('+role: ' + args.addRole.trim());
        }
        if (typeof args.email === 'string' && args.email.trim()) {
          parts.push('email: ' + args.email.trim());
        }
        if (typeof args.phone === 'string' && args.phone.trim()) {
          parts.push('phone: ' + args.phone.trim());
        }
      }
    } else if (tool === 'remove_person') {
      var removeLabel =
        (extra && typeof extra.name === 'string' && extra.name.trim()) ||
        (extra && typeof extra.match === 'string' && extra.match.trim()) ||
        (typeof args.name === 'string' && args.name.trim()) ||
        (typeof args.matchText === 'string' && args.matchText.trim()) ||
        (typeof args.id === 'string' && args.id.trim()) ||
        '?';
      parts.push('- "' + removeLabel + '"');
    } else if (tool === 'set_members' || tool === 'set_labels') {
      var memberOps = (extra && Array.isArray(extra.ops) && extra.ops) || [];
      if (memberOps.length) {
        parts.push(memberOps.join(', '));
      } else {
        parts.push(tool === 'set_labels' ? 'aucune \u00e9tiquette' : 'aucun membre');
      }
    } else if (tool === 'set_custom_assignees') {
      if (extra && extra.count != null) {
        parts.push('personnes: ' + extra.count);
      }
      if (Array.isArray(args.add) && args.add.length) {
        parts.push(
          '+ ' +
            args.add
              .map(function (s) {
                return typeof s === 'string'
                  ? s
                  : (s && (s.name || s.matchText || s.id)) || '?';
              })
              .join(', ')
        );
      }
      if (Array.isArray(args.remove) && args.remove.length) {
        parts.push(
          '- ' +
            args.remove
              .map(function (s) {
                return typeof s === 'string'
                  ? s
                  : (s && (s.name || s.matchText || s.id)) || '?';
              })
              .join(', ')
        );
      }
      if (args.clear === true) parts.push('clear');
    } else if (tool === 'set_member_roles') {
      var roleMember =
        (extra && extra.memberId) ||
        args.memberId ||
        args.matchText ||
        args.name ||
        '?';
      var roleList =
        (extra && Array.isArray(extra.roles) && extra.roles) ||
        (Array.isArray(args.roles) && args.roles) ||
        [];
      parts.push('member: ' + roleMember);
      if (args.clear === true) {
        parts.push('roles \u2192 (vid\u00e9)');
      } else {
        parts.push(
          'roles \u2192 ' + (roleList.length ? roleList.join(', ') : '(aucun)')
        );
      }
    } else if (tool === 'set_project') {
      if (extra && extra.cleared) {
        parts.push('projet \u2192 (aucun)');
      } else {
        parts.push(
          'projet \u2192 "' +
            ((extra && extra.projectName) ||
              args.name ||
              args.matchText ||
              (extra && extra.projectId) ||
              args.projectId ||
              '?') +
            '"'
        );
      }
    } else if (tool === 'set_subtask_estimate') {
      var estId = (extra && extra.id) || args.id;
      var beforeEstItem = findItem(beforeC && beforeC.items, estId);
      var afterEstItem = findItem(afterC && afterC.items, estId);
      if (beforeEstItem || afterEstItem) {
        parts.push('id: ' + (estId || '?'));
        var estLabel =
          (afterEstItem && afterEstItem.text) ||
          (beforeEstItem && beforeEstItem.text) ||
          '';
        if (estLabel) parts.push('"' + estLabel + '"');
        pushChange(
          parts,
          'estimatedMinutes',
          beforeEstItem && beforeEstItem.estimatedMinutes,
          afterEstItem && afterEstItem.estimatedMinutes
        );
      } else {
        parts.push('id: ' + (estId || '?'));
      }
    } else if (tool === 'set_progress_estimate') {
      pushChange(
        parts,
        'estimatedMinutes',
        beforeC && beforeC.estimatedMinutes,
        afterC && afterC.estimatedMinutes
      );
    } else if (
      tool === 'add_checklist_item' ||
      tool === 'remove_checklist_item' ||
      tool === 'rename_checklist_item' ||
      tool === 'set_checklist_progress'
    ) {
      if (extra && extra.parentId) parts.push('parent: ' + extra.parentId);
      if (extra && extra.id) parts.push('id: ' + extra.id);
      if (typeof args.text === 'string' && args.text.trim()) {
        parts.push('"' + args.text.trim() + '"');
      }
      if (args.progress != null) parts.push('progress \u2192 ' + args.progress);
    } else if (
      tool === 'history_undo' ||
      tool === 'history_redo' ||
      tool === 'history_revert'
    ) {
      if (extra && extra.label) parts.push(String(extra.label));
      else if (args && args.matchLabel) parts.push(String(args.matchLabel));
      else if (args && args.entryId) parts.push('entry: ' + args.entryId);
      else if (args && args.steps != null) parts.push('steps: ' + args.steps);
      else parts.push(tool === 'history_undo' ? 'annuler' : tool === 'history_redo' ? 'r\u00e9tablir' : 'restaurer');
    }
    if (parts.length) return parts.join('; ');
    return fallbackDetailFromArgs(tool, args, extra);
  }

  /**
   * Last-resort recap when a tool has no field-level diff: surface useful args
   * instead of the opaque "aucun diff détecté".
   */
  function fallbackDetailFromArgs(tool, args, extra) {
    args = args || {};
    extra = extra || {};
    var bits = [];
    function pushStr(label, value) {
      if (value == null) return;
      var s = String(value).trim();
      if (!s) return;
      if (s.length > 60) s = s.slice(0, 59) + '\u2026';
      bits.push(label ? label + ': ' + s : s);
    }
    if (typeof extra.name === 'string') pushStr(null, '"' + extra.name.trim() + '"');
    if (typeof extra.match === 'string') pushStr(null, '"' + extra.match.trim() + '"');
    if (Array.isArray(extra.ops) && extra.ops.length) {
      bits.push(extra.ops.join(', '));
    }
    if (extra.count != null) pushStr('count', extra.count);
    if (extra.memberId) pushStr('member', extra.memberId);
    if (extra.projectName) pushStr('projet', '"' + extra.projectName + '"');
    if (extra.cleared) bits.push('cleared');
    if (extra.listName) pushStr('list', extra.listName);
    if (extra.effect) pushStr('effect', extra.effect);
    [
      'name',
      'text',
      'matchText',
      'relation',
      'category',
      'effect',
      'formula',
      'personality'
    ].forEach(function (key) {
      if (typeof args[key] === 'string' && args[key].trim()) {
        pushStr(key, args[key].trim());
      }
    });
    if (args.clear === true) bits.push('clear');
    if (bits.length) return bits.join('; ');
    return 'OK';
  }

  /**
   * True when the assistant message claims a card change was applied
   * (used to warn if actions was empty).
   */
  function looksLikeAppliedClaim(message) {
    if (typeof message !== 'string' || !message.trim()) return false;
    return /\b(ajout(\u00e9e?|er)|renomm(\u00e9e?|er)|supprim(\u00e9e?|er)|r(\u00e9|e)initialis(\u00e9e?|er)|d(\u00e9|e)plac(\u00e9e?|er)|mise?\s+[aà]\s+jour|mis\s+[aà]\s+jour|enregistr(\u00e9e?|er)|d(\u00e9|e)fini[ee]?|bloqu(\u00e9e?|er)|d(\u00e9|e)bloqu(\u00e9e?|er)|appliqu(\u00e9e?|er)|modifi(\u00e9e?|er)|termin(\u00e9e?|er)|okay,?\s*bloqu|j['’]ai\s+not\u00e9|c['’]est\s+not\u00e9|not\u00e9\s+la\s+priorit|priorit\S*\s+not\u00e9e?)/i.test(
      message
    );
  }

  /**
   * Map bridge / REST reason codes to short French labels.
   */
  var BRIDGE_REASON_LABELS = {
    unavailable: 'Fonction Trello indisponible (REST ou OAuth).',
    'no-app-key': 'Cl\u00e9 d\'application Trello manquante.',
    'not-authorized': 'Autorisation Trello (OAuth) requise.',
    'no-token': 'Jeton Trello manquant.',
    'no-card-id': 'Identifiant de carte introuvable.',
    'no-member-id': 'Identifiant de membre manquant.',
    'people-unavailable': 'Annuaire People indisponible.',
    'no-setProject': 'setProject non branch\u00e9 sur ce pont.',
    'no-setCardName': 'setCardName non branch\u00e9 sur ce pont.',
    'no-setCardDesc': 'setCardDesc non branch\u00e9 sur ce pont.',
    'no-selectStatut': 'selectStatut non branch\u00e9 sur ce pont.',
    'empty-name': 'Nom vide.',
    'invalid-color': 'Couleur invalide.',
    'empty-personality': 'Personnalit\u00e9 vide.',
    'not-found': 'Introuvable.'
  };

  function translateBridgeReason(reason) {
    if (reason == null || reason === '') return '';
    var key = String(reason).trim();
    if (BRIDGE_REASON_LABELS[key]) return BRIDGE_REASON_LABELS[key];
    return key;
  }

  function summarizeMemberSpec(spec) {
    if (spec == null) return '(vide)';
    if (typeof spec === 'string') return JSON.stringify(spec);
    if (typeof spec !== 'object') return String(spec);
    var bits = [];
    if (spec.id != null) bits.push('id=' + spec.id);
    if (spec.matchText) bits.push('matchText=' + spec.matchText);
    if (spec.name) bits.push('name=' + spec.name);
    if (spec.username) bits.push('username=' + spec.username);
    if (spec.fullName) bits.push('fullName=' + spec.fullName);
    return bits.length ? bits.join(', ') : JSON.stringify(spec).slice(0, 120);
  }

  /**
   * Structured action failure for recap + user-facing error bubbles.
   * extras: { code?, hint?, cause?, args?, detail?, reason? }
   */
  function actionFailure(tool, error, extras) {
    extras = extras || {};
    var out = {
      ok: false,
      tool: tool,
      error: error || '\u00c9chec'
    };
    if (extras.code) out.code = String(extras.code);
    if (extras.hint) out.hint = String(extras.hint);
    if (extras.cause) out.cause = String(extras.cause);
    if (extras.detail) out.detail = extras.detail;
    if (extras.args) out.args = extras.args;
    if (extras.reason) out.reason = String(extras.reason);
    return out;
  }

  function bridgeMissingFailure(tool, error, methods) {
    var list = (Array.isArray(methods) ? methods : [methods]).filter(Boolean);
    return actionFailure(tool, error, {
      code: 'bridge-missing',
      cause: 'missing: ' + list.map(function (m) {
        return 'bridge.' + m;
      }).join(' / '),
      hint:
        'Ce pont agent n\'expose pas ' +
        list.join('/') +
        '. Ouvre la carte via le popup Power-Up (pas seulement l\'assistant projet).'
    });
  }

  function bridgeOpFailure(tool, fallbackError, res) {
    var reason =
      (res && (res.reason || res.error || res.message)) || '';
    var translated = translateBridgeReason(reason);
    var hint = '';
    if (
      reason === 'not-authorized' ||
      reason === 'no-token' ||
      reason === 'no-app-key'
    ) {
      hint = 'Autorise le Power-Up \u00e0 \u00e9crire sur Trello (OAuth).';
    } else if (reason === 'unavailable') {
      hint =
        'La m\u00e9thode Trello n\'est pas disponible dans ce contexte.';
    }
    return actionFailure(tool, translated || fallbackError, {
      code: reason || 'bridge-op-failed',
      reason: reason || undefined,
      cause: reason ? 'reason: ' + reason : undefined,
      hint: hint || undefined
    });
  }

  /**
   * Fill hint/code on plain `{ ok:false, error }` results when missing.
   */
  function enrichActionError(result) {
    if (!result || result.ok || result.skipped) return result;
    var err = result.error != null ? String(result.error) : '';
    if (BRIDGE_REASON_LABELS[err] && !result.hint) {
      result.cause = result.cause || err;
      result.code = result.code || err;
      result.error = BRIDGE_REASON_LABELS[err];
      result.hint =
        'V\u00e9rifie l\'autorisation Trello et la configuration du Power-Up.';
      return result;
    }
    if (/indisponible/i.test(err) && !result.hint) {
      result.code = result.code || 'unavailable';
      result.hint =
        'La capacit\u00e9 n\'est pas branch\u00e9e sur ce pont agent, ou une d\u00e9pendance Trello manque.';
    }
    if (/introuvable/i.test(err) && !result.hint) {
      result.code = result.code || 'not-found';
      result.hint =
        'Aucun \u00e9l\u00e9ment du contexte ne correspond aux args fournis.';
    }
    return result;
  }

  function formatFailureLines(tool, error, extras) {
    extras = extras || {};
    var lines = [];
    var head = '\u2717 ' + (tool || '?') + ': ' + (error || '\u00e9chec');
    if (extras.code) head += ' [' + extras.code + ']';
    lines.push(head);
    if (extras.cause) lines.push('  cause: ' + extras.cause);
    if (extras.hint) lines.push('  \u2192 ' + extras.hint);
    return lines;
  }

  /**
   * Reason text for a dropped (never executed) action — without the tool prefix.
   * Prefer explicit error; fall back to known reason codes (never silent).
   */
  function describeDroppedAction(d) {
    if (!d) return 'abandonn\u00e9e';
    if (d.error) {
      var err = String(d.error);
      if (d.tool && err.indexOf(d.tool + ':') === 0) {
        return err.slice(d.tool.length + 1).trim();
      }
      return err;
    }
    if (d.reason === 'project-scope' || d.code === 'project-scope') {
      return 'indisponible en mode projet';
    }
    if (d.reason === 'action-limit' || d.code === 'action-limit') {
      return 'limite de ' + MAX_TURN_ACTIONS + ' actions par tour';
    }
    if (d.reason === 'interview-disallowed' || d.code === 'interview-disallowed') {
      return 'non autoris\u00e9 pendant l\'interview';
    }
    if (d.reason) return String(d.reason);
    return 'args incomplets';
  }

  function droppedActionHint(d) {
    if (!d) return '';
    if (d.hint) return String(d.hint);
    if (d.reason === 'project-scope' || d.code === 'project-scope') {
      return 'Ouvre la carte dans le popup Power-Up pour appliquer cet outil. L\'assistant projet ne modifie pas les cartes.';
    }
    if (d.reason === 'action-limit' || d.code === 'action-limit') {
      return 'Renvoie les \u00e9l\u00e9ments restants dans un prochain message pour les appliquer.';
    }
    return '';
  }

  /**
   * Technical recap from executeActions results (executor is source of truth).
   * Failures include code / cause / hint when present (rich errors).
   */
  function formatChangeRecap(applied, options) {
    options = options || {};
    var lines = [];
    var results = (applied && applied.results) || [];
    results.forEach(function (r) {
      if (!r || r.skipped) return;
      var tool = r.tool || '?';
      if (r.ok) {
        lines.push('\u2713 ' + tool + (r.detail ? ': ' + r.detail : ''));
      } else {
        Array.prototype.push.apply(
          lines,
          formatFailureLines(tool, r.error, r)
        );
      }
    });
    (options.droppedActions || []).forEach(function (d) {
      if (!d) return;
      Array.prototype.push.apply(
        lines,
        formatFailureLines(d.tool, describeDroppedAction(d), {
          code: d.code || d.reason,
          cause: d.cause,
          hint: droppedActionHint(d)
        })
      );
    });
    if (!lines.length) {
      if (options.emptyClaim) {
        return 'Aucun outil ex\u00e9cut\u00e9 \u2014 rien n\'a \u00e9t\u00e9 modifi\u00e9 sur la carte.';
      }
      return '';
    }
    return lines.join('\n');
  }

  /**
   * User-facing summary of failed / dropped actions (visible chat error).
   */
  function formatActionErrors(applied, options) {
    options = options || {};
    var parts = [];
    var results = (applied && applied.results) || [];
    results.forEach(function (r) {
      if (!r || r.ok || r.skipped) return;
      var tool = r.tool || '?';
      var block = tool + '\u00a0: ' + (r.error || '\u00e9chec');
      if (r.hint) block += '\n' + r.hint;
      else if (r.cause) block += '\n(' + r.cause + ')';
      parts.push(block);
    });
    (options.droppedActions || []).forEach(function (d) {
      if (!d) return;
      var block = (d.tool || '?') + '\u00a0: ' + describeDroppedAction(d);
      var hint = droppedActionHint(d);
      if (hint) block += '\n' + hint;
      parts.push(block);
    });
    if (!parts.length) return '';
    var header =
      parts.length === 1
        ? 'Une action a \u00e9chou\u00e9\u00a0:'
        : parts.length + ' actions ont \u00e9chou\u00e9\u00a0:';
    return header + '\n\n' + parts.join('\n\n');
  }

  // exports
  S.BRIDGE_REASON_LABELS = BRIDGE_REASON_LABELS;
  S.actionFailure = actionFailure;
  S.bridgeMissingFailure = bridgeMissingFailure;
  S.bridgeOpFailure = bridgeOpFailure;
  S.cardDreamTurn = cardDreamTurn;
  S.cardSanityCheck = cardSanityCheck;
  S.describeDroppedAction = describeDroppedAction;
  S.detailForTool = detailForTool;
  S.draftCustomAssigneeFromSpec = draftCustomAssigneeFromSpec;
  S.droppedActionHint = droppedActionHint;
  S.enrichActionError = enrichActionError;
  S.fallbackDetailFromArgs = fallbackDetailFromArgs;
  S.findExistingSubtaskByText = findExistingSubtaskByText;
  S.findItem = findItem;
  S.fmtVal = fmtVal;
  S.formatActionErrors = formatActionErrors;
  S.formatChangeRecap = formatChangeRecap;
  S.formatFailureLines = formatFailureLines;
  S.looksLikeAppliedClaim = looksLikeAppliedClaim;
  S.matchBoardLabel = matchBoardLabel;
  S.matchBoardMember = matchBoardMember;
  S.matchCustomAssignee = matchCustomAssignee;
  S.normalizeMatchKey = normalizeMatchKey;
  S.normalizeSubtaskTitleKey = normalizeSubtaskTitleKey;
  S.pushChange = pushChange;
  S.resolveBlockedLinkArgs = resolveBlockedLinkArgs;
  S.resolveChecklistChild = resolveChecklistChild;
  S.resolveChecklistParent = resolveChecklistParent;
  S.resolveDueVagueArg = resolveDueVagueArg;
  S.resolveDueVagueToDateSafe = resolveDueVagueToDateSafe;
  S.resolveEstimateMinutesArg = resolveEstimateMinutesArg;
  S.resolveHeatSegment = resolveHeatSegment;
  S.resolveMemberRoleId = resolveMemberRoleId;
  S.resolveStatutListId = resolveStatutListId;
  S.resolveSubtaskItem = resolveSubtaskItem;
  S.snapshotCompletion = snapshotCompletion;
  S.snapshotPriority = snapshotPriority;
  S.summarizeMemberSpec = summarizeMemberSpec;
  S.translateBridgeReason = translateBridgeReason;
  S.validateDueDate = validateDueDate;
  S.validateDueTime = validateDueTime;
})(typeof window !== 'undefined' ? window : this);
