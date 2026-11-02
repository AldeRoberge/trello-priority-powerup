/**
 * Priority UI + scoring for the Cerveau / Priorité Power-Up.
 * Loaded via <script> — exposes window.PriorityUI (no module bundler).
 *
 * Role: pure UI + math for the card popup editor (popup.html). Does NOT talk
 * to Trello — that is PriorityTrello. Agent / completion / gantt call into
 * this module for scoring, labels, markdown, due pickers, and section fields.
 *
 * Table of contents (approximate line ranges)
 * ───────────────────────────────────────────
 *  1.   Formula weights & constants; section-collapse keys
 *  1b.  Task-type catalog (built-in + board custom)
 *  1c.  Member-role catalog (built-in + board custom + card-local)
 *  1d.  Custom assignees (“Hors Trello” people directory)
 *  2.   Labels, keywords, tiers & heat presets
 *  3.   Icon registry (axis levels, task types, due chrome)
 *  3b.  Markdown / smart-card / link-unfurl rendering
 *  3c.  Color schemes (OKLab ramps → Classique / Feu badges)
 *  3d.  Due-date helpers (ISO, vague phrases, countdown copy)
 *  4.   Matrix label bridge (PriorityMatrix)
 *  5.   Math helpers & tier styling
 *  6.   Scoring formulas (baseline, Eisenhower, WSJF, value/effort)
 *  7.   Formatters & heat-preset override solvers
 *  8.   Help modal + criteria wizard
 *  9.   Form controls:
 *         createField (urgency/impact/ease), statut, overview, info,
 *         en-attente / blocked motifs, due date, heat panel, calc graph
 * 10.   Variant mount & slider persistence (sandbox + popup shells)
 * 10b.  Mini editors (Gantt popovers: priority / due / blocked)
 * 11.   PriorityUI public API (exported on global)
 */

/**
 * priority-ui: part 1 of 12 (playPriorityUiSound).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */

