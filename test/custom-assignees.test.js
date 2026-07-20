'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('custom assignees', () => {
  let PriorityUI;
  let PriorityTrello;

  before(() => {
    clearComponentCache();
    loadComponent('priority/priority-ui.js');
    loadComponent('priority/priority-trello.js');
    PriorityUI = global.PriorityUI;
    PriorityTrello = global.PriorityTrello;
    assert.ok(PriorityUI);
    assert.ok(PriorityTrello);
  });

  it('creates person-* ids with optional Trello link', () => {
    const draft = PriorityUI.createCustomAssignee({
      name: 'Alex Freelance',
      trelloMemberId: 'trello-abc',
    });
    assert.ok(draft);
    assert.ok(PriorityUI.isCustomAssigneeId(draft.id));
    assert.equal(draft.name, 'Alex Freelance');
    assert.equal(draft.trelloMemberId, 'trello-abc');
  });

  it('normalizes and dedupes custom assignees by name', () => {
    const list = PriorityUI.normalizeCustomAssignees([
      { id: 'person-alex-ab12', name: 'Alex' },
      { id: 'person-alex-cd34', name: 'alex' },
      { id: 'person-sam-ef56', name: 'Sam', trelloMemberId: 'm1' },
      { name: '' },
    ]);
    assert.equal(list.length, 2);
    assert.equal(list[0].name, 'Alex');
    assert.equal(list[1].name, 'Sam');
    assert.equal(list[1].trelloMemberId, 'm1');
  });

  it('merges Trello members with custom people for display', () => {
    const display = PriorityUI.mergeAssigneesForDisplay(
      [{ id: 'm1', fullName: 'Moi', initials: 'MO' }],
      [{ id: 'person-client-ab12', name: 'Client X', trelloMemberId: 'm2' }],
      [
        { id: 'm2', fullName: 'Pat', avatarUrl: 'https://example.com/p.png' },
      ]
    );
    assert.equal(display.length, 2);
    assert.equal(display[0].id, 'm1');
    assert.equal(display[1].id, 'person-client-ab12');
    assert.equal(display[1].custom, true);
    assert.equal(display[1].avatarUrl, 'https://example.com/p.png');
  });

  it('lets custom people hold memberRoles like Trello members', () => {
    const draft = PriorityUI.createCustomAssignee({ name: 'Voice talent' });
    const map = PriorityUI.normalizeMemberRoles({
      [draft.id]: ['editing', 'music'],
    });
    assert.deepEqual(map[draft.id], ['editing', 'music']);
  });

  it('normalizeInputs persists customAssignees', () => {
    const normalized = PriorityTrello.normalizeInputs({
      urgency: 2,
      impact: 2,
      ease: 3,
      customAssignees: [
        { id: 'person-jane-ab12', name: 'Jane', trelloMemberId: 'x' },
      ],
    });
    assert.equal(normalized.customAssignees.length, 1);
    assert.equal(normalized.customAssignees[0].name, 'Jane');
    assert.equal(normalized.customAssignees[0].trelloMemberId, 'x');
  });
});
