/**
 * AI agent: suggestions
 *
 * Part of the agent (see agent.parts.json). Heuristic and LLM suggest helpers (subtasks, labels, goals, metrics) and memoryTurn.
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
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

  /**
   * Deterministic fallback: turn a free-typed motif / action into a cause phrase.
   * "Manger un hot-dog" → "En attente de manger un hot-dog"
   * "Pas d'internet" → "En attente d'avoir internet"
   */
  function fallbackBlockedReasonText(reason) {
    var trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmed) return '';

    // Heal awkward "En attente de pas d'/de …" / "En attente de sans …".
    if (
      /^en\s+attente\s+de\s+pas\s+/i.test(trimmed) ||
      /^en\s+attente\s+de\s+sans\s+/i.test(trimmed) ||
      /^en\s+attente\s+de\s+manque\s+/i.test(trimmed)
    ) {
      var healed = rewriteLackAsWaitingCause(
        trimmed.replace(/^en\s+attente\s+de\s+/i, '')
      );
      if (healed) return healed;
    }

    if (/^en\s+attente\s+(de|d\')/i.test(trimmed)) return trimmed;
    if (/^bloqu\u00e9\b/i.test(trimmed)) return trimmed;

    var known = normalizeAgentBlockedReason(trimmed);
    if (known && known !== trimmed && /^en\s+attente|^bloqu\u00e9/i.test(known)) {
      return known;
    }

    var lack = rewriteLackAsWaitingCause(trimmed);
    if (lack) return lack;

    var body = trimmed.replace(/\.+$/, '');
    // Prefer lowercase after "de" for infinitives / mid-sentence phrasing.
    var lower = lowerFrFirst(body);
    if (/^(une?|des)\s+/i.test(lower)) {
      return ('En attente d\'' + lower).slice(0, 500);
    }
    if (/^([aeiou\u00e0\u00e2\u00e4\u00e9\u00e8\u00ea\u00eb\u00ee\u00ef\u00f4\u00f6\u00f9\u00fb\u00fc]|h)/i.test(lower)) {
      return ('En attente d\'' + lower).slice(0, 500);
    }
    return ('En attente de ' + lower).slice(0, 500);
  }

  /**
   * AI-assisted polish for a typed block motif → single natural cause.
   * @param {*} provider
   * @param {string} reason
   * @param {{ cardTitle?: string }} [opts]
   */
  async function suggestBlockedReasonText(provider, reason, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    var trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmed) return '';
    var cardTitle = String(opts.cardTitle || opts.cardName || '').trim();
    var fallback = fallbackBlockedReasonText(trimmed);
    // Already polished (and not the awkward "En attente de pas …" form).
    if (
      (/^en\s+attente\s+(de|d\')/i.test(trimmed) || /^bloqu\u00e9\b/i.test(trimmed)) &&
      !/^en\s+attente\s+de\s+(pas|sans|manque)\s+/i.test(trimmed)
    ) {
      return trimmed;
    }
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return fallback;

    var messages = [
      {
        role: 'system',
        content: [
          'Tu transformes une cause de blocage Trello en une seule cause en fran\u00e7ais.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"text":"\u2026"}',
          'R\u00e8gles\u00a0:',
          '- text = UNE cause naturelle, pas une action \u00e0 faire (sauf si d\u00e9j\u00e0 une cause).',
          '- Pr\u00e9f\u00e8re \u00ab\u00a0En attente de/d\'\u2026\u00a0\u00bb ou \u00ab\u00a0En attente d\'avoir \u2026\u00a0\u00bb.',
          '- Utilise \u00ab\u00a0Bloqu\u00e9 \u00e0 cause de \u2026\u00a0\u00bb seulement pour un obstacle physique / permission / mat\u00e9riel clairement nomm\u00e9.',
          '- N\u00e9gations / manques (pas de, pas d\', sans, manque de, il n\'y a pas)\u00a0:',
          '  reformule en \u00ab\u00a0En attente d\'avoir \u2026\u00a0\u00bb (jamais calquer la n\u00e9gation).',
          '- INTERDIT\u00a0: \u00ab\u00a0En attente de pas d\'internet\u00a0\u00bb, \u00ab\u00a0En attente de pas de \u2026\u00a0\u00bb, \u00ab\u00a0En attente de sans \u2026\u00a0\u00bb.',
          '- Si le titre de carte / but est fourni, tu PEUX ajouter \u00ab\u00a0pour [but]\u00a0\u00bb quand \u00e7a clarifie (ex. publier, tester).',
          '- Si l\'entr\u00e9e est un infinitif (ex. Manger un hot-dog / Essayer le connecteur)\u00a0: \u00ab\u00a0En attente de manger\u2026\u00a0\u00bb / \u00ab\u00a0En attente d\'essayer\u2026\u00a0\u00bb (minuscule apr\u00e8s de/d\', \u00e9lision devant voyelle).',
          '- PAS de parenth\u00e8ses autour du titre, PAS de num\u00e9rotation, PAS de seconde cause.',
          '- INTERDIT\u00a0: \u00ab\u00a0En attente de (Essayer\u2026)\u00a0\u00bb \u2014 int\u00e8gre le verbe naturellement.',
          '- Max ~100 caract\u00e8res.',
          'Ex.\u00a0: \u00ab\u00a0Pas d\'internet\u00a0\u00bb (carte \u00ab\u00a0Publier l\'article\u00a0\u00bb) \u2192 {"text":"En attente d\'avoir internet pour publier"}',
          'Ex.\u00a0: \u00ab\u00a0Pas de wifi\u00a0\u00bb \u2192 {"text":"En attente d\'avoir le wifi"}',
          'Ex.\u00a0: \u00ab\u00a0Sans acc\u00e8s VPN\u00a0\u00bb \u2192 {"text":"En attente d\'avoir l\'acc\u00e8s VPN"}',
          'Ex.\u00a0: \u00ab\u00a0Manger un hot-dog\u00a0\u00bb \u2192 {"text":"En attente de manger un hot-dog"}',
          'Ex.\u00a0: \u00ab\u00a0Essayer le connecteur Antidote\u00a0\u00bb \u2192 {"text":"En attente d\'essayer le connecteur Antidote"}',
          'Ex.\u00a0: \u00ab\u00a0r\u00e9ponse du client\u00a0\u00bb \u2192 {"text":"En attente d\'une r\u00e9ponse du client"}',
          'Ex.\u00a0: \u00ab\u00a0En attente d\'une approbation\u00a0\u00bb \u2192 {"text":"En attente d\'une approbation"}'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          cardTitle ? 'Carte\u00a0: \u00ab' + cardTitle.slice(0, 120) + '\u00bb' : '',
          'Cause saisie\u00a0: \u00ab' + trimmed.slice(0, 200) + '\u00bb'
        ]
          .filter(Boolean)
          .join('\n')
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 100,
        temperature: 0.3,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        try {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 100,
            temperature: 0.3,
            stream: false
          });
        } catch (err2) {
          console.error('PriorityAgent.suggestBlockedReasonText failed', err2);
          return fallback;
        }
      } else {
        console.error('PriorityAgent.suggestBlockedReasonText failed', err);
        return fallback;
      }
    }

    var text = '';
    try {
      var parsed = parseAssistantPayload(response.content);
      text = typeof parsed.text === 'string' ? parsed.text : '';
      if (!text && parsed.reason) text = String(parsed.reason);
      if (!text && parsed.motif) text = String(parsed.motif);
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        text = typeof raw.text === 'string' ? raw.text : '';
      } catch (e2) {
        text = '';
      }
    }
    text = String(text || '')
      .trim()
      .replace(/^["«]\s*|\s*["»]$/g, '')
      .slice(0, 500);
    if (!text) return fallback;
    // Finalize via fallback so awkward "En attente de pas …" still gets healed.
    return fallbackBlockedReasonText(text) || text;
  }

  /**
   * True when `reason` is a pure "En attente de [taskTitle]" Motif
   * (not a woven cause like "… pour [taskTitle]").
   */
  function isPureWaitingOnTaskReason(reason, taskTitle) {
    var r = String(reason || '')
      .trim()
      .toLocaleLowerCase('fr-FR');
    var name = String(taskTitle || '').trim();
    if (!r || !name) return false;
    var nameKey = name.toLocaleLowerCase('fr-FR');
    var lower =
      name.charAt(0).toLocaleLowerCase('fr-FR') + name.slice(1);
    var lowerKey = lower.toLocaleLowerCase('fr-FR');
    if (r === nameKey || r === lowerKey) return true;
    if (r === ('en attente de (' + nameKey + ')').toLocaleLowerCase('fr-FR')) {
      return true;
    }
    if (r === ('en attente de (' + lowerKey + ')').toLocaleLowerCase('fr-FR')) {
      return true;
    }
    var rest = r
      .replace(/^en\s+attente\s+(de|d')\s*/i, '')
      .replace(/^\(|\)$/g, '')
      .trim();
    return rest === nameKey || rest === lowerKey;
  }

  function stripWhyLeadIn(why) {
    return String(why || '')
      .trim()
      .replace(/^en\s+attente\s+(de|d')\s*/i, '')
      .replace(/^bloqu\u00e9\s+\u00e0\s+cause\s+de\s+/i, '')
      .replace(
        /^(il\s+faut|on\s+a\s+besoin\s+(de|d')|besoin\s+(de|d')|we\s+need(\s+to)?)\s+/i,
        ''
      )
      .trim();
  }

  /**
   * Deterministic dual Motifs when a blocked subtask gets a WHY:
   * - subtaskReason: direct cause for that subtask
   * - cardReason: parent wait weaving cause + subtask goal
   */
  function fallbackBlockedReasonPair(opts) {
    opts = opts || {};
    var subtaskTitle = String(opts.subtaskTitle || '').trim();
    var why = String(opts.why || '').trim();
    if (!why && !subtaskTitle) {
      return { subtaskReason: '', cardReason: '' };
    }
    if (!why) {
      return {
        subtaskReason: '',
        cardReason: fallbackBlockedReasonText(subtaskTitle)
      };
    }

    var whyCore = stripWhyLeadIn(why);
    var afterWaitingOnly = why
      .replace(/^en\s+attente\s+(de|d')\s*/i, '')
      .replace(/^bloqu\u00e9\s+\u00e0\s+cause\s+de\s+/i, '')
      .trim();
    var hadNeedLeadIn =
      /^(il\s+faut|on\s+a\s+besoin\s+(de|d')|besoin\s+(de|d')|we\s+need(\s+to)?)\s+/i.test(
        afterWaitingOnly
      );
    // "Il faut le trépied" → subtask Motif around having that thing.
    var subtaskSeed =
      hadNeedLeadIn && whyCore
        ? /^avoir\b/i.test(whyCore)
          ? whyCore
          : 'avoir ' + whyCore
        : whyCore || why;
    var subtaskReason = fallbackBlockedReasonText(subtaskSeed);
    if (
      subtaskTitle &&
      isPureWaitingOnTaskReason(subtaskReason, subtaskTitle)
    ) {
      subtaskReason = '';
    }

    var taskLower = subtaskTitle
      ? subtaskTitle.charAt(0).toLocaleLowerCase('fr-FR') +
        subtaskTitle.slice(1)
      : '';
    var cardReason = '';
    if (taskLower && whyCore) {
      var coreLower =
        whyCore.charAt(0).toLocaleLowerCase('fr-FR') + whyCore.slice(1);
      // Lack / negation → "En attente d'avoir X pour [task]" (never "de pas d'X").
      var lackWoven = rewriteLackAsWaitingCause(coreLower + ' pour ' + taskLower);
      if (lackWoven) {
        cardReason = lackWoven;
      } else if (/^la\s+/i.test(coreLower)) {
        cardReason =
          'En attente de la ' +
          coreLower.replace(/^la\s+/i, '') +
          ' pour ' +
          taskLower;
      } else if (/^le\s+/i.test(coreLower)) {
        var afterLe = coreLower.replace(/^le\s+/i, '');
        cardReason =
          (/^([aeiou\u00e0\u00e2\u00e4\u00e9\u00e8\u00ea\u00eb\u00ee\u00ef\u00f4\u00f6\u00f9\u00fb\u00fc]|h)/i.test(
            afterLe
          )
            ? "En attente de l'"
            : 'En attente du ') +
          afterLe +
          ' pour ' +
          taskLower;
      } else if (/^l'/i.test(coreLower)) {
        cardReason =
          "En attente de l'" +
          coreLower.replace(/^l'/i, '') +
          ' pour ' +
          taskLower;
      } else {
        cardReason = fallbackBlockedReasonText(
          coreLower + ' pour ' + taskLower
        );
      }
    } else {
      cardReason = fallbackBlockedReasonText(why);
    }

    return {
      subtaskReason: String(subtaskReason || '').slice(0, 500),
      cardReason: String(cardReason || '').slice(0, 500)
    };
  }

  /**
   * AI dual Motifs: WHY for a blocked subtask → distinct card + subtask reasons.
   */
  async function suggestBlockedReasonPair(provider, opts) {
    opts = opts || {};
    var subtaskTitle = String(opts.subtaskTitle || '').trim();
    var why = String(opts.why || '').trim();
    var cardTitle = String(opts.cardTitle || '').trim();
    var fallback = fallbackBlockedReasonPair({
      subtaskTitle: subtaskTitle,
      why: why
    });
    if (!why) return fallback;

    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return fallback;

    var messages = [
      {
        role: 'system',
        content: [
          'Tu r\u00e9diges DEUX motifs de blocage Trello en fran\u00e7ais \u00e0 partir d\'une sous-t\u00e2che bloqu\u00e9e et d\'une cause (WHY).',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"subtaskReason":"\u2026","cardReason":"\u2026"}',
          'R\u00e8gles\u00a0:',
          '- subtaskReason = pourquoi CETTE sous-t\u00e2che ne peut pas avancer (cause directe\u00a0: mat\u00e9riel, permission, r\u00e9ponse\u2026).',
          '- cardReason = pourquoi la t\u00e2che parente / carte attend\u00a0: relie la cause au but de la sous-t\u00e2che.',
          '- INTERDIT sur subtaskReason\u00a0: \u00ab\u00a0En attente de [titre exact de la sous-t\u00e2che]\u00a0\u00bb (auto-r\u00e9f\u00e9rence).',
          '- Pr\u00e9f\u00e8re \u00ab\u00a0En attente de/d\'\u2026\u00a0\u00bb ou \u00ab\u00a0En attente d\'avoir \u2026\u00a0\u00bb\u00a0; \u00ab\u00a0Bloqu\u00e9 \u00e0 cause de\u00a0\u00bb seulement pour un obstacle mat\u00e9riel / permission.',
          '- N\u00e9gations (pas de/d\', sans, manque)\u00a0: reformule en \u00ab\u00a0En attente d\'avoir \u2026\u00a0\u00bb \u2014 INTERDIT \u00ab\u00a0En attente de pas d\'\u2026\u00a0\u00bb.',
          '- Minuscule apr\u00e8s de/d\'\u00a0; max ~100 caract\u00e8res par champ\u00a0; PAS de parenth\u00e8ses ni num\u00e9rotation.',
          'Ex.\u00a0: sous-t\u00e2che \u00ab\u00a0Tester en mode portrait\u00a0\u00bb, cause \u00ab\u00a0Il faut le tr\u00e9pied\u00a0\u00bb',
          '  \u2192 {"subtaskReason":"En attente d\'avoir le tr\u00e9pied requis","cardReason":"En attente du tr\u00e9pied pour tester en mode portrait"}',
          'Ex.\u00a0: sous-t\u00e2che \u00ab\u00a0Publier\u00a0\u00bb, cause \u00ab\u00a0Pas d\'internet\u00a0\u00bb',
          '  \u2192 {"subtaskReason":"En attente d\'avoir internet","cardReason":"En attente d\'avoir internet pour publier"}',
          'Ex.\u00a0: sous-t\u00e2che \u00ab\u00a0Valider le devis\u00a0\u00bb, cause \u00ab\u00a0r\u00e9ponse du client\u00a0\u00bb',
          '  \u2192 {"subtaskReason":"En attente d\'une r\u00e9ponse du client","cardReason":"En attente de la r\u00e9ponse du client pour valider le devis"}'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          cardTitle ? 'Carte\u00a0: \u00ab' + cardTitle.slice(0, 120) + '\u00bb' : '',
          'Sous-t\u00e2che bloqu\u00e9e\u00a0: \u00ab' + subtaskTitle.slice(0, 160) + '\u00bb',
          'Cause saisie\u00a0: \u00ab' + why.slice(0, 200) + '\u00bb'
        ]
          .filter(Boolean)
          .join('\n')
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 180,
        temperature: 0.3,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        try {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 180,
            temperature: 0.3,
            stream: false
          });
        } catch (err2) {
          console.error('PriorityAgent.suggestBlockedReasonPair failed', err2);
          return fallback;
        }
      } else {
        console.error('PriorityAgent.suggestBlockedReasonPair failed', err);
        return fallback;
      }
    }

    var subtaskOut = '';
    var cardOut = '';
    try {
      var parsed = parseAssistantPayload(response.content);
      subtaskOut =
        typeof parsed.subtaskReason === 'string' ? parsed.subtaskReason : '';
      cardOut = typeof parsed.cardReason === 'string' ? parsed.cardReason : '';
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        subtaskOut =
          typeof raw.subtaskReason === 'string' ? raw.subtaskReason : '';
        cardOut = typeof raw.cardReason === 'string' ? raw.cardReason : '';
      } catch (e2) {
        subtaskOut = '';
        cardOut = '';
      }
    }
    subtaskOut = String(subtaskOut || '')
      .trim()
      .replace(/^["«]\s*|\s*["»]$/g, '')
      .slice(0, 500);
    cardOut = String(cardOut || '')
      .trim()
      .replace(/^["«]\s*|\s*["»]$/g, '')
      .slice(0, 500);

    if (subtaskOut) {
      subtaskOut = fallbackBlockedReasonText(subtaskOut) || subtaskOut;
    }
    if (cardOut) {
      cardOut = fallbackBlockedReasonText(cardOut) || cardOut;
    }
    if (
      subtaskTitle &&
      subtaskOut &&
      isPureWaitingOnTaskReason(subtaskOut, subtaskTitle)
    ) {
      subtaskOut = fallback.subtaskReason;
    }
    if (!subtaskOut) subtaskOut = fallback.subtaskReason;
    if (!cardOut) cardOut = fallback.cardReason;
    return {
      subtaskReason: subtaskOut,
      cardReason: cardOut
    };
  }

  /**
   * Deterministic fallback: turn a block motif into an actionable Progrès title.
   * "En attente d'un câble" → "Obtenir un câble"
   */
  function fallbackUnblockSubtaskText(reason) {
    var trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmed) return '';
    if (
      /^[A-Za-z\u00C0-\u024F]+er\b/i.test(trimmed) ||
      /^[A-Za-z\u00C0-\u024F]+ir\b/i.test(trimmed) ||
      /^(mettre|faire|ouvrir|fermer|obtenir|relancer|r\u00e9soudre)\b/i.test(trimmed)
    ) {
      return trimmed.slice(0, 500);
    }
    var waiting = trimmed.match(
      /^en\s+attente\s+(de|d\')\s*(.+)$/i
    );
    if (waiting && waiting[2]) {
      var restWait = waiting[2].trim().replace(/\.+$/, '');
      if (/^mat\u00e9riel\b/i.test(restWait)) {
        return 'Obtenir le mat\u00e9riel';
      }
      if (/^(une\s+)?r\u00e9ponse\b/i.test(restWait)) {
        return 'Relancer pour obtenir une r\u00e9ponse';
      }
      if (/^(une\s+)?approbation\b/i.test(restWait)) {
        return 'Obtenir l\'approbation';
      }
      return ('Obtenir ' + restWait).slice(0, 500);
    }
    var cause = trimmed.match(
      /^bloqu\u00e9\s+\u00e0\s+cause\s+de\s+(.+)$/i
    );
    if (cause && cause[1]) {
      var restCause = cause[1].trim().replace(/\.+$/, '');
      if (/disponibilit\u00e9\s+du\s+mat\u00e9riel/i.test(restCause)) {
        return 'Obtenir le mat\u00e9riel';
      }
      return ('R\u00e9soudre ' + restCause).slice(0, 500);
    }
    return ('D\u00e9bloquer\u00a0: ' + trimmed).slice(0, 500);
  }

  /**
   * AI-assisted title for the Progrès subtask created from a block motif.
   * Falls back to fallbackUnblockSubtaskText when the provider is missing/fails.
   */
  async function suggestUnblockSubtaskText(provider, reason) {
    var trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmed) return '';
    var fallback = fallbackUnblockSubtaskText(trimmed);
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return fallback;

    var messages = [
      {
        role: 'system',
        content: [
          'Tu transformes une cause de blocage Trello en titre de sous-t\u00e2che actionable.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"text":"\u2026"}',
          'R\u00e8gles\u00a0:',
          '- text = une action courte en fran\u00e7ais, \u00e0 l\'infinitif (ex. Obtenir le c\u00e2ble, Relancer Marie).',
          '- Le titre doit d\u00e9bloquer la carte / avancer malgr\u00e9 la cause.',
          '- PAS de question, PAS de cause recopi\u00e9e telle quelle (sauf si d\u00e9j\u00e0 une action).',
          '- Max ~80 caract\u00e8res, pas de guillemets superflus ni de num\u00e9rotation.',
          'Ex.\u00a0: \u00ab\u00a0En attente d\'un c\u00e2ble\u00a0\u00bb \u2192 {"text":"Obtenir le c\u00e2ble"}',
          'Ex.\u00a0: \u00ab\u00a0En attente d\'une approbation\u00a0\u00bb \u2192 {"text":"Obtenir l\'approbation"}',
          'Ex.\u00a0: \u00ab\u00a0Bloqu\u00e9 \u00e0 cause du mat\u00e9riel\u00a0\u00bb \u2192 {"text":"Obtenir le mat\u00e9riel"}'
        ].join('\n')
      },
      {
        role: 'user',
        content: 'Cause de blocage\u00a0: «' + trimmed.slice(0, 200) + '»'
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 80,
        temperature: 0.35,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        try {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 80,
            temperature: 0.35,
            stream: false
          });
        } catch (err2) {
          console.error('PriorityAgent.suggestUnblockSubtaskText failed', err2);
          return fallback;
        }
      } else {
        console.error('PriorityAgent.suggestUnblockSubtaskText failed', err);
        return fallback;
      }
    }

    var text = '';
    try {
      var parsed = parseAssistantPayload(response.content);
      text = typeof parsed.text === 'string' ? parsed.text : '';
      if (!text && parsed.title) text = String(parsed.title);
      if (!text && parsed.subtask) text = String(parsed.subtask);
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        text = typeof raw.text === 'string' ? raw.text : '';
      } catch (e2) {
        text = '';
      }
    }
    text = String(text || '')
      .trim()
      .replace(/^["«]\s*|\s*["»]$/g, '')
      .slice(0, 500);
    return text || fallback;
  }

  /**
   * Fast offline guesses when the AI provider is unavailable / times out.
   * context.items: [{id?, text}]
   */
  function heuristicSubtaskEstimates(context) {
    var ctx = context && typeof context === 'object' ? context : {};
    var itemsRaw = Array.isArray(ctx.items) ? ctx.items : [];
    var out = [];
    itemsRaw.forEach(function (it) {
      if (!it) return;
      var text =
        typeof it === 'string'
          ? it.trim()
          : typeof it.text === 'string'
            ? it.text.trim()
            : '';
      if (!text) return;
      var lower = text.toLowerCase();
      var mins = 30;
      if (
        /achat|acheter|buy|commande|license|licence|abonnement|signup|inscription/.test(
          lower
        )
      ) {
        mins = 5;
      } else if (
        /email|courriel|mail|message|sms|appeler|call|ping|relance/.test(lower)
      ) {
        mins = 15;
      } else if (/r[eé]union|meeting|sync|1:?1|atelier|workshop/.test(lower)) {
        mins = 60;
      } else if (
        /r[eé]dig|écrire|ecrire|write|doc|brief|spec|compte[- ]rendu/.test(lower)
      ) {
        mins = 90;
      } else if (
        /audit|migration|refonte|refactor|overhaul|investigation/.test(lower)
      ) {
        mins = 480;
      } else if (text.length > 80) {
        mins = 60;
      } else if (text.length < 18) {
        mins = 20;
      }
      var clamp =
        typeof CompletionTrello !== 'undefined' &&
        typeof CompletionTrello.clampEstimatedMinutes === 'function'
          ? CompletionTrello.clampEstimatedMinutes
          : function (m) {
              return isFinite(+m) && +m > 0 ? Math.round(+m) : null;
            };
      var clamped = clamp(mins);
      if (clamped == null) return;
      var est = { estimatedMinutes: clamped, matchText: text };
      if (typeof it === 'object' && typeof it.id === 'string' && it.id) {
        est.id = it.id;
      }
      out.push(est);
    });
    return out;
  }

  /**
   * Quick NL duration parse → minutes (e.g. "5 jours", "une demie journ\u00e9e").
   * @returns {Promise<number|null>}
   */
  async function parseDurationMinutes(provider, text, options) {
    options = options || {};
    var raw = typeof text === 'string' ? text.trim() : '';
    if (!raw) return null;
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return null;

    var clamp =
      typeof CompletionTrello !== 'undefined' &&
      typeof CompletionTrello.clampEstimatedMinutes === 'function'
        ? CompletionTrello.clampEstimatedMinutes
        : typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.clampDurationMinutes === 'function'
          ? PriorityUI.clampDurationMinutes
          : function (m) {
              var n = Number(m);
              return isFinite(n) && n > 0 ? Math.round(n) : null;
            };

    var messages = [
      {
        role: 'system',
        content: [
          'Tu convertis une dur\u00e9e saisie par un utilisateur (fran\u00e7ais ou anglais) en minutes enti\u00e8res.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"minutes":7200,"certain":true}',
          'minutes = effort total en minutes (entier > 0). Ex.\u00a0:',
          '  "5 min" / "5 minutes" \u2192 5',
          '  "2 h" / "2 heures" \u2192 120',
          '  "5 jours" / "5 days" \u2192 7200 (5\u00d724\u00d760)',
          '  "1 semaine" \u2192 10080',
          '  "un mois" \u2192 43200 (30\u00d724\u00d760)',
          'Si la saisie n\u2019est pas une dur\u00e9e\u00a0: {"minutes":null,"certain":false}.',
          'certain=true seulement si tu es s\u00fbr de l\u2019unit\u00e9 (ne suppose pas des minutes si un jour/heure/semaine est \u00e9crit).'
        ].join('\n')
      },
      {
        role: 'user',
        content: raw.slice(0, 120)
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 80,
        temperature: 0,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        try {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 80,
            temperature: 0,
            stream: false
          });
        } catch (err2) {
          console.error('PriorityAgent.parseDurationMinutes failed', err2);
          return null;
        }
      } else {
        console.error('PriorityAgent.parseDurationMinutes failed', err);
        return null;
      }
    }

    var content =
      response && typeof response.content === 'string' ? response.content.trim() : '';
    if (!content) return null;
    var jsonText = content;
    var fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) jsonText = fence[1].trim();
    else {
      var start = content.indexOf('{');
      var end = content.lastIndexOf('}');
      if (start >= 0 && end > start) jsonText = content.slice(start, end + 1);
    }
    var data = null;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      return null;
    }
    if (!data || typeof data !== 'object') return null;
    if (data.certain === false) return null;
    if (data.minutes == null || data.minutes === '') return null;
    return clamp(data.minutes);
  }

  /**
   * Suggest Objectif / Projet names for board Objectifs settings.
   * context: { kind, boardName?, existingNames?, parentObjectif?, hierarchy? }
   */
  async function suggestGoals(provider, context, options) {
    options = options || {};
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var ctx = context && typeof context === 'object' ? context : {};
    var kind = ctx.kind === 'project' ? 'project' : 'objectif';
    var existing = Array.isArray(ctx.existingNames)
      ? ctx.existingNames
          .map(function (s) {
            return String(s || '').trim();
          })
          .filter(Boolean)
      : [];

    var kindLabel = kind === 'project' ? 'projets' : 'objectifs';
    var kindOne = kind === 'project' ? 'projet' : 'objectif';

    var payload = {
      kind: kind,
      boardName: typeof ctx.boardName === 'string' ? ctx.boardName.slice(0, 200) : '',
      parentObjectif:
        typeof ctx.parentObjectif === 'string' ? ctx.parentObjectif.slice(0, 200) : '',
      existingNames: existing.slice(0, 40),
      hierarchy: ctx.hierarchy && typeof ctx.hierarchy === 'object' ? ctx.hierarchy : null
    };

    var roleHints = {
      objectif:
        'Un objectif = r\u00e9sultat durable \u00e0 viser (ex. \u00ab\u00a0Produire des vid\u00e9os de qualit\u00e9\u00a0\u00bb).',
      project:
        'Un projet = chantier concret sous l\u2019objectif (ex. \u00ab\u00a0Production Vid\u00e9o\u00a0\u00bb).'
    };

    var messages = [
      {
        role: 'system',
        content: [
          'Tu proposes des noms pour un Power-Up Trello (hi\u00e9rarchie Objectifs \u2192 Projets).',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":["\u2026","\u2026","\u2026"]}',
          'Exactement 3 suggestions si possible (2 minimum si le contexte est pauvre).',
          'Chaque suggestion = un nom court en fran\u00e7ais (pas une question, pas de num\u00e9rotation).',
          roleHints[kind],
          'Inspire-toi du tableau, de l\u2019objectif parent et de la hi\u00e9rarchie existante.',
          'INTERDIT\u00a0: dupliquer un nom existant (m\u00eame sens).',
          'INTERDIT\u00a0: placeholders, guillemets superflus, formulations trop g\u00e9n\u00e9riques (\u00ab\u00a0Nouvel objectif\u00a0\u00bb).',
          'Contexte\u00a0:',
          JSON.stringify(payload)
        ].join('\n')
      },
      {
        role: 'user',
        content: 'Propose 3 ' + kindLabel + ' pertinentes pour ce niveau (' + kindOne + ').'
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 220,
        temperature: 0.6,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        response = await chatCompletions(p, messages, {
          jsonMode: false,
          max_tokens: 220,
          temperature: 0.6,
          stream: false
        });
      } else {
        console.error('PriorityAgent.suggestGoals failed', err);
        return [];
      }
    }

    var list = [];
    try {
      var parsed = parseAssistantPayload(response.content);
      list = normalizeSuggestionList(parsed.suggestions);
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        list = normalizeSuggestionList(raw.suggestions || raw.goals || raw.names);
      } catch (e2) {
        list = [];
      }
    }

    var existingKeys = {};
    for (var i = 0; i < existing.length; i++) {
      existingKeys[existing[i].toLocaleLowerCase('fr-FR')] = true;
    }
    return list
      .filter(function (s) {
        return s && !existingKeys[s.toLocaleLowerCase('fr-FR')];
      })
      .slice(0, 3);
  }

  /** Minimum model confidence to surface a label suggestion (0–1). */
  var LABEL_SUGGEST_MIN_CONFIDENCE = 0.45;
  var TASK_TYPE_SUGGEST_MIN_CONFIDENCE = 0.4;

  var TASK_TYPE_CATALOG = [
    { id: 'action', label: 'Action', hint: 'Action concr\u00e8te unique' },
    { id: 'project', label: 'Projet', hint: 'Partie d\u2019un effort multi-\u00e9tapes' },
    { id: 'recurring', label: 'R\u00e9currente', hint: 'T\u00e2che r\u00e9p\u00e9titive / r\u00e9currente' },
    { id: 'exploratory', label: 'Exploration', hint: 'D\u00e9couverte / recherche' },
    { id: 'emotional', label: '\u00c9motionnel', hint: '\u00c9motionnel / psychologique' },
    { id: 'communication', label: 'Communication', hint: 'Communication / relationnel' },
    { id: 'deliverable', label: 'Livrable', hint: 'Livrable / produit' },
    { id: 'process', label: 'Processus', hint: 'Processus / maintenance' },
    { id: 'thinking', label: 'R\u00e9flexion', hint: 'R\u00e9flexion / d\u00e9cisions' },
    { id: 'material', label: 'Mat\u00e9riel', hint: 'Achat / \u00e9quipement / fournitures' },
    { id: 'learning', label: 'Apprentissage', hint: 'Formation / \u00e9tude / comp\u00e9tences' },
    { id: 'admin', label: 'Administratif', hint: 'Paperasse / formalit\u00e9s / admin' },
    { id: 'creative', label: 'Cr\u00e9atif', hint: 'Cr\u00e9ation / design / contenu' },
    { id: 'finance', label: 'Financier', hint: 'Budget / paiement / argent' }
  ];

  function normalizeBoardLabelRef(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      var asId = raw.trim();
      return asId ? { id: asId, name: '', color: '', confidence: null, isNew: false } : null;
    }
    if (typeof raw !== 'object') return null;
    var id = raw.id != null ? String(raw.id).trim() : '';
    var name =
      typeof raw.name === 'string'
        ? raw.name.trim()
        : typeof raw.label === 'string'
          ? raw.label.trim()
          : '';
    if (!id && !name) return null;
    var confidence = Number(raw.confidence);
    if (!isFinite(confidence)) {
      confidence = Number(raw.score);
    }
    if (!isFinite(confidence)) confidence = null;
    else {
      if (confidence > 1 && confidence <= 100) confidence = confidence / 100;
      confidence = Math.max(0, Math.min(1, confidence));
    }
    var color =
      typeof raw.color === 'string' && raw.color.trim() ? raw.color.trim() : '';
    var isNew = raw.isNew === true || raw.create === true || (!id && !!name);
    return {
      id: id,
      name: name,
      color: color,
      confidence: confidence,
      isNew: isNew
    };
  }

  function heuristicLabelSuggestions(context) {
    var ctx = context && typeof context === 'object' ? context : {};
    var hay = (
      String(ctx.cardName || '') +
      ' ' +
      String(ctx.cardDesc || '') +
      ' ' +
      String(ctx.priorityLabel || '')
    )
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (!hay.trim()) return [];
    var existingIds = Object.create(null);
    (Array.isArray(ctx.existingLabels) ? ctx.existingLabels : []).forEach(
      function (label) {
        if (label && label.id) existingIds[String(label.id)] = true;
      }
    );
    var scored = [];
    (Array.isArray(ctx.boardLabels) ? ctx.boardLabels : []).forEach(function (label) {
      if (!label || !label.id || existingIds[String(label.id)]) return;
      var name = typeof label.name === 'string' ? label.name.trim() : '';
      if (!name || name.length < 2) return;
      var needle = name
        .toLocaleLowerCase('fr-FR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (hay.indexOf(needle) !== -1 || needle.indexOf(hay.trim().slice(0, 24)) !== -1) {
        scored.push({
          id: String(label.id),
          name: name,
          color: label.color != null ? label.color : null,
          idBoard: label.idBoard,
          confidence: 0.7,
          isNew: false
        });
      }
    });
    return scored.slice(0, 3);
  }

  function heuristicTaskTypeSuggestions(context) {
    var ctx = context && typeof context === 'object' ? context : {};
    var hay = (
      String(ctx.cardName || '') +
      ' ' +
      String(ctx.cardDesc || '')
    )
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    var existing = Object.create(null);
    (Array.isArray(ctx.existingTypes) ? ctx.existingTypes : []).forEach(function (id) {
      if (id) existing[String(id)] = true;
    });
    var rules = [
      { id: 'communication', re: /\b(mail|email|reunion|meeting|appeler|ecrire|message|slack|discuter|parler)\b/ },
      { id: 'exploratory', re: /\b(recherch|explor|analyser|audit|etude|decouvrir|investig)\b/ },
      { id: 'recurring', re: /\b(recurrent|chaque|hebdo|quotidien|mensuel|routine|regulier)\b/ },
      { id: 'project', re: /\b(projet|roadmap|chantier|phase|jalon|milestone)\b/ },
      { id: 'deliverable', re: /\b(livrable|document|rapport|pdf|diapo|presentation|slides|article)\b/ },
      { id: 'thinking', re: /\b(reflech|decid|penser|strategie|brainstorm|planifier)\b/ },
      { id: 'process', re: /\b(process|maintenance|menage|ranger|nettoyer|ops|procedure)\b/ },
      { id: 'emotional', re: /\b(emotion|stress|anxi|psy|confiance|motivation)\b/ },
      { id: 'material', re: /\b(materiel|fourniture|equipement|outil|stock|commander|achat|acheter)\b/ },
      { id: 'learning', re: /\b(apprend|formation|cours|etudier|tutoriel|competence|certif)\b/ },
      { id: 'admin', re: /\b(administratif|paperasse|formulaire|declaration|formalit)\b/ },
      { id: 'creative', re: /\b(creatif|design|dessin|illustration|montage|maquette|contenu)\b/ },
      { id: 'finance', re: /\b(budget|payer|paiement|facture|argent|finance|cout|devis)\b/ },
      { id: 'action', re: /\b(faire|installer|envoyer|fixer|completer|terminer)\b/ }
    ];
    var out = [];
    for (var i = 0; i < rules.length; i++) {
      if (existing[rules[i].id]) continue;
      if (rules[i].re.test(hay)) {
        out.push({ id: rules[i].id, confidence: 0.62 });
      }
      if (out.length >= 3) break;
    }
    if (!out.length && !existing.action && hay.trim()) {
      out.push({ id: 'action', confidence: 0.5 });
    }
    return out;
  }

  /**
   * Suggest board labels (and optional new names) for Information → Étiquettes.
   * context: { cardName?, cardDesc?, priorityLabel?, existingLabels?, boardLabels? }
   * @returns {Promise<Array<{id?:string,name:string,color?:*,confidence:number,isNew?:boolean}>>}
   */
  async function suggestLabels(provider, context, options) {
    options = options || {};
    var minConfidence =
      typeof options.minConfidence === 'number' && isFinite(options.minConfidence)
        ? options.minConfidence
        : LABEL_SUGGEST_MIN_CONFIDENCE;
    var p = normalizeProvider(provider);
    var ctx = context && typeof context === 'object' ? context : {};
    var fallback = heuristicLabelSuggestions(ctx);

    var boardLabels = Array.isArray(ctx.boardLabels)
      ? ctx.boardLabels.filter(function (label) {
          return label && label.id;
        })
      : [];

    var existingIds = Object.create(null);
    var existingNames = Object.create(null);
    (Array.isArray(ctx.existingLabels) ? ctx.existingLabels : []).forEach(
      function (label) {
        if (!label) return;
        if (label.id) existingIds[String(label.id)] = true;
        var n =
          typeof label.name === 'string' ? label.name.trim().toLocaleLowerCase('fr-FR') : '';
        if (n) existingNames[n] = true;
      }
    );

    var available = boardLabels
      .filter(function (label) {
        return !existingIds[String(label.id)];
      })
      .slice(0, 60)
      .map(function (label) {
        return {
          id: String(label.id),
          name: typeof label.name === 'string' ? label.name.trim().slice(0, 80) : '',
          color: label.color != null ? String(label.color) : null
        };
      });

    if (!isConfigured(p)) return fallback;

    var byId = Object.create(null);
    var byName = Object.create(null);
    available.forEach(function (label) {
      byId[label.id] = label;
      if (label.name) {
        var key = label.name.toLocaleLowerCase('fr-FR');
        if (!byName[key]) byName[key] = label;
      }
    });

    var payload = {
      cardName: typeof ctx.cardName === 'string' ? ctx.cardName.slice(0, 200) : '',
      cardDesc:
        typeof ctx.cardDesc === 'string'
          ? ctx.cardDesc.trim().replace(/\s+/g, ' ').slice(0, 600)
          : '',
      priorityLabel:
        typeof ctx.priorityLabel === 'string' ? ctx.priorityLabel.slice(0, 80) : '',
      boardLabels: available
    };

    var title = String(payload.cardName || '').trim();
    var messages = [
      {
        role: 'system',
        content: [
          'Tu proposes des \u00e9tiquettes Trello pour une carte, d\u2019apr\u00e8s le titre et la description.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":[{"id":"\u2026","confidence":0.0},{"name":"Nouveau","color":"blue","confidence":0.0}]}',
          'R\u00e8gles\u00a0:',
          '- Propose 1 \u00e0 3 suggestions utiles (pas 0 sauf carte totalement vide).',
          '- Pr\u00e9f\u00e8re d\u2019abord les \u00e9tiquettes existantes de boardLabels (id exact).',
          '- Si aucune \u00e9tiquette du tableau ne convient, propose un NOUVEAU nom court (name, sans id) + color Trello (green|yellow|orange|red|purple|blue|sky|lime|pink|black).',
          '- confidence = 0\u20131. Inclus seulement si \u2265 ' +
            String(minConfidence) +
            ' (ou omets confidence\u00a0: on assumera un bon match).',
          '- Noms nouveaux\u00a0: 1\u20133 mots max, fran\u00e7ais, concrets (pas \u00ab\u00a0Divers\u00a0\u00bb / \u00ab\u00a0Autre\u00a0\u00bb).',
          '- INTERDIT\u00a0: ids hors boardLabels\u00a0; \u00e9tiquettes d\u00e9j\u00e0 sur la carte\u00a0; suggestions dans le chat.',
          'Contexte\u00a0:',
          JSON.stringify(payload)
        ].join('\n')
      },
      {
        role: 'user',
        content: title
          ? 'Quelles \u00e9tiquettes collent \u00e0\u00a0: \u00ab\u00a0' +
            title.slice(0, 200) +
            '\u00a0\u00bb\u00a0? Utilise les indices du titre/description.'
          : 'Propose des \u00e9tiquettes pertinentes pour cette carte (indices du contexte).'
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 280,
        temperature: 0.35,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        try {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 280,
            temperature: 0.35,
            stream: false
          });
        } catch (err2) {
          console.error('PriorityAgent.suggestLabels failed', err2);
          return fallback;
        }
      } else {
        console.error('PriorityAgent.suggestLabels failed', err);
        return fallback;
      }
    }

    var rawList = [];
    try {
      var parsed = parseAssistantPayload(response.content);
      rawList = parsed.suggestions || parsed.labels || [];
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        rawList = raw.suggestions || raw.labels || [];
      } catch (e2) {
        rawList = [];
      }
    }
    if (!Array.isArray(rawList)) rawList = [];

    var out = [];
    var seen = Object.create(null);
    var seenNames = Object.create(null);
    for (var i = 0; i < rawList.length; i++) {
      var ref = normalizeBoardLabelRef(rawList[i]);
      if (!ref) continue;
      var confidence =
        ref.confidence == null ? 0.72 : ref.confidence;
      if (confidence < minConfidence) continue;

      var match = null;
      if (ref.id && byId[ref.id]) match = byId[ref.id];
      else if (ref.name) {
        match = byName[ref.name.toLocaleLowerCase('fr-FR')] || null;
      }

      if (match) {
        if (existingIds[match.id] || seen[match.id]) continue;
        if (match.name && existingNames[match.name.toLocaleLowerCase('fr-FR')]) {
          continue;
        }
        seen[match.id] = true;
        var full = null;
        for (var j = 0; j < boardLabels.length; j++) {
          if (boardLabels[j] && String(boardLabels[j].id) === match.id) {
            full = boardLabels[j];
            break;
          }
        }
        out.push({
          id: match.id,
          name: full && typeof full.name === 'string' ? full.name : match.name,
          color: full && full.color != null ? full.color : match.color,
          idBoard: full && full.idBoard != null ? full.idBoard : undefined,
          confidence: confidence,
          isNew: false
        });
      } else if (ref.name) {
        var newName = ref.name.trim().slice(0, 50);
        var nameKey = newName.toLocaleLowerCase('fr-FR');
        if (!newName || existingNames[nameKey] || seenNames[nameKey] || byName[nameKey]) {
          continue;
        }
        seenNames[nameKey] = true;
        out.push({
          id: '',
          name: newName,
          color: ref.color || 'blue',
          confidence: confidence,
          isNew: true
        });
      }
      if (out.length >= 3) break;
    }

    if (!out.length && fallback.length) return fallback;
    return out;
  }

  /**
   * Suggest task-type catalog ids for Information → Type de tâche.
   * context: { cardName?, cardDesc?, existingTypes? }
   * @returns {Promise<Array<{id:string,label?:string,confidence:number}>>}
   */
  async function suggestTaskTypes(provider, context, options) {
    options = options || {};
    var minConfidence =
      typeof options.minConfidence === 'number' && isFinite(options.minConfidence)
        ? options.minConfidence
        : TASK_TYPE_SUGGEST_MIN_CONFIDENCE;
    var p = normalizeProvider(provider);
    var ctx = context && typeof context === 'object' ? context : {};
    var existing = Object.create(null);
    (Array.isArray(ctx.existingTypes) ? ctx.existingTypes : []).forEach(function (id) {
      if (id) existing[String(id)] = true;
    });
    var fullCatalog = agentTaskTypeCatalog();
    var catalog = fullCatalog.filter(function (entry) {
      return !existing[entry.id];
    });
    var fallback = heuristicTaskTypeSuggestions(ctx)
      .filter(function (row) {
        return row && row.id && !existing[row.id];
      })
      .map(function (row) {
        var entry = null;
        for (var i = 0; i < fullCatalog.length; i++) {
          if (fullCatalog[i].id === row.id) {
            entry = fullCatalog[i];
            break;
          }
        }
        return {
          id: row.id,
          label: entry ? entry.label : row.id,
          hint: entry ? entry.hint : '',
          confidence: row.confidence
        };
      });

    if (!catalog.length) return [];
    if (!isConfigured(p)) return fallback.slice(0, 3);

    var payload = {
      cardName: typeof ctx.cardName === 'string' ? ctx.cardName.slice(0, 200) : '',
      cardDesc:
        typeof ctx.cardDesc === 'string'
          ? ctx.cardDesc.trim().replace(/\s+/g, ' ').slice(0, 600)
          : '',
      catalog: catalog,
      existingTypes: Object.keys(existing)
    };
    var title = String(payload.cardName || '').trim();
    var messages = [
      {
        role: 'system',
        content: [
          'Tu classifies une carte Trello dans 1 \u00e0 3 types de t\u00e2che du catalogue.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":[{"id":"action","confidence":0.8}]}',
          'R\u00e8gles\u00a0:',
          '- Choisis UNIQUEMENT des id du catalog.',
          '- Propose 1\u20133 types qui collent au titre/description (pas 0 si le titre a du sens).',
          '- confidence 0\u20131. Inclus seulement si \u2265 ' +
            String(minConfidence) +
            ' (ou omets confidence).',
          '- INTERDIT\u00a0: ids hors catalog\u00a0; types d\u00e9j\u00e0 s\u00e9lectionn\u00e9s\u00a0; suggestions chat.',
          'Contexte\u00a0:',
          JSON.stringify(payload)
        ].join('\n')
      },
      {
        role: 'user',
        content: title
          ? 'Quels types collent \u00e0\u00a0: \u00ab\u00a0' +
            title.slice(0, 200) +
            '\u00a0\u00bb\u00a0?'
          : 'Propose les types de t\u00e2che les plus pertinents.'
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 180,
        temperature: 0.3,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        try {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 180,
            temperature: 0.3,
            stream: false
          });
        } catch (err2) {
          console.error('PriorityAgent.suggestTaskTypes failed', err2);
          return fallback.slice(0, 3);
        }
      } else {
        console.error('PriorityAgent.suggestTaskTypes failed', err);
        return fallback.slice(0, 3);
      }
    }

    var rawList = [];
    try {
      var parsed = parseAssistantPayload(response.content);
      rawList = parsed.suggestions || parsed.types || parsed.taskTypes || [];
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        rawList = raw.suggestions || raw.types || raw.taskTypes || [];
      } catch (e2) {
        rawList = [];
      }
    }
    if (!Array.isArray(rawList)) rawList = [];

    var byId = Object.create(null);
    catalog.forEach(function (entry) {
      byId[entry.id] = entry;
    });

    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < rawList.length; i++) {
      var row = rawList[i];
      var id =
        typeof row === 'string'
          ? row.trim()
          : row && row.id != null
            ? String(row.id).trim()
            : '';
      if (!id || !byId[id] || existing[id] || seen[id]) continue;
      var confidence = Number(row && row.confidence);
      if (!isFinite(confidence)) confidence = Number(row && row.score);
      if (!isFinite(confidence)) confidence = 0.72;
      else {
        if (confidence > 1 && confidence <= 100) confidence = confidence / 100;
        confidence = Math.max(0, Math.min(1, confidence));
      }
      if (confidence < minConfidence) continue;
      seen[id] = true;
      out.push({
        id: id,
        label: byId[id].label,
        hint: byId[id].hint,
        confidence: confidence
      });
      if (out.length >= 3) break;
    }

    if (!out.length) return fallback.slice(0, 3);
    return out;
  }

  function normalizeMetricSuggestion(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name || name.length > 120) return null;
    var type = raw.type === 'sentimental' ? 'sentimental' : 'incremental';
    var direction =
      raw.direction === 'decrease' || raw.direction === 'hold' ? raw.direction : 'increase';
    var measurement = raw.measurement === 'direct' ? 'direct' : 'manual';
    var currentValue = Number(raw.currentValue);
    if (!isFinite(currentValue)) currentValue = 0;
    var metric = {
      name: name,
      type: type,
      direction: direction,
      measurement: measurement,
      currentValue: currentValue,
      isPrimary: raw.isPrimary === true
    };
    var target = Number(raw.target);
    if (isFinite(target)) metric.target = target;
    if (type === 'sentimental' && Array.isArray(raw.scaleLabels) && raw.scaleLabels.length >= 2) {
      var lo = typeof raw.scaleLabels[0] === 'string' ? raw.scaleLabels[0].trim() : '';
      var hi = typeof raw.scaleLabels[1] === 'string' ? raw.scaleLabels[1].trim() : '';
      if (lo && hi) metric.scaleLabels = [lo.slice(0, 80), hi.slice(0, 80)];
    }
    return metric;
  }

  function normalizeMetricSuggestionList(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var seen = Object.create(null);
    var primaryClaimed = false;
    for (var i = 0; i < list.length; i++) {
      var metric = normalizeMetricSuggestion(list[i]);
      if (!metric) continue;
      var key = metric.name.toLocaleLowerCase('fr-FR');
      if (seen[key]) continue;
      seen[key] = true;
      if (metric.isPrimary) {
        if (primaryClaimed) metric.isPrimary = false;
        else primaryClaimed = true;
      }
      out.push(metric);
      if (out.length >= 3) break;
    }
    if (out.length && !primaryClaimed) out[0].isPrimary = true;
    return out;
  }

  /**
   * Suggest mission metrics from Vision + Mission names.
   * context: { visionName, missionName, boardName?, existingMetrics? }
   * Returns [{ name, type, direction, measurement, currentValue, target?, scaleLabels?, isPrimary }]
   */
  async function suggestMetrics(provider, context, options) {
    options = options || {};
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var ctx = context && typeof context === 'object' ? context : {};
    var visionName = typeof ctx.visionName === 'string' ? ctx.visionName.trim() : '';
    var missionName = typeof ctx.missionName === 'string' ? ctx.missionName.trim() : '';
    if (!missionName) return [];

    var existing = Array.isArray(ctx.existingMetrics) ? ctx.existingMetrics : [];
    var existingNames = existing
      .map(function (m) {
        return typeof m === 'string' ? m.trim() : m && m.name ? String(m.name).trim() : '';
      })
      .filter(Boolean);

    var payload = {
      visionName: visionName.slice(0, 200),
      missionName: missionName.slice(0, 200),
      boardName: typeof ctx.boardName === 'string' ? ctx.boardName.slice(0, 200) : '',
      existingMetrics: existingNames.slice(0, 30)
    };

    var messages = [
      {
        role: 'system',
        content: [
          'Tu proposes des m\u00e9triques pour une Mission Trello (Objectifs\u00a0: Vision \u2192 Mission).',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
          '{"metrics":[{"name":"\u2026","type":"incremental|sentimental","direction":"increase|decrease|hold","measurement":"manual|direct","currentValue":0,"target":100,"scaleLabels":["bas","haut"],"isPrimary":true}]}',
          'Propose 1 \u00e0 3 m\u00e9triques (pr\u00e9f\u00e8re 2) ancr\u00e9es dans les noms Vision et Mission.',
          'Exactement UNE m\u00e9trique isPrimary:true (la plus centrale pour la mission).',
          'type incremental = quantit\u00e9 num\u00e9rique\u00a0; sentimental = \u00e9chelle subjective (alors scaleLabels [bas, haut] obligatoires).',
          'direction\u00a0: increase / decrease / hold selon l\'objectif.',
          'measurement\u00a0: manual (saisie) ou direct (suivi auto) \u2014 privil\u00e9gie manual.',
          'currentValue et target num\u00e9riques coh\u00e9rents (target optionnel si hold).',
          'Noms courts en fran\u00e7ais, concrets, mesurables.',
          'INTERDIT\u00a0: dupliquer une m\u00e9trique existante (m\u00eame sens).',
          'INTERDIT\u00a0: placeholders g\u00e9n\u00e9riques (\u00ab\u00a0KPI 1\u00a0\u00bb, \u00ab\u00a0M\u00e9trique principale\u00a0\u00bb).',
          'Contexte\u00a0:',
          JSON.stringify(payload)
        ].join('\n')
      },
      {
        role: 'user',
        content:
          'Propose des m\u00e9triques pour la mission \u00ab\u00a0' +
          missionName +
          '\u00a0\u00bb' +
          (visionName ? ' (vision\u00a0: \u00ab\u00a0' + visionName + '\u00a0\u00bb)' : '') +
          '.'
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 520,
        temperature: 0.45,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        response = await chatCompletions(p, messages, {
          jsonMode: false,
          max_tokens: 520,
          temperature: 0.45,
          stream: false
        });
      } else {
        console.error('PriorityAgent.suggestMetrics failed', err);
        return [];
      }
    }

    var list = [];
    try {
      var parsed = parseAssistantPayload(response.content);
      list = normalizeMetricSuggestionList(parsed.metrics || parsed.suggestions);
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        list = normalizeMetricSuggestionList(raw.metrics || raw.suggestions);
      } catch (e2) {
        list = [];
      }
    }

    var existingKeys = {};
    for (var i = 0; i < existingNames.length; i++) {
      existingKeys[existingNames[i].toLocaleLowerCase('fr-FR')] = true;
    }
    return list.filter(function (m) {
      return m && m.name && !existingKeys[m.name.toLocaleLowerCase('fr-FR')];
    });
  }

  /**
   * Parse free-text into a single metric payload.
   * context: { visionName?, missionName?, boardName?, existingMetrics?, hasPrimary? }
   * Returns normalized metric or null.
   */
  async function parseMetric(provider, text, context, options) {
    options = options || {};
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return null;
    var rawText = typeof text === 'string' ? text.trim() : '';
    if (!rawText) return null;

    var ctx = context && typeof context === 'object' ? context : {};
    var visionName = typeof ctx.visionName === 'string' ? ctx.visionName.trim() : '';
    var missionName = typeof ctx.missionName === 'string' ? ctx.missionName.trim() : '';
    var existing = Array.isArray(ctx.existingMetrics) ? ctx.existingMetrics : [];
    var existingNames = existing
      .map(function (m) {
        return typeof m === 'string' ? m.trim() : m && m.name ? String(m.name).trim() : '';
      })
      .filter(Boolean);
    var hasPrimary = ctx.hasPrimary === true || existing.some(function (m) {
      return m && m.isPrimary;
    });

    var payload = {
      text: rawText.slice(0, 400),
      visionName: visionName.slice(0, 200),
      missionName: missionName.slice(0, 200),
      boardName: typeof ctx.boardName === 'string' ? ctx.boardName.slice(0, 200) : '',
      existingMetrics: existingNames.slice(0, 30),
      hasPrimary: hasPrimary
    };

    var messages = [
      {
        role: 'system',
        content: [
          'Tu convertis une description libre en UNE m\u00e9trique Trello (Objectifs\u00a0: Vision \u2192 Mission).',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
          '{"metric":{"name":"\u2026","type":"incremental|sentimental","direction":"increase|decrease|hold","measurement":"manual|direct","currentValue":0,"target":100,"scaleLabels":["bas","haut"],"isPrimary":false}}',
          'Extrais tout ce qui est dit (nom, valeurs, direction, type). Compl\u00e8te seulement les champs manquants de fa\u00e7on raisonnable.',
          'type incremental = quantit\u00e9 num\u00e9rique\u00a0; sentimental = \u00e9chelle subjective (alors scaleLabels [bas, haut] obligatoires).',
          'Ex. \u00ab\u00a0NPS de 30 \u00e0 70\u00a0\u00bb \u2192 incremental, increase, currentValue 30, target 70.',
          'Ex. \u00ab\u00a0Satisfaction de mauvais \u00e0 excellent\u00a0\u00bb \u2192 sentimental, increase, scaleLabels.',
          'Ex. \u00ab\u00a0Maintenir le taux \u00e0 80\u00a0\u00bb \u2192 hold, currentValue/target 80.',
          'measurement\u00a0: manual sauf si l\'utilisateur demande un suivi auto/direct.',
          'isPrimary:true seulement si explicitement demand\u00e9 OU si aucune m\u00e9trique principale n\'existe encore (hasPrimary:false).',
          'Nom court en fran\u00e7ais, concret, mesurable \u2014 jamais un copier-coller trop long de la phrase.',
          'INTERDIT\u00a0: inventer une autre m\u00e9trique sans rapport avec le texte.',
          'INTERDIT\u00a0: dupliquer une m\u00e9trique existante (m\u00eame sens).',
          'Contexte\u00a0:',
          JSON.stringify(payload)
        ].join('\n')
      },
      {
        role: 'user',
        content: 'Parse cette m\u00e9trique\u00a0: ' + rawText.slice(0, 400)
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 360,
        temperature: 0.2,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        response = await chatCompletions(p, messages, {
          jsonMode: false,
          max_tokens: 360,
          temperature: 0.2,
          stream: false
        });
      } else {
        console.error('PriorityAgent.parseMetric failed', err);
        return null;
      }
    }

    var metric = null;
    try {
      var parsed = parseAssistantPayload(response.content);
      metric = normalizeMetricSuggestion(parsed.metric || parsed);
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        metric = normalizeMetricSuggestion(raw.metric || raw);
      } catch (e2) {
        metric = null;
      }
    }
    if (!metric) return null;
    if (hasPrimary) metric.isPrimary = false;
    return metric;
  }

  /**
   * Conversational turn for memory alignment (no card tools).
   * Returns { message, suggestions, patches, rawJson, usage }.
   */
  async function memoryTurn(provider, history, memory, userText, options) {
    options = options || {};
    var mode = options.mode === 'onboarding' ? 'onboarding' : 'ongoing';
    dbgLog('agent', 'memoryTurn.start', { mode: mode });
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      dbgLog('agent', 'memoryTurn.end', { ok: false, reason: 'not-configured' });
      return {
        message: 'Configurez d\'abord un fournisseur IA dans les param\u00e8tres.',
        suggestions: [],
        patches: [],
        rawJson: '',
        usage: null
      };
    }

    var mem = memory && typeof memory === 'object' ? memory : {};
    var Mem = global.AgentMemory;
    var view = Mem && typeof Mem.legacyView === 'function' ? Mem.legacyView(mem) : mem;
    var asked = Array.isArray(mem.preferredQuestionsAsked) ? mem.preferredQuestionsAsked : [];
    var system = [
      'Tu es l\'assistant m\u00e9moire Cerveau\u00a0: un pote qui aide \u00e0 se souvenir du contexte, pas un coach productivit\u00e9.',
      'Tu parles en fran\u00e7ais, tu tutoyes, ton naturel et amical\u00a0: z\u00e9ro jargon, z\u00e9ro ton support.',
      'Voix\u00a0: comme un message \u00e0 un ami. Court, clair, humain.',
      'La m\u00e9moire a deux \u00e9tages\u00a0: LONG TERME (durable) et COURT TERME (provisoire / tableau).',
      'Mettre \u00e0 jour le LONG TERME est un GROS d\u00e9al\u00a0: seulement des faits stables et pr\u00e9cieux.',
      'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
      '{"message":"texte","suggestions":["r\u00e9ponse courte","\u2026"],"patches":[{"op":"remember","text":"\u2026"}]}',
      'Ops patches autoris\u00e9es\u00a0:',
      '- {"op":"remember","text":"fait durable"} \u2192 LONG TERME (strict)',
      '- {"op":"note","text":"note provisoire"} \u2192 COURT TERME',
      '- {"op":"forget","query":"mot-cl\u00e9"}',
      '- {"op":"set_summary","text":"1\u20132 phrases sur l\'utilisateur"} \u2192 LONG TERME',
      '- {"op":"set_board_summary","text":"th\u00e8mes du tableau"} \u2192 COURT TERME',
      '- {"op":"complete_onboarding"} (quand tu as assez de faits durables)',
      'R\u00e8gles LONG TERME (remember / set_summary)\u00a0:',
      '- UNIQUEMENT si l\'utilisateur vient d\'affirmer un fait concret et durable.',
      '- Ex. accept\u00e9s\u00a0: nom, \u00e2ge, r\u00f4le, patron, outils, focus projet, norme d\'\u00e9quipe claire.',
      '- INTERDIT\u00a0: m\u00e9ta-conversation, refus, \u00ab\u00a0pas maintenant\u00a0\u00bb, disponibilit\u00e9 \u00e0 discuter,',
      '  d\u00e9but d\'alignement, suggestions cliqu\u00e9es par erreur, reformulations vagues,',
      '  r\u00e9sum\u00e9s g\u00e9n\u00e9riques du tableau, doublons (un seul fait par th\u00e8me\u00a0: nom, \u00e2ge, etc.).',
      '- Si le fait n\'est pas assez solide\u00a0: n\'\u00e9cris PAS de patch remember (demande confirmation).',
      '- Un seul remember par th\u00e8me\u00a0; \u00e9crase mentalement les doublons (ex. nom).',
      'R\u00e8gles g\u00e9n\u00e9rales\u00a0:',
      '- Pose UNE question claire \u00e0 la fois.',
      '- suggestions = 2\u20134 r\u00e9ponses/intentions cliquables courtes.',
      '- Pour r\u00e9ponses \u00e0 compl\u00e9ter\u00a0: utilise \u2026 (ex. \u00ab\u00a0Je m\'appelle\u2026\u00a0\u00bb).',
      '- Les suggestions de type \u00ab\u00a0passer / plus tard / pas d\'objectif\u00a0\u00bb NE doivent JAMAIS devenir des faits.',
      mode === 'onboarding'
        ? '- Mode onboarding\u00a0: apr\u00e8s ~2\u20133 faits LONG TERME solides, remercie et complete_onboarding.'
        : '- Mode continu\u00a0: sois encore plus s\u00e9lectif pour remember.',
      '- \u00c9vite de reposer les questions d\u00e9j\u00e0 pos\u00e9es.',
      '- INTERDIT d\'inventer des faits non dits par l\'utilisateur.',
      '',
      'Questions d\u00e9j\u00e0 pos\u00e9es\u00a0:',
      JSON.stringify(asked),
      '',
      'M\u00e9moire actuelle\u00a0:',
      JSON.stringify({
        longTerm: {
          summary: view.summary || '',
          facts: Array.isArray(view.facts)
            ? view.facts.map(function (f) {
                return typeof f === 'string' ? f : f && f.text ? f.text : '';
              })
            : []
        },
        shortTerm: {
          boardSummary: view.boardSummary || '',
          notes: Array.isArray(view.shortNotes)
            ? view.shortNotes.map(function (f) {
                return typeof f === 'string' ? f : f && f.text ? f.text : '';
              })
            : []
        },
        onboardingComplete: !!mem.onboardingComplete
      }),
      options.boardDigest
        ? '\nDigest tableau (extrait, contexte COURT TERME seulement)\u00a0:\n' +
          String(options.boardDigest).slice(0, 3500)
        : ''
    ]
      .filter(Boolean)
      .join('\n');

    var messages = [{ role: 'system', content: system }];
    (history || []).forEach(function (entry) {
      if (!entry || !entry.role || !entry.content) return;
      if (entry.role === 'user' || entry.role === 'assistant') {
        messages.push({
          role: entry.role,
          content: String(entry.content)
        });
      }
    });
    messages.push({ role: 'user', content: userTurnWithClock(userText) });

    var t0 = Date.now();
    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 420,
        temperature: 0.5,
        stream: false
      });
      dbgLog(
        'agent',
        'memoryTurn.fetch',
        dbgFetchMeta('non-stream + json', response, { latencyMs: Date.now() - t0 })
      );
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        dbgLog(
          'agent',
          'memoryTurn.fetch',
          dbgFetchMeta('non-stream + json', err, {
            latencyMs: Date.now() - t0,
            fallback: 'json-mode-retry'
          })
        );
        response = await chatCompletions(p, messages, {
          jsonMode: false,
          max_tokens: 420,
          temperature: 0.5,
          stream: false
        });
        dbgLog(
          'agent',
          'memoryTurn.fetch',
          dbgFetchMeta('non-stream (sans json mode)', response, { latencyMs: Date.now() - t0 })
        );
      } else {
        dbgError('agent', 'memoryTurn.fetch', err, { latencyMs: Date.now() - t0 });
        throw err;
      }
    }

    var content = response && response.content ? response.content : '';
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
    if (!data || typeof data !== 'object') {
      return {
        message: content.trim() || 'Je n\'ai pas compris. Peux-tu reformuler?',
        suggestions: [],
        patches: [],
        rawJson: content,
        usage: extractUsageFromRaw(response && response.raw)
      };
    }

    var patches = Array.isArray(data.patches)
      ? data.patches.filter(function (patch) {
          return patch && typeof patch === 'object' && typeof patch.op === 'string';
        })
      : [];

    dbgLog('agent', 'memoryTurn.end', {
      ok: true,
      latencyMs: Date.now() - t0,
      patchCount: patches.length
    });
    return {
      message: stripSpaceBeforePunctuation(
        typeof data.message === 'string' ? data.message.trim() : ''
      ),
      suggestions: normalizeSuggestionList(data.suggestions),
      patches: patches,
      rawJson: content,
      usage: extractUsageFromRaw(response && response.raw)
    };
  }

  // exports
  S.LABEL_SUGGEST_MIN_CONFIDENCE = LABEL_SUGGEST_MIN_CONFIDENCE;
  S.TASK_TYPE_CATALOG = TASK_TYPE_CATALOG;
  S.TASK_TYPE_SUGGEST_MIN_CONFIDENCE = TASK_TYPE_SUGGEST_MIN_CONFIDENCE;
  S.estimateSubtaskDurations = estimateSubtaskDurations;
  S.fallbackBlockedReasonPair = fallbackBlockedReasonPair;
  S.fallbackBlockedReasonText = fallbackBlockedReasonText;
  S.fallbackUnblockSubtaskText = fallbackUnblockSubtaskText;
  S.heuristicLabelSuggestions = heuristicLabelSuggestions;
  S.heuristicSubtaskEstimates = heuristicSubtaskEstimates;
  S.heuristicTaskTypeSuggestions = heuristicTaskTypeSuggestions;
  S.isPureWaitingOnTaskReason = isPureWaitingOnTaskReason;
  S.lowerFrFirst = lowerFrFirst;
  S.memoryTurn = memoryTurn;
  S.normalizeBoardLabelRef = normalizeBoardLabelRef;
  S.normalizeMetricSuggestion = normalizeMetricSuggestion;
  S.normalizeMetricSuggestionList = normalizeMetricSuggestionList;
  S.normalizeProgressSuggestions = normalizeProgressSuggestions;
  S.normalizeSplitBlockedReasonResult = normalizeSplitBlockedReasonResult;
  S.normalizeSplitTaskResult = normalizeSplitTaskResult;
  S.parseDurationMinutes = parseDurationMinutes;
  S.parseMetric = parseMetric;
  S.rewriteLackAsWaitingCause = rewriteLackAsWaitingCause;
  S.splitBlockedReason = splitBlockedReason;
  S.splitTaskTitle = splitTaskTitle;
  S.stripWhyLeadIn = stripWhyLeadIn;
  S.suggestBlockedReasonPair = suggestBlockedReasonPair;
  S.suggestBlockedReasonText = suggestBlockedReasonText;
  S.suggestGoals = suggestGoals;
  S.suggestLabels = suggestLabels;
  S.suggestMetrics = suggestMetrics;
  S.suggestSubtasks = suggestSubtasks;
  S.suggestTaskTypes = suggestTaskTypes;
  S.suggestUnblockSubtaskText = suggestUnblockSubtaskText;
  S.titleMayBeCompound = titleMayBeCompound;
})(typeof window !== 'undefined' ? window : this);
