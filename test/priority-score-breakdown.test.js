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
      [0, 0, 0],
      [2, 2, 3],
      [3, 1, 4],
      [4, 0, 1],
      [8, 8, 2],
      [1, 3, 1],
      [3, 3, 2],
    ];
    for (const [impact, ease, empressement] of samples) {
      const result = calcBaseline({ impact, ease, empressement });
      const t = result.terms;
      const sum = t.impactShare + t.easeTerm + t.datePull + t.empressePull;
      assert.ok(
        Math.abs(sum - result.score) < 1e-9,
        `I=${impact} F=${ease} E=${empressement}: sum ${sum} != score ${result.score}`
      );
    }
  });

  it('baseline tooltip uses a plain formula and signed contributions (no Échéance/Empressement)', () => {
    const result = calcBaseline({ impact: 2, ease: 3, empressement: 0 });
    const breakdown = scoreBreakdown('baseline', result);
    assert.equal(breakdown.short, 'Comment ce score est calculé');
    assert.ok(breakdown.lines[0].includes('Comment ce score est calculé'));
    assert.equal(breakdown.lines[1], 'Impact + Facilité');
    assert.match(breakdown.text, /Impact \(niveau 2\) → \+/);
    assert.match(breakdown.text, /Facilité \(niveau 3\) → \+/);
    assert.match(breakdown.text, /Score = \d+\.\d \/ 10/);
    assert.equal(breakdown.text.includes('Urgence'), false);
    assert.equal(breakdown.text.includes('Pression'), false);
    assert.equal(breakdown.text.includes('Multiplicateur'), false);
    assert.equal(breakdown.text.includes('Atténuation'), false);
    assert.equal(breakdown.text.includes('Pénalité'), false);
  });

  it('shows Empressement in plain language when it applies', () => {
    const result = calcBaseline({ impact: 0, ease: 1, empressement: 4 });
    const breakdown = scoreBreakdown('baseline', result);
    assert.equal(breakdown.lines[1], 'Impact + Facilité + Empressement');
    assert.match(breakdown.text, /Empressement \(niveau 4\) → \+/);
  });

  it('shows Échéance (with a date fixe detail) in plain language when a due date is close', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const iso = tomorrow.toISOString().slice(0, 10);
    const result = calcBaseline({
      impact: 2,
      ease: 2,
      empressement: 0,
      dueDate: iso,
      dateFixe: true,
    });
    const breakdown = scoreBreakdown('baseline', result);
    assert.equal(breakdown.lines[1], 'Impact + Facilité + Échéance');
    assert.match(breakdown.text, /Échéance → date fixe \+/);
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
