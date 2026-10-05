'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('EntitiesLibraryWork (vision → task archetypes)', () => {
  let M;
  let W;
  let installed;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-library.js');
    loadComponent('entities/entities-library-work.js');
    M = global.EntitiesModel;
    W = global.EntitiesLibraryWork;
    assert.ok(W, 'work library loaded');
    installed = W.installAll(M.defaultSchema());
  });

  it('installs without error and stays under the schema size cap', () => {
    assert.equal(installed.error, undefined);
    assert.ok(JSON.stringify(installed.schema).length < M.MAX_SCHEMA_CHARS);
    W.TYPE_IDS.forEach((id) => assert.ok(installed.typeIds[id], id));
  });

  it('splits the archetypes into abstract (outcomes) and concrete (work)', () => {
    const realm = (id) => M.realmOf(M.natureOfType(installed.schema, id));
    ['vision', 'mission', 'but', 'objectif', 'indicateur', 'risque'].forEach((id) => assert.equal(realm(id), 'immaterial', id));
    ['projet', 'tache', 'jalon', 'livrable'].forEach((id) => assert.equal(realm(id), 'material', id));
  });

  it('every link field names a known relation and every link target is a known type', () => {
    const typeIds = installed.schema.types.map((t) => t.id);
    W.COMPONENTS.forEach((c) =>
      c.fields.forEach((f) => {
        if (f.kind !== 'ref' && f.kind !== 'refs') return;
        assert.ok(M.RELATIONS.some((r) => r.id === f.rel), c.id + '.' + f.key + ' rel');
        (f.refTypes || []).forEach((t) => assert.ok(typeIds.indexOf(t) >= 0, c.id + '.' + f.key + ' → ' + t));
      })
    );
  });

  it('understands the new relations from both ends', () => {
    assert.equal(M.matchRelation('contribue à').def.id, 'serves');
    assert.equal(M.matchRelation('est servi par').dir, 'inv');
    assert.equal(M.inverseLabel('contribue à'), 'est servi par');
    assert.equal(M.matchRelation('mesuré par').def.id, 'measured-by');
    assert.equal(M.matchRelation('bloque').def.id, 'blocks');
    assert.ok(M.relationsFor(['abstract']).some((r) => r.id === 'serves'));
  });

  it('chains task → project → objective → goal → mission → vision through "contribue à"', () => {
    let schema = installed.schema;
    const ids = installed.typeIds;
    const make = (name, type, serves) =>
      M.createEntity(schema, { name, types: [ids[type]], data: serves ? { contribution: { sert: [serves.id] } } : {} });
    const vision = make('Vivre bien', 'vision');
    const mission = make('Rester en forme', 'mission', vision);
    const but = make('Courir un marathon', 'but', mission);
    const objectif = make('Courir 10 km en 50 min', 'objectif', but);
    const projet = make('Plan d’entraînement', 'projet', objectif);
    const tache = make('Courir mardi', 'tache', projet);
    [vision, mission, but, objectif, projet, tache].forEach((e) => assert.ok(e && e.id));
    const facts = M.factsOf(schema, tache);
    assert.ok(facts.some((f) => f.def.id === 'serves' && f.subject === tache.id && f.object === projet.id));
    // a project can serve two objectives (cross-link, no duplicated item)
    const second = make('Dormir mieux', 'objectif', mission);
    const multi = M.createEntity(schema, { name: 'Routine du soir', types: [ids.projet], data: { contribution: { sert: [objectif.id, second.id] } } });
    assert.equal(M.factsOf(schema, multi).filter((f) => f.def.id === 'serves').length, 2);
  });

  it('is idempotent: installing twice adds nothing', () => {
    const again = W.installAll(installed.schema);
    assert.deepEqual(again.added, { types: [], components: [] });
  });
});
