'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Agent applied-claim detection', () => {
  let Agent;

  before(() => {
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    assert.ok(Agent);
    assert.equal(typeof Agent.looksLikeAppliedClaim, 'function');
  });

  it('looksLikeAppliedClaim catches classic tool claims', () => {
    assert.equal(Agent.looksLikeAppliedClaim('Okay, ajoutée.'), true);
    assert.equal(Agent.looksLikeAppliedClaim('Okay, bloqué sur Valider le devis.'), true);
    assert.equal(Agent.looksLikeAppliedClaim('Priorité mise à jour.'), true);
  });

  it('looksLikeAppliedClaim catches “j’ai noté / note la priorité” empty claims', () => {
    assert.equal(
      Agent.looksLikeAppliedClaim(
        "Okay, j'ai noté la priorité pour le nettoyage de Google Drive après l'ajout du disque et la réinstallation de Windows."
      ),
      true
    );
    assert.equal(Agent.looksLikeAppliedClaim("C'est noté, ça complique ta vie."), true);
    assert.equal(
      Agent.looksLikeAppliedClaim('Priorité notée pour le ménage Drive.'),
      true
    );
  });

  it('looksLikeAppliedClaim ignores plain chat and offers to note', () => {
    assert.equal(Agent.looksLikeAppliedClaim('C\'est pour quand?'), false);
    assert.equal(Agent.looksLikeAppliedClaim('Pourquoi ça n\'a pas été commencé?'), false);
    assert.equal(
      Agent.looksLikeAppliedClaim(
        'Moi je peux te noter la priorité ; le reste, c\'est plutôt une conversation avec la compta.'
      ),
      false
    );
    assert.equal(Agent.looksLikeAppliedClaim(''), false);
  });
});
