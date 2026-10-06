'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('EntitiesInterview', () => {
  let M, C, L, I;
  const NOW = new Date(2026, 9, 6);

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-composer.js');
    loadComponent('entities/entities-library.js');
    loadComponent('shared/quick-parse.js');
    loadComponent('entities/entities-interview.js');
    M = global.EntitiesModel;
    C = global.EntitiesComposer;
    L = global.EntitiesLibrary;
    I = global.EntitiesInterview;
    assert.ok(I);
  });

  function base(extra) {
    let schema = L.install(M.defaultSchema(), ['produit', 'personne', 'organisation']).schema;
    const entities = (extra && extra.entities) || [];
    let draft = C.newDraft({ name: 'Tablette graphique', types: ['produit'] });
    const p = I.prepare({ schema, entities, draft, library: L });
    return { schema: p.schema, draft: p.draft, entities, now: NOW, library: L, hints: (extra && extra.hints) || {} };
  }

  it('words: article and "de" agree', () => {
    assert.equal(I.words('Tablette graphique').def, 'la tablette graphique');
    assert.equal(I.words('Tablette graphique').of, 'de la tablette graphique');
    assert.equal(I.words('Écran').def, 'l’écran');
    assert.equal(I.words('Écran').of, 'de l’écran');
    assert.equal(I.words('Vélo').of, 'du vélo');
    assert.equal(I.words('Lunettes').def, 'les lunettes');
    assert.equal(I.words('Vélo', 'la').def, 'la vélo');
  });

  it('prepare adds Emplacement, Acquisition and the Modèle field to a thing', () => {
    const c = base();
    const ids = M.componentIdsOf(c.schema, c.draft);
    ['location', 'acquisition', 'propriete', 'produit'].forEach((id) => assert.ok(ids.includes(id), id));
    assert.ok(M.fieldOf(c.schema, 'produit.modele'));
  });

  it('asks the owner first with Personne / Moi / Employeur and Moi highlighted', () => {
    const c = base();
    const card = I.next(c);
    assert.equal(card.path, 'propriete.proprietaire');
    assert.equal(card.question, 'À qui appartient la tablette graphique ?');
    assert.deepEqual(card.options.map((o) => o.label), ['Personne', 'Moi', 'Employeur']);
    assert.equal(card.best, 1);
  });

  it('Moi creates a person draft and links it as owner', () => {
    const c = base();
    const card = I.next(c);
    const r = I.answer(c, card, { option: 1 });
    assert.equal(r.extra.length, 1);
    assert.equal(r.extra[0].name, 'Moi');
    assert.deepEqual(r.draft.answers['propriete.proprietaire'], [r.extra[0].id]);
    assert.ok(r.extra[0].types.length, 'person type installed');
  });

  it('reuses an existing "Moi" and the employer found in the workspace', () => {
    const schema0 = L.install(M.defaultSchema(), ['produit', 'personne', 'organisation']).schema;
    const moi = M.createEntity(schema0, { name: 'Moi', types: ['personne'] });
    const org = M.createEntity(schema0, { name: 'Ville de Québec', types: ['organisation'] });
    const c = base({ entities: [moi, org] });
    const card = I.next(c);
    assert.equal(card.options[1].entityId, moi.id);
    assert.equal(card.options[2].entityId, org.id);
    assert.equal(card.options[2].detail, 'Ville de Québec');
    const r = I.answer(c, card, { option: 1 });
    assert.deepEqual(r.draft.answers['propriete.proprietaire'], [moi.id]);
    assert.equal(r.extra.length, 0);
  });

  it('Personne opens a sub-question about the person', () => {
    const c = base();
    const r = I.answer(c, I.next(c), { option: 0 });
    assert.ok(r.sub);
    assert.equal(r.sub.question, 'Quelle personne ?');
    const r2 = I.answer(c, r.sub, { text: 'Julie' });
    assert.equal(r2.extra[0].name, 'Julie');
    assert.deepEqual(r2.draft.answers['propriete.proprietaire'], [r2.extra[0].id]);
  });

  it('then brand, model, place and acquisition in order, brand candidate highlighted', () => {
    let c = base({ hints: { candidates: { 'produit.marque': [{ label: 'Huion', confidence: 0.8, source: 'web' }, { label: 'Wacom', confidence: 0.6 }, { label: 'XPPen', confidence: 0.5 }] } } });
    let r = I.answer(c, I.next(c), { option: 1 });
    c = Object.assign({}, c, { draft: r.draft, schema: r.schema });
    const brand = I.next(c);
    assert.equal(brand.question, 'Quelle est la marque de la tablette graphique ?');
    assert.deepEqual(brand.options.map((o) => o.label), ['Huion', 'Wacom', 'XPPen']);
    assert.equal(brand.best, 0);
    r = I.answer(c, brand, { text: '' }); // Enter keeps the highlighted one
    assert.equal(r.draft.answers['produit.marque'], 'Huion');
    c = Object.assign({}, c, { draft: r.draft });
    assert.equal(I.next(c).question, 'Quel est le modèle ?');
    r = I.answer(c, I.next(c), { text: 'Kamvas Pro 13' });
    c = Object.assign({}, c, { draft: r.draft });
    assert.equal(I.next(c).question, 'Où se trouve la tablette graphique en ce moment ?');
    r = I.answer(c, I.next(c), { skip: true });
    c = Object.assign({}, c, { draft: r.draft });
    assert.equal(I.next(c).question, 'Quand avez-vous acquis la tablette graphique ?');
  });

  it('dates accept words and remember how precise they were', () => {
    const c = base();
    const card = I.cardFor(c, 'acquisition.acquis_le');
    const r = I.answer(c, card, { text: 'il y a 2 ans' });
    assert.equal(r.draft.answers['acquisition.acquis_le'], '2024-10-06');
    assert.equal(r.draft.precision['acquisition.acquis_le'], 'vers 2024');
    const bad = I.answer(c, card, { text: 'bof' });
    assert.ok(bad.error);
    assert.equal(bad.draft.answers['acquisition.acquis_le'], undefined);
  });

  it('a place typed is created as a linked draft; an existing one is reused', () => {
    const schema0 = L.install(M.defaultSchema(), ['produit', 'personne']).schema;
    const bureau = M.createEntity(schema0, { name: 'Bureau', types: ['place'] });
    const c = base({ entities: [bureau] });
    const card = I.cardFor(c, 'location.place');
    const a = I.answer(c, card, { text: 'bureau' });
    assert.equal(a.draft.answers['location.place'], bureau.id);
    assert.equal(a.extra.length, 0);
    const b = I.answer(c, card, { text: 'Atelier' });
    assert.equal(b.extra.length, 1);
    assert.equal(b.extra[0].types[0], 'place');
    assert.equal(b.draft.answers['location.place'], b.extra[0].id);
  });

  it('batches confident answers and keeps them with one Enter', () => {
    const hints = {
      candidates: {
        'location.place': [{ label: 'Bureau', confidence: 0.8 }],
        'acquisition.acquis_le': [{ label: 'il y a 2 ans', confidence: 0.7 }],
      },
    };
    let c = base({ hints });
    c = Object.assign({}, c, { draft: I.answer(c, I.cardFor(c, 'propriete.proprietaire'), { skip: true }).draft });
    c = Object.assign({}, c, { draft: I.answer(c, I.cardFor(c, 'produit.marque'), { skip: true }).draft });
    c = Object.assign({}, c, { draft: I.answer(c, I.cardFor(c, 'produit.modele'), { skip: true }).draft });
    const card = I.next(c);
    assert.equal(card.kind, 'batch');
    assert.equal(card.items.length, 2);
    const r = I.answer(c, card, { option: 0 });
    assert.equal(r.draft.answers['acquisition.acquis_le'], '2024-10-06');
    assert.equal(r.extra[0].name, 'Bureau');
    assert.equal(I.next(Object.assign({}, c, { draft: r.draft, schema: r.schema })).path, 'provenance.prix');
  });

  it('"Modifier un par un" turns the batch off', () => {
    const hints = { candidates: { 'location.place': [{ label: 'Bureau', confidence: 0.8 }], 'acquisition.acquis_le': [{ label: '2022', confidence: 0.7 }] } };
    let c = base({ hints });
    ['propriete.proprietaire', 'produit.marque', 'produit.modele'].forEach((p) => {
      c = Object.assign({}, c, { draft: I.answer(c, I.cardFor(c, p), { skip: true }).draft });
    });
    const r = I.answer(c, I.next(c), { option: 1 });
    c = Object.assign({}, c, { draft: r.draft });
    assert.equal(I.next(c).kind, 'field');
  });

  it('asks the type first when none is set, installing a library genre on pick', () => {
    const schema = M.defaultSchema();
    const draft = C.newDraft({ name: 'Tablette graphique' });
    const c = { schema, entities: [], draft, now: NOW, library: L, hints: { types: [{ id: 'produit', confidence: 0.9 }] } };
    const card = I.next(c);
    assert.equal(card.kind, 'type');
    assert.equal(card.options[0].label, 'Produit');
    const r = I.answer(c, card, { option: 0 });
    assert.ok(r.draft.types.length);
    assert.ok(r.schema.types.some((t) => t.id === 'produit'));
    assert.ok(M.componentIdsOf(r.schema, r.draft).includes('location'));
  });

  it('thread lists answers and reopen brings the question back', () => {
    const c = base();
    const r = I.answer(c, I.cardFor(c, 'produit.marque'), { text: 'Huion' });
    const c2 = Object.assign({}, c, { draft: r.draft });
    assert.deepEqual(I.thread(c2).map((t) => t.display), ['Huion']);
    const re = I.reopen(c2, 'produit.marque');
    assert.equal(re.card.path, 'produit.marque');
    assert.equal(re.draft.answers['produit.marque'], undefined);
  });

  it('reachable drops drafts nobody links to', () => {
    const root = C.newDraft({ name: 'A' });
    const used = C.newDraft({ name: 'B' });
    const lost = C.newDraft({ name: 'C' });
    root.answers['location.place'] = used.id;
    const keep = I.reachable(root.id, [root, used, lost]);
    assert.deepEqual(keep.map((d) => d.name), ['A', 'B']);
  });

  it('the finished draft creates the same entity as the page composer', () => {
    let c = base();
    let r = I.answer(c, I.cardFor(c, 'propriete.proprietaire'), { option: 1 });
    let draft = r.draft;
    let extra = r.extra;
    c = Object.assign({}, c, { schema: r.schema, draft });
    r = I.answer(c, I.cardFor(c, 'produit.marque'), { text: 'Huion' });
    draft = r.draft;
    const all = I.reachable(draft.id, [draft].concat(extra));
    const out = C.finalize(c.schema, [], all);
    assert.equal(out.created.length, 2);
    assert.equal(out.skipped.length, 0);
    const tablette = out.created.find((e) => e.name === 'Tablette graphique');
    assert.equal(tablette.data.produit.marque, 'Huion');
    assert.ok(tablette.data.propriete.proprietaire.length);
  });
});
