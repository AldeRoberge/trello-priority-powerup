/**
 * Priority Power-Up AI agent — OpenAI-compatible client, member-private
 * provider settings, JSON chat protocol with actionable follow-ups.
 * Exposes window.PriorityAgent (no bundler).
 *
 * Role: LLM I/O + action protocol. AgentUI mounts the chat chrome; this
 * module builds context, calls the model, parses JSON turns, and executes
 * actions against Trello bridges (PriorityTrello, CompletionTrello, …).
 *
 * Hard constraints
 * ────────────────
 * - Trello pluginData ≤ 4096 chars per scope/visibility (ALL keys combined).
 *   card/private is shared with cardEditHistory — keep chat/interview slim.
 * - Assistant replies are JSON (message + actions + suggestions + blocks).
 * - Never trust model HTML; UI renders via AgentUI / AgentBlocks safely.
 *
 * Table of contents
 * ─────────────────
 *  1.  Debug helpers, storage keys, assistant scopes (task vs project)
 *  2.  Model tiers / modes / OpenAI–OpenRouter presets
 *  3.  Task-type / color / point-at / effect normalizers
 *  4.  Blocked-reason + People alias resolution; priority explanations
 *  5.  Provider CRUD (member-private), apiFetch, relative-due rewrites
 *  6.  Turn guards (due / why / progress-complete / Québec libre / highlights)
 *  7.  buildContext(bridge) — card snapshot for the system prompt
 *      (+ humanProfileJobLines — character-sheet job in systemPrompt)
 *  8.  Heuristic + LLM suggest* helpers (subtasks, labels, goals, metrics…)
 *  9.  memoryTurn — board long-term / short-term memory chat
 * 10.  Card first-open interview (Akinator / Q20) + cardInterviewTurn
 * 11.  Per-card / board chat history (budget-capped pluginData)
 * 12.  Suggestions enrichment (heat, icons, impact-reach, subtask pick)
 * 13.  parseAssistantPayload + chatCompletions (streaming-capable)
 * 14.  chatTurn — main conversational loop
 * 15.  Status brief / progress summary / cardDreamTurn (post-chat consolidate)
 * 16.  executeAction / executeActions — apply model tools to the board
 *      (+ rich actionFailure / formatActionErrors for user-facing errors)
 * 17.  PriorityAgent public API
 */

