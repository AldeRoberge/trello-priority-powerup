(function (global) {
  'use strict';

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

  var LABELS = {
    time: {
      emoji: ['💤', '📅', '⏳', '🚨', '🔥'],
      short: ['Aucune échéance', 'Flexible', 'Cette semaine', 'Sous 48 h', 'Maintenant'],
      detail: [
        'Pas de date limite dans le calendrier. Personne n\'attend, le délai n\'est pas contraint et le risque de retard est nul.',
        'Peut attendre quelques semaines sans conséquence. L\'échéance reste souple et le calendrier de l\'équipe n\'est pas affecté.',
        'À traiter d\'ici la fin de la semaine. L\'échéance est proche et le délai devient une contrainte réelle dans le planning.',
        'Échéance sous 48 h. Le délai est très court, une action rapide est requise pour éviter un retard visible.',
        'En retard ou bloque le travail en cours. La pression du calendrier est maximale et chaque heure compte.'
      ],
      popup: {
        subtitle: 'Quand faut-il le faire?',
        intro: 'L\'échéance fixe le cadre temporel d\'une tâche : la date limite, le délai acceptable, sa place dans le calendrier et le risque de retard si elle glisse.',
        guidance: 'Regardez la date butoir réelle, le délai que l\'équipe peut tolérer et ce qui se passe si la tâche n\'est pas traitée à temps.'
      }
    },
    blocking: {
      emoji: ['❌', '🔗', '⚠️', '🧱'],
      short: ['Rien', 'Mineur', 'Bloque une tâche', 'Bloque l\'équipe'],
      detail: [
        'Rien ne dépend de cette tâche. Aucune dépendance directe et le travail de l\'équipe avance sans ralentissement.',
        'Quelqu\'un attend, mais peut continuer autrement. Le blocage est léger et les dépendances restent contournables.',
        'Bloque une tâche ou un collègue. Une dépendance directe empêche l\'avancement d\'un travail en cours.',
        'Bloque le travail de l\'équipe ou une livraison. Les dépendances sont multiples et l\'ensemble du flux ralentit.'
      ],
      popup: {
        subtitle: 'Est-ce que quelque chose cesse de fonctionner si ce n\'est pas fait?',
        intro: 'Le blocage mesure dans quelle mesure le travail de l\'équipe ralentit ou s\'arrête tant que la tâche n\'est pas faite — les dépendances directes, les collègues en attente et les livraisons retenues.',
        guidance: 'Demandez-vous qui est bloqué, quelles tâches en dépendent et si l\'équipe peut avancer autrement en attendant.'
      }
    },
    impact: {
      emoji: ['❌', '🙂', '👍', '⭐', '🚀'],
      short: ['Aucun', 'Faible', 'Utile', 'Important', 'Impact majeur'],
      detail: [
        'Peu ou pas de bénéfice visible. L\'effort ne crée quasi aucune valeur, portée ni opportunité pour l\'équipe.',
        'Gain marginal avec peu de visibilité. Petite amélioration qui ne change que marginalement la valeur ou la portée des résultats.',
        'Amélioration nette pour l\'équipe ou le produit. Valeur concrète, bénéfices perceptibles et quelques opportunités débloquées.',
        'Objectif clé ou livrable majeur. Forte valeur, impact visible et portée significative sur les priorités en cours.',
        'Valeur exceptionnelle et large portée. Débloque de nombreuses tâches ou personnes ; opportunité stratégique que l\'équipe ressent immédiatement.'
      ],
      popup: {
        subtitle: 'Pourquoi vaut-il la peine de le faire?',
        intro: 'L\'impact mesure la valeur, l\'importance et la portée d\'une tâche — les bénéfices concrets qu\'elle apporte, sa visibilité, les opportunités qu\'elle ouvre et le nombre de personnes ou de tâches qu\'elle débloque.',
        guidance: 'Demandez-vous si le résultat sera visible, utile à l\'équipe ou au produit, et si d\'autres travaux en dépendent.'
      },
      affirmations: [
        'Aucun gain visible. L\'effort ne vaut presque rien.',
        'Gain marginal. Petite amélioration, peu visible.',
        'Utile. Amélioration nette pour l\'équipe ou le produit.',
        'Important. Objectif clé, livrable visible.',
        'Impact majeur. Forte valeur, large portée. D\'autres tâches en dépendent.'
      ]
    },
    ease: {
      emoji: ['', '🏗', '🔧', '🧠', '👍', '⚡'],
      short: ['', 'Très élevé', 'Élevé', 'Modéré', 'Faible', 'Minimal'],
      detail: [
        '',
        'Projet lourd avec complexité élevée. Coordonner demande beaucoup de ressources et de temps ; faible confiance, faible réversibilité.',
        'Effort conséquent avec plusieurs dépendances. Coût et difficulté notables, risque modéré à l\'exécution.',
        'Complexité maîtrisée, exécution standard. Temps et ressources raisonnables, difficulté absorbable par l\'équipe.',
        'Peu de friction, rapide à réaliser. Faible coût, bonne confiance dans l\'exécution, facilement réversible.',
        'Quasi immédiat. Très peu de ressources, complexité minimale, risque faible et annulation aisée.'
      ],
      popup: {
        subtitle: 'À quel point est-ce difficile?',
        intro: 'La facilité d\'exécution reflète le temps, la complexité, le coût, l\'incertitude et le niveau de confiance dont vous disposez. Une tâche simple demande peu de ressources, s\'exécute vite et reste facilement réversible ; une tâche difficile exige plus de coordination, multiplie les risques et coûte cher à corriger.',
        guidance: 'Estimez le temps nécessaire, la difficulté technique, les ressources mobilisées et la facilité à revenir en arrière si besoin.'
      },
      affirmations: [
        '',
        'Très élevé. Projet lourd, coordination intense, risque important.',
        'Élevé. Travail conséquent, dépendances multiples.',
        'Modéré. Complexité maîtrisée, exécution standard.',
        'Faible. Rapide à faire, peu de friction.',
        'Minimal. Quasi immédiat, faible risque, facile à annuler.'
      ]
    },
    urgency: {
      emoji: ['💤', '📅', '⏳', '🚨', '🔥'],
      short: ['Calme', 'Bientôt', 'Cette semaine', 'Urgent', 'Critique'],
      detail: [
        'Aucune échéance ni attente pressante. Repousser n\'entraîne ni blocage ni dépendance critique.',
        'Échéance souple dans un délai confortable. Peu de pression temporelle, aucun blocage immédiat.',
        'Délai proche ou quelques tâches en dépendent. La pression monte et les dépendances commencent à se faire sentir.',
        'Échéance imminente ou blocage notable. L\'équipe ralentit ; le risque de repousser devient significatif.',
        'À faire maintenant. En retard ou bloque l\'ensemble du travail ; forte pression temporelle, dépendances multiples.'
      ],
      popup: {
        subtitle: 'Quand faut-il le faire?',
        intro: 'L\'urgence capture la pression temporelle et les conséquences d\'attendre : l\'échéance, le délai acceptable, les blocages provoqués et les dépendances qui s\'accumulent si la tâche est repoussée.',
        guidance: 'Regardez le délai réel, ce qui bloque si vous attendez et les conséquences concrètes d\'un report.'
      },
      affirmations: [
        'Aucune pression. Pas d\'échéance, personne n\'attend.',
        'Peut attendre. Échéance souple, rien ne bloque.',
        'Cette semaine. Délai proche ou quelques tâches en dépendent.',
        'Sous 48 h ou blocage notable. L\'équipe ralentit si on attend.',
        'Maintenant. En retard ou tout le travail de l\'équipe en dépend.'
      ]
    }
  };

  var KEYWORDS = {
    time: 'Cadre temporel : échéance, délai, calendrier et risque de retard.',
    blocking: 'Effet sur l\'équipe : blocages, dépendances et ralentissement du travail.',
    impact: 'Valeur apportée : importance, portée, bénéfices, visibilité et opportunités débloquées.',
    ease: 'Coût d\'exécution : temps, complexité, ressources, difficulté, confiance et réversibilité.',
    urgency: 'Pression temporelle : échéance, délai, blocages, dépendances et risque si repoussé.'
  };

  var QUESTIONS = {
    time: 'Quand faut-il le faire?',
    blocking: 'Est-ce que quelque chose cesse de fonctionner si ce n\'est pas fait?',
    impact: 'Pourquoi vaut-il la peine de le faire?',
    ease: 'À quel point est-ce difficile?',
    urgency: 'Quand faut-il le faire?'
  };

  var TIERS = [
    {
      min: 8.6, label: 'Critique', fill: '#FCEBEB', text: '#791F1F', seg: '#E24B4A', i: 0,
      description: 'Tâche à réaliser immédiatement. Impact direct sur l\'objectif, impossible de délayer sans conséquences majeures.'
    },
    {
      min: 7.2, label: 'Urgent', fill: '#FAECE7', text: '#712B13', seg: '#D85A30', i: 1,
      description: 'Tâche pressante, priorité absolue. Action rapide sous forte contrainte de temps.'
    },
    {
      min: 5.8, label: 'Prioritaire', fill: '#FAEEDA', text: '#633806', seg: '#BA7517', i: 2,
      description: 'Attention prioritaire. Délai court, à traiter rapidement dans la file.'
    },
    {
      min: 4.3, label: 'Important', fill: '#E8F5E0', text: '#2D5A1E', seg: '#6EAD3A', i: 3,
      description: 'Planifiée au planning. À exécuter prochainement avec engagement clair.'
    },
    {
      min: 2.9, label: 'Flexible', fill: '#E1F5EE', text: '#085041', seg: '#3BA99C', i: 4,
      description: 'Sans échéance fixe. À traiter selon l\'opportunité, peut glisser.'
    },
    {
      min: 1.4, label: 'Secondaire', fill: '#E6F1FB', text: '#0C447C', seg: '#5A9FD4', i: 5,
      description: 'Utile mais non essentielle. À envisager plus tard selon la disponibilité.'
    },
    {
      min: 0, label: 'Optionnel', fill: '#F1EFE8', text: '#444441', seg: '#9B9890', i: 6,
      description: 'Facultative, sans conséquence si ignorée. Peut être écartée de la file.'
    }
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
  var INUTILE_EPS = 0.05;
  var INUTILE_LABEL = 'Inutile';
  var INUTILE_STYLES = {
    label: INUTILE_LABEL,
    fill: '#F1EFE8',
    text: '#9B9890',
    seg: '#9B9890',
    description: 'Sans valeur ni urgence. Trop complexe ou impossible à réaliser.'
  };

  function isInutile(inputs) {
    var U = inputs.urgency != null ? inputs.urgency : 0;
    var I = inputs.impact != null ? inputs.impact : 0;
    var F = inputs.ease != null ? inputs.ease : 5;
    return U < INUTILE_EPS && I < INUTILE_EPS && F <= 1 + INUTILE_EPS;
  }

  function resolveDisplay(result, inputs) {
    if (!isInutile(inputs)) {
      return {
        inutile: false,
        score: result.score,
        label: result.tier.label,
        fill: result.tier.fill,
        text: result.tier.text,
        seg: result.tier.seg,
        tierI: result.tier.i,
        cardTier: result.tier
      };
    }
    return {
      inutile: true,
      score: 0,
      label: INUTILE_LABEL,
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
    };
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
    1: { bg: 40, border: 48, panel: 40 }, // Urgent — red
    2: { bg: 34, border: 44, panel: 28 }, // Prioritaire — amber
    3: { bg: 28, border: 38, panel: 22 }, // Important — green
    4: { bg: 22, border: 32, panel: 18 }, // Flexible — teal
    5: { bg: 14, border: 26, panel: 14 }, // Secondaire — blue
    6: { bg: 6, border: 20, panel: 8 },   // Optionnel — near neutral
    inutile: { bg: 8, border: 22, panel: 82 } // Inutile — muted gray matching badge
  };

  function applyCardTierTint(cardEl, tier) {
    var mixKey = tier.inutile ? 'inutile' : tier.i;
    var mix = TIER_SURFACE_MIX[mixKey] || TIER_SURFACE_MIX[6];
    cardEl.style.setProperty('--card-tier-tint', tier.fill);
    cardEl.style.setProperty('--card-tier-border', tier.seg);
    cardEl.style.setProperty('--card-tier-tint-mix', mix.bg + '%');
    cardEl.style.setProperty('--card-tier-border-mix', mix.border + '%');
    cardEl.style.setProperty('--card-panel-tint-mix', mix.panel + '%');
    cardEl.dataset.tier = tier.label;

    var panel = cardEl.querySelector('.heat-panel');
    if (panel) {
      panel.style.setProperty('--card-tier-tint', tier.fill);
      panel.style.setProperty('--card-panel-tint-mix', mix.panel + '%');
    }
  }

  function labelEntry(key, value) {
    var entry = LABELS[key];
    if (!entry) return { short: String(value), detail: '' };
    var idx = key === 'ease' ? value : value;
    return {
      emoji: entry.emoji[idx] || '',
      short: entry.short[idx] || String(value),
      detail: entry.detail[idx] || ''
    };
  }

  function wordFor(key, value) {
    var e = labelEntry(key, value);
    if (!e.short) return String(value);
    return e.emoji ? e.emoji + ' ' + e.short : e.short;
  }

  function affirmationFor(key, value) {
    var entry = LABELS[key];
    if (!entry || !entry.affirmations) return '';
    return entry.affirmations[value] || '';
  }

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
      'Coût du retard ÷ taille → ' + terms.pressure.toFixed(1) + ' ÷ ' + terms.jobSize.toFixed(0) +
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

  function heatPresetForTarget(targetP) {
    for (var k = 0; k < HEAT_SEGMENTS.length; k++) {
      var seg = HEAT_SEGMENTS[k];
      if (Math.abs(seg.target - targetP) < 0.05 && seg.preset) {
        return seg.preset;
      }
    }
    return null;
  }

  function overrideBaseline(targetP, inputs) {
    var preset = heatPresetForTarget(targetP);
    if (preset) {
      return { urgency: preset.urgency, impact: preset.impact, ease: preset.ease };
    }

    var curU = inputs.urgency;
    var curI = inputs.impact;
    var curF = inputs.ease;
    var best = null;
    for (var u = 0; u <= 4; u++) {
      for (var i = 0; i <= 4; i++) {
        for (var f = 1; f <= 5; f++) {
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

  var modalRoot = null;
  var modalContext = null;

  function ensureModalRoot() {
    if (modalRoot) return modalRoot;
    modalRoot = document.createElement('div');
    modalRoot.className = 'help-modal-root';
    modalRoot.innerHTML =
      '<div class="help-modal-backdrop" data-close></div>' +
      '<div class="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-modal-title">' +
        '<button type="button" class="help-modal-close" aria-label="Fermer">&times;</button>' +
        '<h3 class="help-modal-title" id="help-modal-title"></h3>' +
        '<blockquote class="help-modal-quote" hidden></blockquote>' +
        '<div class="help-modal-body"></div>' +
        '<ol class="help-modal-levels"></ol>' +
      '</div>';
    document.body.appendChild(modalRoot);

    modalRoot.querySelector('.help-modal-backdrop').addEventListener('click', closeHelpModal);
    modalRoot.querySelector('.help-modal-close').addEventListener('click', closeHelpModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalRoot.classList.contains('open')) closeHelpModal();
    });
    return modalRoot;
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
      currentEl.scrollIntoView({ block: 'nearest' });
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

    root.querySelector('.help-modal-title').textContent = title;

    var popup = entry.popup || {};
    var quoteEl = root.querySelector('.help-modal-quote');
    var body = root.querySelector('.help-modal-body');
    var list = root.querySelector('ol.help-modal-levels');

    var quote = popup.subtitle || QUESTIONS[wordsKey] || '';
    quoteEl.textContent = quote;
    quoteEl.hidden = !quote;

    body.innerHTML = '';
    [popup.intro, popup.guidance].forEach(function (text) {
      if (!text) return;
      var p = document.createElement('p');
      p.textContent = text;
      body.appendChild(p);
    });
    body.hidden = body.childNodes.length === 0;

    list.innerHTML = '';
    var start = wordsKey === 'ease' ? 1 : 0;
    var end = entry.short.length - 1;
    var selectable = typeof modalContext.onSelect === 'function';
    for (var i = start; i <= end; i++) {
      if (!entry.detail[i]) continue;
      var li = document.createElement('li');
      li.dataset.level = String(i);
      li.innerHTML =
        '<span class="help-modal-level-label">' + entry.short[i] + '</span>' +
        '<span class="help-modal-level-text">' + entry.detail[i] + '</span>';
      if (selectable) {
        li.className = 'is-selectable';
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        li.setAttribute('aria-label', entry.short[i]);
        (function (level) {
          function selectLevel() {
            modalContext.currentValue = level;
            modalContext.onSelect(level);
            paintHelpModalLevels();
          }
          li.addEventListener('click', selectLevel);
          li.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectLevel();
            }
          });
        })(i);
      }
      list.appendChild(li);
    }
    list.hidden = list.childNodes.length === 0;
    paintHelpModalLevels();

    root.classList.add('open');
    root.querySelector('.help-modal-close').focus();
  }

  function closeHelpModal() {
    if (modalRoot) modalRoot.classList.remove('open');
    modalContext = null;
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

    var head = document.createElement('div');
    head.className = 'field-head';

    var headStart = document.createElement('button');
    headStart.type = 'button';
    headStart.className = 'field-head-start';
    headStart.setAttribute('aria-label', 'Informations sur ' + label);
    if (KEYWORDS[wordsKey]) {
      headStart.title = KEYWORDS[wordsKey];
    }

    var lbl = document.createElement('span');
    lbl.className = 'field-lbl';
    lbl.innerHTML = '<i class="ti ' + icon + '"></i> ' + label;

    function openFieldHelp() {
      openHelpModal(wordsKey, label, {
        min: min,
        max: max,
        currentValue: getValue(),
        onSelect: function (level) {
          setValue(level);
          onChange(level);
        }
      });
    }

    headStart.addEventListener('click', openFieldHelp);
    headStart.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFieldHelp();
      }
    });

    headStart.appendChild(lbl);

    var val = document.createElement('span');
    val.className = 'field-val';
    val.title = wordFor(wordsKey, snappedLevel(value, min, max));

    head.appendChild(headStart);
    head.appendChild(val);
    field.appendChild(head);

    var affirmEl = null;
    if (LABELS[wordsKey] && LABELS[wordsKey].affirmations) {
      affirmEl = document.createElement('p');
      affirmEl.className = 'field-question';
      field.appendChild(affirmEl);
    }

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
    inputEl.addEventListener('input', function () {
      var v = +inputEl.value;
      updateDisplay(v);
      onChange(v);
    });

    sliderWrap.appendChild(inputEl);
    field.appendChild(sliderWrap);

    el.appendChild(field);

    function updateDisplay(v) {
      v = clamp(v, min, max);
      var idx = snappedLevel(v, min, max);
      var text = wordFor(wordsKey, idx);
      val.textContent = text;
      val.title = text;
      inputEl.value = String(v);
      if (affirmEl && LABELS[wordsKey] && LABELS[wordsKey].affirmations) {
        affirmEl.textContent = affirmationFor(wordsKey, idx);
      }
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

  function createHeatPanel(config) {
    var el = config.el;
    var onSegmentClick = config.onSegmentClick || function () {};

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
    var blabel = document.createElement('div');
    blabel.className = 'heat-badge-label';
    blabel.textContent = 'Optionnel';
    badge.appendChild(bnum);
    badge.appendChild(blabel);

    var tierDesc = document.createElement('p');
    tierDesc.className = 'heat-tier-desc';
    tierDesc.hidden = true;
    badge.appendChild(tierDesc);

    panel.appendChild(badge);

    var top = document.createElement('div');
    top.className = 'heat-top';
    var topLabel = document.createElement('span');
    topLabel.className = 'heat-top-label';
    topLabel.textContent = 'Priorité d\'exécution';
    top.appendChild(topLabel);
    panel.appendChild(top);

    var segsWrap = document.createElement('div');
    segsWrap.className = 'heat-segs';
    var segs = [];

    HEAT_SEGMENTS.forEach(function (seg) {
      var s = document.createElement('div');
      s.className = 'heat-seg';
      s.dataset.i = String(seg.i);
      s.dataset.target = String(seg.target);
      s.style.setProperty('--c', seg.color);
      s.setAttribute('role', 'button');
      s.setAttribute('tabindex', '0');
      s.setAttribute('aria-label', seg.label);
      if (seg.description) s.title = seg.label + ' — ' + seg.description;
      s.addEventListener('click', function () {
        onSegmentClick(+s.dataset.target);
      });
      s.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSegmentClick(+s.dataset.target);
        }
      });
      segsWrap.appendChild(s);
      segs.push(s);
    });
    panel.appendChild(segsWrap);

    var segLabels = document.createElement('div');
    segLabels.className = 'heat-seg-labels';
    segLabels.innerHTML = HEAT_SEGMENTS.map(function (s) {
      return '<span>' + s.label + '</span>';
    }).join('');
    panel.appendChild(segLabels);

    el.appendChild(panel);

    function tierDescription(display) {
      if (display.inutile) return INUTILE_STYLES.description || '';
      if (display.tierI == null) return '';
      for (var k = 0; k < TIERS.length; k++) {
        if (TIERS[k].i === display.tierI) return TIERS[k].description || '';
      }
      return '';
    }

    function paint(result, display) {
      var d = display || resolveDisplay(result, {});
      bnumVal.textContent = formatScore(d.score);
      dot.style.background = d.seg;
      blabel.textContent = d.label;
      badge.style.background = d.fill;
      bnum.style.color = d.text;
      blabel.style.color = d.text;
      badge.classList.toggle('is-inutile', d.inutile);
      panel.classList.toggle('is-inutile', d.inutile);
      var desc = tierDescription(d);
      tierDesc.textContent = desc;
      tierDesc.hidden = !desc;
      tierDesc.style.color = desc ? d.text : '';
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
    var MARKER_CORE_R = 7;
    var MARKER_STROKE_W = 2;
    var MARKER_GLOW_R = 12;
    var MARKER_SHADOW_R = 8.5;
    var MARKER_HIT_R = 18;

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

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'calc-graph-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML =
      '<span class="calc-graph-toggle-label">Graphique</span>' +
      '<span class="calc-graph-chevron" aria-hidden="true"></span>';

    var body = document.createElement('div');
    body.className = 'calc-graph-body';
    body.hidden = true;

    var graphSection = document.createElement('div');
    graphSection.className = 'calc-graph-section calc-rsm-section';

    var rsmWrap = document.createElement('div');
    rsmWrap.className = 'calc-rsm-wrap';
    rsmWrap.setAttribute('role', 'img');
    rsmWrap.setAttribute('aria-label', 'Graphique de priorité — urgence et impact');

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
    glassGrad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#FFFFFF', 'stop-opacity': '0.55' }));
    glassGrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#EFEDE8', 'stop-opacity': '0.25' }));
    defs.appendChild(glassGrad);

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

    var markerG = svgEl('g', { class: 'calc-rsm-marker', 'clip-path': 'url(#calc-rsm-plot-clip)' });
    var crossH = lineEl(0, 0, 0, 0, 'calc-rsm-crosshair calc-rsm-crosshair-h');
    var crossV = lineEl(0, 0, 0, 0, 'calc-rsm-crosshair calc-rsm-crosshair-v');
    var markerShadow = svgEl('circle', { class: 'calc-rsm-marker-shadow' });
    var markerGlow = svgEl('circle', { class: 'calc-rsm-marker-glow' });
    var markerCore = svgEl('circle', { class: 'calc-rsm-marker-core' });
    var markerHit = svgEl('circle', { class: 'calc-rsm-marker-hit' });
    markerG.appendChild(crossH);
    markerG.appendChild(crossV);
    markerG.appendChild(markerShadow);
    markerG.appendChild(markerGlow);
    markerG.appendChild(markerCore);
    markerG.appendChild(markerHit);
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

    panel.appendChild(toggle);
    panel.appendChild(body);
    el.appendChild(panel);

    var surfaceCtx = surfaceCanvas.getContext('2d', { alpha: true });

    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      body.hidden = open;
      panel.classList.toggle('open', !open);
      if (!open && lastScene.result) {
        requestAnimationFrame(function () {
          paint(lastScene.result, {
            urgency: lastScene.U,
            impact: lastScene.I,
            ease: lastScene.F
          }, lastScene.display);
        });
      }
    });

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

      markerGlow.setAttribute('cx', String(cx));
      markerGlow.setAttribute('cy', String(cy));
      markerGlow.setAttribute('r', String(MARKER_GLOW_R));
      markerGlow.setAttribute('fill', d.seg);

      markerCore.setAttribute('cx', String(cx));
      markerCore.setAttribute('cy', String(cy));
      markerCore.setAttribute('r', String(MARKER_CORE_R));
      markerCore.setAttribute('fill', '#FFFFFF');
      markerCore.setAttribute('stroke', d.seg);
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

    easeSlider.addEventListener('input', function () {
      applyEase(+easeSlider.value);
    });

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
      paint: paint
    };
  }

  function mountVariant(containerEl, variantConfig) {
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
    var heat;
    var calcGraph;
    var showCalcGraph = formulaKey === 'baseline';
    var sliderAnimFrame = null;

    variantConfig.dimensions.forEach(function (dim) {
      state[dim.key] = defaults[dim.key] != null ? defaults[dim.key] : dim.value;
    });

    function syncStateFromFields() {
      Object.keys(fields).forEach(function (key) {
        state[key] = fields[key].getValue();
      });
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
        return;
      }

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
            state[key] = targets[key];
            if (fields[key]) fields[key].setValue(targets[key]);
          });
          repaint();
        }
      }
      sliderAnimFrame = requestAnimationFrame(step);
    }

    function repaint() {
      syncStateFromFields();
      var result = calcFn(state);
      var display = resolveDisplay(result, state);
      applyCardTierTint(card, display.cardTier);
      card.classList.toggle('is-inutile', display.inutile);
      card.dataset.tier = display.label;
      heat.paint(result, display);
      if (calcGraph) calcGraph.paint(result, state, display);
    }

    heat = createHeatPanel({
      el: card,
      onSegmentClick: function (targetP) {
        syncStateFromFields();
        animateFieldsTo(overrideFn(targetP, state));
      }
    });

    var fieldsCollapse = document.createElement('details');
    fieldsCollapse.className = 'variant-fields-collapse';
    fieldsCollapse.open = true;

    var fieldsSummary = document.createElement('summary');
    fieldsSummary.className = 'variant-fields-toggle';
    fieldsSummary.innerHTML =
      '<span class="variant-fields-toggle-label">Critères</span>' +
      '<span class="variant-fields-chevron" aria-hidden="true"></span>';

    var fieldsWrap = document.createElement('div');
    fieldsWrap.className = 'variant-fields';

    fieldsCollapse.appendChild(fieldsSummary);
    fieldsCollapse.appendChild(fieldsWrap);
    card.appendChild(fieldsCollapse);

    variantConfig.dimensions.forEach(function (dim) {
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
        }
      });
    });

    if (showCalcGraph) {
      calcGraph = createCalcGraphPanel({
        el: fieldsCollapse,
        fields: fields,
        onChange: function () {
          cancelSliderAnim();
          repaint();
        }
      });
    }

    containerEl.appendChild(card);
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
        repaint();
      },
      repaint: repaint
    };
  }

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
    createField: createField,
    createHeatPanel: createHeatPanel,
    createCalcGraphPanel: createCalcGraphPanel,
    mountVariant: mountVariant,
    tierFor: tierFor,
    isInutile: isInutile,
    resolveDisplay: resolveDisplay,
    INUTILE_EPS: INUTILE_EPS,
    INUTILE_LABEL: INUTILE_LABEL,
    INUTILE_STYLES: INUTILE_STYLES,
    wordFor: wordFor,
    affirmationFor: affirmationFor
  };

  global.PriorityUI = PriorityUI;
})(typeof window !== 'undefined' ? window : this);
