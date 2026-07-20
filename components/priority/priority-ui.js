/**
 * Priority UI + scoring for the Priorité Power-Up.
 * Loaded via <script> — exposes window.PriorityUI (no module bundler).
 *
 * Table of contents
 * ─────────────────
 *  1. Formula weights & constants
 *  2. Labels, keywords, tiers & heat presets
 *  3. Icon registry (property level SVG)
 *  4. Matrix label bridge (PriorityMatrix)
 *  5. Math helpers & tier styling
 *  6. Scoring formulas (baseline, Eisenhower, WSJF, value/effort)
 *  7. Formatters & heat-preset override solvers
 *  8. Help modal
 *  9. Form controls (field, heat panel, calc graph / RSM)
 * 10. Variant mount & slider persistence
 * 11. PriorityUI public API
 */
(function (global) {
  'use strict';

  // ── 1. Formula weights & constants ─────────────────────────────────────

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
  var EISENHOWER_IMPACT_THRESHOLD = 2;
  var FORMULA_STORAGE_KEY = 'trello-priority-powerup/formula';
  var COLOR_SCHEME_STORAGE_KEY = 'trello-priority-powerup/color-scheme';
  var SECTION_COLLAPSE_STORAGE_KEY = 'trello-priority-powerup/section-collapse';
  var STATUT_EMBEDDED_DETAILS_STORAGE_KEY =
    'trello-priority-powerup/statut-embedded-details-expanded';
  // 'blocked' / 'statut' kept for legacy prefs; both nest under Progrès (not collapsible).
  var SECTION_COLLAPSE_KEYS = [
    'overview',
    'info',
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
  var preferredTimeFormat = '24';
  var SCORE_MAX = 10;

  /**
   * Multi-label task taxonomy (Information + AI interview).
   * Order here is picker display order; selection order is preserved on the card.
   */
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
  var TASK_TYPE_BY_ID = Object.create(null);

  function rebuildTaskTypeIndex() {
    var map = Object.create(null);
    var i;
    for (i = 0; i < BUILTIN_TASK_TYPES.length; i++) {
      map[BUILTIN_TASK_TYPES[i].id] = BUILTIN_TASK_TYPES[i];
    }
    for (i = 0; i < customTaskTypes.length; i++) {
      map[customTaskTypes[i].id] = customTaskTypes[i];
    }
    TASK_TYPE_BY_ID = map;
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
    if (TASK_TYPE_BY_ID[id]) return true;
    // Keep orphan custom ids resolvable until the board catalog loads.
    return isCustomTaskTypeId(id);
  }

  function getTaskTypeEntry(id) {
    if (typeof id !== 'string' || !id) return null;
    if (TASK_TYPE_BY_ID[id]) return TASK_TYPE_BY_ID[id];
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
      typeof TASK_TYPE_ICON_SVG !== 'undefined' &&
      TASK_TYPE_ICON_SVG &&
      TASK_TYPE_ICON_SVG[key]
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
  // Urgency / impact axis max (ease uses 1..5).
  var AXIS_UI_MAX = 4;
  // Tier indices — keep in sync with TIER_DEFS order (Critique → Optionnelle).
  var TIER_I = {
    CRITIQUE: 0,
    URGENTE: 1,
    PRIORITAIRE: 2,
    IMPORTANTE: 3,
    FLEXIBLE: 4,
    SECONDAIRE: 5,
    OPTIONNELLE: 6
  };
  var TIER_I_MAX = TIER_I.OPTIONNELLE;
  // Tiers 0..FLEXIBLE use scheme badge colors; Secondaire/Optionnelle stay muted.
  var TIER_I_SCHEME_MAPPED_MAX = TIER_I.FLEXIBLE;
  var TRELLO_BADGE_COLOR_MUTED = 'light-gray';
  var TRELLO_BADGE_COLOR_COMPLETE = 'green';

  // ── 2. Labels, keywords, tiers & heat presets ───────────────────────────

  var LABELS = {
    time: {
      icon: ['time-0', 'time-1', 'time-2', 'time-3', 'time-4'],
      short: ['Aucune pression', 'Flexible', 'Modérée', 'Élevée', 'Critique'],
      detail: [
        'Aucune contrainte ni dépendance critique. Repousser n\'entraîne ni blocage ni impact notable sur l\'équipe.',
        'Peut être repoussée sans conséquence. Peu de pression, le planning de l\'équipe n\'est pas affecté.',
        'Priorité modérée dans le backlog. Les dépendances commencent à peser sur le planning.',
        'Pression forte : action requise pour éviter un blocage visible dans la chaîne de travail.',
        'Bloque le travail en cours ou crée des dépendances critiques. La pression est maximale.'
      ],
      popup: {
        subtitle: 'Quelle pression pèse sur cette tâche?',
        intro: 'La pression relative mesure combien une tâche pèse sur le planning : blocages provoqués, dépendances en jeu et risque si elle glisse.',
        guidance: 'Regardez ce qui bloque si la tâche n\'est pas faite et les conséquences concrètes d\'un report.'
      }
    },
    blocking: {
      icon: ['block-0', 'block-1', 'block-2', 'block-3'],
      short: ['Rien', 'Blocage léger', 'Bloque une tâche', 'Bloque l\'équipe'],
      detail: [
        'Rien ne dépend de cette tâche. Aucune dépendance directe et le travail de l\'équipe avance sans ralentissement.',
        'Un collègue est ralenti, mais peut contourner. Le blocage est léger et les dépendances restent contournables.',
        'Bloque une tâche ou un collègue. Une dépendance directe empêche l\'avancement d\'un travail en cours.',
        'Bloque le travail de l\'équipe ou une livraison. Les dépendances sont multiples et l\'avancement global ralentit.'
      ],
      popup: {
        subtitle: 'Est-ce que quelque chose cesse de fonctionner si ce n\'est pas fait?',
        intro: 'Le blocage mesure dans quelle mesure le travail de l\'équipe ralentit ou s\'arrête tant que la tâche n\'est pas faite. Les dépendances directes, les collègues bloqués et les livraisons retenues.',
        guidance: 'Demandez-vous qui est bloqué, quelles tâches en dépendent et si l\'équipe peut avancer autrement sans elle.'
      }
    },
    impact: {
      icon: ['impact-0', 'impact-1', 'impact-2', 'impact-3', 'impact-4'],
      short: ['Personnel', '\u00c9quipe', 'Interne', 'Population', 'Global'],
      detail: [
        'Port\u00e9e individuelle. L\'action touche surtout vous ou une seule personne.',
        'Port\u00e9e \u00e9quipe. Effet sur le groupe de travail imm\u00e9diat ou le squad.',
        'Port\u00e9e interne. Impact \u00e0 l\'\u00e9chelle de l\'organisation (plusieurs \u00e9quipes / d\u00e9partements).',
        'Port\u00e9e population. Effet notable sur clients, usagers ou une communaut\u00e9 large.',
        'Port\u00e9e mondiale. Rayonnement global : march\u00e9, soci\u00e9t\u00e9 ou plan\u00e8te.'
      ],
      popup: {
        subtitle: 'Quelle est la port\u00e9e de cette action?',
        intro: 'L\'impact mesure la port\u00e9e de l\'action\u00a0: qui est touch\u00e9, de l\'individu jusqu\'au global. Plus le cercle est grand, plus la secousse (valeur et audience) est large.',
        guidance: 'Choisissez le plus petit cercle qui contient vraiment les personnes ou syst\u00e8mes affect\u00e9s.'
      },
      affirmations: [
        'Personnel. Touche surtout une personne.',
        '\u00c9quipe. Effet sur l\'\u00e9quipe imm\u00e9diate.',
        'Interne. Port\u00e9e organisationnelle.',
        'Population. Clients, usagers ou communaut\u00e9 large.',
        'Global. Rayonnement mondial.'
      ]
    },
    ease: {
      icon: ['', 'ease-1', 'ease-2', 'ease-3', 'ease-4', 'ease-5'],
      short: ['', 'Très difficile', 'Difficile', 'Moyen', 'Facile', 'Super facile'],
      detail: [
        '',
        'Projet lourd avec complexité élevée. Coordonner demande beaucoup de ressources ; faible confiance, faible réversibilité.',
        'Effort conséquent avec plusieurs dépendances. Coût et difficulté notables, risque modéré à l\'exécution.',
        'Complexité maîtrisée, exécution standard. Ressources raisonnables, difficulté absorbable par l\'équipe.',
        'Peu de friction, rapide à réaliser. Faible coût, bonne confiance dans l\'exécution, facilement réversible.',
        'Quasi sans friction. Très peu de ressources, complexité minimale, risque faible et annulation aisée.'
      ],
      popup: {
        subtitle: 'À quel point est-il facile de faire cette tâche?',
        intro: 'La facilité d\'exécution reflète la complexité, le coût, l\'incertitude et le niveau de confiance dont vous disposez. Une tâche simple demande peu de ressources et reste facilement réversible ; une tâche difficile exige plus de coordination, multiplie les risques et coûte cher à corriger.',
        guidance: 'Estimez la difficulté technique, les ressources mobilisées et la facilité à revenir en arrière si besoin.'
      },
      affirmations: [
        '',
        'Très difficile. Projet lourd, coordination intense, risque important.',
        'Difficile. Travail conséquent, dépendances multiples.',
        'Moyen. Complexité maîtrisée, exécution standard.',
        'Facile. Rapide à faire, peu de friction.',
        'Super facile. Très peu d\'effort, faible risque, facile à annuler.'
      ]
    },
    urgency: {
      icon: ['urgency-0', 'urgency-1', 'urgency-2', 'urgency-3', 'urgency-4'],
      short: ['Aucune', 'Faible', 'Modérée', 'Élevée', 'Critique'],
      detail: [
        'Aucune pression ni dépendance critique. Repousser n\'entraîne ni blocage ni impact notable.',
        'Pression légère, peu de dépendances. Rien ne bloque pour l\'instant.',
        'Pression montante ou quelques tâches en dépendent. Les dépendances commencent à se faire sentir.',
        'Pression forte ou blocage notable. L\'équipe ralentit ; le risque de repousser devient significatif.',
        'Priorité absolue. Bloque l\'ensemble du travail ; forte pression, dépendances multiples.'
      ],
      popup: {
        subtitle: 'À quel point est-ce urgent de faire cette tâche?',
        intro: 'L\'urgence capture la pression et les conséquences d\'un report : blocages provoqués et dépendances qui s\'accumulent si la tâche est repoussée.',
        guidance: 'Regardez ce qui bloque si vous reportez et les conséquences concrètes d\'un changement de priorité.'
      },
      affirmations: [
        'Aucune pression. Rien ne bloque, aucune dépendance critique.',
        'Pression légère. Peu de dépendances, rien ne bloque.',
        'Pression modérée. Quelques tâches en dépendent.',
        'Pression forte ou blocage notable. L\'équipe ralentit si on reporte.',
        'Critique. Bloque tout le travail de l\'équipe ou une livraison clé.'
      ]
    }
  };

  // ── 3. Icon registry (property level SVG) ─────────────────────────────

  var ICON_S = 'stroke="currentColor" fill="none" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"';

  function batterySvg(fillPct, extra) {
    var h = 10 * fillPct;
    var y = 12 - h;
    var fill = h > 0
      ? '<rect x="6.5" y="' + y + '" width="3" height="' + h + '" rx="0.3" fill="currentColor" stroke="none"/>'
      : '';
    return '<rect x="5.5" y="3" width="5" height="10" rx="0.8" ' + ICON_S + '/>' +
      '<rect x="7" y="1.5" width="2" height="1.5" rx="0.4" fill="currentColor" stroke="none"/>' +
      fill + (extra || '');
  }

  var LEVEL_ICON_SVG = {
  /* Time — calendar / deadline progression */
    'time-0': '<rect x="3" y="4" width="10" height="9" rx="1" ' + ICON_S + '/>' +
      '<path d="M3 7h10M6 2v2M10 2v2M8 9.5l-1.5 1.5M8 9.5l1.5 1.5" ' + ICON_S + '/>',
    'time-1': '<rect x="3" y="4" width="10" height="9" rx="1" ' + ICON_S + '/>' +
      '<path d="M3 7h10M6 2v2M10 2v2M5.5 10.5h5" ' + ICON_S + ' stroke-dasharray="1.5 1.5"/>',
    'time-2': '<path d="M5 2.5v2.5l2.5 1.5v5.5M11 2.5v2.5l-2.5 1.5v5.5M5 5h6M6.5 11.5h3" ' + ICON_S + '/>',
    'time-3': '<circle cx="8" cy="8.5" r="5" ' + ICON_S + '/>' +
      '<path d="M8 8.5V5.5M8 8.5l2.5 1.5" ' + ICON_S + '/>' +
      '<path d="M11.5 3.5l.8.8M13 8h1" ' + ICON_S + ' stroke-width="1"/>',
    'time-4': '<path d="M8 13.5c2-2.5 3.5-4.5 3.5-6.5a3.5 3.5 0 1 0-7 0c0 2 1.5 4 3.5 6.5z" ' + ICON_S + '/>' +
      '<path d="M8 10v-1.5M6.5 8.5h3" ' + ICON_S + ' stroke-width="1"/>',
  /* Urgency — pressure / tempo escalation */
    'urgency-0': '<path d="M4.5 10.5c.8-.8 1.2-1.5 1.2-2.2M7 8.5c.6-.5 1-1 1-1.5M9.5 7c.4-.3.7-.7.7-1" ' + ICON_S + '/>' +
      '<circle cx="8" cy="11.5" r="2.5" ' + ICON_S + '/>',
    'urgency-1': '<rect x="3" y="4" width="10" height="9" rx="1" ' + ICON_S + '/>' +
      '<path d="M3 7h10M6 2v2M10 2v2" ' + ICON_S + '/>' +
      '<path d="M5.5 10h5" ' + ICON_S + ' stroke-dasharray="2 1.5"/>',
    'urgency-2': '<path d="M5.5 2.5v2.2l2.5 1.4v6.4M10.5 2.5v2.2l-2.5 1.4v6.4" ' + ICON_S + '/>' +
      '<path d="M5.5 5h5" ' + ICON_S + '/>',
    'urgency-3': '<path d="M8 2.5v1.5M8 12v1M4.2 4.2l1 1M11.8 4.2l-1 1M2.5 8h1.5M12 8h1.5" ' + ICON_S + ' stroke-width="1"/>' +
      '<circle cx="8" cy="8.5" r="3.5" ' + ICON_S + '/>' +
      '<path d="M8 6.5v2.5l1.8 1" ' + ICON_S + '/>',
    'urgency-4': '<path d="M8 13.5c2-2.5 3.5-4.5 3.5-6.5a3.5 3.5 0 1 0-7 0c0 2 1.5 4 3.5 6.5z" ' + ICON_S + '/>' +
      '<path d="M8 2v1M5 3.5l.7.7M11 3.5l-.7.7" ' + ICON_S + ' stroke-width="1"/>',
  /* Blocking — dependency / obstruction */
    'block-0': '<circle cx="8" cy="8" r="5.5" ' + ICON_S + '/>' +
      '<path d="M5.5 8.2l1.8 1.8 3.5-3.8" ' + ICON_S + '/>',
    'block-1': '<path d="M5.5 6.5a2 2 0 0 1 2.8-2.8l4.2 4.2a2 2 0 0 1-2.8 2.8zM10.5 9.5a2 2 0 0 1-2.8 2.8L3.5 8.1a2 2 0 0 1 2.8-2.8z" ' + ICON_S + '/>',
    'block-2': '<path d="M4 12.5h8l-1-3H5l-1 3zM6 9.5V6.5h4v3" ' + ICON_S + '/>' +
      '<path d="M8 3.5v1.5" ' + ICON_S + '/>',
    'block-3': '<rect x="3" y="5" width="4" height="2.5" rx="0.3" ' + ICON_S + '/>' +
      '<rect x="9" y="5" width="4" height="2.5" rx="0.3" ' + ICON_S + '/>' +
      '<rect x="5.5" y="8.5" width="5" height="2.5" rx="0.3" ' + ICON_S + '/>' +
      '<rect x="3" y="12" width="4" height="2.5" rx="0.3" ' + ICON_S + '/>' +
      '<rect x="9" y="12" width="4" height="2.5" rx="0.3" ' + ICON_S + '/>',
  /* Impact — value / reach */
    'impact-0': '<circle cx="8" cy="8" r="5.5" ' + ICON_S + '/>' +
      '<path d="M5 8h6" ' + ICON_S + '/>',
    'impact-1': '<path d="M8 12V8M8 8L6 6M8 8l2-2" ' + ICON_S + '/>' +
      '<circle cx="8" cy="13" r="0.8" fill="currentColor" stroke="none"/>',
    'impact-2': '<path d="M3.5 11.5l3-3.5 2.5 2 3.5-4.5" ' + ICON_S + '/>' +
      '<path d="M10 6h2.5v2.5" ' + ICON_S + '/>',
    'impact-3': '<path d="M8 2.5l1.2 3.7h3.8l-3.1 2.2 1.2 3.7L8 9.9l-3.1 2.2 1.2-3.7-3.1-2.2h3.8z" ' + ICON_S + '/>',
    'impact-4': '<circle cx="8" cy="8" r="5.5" ' + ICON_S + '/>' +
      '<ellipse cx="8" cy="8" rx="2.5" ry="5.5" ' + ICON_S + '/>' +
      '<path d="M2.5 8h11M3.8 5h8.4M3.8 11h8.4" ' + ICON_S + ' stroke-width="1"/>',
  /* Ease — effort via battery charge (low = hard, full = easy) */
    'ease-1': batterySvg(0, '<path d="M12.5 5.5v5M11 7h3M11 9h3" ' + ICON_S + ' stroke-width="1"/>'),
    'ease-2': batterySvg(0.25),
    'ease-3': batterySvg(0.5),
    'ease-4': batterySvg(0.75),
    'ease-5': batterySvg(1, '<path d="M10.5 6.5l-2 2.5h1.5l-1 2.5 2.5-3H11l1.5-2z" fill="currentColor" stroke="none"/>')
  };

  function levelIconSvg(id) {
    if (!id) return '';
    var inner = LEVEL_ICON_SVG[id];
    if (!inner) return '';
    return '<svg class="level-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
      inner + '</svg>';
  }

  /* Task-type icons (16×16 stroke paths; keys match TASK_TYPES.icon / custom picks). */
  var TASK_TYPE_ICON_SVG = {
    action:
      '<path d="M8.8 2.5L4.2 9h3.1L6.8 13.5 12 6.8H8.7L8.8 2.5z" ' + ICON_S + '/>',
    project:
      '<path d="M3 5.2h4.2l1.3 1.3H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.2a1 1 0 0 1 1-1z" ' + ICON_S + '/>',
    recurring:
      '<path d="M4.2 6.2A4.2 4.2 0 0 1 11.5 5M11.8 9.8A4.2 4.2 0 0 1 4.5 11" ' + ICON_S + '/>' +
      '<path d="M11.5 2.8v2.4H9.1M4.5 13.2v-2.4h2.4" ' + ICON_S + '/>',
    exploratory:
      '<circle cx="7" cy="7" r="3.4" ' + ICON_S + '/>' +
      '<path d="M9.5 9.5L13 13" ' + ICON_S + '/>',
    emotional:
      '<path d="M8 13.2S3.2 10 3.2 6.6A2.55 2.55 0 0 1 8 5.2a2.55 2.55 0 0 1 4.8 1.4C12.8 10 8 13.2 8 13.2z" ' + ICON_S + '/>',
    communication:
      '<path d="M3.2 4.2h9.6a1 1 0 0 1 1 1v5.2a1 1 0 0 1-1 1H7.2L4 13.2v-1.8H3.2a1 1 0 0 1-1-1V5.2a1 1 0 0 1 1-1z" ' + ICON_S + '/>',
    deliverable:
      '<path d="M3.2 5.5L8 3.2l4.8 2.3v5.3L8 13.1l-4.8-2.3V5.5z" ' + ICON_S + '/>' +
      '<path d="M3.2 5.5L8 7.8l4.8-2.3M8 7.8v5.3" ' + ICON_S + '/>',
    process:
      '<circle cx="8" cy="8" r="2.1" ' + ICON_S + '/>' +
      '<path d="M8 2.8v1.4M8 11.8v1.4M2.8 8h1.4M11.8 8h1.4M4.1 4.1l1 1M10.9 10.9l1 1M4.1 11.9l1-1M10.9 5.1l1-1" ' + ICON_S + ' stroke-width="1"/>',
    thinking:
      '<path d="M6.2 11.5h3.6M6.8 13h2.4" ' + ICON_S + '/>' +
      '<path d="M5.2 10.2a3.6 3.6 0 1 1 5.6 0c-.5.7-1.1 1.2-1.1 2H6.3c0-.8-.6-1.3-1.1-2z" ' + ICON_S + '/>',
    material:
      '<rect x="3" y="5.2" width="10" height="7.5" rx="1" ' + ICON_S + '/>' +
      '<path d="M3 7.4h10M8 5.2V3.8M6.2 3.8h3.6" ' + ICON_S + '/>',
    learning:
      '<path d="M8 4.2L3.2 6.2v5.2L8 13.4l4.8-2V6.2L8 4.2z" ' + ICON_S + '/>' +
      '<path d="M8 4.2v9.2M3.2 6.2L8 8.2l4.8-2" ' + ICON_S + '/>',
    admin:
      '<rect x="4" y="2.8" width="8" height="10.4" rx="1" ' + ICON_S + '/>' +
      '<path d="M6 5.5h4M6 7.8h4M6 10.1h2.5" ' + ICON_S + '/>',
    creative:
      '<circle cx="8" cy="8" r="5.2" ' + ICON_S + '/>' +
      '<circle cx="8" cy="8" r="1.5" ' + ICON_S + '/>' +
      '<path d="M8 2.8v2.2M8 11v2.2M2.8 8h2.2M11 8h2.2" ' + ICON_S + ' stroke-width="1"/>',
    finance:
      '<circle cx="8" cy="8" r="5.2" ' + ICON_S + '/>' +
      '<path d="M8 5v6M6.2 6.3c.5-.7 1.1-1 1.8-1s1.4.3 1.4 1.1c0 1.5-3.2 1-3.2 2.6 0 .8.7 1.2 1.8 1.2.7 0 1.3-.2 1.8-.7" ' + ICON_S + '/>',
    custom:
      '<path d="M3.5 7.2l3.7-3.7a1.2 1.2 0 0 1 1.7 0l3.3 3.3a1.2 1.2 0 0 1 0 1.7L8.5 12.2a1.2 1.2 0 0 1-1.7 0L3.5 8.9a1.2 1.2 0 0 1 0-1.7z" ' + ICON_S + '/>' +
      '<circle cx="10.2" cy="5.8" r="0.9" ' + ICON_S + '/>'
  };

  function taskTypeIconSvg(idOrKey, className) {
    var key = typeof idOrKey === 'string' ? idOrKey : '';
    if (TASK_TYPE_BY_ID[key] || isCustomTaskTypeId(key)) {
      key = taskTypeIconKey(key);
    }
    if (key.indexOf('ti-') === 0) key = key.slice(3);
    var cls = className || 'info-task-type-icon';
    var inner = TASK_TYPE_ICON_SVG[key];
    if (inner) {
      return (
        '<svg class="' +
        cls +
        '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
        inner +
        '</svg>'
      );
    }
    var tabler = key && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) ? key : 'tag';
    return (
      '<i class="ti ti-' +
      tabler +
      ' ' +
      cls +
      '" aria-hidden="true"></i>'
    );
  }

  /* Due-time period suggestions — sun / peak / cloud-sun / moon */
  var DUE_TIME_PERIOD_ICON_SVG = {
    matin:
      '<circle cx="8" cy="8" r="2.6" ' + ICON_S + '/>' +
      '<path d="M8 2.4v1.4M8 12.2v1.4M2.4 8h1.4M12.2 8h1.4M4 4l1 1M11 11l1 1M4 12l1-1M11 5l1-1" ' +
        ICON_S + ' stroke-width="1"/>',
    midi:
      '<circle cx="8" cy="8" r="3.1" ' + ICON_S + '/>' +
      '<path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M3.5 12.5l1.1-1.1M11.4 4.6l1.1-1.1" ' +
        ICON_S + ' stroke-width="1"/>',
    'apres-midi':
      '<circle cx="5.6" cy="5.6" r="2.2" ' + ICON_S + '/>' +
      '<path d="M5.6 2.1v1M2.1 5.6h1M3.3 3.3l.7.7M7.9 3.3l-.7.7" ' + ICON_S + ' stroke-width="1"/>' +
      '<path d="M4.8 12h6.2a2 2 0 0 0 .15-3.95 2.7 2.7 0 0 0-5.05-.95A2.15 2.15 0 0 0 4.8 12z" ' + ICON_S + '/>',
    soir:
      '<path d="M10.2 3A5.4 5.4 0 1 0 13 11.2 4.15 4.15 0 1 1 10.2 3z" ' + ICON_S + '/>'
  };

  function dueTimePeriodIconSvg(id) {
    var inner = DUE_TIME_PERIOD_ICON_SVG[id];
    if (!inner) return '';
    return '<svg class="due-date-time-period-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">' +
      inner + '</svg>';
  }

  /* Quick date suggestions — afternoon / morning / Monday / +1w / +2w */
  var DUE_DATE_QUICK_ICON_SVG = {
    'cet-apres-midi':
      '<circle cx="5.6" cy="5.6" r="2.2" ' + ICON_S + '/>' +
      '<path d="M5.6 2.1v1M2.1 5.6h1M3.3 3.3l.7.7M7.9 3.3l-.7.7" ' + ICON_S + ' stroke-width="1"/>' +
      '<path d="M4.8 12h6.2a2 2 0 0 0 .15-3.95 2.7 2.7 0 0 0-5.05-.95A2.15 2.15 0 0 0 4.8 12z" ' + ICON_S + '/>',
    'demain-matin':
      '<circle cx="8" cy="8" r="2.6" ' + ICON_S + '/>' +
      '<path d="M8 2.4v1.4M8 12.2v1.4M2.4 8h1.4M12.2 8h1.4M4 4l1 1M11 11l1 1M4 12l1-1M11 5l1-1" ' +
        ICON_S + ' stroke-width="1"/>',
    'lundi-prochain':
      '<rect x="2.5" y="3.5" width="11" height="10" rx="1.2" ' + ICON_S + '/>' +
      '<path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" ' + ICON_S + '/>' +
      '<path d="M5.5 9.5h1.2M7.8 9.5h1.2M10.1 9.5h1.2" ' + ICON_S + ' stroke-width="1.35"/>',
    'dans-une-semaine':
      '<rect x="2.5" y="3.5" width="11" height="10" rx="1.2" ' + ICON_S + '/>' +
      '<path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" ' + ICON_S + '/>' +
      '<path d="M8 8.2v3.2M6.4 10.3l1.6 1.4 1.6-1.4" ' + ICON_S + '/>',
    'dans-deux-semaines':
      '<rect x="2.5" y="3.5" width="11" height="10" rx="1.2" ' + ICON_S + '/>' +
      '<path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" ' + ICON_S + '/>' +
      '<path d="M5.2 9.2h2.3M8.5 9.2h2.3M5.2 11.3h2.3M8.5 11.3h2.3" ' + ICON_S + ' stroke-width="1.35"/>'
  };

  function dueDateQuickIconSvg(id) {
    var inner = DUE_DATE_QUICK_ICON_SVG[id];
    if (!inner) return '';
    return '<svg class="due-date-suggestion-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
      inner + '</svg>';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Max height for Information description preview/editor before scrolling. */
  var INFO_DESC_MAX_HEIGHT_PX = 360;
  var INFO_DESC_MIN_HEIGHT_PX = 72;
  /** Compact empty placeholder / empty editor height (one line + padding). */
  var INFO_DESC_EMPTY_MIN_HEIGHT_PX = 40;

  function safeMarkdownHref(href) {
    var u = String(href || '').trim();
    if (!u) return '';
    if (/^(https?:|mailto:)/i.test(u)) return u;
    return '';
  }

  /**
   * True when clipboard/plain text is a single pasteable URL (not a paragraph).
   * Accepts http(s)/mailto, optional <angle> wrappers, and www.* (→ https).
   */
  function normalizePasteableMarkdownUrl(text) {
    var u = String(text == null ? '' : text).trim();
    if (!u || /\s/.test(u)) return '';
    if (u.charAt(0) === '<' && u.charAt(u.length - 1) === '>') {
      u = u.slice(1, -1).trim();
      if (!u || /\s/.test(u)) return '';
    }
    var safe = safeMarkdownHref(u);
    if (safe) return safe;
    if (/^www\./i.test(u)) return safeMarkdownHref('https://' + u);
    return '';
  }

  /** Reverse of escapeHtml for values extracted from already-escaped markdown. */
  function unescapeHtml(s) {
    return String(s || '')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  // Optional markdown link/image title. Input is HTML-escaped first, so Trello
  // titles like "smartCard-block" arrive as &quot;smartCard-block&quot;.
  // Capture groups: "…", '…', &quot;…&quot;, &#39;…&#39;
  var MD_LINK_TITLE =
    '(?:\\s+(?:"([^"]*)"|\'([^\']*)\'|&quot;(.*?)&quot;|&#39;(.*?)&#39;))?';

  function firstCapture(a, b, c, d) {
    if (a != null && a !== '') return a;
    if (b != null && b !== '') return b;
    if (c != null && c !== '') return c;
    if (d != null && d !== '') return d;
    return '';
  }

  function hostnameFromUrl(url) {
    try {
      return new URL(String(url)).hostname.replace(/^www\./i, '');
    } catch (e) {
      return '';
    }
  }

  function faviconUrlFor(url) {
    var host = hostnameFromUrl(url);
    if (!host) return '';
    return (
      'https://www.google.com/s2/favicons?domain=' +
      encodeURIComponent(host) +
      '&sz=128'
    );
  }

  function normalizeComparableUrl(url) {
    return String(url || '')
      .trim()
      .replace(/\/+$/, '')
      .toLowerCase();
  }

  function labelLooksLikeUrl(label, href) {
    var text = unescapeHtml(String(label || '')).trim();
    if (!text) return false;
    if (/^https?:\/\//i.test(text)) return true;
    return normalizeComparableUrl(text) === normalizeComparableUrl(href);
  }

  /**
   * Decide if a markdown link should render as a Trello-style smart preview.
   * Returns 'block' | 'inline' | ''.
   */
  function smartCardModeForLink(label, href, title) {
    var t = String(title || '').trim().toLowerCase();
    if (t === 'smartcard-block') return 'block';
    if (t === 'smartcard-inline') return 'inline';
    if (!/^https?:\/\//i.test(href || '')) return '';
    // Bare / pasted URLs (label is the URL itself).
    if (labelLooksLikeUrl(label, href)) return 'block';
    return '';
  }

  function renderSmartCardHtml(url, mode) {
    var href = safeMarkdownHref(url);
    if (!href) return '';
    var host = hostnameFromUrl(href);
    var favicon = faviconUrlFor(href);
    var isInline = mode === 'inline';
    var cls =
      'info-md-smartcard' +
      (isInline ? ' info-md-smartcard--inline' : ' info-md-smartcard--block');
    return (
      '<a class="' +
      cls +
      '" href="' +
      escapeHtml(href) +
      '" target="_blank" rel="noopener noreferrer" data-smart-url="' +
      escapeHtml(href) +
      '" data-smart-mode="' +
      (isInline ? 'inline' : 'block') +
      '">' +
      '<span class="info-md-smartcard-media" aria-hidden="true">' +
      (favicon
        ? '<img class="info-md-smartcard-favicon" src="' +
          escapeHtml(favicon) +
          '" alt="" loading="lazy" referrerpolicy="no-referrer" decode="async">'
        : '') +
      '<img class="info-md-smartcard-image" alt="" hidden loading="lazy" referrerpolicy="no-referrer" decode="async">' +
      '</span>' +
      '<span class="info-md-smartcard-body">' +
      '<span class="info-md-smartcard-title">' +
      escapeHtml(host || href) +
      '</span>' +
      (host
        ? '<span class="info-md-smartcard-host">' + escapeHtml(host) + '</span>'
        : '') +
      '</span>' +
      '</a>'
    );
  }

  function renderMarkdownLinkHtml(label, href, title) {
    var url = safeMarkdownHref(href);
    if (!url) return '';
    if (/^mailto:/i.test(url)) {
      return (
        '<a class="info-md-link" href="' +
        escapeHtml(url) +
        '">' +
        label +
        '</a>'
      );
    }
    var mode = smartCardModeForLink(label, url, title);
    if (mode) return renderSmartCardHtml(url, mode);
    return (
      '<a class="info-md-link" href="' +
      escapeHtml(url) +
      '" target="_blank" rel="noopener noreferrer">' +
      label +
      '</a>'
    );
  }

  // ── Link unfurl (title + image) ──────────────────────────────────────
  var LINK_META_STORAGE_KEY = 'tp.linkMeta.v1';
  var LINK_META_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var linkMetaMemory = Object.create(null);
  var linkMetaInflight = Object.create(null);
  var linkMetaStorageLoaded = false;

  function readLinkMetaStorage() {
    if (linkMetaStorageLoaded) return;
    linkMetaStorageLoaded = true;
    try {
      if (typeof sessionStorage === 'undefined') return;
      var raw = sessionStorage.getItem(LINK_META_STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      Object.keys(parsed).forEach(function (key) {
        var entry = parsed[key];
        if (!entry || typeof entry !== 'object') return;
        if (entry.ts && Date.now() - entry.ts > LINK_META_TTL_MS) return;
        linkMetaMemory[key] = entry;
      });
    } catch (e) {
      /* ignore */
    }
  }

  function writeLinkMetaStorage() {
    try {
      if (typeof sessionStorage === 'undefined') return;
      var out = {};
      var keys = Object.keys(linkMetaMemory);
      // Cap cache size.
      var max = 80;
      var start = Math.max(0, keys.length - max);
      for (var i = start; i < keys.length; i += 1) {
        out[keys[i]] = linkMetaMemory[keys[i]];
      }
      sessionStorage.setItem(LINK_META_STORAGE_KEY, JSON.stringify(out));
    } catch (e) {
      /* ignore */
    }
  }

  function absolutizeUrl(maybeRelative, baseUrl) {
    var s = String(maybeRelative || '').trim();
    if (!s) return '';
    try {
      return new URL(s, baseUrl).href;
    } catch (e) {
      return '';
    }
  }

  function parseLinkMetaFromHtml(html, pageUrl) {
    if (typeof DOMParser === 'undefined') return null;
    var doc;
    try {
      doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    } catch (e) {
      return null;
    }
    function metaContent(selectors) {
      for (var i = 0; i < selectors.length; i += 1) {
        var el = doc.querySelector(selectors[i]);
        if (!el) continue;
        var content = el.getAttribute('content');
        if (content && String(content).trim()) return String(content).trim();
      }
      return '';
    }
    var title =
      metaContent([
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'meta[name="title"]'
      ]) ||
      ((doc.querySelector('title') && doc.querySelector('title').textContent) ||
        '').trim();
    var description = metaContent([
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]'
    ]);
    var image = metaContent([
      'meta[property="og:image:secure_url"]',
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]'
    ]);
    return {
      title: title,
      description: description,
      image: absolutizeUrl(image, pageUrl),
      logo: '',
      ts: Date.now()
    };
  }

  function fetchLinkMetaMicrolink(url) {
    var endpoint =
      'https://api.microlink.io?url=' +
      encodeURIComponent(url) +
      '&palette=false&audio=false&video=false&iframe=false';
    return fetch(endpoint, { credentials: 'omit' }).then(function (res) {
      if (!res.ok) throw new Error('microlink http ' + res.status);
      return res.json().then(function (json) {
        if (!json || json.status !== 'success' || !json.data) {
          throw new Error('microlink status');
        }
        var data = json.data;
        var image =
          (data.image && (data.image.url || data.image)) ||
          (data.logo && (data.logo.url || data.logo)) ||
          '';
        return {
          title: data.title ? String(data.title) : '',
          description: data.description ? String(data.description) : '',
          image: image ? String(image) : '',
          logo:
            data.logo && (data.logo.url || data.logo)
              ? String(data.logo.url || data.logo)
              : '',
          ts: Date.now()
        };
      });
    });
  }

  function fetchLinkMetaHtmlProxy(url) {
    var endpoint =
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    return fetch(endpoint, { credentials: 'omit' }).then(function (res) {
      if (!res.ok) throw new Error('proxy http ' + res.status);
      return res.text().then(function (html) {
        var meta = parseLinkMetaFromHtml(html, url);
        if (!meta || (!meta.title && !meta.image)) {
          throw new Error('proxy empty meta');
        }
        return meta;
      });
    });
  }

  /**
   * Fetch Open Graph-ish metadata for a URL (title + image).
   * Cached in memory + sessionStorage. Never throws.
   */
  function fetchLinkPreviewMeta(url) {
    var href = safeMarkdownHref(url);
    if (!href || !/^https?:\/\//i.test(href)) {
      return Promise.resolve(null);
    }
    readLinkMetaStorage();
    if (linkMetaMemory[href]) {
      return Promise.resolve(linkMetaMemory[href]);
    }
    if (linkMetaInflight[href]) return linkMetaInflight[href];

    linkMetaInflight[href] = fetchLinkMetaMicrolink(href)
      .catch(function () {
        return fetchLinkMetaHtmlProxy(href);
      })
      .then(function (meta) {
        var normalized = {
          title: (meta && meta.title) || '',
          description: (meta && meta.description) || '',
          image: (meta && meta.image) || '',
          logo: (meta && meta.logo) || '',
          ts: Date.now()
        };
        linkMetaMemory[href] = normalized;
        writeLinkMetaStorage();
        return normalized;
      })
      .catch(function () {
        var fallback = {
          title: '',
          description: '',
          image: '',
          logo: '',
          ts: Date.now(),
          failed: true
        };
        linkMetaMemory[href] = fallback;
        writeLinkMetaStorage();
        return fallback;
      })
      .then(function (meta) {
        delete linkMetaInflight[href];
        return meta;
      });

    return linkMetaInflight[href];
  }

  function applyLinkPreviewMetaToCard(card, meta) {
    if (!card || !meta) return;
    var titleEl = card.querySelector('.info-md-smartcard-title');
    var hostEl = card.querySelector('.info-md-smartcard-host');
    var imageEl = card.querySelector('.info-md-smartcard-image');
    var faviconEl = card.querySelector('.info-md-smartcard-favicon');
    var mediaEl = card.querySelector('.info-md-smartcard-media');
    var host = hostnameFromUrl(card.getAttribute('data-smart-url') || card.href);
    var title = String(meta.title || '').trim();
    if (titleEl && title) {
      titleEl.textContent = title;
      card.setAttribute('title', title);
    }
    if (hostEl && host) hostEl.textContent = host;
    var image = String(meta.image || meta.logo || '').trim();
    if (imageEl && image && /^https?:\/\//i.test(image)) {
      imageEl.hidden = false;
      imageEl.src = image;
      imageEl.alt = title || host || '';
      if (mediaEl) mediaEl.classList.add('has-image');
      if (faviconEl) faviconEl.hidden = true;
      imageEl.onerror = function () {
        imageEl.hidden = true;
        if (mediaEl) mediaEl.classList.remove('has-image');
        if (faviconEl) faviconEl.hidden = false;
      };
    }
    card.classList.add('is-hydrated');
    if (meta.failed) card.classList.add('is-fallback');
  }

  /**
   * Fill smart-card shells inside a preview root with fetched title/image.
   */
  function hydrateSmartLinkPreviews(root, options) {
    if (!root || !root.querySelectorAll) return Promise.resolve();
    options = options || {};
    var cards = root.querySelectorAll('a.info-md-smartcard[data-smart-url]');
    if (!cards.length) return Promise.resolve();
    var pending = [];
    for (var i = 0; i < cards.length; i += 1) {
      (function (card) {
        if (card.classList.contains('is-hydrated') && !options.force) return;
        var url = card.getAttribute('data-smart-url') || '';
        pending.push(
          fetchLinkPreviewMeta(url).then(function (meta) {
            applyLinkPreviewMetaToCard(card, meta);
          })
        );
      })(cards[i]);
    }
    return Promise.all(pending).then(function () {
      if (typeof options.onDone === 'function') options.onDone();
    });
  }

  function renderMarkdownInline(escaped) {
    var s = String(escaped || '');
    var slots = [];
    function stash(html) {
      slots.push(html);
      return '\u0000MD' + (slots.length - 1) + '\u0000';
    }
    // Preserve punctuation escaped by the rich editor before applying Markdown rules.
    s = s.replace(/\\([\\`*_[\]~#>+.!-])/g, function (_, literal) {
      return stash(literal);
    });
    s = s.replace(/`([^`\n]+)`/g, function (_, code) {
      return stash('<code class="info-md-code">' + code + '</code>');
    });
    s = s.replace(
      new RegExp('!\\[([^\\]]*)\\]\\(([^)\\s]+)' + MD_LINK_TITLE + '\\)', 'g'),
      function (_, alt, href) {
        var url = safeMarkdownHref(unescapeHtml(href));
        if (!url) return _;
        return stash(
          '<img class="info-md-img" src="' +
            escapeHtml(url) +
            '" alt="' +
            alt +
            '" loading="lazy">'
        );
      }
    );
    s = s.replace(
      new RegExp('\\[([^\\]]+)\\]\\(([^)\\s]+)' + MD_LINK_TITLE + '\\)', 'g'),
      function (_, label, href, t1, t2, t3, t4) {
        var url = safeMarkdownHref(unescapeHtml(href));
        if (!url) return _;
        var title = firstCapture(t1, t2, t3, t4);
        return stash(renderMarkdownLinkHtml(label, url, title) || _);
      }
    );
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
    s = s.replace(
      /(^|[\s(])((?:https?:\/\/)[^\s<]+[^\s<.,;:!?)])/gi,
      function (_, lead, url) {
        var href = unescapeHtml(url);
        var card = renderSmartCardHtml(href, 'block');
        if (card) return lead + stash(card);
        return (
          lead +
          '<a class="info-md-link" href="' +
          escapeHtml(href) +
          '" target="_blank" rel="noopener noreferrer">' +
          url +
          '</a>'
        );
      }
    );
    s = s.replace(/\u0000MD(\d+)\u0000/g, function (_, idx) {
      return slots[Number(idx)] || '';
    });
    return s;
  }

  /**
   * Lightweight Markdown → HTML for card descriptions (GFM-ish, HTML-escaped).
   * Supports headings, lists, checkboxes, quotes, code, links, emphasis, HR.
   */
  function renderMarkdownToHtml(md) {
    var src = String(md == null ? '' : md).replace(/\r\n?/g, '\n');
    if (!src.trim()) return '';

    var fences = [];
    src = src.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, function (_, _lang, body) {
      var code = escapeHtml(String(body || '').replace(/^\n/, '').replace(/\n$/, ''));
      fences.push('<pre class="info-md-pre"><code>' + code + '</code></pre>');
      return '\n\u0000FENCE' + (fences.length - 1) + '\u0000\n';
    });

    var lines = src.split('\n');
    var out = [];
    var i = 0;

    function flushParagraph(buf) {
      if (!buf.length) return;
      out.push(
        '<p class="info-md-p">' +
          renderMarkdownInline(escapeHtml(buf.join('\n')).replace(/\n/g, '<br>')) +
          '</p>'
      );
      buf.length = 0;
    }

    while (i < lines.length) {
      var line = lines[i];
      var fenceMatch = /^\u0000FENCE(\d+)\u0000$/.exec(line);
      if (fenceMatch) {
        out.push(fences[Number(fenceMatch[1])] || '');
        i += 1;
        continue;
      }
      if (/^\s*$/.test(line)) {
        i += 1;
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push('<hr class="info-md-hr">');
        i += 1;
        continue;
      }
      var heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        var level = Math.min(6, heading[1].length);
        out.push(
          '<h' +
            level +
            ' class="info-md-h">' +
            renderMarkdownInline(escapeHtml(heading[2])) +
            '</h' +
            level +
            '>'
        );
        i += 1;
        continue;
      }
      if (/^>\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^>\s?/, ''));
          i += 1;
        }
        out.push(
          '<blockquote class="info-md-quote">' +
            renderMarkdownInline(escapeHtml(quote.join('\n')).replace(/\n/g, '<br>')) +
            '</blockquote>'
        );
        continue;
      }
      var listMatch = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
      if (listMatch) {
        var ordered = /^\d+\./.test(listMatch[2]);
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + ' class="info-md-list">');
        while (i < lines.length) {
          var item = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
          if (!item) break;
          if (/^\d+\./.test(item[2]) !== ordered) break;
          var itemBody = item[3];
          var check = /^\[([ xX])\]\s+(.*)$/.exec(itemBody);
          if (check) {
            var checked = check[1] !== ' ';
            out.push(
              '<li class="info-md-li info-md-li--check">' +
                '<input type="checkbox" disabled' +
                (checked ? ' checked' : '') +
                '> ' +
                renderMarkdownInline(escapeHtml(check[2])) +
                '</li>'
            );
          } else {
            out.push(
              '<li class="info-md-li">' +
                renderMarkdownInline(escapeHtml(itemBody)) +
                '</li>'
            );
          }
          i += 1;
        }
        out.push('</' + tag + '>');
        continue;
      }
      var para = [];
      while (i < lines.length) {
        var next = lines[i];
        if (/^\s*$/.test(next)) break;
        if (/^\u0000FENCE\d+\u0000$/.test(next)) break;
        if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(next)) break;
        if (/^#{1,6}\s+/.test(next)) break;
        if (/^>\s?/.test(next)) break;
        if (/^(\s*)([-*+]|\d+\.)\s+/.test(next)) break;
        para.push(next);
        i += 1;
      }
      flushParagraph(para);
    }

    return out.join('');
  }

  function escapeRichMarkdownText(value) {
    return String(value == null ? '' : value).replace(/([\\`*_[\]~])/g, '\\$1');
  }

  function protectRichParagraphOpenings(value) {
    return String(value || '')
      .split('\n')
      .map(function (line) {
        if (/^\s*#{1,6}\s/.test(line) || /^\s*>\s?/.test(line)) {
          return line.replace(/^(\s*)([#>])/, '$1\\$2');
        }
        if (/^\s*[-+*]\s/.test(line) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
          return line.replace(/^(\s*)([-+*])/, '$1\\$2');
        }
        if (/^\s*\d+\.\s/.test(line)) {
          return line.replace(/^(\s*\d+)(\.)/, '$1\\$2');
        }
        return line;
      })
      .join('\n');
  }

  function richNodeName(node) {
    return String((node && (node.nodeName || node.tagName)) || '').toUpperCase();
  }

  function richAttr(node, name) {
    if (!node || typeof node.getAttribute !== 'function') return '';
    return String(node.getAttribute(name) || '');
  }

  function richChildren(node) {
    if (!node || !node.childNodes) return [];
    return Array.prototype.slice.call(node.childNodes);
  }

  function richClassContains(node, name) {
    if (node && node.classList && typeof node.classList.contains === 'function') {
      return node.classList.contains(name);
    }
    return (' ' + richAttr(node, 'class') + ' ').indexOf(' ' + name + ' ') !== -1;
  }

  function markdownFromRichInline(node) {
    if (!node) return '';
    if (node.nodeType === 3 || richNodeName(node) === '#TEXT') {
      return escapeRichMarkdownText(node.nodeValue != null ? node.nodeValue : node.textContent);
    }
    if (node.nodeType === 8) return '';
    var tag = richNodeName(node);
    if (tag === 'BR') return '\n';
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'META' || tag === 'IFRAME') return '';

    if (tag === 'IMG') {
      // Smart-card decoration is not description content.
      if (
        richClassContains(node, 'info-md-smartcard-favicon') ||
        richClassContains(node, 'info-md-smartcard-image')
      ) {
        return '';
      }
      var src = safeMarkdownHref(richAttr(node, 'src'));
      if (!src) return '';
      var alt = richAttr(node, 'alt').replace(/[\[\]]/g, '');
      return '![' + alt + '](' + src + ')';
    }

    var inner = richChildren(node).map(markdownFromRichInline).join('');
    if (tag === 'STRONG' || tag === 'B') return inner ? '**' + inner + '**' : '';
    if (tag === 'EM' || tag === 'I') return inner ? '*' + inner + '*' : '';
    if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') {
      return inner ? '~~' + inner + '~~' : '';
    }
    if (tag === 'CODE' && richNodeName(node.parentNode) !== 'PRE') {
      return inner ? '`' + inner.replace(/`/g, '\\`') + '`' : '';
    }
    if (tag === 'A') {
      var href = safeMarkdownHref(richAttr(node, 'data-smart-url') || richAttr(node, 'href'));
      if (!href) return inner;
      var mode = richAttr(node, 'data-smart-mode');
      if (mode === 'block' || mode === 'inline') {
        return '[' + href + '](' + href + ' "smartCard-' + mode + '")';
      }
      return '[' + (inner || href) + '](' + href + ')';
    }
    return inner;
  }

  function richListItemMarkdown(node, ordered) {
    var checked = null;
    var body = '';
    richChildren(node).forEach(function (child) {
      if (richNodeName(child) === 'INPUT' && richAttr(child, 'type').toLowerCase() === 'checkbox') {
        checked =
          !!child.checked ||
          richAttr(child, 'checked') === 'checked' ||
          richAttr(child, 'checked') === 'true';
        return;
      }
      if (richNodeName(child) === 'UL' || richNodeName(child) === 'OL') return;
      body += markdownFromRichInline(child);
    });
    body = body.replace(/^\s+|\s+$/g, '');
    var prefix = ordered ? '1. ' : '- ';
    if (checked !== null) prefix += checked ? '[x] ' : '[ ] ';
    return prefix + body;
  }

  function markdownFromRichBlock(node) {
    if (!node) return '';
    if (node.nodeType === 3 || richNodeName(node) === '#TEXT') {
      return escapeRichMarkdownText(node.nodeValue != null ? node.nodeValue : node.textContent);
    }
    var tag = richNodeName(node);
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'META' || tag === 'IFRAME') return '';
    if (/^H[1-6]$/.test(tag)) {
      return Array(Number(tag.charAt(1)) + 1).join('#') + ' ' + markdownFromRichInline(node);
    }
    if (tag === 'P' || tag === 'DIV') {
      return protectRichParagraphOpenings(markdownFromRichInline(node));
    }
    if (tag === 'BLOCKQUOTE') {
      return markdownFromRichInline(node)
        .split('\n')
        .map(function (line) {
          return '> ' + line;
        })
        .join('\n');
    }
    if (tag === 'PRE') {
      var code = node.textContent == null ? '' : String(node.textContent);
      return '```\n' + code.replace(/\n$/, '') + '\n```';
    }
    if (tag === 'HR') return '---';
    if (tag === 'UL' || tag === 'OL') {
      var ordered = tag === 'OL';
      return richChildren(node)
        .filter(function (child) {
          return richNodeName(child) === 'LI';
        })
        .map(function (child) {
          return richListItemMarkdown(child, ordered);
        })
        .join('\n');
    }
    return markdownFromRichInline(node);
  }

  /**
   * Convert the supported contenteditable DOM back to Trello Markdown.
   * Unknown wrappers are flattened; unsafe elements and URL schemes are dropped.
   */
  function markdownFromRichRoot(root) {
    if (!root) return '';
    return richChildren(root)
      .map(markdownFromRichBlock)
      .filter(function (part) {
        return String(part).trim().length > 0;
      })
      .join('\n\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  var MD_HEADING_PREFIX_RE = /^(#{1,6})\s+/;
  var MD_CHECKLIST_PREFIX_RE = /^(\s*)([-*+])\s+\[([ xX])\]\s+/;
  var MD_UL_PREFIX_RE = /^(\s*)([-*+])\s+(?!\[([ xX])\]\s)/;
  var MD_OL_PREFIX_RE = /^(\s*)(\d+)\.\s+/;

  function stripMarkdownLinePrefix(line) {
    var s = String(line == null ? '' : line);
    s = s.replace(MD_HEADING_PREFIX_RE, '');
    s = s.replace(MD_CHECKLIST_PREFIX_RE, '');
    s = s.replace(MD_OL_PREFIX_RE, '');
    s = s.replace(MD_UL_PREFIX_RE, '');
    return s;
  }

  function detectMarkdownLineFormat(line) {
    var s = String(line == null ? '' : line);
    var heading = /^(#{1,6})\s+/.exec(s);
    if (heading) return 'h' + heading[1].length;
    if (MD_CHECKLIST_PREFIX_RE.test(s)) return 'checklist';
    if (MD_OL_PREFIX_RE.test(s)) return 'ol';
    if (MD_UL_PREFIX_RE.test(s)) return 'ul';
    return 'normal';
  }

  /** True when flanking markers are a clean pair (avoids treating ** as italic *). */
  function markdownMarkersAreExclusive(value, start, end, open, close) {
    if (open !== '*' || close !== '*') return true;
    if (start > open.length && value.charAt(start - open.length - 1) === '*') return false;
    if (end + close.length < value.length && value.charAt(end + close.length) === '*') {
      return false;
    }
    return true;
  }

  /**
   * Wrap or unwrap a selection with inline markdown markers.
   * @returns {{ value: string, start: number, end: number }}
   */
  function wrapMarkdownInlineSelection(state, open, close) {
    close = close == null ? open : close;
    var value = String(state && state.value != null ? state.value : '');
    var start = Math.max(0, Number(state && state.start) || 0);
    var end = Math.max(start, Number(state && state.end) || 0);
    if (end > value.length) end = value.length;
    if (start > value.length) start = value.length;
    var selected = value.slice(start, end);
    var openLen = open.length;
    var closeLen = close.length;

    if (
      start >= openLen &&
      value.slice(start - openLen, start) === open &&
      value.slice(end, end + closeLen) === close &&
      markdownMarkersAreExclusive(value, start, end, open, close)
    ) {
      return {
        value: value.slice(0, start - openLen) + selected + value.slice(end + closeLen),
        start: start - openLen,
        end: end - openLen
      };
    }

    if (
      selected.length >= openLen + closeLen &&
      selected.slice(0, openLen) === open &&
      selected.slice(selected.length - closeLen) === close &&
      !(
        open === '*' &&
        close === '*' &&
        selected.length >= 4 &&
        selected.charAt(1) === '*' &&
        selected.charAt(selected.length - 2) === '*'
      )
    ) {
      var inner = selected.slice(openLen, selected.length - closeLen);
      return {
        value: value.slice(0, start) + inner + value.slice(end),
        start: start,
        end: start + inner.length
      };
    }

    return {
      value: value.slice(0, start) + open + selected + close + value.slice(end),
      start: start + openLen,
      end: start + openLen + selected.length
    };
  }

  /**
   * Turn a non-empty markdown selection into [label](url).
   * @returns {{ value: string, start: number, end: number } | null}
   */
  function linkMarkdownSelection(state, url) {
    var href = normalizePasteableMarkdownUrl(url) || safeMarkdownHref(url);
    if (!href) return null;
    var value = String(state && state.value != null ? state.value : '');
    var start = Math.max(0, Number(state && state.start) || 0);
    var end = Math.max(start, Number(state && state.end) || 0);
    if (end > value.length) end = value.length;
    if (start > value.length) start = value.length;
    if (start === end) return null;
    var label = value.slice(start, end).replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    var insertion = '[' + label + '](' + href + ')';
    return {
      value: value.slice(0, start) + insertion + value.slice(end),
      start: start + 1,
      end: start + 1 + label.length
    };
  }

  /**
   * Apply a block-level markdown format to the lines covering the selection.
   * kind: normal | h1..h6 | checklist | ul | ol
   * @returns {{ value: string, start: number, end: number }}
   */
  function applyMarkdownBlockFormat(state, kind) {
    var value = String(state && state.value != null ? state.value : '');
    var start = Math.max(0, Number(state && state.start) || 0);
    var end = Math.max(start, Number(state && state.end) || 0);
    if (end > value.length) end = value.length;
    if (start > value.length) start = value.length;

    var blockStart = value.lastIndexOf('\n', start - 1) + 1;
    var blockEnd = value.indexOf('\n', end);
    if (blockEnd === -1) blockEnd = value.length;

    var block = value.slice(blockStart, blockEnd);
    var lines = block.length ? block.split('\n') : [''];
    var target = String(kind || 'normal');

    var nonEmpty = lines.filter(function (line) {
      return String(line).trim().length > 0;
    });
    var allMatch =
      nonEmpty.length > 0 &&
      nonEmpty.every(function (line) {
        return detectMarkdownLineFormat(line) === target;
      });

    var nextLines = lines.map(function (line) {
      var body = stripMarkdownLinePrefix(line);
      if (allMatch && target !== 'normal') {
        return body;
      }
      if (target === 'normal') return body;
      if (/^h[1-6]$/.test(target)) {
        var level = Number(target.charAt(1));
        return Array(level + 1).join('#') + ' ' + body;
      }
      if (target === 'checklist') return '- [ ] ' + body;
      if (target === 'ul') return '- ' + body;
      if (target === 'ol') return '1. ' + body;
      return line;
    });

    var nextBlock = nextLines.join('\n');
    var nextValue = value.slice(0, blockStart) + nextBlock + value.slice(blockEnd);
    return {
      value: nextValue,
      start: blockStart,
      end: blockStart + nextBlock.length
    };
  }

  function applyMarkdownEditToTextarea(textarea, next) {
    if (!textarea || !next) return;
    textarea.value = next.value;
    try {
      textarea.setSelectionRange(next.start, next.end);
    } catch (e) {
      /* ignore */
    }
    if (typeof InputEvent === 'function') {
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
    } else {
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function syncExpandableSurfaceHeight(el, options) {
    if (!el) return;
    options = options || {};
    var maxHeight =
      typeof options.maxHeight === 'number' ? options.maxHeight : INFO_DESC_MAX_HEIGHT_PX;
    var minHeight =
      typeof options.minHeight === 'number' ? options.minHeight : INFO_DESC_MIN_HEIGHT_PX;
    el.style.overflowY = 'hidden';
    el.style.height = 'auto';
    var next = Math.max(el.scrollHeight, minHeight);
    if (next > maxHeight) {
      el.style.height = maxHeight + 'px';
      el.style.overflowY = 'auto';
    } else {
      el.style.height = next + 'px';
      el.style.overflowY = 'hidden';
    }
  }

  var KEYWORDS = {
    time: 'Pression relative : blocages, dépendances et risque si repoussée.',
    blocking: 'Effet sur l\'équipe : blocages, dépendances et ralentissement du travail.',
    impact: 'Port\u00e9e de l\'action : Personnel \u2192 \u00c9quipe \u2192 Interne \u2192 Population \u2192 Global.',
    ease: 'Coût d\'exécution : complexité, ressources, difficulté, confiance et réversibilité.',
    urgency: 'Niveau d\'urgence : blocages, dépendances et risque si repoussée.'
  };

  var QUESTIONS = {
    time: 'Quelle pression pèse sur cette tâche?',
    blocking: 'Est-ce que quelque chose cesse de fonctionner si ce n\'est pas fait?',
    impact: 'Quelle est la port\u00e9e de cette action?',
    ease: 'À quel point est-il facile de faire cette tâche?',
    urgency: 'À quel point est-ce urgent de faire cette tâche?'
  };

  function dimensionQuestion(key) {
    var entry = LABELS[key];
    if (entry && entry.popup && entry.popup.subtitle) return entry.popup.subtitle;
    return QUESTIONS[key] || '';
  }

  var PROPERTY_ICONS = {
    time: 'ti-clock',
    blocking: 'ti-barrier-block',
    impact: 'ti-target-arrow',
    ease: 'ti-gauge',
    urgency: 'ti-flame'
  };

  // Perceptual color helpers (OKLab / OKLCH) for scheme ramps and badge matching.
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(c) {
    var v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(1, v));
  }

  function rgbToOklab(rgb) {
    var r = srgbToLinear(rgb.r);
    var g = srgbToLinear(rgb.g);
    var b = srgbToLinear(rgb.b);
    var l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    var m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    var s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    var l_ = Math.cbrt(l);
    var m_ = Math.cbrt(m);
    var s_ = Math.cbrt(s);
    return {
      L: 0.2104542553 * l_ + 0.7936177750 * m_ - 0.0040720468 * s_,
      a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
      b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    };
  }

  function oklabToRgb(oklab) {
    var l_ = oklab.L + 0.3963377774 * oklab.a + 0.2158037573 * oklab.b;
    var m_ = oklab.L - 0.1055613458 * oklab.a - 0.0638541728 * oklab.b;
    var s_ = oklab.L - 0.0894841775 * oklab.a - 1.2914855480 * oklab.b;
    var l = l_ * l_ * l_;
    var m = m_ * m_ * m_;
    var s = s_ * s_ * s_;
    var r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    var b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    return {
      r: Math.round(linearToSrgb(r) * 255),
      g: Math.round(linearToSrgb(g) * 255),
      b: Math.round(linearToSrgb(b) * 255)
    };
  }

  function oklchToOklab(L, C, H) {
    var hr = H * Math.PI / 180;
    return { L: L, a: C * Math.cos(hr), b: C * Math.sin(hr) };
  }

  function oklchStopsToOklab(oklchStops) {
    return oklchStops.map(function (stop) {
      return oklchToOklab(stop[0], stop[1], stop[2]);
    });
  }

  function oklchStopsToHex(oklchStops) {
    return oklchStopsToOklab(oklchStops).map(function (lab) {
      return priorityRgbToHex(oklabToRgb(lab));
    });
  }

  function lerpOklab(a, b, t) {
    return {
      L: a.L + (b.L - a.L) * t,
      a: a.a + (b.a - a.a) * t,
      b: a.b + (b.b - a.b) * t
    };
  }

  function oklabDistance(a, b) {
    var dL = a.L - b.L;
    var da = a.a - b.a;
    var db = a.b - b.b;
    return dL * dL + da * da + db * db;
  }

  function schemeTextOnLight(stops) {
    var darkest = stops[stops.length - 1];
    return priorityRelativeLuminance(priorityParseHex(darkest)) > 0.45 ? '#172B4D' : darkest;
  }

  function buildColorScheme(key, label, oklchStops, badgeColors) {
    var stops = oklchStopsToHex(oklchStops);
    return {
      key: key,
      label: label,
      oklchStops: oklchStops,
      oklabStops: oklchStopsToOklab(oklchStops),
      stops: stops,
      textOnLight: schemeTextOnLight(stops),
      badgeColors: badgeColors || null
    };
  }

  // Exact hex ramps (low → high priority). Classic restored from 4044ae3 / pre-multi-scheme era.
  function buildColorSchemeFromHex(key, label, hexStops, textOnLight, badgeColors) {
    var stops = hexStops.slice();
    var oklabStops = stops.map(function (hex) {
      return rgbToOklab(priorityParseHex(hex));
    });
    return {
      key: key,
      label: label,
      oklchStops: null,
      oklabStops: oklabStops,
      stops: stops,
      textOnLight: textOnLight || schemeTextOnLight(stops),
      badgeColors: badgeColors || null
    };
  }

  // Classic blue intensity map (tiers 0..6) — restored from single-palette era.
  var CLASSIC_TIER_TRELLO_BADGE_COLORS = {
    0: 'blue',
    1: 'blue',
    2: 'sky',
    3: 'sky',
    4: 'sky',
    5: TRELLO_BADGE_COLOR_MUTED,
    6: TRELLO_BADGE_COLOR_MUTED
  };

  // Feu: polychrome Trello colors (gray → yellow → orange → blue → red).
  var FIRE_TIER_TRELLO_BADGE_COLORS = {
    0: 'red',
    1: 'orange',
    2: 'yellow',
    3: 'blue',
    4: 'sky',
    5: TRELLO_BADGE_COLOR_MUTED,
    6: TRELLO_BADGE_COLOR_MUTED
  };

  // Exactly two schemes: Classique (default) + Feu.
  var COLOR_SCHEMES = {
    blue: buildColorSchemeFromHex(
      'blue',
      'Classique',
      ['#E6F1FB', '#B5D4F4', '#85B7EB', '#378ADD', '#0C447C'],
      '#0C447C',
      CLASSIC_TIER_TRELLO_BADGE_COLORS
    ),
    fire: buildColorSchemeFromHex(
      'fire',
      'Feu',
      ['#E8EAED', '#F5E49A', '#FF9F1A', '#0079BF', '#EB5A46'],
      '#172B4D',
      FIRE_TIER_TRELLO_BADGE_COLORS
    )
  };

  var COLOR_SCHEME_OPTIONS = [
    { key: 'blue', label: COLOR_SCHEMES.blue.label, icon: 'ti-droplet' },
    { key: 'fire', label: COLOR_SCHEMES.fire.label, icon: 'ti-flame' }
  ];

  var activeColorSchemeKey = DEFAULT_COLOR_SCHEME_KEY;
  var activeColorStops = COLOR_SCHEMES.blue.stops.slice();
  var activeOklabStops = COLOR_SCHEMES.blue.oklabStops.slice();
  var activeTextOnLight = COLOR_SCHEMES.blue.textOnLight;
  var PRIORITY_TEXT_ON_DARK = '#ffffff';
  // Backward-compatible alias for the default classic palette.
  var PRIORITY_BLUE_STOPS = COLOR_SCHEMES.blue.stops;

  // Trello card badges accept named colors only — map tier seg colors to the nearest.
  var TRELLO_BADGE_COLOR_HEX = {
    blue: '#0079BF',
    green: '#61BD4F',
    orange: '#FF9F1A',
    red: '#EB5A46',
    yellow: '#F2D600',
    purple: '#C377E0',
    pink: '#FF78CB',
    sky: '#00C2E0',
    lime: '#51E898'
  };
  TRELLO_BADGE_COLOR_HEX[TRELLO_BADGE_COLOR_MUTED] = '#B3BAC5';
  var TRELLO_BADGE_COLOR_NAMES = Object.keys(TRELLO_BADGE_COLOR_HEX);

  function defaultTierTrelloBadgeColors() {
    return Object.assign({}, CLASSIC_TIER_TRELLO_BADGE_COLORS);
  }
  var TIER_TRELLO_BADGE_COLORS = defaultTierTrelloBadgeColors();

  function nearestTrelloBadgeColorName(segHex, avoidName) {
    var target = rgbToOklab(priorityParseHex(segHex));
    var ranked = TRELLO_BADGE_COLOR_NAMES.map(function (name) {
      return {
        name: name,
        dist: oklabDistance(target, rgbToOklab(priorityParseHex(TRELLO_BADGE_COLOR_HEX[name])))
      };
    }).sort(function (a, b) {
      return a.dist - b.dist;
    });
    for (var i = 0; i < ranked.length; i++) {
      if (!avoidName || ranked[i].name !== avoidName) return ranked[i].name;
    }
    return ranked[0].name;
  }

  function copyTierBadgeColors(source) {
    var out = {};
    for (var i = 0; i <= TIER_I_MAX; i++) {
      out[i] = source[i] || TRELLO_BADGE_COLOR_MUTED;
    }
    return out;
  }

  function rebuildTrelloBadgeColors() {
    var scheme = COLOR_SCHEMES[activeColorSchemeKey];
    if (scheme && scheme.badgeColors) {
      TIER_TRELLO_BADGE_COLORS = copyTierBadgeColors(scheme.badgeColors);
      return;
    }
    if (!TIER_TRELLO_BADGE_COLORS || typeof TIER_TRELLO_BADGE_COLORS !== 'object') {
      TIER_TRELLO_BADGE_COLORS = defaultTierTrelloBadgeColors();
    }
    for (var i = 0; i <= TIER_I_SCHEME_MAPPED_MAX; i++) {
      var tier = TIERS[i];
      var avoid = i > 0 ? TIER_TRELLO_BADGE_COLORS[i - 1] : null;
      TIER_TRELLO_BADGE_COLORS[i] = nearestTrelloBadgeColorName(
        tier && tier.seg ? tier.seg : activeColorStops[0],
        avoid
      );
    }
    for (var j = TIER_I_SCHEME_MAPPED_MAX + 1; j <= TIER_I_MAX; j++) {
      TIER_TRELLO_BADGE_COLORS[j] = TRELLO_BADGE_COLOR_MUTED;
    }
  }

  function priorityParseHex(hex) {
    var h = String(hex).replace('#', '');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function priorityRgbToHex(rgb) {
    function byte(n) {
      var s = Math.max(0, Math.min(255, Math.round(n))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return '#' + byte(rgb.r) + byte(rgb.g) + byte(rgb.b);
  }

  function priorityLerpRgb(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t
    };
  }

  function priorityStopTForScore(score) {
    return Math.max(0, Math.min(activeColorStops.length - 1,
      (score / SCORE_MAX) * (activeColorStops.length - 1)));
  }

  function priorityStopTForTierIndex(tierI) {
    return Math.max(0, Math.min(activeColorStops.length - 1,
      ((TIER_I_MAX - tierI) / TIER_I_MAX) * (activeColorStops.length - 1)));
  }

  function priorityRgbAtStopT(stopT) {
    var maxIdx = activeOklabStops.length - 1;
    stopT = Math.max(0, Math.min(maxIdx, stopT));
    var lo = Math.floor(stopT);
    var hi = Math.min(lo + 1, maxIdx);
    var t = stopT - lo;
    return oklabToRgb(lerpOklab(activeOklabStops[lo], activeOklabStops[hi], t));
  }

  function priorityHexAtStopT(stopT) {
    return priorityRgbToHex(priorityRgbAtStopT(stopT));
  }

  function priorityFillAtStopT(stopT) {
    return priorityRgbToHex(priorityLerpRgb(priorityRgbAtStopT(stopT), { r: 255, g: 255, b: 255 }, 0.88));
  }

  function priorityRelativeLuminance(rgb) {
    function chan(c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
  }

  function priorityTextForFillHex(fillHex) {
    return priorityRelativeLuminance(priorityParseHex(fillHex)) > 0.72
      ? activeTextOnLight
      : PRIORITY_TEXT_ON_DARK;
  }

  function priorityTierLightStyles(tierI) {
    var stopT = priorityStopTForTierIndex(tierI);
    var fill = priorityFillAtStopT(stopT);
    return {
      seg: priorityHexAtStopT(stopT),
      fill: fill,
      text: priorityTextForFillHex(fill)
    };
  }

  function priorityTierDarkStyles(tierI) {
    var stopT = priorityStopTForTierIndex(tierI);
    var segRgb = priorityRgbAtStopT(stopT);
    var seg = priorityRgbToHex(priorityLerpRgb(segRgb, { r: 255, g: 255, b: 255 }, 0.28));
    var base = { r: 26, g: 37, b: 51 };
    return {
      seg: seg,
      fill: priorityRgbToHex(priorityLerpRgb(base, segRgb, 0.38)),
      text: PRIORITY_TEXT_ON_DARK,
      tint: priorityRgbToHex(priorityLerpRgb({ r: 20, g: 32, b: 48 }, segRgb, 0.42))
    };
  }

  function priorityStylesForScore(score) {
    var stopT = priorityStopTForScore(score);
    var fill = priorityFillAtStopT(stopT);
    return {
      seg: priorityHexAtStopT(stopT),
      fill: fill,
      text: priorityTextForFillHex(fill)
    };
  }

  var TIER_DEFS = [
    {
      min: 8.6, label: 'Critique', i: TIER_I.CRITIQUE,
      title: 'T\u00e2che prioritaire absolue',
      description: 'Impact direct sur l\'objectif, impossible de repousser sans cons\u00e9quences majeures.'
    },
    {
      min: 7.2, label: 'Urgente', i: TIER_I.URGENTE,
      title: 'T\u00e2che pressante',
      description: 'Priorit\u00e9 absolue. Action rapide sous forte pression.'
    },
    {
      min: 5.8, label: 'Prioritaire', i: TIER_I.PRIORITAIRE,
      title: 'Attention prioritaire',
      description: '\u00c0 traiter en t\u00eate de file.'
    },
    {
      min: 4.3, label: 'Importante', i: TIER_I.IMPORTANTE,
      title: 'Planifi\u00e9e',
      description: '\u00c0 ex\u00e9cuter avec engagement clair dans le backlog.'
    },
    {
      min: 2.9, label: 'Flexible', i: TIER_I.FLEXIBLE,
      title: 'Sans urgence ni blocage',
      description: '\u00c0 traiter selon l\'opportunit\u00e9, peut glisser.'
    },
    {
      min: 1.4, label: 'Secondaire', i: TIER_I.SECONDAIRE,
      title: 'Utile mais non essentielle',
      description: '\u00c0 envisager quand la bande passante le permet.'
    },
    {
      min: 0, label: 'Optionnelle', i: TIER_I.OPTIONNELLE,
      title: 'Facultative',
      description: 'Sans cons\u00e9quence si ignor\u00e9e. Peut \u00eatre \u00e9cart\u00e9e de la file.'
    }
  ];

  var TIERS = [];
  var TIERS_DARK = [];

  function rebuildTiersFromScheme() {
    TIERS.length = 0;
    TIERS_DARK.length = 0;
    TIER_DEFS.forEach(function (def) {
      var styles = priorityTierLightStyles(def.i);
      TIERS.push({
        min: def.min,
        label: def.label,
        i: def.i,
        title: def.title,
        description: def.description,
        fill: styles.fill,
        text: styles.text,
        seg: styles.seg
      });
      var darkStyles = priorityTierDarkStyles(def.i);
      TIERS_DARK.push({
        i: def.i,
        fill: darkStyles.fill,
        text: darkStyles.text,
        seg: darkStyles.seg,
        tint: darkStyles.tint
      });
    });
  }

  var HEAT_SEGMENT_DEFS = [
    { i: TIER_I.OPTIONNELLE, target: 0.7, preset: { urgency: 0, impact: 0, ease: 2 } },
    { i: TIER_I.SECONDAIRE, target: 2.1, preset: { urgency: 1, impact: 1, ease: 2 } },
    { i: TIER_I.FLEXIBLE, target: 3.6, preset: { urgency: 1, impact: 2, ease: 3 } },
    { i: TIER_I.IMPORTANTE, target: 5.0, preset: { urgency: 2, impact: 2, ease: 3 } },
    { i: TIER_I.PRIORITAIRE, target: 6.5, preset: { urgency: 2, impact: 3, ease: 3 } },
    { i: TIER_I.URGENTE, target: 7.9, preset: { urgency: 3, impact: 3, ease: 2 } },
    { i: TIER_I.CRITIQUE, target: 9.3, preset: { urgency: 4, impact: 4, ease: 5 } }
  ];

  var HEAT_SEGMENTS = [];

  function rebuildHeatSegments() {
    HEAT_SEGMENTS.length = 0;
    HEAT_SEGMENT_DEFS.forEach(function (def) {
      var tierDef = TIER_DEFS[def.i];
      var tier = TIERS[def.i] || TIERS[TIER_I_MAX];
      HEAT_SEGMENTS.push({
        i: def.i,
        target: def.target,
        color: tier.seg,
        label: tierDef.label,
        title: tierDef.title,
        description: tierDef.description,
        preset: def.preset
      });
    });
  }

  var SCORE_COLOR_STOPS = [];

  function scoreColorStopValues() {
    var scores = [0];
    for (var i = TIER_DEFS.length - 1; i >= 0; i--) {
      if (TIER_DEFS[i].min > 0) scores.push(TIER_DEFS[i].min);
    }
    for (var h = 0; h < HEAT_SEGMENT_DEFS.length; h++) {
      if (HEAT_SEGMENT_DEFS[h].i === TIER_I.CRITIQUE) {
        scores.push(HEAT_SEGMENT_DEFS[h].target);
        break;
      }
    }
    scores.push(SCORE_MAX);
    return scores;
  }

  function rebuildScoreColorStops() {
    SCORE_COLOR_STOPS.length = 0;
    scoreColorStopValues().forEach(function (s) {
      var rgb = priorityRgbAtStopT(priorityStopTForScore(s));
      SCORE_COLOR_STOPS.push({ s: s, r: rgb.r, g: rgb.g, b: rgb.b });
    });
  }

  function rebuildColorDerivedState() {
    rebuildTiersFromScheme();
    rebuildHeatSegments();
    rebuildScoreColorStops();
    try {
      rebuildTrelloBadgeColors();
    } catch (e) {
      console.error('PriorityUI: rebuildTrelloBadgeColors failed', e);
    }
  }

  function normalizeColorSchemeKey(key) {
    // Retired Tableau key → Feu; other unknown keys fall back to Classique.
    if (key === 'board') return 'fire';
    return COLOR_SCHEMES[key] ? key : DEFAULT_COLOR_SCHEME_KEY;
  }

  function applyColorScheme(schemeKey) {
    var key = normalizeColorSchemeKey(schemeKey);
    var scheme = COLOR_SCHEMES[key];
    activeColorSchemeKey = key;
    activeColorStops = scheme.stops.slice();
    activeOklabStops = scheme.oklabStops.slice();
    activeTextOnLight = scheme.textOnLight;
    rebuildColorDerivedState();
    return key;
  }

  function getActiveColorSchemeKey() {
    return activeColorSchemeKey;
  }

  function loadStoredColorSchemeKey() {
    try {
      if (typeof localStorage === 'undefined') return null;
      var raw = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
      if (!raw) return null;
      return normalizeColorSchemeKey(raw);
    } catch (e) { return null; }
  }

  function saveStoredColorSchemeKey(key) {
    try {
      if (typeof localStorage === 'undefined') return;
      if (!COLOR_SCHEMES[key]) return;
      localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, key);
    } catch (e) { /* ignore quota / private mode */ }
  }

  try {
    applyColorScheme(DEFAULT_COLOR_SCHEME_KEY);
  } catch (e) {
    console.error('PriorityUI: initial color scheme failed', e);
  }

  var TIER_LABEL_SHORT = {
    Critique: 'Crit',
    Urgente: 'Urg',
    Urgent: 'Urg',
    Prioritaire: 'Prio',
    Importante: 'Imp',
    Important: 'Imp',
    Flexible: 'Flex',
    Secondaire: 'Sec',
    Optionnelle: 'Opt',
    Optionnel: 'Opt'
  };

  function shortTierLabel(label) {
    if (!label) return '';
    if (Object.prototype.hasOwnProperty.call(TIER_LABEL_SHORT, label)) {
      return TIER_LABEL_SHORT[label];
    }
    // Keep countdown / parenthetical suffix when shortening (e.g. heat badge preview).
    var suffixMatch = /^(.+?)(\s*\([^)]*\))$/.exec(label);
    if (
      suffixMatch &&
      Object.prototype.hasOwnProperty.call(TIER_LABEL_SHORT, suffixMatch[1])
    ) {
      return TIER_LABEL_SHORT[suffixMatch[1]] + suffixMatch[2];
    }
    return label;
  }

  function tierLabelForSpace(label, useShort) {
    if (!label) return '';
    return useShort ? shortTierLabel(label) : label;
  }

  function elementLabelOverflows(el, slackPx) {
    var slack = slackPx || 0;
    return el.scrollWidth > el.clientWidth + 1 + slack;
  }

  function createResponsiveTierLabelGroup(config) {
    var container = config.container;
    var targets = config.targets || [];
    var useShort = false;
    var hysteresisPx = config.hysteresisPx != null ? config.hysteresisPx : 12;
    var debounceMs = config.debounceMs != null ? config.debounceMs : 120;
    var debounceTimer = null;
    var roSuspended = false;

    function applyMode(short) {
      useShort = short;
      if (container) container.classList.toggle('is-short', short);
      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        var full = typeof t.getFullLabel === 'function' ? t.getFullLabel() : t.fullLabel;
        var text = tierLabelForSpace(full, short);
        if (t.el.textContent !== text) t.el.textContent = text;
        if (t.ariaWhenShort) {
          if (short && full) t.el.setAttribute('aria-label', full);
          else t.el.removeAttribute('aria-label');
        }
      }
    }

    function anyTargetOverflows(slackPx) {
      for (var i = 0; i < targets.length; i++) {
        if (elementLabelOverflows(targets[i].el, slackPx)) return true;
      }
      if (container && elementLabelOverflows(container, slackPx)) return true;
      return false;
    }

    // Remeasure short/long with hysteresis so paint + ResizeObserver do not thrash
    // near the overflow boundary while sliders drag.
    function measureAndApply() {
      if (useShort) {
        applyMode(false);
        if (anyTargetOverflows(hysteresisPx)) applyMode(true);
      } else {
        applyMode(false);
        if (anyTargetOverflows(0)) applyMode(true);
      }
    }

    function syncNow() {
      measureAndApply();
    }

    function scheduleSync() {
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        debounceTimer = null;
        measureAndApply();
      }, debounceMs);
    }

    // Keep current short/long mode; only refresh strings. Defers mode flips.
    function refreshLabels() {
      applyMode(useShort);
      scheduleSync();
    }

    var ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(function () {
        if (roSuspended) return;
        scheduleSync();
      });
      if (container) ro.observe(container);
      for (var j = 0; j < targets.length; j++) ro.observe(targets[j].el);
    } else if (typeof window !== 'undefined' && window.matchMedia) {
      var mq = window.matchMedia('(max-width: 360px)');
      function mqSync() {
        applyMode(mq.matches);
      }
      if (mq.addEventListener) mq.addEventListener('change', mqSync);
      else mq.addListener(mqSync);
      mqSync();
    } else {
      syncNow();
    }

    return {
      refresh: refreshLabels,
      refreshNow: syncNow,
      isShort: function () { return useShort; },
      labelFor: function (full) { return tierLabelForSpace(full, useShort); },
      setSuspended: function (suspended) { roSuspended = !!suspended; },
      disconnect: function () {
        if (debounceTimer != null) clearTimeout(debounceTimer);
        if (ro) ro.disconnect();
      }
    };
  }

  function scoreToRgb(score) {
    score = Math.max(0, Math.min(10, score));
    var hi = SCORE_COLOR_STOPS.length - 1;
    for (var k = 0; k < SCORE_COLOR_STOPS.length - 1; k++) {
      if (score <= SCORE_COLOR_STOPS[k + 1].s) {
        hi = k + 1;
        break;
      }
    }
    var lo = hi - 1;
    var a = SCORE_COLOR_STOPS[lo];
    var b = SCORE_COLOR_STOPS[hi];
    var span = b.s - a.s;
    var t = span > 1e-9 ? (score - a.s) / span : 0;
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t)
    };
  }

  function scoreToRgba(score, alpha) {
    var rgb = scoreToRgb(score);
    return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
  }

  var SCORE_SURFACE_ALPHA = 0.78;

  var URGENCY_TO_TB = [
    { T: 0, B: 0 },
    { T: 1, B: 0 },
    { T: 2, B: 1 },
    { T: 3, B: 2 },
    { T: 4, B: 3 }
  ];

  var SLIDER_STEP = 0.05;
  var SLIDER_ANIM_MS = 350;
  var SLIDER_STORAGE_KEY = 'trello-priority-powerup/slider-values';

  /** @returns {{ priority?: boolean, graph?: boolean, due?: boolean, progress?: boolean, blocked?: boolean }}
   *  Values are expanded (true) vs collapsed (false). Missing keys mean "use default". */
  function loadSectionCollapseState() {
    try {
      if (typeof localStorage === 'undefined') return {};
      var raw = localStorage.getItem(SECTION_COLLAPSE_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      var out = {};
      SECTION_COLLAPSE_KEYS.forEach(function (key) {
        if (typeof parsed[key] === 'boolean') out[key] = parsed[key];
      });
      return out;
    } catch (e) {
      return {};
    }
  }

  function saveSectionCollapseState(patch) {
    try {
      if (typeof localStorage === 'undefined') return;
      if (!patch || typeof patch !== 'object') return;
      var next = Object.assign({}, loadSectionCollapseState());
      SECTION_COLLAPSE_KEYS.forEach(function (key) {
        if (typeof patch[key] === 'boolean') next[key] = patch[key];
      });
      localStorage.setItem(SECTION_COLLAPSE_STORAGE_KEY, JSON.stringify(next));
    } catch (e) { /* ignore quota / private mode */ }
  }

  function resolveSectionExpanded(key, fallback) {
    var stored = loadSectionCollapseState();
    if (Object.prototype.hasOwnProperty.call(stored, key)) return !!stored[key];
    return !!fallback;
  }

  function loadStatutEmbeddedDetailsExpanded() {
    try {
      if (typeof localStorage === 'undefined') return true;
      var raw = localStorage.getItem(STATUT_EMBEDDED_DETAILS_STORAGE_KEY);
      if (raw === '0' || raw === 'false') return false;
      if (raw === '1' || raw === 'true') return true;
      return true;
    } catch (e) {
      return true;
    }
  }

  function saveStatutEmbeddedDetailsExpanded(expanded) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(
        STATUT_EMBEDDED_DETAILS_STORAGE_KEY,
        expanded ? '1' : '0'
      );
    } catch (e) { /* ignore quota / private mode */ }
  }
  var INUTILE_EPS = 0.05;
  var INUTILE_LABEL = 'Inutile';
  var INUTILE_STYLES = {
    label: INUTILE_LABEL,
    fill: '#F1EFE8',
    text: '#9B9890',
    seg: '#9B9890',
    tint: '#F1EFE8',
    title: 'Sans valeur ni urgence',
    description: 'Trop complexe ou impossible \u00e0 r\u00e9aliser.'
  };

  var INUTILE_STYLES_DARK = {
    label: INUTILE_LABEL,
    fill: '#323940',
    text: '#ffffff',
    seg: '#8c9bab',
    tint: '#323940',
    description: INUTILE_STYLES.description
  };

  var BLOCKED_SYMBOL = '\u2298'; // ⊘
  var BLOCKED_LABEL = 'Bloqu\u00e9';
  var BLOCKED_DISPLAY = BLOCKED_SYMBOL + ' ' + BLOCKED_LABEL;
  var BLOCKED_REASON_PLACEHOLDER = 'Pr\u00e9ciser la raison du blocage\u2026';
  var BLOCKED_REASON_SUGGESTIONS_LABEL = 'Suggestions';
  var BLOCKED_REASON_CLEAR_LABEL = 'Effacer la cause';
  var BLOCKED_REASON_EDIT_LABEL = 'Modifier la cause';
  var BLOCKED_REASON_DONE_LABEL = 'Valider la cause';
  var BLOCKED_REASON_WAITING_OTHER_TASK = 'En attente d\'une autre t\u00e2che';
  var BLOCKED_LINK_TYPE_SUBTASK = 'subtask';
  var BLOCKED_SUBTASK_PICKER_LABEL = 'T\u00e2ches bloquantes';
  var BLOCKED_SUBTASK_EMPTY = 'Aucune sous-t\u00e2che';
  var BLOCKED_SUBTASK_CLEAR_LABEL = 'Retirer le lien vers la t\u00e2che';
  var BLOCKED_SUBTASK_FALLBACK_LABEL = 'T\u00e2che inconnue';
  var BLOCKED_WAITING_ON_PREFIX = 'En attente de';
  var BLOCKED_REASON_FREQ_STORAGE_KEY = 'trello-priority-powerup/blocked-reason-freq';
  var BLOCKED_REASON_EMPTY_SUGGESTION_CAP = 6;
  /** Max suggestions shown while filtering/searching in the Bloqué reason input. */
  var BLOCKED_REASON_FILTER_SUGGESTION_CAP = 4;
  /** Core presets shown in the empty-state suggestion set (with frequent reasons). */
  var BLOCKED_REASON_CORE_PRESETS = [
    'En attente d\'une r\u00e9ponse',
    'En attente de budget',
    'En attente d\'une approbation',
    'Bloqu\u00e9 \u00e0 cause de la disponibilit\u00e9 du mat\u00e9riel',
    BLOCKED_REASON_WAITING_OTHER_TASK,
    'En attente de quelqu\'un',
    'Autre'
  ];
  /** Full French workplace blocker dictionary (includes core presets). */
  var BLOCKED_REASON_OPTIONS = [
    'En attente d\'une r\u00e9ponse',
    'En attente d\'un retour client',
    'En attente d\'un retour interne',
    'En attente d\'informations',
    'En attente de pr\u00e9cisions',
    'En attente d\'une clarification',
    'En attente d\'un email',
    'En attente d\'une r\u00e9union',
    'En attente de feedback',
    'En attente de budget',
    'En attente de devis',
    'En attente de validation budg\u00e9taire',
    'Budget insuffisant',
    'En attente de commande',
    'En attente d\'une approbation',
    'En attente de validation',
    'En attente de signature',
    'En attente de d\u00e9cision',
    'En attente de validation manager',
    'En attente de validation juridique',
    'En attente de validation RH',
    'En attente de validation s\u00e9curit\u00e9',
    'En attente du client',
    'En attente de brief client',
    'En attente de contenus client',
    'Client indisponible',
    'Bloqu\u00e9 \u00e0 cause de la disponibilit\u00e9 du mat\u00e9riel',
    'En attente de mat\u00e9riel',
    BLOCKED_REASON_WAITING_OTHER_TASK,
    'En attente de quelqu\'un',
    'En attente d\'un livrable',
    'En attente d\'un fournisseur',
    'En attente d\'un partenaire',
    'D\u00e9pendance externe',
    'D\u00e9pendance technique',
    'Probl\u00e8me technique',
    'Incident en cours',
    'En attente de correctif',
    'Environnement indisponible',
    'En attente d\'acc\u00e8s technique',
    'En attente d\'infrastructure',
    'En attente d\'acc\u00e8s',
    'Droits manquants',
    'Compte non provisionn\u00e9',
    'Identifiants manquants',
    'Acc\u00e8s r\u00e9seau / VPN',
    'En attente de revue de code',
    'En attente de relecture',
    'En attente de QA',
    'En attente de tests',
    'En attente d\'UAT',
    'En attente de d\u00e9ploiement',
    'Fen\u00eatre de d\u00e9ploiement',
    'En attente de mise en production',
    'Freeze de release',
    'En attente RH',
    'En attente juridique',
    'En attente de conformit\u00e9',
    'En attente de contrat',
    'En attente de NDA',
    'Manque de ressources',
    'Charge trop \u00e9lev\u00e9e',
    'Priorit\u00e9 conflictuelle',
    'En attente de design',
    'En attente de maquette',
    'En attente de documentation',
    'Donn\u00e9es manquantes',
    'En attente de migration',
    'Bloqu\u00e9 par un tiers',
    'Autre'
  ];
  var BLOCKED_DESCRIPTION =
    'T\u00e2che bloqu\u00e9e en attente de quelqu\'un, d\'une autre t\u00e2che, d\'un approbation, de mat\u00e9riel, etc.';

  /** Any non-empty trimmed string is allowed (presets + custom freeform). */
  function isValidBlockedReason(reason) {
    return typeof reason === 'string' && reason.trim().length > 0;
  }

  function normalizeBlockedReason(reason) {
    if (typeof reason !== 'string') return '';
    var trimmed = reason.trim();
    return trimmed || '';
  }

  function blockedReasonStorageKey(reason) {
    return normalizeBlockedReason(reason).toLocaleLowerCase('fr-FR');
  }

  function loadBlockedReasonFreq() {
    try {
      if (typeof localStorage === 'undefined') return {};
      var raw = localStorage.getItem(BLOCKED_REASON_FREQ_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      var out = Object.create(null);
      Object.keys(parsed).forEach(function (key) {
        var count = parsed[key];
        if (typeof count !== 'number' || !(count > 0) || !isFinite(count)) return;
        var label = normalizeBlockedReason(key);
        if (!label) return;
        out[blockedReasonStorageKey(label)] = {
          label: label,
          count: Math.floor(count)
        };
      });
      return out;
    } catch (err) {
      return {};
    }
  }

  function saveBlockedReasonFreq(map) {
    try {
      if (typeof localStorage === 'undefined') return;
      var payload = {};
      Object.keys(map || {}).forEach(function (key) {
        var entry = map[key];
        if (!entry || !entry.label || !(entry.count > 0)) return;
        payload[entry.label] = entry.count;
      });
      localStorage.setItem(BLOCKED_REASON_FREQ_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      /* ignore quota / private mode */
    }
  }

  function bumpBlockedReasonFreq(reason) {
    var label = normalizeBlockedReason(reason);
    if (!label) return;
    var key = blockedReasonStorageKey(label);
    var map = loadBlockedReasonFreq();
    var prev = map[key];
    map[key] = {
      label: prev && prev.label ? prev.label : label,
      count: (prev && prev.count ? prev.count : 0) + 1
    };
    saveBlockedReasonFreq(map);
  }

  function blockedReasonFreqCount(reason, freqMap) {
    var entry = freqMap && freqMap[blockedReasonStorageKey(reason)];
    return entry && entry.count > 0 ? entry.count : 0;
  }

  function compareBlockedReasonSuggestions(a, b, freqMap) {
    var fa = blockedReasonFreqCount(a, freqMap);
    var fb = blockedReasonFreqCount(b, freqMap);
    if (fb !== fa) return fb - fa;
    return String(a).localeCompare(String(b), 'fr-FR', { sensitivity: 'base' });
  }

  /**
   * Build ranked suggestion labels.
   * - Empty input: unused by UI (suggestions stay hidden until typing); still
   *   returns top frequent ∪ core presets when called with no query.
   * - Typing: dictionary ∪ frequent customs matching substring, excluding selected
   *   (capped at BLOCKED_REASON_FILTER_SUGGESTION_CAP after ranking).
   */
  function rankBlockedReasonSuggestions(options) {
    var query = options && options.query != null
      ? String(options.query).trim().toLocaleLowerCase('fr-FR')
      : '';
    var selectedKeys = Object.create(null);
    var selected = (options && options.selected) || [];
    for (var s = 0; s < selected.length; s++) {
      var sk = blockedReasonStorageKey(selected[s]);
      if (sk) selectedKeys[sk] = true;
    }

    var freqMap = options && options.freqMap ? options.freqMap : loadBlockedReasonFreq();
    var pool = Object.create(null);
    var labels = [];

    function consider(label) {
      var normalized = normalizeBlockedReason(label);
      if (!normalized) return;
      var key = blockedReasonStorageKey(normalized);
      if (selectedKeys[key] || pool[key]) return;
      if (query && normalized.toLocaleLowerCase('fr-FR').indexOf(query) === -1) return;
      pool[key] = true;
      labels.push(normalized);
    }

    if (!query) {
      Object.keys(freqMap).forEach(function (key) {
        var entry = freqMap[key];
        if (entry && entry.label) consider(entry.label);
      });
      for (var i = 0; i < BLOCKED_REASON_CORE_PRESETS.length; i++) {
        consider(BLOCKED_REASON_CORE_PRESETS[i]);
      }
    } else {
      for (var d = 0; d < BLOCKED_REASON_OPTIONS.length; d++) {
        consider(BLOCKED_REASON_OPTIONS[d]);
      }
      Object.keys(freqMap).forEach(function (key) {
        var entry = freqMap[key];
        if (entry && entry.label) consider(entry.label);
      });
    }

    labels.sort(function (a, b) {
      return compareBlockedReasonSuggestions(a, b, freqMap);
    });

    var cap = !query
      ? (options && options.cap != null
        ? options.cap
        : BLOCKED_REASON_EMPTY_SUGGESTION_CAP)
      : (options && options.filterCap != null
        ? options.filterCap
        : BLOCKED_REASON_FILTER_SUGGESTION_CAP);
    if (labels.length > cap) labels = labels.slice(0, cap);
    return labels;
  }

  /**
   * Normalize selected Bloqué reasons to a de-duplicated string[].
   * Accepts string[], a single string, or an inputs object with
   * `blockedReasons` (preferred) and/or legacy `blockedReason`.
   */
  function normalizeBlockedReasons(raw) {
    var list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (typeof raw === 'string') {
      list = [raw];
    } else if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.blockedReasons)) {
        list = raw.blockedReasons;
      } else if (typeof raw.blockedReason === 'string' && raw.blockedReason.trim()) {
        list = [raw.blockedReason];
      }
    }
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var reason = normalizeBlockedReason(list[i]);
      if (!reason) continue;
      var key = blockedReasonStorageKey(reason);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(reason);
    }
    return out;
  }

  function isBlockedWaitingOtherTask(reasonOrReasons) {
    if (Array.isArray(reasonOrReasons)) {
      for (var i = 0; i < reasonOrReasons.length; i++) {
        if (normalizeBlockedReason(reasonOrReasons[i]) === BLOCKED_REASON_WAITING_OTHER_TASK) {
          return true;
        }
      }
      return false;
    }
    if (reasonOrReasons && typeof reasonOrReasons === 'object') {
      if (
        Array.isArray(reasonOrReasons.blockedLinks) &&
        reasonOrReasons.blockedLinks.length > 0
      ) {
        return true;
      }
      if (normalizeBlockedLink(reasonOrReasons.blockedLink)) return true;
      return isBlockedWaitingOtherTask(normalizeBlockedReasons(reasonOrReasons));
    }
    return normalizeBlockedReason(reasonOrReasons) === BLOCKED_REASON_WAITING_OTHER_TASK;
  }

  /**
   * Chip / badge label for a waiting-on-task link.
   * Humanized cause phrase (no parentheses): "Essayer X" → "En attente d'essayer X".
   */
  function formatBlockedWaitingOnLabel(taskName) {
    var name =
      typeof taskName === 'string' && taskName.trim()
        ? taskName.trim()
        : BLOCKED_SUBTASK_FALLBACK_LABEL;
    if (
      global.PriorityAgent &&
      typeof global.PriorityAgent.fallbackBlockedReasonText === 'function'
    ) {
      return global.PriorityAgent.fallbackBlockedReasonText(name);
    }
    var body = name.replace(/\.+$/, '');
    var lower =
      body.charAt(0).toLocaleLowerCase('fr-FR') + body.slice(1);
    if (
      /^(une?|des)\s+/i.test(lower) ||
      /^([aeiou\u00e0\u00e2\u00e4\u00e9\u00e8\u00ea\u00eb\u00ee\u00ef\u00f4\u00f6\u00f9\u00fb\u00fc]|h)/i.test(
        lower
      )
    ) {
      return ('En attente d\'' + lower).slice(0, 500);
    }
    return (BLOCKED_WAITING_ON_PREFIX + ' ' + lower).slice(0, 500);
  }

  function resolveBlockedLinkLabel(link, items) {
    if (!link) return BLOCKED_SUBTASK_FALLBACK_LABEL;
    var item = findSubtaskById(items || [], link.id);
    if (item && item.text) return String(item.text).trim() || BLOCKED_SUBTASK_FALLBACK_LABEL;
    if (typeof link.label === 'string' && link.label.trim()) return link.label.trim();
    return BLOCKED_SUBTASK_FALLBACK_LABEL;
  }

  /**
   * Expand reasons for display: replace the generic waiting-other reason with
   * one label per linked task (humanized "En attente de …"), using stored labels
   * when live subtask text is unavailable.
   * When the user already has an explicit motif, do not also append link
   * chips — avoids "Manger…" + "En attente de manger…".
   */
  function expandBlockedReasonsForDisplay(reasons, links, items) {
    var list = normalizeBlockedReasons(reasons);
    var linkList = normalizeBlockedLinks(links);
    var out = [];
    var waitingExpanded = false;
    var hasExplicitReason = false;
    for (var e = 0; e < list.length; e++) {
      if (list[e] !== BLOCKED_REASON_WAITING_OTHER_TASK) {
        hasExplicitReason = true;
        break;
      }
    }
    for (var i = 0; i < list.length; i++) {
      if (list[i] === BLOCKED_REASON_WAITING_OTHER_TASK) {
        waitingExpanded = true;
        // Explicit motifs already describe the wait — skip named link expansion.
        if (hasExplicitReason) continue;
        if (linkList.length) {
          for (var j = 0; j < linkList.length; j++) {
            out.push(
              formatBlockedWaitingOnLabel(resolveBlockedLinkLabel(linkList[j], items))
            );
          }
        } else {
          out.push(BLOCKED_REASON_WAITING_OTHER_TASK);
        }
      } else {
        out.push(list[i]);
      }
    }
    // Only auto-surface link labels when there is no typed motif yet.
    if (!waitingExpanded && linkList.length && !hasExplicitReason) {
      for (var k = 0; k < linkList.length; k++) {
        out.push(
          formatBlockedWaitingOnLabel(resolveBlockedLinkLabel(linkList[k], items))
        );
      }
    }
    return out;
  }

  /**
   * Elegant French summary for badges / collapsed section.
   * One reason as-is; several as comma-separated when short, else « first +N ».
   * Pass `links` (and optional `items`) to expand waiting-on-task chips with names.
   */
  function formatBlockedReasonsSummary(reasons, options) {
    var list =
      options && (options.links != null || options.items != null)
        ? expandBlockedReasonsForDisplay(reasons, options.links, options.items)
        : normalizeBlockedReasons(reasons);
    var emptyLabel =
      options && options.empty != null ? options.empty : BLOCKED_LABEL;
    if (!list.length) return emptyLabel;
    if (list.length === 1) return list[0];
    var maxLen = options && options.maxLength != null ? options.maxLength : 42;
    var comma = list.join(', ');
    if (comma.length <= maxLen) return comma;
    return list[0] + ' +' + (list.length - 1);
  }

  /** Normalize one blocked link (`{ type: 'subtask', id, label? }`). */
  function normalizeBlockedLink(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.type !== BLOCKED_LINK_TYPE_SUBTASK) return null;
    var id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) return null;
    var out = { type: BLOCKED_LINK_TYPE_SUBTASK, id: id };
    if (typeof raw.label === 'string' && raw.label.trim()) {
      out.label = raw.label.trim();
    }
    return out;
  }

  /**
   * Normalize multi waiting-on links to a de-duplicated `{ type, id, label? }[]`.
   * Accepts an array, a single link, or an inputs object with
   * `blockedLinks` (preferred), legacy `blockedLink`, or `blockedSubtaskId`.
   */
  function normalizeBlockedLinks(raw) {
    var list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.blockedLinks)) {
        list = raw.blockedLinks;
      } else if (raw.blockedLink != null || raw.type === BLOCKED_LINK_TYPE_SUBTASK) {
        var single =
          raw.type === BLOCKED_LINK_TYPE_SUBTASK
            ? normalizeBlockedLink(raw)
            : normalizeBlockedLink(raw.blockedLink);
        if (single) list = [single];
      }
      if (!list.length && typeof raw.blockedSubtaskId === 'string') {
        var legacyId = raw.blockedSubtaskId.trim();
        if (legacyId) list = [{ type: BLOCKED_LINK_TYPE_SUBTASK, id: legacyId }];
      }
    }
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var link = normalizeBlockedLink(list[i]);
      if (!link || seen[link.id]) continue;
      seen[link.id] = true;
      out.push(link);
    }
    return out;
  }

  function blockedLinksFromRaw(raw) {
    return normalizeBlockedLinks(raw);
  }

  /** @deprecated Prefer blockedLinksFromRaw / normalizeBlockedLinks. */
  function blockedLinkFromRaw(raw) {
    var links = normalizeBlockedLinks(raw);
    return links.length ? links[0] : null;
  }

  function findSubtaskById(items, id) {
    if (!id || !items || !items.length) return null;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item && item.id === id) return item;
    }
    return null;
  }

  var DUE_DATE_LABEL = '\u00c9ch\u00e9ance';
  var DUE_DATE_PLACEHOLDER = 'Choisir une date';
  var DUE_DATE_TODAY_LABEL = 'Aujourd\'hui';
  var DUE_DATE_PREV_MONTH = 'Mois pr\u00e9c\u00e9dent';
  var DUE_DATE_NEXT_MONTH = 'Mois suivant';
  var DUE_DATE_PREV_YEAR = 'Ann\u00e9e pr\u00e9c\u00e9dente';
  var DUE_DATE_NEXT_YEAR = 'Ann\u00e9e suivante';
  var DUE_DATE_PREV_YEARS = 'Ann\u00e9es pr\u00e9c\u00e9dentes';
  var DUE_DATE_NEXT_YEARS = 'Ann\u00e9es suivantes';
  var DUE_DATE_PICK_DAY_LABEL = 'Choisir le jour';
  var DUE_DATE_PICK_MONTH_LABEL = 'Choisir le mois';
  var DUE_DATE_PICK_YEAR_LABEL = 'Choisir l\'ann\u00e9e';
  var DUE_DATE_CALENDAR_LABEL = 'Calendrier d\'\u00e9ch\u00e9ance';
  var DUE_DATE_BOX_LABEL = 'Date';
  var DUE_DATE_CLEAR_LABEL = 'Effacer la date';
  var DUE_DATE_START_LABEL = 'D\u00e9but';
  var DUE_DATE_START_CLEAR_LABEL = 'Effacer la date de d\u00e9but';
  var DUE_DATE_START_PLACEHOLDER = 'Ajouter une date de d\u00e9but';
  var DUE_DATE_RECURRING_LABEL = 'R\u00e9currente';
  var DUE_DATE_RECURRING_CLEAR_LABEL = 'Effacer la r\u00e9currence';
  var DUE_DATE_RECURRING_NONE = 'Ne pas r\u00e9p\u00e9ter';
  var DUE_DATE_RECURRING_DAILY = 'Chaque jour';
  var DUE_DATE_RECURRING_WEEKLY = 'Chaque semaine';
  var DUE_DATE_RECURRING_MONTHLY = 'Chaque mois';
  var DUE_DATE_RECURRING_YEARLY = 'Chaque ann\u00e9e';
  var DUE_DATE_TIME_LABEL = 'Heure';
  var DUE_DATE_TIME_PLACEHOLDER = 'Choisir une heure';
  var DUE_DATE_TIME_CLEAR_LABEL = 'Effacer l\'heure';
  var DUE_DATE_TIME_PICKER_LABEL = 'Choix de l\'heure';
  var DUE_DATE_TIME_SUGGESTIONS_LABEL = 'Suggestions';
  var DUE_DATE_QUICK_SUGGESTIONS_LABEL = 'Suggestions de date';
  var DUE_DATE_TIME_DIAL_LABEL = 'Horloge';
  var DUE_DATE_TIME_HOURS_ARIA = 'Heures';
  var DUE_DATE_TIME_MINUTES_ARIA = 'Minutes';
  var DUE_DATE_TIME_MODE_HOUR_LABEL = 'Heure';
  var DUE_DATE_TIME_MODE_MINUTE_LABEL = 'Minutes';
  var DUE_DATE_TIME_AM_LABEL = 'AM';
  var DUE_DATE_TIME_PM_LABEL = 'PM';
  var DUE_DATE_TIME_MERIDIEM_ARIA = 'Matin ou apr\u00e8s-midi';
  var DUE_DATE_TIME_DEFAULT = '08:00';
  var DUE_DATE_TIME_PERIODS = [
    { id: 'matin', label: 'Matin', time: '09:00' },
    { id: 'midi', label: 'Midi', time: '12:00' },
    { id: 'apres-midi', label: 'Apr\u00e8s-midi', time: '14:00' },
    { id: 'soir', label: 'Soir', time: '18:00' }
  ];
  /** Quick date chips shown when Échéance has no day set. */
  var DUE_DATE_QUICK_SUGGESTIONS = [
    { id: 'cet-apres-midi', label: 'Cet apr\u00e8s-midi', hint: '14:00' },
    { id: 'demain-matin', label: 'Demain matin', hint: '09:00' },
    { id: 'lundi-prochain', label: 'Lundi prochain', hint: '09:00' },
    { id: 'dans-une-semaine', label: 'Dans une semaine', hint: '+7 j' },
    { id: 'dans-deux-semaines', label: 'Dans deux semaines', hint: '+14 j' }
  ];
  /** Shared workplace times for quick-date presets (match period chips). */
  var DUE_DATE_QUICK_MORNING_TIME = '09:00';
  var DUE_DATE_QUICK_AFTERNOON_TIME = '14:00';
  var DUE_DATE_TIME_MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  var DUE_DATE_TIME_CLOCK_SIZE = 200;
  var DUE_DATE_TIME_CLOCK_INNER_R = 52;
  var DUE_DATE_TIME_CLOCK_OUTER_R = 82;
  var DUE_DATE_TIME_CLOCK_MINUTE_R = 74;
  var DUE_DATE_MONTH_NAMES = [
    'janvier',
    'f\u00e9vrier',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'ao\u00fbt',
    'septembre',
    'octobre',
    'novembre',
    'd\u00e9cembre'
  ];
  var DUE_DATE_MONTH_SHORT = [
    'janv.',
    'f\u00e9vr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'ao\u00fbt',
    'sept.',
    'oct.',
    'nov.',
    'd\u00e9c.'
  ];
  var DUE_DATE_YEAR_PICKER_COUNT = 12;
  var DUE_DATE_WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  var DUE_DATE_WEEKDAY_NAMES = [
    'dimanche',
    'lundi',
    'mardi',
    'mercredi',
    'jeudi',
    'vendredi',
    'samedi'
  ];
  var MS_PER_DAY = 86400000;
  var MS_PER_HOUR = 3600000;
  var MS_PER_MINUTE = 60000;
  /** Show hour-granular countdown only when |remaining| hours is below this. */
  var COUNTDOWN_HOUR_DISPLAY_MAX = 10;
  var COUNTDOWN_DAYS_PER_WEEK = 7;
  var COUNTDOWN_WEEK_THRESHOLD_DAYS = 30;
  var COUNTDOWN_YEAR_THRESHOLD_DAYS = 365;
  var DAYS_PER_MONTH_AVG = 30.44;
  var DAYS_PER_YEAR_AVG = 365.25;

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function toIsoDate(date) {
    if (!date || isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function normalizeDueDate(value) {
    if (value == null || value === '') return '';
    if (typeof value !== 'string') return '';
    var trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return '';
    var parts = trimmed.split('-');
    var year = +parts[0];
    var month = +parts[1];
    var day = +parts[2];
    var date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return '';
    }
    return trimmed;
  }

  function normalizeDueTime(value) {
    if (value == null || value === '') return '';
    if (typeof value !== 'string') return '';
    var trimmed = value.trim();
    var match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    if (!match) return '';
    var hours = +match[1];
    var minutes = +match[2];
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
    return pad2(hours) + ':' + pad2(minutes);
  }

  /** Whether a quick-date chip is still meaningful at `now` (local). */
  function isDueDateQuickSuggestionAvailable(id, now) {
    if (!id || typeof id !== 'string') return false;
    if (id === 'cet-apres-midi') {
      var at = now || new Date();
      var afternoonParts = DUE_DATE_QUICK_AFTERNOON_TIME.split(':');
      var afternoonMins = (+afternoonParts[0]) * 60 + (+afternoonParts[1]);
      var nowMins = at.getHours() * 60 + at.getMinutes();
      // « Cet après-midi » is today-only; hide once the afternoon target has passed.
      return nowMins < afternoonMins;
    }
    for (var i = 0; i < DUE_DATE_QUICK_SUGGESTIONS.length; i++) {
      if (DUE_DATE_QUICK_SUGGESTIONS[i].id === id) return true;
    }
    return false;
  }

  /** Resolve a quick-date chip id to `{ iso, time }` (local calendar + workplace time). */
  function resolveDueDateQuickSuggestion(id) {
    if (!id || typeof id !== 'string') return null;
    if (!isDueDateQuickSuggestionAvailable(id)) return null;
    var now = new Date();
    var today = startOfLocalDay(now);
    var date;
    var time = DUE_DATE_QUICK_MORNING_TIME;
    if (id === 'cet-apres-midi') {
      // Always today at afternoon time — never reinterpret as tomorrow.
      time = DUE_DATE_QUICK_AFTERNOON_TIME;
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    } else if (id === 'demain-matin') {
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    } else if (id === 'lundi-prochain') {
      // JS getDay(): Sun=0 … Sat=6. Want next Monday (1).
      var dow = today.getDay();
      var daysUntilMonday = dow === 0 ? 1 : (8 - dow);
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysUntilMonday);
    } else if (id === 'dans-une-semaine') {
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    } else if (id === 'dans-deux-semaines') {
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14);
    } else {
      return null;
    }
    return { iso: toIsoDate(date), time: time };
  }

  function startOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function dueDateToLocalDate(iso) {
    var normalized = normalizeDueDate(iso);
    if (!normalized) return null;
    var parts = normalized.split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }

  function dueInstant(iso, time) {
    var date = dueDateToLocalDate(iso);
    if (!date) return null;
    var normalizedTime = normalizeDueTime(time);
    if (normalizedTime) {
      var parts = normalizedTime.split(':');
      date.setHours(+parts[0], +parts[1], 0, 0);
    }
    return date;
  }

  /**
   * Build a Trello card `due` ISO string from Échéance parts (local calendar).
   * Date-only → local midnight (round-trips without a dueTime).
   */
  function trelloDueIsoFromParts(dueDate, dueTime) {
    var instant = dueInstant(dueDate, dueTime);
    if (!instant) return null;
    return instant.toISOString();
  }

  /**
   * Parse Trello `due` (ISO) into `{ dueDate, dueTime? }` in local time.
   * Midnight local is treated as date-only (no dueTime).
   */
  function parseTrelloDueToParts(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return null;
    var trimmed = value.trim();
    if (!trimmed) return null;
    var date = new Date(trimmed);
    if (isNaN(date.getTime())) return null;
    var dueDate = toIsoDate(date);
    if (!dueDate) return null;
    var hours = date.getHours();
    var minutes = date.getMinutes();
    if (hours === 0 && minutes === 0) return { dueDate: dueDate };
    return { dueDate: dueDate, dueTime: pad2(hours) + ':' + pad2(minutes) };
  }

  /** Canonical ISO for compare/sync ('' when empty/invalid). */
  function canonicalizeTrelloDueIso(value) {
    var parts = parseTrelloDueToParts(value);
    if (!parts) return '';
    return trelloDueIsoFromParts(parts.dueDate, parts.dueTime) || '';
  }

  function inputsToTrelloDueIso(inputs) {
    if (!inputs) return '';
    var dueDate = normalizeDueDate(inputs.dueDate);
    if (!dueDate) return '';
    return trelloDueIsoFromParts(dueDate, inputs.dueTime) || '';
  }

  /** Start date → Trello `start` ISO (date-only local midnight). */
  function inputsToTrelloStartIso(inputs) {
    if (!inputs) return '';
    var startDate = normalizeDueDate(inputs.startDate);
    if (!startDate) return '';
    return trelloDueIsoFromParts(startDate, null) || '';
  }

  var RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

  function normalizeRecurrence(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var frequency =
      typeof raw.frequency === 'string' ? raw.frequency.trim().toLowerCase() : '';
    if (RECURRENCE_FREQUENCIES.indexOf(frequency) === -1) return null;
    var interval = Math.round(Number(raw.interval));
    if (!isFinite(interval) || interval < 1) interval = 1;
    if (interval > 99) interval = 99;
    var out = { frequency: frequency, interval: interval };
    if (frequency === 'weekly') {
      var days = [];
      var seen = Object.create(null);
      var list = Array.isArray(raw.weekdays) ? raw.weekdays : [];
      for (var i = 0; i < list.length; i++) {
        var d = Math.round(Number(list[i]));
        if (!isFinite(d) || d < 0 || d > 6 || seen[d]) continue;
        seen[d] = true;
        days.push(d);
      }
      days.sort(function (a, b) {
        return a - b;
      });
      if (!days.length) {
        var fallback = new Date();
        days = [fallback.getDay()];
      }
      out.weekdays = days;
    }
    return out;
  }

  function addCalendarMonths(date, months) {
    var d = new Date(date.getTime());
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    var maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, maxDay));
    return d;
  }

  function occurrenceInstant(iso, time) {
    return dueInstant(iso, time) || dueDateToLocalDate(iso);
  }

  function advanceDateByRecurrence(iso, recurrence) {
    var date = dueDateToLocalDate(iso);
    var rule = normalizeRecurrence(recurrence);
    if (!date || !rule) return iso || '';
    var interval = rule.interval || 1;
    var next = new Date(date.getTime());

    if (rule.frequency === 'daily') {
      next.setDate(next.getDate() + interval);
      return toIsoDate(next);
    }

    if (rule.frequency === 'monthly') {
      return toIsoDate(addCalendarMonths(next, interval));
    }

    if (rule.frequency === 'yearly') {
      return toIsoDate(addCalendarMonths(next, interval * 12));
    }

    // weekly
    var weekdays = (rule.weekdays || []).slice().sort(function (a, b) {
      return a - b;
    });
    if (!weekdays.length) weekdays = [date.getDay()];
    var dow = date.getDay();
    var i;
    for (i = 0; i < weekdays.length; i++) {
      if (weekdays[i] > dow) {
        next.setDate(next.getDate() + (weekdays[i] - dow));
        return toIsoDate(next);
      }
    }
    var first = weekdays[0];
    next.setDate(next.getDate() + (7 - dow + first) + (interval - 1) * 7);
    return toIsoDate(next);
  }

  function advanceDateByRecurrenceAfter(iso, recurrence, time, now) {
    var rule = normalizeRecurrence(recurrence);
    var nextIso = advanceDateByRecurrence(iso, rule);
    var at = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
    var guard = 0;
    while (nextIso && guard < 500) {
      var nextInstant = occurrenceInstant(nextIso, time);
      if (!nextInstant || nextInstant.getTime() > at.getTime()) break;
      nextIso = advanceDateByRecurrence(nextIso, rule);
      guard++;
    }
    return nextIso || '';
  }

  /**
   * Next occurrence parts after completing a recurring card.
   * Advances due (keeps time) and start by the same calendar-day delta.
   * When a task is overdue, jumps to the first future occurrence instead of
   * rolling through stale dates one completion at a time.
   */
  function nextOccurrenceParts(parts, recurrence, options) {
    var rule = normalizeRecurrence(recurrence);
    if (!rule || !parts || !parts.dueDate) return null;
    options = options || {};
    var nextDue = advanceDateByRecurrenceAfter(
      parts.dueDate,
      rule,
      parts.dueTime || '',
      options.now
    );
    if (!nextDue) return null;
    var out = {
      dueDate: nextDue,
      dueTime: parts.dueTime || '',
      startDate: ''
    };
    if (parts.startDate) {
      var start = dueDateToLocalDate(parts.startDate);
      var due = dueDateToLocalDate(parts.dueDate);
      var nextDueDate = dueDateToLocalDate(nextDue);
      if (start && due && nextDueDate) {
        var delta = nextDueDate.getTime() - due.getTime();
        out.startDate = toIsoDate(new Date(start.getTime() + delta));
      }
    }
    return out;
  }

  function formatRecurrenceLabelFr(recurrence, time) {
    var rule = normalizeRecurrence(recurrence);
    if (!rule) return 'Ne pas r\u00e9p\u00e9ter';
    var n = rule.interval || 1;
    var label = '';
    if (rule.frequency === 'daily') {
      label = n === 1 ? 'Chaque jour' : 'Tous les ' + n + ' jours';
    } else if (rule.frequency === 'weekly') {
      label = n === 1 ? 'Chaque semaine' : 'Toutes les ' + n + ' semaines';
    } else if (rule.frequency === 'monthly') {
      label = n === 1 ? 'Chaque mois' : 'Tous les ' + n + ' mois';
    } else if (rule.frequency === 'yearly') {
      label = n === 1 ? 'Chaque ann\u00e9e' : 'Tous les ' + n + ' ans';
    } else {
      label = 'R\u00e9currente';
    }
    var timeText = formatDueTimeDisplay(time);
    return timeText ? label + ' \u00e0 ' + timeText : label;
  }

  function formatDueDateBoxDisplay(iso) {
    var date = dueDateToLocalDate(iso);
    if (!date) return '';
    try {
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (err) {
      return (
        date.getDate() +
        ' ' +
        DUE_DATE_MONTH_NAMES[date.getMonth()] +
        ' ' +
        date.getFullYear()
      );
    }
  }

  function normalizeTimeFormatPref(raw) {
    if (raw === 12 || raw === true) return '12';
    var s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (s === '12' || s === '12h' || s === 'hour12' || s === 'h12') return '12';
    return '24';
  }

  function setTimeFormat(format) {
    preferredTimeFormat = normalizeTimeFormatPref(format);
    return preferredTimeFormat;
  }

  function getTimeFormat() {
    return preferredTimeFormat === '12' ? '12' : '24';
  }

  function isHour12() {
    return getTimeFormat() === '12';
  }

  function hour24ToHour12Parts(hour24) {
    var h = ((Number(hour24) % 24) + 24) % 24;
    var isPm = h >= 12;
    var hour12 = h % 12;
    if (hour12 === 0) hour12 = 12;
    return { hour12: hour12, isPm: isPm };
  }

  function hour12PartsToHour24(hour12, isPm) {
    var n = Number(hour12);
    if (!isFinite(n) || n < 1) n = 12;
    if (n > 12) n = 12;
    var h24 = n % 12;
    if (isPm) h24 += 12;
    return h24;
  }

  /** Clock label for triggers / chips: "14:30" or "2:30 PM". */
  function formatDueTimeDisplay(time) {
    var normalized = normalizeDueTime(time);
    if (!normalized) return '';
    var parts = normalized.split(':');
    var hours = +parts[0];
    var minutes = +parts[1];
    if (!isHour12()) return pad2(hours) + ':' + pad2(minutes);
    var conv = hour24ToHour12Parts(hours);
    var suffix = conv.isPm ? DUE_DATE_TIME_PM_LABEL : DUE_DATE_TIME_AM_LABEL;
    return conv.hour12 + ':' + pad2(minutes) + ' ' + suffix;
  }

  function formatDueDateDisplay(iso, time) {
    var dateText = formatDueDateBoxDisplay(iso);
    if (!dateText) return '';
    var timeText = formatDueTimeDisplay(time);
    if (!timeText) return dateText;
    return dateText + ' \u00b7 ' + timeText;
  }

  /** Column index in a Sunday-first week (JS getDay(): Sun=0 … Sat=6). */
  function sundayOffset(date) {
    return date.getDay();
  }

  function daysUntilDue(iso, now) {
    var due = dueDateToLocalDate(iso);
    if (!due) return NaN;
    var today = startOfLocalDay(now || new Date());
    return Math.round((startOfLocalDay(due).getTime() - today.getTime()) / MS_PER_DAY);
  }

  function msUntilDue(iso, time, now) {
    var due = dueInstant(iso, time);
    if (!due) return NaN;
    return due.getTime() - (now || new Date()).getTime();
  }

  function isDuePast(iso, time, now) {
    if (normalizeDueTime(time)) return msUntilDue(iso, time, now) < 0;
    return daysUntilDue(iso, now) < 0;
  }

  /**
   * Échéance proximity band for section chrome coloring.
   * overdue | imminent (≤2j) | soon (≤2 sem) | weeks (≤1 mois) | month (≤3 mois) | far
   */
  var DUE_PROXIMITY_BANDS = [
    'overdue',
    'imminent',
    'soon',
    'weeks',
    'month',
    'far'
  ];

  var DUE_BAND_ACCENTS = {
    overdue: '#C9372C',
    imminent: '#FF9F1A',
    soon: '#F2D600',
    weeks: '#61BD4F',
    month: '#0079BF',
    far: '#B3BAC5'
  };

  function dueBandAccent(band) {
    return DUE_BAND_ACCENTS[band] || '';
  }

  function dueProximityBand(iso, time, now) {
    if (!normalizeDueDate(iso)) return '';
    if (isDuePast(iso, time, now)) return 'overdue';
    var days = daysUntilDue(iso, now);
    if (!isFinite(days)) return '';
    if (days <= 2) return 'imminent';
    if (days <= 14) return 'soon';
    if (days <= 30) return 'weeks';
    if (days <= 90) return 'month';
    return 'far';
  }

  function applyDueProximityBand(el, band) {
    if (!el) return;
    if (!band) {
      clearDueProximityBand(el);
      return;
    }
    for (var i = 0; i < DUE_PROXIMITY_BANDS.length; i++) {
      var name = DUE_PROXIMITY_BANDS[i];
      el.classList.toggle('is-due-' + name, name === band);
    }
    el.classList.toggle('is-overdue', band === 'overdue');
    el.classList.toggle('is-past', band === 'overdue');
    if (el.dataset) el.dataset.dueBand = band;
    applySectionGlow(el.classList.contains('field--due-date') ? el : el.querySelector('.field--due-date') || el, dueBandAccent(band));
  }

  function clearDueProximityBand(el) {
    if (!el) return;
    for (var i = 0; i < DUE_PROXIMITY_BANDS.length; i++) {
      el.classList.remove('is-due-' + DUE_PROXIMITY_BANDS[i]);
    }
    el.classList.remove('is-overdue', 'is-past');
    if (el.dataset) delete el.dataset.dueBand;
    clearSectionGlow(
      el.classList.contains('field--due-date')
        ? el
        : el.querySelector('.field--due-date') || el
    );
  }

  function capitalizeCountdownPhrase(text) {
    if (!text) return '';
    var first = text.charAt(0);
    var upper = first.toLocaleUpperCase('fr-FR');
    return upper === first ? text : upper + text.slice(1);
  }

  /** French compact clock for collapsed section summaries (e.g. "9 h", "14 h 30", "2 h 30 PM"). */
  function formatDueTimeCompactFr(time) {
    var normalized = normalizeDueTime(time);
    if (!normalized) return '';
    var parts = normalized.split(':');
    var hours = +parts[0];
    var minutes = +parts[1];
    if (!isHour12()) {
      if (minutes === 0) return String(hours) + ' h';
      return String(hours) + ' h ' + pad2(minutes);
    }
    var conv = hour24ToHour12Parts(hours);
    var suffix = conv.isPm ? DUE_DATE_TIME_PM_LABEL : DUE_DATE_TIME_AM_LABEL;
    if (minutes === 0) return conv.hour12 + ' h ' + suffix;
    return conv.hour12 + ' h ' + pad2(minutes) + ' ' + suffix;
  }

  /** Match a due time to a period chip (matin / midi / après-midi / soir). */
  function matchDueTimePeriod(time) {
    var normalized = normalizeDueTime(time);
    if (!normalized) return null;
    for (var i = 0; i < DUE_DATE_TIME_PERIODS.length; i++) {
      if (DUE_DATE_TIME_PERIODS[i].time === normalized) return DUE_DATE_TIME_PERIODS[i];
    }
    return null;
  }

  function findDueTimePeriodById(id) {
    if (!id || typeof id !== 'string') return null;
    for (var i = 0; i < DUE_DATE_TIME_PERIODS.length; i++) {
      if (DUE_DATE_TIME_PERIODS[i].id === id) return DUE_DATE_TIME_PERIODS[i];
    }
    return null;
  }

  /**
   * Adaptive period chip / headline label for a day
   * (Ce matin, Demain midi, Hier soir, Lundi après-midi, …).
   * Falls back to the bare period label when no date is set.
   */
  function formatDueTimePeriodLabel(periodOrId, iso, now) {
    var period =
      periodOrId && typeof periodOrId === 'object'
        ? periodOrId
        : findDueTimePeriodById(periodOrId);
    if (!period) return '';

    var periodWord = period.label.toLocaleLowerCase('fr-FR');
    var normalized = normalizeDueDate(iso);
    if (!normalized) return period.label;

    var days = daysUntilDue(normalized, now);
    if (!isFinite(days)) return period.label;

    if (days === 0) {
      if (period.id === 'matin') return 'Ce matin';
      if (period.id === 'midi') return 'Ce midi';
      if (period.id === 'apres-midi') return 'Cet apr\u00e8s-midi';
      if (period.id === 'soir') return 'Ce soir';
      return period.label;
    }
    if (days === 1) {
      return period.id === 'midi' ? 'Demain midi' : 'Demain ' + periodWord;
    }
    if (days === -1) {
      return period.id === 'midi' ? 'Hier midi' : 'Hier ' + periodWord;
    }
    if (days === 2) {
      return period.id === 'midi'
        ? 'Apr\u00e8s-demain midi'
        : 'Apr\u00e8s-demain ' + periodWord;
    }

    var due = dueDateToLocalDate(normalized);
    if (!due) return period.label;

    if ((days >= 3 && days <= 7) || (days <= -2 && days >= -7)) {
      var weekday = capitalizeCountdownPhrase(
        DUE_DATE_WEEKDAY_NAMES[sundayOffset(due)]
      );
      return period.id === 'midi' ? weekday + ' midi' : weekday + ' ' + periodWord;
    }

    var shortDay = formatDueDateDayMonthShort(normalized, now);
    return period.id === 'midi' ? shortDay + ' midi' : shortDay + ' ' + periodWord;
  }

  /** Short calendar day label, e.g. "20 juil." (adds year when not current). */
  function formatDueDateDayMonthShort(iso, now) {
    var date = dueDateToLocalDate(iso);
    if (!date) return '';
    var at = now || new Date();
    try {
      var opts = { day: 'numeric', month: 'short' };
      if (date.getFullYear() !== at.getFullYear()) opts.year = 'numeric';
      return date.toLocaleDateString('fr-FR', opts);
    } catch (err) {
      var text =
        date.getDate() + ' ' + DUE_DATE_MONTH_NAMES[date.getMonth()];
      if (date.getFullYear() !== at.getFullYear()) text += ' ' + date.getFullYear();
      return text;
    }
  }

  /**
   * Relative calendar day for human-readable due titles
   * (Aujourd'hui, Demain, Lundi prochain, Lundi 20 juil., …).
   */
  function formatDueDateRelativeDay(iso, now) {
    var normalized = normalizeDueDate(iso);
    if (!normalized) return '';
    var days = daysUntilDue(normalized, now);
    if (days === 0) return 'Aujourd\'hui';
    if (days === 1) return 'Demain';
    if (days === -1) return 'Hier';
    if (days === 2) return 'Apr\u00e8s-demain';

    var due = dueDateToLocalDate(normalized);
    if (!due) return '';
    var weekday = capitalizeCountdownPhrase(DUE_DATE_WEEKDAY_NAMES[sundayOffset(due)]);
    if (days >= 3 && days <= 7) return weekday + ' prochain';
    if (days <= -2 && days >= -7) return weekday + ' dernier';
    return weekday + ' ' + formatDueDateDayMonthShort(normalized, now);
  }

  /** French "une"/"deux"/digit counts for relative trigger titles. */
  function frRelativeCount(n, singular, plural) {
    if (n === 1) return 'une ' + singular;
    if (n === 2) return 'deux ' + plural;
    return n + ' ' + plural;
  }

  /**
   * Humanized label for due-date-trigger-title when a day is selected
   * (Hier, Demain, Dans deux jours, …). Falls back to "Date".
   */
  function formatDueDateTriggerTitle(iso, now) {
    var normalized = normalizeDueDate(iso);
    if (!normalized) return DUE_DATE_BOX_LABEL;
    var days = daysUntilDue(normalized, now);
    if (!isFinite(days)) return DUE_DATE_BOX_LABEL;
    if (days === 0) return 'Aujourd\'hui';
    if (days === 1) return 'Demain';
    if (days === -1) return 'Hier';
    if (days === 2) return 'Dans deux jours';
    if (days === -2) return 'Il y a deux jours';
    if (days >= 3 && days <= 6) return 'Dans ' + days + ' jours';
    if (days <= -3 && days >= -6) return 'Il y a ' + (-days) + ' jours';
    return formatDueDateRelativeDay(normalized, now) || DUE_DATE_BOX_LABEL;
  }

  /**
   * Humanized label for due-date-time-title when a time is selected
   * (Dans une heure, Dans 15 minutes, Il y a une heure, …). Falls back to "Heure".
   */
  function formatDueTimeTriggerTitle(iso, time, now) {
    var dueTime = normalizeDueTime(time);
    if (!dueTime) return DUE_DATE_TIME_LABEL;
    var normalized = normalizeDueDate(iso);
    if (!normalized) return DUE_DATE_TIME_LABEL;

    var ms = msUntilDue(normalized, dueTime, now);
    if (!isFinite(ms)) return DUE_DATE_TIME_LABEL;

    var past = ms < 0;
    var abs = Math.abs(ms);
    var prefix = past ? 'Il y a ' : 'Dans ';

    if (abs < MS_PER_MINUTE / 2) return past ? '\u00c0 l\'instant' : 'Maintenant';

    var minutes = Math.max(1, Math.round(abs / MS_PER_MINUTE));
    if (minutes < 60) {
      return prefix + frRelativeCount(minutes, 'minute', 'minutes');
    }

    var hours = Math.max(1, Math.round(abs / MS_PER_HOUR));
    if (hours < 36) {
      return prefix + frRelativeCount(hours, 'heure', 'heures');
    }

    // Farther than ~1.5 days: reuse the day-scale trigger phrasing.
    return formatDueDateTriggerTitle(normalized, now);
  }

  /**
   * Human-readable due headline + remaining line for the Échéance body.
   * Ex. primary "6 jours restants", secondary "Lundi prochain à midi".
   * Past dues use relative phrasing ("Il y a une heure") instead of
   * calendar lines like "Aujourd'hui à 8 h".
   */
  function formatDueDateHumanReadable(iso, time, now) {
    var normalized = normalizeDueDate(iso);
    if (!normalized) return { primary: '', secondary: '' };

    var dueTime = normalizeDueTime(time);
    var at = now || new Date();

    // Overdue: never show "Aujourd'hui à 8 h" — use "Il y a…" + (En retard).
    if (isDuePast(normalized, dueTime, at)) {
      var pastPrimary = dueTime
        ? formatDueTimeTriggerTitle(normalized, dueTime, at)
        : formatDueDateTriggerTitle(normalized, at);
      if (pastPrimary) pastPrimary += ' (En retard)';
      return { primary: pastPrimary, secondary: '' };
    }

    var dayPhrase = formatDueDateRelativeDay(normalized, at);
    var period = matchDueTimePeriod(time);
    var whenPhrase = dayPhrase;

    if (period) {
      whenPhrase = formatDueTimePeriodLabel(period, normalized, at);
      // Keep period feel, but always name the clock ("Demain soir à 18 h").
      var periodClock = formatDueTimeCompactFr(dueTime || period.time);
      if (periodClock) whenPhrase += ' \u00e0 ' + periodClock;
    } else if (dueTime) {
      whenPhrase = dayPhrase + ' \u00e0 ' + formatDueTimeCompactFr(dueTime);
    }

    var countdown = formatDueCountdown(normalized, at, time);
    // Avoid "Demain matin" / "Demain" duplication when countdown is only the day name.
    var countdownKey = countdown ? countdown.toLocaleLowerCase('fr-FR') : '';
    var redundant =
      !countdown ||
      !whenPhrase ||
      countdownKey === dayPhrase.toLocaleLowerCase('fr-FR') ||
      countdownKey === whenPhrase.toLocaleLowerCase('fr-FR');

    if (redundant) {
      return { primary: whenPhrase || countdown, secondary: '' };
    }

    return { primary: countdown, secondary: whenPhrase };
  }

  /** Compact header summary when an enabled due-date section is collapsed. */
  function formatDueDateCompactSummary(iso, time, now) {
    var human = formatDueDateHumanReadable(iso, time, now);
    if (!normalizeDueDate(iso)) return 'Aucune';
    if (human.secondary && human.primary) {
      return human.secondary + ' (' + human.primary + ')';
    }
    return human.primary || formatDueCountdown(iso, now, time) || '';
  }

  function formatDueCountdownDays(days) {
    if (!isFinite(days)) return '';
    if (days < 0) {
      var late = -days;
      if (late === 1) return 'en retard de 1 jour';
      if (late < COUNTDOWN_DAYS_PER_WEEK) return 'en retard de ' + late + ' jours';
      if (late < COUNTDOWN_WEEK_THRESHOLD_DAYS) {
        var lateWeeks = Math.max(1, Math.round(late / COUNTDOWN_DAYS_PER_WEEK));
        return lateWeeks === 1
          ? 'en retard de 1 semaine'
          : 'en retard de ' + lateWeeks + ' semaines';
      }
      if (late < COUNTDOWN_YEAR_THRESHOLD_DAYS) {
        var lateMonths = Math.max(1, Math.round(late / DAYS_PER_MONTH_AVG));
        return lateMonths === 1
          ? 'en retard de 1 mois'
          : 'en retard de ' + lateMonths + ' mois';
      }
      var lateYears = Math.max(1, Math.round(late / DAYS_PER_YEAR_AVG));
      return lateYears === 1
        ? 'en retard de 1 an'
        : 'en retard de ' + lateYears + ' ans';
    }
    if (days === 0) return 'aujourd\'hui';
    if (days === 1) return 'demain';
    if (days < COUNTDOWN_DAYS_PER_WEEK) return days + ' jours restants';
    if (days < COUNTDOWN_WEEK_THRESHOLD_DAYS) {
      var weeks = Math.max(1, Math.round(days / COUNTDOWN_DAYS_PER_WEEK));
      return weeks === 1 ? '1 semaine restante' : weeks + ' semaines restantes';
    }
    if (days < COUNTDOWN_YEAR_THRESHOLD_DAYS) {
      var months = Math.max(1, Math.round(days / DAYS_PER_MONTH_AVG));
      return months === 1 ? '1 mois restant' : months + ' mois restants';
    }
    var years = Math.max(1, Math.round(days / DAYS_PER_YEAR_AVG));
    return years === 1 ? '1 an restant' : years + ' ans restants';
  }

  function formatDueCountdown(iso, now, time) {
    var dueTime = normalizeDueTime(time);
    if (!dueTime) {
      return capitalizeCountdownPhrase(formatDueCountdownDays(daysUntilDue(iso, now)));
    }

    var ms = msUntilDue(iso, dueTime, now);
    if (!isFinite(ms)) return '';
    var abs = Math.abs(ms);
    var past = ms < 0;
    var phrase;

    if (abs < MS_PER_MINUTE / 2) {
      phrase = past ? 'en retard de 1 min' : 'maintenant';
    } else {
      var minutes = Math.max(1, Math.round(abs / MS_PER_MINUTE));
      if (minutes < 60) {
        if (past) {
          phrase = minutes === 1 ? 'en retard de 1 min' : 'en retard de ' + minutes + ' min';
        } else {
          phrase = minutes === 1 ? '1 min restante' : minutes + ' min restantes';
        }
      } else {
        var hours = Math.max(1, Math.round(abs / MS_PER_HOUR));
        if (hours < COUNTDOWN_HOUR_DISPLAY_MAX) {
          if (past) {
            phrase = hours === 1 ? 'en retard de 1 h' : 'en retard de ' + hours + ' h';
          } else {
            phrase = hours === 1 ? '1 h restante' : hours + ' h restantes';
          }
        } else if (!past) {
          // ≥10 h left: day-scale (e.g. same-day 12 h → Aujourd'hui, not "12 h").
          phrase = formatDueCountdownDays(daysUntilDue(iso, now));
        } else {
          var days = Math.max(1, Math.round(abs / MS_PER_DAY));
          phrase = formatDueCountdownDays(-days);
        }
      }
    }

    return capitalizeCountdownPhrase(phrase);
  }

  function dueBadgeSuffix(display) {
    if (!display) return '';
    if (typeof display.dueCountdown === 'string' && display.dueCountdown) {
      return display.dueCountdown;
    }
    return '';
  }

  function formatDueBadgeText(display) {
    var label = taskBadgeLabel(display);
    var suffix = dueBadgeSuffix(display);
    if (!label) return suffix || '';
    if (!suffix) return label;
    return label + ' (' + suffix + ')';
  }

  function isDueEnabled(inputs) {
    if (!inputs) return false;
    if (inputs.dueEnabled === false) return false;
    return !!normalizeDueDate(inputs.dueDate);
  }

  function withDueDateDisplay(display, inputs) {
    if (!display) return display;
    // Disabled checkbox keeps dueDate stored but skips badge/overdue effects.
    if (inputs && inputs.dueEnabled === false) return display;
    var dueDate = normalizeDueDate(inputs && inputs.dueDate);
    if (!dueDate) return display;
    var dueTime = normalizeDueTime(inputs && inputs.dueTime);
    var next = {
      dueDate: dueDate,
      dueCountdown: formatDueCountdown(dueDate, null, dueTime),
      duePast: isDuePast(dueDate, dueTime)
    };
    if (dueTime) next.dueTime = dueTime;
    return Object.assign({}, display, next);
  }
  var BLOCKED_STYLES = {
    label: BLOCKED_LABEL,
    fill: '#FCE8E8',
    text: '#5D1A1A',
    seg: '#AE2E24',
    tint: '#C9372C',
    description: BLOCKED_DESCRIPTION
  };
  var BLOCKED_STYLES_DARK = {
    label: BLOCKED_LABEL,
    fill: '#3D1F1F',
    text: '#FFECEB',
    seg: '#F87171',
    tint: '#5C2020',
    description: BLOCKED_DESCRIPTION
  };

  function blockedThemeVisuals() {
    return {
      fill: readCssVar('--blocked-fill', BLOCKED_STYLES.fill),
      text: readCssVar('--blocked-text', BLOCKED_STYLES.text),
      seg: readCssVar('--blocked-accent', BLOCKED_STYLES.seg),
      tint: readCssVar('--blocked-border', BLOCKED_STYLES.tint)
    };
  }

  var TASK_BADGE_LABELS = {
    Critique: 'T\u00e2che critique',
    Urgente: 'T\u00e2che urgente',
    Urgent: 'T\u00e2che urgente',
    Prioritaire: 'T\u00e2che prioritaire',
    Importante: 'T\u00e2che importante',
    Important: 'T\u00e2che importante',
    Flexible: 'T\u00e2che flexible',
    Secondaire: 'T\u00e2che secondaire',
    Optionnelle: 'T\u00e2che optionnelle',
    Optionnel: 'T\u00e2che optionnelle',
    Inutile: 'T\u00e2che inutile',
    'Bloqu\u00e9': 'T\u00e2che'
  };

  var COMPLETED_BADGE_PREFIX = 'Compl\u00e9t\u00e9';

  function brandAppName() {
    var brand = global.PriorityBrand;
    if (brand && typeof brand.getAppName === 'function') return brand.getAppName();
    if (brand && typeof brand.appName === 'string' && brand.appName.trim()) {
      return brand.appName.trim();
    }
    var cfg = global.PriorityRestConfig;
    if (cfg && typeof cfg.appName === 'string' && cfg.appName.trim()) {
      return cfg.appName.trim();
    }
    return 'Trello Cerveau';
  }

  /** Card-back CTA / modal title — product name from PriorityBrand.appName. */
  var DEFINE_PRIORITY_LABEL = brandAppName();

  function taskBadgeLabelForTierKey(tier) {
    if (!tier) return '';
    if (Object.prototype.hasOwnProperty.call(TASK_BADGE_LABELS, tier)) {
      return TASK_BADGE_LABELS[tier];
    }
    return 'T\u00e2che ' + tier.charAt(0).toLowerCase() + tier.slice(1);
  }

  function formatCompletedBadgeLabel(taskLabel) {
    return COMPLETED_BADGE_PREFIX + ' (' + taskLabel + ')';
  }

  var EISENHOWER_BADGE_LABELS = {
    Faire: '\u00c0 faire maintenant',
    Planifier: '\u00c0 planifier',
    'D\u00e9l\u00e9guer': '\u00c0 d\u00e9l\u00e9guer',
    '\u00c9liminer': '\u00c0 \u00e9liminer'
  };

  // Unicode dots for Trello badge text (largest = highest priority).
  var BADGE_DOT_DEFAULT = '\u25CF'; // ●
  var TIER_BADGE_DOTS = {
    0: '\u2B24', // ⬤ Critique
    1: '\u2B24', // ⬤ Urgente
    2: BADGE_DOT_DEFAULT, // ● Prioritaire
    3: '\u2022', // • Importante
    4: '\u00B7', // · Flexible
    5: '\u00B7', // · Secondaire
    6: '\u00B7' // · Optionnelle
  };
  var BADGE_DOT_INUTILE = '\u00B7';
  var BADGE_DOT_COMPLETE = '\u2713';

  // Heat-badge dot diameter (px): low score → small, high score → large.
  var HEAT_TIER_DOT_MIN = 5;
  var HEAT_TIER_DOT_MAX = 14;
  var HEAT_TIER_DOT_SCORE_MAX = SCORE_MAX;
  var HEAT_TIER_DOT_FALLBACK = 9;
  var HEAT_TIER_DOT_SIZES = {
    0: 14, // Critique
    1: 12, // Urgente
    2: 10, // Prioritaire
    3: 9,  // Importante
    4: 7,  // Flexible
    5: 6,  // Secondaire
    6: 5   // Optionnelle
  };

  function heatTierDotSizePx(display) {
    if (!display) return HEAT_TIER_DOT_FALLBACK;
    if (display.inutile) return HEAT_TIER_DOT_MIN;
    var score = display.score;
    if (typeof score === 'number' && isFinite(score)) {
      var t = clamp(score / HEAT_TIER_DOT_SCORE_MAX, 0, 1);
      return HEAT_TIER_DOT_MIN + t * (HEAT_TIER_DOT_MAX - HEAT_TIER_DOT_MIN);
    }
    var tierI = display.tierI;
    if (tierI != null && Object.prototype.hasOwnProperty.call(HEAT_TIER_DOT_SIZES, tierI)) {
      return HEAT_TIER_DOT_SIZES[tierI];
    }
    return HEAT_TIER_DOT_FALLBACK;
  }

  // Help-modal level dots: low index → small, high index → large.
  var HELP_LEVEL_DOT_MIN = 5;
  var HELP_LEVEL_DOT_MAX = 12;

  function helpLevelDotSizePx(level, rangeStart, rangeEnd) {
    if (rangeEnd <= rangeStart) {
      return (HELP_LEVEL_DOT_MIN + HELP_LEVEL_DOT_MAX) / 2;
    }
    var t = clamp((level - rangeStart) / (rangeEnd - rangeStart), 0, 1);
    return HELP_LEVEL_DOT_MIN + t * (HELP_LEVEL_DOT_MAX - HELP_LEVEL_DOT_MIN);
  }

  function createHelpLevelDot(level, rangeStart, rangeEnd) {
    var dot = document.createElement('span');
    dot.className = 'help-modal-level-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.setProperty('--help-level-dot-size', helpLevelDotSizePx(level, rangeStart, rangeEnd).toFixed(2) + 'px');
    return dot;
  }

  function tierBadgeDotChar(display, completed) {
    if (completed) return BADGE_DOT_COMPLETE;
    if (!display) return BADGE_DOT_DEFAULT;
    if (display.blocked) return BLOCKED_SYMBOL;
    if (display.inutile) return BADGE_DOT_INUTILE;
    var i = display.tierI;
    if (i != null && Object.prototype.hasOwnProperty.call(TIER_BADGE_DOTS, i)) {
      return TIER_BADGE_DOTS[i];
    }
    return BADGE_DOT_DEFAULT;
  }

  function schemeBadgePreviewSamples() {
    var samples = [];
    // Least → most critical so the settings preview reads as a rising scale.
    for (var i = TIER_DEFS.length - 1; i >= 0; i--) {
      var def = TIER_DEFS[i];
      var label = taskBadgeLabelForTierKey(def.label);
      var color = Object.prototype.hasOwnProperty.call(TIER_TRELLO_BADGE_COLORS, def.i)
        ? TIER_TRELLO_BADGE_COLORS[def.i]
        : TRELLO_BADGE_COLOR_MUTED;
      var dot = Object.prototype.hasOwnProperty.call(TIER_BADGE_DOTS, def.i)
        ? TIER_BADGE_DOTS[def.i]
        : BADGE_DOT_DEFAULT;
      samples.push({
        tierI: def.i,
        label: label,
        color: color,
        dot: dot,
        text: dot + ' ' + label
      });
    }
    return samples;
  }

  function tierTrelloBadgeColor(display) {
    if (!display || display.inutile) return TRELLO_BADGE_COLOR_MUTED;
    var i = display.tierI;
    if (i != null && Object.prototype.hasOwnProperty.call(TIER_TRELLO_BADGE_COLORS, i)) {
      return TIER_TRELLO_BADGE_COLORS[i];
    }
    return TRELLO_BADGE_COLOR_MUTED;
  }

  function blockedTaskBadgeLabel(display) {
    if (!display) return TASK_BADGE_LABELS[BLOCKED_LABEL];
    var base = taskBadgeLabelForTierKey(classicTierLabel(display));
    if (base) return base;
    return TASK_BADGE_LABELS[BLOCKED_LABEL];
  }

  function taskBadgeLabel(display) {
    if (!display) return '';
    if (display.blocked) return blockedTaskBadgeLabel(display);
    if (display.eisenhowerLabel && EISENHOWER_BADGE_LABELS[display.eisenhowerLabel]) {
      return EISENHOWER_BADGE_LABELS[display.eisenhowerLabel];
    }
    return taskBadgeLabelForTierKey(classicTierLabel(display));
  }

  function formatBlockedBadgeText(display, reason) {
    var label = blockedTaskBadgeLabel(display);
    var suffix;
    if (reason != null && reason !== '') {
      suffix = typeof reason === 'string'
        ? reason
        : formatBlockedReasonsSummary(reason, {
            empty: BLOCKED_LABEL,
            links: display && display.blockedLinks
          });
    } else if (display && (display.blockedReasons || display.blockedLinks)) {
      suffix = formatBlockedReasonsSummary(
        display.blockedReasons != null ? display.blockedReasons : display.blockedReason,
        {
          empty: BLOCKED_LABEL,
          links: display.blockedLinks
        }
      );
    } else if (display && display.blockedReason) {
      suffix = display.blockedReason;
    } else {
      suffix = BLOCKED_LABEL;
    }
    return label + ' (' + suffix + ')';
  }

  function isDarkTheme() {
    return document.documentElement.getAttribute('data-color-mode') === 'dark';
  }

  function readCssVar(name, fallback) {
    try {
      if (typeof document === 'undefined' || !document.documentElement) {
        return fallback || '';
      }
      if (typeof getComputedStyle !== 'function') {
        return fallback || '';
      }
      var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback || '';
    } catch (e) {
      return fallback || '';
    }
  }

  function tierVisuals(source) {
    if (source && (source.blocked || source.label === BLOCKED_LABEL)) {
      return blockedThemeVisuals();
    }
    var inutile = source && (source.inutile || source.label === INUTILE_LABEL);
    if (inutile) {
      var idle = isDarkTheme() ? INUTILE_STYLES_DARK : INUTILE_STYLES;
      return { fill: idle.fill, text: idle.text, seg: idle.seg, tint: idle.tint };
    }
    var i = source && source.i != null ? source.i : TIER_I_MAX;
    if (isDarkTheme()) {
      var dark = TIERS_DARK[i] || TIERS_DARK[TIER_I_MAX];
      return { fill: dark.fill, text: dark.text, seg: dark.seg, tint: dark.tint };
    }
    var light = TIERS[i] || TIERS[TIER_I_MAX];
    return { fill: light.fill, text: light.text, seg: light.seg, tint: light.fill };
  }

  // ── 4. Matrix label bridge (PriorityMatrix) ─────────────────────────────

  function isInutile(inputs) {
    var U = inputs.urgency != null ? inputs.urgency : 0;
    var I = inputs.impact != null ? inputs.impact : 0;
    var F = inputs.ease != null ? inputs.ease : 5;
    return U < INUTILE_EPS && I < INUTILE_EPS && F <= 1 + INUTILE_EPS;
  }

  var matrixSettings = null;

  function setMatrixSettings(settings) {
    matrixSettings = settings;
  }

  function getMatrixSettings() {
    return matrixSettings;
  }

  function resolveMatrixLabel(inputs, tier, score, labelSettings) {
    var Matrix = typeof PriorityMatrix !== 'undefined' ? PriorityMatrix : null;
    if (!Matrix) return null;
    var settings = labelSettings != null ? labelSettings : matrixSettings;
    var ctx = Matrix.buildResolveContext(settings, tier, score);
    return Matrix.resolveLabel(inputs, ctx);
  }

  function isEnAttente(inputs) {
    return !!(inputs && inputs.enAttente);
  }

  function withBlockedDisplay(display, inputs) {
    if (!display || !isEnAttente(inputs)) return display;
    var reasons = normalizeBlockedReasons(inputs);
    var next = {
      blocked: true,
      blockedReasons: reasons
    };
    // Legacy single-string field: first selected reason (badge helpers prefer blockedReasons).
    if (reasons.length) next.blockedReason = reasons[0];
    var links = normalizeBlockedLinks(inputs);
    if (
      links.length &&
      (isBlockedWaitingOtherTask(reasons) || links.length > 0)
    ) {
      next.blockedLinks = links;
      // Soft back-compat for older readers expecting a single link.
      next.blockedLink = links[0];
    }
    return Object.assign({}, display, next);
  }

  function withDisplayExtras(display, inputs) {
    var next = withDueDateDisplay(withBlockedDisplay(display, inputs), inputs);
    if (!next) return next;
    if (inputs && inputs.priorityEnabled === false) {
      return Object.assign({}, next, { priorityEnabled: false });
    }
    return next;
  }

  function resolveDisplay(result, inputs, labelSettings) {
    var inputsSafe = inputs || {};
    if (!isInutile(inputsSafe)) {
      if (result && result.eisenhower) {
        var eq = result.eisenhower;
        return withDisplayExtras({
          inutile: false,
          score: result.score,
          label: result.tier.label,
          tierLabel: eq.label,
          matrixLabel: eq.label,
          description: eq.description || '',
          eisenhowerLabel: eq.label,
          eisenhowerQuadrant: eq.id,
          matrixRuleId: null,
          matrixLevels: null,
          matrixEnabled: false,
          matrixDisabled: false,
          fill: eq.fill || result.tier.fill,
          text: eq.text || result.tier.text,
          seg: eq.seg || result.tier.seg,
          tierI: result.tier.i,
          cardTier: result.tier
        }, inputsSafe);
      }
      var settings = labelSettings != null ? labelSettings : matrixSettings;
      var matrix = resolveMatrixLabel(inputsSafe, result.tier, result.score, settings);
      var matrixEnabled = !settings || settings.enabled !== false;
      return withDisplayExtras({
        inutile: false,
        score: result.score,
        label: result.tier.label,
        tierLabel: result.tier.label,
        matrixLabel: matrix && matrix.fromMatrix ? matrix.label : null,
        descriptionTitle:
          matrix && matrix.fromMatrix ? null : (result.tier.title || null),
        description: matrix
          ? matrix.description
          : (result.tier.description || ''),
        matrixRuleId: matrix ? matrix.ruleId : null,
        matrixLevels: matrix ? matrix.levels : null,
        matrixEnabled: matrixEnabled,
        matrixDisabled: matrix ? !!matrix.matrixDisabled : !matrixEnabled,
        fill: result.tier.fill,
        text: result.tier.text,
        seg: result.tier.seg,
        tierI: result.tier.i,
        cardTier: result.tier
      }, inputsSafe);
    }
    return withDisplayExtras({
      inutile: true,
      score: 0,
      label: INUTILE_LABEL,
      descriptionTitle: INUTILE_STYLES.title || '',
      description: INUTILE_STYLES.description || '',
      tierLabel: INUTILE_LABEL,
      matrixRuleId: null,
      matrixLevels: null,
      fill: INUTILE_STYLES.fill,
      text: INUTILE_STYLES.text,
      seg: INUTILE_STYLES.seg,
      tierI: null,
      cardTier: {
        inutile: true,
        i: 'inutile',
        label: INUTILE_LABEL,
        fill: INUTILE_STYLES.fill,
        seg: INUTILE_STYLES.seg
      }
    }, inputsSafe);
  }

  function classicTierLabel(display) {
    if (!display) return '';
    return display.tierLabel || display.label || '';
  }

  function tierDescriptionTitle(display) {
    if (!display) return '';
    if (display.inutile) return INUTILE_STYLES.title || '';
    if (display.matrixLabel) return display.matrixLabel;
    if (display.descriptionTitle) return display.descriptionTitle;
    if (display.tierI == null) return '';
    for (var k = 0; k < TIERS.length; k++) {
      if (TIERS[k].i === display.tierI) return TIERS[k].title || '';
    }
    return '';
  }

  function tierDescriptionBody(display) {
    if (display.inutile) return INUTILE_STYLES.description || '';
    if (display.description) return display.description;
    if (display.tierI == null) return '';
    for (var k = 0; k < TIERS.length; k++) {
      if (TIERS[k].i === display.tierI) return TIERS[k].description || '';
    }
    return '';
  }

  function formatTierDescriptionTooltip(label, title, description) {
    var parts = [];
    if (label) parts.push(label);
    if (title) parts.push(title);
    if (description) parts.push(description);
    return parts.join('. ');
  }

  function tierDescriptionContentKey(display) {
    if (!display) return '';
    if (display.inutile) {
      return 'inutile:' + (INUTILE_STYLES.title || '') + '\n' + (INUTILE_STYLES.description || '');
    }
    if (display.matrixLabel) {
      return 'matrix:' + display.matrixLabel + '\n' + (display.description || '');
    }
    return (
      'tier:' +
      (tierDescriptionTitle(display) || '') +
      '\n' +
      tierDescriptionBody(display)
    );
  }

  function paintTierDescription(el, display) {
    if (!display) {
      el.textContent = '';
      el.hidden = true;
      return;
    }
    var title = tierDescriptionTitle(display);
    var body = tierDescriptionBody(display);
    if (!title && !body) {
      el.textContent = '';
      el.hidden = true;
      return;
    }
    var html = '';
    if (title) {
      html += '<span class="heat-tier-desc-subtitle">' + escapeHtml(title) + '</span>';
    }
    if (body) {
      html += '<span class="heat-tier-desc-body">' + escapeHtml(body) + '</span>';
    }
    el.innerHTML = html;
    el.hidden = false;
    el.style.removeProperty('color');
  }

  function flashHeatTextEnter(el) {
    if (!el) return;
    el.classList.remove('heat-text-enter');
    // Force restart of the enter animation when tier copy swaps.
    void el.offsetWidth;
    el.classList.add('heat-text-enter');
  }

  function captureHeatLayoutRects(nodes) {
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || el.hidden) {
        out.push(null);
        continue;
      }
      out.push(el.getBoundingClientRect());
    }
    return out;
  }

  function playHeatLayoutFlip(nodes, firstRects) {
    if (!firstRects) return;
    if (typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    var lastRects = captureHeatLayoutRects(nodes);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var first = firstRects[i];
      var last = lastRects[i];
      if (!el || !first || !last) continue;
      var dx = first.left - last.left;
      var dy = first.top - last.top;
      var sw = last.width > 0.5 ? first.width / last.width : 1;
      var sh = last.height > 0.5 ? first.height / last.height : 1;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sw - 1) < 0.02 && Math.abs(sh - 1) < 0.02) {
        continue;
      }
      // Avoid extreme scale noise while still easing row/stack and head size shifts.
      sw = Math.max(0.85, Math.min(1.18, sw));
      sh = Math.max(0.85, Math.min(1.18, sh));
      el.classList.add('heat-flip-active');
      el.style.transition = 'none';
      el.style.transformOrigin = 'left top';
      el.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px) scale(' +
        sw.toFixed(4) + ',' + sh.toFixed(4) + ')';
      (function (node) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            node.style.transition = '';
            node.style.transform = '';
            var clearFlip = function () {
              node.classList.remove('heat-flip-active');
              node.removeEventListener('transitionend', clearFlip);
            };
            node.addEventListener('transitionend', clearFlip);
            setTimeout(clearFlip, 280);
          });
        });
      })(el);
    }
  }

  var FORMULA_OPTIONS = [
    {
      key: 'baseline',
      label: 'Score composite',
      description: 'Urgence, impact et facilité fusionnés en un score 0–10 et un palier.'
    },
    {
      key: 'eisenhower',
      label: 'Matrice Eisenhower',
      description: 'Urgence × importance — quatre quadrants : Faire, Planifier, Déléguer, Éliminer.'
    }
  ];

  var EISENHOWER_QUADRANTS = (function () {
    var defs = [
      {
        id: 'do',
        label: 'Faire',
        description: 'Urgent et important. \u00c0 traiter en priorit\u00e9 absolue, sans report.',
        score: 9.0,
        urgent: true,
        important: true,
        preset: { urgency: 3, impact: 3 }
      },
      {
        id: 'schedule',
        label: 'Planifier',
        description: 'Important mais pas urgent. \u00c0 caler dans le backlog avec une date ou un cr\u00e9neau d\u00e9di\u00e9.',
        score: 6.5,
        urgent: false,
        important: true,
        preset: { urgency: 1, impact: 3 }
      },
      {
        id: 'delegate',
        label: 'D\u00e9l\u00e9guer',
        description: 'Urgent mais peu important. \u00c0 confier ou traiter au minimum viable.',
        score: 4.0,
        urgent: true,
        important: false,
        preset: { urgency: 3, impact: 1 }
      },
      {
        id: 'delete',
        label: '\u00c9liminer',
        description: 'Ni urgent ni important. Candidat \u00e0 \u00e9carter, repousser sans limite ou supprimer.',
        score: 1.5,
        urgent: false,
        important: false,
        preset: { urgency: 1, impact: 1 }
      }
    ];
    return defs.map(function (def) {
      var styles = priorityStylesForScore(def.score);
      return {
        id: def.id,
        label: def.label,
        description: def.description,
        score: def.score,
        urgent: def.urgent,
        important: def.important,
        preset: def.preset,
        fill: styles.fill,
        text: styles.text,
        seg: styles.seg
      };
    });
  })();

  var FORMULAS = {
    baseline: {
      calc: calcBaseline,
      format: formatBaseline,
      override: overrideBaseline
    },
    eisenhower: {
      calc: calcEisenhower,
      format: formatEisenhower,
      override: overrideEisenhower
    },
    wsjf: {
      calc: calcWSJF,
      format: formatWSJF,
      override: overrideWSJF
    },
    valueEffort: {
      calc: calcValueEffort,
      format: formatValueEffort,
      override: overrideValueEffort
    }
  };

  // ── 5. Math helpers & tier styling ──────────────────────────────────────

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function snappedLevel(value, min, max) {
    return clamp(Math.round(value), min, max);
  }

  function tierFor(p) {
    for (var k = 0; k < TIERS.length; k++) {
      if (p >= TIERS[k].min) return TIERS[k];
    }
    return TIERS[TIERS.length - 1];
  }

  // Per-tier surface mix (% of tier color into neutral base).
  var TIER_SURFACE_MIX = {
    0: { bg: 42, border: 50, panel: 44 }, // Critique — deepest blue
    1: { bg: 40, border: 48, panel: 40 }, // Urgente
    2: { bg: 34, border: 44, panel: 28 }, // Prioritaire
    3: { bg: 28, border: 38, panel: 22 }, // Importante
    4: { bg: 22, border: 32, panel: 18 }, // Flexible
    5: { bg: 14, border: 26, panel: 14 }, // Secondaire
    6: { bg: 6, border: 20, panel: 8 },   // Optionnelle — lightest blue
    inutile: { bg: 8, border: 22, panel: 82 }, // Inutile — muted gray matching badge
    blocked: { bg: 44, border: 52, panel: 46 } // Bloqué — deep crimson wash
  };

  var TIER_SURFACE_MIX_DARK = {
    0: { bg: 32, border: 42, panel: 24 },
    1: { bg: 30, border: 40, panel: 22 },
    2: { bg: 26, border: 36, panel: 18 },
    3: { bg: 22, border: 32, panel: 14 },
    4: { bg: 18, border: 28, panel: 12 },
    5: { bg: 14, border: 24, panel: 10 },
    6: { bg: 8, border: 18, panel: 8 },
    inutile: { bg: 8, border: 20, panel: 12 },
    blocked: { bg: 36, border: 46, panel: 32 }
  };

  function surfaceMixFor(tier) {
    tier = tier || {};
    var mixKey = tier.blocked ? 'blocked' : (tier.inutile ? 'inutile' : tier.i);
    var table = isDarkTheme() ? TIER_SURFACE_MIX_DARK : TIER_SURFACE_MIX;
    return table[mixKey] || table[TIER_I_MAX];
  }

  function clearCardTierTint(cardEl) {
    if (!cardEl) return;
    cardEl.style.removeProperty('--card-tier-tint');
    cardEl.style.removeProperty('--card-tier-border');
    cardEl.style.removeProperty('--card-tier-tint-mix');
    cardEl.style.removeProperty('--card-tier-border-mix');
    cardEl.style.removeProperty('--card-panel-tint-mix');
    var panel = cardEl.querySelector('.heat-panel');
    if (panel) {
      panel.style.removeProperty('--card-tier-tint');
      panel.style.removeProperty('--card-panel-tint-mix');
    }
  }

  function applyCardTierTint(cardEl, tier) {
    tier = tier || {};
    var visuals = tierVisuals(tier);
    var mix = surfaceMixFor(tier);
    cardEl.style.setProperty('--card-tier-tint', visuals.tint);
    cardEl.style.setProperty('--card-tier-border', visuals.seg);
    cardEl.style.setProperty('--card-tier-tint-mix', mix.bg + '%');
    cardEl.style.setProperty('--card-tier-border-mix', mix.border + '%');
    cardEl.style.setProperty('--card-panel-tint-mix', mix.panel + '%');
    cardEl.dataset.tier = tier.label || '';

    var panel = cardEl.querySelector('.heat-panel');
    if (panel) {
      panel.style.setProperty('--card-tier-tint', visuals.tint);
      panel.style.setProperty('--card-panel-tint-mix', mix.panel + '%');
    }
  }

  function clearSectionGlow(el) {
    if (!el) return;
    el.classList.remove('has-section-glow');
    el.style.removeProperty('--section-glow');
  }

  /** Top radial glow that softens into the section's normal background. */
  function applySectionGlow(el, color) {
    if (!el) return;
    if (!color) {
      clearSectionGlow(el);
      return;
    }
    el.style.setProperty('--section-glow', color);
    el.classList.add('has-section-glow');
  }

  function clearPrioritySectionTint(fieldEl) {
    clearSectionGlow(fieldEl);
  }

  /** Soft shell tint for the Priorité section — same palette as the heat badge. */
  function applyPrioritySectionTint(fieldEl, display, enabled) {
    if (!fieldEl) return;
    if (!enabled) {
      clearPrioritySectionTint(fieldEl);
      return;
    }
    var d = display || {};
    // Keep blocked crimson on Statut only — Priorité follows score/tier colors.
    var visualSource = d.inutile
      ? { inutile: true, label: INUTILE_LABEL }
      : { i: d.tierI, label: d.label };
    var v = tierVisuals(visualSource);
    applySectionGlow(fieldEl, v.seg || v.fill);
  }

  function labelEntry(key, value) {
    var entry = LABELS[key];
    if (!entry) return { short: String(value), detail: '', icon: '' };
    var idx = key === 'ease' ? value : value;
    return {
      icon: entry.icon ? (entry.icon[idx] || '') : '',
      short: entry.short[idx] || String(value),
      detail: entry.detail[idx] || ''
    };
  }

  function wordFor(key, value) {
    var e = labelEntry(key, value);
    return e.short || String(value);
  }

  function wordHtmlFor(key, value) {
    var e = labelEntry(key, value);
    if (!e.short) return escapeHtml(String(value));
    var icon = levelIconSvg(e.icon);
    if (!icon) return escapeHtml(e.short);
    return icon + '<span class="level-label">' + escapeHtml(e.short) + '</span>';
  }

  function affirmationFor(key, value) {
    var entry = LABELS[key];
    if (!entry || !entry.affirmations) return '';
    return entry.affirmations[value] || '';
  }

  function affirmationDisplayText(key, value) {
    var affirmText = affirmationFor(key, value);
    if (affirmText) return affirmText;
    var entry = labelEntry(key, value);
    if (entry.detail) return entry.detail;
    return entry.short || '';
  }

  // ── 6. Scoring formulas ─────────────────────────────────────────────────

  function mergePressure(T, B) {
    return clamp(WT * T + WB * B, 0, PRESSURE_MAX);
  }

  var URGENCY_PRESSURE_PRESETS = URGENCY_TO_TB.map(function (tb) {
    return mergePressure(tb.T, tb.B);
  });

  function urgencyLevelToPressure(level) {
    var u = clamp(level, 0, 4);
    var lo = Math.floor(u);
    var hi = Math.min(lo + 1, 4);
    var t = u - lo;
    return lerp(URGENCY_PRESSURE_PRESETS[lo], URGENCY_PRESSURE_PRESETS[hi], t);
  }

  function pressureToUrgencyLevel(pressure) {
    var best = 0;
    var bestDiff = Infinity;
    for (var u = 0; u <= 4; u++) {
      var diff = Math.abs(urgencyLevelToPressure(u) - pressure);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = u;
      }
    }
    return best;
  }

  function impactTerm(I, F) {
    return WI * I * F / 5;
  }

  function curveImpact(I) {
    return Math.pow(I / 4, IMPACT_EXP) * 4;
  }

  // Effort dampening: rises with U×I; capped below 1 so ease still contributes at max U+I.
  function dampenCurve(U, I) {
    var ui = (U / 4) * (I / 4);
    return Math.pow(ui, DAMPEN_POWER) * DAMPEN_MAX;
  }

  function effectiveEaseF(U, I, F) {
    if (U >= 3 && I >= 3) return Math.max(F, EASE_FLOOR);
    return F;
  }

  // Smooth ramp U=3→4 so boost has no step at max urgency (graph + score).
  function urgencyBoostRamp(U) {
    if (U <= URGENCY_BOOST_MIN_U - 1) return 0;
    if (U >= URGENCY_BOOST_MIN_U) return 1;
    var t = U - (URGENCY_BOOST_MIN_U - 1);
    return t * t * (3 - 2 * t);
  }

  // Low-impact urgency floor: max U with little I still reaches Urgente tier.
  function urgencyBoost(U, I, dampen) {
    var ramp = urgencyBoostRamp(U);
    if (ramp <= 0) return 0;
    var impactFactor = Math.max(0, 1 - I / 4);
    if (impactFactor <= 0) return 0;
    return URGENCY_BOOST_MAX * Math.pow(U / 4, 2) * (1 - dampen) * impactFactor * ramp;
  }

  // Baseline score (0–10):
  //   core         = lerp((pressure+impactCore)×easeMul, pressure+impactCore×easeMul, ramp(U)), ramp smooth U=3→4
  //   pressure     = urgencyLevelToPressure(U)           — fused time+blocking (0–6)
  //   impactCore   = WI × curveImpact(I) × hardFactor  — hardFactor attenuated when U≥3
  //   urgencyBoost = URGENCY_BOOST_MAX×(U/4)²×(1−dampen)×max(0,1−I/4)×ramp(U), ramp smooth U=3→4
  //   easeTerm     = easeWeight × (I/4 + EASE_BASE) × (F/5)^γ × EASE_SCALE
  //   easeWeight   = WI_EASE × (1 − dampen × 0.85)      — full ease weight when not urgent
  //   easeMul      = lerp(0.75, 1.25, (F−1)/4)         — boosts easy tasks at moderate U+I
  //   dampen       = ((U/4)×(I/4))^DAMPEN_POWER × DAMPEN_MAX
  //   effectiveF   = max(F, EASE_FLOOR) when U≥3 and I≥3
  //   rawScore     = core + easeTerm + urgencyBoost
  //   score        = clamp(rawScore × (10 / rawMax), 0, 10)
  //   rawMax       = rawScore at U=4, I=4, F=5 (all max → exactly 10.0)
  function calcBaselineTermsRaw(U, I, F) {
    var pressure = urgencyLevelToPressure(U);
    var impactCore = WI * curveImpact(I);
    var effectiveF = effectiveEaseF(U, I, F);
    var dampen = dampenCurve(U, I);
    var easeBoost = Math.pow(effectiveF / 5, GAMMA_EASE);
    var easeWeight = WI_EASE * (1 - dampen * DAMPEN_EASE_ATTENUATION);
    var easeTerm = easeWeight * (I / 4 + EASE_BASE) * easeBoost * EASE_SCALE;

    var hardFactor = 1;
    if (F <= 2 && dampen < EASE_MUL_DAMPEN_THRESHOLD) {
      hardFactor = lerp(HARD_PENALTY_FLOOR, 1, (F - 1));
      if (U >= 3) {
        var urgShield = 1 - Math.pow(U / 4, 2) * (1 - dampen);
        hardFactor = lerp(hardFactor, 1, urgShield);
      }
      impactCore = impactCore * hardFactor;
    }

    var core = pressure + impactCore;
    var easeMul = 1;
    if (dampen < EASE_MUL_DAMPEN_THRESHOLD) {
      easeMul = lerp(EASE_MUL_LO, EASE_MUL_HI, (F - 1) / 4);
      var impactOnlyBlend = urgencyBoostRamp(U);
      var wholeCore = (pressure + impactCore) * easeMul;
      var impactOnlyCore = pressure + impactCore * easeMul;
      core = lerp(wholeCore, impactOnlyCore, impactOnlyBlend);
    }

    var rawScore = core + easeTerm + urgencyBoost(U, I, dampen);
    return {
      pressure: pressure,
      impactCore: impactCore,
      easeTerm: easeTerm,
      dampen: dampen,
      effectiveF: effectiveF,
      easeBoost: easeBoost,
      easeWeight: easeWeight,
      easeMul: easeMul,
      hardFactor: hardFactor,
      rawScore: rawScore,
      U: U,
      I: I,
      F: F
    };
  }

  var BASELINE_RAW_MAX = calcBaselineTermsRaw(4, 4, 5).rawScore;
  var BASELINE_SCORE_SCALE = 10 / BASELINE_RAW_MAX;

  function scaleBaselineTerms(terms) {
    var s = BASELINE_SCORE_SCALE;
    return {
      pressure: terms.pressure * s,
      impactCore: terms.impactCore * s,
      easeTerm: terms.easeTerm * s,
      dampen: terms.dampen,
      effectiveF: terms.effectiveF,
      easeBoost: terms.easeBoost,
      easeWeight: terms.easeWeight,
      easeMul: terms.easeMul,
      hardFactor: terms.hardFactor,
      rawScore: terms.rawScore,
      score: clamp(terms.rawScore * s, 0, 10),
      U: terms.U,
      I: terms.I,
      F: terms.F
    };
  }

  function calcBaselineTerms(U, I, F) {
    return scaleBaselineTerms(calcBaselineTermsRaw(U, I, F));
  }

  function jobSize(F) {
    return Math.max(6 - F, 1);
  }

  function readInputs(inputs) {
    var U = inputs.urgency;
    var I = inputs.impact;
    var F = inputs.ease;
    var pressure = urgencyLevelToPressure(U);
    var imp = impactTerm(I, F);
    var importance = 0.5 + I / 4;
    var urgencyNorm = pressure / PRESSURE_MAX;
    var js = jobSize(F);
    return { U: U, I: I, F: F, pressure: pressure, imp: imp, importance: importance, urgencyNorm: urgencyNorm, jobSize: js };
  }

  function calcBaseline(inputs) {
    var d = readInputs(inputs);
    var t = calcBaselineTerms(d.U, d.I, d.F);
    return {
      score: t.score,
      pressure: t.pressure,
      impactCore: t.impactCore,
      easeTerm: t.easeTerm,
      dampen: t.dampen,
      effectiveF: t.effectiveF,
      terms: {
        pressure: t.pressure,
        impactCore: t.impactCore,
        easeTerm: t.easeTerm,
        dampen: t.dampen,
        effectiveF: t.effectiveF,
        easeMul: t.easeMul,
        hardFactor: t.hardFactor,
        U: d.U,
        I: d.I,
        F: d.F
      },
      tier: tierFor(t.score)
    };
  }

  function isEisenhowerUrgent(U) {
    return U >= EISENHOWER_URGENCY_THRESHOLD;
  }

  function isEisenhowerImportant(I) {
    return I >= EISENHOWER_IMPACT_THRESHOLD;
  }

  function eisenhowerQuadrantFor(U, I) {
    var urgent = isEisenhowerUrgent(U);
    var important = isEisenhowerImportant(I);
    if (urgent && important) return EISENHOWER_QUADRANTS[0];
    if (!urgent && important) return EISENHOWER_QUADRANTS[1];
    if (urgent && !important) return EISENHOWER_QUADRANTS[2];
    return EISENHOWER_QUADRANTS[3];
  }

  function eisenhowerQuadrantById(id) {
    for (var i = 0; i < EISENHOWER_QUADRANTS.length; i++) {
      if (EISENHOWER_QUADRANTS[i].id === id) return EISENHOWER_QUADRANTS[i];
    }
    return null;
  }

  function calcEisenhower(inputs) {
    var d = readInputs(inputs);
    var quadrant = eisenhowerQuadrantFor(d.U, d.I);
    return {
      score: quadrant.score,
      terms: {
        pressure: d.pressure,
        importance: d.importance,
        urgencyNorm: d.urgencyNorm,
        urgent: isEisenhowerUrgent(d.U),
        important: isEisenhowerImportant(d.I),
        quadrantId: quadrant.id,
        U: d.U,
        I: d.I,
        F: d.F
      },
      eisenhower: quadrant,
      tier: tierFor(quadrant.score)
    };
  }

  function calcWSJF(inputs) {
    var d = readInputs(inputs);
    var p = clamp((d.pressure / d.jobSize) * WSJF_SCALE, 0, 10);
    return {
      score: p,
      terms: { pressure: d.pressure, jobSize: d.jobSize, U: d.U, I: d.I, F: d.F },
      tier: tierFor(p)
    };
  }

  function calcValueEffort(inputs) {
    var d = readInputs(inputs);
    var p = clamp((d.I * d.urgencyNorm / d.jobSize) * VALUE_EFFORT_SCALE, 0, 10);
    return {
      score: p,
      terms: { pressure: d.pressure, urgencyNorm: d.urgencyNorm, jobSize: d.jobSize, U: d.U, I: d.I, F: d.F },
      tier: tierFor(p)
    };
  }

  // ── 7. Formatters & heat-preset override solvers ────────────────────────

  function formatScore(score) {
    return Number(score).toFixed(1);
  }

  function formatBaseline(terms, score) {
    var dampPct = (terms.dampen * 100).toFixed(0);
    var easeMulNote = terms.easeMul != null && terms.easeMul !== 1
      ? ', ×' + terms.easeMul.toFixed(2) + ' noyau'
      : '';
    return (
      'Pression d\'urgence → ' + terms.pressure.toFixed(1) +
      '   ·   Impact → ' + terms.impactCore.toFixed(1) +
      '   ·   Facilité → ' + terms.easeTerm.toFixed(1) +
      ' (attén. ' + dampPct + ' %, F eff. ' + terms.effectiveF.toFixed(1) + easeMulNote + ')' +
      '   =   ' + formatScore(score)
    );
  }

  function formatEisenhower(terms, score) {
    var quadrant = eisenhowerQuadrantById(terms.quadrantId);
    var label = quadrant ? quadrant.label : 'Quadrant';
    return (
      'Urgence ' + (terms.urgent ? 'oui' : 'non') +
      ' · Impact ' + (terms.important ? 'important' : 'secondaire') +
      ' → ' + label +
      '   =   ' + formatScore(score)
    );
  }

  function formatWSJF(terms, score) {
    return (
      'Pression ÷ taille → ' + terms.pressure.toFixed(1) + ' ÷ ' + terms.jobSize.toFixed(0) +
      ' × ' + WSJF_SCALE.toFixed(2) +
      '   =   ' + formatScore(score)
    );
  }

  function formatValueEffort(terms, score) {
    return (
      '(Impact × Urgence÷6) ÷ facilité → (' + terms.I + ' × ' + terms.urgencyNorm.toFixed(2) + ') ÷ ' + terms.jobSize.toFixed(0) +
      ' × ' + VALUE_EFFORT_SCALE +
      '   =   ' + formatScore(score)
    );
  }

  function formatSliderLevel(n) {
    return Math.abs(n - Math.round(n)) < 0.01 ? String(Math.round(n)) : n.toFixed(1);
  }

  function breakdownRowTerm(label, level, value, detail, textValue) {
    return {
      kind: 'term',
      label: label,
      level: level,
      value: value,
      detail: detail || null,
      textValue: !!textValue
    };
  }

  function breakdownRowSub(text) {
    return { kind: 'sub', text: text };
  }

  function breakdownRowInfo(label, value) {
    return { kind: 'info', label: label, value: value };
  }

  function breakdownRowTotal(score) {
    return { kind: 'total', value: formatScore(score) };
  }

  function breakdownRowToLine(row) {
    if (row.kind === 'term') {
      var line = row.label + ' (' + row.level + ')';
      if (row.detail) line += ' \u2192 ' + row.detail + ' ' + row.value;
      else line += ' \u2192 ' + row.value;
      return line;
    }
    if (row.kind === 'sub') return row.text;
    if (row.kind === 'info') return row.label + ' : ' + row.value;
    if (row.kind === 'total') return '= ' + row.value + ' / 10';
    return '';
  }

  function breakdownFromRows(rows, shortLabel) {
    var lines = rows.map(breakdownRowToLine).filter(Boolean);
    return {
      rows: rows,
      lines: lines,
      text: lines.join('\n'),
      short: shortLabel || 'D\u00e9tail du score'
    };
  }

  function renderScoreBreakdownTooltip(breakdown, container) {
    container.replaceChildren();
    var wrap = document.createElement('div');
    wrap.className = 'heat-score-tooltip-rows';

    breakdown.rows.forEach(function (row) {
      if (row.kind === 'term') {
        var term = document.createElement('div');
        term.className = 'heat-score-tooltip-term';

        var main = document.createElement('div');
        main.className = 'heat-score-tooltip-term-main';
        var label = document.createElement('span');
        label.className = 'heat-score-tooltip-label';
        label.textContent = row.label;
        var level = document.createElement('span');
        level.className = 'heat-score-tooltip-level';
        level.textContent = row.level;
        main.appendChild(label);
        main.appendChild(level);

        var contrib = document.createElement('div');
        contrib.className = 'heat-score-tooltip-term-contrib';
        if (row.detail) {
          var detail = document.createElement('span');
          detail.className = 'heat-score-tooltip-detail';
          detail.textContent = row.detail;
          contrib.appendChild(detail);
        }
        var value = document.createElement('span');
        value.className = row.textValue
          ? 'heat-score-tooltip-status'
          : 'heat-score-tooltip-value';
        value.textContent = row.value;
        contrib.appendChild(value);

        term.appendChild(main);
        term.appendChild(contrib);
        wrap.appendChild(term);
        return;
      }

      if (row.kind === 'sub') {
        var sub = document.createElement('div');
        sub.className = 'heat-score-tooltip-sub';
        sub.textContent = row.text;
        wrap.appendChild(sub);
        return;
      }

      if (row.kind === 'info') {
        var info = document.createElement('div');
        info.className = 'heat-score-tooltip-info';
        var infoLabel = document.createElement('span');
        infoLabel.className = 'heat-score-tooltip-info-label';
        infoLabel.textContent = row.label;
        var infoValue = document.createElement('span');
        infoValue.className = 'heat-score-tooltip-info-value';
        infoValue.textContent = row.value;
        info.appendChild(infoLabel);
        info.appendChild(infoValue);
        wrap.appendChild(info);
        return;
      }

      if (row.kind === 'total') {
        var total = document.createElement('div');
        total.className = 'heat-score-tooltip-total';
        var totalValue = document.createElement('span');
        totalValue.className = 'heat-score-tooltip-total-value';
        totalValue.textContent = row.value;
        var totalMax = document.createElement('span');
        totalMax.className = 'heat-score-tooltip-total-max';
        totalMax.textContent = '/ 10';
        total.appendChild(totalValue);
        total.appendChild(totalMax);
        wrap.appendChild(total);
      }
    });

    container.appendChild(wrap);
  }

  function formatBaselineBreakdown(result) {
    var t = result.terms;
    var rows = [
      breakdownRowTerm('Urgence', formatSliderLevel(t.U), t.pressure.toFixed(1), 'Pression'),
      breakdownRowTerm('Impact', formatSliderLevel(t.I), t.impactCore.toFixed(1))
    ];
    if (t.hardFactor != null && t.hardFactor < 0.999) {
      rows.push(breakdownRowSub('P\u00e9nalit\u00e9 effort \u00d7' + t.hardFactor.toFixed(2)));
    }
    rows.push(breakdownRowTerm('Facilit\u00e9', formatSliderLevel(t.F), t.easeTerm.toFixed(1)));
    if (t.dampen > 0.01) {
      rows.push(breakdownRowSub('Att\u00e9nuation ' + (t.dampen * 100).toFixed(0) + ' %'));
    }
    if (t.easeMul != null && Math.abs(t.easeMul - 1) > 0.01) {
      rows.push(breakdownRowSub('Multiplicateur noyau \u00d7' + t.easeMul.toFixed(2)));
    }
    rows.push(breakdownRowTotal(result.score));
    return breakdownFromRows(rows, 'Comment ce score est calcul\u00e9');
  }

  function formatEisenhowerBreakdown(result) {
    var t = result.terms;
    var quadrant = result.eisenhower || eisenhowerQuadrantById(t.quadrantId);
    return breakdownFromRows([
      breakdownRowTerm(
        'Urgence',
        formatSliderLevel(t.U),
        t.urgent ? 'Urgent' : 'Pas urgent',
        null,
        true
      ),
      breakdownRowSub('Seuil urgent \u2265 ' + EISENHOWER_URGENCY_THRESHOLD),
      breakdownRowTerm(
        'Impact',
        formatSliderLevel(t.I),
        t.important ? 'Important' : 'Peu important',
        null,
        true
      ),
      breakdownRowSub('Seuil important \u2265 ' + EISENHOWER_IMPACT_THRESHOLD),
      breakdownRowInfo('Quadrant', quadrant ? quadrant.label : ''),
      breakdownRowTotal(result.score)
    ], 'Matrice Eisenhower');
  }

  function formatWSJFBreakdown(result) {
    var t = result.terms;
    return breakdownFromRows([
      breakdownRowTerm('Urgence', formatSliderLevel(t.U), t.pressure.toFixed(1), 'Pression'),
      breakdownRowTerm('Facilit\u00e9', formatSliderLevel(t.F), t.jobSize.toFixed(0), 'Taille'),
      breakdownRowInfo(
        'Calcul',
        t.pressure.toFixed(1) + ' \u00f7 ' + t.jobSize.toFixed(0) + ' \u00d7 ' + WSJF_SCALE.toFixed(2)
      ),
      breakdownRowTotal(result.score)
    ]);
  }

  function formatValueEffortBreakdown(result) {
    var t = result.terms;
    return breakdownFromRows([
      breakdownRowInfo('Impact', formatSliderLevel(t.I)),
      breakdownRowInfo('Urgence', formatSliderLevel(t.U)),
      breakdownRowTerm('Facilit\u00e9', formatSliderLevel(t.F), t.jobSize.toFixed(0), 'Taille'),
      breakdownRowInfo(
        'Calcul',
        '(' + t.I + ' \u00d7 ' + t.urgencyNorm.toFixed(2) + ') \u00f7 ' + t.jobSize.toFixed(0) +
          ' \u00d7 ' + VALUE_EFFORT_SCALE
      ),
      breakdownRowTotal(result.score)
    ]);
  }

  var SCORE_BREAKDOWNS = {
    baseline: formatBaselineBreakdown,
    eisenhower: formatEisenhowerBreakdown,
    wsjf: formatWSJFBreakdown,
    valueEffort: formatValueEffortBreakdown,
    threeD: formatBaselineBreakdown
  };

  function formatScoreBreakdown(formulaKey, result) {
    var fn = SCORE_BREAKDOWNS[formulaKey] || formatBaselineBreakdown;
    return fn(result);
  }

  function baselineScore(U, I, F) {
    return calcBaselineTerms(U, I, F).score;
  }

  function betterBaselineOverride(score, u, i, f, best, targetP, curU, curI, curF) {
    if (!best) return true;
    var dist = Math.abs(score - targetP);
    var bestDist = Math.abs(best.score - targetP);
    if (dist < bestDist - 1e-9) return true;
    if (dist > bestDist + 1e-9) return false;
    var candUnder = score < targetP - 1e-9;
    var bestUnder = best.score < targetP - 1e-9;
    if (candUnder !== bestUnder) return bestUnder;
    var move = Math.abs(u - curU) + Math.abs(i - curI) + Math.abs(f - curF);
    var bestMove = Math.abs(best.urgency - curU) + Math.abs(best.impact - curI) + Math.abs(best.ease - curF);
    if (move !== bestMove) return move < bestMove;
    return score > best.score;
  }

  var HEAT_TARGET_EPS = 0.05;

  function heatSegmentForTarget(targetP) {
    for (var k = 0; k < HEAT_SEGMENTS.length; k++) {
      var seg = HEAT_SEGMENTS[k];
      if (Math.abs(seg.target - targetP) < HEAT_TARGET_EPS) return seg;
    }
    return null;
  }

  function heatPresetForTarget(targetP) {
    var seg = heatSegmentForTarget(targetP);
    return seg && seg.preset ? seg.preset : null;
  }

  function pickOverrideDelta(current, next) {
    var delta = {};
    ['urgency', 'impact', 'ease'].forEach(function (key) {
      var cur = current[key] != null ? current[key] : 0;
      var nxt = next[key] != null ? next[key] : cur;
      if (Math.abs(cur - nxt) >= 1e-9) delta[key] = nxt;
    });
    return delta;
  }

  function overrideBaseline(targetP, inputs) {
    var curU = inputs.urgency != null ? inputs.urgency : 0;
    var curI = inputs.impact != null ? inputs.impact : 0;
    var curF = inputs.ease != null ? inputs.ease : 5;
    var curScore = baselineScore(curU, curI, curF);
    var targetSeg = heatSegmentForTarget(targetP);
    var sameTier = targetSeg && tierFor(curScore).i === targetSeg.i;

    if (sameTier) {
      return { urgency: curU, impact: curI, ease: curF };
    }

    var fMin = sameTier ? curF : 1;
    var fMax = sameTier ? curF : 5;
    var best = null;
    for (var u = 0; u <= AXIS_UI_MAX; u++) {
      for (var i = 0; i <= AXIS_UI_MAX; i++) {
        for (var f = fMin; f <= fMax; f++) {
          var score = baselineScore(u, i, f);
          if (!betterBaselineOverride(score, u, i, f, best, targetP, curU, curI, curF)) continue;
          best = { score: score, urgency: u, impact: i, ease: f };
        }
      }
    }
    return { urgency: best.urgency, impact: best.impact, ease: best.ease };
  }

  function overrideEisenhower(targetP, inputs) {
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < EISENHOWER_QUADRANTS.length; i++) {
      var q = EISENHOWER_QUADRANTS[i];
      var dist = Math.abs(q.score - targetP);
      if (dist < bestDist) {
        bestDist = dist;
        best = q;
      }
    }
    if (!best) return { urgency: inputs.urgency, impact: inputs.impact, ease: inputs.ease };
    return {
      urgency: best.preset.urgency,
      impact: best.preset.impact,
      ease: inputs.ease != null ? inputs.ease : 3
    };
  }

  function overrideWSJF(targetP, inputs) {
    var d = readInputs(inputs);
    var curScore = (d.pressure / d.jobSize) * WSJF_SCALE;
    var tPressure, tJob;
    if (curScore > 0.001) {
      var r = targetP / curScore;
      tPressure = d.pressure * r;
      tJob = d.jobSize / r;
    } else {
      tPressure = targetP / WSJF_SCALE;
      tJob = 1;
    }
    var nU = pressureToUrgencyLevel(clamp(tPressure, 0, PRESSURE_MAX));
    var nF = clamp(Math.round(6 - clamp(tJob, 1, 5)), 1, 5);
    return { urgency: nU, impact: inputs.impact, ease: nF };
  }

  function overrideValueEffort(targetP, inputs) {
    var d = readInputs(inputs);
    var curScore = (d.I * d.urgencyNorm / d.jobSize) * VALUE_EFFORT_SCALE;
    var tINorm, tUrg, tJob;
    if (curScore > 0.001) {
      var r = targetP / curScore;
      tINorm = d.I * r;
      tUrg = d.urgencyNorm * Math.sqrt(r);
      tJob = d.jobSize / Math.sqrt(r);
    } else {
      tINorm = 2;
      tUrg = targetP / (VALUE_EFFORT_SCALE * 2);
      tJob = 3;
    }
    var nI = clamp(Math.round(tINorm), 0, 4);
    var nU = pressureToUrgencyLevel(clamp(tUrg, 0, 1) * PRESSURE_MAX);
    var nF = clamp(Math.round(6 - clamp(tJob, 1, 5)), 1, 5);
    return { urgency: nU, impact: nI, ease: nF };
  }

  // ── 8. Help modal ───────────────────────────────────────────────────────

  var modalRoot = null;
  var modalContext = null;
  var wizardContext = null;

  function ensureModalRoot() {
    if (modalRoot) return modalRoot;
    modalRoot = document.createElement('div');
    modalRoot.className = 'help-modal-root';
    modalRoot.innerHTML =
      '<div class="help-modal-backdrop" data-close></div>' +
      '<div class="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-modal-title">' +
        '<header class="help-modal-header">' +
          '<button type="button" class="help-modal-close help-modal-close--top" aria-label="Fermer">&times;</button>' +
          '<h3 class="help-modal-title" id="help-modal-title"></h3>' +
          '<blockquote class="help-modal-quote" hidden></blockquote>' +
        '</header>' +
        '<div class="help-modal-content">' +
          '<ol class="help-modal-levels"></ol>' +
          '<div class="help-modal-body"></div>' +
        '</div>' +
        '<footer class="help-modal-footer">' +
          '<div class="help-modal-wizard-nav">' +
            '<button type="button" class="help-modal-nav help-modal-prev" hidden>Précédent</button>' +
            '<button type="button" class="help-modal-close help-modal-close--bottom">Fermer</button>' +
            '<button type="button" class="help-modal-nav help-modal-next" hidden>Suivant</button>' +
          '</div>' +
        '</footer>' +
      '</div>';
    document.body.appendChild(modalRoot);

    modalRoot.querySelector('.help-modal-backdrop').addEventListener('click', closeHelpModal);
    modalRoot.querySelectorAll('.help-modal-close').forEach(function (btn) {
      btn.addEventListener('click', closeHelpModal);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalRoot.classList.contains('open')) closeHelpModal();
    });
    return modalRoot;
  }

  function scrollHelpModalLevelIntoView(listItem) {
    if (!listItem || !modalRoot) return;
    var content = modalRoot.querySelector('.help-modal-content');
    if (!content) return;
    var contentRect = content.getBoundingClientRect();
    var elRect = listItem.getBoundingClientRect();
    if (elRect.top < contentRect.top) {
      content.scrollTop -= contentRect.top - elRect.top;
    } else if (elRect.bottom > contentRect.bottom) {
      content.scrollTop += elRect.bottom - contentRect.bottom;
    }
  }

  function paintHelpModalLevels() {
    if (!modalRoot || !modalContext) return;
    var list = modalRoot.querySelector('ol.help-modal-levels');
    if (!list) return;

    var current = snappedLevel(modalContext.currentValue, modalContext.min, modalContext.max);
    var currentEl = null;
    list.querySelectorAll('li').forEach(function (li) {
      var level = +li.dataset.level;
      var isCurrent = level === current;
      li.classList.toggle('is-current', isCurrent);
      li.setAttribute('aria-current', isCurrent ? 'true' : 'false');
      if (isCurrent) currentEl = li;
    });
    if (currentEl) {
      scrollHelpModalLevelIntoView(currentEl);
    }
  }

  function paintHelpModalFooter(wizard) {
    if (!modalRoot) return;
    var prevBtn = modalRoot.querySelector('.help-modal-prev');
    var nextBtn = modalRoot.querySelector('.help-modal-next');
    if (!prevBtn || !nextBtn) return;

    if (wizard && wizard.total > 1) {
      prevBtn.hidden = false;
      nextBtn.hidden = false;
      prevBtn.disabled = wizard.step <= 0;
      var isLast = wizard.step >= wizard.total - 1;
      nextBtn.textContent = isLast ? 'Terminer' : 'Suivant';
      prevBtn.onclick = function () {
        if (wizard.onPrev) wizard.onPrev();
      };
      nextBtn.onclick = function () {
        if (wizard.onNext) wizard.onNext();
      };
    } else {
      prevBtn.hidden = true;
      nextBtn.hidden = true;
      prevBtn.onclick = null;
      nextBtn.onclick = null;
    }
  }

  function openHelpModal(wordsKey, title, config) {
    config = config || {};
    var root = ensureModalRoot();
    var entry = LABELS[wordsKey];
    if (!entry) return;

    var min = config.min != null ? config.min : 0;
    var max = config.max != null ? config.max : 4;
    modalContext = {
      wordsKey: wordsKey,
      min: min,
      max: max,
      currentValue: config.currentValue != null ? config.currentValue : min,
      onSelect: config.onSelect || null
    };

    var titleEl = root.querySelector('.help-modal-title');
    var icon = config.icon || PROPERTY_ICONS[wordsKey] || 'ti-adjustments';
    titleEl.textContent = '';
    var iconEl = document.createElement('i');
    iconEl.className = 'ti ' + icon;
    iconEl.setAttribute('aria-hidden', 'true');
    titleEl.appendChild(iconEl);
    titleEl.appendChild(document.createTextNode(' ' + title));

    var popup = entry.popup || {};
    var quoteEl = root.querySelector('.help-modal-quote');
    var body = root.querySelector('.help-modal-body');
    var list = root.querySelector('ol.help-modal-levels');

    var quote = popup.subtitle || QUESTIONS[wordsKey] || '';
    quoteEl.textContent = quote;
    quoteEl.hidden = !quote;

    list.innerHTML = '';
    var start = wordsKey === 'ease' ? 1 : 0;
    var end = entry.short.length - 1;
    var selectable = typeof modalContext.onSelect === 'function';
    for (var i = start; i <= end; i++) {
      var rowText = affirmationDisplayText(wordsKey, i);
      if (!rowText && !entry.detail[i]) continue;
      var li = document.createElement('li');
      li.dataset.level = String(i);
      li.appendChild(createHelpLevelDot(i, start, end));
      if (selectable) {
        li.className = 'is-selectable-row';
        var textEl = document.createElement('span');
        textEl.className = 'help-modal-level-text is-selectable';
        textEl.textContent = rowText;
        textEl.setAttribute('role', 'button');
        textEl.setAttribute('tabindex', '0');
        textEl.setAttribute('aria-label', rowText);
        li.appendChild(textEl);
        (function (level, target) {
          function selectLevel() {
            modalContext.currentValue = level;
            modalContext.onSelect(level);
            paintHelpModalLevels();
          }
          target.addEventListener('click', selectLevel);
          target.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectLevel();
            }
          });
        })(i, textEl);
      } else {
        var content = document.createElement('span');
        content.className = 'help-modal-level-content';
        content.innerHTML =
          '<span class="help-modal-level-label">' + escapeHtml(entry.short[i]) + '</span>' +
          '<span class="help-modal-level-text">' + escapeHtml(entry.detail[i]) + '</span>';
        li.appendChild(content);
      }
      list.appendChild(li);
    }
    list.hidden = list.childNodes.length === 0;

    body.innerHTML = '';
    [popup.intro, popup.guidance].forEach(function (text) {
      if (!text) return;
      var p = document.createElement('p');
      p.textContent = text;
      body.appendChild(p);
    });
    body.hidden = body.childNodes.length === 0;

    paintHelpModalLevels();
    paintHelpModalFooter(config.wizard || null);

    var modalEl = root.querySelector('.help-modal');
    if (modalEl) {
      modalEl.classList.toggle('help-modal--wizard', !!(config.wizard && config.wizard.total > 1));
    }

    var contentEl = root.querySelector('.help-modal-content');
    if (contentEl) contentEl.scrollTop = 0;

    root.classList.add('open');
    document.body.classList.add('help-modal-open');
    var focusTarget = config.wizard
      ? root.querySelector('.help-modal-next')
      : root.querySelector('.help-modal-close--bottom');
    if (focusTarget) focusTarget.focus();
  }

  function closeHelpModal() {
    if (modalRoot) modalRoot.classList.remove('open');
    document.body.classList.remove('help-modal-open');
    modalContext = null;
    wizardContext = null;
  }

  function showWizardStep(step) {
    if (!wizardContext) return;
    var dims = wizardContext.dimensions;
    if (!dims.length) return;
    step = clamp(step, 0, dims.length - 1);
    wizardContext.step = step;
    var dim = dims[step];
    var wordsKey = dim.wordsKey || dim.key;

    openHelpModal(wordsKey, dim.label, {
      icon: dim.icon,
      min: dim.min,
      max: dim.max,
      currentValue: wizardContext.getValue(dim.key),
      onSelect: function (level) {
        wizardContext.setValue(dim.key, level);
      },
      wizard: {
        step: step,
        total: dims.length,
        onPrev: function () {
          showWizardStep(step - 1);
        },
        onNext: function () {
          if (step < dims.length - 1) {
            showWizardStep(step + 1);
          } else {
            var onComplete = wizardContext.onComplete;
            closeHelpModal();
            if (onComplete) onComplete();
          }
        }
      }
    });
  }

  function openCriteriaWizard(dimensions, hooks) {
    hooks = hooks || {};
    if (!dimensions || !dimensions.length) return;
    var initialStep = hooks.initialStep != null ? hooks.initialStep : 0;
    initialStep = clamp(initialStep, 0, dimensions.length - 1);
    wizardContext = {
      dimensions: dimensions,
      step: initialStep,
      getValue: hooks.getValue || function () { return 0; },
      setValue: hooks.setValue || function () {},
      onComplete: hooks.onComplete || null
    };
    showWizardStep(initialStep);
  }

  // ── 9. Form controls (field, heat panel, calc graph) ────────────────────

  // Impact reach (Personnel → Global) — orange quake ring wrapping the globe.
  // Radii grow from a small epicenter disc to the full sphere outline (3D wrap).
  var IMPACT_GLOBE = { cx: 60, cy: 44, rx: 32, ry: 30 };
  var IMPACT_REACH_COLORS = ['#e8a838', '#e8922e', '#e07028', '#d45520', '#c43c18'];
  // [rx, ry] — ry opens toward sphere aspect so the ring reads as wrapping the globe.
  var IMPACT_REACH_ELLIPSES = [
    [7, 3.5],
    [14, 8],
    [21, 15],
    [27, 23],
    [IMPACT_GLOBE.rx, IMPACT_GLOBE.ry]
  ];

  // Facilité estimated duration: log-spaced presets ~minutes → years.
  var DURATION_MIN_MINUTES = 5;
  var DURATION_MAX_MINUTES = Math.round(2 * 365.25 * 24 * 60);
  var DURATION_CRACK_MINUTES = Math.round(365.25 * 24 * 60);
  var DURATION_TICKS = [
    { label: 'Quelques minutes', minutes: 15 },
    { label: 'Quelques heures', minutes: 3 * 60 },
    { label: 'Quelques jours', minutes: 3 * 24 * 60 },
    { label: 'Quelques semaines', minutes: 3 * 7 * 24 * 60 },
    { label: 'Quelques mois', minutes: 3 * 30 * 24 * 60 },
    { label: 'Quelques ann\u00e9es', minutes: DURATION_MAX_MINUTES }
  ];
  var DURATION_UNITS = [
    { id: 'min', label: 'min', minutes: 1 },
    { id: 'h', label: 'h', minutes: 60 },
    { id: 'j', label: 'j', minutes: 24 * 60 },
    { id: 'sem', label: 'sem', minutes: 7 * 24 * 60 },
    { id: 'mois', label: 'mois', minutes: 30 * 24 * 60 },
    { id: 'ans', label: 'ans', minutes: 365.25 * 24 * 60 }
  ];

  function clampDurationMinutes(minutes) {
    var v = typeof minutes === 'number' ? minutes : parseFloat(minutes);
    if (!isFinite(v) || v <= 0) return null;
    return Math.max(
      DURATION_MIN_MINUTES,
      Math.min(DURATION_MAX_MINUTES, Math.round(v))
    );
  }

  function durationToSlider(minutes) {
    var m = clampDurationMinutes(minutes);
    if (m == null) return 0;
    var logMin = Math.log(DURATION_MIN_MINUTES);
    var logMax = Math.log(DURATION_MAX_MINUTES);
    return (
      ((Math.log(m) - logMin) / (logMax - logMin)) * 100
    );
  }

  function sliderToDuration(t) {
    var x = clamp(typeof t === 'number' ? t : parseFloat(t), 0, 100);
    var logMin = Math.log(DURATION_MIN_MINUTES);
    var logMax = Math.log(DURATION_MAX_MINUTES);
    return Math.round(Math.exp(logMin + (x / 100) * (logMax - logMin)));
  }

  function pickDurationUnit(minutes) {
    var m = clampDurationMinutes(minutes) || DURATION_MIN_MINUTES;
    if (m < 90) return DURATION_UNITS[0];
    if (m < 36 * 60) return DURATION_UNITS[1];
    if (m < 10 * 24 * 60) return DURATION_UNITS[2];
    if (m < 8 * 7 * 24 * 60) return DURATION_UNITS[3];
    if (m < 18 * 30 * 24 * 60) return DURATION_UNITS[4];
    return DURATION_UNITS[5];
  }

  function formatDurationFr(minutes) {
    var m = clampDurationMinutes(minutes);
    if (m == null) return '';
    var unit = pickDurationUnit(m);
    var qty = m / unit.minutes;
    var rounded =
      qty >= 10 ? Math.round(qty) : Math.round(qty * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 0.05) {
      rounded = Math.round(rounded);
    }
    var label = unit.label;
    if (label === 'min') {
      return rounded <= 1 ? 'environ 1 minute' : 'environ ' + rounded + ' minutes';
    }
    if (label === 'h') {
      return rounded <= 1 ? 'environ 1 heure' : 'environ ' + rounded + ' heures';
    }
    if (label === 'j') {
      return rounded <= 1 ? 'environ 1 jour' : 'environ ' + rounded + ' jours';
    }
    if (label === 'sem') {
      return rounded <= 1 ? 'environ 1 semaine' : 'environ ' + rounded + ' semaines';
    }
    if (label === 'mois') {
      return rounded <= 1 ? 'environ 1 mois' : 'environ ' + rounded + ' mois';
    }
    return rounded <= 1 ? 'environ 1 an' : 'environ ' + rounded + ' ans';
  }

  function parseDurationNl(text) {
    if (typeof text !== 'string') return null;
    var raw = text.trim().toLowerCase().replace(/,/g, '.');
    if (!raw) return null;
    // "a few minutes|hours|days|weeks|months|years" / "quelques …"
    if (/quelques?\s+minutes?|a\s+few\s+minutes?/.test(raw)) return 15;
    if (/quelques?\s+heures?|a\s+few\s+hours?/.test(raw)) return 3 * 60;
    if (/quelques?\s+jours?|a\s+few\s+days?/.test(raw)) return 3 * 24 * 60;
    if (/quelques?\s+semaines?|a\s+few\s+weeks?/.test(raw)) return 3 * 7 * 24 * 60;
    if (/quelques?\s+mois|a\s+few\s+months?/.test(raw)) return 3 * 30 * 24 * 60;
    if (/quelques?\s+ans|quelques?\s+années?|a\s+few\s+years?/.test(raw)) {
      return DURATION_MAX_MINUTES;
    }
    var m = raw.match(
      /(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|heures?|hrs?|h|jours?|j|days?|d|semaines?|sem|weeks?|w|mois|months?|mo|ans|ann[eé]es?|years?|y)\b/
    );
    if (!m) {
      // bare number → minutes
      var bare = raw.match(/^(\d+(?:\.\d+)?)$/);
      if (bare) return clampDurationMinutes(parseFloat(bare[1]));
      return null;
    }
    var n = parseFloat(m[1]);
    if (!isFinite(n) || n <= 0) return null;
    var u = m[2];
    var factor = 1;
    // Match plurals too ("jours", "heures") — a trailing $ on jour rejected "jours"
    // and silently fell through to factor=1 (minutes).
    if (/^min/.test(u)) factor = 1;
    else if (/^(h|heure|hr)/.test(u)) factor = 60;
    else if (/^(j|jours?|days?|d)$/.test(u)) factor = 24 * 60;
    else if (/^(sem|semaines?|weeks?|w)$/.test(u)) factor = 7 * 24 * 60;
    else if (/^(mois|months?|mo)$/.test(u)) factor = 30 * 24 * 60;
    else if (/^(ans?|ann[eé]es?|years?|y)$/.test(u)) factor = 365.25 * 24 * 60;
    else return null;
    return clampDurationMinutes(n * factor);
  }

  function svgNS() {
    return 'http://www.w3.org/2000/svg';
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(svgNS(), tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  /**
   * Earthquake-globe visualization bound to an impact field (0–4).
   * Orange ring grows from a small surface disc until it wraps the whole 3D globe.
   */
  function attachImpactReachVisual(fieldApi) {
    if (!fieldApi || !fieldApi.el) return null;
    var cx = IMPACT_GLOBE.cx;
    var cy = IMPACT_GLOBE.cy;
    var gRx = IMPACT_GLOBE.rx;
    var gRy = IMPACT_GLOBE.ry;

    var wrap = document.createElement('div');
    wrap.className = 'impact-reach';
    wrap.setAttribute('aria-hidden', 'true');

    var stage = document.createElement('div');
    stage.className = 'impact-reach-stage';

    var svg = svgEl('svg', {
      class: 'impact-reach-svg',
      viewBox: '0 0 120 88',
      width: '120',
      height: '88'
    });

    // Soft 3D pedestal ellipse (shadow / horizon).
    svg.appendChild(
      svgEl('ellipse', {
        class: 'impact-reach-pedestal',
        cx: String(cx),
        cy: '76',
        rx: String(gRx + 6),
        ry: '5.5'
      })
    );

    var globeG = svgEl('g', { class: 'impact-reach-globe' });
    globeG.appendChild(
      svgEl('ellipse', {
        class: 'impact-reach-sphere',
        cx: String(cx),
        cy: String(cy),
        rx: String(gRx),
        ry: String(gRy)
      })
    );
    globeG.appendChild(
      svgEl('ellipse', {
        class: 'impact-reach-meridian',
        cx: String(cx),
        cy: String(cy),
        rx: '14',
        ry: String(gRy),
        fill: 'none'
      })
    );
    globeG.appendChild(
      svgEl('ellipse', {
        class: 'impact-reach-parallel',
        cx: String(cx),
        cy: String(cy),
        rx: String(gRx),
        ry: '10',
        fill: 'none'
      })
    );
    globeG.appendChild(
      svgEl('ellipse', {
        class: 'impact-reach-parallel',
        cx: String(cx),
        cy: String(cy - 10),
        rx: '28',
        ry: '7',
        fill: 'none'
      })
    );
    globeG.appendChild(
      svgEl('path', {
        class: 'impact-reach-land',
        d: 'M42 38c4-6 10-8 16-6 5 2 8 7 7 12-1 4-5 7-10 8-6 1-11-2-13-7zM70 50c3-2 7-2 10 1 2 3 1 7-2 9-4 2-8 1-10-2-2-3-1-6 2-8z'
      })
    );
    globeG.appendChild(
      svgEl('ellipse', {
        class: 'impact-reach-shine',
        cx: String(cx - 12),
        cy: String(cy - 12),
        rx: '8',
        ry: '5'
      })
    );
    svg.appendChild(globeG);

    // Quake rings sit in the same 3D plane as the globe (shared center).
    var quakeG = svgEl('g', { class: 'impact-reach-quake' });
    // Back half (dashed) suggests the ring wrapping behind the sphere.
    var ringBack = svgEl('ellipse', {
      class: 'impact-reach-ring impact-reach-ring--back',
      cx: String(cx),
      cy: String(cy),
      rx: '7',
      ry: '3.5',
      fill: 'none'
    });
    var ring = svgEl('ellipse', {
      class: 'impact-reach-ring',
      cx: String(cx),
      cy: String(cy),
      rx: '7',
      ry: '3.5',
      fill: 'none'
    });
    var ringEcho = svgEl('ellipse', {
      class: 'impact-reach-ring impact-reach-ring--echo',
      cx: String(cx),
      cy: String(cy),
      rx: '7',
      ry: '3.5',
      fill: 'none'
    });
    var epicenter = svgEl('circle', {
      class: 'impact-reach-epicenter',
      cx: String(cx),
      cy: String(cy),
      r: '2.4'
    });
    quakeG.appendChild(ringBack);
    quakeG.appendChild(ringEcho);
    quakeG.appendChild(ring);
    quakeG.appendChild(epicenter);
    svg.appendChild(quakeG);

    stage.appendChild(svg);
    wrap.appendChild(stage);

    var legend = document.createElement('div');
    legend.className = 'impact-reach-legend';
    var shorts = (LABELS.impact && LABELS.impact.short) || [];
    shorts.forEach(function (name, i) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'impact-reach-chip';
      chip.dataset.level = String(i);
      chip.textContent = name;
      chip.setAttribute('aria-label', 'Port\u00e9e\u00a0: ' + name);
      chip.addEventListener('click', function () {
        if (typeof fieldApi.setValue === 'function') fieldApi.setValue(i);
        if (typeof fieldApi.onChange === 'function') fieldApi.onChange(i);
      });
      legend.appendChild(chip);
    });
    wrap.appendChild(legend);

    fieldApi.el.classList.add('field--impact-reach');
    fieldApi.el.appendChild(wrap);

    var lastLevel = -1;
    function paint(level) {
      var L = clamp(Math.round(level), 0, 4);
      var color = IMPACT_REACH_COLORS[L];
      var ell = IMPACT_REACH_ELLIPSES[L];
      var rx = ell[0];
      var ry = ell[1];
      wrap.style.setProperty('--reach-color', color);
      wrap.dataset.level = String(L);
      // At Global, ring coincides with the sphere silhouette (full wrap).
      ring.setAttribute('rx', String(rx));
      ring.setAttribute('ry', String(ry));
      ringBack.setAttribute('rx', String(rx));
      ringBack.setAttribute('ry', String(ry));
      // Echo sits slightly outside the primary ring for ripple depth.
      var echoScale = L >= 4 ? 1.06 : 1.12;
      ringEcho.setAttribute('rx', String(rx * echoScale));
      ringEcho.setAttribute('ry', String(ry * echoScale));
      epicenter.setAttribute('fill', color);
      ring.setAttribute('stroke', color);
      ringBack.setAttribute('stroke', color);
      ringEcho.setAttribute('stroke', color);
      epicenter.setAttribute('r', L >= 4 ? '0' : String(2.2 + L * 0.15));
      var chips = legend.querySelectorAll('.impact-reach-chip');
      for (var i = 0; i < chips.length; i++) {
        var active = i === L;
        chips[i].classList.toggle('is-active', active);
        chips[i].setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      if (L !== lastLevel) {
        wrap.classList.remove('is-shaking');
        void wrap.offsetWidth;
        wrap.classList.add('is-shaking');
        lastLevel = L;
      }
    }

    var origUpdate = fieldApi.updateDisplay;
    fieldApi.updateDisplay = function (v) {
      origUpdate(v);
      paint(snappedLevel(v, 0, 4));
    };
    paint(snappedLevel(fieldApi.getValue(), 0, 4));

    return {
      el: wrap,
      paint: paint
    };
  }

  /**
   * Estimated-duration block under Facilité: simple log-spaced grid + hourglass.
   */
  function createEstimatedDurationControl(config) {
    config = config || {};
    var host = config.el;
    var onChange = config.onChange || function () {};
    var minutes = clampDurationMinutes(config.value);

    var block = document.createElement('div');
    block.className = 'ease-duration';

    var head = document.createElement('div');
    head.className = 'ease-duration-head';
    var title = document.createElement('span');
    title.className = 'ease-duration-title';
    title.textContent = 'Dur\u00e9e estim\u00e9e';
    var summary = document.createElement('span');
    summary.className = 'ease-duration-summary';
    head.appendChild(title);
    head.appendChild(summary);
    block.appendChild(head);

    var body = document.createElement('div');
    body.className = 'ease-duration-body';

    // Hourglass visual — chambers: top y=8→34, waist≈36, bottom y=38→64
    var glassWrap = document.createElement('div');
    glassWrap.className = 'hourglass-wrap';
    var hgSvg = svgEl('svg', {
      class: 'hourglass-svg',
      viewBox: '0 0 48 72',
      width: '36',
      height: '54'
    });
    hgSvg.appendChild(
      svgEl('path', {
        class: 'hourglass-frame',
        d: 'M10 6h28v6c0 8-8 14-14 18 6 4 14 10 14 18v6H10v-6c0-8 8-14 14-18C18 26 10 20 10 12V6z',
        fill: 'none'
      })
    );
    var sandTop = svgEl('path', {
      class: 'hourglass-sand hourglass-sand--top',
      d: 'M14 10h20v2c0 6-6 11-10 14-4-3-10-8-10-14v-2z'
    });
    var sandBot = svgEl('path', {
      class: 'hourglass-sand hourglass-sand--bot',
      d: 'M24 38c4 3 10 8 10 14v6H14v-6c0-6 6-11 10-14z'
    });
    var crackL = svgEl('path', {
      class: 'hourglass-crack',
      d: 'M18 22l4 6-3 5 5 7',
      fill: 'none'
    });
    var crackR = svgEl('path', {
      class: 'hourglass-crack',
      d: 'M30 24l-3 5 4 6-2 5',
      fill: 'none'
    });
    hgSvg.appendChild(sandBot);
    hgSvg.appendChild(sandTop);
    hgSvg.appendChild(crackL);
    hgSvg.appendChild(crackR);
    glassWrap.appendChild(hgSvg);
    body.appendChild(glassWrap);

    var controls = document.createElement('div');
    controls.className = 'ease-duration-controls';

    var grid = document.createElement('div');
    grid.className = 'ease-duration-grid';
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-label', 'Dur\u00e9e estim\u00e9e');

    var cellButtons = [];
    DURATION_TICKS.forEach(function (tick, idx) {
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'ease-duration-cell';
      cell.setAttribute('role', 'option');
      cell.dataset.minutes = String(tick.minutes);
      cell.dataset.index = String(idx);
      // Shorter label for grid density; full phrase stays as title.
      cell.textContent = tick.label.replace(/^Quelques\s+/i, '');
      cell.title = tick.label;
      cell.addEventListener('click', function () {
        applyMinutes(tick.minutes, true);
      });
      grid.appendChild(cell);
      cellButtons.push(cell);
    });
    controls.appendChild(grid);
    body.appendChild(controls);
    block.appendChild(body);

    if (host) host.appendChild(block);

    function nearestTickIndex(m) {
      if (m == null) return -1;
      var best = 0;
      var bestDist = Infinity;
      for (var i = 0; i < DURATION_TICKS.length; i++) {
        var d = Math.abs(
          Math.log(DURATION_TICKS[i].minutes) - Math.log(m)
        );
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    }

    function paintHourglass(m) {
      var fill = m == null ? 0 : durationToSlider(m) / 100;
      // Top chamber empties (scale from top lip), bottom fills (scale from floor).
      var topScale = Math.max(0.08, 1 - fill);
      var botScale = Math.max(0.08, fill);
      sandTop.setAttribute(
        'transform',
        'translate(24 10) scale(1 ' + topScale.toFixed(3) + ') translate(-24 -10)'
      );
      sandBot.setAttribute(
        'transform',
        'translate(24 58) scale(1 ' + botScale.toFixed(3) + ') translate(-24 -58)'
      );
      sandTop.style.opacity = String(0.35 + topScale * 0.65);
      sandBot.style.opacity = String(0.35 + botScale * 0.65);
      var cracked = m != null && m >= DURATION_CRACK_MINUTES;
      block.classList.toggle('hourglass--cracked', cracked);
      if (cracked) {
        block.classList.remove('hourglass--smash');
        void block.offsetWidth;
        block.classList.add('hourglass--smash');
      }
    }

    function applyMinutes(next, notify) {
      minutes = clampDurationMinutes(next);
      summary.textContent =
        minutes == null ? 'Non d\u00e9finie' : formatDurationFr(minutes);
      summary.classList.toggle('is-empty', minutes == null);
      var activeIdx = nearestTickIndex(minutes);
      for (var i = 0; i < cellButtons.length; i++) {
        var on = i === activeIdx && minutes != null;
        cellButtons[i].classList.toggle('is-active', on);
        cellButtons[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }
      paintHourglass(minutes);
      if (notify) onChange(minutes);
    }

    applyMinutes(minutes, false);

    return {
      el: block,
      getMinutes: function () {
        return minutes;
      },
      setMinutes: function (next) {
        applyMinutes(next, false);
      }
    };
  }

  function createField(config) {
    var el = config.el;
    var id = config.id;
    var label = config.label;
    var icon = config.icon || 'ti-adjustments';
    var wordsKey = config.wordsKey || id;
    var min = config.min != null ? config.min : 0;
    var max = config.max != null ? config.max : 4;
    var value = config.value != null ? config.value : min;
    var onChange = config.onChange || function () {};

    var field = document.createElement('div');
    field.className = 'field';
    field.dataset.fieldId = id;

    var lblWrap = document.createElement('span');
    lblWrap.className = 'field-lbl-wrap';

    var tooltipId = id + '-tip';

    var lblBtn = document.createElement('button');
    lblBtn.type = 'button';
    lblBtn.className = 'field-lbl';
    lblBtn.setAttribute('aria-label', 'Choisir le niveau de ' + label);
    lblBtn.setAttribute('aria-describedby', tooltipId);

    var lblIcon = document.createElement('i');
    lblIcon.className = 'ti ' + icon;
    lblIcon.setAttribute('aria-hidden', 'true');

    var lblText = document.createElement('span');
    lblText.className = 'field-lbl-text';
    lblText.textContent = label;

    var lblTooltip = document.createElement('div');
    lblTooltip.id = tooltipId;
    lblTooltip.className = 'field-lbl-tooltip';
    lblTooltip.setAttribute('role', 'tooltip');

    function openFieldHelp() {
      var wiz = config.wizard;
      if (wiz && wiz.dimensions && wiz.dimensions.length > 1) {
        openCriteriaWizard(wiz.dimensions, {
          initialStep: wiz.step != null ? wiz.step : 0,
          getValue: wiz.getValue,
          setValue: wiz.setValue
        });
        return;
      }
      openHelpModal(wordsKey, label, {
        icon: icon,
        min: min,
        max: max,
        currentValue: getValue(),
        onSelect: function (level) {
          setValue(level);
          onChange(level);
        }
      });
    }

    lblBtn.addEventListener('click', openFieldHelp);

    lblBtn.appendChild(lblIcon);
    lblBtn.appendChild(lblText);
    lblWrap.appendChild(lblBtn);
    lblWrap.appendChild(lblTooltip);

    var sliderWrap = document.createElement('div');
    sliderWrap.className = 'field-slider';

    var inputEl = document.createElement('input');
    inputEl.type = 'range';
    inputEl.className = 'field-range';
    inputEl.id = id;
    inputEl.min = String(min);
    inputEl.max = String(max);
    inputEl.step = String(SLIDER_STEP);
    inputEl.value = String(value);
    inputEl.setAttribute('aria-label', label);

    sliderWrap.appendChild(inputEl);

    var fieldHead = document.createElement('div');
    fieldHead.className = 'field-head';
    fieldHead.appendChild(lblWrap);
    fieldHead.appendChild(sliderWrap);

    field.appendChild(fieldHead);

    el.appendChild(field);

    // Routable through api.updateDisplay so visuals (e.g. impact reach) can wrap it.
    var api = {
      el: field,
      getValue: getValue,
      setValue: setValue,
      updateDisplay: updateDisplayBase,
      onChange: onChange
    };

    function updateDisplayBase(v) {
      v = clamp(v, min, max);
      var idx = snappedLevel(v, min, max);
      var shortLabel = wordFor(wordsKey, idx);
      var questionText = dimensionQuestion(wordsKey);
      lblTooltip.textContent = questionText;
      lblBtn.removeAttribute('title');
      lblWrap.classList.toggle('is-empty-tip', !questionText);
      lblBtn.setAttribute('aria-label', shortLabel
        ? 'Choisir le niveau de ' + label + '. Actuellement : ' + shortLabel
        : 'Choisir le niveau de ' + label);
      inputEl.value = String(v);
    }

    function setValue(v) {
      api.updateDisplay(clamp(Math.round(v), min, max));
    }

    function getValue() {
      return +inputEl.value;
    }

    function handleRangeInput() {
      var v = +inputEl.value;
      api.updateDisplay(v);
      onChange(v);
    }
    inputEl.addEventListener('input', handleRangeInput);
    inputEl.addEventListener('change', handleRangeInput);

    if (
      config.showImpactGlobe &&
      (wordsKey === 'impact' || id === 'impact')
    ) {
      attachImpactReachVisual(api);
    }
    api.updateDisplay(value);
    return api;
  }

  function createCollapsibleEnableChrome(config) {
    var titleText = config.title || '';
    var bodyId = config.bodyId || '';
    var checkboxClass = config.checkboxClass || '';
    var labelClass = config.labelClass || '';
    var iconClass = config.iconClass || '';
    var titleClass = config.titleClass || '';
    var leadingIcon = config.leadingIcon || '';
    // hideEnable and leadingIcon are independent: always-on sections may use an
    // icon alone; enable sections may show checkbox + icon together.
    var hideEnable = !!config.hideEnable;
    var enableLabel = config.enableLabel || ('Activer ' + titleText);
    var collapseLabel = config.collapseLabel || ('Replier ' + titleText);
    var expandLabel = config.expandLabel || ('D\u00e9velopper ' + titleText);

    var head = document.createElement('div');
    head.className = 'section-toggle-head';

    var label = null;
    var checkbox = null;
    var leadingIconEl = null;

    var collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'section-collapse-btn';
    if (bodyId) collapseBtn.setAttribute('aria-controls', bodyId);
    collapseBtn.setAttribute('aria-expanded', 'false');
    collapseBtn.setAttribute('aria-label', expandLabel);

    // Chevron leads on the left; title/summary fill the middle.
    var chevron = document.createElement('i');
    chevron.className = 'ti ti-chevron-down section-collapse-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    collapseBtn.appendChild(chevron);

    // Icon lives inside the collapse button so hover/focus highlight wraps it.
    if (leadingIcon) {
      leadingIconEl = document.createElement('span');
      leadingIconEl.className = ('section-leading-icon ' + iconClass).trim();
      leadingIconEl.setAttribute('aria-hidden', 'true');

      var iconGlyph = document.createElement('i');
      iconGlyph.className = ('ti ' + leadingIcon + ' section-leading-icon-glyph').trim();
      leadingIconEl.appendChild(iconGlyph);
      collapseBtn.appendChild(leadingIconEl);
    }

    var textWrap = document.createElement('span');
    textWrap.className = 'section-enable-text';

    var title = document.createElement('span');
    title.className = ('section-enable-title ' + titleClass).trim();
    title.textContent = titleText;
    textWrap.appendChild(title);

    var summary = document.createElement('span');
    summary.className = 'section-toggle-summary';
    summary.hidden = true;
    summary.setAttribute('aria-hidden', 'true');

    collapseBtn.appendChild(textWrap);
    collapseBtn.appendChild(summary);
    head.appendChild(collapseBtn);

    if (!hideEnable) {
      // Checkbox alone enables/disables — title is not part of the label,
      // so clicking the heading collapses instead of toggling the feature.
      // Keep enable toggle on the right edge (settings gears insert before it).
      label = document.createElement('label');
      label.className = ('section-enable-label ' + labelClass).trim();

      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = ('section-enable-checkbox ' + checkboxClass).trim();
      checkbox.setAttribute('aria-label', enableLabel);
      if (bodyId) checkbox.setAttribute('aria-controls', bodyId);

      label.appendChild(checkbox);
      head.appendChild(label);
    }

    return {
      head: head,
      label: label,
      checkbox: checkbox,
      leadingIcon: leadingIconEl,
      title: title,
      summary: summary,
      collapseBtn: collapseBtn,
      collapseLabel: collapseLabel,
      expandLabel: expandLabel,
      enableLabel: enableLabel
    };
  }

  function bindCollapsibleEnable(config) {
    var field = config.field;
    var body = config.body;
    var chrome = config.chrome;
    var alwaysEnabled = !!config.alwaysEnabled;
    var enabled = alwaysEnabled ? true : !!config.enabled;
    var expanded = config.expanded != null ? !!config.expanded : (!!enabled && !alwaysEnabled);
    var enableAllowed = config.enableAllowed !== false;
    var onEnableChange = config.onEnableChange || function () {};
    var onExpandChange = config.onExpandChange || null;
    var onLayoutChange = config.onLayoutChange || function () {};
    var getSummary = config.getSummary || function () { return ''; };
    var onBeforeDisable = config.onBeforeDisable || null;
    var onAfterEnable = config.onAfterEnable || null;
    var activateHint = 'Activer pour modifier';
    var lockedHint = 'Indisponible tant que le progr\u00e8s est \u00e0 100\u00a0%';

    function notifyExpandChange(options) {
      if (typeof onExpandChange !== 'function') return;
      if (options && options.persist === false) return;
      onExpandChange(expanded, options || {});
    }

    // Catcher sits above the inert preview body so clicks can enable the section.
    var shell = body.parentNode && body.parentNode.classList.contains('section-toggle-shell')
      ? body.parentNode
      : null;
    if (!shell && body.parentNode) {
      shell = document.createElement('div');
      shell.className = 'section-toggle-shell';
      body.parentNode.insertBefore(shell, body);
      shell.appendChild(body);
    }

    var catcher = shell ? shell.querySelector('.section-enable-catcher') : null;
    if (shell && !catcher && !alwaysEnabled) {
      catcher = document.createElement('button');
      catcher.type = 'button';
      catcher.className = 'section-enable-catcher';
      catcher.tabIndex = -1;
      catcher.setAttribute('aria-label', activateHint);
      catcher.title = activateHint;
      shell.appendChild(catcher);
    }

    function applySummaryContent(content) {
      if (content == null || content === '') {
        chrome.summary.replaceChildren();
        chrome.summary.hidden = true;
        chrome.summary.setAttribute('aria-hidden', 'true');
        return;
      }
      if (typeof content === 'string') {
        chrome.summary.textContent = content;
      } else if (content.nodeType) {
        // Node / DocumentFragment — e.g. Statut icon + label
        chrome.summary.replaceChildren(content);
      } else {
        chrome.summary.textContent = String(content);
      }
      chrome.summary.hidden = false;
      chrome.summary.setAttribute('aria-hidden', 'false');
    }

    function syncUi(shouldNotifyLayout) {
      var wasHidden = !!body.hidden;
      if (chrome.checkbox) {
        chrome.checkbox.checked = enabled;
        // Always-on sections keep a checked, clickable-looking checkbox that cannot turn off.
        chrome.checkbox.disabled = alwaysEnabled ? false : !enableAllowed;
        if (alwaysEnabled) {
          chrome.checkbox.title = 'Toujours activ\u00e9';
          chrome.checkbox.setAttribute('aria-disabled', 'true');
        } else if (!enableAllowed) {
          chrome.checkbox.title = lockedHint;
          chrome.checkbox.setAttribute('aria-disabled', 'true');
        } else {
          chrome.checkbox.removeAttribute('title');
          chrome.checkbox.removeAttribute('aria-disabled');
        }
      }
      field.classList.toggle('is-enabled', enabled);
      field.classList.toggle('is-collapsed', !expanded);
      field.classList.toggle('is-enable-locked', !alwaysEnabled && !enableAllowed);
      body.hidden = !expanded;
      if (shell) shell.hidden = !expanded;
      try {
        body.inert = !enabled;
      } catch (e) { /* ignore */ }
      if (catcher) {
        var showCatcher = !alwaysEnabled && !enabled && expanded && enableAllowed;
        catcher.hidden = !showCatcher;
        catcher.setAttribute('aria-hidden', showCatcher ? 'false' : 'true');
        catcher.title = enableAllowed ? activateHint : lockedHint;
        catcher.setAttribute('aria-label', enableAllowed ? activateHint : lockedHint);
      }
      chrome.collapseBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      chrome.collapseBtn.setAttribute(
        'aria-label',
        expanded ? chrome.collapseLabel : chrome.expandLabel
      );
      applySummaryContent(enabled ? getSummary() : '');
      if (shouldNotifyLayout !== false && wasHidden !== !!body.hidden) {
        onLayoutChange();
      }
    }

    function setExpanded(next, options) {
      options = options || {};
      var wasExpanded = expanded;
      expanded = !!next;
      syncUi(options.notifyLayout !== false);
      if (wasExpanded !== expanded) notifyExpandChange(options);
    }

    function setEnabled(next, options) {
      options = options || {};
      if (alwaysEnabled) {
        // Always-on sections ignore enable/disable; expand may still be controlled.
        if (options.expand != null) {
          var wasAlwaysExpanded = expanded;
          expanded = !!options.expand;
          syncUi(options.notifyLayout !== false);
          if (wasAlwaysExpanded !== expanded) notifyExpandChange(options);
        }
        return;
      }
      var on = !!next;
      // Progress-complete lock: keep data, block re-enable via checkbox / catcher.
      if (on && !enableAllowed && !options.force) {
        if (chrome.checkbox) chrome.checkbox.checked = enabled;
        return;
      }
      var changed = on !== enabled;
      var wasExpanded = expanded;
      enabled = on;
      if (enabled) {
        if (options.preserveCollapse) {
          // Keep current expand/collapse (e.g. AI edits must not reopen sections).
        } else if (changed || options.expand != null) {
          expanded = options.expand !== false;
        }
        if (changed && typeof onAfterEnable === 'function') onAfterEnable(options);
      } else {
        // Disabling collapses by default; pass expand:true to keep open.
        // preserveCollapse only skips unintended opens — disable still collapses.
        expanded = options.expand != null ? !!options.expand : false;
        if (changed && typeof onBeforeDisable === 'function') onBeforeDisable(options);
      }
      syncUi(options.notifyLayout !== false);
      if (changed) onEnableChange(enabled, options);
      if (wasExpanded !== expanded) notifyExpandChange(options);
    }

    function setEnableAllowed(allowed, options) {
      options = options || {};
      if (alwaysEnabled) return;
      var next = allowed !== false;
      if (next === enableAllowed) {
        syncUi(false);
        return;
      }
      enableAllowed = next;
      if (!enableAllowed && enabled) {
        var disableOpts = { notifyLayout: options.notifyLayout };
        if (options.expand != null) disableOpts.expand = options.expand;
        setEnabled(false, disableOpts);
        return;
      }
      syncUi(options.notifyLayout !== false);
    }

    function refreshSummary() {
      applySummaryContent(enabled ? getSummary() : '');
    }

    function focusControlAtPoint(clientX, clientY) {
      var hit = document.elementFromPoint(clientX, clientY);
      if (!hit || !body.contains(hit)) return;
      var focusable = typeof hit.closest === 'function'
        ? hit.closest('button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')
        : null;
      var target = focusable && body.contains(focusable) ? focusable : hit;
      if (!target || typeof target.focus !== 'function' || target.disabled) return;
      try {
        target.focus();
      } catch (err) { /* ignore */ }
    }

    if (chrome.checkbox) {
      chrome.checkbox.addEventListener('click', function (event) {
        // Keep enable clicks from bubbling into any header handlers.
        event.stopPropagation();
        if (alwaysEnabled || !enableAllowed) {
          event.preventDefault();
          chrome.checkbox.checked = enabled;
        }
      });

      chrome.checkbox.addEventListener('change', function () {
        if (alwaysEnabled || !enableAllowed) {
          chrome.checkbox.checked = enabled;
          return;
        }
        setEnabled(chrome.checkbox.checked);
      });
    }

    chrome.collapseBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      setExpanded(!expanded);
    });

    if (catcher) {
      catcher.addEventListener('click', function (event) {
        if (enabled || !enableAllowed) return;
        event.preventDefault();
        event.stopPropagation();
        var x = event.clientX;
        var y = event.clientY;
        setEnabled(true);
        requestAnimationFrame(function () {
          focusControlAtPoint(x, y);
        });
      });
    }

    syncUi(false);

    return {
      setEnabled: setEnabled,
      setExpanded: setExpanded,
      setEnableAllowed: setEnableAllowed,
      isEnableAllowed: function () { return enableAllowed; },
      isEnabled: function () { return enabled; },
      isExpanded: function () { return expanded; },
      refreshSummary: refreshSummary,
      syncUi: syncUi
    };
  }

  function statutCategoryStyle(key) {
    if (
      typeof global.StatutMatch !== 'undefined' &&
      typeof global.StatutMatch.categoryStyle === 'function'
    ) {
      return global.StatutMatch.categoryStyle(key);
    }
    return { color: '#626f86', icon: 'dot' };
  }

  function createStatutIcon(iconKey, size) {
    var ns = 'http://www.w3.org/2000/svg';
    var dim = size > 0 ? Number(size) : 16;
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', String(dim));
    svg.setAttribute('height', String(dim));
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('statut-list-option-icon');

    function path(d, attrs) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.6');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      if (attrs) {
        Object.keys(attrs).forEach(function (k) {
          p.setAttribute(k, attrs[k]);
        });
      }
      return p;
    }

    function circle(cx, cy, r, attrs) {
      var c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', String(cx));
      c.setAttribute('cy', String(cy));
      c.setAttribute('r', String(r));
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', 'currentColor');
      c.setAttribute('stroke-width', '1.6');
      if (attrs) {
        Object.keys(attrs).forEach(function (k) {
          c.setAttribute(k, attrs[k]);
        });
      }
      return c;
    }

    function line(x1, y1, x2, y2) {
      var l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', String(x1));
      l.setAttribute('y1', String(y1));
      l.setAttribute('x2', String(x2));
      l.setAttribute('y2', String(y2));
      l.setAttribute('stroke', 'currentColor');
      l.setAttribute('stroke-width', '1.6');
      l.setAttribute('stroke-linecap', 'round');
      return l;
    }

    if (iconKey === 'check') {
      svg.appendChild(path('M3.2 8.2 L6.5 11.4 L12.8 4.4'));
    } else if (iconKey === 'ban') {
      svg.appendChild(circle(8, 8, 5.5));
      svg.appendChild(line(4.2, 4.2, 11.8, 11.8));
    } else if (iconKey === 'play') {
      // Play arrow (En cours)
      svg.appendChild(
        path('M5.2 3.6 L12.4 8 L5.2 12.4 Z', {
          fill: 'currentColor',
          stroke: 'none',
        })
      );
    } else if (iconKey === 'inbox') {
      svg.appendChild(path('M2.5 6.5 L8 2.8 L13.5 6.5 V13 H2.5 Z'));
      svg.appendChild(path('M2.5 6.5 H13.5'));
    } else if (iconKey === 'layers') {
      svg.appendChild(path('M2.5 10.5 L8 13.5 L13.5 10.5'));
      svg.appendChild(path('M2.5 7.5 L8 10.5 L13.5 7.5'));
      svg.appendChild(path('M2.5 4.5 L8 7.5 L13.5 4.5 L8 1.5 Z'));
    } else if (iconKey === 'hourglass') {
      // Hourglass (En attente / backlog): caps + glass silhouette.
      svg.appendChild(path('M4.5 2.5 H11.5'));
      svg.appendChild(path('M4.5 13.5 H11.5'));
      svg.appendChild(path('M5.5 3.5 L8 8 L5.5 12.5'));
      svg.appendChild(path('M10.5 3.5 L8 8 L10.5 12.5'));
    } else if (iconKey === 'circle') {
      svg.appendChild(circle(8, 8, 5));
    } else if (iconKey === 'x') {
      svg.appendChild(line(4.5, 4.5, 11.5, 11.5));
      svg.appendChild(line(11.5, 4.5, 4.5, 11.5));
    } else {
      // Dot / unassigned
      var d = document.createElementNS(ns, 'circle');
      d.setAttribute('cx', '8');
      d.setAttribute('cy', '8');
      d.setAttribute('r', '2.4');
      d.setAttribute('fill', 'currentColor');
      svg.appendChild(d);
    }
    return svg;
  }

  function createStatutField(config) {
    var el = config.el;
    var onChange = config.onChange || function () {};
    var onLayoutChange = config.onLayoutChange || function () {};
    var onSelectList =
      typeof config.onSelectList === 'function' ? config.onSelectList : null;
    var onOpenSettings =
      typeof config.onOpenSettings === 'function' ? config.onOpenSettings : null;
    var embedded = !!config.embedded;
    var bodyId = 'statut-section-body-' + Math.random().toString(36).slice(2, 9);
    var currentListId = config.listId ? String(config.listId) : '';
    var lists = Array.isArray(config.lists) ? config.lists.slice() : [];
    var settings = config.settings || null;
    if (
      settings &&
      typeof global.StatutMatch !== 'undefined' &&
      typeof global.StatutMatch.applyStateColors === 'function'
    ) {
      global.StatutMatch.applyStateColors(settings.stateColors);
    }
    var busy = false;
    var authBusy = false;
    var showUnassigned =
      config.showUnassigned != null
        ? !!config.showUnassigned
        : !!(settings && settings.showUnassigned);
    var onAuthorize =
      typeof config.onAuthorize === 'function' ? config.onAuthorize : null;
    var authReason = config.authReason || (config.needsAuth ? 'not-authorized' : '');
    var embeddedDetailsExpanded = embedded
      ? loadStatutEmbeddedDetailsExpanded()
      : true;
    var embeddedBlockedReasons = [];

    var field = document.createElement('div');
    field.className = embedded
      ? 'field field--statut field--statut-embedded is-enabled'
      : 'field field--statut is-enabled';

    var chrome = null;
    if (!embedded) {
      chrome = createCollapsibleEnableChrome({
        title: 'Statut',
        bodyId: bodyId,
        hideEnable: true,
        leadingIcon: 'ti-list',
        iconClass: 'statut-leading-icon',
        titleClass: 'statut-enable-title',
        collapseLabel: 'Replier Statut',
        expandLabel: 'Développer Statut',
      });
      field.appendChild(chrome.head);
    }

    var settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'statut-settings-btn';
    settingsBtn.setAttribute('aria-label', 'Personnaliser les statuts');
    settingsBtn.title = 'Personnaliser les statuts';
    settingsBtn.hidden = !onOpenSettings;
    var settingsIcon = document.createElement('i');
    settingsIcon.className = 'ti ti-settings';
    settingsIcon.setAttribute('aria-hidden', 'true');
    settingsBtn.appendChild(settingsIcon);
    settingsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!onOpenSettings) return;
      Promise.resolve(onOpenSettings()).catch(function (err) {
        console.error('Statut open settings failed', err);
      });
    });

    if (!embedded) {
      // Gear left of the enable checkbox (checkbox stays on the far right).
      if (chrome.label) {
        chrome.head.insertBefore(settingsBtn, chrome.label);
      } else {
        chrome.head.appendChild(settingsBtn);
      }
    }

    var body = document.createElement('div');
    body.className = embedded
      ? 'statut-section-body statut-section-body--embedded'
      : 'statut-section-body section-toggle-body';
    body.id = bodyId;

    var embeddedBar = null;
    var embeddedHead = null;
    var embeddedToggleBtn = null;
    var embeddedHeaderSummary = null;
    var embeddedSummaryEl = null;
    var heroEl = null;
    if (embedded) {
      embeddedBar = document.createElement('div');
      embeddedBar.className = 'statut-embedded-bar';
      embeddedBar.appendChild(settingsBtn);
      body.appendChild(embeddedBar);

      // Compact section-style header (chevron + title + collapsed summary).
      // Hero stays outside the button so hover is not a huge square.
      embeddedHead = document.createElement('div');
      embeddedHead.className = 'statut-embedded-head section-toggle-head';
      body.appendChild(embeddedHead);

      embeddedToggleBtn = document.createElement('button');
      embeddedToggleBtn.type = 'button';
      embeddedToggleBtn.className =
        'statut-embedded-collapse-btn section-collapse-btn';

      var embeddedChevron = document.createElement('i');
      embeddedChevron.className =
        'ti ti-chevron-down section-collapse-chevron statut-embedded-collapse-chevron';
      embeddedChevron.setAttribute('aria-hidden', 'true');
      embeddedToggleBtn.appendChild(embeddedChevron);

      var embeddedLeading = document.createElement('span');
      embeddedLeading.className = 'section-leading-icon statut-leading-icon';
      embeddedLeading.setAttribute('aria-hidden', 'true');
      var embeddedLeadingGlyph = document.createElement('i');
      embeddedLeadingGlyph.className =
        'ti ti-list section-leading-icon-glyph';
      embeddedLeading.appendChild(embeddedLeadingGlyph);
      embeddedToggleBtn.appendChild(embeddedLeading);

      var embeddedTextWrap = document.createElement('span');
      embeddedTextWrap.className = 'section-enable-text';
      var embeddedTitle = document.createElement('span');
      embeddedTitle.className = 'section-enable-title statut-enable-title';
      embeddedTitle.textContent = 'Statut';
      embeddedTextWrap.appendChild(embeddedTitle);
      embeddedToggleBtn.appendChild(embeddedTextWrap);

      embeddedHeaderSummary = document.createElement('span');
      embeddedHeaderSummary.className = 'section-toggle-summary';
      embeddedHeaderSummary.hidden = true;
      embeddedHeaderSummary.setAttribute('aria-hidden', 'true');
      embeddedToggleBtn.appendChild(embeddedHeaderSummary);

      embeddedHead.appendChild(embeddedToggleBtn);

      heroEl = document.createElement('div');
      heroEl.className = 'statut-hero';
      heroEl.setAttribute('aria-live', 'polite');
      body.appendChild(heroEl);

      embeddedSummaryEl = document.createElement('p');
      embeddedSummaryEl.className = 'statut-embedded-summary';
      embeddedSummaryEl.hidden = true;
      embeddedSummaryEl.setAttribute('aria-live', 'polite');
      body.appendChild(embeddedSummaryEl);
    }

    var authBox = document.createElement('div');
    authBox.className = 'statut-auth-box';

    var hint = document.createElement('p');
    hint.className = 'statut-auth-hint';

    var authBtn = document.createElement('button');
    authBtn.type = 'button';
    authBtn.className = 'tp-button statut-auth-button';
    authBtn.textContent = 'Autoriser Trello (lecture + écriture)';
    authBtn.addEventListener('click', function () {
      if (!onAuthorize || authBusy) return;
      authBusy = true;
      authBtn.disabled = true;
      Promise.resolve(onAuthorize())
        .then(function () {
          setAuthHint('');
        })
        .catch(function (err) {
          console.error('Statut REST authorize failed', err);
          setAuthHint('not-authorized');
        })
        .then(function () {
          authBusy = false;
          updateAuthUi();
          onLayoutChange();
        });
    });

    authBox.appendChild(hint);
    authBox.appendChild(authBtn);

    var groupsEl = document.createElement('div');
    groupsEl.className = 'statut-groups';
    groupsEl.setAttribute('role', 'listbox');
    groupsEl.setAttribute('aria-label', 'Listes du tableau');

    var emptyEl = document.createElement('p');
    emptyEl.className = 'statut-empty';
    emptyEl.hidden = true;
    emptyEl.textContent = 'Aucune liste trouvée sur ce tableau.';

    body.appendChild(authBox);
    body.appendChild(groupsEl);
    body.appendChild(emptyEl);

    var blockedPanel = document.createElement('div');
    // Visibility is class-driven (is-statut-blocked) so profile feature flags can
    // still use the [hidden] attribute without fighting category sync.
    blockedPanel.className = 'statut-blocked-panel';
    var blockedMount = document.createElement('div');
    blockedMount.className = 'statut-blocked-mount';
    blockedPanel.appendChild(blockedMount);
    body.appendChild(blockedPanel);

    function authMessage(reason) {
      if (reason === 'no-app-key') {
        return (
          'Impossible de déplacer la carte : aucune clé API Trello n’est configurée pour ce Power-Up. ' +
          'Dans components/shared/rest-config.js, renseignez appKey (clé depuis trello.com/power-ups/admin), puis rechargez.'
        );
      }
      if (reason === 'not-authorized') {
        return (
          'Impossible de déplacer la carte : Trello n’a pas encore l’autorisation d’écriture. ' +
          'Cliquez sur le bouton ci-dessous (une fois par membre).'
        );
      }
      return '';
    }

    function updateAuthUi() {
      var msg = authMessage(authReason);
      hint.textContent = msg;
      authBox.hidden = !msg;
      authBtn.hidden = authReason !== 'not-authorized' || !onAuthorize;
      authBtn.disabled = authBusy;
    }

    function setAuthHint(reason) {
      authReason = reason || '';
      updateAuthUi();
    }

    updateAuthUi();
    field.appendChild(body);
    el.appendChild(field);

    function currentListName() {
      for (var i = 0; i < lists.length; i++) {
        if (String(lists[i].id) === String(currentListId)) return lists[i].name;
      }
      return '';
    }

    function currentCategory() {
      if (!currentListId) return null;
      var cats = (settings && settings.listCategories) || {};
      var cat = cats[currentListId] || cats[String(currentListId)] || null;
      var roleBlocked =
        settings && settings.roleLists && settings.roleLists.blocked
          ? String(settings.roleLists.blocked)
          : '';
      if (roleBlocked && roleBlocked === String(currentListId)) return 'blocked';
      var roleCompleted =
        settings && settings.roleLists && settings.roleLists.completed
          ? String(settings.roleLists.completed)
          : '';
      if (roleCompleted && roleCompleted === String(currentListId)) return 'completed';
      return cat || null;
    }

    function syncBlockedPanel() {
      var show = currentCategory() === 'blocked';
      var wasActive = blockedPanel.classList.contains('is-statut-blocked');
      blockedPanel.classList.toggle('is-statut-blocked', show);
      field.classList.toggle('has-blocked-panel', show);
      refreshEmbeddedSummary();
      if (wasActive !== show) onLayoutChange();
    }

    function syncStatutSectionTint() {
      syncBlockedPanel();
      var cat = currentCategory();
      if (!cat) {
        clearSectionGlow(field);
        return;
      }
      var style = statutCategoryStyle(cat);
      applySectionGlow(field, style && style.color);
    }

    function summaryContent() {
      var name = currentListName() || (currentListId ? 'Liste inconnue' : '—');
      var style = statutCategoryStyle(currentCategory() || '_none');
      var wrap = document.createElement('span');
      wrap.className = 'statut-summary';
      wrap.style.setProperty('--statut-color', style.color || '#626f86');
      wrap.appendChild(createStatutIcon(style.icon || 'dot'));
      var label = document.createElement('span');
      label.className = 'statut-summary-label';
      label.textContent = name;
      wrap.appendChild(label);
      return wrap;
    }

    function refreshEmbeddedHeaderSummary() {
      if (!embeddedHeaderSummary) return;
      embeddedHeaderSummary.replaceChildren(summaryContent());
      embeddedHeaderSummary.hidden = false;
      embeddedHeaderSummary.setAttribute('aria-hidden', 'false');
    }

    function refreshEmbeddedSummary() {
      if (!embeddedSummaryEl) return;
      var show = currentCategory() === 'blocked' && !embeddedDetailsExpanded;
      var text = formatBlockedReasonsSummary(embeddedBlockedReasons, {
        empty: BLOCKED_LABEL,
      });
      embeddedSummaryEl.textContent = text;
      embeddedSummaryEl.title = text;
      embeddedSummaryEl.hidden = !show;
    }

    function setEmbeddedDetailsExpanded(expanded, opts) {
      if (!embedded) return;
      opts = opts || {};
      embeddedDetailsExpanded = !!expanded;
      field.classList.toggle('is-collapsed', !embeddedDetailsExpanded);
      if (embeddedToggleBtn) {
        embeddedToggleBtn.setAttribute(
          'aria-expanded',
          embeddedDetailsExpanded ? 'true' : 'false'
        );
        embeddedToggleBtn.setAttribute(
          'aria-label',
          embeddedDetailsExpanded
            ? 'Replier les détails du statut'
            : 'Développer les détails du statut'
        );
        embeddedToggleBtn.title = embeddedDetailsExpanded
          ? 'Replier les détails'
          : 'Développer les détails';
      }
      refreshEmbeddedHeaderSummary();
      refreshEmbeddedSummary();
      if (opts.persist !== false) {
        saveStatutEmbeddedDetailsExpanded(embeddedDetailsExpanded);
      }
      if (opts.notifyLayout !== false) onLayoutChange();
    }

    function buildGroups() {
      if (
        typeof global.StatutTrello !== 'undefined' &&
        global.StatutTrello.groupListsByCategory
      ) {
        return global.StatutTrello.groupListsByCategory(lists, settings, {
          includeUnassigned: showUnassigned,
        });
      }
      return lists.length
        ? [{ key: '_none', label: 'Listes', lists: lists }]
        : [];
    }

    /** Keep the active list visible even when unassigned chip row is hidden. */
    function ensureCurrentListVisible(groups) {
      if (!currentListId || showUnassigned) return groups;
      var found = false;
      for (var gi = 0; gi < groups.length; gi++) {
        for (var li = 0; li < groups[gi].lists.length; li++) {
          if (String(groups[gi].lists[li].id) === String(currentListId)) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) return groups;

      var current = null;
      for (var i = 0; i < lists.length; i++) {
        if (String(lists[i].id) === String(currentListId)) {
          current = lists[i];
          break;
        }
      }
      if (!current) return groups;

      var style = statutCategoryStyle('_none');
      var next = groups.slice();
      next.push({
        key: '_none',
        label: 'Non assigné',
        lists: [current],
        color: style.color,
        icon: style.icon,
      });
      return next;
    }

    function renderHero() {
      if (!heroEl) return;
      heroEl.replaceChildren();
      var cat = currentCategory() || '_none';
      var style = statutCategoryStyle(cat);
      var color = style.color || '#626f86';
      var name = currentListName() || (currentListId ? 'Liste inconnue' : '—');
      heroEl.style.setProperty('--statut-color', color);
      heroEl.dataset.category = cat;

      var iconWrap = document.createElement('div');
      iconWrap.className = 'statut-hero-icon';
      iconWrap.appendChild(createStatutIcon(style.icon || 'dot', 28));

      var nameEl = document.createElement('div');
      nameEl.className = 'statut-hero-name';
      nameEl.textContent = name;

      heroEl.appendChild(iconWrap);
      heroEl.appendChild(nameEl);
    }

    function renderOptions() {
      groupsEl.replaceChildren();
      var groups = ensureCurrentListVisible(buildGroups());
      emptyEl.hidden = lists.length > 0;
      settingsBtn.hidden = !onOpenSettings;
      if (embeddedBar) embeddedBar.hidden = !onOpenSettings;
      renderHero();

      if (!groups.length) return;

      function statutTitleKey(s) {
        return String(s || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '');
      }

      var chipRow = document.createElement('div');
      chipRow.className = 'statut-chip-row';
      chipRow.setAttribute('role', 'group');
      chipRow.setAttribute('aria-label', 'Statuts');

      groups.forEach(function (group) {
        var style = statutCategoryStyle(group.key);
        var color = group.color || style.color;
        var iconKey = group.icon || style.icon;

        group.lists.forEach(function (list) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'statut-list-option';
          btn.dataset.listId = list.id;
          btn.dataset.category = group.key;
          btn.setAttribute('role', 'option');
          btn.style.setProperty('--statut-color', color);
          var selected = String(list.id) === String(currentListId);
          btn.classList.toggle('is-selected', selected);
          btn.setAttribute('aria-selected', selected ? 'true' : 'false');
          btn.disabled = busy;
          // Avoid "En cours — En cours" when the list name already matches the category.
          var groupLabel = String(group.label || '').trim();
          var listName = String(list.name || '').trim();
          btn.title =
            groupLabel &&
            listName &&
            statutTitleKey(groupLabel) !== statutTitleKey(listName)
              ? groupLabel + ' — ' + listName
              : '';

          btn.appendChild(createStatutIcon(iconKey));
          var nameSpan = document.createElement('span');
          nameSpan.className = 'statut-list-option-name';
          nameSpan.textContent = list.name;
          btn.appendChild(nameSpan);

          btn.addEventListener('click', function () {
            if (busy || String(list.id) === String(currentListId)) return;
            selectList(list.id);
          });
          chipRow.appendChild(btn);
        });
      });

      groupsEl.appendChild(chipRow);
      syncStatutSectionTint();
    }

    if (embeddedToggleBtn) {
      embeddedToggleBtn.addEventListener('click', function (event) {
        event.preventDefault();
        setEmbeddedDetailsExpanded(!embeddedDetailsExpanded);
      });
    }

    if (embeddedSummaryEl) {
      embeddedSummaryEl.addEventListener('click', function () {
        if (!embeddedDetailsExpanded) setEmbeddedDetailsExpanded(true);
      });
    }

    function selectList(listId) {
      if (!onSelectList) {
        currentListId = String(listId);
        if (embedded && currentCategory() === 'blocked' && !embeddedDetailsExpanded) {
          setEmbeddedDetailsExpanded(true, { notifyLayout: false });
        }
        renderOptions();
        refreshSummary();
        syncStatutSectionTint();
        onChange({ listId: currentListId });
        return;
      }
      busy = true;
      renderOptions();
      Promise.resolve(onSelectList(listId))
        .then(function (result) {
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
            }
            return;
          }
          currentListId = String(listId);
          if (embedded && currentCategory() === 'blocked' && !embeddedDetailsExpanded) {
            setEmbeddedDetailsExpanded(true, { notifyLayout: false });
          }
          setAuthHint('');
          onChange({ listId: currentListId, result: result });
        })
        .catch(function (err) {
          console.error('Statut list select failed', err);
        })
        .then(function () {
          busy = false;
          renderOptions();
          refreshSummary();
          syncStatutSectionTint();
          onLayoutChange();
        });
    }

    var collapse = null;
    if (!embedded) {
      collapse = bindCollapsibleEnable({
        field: field,
        body: body,
        chrome: chrome,
        alwaysEnabled: true,
        enabled: true,
        expanded:
          config.expanded != null
            ? !!config.expanded
            : true,
        getSummary: summaryContent,
        onLayoutChange: onLayoutChange,
        onExpandChange: config.onExpandChange || function () {},
        onEnableChange: function (on) {
          if (typeof config.onEnableChange === 'function') {
            config.onEnableChange(on);
          }
          onLayoutChange();
        },
      });
    }

    function refreshSummary() {
      if (collapse) collapse.refreshSummary();
      if (embedded) refreshEmbeddedHeaderSummary();
    }

    renderOptions();
    if (embedded) {
      setEmbeddedDetailsExpanded(embeddedDetailsExpanded, {
        persist: false,
        notifyLayout: false,
      });
    }
    refreshSummary();

    return {
      field: field,
      getListId: function () {
        return currentListId;
      },
      getCategory: currentCategory,
      getBlockedMount: function () {
        return blockedMount;
      },
      syncBlockedPanel: syncStatutSectionTint,
      setExpanded: function (on, opts) {
        if (!collapse && embedded) return setEmbeddedDetailsExpanded(on, opts);
        if (!collapse) return;
        return collapse.setExpanded(on, opts);
      },
      isExpanded: function () {
        if (collapse) return collapse.isExpanded();
        return embedded ? !!embeddedDetailsExpanded : true;
      },
      setBlockedSummary: function (reasons) {
        embeddedBlockedReasons = normalizeBlockedReasons(reasons);
        refreshEmbeddedSummary();
      },
      setListId: function (listId) {
        currentListId = listId ? String(listId) : '';
        renderOptions();
        refreshSummary();
        syncStatutSectionTint();
      },
      setData: function (next) {
        if (!next) return;
        if (next.lists) lists = next.lists.slice();
        if (next.settings) {
          settings = next.settings;
          if (
            typeof global.StatutMatch !== 'undefined' &&
            typeof global.StatutMatch.applyStateColors === 'function'
          ) {
            global.StatutMatch.applyStateColors(settings.stateColors);
          }
        }
        if (next.listId != null) currentListId = next.listId ? String(next.listId) : '';
        if (next.authReason != null) {
          setAuthHint(next.authReason);
        } else if (next.needsAuth != null) {
          setAuthHint(next.needsAuth ? 'not-authorized' : '');
        }
        if (next.showUnassigned != null) {
          showUnassigned = !!next.showUnassigned;
        } else if (next.settings) {
          showUnassigned = !!settings.showUnassigned;
        }
        renderOptions();
        refreshSummary();
        syncStatutSectionTint();
        onLayoutChange();
      },
      isEnabled: function () {
        return collapse ? collapse.isEnabled() : true;
      },
      setEnabled: function (on, opts) {
        if (!collapse) return;
        return collapse.setEnabled(on, opts);
      },
      refreshSummary: refreshSummary,
    };
  }

  function normalizeParentCards(raw) {
    var list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || typeof item !== 'object' || !item.id) continue;
      var id = String(item.id);
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push({
        id: id,
        name: typeof item.name === 'string' ? item.name : '',
        list: typeof item.list === 'string' ? item.list : '',
      });
    }
    return out;
  }

  var PROGRESS_CHECK_SVG =
    '<svg class="tp-completion-check-icon" viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3.5 8.2 L6.6 11.2 L12.5 4.8"></path>' +
    '</svg>';
  var PROGRESS_PAUSE_SVG =
    '<svg class="tp-completion-check-icon tp-completion-pause-icon" viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false">' +
    '<rect x="5" y="4" width="2.2" height="8" rx="0.8" fill="currentColor"></rect>' +
    '<rect x="8.8" y="4" width="2.2" height="8" rx="0.8" fill="currentColor"></rect>' +
    '</svg>';

  /**
   * Compact Progrès header summary: same ring + % + bar + color as the Overview cell.
   * When blocked, the label shows the Motif (block reason) instead of remaining tasks / %.
   * Returns a DOM node, or '' when there is nothing to show.
   */
  function buildProgressSummaryNode(opts) {
    opts = opts || {};
    var percent =
      opts.progressPercent != null && isFinite(+opts.progressPercent)
        ? Math.max(0, Math.min(100, Math.round(+opts.progressPercent)))
        : null;
    if (percent == null) return '';

    var color =
      typeof opts.progressColor === 'string' ? opts.progressColor : '';
    var blocked = !!opts.progressBlocked;
    var title = typeof opts.title === 'string' ? opts.title.trim() : '';
    var donePct = percent >= 100;
    var showReason = blocked && !donePct;
    var accent = blocked
      ? readCssVar('--blocked-accent', '#ae2e24')
      : color || '';

    var wrap = document.createElement('span');
    wrap.className = 'progress-summary';
    if (title) wrap.title = title;
    wrap.classList.toggle('is-blocked', showReason);
    if (accent) {
      wrap.style.setProperty('--overview-progress-accent', accent);
      wrap.classList.add('has-progress-accent');
    }

    var valueRow = document.createElement('span');
    valueRow.className = 'progress-summary-value';

    var ring = document.createElement('span');
    ring.className = 'overview-progress-ring tp-completion-check';
    ring.setAttribute('aria-hidden', 'true');
    ring.classList.toggle('is-checked', donePct);
    ring.classList.toggle('has-progress', percent > 0 && !donePct);
    ring.classList.toggle('is-blocked', showReason);
    ring.style.setProperty('--completion-progress', String(percent));
    if (accent) {
      ring.style.setProperty('--completion-check-fill', accent);
    }
    ring.innerHTML = showReason ? PROGRESS_PAUSE_SVG : PROGRESS_CHECK_SVG;

    var pctText = document.createElement('span');
    pctText.className = 'overview-progress-pct';
    if (showReason) {
      pctText.classList.add('progress-summary-reason');
      pctText.textContent = title || 'Bloqu\u00e9';
    } else {
      pctText.textContent = percent + '\u00a0%';
    }

    valueRow.appendChild(ring);
    valueRow.appendChild(pctText);

    var track = document.createElement('span');
    track.className = 'overview-progress-track';
    var fill = document.createElement('span');
    fill.className = 'overview-progress-fill';
    fill.style.width = percent + '%';
    track.appendChild(fill);

    wrap.appendChild(valueRow);
    wrap.appendChild(track);
    return wrap;
  }

  /**
   * Primary overview / résumé at the top of the card popup (collapsible).
   * Title + metric cells (progress+statut combined, subtasks, deadline, priority);
   * each cell jumps to the matching accordion via onJump.
   */
  function createOverviewField(config) {
    config = config || {};
    var mountEl = config.el;
    var onJump = typeof config.onJump === 'function' ? config.onJump : null;
    var onLayoutChange =
      typeof config.onLayoutChange === 'function' ? config.onLayoutChange : null;
    var onExpandChange =
      typeof config.onExpandChange === 'function' ? config.onExpandChange : null;

    var titleText = typeof config.title === 'string' ? config.title : '';
    var statusText = typeof config.status === 'string' ? config.status : '';
    var statusCategory =
      typeof config.statusCategory === 'string' ? config.statusCategory : '';
    var statusColor =
      typeof config.statusColor === 'string' ? config.statusColor : '';
    var progressPercent =
      config.progressPercent != null && isFinite(+config.progressPercent)
        ? Math.max(0, Math.min(100, Math.round(+config.progressPercent)))
        : null;
    var progressColor =
      typeof config.progressColor === 'string' ? config.progressColor : '';
    var progressBlocked = !!config.progressBlocked;
    var subtasksDone =
      config.subtasksDone != null && isFinite(+config.subtasksDone)
        ? Math.max(0, Math.round(+config.subtasksDone))
        : 0;
    var subtasksTotal =
      config.subtasksTotal != null && isFinite(+config.subtasksTotal)
        ? Math.max(0, Math.round(+config.subtasksTotal))
        : 0;
    var dueCountdown =
      typeof config.dueCountdown === 'string' ? config.dueCountdown : '';
    var dueBand = typeof config.dueBand === 'string' ? config.dueBand : '';
    var priorityLabel =
      typeof config.priorityLabel === 'string' ? config.priorityLabel : '';
    var priorityColor =
      typeof config.priorityColor === 'string' ? config.priorityColor : '';
    var statusBrief =
      typeof config.statusBrief === 'string' ? config.statusBrief : '';
    var statusBriefPending = !!config.statusBriefPending;
    var features =
      config.features && typeof config.features === 'object'
        ? Object.assign({}, config.features)
        : {
            statut: true,
            progress: true,
            due: true,
            priority: true
          };

    var bodyId = 'overview-section-body-' + Math.random().toString(36).slice(2, 9);

    var section = document.createElement('div');
    section.className = 'variant-overview-section';

    var field = document.createElement('div');
    field.className = 'field field--overview is-enabled';
    section.appendChild(field);

    var chrome = createCollapsibleEnableChrome({
      title: 'R\u00e9sum\u00e9',
      bodyId: bodyId,
      hideEnable: true,
      leadingIcon: 'ti-layout-dashboard',
      iconClass: 'overview-leading-icon',
      titleClass: 'overview-enable-title',
      collapseLabel: 'Replier R\u00e9sum\u00e9',
      expandLabel: 'D\u00e9velopper R\u00e9sum\u00e9'
    });
    field.appendChild(chrome.head);

    var body = document.createElement('div');
    body.className = 'overview-section-body section-toggle-body';
    body.id = bodyId;

    function makeJumpable(el, jumpKeyOrRef, label) {
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      if (label) el.title = 'Aller \u00e0 ' + label;
      function resolveKey() {
        if (jumpKeyOrRef && typeof jumpKeyOrRef === 'object') {
          return jumpKeyOrRef.key;
        }
        return jumpKeyOrRef;
      }
      function go() {
        if (onJump) onJump(resolveKey());
      }
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    }

    // ── Title ──────────────────────────────────────────────────────────
    var titleBtn = document.createElement('div');
    titleBtn.className = 'overview-title';
    makeJumpable(titleBtn, 'info', 'D\u00e9tails');

    var titleIcon = document.createElement('i');
    titleIcon.className = 'ti ti-heading overview-title-icon';
    titleIcon.setAttribute('aria-hidden', 'true');
    titleBtn.appendChild(titleIcon);

    var titleValue = document.createElement('span');
    titleValue.className = 'overview-title-text';
    titleBtn.appendChild(titleValue);

    var titleChevron = document.createElement('i');
    titleChevron.className = 'ti ti-chevron-right overview-title-chevron';
    titleChevron.setAttribute('aria-hidden', 'true');
    titleBtn.appendChild(titleChevron);

    body.appendChild(titleBtn);

    // ── Status brief (boss-style one-liner) ─────────────────────────────
    var statusBriefEl = document.createElement('p');
    statusBriefEl.className = 'overview-status-brief';
    statusBriefEl.hidden = true;
    body.appendChild(statusBriefEl);

    // ── Metrics grid ───────────────────────────────────────────────────
    var metrics = document.createElement('div');
    metrics.className = 'overview-metrics';
    body.appendChild(metrics);

    function makeCell(key, jumpKey, label, iconClass) {
      var cell = document.createElement('div');
      cell.className = 'overview-cell overview-cell--' + key;
      cell.dataset.overviewKey = key;
      makeJumpable(cell, jumpKey, label);

      var head = document.createElement('div');
      head.className = 'overview-cell-head';

      var icon = document.createElement('i');
      icon.className = 'ti ' + iconClass + ' overview-cell-icon';
      icon.setAttribute('aria-hidden', 'true');
      head.appendChild(icon);

      var lab = document.createElement('span');
      lab.className = 'overview-cell-label';
      lab.textContent = label;
      head.appendChild(lab);

      cell.appendChild(head);

      var valueWrap = document.createElement('div');
      valueWrap.className = 'overview-cell-value';
      cell.appendChild(valueWrap);

      metrics.appendChild(cell);
      return { cell: cell, value: valueWrap, head: head, icon: icon };
    }

    var progressJump = { key: 'progress' };
    var progressCell = makeCell(
      'progress',
      progressJump,
      'Progr\u00e8s',
      'ti-progress'
    );
    var subtasksCell = makeCell(
      'subtasks',
      'progress',
      'Sous-t\u00e2ches',
      'ti-checkbox'
    );
    var dueCell = makeCell('due', 'due', '\u00c9ch\u00e9ance', 'ti-calendar-event');
    var priorityCell = makeCell('priority', 'priority', 'Priorit\u00e9', 'ti-flame');

    var progressRing = document.createElement('span');
    progressRing.className = 'overview-progress-ring tp-completion-check';
    progressRing.setAttribute('aria-hidden', 'true');
    progressRing.innerHTML = PROGRESS_CHECK_SVG;

    var progressBarTrack = document.createElement('div');
    progressBarTrack.className = 'overview-progress-track';
    var progressBarFill = document.createElement('div');
    progressBarFill.className = 'overview-progress-fill';
    progressBarTrack.appendChild(progressBarFill);
    progressCell.cell.appendChild(progressBarTrack);

    var priorityDot = document.createElement('span');
    priorityDot.className = 'heat-tier-dot overview-priority-dot';
    priorityDot.setAttribute('aria-hidden', 'true');

    var priorityText = document.createElement('span');
    priorityText.className = 'overview-priority-label';

    function setFeatureVisible(cell, on) {
      if (on) {
        cell.removeAttribute('hidden');
      } else {
        cell.setAttribute('hidden', '');
      }
    }

    function setProgressHeadIcon(mode, statusStyle) {
      var next;
      if (mode === 'status') {
        next = createStatutIcon((statusStyle && statusStyle.icon) || 'dot', 14);
        next.classList.add(
          'overview-cell-icon',
          'overview-status-icon',
          'ti'
        );
      } else {
        next = document.createElement('i');
        next.className = 'ti ti-progress overview-cell-icon';
        next.setAttribute('aria-hidden', 'true');
      }
      if (progressCell.icon && progressCell.icon.parentNode) {
        progressCell.icon.parentNode.replaceChild(next, progressCell.icon);
      } else {
        progressCell.head.insertBefore(
          next,
          progressCell.head.children[0] || null
        );
      }
      progressCell.icon = next;
    }

    /**
     * Combined Progrès cell: status wins for blocked/done; otherwise prefer %.
     */
    function resolveProgressDisplayMode() {
      var isBlocked = statusCategory === 'blocked' || !!progressBlocked;
      var isDone =
        statusCategory === 'completed' ||
        (progressPercent != null && progressPercent >= 100);
      if (isBlocked || isDone) return 'status';
      if (progressPercent != null) return 'progress';
      if ((statusText || '').trim()) return 'status';
      return 'empty';
    }

    function paint() {
      var t = (titleText || '').trim();
      if (t) {
        titleValue.textContent = t;
        titleValue.classList.remove('is-empty');
        titleBtn.classList.remove('is-empty');
      } else {
        titleValue.textContent = 'Sans titre';
        titleValue.classList.add('is-empty');
        titleBtn.classList.add('is-empty');
      }

      var brief = (statusBrief || '').trim();
      if (brief) {
        statusBriefEl.textContent = brief;
        statusBriefEl.hidden = false;
        statusBriefEl.classList.toggle('is-pending', !!statusBriefPending);
      } else {
        statusBriefEl.textContent = '';
        statusBriefEl.hidden = true;
        statusBriefEl.classList.remove('is-pending');
      }

      var progressFeatureOn =
        features.progress !== false || features.statut !== false;
      var due = (dueCountdown || '').trim();
      setFeatureVisible(progressCell.cell, progressFeatureOn);
      setFeatureVisible(
        subtasksCell.cell,
        features.progress !== false && subtasksTotal > 0
      );
      setFeatureVisible(dueCell.cell, features.due !== false && !!due);
      setFeatureVisible(priorityCell.cell, features.priority !== false);

      var st = (statusText || '').trim();
      var statusStyle = statutCategoryStyle(statusCategory || '_none');
      var statusAccent = statusColor || statusStyle.color || '';
      var isBlocked = statusCategory === 'blocked' || !!progressBlocked;
      var isDone =
        statusCategory === 'completed' ||
        (progressPercent != null && progressPercent >= 100);
      var mode = resolveProgressDisplayMode();
      progressJump.key = isBlocked ? 'blocked' : 'progress';

      progressCell.cell.classList.toggle('is-blocked', isBlocked);
      progressCell.cell.classList.toggle('is-done', !!isDone && !isBlocked);
      progressCell.cell.classList.toggle('is-status-mode', mode === 'status');
      progressCell.cell.classList.toggle('is-progress-mode', mode === 'progress');
      if (statusCategory) {
        progressCell.cell.dataset.statusCategory = statusCategory;
      } else if (progressCell.cell.dataset) {
        delete progressCell.cell.dataset.statusCategory;
      }

      setProgressHeadIcon(mode, statusStyle);

      var progressAccent = '';
      if (mode === 'status') {
        progressAccent =
          isBlocked
            ? statusAccent || readCssVar('--blocked-accent', '#ae2e24')
            : statusAccent || progressColor || '';
        progressCell.value.innerHTML = '';
        var statusLabel = '';
        if (isBlocked) {
          statusLabel =
            statusCategory === 'blocked' && st ? st : 'Bloqu\u00e9';
        } else if (isDone) {
          statusLabel = st || 'Termin\u00e9';
        } else {
          statusLabel = st;
        }
        progressCell.value.textContent = statusLabel || 'Sans statut';
        progressCell.value.classList.toggle('is-empty', !statusLabel);
        progressBarFill.style.width =
          isDone && !isBlocked
            ? '100%'
            : progressPercent != null
              ? progressPercent + '%'
              : '0%';
        progressBarTrack.classList.toggle(
          'is-empty',
          !(isDone && !isBlocked) && progressPercent == null
        );
        progressBarTrack.hidden = false;
      } else if (mode === 'progress') {
        progressAccent = progressBlocked
          ? readCssVar('--blocked-accent', '#ae2e24')
          : progressColor || '';
        progressCell.value.innerHTML = '';
        var donePct = progressPercent >= 100;
        progressRing.classList.toggle('is-checked', donePct);
        progressRing.classList.toggle(
          'has-progress',
          progressPercent > 0 && !donePct
        );
        progressRing.classList.toggle(
          'is-blocked',
          !!progressBlocked && !donePct
        );
        progressRing.style.setProperty(
          '--completion-progress',
          String(progressPercent)
        );
        if (progressAccent) {
          progressRing.style.setProperty(
            '--completion-check-fill',
            progressAccent
          );
        } else {
          progressRing.style.removeProperty('--completion-check-fill');
        }
        progressRing.innerHTML =
          progressBlocked && !donePct ? PROGRESS_PAUSE_SVG : PROGRESS_CHECK_SVG;
        progressCell.value.appendChild(progressRing);
        var pctText = document.createElement('span');
        pctText.className = 'overview-progress-pct';
        pctText.textContent = progressPercent + '\u00a0%';
        progressCell.value.appendChild(pctText);
        progressCell.value.classList.remove('is-empty');
        progressBarFill.style.width = progressPercent + '%';
        progressBarTrack.classList.remove('is-empty');
        progressBarTrack.hidden = false;
      } else {
        progressCell.value.innerHTML = '';
        progressCell.value.textContent = '\u2014';
        progressCell.value.classList.add('is-empty');
        progressBarFill.style.width = '0%';
        progressBarTrack.classList.add('is-empty');
        progressBarTrack.hidden = false;
        progressRing.classList.remove('is-checked', 'has-progress', 'is-blocked');
        progressRing.style.removeProperty('--completion-progress');
        progressRing.style.removeProperty('--completion-check-fill');
      }

      if (progressAccent) {
        progressCell.cell.style.setProperty(
          '--overview-progress-accent',
          progressAccent
        );
        progressCell.cell.style.setProperty(
          '--overview-status-accent',
          progressAccent
        );
        progressCell.cell.classList.add('has-progress-accent');
      } else {
        progressCell.cell.style.removeProperty('--overview-progress-accent');
        progressCell.cell.style.removeProperty('--overview-status-accent');
        progressCell.cell.classList.remove('has-progress-accent');
      }

      if (subtasksTotal > 0) {
        subtasksCell.value.textContent = subtasksDone + '\u00a0/\u00a0' + subtasksTotal;
        subtasksCell.value.classList.remove('is-empty');
      } else {
        subtasksCell.value.textContent = '';
        subtasksCell.value.classList.add('is-empty');
      }

      dueCell.value.textContent = due;
      dueCell.value.classList.toggle('is-empty', !due);
      for (var bi = 0; bi < DUE_PROXIMITY_BANDS.length; bi++) {
        var bandName = DUE_PROXIMITY_BANDS[bi];
        dueCell.cell.classList.toggle('is-due-' + bandName, dueBand === bandName);
      }
      dueCell.cell.classList.toggle('is-overdue', dueBand === 'overdue');
      if (dueBand) {
        dueCell.cell.dataset.dueBand = dueBand;
        var accent = dueBandAccent(dueBand);
        if (accent) {
          dueCell.cell.style.setProperty('--overview-due-accent', accent);
        } else {
          dueCell.cell.style.removeProperty('--overview-due-accent');
        }
      } else {
        if (dueCell.cell.dataset) delete dueCell.cell.dataset.dueBand;
        dueCell.cell.style.removeProperty('--overview-due-accent');
      }

      var pl = (priorityLabel || '').trim();
      priorityCell.value.innerHTML = '';
      if (pl) {
        if (priorityColor) {
          priorityDot.style.background = priorityColor;
          priorityCell.value.appendChild(priorityDot);
          priorityCell.cell.style.setProperty(
            '--overview-priority-accent',
            priorityColor
          );
        } else {
          priorityCell.cell.style.removeProperty('--overview-priority-accent');
        }
        priorityText.textContent = pl;
        priorityCell.value.appendChild(priorityText);
        priorityCell.value.classList.remove('is-empty');
      } else {
        priorityText.textContent = 'Non prioris\u00e9e';
        priorityCell.value.appendChild(priorityText);
        priorityCell.value.classList.add('is-empty');
        priorityCell.cell.style.removeProperty('--overview-priority-accent');
      }
      priorityCell.cell.classList.toggle('has-priority-color', !!(pl && priorityColor));

      if (onLayoutChange) onLayoutChange();
    }

    function summaryText() {
      var t = (titleText || '').trim();
      return t || 'Sans titre';
    }

    field.appendChild(body);

    var collapse = bindCollapsibleEnable({
      field: field,
      body: body,
      chrome: chrome,
      alwaysEnabled: true,
      enabled: true,
      expanded: config.expanded != null ? !!config.expanded : true,
      getSummary: summaryText,
      onLayoutChange: onLayoutChange,
      onExpandChange: onExpandChange || function () {}
    });

    paint();
    collapse.refreshSummary();

    if (mountEl) {
      mountEl.appendChild(section);
    }

    function setData(next) {
      if (!next || typeof next !== 'object') return;
      if (next.title != null) titleText = String(next.title || '');
      if (next.status != null) statusText = String(next.status || '');
      if (next.statusCategory != null) {
        statusCategory = String(next.statusCategory || '');
      }
      if (next.statusColor != null) {
        statusColor = String(next.statusColor || '');
      }
      if (next.progressPercent !== undefined) {
        if (next.progressPercent == null || next.progressPercent === '') {
          progressPercent = null;
        } else if (isFinite(+next.progressPercent)) {
          progressPercent = Math.max(
            0,
            Math.min(100, Math.round(+next.progressPercent))
          );
        }
      }
      if (next.progressColor != null) {
        progressColor = String(next.progressColor || '');
      }
      if (next.progressBlocked != null) {
        progressBlocked = !!next.progressBlocked;
      }
      if (next.subtasksDone != null && isFinite(+next.subtasksDone)) {
        subtasksDone = Math.max(0, Math.round(+next.subtasksDone));
      }
      if (next.subtasksTotal != null && isFinite(+next.subtasksTotal)) {
        subtasksTotal = Math.max(0, Math.round(+next.subtasksTotal));
      }
      if (next.dueCountdown != null) {
        dueCountdown = String(next.dueCountdown || '');
      }
      if (next.dueBand != null) dueBand = String(next.dueBand || '');
      if (next.priorityLabel != null) {
        priorityLabel = String(next.priorityLabel || '');
      }
      if (next.priorityColor != null) {
        priorityColor = String(next.priorityColor || '');
      }
      if (next.statusBrief != null) {
        statusBrief = String(next.statusBrief || '');
      }
      if (next.statusBriefPending != null) {
        statusBriefPending = !!next.statusBriefPending;
      }
      if (next.features && typeof next.features === 'object') {
        features = Object.assign({}, features, next.features);
      }
      paint();
      collapse.refreshSummary();
    }

    return {
      el: section,
      field: field,
      setData: setData,
      setExpanded: function (on) {
        if (collapse && typeof collapse.setExpanded === 'function') {
          collapse.setExpanded(!!on);
        }
      },
      isExpanded: function () {
        return collapse && typeof collapse.isExpanded === 'function'
          ? collapse.isExpanded()
          : true;
      },
      getData: function () {
        return {
          title: titleText,
          status: statusText,
          statusCategory: statusCategory,
          statusColor: statusColor,
          progressPercent: progressPercent,
          progressColor: progressColor,
          progressBlocked: progressBlocked,
          subtasksDone: subtasksDone,
          subtasksTotal: subtasksTotal,
          dueCountdown: dueCountdown,
          dueBand: dueBand,
          priorityLabel: priorityLabel,
          priorityColor: priorityColor,
          statusBrief: statusBrief,
          statusBriefPending: statusBriefPending,
          features: Object.assign({}, features)
        };
      }
    };
  }

  /**
   * Top-of-popup recap: title, description (editable), creator, assignees, labels.
   * Progrès mirror (remaining estimate) jumps to Progrès; optional Portée jump to Priorité.
   */
  function createInfoField(config) {
    var el = config.el;
    var onLayoutChange = config.onLayoutChange || function () {};
    var onTitleChange =
      typeof config.onTitleChange === 'function' ? config.onTitleChange : null;
    var onDescChange =
      typeof config.onDescChange === 'function' ? config.onDescChange : null;
    var onMemberAdd =
      typeof config.onMemberAdd === 'function' ? config.onMemberAdd : null;
    var onMemberRemove =
      typeof config.onMemberRemove === 'function' ? config.onMemberRemove : null;
    var onLabelAdd =
      typeof config.onLabelAdd === 'function' ? config.onLabelAdd : null;
    var onLabelRemove =
      typeof config.onLabelRemove === 'function' ? config.onLabelRemove : null;
    var onLabelDelete =
      typeof config.onLabelDelete === 'function' ? config.onLabelDelete : null;
    var onLabelCreate =
      typeof config.onLabelCreate === 'function' ? config.onLabelCreate : null;
    var onLabelColorChange =
      typeof config.onLabelColorChange === 'function'
        ? config.onLabelColorChange
        : null;
    var onLabelRename =
      typeof config.onLabelRename === 'function' ? config.onLabelRename : null;
    var suggestLabelsFn =
      typeof config.suggestLabels === 'function' ? config.suggestLabels : null;
    var suggestTaskTypesFn =
      typeof config.suggestTaskTypes === 'function'
        ? config.suggestTaskTypes
        : null;
    var onAuthorize =
      typeof config.onAuthorize === 'function' ? config.onAuthorize : null;
    var onJump =
      typeof config.onJump === 'function' ? config.onJump : null;
    var getBoardCards =
      typeof config.getBoardCards === 'function' ? config.getBoardCards : null;
    var onParentChange =
      typeof config.onParentChange === 'function' ? config.onParentChange : null;
    var onOpenParent =
      typeof config.onOpenParent === 'function' ? config.onOpenParent : null;
    var onTaskTypesChange =
      typeof config.onTaskTypesChange === 'function'
        ? config.onTaskTypesChange
        : null;
    var onCustomTaskTypesChange =
      typeof config.onCustomTaskTypesChange === 'function'
        ? config.onCustomTaskTypesChange
        : null;
    var onDismissedTaskTypeSuggestionsChange =
      typeof config.onDismissedTaskTypeSuggestionsChange === 'function'
        ? config.onDismissedTaskTypeSuggestionsChange
        : null;
    var bodyId = 'info-section-body-' + Math.random().toString(36).slice(2, 9);
    var titleText = typeof config.title === 'string' ? config.title : '';
    var descText = typeof config.desc === 'string' ? config.desc : '';
    var members = Array.isArray(config.members) ? config.members.slice() : [];
    var creatorMember =
      config.creator && typeof config.creator === 'object' && config.creator.id
        ? config.creator
        : null;
    var boardMembers = Array.isArray(config.boardMembers)
      ? config.boardMembers.slice()
      : [];
    var labels = Array.isArray(config.labels) ? config.labels.slice() : [];
    var boardLabels = Array.isArray(config.boardLabels)
      ? config.boardLabels.slice()
      : [];
    // Kept for label suggestions / collapsed summary — not shown as an Information row.
    var priorityLabel = typeof config.priorityLabel === 'string' ? config.priorityLabel : '';
    var impactReachLabel = typeof config.impactReach === 'string' ? config.impactReach : '';
    var durationLabel = typeof config.durationLabel === 'string' ? config.durationLabel : '';
    var progressLabel =
      typeof config.progressLabel === 'string' ? config.progressLabel : '';
    var titleDirty = false;
    var titleSaveTimer = null;
    var titleBusy = false;
    var descDirty = false;
    var descSaveTimer = null;
    var descBusy = false;
    var descSpellcheckGen = 0;
    var descSpellcheckedText = descText.trim() || null;
    var descSpellRevert = null;
    var authBusy = false;
    var authReason = config.authReason || '';
    var membersBusy = false;
    var membersPickerOpen = false;
    var labelsBusy = false;
    var labelsPickerOpen = false;
    var labelsColorEditId = '';
    var labelsRenameId = '';
    var labelsRenameDraft = '';
    var labelSuggestions = [];
    var labelSuggestionsLoading = false;
    var labelSuggestionsSeq = 0;
    var labelSuggestionsTimer = null;
    var labelSuggestionsKey = '';
    var taskTypeSuggestions = [];
    var taskTypeSuggestionsLoading = false;
    var taskTypeSuggestionsSeq = 0;
    var taskTypeSuggestionsTimer = null;
    var taskTypeSuggestionsKey = '';
    var parentCards = normalizeParentCards(
      Array.isArray(config.parents)
        ? config.parents
        : config.parent
          ? [config.parent]
          : []
    );
    var parentBusy = false;
    var parentPickerOpen = false;
    var parentBoardCardsCache = null;
    var taskTypes = normalizeTaskTypes(config.taskTypes);
    var dismissedTaskTypeSuggestions = normalizeTaskTypes(
      config.dismissedTaskTypeSuggestions
    );
    var taskTypesBusy = false;
    var taskTypesPickerOpen = false;
    var FIELD_SAVE_MS = 450;

    var field = document.createElement('div');
    field.className = 'field field--info is-enabled';

    var chrome = createCollapsibleEnableChrome({
      title: 'Détails',
      bodyId: bodyId,
      hideEnable: true,
      leadingIcon: 'ti-info-circle',
      iconClass: 'info-leading-icon',
      titleClass: 'info-enable-title',
      collapseLabel: 'Replier Détails',
      expandLabel: 'D\u00e9velopper Détails'
    });
    field.appendChild(chrome.head);

    var body = document.createElement('div');
    body.className = 'info-section-body section-toggle-body';
    body.id = bodyId;

    function makeRow(key, labelText, options) {
      options = options || {};
      var row = document.createElement('div');
      row.className = 'info-row info-row--' + key;
      if (options.interactive) row.classList.add('is-interactive');

      var label = document.createElement('div');
      label.className = 'info-row-label';
      label.title = labelText;
      if (options.icon) {
        var labelIcon = document.createElement('i');
        labelIcon.className = 'ti ' + options.icon + ' info-row-icon';
        labelIcon.setAttribute('aria-hidden', 'true');
        label.appendChild(labelIcon);
      }
      var labelTextEl = document.createElement('span');
      labelTextEl.className = 'info-row-label-text';
      labelTextEl.textContent = labelText;
      label.appendChild(labelTextEl);

      var value = document.createElement('div');
      value.className = 'info-row-value';

      row.appendChild(label);
      row.appendChild(value);

      if (options.interactive && onJump) {
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        row.title = 'Aller \u00e0 ' + labelText;
        function jump() {
          // Portée lives in Priorité; Progrès has its own section.
          onJump(key === 'porte' ? 'priority' : key);
        }
        row.addEventListener('click', jump);
        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            jump();
          }
        });
      }

      return { row: row, value: value };
    }

    // ── Title ──────────────────────────────────────────────────────────
    var titleRow = makeRow('title', 'Titre', { icon: 'ti-heading' });
    var titleWrap = document.createElement('div');
    titleWrap.className = 'info-title-wrap';

    var titleInput = document.createElement('textarea');
    titleInput.className = 'info-title-input';
    titleInput.id = 'cardName';
    titleInput.rows = 1;
    titleInput.setAttribute('aria-label', 'Titre de la carte');
    titleInput.setAttribute('aria-live', 'polite');
    titleInput.placeholder = 'Titre de la carte';
    if (titleText) {
      titleInput.value = titleText;
    } else {
      titleInput.classList.add('is-loading');
      titleInput.value = 'Chargement\u2026';
      titleInput.readOnly = true;
    }

    var titleMeta = document.createElement('div');
    titleMeta.className = 'info-desc-meta';
    var titleStatus = document.createElement('span');
    titleStatus.className = 'info-desc-status';
    titleStatus.setAttribute('aria-live', 'polite');
    titleMeta.appendChild(titleStatus);

    titleWrap.appendChild(titleInput);
    titleWrap.appendChild(titleMeta);
    titleRow.value.appendChild(titleWrap);
    body.appendChild(titleRow.row);

    // ── Description (always-visible markdown / rich editor) ─────────────
    var descRow = makeRow('desc', 'Description', { icon: 'ti-notes' });
    var descWrap = document.createElement('div');
    descWrap.className = 'info-desc-wrap';
    var descMode = 'rich';

    var descInput = document.createElement('textarea');
    descInput.className = 'info-desc-input';
    descInput.id = 'cardDesc';
    descInput.rows = 3;
    descInput.hidden = true;
    descInput.placeholder = 'Ajouter une description\u2026';
    descInput.setAttribute('aria-label', 'Description de la carte');
    descInput.setAttribute('spellcheck', 'false');
    descInput.value = descText;

    var descRich = document.createElement('div');
    descRich.className = 'info-desc-rich info-desc-preview';
    descRich.id = 'cardDescRich';
    descRich.contentEditable = 'true';
    descRich.setAttribute('role', 'textbox');
    descRich.setAttribute('aria-multiline', 'true');
    descRich.setAttribute('aria-label', 'Description de la carte, texte enrichi');
    descRich.setAttribute('spellcheck', 'true');
    descRich.setAttribute('data-placeholder', 'Ajouter une description\u2026');

    // Trello-style formatting toolbar (always visible with the editor).
    var descToolbar = document.createElement('div');
    descToolbar.className = 'info-desc-toolbar';
    descToolbar.setAttribute('role', 'toolbar');
    descToolbar.setAttribute('aria-label', 'Mise en forme de la description');

    var DESC_FORMAT_OPTIONS = [
      { kind: 'normal', label: 'Texte normal' },
      { kind: 'h1', label: 'Titre 1' },
      { kind: 'h2', label: 'Titre 2' },
      { kind: 'h3', label: 'Titre 3' },
      { kind: 'ul', label: 'Liste \u00e0 puces' },
      { kind: 'ol', label: 'Liste num\u00e9rot\u00e9e' },
      { kind: 'checklist', label: 'Liste de t\u00e2ches' }
    ];
    var DESC_FORMAT_LABELS = {};
    DESC_FORMAT_OPTIONS.forEach(function (opt) {
      DESC_FORMAT_LABELS[opt.kind] = opt.label;
    });

    var descFormatWrap = document.createElement('div');
    descFormatWrap.className = 'info-desc-format-wrap';

    var descFormatBtn = document.createElement('button');
    descFormatBtn.type = 'button';
    descFormatBtn.className = 'info-desc-toolbar-btn info-desc-format-btn';
    descFormatBtn.setAttribute('aria-haspopup', 'listbox');
    descFormatBtn.setAttribute('aria-expanded', 'false');
    descFormatBtn.title = 'Format';
    descFormatBtn.setAttribute('aria-label', 'Format');
    var descFormatBtnLabel = document.createElement('span');
    descFormatBtnLabel.className = 'info-desc-format-btn-label';
    descFormatBtnLabel.textContent = 'Texte normal';
    descFormatBtn.appendChild(descFormatBtnLabel);
    descFormatBtn.appendChild(document.createTextNode(' '));
    var descFormatChevron = document.createElement('i');
    descFormatChevron.className = 'ti ti-chevron-down';
    descFormatChevron.setAttribute('aria-hidden', 'true');
    descFormatBtn.appendChild(descFormatChevron);

    var descFormatMenu = document.createElement('div');
    descFormatMenu.className = 'info-desc-format-menu';
    descFormatMenu.hidden = true;
    descFormatMenu.setAttribute('role', 'listbox');
    descFormatMenu.setAttribute('aria-label', 'Formats');

    DESC_FORMAT_OPTIONS.forEach(function (opt) {
      var optBtn = document.createElement('button');
      optBtn.type = 'button';
      optBtn.className = 'info-desc-format-option';
      optBtn.setAttribute('role', 'option');
      optBtn.setAttribute('data-md-kind', opt.kind);
      optBtn.textContent = opt.label;
      if (opt.kind === 'h1') optBtn.classList.add('is-heading-1');
      if (opt.kind === 'h2') optBtn.classList.add('is-heading-2');
      if (opt.kind === 'h3') optBtn.classList.add('is-heading-3');
      descFormatMenu.appendChild(optBtn);
    });

    descFormatWrap.appendChild(descFormatBtn);
    descFormatWrap.appendChild(descFormatMenu);

    function makeDescToolbarBtn(opts) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'info-desc-toolbar-btn';
      if (opts.mod) btn.className += ' ' + opts.mod;
      btn.title = opts.title;
      btn.setAttribute('aria-label', opts.label || opts.title);
      btn.setAttribute('data-md-action', opts.action);
      btn.innerHTML =
        '<i class="ti ' + opts.icon + '" aria-hidden="true"></i>';
      return btn;
    }

    var descToolbarSep = document.createElement('span');
    descToolbarSep.className = 'info-desc-toolbar-sep';
    descToolbarSep.setAttribute('aria-hidden', 'true');

    var descBoldBtn = makeDescToolbarBtn({
      action: 'bold',
      title: 'Gras (Ctrl+B)',
      label: 'Gras',
      icon: 'ti-bold',
      mod: 'is-emphasis'
    });
    var descItalicBtn = makeDescToolbarBtn({
      action: 'italic',
      title: 'Italique (Ctrl+I)',
      label: 'Italique',
      icon: 'ti-italic',
      mod: 'is-emphasis'
    });
    var descStrikeBtn = makeDescToolbarBtn({
      action: 'strike',
      title: 'Barr\u00e9',
      label: 'Barr\u00e9',
      icon: 'ti-strikethrough',
      mod: 'is-emphasis'
    });
    var descLinkBtn = makeDescToolbarBtn({
      action: 'link',
      title: 'Lien (Ctrl+K)',
      label: 'Lien',
      icon: 'ti-link'
    });
    var descChecklistBtn = makeDescToolbarBtn({
      action: 'checklist',
      title: 'Liste de t\u00e2ches',
      label: 'Liste de t\u00e2ches',
      icon: 'ti-list-check'
    });

    descToolbar.appendChild(descFormatWrap);
    descToolbar.appendChild(descToolbarSep);
    descToolbar.appendChild(descBoldBtn);
    descToolbar.appendChild(descItalicBtn);
    descToolbar.appendChild(descStrikeBtn);
    descToolbar.appendChild(descLinkBtn);
    descToolbar.appendChild(descChecklistBtn);

    var descModeSwitch = document.createElement('div');
    descModeSwitch.className = 'info-desc-mode-switch';
    descModeSwitch.setAttribute('role', 'radiogroup');
    descModeSwitch.setAttribute('aria-label', 'Mode d\u2019\u00e9dition');

    function makeDescModeBtn(mode, label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'info-desc-mode-btn';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('data-desc-mode', mode);
      btn.textContent = label;
      descModeSwitch.appendChild(btn);
      return btn;
    }

    var descRichModeBtn = makeDescModeBtn('rich', 'Texte enrichi');
    var descMarkdownModeBtn = makeDescModeBtn('markdown', 'Markdown');
    descToolbar.appendChild(descModeSwitch);

    var descMeta = document.createElement('div');
    descMeta.className = 'info-desc-meta';
    var descSpellSpinner = document.createElement('span');
    descSpellSpinner.className = 'info-desc-spinner';
    descSpellSpinner.hidden = true;
    descSpellSpinner.setAttribute('aria-hidden', 'true');
    descSpellSpinner.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
    var descStatus = document.createElement('span');
    descStatus.className = 'info-desc-status';
    descStatus.setAttribute('aria-live', 'polite');
    descMeta.appendChild(descSpellSpinner);
    descMeta.appendChild(descStatus);

    var authBox = document.createElement('div');
    authBox.className = 'info-auth-box';
    authBox.hidden = true;
    var authHint = document.createElement('p');
    authHint.className = 'info-auth-hint';
    var authBtn = document.createElement('button');
    authBtn.type = 'button';
    authBtn.className = 'tp-button info-auth-button';
    authBtn.textContent = 'Autoriser Trello (lecture + \u00e9criture)';
    authBox.appendChild(authHint);
    authBox.appendChild(authBtn);

    descWrap.appendChild(descToolbar);
    descWrap.appendChild(descRich);
    descWrap.appendChild(descInput);
    descWrap.appendChild(descMeta);
    descWrap.appendChild(authBox);
    descRow.value.appendChild(descWrap);
    body.appendChild(descRow.row);

    // ── Creator (visible when ≠ sole assignee) ─────────────────────────
    var creatorRow = makeRow('creator', 'Cr\u00e9ateur', { icon: 'ti-user' });
    var creatorEl = document.createElement('div');
    creatorEl.className = 'info-members info-creator';
    creatorEl.setAttribute('aria-label', 'Cr\u00e9ateur de la carte');
    creatorRow.value.appendChild(creatorEl);
    creatorRow.row.hidden = true;
    body.appendChild(creatorRow.row);

    // ── Assignees ──────────────────────────────────────────────────────
    var membersRow = makeRow('members', 'Assign\u00e9s', { icon: 'ti-users' });
    var membersWrap = document.createElement('div');
    membersWrap.className = 'info-members-wrap';

    var membersEl = document.createElement('div');
    membersEl.className = 'info-members';
    membersEl.setAttribute('aria-label', 'Membres assign\u00e9s');

    var membersAddWrap = document.createElement('div');
    membersAddWrap.className = 'info-members-add-wrap';

    var membersAddBtn = document.createElement('button');
    membersAddBtn.type = 'button';
    membersAddBtn.className = 'info-members-add-btn';
    membersAddBtn.setAttribute('aria-label', 'Ajouter un membre');
    membersAddBtn.title = 'Ajouter un membre';
    membersAddBtn.setAttribute('aria-expanded', 'false');
    membersAddBtn.setAttribute('aria-haspopup', 'listbox');
    membersAddBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';

    var membersPicker = document.createElement('div');
    membersPicker.className = 'info-members-picker';
    membersPicker.hidden = true;
    membersPicker.setAttribute('role', 'listbox');
    membersPicker.setAttribute('aria-label', 'Membres du tableau');

    var membersStatus = document.createElement('span');
    membersStatus.className = 'info-desc-status';
    membersStatus.setAttribute('aria-live', 'polite');

    membersAddWrap.appendChild(membersAddBtn);
    membersAddWrap.appendChild(membersPicker);
    var membersInline = document.createElement('div');
    membersInline.className = 'info-members-inline';
    membersInline.appendChild(membersEl);
    membersInline.appendChild(membersAddWrap);
    membersWrap.appendChild(membersInline);
    membersWrap.appendChild(membersStatus);
    membersRow.value.appendChild(membersWrap);
    body.appendChild(membersRow.row);

    // ── Labels (Trello étiquettes) ─────────────────────────────────────
    var labelsRow = makeRow('labels', '\u00c9tiquettes', { icon: 'ti-tag' });
    var labelsWrap = document.createElement('div');
    labelsWrap.className = 'info-labels-wrap';

    var labelsEl = document.createElement('div');
    labelsEl.className = 'info-labels';
    labelsEl.setAttribute('aria-label', '\u00c9tiquettes de la carte');

    var labelsAddWrap = document.createElement('div');
    labelsAddWrap.className = 'info-labels-add-wrap';

    var labelsAddBtn = document.createElement('button');
    labelsAddBtn.type = 'button';
    labelsAddBtn.className = 'info-labels-add-btn';
    labelsAddBtn.setAttribute('aria-label', 'Ajouter une \u00e9tiquette');
    labelsAddBtn.title = 'Ajouter une \u00e9tiquette';
    labelsAddBtn.setAttribute('aria-expanded', 'false');
    labelsAddBtn.setAttribute('aria-haspopup', 'listbox');
    labelsAddBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';

    var labelsPicker = document.createElement('div');
    labelsPicker.className = 'info-labels-picker';
    labelsPicker.hidden = true;
    labelsPicker.setAttribute('role', 'listbox');
    labelsPicker.setAttribute('aria-label', '\u00c9tiquettes du tableau');

    var labelsSearchInput = document.createElement('input');
    labelsSearchInput.type = 'search';
    labelsSearchInput.className = 'tp-input info-labels-search';
    labelsSearchInput.placeholder = 'Rechercher une \u00e9tiquette\u2026';
    labelsSearchInput.setAttribute('aria-label', 'Rechercher une \u00e9tiquette');
    labelsSearchInput.setAttribute('autocomplete', 'off');

    var labelsPickerList = document.createElement('div');
    labelsPickerList.className = 'info-labels-picker-list';
    labelsPickerList.setAttribute('role', 'group');
    labelsPickerList.setAttribute('aria-label', '\u00c9tiquettes disponibles');

    var labelsCreateBtn = document.createElement('button');
    labelsCreateBtn.type = 'button';
    labelsCreateBtn.className = 'info-labels-picker-create';
    labelsCreateBtn.hidden = true;

    labelsPicker.appendChild(labelsSearchInput);
    labelsPicker.appendChild(labelsPickerList);
    labelsPicker.appendChild(labelsCreateBtn);

    var labelsStatus = document.createElement('span');
    labelsStatus.className = 'info-desc-status';
    labelsStatus.setAttribute('aria-live', 'polite');

    var labelsSuggestSection = document.createElement('div');
    labelsSuggestSection.className = 'info-labels-suggestions';
    labelsSuggestSection.hidden = true;
    labelsSuggestSection.innerHTML =
      '<div class="info-labels-suggestions-head">' +
      '<button type="button" class="info-labels-suggestions-refresh" ' +
      'aria-label="Rafra\u00eechir les suggestions" title="Rafra\u00eechir">\u21bb</button>' +
      '</div>' +
      '<div class="info-labels-suggestions-list" role="list"></div>';
    var labelsSuggestRefreshBtn = labelsSuggestSection.querySelector(
      '.info-labels-suggestions-refresh'
    );
    var labelsSuggestListEl = labelsSuggestSection.querySelector(
      '.info-labels-suggestions-list'
    );

    labelsAddWrap.appendChild(labelsAddBtn);
    labelsAddWrap.appendChild(labelsPicker);
    var labelsInline = document.createElement('div');
    labelsInline.className = 'info-labels-inline';
    labelsInline.appendChild(labelsEl);
    labelsInline.appendChild(labelsAddWrap);

    var labelsColorPicker = document.createElement('div');
    labelsColorPicker.className = 'info-labels-color-picker';
    labelsColorPicker.hidden = true;
    labelsColorPicker.setAttribute('role', 'dialog');
    labelsColorPicker.setAttribute('aria-label', 'Modifier l\u2019\u00e9tiquette');

    labelsWrap.appendChild(labelsInline);
    labelsWrap.appendChild(labelsColorPicker);
    labelsWrap.appendChild(labelsStatus);
    labelsWrap.appendChild(labelsSuggestSection);
    labelsRow.value.appendChild(labelsWrap);
    body.appendChild(labelsRow.row);

    // ── Type de tâche (multi-label catalog) ─────────────────────────────
    var taskTypesRow = makeRow('task-types', 'Type de t\u00e2che', {
      icon: 'ti-category',
    });
    var taskTypesWrap = document.createElement('div');
    taskTypesWrap.className = 'info-task-types-wrap';

    var taskTypesEl = document.createElement('div');
    taskTypesEl.className = 'info-task-types';
    taskTypesEl.setAttribute('aria-label', 'Types de t\u00e2che');

    var taskTypesAddWrap = document.createElement('div');
    taskTypesAddWrap.className = 'info-task-types-add-wrap';

    var taskTypesAddBtn = document.createElement('button');
    taskTypesAddBtn.type = 'button';
    taskTypesAddBtn.className = 'info-task-types-add-btn';
    taskTypesAddBtn.setAttribute('aria-label', 'Ajouter un type de t\u00e2che');
    taskTypesAddBtn.title = 'Ajouter un type de t\u00e2che';
    taskTypesAddBtn.setAttribute('aria-expanded', 'false');
    taskTypesAddBtn.setAttribute('aria-haspopup', 'listbox');
    taskTypesAddBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';

    var taskTypesPicker = document.createElement('div');
    taskTypesPicker.className = 'info-task-types-picker';
    taskTypesPicker.hidden = true;
    taskTypesPicker.setAttribute('role', 'listbox');
    taskTypesPicker.setAttribute('aria-label', 'Types de t\u00e2che disponibles');

    var taskTypesPickerList = document.createElement('div');
    taskTypesPickerList.className = 'info-task-types-picker-list';
    taskTypesPickerList.setAttribute('role', 'group');
    taskTypesPickerList.setAttribute('aria-label', 'Types disponibles');

    var taskTypesCreateWrap = document.createElement('div');
    taskTypesCreateWrap.className = 'info-task-types-create';
    taskTypesCreateWrap.hidden = !onCustomTaskTypesChange;

    var taskTypesCreateRow = document.createElement('div');
    taskTypesCreateRow.className = 'info-task-types-create-row';

    var taskTypesCreateIconWrap = document.createElement('div');
    taskTypesCreateIconWrap.className = 'info-task-types-create-icon-wrap';

    var taskTypesCreateIconKey = randomTaskTypeIconKey();
    var taskTypesIconPickerOpen = false;

    var taskTypesCreateIconBtn = document.createElement('button');
    taskTypesCreateIconBtn.type = 'button';
    taskTypesCreateIconBtn.className = 'info-task-types-create-icon-trigger';
    taskTypesCreateIconBtn.title = 'Choisir une ic\u00f4ne';
    taskTypesCreateIconBtn.setAttribute('aria-label', 'Choisir une ic\u00f4ne');
    taskTypesCreateIconBtn.setAttribute('aria-expanded', 'false');
    taskTypesCreateIconBtn.setAttribute('aria-haspopup', 'listbox');

    var taskTypesIconPicker = document.createElement('div');
    taskTypesIconPicker.className = 'info-task-types-icon-picker';
    taskTypesIconPicker.hidden = true;
    taskTypesIconPicker.setAttribute('role', 'listbox');
    taskTypesIconPicker.setAttribute('aria-label', 'Ic\u00f4nes disponibles');

    function syncTaskTypesCreateIconBtn() {
      taskTypesCreateIconBtn.innerHTML = taskTypeIconSvg(
        taskTypesCreateIconKey,
        'info-task-type-icon'
      );
      taskTypesCreateIconBtn.setAttribute(
        'aria-expanded',
        taskTypesIconPickerOpen ? 'true' : 'false'
      );
      taskTypesCreateIconWrap.classList.toggle(
        'is-open',
        taskTypesIconPickerOpen
      );
    }

    function setTaskTypesIconPickerOpen(open) {
      taskTypesIconPickerOpen = !!open;
      taskTypesIconPicker.hidden = !taskTypesIconPickerOpen;
      if (taskTypesIconPickerOpen) renderTaskTypesIconPicker();
      syncTaskTypesCreateIconBtn();
      onLayoutChange();
      if (taskTypesPickerOpen) {
        requestAnimationFrame(positionTaskTypesPicker);
      }
    }

    function setTaskTypesCreateIconKey(key, options) {
      options = options || {};
      taskTypesCreateIconKey = normalizeTaskTypeIconKey(key, taskTypesCreateIconKey);
      syncTaskTypesCreateIconBtn();
      if (taskTypesIconPickerOpen) renderTaskTypesIconPicker();
      if (options.close !== false) setTaskTypesIconPickerOpen(false);
    }

    function randomizeTaskTypesCreateIcon() {
      setTaskTypesCreateIconKey(randomTaskTypeIconKey(), { close: true });
    }

    function renderTaskTypesIconPicker() {
      taskTypesIconPicker.replaceChildren();
      getTaskTypeIconKeys().forEach(function (iconKey) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-task-types-icon-picker-option';
        btn.setAttribute('role', 'option');
        btn.dataset.iconKey = iconKey;
        btn.title = iconKey;
        btn.setAttribute('aria-label', 'Ic\u00f4ne\u00a0: ' + iconKey);
        btn.setAttribute(
          'aria-selected',
          iconKey === taskTypesCreateIconKey ? 'true' : 'false'
        );
        if (iconKey === taskTypesCreateIconKey) {
          btn.classList.add('is-selected');
        }
        btn.innerHTML = taskTypeIconSvg(iconKey);
        btn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          setTaskTypesCreateIconKey(iconKey);
        });
        taskTypesIconPicker.appendChild(btn);
      });
    }

    syncTaskTypesCreateIconBtn();

    var taskTypesCreateInput = document.createElement('input');
    taskTypesCreateInput.type = 'search';
    taskTypesCreateInput.className = 'tp-input info-task-types-create-input';
    taskTypesCreateInput.placeholder = 'Rechercher ou cr\u00e9er\u2026';
    taskTypesCreateInput.setAttribute(
      'aria-label',
      'Rechercher ou cr\u00e9er un type de t\u00e2che'
    );
    taskTypesCreateInput.setAttribute('autocomplete', 'off');
    taskTypesCreateInput.maxLength = MAX_TASK_TYPE_LABEL_LEN;

    var taskTypesCreateBtn = document.createElement('button');
    taskTypesCreateBtn.type = 'button';
    taskTypesCreateBtn.className = 'info-task-types-create-btn';
    taskTypesCreateBtn.textContent = 'Cr\u00e9er';
    taskTypesCreateBtn.title = 'Cr\u00e9er un type de t\u00e2che';
    taskTypesCreateBtn.disabled = true;

    taskTypesCreateIconWrap.appendChild(taskTypesCreateIconBtn);
    taskTypesCreateRow.appendChild(taskTypesCreateIconWrap);
    taskTypesCreateRow.appendChild(taskTypesCreateInput);
    taskTypesCreateRow.appendChild(taskTypesCreateBtn);
    taskTypesCreateWrap.appendChild(taskTypesCreateRow);
    taskTypesCreateWrap.appendChild(taskTypesIconPicker);

    taskTypesPicker.appendChild(taskTypesCreateWrap);
    taskTypesPicker.appendChild(taskTypesPickerList);

    var taskTypesStatus = document.createElement('span');
    taskTypesStatus.className = 'info-desc-status';
    taskTypesStatus.setAttribute('aria-live', 'polite');
    taskTypesStatus.hidden = true;

    taskTypesAddWrap.appendChild(taskTypesAddBtn);
    taskTypesAddWrap.appendChild(taskTypesPicker);

    var taskTypesSuggestSection = document.createElement('div');
    taskTypesSuggestSection.className = 'info-task-types-suggestions';
    taskTypesSuggestSection.hidden = true;
    taskTypesSuggestSection.innerHTML =
      '<div class="info-task-types-suggestions-list" role="list"></div>' +
      '<button type="button" class="info-task-types-suggestions-refresh" ' +
      'aria-label="Rafra\u00eechir les suggestions" title="Rafra\u00eechir">' +
      '<i class="ti ti-refresh" aria-hidden="true"></i></button>';
    var taskTypesSuggestRefreshBtn = taskTypesSuggestSection.querySelector(
      '.info-task-types-suggestions-refresh'
    );
    var taskTypesSuggestListEl = taskTypesSuggestSection.querySelector(
      '.info-task-types-suggestions-list'
    );

    var taskTypesInline = document.createElement('div');
    taskTypesInline.className = 'info-task-types-inline';
    taskTypesInline.appendChild(taskTypesEl);
    taskTypesInline.appendChild(taskTypesSuggestSection);
    taskTypesInline.appendChild(taskTypesAddWrap);

    taskTypesWrap.appendChild(taskTypesInline);
    taskTypesWrap.appendChild(taskTypesStatus);
    taskTypesRow.value.appendChild(taskTypesWrap);
    body.appendChild(taskTypesRow.row);

    // ── Parent tasks (via Progrès linkedCardId reverse lookup) ──────────
    var parentRow = makeRow('parent', 'T\u00e2ches parentes', {
      icon: 'ti-hierarchy-3',
    });
    var parentWrap = document.createElement('div');
    parentWrap.className = 'info-parent-wrap';

    var parentInline = document.createElement('div');
    parentInline.className = 'info-parent-inline';

    var parentChipsEl = document.createElement('div');
    parentChipsEl.className = 'info-parent-chips';

    var parentPickWrap = document.createElement('div');
    parentPickWrap.className = 'info-parent-pick-wrap';

    var parentPickBtn = document.createElement('button');
    parentPickBtn.type = 'button';
    parentPickBtn.className = 'info-parent-pick-btn';
    parentPickBtn.setAttribute('aria-label', 'Ajouter une t\u00e2che parente');
    parentPickBtn.title = 'Ajouter une t\u00e2che parente';
    parentPickBtn.setAttribute('aria-expanded', 'false');
    parentPickBtn.setAttribute('aria-haspopup', 'listbox');
    parentPickBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';

    var parentPicker = document.createElement('div');
    parentPicker.className = 'info-parent-picker';
    parentPicker.hidden = true;
    parentPicker.setAttribute('role', 'listbox');
    parentPicker.setAttribute('aria-label', 'Choisir une t\u00e2che parente');

    var parentSearchInput = document.createElement('input');
    parentSearchInput.type = 'search';
    parentSearchInput.className = 'tp-input info-parent-search';
    parentSearchInput.placeholder = 'Rechercher une carte\u2026';
    parentSearchInput.setAttribute('aria-label', 'Rechercher une carte');

    var parentStatus = document.createElement('p');
    parentStatus.className = 'info-parent-status';
    parentStatus.setAttribute('aria-live', 'polite');
    parentStatus.hidden = true;

    var parentListEl = document.createElement('div');
    parentListEl.className = 'info-parent-list';
    parentListEl.setAttribute('role', 'list');

    parentPicker.appendChild(parentSearchInput);
    parentPicker.appendChild(parentStatus);
    parentPicker.appendChild(parentListEl);
    parentPickWrap.appendChild(parentPickBtn);
    parentPickWrap.appendChild(parentPicker);

    parentInline.appendChild(parentChipsEl);
    parentInline.appendChild(parentPickWrap);
    parentWrap.appendChild(parentInline);
    parentRow.value.appendChild(parentWrap);
    body.appendChild(parentRow.row);

    // ── Objectif (project / mission link) ───────────────────────────────
    var objectifRow = makeRow('objectif', 'Objectif', { icon: 'ti-hierarchy-2' });
    var objectifMount = document.createElement('div');
    objectifMount.className = 'info-objectif-mount objectif-section-body';
    objectifMount.id = 'info-objectif-mount';
    objectifRow.row.classList.add('variant-objectif-section');
    objectifRow.row.hidden = true;
    objectifRow.value.appendChild(objectifMount);
    body.appendChild(objectifRow.row);

    // ── Portée / Durée (experimental mirrors of Priorité) ─────────────
    var porteRow = makeRow('porte', 'Port\u00e9e', {
      interactive: true,
      icon: 'ti-world'
    });
    var porteValueEl = document.createElement('span');
    porteValueEl.className = 'info-recap-text';
    // Shown only when experimental.impactGlobe is enabled (applyFeaturesToCard).
    porteRow.row.hidden = true;
    porteRow.value.appendChild(porteValueEl);
    body.appendChild(porteRow.row);

    // Legacy Durée (Facilité) — permanently hidden; estimates live in Progrès.
    var dureeRow = makeRow('duree', 'Dur\u00e9e', {
      interactive: true,
      icon: 'ti-hourglass'
    });
    var dureeValueEl = document.createElement('span');
    dureeValueEl.className = 'info-recap-text';
    dureeRow.row.hidden = true;
    dureeRow.value.appendChild(dureeValueEl);
    body.appendChild(dureeRow.row);

    var progresRow = makeRow('progress', 'Progr\u00e8s', {
      interactive: true,
      icon: 'ti-percentage'
    });
    var progresValueEl = document.createElement('span');
    progresValueEl.className = 'info-recap-text';
    progresRow.value.appendChild(progresValueEl);
    body.appendChild(progresRow.row);

    field.appendChild(body);
    el.appendChild(field);

    function setAuthHint(reason) {
      authReason = reason || '';
      var show = !!authReason;
      authBox.hidden = !show;
      if (!show) {
        authHint.textContent = '';
        return;
      }
      if (authReason === 'no-app-key') {
        authHint.textContent =
          'Enregistrement du titre, de la description et des \u00e9tiquettes indisponible (cl\u00e9 d\u2019app manquante).';
        authBtn.hidden = true;
      } else {
        authHint.textContent =
          'Autorisez Trello pour enregistrer le titre, la description et les \u00e9tiquettes sur la carte.';
        authBtn.hidden = !onAuthorize;
      }
    }

    function applyInfoSaveStatus(el, text, kind) {
      var saving = kind === 'saving' || text === 'Enregistrement\u2026';
      var saved = kind === 'ok';
      var errored = kind === 'error';
      el.classList.toggle('is-saving', !!saving);
      el.classList.toggle('is-ok', !!saved && !saving);
      el.classList.toggle('is-error', !!errored && !saving && !saved);
      if (saving) {
        el.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
        el.setAttribute('aria-label', 'Enregistrement');
        el.title = 'Enregistrement\u2026';
        return;
      }
      if (saved) {
        el.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
        el.setAttribute('aria-label', 'Enregistr\u00e9');
        el.title = 'Enregistr\u00e9';
        return;
      }
      el.removeAttribute('title');
      el.removeAttribute('aria-label');
      el.textContent = text || '';
    }

    function setTitleStatus(text, kind) {
      applyInfoSaveStatus(titleStatus, text, kind);
    }

    function setDescStatus(text, kind) {
      applyInfoSaveStatus(descStatus, text, kind);
    }

    function syncDescInputSize() {
      var empty = !(descInput.value || '').trim();
      syncExpandableSurfaceHeight(descInput, {
        maxHeight: INFO_DESC_MAX_HEIGHT_PX,
        minHeight: empty ? INFO_DESC_EMPTY_MIN_HEIGHT_PX : INFO_DESC_MIN_HEIGHT_PX
      });
    }

    function syncDescRichSize() {
      var empty = !markdownFromRichRoot(descRich);
      descRich.classList.toggle('is-empty', empty);
      syncExpandableSurfaceHeight(descRich, {
        maxHeight: INFO_DESC_MAX_HEIGHT_PX,
        minHeight: empty ? INFO_DESC_EMPTY_MIN_HEIGHT_PX : INFO_DESC_MIN_HEIGHT_PX
      });
    }

    function renderDescRich() {
      descRich.innerHTML = renderMarkdownToHtml(descInput.value);
      descRich.querySelectorAll('input[type="checkbox"]').forEach(function (checkbox) {
        checkbox.disabled = false;
        checkbox.setAttribute('contenteditable', 'false');
      });
      syncDescRichSize();
    }

    function syncDescSourceFromRich() {
      if (descMode !== 'rich') return descInput.value;
      var next = markdownFromRichRoot(descRich);
      if (next !== descInput.value) descInput.value = next;
      return next;
    }

    function closeDescFormatMenu() {
      descFormatMenu.hidden = true;
      descFormatWrap.classList.remove('is-open');
      descFormatBtn.setAttribute('aria-expanded', 'false');
    }

    function openDescFormatMenu() {
      descFormatMenu.hidden = false;
      descFormatWrap.classList.add('is-open');
      descFormatBtn.setAttribute('aria-expanded', 'true');
      syncDescFormatMenuSelection();
    }

    function syncDescFormatMenuSelection() {
      var kind = 'normal';
      if (descMode === 'rich') {
        try {
          var block = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
          if (/^h[1-6]$/.test(block)) kind = block;
          else if (document.queryCommandState('insertOrderedList')) kind = 'ol';
          else if (document.queryCommandState('insertUnorderedList')) kind = 'ul';
        } catch (e) {
          kind = 'normal';
        }
      } else {
        var lineStart =
          descInput.value.lastIndexOf('\n', Math.max(0, descInput.selectionStart) - 1) + 1;
        var lineEnd = descInput.value.indexOf('\n', descInput.selectionStart);
        if (lineEnd === -1) lineEnd = descInput.value.length;
        kind = detectMarkdownLineFormat(descInput.value.slice(lineStart, lineEnd));
      }
      if (!DESC_FORMAT_LABELS[kind]) kind = 'normal';
      descFormatBtnLabel.textContent = DESC_FORMAT_LABELS[kind] || 'Texte normal';
      var options = descFormatMenu.querySelectorAll('[data-md-kind]');
      for (var i = 0; i < options.length; i += 1) {
        var opt = options[i];
        var selected = opt.getAttribute('data-md-kind') === kind;
        opt.classList.toggle('is-selected', selected);
        opt.setAttribute('aria-selected', selected ? 'true' : 'false');
      }
    }

    function getDescEditState() {
      return {
        value: descInput.value,
        start: descInput.selectionStart,
        end: descInput.selectionEnd
      };
    }

    function applyDescMarkdownInline(open, close) {
      applyMarkdownEditToTextarea(
        descInput,
        wrapMarkdownInlineSelection(getDescEditState(), open, close)
      );
      syncDescFormatMenuSelection();
      try {
        descInput.focus();
      } catch (e) {
        /* ignore */
      }
    }

    function applyDescMarkdownBlock(kind) {
      applyMarkdownEditToTextarea(
        descInput,
        applyMarkdownBlockFormat(getDescEditState(), kind)
      );
      syncDescFormatMenuSelection();
      try {
        descInput.focus();
      } catch (e) {
        /* ignore */
      }
    }

    function execDescRichCommand(command, value) {
      try {
        descRich.focus();
        document.execCommand(command, false, value == null ? null : value);
      } catch (e) {
        /* unsupported browser command */
      }
      syncDescSourceFromRich();
      scheduleDescSave();
      syncDescRichSize();
      syncDescFormatMenuSelection();
      onLayoutChange();
    }

    function getDescRichSelection() {
      try {
        var sel = window.getSelection && window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        var anchor = sel.anchorNode;
        if (!anchor || !descRich.contains(anchor)) return null;
        return sel;
      } catch (e) {
        return null;
      }
    }

    function decorateDescRichLink(anchor, url) {
      if (!anchor) return;
      try {
        anchor.setAttribute('href', url);
        anchor.className = 'info-md-link';
        if (/^mailto:/i.test(url)) {
          anchor.removeAttribute('target');
          anchor.removeAttribute('rel');
        } else {
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
        }
      } catch (e) {
        /* ignore */
      }
    }

    function findDescRichLinkFromSelection(sel) {
      if (!sel || !sel.anchorNode) return null;
      var node = sel.anchorNode;
      if (node.nodeType === 3) node = node.parentNode;
      while (node && node !== descRich) {
        if (richNodeName(node) === 'A') return node;
        node = node.parentNode;
      }
      return null;
    }

    /** Apply url to the current rich selection, or insert a linked URL if collapsed. */
    function applyDescRichLink(url) {
      var href = normalizePasteableMarkdownUrl(url) || safeMarkdownHref(url);
      if (!href) return false;
      try {
        descRich.focus();
      } catch (e) {
        /* ignore */
      }
      var sel = getDescRichSelection();
      if (sel && !sel.isCollapsed) {
        try {
          document.execCommand('createLink', false, href);
        } catch (err) {
          return false;
        }
        decorateDescRichLink(findDescRichLinkFromSelection(getDescRichSelection()), href);
      } else {
        var html = renderMarkdownLinkHtml(escapeHtml(href), href);
        if (!html) return false;
        try {
          document.execCommand('insertHTML', false, html);
        } catch (err2) {
          try {
            document.execCommand('insertText', false, href);
          } catch (err3) {
            return false;
          }
        }
      }
      syncDescSourceFromRich();
      scheduleDescSave();
      syncDescRichSize();
      syncDescFormatMenuSelection();
      onLayoutChange();
      return true;
    }

    function applyDescMarkdownLink(url) {
      var href = normalizePasteableMarkdownUrl(url) || safeMarkdownHref(url);
      if (!href) return false;
      var state = getDescEditState();
      var linked = linkMarkdownSelection(state, href);
      if (linked) {
        applyMarkdownEditToTextarea(descInput, linked);
      } else {
        var insertion = '[' + href + '](' + href + ')';
        applyMarkdownEditToTextarea(descInput, {
          value: state.value.slice(0, state.start) + insertion + state.value.slice(state.end),
          start: state.start + 1,
          end: state.start + 1 + href.length
        });
      }
      syncDescFormatMenuSelection();
      try {
        descInput.focus();
      } catch (e) {
        /* ignore */
      }
      return true;
    }

    function promptDescLinkUrl() {
      var existing = '';
      if (descMode === 'rich') {
        var sel = getDescRichSelection();
        var anchor = findDescRichLinkFromSelection(sel);
        if (anchor) existing = richAttr(anchor, 'href') || '';
      }
      var next = window.prompt('URL du lien', existing || 'https://');
      if (next == null) return;
      var href = normalizePasteableMarkdownUrl(next) || safeMarkdownHref(String(next).trim());
      if (!href) return;
      if (descMode === 'rich') applyDescRichLink(href);
      else applyDescMarkdownLink(href);
    }

    function applyDescRichBlock(kind) {
      if (kind === 'ul') {
        execDescRichCommand('insertUnorderedList');
        return;
      }
      if (kind === 'ol') {
        execDescRichCommand('insertOrderedList');
        return;
      }
      if (kind === 'checklist') {
        execDescRichCommand('insertUnorderedList');
        var selection = global.getSelection && global.getSelection();
        var node = selection && selection.anchorNode;
        var li = node && (node.nodeType === 1 ? node : node.parentNode);
        while (li && li !== descRich && richNodeName(li) !== 'LI') li = li.parentNode;
        if (li && li !== descRich && !li.querySelector('input[type="checkbox"]')) {
          var checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.setAttribute('contenteditable', 'false');
          li.insertBefore(checkbox, li.firstChild);
          li.insertBefore(document.createTextNode(' '), checkbox.nextSibling);
          li.classList.add('info-md-li--check');
        }
        syncDescSourceFromRich();
        scheduleDescSave();
        return;
      }
      execDescRichCommand('formatBlock', kind === 'normal' ? 'p' : kind);
    }

    function focusDescEditor(moveToEnd) {
      var target = descMode === 'rich' ? descRich : descInput;
      try {
        target.focus();
        if (moveToEnd && descMode === 'markdown') {
          var len = descInput.value.length;
          descInput.setSelectionRange(len, len);
        }
      } catch (e) {
        /* ignore */
      }
    }

    function setDescMode(mode, options) {
      options = options || {};
      var next = mode === 'markdown' ? 'markdown' : 'rich';
      if (descMode === 'rich' && next === 'markdown') syncDescSourceFromRich();
      descMode = next;
      if (descMode === 'rich') renderDescRich();
      descRich.hidden = descMode !== 'rich';
      descInput.hidden = descMode !== 'markdown';
      descRichModeBtn.classList.toggle('is-active', descMode === 'rich');
      descMarkdownModeBtn.classList.toggle('is-active', descMode === 'markdown');
      descRichModeBtn.setAttribute('aria-checked', descMode === 'rich' ? 'true' : 'false');
      descMarkdownModeBtn.setAttribute(
        'aria-checked',
        descMode === 'markdown' ? 'true' : 'false'
      );
      syncDescFormatMenuSelection();
      if (descMode === 'markdown') syncDescInputSize();
      else syncDescRichSize();
      if (options.focus !== false) focusDescEditor(false);
      onLayoutChange();
    }

    function syncTitleInputSize() {
      titleInput.style.overflowY = 'hidden';
      titleInput.style.height = 'auto';
      titleInput.style.height = titleInput.scrollHeight + 'px';
    }

    function memberDisplayName(member) {
      if (!member || typeof member !== 'object') return '';
      if (typeof member.fullName === 'string' && member.fullName.trim()) {
        return member.fullName.trim();
      }
      if (typeof member.username === 'string' && member.username.trim()) {
        return member.username.trim();
      }
      return '';
    }

    function memberInitials(member) {
      if (!member || typeof member !== 'object') return '?';
      if (typeof member.initials === 'string' && member.initials.trim()) {
        return member.initials.trim().slice(0, 3).toUpperCase();
      }
      var name = memberDisplayName(member);
      if (!name) return '?';
      var parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }

    function memberAvatarUrl(member) {
      if (!member || typeof member !== 'object') return '';
      // Power-Up client: ready-to-use 50px URL (t.member / card members).
      if (typeof member.avatar === 'string' && member.avatar.trim()) {
        return member.avatar.trim();
      }
      // REST API: avatarUrl is a prefix; append size unless already a .png.
      if (typeof member.avatarUrl === 'string' && member.avatarUrl.trim()) {
        var base = member.avatarUrl.trim().replace(/\/$/, '');
        if (/\.png($|\?)/i.test(base)) return base;
        return base + '/50.png';
      }
      if (
        member.id &&
        typeof member.avatarHash === 'string' &&
        member.avatarHash.trim()
      ) {
        return (
          'https://trello-members.s3.amazonaws.com/' +
          encodeURIComponent(String(member.id)) +
          '/' +
          encodeURIComponent(member.avatarHash.trim()) +
          '/50.png'
        );
      }
      return '';
    }

    function enrichMemberAvatar(member) {
      if (!member || typeof member !== 'object') return member;
      if (memberAvatarUrl(member)) return member;
      if (!member.id || !boardMembers.length) return member;
      var id = String(member.id);
      for (var i = 0; i < boardMembers.length; i++) {
        var boardMember = boardMembers[i];
        if (!boardMember || String(boardMember.id) !== id) continue;
        if (!memberAvatarUrl(boardMember)) return member;
        return {
          id: member.id,
          fullName: member.fullName || boardMember.fullName || '',
          username: member.username || boardMember.username || '',
          initials: member.initials || boardMember.initials || '',
          avatar:
            typeof boardMember.avatar === 'string' ? boardMember.avatar : '',
          avatarUrl:
            typeof boardMember.avatarUrl === 'string'
              ? boardMember.avatarUrl
              : '',
          avatarHash:
            typeof boardMember.avatarHash === 'string'
              ? boardMember.avatarHash
              : ''
        };
      }
      return member;
    }

    function appendMemberAvatar(chip, member) {
      var resolved = enrichMemberAvatar(member);
      var avatarUrl = memberAvatarUrl(resolved);
      if (avatarUrl) {
        var img = document.createElement('img');
        img.className = 'info-member-avatar';
        img.src = avatarUrl;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.width = 28;
        img.height = 28;
        img.loading = 'lazy';
        img.addEventListener('error', function () {
          img.remove();
          var fallback = document.createElement('span');
          fallback.className = 'info-member-initials';
          fallback.textContent = memberInitials(resolved);
          chip.insertBefore(fallback, chip.firstChild);
        });
        chip.appendChild(img);
        return;
      }
      var initials = document.createElement('span');
      initials.className = 'info-member-initials';
      initials.textContent = memberInitials(resolved);
      chip.appendChild(initials);
    }

    function creatorDiffersFromAssignees() {
      if (!creatorMember || !creatorMember.id) return false;
      if (
        members.length === 1 &&
        members[0] &&
        members[0].id &&
        String(members[0].id) === String(creatorMember.id)
      ) {
        return false;
      }
      return true;
    }

    function renderCreator() {
      creatorEl.replaceChildren();
      var show = creatorDiffersFromAssignees();
      creatorRow.row.hidden = !show;
      if (!show) return;

      var name = memberDisplayName(creatorMember) || 'Membre';
      var chip = document.createElement('span');
      chip.className = 'info-member';
      chip.title = name;
      chip.setAttribute('aria-label', name);
      appendMemberAvatar(chip, creatorMember);
      var nameEl = document.createElement('span');
      nameEl.className = 'info-member-name';
      nameEl.textContent = name;
      chip.appendChild(nameEl);
      creatorEl.appendChild(chip);
    }

    function setMembersStatus(text, kind) {
      applyInfoSaveStatus(membersStatus, text, kind);
    }

    function selectedMemberIds() {
      var ids = Object.create(null);
      for (var i = 0; i < members.length; i++) {
        if (members[i] && members[i].id) ids[String(members[i].id)] = true;
      }
      return ids;
    }

    function availableBoardMembers() {
      var selected = selectedMemberIds();
      var out = [];
      for (var i = 0; i < boardMembers.length; i++) {
        var member = boardMembers[i];
        if (!member || !member.id) continue;
        if (selected[String(member.id)]) continue;
        out.push(member);
      }
      return out;
    }

    function setMembersPickerOpen(open) {
      membersPickerOpen = !!open;
      membersPicker.hidden = !membersPickerOpen;
      membersAddBtn.setAttribute(
        'aria-expanded',
        membersPickerOpen ? 'true' : 'false'
      );
      membersAddWrap.classList.toggle('is-open', membersPickerOpen);
      if (membersPickerOpen) renderMembersPicker();
      onLayoutChange();
    }

    function renderMembersPicker() {
      membersPicker.replaceChildren();
      var available = availableBoardMembers();
      if (!available.length) {
        var empty = document.createElement('div');
        empty.className = 'info-members-picker-empty';
        empty.textContent = boardMembers.length
          ? 'Tous les membres sont d\u00e9j\u00e0 assign\u00e9s'
          : 'Aucun membre sur ce tableau';
        membersPicker.appendChild(empty);
        return;
      }
      available.forEach(function (member) {
        var name = memberDisplayName(member) || 'Membre';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-members-picker-option';
        btn.setAttribute('role', 'option');
        btn.title = name;
        btn.disabled = membersBusy;
        btn.dataset.memberId = String(member.id);

        appendMemberAvatar(btn, member);

        var text = document.createElement('span');
        text.className = 'info-members-picker-option-text';
        text.textContent = name;

        btn.appendChild(text);
        btn.addEventListener('click', function () {
          addMemberFromPicker(member);
        });
        membersPicker.appendChild(btn);
      });
    }

    function renderMembers() {
      membersEl.replaceChildren();

      if (members.length) {
        members.forEach(function (member) {
          var name = memberDisplayName(member) || 'Membre';
          var chip = document.createElement('span');
          chip.className = 'info-member';
          chip.title = name;
          chip.setAttribute('aria-label', name);

          appendMemberAvatar(chip, member);

          var nameEl = document.createElement('span');
          nameEl.className = 'info-member-name';
          nameEl.textContent = name;
          chip.appendChild(nameEl);

          if (onMemberRemove) {
            var clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'info-member-clear';
            clearBtn.setAttribute(
              'aria-label',
              'Retirer\u00a0: ' + name
            );
            clearBtn.textContent = '\u00d7';
            clearBtn.disabled = membersBusy;
            clearBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              removeMemberFromCard(member);
            });
            chip.appendChild(clearBtn);
          }

          membersEl.appendChild(chip);
        });
      }

      var canAdd = !!onMemberAdd;
      membersAddBtn.hidden = !onMemberAdd;
      membersAddBtn.disabled = membersBusy || !canAdd;
      if (membersPickerOpen) renderMembersPicker();
      renderCreator();
    }

    function addMemberFromPicker(member) {
      if (!onMemberAdd || membersBusy || !member || !member.id) return;
      var id = String(member.id);
      if (selectedMemberIds()[id]) return;
      membersBusy = true;
      setMembersStatus('', 'saving');
      renderMembers();
      Promise.resolve(onMemberAdd(member))
        .then(function (result) {
          membersBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setMembersStatus('', 'error');
            } else {
              setMembersStatus('\u00c9chec de l\u2019ajout', 'error');
            }
            renderMembers();
            onLayoutChange();
            return result;
          }
          if (!selectedMemberIds()[id]) {
            members = members.concat([
              {
                id: member.id,
                fullName:
                  typeof member.fullName === 'string' ? member.fullName : '',
                username:
                  typeof member.username === 'string' ? member.username : '',
                initials:
                  typeof member.initials === 'string' ? member.initials : '',
                avatar:
                  typeof member.avatar === 'string' ? member.avatar : '',
                avatarUrl:
                  typeof member.avatarUrl === 'string' ? member.avatarUrl : '',
                avatarHash:
                  typeof member.avatarHash === 'string' ? member.avatarHash : ''
              }
            ]);
          }
          setAuthHint('');
          setMembersStatus('', 'ok');
          setMembersPickerOpen(false);
          renderMembers();
          setTimeout(function () {
            if (membersStatus.classList.contains('is-ok')) {
              setMembersStatus('');
            }
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          membersBusy = false;
          console.error('Info member add failed', err);
          setMembersStatus('\u00c9chec de l\u2019ajout', 'error');
          renderMembers();
          onLayoutChange();
        });
    }

    function removeMemberFromCard(member) {
      if (!onMemberRemove || membersBusy || !member || !member.id) return;
      var id = String(member.id);
      membersBusy = true;
      setMembersStatus('', 'saving');
      renderMembers();
      Promise.resolve(onMemberRemove(member))
        .then(function (result) {
          membersBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setMembersStatus('', 'error');
            } else {
              setMembersStatus('\u00c9chec du retrait', 'error');
            }
            renderMembers();
            onLayoutChange();
            return result;
          }
          members = members.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          setAuthHint('');
          setMembersStatus('', 'ok');
          renderMembers();
          setTimeout(function () {
            if (membersStatus.classList.contains('is-ok')) {
              setMembersStatus('');
            }
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          membersBusy = false;
          console.error('Info member remove failed', err);
          setMembersStatus('\u00c9chec du retrait', 'error');
          renderMembers();
          onLayoutChange();
        });
    }

    var LABEL_COLOR_HEX = {
      green: '#61BD4F',
      yellow: '#F2D600',
      orange: '#FF9F1A',
      red: '#EB5A46',
      purple: '#C377E0',
      blue: '#0079BF',
      sky: '#00C2E0',
      lime: '#51E898',
      pink: '#FF78CB',
      black: '#344563'
    };
    var LABEL_COLOR_KEYS = Object.keys(LABEL_COLOR_HEX);
    var LABEL_COLOR_NAMES_FR = {
      green: 'Vert',
      yellow: 'Jaune',
      orange: 'Orange',
      red: 'Rouge',
      purple: 'Violet',
      blue: 'Bleu',
      sky: 'Ciel',
      lime: 'Citron',
      pink: 'Rose',
      black: 'Noir'
    };
    var LABEL_COLOR_FALLBACK = '#B3BAC5';

    function labelBaseColor(color) {
      if (!color || typeof color !== 'string') return '';
      return color.replace(/_(light|dark)$/i, '').toLowerCase();
    }

    function labelColorHex(color) {
      var base = labelBaseColor(color);
      if (base && Object.prototype.hasOwnProperty.call(LABEL_COLOR_HEX, base)) {
        return LABEL_COLOR_HEX[base];
      }
      return LABEL_COLOR_FALLBACK;
    }

    function labelDisplayName(label) {
      if (!label || typeof label !== 'object') return '\u00c9tiquette';
      if (typeof label.name === 'string' && label.name.trim()) {
        return label.name.trim();
      }
      var base = labelBaseColor(label.color);
      if (base && Object.prototype.hasOwnProperty.call(LABEL_COLOR_NAMES_FR, base)) {
        return LABEL_COLOR_NAMES_FR[base];
      }
      return 'Sans nom';
    }

    function findLabelById(list, id) {
      var needle = id != null ? String(id) : '';
      if (!needle) return null;
      var arr = Array.isArray(list) ? list : [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && String(arr[i].id) === needle) return arr[i];
      }
      return null;
    }

    function applyLabelColorLocally(labelId, color) {
      var id = labelId != null ? String(labelId) : '';
      if (!id) return;
      labels = labels.map(function (item) {
        if (!item || String(item.id) !== id) return item;
        return Object.assign({}, item, { color: color });
      });
      boardLabels = boardLabels.map(function (item) {
        if (!item || String(item.id) !== id) return item;
        return Object.assign({}, item, { color: color });
      });
    }

    function applyLabelNameLocally(labelId, name) {
      var id = labelId != null ? String(labelId) : '';
      if (!id) return;
      var nextName = typeof name === 'string' ? name : '';
      labels = labels.map(function (item) {
        if (!item || String(item.id) !== id) return item;
        return Object.assign({}, item, { name: nextName });
      });
      boardLabels = boardLabels.map(function (item) {
        if (!item || String(item.id) !== id) return item;
        return Object.assign({}, item, { name: nextName });
      });
    }

    function cancelLabelRename(options) {
      options = options || {};
      if (!labelsRenameId) return;
      labelsRenameId = '';
      labelsRenameDraft = '';
      if (options.render !== false) {
        renderLabels();
        onLayoutChange();
      }
    }

    function beginLabelRenameDraft(label) {
      if (!onLabelRename || !label || !label.id) return;
      var id = String(label.id);
      labelsRenameId = id;
      labelsRenameDraft =
        typeof label.name === 'string' ? label.name : '';
    }

    function flushLabelRenameIfNeeded(labelId) {
      var id = labelId != null ? String(labelId) : '';
      if (!id || !labelsRenameId || labelsRenameId !== id) return;
      var renamingLabel =
        findLabelById(labels, id) || findLabelById(boardLabels, id);
      if (!renamingLabel) {
        cancelLabelRename({ render: false });
        return;
      }
      var previousName =
        typeof renamingLabel.name === 'string' ? renamingLabel.name : '';
      var draft =
        typeof labelsRenameDraft === 'string' ? labelsRenameDraft.trim() : '';
      if (draft === previousName) {
        cancelLabelRename({ render: false });
        return;
      }
      commitLabelRename(renamingLabel, labelsRenameDraft);
    }

    function spellcheckLabelName(text) {
      var trimmed = typeof text === 'string' ? text.trim() : '';
      if (
        !trimmed ||
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        return Promise.resolve(trimmed);
      }
      return global.Spellcheck.correct(trimmed).then(
        function (corrected) {
          return typeof corrected === 'string' ? corrected.trim() : trimmed;
        },
        function () {
          return trimmed;
        }
      );
    }

    function commitLabelRename(label, rawName) {
      if (!onLabelRename || labelsBusy || !label || !label.id) return;
      var id = String(label.id);
      var previousName = typeof label.name === 'string' ? label.name : '';
      var typed =
        typeof rawName === 'string' ? rawName : labelsRenameDraft || '';
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      renderLabels();
      spellcheckLabelName(typed)
        .then(function (nextName) {
          if (nextName === previousName) {
            labelsBusy = false;
            cancelLabelRename();
            setLabelsStatus('');
            return { ok: true, changed: false, name: nextName };
          }
          applyLabelNameLocally(id, nextName);
          labelsRenameDraft = nextName;
          renderLabels();
          return Promise.resolve(
            onLabelRename({
              id: id,
              name: nextName,
              label: label
            })
          ).then(function (result) {
            return { result: result, nextName: nextName };
          });
        })
        .then(function (payload) {
          if (!payload || payload.ok === true) {
            // Unchanged early exit.
            return payload;
          }
          var result = payload.result;
          var nextName = payload.nextName;
          labelsBusy = false;
          if (result && result.ok === false) {
            applyLabelNameLocally(id, previousName);
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else if (result.reason === 'name-too-long') {
              setLabelsStatus('Nom trop long', 'error');
            } else {
              setLabelsStatus('\u00c9chec du renommage', 'error');
            }
            labelsRenameId = id;
            labelsRenameDraft = previousName;
            renderLabels();
            onLayoutChange();
            return result;
          }
          var savedName =
            result && result.label && typeof result.label.name === 'string'
              ? result.label.name
              : result && typeof result.name === 'string'
                ? result.name
                : nextName;
          applyLabelNameLocally(id, savedName);
          setAuthHint('');
          setLabelsStatus('', 'ok');
          cancelLabelRename({ render: false });
          renderLabels();
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          applyLabelNameLocally(id, previousName);
          console.error('Info label rename failed', err);
          setLabelsStatus('\u00c9chec du renommage', 'error');
          labelsRenameId = id;
          labelsRenameDraft = previousName;
          renderLabels();
          onLayoutChange();
        });
    }

    function setLabelsColorPickerOpen(labelId, options) {
      options = options || {};
      var nextId = labelId != null ? String(labelId) : '';
      if (!nextId || nextId === labelsColorEditId) {
        var closingId = labelsColorEditId;
        labelsColorEditId = '';
        labelsColorPicker.hidden = true;
        labelsColorPicker.replaceChildren();
        if (closingId) {
          if (options.discardRename) {
            cancelLabelRename({ render: false });
          } else {
            flushLabelRenameIfNeeded(closingId);
          }
        }
        renderLabels();
        onLayoutChange();
        return;
      }
      if (labelsRenameId && labelsRenameId !== nextId) {
        flushLabelRenameIfNeeded(labelsRenameId);
      }
      if (labelsPickerOpen) setLabelsPickerOpen(false);
      labelsColorEditId = nextId;
      var label =
        findLabelById(labels, nextId) || findLabelById(boardLabels, nextId);
      if (label) beginLabelRenameDraft(label);
      renderLabelsColorPicker();
      renderLabels();
      onLayoutChange();
    }

    function renderLabelsColorPicker() {
      labelsColorPicker.replaceChildren();
      var canEditLabel =
        !!labelsColorEditId &&
        !!(onLabelColorChange || onLabelRename || onLabelDelete);
      if (!canEditLabel) {
        labelsColorPicker.hidden = true;
        return;
      }
      var label =
        findLabelById(labels, labelsColorEditId) ||
        findLabelById(boardLabels, labelsColorEditId);
      if (!label) {
        labelsColorEditId = '';
        labelsColorPicker.hidden = true;
        return;
      }
      var current = labelBaseColor(label.color);
      var head = document.createElement('div');
      head.className = 'info-labels-color-picker-head';

      var title = document.createElement('div');
      title.className = 'info-labels-color-picker-title';
      title.textContent = 'Modifier l\u2019\u00e9tiquette';

      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'info-labels-color-picker-close';
      closeBtn.setAttribute('aria-label', 'Fermer');
      closeBtn.title = 'Fermer';
      closeBtn.textContent = '\u00d7';
      closeBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        setLabelsColorPickerOpen('');
      });

      head.appendChild(title);
      head.appendChild(closeBtn);
      labelsColorPicker.appendChild(head);

      if (onLabelRename) {
        var renameField = document.createElement('div');
        renameField.className = 'info-labels-color-picker-rename';

        var renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.className = 'info-labels-color-picker-name-input';
        renameInput.dataset.labelId = String(label.id);
        renameInput.value =
          labelsRenameId === String(label.id)
            ? labelsRenameDraft
            : typeof label.name === 'string'
              ? label.name
              : '';
        renameInput.maxLength = 16384;
        renameInput.setAttribute('aria-label', 'Nom de l\u2019\u00e9tiquette');
        renameInput.placeholder = 'Nom de l\u2019\u00e9tiquette';
        renameInput.disabled = labelsBusy;
        renameInput.addEventListener('click', function (event) {
          event.stopPropagation();
        });
        renameInput.addEventListener('input', function () {
          labelsRenameId = String(label.id);
          labelsRenameDraft = renameInput.value;
        });
        renameInput.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            commitLabelRename(label, renameInput.value);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setLabelsColorPickerOpen('', { discardRename: true });
          }
        });
        renameField.appendChild(renameInput);
        labelsColorPicker.appendChild(renameField);
      }

      if (onLabelColorChange) {
        var grid = document.createElement('div');
        grid.className = 'info-labels-color-picker-grid';
        grid.setAttribute('role', 'listbox');
        grid.setAttribute('aria-label', 'Couleur de l\u2019\u00e9tiquette');
        LABEL_COLOR_KEYS.forEach(function (key) {
          var hex = LABEL_COLOR_HEX[key];
          var fr = LABEL_COLOR_NAMES_FR[key] || key;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-labels-color-swatch';
          if (current === key) btn.classList.add('is-selected');
          btn.style.setProperty('--label-color', hex);
          btn.setAttribute('role', 'option');
          btn.setAttribute('aria-label', fr);
          btn.title = fr;
          btn.disabled = labelsBusy;
          btn.dataset.color = key;
          if (current === key) {
            btn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>';
          }
          btn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            changeLabelColor(label, key);
          });
          grid.appendChild(btn);
        });
        labelsColorPicker.appendChild(grid);
      }

      if (onLabelDelete) {
        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'info-labels-color-picker-delete';
        deleteBtn.setAttribute(
          'aria-label',
          'Supprimer l\u2019\u00e9tiquette du tableau\u00a0: ' +
            labelDisplayName(label)
        );
        deleteBtn.title = 'Supprimer du tableau';
        deleteBtn.disabled = labelsBusy;
        deleteBtn.innerHTML =
          '<i class="ti ti-trash" aria-hidden="true"></i>' +
          '<span>Supprimer du tableau</span>';
        deleteBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          deleteLabelFromBoard(label);
        });
        labelsColorPicker.appendChild(deleteBtn);
      }

      labelsColorPicker.hidden = false;
    }

    function labelNeedsDarkText(hex) {
      var raw = (hex || '').replace(/^#/, '');
      if (raw.length !== 6) return false;
      var r = parseInt(raw.slice(0, 2), 16);
      var g = parseInt(raw.slice(2, 4), 16);
      var b = parseInt(raw.slice(4, 6), 16);
      if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
      // Relative luminance (sRGB approx).
      var luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return luma > 0.62;
    }

    function setLabelsStatus(text, kind) {
      applyInfoSaveStatus(labelsStatus, text, kind);
    }

    function pruneLabelSuggestions() {
      var selected = selectedLabelIds();
      var selectedNames = Object.create(null);
      labels.forEach(function (label) {
        var n =
          label && typeof label.name === 'string'
            ? label.name.trim().toLocaleLowerCase('fr-FR')
            : '';
        if (n) selectedNames[n] = true;
      });
      labelSuggestions = labelSuggestions.filter(function (label) {
        if (!label) return false;
        if (label.isNew) {
          var name =
            typeof label.name === 'string'
              ? label.name.trim().toLocaleLowerCase('fr-FR')
              : '';
          return !!name && !selectedNames[name] && !boardHasLabelName(label.name);
        }
        return label.id && !selected[String(label.id)];
      });
    }

    function renderLabelSuggestions() {
      if (!labelsSuggestListEl || !labelsSuggestSection) return;
      labelsSuggestListEl.replaceChildren();
      pruneLabelSuggestions();
      if (!suggestLabelsFn || !labelSuggestions.length) {
        labelsSuggestSection.hidden = true;
        onLayoutChange();
        return;
      }
      labelsSuggestSection.hidden = false;
      labelSuggestions.forEach(function (label) {
        var name = labelDisplayName(label) || label.name || 'Suggestion';
        var hex = labelColorHex(label.color);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'info-labels-suggestion' + (label.isNew ? ' is-new' : '');
        btn.setAttribute('role', 'listitem');
        btn.style.setProperty('--label-color', hex);
        btn.style.setProperty(
          '--label-fg',
          labelNeedsDarkText(hex) ? '#172b4d' : '#ffffff'
        );
        btn.title = label.isNew
          ? 'Cr\u00e9er et ajouter\u00a0: ' + name
          : 'Ajouter\u00a0: ' + name;
        btn.disabled = labelsBusy;
        if (label.id) btn.dataset.labelId = String(label.id);

        var swatch = document.createElement('span');
        swatch.className = 'info-label-swatch';
        swatch.setAttribute('aria-hidden', 'true');

        var text = document.createElement('span');
        text.className = 'info-labels-suggestion-text';
        text.textContent = label.isNew ? '+ ' + name : name;

        btn.appendChild(swatch);
        btn.appendChild(text);
        btn.addEventListener('click', function () {
          if (label.isNew) createLabelSuggestion(label);
          else addLabelFromPicker(label);
        });
        labelsSuggestListEl.appendChild(btn);
      });
      onLayoutChange();
    }

    function labelSuggestionsContextKey() {
      var title = (titleInput.value || '').trim() || titleText || '';
      var desc = (descInput.value || '').trim() || descText || '';
      var existing = labels
        .map(function (label) {
          return label && label.id ? String(label.id) : '';
        })
        .filter(Boolean)
        .sort()
        .join(',');
      var available = boardLabels
        .map(function (label) {
          return label && label.id ? String(label.id) : '';
        })
        .filter(Boolean)
        .sort()
        .join(',');
      return title + '\u0001' + desc + '\u0001' + existing + '\u0001' + available;
    }

    function refreshLabelSuggestions(force) {
      if (!suggestLabelsFn) {
        labelSuggestions = [];
        labelSuggestionsLoading = false;
        labelSuggestionsKey = '';
        renderLabelSuggestions();
        return Promise.resolve();
      }
      var title = (titleInput.value || '').trim() || titleText || '';
      var desc = (descInput.value || '').trim() || descText || '';
      if (!title && !desc && !boardLabels.length) {
        labelSuggestions = [];
        labelSuggestionsLoading = false;
        renderLabelSuggestions();
        return Promise.resolve();
      }
      var key = labelSuggestionsContextKey();
      if (!force && key === labelSuggestionsKey) {
        renderLabelSuggestions();
        return Promise.resolve();
      }

      var seq = ++labelSuggestionsSeq;
      labelSuggestionsLoading = true;
      labelSuggestionsKey = key;
      return Promise.resolve()
        .then(function () {
          return suggestLabelsFn({
            force: !!force,
            cardName: title,
            cardDesc: desc,
            priorityLabel: priorityLabel || '',
            existingLabels: labels.slice(),
            boardLabels: boardLabels.slice()
          });
        })
        .then(function (list) {
          if (seq !== labelSuggestionsSeq) return;
          var selected = selectedLabelIds();
          var seen = Object.create(null);
          var seenNames = Object.create(null);
          labelSuggestions = Array.isArray(list)
            ? list
                .filter(function (label) {
                  if (!label) return false;
                  if (label.isNew) {
                    var nm =
                      typeof label.name === 'string' ? label.name.trim() : '';
                    if (!nm) return false;
                    var nk = nm.toLocaleLowerCase('fr-FR');
                    if (seenNames[nk] || boardHasLabelName(nm)) return false;
                    seenNames[nk] = true;
                    return true;
                  }
                  if (!label.id) return false;
                  var id = String(label.id);
                  if (selected[id] || seen[id]) return false;
                  seen[id] = true;
                  return true;
                })
                .slice(0, 3)
            : [];
          labelSuggestionsLoading = false;
          renderLabelSuggestions();
        })
        .catch(function (err) {
          console.error('Info label suggestions failed', err);
          if (seq !== labelSuggestionsSeq) return;
          labelSuggestionsLoading = false;
          labelSuggestions = [];
          renderLabelSuggestions();
        });
    }

    function scheduleLabelSuggestions(force) {
      if (!suggestLabelsFn) return;
      if (labelSuggestionsTimer) {
        clearTimeout(labelSuggestionsTimer);
        labelSuggestionsTimer = null;
      }
      labelSuggestionsTimer = setTimeout(function () {
        labelSuggestionsTimer = null;
        refreshLabelSuggestions(!!force);
      }, force ? 0 : 280);
    }

    function createLabelSuggestion(suggestion) {
      if (!onLabelCreate || labelsBusy || !suggestion || !suggestion.name) return;
      var name = String(suggestion.name || '').trim();
      if (!name || boardHasLabelName(name)) return;
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      renderLabels();
      Promise.resolve(
        onLabelCreate({
          name: name,
          color: suggestion.color || undefined,
          existingLabels: boardLabels.slice()
        })
      )
        .then(function (result) {
          labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else {
              setLabelsStatus('\u00c9chec de la cr\u00e9ation', 'error');
            }
            renderLabels();
            onLayoutChange();
            return result;
          }
          var created =
            result && result.label && typeof result.label === 'object'
              ? result.label
              : null;
          if (created && created.id) {
            var createdId = String(created.id);
            var onBoard = false;
            for (var i = 0; i < boardLabels.length; i++) {
              if (boardLabels[i] && String(boardLabels[i].id) === createdId) {
                onBoard = true;
                break;
              }
            }
            if (!onBoard) {
              boardLabels = boardLabels.concat([
                {
                  id: created.id,
                  name: typeof created.name === 'string' ? created.name : name,
                  color: created.color != null ? created.color : suggestion.color,
                  idBoard: created.idBoard
                }
              ]);
            }
            if (!selectedLabelIds()[createdId]) {
              labels = labels.concat([
                {
                  id: created.id,
                  name: typeof created.name === 'string' ? created.name : name,
                  color: created.color != null ? created.color : suggestion.color,
                  idBoard: created.idBoard
                }
              ]);
            }
          }
          setAuthHint('');
          setLabelsStatus('', 'ok');
          renderLabels();
          scheduleLabelSuggestions(false);
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          console.error('Info label suggestion create failed', err);
          setLabelsStatus('\u00c9chec de la cr\u00e9ation', 'error');
          renderLabels();
          onLayoutChange();
        });
    }

    function selectedLabelIds() {
      var ids = Object.create(null);
      for (var i = 0; i < labels.length; i++) {
        if (labels[i] && labels[i].id) ids[String(labels[i].id)] = true;
      }
      return ids;
    }

    function availableBoardLabels() {
      var selected = selectedLabelIds();
      var out = [];
      for (var i = 0; i < boardLabels.length; i++) {
        var label = boardLabels[i];
        if (!label || !label.id) continue;
        if (selected[String(label.id)]) continue;
        out.push(label);
      }
      return out;
    }

    function setLabelsPickerOpen(open) {
      labelsPickerOpen = !!open;
      labelsPicker.hidden = !labelsPickerOpen;
      labelsAddBtn.setAttribute('aria-expanded', labelsPickerOpen ? 'true' : 'false');
      labelsAddWrap.classList.toggle('is-open', labelsPickerOpen);
      if (labelsPickerOpen) {
        renderLabelsPicker();
        try {
          labelsSearchInput.focus();
          labelsSearchInput.select();
        } catch (e) {
          /* ignore */
        }
      } else {
        labelsSearchInput.value = '';
      }
      onLayoutChange();
    }

    function filteredAvailableBoardLabels(query) {
      var available = availableBoardLabels();
      var q = String(query || '')
        .trim()
        .toLowerCase();
      if (!q) return available;
      return available.filter(function (label) {
        return labelDisplayName(label).toLowerCase().indexOf(q) !== -1;
      });
    }

    function boardHasLabelName(name) {
      var needle = String(name || '')
        .trim()
        .toLowerCase();
      if (!needle) return false;
      for (var i = 0; i < boardLabels.length; i++) {
        if (labelDisplayName(boardLabels[i]).toLowerCase() === needle) return true;
      }
      return false;
    }

    function updateLabelsCreateButton(query) {
      if (!onLabelCreate) {
        labelsCreateBtn.hidden = true;
        labelsCreateBtn.textContent = '';
        labelsCreateBtn.disabled = true;
        return;
      }
      var q = String(query || '').trim();
      labelsCreateBtn.hidden = false;
      if (!q) {
        labelsCreateBtn.disabled = !!labelsBusy;
        labelsCreateBtn.innerHTML =
          '<i class="ti ti-plus" aria-hidden="true"></i>' +
          '<span>Tapez le nom souhait\u00e9</span>';
        labelsCreateBtn.title = labelsBusy
          ? 'Cr\u00e9ation en cours\u2026'
          : 'Tapez le nom de la nouvelle \u00e9tiquette';
        return;
      }
      if (boardHasLabelName(q) || labelsBusy) {
        labelsCreateBtn.disabled = true;
        labelsCreateBtn.innerHTML =
          '<i class="ti ti-plus" aria-hidden="true"></i>' +
          '<span>Cr\u00e9er une nouvelle \u00e9tiquette</span>';
        labelsCreateBtn.title = boardHasLabelName(q)
          ? 'Cette \u00e9tiquette existe d\u00e9j\u00e0'
          : 'Cr\u00e9ation en cours\u2026';
        return;
      }
      labelsCreateBtn.disabled = false;
      labelsCreateBtn.innerHTML =
        '<i class="ti ti-plus" aria-hidden="true"></i>' +
        '<span>Cr\u00e9er une nouvelle \u00e9tiquette\u00a0: <strong></strong></span>';
      var strong = labelsCreateBtn.querySelector('strong');
      if (strong) strong.textContent = q;
      labelsCreateBtn.title = 'Cr\u00e9er l\u2019\u00e9tiquette\u00a0: ' + q;
    }

    function filteredBoardLabels(query) {
      var q = String(query || '')
        .trim()
        .toLowerCase();
      return boardLabels.filter(function (label) {
        if (!label || !label.id) return false;
        if (!q) return true;
        return labelDisplayName(label).toLowerCase().indexOf(q) !== -1;
      });
    }

    function renderLabelsPicker() {
      labelsPickerList.replaceChildren();
      var query = labelsSearchInput.value;
      var q = String(query || '').trim();
      // With delete enabled, list every board label so unused and applied
      // ones can be permanently removed from Trello via the row ×.
      var listed = onLabelDelete
        ? filteredBoardLabels(query)
        : filteredAvailableBoardLabels(query);
      var selected = selectedLabelIds();

      if (!listed.length) {
        var empty = document.createElement('div');
        empty.className = 'info-labels-picker-empty';
        if (q) {
          empty.textContent = 'Aucune \u00e9tiquette correspondante';
        } else if (boardLabels.length && !onLabelDelete) {
          empty.textContent =
            'Toutes les \u00e9tiquettes sont d\u00e9j\u00e0 sur la carte';
        } else {
          empty.textContent = 'Aucune \u00e9tiquette sur ce tableau';
        }
        labelsPickerList.appendChild(empty);
      } else {
        listed.forEach(function (label) {
          var name = labelDisplayName(label);
          var hex = labelColorHex(label.color);
          var onCard = !!selected[String(label.id)];
          var row = document.createElement('div');
          row.className = 'info-labels-picker-row';
          if (onCard) row.classList.add('is-on-card');
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', onCard ? 'true' : 'false');
          row.dataset.labelId = String(label.id);

          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-labels-picker-option';
          btn.style.setProperty('--label-color', hex);
          btn.style.setProperty(
            '--label-fg',
            labelNeedsDarkText(hex) ? '#172b4d' : '#ffffff'
          );
          btn.title = onCard ? name + ' (sur cette carte)' : name;
          btn.disabled = labelsBusy || onCard;

          var swatch = document.createElement('span');
          swatch.className = 'info-label-swatch';
          swatch.setAttribute('aria-hidden', 'true');

          var text = document.createElement('span');
          text.className = 'info-labels-picker-option-text';
          text.textContent = name;

          btn.appendChild(swatch);
          btn.appendChild(text);
          if (!onCard) {
            btn.addEventListener('click', function () {
              addLabelFromPicker(label);
            });
          }
          row.appendChild(btn);

          if (onLabelDelete) {
            var deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'info-labels-picker-delete';
            deleteBtn.setAttribute(
              'aria-label',
              'Supprimer l\u2019\u00e9tiquette du tableau\u00a0: ' + name
            );
            deleteBtn.title = 'Supprimer du tableau';
            deleteBtn.disabled = labelsBusy;
            deleteBtn.innerHTML =
              '<i class="ti ti-x" aria-hidden="true"></i>';
            deleteBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              deleteLabelFromBoard(label);
            });
            row.appendChild(deleteBtn);
          }

          labelsPickerList.appendChild(row);
        });
      }

      updateLabelsCreateButton(query);
    }

    function renderLabels() {
      labelsEl.replaceChildren();

      if (labels.length) {
        labels.forEach(function (label) {
          var name = labelDisplayName(label);
          var hex = labelColorHex(label.color);
          var labelId = label && label.id != null ? String(label.id) : '';
          var isEditing =
            !!labelsColorEditId &&
            labelId &&
            String(labelsColorEditId) === labelId;
          var canEditLabel =
            !!labelId &&
            !!(onLabelColorChange || onLabelRename || onLabelDelete);
          var chip = document.createElement('span');
          chip.className = 'info-label';
          if (isEditing) chip.classList.add('is-editing-color');
          chip.style.setProperty('--label-color', hex);
          chip.style.setProperty(
            '--label-fg',
            labelNeedsDarkText(hex) ? '#172b4d' : '#ffffff'
          );
          chip.title = name;
          chip.setAttribute('aria-label', name);

          var text = document.createElement('span');
          text.className = 'info-label-name';
          text.textContent = name;
          chip.appendChild(text);

          var actions = document.createElement('span');
          actions.className = 'info-label-actions';

          if (canEditLabel) {
            var editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'info-label-edit';
            editBtn.setAttribute(
              'aria-label',
              'Modifier l\u2019\u00e9tiquette\u00a0: ' + name
            );
            editBtn.title = 'Modifier l\u2019\u00e9tiquette';
            editBtn.innerHTML = '<i class="ti ti-pencil" aria-hidden="true"></i>';
            editBtn.disabled = labelsBusy;
            editBtn.setAttribute('aria-expanded', isEditing ? 'true' : 'false');
            editBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              setLabelsColorPickerOpen(label.id);
            });
            actions.appendChild(editBtn);
          }

          if (onLabelRemove) {
            var clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'info-label-clear';
            clearBtn.setAttribute(
              'aria-label',
              'Retirer l\u2019\u00e9tiquette\u00a0: ' + name
            );
            clearBtn.title = 'Retirer de cette carte';
            clearBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
            clearBtn.disabled = labelsBusy;
            clearBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              if (labelsColorEditId) setLabelsColorPickerOpen('');
              removeLabelFromCard(label);
            });
            actions.appendChild(clearBtn);
          }

          if (actions.childNodes.length) chip.appendChild(actions);
          labelsEl.appendChild(chip);
        });
      }

      var canAdd = !!onLabelAdd || !!onLabelCreate;
      labelsAddBtn.hidden = !canAdd;
      labelsAddBtn.disabled = labelsBusy || !canAdd || !!labelsColorEditId;
      if (labelsPickerOpen) renderLabelsPicker();
      if (labelsColorEditId) renderLabelsColorPicker();
      else {
        labelsColorPicker.hidden = true;
        labelsColorPicker.replaceChildren();
      }
      renderLabelSuggestions();
    }

    function setTaskTypesStatus(text, tone) {
      taskTypesStatus.textContent = text || '';
      taskTypesStatus.hidden = !text;
      taskTypesStatus.classList.toggle('is-error', tone === 'error');
      taskTypesStatus.classList.toggle('is-saving', tone === 'saving');
    }

    function clearTaskTypesPickerPosition() {
      taskTypesPicker.classList.remove('is-viewport-fixed');
      taskTypesPicker.style.position = '';
      taskTypesPicker.style.top = '';
      taskTypesPicker.style.left = '';
      taskTypesPicker.style.right = '';
      taskTypesPicker.style.bottom = '';
      taskTypesPicker.style.maxHeight = '';
      taskTypesPicker.style.width = '';
    }

    /**
     * Keep the type picker inside the iframe viewport.
     * Prefer below the + button; shift left / lower when edges overflow.
     */
    function positionTaskTypesPicker() {
      if (!taskTypesPickerOpen || taskTypesPicker.hidden) return;
      var margin = 8;
      var gap = 4;
      var vw = window.innerWidth || document.documentElement.clientWidth || 0;
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (vw < 40 || vh < 40) return;

      clearTaskTypesPickerPosition();
      taskTypesPicker.classList.add('is-viewport-fixed');
      taskTypesPicker.style.position = 'fixed';
      taskTypesPicker.style.visibility = 'hidden';
      taskTypesPicker.style.top = '0';
      taskTypesPicker.style.left = '0';

      var anchor = taskTypesAddBtn.getBoundingClientRect();
      var maxW = Math.min(280, Math.max(160, vw - margin * 2));
      taskTypesPicker.style.width = maxW + 'px';

      var spaceBelow = Math.max(0, vh - anchor.bottom - gap - margin);
      var spaceAbove = Math.max(0, anchor.top - gap - margin);
      var preferBelow =
        spaceBelow >= 160 || spaceBelow >= spaceAbove || spaceAbove < 120;
      var availableH = preferBelow ? spaceBelow : spaceAbove;
      var maxH = Math.max(120, Math.min(320, availableH || vh - margin * 2));
      taskTypesPicker.style.maxHeight = maxH + 'px';

      var pw = taskTypesPicker.offsetWidth || maxW;
      var ph = taskTypesPicker.offsetHeight || Math.min(maxH, 240);

      var top = preferBelow ? anchor.bottom + gap : anchor.top - gap - ph;
      // If above would clip the top, move lower; always clamp into the viewport.
      if (top < margin) top = margin;
      if (top + ph > vh - margin) {
        top = Math.max(margin, vh - ph - margin);
      }

      // Prefer aligning to the button; shift left when the right edge overflows.
      var left = anchor.left;
      if (left + pw > vw - margin) {
        left = vw - pw - margin;
      }
      // Prefer growing left from the button's right edge when still overflowing.
      if (left < margin) {
        left = Math.max(margin, Math.min(anchor.right - pw, vw - pw - margin));
      }
      left = Math.max(margin, Math.min(left, vw - pw - margin));

      taskTypesPicker.style.top = Math.round(top) + 'px';
      taskTypesPicker.style.left = Math.round(left) + 'px';
      taskTypesPicker.style.visibility = '';
    }

    function setTaskTypesPickerOpen(open) {
      taskTypesPickerOpen = !!open;
      taskTypesPicker.hidden = !taskTypesPickerOpen;
      taskTypesAddWrap.classList.toggle('is-open', taskTypesPickerOpen);
      taskTypesAddBtn.setAttribute(
        'aria-expanded',
        taskTypesPickerOpen ? 'true' : 'false'
      );
      if (taskTypesPickerOpen) {
        randomizeTaskTypesCreateIcon();
        setTaskTypesIconPickerOpen(false);
        renderTaskTypesPicker();
        positionTaskTypesPicker();
        requestAnimationFrame(positionTaskTypesPicker);
        try {
          taskTypesCreateInput.focus();
          taskTypesCreateInput.select();
        } catch (e) {
          /* ignore */
        }
      } else {
        taskTypesCreateInput.value = '';
        setTaskTypesIconPickerOpen(false);
        clearTaskTypesPickerPosition();
      }
      onLayoutChange();
      if (taskTypesPickerOpen) {
        requestAnimationFrame(positionTaskTypesPicker);
      }
    }

    function availableTaskTypeEntries() {
      var selected = Object.create(null);
      for (var i = 0; i < taskTypes.length; i++) selected[taskTypes[i]] = true;
      return getTaskTypeCatalog().filter(function (entry) {
        return !selected[entry.id];
      });
    }

    function filteredAvailableTaskTypeEntries(query) {
      var available = availableTaskTypeEntries();
      var q = String(query || '')
        .trim()
        .toLocaleLowerCase('fr-FR');
      if (!q) return available;
      return available.filter(function (entry) {
        var label = String(entry.label || '')
          .toLocaleLowerCase('fr-FR');
        var hint = String(entry.hint || '')
          .toLocaleLowerCase('fr-FR');
        return label.indexOf(q) !== -1 || hint.indexOf(q) !== -1;
      });
    }

    function canOpenTaskTypesPicker() {
      if (!onTaskTypesChange) return false;
      return availableTaskTypeEntries().length > 0 || !!onCustomTaskTypesChange;
    }

    function syncTaskTypesCreateBtn() {
      if (!onCustomTaskTypesChange) {
        taskTypesCreateBtn.disabled = true;
        return;
      }
      var label = (taskTypesCreateInput.value || '').trim();
      taskTypesCreateBtn.disabled =
        taskTypesBusy || !label || label.length > MAX_TASK_TYPE_LABEL_LEN;
    }

    function renderTaskTypesPicker() {
      taskTypesPickerList.replaceChildren();
      // Keep the search field visible whenever the picker can open; only hide
      // create controls when custom types are unavailable.
      taskTypesCreateWrap.hidden = false;
      taskTypesCreateIconWrap.hidden = !onCustomTaskTypesChange;
      taskTypesCreateBtn.hidden = !onCustomTaskTypesChange;
      taskTypesCreateInput.placeholder = onCustomTaskTypesChange
        ? 'Rechercher ou cr\u00e9er\u2026'
        : 'Rechercher\u2026';
      taskTypesCreateInput.setAttribute(
        'aria-label',
        onCustomTaskTypesChange
          ? 'Rechercher ou cr\u00e9er un type de t\u00e2che'
          : 'Rechercher un type de t\u00e2che'
      );
      var query = taskTypesCreateInput.value;
      var available = filteredAvailableTaskTypeEntries(query);
      var q = String(query || '').trim();
      if (!available.length) {
        var empty = document.createElement('div');
        empty.className = 'info-task-types-picker-empty';
        if (q) {
          empty.textContent = 'Aucun type correspondant';
        } else if (onCustomTaskTypesChange) {
          empty.textContent =
            'Tous les types sont s\u00e9lectionn\u00e9s \u2014 cr\u00e9ez-en un nouveau';
        } else {
          empty.textContent = 'Tous les types sont d\u00e9j\u00e0 s\u00e9lectionn\u00e9s';
        }
        taskTypesPickerList.appendChild(empty);
      } else {
        available.forEach(function (entry) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-task-types-picker-option';
          btn.setAttribute('role', 'option');
          btn.disabled = taskTypesBusy;
          btn.title = entry.hint || entry.label;
          btn.dataset.taskTypeId = entry.id;

          var head = document.createElement('span');
          head.className = 'info-task-types-picker-option-head';
          head.innerHTML = taskTypeIconSvg(entry.id);
          var text = document.createElement('span');
          text.className = 'info-task-types-picker-option-text';
          text.textContent = entry.label;
          head.appendChild(text);
          btn.appendChild(head);

          if (entry.hint) {
            var hint = document.createElement('span');
            hint.className = 'info-task-types-picker-option-hint';
            hint.textContent = entry.hint;
            btn.appendChild(hint);
          }

          btn.addEventListener('click', function () {
            addTaskType(entry.id);
          });
          taskTypesPickerList.appendChild(btn);
        });
      }
      syncTaskTypesCreateBtn();
    }

    function renderTaskTypes() {
      taskTypesEl.replaceChildren();
      taskTypes.forEach(function (id) {
        var label = taskTypeLabel(id) || id;
        var hint = taskTypeHint(id);
        var chip = document.createElement('span');
        chip.className = 'info-task-type';
        chip.title = hint || label;
        chip.setAttribute('aria-label', label);

        var iconWrap = document.createElement('span');
        iconWrap.className = 'info-task-type-icon-wrap';
        iconWrap.innerHTML = taskTypeIconSvg(id);
        chip.appendChild(iconWrap);

        var text = document.createElement('span');
        text.className = 'info-task-type-name';
        text.textContent = label;
        chip.appendChild(text);

        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'info-task-type-clear';
        clearBtn.setAttribute('aria-label', 'Retirer\u00a0: ' + label);
        clearBtn.title = 'Retirer';
        clearBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
        clearBtn.disabled = taskTypesBusy;
        clearBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          removeTaskType(id);
        });
        chip.appendChild(clearBtn);
        taskTypesEl.appendChild(chip);
      });

      var canAdd = canOpenTaskTypesPicker();
      taskTypesAddBtn.hidden = !onTaskTypesChange;
      taskTypesAddBtn.disabled = taskTypesBusy || !canAdd;
      if (taskTypesPickerOpen) {
        if (!canAdd) setTaskTypesPickerOpen(false);
        else {
          renderTaskTypesPicker();
          requestAnimationFrame(positionTaskTypesPicker);
        }
      }
      renderTaskTypeSuggestions();
    }

    function persistCustomTaskTypes(nextCustoms, createdEntry) {
      var previous = getCustomTaskTypes();
      setCustomTaskTypes(nextCustoms);
      renderTaskTypes();
      if (!onCustomTaskTypesChange) {
        if (createdEntry) addTaskType(createdEntry.id);
        return Promise.resolve({ ok: true });
      }
      taskTypesBusy = true;
      setTaskTypesStatus('', 'saving');
      return Promise.resolve(onCustomTaskTypesChange(getCustomTaskTypes()))
        .then(function (result) {
          taskTypesBusy = false;
          if (result && result.ok === false) {
            setCustomTaskTypes(previous);
            setTaskTypesStatus('\u00c9chec de l\u2019enregistrement', 'error');
            renderTaskTypes();
            onLayoutChange();
            return result;
          }
          setTaskTypesStatus('', '');
          if (createdEntry) addTaskType(createdEntry.id);
          else {
            renderTaskTypes();
            onLayoutChange();
          }
          return result || { ok: true };
        })
        .catch(function (err) {
          console.error('Info custom task types save failed', err);
          taskTypesBusy = false;
          setCustomTaskTypes(previous);
          setTaskTypesStatus('\u00c9chec de l\u2019enregistrement', 'error');
          renderTaskTypes();
          onLayoutChange();
          return { ok: false };
        });
    }

    function submitCreateTaskType() {
      if (taskTypesBusy || !onCustomTaskTypesChange) return;
      var label = (taskTypesCreateInput.value || '').trim();
      if (!label) return;
      var draft = createCustomTaskType(
        { label: label, icon: taskTypesCreateIconKey },
        { apply: false }
      );
      if (!draft) {
        setTaskTypesStatus('Ce type existe d\u00e9j\u00e0', 'error');
        return;
      }
      taskTypesCreateInput.value = '';
      syncTaskTypesCreateBtn();
      setTaskTypesIconPickerOpen(false);
      persistCustomTaskTypes(getCustomTaskTypes().concat([draft]), draft).then(
        function (result) {
          if (!result || result.ok !== false) {
            randomizeTaskTypesCreateIcon();
          }
        }
      );
    }

    function persistTaskTypes(nextTypes) {
      var previous = taskTypes.slice();
      var normalized = normalizeTaskTypes(nextTypes);
      taskTypes = normalized;
      renderTaskTypes();
      if (!onTaskTypesChange) {
        onLayoutChange();
        return;
      }
      taskTypesBusy = true;
      setTaskTypesStatus('', 'saving');
      Promise.resolve(onTaskTypesChange(normalized.slice()))
        .then(function (result) {
          taskTypesBusy = false;
          if (result && result.ok === false) {
            taskTypes = previous;
            setTaskTypesStatus('\u00c9chec de l\u2019enregistrement', 'error');
            renderTaskTypes();
            onLayoutChange();
            return;
          }
          setTaskTypesStatus('', '');
          renderTaskTypes();
          scheduleTaskTypeSuggestions(false);
          onLayoutChange();
        })
        .catch(function (err) {
          console.error('Info task types save failed', err);
          taskTypesBusy = false;
          taskTypes = previous;
          setTaskTypesStatus('\u00c9chec de l\u2019enregistrement', 'error');
          renderTaskTypes();
          onLayoutChange();
        });
    }

    function addTaskType(id) {
      if (taskTypesBusy || !isValidTaskTypeId(id)) return;
      if (taskTypes.indexOf(id) >= 0) return;
      persistTaskTypes(taskTypes.concat([id]));
      setTaskTypesPickerOpen(false);
    }

    function removeTaskType(id) {
      if (taskTypesBusy) return;
      persistTaskTypes(
        taskTypes.filter(function (entry) {
          return entry !== id;
        })
      );
    }

    function pruneTaskTypeSuggestions() {
      var selected = Object.create(null);
      taskTypes.forEach(function (id) {
        selected[id] = true;
      });
      var dismissed = Object.create(null);
      dismissedTaskTypeSuggestions.forEach(function (id) {
        dismissed[id] = true;
      });
      taskTypeSuggestions = taskTypeSuggestions.filter(function (row) {
        return (
          row &&
          row.id &&
          isValidTaskTypeId(row.id) &&
          !selected[row.id] &&
          !dismissed[row.id]
        );
      });
    }

    function renderTaskTypeSuggestions() {
      if (!taskTypesSuggestListEl || !taskTypesSuggestSection) return;
      taskTypesSuggestListEl.replaceChildren();
      pruneTaskTypeSuggestions();
      if (!suggestTaskTypesFn || !taskTypeSuggestions.length) {
        taskTypesSuggestSection.hidden = true;
        onLayoutChange();
        return;
      }
      taskTypesSuggestSection.hidden = false;
      taskTypeSuggestions.forEach(function (row) {
        var entry = getTaskTypeEntry(row.id);
        var label = (entry && entry.label) || row.label || row.id;
        var hint = (entry && entry.hint) || row.hint || '';

        var chip = document.createElement('span');
        chip.className = 'info-task-types-suggestion-chip';
        chip.setAttribute('role', 'listitem');

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-task-types-suggestion';
        btn.title = hint
          ? 'Ajouter\u00a0: ' + label + ' \u2014 ' + hint
          : 'Ajouter\u00a0: ' + label;
        btn.disabled = taskTypesBusy;
        btn.dataset.taskTypeId = row.id;
        btn.innerHTML =
          taskTypeIconSvg(row.id, 'info-task-type-icon') +
          '<span class="info-task-types-suggestion-label">' +
          escapeHtml(label) +
          '</span>';
        btn.addEventListener('click', function () {
          addTaskType(row.id);
        });

        var dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'info-task-types-suggestion-dismiss';
        dismissBtn.setAttribute('aria-label', 'Ignorer la suggestion ' + label);
        dismissBtn.title = 'Ignorer';
        dismissBtn.disabled = taskTypesBusy;
        dismissBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
        dismissBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          dismissTaskTypeSuggestion(row.id);
        });

        chip.appendChild(btn);
        chip.appendChild(dismissBtn);
        taskTypesSuggestListEl.appendChild(chip);
      });
      onLayoutChange();
    }

    function persistDismissedTaskTypeSuggestions(nextIds) {
      var previous = dismissedTaskTypeSuggestions.slice();
      var normalized = normalizeTaskTypes(nextIds);
      dismissedTaskTypeSuggestions = normalized;
      pruneTaskTypeSuggestions();
      renderTaskTypeSuggestions();
      if (!onDismissedTaskTypeSuggestionsChange) {
        return Promise.resolve({ ok: true, changed: false });
      }
      return Promise.resolve(
        onDismissedTaskTypeSuggestionsChange(normalized.slice())
      )
        .then(function (result) {
          if (result && result.ok === false) {
            dismissedTaskTypeSuggestions = previous;
            renderTaskTypeSuggestions();
          }
          return result || { ok: true, changed: true };
        })
        .catch(function (err) {
          console.error('Dismiss task type suggestion failed', err);
          dismissedTaskTypeSuggestions = previous;
          renderTaskTypeSuggestions();
          throw err;
        });
    }

    function dismissTaskTypeSuggestion(id) {
      if (!isValidTaskTypeId(id)) return;
      if (dismissedTaskTypeSuggestions.indexOf(id) >= 0) {
        pruneTaskTypeSuggestions();
        renderTaskTypeSuggestions();
        return;
      }
      persistDismissedTaskTypeSuggestions(
        dismissedTaskTypeSuggestions.concat([id])
      );
    }

    function taskTypeSuggestionsContextKey() {
      var title = (titleInput.value || '').trim() || titleText || '';
      var desc = (descInput.value || '').trim() || descText || '';
      var existing = taskTypes.slice().sort().join(',');
      return title + '\u0001' + desc + '\u0001' + existing;
    }

    function refreshTaskTypeSuggestions(force) {
      if (!suggestTaskTypesFn) {
        taskTypeSuggestions = [];
        taskTypeSuggestionsLoading = false;
        taskTypeSuggestionsKey = '';
        renderTaskTypeSuggestions();
        return Promise.resolve();
      }
      if (taskTypes.length >= getTaskTypeCatalog().length) {
        taskTypeSuggestions = [];
        renderTaskTypeSuggestions();
        return Promise.resolve();
      }
      var title = (titleInput.value || '').trim() || titleText || '';
      var desc = (descInput.value || '').trim() || descText || '';
      if (!title && !desc) {
        taskTypeSuggestions = [];
        renderTaskTypeSuggestions();
        return Promise.resolve();
      }
      var key = taskTypeSuggestionsContextKey();
      if (!force && key === taskTypeSuggestionsKey) {
        renderTaskTypeSuggestions();
        return Promise.resolve();
      }
      var seq = ++taskTypeSuggestionsSeq;
      taskTypeSuggestionsLoading = true;
      taskTypeSuggestionsKey = key;
      return Promise.resolve()
        .then(function () {
          return suggestTaskTypesFn({
            force: !!force,
            cardName: title,
            cardDesc: desc,
            existingTypes: taskTypes.slice()
          });
        })
        .then(function (list) {
          if (seq !== taskTypeSuggestionsSeq) return;
          var selected = Object.create(null);
          taskTypes.forEach(function (id) {
            selected[id] = true;
          });
          var dismissed = Object.create(null);
          dismissedTaskTypeSuggestions.forEach(function (id) {
            dismissed[id] = true;
          });
          var seen = Object.create(null);
          taskTypeSuggestions = Array.isArray(list)
            ? list
                .filter(function (row) {
                  if (!row || !row.id || !isValidTaskTypeId(row.id)) return false;
                  if (selected[row.id] || dismissed[row.id] || seen[row.id]) {
                    return false;
                  }
                  seen[row.id] = true;
                  return true;
                })
                .slice(0, 3)
            : [];
          taskTypeSuggestionsLoading = false;
          renderTaskTypeSuggestions();
        })
        .catch(function (err) {
          console.error('Info task type suggestions failed', err);
          if (seq !== taskTypeSuggestionsSeq) return;
          taskTypeSuggestionsLoading = false;
          taskTypeSuggestions = [];
          renderTaskTypeSuggestions();
        });
    }

    function scheduleTaskTypeSuggestions(force) {
      if (!suggestTaskTypesFn) return;
      if (taskTypeSuggestionsTimer) {
        clearTimeout(taskTypeSuggestionsTimer);
        taskTypeSuggestionsTimer = null;
      }
      taskTypeSuggestionsTimer = setTimeout(function () {
        taskTypeSuggestionsTimer = null;
        refreshTaskTypeSuggestions(!!force);
      }, force ? 0 : 280);
    }

    function changeLabelColor(label, colorKey) {
      if (!onLabelColorChange || labelsBusy || !label || !label.id) return;
      var nextColor = labelBaseColor(colorKey);
      if (!nextColor || !Object.prototype.hasOwnProperty.call(LABEL_COLOR_HEX, nextColor)) {
        return;
      }
      if (labelBaseColor(label.color) === nextColor) {
        setLabelsColorPickerOpen('');
        return;
      }
      flushLabelRenameIfNeeded(label.id);
      var previousColor = label.color;
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      applyLabelColorLocally(label.id, nextColor);
      renderLabels();
      Promise.resolve(
        onLabelColorChange({
          id: label.id,
          color: nextColor,
          label: label
        })
      )
        .then(function (result) {
          labelsBusy = false;
          if (result && result.ok === false) {
            applyLabelColorLocally(label.id, previousColor);
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else {
              setLabelsStatus('\u00c9chec de la couleur', 'error');
            }
            renderLabels();
            onLayoutChange();
            return result;
          }
          var savedColor =
            result && result.label && result.label.color != null
              ? result.label.color
              : result && result.color != null
                ? result.color
                : nextColor;
          applyLabelColorLocally(label.id, savedColor);
          setAuthHint('');
          setLabelsStatus('', 'ok');
          labelsColorEditId = '';
          if (labelsRenameId === String(label.id)) {
            cancelLabelRename({ render: false });
          }
          renderLabels();
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          applyLabelColorLocally(label.id, previousColor);
          console.error('Info label color change failed', err);
          setLabelsStatus('\u00c9chec de la couleur', 'error');
          renderLabels();
          onLayoutChange();
        });
    }

    function createLabelFromPicker() {
      if (!onLabelCreate || labelsBusy) return;
      var name = String(labelsSearchInput.value || '').trim();
      if (!name || boardHasLabelName(name)) return;
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      renderLabels();
      Promise.resolve(
        onLabelCreate({
          name: name,
          existingLabels: boardLabels.slice()
        })
      )
        .then(function (result) {
          labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else if (result.reason === 'empty-name') {
              setLabelsStatus('Nom requis', 'error');
            } else {
              setLabelsStatus('\u00c9chec de la cr\u00e9ation', 'error');
            }
            renderLabels();
            onLayoutChange();
            return result;
          }
          var created =
            result && result.label && typeof result.label === 'object'
              ? result.label
              : null;
          if (created && created.id) {
            var createdId = String(created.id);
            var onBoard = false;
            for (var i = 0; i < boardLabels.length; i++) {
              if (boardLabels[i] && String(boardLabels[i].id) === createdId) {
                onBoard = true;
                break;
              }
            }
            if (!onBoard) {
              boardLabels = boardLabels.concat([
                {
                  id: created.id,
                  name: typeof created.name === 'string' ? created.name : name,
                  color: created.color != null ? created.color : null,
                  idBoard: created.idBoard
                }
              ]);
            }
            if (!selectedLabelIds()[createdId]) {
              labels = labels.concat([
                {
                  id: created.id,
                  name: typeof created.name === 'string' ? created.name : name,
                  color: created.color != null ? created.color : null,
                  idBoard: created.idBoard
                }
              ]);
            }
          }
          setAuthHint('');
          setLabelsStatus('', 'ok');
          setLabelsPickerOpen(false);
          renderLabels();
          scheduleLabelSuggestions(false);
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          console.error('Info label create failed', err);
          setLabelsStatus('\u00c9chec de la cr\u00e9ation', 'error');
          renderLabels();
          onLayoutChange();
        });
    }

    function addLabelFromPicker(label) {
      if (!onLabelAdd || labelsBusy || !label || !label.id) return;
      var id = String(label.id);
      if (selectedLabelIds()[id]) return;
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      renderLabels();
      Promise.resolve(onLabelAdd(label))
        .then(function (result) {
          labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else {
              setLabelsStatus('\u00c9chec de l\u2019ajout', 'error');
            }
            renderLabels();
            onLayoutChange();
            return result;
          }
          if (!selectedLabelIds()[id]) {
            labels = labels.concat([
              {
                id: label.id,
                name: typeof label.name === 'string' ? label.name : '',
                color: label.color != null ? label.color : null,
                idBoard: label.idBoard
              }
            ]);
          }
          labelSuggestions = labelSuggestions.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          setAuthHint('');
          setLabelsStatus('', 'ok');
          setLabelsPickerOpen(false);
          renderLabels();
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          console.error('Info label add failed', err);
          setLabelsStatus('\u00c9chec de l\u2019ajout', 'error');
          renderLabels();
          onLayoutChange();
        });
    }

    function removeLabelFromCard(label) {
      if (!onLabelRemove || labelsBusy || !label || !label.id) return;
      var id = String(label.id);
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      renderLabels();
      Promise.resolve(onLabelRemove(label))
        .then(function (result) {
          labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else {
              setLabelsStatus('\u00c9chec du retrait', 'error');
            }
            renderLabels();
            onLayoutChange();
            return result;
          }
          labels = labels.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          setAuthHint('');
          setLabelsStatus('', 'ok');
          renderLabels();
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          console.error('Info label remove failed', err);
          setLabelsStatus('\u00c9chec du retrait', 'error');
          renderLabels();
          onLayoutChange();
        });
    }

    function deleteLabelFromBoard(label) {
      if (!onLabelDelete || labelsBusy || !label || !label.id) return;
      var id = String(label.id);
      var name = labelDisplayName(label);
      if (
        !window.confirm(
          'Supprimer d\u00e9finitivement l\u2019\u00e9tiquette \u00ab\u00a0' +
            name +
            '\u00a0\u00bb du tableau\u00a0?\nElle sera retir\u00e9e de toutes les cartes.'
        )
      ) {
        return;
      }
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      renderLabels();
      Promise.resolve(onLabelDelete(label))
        .then(function (result) {
          labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else {
              setLabelsStatus('\u00c9chec de la suppression', 'error');
            }
            renderLabels();
            onLayoutChange();
            return result;
          }
          labels = labels.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          boardLabels = boardLabels.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          if (labelsColorEditId === id) {
            labelsColorEditId = '';
          }
          if (labelsRenameId === id) {
            labelsRenameId = '';
            labelsRenameDraft = '';
          }
          setAuthHint('');
          setLabelsStatus('', 'ok');
          renderLabels();
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          console.error('Info label delete failed', err);
          setLabelsStatus('\u00c9chec de la suppression', 'error');
          renderLabels();
          onLayoutChange();
        });
    }

    function setParentStatus(text, visible) {
      if (!visible || !text) {
        parentStatus.hidden = true;
        parentStatus.textContent = '';
        return;
      }
      parentStatus.hidden = false;
      parentStatus.textContent = text;
    }

    function setParentPickerOpen(open) {
      parentPickerOpen = !!open;
      parentPicker.hidden = !parentPickerOpen;
      parentPickWrap.classList.toggle('is-open', parentPickerOpen);
      parentPickBtn.setAttribute('aria-expanded', parentPickerOpen ? 'true' : 'false');
      if (!parentPickerOpen) {
        parentSearchInput.value = '';
        setParentStatus('', false);
        parentListEl.replaceChildren();
      }
      onLayoutChange();
    }

    function ensureParentBoardCards() {
      if (parentBoardCardsCache) return Promise.resolve(parentBoardCardsCache);
      if (!getBoardCards) return Promise.resolve([]);
      return Promise.resolve()
        .then(function () {
          return getBoardCards();
        })
        .then(function (cards) {
          parentBoardCardsCache = Array.isArray(cards) ? cards : [];
          return parentBoardCardsCache;
        })
        .catch(function (err) {
          console.error('Info parent board cards load failed', err);
          parentBoardCardsCache = [];
          return parentBoardCardsCache;
        });
    }

    function parentIdSet() {
      var set = Object.create(null);
      parentCards.forEach(function (p) {
        if (p && p.id) set[String(p.id)] = true;
      });
      return set;
    }

    function renderParentPickerList(cards, query) {
      parentListEl.replaceChildren();
      var q = String(query || '')
        .trim()
        .toLowerCase();
      var linked = parentIdSet();
      var filtered = (cards || []).filter(function (card) {
        if (!card || !card.id) return false;
        if (linked[String(card.id)]) return false;
        if (!q) return true;
        var name = String(card.name || '').toLowerCase();
        var list = String(card.list || '').toLowerCase();
        return name.indexOf(q) !== -1 || list.indexOf(q) !== -1;
      });
      if (!filtered.length) {
        setParentStatus(
          q ? 'Aucune carte correspondante' : 'Aucune carte disponible',
          true
        );
        return;
      }
      setParentStatus('', false);
      filtered.slice(0, 40).forEach(function (card) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-parent-option';
        btn.setAttribute('role', 'option');
        var nameEl = document.createElement('span');
        nameEl.className = 'info-parent-option-name';
        nameEl.textContent = card.name || 'Carte sans titre';
        btn.appendChild(nameEl);
        if (card.list) {
          var meta = document.createElement('span');
          meta.className = 'info-parent-option-list';
          meta.textContent = card.list;
          btn.appendChild(meta);
        }
        btn.title = 'Lier \u00e0\u00a0: ' + (card.name || 'Carte');
        btn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          applyParentChange(card);
        });
        parentListEl.appendChild(btn);
      });
    }

    function openParentPicker() {
      if (!getBoardCards || parentBusy) return;
      setParentPickerOpen(true);
      setParentStatus('Chargement des cartes\u2026', true);
      parentListEl.replaceChildren();
      ensureParentBoardCards().then(function (cards) {
        if (!parentPickerOpen) return;
        renderParentPickerList(cards, parentSearchInput.value);
        try {
          parentSearchInput.focus();
        } catch (e) {
          /* ignore */
        }
        onLayoutChange();
      });
    }

    function buildParentChip(parent) {
      var chip = document.createElement('span');
      chip.className = 'info-parent-chip';
      chip.dataset.parentId = parent.id;

      var openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'info-parent-chip-open';
      openBtn.disabled = parentBusy || !onOpenParent;
      openBtn.title = onOpenParent
        ? 'Ouvrir la t\u00e2che parente'
        : parent.name || '';

      var textEl = document.createElement('span');
      textEl.className = 'info-parent-chip-text';
      var nameEl = document.createElement('span');
      nameEl.className = 'info-parent-chip-name';
      nameEl.textContent = parent.name || 'Carte sans titre';
      textEl.appendChild(nameEl);
      if (parent.list) {
        var listEl = document.createElement('span');
        listEl.className = 'info-parent-chip-list';
        listEl.textContent = parent.list;
        textEl.appendChild(listEl);
      }
      openBtn.appendChild(textEl);

      var clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'info-parent-clear';
      clearBtn.setAttribute('aria-label', 'Retirer la t\u00e2che parente');
      clearBtn.title = 'Retirer';
      clearBtn.textContent = '\u00d7';
      clearBtn.disabled = parentBusy || !onParentChange;
      clearBtn.hidden = !onParentChange;

      openBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (!onOpenParent || parentBusy || openBtn.disabled) return;
        Promise.resolve(onOpenParent(parent.id)).catch(function (err) {
          console.error('Info open parent failed', err);
        });
      });

      clearBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (clearBtn.disabled || parentBusy) return;
        applyParentChange(null, parent.id);
      });

      chip.appendChild(openBtn);
      chip.appendChild(clearBtn);
      return chip;
    }

    function renderParent() {
      var canPick = !!getBoardCards && !!onParentChange;
      parentChipsEl.replaceChildren();
      parentCards.forEach(function (parent) {
        parentChipsEl.appendChild(buildParentChip(parent));
      });
      parentPickBtn.hidden = !canPick;
      parentPickBtn.disabled = parentBusy;
      if (!canPick && !parentCards.length) {
        setParentStatus('', false);
      }
    }

    function applyParentChange(nextParent, removeParentId) {
      if (!onParentChange || parentBusy) return;
      parentBusy = true;
      renderParent();
      var payload =
        nextParent && nextParent.id
          ? nextParent
          : removeParentId
            ? { removeParentId: String(removeParentId) }
            : null;
      Promise.resolve(onParentChange(payload))
        .then(function (result) {
          if (result && result.ok === false) {
            var reason = result.reason || 'error';
            var msg =
              reason === 'self'
                ? 'Impossible de lier la carte \u00e0 elle-m\u00eame'
                : reason === 'cycle'
                  ? 'Ce lien cr\u00e9erait une boucle'
                  : 'Impossible de mettre \u00e0 jour la t\u00e2che parente';
            setParentStatus(msg, true);
            return;
          }
          if (result && Array.isArray(result.parents)) {
            parentCards = normalizeParentCards(result.parents);
          } else if (nextParent && nextParent.id) {
            parentCards = normalizeParentCards(
              parentCards.concat([
                {
                  id: String(nextParent.id),
                  name:
                    typeof nextParent.name === 'string' ? nextParent.name : '',
                  list:
                    typeof nextParent.list === 'string' ? nextParent.list : '',
                },
              ])
            );
          } else if (removeParentId) {
            var rid = String(removeParentId);
            parentCards = parentCards.filter(function (p) {
              return !(p && String(p.id) === rid);
            });
          } else {
            parentCards = [];
          }
          setParentPickerOpen(false);
          setParentStatus('', false);
          parentBoardCardsCache = null;
        })
        .catch(function (err) {
          console.error('Info parent change failed', err);
          setParentStatus('Impossible de mettre \u00e0 jour la t\u00e2che parente', true);
        })
        .then(function () {
          parentBusy = false;
          renderParent();
          onLayoutChange();
        });
    }

    function setRecapText(node, text, emptyLabel) {
      var value = (text || '').trim();
      node.textContent = value || emptyLabel;
      node.classList.toggle('is-empty', !value);
    }

    function renderRecap() {
      setRecapText(porteValueEl, impactReachLabel, 'Non d\u00e9finie');
      setRecapText(dureeValueEl, durationLabel, 'Non d\u00e9finie');
      setRecapText(progresValueEl, progressLabel, 'Non estim\u00e9');
    }

    function summaryText() {
      if (titleText && !titleInput.classList.contains('is-loading')) {
        return titleText;
      }
      var bits = [];
      if (progressLabel) bits.push(progressLabel);
      if (impactReachLabel) bits.push(impactReachLabel);
      return bits.join(' \u00b7 ');
    }

    function flushTitleSave() {
      if (titleSaveTimer) {
        clearTimeout(titleSaveTimer);
        titleSaveTimer = null;
      }
      if (!onTitleChange || !titleDirty || titleBusy) return Promise.resolve();
      var next = (titleInput.value || '').trim();
      if (!next) {
        // Trello titles cannot be empty — restore last saved value.
        titleInput.value = titleText || '';
        titleDirty = false;
        setTitleStatus('Le titre ne peut pas \u00eatre vide', 'error');
        syncTitleInputSize();
        onLayoutChange();
        return Promise.resolve({ ok: false, reason: 'empty-name', changed: false });
      }
      if (next === titleText) {
        titleDirty = false;
        titleInput.value = next;
        syncTitleInputSize();
        return Promise.resolve({ ok: true, changed: false, name: next });
      }
      titleBusy = true;
      setTitleStatus('', 'saving');
      return Promise.resolve(onTitleChange(next))
        .then(function (result) {
          titleBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setTitleStatus('', 'error');
            } else if (result.reason === 'empty-name') {
              setTitleStatus('Le titre ne peut pas \u00eatre vide', 'error');
            } else {
              setTitleStatus('\u00c9chec de l\u2019enregistrement', 'error');
            }
            return result;
          }
          titleDirty = false;
          titleText = next;
          titleInput.value = next;
          setAuthHint('');
          setTitleStatus('', 'ok');
          collapse.refreshSummary();
          scheduleLabelSuggestions(false);
          scheduleTaskTypeSuggestions(false);
          setTimeout(function () {
            if (titleStatus.classList.contains('is-ok')) setTitleStatus('');
          }, 1400);
          syncTitleInputSize();
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          titleBusy = false;
          console.error('Info title save failed', err);
          setTitleStatus('\u00c9chec de l\u2019enregistrement', 'error');
        });
    }

    function scheduleTitleSave() {
      titleDirty = true;
      setTitleStatus('');
      if (titleSaveTimer) clearTimeout(titleSaveTimer);
      titleSaveTimer = setTimeout(function () {
        titleSaveTimer = null;
        flushTitleSave();
      }, FIELD_SAVE_MS);
    }

    function setDescSpellchecking(on) {
      descSpellSpinner.hidden = !on;
      descInput.classList.toggle('is-spellchecking', !!on);
      descRich.classList.toggle('is-spellchecking', !!on);
      if (on) descInput.setAttribute('aria-busy', 'true');
      else descInput.removeAttribute('aria-busy');
      if (on) descRich.setAttribute('aria-busy', 'true');
      else descRich.removeAttribute('aria-busy');
    }

    function clearDescSpellRevert() {
      if (descSpellRevert && typeof descSpellRevert.dismiss === 'function') {
        descSpellRevert.dismiss();
      }
      descSpellRevert = null;
    }

    function showDescSpellRevert(original, corrected) {
      clearDescSpellRevert();
      if (
        !original ||
        !corrected ||
        original === corrected ||
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.attachRevert !== 'function'
      ) {
        return;
      }
      descSpellRevert = global.Spellcheck.attachRevert(descMeta, {
        before: descStatus,
        previous: original,
        onRevert: function () {
          descSpellRevert = null;
          if (descInput.value !== corrected && descInput.value.trim() !== corrected.trim()) {
            return;
          }
          descInput.value = original;
          if (descMode === 'rich') renderDescRich();
          descSpellcheckedText = original.trim() || null;
          descDirty = true;
          if (descMode === 'markdown') syncDescInputSize();
          else syncDescRichSize();
          onLayoutChange();
          flushDescSave();
        },
        onDismiss: function () {
          descSpellRevert = null;
          onLayoutChange();
        }
      });
      onLayoutChange();
    }

    function spellcheckDescText(text) {
      var trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) return Promise.resolve('');
      if (
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        return Promise.resolve(trimmed);
      }
      return global.Spellcheck.correct(trimmed).then(
        function (corrected) {
          return typeof corrected === 'string' ? corrected.trim() : trimmed;
        },
        function () {
          return trimmed;
        }
      );
    }

    /**
     * Save first (never blocked). Then AI may refine orthography in the background;
     * apply only if the field is unchanged since this check started.
     */
    function spellcheckDescAfterCommit() {
      if (
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        return;
      }
      var snapshot = descInput.value;
      var trimmed = snapshot.trim();
      if (!trimmed) {
        descSpellcheckedText = snapshot;
        setDescSpellchecking(false);
        return;
      }
      if (trimmed === descSpellcheckedText) return;
      var gen = ++descSpellcheckGen;
      setDescSpellchecking(true);
      onLayoutChange();
      spellcheckDescText(snapshot).then(function (corrected) {
        if (gen !== descSpellcheckGen) return;
        setDescSpellchecking(false);
        if (!corrected || corrected === trimmed) {
          descSpellcheckedText = trimmed;
          onLayoutChange();
          return;
        }
        // User edited again while we were checking — discard this correction.
        if (descInput.value !== snapshot) {
          onLayoutChange();
          return;
        }
        descInput.value = corrected;
        if (descMode === 'rich') renderDescRich();
        descSpellcheckedText = corrected.trim();
        descDirty = true;
        showDescSpellRevert(snapshot, corrected);
        if (descMode === 'markdown') syncDescInputSize();
        else syncDescRichSize();
        onLayoutChange();
        flushDescSave();
      }).catch(function () {
        if (gen !== descSpellcheckGen) return;
        setDescSpellchecking(false);
        onLayoutChange();
      });
    }

    function flushDescSave() {
      syncDescSourceFromRich();
      if (descSaveTimer) {
        clearTimeout(descSaveTimer);
        descSaveTimer = null;
      }
      if (!onDescChange || !descDirty || descBusy) return Promise.resolve();
      var next = descInput.value;
      descBusy = true;
      setDescStatus('', 'saving');
      return Promise.resolve(onDescChange(next))
        .then(function (result) {
          descBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setDescStatus('', 'error');
            } else {
              setDescStatus('\u00c9chec de l\u2019enregistrement', 'error');
            }
            return result;
          }
          // Spellcheck (or typing) may have changed the field while this save ran.
          if (descInput.value !== next) {
            descText = next;
            descDirty = true;
            scheduleDescSave();
            return result;
          }
          descDirty = false;
          descText = next;
          setAuthHint('');
          setDescStatus('', 'ok');
          scheduleLabelSuggestions(false);
          scheduleTaskTypeSuggestions(false);
          setTimeout(function () {
            if (descStatus.classList.contains('is-ok')) setDescStatus('');
          }, 1400);
          return result;
        })
        .catch(function (err) {
          descBusy = false;
          console.error('Info description save failed', err);
          setDescStatus('\u00c9chec de l\u2019enregistrement', 'error');
        });
    }

    function scheduleDescSave() {
      descDirty = true;
      setDescStatus('');
      if (descSaveTimer) clearTimeout(descSaveTimer);
      descSaveTimer = setTimeout(function () {
        descSaveTimer = null;
        flushDescSave();
      }, FIELD_SAVE_MS);
    }

    titleInput.addEventListener('input', function () {
      if (titleInput.classList.contains('is-loading')) return;
      scheduleTitleSave();
      syncTitleInputSize();
      onLayoutChange();
    });
    titleInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleInput.blur();
      }
    });
    titleInput.addEventListener('blur', function () {
      flushTitleSave();
    });

    descInput.addEventListener('input', function () {
      // Invalidate in-flight spellcheck so a stale correction cannot overwrite new typing.
      descSpellcheckGen += 1;
      setDescSpellchecking(false);
      clearDescSpellRevert();
      scheduleDescSave();
      syncDescInputSize();
      syncDescFormatMenuSelection();
      onLayoutChange();
    });
    descInput.addEventListener('keyup', function () {
      syncDescFormatMenuSelection();
    });
    descInput.addEventListener('click', function () {
      syncDescFormatMenuSelection();
    });
    descInput.addEventListener('keydown', function (e) {
      var key = e.key;
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (key === 'b' || key === 'B') {
        e.preventDefault();
        applyDescMarkdownInline('**');
        return;
      }
      if (key === 'i' || key === 'I') {
        e.preventDefault();
        applyDescMarkdownInline('*');
        return;
      }
      if (key === 'k' || key === 'K') {
        e.preventDefault();
        promptDescLinkUrl();
        return;
      }
    });
    descInput.addEventListener('paste', function (e) {
      if (!e.clipboardData) return;
      var state = getDescEditState();
      if (state.start === state.end) return;
      var url = normalizePasteableMarkdownUrl(e.clipboardData.getData('text/plain'));
      if (!url) return;
      e.preventDefault();
      applyDescMarkdownLink(url);
    });
    descInput.addEventListener('blur', function () {
      // Persist immediately; spellcheck runs async with a small spinner.
      flushDescSave();
      spellcheckDescAfterCommit();
    });
    descRich.addEventListener('input', function () {
      descSpellcheckGen += 1;
      setDescSpellchecking(false);
      clearDescSpellRevert();
      syncDescSourceFromRich();
      scheduleDescSave();
      syncDescRichSize();
      syncDescFormatMenuSelection();
      onLayoutChange();
    });
    descRich.addEventListener('change', function (e) {
      if (!e.target || richNodeName(e.target) !== 'INPUT') return;
      syncDescSourceFromRich();
      scheduleDescSave();
    });
    descRich.addEventListener('keyup', syncDescFormatMenuSelection);
    descRich.addEventListener('mouseup', syncDescFormatMenuSelection);
    descRich.addEventListener('keydown', function (e) {
      var key = e.key;
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (key === 'b' || key === 'B') {
        e.preventDefault();
        execDescRichCommand('bold');
      } else if (key === 'i' || key === 'I') {
        e.preventDefault();
        execDescRichCommand('italic');
      } else if (key === 'k' || key === 'K') {
        e.preventDefault();
        promptDescLinkUrl();
      }
    });
    descRich.addEventListener('paste', function (e) {
      if (!e.clipboardData) return;
      var plain = e.clipboardData.getData('text/plain');
      var pasteUrl = normalizePasteableMarkdownUrl(plain);
      var sel = getDescRichSelection();
      if (pasteUrl && sel && !sel.isCollapsed) {
        e.preventDefault();
        applyDescRichLink(pasteUrl);
        return;
      }
      e.preventDefault();
      var temp = document.createElement('div');
      var html = e.clipboardData.getData('text/html');
      if (html) temp.innerHTML = html;
      else temp.textContent = plain;
      var safeMarkdown = markdownFromRichRoot(temp);
      var safeHtml = renderMarkdownToHtml(safeMarkdown);
      try {
        document.execCommand('insertHTML', false, safeHtml);
      } catch (err) {
        document.execCommand('insertText', false, plain);
      }
      syncDescSourceFromRich();
      scheduleDescSave();
      syncDescRichSize();
    });
    descRich.addEventListener('blur', function () {
      syncDescSourceFromRich();
      flushDescSave();
      spellcheckDescAfterCommit();
    });

    // Keep the current editor selection when interacting with the toolbar.
    descToolbar.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
    descFormatBtn.addEventListener('click', function () {
      if (descFormatMenu.hidden) openDescFormatMenu();
      else closeDescFormatMenu();
      focusDescEditor(false);
    });
    descFormatMenu.addEventListener('click', function (e) {
      var opt =
        e.target && e.target.closest
          ? e.target.closest('[data-md-kind]')
          : null;
      if (!opt) return;
      var kind = opt.getAttribute('data-md-kind');
      closeDescFormatMenu();
      if (descMode === 'rich') applyDescRichBlock(kind);
      else applyDescMarkdownBlock(kind);
    });
    descBoldBtn.addEventListener('click', function () {
      if (descMode === 'rich') execDescRichCommand('bold');
      else applyDescMarkdownInline('**');
    });
    descItalicBtn.addEventListener('click', function () {
      if (descMode === 'rich') execDescRichCommand('italic');
      else applyDescMarkdownInline('*');
    });
    descStrikeBtn.addEventListener('click', function () {
      if (descMode === 'rich') execDescRichCommand('strikeThrough');
      else applyDescMarkdownInline('~~');
    });
    descLinkBtn.addEventListener('click', function () {
      promptDescLinkUrl();
    });
    descChecklistBtn.addEventListener('click', function () {
      if (descMode === 'rich') applyDescRichBlock('checklist');
      else applyDescMarkdownBlock('checklist');
    });
    descModeSwitch.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest
        ? e.target.closest('[data-desc-mode]')
        : null;
      if (!btn) return;
      setDescMode(btn.getAttribute('data-desc-mode'));
    });
    document.addEventListener('mousedown', function (e) {
      if (!descFormatMenu.hidden && !descFormatWrap.contains(e.target)) {
        closeDescFormatMenu();
      }
    });

    authBtn.addEventListener('click', function () {
      if (!onAuthorize || authBusy) return;
      authBusy = true;
      authBtn.disabled = true;
      Promise.resolve(onAuthorize())
        .then(function () {
          setAuthHint('');
          return flushTitleSave();
        })
        .then(function () {
          return flushDescSave();
        })
        .catch(function (err) {
          console.error('Info REST authorize failed', err);
          setAuthHint('not-authorized');
        })
        .then(function () {
          authBusy = false;
          authBtn.disabled = false;
          onLayoutChange();
        });
    });

    membersAddBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (membersAddBtn.disabled) return;
      setMembersPickerOpen(!membersPickerOpen);
    });

    labelsAddBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (labelsAddBtn.disabled) return;
      setLabelsPickerOpen(!labelsPickerOpen);
    });

    taskTypesAddBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (taskTypesAddBtn.disabled) return;
      setTaskTypesPickerOpen(!taskTypesPickerOpen);
    });

    taskTypesCreateIconBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (taskTypesBusy) return;
      setTaskTypesIconPickerOpen(!taskTypesIconPickerOpen);
    });

    taskTypesCreateInput.addEventListener('input', function () {
      if (!taskTypesPickerOpen) {
        syncTaskTypesCreateBtn();
        return;
      }
      renderTaskTypesPicker();
      onLayoutChange();
      requestAnimationFrame(positionTaskTypesPicker);
    });
    taskTypesCreateInput.addEventListener('click', function (event) {
      event.stopPropagation();
    });
    taskTypesCreateInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setTaskTypesPickerOpen(false);
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      var q = String(taskTypesCreateInput.value || '').trim();
      var matches = filteredAvailableTaskTypeEntries(q);
      if (matches.length === 1) {
        addTaskType(matches[0].id);
        return;
      }
      if (matches.length > 1 && q) {
        var exact = null;
        var qKey = q.toLocaleLowerCase('fr-FR');
        for (var i = 0; i < matches.length; i++) {
          if (
            String(matches[i].label || '')
              .toLocaleLowerCase('fr-FR') === qKey
          ) {
            exact = matches[i];
            break;
          }
        }
        if (exact) {
          addTaskType(exact.id);
          return;
        }
      }
      submitCreateTaskType();
    });
    taskTypesCreateBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      submitCreateTaskType();
    });

    window.addEventListener('resize', function () {
      if (taskTypesPickerOpen) positionTaskTypesPicker();
    });
    document.addEventListener(
      'scroll',
      function () {
        if (taskTypesPickerOpen) positionTaskTypesPicker();
      },
      true
    );

    labelsSearchInput.addEventListener('input', function () {
      if (!labelsPickerOpen) return;
      renderLabelsPicker();
      onLayoutChange();
    });

    labelsSearchInput.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    labelsSearchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLabelsPickerOpen(false);
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      var q = String(labelsSearchInput.value || '').trim();
      var matches = filteredAvailableBoardLabels(q);
      if (matches.length === 1) {
        addLabelFromPicker(matches[0]);
        return;
      }
      if (matches.length > 1 && q) {
        var exact = null;
        for (var i = 0; i < matches.length; i++) {
          if (labelDisplayName(matches[i]).toLowerCase() === q.toLowerCase()) {
            exact = matches[i];
            break;
          }
        }
        if (exact) {
          addLabelFromPicker(exact);
          return;
        }
      }
      if (onLabelCreate && q && !boardHasLabelName(q)) {
        createLabelFromPicker();
      }
    });

    labelsCreateBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (labelsCreateBtn.disabled) {
        try {
          labelsSearchInput.focus();
        } catch (e) {
          /* ignore */
        }
        return;
      }
      if (!String(labelsSearchInput.value || '').trim()) {
        try {
          labelsSearchInput.focus();
        } catch (e) {
          /* ignore */
        }
        return;
      }
      createLabelFromPicker();
    });

    if (labelsSuggestRefreshBtn) {
      labelsSuggestRefreshBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        refreshLabelSuggestions(true);
      });
    }

    if (taskTypesSuggestRefreshBtn) {
      taskTypesSuggestRefreshBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        refreshTaskTypeSuggestions(true);
      });
    }

    parentPickBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (parentPickBtn.disabled || !getBoardCards) return;
      if (parentPickerOpen) setParentPickerOpen(false);
      else openParentPicker();
    });

    parentSearchInput.addEventListener('input', function () {
      ensureParentBoardCards().then(function (cards) {
        if (!parentPickerOpen) return;
        renderParentPickerList(cards, parentSearchInput.value);
        onLayoutChange();
      });
    });

    parentSearchInput.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    document.addEventListener('click', function (event) {
      if (membersPickerOpen && !membersAddWrap.contains(event.target)) {
        setMembersPickerOpen(false);
      }
      if (labelsPickerOpen && !labelsAddWrap.contains(event.target)) {
        setLabelsPickerOpen(false);
      }
      if (taskTypesPickerOpen && !taskTypesAddWrap.contains(event.target)) {
        setTaskTypesPickerOpen(false);
      } else if (
        taskTypesIconPickerOpen &&
        !taskTypesCreateWrap.contains(event.target)
      ) {
        setTaskTypesIconPickerOpen(false);
      }
      if (
        labelsColorEditId &&
        !labelsWrap.contains(event.target)
      ) {
        setLabelsColorPickerOpen('');
      }
      if (parentPickerOpen && !parentPickWrap.contains(event.target)) {
        setParentPickerOpen(false);
      }
    });

    var collapse = bindCollapsibleEnable({
      field: field,
      body: body,
      chrome: chrome,
      alwaysEnabled: true,
      enabled: true,
      expanded: config.expanded != null ? !!config.expanded : true,
      getSummary: summaryText,
      onLayoutChange: onLayoutChange,
      onExpandChange: config.onExpandChange || function () {}
    });

    renderMembers();
    renderLabels();
    renderTaskTypes();
    renderParent();
    renderRecap();
    setAuthHint(authReason);
    syncTitleInputSize();
    setDescMode('rich', { focus: false });
    collapse.refreshSummary();
    scheduleLabelSuggestions(false);
    scheduleTaskTypeSuggestions(false);

    return {
      field: field,
      setTitle: function (name, options) {
        options = options || {};
        var value = typeof name === 'string' ? name : '';
        if (titleDirty && !options.force) return;
        if (document.activeElement === titleInput && !options.force) return;
        titleText = value;
        titleInput.readOnly = false;
        titleInput.classList.remove('is-loading');
        if (titleText) {
          titleInput.value = titleText;
          titleInput.title = titleText;
        } else {
          titleInput.value = '';
          titleInput.title = '';
          titleInput.placeholder = 'Titre de la carte';
        }
        titleDirty = false;
        syncTitleInputSize();
        collapse.refreshSummary();
        scheduleLabelSuggestions(false);
        scheduleTaskTypeSuggestions(false);
      },
      getTitle: function () {
        if (titleInput.classList.contains('is-loading')) return titleText || '';
        return (titleInput.value || '').trim() || titleText || '';
      },
      setDesc: function (next, options) {
        options = options || {};
        var value = typeof next === 'string' ? next : '';
        if (descDirty && !options.force) return;
        descText = value;
        if (
          (document.activeElement === descInput || document.activeElement === descRich) &&
          !options.force
        ) {
          return;
        }
        descSpellcheckGen += 1;
        setDescSpellchecking(false);
        clearDescSpellRevert();
        descInput.value = value;
        descDirty = false;
        descSpellcheckedText = value.trim() || null;
        if (descMode === 'rich') renderDescRich();
        else syncDescInputSize();
        scheduleLabelSuggestions(false);
        scheduleTaskTypeSuggestions(false);
      },
      getDesc: function () {
        syncDescSourceFromRich();
        return descInput.value;
      },
      setMembers: function (list) {
        members = Array.isArray(list) ? list.slice() : [];
        renderMembers();
        onLayoutChange();
      },
      setCreator: function (member) {
        creatorMember =
          member && typeof member === 'object' && member.id ? member : null;
        renderCreator();
        onLayoutChange();
      },
      setBoardMembers: function (list) {
        boardMembers = Array.isArray(list) ? list.slice() : [];
        renderMembers();
        renderCreator();
        onLayoutChange();
      },
      setLabels: function (list) {
        labels = Array.isArray(list) ? list.slice() : [];
        if (labelsRenameId && !findLabelById(labels, labelsRenameId)) {
          cancelLabelRename({ render: false });
        }
        renderLabels();
        scheduleLabelSuggestions(false);
        onLayoutChange();
      },
      setBoardLabels: function (list) {
        boardLabels = Array.isArray(list) ? list.slice() : [];
        renderLabels();
        scheduleLabelSuggestions(false);
        onLayoutChange();
      },
      setTaskTypes: function (list) {
        taskTypes = normalizeTaskTypes(list);
        renderTaskTypes();
        scheduleTaskTypeSuggestions(false);
        onLayoutChange();
      },
      getTaskTypes: function () {
        return taskTypes.slice();
      },
      setCustomTaskTypes: function (list) {
        setCustomTaskTypes(list);
        renderTaskTypes();
        scheduleTaskTypeSuggestions(false);
        onLayoutChange();
      },
      getCustomTaskTypes: function () {
        return getCustomTaskTypes();
      },
      setDismissedTaskTypeSuggestions: function (list) {
        dismissedTaskTypeSuggestions = normalizeTaskTypes(list);
        pruneTaskTypeSuggestions();
        renderTaskTypeSuggestions();
        onLayoutChange();
      },
      getDismissedTaskTypeSuggestions: function () {
        return dismissedTaskTypeSuggestions.slice();
      },
      setRecap: function (next) {
        if (!next) return;
        if (next.priorityLabel != null) priorityLabel = String(next.priorityLabel || '');
        if (next.impactReach != null) impactReachLabel = String(next.impactReach || '');
        if (next.durationLabel != null) durationLabel = String(next.durationLabel || '');
        if (next.progressLabel != null) progressLabel = String(next.progressLabel || '');
        renderRecap();
        collapse.refreshSummary();
      },
      setAuthReason: function (reason) {
        setAuthHint(reason || '');
        onLayoutChange();
      },
      setParents: function (next) {
        parentCards = normalizeParentCards(next);
        renderParent();
        onLayoutChange();
      },
      setParent: function (next) {
        parentCards = normalizeParentCards(next ? [next] : []);
        renderParent();
        onLayoutChange();
      },
      getParents: function () {
        return parentCards.map(function (p) {
          return {
            id: p.id,
            name: p.name || '',
            list: p.list || '',
          };
        });
      },
      getParent: function () {
        return parentCards.length
          ? {
              id: parentCards[0].id,
              name: parentCards[0].name || '',
              list: parentCards[0].list || '',
            }
          : null;
      },
      getObjectifMount: function () {
        return objectifMount;
      },
      setObjectifVisible: function (visible) {
        objectifRow.row.hidden = !visible;
        onLayoutChange();
      },
      flushTitle: flushTitleSave,
      flushDesc: flushDescSave,
      refreshSummary: function () {
        collapse.refreshSummary();
      },
      setExpanded: function (on, opts) {
        return collapse.setExpanded(on, opts);
      },
      isExpanded: function () {
        return collapse.isExpanded();
      }
    };
  }

  function createEnAttenteField(config) {
    var el = config.el;
    var checked = !!config.value;
    var onChange = config.onChange || function () {};
    var onLayoutChange = config.onLayoutChange || function () {};
    var onBlockedReasonAdded =
      typeof config.onBlockedReasonAdded === 'function'
        ? config.onBlockedReasonAdded
        : null;
    var getSubtasks =
      typeof config.getSubtasks === 'function' ? config.getSubtasks : function () { return []; };
    // Nested under Progrès (via Statut): no collapse chrome / enable checkbox.
    var embedded = !!config.embedded;
    // Per-subtask Motif editors: no "waiting on another task" link picker.
    var hideSubtaskPicker = !!config.hideSubtaskPicker;
    var bodyId = 'blocked-section-body-' + Math.random().toString(36).slice(2, 9);
    var currentReasons = normalizeBlockedReasons(
      config.blockedReasons != null ? config.blockedReasons : config
    );
    var currentLinks =
      isBlockedWaitingOtherTask(currentReasons) ||
      (config.blockedLinks && config.blockedLinks.length) ||
      config.blockedLink
        ? normalizeBlockedLinks(
            config.blockedLinks != null
              ? config.blockedLinks
              : config.blockedLink != null
                ? config
                : []
          )
        : [];
    // reasonKey → generation; stale AI responses are ignored when gen no longer matches.
    var reasonSpellcheckPending = Object.create(null);
    var reasonSpellcheckGen = 0;
    // reasonKey(corrected) → { original } kept until popup closes / revert / edit
    var reasonSpellReverts = Object.create(null);
    // reasonKey(first split chip) → { original, reasons: string[] }
    var reasonSplitReverts = Object.create(null);
    var splitBlockedReasonFn =
      typeof config.splitBlockedReason === 'function'
        ? config.splitBlockedReason
        : null;

    function spellcheckReasonText(text) {
      var trimmed = normalizeBlockedReason(text);
      if (!trimmed) return Promise.resolve('');
      if (
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        return Promise.resolve(trimmed);
      }
      return global.Spellcheck.correct(trimmed).then(
        function (corrected) {
          return normalizeBlockedReason(
            typeof corrected === 'string' ? corrected : trimmed
          );
        },
        function () {
          return trimmed;
        }
      );
    }

    function emptyBlockedSplitResult(original) {
      var text = normalizeBlockedReason(original);
      return { shouldSplit: false, reasons: text ? [text] : [] };
    }

    function callSplitBlockedReason(text) {
      var original = normalizeBlockedReason(text);
      var empty = emptyBlockedSplitResult(original);
      if (!original) return Promise.resolve(empty);
      if (splitBlockedReasonFn) {
        return Promise.resolve()
          .then(function () {
            return splitBlockedReasonFn(original);
          })
          .catch(function (err) {
            console.error('splitBlockedReason failed', err);
            return empty;
          });
      }
      var Agent = global.PriorityAgent;
      if (
        !Agent ||
        typeof Agent.splitBlockedReason !== 'function' ||
        typeof Agent.getProvider !== 'function'
      ) {
        return Promise.resolve(empty);
      }
      var t =
        global.Spellcheck && typeof global.Spellcheck.getT === 'function'
          ? global.Spellcheck.getT()
          : null;
      if (!t) return Promise.resolve(empty);
      return Agent.getProvider(t)
        .then(function (provider) {
          if (
            typeof Agent.isConfigured === 'function' &&
            !Agent.isConfigured(provider)
          ) {
            return empty;
          }
          return Agent.splitBlockedReason(provider, original);
        })
        .catch(function (err) {
          console.error('splitBlockedReason failed', err);
          return empty;
        });
    }

    function reasonMayBeCompound(text) {
      return (
        typeof global.PriorityAgent !== 'undefined' &&
        typeof global.PriorityAgent.titleMayBeCompound === 'function' &&
        global.PriorityAgent.titleMayBeCompound(text)
      );
    }

    function isReasonSpellchecking(reason) {
      var key = reasonKey(reason);
      return !!(key && reasonSpellcheckPending[key]);
    }

    function markReasonSpellchecking(reason) {
      var key = reasonKey(reason);
      if (!key) return 0;
      reasonSpellcheckGen += 1;
      reasonSpellcheckPending[key] = reasonSpellcheckGen;
      return reasonSpellcheckGen;
    }

    function clearReasonSpellchecking(reason, gen) {
      var key = reasonKey(reason);
      if (!key) return;
      if (gen != null && reasonSpellcheckPending[key] !== gen) return;
      delete reasonSpellcheckPending[key];
    }

    function clearReasonSpellRevert(corrected) {
      var key = reasonKey(corrected);
      if (!key || !reasonSpellReverts[key]) return;
      delete reasonSpellReverts[key];
    }

    function rememberReasonSpellRevert(corrected, original) {
      var key = reasonKey(corrected);
      var originalNorm = normalizeBlockedReason(original);
      if (!key || !originalNorm || reasonKey(originalNorm) === key) return;
      reasonSpellReverts[key] = { original: originalNorm };
    }

    function clearReasonSplitRevert(reason) {
      var key = reasonKey(reason);
      if (!key) return;
      Object.keys(reasonSplitReverts).forEach(function (anchorKey) {
        var entry = reasonSplitReverts[anchorKey];
        if (!entry || !Array.isArray(entry.reasons)) return;
        var overlap =
          anchorKey === key ||
          entry.reasons.some(function (r) {
            return reasonKey(r) === key;
          });
        if (overlap) delete reasonSplitReverts[anchorKey];
      });
    }

    function fireBlockedReasonAdded(reason) {
      var next = normalizeBlockedReason(reason);
      if (
        !next ||
        !onBlockedReasonAdded ||
        next === BLOCKED_REASON_WAITING_OTHER_TASK
      ) {
        return;
      }
      try {
        onBlockedReasonAdded(next);
      } catch (err) {
        console.error('onBlockedReasonAdded failed', err);
      }
    }

    /**
     * Replace one committed Motif with several polished Motifs from AI split.
     * @returns {string[]|null} added reasons
     */
    function applyReasonSplitReplace(originalText, reasons) {
      var original = normalizeBlockedReason(originalText);
      if (!original || !reasons || reasons.length < 2 || !hasReason(original)) {
        return null;
      }
      var polished = [];
      var seen = Object.create(null);
      for (var i = 0; i < reasons.length; i++) {
        var text = normalizeBlockedReason(reasons[i]);
        if (!text) continue;
        var key = reasonKey(text);
        if (!key || seen[key]) continue;
        seen[key] = true;
        polished.push(text);
      }
      if (polished.length < 2) return null;

      clearReasonSpellchecking(original);
      clearReasonSpellRevert(original);
      clearReasonSplitRevert(original);

      // Drop the provisional compound chip without notifying (batch below).
      var nextReasons = [];
      var originalKey = reasonKey(original);
      for (var r = 0; r < currentReasons.length; r++) {
        if (reasonKey(currentReasons[r]) !== originalKey) {
          nextReasons.push(currentReasons[r]);
        }
      }
      currentReasons = nextReasons;
      if (!isBlockedWaitingOtherTask(currentReasons)) {
        currentLinks = [];
      }

      var added = [];
      for (var p = 0; p < polished.length; p++) {
        var piece = polished[p];
        if (hasReason(piece)) continue;
        bumpBlockedReasonFreq(piece);
        currentReasons = currentReasons.concat([piece]);
        added.push(piece);
        fireBlockedReasonAdded(piece);
      }
      if (added.length < 2) {
        // Restore original if we somehow collapsed to <2 new chips.
        if (!hasReason(original)) {
          currentReasons = currentReasons.concat([original]);
        }
        refreshSelected();
        refreshSuggestions();
        refreshSubtaskUi();
        notifyReasonChange();
        onLayoutChange();
        return null;
      }

      reasonSplitReverts[reasonKey(added[0])] = {
        original: original,
        reasons: added.slice()
      };
      if (embedded && !checked) {
        checked = true;
        field.classList.add('is-enabled');
      }
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
      return added;
    }

    function applySpellcheckCorrection(original, corrected, gen, opts) {
      opts = opts || {};
      var key = reasonKey(original);
      if (!key || reasonSpellcheckPending[key] !== gen) return;
      clearReasonSpellchecking(original, gen);
      var finalText = normalizeBlockedReason(corrected) || original;
      if (finalText !== original && hasReason(original)) {
        var hadFinalBefore = hasReason(finalText);
        var renamed = renameReason(original, finalText);
        if (renamed && !hadFinalBefore && hasReason(finalText)) {
          rememberReasonSpellRevert(finalText, original);
        }
        if (opts.deferredTaskCreate) {
          fireBlockedReasonAdded(hasReason(finalText) ? finalText : original);
        }
        refreshSelected();
        onLayoutChange();
      } else {
        if (opts.deferredTaskCreate && hasReason(original)) {
          fireBlockedReasonAdded(original);
        }
        refreshSelected();
        onLayoutChange();
      }
    }

    /**
     * After commit: ask AI whether the Motif is several causes; else spellcheck.
     * Enter must never wait on AI.
     */
    function refineReasonAfterCommit(original, opts) {
      opts = opts || {};
      var typed = normalizeBlockedReason(original);
      if (!typed || !hasReason(typed)) return;
      var gen = markReasonSpellchecking(typed);
      refreshSelected();
      onLayoutChange();

      var splitPromise = reasonMayBeCompound(typed)
        ? callSplitBlockedReason(typed)
        : Promise.resolve(null);

      splitPromise.then(function (splitResult) {
        if (reasonSpellcheckPending[reasonKey(typed)] !== gen) return;
        if (!hasReason(typed)) {
          clearReasonSpellchecking(typed, gen);
          return;
        }
        if (
          splitResult &&
          splitResult.shouldSplit === true &&
          Array.isArray(splitResult.reasons) &&
          splitResult.reasons.length >= 2
        ) {
          clearReasonSpellchecking(typed, gen);
          var added = applyReasonSplitReplace(typed, splitResult.reasons);
          if (added) return;
        }
        // No split (or failed replace): continue with orthography polish.
        spellcheckReasonText(typed).then(
          function (corrected) {
            applySpellcheckCorrection(typed, corrected, gen, opts);
          },
          function () {
            applySpellcheckCorrection(typed, typed, gen, opts);
          }
        );
      });
    }

    var field = document.createElement('div');
    field.className = embedded
      ? 'field field--en-attente field--en-attente-embedded is-enabled'
      : 'field field--en-attente';

    var chrome = null;
    if (!embedded) {
      chrome = createCollapsibleEnableChrome({
        title: BLOCKED_LABEL,
        bodyId: bodyId,
        checkboxClass: 'en-attente-checkbox',
        labelClass: 'en-attente-label',
        leadingIcon: 'ti-barrier-block',
        iconClass: 'blocked-leading-icon',
        titleClass: 'en-attente-title',
        collapseLabel: 'Replier Bloqu\u00e9',
        expandLabel: 'D\u00e9velopper Bloqu\u00e9'
      });
      field.appendChild(chrome.head);
    }

    var reasonWrap = document.createElement('div');
    reasonWrap.className = embedded
      ? 'blocked-reason-wrap'
      : 'blocked-reason-wrap section-toggle-body';
    reasonWrap.id = bodyId;

    var selectedWrap = document.createElement('div');
    selectedWrap.className = 'blocked-reason-selected';
    selectedWrap.hidden = !(currentReasons.length || currentLinks.length);

    var subtaskWrap = document.createElement('div');
    subtaskWrap.className = 'blocked-subtask-wrap';
    subtaskWrap.hidden = true;

    var subtaskPicker = document.createElement('div');
    subtaskPicker.className = 'blocked-subtask-picker';

    var subtaskPickerLabel = document.createElement('div');
    subtaskPickerLabel.className = 'blocked-reason-suggestions-label';
    subtaskPickerLabel.textContent = BLOCKED_SUBTASK_PICKER_LABEL;

    var subtaskEmpty = document.createElement('div');
    subtaskEmpty.className = 'blocked-subtask-empty';
    subtaskEmpty.textContent = BLOCKED_SUBTASK_EMPTY;

    var subtaskList = document.createElement('div');
    subtaskList.className = 'blocked-reason-suggestions-list blocked-subtask-list';
    subtaskList.setAttribute('role', 'list');

    subtaskPicker.appendChild(subtaskPickerLabel);
    subtaskPicker.appendChild(subtaskEmpty);
    subtaskPicker.appendChild(subtaskList);
    subtaskWrap.appendChild(subtaskPicker);

    var reasonInput = document.createElement('input');
    reasonInput.type = 'text';
    reasonInput.className = 'blocked-reason-input';
    reasonInput.placeholder = BLOCKED_REASON_PLACEHOLDER;
    reasonInput.setAttribute('aria-label', 'Cause du blocage');
    reasonInput.setAttribute('autocomplete', 'off');
    reasonInput.setAttribute('spellcheck', 'false');

    // Build suggestions DOM before TabAutocomplete.bind — bind() calls
    // onProposal synchronously during init, so suggestionsList must exist.
    var suggestions = document.createElement('div');
    suggestions.className = 'blocked-reason-suggestions';
    // Shown only while the user is typing a filter query.
    suggestions.hidden = true;

    var suggestionsLabel = document.createElement('div');
    suggestionsLabel.className = 'blocked-reason-suggestions-label';
    suggestionsLabel.textContent = BLOCKED_REASON_SUGGESTIONS_LABEL;

    var suggestionsList = document.createElement('div');
    suggestionsList.className = 'blocked-reason-suggestions-list';
    suggestionsList.setAttribute('role', 'list');

    suggestions.appendChild(suggestionsLabel);
    suggestions.appendChild(suggestionsList);

    var reasonTabCandidates = [];
    var reasonTabComplete = null;
    var reasonInputMount = reasonInput;
    if (global.TabAutocomplete && typeof global.TabAutocomplete.wrapField === 'function') {
      var reasonWrapped = global.TabAutocomplete.wrapField(reasonInput);
      reasonInputMount = reasonWrapped.wrap;
      reasonTabComplete = global.TabAutocomplete.bind({
        field: reasonInput,
        wrapEl: reasonWrapped.wrap,
        ghostEl: reasonWrapped.ghost,
        getCandidates: function () {
          return reasonTabCandidates.slice();
        },
        isEnabled: function () {
          return !reasonInput.disabled;
        },
        onProposal: function (proposal) {
          var target =
            proposal && proposal.candidate ? String(proposal.candidate.text || '') : '';
          if (!suggestionsList) return;
          Array.prototype.forEach.call(
            suggestionsList.querySelectorAll('.blocked-reason-suggestion'),
            function (btn) {
              var label = String(btn.dataset.reason || btn.textContent || '');
              var on = !!(target && label === target);
              btn.classList.toggle('is-tab-target', on);
              var hint = btn.querySelector('.tp-tab-hint');
              if (on && !hint) {
                var kbd = document.createElement('kbd');
                kbd.className = 'tp-tab-hint';
                kbd.textContent = 'Tab';
                btn.appendChild(kbd);
              } else if (!on && hint) {
                hint.remove();
              }
            }
          );
        }
      });
    }

    reasonWrap.appendChild(selectedWrap);
    reasonWrap.appendChild(subtaskWrap);
    reasonWrap.appendChild(reasonInputMount);
    reasonWrap.appendChild(suggestions);
    field.appendChild(reasonWrap);
    el.appendChild(field);

    function readReasons() {
      return currentReasons.slice();
    }

    function readLinks() {
      return currentLinks.slice();
    }

    function reasonKey(reason) {
      return blockedReasonStorageKey(reason);
    }

    function hasReason(reason) {
      var key = reasonKey(reason);
      if (!key) return false;
      for (var i = 0; i < currentReasons.length; i++) {
        if (reasonKey(currentReasons[i]) === key) return true;
      }
      return false;
    }

    function hasLinkId(id) {
      if (!id) return false;
      for (var i = 0; i < currentLinks.length; i++) {
        if (currentLinks[i] && currentLinks[i].id === id) return true;
      }
      return false;
    }

    function isWaitingOnTasks() {
      return isBlockedWaitingOtherTask(currentReasons) || currentLinks.length > 0;
    }

    function notifyReasonChange() {
      if (collapse) collapse.refreshSummary();
      onChange(getValue());
    }

    function ensureWaitingReason(options) {
      if (!hasReason(BLOCKED_REASON_WAITING_OTHER_TASK)) {
        if (!(options && options.trackFreq === false)) {
          bumpBlockedReasonFreq(BLOCKED_REASON_WAITING_OTHER_TASK);
        }
        currentReasons = currentReasons.concat([BLOCKED_REASON_WAITING_OTHER_TASK]);
      }
    }

    function addLink(nextLink) {
      var items = getSubtasks() || [];
      var next = normalizeBlockedLink(nextLink);
      if (!next) return;
      if (hasLinkId(next.id)) {
        refreshSelected();
        refreshSubtaskUi();
        return;
      }
      var item = findSubtaskById(items, next.id);
      if (item && item.text && !next.label) {
        next = Object.assign({}, next, { label: String(item.text).trim() });
      }
      ensureWaitingReason();
      currentLinks = currentLinks.concat([next]);
      // Linking a blocking subtask implies the card is blocked.
      if (embedded && !checked) {
        checked = true;
        field.classList.add('is-enabled');
      }
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
    }

    function removeLink(id) {
      if (!id) return;
      var next = [];
      for (var i = 0; i < currentLinks.length; i++) {
        if (currentLinks[i].id !== id) next.push(currentLinks[i]);
      }
      if (next.length === currentLinks.length) return;
      currentLinks = next;
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
    }

    function syncLinksWithReasons() {
      if (!isBlockedWaitingOtherTask(currentReasons) && currentLinks.length) {
        // Keep links only while the waiting-other reason (or residual links) applies.
        // Links alone still count as waiting; clearing the reason clears links.
        if (!hasReason(BLOCKED_REASON_WAITING_OTHER_TASK)) {
          currentLinks = [];
        }
      }
    }

    function addReason(value, options) {
      var next = normalizeBlockedReason(value);
      var trackFreq = !(options && options.trackFreq === false);
      var skipTaskCreate = !!(options && options.skipTaskCreate);
      if (!next || hasReason(next)) {
        refreshSelected();
        refreshSuggestions();
        refreshSubtaskUi();
        return;
      }
      if (trackFreq) bumpBlockedReasonFreq(next);
      currentReasons = currentReasons.concat([next]);
      // Motif implies the card is blocked (embedded Statut panel has no enable switch).
      if (embedded && !checked) {
        checked = true;
        field.classList.add('is-enabled');
      }
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
      // Waiting-on-another-task links existing Progrès items — do not invent a new one.
      if (
        !skipTaskCreate &&
        onBlockedReasonAdded &&
        next !== BLOCKED_REASON_WAITING_OTHER_TASK
      ) {
        try {
          onBlockedReasonAdded(next);
        } catch (err) {
          console.error('onBlockedReasonAdded failed', err);
        }
      }
    }

    function removeReason(value) {
      var key = reasonKey(value);
      if (!key) return;
      clearReasonSpellchecking(value);
      clearReasonSpellRevert(value);
      clearReasonSplitRevert(value);
      var next = [];
      for (var i = 0; i < currentReasons.length; i++) {
        if (reasonKey(currentReasons[i]) !== key) next.push(currentReasons[i]);
      }
      if (next.length === currentReasons.length) return;
      currentReasons = next;
      if (!isBlockedWaitingOtherTask(currentReasons)) {
        currentLinks = [];
      }
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
    }

    function renameReason(oldValue, newValue) {
      var oldKey = reasonKey(oldValue);
      if (!oldKey) return false;
      clearReasonSpellRevert(oldValue);
      var next = normalizeBlockedReason(newValue);
      if (!next) {
        refreshSelected();
        return false;
      }
      var newKey = reasonKey(next);
      var index = -1;
      for (var i = 0; i < currentReasons.length; i++) {
        if (reasonKey(currentReasons[i]) === oldKey) {
          index = i;
          break;
        }
      }
      if (index < 0) {
        refreshSelected();
        return false;
      }
      if (oldKey === newKey) {
        if (currentReasons[index] === next) {
          refreshSelected();
          return false;
        }
        currentReasons = currentReasons.slice();
        currentReasons[index] = next;
      } else {
        var duplicate = false;
        for (var j = 0; j < currentReasons.length; j++) {
          if (j !== index && reasonKey(currentReasons[j]) === newKey) {
            duplicate = true;
            break;
          }
        }
        if (duplicate) {
          // Renaming onto an existing chip: drop the edited one, keep the other.
          removeReason(oldValue);
          return true;
        }
        bumpBlockedReasonFreq(next);
        currentReasons = currentReasons.slice();
        currentReasons[index] = next;
        if (!isBlockedWaitingOtherTask(currentReasons)) {
          currentLinks = [];
        }
      }
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
      return true;
    }

    var finishReasonEdit = null;

    function beginEditReasonChip(reason) {
      if (typeof finishReasonEdit === 'function') {
        finishReasonEdit(true);
      }

      clearReasonSpellchecking(reason);
      clearReasonSpellRevert(reason);
      clearReasonSplitRevert(reason);

      var chip = null;
      var chips = selectedWrap.querySelectorAll('.blocked-reason-chip:not(.blocked-subtask-chip)');
      for (var c = 0; c < chips.length; c++) {
        if (chips[c].dataset.reason === reason) {
          chip = chips[c];
          break;
        }
      }
      if (!chip || chip.classList.contains('is-editing')) return;

      var textEl = chip.querySelector('.blocked-reason-chip-text');
      var editBtn = chip.querySelector('.blocked-reason-chip-edit');
      var clearBtn = chip.querySelector('.blocked-reason-chip-clear');
      if (!textEl || !clearBtn) return;

      chip.classList.remove('is-spellchecking');
      chip.removeAttribute('aria-busy');
      chip.classList.add('is-editing');
      textEl.hidden = true;
      if (editBtn) editBtn.hidden = true;
      var pendingSpinner = chip.querySelector('.blocked-reason-chip-spinner');
      if (pendingSpinner) pendingSpinner.remove();

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'blocked-reason-chip-input';
      input.value = reason;
      input.setAttribute('aria-label', BLOCKED_REASON_EDIT_LABEL);
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');

      var doneBtn = document.createElement('button');
      doneBtn.type = 'button';
      doneBtn.className = 'blocked-reason-chip-done';
      doneBtn.setAttribute('aria-label', BLOCKED_REASON_DONE_LABEL);
      doneBtn.title = BLOCKED_REASON_DONE_LABEL;
      doneBtn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>';

      chip.insertBefore(input, clearBtn);
      chip.insertBefore(doneBtn, clearBtn);
      input.focus();
      input.select();
      onLayoutChange();

      var finished = false;
      function finish(commit) {
        if (finished) return;
        finished = true;
        if (finishReasonEdit === finish) finishReasonEdit = null;
        if (!commit) {
          refreshSelected();
          onLayoutChange();
          return;
        }
        var rawValue = input.value;
        var pending = normalizeBlockedReason(rawValue);
        if (!pending) {
          refreshSelected();
          onLayoutChange();
          return;
        }
        // Commit immediately; split / spellcheck may refine asynchronously.
        // Skip refine when renaming onto an existing chip (merge/drop).
        // Do not defer/create unblock subtasks on rename — only fresh adds do.
        var mergingIntoExisting =
          reasonKey(pending) !== reasonKey(reason) && hasReason(pending);
        renameReason(reason, pending);
        if (!mergingIntoExisting && hasReason(pending)) {
          refineReasonAfterCommit(pending);
        }
      }
      finishReasonEdit = finish;

      doneBtn.addEventListener('mousedown', function (event) {
        event.preventDefault();
      });
      doneBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      });

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        }
      });
      input.addEventListener('blur', function () {
        setTimeout(function () {
          if (finished) return;
          finish(true);
        }, 0);
      });
    }

    function setReasons(value) {
      currentReasons = normalizeBlockedReasons(value);
      syncLinksWithReasons();
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      if (collapse) collapse.refreshSummary();
    }

    function refreshSelected() {
      while (selectedWrap.firstChild) selectedWrap.removeChild(selectedWrap.firstChild);
      var items = getSubtasks() || [];
      var hasAny = false;

      for (var i = 0; i < currentReasons.length; i++) {
        (function (reason) {
          // When linked tasks exist, their named chips replace the generic waiting reason.
          if (
            reason === BLOCKED_REASON_WAITING_OTHER_TASK &&
            currentLinks.length > 0
          ) {
            return;
          }
          hasAny = true;
          var chip = document.createElement('span');
          chip.className = 'blocked-reason-chip';
          chip.dataset.reason = reason;

          var text = document.createElement('span');
          text.className = 'blocked-reason-chip-text';
          text.textContent = reason;
          text.title = reason;

          var editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'blocked-reason-chip-edit';
          editBtn.setAttribute('aria-label', BLOCKED_REASON_EDIT_LABEL + ' : ' + reason);
          editBtn.title = BLOCKED_REASON_EDIT_LABEL;
          editBtn.innerHTML = '<i class="ti ti-pencil" aria-hidden="true"></i>';
          editBtn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            beginEditReasonChip(reason);
          });

          var clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'blocked-reason-chip-clear';
          clearBtn.setAttribute('aria-label', BLOCKED_REASON_CLEAR_LABEL + ' : ' + reason);
          clearBtn.textContent = '\u00d7';
          clearBtn.addEventListener('click', function () {
            if (typeof finishReasonEdit === 'function') finishReasonEdit(false);
            removeReason(reason);
            reasonInput.focus();
          });

          chip.appendChild(text);
          if (isReasonSpellchecking(reason)) {
            chip.classList.add('is-spellchecking');
            chip.setAttribute('aria-busy', 'true');
            var spinner = document.createElement('span');
            spinner.className = 'blocked-reason-chip-spinner';
            spinner.setAttribute('aria-hidden', 'true');
            spinner.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
            chip.appendChild(spinner);
          } else {
            var splitInfo = null;
            var splitAnchorKey = null;
            var splitKeys = Object.keys(reasonSplitReverts);
            for (var sk = 0; sk < splitKeys.length; sk++) {
              var splitEntry = reasonSplitReverts[splitKeys[sk]];
              if (
                splitEntry &&
                Array.isArray(splitEntry.reasons) &&
                reasonKey(splitEntry.reasons[0]) === reasonKey(reason)
              ) {
                splitInfo = splitEntry;
                splitAnchorKey = splitKeys[sk];
                break;
              }
            }
            var revertInfo =
              !splitInfo && reasonSpellReverts[reasonKey(reason)]
                ? reasonSpellReverts[reasonKey(reason)]
                : null;
            if (
              splitInfo &&
              splitAnchorKey &&
              splitInfo.original &&
              Array.isArray(splitInfo.reasons)
            ) {
              var splitCount = splitInfo.reasons.length;
              var splitPrevious = splitInfo.original;
              var splitTitle =
                'Annuler la s\u00e9paration \u2014 restaurer\u00a0: ' +
                (global.Spellcheck && typeof global.Spellcheck.revertLabel === 'function'
                  ? global.Spellcheck.revertLabel(splitPrevious)
                  : splitPrevious);
              var splitRevertBtn = document.createElement('button');
              splitRevertBtn.type = 'button';
              splitRevertBtn.className =
                'blocked-reason-chip-revert tp-spell-revert blocked-reason-chip-split-revert';
              splitRevertBtn.setAttribute(
                'aria-label',
                'Annuler la s\u00e9paration en ' + splitCount + ' causes'
              );
              splitRevertBtn.title = splitTitle;
              splitRevertBtn.innerHTML =
                '<i class="ti ti-arrow-back-up" aria-hidden="true"></i>';
              splitRevertBtn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                var still = (splitInfo.reasons || []).filter(function (r) {
                  return hasReason(r);
                });
                if (reasonSplitReverts[splitAnchorKey] === splitInfo) {
                  delete reasonSplitReverts[splitAnchorKey];
                }
                if (!still.length) {
                  refreshSelected();
                  onLayoutChange();
                  return;
                }
                for (var si = 0; si < still.length; si++) {
                  var stillKey = reasonKey(still[si]);
                  currentReasons = currentReasons.filter(function (r) {
                    return reasonKey(r) !== stillKey;
                  });
                }
                if (!hasReason(splitPrevious)) {
                  bumpBlockedReasonFreq(splitPrevious);
                  currentReasons = currentReasons.concat([splitPrevious]);
                }
                if (!isBlockedWaitingOtherTask(currentReasons)) {
                  currentLinks = [];
                }
                refreshSelected();
                refreshSuggestions();
                refreshSubtaskUi();
                notifyReasonChange();
                onLayoutChange();
              });
              chip.appendChild(splitRevertBtn);
            } else if (revertInfo && revertInfo.original) {
              var previousText = revertInfo.original;
              var revertTitle =
                global.Spellcheck && typeof global.Spellcheck.revertLabel === 'function'
                  ? global.Spellcheck.revertLabel(previousText)
                  : previousText;
              var revertBtn = document.createElement('button');
              revertBtn.type = 'button';
              revertBtn.className = 'blocked-reason-chip-revert tp-spell-revert';
              revertBtn.setAttribute(
                'aria-label',
                'Annuler la correction\u00a0: ' + revertTitle
              );
              revertBtn.title = revertTitle;
              revertBtn.innerHTML =
                '<i class="ti ti-arrow-back-up" aria-hidden="true"></i>';
              revertBtn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                clearReasonSpellRevert(reason);
                if (hasReason(reason)) {
                  renameReason(reason, previousText);
                } else {
                  refreshSelected();
                  onLayoutChange();
                }
              });
              chip.appendChild(revertBtn);
            }
          }
          chip.appendChild(editBtn);
          chip.appendChild(clearBtn);
          selectedWrap.appendChild(chip);
        })(currentReasons[i]);
      }

      // Link chips double typed motifs (reason create → blocked subtask → link).
      // Show them only when Motif has no explicit cause beyond waiting-other.
      var hasExplicitReasonChip = false;
      for (var er = 0; er < currentReasons.length; er++) {
        if (currentReasons[er] !== BLOCKED_REASON_WAITING_OTHER_TASK) {
          hasExplicitReasonChip = true;
          break;
        }
      }

      for (var li = 0; li < currentLinks.length; li++) {
        if (hasExplicitReasonChip) break;
        (function (link) {
          hasAny = true;
          var taskName = resolveBlockedLinkLabel(link, items);
          var chipLabel = formatBlockedWaitingOnLabel(taskName);
          var chip = document.createElement('span');
          chip.className = 'blocked-reason-chip blocked-subtask-chip';
          chip.dataset.subtaskId = link.id;

          var text = document.createElement('span');
          text.className = 'blocked-reason-chip-text';
          text.textContent = chipLabel;
          text.title = chipLabel;

          var clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'blocked-reason-chip-clear';
          clearBtn.setAttribute('aria-label', BLOCKED_SUBTASK_CLEAR_LABEL + ' : ' + taskName);
          clearBtn.textContent = '\u00d7';
          clearBtn.addEventListener('click', function () {
            removeLink(link.id);
            reasonInput.focus();
          });

          chip.appendChild(text);
          chip.appendChild(clearBtn);
          selectedWrap.appendChild(chip);
        })(currentLinks[li]);
      }

      selectedWrap.hidden = !hasAny;
      field.classList.toggle('has-blocked-reason', hasAny);
      field.classList.toggle('has-blocked-subtask-link', currentLinks.length > 0);
    }

    function refreshSuggestions() {
      var query = (reasonInput.value || '').trim();
      // Keep the list hidden until the user types — including when a reason
      // is already selected under Statut (no idle preset chips).
      var ranked = query
        ? rankBlockedReasonSuggestions({
            query: query,
            selected: currentReasons
          })
        : [];
      while (suggestionsList.firstChild) {
        suggestionsList.removeChild(suggestionsList.firstChild);
      }
      reasonTabCandidates = ranked.slice();
      for (var i = 0; i < ranked.length; i++) {
        (function (optionLabel) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'blocked-reason-suggestion';
          btn.setAttribute('role', 'listitem');
          btn.textContent = optionLabel;
          btn.dataset.reason = optionLabel;
          btn.addEventListener('click', function () {
            addReason(optionLabel);
            reasonInput.value = '';
            refreshSuggestions();
            reasonInput.focus();
          });
          suggestionsList.appendChild(btn);
        })(ranked[i]);
      }
      if (reasonTabComplete) reasonTabComplete.refresh();
      var wasHidden = suggestions.hidden;
      suggestions.hidden = ranked.length === 0;
      if (wasHidden !== suggestions.hidden) onLayoutChange();
    }

    function refreshSubtaskUi() {
      if (hideSubtaskPicker) {
        subtaskWrap.hidden = true;
        subtaskPicker.hidden = true;
        field.classList.remove('has-blocked-subtask-link');
        return;
      }
      var waiting = isWaitingOnTasks();
      var wasHidden = subtaskWrap.hidden;
      subtaskWrap.hidden = !waiting;
      if (!waiting) {
        subtaskPicker.hidden = true;
        field.classList.remove('has-blocked-subtask-link');
        if (wasHidden !== subtaskWrap.hidden) onLayoutChange();
        return;
      }

      var items = getSubtasks() || [];
      field.classList.toggle('has-blocked-subtask-link', currentLinks.length > 0);

      while (subtaskList.firstChild) subtaskList.removeChild(subtaskList.firstChild);
      var visibleCount = 0;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || !item.id || !item.text) continue;
        if (hasLinkId(item.id)) continue;
        var opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'blocked-reason-suggestion blocked-subtask-option';
        opt.setAttribute('role', 'listitem');
        opt.textContent = item.text;
        opt.dataset.subtaskId = item.id;
        opt.title = item.text;
        (function (subtaskId, subtaskText) {
          opt.addEventListener('click', function () {
            addLink({
              type: BLOCKED_LINK_TYPE_SUBTASK,
              id: subtaskId,
              label: subtaskText
            });
          });
        })(item.id, item.text);
        subtaskList.appendChild(opt);
        visibleCount += 1;
      }

      var empty = items.length === 0;
      subtaskEmpty.hidden = !empty;
      subtaskList.hidden = empty || visibleCount === 0;
      // Keep picker open for multi-select while waiting and options (or empty state) remain.
      subtaskPicker.hidden = !empty && visibleCount === 0;

      if (wasHidden !== subtaskWrap.hidden) onLayoutChange();
    }

    // Keep blockedReasons when disabling — only enAttente (enabled) drives badges.
    var collapse = null;
    var enableAllowed = true;
    if (!embedded) {
      collapse = bindCollapsibleEnable({
        field: field,
        body: reasonWrap,
        chrome: chrome,
        enabled: checked,
        expanded: config.expanded != null ? !!config.expanded : checked,
        getSummary: function () {
          var summary = capitalizeCountdownPhrase(
            formatBlockedReasonsSummary(currentReasons, {
              empty: BLOCKED_LABEL,
              links: currentLinks,
              items: getSubtasks() || []
            })
          );
          return summary + '\u2026';
        },
        onLayoutChange: onLayoutChange,
        onExpandChange: config.onExpandChange || null,
        onEnableChange: function () {
          onChange(collapse.isEnabled());
        }
      });
    }

    function setValue(value, options) {
      options = options || {};
      if (collapse) {
        var enableOpts = { notifyLayout: false };
        if (options.preserveCollapse) enableOpts.preserveCollapse = true;
        else enableOpts.expand = !!value;
        collapse.setEnabled(!!value, enableOpts);
        return;
      }
      var next = !!value;
      var changed = next !== checked;
      checked = next;
      field.classList.toggle('is-enabled', checked);
      if (changed) onChange(checked);
    }

    function getValue() {
      return collapse ? collapse.isEnabled() : checked;
    }

    function setBlockedReasons(value) {
      setReasons(value);
    }

    function getBlockedReasons() {
      // Always return draft reasons so disable does not wipe persistence.
      return readReasons();
    }

    // Legacy single-reason accessors (first reason / replace-all).
    function setBlockedReason(value) {
      if (value == null || value === '') {
        setReasons([]);
        return;
      }
      setReasons([value]);
    }

    function getBlockedReason() {
      return currentReasons.length ? currentReasons[0] : '';
    }

    function setBlockedLinks(value) {
      currentLinks = isWaitingOnTasks() || (Array.isArray(value) && value.length)
        ? normalizeBlockedLinks(value)
        : [];
      if (currentLinks.length) ensureWaitingReason({ trackFreq: false });
      if (!isBlockedWaitingOtherTask(currentReasons)) currentLinks = [];
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      if (collapse) collapse.refreshSummary();
    }

    function getBlockedLinks() {
      return isWaitingOnTasks() ? readLinks() : [];
    }

    // Legacy single-link accessors (first link / replace-all).
    function setBlockedLink(value) {
      if (value == null) {
        setBlockedLinks([]);
        return;
      }
      setBlockedLinks([value]);
    }

    function getBlockedLink() {
      var links = getBlockedLinks();
      return links.length ? links[0] : null;
    }

    function refreshSubtasks() {
      // Refresh stored labels from live subtask text when available.
      var items = getSubtasks() || [];
      var refreshed = [];
      for (var i = 0; i < currentLinks.length; i++) {
        var link = currentLinks[i];
        var item = findSubtaskById(items, link.id);
        if (item && item.text) {
          refreshed.push(
            Object.assign({}, link, { label: String(item.text).trim() })
          );
        } else {
          refreshed.push(link);
        }
      }
      currentLinks = refreshed;
      refreshSelected();
      refreshSubtaskUi();
      if (collapse) collapse.refreshSummary();
    }

    reasonInput.addEventListener('input', function () {
      refreshSuggestions();
    });

    reasonInput.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      var typed = normalizeBlockedReason(reasonInput.value);
      if (!typed) return;
      // Ingest immediately so Enter never freezes on AI refine.
      reasonInput.value = '';
      refreshSuggestions();
      if (!hasReason(typed)) {
        var deferTask = reasonMayBeCompound(typed);
        addReason(typed, { skipTaskCreate: deferTask });
        refineReasonAfterCommit(typed, { deferredTaskCreate: deferTask });
      }
      reasonInput.focus();
    });

    setBlockedReasons(
      config.blockedReasons != null ? config.blockedReasons : config.blockedReason
    );
    if (config.blockedLinks != null) {
      setBlockedLinks(config.blockedLinks);
    } else if (config.blockedLink) {
      setBlockedLink(config.blockedLink);
    }

    return {
      el: field,
      getValue: getValue,
      setValue: setValue,
      getBlockedReasons: getBlockedReasons,
      setBlockedReasons: setBlockedReasons,
      getBlockedReason: getBlockedReason,
      setBlockedReason: setBlockedReason,
      getBlockedLinks: getBlockedLinks,
      setBlockedLinks: setBlockedLinks,
      getBlockedLink: getBlockedLink,
      setBlockedLink: setBlockedLink,
      refreshSubtasks: refreshSubtasks,
      setEnabled: function (next) {
        setValue(next);
      },
      setEnableAllowed: collapse
        ? collapse.setEnableAllowed
        : function (allowed) {
            enableAllowed = allowed !== false;
          },
      isEnableAllowed: collapse
        ? collapse.isEnableAllowed
        : function () {
            return enableAllowed;
          },
      isEnabled: getValue,
      setExpanded: collapse
        ? collapse.setExpanded
        : function () {
            /* embedded: always open when visible */
          },
      isExpanded: collapse
        ? collapse.isExpanded
        : function () {
            return true;
          }
    };
  }

  function createDueDateField(config) {
    var el = config.el;
    var onChange = config.onChange || function () {};
    var onLayoutChange = config.onLayoutChange || function () {};
    var initialValue = config.value;
    var initialDate =
      initialValue && typeof initialValue === 'object'
        ? initialValue.dueDate
        : initialValue;
    var initialTime =
      initialValue && typeof initialValue === 'object'
        ? initialValue.dueTime
        : config.time;
    var current = normalizeDueDate(initialDate);
    var currentTime = current ? normalizeDueTime(initialTime) : '';
    var rememberedTime = currentTime || '';
    // Section is always on (no enable checkbox). dueEnabled tracks whether a
    // date is set — empty stays optional / visually quiet (no has-due-date).
    var enabled = true;
    var hasDueDateInitially = !!current && (
      initialValue && typeof initialValue === 'object' && initialValue.dueEnabled != null
        ? !!initialValue.dueEnabled
        : config.enabled != null
          ? !!config.enabled
          : true
    );
    if (!hasDueDateInitially) {
      current = '';
      currentTime = '';
    }
    var currentStart =
      initialValue && typeof initialValue === 'object'
        ? normalizeDueDate(initialValue.startDate)
        : '';
    var currentRecurrence = normalizeRecurrence(
      initialValue && typeof initialValue === 'object'
        ? initialValue.recurrence
        : null
    );
    var open = false;
    var timeOpen = false;
    var startOpen = false;
    var startViewYear;
    var startViewMonth;
    var startFocusIso =
      currentStart || toIsoDate(startOfLocalDay(new Date()));
    var viewYear;
    var viewMonth;
    var calendarMode = 'day'; /* day | date | month | year */
    var yearPickerStart = null;
    var focusIso = current || toIsoDate(startOfLocalDay(new Date()));
    var docListenersBound = false;
    var uid = 'due-cal-' + Math.random().toString(36).slice(2, 9);
    var bodyId = uid + '-body';
    var collapseApi = null;
    /* Calendar + time panels stay expanded whenever Échéance is enabled. */

    function syncViewFromValue(iso) {
      var date = dueDateToLocalDate(iso) || startOfLocalDay(new Date());
      viewYear = date.getFullYear();
      viewMonth = date.getMonth();
      focusIso = toIsoDate(date);
    }

    function syncStartViewFromValue(iso) {
      var date = dueDateToLocalDate(iso) || startOfLocalDay(new Date());
      startViewYear = date.getFullYear();
      startViewMonth = date.getMonth();
      startFocusIso = toIsoDate(date);
    }

    syncViewFromValue(current);
    syncStartViewFromValue(currentStart);

    var field = document.createElement('div');
    field.className = 'field field--due-date';

    var chrome = createCollapsibleEnableChrome({
      title: DUE_DATE_LABEL,
      bodyId: bodyId,
      hideEnable: true,
      leadingIcon: 'ti-calendar',
      iconClass: 'due-leading-icon',
      titleClass: 'due-date-title',
      collapseLabel: 'Replier \u00c9ch\u00e9ance',
      expandLabel: 'D\u00e9velopper \u00c9ch\u00e9ance'
    });
    chrome.title.id = uid + '-label';
    field.appendChild(chrome.head);

    var body = document.createElement('div');
    body.className = 'due-date-body section-toggle-body';
    body.id = bodyId;

    var countdown = document.createElement('div');
    countdown.className = 'due-date-countdown';
    countdown.id = uid + '-desc';
    countdown.setAttribute('aria-live', 'polite');
    countdown.hidden = true;

    var countdownPrimaryRow = document.createElement('div');
    countdownPrimaryRow.className = 'due-date-countdown-primary-row';
    var countdownDot = document.createElement('span');
    countdownDot.className = 'heat-tier-dot due-date-countdown-dot';
    countdownDot.setAttribute('aria-hidden', 'true');
    countdownDot.hidden = true;
    var countdownPrimary = document.createElement('div');
    countdownPrimary.className = 'due-date-countdown-primary';
    countdownPrimaryRow.appendChild(countdownDot);
    countdownPrimaryRow.appendChild(countdownPrimary);

    var countdownSecondary = document.createElement('div');
    countdownSecondary.className = 'due-date-countdown-secondary';

    countdown.appendChild(countdownPrimaryRow);
    countdown.appendChild(countdownSecondary);

    var pickers = document.createElement('div');
    pickers.className = 'due-date-pickers';

    var datePicker = document.createElement('div');
    datePicker.className = 'due-date-picker due-date-picker--calendar';

    var trigger = document.createElement('div');
    trigger.className = 'due-date-trigger';
    trigger.setAttribute('role', 'group');
    trigger.setAttribute('aria-labelledby', uid + '-label');
    trigger.setAttribute('aria-describedby', uid + '-desc');

    var triggerIcon = document.createElement('i');
    triggerIcon.className = 'ti ti-calendar due-date-trigger-icon';
    triggerIcon.setAttribute('aria-hidden', 'true');

    var triggerText = document.createElement('span');
    triggerText.className = 'due-date-trigger-text';

    var triggerTitle = document.createElement('span');
    triggerTitle.className = 'due-date-trigger-title';
    triggerTitle.textContent = DUE_DATE_BOX_LABEL;
    var triggerRecurringHint = document.createElement('span');
    triggerRecurringHint.className = 'due-date-trigger-hint';
    triggerRecurringHint.hidden = true;

    var triggerValue = document.createElement('span');
    triggerValue.className = 'due-date-trigger-value';

    triggerText.appendChild(triggerValue);
    triggerText.appendChild(triggerTitle);
    triggerText.appendChild(triggerRecurringHint);

    var dateTrashBtn = document.createElement('button');
    dateTrashBtn.type = 'button';
    dateTrashBtn.className = 'due-date-trigger-clear';
    dateTrashBtn.setAttribute('aria-label', DUE_DATE_CLEAR_LABEL);
    dateTrashBtn.title = DUE_DATE_CLEAR_LABEL;
    dateTrashBtn.hidden = true;
    dateTrashBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';

    trigger.appendChild(triggerIcon);
    trigger.appendChild(triggerText);
    trigger.appendChild(dateTrashBtn);

    datePicker.appendChild(trigger);

    var timePicker = document.createElement('div');
    timePicker.className = 'due-date-picker due-date-picker--time';

    var timeTrigger = document.createElement('div');
    timeTrigger.className = 'due-date-time-trigger';
    timeTrigger.setAttribute('role', 'group');
    timeTrigger.setAttribute('aria-label', DUE_DATE_TIME_LABEL);

    var timeIcon = document.createElement('i');
    timeIcon.className = 'ti ti-clock due-date-time-icon';
    timeIcon.setAttribute('aria-hidden', 'true');

    var timeTriggerText = document.createElement('span');
    timeTriggerText.className = 'due-date-time-trigger-text';

    var timeTitle = document.createElement('span');
    timeTitle.className = 'due-date-time-title';
    timeTitle.textContent = DUE_DATE_TIME_LABEL;
    var timeRecurringHint = document.createElement('span');
    timeRecurringHint.className = 'due-date-time-hint';
    timeRecurringHint.hidden = true;

    var timeValue = document.createElement('span');
    timeValue.className = 'due-date-time-value';

    timeTriggerText.appendChild(timeValue);
    timeTriggerText.appendChild(timeTitle);
    timeTriggerText.appendChild(timeRecurringHint);

    var timeTrashBtn = document.createElement('button');
    timeTrashBtn.type = 'button';
    timeTrashBtn.className = 'due-date-time-trigger-clear';
    timeTrashBtn.setAttribute('aria-label', DUE_DATE_TIME_CLEAR_LABEL);
    timeTrashBtn.title = DUE_DATE_TIME_CLEAR_LABEL;
    timeTrashBtn.hidden = true;
    timeTrashBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';

    timeTrigger.appendChild(timeIcon);
    timeTrigger.appendChild(timeTriggerText);
    timeTrigger.appendChild(timeTrashBtn);

    timePicker.appendChild(timeTrigger);

    pickers.appendChild(datePicker);
    pickers.appendChild(timePicker);

    var suggestions = document.createElement('div');
    suggestions.className = 'due-date-suggestions';
    suggestions.setAttribute('role', 'group');
    suggestions.setAttribute('aria-label', DUE_DATE_QUICK_SUGGESTIONS_LABEL);
    suggestions.hidden = !!current;

    DUE_DATE_QUICK_SUGGESTIONS.forEach(function (item) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'due-date-suggestion';
      chip.dataset.suggestion = item.id;
      chip.setAttribute(
        'aria-label',
        item.hint ? item.label + ', ' + item.hint : item.label
      );
      chip.hidden = !isDueDateQuickSuggestionAvailable(item.id);
      chip.innerHTML = dueDateQuickIconSvg(item.id);
      var chipBody = document.createElement('span');
      chipBody.className = 'due-date-suggestion-body';
      var chipLabel = document.createElement('span');
      chipLabel.className = 'due-date-suggestion-label';
      chipLabel.textContent = item.label;
      chipBody.appendChild(chipLabel);
      if (item.hint) {
        var chipHint = document.createElement('span');
        chipHint.className = 'due-date-suggestion-hint';
        chipHint.dataset.hint = item.hint;
        chipHint.textContent = normalizeDueTime(item.hint)
          ? formatDueTimeDisplay(item.hint)
          : item.hint;
        chipBody.appendChild(chipHint);
      }
      chip.appendChild(chipBody);
      chip.addEventListener('click', function () {
        applyQuickSuggestion(item.id);
      });
      suggestions.appendChild(chip);
    });

    body.appendChild(countdown);
    body.appendChild(pickers);

    // ── Start date (Début) ─────────────────────────────────────────────
    var startRow = document.createElement('div');
    startRow.className = 'due-date-start';

    var startPicker = document.createElement('div');
    startPicker.className = 'due-date-picker due-date-picker--start';

    var startTrigger = document.createElement('div');
    startTrigger.className = 'due-date-trigger due-date-trigger--start';
    startTrigger.setAttribute('role', 'button');
    startTrigger.setAttribute('tabindex', '0');
    startTrigger.setAttribute('aria-expanded', 'false');
    startTrigger.setAttribute('aria-haspopup', 'dialog');
    startTrigger.setAttribute('aria-label', DUE_DATE_START_LABEL);

    var startTriggerIcon = document.createElement('i');
    startTriggerIcon.className = 'ti ti-flag due-date-trigger-icon';
    startTriggerIcon.setAttribute('aria-hidden', 'true');

    var startTriggerText = document.createElement('span');
    startTriggerText.className = 'due-date-trigger-text';
    var startTriggerValue = document.createElement('span');
    startTriggerValue.className = 'due-date-trigger-value is-placeholder';
    startTriggerValue.textContent = DUE_DATE_START_PLACEHOLDER;
    var startTriggerTitle = document.createElement('span');
    startTriggerTitle.className = 'due-date-trigger-title';
    startTriggerTitle.textContent = DUE_DATE_START_LABEL;
    startTriggerText.appendChild(startTriggerValue);
    startTriggerText.appendChild(startTriggerTitle);

    var startChevron = document.createElement('i');
    startChevron.className = 'ti ti-chevron-down due-date-trigger-chevron';
    startChevron.setAttribute('aria-hidden', 'true');

    var startTrashBtn = document.createElement('button');
    startTrashBtn.type = 'button';
    startTrashBtn.className = 'due-date-trigger-clear';
    startTrashBtn.setAttribute('aria-label', DUE_DATE_START_CLEAR_LABEL);
    startTrashBtn.title = DUE_DATE_START_CLEAR_LABEL;
    startTrashBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    startTrashBtn.hidden = !currentStart;

    startTrigger.appendChild(startTriggerIcon);
    startTrigger.appendChild(startTriggerText);
    startTrigger.appendChild(startChevron);
    startTrigger.appendChild(startTrashBtn);
    startPicker.appendChild(startTrigger);

    var startPopover = document.createElement('div');
    startPopover.className = 'due-date-popover due-date-popover--start';
    startPopover.hidden = true;
    startPopover.setAttribute('role', 'dialog');
    startPopover.setAttribute('aria-label', DUE_DATE_START_LABEL);

    var startNav = document.createElement('div');
    startNav.className = 'due-date-nav';
    var startPrevBtn = document.createElement('button');
    startPrevBtn.type = 'button';
    startPrevBtn.className = 'due-date-nav-btn';
    startPrevBtn.setAttribute('aria-label', DUE_DATE_PREV_MONTH);
    startPrevBtn.innerHTML = '<i class="ti ti-chevron-left" aria-hidden="true"></i>';
    var startMonthLabel = document.createElement('span');
    startMonthLabel.className = 'due-date-month-label';
    var startNextBtn = document.createElement('button');
    startNextBtn.type = 'button';
    startNextBtn.className = 'due-date-nav-btn';
    startNextBtn.setAttribute('aria-label', DUE_DATE_NEXT_MONTH);
    startNextBtn.innerHTML = '<i class="ti ti-chevron-right" aria-hidden="true"></i>';
    startNav.appendChild(startPrevBtn);
    startNav.appendChild(startMonthLabel);
    startNav.appendChild(startNextBtn);
    startPopover.appendChild(startNav);

    var startWeekdays = document.createElement('div');
    startWeekdays.className = 'due-date-weekdays';
    startWeekdays.setAttribute('aria-hidden', 'true');
    DUE_DATE_WEEKDAYS.forEach(function (labelText, index) {
      var cell = document.createElement('span');
      cell.className = 'due-date-weekday';
      cell.textContent = labelText;
      cell.title = DUE_DATE_WEEKDAY_NAMES[index];
      startWeekdays.appendChild(cell);
    });
    startPopover.appendChild(startWeekdays);

    var startGrid = document.createElement('div');
    startGrid.className = 'due-date-grid';
    startGrid.setAttribute('role', 'grid');
    startPopover.appendChild(startGrid);

    var startFooter = document.createElement('div');
    startFooter.className = 'due-date-footer';
    var startTodayBtn = document.createElement('button');
    startTodayBtn.type = 'button';
    startTodayBtn.className = 'due-date-today';
    startTodayBtn.textContent = DUE_DATE_TODAY_LABEL;
    startFooter.appendChild(startTodayBtn);
    startPopover.appendChild(startFooter);
    startPicker.appendChild(startPopover);
    startRow.appendChild(startPicker);

    // ── Recurring (beside start date) ──────────────────────────────────
    var recurringRow = document.createElement('div');
    recurringRow.className = 'due-date-recurring';

    var recurringHead = document.createElement('div');
    recurringHead.className = 'due-date-recurring-head';
    var recurringIcon = document.createElement('i');
    recurringIcon.className = 'ti ti-repeat due-date-recurring-icon';
    recurringIcon.setAttribute('aria-hidden', 'true');
    var recurringTitle = document.createElement('span');
    recurringTitle.className = 'due-date-recurring-title';
    recurringTitle.textContent = DUE_DATE_RECURRING_LABEL;
    var recurringClearBtn = document.createElement('button');
    recurringClearBtn.type = 'button';
    recurringClearBtn.className = 'due-date-recurring-clear';
    recurringClearBtn.setAttribute('aria-label', DUE_DATE_RECURRING_CLEAR_LABEL);
    recurringClearBtn.title = DUE_DATE_RECURRING_CLEAR_LABEL;
    recurringClearBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    recurringClearBtn.hidden = !currentRecurrence;
    recurringHead.appendChild(recurringIcon);
    recurringHead.appendChild(recurringTitle);
    recurringHead.appendChild(recurringClearBtn);

    var recurringSelect = document.createElement('select');
    recurringSelect.className = 'due-date-recurring-select';
    recurringSelect.setAttribute('aria-label', DUE_DATE_RECURRING_LABEL);
    [
      { value: '', label: DUE_DATE_RECURRING_NONE },
      { value: 'daily', label: DUE_DATE_RECURRING_DAILY },
      { value: 'weekly', label: DUE_DATE_RECURRING_WEEKLY },
      { value: 'monthly', label: DUE_DATE_RECURRING_MONTHLY },
      { value: 'yearly', label: DUE_DATE_RECURRING_YEARLY }
    ].forEach(function (opt) {
      var option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      recurringSelect.appendChild(option);
    });
    recurringSelect.value = currentRecurrence ? currentRecurrence.frequency : '';

    var recurringWeekdays = document.createElement('div');
    recurringWeekdays.className = 'due-date-recurring-weekdays';
    recurringWeekdays.setAttribute('role', 'group');
    recurringWeekdays.setAttribute('aria-label', 'Jours de la semaine');
    recurringWeekdays.hidden =
      !currentRecurrence || currentRecurrence.frequency !== 'weekly';

    var weekdayShort = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    for (var wd = 0; wd < 7; wd++) {
      (function (dayIndex) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'due-date-recurring-weekday';
        chip.dataset.day = String(dayIndex);
        chip.textContent = weekdayShort[dayIndex];
        chip.title = DUE_DATE_WEEKDAY_NAMES[dayIndex];
        chip.setAttribute('aria-pressed', 'false');
        chip.addEventListener('click', function () {
          toggleRecurrenceWeekday(dayIndex);
        });
        recurringWeekdays.appendChild(chip);
      })(wd);
    }

    var recurringIntervalWrap = document.createElement('div');
    recurringIntervalWrap.className = 'due-date-recurring-interval';
    recurringIntervalWrap.hidden = true;
    var recurringIntervalLabel = document.createElement('label');
    recurringIntervalLabel.className = 'due-date-recurring-interval-label';
    recurringIntervalLabel.textContent = 'Tous les';
    var recurringIntervalInput = document.createElement('input');
    recurringIntervalInput.type = 'number';
    recurringIntervalInput.className = 'due-date-recurring-interval-input';
    recurringIntervalInput.min = '1';
    recurringIntervalInput.max = '99';
    recurringIntervalInput.value = String(
      (currentRecurrence && currentRecurrence.interval) || 1
    );
    recurringIntervalInput.setAttribute('aria-label', 'Intervalle de r\u00e9p\u00e9tition');
    recurringIntervalWrap.appendChild(recurringIntervalLabel);
    recurringIntervalWrap.appendChild(recurringIntervalInput);

    var recurringTimeWrap = document.createElement('div');
    recurringTimeWrap.className = 'due-date-recurring-time';
    recurringTimeWrap.hidden = !currentRecurrence;
    var recurringTimeLabel = document.createElement('label');
    recurringTimeLabel.className = 'due-date-recurring-time-label';
    recurringTimeLabel.textContent = '\u00c0';
    var recurringTimeInput = document.createElement('input');
    recurringTimeInput.type = 'time';
    recurringTimeInput.className = 'due-date-recurring-time-input';
    recurringTimeInput.step = '300';
    recurringTimeInput.value = currentTime || rememberedTime || DUE_DATE_TIME_DEFAULT;
    recurringTimeInput.setAttribute('aria-label', 'Heure de r\u00e9p\u00e9tition');
    var recurringTimeHint = document.createElement('span');
    recurringTimeHint.className = 'due-date-recurring-time-hint';
    recurringTimeHint.textContent = 'Le rappel revient \u00e0 cette heure.';
    recurringTimeWrap.appendChild(recurringTimeLabel);
    recurringTimeWrap.appendChild(recurringTimeInput);
    recurringTimeWrap.appendChild(recurringTimeHint);

    recurringRow.appendChild(recurringHead);
    recurringRow.appendChild(recurringSelect);
    recurringRow.appendChild(recurringWeekdays);
    recurringRow.appendChild(recurringIntervalWrap);
    recurringRow.appendChild(recurringTimeWrap);
    startRow.appendChild(recurringRow);
    body.appendChild(startRow);

    var timePopover = document.createElement('div');
    timePopover.className = 'due-date-time-popover';
    timePopover.id = uid + '-time-popover';
    timePopover.hidden = true;
    timePopover.setAttribute('role', 'dialog');
    timePopover.setAttribute('aria-modal', 'false');
    timePopover.setAttribute('aria-label', DUE_DATE_TIME_PICKER_LABEL);

    var timePeriodsSection = document.createElement('div');
    timePeriodsSection.className = 'due-date-time-section';

    var timePeriods = document.createElement('div');
    timePeriods.className = 'due-date-time-chips due-date-time-chips--periods';
    timePeriods.setAttribute('role', 'group');
    timePeriods.setAttribute('aria-label', DUE_DATE_TIME_SUGGESTIONS_LABEL);

    DUE_DATE_TIME_PERIODS.forEach(function (period) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'due-date-time-chip due-date-time-chip--period';
      chip.dataset.time = period.time;
      chip.dataset.period = period.id;
      chip.setAttribute('aria-pressed', 'false');
      chip.innerHTML = dueTimePeriodIconSvg(period.id);
      var chipBody = document.createElement('span');
      chipBody.className = 'due-date-time-chip-body';
      var chipLabel = document.createElement('span');
      chipLabel.className = 'due-date-time-chip-label';
      chipLabel.textContent = period.label;
      var chipTime = document.createElement('span');
      chipTime.className = 'due-date-time-chip-time';
      chipBody.appendChild(chipLabel);
      chipBody.appendChild(chipTime);
      chip.appendChild(chipBody);
      chip.addEventListener('click', function () {
        selectTime(period.time);
        setDialMode('hour');
      });
      timePeriods.appendChild(chip);
    });

    timePeriodsSection.appendChild(timePeriods);
    timePopover.appendChild(timePeriodsSection);

    var dialMode = 'hour';
    var dialHour = 8;
    var dialMinute = 0;
    var dialDragging = false;

    var timeDialSection = document.createElement('div');
    timeDialSection.className = 'due-date-time-section due-date-time-section--dial';

    var timeDialHeader = document.createElement('div');
    timeDialHeader.className = 'due-date-time-dial-header';

    var digitalGroup = document.createElement('div');
    digitalGroup.className = 'due-date-time-digital';
    digitalGroup.setAttribute('role', 'group');
    digitalGroup.setAttribute('aria-label', DUE_DATE_TIME_DIAL_LABEL);

    var digitalHourInput = document.createElement('input');
    digitalHourInput.type = 'text';
    digitalHourInput.className = 'due-date-time-digital-part due-date-time-digital-part--hour is-active';
    digitalHourInput.setAttribute('aria-label', DUE_DATE_TIME_HOURS_ARIA);
    digitalHourInput.setAttribute('aria-pressed', 'true');
    digitalHourInput.setAttribute('inputmode', 'numeric');
    digitalHourInput.setAttribute('autocomplete', 'off');
    digitalHourInput.setAttribute('spellcheck', 'false');
    digitalHourInput.setAttribute('maxlength', '2');
    digitalHourInput.value = pad2(dialHour);

    var digitalColon = document.createElement('span');
    digitalColon.className = 'due-date-time-digital-colon';
    digitalColon.textContent = ':';
    digitalColon.setAttribute('aria-hidden', 'true');

    var digitalMinuteInput = document.createElement('input');
    digitalMinuteInput.type = 'text';
    digitalMinuteInput.className = 'due-date-time-digital-part due-date-time-digital-part--minute';
    digitalMinuteInput.setAttribute('aria-label', DUE_DATE_TIME_MINUTES_ARIA);
    digitalMinuteInput.setAttribute('aria-pressed', 'false');
    digitalMinuteInput.setAttribute('inputmode', 'numeric');
    digitalMinuteInput.setAttribute('autocomplete', 'off');
    digitalMinuteInput.setAttribute('spellcheck', 'false');
    digitalMinuteInput.setAttribute('maxlength', '2');
    digitalMinuteInput.value = pad2(dialMinute);

    digitalGroup.appendChild(digitalHourInput);
    digitalGroup.appendChild(digitalColon);
    digitalGroup.appendChild(digitalMinuteInput);

    var meridiemGroup = document.createElement('div');
    meridiemGroup.className = 'due-date-time-meridiem';
    meridiemGroup.setAttribute('role', 'group');
    meridiemGroup.setAttribute('aria-label', DUE_DATE_TIME_MERIDIEM_ARIA);

    var amBtn = document.createElement('button');
    amBtn.type = 'button';
    amBtn.className = 'due-date-time-meridiem-btn';
    amBtn.dataset.meridiem = 'am';
    amBtn.textContent = DUE_DATE_TIME_AM_LABEL;
    amBtn.setAttribute('aria-pressed', 'false');

    var pmBtn = document.createElement('button');
    pmBtn.type = 'button';
    pmBtn.className = 'due-date-time-meridiem-btn';
    pmBtn.dataset.meridiem = 'pm';
    pmBtn.textContent = DUE_DATE_TIME_PM_LABEL;
    pmBtn.setAttribute('aria-pressed', 'false');

    meridiemGroup.appendChild(amBtn);
    meridiemGroup.appendChild(pmBtn);
    timeDialHeader.appendChild(digitalGroup);
    timeDialHeader.appendChild(meridiemGroup);

    var clockFace = document.createElement('div');
    clockFace.className = 'due-date-time-clock';
    clockFace.setAttribute('role', 'slider');
    clockFace.setAttribute('aria-label', DUE_DATE_TIME_DIAL_LABEL);
    clockFace.setAttribute('tabindex', '0');
    clockFace.style.width = DUE_DATE_TIME_CLOCK_SIZE + 'px';
    clockFace.style.height = DUE_DATE_TIME_CLOCK_SIZE + 'px';

    var clockHand = document.createElement('div');
    clockHand.className = 'due-date-time-clock-hand';
    clockHand.setAttribute('aria-hidden', 'true');
    var clockThumb = document.createElement('div');
    clockThumb.className = 'due-date-time-clock-thumb';
    clockHand.appendChild(clockThumb);

    var clockCenter = document.createElement('div');
    clockCenter.className = 'due-date-time-clock-center';
    clockCenter.setAttribute('aria-hidden', 'true');

    var clockNums = document.createElement('div');
    clockNums.className = 'due-date-time-clock-nums';

    clockFace.appendChild(clockHand);
    clockFace.appendChild(clockCenter);
    clockFace.appendChild(clockNums);

    var clockModeLabel = document.createElement('div');
    clockModeLabel.className = 'due-date-time-clock-mode';
    clockModeLabel.setAttribute('aria-live', 'polite');
    clockModeLabel.textContent = DUE_DATE_TIME_MODE_HOUR_LABEL;

    timeDialSection.appendChild(clockFace);
    timeDialSection.appendChild(clockModeLabel);
    timeDialSection.appendChild(timeDialHeader);
    timePopover.appendChild(timeDialSection);

    var popover = document.createElement('div');
    popover.className = 'due-date-popover';
    popover.id = uid + '-popover';
    popover.hidden = true;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'false');
    popover.setAttribute('aria-label', DUE_DATE_CALENDAR_LABEL);

    var nav = document.createElement('div');
    nav.className = 'due-date-nav';

    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'due-date-nav-btn';
    prevBtn.setAttribute('aria-label', DUE_DATE_PREV_MONTH);
    prevBtn.innerHTML = '<i class="ti ti-chevron-left" aria-hidden="true"></i>';

    var monthLabel = document.createElement('div');
    monthLabel.className = 'due-date-month-label';
    monthLabel.id = uid + '-month';
    monthLabel.setAttribute('aria-live', 'polite');

    var dayPickBtn = document.createElement('button');
    dayPickBtn.type = 'button';
    dayPickBtn.className = 'due-date-day-pick';
    dayPickBtn.setAttribute('aria-label', DUE_DATE_PICK_DAY_LABEL);
    dayPickBtn.setAttribute('aria-expanded', 'false');

    var monthPickBtn = document.createElement('button');
    monthPickBtn.type = 'button';
    monthPickBtn.className = 'due-date-month-pick';
    monthPickBtn.setAttribute('aria-label', DUE_DATE_PICK_MONTH_LABEL);
    monthPickBtn.setAttribute('aria-expanded', 'false');

    var yearPickBtn = document.createElement('button');
    yearPickBtn.type = 'button';
    yearPickBtn.className = 'due-date-year-pick';
    yearPickBtn.setAttribute('aria-label', DUE_DATE_PICK_YEAR_LABEL);
    yearPickBtn.setAttribute('aria-expanded', 'false');

    monthLabel.appendChild(dayPickBtn);
    monthLabel.appendChild(monthPickBtn);
    monthLabel.appendChild(yearPickBtn);

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'due-date-nav-btn';
    nextBtn.setAttribute('aria-label', DUE_DATE_NEXT_MONTH);
    nextBtn.innerHTML = '<i class="ti ti-chevron-right" aria-hidden="true"></i>';

    nav.appendChild(prevBtn);
    nav.appendChild(monthLabel);
    nav.appendChild(nextBtn);
    popover.appendChild(nav);

    var weekdays = document.createElement('div');
    weekdays.className = 'due-date-weekdays';
    weekdays.setAttribute('aria-hidden', 'true');
    DUE_DATE_WEEKDAYS.forEach(function (labelText, index) {
      var cell = document.createElement('span');
      cell.className = 'due-date-weekday';
      cell.textContent = labelText;
      cell.title = DUE_DATE_WEEKDAY_NAMES[index];
      weekdays.appendChild(cell);
    });
    popover.appendChild(weekdays);

    var grid = document.createElement('div');
    grid.className = 'due-date-grid';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-labelledby', uid + '-month');
    popover.appendChild(grid);

    var footer = document.createElement('div');
    footer.className = 'due-date-footer';

    var todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.className = 'due-date-today';
    todayBtn.textContent = DUE_DATE_TODAY_LABEL;

    footer.appendChild(todayBtn);
    popover.appendChild(footer);

    /* Calendar under Date, time under Heure — side-by-side columns. */
    datePicker.appendChild(popover);
    timePicker.appendChild(timePopover);

    /* Suggestions sit above section-toggle-shell (wraps body in bindCollapsibleEnable). */
    field.appendChild(suggestions);
    field.appendChild(body);
    el.appendChild(field);

    function notifyLayout() {
      requestAnimationFrame(function () {
        onLayoutChange();
      });
    }

    function ensureDueDateForTime() {
      if (current) return false;
      current = toIsoDate(startOfLocalDay(new Date()));
      focusIso = current;
      syncViewFromValue(current);
      return true;
    }

    function refreshPeriodChipLabels() {
      var periodChips = timePeriods.querySelectorAll('[data-time]');
      for (var i = 0; i < periodChips.length; i++) {
        var chip = periodChips[i];
        var hhmm = chip.dataset.time || '';
        var display = formatDueTimeDisplay(hhmm) || hhmm;
        var timeEl = chip.querySelector('.due-date-time-chip-time');
        if (timeEl) timeEl.textContent = display;
        var period = matchDueTimePeriod(hhmm);
        var labelIso = current || toIsoDate(startOfLocalDay(new Date()));
        var label = period
          ? formatDueTimePeriodLabel(period, labelIso)
          : '';
        var labelEl = chip.querySelector('.due-date-time-chip-label');
        if (labelEl && label) labelEl.textContent = label;
        chip.setAttribute(
          'aria-label',
          label ? label + ', ' + display : display
        );
      }
      var hintEls = suggestions.querySelectorAll('.due-date-suggestion-hint[data-hint]');
      for (var h = 0; h < hintEls.length; h++) {
        var rawHint = hintEls[h].dataset.hint || '';
        hintEls[h].textContent = normalizeDueTime(rawHint)
          ? formatDueTimeDisplay(rawHint)
          : rawHint;
      }
    }

    function applyClockFormatUi() {
      var h12 = isHour12();
      meridiemGroup.hidden = !h12;
      clockFace.classList.toggle('is-hour12', h12);
      timePopover.classList.toggle('is-hour12', h12);
      refreshPeriodChipLabels();
    }

    function refreshTimeRow() {
      /* Date + Heure stay fully enabled/visible whenever Échéance is on. */
      pickers.classList.toggle('has-time', !!currentTime);
      pickers.classList.toggle('has-date', !!current);
      field.classList.toggle('is-time-open', timeOpen);
      applyClockFormatUi();
      timeTitle.textContent = formatDueTimeTriggerTitle(current, currentTime);
      if (currentTime) {
        timeValue.textContent = formatDueTimeDisplay(currentTime);
        timeValue.classList.remove('is-placeholder');
        timeTrigger.classList.add('has-value');
        timeTrashBtn.hidden = false;
      } else {
        timeValue.textContent = DUE_DATE_TIME_PLACEHOLDER;
        timeValue.classList.add('is-placeholder');
        timeTrigger.classList.remove('has-value');
        timeTrashBtn.hidden = true;
      }
      if (timeOpen) syncTimePickerSelection();
    }

    function parseDialTime(hhmm) {
      var normalized = normalizeDueTime(hhmm) || DUE_DATE_TIME_DEFAULT;
      var parts = normalized.split(':');
      return { hour: +parts[0], minute: +parts[1] };
    }

    function dialHhmm() {
      return pad2(dialHour) + ':' + pad2(dialMinute);
    }

    function setDialMode(mode) {
      dialMode = mode === 'minute' ? 'minute' : 'hour';
      digitalHourInput.classList.toggle('is-active', dialMode === 'hour');
      digitalMinuteInput.classList.toggle('is-active', dialMode === 'minute');
      digitalHourInput.setAttribute('aria-pressed', dialMode === 'hour' ? 'true' : 'false');
      digitalMinuteInput.setAttribute('aria-pressed', dialMode === 'minute' ? 'true' : 'false');
      clockFace.dataset.mode = dialMode;
      clockModeLabel.textContent = dialMode === 'minute'
        ? DUE_DATE_TIME_MODE_MINUTE_LABEL
        : DUE_DATE_TIME_MODE_HOUR_LABEL;
      renderClockFace();
    }

    function digitsOnly(value, maxLen) {
      return String(value || '').replace(/\D/g, '').slice(0, maxLen);
    }

    function parseDigitalPart(value, min, max, fallback) {
      var digits = digitsOnly(value, 2);
      if (!digits) return fallback;
      var n = parseInt(digits, 10);
      if (isNaN(n)) return fallback;
      if (n < min) n = min;
      if (n > max) n = max;
      return n;
    }

    function digitalHourDisplayValue() {
      if (!isHour12()) return pad2(dialHour);
      return pad2(hour24ToHour12Parts(dialHour).hour12);
    }

    function commitDigitalHour(opts) {
      var advance = !!(opts && opts.advance);
      if (isHour12()) {
        var hour12 = parseDigitalPart(
          digitalHourInput.value,
          1,
          12,
          hour24ToHour12Parts(dialHour).hour12
        );
        dialHour = hour12PartsToHour24(hour12, dialHour >= 12);
        digitalHourInput.value = pad2(hour12);
      } else {
        dialHour = parseDigitalPart(digitalHourInput.value, 0, 23, dialHour);
        digitalHourInput.value = pad2(dialHour);
      }
      commitDialTime(false);
      if (advance) {
        setDialMode('minute');
        digitalMinuteInput.focus();
        digitalMinuteInput.select();
      }
    }

    function commitDigitalMinute() {
      var next = parseDigitalPart(digitalMinuteInput.value, 0, 59, dialMinute);
      dialMinute = next;
      digitalMinuteInput.value = pad2(dialMinute);
      commitDialTime(false);
    }

    function commitDigitalEdits() {
      if (document.activeElement === digitalHourInput) commitDigitalHour();
      else if (document.activeElement === digitalMinuteInput) commitDigitalMinute();
    }

    function setMeridiem(nextPm) {
      var isPm = dialHour >= 12;
      if (nextPm === isPm) return;
      dialHour = nextPm ? (dialHour % 12) + 12 : dialHour % 12;
      commitDialTime(false);
    }

    function commitDialTime() {
      selectTime(dialHhmm());
    }

    function clockAngleDeg(value, max) {
      return (value / max) * 360;
    }

    function renderClockFace() {
      clockNums.textContent = '';
      var cx = DUE_DATE_TIME_CLOCK_SIZE / 2;
      var h12Mode = isHour12();
      var selected = dialMode === 'hour' ? dialHour : dialMinute;
      var angle;
      var radius;
      var valueText;

      if (dialMode === 'hour') {
        if (h12Mode) {
          var selected12 = hour24ToHour12Parts(dialHour).hour12;
          for (var n = 1; n <= 12; n++) {
            var hour12Btn = document.createElement('button');
            hour12Btn.type = 'button';
            hour12Btn.className =
              'due-date-time-clock-num due-date-time-clock-num--outer due-date-time-clock-num--h12';
            hour12Btn.textContent = String(n);
            hour12Btn.dataset.hour12 = String(n);
            hour12Btn.setAttribute('aria-label', n + ' h');
            if (n === selected12) hour12Btn.classList.add('is-selected');
            var h12Angle = clockAngleDeg(n % 12, 12);
            hour12Btn.style.left = cx + 'px';
            hour12Btn.style.top = cx + 'px';
            hour12Btn.style.transform =
              'rotate(' +
              h12Angle +
              'deg) translateY(-' +
              DUE_DATE_TIME_CLOCK_OUTER_R +
              'px) rotate(-' +
              h12Angle +
              'deg)';
            hour12Btn.addEventListener('click', function (ev) {
              ev.stopPropagation();
              dialHour = hour12PartsToHour24(+this.dataset.hour12, dialHour >= 12);
              commitDialTime(false);
              setDialMode('minute');
            });
            clockNums.appendChild(hour12Btn);
          }
          angle = clockAngleDeg(selected12 % 12, 12);
          radius = DUE_DATE_TIME_CLOCK_OUTER_R;
          valueText = selected12 + ' heures';
        } else {
          for (var h = 0; h < 24; h++) {
            var hourBtn = document.createElement('button');
            hourBtn.type = 'button';
            hourBtn.className =
              'due-date-time-clock-num' +
              (h >= 12
                ? ' due-date-time-clock-num--outer'
                : ' due-date-time-clock-num--inner');
            hourBtn.textContent = pad2(h);
            hourBtn.dataset.value = String(h);
            hourBtn.setAttribute('aria-label', pad2(h) + ' h');
            if (h === dialHour) hourBtn.classList.add('is-selected');
            var hourAngle = clockAngleDeg(h % 12, 12);
            var hourRadius =
              h >= 12 ? DUE_DATE_TIME_CLOCK_OUTER_R : DUE_DATE_TIME_CLOCK_INNER_R;
            hourBtn.style.left = cx + 'px';
            hourBtn.style.top = cx + 'px';
            hourBtn.style.transform =
              'rotate(' +
              hourAngle +
              'deg) translateY(-' +
              hourRadius +
              'px) rotate(-' +
              hourAngle +
              'deg)';
            hourBtn.addEventListener('click', function (ev) {
              ev.stopPropagation();
              dialHour = +this.dataset.value;
              commitDialTime(false);
              setDialMode('minute');
            });
            clockNums.appendChild(hourBtn);
          }
          angle = clockAngleDeg(dialHour % 12, 12);
          radius =
            dialHour >= 12
              ? DUE_DATE_TIME_CLOCK_OUTER_R
              : DUE_DATE_TIME_CLOCK_INNER_R;
          valueText = pad2(dialHour) + ' heures';
        }
      } else {
        DUE_DATE_TIME_MINUTE_STEPS.forEach(function (m) {
          var minuteBtn = document.createElement('button');
          minuteBtn.type = 'button';
          minuteBtn.className = 'due-date-time-clock-num due-date-time-clock-num--minute';
          minuteBtn.textContent = pad2(m);
          minuteBtn.dataset.value = String(m);
          minuteBtn.setAttribute('aria-label', pad2(m) + ' min');
          if (m === dialMinute) minuteBtn.classList.add('is-selected');
          var minuteAngle = clockAngleDeg(m, 60);
          minuteBtn.style.left = cx + 'px';
          minuteBtn.style.top = cx + 'px';
          minuteBtn.style.transform =
            'rotate(' + minuteAngle + 'deg) translateY(-' + DUE_DATE_TIME_CLOCK_MINUTE_R +
            'px) rotate(-' + minuteAngle + 'deg)';
          minuteBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            dialMinute = +this.dataset.value;
            commitDialTime(false);
          });
          clockNums.appendChild(minuteBtn);
        });
        angle = clockAngleDeg(dialMinute, 60);
        radius = DUE_DATE_TIME_CLOCK_MINUTE_R;
        valueText = pad2(dialMinute) + ' minutes';
      }

      clockHand.style.transform = 'rotate(' + angle + 'deg)';
      clockHand.style.setProperty('--hand-length', radius + 'px');
      clockFace.setAttribute('aria-valuenow', String(selected));
      clockFace.setAttribute('aria-valuetext', valueText);

      if (document.activeElement !== digitalHourInput) {
        digitalHourInput.value = digitalHourDisplayValue();
      }
      if (document.activeElement !== digitalMinuteInput) {
        digitalMinuteInput.value = pad2(dialMinute);
      }

      var isPm = dialHour >= 12;
      amBtn.classList.toggle('is-selected', !isPm);
      pmBtn.classList.toggle('is-selected', isPm);
      amBtn.setAttribute('aria-pressed', !isPm ? 'true' : 'false');
      pmBtn.setAttribute('aria-pressed', isPm ? 'true' : 'false');
    }

    function valueFromClockPointer(clientX, clientY) {
      var rect = clockFace.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = clientX - cx;
      var dy = clientY - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (deg < 0) deg += 360;

      if (dialMode === 'hour') {
        var slot = Math.round(deg / 30) % 12;
        if (isHour12()) {
          var hour12 = slot === 0 ? 12 : slot;
          return hour12PartsToHour24(hour12, dialHour >= 12);
        }
        var mid = (DUE_DATE_TIME_CLOCK_INNER_R + DUE_DATE_TIME_CLOCK_OUTER_R) / 2;
        var scale = rect.width / DUE_DATE_TIME_CLOCK_SIZE;
        var useOuter = dist > mid * scale;
        return useOuter ? (slot === 0 ? 12 : slot + 12) : slot;
      }

      var minute = Math.round(deg / 30) * 5;
      if (minute >= 60) minute = 0;
      return minute;
    }

    function applyPointerToDial(clientX, clientY, advanceOnHour) {
      var next = valueFromClockPointer(clientX, clientY);
      if (dialMode === 'hour') {
        if (next === dialHour) return;
        dialHour = next;
        commitDialTime(false);
        if (advanceOnHour) setDialMode('minute');
        else renderClockFace();
      } else {
        if (next === dialMinute) return;
        dialMinute = next;
        commitDialTime(false);
      }
    }

    function syncTimePickerSelection() {
      var parsed = parseDialTime(currentTime || rememberedTime || DUE_DATE_TIME_DEFAULT);
      dialHour = parsed.hour;
      dialMinute = parsed.minute;
      renderClockFace();

      var periodChips = timePeriods.querySelectorAll('[data-time]');
      for (var p = 0; p < periodChips.length; p++) {
        var periodSelected = !!currentTime && periodChips[p].dataset.time === currentTime;
        periodChips[p].classList.toggle('is-selected', periodSelected);
        periodChips[p].setAttribute('aria-pressed', periodSelected ? 'true' : 'false');
      }
    }

    function selectTime(hhmm) {
      if (!enabled) return;
      ensureDueDateForTime();
      if (!current) return;
      var next = normalizeDueTime(hhmm);
      currentTime = next || '';
      if (next) {
        rememberedTime = next;
        var parsed = parseDialTime(next);
        dialHour = parsed.hour;
        dialMinute = parsed.minute;
      }
      emitChange();
      syncTimePickerSelection();
    }

    function refreshSuggestions() {
      var expanded = !collapseApi || collapseApi.isExpanded();
      var show = enabled && expanded && !current;
      var chips = suggestions.querySelectorAll('[data-suggestion]');
      var anyAvailable = false;
      for (var i = 0; i < chips.length; i++) {
        var available = isDueDateQuickSuggestionAvailable(chips[i].dataset.suggestion);
        chips[i].hidden = !available;
        if (available) anyAvailable = true;
      }
      var wasHidden = suggestions.hidden;
      suggestions.hidden = !(show && anyAvailable);
      if (wasHidden !== suggestions.hidden) notifyLayout();
    }

    function applyQuickSuggestion(id) {
      if (!enabled) return;
      var resolved = resolveDueDateQuickSuggestion(id);
      if (!resolved || !resolved.iso) return;
      var next = normalizeDueDate(resolved.iso);
      if (!next) return;
      current = next;
      currentTime = normalizeDueTime(resolved.time) || '';
      if (currentTime) rememberedTime = currentTime;
      focusIso = next;
      syncViewFromValue(next);
      if (open) renderCalendar();
      emitChange();
    }

    function refreshTrigger() {
      var display = formatDueDateBoxDisplay(current);
      triggerTitle.textContent = formatDueDateTriggerTitle(current);
      if (display) {
        triggerValue.textContent = display;
        triggerValue.classList.remove('is-placeholder');
        trigger.classList.add('has-value');
        datePicker.classList.add('has-value');
        dateTrashBtn.hidden = false;
      } else {
        triggerValue.textContent = DUE_DATE_PLACEHOLDER;
        triggerValue.classList.add('is-placeholder');
        trigger.classList.remove('has-value');
        datePicker.classList.remove('has-value');
        dateTrashBtn.hidden = true;
      }
    }

    function refreshTodayBtn() {
      var todayIso = toIsoDate(startOfLocalDay(new Date()));
      var hideToday = !!current && current === todayIso;
      todayBtn.hidden = hideToday;
      footer.hidden = hideToday;
    }

    function paintCountdownDot(band) {
      var accent = dueBandAccent(band);
      if (!accent) {
        countdownDot.hidden = true;
        countdownDot.style.removeProperty('background');
        return;
      }
      countdownDot.hidden = false;
      countdownDot.style.background = accent;
    }

    function refreshCountdown() {
      if (!current) {
        countdownPrimary.textContent = '';
        countdownSecondary.textContent = '';
        countdownSecondary.hidden = true;
        countdown.hidden = true;
        countdown.classList.remove('is-past');
        field.classList.remove('has-due-date');
        paintCountdownDot('');
        clearDueProximityBand(field);
        refreshTimeRow();
        refreshTrigger();
        refreshSuggestions();
        refreshTodayBtn();
        if (collapseApi) collapseApi.refreshSummary();
        return;
      }
      refreshTrigger();
      refreshTimeRow();
      refreshSuggestions();
      refreshTodayBtn();
      if (!enabled) {
        countdownPrimary.textContent = '';
        countdownSecondary.textContent = '';
        countdownSecondary.hidden = true;
        countdown.hidden = true;
        countdown.classList.remove('is-past');
        field.classList.remove('has-due-date');
        paintCountdownDot('');
        clearDueProximityBand(field);
        if (collapseApi) collapseApi.refreshSummary();
        return;
      }
      var human = formatDueDateHumanReadable(current, currentTime);
      var band = dueProximityBand(current, currentTime);
      var past = band === 'overdue';
      countdownPrimary.textContent = human.primary || '';
      countdownSecondary.textContent = human.secondary || '';
      countdownSecondary.hidden = !human.secondary;
      countdown.hidden = !human.primary;
      countdown.classList.toggle('is-past', past);
      field.classList.add('has-due-date');
      applyDueProximityBand(field, band);
      paintCountdownDot(band);
      if (collapseApi) collapseApi.refreshSummary();
    }

    function buildDueSummary() {
      if (!current) return formatDueDateCompactSummary(current, currentTime);
      var label = formatDueDateCompactSummary(current, currentTime);
      if (!label) return '';
      var band = dueProximityBand(current, currentTime);
      var accent = dueBandAccent(band);
      var wrap = document.createElement('span');
      wrap.className = 'due-summary';
      if (band && wrap.dataset) wrap.dataset.dueBand = band;
      if (accent) {
        var dot = document.createElement('span');
        dot.className = 'heat-tier-dot due-summary-dot';
        dot.setAttribute('aria-hidden', 'true');
        dot.style.background = accent;
        wrap.appendChild(dot);
      }
      var text = document.createElement('span');
      text.className = 'due-summary-label';
      text.textContent = label;
      wrap.appendChild(text);
      return wrap;
    }

    function refreshStartTrigger() {
      var display = formatDueDateBoxDisplay(currentStart);
      if (display) {
        startTriggerValue.textContent = display;
        startTriggerValue.classList.remove('is-placeholder');
        startTrigger.classList.add('has-value');
        startPicker.classList.add('has-value');
        startTrashBtn.hidden = false;
      } else {
        startTriggerValue.textContent = DUE_DATE_START_PLACEHOLDER;
        startTriggerValue.classList.add('is-placeholder');
        startTrigger.classList.remove('has-value');
        startPicker.classList.remove('has-value');
        startTrashBtn.hidden = true;
      }
      startTrigger.setAttribute('aria-expanded', startOpen ? 'true' : 'false');
    }

    function refreshRecurrenceUi() {
      var rule = currentRecurrence;
      var recurrenceHint = rule
        ? formatRecurrenceLabelFr(rule, currentTime || rememberedTime || DUE_DATE_TIME_DEFAULT)
        : '';
      recurringSelect.value = rule ? rule.frequency : '';
      recurringClearBtn.hidden = !rule;
      recurringWeekdays.hidden = !rule || rule.frequency !== 'weekly';
      var interval = rule && rule.interval ? rule.interval : 1;
      recurringIntervalInput.value = String(interval);
      recurringIntervalWrap.hidden = !rule;
      recurringTimeWrap.hidden = !rule;
      recurringTimeInput.value = currentTime || rememberedTime || DUE_DATE_TIME_DEFAULT;
      triggerRecurringHint.hidden = !rule;
      timeRecurringHint.hidden = !rule;
      triggerRecurringHint.textContent = recurrenceHint;
      timeRecurringHint.textContent = recurrenceHint;
      var selected = rule && rule.weekdays ? rule.weekdays : [];
      var chips = recurringWeekdays.querySelectorAll('.due-date-recurring-weekday');
      for (var i = 0; i < chips.length; i++) {
        var day = +chips[i].dataset.day;
        var on = selected.indexOf(day) !== -1;
        chips[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        chips[i].classList.toggle('is-selected', on);
      }
    }

    function toggleRecurrenceWeekday(dayIndex) {
      if (!currentRecurrence || currentRecurrence.frequency !== 'weekly') return;
      var days = (currentRecurrence.weekdays || []).slice();
      var idx = days.indexOf(dayIndex);
      if (idx === -1) {
        days.push(dayIndex);
      } else if (days.length > 1) {
        days.splice(idx, 1);
      } else {
        return;
      }
      currentRecurrence = normalizeRecurrence({
        frequency: 'weekly',
        interval: currentRecurrence.interval || 1,
        weekdays: days
      });
      emitChange();
    }

    function renderStartCalendar() {
      if (startViewYear == null || startViewMonth == null) {
        syncStartViewFromValue(currentStart);
      }
      var monthName = DUE_DATE_MONTH_NAMES[startViewMonth];
      var monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      startMonthLabel.textContent = monthCap + ' ' + startViewYear;

      startGrid.textContent = '';
      var first = new Date(startViewYear, startViewMonth, 1);
      var startOffset = sundayOffset(first);
      var gridStart = new Date(startViewYear, startViewMonth, 1 - startOffset);
      var todayIso = toIsoDate(startOfLocalDay(new Date()));

      var row = null;
      for (var i = 0; i < 42; i++) {
        if (i % 7 === 0) {
          row = document.createElement('div');
          row.className = 'due-date-row';
          row.setAttribute('role', 'row');
          startGrid.appendChild(row);
        }
        var cellDate = new Date(
          gridStart.getFullYear(),
          gridStart.getMonth(),
          gridStart.getDate() + i
        );
        var iso = toIsoDate(cellDate);
        var inMonth = cellDate.getMonth() === startViewMonth;
        var isToday = iso === todayIso;
        var isPast = iso < todayIso;
        var isSelected = !!currentStart && iso === currentStart;
        var isFocused = iso === startFocusIso;

        var cell = document.createElement('div');
        cell.className = 'due-date-cell';
        cell.setAttribute('role', 'gridcell');

        var dayBtn = document.createElement('button');
        dayBtn.type = 'button';
        dayBtn.className = 'due-date-day';
        dayBtn.dataset.iso = iso;
        dayBtn.textContent = String(cellDate.getDate());
        dayBtn.setAttribute(
          'aria-label',
          DUE_DATE_WEEKDAY_NAMES[sundayOffset(cellDate)] +
            ' ' +
            cellDate.getDate() +
            ' ' +
            DUE_DATE_MONTH_NAMES[cellDate.getMonth()] +
            ' ' +
            cellDate.getFullYear()
        );
        dayBtn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        dayBtn.tabIndex = isFocused ? 0 : -1;
        if (!inMonth) dayBtn.classList.add('is-outside');
        if (isToday) dayBtn.classList.add('is-today');
        if (isPast) dayBtn.classList.add('is-past');
        if (isSelected) dayBtn.classList.add('is-selected');
        dayBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          selectStartIso(ev.currentTarget.dataset.iso);
        });
        cell.appendChild(dayBtn);
        row.appendChild(cell);
      }

      var hideToday = !!currentStart && currentStart === todayIso;
      startTodayBtn.hidden = hideToday;
      startFooter.hidden = hideToday;
    }

    function selectStartIso(iso) {
      var next = normalizeDueDate(iso);
      if (!next) return;
      currentStart = next;
      startFocusIso = next;
      syncStartViewFromValue(next);
      emitChange();
      renderStartCalendar();
      hideStartPicker();
    }

    function shiftStartMonth(delta) {
      startViewMonth += delta;
      while (startViewMonth < 0) {
        startViewMonth += 12;
        startViewYear -= 1;
      }
      while (startViewMonth > 11) {
        startViewMonth -= 12;
        startViewYear += 1;
      }
      var daysInMonth = new Date(startViewYear, startViewMonth + 1, 0).getDate();
      var focusDay = dueDateToLocalDate(startFocusIso);
      var day = focusDay ? Math.min(focusDay.getDate(), daysInMonth) : 1;
      startFocusIso = toIsoDate(new Date(startViewYear, startViewMonth, day));
      renderStartCalendar();
    }

    function showStartPicker() {
      if (startOpen) return;
      startOpen = true;
      if (currentStart) syncStartViewFromValue(currentStart);
      else {
        syncStartViewFromValue('');
        startFocusIso = toIsoDate(startOfLocalDay(new Date()));
      }
      startPopover.hidden = false;
      field.classList.add('is-start-open');
      renderStartCalendar();
      refreshStartTrigger();
      bindDocListeners();
      document.addEventListener('mousedown', onStartDocMouseDown, true);
      notifyLayout();
    }

    function hideStartPicker() {
      if (!startOpen) return;
      startOpen = false;
      startPopover.hidden = true;
      field.classList.remove('is-start-open');
      document.removeEventListener('mousedown', onStartDocMouseDown, true);
      refreshStartTrigger();
      unbindDocListeners();
      notifyLayout();
    }

    function onStartDocMouseDown(ev) {
      if (!startOpen) return;
      if (startPicker.contains(ev.target)) return;
      hideStartPicker();
    }

    function emitChange() {
      refreshCountdown();
      refreshStartTrigger();
      refreshRecurrenceUi();
      onChange(getValues());
    }

    function getValues() {
      var out = {
        dueDate: current || '',
        dueTime: current ? (currentTime || '') : '',
        dueEnabled: !!current,
        startDate: currentStart || '',
        recurrence: currentRecurrence
      };
      return out;
    }

    function getValue() {
      return current || '';
    }

    function setValue(value, options) {
      options = options || {};
      if (value && typeof value === 'object') {
        current = normalizeDueDate(value.dueDate);
        currentTime = current ? normalizeDueTime(value.dueTime) : '';
        if (currentTime) rememberedTime = currentTime;
        // dueEnabled:false with a date means "cleared" (legacy disable checkbox).
        if (value.dueEnabled === false) {
          current = '';
          currentTime = '';
        }
        if (value.startDate !== undefined) {
          currentStart = normalizeDueDate(value.startDate);
        }
        if (value.recurrence !== undefined) {
          currentRecurrence = normalizeRecurrence(value.recurrence);
        }
      } else {
        current = normalizeDueDate(value);
        if (!current) currentTime = '';
      }
      if (current) {
        syncViewFromValue(current);
      } else {
        syncViewFromValue('');
      }
      syncStartViewFromValue(currentStart);
      if (collapseApi && options.expand != null) {
        collapseApi.setExpanded(!!options.expand, { notifyLayout: false });
      } else if (collapseApi && current && !options.preserveCollapse) {
        // Keep current expand state; do not force-open on every setValue.
      }
      showPickers();
      refreshCountdown();
      refreshStartTrigger();
      refreshRecurrenceUi();
    }

    function setEnabled(nextEnabled, options) {
      // No enable checkbox — treat as expand control when asked to open/close.
      options = options || {};
      if (collapseApi && options.expand != null) {
        collapseApi.setExpanded(!!options.expand);
        return;
      }
      if (collapseApi && nextEnabled && options.expand !== false) {
        collapseApi.setExpanded(true);
      }
    }

    function clampFocusToViewMonth() {
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var focusDay = dueDateToLocalDate(focusIso);
      var day = focusDay ? Math.min(focusDay.getDate(), daysInMonth) : 1;
      focusIso = toIsoDate(new Date(viewYear, viewMonth, day));
    }

    function yearPickerRangeStart(year) {
      var nowYear = new Date().getFullYear();
      var y = year == null ? viewYear : year;
      if (y < nowYear) y = nowYear;
      var offset = y - nowYear;
      return nowYear + Math.floor(offset / DUE_DATE_YEAR_PICKER_COUNT) * DUE_DATE_YEAR_PICKER_COUNT;
    }

    function syncNavChrome() {
      var monthName = DUE_DATE_MONTH_NAMES[viewMonth];
      var monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      var focusDay = dueDateToLocalDate(focusIso);
      var nowYear = new Date().getFullYear();
      dayPickBtn.textContent = String(focusDay ? focusDay.getDate() : 1);
      monthPickBtn.textContent = monthCap;
      yearPickBtn.textContent = String(viewYear);
      dayPickBtn.hidden = calendarMode === 'year';
      monthPickBtn.hidden = calendarMode === 'year';
      yearPickBtn.hidden = false;
      dayPickBtn.setAttribute('aria-expanded', calendarMode === 'date' ? 'true' : 'false');
      monthPickBtn.setAttribute('aria-expanded', calendarMode === 'month' ? 'true' : 'false');
      yearPickBtn.setAttribute('aria-expanded', calendarMode === 'year' ? 'true' : 'false');
      dayPickBtn.classList.toggle('is-active', calendarMode === 'date');
      monthPickBtn.classList.toggle('is-active', calendarMode === 'month');
      yearPickBtn.classList.toggle('is-active', calendarMode === 'year');

      if (calendarMode === 'year') {
        if (yearPickerStart == null) yearPickerStart = yearPickerRangeStart(viewYear);
        if (yearPickerStart < nowYear) yearPickerStart = nowYear;
        var endYear = yearPickerStart + DUE_DATE_YEAR_PICKER_COUNT - 1;
        yearPickBtn.textContent = yearPickerStart + '\u2013' + endYear;
        prevBtn.setAttribute('aria-label', DUE_DATE_PREV_YEARS);
        nextBtn.setAttribute('aria-label', DUE_DATE_NEXT_YEARS);
        prevBtn.disabled = yearPickerStart <= nowYear;
      } else if (calendarMode === 'month') {
        yearPickBtn.textContent = String(viewYear);
        prevBtn.setAttribute('aria-label', DUE_DATE_PREV_YEAR);
        nextBtn.setAttribute('aria-label', DUE_DATE_NEXT_YEAR);
        prevBtn.disabled = false;
      } else {
        prevBtn.setAttribute('aria-label', DUE_DATE_PREV_MONTH);
        nextBtn.setAttribute('aria-label', DUE_DATE_NEXT_MONTH);
        prevBtn.disabled = false;
      }

      weekdays.hidden = calendarMode !== 'day';
      popover.dataset.calendarMode = calendarMode;
    }

    function setCalendarMode(mode) {
      var next = mode === 'month' || mode === 'year' || mode === 'date' ? mode : 'day';
      calendarMode = next;
      if (calendarMode === 'year') {
        yearPickerStart = yearPickerRangeStart(viewYear);
      }
      renderCalendar(calendarMode === 'day');
    }

    function shiftCalendar(delta) {
      if (calendarMode === 'year') {
        var nowYear = new Date().getFullYear();
        if (yearPickerStart == null) yearPickerStart = yearPickerRangeStart(viewYear);
        var nextStart = yearPickerStart + delta * DUE_DATE_YEAR_PICKER_COUNT;
        if (nextStart < nowYear) nextStart = nowYear;
        if (nextStart === yearPickerStart && delta < 0) return;
        yearPickerStart = nextStart;
        renderCalendar();
        return;
      }
      if (calendarMode === 'month') {
        viewYear += delta;
        clampFocusToViewMonth();
        renderCalendar(true);
        return;
      }
      var next = new Date(viewYear, viewMonth + delta, 1);
      viewYear = next.getFullYear();
      viewMonth = next.getMonth();
      clampFocusToViewMonth();
      renderCalendar(true);
    }

    function selectMonth(monthIndex) {
      if (monthIndex < 0 || monthIndex > 11) return;
      viewMonth = monthIndex;
      clampFocusToViewMonth();
      calendarMode = 'day';
      renderCalendar(true);
    }

    function selectDayOfMonth(dayNum) {
      if (!isFinite(dayNum) || dayNum < 1) return;
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var day = Math.min(Math.floor(dayNum), daysInMonth);
      var iso = toIsoDate(new Date(viewYear, viewMonth, day));
      selectIso(iso);
    }

    function selectYear(year) {
      if (!isFinite(year)) return;
      var nowYear = new Date().getFullYear();
      if (year < nowYear) return;
      viewYear = year;
      yearPickerStart = yearPickerRangeStart(year);
      clampFocusToViewMonth();
      calendarMode = 'month';
      renderCalendar();
    }

    function selectIso(iso) {
      if (!enabled) return;
      var next = normalizeDueDate(iso);
      if (!next) return;
      if (!currentTime) {
        currentTime = rememberedTime || DUE_DATE_TIME_DEFAULT;
      }
      if (currentTime) rememberedTime = currentTime;
      current = next;
      focusIso = next;
      syncViewFromValue(next);
      calendarMode = 'day';
      emitChange();
      renderCalendar();
    }

    function focusDayButton(iso) {
      var btn = grid.querySelector('[data-iso="' + iso + '"]');
      if (btn) btn.focus();
    }

    function renderDatePicker() {
      grid.className = 'due-date-grid due-date-grid--dates';
      grid.setAttribute('role', 'listbox');
      grid.setAttribute('aria-label', DUE_DATE_PICK_DAY_LABEL);
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var now = startOfLocalDay(new Date());
      var todayDay =
        now.getFullYear() === viewYear && now.getMonth() === viewMonth ? now.getDate() : -1;
      var selectedDay = current
        ? (function () {
            var d = dueDateToLocalDate(current);
            return d && d.getFullYear() === viewYear && d.getMonth() === viewMonth
              ? d.getDate()
              : -1;
          })()
        : -1;
      var focusDay = dueDateToLocalDate(focusIso);
      var focusedDay =
        focusDay && focusDay.getFullYear() === viewYear && focusDay.getMonth() === viewMonth
          ? focusDay.getDate()
          : -1;

      for (var d = 1; d <= daysInMonth; d++) {
        var dateBtn = document.createElement('button');
        dateBtn.type = 'button';
        dateBtn.className = 'due-date-date-option';
        dateBtn.dataset.day = String(d);
        dateBtn.textContent = String(d);
        dateBtn.setAttribute('role', 'option');
        dateBtn.setAttribute(
          'aria-label',
          d +
            ' ' +
            DUE_DATE_MONTH_NAMES[viewMonth] +
            ' ' +
            viewYear
        );
        var cellDate = new Date(viewYear, viewMonth, d);
        var isPast = cellDate.getTime() < now.getTime();
        var daySelected = d === focusedDay || (focusedDay < 0 && d === selectedDay);
        dateBtn.setAttribute('aria-selected', daySelected ? 'true' : 'false');
        if (d === todayDay) dateBtn.classList.add('is-today');
        if (d === selectedDay) dateBtn.classList.add('is-current');
        if (daySelected) dateBtn.classList.add('is-selected');
        if (isPast) dateBtn.classList.add('is-past');
        dateBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          selectDayOfMonth(+ev.currentTarget.dataset.day);
        });
        grid.appendChild(dateBtn);
      }
    }

    function renderMonthPicker() {
      grid.className = 'due-date-grid due-date-grid--months';
      grid.setAttribute('role', 'listbox');
      grid.setAttribute('aria-label', DUE_DATE_PICK_MONTH_LABEL);
      var now = new Date();
      var thisMonth = now.getFullYear() === viewYear ? now.getMonth() : -1;
      var selectedMonth = current
        ? (function () {
            var d = dueDateToLocalDate(current);
            return d && d.getFullYear() === viewYear ? d.getMonth() : -1;
          })()
        : -1;

      for (var m = 0; m < 12; m++) {
        var monthBtn = document.createElement('button');
        monthBtn.type = 'button';
        monthBtn.className = 'due-date-month-option';
        monthBtn.dataset.month = String(m);
        monthBtn.textContent = DUE_DATE_MONTH_SHORT[m];
        monthBtn.setAttribute('role', 'option');
        monthBtn.setAttribute(
          'aria-label',
          DUE_DATE_MONTH_NAMES[m].charAt(0).toUpperCase() + DUE_DATE_MONTH_NAMES[m].slice(1) + ' ' + viewYear
        );
        var isPast =
          viewYear < now.getFullYear() ||
          (viewYear === now.getFullYear() && m < now.getMonth());
        var monthSelected = m === viewMonth;
        monthBtn.setAttribute('aria-selected', monthSelected ? 'true' : 'false');
        if (m === thisMonth) monthBtn.classList.add('is-today');
        if (m === selectedMonth) monthBtn.classList.add('is-current');
        if (monthSelected) monthBtn.classList.add('is-selected');
        if (isPast) monthBtn.classList.add('is-past');
        monthBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          selectMonth(+ev.currentTarget.dataset.month);
        });
        grid.appendChild(monthBtn);
      }
    }

    function renderYearPicker() {
      grid.className = 'due-date-grid due-date-grid--years';
      grid.setAttribute('role', 'listbox');
      grid.setAttribute('aria-label', DUE_DATE_PICK_YEAR_LABEL);
      var nowYear = new Date().getFullYear();
      if (yearPickerStart == null || yearPickerStart < nowYear) {
        yearPickerStart = yearPickerRangeStart(viewYear);
      }
      var selectedYear = current
        ? (function () {
            var d = dueDateToLocalDate(current);
            return d ? d.getFullYear() : -1;
          })()
        : -1;

      for (var i = 0; i < DUE_DATE_YEAR_PICKER_COUNT; i++) {
        var year = yearPickerStart + i;
        var yearBtn = document.createElement('button');
        yearBtn.type = 'button';
        yearBtn.className = 'due-date-year-option';
        yearBtn.dataset.year = String(year);
        yearBtn.textContent = String(year);
        yearBtn.setAttribute('role', 'option');
        yearBtn.setAttribute('aria-label', String(year));
        var yearSelected = year === viewYear;
        yearBtn.setAttribute('aria-selected', yearSelected ? 'true' : 'false');
        if (year === nowYear) yearBtn.classList.add('is-today');
        if (year === selectedYear) yearBtn.classList.add('is-current');
        if (yearSelected) yearBtn.classList.add('is-selected');
        yearBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          selectYear(+ev.currentTarget.dataset.year);
        });
        grid.appendChild(yearBtn);
      }
    }

    function renderDayGrid(keepFocus) {
      grid.className = 'due-date-grid';
      grid.setAttribute('role', 'grid');
      grid.setAttribute('aria-labelledby', uid + '-month');

      var first = new Date(viewYear, viewMonth, 1);
      var startOffset = sundayOffset(first);
      var gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
      var todayIso = toIsoDate(startOfLocalDay(new Date()));

      var row = null;
      for (var i = 0; i < 42; i++) {
        if (i % 7 === 0) {
          row = document.createElement('div');
          row.className = 'due-date-row';
          row.setAttribute('role', 'row');
          grid.appendChild(row);
        }
        var cellDate = new Date(
          gridStart.getFullYear(),
          gridStart.getMonth(),
          gridStart.getDate() + i
        );
        var iso = toIsoDate(cellDate);
        var inMonth = cellDate.getMonth() === viewMonth;
        var isToday = iso === todayIso;
        var isPast = iso < todayIso;
        var isSelected = !!current && iso === current;
        var isFocused = iso === focusIso;

        var cell = document.createElement('div');
        cell.className = 'due-date-cell';
        cell.setAttribute('role', 'gridcell');

        var dayBtn = document.createElement('button');
        dayBtn.type = 'button';
        dayBtn.className = 'due-date-day';
        dayBtn.dataset.iso = iso;
        dayBtn.textContent = String(cellDate.getDate());
        dayBtn.setAttribute(
          'aria-label',
          DUE_DATE_WEEKDAY_NAMES[sundayOffset(cellDate)] +
            ' ' +
            cellDate.getDate() +
            ' ' +
            DUE_DATE_MONTH_NAMES[cellDate.getMonth()] +
            ' ' +
            cellDate.getFullYear()
        );
        dayBtn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        dayBtn.tabIndex = isFocused ? 0 : -1;

        if (!inMonth) dayBtn.classList.add('is-outside');
        if (isToday) dayBtn.classList.add('is-today');
        if (isPast) dayBtn.classList.add('is-past');
        if (isSelected) dayBtn.classList.add('is-selected');

        dayBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          selectIso(ev.currentTarget.dataset.iso);
        });

        cell.appendChild(dayBtn);
        row.appendChild(cell);
      }

      if (keepFocus) focusDayButton(focusIso);
    }

    function renderCalendar(keepFocus) {
      syncNavChrome();
      grid.textContent = '';
      if (calendarMode === 'month') {
        renderMonthPicker();
        return;
      }
      if (calendarMode === 'year') {
        renderYearPicker();
        return;
      }
      if (calendarMode === 'date') {
        renderDatePicker();
        return;
      }
      renderDayGrid(keepFocus);
    }

    function shiftMonth(delta) {
      shiftCalendar(delta);
    }

    function onDocKeyDown(ev) {
      if (ev.key === 'Escape' && startOpen) {
        ev.preventDefault();
        hideStartPicker();
        return;
      }
      if (!open || !enabled || calendarMode !== 'day') return;
      if (!grid.contains(document.activeElement) && document.activeElement !== todayBtn) {
        return;
      }
      var focusDate = dueDateToLocalDate(focusIso) || startOfLocalDay(new Date());
      var nextDate = null;
      if (ev.key === 'ArrowLeft') {
        nextDate = new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate() - 1);
      } else if (ev.key === 'ArrowRight') {
        nextDate = new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate() + 1);
      } else if (ev.key === 'ArrowUp') {
        nextDate = new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate() - 7);
      } else if (ev.key === 'ArrowDown') {
        nextDate = new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate() + 7);
      } else if (ev.key === 'Home') {
        nextDate = new Date(viewYear, viewMonth, 1);
      } else if (ev.key === 'End') {
        nextDate = new Date(viewYear, viewMonth + 1, 0);
      } else if (ev.key === 'PageUp') {
        ev.preventDefault();
        shiftMonth(ev.shiftKey ? -12 : -1);
        return;
      } else if (ev.key === 'PageDown') {
        ev.preventDefault();
        shiftMonth(ev.shiftKey ? 12 : 1);
        return;
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        if (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.iso) {
          ev.preventDefault();
          selectIso(document.activeElement.dataset.iso);
        }
        return;
      }
      if (!nextDate) return;
      ev.preventDefault();
      focusIso = toIsoDate(nextDate);
      if (nextDate.getMonth() !== viewMonth || nextDate.getFullYear() !== viewYear) {
        viewYear = nextDate.getFullYear();
        viewMonth = nextDate.getMonth();
      }
      renderCalendar(true);
    }

    function bindDocListeners() {
      if (docListenersBound) return;
      document.addEventListener('keydown', onDocKeyDown, true);
      docListenersBound = true;
    }

    function unbindDocListeners() {
      if (docListenersBound && !open && !timeOpen && !startOpen) {
        document.removeEventListener('keydown', onDocKeyDown, true);
        docListenersBound = false;
      }
    }

    function showPickers() {
      if (!enabled) return;
      var wasOpen = open && timeOpen;
      open = true;
      timeOpen = true;
      calendarMode = 'day';
      if (current) syncViewFromValue(current);
      else {
        syncViewFromValue('');
        focusIso = toIsoDate(startOfLocalDay(new Date()));
      }
      popover.hidden = false;
      timePopover.hidden = false;
      field.classList.add('is-open', 'is-time-open');
      setDialMode(dialMode === 'minute' ? 'minute' : 'hour');
      renderCalendar();
      syncTimePickerSelection();
      bindDocListeners();
      if (!wasOpen) notifyLayout();
    }

    function hidePickers() {
      if (!open && !timeOpen) return;
      commitDigitalEdits();
      open = false;
      timeOpen = false;
      popover.hidden = true;
      timePopover.hidden = true;
      field.classList.remove('is-open', 'is-time-open');
      unbindDocListeners();
      notifyLayout();
    }

    dateTrashBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!enabled) return;
      if (currentTime) rememberedTime = currentTime;
      current = '';
      currentTime = '';
      emitChange();
      if (open) renderCalendar();
    });

    timeTrashBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!enabled) return;
      currentTime = '';
      rememberedTime = '';
      emitChange();
      if (timeOpen) syncTimePickerSelection();
    });

    digitalHourInput.addEventListener('focus', function () {
      setDialMode('hour');
      requestAnimationFrame(function () {
        digitalHourInput.select();
      });
    });

    digitalMinuteInput.addEventListener('focus', function () {
      setDialMode('minute');
      requestAnimationFrame(function () {
        digitalMinuteInput.select();
      });
    });

    digitalHourInput.addEventListener('click', function () {
      digitalHourInput.select();
    });

    digitalMinuteInput.addEventListener('click', function () {
      digitalMinuteInput.select();
    });

    digitalHourInput.addEventListener('input', function () {
      digitalHourInput.value = digitsOnly(digitalHourInput.value, 2);
      if (digitalHourInput.value.length === 2) {
        commitDigitalHour({ advance: true });
      }
    });

    digitalMinuteInput.addEventListener('input', function () {
      digitalMinuteInput.value = digitsOnly(digitalMinuteInput.value, 2);
      if (digitalMinuteInput.value.length === 2) {
        commitDigitalMinute();
      }
    });

    digitalHourInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitDigitalHour({ advance: true });
      } else if (event.key === 'ArrowRight' &&
          digitalHourInput.selectionStart === digitalHourInput.value.length) {
        event.preventDefault();
        commitDigitalHour({ advance: true });
      }
    });

    digitalMinuteInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitDigitalMinute();
        digitalMinuteInput.blur();
      } else if (event.key === 'ArrowLeft' && digitalMinuteInput.selectionStart === 0) {
        event.preventDefault();
        commitDigitalMinute();
        setDialMode('hour');
        digitalHourInput.focus();
        digitalHourInput.select();
      }
    });

    digitalHourInput.addEventListener('blur', function () {
      /* Defer so focus moves (e.g. hour → minute) before commit. */
      setTimeout(function () {
        if (document.activeElement === digitalHourInput) return;
        if (!timeOpen) return;
        if (digitalHourInput.value.length) commitDigitalHour();
        else digitalHourInput.value = digitalHourDisplayValue();
      }, 0);
    });

    digitalMinuteInput.addEventListener('blur', function () {
      setTimeout(function () {
        if (document.activeElement === digitalMinuteInput) return;
        if (!timeOpen) return;
        if (digitalMinuteInput.value.length) commitDigitalMinute();
        else digitalMinuteInput.value = pad2(dialMinute);
      }, 0);
    });

    amBtn.addEventListener('click', function () {
      setMeridiem(false);
    });

    pmBtn.addEventListener('click', function () {
      setMeridiem(true);
    });

    clockFace.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      if (event.target && event.target.closest &&
          event.target.closest('.due-date-time-clock-num')) {
        return;
      }
      dialDragging = true;
      clockFace.classList.add('is-dragging');
      if (clockFace.setPointerCapture) {
        try { clockFace.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
      }
      applyPointerToDial(event.clientX, event.clientY, false);
      event.preventDefault();
    });

    clockFace.addEventListener('pointermove', function (event) {
      if (!dialDragging) return;
      applyPointerToDial(event.clientX, event.clientY, false);
    });

    function endClockDrag(event) {
      if (!dialDragging) return;
      dialDragging = false;
      clockFace.classList.remove('is-dragging');
      if (event && dialMode === 'hour') setDialMode('minute');
    }

    clockFace.addEventListener('pointerup', endClockDrag);
    clockFace.addEventListener('pointercancel', endClockDrag);

    clockFace.addEventListener('keydown', function (event) {
      var step = event.shiftKey ? 5 : 1;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (dialMode === 'hour') dialHour = (dialHour + 1) % 24;
        else dialMinute = (dialMinute + step) % 60;
        commitDialTime(false);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        if (dialMode === 'hour') dialHour = (dialHour + 23) % 24;
        else dialMinute = (dialMinute + 60 - step) % 60;
        commitDialTime(false);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setDialMode(dialMode === 'hour' ? 'minute' : 'hour');
      }
    });

    prevBtn.addEventListener('click', function () {
      shiftMonth(-1);
    });

    nextBtn.addEventListener('click', function () {
      shiftMonth(1);
    });

    monthPickBtn.addEventListener('click', function () {
      setCalendarMode(calendarMode === 'month' ? 'day' : 'month');
    });

    dayPickBtn.addEventListener('click', function () {
      setCalendarMode(calendarMode === 'date' ? 'day' : 'date');
    });

    yearPickBtn.addEventListener('click', function () {
      setCalendarMode(calendarMode === 'year' ? 'day' : 'year');
    });

    todayBtn.addEventListener('click', function () {
      calendarMode = 'day';
      selectIso(toIsoDate(startOfLocalDay(new Date())));
    });

    startTrigger.addEventListener('click', function (event) {
      if (event.target.closest('.due-date-trigger-clear')) return;
      event.preventDefault();
      event.stopPropagation();
      if (startOpen) hideStartPicker();
      else showStartPicker();
    });

    startTrigger.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('.due-date-trigger-clear')) return;
      event.preventDefault();
      if (startOpen) hideStartPicker();
      else showStartPicker();
    });

    startTrashBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      currentStart = '';
      emitChange();
      if (startOpen) {
        syncStartViewFromValue('');
        renderStartCalendar();
      }
    });

    startPrevBtn.addEventListener('click', function () {
      shiftStartMonth(-1);
    });

    startNextBtn.addEventListener('click', function () {
      shiftStartMonth(1);
    });

    startTodayBtn.addEventListener('click', function () {
      selectStartIso(toIsoDate(startOfLocalDay(new Date())));
    });

    recurringSelect.addEventListener('change', function () {
      var freq = recurringSelect.value;
      if (!freq) {
        currentRecurrence = null;
      } else {
        if (!current) {
          current = toIsoDate(startOfLocalDay(new Date()));
          focusIso = current;
          syncViewFromValue(current);
        }
        if (!currentTime) {
          currentTime = rememberedTime || DUE_DATE_TIME_DEFAULT;
          rememberedTime = currentTime;
        }
        var weekdays;
        if (freq === 'weekly') {
          if (
            currentRecurrence &&
            currentRecurrence.frequency === 'weekly' &&
            currentRecurrence.weekdays &&
            currentRecurrence.weekdays.length
          ) {
            weekdays = currentRecurrence.weekdays.slice();
          } else {
            var due = dueDateToLocalDate(current);
            weekdays = [due ? due.getDay() : new Date().getDay()];
          }
        }
        currentRecurrence = normalizeRecurrence({
          frequency: freq,
          interval:
            currentRecurrence && currentRecurrence.interval
              ? currentRecurrence.interval
              : 1,
          weekdays: weekdays
        });
      }
      emitChange();
    });

    recurringClearBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!currentRecurrence) return;
      currentRecurrence = null;
      emitChange();
    });

    recurringIntervalInput.addEventListener('change', function () {
      if (!currentRecurrence) return;
      var next = Math.round(Number(recurringIntervalInput.value));
      if (!isFinite(next) || next < 1) next = 1;
      if (next > 99) next = 99;
      currentRecurrence = normalizeRecurrence({
        frequency: currentRecurrence.frequency,
        interval: next,
        weekdays: currentRecurrence.weekdays
      });
      emitChange();
    });

    recurringTimeInput.addEventListener('change', function () {
      if (!currentRecurrence) return;
      selectTime(recurringTimeInput.value || DUE_DATE_TIME_DEFAULT);
    });

    collapseApi = bindCollapsibleEnable({
      field: field,
      body: body,
      chrome: chrome,
      alwaysEnabled: true,
      enabled: true,
      expanded: config.expanded != null ? !!config.expanded : !!current,
      getSummary: buildDueSummary,
      onLayoutChange: notifyLayout,
      onExpandChange: function (expanded, options) {
        refreshSuggestions();
        if (typeof config.onExpandChange === 'function') {
          config.onExpandChange(expanded, options);
        }
      }
    });
    refreshCountdown();
    refreshStartTrigger();
    refreshRecurrenceUi();
    showPickers();

    return {
      el: field,
      getValue: getValue,
      getValues: getValues,
      setValue: setValue,
      setEnabled: setEnabled,
      refreshTimeFormat: function () {
        refreshCountdown();
      },
      setEnableAllowed: collapseApi.setEnableAllowed,
      isEnableAllowed: collapseApi.isEnableAllowed,
      setExpanded: collapseApi.setExpanded,
      isEnabled: function () {
        return !!current;
      },
      isExpanded: collapseApi.isExpanded
    };
  }

  function createHeatPanel(config) {
    var el = config.el;
    var onSegmentClick = config.onSegmentClick || function () {};
    var formulaKey = config.formulaKey || 'baseline';
    var hideSegments = !!config.hideSegments;
    var tooltipId = 'heat-score-tip-' + Math.random().toString(36).slice(2, 9);

    var panel = document.createElement('div');
    panel.className = 'heat-panel';

    var badge = document.createElement('div');
    badge.className = 'heat-badge';

    var bnum = document.createElement('div');
    bnum.className = 'heat-badge-num';
    var dot = document.createElement('span');
    dot.className = 'heat-tier-dot';
    dot.setAttribute('aria-hidden', 'true');
    var bnumVal = document.createElement('span');
    bnumVal.className = 'heat-badge-num-val';
    bnumVal.textContent = '0';
    bnum.appendChild(dot);
    bnum.appendChild(bnumVal);
    var badgeMeta = document.createElement('div');
    badgeMeta.className = 'heat-badge-meta';

    var blabel = document.createElement('div');
    blabel.className = 'heat-badge-label';
    blabel.textContent = 'Optionnelle';

    var scoreInfoWrap = document.createElement('span');
    scoreInfoWrap.className = 'heat-score-info-wrap';

    var scoreInfoBtn = document.createElement('button');
    scoreInfoBtn.type = 'button';
    scoreInfoBtn.className = 'heat-score-info';
    scoreInfoBtn.textContent = '?';
    scoreInfoBtn.setAttribute('aria-label', 'Comment ce score est calcul\u00e9');
    scoreInfoBtn.setAttribute('aria-expanded', 'false');
    scoreInfoBtn.setAttribute('aria-controls', tooltipId);

    var scoreTooltip = document.createElement('div');
    scoreTooltip.id = tooltipId;
    scoreTooltip.className = 'heat-score-tooltip';
    scoreTooltip.setAttribute('role', 'tooltip');

    scoreInfoWrap.appendChild(scoreInfoBtn);
    scoreInfoWrap.appendChild(scoreTooltip);

    function isScoreTooltipVisible() {
      return scoreInfoWrap.classList.contains('is-open')
        || scoreInfoWrap.matches(':hover')
        || scoreInfoWrap.contains(document.activeElement);
    }

    function positionScoreTooltip() {
      var anchor = scoreInfoBtn.getBoundingClientRect();
      var gap = 6;
      var margin = 8;
      var tipW = scoreTooltip.offsetWidth;
      var tipH = scoreTooltip.offsetHeight;
      var top = anchor.bottom + gap;
      var left = anchor.right - tipW;

      if (top + tipH > window.innerHeight - margin && anchor.top - gap - tipH >= margin) {
        top = anchor.top - gap - tipH;
      }
      left = Math.max(margin, Math.min(left, window.innerWidth - tipW - margin));

      scoreTooltip.style.left = left + 'px';
      scoreTooltip.style.top = top + 'px';
    }

    function repositionScoreTooltipIfVisible() {
      if (isScoreTooltipVisible()) positionScoreTooltip();
    }

    function closeScoreTooltip() {
      scoreInfoWrap.classList.remove('is-open');
      scoreInfoBtn.setAttribute('aria-expanded', 'false');
    }

    function openScoreTooltip() {
      scoreInfoWrap.classList.add('is-open');
      scoreInfoBtn.setAttribute('aria-expanded', 'true');
      positionScoreTooltip();
    }

    function toggleScoreTooltip() {
      if (scoreInfoWrap.classList.contains('is-open')) closeScoreTooltip();
      else openScoreTooltip();
    }

    scoreInfoBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleScoreTooltip();
    });

    scoreInfoBtn.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeScoreTooltip();
        scoreInfoBtn.blur();
      }
    });

    scoreInfoWrap.addEventListener('mouseenter', positionScoreTooltip);
    scoreInfoWrap.addEventListener('focusin', positionScoreTooltip);

    window.addEventListener('resize', repositionScoreTooltipIfVisible);
    document.addEventListener('scroll', repositionScoreTooltipIfVisible, true);

    document.addEventListener('click', function (e) {
      if (!scoreInfoWrap.contains(e.target)) closeScoreTooltip();
    });

    badgeMeta.appendChild(blabel);
    badgeMeta.appendChild(scoreInfoWrap);
    badge.appendChild(bnum);
    badge.appendChild(badgeMeta);

    var tierDesc = document.createElement('p');
    tierDesc.className = 'heat-tier-desc';
    tierDesc.hidden = true;

    var heatHead = document.createElement('div');
    heatHead.className = 'heat-head';
    heatHead.appendChild(badge);
    heatHead.appendChild(tierDesc);
    panel.appendChild(heatHead);

    var segsWrap = document.createElement('div');
    segsWrap.className = 'heat-segs';
    var segs = [];

    function bindSegmentTarget(el, seg) {
      function activate() {
        onSegmentClick(seg.target);
      }
      el.addEventListener('click', activate);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    }

    HEAT_SEGMENTS.forEach(function (seg) {
      var s = document.createElement('div');
      s.className = 'heat-seg';
      s.dataset.i = String(seg.i);
      s.dataset.target = String(seg.target);
      s.style.setProperty('--c', seg.color);
      s.setAttribute('role', 'button');
      s.setAttribute('tabindex', '0');
      s.setAttribute('aria-label', seg.label);
      if (seg.description || seg.title) {
        s.title = formatTierDescriptionTooltip(seg.label, seg.title, seg.description);
      }
      bindSegmentTarget(s, seg);
      segsWrap.appendChild(s);
      segs.push(s);
    });
    panel.appendChild(segsWrap);

    var segLabels = document.createElement('div');
    segLabels.className = 'heat-seg-labels';
    var segLabelTargets = [];
    HEAT_SEGMENTS.forEach(function (seg) {
      var label = document.createElement('span');
      label.textContent = seg.label;
      label.setAttribute('role', 'button');
      label.setAttribute('tabindex', '0');
      label.setAttribute('aria-label', seg.label);
      if (seg.description || seg.title) {
        label.title = formatTierDescriptionTooltip(seg.label, seg.title, seg.description);
      }
      bindSegmentTarget(label, seg);
      segLabels.appendChild(label);
      segLabelTargets.push({ el: label, fullLabel: seg.label });
    });
    panel.appendChild(segLabels);

    if (hideSegments) {
      segsWrap.hidden = true;
      segLabels.hidden = true;
    }

    var currentBadgeTierLabel = 'Optionnelle';
    var lastDescKey = '';
    var lastPaintLabel = currentBadgeTierLabel;
    var heatFlipNodes = [badge, tierDesc];
    var segLabelResponsive = createResponsiveTierLabelGroup({
      container: segLabels,
      targets: segLabelTargets
    });
    var badgeLabelResponsive = createResponsiveTierLabelGroup({
      container: badge,
      targets: [{
        el: blabel,
        getFullLabel: function () { return currentBadgeTierLabel; },
        ariaWhenShort: true
      }]
    });

    el.appendChild(panel);

    function updateScoreTooltip(result, display) {
      var hide = !result || !result.terms || !!display.inutile || !!display.blocked;
      scoreInfoWrap.hidden = hide;
      if (hide) {
        closeScoreTooltip();
        return;
      }
      var breakdown = formatScoreBreakdown(formulaKey, result);
      renderScoreBreakdownTooltip(breakdown, scoreTooltip);
      scoreInfoBtn.removeAttribute('title');
      scoreInfoBtn.setAttribute(
        'aria-label',
        breakdown.short + '. ' + breakdown.lines.join('. ')
      );
      repositionScoreTooltipIfVisible();
    }

    function paint(result, display) {
      var d = display || resolveDisplay(result, {});
      // Heat-badge keeps priority / inutile colors. Blocked crimson is section-scoped (Bloqué).
      var visualSource = d.inutile
        ? { inutile: true, label: INUTILE_LABEL }
        : { i: d.tierI, label: d.label };
      var v = tierVisuals(visualSource);
      // Priority name only — due countdown lives in the Échéance section / board badge.
      var nextLabel = d.eisenhowerLabel || classicTierLabel(d);
      var nextDescKey = tierDescriptionContentKey(d);
      var labelChanged = nextLabel !== lastPaintLabel;
      var descChanged = nextDescKey !== lastDescKey;
      var layoutSensitive = labelChanged || descChanged
        || badge.classList.contains('is-overdue')
        || panel.classList.contains('is-overdue');

      var firstRects = layoutSensitive ? captureHeatLayoutRects(heatFlipNodes) : null;
      if (layoutSensitive) {
        badgeLabelResponsive.setSuspended(true);
        segLabelResponsive.setSuspended(true);
      }

      bnumVal.textContent = formatScore(d.score);
      // Do not paint the heat-badge dot as a blocked glyph — Bloqué section carries that state.
      dot.classList.remove('is-blocked');
      dot.style.setProperty('--heat-tier-dot-size', heatTierDotSizePx(d).toFixed(2) + 'px');
      dot.style.background = v.seg;
      currentBadgeTierLabel = nextLabel;
      badge.style.setProperty('--heat-fill', v.fill);
      badge.style.setProperty('--heat-text', v.text);
      panel.style.setProperty('--heat-text', v.text);
      badge.style.removeProperty('background');
      bnum.style.removeProperty('color');
      blabel.style.removeProperty('color');
      badge.classList.toggle('is-inutile', !!d.inutile);
      badge.classList.remove('is-blocked', 'is-overdue');
      panel.classList.toggle('is-inutile', !!d.inutile);
      // No panel / heat-badge crimson wash for blocked/overdue — section shells carry red.
      panel.classList.remove('is-blocked', 'is-overdue');
      paintTierDescription(tierDesc, d);
      if (labelChanged) flashHeatTextEnter(blabel);
      if (descChanged) flashHeatTextEnter(tierDesc);
      lastPaintLabel = nextLabel;
      lastDescKey = nextDescKey;
      segs.forEach(function (s) {
        s.classList.toggle('on', !d.inutile && d.tierI != null && +s.dataset.i === d.tierI);
      });
      updateScoreTooltip(result, d);
      // Refresh label strings in the current short/long mode; mode flips are debounced.
      badgeLabelResponsive.refresh();
      segLabelResponsive.refresh();

      if (layoutSensitive) {
        playHeatLayoutFlip(heatFlipNodes, firstRects);
        badgeLabelResponsive.setSuspended(false);
        segLabelResponsive.setSuspended(false);
      }
    }

    return {
      el: panel,
      paint: paint,
      setFormulaKey: function (key) {
        formulaKey = key || 'baseline';
      },
      setHideSegments: function (hide) {
        hideSegments = !!hide;
        segsWrap.hidden = hideSegments;
        segLabels.hidden = hideSegments;
      }
    };
  }

  function createFormulaSwitcher(config) {
    var el = config.el;
    var initialKey = config.formulaKey || 'baseline';
    var onChange = config.onChange || function () {};

    var wrap = document.createElement('div');
    wrap.className = 'formula-switcher';
    wrap.setAttribute('role', 'radiogroup');
    wrap.setAttribute('aria-label', 'Formule de priorité');

    var currentKey = initialKey;
    var buttons = [];

    FORMULA_OPTIONS.forEach(function (option) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'formula-switcher-btn';
      btn.dataset.formula = option.key;
      btn.textContent = option.label;
      btn.title = option.description || option.label;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', option.key === currentKey ? 'true' : 'false');
      btn.addEventListener('click', function () {
        if (currentKey === option.key) return;
        currentKey = option.key;
        buttons.forEach(function (b) {
          b.classList.toggle('is-active', b.dataset.formula === currentKey);
          b.setAttribute('aria-checked', b.dataset.formula === currentKey ? 'true' : 'false');
        });
        onChange(currentKey);
      });
      if (option.key === currentKey) btn.classList.add('is-active');
      wrap.appendChild(btn);
      buttons.push(btn);
    });

    el.appendChild(wrap);

    return {
      el: wrap,
      getFormulaKey: function () { return currentKey; },
      setFormulaKey: function (key) {
        currentKey = key || 'baseline';
        buttons.forEach(function (b) {
          b.classList.toggle('is-active', b.dataset.formula === currentKey);
          b.setAttribute('aria-checked', b.dataset.formula === currentKey ? 'true' : 'false');
        });
      }
    };
  }

  function createCalcGraphPanel(config) {
    var el = config.el;
    var fields = config.fields || null;
    var onInputsChange = config.onChange || function () {};
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var onToggle = config.onToggle || function () {};
    var SVG_W = 260;
    var SVG_H = 208;
    var MARGIN = { top: 8, right: 6, bottom: 22, left: 24 };
    var PLOT_W = SVG_W - MARGIN.left - MARGIN.right;
    var PLOT_H = SVG_H - MARGIN.top - MARGIN.bottom;
    var CONTOUR_RES = 40;
    var TIER_THRESHOLDS = [];
    for (var ti = TIER_DEFS.length - 1; ti >= 0; ti--) {
      if (TIER_DEFS[ti].min > 0) TIER_THRESHOLDS.push(TIER_DEFS[ti].min);
    }
    var MARKER_CORE_R = 5;
    var MARKER_STROKE_W = 2;
    var MARKER_SHADOW_R = 6;
    var MARKER_HIT_R = 14;

    var lastScene = { U: 0, I: 0, F: 0, result: null, display: null };
    var draggingMarker = false;
    var dragPointerId = null;
    var dragVisual = { u: null, i: null };
    var dragMoveRaf = null;
    var pendingDragPt = null;

    function snapAxis(v, min, max) {
      return clamp(Math.round(v / SLIDER_STEP) * SLIDER_STEP, min, max);
    }

    function applyUrgencyImpact(u, i) {
      u = snapAxis(u, 0, AXIS_UI_MAX);
      i = snapAxis(i, 0, AXIS_UI_MAX);
      if (fields && fields.urgency) fields.urgency.updateDisplay(u);
      if (fields && fields.impact) fields.impact.updateDisplay(i);
      onInputsChange();
    }

    function applyEase(f) {
      f = snapAxis(f, 1, 5);
      if (fields && fields.ease) fields.ease.updateDisplay(f);
      onInputsChange();
    }

    function svgEl(tag, attrs) {
      var node = document.createElementNS(SVG_NS, tag);
      if (attrs) {
        Object.keys(attrs).forEach(function (key) {
          node.setAttribute(key, attrs[key]);
        });
      }
      return node;
    }

    function lineEl(x1, y1, x2, y2, cls) {
      return svgEl('line', {
        class: cls,
        x1: String(x1),
        y1: String(y1),
        x2: String(x2),
        y2: String(y2)
      });
    }

    function plotX(u) {
      return MARGIN.left + (u / AXIS_UI_MAX) * PLOT_W;
    }

    function plotY(i) {
      return MARGIN.top + (1 - i / AXIS_UI_MAX) * PLOT_H;
    }

    function formatEase(F) {
      return Math.abs(F - Math.round(F)) < 0.01 ? String(Math.round(F)) : F.toFixed(2);
    }

    var panel = document.createElement('div');
    panel.className = 'calc-graph-panel field field--graphique';

    var bodyId = 'calc-graph-body-' + Math.random().toString(36).slice(2, 9);
    var chrome = createCollapsibleEnableChrome({
      title: 'Graphique',
      bodyId: bodyId,
      hideEnable: true,
      leadingIcon: 'ti-chart-area',
      iconClass: 'graphique-leading-icon',
      titleClass: 'graphique-enable-title',
      collapseLabel: 'Replier Graphique',
      expandLabel: 'D\u00e9velopper Graphique'
    });
    panel.appendChild(chrome.head);

    var body = document.createElement('div');
    body.className = 'calc-graph-body section-toggle-body';
    body.id = bodyId;
    body.hidden = true;

    var graphSection = document.createElement('div');
    graphSection.className = 'calc-graph-section calc-rsm-section';

    var rsmWrap = document.createElement('div');
    rsmWrap.className = 'calc-rsm-wrap';
    rsmWrap.setAttribute('role', 'img');
    rsmWrap.setAttribute('aria-label', 'Graphique de priorité. Urgence et impact');

    var rsmRow = document.createElement('div');
    rsmRow.className = 'calc-rsm-row';

    var chart = document.createElement('div');
    chart.className = 'calc-rsm-chart';

    var surfaceCanvas = document.createElement('canvas');
    surfaceCanvas.className = 'calc-rsm-surface';
    surfaceCanvas.setAttribute('aria-hidden', 'true');

    var svg = svgEl('svg', {
      class: 'calc-rsm-svg',
      viewBox: '0 0 ' + SVG_W + ' ' + SVG_H,
      'aria-labelledby': 'calc-rsm-desc'
    });
    var descId = svgEl('desc', { id: 'calc-rsm-desc' });
    descId.textContent = 'Score selon l\'urgence et l\'impact, pour un niveau de facilité fixe';
    svg.appendChild(descId);

    var defs = svgEl('defs');

    var glowFilter = svgEl('filter', {
      id: 'calc-rsm-glow',
      x: '-80%',
      y: '-80%',
      width: '260%',
      height: '260%'
    });
    glowFilter.appendChild(svgEl('feGaussianBlur', { stdDeviation: '3', result: 'blur' }));
    var glowMerge = svgEl('feMerge');
    glowMerge.appendChild(svgEl('feMergeNode', { in: 'blur' }));
    glowMerge.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
    glowFilter.appendChild(glowMerge);
    defs.appendChild(glowFilter);

    var glassGrad = svgEl('linearGradient', {
      id: 'calc-rsm-glass',
      x1: '0%',
      y1: '0%',
      x2: '100%',
      y2: '100%'
    });
    var glassStop0 = svgEl('stop', { offset: '0%', 'stop-color': readCssVar('--surface-2', '#FFFFFF'), 'stop-opacity': '0.55' });
    var glassStop1 = svgEl('stop', { offset: '100%', 'stop-color': readCssVar('--surface-1', '#EFEDE8'), 'stop-opacity': '0.25' });
    glassGrad.appendChild(glassStop0);
    glassGrad.appendChild(glassStop1);
    defs.appendChild(glassGrad);

    function updateChartTheme() {
      glassStop0.setAttribute('stop-color', readCssVar('--surface-2', '#FFFFFF'));
      glassStop1.setAttribute('stop-color', readCssVar('--surface-1', '#EFEDE8'));
    }

    var plotClip = svgEl('clipPath', { id: 'calc-rsm-plot-clip' });
    plotClip.appendChild(svgEl('rect', {
      x: String(MARGIN.left),
      y: String(MARGIN.top),
      width: String(PLOT_W),
      height: String(PLOT_H),
      rx: '4'
    }));
    defs.appendChild(plotClip);
    svg.appendChild(defs);

    var frame = svgEl('rect', {
      class: 'calc-rsm-frame',
      x: '5',
      y: '5',
      width: String(SVG_W - 10),
      height: String(SVG_H - 10),
      rx: '8'
    });
    svg.appendChild(frame);

    var plotBg = svgEl('rect', {
      class: 'calc-rsm-plot-bg',
      x: String(MARGIN.left),
      y: String(MARGIN.top),
      width: String(PLOT_W),
      height: String(PLOT_H),
      rx: '4'
    });
    svg.appendChild(plotBg);

    var gridG = svgEl('g', { class: 'calc-rsm-grid', 'aria-hidden': 'true' });
    var g;
    for (g = 0; g <= 4; g++) {
      gridG.appendChild(lineEl(
        plotX(g), plotY(0), plotX(g), plotY(4), 'calc-rsm-grid-line'
      ));
      gridG.appendChild(lineEl(
        plotX(0), plotY(g), plotX(4), plotY(g), 'calc-rsm-grid-line'
      ));
    }
    svg.appendChild(gridG);

    var contoursG = svgEl('g', {
      class: 'calc-rsm-contours',
      'clip-path': 'url(#calc-rsm-plot-clip)',
      'aria-hidden': 'true'
    });
    svg.appendChild(contoursG);

    var plotHit = svgEl('rect', {
      class: 'calc-rsm-plot-hit',
      x: String(MARGIN.left),
      y: String(MARGIN.top),
      width: String(PLOT_W),
      height: String(PLOT_H),
      rx: '4'
    });
    svg.appendChild(plotHit);

    var axesG = svgEl('g', { class: 'calc-rsm-axes' });
    axesG.appendChild(lineEl(plotX(0), plotY(0), plotX(4), plotY(0), 'calc-rsm-axis calc-rsm-axis-x'));
    axesG.appendChild(lineEl(plotX(0), plotY(0), plotX(0), plotY(4), 'calc-rsm-axis calc-rsm-axis-y'));

    var ticksG = svgEl('g', { class: 'calc-rsm-ticks', 'aria-hidden': 'true' });
    for (g = 0; g <= 4; g++) {
      ticksG.appendChild(lineEl(plotX(g), plotY(0), plotX(g), plotY(0) + 3, 'calc-rsm-tick'));
      var tickLabelX = svgEl('text', { class: 'calc-rsm-tick-label' });
      tickLabelX.setAttribute('x', String(plotX(g)));
      tickLabelX.setAttribute('y', String(plotY(0) + 13));
      tickLabelX.setAttribute('text-anchor', 'middle');
      tickLabelX.textContent = String(g);
      ticksG.appendChild(tickLabelX);

      ticksG.appendChild(lineEl(plotX(0) - 3, plotY(g), plotX(0), plotY(g), 'calc-rsm-tick'));
      var tickLabelY = svgEl('text', { class: 'calc-rsm-tick-label' });
      tickLabelY.setAttribute('x', String(plotX(0) - 7));
      tickLabelY.setAttribute('y', String(plotY(g) + 3));
      tickLabelY.setAttribute('text-anchor', 'end');
      tickLabelY.textContent = String(g);
      ticksG.appendChild(tickLabelY);
    }
    axesG.appendChild(ticksG);

    var labelU = svgEl('text', { class: 'calc-rsm-axis-label calc-rsm-axis-label-x' });
    labelU.setAttribute('x', String(MARGIN.left + PLOT_W * 0.5));
    labelU.setAttribute('y', String(SVG_H - 4));
    labelU.setAttribute('text-anchor', 'middle');
    labelU.textContent = 'Urgence';
    labelU.setAttribute('title', KEYWORDS.urgency);

    var labelIY = MARGIN.top + PLOT_H * 0.5;
    var labelIX = plotX(0) - 16;
    var labelI = svgEl('text', { class: 'calc-rsm-axis-label calc-rsm-axis-label-y' });
    labelI.setAttribute('transform', 'rotate(-90 ' + labelIX + ' ' + labelIY + ')');
    labelI.setAttribute('x', String(labelIX));
    labelI.setAttribute('y', String(labelIY));
    labelI.setAttribute('text-anchor', 'middle');
    labelI.textContent = 'Impact';
    labelI.setAttribute('title', KEYWORDS.impact);

    axesG.appendChild(labelU);
    axesG.appendChild(labelI);
    svg.appendChild(axesG);

    var markerCrossG = svgEl('g', {
      class: 'calc-rsm-marker-crosshair',
      'clip-path': 'url(#calc-rsm-plot-clip)'
    });
    var crossH = lineEl(0, 0, 0, 0, 'calc-rsm-crosshair calc-rsm-crosshair-h');
    var crossV = lineEl(0, 0, 0, 0, 'calc-rsm-crosshair calc-rsm-crosshair-v');
    markerCrossG.appendChild(crossH);
    markerCrossG.appendChild(crossV);

    var markerG = svgEl('g', { class: 'calc-rsm-marker' });
    var markerShadow = svgEl('circle', { class: 'calc-rsm-marker-shadow' });
    var markerCore = svgEl('circle', { class: 'calc-rsm-marker-core' });
    var markerHit = svgEl('circle', { class: 'calc-rsm-marker-hit' });
    markerG.appendChild(markerShadow);
    markerG.appendChild(markerCore);
    markerG.appendChild(markerHit);

    svg.appendChild(markerCrossG);
    svg.appendChild(markerG);

    var easeCol = document.createElement('div');
    easeCol.className = 'calc-rsm-ease-col';
    easeCol.title = KEYWORDS.ease;

    var easeLabelTop = document.createElement('span');
    easeLabelTop.className = 'calc-rsm-ease-label calc-rsm-ease-label-top';
    easeLabelTop.textContent = '5';

    var easeSlider = document.createElement('input');
    easeSlider.type = 'range';
    easeSlider.className = 'calc-rsm-ease-range';
    easeSlider.min = '1';
    easeSlider.max = '5';
    easeSlider.step = String(SLIDER_STEP);
    easeSlider.value = '3';
    easeSlider.setAttribute('aria-label', 'Facilité');
    easeSlider.title = KEYWORDS.ease;

    var easeLabelBottom = document.createElement('span');
    easeLabelBottom.className = 'calc-rsm-ease-label calc-rsm-ease-label-bottom';
    easeLabelBottom.textContent = '1';

    easeCol.appendChild(easeLabelTop);
    easeCol.appendChild(easeSlider);
    easeCol.appendChild(easeLabelBottom);

    chart.appendChild(surfaceCanvas);
    chart.appendChild(svg);
    rsmRow.appendChild(chart);
    rsmRow.appendChild(easeCol);
    rsmWrap.appendChild(rsmRow);

    graphSection.appendChild(rsmWrap);
    body.appendChild(graphSection);
    panel.appendChild(body);
    el.appendChild(panel);

    var graphCollapsed = true;
    var graphCollapse = null;
    var surfaceCtx = surfaceCanvas.getContext('2d', { alpha: true });

    function clientToPlotClamped(clientX, clientY) {
      var rect = plotHit.getBoundingClientRect();
      var x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      var y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      return plotCoordsFromLocal(x, y, rect.width, rect.height);
    }

    function plotCoordsFromLocal(x, y, w, h) {
      return {
        u: (x / w) * AXIS_UI_MAX,
        i: (1 - y / h) * AXIS_UI_MAX
      };
    }

    function plotAreaMetrics() {
      void chart.offsetWidth;
      var chartRect = chart.getBoundingClientRect();
      var plotRect = plotHit.getBoundingClientRect();
      if (chartRect.width < 1 || chartRect.height < 1 || plotRect.width < 1 || plotRect.height < 1) {
        return null;
      }
      var cssW = plotRect.width;
      var cssH = plotRect.height;
      var scaleX = cssW / PLOT_W;
      return {
        left: plotRect.left - chartRect.left,
        top: plotRect.top - chartRect.top,
        cssW: cssW,
        cssH: cssH,
        radius: Math.max(1, 4 * scaleX)
      };
    }

    function resizeSurfaceCanvas() {
      var metrics = plotAreaMetrics();
      if (!metrics) {
        return null;
      }
      var cssW = metrics.cssW;
      var cssH = metrics.cssH;
      var dpr = window.devicePixelRatio || 1;
      var bmpW = Math.max(1, Math.round(cssW * dpr));
      var bmpH = Math.max(1, Math.round(cssH * dpr));
      surfaceCanvas.style.left = metrics.left + 'px';
      surfaceCanvas.style.top = metrics.top + 'px';
      surfaceCanvas.style.width = cssW + 'px';
      surfaceCanvas.style.height = cssH + 'px';
      surfaceCanvas.style.borderRadius = metrics.radius + 'px';
      surfaceCanvas.width = bmpW;
      surfaceCanvas.height = bmpH;
      // Setting canvas bitmap dims can reset layout size in some engines.
      surfaceCanvas.style.width = cssW + 'px';
      surfaceCanvas.style.height = cssH + 'px';
      surfaceCanvas.style.borderRadius = metrics.radius + 'px';
      // putImageData ignores the context transform — paint at device-pixel size directly.
      surfaceCtx.setTransform(1, 0, 0, 1, 0, 0);
      return { w: bmpW, h: bmpH };
    }

    function paintSurface(F) {
      var size = resizeSurfaceCanvas();
      if (!size) {
        surfaceCanvas.style.visibility = 'hidden';
        return false;
      }
      surfaceCanvas.style.visibility = 'visible';
      var w = size.w;
      var h = size.h;
      var img = surfaceCtx.createImageData(w, h);
      var data = img.data;
      var px;
      for (var row = 0; row < h; row++) {
        var i = (1 - row / (h - 1 || 1)) * 4;
        for (var col = 0; col < w; col++) {
          var u = (col / (w - 1 || 1)) * 4;
          var score = baselineScore(u, i, F);
          var rgb = scoreToRgb(score);
          px = (row * w + col) * 4;
          data[px] = rgb.r;
          data[px + 1] = rgb.g;
          data[px + 2] = rgb.b;
          data[px + 3] = Math.round(SCORE_SURFACE_ALPHA * 255);
        }
      }
      surfaceCtx.putImageData(img, 0, 0);
      return true;
    }

    function lerpPlot(a, b, t) {
      return a + (b - a) * t;
    }

    function contourSegment(values, row, col, threshold) {
      var v0 = values[row][col];
      var v1 = values[row][col + 1];
      var v2 = values[row + 1][col + 1];
      var v3 = values[row + 1][col];
      var mask = 0;
      if (v0 >= threshold) mask |= 1;
      if (v1 >= threshold) mask |= 2;
      if (v2 >= threshold) mask |= 4;
      if (v3 >= threshold) mask |= 8;
      if (mask === 0 || mask === 15) return null;

      var x0 = plotX((col / CONTOUR_RES) * 4);
      var x1 = plotX(((col + 1) / CONTOUR_RES) * 4);
      var y0 = plotY((1 - row / CONTOUR_RES) * 4);
      var y1 = plotY((1 - (row + 1) / CONTOUR_RES) * 4);

      function interp(va, vb, xa, ya, xb, yb) {
        var t = (threshold - va) / (vb - va);
        return {
          x: lerpPlot(xa, xb, t),
          y: lerpPlot(ya, yb, t)
        };
      }

      var top = interp(v0, v1, x0, y0, x1, y0);
      var right = interp(v1, v2, x1, y0, x1, y1);
      var bottom = interp(v3, v2, x0, y1, x1, y1);
      var left = interp(v0, v3, x0, y0, x0, y1);

      var segments = {
        1: [[left, top]], 2: [[top, right]], 3: [[left, right]], 4: [[right, bottom]],
        5: [[left, bottom], [top, right]], 6: [[top, bottom]], 7: [[left, bottom]],
        8: [[bottom, left]], 9: [[top, bottom]], 10: [[top, left], [right, bottom]],
        11: [[right, bottom]], 12: [[right, left]], 13: [[top, right]], 14: [[top, left]]
      };
      return segments[mask] || null;
    }

    function paintContours(F) {
      contoursG.innerHTML = '';
      var values = [];
      var r;
      for (r = 0; r <= CONTOUR_RES; r++) {
        values[r] = [];
        var i = (1 - r / CONTOUR_RES) * 4;
        var c;
        for (c = 0; c <= CONTOUR_RES; c++) {
          var u = (c / CONTOUR_RES) * 4;
          values[r][c] = baselineScore(u, i, F);
        }
      }

      TIER_THRESHOLDS.forEach(function (threshold) {
        var row;
        for (row = 0; row < CONTOUR_RES; row++) {
          var col;
          for (col = 0; col < CONTOUR_RES; col++) {
            var segs = contourSegment(values, row, col, threshold);
            if (!segs) continue;
            segs.forEach(function (seg) {
              contoursG.appendChild(lineEl(
                seg[0].x, seg[0].y, seg[1].x, seg[1].y, 'calc-rsm-contour'
              ));
            });
          }
        }
      });
    }

    function paintMarker(U, I, display) {
      var d = display;
      var cx = plotX(U);
      var cy = plotY(I);
      var span = 7;

      crossH.setAttribute('x1', String(cx - span));
      crossH.setAttribute('y1', String(cy));
      crossH.setAttribute('x2', String(cx + span));
      crossH.setAttribute('y2', String(cy));
      crossV.setAttribute('x1', String(cx));
      crossV.setAttribute('y1', String(cy - span));
      crossV.setAttribute('x2', String(cx));
      crossV.setAttribute('y2', String(cy + span));

      markerShadow.setAttribute('cx', String(cx));
      markerShadow.setAttribute('cy', String(cy + 0.75));
      markerShadow.setAttribute('r', String(MARKER_SHADOW_R));

      markerCore.setAttribute('cx', String(cx));
      markerCore.setAttribute('cy', String(cy));
      markerCore.setAttribute('r', String(MARKER_CORE_R));
      markerCore.setAttribute('fill', readCssVar('--chart-marker-core', '#FFFFFF'));
      markerCore.setAttribute('stroke', d.inutile
        ? readCssVar('--chart-marker-stroke-inutile', '#9B9890')
        : d.seg);
      markerCore.setAttribute('stroke-width', String(MARKER_STROKE_W));

      markerHit.setAttribute('cx', String(cx));
      markerHit.setAttribute('cy', String(cy));
      markerHit.setAttribute('r', String(MARKER_HIT_R));

      markerG.classList.toggle('is-inutile', d.inutile);

      markerG.setAttribute('aria-label',
        formatScore(d.score) + ' · ' + d.label +
        ' — U ' + U.toFixed(2) + ', I ' + I.toFixed(2) + ', F ' + formatEase(lastScene.F)
      );
    }

    function cancelDragMoveRaf() {
      if (dragMoveRaf != null) {
        cancelAnimationFrame(dragMoveRaf);
        dragMoveRaf = null;
      }
      pendingDragPt = null;
    }

    function scheduleDragApply(pt) {
      pendingDragPt = pt;
      if (dragMoveRaf != null) return;
      dragMoveRaf = requestAnimationFrame(function () {
        dragMoveRaf = null;
        var p = pendingDragPt;
        pendingDragPt = null;
        if (!p || !draggingMarker) return;
        applyUrgencyImpact(p.u, p.i);
      });
    }

    function updateDragMarkerVisual() {
      if (!draggingMarker || dragVisual.u == null || dragVisual.i == null || !lastScene.display) {
        return;
      }
      paintMarker(dragVisual.u, dragVisual.i, lastScene.display);
    }

    function startUIDrag(e, captureEl) {
      if (e.button !== 0) return;
      draggingMarker = true;
      dragPointerId = e.pointerId;
      markerG.classList.add('is-dragging');
      chart.classList.add('is-dragging-marker');
      captureEl.setPointerCapture(e.pointerId);
      e.preventDefault();
      var pt = clientToPlotClamped(e.clientX, e.clientY);
      if (!pt) return;
      dragVisual.u = clamp(pt.u, 0, 4);
      dragVisual.i = clamp(pt.i, 0, 4);
      applyUrgencyImpact(pt.u, pt.i);
    }

    function moveUIDrag(e) {
      if (!draggingMarker || e.pointerId !== dragPointerId) return;
      var pt = clientToPlotClamped(e.clientX, e.clientY);
      if (!pt) return;
      dragVisual.u = clamp(pt.u, 0, 4);
      dragVisual.i = clamp(pt.i, 0, 4);
      updateDragMarkerVisual();
      scheduleDragApply(pt);
    }

    function endUIDrag(e, captureEl) {
      if (!draggingMarker || e.pointerId !== dragPointerId) return;
      cancelDragMoveRaf();
      draggingMarker = false;
      dragPointerId = null;
      dragVisual.u = null;
      dragVisual.i = null;
      markerG.classList.remove('is-dragging');
      chart.classList.remove('is-dragging-marker');
      try {
        captureEl.releasePointerCapture(e.pointerId);
      } catch (err) { /* noop */ }
      var pt = clientToPlotClamped(e.clientX, e.clientY);
      if (pt) applyUrgencyImpact(pt.u, pt.i);
      else onInputsChange();
    }

    plotHit.addEventListener('pointerdown', function (e) {
      startUIDrag(e, plotHit);
    });
    plotHit.addEventListener('pointermove', moveUIDrag);
    plotHit.addEventListener('pointerup', function (e) {
      endUIDrag(e, plotHit);
    });
    plotHit.addEventListener('pointercancel', function (e) {
      endUIDrag(e, plotHit);
    });

    markerHit.addEventListener('pointerdown', function (e) {
      startUIDrag(e, markerHit);
    });

    markerHit.addEventListener('pointermove', moveUIDrag);

    markerHit.addEventListener('pointerup', function (e) {
      endUIDrag(e, markerHit);
    });
    markerHit.addEventListener('pointercancel', function (e) {
      endUIDrag(e, markerHit);
    });

    function handleEaseInput() {
      applyEase(+easeSlider.value);
    }
    easeSlider.addEventListener('input', handleEaseInput);
    easeSlider.addEventListener('change', handleEaseInput);

    var chartResizeObserver;
    var layoutSurfaceRaf = null;

    function scheduleLayoutSurfacePaint() {
      if (layoutSurfaceRaf != null) {
        cancelAnimationFrame(layoutSurfaceRaf);
      }
      layoutSurfaceRaf = requestAnimationFrame(function () {
        layoutSurfaceRaf = requestAnimationFrame(function () {
          layoutSurfaceRaf = null;
          repaintSurfaceFromLayout();
        });
      });
    }

    function repaintSurfaceFromLayout() {
      if (!lastScene.result || draggingMarker) return;
      paintSurface(lastScene.F);
    }

    if (typeof ResizeObserver !== 'undefined') {
      chartResizeObserver = new ResizeObserver(function () {
        repaintSurfaceFromLayout();
      });
      chartResizeObserver.observe(chart);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', repaintSurfaceFromLayout);
    }

    function paint(result, inputs, display) {
      var terms = result.terms || {};
      var U = terms.U != null ? terms.U : inputs.urgency;
      var I = terms.I != null ? terms.I : inputs.impact;
      var F = terms.F != null ? terms.F : inputs.ease;
      var d = display || resolveDisplay(result, inputs);

      lastScene.U = U;
      lastScene.I = I;
      lastScene.F = F;
      lastScene.result = result;
      lastScene.display = d;

      var markerU = U;
      var markerI = I;
      if (draggingMarker && dragVisual.u != null && dragVisual.i != null) {
        markerU = dragVisual.u;
        markerI = dragVisual.i;
      }

      if (!graphCollapsed && !draggingMarker) {
        paintContours(F);
        paintSurface(F);
        scheduleLayoutSurfacePaint();
      }
      paintMarker(markerU, markerI, d);

      var fStr = String(F);
      if (document.activeElement !== easeSlider && easeSlider.value !== fStr) {
        easeSlider.value = fStr;
      }

      descId.textContent =
        'Priorité selon urgence ' + U.toFixed(2) + ' et impact ' + I.toFixed(2) +
        ', facilité ' + formatEase(F) + '/5' +
        ' — score ' + formatScore(d.score) + ', palier ' + d.label;
    }

    function setGraphCollapsed(collapsed) {
      if (!graphCollapse) return;
      graphCollapse.setExpanded(!collapsed);
    }

    function syncGraphVisibility() {
      if (!graphCollapse) return;
      graphCollapsed = !graphCollapse.isExpanded();
      panel.classList.toggle('is-collapsed', graphCollapsed);
      panel.classList.toggle('is-enabled', true);
      if (!graphCollapsed && lastScene.result) {
        paint(lastScene.result, {
          urgency: lastScene.U,
          impact: lastScene.I,
          ease: lastScene.F
        }, lastScene.display);
      } else if (!graphCollapsed) {
        scheduleLayoutSurfacePaint();
      }
      onToggle(!graphCollapsed);
    }

    graphCollapse = bindCollapsibleEnable({
      field: panel,
      body: body,
      chrome: chrome,
      alwaysEnabled: true,
      enabled: true,
      expanded: config.expanded != null ? !!config.expanded : false,
      onExpandChange: config.onExpandChange || null,
      onLayoutChange: function () {
        syncGraphVisibility();
      }
    });
    graphCollapsed = !graphCollapse.isExpanded();

    return {
      el: panel,
      paint: paint,
      updateTheme: updateChartTheme,
      setCollapsed: setGraphCollapsed,
      setEnabled: function () { /* Graphique is always enabled */ },
      isEnabled: function () { return true; },
      isExpanded: function () { return !!(graphCollapse && graphCollapse.isExpanded()); },
      disconnect: function () {
        if (chartResizeObserver) chartResizeObserver.disconnect();
        if (layoutSurfaceRaf != null) {
          cancelAnimationFrame(layoutSurfaceRaf);
          layoutSurfaceRaf = null;
        }
      }
    };
  }

  // ── 10. Variant mount & slider persistence ──────────────────────────────

  function normalizeFormulaKey(key) {
    return FORMULAS[key] ? key : 'baseline';
  }

  function loadStoredFormulaKey() {
    try {
      if (typeof localStorage === 'undefined') return null;
      var raw = localStorage.getItem(FORMULA_STORAGE_KEY);
      if (!raw) return null;
      return FORMULAS[raw] ? raw : null;
    } catch (e) { return null; }
  }

  function saveStoredFormulaKey(key) {
    try {
      if (typeof localStorage === 'undefined') return;
      if (!FORMULAS[key]) return;
      localStorage.setItem(FORMULA_STORAGE_KEY, key);
    } catch (e) { /* ignore quota / private mode */ }
  }

  function loadSliderValues(defaults, dimensions) {
    var merged = Object.assign({}, defaults);
    try {
      if (typeof localStorage === 'undefined') return merged;
      var raw = localStorage.getItem(SLIDER_STORAGE_KEY);
      if (!raw) return merged;
      var stored = JSON.parse(raw);
      if (!stored || typeof stored !== 'object') return merged;
      dimensions.forEach(function (dim) {
        var v = stored[dim.key];
        if (typeof v === 'number' && isFinite(v)) {
          merged[dim.key] = clamp(v, dim.min, dim.max);
        }
      });
      if (stored.estimatedDurationMinutes != null) {
        merged.estimatedDurationMinutes = clampDurationMinutes(
          stored.estimatedDurationMinutes
        );
      }
    } catch (e) { /* ignore corrupt storage */ }
    return merged;
  }

  function saveSliderValues(state) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SLIDER_STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore quota / private mode */ }
  }

  function mountVariantFailedStub(containerEl, variantConfig, err) {
    var variantId = (variantConfig && variantConfig.id) || 'unknown';
    var formulaKey = (variantConfig && variantConfig.formula) || 'baseline';
    console.error('PriorityUI.mountVariant failed', {
      id: variantId,
      formula: formulaKey,
      error: err
    });
    if (containerEl) {
      containerEl.replaceChildren();
      var notice = document.createElement('p');
      notice.className = 'variant-mount-error';
      notice.textContent = 'Une partie de l\u2019\u00e9diteur n\u2019a pas pu se charger.';
      containerEl.appendChild(notice);
    }
    return {
      card: null,
      getState: function () { return {}; },
      setState: function () {},
      repaint: function () {}
    };
  }

  function mountVariant(containerEl, variantConfig) {
    var variantId = variantConfig.id || 'unknown';
    try {
    var formulaKey = variantConfig.formula || loadStoredFormulaKey() || 'baseline';
    var formulaDef = FORMULAS[formulaKey] || FORMULAS.baseline;
    var calcFn = formulaDef.calc;
    var overrideFn = formulaDef.override;

    var card = document.createElement('article');
    card.className = 'variant-card';
    card.dataset.variant = variantConfig.id;

    var defaults = variantConfig.defaults || {};
    var fields = {};
    var state = {};
    var enAttenteField;
    var dueDateField;
    var dueSection;
    var blockedSection;
    var heat;
    var priorityField;
    var calcGraph;
    var formulaSwitcher;
    var sliderAnimFrame = null;
    var focusSection = variantConfig.focusSection || null;

    function sectionExpandedDefault(key, enabledFallback) {
      if (key === 'graph') return false;
      // Opening focused on one section should not auto-expand the others.
      if (focusSection && key !== focusSection) return false;
      if (focusSection && key === focusSection) return true;
      return !!enabledFallback;
    }

    function sectionExpanded(key, enabledFallback) {
      // Mirror Progrès: focused entry expands that section even if collapse prefs say otherwise.
      if (focusSection && key === focusSection) return true;
      return resolveSectionExpanded(key, sectionExpandedDefault(key, enabledFallback));
    }

    function persistSectionExpanded(key) {
      return function (isExpanded) {
        var patch = {};
        patch[key] = !!isExpanded;
        saveSectionCollapseState(patch);
      };
    }

    function applyFormulaMode(key) {
      formulaKey = key || 'baseline';
      formulaDef = FORMULAS[formulaKey] || FORMULAS.baseline;
      calcFn = formulaDef.calc;
      overrideFn = formulaDef.override;
      card.dataset.formula = formulaKey;
      if (heat) {
        heat.setFormulaKey(formulaKey);
        heat.setHideSegments(formulaKey === 'eisenhower');
      }
    }

    function persistFormulaChange(nextKey) {
      applyFormulaMode(nextKey);
      saveStoredFormulaKey(nextKey);
      if (typeof variantConfig.onFormulaChange === 'function') {
        variantConfig.onFormulaChange(nextKey);
      }
      repaint();
    }

    var defaultState = {};
    variantConfig.dimensions.forEach(function (dim) {
      defaultState[dim.key] = defaults[dim.key] != null ? defaults[dim.key] : dim.value;
    });
    state = typeof variantConfig.loadState === 'function'
      ? variantConfig.loadState(defaultState)
      : loadSliderValues(defaultState, variantConfig.dimensions);
    state.enAttente = !!(state.enAttente || defaults.enAttente);
    state.blockedReasons = normalizeBlockedReasons(
      state.blockedReasons != null || state.blockedReason != null
        ? state
        : defaults
    );
    delete state.blockedReason;
    state.blockedLinks = normalizeBlockedLinks(
      state.blockedLinks != null || state.blockedLink != null
        ? state
        : defaults
    );
    if (!isBlockedWaitingOtherTask(state.blockedReasons) && !state.blockedLinks.length) {
      state.blockedLinks = [];
    } else if (state.blockedLinks.length && !isBlockedWaitingOtherTask(state.blockedReasons)) {
      state.blockedReasons = normalizeBlockedReasons(
        state.blockedReasons.concat([BLOCKED_REASON_WAITING_OTHER_TASK])
      );
    }
    delete state.blockedLink;
    state.dueDate = normalizeDueDate(state.dueDate || defaults.dueDate || '');
    state.dueTime = state.dueDate
      ? normalizeDueTime(state.dueTime || defaults.dueTime || '')
      : '';
    if (defaults.dueEnabled === false || state.dueEnabled === false) {
      state.dueEnabled = false;
    } else {
      state.dueEnabled = state.dueDate ? true : (defaults.dueEnabled !== false);
      if (!state.dueDate) state.dueEnabled = false;
    }
    state.startDate = normalizeDueDate(
      state.startDate || defaults.startDate || ''
    );
    state.recurrence = normalizeRecurrence(
      state.recurrence != null ? state.recurrence : defaults.recurrence
    );
    // Priorité is always on (no enable checkbox).
    state.priorityEnabled = true;
    state.estimatedDurationMinutes = clampDurationMinutes(
      state.estimatedDurationMinutes != null
        ? state.estimatedDurationMinutes
        : defaults.estimatedDurationMinutes
    );

    var priorityCollapse = null;
    var lastPriorityDisplay = null;
    var durationControl = null;

    function buildPrioritySummary() {
      var d = lastPriorityDisplay;
      var label = d && d.label ? d.label : '';
      if (!label) return '';
      var wrap = document.createElement('span');
      wrap.className = 'priority-summary';
      var visualSource = d.inutile
        ? { inutile: true, label: INUTILE_LABEL }
        : { i: d.tierI, label: d.label };
      var v = tierVisuals(visualSource);
      var dot = document.createElement('span');
      dot.className = 'heat-tier-dot priority-summary-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.style.setProperty(
        '--heat-tier-dot-size',
        heatTierDotSizePx(d).toFixed(2) + 'px'
      );
      if (v.seg) dot.style.background = v.seg;
      wrap.classList.toggle('is-inutile', !!d.inutile);
      var text = document.createElement('span');
      text.className = 'priority-summary-label';
      text.textContent = label;
      wrap.appendChild(dot);
      wrap.appendChild(text);
      return wrap;
    }

    var suppressPersist = false;

    function persistSliderState(skipFieldSync) {
      if (suppressPersist) return;
      if (!skipFieldSync) syncStateFromFields();
      if (typeof variantConfig.onStateChange === 'function') {
        // Copy so callers (popup save / Information recap) are not affected when
        // animation frames or getState() later sync from in-flight slider DOM.
        variantConfig.onStateChange(Object.assign({}, state));
      } else {
        saveSliderValues(state);
      }
    }

    function syncStateFromFields() {
      Object.keys(fields).forEach(function (key) {
        state[key] = fields[key].getValue();
      });
      if (priorityCollapse) {
        state.priorityEnabled = true;
      }
      if (enAttenteField) {
        state.enAttente = enAttenteField.getValue();
        state.blockedReasons = enAttenteField.getBlockedReasons
          ? enAttenteField.getBlockedReasons()
          : normalizeBlockedReasons(enAttenteField.getBlockedReason());
        delete state.blockedReason;
        state.blockedLinks = enAttenteField.getBlockedLinks
          ? enAttenteField.getBlockedLinks()
          : normalizeBlockedLinks(
              enAttenteField.getBlockedLink ? enAttenteField.getBlockedLink() : null
            );
        delete state.blockedLink;
      }
      if (dueDateField) {
        var dueValues = dueDateField.getValues();
        state.dueDate = dueValues.dueDate;
        state.dueTime = dueValues.dueTime;
        state.dueEnabled = !!dueValues.dueEnabled;
        state.startDate = dueValues.startDate || '';
        state.recurrence = dueValues.recurrence || null;
      }
      if (durationControl) {
        state.estimatedDurationMinutes = durationControl.getMinutes();
      }
    }

    function cancelSliderAnim() {
      if (sliderAnimFrame != null) {
        cancelAnimationFrame(sliderAnimFrame);
        sliderAnimFrame = null;
      }
    }

    function animateFieldsTo(targets) {
      cancelSliderAnim();
      var from = {};
      var keys = Object.keys(targets);
      keys.forEach(function (key) {
        from[key] = fields[key] ? fields[key].getValue() : (state[key] != null ? state[key] : targets[key]);
      });
      var allSame = keys.every(function (key) {
        return Math.abs(from[key] - targets[key]) < 1e-9;
      });
      if (allSame) {
        keys.forEach(function (key) {
          state[key] = targets[key];
          if (fields[key]) fields[key].setValue(targets[key]);
        });
        repaint();
        persistSliderState();
        return;
      }

      // Persist target values before the visual animation so a fast modal close
      // cannot skip the Trello save while sliders are still animating.
      keys.forEach(function (key) {
        state[key] = targets[key];
      });
      persistSliderState(true);

      var startTime = null;
      function step(ts) {
        if (startTime == null) startTime = ts;
        var t = Math.min(1, (ts - startTime) / SLIDER_ANIM_MS);
        var eased = easeOutCubic(t);
        keys.forEach(function (key) {
          if (fields[key]) {
            fields[key].updateDisplay(lerp(from[key], targets[key], eased));
          }
        });
        repaint();
        if (t < 1) {
          sliderAnimFrame = requestAnimationFrame(step);
        } else {
          sliderAnimFrame = null;
          keys.forEach(function (key) {
            if (fields[key]) fields[key].setValue(targets[key]);
          });
          repaint();
        }
      }
      sliderAnimFrame = requestAnimationFrame(step);
    }

    function repaint() {
      try {
        syncStateFromFields();
        var result = calcFn(state);
        var display = resolveDisplay(result, state);
        lastPriorityDisplay = display;
        if (priorityCollapse) priorityCollapse.refreshSummary();
        var cardTier = display.cardTier;
        // Blocked/overdue red is section-scoped (Bloqué / Échéance), not a full-card wash.
        // Never force --card-tier-tint to blocked crimson on .variant-card.
        card.classList.remove('is-blocked', 'is-overdue');
        if (state.priorityEnabled === false && !display.blocked && !display.duePast) {
          card.classList.remove('is-inutile');
          card.dataset.tier = '';
          clearCardTierTint(card);
        } else {
          applyCardTierTint(card, cardTier);
          card.classList.toggle('is-inutile', !!display.inutile);
          card.dataset.tier = display.label || '';
        }
        if (blockedSection) {
          blockedSection.classList.toggle('is-blocked', !!display.blocked);
        }
        if (dueSection) {
          var dueBand =
            state.dueEnabled !== false && normalizeDueDate(state.dueDate)
              ? dueProximityBand(state.dueDate, state.dueTime)
              : '';
          applyDueProximityBand(dueSection, dueBand);
        }
        applyPrioritySectionTint(
          priorityField,
          display,
          state.priorityEnabled !== false
        );
        if (heat) heat.paint(result, display);
        if (calcGraph) calcGraph.paint(result, state, display);
      } catch (err) {
        console.error('PriorityUI.mountVariant repaint failed', { id: variantId, error: err });
      }
    }

    if (variantConfig.showFormulaSwitcher === true) {
      formulaSwitcher = createFormulaSwitcher({
        el: card,
        formulaKey: formulaKey,
        onChange: persistFormulaChange
      });
    }

    // Card title lives in the Information panel (createInfoField) when mounted by the popup.
    if (variantConfig.showCardHeader === true && !variantConfig.hideCardHeader) {
      var cardHeader = document.createElement('header');
      cardHeader.className = 'tp-priority-card-header';
      var cardNameLabel = document.createElement('p');
      cardNameLabel.className = 'tp-priority-card-name is-loading';
      cardNameLabel.id = 'cardName';
      cardNameLabel.setAttribute('aria-live', 'polite');
      cardNameLabel.textContent = 'Chargement\u2026';
      cardHeader.appendChild(cardNameLabel);
      card.appendChild(cardHeader);
    }

    var prioritySection = document.createElement('div');
    prioritySection.className = 'variant-priority-section';

    priorityField = document.createElement('div');
    priorityField.className = 'field field--priority';

    var priorityBodyId = 'priority-section-body-' + Math.random().toString(36).slice(2, 9);
    var priorityChrome = createCollapsibleEnableChrome({
      title: 'Priorit\u00e9',
      bodyId: priorityBodyId,
      hideEnable: true,
      leadingIcon: 'ti-flame',
      iconClass: 'priority-leading-icon',
      titleClass: 'priority-enable-title',
      collapseLabel: 'Replier Priorit\u00e9',
      expandLabel: 'D\u00e9velopper Priorit\u00e9'
    });
    priorityField.appendChild(priorityChrome.head);

    var priorityBody = document.createElement('div');
    priorityBody.className = 'priority-section-body section-toggle-body';
    priorityBody.id = priorityBodyId;

    heat = createHeatPanel({
      el: priorityBody,
      formulaKey: formulaKey,
      hideSegments: formulaKey === 'eisenhower',
      onSegmentClick: function (targetP) {
        if (state.priorityEnabled === false) return;
        syncStateFromFields();
        var clickedSeg = heatSegmentForTarget(targetP);
        var display = resolveDisplay(calcFn(state), state);
        if (
          clickedSeg &&
          !display.inutile &&
          display.tierI != null &&
          display.tierI === clickedSeg.i
        ) {
          return;
        }
        var next = (clickedSeg && clickedSeg.preset)
          ? Object.assign({}, state, clickedSeg.preset)
          : overrideFn(targetP, state);
        var delta = pickOverrideDelta(state, next);
        if (!Object.keys(delta).length) return;
        animateFieldsTo(delta);
      }
    });

    var fieldsSection = document.createElement('div');
    fieldsSection.className = 'variant-fields-section';

    var fieldsWrap = document.createElement('div');
    fieldsWrap.className = 'variant-fields';

    fieldsSection.appendChild(fieldsWrap);
    priorityBody.appendChild(fieldsSection);
    priorityField.appendChild(priorityBody);
    prioritySection.appendChild(priorityField);
    card.appendChild(prioritySection);

    priorityCollapse = bindCollapsibleEnable({
      field: priorityField,
      body: priorityBody,
      chrome: priorityChrome,
      alwaysEnabled: true,
      enabled: true,
      expanded: sectionExpanded('priority', true),
      getSummary: function () {
        return buildPrioritySummary();
      },
      onLayoutChange: function () {
        if (typeof variantConfig.onLayoutChange === 'function') {
          variantConfig.onLayoutChange();
        }
      },
      onExpandChange: persistSectionExpanded('priority'),
      onEnableChange: function () {
        state.priorityEnabled = true;
        cancelSliderAnim();
        persistSliderState(true);
        repaint();
        if (typeof variantConfig.onLayoutChange === 'function') {
          variantConfig.onLayoutChange();
        }
      }
    });

    var wizardHooks = {
      getValue: function (key) {
        return fields[key] ? fields[key].getValue() : state[key];
      },
      setValue: function (key, level) {
        if (fields[key]) fields[key].setValue(level);
        state[key] = level;
        cancelSliderAnim();
        repaint();
        persistSliderState();
      }
    };

    var experimental =
      variantConfig.experimental && typeof variantConfig.experimental === 'object'
        ? variantConfig.experimental
        : {};
    var showImpactGlobe = experimental.impactGlobe === true;
    // Facilité hourglass deprecated — estimates live in Progrès.
    var showEaseHourglass = false;

    variantConfig.dimensions.forEach(function (dim, dimIndex) {
      fields[dim.key] = createField({
        el: fieldsWrap,
        id: variantConfig.id + '-' + dim.key,
        label: dim.label,
        icon: dim.icon,
        wordsKey: dim.wordsKey || dim.key,
        min: dim.min,
        max: dim.max,
        value: state[dim.key],
        showImpactGlobe: showImpactGlobe,
        onChange: function () {
          cancelSliderAnim();
          repaint();
          persistSliderState();
        },
        wizard: {
          dimensions: variantConfig.dimensions,
          step: dimIndex,
          getValue: wizardHooks.getValue,
          setValue: wizardHooks.setValue
        }
      });
      if (
        showEaseHourglass &&
        dim.key === 'ease' &&
        fields[dim.key] &&
        fields[dim.key].el
      ) {
        durationControl = createEstimatedDurationControl({
          el: fields[dim.key].el,
          value: state.estimatedDurationMinutes,
          onChange: function (minutes) {
            state.estimatedDurationMinutes = minutes;
            persistSliderState(true);
            if (typeof variantConfig.onLayoutChange === 'function') {
              variantConfig.onLayoutChange();
            }
          }
        });
        fields[dim.key].el.classList.add('field--ease-duration');
      }
    });

    try {
      calcGraph = createCalcGraphPanel({
        el: fieldsSection,
        fields: fields,
        expanded: sectionExpanded('graph', false),
        onExpandChange: persistSectionExpanded('graph'),
        onChange: function () {
          cancelSliderAnim();
          repaint();
          persistSliderState();
        },
        onToggle: function () {
          if (typeof variantConfig.onLayoutChange === 'function') {
            variantConfig.onLayoutChange();
          }
        }
      });
    } catch (err) {
      console.error('PriorityUI.createCalcGraphPanel failed', { id: variantId, error: err });
    }

    dueSection = document.createElement('div');
    dueSection.className = 'variant-due-section';
    card.appendChild(dueSection);

    var dueEnabledInitial = state.dueEnabled !== false && !!state.dueDate;
    dueDateField = createDueDateField({
      el: dueSection,
      value: {
        dueDate: state.dueDate,
        dueTime: state.dueTime,
        dueEnabled: dueEnabledInitial,
        startDate: state.startDate,
        recurrence: state.recurrence
      },
      expanded: sectionExpanded('due', dueEnabledInitial),
      onExpandChange: persistSectionExpanded('due'),
      onChange: function () {
        cancelSliderAnim();
        repaint();
        persistSliderState();
      },
      onLayoutChange: function () {
        if (typeof variantConfig.onLayoutChange === 'function') {
          variantConfig.onLayoutChange();
        }
      }
    });

    // Bloqué reasons live inside Progrès → Statut (mounted by the popup into statut's slot).
    blockedSection = document.createElement('div');
    blockedSection.className = 'variant-blocked-section';

    enAttenteField = createEnAttenteField({
      el: blockedSection,
      embedded: true,
      value: state.enAttente,
      blockedReasons: state.blockedReasons,
      blockedLinks: state.blockedLinks,
      getSubtasks: function () {
        return typeof variantConfig.getBlockedSubtasks === 'function'
          ? variantConfig.getBlockedSubtasks() || []
          : [];
      },
      onBlockedReasonAdded: function (reason) {
        if (typeof variantConfig.onBlockedReasonAdded === 'function') {
          variantConfig.onBlockedReasonAdded(reason);
        }
      },
      onChange: function () {
        cancelSliderAnim();
        repaint();
        persistSliderState();
        if (typeof variantConfig.onBlockedStateChange === 'function') {
          try {
            variantConfig.onBlockedStateChange(Object.assign({}, state));
          } catch (err) {
            console.error('onBlockedStateChange failed', err);
          }
        }
      },
      onLayoutChange: function () {
        if (typeof variantConfig.onLayoutChange === 'function') {
          variantConfig.onLayoutChange();
        }
      }
    });

    containerEl.appendChild(card);

    var themeObserver = new MutationObserver(function () {
      repaint();
      if (calcGraph && calcGraph.updateTheme) calcGraph.updateTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-color-mode']
    });

    applyFormulaMode(formulaKey);
    repaint();

    var progressCompleteLock = false;
    var savedDueEnabledBeforeLock = null;
    var savedBlockedEnabledBeforeLock = null;

    function setProgressCompleteLock(locked) {
      locked = !!locked;
      if (locked === progressCompleteLock) return;
      console.debug('[tp-blocked] setProgressCompleteLock', {
        locked: locked,
        wasLocked: progressCompleteLock,
        savedBlockedEnabledBeforeLock: savedBlockedEnabledBeforeLock,
        enAttenteNow: enAttenteField ? !!enAttenteField.getValue() : !!state.enAttente,
      });
      progressCompleteLock = locked;
      if (locked) {
        savedDueEnabledBeforeLock = dueDateField && dueDateField.isEnabled
          ? !!dueDateField.isEnabled()
          : !!state.dueEnabled;
        savedBlockedEnabledBeforeLock = enAttenteField
          ? !!enAttenteField.getValue()
          : !!state.enAttente;
        if (dueDateField) {
          if (dueDateField.setEnableAllowed) {
            dueDateField.setEnableAllowed(false, { expand: false });
          }
          if (dueDateField.setExpanded) dueDateField.setExpanded(false);
        }
        if (enAttenteField) {
          // Align with clearBlockedIfComplete / Done celebration: drop blocked when complete.
          if (enAttenteField.getValue()) enAttenteField.setValue(false);
          if (enAttenteField.setEnableAllowed) {
            enAttenteField.setEnableAllowed(false, { expand: false });
          }
          if (enAttenteField.setExpanded) enAttenteField.setExpanded(false);
        }
      } else {
        if (dueDateField && dueDateField.setEnableAllowed) {
          dueDateField.setEnableAllowed(true);
          if (savedDueEnabledBeforeLock && dueDateField.setEnabled) {
            dueDateField.setEnabled(true);
          }
        }
        if (enAttenteField && enAttenteField.setEnableAllowed) {
          enAttenteField.setEnableAllowed(true);
          if (savedBlockedEnabledBeforeLock) enAttenteField.setValue(true);
        }
        savedDueEnabledBeforeLock = null;
        savedBlockedEnabledBeforeLock = null;
      }
    }

    return {
      card: card,
      getState: function () {
        syncStateFromFields();
        return Object.assign({}, state);
      },
      getFormulaKey: function () {
        return formulaKey;
      },
      setFormulaKey: function (key) {
        applyFormulaMode(key);
        if (formulaSwitcher) formulaSwitcher.setFormulaKey(key);
        saveStoredFormulaKey(key);
        repaint();
      },
      setState: function (next, options) {
        options = options || {};
        var preserveCollapse = options.preserveCollapse === true;
        // silent: apply UI state without notifying onStateChange (live remote sync).
        var silent = options.silent === true;
        if (silent) suppressPersist = true;
        try {
          Object.keys(next).forEach(function (key) {
            state[key] = next[key];
            if (fields[key]) fields[key].setValue(next[key]);
          });
          if (next.priorityEnabled != null && priorityCollapse) {
            var priorityOpts = { notifyLayout: false };
            if (preserveCollapse) priorityOpts.preserveCollapse = true;
            else if (next.priorityEnabled) priorityOpts.expand = true;
            // Priorité cannot be disabled — ignore priorityEnabled:false.
            priorityCollapse.setEnabled(true, priorityOpts);
            state.priorityEnabled = true;
          }
          // Apply links/reasons BEFORE enAttente so setValue→onChange→syncStateFromFields
          // does not wipe freshly-written blockedLinks (item block → Statut sync).
          if (
            (next.blockedReasons != null || next.blockedReason != null) &&
            enAttenteField
          ) {
            if (enAttenteField.setBlockedReasons) {
              enAttenteField.setBlockedReasons(
                next.blockedReasons != null ? next.blockedReasons : next.blockedReason
              );
            } else {
              enAttenteField.setBlockedReason(
                next.blockedReason != null
                  ? next.blockedReason
                  : (next.blockedReasons && next.blockedReasons[0]) || ''
              );
            }
          }
          if (
            (next.blockedLinks !== undefined || next.blockedLink !== undefined) &&
            enAttenteField
          ) {
            if (enAttenteField.setBlockedLinks) {
              enAttenteField.setBlockedLinks(
                next.blockedLinks != null
                  ? next.blockedLinks
                  : next.blockedLink != null
                    ? [next.blockedLink]
                    : []
              );
            } else if (enAttenteField.setBlockedLink) {
              enAttenteField.setBlockedLink(
                next.blockedLinks && next.blockedLinks[0]
                  ? next.blockedLinks[0]
                  : next.blockedLink
              );
            }
          }
          if (next.enAttente != null && enAttenteField) {
            if (next.enAttente && enAttenteField.setEnableAllowed) {
              enAttenteField.setEnableAllowed(true);
            }
            if (preserveCollapse) {
              enAttenteField.setValue(next.enAttente, { preserveCollapse: true });
            } else {
              enAttenteField.setValue(next.enAttente);
              if (next.enAttente && enAttenteField.setExpanded) {
                enAttenteField.setExpanded(true);
              }
            }
          }
          if (
            (next.dueDate != null ||
              next.dueTime != null ||
              next.dueEnabled != null ||
              next.startDate !== undefined ||
              next.recurrence !== undefined) &&
            dueDateField
          ) {
            var duePayload = {
              dueDate: next.dueDate != null ? next.dueDate : state.dueDate,
              dueTime: next.dueTime != null ? next.dueTime : state.dueTime,
              dueEnabled: next.dueEnabled != null ? next.dueEnabled : state.dueEnabled,
              startDate:
                next.startDate !== undefined ? next.startDate : state.startDate,
              recurrence:
                next.recurrence !== undefined ? next.recurrence : state.recurrence
            };
            if (preserveCollapse) {
              dueDateField.setValue(duePayload, { preserveCollapse: true });
            } else {
              dueDateField.setValue(duePayload);
            }
          }
          if (next.estimatedDurationMinutes !== undefined) {
            state.estimatedDurationMinutes = clampDurationMinutes(
              next.estimatedDurationMinutes
            );
            if (durationControl) {
              durationControl.setMinutes(state.estimatedDurationMinutes);
            }
          }
          repaint();
          if (silent) {
            syncStateFromFields();
          } else {
            persistSliderState();
          }
        } finally {
          if (silent) suppressPersist = false;
        }
      },
      refreshBlockedSubtasks: function () {
        if (enAttenteField && enAttenteField.refreshSubtasks) {
          enAttenteField.refreshSubtasks();
        }
      },
      /**
       * Toggle a named section open/closed and return its root element (for scroll/focus).
       * Re-clicking from Information collapses when already expanded.
       * Keys: 'priority' | 'due' | 'blocked'
       * Bloqué is nested under Progrès (Statut) — openSection('blocked') returns the panel root
       * (popup expands Progrès and scrolls).
       */
      openSection: function (key, options) {
        options = options || {};
        var forceExpand = options.expand === true;
        var target = null;
        if (key === 'priority') {
          target = prioritySection;
          if (priorityCollapse && priorityCollapse.setExpanded) {
            var priorityOpen = priorityCollapse.isExpanded
              ? priorityCollapse.isExpanded()
              : false;
            if (forceExpand) {
              if (!priorityOpen) priorityCollapse.setExpanded(true);
            } else {
              priorityCollapse.setExpanded(!priorityOpen);
            }
          }
        } else if (key === 'due') {
          target = dueSection;
          if (dueDateField && dueDateField.setExpanded) {
            var dueOpen = dueDateField.isExpanded ? dueDateField.isExpanded() : false;
            if (forceExpand) {
              if (!dueOpen) dueDateField.setExpanded(true);
            } else {
              dueDateField.setExpanded(!dueOpen);
            }
          }
        } else if (key === 'blocked') {
          target = blockedSection;
        }
        return target;
      },
      getBlockedSection: function () {
        return blockedSection;
      },
      setProgressCompleteLock: setProgressCompleteLock,
      isProgressCompleteLock: function () {
        return progressCompleteLock;
      },
      repaint: repaint
    };
    } catch (err) {
      return mountVariantFailedStub(containerEl, variantConfig, err);
    }
  }

  // ── 11. PriorityUI public API ───────────────────────────────────────────

  var PriorityUI = {
    WEIGHTS: { time: WT, blocking: WB, impact: WI, ease: WI_EASE },
    PRESSURE_MAX: PRESSURE_MAX,
    SCORE_MAX: SCORE_MAX,
    AXIS_UI_MAX: AXIS_UI_MAX,
    TIER_I: TIER_I,
    TIER_I_MAX: TIER_I_MAX,
    TIER_I_SCHEME_MAPPED_MAX: TIER_I_SCHEME_MAPPED_MAX,
    TRELLO_BADGE_COLOR_MUTED: TRELLO_BADGE_COLOR_MUTED,
    TRELLO_BADGE_COLOR_COMPLETE: TRELLO_BADGE_COLOR_COMPLETE,
    TRELLO_BADGE_COLOR_HEX: TRELLO_BADGE_COLOR_HEX,
    TRELLO_BADGE_COLOR_NAMES: TRELLO_BADGE_COLOR_NAMES,
    LABELS: LABELS,
    KEYWORDS: KEYWORDS,
    QUESTIONS: QUESTIONS,
    TIERS: TIERS,
    TIER_DEFS: TIER_DEFS,
    PRIORITY_BLUE_STOPS: PRIORITY_BLUE_STOPS,
    COLOR_SCHEMES: COLOR_SCHEMES,
    COLOR_SCHEME_OPTIONS: COLOR_SCHEME_OPTIONS,
    DEFAULT_COLOR_SCHEME_KEY: DEFAULT_COLOR_SCHEME_KEY,
    normalizeColorSchemeKey: normalizeColorSchemeKey,
    applyColorScheme: applyColorScheme,
    getActiveColorSchemeKey: getActiveColorSchemeKey,
    loadStoredColorSchemeKey: loadStoredColorSchemeKey,
    saveStoredColorSchemeKey: saveStoredColorSchemeKey,
    TIER_LABEL_SHORT: TIER_LABEL_SHORT,
    TIER_SURFACE_MIX: TIER_SURFACE_MIX,
    HEAT_SEGMENTS: HEAT_SEGMENTS,
    shortTierLabel: shortTierLabel,
    tierLabelForSpace: tierLabelForSpace,
    FORMULAS: FORMULAS,
    FORMULA_OPTIONS: FORMULA_OPTIONS,
    EISENHOWER_QUADRANTS: EISENHOWER_QUADRANTS,
    EISENHOWER_URGENCY_THRESHOLD: EISENHOWER_URGENCY_THRESHOLD,
    EISENHOWER_IMPACT_THRESHOLD: EISENHOWER_IMPACT_THRESHOLD,
    normalizeFormulaKey: normalizeFormulaKey,
    loadStoredFormulaKey: loadStoredFormulaKey,
    saveStoredFormulaKey: saveStoredFormulaKey,
    SECTION_COLLAPSE_STORAGE_KEY: SECTION_COLLAPSE_STORAGE_KEY,
    loadSectionCollapseState: loadSectionCollapseState,
    saveSectionCollapseState: saveSectionCollapseState,
    resolveSectionExpanded: resolveSectionExpanded,
    STATUT_EMBEDDED_DETAILS_STORAGE_KEY: STATUT_EMBEDDED_DETAILS_STORAGE_KEY,
    loadStatutEmbeddedDetailsExpanded: loadStatutEmbeddedDetailsExpanded,
    saveStatutEmbeddedDetailsExpanded: saveStatutEmbeddedDetailsExpanded,
    eisenhowerQuadrantFor: eisenhowerQuadrantFor,
    isEisenhowerUrgent: isEisenhowerUrgent,
    isEisenhowerImportant: isEisenhowerImportant,
    calc: {
      baseline: calcBaseline,
      eisenhower: calcEisenhower,
      wsjf: calcWSJF,
      valueEffort: calcValueEffort,
      threeDMerged: calcBaseline,
      mergePressure: mergePressure,
      urgencyLevelToPressure: urgencyLevelToPressure,
      pressureToUrgencyLevel: pressureToUrgencyLevel,
      impactTerm: impactTerm,
      curveImpact: curveImpact,
      dampenCurve: dampenCurve,
      urgencyBoost: urgencyBoost,
      calcBaselineTerms: calcBaselineTerms,
      calcBaselineTermsRaw: calcBaselineTermsRaw,
      baselineScore: baselineScore,
      BASELINE_RAW_MAX: BASELINE_RAW_MAX,
      BASELINE_SCORE_SCALE: BASELINE_SCORE_SCALE
    },
    format: {
      baseline: formatBaseline,
      eisenhower: formatEisenhower,
      wsjf: formatWSJF,
      valueEffort: formatValueEffort,
      threeD: formatBaseline,
      scoreBreakdown: formatScoreBreakdown
    },
    override: {
      baseline: overrideBaseline,
      eisenhower: overrideEisenhower,
      wsjf: overrideWSJF,
      valueEffort: overrideValueEffort,
      threeD: overrideBaseline
    },
    openHelpModal: openHelpModal,
    closeHelpModal: closeHelpModal,
    openCriteriaWizard: openCriteriaWizard,
    createField: createField,
    createStatutField: createStatutField,
    createEnAttenteField: createEnAttenteField,
    createDueDateField: createDueDateField,
    createHeatPanel: createHeatPanel,
    createCalcGraphPanel: createCalcGraphPanel,
    createFormulaSwitcher: createFormulaSwitcher,
    mountVariant: mountVariant,
    tierFor: tierFor,
    isInutile: isInutile,
    isEnAttente: isEnAttente,
    resolveDisplay: resolveDisplay,
    classicTierLabel: classicTierLabel,
    TASK_BADGE_LABELS: TASK_BADGE_LABELS,
    taskBadgeLabel: taskBadgeLabel,
    taskBadgeLabelForTierKey: taskBadgeLabelForTierKey,
    blockedTaskBadgeLabel: blockedTaskBadgeLabel,
    formatCompletedBadgeLabel: formatCompletedBadgeLabel,
    COMPLETED_BADGE_PREFIX: COMPLETED_BADGE_PREFIX,
    DEFINE_PRIORITY_LABEL: DEFINE_PRIORITY_LABEL,
    tierTrelloBadgeColor: tierTrelloBadgeColor,
    schemeBadgePreviewSamples: schemeBadgePreviewSamples,
    rebuildTrelloBadgeColors: rebuildTrelloBadgeColors,
    tierBadgeDotChar: tierBadgeDotChar,
    heatTierDotSizePx: heatTierDotSizePx,
    HEAT_TIER_DOT_SIZES: HEAT_TIER_DOT_SIZES,
    TIER_TRELLO_BADGE_COLORS: TIER_TRELLO_BADGE_COLORS,
    TIER_BADGE_DOTS: TIER_BADGE_DOTS,
    BADGE_DOT_DEFAULT: BADGE_DOT_DEFAULT,
    BADGE_DOT_COMPLETE: BADGE_DOT_COMPLETE,
    BADGE_DOT_INUTILE: BADGE_DOT_INUTILE,
    setMatrixSettings: setMatrixSettings,
    getMatrixSettings: getMatrixSettings,
    resolveMatrixLabel: resolveMatrixLabel,
    INUTILE_EPS: INUTILE_EPS,
    INUTILE_LABEL: INUTILE_LABEL,
    INUTILE_STYLES: INUTILE_STYLES,
    BLOCKED_SYMBOL: BLOCKED_SYMBOL,
    BLOCKED_LABEL: BLOCKED_LABEL,
    BLOCKED_DISPLAY: BLOCKED_DISPLAY,
    BLOCKED_DESCRIPTION: BLOCKED_DESCRIPTION,
    BLOCKED_REASON_PLACEHOLDER: BLOCKED_REASON_PLACEHOLDER,
    BLOCKED_REASON_SUGGESTIONS_LABEL: BLOCKED_REASON_SUGGESTIONS_LABEL,
    BLOCKED_REASON_CLEAR_LABEL: BLOCKED_REASON_CLEAR_LABEL,
    BLOCKED_REASON_EDIT_LABEL: BLOCKED_REASON_EDIT_LABEL,
    BLOCKED_REASON_OPTIONS: BLOCKED_REASON_OPTIONS,
    BLOCKED_REASON_CORE_PRESETS: BLOCKED_REASON_CORE_PRESETS,
    BLOCKED_REASON_FREQ_STORAGE_KEY: BLOCKED_REASON_FREQ_STORAGE_KEY,
    BLOCKED_REASON_EMPTY_SUGGESTION_CAP: BLOCKED_REASON_EMPTY_SUGGESTION_CAP,
    BLOCKED_REASON_FILTER_SUGGESTION_CAP: BLOCKED_REASON_FILTER_SUGGESTION_CAP,
    BLOCKED_REASON_WAITING_OTHER_TASK: BLOCKED_REASON_WAITING_OTHER_TASK,
    BLOCKED_LINK_TYPE_SUBTASK: BLOCKED_LINK_TYPE_SUBTASK,
    BLOCKED_SUBTASK_FALLBACK_LABEL: BLOCKED_SUBTASK_FALLBACK_LABEL,
    BLOCKED_WAITING_ON_PREFIX: BLOCKED_WAITING_ON_PREFIX,
    isValidBlockedReason: isValidBlockedReason,
    normalizeBlockedReason: normalizeBlockedReason,
    normalizeBlockedReasons: normalizeBlockedReasons,
    formatBlockedReasonsSummary: formatBlockedReasonsSummary,
    formatBlockedWaitingOnLabel: formatBlockedWaitingOnLabel,
    expandBlockedReasonsForDisplay: expandBlockedReasonsForDisplay,
    rankBlockedReasonSuggestions: rankBlockedReasonSuggestions,
    bumpBlockedReasonFreq: bumpBlockedReasonFreq,
    isBlockedWaitingOtherTask: isBlockedWaitingOtherTask,
    normalizeBlockedLink: normalizeBlockedLink,
    normalizeBlockedLinks: normalizeBlockedLinks,
    formatBlockedBadgeText: formatBlockedBadgeText,
    TASK_TYPES: TASK_TYPES,
    BUILTIN_TASK_TYPES: BUILTIN_TASK_TYPES,
    CUSTOM_TASK_TYPE_ICON_KEYS: CUSTOM_TASK_TYPE_ICON_KEYS,
    TASK_TYPE_TABLER_ICONS: TASK_TYPE_TABLER_ICONS,
    randomTaskTypeIconKey: randomTaskTypeIconKey,
    getTaskTypeIconKeys: getTaskTypeIconKeys,
    isValidTaskTypeId: isValidTaskTypeId,
    isCustomTaskTypeId: isCustomTaskTypeId,
    taskTypeLabel: taskTypeLabel,
    taskTypeHint: taskTypeHint,
    taskTypeIconKey: taskTypeIconKey,
    taskTypeIconSvg: taskTypeIconSvg,
    getTaskTypeCatalog: getTaskTypeCatalog,
    getCustomTaskTypes: getCustomTaskTypes,
    setCustomTaskTypes: setCustomTaskTypes,
    normalizeCustomTaskTypes: normalizeCustomTaskTypes,
    createCustomTaskType: createCustomTaskType,
    normalizeTaskTypes: normalizeTaskTypes,
    MS_PER_DAY: MS_PER_DAY,
    MS_PER_HOUR: MS_PER_HOUR,
    MS_PER_MINUTE: MS_PER_MINUTE,
    COUNTDOWN_DAYS_PER_WEEK: COUNTDOWN_DAYS_PER_WEEK,
    COUNTDOWN_WEEK_THRESHOLD_DAYS: COUNTDOWN_WEEK_THRESHOLD_DAYS,
    COUNTDOWN_YEAR_THRESHOLD_DAYS: COUNTDOWN_YEAR_THRESHOLD_DAYS,
    DAYS_PER_MONTH_AVG: DAYS_PER_MONTH_AVG,
    DAYS_PER_YEAR_AVG: DAYS_PER_YEAR_AVG,
    DUE_DATE_TIME_DEFAULT: DUE_DATE_TIME_DEFAULT,
    DUE_DATE_QUICK_SUGGESTIONS: DUE_DATE_QUICK_SUGGESTIONS,
    normalizeDueDate: normalizeDueDate,
    normalizeDueTime: normalizeDueTime,
    trelloDueIsoFromParts: trelloDueIsoFromParts,
    parseTrelloDueToParts: parseTrelloDueToParts,
    canonicalizeTrelloDueIso: canonicalizeTrelloDueIso,
    inputsToTrelloDueIso: inputsToTrelloDueIso,
    inputsToTrelloStartIso: inputsToTrelloStartIso,
    normalizeRecurrence: normalizeRecurrence,
    advanceDateByRecurrence: advanceDateByRecurrence,
    nextOccurrenceParts: nextOccurrenceParts,
    formatRecurrenceLabelFr: formatRecurrenceLabelFr,
    RECURRENCE_FREQUENCIES: RECURRENCE_FREQUENCIES,
    isDueDateQuickSuggestionAvailable: isDueDateQuickSuggestionAvailable,
    resolveDueDateQuickSuggestion: resolveDueDateQuickSuggestion,
    daysUntilDue: daysUntilDue,
    msUntilDue: msUntilDue,
    isDuePast: isDuePast,
    setTimeFormat: setTimeFormat,
    getTimeFormat: getTimeFormat,
    isHour12: isHour12,
    formatDueCountdown: formatDueCountdown,
    formatDueTimeDisplay: formatDueTimeDisplay,
    formatDueTimeCompactFr: formatDueTimeCompactFr,
    formatDueDateDisplay: formatDueDateDisplay,
    formatDueDateCompactSummary: formatDueDateCompactSummary,
    dueProximityBand: dueProximityBand,
    dueBandAccent: dueBandAccent,
    formatDueDateHumanReadable: formatDueDateHumanReadable,
    formatDueDateTriggerTitle: formatDueDateTriggerTitle,
    formatDueTimeTriggerTitle: formatDueTimeTriggerTitle,
    formatDueTimePeriodLabel: formatDueTimePeriodLabel,
    formatDueBadgeText: formatDueBadgeText,
    dueBadgeSuffix: dueBadgeSuffix,
    isDueEnabled: isDueEnabled,
    withDueDateDisplay: withDueDateDisplay,
    buildProgressSummaryNode: buildProgressSummaryNode,
    createOverviewField: createOverviewField,
    createInfoField: createInfoField,
    renderMarkdownToHtml: renderMarkdownToHtml,
    markdownFromRichRoot: markdownFromRichRoot,
    wrapMarkdownInlineSelection: wrapMarkdownInlineSelection,
    linkMarkdownSelection: linkMarkdownSelection,
    normalizePasteableMarkdownUrl: normalizePasteableMarkdownUrl,
    applyMarkdownBlockFormat: applyMarkdownBlockFormat,
    detectMarkdownLineFormat: detectMarkdownLineFormat,
    stripMarkdownLinePrefix: stripMarkdownLinePrefix,
    smartCardModeForLink: smartCardModeForLink,
    renderSmartCardHtml: renderSmartCardHtml,
    fetchLinkPreviewMeta: fetchLinkPreviewMeta,
    hydrateSmartLinkPreviews: hydrateSmartLinkPreviews,
    createCollapsibleEnableChrome: createCollapsibleEnableChrome,
    bindCollapsibleEnable: bindCollapsibleEnable,
    wordFor: wordFor,
    wordHtmlFor: wordHtmlFor,
    levelIconSvg: levelIconSvg,
    affirmationFor: affirmationFor,
    affirmationDisplayText: affirmationDisplayText,
    formatDurationFr: formatDurationFr,
    parseDurationNl: parseDurationNl,
    durationToSlider: durationToSlider,
    sliderToDuration: sliderToDuration,
    clampDurationMinutes: clampDurationMinutes,
    DURATION_MIN_MINUTES: DURATION_MIN_MINUTES,
    DURATION_MAX_MINUTES: DURATION_MAX_MINUTES,
    DURATION_CRACK_MINUTES: DURATION_CRACK_MINUTES,
    DURATION_TICKS: DURATION_TICKS
  };

  global.PriorityUI = PriorityUI;

  try {
    applyColorScheme(DEFAULT_COLOR_SCHEME_KEY);
  } catch (bootstrapErr) {
    console.error('PriorityUI color scheme bootstrap failed', bootstrapErr);
  }
})(typeof window !== 'undefined' ? window : this);
