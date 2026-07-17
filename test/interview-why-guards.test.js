'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Interview motivation WHY guards', () => {
  let Agent;

  before(() => {
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    assert.ok(Agent);
    assert.equal(typeof Agent.applyInterviewWhyGuards, 'function');
  });

  it('looksLikeMotivationWhyAsk catches nested cost why, not progress why', () => {
    assert.equal(
      Agent.looksLikeMotivationWhyAsk(
        'Pourquoi tu veux faire ce nettoyage de GitHub LFS?'
      ),
      true
    );
    assert.equal(
      Agent.looksLikeMotivationWhyAsk(
        'Pourquoi tu veux éviter ces coûts supplémentaires?'
      ),
      true
    );
    assert.equal(
      Agent.looksLikeMotivationWhyAsk("Pourquoi ça n'a pas été commencé?"),
      false
    );
    assert.equal(
      Agent.looksLikeMotivationWhyAsk('Si on ne le fait pas, c\'est grave?'),
      false
    );
  });

  it('isUniversalMotiveText recognizes cost / time / efficiency motives', () => {
    assert.equal(
      Agent.isUniversalMotiveText('Éviter les coûts supplémentaires'),
      true
    );
    assert.equal(Agent.isUniversalMotiveText('Économiser du temps'), true);
    assert.equal(Agent.isUniversalMotiveText('Être plus efficace'), true);
    assert.equal(
      Agent.isUniversalMotiveText('Aligner les messages entre services'),
      false
    );
  });

  it('blocks any motivation POURQUOI including the opening ask', () => {
    var turn = {
      message: 'Pourquoi tu veux faire ce nettoyage de GitHub LFS?',
      suggestions: ['Éviter les coûts', 'Libérer de l\'espace']
    };
    var guarded = Agent.applyInterviewWhyGuards(
      turn,
      { interview: { asked: [], priorityAxesTrusted: false } },
      []
    );
    assert.notEqual(
      guarded.message,
      'Pourquoi tu veux faire ce nettoyage de GitHub LFS?'
    );
    assert.equal(Agent.looksLikeMotivationWhyAsk(guarded.message), false);
  });

  it('blocks nested re-POURQUOI after a prior ask', () => {
    var history = [
      {
        role: 'assistant',
        content: 'Pourquoi tu veux faire ce nettoyage de GitHub LFS?'
      },
      { role: 'user', content: 'Éviter les coûts supplémentaires' }
    ];
    var guarded = Agent.applyInterviewWhyGuards(
      {
        message: 'Pourquoi tu veux éviter ces coûts supplémentaires?',
        suggestions: ['Parce que c\'est cher', 'Parce que LFS'],
        suggestionsMulti: true
      },
      { interview: { asked: [], priorityAxesTrusted: false } },
      history
    );
    assert.notEqual(
      guarded.message,
      'Pourquoi tu veux éviter ces coûts supplémentaires?'
    );
    assert.equal(Agent.looksLikeMotivationWhyAsk(guarded.message), false);
  });

  it('blocks re-POURQUOI when cardMemory already has Pourquoi', () => {
    var guarded = Agent.applyInterviewWhyGuards(
      {
        message: 'Pourquoi tu veux ce plan?',
        suggestions: ['Oui', 'Non']
      },
      {
        cardMemory: { facts: [{ text: 'Pourquoi : éviter les coûts LFS' }] },
        interview: { asked: [], priorityAxesTrusted: false }
      },
      []
    );
    assert.notEqual(guarded.message, 'Pourquoi tu veux ce plan?');
  });

  it('allows progress why after motivation why', () => {
    var history = [
      {
        role: 'assistant',
        content: 'Pourquoi tu veux faire ce nettoyage?'
      },
      { role: 'user', content: 'Éviter les coûts' }
    ];
    var turn = {
      message: "Pourquoi ça n'a pas été commencé?",
      suggestions: ["J'attends une info", "Pas eu le temps"]
    };
    var guarded = Agent.applyInterviewWhyGuards(
      turn,
      { interview: { asked: [], priorityAxesTrusted: false } },
      history
    );
    assert.equal(guarded.message, "Pourquoi ça n'a pas été commencé?");
  });
});
