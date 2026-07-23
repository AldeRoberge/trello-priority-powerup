'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('PriorityMatrix', () => {
  let PriorityMatrix;
  const tier = { label: 'Importante', description: 'tier desc' };

  before(() => {
    loadComponent('priority/priority-matrix.js');
    PriorityMatrix = global.PriorityMatrix;
    assert.ok(PriorityMatrix);
  });

  // Impact / Facilité are on the 0–10 scale post-adaptation; Urgence stays 0–4.
  it('resolves well-known matrix labels', () => {
    const cases = [
      [{ ease: 9, impact: 9, urgency: 4 }, 'Opportunité massive'],
      [{ ease: 1, impact: 0, urgency: 4 }, 'Corvée express'],
      [{ ease: 9, impact: 7, urgency: 1 }, 'Victoire rapide'],
      [{ ease: 1, impact: 9, urgency: 4 }, 'Chemin critique'],
      [{ ease: 5, impact: 9, urgency: 4 }, 'Accélérateur'],
      [{ ease: 9, impact: 5, urgency: 4 }, 'Coup de pouce'],
      [{ ease: 5, impact: 5, urgency: 2 }, 'À arbitrer'],
      [{ ease: 5, impact: 5, urgency: 1 }, 'Piste exploratoire'],
      [{ ease: 5, impact: 5, urgency: 4 }, 'Pression modérée'],
      [{ ease: 3, impact: 5, urgency: 4 }, 'Échéance serrée'],
    ];
    for (const [inputs, expected] of cases) {
      const r = PriorityMatrix.resolveLabel(inputs, { tier });
      assert.equal(r.label, expected, `${expected} for ${JSON.stringify(inputs)}`);
    }
  });

  it('falls back to tier when no rule matches', () => {
    const sparseCtx = {
      tier,
      rules: PriorityMatrix.RULES.filter((r) => r.id === 'backlog-filler'),
    };
    const fallback = PriorityMatrix.resolveLabel(
      { ease: 5, impact: 5, urgency: 2 },
      sparseCtx
    );
    assert.equal(fallback.fromMatrix, false);
    assert.equal(fallback.label, tier.label);
  });

  it('honors disabled matrix (tier labels only)', () => {
    const disabledCtx = PriorityMatrix.buildResolveContext({ enabled: false }, tier);
    const result = PriorityMatrix.resolveLabel(
      { ease: 9, impact: 9, urgency: 4 },
      disabledCtx
    );
    assert.equal(result.matrixDisabled, true);
    assert.equal(result.fromMatrix, false);
  });

  it('applies custom label overrides', () => {
    const customCtx = PriorityMatrix.buildResolveContext({
      overrides: { 'massive-opportunity': { label: 'Jackpot' } },
    });
    const customResult = PriorityMatrix.resolveLabel(
      { ease: 9, impact: 9, urgency: 4 },
      customCtx
    );
    assert.equal(customResult.label, 'Jackpot');
  });

  it('createConfig and resetToDefaults restore defaults', () => {
    const cfg = PriorityMatrix.createConfig({
      enabled: false,
      overrides: { 'quick-win': { label: 'Victoire rapide' } },
    });
    assert.equal(cfg.enabled, false);
    cfg.resetToDefaults();
    assert.equal(cfg.enabled, true);

    const reset = PriorityMatrix.resetToDefaults();
    assert.equal(reset.enabled, true);
    assert.equal(Object.keys(reset.overrides).length, 0);
  });
});
