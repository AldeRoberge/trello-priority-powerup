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
(function (global) {
  'use strict';

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
  var activeGradientStops = cloneGradientStops(
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
      return normalizeGradientStops(activeGradientStops);
    }
    return cloneGradientStops(COMPLETION_COLOR_SCHEMES[key].gradientStops);
  }

  function rgbFromGradientStops(percent, stops) {
    var list = normalizeGradientStops(stops || activeGradientStops);
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
    return rgbFromGradientStops(percent, activeGradientStops);
  }

  function colorAtProgress(schemeKey, percent) {
    return rgbToHex(rgbAtProgress(percent, schemeKey));
  }

  function completionColorForProgress(percent) {
    if (percentIsComplete(percent)) {
      return rgbToHex(rgbFromGradientStops(100, activeGradientStops));
    }
    return rgbToHex(rgbFromGradientStops(percent, activeGradientStops));
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
    activeGradientStops = normalizeGradientStops(stops);
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
      activeGradientStops = normalizeGradientStops(activeGradientStops);
      return key;
    }
    var scheme = COMPLETION_COLOR_SCHEMES[key];
    activeCompletionSchemeKey = key;
    activeGradientStops = cloneGradientStops(scheme.gradientStops);
    return key;
  }

  function getActiveCompletionSchemeKey() {
    return activeCompletionSchemeKey;
  }

  function getActiveCompletionGradient() {
    return cloneGradientStops(activeGradientStops);
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
      return gradientCssFromStops(activeGradientStops);
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

  /**
   * Compact estimate chip + popover (ticks + optional freeform).
   * config: {
   *   minutes, scales|scale, readOnly, adjusted, compact, clearable, ariaLabel,
   *   onChange(minutes|null), t
   * }
   * Scales stay in minutes; Progrès / subtasks use Temps.
   * Empty state: grayed clock only (estimate optional). Set state: label + × to clear.
   */
  function createEstimateChip(CT, config) {
    config = config || {};
    var minutes =
      typeof CT.clampEstimatedMinutes === 'function'
        ? CT.clampEstimatedMinutes(config.minutes)
        : config.minutes != null
          ? Math.round(config.minutes)
          : null;
    var scaleIds =
      typeof CT.normalizeEstimateScales === 'function'
        ? CT.normalizeEstimateScales(
            config.scales != null ? config.scales : config.scale
          )
        : Array.isArray(config.scales)
          ? config.scales.slice()
          : [config.scale || 'time'];
    var readOnly = !!config.readOnly;
    var clearable = config.clearable !== false;
    var onChange = typeof config.onChange === 'function' ? config.onChange : null;
    var trelloT = config.t || null;

    var wrap = document.createElement('div');
    wrap.className =
      'tp-estimate-chip-wrap' + (config.compact ? ' is-compact' : '');

    var chip = document.createElement(readOnly ? 'span' : 'button');
    if (!readOnly) chip.type = 'button';
    chip.className = 'tp-estimate-chip';

    // Same Tabler icons as the Temps dropdown ticks (bolt / clock / sun / …).
    var iconEl = document.createElement('i');
    iconEl.className = 'ti ti-clock tp-estimate-chip-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    var label = document.createElement('span');
    label.className = 'tp-estimate-chip-label';
    chip.appendChild(iconEl);
    chip.appendChild(label);
    wrap.appendChild(chip);

    var clearBtn = null;
    if (!readOnly) {
      clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'tp-estimate-chip-clear';
      clearBtn.setAttribute('aria-label', 'Retirer l\u2019estimation');
      clearBtn.title = 'Retirer l\u2019estimation';
      clearBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
      clearBtn.hidden = true;
      clearBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closePopover();
        setMinutes(null, true);
      });
      wrap.appendChild(clearBtn);
    }

    var popover = null;
    var ticksRoot = null;
    var freeRow = null;
    var freeInput = null;

    function activeScales() {
      return scaleIds.slice();
    }

    function hasScale(id) {
      return scaleIds.indexOf(id) !== -1;
    }

    function primaryMeta() {
      var id = scaleIds[0] || 'time';
      if (typeof CT.getEstimateScale === 'function') {
        return CT.getEstimateScale(id);
      }
      return {
        id: id,
        emptyLabel: 'Estimer',
        emptyTitle: 'Ajouter une dur\u00e9e estim\u00e9e (optionnel)',
        popoverLabel: 'Choisir une estim\u00e9e',
        freeform: id === 'time',
      };
    }

    function emptyLabels() {
      if (scaleIds.length > 1) {
        return {
          emptyLabel: 'Estimer',
          emptyTitle: 'Ajouter une dur\u00e9e estim\u00e9e (optionnel)',
          popoverLabel: 'Choisir une estim\u00e9e',
        };
      }
      var meta = primaryMeta();
      return {
        emptyLabel: meta.emptyLabel || 'Estimer',
        emptyTitle:
          meta.emptyTitle || 'Ajouter une dur\u00e9e estim\u00e9e (optionnel)',
        popoverLabel: meta.popoverLabel || 'Choisir une estim\u00e9e',
      };
    }

    function ticksForScale(scaleId) {
      if (typeof CT.getEstimateScaleTicks === 'function') {
        return CT.getEstimateScaleTicks(scaleId);
      }
      return scaleId === 'time' ? durationTicks() : [];
    }

    function formatCurrent() {
      if (minutes == null) return '';
      if (typeof CT.formatEstimateForScales === 'function') {
        return CT.formatEstimateForScales(minutes, scaleIds);
      }
      if (typeof CT.formatEstimateForScale === 'function') {
        return CT.formatEstimateForScale(minutes, scaleIds[0]);
      }
      if (typeof CT.formatEstimatedMinutesCompact === 'function') {
        return CT.formatEstimatedMinutesCompact(minutes);
      }
      return String(minutes) + ' min';
    }

    /** Nearest tick for the chip icon + accent (prefer Temps when multi-scale). */
    function resolveChipTick() {
      if (minutes == null) return null;
      var scaleId = hasScale('time') ? 'time' : scaleIds[0] || 'time';
      if (typeof CT.nearestEstimateTick === 'function') {
        return CT.nearestEstimateTick(minutes, scaleId);
      }
      var ticks = ticksForScale(scaleId);
      if (!ticks.length) return null;
      var best = ticks[0];
      var bestDist = Infinity;
      var logM = Math.log(Math.max(minutes, 1));
      for (var i = 0; i < ticks.length; i++) {
        var tm = ticks[i].minutes;
        if (tm == null || !isFinite(+tm)) continue;
        var dist = Math.abs(logM - Math.log(Math.max(+tm, 1)));
        if (dist < bestDist) {
          bestDist = dist;
          best = ticks[i];
        }
      }
      return best;
    }

    function paint() {
      var labels = emptyLabels();
      var estimating = !!config.estimating && minutes == null;
      var isEmpty = minutes == null && !estimating;
      var text = estimating
        ? 'Estimation'
        : minutes == null
          ? ''
          : formatCurrent();
      label.textContent = text;
      label.hidden = isEmpty;
      chip.classList.toggle('is-empty', minutes == null);
      chip.classList.toggle('is-icon-only', isEmpty);
      chip.classList.toggle('is-set', minutes != null);
      chip.classList.toggle('is-estimating', estimating);
      chip.classList.toggle('is-adjusted', !!config.adjusted && minutes != null);
      chip.classList.toggle('is-scale-time', hasScale('time'));
      chip.classList.toggle('is-scale-tshirt', hasScale('tshirt'));
      chip.classList.toggle('is-scale-multi', scaleIds.length > 1);
      chip.setAttribute('aria-busy', estimating ? 'true' : 'false');
      chip.setAttribute(
        'aria-label',
        config.ariaLabel ||
          (minutes != null
            ? 'Estimation\u00a0: ' + text + '. Modifier'
            : labels.emptyTitle || 'Ajouter une dur\u00e9e estim\u00e9e')
      );
      chip.title = estimating
        ? 'Estimation en cours\u00a0\u2014 vous pouvez encore la modifier'
        : minutes == null
          ? labels.emptyTitle
          : config.adjusted
            ? 'Total ajust\u00e9\u00a0: ' + text
            : text;

      if (clearBtn) {
        var showClear = clearable && minutes != null;
        clearBtn.hidden = !showClear;
        wrap.classList.toggle('has-clear', showClear);
      }

      var tick = resolveChipTick();
      var iconName =
        (tick && tick.icon) || (estimating ? 'loader-2' : 'clock');
      iconEl.className = 'ti ti-' + iconName + ' tp-estimate-chip-icon';
      if (tick && tick.color) {
        wrap.style.setProperty('--estimate-accent', tick.color);
      } else {
        wrap.style.removeProperty('--estimate-accent');
      }
      syncTickSelection();
    }

    function setMinutes(next, notify) {
      minutes =
        typeof CT.clampEstimatedMinutes === 'function'
          ? CT.clampEstimatedMinutes(next)
          : next != null && isFinite(+next) && +next > 0
            ? Math.round(+next)
            : null;
      if (minutes != null) config.estimating = false;
      paint();
      if (notify && onChange) onChange(minutes);
    }

    function setEstimating(on) {
      config.estimating = !!on && minutes == null;
      paint();
    }

    function setClearable(next) {
      clearable = next !== false;
      paint();
    }

    function setScales(nextScales) {
      scaleIds =
        typeof CT.normalizeEstimateScales === 'function'
          ? CT.normalizeEstimateScales(nextScales)
          : Array.isArray(nextScales)
            ? nextScales.slice()
            : [nextScales || 'time'];
      config.scales = scaleIds.slice();
      rebuildPopoverBody();
      paint();
    }

    /** @deprecated Prefer setScales — kept for callers that pass a single scale. */
    function setScale(nextScale) {
      setScales(nextScale);
    }

    var onDocClose = null;
    var onPopoverReposition = null;

    function clearPopoverPosition() {
      if (!popover) return;
      popover.classList.remove('is-fixed');
      popover.style.left = '';
      popover.style.right = '';
      popover.style.top = '';
      popover.style.bottom = '';
      popover.style.maxWidth = '';
    }

    /**
     * Anchor below the chip (right-aligned), then clamp into the viewport so
     * left-side chips (master "Estimer") do not spill off-screen.
     */
    function positionPopover() {
      if (!popover || popover.hidden) return;
      var margin = 8;
      var gap = 6;
      var chipRect = chip.getBoundingClientRect();
      var viewW = document.documentElement.clientWidth || window.innerWidth || 0;
      var viewH = document.documentElement.clientHeight || window.innerHeight || 0;
      if (viewW <= 0 || viewH <= 0) return;

      popover.style.right = 'auto';
      popover.style.bottom = 'auto';
      popover.style.maxWidth = Math.max(160, viewW - margin * 2) + 'px';
      popover.style.left = Math.round(chipRect.left) + 'px';
      popover.style.top = Math.round(chipRect.bottom + gap) + 'px';
      popover.classList.add('is-fixed');

      var popW = popover.offsetWidth;
      var popH = popover.offsetHeight;

      var left = chipRect.right - popW;
      var top = chipRect.bottom + gap;

      if (left < margin) left = margin;
      if (left + popW > viewW - margin) {
        left = Math.max(margin, viewW - margin - popW);
      }

      if (top + popH > viewH - margin) {
        var above = chipRect.top - gap - popH;
        if (above >= margin) top = above;
        else top = Math.max(margin, viewH - margin - popH);
      }

      popover.style.left = Math.round(left) + 'px';
      popover.style.top = Math.round(top) + 'px';
    }

    function bindPopoverReposition(on) {
      if (on) {
        if (onPopoverReposition) return;
        onPopoverReposition = function () {
          positionPopover();
        };
        window.addEventListener('resize', onPopoverReposition);
        window.addEventListener('scroll', onPopoverReposition, true);
      } else if (onPopoverReposition) {
        window.removeEventListener('resize', onPopoverReposition);
        window.removeEventListener('scroll', onPopoverReposition, true);
        onPopoverReposition = null;
      }
    }

    function closePopover() {
      if (!popover) return;
      popover.classList.remove('is-open');
      popover.hidden = true;
      clearPopoverPosition();
      bindPopoverReposition(false);
      chip.setAttribute('aria-expanded', 'false');
      if (onDocClose) {
        document.removeEventListener('click', onDocClose, true);
        onDocClose = null;
      }
    }

    wrap._tpCloseEstimate = closePopover;

    function syncTickSelection() {
      if (!ticksRoot) return;
      var groups = ticksRoot.querySelectorAll('[data-estimate-scale]');
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        var scaleId = group.getAttribute('data-estimate-scale') || 'time';
        var nearest =
          minutes != null && typeof CT.nearestEstimateTick === 'function'
            ? CT.nearestEstimateTick(minutes, scaleId)
            : null;
        var buttons = group.querySelectorAll('.tp-estimate-tick');
        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          var btnMins = Number(btn.dataset.minutes);
          var selected =
            nearest &&
            minutes != null &&
            (btn.dataset.tickId === nearest.id ||
              (isFinite(btnMins) && btnMins === nearest.minutes));
          btn.classList.toggle('is-selected', !!selected);
          btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        }
      }
    }

    function rebuildPopoverBody() {
      if (!popover) return;
      var labels = emptyLabels();
      var allowFreeform = hasScale('time');
      popover.setAttribute('aria-label', labels.popoverLabel || 'Choisir une estim\u00e9e');
      popover.classList.toggle('is-scale-time', hasScale('time'));
      popover.classList.toggle('is-scale-discrete', !hasScale('time'));
      popover.classList.toggle('is-scale-multi', scaleIds.length > 1);

      if (!ticksRoot) {
        ticksRoot = document.createElement('div');
        ticksRoot.className = 'tp-estimate-ticks-root';
        popover.insertBefore(ticksRoot, popover.firstChild);
      }
      ticksRoot.textContent = '';

      activeScales().forEach(function (scaleId) {
        var meta =
          typeof CT.getEstimateScale === 'function'
            ? CT.getEstimateScale(scaleId)
            : { id: scaleId, label: scaleId };
        var section = document.createElement('div');
        section.className = 'tp-estimate-scale-section';
        section.setAttribute('data-estimate-scale', scaleId);
        if (scaleIds.length > 1) {
          var heading = document.createElement('div');
          heading.className = 'tp-estimate-scale-heading';
          heading.textContent = meta.label || scaleId;
          section.appendChild(heading);
        }
        var ticksEl = document.createElement('div');
        ticksEl.className = 'tp-estimate-ticks';
        ticksEl.setAttribute('role', 'listbox');
        ticksEl.setAttribute(
          'aria-label',
          meta.popoverLabel || meta.label || 'Choisir une estim\u00e9e'
        );
        ticksForScale(scaleId).forEach(function (tick) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tp-estimate-tick';
          btn.setAttribute('role', 'option');
          btn.title = tick.title || tick.label;
          btn.dataset.minutes = String(tick.minutes);
          if (tick.id) btn.dataset.tickId = String(tick.id);
          if (tick.color) {
            btn.style.setProperty('--tick-color', tick.color);
          }
          if (tick.icon) {
            var iconEl = document.createElement('i');
            iconEl.className = 'ti ti-' + tick.icon + ' tp-estimate-tick-icon';
            iconEl.setAttribute('aria-hidden', 'true');
            btn.appendChild(iconEl);
          }
          var labelEl = document.createElement('span');
          labelEl.className = 'tp-estimate-tick-label';
          labelEl.textContent = tick.label;
          btn.appendChild(labelEl);
          btn.addEventListener('click', function () {
            setMinutes(tick.minutes, true);
            closePopover();
          });
          ticksEl.appendChild(btn);
        });
        section.appendChild(ticksEl);
        ticksRoot.appendChild(section);
      });

      if (allowFreeform) {
        var timeMeta =
          typeof CT.getEstimateScale === 'function'
            ? CT.getEstimateScale('time')
            : { freeformPlaceholder: 'ex. 2 h', freeformAria: 'Dur\u00e9e personnalis\u00e9e' };
        if (!freeRow) {
          freeRow = document.createElement('div');
          freeRow.className = 'tp-estimate-free';
          freeInput = document.createElement('input');
          freeInput.type = 'text';
          freeInput.className = 'tp-input tp-estimate-free-input';
          freeInput.placeholder = timeMeta.freeformPlaceholder || 'ex. 2 h';
          freeInput.setAttribute(
            'aria-label',
            timeMeta.freeformAria || 'Dur\u00e9e personnalis\u00e9e'
          );
          var applyBtn = document.createElement('button');
          applyBtn.type = 'button';
          applyBtn.className = 'tp-estimate-free-apply';
          applyBtn.textContent = 'OK';

          var applyBusy = false;
          function applyFreeformEstimate() {
            if (applyBusy) return Promise.resolve();
            var typed = freeInput.value;
            applyBusy = true;
            applyBtn.disabled = true;
            freeInput.disabled = true;
            return resolveEstimateInput(typed, CT, trelloT)
              .then(function (parsed) {
                if (parsed != null) {
                  setMinutes(parsed, true);
                  closePopover();
                }
              })
              .finally(function () {
                applyBusy = false;
                applyBtn.disabled = false;
                freeInput.disabled = false;
              });
          }

          freeInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyFreeformEstimate();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              closePopover();
            }
          });
          applyBtn.addEventListener('click', function () {
            applyFreeformEstimate();
          });
          freeRow.appendChild(freeInput);
          freeRow.appendChild(applyBtn);
          popover.appendChild(freeRow);
        }
        freeRow.hidden = false;
        freeInput.placeholder = timeMeta.freeformPlaceholder || 'ex. 2 h';
      } else if (freeRow) {
        freeRow.hidden = true;
      }
      syncTickSelection();
    }

    function openPopover() {
      if (readOnly || !popover) return;
      closeOpenEstimatePopovers(popover);
      rebuildPopoverBody();
      popover.hidden = false;
      popover.classList.add('is-open');
      chip.setAttribute('aria-expanded', 'true');
      positionPopover();
      bindPopoverReposition(true);
      if (!onDocClose) {
        onDocClose = function (e) {
          if (!wrap.contains(e.target)) closePopover();
        };
        document.addEventListener('click', onDocClose, true);
      }
      if (freeInput && hasScale('time')) {
        freeInput.value =
          minutes != null
            ? typeof CT.formatEstimatedMinutesCompact === 'function'
              ? CT.formatEstimatedMinutesCompact(minutes).replace(/^~/, '')
              : String(minutes)
            : '';
        setTimeout(function () {
          freeInput.focus();
          freeInput.select();
        }, 0);
      }
    }

    if (!readOnly) {
      chip.setAttribute('aria-haspopup', 'dialog');
      chip.setAttribute('aria-expanded', 'false');
      popover = document.createElement('div');
      popover.className = 'tp-estimate-popover';
      popover.hidden = true;
      popover.setAttribute('role', 'dialog');
      rebuildPopoverBody();
      wrap.appendChild(popover);
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (popover.classList.contains('is-open')) closePopover();
        else openPopover();
      });
    }

    paint();

    var api = {
      el: wrap,
      chip: chip,
      getMinutes: function () {
        return minutes;
      },
      setMinutes: function (next) {
        setMinutes(next, false);
      },
      getScale: function () {
        return scaleIds[0] || 'time';
      },
      getScales: function () {
        return scaleIds.slice();
      },
      setScale: setScale,
      setScales: setScales,
      setEstimating: setEstimating,
      setClearable: setClearable,
      setAdjusted: function (adjusted) {
        config.adjusted = !!adjusted;
        paint();
      },
      setAccent: function (color) {
        if (color) wrap.style.setProperty('--estimate-accent', color);
        else wrap.style.removeProperty('--estimate-accent');
      }
    };
    wrap._tpEstimateChip = api;
    return api;
  }

  /** Selection key for a top-level Progrès subtask (master). */
  function selectionKeyForItem(itemId) {
    return 'item:' + String(itemId || '');
  }

  /** Selection key for a nested checklist sub-sous-tâche. */
  function selectionKeyForChecklist(parentId, nestedId) {
    return 'check:' + String(parentId || '') + ':' + String(nestedId || '');
  }

  function parseSelectionKey(key) {
    var raw = typeof key === 'string' ? key : '';
    if (raw.indexOf('item:') === 0) {
      var itemId = raw.slice(5);
      return itemId ? { kind: 'item', itemId: itemId } : null;
    }
    if (raw.indexOf('check:') === 0) {
      var rest = raw.slice(6);
      var colon = rest.indexOf(':');
      if (colon <= 0) return null;
      var parentId = rest.slice(0, colon);
      var nestedId = rest.slice(colon + 1);
      if (!parentId || !nestedId) return null;
      return { kind: 'check', parentId: parentId, nestedId: nestedId };
    }
    return null;
  }

  /** Master item key + all checklist children (cascade, like Gantt). */
  function collectItemSelectionIds(item) {
    if (!item || !item.id) return [];
    var ids = [selectionKeyForItem(item.id)];
    var nested = Array.isArray(item.items) ? item.items : [];
    for (var i = 0; i < nested.length; i++) {
      if (nested[i] && nested[i].id) {
        ids.push(selectionKeyForChecklist(item.id, nested[i].id));
      }
    }
    return ids;
  }

  /**
   * When a master is selected with its checklist children, bulk ops on the
   * master already cover the children — drop redundant check entries.
   */
  function dedupeBulkEntries(entries) {
    var list = Array.isArray(entries) ? entries : [];
    var parentIds = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].kind === 'item' && list[i].itemId) {
        parentIds[list[i].itemId] = true;
      }
    }
    var out = [];
    for (var j = 0; j < list.length; j++) {
      var e = list[j];
      if (!e) continue;
      if (e.kind === 'check' && e.parentId && parentIds[e.parentId]) continue;
      out.push(e);
    }
    return out;
  }

  function selectAllCheckboxState(selectedCount, visibleCount) {
    var selected = Math.max(0, Number(selectedCount) || 0);
    var visible = Math.max(0, Number(visibleCount) || 0);
    if (!visible || !selected) {
      return { checked: false, indeterminate: false };
    }
    if (selected >= visible) {
      return { checked: true, indeterminate: false };
    }
    return { checked: false, indeterminate: true };
  }

  // ── mountCompletionUI — main Progrès editor ─────────────────────────────

  function mountCompletionUI(containerEl, options) {
    var M = Object.create(null);
    M.containerEl = containerEl;
    M.options = options;
    var __parts = (global.CompletionUiPartsMountMountCompletionUI || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  function progressBadgePreviewSamples(stops) {
    var list = normalizeGradientStops(stops || activeGradientStops);
    return [0, 25, 50, 75, 100].map(function (pct) {
      var hex = rgbToHex(rgbFromGradientStops(pct, list));
      var colorName =
        pct >= 100 ? 'green' : pct <= 0 ? 'light-gray' : nearestTrelloBadgeColorName(hex);
      var text = pct >= 100 ? '\u2713 ' + pct + '\u00a0%' : pct + '\u00a0%';
      return { percent: pct, hex: hex, color: colorName, text: text };
    });
  }

  /**
   * Photoshop-style progress gradient editor (add / drag / recolor stops).
   * options: { initialStops, initialSchemeKey, onChange(stops, meta), onResize }
   */
  function mountProgressGradientEditor(containerEl, options) {
    options = options || {};
    var stops = normalizeGradientStops(
      options.initialStops || getActiveCompletionGradient()
    );
    var schemeKey = options.initialSchemeKey || CUSTOM_COMPLETION_SCHEME_KEY;
    var selectedIndex = 0;
    var dragState = null;

    containerEl.classList.add('tp-progress-gradient');
    containerEl.replaceChildren();

    var presetsRow = document.createElement('div');
    presetsRow.className = 'tp-progress-gradient-presets';
    presetsRow.setAttribute('role', 'group');
    presetsRow.setAttribute('aria-label', 'Préréglages');

    COMPLETION_SCHEME_OPTIONS.forEach(function (option) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tp-progress-gradient-preset';
      btn.dataset.scheme = option.key;
      btn.title = option.label;
      btn.setAttribute('aria-label', option.label);
      var thumb = document.createElement('span');
      thumb.className = 'tp-progress-gradient-preset-swatch';
      thumb.style.background = schemeGradientCss(option.key);
      btn.appendChild(thumb);
      var lbl = document.createElement('span');
      lbl.className = 'tp-progress-gradient-preset-label';
      lbl.textContent = option.label;
      btn.appendChild(lbl);
      btn.addEventListener('click', function () {
        schemeKey = option.key;
        stops = cloneGradientStops(COMPLETION_COLOR_SCHEMES[option.key].gradientStops);
        selectedIndex = 0;
        emitChange({ source: 'preset' });
        render();
      });
      presetsRow.appendChild(btn);
    });
    containerEl.appendChild(presetsRow);

    var editor = document.createElement('div');
    editor.className = 'tp-progress-gradient-editor';
    containerEl.appendChild(editor);

    var trackWrap = document.createElement('div');
    trackWrap.className = 'tp-progress-gradient-track-wrap';
    editor.appendChild(trackWrap);

    var track = document.createElement('div');
    track.className = 'tp-progress-gradient-track';
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', 'Dégradé de progrès');
    trackWrap.appendChild(track);

    var handlesLayer = document.createElement('div');
    handlesLayer.className = 'tp-progress-gradient-handles';
    trackWrap.appendChild(handlesLayer);

    var scale = document.createElement('div');
    scale.className = 'tp-progress-gradient-scale';
    scale.innerHTML =
      '<span>0&nbsp;%</span><span>50&nbsp;%</span><span>100&nbsp;%</span>';
    editor.appendChild(scale);

    var controls = document.createElement('div');
    controls.className = 'tp-progress-gradient-controls';
    editor.appendChild(controls);

    var colorLabel = document.createElement('label');
    colorLabel.className = 'tp-progress-gradient-color';
    var colorCaption = document.createElement('span');
    colorCaption.textContent = 'Couleur';
    var colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'tp-progress-gradient-color-input';
    colorLabel.appendChild(colorCaption);
    colorLabel.appendChild(colorInput);
    controls.appendChild(colorLabel);

    var posLabel = document.createElement('label');
    posLabel.className = 'tp-progress-gradient-pos';
    var posCaption = document.createElement('span');
    posCaption.textContent = 'Position';
    var posInput = document.createElement('input');
    posInput.type = 'number';
    posInput.min = '0';
    posInput.max = '100';
    posInput.step = '1';
    posInput.className = 'tp-progress-gradient-pos-input';
    var posSuffix = document.createElement('span');
    posSuffix.className = 'tp-progress-gradient-pos-suffix';
    posSuffix.textContent = '%';
    posLabel.appendChild(posCaption);
    posLabel.appendChild(posInput);
    posLabel.appendChild(posSuffix);
    controls.appendChild(posLabel);

    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'tp-button tp-button--secondary tp-progress-gradient-delete';
    deleteBtn.textContent = 'Supprimer le point';
    controls.appendChild(deleteBtn);

    var preview = document.createElement('div');
    preview.className = 'tp-progress-gradient-preview';
    preview.setAttribute('aria-labelledby', 'completionGradientPreviewHeading');
    var previewHeading = document.createElement('p');
    previewHeading.className = 'tp-color-scheme-hint';
    previewHeading.id = 'completionGradientPreviewHeading';
    previewHeading.textContent = 'Aperçu';
    preview.appendChild(previewHeading);

    var previewBars = document.createElement('div');
    previewBars.className = 'tp-progress-gradient-preview-bars';
    preview.appendChild(previewBars);

    var previewBadges = document.createElement('div');
    previewBadges.className = 'tp-badge-preview-list tp-progress-gradient-preview-badges';
    preview.appendChild(previewBadges);

    containerEl.appendChild(preview);

    function notifyResize() {
      if (typeof options.onResize === 'function') options.onResize();
    }

    function emitChange(meta) {
      if (typeof options.onChange !== 'function') return;
      options.onChange(cloneGradientStops(stops), {
        schemeKey: schemeKey,
        source: (meta && meta.source) || 'edit'
      });
    }

    function markCustom() {
      schemeKey = CUSTOM_COMPLETION_SCHEME_KEY;
    }

    function selectStop(index) {
      selectedIndex = Math.max(0, Math.min(stops.length - 1, index));
      syncControls();
      renderHandles();
    }

    function syncControls() {
      var stop = stops[selectedIndex];
      if (!stop) return;
      colorInput.value = normalizeHexColor(stop.color, '#b3bac5');
      posInput.value = String(Math.round(stop.p));
      var isEndpoint = selectedIndex === 0 || selectedIndex === stops.length - 1;
      posInput.disabled = isEndpoint;
      posInput.title = isEndpoint
        ? 'Les extrémités restent ancrées à 0 % et 100 %'
        : 'Position du point (0–100 %)';
      var canDelete = stops.length > MIN_GRADIENT_STOPS;
      deleteBtn.disabled = !canDelete;
      deleteBtn.title = !canDelete
        ? 'Au moins deux points sont requis'
        : isEndpoint
          ? 'Supprimer ce point (les extrémités seront réancrées à 0 % / 100 %)'
          : 'Supprimer ce point';
      Array.prototype.forEach.call(presetsRow.children, function (btn) {
        var active = schemeKey !== CUSTOM_COMPLETION_SCHEME_KEY && btn.dataset.scheme === schemeKey;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function renderTrack() {
      track.style.background = gradientCssFromStops(stops);
    }

    function renderHandles() {
      handlesLayer.replaceChildren();
      stops.forEach(function (stop, index) {
        var handle = document.createElement('button');
        handle.type = 'button';
        handle.className =
          'tp-progress-gradient-handle' + (index === selectedIndex ? ' is-selected' : '');
        handle.style.left = stop.p + '%';
        handle.style.setProperty('--stop-color', stop.color);
        handle.setAttribute('aria-label', 'Point à ' + Math.round(stop.p) + ' %');
        handle.dataset.index = String(index);

        handle.addEventListener('pointerdown', function (e) {
          if (e.button != null && e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          selectStop(index);
          dragState = {
            index: index,
            pointerId: e.pointerId,
            moved: false
          };
          try {
            handle.setPointerCapture(e.pointerId);
          } catch (err) { /* ignore */ }
        });

        handle.addEventListener('pointermove', function (e) {
          if (!dragState || dragState.pointerId !== e.pointerId) return;
          // Endpoints stay pinned at 0 % / 100 % (color only).
          if (index === 0 || index === stops.length - 1) return;
          var rect = track.getBoundingClientRect();
          if (!rect.width) return;
          var nextP = ((e.clientX - rect.left) / rect.width) * 100;
          nextP = Math.max(0, Math.min(100, nextP));
          var minP = stops[index - 1].p + 0.5;
          var maxP = stops[index + 1].p - 0.5;
          nextP = Math.max(minP, Math.min(maxP, nextP));
          if (Math.abs(nextP - stops[index].p) < 0.05) return;
          dragState.moved = true;
          stops[index].p = nextP;
          markCustom();
          renderTrack();
          handle.style.left = stops[index].p + '%';
          posInput.value = String(Math.round(stops[index].p));
          renderPreview();
        });

        function endDrag(e) {
          if (!dragState || dragState.pointerId !== e.pointerId) return;
          var moved = dragState.moved;
          dragState = null;
          try {
            handle.releasePointerCapture(e.pointerId);
          } catch (err) { /* ignore */ }
          stops = normalizeGradientStops(stops);
          selectedIndex = Math.min(selectedIndex, stops.length - 1);
          if (moved) emitChange({ source: 'drag' });
          render();
        }
        handle.addEventListener('pointerup', endDrag);
        handle.addEventListener('pointercancel', endDrag);

        handlesLayer.appendChild(handle);
      });
    }

    function renderPreview() {
      previewBars.replaceChildren();
      previewBadges.replaceChildren();
      progressBadgePreviewSamples(stops).forEach(function (sample) {
        var row = document.createElement('div');
        row.className = 'tp-progress-gradient-preview-row';

        var label = document.createElement('span');
        label.className = 'tp-progress-gradient-preview-label';
        label.textContent = sample.percent + '\u00a0%';

        var bar = document.createElement('div');
        bar.className = 'tp-progress-gradient-preview-bar';
        bar.style.setProperty('--completion-pct', sample.percent + '%');
        bar.style.setProperty('--completion-fill', sample.hex);

        var fill = document.createElement('span');
        fill.className = 'tp-progress-gradient-preview-fill';
        bar.appendChild(fill);

        row.appendChild(label);
        row.appendChild(bar);
        previewBars.appendChild(row);

        var chip = document.createElement('span');
        chip.className = 'tp-badge-preview-chip';
        chip.dataset.trelloColor = sample.color;
        chip.textContent = sample.text;
        previewBadges.appendChild(chip);
      });
    }

    function render() {
      stops = normalizeGradientStops(stops);
      if (selectedIndex >= stops.length) selectedIndex = stops.length - 1;
      renderTrack();
      renderHandles();
      syncControls();
      renderPreview();
      notifyResize();
    }

    function positionFromEvent(e) {
      var rect = track.getBoundingClientRect();
      if (!rect.width) return 50;
      return Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    }

    trackWrap.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.tp-progress-gradient-handle')) return;
      if (e.button != null && e.button !== 0) return;
      if (stops.length >= MAX_GRADIENT_STOPS) return;
      var p = positionFromEvent(e);
      var color = rgbToHex(rgbFromGradientStops(p, stops));
      stops.push({ p: p, color: color });
      stops = normalizeGradientStops(stops);
      // Select the new stop (closest to click position after normalize).
      var best = 0;
      var bestDist = Infinity;
      stops.forEach(function (stop, i) {
        var d = Math.abs(stop.p - p);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      selectedIndex = best;
      markCustom();
      emitChange({ source: 'add' });
      render();
    });

    colorInput.addEventListener('input', function () {
      if (!stops[selectedIndex]) return;
      stops[selectedIndex].color = normalizeHexColor(colorInput.value, stops[selectedIndex].color);
      markCustom();
      renderTrack();
      renderHandles();
      renderPreview();
    });
    colorInput.addEventListener('change', function () {
      markCustom();
      emitChange({ source: 'color' });
      render();
    });

    posInput.addEventListener('change', function () {
      if (!stops[selectedIndex]) return;
      if (selectedIndex === 0 || selectedIndex === stops.length - 1) {
        posInput.value = String(Math.round(stops[selectedIndex].p));
        return;
      }
      var nextP = Math.max(0, Math.min(100, Number(posInput.value) || 0));
      stops[selectedIndex].p = nextP;
      markCustom();
      stops = normalizeGradientStops(stops);
      emitChange({ source: 'position' });
      render();
    });

    deleteBtn.addEventListener('click', function () {
      if (stops.length <= MIN_GRADIENT_STOPS) return;
      stops.splice(selectedIndex, 1);
      selectedIndex = Math.max(0, selectedIndex - 1);
      markCustom();
      emitChange({ source: 'delete' });
      render();
    });

    render();

    return {
      getStops: function () {
        return cloneGradientStops(stops);
      },
      getSchemeKey: function () {
        return schemeKey;
      },
      setStops: function (nextStops, nextSchemeKey) {
        stops = normalizeGradientStops(nextStops);
        if (nextSchemeKey) schemeKey = normalizeCompletionSchemeKey(nextSchemeKey);
        else schemeKey = CUSTOM_COMPLETION_SCHEME_KEY;
        selectedIndex = 0;
        render();
      },
      el: containerEl
    };
  }

  /**
   * Compact overall progress editor for Gantt: % slider + optional item summary.
   * Uses applyMasterProgress when checklist items exist; otherwise card-level progress.
   */
  function mountMiniProgress(containerEl, config) {
    if (!containerEl) throw new Error('mountMiniProgress: container required');
    var CT = getCompletionTrello();
    if (!CT || typeof CT.normalizeCompletionData !== 'function') {
      throw new Error('CompletionTrello must be loaded before mountMiniProgress');
    }
    config = config || {};
    var onChange =
      typeof config.onChange === 'function' ? config.onChange : function () {};
    var data = CT.normalizeCompletionData(config.data || { items: [] });
    var progressMeta = CT.computeCardProgress(data);
    var current = CT.clampProgress(
      progressMeta && progressMeta.percent != null ? progressMeta.percent : 0
    );

    var root = document.createElement('div');
    root.className = 'tp-mini-progress';
    containerEl.appendChild(root);

    var summary = document.createElement('div');
    summary.className = 'tp-mini-progress-summary';
    root.appendChild(summary);

    var row = document.createElement('div');
    row.className = 'tp-mini-progress-row';
    root.appendChild(row);

    var pctLabel = document.createElement('span');
    pctLabel.className = 'tp-mini-progress-pct';
    row.appendChild(pctLabel);

    var range = document.createElement('input');
    range.type = 'range';
    range.className = 'tp-mini-progress-range';
    range.min = '0';
    range.max = '100';
    range.step = '1';
    range.value = String(current);
    range.setAttribute('aria-label', 'Progr\u00e8s');
    row.appendChild(range);

    function refreshSummary() {
      progressMeta = CT.computeCardProgress(data);
      current = CT.clampProgress(
        progressMeta && progressMeta.percent != null ? progressMeta.percent : 0
      );
      pctLabel.textContent = Math.round(current) + '\u00a0%';
      pctLabel.style.color = completionColorForProgress(current);
      range.value = String(Math.round(current));
      if (progressMeta && progressMeta.hasItems) {
        summary.textContent =
          (progressMeta.doneCount || 0) +
          ' / ' +
          (progressMeta.totalCount || 0) +
          ' sous-t\u00e2ches';
        summary.hidden = false;
      } else {
        summary.textContent = '';
        summary.hidden = true;
      }
    }

    function applyPercent(nextPct, commit) {
      var target = CT.clampProgress(nextPct);
      if (data.items && data.items.length) {
        data = CT.normalizeCompletionData(
          Object.assign({}, data, {
            items: CT.applyMasterProgress(data.items, target),
          })
        );
      } else {
        data = CT.normalizeCompletionData(
          Object.assign({}, data, { progress: target })
        );
      }
      refreshSummary();
      if (commit) onChange(Object.assign({}, data));
    }

    range.addEventListener('input', function () {
      applyPercent(+range.value, false);
    });
    range.addEventListener('change', function () {
      applyPercent(+range.value, true);
    });

    refreshSummary();

    return {
      el: root,
      getData: function () {
        return Object.assign({}, data);
      },
      getProgress: function () {
        return current;
      },
      setData: function (next) {
        data = CT.normalizeCompletionData(next || { items: [] });
        refreshSummary();
      },
      destroy: function () {
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  }

  global.CompletionUI = {
    PROGRESS_OKLCH: PROGRESS_OKLCH,
    COMPLETION_COLOR_SCHEMES: COMPLETION_COLOR_SCHEMES,
    COMPLETION_SCHEME_OPTIONS: COMPLETION_SCHEME_OPTIONS,
    DEFAULT_COMPLETION_SCHEME_KEY: DEFAULT_COMPLETION_SCHEME_KEY,
    CUSTOM_COMPLETION_SCHEME_KEY: CUSTOM_COMPLETION_SCHEME_KEY,
    normalizeCompletionSchemeKey: normalizeCompletionSchemeKey,
    normalizeGradientStops: normalizeGradientStops,
    applyCompletionColorScheme: applyCompletionColorScheme,
    applyCompletionGradient: applyCompletionGradient,
    getActiveCompletionSchemeKey: getActiveCompletionSchemeKey,
    getActiveCompletionGradient: getActiveCompletionGradient,
    loadStoredCompletionSchemeKey: loadStoredCompletionSchemeKey,
    saveStoredCompletionSchemeKey: saveStoredCompletionSchemeKey,
    loadStoredCompletionGradient: loadStoredCompletionGradient,
    saveStoredCompletionGradient: saveStoredCompletionGradient,
    colorAtProgress: colorAtProgress,
    completionColorForProgress: completionColorForProgress,
    completionColorForEstimate: completionColorForEstimate,
    completionTrelloBadgeColor: completionTrelloBadgeColor,
    schemeGradientCss: schemeGradientCss,
    gradientCssFromStops: gradientCssFromStops,
    progressBadgePreviewSamples: progressBadgePreviewSamples,
    progressEncouragementText: progressEncouragementText,
    progressEncouragementMeta: progressEncouragementMeta,
    progressEncouragementTierIndex: progressEncouragementTierIndex,
    applyProgressEncouragement: applyProgressEncouragement,
    playAllCompleteCelebration: playAllCompleteCelebration,
    clearAllCompleteCelebration: clearAllCompleteCelebration,
    mountCompletionUI: mountCompletionUI,
    mountMiniProgress: mountMiniProgress,
    mountProgressGradientEditor: mountProgressGradientEditor,
    progressFromFaderDelta: progressFromFaderDelta,
    bindProgressFader: bindProgressFader,
    selectionKeyForItem: selectionKeyForItem,
    selectionKeyForChecklist: selectionKeyForChecklist,
    parseSelectionKey: parseSelectionKey,
    collectItemSelectionIds: collectItemSelectionIds,
    dedupeBulkEntries: dedupeBulkEntries,
    selectAllCheckboxState: selectAllCheckboxState,
    FADER_LONG_PRESS_MS: FADER_LONG_PRESS_MS,
    FADER_PIXELS_PER_PERCENT: FADER_PIXELS_PER_PERCENT,
  };

  // shared with the mountCompletionUI parts
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
  S.activeGradientStops = activeGradientStops;
  S.applyCompletionColorScheme = applyCompletionColorScheme;
  S.applyCompletionGradient = applyCompletionGradient;
  S.applyProgressEncouragement = applyProgressEncouragement;
  S.applySliderProgressTrack = applySliderProgressTrack;
  S.bindProgressFader = bindProgressFader;
  S.buildCompletionScheme = buildCompletionScheme;
  S.clearAllCompleteCelebration = clearAllCompleteCelebration;
  S.cloneGradientStops = cloneGradientStops;
  S.closeOpenEstimatePopovers = closeOpenEstimatePopovers;
  S.collectItemSelectionIds = collectItemSelectionIds;
  S.colorAtProgress = colorAtProgress;
  S.completionColorForEstimate = completionColorForEstimate;
  S.completionColorForProgress = completionColorForProgress;
  S.completionTrelloBadgeColor = completionTrelloBadgeColor;
  S.createEstimateChip = createEstimateChip;
  S.createProgressSlider = createProgressSlider;
  S.dedupeBulkEntries = dedupeBulkEntries;
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
  S.mountCompletionUI = mountCompletionUI;
  S.mountMiniProgress = mountMiniProgress;
  S.mountProgressGradientEditor = mountProgressGradientEditor;
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
  S.parseSelectionKey = parseSelectionKey;
  S.percentIsComplete = percentIsComplete;
  S.playAllCompleteCelebration = playAllCompleteCelebration;
  S.playCompletionUiSound = playCompletionUiSound;
  S.playSliderProgressTick = playSliderProgressTick;
  S.playSubtaskCompletePop = playSubtaskCompletePop;
  S.positionEncouragementBubble = positionEncouragementBubble;
  S.positionedStopsFromHex = positionedStopsFromHex;
  S.prefersReducedMotion = prefersReducedMotion;
  S.progressBadgePreviewSamples = progressBadgePreviewSamples;
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
  S.selectAllCheckboxState = selectAllCheckboxState;
  S.selectionKeyForChecklist = selectionKeyForChecklist;
  S.selectionKeyForItem = selectionKeyForItem;
  S.sortGradientStops = sortGradientStops;
  S.srgbToLinear = srgbToLinear;
  S.updateFaderHud = updateFaderHud;
})(typeof window !== 'undefined' ? window : this);
