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
    assert.equal(home.missingOutcome, false);
    assert.equal(home.step.text, 'Rédiger le titre');
    assert.equal(home.work, 40);
    assert.equal(home.metricLabel, '3 / 10');
    assert.equal(home.outcomePct, 30);
    assert.equal(home.missingMeasure, false);
    assert.equal(orphan.missingOutcome, true);
    assert.equal(orphan.missingStep, true);
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
