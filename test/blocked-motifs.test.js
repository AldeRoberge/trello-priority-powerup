'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('Dual blocked Motifs', () => {
  let Agent;
  let CT;

  before(() => {
    clearComponentCache();
    loadComponent('agent/agent.js');
    loadComponent('completion/completion-trello.js');
    Agent = global.PriorityAgent;
    CT = global.CompletionTrello;
    assert.ok(Agent);
    assert.ok(CT);
  });

  it('exports pair helpers', () => {
    assert.equal(typeof Agent.fallbackBlockedReasonPair, 'function');
    assert.equal(typeof Agent.suggestBlockedReasonPair, 'function');
    assert.equal(typeof Agent.isPureWaitingOnTaskReason, 'function');
  });

  it('isPureWaitingOnTaskReason detects self-referential Motifs only', () => {
    assert.equal(
      Agent.isPureWaitingOnTaskReason(
        'En attente de tester en mode portrait',
        'Tester en mode portrait'
      ),
      true
    );
    assert.equal(
      Agent.isPureWaitingOnTaskReason(
        'En attente du trépied pour tester en mode portrait',
        'Tester en mode portrait'
      ),
      false
    );
  });

  it('fallbackBlockedReasonPair splits WHY into distinct Motifs', () => {
    const pair = Agent.fallbackBlockedReasonPair({
      subtaskTitle: 'Tester en mode portrait',
      why: 'Il faut le trépied',
    });
    assert.ok(pair.subtaskReason);
    assert.ok(pair.cardReason);
    assert.equal(
      Agent.isPureWaitingOnTaskReason(
        pair.subtaskReason,
        'Tester en mode portrait'
      ),
      false
    );
    assert.match(pair.subtaskReason, /tr[eé]pied/i);
    assert.match(pair.cardReason, /tr[eé]pied/i);
    assert.match(pair.cardReason, /portrait/i);
    assert.notEqual(
      pair.subtaskReason.toLocaleLowerCase('fr-FR'),
      pair.cardReason.toLocaleLowerCase('fr-FR')
    );
  });

  it('fallbackBlockedReasonPair with no WHY keeps card provisional only', () => {
    const pair = Agent.fallbackBlockedReasonPair({
      subtaskTitle: 'Tester en mode portrait',
      why: '',
    });
    assert.equal(pair.subtaskReason, '');
    assert.equal(
      Agent.isPureWaitingOnTaskReason(
        pair.cardReason,
        'Tester en mode portrait'
      ),
      true
    );
  });

  it('seedBlockedReasonsFromPriority skips pure waiting-on-[item] Motifs', () => {
    const data = CT.normalizeCompletionData({
      items: [
        {
          id: 's1',
          text: 'Tester en mode portrait',
          progress: 0,
          blocked: true,
        },
      ],
    });
    const seeded = CT.seedBlockedReasonsFromPriority(data, [
      'En attente de tester en mode portrait',
    ]);
    const item = seeded.items[0];
    assert.equal(item.blocked, true);
    assert.ok(
      !item.blockedReasons || item.blockedReasons.length === 0,
      'provisional must stay card-only'
    );
  });

  it('seedBlockedReasonsFromPriority still writes a real WHY onto the item', () => {
    const data = CT.normalizeCompletionData({
      items: [
        {
          id: 's1',
          text: 'Tester en mode portrait',
          progress: 0,
          blocked: true,
        },
      ],
    });
    const seeded = CT.seedBlockedReasonsFromPriority(data, [
      'En attente de tester en mode portrait',
      "En attente d'avoir le trépied",
    ]);
    assert.deepEqual(seeded.items[0].blockedReasons, [
      "En attente d'avoir le trépied",
    ]);
  });

  it('aggregateBlockedReasons stays empty when item Motifs are empty', () => {
    const data = CT.normalizeCompletionData({
      items: [
        {
          id: 's1',
          text: 'Tester en mode portrait',
          progress: 0,
          blocked: true,
        },
      ],
    });
    assert.deepEqual(CT.aggregateBlockedReasons(data), []);
  });
});
