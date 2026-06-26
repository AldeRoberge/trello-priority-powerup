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
      short: ['Aucune', 'Faible', 'Utile', 'Importante', 'Impact majeur'],
      detail: [
        'Peu ou pas de bénéfice visible. L\'effort ne crée quasi aucune valeur, portée ni opportunité pour l\'équipe.',
        'Gain marginal avec peu de visibilité. Petite amélioration qui ne change que marginalement la valeur ou la portée des résultats.',
        'Amélioration nette pour l\'équipe ou le produit. Valeur concrète, bénéfices perceptibles et quelques opportunités débloquées.',
        'Objectif clé ou livrable majeur. Forte valeur, impact visible et portée significative sur les priorités en cours.',
        'Valeur exceptionnelle et large portée. Débloque de nombreuses tâches ou personnes ; opportunité stratégique que l\'équipe ressent immédiatement.'
      ],
      popup: {
        subtitle: 'Pourquoi vaut-il la peine de le faire?',
        intro: 'L\'impact mesure la valeur, l\'importance et la portée d\'une tâche. Les bénéfices concrets qu\'elle apporte, sa visibilité, les opportunités qu\'elle ouvre et le nombre de personnes ou de tâches qu\'elle débloque.',
        guidance: 'Demandez-vous si le résultat sera visible, utile à l\'équipe ou au produit, et si d\'autres travaux en dépendent.'
      },
      affirmations: [
        'Aucune. L\'effort ne vaut presque rien.',
        'Gain marginal. Petite amélioration, peu visible.',
        'Utile. Amélioration nette pour l\'équipe ou le produit.',
        'Importante. Objectif clé, livrable visible.',
        'Impact majeur. Forte valeur, large portée. D\'autres tâches en dépendent.'
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
        subtitle: 'À quel point est-ce difficile?',
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
        subtitle: 'Quel niveau d\'urgence?',
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var KEYWORDS = {
    time: 'Pression relative : blocages, dépendances et risque si repoussée.',
    blocking: 'Effet sur l\'équipe : blocages, dépendances et ralentissement du travail.',
    impact: 'Valeur apportée : importance, portée, bénéfices, visibilité et opportunités débloquées.',
    ease: 'Coût d\'exécution : complexité, ressources, difficulté, confiance et réversibilité.',
    urgency: 'Niveau d\'urgence : blocages, dépendances et risque si repoussée.'
  };

  var QUESTIONS = {
    time: 'Quelle pression pèse sur cette tâche?',
    blocking: 'Est-ce que quelque chose cesse de fonctionner si ce n\'est pas fait?',
    impact: 'Pourquoi vaut-il la peine de le faire?',
    ease: 'À quel point est-ce difficile?',
    urgency: 'Quel niveau d\'urgence?'
  };

  var PROPERTY_ICONS = {
    time: 'ti-clock',
    blocking: 'ti-barrier-block',
    impact: 'ti-target-arrow',
    ease: 'ti-gauge',
    urgency: 'ti-flame'
  };

  var TIERS = [
    {
      min: 8.6, label: 'Critique', fill: '#FCEBEB', text: '#791F1F', seg: '#E24B4A', i: 0,
      description: 'Tâche prioritaire absolue. Impact direct sur l\'objectif, impossible de repousser sans conséquences majeures.'
    },
    {
      min: 7.2, label: 'Urgent', fill: '#FAECE7', text: '#712B13', seg: '#D85A30', i: 1,
      description: 'Tâche pressante, priorité absolue. Action rapide sous forte pression.'
    },
    {
      min: 5.8, label: 'Prioritaire', fill: '#FAEEDA', text: '#633806', seg: '#BA7517', i: 2,
      description: 'Attention prioritaire. À traiter en tête de file.'
    },
    {
      min: 4.3, label: 'Important', fill: '#E8F5E0', text: '#2D5A1E', seg: '#6EAD3A', i: 3,
      description: 'Planifiée. À exécuter avec engagement clair dans le backlog.'
    },
    {
      min: 2.9, label: 'Flexible', fill: '#E1F5EE', text: '#085041', seg: '#3BA99C', i: 4,
      description: 'Sans urgence ni blocage. À traiter selon l\'opportunité, peut glisser.'
    },
    {
      min: 1.4, label: 'Secondaire', fill: '#E6F1FB', text: '#0C447C', seg: '#5A9FD4', i: 5,
      description: 'Utile mais non essentielle. À envisager quand la bande passante le permet.'
    },
    {
      min: 0, label: 'Optionnel', fill: '#F1EFE8', text: '#444441', seg: '#9B9890', i: 6,
      description: 'Facultative, sans conséquence si ignorée. Peut être écartée de la file.'
    }
  ];

  // Dark-mode tier fills/tints — muted surfaces with white text for readability.
  var TIERS_DARK = [
    { i: 0, fill: '#3d2220', text: '#ffffff', seg: '#e2483d', tint: '#4a2320' },
    { i: 1, fill: '#3d2718', text: '#ffffff', seg: '#f8692a', tint: '#4a2d15' },
    { i: 2, fill: '#3d3012', text: '#ffffff', seg: '#cf9f02', tint: '#4a3810' },
    { i: 3, fill: '#263920', text: '#ffffff', seg: '#6aad34', tint: '#2a4018' },
    { i: 4, fill: '#1e3330', text: '#ffffff', seg: '#37b4a0', tint: '#1a3835' },
    { i: 5, fill: '#1a2a3d', text: '#ffffff', seg: '#519fe8', tint: '#182638' },
    { i: 6, fill: '#323940', text: '#ffffff', seg: '#9fadbc', tint: '#323940' }
  ];

  var HEAT_SEGMENTS = [
    {
      i: 6, target: 0.7, color: '#9B9890', label: 'Optionnel', description: TIERS[6].description,
      preset: { urgency: 0, impact: 0, ease: 2 }
    },
    {
      i: 5, target: 2.1, color: '#5A9FD4', label: 'Secondaire', description: TIERS[5].description,
      preset: { urgency: 1, impact: 1, ease: 2 }
    },
    {
      i: 4, target: 3.6, color: '#3BA99C', label: 'Flexible', description: TIERS[4].description,
      preset: { urgency: 1, impact: 2, ease: 3 }
    },
    {
      i: 3, target: 5.0, color: '#6EAD3A', label: 'Important', description: TIERS[3].description,
      preset: { urgency: 2, impact: 2, ease: 3 }
    },
    {
      i: 2, target: 6.5, color: '#BA7517', label: 'Prioritaire', description: TIERS[2].description,
      preset: { urgency: 2, impact: 3, ease: 3 }
    },
    {
      i: 1, target: 7.9, color: '#D85A30', label: 'Urgent', description: TIERS[1].description,
      preset: { urgency: 3, impact: 3, ease: 2 }
    },
    {
      i: 0, target: 9.3, color: '#E24B4A', label: 'Critique', description: TIERS[0].description,
      preset: { urgency: 4, impact: 4, ease: 5 }
    }
  ];

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
  var INUTILE_EPS = 0.05;
  var INUTILE_LABEL = 'Inutile';
  var INUTILE_STYLES = {
    label: INUTILE_LABEL,
    fill: '#F1EFE8',
    text: '#9B9890',
    seg: '#9B9890',
    tint: '#F1EFE8',
    description: 'Sans valeur ni urgence. Trop complexe ou impossible à réaliser.'
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
  var BLOCKED_REASON_PLACEHOLDER = 'Pr\u00e9ciser le blocage\u2026';
  var BLOCKED_REASON_OPTIONS = [
    'En attente d\'une r\u00e9ponse',
    'En attente de budget',
    'En attente d\'une approbation',
    'En attente de mat\u00e9riel',
    'En attente d\'une autre t\u00e2che',
    'En attente de quelqu\'un',
    'Autre'
  ];
  var BLOCKED_DESCRIPTION =
    'T\u00e2che bloqu\u00e9e en attente de quelqu\'un, d\'une autre t\u00e2che, d\'un approbation, de mat\u00e9riel, etc.';

  function isValidBlockedReason(reason) {
    return !!reason && BLOCKED_REASON_OPTIONS.indexOf(reason) !== -1;
  }
  var BLOCKED_STYLES = {
    label: BLOCKED_LABEL,
    fill: '#F3E4E4',
    text: '#4A0808',
    seg: '#6B0F0F',
    tint: '#6B0F0F',
    description: BLOCKED_DESCRIPTION
  };
  var BLOCKED_STYLES_DARK = {
    label: BLOCKED_LABEL,
    fill: '#2D0F0F',
    text: '#ffffff',
    seg: '#8B0000',
    tint: '#4A1212',
    description: BLOCKED_DESCRIPTION
  };

  var TASK_BADGE_LABELS = {
    Critique: 'T\u00e2che critique',
    Urgent: 'T\u00e2che urgente',
    Prioritaire: 'T\u00e2che prioritaire',
    Important: 'T\u00e2che importante',
    Flexible: 'T\u00e2che flexible',
    Secondaire: 'T\u00e2che secondaire',
    Optionnel: 'T\u00e2che optionnelle',
    Inutile: 'T\u00e2che inutile',
    'Bloqu\u00e9': 'T\u00e2che bloqu\u00e9'
  };

  function taskBadgeLabel(display) {
    if (!display) return '';
    if (display.blocked) return TASK_BADGE_LABELS[BLOCKED_LABEL];
    var tier = classicTierLabel(display);
    if (TASK_BADGE_LABELS[tier]) return TASK_BADGE_LABELS[tier];
    if (!tier) return '';
    if (tier === 'Important') return 'T\u00e2che importante';
    return 'T\u00e2che ' + tier.charAt(0).toLowerCase() + tier.slice(1);
  }

  function formatBlockedBadgeText(reason) {
    var label = TASK_BADGE_LABELS[BLOCKED_LABEL];
    if (reason) return BLOCKED_SYMBOL + ' ' + label + ' \u2014 ' + reason;
    return BLOCKED_SYMBOL + ' ' + label;
  }

  function isDarkTheme() {
    return document.documentElement.getAttribute('data-color-mode') === 'dark';
  }

  function readCssVar(name, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback || '';
  }

  function tierVisuals(source) {
    if (source && (source.blocked || source.label === BLOCKED_LABEL)) {
      var blocked = isDarkTheme() ? BLOCKED_STYLES_DARK : BLOCKED_STYLES;
      return { fill: blocked.fill, text: blocked.text, seg: blocked.seg, tint: blocked.tint };
    }
    var inutile = source && (source.inutile || source.label === INUTILE_LABEL);
    if (inutile) {
      var idle = isDarkTheme() ? INUTILE_STYLES_DARK : INUTILE_STYLES;
      return { fill: idle.fill, text: idle.text, seg: idle.seg, tint: idle.tint };
    }
    var i = source && source.i != null ? source.i : 6;
    if (isDarkTheme()) {
      var dark = TIERS_DARK[i] || TIERS_DARK[6];
      return { fill: dark.fill, text: dark.text, seg: dark.seg, tint: dark.tint };
    }
    var light = TIERS[i] || TIERS[6];
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
    var reason = inputs.blockedReason || '';
    return Object.assign({}, display, {
      blocked: true,
      blockedReason: reason
    });
  }

  function resolveDisplay(result, inputs, labelSettings) {
    var inputsSafe = inputs || {};
    if (!isInutile(inputsSafe)) {
      var settings = labelSettings != null ? labelSettings : matrixSettings;
      var matrix = resolveMatrixLabel(inputsSafe, result.tier, result.score, settings);
      var matrixEnabled = !settings || settings.enabled !== false;
      return withBlockedDisplay({
        inutile: false,
        score: result.score,
        label: result.tier.label,
        tierLabel: result.tier.label,
        matrixLabel: matrix && matrix.fromMatrix ? matrix.label : null,
        description: matrix ? matrix.description : (result.tier.description || ''),
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
    return withBlockedDisplay({
      inutile: true,
      score: 0,
      label: INUTILE_LABEL,
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

  function tierDescriptionBody(display) {
    if (display.inutile) return INUTILE_STYLES.description || '';
    if (display.description) return display.description;
    if (display.tierI == null) return '';
    for (var k = 0; k < TIERS.length; k++) {
      if (TIERS[k].i === display.tierI) return TIERS[k].description || '';
    }
    return '';
  }

  function paintTierDescription(el, display) {
    if (!display) {
      el.textContent = '';
      el.hidden = true;
      return;
    }
    if (display.inutile) {
      var inutileDesc = INUTILE_STYLES.description || '';
      el.textContent = inutileDesc;
      el.hidden = !inutileDesc;
      return;
    }
    if (display.matrixLabel) {
      var matrixDesc = display.description || '';
      var html = '<span class="heat-tier-desc-subtitle">' + escapeHtml(display.matrixLabel) + '</span>';
      if (matrixDesc) {
        html += '<span class="heat-tier-desc-body">' + escapeHtml(matrixDesc) + '</span>';
      }
      el.innerHTML = html;
      el.hidden = false;
      el.style.removeProperty('color');
      return;
    }
    var desc = tierDescriptionBody(display);
    el.textContent = desc;
    el.hidden = !desc;
    el.style.removeProperty('color');
  }

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
    0: { bg: 42, border: 50, panel: 44 }, // Critique — strong red wash
    1: { bg: 40, border: 48, panel: 40 }, // Urgent — orange
    2: { bg: 34, border: 44, panel: 28 }, // Prioritaire — amber
    3: { bg: 28, border: 38, panel: 22 }, // Important — green
    4: { bg: 22, border: 32, panel: 18 }, // Flexible — teal
    5: { bg: 14, border: 26, panel: 14 }, // Secondaire — blue
    6: { bg: 6, border: 20, panel: 8 },   // Optionnel — near neutral
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
    var mixKey = tier.blocked ? 'blocked' : (tier.inutile ? 'inutile' : tier.i);
    var table = isDarkTheme() ? TIER_SURFACE_MIX_DARK : TIER_SURFACE_MIX;
    return table[mixKey] || table[6];
  }

  function applyCardTierTint(cardEl, tier) {
    var visuals = tierVisuals(tier);
    var mix = surfaceMixFor(tier);
    cardEl.style.setProperty('--card-tier-tint', visuals.tint);
    cardEl.style.setProperty('--card-tier-border', visuals.seg);
    cardEl.style.setProperty('--card-tier-tint-mix', mix.bg + '%');
    cardEl.style.setProperty('--card-tier-border-mix', mix.border + '%');
    cardEl.style.setProperty('--card-panel-tint-mix', mix.panel + '%');
    cardEl.dataset.tier = tier.label;

    var panel = cardEl.querySelector('.heat-panel');
    if (panel) {
      panel.style.setProperty('--card-tier-tint', visuals.tint);
      panel.style.setProperty('--card-panel-tint-mix', mix.panel + '%');
    }
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

  // Low-impact urgency floor: max U with little I still reaches Urgent tier.
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

  function calcEisenhower(inputs) {
    var d = readInputs(inputs);
    var p = clamp(d.urgencyNorm * d.importance * 10, 0, 10);
    return {
      score: p,
      terms: { pressure: d.pressure, importance: d.importance, urgencyNorm: d.urgencyNorm, U: d.U, I: d.I, F: d.F },
      tier: tierFor(p)
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
    return Math.abs(score - Math.round(score)) < 0.01
      ? String(Math.round(score))
      : score.toFixed(1);
  }

  function formatBaseline(terms, score) {
    var dampPct = (terms.dampen * 100).toFixed(0);
    var easeMulNote = terms.easeMul != null && terms.easeMul !== 1
      ? ', ×' + terms.easeMul.toFixed(2) + ' noyau'
      : '';
    return (
      'Pression d\'urgence → ' + terms.pressure.toFixed(1) +
      '   ·   Impact → ' + terms.impactCore.toFixed(1) +
      '   ·   Effort → ' + terms.easeTerm.toFixed(1) +
      ' (attén. ' + dampPct + ' %, F eff. ' + terms.effectiveF.toFixed(1) + easeMulNote + ')' +
      '   =   ' + formatScore(score)
    );
  }

  function formatEisenhower(terms, score) {
    return (
      '(Urgence÷6) × (0.5+Impact÷4) × 10 → ' +
      terms.urgencyNorm.toFixed(2) + ' × ' + terms.importance.toFixed(2) + ' × 10' +
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
      '(Impact × Urgence÷6) ÷ effort → (' + terms.I + ' × ' + terms.urgencyNorm.toFixed(2) + ') ÷ ' + terms.jobSize.toFixed(0) +
      ' × ' + VALUE_EFFORT_SCALE +
      '   =   ' + formatScore(score)
    );
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
    for (var u = 0; u <= 4; u++) {
      for (var i = 0; i <= 4; i++) {
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
    var d = readInputs(inputs);
    var curUrg = d.urgencyNorm;
    var curImp = d.importance;
    var curScore = curUrg * curImp * 10;
    var tUrg, tImp;
    if (curScore > 0.001) {
      var r = targetP / curScore;
      tUrg = curUrg * r;
      tImp = curImp * r;
    } else {
      tUrg = Math.sqrt(targetP / 10) * 0.5;
      tImp = Math.sqrt(targetP / 10) * 0.5 + 0.5;
    }
    tUrg = clamp(tUrg, 0, 1);
    tImp = clamp(tImp, 0.5, 1.5);
    var nU = pressureToUrgencyLevel(tUrg * PRESSURE_MAX);
    var nI = clamp(Math.round((tImp - 0.5) * 4), 0, 4);
    return { urgency: nU, impact: nI, ease: inputs.ease };
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
          '<div class="help-modal-wizard-nav" hidden>' +
            '<button type="button" class="help-modal-nav help-modal-prev">Précédent</button>' +
            '<span class="help-modal-step" aria-live="polite"></span>' +
            '<button type="button" class="help-modal-nav help-modal-next">Suivant</button>' +
          '</div>' +
          '<button type="button" class="help-modal-close help-modal-close--bottom">Fermer</button>' +
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
    var wizardNav = modalRoot.querySelector('.help-modal-wizard-nav');
    var prevBtn = modalRoot.querySelector('.help-modal-prev');
    var nextBtn = modalRoot.querySelector('.help-modal-next');
    var stepEl = modalRoot.querySelector('.help-modal-step');
    if (!wizardNav || !prevBtn || !nextBtn || !stepEl) return;

    if (wizard && wizard.total > 1) {
      wizardNav.hidden = false;
      prevBtn.disabled = wizard.step <= 0;
      var isLast = wizard.step >= wizard.total - 1;
      nextBtn.textContent = isLast ? 'Terminer' : 'Suivant';
      stepEl.textContent = (wizard.step + 1) + ' / ' + wizard.total;
      prevBtn.onclick = function () {
        if (wizard.onPrev) wizard.onPrev();
      };
      nextBtn.onclick = function () {
        if (wizard.onNext) wizard.onNext();
      };
    } else {
      wizardNav.hidden = true;
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
        li.innerHTML =
          '<span class="help-modal-level-label">' + levelIconSvg(entry.icon[i]) +
          '<span>' + escapeHtml(entry.short[i]) + '</span></span>' +
          '<span class="help-modal-level-text">' + escapeHtml(entry.detail[i]) + '</span>';
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

    var lbl = document.createElement('div');
    lbl.className = 'field-lbl';

    var lblIcon = document.createElement('i');
    lblIcon.className = 'ti ' + icon;
    lblIcon.setAttribute('aria-hidden', 'true');
    var lblText = document.createTextNode(' ' + label);

    var descBtn = document.createElement('button');
    descBtn.type = 'button';
    descBtn.className = 'field-desc';
    descBtn.setAttribute('aria-label', 'Choisir le niveau de ' + label);

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

    descBtn.addEventListener('click', openFieldHelp);
    descBtn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFieldHelp();
      }
    });

    lbl.appendChild(lblIcon);
    lbl.appendChild(lblText);

    var fieldHead = document.createElement('div');
    fieldHead.className = 'field-head';
    fieldHead.appendChild(lbl);
    fieldHead.appendChild(descBtn);

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
    function handleRangeInput() {
      var v = +inputEl.value;
      updateDisplay(v);
      onChange(v);
    }
    inputEl.addEventListener('input', handleRangeInput);
    inputEl.addEventListener('change', handleRangeInput);

    sliderWrap.appendChild(inputEl);
    field.appendChild(fieldHead);
    field.appendChild(sliderWrap);

    el.appendChild(field);

    function descriptionForLevel(idx) {
      return affirmationDisplayText(wordsKey, idx);
    }

    function updateDisplay(v) {
      v = clamp(v, min, max);
      var idx = snappedLevel(v, min, max);
      var shortLabel = wordFor(wordsKey, idx);
      var descText = descriptionForLevel(idx);
      descBtn.textContent = descText;
      descBtn.hidden = !descText;
      descBtn.setAttribute('aria-label', descText
        ? 'Choisir le niveau de ' + label + '. Actuellement : ' + shortLabel
        : 'Choisir le niveau de ' + label);
      inputEl.value = String(v);
    }

    function setValue(v) {
      updateDisplay(clamp(Math.round(v), min, max));
    }

    function getValue() {
      return +inputEl.value;
    }

    updateDisplay(value);

    return {
      el: field,
      getValue: getValue,
      setValue: setValue,
      updateDisplay: updateDisplay
    };
  }

  function createEnAttenteField(config) {
    var el = config.el;
    var checked = !!config.value;
    var onChange = config.onChange || function () {};

    var field = document.createElement('div');
    field.className = 'field field--en-attente';

    var label = document.createElement('label');
    label.className = 'en-attente-label';

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'en-attente-checkbox';
    input.checked = checked;
    input.setAttribute('aria-describedby', 'en-attente-desc');

    var textWrap = document.createElement('span');
    textWrap.className = 'en-attente-text';

    var title = document.createElement('span');
    title.className = 'en-attente-title';
    title.textContent = BLOCKED_LABEL;

    var desc = document.createElement('span');
    desc.className = 'en-attente-desc';
    desc.id = 'en-attente-desc';
    desc.textContent = BLOCKED_DESCRIPTION;

    textWrap.appendChild(title);
    textWrap.appendChild(desc);
    label.appendChild(input);
    label.appendChild(textWrap);
    field.appendChild(label);

    var reasonWrap = document.createElement('div');
    reasonWrap.className = 'blocked-reason-wrap';

    var reasonSelect = document.createElement('select');
    reasonSelect.className = 'blocked-reason-select';
    reasonSelect.setAttribute('aria-label', 'Motif du blocage');

    var placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = BLOCKED_REASON_PLACEHOLDER;
    reasonSelect.appendChild(placeholderOpt);

    BLOCKED_REASON_OPTIONS.forEach(function (optionLabel) {
      var option = document.createElement('option');
      option.value = optionLabel;
      option.textContent = optionLabel;
      reasonSelect.appendChild(option);
    });

    reasonWrap.appendChild(reasonSelect);
    field.appendChild(reasonWrap);
    el.appendChild(field);

    function updateReasonVisibility() {
      var on = input.checked;
      reasonWrap.hidden = !on;
      reasonSelect.disabled = !on;
    }

    function setValue(value) {
      input.checked = !!value;
      updateReasonVisibility();
    }

    function getValue() {
      return input.checked;
    }

    function setBlockedReason(value) {
      reasonSelect.value = isValidBlockedReason(value) ? value : '';
    }

    function getBlockedReason() {
      if (!input.checked) return '';
      var value = reasonSelect.value || '';
      return isValidBlockedReason(value) ? value : '';
    }

    setBlockedReason(config.blockedReason);
    updateReasonVisibility();

    input.addEventListener('change', function () {
      updateReasonVisibility();
      onChange(getValue());
    });

    reasonSelect.addEventListener('change', function () {
      onChange(getValue());
    });

    return {
      el: field,
      getValue: getValue,
      setValue: setValue,
      getBlockedReason: getBlockedReason,
      setBlockedReason: setBlockedReason
    };
  }

  function createHeatPanel(config) {
    var el = config.el;
    var onSegmentClick = config.onSegmentClick || function () {};

    var panel = document.createElement('div');
    panel.className = 'heat-panel';

    var blockedWarning = document.createElement('span');
    blockedWarning.className = 'heat-blocked-warning';
    blockedWarning.textContent = BLOCKED_DISPLAY;
    blockedWarning.title = 'Cette t\u00e2che est bloqu\u00e9e';
    blockedWarning.setAttribute('aria-label', 'Cette t\u00e2che est bloqu\u00e9e');
    blockedWarning.hidden = true;
    panel.appendChild(blockedWarning);

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
    var blabel = document.createElement('div');
    blabel.className = 'heat-badge-label';
    blabel.textContent = 'Optionnel';
    badge.appendChild(bnum);
    badge.appendChild(blabel);

    var tierDesc = document.createElement('p');
    tierDesc.className = 'heat-tier-desc';
    tierDesc.hidden = true;

    var top = document.createElement('div');
    top.className = 'heat-top';
    var topLabel = document.createElement('span');
    topLabel.className = 'heat-top-label';
    topLabel.textContent = 'Priorité d\'exécution';
    top.appendChild(topLabel);

    panel.appendChild(top);
    panel.appendChild(tierDesc);
    panel.appendChild(badge);

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
      if (seg.description) s.title = seg.label + '. ' + seg.description;
      bindSegmentTarget(s, seg);
      segsWrap.appendChild(s);
      segs.push(s);
    });
    panel.appendChild(segsWrap);

    var segLabels = document.createElement('div');
    segLabels.className = 'heat-seg-labels';
    HEAT_SEGMENTS.forEach(function (seg) {
      var label = document.createElement('span');
      label.textContent = seg.label;
      label.setAttribute('role', 'button');
      label.setAttribute('tabindex', '0');
      label.setAttribute('aria-label', seg.label);
      if (seg.description) label.title = seg.label + '. ' + seg.description;
      bindSegmentTarget(label, seg);
      segLabels.appendChild(label);
    });
    panel.appendChild(segLabels);

    el.appendChild(panel);

    function paint(result, display) {
      var d = display || resolveDisplay(result, {});
      var v = tierVisuals(d.inutile ? { inutile: true, label: INUTILE_LABEL } : { i: d.tierI, label: d.label });
      bnumVal.textContent = formatScore(d.score);
      dot.classList.remove('is-blocked');
      dot.style.background = v.seg;
      blabel.textContent = classicTierLabel(d);
      badge.style.setProperty('--heat-fill', v.fill);
      badge.style.setProperty('--heat-text', v.text);
      panel.style.setProperty('--heat-text', v.text);
      badge.style.removeProperty('background');
      bnum.style.removeProperty('color');
      blabel.style.removeProperty('color');
      badge.classList.toggle('is-inutile', !!d.inutile);
      badge.classList.remove('is-blocked');
      panel.classList.toggle('is-inutile', !!d.inutile);
      panel.classList.remove('is-blocked');
      panel.classList.toggle('has-blocked-warning', !!d.blocked);
      blockedWarning.hidden = !d.blocked;
      paintTierDescription(tierDesc, d);
      segs.forEach(function (s) {
        s.classList.toggle('on', !d.inutile && d.tierI != null && +s.dataset.i === d.tierI);
      });
    }

    return {
      el: panel,
      paint: paint
    };
  }

  function createCalcGraphPanel(config) {
    var el = config.el;
    var fields = config.fields || null;
    var onInputsChange = config.onChange || function () {};
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var SVG_W = 300;
    var SVG_H = 248;
    var MARGIN = { top: 14, right: 14, bottom: 36, left: 38 };
    var PLOT_W = SVG_W - MARGIN.left - MARGIN.right;
    var PLOT_H = SVG_H - MARGIN.top - MARGIN.bottom;
    var CONTOUR_RES = 40;
    var SURFACE_ALPHA = 0.78;
    var TIER_THRESHOLDS = [1.4, 2.9, 4.3, 5.8, 7.2, 8.6];
    var MARKER_CORE_R = 8;
    var MARKER_STROKE_W = 3;
    var MARKER_SHADOW_R = 9;
    var MARKER_HIT_R = 20;

    var SCORE_COLOR_STOPS = [
      { s: 0, r: 155, g: 152, b: 144 },
      { s: 1.4, r: 90, g: 159, b: 212 },
      { s: 2.9, r: 59, g: 169, b: 156 },
      { s: 4.3, r: 110, g: 173, b: 58 },
      { s: 5.8, r: 186, g: 117, b: 23 },
      { s: 7.2, r: 216, g: 90, b: 48 },
      { s: 8.6, r: 228, g: 82, b: 80 },
      { s: 9.3, r: 226, g: 75, b: 74 },
      { s: 10, r: 168, g: 42, b: 40 }
    ];

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
      u = snapAxis(u, 0, 4);
      i = snapAxis(i, 0, 4);
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
      return MARGIN.left + (u / 4) * PLOT_W;
    }

    function plotY(i) {
      return MARGIN.top + (1 - i / 4) * PLOT_H;
    }

    function formatEase(F) {
      return Math.abs(F - Math.round(F)) < 0.01 ? String(Math.round(F)) : F.toFixed(2);
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

    var panel = document.createElement('div');
    panel.className = 'calc-graph-panel';

    var body = document.createElement('div');
    body.className = 'calc-graph-body';

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
    descId.textContent = 'Score selon l\'urgence et l\'impact, pour un niveau d\'effort fixe';
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
      x: '8',
      y: '8',
      width: String(SVG_W - 16),
      height: String(SVG_H - 16),
      rx: '10'
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
      ticksG.appendChild(lineEl(plotX(g), plotY(0), plotX(g), plotY(0) + 4, 'calc-rsm-tick'));
      var tickLabelX = svgEl('text', { class: 'calc-rsm-tick-label' });
      tickLabelX.setAttribute('x', String(plotX(g)));
      tickLabelX.setAttribute('y', String(plotY(0) + 17));
      tickLabelX.setAttribute('text-anchor', 'middle');
      tickLabelX.textContent = String(g);
      ticksG.appendChild(tickLabelX);

      ticksG.appendChild(lineEl(plotX(0) - 4, plotY(g), plotX(0), plotY(g), 'calc-rsm-tick'));
      var tickLabelY = svgEl('text', { class: 'calc-rsm-tick-label' });
      tickLabelY.setAttribute('x', String(plotX(0) - 10));
      tickLabelY.setAttribute('y', String(plotY(g) + 3));
      tickLabelY.setAttribute('text-anchor', 'end');
      tickLabelY.textContent = String(g);
      ticksG.appendChild(tickLabelY);
    }
    axesG.appendChild(ticksG);

    var labelU = svgEl('text', { class: 'calc-rsm-axis-label calc-rsm-axis-label-x' });
    labelU.setAttribute('x', String(MARGIN.left + PLOT_W * 0.5));
    labelU.setAttribute('y', String(SVG_H - 5));
    labelU.setAttribute('text-anchor', 'middle');
    labelU.textContent = 'Urgence';
    labelU.setAttribute('title', KEYWORDS.urgency);

    var labelIY = MARGIN.top + PLOT_H * 0.5;
    var labelIX = plotX(0) - 22;
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
    easeSlider.setAttribute('aria-label', 'Effort');
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

    var surfaceCtx = surfaceCanvas.getContext('2d', { alpha: true });

    function clientToPlotClamped(clientX, clientY) {
      var rect = plotHit.getBoundingClientRect();
      var x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      var y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      return plotCoordsFromLocal(x, y, rect.width, rect.height);
    }

    function plotCoordsFromLocal(x, y, w, h) {
      return {
        u: (x / w) * 4,
        i: (1 - y / h) * 4
      };
    }

    function resizeSurfaceCanvas() {
      var chartRect = chart.getBoundingClientRect();
      if (chartRect.width < 1 || chartRect.height < 1) {
        return null;
      }
      // CSS percentages align with SVG viewBox; read rendered size for bitmap dims.
      var canvasRect = surfaceCanvas.getBoundingClientRect();
      var cssW = Math.max(1, Math.ceil(canvasRect.width));
      var cssH = Math.max(1, Math.ceil(canvasRect.height));
      if (cssW < 1 || cssH < 1) {
        return null;
      }
      var dpr = window.devicePixelRatio || 1;
      surfaceCanvas.width = Math.round(cssW * dpr);
      surfaceCanvas.height = Math.round(cssH * dpr);
      surfaceCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: cssW, h: cssH };
    }

    function paintSurface(F) {
      var size = resizeSurfaceCanvas();
      if (!size) return;
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
          data[px + 3] = Math.round(SURFACE_ALPHA * 255);
        }
      }
      surfaceCtx.putImageData(img, 0, 0);
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
      var span = 10;

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

      if (!draggingMarker) {
        paintSurface(F);
        paintContours(F);
      }
      paintMarker(markerU, markerI, d);

      var fStr = String(F);
      if (document.activeElement !== easeSlider && easeSlider.value !== fStr) {
        easeSlider.value = fStr;
      }

      descId.textContent =
        'Priorité selon urgence ' + U.toFixed(2) + ' et impact ' + I.toFixed(2) +
        ', effort ' + formatEase(F) + '/5' +
        ' — score ' + formatScore(d.score) + ', palier ' + d.label;
    }

    return {
      el: panel,
      paint: paint,
      updateTheme: updateChartTheme
    };
  }

  // ── 10. Variant mount & slider persistence ──────────────────────────────

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
    var formulaKey = variantConfig.formula || 'baseline';
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
    var heat;
    var calcGraph;
    var showCalcGraph = formulaKey === 'baseline';
    var sliderAnimFrame = null;

    var defaultState = {};
    variantConfig.dimensions.forEach(function (dim) {
      defaultState[dim.key] = defaults[dim.key] != null ? defaults[dim.key] : dim.value;
    });
    state = typeof variantConfig.loadState === 'function'
      ? variantConfig.loadState(defaultState)
      : loadSliderValues(defaultState, variantConfig.dimensions);
    state.enAttente = !!(state.enAttente || defaults.enAttente);
    state.blockedReason = state.blockedReason || defaults.blockedReason || '';

    function persistSliderState(skipFieldSync) {
      if (!skipFieldSync) syncStateFromFields();
      if (typeof variantConfig.onStateChange === 'function') {
        variantConfig.onStateChange(state);
      } else {
        saveSliderValues(state);
      }
    }

    function syncStateFromFields() {
      Object.keys(fields).forEach(function (key) {
        state[key] = fields[key].getValue();
      });
      if (enAttenteField) {
        state.enAttente = enAttenteField.getValue();
        state.blockedReason = enAttenteField.getBlockedReason();
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
        applyCardTierTint(card, display.cardTier);
        card.classList.toggle('is-inutile', !!display.inutile);
        card.classList.toggle('is-blocked', !!display.blocked);
        card.dataset.tier = display.label;
        heat.paint(result, display);
        if (calcGraph) calcGraph.paint(result, state, display);
      } catch (err) {
        console.error('PriorityUI.mountVariant repaint failed', { id: variantId, error: err });
      }
    }

    heat = createHeatPanel({
      el: card,
      onSegmentClick: function (targetP) {
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
    card.appendChild(fieldsSection);

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
    });

    if (showCalcGraph) {
      try {
        calcGraph = createCalcGraphPanel({
          el: fieldsSection,
          fields: fields,
          onChange: function () {
            cancelSliderAnim();
            repaint();
            persistSliderState();
          }
        });
      } catch (err) {
        console.error('PriorityUI.createCalcGraphPanel failed', { id: variantId, error: err });
      }
    }

    var blockedSection = document.createElement('div');
    blockedSection.className = 'variant-blocked-section';
    card.appendChild(blockedSection);

    enAttenteField = createEnAttenteField({
      el: blockedSection,
      value: state.enAttente,
      blockedReason: state.blockedReason,
      onChange: function () {
        cancelSliderAnim();
        repaint();
        persistSliderState();
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

    repaint();

    return {
      card: card,
      getState: function () {
        syncStateFromFields();
        return Object.assign({}, state);
      },
      setState: function (next) {
        Object.keys(next).forEach(function (key) {
          state[key] = next[key];
          if (fields[key]) fields[key].setValue(next[key]);
        });
        if (next.enAttente != null && enAttenteField) {
          enAttenteField.setValue(next.enAttente);
        }
        if (next.blockedReason != null && enAttenteField) {
          enAttenteField.setBlockedReason(next.blockedReason);
        }
        repaint();
        persistSliderState();
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
    LABELS: LABELS,
    KEYWORDS: KEYWORDS,
    QUESTIONS: QUESTIONS,
    TIERS: TIERS,
    TIER_SURFACE_MIX: TIER_SURFACE_MIX,
    HEAT_SEGMENTS: HEAT_SEGMENTS,
    FORMULAS: FORMULAS,
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
      threeD: formatBaseline
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
    createEnAttenteField: createEnAttenteField,
    createHeatPanel: createHeatPanel,
    createCalcGraphPanel: createCalcGraphPanel,
    mountVariant: mountVariant,
    tierFor: tierFor,
    isInutile: isInutile,
    isEnAttente: isEnAttente,
    resolveDisplay: resolveDisplay,
    classicTierLabel: classicTierLabel,
    taskBadgeLabel: taskBadgeLabel,
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
    BLOCKED_REASON_OPTIONS: BLOCKED_REASON_OPTIONS,
    isValidBlockedReason: isValidBlockedReason,
    formatBlockedBadgeText: formatBlockedBadgeText,
    wordFor: wordFor,
    wordHtmlFor: wordHtmlFor,
    levelIconSvg: levelIconSvg,
    affirmationFor: affirmationFor,
    affirmationDisplayText: affirmationDisplayText
  };

  global.PriorityUI = PriorityUI;
})(typeof window !== 'undefined' ? window : this);
