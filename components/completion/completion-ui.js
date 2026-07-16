/* Completion popup UI — subtask list and progress sliders. */
(function (global) {
  'use strict';

  var COMPLETION_SCHEME_STORAGE_KEY = 'trello-priority-powerup/completion-color-scheme';
  var COMPLETION_GRADIENT_STORAGE_KEY = 'trello-priority-powerup/completion-color-gradient';
  var DEFAULT_COMPLETION_SCHEME_KEY = 'traffic';
  var CUSTOM_COMPLETION_SCHEME_KEY = 'custom';
  var MIN_GRADIENT_STOPS = 2;
  var MAX_GRADIENT_STOPS = 8;
  var ENCOURAGEMENT_BUBBLE_OFFSET_X = 14;
  var ENCOURAGEMENT_BUBBLE_OFFSET_Y = 12;

  // Perceptual color helpers (OKLab / OKLCH) — same approach as priority-ui.js.
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
    { max: 0, text: 'En attente', icon: 'ti-player-pause', tone: 'idle' },
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

  function progressEncouragementText(percent) {
    return progressEncouragementMeta(percent).text;
  }

  function applyProgressEncouragement(el, percent) {
    if (!el) return;
    var meta = progressEncouragementMeta(percent);
    var p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    el.dataset.tone = meta.tone;
    el.classList.toggle('is-complete', meta.tone === 'done');
    // Match % / bar accent from the active completion color scheme.
    el.style.color = p > 0 ? completionColorForProgress(p) : '';
    el.innerHTML =
      '<span class="tp-completion-stage-icon" aria-hidden="true">' +
      '<i class="ti ' +
      meta.icon +
      '"></i>' +
      '</span>' +
      '<span class="tp-completion-stage-text">' +
      meta.text +
      '</span>';
  }

  function positionEncouragementBubble(el, clientX, clientY) {
    if (!el || clientX == null || clientY == null) return;
    var x = Number(clientX);
    var y = Number(clientY);
    if (!isFinite(x) || !isFinite(y)) return;
    // Anchor near the cursor; CSS translateY(-100%) keeps the bubble above it.
    el.style.left = Math.round(x + ENCOURAGEMENT_BUBBLE_OFFSET_X) + 'px';
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

  function playSliderProgressTick(percent) {
    try {
      if (
        global.CelebrationEffects &&
        typeof global.CelebrationEffects.playProgressTick === 'function'
      ) {
        global.CelebrationEffects.playProgressTick(percent);
      }
    } catch (e) {
      /* ignore audio failures */
    }
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

  var ESTIMATE_LOG_MAX = Math.round(2 * 365.25 * 24 * 60);

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
   *   minutes, scales|scale, readOnly, adjusted, compact, ariaLabel,
   *   onChange(minutes|null), t
   * }
   * Scales stay in minutes; Progrès / subtasks use Temps.
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
    var onChange = typeof config.onChange === 'function' ? config.onChange : null;
    var trelloT = config.t || null;

    var wrap = document.createElement('div');
    wrap.className =
      'tp-estimate-chip-wrap' + (config.compact ? ' is-compact' : '');

    var chip = document.createElement(readOnly ? 'span' : 'button');
    if (!readOnly) chip.type = 'button';
    chip.className = 'tp-estimate-chip';

    var sand = document.createElement('span');
    sand.className = 'tp-estimate-chip-sand';
    sand.setAttribute('aria-hidden', 'true');
    var label = document.createElement('span');
    label.className = 'tp-estimate-chip-label';
    chip.appendChild(sand);
    chip.appendChild(label);
    wrap.appendChild(chip);

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
        emptyTitle: 'D\u00e9finir une estim\u00e9e',
        popoverLabel: 'Choisir une estim\u00e9e',
        freeform: id === 'time',
      };
    }

    function emptyLabels() {
      if (scaleIds.length > 1) {
        return {
          emptyLabel: 'Estimer',
          emptyTitle: 'D\u00e9finir une dur\u00e9e estim\u00e9e',
          popoverLabel: 'Choisir une estim\u00e9e',
        };
      }
      var meta = primaryMeta();
      return {
        emptyLabel: meta.emptyLabel || 'Estimer',
        emptyTitle: meta.emptyTitle || 'D\u00e9finir une estim\u00e9e',
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

    function sandFillRatio() {
      if (minutes == null) return 0;
      if (hasScale('time') || scaleIds.length !== 1) {
        return Math.min(
          1,
          Math.log(Math.max(minutes, 5)) / Math.log(ESTIMATE_LOG_MAX)
        );
      }
      var scaleId = scaleIds[0];
      var ticks = ticksForScale(scaleId);
      if (ticks.length > 1) {
        var nearest =
          typeof CT.nearestEstimateTick === 'function'
            ? CT.nearestEstimateTick(minutes, scaleId)
            : null;
        var idx = 0;
        if (nearest) {
          for (var i = 0; i < ticks.length; i++) {
            if (ticks[i].id === nearest.id || ticks[i].minutes === nearest.minutes) {
              idx = i;
              break;
            }
          }
        }
        return idx / (ticks.length - 1);
      }
      return Math.min(
        1,
        Math.log(Math.max(minutes, 5)) / Math.log(ESTIMATE_LOG_MAX)
      );
    }

    function paint() {
      var labels = emptyLabels();
      var estimating = !!config.estimating && minutes == null;
      var text = estimating
        ? 'Estimation'
        : minutes == null
          ? labels.emptyLabel
          : formatCurrent();
      label.textContent = text;
      chip.classList.toggle('is-empty', minutes == null);
      chip.classList.toggle('is-set', minutes != null);
      chip.classList.toggle('is-estimating', estimating);
      chip.classList.toggle('is-adjusted', !!config.adjusted && minutes != null);
      chip.classList.toggle('is-scale-time', hasScale('time'));
      chip.classList.toggle('is-scale-tshirt', hasScale('tshirt'));
      chip.classList.toggle('is-scale-multi', scaleIds.length > 1);
      chip.setAttribute('aria-busy', estimating ? 'true' : 'false');
      chip.setAttribute(
        'aria-label',
        config.ariaLabel || labels.emptyTitle || 'Estimation'
      );
      chip.title = estimating
        ? 'Estimation en cours\u00a0\u2014 vous pouvez encore la modifier'
        : minutes == null
          ? labels.emptyTitle
          : config.adjusted
            ? 'Total ajust\u00e9\u00a0: ' + text
            : text;
      var fill = sandFillRatio();
      sand.style.transform = estimating
        ? ''
        : 'scaleY(' + (0.12 + fill * 0.88).toFixed(3) + ')';
      wrap.style.removeProperty('--estimate-accent');
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

  function mountCompletionUI(containerEl, options) {
    if (!containerEl) throw new Error('mountCompletionUI: container required');
    var CT = getCompletionTrello();
    if (!CT || typeof CT.normalizeCompletionData !== 'function') {
      throw new Error('CompletionTrello must be loaded before CompletionUI');
    }
    options = options || {};

    var data = CT.normalizeCompletionData(options.data || { items: [] });
    var onChange = typeof options.onChange === 'function' ? options.onChange : function () {};
    var onResize = typeof options.onResize === 'function' ? options.onResize : function () {};
    var onAllCompleteChange =
      typeof options.onAllCompleteChange === 'function' ? options.onAllCompleteChange : null;
    var onOpenLinkedCard =
      typeof options.onOpenLinkedCard === 'function' ? options.onOpenLinkedCard : null;
    var onPromoteSubtask =
      typeof options.onPromoteSubtask === 'function' ? options.onPromoteSubtask : null;
    var onBlockedChange =
      typeof options.onBlockedChange === 'function' ? options.onBlockedChange : null;
    var onLinkedTreeChange =
      typeof options.onLinkedTreeChange === 'function'
        ? options.onLinkedTreeChange
        : null;
    var getBoardCards =
      typeof options.getBoardCards === 'function' ? options.getBoardCards : null;
    var resolveLinkedTree =
      typeof options.resolveLinkedTree === 'function' ? options.resolveLinkedTree : null;
    var trelloT = options.t || null;
    var progressShellEl = options.shellEl || null;
    var celebrateRootEl = options.celebrateRoot || null;
    var showCardHeader = options.showCardHeader !== false;
    var onTitleChange =
      typeof options.onTitleChange === 'function' ? options.onTitleChange : null;
    var masterTitle =
      typeof options.cardName === 'string' && options.cardName.trim()
        ? options.cardName.trim()
        : '';
    var currentCardId =
      typeof options.currentCardId === 'string' ? options.currentCardId.trim() : '';
    var masterDragging = false;
    var masterTitleDirty = false;
    var masterTitleBusy = false;
    var flipAnimToken = 0;
    // null = not yet painted — avoid fireworks on initial mount when already complete.
    var lastAllComplete = null;
    // itemId → original text before AI spell fix (kept until popup closes / revert / edit)
    var itemSpellReverts = Object.create(null);
    // firstSplitItemId → { originalText, itemIds } after an AI multi-task split
    var itemSplitReverts = Object.create(null);
    // itemId → true while post-add / edit AI spellcheck is in flight
    var spellcheckingItemIds = Object.create(null);
    // itemId → generation token to ignore stale spellcheck responses
    var itemSpellTokens = Object.create(null);
    // itemId → true while silent AI estimate is in flight
    var estimatingItemIds = Object.create(null);
    // itemId → nested tree node from resolveLinkedCompletionTree
    var linkedTreeByItemId = Object.create(null);
    var linkedResolveSeq = 0;
    var boardCardsCache = null;
    var linkPickerOpen = false;

    function spellcheckText(text) {
      var trimmed = (text || '').trim();
      if (!trimmed) return Promise.resolve('');
      if (
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        return Promise.resolve(trimmed);
      }
      return global.Spellcheck.correct(trimmed).then(
        function (corrected) {
          return typeof corrected === 'string' ? corrected.trim() : trimmed;
        },
        function () {
          return trimmed;
        }
      );
    }

    containerEl.innerHTML = '';
    containerEl.className = 'tp-completion';

    var cardNameEl = null;
    if (showCardHeader) {
      var header = document.createElement('header');
      header.className = 'tp-priority-card-header';
      cardNameEl = document.createElement('p');
      cardNameEl.className = 'tp-priority-card-name is-loading';
      cardNameEl.id = 'cardName';
      cardNameEl.setAttribute('aria-live', 'polite');
      cardNameEl.textContent = 'Chargement\u2026';
      header.appendChild(cardNameEl);
      containerEl.appendChild(header);
    }

    var progressSection = document.createElement('section');
    progressSection.className = 'tp-completion-progress';
    progressSection.setAttribute('aria-label', 'Progr\u00e8s');

    var progressPanel = document.createElement('div');
    progressPanel.className = 'tp-completion-progress-panel';

    var progressHead = document.createElement('div');
    progressHead.className = 'tp-completion-progress-head';

    var masterTitleEl = document.createElement(onTitleChange ? 'input' : 'p');
    masterTitleEl.className = 'tp-completion-master-title';
    masterTitleEl.id = 'completionMasterTitle';
    masterTitleEl.hidden = true;
    if (onTitleChange) {
      masterTitleEl.type = 'text';
      masterTitleEl.maxLength = 16384;
      masterTitleEl.autocomplete = 'off';
      masterTitleEl.spellcheck = true;
      masterTitleEl.setAttribute('aria-label', 'Titre de la carte');
      masterTitleEl.placeholder = 'Titre de la carte';
      masterTitleEl.title = 'Cliquer pour modifier le titre';
    }

    var masterCheckWrap = document.createElement('div');
    masterCheckWrap.className = 'tp-completion-check-wrap tp-completion-master-check-wrap';
    var masterCheckBtn = document.createElement('button');
    masterCheckBtn.type = 'button';
    masterCheckBtn.className = 'tp-completion-check tp-completion-master-check';
    masterCheckBtn.id = 'completionMasterCheck';
    masterCheckWrap.appendChild(masterCheckBtn);

    var linkedSnapshots = Object.create(null);

    var estimateScales =
      typeof CT.normalizeEstimateScales === 'function'
        ? CT.normalizeEstimateScales(
            options.estimateScales != null
              ? options.estimateScales
              : typeof CT.getCachedBoardEstimateScales === 'function'
                ? CT.getCachedBoardEstimateScales()
                : CT.DEFAULT_ESTIMATE_SCALES
          )
        : ['time'];

    function currentEstimateScales() {
      return estimateScales.slice();
    }

    function applyEstimateScales(nextScales, opts) {
      opts = opts || {};
      estimateScales =
        typeof CT.normalizeEstimateScales === 'function'
          ? CT.normalizeEstimateScales(nextScales)
          : Array.isArray(nextScales)
            ? nextScales.slice()
            : ['time'];
      if (progressPanel) {
        progressPanel.dataset.estimateScales = estimateScales.join(',');
      }
      if (masterEstimateChip && typeof masterEstimateChip.setScales === 'function') {
        masterEstimateChip.setScales(estimateScales);
      } else if (masterEstimateChip && typeof masterEstimateChip.setScale === 'function') {
        masterEstimateChip.setScale(estimateScales[0]);
      }
      if (opts.rerender !== false) renderList();
      updateProgressUi();
      onResize();
    }

    var masterEstimateChip = createEstimateChip(CT, {
      t: trelloT,
      scales: currentEstimateScales(),
      minutes: CT.computeEstimatedTotal(data),
      adjusted:
        data.items.length &&
        typeof data.estimatedMinutesOffset === 'number' &&
        data.estimatedMinutesOffset !== 0,
      ariaLabel: 'Estimation totale',
      onChange: function (mins) {
        data = CT.applyMasterEstimate(data, mins, {
          lock: true,
          snapshotsByCardId: linkedSnapshots
        });
        emitChange();
        onResize();
      }
    });
    masterEstimateChip.el.classList.add('tp-completion-master-estimate');
    if (progressPanel) {
      progressPanel.dataset.estimateScales = estimateScales.join(',');
    }

    var existingEncouragementBubble = document.getElementById(
      'completionEncouragementBubble'
    );
    if (existingEncouragementBubble && existingEncouragementBubble.parentNode) {
      existingEncouragementBubble.parentNode.removeChild(existingEncouragementBubble);
    }
    var encouragementEl = document.createElement('div');
    encouragementEl.className = 'tp-completion-encouragement-bubble';
    encouragementEl.id = 'completionEncouragementBubble';
    encouragementEl.setAttribute('role', 'status');
    encouragementEl.setAttribute('aria-live', 'polite');
    encouragementEl.hidden = true;
    encouragementEl.setAttribute('aria-hidden', 'true');
    applyProgressEncouragement(encouragementEl, 0);
    document.body.appendChild(encouragementEl);

    var encouragementBubbleVisible = false;
    var encouragementPointerId = null;

    function showEncouragementBubble(clientX, clientY, percent) {
      if (percent != null) applyProgressEncouragement(encouragementEl, percent);
      encouragementEl.hidden = false;
      encouragementEl.setAttribute('aria-hidden', 'false');
      encouragementBubbleVisible = true;
      if (clientX != null && clientY != null) {
        positionEncouragementBubble(encouragementEl, clientX, clientY);
      }
    }

    function moveEncouragementBubble(clientX, clientY) {
      if (!encouragementBubbleVisible) return;
      positionEncouragementBubble(encouragementEl, clientX, clientY);
    }

    function hideEncouragementBubble() {
      encouragementBubbleVisible = false;
      encouragementPointerId = null;
      encouragementEl.hidden = true;
      encouragementEl.setAttribute('aria-hidden', 'true');
    }

    function onEncouragementPointerMove(event) {
      if (
        encouragementPointerId != null &&
        event.pointerId !== encouragementPointerId
      ) {
        return;
      }
      moveEncouragementBubble(event.clientX, event.clientY);
    }

    function onEncouragementPointerEnd(event) {
      if (
        encouragementPointerId != null &&
        event.pointerId !== encouragementPointerId
      ) {
        return;
      }
      hideEncouragementBubble();
      window.removeEventListener('pointermove', onEncouragementPointerMove, true);
      window.removeEventListener('pointerup', onEncouragementPointerEnd, true);
      window.removeEventListener('pointercancel', onEncouragementPointerEnd, true);
    }

    function armEncouragementBubbleFollow(event, percent) {
      window.removeEventListener('pointermove', onEncouragementPointerMove, true);
      window.removeEventListener('pointerup', onEncouragementPointerEnd, true);
      window.removeEventListener('pointercancel', onEncouragementPointerEnd, true);
      encouragementPointerId =
        event && event.pointerId != null ? event.pointerId : null;
      showEncouragementBubble(
        event ? event.clientX : null,
        event ? event.clientY : null,
        percent
      );
      window.addEventListener('pointermove', onEncouragementPointerMove, true);
      window.addEventListener('pointerup', onEncouragementPointerEnd, true);
      window.addEventListener('pointercancel', onEncouragementPointerEnd, true);
    }

    var completeAllBtn = document.createElement('button');
    completeAllBtn.type = 'button';
    completeAllBtn.className = 'tp-completion-complete-all';
    completeAllBtn.id = 'completionCompleteAll';
    completeAllBtn.innerHTML = '<i class="ti ti-checks" aria-hidden="true"></i>';
    completeAllBtn.setAttribute(
      'aria-label',
      'Marquer toutes les sous-t\u00e2ches comme termin\u00e9es'
    );
    completeAllBtn.title = 'Tout compl\u00e9ter';
    completeAllBtn.hidden = true;

    var resetAllBtn = document.createElement('button');
    resetAllBtn.type = 'button';
    resetAllBtn.className = 'tp-completion-reset-all';
    resetAllBtn.id = 'completionResetAll';
    resetAllBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
    resetAllBtn.setAttribute(
      'aria-label',
      'Remettre le progr\u00e8s \u00e0 0\u00a0% (conserve les t\u00e2ches termin\u00e9es)'
    );
    resetAllBtn.title = 'Tout invalider';
    resetAllBtn.hidden = true;

    var masterBlockedBtn = document.createElement('button');
    masterBlockedBtn.type = 'button';
    masterBlockedBtn.className = 'tp-completion-blocked-btn';
    masterBlockedBtn.id = 'completionMasterBlocked';
    masterBlockedBtn.innerHTML = '<i class="ti ti-player-pause" aria-hidden="true"></i>';
    masterBlockedBtn.setAttribute('aria-pressed', 'false');
    masterBlockedBtn.setAttribute('aria-label', 'Marquer la t\u00e2che comme bloqu\u00e9e');
    masterBlockedBtn.title = 'Bloqu\u00e9';

    var progressActions = document.createElement('div');
    progressActions.className = 'tp-completion-progress-actions';
    progressActions.appendChild(masterEstimateChip.el);
    progressActions.appendChild(masterBlockedBtn);
    progressActions.appendChild(completeAllBtn);
    progressActions.appendChild(resetAllBtn);

    progressHead.appendChild(masterTitleEl);
    progressHead.appendChild(progressActions);
    progressPanel.appendChild(progressHead);

    var masterSlider = createProgressSlider(
      'Ajuster le progr\u00e8s',
      0,
      function (v) {
        masterDragging = true;
        var blockedBefore = CT.hasAnyBlocked(data);
        if (blockedBefore) {
          console.debug('[tp-blocked] masterSlider input', {
            value: v,
            hasItems: data.items.length > 0,
            blockedBefore: blockedBefore,
            masterBlocked: !!data.blocked,
            blockedItems: (data.items || []).filter(function (it) {
              return it && it.blocked === true;
            }).length,
          });
        }
        if (data.items.length) {
          data.items = CT.applyMasterProgress(data.items, v, linkedSnapshots);
          syncItemSlidersFromData();
        } else {
          data.progress = v;
        }
        var blockedAfter = CT.hasAnyBlocked(data);
        if (blockedBefore !== blockedAfter) {
          console.debug('[tp-blocked] masterSlider blocked changed', {
            value: v,
            blockedBefore: blockedBefore,
            blockedAfter: blockedAfter,
            masterBlocked: !!data.blocked,
            blockedItems: (data.items || []).filter(function (it) {
              return it && it.blocked === true;
            }).length,
          });
        }
        if (encouragementBubbleVisible) {
          applyProgressEncouragement(encouragementEl, v);
        }
        updateProgressUi({ skipMasterSync: true, deferDoneListReveal: true });
        onChange(CT.normalizeCompletionData(data));
      },
      'completionMasterSlider'
    );
    masterSlider.el.classList.add('tp-completion-master-slider');
    var masterFieldHead = masterSlider.el.querySelector('.tp-completion-field-head');
    if (masterFieldHead) {
      masterFieldHead.insertBefore(masterCheckWrap, masterFieldHead.firstChild);
    }
    masterSlider.input.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      armEncouragementBubbleFollow(event, Number(masterSlider.input.value));
    });
    masterSlider.input.addEventListener('change', function () {
      hideEncouragementBubble();
      if (data.items.length) {
        renderList();
        onResize();
      }
    });
    progressPanel.appendChild(masterSlider.el);

    var masterMotifHost = document.createElement('div');
    masterMotifHost.className = 'tp-completion-master-motif-host';
    progressPanel.appendChild(masterMotifHost);

    progressSection.appendChild(progressPanel);
    containerEl.appendChild(progressSection);

    var listSection = document.createElement('section');
    listSection.className = 'tp-completion-list-section';
    listSection.innerHTML =
      '<div class="tp-completion-tools" id="completionTools" hidden>' +
      '<input type="search" class="tp-input tp-completion-search" id="completionSearch" ' +
      'placeholder="Rechercher une sous-t\u00e2che\u2026" maxlength="200" autocomplete="off" ' +
      'aria-label="Rechercher une sous-t\u00e2che" />' +
      '<select class="tp-input tp-completion-filter" id="completionFilter" aria-label="Filtrer les sous-t\u00e2ches">' +
      '<option value="all">Toutes</option>' +
      '<option value="active">En cours</option>' +
      '<option value="done">Termin\u00e9es</option>' +
      '</select>' +
      '</div>' +
      '<ul class="tp-completion-list" id="completionList" aria-label="Sous-t\u00e2ches"></ul>' +
      '<p class="tp-completion-filter-empty" id="completionFilterEmpty" hidden>' +
      'Aucune sous-t\u00e2che ne correspond.</p>';
    containerEl.appendChild(listSection);

    var doneSection = document.createElement('section');
    doneSection.className = 'tp-completion-done-section is-empty';
    doneSection.innerHTML =
      '<label class="tp-completion-show-done" id="completionShowDoneLabel">' +
      '<input type="checkbox" class="tp-completion-show-done-checkbox" id="completionShowDone" />' +
      '<span class="tp-completion-show-done-text">Afficher les t\u00e2ches termin\u00e9es</span>' +
      '</label>' +
      '<ul class="tp-completion-list tp-completion-done-list" id="completionDoneList" ' +
      'aria-label="T\u00e2ches termin\u00e9es" hidden></ul>';
    containerEl.appendChild(doneSection);

    var addSection = document.createElement('section');
    addSection.className = 'tp-completion-add';
    addSection.innerHTML =
      '<div class="tp-completion-add-row">' +
      '<input type="text" class="tp-input tp-completion-add-input" id="completionAddInput" ' +
      'placeholder="Ajouter une sous-t\u00e2che\u2026" maxlength="500" autocomplete="off" />' +
      '<button type="button" class="tp-btn tp-btn--primary tp-completion-add-btn" id="completionAddBtn">' +
      '<i class="ti ti-plus" aria-hidden="true"></i>' +
      '<span class="tp-completion-add-btn-label">Ajouter</span>' +
      '</button>' +
      '<button type="button" class="tp-btn tp-btn--secondary tp-completion-link-btn" id="completionLinkBtn" ' +
      'aria-expanded="false" aria-controls="completionLinkPicker" title="Lier une carte du tableau">' +
      '<i class="ti ti-link" aria-hidden="true"></i>' +
      '<span class="tp-completion-link-btn-label">Lier</span>' +
      '</button>' +
      '</div>' +
      '<div class="tp-completion-link-picker" id="completionLinkPicker" hidden>' +
      '<input type="search" class="tp-input tp-completion-link-search" id="completionLinkSearch" ' +
      'placeholder="Rechercher une carte\u2026" maxlength="200" autocomplete="off" ' +
      'aria-label="Rechercher une carte du tableau" />' +
      '<p class="tp-completion-link-status" id="completionLinkStatus" hidden></p>' +
      '<div class="tp-completion-link-list" id="completionLinkList" role="list"></div>' +
      '</div>';
    containerEl.appendChild(addSection);

    var suggestionsSection = document.createElement('section');
    suggestionsSection.className = 'tp-completion-suggestions';
    suggestionsSection.hidden = true;
    suggestionsSection.innerHTML =
      '<div class="tp-completion-suggestions-head">' +
      '<button type="button" class="tp-completion-suggestions-refresh" id="completionSuggestRefresh" ' +
      'aria-label="Rafra\u00eechir les suggestions" title="Rafra\u00eechir">\u21bb</button>' +
      '</div>' +
      '<p class="tp-completion-suggestions-status" id="completionSuggestStatus" hidden></p>' +
      '<div class="tp-completion-suggestions-list" id="completionSuggestList" role="list"></div>';
    containerEl.appendChild(suggestionsSection);

    var listEl = containerEl.querySelector('#completionList');
    var doneListEl = containerEl.querySelector('#completionDoneList');
    var toolsEl = containerEl.querySelector('#completionTools');
    var searchInput = containerEl.querySelector('#completionSearch');
    var filterSelect = containerEl.querySelector('#completionFilter');
    var filterEmptyEl = containerEl.querySelector('#completionFilterEmpty');
    var showDoneCheckbox = containerEl.querySelector('#completionShowDone');
    var showDoneLabel = containerEl.querySelector('#completionShowDoneLabel');
    // masterTitleEl created above in progress panel
    var addInput = containerEl.querySelector('#completionAddInput');
    var addBtn = containerEl.querySelector('#completionAddBtn');
    var linkBtn = containerEl.querySelector('#completionLinkBtn');
    var linkPickerEl = containerEl.querySelector('#completionLinkPicker');
    var linkSearchInput = containerEl.querySelector('#completionLinkSearch');
    var linkStatusEl = containerEl.querySelector('#completionLinkStatus');
    var linkListEl = containerEl.querySelector('#completionLinkList');
    var suggestStatusEl = containerEl.querySelector('#completionSuggestStatus');
    var suggestListEl = containerEl.querySelector('#completionSuggestList');
    var suggestRefreshBtn = containerEl.querySelector('#completionSuggestRefresh');
    var suggestSubtasksFn =
      typeof options.suggestSubtasks === 'function' ? options.suggestSubtasks : null;
    var splitTaskTitleFn =
      typeof options.splitTaskTitle === 'function' ? options.splitTaskTitle : null;
    var currentSuggestions = [];
    var suggestionsLoading = false;
    var suggestionsSeq = 0;
    var showCompleted = loadShowDonePreference();
    var searchQuery = '';
    var statusFilter = 'all';
    showDoneCheckbox.checked = showCompleted;

    function syncMasterTitleUi(options) {
      options = options || {};
      if (!masterTitleEl) return;
      var editable = !!onTitleChange;
      var show = !!(masterTitle || editable);
      masterTitleEl.hidden = !show;
      if (!show) return;
      if (
        editable &&
        !options.force &&
        (masterTitleDirty || document.activeElement === masterTitleEl)
      ) {
        return;
      }
      if (editable) {
        masterTitleEl.value = masterTitle;
        masterTitleEl.title = masterTitle
          ? 'Cliquer pour modifier le titre'
          : 'Cliquer pour d\u00e9finir le titre';
        masterTitleEl.classList.toggle('is-empty', !masterTitle);
      } else {
        masterTitleEl.textContent = masterTitle;
        if (masterTitle) masterTitleEl.title = masterTitle;
        else masterTitleEl.removeAttribute('title');
      }
    }

    function flushMasterTitleSave() {
      if (!onTitleChange || !masterTitleDirty || masterTitleBusy) {
        return Promise.resolve();
      }
      var next = (masterTitleEl.value || '').trim();
      if (!next) {
        masterTitleEl.value = masterTitle || '';
        masterTitleDirty = false;
        masterTitleEl.classList.toggle('is-empty', !masterTitle);
        masterTitleEl.title = 'Le titre ne peut pas \u00eatre vide';
        onResize();
        return Promise.resolve({ ok: false, reason: 'empty-name', changed: false });
      }
      if (next === masterTitle) {
        masterTitleDirty = false;
        masterTitleEl.value = next;
        masterTitleEl.classList.remove('is-empty');
        return Promise.resolve({ ok: true, changed: false, name: next });
      }
      var previous = masterTitle;
      masterTitleBusy = true;
      masterTitleDirty = false;
      masterTitleEl.classList.add('is-saving');
      masterTitleEl.title = 'Enregistrement\u2026';
      return Promise.resolve(onTitleChange(next))
        .then(function (result) {
          masterTitleBusy = false;
          masterTitleEl.classList.remove('is-saving');
          if (result && result.ok === false) {
            masterTitle = previous;
            masterTitleEl.value = previous || '';
            if (result.reason === 'empty-name') {
              masterTitleEl.title = 'Le titre ne peut pas \u00eatre vide';
            } else if (
              result.reason === 'not-authorized' ||
              result.reason === 'no-app-key'
            ) {
              masterTitleEl.title =
                'Autorisez Trello dans Infos pour enregistrer le titre';
            } else {
              masterTitleEl.title = '\u00c9chec de l\u2019enregistrement';
            }
            masterTitleEl.classList.toggle('is-empty', !masterTitle);
            return result;
          }
          masterTitle = next;
          masterTitleEl.value = next;
          masterTitleEl.classList.remove('is-empty');
          masterTitleEl.title = 'Cliquer pour modifier le titre';
          onResize();
          return result;
        })
        .catch(function (err) {
          masterTitleBusy = false;
          masterTitleDirty = false;
          masterTitle = previous;
          masterTitleEl.value = previous || '';
          masterTitleEl.classList.remove('is-saving');
          masterTitleEl.classList.toggle('is-empty', !masterTitle);
          console.error('Completion master title save failed', err);
          masterTitleEl.title = '\u00c9chec de l\u2019enregistrement';
          return { ok: false, reason: 'error', changed: false };
        });
    }

    if (onTitleChange) {
      masterTitleEl.addEventListener('input', function () {
        masterTitleDirty = true;
        masterTitleEl.classList.toggle(
          'is-empty',
          !(masterTitleEl.value || '').trim()
        );
        onResize();
      });
      masterTitleEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          masterTitleEl.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          masterTitleDirty = false;
          masterTitleEl.value = masterTitle || '';
          masterTitleEl.classList.toggle('is-empty', !masterTitle);
          masterTitleEl.blur();
        }
      });
      masterTitleEl.addEventListener('blur', function () {
        flushMasterTitleSave();
      });
    }

    syncMasterTitleUi();

    var addTabComplete = null;
    if (
      addInput &&
      global.TabAutocomplete &&
      typeof global.TabAutocomplete.wrapField === 'function'
    ) {
      var addWrapped = global.TabAutocomplete.wrapField(addInput);
      addTabComplete = global.TabAutocomplete.bind({
        field: addInput,
        wrapEl: addWrapped.wrap,
        ghostEl: addWrapped.ghost,
        getCandidates: function () {
          return currentSuggestions
            .filter(function (s) {
              return !(s && typeof s === 'object' && s.type === 'link');
            })
            .map(function (s) {
              return typeof s === 'string' ? s : s && s.text ? s.text : '';
            })
            .filter(Boolean);
        },
        isEnabled: function () {
          return !addInput.disabled;
        },
        onProposal: function (proposal) {
          var target =
            proposal && proposal.candidate ? String(proposal.candidate.text || '') : '';
          if (!suggestListEl) return;
          Array.prototype.forEach.call(
            suggestListEl.querySelectorAll('.tp-completion-suggestion'),
            function (btn) {
              if (btn.classList.contains('is-link')) {
                btn.classList.remove('is-tab-target');
                var linkHint = btn.querySelector('.tp-tab-hint');
                if (linkHint) linkHint.remove();
                return;
              }
              var label = String(btn.getAttribute('data-suggestion') || btn.textContent || '');
              var on = !!(target && label === target);
              btn.classList.toggle('is-tab-target', on);
              var hint = btn.querySelector('.tp-tab-hint');
              if (on && !hint) {
                var kbd = document.createElement('kbd');
                kbd.className = 'tp-tab-hint';
                kbd.textContent = 'Tab';
                btn.appendChild(kbd);
              } else if (!on && hint) {
                hint.remove();
              }
            }
          );
        }
      });
    }

    var CHECK_ICON_SVG =
      '<svg class="tp-completion-check-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M13.2 4.3 6.5 11 2.8 7.3l1.1-1.1 2.6 2.6 5.6-5.6z"/>' +
      '</svg>';
    var PAUSE_ICON_SVG =
      '<svg class="tp-completion-check-icon tp-completion-pause-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
      '<rect x="3.75" y="3" width="2.75" height="10" rx="0.6" fill="currentColor"/>' +
      '<rect x="9.5" y="3" width="2.75" height="10" rx="0.6" fill="currentColor"/>' +
      '</svg>';
    var BLOCKED_ACCENT = 'var(--blocked-accent, #ae2e24)';
    var TRASH_ICON_SVG =
      '<svg class="tp-completion-delete-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M6 2.25A.75.75 0 0 1 6.75 1.5h2.5a.75.75 0 0 1 .75.75V3.5h3.25a.75.75 0 0 1 0 1.5h-.46l-.54 8.05A1.75 1.75 0 0 1 10.51 14.5H5.49a1.75 1.75 0 0 1-1.74-1.45L3.21 5H2.75a.75.75 0 0 1 0-1.5H6V2.25zM7.5 3.5h1V3h-1v.5zM4.72 5l.52 7.8a.25.25 0 0 0 .25.2h5.02a.25.25 0 0 0 .25-.2L11.28 5H4.72zM6.5 6.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75zm3 0a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75z"/>' +
      '</svg>';

    function createBlockedMotifField(opts) {
      opts = opts || {};
      if (
        !global.PriorityUI ||
        typeof global.PriorityUI.createEnAttenteField !== 'function'
      ) {
        return null;
      }
      var mount = document.createElement('div');
      mount.className = opts.className || 'tp-completion-item-motif';
      var fieldApi = global.PriorityUI.createEnAttenteField({
        el: mount,
        embedded: true,
        hideSubtaskPicker: true,
        value: true,
        blockedReasons: opts.blockedReasons || [],
        blockedLinks: [],
        getSubtasks: function () {
          return [];
        },
        onChange: function () {
          if (typeof opts.onChange !== 'function') return;
          opts.onChange(fieldApi.getBlockedReasons());
        },
        onLayoutChange: function () {
          onResize();
        }
      });
      mount._motifField = fieldApi;
      return { el: mount, api: fieldApi };
    }

    function syncBlockedMotifMount(host, visible, reasons, onReasonsChange, className) {
      if (!host) return;
      var existing = host.querySelector(
        className === 'tp-completion-master-motif'
          ? '.tp-completion-master-motif'
          : '.tp-completion-item-motif'
      );
      if (!visible) {
        if (existing) existing.remove();
        return;
      }
      if (existing && existing._motifField) {
        existing._motifField.setBlockedReasons(reasons || []);
        return;
      }
      if (existing) existing.remove();
      var created = createBlockedMotifField({
        className: className || 'tp-completion-item-motif',
        blockedReasons: reasons || [],
        onChange: onReasonsChange
      });
      if (created) host.appendChild(created.el);
    }

    function findItemRow(id) {
      return containerEl.querySelector('.tp-completion-item[data-id="' + id + '"]');
    }

    function focusItemTextInput(id) {
      var row = findItemRow(id);
      if (!row) return;
      var input = row.querySelector('.tp-completion-text');
      if (!input || typeof input.focus !== 'function') return;
      input.focus();
      var len = String(input.value || '').length;
      if (typeof input.setSelectionRange === 'function') {
        try {
          input.setSelectionRange(len, len);
        } catch (err) {
          /* ignore — some input types reject selection */
        }
      }
    }

    function paintItemSpellchecking(itemId) {
      var li = findItemRow(itemId);
      if (!li) return;
      var on = !!spellcheckingItemIds[itemId];
      var textInput = li.querySelector('.tp-completion-text');
      if (textInput) {
        textInput.classList.toggle('is-spellchecking', on);
        textInput.setAttribute('aria-busy', on ? 'true' : 'false');
      }
      var mainRow = li.querySelector('.tp-completion-item-main');
      var spinner = li.querySelector('.tp-completion-spell-spinner');
      if (on) {
        if (!spinner && mainRow) {
          spinner = document.createElement('span');
          spinner.className = 'tp-completion-spell-spinner';
          spinner.setAttribute('aria-hidden', 'true');
          spinner.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
          var insertBefore =
            li.querySelector('.tp-completion-item-estimate') ||
            li.querySelector('.tp-completion-promote') ||
            li.querySelector('.tp-completion-blocked-btn') ||
            li.querySelector('.tp-completion-delete');
          mainRow.insertBefore(spinner, insertBefore || null);
        }
      } else if (spinner && spinner.parentNode) {
        spinner.parentNode.removeChild(spinner);
      }
    }

    /**
     * Create/keep the subtask immediately; refine orthography asynchronously.
     * Enter must never wait on AI.
     */
    function spellcheckItemAfterCommit(itemId, originalText, token) {
      var original = typeof originalText === 'string' ? originalText.trim() : '';
      if (!itemId || !original) return;
      if (
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        if (itemSpellTokens[itemId] === token) {
          delete spellcheckingItemIds[itemId];
          delete itemSpellTokens[itemId];
          paintItemSpellchecking(itemId);
          onResize();
        }
        return;
      }
      spellcheckText(original).then(function (corrected) {
        if (token != null && itemSpellTokens[itemId] !== token) return;
        delete spellcheckingItemIds[itemId];
        delete itemSpellTokens[itemId];
        var live = findLiveItem(itemId);
        if (!live) return;
        var next = (corrected || '').trim() || original;
        if (next === live.text) {
          paintItemSpellchecking(itemId);
          onResize();
          return;
        }
        live.text = next;
        var persisted = applyNormalizedKeepingDrafts(data);
        renderList();
        updateProgressUi();
        onChange(persisted);
        onResize();
        if (next !== original) {
          itemSpellReverts[itemId] = original;
          showItemSpellRevert(itemId, original);
        }
      });
    }

    function clearSplitRevertTracking(itemIds) {
      Object.keys(itemSplitReverts).forEach(function (key) {
        var entry = itemSplitReverts[key];
        if (!entry || !Array.isArray(entry.itemIds)) return;
        var overlap = (itemIds || []).some(function (id) {
          return entry.itemIds.indexOf(id) >= 0 || key === id;
        });
        if (overlap) delete itemSplitReverts[key];
      });
    }

    /**
     * Replace one committed item with several polished titles from AI split.
     * @returns {string[]|null} new item ids
     */
    function applySplitReplace(sourceItemId, originalText, titles) {
      var idx = -1;
      for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].id === sourceItemId) {
          idx = i;
          break;
        }
      }
      if (idx < 0 || !titles || titles.length < 2) return null;
      var newItems = [];
      for (var t = 0; t < titles.length; t++) {
        var text = String(titles[t] || '').trim();
        if (!text) continue;
        var rawItem = {
          id: CT.generateId(),
          text: text,
          progress: 0
        };
        var item = CT.normalizeItem(rawItem);
        if (item) newItems.push(item);
      }
      if (newItems.length < 2) return null;
      delete itemSpellReverts[sourceItemId];
      delete spellcheckingItemIds[sourceItemId];
      delete itemSpellTokens[sourceItemId];
      delete estimatingItemIds[sourceItemId];
      delete linkedTreeByItemId[sourceItemId];
      clearSplitRevertTracking([sourceItemId]);
      data.items.splice.apply(data.items, [idx, 1].concat(newItems));
      newItems.forEach(function (row) {
        removeSuggestionMatch(row.text);
      });
      var newIds = newItems.map(function (row) {
        return row.id;
      });
      itemSplitReverts[newIds[0]] = {
        originalText: originalText,
        itemIds: newIds.slice()
      };
      playCompletionUiSound('add');
      emitChange();
      onResize();
      return newIds;
    }

    function showItemSplitRevert(anchorItemId) {
      var entry = itemSplitReverts[anchorItemId];
      if (
        !entry ||
        !entry.originalText ||
        !Array.isArray(entry.itemIds) ||
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.attachRevert !== 'function'
      ) {
        return;
      }
      var li = findItemRow(anchorItemId);
      if (!li) return;
      var mainRow = li.querySelector('.tp-completion-item-main');
      var del = li.querySelector('.tp-completion-delete');
      if (!mainRow) return;
      var count = entry.itemIds.length;
      global.Spellcheck.attachRevert(mainRow, {
        className: 'tp-completion-spell-revert tp-completion-split-revert',
        before: del,
        previous: entry.originalText,
        ariaLabel:
          'Annuler la s\u00e9paration en ' +
          count +
          ' t\u00e2ches',
        title:
          'Annuler la s\u00e9paration \u2014 restaurer\u00a0: ' +
          (typeof global.Spellcheck.revertLabel === 'function'
            ? global.Spellcheck.revertLabel(entry.originalText)
            : entry.originalText),
        onRevert: function () {
          if (itemSplitReverts[anchorItemId] !== entry) return;
          var still = entry.itemIds.filter(function (id) {
            return !!findLiveItem(id);
          });
          if (!still.length) {
            delete itemSplitReverts[anchorItemId];
            return;
          }
          var insertAt = data.items.length;
          for (var i = 0; i < data.items.length; i++) {
            if (still.indexOf(data.items[i].id) >= 0) {
              insertAt = i;
              break;
            }
          }
          data.items = data.items.filter(function (row) {
            return still.indexOf(row.id) < 0;
          });
          var restored = CT.normalizeItem({
            id: CT.generateId(),
            text: entry.originalText,
            progress: 0
          });
          if (restored) {
            data.items.splice(insertAt, 0, restored);
          }
          delete itemSplitReverts[anchorItemId];
          emitChange();
          onResize();
        },
        onDismiss: function () {
          if (itemSplitReverts[anchorItemId] === entry) {
            delete itemSplitReverts[anchorItemId];
          }
        }
      });
    }

    /**
     * After commit: ask AI whether the title is several tasks; else spellcheck.
     * Enter must never wait on AI.
     */
    function refineItemAfterCommit(itemId, originalText) {
      var original = typeof originalText === 'string' ? originalText.trim() : '';
      if (!itemId || !original) return;
      var token = (itemSpellTokens[itemId] || 0) + 1;
      itemSpellTokens[itemId] = token;
      spellcheckingItemIds[itemId] = true;
      paintItemSpellchecking(itemId);
      onResize();

      var splitPromise =
        splitTaskTitleFn &&
        (typeof global.PriorityAgent === 'undefined' ||
          typeof global.PriorityAgent.titleMayBeCompound !== 'function' ||
          global.PriorityAgent.titleMayBeCompound(original))
          ? Promise.resolve()
              .then(function () {
                return splitTaskTitleFn(original);
              })
              .catch(function (err) {
                console.error('splitTaskTitle failed', err);
                return null;
              })
          : Promise.resolve(null);

      splitPromise.then(function (splitResult) {
        if (itemSpellTokens[itemId] !== token) return;
        var live = findLiveItem(itemId);
        if (!live) {
          delete spellcheckingItemIds[itemId];
          delete itemSpellTokens[itemId];
          return;
        }
        // User already edited away from the committed text — don't split.
        if ((live.text || '').trim() !== original) {
          delete spellcheckingItemIds[itemId];
          delete itemSpellTokens[itemId];
          paintItemSpellchecking(itemId);
          onResize();
          return;
        }
        if (
          splitResult &&
          splitResult.shouldSplit === true &&
          Array.isArray(splitResult.tasks) &&
          splitResult.tasks.length >= 2
        ) {
          delete spellcheckingItemIds[itemId];
          delete itemSpellTokens[itemId];
          applySplitReplace(itemId, original, splitResult.tasks);
          return;
        }
        spellcheckItemAfterCommit(itemId, original, token);
      });
    }

    function syncCheckButton(btn, done, progress, opts) {
      if (!btn) return;
      opts = opts || {};
      var blocked = !!opts.blocked && !done;
      var p =
        typeof progress === 'number' && isFinite(progress)
          ? CT.clampProgress(progress)
          : done
            ? 100
            : 0;
      var fill = blocked
        ? BLOCKED_ACCENT
        : p > 0
          ? completionColorForProgress(p)
          : '';
      btn.style.setProperty('--completion-progress', String(p));
      if (fill) {
        btn.style.setProperty('--completion-check-fill', fill);
      } else {
        btn.style.removeProperty('--completion-check-fill');
      }
      var iconMode = blocked ? 'pause' : 'check';
      if (btn.getAttribute('data-icon-mode') !== iconMode) {
        btn.setAttribute('data-icon-mode', iconMode);
        btn.innerHTML = blocked ? PAUSE_ICON_SVG : CHECK_ICON_SVG;
      }
      btn.classList.toggle('is-checked', done);
      btn.classList.toggle('has-progress', p > 0 && !done);
      btn.classList.toggle('is-blocked', blocked);
      btn.setAttribute('aria-pressed', done ? 'true' : 'false');
      btn.setAttribute(
        'aria-label',
        blocked
          ? p > 0
            ? 'D\u00e9bloquer — ' + p + '\u00a0%'
            : 'D\u00e9bloquer'
          : done
            ? 'Marquer comme non termin\u00e9'
            : p > 0
              ? 'Marquer comme termin\u00e9 (100\u00a0%) — ' + p + '\u00a0%'
              : 'Marquer comme termin\u00e9 (100\u00a0%)'
      );
      btn.title = blocked
        ? 'D\u00e9bloquer'
        : done
          ? 'Marquer comme non termin\u00e9 \u2014 maintenir + glisser pour ajuster'
          : 'Marquer comme termin\u00e9 \u2014 maintenir + glisser pour ajuster';
    }

    function syncItemSlidersFromData() {
      data.items.forEach(function (item) {
        var li = findItemRow(item.id);
        if (!li) return;
        var p = CT.itemProgress(item);
        var itemBlocked = CT.isItemBlocked(item);
        var slider = li.querySelector('.tp-completion-item-slider');
        var valEl = li.querySelector('.tp-completion-item-val');
        var checkBtn = li.querySelector('.tp-completion-check');
        if (slider) {
          slider.value = String(p);
          applySliderProgressTrack(slider, p, { blocked: itemBlocked });
        }
        if (valEl) {
          valEl.textContent = p + '\u00a0%';
          valEl.style.color = itemBlocked ? BLOCKED_ACCENT : '';
        }
        syncCheckButton(checkBtn, item.done, p, { blocked: itemBlocked });
        li.classList.toggle('is-done', item.done);
        li.classList.toggle('is-blocked', itemBlocked);
        var blockedBtn = li.querySelector('.tp-completion-blocked-btn');
        if (blockedBtn) {
          blockedBtn.classList.toggle('is-blocked', itemBlocked);
          blockedBtn.setAttribute('aria-pressed', itemBlocked ? 'true' : 'false');
          blockedBtn.disabled = !!item.done;
        }
        syncBlockedMotifMount(
          li,
          itemBlocked && !CT.isLinkedItem(item),
          item.blockedReasons || [],
          function (reasons) {
            data = CT.setItemBlockedReasons(data, item.id, reasons);
            emitChange();
            notifyBlockedChange('item-reason');
            onResize();
          },
          'tp-completion-item-motif'
        );
      });
    }

    function itemMatchesQuery(item) {
      if (!searchQuery) return true;
      return String(item.text || '')
        .toLowerCase()
        .indexOf(searchQuery) !== -1;
    }

    function toolsVisible() {
      return data.items.length > FILTER_THRESHOLD;
    }

    function effectiveStatusFilter() {
      return toolsVisible() ? statusFilter : 'all';
    }

    function shouldShowDoneList(doneCount) {
      if (doneCount <= 0) return false;
      var filter = effectiveStatusFilter();
      if (filter === 'active') return false;
      if (filter === 'done') return true;
      return showCompleted;
    }

    function shouldShowActiveList() {
      return effectiveStatusFilter() !== 'done';
    }

    function updateDoneSectionUi(doneCount) {
      var hasDone = doneCount > 0;
      var showList = shouldShowDoneList(doneCount);
      doneSection.classList.toggle('is-empty', !hasDone);
      doneSection.classList.toggle('is-showing', showList);
      showDoneLabel.hidden = !hasDone;
      showDoneCheckbox.disabled = !hasDone;
      showDoneCheckbox.checked = showCompleted;
      doneListEl.hidden = !showList;
    }

    function updateToolsUi() {
      var show = toolsVisible();
      toolsEl.hidden = !show;
      if (!show) {
        if (searchQuery || statusFilter !== 'all') {
          searchQuery = '';
          statusFilter = 'all';
          searchInput.value = '';
          filterSelect.value = 'all';
        }
      }
    }

    function isEmptyDraftItem(item) {
      return (
        !!item &&
        !CT.isLinkedItem(item) &&
        !String(item.text || '').trim()
      );
    }

    // While re-rendering, empty-draft blur must not discard the row
    // (detaching a focused input fires blur).
    var suppressEmptyDraftDiscard = false;
    var suppressEmptyDraftDiscardTimer = null;

    function beginSuppressEmptyDraftDiscard() {
      suppressEmptyDraftDiscard = true;
      if (suppressEmptyDraftDiscardTimer) {
        clearTimeout(suppressEmptyDraftDiscardTimer);
        suppressEmptyDraftDiscardTimer = null;
      }
    }

    function endSuppressEmptyDraftDiscard() {
      if (suppressEmptyDraftDiscardTimer) {
        clearTimeout(suppressEmptyDraftDiscardTimer);
      }
      suppressEmptyDraftDiscardTimer = setTimeout(function () {
        suppressEmptyDraftDiscard = false;
        suppressEmptyDraftDiscardTimer = null;
      }, 0);
    }

    function captureEmptyDrafts(items) {
      var drafts = [];
      for (var i = 0; i < (items || []).length; i++) {
        if (isEmptyDraftItem(items[i])) drafts.push(items[i]);
      }
      return drafts;
    }

    function applyNormalizedKeepingDrafts(nextRaw) {
      var drafts = captureEmptyDrafts(data.items);
      var normalized = CT.normalizeCompletionData(nextRaw != null ? nextRaw : data);
      if (!drafts.length) {
        data = normalized;
        return normalized;
      }
      var seen = Object.create(null);
      var items = normalized.items.slice();
      for (var i = 0; i < items.length; i++) seen[items[i].id] = true;
      for (var d = 0; d < drafts.length; d++) {
        if (!seen[drafts[d].id]) items.push(drafts[d]);
      }
      data = { items: items };
      if (Object.prototype.hasOwnProperty.call(normalized, 'progress')) {
        data.progress = normalized.progress;
      }
      if (normalized.progressEnabled === false) data.progressEnabled = false;
      if (normalized.estimatedMinutes != null) {
        data.estimatedMinutes = normalized.estimatedMinutes;
      }
      if (
        typeof normalized.estimatedMinutesOffset === 'number' &&
        isFinite(normalized.estimatedMinutesOffset)
      ) {
        data.estimatedMinutesOffset = normalized.estimatedMinutesOffset;
      }
      if (normalized.estimatedMinutesLocked === true) {
        data.estimatedMinutesLocked = true;
      }
      if (normalized.blocked === true) {
        data.blocked = true;
        data.blockedOrigin =
          normalized.blockedOrigin === 'status' ? 'status' : 'user';
        if (
          Array.isArray(normalized.blockedReasons) &&
          normalized.blockedReasons.length
        ) {
          data.blockedReasons = normalized.blockedReasons.slice();
        } else {
          delete data.blockedReasons;
        }
      } else {
        delete data.blocked;
        delete data.blockedReasons;
        delete data.blockedOrigin;
      }
      return normalized;
    }

    function syncMasterBlockedBtn() {
      var blocked = CT.isMasterBlocked(data);
      var anyBlocked = CT.hasAnyBlocked(data);
      masterBlockedBtn.classList.toggle('is-blocked', blocked);
      masterBlockedBtn.setAttribute('aria-pressed', blocked ? 'true' : 'false');
      masterBlockedBtn.setAttribute(
        'aria-label',
        blocked
          ? 'D\u00e9bloquer la t\u00e2che'
          : 'Marquer la t\u00e2che comme bloqu\u00e9e'
      );
      masterBlockedBtn.title = blocked ? 'D\u00e9bloquer' : 'Bloqu\u00e9';
      progressPanel.classList.toggle('is-master-blocked', blocked);
      containerEl.classList.toggle('has-blocked', anyBlocked);
      syncBlockedMotifMount(
        masterMotifHost,
        blocked,
        data.blockedReasons || [],
        function (reasons) {
          data = CT.setMasterBlockedReasons(data, reasons, { origin: 'user' });
          // Keep master blocked even if reasons cleared.
          if (!CT.isMasterBlocked(data)) {
            data = CT.setMasterBlocked(data, true, { origin: 'user' });
          }
          emitChange();
          notifyBlockedChange('master-reason');
          onResize();
        },
        'tp-completion-master-motif'
      );
    }

    function syncMasterCheckButton(progress) {
      var pct =
        progress && typeof progress.percent === 'number' ? progress.percent : 0;
      var done = pct >= 100;
      var anyBlocked = CT.hasAnyBlocked(data);
      syncCheckButton(masterCheckBtn, done, pct, { blocked: anyBlocked });
      masterCheckBtn.setAttribute(
        'aria-label',
        anyBlocked
          ? done
            ? 'T\u00e2che bloqu\u00e9e'
            : 'T\u00e2che bloqu\u00e9e — ' + pct + '\u00a0%'
          : done
            ? 'Remettre le progr\u00e8s \u00e0 0\u00a0%'
            : 'Marquer comme termin\u00e9 (100\u00a0%)'
      );
    }

    function toggleMasterComplete() {
      // Pause icon means blocked — unblock instead of marking complete.
      if (CT.hasAnyBlocked(data)) {
        data = CT.clearAllBlocked(data);
        playCompletionUiSound('unblock');
        syncMasterBlockedBtn();
        updateProgressUi();
        emitChange();
        notifyBlockedChange('master-check');
        onResize();
        return;
      }
      var progress = CT.computeCardProgress(data, linkedSnapshots);
      if (progress.percent >= 100) {
        if (data.items.length) {
          for (var i = 0; i < data.items.length; i++) {
            setItemProgress(data.items[i], 0);
          }
        } else {
          data.progress = 0;
        }
        resetAllClearsCompleted = false;
        playCompletionUiSound('uncomplete');
      } else {
        if (data.items.length) {
          data.items = CT.applyMasterProgress(data.items, 100, linkedSnapshots);
        } else {
          data.progress = 100;
        }
        resetAllClearsCompleted = false;
        playCompletionUiSound('complete_all');
      }
      emitChange();
      onResize();
    }

    function notifyBlockedChange(source) {
      console.debug('[tp-blocked] notifyBlockedChange', {
        source: source,
        masterBlocked: CT.isMasterBlocked(data),
        masterOrigin: CT.masterBlockedOrigin ? CT.masterBlockedOrigin(data) : null,
        hasAnyBlocked: CT.hasAnyBlocked(data),
        blockedItems: (data.items || [])
          .filter(function (it) {
            return CT.isItemBlocked(it);
          })
          .map(function (it) {
            return it.id;
          }),
      });
      if (!onBlockedChange) return;
      try {
        onBlockedChange(CT.normalizeCompletionData(data), {
          source: source || 'toggle',
          hasAnyBlocked: CT.hasAnyBlocked(data),
        });
      } catch (err) {
        console.error('Completion onBlockedChange failed', err);
      }
    }

    function toggleMasterBlocked() {
      var nextBlocked = !CT.isMasterBlocked(data);
      console.debug('[tp-blocked] toggleMasterBlocked', {
        nextBlocked: nextBlocked,
        progress: CT.computeCardProgress(data).percent,
      });
      // Pause button is always an explicit user action.
      data = CT.setMasterBlocked(data, nextBlocked, { origin: 'user' });
      playCompletionUiSound(nextBlocked ? 'block' : 'unblock');
      syncMasterBlockedBtn();
      updateProgressUi();
      emitChange();
      notifyBlockedChange('master');
      onResize();
    }

    function toggleItemBlocked(itemId) {
      var live = null;
      for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].id === itemId) {
          live = data.items[i];
          break;
        }
      }
      if (!live) return;
      var nextBlocked = !CT.isItemBlocked(live);
      data = CT.setItemBlocked(data, itemId, nextBlocked);
      playCompletionUiSound(nextBlocked ? 'block' : 'unblock');
      // Do not use done-list FLIP — blocked toggle is not a done transition.
      emitChange();
      notifyBlockedChange('item');
      onResize();
    }

    function emitChange(opts) {
      opts = opts || {};
      var persisted = applyNormalizedKeepingDrafts(data);
      // Turn on show-done before paint when crossing into 100%, so the list
      // never flashes empty (syncAllCompleteSideEffects will see it already on).
      if (
        persisted.items.length &&
        !showCompleted &&
        lastAllComplete === false &&
        isAllCompleteProgress(CT.computeCardProgress(persisted, linkedSnapshots))
      ) {
        showCompleted = true;
        saveShowDonePreference(true);
        showDoneCheckbox.checked = true;
      }
      if (opts.animateItemId) {
        renderListWithFlip(opts.animateItemId, opts.flipWasDone);
      } else {
        renderList();
      }
      updateProgressUi();
      if (opts.focusTextItemId) {
        focusItemTextInput(opts.focusTextItemId);
      }
      onChange(persisted);
    }

    // After the first × click (incomplete → 0%), a second click also clears done items.
    var resetAllClearsCompleted = false;

    function hasIncompleteItemProgress() {
      if (data.items.length) {
        for (var i = 0; i < data.items.length; i++) {
          var item = data.items[i];
          if (!item.done && CT.itemProgress(item) > 0) return true;
        }
        return false;
      }
      var cardProgress = CT.clampProgress(data.progress);
      return cardProgress > 0 && cardProgress < 100;
    }

    function hasCompletedTasks() {
      if (data.items.length) {
        for (var i = 0; i < data.items.length; i++) {
          if (data.items[i].done) return true;
        }
        return false;
      }
      return CT.clampProgress(data.progress) >= 100;
    }

    function syncCompleteAllButton(progress) {
      var hasProgress = progress.percent > 0;
      var fullyComplete =
        progress.percent >= 100 || isAllCompleteProgress(progress);
      // Match `.has-progress`; hide once everything is already complete.
      completeAllBtn.hidden = !hasProgress || fullyComplete;
      completeAllBtn.disabled = fullyComplete;
    }

    function syncResetAllButton(progress) {
      if (progress.percent <= 0) {
        resetAllClearsCompleted = false;
      } else if (hasIncompleteItemProgress()) {
        // Incomplete progress returned — next × is pass 1 again.
        resetAllClearsCompleted = false;
      }
      var canReset = progress.percent > 0;
      resetAllBtn.hidden = !canReset;
      resetAllBtn.disabled = !canReset;
      resetAllBtn.classList.toggle('is-armed', !!resetAllClearsCompleted);
      if (resetAllClearsCompleted) {
        resetAllBtn.title = 'Invalider aussi les t\u00e2ches termin\u00e9es';
        resetAllBtn.setAttribute(
          'aria-label',
          'Remettre aussi les t\u00e2ches termin\u00e9es \u00e0 0\u00a0%'
        );
      } else {
        resetAllBtn.title = 'Tout invalider';
        resetAllBtn.setAttribute(
          'aria-label',
          'Remettre le progr\u00e8s \u00e0 0\u00a0% (conserve les t\u00e2ches termin\u00e9es)'
        );
      }
    }

    function completeAllTasks() {
      var progress = CT.computeCardProgress(data, linkedSnapshots);
      if (progress.percent <= 0 || progress.percent >= 100 || isAllCompleteProgress(progress)) {
        return;
      }
      resetAllClearsCompleted = false;
      if (data.items.length) {
        data.items = CT.applyMasterProgress(data.items, 100, linkedSnapshots);
      } else {
        data.progress = 100;
      }
      playCompletionUiSound('complete_all');
      emitChange();
      onResize();
    }

    function resetAllTasks() {
      var progress = CT.computeCardProgress(data, linkedSnapshots);
      if (progress.percent <= 0) return;

      if (data.items.length) {
        if (!resetAllClearsCompleted) {
          // Pass 1: zero incomplete items only; leave done tasks alone.
          var changed = false;
          for (var i = 0; i < data.items.length; i++) {
            var item = data.items[i];
            if (!item.done && CT.itemProgress(item) > 0) {
              setItemProgress(item, 0);
              changed = true;
            }
          }
          resetAllClearsCompleted = hasCompletedTasks();
          if (!changed && !resetAllClearsCompleted) return;
          if (!changed && resetAllClearsCompleted) {
            // Armed for a second click; no data change yet.
            playCompletionUiSound('reset_arm');
            syncResetAllButton(CT.computeCardProgress(data, linkedSnapshots));
            return;
          }
          playCompletionUiSound('reset');
        } else {
          // Pass 2: also clear completed tasks.
          for (var j = 0; j < data.items.length; j++) {
            setItemProgress(data.items[j], 0);
          }
          resetAllClearsCompleted = false;
          playCompletionUiSound('reset_all');
        }
      } else {
        var cardProgress = CT.clampProgress(data.progress);
        if (!resetAllClearsCompleted) {
          if (cardProgress > 0 && cardProgress < 100) {
            data.progress = 0;
            resetAllClearsCompleted = false;
            playCompletionUiSound('reset');
          } else if (cardProgress >= 100) {
            resetAllClearsCompleted = true;
            playCompletionUiSound('reset_arm');
            syncResetAllButton(progress);
            return;
          } else {
            return;
          }
        } else {
          data.progress = 0;
          resetAllClearsCompleted = false;
          playCompletionUiSound('reset_all');
        }
      }

      emitChange();
      onResize();
    }

    completeAllBtn.addEventListener('click', completeAllTasks);
    resetAllBtn.addEventListener('click', resetAllTasks);
    masterBlockedBtn.addEventListener('click', toggleMasterBlocked);
    masterCheckBtn.addEventListener('click', toggleMasterComplete);
    bindProgressFader(masterCheckBtn, {
      getProgress: function () {
        return CT.computeCardProgress(data, linkedSnapshots).percent;
      },
      setProgress: function (p, meta) {
        masterDragging = !meta.commit;
        if (data.items.length) {
          data.items = CT.applyMasterProgress(data.items, p, linkedSnapshots);
          syncItemSlidersFromData();
        } else {
          data.progress = p;
        }
        playSliderProgressTick(p);
        if (encouragementBubbleVisible) {
          applyProgressEncouragement(encouragementEl, p);
        }
        updateProgressUi({ skipMasterSync: true, deferDoneListReveal: true });
        onChange(CT.normalizeCompletionData(data));
        if (meta.commit) {
          masterDragging = false;
          hideEncouragementBubble();
          var start = meta.startProgress;
          if (p >= 100 && start < 100) {
            playCompletionUiSound('complete_all');
          } else if (p < 100 && start >= 100) {
            playCompletionUiSound('uncomplete');
          }
          if (data.items.length) {
            renderList();
            onResize();
          }
        }
      },
    });

    function syncMasterEstimateChip() {
      var scales = currentEstimateScales();
      var total = CT.computeEstimatedTotal(data, linkedSnapshots);
      var remaining = CT.computeEstimatedRemaining(data, linkedSnapshots);
      var chipScales =
        typeof masterEstimateChip.getScales === 'function'
          ? masterEstimateChip.getScales()
          : null;
      var scalesChanged =
        !chipScales ||
        chipScales.length !== scales.length ||
        scales.some(function (id, i) {
          return chipScales[i] !== id;
        });
      if (scalesChanged) {
        if (typeof masterEstimateChip.setScales === 'function') {
          masterEstimateChip.setScales(scales);
        } else if (typeof masterEstimateChip.setScale === 'function') {
          masterEstimateChip.setScale(scales[0]);
        }
      }
      masterEstimateChip.setMinutes(total);
      masterEstimateChip.setAdjusted(
        !!(
          data.items.length &&
          typeof data.estimatedMinutesOffset === 'number' &&
          data.estimatedMinutesOffset !== 0
        )
      );
      var totalLabel =
        total == null
          ? ''
          : CT.formatEstimateForScales
            ? CT.formatEstimateForScales(total, scales)
            : CT.formatEstimateForScale
              ? CT.formatEstimateForScale(total, scales[0])
              : CT.formatEstimatedMinutesCompact(total);
      var emptyTitle =
        CT.getEstimateScale(scales[0]).emptyTitle || 'D\u00e9finir une dur\u00e9e estim\u00e9e';
      masterEstimateChip.chip.title =
        total == null
          ? emptyTitle
          : remaining != null && remaining !== total
            ? totalLabel +
              ' au total \u00b7 ' +
              CT.formatEstimatedRemainingLabel(remaining, scales)
            : totalLabel + ' au total';
    }

    function updateProgressUi(opts) {
      opts = opts || {};
      var progress = CT.computeCardProgress(data, linkedSnapshots);
      var anyBlocked = CT.hasAnyBlocked(data);
      var accent = anyBlocked
        ? BLOCKED_ACCENT
        : completionColorForProgress(progress.percent);
      if (masterSlider.valEl) {
        masterSlider.valEl.style.color =
          anyBlocked || progress.percent > 0 ? accent : '';
      }
      if (encouragementBubbleVisible) {
        applyProgressEncouragement(encouragementEl, progress.percent);
      }
      progressPanel.style.setProperty(
        '--completion-hero-accent',
        anyBlocked || progress.percent > 0
          ? accent
          : 'var(--tp-border-strong)'
      );
      progressPanel.classList.toggle('is-complete', progress.percent === 100);
      progressPanel.classList.toggle('has-progress', progress.percent > 0);
      applyProgressSectionTint(
        progressShellEl,
        anyBlocked ? BLOCKED_ACCENT : accent
      );
      syncMasterEstimateChip();
      syncMasterBlockedBtn();
      syncMasterCheckButton(progress);
      syncCompleteAllButton(progress);
      syncResetAllButton(progress);
      if (!opts.skipMasterSync && !masterDragging) {
        masterSlider.setValue(progress.percent);
      } else {
        // Keep fill locked to the handle while dragging. Weighted average after
        // applyMasterProgress can round/clamp away from the pointer value.
        applySliderProgressTrack(
          masterSlider.input,
          Number(masterSlider.input.value),
          { blocked: anyBlocked }
        );
      }
      applySliderProgressTrack(masterSlider.input, Number(masterSlider.input.value), {
        blocked: anyBlocked
      });
      masterSlider.input.classList.toggle(
        'is-complete',
        Number(masterSlider.input.value) >= 100
      );
      masterDragging = false;
      syncAllCompleteSideEffects(progress, opts);
    }

    function applyProgressSectionTint(shellEl, accent) {
      if (!shellEl) return;
      var field =
        shellEl.classList && shellEl.classList.contains('field--progress')
          ? shellEl
          : shellEl.querySelector
            ? shellEl.querySelector('.field--progress')
            : null;
      var target = field || shellEl;
      if (accent) {
        target.style.setProperty('--section-glow', accent);
        target.classList.add('has-section-glow');
        shellEl.classList.add('has-progress-tint');
      } else {
        target.style.removeProperty('--section-glow');
        target.classList.remove('has-section-glow');
        shellEl.classList.remove('has-progress-tint');
      }
    }

    function syncAllCompleteSideEffects(progress, opts) {
      opts = opts || {};
      var allComplete = isAllCompleteProgress(progress);
      if (progressShellEl) {
        progressShellEl.classList.toggle('is-progress-complete', allComplete);
      }
      containerEl.classList.toggle('is-all-complete', allComplete);

      var edgeIntoComplete = lastAllComplete === false && allComplete;
      if (edgeIntoComplete) {
        playAllCompleteCelebration(celebrateRootEl || document.body);
        // Reveal completed subtasks so the list is not empty at 100%.
        if (data.items.length && !showCompleted) {
          showCompleted = true;
          saveShowDonePreference(true);
          showDoneCheckbox.checked = true;
          // Sliders defer rebuild until change/emitChange (avoid tearing mid-drag).
          if (!opts.deferDoneListReveal) {
            renderList();
            onResize();
          }
        }
      } else if (!allComplete) {
        clearAllCompleteCelebration(celebrateRootEl || document.body);
      }

      if (lastAllComplete !== allComplete) {
        lastAllComplete = allComplete;
        if (onAllCompleteChange) {
          try {
            onAllCompleteChange(allComplete, {
              justCompleted: edgeIntoComplete,
              progress: progress,
              data: CT.normalizeCompletionData(data),
            });
          } catch (err) {
            console.error('Completion onAllCompleteChange failed', err);
          }
        }
      }
    }

    function clearFlipStyles(el) {
      if (!el) return;
      el.classList.remove('is-flipping');
      el.style.transition = '';
      el.style.transform = '';
      el.style.opacity = '';
      el.style.zIndex = '';
      el.style.willChange = '';
    }

    function playFlipTo(el, firstRect) {
      if (!el || !firstRect || prefersReducedMotion()) return;
      var last = el.getBoundingClientRect();
      var dx = firstRect.left - last.left;
      var dy = firstRect.top - last.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      var token = ++flipAnimToken;
      el.classList.add('is-flipping');
      el.style.willChange = 'transform, opacity';
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      el.style.opacity = '0.92';
      el.style.zIndex = '2';
      // Force layout so the invert frame sticks before animating.
      void el.offsetWidth;
      el.style.transition =
        'transform ' + FLIP_MS + 'ms ' + FLIP_EASING +
        ', opacity ' + FLIP_MS + 'ms ' + FLIP_EASING;
      el.style.transform = 'translate(0, 0)';
      el.style.opacity = '1';

      var settled = false;
      function finish() {
        if (settled || token !== flipAnimToken) return;
        settled = true;
        el.removeEventListener('transitionend', onEnd);
        clearFlipStyles(el);
        onResize();
      }
      function onEnd(e) {
        if (e.target !== el || (e.propertyName && e.propertyName !== 'transform')) return;
        finish();
      }
      el.addEventListener('transitionend', onEnd);
      setTimeout(finish, FLIP_MS + 80);
    }

    function captureItemRect(id) {
      var row = findItemRow(id);
      return row ? row.getBoundingClientRect() : null;
    }

    function renderListWithFlip(itemId, wasDone) {
      var firstRect = captureItemRect(itemId);
      var becomingDone = !wasDone;
      var doneCount = data.items.filter(function (item) {
        return item.done;
      }).length;

      // Skip FLIP when the completed list is hidden (item simply leaves the active list).
      if (becomingDone && !shouldShowDoneList(doneCount)) {
        firstRect = null;
      }

      renderList();

      if (!itemId || !firstRect || prefersReducedMotion()) {
        onResize();
        return;
      }

      var nextRow = findItemRow(itemId);
      if (!nextRow) {
        onResize();
        return;
      }
      playFlipTo(nextRow, firstRect);
    }

    function setItemProgress(item, progress) {
      if (!item || !item.id) return;
      if (typeof CT.applyItemProgress === 'function') {
        data = CT.applyItemProgress(data, item.id, progress);
        var live = findLiveItem(item.id);
        if (live) {
          item.progress = live.progress;
          item.done = live.done;
          if (live.items && live.items.length) item.items = live.items;
          else delete item.items;
          return;
        }
      }
      item.progress = CT.clampProgress(progress);
      CT.syncDoneFromProgress(item);
    }

    function openLinkedCard(cardId) {
      if (!cardId || !onOpenLinkedCard) return;
      try {
        onOpenLinkedCard(cardId);
      } catch (err) {
        console.error('Completion open linked card failed', err);
      }
    }

    function linkedIdsAlreadyUsed() {
      var used = Object.create(null);
      if (currentCardId) used[currentCardId] = true;
      data.items.forEach(function (item) {
        var id = CT.itemLinkedCardId(item);
        if (id) used[id] = true;
      });
      return used;
    }

    function setLinkStatus(text, visible) {
      if (!linkStatusEl) return;
      if (!visible || !text) {
        linkStatusEl.hidden = true;
        linkStatusEl.textContent = '';
        return;
      }
      linkStatusEl.hidden = false;
      linkStatusEl.textContent = text;
    }

    function renderLinkPickerList(cards, query) {
      if (!linkListEl) return;
      linkListEl.replaceChildren();
      var used = linkedIdsAlreadyUsed();
      var q = String(query || '')
        .trim()
        .toLowerCase();
      var matches = (cards || []).filter(function (card) {
        if (!card || !card.id || used[card.id]) return false;
        if (!q) return true;
        var name = String(card.name || '').toLowerCase();
        var list = String(card.list || '').toLowerCase();
        return name.indexOf(q) !== -1 || list.indexOf(q) !== -1;
      });
      if (!matches.length) {
        setLinkStatus(
          q ? 'Aucune carte ne correspond.' : 'Aucune autre carte disponible.',
          true
        );
        return;
      }
      setLinkStatus('', false);
      matches.slice(0, 40).forEach(function (card) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tp-completion-link-option';
        btn.setAttribute('role', 'listitem');
        btn.dataset.cardId = card.id;
        var label = document.createElement('span');
        label.className = 'tp-completion-link-option-name';
        label.textContent = card.name || 'Carte';
        btn.appendChild(label);
        if (card.list) {
          var meta = document.createElement('span');
          meta.className = 'tp-completion-link-option-list';
          meta.textContent = card.list;
          btn.appendChild(meta);
        }
        btn.title = 'Lier\u00a0: ' + (card.name || 'Carte');
        btn.addEventListener('click', function () {
          addLinkedCard(card);
        });
        linkListEl.appendChild(btn);
      });
    }

    function ensureBoardCards() {
      if (boardCardsCache) return Promise.resolve(boardCardsCache);
      if (!getBoardCards) return Promise.resolve([]);
      return Promise.resolve()
        .then(function () {
          return getBoardCards();
        })
        .then(function (cards) {
          boardCardsCache = Array.isArray(cards) ? cards : [];
          return boardCardsCache;
        })
        .catch(function (err) {
          console.error('Completion board cards load failed', err);
          boardCardsCache = [];
          return boardCardsCache;
        });
    }

    function openLinkPicker() {
      if (!linkPickerEl || !getBoardCards) return;
      linkPickerOpen = true;
      linkPickerEl.hidden = false;
      if (linkBtn) linkBtn.setAttribute('aria-expanded', 'true');
      setLinkStatus('Chargement des cartes\u2026', true);
      if (linkListEl) linkListEl.replaceChildren();
      ensureBoardCards().then(function (cards) {
        if (!linkPickerOpen) return;
        renderLinkPickerList(cards, linkSearchInput ? linkSearchInput.value : '');
        onResize();
        if (linkSearchInput) {
          try {
            linkSearchInput.focus();
          } catch (e) { /* ignore */ }
        }
      });
      onResize();
    }

    function closeLinkPicker() {
      linkPickerOpen = false;
      if (linkPickerEl) linkPickerEl.hidden = true;
      if (linkBtn) linkBtn.setAttribute('aria-expanded', 'false');
      if (linkSearchInput) linkSearchInput.value = '';
      setLinkStatus('', false);
      if (linkListEl) linkListEl.replaceChildren();
      onResize();
    }

    function toggleLinkPicker() {
      if (linkPickerOpen) closeLinkPicker();
      else openLinkPicker();
    }

    if (linkBtn) {
      if (!getBoardCards) {
        linkBtn.hidden = true;
      } else {
        linkBtn.addEventListener('click', function () {
          toggleLinkPicker();
        });
      }
    }
    if (linkSearchInput) {
      linkSearchInput.addEventListener('input', function () {
        ensureBoardCards().then(function (cards) {
          if (!linkPickerOpen) return;
          renderLinkPickerList(cards, linkSearchInput.value);
          onResize();
        });
      });
    }

    function refreshLinkedTree(opts) {
      opts = opts || {};
      if (!resolveLinkedTree) {
        linkedTreeByItemId = Object.create(null);
        if (opts.rerender !== false) {
          renderList();
          updateProgressUi();
        }
        return Promise.resolve(null);
      }
      var seq = ++linkedResolveSeq;
      return Promise.resolve()
        .then(function () {
          return resolveLinkedTree(CT.normalizeCompletionData(data));
        })
        .then(function (resolved) {
          if (seq !== linkedResolveSeq) return null;
          linkedTreeByItemId =
            resolved && resolved.byItemId
              ? resolved.byItemId
              : Object.create(null);
          linkedSnapshots =
            resolved && resolved.snapshots
              ? resolved.snapshots
              : Object.create(null);
          // Always re-apply snapshots onto CURRENT data. resolved.data is a
          // snapshot from resolve start — using it would wipe estimates (or
          // other local edits) applied while the board scan was in flight.
          if (
            resolved &&
            typeof CT.applyLinkedSnapshots === 'function' &&
            linkedSnapshots
          ) {
            var prev = JSON.stringify(CT.normalizeCompletionData(data));
            var merged = CT.applyLinkedSnapshots(data, linkedSnapshots);
            var persisted = applyNormalizedKeepingDrafts(merged);
            if (JSON.stringify(persisted) !== prev && !opts.skipPersist) {
              onChange(persisted);
            }
          }
          if (opts.rerender !== false) {
            renderList();
            updateProgressUi();
            onResize();
          }
          if (onLinkedTreeChange) {
            try {
              onLinkedTreeChange(linkedTreeByItemId);
            } catch (cbErr) {
              console.error('Completion onLinkedTreeChange failed', cbErr);
            }
          }
          return resolved;
        })
        .catch(function (err) {
          console.error('Completion linked tree resolve failed', err);
          return null;
        });
    }

    function bindItemRow(li, item, opts) {
      opts = opts || {};
      var readOnly = !!opts.readOnly;
      var checkBtn = li.querySelector(
        ':scope > .tp-completion-item-main .tp-completion-check, :scope > .tp-completion-item-slider-row .tp-completion-check'
      );
      var checkWrap =
        (checkBtn && checkBtn.closest && checkBtn.closest('.tp-completion-check-wrap')) ||
        (checkBtn && checkBtn.parentNode) ||
        null;
      var textInput = li.querySelector(
        ':scope > .tp-completion-item-main .tp-completion-text'
      );
      var textLink = li.querySelector(
        ':scope > .tp-completion-item-main .tp-completion-text-link'
      );
      var deleteBtn = li.querySelector(
        ':scope > .tp-completion-item-main .tp-completion-delete'
      );
      var directSliderRow = null;
      for (var ci = 0; ci < li.children.length; ci++) {
        if (li.children[ci].classList.contains('tp-completion-item-slider-row')) {
          directSliderRow = li.children[ci];
          break;
        }
      }
      var itemSlider = directSliderRow
        ? directSliderRow.querySelector('.tp-completion-item-slider')
        : null;
      var itemValEl = directSliderRow
        ? directSliderRow.querySelector('.tp-completion-item-val')
        : null;
      var promoteBtn =
        opts.promoteBtn || li.querySelector('.tp-completion-promote');
      var completeBtn = li.querySelector(
        ':scope > .tp-completion-item-main .tp-completion-item-complete'
      );
      var isLinked = CT.isLinkedItem(item);

      var blockedBtn = li.querySelector(
        ':scope > .tp-completion-item-main .tp-completion-blocked-btn'
      );

      function syncItemProgressUi() {
        var p = CT.itemProgress(item);
        var itemBlocked = CT.isItemBlocked(item);
        if (itemSlider) applySliderProgressTrack(itemSlider, p, { blocked: itemBlocked });
        if (itemValEl) {
          itemValEl.textContent = p + '\u00a0%';
          itemValEl.style.color = itemBlocked ? BLOCKED_ACCENT : '';
        }
        syncCheckButton(checkBtn, item.done, p, { blocked: itemBlocked });
        li.classList.toggle('is-done', item.done);
        li.classList.toggle('is-blocked', itemBlocked);
        if (blockedBtn) {
          blockedBtn.classList.toggle('is-blocked', itemBlocked);
          blockedBtn.setAttribute('aria-pressed', itemBlocked ? 'true' : 'false');
          blockedBtn.setAttribute(
            'aria-label',
            itemBlocked
              ? 'D\u00e9bloquer la sous-t\u00e2che'
              : 'Marquer la sous-t\u00e2che comme bloqu\u00e9e'
          );
          blockedBtn.title = itemBlocked ? 'D\u00e9bloquer' : 'Bloqu\u00e9';
          blockedBtn.disabled = !!item.done;
        }
        if (completeBtn) {
          completeBtn.classList.toggle('is-complete', !!item.done);
          completeBtn.setAttribute('aria-pressed', item.done ? 'true' : 'false');
          completeBtn.setAttribute(
            'aria-label',
            item.done
              ? 'Marquer comme non termin\u00e9'
              : 'Marquer comme termin\u00e9'
          );
          completeBtn.title = item.done
            ? 'Non termin\u00e9 \u2014 maintenir + glisser pour ajuster'
            : 'Terminer \u2014 maintenir + glisser pour ajuster';
          completeBtn.disabled = !!itemBlocked;
        }
        if (!isLinked) {
          syncBlockedMotifMount(
            li,
            itemBlocked,
            item.blockedReasons || [],
            function (reasons) {
              data = CT.setItemBlockedReasons(data, item.id, reasons);
              var live = findLiveItem(item.id);
              if (live) item.blockedReasons = live.blockedReasons;
              emitChange();
              notifyBlockedChange('item-reason');
              onResize();
            },
            'tp-completion-item-motif'
          );
        }
      }

      if (readOnly) {
        if (checkBtn) checkBtn.disabled = true;
        if (itemSlider) itemSlider.disabled = true;
        if (deleteBtn) deleteBtn.hidden = true;
        if (blockedBtn) blockedBtn.disabled = true;
        if (promoteBtn) promoteBtn.hidden = true;
        if (completeBtn) completeBtn.disabled = true;
        if (textLink) {
          textLink.addEventListener('click', function (e) {
            e.preventDefault();
            openLinkedCard(CT.itemLinkedCardId(item));
          });
        }
        syncItemProgressUi();
        return;
      }

      if (promoteBtn && !isLinked) {
        promoteBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (promoteBtn.disabled) return;
          promoteBtn.disabled = true;
          promoteBtn.classList.add('is-busy');
          promoteItemToCard(item).finally(function () {
            promoteBtn.disabled = false;
            promoteBtn.classList.remove('is-busy');
          });
        });
      }

      function toggleItemDone(originBtn) {
        if (isLinked) {
          openLinkedCard(CT.itemLinkedCardId(item));
          return;
        }
        // Pause icon on circular check means blocked — unblock instead of completing.
        if (CT.isItemBlocked(item)) {
          data = CT.setItemBlocked(data, item.id, false);
          emitChange();
          notifyBlockedChange('item-check');
          onResize();
          return;
        }
        var wasDone = !!item.done;
        setItemProgress(item, item.done ? 0 : 100);
        if (itemSlider) itemSlider.value = String(item.progress);
        syncItemProgressUi();
        var becomingDone = !wasDone && !!item.done;
        var becomingUndone = wasDone && !item.done;
        var popOrigin = null;
        var origin = originBtn || checkBtn;
        if (becomingDone && origin && origin.getBoundingClientRect) {
          var checkRect = origin.getBoundingClientRect();
          popOrigin = {
            x: checkRect.left + checkRect.width / 2,
            y: checkRect.top + checkRect.height / 2
          };
        }
        emitChange({
          animateItemId: item.id,
          flipWasDone: wasDone,
          focusTextItemId: item.id,
        });
        if (becomingDone) {
          // Prefer the rebuilt checkbox so the scale pop lands on the new node.
          var nextRow = findItemRow(item.id);
          var nextCheck = nextRow && nextRow.querySelector('.tp-completion-check');
          playSubtaskCompletePop(nextCheck || popOrigin, { sound: true });
        } else if (becomingUndone) {
          playCompletionUiSound('uncomplete');
        }
        onResize();
      }

      checkBtn.addEventListener('click', function () {
        toggleItemDone(checkBtn);
      });

      function setItemProgressFromFader(p, meta) {
        setItemProgress(item, p);
        if (itemSlider) itemSlider.value = String(item.progress);
        playSliderProgressTick(p);
        syncItemProgressUi();
        updateProgressUi({ deferDoneListReveal: true });
        onChange(CT.normalizeCompletionData(data));
        if (!meta.commit) return;
        var wasDone = meta.startProgress >= 100;
        var nowDone = !!item.done;
        if (wasDone !== nowDone) {
          var becomingDone = !wasDone && nowDone;
          emitChange({
            animateItemId: item.id,
            flipWasDone: wasDone,
            focusTextItemId: item.id,
          });
          if (becomingDone) {
            var nextRow = findItemRow(item.id);
            var nextCheck =
              nextRow && nextRow.querySelector('.tp-completion-check');
            playSubtaskCompletePop(nextCheck || checkBtn, { sound: true });
          } else {
            playCompletionUiSound('uncomplete');
          }
        } else {
          renderList();
        }
        onResize();
      }

      bindProgressFader(checkBtn, {
        getProgress: function () {
          return CT.itemProgress(item);
        },
        setProgress: setItemProgressFromFader,
        isEnabled: function () {
          return !isLinked && !CT.isItemBlocked(item);
        },
        visualEls: completeBtn ? [completeBtn] : null,
        hudAnchor: checkWrap,
      });

      if (completeBtn) {
        completeBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (completeBtn.disabled) return;
          toggleItemDone(completeBtn);
        });
        bindProgressFader(completeBtn, {
          getProgress: function () {
            return CT.itemProgress(item);
          },
          setProgress: setItemProgressFromFader,
          isEnabled: function () {
            return !completeBtn.disabled && !CT.isItemBlocked(item);
          },
          visualEls: [checkBtn],
          hudAnchor: checkWrap,
        });
      }

      if (itemSlider && !isLinked) {
        function handleItemSlider() {
          var v = Number(itemSlider.value);
          setItemProgress(item, v);
          playSliderProgressTick(v);
          syncItemProgressUi();
          updateProgressUi({ deferDoneListReveal: true });
          onChange(CT.normalizeCompletionData(data));
        }

        itemSlider.addEventListener('input', handleItemSlider);
        itemSlider.addEventListener('change', function () {
          var wasDone = li.classList.contains('is-done');
          handleItemSlider();
          var nowDone = !!item.done;
          if (wasDone !== nowDone) {
            var becomingDone = !wasDone && nowDone;
            var popOrigin = null;
            if (becomingDone && checkBtn.getBoundingClientRect) {
              var sliderCheckRect = checkBtn.getBoundingClientRect();
              popOrigin = {
                x: sliderCheckRect.left + sliderCheckRect.width / 2,
                y: sliderCheckRect.top + sliderCheckRect.height / 2
              };
            }
            emitChange({
              animateItemId: item.id,
              flipWasDone: wasDone,
              focusTextItemId: item.id,
            });
            if (becomingDone) {
              var nextRow = findItemRow(item.id);
              var nextCheck = nextRow && nextRow.querySelector('.tp-completion-check');
              // Slider already played the 100% tick — silent visual pop only.
              playSubtaskCompletePop(nextCheck || popOrigin, { sound: false });
            } else if (wasDone && !nowDone) {
              playCompletionUiSound('uncomplete');
            }
          } else {
            renderList();
          }
          onResize();
        });
      }

      if (textLink) {
        textLink.addEventListener('click', function (e) {
          e.preventDefault();
          openLinkedCard(CT.itemLinkedCardId(item));
        });
      }

      if (textInput && !isLinked) {
        textInput.addEventListener('change', function () {
          var trimmed = textInput.value.trim();
          if (!trimmed) {
            removeItem(item.id, { silent: true });
            return;
          }
          item.text = trimmed;
          delete itemSpellReverts[item.id];
          clearSplitRevertTracking([item.id]);
          var persisted = applyNormalizedKeepingDrafts(data);
          updateProgressUi();
          onChange(persisted);
          refineItemAfterCommit(item.id, trimmed);
        });

        // Discard untitled drafts when focus leaves without a name
        // (change does not fire if the field stayed empty).
        textInput.addEventListener('blur', function () {
          if (suppressEmptyDraftDiscard) return;
          if (!(textInput.value || '').trim()) {
            removeItem(item.id, { silent: true });
          }
        });

        textInput.addEventListener('input', function () {
          delete itemSpellReverts[item.id];
          clearSplitRevertTracking([item.id]);
          if (spellcheckingItemIds[item.id]) {
            itemSpellTokens[item.id] = (itemSpellTokens[item.id] || 0) + 1;
            delete spellcheckingItemIds[item.id];
            paintItemSpellchecking(item.id);
          }
          var existing = li.querySelector('.tp-spell-revert');
          if (existing && typeof existing._spellRevertDismiss === 'function') {
            existing._spellRevertDismiss();
          }
        });

        textInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            textInput.blur();
          }
        });
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', function () {
          removeItem(item.id);
        });
      }

      if (blockedBtn) {
        blockedBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (item.done) return;
          toggleItemBlocked(item.id);
        });
      }

      syncItemProgressUi();

      if (
        !isLinked &&
        itemSpellReverts[item.id] &&
        itemSpellReverts[item.id] !== (item.text || '').trim()
      ) {
        showItemSpellRevert(item.id, itemSpellReverts[item.id]);
      } else if (itemSpellReverts[item.id]) {
        delete itemSpellReverts[item.id];
      }
      if (!isLinked && itemSplitReverts[item.id]) {
        showItemSplitRevert(item.id);
      }
    }

    function renderNestedNode(node, depth) {
      var li = document.createElement('li');
      li.className =
        'tp-completion-item tp-completion-item--nested' +
        (node.done ? ' is-done' : '') +
        (node.linkedCardId ? ' is-linked' : '') +
        (node.isCycle ? ' is-cycle' : '');
      li.dataset.depth = String(depth);
      if (node.id) li.dataset.id = 'nested-' + node.id;
      if (node.linkedCardId) li.dataset.linkedCardId = node.linkedCardId;

      var mainRow = document.createElement('div');
      mainRow.className = 'tp-completion-item-main';

      var checkWrap = document.createElement('div');
      checkWrap.className = 'tp-completion-check-wrap';
      var checkBtn = document.createElement('button');
      checkBtn.type = 'button';
      checkBtn.className =
        'tp-completion-check' + (node.done ? ' is-checked' : '');
      checkBtn.innerHTML = CHECK_ICON_SVG;
      checkBtn.disabled = true;
      syncCheckButton(checkBtn, !!node.done, node.progress);
      checkWrap.appendChild(checkBtn);

      var titleEl;
      if (node.linkedCardId && !node.isCycle) {
        titleEl = document.createElement('button');
        titleEl.type = 'button';
        titleEl.className = 'tp-completion-text-link';
        titleEl.textContent = node.text || 'Carte li\u00e9e';
        titleEl.title = 'Ouvrir la carte';
        titleEl.addEventListener('click', function () {
          openLinkedCard(node.linkedCardId);
        });
      } else {
        titleEl = document.createElement('span');
        titleEl.className = 'tp-completion-text tp-completion-text--readonly';
        titleEl.textContent = node.text || '';
        if (node.isCycle) {
          titleEl.title = 'Lien circulaire \u2014 d\u00e9j\u00e0 affich\u00e9 plus haut';
        }
      }

      var pctEl = document.createElement('span');
      pctEl.className = 'tp-completion-nested-pct';
      pctEl.textContent = CT.clampProgress(node.progress) + '\u00a0%';
      pctEl.style.color = completionColorForProgress(node.progress);

      mainRow.appendChild(checkWrap);
      mainRow.appendChild(titleEl);
      mainRow.appendChild(pctEl);
      li.appendChild(mainRow);

      if (node.isCycle) {
        var cycleHint = document.createElement('p');
        cycleHint.className = 'tp-completion-cycle-hint';
        cycleHint.textContent = 'Lien circulaire';
        li.appendChild(cycleHint);
      }

      return li;
    }

    function appendNestedChildren(listTarget, parentItem, treeNode) {
      if (!treeNode || !Array.isArray(treeNode.children) || !treeNode.children.length) {
        return;
      }
      treeNode.children.forEach(function (child) {
        listTarget.appendChild(renderNestedNode(child, 2));
      });
    }

    function renderItem(item, opts) {
      opts = opts || {};
      var isLinked = CT.isLinkedItem(item);
      var treeNode = linkedTreeByItemId[item.id] || null;
      var itemBlocked = CT.isItemBlocked(item);
      var li = document.createElement('li');
      li.className =
        'tp-completion-item tp-completion-item--depth1' +
        (item.done ? ' is-done' : '') +
        (itemBlocked ? ' is-blocked' : '') +
        (isLinked ? ' is-linked' : '');
      li.dataset.id = item.id;
      li.dataset.depth = '1';
      if (isLinked) li.dataset.linkedCardId = CT.itemLinkedCardId(item);

      var mainRow = document.createElement('div');
      mainRow.className = 'tp-completion-item-main';

      var checkWrap = document.createElement('div');
      checkWrap.className = 'tp-completion-check-wrap';
      var checkBtn = document.createElement('button');
      checkBtn.type = 'button';
      checkBtn.className = 'tp-completion-check' + (item.done ? ' is-checked' : '');
      checkBtn.innerHTML = CHECK_ICON_SVG;
      syncCheckButton(checkBtn, item.done, CT.itemProgress(item), {
        blocked: itemBlocked
      });
      checkWrap.appendChild(checkBtn);

      var titleEl;
      if (isLinked) {
        titleEl = document.createElement('button');
        titleEl.type = 'button';
        titleEl.className = 'tp-completion-text-link';
        titleEl.textContent = item.text;
        titleEl.title = 'Ouvrir la carte li\u00e9e';
        titleEl.setAttribute('aria-label', 'Ouvrir\u00a0: ' + item.text);
      } else {
        titleEl = document.createElement('input');
        titleEl.type = 'text';
        titleEl.className = 'tp-input tp-completion-text';
        titleEl.value = item.text;
        titleEl.placeholder = 'Nouvelle sous-t\u00e2che\u2026';
        titleEl.setAttribute('aria-label', 'Texte de la sous-t\u00e2che');
        if (spellcheckingItemIds[item.id]) {
          titleEl.classList.add('is-spellchecking');
          titleEl.setAttribute('aria-busy', 'true');
        }
      }

      var blockedBtn = document.createElement('button');
      blockedBtn.type = 'button';
      blockedBtn.className =
        'tp-completion-blocked-btn' + (itemBlocked ? ' is-blocked' : '');
      blockedBtn.innerHTML = '<i class="ti ti-player-pause" aria-hidden="true"></i>';
      blockedBtn.setAttribute('aria-pressed', itemBlocked ? 'true' : 'false');
      blockedBtn.setAttribute(
        'aria-label',
        itemBlocked
          ? 'D\u00e9bloquer la sous-t\u00e2che'
          : 'Marquer la sous-t\u00e2che comme bloqu\u00e9e'
      );
      blockedBtn.title = itemBlocked ? 'D\u00e9bloquer' : 'Bloqu\u00e9';
      if (item.done) blockedBtn.disabled = true;

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'tp-completion-delete';
      deleteBtn.setAttribute('aria-label', isLinked ? 'Retirer le lien' : 'Supprimer');
      deleteBtn.title = isLinked ? 'Retirer le lien' : 'Supprimer';
      deleteBtn.innerHTML = TRASH_ICON_SVG;

      var completeBtn = null;
      if (!isLinked) {
        completeBtn = document.createElement('button');
        completeBtn.type = 'button';
        completeBtn.className =
          'tp-completion-item-complete' + (item.done ? ' is-complete' : '');
        completeBtn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>';
        completeBtn.setAttribute('aria-pressed', item.done ? 'true' : 'false');
        completeBtn.setAttribute(
          'aria-label',
          item.done
            ? 'Marquer comme non termin\u00e9'
            : 'Marquer comme termin\u00e9'
        );
        completeBtn.title = item.done
          ? 'Non termin\u00e9 \u2014 maintenir + glisser pour ajuster'
          : 'Terminer \u2014 maintenir + glisser pour ajuster';
        if (itemBlocked) completeBtn.disabled = true;
      }

      var promoteBtn = null;
      if (!isLinked && CT.itemHasChecklist(item)) {
        promoteBtn = document.createElement('button');
        promoteBtn.type = 'button';
        promoteBtn.className = 'tp-completion-promote';
        promoteBtn.innerHTML =
          '<i class="ti ti-square-arrow-up" aria-hidden="true"></i>';
        promoteBtn.setAttribute('aria-label', 'Convertir en carte');
        promoteBtn.title = 'Convertir en carte';
      }

      mainRow.appendChild(titleEl);
      if (!isLinked && spellcheckingItemIds[item.id]) {
        var spellSpinner = document.createElement('span');
        spellSpinner.className = 'tp-completion-spell-spinner';
        spellSpinner.setAttribute('aria-hidden', 'true');
        spellSpinner.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
        mainRow.appendChild(spellSpinner);
      }

      if (!isLinked) {
        var itemEstimate = createEstimateChip(CT, {
          t: trelloT,
          scales: currentEstimateScales(),
          minutes: CT.itemEstimatedMinutes(item, linkedSnapshots),
          compact: true,
          estimating: !!estimatingItemIds[item.id],
          ariaLabel: 'Estimation de la sous-t\u00e2che',
          onChange: function (mins) {
            delete estimatingItemIds[item.id];
            data = CT.applyItemEstimate(data, item.id, mins, { lock: true });
            var live = findLiveItem(item.id);
            if (live) {
              item.estimatedMinutes = live.estimatedMinutes;
              item.estimatedMinutesLocked = live.estimatedMinutesLocked;
            }
            updateProgressUi();
            emitChange();
            onResize();
          }
        });
        itemEstimate.el.dataset.estimateItemId = item.id;
        itemEstimate.el.classList.add('tp-completion-item-estimate');
        mainRow.appendChild(itemEstimate.el);
      }

      if (promoteBtn) mainRow.appendChild(promoteBtn);
      mainRow.appendChild(blockedBtn);
      if (completeBtn) mainRow.appendChild(completeBtn);
      mainRow.appendChild(deleteBtn);

      // Linked cards have no slider — keep the progress circle on the title row.
      if (isLinked) {
        mainRow.insertBefore(checkWrap, mainRow.firstChild);
      }

      li.appendChild(mainRow);

      if (!isLinked) {
        var sliderRow = document.createElement('div');
        sliderRow.className = 'tp-completion-item-slider-row';

        var itemProgressVal = CT.itemProgress(item);

        var sliderWrap = document.createElement('div');
        sliderWrap.className = 'field-slider';

        var itemSlider = document.createElement('input');
        itemSlider.type = 'range';
        itemSlider.className = 'field-range tp-completion-item-slider';
        itemSlider.min = '0';
        itemSlider.max = '100';
        itemSlider.step = '1';
        itemSlider.value = String(itemProgressVal);
        itemSlider.setAttribute('aria-label', 'Progr\u00e8s de la sous-t\u00e2che');
        applySliderProgressTrack(itemSlider, itemProgressVal, {
          blocked: itemBlocked
        });

        var itemValEl = document.createElement('span');
        itemValEl.className = 'tp-completion-item-val tp-completion-field-val';
        itemValEl.textContent = itemProgressVal + '\u00a0%';
        if (itemBlocked) itemValEl.style.color = BLOCKED_ACCENT;

        sliderWrap.appendChild(itemSlider);
        sliderRow.appendChild(checkWrap);
        sliderRow.appendChild(sliderWrap);
        sliderRow.appendChild(itemValEl);
        li.appendChild(sliderRow);

        if (itemBlocked) {
          var motif = createBlockedMotifField({
            className: 'tp-completion-item-motif',
            blockedReasons: item.blockedReasons || [],
            onChange: function (reasons) {
              data = CT.setItemBlockedReasons(data, item.id, reasons);
              var live = findLiveItem(item.id);
              if (live) item.blockedReasons = live.blockedReasons;
              emitChange();
              notifyBlockedChange('item-reason');
              onResize();
            }
          });
          if (motif) li.appendChild(motif.el);
        }

        li.appendChild(renderChecklistSection(item));
      } else {
        var linkMeta = document.createElement('div');
        linkMeta.className = 'tp-completion-link-meta';
        var linkHint = document.createElement('span');
        linkHint.className = 'tp-completion-link-hint';
        linkHint.textContent =
          treeNode && treeNode.isCycle
            ? 'Lien circulaire'
            : 'Carte li\u00e9e';
        var linkPct = document.createElement('span');
        linkPct.className = 'tp-completion-link-pct';
        linkPct.textContent = CT.itemProgress(item) + '\u00a0%';
        linkPct.style.color = completionColorForProgress(CT.itemProgress(item));
        linkMeta.appendChild(linkHint);
        linkMeta.appendChild(linkPct);
        var linkMins = CT.itemEstimatedMinutes(item, linkedSnapshots);
        if (linkMins != null) {
          var linkEstimate = createEstimateChip(CT, {
            scales: currentEstimateScales(),
            minutes: linkMins,
            compact: true,
            readOnly: true,
            ariaLabel: 'Estimation de la carte li\u00e9e'
          });
          linkMeta.appendChild(linkEstimate.el);
        }
        li.appendChild(linkMeta);
      }

      bindItemRow(li, item, { readOnly: !!opts.readOnly, promoteBtn: promoteBtn });
      return li;
    }

    function renderChecklistSection(parentItem) {
      var section = document.createElement('div');
      section.className = 'tp-completion-checklist';
      section.dataset.parentId = parentItem.id;

      var checklist = Array.isArray(parentItem.items) ? parentItem.items : [];

      var list = document.createElement('ul');
      list.className = 'tp-completion-checklist-list';
      checklist.forEach(function (nested) {
        list.appendChild(renderChecklistItem(parentItem, nested));
      });
      section.appendChild(list);

      var addRow = document.createElement('div');
      addRow.className = 'tp-completion-checklist-add';
      var addInput = document.createElement('input');
      addInput.type = 'text';
      addInput.className = 'tp-input tp-completion-checklist-add-input';
      addInput.placeholder = 'Ajouter une sous-sous-t\u00e2che\u2026';
      addInput.setAttribute('aria-label', 'Nouvelle sous-sous-t\u00e2che');
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'tp-completion-checklist-add-btn';
      addBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
      addBtn.setAttribute('aria-label', 'Ajouter');
      addBtn.title = 'Ajouter';

      function submitChecklistAdd() {
        var text = addInput.value.trim();
        if (!text) return;
        var result = CT.addChecklistItem(data, parentItem.id, text);
        if (!result || !result.item) return;
        data = result.data;
        addInput.value = '';
        playCompletionUiSound('add');
        emitChange({ focusTextItemId: parentItem.id });
        onResize();
      }

      addBtn.addEventListener('click', function (e) {
        e.preventDefault();
        submitChecklistAdd();
      });
      addInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitChecklistAdd();
        }
      });

      addRow.appendChild(addInput);
      addRow.appendChild(addBtn);
      section.appendChild(addRow);
      return section;
    }

    function renderChecklistItem(parentItem, nested) {
      var li = document.createElement('li');
      var nestedProgress = CT.itemProgress(nested);
      li.className =
        'tp-completion-checklist-item tp-completion-item--depth2' +
        (nested.done ? ' is-done' : '');
      li.dataset.id = nested.id;
      li.dataset.parentId = parentItem.id;
      li.dataset.depth = '2';

      var mainRow = document.createElement('div');
      mainRow.className = 'tp-completion-item-main tp-completion-checklist-main';

      var checkWrap = document.createElement('div');
      checkWrap.className = 'tp-completion-check-wrap';
      var checkBtn = document.createElement('button');
      checkBtn.type = 'button';
      checkBtn.className =
        'tp-completion-check' + (nested.done ? ' is-checked' : '');
      checkBtn.innerHTML = CHECK_ICON_SVG;
      syncCheckButton(checkBtn, !!nested.done, nestedProgress);
      checkWrap.appendChild(checkBtn);

      var titleEl = document.createElement('input');
      titleEl.type = 'text';
      titleEl.className = 'tp-input tp-completion-text tp-completion-checklist-text';
      titleEl.value = nested.text || '';
      titleEl.placeholder = 'Sous-sous-t\u00e2che\u2026';
      titleEl.setAttribute('aria-label', 'Texte de la sous-sous-t\u00e2che');

      var detailsBtn = document.createElement('button');
      detailsBtn.type = 'button';
      detailsBtn.className = 'tp-completion-checklist-details-btn';
      detailsBtn.innerHTML =
        '<i class="ti ti-chevron-down" aria-hidden="true"></i>';
      detailsBtn.setAttribute('aria-expanded', 'false');
      detailsBtn.setAttribute('aria-label', 'Progr\u00e8s');
      detailsBtn.title = 'Progr\u00e8s';

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'tp-completion-delete';
      deleteBtn.setAttribute('aria-label', 'Supprimer');
      deleteBtn.title = 'Supprimer';
      deleteBtn.innerHTML = TRASH_ICON_SVG;

      var nestedEstimate = createEstimateChip(CT, {
        t: trelloT,
        scales: currentEstimateScales(),
        minutes: CT.clampEstimatedMinutes(nested.estimatedMinutes),
        compact: true,
        ariaLabel: 'Estimation de la sous-sous-t\u00e2che',
        onChange: function (mins) {
          data = CT.applyChecklistItemEstimate(
            data,
            parentItem.id,
            nested.id,
            mins,
            { lock: true }
          );
          emitChange();
          onResize();
        }
      });
      nestedEstimate.el.classList.add('tp-completion-item-estimate');

      mainRow.appendChild(checkWrap);
      mainRow.appendChild(titleEl);
      mainRow.appendChild(detailsBtn);
      mainRow.appendChild(deleteBtn);
      mainRow.appendChild(nestedEstimate.el);
      li.appendChild(mainRow);

      var details = document.createElement('div');
      details.className = 'tp-completion-checklist-details';
      details.hidden = true;

      var sliderRow = document.createElement('div');
      sliderRow.className = 'tp-completion-item-slider-row';

      var sliderWrap = document.createElement('div');
      sliderWrap.className = 'field-slider';
      var itemSlider = document.createElement('input');
      itemSlider.type = 'range';
      itemSlider.className = 'field-range tp-completion-item-slider';
      itemSlider.min = '0';
      itemSlider.max = '100';
      itemSlider.step = '1';
      itemSlider.value = String(nestedProgress);
      itemSlider.setAttribute('aria-label', 'Progr\u00e8s de la sous-sous-t\u00e2che');
      applySliderProgressTrack(itemSlider, nestedProgress);

      var itemValEl = document.createElement('span');
      itemValEl.className = 'tp-completion-item-val tp-completion-field-val';
      itemValEl.textContent = nestedProgress + '\u00a0%';

      sliderWrap.appendChild(itemSlider);
      sliderRow.appendChild(sliderWrap);
      sliderRow.appendChild(itemValEl);
      details.appendChild(sliderRow);
      li.appendChild(details);

      function syncNestedUi() {
        var liveParent = findLiveItem(parentItem.id);
        var liveNested = null;
        if (liveParent && Array.isArray(liveParent.items)) {
          for (var i = 0; i < liveParent.items.length; i++) {
            if (liveParent.items[i].id === nested.id) {
              liveNested = liveParent.items[i];
              break;
            }
          }
        }
        var p = liveNested ? CT.itemProgress(liveNested) : CT.itemProgress(nested);
        var done = liveNested ? !!liveNested.done : !!nested.done;
        if (liveNested) {
          nested.progress = liveNested.progress;
          nested.done = liveNested.done;
        }
        itemSlider.value = String(p);
        applySliderProgressTrack(itemSlider, p);
        itemValEl.textContent = p + '\u00a0%';
        syncCheckButton(checkBtn, done, p);
        li.classList.toggle('is-done', done);
      }

      detailsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var open = details.hidden;
        details.hidden = !open;
        detailsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        detailsBtn.classList.toggle('is-open', open);
        onResize();
      });

      checkBtn.addEventListener('click', function () {
        var next = nested.done ? 0 : 100;
        data = CT.applyChecklistItemProgress(
          data,
          parentItem.id,
          nested.id,
          next
        );
        syncNestedUi();
        emitChange({
          animateItemId: parentItem.id,
          flipWasDone: !!parentItem.done,
        });
        if (next >= 100) {
          playSubtaskCompletePop(checkBtn, { sound: true });
        } else {
          playCompletionUiSound('uncomplete');
        }
        onResize();
      });

      bindProgressFader(checkBtn, {
        getProgress: function () {
          return CT.itemProgress(nested);
        },
        setProgress: function (p, meta) {
          data = CT.applyChecklistItemProgress(
            data,
            parentItem.id,
            nested.id,
            p
          );
          playSliderProgressTick(p);
          syncNestedUi();
          updateProgressUi({ deferDoneListReveal: true });
          onChange(CT.normalizeCompletionData(data));
          if (!meta.commit) return;
          var wasDone = meta.startProgress >= 100;
          var nowDone = !!nested.done;
          if (wasDone !== nowDone) {
            emitChange({
              animateItemId: parentItem.id,
              flipWasDone: wasDone,
            });
            if (nowDone) {
              playSubtaskCompletePop(checkBtn, { sound: true });
            } else {
              playCompletionUiSound('uncomplete');
            }
          } else {
            renderList();
          }
          onResize();
        },
        hudAnchor: checkWrap,
      });

      function handleNestedSlider() {
        var v = Number(itemSlider.value);
        data = CT.applyChecklistItemProgress(
          data,
          parentItem.id,
          nested.id,
          v
        );
        playSliderProgressTick(v);
        syncNestedUi();
        updateProgressUi({ deferDoneListReveal: true });
        onChange(CT.normalizeCompletionData(data));
      }

      itemSlider.addEventListener('input', handleNestedSlider);
      itemSlider.addEventListener('change', function () {
        handleNestedSlider();
        emitChange();
        onResize();
      });

      titleEl.addEventListener('change', function () {
        var trimmed = titleEl.value.trim();
        if (!trimmed) {
          data = CT.removeChecklistItem(data, parentItem.id, nested.id);
          playCompletionUiSound('trash');
          emitChange();
          onResize();
          return;
        }
        data = CT.applyChecklistItemText(
          data,
          parentItem.id,
          nested.id,
          trimmed
        );
        emitChange();
      });
      titleEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          titleEl.blur();
        }
      });

      deleteBtn.addEventListener('click', function () {
        data = CT.removeChecklistItem(data, parentItem.id, nested.id);
        playCompletionUiSound('trash');
        emitChange();
        onResize();
      });

      return li;
    }

    function promoteItemToCard(item) {
      if (!item || CT.isLinkedItem(item)) return Promise.resolve(null);
      var promoteFn = onPromoteSubtask;
      if (!promoteFn && trelloT && typeof CT.promoteSubtaskToCard === 'function') {
        promoteFn = function (itemId) {
          return CT.promoteSubtaskToCard(trelloT, itemId);
        };
      }
      if (!promoteFn) {
        console.error('Completion promote: no promote handler');
        return Promise.resolve({ ok: false, reason: 'no-promote' });
      }
      return Promise.resolve()
        .then(function () {
          return promoteFn(item.id, item);
        })
        .then(function (result) {
          if (!result || !result.ok) {
            console.error('Completion promote failed', result);
            return result;
          }
          if (result.data) {
            data = CT.normalizeCompletionData(result.data);
          }
          emitChange();
          refreshLinkedTree({ skipPersist: true });
          if (result.cardId && onOpenLinkedCard) {
            try {
              onOpenLinkedCard(result.cardId);
            } catch (err) {
              console.error('Completion open promoted card failed', err);
            }
          }
          onResize();
          return result;
        })
        .catch(function (err) {
          console.error('Completion promote failed', err);
          return { ok: false, reason: 'threw', error: err };
        });
    }

    function renderList() {
      beginSuppressEmptyDraftDiscard();
      try {
        listEl.replaceChildren();
        doneListEl.replaceChildren();
        listSection.classList.toggle('is-empty', !data.items.length);
        listSection.classList.toggle('has-tree', data.items.length > 0);
        updateToolsUi();

        if (!data.items.length) {
          filterEmptyEl.hidden = true;
          updateDoneSectionUi(0);
          return;
        }

        var activeItems = [];
        var doneItems = [];
        data.items.forEach(function (item) {
          if (!itemMatchesQuery(item)) return;
          if (item.done) doneItems.push(item);
          else activeItems.push(item);
        });

        var showActive = shouldShowActiveList();
        var showDone = shouldShowDoneList(
          data.items.filter(function (item) {
            return item.done;
          }).length
        );

        function appendItemWithNest(target, item) {
          target.appendChild(renderItem(item));
          appendNestedChildren(target, item, linkedTreeByItemId[item.id]);
        }

        if (showActive) {
          activeItems.forEach(function (item) {
            appendItemWithNest(listEl, item);
          });
        }
        if (showDone) {
          doneItems.forEach(function (item) {
            appendItemWithNest(doneListEl, item);
          });
        }

        var visibleCount =
          (showActive ? activeItems.length : 0) +
          (showDone ? doneItems.length : 0);
        var filtering =
          toolsVisible() &&
          (!!searchQuery || effectiveStatusFilter() !== 'all');
        var emptyVisible = filtering && visibleCount === 0 && data.items.length > 0;
        filterEmptyEl.hidden = !emptyVisible;
        if (emptyVisible) {
          var hiddenDoneMatches =
            !showDone && doneItems.length > 0 && showActive && !!searchQuery;
          filterEmptyEl.textContent = hiddenDoneMatches
            ? 'Des t\u00e2ches termin\u00e9es correspondent \u2014 activez \u00ab Afficher les t\u00e2ches termin\u00e9es \u00bb.'
            : 'Aucune sous-t\u00e2che ne correspond.';
        }

        updateDoneSectionUi(
          data.items.filter(function (item) {
            return item.done;
          }).length
        );
      } finally {
        endSuppressEmptyDraftDiscard();
      }
    }

    showDoneCheckbox.addEventListener('change', function () {
      showCompleted = !!showDoneCheckbox.checked;
      saveShowDonePreference(showCompleted);
      renderList();
      onResize();
    });

    searchInput.addEventListener('input', function () {
      searchQuery = String(searchInput.value || '')
        .trim()
        .toLowerCase();
      renderList();
      onResize();
    });

    filterSelect.addEventListener('change', function () {
      statusFilter = filterSelect.value || 'all';
      if (statusFilter !== 'all' && statusFilter !== 'active' && statusFilter !== 'done') {
        statusFilter = 'all';
      }
      renderList();
      onResize();
    });

    function removeItem(id, opts) {
      opts = opts || {};
      delete itemSpellReverts[id];
      delete spellcheckingItemIds[id];
      delete itemSpellTokens[id];
      delete estimatingItemIds[id];
      clearSplitRevertTracking([id]);
      var nextItems = data.items.filter(function (item) {
        return item.id !== id;
      });
      if (!nextItems.length && data.items.length) {
        data.progress = CT.computeCardProgress(data, linkedSnapshots).percent;
      }
      data.items = nextItems;
      delete linkedTreeByItemId[id];
      if (!opts.silent) playCompletionUiSound('trash');
      emitChange();
      refreshLinkedTree({ skipPersist: true });
      onResize();
    }

    function addItem(text, estimateOpts) {
      estimateOpts = estimateOpts || {};
      var trimmed = (text || '').trim();
      if (!trimmed) return null;
      var rawItem = {
        id: CT.generateId(),
        text: trimmed,
        progress: 0,
      };
      var est = CT.clampEstimatedMinutes(estimateOpts.estimatedMinutes);
      if (est != null) {
        rawItem.estimatedMinutes = est;
        if (estimateOpts.lock) rawItem.estimatedMinutesLocked = true;
      }
      if (estimateOpts.blocked === true) rawItem.blocked = true;
      var item = CT.normalizeItem(rawItem);
      if (!item) return null;
      data.items.push(item);
      removeSuggestionMatch(trimmed);
      playCompletionUiSound(estimateOpts.blocked === true ? 'block' : 'add');
      emitChange();
      if (estimateOpts.blocked === true) notifyBlockedChange('add');
      onResize();
      return item;
    }

    /** Untitled row kept in UI only until named (or discarded on blur). */
    function addDraftItem() {
      var item = {
        id: CT.generateId(),
        text: '',
        progress: 0,
        done: false
      };
      data.items.push(item);
      playCompletionUiSound('add');
      renderList();
      updateProgressUi();
      onResize();
      focusItemTextInput(item.id);
      return item;
    }

    function addLinkedCard(card) {
      if (!card || !card.id) return null;
      var cardId = String(card.id).trim();
      if (!cardId || (currentCardId && cardId === currentCardId)) return null;
      if (linkedIdsAlreadyUsed()[cardId]) return null;
      var name =
        typeof card.name === 'string' && card.name.trim()
          ? card.name.trim()
          : 'Carte li\u00e9e';
      var progress =
        typeof card.progress === 'number' && isFinite(card.progress)
          ? CT.clampProgress(card.progress)
          : 0;
      var item = CT.normalizeItem({
        id: CT.generateId(),
        text: name,
        progress: progress,
        linkedCardId: cardId,
      });
      if (!item) return null;
      data.items.push(item);
      playCompletionUiSound('add');
      closeLinkPicker();
      emitChange();
      refreshLinkedTree();
      onResize();
      return item;
    }

    function setSuggestStatus(text, visible) {
      if (!suggestStatusEl) return;
      if (!visible || !text) {
        suggestStatusEl.hidden = true;
        suggestStatusEl.textContent = '';
        return;
      }
      suggestStatusEl.hidden = false;
      suggestStatusEl.textContent = text;
    }

    function normalizeSuggestionRow(raw) {
      if (typeof raw === 'string') {
        var textOnly = raw.trim();
        return textOnly ? { type: 'text', text: textOnly } : null;
      }
      if (!raw || typeof raw !== 'object') return null;
      var text =
        typeof raw.text === 'string'
          ? raw.text.trim()
          : typeof raw.label === 'string'
            ? raw.label.trim()
            : '';
      var cardId =
        raw.cardId != null
          ? String(raw.cardId).trim()
          : raw.linkedCardId != null
            ? String(raw.linkedCardId).trim()
            : '';
      var type =
        raw.type === 'link' || raw.kind === 'link' || cardId ? 'link' : 'text';
      var estMins = CT.clampEstimatedMinutes(
        raw.estimatedMinutes != null
          ? raw.estimatedMinutes
          : raw.minutes != null
            ? raw.minutes
            : raw.durationMinutes
      );
      if (type === 'link') {
        if (!cardId || (currentCardId && cardId === currentCardId)) return null;
        if (linkedIdsAlreadyUsed()[cardId]) return null;
        var linkRow = {
          type: 'link',
          text: text || 'Carte li\u00e9e',
          cardId: cardId,
          list: typeof raw.list === 'string' ? raw.list : ''
        };
        if (estMins != null) linkRow.estimatedMinutes = estMins;
        return linkRow;
      }
      if (!text) return null;
      var textRow = { type: 'text', text: text };
      if (estMins != null) textRow.estimatedMinutes = estMins;
      return textRow;
    }

    function suggestionKey(row) {
      if (!row) return '';
      if (row.type === 'link' && row.cardId) return 'link:' + row.cardId;
      return 'text:' + String(row.text || '').trim().toLocaleLowerCase('fr-FR');
    }

    function removeSuggestionMatch(match) {
      var dropKey = '';
      if (typeof match === 'string') {
        dropKey = 'text:' + match.trim().toLocaleLowerCase('fr-FR');
      } else if (match && typeof match === 'object') {
        dropKey = suggestionKey(normalizeSuggestionRow(match) || match);
      }
      if (!dropKey) return;
      currentSuggestions = currentSuggestions.filter(function (s) {
        return suggestionKey(s) !== dropKey;
      });
      renderSuggestions();
    }

    function renderSuggestions() {
      if (!suggestListEl || !suggestionsSection) return;
      suggestListEl.replaceChildren();
      if (!suggestSubtasksFn) {
        suggestionsSection.hidden = true;
        return;
      }
      suggestionsSection.hidden = false;
      if (suggestionsLoading) {
        setSuggestStatus('G\u00e9n\u00e9ration des suggestions\u2026', true);
        return;
      }
      if (!currentSuggestions.length) {
        setSuggestStatus('Aucune suggestion pour le moment.', true);
        return;
      }
      setSuggestStatus('', false);
      currentSuggestions.forEach(function (suggestion) {
        var row = normalizeSuggestionRow(suggestion);
        if (!row || !row.text) return;
        var isLink = row.type === 'link' && row.cardId;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'tp-completion-suggestion' + (isLink ? ' is-link' : '');
        btn.setAttribute('role', 'listitem');
        btn.setAttribute('data-suggestion', row.text);
        if (isLink) btn.setAttribute('data-linked-card-id', row.cardId);
        if (isLink) {
          var icon = document.createElement('i');
          icon.className = 'ti ti-link';
          icon.setAttribute('aria-hidden', 'true');
          var labelEl = document.createElement('span');
          labelEl.className = 'tp-completion-suggestion-label';
          labelEl.textContent = row.text;
          btn.appendChild(icon);
          btn.appendChild(labelEl);
          if (row.list) {
            var listEl = document.createElement('span');
            listEl.className = 'tp-completion-suggestion-list';
            listEl.textContent = row.list;
            btn.appendChild(listEl);
          }
          btn.title =
            'Lier la carte\u00a0: ' +
            row.text +
            (row.list ? ' (' + row.list + ')' : '');
        } else {
          var sugLabel = row.text;
          if (row.estimatedMinutes != null) {
            var sugEst =
              CT.formatEstimateForScales
                ? CT.formatEstimateForScales(
                    row.estimatedMinutes,
                    currentEstimateScales()
                  )
                : CT.formatEstimateForScale
                  ? CT.formatEstimateForScale(
                      row.estimatedMinutes,
                      currentEstimateScales()[0]
                    )
                  : '';
            sugLabel += ' · ' + (sugEst || '');
          }
          btn.textContent = sugLabel;
          btn.title =
            'Ajouter\u00a0: ' +
            row.text +
            (row.estimatedMinutes != null
              ? ' (' +
                (CT.formatEstimateForScales
                  ? CT.formatEstimateForScales(
                      row.estimatedMinutes,
                      currentEstimateScales()
                    )
                  : CT.formatEstimateForScale(
                      row.estimatedMinutes,
                      currentEstimateScales()[0]
                    )) +
                ')'
              : '');
        }
        btn.addEventListener('click', function () {
          if (isLink) {
            btn.disabled = true;
            var added = addLinkedCard({
              id: row.cardId,
              name: row.text,
              list: row.list || ''
            });
            if (added) {
              removeSuggestionMatch(row);
            } else {
              btn.disabled = false;
              removeSuggestionMatch(row);
            }
            return;
          }
          var typed = row.text;
          var item = addItem(typed, {
            estimatedMinutes: row.estimatedMinutes
          });
          removeSuggestionMatch(row);
          if (item) refineItemAfterCommit(item.id, typed);
        });
        suggestListEl.appendChild(btn);
      });
      if (addTabComplete) addTabComplete.refresh();
      onResize();
    }

    function refreshSuggestions(force) {
      if (!suggestSubtasksFn) {
        suggestionsSection.hidden = true;
        return Promise.resolve();
      }
      var seq = ++suggestionsSeq;
      suggestionsLoading = true;
      renderSuggestions();
      return Promise.resolve()
        .then(function () {
          return suggestSubtasksFn({
            force: !!force,
            items: (data.items || []).map(function (it) {
              return {
                text: it.text,
                linkedCardId: CT.itemLinkedCardId(it) || undefined
              };
            })
          });
        })
        .then(function (list) {
          if (seq !== suggestionsSeq) return;
          var seen = Object.create(null);
          currentSuggestions = Array.isArray(list)
            ? list
                .map(normalizeSuggestionRow)
                .filter(Boolean)
                .filter(function (row) {
                  var key = suggestionKey(row);
                  if (!key || seen[key]) return false;
                  seen[key] = true;
                  return true;
                })
                .slice(0, 3)
            : [];
          suggestionsLoading = false;
          renderSuggestions();
        })
        .catch(function (err) {
          console.error('CompletionUI suggestions failed', err);
          if (seq !== suggestionsSeq) return;
          suggestionsLoading = false;
          currentSuggestions = [];
          setSuggestStatus(
            'Impossible de g\u00e9n\u00e9rer des suggestions (IA indisponible).',
            true
          );
          suggestionsSection.hidden = false;
          onResize();
        });
    }

    if (suggestRefreshBtn) {
      suggestRefreshBtn.addEventListener('click', function () {
        refreshSuggestions(true);
      });
    }
    if (suggestSubtasksFn) {
      // Defer so mount returns before first network call.
      setTimeout(function () {
        refreshSuggestions(false);
      }, 0);
    } else {
      suggestionsSection.hidden = true;
    }

    function findLiveItem(id) {
      for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].id === id) return data.items[i];
      }
      return null;
    }

    function showItemSpellRevert(itemId, originalText) {
      var live = findLiveItem(itemId);
      if (
        !live ||
        !originalText ||
        live.text === originalText ||
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.attachRevert !== 'function'
      ) {
        if (itemSpellReverts[itemId] === originalText) {
          delete itemSpellReverts[itemId];
        }
        return;
      }
      var li = findItemRow(itemId);
      if (!li) return;
      var mainRow = li.querySelector('.tp-completion-item-main');
      var del = li.querySelector('.tp-completion-delete');
      var textInput = li.querySelector('.tp-completion-text');
      if (!mainRow || !textInput) return;
      itemSpellReverts[itemId] = originalText;
      global.Spellcheck.attachRevert(mainRow, {
        className: 'tp-completion-spell-revert',
        before: del,
        previous: originalText,
        onRevert: function () {
          if (itemSpellReverts[itemId] !== originalText) return;
          var current = findLiveItem(itemId);
          if (!current) return;
          textInput.value = originalText;
          current.text = originalText;
          delete itemSpellReverts[itemId];
          var persisted = applyNormalizedKeepingDrafts(data);
          updateProgressUi();
          onChange(persisted);
        },
        onDismiss: function () {
          if (itemSpellReverts[itemId] === originalText) {
            delete itemSpellReverts[itemId];
          }
        }
      });
    }

    function addFromInput() {
      var original = (addInput.value || '').trim();
      if (!original) {
        addDraftItem();
        return;
      }
      // Commit immediately — split / spellcheck / estimate refine asynchronously.
      addInput.value = '';
      var item = addItem(original);
      addInput.focus();
      if (item) refineItemAfterCommit(item.id, original);
    }

    addBtn.addEventListener('click', addFromInput);
    addInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addFromInput();
      }
    });

    renderList();
    updateProgressUi();
    refreshLinkedTree({ skipPersist: false });

    return {
      setCardName: function (name, options) {
        options = options || {};
        var next = typeof name === 'string' ? name.trim() : '';
        if (
          !options.force &&
          onTitleChange &&
          (masterTitleDirty || document.activeElement === masterTitleEl)
        ) {
          return;
        }
        masterTitle = next;
        masterTitleDirty = false;
        syncMasterTitleUi({ force: !!options.force });
        if (cardNameEl) {
          var label = masterTitle || 'Carte';
          cardNameEl.textContent = label;
          cardNameEl.title = masterTitle ? masterTitle : '';
          cardNameEl.classList.remove('is-loading');
        }
        onResize();
      },
      getData: function () {
        return CT.normalizeCompletionData(data);
      },
      setData: function (next) {
        data = CT.normalizeCompletionData(next);
        renderList();
        updateProgressUi();
        refreshLinkedTree({ skipPersist: true });
        onResize();
      },
      addItem: function (text, estimateOpts) {
        return addItem(text, estimateOpts);
      },
      setMasterBlocked: function (blocked, opts) {
        opts = opts || {};
        data = CT.setMasterBlocked(data, !!blocked, {
          origin: opts.origin === 'status' ? 'status' : 'user'
        });
        syncMasterBlockedBtn();
        updateProgressUi();
        emitChange();
        notifyBlockedChange('api');
        onResize();
        return CT.normalizeCompletionData(data);
      },
      setMasterBlockedReasons: function (reasons, opts) {
        data = CT.setMasterBlockedReasons(data, reasons, opts);
        syncMasterBlockedBtn();
        updateProgressUi();
        emitChange();
        notifyBlockedChange('api');
        onResize();
        return CT.normalizeCompletionData(data);
      },
      isMasterBlockedByUser: function () {
        return CT.isMasterBlockedByUser(data);
      },
      hasBlockedSubtasks: function () {
        return CT.hasBlockedSubtasks(data);
      },
      masterBlockedOrigin: function () {
        return CT.masterBlockedOrigin(data);
      },
      setItemBlocked: function (itemId, blocked) {
        data = CT.setItemBlocked(data, itemId, !!blocked);
        emitChange();
        notifyBlockedChange('api');
        onResize();
        return CT.normalizeCompletionData(data);
      },
      setItemBlockedReasons: function (itemId, reasons) {
        data = CT.setItemBlockedReasons(data, itemId, reasons);
        emitChange();
        notifyBlockedChange('api');
        onResize();
        return CT.normalizeCompletionData(data);
      },
      clearAllBlocked: function () {
        data = CT.clearAllBlocked(data);
        syncMasterBlockedBtn();
        emitChange();
        notifyBlockedChange('api');
        onResize();
        return CT.normalizeCompletionData(data);
      },
      hasAnyBlocked: function () {
        return CT.hasAnyBlocked(data);
      },
      aggregateBlockedReasons: function () {
        return CT.aggregateBlockedReasons(data);
      },
      seedBlockedReasonsFromPriority: function (priorityReasons) {
        data = CT.seedBlockedReasonsFromPriority(data, priorityReasons);
        syncMasterBlockedBtn();
        emitChange();
        notifyBlockedChange('api');
        onResize();
        return CT.normalizeCompletionData(data);
      },
      applyItemEstimates: function (estimates, options) {
        var next = CT.applyItemEstimates(data, estimates, options || {});
        var prev = JSON.stringify(CT.normalizeCompletionData(data));
        var persisted = applyNormalizedKeepingDrafts(next);
        if (JSON.stringify(persisted) === prev) return persisted;
        // Clear estimating flags for items that now have a duration.
        if (persisted.items) {
          for (var i = 0; i < persisted.items.length; i++) {
            var row = persisted.items[i];
            if (
              row &&
              row.id &&
              CT.clampEstimatedMinutes(row.estimatedMinutes) != null
            ) {
              delete estimatingItemIds[row.id];
            }
          }
        }
        renderList();
        updateProgressUi();
        onChange(persisted);
        onResize();
        return persisted;
      },
      setEstimatingItemIds: function (ids) {
        var next = Object.create(null);
        if (Array.isArray(ids)) {
          for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            if (typeof id === 'string' && id) next[id] = true;
          }
        }
        estimatingItemIds = next;
        var wraps = containerEl.querySelectorAll('[data-estimate-item-id]');
        for (var w = 0; w < wraps.length; w++) {
          var wrap = wraps[w];
          var itemId = wrap.getAttribute('data-estimate-item-id');
          var chipApi = wrap._tpEstimateChip;
          if (!chipApi || typeof chipApi.setEstimating !== 'function') continue;
          chipApi.setEstimating(!!(itemId && estimatingItemIds[itemId]));
        }
      },
      getEstimateSummary: function () {
        var progress = CT.computeCardProgress(data, linkedSnapshots);
        return {
          percent: progress.percent,
          totalMinutes: CT.computeEstimatedTotal(data, linkedSnapshots),
          remainingMinutes: CT.computeEstimatedRemaining(data, linkedSnapshots),
          needingEstimate: CT.itemsNeedingEstimate(data),
          hasOffset: !!(
            data.items.length &&
            typeof data.estimatedMinutesOffset === 'number' &&
            data.estimatedMinutesOffset !== 0
          ),
          scales: currentEstimateScales(),
        };
      },
      getEstimateScales: function () {
        return currentEstimateScales();
      },
      setEstimateScales: function (nextScales) {
        applyEstimateScales(nextScales, { rerender: true });
      },
      addItem: addItem,
      addLinkedCard: addLinkedCard,
      refreshLinkedTree: refreshLinkedTree,
      /** Compact linked-tree map for AI Progrès summary (itemId → node). */
      getLinkedTreeByItemId: function () {
        var out = Object.create(null);
        Object.keys(linkedTreeByItemId).forEach(function (id) {
          var node = linkedTreeByItemId[id];
          if (!node) return;
          out[id] = node;
        });
        return out;
      },
      refreshSuggestions: refreshSuggestions,
      focusAddInput: function () {
        addInput.focus();
      },
      el: containerEl,
    };
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

    var hint = document.createElement('p');
    hint.className = 'tp-color-scheme-hint tp-progress-gradient-hint';
    hint.textContent =
      'Cliquez sur le dégradé pour ajouter un point. Glissez un point pour le déplacer.';
    editor.appendChild(hint);

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
    playAllCompleteCelebration: playAllCompleteCelebration,
    clearAllCompleteCelebration: clearAllCompleteCelebration,
    mountCompletionUI: mountCompletionUI,
    mountProgressGradientEditor: mountProgressGradientEditor,
    progressFromFaderDelta: progressFromFaderDelta,
    bindProgressFader: bindProgressFader,
    FADER_LONG_PRESS_MS: FADER_LONG_PRESS_MS,
    FADER_PIXELS_PER_PERCENT: FADER_PIXELS_PER_PERCENT,
  };
})(typeof window !== 'undefined' ? window : this);
