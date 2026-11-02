/**
 * agent-suggest: part 2 of 3 (fallbackBlockedReasonText).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-suggest.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from other parts (functions, resolved at call time)
  function lowerFrFirst() { return S.lowerFrFirst.apply(this, arguments); }
  function rewriteLackAsWaitingCause() { return S.rewriteLackAsWaitingCause.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function isConfigured() { return S.isConfigured.apply(this, arguments); }
  function normalizeAgentBlockedReason() { return S.normalizeAgentBlockedReason.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function normalizeSuggestionList() { return S.normalizeSuggestionList.apply(this, arguments); }
  function parseAssistantPayload() { return S.parseAssistantPayload.apply(this, arguments); }

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

  // exports
  S.LABEL_SUGGEST_MIN_CONFIDENCE = LABEL_SUGGEST_MIN_CONFIDENCE;
  S.TASK_TYPE_CATALOG = TASK_TYPE_CATALOG;
  S.TASK_TYPE_SUGGEST_MIN_CONFIDENCE = TASK_TYPE_SUGGEST_MIN_CONFIDENCE;
  S.fallbackBlockedReasonPair = fallbackBlockedReasonPair;
  S.fallbackBlockedReasonText = fallbackBlockedReasonText;
  S.fallbackUnblockSubtaskText = fallbackUnblockSubtaskText;
  S.heuristicSubtaskEstimates = heuristicSubtaskEstimates;
  S.isPureWaitingOnTaskReason = isPureWaitingOnTaskReason;
  S.normalizeBoardLabelRef = normalizeBoardLabelRef;
  S.parseDurationMinutes = parseDurationMinutes;
  S.stripWhyLeadIn = stripWhyLeadIn;
  S.suggestBlockedReasonPair = suggestBlockedReasonPair;
  S.suggestBlockedReasonText = suggestBlockedReasonText;
  S.suggestGoals = suggestGoals;
  S.suggestUnblockSubtaskText = suggestUnblockSubtaskText;
})(typeof window !== 'undefined' ? window : this);
