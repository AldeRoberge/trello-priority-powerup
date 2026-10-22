'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('suggestion chips follow phrase highlights', () => {
  let Agent;

  beforeEach(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    Agent = loadComponent('agent/agent.js').PriorityAgent;
  });

  it('paints each choice with the highlight it echoes, including mon/ton', () => {
    const message =
      'Okay. On passe en français. Tu veux [[g:quelque chose de doux]], [[y:un mini reset]], ou [[r:juste vider ton sac]] ?';
    const linked = Agent.normalizeSuggestionEntries(
      [
        { label: 'Quelque chose de doux' },
        { label: 'Un mini reset' },
        { label: 'Juste vider mon sac' }
      ],
      4,
      { rankGreenToRed: true, message: message }
    );
    const byText = {};
    linked.forEach(function (entry) {
      byText[entry.text] = entry.hl;
    });
    assert.equal(byText['Quelque chose de doux'], 'g');
    assert.equal(byText['Un mini reset'], 'y');
    assert.equal(byText['Juste vider mon sac'], 'r');
  });

  it('leaves an unrelated chip uncolored', () => {
    const linked = Agent.linkSuggestionColorsToHighlights(
      [
        { text: 'Quelque chose de doux', heat: null },
        { text: 'Autre chose', heat: null }
      ],
      'Tu veux [[g:quelque chose de doux]] ou [[r:juste vider ton sac]] ?'
    );
    assert.equal(linked[0].hl, 'g');
    assert.equal(linked[1].hl, undefined);
  });

  it('keeps blue and teal reach chips off the highlight wash', () => {
    const linked = Agent.linkSuggestionColorsToHighlights(
      [{ text: 'Équipe', heat: null, color: 'teal' }],
      'Portée [[y:Équipe]] ?'
    );
    assert.equal(linked[0].hl, undefined);
    assert.equal(linked[0].color, 'teal');
  });
});
