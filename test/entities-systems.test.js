'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Atomic components, requirements and Systems', () => {
  let M, L, S;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-library.js');
    loadComponent('entities/entities-library-work.js');
    loadComponent('entities/entities-systems.js');
    M = global.EntitiesModel;
    L = global.EntitiesLibrary;
    S = global.EntitiesSystems;
  });

  const NOW = new Date(2026, 9, 6); // 2026-10-06

  function bottleSchema() {
    return L.install(M.defaultSchema(), 'bouteille').schema;
  }

  function make(schema, init) {
    return M.createEntity(schema, init);
  }

  describe('composition', () => {
    it('a water bottle is only Product + Consumable + Container, no class of its own', () => {
      const schema = bottleSchema();
      const t = schema.types.find((x) => x.id === 'bouteille');
      assert.deepEqual(t.components, []);
      assert.deepEqual(t.parents, ['produit', 'consommable', 'contenant']);
      const bottle = make(schema, { name: 'Eau', types: ['bouteille'] });
      const ids = M.componentIdsOf(schema, bottle);
      for (const c of ['produit', 'consommable', 'contenant']) assert.ok(ids.includes(c), c);
    });

    it('a component pulls in the ones it requires, transitively, without loops', () => {
      let s = M.defaultSchema();
      s = M.upsertComponent(s, { id: 'a', name: 'A', requires: ['b'], fields: [] });
      s = M.upsertComponent(s, { id: 'b', name: 'B', requires: ['c', 'a', 'ghost'], fields: [] });
      s = M.upsertComponent(s, { id: 'c', name: 'C', fields: [] });
      s = M.upsertType(s, { id: 't', name: 'T', components: ['a'] });
      const e = make(s, { name: 'x', types: ['t'] });
      assert.deepEqual(M.componentIdsOf(s, e), ['a', 'b', 'c']);
      // removing a component also removes it from what required it, and the rules that read it
      const without = M.removeComponent(s, 'c');
      assert.deepEqual(without.components.find((c) => c.id === 'b').requires, ['a', 'ghost']);
    });

    it('Contenant requires Matière and says what it lets a thing do', () => {
      const schema = bottleSchema();
      const c = schema.components.find((x) => x.id === 'contenant');
      assert.deepEqual(c.requires, ['matiere']);
      assert.deepEqual(c.can, ['contenir']);
      assert.ok(schema.components.some((x) => x.id === 'matiere'));
    });

    it('Task-like things are compositions too: Action = verb + time + place + assignment', () => {
      const schema = L.install(M.defaultSchema(), 'action').schema;
      const e = make(schema, { name: 'Filmer', types: ['action'] });
      const ids = M.componentIdsOf(schema, e);
      for (const c of ['action', 'temps', 'location', 'assignation']) assert.ok(ids.includes(c), c);
    });
  });

  describe('normalizeSystem', () => {
    const schemaOf = () => bottleSchema();

    it('keeps a valid rule and drops conditions outside its components or with a bad operator', () => {
      const schema = schemaOf();
      const s = M.normalizeSystem(
        {
          name: 'Vide',
          on: ['contenant'],
          when: [
            { path: 'contenant.quantite', op: 'eq', value: 0 },
            { path: 'produit.marque', op: 'eq', value: 'x' }, // component not in `on`
            { path: 'contenant.quantite', op: 'whatever' },
            { path: 'contenant.nope', op: 'set' }, // unknown field
          ],
          then: { text: '{name} est vide', level: 'bizarre' },
        },
        schema
      );
      assert.equal(s.when.length, 1);
      assert.equal(s.then.level, 'warn');
      assert.equal(s.enabled, true);
    });

    it('drops a rule with no component or no usable condition', () => {
      const schema = schemaOf();
      assert.equal(M.normalizeSystem({ name: 'x', on: [], when: [{ path: 'a.b', op: 'set' }] }, schema), null);
      assert.equal(M.normalizeSystem({ name: 'x', on: ['contenant'], when: [] }, schema), null);
      assert.equal(M.normalizeSystem({ name: 'x', on: ['contenant'], when: [{ path: 'contenant.quantite', op: 'soon', value: 'abc' }] }, schema), null);
    });

    it('survives the schema round trip and is removable', () => {
      const r = S.install(M.defaultSchema(), 'contenant_vide');
      assert.equal(r.error, undefined);
      const again = M.normalizeSchema(JSON.parse(JSON.stringify(r.schema)));
      assert.equal(again.systems.length, 1);
      assert.equal(M.removeSystem(again, 'contenant_vide').systems, undefined);
    });
  });

  describe('evaluate', () => {
    it('flags an empty container and proposes a card, naming the entity', () => {
      let schema = bottleSchema();
      schema = S.install(schema, 'contenant_vide').schema;
      const empty = make(schema, { name: 'Eau', types: ['bouteille'], data: { contenant: { capacite: 500, quantite: 0 } } });
      const full = make(schema, { name: 'Jus', types: ['bouteille'], data: { contenant: { capacite: 500, quantite: 300 } } });
      const none = make(schema, { name: 'Lait', types: ['bouteille'] });
      const f = S.evaluate(schema, [empty, full, none], { now: NOW });
      assert.equal(f.length, 1);
      assert.equal(f[0].entityId, empty.id);
      assert.equal(f[0].text, 'Eau est vide');
      assert.equal(f[0].card, 'Racheter Eau');
    });

    it('only looks at entities that carry the rule’s components', () => {
      let schema = S.install(bottleSchema(), 'contenant_vide').schema;
      schema = M.upsertType(schema, { id: 'chose', name: 'Chose', components: [] });
      const e = make(schema, { name: 'Chose', types: ['chose'] });
      assert.deepEqual(S.evaluate(schema, [e], { now: NOW }), []);
    });

    it('date rules: soon, past and ago are relative to today', () => {
      let schema = S.install(bottleSchema(), 'bientot_perime').schema;
      const mk = (name, date, extra) => make(schema, { name, types: ['bouteille'], data: { consommable: Object.assign({ peremption: date }, extra) } });
      const list = [mk('Demain', '2026-10-07'), mk('Hier', '2026-10-05'), mk('Loin', '2026-12-01'), mk('Fini', '2026-10-07', { consomme: true }), mk('Sans', undefined)];
      const f = S.evaluate(schema, list, { now: NOW });
      assert.deepEqual(f.map((x) => x.entityName).sort(), ['Demain', 'Hier']);
      assert.equal(f.find((x) => x.entityName === 'Demain').text, 'Demain se périme le 2026-10-07');

      assert.equal(S.holds({ op: 'past' }, '2026-10-05', NOW), true);
      assert.equal(S.holds({ op: 'past' }, '2026-10-06', NOW), false);
      assert.equal(S.holds({ op: 'ago', value: 30 }, '2026-09-01', NOW), true);
      assert.equal(S.holds({ op: 'ago', value: 30 }, '2026-09-20', NOW), false);
      assert.equal(S.holds({ op: 'soon', value: 7 }, undefined, NOW), false);
    });

    it('late tasks come first (alert before info) and a disabled rule is silent', () => {
      let schema = L.install(M.defaultSchema(), ['tache', 'action']).schema;
      schema = S.install(schema, 'echeance_depassee').schema;
      schema = S.install(schema, 'sans_responsable').schema;
      const late = make(schema, { name: 'Rapport', types: ['tache'], data: { travail: { echeance: '2026-10-01', statut: 'en cours' } } });
      const done = make(schema, { name: 'Vieux', types: ['tache'], data: { travail: { echeance: '2026-10-01', statut: 'terminé' } } });
      const act = make(schema, { name: 'Filmer', types: ['action'] });
      const f = S.evaluate(schema, [act, done, late], { now: NOW });
      assert.deepEqual(f.map((x) => x.level + ':' + x.entityName), ['alert:Rapport', 'info:Filmer']);
      const off = M.upsertSystem(schema, Object.assign({}, schema.systems.find((s) => s.id === 'echeance_depassee'), { enabled: false }));
      assert.deepEqual(S.evaluate(off, [late], { now: NOW }), []);
    });

    it('sees values inherited from a model and archetype defaults', () => {
      let schema = S.install(bottleSchema(), 'contenant_vide').schema;
      const model = make(schema, { name: 'Modèle', types: ['bouteille'], data: { contenant: { quantite: 0 } } });
      const variant = M.setBase([model], make(schema, { name: 'Variante', types: ['bouteille'] }), model.id);
      const f = S.evaluate(schema, [model, variant], { now: NOW });
      assert.equal(f.length, 2);
    });
  });

  describe('presets and lint', () => {
    it('every preset installs on an empty schema', () => {
      for (const p of S.PRESETS) {
        const r = S.install(M.defaultSchema(), p.id);
        assert.equal(r.error, undefined, p.id);
        assert.ok(r.schema.systems.some((s) => s.id === p.id), p.id);
      }
    });

    it('describes a rule in one line of French', () => {
      const r = S.install(M.defaultSchema(), 'bientot_perime').schema;
      assert.equal(S.describe(r, r.systems[0]), 'Consommable : Péremption dans 7 jours ou moins, Consommé n’est pas oui');
    });

    it('finds fields repeated across components, ignoring generic labels', () => {
      let s = M.defaultSchema();
      s = M.upsertComponent(s, { id: 'a', name: 'A', fields: [{ key: 'p', label: 'Péremption', kind: 'date' }, { key: 'n', label: 'Notes', kind: 'longtext' }] });
      s = M.upsertComponent(s, { id: 'b', name: 'B', fields: [{ key: 'p', label: 'Péremption', kind: 'date' }, { key: 'n', label: 'Notes', kind: 'longtext' }] });
      const d = S.duplicateFields(s);
      assert.equal(d.length, 1);
      assert.deepEqual(d[0].paths, ['a.p', 'b.p']);
    });

    it('the library has no repeated field left from the split (Péremption lives in Consommable only)', () => {
      const s = L.install(M.defaultSchema(), ['bouteille', 'batiment', 'pays']).schema;
      assert.ok(!S.duplicateFields(s).some((d) => d.label === 'Péremption'));
    });
  });
});
