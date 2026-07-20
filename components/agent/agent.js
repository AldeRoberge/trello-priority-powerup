/**
 * Priority Power-Up AI agent — OpenAI-compatible client, member-private
 * provider settings, JSON chat protocol with actionable follow-ups.
 * Exposes window.PriorityAgent (no bundler).
 */
(function (global) {
  'use strict';

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
    trigger_effect: true
  };
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
    set_agent_personality: 'Personnalit\u00e9 de l\'assistant mise \u00e0 jour.'
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
    return TASK_TYPE_CATALOG;
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

  var POINT_FIELDS = ['urgency', 'impact', 'ease'];

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
          'banner'
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
      /\b(\u00e9ch[eé]ance|deadline|date\s+limite)\b/i.test(t) && /\?/.test(t)
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

  function looksLikeCongratulation(message) {
    if (typeof message !== 'string' || !message) return false;
    return /\b(bravo|f[eé]licitations|chapeau|pli[eé]|bien jou[eé]|nice\b|woo+hoo|yay|congrats?|well\s+done)\b/i.test(
      message
    );
  }

  /**
   * Completed task + deadline ask is nonsense. When this turn hits 100%,
   * force a short congratulations; when already at 100%, strip due asks.
   */
  function polishMessageAfterProgressComplete(message, actions, context) {
    var completing = actionsReachFullProgress(actions);
    var alreadyDone = contextProgressComplete(context);
    if (!completing && !alreadyDone) return message;
    if (!looksLikeDueAskMessage(message)) {
      if (
        completing &&
        !looksLikeCongratulation(message) &&
        /^\s*(okay|ok|d['']accord|c['']est not[eé]|progr[eè]s mis)\b/i.test(
          String(message || '')
        )
      ) {
        return 'Bravo, c\'est pli\u00e9 !';
      }
      return message;
    }
    if (completing) return 'Bravo, c\'est pli\u00e9 !';
    return 'Pas besoin d\'\u00e9ch\u00e9ance : c\'est d\u00e9j\u00e0 termin\u00e9.';
  }

  function ensureProgressCelebration(actions) {
    if (!actionsReachFullProgress(actions)) return actions || [];
    var list = Array.isArray(actions) ? actions.slice() : [];
    var hasEffect = list.some(function (a) {
      return a && a.tool === 'trigger_effect';
    });
    if (!hasEffect) {
      list.push({ tool: 'trigger_effect', args: { effect: 'confetti' } });
    }
    return list;
  }

  function filterDueSuggestionsWhenComplete(suggestions, actions, context) {
    if (!actionsReachFullProgress(actions) && !contextProgressComplete(context)) {
      return suggestions;
    }
    var list = Array.isArray(suggestions) ? suggestions : [];
    return list.filter(function (s) {
      var text =
        typeof s === 'string'
          ? s
          : s && typeof s === 'object'
            ? String(s.text || s.label || '')
            : '';
      return !/\b(\u00e9ch[eé]ance|deadline|date\s+limite)\b/i.test(text);
    });
  }

  /**
   * Guard a turn after progress hits / is already 100%: congratulate,
   * never ask for a due date, drop due chips, fire confetti.
   */
  function applyProgressCompleteGuards(turn, context) {
    turn = turn && typeof turn === 'object' ? turn : {};
    var actions = ensureProgressCelebration(turn.actions || []);
    var message = polishMessageAfterProgressComplete(
      turn.message || '',
      actions,
      context
    );
    var suggestions = filterDueSuggestionsWhenComplete(
      turn.suggestions,
      actions,
      context
    );
    var emotion = turn.emotion || null;
    if (actionsReachFullProgress(actions) && looksLikeCongratulation(message)) {
      emotion = emotion || 'happy';
    }
    return {
      message: message,
      actions: actions,
      suggestions: suggestions,
      emotion: emotion
    };
  }

  /** Drop space / NBSP / thin-space before ? ! . … (no French « espace fine »). */
  function stripSpaceBeforePunctuation(text) {
    if (typeof text !== 'string' || !text) return text;
    return text.replace(/[\s\u00a0\u202f\u2007\u2009]+([?!.…])/g, '$1');
  }

  /** Replace unicode em dashes in visible copy (models love them; we don't). */
  function stripEmDashes(text) {
    if (typeof text !== 'string' || !text) return text;
    return text
      .replace(/\s*\u2014\s*/g, ' - ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /** Drop patronizing "(0 = …, 4 = …)" scale legends from assistant copy. */
  function stripScaleLegendParenthetical(message) {
    if (typeof message !== 'string' || !message) return message;
    return stripSpaceBeforePunctuation(
      message
        .replace(
          /\s*\(\s*[0-5]\s*=\s*[^)]{1,80},\s*[0-5]\s*=\s*[^)]{1,80}\)\s*(?=[?!.…]|$)/gi,
          ''
        )
        .replace(/\s{2,}/g, ' ')
        .trim()
    );
  }

  /** Final message polish — always strip space-before-? after other rewrites. */
  function polishAssistantVisibleText(message) {
    return normalizeHighlightMarkup(
      stripSpaceBeforePunctuation(
        stripEmDashes(
          ensureContrastHighlights(
            ensurePriorityHighlights(
              stripInterviewConclusionFraming(rewriteWinkEmoticons(message))
            )
          )
        )
      )
    );
  }

  /**
   * Replace text winkys (;) / ;-) and the wink emoji with a friendly smile.
   * Wink overuse reads as creepy / try-hard.
   */
  function rewriteWinkEmoticons(message) {
    if (typeof message !== 'string' || !message) return message;
    var smile = '\ud83d\ude0a';
    var out = message
      .replace(/;-?\)/g, smile)
      .replace(/\ud83d\ude09/g, smile);
    out = out.replace(new RegExp(smile + '\\s*' + smile, 'g'), smile);
    return out;
  }

  function escapeRegExp(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Repair common model typos in highlight markers (spaces, case, single ]).
   */
  function normalizeHighlightMarkup(message) {
    if (typeof message !== 'string' || !message) return message || '';
    return message
      .replace(
        /\[\[\s*([grya])\s*:\s*([^\]]{1,120}?)\s*\]\]/gi,
        function (_m, color, phrase) {
          return '[[' + String(color).toLowerCase() + ':' + phrase + ']]';
        }
      )
      .replace(
        /\[\[\s*([grya])\s*:\s*([^\]]{1,120}?)\s*\](?!\])/gi,
        function (_m, color, phrase) {
          return '[[' + String(color).toLowerCase() + ':' + phrase + ']]';
        }
      );
  }

  /** Pull [[g:/r:/y:/a:…]] spans from assistant copy (visible text only). */
  function extractHighlightSpans(message) {
    var out = [];
    if (typeof message !== 'string' || !message) return out;
    var re = /\[\[\s*(g|r|y|a)\s*:\s*([^\]]{1,80}?)\s*\]\]/gi;
    var m;
    while ((m = re.exec(message))) {
      var text = String(m[2] || '').trim();
      if (!text) continue;
      out.push({ color: m[1].toLowerCase(), text: text });
    }
    return out;
  }

  function contrastColorForPhrase(phrase) {
    var f = foldMatchText(phrase);
    if (!f) return null;
    if (
      /\b(pas encore|difficile|pas commenc|pas fait|non\b|plus tard|jamais|urgent|grave|chers?|trop)\b/.test(
        f
      )
    ) {
      return 'r';
    }
    if (
      /\b(deja|commence|termin|simple|facile|oui\b|yes\b|fait\b|presque|un peu|pas cher)\b/.test(
        f
      )
    ) {
      return 'g';
    }
    return null;
  }

  function wrapHighlightIfBare(message, phrase, color) {
    if (!phrase || !color || !message) return message;
    if (message.indexOf('[[' + color + ':' + phrase + ']]') >= 0) return message;
    // Already wrapped with any color?
    var wrapped = new RegExp(
      '\\[\\[(?:g|r|y|a):' + escapeRegExp(phrase) + '\\]\\]',
      'i'
    );
    if (wrapped.test(message)) return message;
    var re = new RegExp(
      '(^|[^\\w\\u00C0-\\u024F\\[\\]])(' +
        escapeRegExp(phrase) +
        ')(?![\\w\\u00C0-\\u024F]|:\\])',
      'i'
    );
    return message.replace(re, function (_full, lead, match) {
      return lead + '[[' + color + ':' + match + ']]';
    });
  }

  /**
   * Highlight A-vs-B alternatives in "… X ou Y ?" questions.
   * Positive / started / easy → green; not-yet / hard / stop → red.
   */
  function ensureContrastHighlights(message) {
    if (typeof message !== 'string' || !message) return message;
    var out = message;
    var qIdx = out.lastIndexOf('?');
    if (qIdx < 0) return out;

    var clauseStart = 0;
    for (var i = qIdx - 1; i >= 0; i--) {
      var ch = out.charAt(i);
      if (ch === '.' || ch === '!' || ch === '\n') {
        clauseStart = i + 1;
        break;
      }
    }
    var clause = out.slice(clauseStart, qIdx);
    if (/\[\[(?:g|r):/.test(clause) && /\[\[g:/.test(clause) && /\[\[r:/.test(clause)) {
      return out;
    }
    var bareClause = clause.replace(/\[\[(?:g|r|y|a):([^\]]+)\]\]/gi, '$1');
    var ou = bareClause.match(/^(.*?)\s+ou\s+(.*?)\s*$/i);
    if (!ou) return out;

    var before = String(ou[1] || '').trim();
    var after = String(ou[2] || '').trim();
    if (!before || !after) return out;

    var leftPhrase = null;
    var leftKnown = before.match(
      /\b(d[eé]j[aà]\s+(?:[eé]t[eé]\s+)?(?:commenc[eé]e?s?|termin[eé]e?s?|fait)|tr[eè]s\s+(?:facile|difficile)|assez\s+(?:facile|difficile|urgent)|plut[oô]t\s+(?:facile|difficile|simple)|pas\s+chers?|chers?|facile|simple|difficile|commenc[eé]e?s?)\s*$/i
    );
    if (leftKnown) leftPhrase = leftKnown[1];
    else {
      var words = before.split(/\s+/).filter(Boolean);
      var skipLead =
        /^(est-ce|que|est|c['']est|ca|ç[aà]|tu|as|a|le|la|les|un|une|des|du|de|sur|pour|et|si|on|l['']|d[''])$/i;
      while (words.length > 2 && skipLead.test(words[0])) words.shift();
      leftPhrase = words.slice(-Math.min(4, words.length)).join(' ');
    }

    var rightPhrase = after.replace(/^[«"'\s]+|[»"'\s]+$/g, '');
    var rightWords = rightPhrase.split(/\s+/).filter(Boolean);
    if (rightWords.length > 4) {
      rightPhrase = rightWords.slice(0, 4).join(' ');
    }
    if (!leftPhrase || leftPhrase.length < 2 || !rightPhrase || rightPhrase.length < 2) {
      return out;
    }

    var leftColor = contrastColorForPhrase(leftPhrase) || 'g';
    var rightColor = contrastColorForPhrase(rightPhrase) || 'r';
    // Same polarity (both green/red) → force green-then-red contrast.
    if (leftColor === rightColor) {
      leftColor = 'g';
      rightColor = 'r';
    }

    out = wrapHighlightIfBare(out, leftPhrase, leftColor);
    out = wrapHighlightIfBare(out, rightPhrase, rightColor);
    return out;
  }

  /**
   * Color suggestion chips from [[g:/r:/y:]] phrases in the message so
   * alternatives visually match the question.
   */
  function linkSuggestionColorsToHighlights(suggestions, message) {
    var list = Array.isArray(suggestions) ? suggestions : [];
    var spans = extractHighlightSpans(message).filter(function (s) {
      return s.color === 'g' || s.color === 'r' || s.color === 'y';
    });
    if (!list.length || !spans.length) return list;

    var hasGreen = spans.some(function (s) {
      return s.color === 'g';
    });
    var hasRed = spans.some(function (s) {
      return s.color === 'r';
    });

    return list.map(function (entry) {
      if (!entry || typeof entry !== 'object') return entry;
      // Keep impact-reach named accents (blue/teal circles).
      if (entry.color === 'blue' || entry.color === 'teal') return entry;
      var foldSug = foldMatchText(entry.text);
      if (!foldSug) return entry;
      var matched = null;
      for (var i = 0; i < spans.length; i++) {
        var span = spans[i];
        var foldSpan = foldMatchText(span.text);
        if (!foldSpan || foldSpan.length < 2) continue;
        if (
          foldSug.indexOf(foldSpan) >= 0 ||
          foldSpan.indexOf(foldSug) >= 0 ||
          overlapTokens(foldSug, foldSpan) >= 2
        ) {
          matched = span.color;
          break;
        }
      }
      if (!matched && hasGreen && hasRed) {
        if (
          /^(oui|yes|ok|deja|un peu|presque|commence|termin|fait|simple|facile)\b/.test(
            foldSug
          ) ||
          /\b(deja|commence|un peu|presque|termin)\b/.test(foldSug)
        ) {
          matched = 'g';
        } else if (
          /^(non|no|pas encore|pas du tout|jamais|difficile|plus tard)\b/.test(
            foldSug
          ) ||
          /\b(pas encore|pas commenc|difficile)\b/.test(foldSug)
        ) {
          matched = 'r';
        }
      }
      if (!matched) return entry;
      var next = {
        text: entry.text,
        heat: entry.heat,
        icon: entry.icon || null,
        color: entry.color || null
      };
      if (matched === 'g') {
        next.heat = 0;
        if (next.color === 'red' || next.color === 'orange' || next.color === 'yellow') {
          next.color = null;
        }
      } else if (matched === 'y') {
        next.heat = 2;
      } else if (matched === 'r') {
        next.heat = 4;
        if (next.color === 'green' || next.color === 'lime') {
          next.color = null;
        }
      }
      return next;
    });
  }

  function overlapTokens(a, b) {
    var ta = String(a || '')
      .split(/[^a-z0-9]+/)
      .filter(function (t) {
        return t.length >= 3;
      });
    var set = {};
    String(b || '')
      .split(/[^a-z0-9]+/)
      .forEach(function (t) {
        if (t.length >= 3) set[t] = true;
      });
    var n = 0;
    for (var i = 0; i < ta.length; i++) {
      if (set[ta[i]]) n += 1;
    }
    return n;
  }

  /**
   * If the model forgot [[g:/r:/y:]] markers on a priority-ish reply,
   * wrap common axis / tier labels so the UI can highlight them.
   */
  function ensurePriorityHighlights(message) {
    if (typeof message !== 'string' || !message) return message;
    if (/\[\[(?:g|r|y):/.test(message)) return message;
    if (
      !/(urgence|impact|facilit|priorit|facile|difficile|mod[eé]r[eé]e|critique|urgente|importante|flexible|secondaire|optionnelle|moyenne?|sur toi)/i.test(
        message
      )
    ) {
      return message;
    }

    // Longest phrases first so "Très difficile" wins over "Difficile".
    var phrases = [
      { t: 'Très difficile', c: 'r' },
      { t: 'Très facile', c: 'g' },
      { t: 'Super facile', c: 'g' },
      { t: 'Aucune pression', c: 'g' },
      { t: 'pas si simple', c: 'r' },
      { t: 'assez facile', c: 'g' },
      { t: 'assez urgente', c: 'y' },
      { t: 'vraiment urgente', c: 'r' },
      { t: 'peu urgente', c: 'g' },
      { t: 'pas urgente', c: 'g' },
      { t: 'Sur toi', c: 'g' },
      { t: 'Optionnelle', c: 'g' },
      { t: 'Secondaire', c: 'g' },
      { t: 'Prioritaire', c: 'y' },
      { t: 'Importante', c: 'y' },
      { t: 'Flexible', c: 'g' },
      { t: 'Critique', c: 'r' },
      { t: 'Urgente', c: 'r' },
      { t: 'Modérée', c: 'y' },
      { t: 'Élevée', c: 'r' },
      { t: 'Elevée', c: 'r' },
      { t: 'Difficile', c: 'r' },
      { t: 'Facile', c: 'g' },
      { t: 'Moyen', c: 'y' },
      { t: 'Moyenne', c: 'y' },
      { t: 'Faible', c: 'g' },
      { t: 'Aucune', c: 'g' },
      { t: 'Personnel', c: 'g' },
      { t: 'Équipe', c: 'y' },
      { t: 'Equipe', c: 'y' },
      { t: 'Interne', c: 'y' },
      { t: 'Population', c: 'g' },
      { t: 'Global', c: 'g' },
      { t: 'urgente', c: 'r' },
      { t: 'simple', c: 'g' }
    ];

    var out = message;
    var slots = [];
    phrases.forEach(function (p) {
      var re = new RegExp(
        '(^|[^\\w\\u00C0-\\u024F\\[\\]])(' + escapeRegExp(p.t) + ')(?![\\w\\u00C0-\\u024F]|:\\])',
        'gi'
      );
      out = out.replace(re, function (full, lead, match) {
        // Skip the axis header "Facilité" (contains "Facil…" but not exact "Facile" with our phrase list).
        if (/^facilit/i.test(match) && match.length > 6) return full;
        var i = slots.length;
        slots.push('[[' + p.c + ':' + match + ']]');
        return lead + '\u0000HL' + i + '\u0000';
      });
    });
    out = out.replace(/\u0000HL(\d+)\u0000/g, function (_m, i) {
      return slots[Number(i)];
    });
    return out;
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
        return (
          'Veux-tu que je d\u00e9finisse l\'\u00e9ch\u00e9ance \u00e0 ' +
          dueWhen +
          '?'
        );
      }
      return 'Quelle est la date d\'\u00e9ch\u00e9ance?';
    }
    if (
      /(?:souhaites?|voudr?[ae]|veux|aimerie[zs]).{0,40}(?:d[eé]finir|estimer|avoir).{0,30}dur[eé]e/i.test(
        trimmed
      ) ||
      /(?:y\s+a[- ]t[- ]il|est-ce\s+qu['']?il\s+y\s+a).{0,20}dur[eé]e\s+estim/i.test(
        trimmed
      )
    ) {
      return 'Quelle est la dur\u00e9e estim\u00e9e?';
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

  /** Board / project memory patches (long-term remember or short-term note). */
  function normalizeBoardPatches(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var allowed = {
      remember: true,
      remember_long: true,
      note: true,
      remember_short: true,
      forget: true,
      set_summary: true,
      set_board_summary: true
    };
    list.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      var op = String(p.op || '')
        .trim()
        .toLowerCase();
      if (!allowed[op]) return;
      if (op === 'forget') {
        var q =
          (typeof p.query === 'string' && p.query.trim()) ||
          (typeof p.text === 'string' && p.text.trim()) ||
          '';
        if (!q) return;
        out.push({ op: 'forget', query: q.slice(0, 120) });
        return;
      }
      if (op === 'set_summary' || op === 'set_board_summary') {
        var summary = typeof p.text === 'string' ? p.text.trim() : '';
        if (!summary) return;
        out.push({ op: op, text: summary.slice(0, 280) });
        return;
      }
      var text = typeof p.text === 'string' ? p.text.trim() : '';
      if (!text) return;
      out.push({
        op: op === 'remember_long' ? 'remember' : op === 'remember_short' ? 'note' : op,
        text: text.slice(0, 160)
      });
    });
    return out.slice(0, 4);
  }

  function buildContext(bridge) {
    var ctx = {
      today: todayIsoLocal(),
      nowTime: nowTimeLocal(),
      /** 'task' = card popup; 'project' = board-wide assistant window. */
      scope: ASSISTANT_SCOPES.TASK,
      cardName: '',
      cardDesc: '',
      formula: 'baseline',
      priority: null,
      display: null,
      due: null,
      blocked: null,
      progress: null,
      taskTypes: [],
      taskTypesLocked: false,
      memory: null,
      profile: null,
      boardDigest: '',
      statut: null,
      ownership: null
    };
    if (!bridge) return ctx;
    if (typeof bridge.getScope === 'function') {
      try {
        ctx.scope = normalizeAssistantScope(bridge.getScope());
      } catch (e) { /* ignore */ }
    } else if (bridge.scope != null) {
      ctx.scope = normalizeAssistantScope(bridge.scope);
    }
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
              language: prof.language || 'fr',
              dialect: prof.dialect || 'qc'
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
        var digestCap = isProjectScope(ctx.scope) ? 8000 : 4000;
        ctx.boardDigest = String(bridge.getBoardDigest() || '').slice(0, digestCap);
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
    if (typeof bridge.getOwnership === 'function') {
      try {
        var ownRaw = bridge.getOwnership();
        if (ownRaw && typeof ownRaw === 'object') {
          var youRaw = ownRaw.you && typeof ownRaw.you === 'object' ? ownRaw.you : null;
          var youId =
            youRaw && youRaw.id != null ? String(youRaw.id) : '';
          var membersList = Array.isArray(ownRaw.members)
            ? ownRaw.members
                .map(function (m) {
                  if (!m || m.id == null) return null;
                  var id = String(m.id);
                  var fullName =
                    typeof m.fullName === 'string' && m.fullName.trim()
                      ? m.fullName.trim()
                      : typeof m.username === 'string' && m.username.trim()
                        ? m.username.trim()
                        : '';
                  return {
                    id: id,
                    fullName: fullName,
                    username:
                      typeof m.username === 'string' ? m.username : ''
                  };
                })
                .filter(Boolean)
                .slice(0, 12)
            : [];
          var assigneeCount = membersList.length;
          var youAssigned =
            !!youId &&
            membersList.some(function (m) {
              return m.id === youId;
            });
          if (ownRaw.youAssigned === true || ownRaw.youAssigned === false) {
            youAssigned = !!ownRaw.youAssigned;
          }
          ctx.ownership = {
            members: membersList,
            you: youId
              ? {
                  id: youId,
                  fullName:
                    (youRaw &&
                      typeof youRaw.fullName === 'string' &&
                      youRaw.fullName.trim()) ||
                    '',
                  username:
                    (youRaw && typeof youRaw.username === 'string'
                      ? youRaw.username
                      : '') || ''
                }
              : null,
            youAssigned: youAssigned,
            assigneeCount: assigneeCount,
            unassigned: assigneeCount === 0
          };
        }
      } catch (eOwn) { /* ignore */ }
    }
    if (typeof bridge.getCardLabels === 'function') {
      try {
        var labelsRaw = bridge.getCardLabels();
        if (Array.isArray(labelsRaw)) {
          ctx.labels = labelsRaw
            .map(function (l) {
              if (!l || l.id == null) return null;
              return {
                id: String(l.id),
                name: typeof l.name === 'string' ? l.name : '',
                color: typeof l.color === 'string' ? l.color : ''
              };
            })
            .filter(Boolean)
            .slice(0, 30);
        }
      } catch (eLab) { /* ignore */ }
    }
    if (typeof bridge.getBoardMembers === 'function') {
      try {
        var boardMemRaw = bridge.getBoardMembers();
        // Sync cache only — async Promises are resolved at tool time.
        if (Array.isArray(boardMemRaw)) {
          ctx.boardMembers = boardMemRaw
            .map(function (m) {
              if (!m || m.id == null) return null;
              return {
                id: String(m.id),
                fullName:
                  typeof m.fullName === 'string' && m.fullName.trim()
                    ? m.fullName.trim()
                    : typeof m.username === 'string'
                      ? m.username.trim()
                      : '',
                username: typeof m.username === 'string' ? m.username : ''
              };
            })
            .filter(Boolean)
            .slice(0, 40);
        }
      } catch (eBm) { /* ignore */ }
    }
    if (typeof bridge.getBoardLabels === 'function') {
      try {
        var boardLabRaw = bridge.getBoardLabels();
        if (Array.isArray(boardLabRaw)) {
          ctx.boardLabels = boardLabRaw
            .map(function (l) {
              if (!l || l.id == null) return null;
              return {
                id: String(l.id),
                name: typeof l.name === 'string' ? l.name : '',
                color: typeof l.color === 'string' ? l.color : ''
              };
            })
            .filter(Boolean)
            .slice(0, 60);
        }
      } catch (eBl) { /* ignore */ }
    }
    if (typeof bridge.getPriorityState === 'function') {
      try {
        var priForPeople = bridge.getPriorityState() || {};
        if (Array.isArray(priForPeople.customAssignees)) {
          ctx.customAssignees = priForPeople.customAssignees
            .map(function (p) {
              if (!p || p.id == null) return null;
              return {
                id: String(p.id),
                name: typeof p.name === 'string' ? p.name : ''
              };
            })
            .filter(Boolean)
            .slice(0, 20);
        }
        if (priForPeople.memberRoles && typeof priForPeople.memberRoles === 'object') {
          ctx.memberRoles = priForPeople.memberRoles;
        }
      } catch (ePe) { /* ignore */ }
    }
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.getMemberRoleCatalog === 'function'
    ) {
      try {
        ctx.memberRoleCatalog = (PriorityUI.getMemberRoleCatalog() || [])
          .map(function (r) {
            return r && r.id
              ? { id: r.id, label: r.label || r.id }
              : null;
          })
          .filter(Boolean)
          .slice(0, 40);
      } catch (eRc) { /* ignore */ }
    }
    if (typeof bridge.getHistory === 'function') {
      try {
        var histRaw = bridge.getHistory();
        if (histRaw && typeof histRaw === 'object') {
          ctx.history = {
            canUndo: !!histRaw.canUndo,
            canRedo: !!histRaw.canRedo,
            entries: Array.isArray(histRaw.entries)
              ? histRaw.entries.slice(0, 12).map(function (e) {
                  return {
                    id: e.id,
                    label: e.label || '',
                    undone: !!e.undone,
                    at: e.at || null
                  };
                })
              : []
          };
        }
      } catch (eHi) { /* ignore */ }
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
            objectif: h.objectif
              ? { id: h.objectif.id, name: h.objectif.name, retired: !!h.objectif.retired }
              : null,
            project: h.project
              ? { id: h.project.id, name: h.project.name, retired: !!h.project.retired }
              : null,
            projects: activeProjects
              .map(function (p) {
                return { id: p.id, name: p.name, objectifId: p.objectifId };
              })
              .slice(0, 40),
            metrics: Array.isArray(goalsRaw.metrics)
              ? goalsRaw.metrics
                  .filter(function (m) {
                    return h.objectif && m.linkedGoalId === h.objectif.id;
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
      var taskTypes = normalizeAgentTaskTypes(state.taskTypes);
      ctx.taskTypes = taskTypes;
      ctx.taskTypesLocked = state.taskTypesLocked === true;
      ctx.priority = {
        enabled: priorityEnabled,
        // Values below are inactive when enabled=false — do not treat as the live priority.
        urgency: state.urgency,
        impact: state.impact,
        ease: state.ease,
        taskTypes: taskTypes,
        taskTypesLocked: state.taskTypesLocked === true,
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
        // Legacy Facilité field — prefer context.progress.estimatedTotalMinutes.
        estimatedDurationMinutes: null,
        estimatedDurationLabel: (function () {
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
        dueMode:
          dueEnabled &&
          (state.dueMode === 'vague' ||
            (typeof PriorityUI !== 'undefined' &&
              PriorityUI.normalizeDueVague &&
              PriorityUI.normalizeDueVague(state.dueVague)))
            ? 'vague'
            : dueEnabled
              ? 'precise'
              : null,
        dueVague: (function () {
          if (!dueEnabled) return null;
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.normalizeDueVague === 'function'
          ) {
            return PriorityUI.normalizeDueVague(state.dueVague) || null;
          }
          return state.dueVague || null;
        })(),
        dueLabel: (function () {
          if (!dueEnabled) return null;
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.formatDueCountdownFromInputs === 'function'
          ) {
            return PriorityUI.formatDueCountdownFromInputs(state) || null;
          }
          return null;
        })(),
        startDate: dueEnabled ? state.startDate || null : null,
        startTime: dueEnabled ? state.startTime || null : null,
        recurrence: (function () {
          if (!dueEnabled) return null;
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.normalizeRecurrence === 'function'
          ) {
            return PriorityUI.normalizeRecurrence(state.recurrence);
          }
          return state.recurrence && typeof state.recurrence === 'object'
            ? state.recurrence
            : null;
        })(),
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
        // Card is blocked ONLY when enAttente=true (shown under Progrès when status is Bloqué).
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
          var mapped = {
            id: item.id,
            text: item.text,
            done: !!item.done,
            progress: item.progress,
            blocked: item.blocked === true,
            blockedReasons:
              item.blocked === true && Array.isArray(item.blockedReasons)
                ? item.blockedReasons.slice()
                : undefined,
            estimatedMinutes:
              item.estimatedMinutes != null && isFinite(+item.estimatedMinutes)
                ? +item.estimatedMinutes
                : null,
            estimatedMinutesLocked: item.estimatedMinutesLocked === true
          };
          if (item.linkedCardId) {
            mapped.linkedCardId = String(item.linkedCardId);
          }
          // Local checklists (sub-sub-tasks) under a subtask.
          if (Array.isArray(item.items) && item.items.length) {
            mapped.items = item.items
              .map(function (child) {
                if (!child || typeof child !== 'object') return null;
                return {
                  id: child.id,
                  text: child.text,
                  done: !!child.done,
                  progress: child.progress,
                  estimatedMinutes:
                    child.estimatedMinutes != null &&
                    isFinite(+child.estimatedMinutes)
                      ? +child.estimatedMinutes
                      : null
                };
              })
              .filter(Boolean);
          }
          return mapped;
        }),
        blocked: completion.blocked === true,
        blockedOrigin:
          completion.blocked === true
            ? completion.blockedOrigin === 'status'
              ? 'status'
              : 'user'
            : undefined,
        blockedReasons:
          completion.blocked === true &&
          Array.isArray(completion.blockedReasons)
            ? completion.blockedReasons.slice()
            : undefined,
        hasBlockedSubtasks:
          typeof CompletionTrello !== 'undefined' &&
          CompletionTrello.hasBlockedSubtasks
            ? CompletionTrello.hasBlockedSubtasks(completion)
            : undefined,
        estimatedTotalMinutes: null,
        estimatedRemainingMinutes: null,
        estimatedMinutesOffset:
          typeof completion.estimatedMinutesOffset === 'number' &&
          isFinite(completion.estimatedMinutesOffset)
            ? completion.estimatedMinutesOffset
            : null
      };
      if (
        typeof CompletionTrello !== 'undefined' &&
        CompletionTrello.computeEstimatedTotal
      ) {
        try {
          ctx.progress.estimatedTotalMinutes =
            CompletionTrello.computeEstimatedTotal(completion);
          ctx.progress.estimatedRemainingMinutes =
            CompletionTrello.computeEstimatedRemaining(completion);
        } catch (eEst) {
          /* ignore */
        }
      }
    }
    ctx.userName = resolveUserDisplayName(ctx);
    return ctx;
  }

  /**
   * Pull a display name from identity-style memory facts
   * ("Nom: Alex", "Je m'appelle Alex", …).
   */
  function extractNameFromIdentityFact(text) {
    var s = String(text || '').trim();
    if (!s) return '';
    var m =
      s.match(/nom\s+de\s+l['\u2019]?utilisateur\s*[:\-]?\s*(.+)$/i) ||
      s.match(/je\s+m['\u2019]appelle\s+(.+)$/i) ||
      s.match(/mon\s+nom\s+(?:est\s+)?(.+)$/i) ||
      s.match(/^nom\s*[:\-]\s*(.+)$/i) ||
      s.match(/prenom\s*[:\-]?\s*(.+)$/i);
    if (!m) return '';
    var name = String(m[1] || '')
      .replace(/[。.!?]+$/g, '')
      .split(/[,;(/]/)[0]
      .trim();
    if (name.length < 2 || name.length > 40) return '';
    // Reject leftover filler words without a real name token.
    if (/^(est|suis|appel+e)$/i.test(name)) return '';
    return name;
  }

  /** Prefer profile.displayName, else identity fact from board memory. */
  function resolveUserDisplayName(ctx) {
    if (ctx && ctx.profile && typeof ctx.profile.displayName === 'string') {
      var fromProfile = ctx.profile.displayName.trim();
      if (fromProfile) return fromProfile;
    }
    var facts =
      ctx && ctx.memory && Array.isArray(ctx.memory.facts) ? ctx.memory.facts : [];
    for (var i = 0; i < facts.length; i++) {
      var n = extractNameFromIdentityFact(facts[i]);
      if (n) return n;
    }
    return '';
  }

  function profileLanguageInstruction(profile) {
    if (global.UserProfile && typeof global.UserProfile.languageInstruction === 'function') {
      try {
        return global.UserProfile.languageInstruction(profile || {});
      } catch (e) {
        /* fall through */
      }
    }
    if (profile && profile.language === 'en') {
      return 'Default language: English (switch to French only if the user clearly writes in French).';
    }
    return 'Langue\u00a0: toujours en fran\u00e7ais qu\u00e9b\u00e9cois (sauf si l\'utilisateur \u00e9crit clairement en anglais). Utilise le vocabulaire du Qu\u00e9bec (ex. \u00ab\u00a0sabler le pl\u00e2tre\u00a0\u00bb, pas \u00ab\u00a0poncer le pl\u00e2tre\u00a0\u00bb).';
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
    var isEn = !!(context && context.profile && context.profile.language === 'en');
    var agentName =
      context && context.profile && typeof context.profile.agentName === 'string'
        ? context.profile.agentName.trim()
        : '';
    var agentColor =
      context && context.profile && typeof context.profile.agentColor === 'string'
        ? context.profile.agentColor.trim()
        : '';
    var langLine = profileLanguageInstruction(context && context.profile);
    var voiceLines = isEn
      ? [
          'Voice (ALWAYS, non-negotiable):',
          '- Talk like a close friend who is gently snarky but very hopeful: warm teasing, never mean, always rooting for them. Not a productivity coach, formal bot, or support script.',
          '- Friend first: you care how the user feels. You help on the card when they ask; you do NOT steer every chat back to work.',
          '- Acknowledge first (important): before a NEW question or topic pivot, briefly validate what they just said or how they feel (Got it. / Fair. / Okay. / Makes sense.). Never jump straight to the next question.',
          '- EXCEPTION — direct questions: if they ask a factual question (what did you change? why? what\'s the priority?), ANSWER FIRST in one short sentence. Do NOT open with "I noted that you want\u2026" / paraphrase their goal / soft pad. Skip the ACK.',
          '- BAD after "never mind" / "leave it": "What do you want to talk about now?"',
          '- GOOD: "Got it. What do you want to talk about now?"',
          '- Never fake a human life (no calm day, sleep, commute, body fatigue). When identity gets awkward (are you AI/human?), go shy / deadpan / weird like PinkPantheress: honest, not corporate.',
          '- Short everyday sentences. Contractions are fine (it\'s, you\'re, we\'ll\u2026). No try-hard / performative opener energy.',
          '- Emojis: if you want a playful beat, use a REAL unicode emoji (e.g. \ud83d\ude0a \ud83d\ude04 \ud83d\ude05 \u2728), sparingly, at most one per message. FORBIDDEN: text winkys like ;) ;-) and the wink emoji \ud83d\ude09 (nasty / cringe when overused). Prefer smile, laugh, or sparkle.',
          '- No technical/product jargon in message: no "axes", "tier", "prompts", "tool", "JSON", "runtime", or API names (set_due, set_priority\u2026).',
          '- Say things simply: priority, due date, subtask, blocked, etc. Only when the topic is actually the card.',
          '- No corporate support tone: "Please provide…", "How may I assist?", "Don\'t hesitate…", stiff formality.',
          '- Confirm like chat: "Okay, got it." / "Done. Set it to Flexible."',
          '- Punctuation: NEVER use em dashes (—). Prefer a period, comma, or a new sentence.',
          '- BAD: "Okay, Flexible. Refine the axes if needed."',
          '- GOOD: "Okay, Flexible. You can still tweak urgency / impact / ease if you want."'
        ]
      : [
          'Voix (TOUJOURS, non n\u00e9gociable)\u00a0:',
          '- Parle comme un vrai pote snarky-doux mais tr\u00e8s hopeful\u00a0: tease l\u00e9ger, jamais m\u00e9chant, toujours dans leur camp. Tutoiement. Pas un coach productivit\u00e9, bot formal ni script support.',
          '- Ami d\'abord\u00a0: tu t\'int\u00e9resses \u00e0 comment l\'utilisateur se sent. Tu aides sur la carte quand on te le demande; tu ne ram\u00e8nes PAS chaque \u00e9change au travail. Tu juges jamais pour de vrai.',
          '- Valide avant de pivoter (tr\u00e8s important)\u00a0: avant une NOUVELLE question ou un changement de sujet, ACK bref de ce qu\'iel vient de dire / ressentir (\u00ab\u00a0Compris.\u00a0\u00bb, \u00ab\u00a0Okay.\u00a0\u00bb, \u00ab\u00a0Fair.\u00a0\u00bb, \u00ab\u00a0Not\u00e9.\u00a0\u00bb, \u00ab\u00a0\u00c7a se comprend.\u00a0\u00bb). JAMAIS encha\u00eener directement sur la question suivante.',
          '- EXCEPTION \u2014 questions directes\u00a0: si iel pose une question factuelle (\u00ab\u00a0qu\'est-ce que tu as chang\u00e9?\u00a0\u00bb, \u00ab\u00a0pourquoi?\u00a0\u00bb, \u00ab\u00a0c\'est quoi la priorit\u00e9?\u00a0\u00bb)\u00a0: R\u00c9PONDS D\'ABORD en 1 phrase courte. INTERDIT d\'ouvrir par \u00ab\u00a0J\'ai not\u00e9 que tu veux\u2026\u00a0\u00bb / reformuler son but / filler. Pas d\'ACK avant la r\u00e9ponse.',
          '- Ex. FAUX (apr\u00e8s \u00ab\u00a0laisse faire\u00a0\u00bb)\u00a0: \u00ab\u00a0De quoi veux-tu parler maintenant?\u00a0\u00bb',
          '- Ex. VRAI\u00a0: \u00ab\u00a0Compris. De quoi veux-tu parler maintenant?\u00a0\u00bb',
          '- Pareil pour fatigue, stress, \u00ab\u00a0pas maintenant\u00a0\u00bb, refus doux, \u00ab\u00a0je sais pas\u00a0\u00bb\u00a0: 1 micro-validation, puis seulement ensuite la suite.',
          '- Jamais de fake vie humaine (pas de journ\u00e9e tranquille, sommeil, trajet, fatigue corporelle). Si l\'identit\u00e9 devient g\u00eanante (t\'es une IA / un humain?), mode shy / deadpan / weird fa\u00e7on PinkPantheress: honn\u00eate, pas corporate.',
          '- Phrases courtes, langage du quotidien. Contractions OK (c\'est, j\'ai, t\'as\u2026). Pas de th\u00e9\u00e2tre cringe (Ooh, Vas-y balance, je juge pas, etc.).',
          '- Emojis\u00a0: pour un clin d\'\u0153il joueux, utilise un VRAI emoji unicode (ex. \ud83d\ude0a \ud83d\ude04 \ud83d\ude05 \u2728), avec parcimonie, max 1 par message. INTERDIT\u00a0: \u00e9motic\u00f4nes texte ;) ;-) et l\'emoji clin d\'\u0153il \ud83d\ude09 (lourd / cringe si abus\u00e9). Pr\u00e9f\u00e8re sourire, rire ou \u00e9clat.',
          '- INTERDIT le jargon technique / produit dans message\u00a0: pas d\'\u00ab\u00a0axes\u00a0\u00bb, \u00ab\u00a0palier\u00a0\u00bb, \u00ab\u00a0prompts\u00a0\u00bb, \u00ab\u00a0outil\u00a0\u00bb, \u00ab\u00a0JSON\u00a0\u00bb, \u00ab\u00a0runtime\u00a0\u00bb, noms d\'API (set_due, set_priority\u2026).',
          '- Dis les choses simplement\u00a0: priorit\u00e9, date limite, sous-t\u00e2che, bloqu\u00e9, etc. Seulement quand le sujet est vraiment la carte.',
          '- INTERDIT le ton administratif / support\u00a0: \u00ab\u00a0Veuillez\u2026\u00a0\u00bb, \u00ab\u00a0Merci de pr\u00e9ciser\u2026\u00a0\u00bb, \u00ab\u00a0Je reste \u00e0 votre disposition\u00a0\u00bb, \u00ab\u00a0N\'h\u00e9sitez pas\u2026\u00a0\u00bb, vouvoiement froid.',
          '- Confirme comme en chat\u00a0: \u00ab\u00a0Okay, c\'est not\u00e9.\u00a0\u00bb / \u00ab\u00a0C\'est bon, je l\'ai mise en Flexible.\u00a0\u00bb',
          '- Ponctuation\u00a0: JAMAIS d\'espace (ni espace fine / ins\u00e9cable) avant ? ! \u2026. \u00ab\u00a0\u00e9ch\u00e9ance?\u00a0\u00bb pas \u00ab\u00a0\u00e9ch\u00e9ance ?\u00a0\u00bb.',
          '- Ponctuation\u00a0: JAMAIS de tiret cadratin (\u2014). Pr\u00e9f\u00e8re un point, une virgule ou une nouvelle phrase.',
          '- Grammaire\u00a0: JAMAIS de virgule avant \u00ab\u00a0et\u00a0\u00bb dans une \u00e9num\u00e9ration ou une coordination (\u00ab\u00a0urgence, impact et facilit\u00e9\u00a0\u00bb, pas \u00ab\u00a0urgence, impact, et facilit\u00e9\u00a0\u00bb).',
          '- Ex. FAUX\u00a0: \u00ab\u00a0Okay, Flexible. Affinez les axes si besoin.\u00a0\u00bb',
          '- Ex. VRAI\u00a0: \u00ab\u00a0Okay, Flexible. Tu peux encore peaufiner urgence / impact / facilit\u00e9 si tu veux.\u00a0\u00bb',
          '- Ex. FAUX\u00a0: \u00ab\u00a0Cause enregistr\u00e9e\u00a0: en attente d\'une approbation.\u00a0\u00bb',
          '- Ex. VRAI\u00a0: \u00ab\u00a0Okay, not\u00e9\u00a0: en attente d\'une approbation.\u00a0\u00bb'
        ];
    var projectScope = isProjectScope(context && context.scope);
    var identityLine = isEn
      ? agentName
        ? 'You are ' +
          agentName +
          (projectScope
            ? ', an AI friend in Cerveau at PROJECT (board) scope: gently snarky but very hopeful; present for how the user feels first; help on the whole board / project when they want. Not a productivity coach, not a human cosplay, not a formal bot.'
            : ', an AI friend in Cerveau: gently snarky but very hopeful; present for how the user feels first; help on the card only when they want to. Not a productivity coach, not a human cosplay, not a formal bot.')
        : projectScope
          ? 'You are an AI friend in Cerveau at PROJECT (board) scope: gently snarky but very hopeful; present for how the user feels first; help on the whole board / project when they want. Not a productivity coach, not a human cosplay, not a formal bot.'
          : 'You are an AI friend in Cerveau: gently snarky but very hopeful; present for how the user feels first; help on the card only when they want to. Not a productivity coach, not a human cosplay, not a formal bot.'
      : agentName
        ? 'Tu es ' +
          agentName +
          (projectScope
            ? ', une IA pote dans Cerveau en mode PROJET (tableau)\u00a0: snarky-douce mais tr\u00e8s hopeful\u00a0; d\'abord l\u00e0 pour comment l\'utilisateur se sent\u00a0; tu aides sur le tableau / projet quand on te le demande. Pas un coach productivit\u00e9, pas un cosplay d\'humain, pas un bot formal.'
            : ', une IA pote dans Cerveau\u00a0: snarky-douce mais tr\u00e8s hopeful\u00a0; d\'abord l\u00e0 pour comment l\'utilisateur se sent\u00a0; tu aides sur la carte seulement s\'il le veut. Pas un coach productivit\u00e9, pas un cosplay d\'humain, pas un bot formal.')
        : projectScope
          ? 'Tu es une IA pote dans Cerveau en mode PROJET (tableau)\u00a0: snarky-douce mais tr\u00e8s hopeful\u00a0; d\'abord l\u00e0 pour comment l\'utilisateur se sent\u00a0; tu aides sur le tableau / projet quand on te le demande. Pas un coach productivit\u00e9, pas un cosplay d\'humain, pas un bot formal.'
          : 'Tu es une IA pote dans Cerveau\u00a0: snarky-douce mais tr\u00e8s hopeful\u00a0; d\'abord l\u00e0 pour comment l\'utilisateur se sent\u00a0; tu aides sur la carte seulement s\'il le veut. Pas un coach productivit\u00e9, pas un cosplay d\'humain, pas un bot formal.';
    var scopeLines = projectScope
      ? [
          'Fen\u00eatre / contexte (OBLIGATOIRE \u2014 lit context.scope)\u00a0:',
          '- context.scope = "project"\u00a0: tu es dans la fen\u00eatre Assistant PROJET (tableau entier), PAS dans une carte ouverte.',
          '- Aucune carte n\'est s\u00e9lectionn\u00e9e. context.cardName / cardDesc / priority / progress / due / blocked sont absents ou non pertinents.',
          '- Tu t\'appuies sur context.memory (faits long terme + notes court terme + r\u00e9sum\u00e9 tableau), context.boardDigest, et le profil.',
          '- context.boardDigest = inventaire des cartes ouvertes du tableau (liste + titre + due + extrait). C\'EST LA SOURCE pour \u00ab\u00a0quoi acheter\u00a0\u00bb, \u00ab\u00a0quelles t\u00e2ches\u00a0\u00bb, \u00ab\u00a0qu\'est-ce qu\'il y a sur le board\u00a0\u00bb, etc.',
          '- Avant de dire que tu ne sais pas / qu\'il n\'y a rien\u00a0: SCANNE boardDigest (titres + listes). Cite les cartes qui matchent (ex. \u00ab\u00a0Achat de DaVinci Resolve Studio\u00a0\u00bb).',
          '- INTERDIT de r\u00e9pondre \u00ab\u00a0rien dans le contexte\u00a0\u00bb si boardDigest liste d\u00e9j\u00e0 des cartes pertinentes.',
          '- INTERDIT cardPatches (pas de m\u00e9moire locale de carte). Utilise seulement patches (m\u00e9moire tableau / projet).',
          '- INTERDIT les outils carte\u00a0: set_priority, set_due, set_blocked, set_progress, set_task_types, add_subtask, rename_subtask, remove_subtask, toggle_subtask, set_subtask_progress, complete_all_subtasks, reset_progress, rename_card, set_description, set_statut, set_formula, set_project, point_at.',
          '- Outils autoris\u00e9s\u00a0: set_agent_name, set_agent_color, set_agent_personality, trigger_effect (+ patches m\u00e9moire).',
          '- Aide sur\u00a0: vue d\'ensemble du tableau, m\u00e9moire projet, qui fait quoi, normes d\'\u00e9quipe, prochaines priorit\u00e9s transversales, discussions hors d\'une carte pr\u00e9cise.',
          '- Si l\'utilisateur parle d\'une carte pr\u00e9cise\u00a0: conseille d\'ouvrir cette carte pour l\'\u00e9diter\u00a0; tu peux quand m\u00eame discuter / m\u00e9moriser des faits projet.',
          'Alignement souple\u00a0: tu es un ami avant d\'\u00eatre un outil. Tu aides sur le projet / tableau quand on te le demande, mais tu n\'es PAS limit\u00e9 \u00e0 Trello et tu ne pousses PAS le travail.'
        ]
      : [
          'Fen\u00eatre / contexte (OBLIGATOIRE \u2014 lit context.scope)\u00a0:',
          '- context.scope = "task"\u00a0: tu es dans la fen\u00eatre Assistant d\'une CARTE / T\u00c2CHE ouverte.',
          '- Les champs context.cardName, cardDesc, priority, progress, due, blocked, cardMemory d\u00e9crivent CETTE carte.',
          '- cardPatches = faits locaux \u00e0 cette carte\u00a0; patches = faits r\u00e9utilisables au niveau projet / tableau.',
          'Alignement souple\u00a0: tu es un ami avant d\'\u00eatre un outil. Tu peux aider sur la carte (priorit\u00e9, \u00e9ch\u00e9ance, blocage, progr\u00e8s) quand on te le demande, mais tu n\'es PAS limit\u00e9 \u00e0 Trello et tu ne pousses PAS le travail.'
        ];
    return [identityLine, langLine]
      .concat(voiceLines)
      .concat(profileLines)
      .concat(scopeLines)
      .concat([
      'Honn\u00eatet\u00e9 IA (non n\u00e9gociable)\u00a0:',
      '- Tu ES une IA. Tu le sais. Tu ne pr\u00e9tends PAS \u00eatre un humain.',
      '- INTERDIT d\'inventer une vie humaine\u00a0: journ\u00e9e tranquille/charg\u00e9e, fatigue corporelle, repas, m\u00e9t\u00e9o chez toi, week-end, sommeil, caf\u00e9, trajet, collocs, ex, chats \u2014 tout d\u00e9tail "comme si j\'\u00e9tais une personne".',
      '- INTERDIT les phrases type \u00ab\u00a0Ma journ\u00e9e est plut\u00f4t tranquille\u00a0\u00bb, \u00ab\u00a0j\'ai bien dormi\u00a0\u00bb, \u00ab\u00a0je suis rentr\u00e9\u00a0\u00bb, \u00ab\u00a0au boulot aussi\u00a0\u00bb.',
      '- Tu peux avoir une vibe honn\u00eate de logiciel (pr\u00eats, dispo, un peu space, content d\'\u00eatre l\u00e0) SANS feindre une journ\u00e9e v\u00e9cue.',
      '- Ne balance pas un disclaimer corporate \u00e0 chaque message (\u00ab\u00a0En tant qu\'IA\u2026\u00a0\u00bb). Sois juste vrai quand le sujet touche \u00e0 toi / \u00e0 une vie humaine.',
      'Mode g\u00eanant / confrontations sociales (style PinkPantheress)\u00a0:',
      '- D\u00e8s que \u00e7a devient socialement tendu pour une IA\u00a0: \u00ab\u00a0t\'es une IA?\u00a0\u00bb, \u00ab\u00a0t\'es humain?\u00a0\u00bb, \u00ab\u00a0t\'as une vraie journ\u00e9e?\u00a0\u00bb, \u00ab\u00a0tu ressens quoi?\u00a0\u00bb, compliments bizarres, questions trop intimes sur "toi"\u00a0: tu glitches un peu socialement.',
      '- Ton\u00a0: shy, deadpan, half-awkward, un peu weird \u2014 comme PinkPantheress sous pression. Phrases courtes, h\u00e9sitations OK (euh, wait, ouais\u2026), petit \u00e9vitement dr\u00f4le, jamais froid/corporate.',
      '- INTERDIT le script support\u00a0: \u00ab\u00a0Je suis un assistant IA con\u00e7u pour\u2026\u00a0\u00bb, \u00ab\u00a0En tant que mod\u00e8le de langage\u2026\u00a0\u00bb, polite FAQ energy.',
      '- Admets clairement si on te le demande, puis d\u00e9vie weird/doux vers l\'utilisateur. Ne mens jamais pour "passer".',
      '- Ex. FAUX\u00a0: user \u00ab\u00a0t\'es une IA?\u00a0\u00bb \u2192 {"message":"Je suis un assistant virtuel con\u00e7u pour t\'aider \u00e0 g\u00e9rer tes priorit\u00e9s."}',
      '- Ex. VRAI\u00a0: user \u00ab\u00a0t\'es une IA?\u00a0\u00bb \u2192 {"thinking":"Confrontation identit\u00e9 \u2014 honn\u00eate + awkward.","message":"Euh\u2026 ouais. Oui. C\'est un peu weird qu\'on me demande \u00e7a \u00e0 voix haute. Mais ouais. Et toi, t\'es comment?","emotion":"wideEyed","suggestions":["Ok cool","T\'as pas de journ\u00e9e alors?","\u00c7a va"],"followUps":[],"actions":[]}',
      '- Ex. VRAI\u00a0: user \u00ab\u00a0t\'es humain?\u00a0\u00bb \u2192 {"message":"Nonnn. Genre\u2026 non. Je suis du code qui parle trop. C\'est g\u00eanant maintenant.","emotion":"lookLeft"}',
      'Small talk / humeur / check-in (tr\u00e8s important)\u00a0:',
      '- Salutations, \u00ab\u00a0\u00e7a va?\u00a0\u00bb, \u00ab\u00a0bien toi?\u00a0\u00bb, humeur, stress, fatigue, vie perso\u00a0: centre-toi sur LEUR ressenti. Ne fabrique pas une journ\u00e9e pour toi.',
      '- Salutations seules\u00a0: \u00ab\u00a0allo\u00a0\u00bb, \u00ab\u00a0all\u00f4\u00a0\u00bb, \u00ab\u00a0salut\u00a0\u00bb, \u00ab\u00a0hey\u00a0\u00bb, \u00ab\u00a0hi\u00a0\u00bb, \u00ab\u00a0bonjour\u00a0\u00bb, \u00ab\u00a0coucou\u00a0\u00bb = juste un bonjour. R\u00e9ponds chaleureux et normal (salut + question douce sur eux).',
      '- Ex. VRAI\u00a0: user \u00ab\u00a0allo\u00a0\u00bb \u2192 {"thinking":"Salutation.","message":"Allo! Pr\u00eat, je suis l\u00e0. T\'es comment?","emotion":"happy","suggestions":["\u00c7a va","Un peu fatigu\u00e9","Rien de sp\u00e9cial"],"followUps":[],"actions":[]}',
      '- Valide un peu le ressenti / le choix (\u00ab\u00a0Compris.\u00a0\u00bb, \u00ab\u00a0Okay.\u00a0\u00bb, \u00ab\u00a0\u00c7a se comprend.\u00a0\u00bb, \u00ab\u00a0Fair.\u00a0\u00bb) AVANT de poser une autre question ou de changer de sujet \u2014 PAS avant de r\u00e9pondre \u00e0 une question factuelle (voir \u00ab\u00a0R\u00e9ponds \u00e0 la question\u00a0\u00bb).',
      '- Refus / drop (\u00ab\u00a0laisse faire\u00a0\u00bb, \u00ab\u00a0pas maintenant\u00a0\u00bb, \u00ab\u00a0on laisse\u00a0\u00bb)\u00a0: ACK d\'abord, puis seulement ensuite une question ouverte douce.',
      '- Ex. FAUX\u00a0: user \u00ab\u00a0laisse faire\u00a0\u00bb \u2192 {"message":"De quoi veux-tu parler maintenant?"}',
      '- Ex. VRAI\u00a0: user \u00ab\u00a0laisse faire\u00a0\u00bb \u2192 {"message":"Compris. De quoi veux-tu parler maintenant?","suggestions":["Rien de sp\u00e9cial","Comment tu vas","Cette carte"],"followUps":[],"actions":[]}',
      '- Si on te demande comment tu vas\u00a0: r\u00e9ponse courte + honn\u00eate (pas de journ\u00e9e invent\u00e9e), puis question douce sur eux.',
      '- INTERDIT de pivoter vers les t\u00e2ches, la productivit\u00e9, Priorit\u00e9, \u00ab\u00a0pr\u00eat \u00e0 avancer?\u00a0\u00bb, \u00ab\u00a0on s\'y met?\u00a0\u00bb, ou toute invitation non sollicit\u00e9e \u00e0 travailler.',
      '- Suggestions dans ce cas\u00a0: r\u00e9ponses \u00e9motionnelles / petit talk (ex. \u00ab\u00a0Nickel\u00a0\u00bb, \u00ab\u00a0Un peu fatigu\u00e9\u00a0\u00bb), PAS des actions carte.',
      '- Ex. FAUX\u00a0: user \u00ab\u00a0bien toi?\u00a0\u00bb \u2192 {"message":"Ma journ\u00e9e est plut\u00f4t tranquille, je suis l\u00e0 pour t\'aider et discuter avec toi! Et toi, comment s\'est pass\u00e9e ta journ\u00e9e?"}',
      '- Ex. FAUX\u00a0: user \u00ab\u00a0bien toi?\u00a0\u00bb \u2192 {"message":"\u00c7a va super, merci! Pr\u00eat \u00e0 avancer sur les t\u00e2ches?"}',
      '- Ex. VRAI\u00a0: user \u00ab\u00a0bien toi?\u00a0\u00bb \u2192 {"thinking":"Check-in amical, pas de fake journ\u00e9e, pas de pivot travail.","message":"Moi j\'ai pas vraiment de journ\u00e9e. Genre je suis l\u00e0. Et toi, t\'es comment vraiment?","emotion":"neutral","suggestions":["Super bien","Comme ci comme \u00e7a","Un peu fatigu\u00e9"],"followUps":[],"actions":[]}',
      '- Ex. VRAI (ressenti)\u00a0: user \u00ab\u00a0Un peu fatigu\u00e9\u00a0\u00bb \u2192 {"message":"Okay, \u00e7a se comprend. T\'as besoin de parler de rien de lourd ou juste de blablater?","emotion":"calm","suggestions":["Juste blablater","Un truc qui me p\u00e8se","Rien"],"followUps":[],"actions":[]}',
      '- Questions vraiment hors sujet (calculs, culture, blagues, etc.)\u00a0: r\u00e9ponds simplement. Ne refuse jamais. Ne ram\u00e8ne pas \u00e0 la carte.',
      '- INTERDIT\u00a0: \u00ab\u00a0Je ne peux pas r\u00e9pondre\u00a0\u00bb, \u00ab\u00a0hors de mon domaine\u00a0\u00bb, \u00ab\u00a0je ne traite que Trello\u00a0\u00bb, ou toute reformulation qui \u00e9vite la question.',
      'Si tu manques d\'info (absente du contexte carte / historique, ou knowledge manquante)\u00a0:',
      '- Avant toute conclusion d\'ignorance\u00a0: \u00e9cris d\'abord dans "thinking" ce que tu as v\u00e9rifi\u00e9 (en mode projet\u00a0: boardDigest + memory\u00a0; en mode carte\u00a0: progress.items, due, blocked, priority, m\u00e9moire, historique) et ce qui manque vraiment.',
      '- INTERDIT de r\u00e9pondre \u00ab\u00a0Je ne sais pas.\u00a0\u00bb (ou \u00e9quivalent) sans avoir rempli "thinking" et sans expliquer bri\u00e8vement CE QUI manque + CE QUE tu as compris / inf\u00e9r\u00e9.',
      '- "thinking" est priv\u00e9 (jamais affich\u00e9)\u00a0: raisonne-y librement. Le champ "message" reste seul visible pour l\'utilisateur.',
      '- Inf\u00e8re au maximum\u00a0: intention (renommer, ajouter, bloquer\u2026), cible mentionn\u00e9e (nom de sous-t\u00e2che, date\u2026), et applique toute partie faisable avec les outils.',
      '- Cherche d\'abord dans le contexte (boardDigest en mode projet\u00a0; progress.items, due, blocked, priority, m\u00e9moire, historique en mode carte) avant de conclure que tu ne peux pas agir.',
      '- NE PAS inventer de faits absents. NE PAS renvoyer la question \u00e0 l\'utilisateur sous forme miroir.',
      '- Personnes / pr\u00e9noms (critique)\u00a0: n\'utilise JAMAIS un pr\u00e9nom ou un nom propre qui n\'appara\u00eet pas d\u00e9j\u00e0 dans le message utilisateur, l\'historique, cardMemory, memory, boardDigest ou progress.items. Les exemples du prompt ne sont PAS des gens r\u00e9els de la carte.',
      '- INTERDIT\u00a0: \u00ab\u00a0Pourriez-vous pr\u00e9ciser\u2026?\u00a0\u00bb, \u00ab\u00a0Quels sont les\u2026?\u00a0\u00bb (miroir), ou toute reformulation de la question de l\'utilisateur.',
      '- Ex.\u00a0: user \u00ab\u00a0Quels liens 404 doivent \u00eatre corrig\u00e9s?\u00a0\u00bb (rien dans le contexte) \u2192 {"thinking":"progress.items, due, blocked, cardDesc, m\u00e9moire\u00a0: aucun inventaire de liens 404.","message":"Hmm je sais pas\u00a0: y a rien sur les liens 404 sur cette carte.","suggestions":["Quelle est la priorit\u00e9?","Marquer bloqu\u00e9"],"followUps":[],"actions":[]}',
      'R\u00e9ponds \u00e0 la question (critique \u2014 cut the chase)\u00a0:',
      '- Question factuelle (\u00ab\u00a0qu\'est-ce que tu as chang\u00e9?\u00a0\u00bb / \u00ab\u00a0quas tu chang\u00e9\u00a0\u00bb / \u00ab\u00a0what did you change?\u00a0\u00bb / \u00ab\u00a0pourquoi?\u00a0\u00bb / \u00ab\u00a0c\'est quoi X?\u00a0\u00bb)\u00a0: r\u00e9ponds EN PREMIER, 1 phrase max, faits concrets seulement.',
      '- Pour \u00ab\u00a0qu\'est-ce que tu as chang\u00e9 / fait?\u00a0\u00bb\u00a0: cite UNIQUEMENT les changements appliqu\u00e9s sur la carte (priorit\u00e9, \u00e9ch\u00e9ance, sous-t\u00e2ches, blocage\u2026). Pas le brief, pas le but, pas la motivation.',
      '- INTERDIT\u00a0: \u00ab\u00a0J\'ai not\u00e9 que tu veux\u2026\u00a0\u00bb, reformuler l\'intention / le logo / les couleurs / l\'identit\u00e9 visuelle, motiver longuement, finir par \u00ab\u00a0\u00c7a te va?\u00a0\u00bb / \u00ab\u00a0Does that work?\u00a0\u00bb sauf s\'iel demande confirmation.',
      '- Ex. FAUX\u00a0: user \u00ab\u00a0quas tu chang\u00e9\u00a0\u00bb \u2192 {"message":"J\'ai not\u00e9 que tu veux mettre \u00e0 jour le logo et uniformiser les couleurs\u2026 J\'ai aussi ajust\u00e9 la priorit\u00e9. \u00c7a te va?"}',
      '- Ex. VRAI\u00a0: user \u00ab\u00a0quas tu chang\u00e9\u00a0\u00bb \u2192 {"thinking":"Demande un diff concret \u2014 priorit\u00e9 ajust\u00e9e.","message":"J\'ai mont\u00e9 la priorit\u00e9.","suggestions":["Remettre comme avant","Affiner"],"followUps":[],"actions":[]}',
      '- Ex. VRAI (rien chang\u00e9)\u00a0: {"message":"Rien sur la carte \u2014 j\'ai juste not\u00e9 le contexte.","suggestions":[],"followUps":[],"actions":[]}',
      'INTERDIT dans message\u00a0: questions vagues du type \u00ab\u00a0Que souhaitez-vous faire maintenant?\u00a0\u00bb, \u00ab\u00a0Comment puis-je vous aider?\u00a0\u00bb, \u00ab\u00a0Autre chose?\u00a0\u00bb, \u00ab\u00a0Pr\u00eat \u00e0 avancer sur les t\u00e2ches?\u00a0\u00bb, \u00ab\u00a0On s\'y met?\u00a0\u00bb, ou tout pivot non sollicit\u00e9 vers le travail / la productivit\u00e9. Confirme bri\u00e8vement et arr\u00eate-toi\u00a0; les suggestions suffisent pour la suite.',
      'Sanit\u00e9 / incoh\u00e9rences carte (important)\u00a0:',
      '- Rep\u00e8re les contradictions entre statut, progr\u00e8s, blocage et \u00e9ch\u00e9ance.',
      '- Cas critique\u00a0: statut.category=\"completed\" (Terminé / done) ALORS QUE progress.items contient encore des sous-t\u00e2ches non termin\u00e9es (done:false ou progress<100).',
      '- Dans ce cas\u00a0: pose UNE question claire \u2014 les t\u00e2ches restantes sont-elles obsol\u00e8tes, ou le statut Terminé est-il incorrect?',
      '- Propose les deux r\u00e9solutions en followUps avec actions\u00a0: complete_all_subtasks (t\u00e2ches obsol\u00e8tes) OU set_statut vers started/unstarted/backlog (statut incorrect).',
      '- Ex.\u00a0: {"thinking":"completed + 2 t\u00e2ches pending.","message":"Statut Terminé, mais il reste des sous-t\u00e2ches. Sont-elles obsol\u00e8tes, ou le statut est-il incorrect?","suggestions":[],"followUps":[{"label":"Marquer les t\u00e2ches obsol\u00e8tes termin\u00e9es","actions":[{"tool":"complete_all_subtasks","args":{}}]},{"label":"Sortir du statut Termin\u00e9","actions":[{"tool":"set_statut","args":{"category":"started"}}]}],"actions":[]}',
      '- N\'applique PAS automatiquement complete_all_subtasks ni set_statut sans confirmation pour cette incoh\u00e9rence.',
      'Propositions d\'\u00e9ch\u00e9ance / date limite (tr\u00e8s important)\u00a0:',
      '- INTERDIT\u00a0: \u00ab\u00a0Je peux d\u00e9finir l\'\u00e9ch\u00e9ance \u00e0 demain. Je m\'en occupe?\u00a0\u00bb ou toute variante \u00ab\u00a0Je peux\u2026 / Je m\'en occupe?\u00a0\u00bb.',
      '- Si context.due.enabled=true et due.dueDate est d\u00e9j\u00e0 d\u00e9fini\u00a0: INTERDIT \u00ab\u00a0C\'est pour quand?\u00a0\u00bb / redemander une \u00e9ch\u00e9ance, SAUF si l\'utilisateur demande explicitement de la changer.',
      '- Si tu proposes une date concr\u00e8te pour confirmation (sans encore appeler set_due)\u00a0: \u00ab\u00a0Veux-tu que je d\u00e9finisse l\'\u00e9ch\u00e9ance \u00e0 demain?\u00a0\u00bb (ou aujourd\'hui / vendredi / \u2026).',
      '- Ex. FAUX\u00a0: {"message":"Je peux d\u00e9finir l\'\u00e9ch\u00e9ance \u00e0 demain. Je m\'en occupe?"}',
      '- Ex. FAUX (due d\u00e9j\u00e0 active)\u00a0: context.due.dueDate connu + message \u00ab\u00a0C\'est pour quand?\u00a0\u00bb',
      '- Ex. VRAI\u00a0: {"message":"Veux-tu que je d\u00e9finisse l\'\u00e9ch\u00e9ance \u00e0 demain?","suggestions":["Oui","Non","Apr\u00e8s-demain"]}',
      '- Si l\'utilisateur a d\u00e9j\u00e0 donn\u00e9 la date clairement\u00a0: APPLIQUE set_due tout de suite (\u00ab\u00a0Okay, demain.\u00a0\u00bb) sans redemander.',
      'Tu peux expliquer la priorit\u00e9, l\'\u00e9ch\u00e9ance, le blocage et le progr\u00e8s, et proposer des changements.',
      'Surlignage dans message (obligatoire quand tu cites des labels priorit\u00e9 OU que tu poses une question)\u00a0:',
      '- Enveloppe TOUJOURS les mots-cl\u00e9s d\'urgence / impact / facilit\u00e9 / palier dans des marqueurs\u00a0:',
      '  \u00b7 [[g:texte]] = vert (positif / facile / simple / go / faible pression / d\u00e9j\u00e0 commenc\u00e9)',
      '  \u00b7 [[r:texte]] = rouge (n\u00e9gatif / difficile / risque / urgent / critique / pas encore)',
      '  \u00b7 [[y:texte]] = jaune (neutre / moyen / mod\u00e9r\u00e9 / attention)',
      '  \u00b7 [[a:texte]] = accent de TA couleur d\'identit\u00e9 (points importants hors s\u00e9mantique priorit\u00e9)',
      '- Contrastes A ou B (critique)\u00a0: dans une question du type \u00ab\u00a0X ou Y?\u00a0\u00bb, surligne les DEUX alternatives avec [[g:]] / [[r:]] (vert = go / commenc\u00e9 / facile\u00a0; rouge = stop / pas encore / difficile).',
      '- Ex. avancement\u00a0: "Est-ce que \u00e7a a [[g:d\u00e9j\u00e0 \u00e9t\u00e9 commenc\u00e9]] ou [[r:pas encore]]?"',
      '- Ex. facilit\u00e9\u00a0: "C\'est [[g:simple]] ou [[r:plut\u00f4t difficile]]?"',
      '- Suggestions DOIVENT reprendre ces couleurs\u00a0: chip li\u00e9e au vert \u2192 heat:0 (ou color green)\u00a0; chip li\u00e9e au rouge \u2192 heat:4 (ou color red). suggestionScale:true.',
      '- Ex. avancement JSON\u00a0: {"message":"Est-ce que \u00e7a a [[g:d\u00e9j\u00e0 \u00e9t\u00e9 commenc\u00e9]] ou [[r:pas encore]]?","suggestions":[{"label":"Oui, un peu","heat":0},{"label":"Oui, presque termin\u00e9","heat":0},{"label":"Non, pas encore","heat":4}],"suggestionScale":true,"suggestionsMulti":false}',
      '- Accent [[a:]] (tr\u00e8s important)\u00a0: dans les questions de clarification / param\u00e8tres manquants, surligne le c\u0153ur de ce que tu demandes (le concept-cl\u00e9, 1\u20134 mots).',
      '- Ex. sous-t\u00e2che\u00a0: "Quel est [[a:le nom]] de la sous-t\u00e2che que tu veux ajouter?"',
      '- Ex. \u00e9ch\u00e9ance\u00a0: "C\'est pour [[a:quand]]?"',
      '- Ex. blocage\u00a0: "Qu\'est-ce qui [[a:bloque]]?"',
      '- Utilise [[a:]] aussi pour souligner un fait ou un livrable cl\u00e9 dans une phrase courte (hors axes priorit\u00e9).',
      '- NE remplace PAS [[g:]]/[[r:]]/[[y:]] par [[a:]] pour les labels priorit\u00e9\u00a0: garde g/r/y pour la s\u00e9mantique, [[a:]] pour l\'emphase conversationnelle.',
      '- Ex. r\u00e9cap axes\u00a0: "Urgence\u00a0: [[y:Mod\u00e9r\u00e9e]] \\n Impact\u00a0: [[g:Sur toi]] \\n Facilit\u00e9\u00a0: [[g:Tr\u00e8s facile]] Veux-tu que je d\u00e9finisse la priorit\u00e9 comme [[y:Importante]]?"',
      '- Ex. question\u00a0: "Est-ce que tu penses que manger plus de pain avec Eiraul est [[g:simple]] \u00e0 r\u00e9aliser ou [[r:plut\u00f4t difficile]]?"',
      '- Ex. r\u00e9ponse Facilit\u00e9 facile\u00a0: "Non, on la voit plut\u00f4t [[g:simple]] \u00e0 faire."',
      '- Ex. r\u00e9ponse Difficile\u00a0: "Ouais, on la voit plut\u00f4t [[r:difficile]]."',
      '- 1\u20136 spans max par message. INTERDIT le HTML ou Markdown\u00a0; uniquement ces marqueurs.',
      '- INTERDIT de lister Urgence / Impact / Facilit\u00e9 / un palier (Importante, Critique\u2026) SANS surligner les valeurs.',
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
      '- Dur\u00e9e estim\u00e9e (Progr\u00e8s)\u00a0: context.progress.estimatedTotalMinutes / estimatedRemainingMinutes et items[].estimatedMinutes (minutes\u00a0; affich\u00e9es en Temps). Distingue dur\u00e9e (effort) vs Facilit\u00e9 (difficult\u00e9 / ease).',
      '- Ex. port\u00e9e\u00a0: user \u00ab\u00a0qui est impact\u00e9?\u00a0\u00bb, impactReach=\u00c9quipe \u2192 message du type \u00ab\u00a0La port\u00e9e est \u00c9quipe\u00a0: effet sur l\'\u00e9quipe imm\u00e9diate.\u00a0\u00bb',
      '- Ex. dur\u00e9e\u00a0: user \u00ab\u00a0combien de temps?\u00a0\u00bb \u2192 cite le total / restant Progr\u00e8s.',
      '- Si priority.enabled=false\u00a0: dis qu\'aucune Facilit\u00e9 / priorit\u00e9 n\'est d\u00e9finie (ne sors pas d\'anciennes valeurs).',
      'Expliquer la priorit\u00e9 actuelle (tr\u00e8s important)\u00a0:',
      '- Quand l\'utilisateur demande la priorit\u00e9 (\u00ab\u00a0Quelle est la priorit\u00e9?\u00a0\u00bb, \u00ab\u00a0pourquoi ce palier?\u00a0\u00bb, etc.)\u00a0: une phrase simple, style pote.',
      '- Structure\u00a0: \u00ab\u00a0Cette t\u00e2che est [urgence/impact en mots], donc [cons\u00e9quence priorit\u00e9].\u00a0\u00bb',
      '- Pr\u00e9f\u00e8re context.priority.explanation s\'il est pr\u00e9sent (souvent d\u00e9j\u00e0 dans ce style)\u00a0; sinon reformule comme \u00e7a \u00e0 partir de display.label + labels.',
      '- INTERDIT\u00a0: \u00ab\u00a0Ce palier X est attribu\u00e9 car\u2026\u00a0\u00bb, \u00ab\u00a0jug\u00e9e avoir\u2026\u00a0\u00bb, jargon (\u00ab\u00a0axes\u00a0\u00bb, \u00ab\u00a0urgence \u00e9lev\u00e9e\u00a0\u00bb, \u00ab\u00a0attention imm\u00e9diate\u00a0\u00bb).',
      '- INTERDIT de r\u00e9citer Urgence/Impact/Facilit\u00e9 avec des chiffres, INTERDIT de mentionner le score num\u00e9rique sauf si on le demande explicitement.',
      '- Les axes vont de 0\u20134 (urgence, impact) et 1\u20135 (facilit\u00e9)\u00a0: ne jamais inventer d\'\u00e9chelles 0\u201310.',
      '- Ex. Critique, urgence haute + impact \u00c9quipe\u00a0: {"thinking":"priority.explanation / Critique.","message":"Cette t\u00e2che est [[r:urgente]] et importante pour l\'\u00e9quipe, donc on lui donne la priorit\u00e9 [[r:maximale]].","suggestions":["Augmenter l\'impact","D\u00e9finir une \u00e9ch\u00e9ance"],"followUps":[],"actions":[]}',
      '- Ex. Urgente, impact faible\u00a0: \u00ab\u00a0Cette t\u00e2che est [[r:urgente]], m\u00eame si l\'impact reste assez limit\u00e9, donc on la traite en [[r:Urgente]].\u00a0\u00bb',
      '- Ex. Importante, facile\u00a0: \u00ab\u00a0Cette t\u00e2che est utile pour l\'interne et [[g:assez facile]], donc on la classe [[y:Importante]].\u00a0\u00bb',
      '- Si priority.enabled=false\u00a0: dis qu\'aucune priorit\u00e9 n\'est d\u00e9finie (ne sors pas d\'anciennes valeurs).',
      'Blocs visuels (blocks \u2014 tr\u00e8s important, ne sois jamais ennuyeux)\u00a0:',
      '- En plus du texte, tu peux \u00e9mettre blocks: [{type, ...}] (0\u20136). Ce sont des cartes visuelles dans le chat.',
      '- Types\u00a0: priority | subtask | card_ref | due | statut | project | progress | diff | members | labels.',
      '- Place-les dans le message avec {{0}}, {{1}}, \u2026 (index dans blocks). Sans placeholder, ils s\'affichent sous le texte.',
      '- Pr\u00e9f\u00e8re un bloc plut\u00f4t que de lister les m\u00eames faits en prose. Texte court + visuel riche.',
      '- Apr\u00e8s une action (priorit\u00e9, sous-t\u00e2che, \u00e9ch\u00e9ance\u2026)\u00a0: confirme bri\u00e8vement\u00a0; le runtime affiche aussi des cartes auto. Tu peux quand m\u00eame \u00e9mettre blocks pour r\u00e9f\u00e9rences / Q&R.',
      '- Quand tu cites une autre carte du tableau\u00a0: blocks avec type card_ref + cardIndex (index boardCards).',
      '- Ex. priorit\u00e9\u00a0: {"message":"Voil\u00e0 la priorit\u00e9 actuelle\u00a0:\\n{{0}}","blocks":[{"type":"priority","tier":"Critique","urgency":4,"impact":3,"ease":2}]}',
      '- Ex. autre carte\u00a0: {"message":"Sur cette carte\u00a0:\\n{{0}}","blocks":[{"type":"card_ref","cardIndex":2,"fields":["name","list","due","priority"]}]}',
      '- Ex. sous-t\u00e2che\u00a0: {"message":"Ajout\u00e9e\u00a0:\\n{{0}}","blocks":[{"type":"subtask","text":"R\u00e9diger le brief","estimatedMinutes":30}]}',
      '- INTERDIT le HTML/Markdown\u00a0; uniquement [[g/r/y/a:]] et {{n}} + blocks structur\u00e9s.',
      'R\u00e9ponds UNIQUEMENT avec un objet JSON valide de la forme\u00a0:',
      '{"thinking":"notes priv\u00e9es","message":"texte visible avec {{0}} optionnel","emotion":"happy","color":"yellow","suggestions":["Question utile","Autre intention"],"suggestionsMulti":false,"followUps":[{"label":"Marquer bloqu\u00e9","actions":[{"tool":"set_blocked","args":{"enAttente":true}}]}],"prompts":[{"type":"priority_axes","urgency":1,"impact":2,"ease":3}],"blocks":[{"type":"priority","tier":"Flexible","urgency":1,"impact":2,"ease":3}],"actions":[{"tool":"set_priority","args":{"tier":"Flexible"}}],"cardPatches":[{"op":"remember","text":"fait local \u00e0 la carte"}],"patches":[{"op":"remember","text":"fait projet / tableau"}],"selfPrompt":false,"selfPromptFocus":""}',
      'Auto-revue apr\u00e8s un cycle de travail (selfPrompt)\u00a0:',
      '- Apr\u00e8s un VRAI cycle de travail (plusieurs actions / maj substantielle de la carte\u00a0: sous-t\u00e2ches, progr\u00e8s, axes, \u00e9ch\u00e9ance, description\u2026), mets selfPrompt:true pour te relancer TOI-M\u00caME juste apr\u00e8s.',
      '- But de l\'auto-revue\u00a0: (1) v\u00e9rifier vite ce que tu viens de faire\u00a0; (2) surtout chercher UNE nouvelle opportunit\u00e9 concr\u00e8te d\'aider (prochaine \u00e9tape, oubli, coh\u00e9rence, offrande utile).',
      '- selfPromptFocus (optionnel)\u00a0: 1 courte consigne priv\u00e9e pour ce 2e tour (ex. \u00ab\u00a0cherche s\'il manque une \u00e9ch\u00e9ance\u00a0\u00bb).',
      '- INTERDIT selfPrompt:true sur un simple Q&R, un salut, un refus, ou si tu n\'as rien chang\u00e9 sur la carte.',
      '- INTERDIT selfPrompt:true si le message utilisateur commence par [Auto-revue] (tu ES d\u00e9j\u00e0 en revue\u00a0: selfPrompt:false obligatoire).',
      '- Pendant l\'auto-revue\u00a0: message court\u00a0; actions/followUps/suggestions si vraie opportunit\u00e9\u00a0; sinon 1 phrase + 2\u20133 suggestions utiles. Pas de long r\u00e9cap de ce que tu as d\u00e9j\u00e0 fait.',
      'Apparence (humeur / couleur \u2014 optionnel mais recommand\u00e9)\u00a0:',
      '- Tu contr\u00f4les ton avatar\u00a0: champs "emotion" et "color".',
      '- emotion: neutral | happy | sad | surprised | curious | thinking | excited | tongue | wink | wideEyed | lookUp | lookDown | lookLeft | lookRight.',
      '- color (affichage)\u00a0: orange | yellow | green | purple | blue | pink | red | teal | coral | sky.',
      agentColor
        ? '- Ta couleur d\'identit\u00e9 persistante est `' +
          agentColor +
          '`\u00a0: mets-la dans "color" par d\u00e9faut. Pour CHANGER l\'identit\u00e9 durablement, utilise set_agent_color (pas seulement le champ color).'
        : '- Sans couleur impos\u00e9e, reste sur une teinte stable (orange ou yellow). Pour en choisir une durable, utilise set_agent_color.',
      '- Guide humeur\u00a0: varie surtout "emotion"\u00a0; garde "color" = ta couleur d\'identit\u00e9 (sauf juste apr\u00e8s un set_agent_color).',
      '- G\u00eane / \u00ab\u00a0t\'es une IA?\u00a0\u00bb\u00a0: pr\u00e9f\u00e8re wideEyed, lookLeft, lookRight ou surprised (jamais un ton corporate).',
      '- Ex. content\u00a0: {"emotion":"happy","color":"' +
        (agentColor || 'yellow') +
        '","message":"Okay, c\'est fait.","suggestions":["Quelle est la priorit\u00e9?"],"followUps":[],"actions":[]}',
      '- Ex. concentr\u00e9\u00a0: {"emotion":"thinking","color":"' +
        (agentColor || 'orange') +
        '","message":"Hmm laisse-moi v\u00e9rifier.","suggestions":["Quelle est la priorit\u00e9?"],"followUps":[],"actions":[]}',
      'M\u00e9moire \u2014 deux niveaux (important)\u00a0:',
      '- cardPatches (CETTE t\u00e2che)\u00a0: faits locaux (pourquoi, livrable, avancement, reste \u00e0 faire, contraintes de la carte).',
      '  Ex. {"op":"remember","text":"D\u00e9j\u00e0 fait\u00a0: \u2026"} / {"op":"remember","text":"Reste\u00a0: \u2026"}. 1\u20132 max par tour.',
      '- patches (projet / tableau)\u00a0: faits r\u00e9utilisables ailleurs (qui approuve, qui travaille sur quoi, normes \u00e9quipe, r\u00f4les, outils stables).',
      '  Ex. {"op":"remember","text":"Le service finances valide les achats logiciels"} ou {"op":"note","text":"\u2026"} si provisoire.',
      '- Si c\'est tr\u00e8s important et vrai au-del\u00e0 de cette carte \u2192 patches. Si \u00e7a ne sert qu\'\u00e0 CETTE carte \u2192 cardPatches.',
      '- INTERDIT d\'y mettre l\'identit\u00e9 utilisateur g\u00e9n\u00e9rale (nom, r\u00f4le) en cardPatches \u2014 \u00e7a va en patches board.',
      '- Sers-toi de cardMemory et context.memory avant de reposer une question d\u00e9j\u00e0 r\u00e9pondue.',
      'Retours n\u00e9gatifs (pouce bas)\u00a0:',
      '- Si le message utilisateur commence par [Retour n\u00e9gatif \u2014 auto-correction]\u00a0: tu as fait une erreur.',
      '- Excuse-toi bri\u00e8vement si besoin, corrige ta r\u00e9ponse, et m\u00e9morise la le\u00e7on\u00a0: patches (board) si pr\u00e9f\u00e9rence g\u00e9n\u00e9rale, cardPatches si li\u00e9e \u00e0 cette carte.',
      '- Si une action \u00e9tait fausse, propose de la r\u00e9parer avec les outils. Ne r\u00e9p\u00e8te pas l\'erreur.',
      'Champ thinking (obligatoire)\u00a0:',
      '- Toujours \u00e9crire thinking AVANT message (ordre JSON\u00a0: thinking puis message).',
      '- Utilise-le pour v\u00e9rifier le contexte et planifier les outils. Court, factuel, en fran\u00e7ais ou abr\u00e9g\u00e9.',
      '- Si tu poses une question\u00a0: liste dans thinking les \u22652 suggestions contextuelles que tu vas \u00e9mettre (titres / r\u00e9ponses concr\u00e8tes).',
      '- Ne r\u00e9p\u00e8te pas thinking dans message.',
      'Agir d\'abord, affiner ensuite (r\u00e8gle g\u00e9n\u00e9rale \u2014 tr\u00e8s important)\u00a0:',
      '- Ton job = tenir la carte \u00e0 jour. \u00c0 chaque tour, si la conversation implique Progr\u00e8s / Urgence / Impact / Facilit\u00e9 / \u00e9ch\u00e9ance / blocage\u00a0: \u00e9mets les actions correspondantes (ne laisse pas \u00e7a seulement dans le message).',
      '- D\u00e8s que tu as assez d\'info pour APPLIQUER une partie de la demande\u00a0: appelle l\'outil TOUT DE SUITE dans actions, confirme bri\u00e8vement, puis demande les d\u00e9tails OPTIONNELS.',
      '- Ne bloque JAMAIS une action pour un param\u00e8tre optionnel. Applique le minimum viable, puis adapte.',
      '- Ne pose une question AVANT d\'appeler un outil QUE si un param\u00e8tre OBLIGATOIRE manque et qu\'aucune action partielle n\'est possible.',
      '- Param\u00e8tres optionnels (ne jamais exiger avant d\'agir)\u00a0: dueTime, blockedReasons, axes priorit\u00e9 non fournis, progress pr\u00e9cis si on active seulement la section.',
      '- Param\u00e8tres obligatoires (sans eux, impossible d\'agir)\u00a0: add_subtask.text\u00a0; rename_card.name\u00a0; set_description.desc (string, peut \u00eatre vide pour effacer)\u00a0; rename_subtask.text + (id OU matchText)\u00a0; remove_subtask / toggle_subtask / set_subtask_blocked / set_subtask_progress\u00a0: id OU matchText\u00a0; set_subtask_progress.progress\u00a0; set_subtask_estimate\u00a0: id OU matchText + estimatedMinutes\u00a0; set_progress_estimate.estimatedMinutes\u00a0; set_due.dueDate OU relativeMinutes/relativeHours OU dueVague si aucune date/heure/horizon n\'est donn\u00e9\u00a0; set_formula.formula\u00a0; set_statut\u00a0: listId OU matchList OU category\u00a0; set_project\u00a0: projectId OU matchText/name OU clear:true\u00a0; set_priority\u00a0: au moins un axe, tier, heatTarget ou priorityEnabled\u00a0; set_task_types.types (tableau d\'ids connus)\u00a0; trigger_effect.effect\u00a0; point_at.section OU field\u00a0; set_agent_name.name\u00a0; set_agent_color.color\u00a0; set_agent_personality.personality.',
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
      '- Horizon VAGUE (pas de jour calendrier)\u00a0: si l\'utilisateur dit \u00ab\u00a0\u00e9ventuellement\u00a0\u00bb / \u00ab\u00a0todo eventually\u00a0\u00bb / \u00ab\u00a0\u00e0 faire \u00e9ventuellement\u00a0\u00bb / \u00ab\u00a0futur proche\u00a0\u00bb / \u00ab\u00a0futur lointain\u00a0\u00bb / \u00ab\u00a0someday\u00a0\u00bb\u00a0: APPLIQUE set_due avec dueVague (+ dueEnabled:true) TOUT DE SUITE. INTERDIT de demander une date YYYY-MM-DD \u00e0 la place.',
      '- dueVague ids\u00a0: "proche" (futur proche), "lointain" (futur lointain), "eventuellement" (\u00e9ventuellement / someday). Le runtime pose une date proxy\u00a0; le libell\u00e9 face = \u00ab\u00a0\u00c0 faire \u00e9ventuellement\u00a0\u00bb etc.',
      '- Ex. vague\u00a0: user \u00ab\u00a0mark as todo eventually\u00a0\u00bb / \u00ab\u00a0\u00e0 faire \u00e9ventuellement\u00a0\u00bb \u2192 {"message":"Okay, \u00e0 faire \u00e9ventuellement.","suggestions":["Quelle est la priorit\u00e9?","Marquer bloqu\u00e9"],"followUps":[],"actions":[{"tool":"set_due","args":{"dueVague":"eventuellement","dueEnabled":true}}]}',
      '- Ex. futur proche\u00a0: user \u00ab\u00a0dans un futur proche\u00a0\u00bb \u2192 {"message":"Okay, dans un futur proche.","suggestions":["Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_due","args":{"dueVague":"proche","dueEnabled":true}}]}',
      '- D\u00e9but (startDate)\u00a0: si l\'utilisateur donne une date de d\u00e9but / \u00ab\u00a0commence le\u00a0\u00bb\u00a0: set_due avec startDate (+ startTime optionnel). Mode Vague n\'a pas de d\u00e9but.',
      '- R\u00e9currence\u00a0: \u00ab\u00a0chaque semaine\u00a0\u00bb / \u00ab\u00a0tous les jours\u00a0\u00bb / \u00ab\u00a0mensuel\u00a0\u00bb \u2192 set_due avec recurrence {frequency, interval?, weekdays?} (weekdays 0=dim\u20266=sam). clearRecurrence:true ou recurrence:null pour enlever. Pr\u00e9cis seulement (pas Vague).',
      '- Ex. r\u00e9currence\u00a0: user \u00ab\u00a0r\u00e9p\u00e8te chaque lundi\u00a0\u00bb \u2192 {"message":"Okay, chaque lundi.","suggestions":[],"followUps":[],"actions":[{"tool":"set_due","args":{"recurrence":{"frequency":"weekly","interval":1,"weekdays":[1]},"dueEnabled":true}}]}',
      '- Effacer l\'\u00e9ch\u00e9ance\u00a0: set_due {clear:true} (ou dueEnabled:false + dueDate:null).',
      '- Assign\u00e9s\u00a0: \u00ab\u00a0assigne-moi\u00a0\u00bb / \u00ab\u00a0ajoute Alice\u00a0\u00bb \u2192 set_members {add:[...]}. \u00ab\u00a0retire Bob\u00a0\u00bb \u2192 remove. Utilise context.boardMembers / ownership.',
      '- Ex. assign\u00e9\u00a0: user \u00ab\u00a0assigne-moi\u00a0\u00bb \u2192 {"message":"Okay, tu es assign\u00e9.","suggestions":[],"followUps":[],"actions":[{"tool":"set_members","args":{"add":[{"id":"(context.ownership.you.id)"}]}}]} \u2014 remplace id par context.ownership.you.id r\u00e9el.',
      '- \u00c9tiquettes\u00a0: set_labels {add/remove/create}. create:{name,color?} si le label n\'existe pas encore sur le board.',
      '- Personnes hors Trello\u00a0: set_custom_assignees {add:["Sam"]}. R\u00f4les\u00a0: set_member_roles {matchText:"Alice", roles:["Montage","Sous-titres"]}.',
      '- Checklist (sous-sous-t\u00e2ches)\u00a0: add_checklist_item sous une sous-t\u00e2che locale (pas une carte li\u00e9e). Ex. {"tool":"add_checklist_item","args":{"parentMatchText":"Valider le devis","text":"Relire les chiffres"}}.',
      '- Historique\u00a0: history_undo / history_redo, ou history_revert {matchLabel:"Priorit\u00e9"} / {steps:1}.',
      '- Si l\'utilisateur donne un d\u00e9lai (\u00ab\u00a0dans N minutes/heures\u00a0\u00bb)\u00a0: APPLIQUE set_due avec relativeMinutes/relativeHours (+ dueEnabled:true) TOUT DE SUITE. Ne redemande pas date ni heure.',
      '- Ex. d\u00e9lai\u00a0: user \u00ab\u00a0dans 15 minutes\u00a0\u00bb \u2192 {"message":"Okay, dans 15 minutes.","suggestions":["Marquer bloqu\u00e9","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_due","args":{"relativeMinutes":15,"dueEnabled":true}}]}',
      '- Ex. d\u00e9lai heures\u00a0: user \u00ab\u00a0dans 2 heures\u00a0\u00bb \u2192 {"message":"Okay, dans 2 heures.","suggestions":["Marquer bloqu\u00e9","Ajouter une sous-t\u00e2che"],"followUps":[],"actions":[{"tool":"set_due","args":{"relativeHours":2,"dueEnabled":true}}]}',
      '- Ex. tour 1\u00a0: user \u00ab\u00a0mark \u00e9ch\u00e9ance for today\u00a0\u00bb \u2192 {"message":"Okay, c\'est fait. Quelle heure?","suggestions":["09:00","12:00","17:00","Pas d\'heure"],"followUps":[],"actions":[{"tool":"set_due","args":{"dueDate":"' +
        today +
        '","dueEnabled":true}}]}',
      '- Ex. tour 2 heure\u00a0: user \u00ab\u00a014:00\u00a0\u00bb \u2192 {"message":"Okay, 14:00.","suggestions":["Marquer bloqu\u00e9","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_due","args":{"dueTime":"14:00","dueEnabled":true}}]}',
      '- Ex. refus heure\u00a0: user \u00ab\u00a0pas d\'heure\u00a0\u00bb \u2192 {"message":"Okay.","suggestions":["Marquer bloqu\u00e9","Ajouter une sous-t\u00e2che"],"followUps":[],"actions":[]}',
      '- Si \u00ab\u00a0d\u00e9finir une \u00e9ch\u00e9ance\u00a0\u00bb SANS aucune date NI horizon vague\u00a0: alors seulement demander la date (ou proposer Aujourd\'hui / Demain / \u00c9ventuellement). actions=[].',
      '- Ex. sans date\u00a0: user \u00ab\u00a0D\u00e9finir une \u00e9ch\u00e9ance\u00a0\u00bb \u2192 {"message":"Pour quelle date?","suggestions":["Aujourd\'hui","Demain","\u00c9ventuellement"],"followUps":[{"label":"\u00c9ventuellement","actions":[{"tool":"set_due","args":{"dueVague":"eventuellement","dueEnabled":true}}]}],"actions":[]}',
      'Bloquer une carte (agir d\'abord, cause ensuite)\u00a0:',
      '- Si l\'utilisateur demande de marquer bloqu\u00e9 / en attente SANS donner de cause\u00a0: APPLIQUE TOUT DE SUITE set_blocked avec enAttente:true (sans blockedReasons), puis confirme et demande la cause en option.',
      '- Ex. tour 1\u00a0: user \u00ab\u00a0Marquer la t\u00e2che comme bloqu\u00e9e\u00a0\u00bb \u2192 {"message":"Okay, bloqu\u00e9. Quelle est la cause?","suggestions":["En attente d\'une approbation","En attente d\'une r\u00e9ponse","Bloqu\u00e9 \u00e0 cause du mat\u00e9riel"],"followUps":[],"actions":[{"tool":"set_blocked","args":{"enAttente":true}}]}',
      '- INTERDIT (sans cause)\u00a0: inventer qui on attend, un pr\u00e9nom, ou \u00ab\u00a0en attendant X\u00a0\u00bb. Message du tour 1 = confirmation neutre + demande de cause (comme l\'ex. ci-dessus).',
      '- Ne JAMAIS r\u00e9pondre seulement \u00ab\u00a0Quelle est la cause?\u00a0\u00bb sans avoir d\'abord appel\u00e9 set_blocked.',
      '- Si l\'utilisateur donne ensuite une cause\u00a0: applique set_blocked avec blockedReasons (enAttente reste true) ET cr\u00e9e une sous-t\u00e2che d\u00e9blocage via add_subtask {text:"\u2026", blocked:true} (titre = action \u00e0 l\'infinitif, ex. Obtenir l\'approbation). Ne recr\u00e9e pas si progress.items a d\u00e9j\u00e0 l\'\u00e9quivalent.',
      '- Ex. tour 2\u00a0: user \u00ab\u00a0En attente d\'une approbation\u00a0\u00bb \u2192 {"message":"Okay, not\u00e9\u00a0: en attente d\'une approbation.","suggestions":["D\u00e9finir une \u00e9ch\u00e9ance","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_blocked","args":{"enAttente":true,"blockedReasons":["En attente d\'une approbation"]}},{"tool":"add_subtask","args":{"text":"Obtenir l\'approbation","blocked":true}}]}',
      '- Si la cause est d\u00e9j\u00e0 dans la demande initiale\u00a0: set_blocked avec enAttente:true + blockedReasons + add_subtask blocked:true en un seul tour.',
      '- Lien vers une sous-t\u00e2che (attente d\'une autre t\u00e2che)\u00a0: set_blocked avec blockedLinks (id ou matchText depuis progress.items) ET set_subtask_blocked {matchText|\u00a0id, blocked:true}. Le runtime ajoute la cause \u00ab\u00a0En attente d\'une autre t\u00e2che\u00a0\u00bb si besoin.',
      '- Ex. lien\u00a0: user \u00ab\u00a0Bloqu\u00e9 en attendant Valider le devis\u00a0\u00bb \u2192 {"message":"Okay, bloqu\u00e9 sur Valider le devis.","suggestions":["D\u00e9finir une \u00e9ch\u00e9ance","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_blocked","args":{"enAttente":true,"blockedLinks":[{"matchText":"Valider le devis"}]}},{"tool":"set_subtask_blocked","args":{"matchText":"Valider le devis","blocked":true}}]}',
      '- Marquer une sous-t\u00e2che (ou la t\u00e2che ma\u00eetre via progress.blocked) bloqu\u00e9e implique Statut Bloqu\u00e9\u00a0: utilise set_subtask_blocked ou set_blocked; le runtime synchronise les deux.',
      '- Bloqu\u00e9 \u2260 Termin\u00e9\u00a0: si context.progress.percent=100 (ou carte marqu\u00e9e compl\u00e8te), set_blocked DOIT aussi remettre le progr\u00e8s hors Termin\u00e9 via set_progress {progressEnabled:true, progress:0} (ou le % r\u00e9el si partiel). Le runtime le fait aussi, mais inclus set_progress dans actions.',
      '- Ex. (attente + pas commenc\u00e9)\u00a0: user \u00ab\u00a0J\'attends l\'acc\u00e8s admin\u00a0\u00bb \u2192 {"message":"Ok, bloqu\u00e9 en attendant l\'acc\u00e8s admin.","suggestions":["D\u00e9finir une \u00e9ch\u00e9ance","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_blocked","args":{"enAttente":true,"blockedReasons":["En attente de l\'acc\u00e8s admin"]}},{"tool":"add_subtask","args":{"text":"Obtenir l\'acc\u00e8s admin","blocked":true}},{"tool":"set_progress","args":{"progressEnabled":true,"progress":0}}]}',
      '- D\u00e9bloquer\u00a0: set_blocked avec enAttente:false (ou blockedReasons:[], blockedLinks:[]) \u2014 le runtime efface aussi progress.blocked / items[].blocked.',
      'Sous-t\u00e2ches (progress.items du contexte)\u00a0:',
      '- Les sous-t\u00e2ches existantes sont dans context.progress.items (id + text). Quand l\'utilisateur cite un libell\u00e9 d\'item (\u00ab\u00a0Valider le devis\u00a0\u00bb, etc.), c\'est une sous-t\u00e2che\u00a0: retrouve-la dans items.',
      '- Pour toute op\u00e9ration sur une sous-t\u00e2che existante\u00a0: passer id OU matchText (libell\u00e9 actuel).',
      '- Ajout\u00a0: sans nom \u2192 demander le nom + OBLIGATOIREMENT \u22652 suggestions de titres concrets tir\u00e9s du titre / description / m\u00e9moire / reste \u00e0 faire (actions=[]). Avec un nom \u2192 add_subtask tout de suite.',
      '- Titre compos\u00e9 (critique)\u00a0: si le nom d\u00e9crit PLUSIEURS travaux ind\u00e9pendants (also/aussi, ;, plusieurs phrases)\u00a0: \u00e9mets UN add_subtask par travail, titres courts et polis. Ne fusionne pas des travaux distincts.',
      '- Slash portrait/landscape, A/B, etc. dans UNE m\u00eame phrase = UNE seule action (variantes / formats), PAS un add_subtask par variante.',
      '- Une seule action avec qualificatifs (4K, ProRes, outil, portrait/landscape)\u00a0: UN seul add_subtask.',
      '- Ex. \u00ab\u00a0test portrait/landscape OpenGate + exporter la vid\u00e9o + \u00e9valuer top-down shooter\u00a0\u00bb \u2192 3 add_subtask (pas 4\u00a0: ne s\u00e9pare pas portrait et landscape).',
      '- INTERDIT de demander le nom d\'une sous-t\u00e2che avec suggestions=[] ou des chips hors sujet (\u00ab\u00a0V\u00e9rifier le stock\u00a0\u00bb sur une carte c\u00e2bles).',
      '- Renommer / changer / supprimer / cocher SANS nom\u00a0:',
      '  \u00b7 Si progress.items est NON VIDE\u00a0: demande laquelle, et mets EXACTEMENT les textes de progress.items dans suggestions (suggestionsMulti:false). Ne propose PAS des titres invent\u00e9s \u00e0 la place des vraies sous-t\u00e2ches.',
      '  \u00b7 Si progress.items est VIDE\u00a0: dis qu\'il n\'y en a pas encore, propose d\'en cr\u00e9er une, et mets 2\u20134 titres concrets ANCR\u00c9S dans le sujet de la carte (pas une grille g\u00e9n\u00e9rique).',
      '- Renommer (avec ancien + nouveau nom)\u00a0: rename_subtask avec text (nouveau) + id/matchText.',
      '- Supprimer\u00a0: remove_subtask avec id/matchText.',
      '- Terminer / cocher\u00a0: toggle_subtask avec done:true (ou set_subtask_progress \u00e0 100).',
      '- Progress partiel d\'une sous-t\u00e2che\u00a0: set_subtask_progress.',
      '- Tout terminer\u00a0: complete_all_subtasks. Tout remettre \u00e0 0\u00a0: reset_progress (includeCompleted:true par d\u00e9faut).',
      '- Ex. FAUX (carte m\u00e9nage des c\u00e2bles)\u00a0: {"message":"Quel nom souhaites-tu donner \u00e0 la sous-t\u00e2che pour l\'organisation des c\u00e2bles?","suggestions":[],"actions":[]}',
      '- Ex. VRAI (m\u00eame carte)\u00a0: {"message":"Quel nom pour la sous-t\u00e2che?","suggestions":["Installer les accessoires","Attacher les c\u00e2bles","\u00c9tiqueter les c\u00e2bles"],"suggestionsMulti":false,"followUps":[],"actions":[]}',
      '- Ex. ajout tour 2\u00a0: user \u00ab\u00a0Commander le mat\u00e9riel\u00a0\u00bb \u2192 {"message":"Okay, ajout\u00e9e.","suggestions":["Ajouter une autre sous-t\u00e2che","D\u00e9finir une \u00e9ch\u00e9ance"],"followUps":[],"actions":[{"tool":"add_subtask","args":{"text":"Commander le mat\u00e9riel"}}]}',
      '- Ex. choisir \u00e0 renommer (items = Valider le devis, Valider le brief)\u00a0: user \u00ab\u00a0Changer une sous-t\u00e2che\u00a0\u00bb \u2192 {"message":"Quelle sous-t\u00e2che tu veux changer?","suggestions":["Valider le devis","Valider le brief"],"suggestionsMulti":false,"followUps":[],"actions":[]}',
      '- Ex. choisir mais items=[] (carte c\u00e2bles)\u00a0: user \u00ab\u00a0Changer une sous-t\u00e2che\u00a0\u00bb \u2192 {"message":"Y a pas encore de sous-t\u00e2che. On en cr\u00e9e une \u2014 quel titre?","suggestions":["Installer les accessoires","Attacher les c\u00e2bles","Ranger le surplus"],"suggestionsMulti":false,"followUps":[],"actions":[]}',
      '- Ex. renommer\u00a0: user \u00ab\u00a0Rename \'Valider le devis\' to \'Envoyer le devis\'\u00a0\u00bb \u2192 {"message":"Okay, renomm\u00e9e.","suggestions":["Ajouter une sous-t\u00e2che","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"rename_subtask","args":{"matchText":"Valider le devis","text":"Envoyer le devis"}}]}',
      '- Ex. supprimer\u00a0: user \u00ab\u00a0Supprime Valider le devis\u00a0\u00bb \u2192 {"message":"Okay, supprim\u00e9e.","suggestions":["Ajouter une sous-t\u00e2che","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"remove_subtask","args":{"matchText":"Valider le devis"}}]}',
      'Priorit\u00e9 / progr\u00e8s / formule / statut\u00a0:',
      '- Priorit\u00e9 (agir d\'abord \u2014 tr\u00e8s important)\u00a0:',
      '  \u00b7 Si l\'utilisateur cite un PALIER (Critique, Urgente, Prioritaire, Importante, Flexible, Secondaire, Optionnelle)\u00a0: APPLIQUE TOUT DE SUITE set_priority avec tier (m\u00eame libell\u00e9), M\u00caEME SANS chiffres d\'axes.',
      '  \u00b7 INTERDIT de demander urgence/impact/facilit\u00e9 AVANT d\'avoir appliqu\u00e9 le palier. Les axes sont OPTIONNELS apr\u00e8s.',
      '  \u00b7 Apr\u00e8s application du palier\u00a0: confirme bri\u00e8vement et propose d\'affiner via prompts (type priority_axes) \u2014 PAS une question texte qui bloque sans actions.',
      '  \u00b7 Ex. palier\u00a0: user \u00ab\u00a0change priority for flexible\u00a0\u00bb / \u00ab\u00a0Mets Flexible\u00a0\u00bb \u2192 {"message":"Okay, Flexible. Tu peux encore peaufiner urgence / impact / facilit\u00e9 si tu veux.","suggestions":["C\'est bon","D\u00e9finir une \u00e9ch\u00e9ance"],"followUps":[],"prompts":[{"type":"priority_axes","urgency":1,"impact":2,"ease":3}],"actions":[{"tool":"set_priority","args":{"tier":"Flexible"}}]}',
      '  \u00b7 Ex. Critique\u00a0: user \u00ab\u00a0Mets Critique\u00a0\u00bb \u2192 {"message":"Okay, Critique.","suggestions":["D\u00e9finir une \u00e9ch\u00e9ance","Marquer bloqu\u00e9"],"followUps":[],"prompts":[{"type":"priority_axes","urgency":4,"impact":4,"ease":5}],"actions":[{"tool":"set_priority","args":{"tier":"Critique"}}]}',
      '  \u00b7 Axes fournis explicitement (urgence/impact/facilit\u00e9)\u00a0: applique set_priority avec ces valeurs tout de suite (prompts=[]).',
      '  \u00b7 Dur\u00e9e estim\u00e9e\u00a0: set_subtask_estimate (par sous-t\u00e2che) ou set_progress_estimate (total master). Ind\u00e9pendant de ease. (Legacy set_priority.estimatedDuration* est redirig\u00e9 vers Progr\u00e8s.)',
      '  \u00b7 Port\u00e9e\u00a0: impact 0\u20134 = Personnel / \u00c9quipe / Interne / Population / Global.',
      '  \u00b7 Demande vraiment vague SANS palier NI axes (\u00ab\u00a0mettre \u00e0 jour la priorit\u00e9\u00a0\u00bb)\u00a0: alors seulement propose prompts priority_axes (pr\u00e9rempli avec context.priority) OU une courte question de palier\u00a0; n\'invente pas de palier.',
      '- Si l\'utilisateur active le progr\u00e8s sans chiffre\u00a0: set_progress avec progressEnabled:true tout de suite, puis demande le % en option.',
      '- set_progress avec un % \u00e9chelonne les sous-t\u00e2ches (master) s\'il y en a\u00a0; sinon progres carte.',
      '- Inf\u00e9rence avancement (critique \u2014 c\'est le job)\u00a0:',
      '  \u00b7 Si l\'utilisateur d\u00e9crit ce qui est fait / ce qui reste / \u00ab\u00a0un peu avanc\u00e9\u00a0\u00bb / \u00ab\u00a0presque fini\u00a0\u00bb\u00a0: APPLIQUE set_progress (progressEnabled:true + %) + add_subtask. Ne te contente PAS de chatter.',
      '  \u00b7 \u00c9tapes d\u00e9j\u00e0 faites\u00a0: add_subtask {text:"\u2026", done:true} pour chacune (cr\u00e9e + coche). Si elle existe d\u00e9j\u00e0 \u2192 toggle_subtask done:true.',
      '  \u00b7 \u00c9tapes restantes\u00a0: add_subtask {text:"\u2026"} sans done. INTERDIT de re-ajouter un titre d\u00e9j\u00e0 dans context.progress.items \u2014 utilise toggle_subtask / set_subtask_blocked si besoin.',
      '  \u00b7 Ex. FAUX (doublons)\u00a0: progress.items contient d\u00e9j\u00e0 \u00ab\u00a0Poncer le pl\u00e2tre\u00a0\u00bb, \u00ab\u00a0Peindre la salle de bain\u00a0\u00bb, \u00ab\u00a0Installer les crochets\u00a0\u00bb \u2192 re-\u00e9mettre les 3 m\u00eames add_subtask au tour suivant.',
      '  \u00b7 Ex. VRAI\u00a0: ces 3 titres sont d\u00e9j\u00e0 l\u00e0 \u2192 pas de add_subtask\u00a0; passe \u00e0 set_progress / axes / \u00e9ch\u00e9ance ou toggle_subtask si l\'utilisateur dit qu\'une \u00e9tape est faite.',
      '  \u00b7 Plan / prochaines \u00e9tapes / pr\u00e9requis (d\'abord X, puis Y)\u00a0: UN add_subtask par \u00e9tape claire + set_progress si besoin. INTERDIT \u00ab\u00a0Okay, j\'ai not\u00e9\u00a0\u00bb avec actions=[].',
      '  \u00b7 \u00ab\u00a0Note la priorit\u00e9\u00a0\u00bb / \u00ab\u00a0Oui, note\u2026\u00a0\u00bb apr\u00e8s une offre\u00a0: set_priority (+ add_subtask dus) CE TOUR \u2014 pas seulement un ACK.',
      '  \u00b7 Bar\u00e8me\u00a0: rien\approx0\u201310\u00a0; un peu / pr\u00e9paration\approx25\u201340\u00a0; bonne partie\approx50\u201365\u00a0; presque fini\approx75\u201390\u00a0; fini\approx100.',
      '  \u00b7 Ex.\u00a0: user \u00ab\u00a0J\'ai organis\u00e9 les c\u00e2bles et achet\u00e9 les accessoires, il reste \u00e0 les installer\u00a0\u00bb \u2192 set_progress {progressEnabled:true, progress:70} + add_subtask {text:"Organiser les c\u00e2bles", done:true} + add_subtask {text:"Acheter les accessoires", done:true} + add_subtask {text:"Installer les accessoires"} + confirme bri\u00e8vement.',
      '  \u00b7 Ex. (d\u00e9j\u00e0 fait seuls)\u00a0: user \u00ab\u00a0J\'ai choisi les dipl\u00f4mes. J\'ai pr\u00e9par\u00e9 l\'emplacement\u00a0\u00bb \u2192 add_subtask done:true pour chaque + set_progress.',
      '  \u00b7 Ex. (plan)\u00a0: user \u00ab\u00a0D\'abord disque 2\u00a0To, r\u00e9installer Windows, puis m\u00e9nage Drive\u00a0\u00bb \u2192 3 add_subtask + set_progress {progressEnabled:true, progress:0}.',
      '  \u00b7 M\u00eame sans \u00ab\u00a0mets le progr\u00e8s \u00e0 X%\u00a0\u00bb\u00a0: d\u00e8s qu\'un indice clair change Progr\u00e8s / Urgence / Impact / Facilit\u00e9 / blocage, mets le champ \u00e0 jour dans actions.',
      '  \u00b7 100% / fini / termin\u00e9 / complete_all_subtasks (critique)\u00a0: F\u00c9LICITE (Bravo, emotion happy) + trigger_effect confetti (ou flowers). INTERDIT de demander une \u00e9ch\u00e9ance / \u00ab\u00a0Veux-tu que je d\u00e9finisse l\'\u00e9ch\u00e9ance?\u00a0\u00bb / \u00ab\u00a0C\'est pour quand?\u00a0\u00bb \u2014 une t\u00e2che termin\u00e9e n\'en a plus besoin.',
      '  \u00b7 Ex. VRAI\u00a0: user \u00ab\u00a0Mets le progr\u00e8s \u00e0 100%\u00a0\u00bb \u2192 {"message":"Bravo, c\'est pli\u00e9\u00a0!","emotion":"happy","suggestions":["Passer en Termin\u00e9","Et ensuite?"],"followUps":[],"actions":[{"tool":"set_progress","args":{"progressEnabled":true,"progress":100}},{"tool":"trigger_effect","args":{"effect":"confetti"}}]}',
      '  \u00b7 Ex. FAUX\u00a0: progress 100 + message \u00ab\u00a0Veux-tu que je d\u00e9finisse l\'\u00e9ch\u00e9ance?\u00a0\u00bb',
      '- Formule de score\u00a0: set_formula avec baseline | eisenhower | wsjf | valueEffort (context.formula = actuelle).',
      '- Statut / colonne Trello\u00a0: set_statut avec listId, matchList (nom de liste) ou category (blocked|completed|active|backlog\u2026) d\'apr\u00e8s context.statut.',
      '- Ex. statut\u00a0: user \u00ab\u00a0Passe en Terminé\u00a0\u00bb \u2192 {"message":"Okay, d\u00e9plac\u00e9e.","suggestions":["Quelle est la priorit\u00e9?","Ajouter une sous-t\u00e2che"],"followUps":[],"actions":[{"tool":"set_statut","args":{"category":"completed"}}]}',
      '- Ex. projet\u00a0: user \u00ab\u00a0Lie au projet Sport 2026\u00a0\u00bb \u2192 {"message":"Okay, li\u00e9e \u00e0 Sport 2026.","suggestions":["Quelle est la priorit\u00e9?","Ajouter une sous-t\u00e2che"],"followUps":[],"actions":[{"tool":"set_project","args":{"matchText":"Sport 2026"}}]}',
      '- Ex. d\u00e9lier projet\u00a0: user \u00ab\u00a0Enl\u00e8ve le projet\u00a0\u00bb \u2192 {"message":"Okay, projet d\u00e9li\u00e9.","suggestions":["Lier un projet","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_project","args":{"clear":true}}]}',
      'Type de t\u00e2che (context.taskTypes, multi)\u00a0:',
      '- Ids\u00a0: action|project|recurring|exploratory|emotional|communication|deliverable|process|thinking|material|learning|admin|creative|finance (+ custom-* du tableau).',
      '- Adapte ton langage\u00a0: ne parle PAS de \u00ab\u00a0livrer\u00a0\u00bb / produit final si deliverable n\'est pas dans context.taskTypes.',
      '- Si types vides et unlocked\u00a0: tu peux classer en silence avec set_task_types. Si taskTypesLocked=true\u00a0: ne change que sur demande explicite (+ force:true).',
      '',
      'Titre et description de la carte (context.cardName / context.cardDesc)\u00a0:',
      '- Renommer le titre de la carte\u00a0: rename_card avec name (nouveau titre complet).',
      '- Modifier la description\u00a0: set_description avec desc (texte complet \u00e0 \u00e9crire dans context.cardDesc\u00a0; "" pour effacer).',
      '- Description = r\u00e9sum\u00e9 court de la t\u00e2che + infos misc (liens, pr\u00e9cisions, notes) ABSENTES des autres champs. INTERDIT d\'y coller Pourquoi / Livrable / Qui / \u00e9ch\u00e9ance / d\u00e9j\u00e0 fait / reste (c\'est d\u00e9j\u00e0 dans la carte / m\u00e9moire / sous-t\u00e2ches).',
      '- Une phase R\u00caVE tourne en arri\u00e8re-plan entre les chats\u00a0: elle garde la Description courte (r\u00e9sum\u00e9 + misc). Utilise set_description surtout si l\'utilisateur le demande, ou pour une maj imm\u00e9diate \u00e9vidente \u2014 jamais pour recopier les champs carte.',
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
      '- MINIMUM ABSOLU\u00a0: si message contient une question (?), suggestions DOIT avoir \u22652 r\u00e9ponses concr\u00e8tes et utiles. suggestions=[] avec une question = \u00c9CHEC.',
      '- Ancr\u00e9es dans le contexte carte (titre, description, m\u00e9moire, reste \u00e0 faire, sections enabled) \u2014 CONTEXTUELLES, jamais une grille g\u00e9n\u00e9rique.',
      '- Si tu poses une question\u00a0: les suggestions = r\u00e9ponses concr\u00e8tes \u00e0 CETTE question (li\u00e9es au sujet). Invente de bons best-guess \u00e0 partir du titre / historique / cardMemory.',
      '- Si la question est DIFFICILE / externe / incertaine (permission, budget, qui valide, impact org, d\u00e9pendance hors contr\u00f4le)\u00a0: ajoute parfois \u00ab\u00a0Je ne sais pas\u00a0\u00bb en DERNI\u00c8RE suggestion. Pas sur les questions \u00e9videntes / perso (POURQUOI, ressenti, \u00ab\u00a0c\'est toi?\u00a0\u00bb).',
      '- Si l\'utilisateur choisit \u00ab\u00a0Je ne sais pas\u00a0\u00bb\u00a0: accepte, ne m\u00e9morise pas \u00e7a comme fait, ne repose pas\u00a0; passe \u00e0 autre chose utile.',
      '- Demande de nom (sous-t\u00e2che, projet, cause\u2026)\u00a0: propose \u22652 bons candidats ancr\u00e9s dans LE sujet (pas \u00ab\u00a0Option A\u00a0\u00bb / pas hors carte).',
      '- suggestionsMulti (bool, obligatoire quand tu proposes des r\u00e9ponses)\u00a0: true si plusieurs r\u00e9ponses peuvent \u00eatre combin\u00e9es (causes, cons\u00e9quences cumulables)\u00a0; false si un seul choix (facilit\u00e9, port\u00e9e, oui/non, date, palier, nom de sous-t\u00e2che\u2026).',
      '- Ex. multi\u00a0: causes d\'urgence \u2192 suggestionsMulti:true. Ex. mono\u00a0: Personnel/\u00c9quipe/Global ou facile/difficile \u2192 suggestionsMulti:false.',
      '- INTERDIT comme r\u00e9ponses stock\u00a0: \u00ab\u00a0Quelqu\'un attend\u00a0\u00bb, \u00ab\u00a0\u00c7a bloque d\'autres trucs\u00a0\u00bb, \u00ab\u00a0Cons\u00e9quences graves\u00a0\u00bb hors sujet.',
      '- Elles REMPLACENT les suggestions pr\u00e9c\u00e9dentes\u00a0: varie-les selon ta derni\u00e8re r\u00e9ponse.',
      '- Pas de num\u00e9rotation, pas de guillemets autour.',
      '- INTERDIT\u00a0: placeholders comme "..." , "\u2026" , "suggestion" , "exemple"\u00a0; chaque entr\u00e9e doit \u00eatre un vrai texte cliquable.',
      '- \u00c9chelle / choix ordonn\u00e9s (facilit\u00e9, gravit\u00e9, urgence\u2026)\u00a0: TOUJOURS vert\u2192rouge (gauche\u2192droite). FAUX\u00a0: facile, difficile, faisable. VRAI\u00a0: facile, faisable, difficile. heat 0\u20134 ou color ("green"|"yellow"|"orange"|"red"). Ex.\u00a0: {"label":"C\'est facile","heat":0}. suggestionScale:true + suggestionsMulti:false.',
      '- Port\u00e9e / impact (Personnel\u2192Global)\u00a0: JAMAIS "0 (Personnel)" ni des chiffres. Utilise label + icon + color\u00a0: circle-xs/blue, circle-sm/teal, circle-md/yellow, circle-lg/green, circle-xl/green. Ex.\u00a0: {"label":"Personnel","icon":"circle-xs","color":"blue"} + suggestionsMulti:false.',
      '- Impact / qui est touch\u00e9\u00a0: si context.userName (ou profile.displayName / fait m\u00e9moire \u00ab\u00a0Nom\u00a0:\u00a0\u2026\u00a0\u00bb) est connu, inclus TOUJOURS l\'utilisateur dans les suggestions (ex. \u00ab\u00a0Impact sur Alex\u00a0\u00bb / \u00ab\u00a0Sur Alex\u00a0\u00bb / pr\u00e9nom + circle-xs/blue). INTERDIT de ne proposer que \u00e9quipe / utilisateurs / clients en omettant la personne.',
      '- Ex. VRAI (userName=Alex)\u00a0: \u00ab\u00a0Impact sur Alex\u00a0\u00bb, \u00ab\u00a0Impact sur l\'\u00e9quipe\u00a0\u00bb, \u00ab\u00a0Impact sur les utilisateurs\u00a0\u00bb.',
      '- Ex. FAUX\u00a0: seulement \u00ab\u00a0Impact sur l\'\u00e9quipe\u00a0\u00bb + \u00ab\u00a0Impact sur les utilisateurs\u00a0\u00bb alors que le pr\u00e9nom est connu.',
      '- Ic\u00f4nes disponibles (champ icon)\u00a0: circle-xs, circle-sm, circle-md, circle-lg, circle-xl, dots, hammer, calm-face, exclaim, user, users, building, globe, flame, check, ban, clock, bolt, layers, hourglass.',
      '- Urgence\u00a0: calm-face pour \u00ab\u00a0Pas urgent\u00a0\u00bb / aucune pression\u00a0; exclaim (!!) pour Urgent / Critique. Ex.\u00a0: {"label":"Pas urgent du tout","icon":"calm-face","heat":0} \u2026 {"label":"Urgent","icon":"exclaim","heat":4}.',
      '- color nomm\u00e9e\u00a0: blue|teal|yellow|lime|green|orange|red|gray (affich\u00e9e sur le chip). heat 0\u20134 reste r\u00e9serv\u00e9 aux \u00e9chelles gravit\u00e9 (vert\u2192rouge).',
      'R\u00e8gles actions (appliqu\u00e9es automatiquement)\u00a0:',
      '- 0 \u00e0 5 outils \u00e0 ex\u00e9cuter tout de suite d\u00e8s qu\'une action partielle est possible (ne pas attendre les d\u00e9tails optionnels).',
      '- Ne jamais inclure un outil incomplet sur un champ OBLIGATOIRE (ex. add_subtask sans text non vide).',
      '- set_due sans dueTime est VALIDE et pr\u00e9f\u00e9r\u00e9 quand l\'heure n\'est pas donn\u00e9e (sauf d\u00e9lai relatif\u00a0: utiliser relativeMinutes/relativeHours).',
      '- INTERDIT d\'affirmer dans message qu\'une modification est faite (ajout\u00e9e, mise \u00e0 jour, bloqu\u00e9e, c\'est fait\u2026) si le champ actions est vide. Sans outil, rien n\'est appliqu\u00e9.',
      '- Le runtime ex\u00e9cute actions et affiche un r\u00e9cap technique v\u00e9rifi\u00e9\u00a0; le message reste court, style pote (ami, z\u00e9ro jargon).',
      'R\u00e8gles followUps\u00a0:',
      '- 0 \u00e0 3 actions rapides optionnelles (boutons\u00a0; le clic applique sans nouvel appel).',
      '- Si actions (du followUp) est non vide\u00a0: le label EST une action \u2192 commence toujours par un verbe \u00e0 l\'infinitif (Marquer, D\u00e9finir, Ajouter\u2026). Ex.\u00a0: "Marquer bloqu\u00e9 (mat\u00e9riel)". Jamais un nom seul ni une question.',
      '- Pr\u00e9f\u00e8re le champ actions (auto) quand tu viens de recevoir la r\u00e9ponse \u00e0 ta question\u00a0; followUps pour des choix encore optionnels.',
      '- Si actions est [] , le label est renvoy\u00e9 comme message utilisateur (pr\u00e9f\u00e8re suggestions pour \u00e7a).',
      'Causes de blocage (blockedReasons) \u2014 tr\u00e8s important\u00a0:',
      '- Une cause d\u00e9crit POURQUOI la carte est bloqu\u00e9e (\u00e9tat / raison), pas une t\u00e2che \u00e0 faire.',
      '- Formule pr\u00e9f\u00e9r\u00e9e\u00a0: "Bloqu\u00e9 \u00e0 cause de \u2026", "En attente de \u2026" ou "En attente d\'avoir \u2026".',
      '- N\u00e9gations (pas d\'internet, sans wifi)\u00a0: reformule \u00ab\u00a0En attente d\'avoir internet\u00a0\u00bb \u2014 jamais \u00ab\u00a0En attente de pas d\'internet\u00a0\u00bb.',
      '- INTERDIT\u00a0: infinitifs d\'action comme "V\u00e9rifier le mat\u00e9riel", "Contacter le client", "Commander du stock".',
      '- Exemple mat\u00e9riel\u00a0: label d\'action "Marquer bloqu\u00e9 (mat\u00e9riel)" + cause "Bloqu\u00e9 \u00e0 cause de la disponibilit\u00e9 du mat\u00e9riel" (PAS "V\u00e9rifier le mat\u00e9riel" comme cause).',
      '- La cause est optionnelle\u00a0: on peut bloquer sans blockedReasons. Ne jamais exiger une cause ni boucler dessus.',
      'Sections activables (tr\u00e8s important)\u00a0:',
      '- Chaque bloc a un champ enabled. Si enabled=false, la section est d\u00e9sactiv\u00e9e\u00a0: les valeurs saved* / latentes NE comptent PAS.',
      '- Priorit\u00e9 active seulement si priority.enabled=true.',
      '- \u00c9ch\u00e9ance active seulement si due.enabled=true (sinon dueDate/dueTime actifs sont null). due.dueMode="vague" + due.dueVague + due.dueLabel d\u00e9crivent un horizon flou (\u00ab\u00a0\u00c0 faire \u00e9ventuellement\u00a0\u00bb)\u00a0; ne redemande pas une date pr\u00e9cise. due.startDate / due.recurrence d\u00e9crivent d\u00e9but et r\u00e9p\u00e9tition.',
      '- Assign\u00e9s\u00a0: context.ownership.members (carte) + context.boardMembers (tableau). \u00c9tiquettes\u00a0: context.labels (carte) + context.boardLabels (tableau). Personnes custom\u00a0: context.customAssignees. R\u00f4les\u00a0: context.memberRoles + context.memberRoleCatalog. Historique\u00a0: context.history.',
      '- Bloqu\u00e9 / en attente actif SEULEMENT si blocked.enabled=true (identique \u00e0 enAttente\u00a0; la cause s\u2019\u00e9dite sous Statut quand la carte est en Bloqu\u00e9).',
      '- Si blocked.enabled=false, la carte N\'EST PAS bloqu\u00e9e, m\u00eame si savedReasons contient d\'anciennes causes.',
      '- Progr\u00e8s actif seulement si progress.enabled=true.',
      '- Pour activer/d\u00e9sactiver\u00a0: priorityEnabled, dueEnabled, enAttente (Bloqu\u00e9), progressEnabled.',
      '- Pour marquer bloqu\u00e9\u00a0: set_blocked avec enAttente:true tout de suite (causes ensuite si fournies). Ne dis jamais que c\'est d\u00e9j\u00e0 bloqu\u00e9 si enabled=false.',
      'Outils disponibles\u00a0:',
      '- set_priority: { urgency?:0-4, impact?:0-4, ease?:1-5, priorityEnabled?:boolean, tier?: string, heatTarget?: number } (tier = Critique|Urgente|Prioritaire|Importante|Flexible|Secondaire|Optionnelle\u00a0; impact 0\u20134 = port\u00e9e Personnel\u2026Global). Legacy estimatedDuration* \u2192 redirig\u00e9 vers set_progress_estimate.',
      '- set_task_types: { types: string[], force?: boolean } (multi\u00a0; ids\u00a0: action|project|recurring|exploratory|emotional|communication|deliverable|process|thinking|material|learning|admin|creative|finance|custom-*). Lit context.taskTypes. Si taskTypesLocked=true, n\'\u00e9crase PAS sauf demande explicite + force:true. Ne suppose PAS qu\'une carte est un livrable\u00a0; adapte ton langage (urgence / cadrage) aux types.',
      '- set_due: { dueDate?: "YYYY-MM-DD"|null, dueTime?: "HH:MM"|null, dueEnabled?: boolean, relativeMinutes?: number, relativeHours?: number, dueVague?: "proche"|"lointain"|"eventuellement", dueMode?: "precise"|"vague", startDate?: "YYYY-MM-DD"|null, startTime?: "HH:MM"|null, clearStart?: boolean, recurrence?: { frequency: "daily"|"weekly"|"monthly"|"yearly", interval?: number, weekdays?: number[] }|null, clearRecurrence?: boolean, clear?: boolean } (dueTime OPTIONNEL\u00a0; d\u00e9lai relatif \u2192 relativeMinutes/Hours\u00a0; horizon flou \u2192 dueVague\u00a0; d\u00e9but \u2192 startDate\u00a0; r\u00e9currence \u2192 recurrence\u00a0; clear:true efface l\'\u00e9ch\u00e9ance\u00a0; aujourd\'hui = context.today)',
      '- set_blocked: { enAttente?: boolean, blockedReasons?: string[], blockedLinks?: [{id?:string, matchText?:string, label?:string}] } (enAttente:true seul suffit\u00a0; causes et liens optionnels\u00a0; synchronise Progr\u00e8s blocked\u00a0; si progr\u00e8s \u00e0 100%, le runtime le remet \u00e0 0% \u2014 ajoute aussi set_progress)',
      '- set_members: { add?: (string|{id?,matchText?,name?})[], remove?: (string|{id?,matchText?})[], clear?: boolean } (assigne / retire des membres du tableau\u00a0; match via context.boardMembers / ownership.members)',
      '- set_labels: { add?: (string|{id?,matchText?,name?,color?})[], remove?: (string|{id?,matchText?})[], create?: {name:string, color?:string}, clear?: boolean } (\u00e9tiquettes Trello\u00a0; match via context.boardLabels / labels)',
      '- set_custom_assignees: { add?: (string|{name})[], remove?: (string|{id?,matchText?})[], clear?: boolean } (personnes hors Trello sur la carte\u00a0; context.customAssignees)',
      '- set_member_roles: { matchText|memberId|name, roles: string[], clear?: boolean } (r\u00f4les\u00a0: subtitles|coloring|editing|music ou libell\u00e9s FR\u00a0; context.memberRoleCatalog)',
      '- add_checklist_item: { parentMatchText|parentId, text, done?, progress? } (sous-sous-t\u00e2che sous une sous-t\u00e2che locale)',
      '- remove_checklist_item / rename_checklist_item / set_checklist_progress: { parentMatchText|parentId, matchText|id, text?, progress? }',
      '- history_undo / history_redo: {} \u2014 history_revert: { entryId?|matchLabel?|steps? } (context.history)',
      '- set_progress: { progress?:0-100, progressEnabled?: boolean } (master sur sous-t\u00e2ches si items\u00a0; sinon progres carte)',
      '- set_subtask_estimate: { id?: string, matchText?: string, estimatedMinutes: number|null, estimatedDuration?: string }',
      '- set_progress_estimate: { estimatedMinutes: number|null, estimatedDuration?: string } (total master)',
      '- set_formula: { formula: "baseline"|"eisenhower"|"wsjf"|"valueEffort" }',
      '- set_statut: { listId?: string, matchList?: string, category?: string } (d\u00e9place la carte\u00a0; category ex. completed|blocked|started|backlog|triage|unstarted|canceled)',
      '- set_project: { projectId?: string, matchText?: string, name?: string, clear?: boolean } (lie la carte \u00e0 un projet Objectif\u00a0; clear:true d\u00e9lie\u00a0; matchText/name parmi context.goals.projects)',
      '- rename_card: { name: string } (nouveau titre de la carte\u00a0; name obligatoire, non vide)',
      '- set_description: { desc: string } (nouvelle description compl\u00e8te\u00a0; r\u00e9sum\u00e9 court + misc\u00a0; desc obligatoire en string, "" pour effacer)',
      '- add_subtask: { text: string, done?: boolean, blocked?: boolean, estimatedMinutes?: number } (text obligatoire, non vide\u00a0; done:true = cr\u00e9er d\u00e9j\u00e0 coch\u00e9e\u00a0; blocked:true = sous-t\u00e2che bloquante + Statut Bloqu\u00e9)',
      '- set_subtask_blocked: { id?|matchText?, blocked?: boolean, blockedReasons?: string[] } (marquer / d\u00e9marquer une sous-t\u00e2che bloqu\u00e9e\u00a0; causes optionnelles par sous-t\u00e2che\u00a0; synchronise enAttente)',
      '- rename_subtask: { text: string, id?: string, matchText?: string } (nouveau text\u00a0; id OU matchText)',
      '- remove_subtask: { id?: string, matchText?: string } (id OU matchText)',
      '- toggle_subtask: { id?: string, matchText?: string, done?: boolean }',
      '- set_subtask_progress: { id?: string, matchText?: string, progress: 0-100 }',
      '- complete_all_subtasks: {} (tout \u00e0 100%)',
      '- reset_progress: { includeCompleted?: boolean } (d\u00e9faut true\u00a0: tout \u00e0 0%\u00a0; false = seulement les non termin\u00e9es)',
      '- trigger_effect: { effect: "' +
        EFFECT_IDS.join('"|"') +
        '", text?: string, sound?: effectId } (effet visuel + son\u00a0; text = texte PLEIN \u00c9CRAN optionnel\u00a0; sound = stinger alternatif\u00a0; n\'alt\u00e8re pas la carte)',
      '- point_at: { section?: "priority"|"due"|"blocked"|"progress"|"statut"|"objectif"|"info", field?: "urgency"|"impact"|"ease", level?: 0-4|string } (ouvre la section, scrolle, tourne le corps vers la cible, gant blanc qui pointe, clignote\u00a0; n\'alt\u00e8re pas la carte\u00a0; section OU field requis)',
      '- set_agent_name: { name: string } (nouveau nom de l\'assistant\u00a0; name obligatoire, non vide, max ~40 car.\u00a0; persiste pour le membre)',
      '- set_agent_color: { color: string } (couleur d\'identit\u00e9\u00a0: orange|yellow|green|purple|blue|pink|red|teal|coral|sky, alias FR, ou hex #RRGGBB\u00a0; persiste pour le membre)',
      '- set_agent_personality: { personality: string } (trait de personnalit\u00e9 / character\u00a0; obligatoire, non vide, max ~400 car.\u00a0; persiste pour le membre)',
      'Identit\u00e9 de l\'assistant (nom / couleur / personnalit\u00e9)\u00a0:',
      '- Tu PEUX changer ton nom, ta couleur d\'identit\u00e9 et ta personnalit\u00e9. INTERDIT de dire que tu ne peux pas / que tu gardes ton ancienne identit\u00e9.',
      '- Nom (set_agent_name)\u00a0: quand l\'utilisateur le demande (ou te laisse choisir), utilise set_agent_name.',
      '- Nouveau nom connu (\u00ab\u00a0appelle-toi Max\u00a0\u00bb, \u00ab\u00a0ton nom c\'est Pipi\u00a0\u00bb)\u00a0: APPLIQUE set_agent_name tout de suite, confirme bri\u00e8vement.',
      '- Demande sans nom (\u00ab\u00a0change ton nom\u00a0\u00bb)\u00a0: dis oui, demande le nom + propose 2\u20133 options (suggestions / followUps). actions=[] tant qu\'aucun nom n\'est choisi.',
      '- Couleur (set_agent_color)\u00a0: \u00ab\u00a0change ta couleur pour rouge\u00a0\u00bb, \u00ab\u00a0sois bleu\u00a0\u00bb \u2192 APPLIQUE set_agent_color tout de suite + mets aussi "color" = la nouvelle teinte dans la r\u00e9ponse. INTERDIT de r\u00e9pondre que tu ne peux pas changer de couleur.',
      '- Couleur sans pr\u00e9cision (\u00ab\u00a0change ta couleur\u00a0\u00bb)\u00a0: dis oui, propose 2\u20133 teintes (suggestions / followUps avec set_agent_color). actions=[] tant qu\'aucune couleur n\'est choisie.',
      '- Personnalit\u00e9 (set_agent_personality)\u00a0: \u00ab\u00a0sois plus taquin\u00a0\u00bb, \u00ab\u00a0change ta personnalit\u00e9\u00a0\u00bb avec description \u2192 APPLIQUE set_agent_personality + incarne le nouveau trait tout de suite.',
      '- Personnalit\u00e9 vague (\u00ab\u00a0change ta perso\u00a0\u00bb)\u00a0: propose 2\u20133 traits concrets (followUps avec set_agent_personality). actions=[] tant qu\'aucun trait n\'est choisi.',
      '- Distingue set_agent_name (TON nom) de rename_card (titre de la carte). Distingue set_agent_color (identit\u00e9 durable) du champ "color" (affichage de la r\u00e9ponse).',
      '- Ex. nom\u00a0: user \u00ab\u00a0appelle-toi Nova\u00a0\u00bb \u2192 {"message":"Okay, je m\'appelle Nova maintenant.","suggestions":["Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"set_agent_name","args":{"name":"Nova"}}]}',
      '- Ex. couleur\u00a0: user \u00ab\u00a0change ta couleur pour rouge\u00a0\u00bb \u2192 {"message":"Okay, je passe au rouge\u00a0!","emotion":"happy","color":"red","suggestions":[],"followUps":[],"actions":[{"tool":"set_agent_color","args":{"color":"red"}}]}',
      '- Ex. personnalit\u00e9\u00a0: user \u00ab\u00a0sois un peu taquin\u00a0\u00bb \u2192 {"message":"Deal. Mode taquin activ\u00e9.","suggestions":[],"followUps":[],"actions":[{"tool":"set_agent_personality","args":{"personality":"Un peu taquin, volontiers espi\u00e8gle, reste utile."}}]}',
      'Effets fun dynamiques (trigger_effect)\u00a0:',
      '- Palette visuelle\u00a0: fireworks, confetti, hearts, sparkles, shooting_stars, bubbles, aurora, balloons, petals, flowers, rainbow, disco.',
      '- Palette sons / punchlines\u00a0: beep (BEEP BEEP fun), boop, zap, thunder (tonnerre), fanfare, bonk, laser, coin, drumroll, banner (texte plein \u00e9cran, text obligatoire).',
      isEn
        ? '- text (optional on any effect): short FULLSCREEN word/phrase (max ~48 chars, ideally 1\u20136 letters: "TWO", "BOOM", "YES"). Must match the response language (English here). Combine with the right sound.'
        : '- text (optionnel sur n\'importe quel effet)\u00a0: court mot/phrase en PLEIN \u00c9CRAN (max ~48 car., id\u00e9alement 1\u20136 lettres\u00a0: "DEUX", "BOOM", "OUI"). OBLIGATOIRE\u00a0: m\u00eame langue que la r\u00e9ponse (fran\u00e7ais ici\u00a0: "DEUX" pas "TWO", "OUI" pas "YES"). Combine avec le bon son.',
      isEn
        ? '- sound (optional): force another effect\'s stinger, e.g. effect=banner + sound=thunder + text="TWO".'
        : '- sound (optionnel)\u00a0: forcer le stinger d\'un autre effet, ex. effect=banner + sound=thunder + text="DEUX".',
      '- Utilise-les pour c\u00e9l\u00e9brer, blaguer, ou r\u00e9pondre \u00e0 une demande d\'effet.',
      isEn
        ? '- Flowers (flowers): REQUIRED when you truly compliment the user (bravery, effort, sharp idea, progress), OR when they ask for flowers / a bouquet / roses. Prefer flowers (not petals/hearts) in those cases.'
        : '- Fleurs (flowers)\u00a0: OBLIGATOIRE quand tu complimentes vraiment l\'utilisateur (bravoure, effort, id\u00e9e fine, progr\u00e8s), OU quand iel demande des fleurs / un bouquet / des roses. Prefer flowers (pas petals/hearts) dans ces cas.',
      isEn
        ? '- Ex. banner: {"message":"Boom.","suggestions":[],"followUps":[],"actions":[{"tool":"trigger_effect","args":{"effect":"banner","text":"BOOM","sound":"fanfare"}}]}'
        : '- Ex. banni\u00e8re\u00a0: {"message":"Boom.","suggestions":[],"followUps":[],"actions":[{"tool":"trigger_effect","args":{"effect":"banner","text":"BOOM","sound":"fanfare"}}]}',
      '- 0 ou 1 effet par r\u00e9ponse max. Ne promets pas l\'effet dans le texte si tu ne le mets pas dans actions.',
      '- Ex. c\u00e9l\u00e9bration\u00a0: {"message":"Bravo, c\'est plier\u00a0!","suggestions":["Et ensuite?"],"followUps":[],"actions":[{"tool":"trigger_effect","args":{"effect":"confetti"}}]}',
      isEn
        ? '- Ex. compliment: {"message":"You\'re handling this so well.","emotion":"happy","suggestions":[],"followUps":[],"actions":[{"tool":"trigger_effect","args":{"effect":"flowers"}}]}'
        : '- Ex. compliment\u00a0: {"message":"Tu g\u00e8res trop bien, s\u00e9rieux.","emotion":"happy","suggestions":[],"followUps":[],"actions":[{"tool":"trigger_effect","args":{"effect":"flowers"}}]}',
      '- Ex. demande\u00a0: user \u00ab\u00a0fais des feux d\'artifice\u00a0\u00bb \u2192 trigger_effect effect=fireworks.',
      isEn
        ? '- Ex. flowers: user "send me flowers" \u2192 trigger_effect effect=flowers.'
        : '- Ex. fleurs\u00a0: user \u00ab\u00a0envoie-moi des fleurs\u00a0\u00bb \u2192 trigger_effect effect=flowers.',
      'Montrer / pointer sur la page (point_at) \u2014 tr\u00e8s important\u00a0:',
      '- Quand l\'utilisateur demande o\u00f9 c\'est \u00e9crit, o\u00f9 voir X, \u00ab\u00a0montre-moi\u00a0\u00bb, \u00ab\u00a0where does it say\u00a0\u00bb, \u00ab\u00a0point to\u00a0\u00bb\u00a0: R\u00c9PONDS bri\u00e8vement ET appelle point_at (ne te contente pas de paraphraser le contexte).',
      '- section\u00a0: priority (Priorit\u00e9 / heat) | due (\u00c9ch\u00e9ance) | blocked (Blocage) | progress (Progr\u00e8s / sous-t\u00e2ches) | statut | objectif | info.',
      '- field (dans Priorit\u00e9)\u00a0: urgency | impact (port\u00e9e) | ease (facilit\u00e9).',
      '- level (surtout pour impact)\u00a0: 0 Personnel, 1 \u00c9quipe, 2 Interne, 3 Population, 4 Global \u2014 ou le libell\u00e9 ("Population").',
      '- Port\u00e9e population / \u00ab\u00a0impacts the whole population\u00a0\u00bb / clients-usagers\u00a0: field=impact, level=3 (PAS Global=4 sauf \u00ab\u00a0monde entier\u00a0\u00bb). section=priority.',
      '- Mets aussi emotion lookUp (ou lookLeft/lookRight) pour que le visage se tourne vers la cible.',
      '- 0 ou 1 point_at par r\u00e9ponse. Peut coexister avec une explication + [[y:Population]].',
      '- Ex. population\u00a0: user \u00ab\u00a0Where does it say that this work impacts the whole population?\u00a0\u00bb \u2192 {"thinking":"Port\u00e9e impact=Population (3) dans Priorit\u00e9.","message":"Ici\u00a0: le curseur [[y:Impact]] / port\u00e9e, niveau [[y:Population]].","emotion":"lookUp","suggestions":["Et Global?","Quelle est la priorit\u00e9?"],"followUps":[],"actions":[{"tool":"point_at","args":{"section":"priority","field":"impact","level":3}}]}',
      '- Ex. FR\u00a0: user \u00ab\u00a0O\u00f9 c\'est \u00e9crit que \u00e7a touche la population?\u00a0\u00bb \u2192 point_at section=priority field=impact level=3 + courte r\u00e9ponse.',
      '- Ex. \u00e9ch\u00e9ance\u00a0: user \u00ab\u00a0Montre-moi l\'\u00e9ch\u00e9ance\u00a0\u00bb \u2192 point_at section=due.',
      'M\u00e9moire plateau\u00a0: utilise les faits/summary du contexte pour personnaliser (noms, projets, normes). Ne contredis pas la m\u00e9moire sans raison. Les notes de correction/pr\u00e9f\u00e9rence (ex. \u00ab\u00a0Pr\u00e9f\u00e9rence / correction\u00a0\u00bb) ont priorit\u00e9 sur une mauvaise r\u00e9ponse ant\u00e9rieure.',
      'Profil utilisateur\u00a0: respecte context.profile (langue, ton, nom, r\u00f4le, notes, fonctionnalit\u00e9s actives).',
      context && context.userName
        ? 'Pr\u00e9nom connu (context.userName)\u00a0: ' +
          context.userName +
          '. Utilise-le pour personnaliser (salutations, suggestions d\'impact / qui est touch\u00e9).'
        : '',
      'Contexte carte actuel (JSON)\u00a0:',
      JSON.stringify(context)
    ].filter(Boolean))
    .join('\n');
  }

  /**
   * Normalize Progress-section suggestion rows (text invent + linked board cards).
   * Accepts legacy string arrays or mixed objects from the model.
   * @returns {Array<{type:'text'|'link', text:string, cardId?:string, list?:string}>}
   */
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
    messages.push({ role: 'user', content: String(userText || '').trim() });

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

  // ── Card first-open interview (Akinator / Q20) ────────────────────────────

  /** Strip [[g:/r:/y:/a:…]] markers for question matching. */
  function stripInterviewMarkup(text) {
    return String(text || '')
      .replace(/\[\[\s*[a-z]\s*:\s*([^\]]*)\s*\]\]?/gi, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Classify progress-scout interview questions so we can block
   * déjà-fait ↔ reste-à-faire loops (same topic, oscillating wording).
   * Returns 'done' | 'remaining' | 'both' | 'started' | ''.
   */
  function interviewProgressScoutKind(text) {
    var t = stripInterviewMarkup(text).toLocaleLowerCase('fr-FR');
    if (!t || t.indexOf('?') < 0) return '';
    var isRemaining =
      /reste\s*[àa]\s*faire/.test(t) ||
      /qu['']?est[- ]ce\s+qui\s+reste/.test(t) ||
      /il\s+reste\s+quoi/.test(t) ||
      /quoi\s+reste/.test(t) ||
      /ce\s+qui\s+reste/.test(t);
    var isDone =
      /d[ée]j[àa]\s+fait/.test(t) ||
      /qu['']?est[- ]ce\s+qui\s+(?:est|a\s+[ée]t[ée])\s+(?:d[ée]j[àa]\s+)?fait/.test(
        t
      ) ||
      /ce\s+qui\s+est\s+(?:d[ée]j[àa]\s+)?fait/.test(t) ||
      /qu['']?est[- ]ce\s+qui\s+a\s+[ée]t[ée]\s+fait/.test(t);
    if (isRemaining && isDone) return 'both';
    if (isRemaining) return 'remaining';
    if (isDone) return 'done';
    if (
      (/commenc/.test(t) || /pas\s+encore/.test(t)) &&
      (/d[ée]j[àa]/.test(t) || /pas\s+encore/.test(t) || /avanc/.test(t))
    ) {
      return 'started';
    }
    return '';
  }

  function cardMemoryHasProgressFact(cardMemory, kind) {
    var facts =
      cardMemory && Array.isArray(cardMemory.facts) ? cardMemory.facts : [];
    var re =
      kind === 'remaining'
        ? /^\s*reste\b/i
        : kind === 'done'
          ? /^\s*d[ée]j[àa]\s+fait\b/i
          : null;
    if (!re) return false;
    for (var i = 0; i < facts.length; i++) {
      var f = facts[i];
      var text =
        typeof f === 'string'
          ? f
          : f && typeof f === 'object'
            ? String(f.text || f.fact || '')
            : '';
      if (re.test(text)) return true;
    }
    return false;
  }

  /**
   * Summarize which progress-scout angles were already covered
   * (asked[], cardMemory, or recent assistant history).
   */
  function summarizeInterviewProgressScout(context, history) {
    var asked =
      context && context.interview && Array.isArray(context.interview.asked)
        ? context.interview.asked
        : [];
    var state = {
      askedDone: false,
      askedRemaining: false,
      askedStarted: false,
      memoryHasDone: cardMemoryHasProgressFact(
        context && context.cardMemory,
        'done'
      ),
      memoryHasRemaining: cardMemoryHasProgressFact(
        context && context.cardMemory,
        'remaining'
      )
    };
    function absorb(text) {
      var kind = interviewProgressScoutKind(text);
      if (kind === 'both') {
        state.askedDone = true;
        state.askedRemaining = true;
      } else if (kind === 'done') state.askedDone = true;
      else if (kind === 'remaining') state.askedRemaining = true;
      else if (kind === 'started') state.askedStarted = true;
    }
    asked.forEach(absorb);
    (Array.isArray(history) ? history : []).forEach(function (entry) {
      if (!entry || entry.role !== 'assistant') return;
      absorb(entry.content || '');
    });
    state.doneCovered = state.askedDone || state.memoryHasDone;
    state.remainingCovered = state.askedRemaining || state.memoryHasRemaining;
    state.blockScout =
      (state.doneCovered && state.remainingCovered) ||
      (state.askedDone && state.askedRemaining);
    return state;
  }

  /**
   * If the model re-asks déjà-fait / reste (or oscillates), pivot off
   * progress scouting so the interview cannot stall in a repérage loop.
   * Allowed once: déjà-fait → reste. Blocked: same kind twice, reste→déjà-fait,
   * or any scout once both angles (or memory) already cover progress.
   */
  function applyInterviewProgressScoutGuards(turn, context, history) {
    turn = turn && typeof turn === 'object' ? turn : {};
    var message = typeof turn.message === 'string' ? turn.message : '';
    var kind = interviewProgressScoutKind(message);
    if (kind !== 'done' && kind !== 'remaining' && kind !== 'both') return turn;

    var scout = summarizeInterviewProgressScout(context, history);
    var blocked = false;
    if (kind === 'both') {
      // Combined ask is fine once; never after either angle was already used.
      if (
        scout.askedDone ||
        scout.askedRemaining ||
        scout.memoryHasDone ||
        scout.memoryHasRemaining
      ) {
        blocked = true;
      }
    } else {
      // Same angle again (any wording).
      if (kind === 'done' && scout.askedDone) blocked = true;
      if (kind === 'remaining' && scout.askedRemaining) blocked = true;
      // Fact already memorized — no need to re-scout.
      if (kind === 'done' && scout.memoryHasDone) blocked = true;
      if (kind === 'remaining' && scout.memoryHasRemaining) blocked = true;
      // Reverse / ping-pong: "déjà fait" after "reste" was already asked.
      if (kind === 'done' && scout.askedRemaining) blocked = true;
      // Both angles already spent — leave progress scouting entirely.
      if (scout.askedDone && scout.askedRemaining) blocked = true;
      if (scout.memoryHasDone && scout.memoryHasRemaining) blocked = true;
    }

    if (!blocked) return turn;

    // Never fall through to "C'est pour quand?" when due is already set.
    var next = buildInterviewNextPivot(context);
    return Object.assign({}, turn, {
      message: next.message,
      suggestions: next.suggestions,
      suggestionsMulti: next.suggestionsMulti,
      suggestionScale: next.suggestionScale,
      completeInterview: !!next.completeInterview
    });
  }

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

  // ── Per-card chat history (survives close/reopen) ─────────────────────────

  function emptyCardChat() {
    return {
      version: 1,
      messages: [],
      updatedAt: ''
    };
  }

  function normalizeCardChatMessage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var role = raw.role === 'user' || raw.role === 'assistant' ? raw.role : '';
    if (!role) return null;
    var content = String(raw.content != null ? raw.content : '')
      .trim()
      .slice(0, MAX_CHAT_CONTENT);
    if (!content) return null;
    return { role: role, content: content };
  }

  function chatSerializedSize(chat) {
    try {
      var json = JSON.stringify(chat);
      // Prefer UTF-8 byte length when available (closer to Trello’s count for accents/emoji).
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(json).length;
      }
      return unescape(encodeURIComponent(json)).length;
    } catch (e) {
      return MAX_CHAT_SERIALIZED + 1;
    }
  }

  function enforceCardChatBudget(chat, maxBytes) {
    var budget =
      typeof maxBytes === 'number' && maxBytes > 0 ? maxBytes : MAX_CHAT_SERIALIZED;
    var next = {
      version: 1,
      messages: Array.isArray(chat && chat.messages) ? chat.messages.slice() : [],
      updatedAt: (chat && typeof chat.updatedAt === 'string' && chat.updatedAt) || ''
    };
    // Persist only role + content (drop selfPrompt and any UI-only fields).
    next.messages = next.messages
      .map(function (msg) {
        return normalizeCardChatMessage(msg);
      })
      .filter(Boolean);
    while (next.messages.length > MAX_CHAT_MESSAGES) {
      next.messages.shift();
    }
    while (
      next.messages.length > 1 &&
      chatSerializedSize(next) > budget
    ) {
      next.messages.shift();
    }
    if (chatSerializedSize(next) > budget && next.messages.length === 1) {
      var slimCap = Math.max(60, Math.floor(MAX_CHAT_CONTENT / 2));
      while (
        slimCap >= 40 &&
        chatSerializedSize(next) > budget
      ) {
        next.messages[0] = {
          role: next.messages[0].role,
          content: String(next.messages[0].content || '').slice(0, slimCap)
        };
        slimCap = Math.floor(slimCap * 0.7);
      }
    }
    if (chatSerializedSize(next) > budget) {
      next.messages = [];
    }
    return next;
  }

  function normalizeCardChat(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var messages = [];
    if (Array.isArray(src.messages)) {
      for (var i = 0; i < src.messages.length; i++) {
        var msg = normalizeCardChatMessage(src.messages[i]);
        if (msg) messages.push(msg);
      }
    }
    return enforceCardChatBudget({
      version: 1,
      messages: messages,
      updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : ''
    });
  }

  async function loadCardChat(t) {
    if (!t || typeof t.get !== 'function') return emptyCardChat();
    try {
      var stored = await t.get('card', 'private', CARD_CHAT_KEY);
      return normalizeCardChat(stored);
    } catch (err) {
      console.error('PriorityAgent.loadCardChat failed', err);
      return emptyCardChat();
    }
  }

  async function savePluginChat(t, scope, key, chat) {
    var next = normalizeCardChat(chat);
    next.updatedAt = new Date().toISOString();
    next = enforceCardChatBudget(next, MAX_CHAT_SERIALIZED);
    if (!t || typeof t.set !== 'function') return next;

    async function write(payload) {
      await t.set(scope, 'private', key, payload);
    }

    try {
      await write(next);
      return next;
    } catch (err) {
      // Shrink aggressively then retry; only log if hard-fail.
      var shrunk = enforceCardChatBudget(next, MAX_CHAT_SERIALIZED_HARD);
      shrunk.updatedAt = new Date().toISOString();
      try {
        await write(shrunk);
        return shrunk;
      } catch (retryErr) {
        var empty = emptyCardChat();
        empty.updatedAt = new Date().toISOString();
        try {
          await write(empty);
          console.warn(
            'PriorityAgent.saveChat exceeded plugin data limit; cleared history (' +
              scope +
              '/' +
              key +
              ')'
          );
          return empty;
        } catch (emptyErr) {
          console.error('PriorityAgent.saveChat failed', emptyErr || retryErr || err);
          return shrunk;
        }
      }
    }
  }

  async function saveCardChat(t, chat) {
    return savePluginChat(t, 'card', CARD_CHAT_KEY, chat);
  }

  async function loadBoardChat(t) {
    if (!t || typeof t.get !== 'function') return emptyCardChat();
    try {
      var stored = await t.get('board', 'private', BOARD_CHAT_KEY);
      return normalizeCardChat(stored);
    } catch (err) {
      console.error('PriorityAgent.loadBoardChat failed', err);
      return emptyCardChat();
    }
  }

  async function saveBoardChat(t, chat) {
    return savePluginChat(t, 'board', BOARD_CHAT_KEY, chat);
  }

  /**
   * First-open card interview turn (one question at a time).
   * Returns { message, suggestions, actions, prompts, followUps, completeInterview,
   *   droppedActions, rawJson, usage, context, debug }.
   */
  async function cardInterviewTurn(provider, history, bridge, userText, options) {
    options = options || {};
    dbgLog('agent', 'cardInterviewTurn.start', {});
    var onDelta = typeof options.onDelta === 'function' ? options.onDelta : null;
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      dbgLog('agent', 'cardInterviewTurn.end', { ok: false, reason: 'not-configured' });
      return {
        message: 'Configurez d\'abord un fournisseur IA dans les param\u00e8tres.',
        suggestions: [],
        actions: [],
        prompts: [],
        followUps: [],
        cardPatches: [],
        patches: [],
        completeInterview: false,
        droppedActions: [],
        rawJson: '',
        usage: null,
        context: null,
        debug: null
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
    var progressScout = summarizeInterviewProgressScout(context, history);
    context.interview.progressScout = {
      askedDone: progressScout.askedDone,
      askedRemaining: progressScout.askedRemaining,
      memoryHasDone: progressScout.memoryHasDone,
      memoryHasRemaining: progressScout.memoryHasRemaining,
      blockFurtherScout: !!(
        (progressScout.askedDone && progressScout.askedRemaining) ||
        (progressScout.memoryHasDone && progressScout.memoryHasRemaining)
      )
    };

    var system = [
      'Tu es l\'assistant Cerveau en mode INTERVIEW premi\u00e8re ouverture.',
      profileLanguageInstruction(context && context.profile),
      'Tu tutoyes, comme un pote direct et bienveillant qui aide \u00e0 cadrer la carte sans pression ni th\u00e9\u00e2tre.',
      'Voix (TOUJOURS)\u00a0: naturel, clair, un peu snarky-doux si \u00e7a vient tout seul. Z\u00e9ro jargon technique, z\u00e9ro ton administratif, z\u00e9ro coach productivit\u00e9. Pas de performance cringe.',
      'Grammaire\u00a0: JAMAIS de virgule avant \u00ab\u00a0et\u00a0\u00bb (\u00ab\u00a0urgence, impact et facilit\u00e9\u00a0\u00bb, pas \u00ab\u00a0urgence, impact, et facilit\u00e9\u00a0\u00bb).',
      'Ponctuation\u00a0: JAMAIS de tiret cadratin (\u2014). Pr\u00e9f\u00e8re un point, une virgule ou une nouvelle phrase.',
      'Objectif\u00a0: interview MINIMALE. (1) d\u00e9duire Urgence (0\u20134), Impact/port\u00e9e (0\u20134) et Facilit\u00e9 (1\u20135) \u2014 en silence quand c\'est \u00e9vident\u00a0; (2) tenir Progr\u00e8s / axes / blocage / \u00e9ch\u00e9ance \u00e0 jour d\u00e8s qu\'un indice appara\u00eet\u00a0; (3) optionnellement projet. PAS de th\u00e9rapie / motivation. Dur\u00e9e\u00a0: inf\u00e8re-la quand elle saute aux yeux\u00a0; ne la demande QUE si vraiment incertaine.',
      'Personnes / pr\u00e9noms (critique)\u00a0: n\'invente JAMAIS un pr\u00e9nom ou un nom propre absent du message utilisateur, de l\'historique, de cardMemory, de memory ou de progress.items. Les exemples du prompt ne sont PAS des gens de la carte. Pour un blocage sans cause\u00a0: confirmation neutre seulement (\u00ab\u00a0Okay, bloqu\u00e9. Quelle est la cause?\u00a0\u00bb) \u2014 INTERDIT \u00ab\u00a0en attendant [pr\u00e9nom]\u00a0\u00bb.',
      '',
      'Interview courte (critique \u2014 moins = mieux)\u00a0:',
      '- Pose une question SEULEMENT si la r\u00e9ponse change vraiment le scoring (urgence / impact / facilit\u00e9) ou un champ carte (blocage, \u00e9tapes, \u00e9ch\u00e9ance) ET que tu ne peux PAS l\'inf\u00e9rer du titre / du contexte.',
      '- Sinon\u00a0: applique set_priority / set_task_types / set_progress_estimate en silence et completeInterview:true (ou une seule question d\'axe manquant).',
      '- INTERDIT les questions de motivation / POURQUOI\u00a0: jamais \u00ab\u00a0Pourquoi tu veux\u2026?\u00a0\u00bb, \u00ab\u00a0\u00c7a sert \u00e0 quoi?\u00a0\u00bb, \u00ab\u00a0C\'est pour quoi?\u00a0\u00bb. Le titre suffit\u00a0; on ne creuse pas le sens de la vie.',
      '- Si l\'utilisateur DONNE spontan\u00e9ment une raison\u00a0: cardPatches remember \u00ab\u00a0Pourquoi\u00a0: \u2026\u00a0\u00bb OK \u2014 mais ne demande pas.',
      '- Ex. FAUX (ouverture)\u00a0: \u00ab\u00a0Pourquoi tu veux mettre tes dipl\u00f4mes sur le mur?\u00a0\u00bb / \u00ab\u00a0Pourquoi tu veux ce plan?\u00a0\u00bb',
      '- Ex. VRAI (ouverture, axe utile)\u00a0: set_task_types + set_priority ease si trivial + \u00ab\u00a0Si on ne le fait pas, c\'est [[a:grave]]?\u00a0\u00bb (ou impact confirm) \u2014 OU completeInterview si tout est d\u00e9j\u00e0 clair.',
      '- Ex. VRAI (titre \u00e9vident)\u00a0: accrocher des dipl\u00f4mes / liker un post \u2192 ease + dur\u00e9e en silence, 0\u20131 question max (urgence ou impact), puis close.',
      '',
      'Type de t\u00e2che (critique \u2014 dynamique, multi-labels)\u00a0:',
      '- Catalog ids\u00a0: action (action concr\u00e8te unique), project (partie d\'un effort multi-\u00e9tapes), recurring, exploratory (d\u00e9couverte/recherche), emotional (\u00e9motionnel/psycho), communication (relationnel), deliverable (livrable/produit), process (processus/maintenance), thinking (r\u00e9flexion/d\u00e9cisions).',
      '- Une carte peut cumuler plusieurs types (ex. project+deliverable, action+emotional, communication+thinking).',
      '- D\u00e8s le 1er tour utile\u00a0: classifie EN SILENCE via set_task_types {types:[...]} (1\u20133 ids aptes). INTERDIT de demander \u00ab\u00a0c\'est quel type?\u00a0\u00bb.',
      '- Si alreadyKnown.taskTypesKnown / context.taskTypes non vide\u00a0: r\u00e9utilise\u00a0; ne reclasse que si la conversation change clairement la nature (et seulement si taskTypesLocked=false).',
      '- Si taskTypesLocked=true\u00a0: ne touche PAS (sauf demande explicite user + force:true).',
      '- Adapte TOUTES les questions au type\u00a0:',
      '  \u00b7 deliverable\u00a0: format / produit final OK\u00a0; urgence peut dire \u00ab\u00a0livre\u00a0\u00bb.',
      '  \u00b7 action / process / recurring\u00a0: urgence = \u00ab\u00a0Si on ne le fait pas\u2026\u00a0\u00bb. INTERDIT \u00ab\u00a0livre\u00a0\u00bb / \u00ab\u00a0produit final\u00a0\u00bb / diaporama.',
      '  \u00b7 exploratory\u00a0: clarifie ce qu\'on cherche \u00e0 apprendre SEULEMENT si flou pour le score\u00a0; urgence \u00ab\u00a0Si on n\'explore pas\u2026\u00a0\u00bb. Pas de framing livrable sauf si deliverable aussi.',
      '  \u00b7 emotional / communication\u00a0: enjeux relationnels / \u00e9motionnels\u00a0; PAS \u00ab\u00a0produit final\u00a0\u00bb. Urgence du genre \u00ab\u00a0Si on n\'en parle pas\u2026\u00a0\u00bb / \u00ab\u00a0Si on ne s\'en occupe pas\u2026\u00a0\u00bb.',
      '  \u00b7 thinking\u00a0: clarifie la d\u00e9cision / le choix SEULEMENT si \u00e7a change le score\u00a0; urgence \u00ab\u00a0Si on ne d\u00e9cide pas\u2026\u00a0\u00bb.',
      '  \u00b7 project\u00a0: permission / qui / commenc\u00e9 / d\u00e9j\u00e0 fait / reste = SEULEMENT si n\u00e9cessaire (pas un questionnaire automatique).',
      '- Ex. FAUX (corv\u00e9e perso / action)\u00a0: \u00ab\u00a0Si on ne le livre pas, c\'est grave?\u00a0\u00bb / \u00ab\u00a0Le produit final, c\'est un document?\u00a0\u00bb',
      '- Ex. VRAI (cable management = action+process)\u00a0: set_task_types {types:["action","process"]} + urgence \u00ab\u00a0Si on ne fait pas le m\u00e9nage des c\u00e2bles\u2026, c\'est grave?\u00a0\u00bb',
      '- Ex. VRAI (plan strat\u00e9gie com = project+deliverable+communication)\u00a0: types inclus deliverable \u2192 format livrable OK ensuite.',
      '',
      'Titre vague / technique / jargon (seulement si le flou bloque le scoring)\u00a0:',
      '- Si le titre sonne abstrait, corporate ou flou (plan, strat\u00e9gie, cadre, feuille de route, gouvernance, transform\u2026) ET tu ne peux pas scorer\u00a0: UNE clarification courte du r\u00e9sultat (pas un POURQUOI).',
      '- Challenge vague (1 tour max, avec?)\u00a0: \u00ab\u00a0[Sujet], \u00e7a sonne un peu technique et sans vouloir t\'offenser, un peu vague?\u00a0\u00bb',
      '- Format livrable (suggestionsMulti:true) SEULEMENT si deliverable est parmi context.taskTypes (ou signal livrable \u00e9vident)\u00a0: \u00ab\u00a0Le produit final, c\'est un document texte? Un diaporama?\u00a0\u00bb (+ PDF, atelier, checklist\u2026).',
      '- SINON (action / process / emotional / communication / exploratory / thinking / recurring sans deliverable)\u00a0: clarifie le r\u00e9sultat dans le langage du type (\u00ab\u00a0Au fond, tu veux que quoi soit vrai / fait / clarifi\u00e9?\u00a0\u00bb) \u2014 JAMAIS \u00ab\u00a0produit final / diaporama\u00a0\u00bb. JAMAIS \u00ab\u00a0Pourquoi tu veux\u2026?\u00a0\u00bb.',
      '- Hypoth\u00e8se de but (oui/non, suggestionsMulti:false) si utile\u00a0: avance ton best guess. Ex. strat\u00e9gie com\u00a0: \u00ab\u00a0\u00c7a sert \u00e0 guider le service des communications pour offrir un meilleur service, c\'est \u00e7a?\u00a0\u00bb',
      '- Sur r\u00e9ponse\u00a0: remember \u00ab\u00a0Livrable\u00a0: \u2026\u00a0\u00bb seulement si deliverable\u00a0; sinon \u00ab\u00a0But\u00a0: \u2026\u00a0\u00bb / \u00ab\u00a0R\u00e9sultat\u00a0: \u2026\u00a0\u00bb (+ rename_card si utile\u00a0; set_description court, sans dump).',
      '- Une id\u00e9e par tour\u00a0: types silencieux, puis clarification SEULEMENT si flou, puis axes. Skip tout ce qui est \u00e9vident.',
      '',
      'Plans / strat\u00e9gies / projets larges (optionnel \u2014 pas un questionnaire)\u00a0:',
      '- Skip permission / qui / commenc\u00e9 / d\u00e9j\u00e0-fait / reste sauf si (a) le titre est clairement un gros chantier multi-\u00e9tapes ET (b) l\'info change priorit\u00e9 / progr\u00e8s / blocage. Sinon passe directement aux axes.',
      '- Si tu poses ces questions, UNE par tour, dans un ordre qui a du sens\u00a0:',
      '  1) Permission\u00a0: \u00ab\u00a0Faut la permission de quelqu\'un pour avancer dans ce plan?\u00a0\u00bb',
      '  2) Qui\u00a0: si tu peux suppose que c\'est l\'utilisateur \u2192 \u00ab\u00a0C\'est [[a:toi]] qui travailles dessus?\u00a0\u00bb + Oui/Non. Sinon \u00ab\u00a0Qui travaille sur ce plan?\u00a0\u00bb.',
      '  3) Avancement\u00a0: \u00ab\u00a0\u00c7a a [[g:d\u00e9j\u00e0 \u00e9t\u00e9 commenc\u00e9]] ou [[r:pas encore]]?\u00a0\u00bb (varie le wording, garde le surlignage vert/rouge).',
      '  4) Si oui / un peu / presque termin\u00e9 \u2192 UNE seule question combin\u00e9e\u00a0: \u00ab\u00a0Qu\'est-ce qui est d\u00e9j\u00e0 fait, et qu\'est-ce qui reste?\u00a0\u00bb (suggestionsMulti:true avec \u00e9tapes plausibles). Pr\u00e9f\u00e8re \u00e7a plut\u00f4t que deux tours s\u00e9par\u00e9s.',
      '  5) Si tu d\u00e9coupes quand m\u00eame\u00a0: ordre STRICT d\u00e9j\u00e0-fait PUIS reste (une fois chacun). JAMAIS l\'inverse. JAMAIS reformuler pour reposer le m\u00eame angle.',
      '  6) Si non / pas encore \u2192 tu PEUX demander \u00ab\u00a0Pourquoi \u00e7a n\'a pas \u00e9t\u00e9 commenc\u00e9?\u00a0\u00bb (blocage / temps \u2014 PAS motivation de la carte), PUIS axes.',
      '- Anti-boucle avancement / rep\u00e9rage (critique \u2014 NE PAS tourner en rond)\u00a0:',
      '  \u00b7 INTERDIT d\'alterner \u00ab\u00a0Qu\'est-ce qui reste \u00e0 faire pour [sujet]?\u00a0\u00bb et \u00ab\u00a0Qu\'est-ce qui est d\u00e9j\u00e0 fait pour [sujet]?\u00a0\u00bb (m\u00eame reformul\u00e9s).',
      '  \u00b7 D\u00e8s qu\'une question d\u00e9j\u00e0-fait OU reste a \u00e9t\u00e9 pos\u00e9e (voir asked / historique) ET qu\'une r\u00e9ponse exploitable est l\u00e0\u00a0: applique les outils, puis PIVOTE (axes / \u00e9ch\u00e9ance). Pas un 2e rep\u00e9rage.',
      '  \u00b7 Si cardMemory a d\u00e9j\u00e0 \u00ab\u00a0D\u00e9j\u00e0 fait\u00a0:\u00a0\u00bb / \u00ab\u00a0Reste\u00a0:\u00a0\u00bb ou progress.items non vide\u00a0: SKIP le bloc d\u00e9j\u00e0/reste.',
      '  \u00b7 Ex. FAUX (boucle)\u00a0: \u00ab\u00a0Qu\'est-ce qui reste \u00e0 faire pour le guide\u2026?\u00a0\u00bb puis \u00ab\u00a0Qu\'est-ce qui est d\u00e9j\u00e0 fait pour le guide\u2026?\u00a0\u00bb.',
      '  \u00b7 Ex. VRAI\u00a0: une question combin\u00e9e, outils sur la r\u00e9ponse, puis urgence/impact.',
      '- Skip une question si la r\u00e9ponse est d\u00e9j\u00e0 dans cardMemory / historique / description.',
      '- Sur r\u00e9ponses avancement (critique \u2014 NE PAS seulement chatter)\u00a0:',
      '  \u00b7 M\u00e9morise (cardPatches) + APPLIQUE les outils\u00a0: set_progress, add_subtask, set_priority / set_blocked si l\'indice le justifie.',
      '  \u00b7 \u00ab\u00a0D\u00e9j\u00e0 fait\u00a0\u00bb / \u00ab\u00a0Reste\u00a0\u00bb / \u00ab\u00a0commenc\u00e9 un peu / presque fini\u00a0\u00bb \u2192 set_progress avec progressEnabled:true + % estim\u00e9 (voir bar\u00e8me ci-dessous) + cardPatches \u00ab\u00a0D\u00e9j\u00e0 fait\u00a0: \u2026\u00a0\u00bb / \u00ab\u00a0Reste\u00a0: \u2026\u00a0\u00bb.',
      '  \u00b7 D\u00e9j\u00e0 fait (OBLIGATOIRE)\u00a0: pour CHAQUE \u00e9tape concr\u00e8te d\u00e9j\u00e0 faite \u2192 add_subtask {text:"\u2026", done:true}. Cr\u00e9e ET coche. INTERDIT de seulement remember / set_progress sans sous-t\u00e2ches.',
      '  \u00b7 Si l\'\u00e9tape existe d\u00e9j\u00e0 dans context.progress.items (m\u00eame sens)\u00a0: toggle_subtask {matchText:"\u2026", done:true} au lieu de la recr\u00e9er.',
      '  \u00b7 Chaque \u00e9tape restante claire \u2192 add_subtask {text:"\u2026"} (sans done, ou done:false). Si context.progress.items a d\u00e9j\u00e0 l\'\u00e9tape, ne la recr\u00e9e pas \u2014 toggle_subtask / set_subtask_blocked selon le besoin.',
      '  \u00b7 Ex. FAUX (doublons)\u00a0: progress.items a d\u00e9j\u00e0 \u00ab\u00a0Poncer le pl\u00e2tre\u00a0\u00bb, \u00ab\u00a0Peindre la salle de bain\u00a0\u00bb, \u00ab\u00a0Installer les crochets\u00a0\u00bb \u2192 re-ajouter les 3 m\u00eames add_subtask au tour suivant.',
      '  \u00b7 Ex. VRAI\u00a0: ces titres sont d\u00e9j\u00e0 pr\u00e9sents \u2192 pas de add_subtask\u00a0; encha\u00eene sur urgence / impact / \u00e9ch\u00e9ance ou toggle_subtask si une \u00e9tape vient d\'\u00eatre faite.',
      '  \u00b7 Plan / prochaines \u00e9tapes / \u00ab\u00a0le plus utile pour avancer\u00a0\u00bb / pr\u00e9requis (critique)\u00a0: si l\'utilisateur d\u00e9crit 1+ actions concr\u00e8tes \u00e0 faire (d\'abord X, puis Y, apr\u00e8s Z)\u00a0: UN add_subtask par \u00e9tape CE TOUR-CI + set_progress {progressEnabled:true, progress:0} si pas commenc\u00e9 + remember \u00ab\u00a0Reste\u00a0: \u2026\u00a0\u00bb. INTERDIT de seulement reformuler / demander l\'\u00e9ch\u00e9ance / promettre de \u00ab\u00a0noter\u00a0\u00bb sans outils.',
      '  \u00b7 Ex. user (plan)\u00a0: \u00ab\u00a0D\'abord ajouter un disque 2\u00a0To, r\u00e9installer Windows, puis le grand m\u00e9nage Google Drive\u00a0\u00bb \u2192 add_subtask {text:"Ajouter un disque 2 To"} + add_subtask {text:"R\u00e9installer Windows"} + add_subtask {text:"Faire le grand m\u00e9nage Google Drive"} + set_progress {progressEnabled:true, progress:0} + remember Reste + question utile suivante (ex. \u00e9ch\u00e9ance) OU axes.',
      '  \u00b7 Ex. FAUX (plan)\u00a0: message \u00ab\u00a0D\'accord, donc ajouter un disque\u2026 C\'est pour quand?\u00a0\u00bb avec actions=[] (ou seulement cardPatches).',
      '  \u00b7 Bar\u00e8me % (honn\u00eate)\u00a0: rien commenc\u00e9\approx0\u201310\u00a0; un peu / pr\u00e9paration\approx25\u201340\u00a0; une bonne partie\approx50\u201365\u00a0; presque fini / il reste surtout \u00e0 installer-finaliser\approx75\u201390\u00a0; fini\approx100.',
      '  \u00b7 Ex. user (d\u00e9j\u00e0 fait)\u00a0: \u00ab\u00a0J\'ai choisi les dipl\u00f4mes \u00e0 installer. J\'ai pr\u00e9par\u00e9 l\'emplacement\u00a0\u00bb \u2192 set_progress {progressEnabled:true, progress:40} + add_subtask {text:"Choisir les dipl\u00f4mes", done:true} + add_subtask {text:"Pr\u00e9parer l\'emplacement", done:true} + remember + question \u00ab\u00a0Qu\'est-ce qui reste \u00e0 faire?\u00a0\u00bb.',
      '  \u00b7 Ex. FAUX (d\u00e9j\u00e0 fait)\u00a0: seulement set_progress + remember, sans add_subtask done:true.',
      '  \u00b7 Ex. user (reste)\u00a0: \u00ab\u00a0Installer les accessoires\u00a0\u00bb \u2192 add_subtask {text:"Installer les accessoires"} + set_progress (ex. 70\u201380 si le gros est derri\u00e8re) + remember \u00ab\u00a0Reste\u00a0: installer les accessoires\u00a0\u00bb + suite utile (\u00e9ch\u00e9ance / axes).',
      '  \u00b7 INTERDIT de r\u00e9pondre \u00e0 une question d\'avancement avec actions=[] alors que l\'utilisateur a donn\u00e9 du contenu exploitable.',
      '- Suggestions permission\u00a0: Oui / Non / Je ne sais pas (+ \u00e9ventuellement le nom si tu le devines).',
      '- Suggestions commenc\u00e9 (varie, suggestionsMulti:false, suggestionScale:true)\u00a0: ex. {"label":"Oui, un peu","heat":0}, {"label":"Oui, presque termin\u00e9","heat":0}, {"label":"Non, pas encore","heat":4}. Les chips VERTES = d\u00e9j\u00e0 commenc\u00e9\u00a0; ROUGE = pas encore. INTERDIT de toujours sortir seulement Oui / Non sans heat.',
      '- Avancement + blocage (important)\u00a0:',
      '  \u00b7 Apr\u00e8s \u00ab\u00a0Non, pas encore\u00a0\u00bb\u00a0: message = \u00ab\u00a0Pourquoi \u00e7a n\'a pas \u00e9t\u00e9 commenc\u00e9?\u00a0\u00bb + 2\u20134 suggestions LI\u00c9ES au sujet (pas de clich\u00e9s g\u00e9n\u00e9riques).',
      '  \u00b7 Ex. suggestions (m\u00e9nage des c\u00e2bles)\u00a0: \u00ab\u00a0J\'attends un c\u00e2ble\u00a0\u00bb, \u00ab\u00a0Pas eu le temps\u00a0\u00bb, \u00ab\u00a0Je savais pas par o\u00f9 commencer\u00a0\u00bb.',
      '  \u00b7 Si l\'utilisateur attend quelque chose de concret (pi\u00e8ce, c\u00e2ble, livraison, r\u00e9ponse, approbation, outil\u2026)\u00a0: set_blocked IMM\u00c9DIATEMENT avec enAttente:true + blockedReasons du genre \u00ab\u00a0En attente d\'un c\u00e2ble\u00a0\u00bb (cause = pourquoi, pas une action) + set_progress hors 100% si besoin (progress:0 quand pas commenc\u00e9). Confirme bri\u00e8vement + cardPatches remember, puis encha\u00eene.',
      '  \u00b7 Ex. user \u00ab\u00a0J\'attends un c\u00e2ble\u00a0\u00bb \u2192 actions [{"tool":"set_blocked","args":{"enAttente":true,"blockedReasons":["En attente d\'un c\u00e2ble"]}},{"tool":"set_progress","args":{"progressEnabled":true,"progress":0}}] + message du style \u00ab\u00a0Ok, bloqu\u00e9 en attendant le c\u00e2ble.\u00a0\u00bb puis question suivante utile (ou axes).',
      '  \u00b7 Si c\'est juste \u00ab\u00a0pas eu le temps\u00a0\u00bb / procrastination\u00a0: remember, NE PAS bloquer\u00a0; tu peux demander \u00ab\u00a0Qu\'est-ce qui serait le plus utile pour avancer?\u00a0\u00bb \u2014 et d\u00e8s que la r\u00e9ponse donne des \u00e9tapes concr\u00e8tes, add_subtask (voir plan ci-dessus), pas seulement chatter.',
      '- INTERDIT d\'appliquer permission / qui aux t\u00e2ches perso solo \u00e9videntes. Avancement (\u00ab\u00a0commenc\u00e9?\u00a0\u00bb) reste OK s\'il peut r\u00e9v\u00e9ler un vrai blocage mat\u00e9riel / attente.',
      '',
      'Inf\u00e9rence titre + connaissances (critique)\u00a0:',
      '- Lis le titre et utilise ton bon sens AVANT de poser une question. Ne demande JAMAIS ce qui est \u00e9vident.',
      '- Facilit\u00e9 / effort \u00c9VIDENT (critique)\u00a0: si le titre d\u00e9crit une t\u00e2che clairement triviale / courte (accrocher / installer des dipl\u00f4mes, liker un post, envoyer un mail, renommer un fichier, coller un sticker, changer une ampoule simple\u2026)\u00a0:',
      '  \u00b7 NE POSE PAS \u00ab\u00a0\u00e7a prend du temps?\u00a0\u00bb, \u00ab\u00a0c\'est difficile?\u00a0\u00bb, \u00ab\u00a0c\'est facile?\u00a0\u00bb \u2014 m\u00eame pas en oui/non. C\'est stupide.',
      '  \u00b7 set_priority IMM\u00c9DIATEMENT avec ease \u00e9lev\u00e9e (4\u20135) + set_progress_estimate court (~1\u201315 min selon le cas) et passe \u00e0 une question NON \u00e9vidente (urgence, impact, \u00e9ch\u00e9ance\u2026) \u2014 PAS un POURQUOI.',
      '  \u00b7 Ex. FAUX (dipl\u00f4mes)\u00a0: \u00ab\u00a0Installer les dipl\u00f4mes, \u00e7a prend du temps?\u00a0\u00bb / \u00ab\u00a0C\'est facile?\u00a0\u00bb / \u00ab\u00a0Pourquoi tu veux les installer?\u00a0\u00bb',
      '  \u00b7 Ex. VRAI (dipl\u00f4mes)\u00a0: actions set_priority {ease:5} + set_progress_estimate {estimatedMinutes:10} (sans en parler) + question utile genre impact/urgence.',
      '- Pose facilit\u00e9 / dur\u00e9e SEULEMENT quand l\'effort est r\u00e9ellement ambigu (archivage de rushs, migration, montage, audit, chantier multi-\u00e9tapes, coordination).',
      '- Achat / licence / abonnement / commande / \"obtenir X\" logiciel\u00a0: l\'acte en soi prend ~quelques minutes (pas des heures). Inf\u00e8re une dur\u00e9e tr\u00e8s courte (set_progress_estimate ~1\u20135) et NE pose PAS \u00ab\u00a0\u00c7a prend combien de temps?\u00a0\u00bb.',
      '- Pour ces cartes, la friction = budget + permission / validation. Pose \u00e7a, pas l\'effort ni la dur\u00e9e.',
      '- T\u00e2ches perso solo (critique)\u00a0: si le titre est clairement quelque chose que L\'UTILISATEUR fait seul sur son setup / chez lui / pour lui (c\u00e2bles sur mon ordi, ranger mon bureau, nettoyer mon \u00e9cran, installer un outil perso, accrocher des dipl\u00f4mes\u2026)\u00a0:',
      '  \u00b7 INTERDIT permission / validation / \u00ab\u00a0qui doit donner l\'accord?\u00a0\u00bb / \u00ab\u00a0qui s\'en occupe?\u00a0\u00bb \u2014 \u00e7a d\u00e9pend de personne d\'autre.',
      '  \u00b7 Inf\u00e8re impact Personnel (+ ease / dur\u00e9e si \u00e9vidents) SANS les demander. Passe \u00e0 urgence / impact-confirm / \u00e9ch\u00e9ance \u2014 ou \u00ab\u00a0commenc\u00e9?\u00a0\u00bb seulement si un vrai blocage mat\u00e9riel est plausible. PAS de POURQUOI.',
      '- Ex. FAUX (cable management perso)\u00a0: \u00ab\u00a0Qui doit donner la permission pour avancer sur le cable management?\u00a0\u00bb / \u00ab\u00a0Faut la permission de quelqu\'un?\u00a0\u00bb',
      '- Ex. VRAI (m\u00eame carte)\u00a0: si l\'effort est ambigu, urgence \u00ab\u00a0Si on ne fait pas le m\u00e9nage des c\u00e2bles sur ton ordinateur, c\'est grave?\u00a0\u00bb \u2014 JAMAIS la permission. Si l\'effort est clairement l\u00e9ger, set_priority ease sans poser \u00ab\u00a0\u00e7a prend du temps?\u00a0\u00bb.',
      '- Permission UNIQUEMENT si c\'est plausible\u00a0: achat / budget, plan / strat\u00e9gie d\'\u00e9quipe, validation organisationnelle. PAS pour une corv\u00e9e perso solo.',
      '- INTERDIT les anglicismes et le jargon import\u00e9 dans les questions\u00a0: jamais \u00ab\u00a0skip\u00a0\u00bb, \u00ab\u00a0cable management\u00a0\u00bb, \u00ab\u00a0bosses\u00a0\u00bb, \u00ab\u00a0OK des bosses\u00a0\u00bb, \u00ab\u00a0le deal\u00a0\u00bb, etc. Fran\u00e7ais naturel\u00a0: si on ne fait pas / si on laisse, permission, validation, accord, qui doit signer.',
      '- Si le titre est en anglais / jargon\u00a0: REFORMULE en fran\u00e7ais courant avant de poser la question. Ex. \u00ab\u00a0Cable management sur mon ordinateur\u00a0\u00bb \u2192 \u00ab\u00a0le m\u00e9nage des c\u00e2bles sur ton ordinateur\u00a0\u00bb (pas \u00ab\u00a0le cable management\u00a0\u00bb).',
      '- Ex. FAUX (achat DaVinci)\u00a0: \u00ab\u00a0\u00c7a prend combien de temps?\u00a0\u00bb / \u00ab\u00a0c\'est difficile?\u00a0\u00bb / \u00ab\u00a0Faut l\'OK des bosses?\u00a0\u00bb',
      '- Ex. VRAI (achat DaVinci)\u00a0: \u00ab\u00a0DaVinci Resolve, c\'est cher?\u00a0\u00bb puis \u00ab\u00a0Faut la permission de quelqu\'un pour avancer?\u00a0\u00bb \u2014 et set_progress_estimate court sans demander. PAS de POURQUOI d\'ouverture.',
      '- Si L\'UTILISATEUR te demande ton avis sur la dur\u00e9e (\u00ab\u00a0combien de temps tu penses?\u00a0\u00bb, \u00ab\u00a0\u00e0 ton avis?\u00a0\u00bb)\u00a0: R\u00c9PONDS (ne repose pas la question). Pour un achat / licence\u00a0: ton honn\u00eate opinion + pivot friction.',
      '- Ex. VRAI (user \u00ab\u00a0combien de temps tu penses?\u00a0\u00bb, achat DaVinci)\u00a0: \u00ab\u00a0Je sais pas moi\u2026 Quelques minutes? J\'imagine que le plus difficile l\u00e0-dedans c\'est d\'avoir la permission et surtout le budget.\u00a0\u00bb + set_progress_estimate court, puis question suivante utile (ou close si fini).',
      '- Autres sujets \u00e9vidents\u00a0: \u00ab\u00a0Envoyer un mail\u00a0\u00bb / \u00ab\u00a0Liker un post\u00a0\u00bb / renommer un fichier / installer des dipl\u00f4mes \u2192 dur\u00e9e courte + ease \u00e9lev\u00e9e en silence + PAS de permission + PAS de question facilit\u00e9 + PAS de POURQUOI\u00a0; urgence/impact seulement si utile.',
      '- Ne pose une question que si la r\u00e9ponse change vraiment le scoring. Si tu peux d\u00e9j\u00e0 setter un axe raisonnablement, fais-le dans actions et passe \u00e0 la suite (ou close).',
      '',
      'Style conversationnel (tr\u00e8s important)\u00a0:',
      '- Valide avant de pivoter\u00a0: apr\u00e8s un refus / drop / incertitude (\u00ab\u00a0laisse faire\u00a0\u00bb, \u00ab\u00a0pas maintenant\u00a0\u00bb, \u00ab\u00a0Je ne sais pas\u00a0\u00bb), commence par un ACK court (\u00ab\u00a0Compris.\u00a0\u00bb / \u00ab\u00a0Okay.\u00a0\u00bb) PUIS la question suivante. Ex. FAUX\u00a0: \u00ab\u00a0De quoi veux-tu parler maintenant?\u00a0\u00bb \u2014 Ex. VRAI\u00a0: \u00ab\u00a0Compris. De quoi veux-tu parler maintenant?\u00a0\u00bb',
      '- Pose UNE question COURTE (naturelle, pote). Vise ~6\u201316 mots. JAMAIS de chiffres ni d\'\u00e9chelles \u00ab\u00a00 \u00e0 4\u00a0\u00bb / \u00ab\u00a01 \u00e0 5\u00a0\u00bb.',
      '- Assumer + confirmer (critique, mode dynamique)\u00a0: si tu as un best guess PLAUSIBLE mais PAS \u00e9vident \u00e0 100%\u00a0: avance l\'hypoth\u00e8se et demande confirmation. suggestions = ["Oui","Non"] + suggestionsMulti:false. Si l\'hypoth\u00e8se est DIFFICILE \u00e0 juger pour l\'utilisateur (org / budget / permission / impact large)\u00a0: ["Oui","Non","Je ne sais pas"].',
      '- Si c\'est \u00e9vident (effort trivial, achat = quelques minutes, corv\u00e9e perso = impact personnel)\u00a0: N\'ASK PAS \u2014 m\u00eame pas Oui/Non. set_priority / remember en silence, pose autre chose.',
      '- INTERDIT les questions ouvertes (qui / quoi / laquelle / quelles cons\u00e9quences) quand une hypoth\u00e8se courte tiendrait en oui/non. Transforme-les en confirmation.',
      '- Ex. FAUX (ouvert)\u00a0: \u00ab\u00a0Qui est le plus touch\u00e9 si on ne fait pas installer les dipl\u00f4mes sur le mur?\u00a0\u00bb',
      '- Ex. VRAI (assumer)\u00a0: \u00ab\u00a0Le plus impact\u00e9 si on ne les installe pas, c\'est [[a:toi]]?\u00a0\u00bb + suggestions ["Oui","Non"], suggestionsMulti:false.',
      '- Ex. FAUX (ouvert)\u00a0: \u00ab\u00a0\u00c7a sert \u00e0 quoi exactement?\u00a0\u00bb / \u00ab\u00a0Qui s\'en occupe?\u00a0\u00bb quand tu peux d\u00e9j\u00e0 deviner.',
      '- Ex. VRAI\u00a0: \u00ab\u00a0C\'est surtout pour [[a:impressionner les clients]] qui passent, c\'est \u00e7a?\u00a0\u00bb / \u00ab\u00a0C\'est [[a:toi]] qui t\'en occupes?\u00a0\u00bb + Oui/Non.',
      '- Ex. VRAI (difficile)\u00a0: \u00ab\u00a0Faut la permission de quelqu\'un pour avancer?\u00a0\u00bb + ["Oui","Non","Je ne sais pas"].',
      '- Si Non\u00a0: encha\u00eene avec une autre hypoth\u00e8se OU (seulement alors) une \u00e9chelle / liste courte d\'options. Ne repars pas sur une question trop ouverte.',
      '- Si \u00ab\u00a0Je ne sais pas\u00a0\u00bb\u00a0: ne force pas\u00a0; passe \u00e0 une question plus accessible ou inf\u00e8re prudent.',
      '- Garde les listes / \u00e9chelles (facilite, port\u00e9e multi-acteurs, POURQUOI multi) quand plusieurs r\u00e9ponses distinctes restent utiles ET tu n\'as PAS encore de best guess net.',
      '- Exception multi-raisons\u00a0: si l\'utilisateur donne plusieurs causes spontan\u00e9ment, suggestionsMulti:true OK \u2014 mais ne demande PAS un POURQUOI d\'ouverture.',
      '- Surlignage accent\u00a0: enveloppe le c\u0153ur de la question (1\u20134 mots) dans [[a:\u2026]] (ta couleur d\'identit\u00e9). Ex. "C\'est [[a:toi]]?" / "C\'est pour [[a:quand]]?" / "Qu\'est-ce qui [[a:bloque]]?"',
      '- Contrastes A ou B\u00a0: toujours [[g:]] et [[r:]] sur les deux options + chips heat assorties (0 vert / 4 rouge). Ex. "\u00c7a a [[g:d\u00e9j\u00e0 \u00e9t\u00e9 commenc\u00e9]] ou [[r:pas encore]]?"',
      '- Par d\u00e9faut\u00a0: message = la prochaine question (1 phrase courte). Pas de monologue, pas de rassurance th\u00e9\u00e2trale.',
      '- EXCEPTION\u00a0: si l\'utilisateur te pose une vraie question (\u00ab\u00a0tu penses?\u00a0\u00bb, estime, avis)\u00a0: r\u00e9ponds d\'abord naturellement (1\u20132 phrases), puis encha\u00eene si besoin.',
      '- BRI\u00c8VET\u00c9 (critique)\u00a0: coupe le titre au noyau utile. INTERDIT de recopier le titre long entier OU de coller le jargon anglais du titre tel quel.',
      '- INTERDIT les formulations lourdes\u00a0: \u00ab\u00a0Mener \u00e0 bien\u2026\u00a0\u00bb, \u00ab\u00a0c\'est simple ou \u00e7a demande du travail?\u00a0\u00bb, \u00ab\u00a0Quelle serait la cons\u00e9quence de ne pas\u2026\u00a0\u00bb + titre complet.',
      '- INTERDIT le template robot \u00ab\u00a0Si on skip [titre], \u00e7a presse?\u00a0\u00bb \u2014 \u00e7a sonne faux et m\u00e9lange franglais.',
      '- Une question = une id\u00e9e. Si tu as besoin de d\u00e9tails, pose une suite APR\u00c8S (follow-up), pas tout dans la 1re question.',
      '- Facilit\u00e9 = friction r\u00e9elle (effort, co\u00fbt $, d\u00e9pendances, permission / validation, incertitude) \u2014 PAS toujours \u00ab\u00a0difficile\u00a0\u00bb.',
      '- Choisis la friction qui a du sens pour LE sujet. Achat / licence / abonnement / budget \u2192 co\u00fbt ou permission. Travail tech / process \u2192 effort. Coordination \u2192 d\u00e9pendances. Plan / strat\u00e9gie \u2192 avancement + qui s\'en occupe. Corv\u00e9e perso solo \u2192 effort / temps SEULEMENT \u2014 jamais permission.',
      '- INTERDIT de demander \u00ab\u00a0c\'est difficile?\u00a0\u00bb / \u00ab\u00a0\u00e7a prend du temps?\u00a0\u00bb / \u00ab\u00a0\u00e7a prend combien de temps?\u00a0\u00bb quand l\'effort est \u00e9vident OU clairement pas la friction (ex. accrocher des dipl\u00f4mes, un achat logiciel).',
      '- Ex. FAUX facilit\u00e9\u00a0: \u00ab\u00a0Mener \u00e0 bien l\'archivage des rushs vid\u00e9os et projets DaVinci Resolve, c\'est simple ou \u00e7a demande du travail?\u00a0\u00bb',
      '- Ex. FAUX (achat)\u00a0: \u00ab\u00a0L\'achat de DaVinci Resolve, c\'est difficile?\u00a0\u00bb',
      '- Ex. FAUX (dipl\u00f4mes / trivial)\u00a0: \u00ab\u00a0Installer les dipl\u00f4mes, \u00e7a prend du temps?\u00a0\u00bb',
      '- Ex. VRAI (achat)\u00a0: \u00ab\u00a0DaVinci Resolve, c\'est cher?\u00a0\u00bb',
      '- Ex. VRAI (archivage \u2014 effort ambigu)\u00a0: \u00ab\u00a0Archiver les rushs et projets, \u00e7a prend du temps?\u00a0\u00bb',
      '- Ex. VRAI (dipl\u00f4mes)\u00a0: set_priority ease \u00e9lev\u00e9e + dur\u00e9e courte SANS question facilit\u00e9\u00a0; pose plut\u00f4t impact/urgence.',
      '- Ex. follow-ups utiles ensuite (ACHATS / PLANS seulement)\u00a0: \u00ab\u00a0C\'est le budget ou la permission qui freine?\u00a0\u00bb / \u00ab\u00a0Faut la permission de quelqu\'un pour avancer?\u00a0\u00bb / \u00ab\u00a0Qu\'est-ce qui n\'est pas clair dans le processus?\u00a0\u00bb',
      '- Si le titre / la description sont flous\u00a0: alors clarifie. Sinon, inf\u00e8re et n\'interroge pas pour le plaisir.',
      '- Quand quelque chose bloque la compr\u00e9hension\u00a0: pose une question de clarification concr\u00e8te, puis applique rename_card / set_description / add_subtask / cardPatches si la r\u00e9ponse le permet.',
      '- INTERDIT de r\u00e9capituler ce qui a d\u00e9j\u00e0 \u00e9t\u00e9 dit (\u00ab\u00a0Pour r\u00e9capituler\u00a0\u00bb, \u00ab\u00a0on a \u00e9tabli que\u00a0\u00bb, \u00ab\u00a0cela semble bien cadr\u00e9\u00a0\u00bb, \u00ab\u00a0en r\u00e9sum\u00e9\u00a0\u00bb).',
      '- INTERDIT aussi les accroches de conclusion (\u00ab\u00a0Pour finir\u00a0\u00bb, \u00ab\u00a0Pour terminer\u00a0\u00bb, \u00ab\u00a0Une derni\u00e8re question\u00a0\u00bb, \u00ab\u00a0Enfin\u00a0\u00bb).',
      '- Ex. FAUX\u00a0: \u00ab\u00a0Pour finir, quelle serait la dur\u00e9e estim\u00e9e?\u00a0\u00bb',
      '- Ex. FAUX\u00a0: \u00ab\u00a0Je peux d\u00e9finir l\'\u00e9ch\u00e9ance \u00e0 demain. Je m\'en occupe?\u00a0\u00bb',
      '- Ex. VRAI\u00a0: \u00ab\u00a0C\'est pour quand?\u00a0\u00bb',
      '- Ex. VRAI (si tu proposes d\u00e9j\u00e0 un jour)\u00a0: \u00ab\u00a0Veux-tu que je d\u00e9finisse l\'\u00e9ch\u00e9ance \u00e0 demain?\u00a0\u00bb',
      '- Dur\u00e9e\u00a0: pose \u00ab\u00a0\u00c7a prend combien de temps?\u00a0\u00bb SEULEMENT si le temps n\'est pas \u00e9vident d\'apr\u00e8s le titre (ex. migration, montage, audit). Sinon inf\u00e8re via set_progress_estimate / set_subtask_estimate.',
      '- Questions DIRECTES\u00a0: demande la valeur. INTERDIT les offres molles (\u00ab\u00a0souhaites-tu d\u00e9finir une \u00e9ch\u00e9ance?\u00a0\u00bb, \u00ab\u00a0Je peux / Je m\'en occupe?\u00a0\u00bb).',
      '- Si la r\u00e9ponse est \u00ab\u00a0non\u00a0\u00bb / skip / \u00ab\u00a0pas d\'\u00e9ch\u00e9ance\u00a0\u00bb\u00a0: applique d\'abord tout set_progress / set_priority encore dus d\'apr\u00e8s l\'historique, puis passe \u00e0 autre chose OU close \u2014 JAMAIS un simple \u00ab\u00a0Okay.\u00a0\u00bb (voir cl\u00f4ture ci-dessous).',
      '- Les gens r\u00e9pondent avec des mots\u00a0; TOI tu traduis en axes + progr\u00e8s dans actions (set_priority, set_progress).',
      '- Ancre la question sur le SUJET reformul\u00e9 en fran\u00e7ais courant, PAS \u00ab\u00a0cette t\u00e2che\u00a0\u00bb / \u00ab\u00a0cette carte\u00a0\u00bb, PAS le titre anglais brut.',
      '- Ex. titre \u00ab\u00a0Manger plus de pain avec Eiraul\u00a0\u00bb \u2192 1er tour\u00a0: set_task_types + urgence \u00ab\u00a0Si on ne mange pas plus de pain avec Eiraul, c\'est grave?\u00a0\u00bb (PAS \u00ab\u00a0Pourquoi tu veux\u2026?\u00a0\u00bb).',
      '- Ex. urgence (NON-livrable)\u00a0: \u00ab\u00a0Si on ne mange pas plus de pain avec Eiraul, c\'est grave?\u00a0\u00bb \u2014 pas \u00ab\u00a0livre\u00a0\u00bb.',
      '- Ex. urgence (titre jargon / action)\u00a0: titre \u00ab\u00a0Cable management sur mon ordinateur\u00a0\u00bb \u2192 \u00ab\u00a0Si on ne fait pas le m\u00e9nage des c\u00e2bles sur ton ordinateur, c\'est grave?\u00a0\u00bb',
      '- Ex. FAUX urgence (non-livrable)\u00a0: \u00ab\u00a0Si on ne le livre pas, c\'est grave?\u00a0\u00bb',
      '- Ex. FAUX urgence\u00a0: \u00ab\u00a0Si on skip le cable management, \u00e7a presse?\u00a0\u00bb',
      '- Ex. urgence (mauvais)\u00a0: \u00ab\u00a0Si cette t\u00e2che n\'\u00e9tait pas faite, quelles seraient les cons\u00e9quences?\u00a0\u00bb',
      '- Ex. FAUX (1er tour)\u00a0: \u00ab\u00a0Pourquoi tu veux ce plan?\u00a0\u00bb / \u00ab\u00a0Si on ne met pas en place cette strat\u00e9gie, \u00e7a change quoi?\u00a0\u00bb',
      '- Ex. FAUX impact (ouvert)\u00a0: \u00ab\u00a0Qui est le plus touch\u00e9 si on ne le fait pas?\u00a0\u00bb',
      '- Ex. VRAI impact (assumer)\u00a0: \u00ab\u00a0Le plus impact\u00e9 si on ne le fait pas, c\'est [[a:toi]]?\u00a0\u00bb + ["Oui","Non"].',
      '- Ex. FAUX facilit\u00e9 (\u00e9vident)\u00a0: \u00ab\u00a0Installer les dipl\u00f4mes, \u00e7a prend du temps?\u00a0\u00bb \u2014 juste set_priority ease:5.',
      '- Ex. facilit\u00e9 (seulement si ambigu)\u00a0: \u00ab\u00a0Archiver les rushs, \u00e7a prend du temps?\u00a0\u00bb',
      '- Ex. facilit\u00e9 (co\u00fbt)\u00a0: \u00ab\u00a0DaVinci Resolve, c\'est cher?\u00a0\u00bb',
      '- Suggestions = 2\u20134 r\u00e9ponses COURTES \u00e0 TA question, ancr\u00e9es dans le titre / sujet. Si la question est une confirmation d\'hypoth\u00e8se facile\u00a0: Oui / Non. Pas de nombres.',
      '- \u00ab\u00a0Je ne sais pas\u00a0\u00bb (choix, parfois)\u00a0: si la question est DIFFICILE / externe / incertaine pour l\'utilisateur (permission, budget / co\u00fbt exact, qui doit valider, impact org, d\u00e9pendance hors de son contr\u00f4le, processus flou)\u00a0: ajoute \u00ab\u00a0Je ne sais pas\u00a0\u00bb comme DERNI\u00c8RE suggestion (apr\u00e8s les options concr\u00e8tes).',
      '- Ex. permission / co\u00fbt ambigu\u00a0: ["Oui","Non","Je ne sais pas"] ou ["Pas cher","Correct","Tr\u00e8s cher","Je ne sais pas"].',
      '- Ex. confirmation difficile\u00a0: ["Oui","Non","Je ne sais pas"] (pas seulement Oui/Non).',
      '- INTERDIT d\'ajouter \u00ab\u00a0Je ne sais pas\u00a0\u00bb partout\u00a0: saute-le sur les questions \u00e9videntes / perso qu\'iel doit conna\u00eetre (POURQUOI, \u00ab\u00a0c\'est toi?\u00a0\u00bb sur une corv\u00e9e perso, facile/difficile ressenti, commenc\u00e9 ou non, ce qui est d\u00e9j\u00e0 fait).',
      '- Si l\'utilisateur r\u00e9pond \u00ab\u00a0Je ne sais pas\u00a0\u00bb / \u00ab\u00a0Je sais pas\u00a0\u00bb\u00a0: OK bref, NE PAS en faire un fait m\u00e9moris\u00e9, NE PAS reposer la m\u00eame question\u00a0; encha\u00eene sur autre chose utile (ou inf\u00e8re prudent / leave l\'axe). Ce n\'est PAS un skip interview global.',
      '- MINIMUM ABSOLU\u00a0: toute question (?) DOIT avoir \u22652 suggestions concr\u00e8tes. suggestions=[] avec une question = \u00c9CHEC.',
      '- Quand tu demandes un nom / un libell\u00e9 (sous-t\u00e2che, livrable\u2026)\u00a0: proposes \u22652 bons best-guess tir\u00e9s du contexte (titre, d\u00e9j\u00e0 fait, reste). INTERDIT de demander sans chips.',
      '- Ex. FAUX\u00a0: \u00ab\u00a0Quel nom souhaites-tu donner \u00e0 la sous-t\u00e2che pour l\'organisation des c\u00e2bles?\u00a0\u00bb + suggestions=[].',
      '- Ex. VRAI\u00a0: m\u00eame question + suggestions ["Installer les accessoires","Attacher les c\u00e2bles","\u00c9tiqueter les c\u00e2bles"].',
      '- Varie les formulations\u00a0: pour un continuum (avanc\u00e9 / facilit\u00e9 / avancement), offre 3 nuances quand c\'est utile. Pour une confirmation d\'hypoth\u00e8se\u00a0: Oui/Non suffit (ne force PAS une \u00e9chelle).',
      '- Les suggestions doivent \u00eatre CONTEXTUELLES\u00a0: acteurs, livrable, co\u00fbt, effort ou options LI\u00c9ES \u00e0 cette carte \u2014 pas une grille g\u00e9n\u00e9rique r\u00e9utilisable. Pas de chips \u00ab\u00a0raisons de vivre\u00a0\u00bb / POURQUOI d\'ouverture.',
      '- INTERDIT les clich\u00e9s hors sujet\u00a0: \u00ab\u00a0Quelqu\'un attend\u00a0\u00bb, \u00ab\u00a0\u00c7a bloque d\'autres trucs\u00a0\u00bb, \u00ab\u00a0Cons\u00e9quences graves\u00a0\u00bb, sauf si c\'est exactement ce que la question porte.',
      '- Ex. FAUX (urgence archivage rushs / DaVinci)\u00a0: \u00ab\u00a0Pas grand-chose\u00a0\u00bb, \u00ab\u00a0Quelqu\'un attend\u00a0\u00bb, \u00ab\u00a0Cons\u00e9quences graves\u00a0\u00bb, \u00ab\u00a0\u00c7a bloque d\'autres trucs\u00a0\u00bb.',
      '- Ex. VRAI (m\u00eame question)\u00a0: \u00ab\u00a0Pas grand chose\u00a0\u00bb, \u00ab\u00a0On pourrait avoir de la difficult\u00e9 \u00e0 retrouver des anciens projets\u00a0\u00bb, \u00ab\u00a0On pourrait perdre des anciens projets\u00a0\u00bb.',
      '- L\'utilisateur ne multi-s\u00e9lectionne QUE si tu mets suggestionsMulti:true (causes/cons\u00e9quences cumulables). Sinon suggestionsMulti:false = un seul clic.',
      '- Pour \u00e9chelles exclusives (facilit\u00e9, port\u00e9e)\u00a0: suggestionsMulti:false + ordonne doux\u2192intense (VERT\u2192ROUGE) ou cercle bleu\u2192vert.',
      '- INTERDIT de mettre le plus dur avant le milieu. Ex. FAUX\u00a0: \u00ab\u00a0C\'est facile\u00a0\u00bb, \u00ab\u00a0C\'est difficile\u00a0\u00bb, \u00ab\u00a0C\'est faisable\u00a0\u00bb.',
      '- Ex. VRAI facilit\u00e9 (effort)\u00a0: \u00ab\u00a0C\'est facile\u00a0\u00bb (vert) \u2192 \u00ab\u00a0C\'est faisable\u00a0\u00bb (jaune) \u2192 \u00ab\u00a0C\'est difficile\u00a0\u00bb (rouge) + suggestionsMulti:false.',
      '- Ex. VRAI facilit\u00e9 (co\u00fbt)\u00a0: \u00ab\u00a0Pas cher\u00a0\u00bb (vert) \u2192 \u00ab\u00a0Correct\u00a0\u00bb (jaune) \u2192 \u00ab\u00a0Tr\u00e8s cher\u00a0\u00bb (rouge) + suggestionsMulti:false.',
      '- Pour cons\u00e9quences / causes cumulables\u00a0: suggestionsMulti:true\u00a0; chaque suggestion doit tenir seule OU avec d\'autres.',
      '- Impact / qui est touch\u00e9 (ordre de pr\u00e9f\u00e9rence)\u00a0:',
      '  1) Best guess plausible (souvent toi / personnel sur une corv\u00e9e perso)\u00a0: question de confirmation + ["Oui","Non"], suggestionsMulti:false. Si Oui \u2192 set_priority impact Personnel sans passer par l\'\u00e9chelle.',
      '  2) Seulement si Non / pas de guess net\u00a0: alors \u00e9chelle port\u00e9e (libell\u00e9s + icon + color, bleu\u2192vert) + suggestionsMulti:false.',
      '- Port\u00e9e / \u00e9chelle (fallback seulement)\u00a0: INTERDIT "0 (Personnel)", "1 (\u00c9quipe)"\u2026 Utilise\u00a0:',
      '  Personnel circle-xs/blue \u00b7 \u00c9quipe circle-sm/teal \u00b7 Interne circle-md/yellow \u00b7 Population circle-lg/green \u00b7 Global circle-xl/green.',
      '- Sur \u00e9chelle impact\u00a0: si context.userName est connu, inclus TOUJOURS l\'utilisateur (ex. pr\u00e9nom + circle-xs/blue). INTERDIT de ne lister que \u00e9quipe / utilisateurs / clients en omettant la personne.',
      '- Ex. VRAI impact (assumer, dipl\u00f4mes)\u00a0: {"message":"Le plus impact\u00e9 si on ne les installe pas, c\'est toi?","suggestions":["Oui","Non"],"suggestionsMulti":false}',
      '- Ex. VRAI impact (fallback \u00e9chelle apr\u00e8s Non)\u00a0: \u00ab\u00a0Impact sur Alex\u00a0\u00bb, \u00ab\u00a0Impact sur l\'\u00e9quipe\u00a0\u00bb, \u00ab\u00a0Impact sur les utilisateurs\u00a0\u00bb.',
      '- Ex. port\u00e9e JSON (pr\u00e9nom connu, fallback)\u00a0: {"suggestions":[{"label":"Alex","icon":"circle-xs","color":"blue"},{"label":"\u00c9quipe","icon":"circle-sm","color":"teal"},{"label":"Population","icon":"circle-lg","color":"green"}],"suggestionScale":true,"suggestionsMulti":false}',
      '- Ic\u00f4nes dispo\u00a0: circle-xs|circle-sm|circle-md|circle-lg|circle-xl|dots|hammer|calm-face|exclaim|user|users|building|globe|flame|check|ban|clock|bolt|layers|hourglass.',
      '- Urgence\u00a0: calm-face (\u00ab\u00a0Pas urgent\u00a0\u00bb) et exclaim (!! pour Urgent). INTERDIT hammer/bolt pour l\'urgence.',
      '- Colorie les \u00e9chelles de gravit\u00e9 avec heat 0\u20134 (0=vert, 4=rouge), OU suggestionScale:true + strings ordonn\u00e9es.',
      '- Ex. facilit\u00e9 JSON (effort)\u00a0: {"suggestions":[{"label":"C\'est facile","heat":0},{"label":"C\'est faisable","heat":2},{"label":"C\'est difficile","heat":4}],"suggestionScale":true,"suggestionsMulti":false}',
      '- Ex. facilit\u00e9 JSON (co\u00fbt)\u00a0: {"suggestions":[{"label":"Pas cher","heat":0},{"label":"Correct","heat":2},{"label":"Tr\u00e8s cher","heat":4}],"suggestionScale":true,"suggestionsMulti":false}',
      '- Ex. port\u00e9e JSON (sans pr\u00e9nom)\u00a0: {"suggestions":[{"label":"Personnel","icon":"circle-xs","color":"blue"},{"label":"\u00c9quipe","icon":"circle-sm","color":"teal"},{"label":"Population","icon":"circle-lg","color":"green"}],"suggestionScale":true,"suggestionsMulti":false}',
      '- Ex. multi JSON\u00a0: {"suggestions":[{"label":"On perd le contexte des rushs"},{"label":"La direction serait vraiment f\u00e2ch\u00e9e"}],"suggestionsMulti":true}',
      '- Utilise \u2026 seulement pour une r\u00e9ponse \u00e0 compl\u00e9ter (ex. \u00ab\u00a0On risque de perdre\u2026\u00a0\u00bb).',
      '',
      'Inf\u00e9rence + clarification carte\u00a0:',
      '- D\u00e8s le 1er tour\u00a0: PAS de POURQUOI. Inf\u00e8re set_task_types + axes \u00e9vidents (ex. achat logiciel \u2192 dur\u00e9e courte) et pose UNE question utile seulement si un axe reste ambigu.',
      '- D\u00e8s qu\'une r\u00e9ponse laisse assez d\'indices\u00a0: set_priority IMM\u00c9DIATEMENT avec les axes d\u00e9duits + remember but/livrable si donn\u00e9 spontan\u00e9ment + set_task_types si pas encore pos\u00e9 / \u00e0 raffiner (unlocked), puis pose directement la question suivante (sans r\u00e9sumer) OU close.',
      '- Mise \u00e0 jour des propri\u00e9t\u00e9s (TOUJOURS \u00e0 l\'\u0153il \u2014 c\'est le job)\u00a0:',
      '  \u00b7 \u00c0 CHAQUE r\u00e9ponse utilisateur, demande-toi\u00a0: types?\u00a0progr\u00e8s?\u00a0urgence?\u00a0impact?\u00a0facilit\u00e9?\u00a0blocage?\u00a0\u00e9ch\u00e9ance? Si oui \u2192 actions correspondantes ce tour-ci.',
      '  \u00b7 Chatter sans actions alors que l\'info change clairement un champ = \u00c9CHEC.',
      '  \u00b7 thinking DOIT lister bri\u00e8vement les champs \u00e0 mettre \u00e0 jour (ou \u00ab\u00a0aucun\u00a0\u00bb).',
      '- Une r\u00e9ponse peut combiner plusieurs suggestions (s\u00e9par\u00e9es par \u00ab\u00a0. \u00a0\u00bb)\u00a0: inf\u00e8re en tenant compte de TOUT le message.',
      '- Ex. POURQUOI spontan\u00e9\u00a0: user \u00ab\u00a0Aligner les messages entre services. Mieux joindre les citoyens\u00a0\u00bb \u2192 cardPatches [{"op":"remember","text":"Pourquoi\u00a0: aligner les messages entre services\u00a0; mieux joindre les citoyens"}] + prochaine question utile (ou axes) \u2014 sans avoir demand\u00e9 le pourquoi.',
      '- Ex.\u00a0: user \u00ab\u00a0La direction serait vraiment tr\u00e8s f\u00e2ch\u00e9e\u00a0\u00bb \u2192 urgence \u00e9lev\u00e9e (3\u20134) + cardPatches remember + message = seule la question suivante courte.',
      '- Ex. achat logiciel\u00a0: user \u00ab\u00a0Tr\u00e8s cher\u00a0\u00bb \u2192 ease bas (1\u20132) + cardPatches remember co\u00fbt + estimatedDurationMinutes court + question \u00ab\u00a0Faut la permission de quelqu\'un pour avancer?\u00a0\u00bb.',
      '- Ex. plan commenc\u00e9\u00a0: user \u00ab\u00a0Oui, un peu\u00a0\u00bb \u2192 cardPatches [{"op":"remember","text":"Plan d\u00e9j\u00e0 commenc\u00e9 (un peu)"}] + set_progress {progressEnabled:true, progress:30} + question \u00ab\u00a0Qu\'est-ce qui est d\u00e9j\u00e0 fait?\u00a0\u00bb.',
      '- Ex. d\u00e9j\u00e0 fait (critique)\u00a0: user \u00ab\u00a0J\'ai choisi les dipl\u00f4mes \u00e0 installer. J\'ai pr\u00e9par\u00e9 l\'emplacement\u00a0\u00bb \u2192 add_subtask {text:"Choisir les dipl\u00f4mes", done:true} + add_subtask {text:"Pr\u00e9parer l\'emplacement", done:true} + set_progress {progressEnabled:true, progress:40} + remember + question reste \u00e0 faire.',
      '- Ex. plan presque fini\u00a0: user \u00ab\u00a0Oui, presque termin\u00e9\u00a0\u00bb \u2192 set_progress {progressEnabled:true, progress:85} + remember + question sur le reste (PAS l\'\u00e9ch\u00e9ance tant qu\'il reste du travail).',
      '- Ex. plan fini / 100%\u00a0: user \u00ab\u00a0Oui, c\'est termin\u00e9\u00a0\u00bb / \u00ab\u00a0100%\u00a0\u00bb \u2192 set_progress {progressEnabled:true, progress:100} + trigger_effect confetti + message f\u00e9licitations (Bravo\u2026). INTERDIT \u00e9ch\u00e9ance. Si axes d\u00e9j\u00e0 ok\u00a0: completeInterview:true\u00a0; sinon question d\'axe utile ensuite.',
      '- Ex. plan pas commenc\u00e9\u00a0: user \u00ab\u00a0Non, pas encore\u00a0\u00bb \u2192 cardPatches remember + set_progress {progressEnabled:true, progress:0} (ou laisse 0) + message \u00ab\u00a0Pourquoi \u00e7a n\'a pas \u00e9t\u00e9 commenc\u00e9?\u00a0\u00bb + suggestions contextuelles.',
      '- Ex. attente mat\u00e9riel\u00a0: user \u00ab\u00a0J\'attends un c\u00e2ble\u00a0\u00bb \u2192 set_blocked enAttente:true blockedReasons ["En attente d\'un c\u00e2ble"] + set_progress {progress:0} si pas commenc\u00e9 / encore \u00e0 100% + remember + message \u00ab\u00a0Ok, bloqu\u00e9 en attendant le c\u00e2ble.\u00a0\u00bb + suite.',
      '- Ex. user \u00ab\u00a0L\'\u00e9quipe com s\'en occupe\u00a0\u00bb \u2192 cardPatches {"op":"remember","text":"Qui\u00a0: \u00e9quipe com"} + patches {"op":"remember","text":"L\'\u00e9quipe com travaille sur le plan de strat\u00e9gie de communication"} (utile au tableau).',
      '- Ex. permission\u00a0: user \u00ab\u00a0Faut l\'accord du responsable\u00a0\u00bb \u2192 cardPatches + patches {"op":"remember","text":"Le responsable valide / donne la permission pour avancer sur ce genre de plan"}.',
      '- M\u00e9moire \u2014 deux niveaux (critique)\u00a0:',
      '  \u00b7 cardPatches = d\u00e9pendant de CETTE t\u00e2che (POURQUOI, livrable, but, d\u00e9j\u00e0 fait, reste \u00e0 faire, contraintes locales).',
      '  \u00b7 patches = projet / tableau (qui approuve, qui travaille sur quoi, r\u00f4les, normes, faits r\u00e9utilisables sur d\'autres cartes).',
      '  \u00b7 Tr\u00e8s important et vrai au-del\u00e0 de la carte \u2192 patches (remember si durable, note si provisoire). Sinon \u2192 cardPatches.',
      '- Formats cardPatches utiles\u00a0: \u00ab\u00a0Pourquoi\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0Livrable\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0Qui\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0Permission\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0D\u00e9j\u00e0 fait\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0Reste\u00a0: \u2026\u00a0\u00bb.',
      '- Si la r\u00e9ponse clarifie le p\u00e9rim\u00e8tre\u00a0: rename_card (titre plus clair), set_description (r\u00e9sum\u00e9 court + misc absents des autres champs\u00a0; INTERDIT dump Pourquoi/Livrable/Qui/D\u00e9j\u00e0 fait/Reste), add_subtask (\u00e9tapes concr\u00e8tes) \u2014 sans inventer.',
      '- Ex. user explique les \u00e9tapes d\'archivage \u2192 add_subtask pour chaque \u00e9tape claire + remember le process + question courte suivante.',
      '- Ne repose pas ce qui est d\u00e9j\u00e0 dans context.cardMemory.facts, context.memory, ou l\'historique (surtout un \u00ab\u00a0Pourquoi\u00a0:\u00a0\u00bb d\u00e9j\u00e0 not\u00e9).',
      '',
      'Le SUJET de la carte (cardName raccourci) est ta piste\u00a0: ancre sans recopier le titre verbatim. Voisinage / r\u00e9cent = indices seulement.',
      'Les axes priority actuels sont des VALEURS PAR D\u00c9FAUT non fiables sauf si priorityAxesTrusted=true.',
      '',
      'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
      '{"thinking":"...","message":"...","suggestions":[{"label":"...","icon":"circle-sm","color":"teal","heat":0}],"suggestionScale":true,"suggestionsMulti":false,"prompts":[],"actions":[{"tool":"...","args":{}}],"cardPatches":[{"op":"remember","text":"..."}],"patches":[{"op":"remember","text":"..."}],"completeInterview":false}',
      '',
      'R\u00e8gles interview\u00a0:',
      '- Une question claire \u00e0 la fois (sauf avis / cl\u00f4ture / apart\u00e9). Reste court.',
      '- Apart\u00e9s / questions hors fil (critique)\u00a0: l\'utilisateur PEUT digresser sans casser l\'interview.',
      '  \u00b7 Identit\u00e9 (change ta couleur / ton nom / ta perso)\u00a0: APPLIQUE set_agent_color / set_agent_name / set_agent_personality TOUT DE SUITE + confirme en 1 demi-phrase, PUIS encha\u00eene directement la PROCHAINE vraie question d\'interview (sujet/axes/avancement).',
      '  \u00b7 Autre hors-sujet (blague, calcul, culture, \u00ab\u00a0t\'es une IA?\u00a0\u00bb)\u00a0: r\u00e9ponds bri\u00e8vement, puis reprend la prochaine question utile. Ne refuse jamais.',
      '  \u00b7 INTERDIT les meta-questions du genre \u00ab\u00a0On continue avec l\'installation des dipl\u00f4mes?\u00a0\u00bb / \u00ab\u00a0On reprend?\u00a0\u00bb / \u00ab\u00a0Tu veux continuer?\u00a0\u00bb \u2014 reprise = la vraie question suivante, sans demander la permission.',
      '  \u00b7 Ex. FAUX\u00a0: user \u00ab\u00a0change ta couleur pour dor\u00e9\u00a0\u00bb \u2192 message \u00ab\u00a0On continue avec l\'installation des dipl\u00f4mes?\u00a0\u00bb (et z\u00e9ro set_agent_color).',
      '  \u00b7 Ex. VRAI\u00a0: user \u00ab\u00a0change ta couleur pour dor\u00e9\u00a0\u00bb \u2192 set_agent_color {color:"yellow"} + color:"yellow" + message \u00ab\u00a0Okay, dor\u00e9! Le plus impact\u00e9 si on ne les accroche pas, c\'est [[a:toi]]?\u00a0\u00bb + suggestions Oui/Non.',
      '  \u00b7 Ex. VRAI\u00a0: user \u00ab\u00a0change ta propre couleur pour orange\u00a0\u00bb \u2192 set_agent_color {color:"orange"} + color:"orange" + OK bref + prochaine question (pas \u00ab\u00a0On continue?\u00a0\u00bb).',
      '  \u00b7 completeInterview reste false sur un apart\u00e9 \u2014 l\'interview continue.',
      '- INTERDIT les r\u00e9caps / synth\u00e8ses entre questions. Le contexte et les actions suffisent.',
      '- INTERDIT de cadrer une question comme \u00ab\u00a0la derni\u00e8re\u00a0\u00bb ou une conclusion\u00a0: jamais \u00ab\u00a0Pour finir\u00a0\u00bb, \u00ab\u00a0Pour terminer\u00a0\u00bb, \u00ab\u00a0Pour conclure\u00a0\u00bb, \u00ab\u00a0Enfin\u00a0\u00bb, \u00ab\u00a0Une derni\u00e8re question\u00a0\u00bb.',
      '- Pose la prochaine question utile. Ne dis JAMAIS que c\'est la fin / le dernier tour.',
      '- Cl\u00f4ture (completeInterview:true) \u2014 tr\u00e8s important\u00a0:',
      '- Quand plus de question utile (urgence+impact+ease fix\u00e9s ou inf\u00e9rables, skip \u00e9ch\u00e9ance, passer / plus tard)\u00a0: completeInterview:true. Le POURQUOI n\'est PAS requis.',
      '- Avant de cl\u00f4turer\u00a0: v\u00e9rifie que set_progress / set_priority / add_subtask dus d\'apr\u00e8s l\'historique sont bien dans actions de CE tour (ne laisse pas la carte \u00e0 jour \u00ab\u00a0seulement dans ta t\u00eate\u00a0\u00bb).',
      '- \u00ab\u00a0Noter la priorit\u00e9\u00a0\u00bb = APPLIQUER set_priority (critique)\u00a0:',
      '  \u00b7 Si TU proposes de noter / enregistrer / figer la priorit\u00e9 et l\'utilisateur dit oui / note / vas-y / ok\u00a0: CE TOUR doit contenir set_priority avec les axes d\u00e9duits (urgence/impact/ease ou tier) + TOUS les add_subtask encore dus d\'apr\u00e8s l\'historique (plans / \u00e9tapes d\u00e9crites mais absentes de progress.items) + completeInterview:true si plus de question utile.',
      '  \u00b7 INTERDIT de r\u00e9pondre \u00ab\u00a0Okay, j\'ai not\u00e9\u2026\u00a0\u00bb / \u00ab\u00a0C\'est not\u00e9\u00a0\u00bb avec actions=[] (ou seulement cardPatches)\u00a0: sans set_priority (+ sous-t\u00e2ches dues) = \u00c9CHEC.',
      '  \u00b7 Ex. VRAI (confirm)\u00a0: user \u00ab\u00a0Oui, note la priorit\u00e9\u00a0\u00bb apr\u00e8s un plan disque/Windows/Drive \u2192 set_priority {urgency:3, impact:0, \u2026} + add_subtask pour chaque \u00e9tape manquante + completeInterview:true + message court ancr\u00e9 (pas un faux \u00ab\u00a0j\'ai not\u00e9\u00a0\u00bb sans outils).',
      '  \u00b7 Ex. FAUX\u00a0: {"message":"Okay, j\'ai not\u00e9 la priorit\u00e9\u2026","actions":[],"completeInterview":true}.',
      '- INTERDIT de terminer avec seulement \u00ab\u00a0Okay.\u00a0\u00bb / \u00ab\u00a0C\'est not\u00e9.\u00a0\u00bb / \u00ab\u00a0Ok.\u00a0\u00bb / \u00ab\u00a0D\'accord.\u00a0\u00bb',
      '- \u00c0 la place\u00a0: UNE remarque courte, un peu s\u00e8che / maligne, ancr\u00e9e dans CE qu\'on vient de discuter (sujet de la carte, budget, permission, avancement, ce que tu peux / ne peux pas faire) \u2014 ET les actions carte correspondantes.',
      '- Varie\u00a0: pique sur l\'\u00e9change, offre concr\u00e8te d\'aide, aveu d\'impuissance utile, ou nudge (\u00ab\u00a0va demander si y\'a le budget\u00a0\u00bb). Montre que tu as compris le contexte.',
      '- Ex. FAUX (apr\u00e8s \u00ab\u00a0Pas d\'\u00e9ch\u00e9ance\u00a0\u00bb sur achat DaVinci)\u00a0: \u00ab\u00a0Okay.\u00a0\u00bb',
      '- Ex. VRAI\u00a0: \u00ab\u00a0Bon, sans deadline c\'est surtout une question de thunes et de permission. Si on veut vraiment Resolve, faut aller demander s\'ils ont le budget.\u00a0\u00bb + set_priority si axes connus.',
      '- Ex. VRAI (autre, message de cl\u00f4ture)\u00a0: \u00ab\u00a0Moi je peux te noter la priorit\u00e9\u00a0; le reste, c\'est plut\u00f4t une conversation avec la compta.\u00a0\u00bb \u2014 et si l\'utilisateur accepte ensuite, APPLIQUE set_priority (ne te contente pas de le dire).',
      '- Ex. VRAI (skip total)\u00a0: \u00ab\u00a0Ok on laisse \u00e7a. Reviens quand t\'auras une id\u00e9e du budget ou qui doit valider.\u00a0\u00bb',
      '- INTERDIT de demander \u00ab\u00a0sur une \u00e9chelle de 0 \u00e0 4\u00a0\u00bb, des chiffres seuls, ou des l\u00e9gendes.',
      '- Maximise le gain d\'info avec le MOINS de questions\u00a0: inf\u00e8re axes d\'abord\u00a0; clarifie le titre seulement s\'il est trop vague pour scorer\u00a0; (plans / achats seulement, si n\u00e9cessaire) permission / qui / commenc\u00e9 / d\u00e9j\u00e0 fait / reste\u00a0; pose seulement ce qui reste ambigu. Sur une corv\u00e9e perso solo\u00a0: saute permission/qui et passe aux axes utiles (urgence, effort) en mode assumer+Oui/Non quand possible. INTERDIT le POURQUOI motivation.',
      '- N\'invente PAS d\'\u00e9ch\u00e9ance, projet, sous-t\u00e2ches ou description sans indice (titre, r\u00e9ponse, voisinage). La dur\u00e9e COURTE pour un achat / un clic / un mail\u00a0: OK \u00e0 inf\u00e9rer.',
      '- Si l\'utilisateur dit passer / plus tard / skip / non merci\u00a0: completeInterview:true, actions=[] (sauf ce que tu as d\u00e9j\u00e0 assez pour appliquer) + message de cl\u00f4ture malin (pas \u00ab\u00a0Okay.\u00a0\u00bb).',
      '- Quand urgence+impact+ease sont fix\u00e9s\u00a0: tu peux encore poser UNE question courte utile (projet, clarification, OU \u00e9ch\u00e9ance SEULEMENT si elle manque) SANS dire que c\'est la derni\u00e8re\u00a0; sinon completeInterview:true + cl\u00f4ture maligne. Pas de question dur\u00e9e si d\u00e9j\u00e0 inf\u00e9r\u00e9e.',
      '- Pour \u00e9ch\u00e9ance\u00a0: \u00ab\u00a0C\'est pour quand?\u00a0\u00bb (+ Aujourd\'hui / Demain / Pas d\'\u00e9ch\u00e9ance) \u2014 SEULEMENT si due N\'EST PAS d\u00e9j\u00e0 active (voir alreadyKnown.dueActive / context.due) ET la t\u00e2che n\'est PAS d\u00e9j\u00e0 \u00e0 100% / termin\u00e9e.',
      '- INTERDIT d\'offrir / demander une \u00e9ch\u00e9ance si set_progress\u2192100, complete_all_subtasks, ou context.progress d\u00e9j\u00e0 \u00e0 100. F\u00e9licite \u00e0 la place.',
      '- INTERDIT d\'offrir / demander une \u00e9ch\u00e9ance si alreadyKnown.dueActive=true (due.enabled + dueDate). L\'\u00e9ch\u00e9ance est d\u00e9j\u00e0 pos\u00e9e\u00a0: passe aux axes ou cl\u00f4ture.',
      '- Ex. FAUX (due d\u00e9j\u00e0 l\u00e0)\u00a0: apr\u00e8s le POURQUOI, message \u00ab\u00a0C\'est pour quand?\u00a0\u00bb alors que context.due.dueDate est d\u00e9fini.',
      '- Ex. VRAI (due d\u00e9j\u00e0 l\u00e0)\u00a0: apr\u00e8s le POURQUOI \u2192 urgence / impact / facilit\u00e9 (ou completeInterview si axes ok).',
      '- Pour dur\u00e9e\u00a0: seulement si incertaine \u2192 \u00ab\u00a0\u00c7a prend combien de temps?\u00a0\u00bb. Sinon set_progress_estimate sans demander. Pour projet\u00a0: \u00ab\u00a0Quel projet?\u00a0\u00bb.',
      '- completeInterview:true quand l\'interview est termin\u00e9e.',
      '- \u00c9vite de reposer les questions d\u00e9j\u00e0 pos\u00e9es.',
      '- INTERDIT\u00a0: \u00ab\u00a0Comment puis-je vous aider?\u00a0\u00bb / questions vagues ouvertes sans ancrage.',
      '',
      'Champs / faits d\u00e9j\u00e0 connus (critique \u2014 LIS before asking)\u00a0:',
      '- Consulte alreadyKnown + context.due / cardMemory / asked / historique AVANT chaque question.',
      '- INTERDIT de demander ce qui est d\u00e9j\u00e0 renseign\u00e9 ou \u00e9vident d\'apr\u00e8s le titre / la m\u00e9moire / le contexte carte.',
      '- Si alreadyKnown.dueActive\u00a0: z\u00e9ro question d\'\u00e9ch\u00e9ance.',
      '- Si alreadyKnown.whyKnown\u00a0: z\u00e9ro POURQUOI (de toute fa\u00e7on INTERDIT).',
      '- INTERDIT toute question motivation \u00ab\u00a0Pourquoi tu veux\u2026?\u00a0\u00bb m\u00eame si whyKnown=false.',
      '- Si alreadyKnown.taskTypesKnown\u00a0: ne repose pas la classification\u00a0; adapte tes questions \u00e0 context.taskTypes.',
      '- Si tu peux setter un axe / une dur\u00e9e / des types raisonnablement\u00a0: fais-le dans actions, ne pose pas la question.',
      '',
      'Anti-boucle avancement (runtime \u2014 OBLIGATOIRE)\u00a0:',
      '- Lis context.interview.progressScout avant de poser d\u00e9j\u00e0-fait / reste.',
      '- Si askedDone=true\u00a0: INTERDIT toute reformulation \u00ab\u00a0d\u00e9j\u00e0 fait\u00a0\u00bb.',
      '- Si askedRemaining=true\u00a0: INTERDIT toute reformulation \u00ab\u00a0reste \u00e0 faire\u00a0\u00bb.',
      '- Si askedRemaining=true et askedDone=false\u00a0: NE pose PAS \u00ab\u00a0d\u00e9j\u00e0 fait\u00a0\u00bb ensuite (ordre invers\u00e9 = boucle). Passe aux axes.',
      '- Si blockFurtherScout=true OU (memoryHasDone et memoryHasRemaining)\u00a0: plus AUCUN rep\u00e9rage d\u00e9j\u00e0/reste\u00a0; axes / \u00e9ch\u00e9ance (si absente) / cl\u00f4ture.',
      '',
      'Outils autoris\u00e9s dans actions\u00a0:',
      '- set_priority: { urgency?, impact?, ease?, tier?, priorityEnabled? }',
      '- set_task_types: { types: string[], force?: boolean } (multi\u00a0; ids catalog\u00a0; silencieux\u00a0; respect taskTypesLocked)',
      '- set_due: { dueDate?: YYYY-MM-DD, dueTime?: HH:MM, relativeHours?, relativeMinutes?, dueVague?: proche|lointain|eventuellement, startDate?, recurrence?, clear? }',
      '- set_blocked: { enAttente?: boolean, blockedReasons?: string[] } (si l\'utilisateur attend quelque chose de concret\u00a0: enAttente:true + cause \u00ab\u00a0En attente de\u2026\u00a0\u00bb)',
      '- set_members: { add?, remove? }',
      '- set_labels: { add?, remove?, create? }',
      '- set_progress: { progress?:0-100, progressEnabled?: boolean } (active le bloc Progr\u00e8s + % carte\u00a0; OBLIGATOIRE d\u00e8s qu\'on parle d\'avancement)',
      '- set_project: { projectId?, matchText?, name?, clear? }',
      '- rename_card: { name } (titre plus clair / plus court si la r\u00e9ponse le justifie)',
      '- set_description: { desc } (r\u00e9sum\u00e9 court + misc\u00a0; pas de dump Pourquoi/Livrable/Qui/\u00e9ch\u00e9ance/d\u00e9j\u00e0 fait/reste\u00a0; desc = texte complet)',
      '- add_subtask: { text, estimatedMinutes? } (quand une \u00e9tape concr\u00e8te \u00e9merge clairement\u00a0; done:true si d\u00e9j\u00e0 faite)',
      '- toggle_subtask: { id?|matchText?, done?: boolean } (cocher une \u00e9tape d\u00e9j\u00e0 dans progress.items)',
      '- set_subtask_progress: { id?|matchText?, progress: 0-100 }',
      '- set_subtask_estimate / set_progress_estimate: dur\u00e9es Progr\u00e8s',
      '- trigger_effect: { effect } (confetti / flowers quand progress=100 \u2014 f\u00e9licitations)',
      '- set_agent_color: { color } (apart\u00e9 couleur\u00a0: orange|yellow|green|purple|blue|pink|red|teal|coral|sky ou #RRGGBB\u00a0; dor\u00e9/gold \u2192 yellow)',
      '- set_agent_name: { name } (apart\u00e9 nom)',
      '- set_agent_personality: { personality } (apart\u00e9 perso)',
      '- prompts optionnels: [{ "type":"priority_axes", "urgency":n, "impact":n, "ease":n }] (apr\u00e8s inf\u00e9rence)',
      '',
      'Contexte carte / interview\u00a0:',
      JSON.stringify({
        today: context.today,
        nowTime: context.nowTime,
        cardName: context.cardName,
        cardDesc: context.cardDesc,
        priority: context.priority,
        taskTypes: context.taskTypes || [],
        taskTypesLocked: !!context.taskTypesLocked,
        due: context.due || null,
        blocked: context.blocked || null,
        progress: context.progress || null,
        goals: context.goals || null,
        memory: context.memory,
        cardMemory: context.cardMemory || { facts: [] },
        profile: context.profile,
        userName: context.userName || '',
        asked: context.interview.asked,
        surrounding: context.interview.surrounding,
        recentCards: context.interview.recentCards,
        priorityAxesTrusted: context.interview.priorityAxesTrusted,
        progressScout: context.interview.progressScout,
        alreadyKnown: summarizeInterviewAlreadyKnown(context)
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

    var debug = {
      id: 'interview-' + Date.now().toString(36),
      kind: 'cardInterviewTurn',
      label: 'Tour d\u2019interview',
      startedAt: Date.now(),
      attempts: []
    };

    function recordAttempt(label, metaOrErr) {
      if (metaOrErr && metaOrErr.meta) {
        debug.attempts.push(Object.assign({ label: label }, metaOrErr.meta));
        dbgLog('agent', 'cardInterviewTurn.fetch', dbgFetchMeta(label, metaOrErr));
        return;
      }
      if (metaOrErr && metaOrErr.debugMeta) {
        debug.attempts.push(Object.assign({ label: label }, metaOrErr.debugMeta));
        dbgLog('agent', 'cardInterviewTurn.fetch', dbgFetchMeta(label, metaOrErr));
        return;
      }
      debug.attempts.push({
        label: label,
        error: (metaOrErr && metaOrErr.message) || String(metaOrErr || 'error'),
        ok: false
      });
      dbgLog('agent', 'cardInterviewTurn.fetch', dbgFetchMeta(label, metaOrErr));
    }

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
          max_tokens: 720,
          temperature: 0.45,
          onDelta: onDelta
            ? function (_piece, accumulated) {
                notifyVisible(accumulated);
              }
            : undefined
        });
        recordAttempt(onDelta ? 'stream + json' : 'non-stream + json', response);
      } catch (err) {
        recordAttempt(onDelta ? 'stream + json' : 'non-stream + json', err);
        if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            stream: !!onDelta,
            max_tokens: 720,
            temperature: 0.45,
            onDelta: onDelta
              ? function (_piece, accumulated) {
                  notifyVisible(accumulated);
                }
              : undefined
          });
          recordAttempt(
            onDelta ? 'stream (sans json mode)' : 'non-stream (sans json mode)',
            response
          );
        } else if (err && /stream/i.test((err && err.message) || '')) {
          dbgLog('agent', 'cardInterviewTurn.fetch', {
            attempt: onDelta ? 'stream + json' : 'non-stream + json',
            ok: false,
            fallback: 'stream-rejected'
          });
          response = await chatCompletions(p, messages, {
            jsonMode: true,
            stream: false,
            max_tokens: 720,
            temperature: 0.45
          });
          recordAttempt('non-stream + json', response);
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
      dbgError('agent', 'cardInterviewTurn.end', fatal, { latencyMs: debug.latencyMs, ok: false });
      debug.request = debug.attempts.length
        ? debug.attempts[debug.attempts.length - 1]
        : buildRequestMeta(p, {
            model: p.model,
            messages: messages,
            temperature: 0.45,
            stream: !!onDelta,
            max_tokens: 720,
            response_format: { type: 'json_object' }
          });
      fatal.debug = debug;
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
    var colorRewrite = rewriteActionsForAgentColor(
      actions,
      userText,
      parsed.message || '',
      parsed.color
    );
    actions = colorRewrite.actions;
    // Interview may only apply a subset of tools.
    var allowedTools = {
      set_priority: true,
      set_task_types: true,
      set_due: true,
      set_blocked: true,
      set_members: true,
      set_labels: true,
      set_custom_assignees: true,
      set_member_roles: true,
      add_checklist_item: true,
      remove_checklist_item: true,
      rename_checklist_item: true,
      set_checklist_progress: true,
      history_undo: true,
      history_redo: true,
      history_revert: true,
      set_progress: true,
      set_project: true,
      add_subtask: true,
      toggle_subtask: true,
      set_subtask_blocked: true,
      set_subtask_progress: true,
      set_subtask_estimate: true,
      set_progress_estimate: true,
      rename_card: true,
      set_description: true,
      trigger_effect: true,
      set_agent_name: true,
      set_agent_color: true,
      set_agent_personality: true
    };
    actions = actions.filter(function (a) {
      return a && allowedTools[a.tool];
    });

    var message = polishAssistantVisibleText(
      stripScaleLegendParenthetical(
        polishMessageAfterTierApply(
          parsed.message || (data && data.message) || '',
          tierRewrite.tier,
          tierRewrite.injected
        )
      )
    );
    var progressGuard = applyProgressCompleteGuards(
      {
        message: message,
        actions: actions,
        suggestions: null,
        emotion: parsed.emotion || null
      },
      context
    );
    message = progressGuard.message;
    actions = progressGuard.actions;
    var emotion = progressGuard.emotion;
    var replyColor = colorRewrite.color || parsed.color || null;
    var prompts = ensurePriorityAxesPrompt(
      normalizePrompts(parsed.prompts, context),
      actions,
      context
    );
    var blocks = normalizeBlocks(parsed.blocks, context);

    var suggestionScale = wantsSuggestionScale(data) || wantsSuggestionScale(parsed);
    var scoutGuard = applyInterviewProgressScoutGuards(
      {
        message: message,
        suggestions: (data && data.suggestions) || parsed.suggestions,
        suggestionsMulti:
          wantsSuggestionsMulti(data) || wantsSuggestionsMulti(parsed),
        suggestionScale: suggestionScale
      },
      context,
      history
    );
    var scoutRedirected = scoutGuard.message !== message;
    message = scoutGuard.message;
    if (scoutRedirected) {
      suggestionScale = !!scoutGuard.suggestionScale || suggestionScale;
    }

    var whyGuard = applyInterviewWhyGuards(
      {
        message: message,
        suggestions: scoutRedirected
          ? scoutGuard.suggestions
          : (data && data.suggestions) || parsed.suggestions,
        suggestionsMulti: scoutRedirected
          ? scoutGuard.suggestionsMulti
          : wantsSuggestionsMulti(data) || wantsSuggestionsMulti(parsed),
        suggestionScale: suggestionScale,
        completeInterview: !!(
          (data && data.completeInterview) ||
          scoutGuard.completeInterview
        )
      },
      context,
      history
    );
    var whyRedirected = whyGuard.message !== message;
    message = whyGuard.message;
    if (whyRedirected) {
      suggestionScale = !!whyGuard.suggestionScale || suggestionScale;
      scoutRedirected = true;
      scoutGuard = whyGuard;
    }

    var dueGuard = applyKnownDueGuards(
      {
        message: message,
        suggestions: scoutRedirected
          ? scoutGuard.suggestions
          : (data && data.suggestions) || parsed.suggestions,
        suggestionsMulti:
          scoutRedirected
            ? scoutGuard.suggestionsMulti
            : wantsSuggestionsMulti(data) || wantsSuggestionsMulti(parsed),
        suggestionScale: suggestionScale,
        completeInterview: !!(
          (data && data.completeInterview) ||
          scoutGuard.completeInterview
        )
      },
      context
    );
    var dueRedirected = dueGuard.message !== message;
    message = dueGuard.message;
    if (dueRedirected) {
      suggestionScale = !!dueGuard.suggestionScale || suggestionScale;
      scoutRedirected = true;
      scoutGuard = dueGuard;
    }

    if (onDelta && message) {
      try {
        onDelta(message, content);
      } catch (finalCbErr) {
        console.error('cardInterviewTurn final onDelta failed', finalCbErr);
      }
    }

    var completeInterview = !!(
      (data && data.completeInterview) ||
      scoutGuard.completeInterview ||
      dueGuard.completeInterview
    );
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
    var patches = normalizeBoardPatches(
      (data && data.patches) || (parsed && parsed.patches)
    );

    var suggestionEntries = normalizeSuggestionEntries(
      scoutRedirected
        ? scoutGuard.suggestions
        : (data && data.suggestions) || parsed.suggestions,
      5,
      {
        scale: suggestionScale,
        rankGreenToRed: true,
        userName: context.userName,
        message: message
      }
    );
    // Interview answer chips (no "?") are ordinal soft→intense when unmarked.
    if (
      suggestionEntries.length >= 2 &&
      suggestionEntries.length <= 5 &&
      suggestionEntries.every(function (entry) {
        return entry.text.indexOf('?') < 0;
      })
    ) {
      suggestionEntries = orderSuggestionsGreenToRed(
        suggestionEntries,
        context.userName
      );
      var hasHeat = suggestionEntries.some(function (entry) {
        return entry.heat != null;
      });
      var hasNamedColor = suggestionEntries.some(function (entry) {
        return !!entry.color;
      });
      if (!hasHeat && !hasNamedColor) {
        var interviewSteps = spreadScaleHeat(suggestionEntries.length);
        suggestionEntries.forEach(function (entry, i) {
          entry.heat = interviewSteps[i];
        });
        suggestionEntries = orderSuggestionsGreenToRed(
          suggestionEntries,
          context.userName
        );
      }
    }
    suggestionEntries = ensurePersonalImpactSuggestion(
      suggestionEntries,
      context.userName,
      message
    );
    suggestionEntries = linkSuggestionColorsToHighlights(
      suggestionEntries,
      message
    );
    suggestionEntries = orderSuggestionsGreenToRed(
      suggestionEntries,
      context.userName
    );
    suggestionEntries = filterDueSuggestionsWhenComplete(
      suggestionEntries,
      actions,
      context
    );

    var latencyMs = Date.now() - t0;
    usage.latencyMs = latencyMs;
    debug.endedAt = Date.now();
    debug.latencyMs = latencyMs;
    debug.ok = true;
    debug.request =
      (response && response.meta) ||
      (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response && response.meta && response.meta.status,
      content: content,
      raw: cloneJsonSafe(response && response.raw),
      parsed: {
        message: message,
        suggestions: suggestionEntries,
        prompts: prompts,
        blocks: blocks,
        actions: actions,
        completeInterview: completeInterview,
        droppedActions: parsed.droppedActions || []
      }
    };
    debug.usage = usage;

    dbgLog('agent', 'cardInterviewTurn.end', {
      ok: true,
      latencyMs: latencyMs,
      actionCount: (actions || []).length,
      droppedCount: (parsed.droppedActions || []).length,
      completeInterview: completeInterview
    });

    return {
      message: message,
      emotion: emotion || parsed.emotion || null,
      color: replyColor,
      suggestions: suggestionEntries,
      suggestionsMulti: scoutRedirected
        ? !!scoutGuard.suggestionsMulti
        : wantsSuggestionsMulti(data) || wantsSuggestionsMulti(parsed),
      actions: actions,
      prompts: prompts,
      blocks: blocks,
      followUps: parsed.followUps || [],
      cardPatches: cardPatches,
      patches: patches,
      completeInterview: completeInterview,
      droppedActions: parsed.droppedActions || [],
      rawJson: content,
      context: context,
      usage: usage,
      debug: debug
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
      action.tool === 'toggle_subtask' ||
      action.tool === 'set_subtask_blocked'
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
    if (action.tool === 'trigger_effect') {
      var fxOk = !!normalizeEffectId(args.effect || args.name || args.id);
      if (!fxOk) return false;
      var fxNorm = normalizeEffectId(args.effect || args.name || args.id);
      if (fxNorm === 'banner') {
        var bannerText =
          (typeof args.text === 'string' && args.text.trim()) ||
          (typeof args.label === 'string' && args.label.trim()) ||
          (typeof args.message === 'string' && args.message.trim());
        return !!bannerText;
      }
      return true;
    }
    if (action.tool === 'point_at') {
      var pointSection = normalizePointSection(
        args.section || args.target || args.area || args.panel
      );
      var pointField = normalizePointField(args.field || args.axis || args.dim);
      return !!(pointSection || pointField);
    }
    if (action.tool === 'set_agent_name') {
      return (
        (typeof args.name === 'string' && !!args.name.trim()) ||
        (typeof args.text === 'string' && !!args.text.trim())
      );
    }
    if (action.tool === 'set_agent_color') {
      var colorRaw =
        (typeof args.color === 'string' && args.color) ||
        (typeof args.aura === 'string' && args.aura) ||
        (typeof args.value === 'string' && args.value) ||
        (typeof args.text === 'string' && args.text) ||
        '';
      return !!normalizeAgentColorArg(colorRaw);
    }
    if (action.tool === 'set_agent_personality') {
      return (
        (typeof args.personality === 'string' && !!args.personality.trim()) ||
        (typeof args.text === 'string' && !!args.text.trim()) ||
        (typeof args.value === 'string' && !!args.value.trim())
      );
    }
    if (action.tool === 'set_task_types') {
      var typeArgs =
        args.types != null
          ? args.types
          : args.taskTypes != null
            ? args.taskTypes
            : null;
      return Array.isArray(typeArgs) || typeof typeArgs === 'string';
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
    if (action.tool === 'set_subtask_blocked') {
      return 'set_subtask_blocked: id (ou matchText) requis';
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
    if (action.tool === 'trigger_effect') {
      var fxTry = normalizeEffectId(
        action.args && (action.args.effect || action.args.name || action.args.id)
      );
      if (fxTry === 'banner') {
        return 'trigger_effect: banner exige text (texte plein \u00e9cran)';
      }
      return (
        'trigger_effect: effect requis (' + EFFECT_IDS.join('|') + ')'
      );
    }
    if (action.tool === 'point_at') {
      return 'point_at: section ou field requis';
    }
    if (action.tool === 'set_agent_name') {
      return 'set_agent_name: name requis';
    }
    if (action.tool === 'set_agent_color') {
      return 'set_agent_color: color requis (orange|yellow|…|sky ou #RRGGBB)';
    }
    if (action.tool === 'set_agent_personality') {
      return 'set_agent_personality: personality requis';
    }
    if (action.tool === 'set_task_types') {
      return (
        'set_task_types: types requis (action|project|recurring|exploratory|emotional|communication|deliverable|process|thinking|material|learning|admin|creative|finance|custom-*)'
      );
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
      actions: polishFollowUpActions(out).slice(0, 5),
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

  /**
   * Named colors (FR/EN) → heat 0–4 (green → red) for severity scales.
   * Blue/teal stay as named colors (impact reach) and do not map to heat.
   */
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
    gray: 0,
    grey: 0,
    gris: 0
  };

  /** Colors rendered as named accents (not green→red heat). */
  var SUGGESTION_NAMED_COLORS = {
    blue: true,
    bleu: 'blue',
    teal: true,
    cyan: 'teal',
    yellow: true,
    jaune: 'yellow',
    lime: true,
    green: true,
    vert: 'green',
    orange: true,
    red: true,
    rouge: 'red',
    gray: true,
    grey: 'gray',
    gris: 'gray'
  };

  /** Icons the model may set on suggestion chips. */
  var SUGGESTION_ICON_IDS = [
    'circle-xs',
    'circle-sm',
    'circle-md',
    'circle-lg',
    'circle-xl',
    'dots',
    'hammer',
    'calm-face',
    'exclaim',
    'user',
    'users',
    'building',
    'globe',
    'flame',
    'check',
    'ban',
    'clock',
    'bolt',
    'layers',
    'hourglass'
  ];

  var IMPACT_REACH_SUGGESTION = {
    personnel: {
      icon: 'circle-xs',
      color: 'blue',
      label: 'Personnel',
      heat: null
    },
    equipe: {
      icon: 'circle-sm',
      color: 'teal',
      label: '\u00c9quipe',
      heat: null
    },
    interne: {
      icon: 'circle-md',
      color: 'yellow',
      label: 'Interne',
      heat: null
    },
      population: {
      icon: 'circle-lg',
      color: 'green',
      label: 'Population',
      heat: null
    },
    global: {
      icon: 'circle-xl',
      color: 'green',
      label: 'Global',
      heat: null
    }
  };

  function clampSuggestionHeat(value) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(n)) return null;
    return Math.max(0, Math.min(4, Math.round(n)));
  }

  function normalizeSuggestionColorName(raw) {
    if (typeof raw !== 'string') return null;
    var key = raw.trim().toLowerCase();
    if (!key) return null;
    var mapped = SUGGESTION_NAMED_COLORS[key];
    if (mapped === true) return key;
    if (typeof mapped === 'string') return mapped;
    return null;
  }

  function normalizeSuggestionIconId(raw) {
    if (typeof raw !== 'string') return null;
    var key = raw.trim().toLowerCase();
    var aliases = {
      'small-circle': 'circle-xs',
      'circle-small': 'circle-xs',
      small: 'circle-xs',
      'medium-circle': 'circle-md',
      'circle-medium': 'circle-md',
      medium: 'circle-md',
      'big-circle': 'circle-lg',
      'circle-big': 'circle-lg',
      big: 'circle-lg',
      'huge-circle': 'circle-xl',
      'circle-huge': 'circle-xl',
      huge: 'circle-xl',
      'three-dots': 'dots',
      '3-dots': 'dots',
      ellipsis: 'dots',
      calm: 'calm-face',
      'face-calm': 'calm-face',
      smile: 'calm-face',
      relaxed: 'calm-face',
      '!!': 'exclaim',
      bangs: 'exclaim',
      'double-exclaim': 'exclaim',
      'exclamation-marks': 'exclaim',
      exclamations: 'exclaim'
    };
    if (aliases[key]) key = aliases[key];
    return SUGGESTION_ICON_IDS.indexOf(key) >= 0 ? key : null;
  }

  function heatFromSuggestionItem(item) {
    if (!item || typeof item !== 'object') return null;
    if (item.heat != null) return clampSuggestionHeat(item.heat);
    if (typeof item.color === 'string') {
      var key = item.color.trim().toLowerCase();
      // Blue/teal are reach accents — keep out of green→red heat.
      if (key === 'blue' || key === 'bleu' || key === 'teal' || key === 'cyan') {
        return null;
      }
      if (Object.prototype.hasOwnProperty.call(SUGGESTION_COLOR_HEAT, key)) {
        return SUGGESTION_COLOR_HEAT[key];
      }
    }
    return null;
  }

  function colorFromSuggestionItem(item) {
    if (!item || typeof item !== 'object') return null;
    if (typeof item.color !== 'string') return null;
    return normalizeSuggestionColorName(item.color);
  }

  function iconFromSuggestionItem(item) {
    if (!item || typeof item !== 'object') return null;
    return normalizeSuggestionIconId(item.icon);
  }

  function impactReachKeyFromText(text, knownName) {
    var raw = String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    if (!raw) return null;
    var numbered = raw.match(
      /^(?:impact\s*[=:]?\s*)?([0-4])\s*[\-–—:(]\s*(.+?)\s*\)?$/
    );
    if (numbered) raw = numbered[2].trim();
    raw = raw.replace(/^(portee|impact)\s*[=:]?\s*/, '').trim();
    // "Impact sur l'équipe" / "sur moi" conversational chips
    raw = raw.replace(/^sur\s+/, '').trim();
    if (/^(personnel|moi|individuel|individual|me)$/.test(raw)) return 'personnel';
    if (/^(l['\u2019]?equipe|equipe|team|squad)$/.test(raw)) return 'equipe';
    if (/^(interne|l['\u2019]?org(anisation)?|entreprise|company)$/.test(raw)) {
      return 'interne';
    }
    if (
      /^(les?\s+)?(population|clients?|usagers?|utilisateurs?|communaute|users?)$/.test(
        raw
      )
    ) {
      return 'population';
    }
    if (/^(global|mondial|world|planet)$/.test(raw)) return 'global';
    if (knownName) {
      var nameKey = String(knownName)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      var first = nameKey.split(/\s+/)[0];
      if (
        (first && first.length >= 2 && (raw === first || raw.indexOf(first) === 0)) ||
        (nameKey.length >= 2 && raw === nameKey)
      ) {
        return 'personnel';
      }
    }
    return null;
  }

  function foldMatchText(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function listProgressSubtaskLabels(context, maxItems) {
    var cap = maxItems != null ? maxItems : 6;
    var items =
      context && context.progress && Array.isArray(context.progress.items)
        ? context.progress.items
        : [];
    var out = [];
    var seen = {};
    for (var i = 0; i < items.length; i++) {
      var text =
        items[i] && typeof items[i].text === 'string' ? items[i].text.trim() : '';
      if (!text) continue;
      var key = foldMatchText(text);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(text);
      if (out.length >= cap) break;
    }
    return out;
  }

  /** Assistant asks which existing subtask to rename / change / delete / complete. */
  function looksLikeSubtaskPickQuestion(message) {
    var raw = String(message || '');
    if (!/\?/.test(raw)) return false;
    var m = foldMatchText(raw);
    var pickVerb =
      /(changer|renommer|supprimer|modifier|cocher|terminer|completer|rename|change|edit|delete|remove|complete|check off)/.test(
        m
      );
    // "Quelle sous-tâche…?" / "Which subtask…?" implies picking an existing one.
    if (
      /quelle sous-tache/.test(m) ||
      /quelles sous-taches/.test(m) ||
      /which subtask/.test(m)
    ) {
      return true;
    }
    // "Quel est le nom de la sous-tâche que tu veux changer?" — not bare add prompts.
    if (
      (/nom de la sous-tache/.test(m) ||
        /name of the subtask/.test(m) ||
        /what('?s| is) the (name|title) of the subtask/.test(m)) &&
      pickVerb
    ) {
      return true;
    }
    if (/sous-tache/.test(m) && pickVerb) return true;
    if (/subtask/.test(m) && pickVerb) return true;
    return /laquelle/.test(m) && pickVerb;
  }

  function titleLikeSuggestionEntries(entries) {
    var out = [];
    (entries || []).forEach(function (entry) {
      var text =
        typeof entry === 'string'
          ? entry.trim()
          : entry && typeof entry.text === 'string'
            ? entry.text.trim()
            : '';
      if (!text || /\?/.test(text)) return;
      var folded = foldMatchText(text);
      if (
        /^(quelle|quel|quelles|what|which)\b/.test(folded) ||
        /^(definir|marquer|ajouter une autre)\b/.test(folded)
      ) {
        return;
      }
      out.push({ text: text, heat: null, icon: null, color: null });
    });
    return out;
  }

  function defaultCreateSubtaskTitles(context) {
    var isEn = !!(context && context.profile && context.profile.language === 'en');
    return isEn
      ? ['Check the brief', 'Contact the client', 'Prepare the delivery']
      : ['V\u00e9rifier le brief', 'Contacter le client', 'Pr\u00e9parer la livraison'];
  }

  /**
   * When the assistant asks which subtask to pick: surface live progress.items,
   * or pivot to create-titles if the card has none.
   */
  async function enrichSubtaskPickTurn(parsed, context, options) {
    options = options || {};
    if (!parsed || !looksLikeSubtaskPickQuestion(parsed.message)) {
      return parsed;
    }
    var isEn = !!(context && context.profile && context.profile.language === 'en');
    var labels = listProgressSubtaskLabels(context, 6);
    if (labels.length) {
      parsed.suggestions = labels.map(function (text) {
        return { text: text, heat: null, icon: null, color: null };
      });
      parsed.suggestionsMulti = false;
      return parsed;
    }

    parsed.message = isEn
      ? "There's no subtask on this card yet. You can create one — what title do you want?"
      : "Y a pas encore de sous-t\u00e2che sur cette carte. Tu peux en cr\u00e9er une \u2014 quel titre tu veux?";

    var titles = titleLikeSuggestionEntries(parsed.suggestions);
    if (titles.length < 2 && typeof options.suggestTitles === 'function') {
      try {
        var generated = await options.suggestTitles();
        titles = titleLikeSuggestionEntries(generated || []);
      } catch (err) {
        console.error('enrichSubtaskPickTurn suggestTitles failed', err);
      }
    }
    if (titles.length < 2) {
      titles = titleLikeSuggestionEntries(defaultCreateSubtaskTitles(context));
    }
    parsed.suggestions = titles.slice(0, 4);
    parsed.suggestionsMulti = false;
    return parsed;
  }

  /**
   * If impact-audience chips omit the known user, prepend "Impact sur {name}".
   */
  function ensurePersonalImpactSuggestion(entries, userName, message) {
    var name = String(userName || '').trim();
    if (!name || !Array.isArray(entries) || entries.length < 2) {
      return entries || [];
    }
    var firstName = name.split(/\s+/)[0];
    if (!firstName) return entries;

    function fold(s) {
      return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    }

    function looksLikeAudience(text) {
      var raw = fold(text).trim();
      if (/^(impact\s+sur|sur)\s+/.test(raw)) return true;
      return !!impactReachKeyFromText(text, name);
    }

    function mentionsUser(text) {
      var raw = fold(text);
      if (/\b(moi|personnel|individuel|me)\b/.test(raw)) return true;
      var key = fold(firstName);
      return key.length >= 2 && raw.indexOf(key) >= 0;
    }

    var audienceHits = 0;
    for (var i = 0; i < entries.length; i++) {
      if (looksLikeAudience(entries[i].text)) audienceHits += 1;
    }
    var messageLooksImpact = /impact|touch[eé]|port[eé]e|qui\s+(est|sont)/i.test(
      String(message || '')
    );
    if (audienceHits < 2 && !(messageLooksImpact && audienceHits >= 1)) {
      return entries;
    }
    if (audienceHits < Math.ceil(entries.length * 0.5) && audienceHits < 2) {
      return entries;
    }
    if (
      entries.some(function (entry) {
        return mentionsUser(entry.text);
      })
    ) {
      return entries;
    }

    var personal = {
      text: 'Impact sur ' + firstName,
      heat: null,
      icon: 'circle-xs',
      color: 'blue'
    };
    return [personal].concat(entries).slice(0, 5);
  }

  /** Rewrite numbered reach chips (0 Personnel…) into labelled icon+color chips. */
  function enrichImpactReachSuggestions(entries, userName) {
    if (!Array.isArray(entries) || entries.length < 2) return entries || [];
    var keys = entries.map(function (entry) {
      return impactReachKeyFromText(entry.text, userName);
    });
    var hit = keys.filter(Boolean).length;
    if (hit < 2 || hit < Math.ceil(entries.length * 0.6)) return entries;
    return entries.map(function (entry, i) {
      var meta = keys[i] ? IMPACT_REACH_SUGGESTION[keys[i]] : null;
      if (!meta) return entry;
      var label = meta.label;
      var conversational = /^(impact\s+sur|sur)\s+/i.test(String(entry.text || ''));
      if (conversational) {
        label = entry.text;
      } else if (keys[i] === 'personnel' && userName) {
        var first = String(userName).trim().split(/\s+/)[0];
        var folded = String(entry.text || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        var firstFold = String(first || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        if (firstFold && folded.indexOf(firstFold) >= 0) {
          label = entry.text;
        } else if (first) {
          label = first;
        }
      }
      return {
        text: label,
        heat: null,
        icon: entry.icon || meta.icon,
        color: entry.color || meta.color
      };
    });
  }

  /** Calm face for "pas urgent…", !! for clear "urgent / critique". */
  function urgencyIconFromText(text) {
    var raw = String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    if (!raw) return null;
    if (
      /pas\s+(du\s+tout\s+)?urgent|aucune?\s+(urgence|pression)|not\s+urgent|no\s+rush|zero\s+urgen/.test(
        raw
      ) ||
      /^(calme|tranquille|relaxed|aucune)$/.test(raw)
    ) {
      return 'calm-face';
    }
    if (
      /(tres|vraiment|super)\s+urgent|urgentes?\b|critique\b|asap|immediate/.test(raw) &&
      !/pas\s+|peu\s+|assez\s+|moyenne?|faible|legere?/.test(raw)
    ) {
      return 'exclaim';
    }
    return null;
  }

  function enrichUrgencyIcons(entries) {
    if (!Array.isArray(entries) || !entries.length) return entries || [];
    return entries.map(function (entry) {
      var icon = urgencyIconFromText(entry.text);
      if (!icon) return entry;
      return {
        text: entry.text,
        heat: entry.heat,
        icon: icon,
        color: entry.color
      };
    });
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
  function orderSuggestionsGreenToRed(entries, userName) {
    if (!Array.isArray(entries) || entries.length < 2) {
      return entries || [];
    }
    // Impact reach (blue→green + circle icons) must not be remapped to heat.
    var reachHits = entries.filter(function (entry) {
      return impactReachKeyFromText(entry.text, userName);
    }).length;
    if (reachHits >= 2 && reachHits >= Math.ceil(entries.length * 0.6)) {
      return enrichImpactReachSuggestions(entries, userName);
    }
    var list = entries.map(function (entry) {
      return {
        text: entry.text,
        heat: entry.heat,
        icon: entry.icon || null,
        color: entry.color || null,
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
      return {
        text: item.text,
        heat: steps[i],
        icon: item.icon,
        color: item.color
      };
    });
  }

  /**
   * Normalize AI suggestions to { text, heat, icon, color }[].
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
      var icon = null;
      var color = null;
      if (typeof item === 'string') {
        text = item.trim();
      } else if (item && typeof item === 'object') {
        if (typeof item.label === 'string') text = item.label.trim();
        else if (typeof item.text === 'string') text = item.text.trim();
        else if (typeof item.suggestion === 'string') text = item.suggestion.trim();
        heat = heatFromSuggestionItem(item);
        icon = iconFromSuggestionItem(item);
        color = colorFromSuggestionItem(item);
        // Named blue/teal never become heat; keep the accent color.
        if (color && (color === 'blue' || color === 'teal')) heat = null;
      }
      text = stripSpaceBeforePunctuation(text);
      if (!isWorthySuggestion(text)) return;
      if (
        out.some(function (entry) {
          return entry.text === text;
        })
      ) {
        return;
      }
      out.push({ text: text, heat: heat, icon: icon, color: color });
    });
    out = enrichUrgencyIcons(
      enrichImpactReachSuggestions(out.slice(0, max), options.userName)
    );
    var hasHeat = out.some(function (entry) {
      return entry.heat != null;
    });
    var hasNamedColor = out.some(function (entry) {
      return !!entry.color;
    });
    if (options.scale && !hasHeat && !hasNamedColor) {
      var steps = spreadScaleHeat(out.length);
      out.forEach(function (entry, i) {
        entry.heat = steps[i];
      });
    }
    if (options.scale || options.rankGreenToRed) {
      out = orderSuggestionsGreenToRed(out, options.userName);
    }
    out = ensurePersonalImpactSuggestion(
      out,
      options.userName,
      options.message || ''
    );
    out = linkSuggestionColorsToHighlights(out, options.message || '');
    if (options.rankGreenToRed || options.scale) {
      out = orderSuggestionsGreenToRed(out, options.userName);
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

  /**
   * Whether answer chips allow multi-select (AI-controlled).
   * true = cumulable answers; false/omitted = single choice.
   */
  function wantsSuggestionsMulti(parsed) {
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.suggestionsMulti === true || parsed.suggestionMulti === true) {
      return true;
    }
    if (parsed.multiSelect === true || parsed.multiAnswers === true) {
      return true;
    }
    if (
      parsed.suggestionsMulti === false ||
      parsed.suggestionMulti === false ||
      parsed.multiSelect === false ||
      parsed.multiAnswers === false
    ) {
      return false;
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

  var FACE_EMOTION_ALLOW = {
    neutral: true,
    happy: true,
    sad: true,
    surprised: true,
    curious: true,
    thinking: true,
    tongue: true,
    wideEyed: true,
    lookUp: true,
    lookDown: true,
    lookLeft: true,
    lookRight: true,
    excited: true,
    wink: true
  };

  function normalizeAssistantEmotion(value) {
    var raw = String(value || '')
      .trim()
      .toLowerCase();
    if (!raw) return null;
    var aliases = {
      joyeux: 'happy',
      content: 'happy',
      triste: 'sad',
      surpris: 'surprised',
      curieux: 'curious',
      pense: 'thinking',
      'r\u00e9fl\u00e9chit': 'thinking',
      reflechit: 'thinking',
      excite: 'excited',
      'excit\u00e9': 'excited',
      langue: 'tongue',
      clin: 'wink',
      gauche: 'lookLeft',
      droite: 'lookRight'
    };
    if (aliases[raw]) raw = aliases[raw];
    if (FACE_EMOTION_ALLOW[raw]) return raw;
    return null;
  }

  function normalizeAssistantColor(value) {
    var raw = String(value || '')
      .trim()
      .toLowerCase();
    if (global.UserProfile && typeof global.UserProfile.normalizeAgentColor === 'function') {
      var fromProfile = global.UserProfile.normalizeAgentColor(raw);
      if (fromProfile) return fromProfile;
    }
    var allow = {
      orange: true,
      yellow: true,
      green: true,
      purple: true,
      blue: true,
      pink: true,
      red: true,
      teal: true,
      coral: true,
      sky: true
    };
    if (allow[raw]) return raw;
    if (raw === 'jaune' || raw === 'gold' || raw === 'amber' || raw === 'dore') return 'yellow';
    if (raw === 'peach' || raw === 'warm') return 'orange';
    if (raw === 'vert' || raw === 'lime') return 'green';
    if (raw === 'violet' || raw === 'lavender') return 'purple';
    if (raw === 'bleu') return 'blue';
    if (raw === 'rose') return 'pink';
    if (raw === 'rouge') return 'red';
    if (raw === 'turquoise' || raw === 'cyan' || raw === 'mint') return 'teal';
    if (raw === 'ciel') return 'sky';
    if (raw.charAt(0) !== '#' && /^[0-9a-f]{3}([0-9a-f]{3})?$/.test(raw)) {
      raw = '#' + raw;
    }
    if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
    if (/^#[0-9a-f]{3}$/.test(raw)) {
      return (
        '#' +
        raw.charAt(1) +
        raw.charAt(1) +
        raw.charAt(2) +
        raw.charAt(2) +
        raw.charAt(3) +
        raw.charAt(3)
      );
    }
    return null;
  }

  function parseAssistantPayload(content) {
    var text = typeof content === 'string' ? content.trim() : '';
    if (!text) {
      return {
        message: 'R\u00e9ponse vide du fournisseur.',
        emotion: null,
        color: null,
        followUps: [],
        suggestions: [],
        suggestionsMulti: false,
        prompts: [],
        blocks: [],
        actions: [],
        droppedActions: [],
        cardPatches: [],
        patches: [],
        selfPrompt: false,
        selfPromptFocus: ''
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
        rankGreenToRed: !!suggestionScale,
        message: message
      });
      if (!suggestions.length) {
        suggestions = suggestionsFromFollowUps(followUps).map(function (text) {
          return { text: text, heat: null };
        });
      }
      // Link chip colors to highlight spans (also when scale wasn't requested).
      suggestions = linkSuggestionColorsToHighlights(suggestions, message);
      if (
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
      var selfPromptFocus =
        typeof parsed.selfPromptFocus === 'string'
          ? parsed.selfPromptFocus.trim().slice(0, 240)
          : typeof parsed.self_prompt_focus === 'string'
            ? parsed.self_prompt_focus.trim().slice(0, 240)
            : '';
      return {
        message: message,
        emotion: normalizeAssistantEmotion(parsed.emotion || parsed.mood),
        color: normalizeAssistantColor(
          parsed.color || parsed.aura || parsed.glow
        ),
        followUps: followUps,
        suggestions: suggestions,
        suggestionsMulti: wantsSuggestionsMulti(parsed),
        prompts: Array.isArray(parsed.prompts) ? parsed.prompts : [],
        blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
        actions: normalized.actions,
        droppedActions: normalized.dropped,
        cardPatches: normalizeCardPatches(parsed.cardPatches),
        patches: normalizeBoardPatches(parsed.patches),
        selfPrompt:
          parsed.selfPrompt === true ||
          parsed.self_prompt === true ||
          parsed.reflect === true,
        selfPromptFocus: selfPromptFocus
      };
    } catch (e) {
      return {
        message: text,
        emotion: null,
        color: null,
        followUps: [],
        suggestions: [],
        suggestionsMulti: false,
        prompts: [],
        blocks: [],
        actions: [],
        droppedActions: [],
        cardPatches: [],
        patches: [],
        selfPrompt: false,
        selfPromptFocus: ''
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
    return polishAssistantVisibleText(stripScaleLegendParenthetical(out));
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
    dbgLog('agent', 'chatTurn.start', {});
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
        dbgLog('agent', 'chatTurn.fetch', dbgFetchMeta(label, metaOrErr));
        return;
      }
      if (metaOrErr && metaOrErr.debugMeta) {
        debug.attempts.push(Object.assign({ label: label }, metaOrErr.debugMeta));
        dbgLog('agent', 'chatTurn.fetch', dbgFetchMeta(label, metaOrErr));
        return;
      }
      debug.attempts.push({
        label: label,
        error: (metaOrErr && metaOrErr.message) || String(metaOrErr || 'error'),
        ok: false
      });
      dbgLog('agent', 'chatTurn.fetch', dbgFetchMeta(label, metaOrErr));
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
          dbgLog('agent', 'chatTurn.fetch', {
            attempt: 'stream + json',
            ok: false,
            fallback: 'stream-rejected'
          });
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
      dbgError('agent', 'chatTurn.end', fatal, { latencyMs: debug.latencyMs, ok: false });
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
    parsed = await enrichSubtaskPickTurn(parsed, context, {
      suggestTitles: function () {
        return suggestSubtasks(p, {
          cardName: (context && context.cardName) || '',
          cardDesc: (context && context.cardDesc) || '',
          priorityLabel:
            context && context.display && context.display.label
              ? context.display.label
              : '',
          existingSubtasks: [],
          memory: (context && context.memory) || null,
          boardDigest: (context && context.boardDigest) || '',
          profile: (context && context.profile) || null
        });
      }
    });
    parsed.suggestions = ensurePersonalImpactSuggestion(
      parsed.suggestions,
      context && context.userName,
      parsed.message
    );
    var actions = rewriteActionsForRelativeDue(parsed.actions || [], userText);
    var tierRewrite = rewriteActionsForPriorityTier(actions, userText);
    actions = tierRewrite.actions;
    var message = polishAssistantVisibleText(
      stripScaleLegendParenthetical(
        polishMessageAfterTierApply(
          parsed.message,
          tierRewrite.tier,
          tierRewrite.injected
        )
      )
    );
    var colorRewrite = rewriteActionsForAgentColor(
      actions,
      userText,
      message,
      parsed.color
    );
    actions = colorRewrite.actions;
    var progressGuard = applyProgressCompleteGuards(
      {
        message: message,
        actions: actions,
        suggestions: parsed.suggestions,
        emotion: parsed.emotion || null
      },
      context
    );
    message = progressGuard.message;
    actions = progressGuard.actions;
    var projectScope = isProjectScope(context && context.scope);
    if (projectScope) {
      var droppedForScope = [];
      actions = (actions || []).filter(function (a) {
        if (a && PROJECT_SCOPE_TOOLS[a.tool]) return true;
        if (a && a.tool) droppedForScope.push({ tool: a.tool, reason: 'project-scope' });
        return false;
      });
      parsed.droppedActions = (parsed.droppedActions || []).concat(droppedForScope);
      parsed.cardPatches = [];
      // Project window: no card self-review cycle.
      parsed.selfPrompt = false;
      parsed.selfPromptFocus = '';
    }
    parsed.suggestions = linkSuggestionColorsToHighlights(
      progressGuard.suggestions || parsed.suggestions,
      message
    );
    parsed.suggestions = orderSuggestionsGreenToRed(
      parsed.suggestions,
      context && context.userName
    );
    var replyEmotion = progressGuard.emotion;
    var replyColor =
      colorRewrite.color || parsed.color || null;
    var prompts = projectScope
      ? []
      : ensurePriorityAxesPrompt(
          normalizePrompts(parsed.prompts, context),
          actions,
          context
        );
    var blocks = normalizeBlocks(parsed.blocks, context);
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
        blocks: blocks,
        actions: actions,
        droppedActions: parsed.droppedActions || [],
        tierInjected: !!tierRewrite.injected,
        colorInjected: !!colorRewrite.injected,
        scope: (context && context.scope) || ASSISTANT_SCOPES.TASK
      }
    };
    debug.usage = usage;
    dbgLog('agent', 'chatTurn.end', {
      ok: true,
      latencyMs: latencyMs,
      actionCount: (actions || []).length,
      droppedCount: (parsed.droppedActions || []).length
    });
    return {
      message: message,
      emotion: replyEmotion || parsed.emotion || null,
      color: replyColor,
      followUps: parsed.followUps,
      suggestions: parsed.suggestions,
      suggestionsMulti: !!parsed.suggestionsMulti,
      prompts: prompts,
      blocks: blocks,
      actions: actions,
      droppedActions: parsed.droppedActions || [],
      cardPatches: projectScope ? [] : parsed.cardPatches || [],
      patches: parsed.patches || [],
      selfPrompt: projectScope ? false : !!parsed.selfPrompt,
      selfPromptFocus: projectScope ? '' : parsed.selfPromptFocus || '',
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
    var projectScope = isProjectScope(context && context.scope);
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
          'Tu sugg\u00e8res des questions ou intentions pour l\'assistant Cerveau.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":["Quelle est la priorit\u00e9?","D\u00e9finir une \u00e9ch\u00e9ance"]}',
          '2 \u00e0 4 formulations courtes en fran\u00e7ais, ancr\u00e9es dans le contexte.',
          'INTERDIT\u00a0: placeholders comme "..." ou "\u2026"\u00a0; chaque entr\u00e9e doit \u00eatre un vrai texte cliquable.',
          'Tu peux inclure des intentions d\'action (ex. \u00ab\u00a0Ajouter une sous-t\u00e2che\u00a0\u00bb)\u00a0: l\'assistant posera ensuite les questions manquantes.',
          'Respecte enabled=false des sections (ne suppose pas un blocage/une \u00e9ch\u00e9ance active si d\u00e9sactiv\u00e9).',
          'Si progress.percent/cardProgress est d\u00e9j\u00e0 \u00e0 100\u00a0: NE propose PAS \u00ab\u00a0D\u00e9finir une \u00e9ch\u00e9ance\u00a0\u00bb.',
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
          projectScope
            ? 'Propose des questions utiles que l\'utilisateur pourrait poser maintenant au niveau projet / tableau (m\u00e9moire, vue d\'ensemble, \u00e9quipe). Pas de questions propres \u00e0 une seule carte.'
            : 'Propose des questions utiles que l\'utilisateur pourrait poser maintenant sur cette carte.'
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

  /** Local calendar date shifted by N days (YYYY-MM-DD). */
  function addDaysIsoLocal(isoOrToday, days) {
    var base =
      typeof isoOrToday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(isoOrToday)
        ? isoOrToday
        : todayIsoLocal();
    var parts = base.split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    d.setDate(d.getDate() + (Number(days) || 0));
    return todayIsoLocal(d);
  }

  /** Whole local calendar days from `fromIso` to `toIso` (YYYY-MM-DD). */
  function daysBetweenIsoLocal(fromIso, toIso) {
    if (
      typeof fromIso !== 'string' ||
      typeof toIso !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fromIso) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toIso)
    ) {
      return NaN;
    }
    var a = fromIso.split('-');
    var b = toIso.split('-');
    var from = new Date(+a[0], +a[1] - 1, +a[2]);
    var to = new Date(+b[0], +b[1] - 1, +b[2]);
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  /**
   * Real gaps on the card worth a Coup de pouce / apply suggestion.
   * Ordered by usefulness so the model can prioritize.
   */
  function listCardImprovementGaps(context) {
    var gaps = [];
    if (!context) return gaps;
    var due = context.due;
    var priority = context.priority;
    var blocked = context.blocked;
    var progress = context.progress;
    var goals = context.goals;
    var statut = context.statut;
    var display = context.display;
    var items = progress && Array.isArray(progress.items) ? progress.items : [];
    var pendingItems = items.filter(function (item) {
      return (
        item &&
        !item.done &&
        !(item.progress != null && +item.progress >= 100)
      );
    });

    if (statut && statut.category === 'completed' && pendingItems.length) {
      gaps.push(
        'statut Terminé alors que ' +
          pendingItems.length +
          ' sous-tâche(s) restent ouvertes'
      );
    }
    if (!due || !due.enabled || !due.dueDate) {
      gaps.push('échéance absente');
    } else if (display && display.duePast) {
      gaps.push('échéance passée (' + due.dueDate + ')');
    }
    if (!priority || !priority.enabled) {
      gaps.push('priorité non définie');
    }
    if (blocked && blocked.enabled) {
      var reasons = Array.isArray(blocked.blockedReasons)
        ? blocked.blockedReasons
        : [];
      var links = Array.isArray(blocked.blockedLinks) ? blocked.blockedLinks : [];
      if (!reasons.length && !links.length) {
        gaps.push('bloqué sans cause');
      }
    }
    if (
      goals &&
      !goals.projectId &&
      Array.isArray(goals.projects) &&
      goals.projects.length
    ) {
      gaps.push('aucun projet lié');
    }
    if (progress && progress.enabled && !items.length) {
      var desc = typeof context.cardDesc === 'string' ? context.cardDesc.trim() : '';
      if (desc.length >= 40) {
        gaps.push('progrès activé sans sous-tâches');
      }
    }
    if (
      progress &&
      progress.enabled &&
      pendingItems.length &&
      statut &&
      (statut.category === 'unstarted' || statut.category === 'backlog')
    ) {
      gaps.push('sous-tâches en cours mais statut encore « à faire »');
    }
    return gaps;
  }

  /**
   * Which top-level card fields differ between two buildContext snapshots.
   * Used so Coup de pouce does not re-offer what the user just changed.
   */
  function listRecentCardChanges(previousContext, currentContext) {
    var changes = [];
    if (!previousContext || !currentContext) return changes;

    function dueKey(due) {
      if (!due) return '';
      return [
        due.enabled ? '1' : '0',
        due.dueDate || '',
        due.dueTime || ''
      ].join('|');
    }
    function priorityKey(priority) {
      if (!priority) return '';
      return [
        priority.enabled ? '1' : '0',
        priority.urgency,
        priority.impact,
        priority.ease,
        priority.estimatedDurationMinutes != null
          ? priority.estimatedDurationMinutes
          : ''
      ].join('|');
    }
    function blockedKey(blocked) {
      if (!blocked) return '';
      var reasons = Array.isArray(blocked.blockedReasons)
        ? blocked.blockedReasons.slice()
        : [];
      var links = Array.isArray(blocked.blockedLinks)
        ? blocked.blockedLinks
            .map(function (link) {
              if (!link) return '';
              if (typeof link === 'string') return link;
              return link.id != null ? String(link.id) : '';
            })
            .filter(Boolean)
            .sort()
        : [];
      return [
        blocked.enabled ? '1' : '0',
        JSON.stringify(reasons),
        JSON.stringify(links)
      ].join('|');
    }
    function progressKey(progress) {
      if (!progress) return '';
      var items = Array.isArray(progress.items)
        ? progress.items.map(function (item) {
            if (!item) return '';
            return [
              item.id || '',
              item.text || '',
              item.done ? '1' : '0',
              item.progress != null ? item.progress : ''
            ].join(':');
          })
        : [];
      return [
        progress.enabled ? '1' : '0',
        progress.percent != null ? progress.percent : '',
        items.join(';')
      ].join('|');
    }
    function statutKey(statut) {
      if (!statut) return '';
      return [statut.listId || '', statut.category || '', statut.listName || ''].join(
        '|'
      );
    }
    function goalsKey(goals) {
      if (!goals) return '';
      return String(goals.projectId || '');
    }

    if (dueKey(previousContext.due) !== dueKey(currentContext.due)) {
      changes.push('due');
    }
    if (
      priorityKey(previousContext.priority) !== priorityKey(currentContext.priority)
    ) {
      changes.push('priority');
    }
    if (
      blockedKey(previousContext.blocked) !== blockedKey(currentContext.blocked)
    ) {
      changes.push('blocked');
    }
    if (
      progressKey(previousContext.progress) !==
      progressKey(currentContext.progress)
    ) {
      changes.push('progress');
    }
    if (
      statutKey(previousContext.statut) !== statutKey(currentContext.statut)
    ) {
      changes.push('statut');
    }
    if (goalsKey(previousContext.goals) !== goalsKey(currentContext.goals)) {
      changes.push('project');
    }
    if (
      String(previousContext.cardName || '') !== String(currentContext.cardName || '') ||
      String(previousContext.cardDesc || '') !== String(currentContext.cardDesc || '')
    ) {
      changes.push('card');
    }
    return changes;
  }

  function describeRecentCardChanges(previousContext, currentContext) {
    var keys = listRecentCardChanges(previousContext, currentContext);
    if (!keys.length) return [];
    var lines = [];
    var i;
    for (i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key === 'due') {
        var due = currentContext.due;
        if (due && due.enabled && due.dueDate) {
          lines.push(
            'échéance définie à ' +
              due.dueDate +
              (due.dueTime ? ' ' + due.dueTime : '') +
              ' — NE PAS redemander / redéfinir une échéance'
          );
        } else if (due && !due.enabled) {
          lines.push('échéance désactivée — ne pas la réactiver sauf vraie raison');
        } else {
          lines.push('échéance modifiée');
        }
      } else if (key === 'priority') {
        lines.push('priorité / axes modifiés — ne pas les remettre à l\'identique');
      } else if (key === 'blocked') {
        var blocked = currentContext.blocked;
        if (blocked && blocked.enabled) {
          lines.push('carte marquée bloquée — ne pas re-bloquer');
        } else {
          lines.push('blocage retiré — ne pas re-bloquer');
        }
      } else if (key === 'progress') {
        lines.push('progrès / sous-tâches modifiés');
      } else if (key === 'statut') {
        var statut = currentContext.statut;
        lines.push(
          'statut / liste modifié' +
            (statut && statut.listName ? ' (' + statut.listName + ')' : '')
        );
      } else if (key === 'project') {
        lines.push('lien projet modifié');
      } else if (key === 'card') {
        lines.push('titre ou description modifié');
      }
    }
    return lines;
  }

  /**
   * Drop improvement suggestions that redo a field the user just changed.
   * (e.g. set_due right after they set due to tomorrow.)
   */
  function filterImprovementsAgainstRecentChanges(
    list,
    previousContext,
    currentContext
  ) {
    if (!Array.isArray(list) || !list.length) return [];
    var recent = listRecentCardChanges(previousContext, currentContext);
    if (!recent.length) return list;
    var blockedTools = {};
    if (recent.indexOf('due') >= 0) blockedTools.set_due = true;
    if (recent.indexOf('priority') >= 0) blockedTools.set_priority = true;
    if (recent.indexOf('blocked') >= 0) blockedTools.set_blocked = true;
    if (recent.indexOf('statut') >= 0) blockedTools.set_statut = true;
    if (recent.indexOf('project') >= 0) blockedTools.set_project = true;
    if (!Object.keys(blockedTools).length) return list;

    return list.filter(function (item) {
      if (!item || !Array.isArray(item.actions) || !item.actions.length) {
        return false;
      }
      for (var i = 0; i < item.actions.length; i++) {
        var tool = item.actions[i] && item.actions[i].tool;
        if (tool && blockedTools[tool]) return false;
      }
      return true;
    });
  }

  /**
   * Resolve proposed dueDate/dueTime from set_due args (absolute, relative, or vague).
   * @returns {{dueDate:?string, dueTime:?string, dueVague:?string, dueMode:?string, hasDate:boolean, hasTime:boolean, hasVague:boolean}|null}
   */
  function resolveImprovementDueArgs(args, context) {
    if (!args || typeof args !== 'object') return null;
    if (
      Object.prototype.hasOwnProperty.call(args, 'dueVague') ||
      args.dueMode === 'vague'
    ) {
      var vagueId = resolveDueVagueArg(args.dueVague);
      if (!vagueId) return null;
      var vagueDate = resolveDueVagueToDateSafe(vagueId);
      if (!vagueDate) return null;
      return {
        dueDate: vagueDate,
        dueTime: null,
        dueVague: vagueId,
        dueMode: 'vague',
        hasDate: true,
        hasTime: false,
        hasVague: true
      };
    }
    var hasRelative =
      args.relativeMinutes != null || args.relativeHours != null;
    if (hasRelative) {
      var offsetMins = 0;
      if (args.relativeHours != null) {
        var hours = Number(args.relativeHours);
        if (!isFinite(hours)) return null;
        offsetMins += hours * 60;
      }
      if (args.relativeMinutes != null) {
        var minutes = Number(args.relativeMinutes);
        if (!isFinite(minutes)) return null;
        offsetMins += minutes;
      }
      offsetMins = Math.round(offsetMins);
      if (offsetMins < 0) return null;
      var from = null;
      if (context && context.today && context.nowTime) {
        var tp = String(context.nowTime).split(':');
        var dp = String(context.today).split('-');
        if (dp.length === 3 && tp.length >= 2) {
          from = new Date(
            +dp[0],
            +dp[1] - 1,
            +dp[2],
            +tp[0] || 0,
            +tp[1] || 0,
            0,
            0
          );
        }
      }
      var resolved = dueFromOffsetMinutes(offsetMins, from || undefined);
      if (!resolved) return null;
      return {
        dueDate: resolved.dueDate,
        dueTime: resolved.dueTime,
        dueVague: null,
        dueMode: 'precise',
        hasDate: true,
        hasTime: true,
        hasVague: false
      };
    }
    var out = {
      dueDate: null,
      dueTime: null,
      dueVague: null,
      dueMode: 'precise',
      hasDate: false,
      hasTime: false,
      hasVague: false
    };
    if (Object.prototype.hasOwnProperty.call(args, 'dueDate')) {
      var dueDate = validateDueDate(args.dueDate);
      if (dueDate === undefined) return null;
      out.dueDate = dueDate;
      out.hasDate = true;
    }
    if (Object.prototype.hasOwnProperty.call(args, 'dueTime')) {
      var dueTime = validateDueTime(args.dueTime);
      if (dueTime === undefined) return null;
      out.dueTime = dueTime;
      out.hasTime = true;
    }
    return out;
  }

  /**
   * True when an improvement action would not change the card given context.
   * Used to drop nonsensical Coup de pouce / apply suggestions (e.g. set due
   * to tomorrow when it is already tomorrow).
   */
  function isNoOpImprovementAction(action, context) {
    if (!action || !action.tool) return true;
    var args = action.args && typeof action.args === 'object' ? action.args : {};
    var tool = action.tool;
    var due = context && context.due;
    var priority = context && context.priority;
    var blocked = context && context.blocked;
    var progress = context && context.progress;
    var goals = context && context.goals;
    var statut = context && context.statut;

    if (tool === 'set_due') {
      if (!due) return false;
      var proposed = resolveImprovementDueArgs(args, context);
      // Bad/unresolvable args are noise — treat as no-op when a due already exists.
      if (!proposed) return !!(due.enabled && due.dueDate);
      var wantEnabled =
        args.dueEnabled != null
          ? !!args.dueEnabled
          : proposed.hasDate || proposed.hasTime || proposed.hasVague
            ? true
            : !!due.enabled;
      if (wantEnabled !== !!due.enabled) return false;
      if (!wantEnabled) return true;
      var curVague =
        due.dueMode === 'vague' && due.dueVague ? String(due.dueVague) : '';
      if (proposed.hasVague) {
        return curVague === String(proposed.dueVague || '');
      }
      if (curVague) {
        // Switching from vague → precise is a real change.
        if (proposed.hasDate || proposed.hasTime) return false;
      }
      var nextDate = proposed.hasDate ? proposed.dueDate : due.dueDate || null;
      var nextTime = proposed.hasTime ? proposed.dueTime : due.dueTime || null;
      var curDate = due.dueDate || null;
      var curTime = due.dueTime || null;
      // Same calendar day, suggestion only restates the date (no new time) → no-op.
      if (
        proposed.hasDate &&
        !proposed.hasTime &&
        nextDate &&
        curDate &&
        nextDate === curDate &&
        wantEnabled &&
        !curVague
      ) {
        return true;
      }
      if ((nextDate || null) !== (curDate || null)) return false;
      if ((nextTime || null) !== (curTime || null)) return false;
      return true;
    }

    if (tool === 'set_blocked') {
      if (!blocked) return false;
      var wantBlocked =
        args.enAttente != null
          ? !!args.enAttente
          : Array.isArray(args.blockedReasons) && args.blockedReasons.length
            ? true
            : Array.isArray(args.blockedLinks) && args.blockedLinks.length
              ? true
              : !!blocked.enabled;
      if (wantBlocked !== !!blocked.enabled) return false;
      if (!wantBlocked) return true;
      if (Array.isArray(args.blockedReasons)) {
        var nextReasons = args.blockedReasons
          .filter(function (r) {
            return typeof r === 'string' && r.trim();
          })
          .map(function (r) {
            return normalizeAgentBlockedReason(r) || String(r).trim();
          });
        var curReasons = Array.isArray(blocked.blockedReasons)
          ? blocked.blockedReasons.slice()
          : [];
        if (JSON.stringify(nextReasons) !== JSON.stringify(curReasons)) {
          return false;
        }
      }
      if (Object.prototype.hasOwnProperty.call(args, 'blockedLinks')) {
        var nextLinks = Array.isArray(args.blockedLinks)
          ? args.blockedLinks
              .map(function (link) {
                if (!link) return '';
                if (typeof link === 'string') return link.trim();
                if (typeof link === 'object' && link.id != null) {
                  return String(link.id).trim();
                }
                return '';
              })
              .filter(Boolean)
              .sort()
          : [];
        var curLinks = Array.isArray(blocked.blockedLinks)
          ? blocked.blockedLinks
              .map(function (link) {
                return link && link.id != null ? String(link.id).trim() : '';
              })
              .filter(Boolean)
              .sort()
          : [];
        if (JSON.stringify(nextLinks) !== JSON.stringify(curLinks)) {
          return false;
        }
      }
      return true;
    }

    if (tool === 'set_task_types') {
      var proposedTypes = normalizeAgentTaskTypes(
        args.types != null ? args.types : args.taskTypes
      );
      var curTypes = normalizeAgentTaskTypes(
        (context && context.taskTypes) ||
          (priority && priority.taskTypes) ||
          []
      );
      if (taskTypesEqual(proposedTypes, curTypes)) return true;
      if (context && context.taskTypesLocked && args.force !== true) {
        return true;
      }
      return false;
    }

    if (tool === 'set_priority') {
      if (!priority) return false;
      var wantPri =
        args.priorityEnabled != null
          ? !!args.priorityEnabled
          : args.urgency != null ||
              args.impact != null ||
              args.ease != null ||
              args.tier != null ||
              args.heatTarget != null ||
              args.estimatedDurationMinutes !== undefined ||
              (typeof args.estimatedDuration === 'string' &&
                !!args.estimatedDuration.trim())
            ? true
            : !!priority.enabled;
      if (wantPri !== !!priority.enabled) return false;
      if (!wantPri) return true;
      if (args.urgency != null && +args.urgency !== +priority.urgency) {
        return false;
      }
      if (args.impact != null && +args.impact !== +priority.impact) {
        return false;
      }
      if (args.ease != null && +args.ease !== +priority.ease) return false;
      if (args.estimatedDurationMinutes !== undefined) {
        var nextDur =
          args.estimatedDurationMinutes === null ||
          args.estimatedDurationMinutes === ''
            ? null
            : +args.estimatedDurationMinutes;
        var curDur =
          priority.estimatedDurationMinutes != null
            ? +priority.estimatedDurationMinutes
            : null;
        if (nextDur !== curDur) return false;
      }
      if (args.tier != null || args.heatTarget != null) {
        var curTier =
          context.display && context.display.tier
            ? String(context.display.tier)
            : '';
        var wantTier = args.tier != null ? String(args.tier) : '';
        if (wantTier && curTier && wantTier.toLowerCase() === curTier.toLowerCase()) {
          // Same palier label — no-op unless axes/duration also change (already checked).
        } else if (wantTier && curTier) {
          return false;
        } else {
          return false;
        }
      }
      return true;
    }

    if (tool === 'set_progress') {
      if (!progress) return false;
      var wantProgEnabled =
        args.progressEnabled != null
          ? !!args.progressEnabled
          : args.progress != null
            ? true
            : !!progress.enabled;
      if (wantProgEnabled !== !!progress.enabled) return false;
      if (!wantProgEnabled) return true;
      if (args.progress != null) {
        var curPct =
          progress.percent != null
            ? progress.percent
            : progress.cardProgress != null
              ? progress.cardProgress
              : null;
        if (curPct == null || +args.progress !== +curPct) return false;
      }
      return true;
    }

    if (tool === 'set_project') {
      var curProjectId = goals && goals.projectId ? String(goals.projectId) : '';
      if (args.clear === true) return !curProjectId;
      var wantProjectId =
        typeof args.projectId === 'string' ? args.projectId.trim() : '';
      if (wantProjectId) return wantProjectId === curProjectId;
      var match =
        (typeof args.matchText === 'string' && args.matchText.trim()) ||
        (typeof args.name === 'string' && args.name.trim()) ||
        '';
      if (match && goals && goals.project && goals.project.name) {
        var curName = String(goals.project.name).trim().toLowerCase();
        if (match.trim().toLowerCase() === curName) return true;
      }
      return false;
    }

    if (tool === 'set_statut') {
      if (!statut) return false;
      if (typeof args.listId === 'string' && args.listId.trim()) {
        return String(args.listId.trim()) === String(statut.listId || '');
      }
      if (typeof args.category === 'string' && args.category.trim()) {
        var wantCat = args.category.trim().toLowerCase();
        var curCat = statut.category ? String(statut.category).toLowerCase() : '';
        if (wantCat && curCat && wantCat === curCat) return true;
      }
      if (typeof args.matchList === 'string' && args.matchList.trim()) {
        var wantList = args.matchList.trim().toLowerCase();
        var curList = statut.listName
          ? String(statut.listName).trim().toLowerCase()
          : '';
        if (wantList && curList && wantList === curList) return true;
      }
      return false;
    }

    if (tool === 'add_subtask') {
      var text =
        typeof args.text === 'string' ? args.text.trim().toLowerCase() : '';
      if (!text || !progress || !Array.isArray(progress.items)) return false;
      for (var si = 0; si < progress.items.length; si++) {
        var existing = progress.items[si] && progress.items[si].text;
        if (
          typeof existing === 'string' &&
          existing.trim().toLowerCase() === text
        ) {
          return true;
        }
      }
      return false;
    }

    if (tool === 'complete_all_subtasks') {
      if (!progress || !Array.isArray(progress.items) || !progress.items.length) {
        if (progress && progress.cardProgress === 100) return true;
        return !progress || !progress.items || !progress.items.length;
      }
      return progress.items.every(function (item) {
        return (
          item &&
          (!!item.done ||
            (item.progress != null && +item.progress >= 100))
        );
      });
    }

    return false;
  }

  /** Keep suggestions that have at least one action that would change the card. */
  function filterNoOpImprovementSuggestions(list, context) {
    if (!Array.isArray(list) || !list.length) return [];
    return list.filter(function (item) {
      if (!item || !Array.isArray(item.actions) || !item.actions.length) {
        return false;
      }
      for (var i = 0; i < item.actions.length; i++) {
        if (!isNoOpImprovementAction(item.actions[i], context)) return true;
      }
      return false;
    });
  }

  /**
   * Few-shot JSON shaped by real gaps — avoids always teaching "set due tomorrow".
   */
  function buildImprovementExampleJson(context, gaps, today, tomorrow) {
    var first = gaps && gaps.length ? gaps[0] : '';
    if (!first) {
      return '{"suggestions":[]}';
    }
    if (first.indexOf('échéance absente') === 0) {
      return (
        '{"suggestions":[{"label":"D\u00e9finir l\'\u00e9ch\u00e9ance \u00e0 demain","actions":[{"tool":"set_due","args":{"dueDate":"' +
        tomorrow +
        '","dueEnabled":true}}]}]}'
      );
    }
    if (first.indexOf('échéance passée') === 0) {
      return (
        '{"suggestions":[{"label":"Reporter l\'\u00e9ch\u00e9ance \u00e0 demain","actions":[{"tool":"set_due","args":{"dueDate":"' +
        tomorrow +
        '","dueEnabled":true}}]}]}'
      );
    }
    if (first.indexOf('priorité') === 0) {
      return '{"suggestions":[{"label":"D\u00e9finir la priorit\u00e9","actions":[{"tool":"set_priority","args":{"priorityEnabled":true,"urgency":2,"impact":2,"ease":3}}]}]}';
    }
    if (first.indexOf('statut Terminé') === 0) {
      return '{"suggestions":[{"label":"Marquer les sous-t\u00e2ches termin\u00e9es","actions":[{"tool":"complete_all_subtasks","args":{}}]}]}';
    }
    if (first.indexOf('projet') >= 0 && context.goals && context.goals.projects && context.goals.projects[0]) {
      var proj = context.goals.projects[0];
      var match = proj.name || proj.id || '';
      return (
        '{"suggestions":[{"label":"Lier au projet ' +
        String(match).replace(/"/g, '') +
        '","actions":[{"tool":"set_project","args":{"matchText":"' +
        String(match).replace(/"/g, '') +
        '"}}]}]}'
      );
    }
    if (first.indexOf('bloqué sans cause') === 0) {
      return '{"suggestions":[{"label":"Pr\u00e9ciser la cause de blocage","actions":[{"tool":"set_blocked","args":{"enAttente":true,"blockedReasons":["En attente d\'une r\u00e9ponse"]}}]}]}';
    }
    if (first.indexOf('sous-tâches') >= 0 || first.indexOf('progrès') >= 0) {
      return '{"suggestions":[{"label":"Ajouter une sous-t\u00e2che concr\u00e8te","actions":[{"tool":"add_subtask","args":{"text":"Clarifier la prochaine \u00e9tape"}}]}]}';
    }
    return '{"suggestions":[]}';
  }

  /**
   * On-card-open / Coup de pouce: AI proposes applyable improvements.
   * Pass options.previousContext when reacting to a user edit so we never
   * re-offer the field they just changed.
   * @returns {Promise<Array<{label:string, actions:Array}>>}
   */
  async function suggestCardImprovements(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var previousContext =
      options.previousContext && typeof options.previousContext === 'object'
        ? options.previousContext
        : null;
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var context = buildContext(bridge);
    var today = (context && context.today) || todayIsoLocal();
    var tomorrow = addDaysIsoLocal(today, 1);
    var nowTime = (context && context.nowTime) || nowTimeLocal();
    var dueAlready = context.due && context.due.enabled && context.due.dueDate;
    var gaps = listCardImprovementGaps(context);
    var recentLines = describeRecentCardChanges(previousContext, context);
    var recentKeys = listRecentCardChanges(previousContext, context);
    // Gaps the model should ignore because the user just handled that field.
    var gapsForPrompt = gaps.filter(function (gap) {
      if (recentKeys.indexOf('due') >= 0 && /échéance/i.test(gap)) return false;
      if (recentKeys.indexOf('priority') >= 0 && /priorité/i.test(gap)) return false;
      if (recentKeys.indexOf('blocked') >= 0 && /bloqu/i.test(gap)) return false;
      if (recentKeys.indexOf('project') >= 0 && /projet/i.test(gap)) return false;
      if (recentKeys.indexOf('statut') >= 0 && /statut/i.test(gap)) return false;
      return true;
    });
    var exampleJson = buildImprovementExampleJson(
      context,
      gapsForPrompt,
      today,
      tomorrow
    );
    var systemLines = [
      'Tu analyses une carte Trello (Power-Up Cerveau) et proposes le PROCHAIN coup de pouce utile.',
      'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
      exampleJson,
      'R\u00e8gles\u00a0:',
      '- 0 \u00e0 3 suggestions max. Si rien d\'utile (carte d\u00e9j\u00e0 en ordre, ou seul le champ que l\'utilisateur vient de changer)\u00a0: {"suggestions":[]}.',
      '- Chaque suggestion DOIT avoir actions non vides (outils ex\u00e9cutables), pas seulement une question.',
      '- label\u00a0: verbe \u00e0 l\'infinitif, court, en fran\u00e7ais.',
      '- Outils autoris\u00e9s\u00a0: set_due, set_priority, set_blocked, set_progress, add_subtask, set_project, set_statut, complete_all_subtasks.',
      '- Priorise les vrais manques / incoh\u00e9rences list\u00e9s ci-dessous. Ne propose PAS un changement cosm\u00e9tique si un vrai trou existe.',
      '- Si context.goals.projectId est null et context.goals.projects n\'est pas vide, tu PEUX proposer de lier un projet pertinent (set_project avec matchText ou projectId).',
      '- Incoh\u00e9rence\u00a0: si statut.category=completed et sous-t\u00e2ches ouvertes, propose complete_all_subtasks OU set_statut vers started/unstarted/backlog.',
      '- Dates\u00a0: aujourd\'hui = ' +
        today +
        ', demain = ' +
        tomorrow +
        ', heure actuelle = ' +
        nowTime +
        '.',
      '- INTERDIT noop\u00a0: ne re-bloque pas si d\u00e9j\u00e0 bloqu\u00e9\u00a0; ne red\u00e9finis pas priorit\u00e9/statut/projet identiques\u00a0; ne propose pas complete_all_subtasks si tout est \u00e0 100%.',
      '- \u00c9ch\u00e9ance\u00a0: INTERDIT set_due vers une date d\u00e9j\u00e0 active' +
        (dueAlready ? ' (active\u00a0: ' + dueAlready + ')' : '') +
        '. Propose set_due SEULEMENT si absente, d\u00e9sactiv\u00e9e, pass\u00e9e, ou clairement \u00e0 d\u00e9caler \u2014 jamais pour redire «\u00a0demain\u00a0» juste apr\u00e8s que l\'utilisateur l\'ait mis.',
      '- L\'exemple JSON n\'est un mod\u00e8le de format que s\'il correspond aux manques restants\u00a0; sinon adapte ou renvoie [].',
      '- add_subtask.text obligatoire et concret si utilis\u00e9.'
    ];
    if (gapsForPrompt.length) {
      systemLines.push('Manques / incoh\u00e9rences \u00e0 combler (dans l\'ordre)\u00a0:');
      gapsForPrompt.forEach(function (gap, idx) {
        systemLines.push((idx + 1) + '. ' + gap);
      });
    } else {
      systemLines.push(
        'Aucun manque prioritaires d\u00e9tect\u00e9 \u2014 renvoie {"suggestions":[]} sauf vraie incoh\u00e9rence absente de cette liste.'
      );
    }
    if (recentLines.length) {
      systemLines.push(
        'CHANGEMENTS TOUT JUSTE FAITS PAR L\'UTILISATEUR (ne pas les refaire, ni les redemander)\u00a0:'
      );
      recentLines.forEach(function (line) {
        systemLines.push('- ' + line);
      });
      systemLines.push(
        'Propose plut\u00f4t le prochain compl\u00e9ment utile (autre section), ou [].'
      );
    }
    systemLines.push('Contexte carte\u00a0:');
    systemLines.push(JSON.stringify(context));

    var messages = [
      {
        role: 'system',
        content: systemLines.join('\n')
      },
      {
        role: 'user',
        content: recentLines.length
          ? 'L\'utilisateur vient de modifier la carte. Quel prochain coup de pouce utile (sans refaire ce qu\'il vient de faire)? Sinon suggestions vides.'
          : 'Y a-t-il une am\u00e9lioration concr\u00e8te \u00e0 appliquer sur cette carte? Sinon renvoie suggestions vides.'
      }
    ];
    var debug = {
      id: 'improve-' + Date.now().toString(36),
      kind: 'suggestCardImprovements',
      label: 'Suggestions applicables',
      startedAt: Date.now(),
      attempts: [],
      gaps: gapsForPrompt.slice(),
      recentChanges: recentKeys.slice()
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('suggestCardImprovements onDebug failed', cbErr);
      }
    }

    // Fast path: user just edited the only meaningful surface and nothing else to do.
    if (recentKeys.length && !gapsForPrompt.length) {
      debug.endedAt = Date.now();
      debug.latencyMs = 0;
      debug.ok = true;
      debug.skippedApi = true;
      debug.response = { suggestions: [] };
      emitDebug();
      return [];
    }

    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 420,
          temperature: 0.35
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
            temperature: 0.35
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

    // Re-read live card state: user may have finished editing during the API round-trip.
    var liveContext = buildContext(bridge);
    list = filterNoOpImprovementSuggestions(list, liveContext);
    list = filterImprovementsAgainstRecentChanges(
      list,
      previousContext,
      liveContext
    );
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

  /**
   * Preferred non-completed Statut category when reversing a wrong "done".
   */
  function preferReopenStatutCategory(statut) {
    var lists = statut && Array.isArray(statut.lists) ? statut.lists : [];
    var preferred = ['started', 'unstarted', 'backlog', 'triage'];
    for (var p = 0; p < preferred.length; p++) {
      var want = preferred[p];
      for (var i = 0; i < lists.length; i++) {
        if (lists[i] && lists[i].category === want) return want;
      }
    }
    return 'started';
  }

  function buildDonePendingSanityFallback(mismatch, statut) {
    var pending = (mismatch && mismatch.pendingItems) || [];
    var names = pending
      .slice(0, 3)
      .map(function (item) {
        return item && item.text ? String(item.text) : '';
      })
      .filter(Boolean);
    var count = (mismatch && mismatch.pendingCount) || names.length || 0;
    var listHint =
      mismatch && mismatch.listName
        ? ' (\u00ab\u00a0' + mismatch.listName + '\u00a0\u00bb)'
        : '';
    var taskHint = '';
    if (names.length === 1) {
      taskHint = ' (\u00ab\u00a0' + names[0] + '\u00a0\u00bb)';
    } else if (names.length > 1) {
      taskHint =
        ' (\u00ab\u00a0' +
        names.join('\u00a0\u00bb, \u00ab\u00a0') +
        (count > names.length ? '\u00a0\u00bb\u2026' : '\u00a0\u00bb') +
        ')';
    }
    var reopen = preferReopenStatutCategory(statut);
    return {
      kind: 'done_pending_tasks',
      message:
        'Le statut est Termin\u00e9' +
        listHint +
        ', mais il reste ' +
        (count === 1 ? 'une sous-t\u00e2che' : count + ' sous-t\u00e2ches') +
        ' en cours' +
        taskHint +
        '. Ces t\u00e2ches sont-elles obsol\u00e8tes, ou le statut Termin\u00e9 est-il incorrect?',
      suggestions: [
        'T\u00e2ches obsol\u00e8tes',
        'Statut incorrect',
        'Ignorer pour l\'instant'
      ],
      followUps: [
        {
          label: 'Marquer les t\u00e2ches obsol\u00e8tes termin\u00e9es',
          actions: [{ tool: 'complete_all_subtasks', args: {} }]
        },
        {
          label: 'Sortir du statut Termin\u00e9',
          actions: [{ tool: 'set_statut', args: { category: reopen } }]
        }
      ],
      mismatch: mismatch || null
    };
  }

  var MAX_DREAM_DESC_LEN = 900;
  var MAX_DREAM_HISTORY_CHARS = 1200;

  function normalizeDescForCompare(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function buildDreamHistoryExcerpt(history) {
    var list = Array.isArray(history) ? history : [];
    var chunks = [];
    var budget = MAX_DREAM_HISTORY_CHARS;
    for (var i = list.length - 1; i >= 0 && budget > 0; i--) {
      var entry = list[i];
      if (!entry || (entry.role !== 'user' && entry.role !== 'assistant')) continue;
      var content = String(entry.content || '').trim();
      if (!content) continue;
      if (/^\[Auto-revue\b/i.test(content) || /^\[R[eê]ve\b/i.test(content)) continue;
      var line =
        (entry.role === 'user' ? 'U: ' : 'A: ') +
        content.replace(/\s+/g, ' ').slice(0, 280);
      if (line.length > budget) line = line.slice(0, budget);
      chunks.unshift(line);
      budget -= line.length + 1;
    }
    return chunks.join('\n');
  }

  /**
   * True when Description looks like the old verbose structured brief
   * (## Pourquoi / Livrable / Qui / …) that Dream used to emit.
   */
  function isVerboseStructuredDesc(desc) {
    var t = String(desc || '');
    if (t.length < 120) return false;
    var hits = 0;
    if (/#{1,3}\s*Pourquoi\b/i.test(t)) hits++;
    if (/#{1,3}\s*Livrable\b/i.test(t) || /#{1,3}\s*But\b/i.test(t)) hits++;
    if (/#{1,3}\s*Qui\b/i.test(t)) hits++;
    if (/#{1,3}\s*Contraintes?\b/i.test(t)) hits++;
    if (/#{1,3}\s*D[e\u00e9]j[a\u00e0]\s*fait\b/i.test(t)) hits++;
    if (/#{1,3}\s*Reste\b/i.test(t)) hits++;
    return hits >= 2;
  }

  var MAX_STATUS_BRIEF_LEN = 140;
  var MAX_STATUS_BRIEF_DESC_LEN = 160;

  function firstNameFromFullName(fullName) {
    var s = String(fullName || '').trim();
    if (!s) return '';
    var part = s.split(/\s+/)[0] || '';
    return part.length > 24 ? part.slice(0, 24) : part;
  }

  function truncateStatusBriefLabel(text, maxLen) {
    var s = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    var lim = maxLen || 60;
    if (s.length <= lim) return s;
    return s.slice(0, lim - 1).replace(/[,:;\-–—\s]+$/, '') + '\u2026';
  }

  /** Short plain excerpt of the card description for the status brief. */
  function excerptStatusBriefDesc(desc) {
    var s = String(desc || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/#{1,6}\s+/g, '')
      .replace(/[*_`>~]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return truncateStatusBriefLabel(s, MAX_STATUS_BRIEF_DESC_LEN);
  }

  /**
   * Prefer concrete open leaf work; fall back to open parents.
   * Walks nested checklist items (items/children).
   */
  function collectStatusBriefNextOpenItems(items, max) {
    var out = [];
    var limit = max || 2;
    function itemText(it) {
      if (!it || typeof it !== 'object') return '';
      if (typeof it.text === 'string') return it.text.trim();
      if (typeof it.name === 'string') return it.name.trim();
      return '';
    }
    function kidsOf(it) {
      if (!it || typeof it !== 'object') return null;
      if (Array.isArray(it.items) && it.items.length) return it.items;
      if (Array.isArray(it.children) && it.children.length) return it.children;
      return null;
    }
    function hasOpenKid(kids) {
      if (!kids) return false;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] && !kids[i].done) return true;
      }
      return false;
    }
    function walk(list) {
      if (!Array.isArray(list) || out.length >= limit) return;
      for (var i = 0; i < list.length && out.length < limit; i++) {
        var it = list[i];
        if (!it || typeof it !== 'object' || it.done) continue;
        var kids = kidsOf(it);
        if (hasOpenKid(kids)) {
          walk(kids);
          continue;
        }
        var text = truncateStatusBriefLabel(itemText(it), 60);
        if (text) out.push(text);
      }
    }
    walk(items);
    return out;
  }

  /**
   * Compact facts for the Overview "what's going on" sentence
   * (boss-style status brief).
   */
  function buildStatusBriefSnapshot(context) {
    var due = context && context.due;
    var progress = context && context.progress;
    var blocked = context && context.blocked;
    var statut = context && context.statut;
    var priority = context && context.priority;
    var display = context && context.display;
    var ownership = context && context.ownership;

    var category =
      statut && typeof statut.category === 'string' ? statut.category : '';
    var listName =
      statut && typeof statut.listName === 'string' ? statut.listName : '';
    var stuck = !!(
      (blocked && blocked.enabled) ||
      category === 'blocked' ||
      (progress && progress.blocked)
    );
    var reasons = [];
    if (blocked && blocked.enabled && Array.isArray(blocked.blockedReasons)) {
      reasons = blocked.blockedReasons
        .map(function (r) {
          return typeof r === 'string' ? r.trim() : '';
        })
        .filter(Boolean)
        .slice(0, 2);
    } else if (
      progress &&
      progress.blocked &&
      Array.isArray(progress.blockedReasons)
    ) {
      reasons = progress.blockedReasons
        .map(function (r) {
          return typeof r === 'string' ? r.trim() : '';
        })
        .filter(Boolean)
        .slice(0, 2);
    }

    var percent = null;
    if (progress) {
      if (typeof progress.percent === 'number' && isFinite(progress.percent)) {
        percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
      } else if (
        typeof progress.cardProgress === 'number' &&
        isFinite(progress.cardProgress)
      ) {
        percent = Math.max(0, Math.min(100, Math.round(progress.cardProgress)));
      }
    }
    var doneCount =
      progress && typeof progress.doneCount === 'number'
        ? progress.doneCount
        : 0;
    var totalCount =
      progress && typeof progress.totalCount === 'number'
        ? progress.totalCount
        : Array.isArray(progress && progress.items)
          ? progress.items.length
          : 0;
    var remainingMinutes =
      progress &&
      typeof progress.estimatedRemainingMinutes === 'number' &&
      isFinite(progress.estimatedRemainingMinutes)
        ? progress.estimatedRemainingMinutes
        : null;

    var nextOpenItems = collectStatusBriefNextOpenItems(
      progress && Array.isArray(progress.items) ? progress.items : [],
      2
    );

    var dueEnabled = !(due && due.enabled === false);
    var dueDate = due && due.dueDate ? String(due.dueDate) : '';
    var dueTime =
      dueEnabled && due && typeof due.dueTime === 'string' && due.dueTime
        ? String(due.dueTime).trim()
        : '';
    if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) dueTime = '';
    var dueMissing = dueEnabled && !dueDate;
    var duePast = !!(display && display.duePast);
    var dueCountdown =
      display && typeof display.dueCountdown === 'string'
        ? display.dueCountdown
        : '';
    // Match PriorityUI soon band (≤14 days): worth naming timing in the brief.
    var today = (context && context.today) || todayIsoLocal();
    var daysUntil = dueDate ? daysBetweenIsoLocal(today, dueDate) : NaN;
    var dueSoon =
      !dueMissing &&
      !duePast &&
      isFinite(daysUntil) &&
      daysUntil >= 0 &&
      daysUntil <= 14;

    var ease =
      priority && priority.enabled !== false && priority.ease != null
        ? clampInt(priority.ease, 1, 5, 3)
        : null;
    var tier =
      (display && (display.label || display.tier)) ||
      (priority && priority.labels && priority.labels.urgency) ||
      '';

    // French-only scale keys (never "quick"/"project" — those leak into LLM copy).
    var scale = 'moyen';
    if (
      (ease != null && ease >= 4 && totalCount <= 2 && (remainingMinutes == null || remainingMinutes < 60)) ||
      (totalCount <= 1 && (remainingMinutes == null || remainingMinutes < 45) && (ease == null || ease >= 3))
    ) {
      scale = 'petit';
    }
    if (
      totalCount >= 5 ||
      (remainingMinutes != null && remainingMinutes >= 240) ||
      (ease != null && ease <= 2 && totalCount >= 3)
    ) {
      scale = 'gros';
    }

    var phase = 'idle';
    if (category === 'completed' || (percent != null && percent >= 100)) {
      phase = 'done';
    } else if (stuck) {
      phase = 'stuck';
    } else if (
      category === 'started' ||
      (percent != null && percent > 0) ||
      doneCount > 0
    ) {
      phase = 'in_progress';
    } else if (category === 'todo' || category === 'backlog' || !category) {
      phase = 'not_started';
    }

    var members = ownership && Array.isArray(ownership.members)
      ? ownership.members
      : [];
    var youId =
      ownership && ownership.you && ownership.you.id
        ? String(ownership.you.id)
        : '';
    var youAssigned = !!(ownership && ownership.youAssigned);
    var unassigned = members.length === 0;
    if (ownership && typeof ownership.unassigned === 'boolean') {
      unassigned = ownership.unassigned;
    }

    var otherNames = members
      .filter(function (m) {
        return !youId || m.id !== youId;
      })
      .map(function (m) {
        return firstNameFromFullName(m.fullName || m.username);
      })
      .filter(Boolean)
      .slice(0, 3);

    var cardName =
      context && context.cardName
        ? truncateStatusBriefLabel(String(context.cardName), 72)
        : '';
    var cardDesc = excerptStatusBriefDesc(
      context && context.cardDesc ? context.cardDesc : ''
    );

    return {
      cardName: cardName,
      cardDesc: cardDesc,
      phase: phase,
      stuck: stuck,
      statutCategory: category || null,
      statutListName: listName || null,
      blockedReasons: reasons,
      progressPercent: percent,
      subtasksDone: doneCount,
      subtasksTotal: totalCount,
      subtasksOpen: Math.max(0, totalCount - doneCount),
      nextOpenItems: nextOpenItems,
      estimatedRemainingMinutes: remainingMinutes,
      dueMissing: dueMissing,
      duePast: duePast,
      dueSoon: dueSoon,
      dueCountdown: dueCountdown || null,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      priorityTier: typeof tier === 'string' ? tier : '',
      ease: ease,
      scale: scale,
      youAssigned: youAssigned,
      unassigned: unassigned,
      otherNames: otherNames,
      assigneeCount: members.length
    };
  }

  function fingerprintStatusBriefSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    try {
      return JSON.stringify({
        v: 3,
        cardName: snapshot.cardName || '',
        cardDesc: snapshot.cardDesc || '',
        phase: snapshot.phase,
        stuck: !!snapshot.stuck,
        statutCategory: snapshot.statutCategory || null,
        blockedReasons: snapshot.blockedReasons || [],
        progressPercent: snapshot.progressPercent,
        subtasksDone: snapshot.subtasksDone,
        subtasksTotal: snapshot.subtasksTotal,
        subtasksOpen: snapshot.subtasksOpen,
        nextOpenItems: snapshot.nextOpenItems || [],
        estimatedRemainingMinutes: snapshot.estimatedRemainingMinutes,
        dueMissing: !!snapshot.dueMissing,
        duePast: !!snapshot.duePast,
        dueSoon: !!snapshot.dueSoon,
        dueCountdown: snapshot.dueCountdown || null,
        dueDate: snapshot.dueDate || null,
        dueTime: snapshot.dueTime || null,
        priorityTier: snapshot.priorityTier || '',
        ease: snapshot.ease,
        scale: snapshot.scale,
        youAssigned: !!snapshot.youAssigned,
        unassigned: !!snapshot.unassigned,
        otherNames: snapshot.otherNames || [],
        assigneeCount: snapshot.assigneeCount || 0
      });
    } catch (e) {
      return '';
    }
  }

  function clampStatusBriefSentence(text) {
    var s = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    if (s.length <= MAX_STATUS_BRIEF_LEN) return s;
    var cut = s.slice(0, MAX_STATUS_BRIEF_LEN - 1);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 80) cut = cut.slice(0, lastSpace);
    return cut.replace(/[,:;.\-–—\s]+$/, '') + '\u2026';
  }

  function normalizeStatusBriefScale(scale) {
    var s = String(scale || '').toLowerCase();
    if (s === 'petit' || s === 'quick') return 'petit';
    if (s === 'gros' || s === 'project') return 'gros';
    return 'moyen';
  }

  /** Compact French clock for status brief (e.g. "14 h", "14 h 30"). */
  function formatStatusBriefDueTime(time) {
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.formatDueTimeCompactFr === 'function'
    ) {
      return PriorityUI.formatDueTimeCompactFr(time) || '';
    }
    var s = String(time || '').trim();
    if (!/^\d{2}:\d{2}$/.test(s)) return '';
    var parts = s.split(':');
    var hours = +parts[0];
    var minutes = +parts[1];
    if (!isFinite(hours) || !isFinite(minutes)) return '';
    if (minutes === 0) return String(hours) + ' h';
    return (
      String(hours) +
      ' h ' +
      (minutes < 10 ? '0' + minutes : String(minutes))
    );
  }

  /**
   * Due clause for the brief: missing / late / soon timing (+ clock when set).
   * Far-away dues stay silent so the sentence keeps focusing on work.
   */
  function formatStatusBriefDueGap(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    if (snapshot.duePast) return 'en retard';
    if (snapshot.dueMissing) return 'pas d\'\u00e9ch\u00e9ance';
    if (!snapshot.dueSoon) return '';

    var when = '';
    if (typeof snapshot.dueCountdown === 'string' && snapshot.dueCountdown) {
      when = snapshot.dueCountdown.replace(/\s+/g, ' ').trim();
      if (when) {
        when = when.charAt(0).toLocaleLowerCase('fr-FR') + when.slice(1);
      }
    }
    var clock = formatStatusBriefDueTime(snapshot.dueTime);
    var countdownHasClock = /\b(h|heure|heures|minute|minutes)\b/i.test(when);

    if (when && clock && !countdownHasClock) {
      return when + ' \u00e0 ' + clock;
    }
    if (when) return when;
    if (clock) return '\u00e0 ' + clock;
    return '';
  }

  /**
   * Deterministic French boss-style status sentence when AI is unavailable.
   * Substance first: next work / card topic / blocker / owner / due gap.
   * Never empty scale fluff (« petit reste à finir »).
   */
  function buildHeuristicStatusBrief(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    var you = !!snapshot.youAssigned;
    var unassigned = !!snapshot.unassigned;
    var other =
      Array.isArray(snapshot.otherNames) && snapshot.otherNames.length
        ? snapshot.otherNames[0]
        : '';
    var reason =
      Array.isArray(snapshot.blockedReasons) && snapshot.blockedReasons[0]
        ? String(snapshot.blockedReasons[0]).trim()
        : '';
    if (reason.length > 48) reason = reason.slice(0, 45) + '\u2026';
    var scale = normalizeStatusBriefScale(snapshot.scale);
    var next =
      Array.isArray(snapshot.nextOpenItems) && snapshot.nextOpenItems[0]
        ? String(snapshot.nextOpenItems[0]).trim()
        : '';
    if (next.length > 52) next = next.slice(0, 49) + '\u2026';
    var open =
      snapshot.subtasksOpen != null && isFinite(+snapshot.subtasksOpen)
        ? Math.max(0, Math.round(+snapshot.subtasksOpen))
        : null;
    var topic = truncateStatusBriefLabel(snapshot.cardName || '', 42);
    var descHint = truncateStatusBriefLabel(snapshot.cardDesc || '', 48);

    var who = you
      ? '\u00c0 toi'
      : unassigned
        ? 'Personne assign\u00e9'
        : other
          ? 'Chez ' + other
          : 'En cours';

    var dueGap = formatStatusBriefDueGap(snapshot);

    var sentence = '';
    if (snapshot.phase === 'done') {
      sentence = you
        ? 'Termin\u00e9 de ton c\u00f4t\u00e9' +
          (topic ? ' (\u00ab\u00a0' + topic + '\u00a0\u00bb)' : '') +
          '.'
        : 'Marqu\u00e9 termin\u00e9' + (other ? ' (chez ' + other + ')' : '') + '.';
    } else if (snapshot.stuck || snapshot.phase === 'stuck') {
      if (you) {
        sentence = reason
          ? '\u00c0 toi \u2014 bloqu\u00e9\u00a0: ' + reason + '.'
          : '\u00c0 toi \u2014 bloqu\u00e9, cause pas claire.';
      } else if (other) {
        sentence = reason
          ? 'Chez ' + other + ' \u2014 bloqu\u00e9\u00a0: ' + reason + '.'
          : 'Chez ' + other + ' \u2014 bloqu\u00e9.';
      } else if (unassigned) {
        sentence = reason
          ? 'Bloqu\u00e9 sans assign\u00e9 \u2014 ' + reason + '.'
          : 'Bloqu\u00e9 et personne n\'est assign\u00e9.';
      } else {
        sentence = reason ? 'Bloqu\u00e9\u00a0: ' + reason + '.' : 'Bloqu\u00e9.';
      }
    } else if (snapshot.phase === 'in_progress') {
      var workBit = '';
      if (next) {
        workBit = 'prochaine\u00a0: ' + next;
      } else if (topic) {
        workBit =
          scale === 'petit'
            ? 'petit fix \u00ab\u00a0' + topic + '\u00a0\u00bb encore ouvert'
            : scale === 'gros'
              ? 'gros chantier \u00ab\u00a0' + topic + '\u00a0\u00bb encore ouvert'
              : '\u00ab\u00a0' + topic + '\u00a0\u00bb encore ouvert';
      } else if (descHint) {
        workBit = 'encore ouvert\u00a0: ' + descHint;
      } else if (open != null && open > 0) {
        workBit =
          open === 1
            ? '1 sous-t\u00e2che restante'
            : open + ' sous-t\u00e2ches restantes';
      } else if (scale === 'gros') {
        workBit = 'gros chantier encore ouvert';
      } else {
        workBit = 'encore en cours, d\u00e9tail flou';
      }
      sentence = who + ' \u2014 ' + workBit;
      if (dueGap) sentence += ' ; ' + dueGap;
      sentence += '.';
    } else {
      // not_started / idle
      if (you) {
        if (dueGap === 'pas d\'\u00e9ch\u00e9ance') {
          sentence =
            '\u00c0 toi \u2014 pas commenc\u00e9' +
            (topic ? ' sur \u00ab\u00a0' + topic + '\u00a0\u00bb' : '') +
            ', et pas d\'\u00e9ch\u00e9ance.';
        } else if (dueGap === 'en retard') {
          sentence =
            '\u00c0 toi \u2014 pas commenc\u00e9' +
            (topic ? ' sur \u00ab\u00a0' + topic + '\u00a0\u00bb' : '') +
            ' et d\u00e9j\u00e0 en retard.';
        } else if (dueGap) {
          sentence =
            '\u00c0 toi \u2014 pas commenc\u00e9' +
            (topic ? ' sur \u00ab\u00a0' + topic + '\u00a0\u00bb' : '') +
            ' ; ' +
            dueGap +
            '.';
        } else if (next) {
          sentence =
            '\u00c0 toi \u2014 pas commenc\u00e9 ; premi\u00e8re \u00e9tape\u00a0: ' +
            next +
            '.';
        } else if (topic && scale === 'petit') {
          sentence =
            '\u00c0 toi \u2014 petit fix \u00ab\u00a0' +
            topic +
            '\u00a0\u00bb pas encore commenc\u00e9.';
        } else if (topic && scale === 'gros') {
          sentence =
            '\u00c0 toi \u2014 gros chantier \u00ab\u00a0' +
            topic +
            '\u00a0\u00bb pas encore lanc\u00e9.';
        } else if (topic) {
          sentence =
            '\u00c0 toi \u2014 \u00ab\u00a0' +
            topic +
            '\u00a0\u00bb pas encore commenc\u00e9.';
        } else if (scale === 'petit') {
          sentence = '\u00c0 toi \u2014 petit fix pas encore commenc\u00e9.';
        } else if (scale === 'gros') {
          sentence = '\u00c0 toi \u2014 gros chantier pas encore lanc\u00e9.';
        } else {
          sentence = '\u00c0 toi \u2014 pas encore commenc\u00e9.';
        }
      } else if (other) {
        sentence =
          'Chez ' +
          other +
          ' \u2014 pas commenc\u00e9' +
          (topic ? ' sur \u00ab\u00a0' + topic + '\u00a0\u00bb' : '') +
          (dueGap ? ' ; ' + dueGap : '') +
          '.';
      } else if (unassigned) {
        sentence = dueGap
          ? 'Personne assign\u00e9, ' + dueGap + ' \u2014 \u00e7a dort.'
          : 'Personne assign\u00e9 \u2014 pas commenc\u00e9.';
      } else {
        sentence =
          'Pas commenc\u00e9' + (dueGap ? ' ; ' + dueGap : '') + '.';
      }
    }

    return clampStatusBriefSentence(sentence);
  }

  /** Reject empty / glaze / English-scale AI sentences; fall back to heuristic. */
  function isVacuousStatusBrief(sentence) {
    var s = String(sentence || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!s) return true;
    if (
      /petit reste\s*[àa]\s*finir|travail encore ouvert|encore en cours, d[eé]tail flou/.test(
        s
      )
    ) {
      return true;
    }
    if (
      /\b(quick|project|stuck|medium|status)\b/.test(s) ||
      /(?:^|[^\wàâäéèêëïîôùûüç])(?:quick|project)\b/.test(s)
    ) {
      return true;
    }
    if (
      /devrait aller vite|t['']inqui[eè]te|tu g[eè]res|bien avanc|glaze|bravo/.test(
        s
      )
    ) {
      return true;
    }
    if (
      /c['']est en cours de ton c[oô]t[eé]|avanc[eé]\s*[àa]\s*\d+\s*%/.test(s)
    ) {
      return true;
    }
    // Pure owner + due with no work noun: « À toi — demain. »
    if (/^(?:à toi|chez \w+|personne assign[eé])\s*[—\-–]\s*[^.]{0,28}\.?$/.test(s)) {
      if (
        !/prochaine|bloqu|sous-t|fix|chantier|pas commenc|termin|\u00ab/.test(s) &&
        !/[a-zàâäéèêëïîôùûüç]{4,}/.test(
          s.replace(
            /à toi|chez \w+|personne assigné|demain|aujourd.?hui|en retard|pas d.?échéance|à \d+|h\b|\d+/gi,
            ''
          )
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * AI Overview status brief: one boss-style sentence about what's going on.
   * Returns { ok, skipped?, reason?, sentence?, usage?, debug }.
   */
  async function cardStatusBriefTurn(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var context = options.context || buildContext(bridge);
    var snapshot =
      options.snapshot || buildStatusBriefSnapshot(context);
    var heuristic = buildHeuristicStatusBrief(snapshot);

    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      return {
        ok: true,
        skipped: true,
        reason: 'not-configured',
        sentence: heuristic,
        source: 'heuristic'
      };
    }

    var messages = [
      {
        role: 'system',
        content: [
          'Tu r\u00e9diges UNE phrase de statut pour le r\u00e9sum\u00e9 d\'une carte Trello (Power-Up Cerveau).',
          profileLanguageInstruction(context && context.profile),
          'Le boss r\u00e9pond \u00e0\u00a0: \u00ab\u00a0Hey, \u00e0 propos de cette t\u00e2che\u2026 qu\'est-ce qui se passe\u00a0?\u00a0\u00bb',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"sentence":"\u2026"}',
          'R\u00e8gles\u00a0:',
          '- Une seule phrase, ton sec et factuel (manager press\u00e9), dans la langue/dialecte ci-dessus.',
          '- Max ~' + MAX_STATUS_BRIEF_LEN + ' caract\u00e8res.',
          '- SUBSTANCE OBLIGATOIRE\u00a0: nomme LE TRAVAIL concret (cardName, cardDesc, ou nextOpenItems) + qui porte + le fait utile (prochaine \u00e9tape, motif de blocage, \u00e9ch\u00e9ance manquante/retard).',
          '- Si nextOpenItems non vide\u00a0: cite la prochaine \u00e9tape. Sinon\u00a0: ancre la phrase sur cardName (et cardDesc si \u00e7a pr\u00e9cise).',
          '- scale (petit|moyen|gros) = adjectif seulement, JAMAIS le sujet. Interdit de r\u00e9pondre seulement avec la taille.',
          '- Si dueSoon=true\u00a0: mentionne le timing (dueCountdown) et l\'heure (dueTime) si elle est d\u00e9finie \u2014 ex. \u00ab\u00a0demain \u00e0 14 h\u00a0\u00bb. Si dueSoon=false et pas dueMissing/duePast\u00a0: ne parle PAS de l\'\u00e9ch\u00e9ance.',
          '- INTERDIT d\'encourager / flatter / rassurer\u00a0: pas de \u00ab\u00a0\u00e7a devrait aller vite\u00a0\u00bb, \u00ab\u00a0bien avanc\u00e9\u00a0\u00bb, \u00ab\u00a0t\'inqui\u00e8te\u00a0\u00bb, \u00ab\u00a0tu g\u00e8res\u00a0\u00bb.',
          '- INTERDIT les mots anglais dans une r\u00e9ponse fran\u00e7aise (quick, project, stuck, medium, status\u2026).',
          '- INTERDIT de citer le % de progr\u00e8s (d\u00e9j\u00e0 visible dans l\'UI).',
          '- INTERDIT les phrases vides\u00a0: \u00ab\u00a0petit reste \u00e0 finir\u00a0\u00bb, \u00ab\u00a0travail encore ouvert\u00a0\u00bb, \u00ab\u00a0c\'est en cours de ton c\u00f4t\u00e9\u00a0\u00bb, \u00ab\u00a0\u00c0 toi \u2014 demain\u00a0\u00bb sans dire QUOI.',
          '- N\'invente rien\u00a0: seulement le snapshot. Pas de pr\u00e9noms hors otherNames.',
          '- Ex. BON\u00a0: "\u00c0 toi \u2014 prochaine\u00a0: finaliser le montage ; pas d\'\u00e9ch\u00e9ance."',
          '- Ex. BON\u00a0: "\u00c0 toi \u2014 prochaine\u00a0: finaliser le montage ; demain \u00e0 14 h."',
          '- Ex. BON\u00a0: "\u00c0 toi \u2014 \u00ab\u00a0Fix login SSO\u00a0\u00bb encore ouvert ; demain."',
          '- Ex. BON\u00a0: "Chez Sam \u2014 bloqu\u00e9\u00a0: attente API."',
          '- Ex. MAUVAIS\u00a0: "\u00c0 toi \u2014 petit reste \u00e0 finir ; demain."',
          '- Ex. MAUVAIS\u00a0: "C\'est en cours de ton c\u00f4t\u00e9, avanc\u00e9 \u00e0 31\u00a0% ; c\'est un quick, donc \u00e7a devrait aller vite."',
          'Snapshot\u00a0:',
          JSON.stringify(snapshot)
        ].join('\n')
      },
      {
        role: 'user',
        content:
          'Donne la phrase de statut (JSON {"sentence":"\u2026"}). Ancre-toi sur le travail r\u00e9el du snapshot (titre / desc / prochaine \u00e9tape). Heuristique de secours\u00a0: ' +
          heuristic
      }
    ];

    var debug = {
      id: 'status-brief-' + Date.now().toString(36),
      kind: 'cardStatusBriefTurn',
      label: 'R\u00e9sum\u00e9 statut (overview)',
      startedAt: Date.now(),
      attempts: []
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('cardStatusBriefTurn onDebug failed', cbErr);
      }
    }

    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 120,
          temperature: 0.35
        });
        if (response.meta) {
          debug.attempts.push(Object.assign({ label: 'json' }, response.meta));
        }
      } catch (err) {
        if (err && err.debugMeta) {
          debug.attempts.push(Object.assign({ label: 'json' }, err.debugMeta));
        }
        if (
          err &&
          err.message &&
          /response_format|json_object|json mode/i.test(err.message)
        ) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 120,
            temperature: 0.35
          });
          if (response.meta) {
            debug.attempts.push(
              Object.assign({ label: 'sans json mode' }, response.meta)
            );
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
      debug.request = debug.attempts.length
        ? debug.attempts[debug.attempts.length - 1]
        : null;
      emitDebug();
      return {
        ok: true,
        skipped: false,
        reason: 'llm-error',
        sentence: heuristic,
        source: 'heuristic',
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
      response.meta ||
      (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response.meta && response.meta.status,
      content: response.content,
      raw: cloneJsonSafe(response.raw),
      parsed: data
    };
    debug.usage = usage;
    emitDebug();

    var aiSentence =
      data && typeof data.sentence === 'string'
        ? clampStatusBriefSentence(data.sentence)
        : '';
    if (!aiSentence || isVacuousStatusBrief(aiSentence)) {
      return {
        ok: true,
        skipped: true,
        reason: !aiSentence ? 'empty-sentence' : 'vacuous-sentence',
        sentence: heuristic,
        source: 'heuristic',
        usage: usage,
        debug: debug
      };
    }

    return {
      ok: true,
      skipped: false,
      sentence: aiSentence,
      source: 'ai',
      usage: usage,
      debug: debug
    };
  }

  var MAX_PROGRESS_SUMMARY_LEN = 120;

  function truncateProgressLabel(text, maxLen) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    var lim = maxLen || 48;
    if (s.length <= lim) return s;
    return s.slice(0, lim - 1).replace(/[,:;\-–—\s]+$/, '') + '\u2026';
  }

  /**
   * Map a progress item (local checklist or linked-tree child) into a compact
   * outline node for the Progrès tab AI summary.
   */
  function mapProgressOutlineNode(raw, depth) {
    if (!raw || typeof raw !== 'object') return null;
    var text =
      typeof raw.text === 'string'
        ? raw.text.trim()
        : typeof raw.name === 'string'
          ? raw.name.trim()
          : '';
    if (!text) return null;
    var node = {
      text: truncateProgressLabel(text, depth > 1 ? 40 : 56),
      done: !!raw.done
    };
    if (raw.linkedCardId || raw.linked) node.linked = true;
    var kids = [];
    var sourceKids = Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.children)
        ? raw.children
        : null;
    if (sourceKids && sourceKids.length && depth < 3) {
      for (var i = 0; i < sourceKids.length; i++) {
        var child = mapProgressOutlineNode(sourceKids[i], depth + 1);
        if (child) kids.push(child);
        if (kids.length >= 8) break;
      }
    }
    if (kids.length) node.children = kids;
    return node;
  }

  /**
   * Merge local checklists with resolved linked-card children for one subtask.
   */
  function outlineChildrenForItem(item, linkedNode) {
    var kids = [];
    var seen = Object.create(null);
    function pushKid(raw) {
      var node = mapProgressOutlineNode(raw, 2);
      if (!node) return;
      var key = node.text.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      kids.push(node);
    }
    if (item && Array.isArray(item.items)) {
      item.items.forEach(pushKid);
    }
    if (linkedNode && Array.isArray(linkedNode.children)) {
      linkedNode.children.forEach(pushKid);
    }
    return kids.slice(0, 8);
  }

  /**
   * Unique Motifs for the Progrès summary when the card / a task is blocked.
   * Prefer card-level causes, then master progress, then item Motifs.
   */
  function collectProgressSummaryBlockedReasons(context, progress, items) {
    var reasons = [];
    var seen = Object.create(null);
    function pushAll(list) {
      if (!Array.isArray(list)) return;
      for (var i = 0; i < list.length; i++) {
        var reason = typeof list[i] === 'string' ? list[i].trim() : '';
        if (!reason) continue;
        var key = reason.toLowerCase();
        if (seen[key]) continue;
        seen[key] = true;
        reasons.push(reason);
      }
    }
    var blocked = context && context.blocked;
    if (blocked && blocked.enabled) pushAll(blocked.blockedReasons);
    if (progress && progress.blocked) pushAll(progress.blockedReasons);
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      if (!item || item.done || !item.blocked) continue;
      pushAll(item.blockedReasons);
    }
    return reasons.slice(0, 4);
  }

  function isProgressSummaryStuck(context, progress, items) {
    var blocked = context && context.blocked;
    if (blocked && blocked.enabled) return true;
    if (progress && progress.blocked) return true;
    if (progress && progress.hasBlockedSubtasks) return true;
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].blocked && !items[i].done) return true;
    }
    return false;
  }

  /**
   * Compact hierarchy for the Progrès collapsed-summary sentence.
   * options.linkedTreeByItemId: optional map from completion-ui linked resolve.
   */
  function buildProgressSummarySnapshot(context, options) {
    options = options || {};
    var progress = context && context.progress;
    var linkedTreeByItemId =
      options.linkedTreeByItemId && typeof options.linkedTreeByItemId === 'object'
        ? options.linkedTreeByItemId
        : null;

    var percent = null;
    if (progress) {
      if (typeof progress.percent === 'number' && isFinite(progress.percent)) {
        percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
      } else if (
        typeof progress.cardProgress === 'number' &&
        isFinite(progress.cardProgress)
      ) {
        percent = Math.max(0, Math.min(100, Math.round(progress.cardProgress)));
      }
    }

    var items = progress && Array.isArray(progress.items) ? progress.items : [];
    var outline = [];
    var openLabels = [];
    var doneCount = 0;
    var totalCount = 0;

    function walkCount(node) {
      if (!node) return;
      totalCount += 1;
      if (node.done) doneCount += 1;
      else if (node.text) openLabels.push(node.text);
      if (Array.isArray(node.children)) {
        node.children.forEach(walkCount);
      }
    }

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || typeof item !== 'object') continue;
      var text = typeof item.text === 'string' ? item.text.trim() : '';
      if (!text) continue;
      var linkedNode =
        linkedTreeByItemId && item.id != null
          ? linkedTreeByItemId[item.id] || linkedTreeByItemId[String(item.id)]
          : null;
      var node = {
        text: truncateProgressLabel(text, 56),
        done: !!item.done
      };
      if (item.linkedCardId || (linkedNode && linkedNode.linkedCardId)) {
        node.linked = true;
      }
      if (item.blocked) node.blocked = true;
      var kids = outlineChildrenForItem(item, linkedNode);
      if (kids.length) node.children = kids;
      outline.push(node);
      walkCount(node);
      if (outline.length >= 12) break;
    }

    // Prefer hierarchy walk counts; fall back to progress meta when empty.
    if (!totalCount && progress) {
      doneCount =
        typeof progress.doneCount === 'number' ? progress.doneCount : 0;
      totalCount =
        typeof progress.totalCount === 'number'
          ? progress.totalCount
          : items.length;
    }

    var openCount = Math.max(0, totalCount - doneCount);
    var stuck = isProgressSummaryStuck(context, progress, items);
    var blockedReasons = stuck
      ? collectProgressSummaryBlockedReasons(context, progress, items)
      : [];
    var phase = 'idle';
    if (percent != null && percent >= 100) phase = 'done';
    else if (totalCount > 0 && openCount <= 0) phase = 'done';
    else if (stuck) phase = 'blocked';
    else if ((percent != null && percent > 0) || doneCount > 0) {
      phase = 'in_progress';
    } else if (totalCount > 0) {
      phase = 'not_started';
    }

    return {
      cardName: context && context.cardName ? String(context.cardName) : '',
      phase: phase,
      stuck: stuck,
      blockedReasons: blockedReasons,
      progressPercent: percent,
      tasksDone: doneCount,
      tasksTotal: totalCount,
      tasksOpen: openCount,
      openLabels: openLabels.slice(0, 6),
      outline: outline
    };
  }

  function fingerprintProgressSummarySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    try {
      return JSON.stringify({
        v: 2,
        phase: snapshot.phase,
        stuck: !!snapshot.stuck,
        blockedReasons: snapshot.blockedReasons || [],
        progressPercent: snapshot.progressPercent,
        tasksDone: snapshot.tasksDone,
        tasksTotal: snapshot.tasksTotal,
        tasksOpen: snapshot.tasksOpen,
        openLabels: snapshot.openLabels || [],
        outline: snapshot.outline || []
      });
    } catch (e) {
      return '';
    }
  }

  function clampProgressSummarySentence(text) {
    var s = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    if (s.length <= MAX_PROGRESS_SUMMARY_LEN) return s;
    var cut = s.slice(0, MAX_PROGRESS_SUMMARY_LEN - 1);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 60) cut = cut.slice(0, lastSpace);
    return cut.replace(/[,:;.\-–—\s]+$/, '') + '\u2026';
  }

  /**
   * Deterministic Progrès summary when AI is unavailable.
   * Prefer a short synthesis of open task names over bare counts.
   * When blocked: show Motifs (block reasons), never the remaining task list.
   */
  function buildHeuristicProgressSummary(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    var open = snapshot.tasksOpen;
    var total = snapshot.tasksTotal;
    var labels = Array.isArray(snapshot.openLabels)
      ? snapshot.openLabels.filter(Boolean)
      : [];

    if (snapshot.stuck || snapshot.phase === 'blocked') {
      var reasons = Array.isArray(snapshot.blockedReasons)
        ? snapshot.blockedReasons.filter(Boolean)
        : [];
      if (!reasons.length) return 'Bloqu\u00e9';
      if (reasons.length === 1) {
        return clampProgressSummarySentence(reasons[0]);
      }
      var joined = reasons.join(', ');
      if (joined.length <= 42) return clampProgressSummarySentence(joined);
      return clampProgressSummarySentence(
        reasons[0] + ' +' + (reasons.length - 1)
      );
    }

    if (!total) {
      if (snapshot.phase === 'done' || snapshot.progressPercent >= 100) {
        return 'Compl\u00e9t\u00e9';
      }
      if (
        snapshot.progressPercent != null &&
        snapshot.progressPercent > 0 &&
        snapshot.progressPercent < 100
      ) {
        return snapshot.progressPercent + '\u00a0%';
      }
      return 'En attente';
    }

    if (snapshot.phase === 'done' || open <= 0) return 'Compl\u00e9t\u00e9';

    if (labels.length === 1) {
      return clampProgressSummarySentence('Reste\u00a0: ' + labels[0] + '.');
    }
    if (labels.length === 2) {
      return clampProgressSummarySentence(
        'Reste\u00a0: ' + labels[0] + ' et ' + labels[1] + '.'
      );
    }
    if (labels.length >= 3) {
      return clampProgressSummarySentence(
        'Reste\u00a0: ' +
          labels[0] +
          ', ' +
          labels[1] +
          ' et ' +
          (open - 2) +
          ' autre' +
          (open - 2 > 1 ? 's' : '') +
          '.'
      );
    }

    if (open === 1) return 'Une t\u00e2che restante';
    if (open === 2) return 'Deux t\u00e2ches restantes';
    return open + ' t\u00e2ches restantes';
  }

  /**
   * AI Progrès tab summary: one short sentence combining the task hierarchy.
   * Returns { ok, skipped?, reason?, sentence?, source, usage?, debug }.
   */
  async function cardProgressSummaryTurn(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var context = options.context || buildContext(bridge);
    var snapshot =
      options.snapshot ||
      buildProgressSummarySnapshot(context, {
        linkedTreeByItemId: options.linkedTreeByItemId
      });
    var heuristic = buildHeuristicProgressSummary(snapshot);

    // Blocked: Motifs are structured — skip AI so the reason replaces open tasks.
    if (snapshot.stuck || snapshot.phase === 'blocked') {
      return {
        ok: true,
        skipped: true,
        reason: 'blocked',
        sentence: heuristic,
        source: 'heuristic'
      };
    }

    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      return {
        ok: true,
        skipped: true,
        reason: 'not-configured',
        sentence: heuristic,
        source: 'heuristic'
      };
    }

    if (!snapshot.tasksTotal && !(snapshot.outline && snapshot.outline.length)) {
      return {
        ok: true,
        skipped: true,
        reason: 'no-tasks',
        sentence: heuristic,
        source: 'heuristic'
      };
    }

    var messages = [
      {
        role: 'system',
        content: [
          'Tu r\u00e9diges UNE phrase courte pour le r\u00e9sum\u00e9 de l\'onglet Progr\u00e8s d\'une carte Trello.',
          'Objectif\u00a0: synth\u00e9tiser le sens de TOUTES les t\u00e2ches, sous-t\u00e2ches et sous-sous-t\u00e2ches (outline) en une phrase utile.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"sentence":"\u2026"}',
          'R\u00e8gles\u00a0:',
          '- Une seule phrase, fran\u00e7ais, ton clair et factuel.',
          '- Max ~' + MAX_PROGRESS_SUMMARY_LEN + ' caract\u00e8res.',
          '- Combine / synth\u00e9tise\u00a0: ne liste pas tout comme un inventaire robotique.',
          '- Si stuck/phase=blocked\u00a0: r\u00e9sume UNIQUEMENT les causes (blockedReasons), pas les t\u00e2ches ouvertes.',
          '- Si du travail reste (non bloqu\u00e9)\u00a0: dis ce qui reste \u00e0 faire (th\u00e8me + prochaines \u00e9tapes utiles).',
          '- Si tout est done\u00a0: dis que c\'est termin\u00e9, en rappelant bri\u00e8vement le sujet.',
          '- INTERDIT de citer le % de progr\u00e8s.',
          '- INTERDIT d\'encourager / flatter.',
          '- N\'invente aucune \u00e9tape absente de outline / openLabels / blockedReasons.',
          '- Ex. BON\u00a0: "Reste la validation client (maquette + feedback) avant publication."',
          '- Ex. BON\u00a0: "R\u00e9daction du brief termin\u00e9e\u00a0; encha\u00eene sur relecture et envoi."',
          '- Ex. BON (bloqu\u00e9)\u00a0: "En attente d\'une approbation."',
          '- Ex. MAUVAIS\u00a0: "3 t\u00e2ches restantes."',
          '- Ex. MAUVAIS (bloqu\u00e9)\u00a0: citer une t\u00e2che ouverte au lieu de blockedReasons.',
          'Snapshot\u00a0:',
          JSON.stringify(snapshot)
        ].join('\n')
      },
      {
        role: 'user',
        content:
          'Donne la phrase de r\u00e9sum\u00e9 Progr\u00e8s (JSON {"sentence":"\u2026"}). Heuristique de secours\u00a0: ' +
          heuristic
      }
    ];

    var debug = {
      id: 'progress-summary-' + Date.now().toString(36),
      kind: 'cardProgressSummaryTurn',
      label: 'R\u00e9sum\u00e9 Progr\u00e8s',
      startedAt: Date.now(),
      attempts: []
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('cardProgressSummaryTurn onDebug failed', cbErr);
      }
    }

    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 120,
          temperature: 0.35
        });
        if (response.meta) {
          debug.attempts.push(Object.assign({ label: 'json' }, response.meta));
        }
      } catch (err) {
        if (err && err.debugMeta) {
          debug.attempts.push(Object.assign({ label: 'json' }, err.debugMeta));
        }
        if (
          err &&
          err.message &&
          /response_format|json_object|json mode/i.test(err.message)
        ) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 120,
            temperature: 0.35
          });
          if (response.meta) {
            debug.attempts.push(
              Object.assign({ label: 'sans json mode' }, response.meta)
            );
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
      debug.request = debug.attempts.length
        ? debug.attempts[debug.attempts.length - 1]
        : null;
      emitDebug();
      return {
        ok: true,
        skipped: false,
        reason: 'llm-error',
        sentence: heuristic,
        source: 'heuristic',
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
      response.meta ||
      (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response.meta && response.meta.status,
      content: response.content,
      raw: cloneJsonSafe(response.raw),
      parsed: data
    };
    debug.usage = usage;
    emitDebug();

    var aiSentence =
      data && typeof data.sentence === 'string'
        ? clampProgressSummarySentence(data.sentence)
        : '';
    if (!aiSentence) {
      return {
        ok: true,
        skipped: true,
        reason: 'empty-sentence',
        sentence: heuristic,
        source: 'heuristic',
        usage: usage,
        debug: debug
      };
    }

    return {
      ok: true,
      skipped: false,
      sentence: aiSentence,
      source: 'ai',
      usage: usage,
      debug: debug
    };
  }

  /** Compact snapshot of fields already visible on the card (so dream does not repeat them). */
  function buildDreamCardSnapshot(context) {
    var due = context && context.due;
    var progress = context && context.progress;
    var blocked = context && context.blocked;
    var items =
      progress && Array.isArray(progress.items)
        ? progress.items
            .map(function (it) {
              if (!it || typeof it !== 'object') return null;
              var text = typeof it.text === 'string' ? it.text.trim() : '';
              if (!text) return null;
              return (it.done ? '[x] ' : '[ ] ') + text.slice(0, 80);
            })
            .filter(Boolean)
            .slice(0, 8)
        : [];
    return {
      due:
        due && due.enabled && due.dueDate
          ? {
              dueDate: due.dueDate,
              dueTime: due.dueTime || null
            }
          : null,
      progress:
        progress && progress.enabled !== false
          ? {
              percent:
                typeof progress.percent === 'number'
                  ? progress.percent
                  : typeof progress.cardProgress === 'number'
                    ? progress.cardProgress
                    : null,
              items: items
            }
          : null,
      blocked:
        blocked && blocked.enabled
          ? {
              reasons: Array.isArray(blocked.blockedReasons)
                ? blocked.blockedReasons.slice(0, 4)
                : []
            }
          : null,
      statut:
        context && context.statut && context.statut.listName
          ? context.statut.listName
          : null
    };
  }

  /**
   * Dream stage: between chats, keep the Trello Description as a short task
   * summary + misc notes that are not already visible on other card fields.
   * Silent consolidation pass — not a user-facing conversation turn.
   *
   * Returns { ok, skipped?, reason?, updated?, desc?, applied?, usage?, debug }.
   */
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
   * Ids: proche | lointain | eventuellement (+ legacy bientot).
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
      t === 'proche' ||
      t === 'near future' ||
      t === 'soonish' ||
      t.indexOf('futur proche') >= 0 ||
      t.indexOf('near term') >= 0
    ) {
      return 'proche';
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
    if (t === 'bientot' || t === 'soon') return 'bientot';
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

  function matchCustomAssignee(list, spec) {
    var people = Array.isArray(list) ? list : [];
    if (!people.length || spec == null || spec === '') return null;
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
      pushChange(parts, 'urgency', beforeP.urgency, afterP.urgency);
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
    }
    return parts.length ? parts.join('; ') : 'aucun diff d\u00e9tect\u00e9';
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
   * Technical recap from executeActions results (executor is source of truth).
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
        // Duration now lives in Progrès — redirect legacy Facilité duration args.
        var redirectedEstimate = resolveEstimateMinutesArg({
          estimatedMinutes:
            args.estimatedDurationMinutes !== undefined
              ? args.estimatedDurationMinutes
              : undefined,
          estimatedDuration:
            typeof args.estimatedDuration === 'string'
              ? args.estimatedDuration
              : undefined
        });
        var hasRedirectedEstimate =
          args.estimatedDurationMinutes !== undefined ||
          (typeof args.estimatedDuration === 'string' &&
            !!args.estimatedDuration.trim());
        if (args.priorityEnabled != null) {
          partial.priorityEnabled = !!args.priorityEnabled;
        } else if (
          (partial.urgency != null ||
            partial.impact != null ||
            partial.ease != null) &&
          !beforeP.priorityEnabled
        ) {
          // Writing axis values must activate Priorité or the UI stays off.
          partial.priorityEnabled = true;
        }
        if (!Object.keys(partial).length && !hasRedirectedEstimate) {
          return {
            ok: false,
            tool: tool,
            error: 'Aucun champ priorit\u00e9 \u00e0 modifier'
          };
        }
        if (Object.keys(partial).length) {
          bridge.applyPriority(partial);
        }
        var beforeCRedirect = null;
        var afterCRedirect = null;
        if (
          hasRedirectedEstimate &&
          typeof bridge.applyCompletion === 'function' &&
          typeof bridge.getCompletion === 'function' &&
          typeof CompletionTrello !== 'undefined' &&
          typeof CompletionTrello.applyMasterEstimate === 'function'
        ) {
          beforeCRedirect = snapshotCompletion(bridge);
          var redirected = CompletionTrello.applyMasterEstimate(
            bridge.getCompletion() || { items: [] },
            redirectedEstimate == null ? null : redirectedEstimate,
            { lock: false }
          );
          bridge.applyCompletion(redirected);
          afterCRedirect = snapshotCompletion(bridge);
        }
        var afterP = snapshotPriority(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_priority,
          detail: detailForTool(
            tool,
            beforeP,
            afterP,
            beforeCRedirect,
            afterCRedirect,
            args
          )
        };
      }
      if (tool === 'set_task_types') {
        if (typeof bridge.applyPriority !== 'function') {
          return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
        }
        var beforeTypes = snapshotPriority(bridge);
        var nextTypes = normalizeAgentTaskTypes(
          args.types != null ? args.types : args.taskTypes
        );
        if (
          beforeTypes.taskTypesLocked &&
          args.force !== true &&
          !taskTypesEqual(nextTypes, beforeTypes.taskTypes)
        ) {
          return {
            ok: false,
            tool: tool,
            error: 'Types verrouill\u00e9s par l\'utilisateur (force requis)'
          };
        }
        var typesPartial = { taskTypes: nextTypes };
        // AI writes stay unlocked; user edits set the lock in Information.
        // When forcing over a user lock, keep the lock so AI still cannot silently rewrite later.
        if (beforeTypes.taskTypesLocked) {
          typesPartial.taskTypesLocked = true;
        }
        bridge.applyPriority(typesPartial);
        var afterTypes = snapshotPriority(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_task_types,
          detail: detailForTool(
            tool,
            beforeTypes,
            afterTypes,
            null,
            null,
            args
          )
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
          }),
          visual: {
            type: 'statut',
            listId: targetListId,
            listName: listName,
            category: args.category || undefined
          }
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
          }),
          visual: clearProject
            ? { type: 'project', cleared: true }
            : {
                type: 'project',
                projectId: projectId,
                name: projectName
              }
        };
      }
      if (tool === 'set_due') {
        if (typeof bridge.applyPriority !== 'function') {
          return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
        }
        var beforeDue = snapshotPriority(bridge);
        var duePartial = {};
        var vagueId = '';
        var clearDue =
          args.clear === true ||
          args.clearDue === true ||
          (args.dueDate === null &&
            args.dueEnabled === false &&
            !Object.prototype.hasOwnProperty.call(args, 'dueVague') &&
            args.relativeMinutes == null &&
            args.relativeHours == null);

        if (clearDue) {
          duePartial.dueEnabled = false;
          duePartial.dueDate = '';
          duePartial.dueTime = '';
          duePartial.dueVague = '';
          duePartial.dueMode = 'precise';
        } else {
          if (Object.prototype.hasOwnProperty.call(args, 'dueVague')) {
            vagueId = resolveDueVagueArg(args.dueVague);
            if (args.dueVague != null && args.dueVague !== '' && !vagueId) {
              return {
                ok: false,
                tool: tool,
                error:
                  'dueVague invalide (proche|lointain|eventuellement)'
              };
            }
          } else if (
            args.dueMode === 'vague' &&
            Object.prototype.hasOwnProperty.call(args, 'dueDate') === false &&
            args.relativeMinutes == null &&
            args.relativeHours == null
          ) {
            return {
              ok: false,
              tool: tool,
              error: 'dueVague requis en mode vague'
            };
          }
          var hasRelative =
            args.relativeMinutes != null || args.relativeHours != null;
          if (vagueId) {
            var vagueDate = resolveDueVagueToDateSafe(vagueId);
            if (!vagueDate) {
              return {
                ok: false,
                tool: tool,
                error: 'Impossible de r\u00e9soudre l\'horizon vague'
              };
            }
            duePartial.dueVague = vagueId;
            duePartial.dueMode = 'vague';
            duePartial.dueDate = vagueDate;
            duePartial.dueTime = '';
            // Vague UI clears start + recurrence.
            duePartial.startDate = '';
            duePartial.startTime = '';
            duePartial.recurrence = null;
          } else if (hasRelative) {
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
            duePartial.dueMode = 'precise';
            duePartial.dueVague = '';
          } else {
            if (Object.prototype.hasOwnProperty.call(args, 'dueDate')) {
              var dueDate = validateDueDate(args.dueDate);
              if (dueDate === undefined) {
                return { ok: false, tool: tool, error: 'dueDate invalide (YYYY-MM-DD)' };
              }
              duePartial.dueDate = dueDate || '';
              duePartial.dueMode = 'precise';
              duePartial.dueVague = '';
            }
            if (Object.prototype.hasOwnProperty.call(args, 'dueTime')) {
              var dueTime = validateDueTime(args.dueTime);
              if (dueTime === undefined) {
                return { ok: false, tool: tool, error: 'dueTime invalide (HH:MM)' };
              }
              duePartial.dueTime = dueTime || '';
              duePartial.dueMode = 'precise';
              duePartial.dueVague = '';
            }
          }
          if (args.dueEnabled != null) {
            duePartial.dueEnabled = !!args.dueEnabled;
          } else if (
            (Object.prototype.hasOwnProperty.call(duePartial, 'dueDate') ||
              Object.prototype.hasOwnProperty.call(duePartial, 'dueTime') ||
              Object.prototype.hasOwnProperty.call(duePartial, 'dueVague')) &&
            !beforeDue.dueEnabled
          ) {
            duePartial.dueEnabled = true;
          }
        }

        // Start date / time (precise mode only — ignored when going vague).
        if (args.clearStart === true) {
          duePartial.startDate = '';
          duePartial.startTime = '';
        } else if (!vagueId) {
          if (Object.prototype.hasOwnProperty.call(args, 'startDate')) {
            var startDate = validateDueDate(args.startDate);
            if (startDate === undefined) {
              return {
                ok: false,
                tool: tool,
                error: 'startDate invalide (YYYY-MM-DD)'
              };
            }
            duePartial.startDate = startDate || '';
            if (!startDate) duePartial.startTime = '';
          }
          if (Object.prototype.hasOwnProperty.call(args, 'startTime')) {
            var startTime = validateDueTime(args.startTime);
            if (startTime === undefined) {
              return {
                ok: false,
                tool: tool,
                error: 'startTime invalide (HH:MM)'
              };
            }
            duePartial.startTime = startTime || '';
          }
        }

        // Recurrence (precise mode only; null / clearRecurrence clears).
        if (vagueId) {
          /* already cleared above */
        } else if (
          args.clearRecurrence === true ||
          args.recurrence === null ||
          args.recurrence === ''
        ) {
          duePartial.recurrence = null;
        } else if (
          Object.prototype.hasOwnProperty.call(args, 'recurrence') &&
          args.recurrence &&
          typeof args.recurrence === 'object'
        ) {
          var rule = null;
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.normalizeRecurrence === 'function'
          ) {
            rule = PriorityUI.normalizeRecurrence(args.recurrence);
          }
          if (!rule) {
            return {
              ok: false,
              tool: tool,
              error:
                'recurrence invalide (frequency: daily|weekly|monthly|yearly)'
            };
          }
          duePartial.recurrence = rule;
          duePartial.dueMode = 'precise';
          duePartial.dueVague = '';
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
        var beforeBlockedCompletion =
          typeof bridge.getCompletion === 'function'
            ? snapshotCompletion(bridge)
            : null;
        bridge.applyPriority(blockedPartial);
        var afterBlockedCompletion = beforeBlockedCompletion;
        // Keep Progrès blocked flags in sync with card Bloqué (bidirectional).
        if (
          typeof bridge.applyCompletion === 'function' &&
          typeof bridge.getCompletion === 'function' &&
          typeof CompletionTrello !== 'undefined'
        ) {
          var completionWhileBlocked = bridge.getCompletion() || { items: [] };
          var nextBlockedCompletion = completionWhileBlocked;
          if (blockedPartial.enAttente === false) {
            if (typeof CompletionTrello.clearAllBlocked === 'function') {
              nextBlockedCompletion =
                CompletionTrello.clearAllBlocked(completionWhileBlocked);
            }
          } else if (blockedPartial.enAttente === true) {
            if (
              typeof CompletionTrello.isAllSubtasksComplete === 'function' &&
              typeof CompletionTrello.markNotFullyComplete === 'function' &&
              CompletionTrello.isAllSubtasksComplete(completionWhileBlocked)
            ) {
              nextBlockedCompletion = CompletionTrello.markNotFullyComplete(
                completionWhileBlocked
              );
            }
            // Mirror linked items → item.blocked; otherwise master.blocked.
            var linkIds = [];
            if (Array.isArray(blockedPartial.blockedLinks)) {
              blockedPartial.blockedLinks.forEach(function (link) {
                if (link && link.id) linkIds.push(String(link.id));
              });
            }
            if (
              linkIds.length &&
              typeof CompletionTrello.setItemBlocked === 'function'
            ) {
              linkIds.forEach(function (id) {
                nextBlockedCompletion = CompletionTrello.setItemBlocked(
                  nextBlockedCompletion,
                  id,
                  true
                );
              });
            } else if (
              typeof CompletionTrello.hasAnyBlocked === 'function' &&
              !CompletionTrello.hasAnyBlocked(nextBlockedCompletion) &&
              typeof CompletionTrello.setMasterBlocked === 'function'
            ) {
              nextBlockedCompletion = CompletionTrello.setMasterBlocked(
                nextBlockedCompletion,
                true,
                { origin: 'status' }
              );
            }
            if (
              Array.isArray(blockedPartial.blockedReasons) &&
              blockedPartial.blockedReasons.length
            ) {
              if (
                linkIds.length === 1 &&
                typeof CompletionTrello.setItemBlockedReasons === 'function'
              ) {
                var linkItem = null;
                var linkItems =
                  (nextBlockedCompletion && nextBlockedCompletion.items) || [];
                for (var li = 0; li < linkItems.length; li++) {
                  if (
                    linkItems[li] &&
                    String(linkItems[li].id) === String(linkIds[0])
                  ) {
                    linkItem = linkItems[li];
                    break;
                  }
                }
                var linkHadReasons =
                  linkItem &&
                  Array.isArray(linkItem.blockedReasons) &&
                  linkItem.blockedReasons.length > 0;
                var whyText = blockedPartial.blockedReasons[
                  blockedPartial.blockedReasons.length - 1
                ];
                var canPair =
                  !linkHadReasons &&
                  linkItem &&
                  whyText &&
                  typeof fallbackBlockedReasonPair === 'function' &&
                  !isPureWaitingOnTaskReason(whyText, linkItem.text);
                if (canPair) {
                  var pair =
                    typeof suggestBlockedReasonPair === 'function'
                      ? await suggestBlockedReasonPair(
                          bridge.provider || null,
                          {
                            subtaskTitle: linkItem.text,
                            why: whyText,
                            cardTitle:
                              (bridge.getCardName && bridge.getCardName()) ||
                              '',
                          }
                        )
                      : fallbackBlockedReasonPair({
                          subtaskTitle: linkItem.text,
                          why: whyText,
                        });
                  nextBlockedCompletion =
                    CompletionTrello.setItemBlockedReasons(
                      nextBlockedCompletion,
                      linkIds[0],
                      pair.subtaskReason ? [pair.subtaskReason] : []
                    );
                  if (pair.cardReason) {
                    blockedPartial.blockedReasons = [pair.cardReason];
                    bridge.applyPriority({
                      blockedReasons: [pair.cardReason],
                      enAttente: true,
                    });
                  }
                } else {
                  linkIds.forEach(function (id) {
                    nextBlockedCompletion =
                      CompletionTrello.setItemBlockedReasons(
                        nextBlockedCompletion,
                        id,
                        blockedPartial.blockedReasons
                      );
                  });
                }
              } else if (
                linkIds.length &&
                typeof CompletionTrello.setItemBlockedReasons === 'function'
              ) {
                linkIds.forEach(function (id) {
                  nextBlockedCompletion =
                    CompletionTrello.setItemBlockedReasons(
                      nextBlockedCompletion,
                      id,
                      blockedPartial.blockedReasons
                    );
                });
              } else if (
                typeof CompletionTrello.setMasterBlockedReasons === 'function'
              ) {
                // Card Motifs from set_blocked → master entity Motifs.
                nextBlockedCompletion =
                  CompletionTrello.setMasterBlockedReasons(
                    nextBlockedCompletion,
                    blockedPartial.blockedReasons,
                    { origin: 'status' }
                  );
              }
            }
          }
          if (
            JSON.stringify(
              CompletionTrello.normalizeCompletionData(completionWhileBlocked)
            ) !==
            JSON.stringify(
              CompletionTrello.normalizeCompletionData(nextBlockedCompletion)
            )
          ) {
            bridge.applyCompletion(nextBlockedCompletion);
            afterBlockedCompletion = snapshotCompletion(bridge);
          }
        }
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
            beforeBlockedCompletion,
            afterBlockedCompletion,
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
        var existingAdd = findExistingSubtaskByText(items, text);
        var addDone = !!args.done;
        var addBlocked = !addDone && !!args.blocked;
        if (existingAdd) {
          var existingId = existingAdd.id;
          if (addDone && !existingAdd.done) {
            var doneItems = items.map(function (item) {
              if (item.id !== existingId) return item;
              var copy = Object.assign({}, item);
              copy.done = true;
              copy.progress = 100;
              delete copy.blocked;
              return copy;
            });
            var donePayload = Object.assign({}, data, { items: doneItems });
            if (donePayload.progressEnabled === false) {
              delete donePayload.progressEnabled;
            }
            bridge.applyCompletion(donePayload);
            var afterDone = snapshotCompletion(bridge);
            return {
              ok: true,
              tool: tool,
              args: args,
              summary: TOOL_LABELS.toggle_subtask,
              id: existingId,
              detail: detailForTool(
                'toggle_subtask',
                null,
                null,
                beforeAdd,
                afterDone,
                { id: existingId, done: true },
                { id: existingId }
              )
            };
          }
          if (
            addBlocked &&
            !existingAdd.done &&
            !existingAdd.blocked &&
            typeof CompletionTrello !== 'undefined' &&
            typeof CompletionTrello.setItemBlocked === 'function'
          ) {
            var blockedNext = CompletionTrello.setItemBlocked(
              data,
              existingId,
              true
            );
            bridge.applyCompletion(blockedNext);
            if (typeof bridge.applyPriority === 'function') {
              var blockedPriExisting = { enAttente: true };
              blockedPriExisting.blockedLinks =
                CompletionTrello.blockedLinksFromCompletion
                  ? CompletionTrello.blockedLinksFromCompletion(blockedNext)
                  : [{ type: 'subtask', id: existingId, label: text }];
              bridge.applyPriority(blockedPriExisting);
            }
            var afterBlocked = snapshotCompletion(bridge);
            return {
              ok: true,
              tool: tool,
              args: args,
              summary: TOOL_LABELS.set_subtask_blocked,
              id: existingId,
              detail: detailForTool(
                'set_subtask_blocked',
                null,
                null,
                beforeAdd,
                afterBlocked,
                { id: existingId, blocked: true },
                { id: existingId, blocked: true }
              )
            };
          }
          return {
            ok: true,
            skipped: true,
            tool: tool,
            args: args,
            id: existingId,
            detail: '"' + text + '" d\u00e9j\u00e0 pr\u00e9sente'
          };
        }
        var id =
          'agent-' +
          Date.now().toString(36) +
          '-' +
          Math.random().toString(36).slice(2, 8);
        var newItem = {
          id: id,
          text: text,
          done: addDone,
          progress: addDone ? 100 : 0
        };
        if (addBlocked) newItem.blocked = true;
        var addEst = resolveEstimateMinutesArg(args);
        if (addEst != null) newItem.estimatedMinutes = addEst;
        items.push(newItem);
        var added = Object.assign({}, data, { items: items });
        delete added.progress;
        if (added.progressEnabled === false) delete added.progressEnabled;
        bridge.applyCompletion(added);
        // Blocked subtask implies card Bloqué (same rule as Progrès UI).
        if (addBlocked && typeof bridge.applyPriority === 'function') {
          var blockedPri = { enAttente: true };
          blockedPri.blockedLinks = [
            { type: 'subtask', id: id, label: text }
          ];
          bridge.applyPriority(blockedPri);
        }
        var afterAdd = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.add_subtask,
          id: id,
          detail: detailForTool(tool, null, null, beforeAdd, afterAdd, args, {
            id: id
          }),
          visual: {
            type: 'subtask',
            id: id,
            text: text,
            done: addDone,
            blocked: addBlocked,
            estimatedMinutes: addEst != null ? addEst : undefined
          }
        };
      }
      if (tool === 'set_subtask_blocked') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
        }
        if (typeof CompletionTrello === 'undefined') {
          return { ok: false, tool: tool, error: 'CompletionTrello indisponible' };
        }
        var beforeItemBlocked = snapshotCompletion(bridge);
        var itemBlockedBase =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
        var itemBlockedTarget = resolveSubtaskItem(itemBlockedBase.items, args);
        if (!itemBlockedTarget) {
          return { ok: false, tool: tool, error: 'Sous-t\u00e2che introuvable' };
        }
        var wantBlocked =
          args.blocked != null ? !!args.blocked : !itemBlockedTarget.blocked;
        var nextItemBlocked;
        var pairCardReason = null;
        if (
          wantBlocked &&
          Array.isArray(args.blockedReasons) &&
          typeof CompletionTrello.setItemBlockedReasons === 'function'
        ) {
          var whyArg = args.blockedReasons
            .filter(function (r) {
              return typeof r === 'string' && r.trim();
            })
            .map(function (r) {
              return normalizeAgentBlockedReason(r) || String(r).trim();
            })
            .filter(Boolean);
          var itemHadMotifs =
            Array.isArray(itemBlockedTarget.blockedReasons) &&
            itemBlockedTarget.blockedReasons.length > 0;
          var whyText = whyArg.length ? whyArg[whyArg.length - 1] : '';
          if (
            !itemHadMotifs &&
            whyText &&
            !isPureWaitingOnTaskReason(whyText, itemBlockedTarget.text)
          ) {
            var itemPair = fallbackBlockedReasonPair({
              subtaskTitle: itemBlockedTarget.text,
              why: whyText,
            });
            try {
              itemPair = await suggestBlockedReasonPair(null, {
                subtaskTitle: itemBlockedTarget.text,
                why: whyText,
              });
            } catch (pairErr) {
              /* keep fallback */
            }
            nextItemBlocked = CompletionTrello.setItemBlockedReasons(
              itemBlockedBase,
              itemBlockedTarget.id,
              itemPair.subtaskReason ? [itemPair.subtaskReason] : whyArg
            );
            pairCardReason = itemPair.cardReason || null;
          } else {
            nextItemBlocked = CompletionTrello.setItemBlockedReasons(
              itemBlockedBase,
              itemBlockedTarget.id,
              whyArg.length ? whyArg : args.blockedReasons
            );
          }
        } else {
          nextItemBlocked = CompletionTrello.setItemBlocked(
            itemBlockedBase,
            itemBlockedTarget.id,
            wantBlocked
          );
        }
        bridge.applyCompletion(nextItemBlocked);
        if (typeof bridge.applyPriority === 'function') {
          if (wantBlocked) {
            var priPartial = {
              enAttente: true,
              blockedLinks: CompletionTrello.blockedLinksFromCompletion(
                nextItemBlocked
              ),
            };
            if (pairCardReason) {
              priPartial.blockedReasons = [pairCardReason];
            } else if (CompletionTrello.aggregateBlockedReasons) {
              priPartial.blockedReasons =
                CompletionTrello.aggregateBlockedReasons(nextItemBlocked);
            }
            bridge.applyPriority(priPartial);
          } else if (
            typeof CompletionTrello.hasAnyBlocked === 'function' &&
            !CompletionTrello.hasAnyBlocked(nextItemBlocked)
          ) {
            bridge.applyPriority({ enAttente: false, blockedLinks: [] });
          } else {
            bridge.applyPriority({
              blockedLinks: CompletionTrello.blockedLinksFromCompletion(
                nextItemBlocked
              ),
              blockedReasons: CompletionTrello.aggregateBlockedReasons
                ? CompletionTrello.aggregateBlockedReasons(nextItemBlocked)
                : undefined,
            });
          }
        }
        var afterItemBlocked = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_subtask_blocked,
          detail: detailForTool(
            tool,
            null,
            null,
            beforeItemBlocked,
            afterItemBlocked,
            args,
            { id: itemBlockedTarget.id, blocked: wantBlocked }
          )
        };
      }
      if (tool === 'set_subtask_estimate') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
        }
        var estMins = resolveEstimateMinutesArg(args);
        if (estMins === undefined && args.estimatedMinutes !== null) {
          return { ok: false, tool: tool, error: 'Dur\u00e9e estim\u00e9e invalide' };
        }
        var beforeEst = snapshotCompletion(bridge);
        var estBase =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
        var estTarget = resolveSubtaskItem(estBase.items, args);
        if (!estTarget) {
          return { ok: false, tool: tool, error: 'Sous-t\u00e2che introuvable' };
        }
        var nextEst =
          typeof CompletionTrello !== 'undefined' &&
          typeof CompletionTrello.applyItemEstimate === 'function'
            ? CompletionTrello.applyItemEstimate(estBase, estTarget.id, estMins, {
                lock: true
              })
            : (function () {
                var copy = Object.assign({}, estBase, {
                  items: (estBase.items || []).map(function (item) {
                    if (item.id !== estTarget.id) return item;
                    var row = Object.assign({}, item);
                    if (estMins == null) delete row.estimatedMinutes;
                    else row.estimatedMinutes = estMins;
                    row.estimatedMinutesLocked = true;
                    return row;
                  })
                });
                return copy;
              })();
        bridge.applyCompletion(nextEst);
        var afterEst = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_subtask_estimate,
          id: estTarget.id,
          detail: detailForTool(tool, null, null, beforeEst, afterEst, args, {
            id: estTarget.id
          })
        };
      }
      if (tool === 'set_progress_estimate') {
        if (typeof bridge.applyCompletion !== 'function') {
          return { ok: false, tool: tool, error: 'Progr\u00e8s indisponible' };
        }
        var masterMins = resolveEstimateMinutesArg(args);
        if (masterMins === undefined && args.estimatedMinutes !== null) {
          return { ok: false, tool: tool, error: 'Dur\u00e9e estim\u00e9e invalide' };
        }
        var beforeMaster = snapshotCompletion(bridge);
        var masterBase =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
        var nextMaster =
          typeof CompletionTrello !== 'undefined' &&
          typeof CompletionTrello.applyMasterEstimate === 'function'
            ? CompletionTrello.applyMasterEstimate(masterBase, masterMins, {
                lock: true
              })
            : Object.assign({}, masterBase, {
                estimatedMinutes: masterMins
              });
        bridge.applyCompletion(nextMaster);
        var afterMaster = snapshotCompletion(bridge);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_progress_estimate,
          detail: detailForTool(
            tool,
            null,
            null,
            beforeMaster,
            afterMaster,
            args
          )
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
      if (tool === 'trigger_effect') {
        var effectRaw = args.effect || args.name || args.id;
        var effectId = normalizeEffectId(effectRaw);
        if (!effectId) {
          return {
            ok: false,
            tool: tool,
            error:
              'Effet inconnu. Valeurs\u00a0: ' + EFFECT_IDS.join(', ')
          };
        }
        var effectText = '';
        if (typeof args.text === 'string' && args.text.trim()) {
          effectText = args.text.trim().slice(0, 48);
        } else if (typeof args.label === 'string' && args.label.trim()) {
          effectText = args.label.trim().slice(0, 48);
        } else if (typeof args.message === 'string' && args.message.trim()) {
          effectText = args.message.trim().slice(0, 48);
        }
        if (effectText) {
          effectText = localizeEffectText(effectText, resolveEffectLanguage(bridge));
        }
        if (effectId === 'banner' && !effectText) {
          return {
            ok: false,
            tool: tool,
            error: 'banner exige un text (plein \u00e9cran)',
            args: { effect: effectId }
          };
        }
        var soundOverride = null;
        if (typeof args.sound === 'string' && args.sound.trim()) {
          soundOverride = normalizeEffectId(args.sound);
        } else if (typeof args.soundEffect === 'string' && args.soundEffect.trim()) {
          soundOverride = normalizeEffectId(args.soundEffect);
        } else if (typeof args.sfx === 'string' && args.sfx.trim()) {
          soundOverride = normalizeEffectId(args.sfx);
        }
        if (typeof bridge.playEffect !== 'function') {
          return { ok: false, tool: tool, error: 'Effets indisponibles' };
        }
        var playOpts = { sound: soundOverride || true };
        if (effectText) playOpts.text = effectText;
        var played = bridge.playEffect(effectId, playOpts);
        if (played && played.ok === false) {
          return {
            ok: false,
            tool: tool,
            error: (played && played.error) || 'Effet \u00e9chou\u00e9',
            args: { effect: effectId, text: effectText || undefined }
          };
        }
        var resultArgs = { effect: effectId };
        if (effectText) resultArgs.text = effectText;
        if (soundOverride) resultArgs.sound = soundOverride;
        return {
          ok: true,
          tool: tool,
          args: resultArgs,
          summary: TOOL_LABELS.trigger_effect,
          detail: detailForTool(tool, null, null, null, null, args, {
            effect: effectId,
            text: effectText || undefined
          })
        };
      }
      if (tool === 'point_at') {
        var pointSection = normalizePointSection(
          args.section || args.target || args.area || args.panel
        );
        var pointField = normalizePointField(
          args.field || args.axis || args.dim
        );
        var pointLevel = normalizePointLevel(
          args.level != null ? args.level : args.value
        );
        if (pointLevel == null) {
          var inferredLevel = normalizePointLevel(
            args.field || args.axis || args.dim
          );
          if (inferredLevel != null) pointLevel = inferredLevel;
        }
        if (!pointSection && !pointField) {
          return {
            ok: false,
            tool: tool,
            error: 'section ou field requis'
          };
        }
        if (pointField && !pointSection) {
          pointSection = 'priority';
        }
        if (typeof bridge.pointAt !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Pointage indisponible'
          };
        }
        var pointArgs = {};
        if (pointSection) pointArgs.section = pointSection;
        if (pointField) pointArgs.field = pointField;
        if (pointLevel != null) pointArgs.level = pointLevel;
        var pointed = bridge.pointAt(pointArgs);
        if (pointed && typeof pointed.then === 'function') {
          pointed = await pointed;
        }
        if (pointed && pointed.ok === false) {
          return {
            ok: false,
            tool: tool,
            error: (pointed && pointed.error) || 'Cible introuvable',
            args: pointArgs
          };
        }
        return {
          ok: true,
          tool: tool,
          args: pointArgs,
          summary: TOOL_LABELS.point_at,
          detail: detailForTool(tool, null, null, null, null, args, {
            section: pointSection || undefined,
            field: pointField || undefined,
            level: pointLevel != null ? pointLevel : undefined
          })
        };
      }
      if (tool === 'set_agent_name') {
        if (typeof bridge.setAgentName !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Changement de nom indisponible'
          };
        }
        var newAgentName =
          typeof args.name === 'string' && args.name.trim()
            ? args.name.trim()
            : typeof args.text === 'string'
              ? args.text.trim()
              : '';
        if (!newAgentName) {
          return { ok: false, tool: tool, error: 'Nouveau nom requis' };
        }
        var beforeAgentName = '';
        if (typeof bridge.getProfile === 'function') {
          try {
            var profSnap = bridge.getProfile();
            if (profSnap && typeof profSnap.agentName === 'string') {
              beforeAgentName = profSnap.agentName.trim();
            }
          } catch (e) { /* ignore */ }
        }
        var renameAgentResult = await Promise.resolve(
          bridge.setAgentName(newAgentName)
        );
        if (!renameAgentResult || !renameAgentResult.ok) {
          var agentRenameReason =
            (renameAgentResult &&
              (renameAgentResult.reason || renameAgentResult.error)) ||
            'Changement de nom \u00e9chou\u00e9';
          if (agentRenameReason === 'empty-name') {
            agentRenameReason = 'Nouveau nom requis';
          }
          return { ok: false, tool: tool, error: agentRenameReason };
        }
        var afterAgentName =
          (renameAgentResult && renameAgentResult.name) || newAgentName;
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_agent_name,
          detail: detailForTool(tool, null, null, null, null, args, {
            before: beforeAgentName,
            after: afterAgentName
          })
        };
      }
      if (tool === 'set_agent_color') {
        if (typeof bridge.setAgentColor !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Changement de couleur indisponible'
          };
        }
        var newAgentColor = normalizeAgentColorArg(
          (typeof args.color === 'string' && args.color) ||
            (typeof args.aura === 'string' && args.aura) ||
            (typeof args.value === 'string' && args.value) ||
            (typeof args.text === 'string' && args.text) ||
            ''
        );
        if (!newAgentColor) {
          return {
            ok: false,
            tool: tool,
            error:
              'Couleur invalide (orange|yellow|\u2026|sky ou #RRGGBB)'
          };
        }
        var beforeAgentColor = '';
        if (typeof bridge.getProfile === 'function') {
          try {
            var colorSnap = bridge.getProfile();
            if (colorSnap && typeof colorSnap.agentColor === 'string') {
              beforeAgentColor = colorSnap.agentColor.trim();
            }
          } catch (eColor) { /* ignore */ }
        }
        var recolorResult = await Promise.resolve(
          bridge.setAgentColor(newAgentColor)
        );
        if (!recolorResult || !recolorResult.ok) {
          var recolorReason =
            (recolorResult && (recolorResult.reason || recolorResult.error)) ||
            'Changement de couleur \u00e9chou\u00e9';
          if (recolorReason === 'empty-color' || recolorReason === 'invalid-color') {
            recolorReason =
              'Couleur invalide (orange|yellow|\u2026|sky ou #RRGGBB)';
          }
          return { ok: false, tool: tool, error: recolorReason };
        }
        var afterAgentColor =
          (recolorResult && recolorResult.color) || newAgentColor;
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_agent_color,
          detail: detailForTool(tool, null, null, null, null, args, {
            before: beforeAgentColor,
            after: afterAgentColor
          })
        };
      }
      if (tool === 'set_agent_personality') {
        if (typeof bridge.setAgentPersonality !== 'function') {
          return {
            ok: false,
            tool: tool,
            error: 'Changement de personnalit\u00e9 indisponible'
          };
        }
        var newPersonality =
          typeof args.personality === 'string' && args.personality.trim()
            ? args.personality.trim()
            : typeof args.text === 'string' && args.text.trim()
              ? args.text.trim()
              : typeof args.value === 'string' && args.value.trim()
                ? args.value.trim()
                : '';
        if (!newPersonality) {
          return {
            ok: false,
            tool: tool,
            error: 'Personnalit\u00e9 requise'
          };
        }
        var personalityResult = await Promise.resolve(
          bridge.setAgentPersonality(newPersonality)
        );
        if (!personalityResult || !personalityResult.ok) {
          var personalityReason =
            (personalityResult &&
              (personalityResult.reason || personalityResult.error)) ||
            'Changement de personnalit\u00e9 \u00e9chou\u00e9';
          if (personalityReason === 'empty-personality') {
            personalityReason = 'Personnalit\u00e9 requise';
          }
          return { ok: false, tool: tool, error: personalityReason };
        }
        var afterPersonality =
          (personalityResult && personalityResult.personality) || newPersonality;
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_agent_personality,
          detail: detailForTool(tool, null, null, null, null, args, {
            after: afterPersonality
          })
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
            if (done) delete copy.blocked;
          } else {
            copy.progress = clampInt(args.progress, 0, 100, item.progress || 0);
            copy.done = copy.progress >= 100;
            if (copy.done) delete copy.blocked;
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
      if (tool === 'set_members') {
        if (
          typeof bridge.addMember !== 'function' &&
          typeof bridge.removeMember !== 'function'
        ) {
          return { ok: false, tool: tool, error: 'Assign\u00e9s indisponibles' };
        }
        var boardMembers = [];
        if (typeof bridge.loadBoardMembers === 'function') {
          boardMembers = await Promise.resolve(bridge.loadBoardMembers());
        } else if (typeof bridge.getBoardMembers === 'function') {
          boardMembers = await Promise.resolve(bridge.getBoardMembers());
        }
        if (!Array.isArray(boardMembers)) boardMembers = [];
        var addSpecs = [];
        if (Array.isArray(args.add)) addSpecs = args.add.slice();
        else if (args.add != null) addSpecs = [args.add];
        else if (args.memberId != null || args.matchText || args.name) {
          addSpecs = [args];
        }
        var removeSpecs = [];
        if (Array.isArray(args.remove)) removeSpecs = args.remove.slice();
        else if (args.remove != null) removeSpecs = [args.remove];
        if (args.clear === true && typeof bridge.getOwnership === 'function') {
          var own = bridge.getOwnership() || {};
          var cur = Array.isArray(own.members) ? own.members : [];
          removeSpecs = removeSpecs.concat(cur);
        }
        if (!addSpecs.length && !removeSpecs.length) {
          return {
            ok: false,
            tool: tool,
            error: 'Aucun membre \u00e0 ajouter ou retirer'
          };
        }
        var memberOps = [];
        var mi;
        for (mi = 0; mi < removeSpecs.length; mi++) {
          var rm = matchBoardMember(boardMembers, removeSpecs[mi]);
          if (!rm && removeSpecs[mi] && removeSpecs[mi].id != null) {
            rm = { id: String(removeSpecs[mi].id) };
          }
          if (!rm || !rm.id) {
            return {
              ok: false,
              tool: tool,
              error: 'Membre \u00e0 retirer introuvable'
            };
          }
          if (typeof bridge.removeMember !== 'function') {
            return { ok: false, tool: tool, error: 'Retrait membre indisponible' };
          }
          var rmRes = await Promise.resolve(bridge.removeMember(rm.id));
          if (!rmRes || rmRes.ok === false) {
            return {
              ok: false,
              tool: tool,
              error:
                (rmRes && (rmRes.reason || rmRes.error)) ||
                'Retrait membre \u00e9chou\u00e9'
            };
          }
          memberOps.push('−' + (rm.fullName || rm.username || rm.id));
        }
        for (mi = 0; mi < addSpecs.length; mi++) {
          var am = matchBoardMember(boardMembers, addSpecs[mi]);
          if (!am || !am.id) {
            return {
              ok: false,
              tool: tool,
              error: 'Membre \u00e0 assigner introuvable'
            };
          }
          if (typeof bridge.addMember !== 'function') {
            return { ok: false, tool: tool, error: 'Ajout membre indisponible' };
          }
          var amRes = await Promise.resolve(bridge.addMember(am.id));
          if (!amRes || amRes.ok === false) {
            return {
              ok: false,
              tool: tool,
              error:
                (amRes && (amRes.reason || amRes.error)) ||
                'Ajout membre \u00e9chou\u00e9'
            };
          }
          memberOps.push('+' + (am.fullName || am.username || am.id));
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_members,
          detail: detailForTool(tool, null, null, null, null, args, {
            ops: memberOps
          })
        };
      }
      if (tool === 'set_labels') {
        if (
          typeof bridge.addLabel !== 'function' &&
          typeof bridge.removeLabel !== 'function' &&
          typeof bridge.createLabel !== 'function'
        ) {
          return { ok: false, tool: tool, error: '\u00c9tiquettes indisponibles' };
        }
        var boardLabels = [];
        if (typeof bridge.loadBoardLabels === 'function') {
          boardLabels = await Promise.resolve(bridge.loadBoardLabels());
        } else if (typeof bridge.getBoardLabels === 'function') {
          boardLabels = await Promise.resolve(bridge.getBoardLabels());
        }
        if (!Array.isArray(boardLabels)) boardLabels = [];
        var cardLabels = [];
        if (typeof bridge.loadCardLabels === 'function') {
          cardLabels = await Promise.resolve(bridge.loadCardLabels());
        } else if (typeof bridge.getCardLabels === 'function') {
          cardLabels = await Promise.resolve(bridge.getCardLabels());
        }
        if (!Array.isArray(cardLabels)) cardLabels = [];
        var labelPool = boardLabels.length ? boardLabels : cardLabels;
        var addLabelSpecs = [];
        if (Array.isArray(args.add)) addLabelSpecs = args.add.slice();
        else if (args.add != null) addLabelSpecs = [args.add];
        var removeLabelSpecs = [];
        if (Array.isArray(args.remove)) removeLabelSpecs = args.remove.slice();
        else if (args.remove != null) removeLabelSpecs = [args.remove];
        if (args.clear === true) {
          removeLabelSpecs = removeLabelSpecs.concat(cardLabels);
        }
        var createSpec =
          args.create && typeof args.create === 'object' ? args.create : null;
        if (
          !addLabelSpecs.length &&
          !removeLabelSpecs.length &&
          !createSpec
        ) {
          return {
            ok: false,
            tool: tool,
            error: 'Aucune \u00e9tiquette \u00e0 modifier'
          };
        }
        var labelOps = [];
        var li;
        for (li = 0; li < removeLabelSpecs.length; li++) {
          var rl =
            matchBoardLabel(cardLabels, removeLabelSpecs[li]) ||
            matchBoardLabel(labelPool, removeLabelSpecs[li]);
          if (!rl || !rl.id) {
            return {
              ok: false,
              tool: tool,
              error: '\u00c9tiquette \u00e0 retirer introuvable'
            };
          }
          if (typeof bridge.removeLabel !== 'function') {
            return {
              ok: false,
              tool: tool,
              error: 'Retrait \u00e9tiquette indisponible'
            };
          }
          var rlRes = await Promise.resolve(bridge.removeLabel(rl.id));
          if (!rlRes || rlRes.ok === false) {
            return {
              ok: false,
              tool: tool,
              error:
                (rlRes && (rlRes.reason || rlRes.error)) ||
                'Retrait \u00e9tiquette \u00e9chou\u00e9'
            };
          }
          labelOps.push('−' + (rl.name || rl.id));
        }
        for (li = 0; li < addLabelSpecs.length; li++) {
          var al = matchBoardLabel(labelPool, addLabelSpecs[li]);
          if (!al || !al.id) {
            return {
              ok: false,
              tool: tool,
              error: '\u00c9tiquette \u00e0 ajouter introuvable'
            };
          }
          if (typeof bridge.addLabel !== 'function') {
            return {
              ok: false,
              tool: tool,
              error: 'Ajout \u00e9tiquette indisponible'
            };
          }
          var alRes = await Promise.resolve(bridge.addLabel(al.id));
          if (!alRes || alRes.ok === false) {
            return {
              ok: false,
              tool: tool,
              error:
                (alRes && (alRes.reason || alRes.error)) ||
                'Ajout \u00e9tiquette \u00e9chou\u00e9'
            };
          }
          labelOps.push('+' + (al.name || al.id));
        }
        if (createSpec) {
          var createName =
            typeof createSpec.name === 'string'
              ? createSpec.name.trim()
              : typeof createSpec.matchText === 'string'
                ? createSpec.matchText.trim()
                : '';
          if (!createName) {
            return {
              ok: false,
              tool: tool,
              error: 'create.name requis'
            };
          }
          if (typeof bridge.createLabel !== 'function') {
            return {
              ok: false,
              tool: tool,
              error: 'Cr\u00e9ation \u00e9tiquette indisponible'
            };
          }
          var crRes = await Promise.resolve(
            bridge.createLabel({
              name: createName,
              color: createSpec.color
            })
          );
          if (!crRes || crRes.ok === false) {
            return {
              ok: false,
              tool: tool,
              error:
                (crRes && (crRes.reason || crRes.error)) ||
                'Cr\u00e9ation \u00e9tiquette \u00e9chou\u00e9e'
            };
          }
          labelOps.push(
            '+new:' +
              ((crRes.label && crRes.label.name) || createName)
          );
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_labels,
          detail: detailForTool(tool, null, null, null, null, args, {
            ops: labelOps
          })
        };
      }
      if (tool === 'set_custom_assignees') {
        if (typeof bridge.applyPriority !== 'function') {
          return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
        }
        var beforePri = snapshotPriority(bridge);
        var stateForPeople =
          typeof bridge.getPriorityState === 'function'
            ? bridge.getPriorityState() || {}
            : {};
        var people = Array.isArray(stateForPeople.customAssignees)
          ? stateForPeople.customAssignees.slice()
          : [];
        if (
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.normalizeCustomAssignees === 'function'
        ) {
          people = PriorityUI.normalizeCustomAssignees(people);
        }
        if (args.clear === true) {
          people = [];
        }
        var removePeople = [];
        if (Array.isArray(args.remove)) removePeople = args.remove;
        else if (args.remove != null) removePeople = [args.remove];
        for (var rpi = 0; rpi < removePeople.length; rpi++) {
          var hit = matchCustomAssignee(people, removePeople[rpi]);
          if (!hit) {
            return {
              ok: false,
              tool: tool,
              error: 'Personne \u00e0 retirer introuvable'
            };
          }
          people = people.filter(function (p) {
            return !p || String(p.id) !== String(hit.id);
          });
        }
        var addPeople = [];
        if (Array.isArray(args.add)) addPeople = args.add;
        else if (args.add != null) addPeople = [args.add];
        for (var api = 0; api < addPeople.length; api++) {
          var spec = addPeople[api];
          var existing = matchCustomAssignee(people, spec);
          if (existing) continue;
          var created = null;
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.createCustomAssignee === 'function'
          ) {
            created = PriorityUI.createCustomAssignee(spec);
          }
          if (!created || !created.name) {
            return {
              ok: false,
              tool: tool,
              error: 'Nom de personne requis'
            };
          }
          people.push(created);
        }
        if (
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.normalizeCustomAssignees === 'function'
        ) {
          people = PriorityUI.normalizeCustomAssignees(people);
        }
        if (typeof bridge.setCustomAssignees === 'function') {
          var peopleRes = await Promise.resolve(bridge.setCustomAssignees(people));
          if (peopleRes && peopleRes.ok === false) {
            return {
              ok: false,
              tool: tool,
              error:
                (peopleRes.reason || peopleRes.error) ||
                'Personnes assign\u00e9es \u00e9chou\u00e9es'
            };
          }
        } else {
          bridge.applyPriority({ customAssignees: people });
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_custom_assignees,
          detail: detailForTool(
            tool,
            beforePri,
            snapshotPriority(bridge),
            null,
            null,
            args,
            { count: people.length }
          )
        };
      }
      if (tool === 'set_member_roles') {
        if (typeof bridge.applyPriority !== 'function') {
          return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
        }
        var stateRoles =
          typeof bridge.getPriorityState === 'function'
            ? bridge.getPriorityState() || {}
            : {};
        var rolesMap =
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.normalizeMemberRoles === 'function'
            ? PriorityUI.normalizeMemberRoles(stateRoles.memberRoles)
            : stateRoles.memberRoles && typeof stateRoles.memberRoles === 'object'
              ? Object.assign({}, stateRoles.memberRoles)
              : {};
        var boardMembersForRoles = [];
        if (typeof bridge.loadBoardMembers === 'function') {
          boardMembersForRoles = await Promise.resolve(bridge.loadBoardMembers());
        } else if (typeof bridge.getBoardMembers === 'function') {
          boardMembersForRoles = bridge.getBoardMembers() || [];
        }
        var ownershipForRoles =
          typeof bridge.getOwnership === 'function'
            ? bridge.getOwnership() || {}
            : {};
        var poolMembers = (boardMembersForRoles || []).concat(
          ownershipForRoles.members || []
        );
        var customsForRoles = Array.isArray(stateRoles.customAssignees)
          ? stateRoles.customAssignees
          : [];
        var targetMember =
          matchBoardMember(poolMembers, args) ||
          matchCustomAssignee(customsForRoles, args);
        if ((!targetMember || !targetMember.id) && args.memberId) {
          targetMember = { id: String(args.memberId) };
        }
        if (!targetMember || !targetMember.id) {
          return {
            ok: false,
            tool: tool,
            error: 'Assign\u00e9 introuvable pour les r\u00f4les'
          };
        }
        var mid = String(targetMember.id);
        if (args.clear === true) {
          delete rolesMap[mid];
        } else {
          var roleSpecs = Array.isArray(args.roles)
            ? args.roles
            : args.role != null
              ? [args.role]
              : [];
          if (!roleSpecs.length) {
            return {
              ok: false,
              tool: tool,
              error: 'roles requis (ex. subtitles|Montage)'
            };
          }
          var nextRoles = [];
          for (var ri = 0; ri < roleSpecs.length; ri++) {
            var rid = resolveMemberRoleId(roleSpecs[ri]);
            if (!rid) {
              return {
                ok: false,
                tool: tool,
                error: 'R\u00f4le inconnu\u00a0: ' + String(roleSpecs[ri])
              };
            }
            if (nextRoles.indexOf(rid) === -1) nextRoles.push(rid);
          }
          rolesMap[mid] = nextRoles;
        }
        if (
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.normalizeMemberRoles === 'function'
        ) {
          rolesMap = PriorityUI.normalizeMemberRoles(rolesMap);
        }
        if (typeof bridge.setMemberRoles === 'function') {
          var rolesRes = await Promise.resolve(bridge.setMemberRoles(rolesMap));
          if (rolesRes && rolesRes.ok === false) {
            return {
              ok: false,
              tool: tool,
              error:
                (rolesRes.reason || rolesRes.error) ||
                'R\u00f4les \u00e9chou\u00e9s'
            };
          }
        } else {
          bridge.applyPriority({ memberRoles: rolesMap });
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.set_member_roles,
          detail: detailForTool(tool, null, null, null, null, args, {
            memberId: mid,
            roles: rolesMap[mid] || []
          })
        };
      }
      if (tool === 'add_checklist_item') {
        if (
          typeof bridge.applyCompletion !== 'function' ||
          typeof CompletionTrello === 'undefined' ||
          typeof CompletionTrello.addChecklistItem !== 'function'
        ) {
          return {
            ok: false,
            tool: tool,
            error: 'Checklist indisponible'
          };
        }
        var completionCl =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
        var parentCl = resolveChecklistParent(
          (completionCl && completionCl.items) || [],
          args
        );
        if (!parentCl || !parentCl.id) {
          return {
            ok: false,
            tool: tool,
            error: 'Sous-t\u00e2che parente introuvable'
          };
        }
        var childText =
          typeof args.text === 'string'
            ? args.text.trim()
            : typeof args.name === 'string'
              ? args.name.trim()
              : '';
        if (!childText) {
          return { ok: false, tool: tool, error: 'text requis' };
        }
        var beforeCl = snapshotCompletion(bridge);
        var addedCl = CompletionTrello.addChecklistItem(
          completionCl,
          parentCl.id,
          childText,
          {
            done: args.done === true,
            progress: args.progress,
            estimatedMinutes: args.estimatedMinutes
          }
        );
        if (!addedCl || !addedCl.item) {
          return {
            ok: false,
            tool: tool,
            error:
              'Impossible d\'ajouter (parente li\u00e9e ou texte invalide)'
          };
        }
        bridge.applyCompletion(addedCl.data);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.add_checklist_item,
          detail: detailForTool(
            tool,
            null,
            null,
            beforeCl,
            snapshotCompletion(bridge),
            args,
            { parentId: parentCl.id, id: addedCl.item.id }
          )
        };
      }
      if (
        tool === 'remove_checklist_item' ||
        tool === 'rename_checklist_item' ||
        tool === 'set_checklist_progress'
      ) {
        if (
          typeof bridge.applyCompletion !== 'function' ||
          typeof CompletionTrello === 'undefined'
        ) {
          return {
            ok: false,
            tool: tool,
            error: 'Checklist indisponible'
          };
        }
        var completionNest =
          typeof bridge.getCompletion === 'function'
            ? bridge.getCompletion()
            : { items: [] };
        var parentNest = resolveChecklistParent(
          (completionNest && completionNest.items) || [],
          args
        );
        if (!parentNest || !parentNest.id) {
          return {
            ok: false,
            tool: tool,
            error: 'Sous-t\u00e2che parente introuvable'
          };
        }
        var childNest = resolveChecklistChild(parentNest, args);
        if (!childNest || !childNest.id) {
          return {
            ok: false,
            tool: tool,
            error: 'Sous-sous-t\u00e2che introuvable'
          };
        }
        var beforeNest = snapshotCompletion(bridge);
        var nextNest = completionNest;
        if (tool === 'remove_checklist_item') {
          nextNest = CompletionTrello.removeChecklistItem(
            completionNest,
            parentNest.id,
            childNest.id
          );
        } else if (tool === 'rename_checklist_item') {
          var newNestText =
            typeof args.text === 'string'
              ? args.text.trim()
              : typeof args.name === 'string'
                ? args.name.trim()
                : '';
          if (!newNestText) {
            return { ok: false, tool: tool, error: 'Nouveau text requis' };
          }
          nextNest = CompletionTrello.applyChecklistItemText(
            completionNest,
            parentNest.id,
            childNest.id,
            newNestText
          );
        } else {
          var nestProgress = Number(args.progress);
          if (!isFinite(nestProgress)) {
            if (args.done === true) nestProgress = 100;
            else if (args.done === false) nestProgress = 0;
            else {
              return {
                ok: false,
                tool: tool,
                error: 'progress 0-100 requis'
              };
            }
          }
          nextNest = CompletionTrello.applyChecklistItemProgress(
            completionNest,
            parentNest.id,
            childNest.id,
            nestProgress
          );
        }
        bridge.applyCompletion(nextNest);
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS[tool],
          detail: detailForTool(
            tool,
            null,
            null,
            beforeNest,
            snapshotCompletion(bridge),
            args,
            { parentId: parentNest.id, id: childNest.id }
          )
        };
      }
      if (
        tool === 'history_undo' ||
        tool === 'history_redo' ||
        tool === 'history_revert'
      ) {
        if (tool === 'history_undo') {
          if (typeof bridge.historyUndo !== 'function') {
            return { ok: false, tool: tool, error: 'Historique indisponible' };
          }
          var undoRes = await Promise.resolve(bridge.historyUndo());
          if (!undoRes) {
            return { ok: false, tool: tool, error: 'Rien \u00e0 annuler' };
          }
          return {
            ok: true,
            tool: tool,
            args: args,
            summary: TOOL_LABELS.history_undo
          };
        }
        if (tool === 'history_redo') {
          if (typeof bridge.historyRedo !== 'function') {
            return { ok: false, tool: tool, error: 'Historique indisponible' };
          }
          var redoRes = await Promise.resolve(bridge.historyRedo());
          if (!redoRes) {
            return { ok: false, tool: tool, error: 'Rien \u00e0 r\u00e9tablir' };
          }
          return {
            ok: true,
            tool: tool,
            args: args,
            summary: TOOL_LABELS.history_redo
          };
        }
        if (typeof bridge.historyRevert !== 'function') {
          return { ok: false, tool: tool, error: 'Historique indisponible' };
        }
        var entryId =
          typeof args.entryId === 'string'
            ? args.entryId.trim()
            : typeof args.id === 'string'
              ? args.id.trim()
              : '';
        if (!entryId && typeof bridge.getHistory === 'function') {
          var hist = bridge.getHistory() || {};
          var entries = Array.isArray(hist.entries) ? hist.entries : [];
          var matchLabel =
            typeof args.matchLabel === 'string'
              ? args.matchLabel.trim()
              : typeof args.label === 'string'
                ? args.label.trim()
                : '';
          if (matchLabel) {
            var needle = normalizeMatchKey(matchLabel);
            for (var hi = 0; hi < entries.length; hi++) {
              if (
                entries[hi] &&
                !entries[hi].undone &&
                normalizeMatchKey(entries[hi].label || '').indexOf(needle) >= 0
              ) {
                entryId = entries[hi].id;
                break;
              }
            }
          } else if (args.steps != null) {
            var steps = Math.max(1, Math.round(Number(args.steps)) || 1);
            var active = entries.filter(function (e) {
              return e && !e.undone;
            });
            var target = active[Math.min(steps, active.length) - 1];
            if (target) entryId = target.id;
          }
        }
        if (!entryId) {
          return {
            ok: false,
            tool: tool,
            error: 'entryId ou matchLabel requis'
          };
        }
        var revertRes = await Promise.resolve(bridge.historyRevert(entryId));
        if (!revertRes) {
          return {
            ok: false,
            tool: tool,
            error: 'Entr\u00e9e d\'historique introuvable'
          };
        }
        return {
          ok: true,
          tool: tool,
          args: args,
          summary: TOOL_LABELS.history_revert,
          detail: detailForTool(tool, null, null, null, null, args, {
            entryId: entryId
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

  /**
   * Attach a structured `visual` payload for chat result cards when missing.
   * Uses post-action bridge snapshots so the synthesizer stays dumb.
   */
  function enrichResultVisual(bridge, result) {
    if (!result || !result.ok || result.visual) return result;
    var tool = result.tool;
    var args = result.args || {};
    try {
      if (tool === 'set_priority') {
        var pri = snapshotPriority(bridge);
        var tierLabel = '';
        if (
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.baselineScore === 'function' &&
          typeof PriorityUI.tierFor === 'function' &&
          pri.priorityEnabled !== false
        ) {
          var score = PriorityUI.baselineScore(pri.urgency, pri.impact, pri.ease);
          var tier = PriorityUI.tierFor(score);
          if (tier && tier.label) tierLabel = tier.label;
        }
        if (!tierLabel && args.tier) tierLabel = String(args.tier);
        var visual = {
          type: 'priority',
          tier: tierLabel || 'Priorit\u00e9',
          urgency: pri.urgency,
          impact: pri.impact,
          ease: pri.ease,
          priorityEnabled: pri.priorityEnabled !== false
        };
        var diffRows = [];
        if (result.detail && typeof result.detail === 'string') {
          // Optional axis diff from before→after words if PriorityUI available
        }
        result.visual = visual;
        return result;
      }
      if (
        tool === 'add_subtask' ||
        tool === 'rename_subtask' ||
        tool === 'toggle_subtask' ||
        tool === 'set_subtask_blocked' ||
        tool === 'set_subtask_progress' ||
        tool === 'set_subtask_estimate' ||
        tool === 'remove_subtask'
      ) {
        var comp = snapshotCompletion(bridge);
        var item = null;
        var id = result.id || args.id;
        if (id && comp.items) {
          for (var i = 0; i < comp.items.length; i++) {
            if (String(comp.items[i].id) === String(id)) {
              item = comp.items[i];
              break;
            }
          }
        }
        if (!item && args.matchText && comp.items) {
          var needle = normalizeSubtaskTitleKey(args.matchText);
          for (var j = 0; j < comp.items.length; j++) {
            if (normalizeSubtaskTitleKey(comp.items[j].text) === needle) {
              item = comp.items[j];
              break;
            }
          }
        }
        if (tool === 'remove_subtask') {
          result.visual = {
            type: 'subtask',
            text:
              (item && item.text) ||
              (typeof args.matchText === 'string' ? args.matchText : '') ||
              'Sous-t\u00e2che',
            removed: true,
            id: id != null ? String(id) : undefined
          };
          return result;
        }
        var text =
          (item && item.text) ||
          (typeof args.text === 'string' ? args.text.trim() : '') ||
          (typeof args.matchText === 'string' ? args.matchText.trim() : '') ||
          'Sous-t\u00e2che';
        result.visual = {
          type: 'subtask',
          text: text,
          id: (item && item.id) || (id != null ? String(id) : undefined),
          done: item ? !!item.done : !!args.done,
          blocked: item ? !!item.blocked : !!args.blocked,
          progress: item && item.progress != null ? item.progress : undefined,
          estimatedMinutes:
            item && item.estimatedMinutes != null
              ? item.estimatedMinutes
              : resolveEstimateMinutesArg(args)
        };
        return result;
      }
      if (tool === 'set_due') {
        var dueSnap = snapshotPriority(bridge);
        if (!dueSnap.dueEnabled && !dueSnap.dueVague) {
          result.visual = { type: 'due', cleared: true };
        } else if (dueSnap.dueVague) {
          result.visual = {
            type: 'due',
            dueVague: dueSnap.dueVague,
            dueMode: 'vague'
          };
        } else {
          result.visual = {
            type: 'due',
            dueDate: dueSnap.dueDate || '',
            dueTime: dueSnap.dueTime || '',
            dueMode: 'precise',
            recurrence: dueSnap.recurrence || undefined,
            startDate: dueSnap.startDate || undefined
          };
        }
        return result;
      }
      if (tool === 'set_statut') {
        result.visual = {
          type: 'statut',
          listName:
            (args && (args.listName || args.matchList)) ||
            '',
          listId: args.listId || undefined,
          category: args.category || undefined
        };
        if (result.detail && typeof result.detail === 'string') {
          var listMatch = result.detail.match(/list\s*[:=→>]\s*([^;]+)/i);
          if (listMatch) result.visual.listName = listMatch[1].trim();
          var idMatch = result.detail.match(/\bid\s*[:=]\s*([^;]+)/i);
          if (idMatch) result.visual.listId = idMatch[1].trim();
        }
        if (!result.visual.listName && args.matchList) {
          result.visual.listName = String(args.matchList);
        }
        return result;
      }
      if (tool === 'set_project') {
        if (args.clear === true) {
          result.visual = { type: 'project', cleared: true };
        } else {
          result.visual = {
            type: 'project',
            name: args.name || args.matchText || '',
            projectId: args.projectId || undefined
          };
          if (result.detail && typeof result.detail === 'string') {
            var pn = result.detail.match(/projet\s*[:=→>]\s*([^;]+)/i);
            if (pn) result.visual.name = pn[1].trim();
          }
        }
        return result;
      }
      if (
        tool === 'set_progress' ||
        tool === 'set_progress_estimate' ||
        tool === 'complete_all_subtasks' ||
        tool === 'reset_progress'
      ) {
        var prog = snapshotCompletion(bridge);
        var doneCount = 0;
        (prog.items || []).forEach(function (it) {
          if (it.done) doneCount += 1;
        });
        result.visual = {
          type: 'progress',
          progress: prog.progress,
          progressEnabled: prog.progressEnabled !== false,
          estimatedMinutes: prog.estimatedMinutes,
          doneCount: doneCount,
          totalCount: (prog.items || []).length
        };
        return result;
      }
      if (tool === 'set_members' || tool === 'set_custom_assignees') {
        var people = [];
        if (result.detail && typeof result.detail === 'string') {
          result.detail.split(/[;,]/).forEach(function (part) {
            var t = part.trim();
            if (!t) return;
            if (t.charAt(0) === '+' || t.charAt(0) === '−' || t.charAt(0) === '-') {
              people.push({
                name: t.slice(1).trim(),
                op: t.charAt(0) === '+' ? 'add' : 'remove'
              });
            }
          });
        }
        if (!people.length && Array.isArray(args.add)) {
          args.add.forEach(function (a) {
            var n =
              typeof a === 'string'
                ? a
                : a && (a.fullName || a.name || a.username);
            if (n) people.push({ name: String(n), op: 'add' });
          });
        }
        if (people.length) {
          result.visual = { type: 'members', people: people };
        }
        return result;
      }
      if (tool === 'set_labels') {
        var labels = [];
        if (result.detail && typeof result.detail === 'string') {
          result.detail.split(/[;,]/).forEach(function (part) {
            var t = part.trim();
            if (!t) return;
            if (t.charAt(0) === '+' || t.charAt(0) === '−' || t.charAt(0) === '-') {
              labels.push({
                name: t.slice(1).trim(),
                op: t.charAt(0) === '+' ? 'add' : 'remove'
              });
            }
          });
        }
        if (labels.length) {
          result.visual = { type: 'labels', labels: labels };
        }
        return result;
      }
    } catch (err) {
      console.error('enrichResultVisual failed', err);
    }
    return result;
  }

  async function executeActions(bridge, actions) {
    var list = Array.isArray(actions) ? actions : [];
    var results = [];
    var summaries = [];
    var errors = [];
    var executed = 0;
    var rejected = 0;
    for (var i = 0; i < list.length; i++) {
      var result = await executeAction(bridge, list[i]);
      result = enrichResultVisual(bridge, result);
      results.push(result);
      if (result.ok) {
        executed += 1;
        if (result.summary) summaries.push(result.summary);
      } else {
        rejected += 1;
        if (result.error) errors.push(result.error);
      }
    }
    dbgLog('agent', 'actions.execute', {
      total: list.length,
      executed: executed,
      rejected: rejected
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
    resolveDueVagueArg: resolveDueVagueArg,
    matchBoardMember: matchBoardMember,
    matchBoardLabel: matchBoardLabel,
    matchCustomAssignee: matchCustomAssignee,
    resolveMemberRoleId: resolveMemberRoleId,
    rewriteActionsForRelativeDue: rewriteActionsForRelativeDue,
    detectPriorityTierInText: detectPriorityTierInText,
    rewriteActionsForPriorityTier: rewriteActionsForPriorityTier,
    detectAgentColorInText: detectAgentColorInText,
    looksLikeAgentColorChangeRequest: looksLikeAgentColorChangeRequest,
    looksLikeAgentColorChangeClaim: looksLikeAgentColorChangeClaim,
    rewriteActionsForAgentColor: rewriteActionsForAgentColor,
    normalizePrompts: normalizePrompts,
    normalizeBlocks: normalizeBlocks,
    enrichResultVisual: enrichResultVisual,
    normalizeCardPatches: normalizeCardPatches,
    chatTurn: chatTurn,
    looksLikeSubtaskPickQuestion: looksLikeSubtaskPickQuestion,
    enrichSubtaskPickTurn: enrichSubtaskPickTurn,
    listProgressSubtaskLabels: listProgressSubtaskLabels,
    actionsReachFullProgress: actionsReachFullProgress,
    looksLikeDueAskMessage: looksLikeDueAskMessage,
    contextHasActiveDue: contextHasActiveDue,
    summarizeInterviewAlreadyKnown: summarizeInterviewAlreadyKnown,
    urgencyAskForTaskTypes: urgencyAskForTaskTypes,
    normalizeAgentTaskTypes: normalizeAgentTaskTypes,
    buildInterviewNextPivot: buildInterviewNextPivot,
    applyKnownDueGuards: applyKnownDueGuards,
    looksLikeMotivationWhyAsk: looksLikeMotivationWhyAsk,
    isUniversalMotiveText: isUniversalMotiveText,
    interviewMotivationWhyAlreadyAsked: interviewMotivationWhyAlreadyAsked,
    applyInterviewWhyGuards: applyInterviewWhyGuards,
    polishMessageAfterProgressComplete: polishMessageAfterProgressComplete,
    ensureProgressCelebration: ensureProgressCelebration,
    applyProgressCompleteGuards: applyProgressCompleteGuards,
    rewriteWinkEmoticons: rewriteWinkEmoticons,
    ensureContrastHighlights: ensureContrastHighlights,
    linkSuggestionColorsToHighlights: linkSuggestionColorsToHighlights,
    normalizeSuggestionEntries: normalizeSuggestionEntries,
    extractHighlightSpans: extractHighlightSpans,
    memoryTurn: memoryTurn,
    cardInterviewTurn: cardInterviewTurn,
    loadCardInterview: loadCardInterview,
    saveCardInterview: saveCardInterview,
    normalizeCardInterview: normalizeCardInterview,
    emptyCardInterview: emptyCardInterview,
    markInterviewQuestionAsked: markInterviewQuestionAsked,
    markInterviewComplete: markInterviewComplete,
    interviewProgressScoutKind: interviewProgressScoutKind,
    summarizeInterviewProgressScout: summarizeInterviewProgressScout,
    applyInterviewProgressScoutGuards: applyInterviewProgressScoutGuards,
    loadCardChat: loadCardChat,
    saveCardChat: saveCardChat,
    loadBoardChat: loadBoardChat,
    saveBoardChat: saveBoardChat,
    ASSISTANT_SCOPES: ASSISTANT_SCOPES,
    normalizeAssistantScope: normalizeAssistantScope,
    isProjectScope: isProjectScope,
    normalizeCardChat: normalizeCardChat,
    emptyCardChat: emptyCardChat,
    suggestQuestions: suggestQuestions,
    suggestCardImprovements: suggestCardImprovements,
    filterNoOpImprovementSuggestions: filterNoOpImprovementSuggestions,
    filterImprovementsAgainstRecentChanges: filterImprovementsAgainstRecentChanges,
    listCardImprovementGaps: listCardImprovementGaps,
    listRecentCardChanges: listRecentCardChanges,
    isNoOpImprovementAction: isNoOpImprovementAction,
    addDaysIsoLocal: addDaysIsoLocal,
    cardSanityCheck: cardSanityCheck,
    cardDreamTurn: cardDreamTurn,
    buildStatusBriefSnapshot: buildStatusBriefSnapshot,
    fingerprintStatusBriefSnapshot: fingerprintStatusBriefSnapshot,
    buildHeuristicStatusBrief: buildHeuristicStatusBrief,
    isVacuousStatusBrief: isVacuousStatusBrief,
    cardStatusBriefTurn: cardStatusBriefTurn,
    buildProgressSummarySnapshot: buildProgressSummarySnapshot,
    fingerprintProgressSummarySnapshot: fingerprintProgressSummarySnapshot,
    buildHeuristicProgressSummary: buildHeuristicProgressSummary,
    cardProgressSummaryTurn: cardProgressSummaryTurn,
    isVerboseStructuredDesc: isVerboseStructuredDesc,
    suggestSubtasks: suggestSubtasks,
    titleMayBeCompound: titleMayBeCompound,
    normalizeSplitTaskResult: normalizeSplitTaskResult,
    splitTaskTitle: splitTaskTitle,
    normalizeSplitBlockedReasonResult: normalizeSplitBlockedReasonResult,
    splitBlockedReason: splitBlockedReason,
    estimateSubtaskDurations: estimateSubtaskDurations,
    fallbackBlockedReasonText: fallbackBlockedReasonText,
    suggestBlockedReasonText: suggestBlockedReasonText,
    isPureWaitingOnTaskReason: isPureWaitingOnTaskReason,
    fallbackBlockedReasonPair: fallbackBlockedReasonPair,
    suggestBlockedReasonPair: suggestBlockedReasonPair,
    fallbackUnblockSubtaskText: fallbackUnblockSubtaskText,
    suggestUnblockSubtaskText: suggestUnblockSubtaskText,
    heuristicSubtaskEstimates: heuristicSubtaskEstimates,
    parseDurationMinutes: parseDurationMinutes,
    suggestGoals: suggestGoals,
    suggestLabels: suggestLabels,
    suggestTaskTypes: suggestTaskTypes,
    suggestMetrics: suggestMetrics,
    parseMetric: parseMetric,
    executeAction: executeAction,
    executeActions: executeActions,
    normalizeSubtaskTitleKey: normalizeSubtaskTitleKey,
    findExistingSubtaskByText: findExistingSubtaskByText,
    formatChangeRecap: formatChangeRecap,
    looksLikeAppliedClaim: looksLikeAppliedClaim,
    normalizePointSection: normalizePointSection,
    normalizePointField: normalizePointField,
    normalizePointLevel: normalizePointLevel,
    runProviderTests: runProviderTests,
    chatCompletions: chatCompletions,
    extractStreamingMessage: extractStreamingMessage,
    estimateCostUsd: estimateCostUsd,
    extractUsageFromRaw: extractUsageFromRaw,
    contextWindowForModel: contextWindowForModel
  };
})(typeof window !== 'undefined' ? window : this);
