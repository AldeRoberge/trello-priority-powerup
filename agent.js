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
    return {
      preset: presetId,
      baseUrl: baseUrl,
      model: model,
      apiKey: apiKey
    };
  }

  function isConfigured(provider) {
    var p = normalizeProvider(provider);
    return !!(p.apiKey && p.baseUrl && p.model);
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
      ctx.priority = {
        enabled: state.priorityEnabled !== false,
        urgency: state.urgency,
        impact: state.impact,
        ease: state.ease
      };
      ctx.due = {
        enabled: state.dueEnabled !== false,
        dueDate: state.dueDate || null,
        dueTime: state.dueTime || null
      };
      ctx.blocked = {
        enAttente: !!state.enAttente,
        blockedReasons: Array.isArray(state.blockedReasons)
          ? state.blockedReasons.slice()
          : []
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
              blocked: !!display.blocked,
              dueCountdown: display.dueCountdown || null,
              duePast: !!display.duePast,
              dueDate: display.dueDate || null
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
      var progressMeta = null;
      if (
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
        enabled: completion.progressEnabled !== false,
        cardProgress:
          completion.items && completion.items.length
            ? null
            : typeof completion.progress === 'number'
              ? completion.progress
              : null,
        percent: progressMeta ? progressMeta.percent : null,
        doneCount: progressMeta ? progressMeta.doneCount : null,
        totalCount: progressMeta ? progressMeta.totalCount : null,
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
    return [
      'Tu es l\'assistant du Power-Up Priorit\u00e9 dans Trello.',
      'Tu r\u00e9ponds toujours en fran\u00e7ais, de fa\u00e7on concise et utile.',
      'Tu peux expliquer la priorit\u00e9, l\'\u00e9ch\u00e9ance, le blocage et le progr\u00e8s, et proposer des changements.',
      'R\u00e9ponds UNIQUEMENT avec un objet JSON valide de la forme\u00a0:',
      '{"message":"texte visible","followUps":[{"label":"libell\u00e9 court","actions":[{"tool":"nom","args":{...}}]}]}',
      'R\u00e8gles followUps\u00a0:',
      '- Propose 0 \u00e0 4 suggestions pertinentes.',
      '- Si actions est non vide, le clic applique les outils sans nouvel appel.',
      '- Si actions est [] (tableau vide), le label est renvoy\u00e9 comme message utilisateur.',
      '- Pour une question purement informative, tu peux proposer des follow-ups sans actions.',
      'Outils disponibles\u00a0:',
      '- set_priority: { urgency?:0-4, impact?:0-4, ease?:1-5, priorityEnabled?:boolean }',
      '- set_due: { dueDate?: "YYYY-MM-DD"|null, dueTime?: "HH:MM"|null, dueEnabled?: boolean }',
      '- set_blocked: { enAttente?: boolean, blockedReasons?: string[] }',
      '- set_progress: { progress?:0-100, progressEnabled?: boolean } (progress carte si pas de sous-t\u00e2ches)',
      '- add_subtask: { text: string }',
      '- toggle_subtask: { id: string, done?: boolean }',
      '- set_subtask_progress: { id: string, progress: 0-100 }',
      'Contexte carte actuel (JSON)\u00a0:',
      JSON.stringify(context)
    ].join('\n');
  }

  function parseAssistantPayload(content) {
    var text = typeof content === 'string' ? content.trim() : '';
    if (!text) {
      return {
        message: 'R\u00e9ponse vide du fournisseur.',
        followUps: []
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
              actions.push({
                tool: tool,
                args: action.args && typeof action.args === 'object' ? action.args : {}
              });
            });
          }
          followUps.push({ label: label, actions: actions });
        });
      }
      return { message: message, followUps: followUps.slice(0, 4) };
    } catch (e) {
      return { message: text, followUps: [] };
    }
  }

  async function chatCompletions(provider, messages, options) {
    var p = normalizeProvider(provider);
    var body = {
      model: p.model,
      messages: messages,
      temperature: options && options.temperature != null ? options.temperature : 0.3
    };
    if (!options || options.jsonMode !== false) {
      body.response_format = { type: 'json_object' };
    }
    if (options && options.max_tokens != null) {
      body.max_tokens = options.max_tokens;
    }
    var result = await apiFetch(p, '/chat/completions', {
      method: 'POST',
      body: body
    });
    if (!result.ok) {
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

  async function chatTurn(provider, history, bridge, userText) {
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

    var response;
    try {
      response = await chatCompletions(provider, messages, { jsonMode: true });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        response = await chatCompletions(provider, messages, { jsonMode: false });
      } else {
        throw err;
      }
    }
    var parsed = parseAssistantPayload(response.content);
    return {
      message: parsed.message,
      followUps: parsed.followUps,
      rawJson: response.content,
      context: context
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
        if (args.enAttente != null) blockedPartial.enAttente = !!args.enAttente;
        if (Array.isArray(args.blockedReasons)) {
          blockedPartial.blockedReasons = args.blockedReasons
            .filter(function (r) {
              return typeof r === 'string' && r.trim();
            })
            .map(function (r) {
              return r.trim();
            });
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
    isConfigured: isConfigured,
    getProvider: getProvider,
    saveProvider: saveProvider,
    buildContext: buildContext,
    chatTurn: chatTurn,
    executeAction: executeAction,
    executeActions: executeActions,
    runProviderTests: runProviderTests,
    chatCompletions: chatCompletions
  };
})(typeof window !== 'undefined' ? window : this);
