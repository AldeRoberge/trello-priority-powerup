/**
 * AI agent: suggestions
 *
 * Part of the agent (see agent.parts.json). Heuristic and LLM suggest helpers (subtasks, labels, goals, metrics) and memoryTurn.
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
 */

/**
 * agent-suggest: part 1 of 3 (8. Suggest / split / estimate helpers (LLM + heuristics)).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-suggest.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from other parts (functions, resolved at call time)
  function agentTaskTypeCatalog() { return S.agentTaskTypeCatalog.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgFetchMeta() { return S.dbgFetchMeta.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function extractUsageFromRaw() { return S.extractUsageFromRaw.apply(this, arguments); }
  function isConfigured() { return S.isConfigured.apply(this, arguments); }
  function normalizeAgentBlockedReason() { return S.normalizeAgentBlockedReason.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function normalizeSuggestionList() { return S.normalizeSuggestionList.apply(this, arguments); }
  function parseAssistantPayload() { return S.parseAssistantPayload.apply(this, arguments); }
  function profileLanguageInstruction() { return S.profileLanguageInstruction.apply(this, arguments); }
  function stripSpaceBeforePunctuation() { return S.stripSpaceBeforePunctuation.apply(this, arguments); }
  function userTurnWithClock() { return S.userTurnWithClock.apply(this, arguments); }

var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});
  function agentTaskTypeCatalog() { return S.agentTaskTypeCatalog.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgFetchMeta() { return S.dbgFetchMeta.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function extractUsageFromRaw() { return S.extractUsageFromRaw.apply(this, arguments); }
  function isConfigured() { return S.isConfigured.apply(this, arguments); }
  function normalizeAgentBlockedReason() { return S.normalizeAgentBlockedReason.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function normalizeSuggestionList() { return S.normalizeSuggestionList.apply(this, arguments); }
  function parseAssistantPayload() { return S.parseAssistantPayload.apply(this, arguments); }
  function profileLanguageInstruction() { return S.profileLanguageInstruction.apply(this, arguments); }
  function stripSpaceBeforePunctuation() { return S.stripSpaceBeforePunctuation.apply(this, arguments); }
  function userTurnWithClock() { return S.userTurnWithClock.apply(this, arguments); }

  /**
   * Normalize Progress-section suggestion rows (text invent + linked board cards).
   * Accepts legacy string arrays or mixed objects from the model.
   * @returns {Array<{type:'text'|'link', text:string, cardId?:string, list?:string}>}
   */
  // ── 8. Suggest / split / estimate helpers (LLM + heuristics) ─────────────
  // Used by Progrès UI and agent tools; prefer heuristics when API is down.

  function normalizeProgressSuggestions(raw, boardCards, options) {
    options = options || {};
    var max =
      typeof options.maxItems === 'number' && options.maxItems > 0
        ? Math.floor(options.maxItems)
        : 3;
    var cards = Array.isArray(boardCards) ? boardCards : [];
    var existingKeys = options.existingKeys || {};
    var usedLinked = options.usedLinkedIds || {};
    var out = [];
    var seenText = Object.create(null);
    var seenCard = Object.create(null);

    function clampSuggestionMinutes(raw) {
      if (
        typeof CompletionTrello !== 'undefined' &&
        typeof CompletionTrello.clampEstimatedMinutes === 'function'
      ) {
        return CompletionTrello.clampEstimatedMinutes(raw);
      }
      if (
        typeof PriorityUI !== 'undefined' &&
        typeof PriorityUI.clampDurationMinutes === 'function'
      ) {
        return PriorityUI.clampDurationMinutes(raw);
      }
      var n = Number(raw);
      return isFinite(n) && n > 0 ? Math.round(n) : null;
    }

    function pushText(label, estimatedMinutes) {
      var text = String(label || '')
        .trim()
        .replace(/^["«]|["»]$/g, '')
        .trim();
      if (!text || text.length > 120) return;
      var key = text.toLocaleLowerCase('fr-FR');
      if (existingKeys[key] || seenText[key]) return;
      seenText[key] = true;
      var row = { type: 'text', text: text };
      var mins = clampSuggestionMinutes(estimatedMinutes);
      if (mins != null) row.estimatedMinutes = mins;
      out.push(row);
    }

    function pushLink(card) {
      if (!card || !card.id) return;
      var cardId = String(card.id).trim();
      if (!cardId || usedLinked[cardId] || seenCard[cardId]) return;
      var text =
        typeof card.name === 'string' && card.name.trim()
          ? card.name.trim()
          : 'Carte li\u00e9e';
      seenCard[cardId] = true;
      seenText[text.toLocaleLowerCase('fr-FR')] = true;
      out.push({
        type: 'link',
        text: text.slice(0, 120),
        cardId: cardId,
        list: typeof card.list === 'string' ? card.list : ''
      });
    }

    function resolveCardRef(item) {
      if (!item || typeof item !== 'object') return null;
      if (item.cardId != null || item.linkedCardId != null || item.id != null) {
        var want = String(item.cardId || item.linkedCardId || item.id).trim();
        if (!want) return null;
        for (var ci = 0; ci < cards.length; ci++) {
          if (cards[ci] && String(cards[ci].id) === want) return cards[ci];
        }
        return null;
      }
      var idx =
        item.cardIndex != null
          ? Number(item.cardIndex)
          : item.index != null
            ? Number(item.index)
            : item.ref != null
              ? Number(item.ref)
              : NaN;
      if (!isFinite(idx) || idx < 0 || idx >= cards.length) return null;
      return cards[idx] || null;
    }

    function isLinkItem(item) {
      if (!item || typeof item !== 'object') return false;
      var kind = String(item.type || item.kind || item.mode || '')
        .trim()
        .toLowerCase();
      if (kind === 'link' || kind === 'linked' || kind === 'card' || kind === 'existing') {
        return true;
      }
      return (
        item.cardIndex != null ||
        item.linkedCardId != null ||
        (item.cardId != null && kind !== 'text' && kind !== 'new')
      );
    }

    (Array.isArray(raw) ? raw : []).forEach(function (item) {
      if (out.length >= max) return;
      if (typeof item === 'string') {
        pushText(item);
        return;
      }
      if (!item || typeof item !== 'object') return;
      var estMins =
        item.estimatedMinutes != null
          ? item.estimatedMinutes
          : item.minutes != null
            ? item.minutes
            : item.durationMinutes;
      if (isLinkItem(item)) {
        pushLink(resolveCardRef(item));
        return;
      }
      var label =
        typeof item.text === 'string'
          ? item.text
          : typeof item.label === 'string'
            ? item.label
            : typeof item.suggestion === 'string'
              ? item.suggestion
              : '';
      pushText(label, estMins);
    });

    return out.slice(0, max);
  }

  /**
   * Suggest ~3 follow-up subtasks for the Progress section.
   * When boardCards are provided, may also suggest linking related board cards.
   * @returns {Promise<Array<{type:'text'|'link', text:string, cardId?:string, list?:string}|string>>}
   */
  async function suggestSubtasks(provider, context, options) {
    options = options || {};
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var ctx = context && typeof context === 'object' ? context : {};
    var existingRaw = Array.isArray(ctx.existingSubtasks)
      ? ctx.existingSubtasks
      : Array.isArray(ctx.items)
        ? ctx.items
        : [];
    var existing = [];
    var usedLinkedIds = Object.create(null);
    var currentCardId =
      ctx.currentCardId != null ? String(ctx.currentCardId).trim() : '';
    if (currentCardId) usedLinkedIds[currentCardId] = true;
    (Array.isArray(ctx.existingLinkedIds) ? ctx.existingLinkedIds : []).forEach(
      function (id) {
        var lid = String(id || '').trim();
        if (lid) usedLinkedIds[lid] = true;
      }
    );
    existingRaw.forEach(function (it) {
      if (typeof it === 'string') {
        var s = it.trim();
        if (s) existing.push(s);
        return;
      }
      if (!it || typeof it !== 'object') return;
      if (typeof it.text === 'string' && it.text.trim()) existing.push(it.text.trim());
      var linked =
        it.linkedCardId != null
          ? String(it.linkedCardId).trim()
          : it.cardId != null
            ? String(it.cardId).trim()
            : '';
      if (linked) usedLinkedIds[linked] = true;
    });

    var boardCards = Array.isArray(ctx.boardCards)
      ? ctx.boardCards
          .filter(function (card) {
            if (!card || !card.id) return false;
            var id = String(card.id).trim();
            if (!id || usedLinkedIds[id]) return false;
            return true;
          })
          .slice(0, 40)
          .map(function (card) {
            return {
              id: String(card.id).trim(),
              name: String(card.name || '').trim().slice(0, 120),
              list: String(card.list || '').trim().slice(0, 80),
              desc: String(card.desc || '')
                .trim()
                .replace(/\s+/g, ' ')
                .slice(0, 100)
            };
          })
      : [];

    var boardCardRefs = boardCards.map(function (card, index) {
      var row = { index: index, name: card.name, list: card.list };
      if (card.desc) row.desc = card.desc;
      return row;
    });

    var payload = {
      cardName: ctx.cardName || '',
      cardDesc: ctx.cardDesc || '',
      priorityLabel: ctx.priorityLabel || '',
      existingSubtasks: existing,
      memory: ctx.memory || null,
      boardDigest: typeof ctx.boardDigest === 'string' ? ctx.boardDigest.slice(0, 3000) : ''
    };
    if (boardCardRefs.length) {
      payload.boardCards = boardCardRefs;
    }

    var title = String(payload.cardName || '').trim();
    var allowLinks = boardCardRefs.length > 0;
    var langInstr = profileLanguageInstruction(ctx.profile || null);
    var systemLines = [
      'Tu proposes des sous-t\u00e2ches de suivi pour une carte Trello (section Progr\u00e8s).',
      langInstr,
      allowLinks
        ? 'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":[{"type":"text","text":"\u2026","estimatedMinutes":30},{"type":"link","cardIndex":0},{"type":"text","text":"\u2026","estimatedMinutes":15}]}'
        : 'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":[{"text":"\u2026","estimatedMinutes":30},{"text":"\u2026","estimatedMinutes":60},{"text":"\u2026","estimatedMinutes":15}]}',
      'Exactement 3 suggestions si possible (2 minimum si le contexte est pauvre).',
      'Chaque suggestion texte = une action concr\u00e8te courte dans la langue/dialecte ci-dessus (pas une question).',
      'Chaque suggestion DOIT inclure estimatedMinutes (nombre entier > 0) = effort r\u00e9aliste pour cette \u00e9tape seule (pas le total de la carte). Les minutes alimentent l\u2019affichage Temps (quelques minutes \u2192 plus d\u2019un mois).',
      'Inf\u00e9rence titre (critique \u2014 c\'est le job)\u00a0:',
      '- Le TITRE de la carte est la source principale. Lis-le et d\u00e9compose-le en \u00e9tapes concr\u00e8tes.',
      '- Inf\u00e8re ce qu\'il faut vraiment faire pour accomplir CE titre (savoir pratique + contexte carte).',
      '- Chaque suggestion doit \u00eatre sp\u00e9cifique \u00e0 CE titre\u00a0: on doit pouvoir dire \u00e0 quel projet elle appartient sans le lire \u00e0 c\u00f4t\u00e9.',
      '- Description / priorit\u00e9 / m\u00e9moire / digest\u00a0: indices secondaires seulement.',
      title
        ? '- Titre actuel\u00a0: \u00ab\u00a0' + title.slice(0, 200) + '\u00a0\u00bb.'
        : '- Titre manquant\u00a0: propose 2\u20133 \u00e9tapes g\u00e9n\u00e9riques minimales (pas de blabla).',
      'Exemple\u00a0: titre \u00ab\u00a0Plan strat\u00e9gie de communication\u00a0\u00bb \u2192 \u00ab\u00a0Rencontrer tous les services\u00a0\u00bb, \u00ab\u00a0Lister les canaux prioritaires\u00a0\u00bb, \u00ab\u00a0R\u00e9diger le message cl\u00e9\u00a0\u00bb.',
      'Exemple\u00a0: \u00ab\u00a0Archivage des rushs vid\u00e9os et projets DaVinci Resolve\u00a0\u00bb \u2192 stockage long terme + guide de proc\u00e9dure + inventaire des projets.',
      'Exemple\u00a0: \u00ab\u00a0Accrocher les dipl\u00f4mes dans le bureau\u00a0\u00bb \u2192 \u00ab\u00a0Mesurer l\'emplacement au mur\u00a0\u00bb, \u00ab\u00a0Acheter crochets / clous\u00a0\u00bb, \u00ab\u00a0Fixer et aligner les cadres\u00a0\u00bb.',
      'INTERDIT\u00a0: suggestions g\u00e9n\u00e9riques / m\u00e9ta (\u00ab\u00a0Faire un plan\u00a0\u00bb, \u00ab\u00a0D\u00e9finir les objectifs\u00a0\u00bb, \u00ab\u00a0Commencer la t\u00e2che\u00a0\u00bb, \u00ab\u00a0Avancer sur le projet\u00a0\u00bb, \u00ab\u00a0V\u00e9rifier le statut\u00a0\u00bb).',
      'INTERDIT\u00a0: dupliquer une sous-t\u00e2che existante (m\u00eame sens).',
      'INTERDIT\u00a0: placeholders, num\u00e9rotation, guillemets superflus.'
    ];
    if (allowLinks) {
      systemLines.push(
        'Cartes liables (boardCards)\u00a0:',
        '- type "link" = sous-t\u00e2che li\u00e9e \u00e0 une carte EXISTANTE (cardIndex = index dans boardCards).',
        '- Propose 1\u20132 liens SI une carte du tableau est clairement une \u00e9tape, d\u00e9pendance, sous-livrable ou jumeau th\u00e9matique de CE titre.',
        '- Sinon, propose uniquement des type "text" (n\'invente pas de liens faibles).',
        '- INTERDIT\u00a0: cardIndex hors plage\u00a0; lier une carte sans rapport\u00a0; lier une carte d\u00e9j\u00e0 dans existingSubtasks.',
        '- M\u00e9lange typique quand des liens existent\u00a0: 1 link + 2 text, ou 2 link + 1 text.'
      );
    }
    systemLines.push('Contexte\u00a0:', JSON.stringify(payload));

    var messages = [
      {
        role: 'system',
        content: systemLines.join('\n')
      },
      {
        role: 'user',
        content: title
          ? allowLinks
            ? 'Propose 3 sous-t\u00e2ches pour accomplir\u00a0: \u00ab\u00a0' +
              title.slice(0, 200) +
              '\u00a0\u00bb. Relie des cartes boardCards pertinentes si elles existent, sinon invente des actions texte.'
            : 'Propose 3 sous-t\u00e2ches concr\u00e8tes pour accomplir\u00a0: \u00ab\u00a0' +
              title.slice(0, 200) +
              '\u00a0\u00bb. Inf\u00e8re les \u00e9tapes depuis le titre.'
          : allowLinks
            ? 'Propose 3 sous-t\u00e2ches de suivi (texte et/ou liens boardCards pertinents).'
            : 'Propose 3 sous-t\u00e2ches de suivi pertinentes.'
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: allowLinks ? 360 : 280,
        temperature: 0.55,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        response = await chatCompletions(p, messages, {
          jsonMode: false,
          max_tokens: allowLinks ? 360 : 280,
          temperature: 0.55,
          stream: false
        });
      } else {
        console.error('PriorityAgent.suggestSubtasks failed', err);
        return [];
      }
    }

    var rawList = [];
    try {
      var parsed = parseAssistantPayload(response.content);
      rawList = parsed.suggestions || parsed.subtasks || [];
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        rawList = raw.suggestions || raw.subtasks || [];
      } catch (e2) {
        rawList = [];
      }
    }

    var existingKeys = {};
    for (var i = 0; i < existing.length; i++) {
      existingKeys[existing[i].toLocaleLowerCase('fr-FR')] = true;
    }

    var normalized = normalizeProgressSuggestions(rawList, boardCards, {
      maxItems: 3,
      existingKeys: existingKeys,
      usedLinkedIds: usedLinkedIds
    });

    // Prefer structured rows (with optional estimatedMinutes) for the Progrès UI.
    return normalized;
  }

  /**
   * Cheap gate: skip the split model call for short, single-clause titles.
   * False negatives are fine — spellcheck still runs; false positives only cost a call.
   * @param {string} title
   * @returns {boolean}
   */
  function titleMayBeCompound(title) {
    var t = String(title || '').trim();
    if (!t) return false;
    if (t.length >= 90) return true;
    if (/[;/]/.test(t)) return true;
    if (/\w\/\w/.test(t)) return true;
    if (
      /\b(also|aussi|and also|et aussi|en plus|de plus|puis|ensuite|as well|par ailleurs)\b/i.test(
        t
      )
    ) {
      return true;
    }
    if ((t.match(/\.\s+/g) || []).length >= 1 && t.length >= 50) return true;
    if (/,.*\b(and|et|also|aussi)\b/i.test(t) && t.length >= 40) return true;
    return false;
  }

  /**
   * Normalize a splitTaskTitle model payload into { shouldSplit, tasks }.
   * @param {*} raw
   * @param {string} original
   * @returns {{ shouldSplit: boolean, tasks: string[] }}
   */
  function normalizeSplitTaskResult(raw, original) {
    var fallback = {
      shouldSplit: false,
      tasks: [String(original || '').trim()].filter(Boolean)
    };
    if (!raw || typeof raw !== 'object') return fallback;
    var list = Array.isArray(raw.tasks)
      ? raw.tasks
      : Array.isArray(raw.titles)
        ? raw.titles
        : Array.isArray(raw.items)
          ? raw.items
          : [];
    var tasks = [];
    var seen = Object.create(null);
    list.forEach(function (row) {
      var text =
        typeof row === 'string'
          ? row.trim()
          : row && typeof row === 'object' && typeof row.text === 'string'
            ? row.text.trim()
            : row && typeof row === 'object' && typeof row.title === 'string'
              ? row.title.trim()
              : '';
      if (!text || text.length > 240) return;
      var key = text.toLocaleLowerCase('fr-FR');
      if (seen[key]) return;
      seen[key] = true;
      tasks.push(text);
    });
    if (tasks.length < 2) return fallback;
    // Cap runaway splits — a typed title rarely needs more than 8 discrete tasks.
    if (tasks.length > 8) tasks = tasks.slice(0, 8);
    var shouldSplit = raw.shouldSplit !== false && raw.split !== false;
    if (!shouldSplit) return fallback;
    return { shouldSplit: true, tasks: tasks };
  }

  /**
   * Ask the model whether a typed title is several independent tasks, and
   * return polished titles when it should be split ("also", clauses, etc.).
   * Slash variants (portrait/landscape) in one phrase stay a single task.
   * @param {*} provider
   * @param {string} title
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<{ shouldSplit: boolean, tasks: string[] }>}
   */
  async function splitTaskTitle(provider, title, options) {
    options = options || {};
    var original = typeof title === 'string' ? title.trim() : '';
    var empty = { shouldSplit: false, tasks: original ? [original] : [] };
    if (!original) return empty;
    if (!options.force && !titleMayBeCompound(original)) return empty;

    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return empty;

    var messages = [
      {
        role: 'system',
        content: [
          'Tu analyses un titre de t\u00e2che / sous-t\u00e2che saisi par l\u2019utilisateur.',
          'D\u00e9cide s\u2019il d\u00e9crit PLUSIEURS travaux ind\u00e9pendants, puis d\u00e9coupe en titres courts.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"shouldSplit":true|false,"tasks":["\u2026","\u2026"]}',
          '',
          'Principe\u00a0: le MINIMUM de t\u00e2ches. Ne d\u00e9coupe que sur de vrais travaux s\u00e9par\u00e9ment compl\u00e9tables.',
          '',
          'D\u00e9coupe (shouldSplit=true) quand\u00a0:',
          '- Plusieurs actions reli\u00e9es par also / aussi / ; / et aussi / puis / en plus / as well.',
          '- Plusieurs phrases ou clauses = travaux distincts (chacun compl\u00e9table seul).',
          '',
          'Ne d\u00e9coupe PAS (shouldSplit=false, tasks=[titre unique poli si besoin]) quand\u00a0:',
          '- Slash portrait/landscape, A/B, ou/ou\u00a0: variantes ou formats d\u2019UNE m\u00eame action',
          '  (\u00ab\u00a0test vid\u00e9o portrait/landscape\u00a0\u00bb = UNE t\u00e2che, pas deux).',
          '- Une seule action avec qualificatifs (format, r\u00e9solution, outil, lieu, mode).',
          '- Une liste d\u2019objets pour LA M\u00caME action (\u00ab\u00a0Acheter lait, pain et beurre\u00a0\u00bb).',
          '- Tu n\u2019es pas s\u00fbr\u00a0: shouldSplit=false.',
          '',
          'Chaque entr\u00e9e de tasks\u00a0:',
          '- Une action concr\u00e8te, courte, autonome (1 ligne).',
          '- Reste concis\u00a0: corrige typos / noms propres (\u00ab\u00a0opengate\u00a0\u00bb \u2192 \u00ab\u00a0OpenGate\u00a0\u00bb,',
          '  \u00ab\u00a0Apple Pro Res\u00a0\u00bb \u2192 \u00ab\u00a0Apple ProRes\u00a0\u00bb) sans r\u00e9\u00e9crire ni rallonger.',
          '- Garde la langue du texte d\u2019origine (FR ou EN).',
          '- INTERDIT\u00a0: inventer du travail absent du texte\u00a0; dupliquer la m\u00eame action',
          '  sous plusieurs formulations\u00a0; num\u00e9rotation\u00a0; guillemets superflus.',
          '',
          'Exemple\u00a0:',
          'Entr\u00e9e\u00a0: \u00ab\u00a0Do single portrait/landscape video test with opengate, 4K, Apple Pro Res HQ. Also, we should export the video I\'ve been working on as a test to see the changes; also, we should see what benefits it a pour shooter in portrait mode.\u00a0\u00bb',
          'Sortie\u00a0: {"shouldSplit":true,"tasks":["Do single portrait/landscape video test with OpenGate, 4K, Apple ProRes HQ","Export the video as a test to review the changes","Evaluate portrait-mode benefits for the shooter"]}'
        ].join('\n')
      },
      {
        role: 'user',
        content: original.slice(0, 1200)
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 500,
        temperature: 0.2,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        try {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 500,
            temperature: 0.2,
            stream: false
          });
        } catch (err2) {
          console.error('PriorityAgent.splitTaskTitle failed', err2);
          return empty;
        }
      } else {
        console.error('PriorityAgent.splitTaskTitle failed', err);
        return empty;
      }
    }

    var raw = null;
    try {
      var content =
        response && typeof response.content === 'string' ? response.content : '';
      var fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
      var jsonText = fence ? fence[1].trim() : content.trim();
      var start = jsonText.indexOf('{');
      var end = jsonText.lastIndexOf('}');
      if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1);
      raw = JSON.parse(jsonText);
    } catch (e) {
      try {
        raw = parseAssistantPayload(response && response.content);
      } catch (e2) {
        raw = null;
      }
    }
    return normalizeSplitTaskResult(raw, original);
  }

  /**
   * Normalize a splitBlockedReason model payload into { shouldSplit, reasons }.
   * @param {*} raw
   * @param {string} original
   * @returns {{ shouldSplit: boolean, reasons: string[] }}
   */
  function normalizeSplitBlockedReasonResult(raw, original) {
    var fallback = {
      shouldSplit: false,
      reasons: [String(original || '').trim()].filter(Boolean)
    };
    if (!raw || typeof raw !== 'object') return fallback;
    var list = Array.isArray(raw.reasons)
      ? raw.reasons
      : Array.isArray(raw.tasks)
        ? raw.tasks
        : Array.isArray(raw.titles)
          ? raw.titles
          : Array.isArray(raw.items)
            ? raw.items
            : [];
    var reasons = [];
    var seen = Object.create(null);
    list.forEach(function (row) {
      var text =
        typeof row === 'string'
          ? row.trim()
          : row && typeof row === 'object' && typeof row.text === 'string'
            ? row.text.trim()
            : row && typeof row === 'object' && typeof row.reason === 'string'
              ? row.reason.trim()
              : row && typeof row === 'object' && typeof row.title === 'string'
                ? row.title.trim()
                : '';
      if (!text || text.length > 240) return;
      var key = text.toLocaleLowerCase('fr-FR');
      if (seen[key]) return;
      seen[key] = true;
      reasons.push(text);
    });
    if (reasons.length < 2) return fallback;
    if (reasons.length > 8) reasons = reasons.slice(0, 8);
    var shouldSplit = raw.shouldSplit !== false && raw.split !== false;
    if (!shouldSplit) return fallback;
    return { shouldSplit: true, reasons: reasons };
  }

  /**
   * Ask the model whether a typed Motif / blocking cause is several independent
   * reasons, and return polished Motifs when it should be split.
   * @param {*} provider
   * @param {string} reason
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<{ shouldSplit: boolean, reasons: string[] }>}
   */
  async function splitBlockedReason(provider, reason, options) {
    options = options || {};
    var original = typeof reason === 'string' ? reason.trim() : '';
    var empty = { shouldSplit: false, reasons: original ? [original] : [] };
    if (!original) return empty;
    if (!options.force && !titleMayBeCompound(original)) return empty;

    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return empty;

    var messages = [
      {
        role: 'system',
        content: [
          'Tu analyses une cause de blocage (Motif) saisie par l\u2019utilisateur.',
          'D\u00e9cide si elle d\u00e9crit PLUSIEURS causes ind\u00e9pendantes, puis d\u00e9coupe et reformule chaque Motif.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"shouldSplit":true|false,"reasons":["\u2026","\u2026"]}',
          '',
          'D\u00e9coupe (shouldSplit=true) quand\u00a0:',
          '- Plusieurs causes reli\u00e9es par also / aussi / ; / et aussi / puis / en plus / as well.',
          '- Plusieurs phrases ou clauses = obstacles s\u00e9par\u00e9ment r\u00e9solvables.',
          '- Deux attentes distinctes (ex. approbation client ET mat\u00e9riel manquant).',
          '',
          'Ne d\u00e9coupe PAS (shouldSplit=false, reasons=[Motif unique poli si besoin]) quand\u00a0:',
          '- Une seule cause avec des qualificatifs (qui, quoi, format, lieu).',
          '- Une liste d\u2019objets pour LA M\u00caME attente (\u00ab\u00a0En attente du lait, du pain et du beurre\u00a0\u00bb).',
          '- Slash / alternatives qui pr\u00e9cisent UN seul blocage (portrait/landscape dans la m\u00eame demande).',
          '- Tu n\u2019es pas s\u00fbr\u00a0: shouldSplit=false.',
          '',
          'Chaque entr\u00e9e de reasons\u00a0:',
          '- UNE cause courte, autonome (1 ligne), pr\u00e9f\u00e9rer \u00ab\u00a0En attente de \u2026\u00a0\u00bb / \u00ab\u00a0En attente d\'\u2026\u00a0\u00bb / \u00ab\u00a0En attente d\'avoir \u2026\u00a0\u00bb',
          '  ou \u00ab\u00a0Bloqu\u00e9 \u00e0 cause de \u2026\u00a0\u00bb pour un obstacle mat\u00e9riel / permission.',
          '- N\u00e9gations (pas de/d\', sans)\u00a0: \u00ab\u00a0En attente d\'avoir \u2026\u00a0\u00bb \u2014 INTERDIT \u00ab\u00a0En attente de pas d\'\u2026\u00a0\u00bb.',
          '- Corrige fautes \u00e9videntes / typos.',
          '- Garde la langue du texte d\u2019origine (FR ou EN).',
          '- INTERDIT\u00a0: inventer des causes absentes\u00a0; num\u00e9rotation\u00a0; guillemets superflus\u00a0; actions \u00e0 faire (\u00ab\u00a0Obtenir\u2026\u00a0\u00bb).',
          '',
          'Exemple\u00a0:',
          'Entr\u00e9e\u00a0: \u00ab\u00a0En attente de l\'approbation du client; aussi, le tr\u00e9pied n\'est pas arriv\u00e9. Also waiting on staging access.\u00a0\u00bb',
          'Sortie\u00a0: {"shouldSplit":true,"reasons":["En attente de l\'approbation du client","En attente du tr\u00e9pied","En attente de l\'acc\u00e8s staging"]}'
        ].join('\n')
      },
      {
        role: 'user',
        content: original.slice(0, 1200)
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 500,
        temperature: 0.2,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        try {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 500,
            temperature: 0.2,
            stream: false
          });
        } catch (err2) {
          console.error('PriorityAgent.splitBlockedReason failed', err2);
          return empty;
        }
      } else {
        console.error('PriorityAgent.splitBlockedReason failed', err);
        return empty;
      }
    }

    var raw = null;
    try {
      var content =
        response && typeof response.content === 'string' ? response.content : '';
      var fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
      var jsonText = fence ? fence[1].trim() : content.trim();
      var start = jsonText.indexOf('{');
      var end = jsonText.lastIndexOf('}');
      if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1);
      raw = JSON.parse(jsonText);
    } catch (e) {
      try {
        raw = parseAssistantPayload(response && response.content);
      } catch (e2) {
        raw = null;
      }
    }
    return normalizeSplitBlockedReasonResult(raw, original);
  }

  /**
   * Silently estimate missing subtask durations (unlocked items without times).
   * context: { cardName, cardDesc?, items: [{id,text}] }
   * @returns {Promise<Array<{id?:string, matchText?:string, estimatedMinutes:number}>>}
   */
  async function estimateSubtaskDurations(provider, context, options) {
    options = options || {};
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var ctx = context && typeof context === 'object' ? context : {};
    var itemsRaw = Array.isArray(ctx.items)
      ? ctx.items
      : Array.isArray(ctx.existingSubtasks)
        ? ctx.existingSubtasks
        : [];
    var items = [];
    itemsRaw.forEach(function (it) {
      if (!it) return;
      if (typeof it === 'string') {
        var s = it.trim();
        if (s) items.push({ text: s });
        return;
      }
      if (typeof it !== 'object') return;
      var text = typeof it.text === 'string' ? it.text.trim() : '';
      if (!text) return;
      var row = { text: text };
      if (typeof it.id === 'string' && it.id) row.id = it.id;
      items.push(row);
    });
    if (!items.length) return [];

    var payload = {
      cardName: ctx.cardName || '',
      cardDesc: typeof ctx.cardDesc === 'string' ? ctx.cardDesc.slice(0, 400) : '',
      items: items
    };

    var messages = [
      {
        role: 'system',
        content: [
          'Tu estimes la dur\u00e9e (effort) de sous-t\u00e2ches Trello (section Progr\u00e8s).',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"estimates":[{"id":"\u2026","estimatedMinutes":30},{"matchText":"\u2026","estimatedMinutes":15}]}',
          'Une entr\u00e9e par item fourni. Pr\u00e9f\u00e8re id quand fourni, sinon matchText = texte exact.',
          'estimatedMinutes = entier > 0 = effort r\u00e9aliste pour CETTE \u00e9tape seule (minutes).',
          'Les minutes alimentent l\u2019affichage Temps (quelques minutes \u2192 plus d\u2019un mois)\u00a0: choisis une dur\u00e9e r\u00e9aliste.',
          'Rep\u00e8res tailles\u00a0: XS\u224815 min, S\u22481 h, M\u22484 h, L\u22482 j, XL\u22485 j.',
          'Ex. achat logiciel ~5, r\u00e9union ~60, r\u00e9daction courte ~90, audit/migration ~480+.',
          'INTERDIT\u00a0: inventer des sous-t\u00e2ches; omettre un item; dur\u00e9es absurdes.',
          'Contexte\u00a0:',
          JSON.stringify(payload)
        ].join('\n')
      },
      {
        role: 'user',
        content:
          'Estime la dur\u00e9e (minutes) de chaque sous-t\u00e2che list\u00e9e, en pensant aussi \u00e0 la taille XS\u2013XL correspondante.'
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 320,
        temperature: 0.35,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        try {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 320,
            temperature: 0.35,
            stream: false
          });
        } catch (err2) {
          console.error('PriorityAgent.estimateSubtaskDurations failed', err2);
          return [];
        }
      } else {
        console.error('PriorityAgent.estimateSubtaskDurations failed', err);
        return [];
      }
    }

    var list = [];
    try {
      var parsed = parseAssistantPayload(response.content);
      list = parsed.estimates || parsed.durations || parsed.items || [];
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        list = raw.estimates || raw.durations || raw.items || [];
      } catch (e2) {
        list = [];
      }
    }
    if (!Array.isArray(list)) return [];

    var clamp =
      typeof CompletionTrello !== 'undefined' &&
      typeof CompletionTrello.clampEstimatedMinutes === 'function'
        ? CompletionTrello.clampEstimatedMinutes
        : function (m) {
            var n = Number(m);
            return isFinite(n) && n > 0 ? Math.round(n) : null;
          };

    function minutesFromRow(row) {
      if (!row || typeof row !== 'object') return null;
      return clamp(
        row.estimatedMinutes != null
          ? row.estimatedMinutes
          : row.minutes != null
            ? row.minutes
            : row.durationMinutes
      );
    }

    // Index AI rows by id / matchText for robust lookups.
    var byId = Object.create(null);
    var byText = Object.create(null);
    list.forEach(function (row) {
      var mins = minutesFromRow(row);
      if (mins == null) return;
      if (typeof row.id === 'string' && row.id.trim()) {
        byId[row.id.trim()] = mins;
      }
      var match =
        typeof row.matchText === 'string'
          ? row.matchText.trim().toLowerCase()
          : typeof row.text === 'string'
            ? row.text.trim().toLowerCase()
            : '';
      if (match) byText[match] = mins;
    });

    // Always emit one estimate per requested item — attach our known ids so
    // applyItemEstimates cannot miss due to hallucinated ids / wording drift.
    var out = [];
    items.forEach(function (item, index) {
      var mins = null;
      if (item.id && byId[item.id] != null) mins = byId[item.id];
      if (mins == null) {
        mins = byText[String(item.text || '').trim().toLowerCase()];
      }
      // Positional fallback when the model omits / muddles ids.
      if (mins == null && list[index]) mins = minutesFromRow(list[index]);
      if (mins == null) return;
      var est = { estimatedMinutes: mins, matchText: item.text };
      if (item.id) est.id = item.id;
      out.push(est);
    });
    return out;
  }

  function lowerFrFirst(text) {
    var s = String(text || '');
    if (!s) return '';
    return s.charAt(0).toLocaleLowerCase('fr-FR') + s.slice(1);
  }

  /**
   * Rewrite lack / negation fragments into natural "En attente d'avoir …" causes.
   * "pas d'internet" → "En attente d'avoir internet"
   * "pas d'internet pour publier" → "En attente d'avoir internet pour publier"
   * Returns null when the fragment is not a lack pattern.
   */
  function rewriteLackAsWaitingCause(fragment) {
    var body = String(fragment || '')
      .trim()
      .replace(/\.+$/, '');
    if (!body) return null;

    var pourMatch = body.match(/^(.*?)(\s+pour\s+.+)$/i);
    var core = pourMatch ? String(pourMatch[1] || '').trim() : body;
    var pourSuffix = pourMatch ? String(pourMatch[2] || '') : '';
    if (!core) return null;

    var thing = '';
    var m;
    if (
      (m = core.match(/^pas\s+d['\u2019]\s*(.+)$/i)) ||
      (m = core.match(/^pas\s+de\s+(.+)$/i)) ||
      (m = core.match(/^sans\s+(.+)$/i)) ||
      (m = core.match(/^manque\s+d['\u2019]\s*(.+)$/i)) ||
      (m = core.match(
        /^il\s+n['\u2019]y\s+a\s+pas\s+(?:de\s+|d['\u2019]\s*)(.+)$/i
      ))
    ) {
      thing = String(m[1] || '').trim();
      if (!thing) return null;
      return ('En attente d\'avoir ' + lowerFrFirst(thing) + pourSuffix).slice(
        0,
        500
      );
    }
    if ((m = core.match(/^manque\s+de\s+(.+)$/i))) {
      thing = String(m[1] || '').trim();
      if (!thing) return null;
      return ('En attente de ' + lowerFrFirst(thing) + pourSuffix).slice(0, 500);
    }
    return null;
  }

  // exports
  S.estimateSubtaskDurations = estimateSubtaskDurations;
  S.lowerFrFirst = lowerFrFirst;
  S.normalizeProgressSuggestions = normalizeProgressSuggestions;
  S.normalizeSplitBlockedReasonResult = normalizeSplitBlockedReasonResult;
  S.normalizeSplitTaskResult = normalizeSplitTaskResult;
  S.rewriteLackAsWaitingCause = rewriteLackAsWaitingCause;
  S.splitBlockedReason = splitBlockedReason;
  S.splitTaskTitle = splitTaskTitle;
  S.suggestSubtasks = suggestSubtasks;
  S.titleMayBeCompound = titleMayBeCompound;
})(typeof window !== 'undefined' ? window : this);
