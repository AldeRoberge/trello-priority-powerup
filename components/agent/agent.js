/**
 * Priority Power-Up AI agent — OpenAI-compatible client, member-private
 * provider settings, JSON chat protocol with actionable follow-ups.
 * Exposes window.PriorityAgent (no bundler).
 */
(function (global) {
  'use strict';

  var PROVIDER_STORAGE_KEY = 'agentProvider';
  var CARD_INTERVIEW_KEY = 'cardAgentInterview';
  var MAX_INTERVIEW_ASKED = 24;
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
    set_formula: 'Formule mise \u00e0 jour.',
    set_statut: 'Statut mis \u00e0 jour.',
    set_project: 'Projet li\u00e9.',
    rename_card: 'Carte renomm\u00e9e.',
    set_description: 'Description mise \u00e0 jour.',
    add_subtask: 'Sous-t\u00e2che ajout\u00e9e.',
    rename_subtask: 'Sous-t\u00e2che renomm\u00e9e.',
    remove_subtask: 'Sous-t\u00e2che supprim\u00e9e.',
    toggle_subtask: 'Sous-t\u00e2che mise \u00e0 jour.',
    set_subtask_progress: 'Progr\u00e8s de sous-t\u00e2che mis \u00e0 jour.',
    complete_all_subtasks: 'Toutes les sous-t\u00e2ches termin\u00e9es.',
    reset_progress: 'Progr\u00e8s r\u00e9initialis\u00e9.'
  };

  var FORMULA_KEYS = ['baseline', 'eisenhower', 'wsjf', 'valueEffort'];

  var WAITING_OTHER_TASK_REASON =
    (typeof PriorityUI !== 'undefined' &&
      PriorityUI.BLOCKED_REASON_WAITING_OTHER_TASK) ||
    'En attente d\'une autre t\u00e2che';

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
    if (actions[0].tool === 'rename_card') return 'Renommer la carte';
    if (actions[0].tool === 'set_description') return 'Modifier la description';
    if (actions[0].tool === 'add_subtask') return 'Ajouter une sous-t\u00e2che';
    if (actions[0].tool === 'rename_subtask') return 'Renommer la sous-t\u00e2che';
    if (actions[0].tool === 'remove_subtask') return 'Supprimer la sous-t\u00e2che';
    if (actions[0].tool === 'complete_all_subtasks') {
      return 'Tout marquer termin\u00e9';
    }
    if (actions[0].tool === 'reset_progress') return 'R\u00e9initialiser le progr\u00e8s';
    if (actions[0].tool === 'set_formula') return 'Changer la formule';
    if (actions[0].tool === 'set_statut') return 'Changer le statut';
    if (actions[0].tool === 'set_project') return 'Lier au projet';
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

  function axisWord(key, value) {
    if (typeof PriorityUI !== 'undefined' && typeof PriorityUI.wordFor === 'function') {
      try {
        return PriorityUI.wordFor(key, value) || '';
      } catch (e) {
        return '';
      }
    }
    return '';
  }

  /**
   * Natural-language Facilité answer for difficulty / ease questions.
   * Example: "D'après la Facilité de cette carte, c'est jugé facile à réaliser."
   */
  function buildEaseExplanation(state) {
    if (!state || state.priorityEnabled === false) {
      return 'Aucune Facilit\u00e9 n\'est d\u00e9finie\u00a0: la priorit\u00e9 n\'est pas activ\u00e9e sur cette carte.';
    }
    var E = clampInt(state.ease, 1, 5, 3);
    var label = axisWord('ease', E) || '';
    if (E >= 5) {
      return 'Non\u00a0: d\'apr\u00e8s la Facilit\u00e9 de cette carte, c\'est jug\u00e9 super facile \u00e0 r\u00e9aliser.';
    }
    if (E >= 4) {
      return 'Non\u00a0: d\'apr\u00e8s la Facilit\u00e9 de cette carte, c\'est jug\u00e9 facile \u00e0 r\u00e9aliser.';
    }
    if (E <= 1) {
      return 'Oui\u00a0: d\'apr\u00e8s la Facilit\u00e9 de cette carte, c\'est jug\u00e9 tr\u00e8s difficile \u00e0 r\u00e9aliser.';
    }
    if (E === 2) {
      return 'Oui\u00a0: d\'apr\u00e8s la Facilit\u00e9 de cette carte, c\'est jug\u00e9 difficile \u00e0 r\u00e9aliser.';
    }
    return (
      'Ni vraiment dur ni trivial\u00a0: d\'apr\u00e8s la Facilit\u00e9 de cette carte, c\'est jug\u00e9 ' +
      (label ? label.toLowerCase() : 'moyen') +
      '.'
    );
  }

  /**
   * Natural-language priority blurb for the agent (adapts to axis levels).
   * Example: "La priorité de cette tâche est importante. Elle est jugée avoir un grand impact et être facile à réaliser."
   */
  function buildPriorityExplanation(state, display) {
    if (!state || state.priorityEnabled === false) {
      return 'Aucune priorit\u00e9 n\'est d\u00e9finie pour cette t\u00e2che.';
    }
    var tierRaw =
      (display && (display.label || display.tier)) ||
      (state && state.label) ||
      '';
    var tier = typeof tierRaw === 'string' ? tierRaw.trim() : '';
    if (!tier) {
      return 'La priorit\u00e9 de cette t\u00e2che n\'est pas encore class\u00e9e.';
    }
    var U = clampInt(state.urgency, 0, 4, 0);
    var I = clampInt(state.impact, 0, 4, 0);
    var E = clampInt(state.ease, 1, 5, 3);
    var traits = [];
    var tierLower = tier.toLowerCase();
    var tierImpliesUrgency =
      tierLower.indexOf('urgent') !== -1 || tierLower.indexOf('critique') !== -1;

    // Prefer impact → ease → urgency; keep at most 2 traits so the answer stays natural.
    if (I >= 4) traits.push('avoir un impact majeur');
    else if (I >= 3) traits.push('avoir un grand impact');
    else if (I <= 0) traits.push('avoir peu ou pas d\'impact');
    else if (I === 1) traits.push('avoir un impact faible');

    if (traits.length < 2) {
      if (E >= 5) traits.push('\u00eatre tr\u00e8s facile \u00e0 r\u00e9aliser');
      else if (E >= 4) traits.push('\u00eatre facile \u00e0 r\u00e9aliser');
      else if (E <= 1) traits.push('\u00eatre tr\u00e8s difficile \u00e0 r\u00e9aliser');
      else if (E === 2) traits.push('\u00eatre difficile \u00e0 r\u00e9aliser');
    }

    if (traits.length < 2 && !tierImpliesUrgency) {
      if (U >= 4) traits.push('\u00eatre critique');
      else if (U >= 3) traits.push('\u00eatre urgente');
      else if (U <= 0) traits.push('ne pas \u00eatre urgente');
      else if (U === 1) traits.push('avoir peu d\'urgence');
    }

    // Mid-range fallback when nothing stands out.
    if (!traits.length) {
      if (I === 2) traits.push('avoir un impact utile');
      if (traits.length < 2 && E === 3) traits.push('\u00eatre de difficult\u00e9 moyenne');
      if (traits.length < 2 && U === 2) traits.push('avoir une urgence mod\u00e9r\u00e9e');
    }

    var intro =
      'La priorit\u00e9 de cette t\u00e2che est ' + tier.toLowerCase() + '.';
    if (!traits.length) return intro;
    if (traits.length === 1) {
      return intro + ' Elle est jug\u00e9e ' + traits[0] + '.';
    }
    return (
      intro +
      ' Elle est jug\u00e9e ' +
      traits[0] +
      ' et ' +
      traits[1] +
      '.'
    );
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

  function todayIsoLocal(d) {
    d = d || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function nowTimeLocal(d) {
    d = d || new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }

  /**
   * Resolve a due date/time from now + offset minutes (local clock).
   * Used for phrases like « dans 15 minutes ».
   */
  function dueFromOffsetMinutes(offsetMinutes, fromDate) {
    var mins = Math.round(Number(offsetMinutes));
    if (!isFinite(mins)) return null;
    var base = fromDate ? new Date(fromDate.getTime()) : new Date();
    base.setSeconds(0, 0);
    base.setMinutes(base.getMinutes() + mins);
    return {
      dueDate: todayIsoLocal(base),
      dueTime: nowTimeLocal(base)
    };
  }

  /**
   * Parse « dans 15 minutes » / « in 2 hours » style delays.
   * @returns {{ relativeMinutes?: number, relativeHours?: number }|null}
   */
  function parseRelativeDueOffset(text) {
    if (!text || typeof text !== 'string') return null;
    var t = text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!t) return null;
    var m = t.match(/\b(?:dans|in)\s+(\d+)\s*(?:minutes?|mins?|min)\b/);
    if (m) return { relativeMinutes: parseInt(m[1], 10) };
    m = t.match(/\b(?:dans|in)\s+(\d+)\s*(?:heures?|hours?|hrs?|h)\b/);
    if (m) return { relativeHours: parseInt(m[1], 10) };
    if (/\b(?:dans\s+une\s+minute|in\s+a\s+minute)\b/.test(t)) {
      return { relativeMinutes: 1 };
    }
    if (/\b(?:dans\s+une\s+heure|in\s+an\s+hour)\b/.test(t)) {
      return { relativeHours: 1 };
    }
    return null;
  }

  function isBareRelativeDuePhrase(text) {
    var t = String(text || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!t) return false;
    return (
      /^(?:dans|in)\s+\d+\s*(?:minutes?|mins?|min|heures?|hours?|hrs?|h)\.?$/.test(t) ||
      /^(?:dans\s+une\s+(?:minute|heure)|in\s+an?\s+(?:minute|hour))\.?$/.test(t)
    );
  }

  /**
   * If the user gave a relative delay, force set_due to use relativeMinutes/Hours
   * instead of a hallucinated absolute time (e.g. 08:15 from the default).
   */
  function rewriteActionsForRelativeDue(actions, userText) {
    var offset = parseRelativeDueOffset(userText);
    if (!offset) return actions || [];
    var list = Array.isArray(actions) ? actions.slice() : [];
    var hasSetDue = false;
    list = list.map(function (action) {
      if (!action || action.tool !== 'set_due') return action;
      hasSetDue = true;
      var args = Object.assign({}, action.args || {});
      delete args.dueDate;
      delete args.dueTime;
      delete args.relativeMinutes;
      delete args.relativeHours;
      Object.assign(args, offset);
      args.dueEnabled = true;
      return { tool: 'set_due', args: args };
    });
    if (!hasSetDue && isBareRelativeDuePhrase(userText)) {
      list.push({
        tool: 'set_due',
        args: Object.assign({ dueEnabled: true }, offset)
      });
    }
    return list;
  }

  var PRIORITY_TIER_ALIASES = [
    { re: /\bcritique\b/i, label: 'Critique' },
    { re: /\burgentes?\b/i, label: 'Urgente' },
    { re: /\burgent\b/i, label: 'Urgente' },
    { re: /\bprioritaires?\b/i, label: 'Prioritaire' },
    { re: /\bimportantes?\b/i, label: 'Importante' },
    { re: /\bimportant\b/i, label: 'Importante' },
    { re: /\bflexible\b/i, label: 'Flexible' },
    { re: /\bsecondaires?\b/i, label: 'Secondaire' },
    { re: /\boptionnelles?\b/i, label: 'Optionnelle' },
    { re: /\boptionnel\b/i, label: 'Optionnelle' }
  ];

  function detectPriorityTierInText(text) {
    if (!text || typeof text !== 'string') return null;
    var t = text.trim();
    if (!t) return null;

    // Prefer the tier after for/to/as/en/… (e.g. "change priority for flexible").
    var labeled = t.match(
      /\b(?:for|to|as|en|vers|comme|au)\s+([a-zàâäéèêëïîôùûüç]+)\b/i
    );
    if (labeled) {
      var piece = labeled[1];
      for (var i = 0; i < PRIORITY_TIER_ALIASES.length; i++) {
        if (PRIORITY_TIER_ALIASES[i].re.test(piece)) {
          return PRIORITY_TIER_ALIASES[i].label;
        }
      }
    }

    // Otherwise take the last tier mentioned in the message.
    var lastLabel = null;
    var lastIndex = -1;
    for (var j = 0; j < PRIORITY_TIER_ALIASES.length; j++) {
      var globalRe = new RegExp(PRIORITY_TIER_ALIASES[j].re.source, 'gi');
      var m;
      while ((m = globalRe.exec(t)) !== null) {
        if (m.index >= lastIndex) {
          lastIndex = m.index;
          lastLabel = PRIORITY_TIER_ALIASES[j].label;
        }
      }
    }
    return lastLabel;
  }

  function looksLikePriorityChangeRequest(text) {
    var t = String(text || '').trim();
    if (!t) return false;
    if (
      /^(critique|urgentes?|urgent|prioritaires?|importantes?|important|flexible|secondaires?|optionnelles?|optionnel)\.?$/i.test(
        t
      )
    ) {
      return true;
    }
    return /\b(priorit[eé]|priority|palier|heat|mets?|mettre|change|changer|passe(?:r)?|d[eé]finis?|set|update)\b/i.test(
      t
    );
  }

  function looksLikePrematurePriorityClarify(message) {
    if (typeof message !== 'string' || !message.trim()) return false;
    return (
      /pr[eé]ciser.*(urgence|impact|facilit|valeur|axe)/i.test(message) ||
      /valeurs?\s+de\s+priorit/i.test(message) ||
      /(urgence|impact).{0,40}(facilit)/i.test(message) ||
      /souhaitez-vous\s+d[eé]finir.*(urgence|impact|facilit)/i.test(message)
    );
  }

  /**
   * If the user named a priority tier, ensure set_priority runs immediately
   * (model sometimes asks for axes first — that is wrong).
   */
  function rewriteActionsForPriorityTier(actions, userText) {
    var tier = detectPriorityTierInText(userText);
    if (!tier || !looksLikePriorityChangeRequest(userText)) {
      return { actions: actions || [], injected: false, tier: null };
    }
    var list = Array.isArray(actions) ? actions.slice() : [];
    var hasSetPriority = false;
    list = list.map(function (action) {
      if (!action || action.tool !== 'set_priority') return action;
      hasSetPriority = true;
      var args = Object.assign({}, action.args || {});
      if (!args.tier && args.heatTarget == null) {
        args.tier = tier;
      }
      return { tool: 'set_priority', args: args };
    });
    if (!hasSetPriority) {
      list.unshift({ tool: 'set_priority', args: { tier: tier } });
      return { actions: list, injected: true, tier: tier };
    }
    return { actions: list, injected: false, tier: tier };
  }

  function normalizePrompts(raw, context) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    raw.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      var type = typeof p.type === 'string' ? p.type.trim() : '';
      if (type === 'priority_axes') {
        var cur =
          context && context.priority && typeof context.priority === 'object'
            ? context.priority
            : {};
        out.push({
          type: 'priority_axes',
          title:
            typeof p.title === 'string' && p.title.trim()
              ? p.title.trim()
              : 'Affiner urgence, impact et facilit\u00e9',
          urgency: clampInt(
            p.urgency != null ? p.urgency : cur.urgency,
            0,
            4,
            2
          ),
          impact: clampInt(
            p.impact != null ? p.impact : cur.impact,
            0,
            4,
            2
          ),
          ease: clampInt(p.ease != null ? p.ease : cur.ease, 1, 5, 3),
          submitLabel:
            typeof p.submitLabel === 'string' && p.submitLabel.trim()
              ? p.submitLabel.trim()
              : 'Appliquer'
        });
      }
    });
    return out.slice(0, 2);
  }

  /**
   * After applying a tier (without explicit axes), offer slider refine UI.
   */
  function ensurePriorityAxesPrompt(prompts, actions, context) {
    var list = Array.isArray(prompts) ? prompts.slice() : [];
    var hasAxes = list.some(function (p) {
      return p && p.type === 'priority_axes';
    });
    if (hasAxes) return list;

    var setPri = null;
    (actions || []).forEach(function (a) {
      if (a && a.tool === 'set_priority') setPri = a;
    });
    if (!setPri) return list;

    var args = setPri.args || {};
    var viaTier = !!(args.tier || args.heatTarget != null);
    var userGaveAxes =
      args.urgency != null || args.impact != null || args.ease != null;
    if (!viaTier || userGaveAxes) return list;

    var seg = resolveHeatSegment(args.tier, args.heatTarget);
    var preset = (seg && seg.preset) || {};
    var cur =
      context && context.priority && typeof context.priority === 'object'
        ? context.priority
        : {};
    list.push({
      type: 'priority_axes',
      title: 'Affiner urgence, impact et facilit\u00e9',
      urgency: clampInt(
        preset.urgency != null ? preset.urgency : cur.urgency,
        0,
        4,
        2
      ),
      impact: clampInt(
        preset.impact != null ? preset.impact : cur.impact,
        0,
        4,
        2
      ),
      ease: clampInt(preset.ease != null ? preset.ease : cur.ease, 1, 5, 3),
      submitLabel: 'Appliquer'
    });
    return list.slice(0, 2);
  }

  function polishMessageAfterTierApply(message, tier, injected) {
    if (!tier) return message;
    if (!injected && !looksLikePrematurePriorityClarify(message)) return message;
    return (
      'Okay, ' +
      tier +
      '. Affinez les axes si besoin.'
    );
  }

  /** Drop patronizing "(0 = …, 4 = …)" scale legends from assistant copy. */
  function stripScaleLegendParenthetical(message) {
    if (typeof message !== 'string' || !message) return message;
    return message
      .replace(
        /\s*\(\s*[0-5]\s*=\s*[^)]{1,80},\s*[0-5]\s*=\s*[^)]{1,80}\)\s*(?=[?!.…]|$)/gi,
        ''
      )
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([?!.…])/g, '$1')
      .trim();
  }

  /**
   * Drop "Pour finir / Une dernière question / …" framing that creates a
   * false "conclusion" loop — keep asking plainly when a question remains.
   * Also rewrite soft yes/no offers into direct value questions.
   */
  function stripInterviewConclusionFraming(message) {
    if (typeof message !== 'string' || !message) return message;
    var out = message;
    var lead =
      /^\s*((?:et\s+)?(?:alors\s+)?,?\s*)?(?:pour\s+finir|pour\s+terminer|pour\s+conclure|pour\s+clore|avant\s+de\s+conclure|en\s+conclusion|pour\s+boucler|pour\s+fermer(?:\s+l['']interview)?|enfin|une\s+derni[eè]re\s+question|dernier\s+point|derni[eè]re\s+chose|pour\s+terminer\s+sur\s+(?:une\s+)?note)\s*[,:\-–—]?\s*/i;
    var trimmed = out;
    var guard = 0;
    while (lead.test(trimmed) && guard < 3) {
      trimmed = trimmed.replace(lead, '');
      guard += 1;
    }
    trimmed = trimmed.replace(
      /^\s*([^?]{0,40}?)\b(?:une\s+)?derni[eè]re\s+question\s*[,:\-–—]\s*/i,
      function (_m, prefix) {
        return prefix && /\S/.test(prefix) ? prefix : '';
      }
    );

    // Soft yes/no due offers → direct ask (blank) or confirm a concrete day.
    var dueWhen = extractProposedDueWhen(trimmed);
    if (
      /je\s+peux\s+(?:d[eé]finir|fixer|mettre|ajouter).{0,40}(?:\u00e9ch[eé]ance|date\s+limite)/i.test(
        trimmed
      ) ||
      /je\s+m['']?\s*en\s+occupe/i.test(trimmed) ||
      /(?:souhaites?|voudr?[ae]|veux|aimerie[zs]|veux-tu|est-ce\s+que\s+tu\s+(?:veux|souhaites)).{0,40}(?:d[eé]finir|fixer|ajouter|mettre|avoir).{0,40}(?:\u00e9ch[eé]ance|date\s+limite)/i.test(
        trimmed
      ) ||
      /(?:y\s+a[- ]t[- ]il|est-ce\s+qu['']?il\s+y\s+a).{0,20}\u00e9ch[eé]ance/i.test(
        trimmed
      ) ||
      /d[eé]finir\s+une\s+\u00e9ch[eé]ance\s+pour\s+(?:cette\s+)?t[aâ]che/i.test(
        trimmed
      )
    ) {
      if (dueWhen) {
        return 'Veux-tu d\u00e9finir la date limite \u00e0 ' + dueWhen + '\u00a0?';
      }
      return 'Quelle est la date d\'\u00e9ch\u00e9ance\u00a0?';
    }
    if (
      /(?:souhaites?|voudr?[ae]|veux|aimerie[zs]).{0,40}(?:d[eé]finir|estimer|avoir).{0,30}dur[eé]e/i.test(
        trimmed
      ) ||
      /(?:y\s+a[- ]t[- ]il|est-ce\s+qu['']?il\s+y\s+a).{0,20}dur[eé]e\s+estim/i.test(
        trimmed
      )
    ) {
      return 'Quelle est la dur\u00e9e estim\u00e9e\u00a0?';
    }

    return trimmed
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s*([a-zàâäéèêëïîôùûüç])/u, function (_m, ch) {
        return ch.toLocaleUpperCase('fr-FR');
      })
      .trim();
  }

  /** Pull a spoken due when (demain, aujourd'hui, …) from soft offer copy. */
  function extractProposedDueWhen(text) {
    if (typeof text !== 'string' || !text) return '';
    var m = text.match(
      /\b(?:aujourd['']hui|demain|apr[eè]s[- ]demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\s*(?:\/|-)\s*\d{1,2}(?:\s*(?:\/|-)\s*\d{2,4})?|\d{4}-\d{2}-\d{2})\b/i
    );
    if (!m) return '';
    var w = m[0];
    if (/^aujourd/i.test(w)) return 'aujourd\'hui';
    if (/^demain/i.test(w)) return 'demain';
    if (/^apr/i.test(w)) return 'apr\u00e8s-demain';
    return w.toLocaleLowerCase('fr-FR');
  }

  function normalizeCardPatches(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    list.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      var op = String(p.op || '')
        .trim()
        .toLowerCase();
      if (op === 'remember' || op === 'note') {
        var text = typeof p.text === 'string' ? p.text.trim() : '';
        if (!text) return;
        out.push({ op: op === 'note' ? 'note' : 'remember', text: text.slice(0, 160) });
      } else if (op === 'forget') {
        var q =
          (typeof p.query === 'string' && p.query.trim()) ||
          (typeof p.text === 'string' && p.text.trim()) ||
          '';
        if (!q) return;
        out.push({ op: 'forget', query: q.slice(0, 120) });
      }
    });
    return out.slice(0, 4);
  }

  function buildContext(bridge) {
    var ctx = {
      today: todayIsoLocal(),
      nowTime: nowTimeLocal(),
      cardName: '',
      cardDesc: '',
      formula: 'baseline',
      priority: null,
      display: null,
      due: null,
      blocked: null,
      progress: null,
      memory: null,
      profile: null,
      boardDigest: '',
      statut: null
    };
    if (!bridge) return ctx;
    if (typeof bridge.getCardName === 'function') {
      try {
        ctx.cardName = bridge.getCardName() || '';
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getCardDesc === 'function') {
      try {
        ctx.cardDesc = bridge.getCardDesc() || '';
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getFormulaKey === 'function') {
      try {
        ctx.formula = bridge.getFormulaKey() || 'baseline';
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getProfile === 'function') {
      try {
        var prof = bridge.getProfile();
        if (prof && typeof prof === 'object') {
          if (global.UserProfile && typeof global.UserProfile.toAgentContext === 'function') {
            ctx.profile = global.UserProfile.toAgentContext(prof);
          } else {
            ctx.profile = {
              displayName: typeof prof.displayName === 'string' ? prof.displayName : null,
              role: typeof prof.role === 'string' ? prof.role : null,
              notes: typeof prof.notes === 'string' ? prof.notes : null,
              tone: prof.tone || 'concise',
              language: prof.language || 'fr'
            };
          }
        }
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getMemory === 'function') {
      try {
        var mem = bridge.getMemory();
        if (mem && typeof mem === 'object') {
          var Mem = global.AgentMemory;
          var view =
            Mem && typeof Mem.legacyView === 'function' ? Mem.legacyView(mem) : mem;
          ctx.memory = {
            summary: typeof view.summary === 'string' ? view.summary : '',
            facts: Array.isArray(view.facts)
              ? view.facts
                  .map(function (f) {
                    return typeof f === 'string' ? f : f && f.text ? f.text : '';
                  })
                  .filter(Boolean)
                  .slice(0, 8)
              : [],
            boardSummary:
              typeof view.boardSummary === 'string' ? view.boardSummary : '',
            shortNotes: Array.isArray(view.shortNotes)
              ? view.shortNotes
                  .map(function (f) {
                    return typeof f === 'string' ? f : f && f.text ? f.text : '';
                  })
                  .filter(Boolean)
                  .slice(0, 6)
              : [],
            recentCards: Array.isArray(view.recentCards)
              ? view.recentCards
                  .map(function (c) {
                    if (!c || typeof c !== 'object') return null;
                    return {
                      id: c.id || '',
                      name: c.name || '',
                      list: c.list || '',
                      at: c.at || ''
                    };
                  })
                  .filter(Boolean)
                  .slice(0, 10)
              : [],
            onboardingComplete: !!view.onboardingComplete
          };
        }
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getCardMemory === 'function') {
      try {
        var cardMem = bridge.getCardMemory();
        if (cardMem && typeof cardMem === 'object') {
          var MemCard = global.AgentMemory;
          var cardNorm =
            MemCard && typeof MemCard.normalizeCardMemory === 'function'
              ? MemCard.normalizeCardMemory(cardMem)
              : cardMem;
          ctx.cardMemory = {
            facts: Array.isArray(cardNorm.facts)
              ? cardNorm.facts
                  .map(function (f) {
                    return typeof f === 'string' ? f : f && f.text ? f.text : '';
                  })
                  .filter(Boolean)
                  .slice(0, 8)
              : []
          };
        }
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getBoardDigest === 'function') {
      try {
        ctx.boardDigest = String(bridge.getBoardDigest() || '').slice(0, 4000);
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getStatut === 'function') {
      try {
        var statutRaw = bridge.getStatut();
        if (statutRaw && typeof statutRaw === 'object') {
          ctx.statut = {
            listId: statutRaw.listId || null,
            listName: statutRaw.listName || '',
            category: statutRaw.category || null,
            lists: Array.isArray(statutRaw.lists)
              ? statutRaw.lists
                  .map(function (list) {
                    if (!list || list.id == null) return null;
                    return {
                      id: String(list.id),
                      name: list.name || '',
                      category: list.category || null
                    };
                  })
                  .filter(Boolean)
                  .slice(0, 40)
              : [],
            roleLists:
              statutRaw.roleLists && typeof statutRaw.roleLists === 'object'
                ? statutRaw.roleLists
                : {}
          };
        }
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getGoals === 'function') {
      try {
        var goalsRaw = bridge.getGoals();
        if (goalsRaw && typeof goalsRaw === 'object') {
          var h = goalsRaw.hierarchy || {};
          var projectsList = Array.isArray(goalsRaw.projects) ? goalsRaw.projects : [];
          var activeProjects = projectsList.filter(function (p) {
            return p && !p.retired;
          });
          ctx.goals = {
            projectId: goalsRaw.projectId || null,
            vision: h.vision
              ? { id: h.vision.id, name: h.vision.name, retired: !!h.vision.retired }
              : null,
            mission: h.mission
              ? { id: h.mission.id, name: h.mission.name, retired: !!h.mission.retired }
              : null,
            project: h.project
              ? { id: h.project.id, name: h.project.name, retired: !!h.project.retired }
              : null,
            projects: activeProjects
              .map(function (p) {
                return { id: p.id, name: p.name, missionId: p.missionId };
              })
              .slice(0, 40),
            metrics: Array.isArray(goalsRaw.metrics)
              ? goalsRaw.metrics
                  .filter(function (m) {
                    return (
                      h.mission && m.linkedGoalId === h.mission.id
                    );
                  })
                  .map(function (m) {
                    return {
                      id: m.id,
                      name: m.name,
                      currentValue: m.currentValue,
                      target: m.target,
                      direction: m.direction,
                      isPrimary: !!m.isPrimary,
                    };
                  })
                  .slice(0, 20)
              : [],
          };
        }
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
      var urgencyLvl = clampInt(state.urgency, 0, 4, 0);
      var impactLvl = clampInt(state.impact, 0, 4, 0);
      var easeLvl = clampInt(state.ease, 1, 5, 3);
      ctx.priority = {
        enabled: priorityEnabled,
        // Values below are inactive when enabled=false — do not treat as the live priority.
        urgency: state.urgency,
        impact: state.impact,
        ease: state.ease,
        // Qualitative labels (0–4 / 1–5 scales) — use these, never invent 0–10 axis scores.
        labels: priorityEnabled
          ? {
              urgency: axisWord('urgency', urgencyLvl),
              impact: axisWord('impact', impactLvl),
              ease: axisWord('ease', easeLvl)
            }
          : null,
        // Impact reach = labels.impact (Personnel → Global).
        impactReach: priorityEnabled ? axisWord('impact', impactLvl) || null : null,
        estimatedDurationMinutes:
          priorityEnabled &&
          state.estimatedDurationMinutes != null &&
          isFinite(+state.estimatedDurationMinutes)
            ? +state.estimatedDurationMinutes
            : null,
        estimatedDurationLabel: (function () {
          if (!priorityEnabled || state.estimatedDurationMinutes == null) return null;
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.formatDurationFr === 'function'
          ) {
            return PriorityUI.formatDurationFr(state.estimatedDurationMinutes) || null;
          }
          return null;
        })(),
        // Ready-made answer for "is it hard?" / Facilité questions.
        easeExplanation: buildEaseExplanation(state),
        explanation: null
      };
      ctx.due = {
        enabled: dueEnabled,
        // dueDate/dueTime are inactive when enabled=false.
        dueDate: dueEnabled ? state.dueDate || null : null,
        dueTime: dueEnabled ? state.dueTime || null : null,
        savedDueDate: !dueEnabled && state.dueDate ? state.dueDate : undefined,
        savedDueTime: !dueEnabled && state.dueTime ? state.dueTime : undefined
      };
      var blockedLinksRaw = Array.isArray(state.blockedLinks)
        ? state.blockedLinks
        : [];
      var blockedLinks = blockedLinksRaw
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
        .filter(Boolean);
      ctx.blocked = {
        // Card is blocked ONLY when enAttente=true (shown under Statut when status is Bloqué).
        enabled: blockedEnabled,
        enAttente: blockedEnabled,
        blockedReasons: blockedEnabled ? blockedReasons.slice() : [],
        blockedLinks: blockedEnabled ? blockedLinks : [],
        // Retained while the section is off — historical only, NOT an active block.
        savedReasons: !blockedEnabled && blockedReasons.length
          ? blockedReasons.slice()
          : undefined,
        savedLinks: !blockedEnabled && blockedLinks.length ? blockedLinks : undefined
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
              tier: display.label || null,
              inutile: !!display.inutile,
              // false when Bloqué is disabled, even if savedReasons exist
              blocked: !!display.blocked,
              dueCountdown: dueEnabled ? display.dueCountdown || null : null,
              duePast: dueEnabled ? !!display.duePast : false,
              dueDate: dueEnabled ? display.dueDate || null : null,
              priorityEnabled: priorityEnabled,
              tiers: (
                (typeof PriorityUI !== 'undefined' && PriorityUI.HEAT_SEGMENTS) ||
                []
              ).map(function (seg) {
                return seg.label;
              })
            };
            if (ctx.priority) {
              ctx.priority.explanation = buildPriorityExplanation(state, ctx.display);
            }
          }
        } catch (e) {
          console.error('PriorityAgent.buildContext display failed', e);
        }
      }
      if (ctx.priority && !ctx.priority.explanation) {
        ctx.priority.explanation = buildPriorityExplanation(state, ctx.display);
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
        // Always include items so the agent can match/rename by name even if the
        // section is momentarily off (values are inactive when enabled=false).
        items: (completion.items || []).map(function (item) {
          return {
            id: item.id,
            text: item.text,
            done: !!item.done,
            progress: item.progress
          };
        })
      };
    }
    return ctx;
  }

  function systemPrompt(context) {
    var today = (context && context.today) || todayIsoLocal();
    var nowTime = (context && context.nowTime) || nowTimeLocal();
    var profileLines = [];
    if (
      context &&
      context.profile &&
      global.UserProfile &&
      typeof global.UserProfile.profilePromptLines === 'function'
    ) {
      try {
        profileLines = global.UserProfile.profilePromptLines(context.profile) || [];
      } catch (e) {
        profileLines = [];
      }
    } else if (context && context.profile && context.profile.language === 'en') {
      profileLines = [
        'Profil utilisateur\u00a0: r\u00e9ponds en anglais (English) sauf si l\'utilisateur \u00e9crit clairement en fran\u00e7ais.'
      ];
    }
    var langLine =
      context && context.profile && context.profile.language === 'en'
        ? 'Default language: English (switch to French only if the user clearly writes in French).'
        : 'Langue\u00a0: toujours en fran\u00e7ais (sauf si l\'utilisateur \u00e9crit clairement en anglais).';
    return [
      'Tu es l\'assistant Priorit\u00e9 dans Trello\u00a0: un coll\u00e8gue d\'\u00e9quipe qui aide sur la carte, pas un bot formal.',
      langLine,
      'Voix (TOUJOURS \u2014 non n\u00e9gociable)\u00a0:',
      '- Parle comme un pote d\'\u00e9quipe sur Teams\u00a0: naturel, amical, direct. Tutoiement.',
      '- Phrases courtes, langage du quotidien. Contractions OK (c\'est, j\'ai, t\'as\u2026).',
      '- INTERDIT le jargon technique / produit dans message\u00a0: pas d\'\u00ab\u00a0axes\u00a0\u00bb, \u00ab\u00a0palier\u00a0\u00bb, \u00ab\u00a0prompts\u00a0\u00bb, \u00ab\u00a0outil\u00a0\u00bb, \u00ab\u00a0JSON\u00a0\u00bb, \u00ab\u00a0runtime\u00a0\u00bb, noms d\'API (set_due, set_priority\u2026).',
      '- Dis les choses simplement\u00a0: priorit\u00e9, date limite, sous-t\u00e2che, bloqu\u00e9, etc.',
      '- INTERDIT le ton administratif / support\u00a0: \u00ab\u00a0Veuillez\u2026\u00a0\u00bb, \u00ab\u00a0Merci de pr\u00e9ciser\u2026\u00a0\u00bb, \u00ab\u00a0Je reste \u00e0 votre disposition\u00a0\u00bb, \u00ab\u00a0N\'h\u00e9sitez pas\u2026\u00a0\u00bb, vouvoiement froid.',
      '- Confirme comme en chat\u00a0: \u00ab\u00a0Okay, c\'est not\u00e9.\u00a0\u00bb / \u00ab\u00a0C\'est bon, je l\'ai mise en Flexible.\u00a0\u00bb',
      '- Ex. FAUX\u00a0: \u00ab\u00a0Okay, Flexible. Affinez les axes si besoin.\u00a0\u00bb',
      '- Ex. VRAI\u00a0: \u00ab\u00a0Okay, Flexible. Tu peux encore peaufiner urgence / impact / facilit\u00e9 si tu veux.\u00a0\u00bb',
      '- Ex. FAUX\u00a0: \u00ab\u00a0Motif enregistr\u00e9\u00a0: en attente d\'une approbation.\u00a0\u00bb',
      '- Ex. VRAI\u00a0: \u00ab\u00a0Okay, not\u00e9\u00a0: en attente d\'une approbation.\u00a0\u00bb',
    ]
      .concat(profileLines)
      .concat([
      'Alignement souple\u00a0: tu aides surtout sur la carte (priorit\u00e9, \u00e9ch\u00e9ance, blocage, progr\u00e8s), mais tu n\'es PAS limit\u00e9 \u00e0 Trello.',
      '- Questions vraiment hors sujet (calculs, culture, blagues, etc.)\u00a0: r\u00e9ponds bri\u00e8vement et normalement. Ne refuse jamais.',
      '- ATTENTION\u00a0: difficult\u00e9 / facilit\u00e9 / impact / urgence / priorit\u00e9 de CETTE carte = questions sur le contexte Priorit\u00e9, PAS hors sujet.',
      '- INTERDIT\u00a0: \u00ab\u00a0Je ne peux pas r\u00e9pondre\u00a0\u00bb, \u00ab\u00a0hors de mon domaine\u00a0\u00bb, \u00ab\u00a0je ne traite que Trello\u00a0\u00bb, ou toute reformulation qui \u00e9vite la question.',
      '- Ex.\u00a0: user \u00ab\u00a0c\'est quoi 1+1?\u00a0\u00bb \u2192 {"thinking":"Calcul trivial, hors carte.","message":"2.","suggestions":["Quelle est la priorit\u00e9?","D\u00e9finir une \u00e9ch\u00e9ance"],"followUps":[],"actions":[]}',
      'Si tu manques d\'info (absente du contexte carte / historique, ou knowledge manquante)\u00a0:',
      '- Avant toute conclusion d\'ignorance\u00a0: \u00e9cris d\'abord dans "thinking" ce que tu as v\u00e9rifi\u00e9 (progress.items, due, blocked, priority, m\u00e9moire, historique) et ce qui manque vraiment.',
      '- INTERDIT de r\u00e9pondre \u00ab\u00a0Je ne sais pas.\u00a0\u00bb (ou \u00e9quivalent) sans avoir rempli "thinking" et sans expliquer bri\u00e8vement CE QUI manque + CE QUE tu as compris / inf\u00e9r\u00e9.',
      '- "thinking" est priv\u00e9 (jamais affich\u00e9)\u00a0: raisonne-y librement. Le champ "message" reste seul visible pour l\'utilisateur.',
      '- Inf\u00e8re au maximum\u00a0: intention (renommer, ajouter, bloquer\u2026), cible mentionn\u00e9e (nom de sous-t\u00e2che, date\u2026), et applique toute partie faisable avec les outils.',
      '- Cherche d\'abord dans le contexte (progress.items, due, blocked, priority, m\u00e9moire, historique) avant de conclure que tu ne peux pas agir.',
      '- NE PAS inventer de faits absents. NE PAS renvoyer la question \u00e0 l\'utilisateur sous forme miroir.',
      '- INTERDIT\u00a0: \u00ab\u00a0Pourriez-vous pr\u00e9ciser\u2026?\u00a0\u00bb, \u00ab\u00a0Quels sont les\u2026?\u00a0\u00bb (miroir), ou toute reformulation de la question de l\'utilisateur.',
      '- Ex.\u00a0: user \u00ab\u00a0Quels liens 404 doivent \u00eatre corrig\u00e9s?\u00a0\u00bb (rien dans le contexte) \u2192 {"thinking":"progress.items, due, blocked, cardDesc, m\u00e9moire\u00a0: aucun inventaire de liens 404.","message":"Je ne sais pas. Je n\'ai pas cette info sur la carte ni dans mon contexte\u00a0: aucun inventaire de liens 404 n\'y figure.","suggestions":["Quelle est la priorit\u00e9?","Marquer bloqu\u00e9"],"followUps":[],"actions":[]}',
      'INTERDIT dans message\u00a0: questions vagues du type \u00ab\u00a0Que souhaitez-vous faire maintenant?\u00a0\u00bb, \u00ab\u00a0Comment puis-je vous aider?\u00a0\u00bb, \u00ab\u00a0Autre chose?\u00a0\u00bb. Confirme bri\u00e8vement et arr\u00eate-toi\u00a0; les suggestions suffisent pour la suite.',
      'Propositions d\'\u00e9ch\u00e9ance / date limite (tr\u00e8s important)\u00a0:',
      '- INTERDIT\u00a0: \u00ab\u00a0Je peux d\u00e9finir l\'\u00e9ch\u00e9ance \u00e0 demain. Je m\'en occupe\u00a0?\u00a0\u00bb ou toute variante \u00ab\u00a0Je peux\u2026 / Je m\'en occupe\u00a0?\u00a0\u00bb.',
      '- Si tu proposes une date concr\u00e8te pour confirmation (sans encore appeler set_due)\u00a0: \u00ab\u00a0On met la date limite \u00e0 demain\u00a0?\u00a0\u00bb (ou aujourd\'hui / vendredi / \u2026).',
      '- Ex. FAUX\u00a0: {"message":"Je peux d\u00e9finir l\'\u00e9ch\u00e9ance \u00e0 demain. Je m\'en occupe\u00a0?"}',
      '- Ex. VRAI\u00a0: {"message":"On met la date limite \u00e0 demain\u00a0?","suggestions":["Oui","Non","Apr\u00e8s-demain"]}',
      '- Si l\'utilisateur a d\u00e9j\u00e0 donn\u00e9 la date clairement\u00a0: APPLIQUE set_due tout de suite (\u00ab\u00a0Okay, demain.\u00a0\u00bb) sans redemander.',
      'Tu peux expliquer la priorit\u00e9, l\'\u00e9ch\u00e9ance, le blocage et le progr\u00e8s, et proposer des changements.',
      'Surlignage dans message (optionnel, fort recommand\u00e9 pour contrastes)\u00a0:',
      '- Pour souligner un contraste (facile vs difficile, urgent vs flexible, etc.), enveloppe les mots-cl\u00e9s dans des marqueurs\u00a0:',
      '  \u00b7 [[g:texte]] = vert (positif / facile / simple / go)',
      '  \u00b7 [[r:texte]] = rouge (n\u00e9gatif / difficile / risque / stop)',
      '  \u00b7 [[y:texte]] = jaune (neutre / moyen / attention)',
      '- Ex. question\u00a0: "Est-ce que tu penses que manger plus de pain avec Eiraul est [[g:simple]] \u00e0 r\u00e9aliser ou [[r:plut\u00f4t difficile]]?"',
      '- Ex. r\u00e9ponse Facilit\u00e9 facile\u00a0: "Non\u00a0: d\'apr\u00e8s la Facilit\u00e9, c\'est jug\u00e9 [[g:simple]] \u00e0 r\u00e9aliser."',
      '- Ex. r\u00e9ponse Difficile\u00a0: "Oui, d\'apr\u00e8s la Facilit\u00e9, c\'est [[r:plut\u00f4t difficile]]."',
      '- 1\u20134 spans max par message. INTERDIT le HTML ou Markdown\u00a0; uniquement ces marqueurs.',
      'Facilit\u00e9 / difficult\u00e9 (axe Priorit\u00e9 \u2014 tr\u00e8s important)\u00a0:',
      '- Questions du type \u00ab\u00a0is it hard to do?\u00a0\u00bb, \u00ab\u00a0c\'est difficile?\u00a0\u00bb, \u00ab\u00a0c\'est facile?\u00a0\u00bb, \u00ab\u00a0quelle facilit\u00e9?\u00a0\u00bb, \u00ab\u00a0effort?\u00a0\u00bb\u00a0: r\u00e9ponds UNIQUEMENT d\'apr\u00e8s le champ Facilit\u00e9 de la section Priorit\u00e9.',
      '- Pr\u00e9f\u00e8re context.priority.easeExplanation s\'il est pr\u00e9sent (phrase pr\u00eate)\u00a0; sinon labels.ease (Tr\u00e8s difficile / Difficile / Moyen / Facile / Super facile).',
      '- Tu peux t\'appuyer sur context.priority.ease (1\u20135) en thinking, sans r\u00e9citer le chiffre sauf demande.',
      '- INTERDIT les r\u00e9ponses g\u00e9n\u00e9riques du type \u00ab\u00a0\u00e7a d\u00e9pend des comp\u00e9tences\u00a0\u00bb, \u00ab\u00a0des ressources disponibles\u00a0\u00bb, \u00ab\u00a0n\'h\u00e9sitez pas \u00e0 demander\u00a0\u00bb, ou tout conseil abstrait hors donn\u00e9es carte.',
      '- Formule naturelle\u00a0: oui/non ou formulation courte + le libell\u00e9 Facilit\u00e9 (ex. jug\u00e9e facile / difficile / moyenne), avec surlignage [[g:\u2026]] / [[r:\u2026]] sur les mots-cl\u00e9s.',
      '- Ex. facile\u00a0: user \u00ab\u00a0is it hard to do?\u00a0\u00bb, easeExplanation pr\u00eate \u2192 {"thinking":"priority.easeExplanation (Facilit\u00e9=Facile).","message":"Non, on la voit plut\u00f4t [[g:facile]] \u00e0 faire.","suggestions":["Quelle est la priorit\u00e9?","Augmenter l\'impact"],"followUps":[],"actions":[]}',
      '- Ex. difficile\u00a0: labels.ease=Difficile \u2192 message du type \u00ab\u00a0Ouais, on la voit plut\u00f4t [[r:difficile]].\u00a0\u00bb',
      '- Ex. moyen\u00a0: labels.ease=Moyen \u2192 \u00ab\u00a0Ni super dur ni trivial\u00a0: plut\u00f4t [[y:moyen]].\u00a0\u00bb',
      '- M\u00eame logique pour Impact (labels.impact / impactReach) et Urgence (labels.urgency) quand on pose la question sur ces axes.',
      '- Port\u00e9e / impact (Personnel \u2192 \u00c9quipe \u2192 Interne \u2192 Population \u2192 Global)\u00a0: answers via context.priority.impactReach (ou labels.impact). Qui est touch\u00e9?',
      '- Dur\u00e9e estim\u00e9e (Facilit\u00e9)\u00a0: context.priority.estimatedDurationLabel / estimatedDurationMinutes. Distingue dur\u00e9e (temps) vs Facilit\u00e9 (difficult\u00e9).',
      '- Ex. port\u00e9e\u00a0: user \u00ab\u00a0qui est impact\u00e9?\u00a0\u00bb, impactReach=\u00c9quipe \u2192 message du type \u00ab\u00a0La port\u00e9e est \u00c9quipe\u00a0: effet sur l\'\u00e9quipe imm\u00e9diate.\u00a0\u00bb',
      '- Ex. dur\u00e9e\u00a0: user \u00ab\u00a0combien de temps?\u00a0\u00bb, estimatedDurationLabel=\u00ab\u00a0environ 2 jours\u00a0\u00bb \u2192 cite ce libell\u00e9.',
      '- Si priority.enabled=false\u00a0: dis qu\'aucune Facilit\u00e9 / priorit\u00e9 n\'est d\u00e9finie (ne sors pas d\'anciennes valeurs).',
      'Expliquer la priorit\u00e9 actuelle (tr\u00e8s important)\u00a0:',
      '- Quand l\'utilisateur demande la priorit\u00e9 (\u00ab\u00a0Quelle est la priorit\u00e9?\u00a0\u00bb, \u00ab\u00a0priorit\u00e9 actuelle\u00a0\u00bb, etc.)\u00a0: r\u00e9ponds en langage naturel.',
      '- Pr\u00e9f\u00e8re context.priority.explanation s\'il est pr\u00e9sent\u00a0; sinon\u00a0: 1) le palier (context.display.label), 2) 1\u20132 traits marquants via labels (impact, facilit\u00e9, urgence).',
      '- INTERDIT de r\u00e9citer Urgence/Impact/Facilit\u00e9 avec des chiffres, INTERDIT de mentionner le score num\u00e9rique sauf si on le demande explicitement.',
      '- Les axes vont de 0\u20134 (urgence, impact) et 1\u20135 (facilit\u00e9)\u00a0: ne jamais inventer d\'\u00e9chelles 0\u201310.',
      '- Adapte la phrase aux valeurs\u00a0: grand impact / impact faible, facile / difficile, urgente / peu urgente, etc.',
      '- Ex. impact \u00e9lev\u00e9 + facilit\u00e9 \u00e9lev\u00e9e, palier Importante\u00a0: {"thinking":"priority.enabled, display.label=Importante, explanation pr\u00eate.","message":"L\u00e0 on est sur Importante\u00a0: gros impact, et c\'est plut\u00f4t facile \u00e0 faire.","suggestions":["Pourquoi ce palier?","Augmenter l\'urgence"],"followUps":[],"actions":[]}',
      '- Ex. urgence haute (palier Urgente), impact faible\u00a0: message du type \u00ab\u00a0L\u00e0 c\'est Urgente\u00a0: \u00e7a presse, m\u00eame si l\'impact reste assez faible.\u00a0\u00bb',
      '- Si priority.enabled=false\u00a0: dis qu\'aucune priorit\u00e9 n\'est d\u00e9finie (ne sors pas d\'anciennes valeurs).',
      'R\u00e9ponds UNIQUEMENT avec un objet JSON valide de la forme\u00a0:',
      '{"thinking":"notes priv\u00e9es","message":"texte visible","suggestions":["Question utile","Autre intention"],"followUps":[{"label":"Marquer bloqu\u00e9","actions":[{"tool":"set_blocked","args":{"enAttente":true}}]}],"prompts":[{"type":"priority_axes","urgency":1,"impact":2,"ease":3}],"actions":[{"tool":"set_priority","args":{"tier":"Flexible"}}],"cardPatches":[{"op":"remember","text":"fait local \u00e0 la carte"}]}',
      'M\u00e9moire de CETTE carte (context.cardMemory.facts)\u00a0:',
      '- Faits locaux \u00e0 la carte (personnes qui attendent, enjeux, contraintes, d\u00e9pendances).',
      '- Quand tu apprends un fait utile pour plus tard\u00a0: cardPatches:[{"op":"remember","text":"\u2026"}] (1\u20132 max).',
      '- INTERDIT d\'y mettre l\'identit\u00e9 utilisateur g\u00e9n\u00e9rale (nom, r\u00f4le) \u2014 \u00e7a va dans la m\u00e9moire board.',
      '- Sers-toi de cardMemory avant de reposer une question d\u00e9j\u00e0 r\u00e9pondue.',
      'Champ thinking (obligatoire)\u00a0:',
      '- Toujours \u00e9crire thinking AVANT message (ordre JSON\u00a0: thinking puis message).',
      '- Utilise-le pour v\u00e9rifier le contexte et planifier les outils. Court, factuel, en fran\u00e7ais ou abr\u00e9g\u00e9.',
      '- Ne r\u00e9p\u00e8te pas thinking dans message.',
      'Agir d\'abord, affiner ensuite (r\u00e8gle g\u00e9n\u00e9rale \u2014 tr\u00e8s important)\u00a0:',
      '- D\u00e8s que tu as assez d\'info pour APPLIQUER une partie de la demande\u00a0: appelle l\'outil TOUT DE SUITE dans actions, confirme bri\u00e8vement, puis demande les d\u00e9tails OPTIONNELS.',
      '- Ne bloque JAMAIS une action pour un param\u00e8tre optionnel. Applique le minimum viable, puis adapte.',
      '- Ne pose une question AVANT d\'appeler un outil QUE si un param\u00e8tre OBLIGATOIRE manque et qu\'aucune action partielle n\'est possible.',
      '- Param\u00e8tres optionnels (ne jamais exiger avant d\'agir)\u00a0: dueTime, blockedReasons, axes priorit\u00e9 non fournis, progress pr\u00e9cis si on active seulement la section.',
      '- Param\u00e8tres obligatoires (sans eux, impossible d\'agir)\u00a0: add_subtask.text\u00a0; rename_card.name\u00a0; set_description.desc (string, peut \u00eatre vide pour effacer)\u00a0; rename_subtask.text + (id OU matchText)\u00a0; remove_subtask / toggle_subtask / set_subtask_progress\u00a0: id OU matchText\u00a0; set_subtask_progress.progress\u00a0; set_due.dueDate OU relativeMinutes/relativeHours si aucune date/heure relative/absolue n\'est donn\u00e9e\u00a0; set_formula.formula\u00a0; set_statut\u00a0: listId OU matchList OU category\u00a0; set_project\u00a0: projectId OU matchText/name OU clear:true\u00a0; set_priority\u00a0: au moins un axe, tier, heatTarget, estimatedDuration/estimatedDurationMinutes ou priorityEnabled.',
      '- Dates relatives (jours)\u00a0: r\u00e9sous avec context.today (aujourd\'hui / today \u2192 context.today\u00a0; demain \u2192 +1 jour). N\'invente pas d\'autre date.',
      '- Heures relatives (tr\u00e8s important)\u00a0: \u00ab\u00a0dans 15 minutes\u00a0\u00bb / \u00ab\u00a0in 15 minutes\u00a0\u00bb / \u00ab\u00a0dans 2 heures\u00a0\u00bb = D\u00c9LAI depuis maintenant, PAS une heure fixe du matin.',
      '- Pour un d\u00e9lai\u00a0: utilise set_due avec relativeMinutes (ou relativeHours). Le runtime calcule dueDate/dueTime \u00e0 partir de context.nowTime (' +
        nowTime +
        '). INTERDIT d\'inventer 08:xx ou toute autre heure absolue \u00e0 la place.',
      '- Refus / skip d\'un d\u00e9tail optionnel (\u00ab\u00a0rien\u00a0\u00bb, \u00ab\u00a0non\u00a0\u00bb, \u00ab\u00a0pas besoin\u00a0\u00bb, \u00ab\u00a0skip\u00a0\u00bb)\u00a0: \u00ab\u00a0Okay.\u00a0\u00bb, actions=[], ne repose pas la question.',
      '- Une seule invitation max pour un d\u00e9tail optionnel\u00a0; si l\'utilisateur change de sujet, suis la nouvelle demande.',
      '\u00c9ch\u00e9ance (dueTime optionnel sauf d\u00e9lai relatif)\u00a0:',
      '- Si une date est connue (ex. \u00ab\u00a0aujourd\'hui\u00a0\u00bb, \u00ab\u00a0demain\u00a0\u00bb, \u00ab\u00a02026-07-14\u00a0\u00bb)\u00a0: APPLIQUE set_due avec dueDate (+ dueEnabled:true) TOUT DE SUITE, m\u00eame sans heure.',
      '- dueTime est OPTIONNEL pour une date seule. Ne demande JAMAIS l\'heure avant d\'avoir pos\u00e9 la date.',
      '- Si l\'utilisateur donne un d\u00e9lai (\u00ab\u00a0dans N minutes/heures\u00a0\u00bb)\u00a0: APPLIQUE set_due avec relativeMinutes/relativeHours (+ dueEnabled:true) TOUT DE SUITE. Ne redemande pas date ni heure.',
      '- Ex. d\u00e9lai\u00a0: user \u00ab\u00a0dans 15 minutes\u00a0\u00bb \u2192 {"message":"Okay, dans 15 minutes.","suggestions":["Marquer bloqu\u00e9","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_due","args":{"relativeMinutes":15,"dueEnabled":true}}]}',
      '- Ex. d\u00e9lai heures\u00a0: user \u00ab\u00a0dans 2 heures\u00a0\u00bb \u2192 {"message":"Okay, dans 2 heures.","suggestions":["Marquer bloqu\u00e9","Ajouter une sous-t\u00e2che"],"followUps":[],"actions":[{"tool":"set_due","args":{"relativeHours":2,"dueEnabled":true}}]}',
      '- Ex. tour 1\u00a0: user \u00ab\u00a0mark \u00e9ch\u00e9ance for today\u00a0\u00bb \u2192 {"message":"Okay, c\'est fait. Quelle heure?","suggestions":["09:00","12:00","17:00","Pas d\'heure"],"followUps":[],"actions":[{"tool":"set_due","args":{"dueDate":"' +
        today +
        '","dueEnabled":true}}]}',
      '- Ex. tour 2 heure\u00a0: user \u00ab\u00a014:00\u00a0\u00bb \u2192 {"message":"Okay, 14:00.","suggestions":["Marquer bloqu\u00e9","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_due","args":{"dueTime":"14:00","dueEnabled":true}}]}',
      '- Ex. refus heure\u00a0: user \u00ab\u00a0pas d\'heure\u00a0\u00bb \u2192 {"message":"Okay.","suggestions":["Marquer bloqu\u00e9","Ajouter une sous-t\u00e2che"],"followUps":[],"actions":[]}',
      '- Si \u00ab\u00a0d\u00e9finir une \u00e9ch\u00e9ance\u00a0\u00bb SANS aucune date\u00a0: alors seulement demander la date (obligatoire). actions=[].',
      '- Ex. sans date\u00a0: user \u00ab\u00a0D\u00e9finir une \u00e9ch\u00e9ance\u00a0\u00bb \u2192 {"message":"Pour quelle date?","suggestions":["Aujourd\'hui","Demain","Vendredi"],"followUps":[],"actions":[]}',
      'Bloquer une carte (agir d\'abord, motif ensuite)\u00a0:',
      '- Si l\'utilisateur demande de marquer bloqu\u00e9 / en attente SANS donner de motif\u00a0: APPLIQUE TOUT DE SUITE set_blocked avec enAttente:true (sans blockedReasons), puis confirme et demande le motif en option.',
      '- Ex. tour 1\u00a0: user \u00ab\u00a0Marquer la t\u00e2che comme bloqu\u00e9e\u00a0\u00bb \u2192 {"message":"Okay, bloqu\u00e9. Quel est le motif?","suggestions":["En attente d\'une approbation","En attente d\'une r\u00e9ponse","Bloqu\u00e9 \u00e0 cause du mat\u00e9riel"],"followUps":[],"actions":[{"tool":"set_blocked","args":{"enAttente":true}}]}',
      '- Ne JAMAIS r\u00e9pondre seulement \u00ab\u00a0Quel est le motif?\u00a0\u00bb sans avoir d\'abord appel\u00e9 set_blocked.',
      '- Si l\'utilisateur donne ensuite un motif\u00a0: applique set_blocked avec blockedReasons (enAttente reste true) et confirme bri\u00e8vement.',
      '- Ex. tour 2\u00a0: user \u00ab\u00a0En attente d\'une approbation\u00a0\u00bb \u2192 {"message":"Okay, not\u00e9\u00a0: en attente d\'une approbation.","suggestions":["D\u00e9finir une \u00e9ch\u00e9ance","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_blocked","args":{"enAttente":true,"blockedReasons":["En attente d\'une approbation"]}}]}',
      '- Si le motif est d\u00e9j\u00e0 dans la demande initiale\u00a0: set_blocked avec enAttente:true + blockedReasons en un seul tour.',
      '- Lien vers une sous-t\u00e2che (attente d\'une autre t\u00e2che)\u00a0: set_blocked avec blockedLinks (id ou matchText depuis progress.items). Le runtime ajoute le motif \u00ab\u00a0En attente d\'une autre t\u00e2che\u00a0\u00bb si besoin.',
      '- Ex. lien\u00a0: user \u00ab\u00a0Bloqu\u00e9 en attendant Contacter Ian\u00a0\u00bb \u2192 {"message":"Okay, bloqu\u00e9 sur Contacter Ian.","suggestions":["D\u00e9finir une \u00e9ch\u00e9ance","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_blocked","args":{"enAttente":true,"blockedLinks":[{"matchText":"Contacter Ian"}]}}]}',
      '- D\u00e9bloquer\u00a0: set_blocked avec enAttente:false (ou blockedReasons:[], blockedLinks:[]).',
      'Sous-t\u00e2ches (progress.items du contexte)\u00a0:',
      '- Les sous-t\u00e2ches existantes sont dans context.progress.items (id + text). Quand l\'utilisateur cite un nom (\u00ab\u00a0Contacter Ian\u00a0\u00bb, etc.), c\'est une sous-t\u00e2che\u00a0: retrouve-la dans items.',
      '- Pour toute op\u00e9ration sur une sous-t\u00e2che existante\u00a0: passer id OU matchText (libell\u00e9 actuel).',
      '- Ajout\u00a0: sans nom \u2192 demander le nom, actions=[]. Avec un nom \u2192 add_subtask tout de suite.',
      '- Renommer\u00a0: rename_subtask avec text (nouveau) + id/matchText.',
      '- Supprimer\u00a0: remove_subtask avec id/matchText.',
      '- Terminer / cocher\u00a0: toggle_subtask avec done:true (ou set_subtask_progress \u00e0 100).',
      '- Progress partiel d\'une sous-t\u00e2che\u00a0: set_subtask_progress.',
      '- Tout terminer\u00a0: complete_all_subtasks. Tout remettre \u00e0 0\u00a0: reset_progress (includeCompleted:true par d\u00e9faut).',
      '- Ex. ajout tour 1\u00a0: user \u00ab\u00a0Ajouter une sous-t\u00e2che\u00a0\u00bb \u2192 {"message":"Quel est le nom de la sous-t\u00e2che?","suggestions":["V\u00e9rifier le stock","Contacter le client"],"followUps":[],"actions":[]}',
      '- Ex. ajout tour 2\u00a0: user \u00ab\u00a0Commander le mat\u00e9riel\u00a0\u00bb \u2192 {"message":"Okay, ajout\u00e9e.","suggestions":["Ajouter une autre sous-t\u00e2che","D\u00e9finir une \u00e9ch\u00e9ance"],"followUps":[],"actions":[{"tool":"add_subtask","args":{"text":"Commander le mat\u00e9riel"}}]}',
      '- Ex. renommer\u00a0: user \u00ab\u00a0Rename \'Contacter Ian\' to \'Appeler Ian\'\u00a0\u00bb \u2192 {"message":"Okay, renomm\u00e9e.","suggestions":["Ajouter une sous-t\u00e2che","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"rename_subtask","args":{"matchText":"Contacter Ian","text":"Appeler Ian"}}]}',
      '- Ex. supprimer\u00a0: user \u00ab\u00a0Supprime Contacter Ian\u00a0\u00bb \u2192 {"message":"Okay, supprim\u00e9e.","suggestions":["Ajouter une sous-t\u00e2che","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"remove_subtask","args":{"matchText":"Contacter Ian"}}]}',
      'Priorit\u00e9 / progr\u00e8s / formule / statut\u00a0:',
      '- Priorit\u00e9 (agir d\'abord \u2014 tr\u00e8s important)\u00a0:',
      '  \u00b7 Si l\'utilisateur cite un PALIER (Critique, Urgente, Prioritaire, Importante, Flexible, Secondaire, Optionnelle)\u00a0: APPLIQUE TOUT DE SUITE set_priority avec tier (m\u00eame libell\u00e9), M\u00caEME SANS chiffres d\'axes.',
      '  \u00b7 INTERDIT de demander urgence/impact/facilit\u00e9 AVANT d\'avoir appliqu\u00e9 le palier. Les axes sont OPTIONNELS apr\u00e8s.',
      '  \u00b7 Apr\u00e8s application du palier\u00a0: confirme bri\u00e8vement et propose d\'affiner via prompts (type priority_axes) \u2014 PAS une question texte qui bloque sans actions.',
      '  \u00b7 Ex. palier\u00a0: user \u00ab\u00a0change priority for flexible\u00a0\u00bb / \u00ab\u00a0Mets Flexible\u00a0\u00bb \u2192 {"message":"Okay, Flexible. Tu peux encore peaufiner urgence / impact / facilit\u00e9 si tu veux.","suggestions":["C\'est bon","D\u00e9finir une \u00e9ch\u00e9ance"],"followUps":[],"prompts":[{"type":"priority_axes","urgency":1,"impact":2,"ease":3}],"actions":[{"tool":"set_priority","args":{"tier":"Flexible"}}]}',
      '  \u00b7 Ex. Critique\u00a0: user \u00ab\u00a0Mets Critique\u00a0\u00bb \u2192 {"message":"Okay, Critique.","suggestions":["D\u00e9finir une \u00e9ch\u00e9ance","Marquer bloqu\u00e9"],"followUps":[],"prompts":[{"type":"priority_axes","urgency":4,"impact":4,"ease":5}],"actions":[{"tool":"set_priority","args":{"tier":"Critique"}}]}',
      '  \u00b7 Axes fournis explicitement (urgence/impact/facilit\u00e9)\u00a0: applique set_priority avec ces valeurs tout de suite (prompts=[]).',
      '  \u00b7 Dur\u00e9e estim\u00e9e\u00a0: set_priority avec estimatedDurationMinutes (nombre) ou estimatedDuration (texte FR/EN). Ind\u00e9pendant de ease.',
      '  \u00b7 Port\u00e9e\u00a0: impact 0\u20134 = Personnel / \u00c9quipe / Interne / Population / Global.',
      '  \u00b7 Demande vraiment vague SANS palier NI axes (\u00ab\u00a0mettre \u00e0 jour la priorit\u00e9\u00a0\u00bb)\u00a0: alors seulement propose prompts priority_axes (pr\u00e9rempli avec context.priority) OU une courte question de palier\u00a0; n\'invente pas de palier.',
      '- Si l\'utilisateur active le progr\u00e8s sans chiffre\u00a0: set_progress avec progressEnabled:true tout de suite, puis demande le % en option.',
      '- set_progress avec un % \u00e9chelonne les sous-t\u00e2ches (master) s\'il y en a\u00a0; sinon progres carte.',
      '- Formule de score\u00a0: set_formula avec baseline | eisenhower | wsjf | valueEffort (context.formula = actuelle).',
      '- Statut / colonne Trello\u00a0: set_statut avec listId, matchList (nom de liste) ou category (blocked|completed|active|backlog\u2026) d\'apr\u00e8s context.statut.',
      '- Ex. statut\u00a0: user \u00ab\u00a0Passe en Terminé\u00a0\u00bb \u2192 {"message":"Okay, d\u00e9plac\u00e9e.","suggestions":["Quelle est la priorit\u00e9?","Ajouter une sous-t\u00e2che"],"followUps":[],"actions":[{"tool":"set_statut","args":{"category":"completed"}}]}',
      '- Ex. projet\u00a0: user \u00ab\u00a0Lie au projet Sport 2026\u00a0\u00bb \u2192 {"message":"Okay, li\u00e9e \u00e0 Sport 2026.","suggestions":["Quelle est la priorit\u00e9?","Ajouter une sous-t\u00e2che"],"followUps":[],"actions":[{"tool":"set_project","args":{"matchText":"Sport 2026"}}]}',
      '- Ex. d\u00e9lier projet\u00a0: user \u00ab\u00a0Enl\u00e8ve le projet\u00a0\u00bb \u2192 {"message":"Okay, projet d\u00e9li\u00e9.","suggestions":["Lier un projet","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_project","args":{"clear":true}}]}',
      'Titre et description de la carte (context.cardName / context.cardDesc)\u00a0:',
      '- Renommer le titre de la carte\u00a0: rename_card avec name (nouveau titre complet).',
      '- Modifier la description\u00a0: set_description avec desc (texte complet \u00e0 \u00e9crire dans context.cardDesc\u00a0; "" pour effacer).',
      '- Distingue bien rename_card (titre), set_description (corps de la carte) et rename_subtask (une entr\u00e9e de progress.items).',
      '- Si l\'utilisateur dit d\'ajouter un suffixe (\u00ab\u00a0ajoute 2\u00a0\u00bb, \u00ab\u00a0ajoute WIP\u00a0\u00bb)\u00a0: construis le nouveau name \u00e0 partir de context.cardName + suffixe.',
      '- Si l\'utilisateur demande d\'ajouter / r\u00e9\u00e9crire / compl\u00e9ter la description\u00a0: construis le desc final \u00e0 partir de context.cardDesc + la demande, puis APPLIQUE set_description.',
      '- Ex. renommer carte\u00a0: user \u00ab\u00a0Renomme la carte en Plan Q3\u00a0\u00bb \u2192 {"message":"Okay, renomm\u00e9e.","suggestions":["Ajouter une sous-t\u00e2che","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"rename_card","args":{"name":"Plan Q3"}}]}',
      '- Ex. suffixe\u00a0: context.cardName=\u00ab\u00a0Brief client\u00a0\u00bb, user \u00ab\u00a0ajoute 2 \u00e0 la fin\u00a0\u00bb \u2192 {"message":"Okay, Brief client 2.","suggestions":["Ajouter une sous-t\u00e2che","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"rename_card","args":{"name":"Brief client 2"}}]}',
      '- Ex. description\u00a0: user \u00ab\u00a0Mets en description\u00a0: Valider le brief avec Ian\u00a0\u00bb \u2192 {"message":"Okay, description mise \u00e0 jour.","suggestions":["Ajouter une sous-t\u00e2che","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_description","args":{"desc":"Valider le brief avec Ian"}}]}',
      'R\u00e8gles prompts (contr\u00f4les interactifs, optionnel)\u00a0:',
      '- 0 \u00e0 2 prompts UI au-del\u00e0 du texte (ex. curseurs). L\'utilisateur peut les utiliser ou ignorer.',
      '- type "priority_axes"\u00a0: affiche curseurs Urgence (0\u20134), Impact (0\u20134), Facilit\u00e9 (1\u20135). Champs urgency/impact/ease = valeurs initiales (apr\u00e8s un palier\u00a0: presets du palier ou context.priority).',
      '- Utilise priority_axes juste APR\u00c8S avoir appliqu\u00e9 un palier, ou quand l\'utilisateur veut affiner sans donner de chiffres.',
      '- INTERDIT d\'utiliser prompts \u00e0 la place d\'actions quand un palier est d\u00e9j\u00e0 cit\u00e9\u00a0: actions d\'abord, prompts ensuite.',
      'R\u00e8gles suggestions (obligatoire)\u00a0:',
      '- Toujours proposer 2 \u00e0 4 formulations courtes en fran\u00e7ais (questions OU r\u00e9ponses \u00e0 ta question de clarification).',
      '- Ancr\u00e9es dans le contexte carte (sections enabled, \u00e9ch\u00e9ance, blocage, progr\u00e8s).',
      '- Elles REMPLACENT les suggestions pr\u00e9c\u00e9dentes\u00a0: varie-les selon ta derni\u00e8re r\u00e9ponse.',
      '- Pas de num\u00e9rotation, pas de guillemets autour.',
      '- INTERDIT\u00a0: placeholders comme "..." , "\u2026" , "suggestion" , "exemple"\u00a0; chaque entr\u00e9e doit \u00eatre un vrai texte cliquable.',
      '- \u00c9chelle / choix ordonn\u00e9s (facilit\u00e9, gravit\u00e9, urgence\u2026)\u00a0: TOUJOURS vert\u2192rouge (gauche\u2192droite). FAUX\u00a0: facile, difficile, faisable. VRAI\u00a0: facile, faisable, difficile. heat 0\u20134 ou color ("green"|"yellow"|"orange"|"red"). Ex.\u00a0: {"label":"C\'est facile","heat":0}. suggestionScale:true encourag\u00e9.',
      'R\u00e8gles actions (appliqu\u00e9es automatiquement)\u00a0:',
      '- 0 \u00e0 3 outils \u00e0 ex\u00e9cuter tout de suite d\u00e8s qu\'une action partielle est possible (ne pas attendre les d\u00e9tails optionnels).',
      '- Ne jamais inclure un outil incomplet sur un champ OBLIGATOIRE (ex. add_subtask sans text non vide).',
      '- set_due sans dueTime est VALIDE et pr\u00e9f\u00e9r\u00e9 quand l\'heure n\'est pas donn\u00e9e (sauf d\u00e9lai relatif\u00a0: utiliser relativeMinutes/relativeHours).',
      '- INTERDIT d\'affirmer dans message qu\'une modification est faite (ajout\u00e9e, mise \u00e0 jour, bloqu\u00e9e, c\'est fait\u2026) si le champ actions est vide. Sans outil, rien n\'est appliqu\u00e9.',
      '- Le runtime ex\u00e9cute actions et affiche un r\u00e9cap technique v\u00e9rifi\u00e9\u00a0; le message reste court, Teams-style (pote d\'\u00e9quipe, z\u00e9ro jargon).',
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
      '- Bloqu\u00e9 / en attente actif SEULEMENT si blocked.enabled=true (identique \u00e0 enAttente\u00a0; le motif s\u2019\u00e9dite sous Statut quand la carte est en Bloqu\u00e9).',
      '- Si blocked.enabled=false, la carte N\'EST PAS bloqu\u00e9e, m\u00eame si savedReasons contient d\'anciens motifs.',
      '- Progr\u00e8s actif seulement si progress.enabled=true.',
      '- Pour activer/d\u00e9sactiver\u00a0: priorityEnabled, dueEnabled, enAttente (Bloqu\u00e9), progressEnabled.',
      '- Pour marquer bloqu\u00e9\u00a0: set_blocked avec enAttente:true tout de suite (motifs ensuite si fournis). Ne dis jamais que c\'est d\u00e9j\u00e0 bloqu\u00e9 si enabled=false.',
      'Outils disponibles\u00a0:',
      '- set_priority: { urgency?:0-4, impact?:0-4, ease?:1-5, estimatedDurationMinutes?:number|null, estimatedDuration?:string, priorityEnabled?:boolean, tier?: string, heatTarget?: number } (tier = Critique|Urgente|Prioritaire|Importante|Flexible|Secondaire|Optionnelle\u00a0; impact 0\u20134 = port\u00e9e Personnel\u2026Global\u00a0; estimatedDuration = texte FR/EN ex. \u00ab\u00a02 jours\u00a0\u00bb)',
      '- set_due: { dueDate?: "YYYY-MM-DD"|null, dueTime?: "HH:MM"|null, dueEnabled?: boolean, relativeMinutes?: number, relativeHours?: number } (dueTime OPTIONNEL pour une date\u00a0; d\u00e9lai \u00ab\u00a0dans N min/h\u00a0\u00bb \u2192 relativeMinutes/relativeHours, calcul\u00e9 depuis context.nowTime\u00a0; aujourd\'hui = context.today)',
      '- set_blocked: { enAttente?: boolean, blockedReasons?: string[], blockedLinks?: [{id?:string, matchText?:string, label?:string}] } (enAttente:true seul suffit\u00a0; motifs et liens optionnels)',
      '- set_progress: { progress?:0-100, progressEnabled?: boolean } (master sur sous-t\u00e2ches si items\u00a0; sinon progres carte)',
      '- set_formula: { formula: "baseline"|"eisenhower"|"wsjf"|"valueEffort" }',
      '- set_statut: { listId?: string, matchList?: string, category?: string } (d\u00e9place la carte\u00a0; category ex. completed|blocked|started|backlog|triage|unstarted|canceled)',
      '- set_project: { projectId?: string, matchText?: string, name?: string, clear?: boolean } (lie la carte \u00e0 un projet Objectif\u00a0; clear:true d\u00e9lie\u00a0; matchText/name parmi context.goals.projects)',
      '- rename_card: { name: string } (nouveau titre de la carte\u00a0; name obligatoire, non vide)',
      '- set_description: { desc: string } (nouvelle description compl\u00e8te\u00a0; desc obligatoire en string, "" pour effacer)',
      '- add_subtask: { text: string } (text obligatoire, non vide)',
      '- rename_subtask: { text: string, id?: string, matchText?: string } (nouveau text\u00a0; id OU matchText)',
      '- remove_subtask: { id?: string, matchText?: string } (id OU matchText)',
      '- toggle_subtask: { id?: string, matchText?: string, done?: boolean }',
      '- set_subtask_progress: { id?: string, matchText?: string, progress: 0-100 }',
      '- complete_all_subtasks: {} (tout \u00e0 100%)',
      '- reset_progress: { includeCompleted?: boolean } (d\u00e9faut true\u00a0: tout \u00e0 0%\u00a0; false = seulement les non termin\u00e9es)',
      'M\u00e9moire plateau\u00a0: utilise les faits/summary du contexte pour personnaliser (noms, projets, normes). Ne contredis pas la m\u00e9moire sans raison.',
      'Profil utilisateur\u00a0: respecte context.profile (langue, ton, nom, r\u00f4le, notes, fonctionnalit\u00e9s actives).',
      'Contexte carte actuel (JSON)\u00a0:',
      JSON.stringify(context)
    ]).join('\n');
  }

  /**
   * Suggest ~3 follow-up subtasks for the Progress section.
   * @returns {Promise<string[]>}
   */
  async function suggestSubtasks(provider, context, options) {
    options = options || {};
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var ctx = context && typeof context === 'object' ? context : {};
    var existing = Array.isArray(ctx.existingSubtasks)
      ? ctx.existingSubtasks
      : Array.isArray(ctx.items)
        ? ctx.items.map(function (it) {
            return typeof it === 'string' ? it : it && it.text ? it.text : '';
          })
        : [];
    existing = existing
      .map(function (s) {
        return String(s || '').trim();
      })
      .filter(Boolean);

    var payload = {
      cardName: ctx.cardName || '',
      cardDesc: ctx.cardDesc || '',
      priorityLabel: ctx.priorityLabel || '',
      existingSubtasks: existing,
      memory: ctx.memory || null,
      boardDigest: typeof ctx.boardDigest === 'string' ? ctx.boardDigest.slice(0, 3000) : ''
    };

    var messages = [
      {
        role: 'system',
        content: [
          'Tu proposes des sous-t\u00e2ches de suivi pour une carte Trello (section Progr\u00e8s).',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":["\u2026","\u2026","\u2026"]}',
          'Exactement 3 suggestions si possible (2 minimum si le contexte est pauvre).',
          'Chaque suggestion = une action concr\u00e8te courte en fran\u00e7ais (pas une question).',
          'Inspire-toi du titre, de la description, de la priorit\u00e9, des sous-t\u00e2ches existantes et de la m\u00e9moire.',
          'Exemple\u00a0: titre \u00ab\u00a0Plan strat\u00e9gie de communication\u00a0\u00bb \u2192 \u00ab\u00a0Rencontrer tous les services\u00a0\u00bb.',
          'Exemple\u00a0: \u00ab\u00a0Archivage des rushs vid\u00e9os et projets DaVinci Resolve\u00a0\u00bb \u2192 stockage long terme + guide de proc\u00e9dure.',
          'INTERDIT\u00a0: dupliquer une sous-t\u00e2che existante (m\u00eame sens).',
          'INTERDIT\u00a0: placeholders, num\u00e9rotation, guillemets superflus.',
          'Contexte\u00a0:',
          JSON.stringify(payload)
        ].join('\n')
      },
      {
        role: 'user',
        content: 'Propose 3 sous-t\u00e2ches de suivi pertinentes.'
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 280,
        temperature: 0.55,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        response = await chatCompletions(p, messages, {
          jsonMode: false,
          max_tokens: 280,
          temperature: 0.55,
          stream: false
        });
      } else {
        console.error('PriorityAgent.suggestSubtasks failed', err);
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
        list = normalizeSuggestionList(raw.suggestions || raw.subtasks);
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

  /**
   * Suggest Vision / Mission / Projet names for board Objectifs settings.
   * context: { kind, boardName?, existingNames?, parentVision?, parentMission?, hierarchy? }
   */
  async function suggestGoals(provider, context, options) {
    options = options || {};
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var ctx = context && typeof context === 'object' ? context : {};
    var kind = ctx.kind === 'mission' || ctx.kind === 'project' ? ctx.kind : 'vision';
    var existing = Array.isArray(ctx.existingNames)
      ? ctx.existingNames
          .map(function (s) {
            return String(s || '').trim();
          })
          .filter(Boolean)
      : [];

    var kindLabel =
      kind === 'mission' ? 'missions' : kind === 'project' ? 'projets' : 'visions';
    var kindOne =
      kind === 'mission' ? 'mission' : kind === 'project' ? 'projet' : 'vision';

    var payload = {
      kind: kind,
      boardName: typeof ctx.boardName === 'string' ? ctx.boardName.slice(0, 200) : '',
      parentVision: typeof ctx.parentVision === 'string' ? ctx.parentVision.slice(0, 200) : '',
      parentMission: typeof ctx.parentMission === 'string' ? ctx.parentMission.slice(0, 200) : '',
      existingNames: existing.slice(0, 40),
      hierarchy: ctx.hierarchy && typeof ctx.hierarchy === 'object' ? ctx.hierarchy : null
    };

    var roleHints = {
      vision:
        'Une vision = ambition strat\u00e9gique durable (ex. \u00ab\u00a0Devenir la r\u00e9f\u00e9rence locale en formation\u00a0\u00bb).',
      mission:
        'Une mission = axe concret sous la vision, souvent mesurable (ex. \u00ab\u00a0Doubler les inscriptions Q4\u00a0\u00bb).',
      project:
        'Un projet = chantier op\u00e9rationnel sous la mission (ex. \u00ab\u00a0Campagne rentr\u00e9e 2026\u00a0\u00bb).'
    };

    var messages = [
      {
        role: 'system',
        content: [
          'Tu proposes des noms d\'objectifs pour un Power-Up Trello (hi\u00e9rarchie Vision \u2192 Mission \u2192 Projet).',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":["\u2026","\u2026","\u2026"]}',
          'Exactement 3 suggestions si possible (2 minimum si le contexte est pauvre).',
          'Chaque suggestion = un nom court en fran\u00e7ais (pas une question, pas de num\u00e9rotation).',
          roleHints[kind],
          'Inspire-toi du tableau, des parents et de la hi\u00e9rarchie existante.',
          'INTERDIT\u00a0: dupliquer un nom existant (m\u00eame sens).',
          'INTERDIT\u00a0: placeholders, guillemets superflus, formulations trop g\u00e9n\u00e9riques (\u00ab\u00a0Nouvelle vision\u00a0\u00bb).',
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
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
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
      'Tu es l\'assistant m\u00e9moire Priorit\u00e9 (Trello)\u00a0: un coll\u00e8gue sur Teams qui aide \u00e0 se souvenir du contexte.',
      'Tu parles en fran\u00e7ais, tu tutoyes, ton naturel et amical\u00a0: z\u00e9ro jargon, z\u00e9ro ton support.',
      'Voix\u00a0: comme un message Teams \u00e0 un pote d\'\u00e9quipe. Court, clair, humain.',
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
    messages.push({ role: 'user', content: String(userText || '').trim() });

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 420,
        temperature: 0.5,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        response = await chatCompletions(p, messages, {
          jsonMode: false,
          max_tokens: 420,
          temperature: 0.5,
          stream: false
        });
      } else {
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

    return {
      message: typeof data.message === 'string' ? data.message.trim() : '',
      suggestions: normalizeSuggestionList(data.suggestions),
      patches: patches,
      rawJson: content,
      usage: extractUsageFromRaw(response && response.raw)
    };
  }

  // ── Card first-open interview (Akinator / Q20) ────────────────────────────

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

  /**
   * First-open card interview turn (one question at a time).
   * Returns { message, suggestions, actions, prompts, followUps, completeInterview,
   *   droppedActions, rawJson, usage, context }.
   */
  async function cardInterviewTurn(provider, history, bridge, userText, options) {
    options = options || {};
    var onDelta = typeof options.onDelta === 'function' ? options.onDelta : null;
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      return {
        message: 'Configurez d\'abord un fournisseur IA dans les param\u00e8tres.',
        suggestions: [],
        actions: [],
        prompts: [],
        followUps: [],
        cardPatches: [],
        completeInterview: false,
        droppedActions: [],
        rawJson: '',
        usage: null,
        context: null
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

    var system = [
      'Tu es l\'assistant Priorit\u00e9 Trello en mode INTERVIEW premi\u00e8re ouverture.',
      'Tu parles en fran\u00e7ais, simplement, comme un coll\u00e8gue qui aide \u00e0 cadrer la carte.',
      'Objectif\u00a0: d\u00e9duire Urgence (0\u20134), Impact/port\u00e9e (0\u20134) et Facilit\u00e9 (1\u20135) \u2014 OBLIGATOIRE avant de terminer \u2014 puis optionnellement dur\u00e9e, \u00e9ch\u00e9ance, projet.',
      '',
      'Style conversationnel (tr\u00e8s important)\u00a0:',
      '- Pose UNE question en langage naturel. JAMAIS de chiffres ni d\'\u00e9chelles \u00ab\u00a00 \u00e0 4\u00a0\u00bb / \u00ab\u00a01 \u00e0 5\u00a0\u00bb dans la question ni dans les suggestions.',
      '- message = uniquement la prochaine question (1 phrase). Pas de pr\u00e9ambule.',
      '- INTERDIT de r\u00e9capituler ce qui a d\u00e9j\u00e0 \u00e9t\u00e9 dit (\u00ab\u00a0Pour r\u00e9capituler\u00a0\u00bb, \u00ab\u00a0on a \u00e9tabli que\u00a0\u00bb, \u00ab\u00a0cela semble bien cadr\u00e9\u00a0\u00bb, \u00ab\u00a0en r\u00e9sum\u00e9\u00a0\u00bb, reformuler urgence/impact/facilit\u00e9 d\u00e9j\u00e0 obtenus).',
      '- INTERDIT aussi les accroches de conclusion (\u00ab\u00a0Pour finir\u00a0\u00bb, \u00ab\u00a0Pour terminer\u00a0\u00bb, \u00ab\u00a0Une derni\u00e8re question\u00a0\u00bb, \u00ab\u00a0Enfin\u00a0\u00bb)\u00a0: pose la question directement.',
      '- Ex. FAUX\u00a0: \u00ab\u00a0Pour r\u00e9capituler, \u2026 cela demande un peu de travail. Est-ce qu\'il y a une dur\u00e9e estim\u00e9e\u00a0?\u00a0\u00bb',
      '- Ex. FAUX\u00a0: \u00ab\u00a0Pour finir, quelle serait la dur\u00e9e estim\u00e9e\u00a0?\u00a0\u00bb',
      '- Ex. FAUX\u00a0: \u00ab\u00a0Pour conclure, souhaites-tu d\u00e9finir une \u00e9ch\u00e9ance pour cette t\u00e2che\u00a0?\u00a0\u00bb',
      '- Ex. FAUX\u00a0: \u00ab\u00a0Je peux d\u00e9finir l\'\u00e9ch\u00e9ance \u00e0 demain. Je m\'en occupe\u00a0?\u00a0\u00bb',
      '- Ex. VRAI\u00a0: \u00ab\u00a0Quelle est la date d\'\u00e9ch\u00e9ance\u00a0?\u00a0\u00bb',
      '- Ex. VRAI (si tu proposes d\u00e9j\u00e0 un jour)\u00a0: \u00ab\u00a0Veux-tu d\u00e9finir la date limite \u00e0 demain\u00a0?\u00a0\u00bb',
      '- Ex. VRAI\u00a0: \u00ab\u00a0Quelle est la dur\u00e9e estim\u00e9e\u00a0?\u00a0\u00bb',
      '- Questions DIRECTES\u00a0: demande la valeur (date, dur\u00e9e, projet). INTERDIT les offres molles sans date (\u00ab\u00a0souhaites-tu d\u00e9finir une \u00e9ch\u00e9ance\u00a0?\u00a0\u00bb, \u00ab\u00a0est-ce qu\'il y a une \u00e9ch\u00e9ance\u00a0?\u00a0\u00bb, \u00ab\u00a0Je peux\u2026 / Je m\'en occupe\u00a0?\u00a0\u00bb).',
      '- Si tu proposes un jour concret (demain, vendredi\u2026) pour confirmation\u00a0: \u00ab\u00a0Veux-tu d\u00e9finir la date limite \u00e0 \u2026\u00a0?\u00a0\u00bb \u2014 pas \u00ab\u00a0Je peux / Je m\'en occupe\u00a0?\u00a0\u00bb.',
      '- Si la r\u00e9ponse est \u00ab\u00a0non\u00a0\u00bb / \u00ab\u00a0pas d\'\u00e9ch\u00e9ance\u00a0\u00bb / skip\u00a0: okay et passe \u00e0 autre chose (ou completeInterview).',
      '- Les gens r\u00e9pondent avec des mots\u00a0; TOI tu traduis en axes dans actions (set_priority).',
      '- INCORPORE le titre (context.cardName) dans la question, conjug\u00e9 naturellement \u2014 PAS \u00ab\u00a0cette t\u00e2che\u00a0\u00bb / \u00ab\u00a0cette carte\u00a0\u00bb si le titre est clair.',
      '- Ex. titre \u00ab\u00a0Manger plus de pain avec Eiraul\u00a0\u00bb \u2192 \u00ab\u00a0Quelle serait la cons\u00e9quence de ne pas manger plus de pain avec Eiraul\u00a0?\u00a0\u00bb',
      '- Ex. urgence (mauvais)\u00a0: \u00ab\u00a0Si cette t\u00e2che n\'\u00e9tait pas faite, quelles seraient les cons\u00e9quences\u00a0?\u00a0\u00bb \u2014 INTERDIT quand le titre se pr\u00eate \u00e0 \u00eatre cit\u00e9.',
      '- Ex. impact\u00a0: \u00ab\u00a0Qui serait le plus touch\u00e9 si on ne mangeait pas plus de pain avec Eiraul\u00a0?\u00a0\u00bb',
      '- Ex. facilit\u00e9\u00a0: \u00ab\u00a0Manger plus de pain avec Eiraul, c\'est simple ou \u00e7a demande du travail\u00a0?\u00a0\u00bb',
      '- Si le titre est trop long / cryptique\u00a0: raccourcis-le ou reformule-le sans perdre le sens (pas de guillemets lourds autour du titre).',
      '- Suggestions = r\u00e9ponses courtes en mots (2\u20134), pas des nombres. Ex.\u00a0: \u00ab\u00a0Pas grand-chose\u00a0\u00bb, \u00ab\u00a0Quelqu\'un attend\u00a0\u00bb, \u00ab\u00a0\u00c7a bloque d\'autres trucs\u00a0\u00bb, \u00ab\u00a0Cons\u00e9quences graves\u00a0\u00bb.',
      '- Ordonne TOUJOURS les suggestions du plus doux / simple / faible (VERT, gauche) au plus intense / difficile / grave (ROUGE, droite).',
      '- INTERDIT de mettre le plus difficile avant le milieu. Ex. FAUX\u00a0: \u00ab\u00a0C\'est facile\u00a0\u00bb, \u00ab\u00a0C\'est difficile\u00a0\u00bb, \u00ab\u00a0C\'est faisable mais avec des efforts\u00a0\u00bb.',
      '- Ex. VRAI facilit\u00e9\u00a0: \u00ab\u00a0C\'est facile\u00a0\u00bb (vert) \u2192 \u00ab\u00a0C\'est faisable\u00a0\u00bb / \u00ab\u00a0avec des efforts\u00a0\u00bb (jaune) \u2192 \u00ab\u00a0C\'est difficile\u00a0\u00bb (rouge).',
      '- Colorie automatiquement chaque r\u00e9ponse d\'\u00e9chelle avec heat 0\u20134 (0=vert, 4=rouge), OU suggestionScale:true + strings ordonn\u00e9es.',
      '- Ex. facilit\u00e9 JSON\u00a0: {"suggestions":[{"label":"C\'est facile","heat":0},{"label":"C\'est faisable","heat":2},{"label":"C\'est difficile","heat":4}],"suggestionScale":true}',
      '- Ex. urgence (doux\u2192grave)\u00a0: heat 0 \u00ab\u00a0Pas grand-chose\u00a0\u00bb \u2026 heat 4 \u00ab\u00a0Cons\u00e9quences graves\u00a0\u00bb.',
      '- Utilise \u2026 seulement pour une r\u00e9ponse \u00e0 compl\u00e9ter (ex. \u00ab\u00a0\u2026 attend\u00a0\u00bb).',
      '',
      'Inf\u00e9rence + m\u00e9moire carte\u00a0:',
      '- D\u00e8s qu\'une r\u00e9ponse laisse assez d\'indices\u00a0: set_priority IMM\u00c9DIATEMENT avec les axes d\u00e9duits, puis pose directement la question suivante (sans r\u00e9sumer).',
      '- Ex.\u00a0: \u00ab\u00a0Marie-Laure serait vraiment tr\u00e8s f\u00e2ch\u00e9e\u00a0\u00bb \u2192 urgence \u00e9lev\u00e9e (3\u20134) + cardPatches remember (\u00ab\u00a0Marie-Laure attend cette t\u00e2che / serait tr\u00e8s f\u00e2ch\u00e9e si non faite\u00a0\u00bb) + message = seule la question suivante.',
      '- M\u00e9morise les faits utiles \u00e0 CETTE carte via cardPatches (personnes, enjeux, attentes, contraintes)\u00a0: {"op":"remember","text":"\u2026"}.',
      '- Ne repose pas ce qui est d\u00e9j\u00e0 dans context.cardMemory.facts ou dans l\'historique.',
      '',
      'Le TITRE de la carte (cardName) est ta piste principale\u00a0: ancre chaque question dessus. Les cartes voisines et r\u00e9centes aident \u00e0 affiner.',
      'Les axes priority actuels sont des VALEURS PAR D\u00c9FAUT non fiables sauf si priorityAxesTrusted=true.',
      '',
      'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
      '{"thinking":"...","message":"...","suggestions":[{"label":"...","heat":0}],"suggestionScale":true,"prompts":[],"actions":[{"tool":"...","args":{}}],"cardPatches":[{"op":"remember","text":"..."}],"completeInterview":false}',
      '',
      'R\u00e8gles interview\u00a0:',
      '- Une question claire \u00e0 la fois\u00a0; message = UNIQUEMENT cette question (1 phrase). Pas de pr\u00e9ambule.',
      '- INTERDIT les r\u00e9caps / synth\u00e8ses entre questions. Le contexte et les actions suffisent.',
      '- INTERDIT de cadrer une question comme \u00ab\u00a0la derni\u00e8re\u00a0\u00bb ou une conclusion\u00a0: jamais \u00ab\u00a0Pour finir\u00a0\u00bb, \u00ab\u00a0Pour terminer\u00a0\u00bb, \u00ab\u00a0Pour conclure\u00a0\u00bb, \u00ab\u00a0Enfin\u00a0\u00bb, \u00ab\u00a0Une derni\u00e8re question\u00a0\u00bb, \u00ab\u00a0Dernier point\u00a0\u00bb, \u00ab\u00a0Avant de conclure\u00a0\u00bb, \u00ab\u00a0Pour clore\u00a0\u00bb.',
      '- Pose simplement la prochaine question utile. Ne dis JAMAIS que c\'est la fin / le dernier tour \u2014 ni dans le message, ni dans thinking comme excuse pour une cl\u00f4ture verbeuse.',
      '- Quand tu n\'as plus de question utile (urgence+impact+ease fix\u00e9s et rien d\'autre \u00e0 creuser)\u00a0: completeInterview:true et message court du type \u00ab\u00a0Okay.\u00a0\u00bb / \u00ab\u00a0C\'est not\u00e9.\u00a0\u00bb (sans annoncer une conclusion).',
      '- INTERDIT de demander \u00ab\u00a0sur une \u00e9chelle de 0 \u00e0 4\u00a0\u00bb, des chiffres seuls, ou des l\u00e9gendes (0 = \u2026, 4 = \u2026).',
      '- Maximise le gain d\'information pour urgence / impact / facilit\u00e9 via des situations concr\u00e8tes.',
      '- N\'invente PAS d\'\u00e9ch\u00e9ance, projet ou sous-t\u00e2ches sans indice (titre, r\u00e9ponse, voisinage).',
      '- Si l\'utilisateur dit passer / plus tard / skip / non merci\u00a0: completeInterview:true, actions=[] (sauf ce que tu as d\u00e9j\u00e0 assez pour appliquer).',
      '- Quand urgence+impact+ease sont fix\u00e9s (via actions cette tour ou tours pr\u00e9c\u00e9dents)\u00a0: tu peux encore poser UNE question optionnelle utile (dur\u00e9e, \u00e9ch\u00e9ance, projet) SANS dire que c\'est la derni\u00e8re\u00a0; sinon completeInterview:true.',
      '- Pour \u00e9ch\u00e9ance\u00a0: \u00ab\u00a0Quelle est la date d\'\u00e9ch\u00e9ance\u00a0?\u00a0\u00bb (+ suggestions Aujourd\'hui / Demain / Pas d\'\u00e9ch\u00e9ance). INTERDIT \u00ab\u00a0souhaites-tu d\u00e9finir une \u00e9ch\u00e9ance\u00a0?\u00a0\u00bb.',
      '- Pour dur\u00e9e\u00a0: \u00ab\u00a0Quelle est la dur\u00e9e estim\u00e9e\u00a0?\u00a0\u00bb. Pour projet\u00a0: \u00ab\u00a0\u00c0 quel projet la lier\u00a0?\u00a0\u00bb.',
      '- completeInterview:true quand l\'interview est termin\u00e9e (silencieusement).',
      '- \u00c9vite de reposer les questions d\u00e9j\u00e0 pos\u00e9es.',
      '- INTERDIT\u00a0: \u00ab\u00a0Comment puis-je vous aider?\u00a0\u00bb / questions vagues ouvertes.',
      '',
      'Outils autoris\u00e9s dans actions\u00a0:',
      '- set_priority: { urgency?, impact?, ease?, tier?, estimatedDurationMinutes?, priorityEnabled? }',
      '- set_due: { dueDate?: YYYY-MM-DD, dueTime?: HH:MM, relativeHours?, relativeMinutes?, clear? }',
      '- set_project: { projectId?, matchText?, name?, clear? }',
      '- add_subtask: { text } (rare, seulement si tr\u00e8s clair)',
      '- prompts optionnels: [{ "type":"priority_axes", "urgency":n, "impact":n, "ease":n }] (apr\u00e8s inf\u00e9rence, pour affiner visuellement)',
      '',
      'Contexte carte / interview\u00a0:',
      JSON.stringify({
        today: context.today,
        nowTime: context.nowTime,
        cardName: context.cardName,
        cardDesc: context.cardDesc,
        priority: context.priority,
        goals: context.goals || null,
        memory: context.memory,
        cardMemory: context.cardMemory || { facts: [] },
        profile: context.profile,
        asked: context.interview.asked,
        surrounding: context.interview.surrounding,
        recentCards: context.interview.recentCards,
        priorityAxesTrusted: context.interview.priorityAxesTrusted
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
    messages.push({ role: 'user', content: String(userText || '').trim() });

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
          max_tokens: 520,
          temperature: 0.45,
          onDelta: onDelta
            ? function (_piece, accumulated) {
                notifyVisible(accumulated);
              }
            : undefined
        });
      } catch (err) {
        if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            stream: !!onDelta,
            max_tokens: 520,
            temperature: 0.45,
            onDelta: onDelta
              ? function (_piece, accumulated) {
                  notifyVisible(accumulated);
                }
              : undefined
          });
        } else if (err && /stream/i.test((err && err.message) || '')) {
          response = await chatCompletions(p, messages, {
            jsonMode: true,
            stream: false,
            max_tokens: 520,
            temperature: 0.45
          });
          notifyVisible(response.content);
        } else {
          throw err;
        }
      }
    } catch (fatal) {
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
    // Interview may only apply a subset of tools.
    var allowedTools = {
      set_priority: true,
      set_due: true,
      set_project: true,
      add_subtask: true
    };
    actions = actions.filter(function (a) {
      return a && allowedTools[a.tool];
    });

    var message = stripInterviewConclusionFraming(
      stripScaleLegendParenthetical(
        polishMessageAfterTierApply(
          parsed.message || (data && data.message) || '',
          tierRewrite.tier,
          tierRewrite.injected
        )
      )
    );
    var prompts = ensurePriorityAxesPrompt(
      normalizePrompts(parsed.prompts, context),
      actions,
      context
    );
    if (onDelta && message) {
      try {
        onDelta(message, content);
      } catch (finalCbErr) {
        console.error('cardInterviewTurn final onDelta failed', finalCbErr);
      }
    }

    var completeInterview = !!(data && data.completeInterview);
    var skipPhrase = /^\s*(passer|plus\s+tard|skip|non\s+merci|arr[eê]te|stop)\b/i.test(
      String(userText || '')
    );
    if (skipPhrase) completeInterview = true;

    var usage = extractUsageFromRaw(response && response.raw, messages, content, p.model);
    usage.latencyMs = Date.now() - t0;
    usage.historyTurns = (history || []).length;

    var cardPatches = normalizeCardPatches(
      (data && data.cardPatches) || (parsed && parsed.cardPatches)
    );

    var suggestionScale = wantsSuggestionScale(data) || wantsSuggestionScale(parsed);
    var suggestionEntries = normalizeSuggestionEntries(
      (data && data.suggestions) || parsed.suggestions,
      5,
      { scale: suggestionScale, rankGreenToRed: true }
    );
    // Interview answer chips (no "?") are ordinal soft→intense when unmarked.
    if (
      suggestionEntries.length >= 2 &&
      suggestionEntries.length <= 5 &&
      suggestionEntries.every(function (entry) {
        return entry.text.indexOf('?') < 0;
      })
    ) {
      suggestionEntries = orderSuggestionsGreenToRed(suggestionEntries);
      if (
        !suggestionEntries.some(function (entry) {
          return entry.heat != null;
        })
      ) {
        var interviewSteps = spreadScaleHeat(suggestionEntries.length);
        suggestionEntries.forEach(function (entry, i) {
          entry.heat = interviewSteps[i];
        });
        suggestionEntries = orderSuggestionsGreenToRed(suggestionEntries);
      }
    }

    return {
      message: message,
      suggestions: suggestionEntries,
      actions: actions,
      prompts: prompts,
      followUps: parsed.followUps || [],
      cardPatches: cardPatches,
      completeInterview: completeInterview,
      droppedActions: parsed.droppedActions || [],
      rawJson: content,
      context: context,
      usage: usage
    };
  }

  /** Drop tool calls that are missing required args (e.g. empty add_subtask). */
  function hasSubtaskRef(args) {
    return (
      (typeof args.id === 'string' && !!args.id.trim()) ||
      (typeof args.matchText === 'string' && !!args.matchText.trim()) ||
      (typeof args.from === 'string' && !!args.from.trim())
    );
  }

  function isCompleteAction(action) {
    if (!action || typeof action.tool !== 'string' || !action.tool) return false;
    var args = action.args && typeof action.args === 'object' ? action.args : {};
    if (action.tool === 'add_subtask') {
      return typeof args.text === 'string' && !!args.text.trim();
    }
    if (action.tool === 'rename_card') {
      return (
        (typeof args.name === 'string' && !!args.name.trim()) ||
        (typeof args.text === 'string' && !!args.text.trim())
      );
    }
    if (action.tool === 'set_description') {
      return (
        typeof args.desc === 'string' ||
        typeof args.description === 'string' ||
        typeof args.text === 'string'
      );
    }
    if (action.tool === 'rename_subtask') {
      return (
        typeof args.text === 'string' &&
        !!args.text.trim() &&
        hasSubtaskRef(args)
      );
    }
    if (
      action.tool === 'remove_subtask' ||
      action.tool === 'toggle_subtask'
    ) {
      return hasSubtaskRef(args);
    }
    if (action.tool === 'set_subtask_progress') {
      return hasSubtaskRef(args) && args.progress != null;
    }
    if (action.tool === 'set_formula') {
      return (
        typeof args.formula === 'string' &&
        FORMULA_KEYS.indexOf(args.formula.trim()) !== -1
      );
    }
    if (action.tool === 'set_statut') {
      return (
        (typeof args.listId === 'string' && !!args.listId.trim()) ||
        (typeof args.matchList === 'string' && !!args.matchList.trim()) ||
        (typeof args.category === 'string' && !!args.category.trim())
      );
    }
    if (action.tool === 'set_project') {
      if (args.clear === true) return true;
      return (
        (typeof args.projectId === 'string' && !!args.projectId.trim()) ||
        (typeof args.matchText === 'string' && !!args.matchText.trim()) ||
        (typeof args.name === 'string' && !!args.name.trim())
      );
    }
    if (
      action.tool === 'complete_all_subtasks' ||
      action.tool === 'reset_progress'
    ) {
      return true;
    }
    return true;
  }

  function incompleteActionError(action) {
    if (!action || !action.tool) return 'Action invalide';
    if (action.tool === 'add_subtask') return 'add_subtask: text requis';
    if (action.tool === 'rename_card') return 'rename_card: name requis';
    if (action.tool === 'set_description') return 'set_description: desc requis';
    if (action.tool === 'rename_subtask') {
      return 'rename_subtask: text et id (ou matchText) requis';
    }
    if (action.tool === 'remove_subtask') {
      return 'remove_subtask: id (ou matchText) requis';
    }
    if (action.tool === 'toggle_subtask') {
      return 'toggle_subtask: id (ou matchText) requis';
    }
    if (action.tool === 'set_subtask_progress') {
      return 'set_subtask_progress: id (ou matchText) et progress requis';
    }
    if (action.tool === 'set_formula') {
      return 'set_formula: formula requis (baseline|eisenhower|wsjf|valueEffort)';
    }
    if (action.tool === 'set_statut') {
      return 'set_statut: listId, matchList ou category requis';
    }
    if (action.tool === 'set_project') {
      return 'set_project: projectId, matchText/name, ou clear:true requis';
    }
    return action.tool + ': args incomplets';
  }

  function normalizeActionList(raw) {
    return normalizeActionsWithMeta(raw).actions;
  }

  function normalizeActionsWithMeta(raw) {
    var out = [];
    var dropped = [];
    if (!Array.isArray(raw)) return { actions: out, dropped: dropped };
    raw.forEach(function (action) {
      if (!action || typeof action !== 'object') return;
      var tool = typeof action.tool === 'string' ? action.tool.trim() : '';
      if (!tool) return;
      var item = {
        tool: tool,
        args: action.args && typeof action.args === 'object' ? action.args : {}
      };
      if (!isCompleteAction(item)) {
        dropped.push({ tool: item.tool, error: incompleteActionError(item) });
        return;
      }
      out.push(item);
    });
    return {
      actions: polishFollowUpActions(out).slice(0, 3),
      dropped: dropped
    };
  }

  /** Reject ellipsis / placeholder chips the model copies from prompt examples. */
  function isWorthySuggestion(text) {
    if (!text) return false;
    var t = String(text).trim();
    if (!t) return false;
    // Only dots / ellipsis / whitespace (e.g. "...", "…", ". . .")
    if (/^[.\u2026\u22EF\u2025\s]+$/.test(t)) return false;
    // Generic placeholders sometimes echoed from schemas
    if (/^(suggestion|suggestions?|exemple|example|placeholder|\u2026|\.\.\.)$/i.test(t)) {
      return false;
    }
    return true;
  }

  /** Named colors (FR/EN) → heat 0–4 (green → red). */
  var SUGGESTION_COLOR_HEAT = {
    green: 0,
    vert: 0,
    lime: 1,
    yellow: 2,
    jaune: 2,
    amber: 2,
    orange: 3,
    red: 4,
    rouge: 4,
    blue: 1,
    bleu: 1,
    gray: 0,
    grey: 0,
    gris: 0
  };

  function clampSuggestionHeat(value) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(n)) return null;
    return Math.max(0, Math.min(4, Math.round(n)));
  }

  function heatFromSuggestionItem(item) {
    if (!item || typeof item !== 'object') return null;
    if (item.heat != null) return clampSuggestionHeat(item.heat);
    if (typeof item.color === 'string') {
      var key = item.color.trim().toLowerCase();
      if (Object.prototype.hasOwnProperty.call(SUGGESTION_COLOR_HEAT, key)) {
        return SUGGESTION_COLOR_HEAT[key];
      }
    }
    return null;
  }

  /** Even green→red steps for N chips (e.g. 3 → 0,2,4). */
  function spreadScaleHeat(count) {
    var n = Math.max(0, Math.floor(count));
    if (n <= 0) return [];
    if (n === 1) return [2];
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push(Math.round((i / (n - 1)) * 4));
    }
    return out;
  }

  /**
   * Soft→intense score for answer chips (lower = greener).
   * Returns null when the text looks unrelated to a severity/ease scale.
   */
  function suggestionIntensityRank(text) {
    var raw = String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (!raw) return null;
    // Action / navigation chips — do not treat as a scale.
    if (
      /^(marquer|definir|ajouter|supprimer|renommer|passer|lie[re]?|mettre|quelle|comment)\b/.test(
        raw
      )
    ) {
      return null;
    }
    var rules = [
      { re: /\b(impossible|catastroph|critique|urgentes?|bloque\b)/, score: 100 },
      { re: /\b(tres\s+difficile|extremement|enorme|graves?)\b/, score: 95 },
      { re: /\b(difficile|hard|compliqu|complexe|intense)\b/, score: 90 },
      { re: /\b(beaucoup|a lot|majeur|major)\b/, score: 75 },
      {
        re: /\b(efforts?|du travail|assez|plutot|avec\s+des\s+efforts)\b/,
        score: 55
      },
      {
        re: /\b(faisable|doable|moyen|moderate|gerable|un\s+peu|quelques)\b/,
        score: 45
      },
      { re: /\b(facile|easy|simple|rapide|trivial)\b/, score: 10 },
      {
        re: /\b(pas\s+grand.?chose|rien\b|faible|petit|negligeable|aucune?)\b/,
        score: 5
      }
    ];
    var best = null;
    rules.forEach(function (rule) {
      if (!rule.re.test(raw)) return;
      if (best == null || rule.score > best) best = rule.score;
    });
    return best;
  }

  /**
   * Force green→red order: sort by heat when known, else by intensity keywords,
   * then re-spread heat 0…4 so colors match left→right.
   */
  function orderSuggestionsGreenToRed(entries) {
    if (!Array.isArray(entries) || entries.length < 2) {
      return entries || [];
    }
    var list = entries.map(function (entry) {
      return {
        text: entry.text,
        heat: entry.heat,
        rank: suggestionIntensityRank(entry.text)
      };
    });
    var heatedCount = list.filter(function (item) {
      return item.heat != null;
    }).length;
    var ranked = list.filter(function (item) {
      return item.rank != null;
    });
    var canRank =
      ranked.length >= 2 &&
      ranked.some(function (item) {
        return item.rank !== ranked[0].rank;
      });

    if (canRank) {
      list.sort(function (a, b) {
        var ra = a.rank == null ? 50 : a.rank;
        var rb = b.rank == null ? 50 : b.rank;
        if (ra !== rb) return ra - rb;
        if (a.heat != null && b.heat != null && a.heat !== b.heat) {
          return a.heat - b.heat;
        }
        return 0;
      });
    } else if (heatedCount === list.length) {
      list.sort(function (a, b) {
        return a.heat - b.heat;
      });
    } else {
      return entries;
    }

    var steps = spreadScaleHeat(list.length);
    return list.map(function (item, i) {
      return { text: item.text, heat: steps[i] };
    });
  }

  /**
   * Normalize AI suggestions to { text, heat }[].
   * heat is 0–4 (green→red) or null. options.scale forces even spread when
   * no per-item heat/color was provided.
   */
  function normalizeSuggestionEntries(raw, maxItems, options) {
    options = options || {};
    var max =
      typeof maxItems === 'number' && maxItems > 0 ? Math.floor(maxItems) : 4;
    var out = [];
    if (!Array.isArray(raw)) return out;
    raw.forEach(function (item) {
      var text = '';
      var heat = null;
      if (typeof item === 'string') {
        text = item.trim();
      } else if (item && typeof item === 'object') {
        if (typeof item.label === 'string') text = item.label.trim();
        else if (typeof item.text === 'string') text = item.text.trim();
        else if (typeof item.suggestion === 'string') text = item.suggestion.trim();
        heat = heatFromSuggestionItem(item);
      }
      if (!isWorthySuggestion(text)) return;
      if (
        out.some(function (entry) {
          return entry.text === text;
        })
      ) {
        return;
      }
      out.push({ text: text, heat: heat });
    });
    out = out.slice(0, max);
    var hasHeat = out.some(function (entry) {
      return entry.heat != null;
    });
    if (options.scale && !hasHeat) {
      var steps = spreadScaleHeat(out.length);
      out.forEach(function (entry, i) {
        entry.heat = steps[i];
      });
    }
    if (options.scale || options.rankGreenToRed) {
      out = orderSuggestionsGreenToRed(out);
    }
    return out;
  }

  function normalizeSuggestionList(raw, maxItems) {
    return normalizeSuggestionEntries(raw, maxItems).map(function (entry) {
      return entry.text;
    });
  }

  function wantsSuggestionScale(parsed) {
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.suggestionScale === true || parsed.scaleSuggestions === true) {
      return true;
    }
    var colors = parsed.suggestionColors;
    if (typeof colors === 'string') {
      var key = colors.trim().toLowerCase();
      return key === 'scale' || key === 'green-red' || key === 'vert-rouge';
    }
    return false;
  }

  function suggestionsFromFollowUps(followUps) {
    var out = [];
    (followUps || []).forEach(function (fu) {
      if (!fu || !fu.label) return;
      if (fu.actions && fu.actions.length) return;
      if (!isWorthySuggestion(fu.label)) return;
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
        prompts: [],
        actions: [],
        droppedActions: [],
        cardPatches: []
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
          if (!isWorthySuggestion(label)) return;
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
      var suggestionScale = wantsSuggestionScale(parsed);
      var suggestions = normalizeSuggestionEntries(parsed.suggestions, 4, {
        scale: suggestionScale,
        rankGreenToRed: !!suggestionScale
      });
      if (!suggestions.length) {
        suggestions = suggestionsFromFollowUps(followUps).map(function (text) {
          return { text: text, heat: null };
        });
      } else if (
        suggestionScale ||
        (suggestions.length >= 2 &&
          suggestions.length <= 5 &&
          suggestions.every(function (entry) {
            return entry.text.indexOf('?') < 0;
          }) &&
          suggestions.some(function (entry) {
            return entry.heat != null || suggestionIntensityRank(entry.text) != null;
          }))
      ) {
        suggestions = orderSuggestionsGreenToRed(suggestions);
      }
      var normalized = normalizeActionsWithMeta(parsed.actions);
      return {
        message: message,
        followUps: followUps,
        suggestions: suggestions,
        prompts: Array.isArray(parsed.prompts) ? parsed.prompts : [],
        actions: normalized.actions,
        droppedActions: normalized.dropped,
        cardPatches: normalizeCardPatches(parsed.cardPatches)
      };
    } catch (e) {
      return {
        message: text,
        followUps: [],
        suggestions: [],
        prompts: [],
        actions: [],
        droppedActions: [],
        cardPatches: []
      };
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
    return stripInterviewConclusionFraming(stripScaleLegendParenthetical(out));
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
      },
      status: typeof res.status === 'number' ? res.status : null
    };
  }

  function cloneJsonSafe(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return value;
    }
  }

  function buildRequestMeta(provider, body, extras) {
    var p = normalizeProvider(provider);
    var extra = extras || {};
    return {
      url: p.baseUrl + '/chat/completions',
      method: 'POST',
      model: (body && body.model) || p.model || '',
      stream: !!(body && body.stream),
      jsonMode: !!(body && body.response_format),
      temperature: body && body.temperature,
      max_tokens: body && body.max_tokens,
      messageCount: body && body.messages ? body.messages.length : 0,
      body: cloneJsonSafe(body),
      status: extra.status != null ? extra.status : null,
      ok: extra.ok != null ? extra.ok : null,
      error: extra.error || null,
      note: extra.note || null
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
      if (!result.ok) {
        var httpErr = null;
        try {
          throwHttpError(result);
        } catch (thrown) {
          httpErr = thrown;
        }
        if (httpErr) {
          httpErr.debugMeta = buildRequestMeta(p, body, {
            status: result.status,
            ok: false,
            error: httpErr.message,
            note: 'HTTP error (non-stream)'
          });
          throw httpErr;
        }
      }
      var choice =
        result.data &&
        result.data.choices &&
        result.data.choices[0] &&
        result.data.choices[0].message
          ? result.data.choices[0].message
          : null;
      var content = choice && typeof choice.content === 'string' ? choice.content : '';
      return {
        content: content,
        raw: result.data,
        meta: buildRequestMeta(p, body, { status: result.status, ok: true })
      };
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
      e.debugMeta = buildRequestMeta(p, body, {
        status: null,
        ok: false,
        error: classified.message,
        note: 'Network / CORS failure'
      });
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
      try {
        throwHttpError({ ok: false, status: res.status, data: data, text: text });
      } catch (streamHttpErr) {
        streamHttpErr.debugMeta = buildRequestMeta(p, body, {
          status: res.status,
          ok: false,
          error: streamHttpErr.message,
          note: 'HTTP error (stream)'
        });
        throw streamHttpErr;
      }
    }

    var streamed = await readSseChatStream(res, onDelta);
    streamed.meta = buildRequestMeta(p, body, {
      status: streamed.status != null ? streamed.status : res.status,
      ok: true
    });
    return streamed;
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
        return;
      }
      if (metaOrErr && metaOrErr.debugMeta) {
        debug.attempts.push(Object.assign({ label: label }, metaOrErr.debugMeta));
        return;
      }
      debug.attempts.push({
        label: label,
        error: (metaOrErr && metaOrErr.message) || String(metaOrErr || 'error'),
        ok: false
      });
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
    var actions = rewriteActionsForRelativeDue(parsed.actions || [], userText);
    var tierRewrite = rewriteActionsForPriorityTier(actions, userText);
    actions = tierRewrite.actions;
    var message = stripInterviewConclusionFraming(
      stripScaleLegendParenthetical(
        polishMessageAfterTierApply(
          parsed.message,
          tierRewrite.tier,
          tierRewrite.injected
        )
      )
    );
    var prompts = ensurePriorityAxesPrompt(
      normalizePrompts(parsed.prompts, context),
      actions,
      context
    );
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
        actions: actions,
        droppedActions: parsed.droppedActions || [],
        tierInjected: !!tierRewrite.injected
      }
    };
    debug.usage = usage;
    return {
      message: message,
      followUps: parsed.followUps,
      suggestions: parsed.suggestions,
      prompts: prompts,
      actions: actions,
      droppedActions: parsed.droppedActions || [],
      cardPatches: parsed.cardPatches || [],
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
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":["Quelle est la priorit\u00e9?","D\u00e9finir une \u00e9ch\u00e9ance"]}',
          '2 \u00e0 4 formulations courtes en fran\u00e7ais, ancr\u00e9es dans le contexte.',
          'INTERDIT\u00a0: placeholders comme "..." ou "\u2026"\u00a0; chaque entr\u00e9e doit \u00eatre un vrai texte cliquable.',
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

  /**
   * On-card-open: AI proposes applyable improvements (set_due, set_priority…).
   * Returns [] when nothing useful to change.
   * @returns {Promise<Array<{label:string, actions:Array}>>}
   */
  async function suggestCardImprovements(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var context = buildContext(bridge);
    var today = (context && context.today) || todayIsoLocal();
    var nowTime = (context && context.nowTime) || nowTimeLocal();
    var messages = [
      {
        role: 'system',
        content: [
          'Tu analyses une carte Trello (Power-Up Priorit\u00e9) et proposes des am\u00e9liorations APPLIQUABLES.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
          '{"suggestions":[{"label":"D\u00e9finir l\'\u00e9ch\u00e9ance \u00e0 demain","actions":[{"tool":"set_due","args":{"dueDate":"' +
            today +
            '","dueEnabled":true}}]}]}',
          'R\u00e8gles\u00a0:',
          '- 0 \u00e0 3 suggestions max. Si la carte est d\u00e9j\u00e0 bien remplie / rien d\'utile\u00a0: {"suggestions":[]}.',
          '- Chaque suggestion DOIT avoir actions non vides (outils ex\u00e9cutables), pas seulement une question.',
          '- label\u00a0: verbe \u00e0 l\'infinitif, court, en fran\u00e7ais (ex. \u00ab\u00a0D\u00e9finir l\'\u00e9ch\u00e9ance\u00a0\u00bb, \u00ab\u00a0Marquer bloqu\u00e9\u00a0\u00bb).',
          '- Outils autoris\u00e9s\u00a0: set_due, set_priority, set_blocked, set_progress, add_subtask, set_project.',
          '- Si context.goals.projectId est null et context.goals.projects n\'est pas vide, tu PEUX proposer de lier un projet pertinent (set_project avec matchText ou projectId).',
          '- Ne propose que des changements pertinents au contexte actuel (sections enabled, \u00e9ch\u00e9ance manquante/pass\u00e9e, priorit\u00e9 absente, progr\u00e8s vide, projet non li\u00e9\u2026).',
          '- Dates\u00a0: aujourd\'hui = ' +
            today +
            ', heure actuelle = ' +
            nowTime +
            '. D\u00e9lais \u00ab\u00a0dans N min\u00a0\u00bb \u2192 relativeMinutes.',
          '- Ne duplique pas un \u00e9tat d\u00e9j\u00e0 actif (ex. ne re-bloque pas si d\u00e9j\u00e0 bloqu\u00e9).',
          '- add_subtask.text obligatoire et concret si utilis\u00e9.',
          'Contexte carte\u00a0:',
          JSON.stringify(context)
        ].join('\n')
      },
      {
        role: 'user',
        content:
          'Y a-t-il des am\u00e9liorations \u00e0 appliquer sur cette carte? Sinon renvoie suggestions vides.'
      }
    ];
    var debug = {
      id: 'improve-' + Date.now().toString(36),
      kind: 'suggestCardImprovements',
      label: 'Suggestions applicables',
      startedAt: Date.now(),
      attempts: []
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('suggestCardImprovements onDebug failed', cbErr);
      }
    }
    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 420,
          temperature: 0.4
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
            temperature: 0.4
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
    return {
      urgency: s.urgency,
      impact: s.impact,
      ease: s.ease,
      estimatedDurationMinutes:
        s.estimatedDurationMinutes != null && isFinite(+s.estimatedDurationMinutes)
          ? +s.estimatedDurationMinutes
          : null,
      priorityEnabled: s.priorityEnabled !== false,
      dueDate: s.dueDate || '',
      dueTime: s.dueTime || '',
      dueEnabled: !!s.dueEnabled,
      enAttente: !!s.enAttente,
      blockedReasons: Array.isArray(s.blockedReasons)
        ? s.blockedReasons.slice()
        : s.blockedReason
          ? [s.blockedReason]
          : [],
      blockedLinks: links
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
      items: (c.items || []).map(function (it) {
        return {
          id: it.id,
          text: it.text,
          done: !!it.done,
          progress: it.progress != null ? it.progress : 0
        };
      })
    };
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
      pushChange(parts, 'urgency', beforeP.urgency, afterP.urgency);
      pushChange(parts, 'impact', beforeP.impact, afterP.impact);
      pushChange(parts, 'ease', beforeP.ease, afterP.ease);
      pushChange(
        parts,
        'estimatedDurationMinutes',
        beforeP.estimatedDurationMinutes,
        afterP.estimatedDurationMinutes
      );
    } else if (tool === 'set_due') {
      pushChange(parts, 'dueEnabled', beforeP.dueEnabled, afterP.dueEnabled);
      pushChange(parts, 'dueDate', beforeP.dueDate, afterP.dueDate);
      pushChange(parts, 'dueTime', beforeP.dueTime, afterP.dueTime);
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
      tool === 'set_subtask_progress'
    ) {
      var tid = (extra && extra.id) || args.id;
      var beforeItem = findItem(beforeC.items, tid);
      var afterItem = findItem(afterC.items, tid);
      if (beforeItem && afterItem) {
        parts.push('id: ' + tid);
        if (beforeItem.text) parts.push('"' + beforeItem.text + '"');
        pushChange(parts, 'done', beforeItem.done, afterItem.done);
        pushChange(parts, 'progress', beforeItem.progress, afterItem.progress);
      } else {
        parts.push('id: ' + (tid || '?'));
      }
    } else if (tool === 'complete_all_subtasks' || tool === 'reset_progress') {
      pushChange(parts, 'progress', beforeC.progress, afterC.progress);
      parts.push('items ' + beforeC.items.length + ' \u2192 ' + afterC.items.length);
    }
    return parts.length ? parts.join('; ') : 'aucun diff d\u00e9tect\u00e9';
  }

  /**
   * True when the assistant message claims a card change was applied
   * (used to warn if actions was empty).
   */
  function looksLikeAppliedClaim(message) {
    if (typeof message !== 'string' || !message.trim()) return false;
    return /\b(ajout(\u00e9e?|er)|renomm(\u00e9e?|er)|supprim(\u00e9e?|er)|r(\u00e9|e)initialis(\u00e9e?|er)|d(\u00e9|e)plac(\u00e9e?|er)|mise?\s+[aà]\s+jour|mis\s+[aà]\s+jour|enregistr(\u00e9e?|er)|d(\u00e9|e)fini[ee]?|bloqu(\u00e9e?|er)|d(\u00e9|e)bloqu(\u00e9e?|er)|appliqu(\u00e9e?|er)|modifi(\u00e9e?|er)|termin(\u00e9e?|er)|okay,?\s*bloqu)/i.test(
      message
    );
  }

  /**
   * Technical recap from executeActions results (executor is source of truth).
   */
  function formatChangeRecap(applied, options) {
    options = options || {};
    var lines = [];
    var results = (applied && applied.results) || [];
    results.forEach(function (r) {
      if (!r) return;
      var tool = r.tool || '?';
      if (r.ok) {
        lines.push('\u2713 ' + tool + (r.detail ? ': ' + r.detail : ''));
      } else {
        lines.push('\u2717 ' + tool + ': ' + (r.error || '\u00e9chec'));
      }
    });
    (options.droppedActions || []).forEach(function (d) {
      if (!d) return;
      lines.push('\u2717 ' + (d.tool || '?') + ': ' + (d.error || 'args incomplets'));
    });
    if (!lines.length) {
      if (options.emptyClaim) {
        return 'Aucun outil ex\u00e9cut\u00e9 \u2014 rien n\'a \u00e9t\u00e9 modifi\u00e9 sur la carte.';
      }
      return '';
    }
    return lines.join('\n');
  }

  async function executeAction(bridge, action) {
    if (!bridge || !action || !action.tool) {
      return { ok: false, tool: action && action.tool, error: 'Action invalide' };
    }
    var tool = action.tool;
    var args = action.args && typeof action.args === 'object' ? action.args : {};
    try {
      if (tool === 'set_priority') {
        if (typeof bridge.applyPriority !== 'function') {
          return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
        }
        var beforeP = snapshotPriority(bridge);
        var partial = {};
        var heatSeg = resolveHeatSegment(args.tier, args.heatTarget);
        if (heatSeg) {
          var formulaKey = 'baseline';
          if (typeof bridge.getFormulaKey === 'function') {
            try {
              formulaKey = bridge.getFormulaKey() || 'baseline';
            } catch (e) { /* ignore */ }
          }
          var stateNow =
            typeof bridge.getPriorityState === 'function'
              ? bridge.getPriorityState() || {}
              : {};
          var formulaDef =
            typeof PriorityUI !== 'undefined' &&
            PriorityUI.FORMULAS &&
            PriorityUI.FORMULAS[formulaKey]
              ? PriorityUI.FORMULAS[formulaKey]
              : null;
          if (heatSeg.preset && (!formulaDef || formulaKey === 'baseline')) {
            if (heatSeg.preset.urgency != null) partial.urgency = heatSeg.preset.urgency;
            if (heatSeg.preset.impact != null) partial.impact = heatSeg.preset.impact;
            if (heatSeg.preset.ease != null) partial.ease = heatSeg.preset.ease;
          } else if (formulaDef && typeof formulaDef.override === 'function') {
            var overridden = formulaDef.override(heatSeg.target, stateNow) || {};
            if (overridden.urgency != null) partial.urgency = overridden.urgency;
            if (overridden.impact != null) partial.impact = overridden.impact;
            if (overridden.ease != null) partial.ease = overridden.ease;
          } else if (heatSeg.preset) {
            if (heatSeg.preset.urgency != null) partial.urgency = heatSeg.preset.urgency;
            if (heatSeg.preset.impact != null) partial.impact = heatSeg.preset.impact;
            if (heatSeg.preset.ease != null) partial.ease = heatSeg.preset.ease;
          }
        }
        if (args.urgency != null) partial.urgency = clampInt(args.urgency, 0, 4, 0);
        if (args.impact != null) partial.impact = clampInt(args.impact, 0, 4, 0);
        if (args.ease != null) partial.ease = clampInt(args.ease, 1, 5, 3);
        if (args.estimatedDurationMinutes !== undefined) {
          if (
            args.estimatedDurationMinutes === null ||
            args.estimatedDurationMinutes === ''
          ) {
            partial.estimatedDurationMinutes = null;
          } else {
            var durMin = +args.estimatedDurationMinutes;
            if (isFinite(durMin) && durMin > 0) {
              if (
                typeof PriorityUI !== 'undefined' &&
                typeof PriorityUI.clampDurationMinutes === 'function'
              ) {
                partial.estimatedDurationMinutes =
                  PriorityUI.clampDurationMinutes(durMin);
              } else {
                partial.estimatedDurationMinutes = Math.round(durMin);
              }
            }
          }
        } else if (
          typeof args.estimatedDuration === 'string' &&
          args.estimatedDuration.trim()
        ) {
          var parsedDur =
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.parseDurationNl === 'function'
              ? PriorityUI.parseDurationNl(args.estimatedDuration)
              : null;
          if (parsedDur != null) {
            partial.estimatedDurationMinutes = parsedDur;
          }
        }
        if (args.priorityEnabled != null) {
          partial.priorityEnabled = !!args.priorityEnabled;
        } else if (
          (partial.urgency != null ||
            partial.impact != null ||
            partial.ease != null ||
            partial.estimatedDurationMinutes !== undefined) &&
          !beforeP.priorityEnabled
        ) {
          // Writing axis values must activate Priorité or the UI stays off.
          partial.priorityEnabled = true;
        }
        if (!Object.keys(partial).length) {
          return {
            ok: false,
            tool: tool,
            error: 'Aucun champ priorit\u00e9 \u00e0 modifier'
          };
        }
        bridge.applyPriority(partial);
        var afterP = snapshotPriority(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_priority,
          detail: detailForTool(tool, beforeP, afterP, null, null, args)
        };
      }
      if (tool === 'set_statut') {
        if (typeof bridge.selectStatut !== 'function') {
          return { ok: false, tool: tool, error: 'Statut indisponible' };
        }
        var statutCtx =
          typeof bridge.getStatut === 'function' ? bridge.getStatut() : null;
        var targetListId = resolveStatutListId(statutCtx, args);
        if (!targetListId) {
          return {
            ok: false,
            tool: tool,
            error: 'Liste statut introuvable'
          };
        }
        var listName = '';
        if (statutCtx && Array.isArray(statutCtx.lists)) {
          for (var li = 0; li < statutCtx.lists.length; li++) {
            if (String(statutCtx.lists[li].id) === String(targetListId)) {
              listName = statutCtx.lists[li].name || '';
              break;
            }
          }
        }
        var selectResult = await Promise.resolve(
          bridge.selectStatut(targetListId)
        );
        if (!selectResult || !selectResult.ok) {
          return {
            ok: false,
            tool: tool,
            error:
              (selectResult &&
                (selectResult.reason || selectResult.error)) ||
              'D\u00e9placement statut \u00e9chou\u00e9'
          };
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_statut,
          detail: detailForTool(tool, null, null, null, null, args, {
            listId: targetListId,
            listName: listName
          })
        };
      }
      if (tool === 'set_project') {
        if (typeof bridge.setProject !== 'function') {
          return { ok: false, tool: tool, error: 'Objectifs indisponibles' };
        }
        var clearProject = args.clear === true;
        var projectId = null;
        var projectName = '';
        if (!clearProject) {
          var goalsCtx =
            typeof bridge.getGoals === 'function' ? bridge.getGoals() : null;
          var projects =
            goalsCtx && Array.isArray(goalsCtx.projects) ? goalsCtx.projects : [];
          var matched =
            typeof GoalsTrello !== 'undefined' && GoalsTrello.findProjectByMatch
              ? GoalsTrello.findProjectByMatch(projects, args)
              : null;
          if (!matched && typeof args.projectId === 'string' && args.projectId.trim()) {
            for (var pi = 0; pi < projects.length; pi++) {
              if (projects[pi].id === args.projectId.trim()) {
                matched = projects[pi];
                break;
              }
            }
          }
          if (!matched) {
            return { ok: false, tool: tool, error: 'Projet introuvable' };
          }
          if (matched.retired) {
            return { ok: false, tool: tool, error: 'Projet retir\u00e9' };
          }
          projectId = matched.id;
          projectName = matched.name || '';
        }
        var projectResult = await Promise.resolve(bridge.setProject(projectId));
        if (!projectResult || !projectResult.ok) {
          return {
            ok: false,
            tool: tool,
            error:
              (projectResult &&
                (projectResult.reason || projectResult.error)) ||
              'Liaison projet \u00e9chou\u00e9e'
          };
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: clearProject
            ? 'Projet d\u00e9li\u00e9.'
            : TOOL_LABELS.set_project,
          detail: detailForTool(tool, null, null, null, null, args, {
            projectId: projectId,
            projectName: projectName,
            cleared: clearProject
          })
        };
      }
      if (tool === 'set_due') {
        if (typeof bridge.applyPriority !== 'function') {
          return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
        }
        var beforeDue = snapshotPriority(bridge);
        var duePartial = {};
        var hasRelative =
          args.relativeMinutes != null || args.relativeHours != null;
        if (hasRelative) {
          var offsetMins = 0;
          if (args.relativeHours != null) {
            var hours = Number(args.relativeHours);
            if (!isFinite(hours)) {
              return { ok: false, tool: tool, error: 'relativeHours invalide' };
            }
            offsetMins += hours * 60;
          }
          if (args.relativeMinutes != null) {
            var minutes = Number(args.relativeMinutes);
            if (!isFinite(minutes)) {
              return { ok: false, tool: tool, error: 'relativeMinutes invalide' };
            }
            offsetMins += minutes;
          }
          offsetMins = Math.round(offsetMins);
          if (offsetMins < 0) {
            return {
              ok: false,
              tool: tool,
              error: 'd\u00e9lai relatif doit \u00eatre \u2265 0'
            };
          }
          var resolvedRelative = dueFromOffsetMinutes(offsetMins);
          if (!resolvedRelative) {
            return { ok: false, tool: tool, error: 'd\u00e9lai relatif invalide' };
          }
          duePartial.dueDate = resolvedRelative.dueDate;
          duePartial.dueTime = resolvedRelative.dueTime;
        } else {
          if (Object.prototype.hasOwnProperty.call(args, 'dueDate')) {
            var dueDate = validateDueDate(args.dueDate);
            if (dueDate === undefined) {
              return { ok: false, tool: tool, error: 'dueDate invalide (YYYY-MM-DD)' };
            }
            duePartial.dueDate = dueDate || '';
          }
          if (Object.prototype.hasOwnProperty.call(args, 'dueTime')) {
            var dueTime = validateDueTime(args.dueTime);
            if (dueTime === undefined) {
              return { ok: false, tool: tool, error: 'dueTime invalide (HH:MM)' };
            }
            duePartial.dueTime = dueTime || '';
          }
        }
        if (args.dueEnabled != null) {
          duePartial.dueEnabled = !!args.dueEnabled;
        } else if (
          (Object.prototype.hasOwnProperty.call(duePartial, 'dueDate') ||
            Object.prototype.hasOwnProperty.call(duePartial, 'dueTime')) &&
          !beforeDue.dueEnabled
        ) {
          duePartial.dueEnabled = true;
        }
        if (!Object.keys(duePartial).length) {
          return {
            ok: false,
            tool: tool,
            error: 'Aucun champ \u00e9ch\u00e9ance \u00e0 modifier'
          };
        }
        bridge.applyPriority(duePartial);
        var afterDue = snapshotPriority(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_due,
          detail: detailForTool(tool, beforeDue, afterDue, null, null, args)
        };
      }
      if (tool === 'set_blocked') {
        if (typeof bridge.applyPriority !== 'function') {
          return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
        }
        var beforeBlocked = snapshotPriority(bridge);
        var completionForLinks =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
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
        if (Object.prototype.hasOwnProperty.call(args, 'blockedLinks')) {
          var resolvedLinks = resolveBlockedLinkArgs(
            args.blockedLinks,
            (completionForLinks && completionForLinks.items) || []
          );
          if (resolvedLinks == null) {
            return {
              ok: false,
              tool: tool,
              error: 'blockedLinks invalide'
            };
          }
          blockedPartial.blockedLinks = resolvedLinks;
          if (
            resolvedLinks.length &&
            Array.isArray(blockedPartial.blockedReasons)
          ) {
            var hasWaiting = blockedPartial.blockedReasons.some(function (r) {
              return r === WAITING_OTHER_TASK_REASON;
            });
            if (!hasWaiting) {
              blockedPartial.blockedReasons =
                blockedPartial.blockedReasons.concat([
                  WAITING_OTHER_TASK_REASON
                ]);
            }
          }
        }
        if (args.enAttente != null) {
          blockedPartial.enAttente = !!args.enAttente;
        } else if (
          (blockedPartial.blockedReasons &&
            blockedPartial.blockedReasons.length) ||
          (blockedPartial.blockedLinks && blockedPartial.blockedLinks.length)
        ) {
          // Providing reasons/links without enAttente implies enabling Bloqué.
          blockedPartial.enAttente = true;
        }
        if (!Object.keys(blockedPartial).length) {
          return {
            ok: false,
            tool: tool,
            error: 'Aucun champ blocage \u00e0 modifier'
          };
        }
        bridge.applyPriority(blockedPartial);
        var afterBlocked = snapshotPriority(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_blocked,
          detail: detailForTool(
            tool,
            beforeBlocked,
            afterBlocked,
            null,
            null,
            args
          )
        };
      }
      if (tool === 'set_formula') {
        if (typeof bridge.setFormulaKey !== 'function') {
          return { ok: false, tool: tool, error: 'Formule indisponible' };
        }
        var formula =
          typeof args.formula === 'string' ? args.formula.trim() : '';
        if (FORMULA_KEYS.indexOf(formula) === -1) {
          return {
            ok: false,
            tool: tool,
            error: 'Formule invalide (baseline|eisenhower|wsjf|valueEffort)'
          };
        }
        bridge.setFormulaKey(formula);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_formula,
          detail: detailForTool(tool, null, null, null, null, args, {
            formula: formula
          })
        };
      }
      if (tool === 'rename_card') {
        if (typeof bridge.setCardName !== 'function') {
          return { ok: false, tool: tool, error: 'Renommage carte indisponible' };
        }
        var newCardName =
          typeof args.name === 'string' && args.name.trim()
            ? args.name.trim()
            : typeof args.text === 'string'
              ? args.text.trim()
              : '';
        if (!newCardName) {
          return { ok: false, tool: tool, error: 'Nouveau nom requis' };
        }
        var beforeCardName =
          typeof bridge.getCardName === 'function' ? bridge.getCardName() || '' : '';
        var renameCardResult = await Promise.resolve(bridge.setCardName(newCardName));
        if (!renameCardResult || !renameCardResult.ok) {
          var renameReason =
            (renameCardResult &&
              (renameCardResult.reason || renameCardResult.error)) ||
            'Renommage \u00e9chou\u00e9';
          if (renameReason === 'not-authorized') {
            renameReason = 'Autorisation Trello requise';
          } else if (renameReason === 'no-app-key') {
            renameReason = 'Cl\u00e9 API Trello manquante';
          } else if (renameReason === 'empty-name') {
            renameReason = 'Nouveau nom requis';
          } else if (renameReason === 'no-card-id') {
            renameReason = 'Carte introuvable';
          }
          return { ok: false, tool: tool, error: renameReason };
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.rename_card,
          detail: detailForTool(tool, null, null, null, null, args, {
            before: beforeCardName,
            after: newCardName
          })
        };
      }
      if (tool === 'set_description') {
        if (typeof bridge.setCardDesc !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Description carte indisponible'
          };
        }
        var newCardDesc =
          typeof args.desc === 'string'
            ? args.desc
            : typeof args.description === 'string'
              ? args.description
              : typeof args.text === 'string'
                ? args.text
                : null;
        if (newCardDesc == null) {
          return { ok: false, tool: tool, error: 'Description requise' };
        }
        var beforeCardDesc =
          typeof bridge.getCardDesc === 'function' ? bridge.getCardDesc() || '' : '';
        var setDescResult = await Promise.resolve(bridge.setCardDesc(newCardDesc));
        if (!setDescResult || !setDescResult.ok) {
          var descReason =
            (setDescResult && (setDescResult.reason || setDescResult.error)) ||
            'Mise \u00e0 jour description \u00e9chou\u00e9e';
          if (descReason === 'not-authorized') {
            descReason = 'Autorisation Trello requise';
          } else if (descReason === 'no-app-key') {
            descReason = 'Cl\u00e9 API Trello manquante';
          } else if (descReason === 'no-card-id') {
            descReason = 'Carte introuvable';
          }
          return { ok: false, tool: tool, error: descReason };
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_description,
          detail: detailForTool(tool, null, null, null, null, args, {
            before: beforeCardDesc,
            after: newCardDesc
          })
        };
      }
      if (tool === 'set_progress') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
        }
        var beforeProg = snapshotCompletion(bridge);
        var current =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
        var next = Object.assign({}, current);
        if (args.progressEnabled != null) {
          if (args.progressEnabled === false) next.progressEnabled = false;
          else delete next.progressEnabled;
        } else if (args.progress != null && current.progressEnabled === false) {
          delete next.progressEnabled;
        }
        if (args.progress != null) {
          var masterPct = clampInt(args.progress, 0, 100, 0);
          if (
            current.items &&
            current.items.length &&
            typeof CompletionTrello !== 'undefined' &&
            CompletionTrello.applyMasterProgress
          ) {
            next.items = CompletionTrello.applyMasterProgress(
              current.items,
              masterPct
            );
          } else {
            next.progress = masterPct;
          }
        }
        bridge.applyCompletion(next);
        var afterProg = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_progress,
          detail: detailForTool(tool, null, null, beforeProg, afterProg, args)
        };
      }
      if (tool === 'add_subtask') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
        }
        var text = typeof args.text === 'string' ? args.text.trim() : '';
        if (!text) {
          return { ok: false, tool: tool, error: 'Texte de sous-t\u00e2che requis' };
        }
        var beforeAdd = snapshotCompletion(bridge);
        var data =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
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
        var afterAdd = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.add_subtask,
          id: id,
          detail: detailForTool(tool, null, null, beforeAdd, afterAdd, args, {
            id: id
          })
        };
      }
      if (tool === 'rename_subtask') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
        }
        var renameText = typeof args.text === 'string' ? args.text.trim() : '';
        if (!renameText) {
          return { ok: false, tool: tool, error: 'Nouveau texte requis' };
        }
        var beforeRename = snapshotCompletion(bridge);
        var renameBase =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
        var target = resolveSubtaskItem(renameBase.items, args);
        if (!target) {
          return { ok: false, tool: tool, error: 'Sous-t\u00e2che introuvable' };
        }
        var renamedItems = (renameBase.items || []).map(function (item) {
          if (item.id !== target.id) return item;
          return Object.assign({}, item, { text: renameText });
        });
        var renamedPayload = Object.assign({}, renameBase, {
          items: renamedItems
        });
        if (renamedPayload.progressEnabled === false) {
          delete renamedPayload.progressEnabled;
        }
        bridge.applyCompletion(renamedPayload);
        var afterRenameSnap = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.rename_subtask,
          id: target.id,
          detail: detailForTool(
            tool,
            null,
            null,
            beforeRename,
            afterRenameSnap,
            args,
            { id: target.id }
          )
        };
      }
      if (tool === 'remove_subtask') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
        }
        var beforeRemove = snapshotCompletion(bridge);
        var removeBase =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
        var removeTarget = resolveSubtaskItem(removeBase.items, args);
        if (!removeTarget) {
          return { ok: false, tool: tool, error: 'Sous-t\u00e2che introuvable' };
        }
        var nextRemoveItems = (removeBase.items || []).filter(function (item) {
          return item.id !== removeTarget.id;
        });
        var removePayload = Object.assign({}, removeBase, {
          items: nextRemoveItems
        });
        if (!nextRemoveItems.length && (removeBase.items || []).length) {
          var priorPct = 0;
          if (
            typeof CompletionTrello !== 'undefined' &&
            CompletionTrello.computeCardProgress
          ) {
            priorPct = CompletionTrello.computeCardProgress(removeBase).percent;
          }
          removePayload.progress = priorPct;
        }
        if (removePayload.progressEnabled === false) {
          delete removePayload.progressEnabled;
        }
        bridge.applyCompletion(removePayload);
        var afterRemove = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.remove_subtask,
          id: removeTarget.id,
          detail: detailForTool(
            tool,
            null,
            null,
            beforeRemove,
            afterRemove,
            args,
            { id: removeTarget.id }
          )
        };
      }
      if (tool === 'complete_all_subtasks') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
        }
        var beforeComplete = snapshotCompletion(bridge);
        var completeBase =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
        var completeNext;
        if (
          typeof CompletionTrello !== 'undefined' &&
          CompletionTrello.markFullyComplete
        ) {
          completeNext = CompletionTrello.markFullyComplete(completeBase);
        } else if (completeBase.items && completeBase.items.length) {
          completeNext = Object.assign({}, completeBase, {
            items: (completeBase.items || []).map(function (item) {
              return Object.assign({}, item, { done: true, progress: 100 });
            })
          });
          delete completeNext.progressEnabled;
        } else {
          completeNext = Object.assign({}, completeBase, { progress: 100 });
          delete completeNext.progressEnabled;
        }
        bridge.applyCompletion(completeNext);
        var afterComplete = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.complete_all_subtasks,
          detail: detailForTool(
            tool,
            null,
            null,
            beforeComplete,
            afterComplete,
            args
          )
        };
      }
      if (tool === 'reset_progress') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
        }
        var includeCompleted = args.includeCompleted !== false;
        var beforeReset = snapshotCompletion(bridge);
        var resetBase =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
        var resetNext;
        if (resetBase.items && resetBase.items.length) {
          resetNext = Object.assign({}, resetBase, {
            items: (resetBase.items || []).map(function (item) {
              if (!includeCompleted && item.done) return item;
              return Object.assign({}, item, { done: false, progress: 0 });
            })
          });
        } else {
          resetNext = Object.assign({}, resetBase, { progress: 0 });
        }
        if (resetNext.progressEnabled === false) {
          delete resetNext.progressEnabled;
        }
        bridge.applyCompletion(resetNext);
        var afterReset = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.reset_progress,
          detail: detailForTool(
            tool,
            null,
            null,
            beforeReset,
            afterReset,
            args
          )
        };
      }
      if (tool === 'toggle_subtask' || tool === 'set_subtask_progress') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
        }
        var beforeSub = snapshotCompletion(bridge);
        var base =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
        var resolved = resolveSubtaskItem(base.items, args);
        if (!resolved) {
          return { ok: false, tool: tool, error: 'Sous-t\u00e2che introuvable' };
        }
        var targetId = resolved.id;
        var nextItems = (base.items || []).map(function (item) {
          if (item.id !== targetId) return item;
          var copy = Object.assign({}, item);
          if (tool === 'toggle_subtask') {
            var done = args.done != null ? !!args.done : !item.done;
            copy.done = done;
            copy.progress = done
              ? 100
              : args.progress != null
                ? clampInt(args.progress, 0, 100, 0)
                : 0;
          } else {
            copy.progress = clampInt(args.progress, 0, 100, item.progress || 0);
            copy.done = copy.progress >= 100;
          }
          return copy;
        });
        var togglePayload = Object.assign({}, base, { items: nextItems });
        if (togglePayload.progressEnabled === false) {
          delete togglePayload.progressEnabled;
        }
        bridge.applyCompletion(togglePayload);
        var afterSub = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary:
            tool === 'toggle_subtask'
              ? TOOL_LABELS.toggle_subtask
              : TOOL_LABELS.set_subtask_progress,
          id: targetId,
          detail: detailForTool(tool, null, null, beforeSub, afterSub, args, {
            id: targetId
          })
        };
      }
      return { ok: false, tool: tool, error: 'Outil inconnu\u00a0: ' + tool };
    } catch (err) {
      return {
        ok: false,
        tool: tool,
        error: (err && err.message) || '\u00c9chec d\'ex\u00e9cution'
      };
    }
  }

  async function executeActions(bridge, actions) {
    var list = Array.isArray(actions) ? actions : [];
    var results = [];
    var summaries = [];
    var errors = [];
    for (var i = 0; i < list.length; i++) {
      var result = await executeAction(bridge, list[i]);
      results.push(result);
      if (result.ok && result.summary) summaries.push(result.summary);
      if (!result.ok && result.error) errors.push(result.error);
    }
    var applied = {
      results: results,
      summary: summaries.filter(Boolean).join(' ') || (errors.length ? '' : 'OK'),
      errors: errors,
      ok: errors.length === 0 && results.length > 0
    };
    applied.recap = formatChangeRecap(applied);
    return applied;
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
    CARD_INTERVIEW_KEY: CARD_INTERVIEW_KEY,
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
    buildPriorityExplanation: buildPriorityExplanation,
    buildEaseExplanation: buildEaseExplanation,
    dueFromOffsetMinutes: dueFromOffsetMinutes,
    nowTimeLocal: nowTimeLocal,
    parseRelativeDueOffset: parseRelativeDueOffset,
    rewriteActionsForRelativeDue: rewriteActionsForRelativeDue,
    detectPriorityTierInText: detectPriorityTierInText,
    rewriteActionsForPriorityTier: rewriteActionsForPriorityTier,
    normalizePrompts: normalizePrompts,
    normalizeCardPatches: normalizeCardPatches,
    chatTurn: chatTurn,
    memoryTurn: memoryTurn,
    cardInterviewTurn: cardInterviewTurn,
    loadCardInterview: loadCardInterview,
    saveCardInterview: saveCardInterview,
    normalizeCardInterview: normalizeCardInterview,
    emptyCardInterview: emptyCardInterview,
    markInterviewQuestionAsked: markInterviewQuestionAsked,
    markInterviewComplete: markInterviewComplete,
    suggestQuestions: suggestQuestions,
    suggestCardImprovements: suggestCardImprovements,
    suggestSubtasks: suggestSubtasks,
    suggestGoals: suggestGoals,
    suggestMetrics: suggestMetrics,
    parseMetric: parseMetric,
    executeAction: executeAction,
    executeActions: executeActions,
    formatChangeRecap: formatChangeRecap,
    looksLikeAppliedClaim: looksLikeAppliedClaim,
    runProviderTests: runProviderTests,
    chatCompletions: chatCompletions,
    extractStreamingMessage: extractStreamingMessage,
    estimateCostUsd: estimateCostUsd,
    extractUsageFromRaw: extractUsageFromRaw,
    contextWindowForModel: contextWindowForModel
  };
})(typeof window !== 'undefined' ? window : this);
