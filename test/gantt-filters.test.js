'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

function card(id, over) {
  return Object.assign(
    {
      id: 'card:' + id,
      kind: 'card',
      cardId: id,
      name: id,
      depth: 0,
      children: [],
      progress: 0,
      done: false,
      category: 'unstarted',
      blocked: false,
      dueDate: '',
      startDate: '',
      listId: 'L1',
      listName: 'Backlog',
      assignees: [],
      labels: [],
      priorityEnabled: true,
      priorityTierI: null,
      priorityLabel: '',
      priorityRankTier: 100,
      priorityRankScore: -1,
    },
    over || {}
  );
}

const ME = { id: 'm-me', name: 'Moi Meme', initials: 'MM', custom: false, trelloId: 'm-me' };
const ANA = { id: 'm-ana', name: 'Ana', initials: 'A', custom: false, trelloId: 'm-ana' };
const BOB = { id: 'person-bob', name: 'Bob', initials: 'B', custom: true, trelloId: '' };

function names(list) {
  return list.map((n) => n.name);
}

describe('GanttModel multi-level sort', () => {
  let M;
  before(() => {
    loadComponent('gantt/gantt-model.js');
    M = global.GanttModel;
  });

  it('normalizeSortKeys drops unknown / duplicate fields, caps the levels, defaults to date', () => {
    assert.deepEqual(M.normalizeSortKeys(null), [{ by: 'date', dir: 'asc' }]);
    assert.deepEqual(
      M.normalizeSortKeys([
        { by: 'status' },
        { by: 'status', dir: 'desc' },
        { by: 'nope' },
        'progress',
        { by: 'name', dir: 'sideways' },
      ]),
      [
        { by: 'status', dir: 'asc' },
        { by: 'progress', dir: 'desc' },
        { by: 'name', dir: 'asc' },
      ]
    );
    const all = M.SORT_FIELDS.map((f) => ({ by: f.key }));
    assert.equal(M.normalizeSortKeys(all).length, M.MAX_SORT_KEYS);
  });

  it('later levels only break ties of earlier ones', () => {
    const rows = [
      card('c', { name: 'c', priorityRankTier: 2 }),
      card('a', { name: 'a', priorityRankTier: 1 }),
      card('b', { name: 'b', priorityRankTier: 1 }),
      card('d', { name: 'd', priorityRankTier: 2 }),
    ];
    const out = M.sortTreeRootsMulti(rows, [
      { by: 'priority', dir: 'asc' },
      { by: 'name', dir: 'desc' },
    ]);
    assert.deepEqual(names(out), ['b', 'a', 'd', 'c']);
  });

  it('sorts by status then priority (the case the single-column sort could not do)', () => {
    const rows = [
      card('pend-low', { category: 'unstarted', priorityRankTier: 5 }),
      card('done-hi', { done: true, category: 'completed', priorityRankTier: 1 }),
      card('start-low', { category: 'started', priorityRankTier: 5 }),
      card('block-hi', { blocked: true, priorityRankTier: 1 }),
      card('start-hi', { category: 'started', priorityRankTier: 1 }),
    ];
    const out = M.sortTreeRootsMulti(rows, [
      { by: 'status', dir: 'asc' },
      { by: 'priority', dir: 'asc' },
    ]);
    assert.deepEqual(names(out), [
      'start-hi',
      'start-low',
      'pend-low',
      'block-hi',
      'done-hi',
    ]);
  });

  it('rows without a value (no date, no assignee) stay last in both directions', () => {
    const rows = [
      card('none'),
      card('late', { dueDate: '2026-09-30' }),
      card('soon', { dueDate: '2026-09-01' }),
    ];
    assert.deepEqual(names(M.sortTreeRootsMulti(rows, [{ by: 'date', dir: 'asc' }])), [
      'soon',
      'late',
      'none',
    ]);
    assert.deepEqual(names(M.sortTreeRootsMulti(rows, [{ by: 'date', dir: 'desc' }])), [
      'late',
      'soon',
      'none',
    ]);
    const people = [card('nobody'), card('z', { assignees: [ANA] }), card('y', { assignees: [BOB] })];
    assert.deepEqual(
      names(M.sortTreeRootsMulti(people, [{ by: 'assignee', dir: 'asc' }])),
      ['z', 'y', 'nobody']
    );
  });

  it('keeps the original order for full ties', () => {
    const rows = ['x', 'y', 'z'].map((id) => card(id, { name: 'same' }));
    assert.deepEqual(
      M.sortTreeRootsMulti(rows, [{ by: 'name', dir: 'desc' }]).map((n) => n.id),
      ['card:x', 'card:y', 'card:z']
    );
  });

  it('grouped mode sorts inside each status section, flat mode has no headers', () => {
    const rows = [
      card('s2', { category: 'started', priorityRankTier: 2 }),
      card('s1', { category: 'started', priorityRankTier: 1 }),
      card('p1', { category: 'unstarted', priorityRankTier: 1 }),
    ];
    const keys = [{ by: 'priority', dir: 'asc' }];
    const grouped = M.sortTreeRootsGroupedByState(rows, keys, null, { group: true });
    assert.deepEqual(
      grouped.map((s) => s.kind + ':' + names(s.children).join(',')),
      ['section:s1,s2', 'section:p1', 'section:']
    );
    const flat = M.sortTreeRootsGroupedByState(grouped, keys, null, { group: false });
    assert.ok(flat.every((n) => n.kind === 'card'));
    assert.deepEqual(names(flat), ['s1', 'p1', 's2']);
  });

  it('legacy (sortBy, sortDir) call still works', () => {
    const rows = [card('b'), card('a')];
    const grouped = M.sortTreeRootsGroupedByState(rows, 'name', 'asc');
    assert.deepEqual(names(grouped[1].children), ['a', 'b']);
  });
});

