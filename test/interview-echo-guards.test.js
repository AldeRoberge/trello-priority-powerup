'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Interview title-echo confirm guards', () => {
  let Agent;

  before(() => {
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    assert.ok(Agent);
    assert.equal(typeof Agent.looksLikeTitleEchoConfirmAsk, 'function');
    assert.equal(typeof Agent.applyInterviewEchoGuards, 'function');
  });

  it('flags title paraphrase as a stupid confirmation', () => {
    assert.equal(
      Agent.looksLikeTitleEchoConfirmAsk(
        "C'est surtout pour faciliter l'accès à la bibliothèque, c'est ça?",
        "Faciliter l'accès à la bibliothèque de média"
      ),
      true
    );
    assert.equal(
      Agent.looksLikeTitleEchoConfirmAsk(
        "Ça sert à faciliter l'accès à la bibliothèque de média?",
        "Faciliter l'accès à la bibliothèque de média"
      ),
      true
    );
  });

  it('allows useful assumes that add new info', () => {
    assert.equal(
      Agent.looksLikeTitleEchoConfirmAsk(
        "C'est [[a:toi]] qui t'en occupes?",
        "Faciliter l'accès à la bibliothèque de média"
      ),
      false
    );
    assert.equal(
      Agent.looksLikeTitleEchoConfirmAsk(
        "Faut la permission de quelqu'un pour avancer?",
        "Faciliter l'accès à la bibliothèque de média"
      ),
      false
    );
    assert.equal(
      Agent.looksLikeTitleEchoConfirmAsk(
        "Si on ne facilite pas l'accès à la bibliothèque de média, c'est grave?",
        "Faciliter l'accès à la bibliothèque de média"
      ),
      false
    );
  });

  it('replaces title-echo with a non-echo pivot', () => {
    var guarded = Agent.applyInterviewEchoGuards(
      {
        message:
          "C'est surtout pour faciliter l'accès à la bibliothèque, c'est ça?",
        suggestions: ['Oui', 'Non']
      },
      {
        cardName: "Faciliter l'accès à la bibliothèque de média",
        interview: { asked: [], priorityAxesTrusted: false }
      },
      []
    );
    assert.notEqual(
      guarded.message,
      "C'est surtout pour faciliter l'accès à la bibliothèque, c'est ça?"
    );
    assert.equal(
      Agent.looksLikeTitleEchoConfirmAsk(
        guarded.message,
        "Faciliter l'accès à la bibliothèque de média"
      ),
      false
    );
  });

  it('does not re-ask urgency after a prior grave ask', () => {
    var guarded = Agent.applyInterviewEchoGuards(
      {
        message:
          "C'est surtout pour faciliter l'accès à la bibliothèque, c'est ça?",
        suggestions: ['Oui', 'Non']
      },
      {
        cardName: "Faciliter l'accès à la bibliothèque de média",
        interview: {
          asked: [
            "Si on ne facilite pas l'accès à la bibliothèque de média, c'est grave?"
          ],
          priorityAxesTrusted: false
        }
      },
      [
        {
          role: 'assistant',
          content:
            "Si on ne facilite pas l'accès à la bibliothèque de média, c'est grave?"
        },
        { role: 'user', content: 'Oui' }
      ]
    );
    assert.ok(!/c'est grave/i.test(guarded.message));
    assert.ok(
      /quand/i.test(guarded.message) || !!guarded.completeInterview
    );
  });
});
