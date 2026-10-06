'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('EntitiesComposerAI', () => {
  let M, C, AI, schema, salon, ctx;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-composer.js');
    loadComponent('entities/entities-composer-ai.js');
    M = global.EntitiesModel;
    C = global.EntitiesComposer;
    AI = global.EntitiesComposerAI;
    assert.ok(AI);
    schema = M.upsertComponent(M.defaultSchema(), {
      name: 'Entretien',
      fields: [
        { key: 'interval_days', label: 'Arroser tous les (jours)', kind: 'number' },
        { key: 'health', label: 'Santé', kind: 'choice', options: ['bonne', 'fragile'] },
      ],
    });
    schema = M.upsertType(schema, { name: 'Plante', components: ['location', 'entretien'] });
    salon = M.createEntity(schema, { name: 'Salon', types: ['place'] });
    const draft = C.newDraft({ name: 'Monstera', types: ['plante'] });
    ctx = {
      schema,
      entities: [salon],
      draft,
      choices: C.archetypeChoices(schema, null),
    };
  });

  it('keeps valid ideas and drops unknown genres, fields, options and entities', () => {
    const text = JSON.stringify({
      types: ['place', 'nope', 'plante'],
      aliases: ['Swiss cheese plant', 'monstera', ''],
      answers: { 'entretien.interval_days': '7', 'entretien.health': 'excellente', 'ghost.x': 1, 'location.place': 'Salon' },
      links: [{ type: 'situé dans', to: 'Salon' }, { type: 'situé dans', to: 'Inconnu' }],
    });
    const items = AI.parse(text, ctx);
    const ids = items.map((i) => i.id);
    assert.deepEqual(ids, ['type:place', 'alias:swiss cheese plant', 'answer:entretien.interval_days', 'answer:location.place', 'link:' + salon.id]);
    assert.equal(items.find((i) => i.path === 'entretien.interval_days').value, 7);
    assert.equal(items.find((i) => i.path === 'location.place').value, salon.id);
  });

  it('survives garbage and wrapped JSON', () => {
    assert.deepEqual(AI.parse('not json', ctx), []);
    assert.equal(AI.parse('Voici : {"aliases":["Plante verte"]} merci', ctx).length, 1);
  });

  it('applies each kind of idea to the draft', () => {
    let d = ctx.draft;
    AI.parse(
      JSON.stringify({ aliases: ['Plante verte'], answers: { 'entretien.interval_days': 7 }, links: [{ type: 'situé dans', to: 'Salon' }] }),
      ctx
    ).forEach((it) => {
      d = AI.apply(schema, d, it);
    });
    assert.deepEqual(d.aliases, ['Plante verte']);
    assert.equal(d.answers['entretien.interval_days'], 7);
    assert.equal(d.relations[0].to, salon.id);
  });

  it('does not suggest what the draft already has', () => {
    const d = C.setAnswer(ctx.draft, 'entretien.interval_days', 3);
    const items = AI.parse(JSON.stringify({ answers: { 'entretien.interval_days': 7 }, types: ['plante'] }), Object.assign({}, ctx, { draft: d }));
    assert.deepEqual(items, []);
  });

  it('builds a prompt that lists genres, fields and existing entities', () => {
    const msg = AI.buildMessages(ctx);
    assert.match(msg[1].content, /Monstera/);
    assert.match(msg[1].content, /entretien\.interval_days/);
    assert.match(msg[1].content, /Salon/);
  });
});
