/**
 * priority-ui: part 2 of 12 (markdown).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var DEFAULT_COLOR_SCHEME_KEY = S.DEFAULT_COLOR_SCHEME_KEY;

  // from other parts (functions, resolved at call time)
  function isCustomTaskTypeId() { return S.isCustomTaskTypeId.apply(this, arguments); }
  function priorityRelativeLuminance() { return S.priorityRelativeLuminance.apply(this, arguments); }
  function taskTypeIconKey() { return S.taskTypeIconKey.apply(this, arguments); }

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
      icon: [
        'impact-0', 'impact-0', 'impact-1', 'impact-1', 'impact-2',
        'impact-2', 'impact-3', 'impact-3', 'impact-4', 'impact-4', 'impact-4'
      ],
      short: [
        'Nul', 'Minimal', 'Faible', 'L\u00e9ger', 'Mod\u00e9r\u00e9',
        'Notable', '\u00c9lev\u00e9', 'Fort', 'Tr\u00e8s fort', 'Majeur', 'Critique'
      ],
      detail: [
        'Aucun enjeu perceptible.',
        'Enjeu minime, effet tr\u00e8s local.',
        'Faible valeur relative.',
        'L\u00e9ger gain ou am\u00e9lioration.',
        'Enjeu mod\u00e9r\u00e9 pour l\'\u00e9quipe ou le projet.',
        'Valeur claire, m\u00e9rite une place dans le backlog.',
        'Enjeu \u00e9lev\u00e9 : effet notable sur les objectifs.',
        'Fort levier de valeur.',
        'Tr\u00e8s fort impact sur le r\u00e9sultat attendu.',
        'Enjeu majeur pour l\'organisation.',
        'Impact critique : cons\u00e9quences majeures si ignor\u00e9.'
      ],
      popup: {
        subtitle: 'Combien cette t\u00e2che compte-t-elle\u00a0?',
        intro: 'L\'impact mesure \u00e0 quel point la t\u00e2che compte\u00a0: valeur, port\u00e9e et levier. Vous pouvez le r\u00e9gler directement ou le d\u00e9duire des facteurs \u00ab\u00a0Nous permet de\u2026\u00a0\u00bb.',
        guidance: 'Pensez \u00e0 la valeur livr\u00e9e, pas seulement \u00e0 qui est touch\u00e9.'
      },
      affirmations: [
        'Nul. Aucun enjeu perceptible.',
        'Minimal. Effet tr\u00e8s local.',
        'Faible. Peu de valeur relative.',
        'L\u00e9ger. Petit gain.',
        'Mod\u00e9r\u00e9. Enjeu moyen.',
        'Notable. Valeur claire.',
        '\u00c9lev\u00e9. Effet notable sur les objectifs.',
        'Fort. Fort levier de valeur.',
        'Tr\u00e8s fort. Gros effet sur le r\u00e9sultat.',
        'Majeur. Enjeu organisationnel.',
        'Critique. Cons\u00e9quences majeures si ignor\u00e9.'
      ]
    },
    ease: {
      icon: [
        'ease-1', 'ease-1', 'ease-2', 'ease-2', 'ease-3',
        'ease-3', 'ease-4', 'ease-4', 'ease-5', 'ease-5', 'ease-5'
      ],
      short: [
        'Tr\u00e8s difficile', 'Tr\u00e8s difficile', 'Difficile', 'Difficile', 'Assez difficile',
        'Moyen', 'Assez facile', 'Facile', 'Facile', 'Tr\u00e8s facile', 'Super facile'
      ],
      detail: [
        'Projet lourd, coordination intense, risque \u00e9lev\u00e9.',
        'Tr\u00e8s exigeant en ressources et attention.',
        'Effort cons\u00e9quent, plusieurs d\u00e9pendances.',
        'Difficile, co\u00fbt et friction notables.',
        'Assez difficile, demande de la rigueur.',
        'Complexit\u00e9 ma\u00eetris\u00e9e, ex\u00e9cution standard.',
        'Assez facile, friction limit\u00e9e.',
        'Facile, rapide \u00e0 r\u00e9aliser.',
        'Peu de friction, bonne confiance.',
        'Tr\u00e8s facile, quasi sans obstacle.',
        'Super facile. Quasi sans effort.'
      ],
      popup: {
        subtitle: '\u00c0 quel point est-il facile de faire cette t\u00e2che\u00a0?',
        intro: 'La facilit\u00e9 refl\u00e8te le co\u00fbt d\'ex\u00e9cution (temps, gens, argent, charge mentale). R\u00e9glez le curseur ou d\u00e9duisez-le via \u00ab\u00a0Ce que \u00e7a co\u00fbte\u2026\u00a0\u00bb.',
        guidance: 'Estimez le co\u00fbt global\u00a0: plus c\'est co\u00fbteux, plus la facilit\u00e9 est basse.'
      },
      affirmations: [
        'Tr\u00e8s difficile. Projet lourd, risque important.',
        'Tr\u00e8s difficile. Ressources et attention maximales.',
        'Difficile. Effort cons\u00e9quent.',
        'Difficile. Friction et co\u00fbt notables.',
        'Assez difficile. Demande de la rigueur.',
        'Moyen. Complexit\u00e9 ma\u00eetris\u00e9e.',
        'Assez facile. Friction limit\u00e9e.',
        'Facile. Rapide \u00e0 faire.',
        'Facile. Peu de friction.',
        'Tr\u00e8s facile. Quasi sans obstacle.',
        'Super facile. Tr\u00e8s peu d\'effort.'
      ]
    },
    empressement: {
      icon: ['urgency-0', 'urgency-1', 'urgency-2', 'urgency-3', 'urgency-4'],
      short: ['Aucun', 'Bient\u00f4t', 'Assez vite', 'Vite', 'Au plus vite'],
      detail: [
        'Aucun empressement particulier. La t\u00e2che peut attendre sans frustration.',
        'On aimerait s\'en d\u00e9barrasser bient\u00f4t, sans date impos\u00e9e.',
        'Envie claire de avancer assez vite.',
        'Forte volont\u00e9 de cl\u00f4turer rapidement.',
        'Priorit\u00e9 personnelle maximale\u00a0: au plus vite.'
      ],
      popup: {
        subtitle: 'Quelle est votre envie de terminer cette t\u00e2che\u00a0?',
        intro: 'L\'empressement est l\'\u00e9lan \u00e0 terminer, ind\u00e9pendant de toute date. C\'est le r\u00e9sidu honn\u00eate de l\'ancienne Urgence apr\u00e8s s\u00e9paration de l\'Impact et de l\'\u00c9ch\u00e9ance.',
        guidance: 'Ignorez la date limite\u00a0: parlez seulement de votre envie de voir la t\u00e2che disparaitre.'
      },
      affirmations: [
        'Aucun. Pas d\'\u00e9lan particulier.',
        'Bient\u00f4t. On aimerait s\'en d\u00e9barrasser.',
        'Assez vite. Envie claire d\'avancer.',
        'Vite. Forte volont\u00e9 de cl\u00f4turer.',
        'Au plus vite. \u00c9lan maximal, d\u00e9lib\u00e9r\u00e9.'
      ]
    },
    // Legacy labels kept for help/history readers; Urgence is no longer an input.
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
        intro: 'L\'urgence n\'est plus un curseur d\'entr\u00e9e\u00a0: elle \u00e9merge de l\'Impact, de l\'\u00c9ch\u00e9ance et de l\'Empressement.',
        guidance: 'Utilisez Empressement et \u00c9ch\u00e9ance \u00e0 la place.'
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
  S.TASK_TYPE_ICON_SVG = {
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
    if (S.TASK_TYPE_BY_ID[key] || isCustomTaskTypeId(key)) {
      key = taskTypeIconKey(key);
    }
    if (key.indexOf('ti-') === 0) key = key.slice(3);
    var cls = className || 'info-task-type-icon';
    var inner = S.TASK_TYPE_ICON_SVG[key];
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

  // ── 3b. Markdown / smart-card / link helpers ────────────────────────────
  // Description rich text: escape → markdown → optional unfurl / smart cards.
  // Never trust model HTML; all user content goes through escapeHtml first.

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
    impact: 'Combien la t\u00e2che compte : valeur, port\u00e9e et levier (0\u201310).',
    ease: 'Co\u00fbt d\'ex\u00e9cution : temps, gens, argent, charge mentale (0\u201310, plus facile = plus haut).',
    empressement: 'Envie de terminer, ind\u00e9pendante de toute date.',
    urgency: 'Niveau d\'urgence d\u00e9riv\u00e9 (sortie) : Impact + \u00c9ch\u00e9ance + Empressement.'
  };

  var QUESTIONS = {
    time: 'Quelle pression pèse sur cette tâche?',
    blocking: 'Est-ce que quelque chose cesse de fonctionner si ce n\'est pas fait?',
    impact: 'Combien cette t\u00e2che compte-t-elle\u00a0?',
    ease: '\u00c0 quel point est-il facile de faire cette t\u00e2che\u00a0?',
    empressement: 'Quelle est votre envie de terminer cette t\u00e2che\u00a0?',
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
    empressement: 'ti-rocket',
    urgency: 'ti-flame'
  };

  // ── 3c. Color schemes (OKLab / OKLCH ramps) ─────────────────────────────
  // Perceptual helpers for Classique / Feu badge colors and heat matching.

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

  S.activeColorSchemeKey = DEFAULT_COLOR_SCHEME_KEY;
  S.activeColorStops = COLOR_SCHEMES.blue.stops.slice();
  S.activeOklabStops = COLOR_SCHEMES.blue.oklabStops.slice();
  S.activeTextOnLight = COLOR_SCHEMES.blue.textOnLight;
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
  S.TIER_TRELLO_BADGE_COLORS = defaultTierTrelloBadgeColors();

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
    var scheme = COLOR_SCHEMES[S.activeColorSchemeKey];
    if (scheme && scheme.badgeColors) {
      S.TIER_TRELLO_BADGE_COLORS = copyTierBadgeColors(scheme.badgeColors);
      return;
    }
    if (!S.TIER_TRELLO_BADGE_COLORS || typeof S.TIER_TRELLO_BADGE_COLORS !== 'object') {
      S.TIER_TRELLO_BADGE_COLORS = defaultTierTrelloBadgeColors();
    }
    for (var i = 0; i <= TIER_I_SCHEME_MAPPED_MAX; i++) {
      var tier = S.TIERS[i];
      var avoid = i > 0 ? S.TIER_TRELLO_BADGE_COLORS[i - 1] : null;
      S.TIER_TRELLO_BADGE_COLORS[i] = nearestTrelloBadgeColorName(
        tier && tier.seg ? tier.seg : S.activeColorStops[0],
        avoid
      );
    }
    for (var j = TIER_I_SCHEME_MAPPED_MAX + 1; j <= TIER_I_MAX; j++) {
      S.TIER_TRELLO_BADGE_COLORS[j] = TRELLO_BADGE_COLOR_MUTED;
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

  // exports
  S.CLASSIC_TIER_TRELLO_BADGE_COLORS = CLASSIC_TIER_TRELLO_BADGE_COLORS;
  S.COLOR_SCHEMES = COLOR_SCHEMES;
  S.COLOR_SCHEME_OPTIONS = COLOR_SCHEME_OPTIONS;
  S.DUE_DATE_QUICK_ICON_SVG = DUE_DATE_QUICK_ICON_SVG;
  S.DUE_TIME_PERIOD_ICON_SVG = DUE_TIME_PERIOD_ICON_SVG;
  S.FIRE_TIER_TRELLO_BADGE_COLORS = FIRE_TIER_TRELLO_BADGE_COLORS;
  S.ICON_S = ICON_S;
  S.INFO_DESC_EMPTY_MIN_HEIGHT_PX = INFO_DESC_EMPTY_MIN_HEIGHT_PX;
  S.INFO_DESC_MAX_HEIGHT_PX = INFO_DESC_MAX_HEIGHT_PX;
  S.INFO_DESC_MIN_HEIGHT_PX = INFO_DESC_MIN_HEIGHT_PX;
  S.KEYWORDS = KEYWORDS;
  S.LABELS = LABELS;
  S.LEVEL_ICON_SVG = LEVEL_ICON_SVG;
  S.LINK_META_STORAGE_KEY = LINK_META_STORAGE_KEY;
  S.LINK_META_TTL_MS = LINK_META_TTL_MS;
  S.MD_CHECKLIST_PREFIX_RE = MD_CHECKLIST_PREFIX_RE;
  S.MD_HEADING_PREFIX_RE = MD_HEADING_PREFIX_RE;
  S.MD_LINK_TITLE = MD_LINK_TITLE;
  S.MD_OL_PREFIX_RE = MD_OL_PREFIX_RE;
  S.MD_UL_PREFIX_RE = MD_UL_PREFIX_RE;
  S.PRIORITY_BLUE_STOPS = PRIORITY_BLUE_STOPS;
  S.PRIORITY_TEXT_ON_DARK = PRIORITY_TEXT_ON_DARK;
  S.PROPERTY_ICONS = PROPERTY_ICONS;
  S.QUESTIONS = QUESTIONS;
  S.TIER_I = TIER_I;
  S.TIER_I_MAX = TIER_I_MAX;
  S.TIER_I_SCHEME_MAPPED_MAX = TIER_I_SCHEME_MAPPED_MAX;
  S.TRELLO_BADGE_COLOR_COMPLETE = TRELLO_BADGE_COLOR_COMPLETE;
  S.TRELLO_BADGE_COLOR_HEX = TRELLO_BADGE_COLOR_HEX;
  S.TRELLO_BADGE_COLOR_MUTED = TRELLO_BADGE_COLOR_MUTED;
  S.TRELLO_BADGE_COLOR_NAMES = TRELLO_BADGE_COLOR_NAMES;
  S.absolutizeUrl = absolutizeUrl;
  S.applyLinkPreviewMetaToCard = applyLinkPreviewMetaToCard;
  S.applyMarkdownBlockFormat = applyMarkdownBlockFormat;
  S.applyMarkdownEditToTextarea = applyMarkdownEditToTextarea;
  S.batterySvg = batterySvg;
  S.buildColorScheme = buildColorScheme;
  S.buildColorSchemeFromHex = buildColorSchemeFromHex;
  S.copyTierBadgeColors = copyTierBadgeColors;
  S.defaultTierTrelloBadgeColors = defaultTierTrelloBadgeColors;
  S.detectMarkdownLineFormat = detectMarkdownLineFormat;
  S.dimensionQuestion = dimensionQuestion;
  S.dueDateQuickIconSvg = dueDateQuickIconSvg;
  S.dueTimePeriodIconSvg = dueTimePeriodIconSvg;
  S.escapeHtml = escapeHtml;
  S.escapeRichMarkdownText = escapeRichMarkdownText;
  S.faviconUrlFor = faviconUrlFor;
  S.fetchLinkMetaHtmlProxy = fetchLinkMetaHtmlProxy;
  S.fetchLinkMetaMicrolink = fetchLinkMetaMicrolink;
  S.fetchLinkPreviewMeta = fetchLinkPreviewMeta;
  S.firstCapture = firstCapture;
  S.hostnameFromUrl = hostnameFromUrl;
  S.hydrateSmartLinkPreviews = hydrateSmartLinkPreviews;
  S.labelLooksLikeUrl = labelLooksLikeUrl;
  S.lerpOklab = lerpOklab;
  S.levelIconSvg = levelIconSvg;
  S.linearToSrgb = linearToSrgb;
  S.linkMarkdownSelection = linkMarkdownSelection;
  S.linkMetaInflight = linkMetaInflight;
  S.linkMetaMemory = linkMetaMemory;
  S.linkMetaStorageLoaded = linkMetaStorageLoaded;
  S.markdownFromRichBlock = markdownFromRichBlock;
  S.markdownFromRichInline = markdownFromRichInline;
  S.markdownFromRichRoot = markdownFromRichRoot;
  S.markdownMarkersAreExclusive = markdownMarkersAreExclusive;
  S.nearestTrelloBadgeColorName = nearestTrelloBadgeColorName;
  S.normalizeComparableUrl = normalizeComparableUrl;
  S.normalizePasteableMarkdownUrl = normalizePasteableMarkdownUrl;
  S.oklabDistance = oklabDistance;
  S.oklabToRgb = oklabToRgb;
  S.oklchStopsToHex = oklchStopsToHex;
  S.oklchStopsToOklab = oklchStopsToOklab;
  S.oklchToOklab = oklchToOklab;
  S.parseLinkMetaFromHtml = parseLinkMetaFromHtml;
  S.priorityParseHex = priorityParseHex;
  S.priorityRgbToHex = priorityRgbToHex;
  S.protectRichParagraphOpenings = protectRichParagraphOpenings;
  S.readLinkMetaStorage = readLinkMetaStorage;
  S.rebuildTrelloBadgeColors = rebuildTrelloBadgeColors;
  S.renderMarkdownInline = renderMarkdownInline;
  S.renderMarkdownLinkHtml = renderMarkdownLinkHtml;
  S.renderMarkdownToHtml = renderMarkdownToHtml;
  S.renderSmartCardHtml = renderSmartCardHtml;
  S.rgbToOklab = rgbToOklab;
  S.richAttr = richAttr;
  S.richChildren = richChildren;
  S.richClassContains = richClassContains;
  S.richListItemMarkdown = richListItemMarkdown;
  S.richNodeName = richNodeName;
  S.safeMarkdownHref = safeMarkdownHref;
  S.schemeTextOnLight = schemeTextOnLight;
  S.smartCardModeForLink = smartCardModeForLink;
  S.srgbToLinear = srgbToLinear;
  S.stripMarkdownLinePrefix = stripMarkdownLinePrefix;
  S.syncExpandableSurfaceHeight = syncExpandableSurfaceHeight;
  S.taskTypeIconSvg = taskTypeIconSvg;
  S.unescapeHtml = unescapeHtml;
  S.wrapMarkdownInlineSelection = wrapMarkdownInlineSelection;
  S.writeLinkMetaStorage = writeLinkMetaStorage;
})(typeof window !== 'undefined' ? window : this);
