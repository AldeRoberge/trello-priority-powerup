'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('PriorityUI score breakdown (?)', () => {
  let PriorityUI;
  let calcBaseline;
  let scoreBreakdown;

  before(() => {
    loadComponent('priority/priority-ui.js');
    PriorityUI = global.PriorityUI;
    assert.ok(PriorityUI);
    calcBaseline = PriorityUI.calc.baseline;
    scoreBreakdown = PriorityUI.format.scoreBreakdown;
    assert.equal(typeof calcBaseline, 'function');
    assert.equal(typeof scoreBreakdown, 'function');
  });

  it('baseline parts sum to the displayed score', () => {
    const samples = [
      [0, 0, 1],
      [2, 2, 3],
      [3, 1, 5],
      [4, 0, 1],
      [4, 4, 5],
      [1, 3, 1],
      [3, 3, 2],
    ];
    for (const [u, i, f] of samples) {
      const result = calcBaseline({ urgency: u, impact: i, ease: f });
      const t = result.terms;
      const sum =
        t.urgencyShare + t.impactShare + t.easeTerm + (t.urgencyBoost || 0);
      assert.ok(
        Math.abs(sum - result.score) < 1e-9,
        `U=${u} I=${i} F=${f}: sum ${sum} != score ${result.score}`
      );
    }
  });

  it('baseline tooltip uses a plain formula and signed contributions', () => {
    const result = calcBaseline({ urgency: 2, impact: 2, ease: 3 });
    const breakdown = scoreBreakdown('baseline', result);
    assert.equal(breakdown.short, 'Comment ce score est calculé');
    assert.ok(breakdown.lines[0].includes('Comment ce score est calculé'));
    assert.equal(breakdown.lines[1], 'Urgence + Impact + Facilité');
    assert.match(breakdown.text, /Urgence \(niveau 2\) → \+/);
    assert.match(breakdown.text, /Impact \(niveau 2\) → \+/);
    assert.match(breakdown.text, /Facilité \(niveau 3\) → \+/);
    assert.match(breakdown.text, /Score = \d+\.\d \/ 10/);
    assert.equal(breakdown.text.includes('Pression'), false);
    assert.equal(breakdown.text.includes('Multiplicateur'), false);
    assert.equal(breakdown.text.includes('Atténuation'), false);
    assert.equal(breakdown.text.includes('Pénalité'), false);
  });

  it('shows urgency bonus in plain language when it applies', () => {
    const result = calcBaseline({ urgency: 4, impact: 0, ease: 1 });
    const breakdown = scoreBreakdown('baseline', result);
    assert.ok(breakdown.lines[1].includes('bonus'));
    assert.match(breakdown.text, /Bonus urgence → \+/);
    assert.ok(breakdown.text.includes('coup de pouce'));
  });

  it('eisenhower tooltip explains thresholds in plain French', () => {
    const result = PriorityUI.calc.eisenhower({ urgency: 3, impact: 3, ease: 2 });
    const breakdown = scoreBreakdown('eisenhower', result);
    assert.equal(breakdown.short, 'Comment ce score est calculé');
    assert.ok(breakdown.text.includes('Urgent si le niveau est'));
    assert.ok(breakdown.text.includes('Important si le niveau est'));
    assert.ok(breakdown.text.includes('Quadrant'));
    assert.equal(breakdown.text.includes('Seuil urgent'), false);
  });
});
