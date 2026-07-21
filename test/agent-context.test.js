'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('Agent card context availability', () => {
  let Agent;
  let AgentUI;

  before(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    delete global.AgentUI;
    delete global.PriorityUI;
    global.PriorityUI = {
      createCollapsibleEnableChrome() {
        return { head: global.document.createElement('div'), label: null };
      },
      getMemberRoleCatalog() {
        return [{ id: 'montage', label: 'Montage' }];
      },
      axisWord(axis, n) {
        return String(axis) + ':' + n;
      }
    };
    loadComponent('agent/agent.js');
    loadComponent('agent/agent-ui.js');
    Agent = global.PriorityAgent;
    AgentUI = global.AgentUI;
    assert.ok(Agent);
    assert.ok(AgentUI);
    assert.ok(Array.isArray(Agent.BUILD_CONTEXT_GETTERS));
    assert.ok(Agent.BUILD_CONTEXT_GETTERS.length >= 15);
  });

  it('buildContext includes Trello labels from bridge.getCardLabels', () => {
    const ctx = Agent.buildContext({
      getCardLabels() {
        return [
          { id: 'lab1', name: 'Urgent', color: 'red' },
          { id: 'lab2', name: 'Backend', color: 'blue' }
        ];
      },
      getBoardLabels() {
        return [
          { id: 'lab1', name: 'Urgent', color: 'red' },
          { id: 'lab2', name: 'Backend', color: 'blue' },
          { id: 'lab3', name: 'Nice', color: 'green' }
        ];
      }
    });
    assert.ok(Array.isArray(ctx.labels));
    assert.equal(ctx.labels.length, 2);
    assert.equal(ctx.labels[0].name, 'Urgent');
    assert.ok(Array.isArray(ctx.boardLabels));
    assert.equal(ctx.boardLabels.length, 3);
  });

  it('buildContext omits labels when bridge helper is missing', () => {
    const ctx = Agent.buildContext({
      getCardName() {
        return 'Sans labels bridge';
      }
    });
    assert.equal(ctx.labels, undefined);
    assert.equal(ctx.boardLabels, undefined);
  });

  it('AgentUI forwards every BUILD_CONTEXT_GETTER from mount options', () => {
    const options = {};
    Agent.BUILD_CONTEXT_GETTERS.forEach((name) => {
      options[name] = function stub() {
        return name;
      };
    });
    // Also forward documented mutators / loaders used by executeActions.
    AgentUI.OPTIONAL_BRIDGE_FNS.forEach((name) => {
      if (typeof options[name] !== 'function') {
        options[name] = function stub() {
          return Promise.resolve({ ok: true });
        };
      }
    });
    options.onLayoutChange = function () {};
    options.applyPeople = function () {};

    const bridge = AgentUI.attachOptionalBridgeFns({}, options);

    Agent.BUILD_CONTEXT_GETTERS.forEach((name) => {
      assert.equal(
        typeof bridge[name],
        'function',
        'missing context getter on bridge: ' + name
      );
    });
    assert.equal(
      typeof bridge.onLayoutChange,
      'undefined',
      'UI-only onLayoutChange must not land on bridge'
    );
    assert.equal(
      typeof bridge.applyPeople,
      'undefined',
      'applyPeople stays options-only'
    );
    assert.equal(typeof bridge.addLabel, 'function');
    assert.equal(typeof bridge.loadCardMembers, 'function');
  });

  it('buildContext fills the full card snapshot from a complete bridge', () => {
    const ctx = Agent.buildContext({
      getScope() {
        return 'task';
      },
      getCardName() {
        return 'Carte demo';
      },
      getCardDesc() {
        return 'Description';
      },
      getFormulaKey() {
        return 'baseline';
      },
      getProfile() {
        return { displayName: 'Alex', language: 'fr', dialect: 'qc', tone: 'concise' };
      },
      getPeople() {
        return { version: 1, people: [{ id: 'p1', name: 'Pat' }], updatedAt: '' };
      },
      getCustomAssigneeCatalog() {
        return [{ id: 'person-1', name: 'Hors' }];
      },
      getMemory() {
        return {
          version: 1,
          summary: 'sum',
          facts: ['f1'],
          longTerm: {},
          shortTerm: {},
          onboardingComplete: true
        };
      },
      getCardMemory() {
        return { facts: ['card-fact'] };
      },
      getBoardDigest() {
        return 'digest';
      },
      getStatut() {
        return {
          listId: 'L1',
          listName: 'En cours',
          category: 'started',
          lists: [{ id: 'L1', name: 'En cours', category: 'started' }],
          roleLists: {}
        };
      },
      getOwnership() {
        return {
          members: [{ id: 'm1', fullName: 'Alex' }],
          you: { id: 'm1', fullName: 'Alex' },
          youAssigned: true,
          assigneeCount: 1,
          unassigned: false
        };
      },
      getCardLabels() {
        return [{ id: 'lab1', name: 'Urgent', color: 'red' }];
      },
      getBoardMembers() {
        return [{ id: 'm1', fullName: 'Alex', username: 'alex' }];
      },
      getBoardLabels() {
        return [{ id: 'lab1', name: 'Urgent', color: 'red' }];
      },
      getPriorityState() {
        return {
          priorityEnabled: true,
          urgency: 3,
          impact: 2,
          ease: 4,
          taskTypes: ['action'],
          customAssignees: [{ id: 'person-1', name: 'Hors' }],
          memberRoles: { m1: 'montage' }
        };
      },
      getHistory() {
        return { canUndo: true, canRedo: false, entries: [{ id: 'h1', label: 'Edit' }] };
      },
      getGoals() {
        return {
          projectId: 'proj1',
          projects: [{ id: 'proj1', name: 'Projet A' }]
        };
      },
      getCompletion() {
        return {
          progressEnabled: true,
          items: [{ id: 'i1', text: 'Faire', progress: 0, weight: 1 }]
        };
      }
    });

    assert.equal(ctx.cardName, 'Carte demo');
    assert.equal(ctx.cardDesc, 'Description');
    assert.ok(ctx.profile);
    assert.ok(Array.isArray(ctx.people) || (ctx.people && ctx.people.length >= 0));
    assert.equal(ctx.customAssigneeCatalog[0].name, 'Hors');
    assert.ok(ctx.memory);
    assert.ok(ctx.cardMemory);
    assert.equal(ctx.boardDigest, 'digest');
    assert.equal(ctx.statut.category, 'started');
    assert.equal(ctx.ownership.youAssigned, true);
    assert.equal(ctx.labels[0].name, 'Urgent');
    assert.equal(ctx.boardMembers[0].fullName, 'Alex');
    assert.equal(ctx.boardLabels[0].name, 'Urgent');
    assert.ok(ctx.priority && ctx.priority.enabled);
    assert.equal(ctx.customAssignees[0].name, 'Hors');
    assert.ok(ctx.history && ctx.history.canUndo);
    assert.equal(ctx.goals.projectId, 'proj1');
    assert.ok(ctx.progress);
  });

  it('hydrateBridgeCaches calls force loaders in parallel', async () => {
    const calls = [];
    await AgentUI.hydrateBridgeCaches({
      loadCardLabels(opts) {
        calls.push(['labels', opts && opts.force]);
        return Promise.resolve([]);
      },
      loadBoardLabels(opts) {
        calls.push(['boardLabels', opts && opts.force]);
        return Promise.resolve([]);
      },
      loadCardMembers(opts) {
        calls.push(['cardMembers', opts && opts.force]);
        return Promise.resolve([]);
      },
      loadBoardMembers(opts) {
        calls.push(['boardMembers', opts && opts.force]);
        return Promise.resolve([]);
      }
    });
    assert.deepEqual(
      calls.sort((a, b) => a[0].localeCompare(b[0])),
      [
        ['boardLabels', true],
        ['boardMembers', true],
        ['cardMembers', true],
        ['labels', true]
      ]
    );
  });
});
