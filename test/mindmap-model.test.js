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

    it('reads the legacy "work" level as a project', () => {
      const n = MM.normalizeGoals({ nodes: [{ id: 'g:w', level: 'work', name: 'Plan' }], links: [] });
      assert.equal(n.nodes[0].level, 'project');
    });

    it('keeps a project priority and drops it on any other level', () => {
      const n = MM.normalizeGoals({
        nodes: [
          { id: 'g:p', level: 'project', name: 'P', priority: 9.34 },
          { id: 'g:v', level: 'vision', name: 'V', priority: 3 },
          { id: 'g:q', level: 'project', name: 'Q', priority: 'haute' },
        ],
        links: [],
      });
      assert.equal(n.nodes.find((x) => x.id === 'g:p').priority, 9.3);
      assert.equal('priority' in n.nodes.find((x) => x.id === 'g:v'), false);
      assert.equal('priority' in n.nodes.find((x) => x.id === 'g:q'), false);
    });

    describe('context (breadcrumb and flags)', () => {
      const chain = {
        nodes: [
          { id: 'g:v', level: 'vision', name: 'V' },
          { id: 'g:m', level: 'mission', name: 'M' },
          { id: 'g:g', level: 'goal', name: 'G' },
          { id: 'g:o', level: 'objective', name: 'O' },
          { id: 'g:p', level: 'project', name: 'P' },
          { id: 'g:p2', level: 'project', name: 'Projet orphelin' },
          { id: 'g:o2', level: 'objective', name: 'Objectif seul' },
        ],
        links: [
          { from: 'g:m', to: 'g:v' },
          { from: 'g:g', to: 'g:m' },
          { from: 'g:o', to: 'g:g' },
          { from: 'g:p', to: 'g:o' },
          { from: 't:a', to: 'g:p' },
        ],
      };
      let g;
      before(() => {
        g = MM.buildGraph(records, { goals: chain });
      });

      it('lists the ancestors from the nearest up to the vision', () => {
        assert.deepEqual(MM.ancestors(g.edges, 't:a'), ['g:p', 'g:o', 'g:g', 'g:m', 'g:v']);
        assert.deepEqual(MM.ancestors(g.edges, 'g:v'), []);
      });

      it('does not flag a task or a goal that has no parent level', () => {
        assert.deepEqual(MM.contextFlags(g, 't:a'), []);
        assert.deepEqual(MM.contextFlags(g, 't:b'), []);
        assert.deepEqual(MM.contextFlags(g, 'g:p2'), []);
        assert.deepEqual(MM.contextFlags(g, 'g:o2'), []);
        assert.deepEqual(MM.contextFlags(g, 'g:o'), []);
        assert.deepEqual(MM.contextFlags(g, 'nope'), []);
      });

      it('does not flag a task that serves an objective directly', () => {
        const x = MM.buildGraph(records, { goals: { nodes: chain.nodes, links: chain.links.concat([{ from: 't:b', to: 'g:o' }]) } });
        assert.deepEqual(MM.contextFlags(x, 't:b'), []);
      });
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

  it('reads a link from the clicked node, and an assignment in the task phase', () => {
    const alde = { id: 'u', name: 'Aldé Roberge', trelloId: 'u' };
    const recs = [
      { id: 'plan', name: 'Planter', category: 'unstarted', assignees: [alde], inputs: { places: { at: { id: 'maison', name: 'Maison' } } } },
      { id: 'go', name: 'Peindre', category: 'started', progress: 10, assignees: [alde], inputs: { dependsOn: ['plan'], depTypes: { plan: 'needs' } } },
      { id: 'fin', name: 'Ranger', category: 'completed', progress: 0, assignees: [alde] },
      { id: 'pause', name: 'Pause', category: 'started', blocked: true, progress: 40, assignees: [alde] },
      { id: 'drop', name: 'Laisser tomber', category: 'canceled', assignees: [alde] },
    ];
    const g = MM.buildGraph(recs);
    const get = (id) => g.nodes.find((n) => n.id === id);
    const by = (task) => g.edges.find((e) => e.kind === 'by' && e.from === 't:' + task);
    const doing = 'Est en train d\u2019\u00eatre fait par';

    assert.equal(MM.taskPhase({}), 'will');
    assert.equal(MM.taskPhase({ progress: 30 }), 'doing');
    assert.equal(MM.taskPhase({ dueComplete: true, category: 'started' }), 'done');
    assert.equal(MM.taskPhase({ category: 'completed', progress: 0 }), 'done');
    assert.equal(MM.taskPhase({ listName: 'Completed', progress: 0 }), 'done');
    assert.equal(MM.taskPhase({ listName: 'En cours', progress: 0 }), 'doing');
    assert.equal(MM.taskPhase({ category: 'started', blocked: true, progress: 40 }), 'will');

    const planned = MM.relationPhrase(by('plan'), 't:plan', get);
    assert.equal(planned.text, 'Sera fait par');
    assert.equal(planned.verb, 'Sera fait par');
    assert.equal(planned.from, 't:plan');
    assert.equal(planned.to, 'p:u');
    const plannedBack = MM.relationPhrase(by('plan'), 'p:u', get);
    assert.equal(plannedBack.text, 'Va faire');
    assert.equal(plannedBack.from, 'p:u');
    assert.equal(plannedBack.to, 't:plan');

    assert.equal(MM.relationPhrase(by('go'), 't:go', get).text, doing);
    assert.equal(MM.relationPhrase(by('go'), 'p:u', get).text, 'Est en train de faire');
    assert.equal(MM.relationPhrase(by('fin'), null, get).text, 'Compl\u00e9t\u00e9 par');
    assert.equal(MM.relationPhrase(by('fin'), 'p:u', get).text, 'A compl\u00e9t\u00e9');
    assert.equal(MM.relationPhrase(by('pause'), 't:pause', get).verb, 'Sera fait par');
    assert.equal(MM.relationPhrase(by('drop'), 't:drop', get).text, 'Ne sera pas fait par');
    assert.equal(MM.relationPhrase(by('drop'), 'p:u', get).text, 'Ne fera pas');

    const at = g.edges.find((e) => e.kind === 'at');
    assert.equal(MM.relationPhrase(at, 't:plan', get).text, 'Sera fait \u00e0');
    assert.equal(MM.relationPhrase(at, at.to, get).text, 'Accueillera');
    assert.equal(MM.relationPhrase(at, at.to, get).from, at.to);

    const needs = g.edges.find((e) => e.kind === 'depends');
    assert.equal(MM.relationPhrase(needs, 't:go', get).text, 'N\u00e9cessite');
    assert.equal(MM.relationPhrase(needs, 't:plan', get).text, 'Est requis par');
    assert.equal(MM.relationPhrase(needs, 't:plan', get).from, 't:plan');
  });

  it('keeps the kind of a task link (depTypes), defaulting to depends', () => {
    const recs = [
      { id: 'a', name: 'A', category: 'started', inputs: { dependsOn: ['b', 'c'], depTypes: { b: 'needs', c: 'bogus' } } },
      { id: 'b', name: 'B', category: 'started' },
      { id: 'c', name: 'C', category: 'started' },
    ];
    const g = MM.buildGraph(recs, {});
    const dep = (to) => g.edges.find((e) => e.to === 't:' + to).dep;
    assert.equal(dep('b'), 'needs');
    assert.equal(dep('c'), undefined);
  });

  describe('groups and zoom', () => {
    const goals = {
      nodes: [
        { id: 'g:v', level: 'vision', name: 'Vivre bien' },
        { id: 'g:m', level: 'mission', name: 'Rester en forme' },
        { id: 'g:p', level: 'project', name: 'Plan' },
      ],
      links: [
        { from: 'g:m', to: 'g:v' },
        { from: 'g:p', to: 'g:m' },
        { from: 't:a', to: 'g:p' },
      ],
    };
    const rich = [
      { id: 'a', name: 'Peindre', category: 'started', listName: 'En cours', progress: 40, priorityLabel: 'Haute', blocked: true, due: '2026-11-01', assignees: [alice], labels: [{ id: 'lb', name: 'Maison' }], inputs: { dependsOn: ['b'] } },
      { id: 'b', name: 'Acheter', category: 'unstarted', listName: 'À faire', progress: 0, assignees: [], entityType: 'Course', inputs: {} },
    ];

    function graph() {
      return MM.buildGraph(rich, { goals });
    }

    it('names the zoom bands from far chips to a task opened into nodes', () => {
      assert.equal(MM.zoomBand(0.2), 'overview');
      assert.equal(MM.zoomBand(0.5), 'structure');
      assert.equal(MM.zoomBand(1), 'work');
      assert.equal(MM.zoomBand(2), 'detail');
      assert.equal(MM.zoomBand(undefined), 'work');
    });

    it('nests hierarchy groups and counts the tasks under a vision', () => {
      const groups = MM.buildGroups(graph(), { lens: 'hierarchy' });
      const vision = groups.find((g) => g.anchorId === 'g:v');
      const project = groups.find((g) => g.anchorId === 'g:p');
      assert.equal(vision.parentId, null);
      assert.equal(project.parentId, 'grp:g:m');
      assert.deepEqual(project.members, ['t:a']);
      assert.equal(vision.taskCount, 1);
      assert.ok(groups.some((g) => g.id === 'grp:loose' && g.members.includes('t:b')));
    });

    it('hides members when zoomed out and shows them when the group is opened', () => {
      const far = MM.scene(graph(), { lens: 'hierarchy', zoom: 0.2 });
      assert.equal(far.band, 'overview');
      assert.equal(far.hidden['t:a'], true);
      assert.equal(far.hidden['g:m'], true);
      assert.ok(!far.hidden['g:v']);
      assert.equal(far.hidden['p:m1'], true);
      const opened = MM.scene(graph(), { lens: 'hierarchy', zoom: 0.2, force: { 'grp:g:v': 'open' } });
      assert.ok(!opened.hidden['g:m']);
      assert.equal(opened.hidden['t:a'], true);
      const work = MM.scene(graph(), { lens: 'hierarchy', zoom: 1 });
      assert.ok(!work.hidden['t:a']);
      assert.ok(!work.hidden['p:m1']);
      assert.equal(work.facets.length, 0);
    });

    it('keeps a project closed at the structure band and opens it by force', () => {
      const mid = MM.scene(graph(), { lens: 'hierarchy', zoom: 0.6 });
      assert.equal(mid.hidden['t:a'], true);
      assert.ok(!mid.hidden['g:p']);
      const forced = MM.scene(graph(), { lens: 'project', zoom: 0.2, force: { 'grp:g:p': 'open' } });
      assert.ok(!forced.hidden['t:a']);
    });

    it('breaks a focused task into facet nodes only when zoomed in', () => {
      const detail = MM.scene(graph(), { zoom: 2, focusId: 't:a' });
      const kinds = detail.facets.map((f) => f.facet).sort();
      assert.deepEqual(kinds, ['blocked', 'due', 'priority', 'progress', 'status']);
      assert.equal(detail.facets.every((f) => f.parentId === 't:a'), true);
      assert.equal(MM.scene(graph(), { zoom: 2 }).facets.length, 0);
      const other = MM.scene(graph(), { zoom: 2, focusId: 't:b' });
      assert.deepEqual(other.facets.map((f) => f.facet), ['progress', 'status']);
    });

    it('groups by entity type, by label, or by an explicit bucket', () => {
      const typed = MM.buildGroups(graph(), { lens: 'type' });
      const course = typed.find((g) => g.label === 'Course');
      const maison = typed.find((g) => g.label === 'Maison');
      assert.deepEqual(course.members, ['t:b']);
      assert.deepEqual(maison.members, ['t:a']);
      const buckets = MM.buildGroups(graph(), { lens: 'type', buckets: [{ id: 'ent', name: 'Entité', members: ['a', 'b'] }] });
      assert.deepEqual(buckets[0].members.sort(), ['t:a', 't:b']);
    });

    it('keeps manual groups editable and drops empty or duplicate ones', () => {
      const clean = MM.normalizeManual([
        { id: 'mg1', name: '  Équipe  ', members: ['t:a', 't:a', ''] },
        { id: 'mg1', name: 'Doublon', members: ['t:b'] },
        { id: 'mg2', name: '', members: [] },
      ]);
      assert.deepEqual(clean, [{ id: 'mg1', name: 'Équipe', members: ['t:a'] }]);
      const g = MM.buildGroups(graph(), { lens: 'manual', manual: clean });
      assert.equal(g.length, 1);
      assert.equal(g[0].label, 'Équipe');
      const closed = MM.scene(graph(), { lens: 'manual', zoom: 1, manual: clean, force: { mg1: 'closed' } });
      assert.equal(closed.hidden['t:a'], true);
      assert.ok(!closed.hidden['t:b']);
    });

    it('draws a closed soft boundary around one point and around several', () => {
      const one = MM.looseHull([{ x: 0, y: 0, w: 100, h: 40 }]);
      assert.match(one, /^M/);
      assert.match(one, /Z$/);
      assert.match(one, /-68\.0,-38\.0/);
      assert.match(one, /68\.0,38\.0/);
      const many = MM.looseHull([{ x: 0, y: 0 }, { x: 80, y: 10 }, { x: 40, y: 90 }]);
      assert.match(many, /Q/);
      assert.match(many, /L/);
      assert.equal(MM.looseHull([]), '');
    });

    it('follows each card edge instead of sitting on the centres', () => {
      const path = MM.looseHull([
        { x: 0, y: 0, w: 200, h: 40 },
        { x: 400, y: 0, w: 80, h: 80 },
      ], 16);
      assert.match(path, /-116\.0,-36\.0/);
      assert.match(path, /-116\.0,36\.0/);
      assert.match(path, /456\.0,-56\.0/);
      assert.match(path, /456\.0,56\.0/);
    });

    it('renames a boundary, pulls a card in and takes one out', () => {
      const edited = MM.scene(graph(), {
        lens: 'project',
        zoom: 1,
        edits: {
          'grp:g:p': { name: 'Chantier', extra: ['t:b'] },
          'grp:loose': { omit: ['t:b'] },
        },
      });
      const project = edited.groups.find((g) => g.id === 'grp:g:p');
      assert.equal(project.label, 'Chantier');
      assert.ok(project.members.includes('t:a'));
      assert.ok(project.members.includes('t:b'));
      assert.equal(project.taskCount, 2);
      const loose = edited.groups.find((g) => g.id === 'grp:loose');
      assert.ok(!loose || !loose.members.includes('t:b'));
      const closed = MM.scene(graph(), {
        lens: 'project',
        zoom: 0.2,
        edits: { 'grp:g:p': { extra: ['t:b'], omit: ['t:a'] } },
      });
      assert.equal(closed.hidden['t:b'], true);
      assert.ok(!closed.hidden['t:a']);
      const unknown = MM.applyGroupEdits(project ? [project] : [], { 'grp:g:p': { extra: ['missing'] } }, { 't:a': { id: 't:a' } });
      assert.ok(!unknown[0].members.includes('missing'));
    });
  });

  describe('orbit', () => {
    function coverage(angles) {
      const a = angles.slice().sort((x, y) => x - y);
      let maxGap = 0;
      for (let i = 0; i < a.length; i++) {
        const next = i + 1 < a.length ? a[i + 1] : a[0] + Math.PI * 2;
        maxGap = Math.max(maxGap, next - a[i]);
      }
      return Math.PI * 2 - maxGap;
    }

    it('keeps the focus and puts each kind of relation on its own side', () => {
      const nodes = [
        { id: 'task', kind: 'task', label: 'Peindre', x: 10, y: 20, w: 200, h: 50 },
        { id: 'goal', kind: 'goal', label: 'Maison', x: 400, y: 400, w: 200, h: 50 },
        { id: 'need', kind: 'task', label: 'Acheter', x: -300, y: 10, w: 200, h: 50 },
        { id: 'who', kind: 'person', label: 'Alice', x: 0, y: 0, w: 160, h: 40 },
        { id: 'where', kind: 'place', label: 'Atelier', x: 50, y: 80, w: 160, h: 40 },
        { id: 'far', kind: 'task', label: 'Autre', x: 2000, y: 2000, w: 200, h: 50 },
      ];
      const edges = [
        { from: 'task', to: 'goal', kind: 'serves' },
        { from: 'task', to: 'need', kind: 'depends' },
        { from: 'task', to: 'who', kind: 'by' },
        { from: 'task', to: 'where', kind: 'at' },
      ];
      const pose = MM.orbit(nodes, edges, 'task');
      assert.equal(pose.positions.task.x, 10);
      assert.equal(pose.positions.task.y, 20);
      assert.equal(pose.rings.goal, 1);
      assert.ok(pose.positions.goal.y < 20, 'a goal sits above');
      assert.ok(pose.positions.need.x > 10, 'a prerequisite sits to the right');
      assert.ok(pose.positions.who.x < 10 && pose.positions.who.y > 20, 'a person sits lower left');
      assert.ok(pose.positions.where.x > 10 && pose.positions.where.y > 20, 'a place sits lower right');
      assert.equal(pose.positions.far.x, 2000);
      assert.equal(pose.positions.far.y, 2000);
      assert.equal(pose.rings.far, undefined);
      assert.equal(nodes[1].x, 400, 'the input layout is left untouched');
    });

    it('opens a person into a ring of the tasks they do', () => {
      const nodes = [
        { id: 'p', kind: 'person', label: 'Alice', x: 0, y: 0, w: 160, h: 40 },
        { id: 'a', kind: 'task', label: 'A', x: 10, y: 10, w: 200, h: 40 },
        { id: 'b', kind: 'task', label: 'B', x: 20, y: 20, w: 200, h: 40 },
        { id: 'c', kind: 'task', label: 'C', x: 30, y: 30, w: 200, h: 40 },
        { id: 'd', kind: 'task', label: 'D', x: 40, y: 40, w: 200, h: 40 },
      ];
      const edges = ['a', 'b', 'c', 'd'].map((id) => ({ from: id, to: 'p', kind: 'by' }));
      const pose = MM.orbit(nodes, edges, 'p');
      const angles = ['a', 'b', 'c', 'd'].map((id) => Math.atan2(pose.positions[id].y, pose.positions[id].x));
      assert.ok(coverage(angles) > Math.PI, 'tasks spread around the person');
      ['a', 'b', 'c', 'd'].forEach((id) => assert.equal(pose.rings[id], 1));
      assert.equal(pose.positions.p.x, 0);
    });

    it('tucks the next relation behind the first and steps aside a card in the way', () => {
      const nodes = [
        { id: 't', kind: 'task', label: 'T', x: 0, y: 0, w: 200, h: 40 },
        { id: 'n', kind: 'task', label: 'N', x: 800, y: 0, w: 200, h: 40 },
        { id: 'o', kind: 'task', label: 'O', x: 400, y: 0, w: 200, h: 40 },
        { id: 'crowd', kind: 'task', label: 'C', x: 30, y: 20, w: 200, h: 40 },
      ];
      const edges = [
        { from: 't', to: 'n', kind: 'depends' },
        { from: 'n', to: 'o', kind: 'depends' },
      ];
      const pose = MM.orbit(nodes, edges, 't');
      const dn = Math.hypot(pose.positions.n.x, pose.positions.n.y);
      const dO = Math.hypot(pose.positions.o.x, pose.positions.o.y);
      const dc = Math.hypot(pose.positions.crowd.x, pose.positions.crowd.y);
      assert.equal(pose.rings.n, 1);
      assert.equal(pose.rings.o, 2);
      assert.ok(dO > dn);
      assert.ok(dc > dn);
    });
  });
  describe('perspective', () => {
    const now = new Date(2026, 9, 14);
    const task = (id, due) => ({ id, kind: 'task', label: id, w: 210, h: 52, rec: { due } });
    const nodes = [
      task('t1', '2026-10-10'), task('t2', '2026-10-16'), task('t3', ''), task('t4', '2027-03-01'),
      { id: 'pa', kind: 'person', label: 'Alice', w: 180, h: 40 },
      { id: 'pb', kind: 'person', label: 'Bob', w: 180, h: 40 },
      { id: 'pl', kind: 'place', label: 'Maison', w: 170, h: 40 },
      { id: 'g', kind: 'goal', label: 'But', w: 210, h: 50 },
    ];
    const edges = [
      { id: 'e1', kind: 'by', from: 't1', to: 'pa' },
      { id: 'e2', kind: 'by', from: 't2', to: 'pa' },
      { id: 'e3', kind: 'by', from: 't2', to: 'pb' },
      { id: 'e4', kind: 'at', from: 't4', to: 'pl' },
    ];

    it('buckets due dates around today', () => {
      assert.equal(MM.dueBucket('2026-10-10', now), 'late');
      assert.equal(MM.dueBucket('2026-10-14', now), 'week');
      assert.equal(MM.dueBucket('2026-10-25', now), 'month');
      assert.equal(MM.dueBucket('2027-03-01', now), 'later');
      assert.equal(MM.dueBucket('', now), 'none');
    });

    it('stacks tasks under their person; an unassigned task gets its own column', () => {
      const p = MM.perspective(nodes, edges, 'people', { now });
      assert.equal(p.positions.t1.x, p.positions.pa.x);
      assert.equal(p.positions.t2.x, p.positions.pa.x); // first person wins
      assert.ok(p.positions.t1.y > p.positions.pa.y);
      assert.ok(p.positions.t1.y < p.positions.t2.y); // sooner first
      assert.notEqual(p.positions.t3.x, p.positions.pa.x);
      assert.ok(p.heads.some((h) => h.label === 'Sans responsable'));
      assert.ok(p.dim.g && p.dim.pl && !p.dim.t1);
    });

    it('groups by due-date bucket and skips empty ones', () => {
      const p = MM.perspective(nodes, edges, 'time', { now });
      const labels = p.heads.map((h) => h.label);
      assert.deepEqual(labels.slice(0, 4), ['En retard', 'Cette semaine', 'Plus tard', 'Sans échéance']);
      assert.ok(p.positions.t1.x < p.positions.t2.x);
    });

    it('groups by status and by urgency tier', () => {
      const tasks = [
        { id: 'a', kind: 'task', label: 'A', w: 200, h: 60, rec: { blocked: true, priorityLabel: 'Haute', priorityScore: 9 } },
        { id: 'b', kind: 'task', label: 'B', w: 200, h: 60, rec: { progress: 40, priorityLabel: 'Basse', priorityScore: 2 } },
        { id: 'c', kind: 'task', label: 'C', w: 200, h: 60, rec: {} },
      ];
      const s = MM.perspective(tasks, [], 'status', { now });
      assert.deepEqual(s.heads.map((h) => h.label), ['Bloqué', 'En cours', 'À faire']);
      const u = MM.perspective(tasks, [], 'urgency', { now });
      assert.deepEqual(u.heads.map((h) => h.label), ['Haute', 'Basse', 'Sans urgence']);
    });

    it('returns nothing for the network or an unknown perspective', () => {
      assert.deepEqual(MM.perspective(nodes, edges, 'network').positions, {});
      assert.deepEqual(MM.perspective(nodes, edges, 'nope').positions, {});
    });
  });
});
