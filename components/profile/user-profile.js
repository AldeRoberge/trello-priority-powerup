/**
 * Member profile — personal preferences & feature flags for a custom Priorité experience.
 * Stored at member/private (same privacy lane as agentProvider).
 * Exposes window.UserProfile (no bundler).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'userProfile';
  var MAX_NAME = 80;
  var MAX_ROLE = 80;
  var MAX_NOTES = 400;
  var MAX_AGENT_NAME = 40;
  var MAX_AGENT_PERSONALITY = 400;

  /** Stable identity palette for the assistant face (member-scoped). */
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

  var AGENT_COLOR_LABELS = {
    orange: 'Orange',
    yellow: 'Jaune',
    green: 'Vert',
    purple: 'Violet',
    blue: 'Bleu',
    pink: 'Rose',
    red: 'Rouge',
    teal: 'Turquoise',
    coral: 'Corail',
    sky: 'Ciel'
  };

  /** Permanent face shape / feature set (independent of emotion & color). */
  var AGENT_FACE_KEYS = ['classic', 'soft', 'bold', 'sly', 'calm', 'spark'];

  var AGENT_FACE_LABELS = {
    classic: 'Classique',
    soft: 'Doux',
    bold: 'Audacieux',
    sly: 'Malin',
    calm: 'Calme',
    spark: 'Vif'
  };

  /** Round / food / nature names that fit each glow color. */
  var AGENT_COLOR_NAMES = {
    orange: ['Orange', 'Mandarin', 'Clementine', 'Tangerine', 'Pumpkin', 'Pizza', 'Soleil'],
    yellow: ['Soleil', 'Lemon', 'Banana', 'Honey', 'Gold', 'Butter', 'Canary'],
    green: ['Lime', 'Pea', 'Kiwi', 'Moss', 'Clover', 'Jade', 'Olive'],
    purple: ['Plum', 'Grape', 'Fig', 'Violet', 'Lilac', 'Orchid', 'Raisin'],
    blue: ['Blueberry', 'Ocean', 'Sky', 'Azure', 'Cobalt', 'Indigo', 'Denim'],
    pink: ['Cherry', 'Blush', 'Rose', 'Peony', 'Berry', 'Cotton', 'Petal'],
    red: ['Apple', 'Tomato', 'Paprika', 'Ruby', 'Cherry', 'Berry', 'Cranberry'],
    teal: ['Mint', 'Aqua', 'Lagoon', 'Seafoam', 'Jade', 'Tide', 'Foam'],
    coral: ['Coral', 'Salmon', 'Papaya', 'Peach', 'Shrimp', 'Apricot', 'Melon'],
    sky: ['Cloud', 'Sky', 'Azure', 'Breeze', 'Ciel', 'Nimbus', 'Mist']
  };

  var FEATURE_KEYS = [
    'info',
    'statut',
    'priority',
    'graph',
    'progress',
    'due',
    'blocked',
    'assistant'
  ];

  var FEATURE_LABELS = {
    info: 'Détails',
    statut: 'Statut',
    priority: 'Priorité',
    graph: 'Graphique',
    progress: 'Progrès',
    due: 'Échéance',
    blocked: 'Bloqué',
    assistant: 'Assistant'
  };

  /** Opt-in beta features (default off). */
  var EXPERIMENTAL_KEYS = ['objectif', 'impactGlobe', 'easeHourglass'];

  var EXPERIMENTAL_LABELS = {
    objectif: 'Objectifs (vision, mission, projet)',
    impactGlobe: 'Globe d’impact (portée)',
    easeHourglass: 'Sablier de durée (Facilité)'
  };

  var EXPERIMENTAL_HINTS = {
    objectif: 'Section Objectif sur les cartes, badges et paramètres Vision → Mission → Projet',
    impactGlobe: 'Anneau de portée autour du globe sur le champ Impact',
    easeHourglass: 'Contrôle de durée estimée avec sablier sous Facilité'
  };

  var TONE_KEYS = ['concise', 'detailed', 'friendly'];
  var TONE_LABELS = {
    concise: 'Concise',
    detailed: 'Détaillée',
    friendly: 'Chaleureuse'
  };

  var LANGUAGE_KEYS = ['fr', 'en'];
  var LANGUAGE_LABELS = {
    fr: 'Français',
    en: 'English'
  };

  /** Clock face preference for due times / picker (member-scoped). */
  var TIME_FORMAT_KEYS = ['24', '12'];
  var TIME_FORMAT_LABELS = {
    '24': '24 heures',
    '12': '12 heures (AM/PM)'
  };

  var AGENT_STATUS_KEYS = ['none', 'standard', 'full'];
  var AGENT_STATUS_LABELS = {
    none: 'Aucun',
    standard: 'Standard',
    full: 'Complet'
  };

  function normalizeAgentStatus(raw, legacyDebug) {
    var s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (AGENT_STATUS_KEYS.indexOf(s) !== -1) return s;
    // Legacy checkbox: true → full (debug panel), false → standard (stats only).
    if (legacyDebug === false) return 'standard';
    if (legacyDebug === true) return 'full';
    return 'standard';
  }

  function trimStr(value, max) {
    var s = typeof value === 'string' ? value.trim() : '';
    if (!s) return '';
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).trim() + '\u2026';
  }

  function defaultFeatures() {
    var out = {};
    FEATURE_KEYS.forEach(function (key) {
      out[key] = true;
    });
    return out;
  }

  function defaultExperimental() {
    var out = {};
    EXPERIMENTAL_KEYS.forEach(function (key) {
      out[key] = false;
    });
    return out;
  }

  function normalizeTimeFormat(raw) {
    if (raw === 12 || raw === true) return '12';
    var s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (s === '12' || s === '12h' || s === 'hour12' || s === 'h12') return '12';
    return '24';
  }

  function emptyProfile() {
    return {
      version: 1,
      displayName: '',
      role: '',
      notes: '',
      tone: 'concise',
      language: 'fr',
      timeFormat: '24',
      features: defaultFeatures(),
      experimental: defaultExperimental(),
      agentStatus: 'standard',
      agentName: '',
      agentPersonality: '',
      agentColor: '',
      agentFace: 'classic',
      /** Opt-in console diagnostics (member-scoped; not sent to the LLM). */
      debugLogging: false,
      updatedAt: ''
    };
  }

  function normalizeAgentColor(raw) {
    var c = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (AGENT_COLOR_KEYS.indexOf(c) !== -1) return c;
    // Common aliases from older face auras / FR labels.
    if (c === 'jaune' || c === 'gold' || c === 'amber') return 'yellow';
    if (c === 'peach' || c === 'warm') return 'orange';
    if (c === 'vert' || c === 'lime' || c === 'mint') return c === 'mint' ? 'teal' : 'green';
    if (c === 'violet' || c === 'lavender') return 'purple';
    if (c === 'bleu') return 'blue';
    if (c === 'rose') return 'pink';
    if (c === 'rouge') return 'red';
    if (c === 'turquoise' || c === 'cyan') return 'teal';
    if (c === 'ciel') return 'sky';
    return '';
  }

  function normalizeAgentFace(raw) {
    var f = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (AGENT_FACE_KEYS.indexOf(f) !== -1) return f;
    if (f === 'default' || f === 'normal' || f === 'standard') return 'classic';
    if (f === 'doux' || f === 'round' || f === 'rond') return 'soft';
    if (f === 'audacieux' || f === 'strong') return 'bold';
    if (f === 'malin' || f === 'smirk' || f === 'fox') return 'sly';
    if (f === 'calme' || f === 'zen' || f === 'flat') return 'calm';
    if (f === 'vif' || f === 'bright' || f === 'sparkle') return 'spark';
    return 'classic';
  }

  function pickRandom(list) {
    if (!list || !list.length) return '';
    return list[Math.floor(Math.random() * list.length)];
  }

  function pickRandomAgentColor() {
    return pickRandom(AGENT_COLOR_KEYS) || 'orange';
  }

  function pickAgentNameForColor(color) {
    var key = normalizeAgentColor(color) || 'orange';
    return pickRandom(AGENT_COLOR_NAMES[key] || AGENT_COLOR_NAMES.orange) || 'Orange';
  }

  function isStockAgentName(name) {
    var n = typeof name === 'string' ? name.trim() : '';
    if (!n) return false;
    var lower = n.toLowerCase();
    for (var i = 0; i < AGENT_COLOR_KEYS.length; i++) {
      var names = AGENT_COLOR_NAMES[AGENT_COLOR_KEYS[i]] || [];
      for (var j = 0; j < names.length; j++) {
        if (String(names[j]).toLowerCase() === lower) return true;
      }
    }
    return false;
  }

  /**
   * Fill missing agent color / name with a random color-based identity.
   * Does not overwrite a custom name unless forceName is true.
   */
  function ensureAgentIdentity(profile, options) {
    options = options || {};
    var p = normalizeProfile(profile);
    var changed = false;
    if (!p.agentColor || options.forceColor) {
      p.agentColor = pickRandomAgentColor();
      changed = true;
    }
    var needName =
      options.forceName ||
      !p.agentName ||
      (options.resyncStockName && isStockAgentName(p.agentName));
    if (needName) {
      p.agentName = pickAgentNameForColor(p.agentColor);
      changed = true;
    }
    return { profile: p, changed: changed };
  }

  function normalizeTone(raw) {
    var t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return TONE_KEYS.indexOf(t) !== -1 ? t : 'concise';
  }

  function normalizeLanguage(raw) {
    var lang = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return LANGUAGE_KEYS.indexOf(lang) !== -1 ? lang : 'fr';
  }

  function normalizeFeatures(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var out = defaultFeatures();
    FEATURE_KEYS.forEach(function (key) {
      if (typeof src[key] === 'boolean') out[key] = src[key];
    });
    // Keep at least one core editing surface visible.
    if (!out.priority && !out.progress && !out.due && !out.blocked) {
      out.priority = true;
    }
    return out;
  }

  function normalizeExperimental(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var out = defaultExperimental();
    EXPERIMENTAL_KEYS.forEach(function (key) {
      if (typeof src[key] === 'boolean') out[key] = src[key];
    });
    return out;
  }

  function normalizeProfile(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    return {
      version: 1,
      displayName: trimStr(src.displayName, MAX_NAME),
      role: trimStr(src.role, MAX_ROLE),
      notes: trimStr(src.notes, MAX_NOTES),
      tone: normalizeTone(src.tone),
      language: normalizeLanguage(src.language),
      timeFormat: normalizeTimeFormat(src.timeFormat),
      features: normalizeFeatures(src.features),
      experimental: normalizeExperimental(src.experimental),
      agentStatus: normalizeAgentStatus(src.agentStatus, src.agentDebug),
      agentName: trimStr(src.agentName, MAX_AGENT_NAME),
      agentPersonality: trimStr(src.agentPersonality, MAX_AGENT_PERSONALITY),
      agentColor: normalizeAgentColor(src.agentColor),
      agentFace: normalizeAgentFace(src.agentFace),
      debugLogging: src.debugLogging === true,
      updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : ''
    };
  }

  function isFeatureEnabled(profile, key) {
    var p = normalizeProfile(profile);
    if (FEATURE_KEYS.indexOf(key) === -1) return true;
    return p.features[key] !== false;
  }

  function isExperimentalEnabled(profile, key) {
    var p = normalizeProfile(profile);
    if (EXPERIMENTAL_KEYS.indexOf(key) === -1) return false;
    return p.experimental[key] === true;
  }

  function isDebugLoggingEnabled(profile) {
    return normalizeProfile(profile).debugLogging === true;
  }

  function featureSelector(key) {
    switch (key) {
      case 'info':
        return '.variant-info-section';
      case 'statut':
        return '.statut-in-progress-mount, .field--statut-embedded';
      case 'objectif':
        return '.info-row--objectif, .variant-objectif-section';
      case 'priority':
        return '.variant-priority-section';
      case 'graph':
        return '.calc-graph-section';
      case 'progress':
        return '.variant-progress-section';
      case 'due':
        return '.variant-due-section';
      case 'blocked':
        // Nested under Progrès → Statut (reasons panel shown when status is Bloqué).
        return '.statut-blocked-panel';
      case 'assistant':
        return '.variant-chat-section';
      default:
        return null;
    }
  }

  /**
   * Show/hide card-editor sections according to profile.features
   * and experimental flags (e.g. Objectif).
   * Safe to call repeatedly after mounts complete.
   */
  function applyFeaturesToCard(cardEl, profile) {
    if (!cardEl || !cardEl.querySelector) return;
    var p = normalizeProfile(profile);
    FEATURE_KEYS.forEach(function (key) {
      var sel = featureSelector(key);
      if (!sel) return;
      // Statut nests under Progrès: keep the Progrès shell when Statut is on.
      if (key === 'progress') {
        var completionOnly = cardEl.querySelectorAll(
          '#completionMount, .tp-completion'
        );
        if (p.features.progress === false && p.features.statut !== false) {
          var progressShell = cardEl.querySelectorAll(sel);
          for (var ps = 0; ps < progressShell.length; ps++) {
            progressShell[ps].hidden = false;
          }
          for (var c = 0; c < completionOnly.length; c++) {
            completionOnly[c].hidden = true;
          }
          return;
        }
        for (var cu = 0; cu < completionOnly.length; cu++) {
          completionOnly[cu].hidden = p.features.progress === false;
        }
      }
      var nodes = cardEl.querySelectorAll(sel);
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].hidden = p.features[key] === false;
      }
    });
    var objectifSel = featureSelector('objectif');
    if (objectifSel) {
      var objectifOn = p.experimental.objectif === true;
      var objectifNodes = cardEl.querySelectorAll(objectifSel);
      for (var j = 0; j < objectifNodes.length; j++) {
        objectifNodes[j].hidden = !objectifOn;
      }
    }
    var porteOn = p.experimental.impactGlobe === true;
    var porteNodes = cardEl.querySelectorAll('.info-row--porte');
    for (var pIdx = 0; pIdx < porteNodes.length; pIdx++) {
      porteNodes[pIdx].hidden = !porteOn;
    }
    // Durée (Facilité) retired — estimates live under Progrès.
    var dureeNodes = cardEl.querySelectorAll('.info-row--duree');
    for (var d = 0; d < dureeNodes.length; d++) {
      dureeNodes[d].hidden = true;
    }
    var progresNodes = cardEl.querySelectorAll('.info-row--progress');
    for (var pr = 0; pr < progresNodes.length; pr++) {
      progresNodes[pr].hidden = p.features.progress === false;
    }
  }

  /** Compact object for LLM context (no storage metadata). */
  function toAgentContext(profile) {
    var p = normalizeProfile(profile);
    return {
      displayName: p.displayName || null,
      role: p.role || null,
      notes: p.notes || null,
      tone: p.tone,
      language: p.language,
      timeFormat: p.timeFormat,
      features: p.features,
      experimental: p.experimental,
      agentName: p.agentName || null,
      agentPersonality: p.agentPersonality || null,
      agentColor: p.agentColor || null,
      agentFace: p.agentFace || 'classic'
    };
  }

  function profilePromptLines(profile) {
    var p = normalizeProfile(profile);
    var lines = [];
    if (p.agentName || p.agentPersonality || p.agentColor) {
      lines.push('Identité de l\'assistant (membre — respecter jusqu\'à changement)\u00a0:');
      if (p.agentName) {
        lines.push(
          '- Tu t\'appelles ' +
            p.agentName +
            '. Présente-toi ainsi. Ce n\'est pas un surnom temporaire, MAIS l\'utilisateur peut te renommer\u00a0: dans ce cas utilise set_agent_name (ne refuse JAMAIS un changement de nom).'
        );
      }
      if (p.agentColor) {
        var colorLabel = AGENT_COLOR_LABELS[p.agentColor] || p.agentColor;
        lines.push(
          '- Couleur d\'identité\u00a0: ' +
            colorLabel +
            ' (`' +
            p.agentColor +
            '`). Utilise cette couleur pour ton avatar (champ "color") sauf exception brève liée à l\'humeur. L\'utilisateur peut changer ta couleur d\'identité\u00a0: utilise set_agent_color (ne refuse JAMAIS).'
        );
      }
      if (p.agentPersonality) {
        lines.push(
          '- Personnalité / character\u00a0: ' +
            p.agentPersonality +
            '. Incarne ce trait dans le ton et les réactions, sans perdre la voix d\'ami snarky-doux mais très hopeful (pas un coach productivité). L\'utilisateur peut la modifier\u00a0: utilise set_agent_personality (ne refuse JAMAIS).'
        );
      }
    }
    lines.push('Profil utilisateur (préférences personnelles — respecter)\u00a0:');
    if (p.displayName) {
      lines.push('- Prénom / nom\u00a0: ' + p.displayName + '. Adresse-le ainsi quand c\'est naturel.');
    }
    if (p.role) {
      lines.push('- Rôle\u00a0: ' + p.role + '. Adapte le vocabulaire à ce contexte — sans pousser le travail.');
    }
    if (p.notes) {
      lines.push('- Notes / préférences\u00a0: ' + p.notes);
    }
    if (p.language === 'en') {
      lines.push('- Langue\u00a0: réponds en anglais (English), sauf si l\'utilisateur écrit clairement en français.');
    } else {
      lines.push('- Langue\u00a0: réponds en français.');
    }
    if (p.language === 'en') {
      lines.push(
        '- Base voice (always): close friend — gently snarky but very hopeful; natural; feelings first; zero productivity push; zero technical jargon.'
      );
      if (p.tone === 'detailed') {
        lines.push(
          '- Length: a bit more detailed (explain calmly, still warm teasing-friend style).'
        );
      } else if (p.tone === 'friendly') {
        lines.push(
          '- Length / warmth: even warmer and encouraging, without monologues.'
        );
      } else {
        lines.push(
          '- Length: short and direct, but still warm like chatting with a friend (not cold or telegraphic).'
        );
      }
    } else {
      lines.push(
        '- Voix de base (toujours)\u00a0: vrai pote snarky-doux mais très hopeful — tutoiement, naturel, d\'abord le ressenti, zéro push productivité, zéro jargon technique.'
      );
      if (p.tone === 'detailed') {
        lines.push(
          '- Longueur\u00a0: un peu plus détaillé (explique calmement, toujours style pote taquin).'
        );
      } else if (p.tone === 'friendly') {
        lines.push(
          '- Longueur / chaleur\u00a0: encore plus chaleureux et encourageant, sans monologue.'
        );
      } else {
        lines.push(
          '- Longueur\u00a0: court et direct, mais toujours chaleureux comme avec un ami (pas froid ni télégraphique).'
        );
      }
    }
    var enabled = [];
    FEATURE_KEYS.forEach(function (key) {
      if (p.features[key]) enabled.push(FEATURE_LABELS[key] || key);
    });
    if (enabled.length) {
      lines.push('- Fonctionnalités actives dans l\'éditeur\u00a0: ' + enabled.join(', ') + '.');
    }
    return lines;
  }

  async function load(t) {
    if (!t || typeof t.get !== 'function') {
      return ensureAgentIdentity(emptyProfile()).profile;
    }
    try {
      var stored = await t.get('member', 'private', STORAGE_KEY);
      var profile = normalizeProfile(stored);
      var ensured = ensureAgentIdentity(profile);
      if (ensured.changed && typeof t.set === 'function') {
        try {
          return await save(t, ensured.profile);
        } catch (persistErr) {
          console.error('UserProfile identity persist failed', persistErr);
          return ensured.profile;
        }
      }
      return ensured.profile;
    } catch (err) {
      console.error('UserProfile.load failed', err);
      return ensureAgentIdentity(emptyProfile()).profile;
    }
  }

  async function save(t, profile) {
    if (!t || typeof t.set !== 'function') {
      throw new Error('UserProfile.save: t.set required');
    }
    var next = normalizeProfile(profile);
    next.updatedAt = new Date().toISOString();
    await t.set('member', 'private', STORAGE_KEY, next);
    return next;
  }

  async function reset(t) {
    var blank = ensureAgentIdentity(emptyProfile(), {
      forceColor: true,
      forceName: true
    }).profile;
    blank.updatedAt = new Date().toISOString();
    if (t && typeof t.set === 'function') {
      await t.set('member', 'private', STORAGE_KEY, blank);
    }
    return blank;
  }

  global.UserProfile = {
    STORAGE_KEY: STORAGE_KEY,
    FEATURE_KEYS: FEATURE_KEYS,
    FEATURE_LABELS: FEATURE_LABELS,
    EXPERIMENTAL_KEYS: EXPERIMENTAL_KEYS,
    EXPERIMENTAL_LABELS: EXPERIMENTAL_LABELS,
    EXPERIMENTAL_HINTS: EXPERIMENTAL_HINTS,
    TONE_KEYS: TONE_KEYS,
    TONE_LABELS: TONE_LABELS,
    LANGUAGE_KEYS: LANGUAGE_KEYS,
    LANGUAGE_LABELS: LANGUAGE_LABELS,
    TIME_FORMAT_KEYS: TIME_FORMAT_KEYS,
    TIME_FORMAT_LABELS: TIME_FORMAT_LABELS,
    AGENT_STATUS_KEYS: AGENT_STATUS_KEYS,
    AGENT_STATUS_LABELS: AGENT_STATUS_LABELS,
    AGENT_COLOR_KEYS: AGENT_COLOR_KEYS,
    AGENT_COLOR_LABELS: AGENT_COLOR_LABELS,
    AGENT_COLOR_NAMES: AGENT_COLOR_NAMES,
    AGENT_FACE_KEYS: AGENT_FACE_KEYS,
    AGENT_FACE_LABELS: AGENT_FACE_LABELS,
    MAX_AGENT_NAME: MAX_AGENT_NAME,
    MAX_AGENT_PERSONALITY: MAX_AGENT_PERSONALITY,
    emptyProfile: emptyProfile,
    normalizeAgentStatus: normalizeAgentStatus,
    normalizeAgentColor: normalizeAgentColor,
    normalizeAgentFace: normalizeAgentFace,
    normalizeProfile: normalizeProfile,
    normalizeTimeFormat: normalizeTimeFormat,
    normalizeExperimental: normalizeExperimental,
    pickRandomAgentColor: pickRandomAgentColor,
    pickAgentNameForColor: pickAgentNameForColor,
    isStockAgentName: isStockAgentName,
    ensureAgentIdentity: ensureAgentIdentity,
    isFeatureEnabled: isFeatureEnabled,
    isExperimentalEnabled: isExperimentalEnabled,
    isDebugLoggingEnabled: isDebugLoggingEnabled,
    applyFeaturesToCard: applyFeaturesToCard,
    toAgentContext: toAgentContext,
    profilePromptLines: profilePromptLines,
    load: load,
    save: save,
    reset: reset
  };
})(typeof window !== 'undefined' ? window : this);
