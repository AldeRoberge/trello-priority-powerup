'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('KanbanAI', () => {
  let AI;
  before(() => {
    loadComponent('kanban/kanban-ai.js');
    AI = global.KanbanAI;
    assert.ok(AI);
  });

  const lists = [
    { id: 'l1', name: 'À faire', category: 'unstarted' },
    { id: 'l2', name: 'En cours', category: 'started' },
    { id: 'l3', name: 'Bloqué', category: 'blocked' },
    { id: 'l4', name: 'Terminé', category: 'completed' },
  ];
  const mkRows = () => [
    { id: 'a', name: 'Achat bibliothèque', listId: 'l2', statut: 'En cours', statutKey: 'started', pos: 5, progress: 57, desc: 'Trouver une étagère.', due: '' },
    { id: 'b', name: 'Autre', listId: 'l1', statut: 'À faire', statutKey: 'unstarted', pos: 9, progress: 0, desc: '', due: '' },
  ];

  describe('parseReply', () => {
    it('reads plain JSON, fenced JSON and JSON with prose around it', () => {
      assert.deepEqual(AI.parseReply('{"message":"ok","actions":[]}'), { message: 'ok', actions: [] });
      assert.equal(AI.parseReply('```json\n{"message":"x"}\n```').message, 'x');
      assert.equal(AI.parseReply('Voici: {"message":"y"} fin').message, 'y');
    });
    it('returns null on garbage', () => {
      assert.equal(AI.parseReply(''), null);
      assert.equal(AI.parseReply('pas du json'), null);
      assert.equal(AI.parseReply('{broken'), null);
    });
  });

  describe('buildMessages', () => {
    it('puts the card, the lists and the instruction in the prompt', () => {
      const rows = mkRows();
      const m = AI.buildMessages({ text: 'j’attends le gars', target: rows[0], rows, lists, today: '2026-10-05' });
      assert.equal(m[0].role, 'system');
      assert.match(m[0].content, /2026-10-05/);
      assert.match(m[1].content, /"id":"a"/);
      assert.match(m[1].content, /Trouver une étagère/);
      assert.match(m[1].content, /"id":"l3"/);
      assert.match(m[1].content, /j’attends le gars/);
    });
    it('lists board cards instead of one card when there is no target', () => {
      const rows = mkRows();
      const m = AI.buildMessages({ text: 'crée une tâche', target: null, rows, lists, today: 'd' });
      assert.match(m[1].content, /"cards":\[/);
      assert.doesNotMatch(m[1].content, /"card":/);
    });
  });

  describe('normalizeActions', () => {
    it('keeps valid creates and update fields, clamps progress, drops no-ops', () => {
      const rows = mkRows();
      const out = AI.normalizeActions([
        { op: 'create', title: '  Appeler le vendeur ', list: 'l1', progress: 0 },
        { op: 'update', cardId: 'a', progress: 150, waiting: true, waitingReason: 'Réponse Marketplace' },
        { op: 'update', cardId: 'a', progress: 57 }, // unchanged -> dropped
      ], { rows, lists, target: null });
      assert.equal(out.length, 2);
      assert.deepEqual(out[0], { op: 'create', title: 'Appeler le vendeur', desc: '', listId: 'l1' });
      assert.equal(out[1].progress, 100);
      assert.equal(out[1].waiting, true);
      assert.equal(out[1].waitingReason, 'Réponse Marketplace');
    });
    it('ignores unknown cards and unknown lists', () => {
      const rows = mkRows();
      const out = AI.normalizeActions([
        { op: 'update', cardId: 'zzz', progress: 10 },
        { op: 'create', title: 'T', list: 'nope' },
        { op: 'purge', cardId: 'a' },
        null,
      ], { rows, lists, target: null });
      assert.equal(out.length, 1);
      assert.equal(out[0].listId, '');
    });
    it('an input typed on a card only edits that card', () => {
      const rows = mkRows();
      const out = AI.normalizeActions([{ op: 'update', cardId: 'b', progress: 40 }], { rows, lists, target: rows[0] });
      assert.equal(out[0].cardId, 'a');
    });
    it('does not move a card that is put on hold (waiting wins over list)', () => {
      const rows = mkRows();
      const out = AI.normalizeActions([{ op: 'update', cardId: 'a', waiting: true, list: 'l4' }], { rows, lists, target: rows[0] });
      assert.equal(out[0].listId, undefined);
    });
    it('keeps delete actions only for known cards; on a card it targets that card', () => {
      const rows = mkRows();
      assert.deepEqual(AI.normalizeActions([{ op: 'delete', cardId: 'b' }, { op: 'delete', cardId: 'zzz' }], { rows, lists, target: null }), [{ op: 'delete', cardId: 'b' }]);
      assert.deepEqual(AI.normalizeActions([{ op: 'delete', cardId: 'b' }], { rows, lists, target: rows[0] }), [{ op: 'delete', cardId: 'a' }]);
    });
    it('resolves a list by name', () => {
      assert.equal(AI.resolveListId('en cours', lists), 'l2');
      assert.equal(AI.resolveListId('', lists), '');
    });
  });

  describe('run (mocked provider and Trello)', () => {
    let calls;
    beforeEach(() => {
      calls = [];
      global.PriorityAgent = {
        getProvider: async () => ({ apiKey: 'k' }),
        isConfigured: (p) => !!p.apiKey,
        chatCompletions: async (_p, messages) => {
          calls.push(messages);
          return {
            content: JSON.stringify({
              message: 'ok',
              actions: [{ op: 'update', cardId: 'a', desc: 'Trouver une étagère.\n\n2026-10-05 : en attente du vendeur Marketplace', progress: 60, waiting: true, waitingReason: 'Réponse du vendeur Marketplace' }],
            }),
          };
        },
      };
      global.PriorityTrello = {
        getCardInputsById: async () => ({ enAttente: false }),
        saveCardInputsById: async (_t, id, patch, opts) => calls.push(['inputs', id, patch, opts]),
      };
      global.TableTrello = {
        saveDesc: async (_t, row, text) => calls.push(['desc', row.id, text]),
        moveCard: async (_t, id, listId, pos) => calls.push(['move', id, listId, pos]),
      };
      const store = {};
      global.CompletionTrello = {
        getCardCompletionById: async () => ({ items: [] }),
        normalizeCompletionData: (d) => d,
        applyMasterProgress: (i) => i,
        saveCardCompletionById: async (_t, id, d) => calls.push(['progress', id, d.progress, store]),
      };
    });

    it('updates the description and progress, marks it waiting and moves it to Bloqué', async () => {
      const rows = mkRows();
      const records = [];
      const res = await AI.run({}, { text: 'Waiting for the Marketplace guy', target: rows[0], rows, lists, record: (e) => records.push(e) });
      assert.deepEqual(res.failed, []);
      assert.ok(calls.some((c) => c[0] === 'desc' && /en attente du vendeur/.test(c[2])));
      assert.ok(calls.some((c) => c[0] === 'progress' && c[2] === 60));
      const inputs = calls.find((c) => c[0] === 'inputs');
      assert.equal(inputs[2].enAttente, true);
      assert.deepEqual(inputs[2].blockedReasons, ['Réponse du vendeur Marketplace']);
      assert.equal(inputs[3].skipStatutAutoMove, true);
      const move = calls.find((c) => c[0] === 'move');
      assert.deepEqual(move.slice(1, 3), ['a', 'l3']);
      assert.deepEqual(records.map((r) => r.type), ['field', 'field', 'field', 'move']);
    });

    it('logs the instruction and outcome in the card chat', async () => {
      const rows = mkRows();
      const stored = {};
      global.PriorityAgent.loadCardChat = async (b) => ({ messages: (await b.get('card', 'private', 'cardAgentChat'))?.messages || [] });
      global.PriorityAgent.saveCardChat = async (b, chat) => b.set('card', 'private', 'cardAgentChat', chat);
      const t = { get: async (id, vis, key) => stored[id + key], set: async (id, vis, key, v) => { stored[id + key] = v; } };
      await AI.run(t, { text: 'Waiting for the Marketplace guy', target: rows[0], rows, lists });
      const msgs = stored['acardAgentChat'].messages;
      assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant']);
      assert.equal(msgs[0].content, 'Waiting for the Marketplace guy');
      assert.match(msgs[1].content, /mise en attente/);
    });

    it('rejects with no-provider when the provider is not configured', async () => {
      global.PriorityAgent.isConfigured = () => false;
      await assert.rejects(() => AI.run({}, { text: 'x', target: null, rows: mkRows(), lists }), (e) => e.reason === 'no-provider');
    });

    it('reports an unreadable reply', async () => {
      global.PriorityAgent.chatCompletions = async () => ({ content: 'blabla' });
      await assert.rejects(() => AI.run({}, { text: 'x', target: null, rows: mkRows(), lists }), /illisible/);
    });
  });
});
