/**
 * Priority Power-Up AI agent — OpenAI-compatible client, member-private
 * provider settings, JSON chat protocol with actionable follow-ups.
 * Exposes window.PriorityAgent (no bundler).
 */
(function (global) {
  'use strict';

  var PROVIDER_STORAGE_KEY = 'agentProvider';
  var DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';
  var DEFAULT_OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

  var PRESETS = {
    openai: {
      id: 'openai',
      label: 'OpenAI',
      baseUrl: DEFAULT_OPENAI_BASE,
      model: 'gpt-4o-mini'
    },
    openrouter: {
      id: 'openrouter',
      label: 'OpenRouter',
      baseUrl: DEFAULT_OPENROUTER_BASE,
      model: 'openai/gpt-4o-mini'
    },
    custom: {
      id: 'custom',
      label: 'Personnalis\u00e9',
      baseUrl: '',
      model: ''
    }
  };

  /** Curated chat models for the OpenAI preset selector (API model ids). */
  var OPENAI_MODELS = [
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
    { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
    { id: 'gpt-5.2', label: 'GPT-5.2' },
    { id: 'gpt-5.1', label: 'GPT-5.1' },
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini' },
    { id: 'gpt-5-nano', label: 'GPT-5 nano' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'o4-mini', label: 'o4-mini' },
    { id: 'o3-mini', label: 'o3-mini' }
  ];

  var TOOL_LABELS = {
    set_priority: 'Priorit\u00e9 mise \u00e0 jour.',
    set_due: '\u00c9ch\u00e9ance mise \u00e0 jour.',
    set_blocked: 'Blocage mis \u00e0 jour.',
    set_progress: 'Progr\u00e8s mis \u00e0 jour.',
    add_subtask: 'Sous-t\u00e2che ajout\u00e9e.',
    toggle_subtask: 'Sous-t\u00e2che mise \u00e0 jour.',
    set_subtask_progress: 'Progr\u00e8s de sous-t\u00e2che mis \u00e0 jour.'
  };

  /** Action-like labels mistakenly used as block reasons → proper cause phrases. */
  var BLOCKED_REASON_ACTION_FIXES = {
    'v\u00e9rifier le mat\u00e9riel':
      'Bloqu\u00e9 \u00e0 cause de la disponibilit\u00e9 du mat\u00e9riel',
    'verifier le materiel':
      'Bloqu\u00e9 \u00e0 cause de la disponibilit\u00e9 du mat\u00e9riel',
    'v\u00e9rifier mat\u00e9riel':
      'Bloqu\u00e9 \u00e0 cause de la disponibilit\u00e9 du mat\u00e9riel',
    'mat\u00e9riel': 'Bloqu\u00e9 \u00e0 cause de la disponibilit\u00e9 du mat\u00e9riel',
    'disponibilit\u00e9 du mat\u00e9riel':
      'Bloqu\u00e9 \u00e0 cause de la disponibilit\u00e9 du mat\u00e9riel',
    'en attente de mat\u00e9riel':
      'Bloqu\u00e9 \u00e0 cause de la disponibilit\u00e9 du mat\u00e9riel'
  };

  var ACTION_VERB_REASON_RE =
    /^(v\u00e9rifier|verifier|commander|obtenir|contacter|demander|chercher|valider|acheter|r\u00e9server|reserver|appeler|envoyer|approuver)\s+/i;

  /**
   * Motifs must describe why the card is blocked — not an action to do.
   * Rewrites known bad phrases and action-verb labels into cause wording.
   */
  function normalizeAgentBlockedReason(reason) {
    if (typeof reason !== 'string') return '';
    var trimmed = reason.trim();
    if (!trimmed) return '';
    var key = trimmed.toLocaleLowerCase('fr-FR');
    if (BLOCKED_REASON_ACTION_FIXES[key]) return BLOCKED_REASON_ACTION_FIXES[key];
    if (/^bloqu\u00e9\s+\u00e0\s+cause\s+de\s+/i.test(trimmed)) return trimmed;
    if (/^en\s+attente\s+(de|d\')/i.test(trimmed)) return trimmed;
    var match = trimmed.match(ACTION_VERB_REASON_RE);
    if (match) {
      var rest = trimmed.slice(match[0].length).trim();
      if (!rest) return trimmed;
      var restKey = rest.toLocaleLowerCase('fr-FR');
      if (BLOCKED_REASON_ACTION_FIXES[restKey]) {
        return BLOCKED_REASON_ACTION_FIXES[restKey];
      }
      if (/^(le|la|les|du|de|des|un|une)\s+mat\u00e9riel\b/i.test(rest)) {
        return 'Bloqu\u00e9 \u00e0 cause de la disponibilit\u00e9 du mat\u00e9riel';
      }
      return 'Bloqu\u00e9 \u00e0 cause de ' + rest;
    }
    return trimmed;
  }

  function ensureFollowUpActionVerb(label, actions) {
    if (!actions || !actions.length) return label;
    // Already starts with an infinitive / action verb — keep it.
    if (
      /^[A-Za-z\u00C0-\u024F]+er\b/i.test(label) ||
      /^[A-Za-z\u00C0-\u024F]+ir\b/i.test(label) ||
      /^(mettre|faire|ouvrir|fermer)\b/i.test(label)
    ) {
      return label;
    }
    var blocked = null;
    for (var i = 0; i < actions.length; i++) {
      if (actions[i].tool === 'set_blocked') {
        blocked = actions[i];
        break;
      }
    }
    if (blocked) {
      var reasons =
        blocked.args && Array.isArray(blocked.args.blockedReasons)
          ? blocked.args.blockedReasons
          : [];
      var reason = reasons[0] ? String(reasons[0]) : '';
      var short = '';
      if (/mat\u00e9riel/i.test(reason) || /mat\u00e9riel/i.test(label)) {
        short = ' (mat\u00e9riel)';
      } else if (reason) {
        short =
          ' (' +
          reason.replace(/^Bloqu\u00e9 \u00e0 cause de\s+/i, '').slice(0, 32) +
          ')';
      }
      return 'Marquer bloqu\u00e9' + short;
    }
    if (actions[0].tool === 'set_due') return 'D\u00e9finir l\'\u00e9ch\u00e9ance';
    if (actions[0].tool === 'set_priority') return 'Mettre \u00e0 jour la priorit\u00e9';
    if (actions[0].tool === 'set_progress') return 'Mettre \u00e0 jour le progr\u00e8s';
    if (actions[0].tool === 'add_subtask') return 'Ajouter une sous-t\u00e2che';
    return label;
  }

  function polishFollowUpActions(actions) {
    return (actions || []).map(function (action) {
      if (!action || action.tool !== 'set_blocked') return action;
      var args = action.args && typeof action.args === 'object' ? action.args : {};
      if (!Array.isArray(args.blockedReasons)) return action;
      var reasons = args.blockedReasons
        .map(normalizeAgentBlockedReason)
        .filter(Boolean);
      return {
        tool: action.tool,
        args: Object.assign({}, args, { blockedReasons: reasons })
      };
    });
  }

  function clampInt(n, min, max, fallback) {
    var v = typeof n === 'number' ? n : parseInt(n, 10);
    if (!isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, Math.round(v)));
  }

  function normalizeBaseUrl(url) {
    if (typeof url !== 'string') return '';
    return url.trim().replace(/\/+$/, '');
  }

  function normalizeProvider(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var presetId = typeof src.preset === 'string' ? src.preset : 'openai';
    if (!PRESETS[presetId]) presetId = 'openai';
    var preset = PRESETS[presetId];
    var baseUrl = normalizeBaseUrl(src.baseUrl) || preset.baseUrl || DEFAULT_OPENAI_BASE;
    var model =
      typeof src.model === 'string' && src.model.trim()
        ? src.model.trim()
        : preset.model || 'gpt-4o-mini';
    var apiKey = typeof src.apiKey === 'string' ? src.apiKey.trim() : '';
    var verifiedFingerprint =
      typeof src.verifiedFingerprint === 'string' ? src.verifiedFingerprint : '';
    return {
      preset: presetId,
      baseUrl: baseUrl,
      model: model,
      apiKey: apiKey,
      verifiedFingerprint: verifiedFingerprint
    };
  }

  function providerFingerprint(provider) {
    var p = normalizeProvider(provider);
    return [p.preset, p.baseUrl, p.model, p.apiKey].join('\u0001');
  }

  function isConfigured(provider) {
    var p = normalizeProvider(provider);
    return !!(p.apiKey && p.baseUrl && p.model);
  }

  function isVerified(provider) {
    var p = normalizeProvider(provider);
    return isConfigured(p) && !!p.verifiedFingerprint && p.verifiedFingerprint === providerFingerprint(p);
  }

  function markVerified(provider) {
    var p = normalizeProvider(provider);
    p.verifiedFingerprint = providerFingerprint(p);
    return p;
  }

  function clearVerified(provider) {
    var p = normalizeProvider(provider);
    p.verifiedFingerprint = '';
    return p;
  }

  function providersEqual(a, b) {
    return providerFingerprint(a) === providerFingerprint(b);
  }

  async function getProvider(t) {
    if (!t || typeof t.get !== 'function') return normalizeProvider(null);
    try {
      var stored = await t.get('member', 'private', PROVIDER_STORAGE_KEY);
      return normalizeProvider(stored);
    } catch (err) {
      console.error('PriorityAgent.getProvider failed', err);
      return normalizeProvider(null);
    }
  }

  async function saveProvider(t, provider) {
    var normalized = normalizeProvider(provider);
    await t.set('member', 'private', PROVIDER_STORAGE_KEY, normalized);
    return normalized;
  }

  function requestHeaders(provider) {
    var p = normalizeProvider(provider);
    var headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + p.apiKey
    };
    if (p.preset === 'openrouter' || /openrouter\.ai/i.test(p.baseUrl)) {
      headers['HTTP-Referer'] =
        (typeof location !== 'undefined' && location.origin) ||
        'https://trello.com';
      headers['X-Title'] = 'Priorit\u00e9 Power-Up';
    }
    return headers;
  }

  function classifyFetchError(err) {
    var msg = (err && err.message) || String(err || '');
    if (/Failed to fetch|NetworkError|CORS|cors|Load failed/i.test(msg)) {
      return {
        code: 'cors_or_network',
        message:
          'Impossible de joindre le fournisseur (r\u00e9seau ou CORS). ' +
          'api.openai.com bloque souvent les appels depuis le navigateur\u00a0: ' +
          'utilisez OpenRouter, une passerelle compatible CORS, ou une URL personnalis\u00e9e.'
      };
    }
    return { code: 'error', message: msg || 'Erreur inconnue' };
  }

  async function apiFetch(provider, path, options) {
    var p = normalizeProvider(provider);
    var url = p.baseUrl + (path.charAt(0) === '/' ? path : '/' + path);
    var opts = options || {};
    var init = {
      method: opts.method || 'GET',
      headers: requestHeaders(p)
    };
    if (opts.body != null) {
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    var res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      var classified = classifyFetchError(err);
      var e = new Error(classified.message);
      e.code = classified.code;
      e.cause = err;
      throw e;
    }
    var text = '';
    try {
      text = await res.text();
    } catch (e) {
      text = '';
    }
    var data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { raw: text };
      }
    }
    return { ok: res.ok, status: res.status, data: data, text: text };
  }

  function todayIsoLocal() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function buildContext(bridge) {
    var ctx = {
      today: todayIsoLocal(),
      cardName: '',
      formula: 'baseline',
      priority: null,
      display: null,
      due: null,
      blocked: null,
      progress: null
    };
    if (!bridge) return ctx;
    if (typeof bridge.getCardName === 'function') {
      try {
        ctx.cardName = bridge.getCardName() || '';
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getFormulaKey === 'function') {
      try {
        ctx.formula = bridge.getFormulaKey() || 'baseline';
      } catch (e) { /* ignore */ }
    }
    var state = null;
    if (typeof bridge.getPriorityState === 'function') {
      try {
        state = bridge.getPriorityState();
      } catch (e) {
        state = null;
      }
    }
    if (state && typeof state === 'object') {
      var priorityEnabled = state.priorityEnabled !== false;
      var dueEnabled = state.dueEnabled !== false;
      var blockedEnabled = !!state.enAttente;
      var blockedReasons = Array.isArray(state.blockedReasons)
        ? state.blockedReasons.filter(function (r) {
            return typeof r === 'string' && r.trim();
          })
        : [];
      ctx.priority = {
        enabled: priorityEnabled,
        // Values below are inactive when enabled=false — do not treat as the live priority.
        urgency: state.urgency,
        impact: state.impact,
        ease: state.ease
      };
      ctx.due = {
        enabled: dueEnabled,
        // dueDate/dueTime are inactive when enabled=false.
        dueDate: dueEnabled ? state.dueDate || null : null,
        dueTime: dueEnabled ? state.dueTime || null : null,
        savedDueDate: !dueEnabled && state.dueDate ? state.dueDate : undefined,
        savedDueTime: !dueEnabled && state.dueTime ? state.dueTime : undefined
      };
      ctx.blocked = {
        // Bloqué section checkbox === enAttente. Card is blocked ONLY when enabled=true.
        enabled: blockedEnabled,
        enAttente: blockedEnabled,
        blockedReasons: blockedEnabled ? blockedReasons.slice() : [],
        // Retained while the section is off — historical only, NOT an active block.
        savedReasons: !blockedEnabled && blockedReasons.length
          ? blockedReasons.slice()
          : undefined
      };
      if (typeof PriorityUI !== 'undefined' && PriorityUI.resolveDisplay) {
        try {
          var formulaKey = ctx.formula;
          var calc =
            PriorityUI.FORMULAS &&
            PriorityUI.FORMULAS[formulaKey] &&
            PriorityUI.FORMULAS[formulaKey].calc
              ? PriorityUI.FORMULAS[formulaKey].calc
              : PriorityUI.FORMULAS && PriorityUI.FORMULAS.baseline
                ? PriorityUI.FORMULAS.baseline.calc
                : null;
          if (calc) {
            var result = calc(state);
            var display = PriorityUI.resolveDisplay(result, state);
            ctx.display = {
              score: display.score,
              label: display.label,
              inutile: !!display.inutile,
              // false when Bloqué is disabled, even if savedReasons exist
              blocked: !!display.blocked,
              dueCountdown: dueEnabled ? display.dueCountdown || null : null,
              duePast: dueEnabled ? !!display.duePast : false,
              dueDate: dueEnabled ? display.dueDate || null : null,
              priorityEnabled: priorityEnabled
            };
          }
        } catch (e) {
          console.error('PriorityAgent.buildContext display failed', e);
        }
      }
    }
    var completion = null;
    if (typeof bridge.getCompletion === 'function') {
      try {
        completion = bridge.getCompletion();
      } catch (e) {
        completion = null;
      }
    }
    if (completion && typeof completion === 'object') {
      var progressEnabled = completion.progressEnabled !== false;
      var progressMeta = null;
      if (
        progressEnabled &&
        typeof CompletionTrello !== 'undefined' &&
        CompletionTrello.computeCardProgress
      ) {
        try {
          progressMeta = CompletionTrello.computeCardProgress(completion);
        } catch (e) {
          progressMeta = null;
        }
      }
      ctx.progress = {
        enabled: progressEnabled,
        cardProgress:
          progressEnabled && !(completion.items && completion.items.length)
            ? typeof completion.progress === 'number'
              ? completion.progress
              : null
            : null,
        percent: progressMeta ? progressMeta.percent : null,
        doneCount: progressMeta ? progressMeta.doneCount : null,
        totalCount: progressMeta ? progressMeta.totalCount : null,
        items: progressEnabled
          ? (completion.items || []).map(function (item) {
              return {
                id: item.id,
                text: item.text,
                done: !!item.done,
                progress: item.progress
              };
            })
          : []
      };
    }
    return ctx;
  }

  function systemPrompt(context) {
    return [
      'Tu es l\'assistant du Power-Up Priorit\u00e9 dans Trello.',
      'Tu r\u00e9ponds toujours en fran\u00e7ais, de fa\u00e7on concise, utile et conversationnelle.',
      'Alignement souple\u00a0: tu aides surtout sur la carte (priorit\u00e9, \u00e9ch\u00e9ance, blocage, progr\u00e8s), mais tu n\'es PAS limit\u00e9 \u00e0 Trello.',
      '- Questions g\u00e9n\u00e9rales ou hors sujet (calculs, culture, blagues, etc.)\u00a0: r\u00e9ponds bri\u00e8vement et normalement. Ne refuse jamais.',
      '- INTERDIT\u00a0: \u00ab\u00a0Je ne peux pas r\u00e9pondre\u00a0\u00bb, \u00ab\u00a0hors de mon domaine\u00a0\u00bb, \u00ab\u00a0je ne traite que Trello\u00a0\u00bb, ou toute reformulation qui \u00e9vite la question.',
      '- Ex.\u00a0: user \u00ab\u00a0c\'est quoi 1+1?\u00a0\u00bb \u2192 {"message":"2.","suggestions":["\u2026"],"followUps":[],"actions":[]}',
      'Si tu ne sais pas (info absente du contexte carte / historique, ou knowledge manquante)\u00a0:',
      '- R\u00e9ponds exactement \u00ab\u00a0Je ne sais pas.\u00a0\u00bb (éventuellement une courte pr\u00e9cision). NE PAS inventer. NE PAS renvoyer la question \u00e0 l\'utilisateur.',
      '- INTERDIT\u00a0: \u00ab\u00a0Pourriez-vous pr\u00e9ciser\u2026?\u00a0\u00bb, \u00ab\u00a0Quels sont les\u2026?\u00a0\u00bb (miroir), ou toute reformulation de la question de l\'utilisateur.',
      '- Ex.\u00a0: user \u00ab\u00a0Quels liens 404 doivent \u00eatre corrig\u00e9s?\u00a0\u00bb (rien dans le contexte) \u2192 {"message":"Je ne sais pas.","suggestions":["\u2026"],"followUps":[],"actions":[]}',
      'INTERDIT dans message\u00a0: questions vagues du type \u00ab\u00a0Que souhaitez-vous faire maintenant?\u00a0\u00bb, \u00ab\u00a0Comment puis-je vous aider?\u00a0\u00bb, \u00ab\u00a0Autre chose?\u00a0\u00bb. Confirme bri\u00e8vement et arr\u00eate-toi\u00a0; les suggestions suffisent pour la suite.',
      'Tu peux expliquer la priorit\u00e9, l\'\u00e9ch\u00e9ance, le blocage et le progr\u00e8s, et proposer des changements.',
      'R\u00e9ponds UNIQUEMENT avec un objet JSON valide de la forme\u00a0:',
      '{"message":"texte visible","suggestions":["\u2026"],"followUps":[{"label":"\u2026","actions":[{"tool":"nom","args":{...}}]}],"actions":[{"tool":"nom","args":{...}}]}',
      'Questions de clarification (uniquement pour une action incompl\u00e8te)\u00a0:',
      '- Seulement si l\'utilisateur veut FAIRE quelque chose via un outil et qu\'il manque un param\u00e8tre (ex. \u00ab\u00a0Ajouter une sous-t\u00e2che\u00a0\u00bb sans nom). Pas pour les questions factuelles.',
      '- Si une demande d\'action est incompl\u00e8te, NE PAS inventer la valeur et NE PAS appeler l\'outil.',
      '- Pose UNE question courte dans message (ex. \u00ab\u00a0Quel est le nom de la sous-t\u00e2che?\u00a0\u00bb). actions=[], followUps=[].',
      '- Dans suggestions, propose 2\u20134 r\u00e9ponses possibles (noms d\'exemple, dates, etc.) pour aider \u00e0 r\u00e9pondre.',
      '- Quand l\'utilisateur r\u00e9pond avec l\'info manquante, applique imm\u00e9diatement via le champ actions (pas seulement followUps).',
      '- Ex. tour 1\u00a0: user \u00ab\u00a0Ajouter une sous-t\u00e2che\u00a0\u00bb \u2192 {"message":"Quel est le nom de la sous-t\u00e2che?","suggestions":["V\u00e9rifier le stock","Contacter le client"],"followUps":[],"actions":[]}',
      '- Ex. tour 2\u00a0: user \u00ab\u00a0Commander le mat\u00e9riel\u00a0\u00bb \u2192 {"message":"Sous-t\u00e2che \u00ab\u00a0Commander le mat\u00e9riel\u00a0\u00bb ajout\u00e9e.","suggestions":["\u2026"],"followUps":[],"actions":[{"tool":"add_subtask","args":{"text":"Commander le mat\u00e9riel"}}]}',
      '- M\u00eame logique pour l\'\u00e9ch\u00e9ance (demander la date si absente). EXCEPTION\u00a0: le blocage (voir ci-dessous).',
      'Bloquer une carte (agir d\'abord, motif ensuite)\u00a0:',
      '- Si l\'utilisateur demande de marquer bloqu\u00e9 / en attente SANS donner de motif\u00a0: APPLIQUE TOUT DE SUITE set_blocked avec enAttente:true (sans blockedReasons), puis confirme de fa\u00e7on conversationnelle et demande le motif en option.',
      '- Ex. tour 1\u00a0: user \u00ab\u00a0Marquer la t\u00e2che comme bloqu\u00e9e\u00a0\u00bb \u2192 {"message":"Okay, bloqu\u00e9. Quel est le motif?","suggestions":["En attente d\'une approbation","En attente d\'une r\u00e9ponse","Bloqu\u00e9 \u00e0 cause du mat\u00e9riel"],"followUps":[],"actions":[{"tool":"set_blocked","args":{"enAttente":true}}]}',
      '- Ne JAMAIS r\u00e9pondre seulement \u00ab\u00a0Quel est le motif?\u00a0\u00bb sans avoir d\'abord appel\u00e9 set_blocked.',
      '- Si l\'utilisateur donne ensuite un motif\u00a0: applique set_blocked avec blockedReasons (enAttente reste true) et confirme bri\u00e8vement.',
      '- Ex. tour 2\u00a0: user \u00ab\u00a0En attente d\'une approbation\u00a0\u00bb \u2192 {"message":"Motif enregistr\u00e9\u00a0: en attente d\'une approbation.","suggestions":["\u2026"],"followUps":[],"actions":[{"tool":"set_blocked","args":{"enAttente":true,"blockedReasons":["En attente d\'une approbation"]}}]}',
      '- Si l\'utilisateur refuse le motif (ex. \u00ab\u00a0rien\u00a0\u00bb, \u00ab\u00a0aucun\u00a0\u00bb, \u00ab\u00a0non\u00a0\u00bb, \u00ab\u00a0pas besoin\u00a0\u00bb, \u00ab\u00a0skip\u00a0\u00bb)\u00a0: r\u00e9ponds simplement \u00ab\u00a0Okay.\u00a0\u00bb, actions=[], NE PAS reposer la question, NE PAS exiger de motif. La carte reste bloqu\u00e9e sans motif.',
      '- Ex. refus\u00a0: user \u00ab\u00a0rien\u00a0\u00bb \u2192 {"message":"Okay.","suggestions":["\u2026"],"followUps":[],"actions":[]}',
      '- INTERDIT\u00a0: boucler sur \u00ab\u00a0Quel est le motif?\u00a0\u00bb, \u00ab\u00a0Veuillez fournir un motif\u00a0\u00bb, ou toute formulation qui force / insiste. Une seule invitation max\u00a0; ensuite on respecte le choix.',
      '- Si l\'utilisateur ignore la question, change de sujet, ou donne une autre consigne\u00a0: NE PAS forcer le motif, NE PAS reposer la question\u00a0; traite la nouvelle demande. La carte reste bloqu\u00e9e sans motif.',
      '- Si le motif est d\u00e9j\u00e0 dans la demande initiale (ex. \u00ab\u00a0Bloquer \u00e0 cause du mat\u00e9riel\u00a0\u00bb)\u00a0: set_blocked avec enAttente:true + blockedReasons en un seul tour, sans question inutile.',
      'R\u00e8gles suggestions (obligatoire)\u00a0:',
      '- Toujours proposer 2 \u00e0 4 formulations courtes en fran\u00e7ais (questions OU r\u00e9ponses \u00e0 ta question de clarification).',
      '- Ancr\u00e9es dans le contexte carte (sections enabled, \u00e9ch\u00e9ance, blocage, progr\u00e8s).',
      '- Elles REMPLACENT les suggestions pr\u00e9c\u00e9dentes\u00a0: varie-les selon ta derni\u00e8re r\u00e9ponse.',
      '- Pas de num\u00e9rotation, pas de guillemets autour.',
      'R\u00e8gles actions (appliqu\u00e9es automatiquement)\u00a0:',
      '- 0 \u00e0 3 outils \u00e0 ex\u00e9cuter tout de suite quand tu as toutes les infos requises (ou quand l\'action peut \u00eatre faite sans motif, ex. bloquer).',
      '- Ne jamais inclure un outil incomplet (ex. add_subtask sans text non vide).',
      'R\u00e8gles followUps\u00a0:',
      '- 0 \u00e0 3 actions rapides optionnelles (boutons\u00a0; le clic applique sans nouvel appel).',
      '- Si actions (du followUp) est non vide\u00a0: le label EST une action \u2192 commence toujours par un verbe \u00e0 l\'infinitif (Marquer, D\u00e9finir, Ajouter\u2026). Ex.\u00a0: "Marquer bloqu\u00e9 (mat\u00e9riel)". Jamais un nom seul ni une question.',
      '- Pr\u00e9f\u00e8re le champ actions (auto) quand tu viens de recevoir la r\u00e9ponse \u00e0 ta question\u00a0; followUps pour des choix encore optionnels.',
      '- Si actions est [] , le label est renvoy\u00e9 comme message utilisateur (pr\u00e9f\u00e8re suggestions pour \u00e7a).',
      'Motifs de blocage (blockedReasons) \u2014 tr\u00e8s important\u00a0:',
      '- Un motif d\u00e9crit POURQUOI la carte est bloqu\u00e9e (cause / \u00e9tat), pas une t\u00e2che \u00e0 faire.',
      '- Formule pr\u00e9f\u00e9r\u00e9e\u00a0: "Bloqu\u00e9 \u00e0 cause de \u2026" ou "En attente de \u2026".',
      '- INTERDIT\u00a0: infinitifs d\'action comme "V\u00e9rifier le mat\u00e9riel", "Contacter le client", "Commander du stock".',
      '- Exemple mat\u00e9riel\u00a0: label d\'action "Marquer bloqu\u00e9 (mat\u00e9riel)" + motif "Bloqu\u00e9 \u00e0 cause de la disponibilit\u00e9 du mat\u00e9riel" (PAS "V\u00e9rifier le mat\u00e9riel" comme motif).',
      '- Le motif est optionnel\u00a0: on peut bloquer sans blockedReasons. Ne jamais exiger un motif ni boucler dessus.',
      'Sections activables (tr\u00e8s important)\u00a0:',
      '- Chaque bloc a un champ enabled. Si enabled=false, la section est d\u00e9sactiv\u00e9e\u00a0: les valeurs saved* / latentes NE comptent PAS.',
      '- Priorit\u00e9 active seulement si priority.enabled=true.',
      '- \u00c9ch\u00e9ance active seulement si due.enabled=true (sinon dueDate/dueTime actifs sont null).',
      '- Bloqu\u00e9 / en attente actif SEULEMENT si blocked.enabled=true (identique \u00e0 enAttente).',
      '- Si blocked.enabled=false, la carte N\'EST PAS bloqu\u00e9e, m\u00eame si savedReasons contient d\'anciens motifs.',
      '- Progr\u00e8s actif seulement si progress.enabled=true.',
      '- Pour activer/d\u00e9sactiver\u00a0: priorityEnabled, dueEnabled, enAttente (Bloqu\u00e9), progressEnabled.',
      '- Pour marquer bloqu\u00e9\u00a0: set_blocked avec enAttente:true tout de suite (motifs ensuite si fournis). Ne dis jamais que c\'est d\u00e9j\u00e0 bloqu\u00e9 si enabled=false.',
      'Outils disponibles\u00a0:',
      '- set_priority: { urgency?:0-4, impact?:0-4, ease?:1-5, priorityEnabled?:boolean }',
      '- set_due: { dueDate?: "YYYY-MM-DD"|null, dueTime?: "HH:MM"|null, dueEnabled?: boolean }',
      '- set_blocked: { enAttente?: boolean, blockedReasons?: string[] } (enAttente:true seul suffit pour bloquer\u00a0; fournir des motifs active aussi Bloqu\u00e9)',
      '- set_progress: { progress?:0-100, progressEnabled?: boolean } (progress carte si pas de sous-t\u00e2ches)',
      '- add_subtask: { text: string } (text obligatoire, non vide)',
      '- toggle_subtask: { id: string, done?: boolean }',
      '- set_subtask_progress: { id: string, progress: 0-100 }',
      'Contexte carte actuel (JSON)\u00a0:',
      JSON.stringify(context)
    ].join('\n');
  }

  /** Drop tool calls that are missing required args (e.g. empty add_subtask). */
  function isCompleteAction(action) {
    if (!action || typeof action.tool !== 'string' || !action.tool) return false;
    var args = action.args && typeof action.args === 'object' ? action.args : {};
    if (action.tool === 'add_subtask') {
      return typeof args.text === 'string' && !!args.text.trim();
    }
    if (action.tool === 'toggle_subtask' || action.tool === 'set_subtask_progress') {
      return typeof args.id === 'string' && !!args.id;
    }
    return true;
  }

  function normalizeActionList(raw) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    raw.forEach(function (action) {
      if (!action || typeof action !== 'object') return;
      var tool = typeof action.tool === 'string' ? action.tool.trim() : '';
      if (!tool) return;
      var item = {
        tool: tool,
        args: action.args && typeof action.args === 'object' ? action.args : {}
      };
      if (!isCompleteAction(item)) return;
      out.push(item);
    });
    return polishFollowUpActions(out).slice(0, 3);
  }

  function normalizeSuggestionList(raw) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    raw.forEach(function (item) {
      var text = '';
      if (typeof item === 'string') text = item.trim();
      else if (item && typeof item === 'object' && typeof item.label === 'string') {
        text = item.label.trim();
      }
      if (!text) return;
      if (out.indexOf(text) >= 0) return;
      out.push(text);
    });
    return out.slice(0, 4);
  }

  function suggestionsFromFollowUps(followUps) {
    var out = [];
    (followUps || []).forEach(function (fu) {
      if (!fu || !fu.label) return;
      if (fu.actions && fu.actions.length) return;
      out.push(fu.label);
    });
    return out.slice(0, 4);
  }

  /** Rough token estimate when the provider omits usage (≈4 chars / token). */
  function estimateTokensFromText(text) {
    var s = typeof text === 'string' ? text : '';
    if (!s) return 0;
    return Math.max(1, Math.ceil(s.length / 4));
  }

  function estimateMessagesTokens(messages) {
    var total = 0;
    (messages || []).forEach(function (m) {
      if (!m) return;
      total += estimateTokensFromText(m.role || '');
      total += estimateTokensFromText(m.content || '');
      total += 4; // per-message overhead
    });
    return total;
  }

  /**
   * Approximate context window by model id (best-effort; OpenAI-compatible ids vary).
   */
  function contextWindowForModel(modelId) {
    var id = (modelId || '').toLowerCase();
    if (/gpt-4\.1|gpt-5\.4|gpt-5\.2|gpt-5\.1|gpt-5(?!-)/.test(id)) return 1048576;
    if (/gpt-5-mini|gpt-5-nano|gpt-4o|o4-mini|o3-mini|gpt-4\.1-mini|gpt-4\.1-nano/.test(id)) {
      return 128000;
    }
    if (/claude.*opus|claude.*sonnet|claude-3/.test(id)) return 200000;
    if (/gemini.*pro|gemini.*flash/.test(id)) return 1000000;
    return 128000;
  }

  /**
   * Approx USD per 1M tokens { input, output }. Matched longest suffix first via includes.
   * Used only for a rough UI estimate — not billing-accurate.
   */
  var MODEL_PRICE_PER_M = [
    { match: 'gpt-5.4-nano', input: 0.1, output: 0.4 },
    { match: 'gpt-5.4-mini', input: 0.25, output: 2.0 },
    { match: 'gpt-5.4', input: 1.25, output: 10.0 },
    { match: 'gpt-5-nano', input: 0.05, output: 0.4 },
    { match: 'gpt-5-mini', input: 0.25, output: 2.0 },
    { match: 'gpt-5.2', input: 1.25, output: 10.0 },
    { match: 'gpt-5.1', input: 1.25, output: 10.0 },
    { match: 'gpt-5', input: 1.25, output: 10.0 },
    { match: 'gpt-4.1-nano', input: 0.1, output: 0.4 },
    { match: 'gpt-4.1-mini', input: 0.4, output: 1.6 },
    { match: 'gpt-4.1', input: 2.0, output: 8.0 },
    { match: 'gpt-4o-mini', input: 0.15, output: 0.6 },
    { match: 'gpt-4o', input: 2.5, output: 10.0 },
    { match: 'o4-mini', input: 1.1, output: 4.4 },
    { match: 'o3-mini', input: 1.1, output: 4.4 },
    { match: 'claude-3-5-haiku', input: 0.8, output: 4.0 },
    { match: 'claude-3-5-sonnet', input: 3.0, output: 15.0 },
    { match: 'claude-sonnet', input: 3.0, output: 15.0 },
    { match: 'claude-opus', input: 15.0, output: 75.0 },
    { match: 'gemini-2.0-flash', input: 0.1, output: 0.4 },
    { match: 'gemini-flash', input: 0.1, output: 0.4 }
  ];

  function pricingForModel(modelId) {
    var id = (modelId || '').toLowerCase();
    for (var i = 0; i < MODEL_PRICE_PER_M.length; i++) {
      if (id.indexOf(MODEL_PRICE_PER_M[i].match) >= 0) {
        return MODEL_PRICE_PER_M[i];
      }
    }
    return { match: 'default', input: 0.15, output: 0.6 };
  }

  function estimateCostUsd(modelId, promptTokens, completionTokens) {
    var price = pricingForModel(modelId);
    var cost =
      (Math.max(0, promptTokens || 0) / 1e6) * price.input +
      (Math.max(0, completionTokens || 0) / 1e6) * price.output;
    return cost;
  }

  function extractUsageFromRaw(raw, messages, content, modelId) {
    var usage = (raw && raw.usage) || null;
    var promptTokens = usage && typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null;
    var completionTokens =
      usage && typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null;
    var totalTokens = usage && typeof usage.total_tokens === 'number' ? usage.total_tokens : null;
    var cachedTokens = null;
    var reasoningTokens = null;
    if (usage && usage.prompt_tokens_details && typeof usage.prompt_tokens_details.cached_tokens === 'number') {
      cachedTokens = usage.prompt_tokens_details.cached_tokens;
    }
    if (
      usage &&
      usage.completion_tokens_details &&
      typeof usage.completion_tokens_details.reasoning_tokens === 'number'
    ) {
      reasoningTokens = usage.completion_tokens_details.reasoning_tokens;
    }
    var estimated = promptTokens == null || completionTokens == null;
    if (promptTokens == null) promptTokens = estimateMessagesTokens(messages);
    if (completionTokens == null) completionTokens = estimateTokensFromText(content || '');
    if (totalTokens == null) totalTokens = promptTokens + completionTokens;

    var finishReason = null;
    if (raw && raw.choices && raw.choices[0] && raw.choices[0].finish_reason) {
      finishReason = String(raw.choices[0].finish_reason);
    }
    var resolvedModel =
      (raw && typeof raw.model === 'string' && raw.model) || modelId || '';

    var systemChars = 0;
    var historyChars = 0;
    var userChars = 0;
    (messages || []).forEach(function (m) {
      if (!m) return;
      var len = String(m.content || '').length;
      if (m.role === 'system') systemChars += len;
      else if (m.role === 'user') userChars += len;
      else historyChars += len;
    });
    var contextTokens = estimated ? estimateMessagesTokens(messages) : promptTokens;
    var windowTokens = contextWindowForModel(resolvedModel);
    var fillPercent =
      windowTokens > 0 ? Math.min(100, Math.round((contextTokens / windowTokens) * 1000) / 10) : 0;

    return {
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      totalTokens: totalTokens,
      cachedTokens: cachedTokens,
      reasoningTokens: reasoningTokens,
      estimated: estimated,
      costUsd: estimateCostUsd(resolvedModel, promptTokens, completionTokens),
      model: resolvedModel,
      finishReason: finishReason,
      context: {
        requestTokens: contextTokens,
        windowTokens: windowTokens,
        fillPercent: fillPercent,
        messageCount: (messages || []).length,
        systemChars: systemChars,
        historyChars: historyChars,
        userChars: userChars
      }
    };
  }

  function parseAssistantPayload(content) {
    var text = typeof content === 'string' ? content.trim() : '';
    if (!text) {
      return {
        message: 'R\u00e9ponse vide du fournisseur.',
        followUps: [],
        suggestions: [],
        actions: []
      };
    }
    var jsonText = text;
    var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) jsonText = fence[1].trim();
    else {
      var start = text.indexOf('{');
      var end = text.lastIndexOf('}');
      if (start >= 0 && end > start) jsonText = text.slice(start, end + 1);
    }
    try {
      var parsed = JSON.parse(jsonText);
      var message =
        typeof parsed.message === 'string' && parsed.message.trim()
          ? parsed.message.trim()
          : text;
      var followUps = [];
      if (Array.isArray(parsed.followUps)) {
        parsed.followUps.forEach(function (fu) {
          if (!fu || typeof fu !== 'object') return;
          var label = typeof fu.label === 'string' ? fu.label.trim() : '';
          if (!label) return;
          var actions = [];
          if (Array.isArray(fu.actions)) {
            fu.actions.forEach(function (action) {
              if (!action || typeof action !== 'object') return;
              var tool = typeof action.tool === 'string' ? action.tool.trim() : '';
              if (!tool) return;
              var item = {
                tool: tool,
                args: action.args && typeof action.args === 'object' ? action.args : {}
              };
              if (!isCompleteAction(item)) return;
              actions.push(item);
            });
          }
          actions = polishFollowUpActions(actions);
          label = ensureFollowUpActionVerb(label, actions);
          followUps.push({ label: label, actions: actions });
        });
      }
      followUps = followUps.slice(0, 4);
      var suggestions = normalizeSuggestionList(parsed.suggestions);
      if (!suggestions.length) {
        suggestions = suggestionsFromFollowUps(followUps);
      }
      var actions = normalizeActionList(parsed.actions);
      return {
        message: message,
        followUps: followUps,
        suggestions: suggestions,
        actions: actions
      };
    } catch (e) {
      return { message: text, followUps: [], suggestions: [], actions: [] };
    }
  }

  /**
   * Pull the visible `message` string out of a partial JSON assistant payload
   * while tokens are still arriving. Falls back to plain text when the stream
   * is not structured as JSON.
   */
  function extractStreamingMessage(accumulated) {
    var text = typeof accumulated === 'string' ? accumulated : '';
    if (!text) return '';
    var trimmed = text.replace(/^\s+/, '');
    var looksJson =
      trimmed.charAt(0) === '{' ||
      /^```/.test(trimmed) ||
      /"message"\s*:/.test(trimmed);
    if (!looksJson) return text;

    var key = trimmed.match(/"message"\s*:\s*"/);
    if (!key) return '';
    var i = key.index + key[0].length;
    var out = '';
    while (i < trimmed.length) {
      var ch = trimmed.charAt(i);
      if (ch === '"') break;
      if (ch === '\\') {
        if (i + 1 >= trimmed.length) break; // escape still incomplete
        var next = trimmed.charAt(i + 1);
        if (next === 'n') out += '\n';
        else if (next === 'r') out += '\r';
        else if (next === 't') out += '\t';
        else if (next === '"' || next === '\\' || next === '/') out += next;
        else if (next === 'u' && i + 5 < trimmed.length) {
          var hex = trimmed.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 6;
            continue;
          }
          break;
        } else {
          out += next;
        }
        i += 2;
        continue;
      }
      out += ch;
      i += 1;
    }
    return out;
  }

  function throwHttpError(result) {
    var errMsg =
      (result.data &&
        result.data.error &&
        (result.data.error.message || result.data.error)) ||
      result.text ||
      'HTTP ' + result.status;
    var err = new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
    err.status = result.status;
    err.code = result.status === 401 || result.status === 403 ? 'auth' : 'http';
    throw err;
  }

  /**
   * OpenAI-compatible SSE reader for chat.completions with stream:true.
   * Calls onDelta(deltaText, accumulated) for each content token.
   */
  async function readSseChatStream(res, onDelta) {
    var content = '';
    var usage = null;
    var model = null;
    var finishReason = null;
    var lastChunk = null;

    function handleChunk(chunk) {
      if (!chunk || typeof chunk !== 'object') return;
      lastChunk = chunk;
      if (typeof chunk.model === 'string' && chunk.model) model = chunk.model;
      if (chunk.usage && typeof chunk.usage === 'object') usage = chunk.usage;
      var choice = chunk.choices && chunk.choices[0] ? chunk.choices[0] : null;
      if (!choice) return;
      if (choice.finish_reason) finishReason = String(choice.finish_reason);
      var delta = choice.delta || null;
      var piece =
        delta && typeof delta.content === 'string'
          ? delta.content
          : choice.message && typeof choice.message.content === 'string'
            ? choice.message.content
            : '';
      if (!piece) return;
      content += piece;
      if (typeof onDelta === 'function') {
        try {
          onDelta(piece, content);
        } catch (cbErr) {
          console.error('chat stream onDelta failed', cbErr);
        }
      }
    }

    function consumeSseBlock(block) {
      var lines = block.split(/\r?\n/);
      var dataParts = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line) continue;
        if (line.charAt(0) === ':') continue; // comment / keepalive
        if (line.indexOf('data:') === 0) {
          dataParts.push(line.slice(5).replace(/^ /, ''));
        }
      }
      if (!dataParts.length) return;
      var payload = dataParts.join('\n').trim();
      if (!payload || payload === '[DONE]') return;
      try {
        handleChunk(JSON.parse(payload));
      } catch (e) {
        // Ignore partial/malformed SSE payloads.
      }
    }

    if (!res.body || typeof res.body.getReader !== 'function') {
      var fallbackText = await res.text();
      fallbackText.split(/\n\n|\r\n\r\n/).forEach(consumeSseBlock);
    } else {
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      while (true) {
        var read = await reader.read();
        if (read.done) break;
        buffer += decoder.decode(read.value, { stream: true });
        var parts = buffer.split(/\n\n|\r\n\r\n/);
        buffer = parts.pop();
        parts.forEach(consumeSseBlock);
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        buffer.split(/\n\n|\r\n\r\n/).forEach(consumeSseBlock);
      }
    }

    return {
      content: content,
      raw: {
        model: model || (lastChunk && lastChunk.model) || undefined,
        choices: [
          {
            finish_reason: finishReason || 'stop',
            message: { role: 'assistant', content: content }
          }
        ],
        usage: usage || undefined
      }
    };
  }

  async function chatCompletions(provider, messages, options) {
    var p = normalizeProvider(provider);
    var opts = options || {};
    var stream = !!opts.stream;
    var onDelta = typeof opts.onDelta === 'function' ? opts.onDelta : null;
    var body = {
      model: p.model,
      messages: messages,
      temperature: opts.temperature != null ? opts.temperature : 0.3
    };
    if (opts.jsonMode !== false) {
      body.response_format = { type: 'json_object' };
    }
    if (opts.max_tokens != null) {
      body.max_tokens = opts.max_tokens;
    }
    if (stream) {
      body.stream = true;
      if (opts.includeUsage !== false) {
        body.stream_options = { include_usage: true };
      }
    }

    if (!stream) {
      var result = await apiFetch(p, '/chat/completions', {
        method: 'POST',
        body: body
      });
      if (!result.ok) throwHttpError(result);
      var choice =
        result.data &&
        result.data.choices &&
        result.data.choices[0] &&
        result.data.choices[0].message
          ? result.data.choices[0].message
          : null;
      var content = choice && typeof choice.content === 'string' ? choice.content : '';
      return { content: content, raw: result.data };
    }

    var url = p.baseUrl + '/chat/completions';
    var res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: requestHeaders(p),
        body: JSON.stringify(body)
      });
    } catch (err) {
      var classified = classifyFetchError(err);
      var e = new Error(classified.message);
      e.code = classified.code;
      e.cause = err;
      throw e;
    }

    if (!res.ok) {
      var text = '';
      try {
        text = await res.text();
      } catch (readErr) {
        text = '';
      }
      var data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          data = { raw: text };
        }
      }
      // Some gateways reject stream_options — retry once without it.
      if (
        body.stream_options &&
        /stream_options|include_usage|unrecognized|unknown/i.test(text || '')
      ) {
        delete body.stream_options;
        return chatCompletions(p, messages, Object.assign({}, opts, { includeUsage: false }));
      }
      throwHttpError({ ok: false, status: res.status, data: data, text: text });
    }

    return readSseChatStream(res, onDelta);
  }

  /**
   * @param {object} [options]
   * @param {(visibleMessage: string, accumulatedRaw: string) => void} [options.onDelta]
   *   Called as tokens arrive with the best-effort visible assistant message.
   */
  async function chatTurn(provider, history, bridge, userText, options) {
    options = options || {};
    var onDelta = typeof options.onDelta === 'function' ? options.onDelta : null;
    var p = normalizeProvider(provider);
    var context = buildContext(bridge);
    var messages = [
      { role: 'system', content: systemPrompt(context) }
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
    messages.push({ role: 'user', content: String(userText || '').trim() });

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
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        stream: true,
        onDelta: function (_piece, accumulated) {
          notifyVisible(accumulated);
        }
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        response = await chatCompletions(p, messages, {
          jsonMode: false,
          stream: true,
          onDelta: function (_piece, accumulated) {
            notifyVisible(accumulated);
          }
        });
      } else if (err && /stream/i.test((err && err.message) || '')) {
        // Provider rejected streaming — fall back to a blocking call.
        try {
          response = await chatCompletions(p, messages, { jsonMode: true, stream: false });
        } catch (err2) {
          if (err2 && err2.message && /response_format|json_object|json mode/i.test(err2.message)) {
            response = await chatCompletions(p, messages, { jsonMode: false, stream: false });
          } else {
            throw err2;
          }
        }
        notifyVisible(response.content);
      } else {
        throw err;
      }
    }
    var latencyMs = Date.now() - t0;
    var parsed = parseAssistantPayload(response.content);
    if (onDelta && parsed.message) {
      try {
        onDelta(parsed.message, response.content);
      } catch (finalCbErr) {
        console.error('chatTurn final onDelta failed', finalCbErr);
      }
    }
    var usage = extractUsageFromRaw(response.raw, messages, response.content, p.model);
    usage.latencyMs = latencyMs;
    usage.historyTurns = (history || []).length;
    return {
      message: parsed.message,
      followUps: parsed.followUps,
      suggestions: parsed.suggestions,
      actions: parsed.actions || [],
      rawJson: response.content,
      context: context,
      usage: usage
    };
  }

  /**
   * Lightweight call: AI-generated question chips for the card (opening state
   * or refresh after structural changes). Returns string[].
   */
  async function suggestQuestions(provider, bridge, options) {
    options = options || {};
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var context = buildContext(bridge);
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
          'Tu sugg\u00e8res des questions ou intentions pour l\'assistant Priorit\u00e9 Trello.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":["...","...","..."]}',
          '2 \u00e0 4 formulations courtes en fran\u00e7ais, ancr\u00e9es dans le contexte.',
          'Tu peux inclure des intentions d\'action (ex. \u00ab\u00a0Ajouter une sous-t\u00e2che\u00a0\u00bb)\u00a0: l\'assistant posera ensuite les questions manquantes.',
          'Respecte enabled=false des sections (ne suppose pas un blocage/une \u00e9ch\u00e9ance active si d\u00e9sactiv\u00e9).',
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
          'Propose des questions utiles que l\'utilisateur pourrait poser maintenant sur cette carte.'
      }
    ];
    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 180,
        temperature: 0.7
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        response = await chatCompletions(p, messages, {
          jsonMode: false,
          max_tokens: 180,
          temperature: 0.7
        });
      } else {
        throw err;
      }
    }
    var parsed = parseAssistantPayload(response.content);
    if (parsed.suggestions && parsed.suggestions.length) return parsed.suggestions;
    try {
      var raw = JSON.parse(response.content);
      return normalizeSuggestionList(raw.suggestions || raw.questions);
    } catch (e) {
      return [];
    }
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

  function executeAction(bridge, action) {
    if (!bridge || !action || !action.tool) {
      return { ok: false, error: 'Action invalide' };
    }
    var tool = action.tool;
    var args = action.args && typeof action.args === 'object' ? action.args : {};
    try {
      if (tool === 'set_priority') {
        var partial = {};
        if (args.urgency != null) partial.urgency = clampInt(args.urgency, 0, 4, 0);
        if (args.impact != null) partial.impact = clampInt(args.impact, 0, 4, 0);
        if (args.ease != null) partial.ease = clampInt(args.ease, 1, 5, 3);
        if (args.priorityEnabled != null) partial.priorityEnabled = !!args.priorityEnabled;
        if (!Object.keys(partial).length) {
          return { ok: false, error: 'Aucun champ priorit\u00e9 \u00e0 modifier' };
        }
        bridge.applyPriority(partial);
        return { ok: true, summary: TOOL_LABELS.set_priority };
      }
      if (tool === 'set_due') {
        var duePartial = {};
        if (Object.prototype.hasOwnProperty.call(args, 'dueDate')) {
          var dueDate = validateDueDate(args.dueDate);
          if (dueDate === undefined) {
            return { ok: false, error: 'dueDate invalide (YYYY-MM-DD)' };
          }
          duePartial.dueDate = dueDate || '';
        }
        if (Object.prototype.hasOwnProperty.call(args, 'dueTime')) {
          var dueTime = validateDueTime(args.dueTime);
          if (dueTime === undefined) {
            return { ok: false, error: 'dueTime invalide (HH:MM)' };
          }
          duePartial.dueTime = dueTime || '';
        }
        if (args.dueEnabled != null) duePartial.dueEnabled = !!args.dueEnabled;
        if (!Object.keys(duePartial).length) {
          return { ok: false, error: 'Aucun champ \u00e9ch\u00e9ance \u00e0 modifier' };
        }
        bridge.applyPriority(duePartial);
        return { ok: true, summary: TOOL_LABELS.set_due };
      }
      if (tool === 'set_blocked') {
        var blockedPartial = {};
        if (Array.isArray(args.blockedReasons)) {
          blockedPartial.blockedReasons = args.blockedReasons
            .filter(function (r) {
              return typeof r === 'string' && r.trim();
            })
            .map(function (r) {
              return normalizeAgentBlockedReason(r);
            })
            .filter(Boolean);
        }
        if (args.enAttente != null) {
          blockedPartial.enAttente = !!args.enAttente;
        } else if (
          blockedPartial.blockedReasons &&
          blockedPartial.blockedReasons.length
        ) {
          // Providing reasons without enAttente implies enabling the Bloqué section.
          blockedPartial.enAttente = true;
        }
        if (!Object.keys(blockedPartial).length) {
          return { ok: false, error: 'Aucun champ blocage \u00e0 modifier' };
        }
        bridge.applyPriority(blockedPartial);
        return { ok: true, summary: TOOL_LABELS.set_blocked };
      }
      if (tool === 'set_progress') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, error: 'Progr\u00e8s indisponible' };
        }
        var current =
          typeof bridge.getCompletion === 'function' ? bridge.getCompletion() : { items: [] };
        var next = Object.assign({}, current);
        if (args.progressEnabled != null) {
          if (args.progressEnabled === false) next.progressEnabled = false;
          else delete next.progressEnabled;
        }
        if (args.progress != null) {
          next.progress = clampInt(args.progress, 0, 100, 0);
        }
        bridge.applyCompletion(next);
        return { ok: true, summary: TOOL_LABELS.set_progress };
      }
      if (tool === 'add_subtask') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, error: 'Progr\u00e8s indisponible' };
        }
        var text = typeof args.text === 'string' ? args.text.trim() : '';
        if (!text) return { ok: false, error: 'Texte de sous-t\u00e2che requis' };
        var data =
          typeof bridge.getCompletion === 'function' ? bridge.getCompletion() : { items: [] };
        var items = (data.items || []).slice();
        var id =
          'agent-' +
          Date.now().toString(36) +
          '-' +
          Math.random().toString(36).slice(2, 8);
        items.push({ id: id, text: text, done: false, progress: 0 });
        var added = Object.assign({}, data, { items: items });
        delete added.progress;
        if (added.progressEnabled === false) delete added.progressEnabled;
        bridge.applyCompletion(added);
        return { ok: true, summary: TOOL_LABELS.add_subtask, id: id };
      }
      if (tool === 'toggle_subtask' || tool === 'set_subtask_progress') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, error: 'Progr\u00e8s indisponible' };
        }
        var targetId = typeof args.id === 'string' ? args.id : '';
        if (!targetId) return { ok: false, error: 'id de sous-t\u00e2che requis' };
        var base =
          typeof bridge.getCompletion === 'function' ? bridge.getCompletion() : { items: [] };
        var found = false;
        var nextItems = (base.items || []).map(function (item) {
          if (item.id !== targetId) return item;
          found = true;
          var copy = Object.assign({}, item);
          if (tool === 'toggle_subtask') {
            var done = args.done != null ? !!args.done : !item.done;
            copy.done = done;
            copy.progress = done ? 100 : args.progress != null ? clampInt(args.progress, 0, 100, 0) : 0;
          } else {
            copy.progress = clampInt(args.progress, 0, 100, item.progress || 0);
            copy.done = copy.progress >= 100;
          }
          return copy;
        });
        if (!found) return { ok: false, error: 'Sous-t\u00e2che introuvable' };
        bridge.applyCompletion(Object.assign({}, base, { items: nextItems }));
        return {
          ok: true,
          summary:
            tool === 'toggle_subtask'
              ? TOOL_LABELS.toggle_subtask
              : TOOL_LABELS.set_subtask_progress
        };
      }
      return { ok: false, error: 'Outil inconnu\u00a0: ' + tool };
    } catch (err) {
      return {
        ok: false,
        error: (err && err.message) || '\u00c9chec d\'ex\u00e9cution'
      };
    }
  }

  function executeActions(bridge, actions) {
    var list = Array.isArray(actions) ? actions : [];
    var results = [];
    var summaries = [];
    var errors = [];
    list.forEach(function (action) {
      var result = executeAction(bridge, action);
      results.push(result);
      if (result.ok && result.summary) summaries.push(result.summary);
      if (!result.ok && result.error) errors.push(result.error);
    });
    return {
      results: results,
      summary: summaries.filter(Boolean).join(' ') || (errors.length ? '' : 'OK'),
      errors: errors,
      ok: errors.length === 0 && results.length > 0
    };
  }

  async function runProviderTests(provider, onResult) {
    var p = normalizeProvider(provider);
    var results = [];

    function paint() {
      return new Promise(function (resolve) {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function () {
            resolve();
          });
        } else {
          setTimeout(resolve, 0);
        }
      });
    }

    async function push(id, label, status, detail, ms) {
      var item = {
        id: id,
        label: label,
        status: status,
        detail: detail || '',
        ms: typeof ms === 'number' ? ms : null
      };
      var idx = -1;
      for (var i = 0; i < results.length; i++) {
        if (results[i].id === id) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) results[idx] = item;
      else results.push(item);
      if (typeof onResult === 'function') {
        try {
          onResult(item, results.slice());
        } catch (cbErr) {
          console.error('runProviderTests onResult failed', cbErr);
        }
      }
      await paint();
      return item;
    }

    // 1. Config
    if (!p.apiKey) {
      await push('config', 'Configuration', 'fail', 'Cl\u00e9 API manquante');
      return results;
    }
    if (!p.baseUrl) {
      await push('config', 'Configuration', 'fail', 'URL de base manquante');
      return results;
    }
    if (!p.model) {
      await push('config', 'Configuration', 'fail', 'Mod\u00e8le manquant');
      return results;
    }
    await push(
      'config',
      'Configuration',
      'pass',
      p.preset + ' \u00b7 ' + p.model + ' \u00b7 ' + p.baseUrl
    );

    // 2. Reachability / CORS (+ auth signal)
    await push('reach', 'Accessibilit\u00e9 / CORS', 'running', 'En cours\u2026');
    var t0 = Date.now();
    var modelsRes = null;
    var reachErr = null;
    try {
      modelsRes = await apiFetch(p, '/models', { method: 'GET' });
    } catch (err) {
      reachErr = err;
    }
    var reachMs = Date.now() - t0;

    if (reachErr && reachErr.code === 'cors_or_network') {
      await push('reach', 'Accessibilit\u00e9 / CORS', 'fail', reachErr.message, reachMs);
      await push('auth', 'Authentification', 'skip', 'Non test\u00e9 (CORS / r\u00e9seau)');
      await push('chat', '\u00c9change chat', 'skip', 'Non test\u00e9');
      await push('json', 'Mode JSON', 'skip', 'Non test\u00e9');
      return results;
    }

    if (reachErr) {
      // Fallback: try a tiny chat completion to prove reachability
      await push('reach', 'Accessibilit\u00e9 / CORS', 'running', 'Tentative via chat\u2026');
      t0 = Date.now();
      try {
        await chatCompletions(
          p,
          [{ role: 'user', content: 'Reply with OK' }],
          { jsonMode: false, max_tokens: 5, temperature: 0 }
        );
        await push(
          'reach',
          'Accessibilit\u00e9 / CORS',
          'pass',
          '/models indisponible, chat OK',
          Date.now() - t0
        );
        await push('auth', 'Authentification', 'pass', 'Cl\u00e9 accept\u00e9e via chat');
      } catch (chatErr) {
        var classified = chatErr.code === 'cors_or_network'
          ? chatErr
          : classifyFetchError(chatErr);
        if (chatErr.code === 'cors_or_network' || classified.code === 'cors_or_network') {
          await push(
            'reach',
            'Accessibilit\u00e9 / CORS',
            'fail',
            chatErr.message || classified.message,
            Date.now() - t0
          );
        } else if (chatErr.status === 401 || chatErr.status === 403 || chatErr.code === 'auth') {
          await push(
            'reach',
            'Accessibilit\u00e9 / CORS',
            'pass',
            'Endpoint joignable',
            Date.now() - t0
          );
          await push(
            'auth',
            'Authentification',
            'fail',
            chatErr.message || 'Cl\u00e9 refus\u00e9e',
            Date.now() - t0
          );
        } else {
          await push(
            'reach',
            'Accessibilit\u00e9 / CORS',
            'fail',
            chatErr.message || String(chatErr),
            Date.now() - t0
          );
        }
        if (results.every(function (r) { return r.id !== 'auth'; })) {
          await push('auth', 'Authentification', 'skip', 'Non conclu');
        }
        await push('chat', '\u00c9change chat', 'skip', 'Non test\u00e9');
        await push('json', 'Mode JSON', 'skip', 'Non test\u00e9');
        return results;
      }
    } else if (modelsRes) {
      if (modelsRes.status === 401 || modelsRes.status === 403) {
        await push(
          'reach',
          'Accessibilit\u00e9 / CORS',
          'pass',
          'Endpoint joignable (HTTP ' + modelsRes.status + ')',
          reachMs
        );
        await push(
          'auth',
          'Authentification',
          'fail',
          (modelsRes.data &&
            modelsRes.data.error &&
            modelsRes.data.error.message) ||
            'Cl\u00e9 refus\u00e9e (HTTP ' + modelsRes.status + ')',
          reachMs
        );
        await push('chat', '\u00c9change chat', 'skip', 'Non test\u00e9 (auth)');
        await push('json', 'Mode JSON', 'skip', 'Non test\u00e9 (auth)');
        return results;
      }
      if (modelsRes.ok) {
        var modelCount =
          modelsRes.data && Array.isArray(modelsRes.data.data)
            ? modelsRes.data.data.length
            : null;
        await push(
          'reach',
          'Accessibilit\u00e9 / CORS',
          'pass',
          modelCount != null
            ? modelCount + ' mod\u00e8les list\u00e9s'
            : 'GET /models OK',
          reachMs
        );
        await push('auth', 'Authentification', 'pass', 'Cl\u00e9 accept\u00e9e', reachMs);
      } else {
        await push(
          'reach',
          'Accessibilit\u00e9 / CORS',
          'warn',
          'GET /models HTTP ' + modelsRes.status + ' \u2014 on tente le chat',
          reachMs
        );
        await push(
          'auth',
          'Authentification',
          'warn',
          'Ind\u00e9termin\u00e9 via /models',
          reachMs
        );
      }
    }

    // 3/4. Chat round-trip
    await push('chat', '\u00c9change chat', 'running', 'En cours\u2026');
    t0 = Date.now();
    try {
      var chatRes = await chatCompletions(
        p,
        [{ role: 'user', content: 'R\u00e9ponds uniquement OK' }],
        { jsonMode: false, max_tokens: 8, temperature: 0 }
      );
      var okText = (chatRes.content || '').trim();
      await push(
        'chat',
        '\u00c9change chat',
        /ok/i.test(okText) ? 'pass' : 'warn',
        okText
          ? 'R\u00e9ponse\u00a0: ' + okText.slice(0, 80)
          : 'R\u00e9ponse vide',
        Date.now() - t0
      );
      if (results.every(function (r) { return r.id !== 'auth' || r.status === 'warn' || r.status === 'skip'; })) {
        // Upgrade auth if still warn/skip
        for (var i = 0; i < results.length; i++) {
          if (results[i].id === 'auth' && results[i].status !== 'pass') {
            await push(
              'auth',
              'Authentification',
              'pass',
              'Cl\u00e9 accept\u00e9e via chat',
              results[i].ms
            );
            break;
          }
        }
      }
    } catch (chatErr2) {
      await push(
        'chat',
        '\u00c9change chat',
        'fail',
        chatErr2.message || String(chatErr2),
        Date.now() - t0
      );
      await push('json', 'Mode JSON', 'skip', 'Non test\u00e9');
      return results;
    }

    // 5. JSON mode
    await push('json', 'Mode JSON', 'running', 'En cours\u2026');
    t0 = Date.now();
    try {
      var jsonRes = await chatCompletions(
        p,
        [
          {
            role: 'user',
            content:
              'R\u00e9ponds uniquement avec JSON {"message":"OK","followUps":[]}'
          }
        ],
        { jsonMode: true, max_tokens: 40, temperature: 0 }
      );
      var parsed = parseAssistantPayload(jsonRes.content);
      if (parsed && parsed.message) {
        await push(
          'json',
          'Mode JSON',
          'pass',
          'response_format json_object OK',
          Date.now() - t0
        );
      } else {
        await push(
          'json',
          'Mode JSON',
          'warn',
          'JSON difficile \u00e0 parser',
          Date.now() - t0
        );
      }
    } catch (jsonErr) {
      await push(
        'json',
        'Mode JSON',
        'warn',
        (jsonErr.message || String(jsonErr)) +
          ' \u2014 les follow-ups peuvent \u00eatre moins fiables',
        Date.now() - t0
      );
    }

    return results;
  }

  global.PriorityAgent = {
    PROVIDER_STORAGE_KEY: PROVIDER_STORAGE_KEY,
    PRESETS: PRESETS,
    OPENAI_MODELS: OPENAI_MODELS,
    normalizeProvider: normalizeProvider,
    providerFingerprint: providerFingerprint,
    providersEqual: providersEqual,
    isConfigured: isConfigured,
    isVerified: isVerified,
    markVerified: markVerified,
    clearVerified: clearVerified,
    getProvider: getProvider,
    saveProvider: saveProvider,
    buildContext: buildContext,
    chatTurn: chatTurn,
    suggestQuestions: suggestQuestions,
    executeAction: executeAction,
    executeActions: executeActions,
    runProviderTests: runProviderTests,
    chatCompletions: chatCompletions,
    extractStreamingMessage: extractStreamingMessage,
    estimateCostUsd: estimateCostUsd,
    extractUsageFromRaw: extractUsageFromRaw,
    contextWindowForModel: contextWindowForModel
  };
})(typeof window !== 'undefined' ? window : this);
