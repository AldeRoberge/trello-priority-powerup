/**
 * priority-ui: part 2 of 12 (markdown).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */

/**
 * priority-ui-markdown-icons: part 1 of 2 (link).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui-markdown-icons.parts.json for the load order).
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

var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var DEFAULT_COLOR_SCHEME_KEY = S.DEFAULT_COLOR_SCHEME_KEY;
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

  // exports
  S.DUE_DATE_QUICK_ICON_SVG = DUE_DATE_QUICK_ICON_SVG;
  S.DUE_TIME_PERIOD_ICON_SVG = DUE_TIME_PERIOD_ICON_SVG;
  S.ICON_S = ICON_S;
  S.INFO_DESC_EMPTY_MIN_HEIGHT_PX = INFO_DESC_EMPTY_MIN_HEIGHT_PX;
  S.INFO_DESC_MAX_HEIGHT_PX = INFO_DESC_MAX_HEIGHT_PX;
  S.INFO_DESC_MIN_HEIGHT_PX = INFO_DESC_MIN_HEIGHT_PX;
  S.LABELS = LABELS;
  S.LEVEL_ICON_SVG = LEVEL_ICON_SVG;
  S.LINK_META_STORAGE_KEY = LINK_META_STORAGE_KEY;
  S.LINK_META_TTL_MS = LINK_META_TTL_MS;
  S.MD_LINK_TITLE = MD_LINK_TITLE;
  S.TIER_I = TIER_I;
  S.TIER_I_MAX = TIER_I_MAX;
  S.TIER_I_SCHEME_MAPPED_MAX = TIER_I_SCHEME_MAPPED_MAX;
  S.TRELLO_BADGE_COLOR_COMPLETE = TRELLO_BADGE_COLOR_COMPLETE;
  S.TRELLO_BADGE_COLOR_MUTED = TRELLO_BADGE_COLOR_MUTED;
  S.absolutizeUrl = absolutizeUrl;
  S.applyLinkPreviewMetaToCard = applyLinkPreviewMetaToCard;
  S.batterySvg = batterySvg;
  S.dueDateQuickIconSvg = dueDateQuickIconSvg;
  S.dueTimePeriodIconSvg = dueTimePeriodIconSvg;
  S.escapeHtml = escapeHtml;
  S.faviconUrlFor = faviconUrlFor;
  S.fetchLinkMetaHtmlProxy = fetchLinkMetaHtmlProxy;
  S.fetchLinkMetaMicrolink = fetchLinkMetaMicrolink;
  S.fetchLinkPreviewMeta = fetchLinkPreviewMeta;
  S.firstCapture = firstCapture;
  S.hostnameFromUrl = hostnameFromUrl;
  S.hydrateSmartLinkPreviews = hydrateSmartLinkPreviews;
  S.labelLooksLikeUrl = labelLooksLikeUrl;
  S.levelIconSvg = levelIconSvg;
  S.linkMetaInflight = linkMetaInflight;
  S.linkMetaMemory = linkMetaMemory;
  S.linkMetaStorageLoaded = linkMetaStorageLoaded;
  S.normalizeComparableUrl = normalizeComparableUrl;
  S.normalizePasteableMarkdownUrl = normalizePasteableMarkdownUrl;
  S.parseLinkMetaFromHtml = parseLinkMetaFromHtml;
  S.readLinkMetaStorage = readLinkMetaStorage;
  S.renderMarkdownLinkHtml = renderMarkdownLinkHtml;
  S.renderSmartCardHtml = renderSmartCardHtml;
  S.safeMarkdownHref = safeMarkdownHref;
  S.smartCardModeForLink = smartCardModeForLink;
  S.taskTypeIconSvg = taskTypeIconSvg;
  S.unescapeHtml = unescapeHtml;
  S.writeLinkMetaStorage = writeLinkMetaStorage;
})(typeof window !== 'undefined' ? window : this);
