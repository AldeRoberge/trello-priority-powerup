'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('PriorityAgent progress summary', () => {
  let Agent;

  before(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    assert.ok(Agent);
    assert.equal(typeof Agent.buildProgressSummarySnapshot, 'function');
    assert.equal(typeof Agent.buildHeuristicProgressSummary, 'function');
    assert.equal(typeof Agent.fingerprintProgressSummarySnapshot, 'function');
    assert.equal(typeof Agent.cardProgressSummaryTurn, 'function');
  });

  it('buildContext includes nested checklist items', () => {
    const ctx = Agent.buildContext({
      getCardName: () => 'Campagne lancement',
      getCompletion: () => ({
        progressEnabled: true,
        items: [
          {
            id: 'a',
            text: 'Préparer le brief',
            done: true,
            progress: 100,
            items: [
              { id: 'a1', text: 'Collecter inputs', done: true, progress: 100 },
              { id: 'a2', text: 'Rédiger draft', done: false, progress: 40 },
            ],
          },
          {
            id: 'b',
            text: 'Valider avec client',
            done: false,
            progress: 0,
            linkedCardId: 'card-99',
          },
        ],
      }),
    });
    assert.ok(ctx.progress);
    assert.equal(ctx.progress.items.length, 2);
    assert.equal(ctx.progress.items[0].items.length, 2);
    assert.equal(ctx.progress.items[0].items[1].text, 'Rédiger draft');
    assert.equal(ctx.progress.items[1].linkedCardId, 'card-99');
  });

  it('buildProgressSummarySnapshot walks tasks and checklists', () => {
    const snapshot = Agent.buildProgressSummarySnapshot({
      cardName: 'Campagne',
      progress: {
        percent: 40,
        items: [
          {
            id: 'a',
            text: 'Préparer le brief',
            done: true,
            items: [
              { text: 'Collecter inputs', done: true },
              { text: 'Rédiger draft', done: false },
            ],
          },
          {
            id: 'b',
            text: 'Valider avec client',
            done: false,
          },
        ],
      },
    });
    assert.equal(snapshot.phase, 'in_progress');
    assert.ok(snapshot.tasksTotal >= 3);
    assert.ok(snapshot.tasksOpen >= 2);
    assert.ok(snapshot.openLabels.includes('Rédiger draft'));
    assert.ok(snapshot.openLabels.includes('Valider avec client'));
    assert.equal(snapshot.outline.length, 2);
    assert.equal(snapshot.outline[0].children.length, 2);
  });

  it('buildProgressSummarySnapshot merges linked-tree children', () => {
    const snapshot = Agent.buildProgressSummarySnapshot(
      {
        cardName: 'Parent',
        progress: {
          percent: 10,
          items: [
            {
              id: 'link-1',
              text: 'Carte liée',
              done: false,
              linkedCardId: 'c1',
            },
          ],
        },
      },
      {
        linkedTreeByItemId: {
          'link-1': {
            linkedCardId: 'c1',
            children: [
              { text: 'Sous-étape A', done: false },
              { text: 'Sous-étape B', done: true },
            ],
          },
        },
      }
    );
    assert.equal(snapshot.outline[0].linked, true);
    assert.equal(snapshot.outline[0].children.length, 2);
    assert.ok(snapshot.openLabels.includes('Sous-étape A'));
  });

  it('buildHeuristicProgressSummary synthesizes open labels', () => {
    assert.equal(
      Agent.buildHeuristicProgressSummary({
        phase: 'idle',
        tasksTotal: 0,
        tasksOpen: 0,
        progressPercent: 0,
        openLabels: [],
      }),
      'En attente'
    );
    assert.equal(
      Agent.buildHeuristicProgressSummary({
        phase: 'done',
        tasksTotal: 2,
        tasksOpen: 0,
        openLabels: [],
      }),
      'Complété'
    );
    const one = Agent.buildHeuristicProgressSummary({
      phase: 'in_progress',
      tasksTotal: 3,
      tasksOpen: 1,
      openLabels: ['Valider avec client'],
    });
    assert.match(one, /Valider avec client/);
    const two = Agent.buildHeuristicProgressSummary({
      phase: 'in_progress',
      tasksTotal: 4,
      tasksOpen: 2,
      openLabels: ['Rédiger draft', 'Valider avec client'],
    });
    assert.match(two, /Rédiger draft/);
    assert.match(two, /Valider avec client/);
  });

  it('buildProgressSummarySnapshot marks blocked and collects Motifs', () => {
    const snapshot = Agent.buildProgressSummarySnapshot({
      cardName: 'Campagne',
      blocked: {
        enabled: true,
        blockedReasons: ["En attente d'une approbation"],
      },
      progress: {
        percent: 40,
        items: [
          {
            id: 'a',
            text: 'Préparer le brief',
            done: true,
          },
          {
            id: 'b',
            text: 'Valider avec client',
            done: false,
            blocked: true,
            blockedReasons: ["En attente d'une approbation"],
          },
        ],
      },
    });
    assert.equal(snapshot.phase, 'blocked');
    assert.equal(snapshot.stuck, true);
    assert.deepEqual(snapshot.blockedReasons, ["En attente d'une approbation"]);
    assert.ok(snapshot.openLabels.includes('Valider avec client'));
  });

  it('buildHeuristicProgressSummary prefers block reason over open tasks', () => {
    const blocked = Agent.buildHeuristicProgressSummary({
      phase: 'blocked',
      stuck: true,
      tasksTotal: 2,
      tasksOpen: 1,
      openLabels: ['Valider avec client'],
      blockedReasons: ["En attente d'une approbation"],
    });
    assert.match(blocked, /approbation/i);
    assert.doesNotMatch(blocked, /Valider|Reste/i);

    const noReason = Agent.buildHeuristicProgressSummary({
      phase: 'blocked',
      stuck: true,
      tasksTotal: 1,
      tasksOpen: 1,
      openLabels: ['Faire la chose'],
      blockedReasons: [],
    });
    assert.equal(noReason, 'Bloqué');
    assert.doesNotMatch(noReason, /Faire la chose|Reste/i);
  });

  it('cardProgressSummaryTurn skips AI when blocked', async () => {
    const result = await Agent.cardProgressSummaryTurn(
      { apiKey: 'sk-test', baseUrl: 'https://example.test', model: 'x' },
      {
        getCardName: () => 'Test',
        getCompletion: () => ({
          blocked: true,
          blockedReasons: ["En attente d'un câble"],
          items: [
            { id: '1', text: 'Écrire le pitch', done: false, progress: 0 },
          ],
        }),
        getPriorityState: () => ({
          enAttente: true,
          blockedReasons: ["En attente d'un câble"],
        }),
      }
    );
    assert.equal(result.source, 'heuristic');
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'blocked');
    assert.match(result.sentence, /c[aâ]ble/i);
    assert.doesNotMatch(result.sentence, /pitch|Reste/i);
  });

  it('fingerprintProgressSummarySnapshot changes when outline changes', () => {
    const a = Agent.buildProgressSummarySnapshot({
      progress: {
        items: [{ id: '1', text: 'Alpha', done: false }],
      },
    });
    const b = Agent.buildProgressSummarySnapshot({
      progress: {
        items: [
          {
            id: '1',
            text: 'Alpha',
            done: false,
            items: [{ text: 'Beta', done: false }],
          },
        ],
      },
    });
    assert.notEqual(
      Agent.fingerprintProgressSummarySnapshot(a),
      Agent.fingerprintProgressSummarySnapshot(b)
    );
  });

  it('cardProgressSummaryTurn falls back when provider is not configured', async () => {
    const result = await Agent.cardProgressSummaryTurn(
      { apiKey: '', baseUrl: '', model: '' },
      {
        getCardName: () => 'Test',
        getCompletion: () => ({
          items: [
            { id: '1', text: 'Écrire le pitch', done: false, progress: 0 },
            { id: '2', text: 'Relire', done: false, progress: 0 },
          ],
        }),
      }
    );
    assert.equal(result.source, 'heuristic');
    assert.equal(result.skipped, true);
    assert.match(result.sentence, /Écrire le pitch|Relire|tâche/);
  });
});
