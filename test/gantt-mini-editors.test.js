'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Gantt mini editors', () => {
  let PriorityUI;
  let PriorityTrello;
  let CompletionUI;
  let CompletionTrello;

  before(() => {
    loadComponent('priority/priority-matrix.js');
    loadComponent('priority/priority-ui.js');
    loadComponent('priority/priority-trello.js');
    loadComponent('completion/completion-trello.js');
    loadComponent('completion/completion-ui.js');
    PriorityUI = global.PriorityUI;
    PriorityTrello = global.PriorityTrello;
    CompletionUI = global.CompletionUI;
    CompletionTrello = global.CompletionTrello;
    assert.ok(PriorityUI);
    assert.ok(PriorityTrello);
    assert.ok(CompletionUI);
    assert.ok(CompletionTrello);
  });

  it('exports mountMiniPriority / mountMiniDue / mountMiniBlocked / mountMiniProgress', () => {
    assert.equal(typeof PriorityUI.mountMiniPriority, 'function');
    assert.equal(typeof PriorityUI.mountMiniDue, 'function');
    assert.equal(typeof PriorityUI.mountMiniBlocked, 'function');
    assert.equal(typeof CompletionUI.mountMiniProgress, 'function');
    assert.equal(typeof PriorityTrello.saveCardInputsById, 'function');
  });

  it('mountMiniProgress returns progress API and applyMasterProgress path', () => {
    const host = document.createElement('div');
    const api = CompletionUI.mountMiniProgress(host, {
      data: { items: [], progress: 20 },
    });
    assert.equal(api.getProgress(), 20);
    api.setData({
      items: [
        { id: 'a', text: 'One', progress: 0 },
        { id: 'b', text: 'Two', progress: 0 },
      ],
    });
    assert.equal(api.getProgress(), 0);
    const data = api.getData();
    assert.equal(data.items.length, 2);
    api.destroy();
  });

  it('saveCardInputsById merges urgency and preserves sidecars', async () => {
    const store = Object.create(null);
    const t = {
      get: async function (scope, visibility, key) {
        assert.equal(visibility, 'shared');
        return store[scope + ':' + key] || null;
      },
      set: async function (scope, visibility, key, value) {
        assert.equal(visibility, 'shared');
        store[scope + ':' + key] = value;
      },
    };
    store['card1:cardPriority'] = {
      urgency: 1,
      impact: 2,
      ease: 3,
      dueDate: '2030-06-01',
      enAttente: true,
      blockedReasons: ['Attente'],
    };
    const next = await PriorityTrello.saveCardInputsById(t, 'card1', {
      urgency: 4,
      impact: 3,
      ease: 2,
    });
    assert.equal(next.urgency, 4);
    assert.equal(next.impact, 3);
    assert.equal(next.ease, 2);
    assert.equal(next.dueDate, '2030-06-01');
    assert.equal(next.enAttente, true);
  });

  it('saveCardInputsById clears due when dueDate is empty', async () => {
    const store = Object.create(null);
    const t = {
      get: async function (scope, visibility, key) {
        return store[scope + ':' + key] || null;
      },
      set: async function (scope, visibility, key, value) {
        store[scope + ':' + key] = value;
      },
    };
    store['card2:cardPriority'] = {
      urgency: 2,
      impact: 2,
      ease: 3,
      dueDate: '2030-06-01',
      dueTime: '10:00',
    };
    const next = await PriorityTrello.saveCardInputsById(t, 'card2', {
      dueDate: '',
      dueTime: '',
    });
    assert.ok(!next.dueDate);
    assert.ok(!next.dueTime);
  });

  it('saveCardInputsById stores a place without dropping the score', async () => {
    const store = Object.create(null);
    const t = {
      get: async function (scope, visibility, key) {
        return store[scope + ':' + key] || null;
      },
      set: async function (scope, visibility, key, value) {
        store[scope + ':' + key] = value;
      },
    };
    store['card3:cardPriority'] = { urgency: 2, impact: 4, ease: 3, axesScaledTo10: true };
    const next = await PriorityTrello.saveCardInputsById(t, 'card3', {
      places: { at: { id: 'place-home-ab12', name: 'Home' } },
    });
    assert.equal(next.impact, 4);
    assert.equal(next.places.at.name, 'Home');
  });

  it('clicking Imp snaps to the Importante preset, even inside that band', () => {
    const dim = PriorityTrello.PRIORITY_DIMENSIONS.find((d) => d.key === 'empressement');
    assert.equal(PriorityUI.sliderAxisValue(dim, 'assez-vite'), 2);
    const delta = PriorityUI.heatSegmentDelta(
      { impact: 4, ease: 6, empressement: 'assez-vite' },
      5,
      PriorityUI.FORMULAS.baseline.override
    );
    assert.equal(delta.impact, 5);
    assert.equal(delta.ease, 5);
    assert.equal(delta.empressement, 0);
    const inBand = PriorityUI.heatSegmentDelta(
      { impact: 4, ease: 6, empressement: 0 },
      5,
      PriorityUI.FORMULAS.baseline.override
    );
    assert.equal(inBand.impact, 5);
    assert.equal(inBand.ease, 5);
  });

  it('saveCardInputsById keeps empressement 0 as aucun', async () => {
    const store = Object.create(null);
    const t = {
      get: async function (scope, visibility, key) {
        return store[scope + ':' + key] || null;
      },
      set: async function (scope, visibility, key, value) {
        store[scope + ':' + key] = value;
      },
    };
    store['card4:cardPriority'] = {
      impact: 5,
      ease: 5,
      empressement: 'assez-vite',
      axesScaledTo10: true,
    };
    const next = await PriorityTrello.saveCardInputsById(t, 'card4', {
      impact: 5,
      ease: 5,
      empressement: 0,
    });
    assert.equal(next.empressement, 'aucun');
  });
});
