/**
 * priority-ui: part 11 of 12 (createHeatPanel).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var AXIS_UI_MAX = S.AXIS_UI_MAX;
  var FORMULAS = S.FORMULAS;
  var FORMULA_OPTIONS = S.FORMULA_OPTIONS;
  var FORMULA_STORAGE_KEY = S.FORMULA_STORAGE_KEY;
  var HEAT_SEGMENTS = S.HEAT_SEGMENTS;
  var INUTILE_LABEL = S.INUTILE_LABEL;
  var KEYWORDS = S.KEYWORDS;
  var SCORE_SURFACE_ALPHA = S.SCORE_SURFACE_ALPHA;
  var SLIDER_STEP = S.SLIDER_STEP;
  var SLIDER_STORAGE_KEY = S.SLIDER_STORAGE_KEY;
  var TIER_DEFS = S.TIER_DEFS;

  // from other parts (functions, resolved at call time)
  function baselineScore() { return S.baselineScore.apply(this, arguments); }
  function bindCollapsibleEnable() { return S.bindCollapsibleEnable.apply(this, arguments); }
  function captureHeatLayoutRects() { return S.captureHeatLayoutRects.apply(this, arguments); }
  function clamp() { return S.clamp.apply(this, arguments); }
  function clampDurationMinutes() { return S.clampDurationMinutes.apply(this, arguments); }
  function classicTierLabel() { return S.classicTierLabel.apply(this, arguments); }
  function createCollapsibleEnableChrome() { return S.createCollapsibleEnableChrome.apply(this, arguments); }
  function createResponsiveTierLabelGroup() { return S.createResponsiveTierLabelGroup.apply(this, arguments); }
  function flashHeatTextEnter() { return S.flashHeatTextEnter.apply(this, arguments); }
  function formatScore() { return S.formatScore.apply(this, arguments); }
  function formatScoreBreakdown() { return S.formatScoreBreakdown.apply(this, arguments); }
  function formatTierDescriptionTooltip() { return S.formatTierDescriptionTooltip.apply(this, arguments); }
  function heatTierDotSizePx() { return S.heatTierDotSizePx.apply(this, arguments); }
  function paintTierDescription() { return S.paintTierDescription.apply(this, arguments); }
  function playHeatLayoutFlip() { return S.playHeatLayoutFlip.apply(this, arguments); }
  function readCssVar() { return S.readCssVar.apply(this, arguments); }
  function renderScoreBreakdownTooltip() { return S.renderScoreBreakdownTooltip.apply(this, arguments); }
  function resolveDisplay() { return S.resolveDisplay.apply(this, arguments); }
  function scoreToRgb() { return S.scoreToRgb.apply(this, arguments); }
  function tierDescriptionContentKey() { return S.tierDescriptionContentKey.apply(this, arguments); }
  function tierVisuals() { return S.tierVisuals.apply(this, arguments); }

  function createHeatPanel(config) {
    var el = config.el;
    var onSegmentClick = config.onSegmentClick || function () {};
    var formulaKey = config.formulaKey || 'baseline';
    var hideSegments = !!config.hideSegments;
    var tooltipId = 'heat-score-tip-' + Math.random().toString(36).slice(2, 9);

    var panel = document.createElement('div');
    panel.className = 'heat-panel';

    var badge = document.createElement('div');
    badge.className = 'heat-badge';

    var bnum = document.createElement('div');
    bnum.className = 'heat-badge-num';
    var dot = document.createElement('span');
    dot.className = 'heat-tier-dot';
    dot.setAttribute('aria-hidden', 'true');
    var bnumVal = document.createElement('span');
    bnumVal.className = 'heat-badge-num-val';
    bnumVal.textContent = '0';
    bnum.appendChild(dot);
    bnum.appendChild(bnumVal);
    var badgeMeta = document.createElement('div');
    badgeMeta.className = 'heat-badge-meta';

    var blabel = document.createElement('div');
    blabel.className = 'heat-badge-label';
    blabel.textContent = 'Optionnelle';

    var scoreInfoWrap = document.createElement('span');
    scoreInfoWrap.className = 'heat-score-info-wrap';

    var scoreInfoBtn = document.createElement('button');
    scoreInfoBtn.type = 'button';
    scoreInfoBtn.className = 'heat-score-info';
    scoreInfoBtn.textContent = '?';
    scoreInfoBtn.setAttribute('aria-label', 'Comment ce score est calcul\u00e9');
    scoreInfoBtn.setAttribute('aria-expanded', 'false');
    scoreInfoBtn.setAttribute('aria-controls', tooltipId);

    var scoreTooltip = document.createElement('div');
    scoreTooltip.id = tooltipId;
    scoreTooltip.className = 'heat-score-tooltip';
    scoreTooltip.setAttribute('role', 'tooltip');

    scoreInfoWrap.appendChild(scoreInfoBtn);
    scoreInfoWrap.appendChild(scoreTooltip);

    function isScoreTooltipVisible() {
      return scoreInfoWrap.classList.contains('is-open')
        || scoreInfoWrap.matches(':hover')
        || scoreInfoWrap.contains(document.activeElement);
    }

    function positionScoreTooltip() {
      var anchor = scoreInfoBtn.getBoundingClientRect();
      var gap = 6;
      var margin = 8;
      var tipW = scoreTooltip.offsetWidth;
      var tipH = scoreTooltip.offsetHeight;
      var top = anchor.bottom + gap;
      var left = anchor.right - tipW;

      if (top + tipH > window.innerHeight - margin && anchor.top - gap - tipH >= margin) {
        top = anchor.top - gap - tipH;
      }
      left = Math.max(margin, Math.min(left, window.innerWidth - tipW - margin));

      scoreTooltip.style.left = left + 'px';
      scoreTooltip.style.top = top + 'px';
    }

    function repositionScoreTooltipIfVisible() {
      if (isScoreTooltipVisible()) positionScoreTooltip();
    }

    function closeScoreTooltip() {
      scoreInfoWrap.classList.remove('is-open');
      scoreInfoBtn.setAttribute('aria-expanded', 'false');
    }

    function openScoreTooltip() {
      scoreInfoWrap.classList.add('is-open');
      scoreInfoBtn.setAttribute('aria-expanded', 'true');
      positionScoreTooltip();
    }

    function toggleScoreTooltip() {
      if (scoreInfoWrap.classList.contains('is-open')) closeScoreTooltip();
      else openScoreTooltip();
    }

    scoreInfoBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleScoreTooltip();
    });

    scoreInfoBtn.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeScoreTooltip();
        scoreInfoBtn.blur();
      }
    });

    scoreInfoWrap.addEventListener('mouseenter', positionScoreTooltip);
    scoreInfoWrap.addEventListener('focusin', positionScoreTooltip);

    window.addEventListener('resize', repositionScoreTooltipIfVisible);
    document.addEventListener('scroll', repositionScoreTooltipIfVisible, true);

    document.addEventListener('click', function (e) {
      if (!scoreInfoWrap.contains(e.target)) closeScoreTooltip();
    });

    badgeMeta.appendChild(blabel);
    badgeMeta.appendChild(scoreInfoWrap);
    badge.appendChild(bnum);
    badge.appendChild(badgeMeta);

    var tierDesc = document.createElement('p');
    tierDesc.className = 'heat-tier-desc';
    tierDesc.hidden = true;

    var heatHead = document.createElement('div');
    heatHead.className = 'heat-head';
    heatHead.appendChild(badge);
    heatHead.appendChild(tierDesc);
    panel.appendChild(heatHead);

    var segsWrap = document.createElement('div');
    segsWrap.className = 'heat-segs';
    var segs = [];

    function bindSegmentTarget(el, seg) {
      function activate() {
        onSegmentClick(seg.target);
      }
      el.addEventListener('click', activate);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    }

    HEAT_SEGMENTS.forEach(function (seg) {
      var s = document.createElement('div');
      s.className = 'heat-seg';
      s.dataset.i = String(seg.i);
      s.dataset.target = String(seg.target);
      s.style.setProperty('--c', seg.color);
      s.setAttribute('role', 'button');
      s.setAttribute('tabindex', '0');
      s.setAttribute('aria-label', seg.label);
      if (seg.description || seg.title) {
        s.title = formatTierDescriptionTooltip(seg.label, seg.title, seg.description);
      }
      bindSegmentTarget(s, seg);
      segsWrap.appendChild(s);
      segs.push(s);
    });
    panel.appendChild(segsWrap);

    var segLabels = document.createElement('div');
    segLabels.className = 'heat-seg-labels';
    var segLabelTargets = [];
    HEAT_SEGMENTS.forEach(function (seg) {
      var label = document.createElement('span');
      label.textContent = seg.label;
      label.setAttribute('role', 'button');
      label.setAttribute('tabindex', '0');
      label.setAttribute('aria-label', seg.label);
      if (seg.description || seg.title) {
        label.title = formatTierDescriptionTooltip(seg.label, seg.title, seg.description);
      }
      bindSegmentTarget(label, seg);
      segLabels.appendChild(label);
      segLabelTargets.push({ el: label, fullLabel: seg.label });
    });
    panel.appendChild(segLabels);

    if (hideSegments) {
      segsWrap.hidden = true;
      segLabels.hidden = true;
    }

    if (
      !hideSegments &&
      global.ContextMenu &&
      typeof global.ContextMenu.bind === 'function' &&
      typeof global.ContextMenu.buildHeatSegmentItems === 'function'
    ) {
      ContextMenu.bind(panel, function () {
        return ContextMenu.buildHeatSegmentItems({
          segments: HEAT_SEGMENTS,
          onPick: function (seg) {
            if (seg && seg.target != null) onSegmentClick(seg.target);
          },
          onExplain: function () {
            openScoreTooltip();
          },
        });
      });
    }

    var currentBadgeTierLabel = 'Optionnelle';
    var lastDescKey = '';
    var lastPaintLabel = currentBadgeTierLabel;
    var heatFlipNodes = [badge, tierDesc];
    var segLabelResponsive = createResponsiveTierLabelGroup({
      container: segLabels,
      targets: segLabelTargets
    });
    var badgeLabelResponsive = createResponsiveTierLabelGroup({
      container: badge,
      targets: [{
        el: blabel,
        getFullLabel: function () { return currentBadgeTierLabel; },
        ariaWhenShort: true
      }]
    });

    el.appendChild(panel);

    function updateScoreTooltip(result, display) {
      var hide = !result || !result.terms || !!display.inutile || !!display.blocked;
      scoreInfoWrap.hidden = hide;
      if (hide) {
        closeScoreTooltip();
        return;
      }
      var breakdown = formatScoreBreakdown(formulaKey, result);
      renderScoreBreakdownTooltip(breakdown, scoreTooltip);
      scoreInfoBtn.removeAttribute('title');
      scoreInfoBtn.setAttribute(
        'aria-label',
        breakdown.short + '. ' + breakdown.lines.join('. ')
      );
      repositionScoreTooltipIfVisible();
    }

    function paint(result, display) {
      var d = display || resolveDisplay(result, {});
      // Heat-badge keeps priority / inutile colors. Blocked crimson is section-scoped (Bloqué).
      var visualSource = d.inutile
        ? { inutile: true, label: INUTILE_LABEL }
        : { i: d.tierI, label: d.label };
      var v = tierVisuals(visualSource);
      // Priority name only — due countdown lives in the Échéance section / board badge.
      var nextLabel = d.eisenhowerLabel || classicTierLabel(d);
      var nextDescKey = tierDescriptionContentKey(d);
      var labelChanged = nextLabel !== lastPaintLabel;
      var descChanged = nextDescKey !== lastDescKey;
      var layoutSensitive = labelChanged || descChanged
        || badge.classList.contains('is-overdue')
        || panel.classList.contains('is-overdue');

      var firstRects = layoutSensitive ? captureHeatLayoutRects(heatFlipNodes) : null;
      if (layoutSensitive) {
        badgeLabelResponsive.setSuspended(true);
        segLabelResponsive.setSuspended(true);
      }

      bnumVal.textContent = formatScore(d.score);
      // Do not paint the heat-badge dot as a blocked glyph — Bloqué section carries that state.
      dot.classList.remove('is-blocked');
      dot.style.setProperty('--heat-tier-dot-size', heatTierDotSizePx(d).toFixed(2) + 'px');
      dot.style.background = v.seg;
      currentBadgeTierLabel = nextLabel;
      badge.style.setProperty('--heat-fill', v.fill);
      badge.style.setProperty('--heat-text', v.text);
      panel.style.setProperty('--heat-text', v.text);
      badge.style.removeProperty('background');
      bnum.style.removeProperty('color');
      blabel.style.removeProperty('color');
      badge.classList.toggle('is-inutile', !!d.inutile);
      badge.classList.remove('is-blocked', 'is-overdue');
      panel.classList.toggle('is-inutile', !!d.inutile);
      // No panel / heat-badge crimson wash for blocked/overdue — section shells carry red.
      panel.classList.remove('is-blocked', 'is-overdue');
      paintTierDescription(tierDesc, d);
      if (labelChanged) flashHeatTextEnter(blabel);
      if (descChanged) flashHeatTextEnter(tierDesc);
      lastPaintLabel = nextLabel;
      lastDescKey = nextDescKey;
      segs.forEach(function (s) {
        s.classList.toggle('on', !d.inutile && d.tierI != null && +s.dataset.i === d.tierI);
      });
      updateScoreTooltip(result, d);
      // Refresh label strings in the current short/long mode; mode flips are debounced.
      badgeLabelResponsive.refresh();
      segLabelResponsive.refresh();

      if (layoutSensitive) {
        playHeatLayoutFlip(heatFlipNodes, firstRects);
        badgeLabelResponsive.setSuspended(false);
        segLabelResponsive.setSuspended(false);
      }
    }

    return {
      el: panel,
      paint: paint,
      setFormulaKey: function (key) {
        formulaKey = key || 'baseline';
      },
      setHideSegments: function (hide) {
        hideSegments = !!hide;
        segsWrap.hidden = hideSegments;
        segLabels.hidden = hideSegments;
      }
    };
  }

  function createFormulaSwitcher(config) {
    var el = config.el;
    var initialKey = config.formulaKey || 'baseline';
    var onChange = config.onChange || function () {};

    var wrap = document.createElement('div');
    wrap.className = 'formula-switcher';
    wrap.setAttribute('role', 'radiogroup');
    wrap.setAttribute('aria-label', 'Formule de priorité');

    var currentKey = initialKey;
    var buttons = [];

    FORMULA_OPTIONS.forEach(function (option) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'formula-switcher-btn';
      btn.dataset.formula = option.key;
      btn.textContent = option.label;
      btn.title = option.description || option.label;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', option.key === currentKey ? 'true' : 'false');
      btn.addEventListener('click', function () {
        if (currentKey === option.key) return;
        currentKey = option.key;
        buttons.forEach(function (b) {
          b.classList.toggle('is-active', b.dataset.formula === currentKey);
          b.setAttribute('aria-checked', b.dataset.formula === currentKey ? 'true' : 'false');
        });
        onChange(currentKey);
      });
      if (option.key === currentKey) btn.classList.add('is-active');
      wrap.appendChild(btn);
      buttons.push(btn);
    });

    el.appendChild(wrap);

    return {
      el: wrap,
      getFormulaKey: function () { return currentKey; },
      setFormulaKey: function (key) {
        currentKey = key || 'baseline';
        buttons.forEach(function (b) {
          b.classList.toggle('is-active', b.dataset.formula === currentKey);
          b.setAttribute('aria-checked', b.dataset.formula === currentKey ? 'true' : 'false');
        });
      }
    };
  }

  function createCalcGraphPanel(config) {
    var el = config.el;
    var fields = config.fields || null;
    var onInputsChange = config.onChange || function () {};
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var onToggle = config.onToggle || function () {};
    var SVG_W = 260;
    var SVG_H = 208;
    var MARGIN = { top: 8, right: 6, bottom: 26, left: 28 };
    var PLOT_W = SVG_W - MARGIN.left - MARGIN.right;
    var PLOT_H = SVG_H - MARGIN.top - MARGIN.bottom;
    var CONTOUR_RES = 40;
    var TIER_THRESHOLDS = [];
    for (var ti = TIER_DEFS.length - 1; ti >= 0; ti--) {
      if (TIER_DEFS[ti].min > 0) TIER_THRESHOLDS.push(TIER_DEFS[ti].min);
    }
    var MARKER_CORE_R = 5;
    var MARKER_STROKE_W = 2;
    var MARKER_SHADOW_R = 6;
    var MARKER_HIT_R = 14;

    var lastScene = { U: 0, I: 0, F: 0, result: null, display: null };
    var draggingMarker = false;
    var dragPointerId = null;
    var dragVisual = { u: null, i: null };
    var dragMoveRaf = null;
    var pendingDragPt = null;

    function snapAxis(v, min, max) {
      return clamp(Math.round(v / SLIDER_STEP) * SLIDER_STEP, min, max);
    }

    function applyUrgencyImpact(u, i) {
      u = snapAxis(u, 0, AXIS_UI_MAX);
      i = snapAxis(i, 0, AXIS_UI_MAX);
      if (fields && fields.urgency) fields.urgency.updateDisplay(u);
      if (fields && fields.impact) fields.impact.updateDisplay(i);
      onInputsChange();
    }

    function applyEase(f) {
      f = snapAxis(f, 1, 5);
      if (fields && fields.ease) fields.ease.updateDisplay(f);
      onInputsChange();
    }

    function svgEl(tag, attrs) {
      var node = document.createElementNS(SVG_NS, tag);
      if (attrs) {
        Object.keys(attrs).forEach(function (key) {
          node.setAttribute(key, attrs[key]);
        });
      }
      return node;
    }

    function lineEl(x1, y1, x2, y2, cls) {
      return svgEl('line', {
        class: cls,
        x1: String(x1),
        y1: String(y1),
        x2: String(x2),
        y2: String(y2)
      });
    }

    function plotX(u) {
      return MARGIN.left + (u / AXIS_UI_MAX) * PLOT_W;
    }

    function plotY(i) {
      return MARGIN.top + (1 - i / AXIS_UI_MAX) * PLOT_H;
    }

    function formatEase(F) {
      return Math.abs(F - Math.round(F)) < 0.01 ? String(Math.round(F)) : F.toFixed(2);
    }

    var panel = document.createElement('div');
    panel.className = 'calc-graph-panel field field--graphique';

    var bodyId = 'calc-graph-body-' + Math.random().toString(36).slice(2, 9);
    var chrome = createCollapsibleEnableChrome({
      title: 'Graphique',
      bodyId: bodyId,
      hideEnable: true,
      leadingIcon: 'ti-chart-area',
      iconClass: 'graphique-leading-icon',
      titleClass: 'graphique-enable-title',
      collapseLabel: 'Replier Graphique',
      expandLabel: 'D\u00e9velopper Graphique'
    });
    panel.appendChild(chrome.head);

    var body = document.createElement('div');
    body.className = 'calc-graph-body section-toggle-body';
    body.id = bodyId;
    body.hidden = true;

    var graphSection = document.createElement('div');
    graphSection.className = 'calc-graph-section calc-rsm-section';

    var rsmWrap = document.createElement('div');
    rsmWrap.className = 'calc-rsm-wrap';
    rsmWrap.setAttribute('role', 'img');
    rsmWrap.setAttribute('aria-label', 'Graphique de priorité. Urgence et impact');

    var rsmRow = document.createElement('div');
    rsmRow.className = 'calc-rsm-row';

    var chart = document.createElement('div');
    chart.className = 'calc-rsm-chart';

    var surfaceCanvas = document.createElement('canvas');
    surfaceCanvas.className = 'calc-rsm-surface';
    surfaceCanvas.setAttribute('aria-hidden', 'true');

    var svg = svgEl('svg', {
      class: 'calc-rsm-svg',
      viewBox: '0 0 ' + SVG_W + ' ' + SVG_H,
      'aria-labelledby': 'calc-rsm-desc'
    });
    var descId = svgEl('desc', { id: 'calc-rsm-desc' });
    descId.textContent = 'Score selon l\'urgence et l\'impact, pour un niveau de facilité fixe';
    svg.appendChild(descId);

    var defs = svgEl('defs');

    var glowFilter = svgEl('filter', {
      id: 'calc-rsm-glow',
      x: '-80%',
      y: '-80%',
      width: '260%',
      height: '260%'
    });
    glowFilter.appendChild(svgEl('feGaussianBlur', { stdDeviation: '3', result: 'blur' }));
    var glowMerge = svgEl('feMerge');
    glowMerge.appendChild(svgEl('feMergeNode', { in: 'blur' }));
    glowMerge.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
    glowFilter.appendChild(glowMerge);
    defs.appendChild(glowFilter);

    var glassGrad = svgEl('linearGradient', {
      id: 'calc-rsm-glass',
      x1: '0%',
      y1: '0%',
      x2: '100%',
      y2: '100%'
    });
    var glassStop0 = svgEl('stop', { offset: '0%', 'stop-color': readCssVar('--surface-2', '#FFFFFF'), 'stop-opacity': '0.55' });
    var glassStop1 = svgEl('stop', { offset: '100%', 'stop-color': readCssVar('--surface-1', '#EFEDE8'), 'stop-opacity': '0.25' });
    glassGrad.appendChild(glassStop0);
    glassGrad.appendChild(glassStop1);
    defs.appendChild(glassGrad);

    function updateChartTheme() {
      glassStop0.setAttribute('stop-color', readCssVar('--surface-2', '#FFFFFF'));
      glassStop1.setAttribute('stop-color', readCssVar('--surface-1', '#EFEDE8'));
    }

    var plotClip = svgEl('clipPath', { id: 'calc-rsm-plot-clip' });
    plotClip.appendChild(svgEl('rect', {
      x: String(MARGIN.left),
      y: String(MARGIN.top),
      width: String(PLOT_W),
      height: String(PLOT_H),
      rx: '4'
    }));
    defs.appendChild(plotClip);
    svg.appendChild(defs);

    var frame = svgEl('rect', {
      class: 'calc-rsm-frame',
      x: '5',
      y: '5',
      width: String(SVG_W - 10),
      height: String(SVG_H - 10),
      rx: '8'
    });
    svg.appendChild(frame);

    var plotBg = svgEl('rect', {
      class: 'calc-rsm-plot-bg',
      x: String(MARGIN.left),
      y: String(MARGIN.top),
      width: String(PLOT_W),
      height: String(PLOT_H),
      rx: '4'
    });
    svg.appendChild(plotBg);

    var gridG = svgEl('g', { class: 'calc-rsm-grid', 'aria-hidden': 'true' });
    var g;
    for (g = 0; g <= 4; g++) {
      gridG.appendChild(lineEl(
        plotX(g), plotY(0), plotX(g), plotY(4), 'calc-rsm-grid-line'
      ));
      gridG.appendChild(lineEl(
        plotX(0), plotY(g), plotX(4), plotY(g), 'calc-rsm-grid-line'
      ));
    }
    svg.appendChild(gridG);

    var contoursG = svgEl('g', {
      class: 'calc-rsm-contours',
      'clip-path': 'url(#calc-rsm-plot-clip)',
      'aria-hidden': 'true'
    });
    svg.appendChild(contoursG);

    var plotHit = svgEl('rect', {
      class: 'calc-rsm-plot-hit',
      x: String(MARGIN.left),
      y: String(MARGIN.top),
      width: String(PLOT_W),
      height: String(PLOT_H),
      rx: '4'
    });
    svg.appendChild(plotHit);

    var axesG = svgEl('g', { class: 'calc-rsm-axes' });
    axesG.appendChild(lineEl(plotX(0), plotY(0), plotX(4), plotY(0), 'calc-rsm-axis calc-rsm-axis-x'));
    axesG.appendChild(lineEl(plotX(0), plotY(0), plotX(0), plotY(4), 'calc-rsm-axis calc-rsm-axis-y'));

    var ticksG = svgEl('g', { class: 'calc-rsm-ticks', 'aria-hidden': 'true' });
    for (g = 0; g <= 4; g++) {
      ticksG.appendChild(lineEl(plotX(g), plotY(0), plotX(g), plotY(0) + 3, 'calc-rsm-tick'));
      var tickLabelX = svgEl('text', { class: 'calc-rsm-tick-label' });
      tickLabelX.setAttribute('x', String(plotX(g)));
      tickLabelX.setAttribute('y', String(plotY(0) + 13));
      tickLabelX.setAttribute('text-anchor', 'middle');
      tickLabelX.textContent = String(g);
      ticksG.appendChild(tickLabelX);

      ticksG.appendChild(lineEl(plotX(0) - 3, plotY(g), plotX(0), plotY(g), 'calc-rsm-tick'));
      var tickLabelY = svgEl('text', { class: 'calc-rsm-tick-label' });
      tickLabelY.setAttribute('x', String(plotX(0) - 7));
      tickLabelY.setAttribute('y', String(plotY(g) + 3));
      tickLabelY.setAttribute('text-anchor', 'end');
      tickLabelY.textContent = String(g);
      ticksG.appendChild(tickLabelY);
    }
    axesG.appendChild(ticksG);

    var labelU = svgEl('text', { class: 'calc-rsm-axis-label calc-rsm-axis-label-x' });
    labelU.setAttribute('x', String(MARGIN.left + PLOT_W * 0.5));
    labelU.setAttribute('y', String(SVG_H - 4));
    labelU.setAttribute('text-anchor', 'middle');
    labelU.textContent = 'Urgence';
    labelU.setAttribute('title', KEYWORDS.urgency);

    var labelIY = MARGIN.top + PLOT_H * 0.5;
    var labelIX = plotX(0) - 18;
    var labelI = svgEl('text', { class: 'calc-rsm-axis-label calc-rsm-axis-label-y' });
    labelI.setAttribute('transform', 'rotate(-90 ' + labelIX + ' ' + labelIY + ')');
    labelI.setAttribute('x', String(labelIX));
    labelI.setAttribute('y', String(labelIY));
    labelI.setAttribute('text-anchor', 'middle');
    labelI.textContent = 'Impact';
    labelI.setAttribute('title', KEYWORDS.impact);

    axesG.appendChild(labelU);
    axesG.appendChild(labelI);
    svg.appendChild(axesG);

    var markerCrossG = svgEl('g', {
      class: 'calc-rsm-marker-crosshair',
      'clip-path': 'url(#calc-rsm-plot-clip)'
    });
    var crossH = lineEl(0, 0, 0, 0, 'calc-rsm-crosshair calc-rsm-crosshair-h');
    var crossV = lineEl(0, 0, 0, 0, 'calc-rsm-crosshair calc-rsm-crosshair-v');
    markerCrossG.appendChild(crossH);
    markerCrossG.appendChild(crossV);

    var markerG = svgEl('g', { class: 'calc-rsm-marker' });
    var markerShadow = svgEl('circle', { class: 'calc-rsm-marker-shadow' });
    var markerCore = svgEl('circle', { class: 'calc-rsm-marker-core' });
    var markerHit = svgEl('circle', { class: 'calc-rsm-marker-hit' });
    markerG.appendChild(markerShadow);
    markerG.appendChild(markerCore);
    markerG.appendChild(markerHit);

    svg.appendChild(markerCrossG);
    svg.appendChild(markerG);

    var easeCol = document.createElement('div');
    easeCol.className = 'calc-rsm-ease-col';
    easeCol.title = KEYWORDS.ease;

    var easeTitle = document.createElement('span');
    easeTitle.className = 'calc-rsm-ease-title';
    easeTitle.textContent = 'Facilit\u00e9';
    easeTitle.setAttribute('aria-hidden', 'true');

    var easeTrack = document.createElement('div');
    easeTrack.className = 'calc-rsm-ease-track';

    var easeLabelTop = document.createElement('span');
    easeLabelTop.className = 'calc-rsm-ease-label calc-rsm-ease-label-top';
    easeLabelTop.textContent = '5';

    var easeSlider = document.createElement('input');
    easeSlider.type = 'range';
    easeSlider.className = 'calc-rsm-ease-range';
    easeSlider.min = '1';
    easeSlider.max = '5';
    easeSlider.step = String(SLIDER_STEP);
    easeSlider.value = '3';
    easeSlider.setAttribute('aria-label', 'Facilit\u00e9');
    easeSlider.title = KEYWORDS.ease;

    var easeLabelBottom = document.createElement('span');
    easeLabelBottom.className = 'calc-rsm-ease-label calc-rsm-ease-label-bottom';
    easeLabelBottom.textContent = '1';

    easeTrack.appendChild(easeLabelTop);
    easeTrack.appendChild(easeSlider);
    easeTrack.appendChild(easeLabelBottom);
    easeCol.appendChild(easeTitle);
    easeCol.appendChild(easeTrack);

    chart.appendChild(surfaceCanvas);
    chart.appendChild(svg);
    rsmRow.appendChild(chart);
    rsmRow.appendChild(easeCol);
    rsmWrap.appendChild(rsmRow);

    graphSection.appendChild(rsmWrap);
    body.appendChild(graphSection);
    panel.appendChild(body);
    el.appendChild(panel);

    var graphCollapsed = true;
    var graphCollapse = null;
    var surfaceCtx = surfaceCanvas.getContext('2d', { alpha: true });

    function clientToPlotClamped(clientX, clientY) {
      var rect = plotHit.getBoundingClientRect();
      var x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      var y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      return plotCoordsFromLocal(x, y, rect.width, rect.height);
    }

    function plotCoordsFromLocal(x, y, w, h) {
      return {
        u: (x / w) * AXIS_UI_MAX,
        i: (1 - y / h) * AXIS_UI_MAX
      };
    }

    function plotAreaMetrics() {
      void chart.offsetWidth;
      var chartRect = chart.getBoundingClientRect();
      var plotRect = plotHit.getBoundingClientRect();
      if (chartRect.width < 1 || chartRect.height < 1 || plotRect.width < 1 || plotRect.height < 1) {
        return null;
      }
      var cssW = plotRect.width;
      var cssH = plotRect.height;
      var scaleX = cssW / PLOT_W;
      return {
        left: plotRect.left - chartRect.left,
        top: plotRect.top - chartRect.top,
        cssW: cssW,
        cssH: cssH,
        radius: Math.max(1, 4 * scaleX)
      };
    }

    function resizeSurfaceCanvas() {
      var metrics = plotAreaMetrics();
      if (!metrics) {
        return null;
      }
      var cssW = metrics.cssW;
      var cssH = metrics.cssH;
      var dpr = window.devicePixelRatio || 1;
      var bmpW = Math.max(1, Math.round(cssW * dpr));
      var bmpH = Math.max(1, Math.round(cssH * dpr));
      surfaceCanvas.style.left = metrics.left + 'px';
      surfaceCanvas.style.top = metrics.top + 'px';
      surfaceCanvas.style.width = cssW + 'px';
      surfaceCanvas.style.height = cssH + 'px';
      surfaceCanvas.style.borderRadius = metrics.radius + 'px';
      surfaceCanvas.width = bmpW;
      surfaceCanvas.height = bmpH;
      // Setting canvas bitmap dims can reset layout size in some engines.
      surfaceCanvas.style.width = cssW + 'px';
      surfaceCanvas.style.height = cssH + 'px';
      surfaceCanvas.style.borderRadius = metrics.radius + 'px';
      // putImageData ignores the context transform — paint at device-pixel size directly.
      surfaceCtx.setTransform(1, 0, 0, 1, 0, 0);
      return { w: bmpW, h: bmpH };
    }

    function paintSurface(F) {
      var size = resizeSurfaceCanvas();
      if (!size) {
        surfaceCanvas.style.visibility = 'hidden';
        return false;
      }
      surfaceCanvas.style.visibility = 'visible';
      var w = size.w;
      var h = size.h;
      var img = surfaceCtx.createImageData(w, h);
      var data = img.data;
      var px;
      for (var row = 0; row < h; row++) {
        var i = (1 - row / (h - 1 || 1)) * 4;
        for (var col = 0; col < w; col++) {
          var u = (col / (w - 1 || 1)) * 4;
          var score = baselineScore(u, i, F);
          var rgb = scoreToRgb(score);
          px = (row * w + col) * 4;
          data[px] = rgb.r;
          data[px + 1] = rgb.g;
          data[px + 2] = rgb.b;
          data[px + 3] = Math.round(SCORE_SURFACE_ALPHA * 255);
        }
      }
      surfaceCtx.putImageData(img, 0, 0);
      return true;
    }

    function lerpPlot(a, b, t) {
      return a + (b - a) * t;
    }

    function contourSegment(values, row, col, threshold) {
      var v0 = values[row][col];
      var v1 = values[row][col + 1];
      var v2 = values[row + 1][col + 1];
      var v3 = values[row + 1][col];
      var mask = 0;
      if (v0 >= threshold) mask |= 1;
      if (v1 >= threshold) mask |= 2;
      if (v2 >= threshold) mask |= 4;
      if (v3 >= threshold) mask |= 8;
      if (mask === 0 || mask === 15) return null;

      var x0 = plotX((col / CONTOUR_RES) * 4);
      var x1 = plotX(((col + 1) / CONTOUR_RES) * 4);
      var y0 = plotY((1 - row / CONTOUR_RES) * 4);
      var y1 = plotY((1 - (row + 1) / CONTOUR_RES) * 4);

      function interp(va, vb, xa, ya, xb, yb) {
        var t = (threshold - va) / (vb - va);
        return {
          x: lerpPlot(xa, xb, t),
          y: lerpPlot(ya, yb, t)
        };
      }

      var top = interp(v0, v1, x0, y0, x1, y0);
      var right = interp(v1, v2, x1, y0, x1, y1);
      var bottom = interp(v3, v2, x0, y1, x1, y1);
      var left = interp(v0, v3, x0, y0, x0, y1);

      var segments = {
        1: [[left, top]], 2: [[top, right]], 3: [[left, right]], 4: [[right, bottom]],
        5: [[left, bottom], [top, right]], 6: [[top, bottom]], 7: [[left, bottom]],
        8: [[bottom, left]], 9: [[top, bottom]], 10: [[top, left], [right, bottom]],
        11: [[right, bottom]], 12: [[right, left]], 13: [[top, right]], 14: [[top, left]]
      };
      return segments[mask] || null;
    }

    function paintContours(F) {
      contoursG.innerHTML = '';
      var values = [];
      var r;
      for (r = 0; r <= CONTOUR_RES; r++) {
        values[r] = [];
        var i = (1 - r / CONTOUR_RES) * 4;
        var c;
        for (c = 0; c <= CONTOUR_RES; c++) {
          var u = (c / CONTOUR_RES) * 4;
          values[r][c] = baselineScore(u, i, F);
        }
      }

      TIER_THRESHOLDS.forEach(function (threshold) {
        var row;
        for (row = 0; row < CONTOUR_RES; row++) {
          var col;
          for (col = 0; col < CONTOUR_RES; col++) {
            var segs = contourSegment(values, row, col, threshold);
            if (!segs) continue;
            segs.forEach(function (seg) {
              contoursG.appendChild(lineEl(
                seg[0].x, seg[0].y, seg[1].x, seg[1].y, 'calc-rsm-contour'
              ));
            });
          }
        }
      });
    }

    function paintMarker(U, I, display) {
      var d = display;
      var cx = plotX(U);
      var cy = plotY(I);
      var span = 7;

      crossH.setAttribute('x1', String(cx - span));
      crossH.setAttribute('y1', String(cy));
      crossH.setAttribute('x2', String(cx + span));
      crossH.setAttribute('y2', String(cy));
      crossV.setAttribute('x1', String(cx));
      crossV.setAttribute('y1', String(cy - span));
      crossV.setAttribute('x2', String(cx));
      crossV.setAttribute('y2', String(cy + span));

      markerShadow.setAttribute('cx', String(cx));
      markerShadow.setAttribute('cy', String(cy + 0.75));
      markerShadow.setAttribute('r', String(MARKER_SHADOW_R));

      markerCore.setAttribute('cx', String(cx));
      markerCore.setAttribute('cy', String(cy));
      markerCore.setAttribute('r', String(MARKER_CORE_R));
      markerCore.setAttribute('fill', readCssVar('--chart-marker-core', '#FFFFFF'));
      markerCore.setAttribute('stroke', d.inutile
        ? readCssVar('--chart-marker-stroke-inutile', '#9B9890')
        : d.seg);
      markerCore.setAttribute('stroke-width', String(MARKER_STROKE_W));

      markerHit.setAttribute('cx', String(cx));
      markerHit.setAttribute('cy', String(cy));
      markerHit.setAttribute('r', String(MARKER_HIT_R));

      markerG.classList.toggle('is-inutile', d.inutile);

      markerG.setAttribute('aria-label',
        formatScore(d.score) + ' · ' + d.label +
        ' — U ' + U.toFixed(2) + ', I ' + I.toFixed(2) + ', F ' + formatEase(lastScene.F)
      );
    }

    function cancelDragMoveRaf() {
      if (dragMoveRaf != null) {
        cancelAnimationFrame(dragMoveRaf);
        dragMoveRaf = null;
      }
      pendingDragPt = null;
    }

    function scheduleDragApply(pt) {
      pendingDragPt = pt;
      if (dragMoveRaf != null) return;
      dragMoveRaf = requestAnimationFrame(function () {
        dragMoveRaf = null;
        var p = pendingDragPt;
        pendingDragPt = null;
        if (!p || !draggingMarker) return;
        applyUrgencyImpact(p.u, p.i);
      });
    }

    function updateDragMarkerVisual() {
      if (!draggingMarker || dragVisual.u == null || dragVisual.i == null || !lastScene.display) {
        return;
      }
      paintMarker(dragVisual.u, dragVisual.i, lastScene.display);
    }

    function startUIDrag(e, captureEl) {
      if (e.button !== 0) return;
      draggingMarker = true;
      dragPointerId = e.pointerId;
      markerG.classList.add('is-dragging');
      chart.classList.add('is-dragging-marker');
      captureEl.setPointerCapture(e.pointerId);
      e.preventDefault();
      var pt = clientToPlotClamped(e.clientX, e.clientY);
      if (!pt) return;
      dragVisual.u = clamp(pt.u, 0, 4);
      dragVisual.i = clamp(pt.i, 0, 4);
      applyUrgencyImpact(pt.u, pt.i);
    }

    function moveUIDrag(e) {
      if (!draggingMarker || e.pointerId !== dragPointerId) return;
      var pt = clientToPlotClamped(e.clientX, e.clientY);
      if (!pt) return;
      dragVisual.u = clamp(pt.u, 0, 4);
      dragVisual.i = clamp(pt.i, 0, 4);
      updateDragMarkerVisual();
      scheduleDragApply(pt);
    }

    function endUIDrag(e, captureEl) {
      if (!draggingMarker || e.pointerId !== dragPointerId) return;
      cancelDragMoveRaf();
      draggingMarker = false;
      dragPointerId = null;
      dragVisual.u = null;
      dragVisual.i = null;
      markerG.classList.remove('is-dragging');
      chart.classList.remove('is-dragging-marker');
      try {
        captureEl.releasePointerCapture(e.pointerId);
      } catch (err) { /* noop */ }
      var pt = clientToPlotClamped(e.clientX, e.clientY);
      if (pt) applyUrgencyImpact(pt.u, pt.i);
      else onInputsChange();
    }

    plotHit.addEventListener('pointerdown', function (e) {
      startUIDrag(e, plotHit);
    });
    plotHit.addEventListener('pointermove', moveUIDrag);
    plotHit.addEventListener('pointerup', function (e) {
      endUIDrag(e, plotHit);
    });
    plotHit.addEventListener('pointercancel', function (e) {
      endUIDrag(e, plotHit);
    });

    markerHit.addEventListener('pointerdown', function (e) {
      startUIDrag(e, markerHit);
    });

    markerHit.addEventListener('pointermove', moveUIDrag);

    markerHit.addEventListener('pointerup', function (e) {
      endUIDrag(e, markerHit);
    });
    markerHit.addEventListener('pointercancel', function (e) {
      endUIDrag(e, markerHit);
    });

    function handleEaseInput() {
      applyEase(+easeSlider.value);
    }
    easeSlider.addEventListener('input', handleEaseInput);
    easeSlider.addEventListener('change', handleEaseInput);

    var chartResizeObserver;
    var layoutSurfaceRaf = null;

    function scheduleLayoutSurfacePaint() {
      if (layoutSurfaceRaf != null) {
        cancelAnimationFrame(layoutSurfaceRaf);
      }
      layoutSurfaceRaf = requestAnimationFrame(function () {
        layoutSurfaceRaf = requestAnimationFrame(function () {
          layoutSurfaceRaf = null;
          repaintSurfaceFromLayout();
        });
      });
    }

    function repaintSurfaceFromLayout() {
      if (!lastScene.result || draggingMarker) return;
      paintSurface(lastScene.F);
    }

    if (typeof ResizeObserver !== 'undefined') {
      chartResizeObserver = new ResizeObserver(function () {
        repaintSurfaceFromLayout();
      });
      chartResizeObserver.observe(chart);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', repaintSurfaceFromLayout);
    }

    function paint(result, inputs, display) {
      var terms = result.terms || {};
      var U = terms.U != null ? terms.U : inputs.urgency;
      var I = terms.I != null ? terms.I : inputs.impact;
      var F = terms.F != null ? terms.F : inputs.ease;
      var d = display || resolveDisplay(result, inputs);

      lastScene.U = U;
      lastScene.I = I;
      lastScene.F = F;
      lastScene.result = result;
      lastScene.display = d;

      var markerU = U;
      var markerI = I;
      if (draggingMarker && dragVisual.u != null && dragVisual.i != null) {
        markerU = dragVisual.u;
        markerI = dragVisual.i;
      }

      if (!graphCollapsed && !draggingMarker) {
        paintContours(F);
        paintSurface(F);
        scheduleLayoutSurfacePaint();
      }
      paintMarker(markerU, markerI, d);

      var fStr = String(F);
      if (document.activeElement !== easeSlider && easeSlider.value !== fStr) {
        easeSlider.value = fStr;
      }

      descId.textContent =
        'Priorité selon urgence ' + U.toFixed(2) + ' et impact ' + I.toFixed(2) +
        ', facilité ' + formatEase(F) + '/5' +
        ' — score ' + formatScore(d.score) + ', palier ' + d.label;
    }

    function setGraphCollapsed(collapsed) {
      if (!graphCollapse) return;
      graphCollapse.setExpanded(!collapsed);
    }

    function syncGraphVisibility() {
      if (!graphCollapse) return;
      graphCollapsed = !graphCollapse.isExpanded();
      panel.classList.toggle('is-collapsed', graphCollapsed);
      panel.classList.toggle('is-enabled', true);
      if (!graphCollapsed && lastScene.result) {
        paint(lastScene.result, {
          urgency: lastScene.U,
          impact: lastScene.I,
          ease: lastScene.F
        }, lastScene.display);
      } else if (!graphCollapsed) {
        scheduleLayoutSurfacePaint();
      }
      onToggle(!graphCollapsed);
    }

    graphCollapse = bindCollapsibleEnable({
      field: panel,
      body: body,
      chrome: chrome,
      alwaysEnabled: true,
      enabled: true,
      expanded: config.expanded != null ? !!config.expanded : false,
      onExpandChange: config.onExpandChange || null,
      onLayoutChange: function () {
        syncGraphVisibility();
      },
      getContextMenuItems: function (api) {
        if (
          !global.ContextMenu ||
          typeof global.ContextMenu.buildExpandToggleItem !== 'function'
        ) {
          return [];
        }
        return [
          ContextMenu.buildExpandToggleItem({
            isExpanded: api.isExpanded,
            setExpanded: api.setExpanded,
            collapseLabel: 'Replier Calcul',
            expandLabel: 'D\u00e9velopper Calcul',
          }),
        ];
      },
    });
    graphCollapsed = !graphCollapse.isExpanded();

    return {
      el: panel,
      paint: paint,
      updateTheme: updateChartTheme,
      setCollapsed: setGraphCollapsed,
      setEnabled: function () { /* Graphique is always enabled */ },
      isEnabled: function () { return true; },
      isExpanded: function () { return !!(graphCollapse && graphCollapse.isExpanded()); },
      disconnect: function () {
        if (chartResizeObserver) chartResizeObserver.disconnect();
        if (layoutSurfaceRaf != null) {
          cancelAnimationFrame(layoutSurfaceRaf);
          layoutSurfaceRaf = null;
        }
      }
    };
  }

  // ── 10. Variant mount & slider persistence ──────────────────────────────

  function normalizeFormulaKey(key) {
    return FORMULAS[key] ? key : 'baseline';
  }

  function loadStoredFormulaKey() {
    try {
      if (typeof localStorage === 'undefined') return null;
      var raw = localStorage.getItem(FORMULA_STORAGE_KEY);
      if (!raw) return null;
      return FORMULAS[raw] ? raw : null;
    } catch (e) { return null; }
  }

  function saveStoredFormulaKey(key) {
    try {
      if (typeof localStorage === 'undefined') return;
      if (!FORMULAS[key]) return;
      localStorage.setItem(FORMULA_STORAGE_KEY, key);
    } catch (e) { /* ignore quota / private mode */ }
  }

  function loadSliderValues(defaults, dimensions) {
    var merged = Object.assign({}, defaults);
    try {
      if (typeof localStorage === 'undefined') return merged;
      var raw = localStorage.getItem(SLIDER_STORAGE_KEY);
      if (!raw) return merged;
      var stored = JSON.parse(raw);
      if (!stored || typeof stored !== 'object') return merged;
      dimensions.forEach(function (dim) {
        var v = stored[dim.key];
        if (typeof v === 'number' && isFinite(v)) {
          merged[dim.key] = clamp(v, dim.min, dim.max);
        }
      });
      if (stored.estimatedDurationMinutes != null) {
        merged.estimatedDurationMinutes = clampDurationMinutes(
          stored.estimatedDurationMinutes
        );
      }
    } catch (e) { /* ignore corrupt storage */ }
    return merged;
  }

  function saveSliderValues(state) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SLIDER_STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore quota / private mode */ }
  }

  function mountVariantFailedStub(containerEl, variantConfig, err) {
    var variantId = (variantConfig && variantConfig.id) || 'unknown';
    var formulaKey = (variantConfig && variantConfig.formula) || 'baseline';
    console.error('PriorityUI.mountVariant failed', {
      id: variantId,
      formula: formulaKey,
      error: err
    });
    if (containerEl) {
      containerEl.replaceChildren();
      var notice = document.createElement('p');
      notice.className = 'variant-mount-error';
      notice.textContent = 'Une partie de l\u2019\u00e9diteur n\u2019a pas pu se charger.';
      containerEl.appendChild(notice);
    }
    return {
      card: null,
      getState: function () { return {}; },
      setState: function () {},
      repaint: function () {}
    };
  }

  // exports
  S.createCalcGraphPanel = createCalcGraphPanel;
  S.createFormulaSwitcher = createFormulaSwitcher;
  S.createHeatPanel = createHeatPanel;
  S.loadSliderValues = loadSliderValues;
  S.loadStoredFormulaKey = loadStoredFormulaKey;
  S.mountVariantFailedStub = mountVariantFailedStub;
  S.normalizeFormulaKey = normalizeFormulaKey;
  S.saveSliderValues = saveSliderValues;
  S.saveStoredFormulaKey = saveStoredFormulaKey;
})(typeof window !== 'undefined' ? window : this);
