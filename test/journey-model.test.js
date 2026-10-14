'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

const NOW = new Date(2026, 9, 13);

describe('JourneyModel', () => {
  let JM;
  before(() => {
    loadComponent('journey/journey-model.js');
    JM = global.JourneyModel;
    assert.ok(JM);
  });

  function card(partial) {
    return Object.assign({
      id: partial.id,
      name: partial.name,
      category: partial.category || 'started',
      blocked: !!partial.blocked,
      progress: partial.progress == null ? 0 : partial.progress,
      dueComplete: !!partial.dueComplete,
      dueDate: partial.dueDate || null,
      estimatedMinutes: partial.estimatedMinutes == null ? null : partial.estimatedMinutes,
      priorityScore: partial.priorityScore == null ? null : partial.priorityScore,
      inputs: partial.inputs || { dependsOn: [], depTypes: {} },
      items: partial.items || [],
      assignees: partial.assignees || [],
    });
  }

  const goals = {
    nodes: [
      { id: 'g:mis', level: 'mission', name: 'Maison' },
      { id: 'g:cui', level: 'project', name: 'Cuisine' },
      { id: 'g:toit', level: 'work', name: 'Toit' },
    ],
    links: [
      { from: 'g:cui', to: 'g:mis' },
      { from: 'g:toit', to: 'g:mis' },
      { from: 't:pick', to: 'g:cui' },
      { from: 'order', to: 'g:cui' },
      { from: 'paint', to: 'g:cui' },
      { from: 'call', to: 'g:toit' },
      { from: 'measure', to: 'g:toit' },
      { from: 'measure', to: 'g:cui' },
    ],
  };

  function records() {
    return [
      card({
        id: 'pick',
        name: "Choisir l'entrepreneur",
        dueDate: '2026-10-12',
        estimatedMinutes: 30,
        priorityScore: 6,
      }),
      card({
        id: 'order',
        name: 'Commander les armoires',
        dueDate: '2026-10-14',
        priorityScore: 5,
        inputs: { dependsOn: ['pick'], depTypes: { pick: 'needs' } },
      }),
      card({
        id: 'paint',
        name: 'Peindre',
        estimatedMinutes: 10,
        priorityScore: 2,
        inputs: { dependsOn: ['order'], depTypes: { order: 'after' } },
      }),
      card({
        id: 'call',
        name: "Appeler l'assureur",
        blocked: true,
        priorityScore: 8,
      }),
      card({
        id: 'measure',
        name: 'Mesurer',
        priorityScore: 9,
        estimatedMinutes: 15,
      }),
      card({
        id: 'done',
        name: 'Déjà fait',
        category: 'completed',
        progress: 100,
      }),
      card({
        id: 'loose',
        name: 'Note libre',
        priorityScore: 1,
      }),
    ];
  }

  it('keeps contribution, sequence and dependency as different edges', () => {
    const g = JM.prepare(records(), goals);
    const serves = g.edges.filter((e) => e.kind === 'serves');
    assert.ok(serves.some((e) => e.from === 'pick' && e.to === 'g:cui' && !e.cross));
    assert.ok(serves.some((e) => e.from === 'g:cui' && e.to === 'g:mis'));
    assert.equal(g.parent.measure, 'g:toit');
    assert.ok(serves.some((e) => e.from === 'measure' && e.to === 'g:cui' && e.cross));
    const needs = g.edges.find((e) => e.from === 'order' && e.to === 'pick');
    assert.equal(needs.dep, 'needs');
    const after = g.edges.find((e) => e.from === 'paint' && e.to === 'order');
    assert.equal(after.dep, 'after');
    assert.equal(g.byId['g:toit'].level, 'project');
  });

  it('does not treat a missing prerequisite or a parts link as a block', () => {
    const g = JM.prepare([
      card({
        id: 'a',
        name: 'A',
        inputs: { dependsOn: ['gone', 'b'], depTypes: { b: 'parts' } },
      }),
      card({ id: 'b', name: 'B' }),
    ], { nodes: [], links: [] });
    assert.equal(g.state.a, 'ready');
    assert.equal(g.edges.find((e) => e.from === 'a').dep, 'parts');
  });

  it('ranks ready work from real dates, blockers and effort, and explains only that', () => {
    const g = JM.prepare(records(), goals);
    const q = JM.nextActions(g, { now: NOW, limit: 10, blockedLimit: 10 });
    assert.deepEqual(q.now.map((a) => a.id), ['pick', 'measure', 'loose', 'paint']);
    const pick = q.now[0];
    assert.deepEqual(pick.reasons, ['En retard', 'Débloque 1 tâche']);
    assert.equal(pick.projectName, 'Cuisine');
    assert.equal(pick.missionName, 'Maison');
    assert.equal(pick.dueLabel, '12 oct.');
    assert.equal(pick.effortLabel, '30 min');
    const paint = q.now.find((a) => a.id === 'paint');
    assert.ok(paint.reasons.includes('Environ 10 min'));
    assert.ok(paint.reasons.includes('Vient après Commander les armoires'));
    assert.equal(paint.reasons.includes('Prochaine étape de Cuisine'), false);
    const measure = q.now.find((a) => a.id === 'measure');
    assert.ok(measure.reasons.includes('Prochaine étape de Toit'));
    assert.equal(measure.also[0].name, 'Cuisine');
    const loose = q.now.find((a) => a.id === 'loose');
    assert.deepEqual(loose.reasons, []);
    const call = q.blocked.find((a) => a.id === 'call');
    assert.equal(call.state, 'blocked');
    assert.deepEqual(call.reasons, ['Marquée bloquée']);
    const order = q.blocked.find((a) => a.id === 'order');
    assert.equal(order.state, 'waiting');
    assert.deepEqual(order.reasons, ["En attente de Choisir l'entrepreneur"]);
    assert.equal(q.now.some((a) => a.id === 'done'), false);
    assert.equal(q.now.some((a) => a.id === 'order'), false);
  });

  it('says demain and formats an effort without inventing a score', () => {
    const g = JM.prepare([
      card({ id: 't', name: 'Court', dueDate: '2026-10-14', estimatedMinutes: 90, priorityScore: 4 }),
    ], { nodes: [], links: [] });
    const item = JM.nextActions(g, { now: NOW }).now[0];
    assert.equal(item.reasons[0], 'Demain');
    assert.equal(item.effortLabel, '1 h 30');
    assert.equal(item.reasons.some((r) => /score|priorit/i.test(r)), false);
  });

  it('an untyped dependency blocks, and after does not', () => {
    const g = JM.prepare([
      card({ id: 'pre', name: 'Préalable' }),
      card({ id: 'hard', name: 'Bloquée par le lien', inputs: { dependsOn: ['pre'], depTypes: {} } }),
      card({ id: 'soft', name: 'Ensuite', inputs: { dependsOn: ['pre'], depTypes: { pre: 'after' } } }),
    ], { nodes: [], links: [] });
    assert.equal(g.state.hard, 'waiting');
    assert.equal(g.state.soft, 'ready');
    assert.equal(g.unblocks.pre, 1);
  });

  it('counts a project from the tasks that serve it, not from a percentage', () => {
    const g = JM.prepare(records(), goals);
    const cuisine = JM.summarize(g, 'g:cui');
    assert.equal(cuisine.open + cuisine.waiting + cuisine.blocked + cuisine.done, 4);
    assert.equal(cuisine.waiting, 1);
    assert.ok(cuisine.open >= 1);
    const both = JM.summarize(g, 'g:mis');
    assert.ok(both.open + both.blocked + both.waiting >= 4);
  });

  it('overview shows landmarks, and a project focus shows its tasks', () => {
    const g = JM.prepare(records(), goals);
    const overview = JM.layout(g, { zoom: 'overview', hideDone: true, now: NOW });
    assert.equal(overview.nodes.some((n) => n.kind === 'task'), false);
    assert.ok(overview.nodes.some((n) => n.id === 'g:mis'));
    assert.ok(overview.nodes.some((n) => n.id === JM.ORPHAN_ID));
    const project = JM.layout(g, { zoom: 'project', focus: 'g:cui', hideDone: true, now: NOW });
    const ids = project.nodes.map((n) => n.id);
    assert.ok(ids.includes('pick'));
    assert.ok(ids.includes('order'));
    assert.equal(ids.includes('call'), false);
    assert.equal(ids.includes('done'), false);
    const pick = project.nodes.find((n) => n.id === 'pick');
    const order = project.nodes.find((n) => n.id === 'order');
    assert.ok(pick.x < order.x);
    const mission = project.nodes.find((n) => n.id === 'g:mis');
    const cui = project.nodes.find((n) => n.id === 'g:cui');
    assert.ok(mission.x < cui.x);
  });

  it('task zoom keeps the neighbourhood, and search jumps to a name', () => {
    const g = JM.prepare(records(), goals);
    const near = JM.layout(g, { zoom: 'task', focus: 'order', hideDone: true, now: NOW });
    const ids = near.nodes.map((n) => n.id);
    assert.ok(ids.includes('order'));
    assert.ok(ids.includes('pick'));
    assert.equal(ids.includes('call'), false);
    const found = JM.layout(g, { zoom: 'overview', query: 'peindre', hideDone: true, now: NOW });
    assert.ok(found.nodes.some((n) => n.id === 'paint'));
    assert.ok(found.nodes.some((n) => n.id === 'g:cui'));
    const accent = JM.layout(g, { query: 'deja', hideDone: false, now: NOW });
    assert.ok(accent.nodes.some((n) => n.id === 'done'));
  });

  it('parallel tasks share a column, and a long list stays capped', () => {
    const many = [];
    const links = [{ from: 'g:p', to: 'g:m' }];
    for (let i = 0; i < 100; i++) {
      many.push(card({ id: 't' + i, name: 'Tâche ' + String(i).padStart(3, '0'), priorityScore: i }));
      links.push({ from: 't' + i, to: 'g:p' });
    }
    many.push(card({
      id: 'late',
      name: 'Tâche en retard',
      dueDate: '2026-10-01',
      inputs: { dependsOn: ['t0'], depTypes: { t0: 'needs' } },
    }));
    links.push({ from: 'late', to: 'g:p' });
    const g = JM.prepare(many, {
      nodes: [
        { id: 'g:m', level: 'mission', name: 'Mission' },
        { id: 'g:p', level: 'project', name: 'Projet' },
      ],
      links: links,
    });
    const view = JM.layout(g, { zoom: 'project', focus: 'g:p', hideDone: true, now: NOW });
    const tasks = view.nodes.filter((n) => n.kind === 'task');
    assert.equal(tasks.length, JM.CAP);
    assert.ok(view.truncated > 0);
    const byCol = {};
    tasks.forEach((n) => {
      if (!byCol[n.col]) byCol[n.col] = [];
      byCol[n.col].push(n.y);
    });
    Object.keys(byCol).forEach((col) => {
      assert.equal(new Set(byCol[col]).size, byCol[col].length, 'column ' + col);
    });
    const a = tasks.find((n) => n.id === 't99');
    const b = tasks.find((n) => n.id === 't98');
    assert.equal(a.col, b.col);
    const searched = JM.layout(g, { zoom: 'project', focus: 'g:p', query: 'tâche 099', now: NOW });
    assert.ok(searched.nodes.some((n) => n.id === 't99'));
  });

  it('chains a task up to its mission and lists what it unlocks', () => {
    const g = JM.prepare(records(), goals);
    assert.deepEqual(JM.chain(g, 'pick').map((n) => n.name), ['Maison', 'Cuisine']);
    const links = JM.linksOf(g, 'pick');
    assert.equal(links.parents[0].name, 'Cuisine');
    assert.ok(links.next.some((n) => n.id === 'order' && n.dep === 'needs'));
    const order = JM.linksOf(g, 'order');
    assert.equal(order.prereqs[0].name, "Choisir l'entrepreneur");
  });
});
