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
  var DEFAULT_COLOR_SCHEME_KEY = 'blue';

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

  function buildColorScheme(key, label, oklchStops) {
    var stops = oklchStopsToHex(oklchStops);
    return {
      key: key,
      label: label,
      oklchStops: oklchStops,
      oklabStops: oklchStopsToOklab(oklchStops),
      stops: stops,
      textOnLight: schemeTextOnLight(stops)
    };
  }

  // Five hand-tuned OKLCH ramps (light → dark): luminance steps + chroma curve per character.
  var COLOR_SCHEMES = {
    blue: buildColorScheme('blue', 'Bleu', [
      [0.965, 0.018, 240], [0.910, 0.048, 241], [0.835, 0.082, 243],
      [0.700, 0.125, 246], [0.480, 0.115, 248]
    ]),
    green: buildColorScheme('green', 'Vert', [
      [0.965, 0.022, 145], [0.915, 0.055, 146], [0.845, 0.095, 147],
      [0.710, 0.130, 148], [0.500, 0.115, 150]
    ]),
    purple: buildColorScheme('purple', 'Violet', [
      [0.965, 0.020, 302], [0.905, 0.058, 300], [0.830, 0.105, 298],
      [0.690, 0.155, 295], [0.480, 0.140, 292]
    ]),
    amber: buildColorScheme('amber', 'Ambre', [
      [0.975, 0.028, 92], [0.930, 0.070, 78], [0.870, 0.115, 68],
      [0.750, 0.145, 58], [0.560, 0.130, 52]
    ]),
    teal: buildColorScheme('teal', 'Sarcelle', [
      [0.965, 0.020, 195], [0.915, 0.050, 196], [0.845, 0.088, 198],
      [0.720, 0.120, 200], [0.520, 0.105, 202]
    ])
  };

  var COLOR_SCHEME_OPTIONS = ['blue', 'green', 'purple', 'amber', 'teal'].map(function (key) {
    return { key: key, label: COLOR_SCHEMES[key].label };
  });

  var activeColorSchemeKey = DEFAULT_COLOR_SCHEME_KEY;
  var activeColorStops = COLOR_SCHEMES.blue.stops.slice();
  var activeOklabStops = COLOR_SCHEMES.blue.oklabStops.slice();
  var activeTextOnLight = COLOR_SCHEMES.blue.textOnLight;
  var PRIORITY_TEXT_ON_DARK = '#ffffff';
  // Backward-compatible alias for the default blue palette.
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
    lime: '#51E898',
    'light-gray': '#B3BAC5'
  };
  var TRELLO_BADGE_COLOR_NAMES = Object.keys(TRELLO_BADGE_COLOR_HEX);

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
      (score / 10) * (activeColorStops.length - 1)));
  }

  function priorityStopTForTierIndex(tierI) {
    return Math.max(0, Math.min(activeColorStops.length - 1,
      ((6 - tierI) / 6) * (activeColorStops.length - 1)));
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
      min: 8.6, label: 'Critique', i: 0,
      description: 'Tâche prioritaire absolue. Impact direct sur l\'objectif, impossible de repousser sans conséquences majeures.'
    },
    {
      min: 7.2, label: 'Urgent', i: 1,
      description: 'Tâche pressante, priorité absolue. Action rapide sous forte pression.'
    },
    {
      min: 5.8, label: 'Prioritaire', i: 2,
      description: 'Attention prioritaire. À traiter en tête de file.'
    },
    {
      min: 4.3, label: 'Important', i: 3,
      description: 'Planifiée. À exécuter avec engagement clair dans le backlog.'
    },
    {
      min: 2.9, label: 'Flexible', i: 4,
      description: 'Sans urgence ni blocage. À traiter selon l\'opportunité, peut glisser.'
    },
    {
      min: 1.4, label: 'Secondaire', i: 5,
      description: 'Utile mais non essentielle. À envisager quand la bande passante le permet.'
    },
    {
      min: 0, label: 'Optionnel', i: 6,
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
    { i: 6, target: 0.7, preset: { urgency: 0, impact: 0, ease: 2 } },
    { i: 5, target: 2.1, preset: { urgency: 1, impact: 1, ease: 2 } },
    { i: 4, target: 3.6, preset: { urgency: 1, impact: 2, ease: 3 } },
    { i: 3, target: 5.0, preset: { urgency: 2, impact: 2, ease: 3 } },
    { i: 2, target: 6.5, preset: { urgency: 2, impact: 3, ease: 3 } },
    { i: 1, target: 7.9, preset: { urgency: 3, impact: 3, ease: 2 } },
    { i: 0, target: 9.3, preset: { urgency: 4, impact: 4, ease: 5 } }
  ];

  var HEAT_SEGMENTS = [];

  function rebuildHeatSegments() {
    HEAT_SEGMENTS.length = 0;
    HEAT_SEGMENT_DEFS.forEach(function (def) {
      var tierDef = TIER_DEFS[def.i];
      var tier = TIERS[def.i] || TIERS[6];
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

  function rebuildScoreColorStops() {
    var scores = [0, 1.4, 2.9, 4.3, 5.8, 7.2, 8.6, 9.3, 10];
    SCORE_COLOR_STOPS.length = 0;
    scores.forEach(function (s) {
      var rgb = priorityRgbAtStopT(priorityStopTForScore(s));
      SCORE_COLOR_STOPS.push({ s: s, r: rgb.r, g: rgb.g, b: rgb.b });
    });
  }

  // Trello card badges accept named colors only — rebuilt from active scheme tier seg colors.
  var TIER_TRELLO_BADGE_COLORS = {
    0: 'blue',
    1: 'blue',
    2: 'sky',
    3: 'sky',
    4: 'sky',
    5: 'light-gray',
    6: 'light-gray'
  };

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

  function rebuildTrelloBadgeColors() {
    for (var i = 0; i <= 4; i++) {
      var tier = TIERS[i];
      var avoid = i > 0 ? TIER_TRELLO_BADGE_COLORS[i - 1] : null;
      TIER_TRELLO_BADGE_COLORS[i] = nearestTrelloBadgeColorName(tier && tier.seg ? tier.seg : activeColorStops[0], avoid);
    }
    TIER_TRELLO_BADGE_COLORS[5] = 'light-gray';
    TIER_TRELLO_BADGE_COLORS[6] = 'light-gray';
  }

  function rebuildColorDerivedState() {
    rebuildTiersFromScheme();
    rebuildHeatSegments();
    rebuildScoreColorStops();
    rebuildTrelloBadgeColors();
  }

  function normalizeColorSchemeKey(key) {
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
      return COLOR_SCHEMES[raw] ? raw : null;
    } catch (e) { return null; }
  }

  function saveStoredColorSchemeKey(key) {
    try {
      if (typeof localStorage === 'undefined') return;
      if (!COLOR_SCHEMES[key]) return;
      localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, key);
    } catch (e) { /* ignore quota / private mode */ }
  }

  applyColorScheme(DEFAULT_COLOR_SCHEME_KEY);

  var TIER_LABEL_SHORT = {
    Critique: 'Crit',
    Urgent: 'Urg',
    Prioritaire: 'Prio',
    Important: 'Imp',
    Flexible: 'Flex',
    Secondaire: 'Sec',
    Optionnel: 'Opt'
  };

  function shortTierLabel(label) {
    if (!label) return '';
    if (Object.prototype.hasOwnProperty.call(TIER_LABEL_SHORT, label)) {
      return TIER_LABEL_SHORT[label];
    }
    return label;
  }

  function tierLabelForSpace(label, useShort) {
    if (!label) return '';
    return useShort ? shortTierLabel(label) : label;
  }

  function elementLabelOverflows(el) {
    return el.scrollWidth > el.clientWidth + 1;
  }

  function createResponsiveTierLabelGroup(config) {
    var container = config.container;
    var targets = config.targets || [];
    var useShort = false;

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

    function measureNeedsShort() {
      applyMode(false);
      for (var i = 0; i < targets.length; i++) {
        if (elementLabelOverflows(targets[i].el)) return true;
      }
      if (container && elementLabelOverflows(container)) return true;
      return false;
    }

    function sync() {
      applyMode(measureNeedsShort());
    }

    var ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(function () {
        sync();
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
      sync();
    }

    return {
      refresh: sync,
      isShort: function () { return useShort; },
      labelFor: function (full) { return tierLabelForSpace(full, useShort); },
      disconnect: function () { if (ro) ro.disconnect(); }
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
    fill: '#D4A5A5',
    text: '#4A0808',
    seg: '#8B0000',
    tint: '#5C1818',
    description: BLOCKED_DESCRIPTION
  };
  var BLOCKED_STYLES_DARK = {
    label: BLOCKED_LABEL,
    fill: '#3A1515',
    text: '#ffffff',
    seg: '#C05050',
    tint: '#4A1818',
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
    'Bloqu\u00e9': 'T\u00e2che'
  };

  var EISENHOWER_BADGE_LABELS = {
    Faire: '\u00c0 faire maintenant',
    Planifier: '\u00c0 planifier',
    'D\u00e9l\u00e9guer': '\u00c0 d\u00e9l\u00e9guer',
    '\u00c9liminer': '\u00c0 \u00e9liminer'
  };

  // Unicode dots for Trello badge text (largest = highest priority).
  var TIER_BADGE_DOTS = {
    0: '\u2B24', // ⬤ Critique
    1: '\u2B24', // ⬤ Urgent
    2: '\u25CF', // ● Prioritaire
    3: '\u2022', // • Important
    4: '\u00B7', // · Flexible
    5: '\u00B7', // · Secondaire
    6: '\u00B7', // · Optionnel
  };
  var BADGE_DOT_INUTILE = '\u00B7';
  var BADGE_DOT_COMPLETE = '\u2713';

  // Heat-badge dot diameter (px): low score → small, high score → large.
  var HEAT_TIER_DOT_MIN = 5;
  var HEAT_TIER_DOT_MAX = 14;
  var HEAT_TIER_DOT_SCORE_MAX = 10;
  var HEAT_TIER_DOT_SIZES = {
    0: 14, // Critique
    1: 12, // Urgent
    2: 10, // Prioritaire
    3: 9,  // Important
    4: 7,  // Flexible
    5: 6,  // Secondaire
    6: 5   // Optionnel
  };

  function heatTierDotSizePx(display) {
    if (!display) return 9;
    if (display.inutile) return HEAT_TIER_DOT_MIN;
    if (display.blocked) {
      var blockedI = display.tierI;
      if (blockedI != null && Object.prototype.hasOwnProperty.call(HEAT_TIER_DOT_SIZES, blockedI)) {
        return HEAT_TIER_DOT_SIZES[blockedI];
      }
      return 10;
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
    return 9;
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
    if (!display) return '\u25CF';
    if (display.blocked) return BLOCKED_SYMBOL;
    if (display.inutile) return BADGE_DOT_INUTILE;
    var i = display.tierI;
    if (i != null && Object.prototype.hasOwnProperty.call(TIER_BADGE_DOTS, i)) {
      return TIER_BADGE_DOTS[i];
    }
    return '\u25CF';
  }

  function schemeBadgePreviewSamples() {
    return [
      { tierI: 0, label: TASK_BADGE_LABELS.Critique, color: TIER_TRELLO_BADGE_COLORS[0] },
      { tierI: 2, label: TASK_BADGE_LABELS.Prioritaire, color: TIER_TRELLO_BADGE_COLORS[2] },
      { tierI: 6, label: TASK_BADGE_LABELS.Optionnel, color: TIER_TRELLO_BADGE_COLORS[6] }
    ];
  }

  function tierTrelloBadgeColor(display) {
    if (!display || display.inutile) return 'light-gray';
    var i = display.tierI;
    if (i != null && Object.prototype.hasOwnProperty.call(TIER_TRELLO_BADGE_COLORS, i)) {
      return TIER_TRELLO_BADGE_COLORS[i];
    }
    return 'light-gray';
  }

  function blockedTaskBadgeLabel(display) {
    if (!display) return TASK_BADGE_LABELS[BLOCKED_LABEL];
    var tier = classicTierLabel(display);
    var base = TASK_BADGE_LABELS[tier];
    if (!base && tier) {
      if (tier === 'Important') base = 'T\u00e2che importante';
      else base = 'T\u00e2che ' + tier.charAt(0).toLowerCase() + tier.slice(1);
    }
    if (base) return base;
    return TASK_BADGE_LABELS[BLOCKED_LABEL];
  }

  function taskBadgeLabel(display) {
    if (!display) return '';
    if (display.blocked) return blockedTaskBadgeLabel(display);
    if (display.eisenhowerLabel && EISENHOWER_BADGE_LABELS[display.eisenhowerLabel]) {
      return EISENHOWER_BADGE_LABELS[display.eisenhowerLabel];
    }
    var tier = classicTierLabel(display);
    if (TASK_BADGE_LABELS[tier]) return TASK_BADGE_LABELS[tier];
    if (!tier) return '';
    if (tier === 'Important') return 'T\u00e2che importante';
    return 'T\u00e2che ' + tier.charAt(0).toLowerCase() + tier.slice(1);
  }

  function formatBlockedBadgeText(display, reason) {
    var label = blockedTaskBadgeLabel(display);
    var suffix = reason || BLOCKED_LABEL;
    return label + ' (' + suffix + ')';
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
      if (result && result.eisenhower) {
        var eq = result.eisenhower;
        return withBlockedDisplay({
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
    1: { bg: 40, border: 48, panel: 40 }, // Urgent
    2: { bg: 34, border: 44, panel: 28 }, // Prioritaire
    3: { bg: 28, border: 38, panel: 22 }, // Important
    4: { bg: 22, border: 32, panel: 18 }, // Flexible
    5: { bg: 14, border: 26, panel: 14 }, // Secondaire
    6: { bg: 6, border: 20, panel: 8 },   // Optionnel — lightest blue
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
    blabel.textContent = 'Optionnel';

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

    var currentBadgeTierLabel = 'Optionnel';
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
      var visualSource = d.blocked
        ? { blocked: true, label: BLOCKED_LABEL }
        : (d.inutile ? { inutile: true, label: INUTILE_LABEL } : { i: d.tierI, label: d.label });
      var v = tierVisuals(visualSource);
      bnumVal.textContent = formatScore(d.score);
      dot.classList.toggle('is-blocked', !!d.blocked);
      dot.style.setProperty('--heat-tier-dot-size', heatTierDotSizePx(d).toFixed(2) + 'px');
      if (d.blocked) {
        dot.style.removeProperty('background');
      } else {
        dot.style.background = v.seg;
      }
      currentBadgeTierLabel = d.eisenhowerLabel || classicTierLabel(d);
      badge.style.setProperty('--heat-fill', v.fill);
      badge.style.setProperty('--heat-text', v.text);
      panel.style.setProperty('--heat-text', v.text);
      badge.style.removeProperty('background');
      bnum.style.removeProperty('color');
      blabel.style.removeProperty('color');
      badge.classList.toggle('is-inutile', !!d.inutile);
      badge.classList.toggle('is-blocked', !!d.blocked);
      panel.classList.toggle('is-inutile', !!d.inutile);
      panel.classList.toggle('is-blocked', !!d.blocked);
      panel.classList.toggle('has-blocked-warning', !!d.blocked);
      blockedWarning.hidden = !d.blocked;
      paintTierDescription(tierDesc, d);
      segs.forEach(function (s) {
        s.classList.toggle('on', !d.inutile && d.tierI != null && +s.dataset.i === d.tierI);
      });
      updateScoreTooltip(result, d);
      badgeLabelResponsive.refresh();
      segLabelResponsive.refresh();
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
    var SVG_W = 300;
    var SVG_H = 248;
    var MARGIN = { top: 14, right: 14, bottom: 36, left: 38 };
    var PLOT_W = SVG_W - MARGIN.left - MARGIN.right;
    var PLOT_H = SVG_H - MARGIN.top - MARGIN.bottom;
    var CONTOUR_RES = 40;
    var TIER_THRESHOLDS = [1.4, 2.9, 4.3, 5.8, 7.2, 8.6];
    var MARKER_CORE_R = 8;
    var MARKER_STROKE_W = 3;
    var MARKER_SHADOW_R = 9;
    var MARKER_HIT_R = 20;

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

    var panel = document.createElement('div');
    panel.className = 'calc-graph-panel';

    var body = document.createElement('div');
    body.className = 'calc-graph-body';

    var graphSection = document.createElement('div');
    graphSection.className = 'calc-graph-section calc-rsm-section';

    var graphHeading = document.createElement('div');
    graphHeading.className = 'calc-graph-heading';
    graphHeading.textContent = 'Score composite';
    graphSection.appendChild(graphHeading);

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
          data[px + 3] = Math.round(SCORE_SURFACE_ALPHA * 255);
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
        ', facilité ' + formatEase(F) + '/5' +
        ' — score ' + formatScore(d.score) + ', palier ' + d.label;
    }

    return {
      el: panel,
      paint: paint,
      updateTheme: updateChartTheme
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
    var heat;
    var calcGraph;
    var formulaSwitcher;
    var sliderAnimFrame = null;

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
        var cardTier = display.cardTier;
        if (display.blocked) {
          cardTier = Object.assign({}, cardTier, { blocked: true });
        }
        applyCardTierTint(card, cardTier);
        card.classList.toggle('is-inutile', !!display.inutile);
        card.classList.toggle('is-blocked', !!display.blocked);
        card.dataset.tier = display.label;
        heat.paint(result, display);
        if (calcGraph) calcGraph.paint(result, state, display);
      } catch (err) {
        console.error('PriorityUI.mountVariant repaint failed', { id: variantId, error: err });
      }
    }

    function unblockTask() {
      if (enAttenteField) {
        enAttenteField.setValue(false);
        enAttenteField.setBlockedReason('');
      }
      state.enAttente = false;
      state.blockedReason = '';
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

    heat = createHeatPanel({
      el: card,
      formulaKey: formulaKey,
      hideSegments: formulaKey === 'eisenhower',
      onUnblock: unblockTask,
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

    applyFormulaMode(formulaKey);
    repaint();

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
    createHeatPanel: createHeatPanel,
    createCalcGraphPanel: createCalcGraphPanel,
    createFormulaSwitcher: createFormulaSwitcher,
    mountVariant: mountVariant,
    tierFor: tierFor,
    isInutile: isInutile,
    isEnAttente: isEnAttente,
    resolveDisplay: resolveDisplay,
    classicTierLabel: classicTierLabel,
    taskBadgeLabel: taskBadgeLabel,
    blockedTaskBadgeLabel: blockedTaskBadgeLabel,
    tierTrelloBadgeColor: tierTrelloBadgeColor,
    schemeBadgePreviewSamples: schemeBadgePreviewSamples,
    rebuildTrelloBadgeColors: rebuildTrelloBadgeColors,
    tierBadgeDotChar: tierBadgeDotChar,
    heatTierDotSizePx: heatTierDotSizePx,
    HEAT_TIER_DOT_SIZES: HEAT_TIER_DOT_SIZES,
    TIER_TRELLO_BADGE_COLORS: TIER_TRELLO_BADGE_COLORS,
    TIER_BADGE_DOTS: TIER_BADGE_DOTS,
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
