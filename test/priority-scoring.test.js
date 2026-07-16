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

  it('max inputs score 10 Critique', () => {
    const result = calcBaseline({ urgency: 4, impact: 4, ease: 5 });
    assert.ok(Math.abs(result.score - 10) < 0.01);
    assert.equal(result.tier.label, 'Critique');
  });

  it('keeps max urgency + low impact + hard as Urgente+', () => {
    const urgentLow = baselineScore(4, 0, 1);
    assert.ok(urgentLow >= 7.2, `expected >= 7.2, got ${urgentLow}`);
  });

  it('easy beats hard at similar urgency/impact', () => {
    const hard = baselineScore(2, 2.5, 1);
    const easy = baselineScore(2, 2.8, 5);
    assert.ok(easy > hard, `easy ${easy} should beat hard ${hard}`);
  });

  it('critique hard stays Critique', () => {
    const critHard = baselineScore(4, 4, 1);
    assert.ok(critHard >= 8.6, `expected >= 8.6, got ${critHard}`);
  });

  it('all-min stays low (below Secondaire)', () => {
    const allMin = baselineScore(0, 0, 1);
    assert.ok(allMin < 1.4, `expected < 1.4, got ${allMin}`);
  });

  it('HEAT_SEGMENTS presets land in expected tiers', () => {
    const presets = [
      ['Optionnelle', 0, 0, 2],
      ['Secondaire', 1, 1, 2],
      ['Flexible', 1, 2, 3],
      ['Importante', 2, 2, 3],
      ['Prioritaire', 2, 3, 3],
      ['Urgente', 3, 3, 2],
      ['Critique', 4, 4, 5],
    ];
    for (const [label, u, i, f] of presets) {
      const result = calcBaseline({ urgency: u, impact: i, ease: f });
      assert.equal(
        result.tier.label,
        label,
        `${label} U=${u} I=${i} F=${f} -> ${result.tier.label} (${result.score.toFixed(2)})`
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

  it('rolls overdue daily recurrence to the next future time', () => {
    const next = PriorityUI.nextOccurrenceParts(
      { dueDate: '2026-07-14', dueTime: '08:00' },
      { frequency: 'daily', interval: 1 },
      { now: new Date(2026, 6, 16, 9, 0, 0) }
    );
    assert.equal(next.dueDate, '2026-07-17');
    assert.equal(next.dueTime, '08:00');
  });

  it('keeps same-day recurrence when the next time is still ahead', () => {
    const next = PriorityUI.nextOccurrenceParts(
      { dueDate: '2026-07-15', dueTime: '08:00' },
      { frequency: 'daily', interval: 1 },
      { now: new Date(2026, 6, 15, 20, 0, 0) }
    );
    assert.equal(next.dueDate, '2026-07-16');
  });

  it('formats recurring labels with a concrete time', () => {
    assert.equal(
      PriorityUI.formatRecurrenceLabelFr({ frequency: 'daily', interval: 1 }, '08:00'),
      'Chaque jour \u00e0 08:00'
    );
  });
});