describe('GanttModel filter criteria', () => {
  let M;
  const ctx = { meIds: ['m-me'], today: '2026-09-29' };
  before(() => {
    loadComponent('gantt/gantt-model.js');
    M = global.GanttModel;
  });

  it('normalizeCriteria cleans junk and criteriaCount counts groups', () => {
    const c = M.normalizeCriteria({
      query: '  hi  ',
      statuses: ['started', 'bogus', 'started'],
      assignees: ['me', '', null],
      due: ['week', 'never'],
    });
    assert.equal(c.query, 'hi');
    assert.deepEqual(c.statuses, ['started']);
    assert.deepEqual(c.assignees, ['me']);
    assert.deepEqual(c.due, ['week']);
    assert.equal(M.criteriaCount(c), 4);
    assert.equal(M.criteriaCount(null), 0);
  });

  it('"me" matches Trello id and linked custom assignee; "none" matches unassigned', () => {
    const mine = card('mine', { assignees: [ME] });
    const linked = card('linked', {
      assignees: [{ id: 'person-me', name: 'Moi', custom: true, trelloId: 'm-me' }],
    });
    const other = card('other', { assignees: [ANA] });
    const nobody = card('nobody');
    const onlyMe = { assignees: ['me'] };
    assert.equal(M.matchesCriteria(mine, onlyMe, ctx), true);
    assert.equal(M.matchesCriteria(linked, onlyMe, ctx), true);
    assert.equal(M.matchesCriteria(other, onlyMe, ctx), false);
    assert.equal(M.matchesCriteria(nobody, onlyMe, ctx), false);
    assert.equal(M.matchesCriteria(nobody, { assignees: ['none'] }, ctx), true);
    assert.equal(M.matchesCriteria(other, { assignees: ['none'] }, ctx), false);
    // OR inside a group
    assert.equal(M.matchesCriteria(nobody, { assignees: ['me', 'none'] }, ctx), true);
    assert.equal(M.matchesCriteria(other, { assignees: ['m-ana'] }, ctx), true);
    // unknown me => "me" matches nothing
    assert.equal(M.matchesCriteria(mine, onlyMe, { meIds: [] }), false);
  });

  it('groups are ANDed: mine AND not finished', () => {
    const c = { assignees: ['me'], statuses: ['started', 'pending', 'blocked'] };
    assert.equal(M.matchesCriteria(card('a', { assignees: [ME] }), c, ctx), true);
    assert.equal(
      M.matchesCriteria(card('b', { assignees: [ME], done: true, category: 'completed' }), c, ctx),
      false
    );
    assert.equal(M.matchesCriteria(card('c', { assignees: [ANA] }), c, ctx), false);
  });

  it('due buckets: overdue / today / week / none', () => {
    const t = (d, over) => card('d', Object.assign({ dueDate: d }, over));
    assert.equal(M.matchesCriteria(t('2026-09-20'), { due: ['overdue'] }, ctx), true);
    assert.equal(
      M.matchesCriteria(t('2026-09-20', { done: true, category: 'completed' }), { due: ['overdue'] }, ctx),
      false
    );
    assert.equal(M.matchesCriteria(t('2026-09-29'), { due: ['today'] }, ctx), true);
    assert.equal(M.matchesCriteria(t('2026-10-05'), { due: ['week'] }, ctx), true);
    assert.equal(M.matchesCriteria(t('2026-10-06'), { due: ['week'] }, ctx), false);
    assert.equal(M.matchesCriteria(t('2026-09-28'), { due: ['week'] }, ctx), false);
    assert.equal(M.matchesCriteria(t(''), { due: ['none'] }, ctx), true);
    assert.equal(M.matchesCriteria(t('2026-09-29'), { due: ['none'] }, ctx), false);
  });

  it('search is accent-insensitive and matches name, list, people and labels', () => {
    const c = card('x', {
      name: 'Réunion équipe',
      listName: 'À faire',
      assignees: [ANA],
      labels: [{ id: 'l1', name: 'Urgent', color: 'red' }],
    });
    assert.equal(M.matchesCriteria(c, { query: 'reunion' }, ctx), true);
    assert.equal(M.matchesCriteria(c, { query: 'equipe ana' }, ctx), true);
    assert.equal(M.matchesCriteria(c, { query: 'urgent' }, ctx), true);
    assert.equal(M.matchesCriteria(c, { query: 'a faire' }, ctx), true);
    assert.equal(M.matchesCriteria(c, { query: 'zzz' }, ctx), false);
  });

  it('priority, list and label facets', () => {
    const c = card('x', {
      priorityTierI: 1,
      listId: 'L2',
      labels: [{ id: 'l1', name: 'A', color: 'red' }],
    });
    assert.equal(M.matchesCriteria(c, { priorities: ['tier:1'] }, ctx), true);
    assert.equal(M.matchesCriteria(c, { priorities: ['none'] }, ctx), false);
    assert.equal(M.matchesCriteria(card('y'), { priorities: ['none'] }, ctx), true);
    assert.equal(M.matchesCriteria(c, { lists: ['L2'] }, ctx), true);
    assert.equal(M.matchesCriteria(c, { lists: ['L1'] }, ctx), false);
    assert.equal(M.matchesCriteria(c, { labels: ['l1'] }, ctx), true);
    assert.equal(M.matchesCriteria(c, { labels: ['l9'] }, ctx), false);
  });

  it('filterRows drops a failing card together with its subtasks, keeps the rest', () => {
    const rows = [
      { kind: 'section', sectionKey: 'started', depth: 0, id: 'section:started' },
      card('mine', { assignees: [ME] }),
      { kind: 'local', id: 'l1', depth: 1, name: 'sub of mine' },
      card('theirs', { assignees: [ANA] }),
      { kind: 'local', id: 'l2', depth: 1, name: 'sub of theirs' },
      { kind: 'card', id: 'card:deep', cardId: 'deep', depth: 2, name: 'deep', assignees: [] },
      card('mine2', { assignees: [ME] }),
    ];
    const out = M.filterRows(rows, { criteria: { assignees: ['me'] }, meIds: ['m-me'] });
    assert.deepEqual(
      out.map((r) => r.id),
      ['section:started', 'card:mine', 'l1', 'card:mine2']
    );
  });

  it('filterRows without criteria behaves as before', () => {
    const rows = [card('a'), card('b', { done: true, category: 'completed' })];
    assert.equal(M.filterRows(rows, { hideCompleted: true }).length, 1);
    assert.equal(M.filterRows(rows, {}).length, 2);
  });

  it('collectFacets counts people, lists, statuses, tiers', () => {
    const tree = [
      {
        kind: 'section',
        children: [
          card('a', { assignees: [ME, ANA], priorityTierI: 1, priorityLabel: 'Critique', priorityFill: '#f00' }),
          card('b', { assignees: [ANA], category: 'started', listId: 'L2', listName: 'Doing' }),
          card('c', { done: true, category: 'completed' }),
        ],
      },
    ];
    const f = M.collectFacets(tree, { meIds: ['m-me'] });
    assert.equal(f.total, 3);
    assert.equal(f.mine, 1);
    assert.equal(f.unassigned, 1);
    assert.deepEqual(f.statuses, { started: 1, pending: 1, blocked: 0, completed: 1 });
    assert.deepEqual(
      f.assignees.map((p) => [p.name, p.count]),
      [
        ['Ana', 2],
        ['Moi Meme', 1],
      ]
    );
    assert.equal(f.lists.length, 2);
    assert.equal(f.priorities[0].label, 'Critique');
    assert.equal(f.noPriority, 2);
  });
});

