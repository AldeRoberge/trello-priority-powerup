'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Agent checklist, people, roles, history', () => {
  var Agent;
  var CT;
  var PU;

  before(() => {
    loadComponent('priority/priority-matrix.js');
    loadComponent('priority/priority-ui.js');
    loadComponent('completion/completion-trello.js');
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    CT = global.CompletionTrello;
    PU = global.PriorityUI;
    assert.ok(Agent);
    assert.ok(CT);
    assert.ok(PU);
  });

  it('resolveMemberRoleId maps labels and ids', () => {
    assert.equal(Agent.resolveMemberRoleId('subtitles'), 'subtitles');
    assert.equal(Agent.resolveMemberRoleId('Sous-titres'), 'subtitles');
    assert.equal(Agent.resolveMemberRoleId('Montage'), 'editing');
    assert.equal(Agent.resolveMemberRoleId('zzz'), '');
  });

  it('set_custom_assignees adds a person', async () => {
    var state = { customAssignees: [] };
    var bridge = {
      getPriorityState: function () {
        return Object.assign({}, state);
      },
      applyPriority: function (partial) {
        Object.assign(state, partial || {});
      },
      setCustomAssignees: function (list) {
        state.customAssignees = list;
        return { ok: true };
      },
    };
    var result = await Agent.executeAction(bridge, {
      tool: 'set_custom_assignees',
      args: { add: ['Sam Freelance'] },
    });
    assert.equal(result.ok, true);
    assert.equal(state.customAssignees.length, 1);
    assert.equal(state.customAssignees[0].name, 'Sam Freelance');
  });

  it('set_member_roles assigns Montage to a member', async () => {
    var state = { memberRoles: {}, customAssignees: [] };
    var bridge = {
      getPriorityState: function () {
        return Object.assign({}, state);
      },
      applyPriority: function () {},
      getBoardMembers: function () {
        return [{ id: 'm1', fullName: 'Alice Dupont', username: 'alice' }];
      },
      getOwnership: function () {
        return { members: [{ id: 'm1', fullName: 'Alice Dupont', username: 'alice' }] };
      },
      setMemberRoles: function (map) {
        state.memberRoles = map;
        return { ok: true };
      },
    };
    var result = await Agent.executeAction(bridge, {
      tool: 'set_member_roles',
      args: { matchText: 'Alice', roles: ['Montage', 'Sous-titres'] },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(state.memberRoles.m1, ['editing', 'subtitles']);
  });

  it('add_checklist_item nests under a local subtask', async () => {
    var completion = CT.normalizeCompletionData({
      items: [{ id: 'p1', text: 'Valider le devis', progress: 0 }],
    });
    var bridge = {
      getCompletion: function () {
        return JSON.parse(JSON.stringify(completion));
      },
      applyCompletion: function (next) {
        completion = JSON.parse(JSON.stringify(next));
      },
    };
    var result = await Agent.executeAction(bridge, {
      tool: 'add_checklist_item',
      args: { parentMatchText: 'Valider le devis', text: 'Relire les chiffres' },
    });
    assert.equal(result.ok, true);
    assert.ok(completion.items[0].items);
    assert.equal(completion.items[0].items.length, 1);
    assert.equal(completion.items[0].items[0].text, 'Relire les chiffres');
  });

  it('set_checklist_progress updates nested item', async () => {
    var completion = CT.normalizeCompletionData({
      items: [
        {
          id: 'p1',
          text: 'Parent',
          progress: 0,
          items: [{ id: 'c1', text: 'Enfant', progress: 0 }],
        },
      ],
    });
    var bridge = {
      getCompletion: function () {
        return JSON.parse(JSON.stringify(completion));
      },
      applyCompletion: function (next) {
        completion = JSON.parse(JSON.stringify(next));
      },
    };
    var result = await Agent.executeAction(bridge, {
      tool: 'set_checklist_progress',
      args: {
        parentMatchText: 'Parent',
        matchText: 'Enfant',
        progress: 100,
      },
    });
    assert.equal(result.ok, true);
    assert.equal(completion.items[0].items[0].progress, 100);
    assert.equal(completion.items[0].items[0].done, true);
  });

  it('history_undo calls bridge', async () => {
    var undone = false;
    var bridge = {
      historyUndo: function () {
        undone = true;
        return { ok: true };
      },
    };
    var result = await Agent.executeAction(bridge, {
      tool: 'history_undo',
      args: {},
    });
    assert.equal(result.ok, true);
    assert.equal(undone, true);
  });

  it('history_revert matches label from getHistory', async () => {
    var revertedId = null;
    var bridge = {
      getHistory: function () {
        return {
          canUndo: true,
          canRedo: false,
          entries: [
            { id: 'e1', label: 'Priorité mise à jour', undone: false },
            { id: 'e2', label: 'Progrès modifié', undone: false },
          ],
        };
      },
      historyRevert: function (id) {
        revertedId = id;
        return { before: {} };
      },
    };
    var result = await Agent.executeAction(bridge, {
      tool: 'history_revert',
      args: { matchLabel: 'Priorité' },
    });
    assert.equal(result.ok, true);
    assert.equal(revertedId, 'e1');
  });
});
