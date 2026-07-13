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

  // Five OKLCH ramps: warm/red at 0 % → green at 100 %.
  var COMPLETION_COLOR_SCHEMES = {
    traffic: buildCompletionScheme('traffic', 'Trafic', [
      [0.520, 0.220, 25], [0.620, 0.190, 42], [0.820, 0.160, 92],
      [0.760, 0.130, 142], [0.600, 0.170, 145]
    ]),
    mint: buildCompletionScheme('mint', 'Menthe fraîche', [
      [0.520, 0.210, 18], [0.600, 0.170, 55], [0.720, 0.120, 95],
      [0.780, 0.110, 160], [0.620, 0.150, 155]
    ]),
    ocean: buildCompletionScheme('ocean', 'Océan', [
      [0.500, 0.215, 22], [0.580, 0.180, 38], [0.660, 0.140, 205],
      [0.720, 0.120, 195], [0.600, 0.165, 150]
    ]),
    sunset: buildCompletionScheme('sunset', 'Coucher de soleil', [
      [0.450, 0.225, 18], [0.580, 0.200, 35], [0.760, 0.160, 72],
      [0.780, 0.140, 125], [0.600, 0.170, 145]
    ]),
    monochrome: buildCompletionScheme('monochrome', 'Monochrome', [
      [0.450, 0.085, 25], [0.550, 0.065, 45], [0.650, 0.050, 75],
      [0.720, 0.085, 130], [0.580, 0.140, 145]
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
    var pct = Math.max(0, Math.min(100, percent));
    return (pct / 100) * maxIdx;
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
    return 'linear-gradient(90deg,' + scheme.stops[0] + ',' + scheme.stops[scheme.stops.length - 1] + ')';
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
    input.className = 'field-range';
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
    var masterDragging = false;

    containerEl.innerHTML = '';
    containerEl.className = 'tp-completion';

    var header = document.createElement('header');
    header.className = 'tp-priority-card-header';
    var cardNameEl = document.createElement('p');
    cardNameEl.className = 'tp-priority-card-name is-loading';
    cardNameEl.id = 'cardName';
    cardNameEl.setAttribute('aria-live', 'polite');
    cardNameEl.textContent = 'Chargement\u2026';
    header.appendChild(cardNameEl);
    containerEl.appendChild(header);

    var progressSection = document.createElement('section');
    progressSection.className = 'tp-completion-progress';
    progressSection.setAttribute('aria-label', 'Progrès');

    var progressHead = document.createElement('div');
    progressHead.className = 'tp-completion-progress-head';
    progressHead.innerHTML =
      '<span class="tp-completion-progress-label">Progrès global</span>' +
      '<span class="tp-completion-percent" id="completionPercent">0\u00a0%</span>';
    progressSection.appendChild(progressHead);

    var barEl = document.createElement('div');
    barEl.className = 'tp-completion-bar';
    barEl.setAttribute('role', 'progressbar');
    barEl.setAttribute('aria-valuemin', '0');
    barEl.setAttribute('aria-valuemax', '100');
    barEl.setAttribute('aria-valuenow', '0');
    var barFillEl = document.createElement('div');
    barFillEl.className = 'tp-completion-bar-fill';
    barFillEl.id = 'completionBarFill';
    barEl.appendChild(barFillEl);
    progressSection.appendChild(barEl);

    var masterSlider = createProgressSlider(
      'Ajuster le progr\u00e8s',
      0,
      function (v) {
        masterDragging = true;
        data.items = CT.applyMasterProgress(data.items, v);
        syncItemSlidersFromData();
        updateProgressUi({ skipMasterSync: true });
        onChange(CT.normalizeCompletionData(data));
      },
      'completionMasterSlider'
    );
    masterSlider.el.classList.add('tp-completion-master-slider');
    progressSection.appendChild(masterSlider.el);

    var metaEl = document.createElement('p');
    metaEl.className = 'tp-completion-meta';
    metaEl.id = 'completionMeta';
    progressSection.appendChild(metaEl);

    containerEl.appendChild(progressSection);

    var listSection = document.createElement('section');
    listSection.className = 'tp-completion-list-section';
    listSection.innerHTML =
      '<h3 class="tp-heading">Sous-t\u00e2ches</h3>' +
      '<ul class="tp-completion-list" id="completionList" aria-label="Sous-t\u00e2ches"></ul>';
    containerEl.appendChild(listSection);

    var addSection = document.createElement('section');
    addSection.className = 'tp-completion-add';
    addSection.innerHTML =
      '<div class="tp-completion-add-row">' +
      '<input type="text" class="tp-input tp-completion-add-input" id="completionAddInput" ' +
      'placeholder="Ajouter une sous-t\u00e2che\u2026" maxlength="500" autocomplete="off" />' +
      '<button type="button" class="tp-btn tp-btn--primary tp-completion-add-btn" id="completionAddBtn">Ajouter</button>' +
      '</div>';
    containerEl.appendChild(addSection);

    var listEl = containerEl.querySelector('#completionList');
    var percentEl = containerEl.querySelector('#completionPercent');
    var addInput = containerEl.querySelector('#completionAddInput');
    var addBtn = containerEl.querySelector('#completionAddBtn');

    function syncItemSlidersFromData() {
      data.items.forEach(function (item) {
        var li = listEl.querySelector('[data-id="' + item.id + '"]');
        if (!li) return;
        var p = CT.itemProgress(item);
        var slider = li.querySelector('.tp-completion-item-slider');
        var valEl = li.querySelector('.tp-completion-item-val');
        var checkbox = li.querySelector('.tp-completion-check');
        var itemBarFill = li.querySelector('.tp-completion-item-bar-fill');
        var itemBar = li.querySelector('.tp-completion-item-bar');
        if (slider) {
          slider.value = String(p);
          slider.style.setProperty('--completion-accent', completionColorForProgress(p));
        }
        if (valEl) valEl.textContent = p + '\u00a0%';
        if (checkbox) checkbox.checked = item.done;
        if (itemBarFill) {
          itemBarFill.style.width = p + '%';
          applyProgressColor(itemBarFill, p);
        }
        if (itemBar) itemBar.setAttribute('aria-valuenow', String(p));
        li.classList.toggle('is-done', item.done);
      });
    }

    function emitChange() {
      var prevIds = data.items.map(function (item) {
        return item.id;
      }).join('\0');
      data = CT.normalizeCompletionData(data);
      var nextIds = data.items.map(function (item) {
        return item.id;
      }).join('\0');
      if (prevIds !== nextIds) {
        renderList();
      }
      updateProgressUi();
      onChange(data);
    }

    function applyProgressColor(el, percent) {
      if (!el) return;
      var color = completionColorForProgress(percent);
      el.style.background = color;
    }

    function updateProgressUi(opts) {
      opts = opts || {};
      var progress = CT.computeWeightedProgress(data.items);
      percentEl.textContent = progress.percent + '\u00a0%';
      barEl.setAttribute('aria-valuenow', String(progress.percent));
      barFillEl.style.width = progress.percent + '%';
      applyProgressColor(barFillEl, progress.percent);
      percentEl.style.color = progress.hasItems && progress.percent > 0
        ? completionColorForProgress(progress.percent)
        : '';
      barEl.classList.toggle('is-complete', progress.percent === 100 && progress.hasItems);

      if (!opts.skipMasterSync && !masterDragging) {
        masterSlider.setValue(progress.percent);
      }
      masterDragging = false;

      if (!progress.hasItems) {
        metaEl.textContent =
          'Aucune sous-t\u00e2che \u2014 ajoutez des \u00e9l\u00e9ments pour suivre le progr\u00e8s.';
        masterSlider.input.disabled = true;
      } else {
        masterSlider.input.disabled = false;
        metaEl.textContent =
          progress.doneCount +
          ' sur ' +
          progress.totalCount +
          ' termin\u00e9e' +
          (progress.doneCount > 1 ? 's' : '') +
          ' \u00b7 pond\u00e9ration ' +
          progress.doneWeight +
          '/' +
          progress.totalWeight;
      }
    }

    function setItemProgress(item, progress) {
      item.progress = CT.clampProgress(progress);
      CT.syncDoneFromProgress(item);
    }

    function bindItemRow(li, item) {
      var checkbox = li.querySelector('.tp-completion-check');
      var textInput = li.querySelector('.tp-completion-text');
      var diffSelect = li.querySelector('.tp-completion-diff');
      var deleteBtn = li.querySelector('.tp-completion-delete');
      var itemSlider = li.querySelector('.tp-completion-item-slider');
      var itemValEl = li.querySelector('.tp-completion-item-val');
      var itemBarFill = li.querySelector('.tp-completion-item-bar-fill');

      function syncItemProgressUi() {
        var p = CT.itemProgress(item);
        if (itemBarFill) {
          itemBarFill.style.width = p + '%';
          applyProgressColor(itemBarFill, p);
        }
        var itemBar = li.querySelector('.tp-completion-item-bar');
        if (itemBar) itemBar.setAttribute('aria-valuenow', String(p));
        if (itemSlider) itemSlider.style.setProperty('--completion-accent', completionColorForProgress(p));
      }

      checkbox.addEventListener('change', function () {
        setItemProgress(item, checkbox.checked ? 100 : 0);
        li.classList.toggle('is-done', item.done);
        itemSlider.value = String(item.progress);
        itemValEl.textContent = item.progress + '\u00a0%';
        syncItemProgressUi();
        emitChange();
      });

      function handleItemSlider() {
        var v = Number(itemSlider.value);
        setItemProgress(item, v);
        checkbox.checked = item.done;
        li.classList.toggle('is-done', item.done);
        itemValEl.textContent = v + '\u00a0%';
        syncItemProgressUi();
        updateProgressUi();
        onChange(CT.normalizeCompletionData(data));
      }

      itemSlider.addEventListener('input', handleItemSlider);
      itemSlider.addEventListener('change', handleItemSlider);

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

      var checkWrap = document.createElement('label');
      checkWrap.className = 'tp-completion-check-wrap';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'tp-completion-check';
      checkbox.checked = item.done;
      checkbox.setAttribute('aria-label', 'Marquer comme termin\u00e9 (100\u00a0%)');
      checkWrap.appendChild(checkbox);

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
      sliderLbl.textContent = 'Progrès';

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

      var itemBar = document.createElement('div');
      itemBar.className = 'tp-completion-item-bar';
      itemBar.setAttribute('role', 'progressbar');
      itemBar.setAttribute('aria-valuemin', '0');
      itemBar.setAttribute('aria-valuemax', '100');
      itemBar.setAttribute('aria-valuenow', String(CT.itemProgress(item)));
      var itemBarFill = document.createElement('div');
      itemBarFill.className = 'tp-completion-item-bar-fill';
      itemBar.appendChild(itemBarFill);
      sliderRow.appendChild(itemBar);

      li.appendChild(mainRow);
      li.appendChild(sliderRow);
      bindItemRow(li, item);
      return li;
    }

    function renderList() {
      listEl.replaceChildren();
      if (!data.items.length) {
        var empty = document.createElement('li');
        empty.className = 'tp-completion-empty';
        empty.textContent = 'Aucune sous-t\u00e2che pour l\u2019instant.';
        listEl.appendChild(empty);
        return;
      }
      data.items.forEach(function (item) {
        listEl.appendChild(renderItem(item));
      });
    }

    function removeItem(id) {
      data.items = data.items.filter(function (item) {
        return item.id !== id;
      });
      renderList();
      updateProgressUi();
      emitChange();
      onResize();
    }

    function addItem(text, difficulty) {
      var trimmed = (text || '').trim();
      if (!trimmed) return false;
      var item = CT.normalizeItem({
        id: CT.generateId(),
        text: trimmed,
        progress: 0,
        difficulty: difficulty != null ? difficulty : 2,
      });
      if (!item) return false;
      data.items.push(item);
      renderList();
      updateProgressUi();
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
    };
  }

  global.CompletionUI = {
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
    mountCompletionUI: mountCompletionUI,
  };
})(typeof window !== 'undefined' ? window : this);
