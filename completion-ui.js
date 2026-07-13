/* Completion popup UI — subtask list, difficulty, weighted progress sliders. */
(function (global) {
  'use strict';

  var COMPLETION_SCHEME_STORAGE_KEY = 'trello-priority-powerup/completion-color-scheme';
  var DEFAULT_COMPLETION_SCHEME_KEY = 'traffic';

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

  function buildCompletionScheme(key, label, oklchStops) {
    var stops = oklchStopsToHex(oklchStops);
    return {
      key: key,
      label: label,
      oklchStops: oklchStops,
      oklabStops: oklchStopsToOklab(oklchStops),
      stops: stops
    };
  }

  // Named OKLCH stops [L, C, H] for progress ramps (0 % → 100 %).
  // Shared anchors keep schemes coherent: cool gray → blue mid → green complete.
  var PROGRESS_OKLCH = {
    GRAY: [0.720, 0.014, 250],
    GRAY_SOFT: [0.740, 0.010, 250],
    GRAY_BLUE: [0.680, 0.045, 248],
    BLUE: [0.600, 0.130, 245],
    BLUE_DEEP: [0.560, 0.140, 250],
    BLUE_SKY: [0.680, 0.100, 230],
    TEAL: [0.640, 0.110, 195],
    MINT: [0.700, 0.100, 170],
    BLUE_GREEN: [0.640, 0.120, 175],
    GREEN_SOFT: [0.660, 0.130, 155],
    GREEN: [0.580, 0.195, 145],
    GREEN_MUTED: [0.580, 0.120, 145]
  };

  // Five OKLCH ramps: gray (low) → blue (mid) → green (complete). No warm/red start.
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
      PROGRESS_OKLCH.GRAY_BLUE,
      PROGRESS_OKLCH.TEAL,
      PROGRESS_OKLCH.MINT,
      PROGRESS_OKLCH.GREEN
    ]),
    ocean: buildCompletionScheme('ocean', 'Océan', [
      PROGRESS_OKLCH.GRAY,
      PROGRESS_OKLCH.BLUE_DEEP,
      PROGRESS_OKLCH.BLUE,
      PROGRESS_OKLCH.TEAL,
      PROGRESS_OKLCH.GREEN
    ]),
    sunset: buildCompletionScheme('sunset', 'Horizon', [
      PROGRESS_OKLCH.GRAY_SOFT,
      PROGRESS_OKLCH.BLUE_SKY,
      PROGRESS_OKLCH.BLUE,
      PROGRESS_OKLCH.MINT,
      PROGRESS_OKLCH.GREEN
    ]),
    monochrome: buildCompletionScheme('monochrome', 'Monochrome', [
      PROGRESS_OKLCH.GRAY_SOFT,
      [0.660, 0.025, 248],
      [0.600, 0.055, 245],
      [0.620, 0.070, 180],
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
  var activeOklabStops = COMPLETION_COLOR_SCHEMES.traffic.oklabStops.slice();

  function normalizeCompletionSchemeKey(key) {
    return COMPLETION_COLOR_SCHEMES[key] ? key : DEFAULT_COMPLETION_SCHEME_KEY;
  }

  function progressStopT(percent, oklabStops) {
    var stops = oklabStops || activeOklabStops;
    var maxIdx = stops.length - 1;
    var pct = Math.max(0, Math.min(100, Number(percent) || 0));
    if (maxIdx <= 0) return 0;
    // Reserve the final stop for a hard 100% punch — map 0–99 onto
    // stops[0]…stops[maxIdx - 1] so 99% ≠ almost-green.
    if (pct >= 100) return maxIdx;
    return (pct / 99) * (maxIdx - 1);
  }

  function rgbAtProgress(percent, schemeKey) {
    var scheme = COMPLETION_COLOR_SCHEMES[normalizeCompletionSchemeKey(schemeKey || activeCompletionSchemeKey)];
    var stops = scheme.oklabStops;
    var stopT = progressStopT(percent, stops);
    var maxIdx = stops.length - 1;
    stopT = Math.max(0, Math.min(maxIdx, stopT));
    var lo = Math.floor(stopT);
    var hi = Math.min(lo + 1, maxIdx);
    var t = stopT - lo;
    return oklabToRgb(lerpOklab(stops[lo], stops[hi], t));
  }

  function colorAtProgress(schemeKey, percent) {
    return rgbToHex(rgbAtProgress(percent, schemeKey));
  }

  function completionColorForProgress(percent) {
    if (percentIsComplete(percent)) {
      return colorAtProgress(activeCompletionSchemeKey, 100);
    }
    return colorAtProgress(activeCompletionSchemeKey, percent);
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

  function applyCompletionColorScheme(schemeKey) {
    var key = normalizeCompletionSchemeKey(schemeKey);
    var scheme = COMPLETION_COLOR_SCHEMES[key];
    activeCompletionSchemeKey = key;
    activeOklabStops = scheme.oklabStops.slice();
    return key;
  }

  function getActiveCompletionSchemeKey() {
    return activeCompletionSchemeKey;
  }

  function loadStoredCompletionSchemeKey() {
    try {
      if (typeof localStorage === 'undefined') return null;
      var raw = localStorage.getItem(COMPLETION_SCHEME_STORAGE_KEY);
      if (!raw) return null;
      return COMPLETION_COLOR_SCHEMES[raw] ? raw : null;
    } catch (e) { return null; }
  }

  function saveStoredCompletionSchemeKey(key) {
    try {
      if (typeof localStorage === 'undefined') return;
      if (!COMPLETION_COLOR_SCHEMES[key]) return;
      localStorage.setItem(COMPLETION_SCHEME_STORAGE_KEY, key);
    } catch (e) { /* ignore quota / private mode */ }
  }

  function schemeGradientCss(schemeKey) {
    var scheme = COMPLETION_COLOR_SCHEMES[normalizeCompletionSchemeKey(schemeKey)];
    return 'linear-gradient(90deg,' + scheme.stops.join(',') + ')';
  }

  applyCompletionColorScheme(DEFAULT_COMPLETION_SCHEME_KEY);

  function getCompletionTrello() {
    return global.CompletionTrello;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function difficultyOptionsHtml(selected, CT) {
    var levels = CT && CT.DIFFICULTY_LEVELS ? CT.DIFFICULTY_LEVELS : [];
    return levels
      .map(function (level) {
        var sel = level.value === selected ? ' selected' : '';
        return (
          '<option value="' +
          level.value +
          '"' +
          sel +
          '>' +
          escapeHtml(level.label) +
          '</option>'
        );
      })
      .join('');
  }

  var COMPLETION_ENCOURAGEMENT_TIERS = [
    { max: 0, text: 'En attente' },
    { max: 10, text: 'Amorc\u00e9e' },
    { max: 25, text: 'D\u00e9but\u00e9' },
    { max: 50, text: 'En cours' },
    { max: 75, text: 'Bon progr\u00e8s' },
    { max: 90, text: 'Super avanc\u00e9' },
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
    var showCardHeader = options.showCardHeader !== false;
    var masterDragging = false;
    var flipAnimToken = 0;

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

    var progressHero = document.createElement('div');
    progressHero.className = 'tp-completion-progress-hero';
    progressHero.innerHTML =
      '<span class="tp-completion-percent" id="completionPercent">0\u00a0%</span>' +
      '<p class="tp-completion-encouragement" id="completionEncouragement" aria-live="polite">' +
      progressEncouragementText(0) +
      '</p>';

    progressPanel.appendChild(progressHero);

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
        updateProgressUi({ skipMasterSync: true });
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

    var addSection = document.createElement('section');
    addSection.className = 'tp-completion-add';
    addSection.innerHTML =
      '<div class="tp-completion-add-row">' +
      '<input type="text" class="tp-input tp-completion-add-input" id="completionAddInput" ' +
      'placeholder="Ajouter une sous-t\u00e2che\u2026" maxlength="500" autocomplete="off" />' +
      '<button type="button" class="tp-btn tp-btn--primary tp-completion-add-btn" id="completionAddBtn">Ajouter</button>' +
      '</div>';
    containerEl.appendChild(addSection);

    var listSection = document.createElement('section');
    listSection.className = 'tp-completion-list-section';
    listSection.innerHTML =
      '<ul class="tp-completion-list" id="completionList" aria-label="Sous-t\u00e2ches"></ul>';
    containerEl.appendChild(listSection);

    var doneSection = document.createElement('section');
    doneSection.className = 'tp-completion-done-section is-empty';
    doneSection.innerHTML =
      '<button type="button" class="tp-completion-done-toggle" id="completionDoneToggle" ' +
      'aria-expanded="false" aria-controls="completionDoneList" disabled>' +
      '<span class="tp-completion-done-toggle-label" id="completionDoneLabel">Termin\u00e9es (0)</span>' +
      '<span class="tp-completion-done-chevron" aria-hidden="true"></span>' +
      '</button>' +
      '<ul class="tp-completion-list tp-completion-done-list" id="completionDoneList" ' +
      'aria-label="T\u00e2ches termin\u00e9es" hidden></ul>';
    containerEl.appendChild(doneSection);

    var listEl = containerEl.querySelector('#completionList');
    var doneListEl = containerEl.querySelector('#completionDoneList');
    var doneToggle = containerEl.querySelector('#completionDoneToggle');
    var doneLabel = containerEl.querySelector('#completionDoneLabel');
    var percentEl = containerEl.querySelector('#completionPercent');
    var encouragementEl = containerEl.querySelector('#completionEncouragement');
    var addInput = containerEl.querySelector('#completionAddInput');
    var addBtn = containerEl.querySelector('#completionAddBtn');
    var doneSectionExpanded = false;

    var CHECK_ICON_SVG =
      '<svg class="tp-completion-check-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M13.2 4.3 6.5 11 2.8 7.3l1.1-1.1 2.6 2.6 5.6-5.6z"/>' +
      '</svg>';

    function findItemRow(id) {
      return containerEl.querySelector('.tp-completion-item[data-id="' + id + '"]');
    }

    function syncCheckButton(btn, done) {
      if (!btn) return;
      btn.classList.toggle('is-checked', done);
      btn.setAttribute('aria-pressed', done ? 'true' : 'false');
      btn.setAttribute(
        'aria-label',
        done ? 'Marquer comme non termin\u00e9' : 'Marquer comme termin\u00e9 (100\u00a0%)'
      );
    }

    function syncItemSlidersFromData() {
      data.items.forEach(function (item) {
        var li = findItemRow(item.id);
        if (!li) return;
        var p = CT.itemProgress(item);
        var slider = li.querySelector('.tp-completion-item-slider');
        var valEl = li.querySelector('.tp-completion-item-val');
        var checkBtn = li.querySelector('.tp-completion-check');
        if (slider) {
          slider.value = String(p);
          applySliderProgressTrack(slider, p);
        }
        if (valEl) valEl.textContent = p + '\u00a0%';
        syncCheckButton(checkBtn, item.done);
        li.classList.toggle('is-done', item.done);
      });
    }

    function updateDoneSectionUi(doneCount) {
      var hasDone = doneCount > 0;
      if (!hasDone) doneSectionExpanded = false;
      doneLabel.textContent =
        'Termin\u00e9es (' + doneCount + ')';
      doneSection.classList.toggle('is-empty', !hasDone);
      doneSection.classList.toggle('is-expanded', hasDone && doneSectionExpanded);
      doneToggle.disabled = !hasDone;
      doneToggle.setAttribute(
        'aria-expanded',
        hasDone && doneSectionExpanded ? 'true' : 'false'
      );
      doneListEl.hidden = !(hasDone && doneSectionExpanded);
    }

    function emitChange(opts) {
      opts = opts || {};
      data = CT.normalizeCompletionData(data);
      if (opts.animateItemId) {
        renderListWithFlip(opts.animateItemId, opts.flipWasDone);
      } else {
        renderList();
      }
      updateProgressUi();
      onChange(data);
    }

    function updateProgressUi(opts) {
      opts = opts || {};
      var progress = CT.computeCardProgress(data);
      var accent = progress.percent > 0
        ? completionColorForProgress(progress.percent)
        : '';
      percentEl.textContent = progress.percent + '\u00a0%';
      percentEl.style.color = accent;
      encouragementEl.textContent = progressEncouragementText(progress.percent);
      encouragementEl.style.color = accent;
      encouragementEl.classList.toggle('is-complete', progress.percent === 100);
      progressPanel.style.setProperty(
        '--completion-hero-accent',
        accent || 'var(--tp-border-strong)'
      );
      progressPanel.classList.toggle('is-complete', progress.percent === 100);
      progressPanel.classList.toggle('has-progress', progress.percent > 0);
      if (!opts.skipMasterSync && !masterDragging) {
        masterSlider.setValue(progress.percent);
      } else {
        applySliderProgressTrack(masterSlider.input, progress.percent);
      }
      masterSlider.input.classList.toggle(
        'is-complete',
        progress.percent === 100
      );
      masterDragging = false;
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

      if (becomingDone && firstRect && !prefersReducedMotion()) {
        doneSectionExpanded = true;
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

    function bindItemRow(li, item) {
      var checkBtn = li.querySelector('.tp-completion-check');
      var textInput = li.querySelector('.tp-completion-text');
      var diffSelect = li.querySelector('.tp-completion-diff');
      var deleteBtn = li.querySelector('.tp-completion-delete');
      var itemSlider = li.querySelector('.tp-completion-item-slider');
      var itemValEl = li.querySelector('.tp-completion-item-val');
      function syncItemProgressUi() {
        var p = CT.itemProgress(item);
        if (itemSlider) applySliderProgressTrack(itemSlider, p);
        syncCheckButton(checkBtn, item.done);
        li.classList.toggle('is-done', item.done);
      }

      checkBtn.addEventListener('click', function () {
        var wasDone = !!item.done;
        setItemProgress(item, item.done ? 0 : 100);
        itemSlider.value = String(item.progress);
        itemValEl.textContent = item.progress + '\u00a0%';
        syncItemProgressUi();
        emitChange({
          animateItemId: item.id,
          flipWasDone: wasDone,
        });
        onResize();
      });

      function handleItemSlider() {
        var v = Number(itemSlider.value);
        setItemProgress(item, v);
        itemValEl.textContent = v + '\u00a0%';
        syncItemProgressUi();
        updateProgressUi();
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
          });
        } else {
          renderList();
        }
        onResize();
      });

      textInput.addEventListener('change', function () {
        var trimmed = textInput.value.trim();
        if (!trimmed) {
          removeItem(item.id);
          return;
        }
        item.text = trimmed;
        emitChange();
      });

      textInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          textInput.blur();
        }
      });

      diffSelect.addEventListener('change', function () {
        item.difficulty = Number(diffSelect.value);
        emitChange();
      });

      deleteBtn.addEventListener('click', function () {
        removeItem(item.id);
      });

      syncItemProgressUi();
    }

    function renderItem(item) {
      var li = document.createElement('li');
      li.className = 'tp-completion-item' + (item.done ? ' is-done' : '');
      li.dataset.id = item.id;

      var mainRow = document.createElement('div');
      mainRow.className = 'tp-completion-item-main';

      var checkWrap = document.createElement('div');
      checkWrap.className = 'tp-completion-check-wrap';
      var checkBtn = document.createElement('button');
      checkBtn.type = 'button';
      checkBtn.className = 'tp-completion-check' + (item.done ? ' is-checked' : '');
      checkBtn.innerHTML = CHECK_ICON_SVG;
      syncCheckButton(checkBtn, item.done);
      checkWrap.appendChild(checkBtn);

      var textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.className = 'tp-input tp-completion-text';
      textInput.value = item.text;
      textInput.setAttribute('aria-label', 'Texte de la sous-t\u00e2che');

      var diffSelect = document.createElement('select');
      diffSelect.className = 'tp-input tp-completion-diff';
      diffSelect.setAttribute('aria-label', 'Difficult\u00e9');
      diffSelect.title = 'Difficult\u00e9';
      diffSelect.innerHTML = difficultyOptionsHtml(item.difficulty, CT);

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'tp-completion-delete';
      deleteBtn.setAttribute('aria-label', 'Supprimer');
      deleteBtn.title = 'Supprimer';
      deleteBtn.textContent = '\u00d7';

      mainRow.appendChild(checkWrap);
      mainRow.appendChild(textInput);
      mainRow.appendChild(diffSelect);
      mainRow.appendChild(deleteBtn);

      var sliderRow = document.createElement('div');
      sliderRow.className = 'tp-completion-item-slider-row';

      var sliderLbl = document.createElement('span');
      sliderLbl.className = 'tp-completion-field-lbl';
      sliderLbl.textContent = 'Progr\u00e8s';

      var sliderWrap = document.createElement('div');
      sliderWrap.className = 'field-slider';

      var itemSlider = document.createElement('input');
      itemSlider.type = 'range';
      itemSlider.className = 'field-range tp-completion-item-slider';
      itemSlider.min = '0';
      itemSlider.max = '100';
      itemSlider.step = '1';
      itemSlider.value = String(CT.itemProgress(item));
      itemSlider.setAttribute('aria-label', 'Progr\u00e8s de la sous-t\u00e2che');

      var itemValEl = document.createElement('span');
      itemValEl.className = 'tp-completion-item-val tp-completion-field-val';
      itemValEl.textContent = CT.itemProgress(item) + '\u00a0%';

      sliderWrap.appendChild(itemSlider);
      sliderRow.appendChild(sliderLbl);
      sliderRow.appendChild(sliderWrap);
      sliderRow.appendChild(itemValEl);

      li.appendChild(mainRow);
      li.appendChild(sliderRow);
      bindItemRow(li, item);
      return li;
    }

    function renderList() {
      listEl.replaceChildren();
      doneListEl.replaceChildren();
      listSection.classList.toggle('is-empty', !data.items.length);

      if (!data.items.length) {
        updateDoneSectionUi(0);
        return;
      }

      var activeItems = [];
      var doneItems = [];
      data.items.forEach(function (item) {
        if (item.done) doneItems.push(item);
        else activeItems.push(item);
      });

      activeItems.forEach(function (item) {
        listEl.appendChild(renderItem(item));
      });
      doneItems.forEach(function (item) {
        doneListEl.appendChild(renderItem(item));
      });
      updateDoneSectionUi(doneItems.length);
    }

    doneToggle.addEventListener('click', function () {
      if (doneToggle.disabled) return;
      doneSectionExpanded = !doneSectionExpanded;
      updateDoneSectionUi(
        data.items.filter(function (item) {
          return item.done;
        }).length
      );
      onResize();
    });

    function removeItem(id) {
      var nextItems = data.items.filter(function (item) {
        return item.id !== id;
      });
      if (!nextItems.length && data.items.length) {
        data.progress = CT.computeCardProgress(data).percent;
      }
      data.items = nextItems;
      emitChange();
      onResize();
    }

    function addItem(text, difficulty) {
      var trimmed = (text || '').trim();
      if (!trimmed) return false;
      var hadNoItems = !data.items.length;
      var cardProgress = hadNoItems ? CT.computeCardProgress(data).percent : 0;
      var item = CT.normalizeItem({
        id: CT.generateId(),
        text: trimmed,
        progress: hadNoItems && cardProgress > 0 ? cardProgress : 0,
        difficulty: difficulty != null ? difficulty : 2,
      });
      if (!item) return false;
      data.items.push(item);
      emitChange();
      onResize();
      return true;
    }

    function addFromInput() {
      var ok = addItem(addInput.value, 2);
      if (ok) {
        addInput.value = '';
        addInput.focus();
      }
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

    return {
      setCardName: function (name) {
        if (!cardNameEl) {
          onResize();
          return;
        }
        var label = name || 'Carte';
        cardNameEl.textContent = label;
        cardNameEl.title = name ? name : '';
        cardNameEl.classList.remove('is-loading');
        onResize();
      },
      getData: function () {
        return CT.normalizeCompletionData(data);
      },
      setData: function (next) {
        data = CT.normalizeCompletionData(next);
        renderList();
        updateProgressUi();
        onResize();
      },
      addItem: addItem,
      focusAddInput: function () {
        addInput.focus();
      },
      el: containerEl,
    };
  }

  global.CompletionUI = {
    PROGRESS_OKLCH: PROGRESS_OKLCH,
    COMPLETION_COLOR_SCHEMES: COMPLETION_COLOR_SCHEMES,
    COMPLETION_SCHEME_OPTIONS: COMPLETION_SCHEME_OPTIONS,
    DEFAULT_COMPLETION_SCHEME_KEY: DEFAULT_COMPLETION_SCHEME_KEY,
    normalizeCompletionSchemeKey: normalizeCompletionSchemeKey,
    applyCompletionColorScheme: applyCompletionColorScheme,
    getActiveCompletionSchemeKey: getActiveCompletionSchemeKey,
    loadStoredCompletionSchemeKey: loadStoredCompletionSchemeKey,
    saveStoredCompletionSchemeKey: saveStoredCompletionSchemeKey,
    colorAtProgress: colorAtProgress,
    completionColorForProgress: completionColorForProgress,
    completionTrelloBadgeColor: completionTrelloBadgeColor,
    schemeGradientCss: schemeGradientCss,
    progressEncouragementText: progressEncouragementText,
    mountCompletionUI: mountCompletionUI,
  };
})(typeof window !== 'undefined' ? window : this);
