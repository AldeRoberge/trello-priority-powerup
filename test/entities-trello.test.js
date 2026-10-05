'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');
const FakeTrello = require('../sandbox/e2e/fake-trello.js');

describe('EntitiesTrello (against an in-memory Trello)', () => {
  let ET;
  let EM;
  let fake;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-trello.js');
    ET = global.EntitiesTrello;
    EM = global.EntitiesModel;
    assert.ok(ET && EM);
  });

  beforeEach(() => {
    fake = FakeTrello.create({
      cards: [
        { id: 'task1', name: 'Une tâche ouverte', idList: 'l1' },
        { id: 'doc1', name: '📄 Un document', idList: 'l1', closed: true },
      ],
    });
    global.SheetsTrello = { trelloRest: fake.trelloRest };
    ET.invalidate();
  });

  async function seed() {
    const state = await ET.load(fake.t, { force: true });
    let schema = EM.upsertComponent(state.schema, {
      name: 'Entretien',
      fields: [{ key: 'interval_days', kind: 'number' }],
    });
    schema = EM.upsertType(schema, { name: 'Plante', components: ['location', 'entretien'] });
    const work = EM.createEntity(schema, { name: 'Hôtel de Ville', types: ['place'], aliases: ['travail'] });
    let ficus = EM.createEntity(schema, { name: 'Ficus -- "spécial" -->', types: ['plante'] });
    ficus = EM.setValue(schema, ficus, 'location.place', work.id);
    ficus = EM.setValue(schema, ficus, 'entretien.interval_days', 7);
    await ET.commit(fake.t, state, schema, [work, ficus]);
    return { state, schema, work, ficus };
  }

  it('an empty board loads the default schema and no entity', async () => {
    const s = await ET.load(fake.t, { force: true });
    assert.deepEqual(s.entities, []);
    assert.ok(s.schema.types.some((t) => t.id === 'place'));
  });

  it('stores each entity (and the schema) as an ARCHIVED card with the marker, nothing on the board', async () => {
    await seed();
    const mine = fake.cards.filter((c) => c.name.startsWith('🧩'));
    assert.equal(mine.length, 3, 'schema + 2 entities');
    assert.ok(mine.every((c) => c.closed && c.idList === 'l1'));
    assert.deepEqual((await fake.t.cards('id', 'name')).map((c) => c.name), ['Une tâche ouverte']);
  });

  it('round-trips entities, aliases, refs and awkward text through a fresh load', async () => {
    const { work, ficus } = await seed();
    ET.invalidate();
    const s = await ET.load(fake.t, { force: true });
    assert.equal(s.entities.length, 2);
    const f = s.entities.find((e) => e.id === ficus.id);
    assert.equal(f.name, 'Ficus -- "spécial" -->');
    assert.equal(EM.getValue(f, 'location.place'), work.id);
    assert.equal(EM.getValue(f, 'entretien.interval_days'), 7);
    assert.equal(f.history.length, ficus.history.length);
    const r = EM.resolveText(s.schema, s.entities, 'arroser mes plantes au travail');
    assert.deepEqual(r.entities.map((e) => e.name), ['Ficus -- "spécial" -->']);
  });

  it('commit only writes what changed, renames the card and deletes removed entities', async () => {
    const { state, schema, work, ficus } = await seed();
    const puts = [];
    const orig = fake.trelloRest;
    global.SheetsTrello = {
      trelloRest: (t, path, method, body) => {
        if (method && method !== 'GET') puts.push(method + ' ' + path);
        return orig(t, path, method, body);
      },
    };
    await ET.commit(fake.t, state, schema, [work, ficus]);
    assert.deepEqual(puts, [], 'no change, no write');
    const renamed = EM.renameEntity(ficus, 'Ficus géant');
    await ET.commit(fake.t, state, schema, [work, renamed]);
    assert.equal(puts.length, 1);
    assert.ok(fake.cards.some((c) => c.name === '🧩 Ficus géant'));
    await ET.commit(fake.t, state, schema, [work]);
    assert.ok(!fake.cards.some((c) => c.name.startsWith('🧩 Ficus')));
    assert.equal(Object.keys(state.cards).length, 1);
  });

  it('refuses to overwrite a newer revision (conflict) unless forced', async () => {
    const { state, schema, work, ficus } = await seed();
    const other = JSON.parse(JSON.stringify(state));
    await ET.commit(fake.t, state, schema, [work, EM.renameEntity(ficus, 'Par moi')]);
    await assert.rejects(
      () => ET.commit(fake.t, other, schema, [work, EM.renameEntity(ficus, 'Par lui')]),
      { reason: 'conflict' }
    );
    await ET.commit(fake.t, other, schema, [work, EM.renameEntity(ficus, 'Par lui')], { force: true });
    assert.ok(fake.cards.some((c) => c.name === '🧩 Par lui'));
  });

  it('ignores corrupt entity cards and keeps the rest', async () => {
    await seed();
    fake.cards.push({ id: 'bad', name: '🧩 Cassé', idList: 'l1', closed: true, desc: 'pas de bloc', dateLastActivity: '' });
    ET.invalidate();
    const s = await ET.load(fake.t, { force: true });
    assert.equal(s.entities.length, 2);
  });

  it('trims history to fit the description limit instead of failing', async () => {
    const { state, schema, work, ficus } = await seed();
    let big = ficus;
    for (let i = 0; i < 40; i++) {
      big = EM.setAliases(big, ['alias' + i + 'x'.repeat(30), 'b'.repeat(35) + i, 'c'.repeat(35) + i]);
    }
    big = EM.setValue(schema, big, 'entretien.interval_days', 3);
    await ET.commit(fake.t, state, schema, [work, big]);
    ET.invalidate();
    const s = await ET.load(fake.t, { force: true });
    assert.ok(s.entities.find((e) => e.id === big.id));
  });

  it('serves the cached state to peek() after a load', async () => {
    ET.invalidate();
    await ET.load(fake.t, { force: true });
    assert.ok(ET.peek() && Array.isArray(ET.peek().entities));
  });
});
