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
  var SECTION_COLLAPSE_KEYS = ['priority', 'graph', 'progress', 'due', 'blocked'];
  var DEFAULT_COLOR_SCHEME_KEY = 'blue';
  var SCORE_MAX = 10;
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
      short: ['Aucune', 'Faible', 'Utile', 'Importante', 'Impact majeur'],
      detail: [
        'Peu ou pas de bénéfice visible. L\'effort ne crée quasi aucune valeur, portée ni opportunité pour l\'équipe.',
        'Gain marginal avec peu de visibilité. Petite amélioration qui ne change que marginalement la valeur ou la portée des résultats.',
        'Amélioration nette pour l\'équipe ou le produit. Valeur concrète, bénéfices perceptibles et quelques opportunités débloquées.',
        'Objectif clé ou livrable majeur. Forte valeur, impact visible et portée significative sur les priorités en cours.',
        'Valeur exceptionnelle et large portée. Débloque de nombreuses tâches ou personnes ; opportunité stratégique que l\'équipe ressent immédiatement.'
      ],
      popup: {
        subtitle: 'À quel point est-il important de faire cette tâche?',
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
    impact: 'À quel point est-il important de faire cette tâche?',
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

  // Feu: gray → orange → red; maps cleanly onto Trello named badge colors.
  var FIRE_TIER_TRELLO_BADGE_COLORS = {
    0: 'red',
    1: 'orange',
    2: 'yellow',
    3: 'yellow',
    4: TRELLO_BADGE_COLOR_MUTED,
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
      ['#F0EEE9', '#C9B8A6', '#E8A04A', '#E07030', '#C23B2A'],
      '#C23B2A',
      FIRE_TIER_TRELLO_BADGE_COLORS
    )
  };

  var COLOR_SCHEME_OPTIONS = ['blue', 'fire'].map(function (key) {
    return { key: key, label: COLOR_SCHEMES[key].label };
  });

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
      description: 'Tâche prioritaire absolue. Impact direct sur l\'objectif, impossible de repousser sans conséquences majeures.'
    },
    {
      min: 7.2, label: 'Urgente', i: TIER_I.URGENTE,
      description: 'Tâche pressante, priorité absolue. Action rapide sous forte pression.'
    },
    {
      min: 5.8, label: 'Prioritaire', i: TIER_I.PRIORITAIRE,
      description: 'Attention prioritaire. À traiter en tête de file.'
    },
    {
      min: 4.3, label: 'Importante', i: TIER_I.IMPORTANTE,
      description: 'Planifiée. À exécuter avec engagement clair dans le backlog.'
    },
    {
      min: 2.9, label: 'Flexible', i: TIER_I.FLEXIBLE,
      description: 'Sans urgence ni blocage. À traiter selon l\'opportunité, peut glisser.'
    },
    {
      min: 1.4, label: 'Secondaire', i: TIER_I.SECONDAIRE,
      description: 'Utile mais non essentielle. À envisager quand la bande passante le permet.'
    },
    {
      min: 0, label: 'Optionnelle', i: TIER_I.OPTIONNELLE,
      description: 'Facultative, sans conséquence si ignorée. Peut être écartée de la file.'
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
    // Unknown / retired keys (vert, violet, amber, teal, …) fall back to Classique.
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
  var BLOCKED_REASON_SUGGESTIONS_LABEL = 'Suggestions';
  var BLOCKED_REASON_CLEAR_LABEL = 'Effacer le motif';
  var BLOCKED_REASON_WAITING_OTHER_TASK = 'En attente d\'une autre t\u00e2che';
  var BLOCKED_LINK_TYPE_SUBTASK = 'subtask';
  var BLOCKED_SUBTASK_PICKER_LABEL = 'Sous-t\u00e2che bloquante';
  var BLOCKED_SUBTASK_EMPTY = 'Aucune sous-t\u00e2che';
  var BLOCKED_SUBTASK_CLEAR_LABEL = 'Retirer le lien vers la sous-t\u00e2che';
  var BLOCKED_SUBTASK_FALLBACK_LABEL = 'Sous-t\u00e2che';
  var BLOCKED_REASON_FREQ_STORAGE_KEY = 'trello-priority-powerup/blocked-reason-freq';
  var BLOCKED_REASON_EMPTY_SUGGESTION_CAP = 10;
  /** Core presets shown in the empty-state suggestion set (with frequent reasons). */
  var BLOCKED_REASON_CORE_PRESETS = [
    'En attente d\'une r\u00e9ponse',
    'En attente de budget',
    'En attente d\'une approbation',
    'En attente de mat\u00e9riel',
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
   * - Empty input + no selections: top frequent ∪ core presets (capped).
   * - Empty input + selections: none (caller hides the list).
   * - Typing: dictionary ∪ frequent customs matching substring.
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
    if (!query && selected.length >= 1) return [];

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

    if (!query) {
      var cap = options && options.cap != null
        ? options.cap
        : BLOCKED_REASON_EMPTY_SUGGESTION_CAP;
      if (labels.length > cap) labels = labels.slice(0, cap);
    }
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
      var key = reason.toLocaleLowerCase('fr-FR');
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
      return isBlockedWaitingOtherTask(normalizeBlockedReasons(reasonOrReasons));
    }
    return normalizeBlockedReason(reasonOrReasons) === BLOCKED_REASON_WAITING_OTHER_TASK;
  }

  /**
   * Elegant French summary for badges / collapsed section.
   * One reason as-is; several as comma-separated when short, else « first +N ».
   */
  function formatBlockedReasonsSummary(reasons, options) {
    var list = normalizeBlockedReasons(reasons);
    var emptyLabel =
      options && options.empty != null ? options.empty : BLOCKED_LABEL;
    if (!list.length) return emptyLabel;
    if (list.length === 1) return list[0];
    var maxLen = options && options.maxLength != null ? options.maxLength : 42;
    var comma = list.join(', ');
    if (comma.length <= maxLen) return comma;
    return list[0] + ' +' + (list.length - 1);
  }

  /** Normalize shared-storage blocked link (`{ type: 'subtask', id }`). */
  function normalizeBlockedLink(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.type !== BLOCKED_LINK_TYPE_SUBTASK) return null;
    var id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) return null;
    return { type: BLOCKED_LINK_TYPE_SUBTASK, id: id };
  }

  function blockedLinkFromRaw(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var link = normalizeBlockedLink(raw.blockedLink);
    if (link) return link;
    if (typeof raw.blockedSubtaskId === 'string') {
      var id = raw.blockedSubtaskId.trim();
      if (id) return { type: BLOCKED_LINK_TYPE_SUBTASK, id: id };
    }
    return null;
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
  var DUE_DATE_CLEAR_LABEL = 'Effacer l\'\u00e9ch\u00e9ance';
  var DUE_DATE_PLACEHOLDER = 'Choisir une date';
  var DUE_DATE_TODAY_LABEL = 'Aujourd\'hui';
  var DUE_DATE_CLOSE_LABEL = 'Fermer';
  var DUE_DATE_PREV_MONTH = 'Mois pr\u00e9c\u00e9dent';
  var DUE_DATE_NEXT_MONTH = 'Mois suivant';
  var DUE_DATE_CALENDAR_LABEL = 'Calendrier d\'\u00e9ch\u00e9ance';
  var DUE_DATE_BOX_LABEL = 'Calendrier';
  var DUE_DATE_TIME_LABEL = 'Heure';
  var DUE_DATE_TIME_PLACEHOLDER = 'Choisir une heure';
  var DUE_DATE_TIME_CLEAR_LABEL = 'Effacer l\'heure';
  var DUE_DATE_TIME_NO_TIME_LABEL = 'Pas d\'heure';
  var DUE_DATE_TIME_PICKER_LABEL = 'Choix de l\'heure';
  var DUE_DATE_TIME_SUGGESTIONS_LABEL = 'Suggestions';
  var DUE_DATE_QUICK_SUGGESTIONS_LABEL = 'Suggestions de date';
  var DUE_DATE_TIME_DIAL_LABEL = 'Horloge';
  var DUE_DATE_TIME_HOURS_ARIA = 'Heures';
  var DUE_DATE_TIME_MINUTES_ARIA = 'Minutes';
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
    { id: 'demain-matin', label: 'Demain matin' },
    { id: 'lundi-prochain', label: 'Lundi prochain' },
    { id: 'dans-deux-semaines', label: 'Dans deux semaines' }
  ];
  var DUE_DATE_TIME_MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  var DUE_DATE_TIME_CLOCK_SIZE = 212;
  var DUE_DATE_TIME_CLOCK_INNER_R = 54;
  var DUE_DATE_TIME_CLOCK_OUTER_R = 88;
  var DUE_DATE_TIME_CLOCK_MINUTE_R = 78;
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
  var DUE_DATE_WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  var DUE_DATE_WEEKDAY_NAMES = [
    'lundi',
    'mardi',
    'mercredi',
    'jeudi',
    'vendredi',
    'samedi',
    'dimanche'
  ];
  var MS_PER_DAY = 86400000;
  var MS_PER_HOUR = 3600000;
  var MS_PER_MINUTE = 60000;
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

  /** Resolve a quick-date chip id to `{ iso, time }` (local calendar). */
  function resolveDueDateQuickSuggestion(id) {
    if (!id || typeof id !== 'string') return null;
    var today = startOfLocalDay(new Date());
    var date;
    var time = '';
    if (id === 'demain-matin') {
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      time = '09:00';
    } else if (id === 'lundi-prochain') {
      // JS getDay(): Sun=0 … Sat=6. Want next Monday (1).
      var dow = today.getDay();
      var daysUntilMonday = dow === 0 ? 1 : (8 - dow);
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysUntilMonday);
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

  function formatDueDateDisplay(iso, time) {
    var dateText = formatDueDateBoxDisplay(iso);
    if (!dateText) return '';
    var normalizedTime = normalizeDueTime(time);
    if (!normalizedTime) return dateText;
    return dateText + ' \u00b7 ' + normalizedTime;
  }

  function mondayOffset(date) {
    return (date.getDay() + 6) % 7;
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

  function capitalizeCountdownPhrase(text) {
    if (!text) return '';
    var first = text.charAt(0);
    var upper = first.toLocaleUpperCase('fr-FR');
    return upper === first ? text : upper + text.slice(1);
  }

  /** French compact clock for collapsed section summaries (e.g. "9 h", "14 h 30"). */
  function formatDueTimeCompactFr(time) {
    var normalized = normalizeDueTime(time);
    if (!normalized) return '';
    var parts = normalized.split(':');
    var hours = +parts[0];
    var minutes = +parts[1];
    if (minutes === 0) return String(hours) + ' h';
    return String(hours) + ' h ' + pad2(minutes);
  }

  /** Compact header summary when an enabled due-date section is collapsed. */
  function formatDueDateCompactSummary(iso, time, now) {
    var normalized = normalizeDueDate(iso);
    if (!normalized) return 'Pas de date d\'\u00e9ch\u00e9ance';
    var days = daysUntilDue(normalized, now);
    var dayPart;
    if (days === 0) dayPart = 'Aujourd\'hui';
    else if (days === 1) dayPart = 'Demain';
    else if (days === -1) dayPart = 'Hier';
    else dayPart = capitalizeCountdownPhrase(formatDueCountdownDays(days));
    var dueTime = formatDueTimeCompactFr(time);
    var remaining = formatDueCountdown(normalized, now, time);
    // Overdue: relative lateness only — no redundant clock ("… à 13 h").
    if (remaining && remaining.indexOf('En retard') === 0) return remaining;
    if (dayPart.indexOf('En retard') === 0) return dayPart;
    var compact = dueTime ? dayPart + ' \u00e0 ' + dueTime : dayPart;
    // Day-scale remaining already matches dayPart (e.g. "Demain"). Append only
    // when a clock time yields finer relative text ("16 h restantes").
    if (!remaining || remaining === dayPart) return compact;
    if (dueTime) {
      var ms = msUntilDue(normalized, time, now);
      if (isFinite(ms) && Math.abs(ms) < MS_PER_DAY) {
        return compact + ' \u00b7 ' + remaining;
      }
    }
    return compact;
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
        if (hours < 24) {
          if (past) {
            phrase = hours === 1 ? 'en retard de 1 h' : 'en retard de ' + hours + ' h';
          } else {
            phrase = hours === 1 ? '1 h restante' : hours + ' h restantes';
          }
        } else {
          var days = Math.max(1, Math.round(abs / MS_PER_DAY));
          if (past) days = -days;
          phrase = formatDueCountdownDays(days);
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
  var DEFINE_PRIORITY_LABEL = 'D\u00e9finir la priorit\u00e9';

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
  var HEAT_TIER_DOT_BLOCKED_FALLBACK = 10;
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
    if (display.blocked) {
      var blockedI = display.tierI;
      if (blockedI != null && Object.prototype.hasOwnProperty.call(HEAT_TIER_DOT_SIZES, blockedI)) {
        return HEAT_TIER_DOT_SIZES[blockedI];
      }
      return HEAT_TIER_DOT_BLOCKED_FALLBACK;
    }
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
    for (var i = 0; i < TIER_DEFS.length; i++) {
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
        : formatBlockedReasonsSummary(reason, { empty: BLOCKED_LABEL });
    } else if (display && display.blockedReasons && display.blockedReasons.length) {
      suffix = formatBlockedReasonsSummary(display.blockedReasons, { empty: BLOCKED_LABEL });
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
    var link = normalizeBlockedLink(inputs.blockedLink);
    if (link && isBlockedWaitingOtherTask(reasons)) {
      next.blockedLink = link;
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
    return withDisplayExtras({
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

  function tierDescriptionContentKey(display) {
    if (!display) return '';
    if (display.inutile) return 'inutile:' + (INUTILE_STYLES.description || '');
    if (display.matrixLabel) {
      return 'matrix:' + display.matrixLabel + '\n' + (display.description || '');
    }
    return 'tier:' + tierDescriptionBody(display);
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
        description: 'Urgent et important. À traiter en priorité absolue, sans report.',
        score: 9.0,
        urgent: true,
        important: true,
        preset: { urgency: 3, impact: 3 }
      },
      {
        id: 'schedule',
        label: 'Planifier',
        description: 'Important mais pas urgent. À caler dans le backlog avec une date ou un créneau dédié.',
        score: 6.5,
        urgent: false,
        important: true,
        preset: { urgency: 1, impact: 3 }
      },
      {
        id: 'delegate',
        label: 'Déléguer',
        description: 'Urgent mais peu important. À confier ou traiter au minimum viable.',
        score: 4.0,
        urgent: true,
        important: false,
        preset: { urgency: 3, impact: 1 }
      },
      {
        id: 'delete',
        label: 'Éliminer',
        description: 'Ni urgent ni important. Candidat à écarter, repousser sans limite ou supprimer.',
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
    function handleRangeInput() {
      var v = +inputEl.value;
      updateDisplay(v);
      onChange(v);
    }
    inputEl.addEventListener('input', handleRangeInput);
    inputEl.addEventListener('change', handleRangeInput);

    sliderWrap.appendChild(inputEl);

    var fieldHead = document.createElement('div');
    fieldHead.className = 'field-head';
    fieldHead.appendChild(lblWrap);
    fieldHead.appendChild(sliderWrap);

    field.appendChild(fieldHead);

    el.appendChild(field);

    function updateDisplay(v) {
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

  function createCollapsibleEnableChrome(config) {
    var titleText = config.title || '';
    var bodyId = config.bodyId || '';
    var checkboxClass = config.checkboxClass || '';
    var labelClass = config.labelClass || '';
    var titleClass = config.titleClass || '';
    var leadingIcon = config.leadingIcon || '';
    var hideEnable = !!config.hideEnable || !!leadingIcon;
    var enableLabel = config.enableLabel || ('Activer ' + titleText);
    var collapseLabel = config.collapseLabel || ('Replier ' + titleText);
    var expandLabel = config.expandLabel || ('D\u00e9velopper ' + titleText);

    var head = document.createElement('div');
    head.className = 'section-toggle-head';

    var label = null;
    var checkbox = null;
    var leadingIconEl = null;

    if (!hideEnable) {
      // Checkbox alone enables/disables — title is not part of the label,
      // so clicking the heading collapses instead of toggling the feature.
      label = document.createElement('label');
      label.className = ('section-enable-label ' + labelClass).trim();

      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = ('section-enable-checkbox ' + checkboxClass).trim();
      checkbox.setAttribute('aria-label', enableLabel);
      if (bodyId) checkbox.setAttribute('aria-controls', bodyId);

      label.appendChild(checkbox);
      head.appendChild(label);
    } else if (leadingIcon) {
      // Decorative icon in place of the enable checkbox (always-on sections).
      leadingIconEl = document.createElement('span');
      leadingIconEl.className = ('section-leading-icon ' + labelClass).trim();
      leadingIconEl.setAttribute('aria-hidden', 'true');

      var iconGlyph = document.createElement('i');
      iconGlyph.className = ('ti ' + leadingIcon + ' section-leading-icon-glyph').trim();
      leadingIconEl.appendChild(iconGlyph);
      head.appendChild(leadingIconEl);
    }

    var collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'section-collapse-btn';
    if (bodyId) collapseBtn.setAttribute('aria-controls', bodyId);
    collapseBtn.setAttribute('aria-expanded', 'false');
    collapseBtn.setAttribute('aria-label', expandLabel);

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

    var chevron = document.createElement('i');
    chevron.className = 'ti ti-chevron-down section-collapse-chevron';
    chevron.setAttribute('aria-hidden', 'true');

    collapseBtn.appendChild(textWrap);
    collapseBtn.appendChild(summary);
    collapseBtn.appendChild(chevron);

    head.appendChild(collapseBtn);

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

    function syncUi(shouldNotifyLayout) {
      var wasHidden = !!body.hidden;
      if (chrome.checkbox) {
        chrome.checkbox.checked = enabled;
        chrome.checkbox.disabled = alwaysEnabled ? false : !enableAllowed;
        if (!enableAllowed) {
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
      var text = enabled ? (getSummary() || '') : '';
      chrome.summary.textContent = text;
      chrome.summary.hidden = !text;
      chrome.summary.setAttribute('aria-hidden', text ? 'false' : 'true');
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
        if (changed || options.expand != null) expanded = options.expand !== false;
        if (changed && typeof onAfterEnable === 'function') onAfterEnable(options);
      } else {
        if (options.expand != null) expanded = !!options.expand;
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
        setEnabled(false, {
          notifyLayout: options.notifyLayout,
          expand: options.expand != null ? options.expand : expanded
        });
        return;
      }
      syncUi(options.notifyLayout !== false);
    }

    function refreshSummary() {
      if (!enabled) {
        chrome.summary.hidden = true;
        chrome.summary.textContent = '';
        chrome.summary.setAttribute('aria-hidden', 'true');
        return;
      }
      var text = getSummary() || '';
      chrome.summary.textContent = text;
      chrome.summary.hidden = !text;
      chrome.summary.setAttribute('aria-hidden', text ? 'false' : 'true');
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
        if (!enableAllowed) {
          event.preventDefault();
          chrome.checkbox.checked = enabled;
        }
      });

      chrome.checkbox.addEventListener('change', function () {
        if (!enableAllowed) {
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

  function createEnAttenteField(config) {
    var el = config.el;
    var checked = !!config.value;
    var onChange = config.onChange || function () {};
    var onLayoutChange = config.onLayoutChange || function () {};
    var getSubtasks =
      typeof config.getSubtasks === 'function' ? config.getSubtasks : function () { return []; };
    var bodyId = 'blocked-section-body-' + Math.random().toString(36).slice(2, 9);
    var currentReasons = normalizeBlockedReasons(
      config.blockedReasons != null ? config.blockedReasons : config
    );
    var currentLink = isBlockedWaitingOtherTask(currentReasons)
      ? normalizeBlockedLink(config.blockedLink)
      : null;

    var field = document.createElement('div');
    field.className = 'field field--en-attente';

    var chrome = createCollapsibleEnableChrome({
      title: BLOCKED_LABEL,
      bodyId: bodyId,
      checkboxClass: 'en-attente-checkbox',
      labelClass: 'en-attente-label',
      titleClass: 'en-attente-title',
      collapseLabel: 'Replier Bloqu\u00e9',
      expandLabel: 'D\u00e9velopper Bloqu\u00e9'
    });
    field.appendChild(chrome.head);

    var reasonWrap = document.createElement('div');
    reasonWrap.className = 'blocked-reason-wrap section-toggle-body';
    reasonWrap.id = bodyId;

    var selectedWrap = document.createElement('div');
    selectedWrap.className = 'blocked-reason-selected';
    selectedWrap.hidden = !currentReasons.length;

    var subtaskWrap = document.createElement('div');
    subtaskWrap.className = 'blocked-subtask-wrap';
    subtaskWrap.hidden = true;

    var subtaskSelectedWrap = document.createElement('div');
    subtaskSelectedWrap.className = 'blocked-subtask-selected';
    subtaskSelectedWrap.hidden = true;

    var subtaskChip = document.createElement('span');
    subtaskChip.className = 'blocked-reason-chip blocked-subtask-chip';

    var subtaskTextEl = document.createElement('span');
    subtaskTextEl.className = 'blocked-reason-chip-text';

    var subtaskClearBtn = document.createElement('button');
    subtaskClearBtn.type = 'button';
    subtaskClearBtn.className = 'blocked-reason-chip-clear';
    subtaskClearBtn.setAttribute('aria-label', BLOCKED_SUBTASK_CLEAR_LABEL);
    subtaskClearBtn.textContent = '\u00d7';

    subtaskChip.appendChild(subtaskTextEl);
    subtaskChip.appendChild(subtaskClearBtn);
    subtaskSelectedWrap.appendChild(subtaskChip);

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
    subtaskWrap.appendChild(subtaskSelectedWrap);
    subtaskWrap.appendChild(subtaskPicker);

    var reasonInput = document.createElement('input');
    reasonInput.type = 'text';
    reasonInput.className = 'blocked-reason-input';
    reasonInput.placeholder = BLOCKED_REASON_PLACEHOLDER;
    reasonInput.setAttribute('aria-label', 'Motif du blocage');
    reasonInput.setAttribute('autocomplete', 'off');
    reasonInput.setAttribute('spellcheck', 'false');

    var suggestions = document.createElement('div');
    suggestions.className = 'blocked-reason-suggestions';

    var suggestionsLabel = document.createElement('div');
    suggestionsLabel.className = 'blocked-reason-suggestions-label';
    suggestionsLabel.textContent = BLOCKED_REASON_SUGGESTIONS_LABEL;

    var suggestionsList = document.createElement('div');
    suggestionsList.className = 'blocked-reason-suggestions-list';
    suggestionsList.setAttribute('role', 'list');

    suggestions.appendChild(suggestionsLabel);
    suggestions.appendChild(suggestionsList);

    reasonWrap.appendChild(selectedWrap);
    reasonWrap.appendChild(subtaskWrap);
    reasonWrap.appendChild(reasonInput);
    reasonWrap.appendChild(suggestions);
    field.appendChild(reasonWrap);
    el.appendChild(field);

    function readReasons() {
      return currentReasons.slice();
    }

    function readLink() {
      return currentLink;
    }

    function reasonKey(reason) {
      return normalizeBlockedReason(reason).toLocaleLowerCase('fr-FR');
    }

    function hasReason(reason) {
      var key = reasonKey(reason);
      if (!key) return false;
      for (var i = 0; i < currentReasons.length; i++) {
        if (reasonKey(currentReasons[i]) === key) return true;
      }
      return false;
    }

    function linkedSubtaskLabel() {
      if (!currentLink) return '';
      var item = findSubtaskById(getSubtasks() || [], currentLink.id);
      if (item && item.text) return item.text;
      return BLOCKED_SUBTASK_FALLBACK_LABEL;
    }

    function notifyReasonChange() {
      collapse.refreshSummary();
      onChange(getValue());
    }

    function commitLink(nextLink) {
      var next = normalizeBlockedLink(nextLink);
      var prevId = currentLink && currentLink.id;
      var nextId = next && next.id;
      if (prevId === nextId) {
        refreshSubtaskUi();
        return;
      }
      currentLink = next;
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
    }

    function syncLinkWithReasons() {
      if (!isBlockedWaitingOtherTask(currentReasons)) {
        currentLink = null;
      }
    }

    function addReason(value, options) {
      var next = normalizeBlockedReason(value);
      var trackFreq = !(options && options.trackFreq === false);
      if (!next || hasReason(next)) {
        refreshSelected();
        refreshSuggestions();
        refreshSubtaskUi();
        return;
      }
      if (trackFreq) bumpBlockedReasonFreq(next);
      currentReasons = currentReasons.concat([next]);
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
    }

    function removeReason(value) {
      var key = reasonKey(value);
      if (!key) return;
      var next = [];
      for (var i = 0; i < currentReasons.length; i++) {
        if (reasonKey(currentReasons[i]) !== key) next.push(currentReasons[i]);
      }
      if (next.length === currentReasons.length) return;
      currentReasons = next;
      syncLinkWithReasons();
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
    }

    function setReasons(value) {
      currentReasons = normalizeBlockedReasons(value);
      syncLinkWithReasons();
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      collapse.refreshSummary();
    }

    function refreshSelected() {
      while (selectedWrap.firstChild) selectedWrap.removeChild(selectedWrap.firstChild);
      var hasReason = currentReasons.length > 0;
      selectedWrap.hidden = !hasReason;
      field.classList.toggle('has-blocked-reason', hasReason);
      for (var i = 0; i < currentReasons.length; i++) {
        (function (reason) {
          var chip = document.createElement('span');
          chip.className = 'blocked-reason-chip';

          var text = document.createElement('span');
          text.className = 'blocked-reason-chip-text';
          text.textContent = reason;
          text.title = reason;

          var clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'blocked-reason-chip-clear';
          clearBtn.setAttribute('aria-label', BLOCKED_REASON_CLEAR_LABEL + ' : ' + reason);
          clearBtn.textContent = '\u00d7';
          clearBtn.addEventListener('click', function () {
            removeReason(reason);
            reasonInput.focus();
          });

          chip.appendChild(text);
          chip.appendChild(clearBtn);
          selectedWrap.appendChild(chip);
        })(currentReasons[i]);
      }
    }

    function refreshSuggestions() {
      var query = (reasonInput.value || '').trim();
      var ranked = rankBlockedReasonSuggestions({
        query: query,
        selected: currentReasons,
        cap: BLOCKED_REASON_EMPTY_SUGGESTION_CAP
      });
      while (suggestionsList.firstChild) {
        suggestionsList.removeChild(suggestionsList.firstChild);
      }
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
      var wasHidden = suggestions.hidden;
      suggestions.hidden = ranked.length === 0;
      if (wasHidden !== suggestions.hidden) onLayoutChange();
    }

    function refreshSubtaskUi() {
      var waiting = isBlockedWaitingOtherTask(currentReasons);
      var wasHidden = subtaskWrap.hidden;
      subtaskWrap.hidden = !waiting;
      if (!waiting) {
        subtaskSelectedWrap.hidden = true;
        subtaskPicker.hidden = true;
        field.classList.remove('has-blocked-subtask-link');
        if (wasHidden !== subtaskWrap.hidden) onLayoutChange();
        return;
      }

      var items = getSubtasks() || [];
      var linkedItem = currentLink ? findSubtaskById(items, currentLink.id) : null;
      var hasLink = !!currentLink;
      subtaskSelectedWrap.hidden = !hasLink;
      if (hasLink) {
        subtaskTextEl.textContent = linkedItem && linkedItem.text
          ? linkedItem.text
          : BLOCKED_SUBTASK_FALLBACK_LABEL;
      }
      field.classList.toggle('has-blocked-subtask-link', hasLink);

      while (subtaskList.firstChild) subtaskList.removeChild(subtaskList.firstChild);
      var visibleCount = 0;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || !item.id || !item.text) continue;
        if (currentLink && item.id === currentLink.id) continue;
        var opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'blocked-reason-suggestion blocked-subtask-option';
        opt.setAttribute('role', 'listitem');
        opt.textContent = item.text;
        opt.dataset.subtaskId = item.id;
        opt.title = item.text;
        (function (subtaskId) {
          opt.addEventListener('click', function () {
            commitLink({ type: BLOCKED_LINK_TYPE_SUBTASK, id: subtaskId });
          });
        })(item.id);
        subtaskList.appendChild(opt);
        visibleCount += 1;
      }

      var empty = items.length === 0;
      subtaskEmpty.hidden = !empty;
      subtaskList.hidden = empty || visibleCount === 0;
      subtaskPicker.hidden = hasLink && visibleCount === 0 && !empty;
      if (empty) subtaskPicker.hidden = false;

      if (wasHidden !== subtaskWrap.hidden) onLayoutChange();
    }

    // Keep blockedReasons when disabling — only enAttente (enabled) drives badges.
    var collapse = bindCollapsibleEnable({
      field: field,
      body: reasonWrap,
      chrome: chrome,
      enabled: checked,
      expanded: config.expanded != null ? !!config.expanded : checked,
      getSummary: function () {
        var summary = capitalizeCountdownPhrase(
          formatBlockedReasonsSummary(currentReasons, { empty: BLOCKED_LABEL })
        );
        if (isBlockedWaitingOtherTask(currentReasons) && currentLink) {
          var linkLabel = linkedSubtaskLabel();
          if (linkLabel) summary += ' \u2014 ' + linkLabel;
        }
        return summary + '\u2026';
      },
      onLayoutChange: onLayoutChange,
      onExpandChange: config.onExpandChange || null,
      onEnableChange: function () {
        onChange(collapse.isEnabled());
      }
    });

    function setValue(value) {
      collapse.setEnabled(!!value, { notifyLayout: false, expand: !!value });
    }

    function getValue() {
      return collapse.isEnabled();
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

    function setBlockedLink(value) {
      currentLink = isBlockedWaitingOtherTask(currentReasons)
        ? normalizeBlockedLink(value)
        : null;
      refreshSubtaskUi();
      collapse.refreshSummary();
    }

    function getBlockedLink() {
      return isBlockedWaitingOtherTask(currentReasons) ? readLink() : null;
    }

    function refreshSubtasks() {
      refreshSubtaskUi();
      collapse.refreshSummary();
    }

    subtaskClearBtn.addEventListener('click', function () {
      commitLink(null);
    });

    reasonInput.addEventListener('input', function () {
      refreshSuggestions();
    });

    reasonInput.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      var typed = normalizeBlockedReason(reasonInput.value);
      if (!typed) return;
      addReason(typed);
      reasonInput.value = '';
      refreshSuggestions();
    });

    setBlockedReasons(
      config.blockedReasons != null ? config.blockedReasons : config.blockedReason
    );
    if (config.blockedLink) setBlockedLink(config.blockedLink);

    return {
      el: field,
      getValue: getValue,
      setValue: setValue,
      getBlockedReasons: getBlockedReasons,
      setBlockedReasons: setBlockedReasons,
      getBlockedReason: getBlockedReason,
      setBlockedReason: setBlockedReason,
      getBlockedLink: getBlockedLink,
      setBlockedLink: setBlockedLink,
      refreshSubtasks: refreshSubtasks,
      setEnabled: function (next) {
        setValue(next);
      },
      setEnableAllowed: collapse.setEnableAllowed,
      isEnableAllowed: collapse.isEnableAllowed,
      isEnabled: collapse.isEnabled,
      setExpanded: collapse.setExpanded,
      isExpanded: collapse.isExpanded
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
    var initialEnabled =
      initialValue && typeof initialValue === 'object' && initialValue.dueEnabled != null
        ? !!initialValue.dueEnabled && !!current
        : config.enabled != null
          ? !!config.enabled
          : !!current;
    var enabled = initialEnabled;
    var open = false;
    var timeOpen = false;
    var viewYear;
    var viewMonth;
    var focusIso = current || toIsoDate(startOfLocalDay(new Date()));
    var docListenersBound = false;
    var uid = 'due-cal-' + Math.random().toString(36).slice(2, 9);
    var bodyId = uid + '-body';
    var collapseApi = null;

    function syncViewFromValue(iso) {
      var date = dueDateToLocalDate(iso) || startOfLocalDay(new Date());
      viewYear = date.getFullYear();
      viewMonth = date.getMonth();
      focusIso = toIsoDate(date);
    }

    syncViewFromValue(current);

    var field = document.createElement('div');
    field.className = 'field field--due-date';

    var chrome = createCollapsibleEnableChrome({
      title: DUE_DATE_LABEL,
      bodyId: bodyId,
      checkboxClass: 'due-date-checkbox',
      labelClass: 'due-date-label',
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

    var pickers = document.createElement('div');
    pickers.className = 'due-date-pickers';

    var datePicker = document.createElement('div');
    datePicker.className = 'due-date-picker due-date-picker--calendar';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'due-date-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', uid + '-popover');
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

    var triggerValue = document.createElement('span');
    triggerValue.className = 'due-date-trigger-value';

    triggerText.appendChild(triggerTitle);
    triggerText.appendChild(triggerValue);

    trigger.appendChild(triggerIcon);
    trigger.appendChild(triggerText);

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'due-date-clear';
    clearBtn.textContent = '\u00d7';
    clearBtn.title = DUE_DATE_CLEAR_LABEL;
    clearBtn.setAttribute('aria-label', DUE_DATE_CLEAR_LABEL);

    datePicker.appendChild(trigger);
    datePicker.appendChild(clearBtn);

    var timePicker = document.createElement('div');
    timePicker.className = 'due-date-picker due-date-picker--time';

    var timeTrigger = document.createElement('button');
    timeTrigger.type = 'button';
    timeTrigger.className = 'due-date-time-trigger';
    timeTrigger.setAttribute('aria-haspopup', 'dialog');
    timeTrigger.setAttribute('aria-expanded', 'false');
    timeTrigger.setAttribute('aria-controls', uid + '-time-popover');
    timeTrigger.setAttribute('aria-label', DUE_DATE_TIME_LABEL);

    var timeIcon = document.createElement('i');
    timeIcon.className = 'ti ti-clock due-date-time-icon';
    timeIcon.setAttribute('aria-hidden', 'true');

    var timeTriggerText = document.createElement('span');
    timeTriggerText.className = 'due-date-time-trigger-text';

    var timeTitle = document.createElement('span');
    timeTitle.className = 'due-date-time-title';
    timeTitle.textContent = DUE_DATE_TIME_LABEL;

    var timeValue = document.createElement('span');
    timeValue.className = 'due-date-time-value';

    timeTriggerText.appendChild(timeTitle);
    timeTriggerText.appendChild(timeValue);

    timeTrigger.appendChild(timeIcon);
    timeTrigger.appendChild(timeTriggerText);

    var timeClearBtn = document.createElement('button');
    timeClearBtn.type = 'button';
    timeClearBtn.className = 'due-date-time-clear';
    timeClearBtn.textContent = '\u00d7';
    timeClearBtn.title = DUE_DATE_TIME_CLEAR_LABEL;
    timeClearBtn.setAttribute('aria-label', DUE_DATE_TIME_CLEAR_LABEL);
    timeClearBtn.hidden = !currentTime;

    timePicker.appendChild(timeTrigger);
    timePicker.appendChild(timeClearBtn);

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
      chip.textContent = item.label;
      chip.setAttribute('aria-label', item.label);
      chip.addEventListener('click', function () {
        applyQuickSuggestion(item.id);
      });
      suggestions.appendChild(chip);
    });

    body.appendChild(countdown);
    body.appendChild(pickers);
    body.appendChild(suggestions);

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
      chip.setAttribute('aria-label', period.label + ', ' + period.time);
      chip.innerHTML = dueTimePeriodIconSvg(period.id);
      var chipBody = document.createElement('span');
      chipBody.className = 'due-date-time-chip-body';
      var chipLabel = document.createElement('span');
      chipLabel.className = 'due-date-time-chip-label';
      chipLabel.textContent = period.label;
      var chipTime = document.createElement('span');
      chipTime.className = 'due-date-time-chip-time';
      chipTime.textContent = period.time;
      chipBody.appendChild(chipLabel);
      chipBody.appendChild(chipTime);
      chip.appendChild(chipBody);
      chip.addEventListener('click', function () {
        selectTime(period.time, false);
        setDialMode('minute');
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

    timeDialSection.appendChild(timeDialHeader);
    timeDialSection.appendChild(clockFace);
    timePopover.appendChild(timeDialSection);

    var timeFooter = document.createElement('div');
    timeFooter.className = 'due-date-footer due-date-time-footer';

    var noTimeBtn = document.createElement('button');
    noTimeBtn.type = 'button';
    noTimeBtn.className = 'due-date-today due-date-time-no-time';
    noTimeBtn.textContent = DUE_DATE_TIME_NO_TIME_LABEL;
    noTimeBtn.setAttribute('aria-label', DUE_DATE_TIME_NO_TIME_LABEL);
    noTimeBtn.title = DUE_DATE_TIME_NO_TIME_LABEL;

    var timeCloseBtn = document.createElement('button');
    timeCloseBtn.type = 'button';
    timeCloseBtn.className = 'due-date-close';
    timeCloseBtn.textContent = DUE_DATE_CLOSE_LABEL;
    timeCloseBtn.setAttribute('aria-label', DUE_DATE_CLOSE_LABEL);
    timeCloseBtn.title = DUE_DATE_CLOSE_LABEL;

    timeFooter.appendChild(noTimeBtn);
    timeFooter.appendChild(timeCloseBtn);
    timePopover.appendChild(timeFooter);

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

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'due-date-close';
    closeBtn.textContent = DUE_DATE_CLOSE_LABEL;
    closeBtn.setAttribute('aria-label', DUE_DATE_CLOSE_LABEL);
    closeBtn.title = DUE_DATE_CLOSE_LABEL;

    footer.appendChild(todayBtn);
    footer.appendChild(closeBtn);
    popover.appendChild(footer);

    /* Popovers stack under the dual Calendar / Time picker row. */
    body.appendChild(popover);
    body.appendChild(timePopover);

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

    function refreshTimeRow() {
      /* Muted look only when no date — keep Heure clickable (no disabled attr). */
      timeClearBtn.hidden = !currentTime;
      pickers.classList.toggle('has-time', !!currentTime);
      pickers.classList.toggle('has-date', !!current);
      timePicker.classList.toggle('is-disabled', !current);
      timeTrigger.disabled = false;
      timeTrigger.removeAttribute('aria-disabled');
      field.classList.toggle('is-time-open', timeOpen);
      timeTrigger.setAttribute('aria-expanded', timeOpen ? 'true' : 'false');
      if (currentTime) {
        timeValue.textContent = currentTime;
        timeValue.classList.remove('is-placeholder');
        timeTrigger.classList.add('has-value');
      } else {
        timeValue.textContent = DUE_DATE_TIME_PLACEHOLDER;
        timeValue.classList.add('is-placeholder');
        timeTrigger.classList.remove('has-value');
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

    function commitDigitalHour(opts) {
      var advance = !!(opts && opts.advance);
      var next = parseDigitalPart(digitalHourInput.value, 0, 23, dialHour);
      dialHour = next;
      digitalHourInput.value = pad2(dialHour);
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

    function commitDialTime(closeAfter) {
      selectTime(dialHhmm(), closeAfter === true);
    }

    function clockAngleDeg(value, max) {
      return (value / max) * 360;
    }

    function renderClockFace() {
      clockNums.textContent = '';
      var cx = DUE_DATE_TIME_CLOCK_SIZE / 2;
      var selected = dialMode === 'hour' ? dialHour : dialMinute;
      var angle;
      var radius;

      if (dialMode === 'hour') {
        for (var h = 0; h < 24; h++) {
          var hourBtn = document.createElement('button');
          hourBtn.type = 'button';
          hourBtn.className = 'due-date-time-clock-num' +
            (h >= 12 ? ' due-date-time-clock-num--outer' : ' due-date-time-clock-num--inner');
          hourBtn.textContent = pad2(h);
          hourBtn.dataset.value = String(h);
          hourBtn.setAttribute('aria-label', pad2(h) + ' h');
          if (h === dialHour) hourBtn.classList.add('is-selected');
          var hourAngle = clockAngleDeg(h % 12, 12);
          var hourRadius = h >= 12 ? DUE_DATE_TIME_CLOCK_OUTER_R : DUE_DATE_TIME_CLOCK_INNER_R;
          hourBtn.style.left = cx + 'px';
          hourBtn.style.top = cx + 'px';
          hourBtn.style.transform =
            'rotate(' + hourAngle + 'deg) translateY(-' + hourRadius + 'px) rotate(-' + hourAngle + 'deg)';
          hourBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            dialHour = +this.dataset.value;
            commitDialTime(false);
            setDialMode('minute');
          });
          clockNums.appendChild(hourBtn);
        }
        angle = clockAngleDeg(dialHour % 12, 12);
        radius = dialHour >= 12 ? DUE_DATE_TIME_CLOCK_OUTER_R : DUE_DATE_TIME_CLOCK_INNER_R;
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
      }

      clockHand.style.transform = 'rotate(' + angle + 'deg)';
      clockHand.style.setProperty('--hand-length', radius + 'px');
      clockFace.setAttribute('aria-valuenow', String(selected));
      clockFace.setAttribute(
        'aria-valuetext',
        dialMode === 'hour' ? pad2(dialHour) + ' heures' : pad2(dialMinute) + ' minutes'
      );

      if (document.activeElement !== digitalHourInput) {
        digitalHourInput.value = pad2(dialHour);
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
      var parsed = parseDialTime(currentTime || DUE_DATE_TIME_DEFAULT);
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

    function selectTime(hhmm, closeAfter) {
      if (!enabled) return;
      ensureDueDateForTime();
      if (!current) return;
      var next = normalizeDueTime(hhmm);
      currentTime = next || '';
      if (next) {
        var parsed = parseDialTime(next);
        dialHour = parsed.hour;
        dialMinute = parsed.minute;
      }
      emitChange();
      if (closeAfter !== false) closeTimePicker(true);
      else syncTimePickerSelection();
    }

    function refreshSuggestions() {
      var show = enabled && !current;
      var wasHidden = suggestions.hidden;
      suggestions.hidden = !show;
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
      focusIso = next;
      syncViewFromValue(next);
      closeCalendar(false);
      closeTimePicker(false);
      emitChange();
      trigger.focus();
    }

    function refreshTrigger() {
      var display = formatDueDateBoxDisplay(current);
      if (display) {
        triggerValue.textContent = display;
        triggerValue.classList.remove('is-placeholder');
        trigger.classList.add('has-value');
        datePicker.classList.add('has-value');
      } else {
        triggerValue.textContent = DUE_DATE_PLACEHOLDER;
        triggerValue.classList.add('is-placeholder');
        trigger.classList.remove('has-value');
        datePicker.classList.remove('has-value');
      }
    }

    function refreshCountdown() {
      if (!current) {
        countdown.textContent = '';
        countdown.hidden = true;
        countdown.classList.remove('is-past');
        clearBtn.hidden = true;
        field.classList.remove('has-due-date', 'is-past');
        refreshTimeRow();
        refreshTrigger();
        refreshSuggestions();
        if (collapseApi) collapseApi.refreshSummary();
        return;
      }
      refreshTrigger();
      refreshTimeRow();
      refreshSuggestions();
      if (!enabled) {
        countdown.textContent = '';
        countdown.hidden = true;
        countdown.classList.remove('is-past');
        clearBtn.hidden = true;
        field.classList.remove('has-due-date', 'is-past');
        if (collapseApi) collapseApi.refreshSummary();
        return;
      }
      var text = formatDueCountdown(current, null, currentTime);
      var past = isDuePast(current, currentTime);
      // Remaining text lives in `.section-toggle-summary`; keep this node for a11y only.
      countdown.textContent = text;
      countdown.hidden = true;
      countdown.classList.toggle('is-past', past);
      clearBtn.hidden = false;
      field.classList.add('has-due-date');
      field.classList.toggle('is-past', past);
      if (collapseApi) collapseApi.refreshSummary();
    }

    function emitChange() {
      refreshCountdown();
      onChange(getValues());
    }

    function getValues() {
      // Keep date/time even when disabled so re-enable restores them.
      return {
        dueDate: current || '',
        dueTime: current ? (currentTime || '') : '',
        dueEnabled: enabled
      };
    }

    function getValue() {
      return enabled ? (current || '') : '';
    }

    function setValue(value) {
      if (value && typeof value === 'object') {
        current = normalizeDueDate(value.dueDate);
        currentTime = current ? normalizeDueTime(value.dueTime) : '';
        if (value.dueEnabled != null) enabled = !!value.dueEnabled;
        else enabled = !!current;
      } else {
        current = normalizeDueDate(value);
        if (!current) currentTime = '';
        enabled = !!current;
      }
      if (current) {
        syncViewFromValue(current);
      } else {
        syncViewFromValue('');
        closeCalendar(false);
        closeTimePicker(false);
      }
      if (collapseApi) {
        collapseApi.setEnabled(enabled, {
          notifyLayout: false,
          expand: enabled
        });
      }
      if (open && enabled) renderCalendar();
      refreshCountdown();
    }

    function setEnabled(nextEnabled) {
      if (collapseApi) {
        collapseApi.setEnabled(!!nextEnabled, { expand: !!nextEnabled });
        return;
      }
      enabled = !!nextEnabled;
      refreshCountdown();
      emitChange();
    }

    function shiftMonth(delta) {
      var next = new Date(viewYear, viewMonth + delta, 1);
      viewYear = next.getFullYear();
      viewMonth = next.getMonth();
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var focusDay = dueDateToLocalDate(focusIso);
      var day = focusDay ? Math.min(focusDay.getDate(), daysInMonth) : 1;
      focusIso = toIsoDate(new Date(viewYear, viewMonth, day));
      renderCalendar(true);
    }

    function selectIso(iso, closeAfter) {
      if (!enabled) return;
      var next = normalizeDueDate(iso);
      if (!next) return;
      var appliedDefaultTime = false;
      if (!currentTime) {
        currentTime = DUE_DATE_TIME_DEFAULT;
        appliedDefaultTime = true;
      }
      current = next;
      focusIso = next;
      syncViewFromValue(next);
      emitChange();
      if (closeAfter !== false) {
        closeCalendar(false);
        if (appliedDefaultTime) openTimePicker();
        else if (enabled) trigger.focus();
      } else {
        renderCalendar();
      }
    }

    function focusDayButton(iso) {
      var btn = grid.querySelector('[data-iso="' + iso + '"]');
      if (btn) btn.focus();
    }

    function renderCalendar(keepFocus) {
      var monthName = DUE_DATE_MONTH_NAMES[viewMonth];
      monthLabel.textContent =
        monthName.charAt(0).toUpperCase() + monthName.slice(1) + ' ' + viewYear;

      var first = new Date(viewYear, viewMonth, 1);
      var startOffset = mondayOffset(first);
      var gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
      var todayIso = toIsoDate(startOfLocalDay(new Date()));

      grid.textContent = '';
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
          DUE_DATE_WEEKDAY_NAMES[mondayOffset(cellDate)] +
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
        if (isSelected) dayBtn.classList.add('is-selected');

        dayBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          selectIso(ev.currentTarget.dataset.iso, true);
        });

        cell.appendChild(dayBtn);
        row.appendChild(cell);
      }

      if (keepFocus) focusDayButton(focusIso);
    }

    function onDocPointerDown(ev) {
      if (!open && !timeOpen) return;
      if (field.contains(ev.target)) return;
      if (open) closeCalendar(true);
      if (timeOpen) closeTimePicker(true);
    }

    function onDocKeyDown(ev) {
      if (ev.key === 'Escape') {
        if (timeOpen) {
          ev.preventDefault();
          closeTimePicker(true);
          return;
        }
        if (open) {
          ev.preventDefault();
          closeCalendar(true);
          return;
        }
      }
      if (!open) return;
      if (document.activeElement === closeBtn) return;
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
          selectIso(document.activeElement.dataset.iso, true);
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
      document.addEventListener('mousedown', onDocPointerDown, true);
      document.addEventListener('keydown', onDocKeyDown, true);
      docListenersBound = true;
    }

    function unbindDocListeners() {
      if (docListenersBound && !open && !timeOpen) {
        document.removeEventListener('mousedown', onDocPointerDown, true);
        document.removeEventListener('keydown', onDocKeyDown, true);
        docListenersBound = false;
      }
    }

    function openCalendar() {
      if (!enabled || open) return;
      closeTimePicker(false);
      open = true;
      if (current) syncViewFromValue(current);
      else {
        syncViewFromValue('');
        focusIso = toIsoDate(startOfLocalDay(new Date()));
      }
      popover.hidden = false;
      field.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      renderCalendar(true);
      bindDocListeners();
      notifyLayout();
    }

    function closeCalendar(restoreFocus) {
      if (!open) return;
      open = false;
      popover.hidden = true;
      field.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      unbindDocListeners();
      if (restoreFocus && enabled) trigger.focus();
      notifyLayout();
    }

    function openTimePicker() {
      if (!enabled || timeOpen) return;
      closeCalendar(false);
      timeOpen = true;
      timePopover.hidden = false;
      field.classList.add('is-time-open');
      timeTrigger.setAttribute('aria-expanded', 'true');
      setDialMode('hour');
      syncTimePickerSelection();
      bindDocListeners();
      notifyLayout();
      requestAnimationFrame(function () {
        var selected =
          timePopover.querySelector('.due-date-time-chip.is-selected') ||
          digitalHourInput;
        if (selected) selected.focus();
      });
    }

    function closeTimePicker(restoreFocus) {
      if (!timeOpen) return;
      commitDigitalEdits();
      timeOpen = false;
      timePopover.hidden = true;
      field.classList.remove('is-time-open');
      timeTrigger.setAttribute('aria-expanded', 'false');
      unbindDocListeners();
      if (restoreFocus && enabled) timeTrigger.focus();
      notifyLayout();
    }

    trigger.addEventListener('click', function () {
      if (!enabled) return;
      if (open) closeCalendar(false);
      else openCalendar();
    });

    clearBtn.addEventListener('click', function () {
      if (!enabled) return;
      current = '';
      currentTime = '';
      closeCalendar(false);
      closeTimePicker(false);
      syncViewFromValue('');
      emitChange();
      trigger.focus();
    });

    timeTrigger.addEventListener('click', function () {
      if (!enabled) return;
      if (timeOpen) closeTimePicker(false);
      else openTimePicker();
    });

    timeClearBtn.addEventListener('click', function () {
      if (!enabled || !currentTime) return;
      currentTime = '';
      emitChange();
      if (timeOpen) syncTimePickerSelection();
      timeTrigger.focus();
    });

    noTimeBtn.addEventListener('click', function () {
      if (!enabled) return;
      currentTime = '';
      emitChange();
      closeTimePicker(true);
    });

    timeCloseBtn.addEventListener('click', function () {
      closeTimePicker(true);
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
        else digitalHourInput.value = pad2(dialHour);
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

    todayBtn.addEventListener('click', function () {
      selectIso(toIsoDate(startOfLocalDay(new Date())), true);
    });

    closeBtn.addEventListener('click', function () {
      closeCalendar(true);
    });

    collapseApi = bindCollapsibleEnable({
      field: field,
      body: body,
      chrome: chrome,
      enabled: enabled,
      expanded: config.expanded != null ? !!config.expanded : enabled,
      getSummary: function () {
        return formatDueDateCompactSummary(current, currentTime);
      },
      onLayoutChange: notifyLayout,
      onExpandChange: config.onExpandChange || null,
      onBeforeDisable: function () {
        closeCalendar(false);
        closeTimePicker(false);
        field.classList.remove('is-open', 'is-time-open', 'has-due-date', 'is-past');
      },
      onAfterEnable: function () {
        if (!current) openCalendar();
      },
      onEnableChange: function (on) {
        enabled = on;
        refreshCountdown();
        emitChange();
      }
    });
    refreshCountdown();

    return {
      el: field,
      getValue: getValue,
      getValues: getValues,
      setValue: setValue,
      setEnabled: setEnabled,
      setEnableAllowed: collapseApi.setEnableAllowed,
      isEnableAllowed: collapseApi.isEnableAllowed,
      setExpanded: collapseApi.setExpanded,
      isEnabled: collapseApi.isEnabled,
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

    var blockedWarning = document.createElement('div');
    blockedWarning.className = 'heat-blocked-warning';
    blockedWarning.hidden = true;
    blockedWarning.setAttribute('role', 'status');

    var blockedWarningLabel = document.createElement('span');
    blockedWarningLabel.className = 'heat-blocked-warning-label';
    blockedWarningLabel.textContent = BLOCKED_DISPLAY;
    blockedWarningLabel.title = 'Cette t\u00e2che est bloqu\u00e9e';
    blockedWarning.appendChild(blockedWarningLabel);

    var blockedDismiss = document.createElement('button');
    blockedDismiss.type = 'button';
    blockedDismiss.className = 'heat-blocked-dismiss';
    blockedDismiss.textContent = '\u00D7';
    blockedDismiss.title = 'Retirer le blocage';
    blockedDismiss.setAttribute('aria-label', 'Retirer le blocage');
    blockedDismiss.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof config.onUnblock === 'function') {
        config.onUnblock();
      }
    });
    blockedWarning.appendChild(blockedDismiss);
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
      if (seg.description) s.title = seg.label + '. ' + seg.description;
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
      if (seg.description) label.title = seg.label + '. ' + seg.description;
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
      // Overdue red lives on Échéance only — Progress keeps normal / blocked badge styling.
      var visualSource = d.blocked
        ? { blocked: true, label: BLOCKED_LABEL }
        : (d.inutile ? { inutile: true, label: INUTILE_LABEL } : { i: d.tierI, label: d.label });
      var v = tierVisuals(visualSource);
      var nextLabel = d.eisenhowerLabel || classicTierLabel(d);
      if (d.dueCountdown && !d.blocked) {
        nextLabel += ' (' + d.dueCountdown + ')';
      }
      var nextDescKey = tierDescriptionContentKey(d);
      var labelChanged = nextLabel !== lastPaintLabel;
      var descChanged = nextDescKey !== lastDescKey;
      var layoutSensitive = labelChanged || descChanged
        || badge.classList.contains('is-blocked') !== !!d.blocked
        || badge.classList.contains('is-overdue')
        || panel.classList.contains('is-overdue')
        || panel.classList.contains('has-blocked-warning') !== !!d.blocked;

      var firstRects = layoutSensitive ? captureHeatLayoutRects(heatFlipNodes) : null;
      if (layoutSensitive) {
        badgeLabelResponsive.setSuspended(true);
        segLabelResponsive.setSuspended(true);
      }

      bnumVal.textContent = formatScore(d.score);
      dot.classList.toggle('is-blocked', !!d.blocked);
      dot.style.setProperty('--heat-tier-dot-size', heatTierDotSizePx(d).toFixed(2) + 'px');
      if (d.blocked) {
        dot.style.removeProperty('background');
      } else {
        dot.style.background = v.seg;
      }
      currentBadgeTierLabel = nextLabel;
      badge.style.setProperty('--heat-fill', v.fill);
      badge.style.setProperty('--heat-text', v.text);
      panel.style.setProperty('--heat-text', v.text);
      badge.style.removeProperty('background');
      bnum.style.removeProperty('color');
      blabel.style.removeProperty('color');
      badge.classList.toggle('is-inutile', !!d.inutile);
      badge.classList.toggle('is-blocked', !!d.blocked);
      badge.classList.remove('is-overdue');
      panel.classList.toggle('is-inutile', !!d.inutile);
      // No panel crimson wash for blocked/overdue — section shells carry red.
      panel.classList.remove('is-blocked', 'is-overdue');
      panel.classList.toggle('has-blocked-warning', !!d.blocked);
      blockedWarning.hidden = !d.blocked;
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
      labelClass: 'graphique-leading-icon',
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
    var calcGraph;
    var formulaSwitcher;
    var sliderAnimFrame = null;
    var focusSection = variantConfig.focusSection || null;

    function sectionExpandedDefault(key, enabledFallback) {
      if (key === 'graph') return false;
      // Opening from Progrès should not auto-expand other sections.
      if (focusSection === 'progress') return false;
      return !!enabledFallback;
    }

    function sectionExpanded(key, enabledFallback) {
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
    state.blockedLink = isBlockedWaitingOtherTask(state.blockedReasons)
      ? normalizeBlockedLink(state.blockedLink || defaults.blockedLink)
      : null;
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
    if (defaults.priorityEnabled === false || state.priorityEnabled === false) {
      state.priorityEnabled = false;
    } else {
      state.priorityEnabled = true;
    }

    var priorityCollapse = null;
    var lastPrioritySummary = '';

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
      if (priorityCollapse) {
        state.priorityEnabled = priorityCollapse.isEnabled();
      }
      if (enAttenteField) {
        state.enAttente = enAttenteField.getValue();
        state.blockedReasons = enAttenteField.getBlockedReasons
          ? enAttenteField.getBlockedReasons()
          : normalizeBlockedReasons(enAttenteField.getBlockedReason());
        delete state.blockedReason;
        state.blockedLink = enAttenteField.getBlockedLink
          ? enAttenteField.getBlockedLink()
          : null;
      }
      if (dueDateField) {
        var dueValues = dueDateField.getValues();
        state.dueDate = dueValues.dueDate;
        state.dueTime = dueValues.dueTime;
        state.dueEnabled = !!dueValues.dueEnabled;
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
        lastPrioritySummary = display && display.label ? display.label : '';
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
          dueSection.classList.toggle('is-overdue', !!display.duePast);
        }
        if (heat) heat.paint(result, display);
        if (calcGraph) calcGraph.paint(result, state, display);
      } catch (err) {
        console.error('PriorityUI.mountVariant repaint failed', { id: variantId, error: err });
      }
    }

    function unblockTask() {
      if (enAttenteField) {
        enAttenteField.setValue(false);
        if (enAttenteField.setBlockedReasons) {
          enAttenteField.setBlockedReasons([]);
        } else {
          enAttenteField.setBlockedReason('');
        }
        if (enAttenteField.setBlockedLink) enAttenteField.setBlockedLink(null);
      }
      state.enAttente = false;
      state.blockedReasons = [];
      delete state.blockedReason;
      state.blockedLink = null;
      cancelSliderAnim();
      repaint();
      persistSliderState();
    }

    if (variantConfig.showFormulaSwitcher === true) {
      formulaSwitcher = createFormulaSwitcher({
        el: card,
        formulaKey: formulaKey,
        onChange: persistFormulaChange
      });
    }

    if (variantConfig.showCardHeader === true) {
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

    var priorityField = document.createElement('div');
    priorityField.className = 'field field--priority';

    var priorityBodyId = 'priority-section-body-' + Math.random().toString(36).slice(2, 9);
    var priorityChrome = createCollapsibleEnableChrome({
      title: 'Priorit\u00e9',
      bodyId: priorityBodyId,
      checkboxClass: 'priority-enable-checkbox',
      labelClass: 'priority-enable-label',
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
      onUnblock: unblockTask,
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
      enabled: state.priorityEnabled !== false,
      expanded: sectionExpanded('priority', state.priorityEnabled !== false),
      getSummary: function () {
        return lastPrioritySummary || '';
      },
      onLayoutChange: function () {
        if (typeof variantConfig.onLayoutChange === 'function') {
          variantConfig.onLayoutChange();
        }
      },
      onExpandChange: persistSectionExpanded('priority'),
      onEnableChange: function (on) {
        state.priorityEnabled = on;
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
        dueEnabled: dueEnabledInitial
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

    blockedSection = document.createElement('div');
    blockedSection.className = 'variant-blocked-section';
    card.appendChild(blockedSection);

    enAttenteField = createEnAttenteField({
      el: blockedSection,
      value: state.enAttente,
      blockedReasons: state.blockedReasons,
      blockedLink: state.blockedLink,
      getSubtasks: function () {
        return typeof variantConfig.getBlockedSubtasks === 'function'
          ? variantConfig.getBlockedSubtasks() || []
          : [];
      },
      expanded: sectionExpanded('blocked', !!state.enAttente),
      onExpandChange: persistSectionExpanded('blocked'),
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
      progressCompleteLock = locked;
      if (locked) {
        savedDueEnabledBeforeLock = dueDateField && dueDateField.isEnabled
          ? !!dueDateField.isEnabled()
          : !!state.dueEnabled;
        savedBlockedEnabledBeforeLock = enAttenteField
          ? !!enAttenteField.getValue()
          : !!state.enAttente;
        if (dueDateField && dueDateField.setEnableAllowed) {
          dueDateField.setEnableAllowed(false);
        }
        if (enAttenteField) {
          // Align with clearBlockedIfComplete / Done celebration: drop blocked when complete.
          if (enAttenteField.getValue()) enAttenteField.setValue(false);
          if (enAttenteField.setEnableAllowed) enAttenteField.setEnableAllowed(false);
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
      setState: function (next) {
        Object.keys(next).forEach(function (key) {
          state[key] = next[key];
          if (fields[key]) fields[key].setValue(next[key]);
        });
        if (next.priorityEnabled != null && priorityCollapse) {
          priorityCollapse.setEnabled(!!next.priorityEnabled, {
            notifyLayout: false,
            expand: !!next.priorityEnabled
          });
          state.priorityEnabled = !!next.priorityEnabled;
        }
        if (next.enAttente != null && enAttenteField) {
          enAttenteField.setValue(next.enAttente);
        }
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
        if (next.blockedLink !== undefined && enAttenteField && enAttenteField.setBlockedLink) {
          enAttenteField.setBlockedLink(next.blockedLink);
        }
        if ((next.dueDate != null || next.dueTime != null || next.dueEnabled != null) && dueDateField) {
          dueDateField.setValue({
            dueDate: next.dueDate != null ? next.dueDate : state.dueDate,
            dueTime: next.dueTime != null ? next.dueTime : state.dueTime,
            dueEnabled: next.dueEnabled != null ? next.dueEnabled : state.dueEnabled
          });
        }
        repaint();
        persistSliderState();
      },
      refreshBlockedSubtasks: function () {
        if (enAttenteField && enAttenteField.refreshSubtasks) {
          enAttenteField.refreshSubtasks();
        }
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
    BLOCKED_REASON_OPTIONS: BLOCKED_REASON_OPTIONS,
    BLOCKED_REASON_WAITING_OTHER_TASK: BLOCKED_REASON_WAITING_OTHER_TASK,
    BLOCKED_LINK_TYPE_SUBTASK: BLOCKED_LINK_TYPE_SUBTASK,
    isValidBlockedReason: isValidBlockedReason,
    normalizeBlockedReason: normalizeBlockedReason,
    normalizeBlockedReasons: normalizeBlockedReasons,
    formatBlockedReasonsSummary: formatBlockedReasonsSummary,
    isBlockedWaitingOtherTask: isBlockedWaitingOtherTask,
    normalizeBlockedLink: normalizeBlockedLink,
    formatBlockedBadgeText: formatBlockedBadgeText,
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
    resolveDueDateQuickSuggestion: resolveDueDateQuickSuggestion,
    daysUntilDue: daysUntilDue,
    msUntilDue: msUntilDue,
    isDuePast: isDuePast,
    formatDueCountdown: formatDueCountdown,
    formatDueDateDisplay: formatDueDateDisplay,
    formatDueDateCompactSummary: formatDueDateCompactSummary,
    formatDueBadgeText: formatDueBadgeText,
    dueBadgeSuffix: dueBadgeSuffix,
    isDueEnabled: isDueEnabled,
    withDueDateDisplay: withDueDateDisplay,
    createCollapsibleEnableChrome: createCollapsibleEnableChrome,
    bindCollapsibleEnable: bindCollapsibleEnable,
    wordFor: wordFor,
    wordHtmlFor: wordHtmlFor,
    levelIconSvg: levelIconSvg,
    affirmationFor: affirmationFor,
    affirmationDisplayText: affirmationDisplayText
  };

  global.PriorityUI = PriorityUI;

  try {
    applyColorScheme(DEFAULT_COLOR_SCHEME_KEY);
  } catch (bootstrapErr) {
    console.error('PriorityUI color scheme bootstrap failed', bootstrapErr);
  }
})(typeof window !== 'undefined' ? window : this);