describe('GanttTrello.buildAssignees', () => {
  let GT;
  before(() => {
    loadComponent('gantt/gantt-model.js');
    loadComponent('gantt/gantt-trello.js');
    GT = global.GanttTrello;
  });

  it('merges Trello members and Hors Trello people without duplicates', () => {
    const list = GT.buildAssignees(
      [
        { id: 'm1', fullName: 'Ana Lopez', initials: 'AL' },
        { id: 'm1', fullName: 'Ana Lopez' },
        { id: 'm2', username: 'bob' },
        null,
      ],
      [
        { id: 'person-ana', name: 'Ana Lopez', trelloMemberId: 'm1' }, // already a member
        { id: 'person-cy', name: 'Cy Dupont' },
        { id: 'person-me', name: 'Moi', trelloMemberId: 'm-me' },
      ]
    );
    assert.deepEqual(
      list.map((p) => [p.id, p.name, p.initials, p.custom, p.trelloId]),
      [
        ['m1', 'Ana Lopez', 'AL', false, 'm1'],
        ['m2', 'bob', 'BO', false, 'm2'],
        ['person-cy', 'Cy Dupont', 'CD', true, ''],
        ['person-me', 'Moi', 'MO', true, 'm-me'],
      ]
    );
    assert.deepEqual(GT.buildAssignees(undefined, undefined), []);
  });

  it('buildLabels keeps id / name / color', () => {
    assert.deepEqual(GT.buildLabels([{ id: 'l1', name: ' Bug ', color: 'red' }, { name: 'x' }]), [
      { id: 'l1', name: 'Bug', color: 'red' },
    ]);
  });
});

