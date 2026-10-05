'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('Agent knows the user entities', () => {
  let Agent;
  let EM;
  let bridge;

  before(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    global.PriorityUI = {
      createCollapsibleEnableChrome() {
        return { head: global.document.createElement('div'), label: null };
      },
      getMemberRoleCatalog() {
        return [];
      },
      axisWord(axis, n) {
        return String(axis) + ':' + n;
      }
    };
    loadComponent('entities/entities-model.js');
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    EM = global.EntitiesModel;

    let schema = EM.defaultSchema();
    schema = EM.upsertComponent(schema, {
      name: 'Entretien',
      fields: [{ key: 'interval_days', kind: 'number' }]
    });
    schema = EM.upsertType(schema, { name: 'Plante', aliases: ['plant'], components: ['location', 'entretien'] });
    const work = EM.createEntity(schema, { name: 'Hôtel de Ville', types: ['place'], aliases: ['travail', 'work'] });
    const home = EM.createEntity(schema, { name: 'Maison', types: ['place'], aliases: ['home'] });
    let ficus = EM.createEntity(schema, { name: 'Ficus', types: ['plante'] });
    ficus = EM.setValue(schema, ficus, 'location.place', work.id);
    let cactus = EM.createEntity(schema, { name: 'Cactus', types: ['plante'] });
    cactus = EM.setValue(schema, cactus, 'location.place', home.id);
    bridge = {
      getEntities() {
        return { schema, entities: [work, home, ficus, cactus] };
      }
    };
  });

  it('getEntities is a forwarded context getter', () => {
    assert.ok(Agent.BUILD_CONTEXT_GETTERS.includes('getEntities'));
  });

  it('buildContext carries the entity store only when there are entities', () => {
    assert.ok(Agent.buildContext(bridge).entityStore.entities.length === 4);
    assert.equal(Agent.buildContext({ getEntities: () => ({ schema: EM.defaultSchema(), entities: [] }) }).entityStore, undefined);
    assert.equal(Agent.buildContext({ getEntities: () => { throw new Error('boom'); } }).entityStore, undefined);
  });

  it('"Water my plants at work" puts only the plants of the workplace in the prompt', () => {
    const prompt = Agent.systemPrompt(Agent.buildContext(bridge), { userText: 'Water my plants at work' });
    assert.match(prompt, /Entités correspondant à la demande actuelle/);
    assert.match(prompt, /Ficus \[Plante\]/);
    assert.equal(/Cactus \[Plante\]/.test(prompt), false, 'the cactus is at home');
  });

  it('without a matching request the prompt only carries the catalog', () => {
    const prompt = Agent.systemPrompt(Agent.buildContext(bridge), { userText: 'Quelle heure est-il ?' });
    assert.match(prompt, /Plante \(2\)/);
    assert.equal(/Entités correspondant à la demande/.test(prompt), false);
  });
});
