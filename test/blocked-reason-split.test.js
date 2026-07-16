'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Blocked reason split', () => {
  let Agent;

  before(() => {
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    assert.ok(Agent);
    assert.equal(typeof Agent.titleMayBeCompound, 'function');
    assert.equal(typeof Agent.normalizeSplitBlockedReasonResult, 'function');
    assert.equal(typeof Agent.splitBlockedReason, 'function');
  });

  it('titleMayBeCompound gates long multi-cause Motifs', () => {
    assert.equal(Agent.titleMayBeCompound("En attente d'une approbation"), false);
    assert.equal(
      Agent.titleMayBeCompound(
        "En attente de l'approbation du client; aussi, le trépied n'est pas arrivé"
      ),
      true
    );
    assert.equal(
      Agent.titleMayBeCompound(
        'Waiting on legal. Also need staging access before we can ship the build.'
      ),
      true
    );
  });

  it('normalizeSplitBlockedReasonResult accepts polished multi-reason payloads', () => {
    const original =
      "En attente de l'approbation du client; aussi, le trépied n'est pas arrivé. Also waiting on staging access.";
    const result = Agent.normalizeSplitBlockedReasonResult(
      {
        shouldSplit: true,
        reasons: [
          "En attente de l'approbation du client",
          'En attente du trépied',
          "En attente de l'accès staging",
        ],
      },
      original
    );
    assert.equal(result.shouldSplit, true);
    assert.equal(result.reasons.length, 3);
    assert.match(result.reasons[0], /approbation/i);
    assert.match(result.reasons[1], /tr[eé]pied/i);
    assert.match(result.reasons[2], /staging/i);
  });

  it('normalizeSplitBlockedReasonResult rejects single-reason and empty payloads', () => {
    assert.deepEqual(
      Agent.normalizeSplitBlockedReasonResult(
        { shouldSplit: true, reasons: ['Only one'] },
        'Only one'
      ),
      { shouldSplit: false, reasons: ['Only one'] }
    );
    assert.deepEqual(Agent.normalizeSplitBlockedReasonResult(null, 'Keep me'), {
      shouldSplit: false,
      reasons: ['Keep me'],
    });
    assert.deepEqual(
      Agent.normalizeSplitBlockedReasonResult(
        { shouldSplit: false, reasons: ['A', 'B'] },
        'A and B'
      ),
      { shouldSplit: false, reasons: ['A and B'] }
    );
  });

  it('normalizeSplitBlockedReasonResult dedupes and accepts {text}/{reason} rows', () => {
    const result = Agent.normalizeSplitBlockedReasonResult(
      {
        shouldSplit: true,
        reasons: [
          { text: 'First cause' },
          { reason: 'Second cause' },
          'First cause',
          { title: 'Third cause' },
        ],
      },
      'compound'
    );
    assert.equal(result.shouldSplit, true);
    assert.deepEqual(result.reasons, ['First cause', 'Second cause', 'Third cause']);
  });

  it('normalizeSplitBlockedReasonResult accepts tasks alias from model drift', () => {
    const result = Agent.normalizeSplitBlockedReasonResult(
      {
        shouldSplit: true,
        tasks: ['Cause A', 'Cause B'],
      },
      'A; B'
    );
    assert.equal(result.shouldSplit, true);
    assert.deepEqual(result.reasons, ['Cause A', 'Cause B']);
  });
});
