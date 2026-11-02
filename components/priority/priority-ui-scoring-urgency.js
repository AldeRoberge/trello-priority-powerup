/**
 * priority-ui-scoring: part 2 of 2 (paintTierDescription).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui-scoring.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var AXIS_SCORE_MAX = S.AXIS_SCORE_MAX;
  var AXIS_UI_MAX = S.AXIS_UI_MAX;
  var BASE_EASE_WEIGHT = S.BASE_EASE_WEIGHT;
  var BASE_IMPACT_WEIGHT = S.BASE_IMPACT_WEIGHT;
  var DAMPEN_MAX = S.DAMPEN_MAX;
  var DAMPEN_POWER = S.DAMPEN_POWER;
  var DATE_GAIN_FIXED = S.DATE_GAIN_FIXED;
  var DATE_GAIN_MOVABLE = S.DATE_GAIN_MOVABLE;
  var DATE_PROXIMITY_TAU_DAYS = S.DATE_PROXIMITY_TAU_DAYS;
  var DUE_LIMIT_STATE_NONE = S.DUE_LIMIT_STATE_NONE;
  var EASE_COST_DEFS = S.EASE_COST_DEFS;
  var EASE_FLOOR = S.EASE_FLOOR;
  var EASE_QUICK_WINS = S.EASE_QUICK_WINS;
  var EISENHOWER_IMPACT_THRESHOLD = S.EISENHOWER_IMPACT_THRESHOLD;
  var EISENHOWER_URGENCY_THRESHOLD = S.EISENHOWER_URGENCY_THRESHOLD;
  var EMPRESSEMENT_DEFAULT_ID = S.EMPRESSEMENT_DEFAULT_ID;
  var EMPRESSEMENT_OPTIONS = S.EMPRESSEMENT_OPTIONS;
  var EMPRESSEMENT_PULL_MAX = S.EMPRESSEMENT_PULL_MAX;
  var EMPRESSEMENT_UI_MAX = S.EMPRESSEMENT_UI_MAX;
  var IMPACT_EXP = S.IMPACT_EXP;
  var IMPACT_FACTOR_DEFS = S.IMPACT_FACTOR_DEFS;
  var IMPACT_SYNERGY_PER_EXTRA = S.IMPACT_SYNERGY_PER_EXTRA;
  var INUTILE_LABEL = S.INUTILE_LABEL;
  var LABELS = S.LABELS;
  var PRESSURE_MAX = S.PRESSURE_MAX;
  var SCORE_MAX = S.SCORE_MAX;
  var TIER_I_MAX = S.TIER_I_MAX;
  var URGENCY_BOOST_MAX = S.URGENCY_BOOST_MAX;
  var URGENCY_BOOST_MIN_U = S.URGENCY_BOOST_MIN_U;
  var URGENCY_MIGRATION_MODE = S.URGENCY_MIGRATION_MODE;
  var URGENCY_REVIEW_THRESHOLD_10 = S.URGENCY_REVIEW_THRESHOLD_10;
  var URGENCY_TO_TB = S.URGENCY_TO_TB;
  var WB = S.WB;
  var WI = S.WI;
  var WT = S.WT;

  // from other parts (functions, resolved at call time)
  function isDarkTheme() { return S.isDarkTheme.apply(this, arguments); }
  function tierDescriptionBody() { return S.tierDescriptionBody.apply(this, arguments); }
  function tierDescriptionTitle() { return S.tierDescriptionTitle.apply(this, arguments); }
  function tierVisuals() { return S.tierVisuals.apply(this, arguments); }
  function calcEisenhower() { return S.calcEisenhower.apply(this, arguments); }
  function calcValueEffort() { return S.calcValueEffort.apply(this, arguments); }
  function calcWSJF() { return S.calcWSJF.apply(this, arguments); }
  function daysUntilDue() { return S.daysUntilDue.apply(this, arguments); }
  function escapeHtml() { return S.escapeHtml.apply(this, arguments); }
  function formatBaseline() { return S.formatBaseline.apply(this, arguments); }
  function formatEisenhower() { return S.formatEisenhower.apply(this, arguments); }
  function formatValueEffort() { return S.formatValueEffort.apply(this, arguments); }
  function formatWSJF() { return S.formatWSJF.apply(this, arguments); }
  function isDueVagueMode() { return S.isDueVagueMode.apply(this, arguments); }
  function levelIconSvg() { return S.levelIconSvg.apply(this, arguments); }
  function overrideBaseline() { return S.overrideBaseline.apply(this, arguments); }
  function overrideEisenhower() { return S.overrideEisenhower.apply(this, arguments); }
  function overrideValueEffort() { return S.overrideValueEffort.apply(this, arguments); }
  function overrideWSJF() { return S.overrideWSJF.apply(this, arguments); }
  function priorityStylesForScore() { return S.priorityStylesForScore.apply(this, arguments); }
  function resolveDueVagueToDate() { return S.resolveDueVagueToDate.apply(this, arguments); }

  function paintTierDescription(el, display) {
    if (!display) {
      el.textContent = '';
      el.hidden = true;
      return;
    }
    var title = tierDescriptionTitle(display);
    var body = tierDescriptionBody(display);
    if (!title && !body) {
      el.textContent = '';
      el.hidden = true;
      return;
    }
    var html = '';
    if (title) {
      html += '<span class="heat-tier-desc-subtitle">' + escapeHtml(title) + '</span>';
    }
    if (body) {
      html += '<span class="heat-tier-desc-body">' + escapeHtml(body) + '</span>';
    }
    el.innerHTML = html;
    el.hidden = false;
    el.style.removeProperty('color');
  }

  function flashHeatTextEnter(el) {
    if (!el) return;
    el.classList.remove('heat-text-enter');
    // Force restart of the enter animation when tier copy swaps.
    void el.offsetWidth;
    el.classList.add('heat-text-enter');
  }

  function captureHeatLayoutRects(nodes) {
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || el.hidden) {
        out.push(null);
        continue;
      }
      out.push(el.getBoundingClientRect());
    }
    return out;
  }

  function playHeatLayoutFlip(nodes, firstRects) {
    if (!firstRects) return;
    if (typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    var lastRects = captureHeatLayoutRects(nodes);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var first = firstRects[i];
      var last = lastRects[i];
      if (!el || !first || !last) continue;
      var dx = first.left - last.left;
      var dy = first.top - last.top;
      var sw = last.width > 0.5 ? first.width / last.width : 1;
      var sh = last.height > 0.5 ? first.height / last.height : 1;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sw - 1) < 0.02 && Math.abs(sh - 1) < 0.02) {
        continue;
      }
      // Avoid extreme scale noise while still easing row/stack and head size shifts.
      sw = Math.max(0.85, Math.min(1.18, sw));
      sh = Math.max(0.85, Math.min(1.18, sh));
      el.classList.add('heat-flip-active');
      el.style.transition = 'none';
      el.style.transformOrigin = 'left top';
      el.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px) scale(' +
        sw.toFixed(4) + ',' + sh.toFixed(4) + ')';
      (function (node) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            node.style.transition = '';
            node.style.transform = '';
            var clearFlip = function () {
              node.classList.remove('heat-flip-active');
              node.removeEventListener('transitionend', clearFlip);
            };
            node.addEventListener('transitionend', clearFlip);
            setTimeout(clearFlip, 280);
          });
        });
      })(el);
    }
  }

  var FORMULA_OPTIONS = [
    {
      key: 'baseline',
      label: 'Score composite',
      description: 'Impact et facilit\u00e9, plus pression d\'\u00e9ch\u00e9ance et empressement, en un score 0\u201310.'
    },
    {
      key: 'eisenhower',
      label: 'Matrice Eisenhower',
      description: 'Pression (empressement / \u00e9ch\u00e9ance) \u00d7 importance — quatre quadrants.'
    }
  ];

  var EISENHOWER_QUADRANTS = (function () {
    var defs = [
      {
        id: 'do',
        label: 'Faire',
        description: 'Urgent et important. \u00c0 traiter en priorit\u00e9 absolue, sans report.',
        score: 9.0,
        urgent: true,
        important: true,
        preset: { urgency: 3, impact: 7.5 }
      },
      {
        id: 'schedule',
        label: 'Planifier',
        description: 'Important mais pas urgent. \u00c0 caler dans le backlog avec une date ou un cr\u00e9neau d\u00e9di\u00e9.',
        score: 6.5,
        urgent: false,
        important: true,
        preset: { urgency: 1, impact: 7.5 }
      },
      {
        id: 'delegate',
        label: 'D\u00e9l\u00e9guer',
        description: 'Urgent mais peu important. \u00c0 confier ou traiter au minimum viable.',
        score: 4.0,
        urgent: true,
        important: false,
        preset: { urgency: 3, impact: 2.5 }
      },
      {
        id: 'delete',
        label: '\u00c9liminer',
        description: 'Ni urgent ni important. Candidat \u00e0 \u00e9carter, repousser sans limite ou supprimer.',
        score: 1.5,
        urgent: false,
        important: false,
        preset: { urgency: 1, impact: 2.5 }
      }
    ];
    return defs.map(function (def) {
      var styles = priorityStylesForScore(def.score);
      return {
        id: def.id,
        label: def.label,
        description: def.description,
        score: def.score,
        urgent: def.urgent,
        important: def.important,
        preset: def.preset,
        fill: styles.fill,
        text: styles.text,
        seg: styles.seg
      };
    });
  })();

  var FORMULAS = {
    baseline: {
      calc: calcBaseline,
      format: formatBaseline,
      override: overrideBaseline
    },
    eisenhower: {
      calc: calcEisenhower,
      format: formatEisenhower,
      override: overrideEisenhower
    },
    wsjf: {
      calc: calcWSJF,
      format: formatWSJF,
      override: overrideWSJF
    },
    valueEffort: {
      calc: calcValueEffort,
      format: formatValueEffort,
      override: overrideValueEffort
    }
  };

  // ── 5. Math helpers & tier styling ──────────────────────────────────────

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function snappedLevel(value, min, max) {
    return clamp(Math.round(value), min, max);
  }

  function tierFor(p) {
    for (var k = 0; k < S.TIERS.length; k++) {
      if (p >= S.TIERS[k].min) return S.TIERS[k];
    }
    return S.TIERS[S.TIERS.length - 1];
  }

  // Per-tier surface mix (% of tier color into neutral base).
  var TIER_SURFACE_MIX = {
    0: { bg: 42, border: 50, panel: 44 }, // Critique — deepest blue
    1: { bg: 40, border: 48, panel: 40 }, // Urgente
    2: { bg: 34, border: 44, panel: 28 }, // Prioritaire
    3: { bg: 28, border: 38, panel: 22 }, // Importante
    4: { bg: 22, border: 32, panel: 18 }, // Flexible
    5: { bg: 14, border: 26, panel: 14 }, // Secondaire
    6: { bg: 6, border: 20, panel: 8 },   // Optionnelle — lightest blue
    inutile: { bg: 8, border: 22, panel: 82 }, // Inutile — muted gray matching badge
    blocked: { bg: 44, border: 52, panel: 46 } // Bloqué — deep crimson wash
  };

  /* Dark: no card/panel wash — Trello flat charcoal (status color stays on badges/segs). */
  var TIER_SURFACE_MIX_DARK = {
    0: { bg: 0, border: 0, panel: 0 },
    1: { bg: 0, border: 0, panel: 0 },
    2: { bg: 0, border: 0, panel: 0 },
    3: { bg: 0, border: 0, panel: 0 },
    4: { bg: 0, border: 0, panel: 0 },
    5: { bg: 0, border: 0, panel: 0 },
    6: { bg: 0, border: 0, panel: 0 },
    inutile: { bg: 0, border: 0, panel: 0 },
    blocked: { bg: 0, border: 0, panel: 0 }
  };

  function surfaceMixFor(tier) {
    tier = tier || {};
    var mixKey = tier.blocked ? 'blocked' : (tier.inutile ? 'inutile' : tier.i);
    var table = isDarkTheme() ? TIER_SURFACE_MIX_DARK : TIER_SURFACE_MIX;
    return table[mixKey] || table[TIER_I_MAX];
  }

  function clearCardTierTint(cardEl) {
    if (!cardEl) return;
    cardEl.style.removeProperty('--card-tier-tint');
    cardEl.style.removeProperty('--card-tier-border');
    cardEl.style.removeProperty('--card-tier-tint-mix');
    cardEl.style.removeProperty('--card-tier-border-mix');
    cardEl.style.removeProperty('--card-panel-tint-mix');
    var panel = cardEl.querySelector('.heat-panel');
    if (panel) {
      panel.style.removeProperty('--card-tier-tint');
      panel.style.removeProperty('--card-panel-tint-mix');
    }
  }

  function applyCardTierTint(cardEl, tier) {
    tier = tier || {};
    var visuals = tierVisuals(tier);
    var mix = surfaceMixFor(tier);
    cardEl.style.setProperty('--card-tier-tint', visuals.tint);
    cardEl.style.setProperty('--card-tier-border', visuals.seg);
    cardEl.style.setProperty('--card-tier-tint-mix', mix.bg + '%');
    cardEl.style.setProperty('--card-tier-border-mix', mix.border + '%');
    cardEl.style.setProperty('--card-panel-tint-mix', mix.panel + '%');
    cardEl.dataset.tier = tier.label || '';

    var panel = cardEl.querySelector('.heat-panel');
    if (panel) {
      panel.style.setProperty('--card-tier-tint', visuals.tint);
      panel.style.setProperty('--card-panel-tint-mix', mix.panel + '%');
    }
  }

  function clearSectionGlow(el) {
    if (!el) return;
    el.classList.remove('has-section-glow');
    el.style.removeProperty('--section-glow');
  }

  /** Top radial glow that softens into the section's normal background. */
  function applySectionGlow(el, color) {
    if (!el) return;
    if (!color) {
      clearSectionGlow(el);
      return;
    }
    el.style.setProperty('--section-glow', color);
    el.classList.add('has-section-glow');
  }

  function clearPrioritySectionTint(fieldEl) {
    clearSectionGlow(fieldEl);
  }

  /** Soft shell tint for the Priorité section — same palette as the heat badge. */
  function applyPrioritySectionTint(fieldEl, display, enabled) {
    if (!fieldEl) return;
    if (!enabled) {
      clearPrioritySectionTint(fieldEl);
      return;
    }
    var d = display || {};
    // Keep blocked crimson on Statut only — Priorité follows score/tier colors.
    var visualSource = d.inutile
      ? { inutile: true, label: INUTILE_LABEL }
      : { i: d.tierI, label: d.label };
    var v = tierVisuals(visualSource);
    applySectionGlow(fieldEl, v.seg || v.fill);
  }

  function labelEntry(key, value) {
    var entry = LABELS[key];
    if (!entry) return { short: String(value), detail: '', icon: '' };
    var idx = key === 'ease' ? value : value;
    return {
      icon: entry.icon ? (entry.icon[idx] || '') : '',
      short: entry.short[idx] || String(value),
      detail: entry.detail[idx] || ''
    };
  }

  function wordFor(key, value) {
    var e = labelEntry(key, value);
    return e.short || String(value);
  }

  function wordHtmlFor(key, value) {
    var e = labelEntry(key, value);
    if (!e.short) return escapeHtml(String(value));
    var icon = levelIconSvg(e.icon);
    if (!icon) return escapeHtml(e.short);
    return icon + '<span class="level-label">' + escapeHtml(e.short) + '</span>';
  }

  function affirmationFor(key, value) {
    var entry = LABELS[key];
    if (!entry || !entry.affirmations) return '';
    return entry.affirmations[value] || '';
  }

  function affirmationDisplayText(key, value) {
    var affirmText = affirmationFor(key, value);
    if (affirmText) return affirmText;
    var entry = labelEntry(key, value);
    if (entry.detail) return entry.detail;
    return entry.short || '';
  }

  // ── 6. Scoring formulas ─────────────────────────────────────────────────

  function mergePressure(T, B) {
    return clamp(WT * T + WB * B, 0, PRESSURE_MAX);
  }

  var URGENCY_PRESSURE_PRESETS = URGENCY_TO_TB.map(function (tb) {
    return mergePressure(tb.T, tb.B);
  });

  function urgencyLevelToPressure(level) {
    var u = clamp(level, 0, 4);
    var lo = Math.floor(u);
    var hi = Math.min(lo + 1, 4);
    var t = u - lo;
    return lerp(URGENCY_PRESSURE_PRESETS[lo], URGENCY_PRESSURE_PRESETS[hi], t);
  }

  function pressureToUrgencyLevel(pressure) {
    var best = 0;
    var bestDiff = Infinity;
    for (var u = 0; u <= 4; u++) {
      var diff = Math.abs(urgencyLevelToPressure(u) - pressure);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = u;
      }
    }
    return best;
  }

  function impactTerm(I, F) {
    return WI * (I / AXIS_SCORE_MAX) * 4 * (F / AXIS_SCORE_MAX) * 5 / 5;
  }

  function curveImpact(I) {
    return Math.pow(I / AXIS_SCORE_MAX, IMPACT_EXP) * 4;
  }

  function dampenCurve(U, I) {
    var ui = (U / 4) * (I / AXIS_SCORE_MAX);
    return Math.pow(ui, DAMPEN_POWER) * DAMPEN_MAX;
  }

  function effectiveEaseF(U, I, F) {
    if (U >= 3 && I >= 7.5) return Math.max(F, EASE_FLOOR * 2);
    return F;
  }

  function urgencyBoostRamp(U) {
    if (U <= URGENCY_BOOST_MIN_U - 1) return 0;
    if (U >= URGENCY_BOOST_MIN_U) return 1;
    var t = U - (URGENCY_BOOST_MIN_U - 1);
    return t * t * (3 - 2 * t);
  }

  function urgencyBoost(U, I, dampen) {
    var ramp = urgencyBoostRamp(U);
    if (ramp <= 0) return 0;
    var impactFactor = Math.max(0, 1 - I / AXIS_SCORE_MAX);
    if (impactFactor <= 0) return 0;
    return URGENCY_BOOST_MAX * Math.pow(U / 4, 2) * (1 - dampen) * impactFactor * ramp;
  }

  // ── New composite score (Impact + Facilité + datePull + empressePull) ──

  function empressementOptionById(id) {
    for (var i = 0; i < EMPRESSEMENT_OPTIONS.length; i++) {
      if (EMPRESSEMENT_OPTIONS[i].id === id) return EMPRESSEMENT_OPTIONS[i];
    }
    return EMPRESSEMENT_OPTIONS[0];
  }

  function empressementOptionByIndex(index) {
    var idx = clamp(Math.round(Number(index) || 0), 0, EMPRESSEMENT_UI_MAX);
    for (var i = 0; i < EMPRESSEMENT_OPTIONS.length; i++) {
      if (EMPRESSEMENT_OPTIONS[i].index === idx) return EMPRESSEMENT_OPTIONS[i];
    }
    return EMPRESSEMENT_OPTIONS[0];
  }

  function normalizeEmpressementId(raw) {
    if (typeof raw === 'number' && isFinite(raw)) {
      return empressementOptionByIndex(raw).id;
    }
    if (typeof raw === 'string' && raw.trim()) {
      var found = empressementOptionById(raw.trim());
      if (found) return found.id;
    }
    return EMPRESSEMENT_DEFAULT_ID;
  }

  function empressementIndex(inputs) {
    if (!inputs) return 0;
    if (inputs.empressement != null) {
      if (typeof inputs.empressement === 'number') {
        return clamp(Math.round(inputs.empressement), 0, EMPRESSEMENT_UI_MAX);
      }
      return empressementOptionById(normalizeEmpressementId(inputs.empressement)).index;
    }
    return 0;
  }

  function impactFactorDefById(id) {
    for (var i = 0; i < IMPACT_FACTOR_DEFS.length; i++) {
      if (IMPACT_FACTOR_DEFS[i].id === id) return IMPACT_FACTOR_DEFS[i];
    }
    return null;
  }

  function easeCostDefById(id) {
    for (var i = 0; i < EASE_COST_DEFS.length; i++) {
      if (EASE_COST_DEFS[i].id === id) return EASE_COST_DEFS[i];
    }
    return null;
  }

  function namedStepEase(steps, stepId) {
    if (!Array.isArray(steps) || !steps.length) return AXIS_SCORE_MAX / 2;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].id === stepId) return steps[i].ease;
    }
    return steps[0].ease;
  }

  /**
   * Weighted average of checked Impact sub-factors (intensities 1–10),
   * with synergy multiplier 1 + 0.12*(n-1), capped at 10.
   */
  function computeImpactFromFactors(factors) {
    if (!factors || typeof factors !== 'object') return null;
    var sumW = 0;
    var sum = 0;
    var checkedCount = 0;
    for (var i = 0; i < IMPACT_FACTOR_DEFS.length; i++) {
      var def = IMPACT_FACTOR_DEFS[i];
      var entry = factors[def.id];
      if (!entry || !entry.checked) continue;
      var intensity = clamp(Number(entry.intensity) || 5, 1, 10);
      sumW += def.weight;
      sum += intensity * def.weight;
      checkedCount += 1;
    }
    if (checkedCount === 0 || sumW <= 0) return null;
    var avg = sum / sumW;
    var synergy = 1 + IMPACT_SYNERGY_PER_EXTRA * (checkedCount - 1);
    return clamp(avg * synergy, 0, AXIS_SCORE_MAX);
  }

  /**
   * Facilité from cost checkboxes. Each cost lowers ease.
   * Named scales contribute their ease value; intensity costs map 1–10 → ease 10–0.
   * Average of checked cost ease contributions; null if none checked.
   */
  function computeEaseFromCosts(costs) {
    if (!costs || typeof costs !== 'object') return null;
    var sum = 0;
    var checkedCount = 0;
    for (var i = 0; i < EASE_COST_DEFS.length; i++) {
      var def = EASE_COST_DEFS[i];
      var entry = costs[def.id];
      if (!entry || !entry.checked) continue;
      var easeContrib;
      if (def.kind === 'named') {
        easeContrib = namedStepEase(def.steps, entry.stepId || def.defaultStepId);
      } else {
        var intensity = clamp(Number(entry.intensity) || def.defaultIntensity || 5, 1, 10);
        easeContrib = AXIS_SCORE_MAX - intensity;
      }
      sum += easeContrib;
      checkedCount += 1;
    }
    if (checkedCount === 0) return null;
    return clamp(sum / checkedCount, 0, AXIS_SCORE_MAX);
  }

  function effectiveImpact(inputs) {
    var fromFactors = computeImpactFromFactors(inputs && inputs.impactFactors);
    if (fromFactors != null) return fromFactors;
    var I = inputs && inputs.impact != null ? Number(inputs.impact) : 5;
    return clamp(isFinite(I) ? I : 5, 0, AXIS_SCORE_MAX);
  }

  function effectiveEase(inputs) {
    var fromCosts = computeEaseFromCosts(inputs && inputs.easeCosts);
    if (fromCosts != null) return fromCosts;
    var F = inputs && inputs.ease != null ? Number(inputs.ease) : 5;
    return clamp(isFinite(F) ? F : 5, 0, AXIS_SCORE_MAX);
  }

  function easeForScore(easeValue) {
    var F = clamp(easeValue, 0, AXIS_SCORE_MAX);
    return EASE_QUICK_WINS ? F : AXIS_SCORE_MAX - F;
  }

  function cardHasDueDate(inputs) {
    if (!inputs) return false;
    if (inputs.dueEnabled === false) return false;
    if (inputs.dueLimitState === DUE_LIMIT_STATE_NONE) return false;
    if (inputs.dueDate) return true;
    if (inputs.dueVague) return true;
    return false;
  }

  function computeDatePull(inputs, now) {
    if (!cardHasDueDate(inputs)) return 0;
    var iso = inputs.dueDate;
    if (!iso && inputs.dueVague && typeof resolveDueVagueToDate === 'function') {
      iso = resolveDueVagueToDate(inputs.dueVague);
    }
    if (!iso) return 0;
    var days = daysUntilDue(iso, now);
    if (!isFinite(days)) return 0;
    var proximity = days < 0 ? 1 : Math.exp(-days / DATE_PROXIMITY_TAU_DAYS);
    var dateGain =
      inputs.dateFixe === true && !isDueVagueMode(inputs)
        ? DATE_GAIN_FIXED
        : DATE_GAIN_MOVABLE;
    return proximity * dateGain;
  }

  function computeEmpressePull(inputs) {
    return (empressementIndex(inputs) / EMPRESSEMENT_UI_MAX) * EMPRESSEMENT_PULL_MAX;
  }

  function computeBaseScore(impact, ease) {
    return effectiveImpact({ impact: impact }) * BASE_IMPACT_WEIGHT +
      easeForScore(effectiveEase({ ease: ease })) * BASE_EASE_WEIGHT;
  }

  /**
   * Derive a legacy 0–4 urgency for matrix / Eisenhower / calc-graph compat.
   * Not a user input — pressure from Empressement + deadline pull.
   */
  function deriveLegacyUrgency(inputs, now) {
    var emp = empressementIndex(inputs);
    var datePull = computeDatePull(inputs, now);
    var pressure01 = clamp(emp / EMPRESSEMENT_UI_MAX * 0.55 + datePull / DATE_GAIN_FIXED * 0.45, 0, 1);
    return clamp(pressure01 * AXIS_UI_MAX, 0, AXIS_UI_MAX);
  }

  /**
   * Map old Urgence (any 0–4 or 0–10 scale) onto a 0–10 scale for migration.
   */
  function legacyUrgencyTo10(rawUrgency) {
    var u = Number(rawUrgency);
    if (!isFinite(u)) return 0;
    if (u <= 4) return clamp(u * 2.5, 0, 10);
    return clamp(u, 0, 10);
  }

  /** Part B table: compress downward; never auto-assign Au plus vite. */
  function empressementIdFromLegacyUrgency10(u10) {
    if (u10 <= 3) return 'aucun';
    if (u10 <= 6) return 'bientot';
    if (u10 <= 8) return 'assez-vite';
    return 'vite';
  }

  /**
   * One-shot migration of old Urgence → Empressement (+ review flag).
   * Mutates/returns a shallow patch; does not copy Urgence into Empressement verbatim.
   */
  function migrateLegacyUrgency(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.legacyUrgency != null || raw.urgencyMigrated === true) {
      return null; // already migrated
    }
    if (raw.urgency == null && raw.empressement != null) return null;
    if (raw.urgency == null) return null;
    var u10 = legacyUrgencyTo10(raw.urgency);
    var patch = {
      legacyUrgency: Number(raw.urgency),
      urgencyMigrated: true
    };
    if (URGENCY_MIGRATION_MODE === 'part_a_only') {
      patch.empressement = EMPRESSEMENT_DEFAULT_ID;
      patch.urgencyReviewNeeded = true;
    } else {
      patch.empressement = empressementIdFromLegacyUrgency10(u10);
      if (u10 >= URGENCY_REVIEW_THRESHOLD_10) {
        patch.urgencyReviewNeeded = true;
      }
    }
    return patch;
  }

  /**
   * Scale legacy Impact 0–4 / Ease 1–5 into 0–10 when axes look pre-adaptation.
   */
  function migrateLegacyAxisScales(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.axesScaledTo10 === true) return null;
    var impact = Number(raw.impact);
    var ease = Number(raw.ease);
    if (!isFinite(impact) || !isFinite(ease)) return null;
    // Heuristic: old ease was 1–5 (never 0); old impact max 4.
    var looksLegacy =
      (ease >= 1 && ease <= 5 && impact >= 0 && impact <= 4 &&
        (raw.empressement == null || raw.urgency != null)) ||
      raw.urgency != null;
    if (!looksLegacy && impact <= 4 && ease <= 5 && ease >= 1 && raw.axesScaledTo10 == null) {
      // Soft: if both within old ranges and no new fields, scale once.
      if (raw.impactFactors || raw.easeCosts || raw.dateFixe != null) return null;
      looksLegacy = true;
    }
    if (!looksLegacy) return null;
    return {
      impact: clamp(impact * 2.5, 0, AXIS_SCORE_MAX),
      ease: clamp(((ease - 1) / 4) * AXIS_SCORE_MAX, 0, AXIS_SCORE_MAX),
      axesScaledTo10: true
    };
  }

  // New baseline:
  //   base          = Impact*0.6 + Facilité*0.4   (each 0–10; Facilité direction via EASE_QUICK_WINS)
  //   datePull      = proximity * dateGain         (0 if no date; dateGain 1.2 or 3.5)
  //   proximity     = days<0 ? 1 : exp(-days/5)
  //   empressePull  = empressementIndex/4 * 3.0
  //   score         = clamp(base + datePull + empressePull, 0, 10)
  function calcBaselineTermsFromInputs(inputs, now) {
    var I = effectiveImpact(inputs);
    var Fraw = effectiveEase(inputs);
    var F = easeForScore(Fraw);
    var base = I * BASE_IMPACT_WEIGHT + F * BASE_EASE_WEIGHT;
    var datePull = computeDatePull(inputs, now);
    var empressePull = computeEmpressePull(inputs);
    var score = clamp(base + datePull + empressePull, 0, SCORE_MAX);
    var U = deriveLegacyUrgency(inputs, now);
    return {
      base: base,
      impactShare: I * BASE_IMPACT_WEIGHT,
      easeTerm: F * BASE_EASE_WEIGHT,
      datePull: datePull,
      empressePull: empressePull,
      score: score,
      U: U,
      I: I,
      F: Fraw,
      Fscore: F,
      E: empressementIndex(inputs),
      dateFixe: !!(inputs && inputs.dateFixe) && !isDueVagueMode(inputs),
      hasDate: cardHasDueDate(inputs)
    };
  }

  /** Legacy signature kept for heat graph / tests that pass U,I,F only. */
  function calcBaselineTermsRaw(U, I, F) {
    var inputs = {
      urgency: U,
      impact: I != null ? I : 5,
      ease: F != null ? F : 5,
      empressement: 0
    };
    // If I/F look like old 0–4 / 1–5, treat as already on new scale when >4 or ease can be 0.
    var terms = calcBaselineTermsFromInputs(inputs);
    return {
      pressure: urgencyLevelToPressure(U),
      impactCore: terms.impactShare,
      urgencyShare: 0,
      impactShare: terms.impactShare,
      easeTerm: terms.easeTerm,
      urgencyBoost: 0,
      dampen: 0,
      effectiveF: terms.F,
      easeBoost: 1,
      easeWeight: BASE_EASE_WEIGHT,
      easeMul: 1,
      hardFactor: 1,
      rawScore: terms.score,
      datePull: terms.datePull,
      empressePull: terms.empressePull,
      base: terms.base,
      U: U,
      I: terms.I,
      F: terms.F
    };
  }

  var BASELINE_RAW_MAX = 10;
  var BASELINE_SCORE_SCALE = 1;

  function scaleBaselineTerms(terms) {
    return Object.assign({}, terms, {
      score: clamp(terms.rawScore != null ? terms.rawScore : terms.score, 0, 10)
    });
  }

  function calcBaselineTerms(U, I, F) {
    return scaleBaselineTerms(calcBaselineTermsRaw(U, I, F));
  }

  function jobSize(F) {
    // Facilité 0–10 → job size 1..6 for WSJF compat
    var f = clamp(F, 0, AXIS_SCORE_MAX);
    return Math.max(6 - f / 2, 1);
  }

  function readInputs(inputs) {
    var terms = calcBaselineTermsFromInputs(inputs || {});
    var U = terms.U;
    var I = terms.I;
    var F = terms.F;
    var pressure = urgencyLevelToPressure(U);
    var imp = impactTerm(I, F);
    var importance = 0.5 + I / AXIS_SCORE_MAX;
    var urgencyNorm = pressure / PRESSURE_MAX;
    var js = jobSize(F);
    return {
      U: U,
      I: I,
      F: F,
      E: terms.E,
      pressure: pressure,
      imp: imp,
      importance: importance,
      urgencyNorm: urgencyNorm,
      jobSize: js,
      base: terms.base,
      datePull: terms.datePull,
      empressePull: terms.empressePull
    };
  }

  function calcBaseline(inputs) {
    var t = calcBaselineTermsFromInputs(inputs || {});
    return {
      score: t.score,
      pressure: urgencyLevelToPressure(t.U),
      impactCore: t.impactShare,
      easeTerm: t.easeTerm,
      dampen: 0,
      effectiveF: t.F,
      terms: {
        base: t.base,
        impactShare: t.impactShare,
        easeTerm: t.easeTerm,
        datePull: t.datePull,
        empressePull: t.empressePull,
        U: t.U,
        I: t.I,
        F: t.F,
        E: t.E,
        dateFixe: t.dateFixe,
        hasDate: t.hasDate
      },
      tier: tierFor(t.score)
    };
  }

  function isEisenhowerUrgent(U) {
    return U >= EISENHOWER_URGENCY_THRESHOLD;
  }

  function isEisenhowerImportant(I) {
    return I >= EISENHOWER_IMPACT_THRESHOLD;
  }

  // exports
  S.BASELINE_RAW_MAX = BASELINE_RAW_MAX;
  S.BASELINE_SCORE_SCALE = BASELINE_SCORE_SCALE;
  S.EISENHOWER_QUADRANTS = EISENHOWER_QUADRANTS;
  S.FORMULAS = FORMULAS;
  S.FORMULA_OPTIONS = FORMULA_OPTIONS;
  S.TIER_SURFACE_MIX = TIER_SURFACE_MIX;
  S.TIER_SURFACE_MIX_DARK = TIER_SURFACE_MIX_DARK;
  S.URGENCY_PRESSURE_PRESETS = URGENCY_PRESSURE_PRESETS;
  S.affirmationDisplayText = affirmationDisplayText;
  S.affirmationFor = affirmationFor;
  S.applyCardTierTint = applyCardTierTint;
  S.applyPrioritySectionTint = applyPrioritySectionTint;
  S.applySectionGlow = applySectionGlow;
  S.calcBaseline = calcBaseline;
  S.calcBaselineTerms = calcBaselineTerms;
  S.calcBaselineTermsFromInputs = calcBaselineTermsFromInputs;
  S.calcBaselineTermsRaw = calcBaselineTermsRaw;
  S.captureHeatLayoutRects = captureHeatLayoutRects;
  S.cardHasDueDate = cardHasDueDate;
  S.clamp = clamp;
  S.clearCardTierTint = clearCardTierTint;
  S.clearPrioritySectionTint = clearPrioritySectionTint;
  S.clearSectionGlow = clearSectionGlow;
  S.computeBaseScore = computeBaseScore;
  S.computeDatePull = computeDatePull;
  S.computeEaseFromCosts = computeEaseFromCosts;
  S.computeEmpressePull = computeEmpressePull;
  S.computeImpactFromFactors = computeImpactFromFactors;
  S.curveImpact = curveImpact;
  S.dampenCurve = dampenCurve;
  S.deriveLegacyUrgency = deriveLegacyUrgency;
  S.easeCostDefById = easeCostDefById;
  S.easeForScore = easeForScore;
  S.easeOutCubic = easeOutCubic;
  S.effectiveEase = effectiveEase;
  S.effectiveEaseF = effectiveEaseF;
  S.effectiveImpact = effectiveImpact;
  S.empressementIdFromLegacyUrgency10 = empressementIdFromLegacyUrgency10;
  S.empressementIndex = empressementIndex;
  S.empressementOptionById = empressementOptionById;
  S.empressementOptionByIndex = empressementOptionByIndex;
  S.flashHeatTextEnter = flashHeatTextEnter;
  S.impactFactorDefById = impactFactorDefById;
  S.impactTerm = impactTerm;
  S.isEisenhowerImportant = isEisenhowerImportant;
  S.isEisenhowerUrgent = isEisenhowerUrgent;
  S.jobSize = jobSize;
  S.labelEntry = labelEntry;
  S.legacyUrgencyTo10 = legacyUrgencyTo10;
  S.lerp = lerp;
  S.mergePressure = mergePressure;
  S.migrateLegacyAxisScales = migrateLegacyAxisScales;
  S.migrateLegacyUrgency = migrateLegacyUrgency;
  S.namedStepEase = namedStepEase;
  S.normalizeEmpressementId = normalizeEmpressementId;
  S.paintTierDescription = paintTierDescription;
  S.playHeatLayoutFlip = playHeatLayoutFlip;
  S.pressureToUrgencyLevel = pressureToUrgencyLevel;
  S.readInputs = readInputs;
  S.scaleBaselineTerms = scaleBaselineTerms;
  S.snappedLevel = snappedLevel;
  S.surfaceMixFor = surfaceMixFor;
  S.tierFor = tierFor;
  S.urgencyBoost = urgencyBoost;
  S.urgencyBoostRamp = urgencyBoostRamp;
  S.urgencyLevelToPressure = urgencyLevelToPressure;
  S.wordFor = wordFor;
  S.wordHtmlFor = wordHtmlFor;
})(typeof window !== 'undefined' ? window : this);
