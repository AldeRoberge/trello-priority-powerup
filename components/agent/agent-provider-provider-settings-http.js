/**
 * AI agent: provider and HTTP
 *
 * Part of the agent (see agent.parts.json). Member-private provider settings, apiFetch and relative-due rewrites, turn guards.
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
 */

/**
 * agent-provider: part 1 of 2 (5. Provider settings + HTTP).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-provider.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var DEFAULT_OPENAI_BASE = S.DEFAULT_OPENAI_BASE;
  var PRESETS = S.PRESETS;
  var PROVIDER_STORAGE_KEY = S.PROVIDER_STORAGE_KEY;

  // from other parts (functions, resolved at call time)
  function clampInt() { return S.clampInt.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function foldMatchText() { return S.foldMatchText.apply(this, arguments); }
  function normalizeAgentColorArg() { return S.normalizeAgentColorArg.apply(this, arguments); }
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }
  function normalizeModelMode() { return S.normalizeModelMode.apply(this, arguments); }
  function resolveHeatSegment() { return S.resolveHeatSegment.apply(this, arguments); }
  function stripInterviewMarkup() { return S.stripInterviewMarkup.apply(this, arguments); }
  function urgencyAskForTaskTypes() { return S.urgencyAskForTaskTypes.apply(this, arguments); }

var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});
  var DEFAULT_OPENAI_BASE = S.DEFAULT_OPENAI_BASE;
  var PRESETS = S.PRESETS;
  var PROVIDER_STORAGE_KEY = S.PROVIDER_STORAGE_KEY;
  function clampInt() { return S.clampInt.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function foldMatchText() { return S.foldMatchText.apply(this, arguments); }
  function normalizeAgentColorArg() { return S.normalizeAgentColorArg.apply(this, arguments); }
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }
  function normalizeModelMode() { return S.normalizeModelMode.apply(this, arguments); }
  function resolveHeatSegment() { return S.resolveHeatSegment.apply(this, arguments); }
  function stripInterviewMarkup() { return S.stripInterviewMarkup.apply(this, arguments); }
  function urgencyAskForTaskTypes() { return S.urgencyAskForTaskTypes.apply(this, arguments); }

  // ── 5. Provider settings + HTTP ──────────────────────────────────────────
  // Stored member/private (agentProvider). Fingerprint gates “verified”.

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
        : preset.model || 'gpt-5.4-mini';
    // Soft-migrate legacy preset defaults to the current smarter default.
    if (model === 'gpt-4o-mini') {
      model = presetId === 'openrouter' ? 'openai/gpt-5.4-mini' : 'gpt-5.4-mini';
    } else if (model === 'openai/gpt-4o-mini') {
      model = 'openai/gpt-5.4-mini';
    }
    var apiKey = typeof src.apiKey === 'string' ? src.apiKey.trim() : '';
    var verifiedFingerprint =
      typeof src.verifiedFingerprint === 'string' ? src.verifiedFingerprint : '';
    return {
      preset: presetId,
      baseUrl: baseUrl,
      model: model,
      modelMode: normalizeModelMode(src.modelMode),
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
    if (!t || typeof t.get !== 'function') {
      dbgLog('agent', 'provider.load', { configured: false });
      return normalizeProvider(null);
    }
    try {
      var stored = await t.get('member', 'private', PROVIDER_STORAGE_KEY);
      var normalized = normalizeProvider(stored);
      dbgLog('agent', 'provider.load', { configured: isConfigured(normalized) });
      return normalized;
    } catch (err) {
      dbgError('agent', 'provider.load', err);
      console.error('PriorityAgent.getProvider failed', err);
      return normalizeProvider(null);
    }
  }

  async function saveProvider(t, provider) {
    var normalized = normalizeProvider(provider);
    await t.set('member', 'private', PROVIDER_STORAGE_KEY, normalized);
    dbgLog('agent', 'provider.save', { configured: isConfigured(normalized) });
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
      headers['X-Title'] =
        (global.PriorityBrand &&
          typeof global.PriorityBrand.getAppName === 'function' &&
          global.PriorityBrand.getAppName()) ||
        (global.PriorityRestConfig && global.PriorityRestConfig.appName) ||
        'Trello Cerveau';
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

  /** The computer's clock: local date, time, IANA zone and UTC offset. */
  function localClock(d) {
    d = d || new Date();
    var timeZone = 'UTC';
    try {
      var resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolved) timeZone = resolved;
    } catch (e) { /* keep UTC */ }
    var east = -d.getTimezoneOffset();
    var sign = east >= 0 ? '+' : '-';
    var abs = Math.abs(east);
    var offH = Math.floor(abs / 60);
    var offM = abs % 60;
    var utcOffset = 'UTC' + sign + offH + (offM ? ':' + String(offM).padStart(2, '0') : '');
    return {
      today: todayIsoLocal(d),
      nowTime: nowTimeLocal(d),
      timeZone: timeZone,
      utcOffset: utcOffset
    };
  }

  /** A UTC instant written in the computer's local time (YYYY-MM-DD HH:MM). */
  function localStamp(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function userTurnWithClock(text) {
    var c = localClock();
    var body = String(text || '').trim();
    var note = '[Heure de cet ordinateur, maintenant : ' + c.today + ' ' + c.nowTime +
      ' ' + c.timeZone + ' ' + c.utcOffset + '. Vrai pour toute la réponse. Ne cite pas cette ligne.]';
    return body ? body + '\n' + note : note;
  }

  function clockFromContext(context) {
    var live = localClock();
    return {
      today: (context && context.today) || live.today,
      nowTime: (context && context.nowTime) || live.nowTime,
      timeZone: (context && context.timeZone) || live.timeZone,
      utcOffset: (context && context.utcOffset) || live.utcOffset
    };
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

  var AGENT_COLOR_WORD_RE =
    /\b(orange|yellow|jaune|gold|amber|dore|dor[eé]|peach|green|vert|lime|mint|purple|violet|lavender|blue|bleu|pink|rose|red|rouge|teal|turquoise|cyan|coral|corail|sky|ciel)\b/i;

  function detectAgentColorInText(text) {
    var t = String(text || '');
    if (!t.trim()) return '';
    var m = t.match(AGENT_COLOR_WORD_RE);
    if (!m) return '';
    return normalizeAgentColorArg(m[1] || m[0]);
  }

  function looksLikeAgentColorChangeRequest(text) {
    var t = String(text || '').trim();
    if (!t) return false;
    if (
      /\b(couleur|color|aura|teint(?:e|ure)?|glow)\b/i.test(t) &&
      /\b(change|changer|passe(?:r)?|mets?|mettre|sois|deviens?|devenir|set|update|turn|become|switch|make|go)\b/i.test(
        t
      )
    ) {
      return true;
    }
    // Short commands: "sois bleu", "be blue", "en bleu", "go blue"
    if (
      /^(sois|deviens|be|go|en|in)\s+/i.test(t) &&
      AGENT_COLOR_WORD_RE.test(t)
    ) {
      return true;
    }
    return false;
  }

  function looksLikeAgentColorChangeClaim(message) {
    var t = String(message || '').trim();
    if (!t) return false;
    if (!AGENT_COLOR_WORD_RE.test(t)) return false;
    return (
      /\b(je\s+(suis|passe|deviens|change)|passe\s+au|en\s+(mode\s+)?|voil[aà]\s*[;:,-]?\s*(du|de\s+la|le)?|okay[,!]?\s*(je|i'?m)|i'?m\s+(now\s+)?|now\s+i'?m|i\s+am\s+(now\s+)?|switched\s+to|changed\s+(my\s+)?(color|colour)|couleur\s+(mise\s+[aà]\s+jour|chang[eé]e))\b/i.test(
        t
      ) ||
      /\b(okay|ok|d'?accord|entendu|c'?est\s+fait|voil[aà])\b.{0,40}\b(couleur|color|bleu|blue|rouge|red|vert|green|jaune|yellow|violet|purple|rose|pink|orange|teal|coral|sky|ciel)\b/i.test(
        t
      )
    );
  }

  /**
   * Model often says "okay I'm blue" with color:"blue" but forgets set_agent_color.
   * Inject the tool when the user asked for a recolor, or the reply claims one.
   */
  function rewriteActionsForAgentColor(actions, userText, assistantMessage, colorHint) {
    var list = Array.isArray(actions) ? actions.slice() : [];
    var hasSetColor = list.some(function (a) {
      return a && a.tool === 'set_agent_color';
    });
    if (hasSetColor) {
      return { actions: list, injected: false, color: null };
    }
    var fromUser = looksLikeAgentColorChangeRequest(userText)
      ? detectAgentColorInText(userText)
      : '';
    var fromClaim =
      !fromUser && looksLikeAgentColorChangeClaim(assistantMessage)
        ? detectAgentColorInText(assistantMessage) ||
          normalizeAgentColorArg(colorHint)
        : '';
    var color = fromUser || fromClaim || '';
    // If user asked to recolor and the model only echoed color in the field.
    if (
      !color &&
      looksLikeAgentColorChangeRequest(userText) &&
      normalizeAgentColorArg(colorHint)
    ) {
      color = normalizeAgentColorArg(colorHint);
    }
    if (!color) {
      return { actions: list, injected: false, color: null };
    }
    list.unshift({ tool: 'set_agent_color', args: { color: color } });
    return { actions: list, injected: true, color: color };
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

  /** Normalize model `blocks` via AgentBlocks when available. */
  function normalizeBlocks(raw, context) {
    if (
      typeof AgentBlocks !== 'undefined' &&
      typeof AgentBlocks.normalizeBlocks === 'function'
    ) {
      return AgentBlocks.normalizeBlocks(raw, context);
    }
    return [];
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
      '. Tu peux encore peaufiner urgence / impact / facilit\u00e9 si tu veux.'
    );
  }

  /** True when this turn's actions mark the card (master) progress as done. */
  function actionsReachFullProgress(actions) {
    if (!Array.isArray(actions)) return false;
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (!a || typeof a.tool !== 'string') continue;
      if (a.tool === 'complete_all_subtasks') return true;
      if (a.tool === 'set_progress') {
        var args = a.args && typeof a.args === 'object' ? a.args : {};
        if (args.progress != null && Number(args.progress) >= 100) return true;
      }
    }
    return false;
  }

  function contextProgressComplete(context) {
    var prog = context && context.progress;
    if (!prog || typeof prog !== 'object') return false;
    if (typeof prog.percent === 'number' && prog.percent >= 100) return true;
    if (typeof prog.cardProgress === 'number' && prog.cardProgress >= 100) return true;
    return false;
  }

  function looksLikeDueAskMessage(message) {
    if (typeof message !== 'string' || !message) return false;
    // Strip [[a:quand]] markers so accent-highlighted due asks still match.
    var t = stripInterviewMarkup(message);
    if (
      /veux-tu que je d[eé]finisse l['']?\u00e9ch[eé]ance/i.test(t) ||
      /quelle est la date d['']?\u00e9ch[eé]ance/i.test(t) ||
      /c['']est pour quand\s*\?/i.test(t) ||
      /pour quelle date\s*\?/i.test(t)
    ) {
      return true;
    }
    return (
      /(?:^|[^a-z\u00e0-\u00ff])(?:\u00e9ch[e\u00e9]ance|deadline|date\s+limite)(?![a-z\u00e0-\u00ff])/i.test(t) && /\?/.test(t)
    );
  }

  /** True when the card already has an active due date the AI must not re-ask. */
  function contextHasActiveDue(context) {
    var due = context && context.due;
    return !!(due && due.enabled && due.dueDate);
  }

  function cardMemoryHasWhyFact(cardMemory) {
    var facts =
      cardMemory && Array.isArray(cardMemory.facts) ? cardMemory.facts : [];
    for (var i = 0; i < facts.length; i++) {
      var f = facts[i];
      var text =
        typeof f === 'string'
          ? f
          : f && typeof f === 'object'
            ? String(f.text || f.fact || '')
            : '';
      if (/^\s*pourquoi\b/i.test(text)) return true;
    }
    return false;
  }

  /**
   * Explicit "already filled" clues for the interview model — do not re-ask.
   */
  function summarizeInterviewAlreadyKnown(context) {
    var due = context && context.due;
    var activeDue = contextHasActiveDue(context);
    var types = normalizeAgentTaskTypes(context && context.taskTypes);
    return {
      dueActive: activeDue,
      dueDate: activeDue ? due.dueDate : null,
      dueTime: activeDue ? due.dueTime || null : null,
      whyKnown: cardMemoryHasWhyFact(context && context.cardMemory),
      taskTypesKnown: types.length > 0,
      taskTypes: types,
      taskTypesLocked: !!(context && context.taskTypesLocked),
      priorityAxesTrusted: !!(
        context &&
        context.interview &&
        context.interview.priorityAxesTrusted
      ),
      progressComplete: contextProgressComplete(context)
    };
  }

  /**
   * Runtime pivot when we must leave the current interview angle.
   * Never asks for a due date that is already set (or when the task is done).
   */
  function buildInterviewNextPivot(context) {
    var trusted = !!(
      context &&
      context.interview &&
      context.interview.priorityAxesTrusted
    );

    // Default axis values are unreliable until trusted — ask/confirm axes first.
    if (!trusted) {
      return {
        message: urgencyAskForTaskTypes(context && context.taskTypes),
        suggestions: [
          { label: 'Pas grand-chose', heat: 0 },
          { label: 'Un peu emb\u00eatant', heat: 2 },
          { label: 'Oui, c\'est urgent', heat: 4 }
        ],
        suggestionsMulti: false,
        suggestionScale: true,
        completeInterview: false
      };
    }

    if (!contextProgressComplete(context) && !contextHasActiveDue(context)) {
      return {
        message: 'C\'est pour [[a:quand]]?',
        suggestions: ['Aujourd\'hui', 'Demain', 'Pas d\'\u00e9ch\u00e9ance'],
        suggestionsMulti: false,
        suggestionScale: true,
        completeInterview: false
      };
    }

    return {
      message:
        'Ok, on a l\'essentiel' +
        (contextHasActiveDue(context) ? ' (l\'\u00e9ch\u00e9ance est d\u00e9j\u00e0 pos\u00e9e)' : '') +
        '. Tu peux peaufiner si tu veux.',
      suggestions: [],
      suggestionsMulti: false,
      suggestionScale: false,
      completeInterview: true
    };
  }

  /**
   * If the model asks for a due date that context already has, pivot away.
   * (Same class of bug as progress-complete due asks.)
   */
  function applyKnownDueGuards(turn, context) {
    turn = turn && typeof turn === 'object' ? turn : {};
    var message = typeof turn.message === 'string' ? turn.message : '';
    if (!looksLikeDueAskMessage(message)) return turn;
    if (contextProgressComplete(context)) return turn;
    if (!contextHasActiveDue(context)) return turn;

    var pivot = buildInterviewNextPivot(context);
    if (looksLikeDueAskMessage(pivot.message)) {
      pivot = {
        message:
          'Ok, l\'\u00e9ch\u00e9ance est d\u00e9j\u00e0 pos\u00e9e. Tu peux peaufiner si tu veux.',
        suggestions: [],
        suggestionsMulti: false,
        suggestionScale: false,
        completeInterview: true
      };
    }
    return Object.assign({}, turn, {
      message: pivot.message,
      suggestions: pivot.suggestions,
      suggestionsMulti: pivot.suggestionsMulti,
      suggestionScale: pivot.suggestionScale,
      completeInterview: !!pivot.completeInterview
    });
  }

  /**
   * Motivation POURQUOI ("Pourquoi tu veux…?") — not progress angles like
   * "Pourquoi ça n'a pas été commencé?".
   */
  function looksLikeMotivationWhyAsk(text) {
    var t = stripInterviewMarkup(text).toLocaleLowerCase('fr-FR');
    if (!t || t.indexOf('?') < 0) return false;
    if (
      !/\bpourquoi\b/.test(t) &&
      !/\b[cç]a\s+sert\s+[àa]\s+quoi\b/.test(t) &&
      !/\bc['']est\s+pour\s+quoi\b/.test(t)
    ) {
      return false;
    }
    // Progress / blocked follow-ups are separate interview steps.
    if (
      /pas\s+[ée]t[ée]\s+commenc/.test(t) ||
      /n['']a\s+pas\s+[ée]t[ée]\s+commenc/.test(t) ||
      /pourquoi\s+[cç]a\s+n['']/.test(t) ||
      /\bbloqu/.test(t) ||
      /\bfreine\b/.test(t) ||
      /qu['']?est[- ]ce\s+qui\s+(?:bloque|freine)/.test(t)
    ) {
      return false;
    }
    return (
      /\btu\s+veux\b/.test(t) ||
      /\bon\s+(?:veut|fait|ferait)\b/.test(t) ||
      /\bfaire\b/.test(t) ||
      /\bmettre\b/.test(t) ||
      /\bce\s+plan\b/.test(t) ||
      /\bcette\b/.test(t) ||
      /\bcet\b/.test(t) ||
      /\b[cç]a\s+sert\s+[àa]\s+quoi\b/.test(t) ||
      /\bc['']est\s+pour\s+quoi\b/.test(t) ||
      /^\s*pourquoi\b/.test(t)
    );
  }

  /**
   * Motives that are already self-explanatory — digging "why avoid costs?"
   * is a stupid nested POURQUOI.
   * Note: avoid \\b around accented French letters (JS \\b is ASCII-only).
   */
  function isUniversalMotiveText(text) {
    var t = String(text || '').toLocaleLowerCase('fr-FR');
    if (!t) return false;
    if (
      /[ée]viter/.test(t) &&
      /(co[uû]ts?|frais|d[ée]penses|factures?|probl[eè]mes?|soucis|ennuis|gaspi|pertes?)/.test(
        t
      )
    ) {
      return true;
    }
    if (
      /(r[ée]duire|[ée]conomiser|baisser|limiter)/.test(t) &&
      /(co[uû]ts?|frais|d[ée]penses|argent|budget)/.test(t)
    ) {
      return true;
    }
    if (
      /(gagner|sauver|[ée]conomiser)\s+du\s+temps/.test(t) ||
      /moins\s+de\s+(temps|effort|friction|gaspi)/.test(t) ||
      /plus\s+(efficace|simple|propre)/.test(t) ||
      /efficacit[ée]/.test(t)
    ) {
      return true;
    }
    return false;
  }

  function interviewMotivationWhyAlreadyAsked(context, history) {
    if (cardMemoryHasWhyFact(context && context.cardMemory)) return true;
    var asked =
      context && context.interview && Array.isArray(context.interview.asked)
        ? context.interview.asked
        : [];
    var i;
    for (i = 0; i < asked.length; i++) {
      if (looksLikeMotivationWhyAsk(asked[i])) return true;
    }
    var hist = Array.isArray(history) ? history : [];
    for (i = 0; i < hist.length; i++) {
      if (
        hist[i] &&
        hist[i].role === 'assistant' &&
        looksLikeMotivationWhyAsk(hist[i].content || '')
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Block motivation POURQUOI ("Pourquoi tu veux…?") entirely — including the
   * opening ask. Progress angles like "Pourquoi ça n'a pas été commencé?" stay OK.
   */
  function applyInterviewWhyGuards(turn, context, history) {
    turn = turn && typeof turn === 'object' ? turn : {};
    var message = typeof turn.message === 'string' ? turn.message : '';
    if (!looksLikeMotivationWhyAsk(message)) return turn;

    var next = buildInterviewNextPivot(context);
    return Object.assign({}, turn, {
      message: next.message,
      suggestions: next.suggestions,
      suggestionsMulti: next.suggestionsMulti,
      suggestionScale: next.suggestionScale,
      completeInterview: !!next.completeInterview
    });
  }

  // exports
  S.AGENT_COLOR_WORD_RE = AGENT_COLOR_WORD_RE;
  S.PRIORITY_TIER_ALIASES = PRIORITY_TIER_ALIASES;
  S.actionsReachFullProgress = actionsReachFullProgress;
  S.apiFetch = apiFetch;
  S.applyInterviewWhyGuards = applyInterviewWhyGuards;
  S.applyKnownDueGuards = applyKnownDueGuards;
  S.buildInterviewNextPivot = buildInterviewNextPivot;
  S.cardMemoryHasWhyFact = cardMemoryHasWhyFact;
  S.classifyFetchError = classifyFetchError;
  S.clearVerified = clearVerified;
  S.clockFromContext = clockFromContext;
  S.contextHasActiveDue = contextHasActiveDue;
  S.contextProgressComplete = contextProgressComplete;
  S.detectAgentColorInText = detectAgentColorInText;
  S.detectPriorityTierInText = detectPriorityTierInText;
  S.dueFromOffsetMinutes = dueFromOffsetMinutes;
  S.ensurePriorityAxesPrompt = ensurePriorityAxesPrompt;
  S.getProvider = getProvider;
  S.interviewMotivationWhyAlreadyAsked = interviewMotivationWhyAlreadyAsked;
  S.isBareRelativeDuePhrase = isBareRelativeDuePhrase;
  S.isConfigured = isConfigured;
  S.isUniversalMotiveText = isUniversalMotiveText;
  S.isVerified = isVerified;
  S.localClock = localClock;
  S.localStamp = localStamp;
  S.looksLikeAgentColorChangeClaim = looksLikeAgentColorChangeClaim;
  S.looksLikeAgentColorChangeRequest = looksLikeAgentColorChangeRequest;
  S.looksLikeDueAskMessage = looksLikeDueAskMessage;
  S.looksLikeMotivationWhyAsk = looksLikeMotivationWhyAsk;
  S.looksLikePrematurePriorityClarify = looksLikePrematurePriorityClarify;
  S.looksLikePriorityChangeRequest = looksLikePriorityChangeRequest;
  S.markVerified = markVerified;
  S.normalizeBaseUrl = normalizeBaseUrl;
  S.normalizeBlocks = normalizeBlocks;
  S.normalizePrompts = normalizePrompts;
  S.normalizeProvider = normalizeProvider;
  S.nowTimeLocal = nowTimeLocal;
  S.parseRelativeDueOffset = parseRelativeDueOffset;
  S.polishMessageAfterTierApply = polishMessageAfterTierApply;
  S.providerFingerprint = providerFingerprint;
  S.providersEqual = providersEqual;
  S.requestHeaders = requestHeaders;
  S.rewriteActionsForAgentColor = rewriteActionsForAgentColor;
  S.rewriteActionsForPriorityTier = rewriteActionsForPriorityTier;
  S.rewriteActionsForRelativeDue = rewriteActionsForRelativeDue;
  S.saveProvider = saveProvider;
  S.summarizeInterviewAlreadyKnown = summarizeInterviewAlreadyKnown;
  S.todayIsoLocal = todayIsoLocal;
  S.userTurnWithClock = userTurnWithClock;
})(typeof window !== 'undefined' ? window : this);
