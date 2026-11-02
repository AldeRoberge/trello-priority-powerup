/**
 * completion-ui: part 3 of 3 (mountProgressGradientEditor).
 * Names are shared with the other parts through window.CompletionUiParts (see completion-ui.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.CompletionUiParts = global.CompletionUiParts || {});

  // from earlier parts (values)
  var COMPLETION_COLOR_SCHEMES = S.COMPLETION_COLOR_SCHEMES;
  var COMPLETION_SCHEME_OPTIONS = S.COMPLETION_SCHEME_OPTIONS;
  var CUSTOM_COMPLETION_SCHEME_KEY = S.CUSTOM_COMPLETION_SCHEME_KEY;
  var DEFAULT_COMPLETION_SCHEME_KEY = S.DEFAULT_COMPLETION_SCHEME_KEY;
  var FADER_LONG_PRESS_MS = S.FADER_LONG_PRESS_MS;
  var FADER_PIXELS_PER_PERCENT = S.FADER_PIXELS_PER_PERCENT;
  var MAX_GRADIENT_STOPS = S.MAX_GRADIENT_STOPS;
  var MIN_GRADIENT_STOPS = S.MIN_GRADIENT_STOPS;
  var PROGRESS_OKLCH = S.PROGRESS_OKLCH;

  // from other parts (functions, resolved at call time)
  function applyCompletionColorScheme() { return S.applyCompletionColorScheme.apply(this, arguments); }
  function applyCompletionGradient() { return S.applyCompletionGradient.apply(this, arguments); }
  function applyProgressEncouragement() { return S.applyProgressEncouragement.apply(this, arguments); }
  function bindProgressFader() { return S.bindProgressFader.apply(this, arguments); }
  function clearAllCompleteCelebration() { return S.clearAllCompleteCelebration.apply(this, arguments); }
  function cloneGradientStops() { return S.cloneGradientStops.apply(this, arguments); }
  function collectItemSelectionIds() { return S.collectItemSelectionIds.apply(this, arguments); }
  function colorAtProgress() { return S.colorAtProgress.apply(this, arguments); }
  function completionColorForEstimate() { return S.completionColorForEstimate.apply(this, arguments); }
  function completionColorForProgress() { return S.completionColorForProgress.apply(this, arguments); }
  function completionTrelloBadgeColor() { return S.completionTrelloBadgeColor.apply(this, arguments); }
  function dedupeBulkEntries() { return S.dedupeBulkEntries.apply(this, arguments); }
  function getActiveCompletionGradient() { return S.getActiveCompletionGradient.apply(this, arguments); }
  function getActiveCompletionSchemeKey() { return S.getActiveCompletionSchemeKey.apply(this, arguments); }
  function getCompletionTrello() { return S.getCompletionTrello.apply(this, arguments); }
  function gradientCssFromStops() { return S.gradientCssFromStops.apply(this, arguments); }
  function loadStoredCompletionGradient() { return S.loadStoredCompletionGradient.apply(this, arguments); }
  function loadStoredCompletionSchemeKey() { return S.loadStoredCompletionSchemeKey.apply(this, arguments); }
  function mountCompletionUI() { return S.mountCompletionUI.apply(this, arguments); }
  function normalizeCompletionSchemeKey() { return S.normalizeCompletionSchemeKey.apply(this, arguments); }
  function normalizeGradientStops() { return S.normalizeGradientStops.apply(this, arguments); }
  function normalizeHexColor() { return S.normalizeHexColor.apply(this, arguments); }
  function parseSelectionKey() { return S.parseSelectionKey.apply(this, arguments); }
  function playAllCompleteCelebration() { return S.playAllCompleteCelebration.apply(this, arguments); }
  function progressBadgePreviewSamples() { return S.progressBadgePreviewSamples.apply(this, arguments); }
  function progressEncouragementMeta() { return S.progressEncouragementMeta.apply(this, arguments); }
  function progressEncouragementText() { return S.progressEncouragementText.apply(this, arguments); }
  function progressEncouragementTierIndex() { return S.progressEncouragementTierIndex.apply(this, arguments); }
  function progressFromFaderDelta() { return S.progressFromFaderDelta.apply(this, arguments); }
  function rgbFromGradientStops() { return S.rgbFromGradientStops.apply(this, arguments); }
  function rgbToHex() { return S.rgbToHex.apply(this, arguments); }
  function saveStoredCompletionGradient() { return S.saveStoredCompletionGradient.apply(this, arguments); }
  function saveStoredCompletionSchemeKey() { return S.saveStoredCompletionSchemeKey.apply(this, arguments); }
  function schemeGradientCss() { return S.schemeGradientCss.apply(this, arguments); }
  function selectAllCheckboxState() { return S.selectAllCheckboxState.apply(this, arguments); }
  function selectionKeyForChecklist() { return S.selectionKeyForChecklist.apply(this, arguments); }
  function selectionKeyForItem() { return S.selectionKeyForItem.apply(this, arguments); }

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

  // exports
  S.mountMiniProgress = mountMiniProgress;
  S.mountProgressGradientEditor = mountProgressGradientEditor;
})(typeof window !== 'undefined' ? window : this);
