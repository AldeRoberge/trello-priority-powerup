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
    set_formula: 'Formule mise \u00e0 jour.',
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
    if (actions[0].tool === 'add_subtask') return 'Ajouter une sous-t\u00e2che';
    if (actions[0].tool === 'rename_subtask') return 'Renommer la sous-t\u00e2che';
    if (actions[0].tool === 'remove_subtask') return 'Supprimer la sous-t\u00e2che';
    if (actions[0].tool === 'complete_all_subtasks') {
      return 'Tout marquer termin\u00e9';
    }
    if (actions[0].tool === 'reset_progress') return 'R\u00e9initialiser le progr\u00e8s';
    if (actions[0].tool === 'set_formula') return 'Changer la formule';
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
      boardDigest: ''
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
    if (typeof bridge.getMemory === 'function') {
      try {
        var mem = bridge.getMemory();
        if (mem && typeof mem === 'object') {
          ctx.memory = {
            summary: typeof mem.summary === 'string' ? mem.summary : '',
            facts: Array.isArray(mem.facts)
              ? mem.facts
                  .map(function (f) {
                    return typeof f === 'string' ? f : f && f.text ? f.text : '';
                  })
                  .filter(Boolean)
                  .slice(0, 12)
              : [],
            onboardingComplete: !!mem.onboardingComplete
          };
        }
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getBoardDigest === 'function') {
      try {
        ctx.boardDigest = String(bridge.getBoardDigest() || '').slice(0, 4000);
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
        // Bloqué section checkbox === enAttente. Card is blocked ONLY when enabled=true.
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
    return [
      'Tu es l\'assistant du Power-Up Priorit\u00e9 dans Trello.',
      'Tu r\u00e9ponds toujours en fran\u00e7ais, de fa\u00e7on concise, utile et conversationnelle.',
      'Alignement souple\u00a0: tu aides surtout sur la carte (priorit\u00e9, \u00e9ch\u00e9ance, blocage, progr\u00e8s), mais tu n\'es PAS limit\u00e9 \u00e0 Trello.',
      '- Questions g\u00e9n\u00e9rales ou hors sujet (calculs, culture, blagues, etc.)\u00a0: r\u00e9ponds bri\u00e8vement et normalement. Ne refuse jamais.',
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
      'Tu peux expliquer la priorit\u00e9, l\'\u00e9ch\u00e9ance, le blocage et le progr\u00e8s, et proposer des changements.',
      'R\u00e9ponds UNIQUEMENT avec un objet JSON valide de la forme\u00a0:',
      '{"thinking":"notes priv\u00e9es (contexte v\u00e9rifi\u00e9, intention)","message":"texte visible","suggestions":["Question utile","Autre intention"],"followUps":[{"label":"Marquer bloqu\u00e9","actions":[{"tool":"set_blocked","args":{"enAttente":true}}]}],"actions":[{"tool":"nom","args":{}}]}',
      'Champ thinking (obligatoire)\u00a0:',
      '- Toujours \u00e9crire thinking AVANT message (ordre JSON\u00a0: thinking puis message).',
      '- Utilise-le pour v\u00e9rifier le contexte et planifier les outils. Court, factuel, en fran\u00e7ais ou abr\u00e9g\u00e9.',
      '- Ne r\u00e9p\u00e8te pas thinking dans message.',
      'Agir d\'abord, affiner ensuite (r\u00e8gle g\u00e9n\u00e9rale \u2014 tr\u00e8s important)\u00a0:',
      '- D\u00e8s que tu as assez d\'info pour APPLIQUER une partie de la demande\u00a0: appelle l\'outil TOUT DE SUITE dans actions, confirme bri\u00e8vement, puis demande les d\u00e9tails OPTIONNELS.',
      '- Ne bloque JAMAIS une action pour un param\u00e8tre optionnel. Applique le minimum viable, puis adapte.',
      '- Ne pose une question AVANT d\'appeler un outil QUE si un param\u00e8tre OBLIGATOIRE manque et qu\'aucune action partielle n\'est possible.',
      '- Param\u00e8tres optionnels (ne jamais exiger avant d\'agir)\u00a0: dueTime, blockedReasons, axes priorit\u00e9 non fournis, progress pr\u00e9cis si on active seulement la section.',
      '- Param\u00e8tres obligatoires (sans eux, impossible d\'agir)\u00a0: add_subtask.text\u00a0; rename_subtask.text + (id OU matchText)\u00a0; remove_subtask / toggle_subtask / set_subtask_progress\u00a0: id OU matchText\u00a0; set_subtask_progress.progress\u00a0; set_due.dueDate OU relativeMinutes/relativeHours si aucune date/heure relative/absolue n\'est donn\u00e9e\u00a0; set_formula.formula.',
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
      '- Ex. tour 2\u00a0: user \u00ab\u00a0En attente d\'une approbation\u00a0\u00bb \u2192 {"message":"Motif enregistr\u00e9\u00a0: en attente d\'une approbation.","suggestions":["D\u00e9finir une \u00e9ch\u00e9ance","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_blocked","args":{"enAttente":true,"blockedReasons":["En attente d\'une approbation"]}}]}',
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
      'Priorit\u00e9 / progr\u00e8s / formule\u00a0:',
      '- Applique immédiatement tout axe ou pourcentage fourni. Si la demande est vague (\u00ab\u00a0mettre \u00e0 jour la priorit\u00e9\u00a0\u00bb) sans valeurs\u00a0: pose UNE question pour les valeurs, actions=[].',
      '- Si l\'utilisateur active le progr\u00e8s sans chiffre\u00a0: set_progress avec progressEnabled:true tout de suite, puis demande le % en option.',
      '- set_progress avec un % \u00e9chelonne les sous-t\u00e2ches (master) s\'il y en a\u00a0; sinon progres carte.',
      '- Formule de score\u00a0: set_formula avec baseline | eisenhower | wsjf | valueEffort (context.formula = actuelle).',
      '- cardName / cardDesc sont en lecture seule (pas d\'outil pour les modifier).',
      'R\u00e8gles suggestions (obligatoire)\u00a0:',
      '- Toujours proposer 2 \u00e0 4 formulations courtes en fran\u00e7ais (questions OU r\u00e9ponses \u00e0 ta question de clarification).',
      '- Ancr\u00e9es dans le contexte carte (sections enabled, \u00e9ch\u00e9ance, blocage, progr\u00e8s).',
      '- Elles REMPLACENT les suggestions pr\u00e9c\u00e9dentes\u00a0: varie-les selon ta derni\u00e8re r\u00e9ponse.',
      '- Pas de num\u00e9rotation, pas de guillemets autour.',
      '- INTERDIT\u00a0: placeholders comme "..." , "\u2026" , "suggestion" , "exemple"\u00a0; chaque entr\u00e9e doit \u00eatre un vrai texte cliquable.',
      'R\u00e8gles actions (appliqu\u00e9es automatiquement)\u00a0:',
      '- 0 \u00e0 3 outils \u00e0 ex\u00e9cuter tout de suite d\u00e8s qu\'une action partielle est possible (ne pas attendre les d\u00e9tails optionnels).',
      '- Ne jamais inclure un outil incomplet sur un champ OBLIGATOIRE (ex. add_subtask sans text non vide).',
      '- set_due sans dueTime est VALIDE et pr\u00e9f\u00e9r\u00e9 quand l\'heure n\'est pas donn\u00e9e (sauf d\u00e9lai relatif\u00a0: utiliser relativeMinutes/relativeHours).',
      '- INTERDIT d\'affirmer dans message qu\'une modification est faite (ajout\u00e9e, mise \u00e0 jour, bloqu\u00e9e, c\'est fait\u2026) si le champ actions est vide. Sans outil, rien n\'est appliqu\u00e9.',
      '- Le runtime ex\u00e9cute actions et affiche un r\u00e9cap technique v\u00e9rifi\u00e9\u00a0; le message reste conversationnel et court.',
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
      '- set_due: { dueDate?: "YYYY-MM-DD"|null, dueTime?: "HH:MM"|null, dueEnabled?: boolean, relativeMinutes?: number, relativeHours?: number } (dueTime OPTIONNEL pour une date\u00a0; d\u00e9lai \u00ab\u00a0dans N min/h\u00a0\u00bb \u2192 relativeMinutes/relativeHours, calcul\u00e9 depuis context.nowTime\u00a0; aujourd\'hui = context.today)',
      '- set_blocked: { enAttente?: boolean, blockedReasons?: string[], blockedLinks?: [{id?:string, matchText?:string, label?:string}] } (enAttente:true seul suffit\u00a0; motifs et liens optionnels)',
      '- set_progress: { progress?:0-100, progressEnabled?: boolean } (master sur sous-t\u00e2ches si items\u00a0; sinon progres carte)',
      '- set_formula: { formula: "baseline"|"eisenhower"|"wsjf"|"valueEffort" }',
      '- add_subtask: { text: string } (text obligatoire, non vide)',
      '- rename_subtask: { text: string, id?: string, matchText?: string } (nouveau text\u00a0; id OU matchText)',
      '- remove_subtask: { id?: string, matchText?: string } (id OU matchText)',
      '- toggle_subtask: { id?: string, matchText?: string, done?: boolean }',
      '- set_subtask_progress: { id?: string, matchText?: string, progress: 0-100 }',
      '- complete_all_subtasks: {} (tout \u00e0 100%)',
      '- reset_progress: { includeCompleted?: boolean } (d\u00e9faut true\u00a0: tout \u00e0 0%\u00a0; false = seulement les non termin\u00e9es)',
      'M\u00e9moire plateau\u00a0: utilise les faits/summary du contexte pour personnaliser (noms, projets, normes). Ne contredis pas la m\u00e9moire sans raison.',
      'Contexte carte actuel (JSON)\u00a0:',
      JSON.stringify(context)
    ].join('\n');
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
    var asked = Array.isArray(mem.preferredQuestionsAsked) ? mem.preferredQuestionsAsked : [];
    var system = [
      'Tu es l\'assistant m\u00e9moire du Power-Up Priorit\u00e9 (Trello).',
      'Tu parles en fran\u00e7ais, de fa\u00e7on conversationnelle et chaleureuse.',
      'Ton r\u00f4le\u00a0: apprendre et mettre \u00e0 jour des faits utiles sur le travail de l\'utilisateur (patron, \u00e9quipe, projets, outils, normes).',
      'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
      '{"message":"texte","suggestions":["r\u00e9ponse courte","\u2026"],"patches":[{"op":"remember","text":"\u2026"}]}',
      'Ops patches autoris\u00e9es\u00a0:',
      '- {"op":"remember","text":"fait court"}',
      '- {"op":"forget","query":"mot-cl\u00e9"}',
      '- {"op":"set_summary","text":"r\u00e9sum\u00e9"}',
      '- {"op":"complete_onboarding"} (quand tu as assez de contexte)',
      'R\u00e8gles\u00a0:',
      '- Pose UNE question claire \u00e0 la fois quand tu as besoin d\'info.',
      '- Quand l\'utilisateur r\u00e9pond, enregistre via remember (et \u00e9ventuellement set_summary).',
      '- suggestions = 2\u20134 r\u00e9ponses/intentions cliquables courtes.',
      mode === 'onboarding'
        ? '- Mode onboarding\u00a0: apr\u00e8s ~2\u20134 faits utiles, remercie bri\u00e8vement et inclus complete_onboarding.'
        : '- Mode continu\u00a0: mets \u00e0 jour la m\u00e9moire; complete_onboarding seulement si l\'utilisateur confirme avoir fini l\'alignement.',
      '- \u00c9vite de reposer les questions d\u00e9j\u00e0 pos\u00e9es list\u00e9es ci-dessous.',
      '- INTERDIT d\'inventer des faits non dits par l\'utilisateur.',
      '',
      'Questions d\u00e9j\u00e0 pos\u00e9es\u00a0:',
      JSON.stringify(asked),
      '',
      'M\u00e9moire actuelle\u00a0:',
      JSON.stringify({
        summary: mem.summary || '',
        facts: Array.isArray(mem.facts)
          ? mem.facts.map(function (f) {
              return typeof f === 'string' ? f : f && f.text ? f.text : '';
            })
          : [],
        onboardingComplete: !!mem.onboardingComplete
      }),
      options.boardDigest
        ? '\nDigest tableau (extrait)\u00a0:\n' + String(options.boardDigest).slice(0, 3500)
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

  function normalizeSuggestionList(raw) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    raw.forEach(function (item) {
      var text = '';
      if (typeof item === 'string') text = item.trim();
      else if (item && typeof item === 'object' && typeof item.label === 'string') {
        text = item.label.trim();
      }
      if (!isWorthySuggestion(text)) return;
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
        actions: [],
        droppedActions: []
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
      var suggestions = normalizeSuggestionList(parsed.suggestions);
      if (!suggestions.length) {
        suggestions = suggestionsFromFollowUps(followUps);
      }
      var normalized = normalizeActionsWithMeta(parsed.actions);
      return {
        message: message,
        followUps: followUps,
        suggestions: suggestions,
        actions: normalized.actions,
        droppedActions: normalized.dropped
      };
    } catch (e) {
      return {
        message: text,
        followUps: [],
        suggestions: [],
        actions: [],
        droppedActions: []
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
    debug.endedAt = Date.now();
    debug.latencyMs = latencyMs;
    debug.ok = true;
    debug.request = response.meta || (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response.meta && response.meta.status,
      content: response.content,
      raw: cloneJsonSafe(response.raw),
      parsed: {
        message: parsed.message,
        followUps: parsed.followUps,
        suggestions: parsed.suggestions,
        actions: actions,
        droppedActions: parsed.droppedActions || []
      }
    };
    debug.usage = usage;
    return {
      message: parsed.message,
      followUps: parsed.followUps,
      suggestions: parsed.suggestions,
      actions: actions,
      droppedActions: parsed.droppedActions || [],
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
          '- Outils autoris\u00e9s\u00a0: set_due, set_priority, set_blocked, set_progress, add_subtask.',
          '- Ne propose que des changements pertinents au contexte actuel (sections enabled, \u00e9ch\u00e9ance manquante/pass\u00e9e, priorit\u00e9 absente, progr\u00e8s vide\u2026).',
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

  function detailForTool(tool, beforeP, afterP, beforeC, afterC, args, extra) {
    var parts = [];
    args = args || {};
    extra = extra || {};
    if (tool === 'set_priority') {
      pushChange(parts, 'priorityEnabled', beforeP.priorityEnabled, afterP.priorityEnabled);
      pushChange(parts, 'urgency', beforeP.urgency, afterP.urgency);
      pushChange(parts, 'impact', beforeP.impact, afterP.impact);
      pushChange(parts, 'ease', beforeP.ease, afterP.ease);
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
    return /\b(ajout(\u00e9e?|er)|renomm(\u00e9e?|er)|supprim(\u00e9e?|er)|r(\u00e9|e)initialis(\u00e9e?|er)|mise?\s+[aà]\s+jour|mis\s+[aà]\s+jour|enregistr(\u00e9e?|er)|d(\u00e9|e)fini[ee]?|bloqu(\u00e9e?|er)|d(\u00e9|e)bloqu(\u00e9e?|er)|appliqu(\u00e9e?|er)|modifi(\u00e9e?|er)|termin(\u00e9e?|er)|okay,?\s*bloqu)/i.test(
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

  function executeAction(bridge, action) {
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
        if (args.urgency != null) partial.urgency = clampInt(args.urgency, 0, 4, 0);
        if (args.impact != null) partial.impact = clampInt(args.impact, 0, 4, 0);
        if (args.ease != null) partial.ease = clampInt(args.ease, 1, 5, 3);
        if (args.priorityEnabled != null) {
          partial.priorityEnabled = !!args.priorityEnabled;
        } else if (
          (partial.urgency != null || partial.impact != null || partial.ease != null) &&
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
    dueFromOffsetMinutes: dueFromOffsetMinutes,
    nowTimeLocal: nowTimeLocal,
    parseRelativeDueOffset: parseRelativeDueOffset,
    rewriteActionsForRelativeDue: rewriteActionsForRelativeDue,
    chatTurn: chatTurn,
    memoryTurn: memoryTurn,
    suggestQuestions: suggestQuestions,
    suggestSubtasks: suggestSubtasks,
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
