/* Completion popup UI — subtask list and progress sliders. */
(function (global) {
  'use strict';

  var COMPLETION_SCHEME_STORAGE_KEY = 'trello-priority-powerup/completion-color-scheme';
  var COMPLETION_GRADIENT_STORAGE_KEY = 'trello-priority-powerup/completion-color-gradient';
  var DEFAULT_COMPLETION_SCHEME_KEY = 'traffic';
  var CUSTOM_COMPLETION_SCHEME_KEY = 'custom';
  var MIN_GRADIENT_STOPS = 2;
  var MAX_GRADIENT_STOPS = 8;

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

  var COMPLETION_ENCOURAGEMENT_TIERS = [
    { max: 0, text: 'En attente' },
    { max: 10, text: 'Amorc\u00e9e' },
    { max: 25, text: 'D\u00e9but\u00e9' },
    { max: 50, text: 'En cours' },
    { max: 75, text: 'Bon progr\u00e8s' },
    { max: 90, text: 'Bien avanc\u00e9' },
    { max: 99, text: 'Bient\u00f4t termin\u00e9' },
    { max: 100, text: 'Termin\u00e9' },
  ];

  function progressEncouragementText(percent) {
    var p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    for (var i = 0; i < COMPLETION_ENCOURAGEMENT_TIERS.length; i++) {
      if (p <= COMPLETION_ENCOURAGEMENT_TIERS[i].max) {
        return COMPLETION_ENCOURAGEMENT_TIERS[i].text;
      }
    }
    return COMPLETION_ENCOURAGEMENT_TIERS[COMPLETION_ENCOURAGEMENT_TIERS.length - 1].text;
  }

  function applySliderProgressTrack(input, percent) {
    if (!input) return;
    var p = Math.max(0, Math.min(100, Number(percent) || 0));
    var color = completionColorForProgress(p);
    input.style.setProperty('--completion-pct', p + '%');
    input.style.setProperty('--completion-fill', color);
    input.style.setProperty('--completion-accent', color);
    input.classList.toggle('is-complete', p >= 100);
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
    valEl.setAttribute('aria-hidden', 'true');

    function updateVal(v) {
      valEl.textContent = v + '\u00a0%';
      applySliderProgressTrack(input, v);
    }

    function handleInput() {
      var v = Number(input.value);
      updateVal(v);
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
    var PU = global.PriorityUI;
    if (PU && Array.isArray(PU.DURATION_TICKS) && PU.DURATION_TICKS.length) {
      return PU.DURATION_TICKS;
    }
    return [
      { label: 'Quelques minutes', minutes: 15 },
      { label: 'Quelques heures', minutes: 3 * 60 },
      { label: 'Quelques jours', minutes: 3 * 24 * 60 },
      { label: 'Quelques semaines', minutes: 3 * 7 * 24 * 60 },
      { label: 'Quelques mois', minutes: 3 * 30 * 24 * 60 },
      { label: 'Quelques ann\u00e9es', minutes: Math.round(2 * 365.25 * 24 * 60) }
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

  var ESTIMATE_LOG_MAX = Math.round(2 * 365.25 * 24 * 60);

  function closeOpenEstimatePopovers(except) {
    var open = document.querySelectorAll('.tp-estimate-popover.is-open');
    for (var i = 0; i < open.length; i++) {
      if (except && open[i] === except) continue;
      open[i].classList.remove('is-open');
      open[i].hidden = true;
    }
  }

  /**
   * Compact duration chip + popover (ticks + freeform).
   * config: { minutes, readOnly, adjusted, compact, ariaLabel, onChange(minutes|null) }
   */
  function createEstimateChip(CT, config) {
    config = config || {};
    var minutes =
      typeof CT.clampEstimatedMinutes === 'function'
        ? CT.clampEstimatedMinutes(config.minutes)
        : config.minutes != null
          ? Math.round(config.minutes)
          : null;
    var readOnly = !!config.readOnly;
    var onChange = typeof config.onChange === 'function' ? config.onChange : null;

    var wrap = document.createElement('div');
    wrap.className =
      'tp-estimate-chip-wrap' + (config.compact ? ' is-compact' : '');

    var chip = document.createElement(readOnly ? 'span' : 'button');
    if (!readOnly) chip.type = 'button';
    chip.className = 'tp-estimate-chip';
    chip.setAttribute(
      'aria-label',
      config.ariaLabel || 'Dur\u00e9e estim\u00e9e'
    );

    var sand = document.createElement('span');
    sand.className = 'tp-estimate-chip-sand';
    sand.setAttribute('aria-hidden', 'true');
    var label = document.createElement('span');
    label.className = 'tp-estimate-chip-label';
    chip.appendChild(sand);
    chip.appendChild(label);
    wrap.appendChild(chip);

    var popover = null;
    var freeInput = null;

    function paint() {
      var text =
        minutes == null
          ? 'Estimer'
          : typeof CT.formatEstimatedMinutesCompact === 'function'
            ? CT.formatEstimatedMinutesCompact(minutes)
            : String(minutes) + ' min';
      label.textContent = text;
      chip.classList.toggle('is-empty', minutes == null);
      chip.classList.toggle('is-set', minutes != null);
      chip.classList.toggle('is-adjusted', !!config.adjusted && minutes != null);
      chip.title =
        minutes == null
          ? 'D\u00e9finir une dur\u00e9e estim\u00e9e'
          : config.adjusted
            ? 'Total ajust\u00e9\u00a0: ' + text
            : text;
      var fill =
        minutes == null
          ? 0
          : Math.min(
              1,
              Math.log(Math.max(minutes, 5)) / Math.log(ESTIMATE_LOG_MAX)
            );
      sand.style.transform = 'scaleY(' + (0.12 + fill * 0.88).toFixed(3) + ')';
    }

    function setMinutes(next, notify) {
      minutes =
        typeof CT.clampEstimatedMinutes === 'function'
          ? CT.clampEstimatedMinutes(next)
          : next != null && isFinite(+next) && +next > 0
            ? Math.round(+next)
            : null;
      paint();
      if (notify && onChange) onChange(minutes);
    }

    function closePopover() {
      if (!popover) return;
      popover.classList.remove('is-open');
      popover.hidden = true;
      chip.setAttribute('aria-expanded', 'false');
    }

    function openPopover() {
      if (readOnly || !popover) return;
      closeOpenEstimatePopovers(popover);
      popover.hidden = false;
      popover.classList.add('is-open');
      chip.setAttribute('aria-expanded', 'true');
      if (freeInput) {
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
      popover.setAttribute('aria-label', 'Choisir une dur\u00e9e');

      var ticks = document.createElement('div');
      ticks.className = 'tp-estimate-ticks';
      ticks.setAttribute('role', 'listbox');
      durationTicks().forEach(function (tick) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tp-estimate-tick';
        btn.setAttribute('role', 'option');
        btn.textContent = tick.label.replace(/^Quelques\s+/i, '');
        btn.title = tick.label;
        btn.dataset.minutes = String(tick.minutes);
        btn.addEventListener('click', function () {
          setMinutes(tick.minutes, true);
          closePopover();
        });
        ticks.appendChild(btn);
      });
      popover.appendChild(ticks);

      var freeRow = document.createElement('div');
      freeRow.className = 'tp-estimate-free';
      freeInput = document.createElement('input');
      freeInput.type = 'text';
      freeInput.className = 'tp-input tp-estimate-free-input';
      freeInput.placeholder = 'ex. 2 h';
      freeInput.setAttribute('aria-label', 'Dur\u00e9e personnalis\u00e9e');
      freeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var parsed = parseEstimateInput(freeInput.value, CT);
          if (parsed != null) {
            setMinutes(parsed, true);
            closePopover();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closePopover();
        }
      });
      freeRow.appendChild(freeInput);
      var applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'tp-estimate-free-apply';
      applyBtn.textContent = 'OK';
      applyBtn.addEventListener('click', function () {
        var parsed = parseEstimateInput(freeInput.value, CT);
        if (parsed != null) {
          setMinutes(parsed, true);
          closePopover();
        }
      });
      freeRow.appendChild(applyBtn);
      popover.appendChild(freeRow);

      wrap.appendChild(popover);
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (popover.classList.contains('is-open')) closePopover();
        else openPopover();
      });
      document.addEventListener(
        'click',
        function (e) {
          if (!wrap.contains(e.target)) closePopover();
        },
        true
      );
    }

    paint();

    return {
      el: wrap,
      chip: chip,
      getMinutes: function () {
        return minutes;
      },
      setMinutes: function (next) {
        setMinutes(next, false);
      },
      setAdjusted: function (adjusted) {
        config.adjusted = !!adjusted;
        paint();
      },
      setAccent: function (color) {
        if (color) wrap.style.setProperty('--estimate-accent', color);
        else wrap.style.removeProperty('--estimate-accent');
      }
    };
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
    var getBoardCards =
      typeof options.getBoardCards === 'function' ? options.getBoardCards : null;
    var resolveLinkedTree =
      typeof options.resolveLinkedTree === 'function' ? options.resolveLinkedTree : null;
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
    var spellcheckBusy = false;
    // itemId → original text before AI spell fix (kept until popup closes / revert / edit)
    var itemSpellReverts = Object.create(null);
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

    var progressHero = document.createElement('div');
    progressHero.className = 'tp-completion-progress-hero';

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

    var percentEl = document.createElement('span');
    percentEl.className = 'tp-completion-percent';
    percentEl.id = 'completionPercent';
    percentEl.textContent = '0\u00a0%';

    var percentRow = document.createElement('div');
    percentRow.className = 'tp-completion-percent-row';
    percentRow.appendChild(percentEl);

    var linkedSnapshots = Object.create(null);
    var masterEstimateChip = createEstimateChip(CT, {
      minutes: CT.computeEstimatedTotal(data),
      adjusted:
        data.items.length &&
        typeof data.estimatedMinutesOffset === 'number' &&
        data.estimatedMinutesOffset !== 0,
      ariaLabel: 'Dur\u00e9e totale estim\u00e9e',
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
    percentRow.appendChild(masterEstimateChip.el);

    var encouragementEl = document.createElement('p');
    encouragementEl.className = 'tp-completion-encouragement';
    encouragementEl.id = 'completionEncouragement';
    encouragementEl.setAttribute('aria-live', 'polite');
    encouragementEl.textContent = progressEncouragementText(0);

    progressHero.appendChild(masterTitleEl);
    progressHero.appendChild(percentRow);
    progressHero.appendChild(encouragementEl);

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

    var progressActions = document.createElement('div');
    progressActions.className = 'tp-completion-progress-actions';
    progressActions.appendChild(completeAllBtn);
    progressActions.appendChild(resetAllBtn);

    progressHead.appendChild(progressHero);
    progressHead.appendChild(progressActions);
    progressPanel.appendChild(progressHead);

    var masterSlider = createProgressSlider(
      'Ajuster le progr\u00e8s',
      0,
      function (v) {
        masterDragging = true;
        if (data.items.length) {
          data.items = CT.applyMasterProgress(data.items, v);
          syncItemSlidersFromData();
        } else {
          data.progress = v;
        }
        updateProgressUi({ skipMasterSync: true, deferDoneListReveal: true });
        onChange(CT.normalizeCompletionData(data));
      },
      'completionMasterSlider'
    );
    masterSlider.el.classList.add('tp-completion-master-slider');
    masterSlider.input.addEventListener('change', function () {
      if (data.items.length) {
        renderList();
        onResize();
      }
    });
    progressPanel.appendChild(masterSlider.el);

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
      '<button type="button" class="tp-btn tp-btn--primary tp-completion-add-btn" id="completionAddBtn">Ajouter</button>' +
      '<button type="button" class="tp-btn tp-completion-link-btn" id="completionLinkBtn" ' +
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
      '<span class="tp-completion-suggestions-label">Suggestions IA</span>' +
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
    // percentEl / encouragementEl / masterTitleEl created above in progressHero
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
          return !addInput.disabled && !spellcheckBusy;
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
      '<svg class="tp-completion-check-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M13.2 4.3 6.5 11 2.8 7.3l1.1-1.1 2.6 2.6 5.6-5.6z"/>' +
      '</svg>';
    var TRASH_ICON_SVG =
      '<svg class="tp-completion-delete-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M6 2.25A.75.75 0 0 1 6.75 1.5h2.5a.75.75 0 0 1 .75.75V3.5h3.25a.75.75 0 0 1 0 1.5h-.46l-.54 8.05A1.75 1.75 0 0 1 10.51 14.5H5.49a1.75 1.75 0 0 1-1.74-1.45L3.21 5H2.75a.75.75 0 0 1 0-1.5H6V2.25zM7.5 3.5h1V3h-1v.5zM4.72 5l.52 7.8a.25.25 0 0 0 .25.2h5.02a.25.25 0 0 0 .25-.2L11.28 5H4.72zM6.5 6.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75zm3 0a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75z"/>' +
      '</svg>';

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

    function syncCheckButton(btn, done, progress) {
      if (!btn) return;
      var p =
        typeof progress === 'number' && isFinite(progress)
          ? CT.clampProgress(progress)
          : done
            ? 100
            : 0;
      var fill = p > 0 ? completionColorForProgress(p) : '';
      btn.style.setProperty('--completion-progress', String(p));
      if (fill) {
        btn.style.setProperty('--completion-check-fill', fill);
      } else {
        btn.style.removeProperty('--completion-check-fill');
      }
      btn.classList.toggle('is-checked', done);
      btn.classList.toggle('has-progress', p > 0 && !done);
      btn.setAttribute('aria-pressed', done ? 'true' : 'false');
      btn.setAttribute(
        'aria-label',
        done
          ? 'Marquer comme non termin\u00e9'
          : p > 0
            ? 'Marquer comme termin\u00e9 (100\u00a0%) — ' + p + '\u00a0%'
            : 'Marquer comme termin\u00e9 (100\u00a0%)'
      );
    }

    function syncItemProgressLabel(labelEl, percent) {
      if (!labelEl) return;
      var p = CT.clampProgress(percent);
      var accent = p > 0 ? completionColorForProgress(p) : '';
      labelEl.textContent = progressEncouragementText(p);
      labelEl.style.color = accent;
      labelEl.classList.toggle('is-complete', p >= 100);
    }

    function syncItemSlidersFromData() {
      data.items.forEach(function (item) {
        var li = findItemRow(item.id);
        if (!li) return;
        var p = CT.itemProgress(item);
        var slider = li.querySelector('.tp-completion-item-slider');
        var valEl = li.querySelector('.tp-completion-item-val');
        var labelEl = li.querySelector('.tp-completion-item-progress-lbl');
        var checkBtn = li.querySelector('.tp-completion-check');
        if (slider) {
          slider.value = String(p);
          applySliderProgressTrack(slider, p);
        }
        if (valEl) valEl.textContent = p + '\u00a0%';
        syncItemProgressLabel(labelEl, p);
        syncCheckButton(checkBtn, item.done, p);
        li.classList.toggle('is-done', item.done);
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
      return normalized;
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
        isAllCompleteProgress(CT.computeCardProgress(persisted))
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
      var progress = CT.computeCardProgress(data);
      if (progress.percent <= 0 || progress.percent >= 100 || isAllCompleteProgress(progress)) {
        return;
      }
      resetAllClearsCompleted = false;
      if (data.items.length) {
        data.items = CT.applyMasterProgress(data.items, 100);
      } else {
        data.progress = 100;
      }
      emitChange();
      onResize();
    }

    function resetAllTasks() {
      var progress = CT.computeCardProgress(data);
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
            syncResetAllButton(CT.computeCardProgress(data));
            return;
          }
        } else {
          // Pass 2: also clear completed tasks.
          for (var j = 0; j < data.items.length; j++) {
            setItemProgress(data.items[j], 0);
          }
          resetAllClearsCompleted = false;
        }
      } else {
        var cardProgress = CT.clampProgress(data.progress);
        if (!resetAllClearsCompleted) {
          if (cardProgress > 0 && cardProgress < 100) {
            data.progress = 0;
            resetAllClearsCompleted = false;
          } else if (cardProgress >= 100) {
            resetAllClearsCompleted = true;
            syncResetAllButton(progress);
            return;
          } else {
            return;
          }
        } else {
          data.progress = 0;
          resetAllClearsCompleted = false;
        }
      }

      emitChange();
      onResize();
    }

    completeAllBtn.addEventListener('click', completeAllTasks);
    resetAllBtn.addEventListener('click', resetAllTasks);

    function syncMasterEstimateChip(progress) {
      var total = CT.computeEstimatedTotal(data, linkedSnapshots);
      var remaining = CT.computeEstimatedRemaining(data, linkedSnapshots);
      masterEstimateChip.setMinutes(total);
      masterEstimateChip.setAdjusted(
        !!(
          data.items.length &&
          typeof data.estimatedMinutesOffset === 'number' &&
          data.estimatedMinutesOffset !== 0
        )
      );
      var accent =
        progress && progress.percent > 0
          ? completionColorForProgress(progress.percent)
          : '';
      masterEstimateChip.setAccent(accent);
      masterEstimateChip.chip.title =
        total == null
          ? 'D\u00e9finir une dur\u00e9e estim\u00e9e'
          : remaining != null && remaining !== total
            ? CT.formatEstimatedMinutesCompact(total) +
              ' au total \u00b7 ' +
              CT.formatEstimatedRemainingLabel(remaining)
            : CT.formatEstimatedMinutesCompact(total) + ' au total';
    }

    function updateProgressUi(opts) {
      opts = opts || {};
      var progress = CT.computeCardProgress(data);
      var accent = completionColorForProgress(progress.percent);
      percentEl.textContent = progress.percent + '\u00a0%';
      percentEl.style.color = progress.percent > 0 ? accent : '';
      encouragementEl.textContent = progressEncouragementText(progress.percent);
      encouragementEl.style.color = progress.percent > 0 ? accent : '';
      encouragementEl.classList.toggle('is-complete', progress.percent === 100);
      progressPanel.style.setProperty(
        '--completion-hero-accent',
        progress.percent > 0 ? accent : 'var(--tp-border-strong)'
      );
      progressPanel.classList.toggle('is-complete', progress.percent === 100);
      progressPanel.classList.toggle('has-progress', progress.percent > 0);
      applyProgressSectionTint(progressShellEl, accent);
      syncMasterEstimateChip(progress);
      syncCompleteAllButton(progress);
      syncResetAllButton(progress);
      if (!opts.skipMasterSync && !masterDragging) {
        masterSlider.setValue(progress.percent);
      } else {
        // Keep fill locked to the handle while dragging. Weighted average after
        // applyMasterProgress can round/clamp away from the pointer value.
        applySliderProgressTrack(
          masterSlider.input,
          Number(masterSlider.input.value)
        );
      }
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
          if (resolved && resolved.data) {
            var prev = JSON.stringify(CT.normalizeCompletionData(data));
            var persisted = applyNormalizedKeepingDrafts(resolved.data);
            if (JSON.stringify(persisted) !== prev && !opts.skipPersist) {
              onChange(persisted);
            }
          }
          if (opts.rerender !== false) {
            renderList();
            updateProgressUi();
            onResize();
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
      var checkBtn = li.querySelector('.tp-completion-check');
      var textInput = li.querySelector('.tp-completion-text');
      var textLink = li.querySelector('.tp-completion-text-link');
      var deleteBtn = li.querySelector('.tp-completion-delete');
      var itemSlider = li.querySelector('.tp-completion-item-slider');
      var itemValEl = li.querySelector('.tp-completion-item-val');
      var itemLabelEl = li.querySelector('.tp-completion-item-progress-lbl');
      var isLinked = CT.isLinkedItem(item);

      function syncItemProgressUi() {
        var p = CT.itemProgress(item);
        if (itemSlider) applySliderProgressTrack(itemSlider, p);
        if (itemValEl) itemValEl.textContent = p + '\u00a0%';
        syncItemProgressLabel(itemLabelEl, p);
        syncCheckButton(checkBtn, item.done, p);
        li.classList.toggle('is-done', item.done);
      }

      if (readOnly) {
        if (checkBtn) checkBtn.disabled = true;
        if (itemSlider) itemSlider.disabled = true;
        if (deleteBtn) deleteBtn.hidden = true;
        if (textLink) {
          textLink.addEventListener('click', function (e) {
            e.preventDefault();
            openLinkedCard(CT.itemLinkedCardId(item));
          });
        }
        syncItemProgressUi();
        return;
      }

      checkBtn.addEventListener('click', function () {
        if (isLinked) {
          openLinkedCard(CT.itemLinkedCardId(item));
          return;
        }
        var wasDone = !!item.done;
        setItemProgress(item, item.done ? 0 : 100);
        if (itemSlider) itemSlider.value = String(item.progress);
        syncItemProgressUi();
        emitChange({
          animateItemId: item.id,
          flipWasDone: wasDone,
          focusTextItemId: item.id,
        });
        onResize();
      });

      if (itemSlider && !isLinked) {
        function handleItemSlider() {
          var v = Number(itemSlider.value);
          setItemProgress(item, v);
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
            emitChange({
              animateItemId: item.id,
              flipWasDone: wasDone,
              focusTextItemId: item.id,
            });
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
            removeItem(item.id);
            return;
          }
          var editToken = (item._spellToken || 0) + 1;
          item._spellToken = editToken;
          textInput.classList.add('is-spellchecking');
          spellcheckText(trimmed).then(function (corrected) {
            if (item._spellToken !== editToken) return;
            textInput.classList.remove('is-spellchecking');
            var stillPresent = data.items.some(function (row) {
              return row.id === item.id;
            });
            if (!stillPresent) return;
            if (!corrected) {
              removeItem(item.id);
              return;
            }
            if (corrected !== textInput.value.trim()) {
              textInput.value = corrected;
            }
            item.text = corrected;
            var persisted = applyNormalizedKeepingDrafts(data);
            if (corrected !== trimmed) {
              itemSpellReverts[item.id] = trimmed;
              showItemSpellRevert(item.id, trimmed);
            } else {
              delete itemSpellReverts[item.id];
            }
            updateProgressUi();
            onChange(persisted);
          });
        });

        // Discard untitled drafts when focus leaves without a name
        // (change does not fire if the field stayed empty).
        textInput.addEventListener('blur', function () {
          if (suppressEmptyDraftDiscard) return;
          if (!(textInput.value || '').trim()) {
            removeItem(item.id);
          }
        });

        textInput.addEventListener('input', function () {
          delete itemSpellReverts[item.id];
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
      var li = document.createElement('li');
      li.className =
        'tp-completion-item tp-completion-item--depth1' +
        (item.done ? ' is-done' : '') +
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
      syncCheckButton(checkBtn, item.done, CT.itemProgress(item));
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
      }

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'tp-completion-delete';
      deleteBtn.setAttribute('aria-label', isLinked ? 'Retirer le lien' : 'Supprimer');
      deleteBtn.title = isLinked ? 'Retirer le lien' : 'Supprimer';
      deleteBtn.innerHTML = TRASH_ICON_SVG;

      mainRow.appendChild(checkWrap);
      mainRow.appendChild(titleEl);
      mainRow.appendChild(deleteBtn);

      li.appendChild(mainRow);

      if (!isLinked) {
        var sliderRow = document.createElement('div');
        sliderRow.className = 'tp-completion-item-slider-row';

        var itemProgress = CT.itemProgress(item);
        var sliderLbl = document.createElement('span');
        sliderLbl.className =
          'tp-completion-field-lbl tp-completion-item-progress-lbl';
        syncItemProgressLabel(sliderLbl, itemProgress);

        var sliderWrap = document.createElement('div');
        sliderWrap.className = 'field-slider';

        var itemSlider = document.createElement('input');
        itemSlider.type = 'range';
        itemSlider.className = 'field-range tp-completion-item-slider';
        itemSlider.min = '0';
        itemSlider.max = '100';
        itemSlider.step = '1';
        itemSlider.value = String(itemProgress);
        itemSlider.setAttribute('aria-label', 'Progr\u00e8s de la sous-t\u00e2che');

        var itemValEl = document.createElement('span');
        itemValEl.className = 'tp-completion-item-val tp-completion-field-val';
        itemValEl.textContent = itemProgress + '\u00a0%';

        sliderWrap.appendChild(itemSlider);
        sliderRow.appendChild(sliderLbl);
        sliderRow.appendChild(sliderWrap);
        sliderRow.appendChild(itemValEl);

        var itemEstimate = createEstimateChip(CT, {
          minutes: CT.itemEstimatedMinutes(item, linkedSnapshots),
          compact: true,
          ariaLabel: 'Dur\u00e9e estim\u00e9e de la sous-t\u00e2che',
          onChange: function (mins) {
            data = CT.applyItemEstimate(data, item.id, mins, { lock: true });
            var live = findLiveItem(item.id);
            if (live) {
              item.estimatedMinutes = live.estimatedMinutes;
              item.estimatedMinutesLocked = live.estimatedMinutesLocked;
            }
            emitChange();
            onResize();
          }
        });
        itemEstimate.setAccent(completionColorForProgress(itemProgress));
        itemEstimate.el.classList.add('tp-completion-item-estimate');
        sliderRow.appendChild(itemEstimate.el);
        li.appendChild(sliderRow);
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
            minutes: linkMins,
            compact: true,
            readOnly: true,
            ariaLabel: 'Dur\u00e9e estim\u00e9e de la carte li\u00e9e'
          });
          linkEstimate.setAccent(
            completionColorForProgress(CT.itemProgress(item))
          );
          linkMeta.appendChild(linkEstimate.el);
        }
        li.appendChild(linkMeta);
      }

      bindItemRow(li, item, { readOnly: !!opts.readOnly });
      return li;
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

    function removeItem(id) {
      delete itemSpellReverts[id];
      var nextItems = data.items.filter(function (item) {
        return item.id !== id;
      });
      if (!nextItems.length && data.items.length) {
        data.progress = CT.computeCardProgress(data).percent;
      }
      data.items = nextItems;
      delete linkedTreeByItemId[id];
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
      var item = CT.normalizeItem(rawItem);
      if (!item) return null;
      data.items.push(item);
      removeSuggestionMatch(trimmed);
      emitChange();
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
            sugLabel +=
              ' · ' +
              (CT.formatEstimatedMinutesCompact(row.estimatedMinutes) || '');
          }
          btn.textContent = sugLabel;
          btn.title =
            'Ajouter\u00a0: ' +
            row.text +
            (row.estimatedMinutes != null
              ? ' (' + CT.formatEstimatedMinutesCompact(row.estimatedMinutes) + ')'
              : '');
        }
        btn.addEventListener('click', function () {
          if (spellcheckBusy) return;
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
          spellcheckBusy = true;
          btn.disabled = true;
          spellcheckText(row.text)
            .then(function (corrected) {
              addItem(corrected || row.text, {
                estimatedMinutes: row.estimatedMinutes
              });
              // Always drop this chip (addItem may only clear by corrected text).
              removeSuggestionMatch(row);
            })
            .finally(function () {
              spellcheckBusy = false;
            });
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
      if (spellcheckBusy) return;
      var raw = addInput.value;
      var original = (raw || '').trim();
      if (!original) {
        addDraftItem();
        return;
      }
      spellcheckBusy = true;
      addBtn.disabled = true;
      addInput.disabled = true;
      addInput.classList.add('is-spellchecking');
      spellcheckText(raw).then(function (corrected) {
        if (corrected !== original) {
          addInput.value = corrected;
        }
        var item = addItem(corrected);
        if (item) {
          addInput.value = '';
          if (corrected !== original) {
            itemSpellReverts[item.id] = original;
            showItemSpellRevert(item.id, original);
          }
        }
      }).finally(function () {
        spellcheckBusy = false;
        addBtn.disabled = false;
        addInput.disabled = false;
        addInput.classList.remove('is-spellchecking');
        addInput.focus();
      });
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
      applyItemEstimates: function (estimates, options) {
        var next = CT.applyItemEstimates(data, estimates, options || {});
        var prev = JSON.stringify(CT.normalizeCompletionData(data));
        var persisted = applyNormalizedKeepingDrafts(next);
        if (JSON.stringify(persisted) === prev) return persisted;
        renderList();
        updateProgressUi();
        onChange(persisted);
        onResize();
        return persisted;
      },
      getEstimateSummary: function () {
        var progress = CT.computeCardProgress(data);
        return {
          percent: progress.percent,
          totalMinutes: CT.computeEstimatedTotal(data, linkedSnapshots),
          remainingMinutes: CT.computeEstimatedRemaining(data, linkedSnapshots),
          needingEstimate: CT.itemsNeedingEstimate(data),
          hasOffset: !!(
            data.items.length &&
            typeof data.estimatedMinutesOffset === 'number' &&
            data.estimatedMinutesOffset !== 0
          )
        };
      },
      addItem: addItem,
      addLinkedCard: addLinkedCard,
      refreshLinkedTree: refreshLinkedTree,
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
    completionTrelloBadgeColor: completionTrelloBadgeColor,
    schemeGradientCss: schemeGradientCss,
    gradientCssFromStops: gradientCssFromStops,
    progressBadgePreviewSamples: progressBadgePreviewSamples,
    progressEncouragementText: progressEncouragementText,
    playAllCompleteCelebration: playAllCompleteCelebration,
    clearAllCompleteCelebration: clearAllCompleteCelebration,
    mountCompletionUI: mountCompletionUI,
    mountProgressGradientEditor: mountProgressGradientEditor,
  };
})(typeof window !== 'undefined' ? window : this);
