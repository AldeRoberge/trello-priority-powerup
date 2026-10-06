'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Systems AI: author a rule, observe a change', () => {
  let M, L, S, AI, saved, schema, reply, prompts;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-composer.js');
    loadComponent('entities/entities-composer-ai.js');
    loadComponent('entities/entities-library.js');
    loadComponent('entities/entities-systems.js');
    loadComponent('entities/entities-systems-ai.js');
    M = global.EntitiesModel;
    L = global.EntitiesLibrary;
    S = global.EntitiesSystems;
    AI = global.EntitiesSystemsAI;
  });

  beforeEach(() => {
    saved = global.PriorityAgent;
    prompts = [];
    reply = null;
    global.PriorityAgent = {
      getProvider: async () => ({ ok: true }),
      isConfigured: () => true,
      chatCompletions: async (p, messages) => {
        prompts.push(messages);
        if (reply instanceof Error) throw reply;
        return { content: typeof reply === 'string' ? reply : JSON.stringify(reply) };
      },
    };
    schema = L.install(M.defaultSchema(), 'bouteille').schema;
  });
  afterEach(() => {
    global.PriorityAgent = saved;
  });

  describe('author', () => {
    it('turns a French sentence into a validated System', async () => {
      reply = {
        name: 'Bouteille vide',
        on: ['contenant'],
        when: [{ path: 'contenant.quantite', op: 'eq', value: 0 }],
        then: { text: '{name} est vide', level: 'warn', card: 'Racheter {name}' },
      };
      const r = await AI.author({}, schema, 'quand une bouteille est vide, crée une carte pour la racheter');
      assert.equal(r.error, undefined);
      assert.equal(r.system.id, 'bouteille_vide');
      assert.equal(r.system.then.card, 'Racheter {name}');
      // the prompt carries the real components and fields, and the sentence as data
      const user = prompts[0][1].content;
      assert.match(user, /contenant\.quantite \| Niveau \| level/);
      assert.match(user, /crée une carte pour la racheter/);
      // the answer is directly installable and evaluable
      const next = M.upsertSystem(schema, r.system);
      const e = M.createEntity(next, { name: 'Eau', types: ['bouteille'], data: { contenant: { quantite: 0 } } });
      assert.equal(S.evaluate(next, [e], { now: new Date(2026, 9, 6) })[0].card, 'Racheter Eau');
    });

    it('refuses rules that use components or fields the schema does not have', async () => {
      reply = { name: 'X', on: ['licorne'], when: [{ path: 'licorne.corne', op: 'set' }], then: { text: 'x' } };
      assert.equal((await AI.author({}, schema, 'quand la licorne a une corne')).error, 'unclear');
      reply = { error: 'pas possible' };
      assert.equal((await AI.author({}, schema, 'quelque chose de vague ici')).error, 'unclear');
      reply = 'not json at all';
      assert.equal((await AI.author({}, schema, 'quelque chose de vague ici')).error, 'unclear');
    });

    it('gives a duplicate name a numeric suffix instead of overwriting', async () => {
      const first = S.install(schema, 'contenant_vide').schema;
      reply = { name: 'Contenant vide', on: ['contenant'], when: [{ path: 'contenant.quantite', op: 'lt', value: 5 }], then: { text: 'bas' } };
      const r = await AI.author({}, first, 'prévenir quand le niveau est bas');
      assert.equal(r.system.id, 'contenant_vide_2');
    });

    it('never rejects: no model, a network error or a too-short sentence', async () => {
      global.PriorityAgent.isConfigured = () => false;
      assert.equal((await AI.author({}, schema, 'une règle assez longue')).error, 'no-ai');
      global.PriorityAgent.isConfigured = () => true;
      reply = new Error('boom');
      assert.equal((await AI.author({}, schema, 'une règle assez longue')).error, 'failed');
      assert.equal((await AI.author({}, schema, 'ok')).error, 'unclear');
    });
  });

  describe('observe', () => {
    function entities() {
      const eau = M.createEntity(schema, { name: 'Eau', types: ['bouteille'], data: { contenant: { capacite: 500, quantite: 120 } } });
      const jus = M.createEntity(schema, { name: 'Jus', types: ['bouteille'], data: { contenant: { capacite: 500, quantite: 400 } } });
      return [eau, jus];
    }

    it('proposes the value changes a sentence implies, only for the entities it names', async () => {
      const list = entities();
      reply = { changes: [{ entity: 'Eau', path: 'contenant.quantite', value: 0 }] };
      const r = await AI.observe({}, schema, list, 'j’ai fini l’eau');
      assert.equal(r.error, undefined);
      assert.equal(r.changes.length, 1);
      assert.deepEqual(
        { id: r.changes[0].entityId, path: r.changes[0].path, value: r.changes[0].value, from: r.changes[0].from, display: r.changes[0].display },
        { id: list[0].id, path: 'contenant.quantite', value: 0, from: 120, display: '0 ml' }
      );
      // only Eau was offered to the model
      const user = prompts[0][1].content;
      assert.match(user, /Entité : Eau/);
      assert.ok(!/Entité : Jus/.test(user));
      assert.match(user, /contenant\.quantite = 120 ml/);
    });

    it('drops unknown entities and paths, links, unchanged values and values that do not fit', async () => {
      const list = entities();
      reply = {
        changes: [
          { entity: 'Inconnue', path: 'contenant.quantite', value: 0 },
          { entity: 'Eau', path: 'licorne.corne', value: 1 },
          { entity: 'Eau', path: 'contenant.quantite', value: 120 }, // unchanged
          { entity: 'Eau', path: 'contenant.contenu', value: 'x' }, // a link
          { entity: 'Eau', path: 'contenant.ouvert_le', value: 'pas une date' },
          { entity: 'Eau', path: 'contenant.scelle', value: 'ouvert' },
        ],
      };
      const r = await AI.observe({}, schema, list, 'j’ai ouvert l’eau');
      assert.deepEqual(r.changes.map((c) => c.path + '=' + c.value), ['contenant.scelle=ouvert']);
    });

    it('does not call the model when the sentence names no known entity', async () => {
      const r = await AI.observe({}, schema, entities(), 'il fait beau');
      assert.deepEqual(r.changes, []);
      assert.equal(prompts.length, 0);
    });

    it('an accepted change feeds the rules: finishing the water raises "vide"', async () => {
      const withRule = S.install(schema, 'contenant_vide').schema;
      const list = entities();
      reply = { changes: [{ entity: 'Eau', path: 'contenant.quantite', value: 0 }] };
      const r = await AI.observe({}, withRule, list, 'j’ai fini l’eau');
      const updated = M.setValue(withRule, list[0], r.changes[0].path, r.changes[0].value);
      const f = S.evaluate(withRule, [updated, list[1]], { now: new Date(2026, 9, 6) });
      assert.deepEqual(f.map((x) => x.text), ['Eau est vide']);
    });
  });
});
