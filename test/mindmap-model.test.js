'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('MindmapModel', () => {
  let MM;
  before(() => {
    loadComponent('mindmap/mindmap-model.js');
    MM = global.MindmapModel;
    assert.ok(MM);
  });

  const alice = { id: 'm1', name: 'Alice', trelloId: 'm1' };
  const records = [
    { id: 'a', name: 'Peindre', category: 'started', assignees: [alice], inputs: { dependsOn: ['b', 'zz'], places: { at: { id: 'place-1', name: 'Maison' } } } },
    { id: 'b', name: 'Acheter peinture', category: 'unstarted', assignees: [alice, { id: 'c1', name: 'Bob', custom: true, trelloId: '' }], inputs: { places: { from: { id: 'place-2', name: 'Bureau' }, via: [{ id: 'place-3', name: 'Magasin' }], to: { id: 'place-1', name: 'Maison' } } } },
    { id: 'c', name: 'Fini', category: 'completed', assignees: [], inputs: {} },
  ];

  it('builds task, person and place nodes with typed edges', () => {
    const g = MM.buildGraph(records);
    const kinds = (k) => g.nodes.filter((n) => n.kind === k).length;
    assert.equal(kinds('task'), 3);
    assert.equal(kinds('person'), 2); // Alice shared by both tasks
    assert.equal(kinds('place'), 3); // Maison shared
    const count = (k) => g.edges.filter((e) => e.kind === k).length;
    assert.equal(count('depends'), 1); // 'zz' (unknown card) dropped
    assert.equal(count('by'), 3);
    assert.equal(count('at'), 1);
    assert.equal(count('from') + count('via') + count('to'), 3);
  });

  it('hides finished tasks and the dependencies on them', () => {
    const recs = records.concat([{ id: 'd', name: 'Suite', category: 'started', assignees: [], inputs: { dependsOn: ['c'] } }]);
    const g = MM.buildGraph(recs, { hideDone: true });
    assert.equal(g.nodes.filter((n) => n.kind === 'task').length, 3);
    assert.ok(!g.edges.some((e) => e.to === 't:c'));
  });

  it('can switch each relation off', () => {
    const g = MM.buildGraph(records, { show: { by: false, at: false } });
    assert.deepEqual([...new Set(g.edges.map((e) => e.kind))], ['depends']);
    assert.equal(g.nodes.filter((n) => n.kind !== 'task').length, 0);
  });

  it('filters by task, person or place name and keeps the linked context', () => {
    const byTask = MM.buildGraph(records, { filter: 'peindre' });
    assert.ok(byTask.nodes.some((n) => n.id === 't:b'), 'its dependency stays');
    assert.ok(!byTask.nodes.some((n) => n.id === 't:c'));
    const byPerson = MM.buildGraph(records, { filter: 'bob' });
    assert.deepEqual(byPerson.nodes.filter((n) => n.kind === 'task').map((n) => n.id), ['t:b']);
  });

  it('detects cycles and refuses a link that would close one', () => {
    const edges = [
      { kind: 'depends', from: 't:a', to: 't:b' },
      { kind: 'depends', from: 't:b', to: 't:c' },
    ];
    assert.deepEqual(MM.findCycles(edges), []);
    assert.equal(MM.wouldCycle(edges, 't:c', 't:a'), true);
    assert.equal(MM.wouldCycle(edges, 't:a', 't:c'), false);
    assert.equal(MM.wouldCycle(edges, 't:a', 't:a'), true);
    const loop = edges.concat([{ kind: 'depends', from: 't:c', to: 't:a' }]);
    assert.deepEqual(MM.findCycles(loop).sort(), ['t:a', 't:b', 't:c']);
  });

  it('lays out every node at finite, distinct positions, deterministically', () => {
    const run = () => {
      const g = MM.buildGraph(records);
      MM.layout(g.nodes, g.edges);
      return g.nodes.map((n) => [n.x, n.y]);
    };
    const first = run();
    first.forEach(([x, y]) => assert.ok(isFinite(x) && isFinite(y)));
    assert.equal(new Set(first.map((p) => p.join(','))).size, first.length);
    assert.deepEqual(run(), first);
  });

  it('keeps pinned nodes where they are', () => {
    const g = MM.buildGraph(records);
    g.nodes[0].x = 500;
    g.nodes[0].y = -300;
    g.nodes[0].pinned = true;
    MM.layout(g.nodes, g.edges);
    assert.deepEqual([g.nodes[0].x, g.nodes[0].y], [500, -300]);
  });

  describe('goal hierarchy', () => {
    const goals = {
      nodes: [
        { id: 'g:v', level: 'vision', name: 'Vivre bien' },
        { id: 'g:m', level: 'mission', name: 'Rester en forme' },
        { id: 'g:o', level: 'goal', name: 'Courir 10 km' },
        { id: 'g:w', level: 'work', name: 'Plan d’entraînement' },
        { id: 'g:bad', level: 'nope', name: 'Inconnu' },
        { id: 'g:v', level: 'vision', name: 'Doublon' },
      ],
      links: [
        { from: 'g:m', to: 'g:v' },
        { from: 'g:o', to: 'g:m' },
        { from: 'g:w', to: 'g:o' },
        { from: 't:a', to: 'g:w' },
        { from: 'g:v', to: 'g:m' }, // upside down: ignored by buildGraph
        { from: 't:zz', to: 'g:w' }, // unknown task: dropped
      ],
    };

    it('normalizes stored goals (known levels, unique ids, no duplicate links)', () => {
      const n = MM.normalizeGoals({ nodes: goals.nodes, links: goals.links.concat(goals.links) });
      assert.equal(n.nodes.length, 4);
      assert.equal(n.links.length, goals.links.length);
      assert.deepEqual(MM.normalizeGoals(null), { nodes: [], links: [] });
    });

    it('adds goal nodes and "serves" edges, task → work → goal → mission → vision', () => {
      const g = MM.buildGraph(records, { goals });
      assert.equal(g.nodes.filter((n) => n.kind === 'goal').length, 4);
      const serves = g.edges.filter((e) => e.kind === 'serves').map((e) => e.from + '>' + e.to).sort();
      assert.deepEqual(serves, ['g:m>g:v', 'g:o>g:m', 'g:w>g:o', 't:a>g:w']);
      assert.equal(MM.buildGraph(records, { goals, show: { goals: false } }).nodes.filter((n) => n.kind === 'goal').length, 0);
    });

    it('decides what a link between two nodes means', () => {
      const t1 = { id: 't:a', kind: 'task' };
      const t2 = { id: 't:b', kind: 'task' };
      const m = { id: 'g:m', kind: 'goal', level: 'mission' };
      const o = { id: 'g:o', kind: 'goal', level: 'goal' };
      const o2 = { id: 'g:o2', kind: 'goal', level: 'goal' };
      assert.deepEqual(MM.linkBetween(t1, t2), { kind: 'depends', from: 't:a', to: 't:b' });
      assert.deepEqual(MM.linkBetween(m, o), { kind: 'serves', from: 'g:o', to: 'g:m' });
      assert.deepEqual(MM.linkBetween(t1, m), { kind: 'serves', from: 't:a', to: 'g:m' });
      assert.ok(MM.linkBetween(o, o2).error);
      assert.ok(MM.linkBetween(t1, { id: 'p:x', kind: 'person' }).error);
    });

    it('lays the hierarchy out in rings: vision in the middle, tasks outside', () => {
      const g = MM.buildGraph(records, { goals });
      MM.layoutHierarchy(g.nodes, g.edges);
      const r = (id) => {
        const n = g.nodes.find((x) => x.id === id);
        assert.ok(isFinite(n.x) && isFinite(n.y), id);
        return Math.hypot(n.x, n.y);
      };
      assert.ok(r('g:v') < 1);
      assert.ok(r('g:v') < r('g:m') && r('g:m') < r('g:o') && r('g:o') < r('g:w') && r('g:w') < r('t:a'));
      // a task with no goal sits on the outermost ring
      assert.ok(r('t:b') > r('t:a'));
    });
  });
});
