'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

/**
 * Léa’s week in Montréal, built only with the entity model: places inside places, people and
 * kinship, objects and plants that live somewhere, a task, and two ideas (one grounded, one floating).
 * The assertions are the pitfalls this map ran into.
 */
const NOW = new Date(2026, 9, 13);

describe('a simulated life in Entités', () => {
  let M;
  let L;
  let S;
  let schema;
  let entities;
  let lea;
  let marc;
  let emma;
  let suzanne;
  let noah;
  let chloe;
  let nemo;
  let appart;
  let cuisine;
  let hotel;
  let monstera;
  let ficus;
  let cactus;
  let chorale;

  function put(e) {
    const i = entities.findIndex((x) => x.id === e.id);
    if (i < 0) entities.push(e);
    else entities[i] = e;
    return e;
  }
  function make(init) {
    return put(M.createEntity(schema, init));
  }
  function set(e, path, value) {
    return put(M.setValue(schema, e, path, value));
  }
  function rel(e, type, to) {
    return put(M.addRelation(e, type, to));
  }
  function names(list) {
    return list.map((e) => e.name).sort();
  }
  function resolved(text) {
    return names(M.resolveText(schema, entities, text).entities);
  }

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-library.js');
    loadComponent('entities/entities-library-work.js');
    loadComponent('entities/entities-systems.js');
    M = global.EntitiesModel;
    L = global.EntitiesLibrary;
    S = global.EntitiesSystems;
    const installed = L.install(M.defaultSchema(), [
      'pays', 'region', 'ville', 'batiment', 'piece',
      'personne', 'travailleur', 'organisation', 'groupe', 'famille',
      'plante', 'animal', 'objet', 'bouteille',
      'valeur', 'regle', 'tache',
    ]);
    assert.equal(installed.error, undefined);
    schema = installed.schema;
    ['contenant_vide', 'bientot_perime', 'echeance_depassee', 'entretien_en_retard'].forEach((id) => {
      const r = S.install(schema, id);
      assert.equal(r.error, undefined, id);
      schema = r.schema;
    });
    entities = [];

    const canada = make({ name: 'Canada', types: ['pays'] });
    const quebec = set(make({ name: 'Québec', types: ['region'] }), 'geographie.dans', canada.id);
    const mtl = set(make({ name: 'Montréal', types: ['ville'] }), 'geographie.dans', quebec.id);
    appart = set(make({ name: 'Appartement de Léa', types: ['batiment'], aliases: ['maison', 'chez moi'] }), 'location.place', mtl.id);
    cuisine = set(make({ name: 'Cuisine', types: ['piece'] }), 'espace.dans', appart.id);
    const salon = set(make({ name: 'Salon', types: ['piece'] }), 'espace.dans', appart.id);
    const chambre = set(make({ name: 'Chambre', types: ['piece'] }), 'espace.dans', appart.id);
    const sdb = set(make({ name: 'Salle de bain', types: ['piece'] }), 'espace.dans', appart.id);
    hotel = set(make({ name: 'Hôtel de Ville', types: ['batiment'], aliases: ['travail', 'work', 'bureau'] }), 'location.place', mtl.id);
    const bureau = set(make({ name: 'Bureau 312', types: ['piece'] }), 'espace.dans', hotel.id);
    const ville = make({ name: 'Ville de Montréal', types: ['organisation'] });

    lea = make({ name: 'Léa Tremblay', types: ['personne', 'travailleur'], aliases: ['Léa', 'lea'] });
    lea = set(lea, 'personne.residence', appart.id);
    lea = set(lea, 'emploi.employeur', ville.id);
    lea = set(lea, 'emploi.poste', 'Conceptrice');
    marc = set(make({ name: 'Marc', types: ['personne'] }), 'personne.residence', appart.id);
    emma = set(make({ name: 'Emma', types: ['personne'] }), 'personne.residence', appart.id);
    suzanne = make({ name: 'Suzanne', types: ['personne'] });
    noah = set(make({ name: 'Noah', types: ['personne'] }), 'personne.residence', quebec.id);
    chloe = set(make({ name: 'Chloé', types: ['personne', 'travailleur'] }), 'emploi.employeur', ville.id);
    nemo = make({ name: 'Nemo', types: ['animal'], aliases: ['le chat'] });

    lea = rel(lea, 'conjoint de', marc.id);
    lea = rel(lea, 'parent de', emma.id);
    suzanne = rel(suzanne, 'parent de', lea.id);
    lea = rel(lea, 'frère ou sœur de', noah.id);
    lea = rel(lea, 's’occupe de', nemo.id);

    monstera = set(make({ name: 'Monstera', types: ['plante'] }), 'location.place', salon.id);
    monstera = set(monstera, 'entretien.dernier', '2026-09-01');
    ficus = set(make({ name: 'Ficus', types: ['plante'] }), 'location.place', bureau.id);
    ficus = set(ficus, 'entretien.dernier', '2026-10-12');
    cactus = set(make({ name: 'Cactus', types: ['plante'] }), 'location.place', chambre.id);

    const cles = set(make({ name: 'Clés', types: ['objet'] }), 'location.place', cuisine.id);
    set(make({ name: 'iPhone', types: ['objet'], aliases: ['téléphone'] }), 'location.place', chambre.id);
    let lait = set(make({ name: 'Lait', types: ['bouteille'] }), 'location.place', cuisine.id);
    lait = set(lait, 'contenant.quantite', 200);
    lait = set(lait, 'consommable.peremption', '2026-10-16');
    let eau = set(make({ name: 'Bouteille d’eau', types: ['bouteille'] }), 'location.place', cuisine.id);
    eau = set(eau, 'contenant.capacite', 750);
    eau = set(eau, 'contenant.quantite', 0);
    set(make({ name: 'Crème pour les mains', types: ['objet'] }), 'location.place', sdb.id);
    const livre = set(make({ name: 'L’Étranger', types: ['objet'] }), 'location.place', salon.id);

    const regle = rel(make({ name: 'Pas d’alcool en semaine', types: ['regle'] }), 'exprimé par', livre.id);
    const sobriete = rel(make({ name: 'Sobriété', types: ['valeur'] }), 'exprimé par', regle.id);
    make({ name: 'Justice', types: ['valeur'] });

    let arroser = make({ name: 'Arroser les plantes', types: ['tache'] });
    arroser = set(arroser, 'travail.responsable', lea.id);
    arroser = set(arroser, 'travail.echeance', '2026-10-01');
    arroser = set(arroser, 'travail.statut', 'en cours');
    arroser = set(arroser, 'location.place', salon.id);
    arroser = set(arroser, 'contribution.sert', [sobriete.id]);
    rel(arroser, 'utilise', monstera.id);

    let famille = make({ name: 'Famille Tremblay', types: ['famille'] });
    [lea, marc, emma, suzanne, noah].forEach((p) => {
      famille = rel(famille, 'a pour membre', p.id);
    });
    make({ name: 'Équipe urbanisme', types: ['groupe'] });
    chorale = make({ name: 'Chorale', types: ['groupe'] });
    lea = rel(lea, 'membre de', chorale.id);

    assert.equal(cles.name, 'Clés');
  });

  it('installing Lieu fills the empty built-in type, and a second install adds nothing', () => {
    const place = M.findById(schema.types, 'place');
    assert.ok(place.components.includes('adresse'));
    assert.ok(place.components.includes('propriete'));
    assert.equal(M.effectiveValue(entities, monstera, 'entretien.frequence', schema), 7);
    const again = L.install(schema, 'ville');
    assert.deepEqual(again.added, { types: [], components: [] });
  });

  it('an object, a plant and a task each have a place', () => {
    const cles = entities.find((e) => e.name === 'Clés');
    const arroser = entities.find((e) => e.name === 'Arroser les plantes');
    assert.ok(M.componentIdsOf(schema, cles).includes('location'));
    assert.ok(M.componentIdsOf(schema, monstera).includes('location'));
    assert.ok(M.componentIdsOf(schema, arroser).includes('location'));
  });

  it('Léa’s path is her home, and the ficus is at the office', () => {
    assert.deepEqual(M.pathOf(schema, entities, lea.id).map((e) => e.name), [
      'Canada', 'Québec', 'Montréal', 'Appartement de Léa', 'Léa Tremblay',
    ]);
    assert.deepEqual(M.pathOf(schema, entities, ficus.id).map((e) => e.name).slice(-3), [
      'Hôtel de Ville', 'Bureau 312', 'Ficus',
    ]);
  });

  it('plants at work are not the plants at home, and « bureau » is the place', () => {
    assert.deepEqual(resolved('arroser mes plantes au travail'), ['Ficus']);
    assert.deepEqual(resolved('mes plantes au bureau'), ['Ficus']);
    assert.deepEqual(resolved('mes plantes à la maison'), ['Cactus', 'Monstera']);
    assert.deepEqual(resolved('au bureau'), ['Hôtel de Ville']);
  });

  it('a type alias « bureau » does not steal the place of the same name', () => {
    const piece = M.findById(schema.types, 'piece');
    const s = M.upsertType(schema, Object.assign({}, piece, { aliases: piece.aliases.concat(['bureau']) }));
    const r = M.resolveText(s, entities, 'mes plantes au bureau');
    assert.deepEqual(r.filter.types, ['plante']);
    assert.deepEqual(names(r.entities), ['Ficus']);
  });

  it('« dans la cuisine » lists what is inside; « qui habite » lists the residents', () => {
    assert.deepEqual(resolved('qu’est-ce qu’il y a dans la cuisine'), ['Bouteille d’eau', 'Clés', 'Lait']);
    assert.deepEqual(resolved('qui habite à la maison'), ['Emma', 'Léa Tremblay', 'Marc']);
    assert.deepEqual(resolved('qui habite à Montréal'), ['Emma', 'Léa Tremblay', 'Marc']);
    assert.ok(resolved('qui habite au Québec').includes('Noah'));
    assert.ok(!resolved('qui habite à Montréal').includes('Noah'));
    assert.ok(!resolved('qui habite à la maison').includes('Chloé'));
  });

  it('kinship, the pet and colleagues (same employer, no stored link)', () => {
    assert.deepEqual(resolved('les enfants de Léa'), ['Emma']);
    assert.deepEqual(resolved('le conjoint de Léa'), ['Marc']);
    assert.deepEqual(resolved('les parents de Léa'), ['Suzanne']);
    assert.deepEqual(resolved('qui s’occupe de Nemo'), ['Léa Tremblay']);
    assert.deepEqual(resolved('les collègues de Léa'), ['Chloé']);
    assert.deepEqual(resolved('mes collègues'), ['Chloé', 'Léa Tremblay']);
    assert.deepEqual(resolved('mes animaux'), ['Nemo']);
    const circle = M.circleOf(schema, entities, lea.id);
    assert.equal(circle.home, appart.id);
    assert.deepEqual(names(circle.partners), ['Marc']);
    assert.deepEqual(names(circle.children), ['Emma']);
    assert.deepEqual(names(circle.parents), ['Suzanne']);
    assert.deepEqual(names(circle.siblings), ['Noah']);
    assert.deepEqual(names(circle.pets), ['Nemo']);
    assert.deepEqual(names(circle.colleagues), ['Chloé']);
  });

  it('« ma famille » is the family, not every group, and a member link stored on the person still shows', () => {
    assert.deepEqual(resolved('la famille de Léa'), ['Famille Tremblay']);
    assert.deepEqual(resolved('ma famille'), ['Famille Tremblay']);
    assert.ok(M.peopleRelations(schema, chorale, entities).some((r) => r.to === lea.id));
    assert.equal(M.peopleRelations(schema, chorale).length, 0);
  });

  it('overdue care, an empty bottle, milk and a late task are flagged; the watered ficus is not', () => {
    const hit = S.evaluate(schema, entities, { now: NOW }).map((f) => f.entityName + ' · ' + f.systemId);
    assert.ok(hit.some((t) => t.startsWith('Monstera · entretien_en_retard')));
    assert.ok(hit.some((t) => t.startsWith('Cactus · entretien_en_retard')));
    assert.ok(!hit.some((t) => t.startsWith('Ficus')));
    assert.ok(hit.some((t) => t.includes('Bouteille d’eau · contenant_vide')));
    assert.ok(hit.some((t) => t.includes('Lait · bientot_perime')));
    assert.ok(hit.some((t) => t.includes('Arroser les plantes · echeance_depassee')));
  });

  it('sobriety is grounded in the book; justice floats', () => {
    const sobriete = entities.find((e) => e.name === 'Sobriété');
    const justice = entities.find((e) => e.name === 'Justice');
    assert.equal(M.groundingOf(schema, entities, sobriete.id).grounded, true);
    assert.equal(M.groundingOf(schema, entities, justice.id).grounded, false);
    assert.ok(M.ontologyIssues(schema, entities, justice).some((i) => i.code === 'floating'));
    assert.ok(!M.ontologyIssues(schema, entities, sobriete).some((i) => i.code === 'floating'));
  });

  it('the assistant still hears the resolved person when the catalog is long', () => {
    const text = M.promptLines(schema, entities, 'le conjoint de Léa').join('\n');
    assert.match(text, /Marc/);
    assert.ok(text.indexOf('Marc') < text.indexOf('Plante ('));
  });
});
