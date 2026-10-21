'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('TriageDocTrello', () => {
  let TD;
  let M;
  let calls;
  let cards;
  let goalsStore;
  let goalsSaves;
  let failOn;
  let savedConsoleError;
  const t = {};
  const lists = [
    { id: 'l0', name: 'Inbox', category: 'triage' },
    { id: 'l1', name: 'À faire', category: 'unstarted' },
  ];
  const rawCtx = {
    projects: [{ id: 'g:p1', name: 'Refonte du site' }],
    members: [{ id: 'm2', fullName: 'Marie Gagnon', username: 'marie' }],
    customAssignees: [{ id: 'c1', name: 'Sylviane Mailhot' }],
    places: [{ id: 'p1', name: 'Bureau' }],
    labels: [{ id: 'lb3', name: 'Finances', color: 'green' }],
  };

  before(() => {
    loadComponent('kanban/kanban-ai.js');
    loadComponent('shared/work-os.js');
    loadComponent('dashboard/dashboard-model.js');
    loadComponent('dashboard/dashboard-trello.js');
    loadComponent('dashboard/triage-doc-model.js');
    loadComponent('dashboard/triage-doc-trello.js');
    TD = global.TriageDocTrello;
    M = global.TriageDocModel;
    assert.ok(TD && M);
  });

  beforeEach(() => {
    savedConsoleError = console.error;
    console.error = () => {};
    calls = [];
    cards = 0;
    failOn = {};
    goalsStore = { nodes: [{ id: 'g:p1', level: 'project', name: 'Refonte du site' }], links: [] };
    goalsSaves = 0;
    const log = (name) => (...args) => { calls.push([name].concat(args.slice(1))); };
    global.TableTrello = {
      createRow: async (tt, name, listId) => {
        if (failOn.create === name) throw new Error('refusé');
        calls.push(['create', name, listId]);
        return { cardId: 'card' + ++cards };
      },
      archiveCard: async (tt, id) => { calls.push(['archive', id]); },
    };
    global.PriorityTrello = {
      restPutCard: async (tt, id, body) => {
        if (failOn.put) throw new Error('http 500');
        calls.push(['put', id, body]);
        return { ok: true };
      },
      saveCardInputsById: async (tt, id, patch) => { calls.push(['inputs', id, patch]); return patch; },
      getCustomAssigneeCatalog: async () => [{ id: 'c1', name: 'Sylviane Mailhot' }],
      saveCustomAssigneeCatalog: async (tt, list) => { calls.push(['customs', list.map((c) => c.name)]); return list; },
      getPlaceCatalog: async () => [{ id: 'p1', name: 'Bureau' }],
      savePlaceCatalog: async (tt, list) => { calls.push(['places', list.map((p) => p.name)]); return list; },
      getBoardMembers: async () => rawCtx.members,
      getBoardLabels: async () => rawCtx.labels,
    };
    global.PriorityUI = {
      createCustomAssignee: ({ name }) => ({ id: 'new-' + name.toLowerCase().replace(/\W+/g, '-'), name }),
      createPlaceRef: (name) => ({ id: 'place-' + String(name).toLowerCase().replace(/\W+/g, '-'), name: String(name) }),
    };
    global.CompletionTrello = {
      normalizeCompletionData: (d) => d,
      saveCardCompletionById: async (tt, id, data) => { calls.push(['items', id, data.items]); return data; },
    };
    Object.assign(global.DashboardTrello, {
      planDay: async (tt, id, iso) => { calls.push(['day', id, iso]); },
      saveEstimate: async (tt, id, min) => { calls.push(['estimate', id, min]); },
      attachFile: async (tt, id, file) => { calls.push(['attach', id, file.name]); },
    });
    global.MindmapGoalsTrello = {
      newId: () => 'g:new' + (goalsSaves + 1),
      load: async () => JSON.parse(JSON.stringify(goalsStore)),
      save: async (tt, data) => {
        goalsSaves++;
        if (failOn.conflict && goalsSaves === 1) { const e = new Error('conflict'); e.reason = 'conflict'; throw e; }
        goalsStore = JSON.parse(JSON.stringify(data));
        calls.push(['goals', data.links.length, data.nodes.length]);
        return data;
      },
    };
  });

  afterEach(() => { console.error = savedConsoleError; });

  const planOf = (raw, imageIds) => M.normalizePlan(raw, { resolve: M.contextOf(rawCtx).resolve, imageIds: imageIds || [], existingTitles: [] });

  describe('pure helpers', () => {
    it('itemsOf makes the checklist, with durations and one nested level', () => {
      const plan = planOf({ tasks: [{ title: 'T', subtasks: [{ text: 'a', estimate: 20, items: ['a1'] }, 'b'] }] });
      assert.deepEqual(TD.itemsOf(plan.tasks[0]), [
        { text: 'a', progress: 0, estimatedMinutes: 20, items: [{ text: 'a1', progress: 0 }] },
        { text: 'b', progress: 0 },
      ]);
    });

    it('patchesOf splits one REST write and one inputs write; members by id, contacts and places from the catalog', () => {
      const plan = planOf({
        tasks: [{ title: 'T', desc: 'D', urgency: 'vite', people: ['Marie', 'Sylviane Mailhot', 'Nouvel Ami'], places: ['Bureau'], labels: ['Finances'] }],
      });
      const catalog = {
        customs: { c1: { id: 'c1', name: 'Sylviane Mailhot' } },
        customsByName: { 'sylviane mailhot': { id: 'c1', name: 'Sylviane Mailhot' }, 'nouvel ami': { id: 'new-nouvel-ami', name: 'Nouvel Ami' } },
        placesById: { p1: { id: 'p1', name: 'Bureau' } },
        placesByName: { bureau: { id: 'p1', name: 'Bureau' } },
      };
      const p = TD.patchesOf(plan.tasks[0], catalog);
      assert.deepEqual(p.card, { desc: 'D', idMembers: 'm2', idLabels: 'lb3' });
      assert.deepEqual(p.inputs, {
        customAssignees: [{ id: 'c1', name: 'Sylviane Mailhot' }, { id: 'new-nouvel-ami', name: 'Nouvel Ami' }],
        places: { at: { id: 'p1', name: 'Bureau' } },
        empressement: 'vite',
      });
    });

    it('a bare task writes nothing but its name', () => {
      const plan = planOf({ tasks: [{ title: 'T' }] });
      const p = TD.patchesOf(plan.tasks[0], { customs: {}, customsByName: {}, placesById: {}, placesByName: {} });
      assert.deepEqual(p, { card: {}, inputs: {} });
    });
  });

  describe('loadContext', () => {
    it('gathers members, contacts, places and labels, and survives a source that fails', async () => {
      global.PriorityTrello.getPlaceCatalog = async () => { throw new Error('nope'); };
      const ctx = await TD.loadContext(t, { projects: [{ id: 'g:p1', name: 'Refonte du site' }] });
      assert.deepEqual(ctx.members, rawCtx.members);
      assert.deepEqual(ctx.places, []);
      assert.deepEqual(ctx.labels, rawCtx.labels);
      assert.equal(ctx.projects.length, 1);
      assert.deepEqual(ctx.entities, []);
    });
  });

  describe('create', () => {
    const files = { i1: { name: 'Capture.png' } };

    it('writes each task in the triage list, with everything the plan carries, in order', async () => {
      const plan = planOf({
        tasks: [
          { title: 'Préparer', project: 'Potager', desc: 'Notes', due: '2026-10-23', urgency: 'vite', people: ['Marie', 'Nouvel Ami'], places: ['Maison'], labels: ['Finances'], images: ['img1'], subtasks: ['Terreau', { text: 'Semis', items: ['Tomates'] }] },
          { title: 'Appeler', project: 'Refonte du site', estimate: 15 },
          { title: 'Libre' },
        ],
      }, ['i1']);
      const progress = [];
      const res = await TD.create(t, plan, { lists, goals: goalsStore, files, onProgress: (d, n) => progress.push([d, n]) });
      assert.equal(res.failed.length, 0);
      assert.deepEqual(res.created.map((c) => [c.taskId, c.cardId, c.title]), [['t1', 'card1', 'Préparer'], ['t2', 'card2', 'Appeler'], ['t3', 'card3', 'Libre']]);
      assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
      const mine = calls.filter((c) => c[1] === 'card1' || (c[0] === 'create' && c[1] === 'Préparer'));
      // Trello's REST API knows a new card at once; its stored data (priority, people, subtasks) comes last
      assert.deepEqual(mine.map((c) => c[0]), ['create', 'put', 'attach', 'day', 'inputs', 'items']);
      assert.deepEqual(mine[0], ['create', 'Préparer', 'l0']);
      assert.deepEqual(mine[1], ['put', 'card1', { desc: 'Notes', idMembers: 'm2', idLabels: 'lb3' }]);
      assert.deepEqual(mine[2], ['attach', 'card1', 'Capture.png']);
      assert.deepEqual(mine[3], ['day', 'card1', '2026-10-23']);
      assert.equal(mine[4][2].empressement, 'vite');
      assert.deepEqual(mine[4][2].places, { at: { id: 'place-maison', name: 'Maison' } });
      assert.deepEqual(mine[4][2].customAssignees, [{ id: 'new-nouvel-ami', name: 'Nouvel Ami' }]);
      assert.deepEqual(mine[5][2], [
        { text: 'Terreau', progress: 0 },
        { text: 'Semis', progress: 0, items: [{ text: 'Tomates', progress: 0 }] },
      ]);
      // a task without subtasks keeps its own duration
      assert.ok(calls.some((c) => c[0] === 'estimate' && c[1] === 'card2' && c[2] === 15));
      // the new person and the new place are added to the board catalogs once
      assert.deepEqual(calls.filter((c) => c[0] === 'customs'), [['customs', ['Sylviane Mailhot', 'Nouvel Ami']]]);
      assert.deepEqual(calls.filter((c) => c[0] === 'places'), [['places', ['Bureau', 'Maison']]]);
    });

    it('puts the new project in the goal map, links the cards, and reuses an existing project', async () => {
      const plan = planOf({ tasks: [{ title: 'Préparer', project: 'Potager' }, { title: 'Planter', project: 'Potager' }, { title: 'Appeler', project: 'Refonte du site' }] });
      const res = await TD.create(t, plan, { lists, goals: goalsStore, files: {} });
      assert.equal(res.goalsSaved, true);
      assert.equal(goalsSaves, 1);
      assert.deepEqual(res.madeProjects.map((p) => p.name), ['Potager']);
      const potager = goalsStore.nodes.filter((n) => n.name === 'Potager')[0];
      assert.equal(potager.level, 'project');
      const links = goalsStore.links.map((l) => l.from + '>' + l.to).sort();
      assert.deepEqual(links, ['card1>' + potager.id, 'card2>' + potager.id, 'card3>g:p1']);
    });

    it('does not touch the goal map when no task has a project', async () => {
      const res = await TD.create(t, planOf({ tasks: [{ title: 'Libre' }] }), { lists, goals: goalsStore });
      assert.equal(goalsSaves, 0);
      assert.equal(res.goalsSaved, false);
    });

    it('leaves out a task the user dropped', async () => {
      const plan = planOf({ tasks: [{ title: 'Garde' }, { title: 'Jette' }] });
      plan.tasks[1].include = false;
      const res = await TD.create(t, plan, { lists, goals: goalsStore });
      assert.deepEqual(res.created.map((c) => c.title), ['Garde']);
    });

    it('a failing step is reported and never loses the card or the rest of the batch', async () => {
      failOn.put = true;
      const plan = planOf({ tasks: [{ title: 'A', desc: 'x' }, { title: 'B' }] });
      const res = await TD.create(t, plan, { lists, goals: goalsStore });
      assert.equal(res.created.length, 2);
      assert.equal(res.failed.length, 1);
      assert.match(res.failed[0], /détails de « A »/);
      assert.equal(plan.tasks[0].createdId, 'card1');
    });

    it('a card that cannot be created is reported and the others go on; running again only writes what is missing', async () => {
      failOn.create = 'B';
      const plan = planOf({ tasks: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] });
      const first = await TD.create(t, plan, { lists, goals: goalsStore });
      assert.deepEqual(first.created.map((c) => c.title), ['A', 'C']);
      assert.equal(first.failed.length, 1);
      assert.equal(M.stats(plan).tasks, 1);
      failOn.create = null;
      calls.length = 0;
      const again = await TD.create(t, plan, { lists, goals: goalsStore });
      assert.deepEqual(calls.filter((c) => c[0] === 'create').map((c) => c[1]), ['B']);
      assert.deepEqual(again.created.map((c) => c.title).sort(), ['A', 'B', 'C']);
    });

    const STALE = 'Card not found or not on current board (Command: data)';

    it('a card Trello does not know yet is tried again, then once more after the batch, and ends written', async () => {
      const slept = [];
      let tries = 0;
      const base = global.PriorityTrello.saveCardInputsById;
      global.PriorityTrello.saveCardInputsById = async (tt, id, patch) => {
        if (id === 'card2' && ++tries <= 3) throw new Error(STALE);
        return base(tt, id, patch);
      };
      const plan = planOf({ tasks: [{ title: 'A', urgency: 'vite' }, { title: 'B', urgency: 'vite', subtasks: ['x'] }] });
      const res = await TD.create(t, plan, { lists, goals: goalsStore, sleep: async (ms) => { slept.push(ms); } });
      assert.equal(res.failures.length, 0);
      assert.equal(res.retried, 1);
      assert.equal(res.created.length, 2);
      assert.equal(calls.filter((c) => c[0] === 'inputs' && c[1] === 'card2').length, 1);
      // one short wait right after the card, then the pause once the batch is made, then the longer ones
      assert.deepEqual(slept, [600, 1000, 800]);
      // the rest of that card was not held up
      assert.ok(calls.some((c) => c[0] === 'items' && c[1] === 'card2'));
    });

    it('a step that never works is reported with the whole error, what was sent and how many tries', async () => {
      const err = Object.assign(new Error(STALE), { name: 'TrelloError', reason: 'http-400', status: 400, detail: '{"x":1}' });
      global.PriorityTrello.saveCardInputsById = async () => { throw err; };
      const plan = planOf({ tasks: [{ title: 'Régler la redondance', urgency: 'vite', people: ['Nouvel Ami'], subtasks: ['x'] }, { title: 'Libre' }] });
      const res = await TD.create(t, plan, { lists, goals: goalsStore, sleep: async () => {} });
      assert.equal(res.created.length, 2);
      assert.equal(res.failures.length, 1);
      const f = res.failures[0];
      assert.equal(f.step, 'priorité et personnes');
      assert.equal(f.title, 'Régler la redondance');
      assert.equal(f.taskId, 't1');
      assert.equal(f.cardId, 'card1');
      assert.equal(f.message, STALE);
      assert.equal(f.name, 'TrelloError');
      assert.equal(f.reason, 'http-400');
      assert.equal(f.status, '400');
      assert.equal(f.detail, '{"x":1}');
      assert.equal(f.attempts, 7);
      assert.match(f.stack, /TrelloError|Error/);
      assert.match(f.payload, /"empressement": "vite"/);
      assert.match(f.payload, /Nouvel Ami/);
      assert.match(f.at, /^\d{4}-\d{2}-\d{2}T/);
      assert.match(res.failed[0], /priorité et personnes de « Régler la redondance » \(Card not found/);
      // the subtasks of that card were still written
      assert.ok(calls.some((c) => c[0] === 'items' && c[1] === 'card1'));
    });

    it('any other error is reported at once, with no retry', async () => {
      let n = 0;
      global.PriorityTrello.saveCardInputsById = async () => { n++; throw new Error('http 500'); };
      const res = await TD.create(t, planOf({ tasks: [{ title: 'A', urgency: 'vite' }] }), { lists, goals: goalsStore, sleep: async () => { throw new Error('should not wait'); } });
      assert.equal(n, 1);
      assert.equal(res.failures[0].attempts, 1);
      assert.equal(res.failures[0].message, 'http 500');
    });

    it('a card that cannot be created is a failure of its own, with what was asked', async () => {
      failOn.create = 'B';
      const res = await TD.create(t, planOf({ tasks: [{ title: 'B' }] }), { lists, goals: goalsStore });
      assert.equal(res.failures[0].step, 'création de la carte');
      assert.equal(res.failures[0].title, 'B');
      assert.match(res.failures[0].payload, /"idList": "l0"/);
      assert.equal(res.failures[0].message, 'refusé');
    });

    it('refuses when the board has no triage list', async () => {
      await assert.rejects(TD.create(t, planOf({ tasks: [{ title: 'A' }] }), { lists: [lists[1]], goals: goalsStore }), (e) => e.reason === 'no-triage-list');
      assert.equal(cards, 0);
    });

    it('a goal map changed elsewhere is read again and a project of the same name made meanwhile is reused', async () => {
      failOn.conflict = true;
      const loadFresh = global.MindmapGoalsTrello.load;
      global.MindmapGoalsTrello.load = async () => {
        goalsStore.nodes.push({ id: 'g:other', level: 'project', name: 'Potager' });
        return loadFresh();
      };
      const plan = planOf({ tasks: [{ title: 'Préparer', project: 'Potager' }] });
      const res = await TD.create(t, plan, { lists, goals: goalsStore });
      assert.equal(goalsSaves, 2);
      assert.equal(res.goalsSaved, true);
      assert.deepEqual(res.madeProjects, []);
      assert.ok(goalsStore.links.some((l) => l.from === 'card1' && l.to === 'g:other'));
      assert.equal(goalsStore.nodes.filter((n) => n.name === 'Potager').length, 1);
    });

    it('a goal map that cannot be saved is reported, the cards stay', async () => {
      global.MindmapGoalsTrello.save = async () => { const e = new Error('too-long'); e.reason = 'too-long'; throw e; };
      const res = await TD.create(t, planOf({ tasks: [{ title: 'A', project: 'Potager' }] }), { lists, goals: goalsStore });
      assert.equal(res.created.length, 1);
      assert.equal(res.goalsSaved, false);
      assert.match(res.failed[0], /projets \(too-long\)/);
      assert.equal(res.failures[0].step, 'projets');
      assert.equal(res.failures[0].reason, 'too-long');
    });
  });

  describe('error report', () => {
    it('describeError keeps name, reason, status, detail and the first lines of the trace', () => {
      const d = TD.describeError(Object.assign(new Error('boom'), { name: 'X', reason: 'r', status: 404, detail: { a: 1 }, command: 'data' }));
      assert.equal(d.message, 'boom');
      assert.equal(d.name, 'X');
      assert.equal(d.reason, 'r');
      assert.equal(d.status, '404');
      assert.equal(d.command, 'data');
      assert.match(d.detail, /"a": 1/);
      assert.ok(d.stack.split('\n').length <= 10);
      assert.deepEqual(TD.describeError('texte'), { message: 'texte' });
      assert.equal(TD.describeError(null).message, 'erreur inconnue');
    });

    it('recognises a card Trello has not heard of yet, and nothing else', () => {
      assert.equal(TD.isNotYetThere(new Error('Card not found or not on current board (Command: data)')), true);
      assert.equal(TD.isNotYetThere(Object.assign(new Error('x'), { detail: 'No such card' })), true);
      assert.equal(TD.isNotYetThere(new Error('http 500')), false);
      assert.equal(TD.isNotYetThere(null), false);
    });

    it('reportOf writes everything on one page to paste: step, card, error, tries, what was sent, trace', () => {
      const text = TD.reportOf([{
        step: 'priorité et personnes', title: 'Régler la redondance', cardId: 'abc123', message: 'Card not found', name: 'Error', reason: 'x', status: '400',
        attempts: 7, at: '2026-10-21T10:00:00.000Z', detail: 'ligne 1\nligne 2', payload: '{\n  "empressement": "vite"\n}', stack: 'Error: Card not found\n    at a (b.js:1:1)',
      }], { at: '2026-10-21T10:00:05.000Z', build: 'abc1234567', summary: '25 cartes, 1 étape en échec' });
      assert.match(text, /Date : 2026-10-21T10:00:05.000Z/);
      assert.match(text, /Version : abc1234567/);
      assert.match(text, /25 cartes, 1 étape en échec/);
      assert.match(text, /1\. priorité et personnes : « Régler la redondance »/);
      assert.match(text, /Message : Card not found/);
      assert.match(text, /type Error · raison x · statut 400 · 7 tentatives · carte abc123/);
      assert.match(text, /Détail : ligne 1\n {5}ligne 2/);
      assert.match(text, /Envoyé : \{\n {5} {2}"empressement": "vite"\n {5}\}/);
      assert.match(text, /Trace :\n {5}Error: Card not found\n {5} {4}at a/);
    });
  });

  describe('undo', () => {
    it('archives the cards and takes the projects it made out of the goal map', async () => {
      const plan = planOf({ tasks: [{ title: 'A', project: 'Potager' }, { title: 'B', project: 'Refonte du site' }] });
      const res = await TD.create(t, plan, { lists, goals: goalsStore });
      calls.length = 0;
      await TD.undo(t, res);
      assert.deepEqual(calls.filter((c) => c[0] === 'archive').map((c) => c[1]), ['card1', 'card2']);
      assert.deepEqual(goalsStore.nodes.map((n) => n.name), ['Refonte du site']);
      assert.deepEqual(goalsStore.links, []);
    });

    it('says which card could not be archived and archives the others', async () => {
      const res = await TD.create(t, planOf({ tasks: [{ title: 'A' }, { title: 'B' }] }), { lists, goals: goalsStore });
      global.TableTrello.archiveCard = async (tt, id) => { if (id === 'card1') throw new Error('http 429'); calls.push(['archive', id]); };
      calls.length = 0;
      const out = await TD.undo(t, res);
      assert.deepEqual(calls.filter((c) => c[0] === 'archive').map((c) => c[1]), ['card2']);
      assert.equal(out.failures.length, 1);
      assert.equal(out.failures[0].step, 'archivage');
      assert.equal(out.failures[0].cardId, 'card1');
      assert.equal(out.failures[0].message, 'http 429');
    });

    it('still archives when the goal map cannot be reached', async () => {
      const res = await TD.create(t, planOf({ tasks: [{ title: 'A', project: 'Potager' }] }), { lists, goals: goalsStore });
      global.MindmapGoalsTrello.load = async () => { throw new Error('offline'); };
      calls.length = 0;
      const out = await TD.undo(t, res);
      assert.deepEqual(calls.filter((c) => c[0] === 'archive').map((c) => c[1]), ['card1']);
      assert.equal(out.failures[0].step, 'retrait des projets');
      assert.equal(out.failures[0].message, 'offline');
    });
  });
});
