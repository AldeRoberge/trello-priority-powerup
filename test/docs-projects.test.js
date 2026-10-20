'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');
const FakeTrello = require('../sandbox/e2e/fake-trello.js');

describe('project documents', () => {
  let DM;
  let DP;
  let DT;
  let GG;
  let WO;

  before(() => {
    loadComponent('shared/work-os.js');
    loadComponent('mindmap/mindmap-model.js');
    loadComponent('mindmap/mindmap-goals-trello.js');
    loadComponent('docs/docs-model.js');
    loadComponent('docs/docs-projects.js');
    loadComponent('docs/docs-trello.js');
    DM = global.DocsModel;
    DP = global.DocsProjects;
    DT = global.DocsTrello;
    GG = global.MindmapGoalsTrello;
    WO = global.WorkOS;
  });

  const goals = {
    nodes: [
      { id: 'g:obj1', level: 'objective', name: 'Livrer' },
      { id: 'g:pro1', level: 'project', name: 'Refonte' },
    ],
    links: [
      { from: 'g:pro1', to: 'g:obj1' },
      { from: 'card1', to: 'g:pro1' },
    ],
  };

  it('stores a project subject on the document', () => {
    const desc = DM.packDesc('# Refonte', { rev: 1, subject: { k: 'project', id: 'g:pro1' } });
    assert.deepEqual(DM.unpackDesc(desc).subject, { k: 'project', id: 'g:pro1' });
    assert.equal(DM.normalizeSubject('project:nope'), null);
    assert.equal(DM.normalizeSubject({ k: 'project', id: 'card1' }), null);
  });

  it('plans one document per project and one child document per task', () => {
    const plan = DP.plan(goals, [], { card1: 'Écrire la page' });
    assert.deepEqual(plan.createProjects, [{ id: 'g:pro1', name: 'Refonte' }]);
    assert.deepEqual(plan.createTasks, [{ taskId: 'card1', projectId: 'g:pro1', name: 'Écrire la page' }]);
    const docs = [
      { id: 'dp', title: 'Refonte', subject: { k: 'project', id: 'g:pro1' } },
      { id: 'dt', title: 'Écrire la page', subject: { k: 'task', id: 'card1' } },
    ];
    const again = DP.plan(goals, docs, { card1: 'Écrire la page' });
    assert.equal(again.createProjects.length, 0);
    assert.equal(again.createTasks.length, 0);
    assert.deepEqual(again.nest, [{ child: 'dt', parent: 'dp' }]);
    const edits = DP.parentEdits({ parents: {}, docs: {} }, docs, again);
    assert.deepEqual(edits.set, [{ child: 'dt', parent: 'dp' }]);
    assert.deepEqual(edits.clear, []);
  });

  it('moves a task document when the task changes project, and leaves other parents', () => {
    const docs = [
      { id: 'dp', title: 'Refonte', subject: { k: 'project', id: 'g:pro1' } },
      { id: 'dp2', title: 'Suite', subject: { k: 'project', id: 'g:pro2' } },
      { id: 'dt', title: 'Écrire la page', subject: { k: 'task', id: 'card1' } },
      { id: 'note', title: 'Note', subject: null },
    ];
    const moved = {
      nodes: goals.nodes.concat([{ id: 'g:pro2', level: 'project', name: 'Suite' }]),
      links: [{ from: 'card1', to: 'g:pro2' }],
    };
    const plan = DP.plan(moved, docs, { card1: 'Écrire la page' });
    const edits = DP.parentEdits({ parents: { dt: 'dp', note: 'dp' }, docs: {} }, docs, plan);
    assert.deepEqual(edits.set, [{ child: 'dt', parent: 'dp2' }]);
    assert.deepEqual(edits.clear, ['dt']);
    assert.equal(edits.clear.indexOf('note'), -1);
  });

  it('skips a task that has no card to name, and still files a task under its project', () => {
    assert.equal(WO.projectOf(goals, 'card1').id, 'g:pro1');
    const unnamed = DP.plan(goals, [], {});
    assert.equal(unnamed.createTasks.length, 0);
    assert.equal(unnamed.createProjects.length, 1);
  });

  describe('DocsTrello.ensureProjectDocs', () => {
    let fake;

    beforeEach(() => {
      fake = FakeTrello.create({
        cards: [{ id: 'card1', name: 'Écrire la page', idList: 'l1' }],
      });
      global.SheetsTrello = { trelloRest: fake.trelloRest };
    });

    it('creates the project document and nests the task document under it', async () => {
      await GG.load(fake.t);
      await GG.save(fake.t, goals);
      const first = await DT.ensureProjectDocs(fake.t, await DT.listDocs(fake.t));
      assert.equal(first.created.length, 2);
      const docs = await DT.listDocs(fake.t);
      const project = docs.filter((d) => d.subject && d.subject.k === 'project' && d.subject.id === 'g:pro1')[0];
      const task = docs.filter((d) => d.subject && d.subject.k === 'task' && d.subject.id === 'card1')[0];
      assert.equal(project.title, 'Refonte');
      assert.equal(task.title, 'Écrire la page');
      assert.equal(DT.getFolderIndex().parents[task.id], project.id);
      const again = await DT.ensureProjectDocs(fake.t, docs);
      assert.equal(again.created.length, 0);
      assert.equal((await DT.listDocs(fake.t)).length, docs.length);
    });
  });
});
