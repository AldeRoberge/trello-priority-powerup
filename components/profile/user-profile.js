/**
 * Member profile — personal preferences & feature flags for a custom Priorité experience.
 * Stored at member/private (same privacy lane as agentProvider).
 * Exposes window.UserProfile (no bundler).
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

  /** Mid swatch hex for each named aura (matches the face gradient mid stop). */
  var AGENT_COLOR_HEX = {
    orange: '#f5b58a',
    yellow: '#f5d76e',
    green: '#8fd86a',
    purple: '#b48ae0',
    blue: '#7eb2f0',
    pink: '#f095b8',
    red: '#f08070',
    teal: '#5ecfb8',
    coral: '#f0a078',
    sky: '#8ec8e8'
  };

  var AGENT_COLOR_PALETTES = {
    orange: { hi: '#ffe0c2', mid: '#f5b58a', lo: '#e8956a', glow: '#c4794a' },
    yellow: { hi: '#fff6c8', mid: '#f5d76e', lo: '#e0b83a', glow: '#d4a017' },
    green: { hi: '#d8f5c8', mid: '#8fd86a', lo: '#5aa843', glow: '#4a8f38' },
    purple: { hi: '#e8d4ff', mid: '#b48ae0', lo: '#8a5cbf', glow: '#6f3fa8' },
    blue: { hi: '#cfe4ff', mid: '#7eb2f0', lo: '#4a86d4', glow: '#3a6fb3' },
    pink: { hi: '#ffd6e8', mid: '#f095b8', lo: '#d96a94', glow: '#c24f7c' },
    red: { hi: '#ffd0c8', mid: '#f08070', lo: '#d14a3a', glow: '#b9382a' },
    teal: { hi: '#c8f5ee', mid: '#5ecfb8', lo: '#2fa892', glow: '#1f8a78' },
    coral: { hi: '#ffd8c8', mid: '#f0a078', lo: '#e07850', glow: '#c45f38' },
    sky: { hi: '#dff4ff', mid: '#8ec8e8', lo: '#5aa8d0', glow: '#3f8ab3' }
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
    objectif: 'Objectifs (objectifs et projets)',
    impactGlobe: 'Globe d’impact (portée)',
    easeHourglass: 'Sablier de durée (Facilité)'
  };

  var EXPERIMENTAL_HINTS = {
    objectif: 'Section Objectif sur les cartes, badges et paramètres Objectifs → Projets',
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

  /** Regional dialect / variety keyed by main language. */
  var DIALECTS_BY_LANGUAGE = {
    fr: [
      { key: 'qc', label: 'Québécois' },
      { key: 'fr', label: 'France' },
      { key: 'be', label: 'Belgique' },
      { key: 'ch', label: 'Suisse' }
    ],
    en: [
      { key: 'us', label: 'US' },
      { key: 'uk', label: 'UK' },
      { key: 'ca', label: 'Canada' }
    ]
  };

  var DEFAULT_DIALECT_BY_LANGUAGE = {
    fr: 'qc',
    en: 'us'
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
      dialect: 'qc',
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
      /** Open the Cerveau editor modal automatically when a card is opened. */
      autoOpenCerveau: true,
      updatedAt: ''
    };
  }

  function parseAgentHex(raw) {
    var s = String(raw == null ? '' : raw)
      .trim()
      .toLowerCase();
    if (!s) return '';
    if (s.charAt(0) !== '#') s = '#' + s;
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) {
      return (
        '#' +
        s.charAt(1) +
        s.charAt(1) +
        s.charAt(2) +
        s.charAt(2) +
        s.charAt(3) +
        s.charAt(3)
      );
    }
    return '';
  }

  function normalizeAgentColor(raw) {
    var c = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (AGENT_COLOR_KEYS.indexOf(c) !== -1) return c;
    // Common aliases from older face auras / FR labels.
    if (c === 'jaune' || c === 'gold' || c === 'amber' || c === 'dore' || c === 'doré') {
      return 'yellow';
    }
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
    var hex = parseAgentHex(raw);
    if (!hex) return '';
    // Snap exact preset mid tones back to named keys.
    for (var i = 0; i < AGENT_COLOR_KEYS.length; i++) {
      var key = AGENT_COLOR_KEYS[i];
      if (AGENT_COLOR_HEX[key] === hex) return key;
    }
    return hex;
  }

  function isCustomAgentColor(color) {
    var n = normalizeAgentColor(color);
    return !!(n && n.charAt(0) === '#');
  }

  function hexToRgb(hex) {
    var h = parseAgentHex(hex);
    if (!h) return null;
    return {
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16)
    };
  }

  function rgbToHex(r, g, b) {
    function byte(n) {
      var v = Math.max(0, Math.min(255, Math.round(n)));
      var s = v.toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + byte(r) + byte(g) + byte(b);
  }

  function mixRgb(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t
    };
  }

  function agentColorHex(color) {
    var n = normalizeAgentColor(color) || 'orange';
    if (n.charAt(0) === '#') return n;
    return AGENT_COLOR_HEX[n] || AGENT_COLOR_HEX.orange;
  }

  function agentColorPalette(color) {
    var n = normalizeAgentColor(color) || 'orange';
    if (n.charAt(0) !== '#') {
      var preset = AGENT_COLOR_PALETTES[n] || AGENT_COLOR_PALETTES.orange;
      return {
        hi: preset.hi,
        mid: preset.mid,
        lo: preset.lo,
        glow: preset.glow
      };
    }
    var midRgb = hexToRgb(n);
    if (!midRgb) return agentColorPalette('orange');
    var hi = mixRgb(midRgb, { r: 255, g: 255, b: 255 }, 0.48);
    var lo = mixRgb(midRgb, { r: 48, g: 32, b: 24 }, 0.34);
    var glow = mixRgb(midRgb, { r: 36, g: 24, b: 18 }, 0.42);
    return {
      hi: rgbToHex(hi.r, hi.g, hi.b),
      mid: n,
      lo: rgbToHex(lo.r, lo.g, lo.b),
      glow: rgbToHex(glow.r, glow.g, glow.b)
    };
  }

  function nearestAgentColorKey(color) {
    var n = normalizeAgentColor(color);
    if (n && n.charAt(0) !== '#') return n;
    var rgb = hexToRgb(agentColorHex(color));
    if (!rgb) return 'orange';
    var best = 'orange';
    var bestDist = Infinity;
    for (var i = 0; i < AGENT_COLOR_KEYS.length; i++) {
      var key = AGENT_COLOR_KEYS[i];
      var p = hexToRgb(AGENT_COLOR_HEX[key]);
      if (!p) continue;
      var dist =
        (p.r - rgb.r) * (p.r - rgb.r) +
        (p.g - rgb.g) * (p.g - rgb.g) +
        (p.b - rgb.b) * (p.b - rgb.b);
      if (dist < bestDist) {
        bestDist = dist;
        best = key;
      }
    }
    return best;
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
    var key = nearestAgentColorKey(color);
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
   * Visual color picker: preset swatches + native custom color input.
   * Returns { getValue, setValue }.
   */
  function mountAgentColorPicker(host, options) {
    options = options || {};
    if (!host) {
      return {
        getValue: function () {
          return 'orange';
        },
        setValue: function () {}
      };
    }
    var onChange = typeof options.onChange === 'function' ? options.onChange : null;
    var current = normalizeAgentColor(options.value) || 'orange';

    host.classList.add('tp-agent-color-picker');
    host.setAttribute('role', 'radiogroup');
    host.setAttribute('aria-label', options.ariaLabel || 'Couleur de l\'assistant');
    host.replaceChildren();

    var swatches = [];
    AGENT_COLOR_KEYS.forEach(function (key) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tp-agent-color-swatch';
      btn.setAttribute('data-color', key);
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-label', AGENT_COLOR_LABELS[key] || key);
      btn.title = AGENT_COLOR_LABELS[key] || key;
      btn.style.background = AGENT_COLOR_HEX[key];
      btn.addEventListener('click', function () {
        applyValue(key, true);
      });
      host.appendChild(btn);
      swatches.push(btn);
    });

    var customWrap = document.createElement('label');
    customWrap.className = 'tp-agent-color-custom';
    customWrap.title = 'Couleur personnalisée';
    customWrap.setAttribute('aria-label', 'Couleur personnalisée');

    var customSwatch = document.createElement('span');
    customSwatch.className = 'tp-agent-color-custom-face';
    customSwatch.setAttribute('aria-hidden', 'true');

    var customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.className = 'tp-agent-color-custom-input';
    customInput.setAttribute('aria-label', 'Choisir une couleur personnalisée');

    var customLabel = document.createElement('span');
    customLabel.className = 'tp-agent-color-custom-label';
    customLabel.textContent = 'Perso';

    customWrap.appendChild(customSwatch);
    customWrap.appendChild(customInput);
    customWrap.appendChild(customLabel);
    host.appendChild(customWrap);

    function syncUi() {
      var named = current && current.charAt(0) !== '#';
      var hex = agentColorHex(current);
      for (var i = 0; i < swatches.length; i++) {
        var key = swatches[i].getAttribute('data-color');
        var selected = named && key === current;
        swatches[i].classList.toggle('is-selected', selected);
        swatches[i].setAttribute('aria-checked', selected ? 'true' : 'false');
      }
      var customSelected = !named;
      customWrap.classList.toggle('is-selected', customSelected);
      customWrap.setAttribute('aria-checked', customSelected ? 'true' : 'false');
      customInput.value = hex;
      customSwatch.style.background = hex;
    }

    function applyValue(next, emit) {
      var normalized = normalizeAgentColor(next) || 'orange';
      var changed = normalized !== current;
      current = normalized;
      syncUi();
      if (emit && changed && onChange) onChange(current);
    }

    customInput.addEventListener('input', function () {
      applyValue(customInput.value, true);
    });
    customInput.addEventListener('change', function () {
      applyValue(customInput.value, true);
    });

    syncUi();

    return {
      getValue: function () {
        return current;
      },
      setValue: function (value) {
        applyValue(value, false);
      }
    };
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

  function dialectsFor(language) {
    var lang = normalizeLanguage(language);
    return DIALECTS_BY_LANGUAGE[lang] || DIALECTS_BY_LANGUAGE.fr;
  }

  function defaultDialectFor(language) {
    var lang = normalizeLanguage(language);
    return DEFAULT_DIALECT_BY_LANGUAGE[lang] || 'qc';
  }

  function dialectLabelsFor(language) {
    var list = dialectsFor(language);
    var out = {};
    list.forEach(function (d) {
      out[d.key] = d.label;
    });
    return out;
  }

  function dialectKeysFor(language) {
    return dialectsFor(language).map(function (d) {
      return d.key;
    });
  }

  function normalizeDialect(language, raw) {
    var lang = normalizeLanguage(language);
    var keys = dialectKeysFor(lang);
    var d = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    // Aliases from older / loose inputs
    if (lang === 'fr') {
      if (d === 'quebec' || d === 'québécois' || d === 'quebecois' || d === 'fr-ca' || d === 'fr_ca') {
        d = 'qc';
      } else if (d === 'france' || d === 'fr-fr' || d === 'fr_fr' || d === 'metropolitan') {
        d = 'fr';
      } else if (d === 'belgium' || d === 'belgique' || d === 'fr-be' || d === 'fr_be') {
        d = 'be';
      } else if (d === 'switzerland' || d === 'suisse' || d === 'fr-ch' || d === 'fr_ch') {
        d = 'ch';
      }
    } else if (lang === 'en') {
      if (d === 'american' || d === 'en-us' || d === 'en_us' || d === 'usa') {
        d = 'us';
      } else if (d === 'british' || d === 'en-gb' || d === 'en_gb' || d === 'england') {
        d = 'uk';
      } else if (d === 'canadian' || d === 'en-ca' || d === 'en_ca') {
        d = 'ca';
      }
    }
    if (keys.indexOf(d) !== -1) return d;
    return defaultDialectFor(lang);
  }

  function dialectLabel(language, dialect) {
    var lang = normalizeLanguage(language);
    var d = normalizeDialect(lang, dialect);
    var labels = dialectLabelsFor(lang);
    return labels[d] || d;
  }

  /**
   * Short language/dialect instruction for specialist AI prompts
   * (interview, subtasks, status brief, memory scan, etc.).
   */
  function languageInstruction(profile) {
    var p = normalizeProfile(profile || {});
    var dialect = p.dialect;
    var label = dialectLabel(p.language, dialect);
    if (p.language === 'en') {
      if (dialect === 'uk') {
        return (
          'Language: British English (UK). Prefer UK spelling and wording ' +
          '(colour, organise, flat, fortnight) over US variants, ' +
          'unless the user clearly writes in French or another variety.'
        );
      }
      if (dialect === 'ca') {
        return (
          'Language: Canadian English. Prefer Canadian spelling and wording ' +
          '(mix of UK/US norms common in Canada), ' +
          'unless the user clearly writes in French or another variety.'
        );
      }
      return (
        'Language: American English (US). Prefer US spelling and wording ' +
        '(color, organize, apartment), ' +
        'unless the user clearly writes in French or another variety.'
      );
    }
    if (dialect === 'qc') {
      return (
        'Langue\u00a0: français québécois. Utilise le vocabulaire du Québec ' +
        '(ex. «\u00a0sabler le plâtre\u00a0» et non «\u00a0poncer le plâtre\u00a0»). ' +
        'Préfère les termes québécois aux équivalents de France quand les deux existent, ' +
        'sauf si l\'utilisateur écrit clairement en anglais ou dans un autre français.'
      );
    }
    if (dialect === 'be') {
      return (
        'Langue\u00a0: français de Belgique (' +
        label +
        '). Adapte le vocabulaire belge courant quand pertinent, ' +
        'sauf si l\'utilisateur écrit clairement en anglais ou autrement.'
      );
    }
    if (dialect === 'ch') {
      return (
        'Langue\u00a0: français de Suisse (' +
        label +
        '). Adapte le vocabulaire suisse courant quand pertinent, ' +
        'sauf si l\'utilisateur écrit clairement en anglais ou autrement.'
      );
    }
    return (
      'Langue\u00a0: français de France. Vocabulaire métropolitain standard, ' +
      'sauf si l\'utilisateur écrit clairement en anglais ou autrement.'
    );
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
    var language = normalizeLanguage(src.language);
    return {
      version: 1,
      displayName: trimStr(src.displayName, MAX_NAME),
      role: trimStr(src.role, MAX_ROLE),
      notes: trimStr(src.notes, MAX_NOTES),
      tone: normalizeTone(src.tone),
      language: language,
      dialect: normalizeDialect(language, src.dialect),
      timeFormat: normalizeTimeFormat(src.timeFormat),
      features: normalizeFeatures(src.features),
      experimental: normalizeExperimental(src.experimental),
      agentStatus: normalizeAgentStatus(src.agentStatus, src.agentDebug),
      agentName: trimStr(src.agentName, MAX_AGENT_NAME),
      agentPersonality: trimStr(src.agentPersonality, MAX_AGENT_PERSONALITY),
      agentColor: normalizeAgentColor(src.agentColor),
      agentFace: normalizeAgentFace(src.agentFace),
      debugLogging: src.debugLogging === true,
      // Default ON — only an explicit false disables auto-open.
      autoOpenCerveau: src.autoOpenCerveau !== false,
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

  function isAutoOpenCerveauEnabled(profile) {
    return normalizeProfile(profile).autoOpenCerveau !== false;
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
      dialect: p.dialect,
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
    lines.push('- ' + languageInstruction(p));
    if (p.language === 'fr' && p.dialect === 'qc') {
      lines.push(
        '- Dialecte (critique)\u00a0: français québécois. Vocabulaire régional obligatoire quand un équivalent France existe ' +
          '(ex. «\u00a0sabler le plâtre\u00a0» pas «\u00a0poncer le plâtre\u00a0»; «\u00a0magasinage\u00a0» plutôt que «\u00a0shopping\u00a0» forcé; ' +
          '«\u00a0fin de semaine\u00a0» plutôt que «\u00a0week-end\u00a0» si naturel). Ne «\u00a0corrige\u00a0» pas vers le français de France.'
      );
    } else if (p.language === 'fr' && p.dialect === 'fr') {
      lines.push(
        '- Dialecte\u00a0: français de France (métropolitain). Vocabulaire standard de France.'
      );
    } else if (p.language === 'fr' && p.dialect === 'be') {
      lines.push('- Dialecte\u00a0: français de Belgique. Adapte les tournures belges quand c\'est naturel.');
    } else if (p.language === 'fr' && p.dialect === 'ch') {
      lines.push('- Dialecte\u00a0: français de Suisse. Adapte les tournures suisses quand c\'est naturel.');
    } else if (p.language === 'en' && p.dialect === 'uk') {
      lines.push('- Dialect: British English (UK spelling and wording).');
    } else if (p.language === 'en' && p.dialect === 'ca') {
      lines.push('- Dialect: Canadian English.');
    } else if (p.language === 'en') {
      lines.push('- Dialect: American English (US spelling and wording).');
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
      dbgLog('userProfile', 'load', { ok: false, reason: 'no-client' });
      return ensureAgentIdentity(emptyProfile()).profile;
    }
    try {
      var stored = await t.get('member', 'private', STORAGE_KEY);
      var profile = normalizeProfile(stored);
      var ensured = ensureAgentIdentity(profile);
      if (ensured.changed && typeof t.set === 'function') {
        try {
          var saved = await save(t, ensured.profile);
          dbgLog('userProfile', 'load', { ok: true, identityPersisted: true });
          return saved;
        } catch (persistErr) {
          dbgError('userProfile', 'load', persistErr);
          console.error('UserProfile identity persist failed', persistErr);
          return ensured.profile;
        }
      }
      dbgLog('userProfile', 'load', { ok: true });
      return ensured.profile;
    } catch (err) {
      dbgError('userProfile', 'load', err);
      console.error('UserProfile.load failed', err);
      return ensureAgentIdentity(emptyProfile()).profile;
    }
  }

  async function save(t, profile) {
    if (!t || typeof t.set !== 'function') {
      dbgLog('userProfile', 'save', { ok: false, reason: 'no-client' });
      throw new Error('UserProfile.save: t.set required');
    }
    var next = normalizeProfile(profile);
    next.updatedAt = new Date().toISOString();
    await t.set('member', 'private', STORAGE_KEY, next);
    dbgLog('userProfile', 'save', { ok: true });
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
    dbgLog('userProfile', 'reset', { ok: true });
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
    DIALECTS_BY_LANGUAGE: DIALECTS_BY_LANGUAGE,
    DEFAULT_DIALECT_BY_LANGUAGE: DEFAULT_DIALECT_BY_LANGUAGE,
    dialectsFor: dialectsFor,
    dialectKeysFor: dialectKeysFor,
    dialectLabelsFor: dialectLabelsFor,
    dialectLabel: dialectLabel,
    defaultDialectFor: defaultDialectFor,
    normalizeLanguage: normalizeLanguage,
    normalizeDialect: normalizeDialect,
    languageInstruction: languageInstruction,
    TIME_FORMAT_KEYS: TIME_FORMAT_KEYS,
    TIME_FORMAT_LABELS: TIME_FORMAT_LABELS,
    AGENT_STATUS_KEYS: AGENT_STATUS_KEYS,
    AGENT_STATUS_LABELS: AGENT_STATUS_LABELS,
    AGENT_COLOR_KEYS: AGENT_COLOR_KEYS,
    AGENT_COLOR_LABELS: AGENT_COLOR_LABELS,
    AGENT_COLOR_HEX: AGENT_COLOR_HEX,
    AGENT_COLOR_PALETTES: AGENT_COLOR_PALETTES,
    AGENT_COLOR_NAMES: AGENT_COLOR_NAMES,
    AGENT_FACE_KEYS: AGENT_FACE_KEYS,
    AGENT_FACE_LABELS: AGENT_FACE_LABELS,
    MAX_AGENT_NAME: MAX_AGENT_NAME,
    MAX_AGENT_PERSONALITY: MAX_AGENT_PERSONALITY,
    emptyProfile: emptyProfile,
    normalizeAgentStatus: normalizeAgentStatus,
    normalizeAgentColor: normalizeAgentColor,
    parseAgentHex: parseAgentHex,
    isCustomAgentColor: isCustomAgentColor,
    agentColorHex: agentColorHex,
    agentColorPalette: agentColorPalette,
    nearestAgentColorKey: nearestAgentColorKey,
    mountAgentColorPicker: mountAgentColorPicker,
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
    isAutoOpenCerveauEnabled: isAutoOpenCerveauEnabled,
    applyFeaturesToCard: applyFeaturesToCard,
    toAgentContext: toAgentContext,
    profilePromptLines: profilePromptLines,
    load: load,
    save: save,
    reset: reset
  };
})(typeof window !== 'undefined' ? window : this);
