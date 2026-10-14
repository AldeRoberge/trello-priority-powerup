'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

/**
 * Léa’s project at the Ville: a vision, the mission under it, a goal, a measured objective,
 * a project, the tasks (one blocked, one late, one finished, one a subtask, one attached to nothing),
 * a risk, and the two people who lead the work.
 */
describe('a project traced up to its vision', () => {
  let M;
  let S;
  let schema;
  let entities;
  const NOW = new Date(2026, 9, 13);

  function make(name, type, data) {
    const e = M.createEntity(schema, { name, types: [type], data: data || {} });
    entities.push(e);
    return e;
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
    S = global.EntitiesSystems;
    const installed = global.EntitiesLibraryWork.installAll(M.defaultSchema());
    assert.equal(installed.error, undefined);
    schema = M.upsertType(installed.schema, { id: 'personne', name: 'Personne', nature: 'agent' });
    ['echeance_depassee', 'travail_sans_responsable', 'sans_amont', 'sans_critere'].forEach((id) => {
      const r = S.install(schema, id);
      assert.equal(r.error, undefined, id);
      schema = r.schema;
    });
    entities = [];

    const lea = make('Léa', 'personne');
    const chloe = make('Chloé', 'personne');
    const bureau = make('Bureau 312', 'place');
    const vision = make('Une ville marchable', 'vision');
    const mission = make('Rendre les rues marchables', 'mission', { contribution: { sert: [vision.id] } });
    const but = make('Centre-ville à pied', 'but', { contribution: { sert: [mission.id] } });
    const part = make('Part modale', 'indicateur', { mesure: { depart: 12, actuelle: 18, cible: 30, unite: '%' } });
    const objectif = make('Trente pour cent', 'objectif', {
      contribution: { sert: [but.id] },
      resultat: { succes: '30 % des déplacements à pied', mesures: [part.id], statut: 'en cours' },
    });
    make('Sans chiffre', 'objectif', { contribution: { sert: [but.id] }, resultat: { statut: 'à définir' } });
    const plan = make('Plan des rues', 'livrable');
    const projet = make('Rues piétonnes', 'projet', {
      contribution: { sert: [objectif.id] },
      travail: { responsable: lea.id, statut: 'en cours' },
      projet: { livrables: [plan.id] },
    });
    const permis = make('Permis de voirie', 'tache', {
      contribution: { sert: [projet.id] },
      travail: { responsable: chloe.id, statut: 'en cours' },
    });
    const arpenter = make('Arpenter', 'tache', {
      contribution: { sert: [projet.id] },
      travail: { responsable: lea.id, statut: 'en cours', echeance: '2026-10-01', bloque_par: [permis.id] },
      location: { place: bureau.id },
    });
    make('Compter les passages', 'tache', { travail: { parent: arpenter.id, statut: 'prêt' } });
    make('Rédiger le plan', 'tache', {
      contribution: { sert: [projet.id] },
      travail: { responsable: chloe.id, statut: 'terminé', echeance: '2026-10-01' },
    });
    make('Idée en l’air', 'tache', { travail: { statut: 'backlog' } });
    make('Opposition des commerçants', 'risque', { risque: { menace: [projet.id], probabilite: 'moyenne', impact: 'important' } });
  });

  it('a subtask climbs task, project, objective, goal, mission, vision', () => {
    const sub = entities.find((e) => e.name === 'Compter les passages');
    assert.deepEqual(
      M.purposePath(schema, entities, sub.id).map((e) => e.name),
      ['Une ville marchable', 'Rendre les rues marchables', 'Centre-ville à pied', 'Trente pour cent', 'Rues piétonnes', 'Arpenter', 'Compter les passages']
    );
    const survey = entities.find((e) => e.name === 'Arpenter');
    const where = M.pathOf(schema, entities, survey.id).map((e) => e.name);
    assert.deepEqual(where, ['Bureau 312', 'Arpenter']);
    const line = M.promptLines(schema, entities, 'Arpenter').join('\n');
    assert.match(line, /sert Rues piétonnes/);
    assert.match(line, /Une ville marchable/);
    assert.match(line, /dans Bureau 312/);
  });

  it('the vision is grounded by the project, four links down the ladder', () => {
    const vision = entities.find((e) => e.name === 'Une ville marchable');
    const g = M.groundingOf(schema, entities, vision.id);
    assert.equal(g.grounded, true);
    assert.equal(entities.find((e) => e.id === g.base).name, 'Rues piétonnes');
  });

  it('asks in a sentence: who leads, who blocks, what serves, who is on the crew', () => {
    assert.deepEqual(resolved('tâches dirigées par Léa'), ['Arpenter']);
    assert.deepEqual(resolved('tâches de Léa'), ['Arpenter']);
    assert.deepEqual(resolved('qui bloque Arpenter'), ['Permis de voirie']);
    assert.deepEqual(resolved('qu’est-ce qui est bloqué par Permis de voirie'), ['Arpenter']);
    assert.deepEqual(resolved('mesuré par Part modale'), ['Trente pour cent']);
    assert.deepEqual(resolved('ce qui menace Rues piétonnes'), ['Opposition des commerçants']);
    assert.ok(resolved('ce qui contribue à Une ville marchable').includes('Rendre les rues marchables'));
    assert.ok(resolved('ce qui contribue à Une ville marchable').includes('Arpenter'));
    assert.deepEqual(resolved('dans Rues piétonnes'), ['Arpenter', 'Compter les passages', 'Permis de voirie', 'Rédiger le plan']);
    assert.deepEqual(resolved('travaille avec Léa'), ['Chloé']);
    assert.deepEqual(resolved('ce qui livre Plan des rues'), ['Rues piétonnes']);
    assert.deepEqual(resolved('équipe du projet Rues piétonnes'), ['Chloé', 'Léa']);
  });

  it('a blocked task stores the blocker as the one who blocks', () => {
    const survey = entities.find((e) => e.name === 'Arpenter');
    const permis = entities.find((e) => e.name === 'Permis de voirie');
    const fact = M.factsOf(schema, survey).find((f) => f.def.id === 'blocks');
    assert.equal(fact.subject, permis.id);
    assert.equal(fact.object, survey.id);
  });

  it('flags a late task, an orphan and an objective with no criterion; a finished task is quiet', () => {
    const texts = S.evaluate(schema, entities, { now: NOW }).map((f) => f.text);
    assert.ok(texts.some((t) => t.indexOf('Arpenter est en retard') === 0));
    assert.ok(!texts.some((t) => t.indexOf('Rédiger le plan est en retard') === 0));
    assert.ok(texts.some((t) => t.indexOf('Idée en l’air ne contribue') === 0));
    assert.ok(texts.some((t) => t.indexOf('Personne ne dirige Idée') === 0));
    assert.ok(texts.some((t) => t.indexOf('Sans chiffre n’a pas de critère') === 0));
    assert.ok(!texts.some((t) => t.indexOf('Trente pour cent n’a pas de critère') === 0));
    const objectif = entities.find((e) => e.name === 'Trente pour cent');
    assert.equal(M.getValue(objectif, 'resultat.statut'), 'en cours');
    assert.equal(M.getValue(objectif, 'resultat.obtenu'), undefined);
  });
});
