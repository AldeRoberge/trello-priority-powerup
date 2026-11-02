/**
 * priority-ui: part 5 of 12 (eisenhowerQuadrantFor).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var AXIS_SCORE_MAX = S.AXIS_SCORE_MAX;
  var EISENHOWER_IMPACT_THRESHOLD = S.EISENHOWER_IMPACT_THRESHOLD;
  var EISENHOWER_QUADRANTS = S.EISENHOWER_QUADRANTS;
  var EISENHOWER_URGENCY_THRESHOLD = S.EISENHOWER_URGENCY_THRESHOLD;
  var EMPRESSEMENT_UI_MAX = S.EMPRESSEMENT_UI_MAX;
  var HEAT_SEGMENTS = S.HEAT_SEGMENTS;
  var LABELS = S.LABELS;
  var PRESSURE_MAX = S.PRESSURE_MAX;
  var PROPERTY_ICONS = S.PROPERTY_ICONS;
  var QUESTIONS = S.QUESTIONS;
  var SLIDER_STEP = S.SLIDER_STEP;
  var VALUE_EFFORT_SCALE = S.VALUE_EFFORT_SCALE;
  var WSJF_SCALE = S.WSJF_SCALE;

  // from other parts (functions, resolved at call time)
  function affirmationDisplayText() { return S.affirmationDisplayText.apply(this, arguments); }
  function calcBaselineTermsFromInputs() { return S.calcBaselineTermsFromInputs.apply(this, arguments); }
  function clamp() { return S.clamp.apply(this, arguments); }
  function createHelpLevelDot() { return S.createHelpLevelDot.apply(this, arguments); }
  function dimensionQuestion() { return S.dimensionQuestion.apply(this, arguments); }
  function effectiveImpact() { return S.effectiveImpact.apply(this, arguments); }
  function empressementIndex() { return S.empressementIndex.apply(this, arguments); }
  function escapeHtml() { return S.escapeHtml.apply(this, arguments); }
  function isEisenhowerImportant() { return S.isEisenhowerImportant.apply(this, arguments); }
  function isEisenhowerUrgent() { return S.isEisenhowerUrgent.apply(this, arguments); }
  function jobSize() { return S.jobSize.apply(this, arguments); }
  function pressureToUrgencyLevel() { return S.pressureToUrgencyLevel.apply(this, arguments); }
  function readInputs() { return S.readInputs.apply(this, arguments); }
  function snappedLevel() { return S.snappedLevel.apply(this, arguments); }
  function tierFor() { return S.tierFor.apply(this, arguments); }
  function wordFor() { return S.wordFor.apply(this, arguments); }

  function eisenhowerQuadrantFor(U, I) {
    var urgent = isEisenhowerUrgent(U);
    var important = isEisenhowerImportant(I);
    if (urgent && important) return EISENHOWER_QUADRANTS[0];
    if (!urgent && important) return EISENHOWER_QUADRANTS[1];
    if (urgent && !important) return EISENHOWER_QUADRANTS[2];
    return EISENHOWER_QUADRANTS[3];
  }

  function eisenhowerQuadrantById(id) {
    for (var i = 0; i < EISENHOWER_QUADRANTS.length; i++) {
      if (EISENHOWER_QUADRANTS[i].id === id) return EISENHOWER_QUADRANTS[i];
    }
    return null;
  }

  function calcEisenhower(inputs) {
    var d = readInputs(inputs);
    var quadrant = eisenhowerQuadrantFor(d.U, d.I);
    return {
      score: quadrant.score,
      terms: {
        pressure: d.pressure,
        importance: d.importance,
        urgencyNorm: d.urgencyNorm,
        urgent: isEisenhowerUrgent(d.U),
        important: isEisenhowerImportant(d.I),
        quadrantId: quadrant.id,
        U: d.U,
        I: d.I,
        F: d.F
      },
      eisenhower: quadrant,
      tier: tierFor(quadrant.score)
    };
  }

  function calcWSJF(inputs) {
    var d = readInputs(inputs);
    var p = clamp((d.pressure / d.jobSize) * WSJF_SCALE, 0, 10);
    return {
      score: p,
      terms: { pressure: d.pressure, jobSize: d.jobSize, U: d.U, I: d.I, F: d.F },
      tier: tierFor(p)
    };
  }

  function calcValueEffort(inputs) {
    var d = readInputs(inputs);
    var p = clamp((d.I * d.urgencyNorm / d.jobSize) * VALUE_EFFORT_SCALE, 0, 10);
    return {
      score: p,
      terms: { pressure: d.pressure, urgencyNorm: d.urgencyNorm, jobSize: d.jobSize, U: d.U, I: d.I, F: d.F },
      tier: tierFor(p)
    };
  }

  // ── 7. Formatters & heat-preset override solvers ────────────────────────

  function formatScore(score) {
    return Number(score).toFixed(1);
  }

  function formatBaseline(terms, score) {
    var parts = [
      'Impact ' + (terms.impactShare != null ? terms.impactShare : 0).toFixed(1),
      'Facilit\u00e9 ' + (terms.easeTerm != null ? terms.easeTerm : 0).toFixed(1)
    ];
    if (terms.datePull != null && terms.datePull > 0.05) {
      parts.push('\u00c9ch\u00e9ance ' + terms.datePull.toFixed(1));
    }
    if (terms.empressePull != null && terms.empressePull > 0.05) {
      parts.push('Empressement ' + terms.empressePull.toFixed(1));
    }
    return parts.join(' + ') + '   =   ' + formatScore(score);
  }

  function formatEisenhower(terms, score) {
    var quadrant = eisenhowerQuadrantById(terms.quadrantId);
    var label = quadrant ? quadrant.label : 'Quadrant';
    return (
      'Urgence ' + (terms.urgent ? 'oui' : 'non') +
      ' · Impact ' + (terms.important ? 'important' : 'secondaire') +
      ' → ' + label +
      '   =   ' + formatScore(score)
    );
  }

  function formatWSJF(terms, score) {
    return (
      'Pression ÷ taille → ' + terms.pressure.toFixed(1) + ' ÷ ' + terms.jobSize.toFixed(0) +
      ' × ' + WSJF_SCALE.toFixed(2) +
      '   =   ' + formatScore(score)
    );
  }

  function formatValueEffort(terms, score) {
    return (
      '(Impact × Urgence÷6) ÷ facilité → (' + terms.I + ' × ' + terms.urgencyNorm.toFixed(2) + ') ÷ ' + terms.jobSize.toFixed(0) +
      ' × ' + VALUE_EFFORT_SCALE +
      '   =   ' + formatScore(score)
    );
  }

  function formatSliderLevel(n) {
    return Math.abs(n - Math.round(n)) < 0.01 ? String(Math.round(n)) : n.toFixed(1);
  }

  function formatSignedPoints(value) {
    var n = Number(value);
    var abs = Math.abs(n).toFixed(1);
    if (n > 0.0005) return '+' + abs;
    if (n < -0.0005) return '\u2212' + abs;
    return '0.0';
  }

  function breakdownRowTitle(text) {
    return { kind: 'title', text: text };
  }

  function breakdownRowFormula(text) {
    return { kind: 'formula', text: text };
  }

  function breakdownRowTerm(label, level, value, detail, textValue) {
    return {
      kind: 'term',
      label: label,
      level: level,
      value: value,
      detail: detail || null,
      textValue: !!textValue
    };
  }

  function breakdownRowSub(text) {
    return { kind: 'sub', text: text };
  }

  function breakdownRowInfo(label, value) {
    return { kind: 'info', label: label, value: value };
  }

  function breakdownRowTotal(score) {
    return { kind: 'total', value: formatScore(score) };
  }

  function breakdownRowToLine(row) {
    if (row.kind === 'title') return row.text;
    if (row.kind === 'formula') return row.text;
    if (row.kind === 'term') {
      var line = row.label;
      if (row.level != null && row.level !== '') line += ' (niveau ' + row.level + ')';
      if (row.detail) line += ' \u2192 ' + row.detail + ' ' + row.value;
      else line += ' \u2192 ' + row.value;
      return line;
    }
    if (row.kind === 'sub') return row.text;
    if (row.kind === 'info') return row.label + ' : ' + row.value;
    if (row.kind === 'total') return 'Score = ' + row.value + ' / 10';
    return '';
  }

  function breakdownFromRows(rows, shortLabel) {
    var lines = rows.map(breakdownRowToLine).filter(Boolean);
    return {
      rows: rows,
      lines: lines,
      text: lines.join('\n'),
      short: shortLabel || 'D\u00e9tail du score'
    };
  }

  function renderScoreBreakdownTooltip(breakdown, container) {
    container.replaceChildren();
    var wrap = document.createElement('div');
    wrap.className = 'heat-score-tooltip-rows';

    breakdown.rows.forEach(function (row) {
      if (row.kind === 'title') {
        var title = document.createElement('div');
        title.className = 'heat-score-tooltip-title';
        title.textContent = row.text;
        wrap.appendChild(title);
        return;
      }

      if (row.kind === 'formula') {
        var formula = document.createElement('div');
        formula.className = 'heat-score-tooltip-formula';
        formula.textContent = row.text;
        wrap.appendChild(formula);
        return;
      }

      if (row.kind === 'term') {
        var term = document.createElement('div');
        term.className = 'heat-score-tooltip-term';

        var main = document.createElement('div');
        main.className = 'heat-score-tooltip-term-main';
        var label = document.createElement('span');
        label.className = 'heat-score-tooltip-label';
        label.textContent = row.label;
        main.appendChild(label);
        if (row.level != null && row.level !== '') {
          var level = document.createElement('span');
          level.className = 'heat-score-tooltip-level';
          level.textContent = row.level;
          main.appendChild(level);
        }

        var contrib = document.createElement('div');
        contrib.className = 'heat-score-tooltip-term-contrib';
        if (row.detail) {
          var detail = document.createElement('span');
          detail.className = 'heat-score-tooltip-detail';
          detail.textContent = row.detail;
          contrib.appendChild(detail);
        }
        var value = document.createElement('span');
        value.className = row.textValue
          ? 'heat-score-tooltip-status'
          : 'heat-score-tooltip-value';
        value.textContent = row.value;
        contrib.appendChild(value);

        term.appendChild(main);
        term.appendChild(contrib);
        wrap.appendChild(term);
        return;
      }

      if (row.kind === 'sub') {
        var sub = document.createElement('div');
        sub.className = 'heat-score-tooltip-sub';
        sub.textContent = row.text;
        wrap.appendChild(sub);
        return;
      }

      if (row.kind === 'info') {
        var info = document.createElement('div');
        info.className = 'heat-score-tooltip-info';
        var infoLabel = document.createElement('span');
        infoLabel.className = 'heat-score-tooltip-info-label';
        infoLabel.textContent = row.label;
        var infoValue = document.createElement('span');
        infoValue.className = 'heat-score-tooltip-info-value';
        infoValue.textContent = row.value;
        info.appendChild(infoLabel);
        info.appendChild(infoValue);
        wrap.appendChild(info);
        return;
      }

      if (row.kind === 'total') {
        var total = document.createElement('div');
        total.className = 'heat-score-tooltip-total';
        var totalLabel = document.createElement('span');
        totalLabel.className = 'heat-score-tooltip-total-label';
        totalLabel.textContent = 'Score';
        var totalValue = document.createElement('span');
        totalValue.className = 'heat-score-tooltip-total-value';
        totalValue.textContent = row.value;
        var totalMax = document.createElement('span');
        totalMax.className = 'heat-score-tooltip-total-max';
        totalMax.textContent = '/ 10';
        total.appendChild(totalLabel);
        total.appendChild(totalValue);
        total.appendChild(totalMax);
        wrap.appendChild(total);
      }
    });

    container.appendChild(wrap);
  }

  function formatBaselineBreakdown(result) {
    var t = result.terms;
    var impPts = t.impactShare != null ? t.impactShare : 0;
    var easePts = t.easeTerm != null ? t.easeTerm : 0;
    var datePts = t.datePull != null ? t.datePull : 0;
    var empPts = t.empressePull != null ? t.empressePull : 0;
    var hasDatePts = datePts > 0.05;
    var hasEmpPts = empPts > 0.05;

    var formulaParts = ['Impact + Facilit\u00e9'];
    if (hasDatePts) formulaParts.push('\u00c9ch\u00e9ance');
    if (hasEmpPts) formulaParts.push('Empressement');

    var rows = [
      breakdownRowTitle('Comment ce score est calcul\u00e9'),
      breakdownRowFormula(formulaParts.join(' + ')),
      breakdownRowTerm('Impact', formatSliderLevel(t.I), formatSignedPoints(impPts)),
      breakdownRowTerm('Facilit\u00e9', formatSliderLevel(t.F), formatSignedPoints(easePts))
    ];
    if (hasDatePts) {
      rows.push(
        breakdownRowTerm(
          '\u00c9ch\u00e9ance',
          null,
          formatSignedPoints(datePts),
          t.dateFixe ? 'date fixe' : null
        )
      );
    }
    if (hasEmpPts) {
      rows.push(
        breakdownRowTerm('Empressement', formatSliderLevel(t.E), formatSignedPoints(empPts))
      );
    }
    rows.push(breakdownRowTotal(result.score));
    return breakdownFromRows(rows, 'Comment ce score est calcul\u00e9');
  }

  function formatEisenhowerBreakdown(result) {
    var t = result.terms;
    var quadrant = result.eisenhower || eisenhowerQuadrantById(t.quadrantId);
    return breakdownFromRows([
      breakdownRowTitle('Comment ce score est calcul\u00e9'),
      breakdownRowFormula('Urgence \u00d7 Impact \u2192 un quadrant (score fixe)'),
      breakdownRowTerm(
        'Urgence',
        formatSliderLevel(t.U),
        t.urgent ? 'Urgent' : 'Pas urgent',
        null,
        true
      ),
      breakdownRowSub('Urgent si le niveau est \u2265 ' + EISENHOWER_URGENCY_THRESHOLD),
      breakdownRowTerm(
        'Impact',
        formatSliderLevel(t.I),
        t.important ? 'Important' : 'Peu important',
        null,
        true
      ),
      breakdownRowSub('Important si le niveau est \u2265 ' + EISENHOWER_IMPACT_THRESHOLD),
      breakdownRowInfo('Quadrant', quadrant ? quadrant.label : ''),
      breakdownRowTotal(result.score)
    ], 'Comment ce score est calcul\u00e9');
  }

  function formatWSJFBreakdown(result) {
    var t = result.terms;
    return breakdownFromRows([
      breakdownRowTitle('Comment ce score est calcul\u00e9'),
      breakdownRowFormula('Pression \u00f7 taille de la t\u00e2che'),
      breakdownRowTerm('Urgence', formatSliderLevel(t.U), t.pressure.toFixed(1), 'Pression'),
      breakdownRowTerm('Facilit\u00e9', formatSliderLevel(t.F), t.jobSize.toFixed(0), 'Taille'),
      breakdownRowInfo(
        'Calcul',
        t.pressure.toFixed(1) + ' \u00f7 ' + t.jobSize.toFixed(0) + ' \u00d7 ' + WSJF_SCALE.toFixed(2)
      ),
      breakdownRowTotal(result.score)
    ], 'Comment ce score est calcul\u00e9');
  }

  function formatValueEffortBreakdown(result) {
    var t = result.terms;
    return breakdownFromRows([
      breakdownRowTitle('Comment ce score est calcul\u00e9'),
      breakdownRowFormula('(Impact \u00d7 Urgence) \u00f7 taille'),
      breakdownRowInfo('Impact', formatSliderLevel(t.I)),
      breakdownRowInfo('Urgence', formatSliderLevel(t.U)),
      breakdownRowTerm('Facilit\u00e9', formatSliderLevel(t.F), t.jobSize.toFixed(0), 'Taille'),
      breakdownRowInfo(
        'Calcul',
        '(' + t.I + ' \u00d7 ' + t.urgencyNorm.toFixed(2) + ') \u00f7 ' + t.jobSize.toFixed(0) +
          ' \u00d7 ' + VALUE_EFFORT_SCALE
      ),
      breakdownRowTotal(result.score)
    ], 'Comment ce score est calcul\u00e9');
  }

  var SCORE_BREAKDOWNS = {
    baseline: formatBaselineBreakdown,
    eisenhower: formatEisenhowerBreakdown,
    wsjf: formatWSJFBreakdown,
    valueEffort: formatValueEffortBreakdown,
    threeD: formatBaselineBreakdown
  };

  function formatScoreBreakdown(formulaKey, result) {
    var fn = SCORE_BREAKDOWNS[formulaKey] || formatBaselineBreakdown;
    return fn(result);
  }

  /** New signature: impact/ease (0–10) + empressement (0–4). No urgency input. */
  function baselineScore(impact, ease, empressement, extra) {
    var inputs = Object.assign(
      { impact: impact, ease: ease, empressement: empressement },
      extra || {}
    );
    return calcBaselineTermsFromInputs(inputs).score;
  }

  function betterBaselineOverride(score, imp, eas, emp, best, targetP, curImpact, curEase, curEmp) {
    if (!best) return true;
    var dist = Math.abs(score - targetP);
    var bestDist = Math.abs(best.score - targetP);
    if (dist < bestDist - 1e-9) return true;
    if (dist > bestDist + 1e-9) return false;
    var candUnder = score < targetP - 1e-9;
    var bestUnder = best.score < targetP - 1e-9;
    if (candUnder !== bestUnder) return bestUnder;
    var move = Math.abs(imp - curImpact) + Math.abs(eas - curEase) + Math.abs(emp - curEmp);
    var bestMove =
      Math.abs(best.impact - curImpact) +
      Math.abs(best.ease - curEase) +
      Math.abs(best.empressement - curEmp);
    if (move !== bestMove) return move < bestMove;
    return score > best.score;
  }

  var HEAT_TARGET_EPS = 0.05;

  function heatSegmentForTarget(targetP) {
    for (var k = 0; k < HEAT_SEGMENTS.length; k++) {
      var seg = HEAT_SEGMENTS[k];
      if (Math.abs(seg.target - targetP) < HEAT_TARGET_EPS) return seg;
    }
    return null;
  }

  function heatPresetForTarget(targetP) {
    var seg = heatSegmentForTarget(targetP);
    return seg && seg.preset ? seg.preset : null;
  }

  function comparableAxis(key, value) {
    if (key === 'empressement') return empressementIndex({ empressement: value });
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function pickOverrideDelta(current, next) {
    var delta = {};
    ['impact', 'ease', 'empressement', 'urgency'].forEach(function (key) {
      var cur = comparableAxis(key, current[key] != null ? current[key] : 0);
      var nxt = next[key] != null ? comparableAxis(key, next[key]) : cur;
      if (Math.abs(cur - nxt) >= 1e-9) delta[key] = nxt;
    });
    return delta;
  }

  /** Slider targets for a clicked heat segment (Opt … Crit). Always the preset, even inside the same band. */
  function heatSegmentDelta(state, targetP, overrideFn) {
    var clickedSeg = heatSegmentForTarget(targetP);
    var next = clickedSeg && clickedSeg.preset
      ? Object.assign({}, state, clickedSeg.preset)
      : overrideFn(targetP, state);
    return pickOverrideDelta(state, next);
  }

  function sliderAxisValue(dim, raw) {
    var fallback = dim && dim.value != null ? dim.value : 0;
    var min = dim && dim.min != null ? dim.min : 0;
    var max = dim && dim.max != null ? dim.max : fallback;
    if (dim && dim.key === 'empressement') {
      if (raw == null || raw === '') return clamp(fallback, min, max);
      return clamp(empressementIndex({ empressement: raw }), min, max);
    }
    var n = typeof raw === 'number' ? raw : Number(raw);
    if (!isFinite(n)) return clamp(fallback, min, max);
    return clamp(n, min, max);
  }

  /** Searches Impact/Facilité/Empressement (échéance stays as-is) for a target score. */
  function overrideBaseline(targetP, inputs) {
    inputs = inputs || {};
    var curImpact = effectiveImpact(inputs);
    var curEase = inputs.ease != null ? inputs.ease : 5;
    var curEmp = empressementIndex(inputs);
    var curScore = calcBaselineTermsFromInputs(inputs).score;
    var targetSeg = heatSegmentForTarget(targetP);
    var sameTier = targetSeg && tierFor(curScore).i === targetSeg.i;

    if (sameTier) {
      return { impact: curImpact, ease: curEase, empressement: curEmp };
    }

    var best = null;
    for (var imp = 0; imp <= AXIS_SCORE_MAX; imp++) {
      for (var eas = 0; eas <= AXIS_SCORE_MAX; eas++) {
        for (var emp = 0; emp <= EMPRESSEMENT_UI_MAX; emp++) {
          var candidate = Object.assign({}, inputs, {
            impact: imp,
            ease: eas,
            empressement: emp,
            impactFactors: null,
            easeCosts: null
          });
          var score = calcBaselineTermsFromInputs(candidate).score;
          if (!betterBaselineOverride(score, imp, eas, emp, best, targetP, curImpact, curEase, curEmp)) {
            continue;
          }
          best = { score: score, impact: imp, ease: eas, empressement: emp };
        }
      }
    }
    return { impact: best.impact, ease: best.ease, empressement: best.empressement };
  }

  function overrideEisenhower(targetP, inputs) {
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < EISENHOWER_QUADRANTS.length; i++) {
      var q = EISENHOWER_QUADRANTS[i];
      var dist = Math.abs(q.score - targetP);
      if (dist < bestDist) {
        bestDist = dist;
        best = q;
      }
    }
    if (!best) return { urgency: inputs.urgency, impact: inputs.impact, ease: inputs.ease };
    return {
      urgency: best.preset.urgency,
      impact: best.preset.impact,
      ease: inputs.ease != null ? inputs.ease : 3
    };
  }

  function overrideWSJF(targetP, inputs) {
    var d = readInputs(inputs);
    var curScore = (d.pressure / d.jobSize) * WSJF_SCALE;
    var tPressure, tJob;
    if (curScore > 0.001) {
      var r = targetP / curScore;
      tPressure = d.pressure * r;
      tJob = d.jobSize / r;
    } else {
      tPressure = targetP / WSJF_SCALE;
      tJob = 1;
    }
    var nU = pressureToUrgencyLevel(clamp(tPressure, 0, PRESSURE_MAX));
    var nF = clamp(Math.round(6 - clamp(tJob, 1, 5)), 1, 5);
    return { urgency: nU, impact: inputs.impact, ease: nF };
  }

  function overrideValueEffort(targetP, inputs) {
    var d = readInputs(inputs);
    var curScore = (d.I * d.urgencyNorm / d.jobSize) * VALUE_EFFORT_SCALE;
    var tINorm, tUrg, tJob;
    if (curScore > 0.001) {
      var r = targetP / curScore;
      tINorm = d.I * r;
      tUrg = d.urgencyNorm * Math.sqrt(r);
      tJob = d.jobSize / Math.sqrt(r);
    } else {
      tINorm = 2;
      tUrg = targetP / (VALUE_EFFORT_SCALE * 2);
      tJob = 3;
    }
    var nI = clamp(Math.round(tINorm), 0, 4);
    var nU = pressureToUrgencyLevel(clamp(tUrg, 0, 1) * PRESSURE_MAX);
    var nF = clamp(Math.round(6 - clamp(tJob, 1, 5)), 1, 5);
    return { urgency: nU, impact: nI, ease: nF };
  }

  // ── 8. Help modal ───────────────────────────────────────────────────────

  var modalRoot = null;
  var modalContext = null;
  var wizardContext = null;

  function ensureModalRoot() {
    if (modalRoot) return modalRoot;
    modalRoot = document.createElement('div');
    modalRoot.className = 'help-modal-root';
    modalRoot.innerHTML =
      '<div class="help-modal-backdrop" data-close></div>' +
      '<div class="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-modal-title">' +
        '<header class="help-modal-header">' +
          '<button type="button" class="help-modal-close help-modal-close--top" aria-label="Fermer">&times;</button>' +
          '<h3 class="help-modal-title" id="help-modal-title"></h3>' +
          '<blockquote class="help-modal-quote" hidden></blockquote>' +
        '</header>' +
        '<div class="help-modal-content">' +
          '<ol class="help-modal-levels"></ol>' +
          '<div class="help-modal-body"></div>' +
        '</div>' +
        '<footer class="help-modal-footer">' +
          '<div class="help-modal-wizard-nav">' +
            '<button type="button" class="help-modal-nav help-modal-prev" hidden>Précédent</button>' +
            '<button type="button" class="help-modal-close help-modal-close--bottom">Fermer</button>' +
            '<button type="button" class="help-modal-nav help-modal-next" hidden>Suivant</button>' +
          '</div>' +
        '</footer>' +
      '</div>';
    document.body.appendChild(modalRoot);

    modalRoot.querySelector('.help-modal-backdrop').addEventListener('click', closeHelpModal);
    modalRoot.querySelectorAll('.help-modal-close').forEach(function (btn) {
      btn.addEventListener('click', closeHelpModal);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalRoot.classList.contains('open')) closeHelpModal();
    });
    return modalRoot;
  }

  function scrollHelpModalLevelIntoView(listItem) {
    if (!listItem || !modalRoot) return;
    var content = modalRoot.querySelector('.help-modal-content');
    if (!content) return;
    var contentRect = content.getBoundingClientRect();
    var elRect = listItem.getBoundingClientRect();
    if (elRect.top < contentRect.top) {
      content.scrollTop -= contentRect.top - elRect.top;
    } else if (elRect.bottom > contentRect.bottom) {
      content.scrollTop += elRect.bottom - contentRect.bottom;
    }
  }

  function paintHelpModalLevels() {
    if (!modalRoot || !modalContext) return;
    var list = modalRoot.querySelector('ol.help-modal-levels');
    if (!list) return;

    var current = snappedLevel(modalContext.currentValue, modalContext.min, modalContext.max);
    var currentEl = null;
    list.querySelectorAll('li').forEach(function (li) {
      var level = +li.dataset.level;
      var isCurrent = level === current;
      li.classList.toggle('is-current', isCurrent);
      li.setAttribute('aria-current', isCurrent ? 'true' : 'false');
      if (isCurrent) currentEl = li;
    });
    if (currentEl) {
      scrollHelpModalLevelIntoView(currentEl);
    }
  }

  function paintHelpModalFooter(wizard) {
    if (!modalRoot) return;
    var prevBtn = modalRoot.querySelector('.help-modal-prev');
    var nextBtn = modalRoot.querySelector('.help-modal-next');
    if (!prevBtn || !nextBtn) return;

    if (wizard && wizard.total > 1) {
      prevBtn.hidden = false;
      nextBtn.hidden = false;
      prevBtn.disabled = wizard.step <= 0;
      var isLast = wizard.step >= wizard.total - 1;
      nextBtn.textContent = isLast ? 'Terminer' : 'Suivant';
      prevBtn.onclick = function () {
        if (wizard.onPrev) wizard.onPrev();
      };
      nextBtn.onclick = function () {
        if (wizard.onNext) wizard.onNext();
      };
    } else {
      prevBtn.hidden = true;
      nextBtn.hidden = true;
      prevBtn.onclick = null;
      nextBtn.onclick = null;
    }
  }

  function openHelpModal(wordsKey, title, config) {
    config = config || {};
    var root = ensureModalRoot();
    var entry = LABELS[wordsKey];
    if (!entry) return;

    var min = config.min != null ? config.min : 0;
    var max = config.max != null ? config.max : 4;
    modalContext = {
      wordsKey: wordsKey,
      min: min,
      max: max,
      currentValue: config.currentValue != null ? config.currentValue : min,
      onSelect: config.onSelect || null
    };

    var titleEl = root.querySelector('.help-modal-title');
    var icon = config.icon || PROPERTY_ICONS[wordsKey] || 'ti-adjustments';
    titleEl.textContent = '';
    var iconEl = document.createElement('i');
    iconEl.className = 'ti ' + icon;
    iconEl.setAttribute('aria-hidden', 'true');
    titleEl.appendChild(iconEl);
    titleEl.appendChild(document.createTextNode(' ' + title));

    var popup = entry.popup || {};
    var quoteEl = root.querySelector('.help-modal-quote');
    var body = root.querySelector('.help-modal-body');
    var list = root.querySelector('ol.help-modal-levels');

    var quote = popup.subtitle || QUESTIONS[wordsKey] || '';
    quoteEl.textContent = quote;
    quoteEl.hidden = !quote;

    list.innerHTML = '';
    var start = 0;
    var end = entry.short.length - 1;
    var selectable = typeof modalContext.onSelect === 'function';
    for (var i = start; i <= end; i++) {
      var rowText = affirmationDisplayText(wordsKey, i);
      if (!rowText && !entry.detail[i]) continue;
      var li = document.createElement('li');
      li.dataset.level = String(i);
      li.appendChild(createHelpLevelDot(i, start, end));
      if (selectable) {
        li.className = 'is-selectable-row';
        var textEl = document.createElement('span');
        textEl.className = 'help-modal-level-text is-selectable';
        textEl.textContent = rowText;
        textEl.setAttribute('role', 'button');
        textEl.setAttribute('tabindex', '0');
        textEl.setAttribute('aria-label', rowText);
        li.appendChild(textEl);
        (function (level, target) {
          function selectLevel() {
            modalContext.currentValue = level;
            modalContext.onSelect(level);
            paintHelpModalLevels();
          }
          target.addEventListener('click', selectLevel);
          target.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectLevel();
            }
          });
        })(i, textEl);
      } else {
        var content = document.createElement('span');
        content.className = 'help-modal-level-content';
        content.innerHTML =
          '<span class="help-modal-level-label">' + escapeHtml(entry.short[i]) + '</span>' +
          '<span class="help-modal-level-text">' + escapeHtml(entry.detail[i]) + '</span>';
        li.appendChild(content);
      }
      list.appendChild(li);
    }
    list.hidden = list.childNodes.length === 0;

    body.innerHTML = '';
    [popup.intro, popup.guidance].forEach(function (text) {
      if (!text) return;
      var p = document.createElement('p');
      p.textContent = text;
      body.appendChild(p);
    });
    body.hidden = body.childNodes.length === 0;

    paintHelpModalLevels();
    paintHelpModalFooter(config.wizard || null);

    var modalEl = root.querySelector('.help-modal');
    if (modalEl) {
      modalEl.classList.toggle('help-modal--wizard', !!(config.wizard && config.wizard.total > 1));
    }

    var contentEl = root.querySelector('.help-modal-content');
    if (contentEl) contentEl.scrollTop = 0;

    root.classList.add('open');
    document.body.classList.add('help-modal-open');
    var focusTarget = config.wizard
      ? root.querySelector('.help-modal-next')
      : root.querySelector('.help-modal-close--bottom');
    if (focusTarget) focusTarget.focus();
  }

  function closeHelpModal() {
    if (modalRoot) modalRoot.classList.remove('open');
    document.body.classList.remove('help-modal-open');
    modalContext = null;
    wizardContext = null;
  }

  function showWizardStep(step) {
    if (!wizardContext) return;
    var dims = wizardContext.dimensions;
    if (!dims.length) return;
    step = clamp(step, 0, dims.length - 1);
    wizardContext.step = step;
    var dim = dims[step];
    var wordsKey = dim.wordsKey || dim.key;

    openHelpModal(wordsKey, dim.label, {
      icon: dim.icon,
      min: dim.min,
      max: dim.max,
      currentValue: wizardContext.getValue(dim.key),
      onSelect: function (level) {
        wizardContext.setValue(dim.key, level);
      },
      wizard: {
        step: step,
        total: dims.length,
        onPrev: function () {
          showWizardStep(step - 1);
        },
        onNext: function () {
          if (step < dims.length - 1) {
            showWizardStep(step + 1);
          } else {
            var onComplete = wizardContext.onComplete;
            closeHelpModal();
            if (onComplete) onComplete();
          }
        }
      }
    });
  }

  function openCriteriaWizard(dimensions, hooks) {
    hooks = hooks || {};
    if (!dimensions || !dimensions.length) return;
    var initialStep = hooks.initialStep != null ? hooks.initialStep : 0;
    initialStep = clamp(initialStep, 0, dimensions.length - 1);
    wizardContext = {
      dimensions: dimensions,
      step: initialStep,
      getValue: hooks.getValue || function () { return 0; },
      setValue: hooks.setValue || function () {},
      onComplete: hooks.onComplete || null
    };
    showWizardStep(initialStep);
  }

  // ── 9. Form controls (popup sections) ───────────────────────────────────
  // Factory functions return { root, setValue, … } controllers mounted into
  // popup.html sections. Layout changes bubble via onLayoutChange → Trello
  // iframe resize. Prefer these over ad-hoc DOM in other components.

  // Estimated duration helpers (shared with Progrès / agent).
  var DURATION_MIN_MINUTES = 5;
  var DURATION_MAX_MINUTES = Math.round(2 * 365.25 * 24 * 60);
  var DURATION_UNITS = [
    { id: 'min', label: 'min', minutes: 1 },
    { id: 'h', label: 'h', minutes: 60 },
    { id: 'j', label: 'j', minutes: 24 * 60 },
    { id: 'sem', label: 'sem', minutes: 7 * 24 * 60 },
    { id: 'mois', label: 'mois', minutes: 30 * 24 * 60 },
    { id: 'ans', label: 'ans', minutes: 365.25 * 24 * 60 }
  ];

  function clampDurationMinutes(minutes) {
    var v = typeof minutes === 'number' ? minutes : parseFloat(minutes);
    if (!isFinite(v) || v <= 0) return null;
    return Math.max(
      DURATION_MIN_MINUTES,
      Math.min(DURATION_MAX_MINUTES, Math.round(v))
    );
  }

  function durationToSlider(minutes) {
    var m = clampDurationMinutes(minutes);
    if (m == null) return 0;
    var logMin = Math.log(DURATION_MIN_MINUTES);
    var logMax = Math.log(DURATION_MAX_MINUTES);
    return (
      ((Math.log(m) - logMin) / (logMax - logMin)) * 100
    );
  }

  function sliderToDuration(t) {
    var x = clamp(typeof t === 'number' ? t : parseFloat(t), 0, 100);
    var logMin = Math.log(DURATION_MIN_MINUTES);
    var logMax = Math.log(DURATION_MAX_MINUTES);
    return Math.round(Math.exp(logMin + (x / 100) * (logMax - logMin)));
  }

  function pickDurationUnit(minutes) {
    var m = clampDurationMinutes(minutes) || DURATION_MIN_MINUTES;
    if (m < 90) return DURATION_UNITS[0];
    if (m < 36 * 60) return DURATION_UNITS[1];
    if (m < 10 * 24 * 60) return DURATION_UNITS[2];
    if (m < 8 * 7 * 24 * 60) return DURATION_UNITS[3];
    if (m < 18 * 30 * 24 * 60) return DURATION_UNITS[4];
    return DURATION_UNITS[5];
  }

  function formatDurationFr(minutes) {
    var m = clampDurationMinutes(minutes);
    if (m == null) return '';
    var unit = pickDurationUnit(m);
    var qty = m / unit.minutes;
    var rounded =
      qty >= 10 ? Math.round(qty) : Math.round(qty * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 0.05) {
      rounded = Math.round(rounded);
    }
    var label = unit.label;
    if (label === 'min') {
      return rounded <= 1 ? 'environ 1 minute' : 'environ ' + rounded + ' minutes';
    }
    if (label === 'h') {
      return rounded <= 1 ? 'environ 1 heure' : 'environ ' + rounded + ' heures';
    }
    if (label === 'j') {
      return rounded <= 1 ? 'environ 1 jour' : 'environ ' + rounded + ' jours';
    }
    if (label === 'sem') {
      return rounded <= 1 ? 'environ 1 semaine' : 'environ ' + rounded + ' semaines';
    }
    if (label === 'mois') {
      return rounded <= 1 ? 'environ 1 mois' : 'environ ' + rounded + ' mois';
    }
    return rounded <= 1 ? 'environ 1 an' : 'environ ' + rounded + ' ans';
  }

  function parseDurationNl(text) {
    if (typeof text !== 'string') return null;
    var raw = text.trim().toLowerCase().replace(/,/g, '.');
    if (!raw) return null;
    // "a few minutes|hours|days|weeks|months|years" / "quelques …"
    if (/quelques?\s+minutes?|a\s+few\s+minutes?/.test(raw)) return 15;
    if (/quelques?\s+heures?|a\s+few\s+hours?/.test(raw)) return 3 * 60;
    if (/quelques?\s+jours?|a\s+few\s+days?/.test(raw)) return 3 * 24 * 60;
    if (/quelques?\s+semaines?|a\s+few\s+weeks?/.test(raw)) return 3 * 7 * 24 * 60;
    if (/quelques?\s+mois|a\s+few\s+months?/.test(raw)) return 3 * 30 * 24 * 60;
    if (/quelques?\s+ans|quelques?\s+années?|a\s+few\s+years?/.test(raw)) {
      return DURATION_MAX_MINUTES;
    }
    var m = raw.match(
      /(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|heures?|hrs?|h|jours?|j|days?|d|semaines?|sem|weeks?|w|mois|months?|mo|ans|ann[eé]es?|years?|y)\b/
    );
    if (!m) {
      // bare number → minutes
      var bare = raw.match(/^(\d+(?:\.\d+)?)$/);
      if (bare) return clampDurationMinutes(parseFloat(bare[1]));
      return null;
    }
    var n = parseFloat(m[1]);
    if (!isFinite(n) || n <= 0) return null;
    var u = m[2];
    var factor = 1;
    // Match plurals too ("jours", "heures") — a trailing $ on jour rejected "jours"
    // and silently fell through to factor=1 (minutes).
    if (/^min/.test(u)) factor = 1;
    else if (/^(h|heure|hr)/.test(u)) factor = 60;
    else if (/^(j|jours?|days?|d)$/.test(u)) factor = 24 * 60;
    else if (/^(sem|semaines?|weeks?|w)$/.test(u)) factor = 7 * 24 * 60;
    else if (/^(mois|months?|mo)$/.test(u)) factor = 30 * 24 * 60;
    else if (/^(ans?|ann[eé]es?|years?|y)$/.test(u)) factor = 365.25 * 24 * 60;
    else return null;
    return clampDurationMinutes(n * factor);
  }

  function createField(config) {
    var el = config.el;
    var id = config.id;
    var label = config.label;
    var icon = config.icon || 'ti-adjustments';
    var wordsKey = config.wordsKey || id;
    var min = config.min != null ? config.min : 0;
    var max = config.max != null ? config.max : 4;
    var value = config.value != null ? config.value : min;
    var onChange = config.onChange || function () {};

    var field = document.createElement('div');
    field.className = 'field';
    field.dataset.fieldId = id;

    var lblWrap = document.createElement('span');
    lblWrap.className = 'field-lbl-wrap';

    var tooltipId = id + '-tip';

    var lblBtn = document.createElement('button');
    lblBtn.type = 'button';
    lblBtn.className = 'field-lbl';
    lblBtn.setAttribute('aria-label', 'Choisir le niveau de ' + label);
    lblBtn.setAttribute('aria-describedby', tooltipId);

    var lblIcon = document.createElement('i');
    lblIcon.className = 'ti ' + icon;
    lblIcon.setAttribute('aria-hidden', 'true');

    var lblText = document.createElement('span');
    lblText.className = 'field-lbl-text';
    lblText.textContent = label;

    var lblTooltip = document.createElement('div');
    lblTooltip.id = tooltipId;
    lblTooltip.className = 'field-lbl-tooltip';
    lblTooltip.setAttribute('role', 'tooltip');

    function openFieldHelp() {
      var wiz = config.wizard;
      if (wiz && wiz.dimensions && wiz.dimensions.length > 1) {
        openCriteriaWizard(wiz.dimensions, {
          initialStep: wiz.step != null ? wiz.step : 0,
          getValue: wiz.getValue,
          setValue: wiz.setValue
        });
        return;
      }
      openHelpModal(wordsKey, label, {
        icon: icon,
        min: min,
        max: max,
        currentValue: getValue(),
        onSelect: function (level) {
          setValue(level);
          onChange(level);
        }
      });
    }

    lblBtn.addEventListener('click', openFieldHelp);
    if (
      global.ContextMenu &&
      typeof global.ContextMenu.bind === 'function' &&
      typeof global.ContextMenu.buildPriorityFieldItems === 'function'
    ) {
      ContextMenu.bind(lblBtn, function () {
        return ContextMenu.buildPriorityFieldItems({
          label: label,
          onOpenHelp: openFieldHelp,
        });
      });
    }

    lblBtn.appendChild(lblIcon);
    lblBtn.appendChild(lblText);
    lblWrap.appendChild(lblBtn);
    lblWrap.appendChild(lblTooltip);

    var sliderWrap = document.createElement('div');
    sliderWrap.className = 'field-slider';

    var inputEl = document.createElement('input');
    inputEl.type = 'range';
    inputEl.className = 'field-range';
    inputEl.id = id;
    inputEl.min = String(min);
    inputEl.max = String(max);
    inputEl.step = String(SLIDER_STEP);
    inputEl.value = String(value);
    inputEl.setAttribute('aria-label', label);

    sliderWrap.appendChild(inputEl);

    var fieldHead = document.createElement('div');
    fieldHead.className = 'field-head';
    fieldHead.appendChild(lblWrap);
    fieldHead.appendChild(sliderWrap);

    field.appendChild(fieldHead);

    el.appendChild(field);

    // Routable through api.updateDisplay so visuals (e.g. impact reach) can wrap it.
    var api = {
      el: field,
      getValue: getValue,
      setValue: setValue,
      updateDisplay: updateDisplayBase,
      onChange: onChange
    };

    function updateDisplayBase(v) {
      v = clamp(v, min, max);
      var idx = snappedLevel(v, min, max);
      var shortLabel = wordFor(wordsKey, idx);
      var questionText = dimensionQuestion(wordsKey);
      lblTooltip.textContent = questionText;
      lblBtn.removeAttribute('title');
      lblWrap.classList.toggle('is-empty-tip', !questionText);
      lblBtn.setAttribute('aria-label', shortLabel
        ? 'Choisir le niveau de ' + label + '. Actuellement : ' + shortLabel
        : 'Choisir le niveau de ' + label);
      inputEl.value = String(v);
    }

    function setValue(v) {
      api.updateDisplay(clamp(Math.round(v), min, max));
    }

    function getValue() {
      return +inputEl.value;
    }

    function handleRangeInput() {
      var v = +inputEl.value;
      api.updateDisplay(v);
      onChange(v);
    }
    inputEl.addEventListener('input', handleRangeInput);
    inputEl.addEventListener('change', handleRangeInput);

    api.updateDisplay(value);
    return api;
  }

  /**
   * Expandable checklist under Impact ("Nous permet de…") or Facilité
   * ("Ce que ça coûte…"). Checking any box switches the master slider to a
   * calculated average (see computeImpactFromFactors / computeEaseFromCosts);
   * unchecking all boxes returns control to the manual slider.
   */
  function createAxisFactorsWidget(config) {
    var defs = config.defs || [];
    var title = config.title || '';
    var getInitial = config.getInitial || function () { return null; };
    var onChange = config.onChange || function () {};

    var values = {};
    function seedValues() {
      var initial = getInitial() || {};
      defs.forEach(function (def) {
        var entry = initial[def.id];
        values[def.id] = {
          checked: !!(entry && entry.checked),
          intensity: entry && entry.intensity != null
            ? clamp(Number(entry.intensity) || 5, 1, 10)
            : (def.defaultIntensity || 5),
          stepId: (entry && entry.stepId) || def.defaultStepId
        };
      });
    }
    seedValues();

    var wrap = document.createElement('div');
    wrap.className = 'axis-factors';

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'axis-factors-toggle';
    var chevron = document.createElement('i');
    chevron.className = 'ti ti-chevron-down axis-factors-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    var toggleLabel = document.createElement('span');
    toggleLabel.className = 'axis-factors-toggle-label';
    toggleLabel.textContent = title;
    var modeTag = document.createElement('span');
    modeTag.className = 'axis-factors-mode-tag';
    toggleBtn.appendChild(chevron);
    toggleBtn.appendChild(toggleLabel);
    toggleBtn.appendChild(modeTag);
    wrap.appendChild(toggleBtn);

    var body = document.createElement('div');
    body.className = 'axis-factors-body';
    wrap.appendChild(body);

    var expanded = false;
    function setExpanded(next) {
      expanded = !!next;
      body.hidden = !expanded;
      wrap.classList.toggle('is-expanded', expanded);
      toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
    setExpanded(false);
    toggleBtn.addEventListener('click', function () {
      setExpanded(!expanded);
    });

    var rows = {};

    function anyChecked() {
      return defs.some(function (def) { return values[def.id].checked; });
    }

    function updateModeTag() {
      var calculated = anyChecked();
      modeTag.textContent = calculated ? 'calcul\u00e9' : 'manuel';
      modeTag.classList.toggle('is-calculated', calculated);
    }

    function emit() {
      updateModeTag();
      onChange(getValues());
    }

    defs.forEach(function (def) {
      var row = document.createElement('div');
      row.className = 'axis-factor-row';

      var lbl = document.createElement('label');
      lbl.className = 'axis-factor-checkbox-label';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'axis-factor-checkbox';
      checkbox.checked = values[def.id].checked;
      var textSpan = document.createElement('span');
      textSpan.textContent = def.label;
      lbl.appendChild(checkbox);
      lbl.appendChild(textSpan);
      row.appendChild(lbl);

      var control = null;
      if (def.kind === 'named') {
        control = document.createElement('select');
        control.className = 'axis-factor-select';
        (def.steps || []).forEach(function (step) {
          var opt = document.createElement('option');
          opt.value = step.id;
          opt.textContent = step.label;
          control.appendChild(opt);
        });
        control.value = values[def.id].stepId || def.defaultStepId;
        control.disabled = !values[def.id].checked;
        control.addEventListener('change', function () {
          values[def.id].stepId = control.value;
          emit();
        });
      } else {
        control = document.createElement('input');
        control.type = 'range';
        control.className = 'axis-factor-range field-range';
        control.min = '1';
        control.max = '10';
        control.step = '1';
        control.value = String(values[def.id].intensity);
        control.disabled = !values[def.id].checked;
        control.addEventListener('input', function () {
          values[def.id].intensity = clamp(+control.value, 1, 10);
          emit();
        });
      }
      row.appendChild(control);

      checkbox.addEventListener('change', function () {
        values[def.id].checked = checkbox.checked;
        control.disabled = !checkbox.checked;
        emit();
      });

      rows[def.id] = { checkbox: checkbox, control: control };
      body.appendChild(row);
    });

    function getValues() {
      var out = {};
      defs.forEach(function (def) {
        var v = values[def.id];
        out[def.id] = def.kind === 'named'
          ? { checked: !!v.checked, stepId: v.stepId || def.defaultStepId }
          : { checked: !!v.checked, intensity: v.intensity };
      });
      return out;
    }

    function setValues(next) {
      var prev = getInitial;
      getInitial = function () { return next || {}; };
      seedValues();
      getInitial = prev;
      defs.forEach(function (def) {
        var r = rows[def.id];
        if (!r) return;
        r.checkbox.checked = values[def.id].checked;
        r.control.disabled = !values[def.id].checked;
        if (def.kind === 'named') r.control.value = values[def.id].stepId;
        else r.control.value = String(values[def.id].intensity);
      });
      updateModeTag();
    }

    updateModeTag();

    return {
      el: wrap,
      getValues: getValues,
      setValues: setValues,
      isCalculated: anyChecked,
      setExpanded: setExpanded
    };
  }

  function createCollapsibleEnableChrome(config) {
    var titleText = config.title || '';
    var bodyId = config.bodyId || '';
    var checkboxClass = config.checkboxClass || '';
    var labelClass = config.labelClass || '';
    var iconClass = config.iconClass || '';
    var titleClass = config.titleClass || '';
    var leadingIcon = config.leadingIcon || '';
    // hideEnable and leadingIcon are independent: always-on sections may use an
    // icon alone; enable sections may show checkbox + icon together.
    var hideEnable = !!config.hideEnable;
    var enableLabel = config.enableLabel || ('Activer ' + titleText);
    var collapseLabel = config.collapseLabel || ('Replier ' + titleText);
    var expandLabel = config.expandLabel || ('D\u00e9velopper ' + titleText);

    var head = document.createElement('div');
    head.className = 'section-toggle-head';

    var label = null;
    var checkbox = null;
    var leadingIconEl = null;

    var collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'section-collapse-btn';
    if (bodyId) collapseBtn.setAttribute('aria-controls', bodyId);
    collapseBtn.setAttribute('aria-expanded', 'false');
    collapseBtn.setAttribute('aria-label', expandLabel);

    // Chevron leads on the left; title/summary fill the middle.
    var chevron = document.createElement('i');
    chevron.className = 'ti ti-chevron-down section-collapse-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    collapseBtn.appendChild(chevron);

    // Icon lives inside the collapse button so hover/focus highlight wraps it.
    if (leadingIcon) {
      leadingIconEl = document.createElement('span');
      leadingIconEl.className = ('section-leading-icon ' + iconClass).trim();
      leadingIconEl.setAttribute('aria-hidden', 'true');

      var iconGlyph = document.createElement('i');
      iconGlyph.className = ('ti ' + leadingIcon + ' section-leading-icon-glyph').trim();
      leadingIconEl.appendChild(iconGlyph);
      collapseBtn.appendChild(leadingIconEl);
    }

    var textWrap = document.createElement('span');
    textWrap.className = 'section-enable-text';

    var title = document.createElement('span');
    title.className = ('section-enable-title ' + titleClass).trim();
    title.textContent = titleText;
    textWrap.appendChild(title);

    var summary = document.createElement('span');
    summary.className = 'section-toggle-summary';
    summary.hidden = true;
    summary.setAttribute('aria-hidden', 'true');

    collapseBtn.appendChild(textWrap);
    collapseBtn.appendChild(summary);
    head.appendChild(collapseBtn);

    if (!hideEnable) {
      // Checkbox alone enables/disables — title is not part of the label,
      // so clicking the heading collapses instead of toggling the feature.
      // Keep enable toggle on the right edge (settings gears insert before it).
      label = document.createElement('label');
      label.className = ('section-enable-label ' + labelClass).trim();

      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = ('section-enable-checkbox ' + checkboxClass).trim();
      checkbox.setAttribute('aria-label', enableLabel);
      if (bodyId) checkbox.setAttribute('aria-controls', bodyId);

      label.appendChild(checkbox);
      head.appendChild(label);
    }

    return {
      head: head,
      label: label,
      checkbox: checkbox,
      leadingIcon: leadingIconEl,
      title: title,
      summary: summary,
      collapseBtn: collapseBtn,
      collapseLabel: collapseLabel,
      expandLabel: expandLabel,
      enableLabel: enableLabel
    };
  }

  // exports
  S.DURATION_MAX_MINUTES = DURATION_MAX_MINUTES;
  S.DURATION_MIN_MINUTES = DURATION_MIN_MINUTES;
  S.DURATION_UNITS = DURATION_UNITS;
  S.HEAT_TARGET_EPS = HEAT_TARGET_EPS;
  S.SCORE_BREAKDOWNS = SCORE_BREAKDOWNS;
  S.baselineScore = baselineScore;
  S.betterBaselineOverride = betterBaselineOverride;
  S.breakdownFromRows = breakdownFromRows;
  S.breakdownRowFormula = breakdownRowFormula;
  S.breakdownRowInfo = breakdownRowInfo;
  S.breakdownRowSub = breakdownRowSub;
  S.breakdownRowTerm = breakdownRowTerm;
  S.breakdownRowTitle = breakdownRowTitle;
  S.breakdownRowToLine = breakdownRowToLine;
  S.breakdownRowTotal = breakdownRowTotal;
  S.calcEisenhower = calcEisenhower;
  S.calcValueEffort = calcValueEffort;
  S.calcWSJF = calcWSJF;
  S.clampDurationMinutes = clampDurationMinutes;
  S.closeHelpModal = closeHelpModal;
  S.comparableAxis = comparableAxis;
  S.createAxisFactorsWidget = createAxisFactorsWidget;
  S.createCollapsibleEnableChrome = createCollapsibleEnableChrome;
  S.createField = createField;
  S.durationToSlider = durationToSlider;
  S.eisenhowerQuadrantById = eisenhowerQuadrantById;
  S.eisenhowerQuadrantFor = eisenhowerQuadrantFor;
  S.ensureModalRoot = ensureModalRoot;
  S.formatBaseline = formatBaseline;
  S.formatBaselineBreakdown = formatBaselineBreakdown;
  S.formatDurationFr = formatDurationFr;
  S.formatEisenhower = formatEisenhower;
  S.formatEisenhowerBreakdown = formatEisenhowerBreakdown;
  S.formatScore = formatScore;
  S.formatScoreBreakdown = formatScoreBreakdown;
  S.formatSignedPoints = formatSignedPoints;
  S.formatSliderLevel = formatSliderLevel;
  S.formatValueEffort = formatValueEffort;
  S.formatValueEffortBreakdown = formatValueEffortBreakdown;
  S.formatWSJF = formatWSJF;
  S.formatWSJFBreakdown = formatWSJFBreakdown;
  S.heatPresetForTarget = heatPresetForTarget;
  S.heatSegmentDelta = heatSegmentDelta;
  S.heatSegmentForTarget = heatSegmentForTarget;
  S.modalContext = modalContext;
  S.modalRoot = modalRoot;
  S.openCriteriaWizard = openCriteriaWizard;
  S.openHelpModal = openHelpModal;
  S.overrideBaseline = overrideBaseline;
  S.overrideEisenhower = overrideEisenhower;
  S.overrideValueEffort = overrideValueEffort;
  S.overrideWSJF = overrideWSJF;
  S.paintHelpModalFooter = paintHelpModalFooter;
  S.paintHelpModalLevels = paintHelpModalLevels;
  S.parseDurationNl = parseDurationNl;
  S.pickDurationUnit = pickDurationUnit;
  S.pickOverrideDelta = pickOverrideDelta;
  S.renderScoreBreakdownTooltip = renderScoreBreakdownTooltip;
  S.scrollHelpModalLevelIntoView = scrollHelpModalLevelIntoView;
  S.showWizardStep = showWizardStep;
  S.sliderAxisValue = sliderAxisValue;
  S.sliderToDuration = sliderToDuration;
  S.wizardContext = wizardContext;
})(typeof window !== 'undefined' ? window : this);