/**
 * Priority Power-Up AI agent: base
 *
 * Part of the agent (see agent.parts.json). Debug helpers, storage keys, assistant scopes, model tiers and presets, and the normalizers every later part uses.
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from other parts (functions, resolved at call time)
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }

function dbg() {
    return global.TpDebug || null;
  }
  function dbgLog(domain, event, meta) {
    var d = dbg();
    if (d && d.log) d.log(domain, event, meta);
  }
  function dbgError(domain, event, err, meta) {
    var d = dbg();
    if (d && d.error) d.error(domain, event, err, meta);
    else if (err) console.error(domain + '.' + event, err);
  }
  function dbgFetchMeta(label, metaOrErr, extra) {
    var meta = { attempt: label };
    if (metaOrErr && metaOrErr.meta) {
      if (metaOrErr.meta.status != null) meta.status = metaOrErr.meta.status;
      meta.ok = metaOrErr.meta.ok !== false;
      if (metaOrErr.meta.model) meta.model = metaOrErr.meta.model;
      if (metaOrErr.meta.stream != null) meta.stream = !!metaOrErr.meta.stream;
    } else if (metaOrErr && metaOrErr.debugMeta) {
      if (metaOrErr.debugMeta.status != null) meta.status = metaOrErr.debugMeta.status;
      meta.ok = false;
      var reason = String((metaOrErr.message || metaOrErr.debugMeta.error || '')).trim();
      if (reason) meta.reason = reason.slice(0, 80);
    } else if (metaOrErr) {
      meta.ok = false;
      meta.reason = String((metaOrErr && metaOrErr.message) || metaOrErr || 'error').slice(0, 80);
    }
    if (extra) {
      if (extra.latencyMs != null) meta.latencyMs = extra.latencyMs;
      if (extra.fallback) meta.fallback = extra.fallback;
    }
    return meta;
  }

  var PROVIDER_STORAGE_KEY = 'agentProvider';
  var CARD_INTERVIEW_KEY = 'cardAgentInterview';
  var CARD_CHAT_KEY = 'cardAgentChat';
  var BOARD_CHAT_KEY = 'boardAgentChat';
  var MAX_INTERVIEW_ASKED = 24;
  var MAX_CHAT_MESSAGES = 16;
  var MAX_CHAT_CONTENT = 400;
  // Trello plugin data limit is 4096 chars per scope/visibility (ALL keys combined).
  // card/private is shared with cardEditHistory — keep chat well under the rest.
  var MAX_CHAT_SERIALIZED = 2200;
  var MAX_CHAT_SERIALIZED_HARD = 1600;

  /** Where the assistant UI is hosted — shapes prompts, tools, and chat storage. */
  var ASSISTANT_SCOPES = {
    TASK: 'task',
    PROJECT: 'project'
  };

  function normalizeAssistantScope(raw) {
    var s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (s === 'project' || s === 'board' || s === 'projet' || s === 'tableau') {
      return ASSISTANT_SCOPES.PROJECT;
    }
    return ASSISTANT_SCOPES.TASK;
  }

  function isProjectScope(scope) {
    return normalizeAssistantScope(scope) === ASSISTANT_SCOPES.PROJECT;
  }

  /** Tools allowed when chatting from the project-wide window. */
  var PROJECT_SCOPE_TOOLS = {
    set_agent_name: true,
    set_agent_color: true,
    set_agent_personality: true,
    upsert_person: true,
    remove_person: true,
    upsert_place: true,
    remove_place: true,
    trigger_effect: true,
    show_guide: true,
    schedule_check: true
  };
  var DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';
  var DEFAULT_OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

  var PRESETS = {
    openai: {
      id: 'openai',
      label: 'OpenAI',
      baseUrl: DEFAULT_OPENAI_BASE,
      model: 'gpt-5.4-mini'
    },
    openrouter: {
      id: 'openrouter',
      label: 'OpenRouter',
      baseUrl: DEFAULT_OPENROUTER_BASE,
      model: 'openai/gpt-5.4-mini'
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

  /**
   * Chat model tiers the assistant may request via JSON `modelTier`.
   * Warm-up (first CHAT_WARMUP_USER_TURNS user messages) floors at balanced.
   */
  var MODEL_TIERS = {
    efficient: 'efficient',
    balanced: 'balanced',
    capable: 'capable'
  };
  /** User-facing chat mode: auto (AI + warm-up) or a locked tier. */
  var MODEL_MODES = {
    auto: 'auto',
    efficient: 'efficient',
    balanced: 'balanced',
    capable: 'capable'
  };
  var CHAT_WARMUP_USER_TURNS = 4;
  var FAMILY_TIER_MODELS = {
    'gpt-5.4': {
      efficient: 'gpt-5.4-nano',
      balanced: 'gpt-5.4-mini',
      capable: 'gpt-5.4'
    },
    'gpt-5.2': {
      efficient: 'gpt-5-nano',
      balanced: 'gpt-5-mini',
      capable: 'gpt-5.2'
    },
    'gpt-5.1': {
      efficient: 'gpt-5-nano',
      balanced: 'gpt-5-mini',
      capable: 'gpt-5.1'
    },
    'gpt-5': {
      efficient: 'gpt-5-nano',
      balanced: 'gpt-5-mini',
      capable: 'gpt-5'
    },
    'gpt-4.1': {
      efficient: 'gpt-4.1-nano',
      balanced: 'gpt-4.1-mini',
      capable: 'gpt-4.1'
    },
    'gpt-4o': {
      efficient: 'gpt-4o-mini',
      balanced: 'gpt-4o',
      capable: 'gpt-4o'
    },
    o4: {
      efficient: 'o4-mini',
      balanced: 'o4-mini',
      capable: 'o4-mini'
    },
    o3: {
      efficient: 'o3-mini',
      balanced: 'o3-mini',
      capable: 'o3-mini'
    }
  };
  var DEFAULT_TIER_MODELS = {
    efficient: 'gpt-5.4-nano',
    balanced: 'gpt-5.4-mini',
    capable: 'gpt-5.4'
  };

  // ── 2. Model tiers / modes / curated OpenAI list ─────────────────────────

  function stripModelPrefix(modelId) {
    var id = String(modelId || '').trim();
    var slash = id.lastIndexOf('/');
    if (slash >= 0) return id.slice(slash + 1);
    return id;
  }

  function withModelPrefix(bareId, likeModel) {
    var like = String(likeModel || '').trim();
    var slash = like.lastIndexOf('/');
    if (slash >= 0) return like.slice(0, slash + 1) + bareId;
    return bareId;
  }

  function normalizeModelTier(raw) {
    var t = String(raw || '')
      .trim()
      .toLowerCase();
    if (!t) return null;
    if (t === MODEL_TIERS.efficient || t === MODEL_TIERS.balanced || t === MODEL_TIERS.capable) {
      return t;
    }
    if (t === 'cheap' || t === 'nano' || t === 'fast' || t === 'low') return MODEL_TIERS.efficient;
    if (t === 'standard' || t === 'mini' || t === 'default' || t === 'ok') {
      return MODEL_TIERS.balanced;
    }
    if (t === 'smart' || t === 'full' || t === 'strong' || t === 'high') {
      return MODEL_TIERS.capable;
    }
    return null;
  }

  function normalizeModelMode(raw) {
    var t = String(raw || '')
      .trim()
      .toLowerCase();
    if (!t || t === 'auto' || t === 'automatic' || t === 'automatique') {
      return MODEL_MODES.auto;
    }
    var tier = normalizeModelTier(t);
    if (tier) return tier;
    return MODEL_MODES.auto;
  }

  function detectModelFamily(modelId) {
    var id = stripModelPrefix(modelId).toLowerCase();
    if (!id) return null;
    if (/^gpt-5\.4/.test(id)) return 'gpt-5.4';
    if (/^gpt-5\.2/.test(id)) return 'gpt-5.2';
    if (/^gpt-5\.1/.test(id)) return 'gpt-5.1';
    if (/^gpt-5/.test(id)) return 'gpt-5';
    if (/^gpt-4\.1/.test(id)) return 'gpt-4.1';
    if (/^gpt-4o/.test(id)) return 'gpt-4o';
    if (/^o4/.test(id)) return 'o4';
    if (/^o3/.test(id)) return 'o3';
    return null;
  }

  /**
   * @returns {'efficient'|'balanced'|'capable'|'unknown'}
   */
  function classifyModelClass(modelId) {
    var id = stripModelPrefix(modelId).toLowerCase();
    if (!id) return 'unknown';
    if (id.indexOf('nano') >= 0) return MODEL_TIERS.efficient;
    if (id.indexOf('mini') >= 0 || /^o[0-9]/.test(id)) return MODEL_TIERS.balanced;
    if (/^gpt-5/.test(id) || /^gpt-4/.test(id)) return MODEL_TIERS.capable;
    return 'unknown';
  }

  function isKnownOpenAiStyleModel(modelId) {
    var id = stripModelPrefix(modelId).toLowerCase();
    if (!id) return false;
    if (detectModelFamily(id)) return true;
    for (var i = 0; i < OPENAI_MODELS.length; i++) {
      if (String(OPENAI_MODELS[i].id).toLowerCase() === id) return true;
    }
    return /^gpt-/.test(id) || /^o[0-9]/.test(id);
  }

  function modelForTier(provider, tier) {
    var p = normalizeProvider(provider);
    var t = normalizeModelTier(tier);
    if (!t) return p.model;
    if (!isKnownOpenAiStyleModel(p.model) && classifyModelClass(p.model) === 'unknown') {
      return p.model;
    }
    var family = detectModelFamily(p.model);
    var bare =
      (family && FAMILY_TIER_MODELS[family] && FAMILY_TIER_MODELS[family][t]) ||
      DEFAULT_TIER_MODELS[t] ||
      p.model;
    return withModelPrefix(bare, p.model);
  }

  function countUserTurns(history) {
    var n = 0;
    (history || []).forEach(function (entry) {
      if (entry && entry.role === 'user') n += 1;
    });
    return n;
  }

  /**
   * Resolve the API model for a chat turn.
   * Locked modelMode (efficient|balanced|capable): always that tier (ignores sticky / warm-up).
   * Auto mode: warm-up floors nano→balanced for the first CHAT_WARMUP_USER_TURNS user messages;
   * after warm-up, sticky session tier if set, else the saved provider model.
   * Never downgrades a saved capable/balanced model during warm-up.
   *
   * @param {object} provider
   * @param {Array} history prior turns (current user message not yet included)
   * @param {string|null} [sessionTier] sticky tier from a previous assistant reply
   */
  function resolveChatModel(provider, history, sessionTier) {
    var p = normalizeProvider(provider);
    var saved = p.model;
    var mode = normalizeModelMode(p.modelMode);
    if (mode !== MODEL_MODES.auto) {
      return modelForTier(p, mode);
    }
    var priorUserTurns = countUserTurns(history);
    var userTurnNumber = priorUserTurns + 1;
    if (userTurnNumber <= CHAT_WARMUP_USER_TURNS) {
      if (classifyModelClass(saved) === MODEL_TIERS.efficient) {
        return modelForTier(p, MODEL_TIERS.balanced);
      }
      return saved;
    }
    var tier = normalizeModelTier(sessionTier);
    if (tier) return modelForTier(p, tier);
    return saved;
  }

  var TOOL_LABELS = {
    set_priority: 'Priorit\u00e9 mise \u00e0 jour.',
    set_due: '\u00c9ch\u00e9ance mise \u00e0 jour.',
    set_blocked: 'Blocage mis \u00e0 jour.',
    set_progress: 'Progr\u00e8s mis \u00e0 jour.',
    set_task_types: 'Type de t\u00e2che mis \u00e0 jour.',
    set_formula: 'Formule mise \u00e0 jour.',
    set_statut: 'Statut mis \u00e0 jour.',
    set_project: 'Projet li\u00e9.',
    set_members: 'Assign\u00e9s mis \u00e0 jour.',
    set_labels: '\u00c9tiquettes mises \u00e0 jour.',
    set_custom_assignees: 'Personnes assign\u00e9es mises \u00e0 jour.',
    set_member_roles: 'R\u00f4les des assign\u00e9s mis \u00e0 jour.',
    add_checklist_item: 'Sous-sous-t\u00e2che ajout\u00e9e.',
    remove_checklist_item: 'Sous-sous-t\u00e2che supprim\u00e9e.',
    rename_checklist_item: 'Sous-sous-t\u00e2che renomm\u00e9e.',
    set_checklist_progress: 'Progr\u00e8s de sous-sous-t\u00e2che mis \u00e0 jour.',
    history_undo: 'Modification annul\u00e9e.',
    history_redo: 'Modification r\u00e9tablie.',
    history_revert: 'Historique restaur\u00e9.',
    rename_card: 'Carte renomm\u00e9e.',
    set_description: 'Description mise \u00e0 jour.',
    add_subtask: 'Sous-t\u00e2che ajout\u00e9e.',
    rename_subtask: 'Sous-t\u00e2che renomm\u00e9e.',
    remove_subtask: 'Sous-t\u00e2che supprim\u00e9e.',
    toggle_subtask: 'Sous-t\u00e2che mise \u00e0 jour.',
    set_subtask_blocked: 'Sous-t\u00e2che bloqu\u00e9e mise \u00e0 jour.',
    set_subtask_progress: 'Progr\u00e8s de sous-t\u00e2che mis \u00e0 jour.',
    set_subtask_estimate: 'Dur\u00e9e de sous-t\u00e2che mise \u00e0 jour.',
    set_progress_estimate: 'Dur\u00e9e estim\u00e9e mise \u00e0 jour.',
    complete_all_subtasks: 'Toutes les sous-t\u00e2ches termin\u00e9es.',
    reset_progress: 'Progr\u00e8s r\u00e9initialis\u00e9.',
    trigger_effect: 'Effet lanc\u00e9.',
    point_at: 'Section montr\u00e9e.',
    set_agent_name: 'Nom de l\'assistant mis \u00e0 jour.',
    set_agent_color: 'Couleur de l\'assistant mise \u00e0 jour.',
    set_agent_personality: 'Personnalit\u00e9 de l\'assistant mise \u00e0 jour.',
    upsert_person: 'Personne mise \u00e0 jour.',
    remove_person: 'Personne retir\u00e9e.',
    set_places: 'Lieux mis \u00e0 jour.',
    upsert_place: 'Lieu mis \u00e0 jour.',
    remove_place: 'Lieu retir\u00e9.',
    show_guide: 'Module ouvert.',
    schedule_check: 'Rappel planifi\u00e9.'
  };

  var TASK_TYPE_IDS = [
    'action',
    'project',
    'recurring',
    'exploratory',
    'emotional',
    'communication',
    'deliverable',
    'process',
    'thinking',
    'material',
    'learning',
    'admin',
    'creative',
    'finance'
  ];

  function agentTaskTypeCatalog() {
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.getTaskTypeCatalog === 'function'
    ) {
      return PriorityUI.getTaskTypeCatalog();
    }
    return global.PriorityAgentParts.TASK_TYPE_CATALOG; // set by agent-suggest.js
  }

  function normalizeAgentTaskTypes(raw) {
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.normalizeTaskTypes === 'function'
    ) {
      return PriorityUI.normalizeTaskTypes(raw);
    }
    var list = Array.isArray(raw)
      ? raw
      : typeof raw === 'string' && raw.trim()
        ? [raw]
        : [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var id = typeof list[i] === 'string' ? list[i].trim() : '';
      if (!id || seen[id]) continue;
      var known =
        TASK_TYPE_IDS.indexOf(id) >= 0 ||
        /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
      if (!known) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function taskTypesEqual(a, b) {
    var left = normalizeAgentTaskTypes(a);
    var right = normalizeAgentTaskTypes(b);
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  /**
   * Urgency pivot wording adapted to task types (never assume a deliverable).
   */
  function urgencyAskForTaskTypes(types) {
    var list = normalizeAgentTaskTypes(types);
    var has = function (id) {
      return list.indexOf(id) >= 0;
    };
    if (has('deliverable') && !has('emotional') && !has('communication')) {
      return 'Si on ne le [[a:livre]] pas, c\'est grave?';
    }
    if (has('communication') && !has('deliverable')) {
      return 'Si on n\'en [[a:parle]] pas, c\'est grave?';
    }
    if (has('exploratory') && !has('deliverable')) {
      return 'Si on n\'[[a:explore]] pas, c\'est grave?';
    }
    if (has('thinking') && !has('deliverable')) {
      return 'Si on ne [[a:d\u00e9cide]] pas, c\'est grave?';
    }
    if (has('emotional') && !has('deliverable')) {
      return 'Si on ne s\'en [[a:occupe]] pas, c\'est grave?';
    }
    return 'Si on ne le [[a:fait]] pas, c\'est grave?';
  }

  var POINT_SECTIONS = [
    'priority',
    'due',
    'blocked',
    'progress',
    'statut',
    'objectif',
    'info'
  ];

  var POINT_FIELDS = ['empressement', 'impact', 'ease'];

  var AGENT_COLOR_KEYS = [
    'orange',
    'yellow',
    'green',
    'purple',
    'blue',
    'pink',
    'red',
    'teal',
    'coral',
    'sky'
  ];

  function normalizeAgentColorArg(raw) {
    if (
      global.UserProfile &&
      typeof global.UserProfile.normalizeAgentColor === 'function'
    ) {
      var fromProfile = global.UserProfile.normalizeAgentColor(raw);
      if (fromProfile) return fromProfile;
    }
    var c = String(raw || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (AGENT_COLOR_KEYS.indexOf(c) !== -1) return c;
    if (c === 'jaune' || c === 'gold' || c === 'amber' || c === 'dore') return 'yellow';
    if (c === 'peach' || c === 'warm') return 'orange';
    if (c === 'vert' || c === 'lime') return 'green';
    if (c === 'mint') return 'teal';
    if (c === 'violet' || c === 'lavender') return 'purple';
    if (c === 'bleu') return 'blue';
    if (c === 'rose') return 'pink';
    if (c === 'rouge') return 'red';
    if (c === 'turquoise' || c === 'cyan') return 'teal';
    if (c === 'corail') return 'coral';
    if (c === 'ciel') return 'sky';
    var hex = String(raw || '')
      .trim()
      .toLowerCase();
    if (hex.charAt(0) !== '#' && /^[0-9a-f]{3}([0-9a-f]{3})?$/.test(hex)) {
      hex = '#' + hex;
    }
    if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
    if (/^#[0-9a-f]{3}$/.test(hex)) {
      return (
        '#' +
        hex.charAt(1) +
        hex.charAt(1) +
        hex.charAt(2) +
        hex.charAt(2) +
        hex.charAt(3) +
        hex.charAt(3)
      );
    }
    return '';
  }

  function normalizePointSection(raw) {
    var s = String(raw || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
    if (!s) return null;
    if (
      s === 'priority' ||
      s === 'priorite' ||
      s === 'prio' ||
      s === 'heat' ||
      s === 'score'
    ) {
      return 'priority';
    }
    if (
      s === 'due' ||
      s === 'duedate' ||
      s === 'echeance' ||
      s === 'deadline' ||
      s === 'date'
    ) {
      return 'due';
    }
    if (
      s === 'blocked' ||
      s === 'bloque' ||
      s === 'blocage' ||
      s === 'waiting' ||
      s === 'enattente'
    ) {
      return 'blocked';
    }
    if (
      s === 'progress' ||
      s === 'progres' ||
      s === 'completion' ||
      s === 'subtasks' ||
      s === 'soustaches'
    ) {
      return 'progress';
    }
    if (s === 'statut' || s === 'status' || s === 'liste' || s === 'list') {
      return 'statut';
    }
    if (
      s === 'objectif' ||
      s === 'objectifs' ||
      s === 'goals' ||
      s === 'goal' ||
      s === 'projet' ||
      s === 'project'
    ) {
      return 'objectif';
    }
    if (s === 'info' || s === 'information' || s === 'recap') {
      return 'info';
    }
    return POINT_SECTIONS.indexOf(s) !== -1 ? s : null;
  }

  function normalizePointField(raw) {
    var s = String(raw || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
    if (!s) return null;
    if (
      s === 'impact' ||
      s === 'portee' ||
      s === 'reach' ||
      s === 'audience' ||
      s === 'population' ||
      s === 'scope'
    ) {
      return 'impact';
    }
    if (s === 'urgency' || s === 'urgence' || s === 'urgent') {
      return 'urgency';
    }
    if (
      s === 'empressement' ||
      s === 'promptitude' ||
      s === 'hurry' ||
      s === 'promptness'
    ) {
      return 'empressement';
    }
    if (
      s === 'ease' ||
      s === 'facilite' ||
      s === 'difficulte' ||
      s === 'difficulty' ||
      s === 'effort'
    ) {
      return 'ease';
    }
    return POINT_FIELDS.indexOf(s) !== -1 ? s : null;
  }

  function normalizePointLevel(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'string') {
      var t = raw
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (t === 'personnel' || t === 'personal') return 0;
      if (t === 'equipe' || t === 'team') return 1;
      if (t === 'interne' || t === 'internal') return 2;
      if (t === 'population' || t === 'people' || t === 'public') return 3;
      if (t === 'global' || t === 'monde' || t === 'world') return 4;
    }
    var n = typeof raw === 'number' ? raw : parseInt(raw, 10);
    if (!isFinite(n)) return null;
    return Math.max(0, Math.min(4, Math.round(n)));
  }

  var EFFECT_IDS =
    typeof global.CelebrationEffects !== 'undefined' &&
    typeof global.CelebrationEffects.list === 'function'
      ? global.CelebrationEffects.list()
      : [
          'fireworks',
          'confetti',
          'hearts',
          'sparkles',
          'shooting_stars',
          'bubbles',
          'aurora',
          'balloons',
          'petals',
          'flowers',
          'rainbow',
          'disco',
          'beep',
          'boop',
          'zap',
          'thunder',
          'fanfare',
          'bonk',
          'laser',
          'coin',
          'drumroll',
          'banner',
          'fleur_de_lys'
        ];

  function normalizeEffectId(raw) {
    if (
      typeof global.CelebrationEffects !== 'undefined' &&
      typeof global.CelebrationEffects.normalize === 'function'
    ) {
      return global.CelebrationEffects.normalize(raw);
    }
    if (raw == null) return null;
    var key = String(raw)
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    return EFFECT_IDS.indexOf(key) !== -1 ? key : null;
  }

  /** Punchline fullscreen text: map common EN\leftrightarrow FR tokens to match profile language. */
  var EFFECT_TEXT_TO_FR = {
    two: 'DEUX',
    yes: 'OUI',
    no: 'NON',
    done: 'FAIT',
    wow: 'OUAH',
    hi: 'SALUT',
    hello: 'BONJOUR',
    thanks: 'MERCI',
    love: 'AMOUR',
    error: 'ERREUR',
    win: 'GAGN\u00c9',
    fail: 'RAT\u00c9',
    wait: 'ATTENDS',
    great: 'SUPER',
    nice: 'NICKEL',
    oops: 'OUPS'
  };
  var EFFECT_TEXT_TO_EN = {
    deux: 'TWO',
    oui: 'YES',
    non: 'NO',
    fait: 'DONE',
    ouah: 'WOW',
    salut: 'HI',
    bonjour: 'HELLO',
    merci: 'THANKS',
    amour: 'LOVE',
    erreur: 'ERROR',
    'gagn\u00e9': 'WIN',
    'rat\u00e9': 'FAIL',
    attends: 'WAIT',
    super: 'GREAT',
    nickel: 'NICE',
    oups: 'OOPS'
  };

  function resolveEffectLanguage(bridge) {
    try {
      if (bridge && typeof bridge.getProfile === 'function') {
        var p = bridge.getProfile();
        if (p && typeof p.language === 'string' && p.language.trim().toLowerCase() === 'en') {
          return 'en';
        }
      }
    } catch (e) {
      /* ignore */
    }
    return 'fr';
  }

  function localizeEffectText(raw, lang) {
    if (typeof raw !== 'string') return '';
    var text = raw.trim().slice(0, 48);
    if (!text) return '';
    var key = text.toLocaleLowerCase('fr-FR');
    var map = lang === 'en' ? EFFECT_TEXT_TO_EN : EFFECT_TEXT_TO_FR;
    if (map[key]) return map[key];
    return text;
  }

  function effectLabel(id) {
    if (
      typeof global.CelebrationEffects !== 'undefined' &&
      typeof global.CelebrationEffects.label === 'function'
    ) {
      return global.CelebrationEffects.label(id);
    }
    return id;
  }

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

  /** Resolve role aliases (ma boss → Jane Doe) using the People directory. */
  function resolvePeopleInReason(reason, people) {
    var normalized = normalizeAgentBlockedReason(reason);
    if (!normalized) return '';
    if (
      global.People &&
      typeof global.People.resolveInText === 'function' &&
      people &&
      (Array.isArray(people) ? people.length : people.people && people.people.length)
    ) {
      try {
        normalized = global.People.resolveInText(normalized, people) || normalized;
      } catch (e) { /* keep */ }
    }
    return normalized;
  }

  function resolveAliasesInText(text, people, places) {
    var out = typeof text === 'string' ? text : '';
    if (!out) return '';
    if (
      global.People &&
      typeof global.People.resolveInText === 'function' &&
      people &&
      (Array.isArray(people) ? people.length : 0)
    ) {
      try {
        out = global.People.resolveInText(out, people) || out;
      } catch (e) { /* keep */ }
    }
    out = resolvePlacesInText(out, places);
    return out;
  }

  function getPeopleFromBridge(bridge) {
    if (!bridge || typeof bridge.getPeople !== 'function') return [];
    try {
      var raw = bridge.getPeople();
      if (global.People && typeof global.People.normalizeDirectory === 'function') {
        return global.People.normalizeDirectory(raw).people;
      }
      if (Array.isArray(raw)) return raw;
      if (raw && Array.isArray(raw.people)) return raw.people;
    } catch (e) { /* ignore */ }
    return [];
  }

  function getPlacesFromBridge(bridge) {
    if (!bridge || typeof bridge.getPlaces !== 'function') return [];
    try {
      var raw = bridge.getPlaces();
      if (global.Places && typeof global.Places.normalizeDirectory === 'function') {
        return global.Places.normalizeDirectory(raw).places;
      }
      if (Array.isArray(raw)) return raw;
      if (raw && Array.isArray(raw.places)) return raw.places;
    } catch (e) { /* ignore */ }
    return [];
  }

  /** Resolve place aliases (chez moi → Maison) after People resolution. */
  function resolvePlacesInText(text, places) {
    if (typeof text !== 'string' || !text) return text || '';
    if (
      global.Places &&
      typeof global.Places.resolveInText === 'function' &&
      places &&
      (Array.isArray(places) ? places.length : places.places && places.places.length)
    ) {
      try {
        return global.Places.resolveInText(text, places) || text;
      } catch (e) {
        return text;
      }
    }
    return text;
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
    if (actions[0].tool === 'set_agent_name') return 'Changer mon nom';
    if (actions[0].tool === 'set_agent_color') return 'Changer ma couleur';
    if (actions[0].tool === 'set_agent_personality') {
      return 'Changer ma personnalit\u00e9';
    }
    if (actions[0].tool === 'trigger_effect') {
      var fx =
        actions[0].args &&
        (actions[0].args.effect || actions[0].args.name || actions[0].args.id);
      var fxId = normalizeEffectId(fx);
      return fxId ? 'Effet\u00a0: ' + effectLabel(fxId) : 'Lancer un effet';
    }
    if (actions[0].tool === 'point_at') {
      var pointArgs = actions[0].args || {};
      var pointSection = normalizePointSection(
        pointArgs.section || pointArgs.target || pointArgs.area
      );
      var pointField = normalizePointField(pointArgs.field || pointArgs.axis);
      if (pointField === 'impact') return 'Montrer la port\u00e9e (Impact)';
      if (pointField === 'urgency') return 'Montrer l\'urgence';
      if (pointField === 'ease') return 'Montrer la facilit\u00e9';
      if (pointSection === 'priority') return 'Montrer la priorit\u00e9';
      if (pointSection === 'due') return 'Montrer l\'\u00e9ch\u00e9ance';
      if (pointSection === 'blocked') return 'Montrer le blocage';
      if (pointSection === 'progress') return 'Montrer le progr\u00e8s';
      return 'Montrer sur la page';
    }
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
   * Example: "Non, on la voit plutôt facile à faire."
   */
  function buildEaseExplanation(state) {
    if (!state || state.priorityEnabled === false) {
      return 'Y a pas encore de Facilit\u00e9 sur cette carte\u00a0: la priorit\u00e9 n\'est pas activ\u00e9e.';
    }
    var E = clampInt(state.ease, 1, 5, 3);
    if (E >= 5) return 'Non, on la voit [[g:super facile]] \u00e0 faire.';
    if (E >= 4) return 'Non, on la voit plut\u00f4t [[g:facile]] \u00e0 faire.';
    if (E <= 1) return 'Oui, on la voit [[r:tr\u00e8s difficile]].';
    if (E === 2) return 'Oui, on la voit plut\u00f4t [[r:difficile]].';
    return 'Ni super dur ni trivial\u00a0: plut\u00f4t [[y:moyen]].';
  }

  /** Conversational "for the team / for interne…" from impact reach (0–4). */
  function impactAudiencePhrase(impactLevel) {
    var reach = axisWord('impact', impactLevel) || '';
    var r = reach.toLowerCase();
    if (r.indexOf('personnel') !== -1) return 'surtout pour toi / une personne';
    if (r.indexOf('quipe') !== -1) return 'pour l\'\u00e9quipe';
    if (r.indexOf('interne') !== -1) return 'pour l\'interne';
    if (r.indexOf('population') !== -1) return 'pour beaucoup de gens';
    if (r.indexOf('global') !== -1) return 'pour tout le monde';
    if (impactLevel >= 3) return 'pour l\'\u00e9quipe';
    if (impactLevel <= 0) return 'surtout au niveau perso';
    return 'sur le p\u00e9rim\u00e8tre';
  }

  /**
   * Natural-language priority blurb for the agent (adapts to axis levels).
   * Example: "Cette tâche est urgente et importante pour l'équipe, donc on lui donne la priorité maximale."
   */
  function buildPriorityExplanation(state, display) {
    if (!state || state.priorityEnabled === false) {
      return 'Y a pas encore de priorit\u00e9 sur cette t\u00e2che.';
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
    var tierLower = tier.toLowerCase();
    var audience = impactAudiencePhrase(I);

    var urgencyBit = '';
    if (U >= 4) urgencyBit = '[[r:vraiment urgente]]';
    else if (U >= 3) urgencyBit = '[[r:urgente]]';
    else if (U === 2) urgencyBit = '[[y:assez urgente]]';
    else if (U === 1) urgencyBit = '[[g:peu urgente]]';
    else urgencyBit = '[[g:pas urgente]]';

    var impactBit = '';
    if (I >= 3) impactBit = 'importante ' + audience;
    else if (I === 2) impactBit = 'utile ' + audience;
    else if (I === 1) impactBit = 'd\'impact [[y:assez limit\u00e9]] (' + audience + ')';
    else impactBit = 'surtout [[g:perso]]';

    var easeBit = '';
    if (E >= 5) easeBit = 'plut\u00f4t [[g:simple]] \u00e0 faire';
    else if (E >= 4) easeBit = '[[g:assez facile]]';
    else if (E <= 1) easeBit = 'plut\u00f4t [[r:costaud]] \u00e0 faire';
    else if (E === 2) easeBit = '[[r:pas si simple]]';

    var conclusion = '';
    if (tierLower.indexOf('critique') !== -1) {
      conclusion = 'on lui donne la priorit\u00e9 [[r:maximale]]';
    } else if (tierLower.indexOf('urgent') !== -1) {
      conclusion = 'on la traite en [[r:Urgente]]';
    } else if (tierLower.indexOf('prioritaire') !== -1) {
      conclusion = 'on la met en [[y:Prioritaire]]';
    } else if (tierLower.indexOf('importante') !== -1) {
      conclusion = 'on la classe [[y:Importante]]';
    } else if (tierLower.indexOf('flexible') !== -1) {
      conclusion = 'on peut la garder [[g:Flexible]]';
    } else if (tierLower.indexOf('secondaire') !== -1) {
      conclusion = 'elle reste [[g:Secondaire]]';
    } else if (tierLower.indexOf('optionnelle') !== -1) {
      conclusion = 'c\'est plut\u00f4t [[g:Optionnelle]]';
    } else {
      conclusion = 'on la met en ' + tier;
    }

    // Prefer urgency + impact (the user’s style). Add ease only when mid-tier needs colour.
    var parts = [];
    var strongU = U >= 3;
    var strongI = I >= 2;
    if (strongU) parts.push(urgencyBit);
    if (strongI) parts.push(impactBit);
    if (!parts.length) {
      parts.push(urgencyBit);
      parts.push(impactBit);
    } else if (parts.length === 1 && easeBit && (E <= 2 || E >= 4)) {
      parts.push(easeBit);
    } else if (parts.length === 1) {
      parts.push(strongU ? impactBit : urgencyBit);
    }

    if (parts.length === 1) {
      return 'Cette t\u00e2che est ' + parts[0] + ', donc ' + conclusion + '.';
    }
    return (
      'Cette t\u00e2che est ' + parts[0] + ' et ' + parts[1] + ', donc ' + conclusion + '.'
    );
  }

  // Action registry: each agent tool registers one handler (see agent-actions-*.js);
  // executeAction in agent-actions.js dispatches on it.
  var ACTION_HANDLERS = {};
  function registerAction(tools, handler) {
    for (var i = 0; i < tools.length; i++) ACTION_HANDLERS[tools[i]] = handler;
  }

  // exports
  S.ACTION_HANDLERS = ACTION_HANDLERS;
  S.registerAction = registerAction;
  S.ACTION_VERB_REASON_RE = ACTION_VERB_REASON_RE;
  S.AGENT_COLOR_KEYS = AGENT_COLOR_KEYS;
  S.ASSISTANT_SCOPES = ASSISTANT_SCOPES;
  S.BLOCKED_REASON_ACTION_FIXES = BLOCKED_REASON_ACTION_FIXES;
  S.BOARD_CHAT_KEY = BOARD_CHAT_KEY;
  S.CARD_CHAT_KEY = CARD_CHAT_KEY;
  S.CARD_INTERVIEW_KEY = CARD_INTERVIEW_KEY;
  S.CHAT_WARMUP_USER_TURNS = CHAT_WARMUP_USER_TURNS;
  S.DEFAULT_OPENAI_BASE = DEFAULT_OPENAI_BASE;
  S.DEFAULT_OPENROUTER_BASE = DEFAULT_OPENROUTER_BASE;
  S.DEFAULT_TIER_MODELS = DEFAULT_TIER_MODELS;
  S.EFFECT_IDS = EFFECT_IDS;
  S.EFFECT_TEXT_TO_EN = EFFECT_TEXT_TO_EN;
  S.EFFECT_TEXT_TO_FR = EFFECT_TEXT_TO_FR;
  S.FAMILY_TIER_MODELS = FAMILY_TIER_MODELS;
  S.FORMULA_KEYS = FORMULA_KEYS;
  S.MAX_CHAT_CONTENT = MAX_CHAT_CONTENT;
  S.MAX_CHAT_MESSAGES = MAX_CHAT_MESSAGES;
  S.MAX_CHAT_SERIALIZED = MAX_CHAT_SERIALIZED;
  S.MAX_CHAT_SERIALIZED_HARD = MAX_CHAT_SERIALIZED_HARD;
  S.MAX_INTERVIEW_ASKED = MAX_INTERVIEW_ASKED;
  S.MODEL_MODES = MODEL_MODES;
  S.MODEL_TIERS = MODEL_TIERS;
  S.OPENAI_MODELS = OPENAI_MODELS;
  S.POINT_FIELDS = POINT_FIELDS;
  S.POINT_SECTIONS = POINT_SECTIONS;
  S.PRESETS = PRESETS;
  S.PROJECT_SCOPE_TOOLS = PROJECT_SCOPE_TOOLS;
  S.PROVIDER_STORAGE_KEY = PROVIDER_STORAGE_KEY;
  S.TASK_TYPE_IDS = TASK_TYPE_IDS;
  S.TOOL_LABELS = TOOL_LABELS;
  S.WAITING_OTHER_TASK_REASON = WAITING_OTHER_TASK_REASON;
  S.agentTaskTypeCatalog = agentTaskTypeCatalog;
  S.axisWord = axisWord;
  S.buildEaseExplanation = buildEaseExplanation;
  S.buildPriorityExplanation = buildPriorityExplanation;
  S.clampInt = clampInt;
  S.classifyModelClass = classifyModelClass;
  S.countUserTurns = countUserTurns;
  S.dbg = dbg;
  S.dbgError = dbgError;
  S.dbgFetchMeta = dbgFetchMeta;
  S.dbgLog = dbgLog;
  S.detectModelFamily = detectModelFamily;
  S.effectLabel = effectLabel;
  S.ensureFollowUpActionVerb = ensureFollowUpActionVerb;
  S.getPeopleFromBridge = getPeopleFromBridge;
  S.getPlacesFromBridge = getPlacesFromBridge;
  S.impactAudiencePhrase = impactAudiencePhrase;
  S.isKnownOpenAiStyleModel = isKnownOpenAiStyleModel;
  S.isProjectScope = isProjectScope;
  S.localizeEffectText = localizeEffectText;
  S.modelForTier = modelForTier;
  S.normalizeAgentBlockedReason = normalizeAgentBlockedReason;
  S.normalizeAgentColorArg = normalizeAgentColorArg;
  S.normalizeAgentTaskTypes = normalizeAgentTaskTypes;
  S.normalizeAssistantScope = normalizeAssistantScope;
  S.normalizeEffectId = normalizeEffectId;
  S.normalizeModelMode = normalizeModelMode;
  S.normalizeModelTier = normalizeModelTier;
  S.normalizePointField = normalizePointField;
  S.normalizePointLevel = normalizePointLevel;
  S.normalizePointSection = normalizePointSection;
  S.polishFollowUpActions = polishFollowUpActions;
  S.resolveAliasesInText = resolveAliasesInText;
  S.resolveChatModel = resolveChatModel;
  S.resolveEffectLanguage = resolveEffectLanguage;
  S.resolvePeopleInReason = resolvePeopleInReason;
  S.resolvePlacesInText = resolvePlacesInText;
  S.stripModelPrefix = stripModelPrefix;
  S.taskTypesEqual = taskTypesEqual;
  S.urgencyAskForTaskTypes = urgencyAskForTaskTypes;
  S.withModelPrefix = withModelPrefix;
})(typeof window !== 'undefined' ? window : this);
