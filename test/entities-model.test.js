'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('EntitiesModel', () => {
  let M;
  let schema;
  let mairie;
  let maison;
  let ficus;
  let monstera;
  let cactus;
  let entities;

  before(() => {
    loadComponent('entities/entities-model.js');
    M = global.EntitiesModel;
    assert.ok(M);
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
    schema = M.upsertType(schema, {
      name: 'Plante',
      aliases: ['plant', 'verdure'],
      components: ['location', 'entretien'],
    });
    mairie = M.createEntity(schema, { name: 'Hôtel de Ville', types: ['place'], aliases: ['travail', 'work', 'bureau'] });
    maison = M.createEntity(schema, { name: 'Maison', types: ['place'], aliases: ['home', 'chez moi'] });
    ficus = M.createEntity(schema, { name: 'Ficus', types: ['plante'] });
    ficus = M.setValue(schema, ficus, 'location.place', mairie.id);
    ficus = M.setValue(schema, ficus, 'entretien.interval_days', '7');
    monstera = M.createEntity(schema, { name: 'Monstera', types: ['plante'] });
    monstera = M.setValue(schema, monstera, 'location.place', mairie.id);
    monstera = M.setValue(schema, monstera, 'entretien.health', 'Morte');
    cactus = M.createEntity(schema, { name: 'Cactus', types: ['plante'] });
    cactus = M.setValue(schema, cactus, 'location.place', maison.id);
    entities = [mairie, maison, ficus, monstera, cactus];
  }

  it('schema: slugs ids, drops unknown components from types, bounds fields', () => {
    build();
    assert.deepEqual(M.componentIdsOf(schema, ficus), ['location', 'entretien']);
    const s = M.normalizeSchema({
      components: [{ name: 'A b', fields: [{ key: 'x', kind: 'weird' }, { key: 'x' }] }],
      types: [{ name: 'T', components: ['a_b', 'ghost'] }],
    });
    assert.equal(s.components[0].id, 'a_b');
    assert.equal(s.components[0].fields.length, 1);
    assert.equal(s.components[0].fields[0].kind, 'text');
    assert.deepEqual(s.types[0].components, ['a_b']);
  });

  it('values are coerced per field kind and unknown paths throw', () => {
    build();
    assert.equal(M.getValue(ficus, 'entretien.interval_days'), 7);
    assert.equal(M.getValue(monstera, 'entretien.health'), 'morte');
    const bad = M.setValue(schema, ficus, 'entretien.last_done', 'pas une date');
    assert.equal(M.getValue(bad, 'entretien.last_done'), undefined);
    assert.throws(() => M.setValue(schema, ficus, 'nope.x', 1), /unknown-field/);
    const cleared = M.setValue(schema, ficus, 'entretien.interval_days', '');
    assert.equal(M.getValue(cleared, 'entretien.interval_days'), undefined);
    assert.equal(cleared.data.entretien, undefined);
  });

  it('"mes plantes au travail" resolves to the plants whose location is the place aliased "travail"', () => {
    build();
    const r = M.resolveText(schema, entities, 'Arroser mes plantes au travail');
    assert.equal(r.recognized, true);
    assert.deepEqual(r.filter.types, ['plante']);
    assert.deepEqual(r.filter.refersTo, [mairie.id]);
    assert.deepEqual(r.entities.map((e) => e.name).sort(), ['Ficus', 'Monstera']);
  });

  it('works with English wording through aliases and plurals', () => {
    build();
    const r = M.resolveText(schema, entities, 'Water my plants at work');
    assert.deepEqual(r.entities.map((e) => e.name).sort(), ['Ficus', 'Monstera']);
    const home = M.resolveText(schema, entities, 'water the plants at home');
    assert.deepEqual(home.entities.map((e) => e.name), ['Cactus']);
  });

  it('no anchor means every entity of the type; choice values narrow it', () => {
    build();
    assert.equal(M.resolveText(schema, entities, 'arroser mes plantes').entities.length, 3);
    const dead = M.resolveText(schema, entities, 'jeter mes plantes mortes');
    assert.deepEqual(dead.entities.map((e) => e.name), ['Monstera']);
  });

  it('a named entity is a direct pick and unrelated text is not recognized', () => {
    build();
    assert.deepEqual(M.resolveText(schema, entities, 'tailler le ficus').entities.map((e) => e.name), ['Ficus']);
    assert.equal(M.resolveText(schema, entities, 'envoyer le rapport').recognized, false);
  });

  it('longest label wins (Hôtel vs Hôtel de Ville)', () => {
    build();
    const hotel = M.createEntity(schema, { name: 'Hôtel', types: ['place'] });
    const r = M.resolveText(schema, entities.concat([hotel]), 'mes plantes a l hotel de ville');
    assert.deepEqual(r.filter.refersTo, [mairie.id]);
  });

  it('query: where operators and refersTo through relations', () => {
    build();
    const q = (f) => M.query(schema, entities, f).map((e) => e.name).sort();
    assert.deepEqual(q({ types: ['plante'], where: [{ path: 'entretien.interval_days', op: 'gt', value: 3 }] }), ['Ficus']);
    assert.deepEqual(q({ types: ['plante'], where: [{ path: 'entretien.interval_days', op: 'empty' }] }), ['Cactus', 'Monstera']);
    assert.deepEqual(q({ text: 'cactu' }), ['Cactus']);
    const pot = M.createEntity(schema, { name: 'Pot bleu' });
    const linked = M.addRelation(pot, 'contient', cactus.id);
    assert.deepEqual(M.query(schema, entities.concat([linked]), { refersTo: [cactus.id] }).map((e) => e.name), ['Pot bleu']);
  });

  it('relations: de-duplicated, no self link, incoming links listed', () => {
    build();
    let pot = M.createEntity(schema, { name: 'Pot bleu' });
    pot = M.addRelation(pot, 'contient', ficus.id);
    assert.equal(M.addRelation(pot, 'Contient', ficus.id), pot);
    assert.equal(M.addRelation(pot, 'x', pot.id), pot);
    const links = M.linksOf(schema, entities.concat([pot]), ficus.id);
    assert.deepEqual(links.map((l) => l.dir + ':' + l.other), ['in:' + pot.id]);
    const placeLinks = M.linksOf(schema, entities, mairie.id).filter((l) => l.dir === 'in');
    assert.equal(placeLinks.length, 2);
  });

  it('history records every change and can revert them without erasing', () => {
    build();
    let e = M.renameEntity(ficus, 'Ficus Benjamina');
    e = M.setAliases(e, ['arbre']);
    e = M.setValue(schema, e, 'location.place', maison.id);
    const entry = e.history[e.history.length - 1];
    assert.equal(entry.op, 'set');
    const back = M.revertEntry(schema, e, entry.id);
    assert.equal(M.getValue(back, 'location.place'), mairie.id);
    assert.equal(back.history.length, e.history.length + 1);
    assert.equal(back.history[back.history.length - 1].undoOf, entry.id);
    assert.match(M.describeEntry(schema, entities, entry), /Lieu \/ Lieu : Hôtel de Ville → Maison|Maison/);
    const rename = e.history.find((h) => h.op === 'rename');
    assert.equal(M.revertEntry(schema, e, rename.id).name, 'Ficus');
    const create = e.history.find((h) => h.op === 'create');
    assert.equal(M.revertEntry(schema, e, create.id), e);
    // an undo entry cannot itself be reverted
    assert.equal(M.revertEntry(schema, back, back.history[back.history.length - 1].id), back);
  });

  it('history is bounded and fitHistory trims oldest first', () => {
    build();
    let e = ficus;
    for (let i = 0; i < 80; i++) e = M.setValue(schema, e, 'entretien.interval_days', i + 1);
    assert.equal(e.history.length, M.MAX_HISTORY);
    const small = M.fitHistory(e, 800);
    assert.ok(JSON.stringify(small).length <= 800 || small.history.length === 1);
    assert.ok(small.history.length < e.history.length);
    assert.equal(small.history[small.history.length - 1].id, e.history[e.history.length - 1].id);
  });

  it('deleteEntity clears references and records it on the referrers', () => {
    build();
    const next = M.deleteEntity(schema, entities, mairie.id);
    assert.equal(next.some((e) => e.id === mairie.id), false);
    const f = next.find((e) => e.name === 'Ficus');
    assert.equal(M.getValue(f, 'location.place'), undefined);
    assert.equal(f.history[f.history.length - 1].op, 'set');
    assert.equal(M.getValue(next.find((e) => e.name === 'Cactus'), 'location.place'), maison.id);
  });

  it('normalizeEntity drops unknown types, components and fields', () => {
    build();
    const e = M.normalizeEntity(
      {
        id: 'x',
        name: 'Test',
        types: ['plante', 'ghost'],
        data: { entretien: { interval_days: '3', bogus: 1 }, ghost: { a: 1 } },
        relations: [{ to: 'y' }, { to: 'y', type: 'lié à' }, { type: 'bad' }],
      },
      schema
    );
    assert.deepEqual(e.types, ['plante']);
    assert.deepEqual(e.data, { entretien: { interval_days: 3 } });
    assert.equal(e.relations.length, 1);
    assert.equal(M.normalizeEntity({ id: 'z', name: '  ' }, schema), null);
  });

  it('promptLines: catalog by type plus the resolved matches, bounded', () => {
    build();
    const lines = M.promptLines(schema, entities, 'arroser mes plantes au travail');
    const text = lines.join('\n');
    assert.match(text, /Plante \(3\)/);
    assert.match(text, /Ficus \[Plante\]/);
    assert.match(text, /Monstera/);
    assert.equal(/Cactus \[/.test(text), false, 'cactus is at home, not listed as a match');
    assert.deepEqual(M.promptLines(schema, [], 'x'), []);
    const many = [];
    for (let i = 0; i < 200; i++) many.push(M.createEntity(schema, { name: 'Plante numero ' + i, types: ['plante'] }));
    const big = M.promptLines(schema, many, 'mes plantes').join('\n');
    assert.ok(big.length <= 2500);
  });
});
