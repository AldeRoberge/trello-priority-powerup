'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('PriorityUI scoring (baseline)', () => {
  let PriorityUI;
  let baselineScore;
  let calcBaseline;

  before(() => {
    loadComponent('priority/priority-ui.js');
    PriorityUI = global.PriorityUI;
    assert.ok(PriorityUI);
    baselineScore = PriorityUI.calc.baselineScore;
    calcBaseline = PriorityUI.calc.baseline;
    assert.equal(typeof baselineScore, 'function');
    assert.equal(typeof calcBaseline, 'function');
  });

  // Baseline score = Impact*0.6 + Facilité*0.4 (+ Échéance pull + Empressement pull).
  // No date, no Empressement here: score is purely Impact + Facilité.
  it('max Impact + Facilité + Empressement score 10 Critique', () => {
    const result = calcBaseline({ impact: 10, ease: 10, empressement: 4 });
    assert.ok(Math.abs(result.score - 10) < 0.01);
    assert.equal(result.tier.label, 'Critique');
  });

  it('baselineScore(impact, ease, empressement) matches Impact*0.6 + Facilité*0.4 + Empressement pull', () => {
    const s = baselineScore(5, 5, 0);
    assert.ok(Math.abs(s - 5) < 0.01, `expected ~5, got ${s}`);
  });

  it('max Empressement alone cannot reach Urgente (additive, capped pull)', () => {
    const s = baselineScore(0, 0, 4);
    assert.ok(s < 4.3, `expected < 4.3 (below Importante), got ${s}`);
  });

  it('easy beats hard at the same Impact/Empressement', () => {
    const hard = baselineScore(4, 1, 0);
    const easy = baselineScore(4, 8, 0);
    assert.ok(easy > hard, `easy ${easy} should beat hard ${hard}`);
  });

  it('critique-level Impact + Facilité stays Critique even with no Empressement', () => {
    const critHard = baselineScore(10, 8, 0);
    assert.ok(critHard >= 8.6, `expected >= 8.6, got ${critHard}`);
  });

  it('all-min stays low (below Secondaire)', () => {
    const allMin = baselineScore(0, 0, 0);
    assert.ok(allMin < 1.4, `expected < 1.4, got ${allMin}`);
  });

  it('raising Empressement raises the score', () => {
    const base = baselineScore(5, 5, 0);
    const withEmpressement = baselineScore(5, 5, 4);
    assert.ok(withEmpressement > base, `${withEmpressement} should be > ${base}`);
  });

  it('HEAT_SEGMENTS presets land in expected tiers', () => {
    for (const seg of PriorityUI.HEAT_SEGMENTS) {
      const preset = seg.preset;
      const result = calcBaseline(preset);
      assert.equal(
        result.tier.i,
        seg.i,
        `${seg.label} preset ${JSON.stringify(preset)} -> ${result.tier.label} (${result.score.toFixed(2)})`
      );
    }
  });

  it('exposes TIERS and HEAT_SEGMENTS', () => {
    assert.ok(Array.isArray(PriorityUI.TIERS));
    assert.ok(PriorityUI.TIERS.length >= 7);
    assert.ok(Array.isArray(PriorityUI.HEAT_SEGMENTS));
  });

  it('persists embedded Statut detail collapse preference', () => {
    assert.equal(typeof PriorityUI.loadStatutEmbeddedDetailsExpanded, 'function');
    assert.equal(typeof PriorityUI.saveStatutEmbeddedDetailsExpanded, 'function');
    const key = PriorityUI.STATUT_EMBEDDED_DETAILS_STORAGE_KEY;
    assert.ok(key);
    localStorage.removeItem(key);
    assert.equal(PriorityUI.loadStatutEmbeddedDetailsExpanded(), true);
    PriorityUI.saveStatutEmbeddedDetailsExpanded(false);
    assert.equal(PriorityUI.loadStatutEmbeddedDetailsExpanded(), false);
    PriorityUI.saveStatutEmbeddedDetailsExpanded(true);
    assert.equal(PriorityUI.loadStatutEmbeddedDetailsExpanded(), true);
  });

  it('persists Assistant (chat) section collapse preference', () => {
    assert.equal(typeof PriorityUI.resolveSectionExpanded, 'function');
    assert.equal(typeof PriorityUI.saveSectionCollapseState, 'function');
    const key = PriorityUI.SECTION_COLLAPSE_STORAGE_KEY;
    assert.ok(key);
    localStorage.removeItem(key);
    assert.equal(PriorityUI.resolveSectionExpanded('chat', true), true);
    PriorityUI.saveSectionCollapseState({ chat: false });
    assert.equal(PriorityUI.resolveSectionExpanded('chat', true), false);
    PriorityUI.saveSectionCollapseState({ chat: true });
    assert.equal(PriorityUI.resolveSectionExpanded('chat', true), true);
  });
});