describe('GanttFilters helpers', () => {
  let GF;
  let M;
  before(() => {
    loadComponent('gantt/gantt-model.js');
    loadComponent('gantt/gantt-filters.js');
    GF = global.GanttFilters;
    M = global.GanttModel;
    assert.ok(GF);
  });

  it('every sort preset is a valid, non-empty key list', () => {
    GF.SORT_PRESETS.forEach((p) => {
      assert.deepEqual(M.normalizeSortKeys(p.keys), p.keys, p.id);
    });
  });

  it('every filter preset only uses known criteria values', () => {
    GF.FILTER_PRESETS.forEach((p) => {
      const c = M.normalizeCriteria(p.criteria);
      assert.ok(M.criteriaCount(c) > 0, p.id);
      assert.ok(GF.presetMatches(p, c), p.id);
      assert.equal(GF.presetMatches(p, M.emptyCriteria()), false, p.id);
    });
  });

  it('describeSort / sortDirLabel read naturally', () => {
    assert.equal(
      GF.describeSort([
        { by: 'priority', dir: 'asc' },
        { by: 'date', dir: 'desc' },
      ]),
      'Priorité ▲ › Date ▼'
    );
    assert.equal(GF.sortDirLabel('name', 'desc'), 'Z → A');
    assert.equal(GF.sortDirLabel('progress', 'desc'), '100 → 0 %');
  });

  it('describeCriteria resolves names and skips empty groups', () => {
    const facets = {
      assignees: [{ id: 'm-ana', name: 'Ana' }],
      lists: [{ id: 'L1', name: 'Backlog' }],
      priorities: [{ key: 'tier:1', label: 'Critique' }],
    };
    const items = GF.describeCriteria(
      {
        assignees: ['me', 'm-ana', 'none'],
        priorities: ['tier:1', 'none'],
        lists: ['L1'],
        due: ['overdue'],
      },
      facets
    );
    assert.deepEqual(
      items.map((i) => [i.group, i.text]),
      [
        ['assignees', 'Moi, Ana, Non assigné'],
        ['priorities', 'Critique, Sans priorité'],
        ['due', 'En retard'],
        ['lists', 'Backlog'],
      ]
    );
    assert.deepEqual(GF.describeCriteria(null, facets), []);
  });

  it('toggleIn adds and removes without mutating', () => {
    const a = ['x'];
    assert.deepEqual(GF.toggleIn(a, 'y'), ['x', 'y']);
    assert.deepEqual(GF.toggleIn(a, 'x'), []);
    assert.deepEqual(a, ['x']);
  });
});
