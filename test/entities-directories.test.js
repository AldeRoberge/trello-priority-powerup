'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('EntitiesDirectories (People and Places as entities)', () => {
  let M, L, D, schema;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-library.js');
    loadComponent('entities/entities-directories.js');
    M = global.EntitiesModel;
    L = global.EntitiesLibrary;
    D = global.EntitiesDirectories;
    schema = L.ensureBridge(M.defaultSchema(), { people: true });
  });

  const person = { id: 'person-maman', name: 'Maman', aliases: ['mom'], email: 'maman@example.com', phone: '514-555-0100', notes: 'Aime le thé', relation: 'ma mère' };
  const place = { id: 'place-chalet', name: 'Chalet', aliases: ['cottage'], address: '12 chemin du Lac', notes: '', lat: 46.1, lng: -74.2 };

  it('the schema gets Propriétaire (a link to any entity), Adresse on Lieu and the Personne type', () => {
    const f = M.fieldOf(schema, 'propriete.proprietaire');
    assert.equal(f.field.label, 'Propriétaire');
    assert.equal(f.field.kind, 'refs');
    assert.deepEqual(f.field.refTypes, []);
    assert.ok(M.findById(schema.types, 'place').components.includes('adresse'));
    assert.ok(M.findById(schema.types, 'personne'));
    assert.deepEqual(L.ensureBridge(schema, { people: true }), schema);
  });

  it('pull: every record becomes a linked entity with its mirrored fields', () => {
    const r = D.sync(schema, [], { people: [person], places: [place] }, 'pull');
    const p = r.entities.find((e) => e.name === 'Maman');
    const l = r.entities.find((e) => e.name === 'Chalet');
    assert.deepEqual(p.types, ['personne']);
    assert.deepEqual(p.source, { kind: 'people', id: 'person-maman' });
    assert.equal(p.data.personne.courriel, 'maman@example.com');
    assert.equal(p.data.personne.notes, 'Aime le thé');
    assert.deepEqual(p.aliases, ['mom']);
    assert.deepEqual(l.types, ['place']);
    assert.equal(l.data.adresse.adresse, '12 chemin du Lac');
    assert.equal(l.data.adresse.coordonnees, '46.1, -74.2');
    assert.equal(r.directoriesChanged.people, false);
  });

  it('pull is stable and the directory wins over the entity', () => {
    const first = D.sync(schema, [], { people: [person], places: [] }, 'pull');
    const renamed = Object.assign({}, person, { name: 'Maman Rose', phone: '' });
    const again = D.sync(schema, first.entities, { people: [renamed], places: [] }, 'pull');
    assert.equal(again.entities.length, 1);
    assert.equal(again.entities[0].name, 'Maman Rose');
    assert.equal(again.entities[0].data.personne.telephone, undefined);
    assert.equal(D.sync(schema, again.entities, { people: [renamed], places: [] }, 'pull').entitiesChanged, false);
  });

  it('push: edits on a linked entity reach the record and keep what the entity does not carry', () => {
    const first = D.sync(schema, [], { people: [person], places: [] }, 'pull');
    const e = first.entities[0];
    const edited = Object.assign({}, e, { name: 'Maman R.', data: { personne: Object.assign({}, e.data.personne, { courriel: 'new@example.com' }) } });
    const r = D.sync(schema, [edited], { people: [person], places: [] }, 'push');
    assert.equal(r.people[0].name, 'Maman R.');
    assert.equal(r.people[0].email, 'new@example.com');
    assert.equal(r.people[0].relation, 'ma mère');
    assert.equal(r.directoriesChanged.people, true);
  });

  it('push: a new person or place entity gets a record and a link; the cap is respected', () => {
    const ana = M.createEntity(schema, { name: 'Ana', types: ['personne'], data: { personne: { courriel: 'ana@example.com' } } });
    const cafe = M.createEntity(schema, { name: 'Café', types: ['place'], data: { adresse: { adresse: '1 rue Principale' } } });
    const thing = M.createEntity(schema, { name: 'Lampe', types: [] });
    const r = D.sync(schema, [ana, cafe, thing], { people: [], places: [] }, 'push', { max: { people: 40, places: 0 } });
    assert.equal(r.people[0].email, 'ana@example.com');
    assert.equal(r.places[0].address, '1 rue Principale');
    assert.ok(r.entities.find((e) => e.name === 'Ana').source.id.startsWith('person-'));
    assert.equal(r.entities.find((e) => e.name === 'Lampe').source, undefined);
    const capped = D.sync(schema, [ana], { people: [person], places: [] }, 'push', { max: { people: 1 } });
    assert.equal(capped.entities.find((e) => e.name === 'Ana').source, undefined);
    assert.equal(capped.people.length, 1);
  });

  it('an unlinked entity with the same name adopts the record instead of duplicating it', () => {
    const mine = M.createEntity(schema, { name: 'maman', types: ['personne'] });
    const r = D.sync(schema, [mine], { people: [person], places: [] }, 'pull');
    assert.equal(r.entities.length, 1);
    assert.equal(r.entities[0].id, mine.id);
    assert.equal(r.entities[0].source.id, 'person-maman');
  });

  it('a record deleted from its directory leaves its entity, marked gone, and is not recreated', () => {
    const first = D.sync(schema, [], { people: [person], places: [] }, 'pull');
    const gone = D.sync(schema, first.entities, { people: [], places: [] }, 'push', { max: { people: 40 } });
    assert.equal(gone.entities.length, 1);
    assert.equal(gone.entities[0].source.gone, true);
    assert.deepEqual(gone.people, []);
  });

  it('owners link to any entity, including a person from the directory', () => {
    const first = D.sync(schema, [], { people: [person], places: [] }, 'pull');
    const lamp = M.createEntity(schema, { name: 'Lampe', types: ['objet'].filter((t) => M.findById(schema.types, t)), data: { propriete: { proprietaire: [first.entities[0].id] } } });
    assert.deepEqual(lamp.data.propriete.proprietaire, [first.entities[0].id]);
  });
});
