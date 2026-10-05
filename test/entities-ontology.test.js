'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Entities ontology: natures, hierarchy, relations, grounding, library', () => {
  let M;
  let L;
  let C;
  let schema;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-library.js');
    loadComponent('entities/entities-composer.js');
    M = global.EntitiesModel;
    L = global.EntitiesLibrary;
    C = global.EntitiesComposer;
    schema = L.install(M.defaultSchema(), L.TYPES.map((t) => t.id)).schema;
  });

  function make(init) {
    return M.createEntity(schema, init);
  }

  describe('types: natures and lineage', () => {
    it('a type has a nature, parents and a role flag; loops and unknown parents are dropped', () => {
      let s = M.upsertType(M.defaultSchema(), { name: 'A', nature: 'abstract', parents: ['b', 'ghost', 'a'] });
      s = M.upsertType(s, { name: 'B', parents: ['a'] });
      const a = M.findById(s.types, 'a');
      const b = M.findById(s.types, 'b');
      assert.equal(a.nature, 'abstract');
      assert.equal(M.natureById('nope'), null);
      // a->b was declared first (b did not exist yet, dropped); b->a stays, never both
      assert.ok(!(a.parents.includes('b') && b.parents.includes('a')));
      assert.deepEqual(a.parents.includes('ghost'), false);
      assert.equal(M.findById(M.defaultSchema().types, 'place').nature, 'place');
    });

    it('a City is a Place: closure, nature, components and queries follow the parents', () => {
      assert.deepEqual(M.typeClosure(schema, ['ville']).sort(), ['place', 'ville']);
      assert.ok(M.isA(schema, { types: ['pays'] }, 'region'));
      assert.ok(M.isA(schema, { types: ['pays'] }, 'place'));
      assert.equal(M.natureOfType(schema, 'pays'), 'place');
      const mtl = make({ name: 'Montréal', types: ['ville'] });
      const home = make({ name: 'Dépôt', types: ['batiment'] });
      const found = M.query(schema, [mtl, home], { types: ['place'] }).map((e) => e.name);
      assert.deepEqual(found.sort(), ['Dépôt', 'Montréal']);
      assert.deepEqual(M.query(schema, [mtl, home], { types: ['objet'] }).map((e) => e.name), ['Dépôt']);
    });

    it('a Building is a place AND matter: two natures, components of both lineages', () => {
      assert.deepEqual(M.naturesOf(schema, { types: ['batiment'] }), ['place', 'matter']);
      assert.deepEqual(M.componentIdsOf(schema, { types: ['batiment'] }), ['matiere', 'provenance', 'construction']);
    });

    it('a Worker is a Person in a role: it inherits the person fields and flags role', () => {
      assert.equal(M.findById(schema.types, 'travailleur').role, true);
      assert.equal(M.findById(schema.types, 'personne').role, false);
      assert.deepEqual(M.componentIdsOf(schema, { types: ['travailleur'] }), ['personne', 'emploi']);
      assert.equal(M.isMaterial(schema, { types: ['travailleur'] }), true);
    });

    it('deleting a type removes it from its children parents', () => {
      const s = M.removeType(schema, 'place');
      assert.deepEqual(M.findById(s.types, 'ville').parents, []);
    });

    it('subtypesOf lists the descendants', () => {
      assert.deepEqual(
        M.subtypesOf(schema, 'place').map((t) => t.id).sort(),
        ['batiment', 'pays', 'piece', 'region', 'ville']
      );
    });
  });

  describe('field kinds', () => {
    const f = (kind, extra) => Object.assign({ key: 'k', label: 'K', kind }, extra);

    it('geo keeps "lat, lon" in range and rejects the rest', () => {
      assert.equal(M.normalizeEntity({ id: 'x', name: 'x' }, schema).name, 'x');
      const s = M.upsertComponent(M.defaultSchema(), { id: 'c', name: 'C', fields: [f('geo')] });
      const e = M.createEntity(s, { name: 'P', data: {} });
      const set = (v) => M.getValue(M.setValue(s, e, 'c.k', v), 'c.k');
      assert.equal(set('45.5017, -73.5673'), '45.5017, -73.5673');
      assert.equal(set('45,5 ; -73,5'), '45.5, -73.5');
      assert.equal(set('95, 10'), undefined);
      assert.equal(set('abc'), undefined);
    });

    it('url keeps web links only (never javascript:)', () => {
      const s = M.upsertComponent(M.defaultSchema(), { id: 'c', name: 'C', fields: [f('url')] });
      const e = M.createEntity(s, { name: 'P' });
      const set = (v) => M.getValue(M.setValue(s, e, 'c.k', v), 'c.k');
      assert.equal(set('https://exemple.org/a'), 'https://exemple.org/a');
      assert.equal(set('exemple.org/a'), 'https://exemple.org/a');
      assert.equal(set('javascript:alert(1)'), undefined);
      assert.equal(set('data:text/html,x'), undefined);
    });

    it('multi keeps valid options once; longtext keeps line breaks; number shows its unit', () => {
      const s = M.upsertComponent(M.defaultSchema(), {
        id: 'c',
        name: 'C',
        fields: [f('multi', { key: 'm', options: ['sèche', 'mixte'] }), f('longtext', { key: 'l' }), f('number', { key: 'n', unit: 'ml' })],
      });
      let e = M.createEntity(s, { name: 'P' });
      e = M.setValue(s, e, 'c.m', ['Seche', 'mixte', 'mixte', 'grasse']);
      e = M.setValue(s, e, 'c.l', 'ligne 1\nligne 2');
      e = M.setValue(s, e, 'c.n', '50');
      assert.deepEqual(M.getValue(e, 'c.m'), ['sèche', 'mixte']);
      assert.equal(M.getValue(e, 'c.l'), 'ligne 1\nligne 2');
      const fv = (p) => M.formatValue(M.fieldOf(s, p).field, M.getValue(e, p), []);
      assert.equal(fv('c.n'), '50 ml');
      assert.equal(fv('c.m'), 'sèche, mixte');
      assert.equal(M.query(s, [e], { where: [{ path: 'c.m', op: 'eq', value: 'mixte' }] }).length, 1);
    });

    it('the location place field is a "located in" relation (migration of old schemas)', () => {
      const old = M.normalizeSchema({
        components: [{ id: 'location', name: 'Lieu', fields: [{ key: 'place', label: 'Lieu', kind: 'ref', refTypes: ['place'] }] }],
        types: [{ id: 'place', name: 'Lieu' }],
      });
      assert.equal(M.fieldOf(old, 'location.place').field.rel, 'located-in');
      assert.equal(M.findById(old.types, 'place').nature, 'place');
    });
  });

  describe('relation vocabulary', () => {
    it('knows names, inverses and aliases; free text stays free', () => {
      assert.equal(M.matchRelation('Situé dans').def.id, 'located-in');
      assert.equal(M.matchRelation('abrite').dir, 'inv');
      assert.equal(M.inverseLabel('situé dans'), 'abrite');
      assert.equal(M.inverseLabel('contient'), 'fait partie de');
      assert.equal(M.inverseLabel('lié à'), 'lié à');
      assert.equal(M.inverseLabel('cousin éloigné'), 'cousin éloigné');
      assert.equal(M.matchRelation('cousin éloigné'), null);
      assert.equal(M.matchRelation('s’oppose à').def.symmetric, true);
    });

    it('relationsFor puts the relations that fit the natures first, "lié à" last', () => {
      const names = M.relationsFor(['abstract']).map((d) => d.name);
      assert.ok(names.indexOf('ancré dans') < names.indexOf('situé dans') || !names.includes('situé dans'));
      assert.equal(names[names.length - 1], 'lié à');
      assert.ok(!M.relationsFor(['place']).some((d) => d.id === 'grounded-in'));
    });

    it('linksOf gives the inverse label on incoming links', () => {
      const hotel = make({ name: 'Hôtel', types: ['batiment'] });
      const salon = make({ name: 'Salon', types: ['piece'], relations: [{ type: 'situé dans', to: hotel.id }] });
      const l = M.linksOf(schema, [hotel, salon], hotel.id).find((x) => x.other === salon.id);
      assert.equal(l.via, 'situé dans');
      assert.equal(l.inverse, 'abrite');
    });
  });

  describe('containment hierarchy', () => {
    let canada;
    let mtl;
    let hotel;
    let salon;
    let ficus;
    let all;

    before(() => {
      canada = make({ name: 'Canada', types: ['pays'] });
      mtl = make({ name: 'Montréal', types: ['ville'], relations: [{ type: 'situé dans', to: canada.id }] });
      hotel = make({ name: 'Hôtel de Ville', aliases: ['travail'], types: ['batiment'], data: { geographie: { dans: mtl.id } } });
      // "contient" stored on the container side
      hotel = Object.assign({}, hotel, { relations: [{ type: 'contient', to: 'salon-id' }] });
      salon = make({ id: 'salon-id', name: 'Salon', types: ['piece'] });
      ficus = make({ name: 'Ficus', types: ['plante'] });
      all = [canada, mtl, hotel, salon, ficus];
    });

    it('path and ancestors follow located-in, part-of, contient and ref fields with a rel', () => {
      // hotel -> geographie.dans (a ref field with rel) -> Montréal -> situé dans -> Canada; hotel contient salon
      const path = M.pathOf(schema, all, salon.id).map((e) => e.name);
      assert.deepEqual(path, ['Canada', 'Montréal', 'Hôtel de Ville', 'Salon']);
      assert.deepEqual(M.pathOf(schema, all, mtl.id).map((e) => e.name), ['Canada', 'Montréal']);
      assert.deepEqual(M.descendantsOf(schema, all, canada.id), [mtl.id, hotel.id, salon.id]);
    });

    it('a plant in the Salon is found by "at the Hôtel de Ville" and "in Canada" (transitive)', () => {
      const s2 = M.upsertType(
        M.upsertComponent(schema, { id: 'entretien', name: 'Entretien', fields: [{ key: 'x', label: 'x', kind: 'text' }] }),
        { id: 'plante', name: 'Plante', parents: ['etre_vivant'], components: ['location'] }
      );
      const p = M.createEntity(s2, { name: 'Palmier', types: ['plante'], data: { location: { place: salon.id } } });
      const world = [canada, mtl, Object.assign({}, hotel, { relations: [{ type: 'contient', to: salon.id }, { type: 'situé dans', to: mtl.id }] }), salon, p];
      assert.equal(M.query(s2, world, { types: ['plante'], refersTo: [salon.id] }).length, 1);
      assert.equal(M.query(s2, world, { types: ['plante'], refersTo: [world[2].id] }).length, 1, 'inside a room of the hotel');
      assert.equal(M.query(s2, world, { types: ['plante'], refersTo: [canada.id] }).length, 1, 'inside Montréal, inside Canada');
      assert.equal(M.query(s2, world, { types: ['plante'], refersTo: [mtl.id, canada.id] }).length, 1);
      assert.equal(M.query(s2, world, { types: ['plante'], refersTo: [ficus.id] }).length, 0);
      // plants are living: "mes êtres vivants" finds them through the parent type
      assert.equal(M.query(s2, world, { types: ['etre_vivant'] }).length, 1);
    });

    it('wouldCycleRelation refuses a container inside what it contains', () => {
      const world = [canada, mtl];
      assert.equal(M.wouldCycleRelation(schema, world, canada.id, 'situé dans', mtl.id), true);
      assert.equal(M.wouldCycleRelation(schema, world, mtl.id, 'abrite', canada.id), true);
      assert.equal(M.wouldCycleRelation(schema, world, mtl.id, 'situé dans', canada.id), false);
      assert.equal(M.wouldCycleRelation(schema, world, canada.id, 'lié à', mtl.id), false);
      assert.equal(M.wouldCycleRelation(schema, world, canada.id, 'situé dans', canada.id), true);
    });

    it('a loop is reported as an error and does not hang', () => {
      const a = make({ name: 'A', types: ['place'], relations: [{ type: 'situé dans', to: 'b' }], id: 'a' });
      const b = make({ name: 'B', types: ['place'], relations: [{ type: 'situé dans', to: 'a' }], id: 'b' });
      const issues = M.ontologyIssues(schema, [a, b], a);
      assert.ok(issues.some((i) => i.code === 'cycle' && i.level === 'error'));
      assert.ok(M.pathOf(schema, [a, b], 'a').length <= 2);
    });

    it('the assistant prompt shows where an entity is', () => {
      const world = [canada, mtl, Object.assign({}, hotel, { relations: [{ type: 'situé dans', to: mtl.id }] })];
      assert.match(M.describeEntity(schema, world, world[2]), /dans Montréal › Canada/);
    });
  });

  describe('grounding (abstract things need something material)', () => {
    it('a concept alone floats; linked to a material thing within 3 links it is grounded', () => {
      const justice = make({ name: 'Justice', types: ['valeur'] });
      assert.equal(M.groundingOf(schema, [justice], justice.id).grounded, false);
      assert.ok(M.ontologyIssues(schema, [justice], justice).some((i) => i.code === 'floating' && i.level === 'info'));
      const palais = make({ name: 'Palais de justice', types: ['batiment'] });
      const code = make({ name: 'Code civil', types: ['regle'], relations: [{ type: 'exprimé par', to: palais.id }] });
      const j2 = Object.assign({}, justice, { relations: [{ type: 'exprimé par', to: code.id }] });
      const g = M.groundingOf(schema, [j2, code, palais], j2.id);
      assert.equal(g.grounded, true);
      assert.deepEqual(g.path, [j2.id, code.id, palais.id]);
      assert.equal(g.base, palais.id);
      assert.equal(M.ontologyIssues(schema, [j2, code, palais], j2).some((i) => i.code === 'floating'), false);
    });

    it('four links away is too far; a material entity grounds itself', () => {
      const chain = ['a', 'b', 'c', 'd'].map((n) => make({ id: n, name: n, types: ['concept'] }));
      const wall = make({ id: 'wall', name: 'Mur', types: ['objet'] });
      chain[0].relations = [{ type: 'lié à', to: 'b' }];
      chain[1].relations = [{ type: 'lié à', to: 'c' }];
      chain[2].relations = [{ type: 'lié à', to: 'd' }];
      chain[3].relations = [{ type: 'lié à', to: 'wall' }];
      assert.equal(M.groundingOf(schema, chain.concat([wall]), 'a').grounded, false);
      assert.equal(M.groundingOf(schema, chain.concat([wall]), 'b').grounded, true);
      assert.deepEqual(M.groundingOf(schema, [wall], 'wall'), { grounded: true, base: 'wall', path: ['wall'] });
    });

    it('untyped entities and unknown ids are never flagged', () => {
      const plain = make({ name: 'Truc' });
      assert.deepEqual(M.ontologyIssues(schema, [plain], plain), []);
      assert.equal(M.groundingOf(schema, [], 'zzz').grounded, false);
    });

    it('warns when a relation links natures it does not usually link', () => {
      const idea = make({ name: 'Liberté', types: ['valeur'] });
      const salon = make({ name: 'Salon', types: ['piece'], relations: [{ type: 'situé dans', to: idea.id }] });
      const w = M.ontologyIssues(schema, [idea, salon], salon).filter((i) => i.code === 'relation-nature');
      assert.equal(w.length, 1);
      assert.equal(w[0].level, 'warn');
      assert.match(w[0].message, /situé dans/);
      const ok = make({ name: 'Salon', types: ['piece'], relations: [{ type: 'situé dans', to: salon.id }] });
      assert.equal(M.ontologyIssues(schema, [salon, ok], ok).filter((i) => i.code === 'relation-nature').length, 0);
    });
  });

  describe('library', () => {
    it('installs a type with parents, components and link targets, once', () => {
      const r = L.install(M.defaultSchema(), 'travailleur');
      assert.deepEqual(r.added.types, ['Personne', 'Organisation', 'Travailleur']);
      assert.equal(r.typeIds.travailleur, 'travailleur');
      assert.deepEqual(M.findById(r.schema.types, 'travailleur').parents, ['personne']);
      const again = L.install(r.schema, 'travailleur');
      assert.deepEqual(again.added, { types: [], components: [] });
    });

    it('reuses a user type with the same name instead of duplicating it', () => {
      let s = M.upsertType(M.defaultSchema(), { id: 'gens', name: 'Personne', components: [] });
      const r = L.install(s, 'travailleur');
      assert.deepEqual(M.findById(r.schema.types, 'travailleur').parents, ['gens']);
      assert.equal(r.schema.types.filter((t) => t.name === 'Personne').length, 1);
    });

    it('everything fits in the schema card with room to spare', () => {
      const r = L.install(M.defaultSchema(), L.TYPES.map((t) => t.id));
      assert.equal(r.error, undefined);
      assert.ok(JSON.stringify(r.schema).length < M.MAX_SCHEMA_CHARS - 4000);
    });

    it('refuses an install that would overflow the schema card', () => {
      const fat = M.defaultSchema();
      fat.components = Array.from({ length: 30 }, (_, i) => ({
        id: 'c' + i,
        name: 'Composant ' + i,
        fields: Array.from({ length: 20 }, (_x, j) => ({ key: 'f' + j, label: 'Champ numéro ' + j + ' de ' + i, kind: 'text' })),
      }));
      const r = L.install(fat, 'pays');
      assert.equal(r.error, 'schema-too-large');
      assert.equal(r.schema, fat);
    });

    it('missingFor lists the preset types of a nature that are not installed', () => {
      const missing = L.missingFor(M.defaultSchema(), 'place').map((p) => p.id);
      assert.ok(missing.includes('ville') && !missing.includes('place'));
      assert.deepEqual(L.missingFor(schema, 'place'), []);
    });

    it('a hand cream: a product made of substances by an organization, with typed fields', () => {
      const glycerine = make({ name: 'Glycérine', types: ['substance'] });
      const labo = make({ name: 'Labo Nord', types: ['organisation'] });
      const cream = make({
        name: 'Crème pour les mains',
        types: ['produit'],
        data: {
          matiere: { etat: 'gel', volume: '50' },
          provenance: { fabricant: labo.id, prix: '8,5' },
          produit: { marque: 'Nord', ingredients: [glycerine.id], peau: ['sèche', 'sensible'], peremption: '2027-03-01' },
        },
      });
      assert.equal(M.getValue(cream, 'matiere.volume'), 50);
      assert.equal(M.formatValue(M.fieldOf(schema, 'provenance.prix').field, 8.5), '8.5 $');
      assert.deepEqual(M.naturesOf(schema, cream), ['matter']);
      // the ref fields carry relations: made-by, made-of
      const facts = M.factsOf(schema, cream).map((f) => f.def.id).sort();
      assert.deepEqual(facts, ['made-by', 'made-of']);
      assert.equal(M.query(schema, [cream, glycerine], { types: ['objet'] }).length, 1);
      assert.equal(M.query(schema, [cream, glycerine, labo], { refersTo: [glycerine.id] }).length, 1);
    });
  });

  describe('composer: ontology-aware drafts', () => {
    it('offers the types of a nature, parents first', () => {
      const ids = C.typesOfNature(schema, 'place').map((t) => t.id);
      assert.ok(['place', 'region', 'pays', 'ville', 'batiment', 'piece'].every((x) => ids.includes(x)));
      assert.ok(!ids.includes('personne'));
      assert.ok(C.typesOfNature(schema, '').length === schema.types.length);
    });

    it('relationChoices follow the natures of the draft; used custom names come after', () => {
      const d = C.toggleType(schema, C.newDraft({ name: 'Justice' }), 'valeur', true);
      const labels = C.relationChoices(schema, [], d).map((r) => r.label);
      assert.equal(labels[0], 'ancré dans');
      assert.ok(labels.includes('exprimé par') && labels.includes('instance de'));
      const other = make({ name: 'X', relations: [{ type: 'cousin éloigné', to: 'z' }] });
      const withUsed = C.relationChoices(schema, [other], d).map((r) => r.label);
      assert.ok(withUsed.includes('cousin éloigné'));
      assert.equal(C.relationChoices(schema, [], d)[0].inverse, 'ancre');
    });

    it('linksPrompt asks what embodies an idea, what contains a place, what a product is made of', () => {
      const ask = (type) => C.linksPrompt(schema, C.toggleType(schema, C.newDraft({ name: 'Z' }), type, true));
      assert.match(ask('concept').title, /incarne ou exprime/);
      assert.ok(ask('concept').suggested.includes('ancré dans'));
      assert.ok(ask('ville').suggested.includes('situé dans'));
      assert.match(ask('produit').title, /fait|fabriqué|De quoi/);
      assert.ok(ask('travailleur').suggested.includes('travaille pour'));
      assert.equal(C.linksPrompt(schema, C.newDraft({ name: 'Z' })).suggested.length, 0);
    });

    it('issues: a floating concept is an info, never blocking; grounded by a sibling draft it disappears', () => {
      let d = C.toggleType(schema, C.newDraft({ name: 'Justice' }), 'valeur', true);
      let list = C.issues(schema, [], d, []);
      const floating = list.find((i) => i.code === 'floating');
      assert.ok(floating && floating.level === 'info');
      assert.equal(C.hasError(list), false);
      let place = C.toggleType(schema, C.newDraft({ name: 'Palais' }), 'batiment', true);
      d = C.addRelationTo(d, 'exprimé par', place.id);
      list = C.issues(schema, [], d, [place]);
      assert.equal(list.some((i) => i.code === 'floating'), false);
    });

    it('issues: a containment loop between drafts blocks creation', () => {
      let a = C.toggleType(schema, C.newDraft({ name: 'A' }), 'place', true);
      let b = C.toggleType(schema, C.newDraft({ name: 'B' }), 'place', true);
      a = C.addRelationTo(a, 'situé dans', b.id);
      b = C.addRelationTo(b, 'situé dans', a.id);
      assert.ok(C.hasError(C.issues(schema, [], a, [b])));
      const done = C.finalize(schema, [], [a, b]);
      assert.equal(done.created.length, 0);
      assert.equal(done.skipped.length, 2);
    });

    it('parseFieldSpec reads the new kinds and units', () => {
      const f = C.parseFieldSpec('Poids (nombre: kg), Peau (choix-multiple: sèche/mixte), Résumé (texte-long), Position (geo), Site (url)', schema);
      assert.deepEqual(
        f.map((x) => x.kind),
        ['number', 'multi', 'longtext', 'geo', 'url']
      );
      assert.equal(f[0].unit, 'kg');
      assert.deepEqual(f[1].options, ['sèche', 'mixte']);
      assert.equal(C.parseFieldSpec(C.fieldSpecText(f), schema).length, 5);
      assert.equal(C.fieldSpecText(f), 'Poids (nombre: kg), Peau (choix-multiple: sèche/mixte), Résumé (texte-long), Position (geo), Site (url)');
    });

    it('defineType takes a nature, parents and role', () => {
      const r = C.defineType(schema, { name: 'Gardien', nature: 'agent', parents: ['personne', 'ghost'], role: true, description: 'Garde un lieu' });
      assert.equal(r.error, undefined);
      const t = M.findById(r.schema.types, r.typeId);
      assert.equal(t.nature, 'agent');
      assert.deepEqual(t.parents, ['personne']);
      assert.equal(t.role, true);
      assert.deepEqual(M.componentIdsOf(r.schema, { types: [r.typeId] }), ['personne']);
    });

    it('suggestions and eligibility see subtypes: a city is offered where a place is asked', () => {
      const mtl = make({ name: 'Montréal', types: ['ville'] });
      const d = C.toggleType(schema, C.newDraft({ name: 'Mairie' }), 'batiment', true);
      const field = M.fieldOf(schema, 'geographie.dans').field;
      assert.equal(C.eligible(field, mtl, d), false, 'without the schema only exact types count');
      assert.equal(C.eligible(field, mtl, d, schema), true);
      const sugg = C.suggest(schema, [mtl], d, 'geographie.dans');
      assert.deepEqual(sugg, [{ value: mtl.id, count: 0 }]);
    });
  });
});
