'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('AssistantDock.outcome', () => {
  let outcome;
  before(() => {
    loadComponent('shared/assistant-dock.js');
    outcome = global.AssistantDock.outcome;
    assert.equal(typeof outcome, 'function');
  });

  const made = { id: 'c9', title: 'Libérer de l’espace', list: 'Inbox', text: 'tâche « Libérer de l’espace » créée dans « Inbox »' };

  it('opens a task panel for a created task instead of a line', () => {
    const out = outcome({ message: '', applied: [made.text], failed: [], created: [made] }, true);
    assert.equal(out.text, '');
    assert.deepEqual(out.created, [made]);
    assert.equal(out.kind, 'ai');
  });

  it('keeps the line when the page has no task panel', () => {
    const out = outcome({ message: '', applied: [made.text], failed: [], created: [made] }, false);
    assert.equal(out.text, made.text);
    assert.deepEqual(out.created, []);
  });

  it('keeps the line for a created task that has no card id', () => {
    const noId = { id: '', title: 'x', list: 'Inbox', text: 'tâche « x » créée dans « Inbox »' };
    const out = outcome({ message: '', applied: [noId.text], failed: [], created: [noId] }, true);
    assert.equal(out.text, noId.text);
    assert.deepEqual(out.created, []);
  });

  it('still says what else was done next to the created task', () => {
    const out = outcome({ message: 'ok', applied: ['déplacée dans « En cours »', made.text], failed: [], created: [made] }, true);
    assert.equal(out.text, 'déplacée dans « En cours »');
    assert.equal(out.created.length, 1);
  });

  it('lists each created task and reports a failure beside them', () => {
    const second = { id: 'c10', title: 'B', list: 'Inbox', text: 'tâche « B » créée dans « Inbox »' };
    const out = outcome({ message: '', applied: [made.text, second.text], failed: ['pièce jointe « a.png »'], created: [made, second] }, true);
    assert.equal(out.text, 'Échec : pièce jointe « a.png »');
    assert.equal(out.kind, 'ai', 'something was applied');
    assert.deepEqual(out.created.map((c) => c.id), ['c9', 'c10']);
  });

  it('falls back to the model message, then to “Rien à faire.”', () => {
    assert.equal(outcome({ message: 'Dis-moi ce qu’il faut changer.', applied: [], failed: [], created: [] }, true).text, 'Dis-moi ce qu’il faut changer.');
    assert.equal(outcome({ message: '', applied: [], failed: [] }, true).text, 'Rien à faire.');
  });

  it('is an error only when nothing was applied and something failed', () => {
    assert.equal(outcome({ message: '', applied: [], failed: ['boom'], created: [] }, true).kind, 'error');
    assert.equal(outcome({ message: '', applied: ['x'], failed: ['boom'], created: [] }, true).kind, 'ai');
  });
});
