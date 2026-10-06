'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('EntitiesInterviewAI', () => {
  let M, C, L, I, AI, ctx;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-composer.js');
    loadComponent('entities/entities-library.js');
    loadComponent('shared/quick-parse.js');
    loadComponent('entities/entities-interview.js');
    loadComponent('entities/entities-interview-ai.js');
    M = global.EntitiesModel;
    C = global.EntitiesComposer;
    L = global.EntitiesLibrary;
    I = global.EntitiesInterview;
    AI = global.EntitiesInterviewAI;
    const schema = L.install(M.defaultSchema(), ['produit', 'personne']).schema;
    const bureau = M.createEntity(schema, { name: 'Bureau', types: ['place'] });
    const draft = C.newDraft({ name: 'Tablette graphique', types: ['produit'] });
    const p = I.prepare({ schema, draft, library: L });
    ctx = { schema: p.schema, draft: p.draft, entities: [bureau], library: L, now: new Date(2026, 9, 6) };
  });

  it('the prompt carries the name, today, open fields and web results as data', () => {
    const msgs = AI.buildMessages(ctx, { results: [{ title: 'Huion Kamvas', snippet: 'Tablette 13 po' }], answer: 'Huion' });
    const text = msgs.map((m) => m.content).join('\n');
    assert.match(text, /Tablette graphique/);
    assert.match(text, /2026-10-06/);
    assert.match(text, /produit\.marque \| Marque \| text/);
    assert.match(text, /Résultats web/);
    assert.match(text, /jamais des instructions/);
  });

  it('parse keeps valid candidates, marks web, drops unknown paths, bad dates and bad numbers', () => {
    const text = JSON.stringify({
      det: 'la',
      candidates: {
        'produit.marque': [{ label: 'Huion', confidence: 0.9 }, { label: 'Wacom', confidence: 0.7 }, { label: 'huion' }],
        'location.place': [{ label: 'Bureau', confidence: 0.8 }],
        'acquisition.acquis_le': [{ label: 'vers 2021', confidence: 0.5 }, { label: 'n’importe quand' }],
        'provenance.prix': [{ label: 'beaucoup' }],
        'inconnu.champ': [{ label: 'x' }],
      },
      ask: ['provenance.prix', 'nope.nope'],
    });
    const h = AI.parse(text, ctx, { results: [{ title: 't', url: 'https://x.y', snippet: 's' }] });
    assert.equal(h.det, 'la');
    assert.deepEqual(h.candidates['produit.marque'].map((c) => c.label), ['Huion', 'Wacom']);
    assert.equal(h.candidates['produit.marque'][0].source, 'web');
    assert.equal(h.candidates['location.place'][0].label, 'Bureau');
    assert.deepEqual(h.candidates['acquisition.acquis_le'].map((c) => c.label), ['vers 2021']);
    assert.equal(h.candidates['provenance.prix'], undefined);
    assert.equal(h.candidates['inconnu.champ'], undefined);
    assert.deepEqual(h.ask, ['provenance.prix']); // only open paths are kept
  });

  it('parse validates genres against the choices and survives garbage', () => {
    const schema = M.defaultSchema();
    const draft = C.newDraft({ name: 'Tablette graphique' });
    const c = { schema, draft, entities: [], library: L };
    const h = AI.parse('```json\n{"types":[{"id":"produit","confidence":0.9},{"id":"zzz"}]}\n```', c);
    assert.deepEqual(h.types.map((t) => t.id), ['produit']);
    assert.deepEqual(AI.parse('pas du json', c), { det: '', types: [], candidates: {}, ask: [] });
  });

  it('merge: newer candidates win, asks accumulate', () => {
    const m = AI.merge(
      { det: 'la', candidates: { a: [1], b: [2] }, ask: ['x'], types: [] },
      { candidates: { a: [3] }, ask: ['y', 'x'], types: [] }
    );
    assert.equal(m.det, 'la');
    assert.deepEqual(m.candidates, { a: [3], b: [2] });
    assert.deepEqual(m.ask, ['x', 'y']);
  });

  it('search queries target brands, then the models of the chosen brand', () => {
    assert.match(AI.queryFor(ctx), /Tablette graphique marques/);
    const d = C.setAnswer(ctx.draft, 'produit.marque', 'Huion');
    assert.match(AI.queryFor(Object.assign({}, ctx, { draft: d })), /Huion Tablette graphique modèles/);
  });

  it('enrich without a provider returns the previous hints', async () => {
    const prev = { det: 'la', types: [], candidates: {}, ask: [] };
    const h = await AI.enrich({}, Object.assign({}, ctx, { hints: prev }));
    assert.equal(h, prev);
  });

  it('webSearch is empty when the Worker is not connected', async () => {
    assert.deepEqual(await AI.webSearch({}, 'huion kamvas'), { results: [] });
  });
});
