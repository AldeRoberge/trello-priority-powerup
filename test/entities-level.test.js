'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Gauge fields (kind "level")', () => {
  let M, C, L, R, LV;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-composer.js');
    loadComponent('entities/entities-composer-ai.js');
    loadComponent('entities/entities-library.js');
    loadComponent('entities/entities-reality.js');
    loadComponent('entities/entities-level-ui.js');
    M = global.EntitiesModel;
    C = global.EntitiesComposer;
    L = global.EntitiesLibrary;
    R = global.EntitiesReality;
    LV = global.EntitiesLevelUI;
  });

  it('the schema keeps unit, minimum, fixed maximum and the capacity field of a gauge', () => {
    const s = M.upsertComponent(M.defaultSchema(), {
      id: 'pile',
      name: 'Pile',
      fields: [
        { key: 'charge', label: 'Charge', kind: 'level', unit: '%', max: 100 },
        { key: 'espace', label: 'Espace utilisé', kind: 'level', unit: 'Go', maxField: 'Capacité' },
        { key: 'x', label: 'X', kind: 'level', max: -3 },
      ],
    });
    const f = (k) => s.components.find((c) => c.id === 'pile').fields.find((x) => x.key === k);
    assert.equal(f('charge').max, 100);
    assert.equal(f('espace').maxField, 'capacite');
    assert.equal(f('x').max, undefined); // a maximum below the minimum is ignored
    assert.ok(M.FIELD_KINDS.includes('level'));
  });

  it('bounds: the capacity field wins, then the fixed maximum, then a 0-100 guess', () => {
    const field = { key: 'quantite', kind: 'level', unit: 'ml', maxField: 'capacite' };
    assert.deepEqual(M.levelBounds(field, (k) => (k === 'capacite' ? 591 : undefined)), { min: 0, max: 591, known: true, unit: 'ml' });
    assert.equal(M.levelBounds({ kind: 'level', max: 50 }, () => undefined).max, 50);
    const guess = M.levelBounds(field, () => undefined);
    assert.equal(guess.known, false);
    assert.equal(guess.max, 100);
    assert.equal(M.levelBounds({ kind: 'level' }, () => undefined).unit, '%');
  });

  it('values are numbers, never below the minimum nor above a fixed maximum', () => {
    const f = { kind: 'level', max: 100 };
    const s = M.upsertComponent(M.defaultSchema(), { id: 'pile', name: 'Pile', fields: [{ key: 'charge', label: 'Charge', kind: 'level', unit: '%', max: 100 }] });
    const field = M.fieldOf(s, 'pile.charge').field;
    const e = M.createEntity(s, { name: 'Batterie', components: ['pile'], data: { pile: { charge: 250 } } });
    assert.equal(M.getValue(e, 'pile.charge'), 100);
    assert.equal(M.formatValue(field, 70, []), '70 %');
    assert.equal(f.kind, 'level');
  });

  it('one-line specs understand gauges', () => {
    const fields = C.parseFieldSpec('Capacité (nombre: ml), Niveau (jauge: ml), Charge (niveau: %)');
    assert.equal(fields[1].kind, 'level');
    assert.equal(fields[1].maxField, 'capacite');
    assert.equal(fields[2].maxField, 'capacite');
    assert.equal(C.parseFieldSpec('Charge (jauge: %)')[0].max, 100); // no capacity field: a fixed 0-100 scale
    assert.match(C.fieldSpecText(fields), /Niveau \(jauge: ml\)/);
  });

  it('the library bottle: Contenant has a capacity and a Niveau gauge', () => {
    const comp = L.COMPONENTS.find((c) => c.id === 'contenant');
    const q = comp.fields.find((f) => f.key === 'quantite');
    assert.equal(q.kind, 'level');
    assert.equal(q.maxField, 'capacite');
    assert.equal(L.COMPONENTS.find((c) => c.id === 'condition').fields.some((f) => f.key === 'niveau'), false);
  });

  it('readout says how full, or invites to set it', () => {
    const b = { min: 0, max: 591, known: true, unit: 'ml' };
    assert.equal(LV.readout(b, 295.5, 'ml'), '295,5 ml sur 591 ml · 50 %');
    assert.equal(LV.readout(b, '', 'ml'), 'Cliquer pour définir…');
    assert.equal(LV.readout({ min: 0, max: 100, known: false, unit: '%' }, 40, '%'), '40 %');
    assert.equal(LV.stepFor(b), 1);
    assert.equal(LV.stepFor({ min: 0, max: 5 }), 0.1);
  });

  it('a sealed Powerade from the map arrives full, and a gauge never exceeds its capacity', () => {
    const schema = M.defaultSchema();
    const root = C.newDraft({ name: 'Powerade' });
    const ctx = { schema, entities: [], draft: root, library: L };
    const mk = (facts) =>
      R.addBranch(R.emptyPlan(), 'root', R.normalizeBranch({ root: { type: 'produit', components: ['contenant'], facts, confidence: 0.9 }, nodes: [], links: [] }, ctx, 'root'), {});
    const full = R.build(ctx, mk({ 'contenant.quantite': 591, 'contenant.capacite': 591 }), {}).draft;
    assert.equal(full.answers['contenant.capacite'], 591);
    assert.equal(full.answers['contenant.quantite'], 591);
    const over = R.build(ctx, mk({ 'contenant.quantite': 900, 'contenant.capacite': 591 }), {}).draft;
    assert.equal(over.answers['contenant.quantite'], 591); // order of the facts does not matter
    const bounds = M.levelBounds(M.fieldOf(R.build(ctx, mk({}), {}).schema, 'contenant.quantite').field, (k) => full.answers['contenant.' + k]);
    assert.equal(bounds.max, 591);
  });
});
