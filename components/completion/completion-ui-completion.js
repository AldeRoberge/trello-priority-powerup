/**
 * Completion popup UI — subtask list, progress sliders, estimate chrome.
 * Exposes window.CompletionUI (mountCompletionUI + color helpers).
 *
 * Role: DOM for the Progrès section. Persistence / aggregation live in
 * CompletionTrello. Colors mirror PriorityUI’s OKLab approach (traffic /
 * custom gradients). Celebrations go through CelebrationEffects.
 *
 * Table of contents
 * ─────────────────
 *  1. OKLab / completion color schemes + localStorage persistence
 *  2. Encouragement bubble, fader HUD, slider track painting
 *  3. Celebration hooks (all-complete, subtask pop)
 *  4. mountCompletionUI — list, master slider, suggestions, estimates
 *  5. Item progress / blocked / linked-card interactions
 *  6. AI suggestion chips (suggestSubtasks bridge)
 *  7. CompletionUI public API
 */

/**
 * completion-ui: part 1 of 3 (completion).
 * Names are shared with the other parts through window.CompletionUiParts (see completion-ui.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.CompletionUiParts = global.CompletionUiParts || {});

var S = (global.CompletionUiParts = global.CompletionUiParts || {});

  var COMPLETION_SCHEME_STORAGE_KEY = 'trello-priority-powerup/completion-color-scheme';
  var COMPLETION_GRADIENT_STORAGE_KEY = 'trello-priority-powerup/completion-color-gradient';
  var DEFAULT_COMPLETION_SCHEME_KEY = 'traffic';
  var CUSTOM_COMPLETION_SCHEME_KEY = 'custom';
  var MIN_GRADIENT_STOPS = 2;
  var MAX_GRADIENT_STOPS = 8;
  // CSS ::after caret is at left:14px, 10px wide → tip center ≈ 19px from bubble left.
  var ENCOURAGEMENT_BUBBLE_CARET_X = 19;
  var ENCOURAGEMENT_BUBBLE_OFFSET_Y = 12;

  // ── 1. OKLab / completion color schemes ─────────────────────────────────

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
      return rgbToHex(oklabToRgb(lab));
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

  function parseHex(hex) {
    var h = String(hex).replace('#', '');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function rgbToHex(rgb) {
    function byte(n) {
      var s = Math.max(0, Math.min(255, Math.round(n))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return '#' + byte(rgb.r) + byte(rgb.g) + byte(rgb.b);
  }

  function normalizeHexColor(hex, fallback) {
    var raw = String(hex == null ? '' : hex).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(raw)) return ('#' + raw).toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      return (
        '#' +
        raw[1] + raw[1] +
        raw[2] + raw[2] +
        raw[3] + raw[3]
      ).toLowerCase();
    }
    return fallback || '#b3bac5';
  }

  function cloneGradientStops(stops) {
    return (stops || []).map(function (stop) {
      return {
        p: Math.max(0, Math.min(100, Number(stop.p) || 0)),
        color: normalizeHexColor(stop.color || stop.c, '#b3bac5')
      };
    });
  }

  function sortGradientStops(stops) {
    return cloneGradientStops(stops).sort(function (a, b) {
      return a.p - b.p;
    });
  }

  function normalizeGradientStops(stops) {
    var next = sortGradientStops(stops);
    if (!next.length) {
      return [
        { p: 0, color: '#b3bac5' },
        { p: 100, color: '#2d8f4e' }
      ];
    }
    if (next.length === 1) {
      next.push({ p: 100, color: next[0].color });
    }
    if (next.length > MAX_GRADIENT_STOPS) {
      next = next.slice(0, MAX_GRADIENT_STOPS);
    }
    // Keep a usable span: pin extremes if everything collapsed.
    if (next[0].p > 0) next[0].p = 0;
    if (next[next.length - 1].p < 100) next[next.length - 1].p = 100;
    // Nudge duplicate positions slightly so interpolation stays stable.
    for (var i = 1; i < next.length; i++) {
      if (next[i].p <= next[i - 1].p) {
        next[i].p = Math.min(100, next[i - 1].p + 0.5);
      }
    }
    next[next.length - 1].p = 100;
    return next;
  }

  /** Even hex list → positioned stops (last stop locked at 100 % for a hard complete snap). */
  function positionedStopsFromHex(hexStops) {
    var hexes = (hexStops || []).map(function (h) {
      return normalizeHexColor(h, '#b3bac5');
    });
    if (hexes.length < 2) {
      return normalizeGradientStops([
        { p: 0, color: hexes[0] || '#b3bac5' },
        { p: 100, color: hexes[0] || '#2d8f4e' }
      ]);
    }
    var maxMid = hexes.length - 2;
    var out = [];
    for (var i = 0; i < hexes.length; i++) {
      var p = i === hexes.length - 1 ? 100 : maxMid <= 0 ? 0 : (i / maxMid) * 99;
      out.push({ p: p, color: hexes[i] });
    }
    return normalizeGradientStops(out);
  }

  function buildCompletionScheme(key, label, oklchStops) {
    var stops = oklchStopsToHex(oklchStops);
    var gradientStops = positionedStopsFromHex(stops);
    return {
      key: key,
      label: label,
      oklchStops: oklchStops,
      oklabStops: oklchStopsToOklab(oklchStops),
      stops: stops,
      gradientStops: gradientStops
    };
  }

  // Named OKLCH stops [L, C, H] for progress ramps (0 % → 100 %).
  var PROGRESS_OKLCH = {
    GRAY: [0.720, 0.014, 250],
    GRAY_SOFT: [0.740, 0.010, 250],
    GRAY_BLUE: [0.680, 0.045, 248],
    BLUE: [0.600, 0.130, 245],
    BLUE_DEEP: [0.520, 0.145, 255],
    BLUE_SKY: [0.720, 0.110, 230],
    TEAL: [0.640, 0.120, 195],
    MINT: [0.760, 0.110, 168],
    CYAN: [0.700, 0.120, 205],
    ORANGE: [0.720, 0.145, 55],
    AMBER: [0.780, 0.130, 75],
    RED_SOFT: [0.680, 0.140, 25],
    BLUE_GREEN: [0.640, 0.115, 178],
    GREEN: [0.590, 0.155, 148],
    GREEN_MUTED: [0.560, 0.085, 155],
    SLATE: [0.620, 0.020, 250],
    CHARCOAL: [0.480, 0.015, 250]
  };

  // Distinct preset ramps (visually different paths to green).
  var COMPLETION_COLOR_SCHEMES = {
    traffic: buildCompletionScheme('traffic', 'Classique', [
      PROGRESS_OKLCH.GRAY,
      PROGRESS_OKLCH.GRAY_BLUE,
      PROGRESS_OKLCH.BLUE,
      PROGRESS_OKLCH.BLUE_GREEN,
      PROGRESS_OKLCH.GREEN
    ]),
    mint: buildCompletionScheme('mint', 'Menthe fraîche', [
      PROGRESS_OKLCH.GRAY_SOFT,
      PROGRESS_OKLCH.CYAN,
      PROGRESS_OKLCH.TEAL,
      PROGRESS_OKLCH.MINT,
      PROGRESS_OKLCH.GREEN
    ]),
    ocean: buildCompletionScheme('ocean', 'Océan', [
      PROGRESS_OKLCH.CHARCOAL,
      PROGRESS_OKLCH.BLUE_DEEP,
      PROGRESS_OKLCH.BLUE,
      PROGRESS_OKLCH.TEAL,
      PROGRESS_OKLCH.GREEN
    ]),
    sunset: buildCompletionScheme('sunset', 'Horizon', [
      PROGRESS_OKLCH.RED_SOFT,
      PROGRESS_OKLCH.ORANGE,
      PROGRESS_OKLCH.AMBER,
      PROGRESS_OKLCH.MINT,
      PROGRESS_OKLCH.GREEN
    ]),
    monochrome: buildCompletionScheme('monochrome', 'Monochrome', [
      PROGRESS_OKLCH.GRAY_SOFT,
      PROGRESS_OKLCH.SLATE,
      PROGRESS_OKLCH.CHARCOAL,
      [0.540, 0.040, 160],
      PROGRESS_OKLCH.GREEN_MUTED
    ])
  };

  var COMPLETION_SCHEME_OPTIONS = ['traffic', 'mint', 'ocean', 'sunset', 'monochrome'].map(function (key) {
    return { key: key, label: COMPLETION_COLOR_SCHEMES[key].label };
  });

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

  var activeCompletionSchemeKey = DEFAULT_COMPLETION_SCHEME_KEY;
  S.activeGradientStops = cloneGradientStops(
    COMPLETION_COLOR_SCHEMES.traffic.gradientStops
  );

  function isPresetCompletionSchemeKey(key) {
    return !!(key && COMPLETION_COLOR_SCHEMES[key]);
  }

  function normalizeCompletionSchemeKey(key) {
    if (key === CUSTOM_COMPLETION_SCHEME_KEY) return CUSTOM_COMPLETION_SCHEME_KEY;
    return isPresetCompletionSchemeKey(key) ? key : DEFAULT_COMPLETION_SCHEME_KEY;
  }

  function gradientStopsForScheme(schemeKey) {
    var key = normalizeCompletionSchemeKey(schemeKey);
    if (key === CUSTOM_COMPLETION_SCHEME_KEY) {
      return normalizeGradientStops(S.activeGradientStops);
    }
    return cloneGradientStops(COMPLETION_COLOR_SCHEMES[key].gradientStops);
  }

  function rgbFromGradientStops(percent, stops) {
    var list = normalizeGradientStops(stops || S.activeGradientStops);
    var pct = Math.max(0, Math.min(100, Number(percent) || 0));
    if (pct <= list[0].p) return parseHex(list[0].color);
    if (pct >= list[list.length - 1].p) return parseHex(list[list.length - 1].color);
    for (var i = 0; i < list.length - 1; i++) {
      var a = list[i];
      var b = list[i + 1];
      if (pct >= a.p && pct <= b.p) {
        var span = b.p - a.p;
        var t = span <= 0 ? 0 : (pct - a.p) / span;
        return oklabToRgb(
          lerpOklab(rgbToOklab(parseHex(a.color)), rgbToOklab(parseHex(b.color)), t)
        );
      }
    }
    return parseHex(list[list.length - 1].color);
  }

  function rgbAtProgress(percent, schemeKey) {
    if (schemeKey && isPresetCompletionSchemeKey(schemeKey)) {
      return rgbFromGradientStops(percent, COMPLETION_COLOR_SCHEMES[schemeKey].gradientStops);
    }
    return rgbFromGradientStops(percent, S.activeGradientStops);
  }

  function colorAtProgress(schemeKey, percent) {
    return rgbToHex(rgbAtProgress(percent, schemeKey));
  }

  function completionColorForProgress(percent) {
    if (percentIsComplete(percent)) {
      return rgbToHex(rgbFromGradientStops(100, S.activeGradientStops));
    }
    return rgbToHex(rgbFromGradientStops(percent, S.activeGradientStops));
  }

  function completionColorForEstimate(/* minutes */) {
    // Estimate chips stay muted gray; duration accents are unused.
    return '';
  }

  function nearestTrelloBadgeColorName(hex) {
    var target = rgbToOklab(parseHex(hex));
    var ranked = TRELLO_BADGE_COLOR_NAMES.map(function (name) {
      return {
        name: name,
        dist: oklabDistance(target, rgbToOklab(parseHex(TRELLO_BADGE_COLOR_HEX[name])))
      };
    }).sort(function (a, b) {
      return a.dist - b.dist;
    });
    return ranked[0].name;
  }

  function percentIsComplete(percent) {
    return Math.round(percent) >= 100;
  }

  function completionTrelloBadgeColor(percent) {
    if (percentIsComplete(percent)) return 'green';
    if (!percent || percent <= 0) return 'light-gray';
    return nearestTrelloBadgeColorName(completionColorForProgress(percent));
  }

  function applyCompletionGradient(stops, schemeKey) {
    S.activeGradientStops = normalizeGradientStops(stops);
    if (schemeKey === CUSTOM_COMPLETION_SCHEME_KEY) {
      activeCompletionSchemeKey = CUSTOM_COMPLETION_SCHEME_KEY;
    } else if (isPresetCompletionSchemeKey(schemeKey)) {
      activeCompletionSchemeKey = schemeKey;
    } else {
      activeCompletionSchemeKey = CUSTOM_COMPLETION_SCHEME_KEY;
    }
    return getActiveCompletionGradient();
  }

  function applyCompletionColorScheme(schemeKey) {
    var key = normalizeCompletionSchemeKey(schemeKey);
    if (key === CUSTOM_COMPLETION_SCHEME_KEY) {
      activeCompletionSchemeKey = CUSTOM_COMPLETION_SCHEME_KEY;
      S.activeGradientStops = normalizeGradientStops(S.activeGradientStops);
      return key;
    }
    var scheme = COMPLETION_COLOR_SCHEMES[key];
    activeCompletionSchemeKey = key;
    S.activeGradientStops = cloneGradientStops(scheme.gradientStops);
    return key;
  }

  function getActiveCompletionSchemeKey() {
    return activeCompletionSchemeKey;
  }

  function getActiveCompletionGradient() {
    return cloneGradientStops(S.activeGradientStops);
  }

  function loadStoredCompletionSchemeKey() {
    try {
      if (typeof localStorage === 'undefined') return null;
      var raw = localStorage.getItem(COMPLETION_SCHEME_STORAGE_KEY);
      if (!raw) return null;
      if (raw === CUSTOM_COMPLETION_SCHEME_KEY) return CUSTOM_COMPLETION_SCHEME_KEY;
      return isPresetCompletionSchemeKey(raw) ? raw : null;
    } catch (e) { return null; }
  }

  function saveStoredCompletionSchemeKey(key) {
    try {
      if (typeof localStorage === 'undefined') return;
      var normalized = normalizeCompletionSchemeKey(key);
      localStorage.setItem(COMPLETION_SCHEME_STORAGE_KEY, normalized);
    } catch (e) { /* ignore quota / private mode */ }
  }

  function loadStoredCompletionGradient() {
    try {
      if (typeof localStorage === 'undefined') return null;
      var raw = localStorage.getItem(COMPLETION_GRADIENT_STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return null;
      return normalizeGradientStops(parsed);
    } catch (e) { return null; }
  }

  function saveStoredCompletionGradient(stops) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(
        COMPLETION_GRADIENT_STORAGE_KEY,
        JSON.stringify(normalizeGradientStops(stops))
      );
    } catch (e) { /* ignore quota / private mode */ }
  }

  function gradientCssFromStops(stops) {
    var list = normalizeGradientStops(stops);
    var parts = list.map(function (stop) {
      return stop.color + ' ' + (Math.round(stop.p * 10) / 10) + '%';
    });
    return 'linear-gradient(90deg,' + parts.join(',') + ')';
  }

  function schemeGradientCss(schemeKey) {
    if (schemeKey === CUSTOM_COMPLETION_SCHEME_KEY || !schemeKey) {
      return gradientCssFromStops(S.activeGradientStops);
    }
    return gradientCssFromStops(gradientStopsForScheme(schemeKey));
  }

  applyCompletionColorScheme(DEFAULT_COMPLETION_SCHEME_KEY);

  function getCompletionTrello() {
    return global.CompletionTrello;
  }

  // Stage icons sit in a circle. Color follows the progress scheme (same as %).
  var COMPLETION_ENCOURAGEMENT_TIERS = [
    { max: 0, text: 'Pas commenc\u00e9', icon: 'ti-player-pause', tone: 'idle' },
    { max: 10, text: 'Amorc\u00e9e', icon: 'ti-player-play', tone: 'active' },
    { max: 25, text: 'D\u00e9but\u00e9', icon: 'ti-player-play', tone: 'active' },
    { max: 50, text: 'En cours', icon: 'ti-player-play', tone: 'active' },
    { max: 75, text: 'Bon progr\u00e8s', icon: 'ti-player-play', tone: 'active' },
    { max: 90, text: 'Bien avanc\u00e9', icon: 'ti-player-skip-forward', tone: 'near' },
    { max: 99, text: 'Bient\u00f4t termin\u00e9', icon: 'ti-player-skip-forward', tone: 'near' },
    { max: 100, text: 'Termin\u00e9', icon: 'ti-check', tone: 'done' },
  ];

  function progressEncouragementMeta(percent) {
    var p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    for (var i = 0; i < COMPLETION_ENCOURAGEMENT_TIERS.length; i++) {
      if (p <= COMPLETION_ENCOURAGEMENT_TIERS[i].max) {
        return COMPLETION_ENCOURAGEMENT_TIERS[i];
      }
    }
    return COMPLETION_ENCOURAGEMENT_TIERS[COMPLETION_ENCOURAGEMENT_TIERS.length - 1];
  }

  function progressEncouragementTierIndex(percent) {
    var p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    for (var i = 0; i < COMPLETION_ENCOURAGEMENT_TIERS.length; i++) {
      if (p <= COMPLETION_ENCOURAGEMENT_TIERS[i].max) return i;
    }
    return COMPLETION_ENCOURAGEMENT_TIERS.length - 1;
  }

  function progressEncouragementText(percent) {
    return progressEncouragementMeta(percent).text;
  }

  function applyProgressEncouragement(el, percent) {
    if (!el) return;
    var meta = progressEncouragementMeta(percent);
    var p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (el.dataset) {
      el.dataset.tone = meta.tone;
      el.dataset.percent = String(p);
    }
    if (el.classList && typeof el.classList.toggle === 'function') {
      el.classList.toggle('is-complete', meta.tone === 'done');
    }
    // Match % / bar accent from the active completion color scheme.
    if (el.style) {
      el.style.color = p > 0 ? completionColorForProgress(p) : '';
    }
    // Live % first so the bubble visibly updates on every scrub tick (stage
    // labels only change at coarse thresholds like 26–50 → « En cours »).
    el.innerHTML =
      '<span class="tp-completion-stage-icon" aria-hidden="true">' +
      '<i class="ti ' +
      meta.icon +
      '"></i>' +
      '</span>' +
      '<span class="tp-completion-stage-text">' +
      '<span class="tp-completion-stage-pct">' +
      p +
      '\u00a0%</span>' +
      '<span class="tp-completion-stage-label">' +
      meta.text +
      '</span>' +
      '</span>';
  }

  function positionEncouragementBubble(el, clientX, clientY) {
    if (!el || clientX == null || clientY == null) return;
    var x = Number(clientX);
    var y = Number(clientY);
    if (!isFinite(x) || !isFinite(y)) return;
    // Place caret tip under the cursor; CSS translateY(-100%) keeps the bubble above it.
    el.style.left = Math.round(x - ENCOURAGEMENT_BUBBLE_CARET_X) + 'px';
    el.style.top = Math.round(y - ENCOURAGEMENT_BUBBLE_OFFSET_Y) + 'px';
  }

  function applySliderProgressTrack(input, percent, opts) {
    if (!input) return;
    opts = opts || {};
    var p = Math.max(0, Math.min(100, Number(percent) || 0));
    var blocked = !!opts.blocked;
    var color = blocked
      ? 'color-mix(in srgb, var(--tp-text-muted) 35%, var(--tp-border))'
      : completionColorForProgress(p);
    input.style.setProperty('--completion-pct', p + '%');
    input.style.setProperty('--completion-fill', color);
    input.style.setProperty('--completion-accent', color);
    input.classList.toggle('is-complete', p >= 100);
    input.classList.toggle('is-blocked', blocked);
  }

  var lastProgressEncouragementTier = null;

  function playSliderProgressTick(percent) {
    var p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    var tier = progressEncouragementTierIndex(p);
    var prev = lastProgressEncouragementTier;
    var milestone = prev != null && tier !== prev;
    lastProgressEncouragementTier = tier;
    try {
      if (
        milestone &&
        global.CelebrationEffects &&
        typeof global.CelebrationEffects.playProgressMilestone === 'function'
      ) {
        global.CelebrationEffects.playProgressMilestone(p, {
          tier: tier,
          direction: tier < prev ? 'down' : 'up',
        });
        return;
      }
      if (
        global.CelebrationEffects &&
        typeof global.CelebrationEffects.playProgressTick === 'function'
      ) {
        global.CelebrationEffects.playProgressTick(p);
      }
    } catch (e) {
      /* ignore audio failures */
    }
  }

  function resetSliderProgressSoundTier(percent) {
    lastProgressEncouragementTier =
      percent == null ? null : progressEncouragementTierIndex(percent);
  }

  function playCompletionUiSound(name) {
    try {
      if (
        global.CelebrationEffects &&
        typeof global.CelebrationEffects.playUiSound === 'function'
      ) {
        global.CelebrationEffects.playUiSound(name);
      }
    } catch (e) {
      /* ignore audio failures */
    }
  }

  /** Ableton-style vertical fader: ~2px per 1% (200px full travel). */
  var FADER_LONG_PRESS_MS = 280;
  var FADER_PIXELS_PER_PERCENT = 2;
  var FADER_MOVE_CANCEL_PX = 8;
  var FADER_FINE_SCALE = 4;

  /**
   * Map vertical pointer delta to progress. Drag up (clientY decreases) raises %.
   * Hold Shift/Alt for finer scrubbing (FADER_FINE_SCALE×).
   */
  function progressFromFaderDelta(startProgress, startY, clientY, opts) {
    opts = opts || {};
    var px =
      typeof opts.pixelsPerPercent === 'number' && opts.pixelsPerPercent > 0
        ? opts.pixelsPerPercent
        : FADER_PIXELS_PER_PERCENT;
    if (opts.fine) px *= FADER_FINE_SCALE;
    var start =
      typeof startProgress === 'number' && isFinite(startProgress)
        ? startProgress
        : 0;
    var delta = (startY - clientY) / px;
    var next = Math.round(start + delta);
    if (next < 0) return 0;
    if (next > 100) return 100;
    return next;
  }

  function ensureFaderHud(anchorEl) {
    if (!anchorEl) return null;
    var host =
      anchorEl.classList &&
      typeof anchorEl.classList.contains === 'function' &&
      anchorEl.classList.contains('tp-completion-check-wrap')
        ? anchorEl
        : anchorEl.parentNode;
    if (!host) return null;
    var existing =
      typeof host.querySelector === 'function'
        ? host.querySelector('.tp-completion-fader-hud')
        : null;
    if (existing) return existing;
    var hud = document.createElement('span');
    hud.className = 'tp-completion-fader-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.hidden = true;
    host.appendChild(hud);
    return hud;
  }

  function updateFaderHud(hud, percent) {
    if (!hud) return;
    hud.textContent = Math.round(percent) + '\u00a0%';
    hud.hidden = false;
  }

  function hideFaderHud(hud) {
    if (!hud) return;
    hud.hidden = true;
  }

  /**
   * Long-press then drag vertically to scrub 0–100% (Ableton fader).
   * Short click still fires the element's normal click handler unless a fader
   * session armed or the press was cancelled by early movement.
   *
   * opts.getProgress(): number
   * opts.setProgress(percent, meta): void — meta.dragging / meta.commit
   * opts.isEnabled?: () => boolean
   * opts.visualEls?: HTMLElement[] — extra nodes to toggle .is-fading on
   * opts.hudAnchor?: HTMLElement — where to dock the % HUD (defaults to el)
   */
  function bindProgressFader(el, opts) {
    if (!el || !opts || typeof opts.getProgress !== 'function') return;
    if (typeof opts.setProgress !== 'function') return;

    var longPressMs =
      typeof opts.longPressMs === 'number' && opts.longPressMs >= 0
        ? opts.longPressMs
        : FADER_LONG_PRESS_MS;
    var pixelsPerPercent =
      typeof opts.pixelsPerPercent === 'number' && opts.pixelsPerPercent > 0
        ? opts.pixelsPerPercent
        : FADER_PIXELS_PER_PERCENT;

    var session = null;
    var suppressClick = false;
    var hud = null;

    function visualTargets() {
      var list = [el];
      if (opts.visualEls && opts.visualEls.length) {
        for (var i = 0; i < opts.visualEls.length; i++) {
          if (opts.visualEls[i] && list.indexOf(opts.visualEls[i]) === -1) {
            list.push(opts.visualEls[i]);
          }
        }
      }
      return list;
    }

    function setFading(active) {
      var targets = visualTargets();
      for (var i = 0; i < targets.length; i++) {
        targets[i].classList.toggle('is-fading', active);
      }
    }

    function enabled() {
      if (typeof opts.isEnabled === 'function') {
        try {
          return !!opts.isEnabled();
        } catch (err) {
          return false;
        }
      }
      return !el.disabled;
    }

    function clearArmTimer() {
      if (session && session.timer != null) {
        clearTimeout(session.timer);
        session.timer = null;
      }
    }

    function armFader() {
      if (!session || session.armed) return;
      session.armed = true;
      session.lastProgress = session.startProgress;
      setFading(true);
      hud = ensureFaderHud(opts.hudAnchor || el);
      updateFaderHud(hud, session.startProgress);
      try {
        el.setPointerCapture(session.pointerId);
      } catch (err) {
        /* ignore — some environments lack capture */
      }
      try {
        if (typeof el.setAttribute === 'function') {
          el.setAttribute('aria-valuenow', String(session.startProgress));
        }
      } catch (err2) {
        /* ignore */
      }
    }

    function applySessionProgress(clientY, fine, commit) {
      if (!session) return;
      var next = progressFromFaderDelta(
        session.startProgress,
        session.startY,
        clientY,
        { pixelsPerPercent: pixelsPerPercent, fine: fine }
      );
      if (!commit && next === session.lastProgress) return;
      session.lastProgress = next;
      updateFaderHud(hud, next);
      opts.setProgress(next, {
        dragging: !commit,
        commit: !!commit,
        startProgress: session.startProgress,
      });
      try {
        if (typeof el.setAttribute === 'function') {
          el.setAttribute('aria-valuenow', String(next));
        }
      } catch (err) {
        /* ignore */
      }
    }

    function endSession(e, commit) {
      if (!session) return;
      var wasArmed = session.armed;
      var pointerId = session.pointerId;
      clearArmTimer();
      if (wasArmed && e && typeof e.clientY === 'number') {
        applySessionProgress(
          e.clientY,
          !!(e.shiftKey || e.altKey),
          !!commit
        );
      } else if (wasArmed && commit) {
        opts.setProgress(session.lastProgress, {
          dragging: false,
          commit: true,
          startProgress: session.startProgress,
        });
      }
      setFading(false);
      hideFaderHud(hud);
      hud = null;
      try {
        if (wasArmed && typeof el.releasePointerCapture === 'function') {
          el.releasePointerCapture(pointerId);
        }
      } catch (err) {
        /* ignore */
      }
      if (wasArmed || session.cancelled) suppressClick = true;
      session = null;
    }

    el.addEventListener(
      'click',
      function (e) {
        if (!suppressClick) return;
        suppressClick = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      true
    );

    el.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      if (e.pointerType === 'mouse' && e.buttons !== 1) return;
      if (!enabled()) return;
      if (session) endSession(null, false);
      suppressClick = false;
      var startProgress = 0;
      try {
        startProgress = opts.getProgress();
      } catch (err) {
        return;
      }
      if (typeof startProgress !== 'number' || !isFinite(startProgress)) {
        startProgress = 0;
      }
      session = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startProgress: startProgress,
        lastProgress: startProgress,
        armed: false,
        cancelled: false,
        timer: null,
      };
      session.timer = setTimeout(function () {
        if (!session) return;
        armFader();
      }, longPressMs);
    });

    el.addEventListener('pointermove', function (e) {
      if (!session || session.pointerId !== e.pointerId) return;
      if (!session.armed) {
        var dx = e.clientX - session.startX;
        var dy = e.clientY - session.startY;
        if (dx * dx + dy * dy > FADER_MOVE_CANCEL_PX * FADER_MOVE_CANCEL_PX) {
          clearArmTimer();
          session.cancelled = true;
          suppressClick = true;
          session = null;
        }
        return;
      }
      e.preventDefault();
      applySessionProgress(e.clientY, !!(e.shiftKey || e.altKey), false);
    });

    function onPointerEnd(e) {
      if (!session || session.pointerId !== e.pointerId) return;
      endSession(e, true);
    }

    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', function (e) {
      if (!session || session.pointerId !== e.pointerId) return;
      endSession(e, true);
    });

    el.addEventListener('lostpointercapture', function () {
      if (!session || !session.armed) return;
      endSession(null, true);
    });
  }

  function createProgressSlider(label, value, onInput, id) {
    var field = document.createElement('div');
    field.className = 'tp-completion-field';

    var fieldHead = document.createElement('div');
    fieldHead.className = 'tp-completion-field-head';

    var lbl = document.createElement('span');
    lbl.className = 'tp-completion-field-lbl';
    lbl.textContent = label;

    var sliderWrap = document.createElement('div');
    sliderWrap.className = 'field-slider';

    var input = document.createElement('input');
    input.type = 'range';
    input.className = 'field-range tp-completion-progress-slider';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = String(value);
    if (id) input.id = id;
    input.setAttribute('aria-label', label);

    var valEl = document.createElement('span');
    valEl.className = 'tp-completion-field-val';
    valEl.setAttribute('aria-live', 'polite');

    function updateVal(v) {
      valEl.textContent = v + '\u00a0%';
      applySliderProgressTrack(input, v);
    }

    function handleInput() {
      var v = Number(input.value);
      updateVal(v);
      playSliderProgressTick(v);
      onInput(v);
    }

    input.addEventListener('input', handleInput);
    input.addEventListener('change', handleInput);

    sliderWrap.appendChild(input);
    fieldHead.appendChild(lbl);
    fieldHead.appendChild(sliderWrap);
    fieldHead.appendChild(valEl);
    field.appendChild(fieldHead);

    updateVal(value);

    return {
      el: field,
      input: input,
      valEl: valEl,
      setValue: function (v) {
        input.value = String(v);
        updateVal(v);
      },
    };
  }

  var FLIP_MS = 380;
  var FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
  var SHOW_DONE_STORAGE_KEY = 'trello-priority-powerup/completion-show-done';
  var FILTER_THRESHOLD = 5;

  function prefersReducedMotion() {
    try {
      return !!(
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch (e) {
      return false;
    }
  }

  var FIREWORKS_ID = 'tp-completion-fireworks';

  function clearAllCompleteCelebration(rootEl) {
    try {
      var root = rootEl || (typeof document !== 'undefined' ? document.body : null);
      if (
        global.CelebrationEffects &&
        typeof global.CelebrationEffects.clear === 'function'
      ) {
        global.CelebrationEffects.clear(root);
      }
      if (!root) return;
      var existing = root.querySelector ? root.querySelector('#' + FIREWORKS_ID) : null;
      if (!existing && typeof document !== 'undefined') {
        existing = document.getElementById(FIREWORKS_ID);
      }
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    } catch (e) { /* ignore */ }
  }

  function playAllCompleteCelebration(rootEl) {
    var root = rootEl || (typeof document !== 'undefined' ? document.body : null);
    if (
      global.CelebrationEffects &&
      typeof global.CelebrationEffects.play === 'function'
    ) {
      global.CelebrationEffects.play('fireworks', { root: root, sound: true });
      return;
    }
    if (prefersReducedMotion()) return;
    if (typeof document === 'undefined') return;
    if (!root || !root.appendChild) return;
    clearAllCompleteCelebration(root);
    var overlay = document.createElement('div');
    overlay.id = FIREWORKS_ID;
    overlay.className = 'tp-completion-fireworks';
    overlay.setAttribute('aria-hidden', 'true');
    root.appendChild(overlay);
    setTimeout(function () {
      clearAllCompleteCelebration(root);
    }, 1900);
  }

  /**
   * Small fireworks-style pop when a single subtask is marked done.
   * @param {Element|{x:number,y:number}|null} anchor
   * @param {{ sound?: boolean }} [opts]
   */
  function playSubtaskCompletePop(anchor, opts) {
    opts = opts || {};
    try {
      if (
        global.CelebrationEffects &&
        typeof global.CelebrationEffects.playSubtaskPop === 'function'
      ) {
        global.CelebrationEffects.playSubtaskPop(anchor, {
          sound: opts.sound !== false,
          root: opts.root || (typeof document !== 'undefined' ? document.body : null)
        });
      }
    } catch (e) {
      /* ignore celebration failures */
    }
  }

  function isAllCompleteProgress(progress) {
    return !!(progress && percentIsComplete(progress.percent));
  }

  function loadShowDonePreference() {
    try {
      if (typeof sessionStorage === 'undefined') return false;
      return sessionStorage.getItem(SHOW_DONE_STORAGE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function saveShowDonePreference(show) {
    try {
      if (typeof sessionStorage === 'undefined') return;
      sessionStorage.setItem(SHOW_DONE_STORAGE_KEY, show ? '1' : '0');
    } catch (e) { /* ignore quota / private mode */ }
  }

  function durationTicks() {
    var CT = getCompletionTrello();
    if (CT && typeof CT.getEstimateScaleTicks === 'function') {
      return CT.getEstimateScaleTicks('time');
    }
    if (CT && Array.isArray(CT.ESTIMATE_TIME_TICKS) && CT.ESTIMATE_TIME_TICKS.length) {
      return CT.ESTIMATE_TIME_TICKS.slice();
    }
    return [
      { label: 'Quelques minutes', minutes: 15, icon: 'bolt', color: '#61BD4F' },
      { label: 'Une heure', minutes: 60, icon: 'clock', color: '#7BC86C' },
      {
        label: 'Quelques heures',
        minutes: 3 * 60,
        icon: 'clock-2',
        color: '#B5D033',
      },
      { label: 'Un jour', minutes: 24 * 60, icon: 'sun', color: '#F2D600' },
      {
        label: 'Quelques jours',
        minutes: 3 * 24 * 60,
        icon: 'calendar',
        color: '#FFAF3F',
      },
      {
        label: 'Une semaine',
        minutes: 7 * 24 * 60,
        icon: 'calendar-week',
        color: '#FF9F1A',
      },
      {
        label: 'Plusieurs semaines',
        minutes: 3 * 7 * 24 * 60,
        icon: 'calendar-stats',
        color: '#EB5A46',
      },
      {
        label: 'Un mois',
        minutes: 30 * 24 * 60,
        icon: 'moon',
        color: '#C25100',
      },
      {
        label: 'Plus d\u2019un mois',
        minutes: 2 * 30 * 24 * 60,
        icon: 'hourglass-high',
        color: '#C377E0',
      },
    ];
  }

  function parseEstimateInput(text, CT) {
    var PU = global.PriorityUI;
    if (PU && typeof PU.parseDurationNl === 'function') {
      var parsed = PU.parseDurationNl(text);
      if (parsed != null && CT && typeof CT.clampEstimatedMinutes === 'function') {
        return CT.clampEstimatedMinutes(parsed);
      }
      return parsed;
    }
    if (CT && typeof CT.clampEstimatedMinutes === 'function') {
      return CT.clampEstimatedMinutes(text);
    }
    return null;
  }

  /**
   * Local parse returned bare minutes while the user typed a unit word —
   * classic bug class ("5 jours" → 5). Prefer an AI reinterpretation.
   */
  function isSuspiciousDurationParse(text, minutes) {
    if (minutes == null) return true;
    var raw = String(text || '')
      .trim()
      .toLowerCase()
      .replace(/,/g, '.');
    if (!raw) return false;
    var bare = raw.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (!bare) return true;
    var rest = (bare[2] || '').trim();
    if (!rest) return false;
    var n = Math.round(parseFloat(bare[1]));
    if (!isFinite(n) || n <= 0) return true;
    return minutes === n || minutes === Math.max(5, n);
  }

  /**
   * Local NL parse, then a quick AI call when missing/suspicious.
   * @returns {Promise<number|null>}
   */
  function resolveEstimateInput(text, CT, t) {
    var trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) return Promise.resolve(null);

    var local = parseEstimateInput(trimmed, CT);
    if (local != null && !isSuspiciousDurationParse(trimmed, local)) {
      return Promise.resolve(local);
    }

    var Agent = global.PriorityAgent;
    if (
      !Agent ||
      typeof Agent.getProvider !== 'function' ||
      typeof Agent.parseDurationMinutes !== 'function'
    ) {
      return Promise.resolve(local);
    }

    return Promise.resolve(Agent.getProvider(t))
      .then(function (provider) {
        if (typeof Agent.isConfigured === 'function' && !Agent.isConfigured(provider)) {
          return local;
        }
        return Agent.parseDurationMinutes(provider, trimmed).then(function (aiMins) {
          if (aiMins == null) return local;
          if (CT && typeof CT.clampEstimatedMinutes === 'function') {
            return CT.clampEstimatedMinutes(aiMins);
          }
          return aiMins;
        });
      })
      .catch(function (err) {
        console.error('resolveEstimateInput AI failed', err);
        return local;
      });
  }

  function closeOpenEstimatePopovers(except) {
    var open = document.querySelectorAll('.tp-estimate-popover.is-open');
    for (var i = 0; i < open.length; i++) {
      if (except && open[i] === except) continue;
      var el = open[i];
      var ownerWrap = el.parentElement;
      if (ownerWrap && typeof ownerWrap._tpCloseEstimate === 'function') {
        ownerWrap._tpCloseEstimate();
        continue;
      }
      el.classList.remove('is-open', 'is-fixed');
      el.hidden = true;
      el.style.left = '';
      el.style.right = '';
      el.style.top = '';
      el.style.bottom = '';
      el.style.maxWidth = '';
    }
  }

  // exports
  S.COMPLETION_COLOR_SCHEMES = COMPLETION_COLOR_SCHEMES;
  S.COMPLETION_ENCOURAGEMENT_TIERS = COMPLETION_ENCOURAGEMENT_TIERS;
  S.COMPLETION_GRADIENT_STORAGE_KEY = COMPLETION_GRADIENT_STORAGE_KEY;
  S.COMPLETION_SCHEME_OPTIONS = COMPLETION_SCHEME_OPTIONS;
  S.COMPLETION_SCHEME_STORAGE_KEY = COMPLETION_SCHEME_STORAGE_KEY;
  S.CUSTOM_COMPLETION_SCHEME_KEY = CUSTOM_COMPLETION_SCHEME_KEY;
  S.DEFAULT_COMPLETION_SCHEME_KEY = DEFAULT_COMPLETION_SCHEME_KEY;
  S.ENCOURAGEMENT_BUBBLE_CARET_X = ENCOURAGEMENT_BUBBLE_CARET_X;
  S.ENCOURAGEMENT_BUBBLE_OFFSET_Y = ENCOURAGEMENT_BUBBLE_OFFSET_Y;
  S.FADER_FINE_SCALE = FADER_FINE_SCALE;
  S.FADER_LONG_PRESS_MS = FADER_LONG_PRESS_MS;
  S.FADER_MOVE_CANCEL_PX = FADER_MOVE_CANCEL_PX;
  S.FADER_PIXELS_PER_PERCENT = FADER_PIXELS_PER_PERCENT;
  S.FILTER_THRESHOLD = FILTER_THRESHOLD;
  S.FIREWORKS_ID = FIREWORKS_ID;
  S.FLIP_EASING = FLIP_EASING;
  S.FLIP_MS = FLIP_MS;
  S.MAX_GRADIENT_STOPS = MAX_GRADIENT_STOPS;
  S.MIN_GRADIENT_STOPS = MIN_GRADIENT_STOPS;
  S.PROGRESS_OKLCH = PROGRESS_OKLCH;
  S.SHOW_DONE_STORAGE_KEY = SHOW_DONE_STORAGE_KEY;
  S.TRELLO_BADGE_COLOR_HEX = TRELLO_BADGE_COLOR_HEX;
  S.TRELLO_BADGE_COLOR_NAMES = TRELLO_BADGE_COLOR_NAMES;
  S.activeCompletionSchemeKey = activeCompletionSchemeKey;
  S.applyCompletionColorScheme = applyCompletionColorScheme;
  S.applyCompletionGradient = applyCompletionGradient;
  S.applyProgressEncouragement = applyProgressEncouragement;
  S.applySliderProgressTrack = applySliderProgressTrack;
  S.bindProgressFader = bindProgressFader;
  S.buildCompletionScheme = buildCompletionScheme;
  S.clearAllCompleteCelebration = clearAllCompleteCelebration;
  S.cloneGradientStops = cloneGradientStops;
  S.closeOpenEstimatePopovers = closeOpenEstimatePopovers;
  S.colorAtProgress = colorAtProgress;
  S.completionColorForEstimate = completionColorForEstimate;
  S.completionColorForProgress = completionColorForProgress;
  S.completionTrelloBadgeColor = completionTrelloBadgeColor;
  S.createProgressSlider = createProgressSlider;
  S.durationTicks = durationTicks;
  S.ensureFaderHud = ensureFaderHud;
  S.getActiveCompletionGradient = getActiveCompletionGradient;
  S.getActiveCompletionSchemeKey = getActiveCompletionSchemeKey;
  S.getCompletionTrello = getCompletionTrello;
  S.gradientCssFromStops = gradientCssFromStops;
  S.gradientStopsForScheme = gradientStopsForScheme;
  S.hideFaderHud = hideFaderHud;
  S.isAllCompleteProgress = isAllCompleteProgress;
  S.isPresetCompletionSchemeKey = isPresetCompletionSchemeKey;
  S.isSuspiciousDurationParse = isSuspiciousDurationParse;
  S.lastProgressEncouragementTier = lastProgressEncouragementTier;
  S.lerpOklab = lerpOklab;
  S.linearToSrgb = linearToSrgb;
  S.loadShowDonePreference = loadShowDonePreference;
  S.loadStoredCompletionGradient = loadStoredCompletionGradient;
  S.loadStoredCompletionSchemeKey = loadStoredCompletionSchemeKey;
  S.nearestTrelloBadgeColorName = nearestTrelloBadgeColorName;
  S.normalizeCompletionSchemeKey = normalizeCompletionSchemeKey;
  S.normalizeGradientStops = normalizeGradientStops;
  S.normalizeHexColor = normalizeHexColor;
  S.oklabDistance = oklabDistance;
  S.oklabToRgb = oklabToRgb;
  S.oklchStopsToHex = oklchStopsToHex;
  S.oklchStopsToOklab = oklchStopsToOklab;
  S.oklchToOklab = oklchToOklab;
  S.parseEstimateInput = parseEstimateInput;
  S.parseHex = parseHex;
  S.percentIsComplete = percentIsComplete;
  S.playAllCompleteCelebration = playAllCompleteCelebration;
  S.playCompletionUiSound = playCompletionUiSound;
  S.playSliderProgressTick = playSliderProgressTick;
  S.playSubtaskCompletePop = playSubtaskCompletePop;
  S.positionEncouragementBubble = positionEncouragementBubble;
  S.positionedStopsFromHex = positionedStopsFromHex;
  S.prefersReducedMotion = prefersReducedMotion;
  S.progressEncouragementMeta = progressEncouragementMeta;
  S.progressEncouragementText = progressEncouragementText;
  S.progressEncouragementTierIndex = progressEncouragementTierIndex;
  S.progressFromFaderDelta = progressFromFaderDelta;
  S.resetSliderProgressSoundTier = resetSliderProgressSoundTier;
  S.resolveEstimateInput = resolveEstimateInput;
  S.rgbAtProgress = rgbAtProgress;
  S.rgbFromGradientStops = rgbFromGradientStops;
  S.rgbToHex = rgbToHex;
  S.rgbToOklab = rgbToOklab;
  S.saveShowDonePreference = saveShowDonePreference;
  S.saveStoredCompletionGradient = saveStoredCompletionGradient;
  S.saveStoredCompletionSchemeKey = saveStoredCompletionSchemeKey;
  S.schemeGradientCss = schemeGradientCss;
  S.sortGradientStops = sortGradientStops;
  S.srgbToLinear = srgbToLinear;
  S.updateFaderHud = updateFaderHud;
})(typeof window !== 'undefined' ? window : this);
