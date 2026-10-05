'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Entity archetypes (inheritance with overrides)', () => {
  let M;
  let C;
  let schema;
  let mairie;
  let maison;
  let ficus;
  let entities;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-composer.js');
    M = global.EntitiesModel;
    C = global.EntitiesComposer;
  });

  beforeEach(() => {
    schema = M.defaultSchema();
    schema = M.upsertComponent(schema, {
      name: 'Entretien',
      fields: [
        { key: 'interval_days', label: 'Arroser tous les (jours)', kind: 'number' },
        { key: 'health', label: 'Santé', kind: 'choice', options: ['bonne', 'fragile', 'morte'] },
      ],
    });
    schema = M.upsertType(schema, { name: 'Plante', components: ['location', 'entretien'] });
    mairie = M.createEntity(schema, { name: 'Hôtel de Ville', types: ['place'], aliases: ['travail'] });
    maison = M.createEntity(schema, { name: 'Maison', types: ['place'], aliases: ['home'] });
    ficus = M.createEntity(schema, {
      name: 'Ficus',
      types: ['plante'],
      data: { location: { place: mairie.id }, entretien: { interval_days: 7, health: 'bonne' } },
    });
    entities = [mairie, maison, ficus];
  });

  it('a variant inherits everything and stores nothing', () => {
    const v = M.cloneEntity(schema, entities, ficus.id);
    assert.equal(v.base, ficus.id);
    assert.deepEqual(v.data, {});
    assert.deepEqual(v.types, ['plante']);
    assert.equal(v.name, 'Ficus (copie)');
    entities = entities.concat([v]);
    assert.equal(M.effectiveValue(entities, v, 'entretien.interval_days'), 7);
    assert.equal(M.originOf(entities, v, 'entretien.interval_days'), ficus.id);
  });

  it('changing the variant writes an override and never touches the archetype', () => {
    let v = M.cloneEntity(schema, entities, ficus.id);
    v = M.setValue(schema, v, 'entretien.interval_days', 3);
    entities = entities.concat([v]);
    assert.equal(M.effectiveValue(entities, v, 'entretien.interval_days'), 3);
    assert.equal(M.originOf(entities, v, 'entretien.interval_days'), 'own');
    assert.equal(M.getValue(ficus, 'entretien.interval_days'), 7);
    assert.equal(M.effectiveValue(entities, ficus, 'entretien.interval_days'), 7);
  });

  it('changing the archetype reaches variants except where they overrode', () => {
    let v = M.cloneEntity(schema, entities, ficus.id);
    v = M.setValue(schema, v, 'entretien.interval_days', 3);
    const ficus2 = M.setValue(schema, M.setValue(schema, ficus, 'entretien.interval_days', 10), 'entretien.health', 'fragile');
    entities = [mairie, maison, ficus2, v];
    assert.equal(M.effectiveValue(entities, v, 'entretien.interval_days'), 3); // overridden: kept
    assert.equal(M.effectiveValue(entities, v, 'entretien.health'), 'fragile'); // inherited: follows
  });

  it('resetting an override (clearing it) goes back to the archetype value', () => {
    let v = M.setValue(schema, M.cloneEntity(schema, entities, ficus.id), 'entretien.interval_days', 3);
    v = M.setValue(schema, v, 'entretien.interval_days', undefined);
    entities = entities.concat([v]);
    assert.equal(M.effectiveValue(entities, v, 'entretien.interval_days'), 7);
  });

  it('chains: a variant of a variant overrides over both', () => {
    const a = M.setValue(schema, M.cloneEntity(schema, entities, ficus.id, { name: 'A' }), 'entretien.health', 'fragile');
    entities = entities.concat([a]);
    const b = M.cloneEntity(schema, entities, a.id, { name: 'B' });
    entities = entities.concat([b]);
    assert.equal(M.effectiveValue(entities, b, 'entretien.health'), 'fragile');
    assert.equal(M.effectiveValue(entities, b, 'entretien.interval_days'), 7);
    assert.equal(M.originOf(entities, b, 'entretien.health'), a.id);
  });

  it('queries and the assistant see inherited values', () => {
    const v = M.cloneEntity(schema, entities, ficus.id, { name: 'Monstera' });
    entities = entities.concat([v]);
    assert.deepEqual(
      M.resolveText(schema, entities, 'mes plantes au travail').entities.map((e) => e.name).sort(),
      ['Ficus', 'Monstera']
    );
    assert.ok(M.describeEntity(schema, entities, v).includes('variante de Ficus'));
    assert.ok(M.describeEntity(schema, entities, v).includes('Hôtel de Ville'));
    assert.ok(M.linksOf(schema, entities, mairie.id).some((l) => l.other === v.id));
    assert.ok(M.linksOf(schema, entities, ficus.id).some((l) => l.via === 'variante de' && l.other === v.id));
  });

  it('a variant can move to another place without moving the archetype', () => {
    let v = M.cloneEntity(schema, entities, ficus.id, { name: 'Monstera' });
    v = M.setValue(schema, v, 'location.place', maison.id);
    entities = entities.concat([v]);
    assert.deepEqual(M.resolveText(schema, entities, 'plantes chez home').entities.map((e) => e.name), ['Monstera']);
    assert.deepEqual(M.resolveText(schema, entities, 'plantes au travail').entities.map((e) => e.name), ['Ficus']);
  });

  it('an independent copy (detach) shares nothing afterwards', () => {
    const c = M.cloneEntity(schema, entities, ficus.id, { detach: true });
    assert.equal(c.base, '');
    assert.equal(M.getValue(c, 'entretien.interval_days'), 7);
    const ficus2 = M.setValue(schema, ficus, 'entretien.interval_days', 99);
    assert.equal(M.effectiveValue([ficus2, c], c, 'entretien.interval_days'), 7);
  });

  it('detachEntity keeps current values but stops following', () => {
    let v = M.cloneEntity(schema, entities, ficus.id);
    entities = entities.concat([v]);
    v = M.detachEntity(entities, v);
    assert.equal(v.base, '');
    assert.equal(M.getValue(v, 'entretien.health'), 'bonne');
    assert.equal(v.history[v.history.length - 1].op, 'base');
  });

  it('setBase refuses loops and unknown entities, and clearing it works', () => {
    const v = M.cloneEntity(schema, entities, ficus.id);
    entities = entities.concat([v]);
    assert.throws(() => M.setBase(entities, ficus, v.id), /base-cycle/);
    assert.throws(() => M.setBase(entities, ficus, ficus.id), /base-cycle/);
    assert.throws(() => M.setBase(entities, v, 'nope'), /unknown-entity/);
    assert.equal(M.setBase(entities, v, '').base, '');
    assert.equal(M.setBase(entities, v, ficus.id), v); // no-op
  });

  it('deleting the archetype keeps the variants\' values', () => {
    const v = M.setValue(schema, M.cloneEntity(schema, entities, ficus.id, { name: 'V' }), 'entretien.health', 'morte');
    entities = entities.concat([v]);
    const after = M.deleteEntity(schema, entities, ficus.id);
    const v2 = M.findById(after, v.id);
    assert.equal(v2.base, '');
    assert.equal(M.getValue(v2, 'entretien.interval_days'), 7);
    assert.equal(M.getValue(v2, 'location.place'), mairie.id);
    assert.equal(M.getValue(v2, 'entretien.health'), 'morte');
  });

  it('deleting a place clears the ref in the archetype and, through it, in its variants', () => {
    const v = M.cloneEntity(schema, entities, ficus.id, { name: 'V' });
    entities = entities.concat([v]);
    const after = M.deleteEntity(schema, entities, mairie.id);
    assert.equal(M.effectiveValue(after, M.findById(after, v.id), 'location.place'), undefined);
  });

  it('base survives normalization (saving / loading) and unknown bases are ignored safely', () => {
    const v = M.cloneEntity(schema, entities, ficus.id);
    const back = M.normalizeEntity(JSON.parse(JSON.stringify(v)), schema);
    assert.equal(back.base, ficus.id);
    const orphan = M.normalizeEntity(Object.assign({}, back, { base: 'gone' }), schema);
    assert.equal(M.effectiveValue([orphan], orphan, 'entretien.health'), undefined);
  });

  it('base changes are described and are not revertable one by one', () => {
    const v = M.setBase(entities, M.createEntity(schema, { name: 'Z', types: ['plante'] }), ficus.id);
    const entry = v.history[v.history.length - 1];
    assert.equal(M.isRevertable(entry), false);
    assert.equal(M.describeEntry(schema, entities, entry), 'Modèle : (aucun) → Ficus');
  });

  describe('composer', () => {
    it('start from a model: types default to its types, answers are overrides, the rest is inherited', () => {
      let d = C.newDraft({ name: 'Monstera' });
      d = C.setBase(schema, entities, d, ficus.id);
      assert.deepEqual(d.types, ['plante']);
      assert.equal(C.inheritedValue(entities, d, 'entretien.interval_days'), 7);
      d = C.setAnswer(d, 'entretien.health', 'fragile');
      const r = C.finalize(schema, entities, [d]);
      const created = r.created[0];
      assert.equal(created.base, ficus.id);
      assert.deepEqual(created.data, { entretien: { health: 'fragile' } });
      assert.equal(M.effectiveValue(r.entities, created, 'entretien.interval_days'), 7);
    });

    it('a base that no longer exists is dropped at creation', () => {
      const d = Object.assign(C.newDraft({ name: 'Orphelin', types: ['plante'] }), { base: 'gone' });
      assert.equal(C.finalize(schema, entities, [d]).created[0].base, '');
    });
  });
});
