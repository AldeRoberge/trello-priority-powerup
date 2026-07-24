'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

loadComponent('priority/priority-ui.js');
loadComponent('priority/priority-trello.js');

const PU = global.PriorityUI;
const PT = global.PriorityTrello;

const NOW = new Date(2026, 6, 20); // 2026-07-20 local

describe('Priority adaptation — Impact / Facilité / Échéance / Empressement', () => {
  it('no date + Empressement "Aucun" -> score === base (no Échéance/Empressement pull)', () => {
    const inputs = { impact: 6, ease: 4, empressement: 'aucun' };
    const terms = PU.calcBaselineTermsFromInputs(inputs, NOW);
    assert.equal(terms.datePull, 0);
    assert.equal(terms.empressePull, 0);
    assert.ok(Math.abs(terms.score - terms.base) < 1e-9);
    assert.ok(Math.abs(terms.base - (6 * 0.6 + 4 * 0.4)) < 1e-9);
  });

  it('Date fixe raises the score more than a movable date at the same distance; Empressement stays unchanged', () => {
    const tomorrow = '2026-07-21';
    const base = { impact: 5, ease: 5, empressement: 'bientot', dueDate: tomorrow };
    const fixed = PU.calcBaselineTermsFromInputs(Object.assign({}, base, { dateFixe: true }), NOW);
    const movable = PU.calcBaselineTermsFromInputs(Object.assign({}, base, { dateFixe: false }), NOW);
    assert.ok(fixed.score > movable.score, `${fixed.score} should be > ${movable.score}`);
    assert.equal(fixed.E, movable.E);
  });

  it('raising Empressement raises the score, with or without a due date', () => {
    const noDateLow = PU.calcBaselineTermsFromInputs({ impact: 5, ease: 5, empressement: 'aucun' }, NOW);
    const noDateHigh = PU.calcBaselineTermsFromInputs({ impact: 5, ease: 5, empressement: 'vite' }, NOW);
    assert.ok(noDateHigh.score > noDateLow.score);

    const withDate = { impact: 5, ease: 5, dueDate: '2026-08-15', dateFixe: false };
    const withDateLow = PU.calcBaselineTermsFromInputs(Object.assign({ empressement: 'aucun' }, withDate), NOW);
    const withDateHigh = PU.calcBaselineTermsFromInputs(Object.assign({ empressement: 'vite' }, withDate), NOW);
    assert.ok(withDateHigh.score > withDateLow.score);
  });

  it('a fixed date far away pulls a little; tomorrow pulls a lot', () => {
    const far = PU.computeDatePull({ dueDate: '2027-07-20', dateFixe: true }, NOW); // 365 days out
    const soon = PU.computeDatePull({ dueDate: '2026-07-21', dateFixe: true }, NOW); // tomorrow
    assert.ok(far < 0.05, `expected far pull < 0.05, got ${far}`);
    assert.ok(soon > 2, `expected tomorrow pull > 2, got ${soon}`);
    assert.ok(soon > far);
  });

  it('a trivial overdue fixed-date task cannot outscore a critical task with no date (additive, capped pull)', () => {
    const overdueTrivial = PU.calcBaselineTermsFromInputs(
      { impact: 0, ease: 0, empressement: 'aucun', dueDate: '2026-07-10', dateFixe: true },
      NOW
    );
    const criticalNoDate = PU.calcBaselineTermsFromInputs(
      { impact: 10, ease: 8, empressement: 'aucun' },
      NOW
    );
    assert.ok(
      overdueTrivial.score < criticalNoDate.score,
      `overdue trivial ${overdueTrivial.score} should stay below critical ${criticalNoDate.score}`
    );
  });

  it('migration Part B table maps legacy Urgence (0-4) onto Empressement, compressing downward', () => {
    const cases = [
      [0, 'aucun', false],
      [1, 'aucun', false],
      [2, 'bientot', false],
      [3, 'assez-vite', false],
      [3.5, 'vite', true],
      [4, 'vite', true],
    ];
    for (const [urgency, expectedEmpressement, expectReview] of cases) {
      const patch = PU.migrateLegacyUrgency({ urgency });
      assert.ok(patch, `expected a migration patch for urgency=${urgency}`);
      assert.equal(patch.empressement, expectedEmpressement, `urgency=${urgency}`);
      assert.equal(!!patch.urgencyReviewNeeded, expectReview, `urgency=${urgency} review flag`);
      assert.equal(patch.legacyUrgency, urgency);
      assert.equal(patch.urgencyMigrated, true);
    }
  });

  it('migration is a one-time affair: already-migrated or already-on-Empressement cards are left alone', () => {
    assert.equal(PU.migrateLegacyUrgency({ urgency: 4, legacyUrgency: 4, urgencyMigrated: true }), null);
    assert.equal(PU.migrateLegacyUrgency({ empressement: 'vite' }), null);
    assert.equal(PU.migrateLegacyUrgency({}), null);
  });

  it('PriorityTrello.normalizeInputs runs the migration end-to-end for a legacy card', () => {
    const normalized = PT.normalizeInputs({ impact: 2, ease: 3, urgency: 3.5 });
    assert.ok(normalized);
    assert.equal(normalized.empressement, 'vite');
    assert.equal(normalized.legacyUrgency, 3.5);
    assert.equal(normalized.urgencyMigrated, true);
    assert.equal(normalized.urgencyReviewNeeded, true);
    // Legacy Impact (0–4) / Facilité (1–5) get rescaled onto the new 0–10 axes.
    assert.equal(normalized.axesScaledTo10, true);
    assert.ok(Math.abs(normalized.impact - 5) < 1e-9);
    assert.ok(Math.abs(normalized.ease - 5) < 1e-9);
  });

  it('Urgence is not a PRIORITY_DIMENSIONS axis; Impact/Facilité/Empressement are', () => {
    const keys = PT.PRIORITY_DIMENSIONS.map((d) => d.key);
    assert.ok(!keys.includes('urgency'), `PRIORITY_DIMENSIONS should not include urgency, got ${keys}`);
    assert.ok(keys.includes('impact'));
    assert.ok(keys.includes('ease'));
    assert.ok(keys.includes('empressement'));
    const impactDim = PT.PRIORITY_DIMENSIONS.find((d) => d.key === 'impact');
    const easeDim = PT.PRIORITY_DIMENSIONS.find((d) => d.key === 'ease');
    const empressementDim = PT.PRIORITY_DIMENSIONS.find((d) => d.key === 'empressement');
    assert.equal(impactDim.min, 0);
    assert.equal(impactDim.max, 10);
    assert.equal(easeDim.min, 0);
    assert.equal(easeDim.max, 10);
    assert.equal(empressementDim.min, 0);
    assert.equal(empressementDim.max, 4);
  });
});
