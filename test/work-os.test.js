'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('WorkOS', () => {
  let WO;
  before(() => {
    loadComponent('shared/work-os.js');
    WO = global.WorkOS;
    assert.ok(WO);
  });

  const row = (id, o) =>
    Object.assign({ id, name: id, statutKey: 'unstarted', pos: 1, priority: 1, due: '', start: '', dueDone: false, items: [] }, o);

  it('the next step is the first open checklist item, including a nested one', () => {
    const s = WO.stepState(row('a', {
      items: [
        { text: 'Fait', done: true, progress: 100 },
        { text: 'Groupe', done: false, progress: 0, items: [{ text: 'Écrire le plan', done: false, progress: 0 }] },
      ],
    }));
    assert.deepEqual(s, { text: 'Écrire le plan', missing: false });
  });

  it('an exhausted checklist flags the card, a card with no checklist does not', () => {
    assert.deepEqual(WO.stepState(row('a', { items: [{ text: 'Fait', done: true, progress: 100 }] })), { text: '', missing: true });
    assert.equal(WO.stepState(row('b')), null);
    assert.equal(WO.stepState(row('c', { statutKey: 'completed', items: [] })), null);
  });

  it('the line under a title is the open step, never a missing-state label', () => {
    assert.equal(WO.stepText(row('a', {
      items: [{ text: 'Écrire le plan', done: false, progress: 0 }],
    })), 'Écrire le plan');
    assert.equal(WO.stepText(row('b', { items: [{ text: 'Fait', done: true, progress: 100 }] })), '');
    assert.equal(WO.stepText(row('c')), '');
  });

  it('a vague horizon is not a calendar day, a time or a lone due date is a deadline', () => {
    assert.equal(WO.dateKind(row('a', { dueVague: 'eventuellement', due: '2026-10-20', start: '2026-10-20' })), 'vague');
    assert.equal(WO.dateKind(row('b', { due: '2026-10-20', start: '2026-10-20', dueTime: '09:00' })), 'hard');
    assert.equal(WO.dateKind(row('c', { due: '2026-10-20' })), 'hard');
    assert.equal(WO.dateKind(row('d', { due: '2026-10-20', start: '2026-10-20' })), 'planned');
    assert.equal(WO.dateKind(row('e', { outlookEvent: 'abc', due: '2026-10-20', start: '2026-10-20' })), 'hard');
  });

  it('review lists triage, a stalled step, a quiet waiting item and too much in progress', () => {
    const rows = [
      row('t', { statutKey: 'triage' }),
      row('s', { items: [{ text: 'Fait', done: true, progress: 100 }] }),
      row('w', { waiting: 'Paul', waitingSince: '2026-10-01' }),
      row('a', { statutKey: 'started', priority: 9 }),
      row('b', { statutKey: 'started', priority: 2 }),
      row('c', { statutKey: 'started', priority: 1 }),
      row('d', { statutKey: 'started', priority: 4 }),
    ];
    const rep = WO.review(rows, { today: '2026-10-13', wipCap: 3 });
    assert.deepEqual(rep.flags.map((f) => f.id), ['triage', 'step', 'waiting', 'wip']);
    assert.equal(rep.wip.park.id, 'c');
    assert.equal(rep.steps[0].id, 's');
    assert.equal(rep.waiting[0].id, 'w');
  });

  it('a project row carries the objective, the next step and separate progress numbers', () => {
    const goals = {
      nodes: [
        { id: 'o', level: 'objective', name: 'Lancer le site' },
        { id: 'p', level: 'project', name: 'Page d’accueil' },
        { id: 'q', level: 'project', name: 'Orphelin' },
      ],
      links: [
        { from: 'p', to: 'o' },
        { from: 'card', to: 'p' },
      ],
    };
    const rows = [
      row('card', { name: 'Homepage', priority: 8, progress: 40, items: [{ text: 'Rédiger le titre', done: false, progress: 0 }] }),
    ];
    const metrics = [{ id: 'm', name: 'Visites', currentValue: 3, target: 10, direction: 'increase', linkedGoalId: 'ob', isPrimary: true }];
    const objectifs = [{ id: 'ob', name: 'Lancer le site' }];
    const chain = WO.projectChain(goals, rows, metrics, objectifs);
    const home = chain.filter((p) => p.id === 'p')[0];
    const orphan = chain.filter((p) => p.id === 'q')[0];
    assert.equal(home.outcome, 'Lancer le site');
    assert.equal(home.outcomeId, 'o');
    assert.equal(home.missingOutcome, false);
    assert.equal(home.step.text, 'Rédiger le titre');
    assert.equal(home.work, 40);
    assert.equal(home.metricLabel, '3 / 10');
    assert.equal(home.outcomePct, 30);
    assert.equal(home.missingMeasure, false);
    assert.equal(orphan.missingOutcome, true);
    assert.equal(orphan.outcomeId, '');
    assert.equal(orphan.missingStep, true);
    const stuck = WO.projectChain(
      { nodes: [{ id: 'p', level: 'project', name: 'P' }], links: [{ from: 'card', to: 'p' }] },
      [row('card', { name: 'Tâche', items: [{ text: 'Fait', done: true, progress: 100 }] })],
      [],
      []
    )[0];
    assert.equal(stuck.step.cardId, 'card');
    assert.equal(stuck.step.text, '');
    assert.equal(stuck.missingStep, true);
    assert.equal(orphan.missingMeasure, false);
  });

  it('finds which documents mention a task or a document', () => {
    const docs = [
      { id: 'd1', title: 'Notes', body: 'Voir [@Homepage](task:card) et [@Autre](doc:d2).' },
      { id: 'd2', title: 'Autre', body: 'Retour à [@Notes](doc:d1).' },
      { id: 'd3', title: 'Phrase', body: 'Voir [site](https://example.com) et [Lord Jesus said](doc:d1).' },
    ];
    assert.deepEqual(WO.backlinks(docs, 'task', 'card'), [{ id: 'd1', title: 'Notes' }]);
    assert.deepEqual(WO.backlinks(docs, 'doc', 'd1'), [{ id: 'd2', title: 'Autre' }, { id: 'd3', title: 'Phrase' }]);
  });

  it('a task linked under a project keeps that project and its objective', () => {
    const goals = {
      nodes: [
        { id: 'g', level: 'goal', name: 'Être lu' },
        { id: 'o', level: 'objective', name: 'Lancer le site' },
        { id: 'p', level: 'project', name: 'Page d’accueil' },
      ],
      links: [
        { from: 'o', to: 'g' },
        { from: 'p', to: 'o' },
        { from: 'card', to: 'p' },
      ],
    };
    const map = WO.places(goals);
    assert.equal(WO.placeLabel(map.card), 'Page d’accueil · Lancer le site');
    assert.equal(map.missing, undefined);
  });

  describe('a task and its project', () => {
    const goals = () => ({
      nodes: [
        { id: 'g', level: 'goal', name: 'Être lu' },
        { id: 'o', level: 'objective', name: 'Lancer le site' },
        { id: 'p', level: 'project', name: 'Page d’accueil' },
        { id: 'q', level: 'project', name: 'Newsletter' },
      ],
      links: [
        { from: 'o', to: 'g' },
        { from: 'p', to: 'o' },
        { from: 'card', to: 'p' },
        { from: 'card', to: 'other' },
      ],
    });

    it('projectOf finds the project above a task, and null for a free task', () => {
      assert.equal(WO.projectOf(goals(), 'card').name, 'Page d’accueil');
      assert.equal(WO.projectOf(goals(), 'free'), null);
      assert.equal(WO.projectOf(null, 'card'), null);
    });

    it('withNodeEdit renames a project and sets or clears its note, leaving the links alone', () => {
      const named = WO.withNodeEdit(goals(), 'p', { name: 'Accueil 2', desc: 'Refonte' });
      assert.equal(named.nodes.find((n) => n.id === 'p').name, 'Accueil 2');
      assert.equal(named.nodes.find((n) => n.id === 'p').desc, 'Refonte');
      assert.equal(named.links.length, goals().links.length);
      const cleared = WO.withNodeEdit(named, 'p', { desc: '  ' });
      assert.equal('desc' in cleared.nodes.find((n) => n.id === 'p'), false);
      assert.equal(WO.withNodeEdit(goals(), 'p', { name: ' ' }).nodes.find((n) => n.id === 'p').name, 'Page d’accueil');
      const marked = WO.withNodeEdit(goals(), 'p', { icon: { i: 'rocket', c: '#0c66e4' } });
      assert.deepEqual(marked.nodes.find((n) => n.id === 'p').icon, { i: 'rocket', c: '#0c66e4' });
      assert.equal('icon' in WO.withNodeEdit(marked, 'p', { icon: null }).nodes.find((n) => n.id === 'p'), false);
    });

    it('withTaskProject moves a task to another project and keeps its dependencies', () => {
      const next = WO.withTaskProject(goals(), 'card', 'q');
      assert.equal(WO.projectOf(next, 'card').name, 'Newsletter');
      assert.deepEqual(next.links.filter((l) => l.from === 'card' || l.to === 'card'), [{ from: 'card', to: 'other' }, { from: 'card', to: 'q' }]);
      assert.equal(next.nodes.length, 4);
    });

    it('withTaskProject drops a direct link to a goal level so the task has one place', () => {
      const g = goals();
      g.links.push({ from: 'card', to: 'o' });
      const next = WO.withTaskProject(g, 'card', 'q');
      assert.deepEqual(next.links.filter((l) => l.from === 'card').map((l) => l.to), ['other', 'q']);
    });

    it('withTaskProject(null) detaches, and only a project can be chosen', () => {
      const none = WO.withTaskProject(goals(), 'card', null);
      assert.equal(WO.projectOf(none, 'card'), null);
      assert.deepEqual(none.links.filter((l) => l.from === 'card'), [{ from: 'card', to: 'other' }]);
      const notProject = WO.withTaskProject(goals(), 'free', 'o');
      assert.deepEqual(notProject.links.filter((l) => l.from === 'free'), []);
      const fresh = WO.withTaskProject(goals(), 'free', 'q');
      assert.equal(WO.projectOf(fresh, 'free').id, 'q');
    });

    it('withProjectOutcome links a project to an objective, or creates one, and can detach it', () => {
      const linked = WO.withProjectOutcome(goals(), 'q', { id: 'o' });
      assert.deepEqual(linked.links.filter((l) => l.from === 'q' || l.to === 'q'), [{ from: 'q', to: 'o' }]);
      assert.equal(WO.projectChain(linked, [], [], []).find((p) => p.id === 'q').outcome, 'Lancer le site');
      const made = WO.withProjectOutcome(goals(), 'q', { id: 'n1', name: '  Diffuser  ' });
      assert.equal(made.nodes.find((n) => n.id === 'n1').name, 'Diffuser');
      assert.equal(made.nodes.find((n) => n.id === 'n1').level, 'objective');
      assert.equal(WO.projectChain(made, [], [], []).find((p) => p.id === 'q').outcomeId, 'n1');
      const off = WO.withProjectOutcome(goals(), 'p', null);
      assert.equal(WO.projectChain(off, [], [], []).find((p) => p.id === 'p').outcome, '');
      assert.deepEqual(off.links.filter((l) => l.from === 'card').map((l) => l.to).sort(), ['other', 'p']);
      assert.deepEqual(off.links.filter((l) => l.from === 'o'), [{ from: 'o', to: 'g' }]);
    });

    it('withProjectOutcome ignores a target that is not an objective, and does not mutate its input', () => {
      const g = goals();
      const before = JSON.stringify(g);
      const same = WO.withProjectOutcome(g, 'q', { id: 'g' });
      assert.equal(JSON.stringify(g), before);
      assert.equal(same.links.some((l) => l.from === 'q'), false);
      assert.equal(WO.withProjectOutcome(g, 'q', { id: 'missing' }).nodes.length, g.nodes.length);
      assert.deepEqual(WO.withProjectOutcome(null, 'p', { id: 'o' }), { nodes: [], links: [] });
      assert.equal(WO.withProjectOutcome(g, 'nope', { id: 'o' }).links.length, g.links.length);
    });

    it('withTaskProject never changes the data it was given, and copes with an empty map', () => {
      const g = goals();
      const before = JSON.stringify(g);
      WO.withTaskProject(g, 'card', 'q');
      assert.equal(JSON.stringify(g), before);
      assert.deepEqual(WO.withTaskProject(null, 'card', 'q'), { nodes: [], links: [] });
    });
  });

  it('a measured result with no date, or an old date, is flagged immobile', () => {
    const fresh = { metricLabel: '3 / 10', metricUpdated: '2026-10-12' };
    const old = { metricLabel: '3 / 10', metricUpdated: '2026-09-01' };
    const none = { metricLabel: '3 / 10', metricUpdated: '' };
    const rep = WO.review([], { today: '2026-10-13', projects: [fresh, old, none] });
    assert.equal(fresh.staleOutcome, false);
    assert.equal(old.staleOutcome, true);
    assert.equal(none.staleOutcome, true);
    assert.equal(rep.flags.filter((f) => f.id === 'stale')[0].detail, '2');
    assert.equal(WO.reviewDue('', '2026-10-13'), true);
    assert.equal(WO.reviewDue('2026-10-10', '2026-10-13'), false);
    assert.equal(WO.reviewDue('2026-10-01', '2026-10-13'), true);
  });
});
