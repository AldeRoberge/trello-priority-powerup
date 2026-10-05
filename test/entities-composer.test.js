'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('EntitiesComposer', () => {
  let M;
  let C;
  let schema;
  let mairie;
  let ficus;
  let entities;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-composer.js');
    M = global.EntitiesModel;
    C = global.EntitiesComposer;
    assert.ok(C);
  });

  function build() {
    schema = M.defaultSchema();
    schema = M.upsertComponent(schema, {
      name: 'Entretien',
      fields: [
        { key: 'interval_days', label: 'Arroser tous les (jours)', kind: 'number' },
        { key: 'last_done', label: 'Dernier arrosage', kind: 'date' },
        { key: 'health', label: 'Santé', kind: 'choice', options: ['bonne', 'fragile', 'morte'] },
      ],
    });
    schema = M.upsertType(schema, { name: 'Plante', aliases: ['plant'], components: ['location', 'entretien'] });
    mairie = M.createEntity(schema, { name: 'Hôtel de Ville', types: ['place'], aliases: ['travail', 'work'] });
    const maison = M.createEntity(schema, { name: 'Maison', types: ['place'], aliases: ['home'] });
    ficus = M.createEntity(schema, {
      name: 'Ficus',
      types: ['plante'],
      data: { location: { place: mairie.id }, entretien: { interval_days: 7, health: 'bonne' } },
    });
    const monstera = M.createEntity(schema, {
      name: 'Monstera',
      types: ['plante'],
      data: { location: { place: mairie.id }, entretien: { interval_days: 7 } },
    });
    const cactus = M.createEntity(schema, {
      name: 'Cactus',
      types: ['plante'],
      data: { location: { place: maison.id }, entretien: { interval_days: 21 } },
    });
    entities = [mairie, maison, ficus, monstera, cactus];
  }

  describe('parseFieldSpec / defineType', () => {
    before(build);

    it('parses kinds, choice options and link targets', () => {
      const f = C.parseFieldSpec(
        'Fréquence (nombre), Dernier arrosage (date), Santé (choix: bonne/fragile/morte), Lieu (lien: Lieu), Notes',
        schema
      );
      assert.deepEqual(
        f.map((x) => [x.key, x.kind]),
        [
          ['frequence', 'number'],
          ['dernier_arrosage', 'date'],
          ['sante', 'choice'],
          ['lieu', 'ref'],
          ['notes', 'text'],
        ]
      );
      assert.deepEqual(f[2].options, ['bonne', 'fragile', 'morte']);
      assert.deepEqual(f[3].refTypes, ['place']);
    });

    it('keeps commas inside parentheses and drops duplicates', () => {
      const f = C.parseFieldSpec('A (choix: x/y), A, B', schema);
      assert.equal(f.length, 2);
      assert.deepEqual(f[0].options, ['x', 'y']);
    });

    it('a choice without options falls back to text', () => {
      assert.equal(C.parseFieldSpec('Santé (choix)', schema)[0].kind, 'text');
    });

    it('round-trips through fieldSpecText', () => {
      const f = C.parseFieldSpec('Santé (choix: a/b), Âge (nombre)', schema);
      assert.deepEqual(C.parseFieldSpec(C.fieldSpecText(f), schema), f);
    });

    it('defineType creates a type with a new component and reuses existing ones', () => {
      const r = C.defineType(schema, {
        name: 'Outil',
        aliases: ['tool'],
        componentIds: ['location'],
        component: { name: 'Usure', fieldsText: 'État (choix: neuf/usé), Achat (date)' },
      });
      assert.ok(!r.error);
      const t = M.findById(r.schema.types, r.typeId);
      assert.deepEqual(t.components, ['location', 'usure']);
      assert.equal(M.findById(r.schema.components, 'usure').fields.length, 2);
    });

    it('defineType refuses an existing type name or alias and an empty name', () => {
      assert.equal(C.defineType(schema, { name: 'plante' }).error, 'type-exists');
      assert.equal(C.defineType(schema, { name: 'Plants' }).error, 'type-exists');
      assert.equal(C.defineType(schema, { name: '  ' }).error, 'name-required');
    });

    it('defineType never overwrites an existing component with the same name', () => {
      const r = C.defineType(schema, { name: 'Autre', component: { name: 'Entretien', fieldsText: 'X' } });
      assert.equal(M.findById(r.schema.components, 'entretien').fields.length, 3);
      assert.ok(M.findById(r.schema.components, 'entretien_2'));
    });
  });

  describe('readIntent', () => {
    before(build);

    it('reads name, type and a place through the type\'s ref field', () => {
      const r = C.readIntent(schema, entities, 'Palmier, une plante au travail');
      assert.equal(r.name, 'Palmier');
      assert.deepEqual(r.types, ['plante']);
      assert.equal(r.answers['location.place'], mairie.id);
    });

    it('reads a choice value ("morte")', () => {
      const r = C.readIntent(schema, entities, 'Lierre: plante morte');
      assert.equal(r.answers['entretien.health'], 'morte');
    });

    it('works in English', () => {
      const r = C.readIntent(schema, entities, 'Fern is a plant at work');
      assert.equal(r.name, 'Fern');
      assert.deepEqual(r.types, ['plante']);
      assert.equal(r.answers['location.place'], mairie.id);
    });

    it('without a separator the whole text is the name and nothing is inferred', () => {
      const r = C.readIntent(schema, entities, 'Plante verte');
      assert.equal(r.name, 'Plante verte');
      assert.deepEqual(r.types, []);
    });

    it('a mentioned entity without a matching ref field becomes a relation ("situé dans" for a place)', () => {
      const r = C.readIntent(schema, entities, 'Arrosoir, au travail');
      assert.equal(r.name, 'Arrosoir');
      assert.deepEqual(r.relations, [{ type: 'situé dans', to: mairie.id }]);
    });

    it('applyIntent never overwrites what the user already typed', () => {
      let d = C.newDraft({ name: 'Mon nom' });
      d = C.setAnswer(d, 'entretien.health', 'bonne');
      const r = C.readIntent(schema, entities, 'Autre, plante morte au travail');
      d = C.applyIntent(schema, d, r);
      assert.equal(d.name, 'Mon nom');
      assert.equal(d.answers['entretien.health'], 'bonne');
      assert.deepEqual(d.types, ['plante']);
      assert.equal(d.answers['location.place'], mairie.id);
    });
  });

  describe('steps, questions, completeness', () => {
    before(build);

    it('a typeless draft has no component step; types add theirs (composed by union)', () => {
      let d = C.newDraft({ name: 'X' });
      assert.deepEqual(
        C.stepsFor(schema, d).map((s) => s.key),
        ['start', 'identity', 'links', 'review']
      );
      d = C.toggleType(schema, d, 'plante', true);
      assert.deepEqual(
        C.stepsFor(schema, d).map((s) => s.key),
        ['start', 'identity', 'comp:location', 'comp:entretien', 'links', 'review']
      );
    });

    it('unticking a type prunes the answers of components it no longer carries', () => {
      let d = C.toggleType(schema, C.newDraft({ name: 'X' }), 'plante', true);
      d = C.setAnswer(d, 'entretien.health', 'bonne');
      d = C.pruneAnswers(schema, C.toggleType(schema, d, 'plante', false));
      assert.deepEqual(d.answers, {});
    });

    it('completeness counts answers over the questions asked', () => {
      let d = C.toggleType(schema, C.newDraft({ name: 'X' }), 'plante', true);
      assert.deepEqual(C.completeness(schema, d), { answered: 0, total: 4, ratio: 0 });
      d = C.setAnswer(d, 'entretien.health', 'bonne');
      assert.equal(C.completeness(schema, d).answered, 1);
      d = C.setAnswer(d, 'entretien.health', '');
      assert.equal(C.completeness(schema, d).answered, 0);
    });

    it('questionFor names the field', () => {
      const c = M.findById(schema.components, 'entretien');
      assert.equal(C.questionFor(c, c.fields[2], C.newDraft({ name: 'Ficus' })).text, 'Santé ?');
    });
  });

  describe('suggest', () => {
    before(build);

    it('proposes what sibling entities use, most used first', () => {
      const d = C.toggleType(schema, C.newDraft({ name: 'Nouvelle' }), 'plante', true);
      const s = C.suggest(schema, entities, d, 'entretien.interval_days');
      assert.deepEqual(s[0], { value: 7, count: 2 });
      assert.deepEqual(s[1], { value: 21, count: 1 });
    });

    it('ranks the places other plants use first, then the other eligible places', () => {
      const d = C.toggleType(schema, C.newDraft({ name: 'Nouvelle' }), 'plante', true);
      const s = C.suggest(schema, entities, d, 'location.place');
      assert.equal(s[0].value, mairie.id);
      assert.equal(s[0].count, 2);
      assert.equal(s.length, 2);
      assert.ok(s.every((x) => M.findById(entities, x.value).types.includes('place')));
    });

    it('suggests nothing for dates and booleans, nor without siblings', () => {
      const d = C.toggleType(schema, C.newDraft({ name: 'N' }), 'plante', true);
      assert.deepEqual(C.suggest(schema, entities, d, 'entretien.last_done'), []);
      assert.deepEqual(C.suggest(schema, entities, C.newDraft({ name: 'N' }), 'entretien.interval_days'), []);
    });

    it('relationTypes lists the used ones first, then the defaults once', () => {
      const a = M.addRelation(mairie, 'accueille', ficus.id);
      const list = C.relationTypes([a].concat(entities.slice(1)));
      assert.equal(list[0], 'accueille');
      assert.deepEqual(list.slice(1), ['contient', 'fait partie de', 'lié à']);
    });
  });

  describe('issues', () => {
    before(build);

    it('requires a name', () => {
      assert.ok(C.hasError(C.issues(schema, entities, C.newDraft({ name: ' ' }))));
    });

    it('warns about a duplicate name (accents, case and plural ignored)', () => {
      const r = C.issues(schema, entities, C.newDraft({ name: 'hotel de villes', types: ['place'] }));
      assert.equal(r[0].code, 'duplicate-name');
      assert.equal(r[0].level, 'warn');
      assert.equal(C.hasError(r), false);
    });

    it('warns about an alias already used by another entity', () => {
      const r = C.issues(schema, entities, C.newDraft({ name: 'Annexe', aliases: ['Travail'], types: ['place'] }));
      assert.equal(r.filter((i) => i.code === 'alias-clash').length, 1);
    });

    it('counts the other drafts of the composition as taken names', () => {
      const a = C.newDraft({ name: 'Salon', types: ['place'] });
      const b = C.newDraft({ name: 'salon', types: ['place'] });
      assert.equal(C.issues(schema, entities, b, [a])[0].code, 'duplicate-name');
    });

    it('warns when no type is chosen', () => {
      assert.ok(C.issues(schema, entities, C.newDraft({ name: 'Zzz' })).some((i) => i.code === 'no-type'));
    });
  });

  describe('finalize', () => {
    before(build);

    it('creates a new plant together with the new place it points to, linked', () => {
      const place = C.newDraft({ name: 'Salon', types: ['place'], aliases: ['living'] });
      let plant = C.newDraft({ name: 'Palmier', types: ['plante'], aliases: ['palm'] });
      plant = C.setAnswer(plant, 'location.place', place.id);
      plant = C.setAnswer(plant, 'entretien.interval_days', '10');
      plant = C.addRelationTo(plant, 'près de', ficus.id);
      const r = C.finalize(schema, entities, [plant, place]);
      assert.equal(r.created.length, 2);
      assert.equal(r.entities.length, entities.length + 2);
      const p = M.findById(r.entities, plant.id);
      assert.equal(M.getValue(p, 'location.place'), place.id);
      assert.equal(M.getValue(p, 'entretien.interval_days'), 10);
      assert.deepEqual(p.relations, [{ type: 'près de', to: ficus.id }]);
      assert.equal(p.history[0].op, 'create');
      // the new place knows its incoming link
      assert.ok(M.linksOf(schema, r.entities, place.id).some((l) => l.dir === 'in' && l.other === plant.id));
      // and the assistant now resolves it
      assert.deepEqual(
        M.resolveText(schema, r.entities, 'mes plantes au living').entities.map((e) => e.name),
        ['Palmier']
      );
    });

    it('drops links to drafts that were discarded', () => {
      let plant = C.newDraft({ name: 'Orphelin', types: ['plante'] });
      plant = C.setAnswer(plant, 'location.place', 'e_gone');
      plant = C.addRelationTo(plant, 'près de', 'e_gone');
      const r = C.finalize(schema, entities, [plant]);
      const p = r.created[0];
      assert.equal(M.getValue(p, 'location.place'), undefined);
      assert.deepEqual(p.relations, []);
    });

    it('skips drafts with an error and reports them', () => {
      const r = C.finalize(schema, entities, [C.newDraft({ name: '' }), C.newDraft({ name: 'Ok' })]);
      assert.equal(r.created.length, 1);
      assert.equal(r.skipped.length, 1);
    });

    it('a draft of a type created in the same session works once the schema has it', () => {
      const def = C.defineType(schema, { name: 'Outil', component: { name: 'Usure', fieldsText: 'État (choix: neuf/usé)' } });
      const d = C.setAnswer(C.newDraft({ name: 'Marteau', types: [def.typeId] }), 'usure.etat', 'usé');
      const r = C.finalize(def.schema, entities, [d]);
      assert.equal(M.getValue(r.created[0], 'usure.etat'), 'usé');
    });
  });
});