/**
 * priority-ui-catalogs: part 1 of 2 (playPriorityUiSound).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui-catalogs.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

var S = (global.PriorityUIParts = global.PriorityUIParts || {});

function playPriorityUiSound(name, opts) {
    try {
      if (
        global.CelebrationEffects &&
        typeof global.CelebrationEffects.playUiSound === 'function'
      ) {
        return global.CelebrationEffects.playUiSound(name, opts || {});
      }
    } catch (e) {
      /* ignore audio failures */
    }
    return { ok: false };
  }

  // ── 1. Formula weights & constants ─────────────────────────────────────

  // Legacy Eisenhower / WSJF helpers (still used by alternate formulas).
  var WT = 1.2;
  var WB = 0.8;
  var WI = 0.95;
  var WI_EASE = 1.15;
  var GAMMA_EASE = 0.6;
  var EASE_SCALE = 1.0;
  var IMPACT_EXP = 0.85;
  var DAMPEN_MAX = 0.55;
  var DAMPEN_POWER = 1.5;
  var DAMPEN_EASE_ATTENUATION = 0.85;
  var EASE_MUL_DAMPEN_THRESHOLD = 0.5;
  var EASE_MUL_LO = 0.75;
  var EASE_MUL_HI = 1.25;
  var HARD_PENALTY_FLOOR = 0.88;
  var EASE_FLOOR = 2.5;
  var EASE_BASE = 0.25;
  var URGENCY_BOOST_MAX = 2.2;
  var URGENCY_BOOST_MIN_U = 4;
  var PRESSURE_MAX = 6;
  var WSJF_SCALE = 10 / 6;
  var VALUE_EFFORT_SCALE = 2.5;
  var EISENHOWER_URGENCY_THRESHOLD = 2;
  var EISENHOWER_IMPACT_THRESHOLD = 5; // Impact axis is 0–10 after adaptation
  var FORMULA_STORAGE_KEY = 'trello-priority-powerup/formula';
  var COLOR_SCHEME_STORAGE_KEY = 'trello-priority-powerup/color-scheme';
  var SECTION_COLLAPSE_STORAGE_KEY = 'trello-priority-powerup/section-collapse';
  var STATUT_EMBEDDED_DETAILS_STORAGE_KEY =
    'trello-priority-powerup/statut-embedded-details-expanded';
  // 'blocked' / 'statut' kept for legacy prefs; both nest under Progrès (not collapsible).
  var SECTION_COLLAPSE_KEYS = [
    'overview',
    'info',
    'moreDetails',
    'statut',
    'objectif',
    'priority',
    'graph',
    'progress',
    'due',
    'blocked',
    'chat',
    'historique'
  ];
  var DEFAULT_COLOR_SCHEME_KEY = 'blue';
  /** Member clock preference: '24' (default) or '12'. Canonical storage stays HH:MM. */
  S.preferredTimeFormat = '24';
  var SCORE_MAX = 10;

  // ── 1a. Priority adaptation (Impact + Facilité + Échéance + Empressement) ─
  // score = clamp(base + datePull + empressePull, 0, 10)
  // base  = Impact*BASE_IMPACT_WEIGHT + Facilité*BASE_EASE_WEIGHT  (each 0–10)

  var AXIS_SCORE_MAX = 10;
  var BASE_IMPACT_WEIGHT = 0.6;
  var BASE_EASE_WEIGHT = 0.4;
  /** true = easier tasks score higher (quick wins float). Flip to surface hard work. */
  var EASE_QUICK_WINS = true;
  var DATE_PROXIMITY_TAU_DAYS = 5;
  var DATE_GAIN_MOVABLE = 1.2;
  var DATE_GAIN_FIXED = 3.5;
  var EMPRESSEMENT_PULL_MAX = 3.0;
  var IMPACT_SYNERGY_PER_EXTRA = 0.12;
  /**
   * Migration mode for old Urgence → Empressement:
   * 'part_b' = auto-map all tasks (compress downward) + review nudge when ≥8
   * 'part_a_only' = start at Aucun for all; nudge every migrated task once
   */
  var URGENCY_MIGRATION_MODE = 'part_b';
  var URGENCY_REVIEW_THRESHOLD_10 = 8;

  var EMPRESSEMENT_OPTIONS = [
    { id: 'aucun', label: 'Aucun', index: 0 },
    { id: 'bientot', label: 'Bient\u00f4t', index: 1 },
    { id: 'assez-vite', label: 'Assez vite', index: 2 },
    { id: 'vite', label: 'Vite', index: 3 },
    { id: 'au-plus-vite', label: 'Au plus vite', index: 4 }
  ];
  var EMPRESSEMENT_DEFAULT_ID = 'aucun';

  /** Impact sub-factors ("Nous permet de…"). Weights are org knobs. */
  var IMPACT_FACTOR_DEFS = [
    { id: 'vitesse', label: 'Gagner en vitesse', weight: 1.0 },
    { id: 'probleme', label: 'R\u00e9soudre un probl\u00e8me', weight: 1.3 },
    { id: 'qualite', label: 'Am\u00e9liorer la qualit\u00e9 future', weight: 1.0 },
    { id: 'reach', label: 'Toucher beaucoup de gens', weight: 1.15 },
    { id: 'contenu', label: 'Produire du contenu', weight: 1.0 }
  ];

  /** Facilité cost factors ("Ce que ça coûte…"). Named scales map to ease contrib 0–10. */
  var EASE_COST_TIME_STEPS = [
    { id: 'une-heure', label: 'Une heure', ease: 10 },
    { id: 'plusieurs-heures', label: 'Plusieurs heures', ease: 8.5 },
    { id: 'une-journee', label: 'Une journ\u00e9e', ease: 7 },
    { id: 'plusieurs-jours', label: 'Plusieurs jours', ease: 5.5 },
    { id: 'une-semaine', label: 'Une semaine', ease: 4 },
    { id: 'plusieurs-semaines', label: 'Plusieurs semaines', ease: 2.5 },
    { id: 'un-mois', label: 'Un mois', ease: 1.5 },
    { id: 'plusieurs-mois', label: 'Plusieurs mois', ease: 0 }
  ];
  var EASE_COST_PEOPLE_STEPS = [
    { id: 'juste-moi', label: 'Juste moi', ease: 10 },
    { id: 'moi-et-une', label: 'Moi et une autre personne', ease: 7.5 },
    { id: 'plusieurs', label: 'Plusieurs personnes', ease: 5 },
    { id: 'equipe', label: 'Toute l\'\u00e9quipe', ease: 2.5 },
    { id: 'organisation', label: 'Toute l\'organisation', ease: 0 }
  ];
  var EASE_COST_DEFS = [
    {
      id: 'temps',
      label: 'Prend beaucoup de temps',
      kind: 'named',
      steps: EASE_COST_TIME_STEPS,
      defaultStepId: 'plusieurs-jours'
    },
    {
      id: 'gens',
      label: 'Demande beaucoup de gens',
      kind: 'named',
      steps: EASE_COST_PEOPLE_STEPS,
      defaultStepId: 'moi-et-une'
    },
    { id: 'argent', label: 'Co\u00fbte beaucoup d\'argent', kind: 'intensity', defaultIntensity: 5 },
    { id: 'mental', label: 'Grande charge mentale', kind: 'intensity', defaultIntensity: 5 }
  ];

  var DUE_LIMIT_STATE_NONE = 'none';
  var DUE_LIMIT_STATE_HAS = 'has';
  var DUE_DATE_FIXE_COPY =
    'Impos\u00e9e de l\'ext\u00e9rieur, ne bouge pas.';
  var URGENCY_REVIEW_PROMPT =
    'Cette t\u00e2che \u00e9tait marqu\u00e9e tr\u00e8s urgente \u2014 confirmer son Empressement et son \u00c9ch\u00e9ance\u00a0?';

  // ── 1b. Task-type catalog (built-in + board custom) ─────────────────────
  // Multi-label taxonomy for Information + AI interview. Picker order = array
  // order; card selection order is preserved separately on save.

  /** Built-in task-type catalog (Information → Type de tâche). */
  var BUILTIN_TASK_TYPES = [
    { id: 'action', label: 'Action', hint: 'Action concr\u00e8te unique', icon: 'action' },
    { id: 'project', label: 'Projet', hint: 'Partie d\u2019un effort multi-\u00e9tapes', icon: 'project' },
    { id: 'recurring', label: 'R\u00e9currente', hint: 'T\u00e2che r\u00e9p\u00e9titive / r\u00e9currente', icon: 'recurring' },
    { id: 'exploratory', label: 'Exploration', hint: 'D\u00e9couverte / recherche', icon: 'exploratory' },
    { id: 'emotional', label: '\u00c9motionnel', hint: '\u00c9motionnel / psychologique', icon: 'emotional' },
    { id: 'communication', label: 'Communication', hint: 'Communication / relationnel', icon: 'communication' },
    { id: 'deliverable', label: 'Livrable', hint: 'Livrable / produit', icon: 'deliverable' },
    { id: 'process', label: 'Processus', hint: 'Processus / maintenance', icon: 'process' },
    { id: 'thinking', label: 'R\u00e9flexion', hint: 'R\u00e9flexion / d\u00e9cisions', icon: 'thinking' },
    { id: 'material', label: 'Mat\u00e9riel', hint: 'Achat / \u00e9quipement / fournitures', icon: 'material' },
    { id: 'learning', label: 'Apprentissage', hint: 'Formation / \u00e9tude / comp\u00e9tences', icon: 'learning' },
    { id: 'admin', label: 'Administratif', hint: 'Paperasse / formalit\u00e9s / admin', icon: 'admin' },
    { id: 'creative', label: 'Cr\u00e9atif', hint: 'Cr\u00e9ation / design / contenu', icon: 'creative' },
    { id: 'finance', label: 'Financier', hint: 'Budget / paiement / argent', icon: 'finance' }
  ];
  /** Alias kept for callers that read PriorityUI.TASK_TYPES (built-ins only). */
  var TASK_TYPES = BUILTIN_TASK_TYPES;

  var CUSTOM_TASK_TYPE_ID_RE = /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var MAX_CUSTOM_TASK_TYPES = 40;
  var MAX_TASK_TYPE_LABEL_LEN = 40;
  var MAX_TASK_TYPE_HINT_LEN = 80;

  /** Board-level custom types (mutable; set via setCustomTaskTypes). */
  var customTaskTypes = [];
  S.TASK_TYPE_BY_ID = Object.create(null);

  function rebuildTaskTypeIndex() {
    var map = Object.create(null);
    var i;
    for (i = 0; i < BUILTIN_TASK_TYPES.length; i++) {
      map[BUILTIN_TASK_TYPES[i].id] = BUILTIN_TASK_TYPES[i];
    }
    for (i = 0; i < customTaskTypes.length; i++) {
      map[customTaskTypes[i].id] = customTaskTypes[i];
    }
    S.TASK_TYPE_BY_ID = map;
  }
  rebuildTaskTypeIndex();

  function isCustomTaskTypeId(id) {
    return typeof id === 'string' && CUSTOM_TASK_TYPE_ID_RE.test(id);
  }

  function isBuiltinTaskTypeId(id) {
    if (typeof id !== 'string' || !id) return false;
    for (var i = 0; i < BUILTIN_TASK_TYPES.length; i++) {
      if (BUILTIN_TASK_TYPES[i].id === id) return true;
    }
    return false;
  }

  function isValidTaskTypeId(id) {
    if (typeof id !== 'string' || !id) return false;
    if (S.TASK_TYPE_BY_ID[id]) return true;
    // Keep orphan custom ids resolvable until the board catalog loads.
    return isCustomTaskTypeId(id);
  }

  function getTaskTypeEntry(id) {
    if (typeof id !== 'string' || !id) return null;
    if (S.TASK_TYPE_BY_ID[id]) return S.TASK_TYPE_BY_ID[id];
    if (isCustomTaskTypeId(id)) {
      return { id: id, label: id, hint: '', icon: 'tag', custom: true };
    }
    return null;
  }

  function taskTypeLabel(id) {
    var entry = getTaskTypeEntry(id);
    return entry ? entry.label : '';
  }

  function taskTypeHint(id) {
    var entry = getTaskTypeEntry(id);
    return entry ? entry.hint || '' : '';
  }

  function taskTypeIconKey(id) {
    var entry = getTaskTypeEntry(id);
    if (!entry) return 'custom';
    return entry.icon || entry.id || 'custom';
  }

  /** Full catalog: built-ins then board customs. */
  function getTaskTypeCatalog() {
    return BUILTIN_TASK_TYPES.concat(customTaskTypes);
  }

  function getCustomTaskTypes() {
    return customTaskTypes.slice();
  }

  function slugifyTaskTypeLabel(label) {
    return String(label || '')
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'type';
  }

  function makeCustomTaskTypeId(label) {
    var slug = slugifyTaskTypeLabel(label);
    var suffix = Math.random().toString(36).slice(2, 6);
    return 'custom-' + slug + '-' + suffix;
  }

  /**
   * Tabler icon names available for custom task types (ti ti-*).
   * Built-in types keep stroke SVG keys in TASK_TYPE_ICON_SVG.
   */
  var TASK_TYPE_TABLER_ICONS = [
    'tag',
    'box',
    'package',
    'tools',
    'wrench',
    'hammer',
    'shopping-cart',
    'cash',
    'coin',
    'receipt',
    'credit-card',
    'book',
    'school',
    'certificate',
    'bulb',
    'brain',
    'heart',
    'mood-smile',
    'message',
    'mail',
    'phone',
    'users',
    'user',
    'flag',
    'star',
    'bookmark',
    'target',
    'rocket',
    'plane',
    'car',
    'bike',
    'home',
    'building',
    'map-pin',
    'world',
    'calendar',
    'clock',
    'alarm',
    'checklist',
    'list-check',
    'subtask',
    'code',
    'bug',
    'database',
    'cloud',
    'device-desktop',
    'device-mobile',
    'palette',
    'photo',
    'music',
    'video',
    'microphone',
    'speakerphone',
    'leaf',
    'flame',
    'droplet',
    'sun',
    'moon',
    'snowflake',
    'lock',
    'key',
    'shield',
    'alert-triangle',
    'info-circle',
    'help',
    'gift',
    'trophy',
    'medal',
    'run',
    'dumbbell',
    'first-aid-kit',
    'activity',
    'scissors',
    'printer',
    'folder',
    'file',
    'notes',
    'pencil',
    'paint',
    'brush',
    'camera',
    'eye',
    'search',
    'filter',
    'settings',
    'adjustments',
    'plug',
    'battery',
    'wifi',
    'antenna',
    'cpu',
    'server',
    'briefcase',
    'building-store',
    'truck',
    'ship',
    'anchor',
    'mountain',
    'trees',
    'paw',
    'coffee',
    'pizza',
    'bottle',
    'glass'
  ];

  /** @deprecated use TASK_TYPE_TABLER_ICONS — kept for callers reading the old export. */
  var CUSTOM_TASK_TYPE_ICON_KEYS = TASK_TYPE_TABLER_ICONS;

  function isTaskTypeSvgIconKey(key) {
    return !!(
      key &&
      typeof S.TASK_TYPE_ICON_SVG !== 'undefined' &&
      S.TASK_TYPE_ICON_SVG &&
      S.TASK_TYPE_ICON_SVG[key]
    );
  }

  function isTaskTypeTablerIconKey(key) {
    if (typeof key !== 'string' || !key) return false;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) return false;
    if (isTaskTypeSvgIconKey(key)) return false;
    return TASK_TYPE_TABLER_ICONS.indexOf(key) >= 0;
  }

  function normalizeTaskTypeIconKey(raw, fallback) {
    var key = typeof raw === 'string' ? raw.trim() : '';
    if (key.indexOf('ti-') === 0) key = key.slice(3);
    if (isTaskTypeSvgIconKey(key) || isTaskTypeTablerIconKey(key)) return key;
    if (key && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) && key.length <= 40) {
      // Keep persisted Tabler names if the curated list later shrinks.
      return key;
    }
    if (fallback && (isTaskTypeSvgIconKey(fallback) || isTaskTypeTablerIconKey(fallback))) {
      return fallback;
    }
    return randomTaskTypeIconKey();
  }

  function randomTaskTypeIconKey() {
    var list = TASK_TYPE_TABLER_ICONS;
    if (!list.length) return 'tag';
    return list[Math.floor(Math.random() * list.length)];
  }

  function getTaskTypeIconKeys() {
    return TASK_TYPE_TABLER_ICONS.slice();
  }

  function normalizeCustomTaskTypeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var label =
      typeof raw.label === 'string'
        ? raw.label.trim()
        : typeof raw.name === 'string'
          ? raw.name.trim()
          : '';
    if (!label) return null;
    if (label.length > MAX_TASK_TYPE_LABEL_LEN) {
      label = label.slice(0, MAX_TASK_TYPE_LABEL_LEN);
    }
    var id =
      typeof raw.id === 'string' && isCustomTaskTypeId(raw.id.trim())
        ? raw.id.trim()
        : makeCustomTaskTypeId(label);
    var hint =
      typeof raw.hint === 'string'
        ? raw.hint.trim().slice(0, MAX_TASK_TYPE_HINT_LEN)
        : '';
    var icon = normalizeTaskTypeIconKey(raw.icon, 'tag');
    return { id: id, label: label, hint: hint, icon: icon, custom: true };
  }

  function normalizeCustomTaskTypes(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var seen = Object.create(null);
    var seenLabel = Object.create(null);
    for (var i = 0; i < list.length && out.length < MAX_CUSTOM_TASK_TYPES; i++) {
      var entry = normalizeCustomTaskTypeEntry(list[i]);
      if (!entry || seen[entry.id]) continue;
      var labelKey = entry.label.toLocaleLowerCase('fr-FR');
      if (seenLabel[labelKey] || isBuiltinTaskTypeId(entry.id)) continue;
      // Avoid duplicating a built-in label (case-insensitive).
      var dupBuiltin = false;
      for (var b = 0; b < BUILTIN_TASK_TYPES.length; b++) {
        if (
          BUILTIN_TASK_TYPES[b].label.toLocaleLowerCase('fr-FR') === labelKey
        ) {
          dupBuiltin = true;
          break;
        }
      }
      if (dupBuiltin) continue;
      seen[entry.id] = true;
      seenLabel[labelKey] = true;
      out.push(entry);
    }
    return out;
  }

  function setCustomTaskTypes(raw) {
    customTaskTypes = normalizeCustomTaskTypes(raw);
    rebuildTaskTypeIndex();
    return customTaskTypes.slice();
  }

  /**
   * Create a custom type entry (not yet persisted). Returns null if invalid /
   * duplicate label. Optionally appends to the in-memory catalog.
   */
  function createCustomTaskType(input, options) {
    options = options || {};
    var label =
      typeof input === 'string'
        ? input.trim()
        : input && typeof input.label === 'string'
          ? input.label.trim()
          : '';
    if (!label) return null;
    var draft = normalizeCustomTaskTypeEntry({
      label: label,
      hint: input && typeof input === 'object' ? input.hint : '',
      icon:
        input && typeof input === 'object' && input.icon
          ? input.icon
          : randomTaskTypeIconKey()
    });
    if (!draft) return null;
    var labelKey = draft.label.toLocaleLowerCase('fr-FR');
    var catalog = getTaskTypeCatalog();
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i].label.toLocaleLowerCase('fr-FR') === labelKey) {
        return null;
      }
    }
    if (customTaskTypes.length >= MAX_CUSTOM_TASK_TYPES) return null;
    if (options.apply !== false) {
      customTaskTypes = customTaskTypes.concat([draft]);
      rebuildTaskTypeIndex();
    }
    return draft;
  }

  /** De-dupe + keep catalog-valid (or custom-*) ids; preserve first-seen order. */
  function normalizeTaskTypes(raw) {
    var list = Array.isArray(raw)
      ? raw
      : typeof raw === 'string' && raw.trim()
        ? [raw]
        : [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var id = typeof list[i] === 'string' ? list[i].trim() : '';
      if (!id || !isValidTaskTypeId(id) || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  /**
   * Board-level assignee role catalog (Information → Assignés).
   * Full list is stored on the board (seeded with builtins on first load).
   * Card-local one-offs live in cardPriority.memberRoleCustoms (custom-* ids).
   */
  var BUILTIN_MEMBER_ROLES = [
    { id: 'subtitles', label: 'Sous-titres', icon: 'captions' },
    { id: 'coloring', label: '\u00c9talonnage', icon: 'palette' },
    { id: 'editing', label: 'Montage', icon: 'scissors' },
    { id: 'music', label: 'Musique et effets sonores', icon: 'music' }
  ];
  var CUSTOM_MEMBER_ROLE_ID_RE = /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var MAX_MEMBER_ROLE_CATALOG = 40;
  var MAX_MEMBER_ROLE_LABEL_LEN = 40;
  var MAX_MEMBER_ROLES_PER_MEMBER = 12;

  /** Board catalog (mutable; set via setMemberRoleCatalog). */
  var memberRoleCatalog = BUILTIN_MEMBER_ROLES.map(function (e) {
    return { id: e.id, label: e.label, icon: e.icon };
  });
  /** Card-local one-off role labels (not on the board catalog). */
  var memberRoleCustoms = [];
  var MEMBER_ROLE_BY_ID = Object.create(null);

  // ── 1c. Member-role catalog (built-in + board + card-local) ─────────────
  // Roles tag board members / custom people (e.g. boss, peer). Board catalog
  // is shared; card-local customs cover one-off labels until promoted.

  function rebuildMemberRoleIndex() {
    var map = Object.create(null);
    var i;
    for (i = 0; i < memberRoleCatalog.length; i++) {
      map[memberRoleCatalog[i].id] = memberRoleCatalog[i];
    }
    for (i = 0; i < memberRoleCustoms.length; i++) {
      if (!map[memberRoleCustoms[i].id]) {
        map[memberRoleCustoms[i].id] = memberRoleCustoms[i];
      }
    }
    MEMBER_ROLE_BY_ID = map;
  }
  rebuildMemberRoleIndex();

  function isCustomMemberRoleId(id) {
    return typeof id === 'string' && CUSTOM_MEMBER_ROLE_ID_RE.test(id);
  }

  function isBuiltinMemberRoleId(id) {
    if (typeof id !== 'string' || !id) return false;
    for (var i = 0; i < BUILTIN_MEMBER_ROLES.length; i++) {
      if (BUILTIN_MEMBER_ROLES[i].id === id) return true;
    }
    return false;
  }

  function defaultMemberRoleCatalog() {
    return BUILTIN_MEMBER_ROLES.map(function (e) {
      return { id: e.id, label: e.label, icon: e.icon };
    });
  }

  function slugifyMemberRoleLabel(label) {
    return String(label || '')
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'role';
  }

  function makeCustomMemberRoleId(label) {
    var slug = slugifyMemberRoleLabel(label);
    var suffix = Math.random().toString(36).slice(2, 6);
    return 'custom-' + slug + '-' + suffix;
  }

  function normalizeMemberRoleIconKey(raw, fallback) {
    return normalizeTaskTypeIconKey(raw, fallback || 'tag');
  }

  function normalizeMemberRoleEntry(raw, options) {
    options = options || {};
    if (!raw || typeof raw !== 'object') return null;
    var label =
      typeof raw.label === 'string'
        ? raw.label.trim()
        : typeof raw.name === 'string'
          ? raw.name.trim()
          : '';
    if (!label) return null;
    if (label.length > MAX_MEMBER_ROLE_LABEL_LEN) {
      label = label.slice(0, MAX_MEMBER_ROLE_LABEL_LEN);
    }
    var rawId = typeof raw.id === 'string' ? raw.id.trim() : '';
    var id = '';
    if (rawId && isBuiltinMemberRoleId(rawId)) {
      id = rawId;
    } else if (rawId && isCustomMemberRoleId(rawId)) {
      id = rawId;
    } else if (options.allowAnyId && rawId && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawId)) {
      id = rawId;
    } else {
      id = makeCustomMemberRoleId(label);
    }
    var icon = normalizeMemberRoleIconKey(raw.icon, 'tag');
    var entry = { id: id, label: label, icon: icon };
    if (isCustomMemberRoleId(id)) entry.custom = true;
    return entry;
  }

  function normalizeMemberRoleCatalog(raw) {
    var list = Array.isArray(raw) ? raw : [];
    if (!list.length) return defaultMemberRoleCatalog();
    var out = [];
    var seen = Object.create(null);
    var seenLabel = Object.create(null);
    for (var i = 0; i < list.length && out.length < MAX_MEMBER_ROLE_CATALOG; i++) {
      var entry = normalizeMemberRoleEntry(list[i], { allowAnyId: true });
      if (!entry || seen[entry.id]) continue;
      var labelKey = entry.label.toLocaleLowerCase('fr-FR');
      if (seenLabel[labelKey]) continue;
      seen[entry.id] = true;
      seenLabel[labelKey] = true;
      out.push({
        id: entry.id,
        label: entry.label,
        icon: entry.icon,
        custom: isCustomMemberRoleId(entry.id) || undefined
      });
      if (!out[out.length - 1].custom) delete out[out.length - 1].custom;
    }
    return out.length ? out : defaultMemberRoleCatalog();
  }

  function normalizeMemberRoleCustoms(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var seen = Object.create(null);
    var seenLabel = Object.create(null);
    var boardIds = Object.create(null);
    var boardLabels = Object.create(null);
    for (var b = 0; b < memberRoleCatalog.length; b++) {
      boardIds[memberRoleCatalog[b].id] = true;
      boardLabels[memberRoleCatalog[b].label.toLocaleLowerCase('fr-FR')] = true;
    }
    for (var i = 0; i < list.length && out.length < MAX_MEMBER_ROLE_CATALOG; i++) {
      var entry = normalizeMemberRoleEntry(list[i]);
      if (!entry || !isCustomMemberRoleId(entry.id) || seen[entry.id]) continue;
      if (boardIds[entry.id]) continue;
      var labelKey = entry.label.toLocaleLowerCase('fr-FR');
      if (seenLabel[labelKey] || boardLabels[labelKey]) continue;
      seen[entry.id] = true;
      seenLabel[labelKey] = true;
      out.push({
        id: entry.id,
        label: entry.label,
        icon: entry.icon,
        custom: true
      });
    }
    return out;
  }

  function setMemberRoleCatalog(raw) {
    memberRoleCatalog = normalizeMemberRoleCatalog(raw);
    rebuildMemberRoleIndex();
    return memberRoleCatalog.slice();
  }

  function getMemberRoleCatalog() {
    return memberRoleCatalog.slice();
  }

  function setMemberRoleCustoms(raw) {
    memberRoleCustoms = normalizeMemberRoleCustoms(raw);
    rebuildMemberRoleIndex();
    return memberRoleCustoms.slice();
  }

  function getMemberRoleCustoms() {
    return memberRoleCustoms.slice();
  }

  function isValidMemberRoleId(id) {
    if (typeof id !== 'string' || !id) return false;
    if (MEMBER_ROLE_BY_ID[id]) return true;
    // Keep orphan custom ids until customs/catalog load.
    return isCustomMemberRoleId(id) || isBuiltinMemberRoleId(id);
  }

  function getMemberRoleEntry(id) {
    if (typeof id !== 'string' || !id) return null;
    if (MEMBER_ROLE_BY_ID[id]) return MEMBER_ROLE_BY_ID[id];
    if (isCustomMemberRoleId(id) || isBuiltinMemberRoleId(id)) {
      var builtin = null;
      for (var i = 0; i < BUILTIN_MEMBER_ROLES.length; i++) {
        if (BUILTIN_MEMBER_ROLES[i].id === id) {
          builtin = BUILTIN_MEMBER_ROLES[i];
          break;
        }
      }
      if (builtin) return { id: builtin.id, label: builtin.label, icon: builtin.icon };
      return { id: id, label: id, icon: 'tag', custom: true };
    }
    return null;
  }

  function memberRoleLabel(id) {
    var entry = getMemberRoleEntry(id);
    return entry ? entry.label : '';
  }

  function memberRoleIconKey(id) {
    var entry = getMemberRoleEntry(id);
    return entry ? entry.icon || 'tag' : 'tag';
  }

  function normalizeMemberRoleIds(raw) {
    var list = Array.isArray(raw)
      ? raw
      : typeof raw === 'string' && raw.trim()
        ? [raw]
        : [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length && out.length < MAX_MEMBER_ROLES_PER_MEMBER; i++) {
      var id = typeof list[i] === 'string' ? list[i].trim() : '';
      if (!id || !isValidMemberRoleId(id) || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  /**
   * Normalize cardPriority.memberRoles map: { memberId: roleId[] }.
   */
  function normalizeMemberRoles(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }
    var out = Object.create(null);
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) {
      var memberId = String(keys[i] || '').trim();
      if (!memberId) continue;
      var roles = normalizeMemberRoleIds(raw[keys[i]]);
      if (roles.length) out[memberId] = roles;
    }
    return out;
  }

  function pruneMemberRoleCustoms(customs, rolesMap) {
    var used = Object.create(null);
    var map = normalizeMemberRoles(rolesMap);
    var memberIds = Object.keys(map);
    for (var i = 0; i < memberIds.length; i++) {
      var roles = map[memberIds[i]];
      for (var r = 0; r < roles.length; r++) used[roles[r]] = true;
    }
    var list = normalizeMemberRoleCustoms(customs);
    return list.filter(function (entry) {
      return used[entry.id];
    });
  }

  function removeMemberFromRoles(rolesMap, memberId) {
    var map = normalizeMemberRoles(rolesMap);
    var id = memberId != null ? String(memberId).trim() : '';
    if (!id || !map[id]) return map;
    delete map[id];
    return map;
  }

  /**
   * Create a card-local one-off role (custom-*). Does not touch the board catalog.
   * Optionally appends to in-memory memberRoleCustoms when options.apply !== false.
   */
  function createCustomMemberRole(input, options) {
    options = options || {};
    var label =
      typeof input === 'string'
        ? input.trim()
        : input && typeof input.label === 'string'
          ? input.label.trim()
          : '';
    if (!label) return null;
    var draft = normalizeMemberRoleEntry({
      label: label,
      icon:
        input && typeof input === 'object' && input.icon
          ? input.icon
          : randomTaskTypeIconKey()
    });
    if (!draft || !isCustomMemberRoleId(draft.id)) return null;
    var labelKey = draft.label.toLocaleLowerCase('fr-FR');
    var catalog = getMemberRoleCatalog().concat(getMemberRoleCustoms());
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i].label.toLocaleLowerCase('fr-FR') === labelKey) {
        return null;
      }
    }
    if (memberRoleCustoms.length >= MAX_MEMBER_ROLE_CATALOG) return null;
    if (options.apply !== false) {
      memberRoleCustoms = memberRoleCustoms.concat([
        {
          id: draft.id,
          label: draft.label,
          icon: draft.icon,
          custom: true
        }
      ]);
      rebuildMemberRoleIndex();
    }
    return {
      id: draft.id,
      label: draft.label,
      icon: draft.icon,
      custom: true
    };
  }

  /**
   * Assignees who are not (necessarily) Trello members.
   * Board catalog: customAssigneeCatalog (reusable across cards).
   * Card membership: cardPriority.customAssignees (who is on this card).
   * Optional trelloMemberId links an avatar from a board Trello member.
   */
  var CUSTOM_ASSIGNEE_ID_RE = /^person-[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var MAX_CUSTOM_ASSIGNEES = 40;
  var MAX_CUSTOM_ASSIGNEE_NAME_LEN = 60;
  /** Board-level Hors Trello people (mutable; set via setCustomAssigneeCatalog). */
  S.customAssigneeCatalog = [];

  // ── 1d. Custom assignees (“Hors Trello”) ────────────────────────────────
  // People not on the Trello board; stored board-wide, merged into assignee
  // pickers alongside real members (ids look like custom-person-*).

  function isCustomAssigneeId(id) {
    return typeof id === 'string' && CUSTOM_ASSIGNEE_ID_RE.test(id);
  }

  function slugifyPersonName(name) {
    return String(name || '')
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'personne';
  }

  function makeCustomAssigneeId(name) {
    return 'person-' + slugifyPersonName(name) + '-' + Math.random().toString(36).slice(2, 6);
  }

  function initialsFromName(name) {
    var parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  // exports
  S.AXIS_SCORE_MAX = AXIS_SCORE_MAX;
  S.BASE_EASE_WEIGHT = BASE_EASE_WEIGHT;
  S.BASE_IMPACT_WEIGHT = BASE_IMPACT_WEIGHT;
  S.BUILTIN_MEMBER_ROLES = BUILTIN_MEMBER_ROLES;
  S.BUILTIN_TASK_TYPES = BUILTIN_TASK_TYPES;
  S.COLOR_SCHEME_STORAGE_KEY = COLOR_SCHEME_STORAGE_KEY;
  S.CUSTOM_ASSIGNEE_ID_RE = CUSTOM_ASSIGNEE_ID_RE;
  S.CUSTOM_MEMBER_ROLE_ID_RE = CUSTOM_MEMBER_ROLE_ID_RE;
  S.CUSTOM_TASK_TYPE_ICON_KEYS = CUSTOM_TASK_TYPE_ICON_KEYS;
  S.CUSTOM_TASK_TYPE_ID_RE = CUSTOM_TASK_TYPE_ID_RE;
  S.DAMPEN_EASE_ATTENUATION = DAMPEN_EASE_ATTENUATION;
  S.DAMPEN_MAX = DAMPEN_MAX;
  S.DAMPEN_POWER = DAMPEN_POWER;
  S.DATE_GAIN_FIXED = DATE_GAIN_FIXED;
  S.DATE_GAIN_MOVABLE = DATE_GAIN_MOVABLE;
  S.DATE_PROXIMITY_TAU_DAYS = DATE_PROXIMITY_TAU_DAYS;
  S.DEFAULT_COLOR_SCHEME_KEY = DEFAULT_COLOR_SCHEME_KEY;
  S.DUE_DATE_FIXE_COPY = DUE_DATE_FIXE_COPY;
  S.DUE_LIMIT_STATE_HAS = DUE_LIMIT_STATE_HAS;
  S.DUE_LIMIT_STATE_NONE = DUE_LIMIT_STATE_NONE;
  S.EASE_BASE = EASE_BASE;
  S.EASE_COST_DEFS = EASE_COST_DEFS;
  S.EASE_COST_PEOPLE_STEPS = EASE_COST_PEOPLE_STEPS;
  S.EASE_COST_TIME_STEPS = EASE_COST_TIME_STEPS;
  S.EASE_FLOOR = EASE_FLOOR;
  S.EASE_MUL_DAMPEN_THRESHOLD = EASE_MUL_DAMPEN_THRESHOLD;
  S.EASE_MUL_HI = EASE_MUL_HI;
  S.EASE_MUL_LO = EASE_MUL_LO;
  S.EASE_QUICK_WINS = EASE_QUICK_WINS;
  S.EASE_SCALE = EASE_SCALE;
  S.EISENHOWER_IMPACT_THRESHOLD = EISENHOWER_IMPACT_THRESHOLD;
  S.EISENHOWER_URGENCY_THRESHOLD = EISENHOWER_URGENCY_THRESHOLD;
  S.EMPRESSEMENT_DEFAULT_ID = EMPRESSEMENT_DEFAULT_ID;
  S.EMPRESSEMENT_OPTIONS = EMPRESSEMENT_OPTIONS;
  S.EMPRESSEMENT_PULL_MAX = EMPRESSEMENT_PULL_MAX;
  S.FORMULA_STORAGE_KEY = FORMULA_STORAGE_KEY;
  S.GAMMA_EASE = GAMMA_EASE;
  S.HARD_PENALTY_FLOOR = HARD_PENALTY_FLOOR;
  S.IMPACT_EXP = IMPACT_EXP;
  S.IMPACT_FACTOR_DEFS = IMPACT_FACTOR_DEFS;
  S.IMPACT_SYNERGY_PER_EXTRA = IMPACT_SYNERGY_PER_EXTRA;
  S.MAX_CUSTOM_ASSIGNEES = MAX_CUSTOM_ASSIGNEES;
  S.MAX_CUSTOM_ASSIGNEE_NAME_LEN = MAX_CUSTOM_ASSIGNEE_NAME_LEN;
  S.MAX_CUSTOM_TASK_TYPES = MAX_CUSTOM_TASK_TYPES;
  S.MAX_MEMBER_ROLES_PER_MEMBER = MAX_MEMBER_ROLES_PER_MEMBER;
  S.MAX_MEMBER_ROLE_CATALOG = MAX_MEMBER_ROLE_CATALOG;
  S.MAX_MEMBER_ROLE_LABEL_LEN = MAX_MEMBER_ROLE_LABEL_LEN;
  S.MAX_TASK_TYPE_HINT_LEN = MAX_TASK_TYPE_HINT_LEN;
  S.MAX_TASK_TYPE_LABEL_LEN = MAX_TASK_TYPE_LABEL_LEN;
  S.MEMBER_ROLE_BY_ID = MEMBER_ROLE_BY_ID;
  S.PRESSURE_MAX = PRESSURE_MAX;
  S.SCORE_MAX = SCORE_MAX;
  S.SECTION_COLLAPSE_KEYS = SECTION_COLLAPSE_KEYS;
  S.SECTION_COLLAPSE_STORAGE_KEY = SECTION_COLLAPSE_STORAGE_KEY;
  S.STATUT_EMBEDDED_DETAILS_STORAGE_KEY = STATUT_EMBEDDED_DETAILS_STORAGE_KEY;
  S.TASK_TYPES = TASK_TYPES;
  S.TASK_TYPE_TABLER_ICONS = TASK_TYPE_TABLER_ICONS;
  S.URGENCY_BOOST_MAX = URGENCY_BOOST_MAX;
  S.URGENCY_BOOST_MIN_U = URGENCY_BOOST_MIN_U;
  S.URGENCY_MIGRATION_MODE = URGENCY_MIGRATION_MODE;
  S.URGENCY_REVIEW_PROMPT = URGENCY_REVIEW_PROMPT;
  S.URGENCY_REVIEW_THRESHOLD_10 = URGENCY_REVIEW_THRESHOLD_10;
  S.VALUE_EFFORT_SCALE = VALUE_EFFORT_SCALE;
  S.WB = WB;
  S.WI = WI;
  S.WI_EASE = WI_EASE;
  S.WSJF_SCALE = WSJF_SCALE;
  S.WT = WT;
  S.createCustomMemberRole = createCustomMemberRole;
  S.createCustomTaskType = createCustomTaskType;
  S.customTaskTypes = customTaskTypes;
  S.defaultMemberRoleCatalog = defaultMemberRoleCatalog;
  S.getCustomTaskTypes = getCustomTaskTypes;
  S.getMemberRoleCatalog = getMemberRoleCatalog;
  S.getMemberRoleCustoms = getMemberRoleCustoms;
  S.getMemberRoleEntry = getMemberRoleEntry;
  S.getTaskTypeCatalog = getTaskTypeCatalog;
  S.getTaskTypeEntry = getTaskTypeEntry;
  S.getTaskTypeIconKeys = getTaskTypeIconKeys;
  S.initialsFromName = initialsFromName;
  S.isBuiltinMemberRoleId = isBuiltinMemberRoleId;
  S.isBuiltinTaskTypeId = isBuiltinTaskTypeId;
  S.isCustomAssigneeId = isCustomAssigneeId;
  S.isCustomMemberRoleId = isCustomMemberRoleId;
  S.isCustomTaskTypeId = isCustomTaskTypeId;
  S.isTaskTypeSvgIconKey = isTaskTypeSvgIconKey;
  S.isTaskTypeTablerIconKey = isTaskTypeTablerIconKey;
  S.isValidMemberRoleId = isValidMemberRoleId;
  S.isValidTaskTypeId = isValidTaskTypeId;
  S.makeCustomAssigneeId = makeCustomAssigneeId;
  S.makeCustomMemberRoleId = makeCustomMemberRoleId;
  S.makeCustomTaskTypeId = makeCustomTaskTypeId;
  S.memberRoleCatalog = memberRoleCatalog;
  S.memberRoleCustoms = memberRoleCustoms;
  S.memberRoleIconKey = memberRoleIconKey;
  S.memberRoleLabel = memberRoleLabel;
  S.normalizeCustomTaskTypeEntry = normalizeCustomTaskTypeEntry;
  S.normalizeCustomTaskTypes = normalizeCustomTaskTypes;
  S.normalizeMemberRoleCatalog = normalizeMemberRoleCatalog;
  S.normalizeMemberRoleCustoms = normalizeMemberRoleCustoms;
  S.normalizeMemberRoleEntry = normalizeMemberRoleEntry;
  S.normalizeMemberRoleIconKey = normalizeMemberRoleIconKey;
  S.normalizeMemberRoleIds = normalizeMemberRoleIds;
  S.normalizeMemberRoles = normalizeMemberRoles;
  S.normalizeTaskTypeIconKey = normalizeTaskTypeIconKey;
  S.normalizeTaskTypes = normalizeTaskTypes;
  S.playPriorityUiSound = playPriorityUiSound;
  S.pruneMemberRoleCustoms = pruneMemberRoleCustoms;
  S.randomTaskTypeIconKey = randomTaskTypeIconKey;
  S.rebuildMemberRoleIndex = rebuildMemberRoleIndex;
  S.rebuildTaskTypeIndex = rebuildTaskTypeIndex;
  S.removeMemberFromRoles = removeMemberFromRoles;
  S.setCustomTaskTypes = setCustomTaskTypes;
  S.setMemberRoleCatalog = setMemberRoleCatalog;
  S.setMemberRoleCustoms = setMemberRoleCustoms;
  S.slugifyMemberRoleLabel = slugifyMemberRoleLabel;
  S.slugifyPersonName = slugifyPersonName;
  S.slugifyTaskTypeLabel = slugifyTaskTypeLabel;
  S.taskTypeHint = taskTypeHint;
  S.taskTypeIconKey = taskTypeIconKey;
  S.taskTypeLabel = taskTypeLabel;
})(typeof window !== 'undefined' ? window : this);
