/**
 * priority-ui: part 3 of 12 (priorityLerpRgb).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */

/**
 * priority-ui-color-schemes-due: part 1 of 2 (priorityLerpRgb).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui-color-schemes-due.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var COLOR_SCHEMES = S.COLOR_SCHEMES;
  var COLOR_SCHEME_STORAGE_KEY = S.COLOR_SCHEME_STORAGE_KEY;
  var DEFAULT_COLOR_SCHEME_KEY = S.DEFAULT_COLOR_SCHEME_KEY;
  var PRIORITY_TEXT_ON_DARK = S.PRIORITY_TEXT_ON_DARK;
  var SCORE_MAX = S.SCORE_MAX;
  var SECTION_COLLAPSE_KEYS = S.SECTION_COLLAPSE_KEYS;
  var SECTION_COLLAPSE_STORAGE_KEY = S.SECTION_COLLAPSE_STORAGE_KEY;
  var STATUT_EMBEDDED_DETAILS_STORAGE_KEY = S.STATUT_EMBEDDED_DETAILS_STORAGE_KEY;
  var TIER_I = S.TIER_I;
  var TIER_I_MAX = S.TIER_I_MAX;

  // from other parts (functions, resolved at call time)
  function findSubtaskById() { return S.findSubtaskById.apply(this, arguments); }
  function normalizeBlockedLink() { return S.normalizeBlockedLink.apply(this, arguments); }
  function formatDueCountdown() { return S.formatDueCountdown.apply(this, arguments); }
  function isDueEnabled() { return S.isDueEnabled.apply(this, arguments); }
  function lerpOklab() { return S.lerpOklab.apply(this, arguments); }
  function oklabToRgb() { return S.oklabToRgb.apply(this, arguments); }
  function priorityParseHex() { return S.priorityParseHex.apply(this, arguments); }
  function priorityRgbToHex() { return S.priorityRgbToHex.apply(this, arguments); }
  function rebuildTrelloBadgeColors() { return S.rebuildTrelloBadgeColors.apply(this, arguments); }

var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var COLOR_SCHEMES = S.COLOR_SCHEMES;
  var COLOR_SCHEME_STORAGE_KEY = S.COLOR_SCHEME_STORAGE_KEY;
  var DEFAULT_COLOR_SCHEME_KEY = S.DEFAULT_COLOR_SCHEME_KEY;
  var PRIORITY_TEXT_ON_DARK = S.PRIORITY_TEXT_ON_DARK;
  var SCORE_MAX = S.SCORE_MAX;
  var SECTION_COLLAPSE_KEYS = S.SECTION_COLLAPSE_KEYS;
  var SECTION_COLLAPSE_STORAGE_KEY = S.SECTION_COLLAPSE_STORAGE_KEY;
  var STATUT_EMBEDDED_DETAILS_STORAGE_KEY = S.STATUT_EMBEDDED_DETAILS_STORAGE_KEY;
  var TIER_I = S.TIER_I;
  var TIER_I_MAX = S.TIER_I_MAX;
  function formatDueCountdown() { return S.formatDueCountdown.apply(this, arguments); }
  function isDueEnabled() { return S.isDueEnabled.apply(this, arguments); }
  function lerpOklab() { return S.lerpOklab.apply(this, arguments); }
  function oklabToRgb() { return S.oklabToRgb.apply(this, arguments); }
  function priorityParseHex() { return S.priorityParseHex.apply(this, arguments); }
  function priorityRgbToHex() { return S.priorityRgbToHex.apply(this, arguments); }
  function rebuildTrelloBadgeColors() { return S.rebuildTrelloBadgeColors.apply(this, arguments); }

  function priorityLerpRgb(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t
    };
  }

  function priorityStopTForScore(score) {
    return Math.max(0, Math.min(S.activeColorStops.length - 1,
      (score / SCORE_MAX) * (S.activeColorStops.length - 1)));
  }

  function priorityStopTForTierIndex(tierI) {
    return Math.max(0, Math.min(S.activeColorStops.length - 1,
      ((TIER_I_MAX - tierI) / TIER_I_MAX) * (S.activeColorStops.length - 1)));
  }

  function priorityRgbAtStopT(stopT) {
    var maxIdx = S.activeOklabStops.length - 1;
    stopT = Math.max(0, Math.min(maxIdx, stopT));
    var lo = Math.floor(stopT);
    var hi = Math.min(lo + 1, maxIdx);
    var t = stopT - lo;
    return oklabToRgb(lerpOklab(S.activeOklabStops[lo], S.activeOklabStops[hi], t));
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
      ? S.activeTextOnLight
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
    /* Desaturate toward DN charcoal so heat accents stay status-like, not chrome. */
    var charcoal = { r: 143, g: 156, b: 171 };
    var softSeg = priorityLerpRgb(segRgb, charcoal, 0.42);
    var seg = priorityRgbToHex(priorityLerpRgb(softSeg, { r: 255, g: 255, b: 255 }, 0.18));
    var base = { r: 40, g: 46, b: 51 };
    return {
      seg: seg,
      fill: priorityRgbToHex(priorityLerpRgb(base, softSeg, 0.2)),
      text: PRIORITY_TEXT_ON_DARK,
      tint: priorityRgbToHex(base)
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

  S.TIERS = [];
  var TIERS_DARK = [];

  function rebuildTiersFromScheme() {
    S.TIERS.length = 0;
    TIERS_DARK.length = 0;
    TIER_DEFS.forEach(function (def) {
      var styles = priorityTierLightStyles(def.i);
      S.TIERS.push({
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
    // Presets use Impact / Facilité (0–10) + Empressement (0–4). No Urgence input.
    // Each preset's baseline score (impact*0.6 + ease*0.4 + empressement*0.75) is
    // chosen to land solidly inside its tier band, not just near the target.
    { i: TIER_I.OPTIONNELLE, target: 0.7, preset: { impact: 0, ease: 2, empressement: 0 } },
    { i: TIER_I.SECONDAIRE, target: 2.1, preset: { impact: 2, ease: 3, empressement: 0 } },
    { i: TIER_I.FLEXIBLE, target: 3.6, preset: { impact: 4, ease: 3, empressement: 0 } },
    { i: TIER_I.IMPORTANTE, target: 5.0, preset: { impact: 5, ease: 5, empressement: 0 } },
    { i: TIER_I.PRIORITAIRE, target: 6.5, preset: { impact: 7, ease: 4, empressement: 1 } },
    { i: TIER_I.URGENTE, target: 7.9, preset: { impact: 7, ease: 4, empressement: 3 } },
    { i: TIER_I.CRITIQUE, target: 9.3, preset: { impact: 10, ease: 8, empressement: 3 } }
  ];

  var HEAT_SEGMENTS = [];

  function rebuildHeatSegments() {
    HEAT_SEGMENTS.length = 0;
    HEAT_SEGMENT_DEFS.forEach(function (def) {
      var tierDef = TIER_DEFS[def.i];
      var tier = S.TIERS[def.i] || S.TIERS[TIER_I_MAX];
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
    S.activeColorSchemeKey = key;
    S.activeColorStops = scheme.stops.slice();
    S.activeOklabStops = scheme.oklabStops.slice();
    S.activeTextOnLight = scheme.textOnLight;
    rebuildColorDerivedState();
    return key;
  }

  function getActiveColorSchemeKey() {
    return S.activeColorSchemeKey;
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
  var BLOCKED_REASON_ADD_LABEL = 'Ajouter une cause de blocage';
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

  // exports
  S.BLOCKED_DESCRIPTION = BLOCKED_DESCRIPTION;
  S.BLOCKED_DISPLAY = BLOCKED_DISPLAY;
  S.BLOCKED_LABEL = BLOCKED_LABEL;
  S.BLOCKED_LINK_TYPE_SUBTASK = BLOCKED_LINK_TYPE_SUBTASK;
  S.BLOCKED_REASON_ADD_LABEL = BLOCKED_REASON_ADD_LABEL;
  S.BLOCKED_REASON_CLEAR_LABEL = BLOCKED_REASON_CLEAR_LABEL;
  S.BLOCKED_REASON_CORE_PRESETS = BLOCKED_REASON_CORE_PRESETS;
  S.BLOCKED_REASON_DONE_LABEL = BLOCKED_REASON_DONE_LABEL;
  S.BLOCKED_REASON_EDIT_LABEL = BLOCKED_REASON_EDIT_LABEL;
  S.BLOCKED_REASON_EMPTY_SUGGESTION_CAP = BLOCKED_REASON_EMPTY_SUGGESTION_CAP;
  S.BLOCKED_REASON_FILTER_SUGGESTION_CAP = BLOCKED_REASON_FILTER_SUGGESTION_CAP;
  S.BLOCKED_REASON_FREQ_STORAGE_KEY = BLOCKED_REASON_FREQ_STORAGE_KEY;
  S.BLOCKED_REASON_OPTIONS = BLOCKED_REASON_OPTIONS;
  S.BLOCKED_REASON_PLACEHOLDER = BLOCKED_REASON_PLACEHOLDER;
  S.BLOCKED_REASON_SUGGESTIONS_LABEL = BLOCKED_REASON_SUGGESTIONS_LABEL;
  S.BLOCKED_REASON_WAITING_OTHER_TASK = BLOCKED_REASON_WAITING_OTHER_TASK;
  S.BLOCKED_SUBTASK_CLEAR_LABEL = BLOCKED_SUBTASK_CLEAR_LABEL;
  S.BLOCKED_SUBTASK_EMPTY = BLOCKED_SUBTASK_EMPTY;
  S.BLOCKED_SUBTASK_FALLBACK_LABEL = BLOCKED_SUBTASK_FALLBACK_LABEL;
  S.BLOCKED_SUBTASK_PICKER_LABEL = BLOCKED_SUBTASK_PICKER_LABEL;
  S.BLOCKED_SYMBOL = BLOCKED_SYMBOL;
  S.BLOCKED_WAITING_ON_PREFIX = BLOCKED_WAITING_ON_PREFIX;
  S.HEAT_SEGMENTS = HEAT_SEGMENTS;
  S.HEAT_SEGMENT_DEFS = HEAT_SEGMENT_DEFS;
  S.INUTILE_EPS = INUTILE_EPS;
  S.INUTILE_LABEL = INUTILE_LABEL;
  S.INUTILE_STYLES = INUTILE_STYLES;
  S.INUTILE_STYLES_DARK = INUTILE_STYLES_DARK;
  S.SCORE_COLOR_STOPS = SCORE_COLOR_STOPS;
  S.SCORE_SURFACE_ALPHA = SCORE_SURFACE_ALPHA;
  S.SLIDER_ANIM_MS = SLIDER_ANIM_MS;
  S.SLIDER_STEP = SLIDER_STEP;
  S.SLIDER_STORAGE_KEY = SLIDER_STORAGE_KEY;
  S.TIERS_DARK = TIERS_DARK;
  S.TIER_DEFS = TIER_DEFS;
  S.TIER_LABEL_SHORT = TIER_LABEL_SHORT;
  S.URGENCY_TO_TB = URGENCY_TO_TB;
  S.applyColorScheme = applyColorScheme;
  S.blockedReasonFreqCount = blockedReasonFreqCount;
  S.blockedReasonStorageKey = blockedReasonStorageKey;
  S.bumpBlockedReasonFreq = bumpBlockedReasonFreq;
  S.compareBlockedReasonSuggestions = compareBlockedReasonSuggestions;
  S.createResponsiveTierLabelGroup = createResponsiveTierLabelGroup;
  S.elementLabelOverflows = elementLabelOverflows;
  S.formatBlockedWaitingOnLabel = formatBlockedWaitingOnLabel;
  S.getActiveColorSchemeKey = getActiveColorSchemeKey;
  S.isBlockedWaitingOtherTask = isBlockedWaitingOtherTask;
  S.isValidBlockedReason = isValidBlockedReason;
  S.loadBlockedReasonFreq = loadBlockedReasonFreq;
  S.loadSectionCollapseState = loadSectionCollapseState;
  S.loadStatutEmbeddedDetailsExpanded = loadStatutEmbeddedDetailsExpanded;
  S.loadStoredColorSchemeKey = loadStoredColorSchemeKey;
  S.normalizeBlockedReason = normalizeBlockedReason;
  S.normalizeBlockedReasons = normalizeBlockedReasons;
  S.normalizeColorSchemeKey = normalizeColorSchemeKey;
  S.priorityFillAtStopT = priorityFillAtStopT;
  S.priorityHexAtStopT = priorityHexAtStopT;
  S.priorityLerpRgb = priorityLerpRgb;
  S.priorityRelativeLuminance = priorityRelativeLuminance;
  S.priorityRgbAtStopT = priorityRgbAtStopT;
  S.priorityStopTForScore = priorityStopTForScore;
  S.priorityStopTForTierIndex = priorityStopTForTierIndex;
  S.priorityStylesForScore = priorityStylesForScore;
  S.priorityTextForFillHex = priorityTextForFillHex;
  S.priorityTierDarkStyles = priorityTierDarkStyles;
  S.priorityTierLightStyles = priorityTierLightStyles;
  S.rankBlockedReasonSuggestions = rankBlockedReasonSuggestions;
  S.rebuildColorDerivedState = rebuildColorDerivedState;
  S.rebuildHeatSegments = rebuildHeatSegments;
  S.rebuildScoreColorStops = rebuildScoreColorStops;
  S.rebuildTiersFromScheme = rebuildTiersFromScheme;
  S.resolveBlockedLinkLabel = resolveBlockedLinkLabel;
  S.resolveSectionExpanded = resolveSectionExpanded;
  S.saveBlockedReasonFreq = saveBlockedReasonFreq;
  S.saveSectionCollapseState = saveSectionCollapseState;
  S.saveStatutEmbeddedDetailsExpanded = saveStatutEmbeddedDetailsExpanded;
  S.saveStoredColorSchemeKey = saveStoredColorSchemeKey;
  S.scoreColorStopValues = scoreColorStopValues;
  S.scoreToRgb = scoreToRgb;
  S.scoreToRgba = scoreToRgba;
  S.shortTierLabel = shortTierLabel;
  S.tierLabelForSpace = tierLabelForSpace;
})(typeof window !== 'undefined' ? window : this);
