'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Blocked subtask blocks its parent', () => {
  let CT;

  before(() => {
    loadComponent('completion/completion-trello.js');
    CT = global.CompletionTrello;
    assert.ok(CT);
  });

  it('marks the parent blocked when a subtask is paused', () => {
    const data = { items: [{ id: 'a', text: 'Attendre Maxime', progress: 0 }] };
    const next = CT.setItemBlocked(data, 'a', true);
    assert.equal(CT.hasAnyBlocked(next), true);
    assert.equal(CT.isItemBlocked(next.items[0]), true);
  });

  it('clears the parent block when the last paused subtask is unpaused', () => {
    const data = { items: [{ id: 'a', text: 'Attendre Maxime', progress: 0 }] };
    const paused = CT.setItemBlocked(data, 'a', true);
    const resumed = CT.setItemBlocked(paused, 'a', false);
    assert.equal(CT.hasAnyBlocked(resumed), false);
  });
});
