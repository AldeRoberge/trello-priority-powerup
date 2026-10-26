'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('TableModel', () => {
  let TM;

  before(() => {
    loadComponent('shared/desc-meta.js');
    loadComponent('table/table-model.js');
    TM = global.TableModel;
    assert.ok(TM);
  });

  const rec = (o) => ({
    id: 'c1',
    name: 'Tâche',
    desc: 'Texte',
    listId: 'l1',
    listName: 'En cours',
    pos: 100,
    priorityScore: 7.86,
    priorityLabel: 'Urgente',
    priorityEnabled: true,
    progress: 42.4,
    dueDate: '2026-10-03',
    inputs: { impact: 8, empressement: 'vite' },
    url: 'https://trello.com/c/abc',
    ...o,
  });

  it('normalizes columns like the Worker (known keys, unique, defaults)', () => {
    assert.deepEqual(TM.normalizeColumns(['name', 'zzz', 'name', 'statut']), ['name', 'statut']);
    assert.deepEqual(TM.normalizeColumns(null), TM.DEFAULT_COLUMNS);
  });

  it('builds a row from a Gantt record', () => {
    const row = TM.rowFromRecord(rec(), 'Vidéo');
    assert.equal(row.priority, 7.9);
    assert.equal(row.progress, 42);
    assert.equal(row.urgency, 'Vite');
    assert.equal(row.impact, 8);
    assert.equal(TM.rowFromRecord(rec({ estimatedMinutes: 20 })).estimate, 20);
    assert.equal(row.estimate, 0);
    assert.equal(row.category, 'Vidéo');
    assert.equal(row.statut, 'En cours');
    assert.equal(TM.cellText(row, 'progress'), '42%');
    assert.deepEqual(row.items, []);
    assert.equal(row.dueVague, '');
  });

  it('blanks computed columns when priority is disabled', () => {
    const row = TM.rowFromRecord(rec({ priorityEnabled: false }));
    assert.equal(row.priority, null);
    assert.equal(row.urgency, '');
  });

  it('shows only the visible part of the description', () => {
    const row = TM.rowFromRecord(rec({ desc: 'Bonjour\n\n<!-- cerveau-meta\nwaiting: Paul\nwaiting-since: 2026-10-01\n-->' }));
    assert.equal(row.desc, 'Bonjour');
    assert.match(row.fullDesc, /cerveau-meta/);
    assert.equal(row.waiting, 'Paul');
    assert.equal(row.waitingSince, '2026-10-01');
  });

  it('sorts by several levels, later ones breaking ties', () => {
    const rows = [
      { id: 'a', priority: 5, name: 'b' },
      { id: 'b', priority: 5, name: 'a' },
      { id: 'c', priority: 9, name: 'c' },
      { id: 'd', priority: null, name: 'a' },
    ];
    const ids = (s) => TM.sortRowsMulti(rows, s).map((r) => r.id);
    assert.deepEqual(ids([{ key: 'priority', dir: 'desc' }, { key: 'name', dir: 'asc' }]), ['c', 'b', 'a', 'd']);
    assert.deepEqual(ids([{ key: 'priority', dir: 'desc' }, { key: 'name', dir: 'desc' }]), ['c', 'a', 'b', 'd']);
    assert.deepEqual(ids([]), ['a', 'b', 'c', 'd']);
  });

  it('sorts numbers and text, empties last in both directions', () => {
    const rows = [
      { id: 'a', priority: 5, name: 'b' },
      { id: 'b', priority: null, name: 'a' },
      { id: 'c', priority: 9, name: 'c' },
    ];
    assert.deepEqual(TM.sortRows(rows, 'priority', 'desc').map((r) => r.id), ['c', 'a', 'b']);
    assert.deepEqual(TM.sortRows(rows, 'priority', 'asc').map((r) => r.id), ['a', 'c', 'b']);
    assert.deepEqual(TM.sortRows(rows, 'name', 'asc').map((r) => r.id), ['b', 'a', 'c']);
  });

  it('sorts Urgence by its scale, not alphabetically', () => {
    const rows = ['Vite', 'Aucun', 'Au plus vite', 'Assez vite', '', 'Bientôt'].map((urgency, i) => ({ id: String(i), urgency }));
    const asc = TM.sortRows(rows, 'urgency', 'asc').map((r) => r.urgency);
    assert.deepEqual(asc, ['Aucun', 'Bientôt', 'Assez vite', 'Vite', 'Au plus vite', '']);
    const desc = TM.sortRows(rows, 'urgency', 'desc').map((r) => r.urgency);
    assert.deepEqual(desc, ['Au plus vite', 'Vite', 'Assez vite', 'Bientôt', 'Aucun', '']);
  });

  it('sorts Palier by tier rank (custom labels do not matter)', () => {
    const rows = [
      { id: 'a', tier: 'Zen', tierI: 4 },
      { id: 'b', tier: 'Alpha', tierI: 1 },
      { id: 'c', tier: '', tierI: null },
      { id: 'd', tier: 'Beta', tierI: 2 },
    ];
    assert.deepEqual(TM.sortRows(rows, 'tier', 'asc').map((r) => r.id), ['b', 'd', 'a', 'c']);
    assert.equal(TM.rowFromRecord(rec({ priorityTierI: 3 })).tierI, 3);
    assert.equal(TM.rowFromRecord(rec({ priorityTierI: 3, priorityEnabled: false })).tierI, null);
  });

  it('sorts Statut in board list order when the lists are given', () => {
    const lists = [{ id: 'todo' }, { id: 'doing' }, { id: 'done' }];
    const rows = [
      { id: 'a', listId: 'done', statut: 'Terminé' },
      { id: 'b', listId: 'todo', statut: 'Zéro' },
      { id: 'c', listId: 'doing', statut: 'Alpha' },
    ];
    assert.deepEqual(TM.sortRows(rows, 'statut', 'asc', { lists }).map((r) => r.id), ['b', 'c', 'a']);
    assert.deepEqual(TM.sortRows(rows, 'statut', 'desc', { lists }).map((r) => r.id), ['a', 'c', 'b']);
    // Without lists it falls back to the displayed name.
    assert.deepEqual(TM.sortRows(rows, 'statut', 'asc').map((r) => r.id), ['c', 'a', 'b']);
  });

  it('words the sort directions to match the column (no "A à Z" on numbers or dates)', () => {
    assert.deepEqual(TM.sortLabels('name'), { asc: 'de A à Z', desc: 'de Z à A' });
    assert.match(TM.sortLabels('priority').asc, /petit/);
    assert.match(TM.sortLabels('due').asc, /ancien/);
    assert.match(TM.sortLabels('urgency').asc, /moins au plus urgent/);
    assert.match(TM.sortLabels('statut').asc, /ordre du tableau/);
    Object.keys(TM.COLUMNS).forEach((key) => {
      const l = TM.sortLabels(key);
      assert.ok(l.asc && l.desc && l.asc !== l.desc, key);
    });
  });

  it('formats due dates in French, dropping the current year', () => {
    const now = new Date(2026, 8, 30);
    assert.equal(TM.formatDay('2026-10-03', now), '3 oct.');
    assert.equal(TM.formatDay('2026-01-15', now), '15 janv.');
    assert.equal(TM.formatDay('2027-03-01', now), '1 mars 2027');
    assert.equal(TM.formatDay('', now), '');
    assert.equal(TM.formatDay('demain', now), 'demain');
    assert.equal(TM.formatDay('2026-13-01', now), '2026-13-01');
  });

  it('filters on text columns', () => {
    const rows = [{ name: 'Facture', desc: '', statut: 'À faire' }, { name: 'Logo', desc: 'facture jointe', statut: 'En cours' }];
    assert.equal(TM.filterRows(rows, 'facture').length, 2);
    assert.equal(TM.filterRows(rows, 'logo').length, 1);
    assert.equal(TM.filterRows(rows, '').length, 2);
  });

  it('orders rows by list then position', () => {
    const rows = [
      { id: 'a', listId: 'l2', pos: 1 },
      { id: 'b', listId: 'l1', pos: 20 },
      { id: 'c', listId: 'l1', pos: 10 },
    ];
    const lists = [{ id: 'l1' }, { id: 'l2' }];
    assert.deepEqual(TM.orderByLists(rows, lists).map((r) => r.id), ['c', 'b', 'a']);
  });

  it('computes drop positions between neighbours', () => {
    const sib = [{ pos: 100 }, { pos: 200 }];
    assert.equal(TM.dropPos(sib, 0), 50);
    assert.equal(TM.dropPos(sib, 1), 150);
    assert.equal(TM.dropPos(sib, 2), 65736);
    assert.equal(TM.dropPos([], 0), 65536);
  });

  it('maps Statut categories to icons and enriches lists with colors', () => {
    assert.equal(TM.statutIcon('completed'), 'circle-check');
    assert.equal(TM.statutIcon('nope'), 'circle-dotted');
    const sm = { categoryStyle: (c) => ({ color: c === 'started' ? '#0c66e4' : '#626f86' }), applyStateColors() {} };
    const lists = TM.enrichLists([{ id: 'l1', name: 'Doing' }, { id: 'l2', name: 'Autre' }], { listCategories: { l1: 'started' } }, sm);
    assert.deepEqual(lists[0], { id: 'l1', name: 'Doing', category: 'started', color: '#0c66e4', icon: 'circle-half-2' });
    assert.equal(lists[1].icon, 'circle-dotted');
  });

  it('carries the Statut category and color on rows', () => {
    const row = TM.rowFromRecord(rec({ category: 'started', color: '#0c66e4' }));
    assert.equal(row.statutKey, 'started');
    assert.equal(row.statutColor, '#0c66e4');
  });

  it('every column has a Tabler icon', () => {
    Object.keys(TM.COLUMNS).forEach((k) => assert.ok(TM.COLUMNS[k].icon, k));
  });

  it('builds the /push payload with blanks instead of nulls', () => {
    const payload = TM.pushPayload([{ id: 'x', priority: null, progress: 10, impact: 3, urgency: 'Vite', tier: '' }]);
    assert.deepEqual(payload.cards[0], { id: 'x', urgency: 'Vite', impact: 3, priority: '', tier: '', progress: 10 });
  });

  it('parses the connection code from the setup script', () => {
    const payload = { v: 1, workerUrl: 'https://w.example.workers.dev/', secret: 'abc', sheetUrl: 'https://docs.google.com/spreadsheets/d/1/edit' };
    const code = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    assert.deepEqual(TM.parseConnectionCode(code), {
      workerUrl: 'https://w.example.workers.dev',
      secret: 'abc',
      sheetUrl: payload.sheetUrl,
    });
    assert.equal(TM.parseConnectionCode('not base64 json'), null);
    assert.equal(TM.parseConnectionCode(Buffer.from('{"v":2}').toString('base64')), null);
    const insecure = Buffer.from(JSON.stringify({ ...payload, workerUrl: 'http://x' })).toString('base64');
    assert.equal(TM.parseConnectionCode(insecure), null);
  });
});

describe('TableModel.subtaskRows', () => {
  let TM;

  before(() => {
    loadComponent('table/table-model.js');
    TM = global.TableModel;
  });

  it('turns checklist items into child rows, nested ones after their parent with a deeper depth', () => {
    const row = {
      id: 'card1',
      items: [
        { id: 'a', text: 'Vidéo', done: true },
        { id: 'b', text: 'Photos', progress: 40, dueDate: '2026-10-30', items: [{ id: 'b1', text: 'Drone', done: false }] },
      ],
    };
    const subs = TM.subtaskRows(row);
    assert.deepEqual(
      subs.map((s) => [s.name, s.depth, s.done, s.progress, s.parentId]),
      [
        ['Vidéo', 0, true, 100, 'card1'],
        ['Photos', 0, false, 40, 'card1'],
        ['Drone', 1, false, 0, 'card1'],
      ]
    );
    assert.equal(subs[1].due, '2026-10-30');
    assert.equal(new Set(subs.map((s) => s.id)).size, 3);
  });

  it('leaves out items linked to another card and returns [] when there are none', () => {
    const row = { id: 'c', items: [{ id: 'x', text: 'Autre carte', linkedCardId: 'c2' }, { id: 'y', text: 'Local' }] };
    assert.deepEqual(TM.subtaskRows(row).map((s) => s.name), ['Local']);
    assert.deepEqual(TM.subtaskRows({ id: 'd', items: [] }), []);
    assert.deepEqual(TM.subtaskRows({ id: 'e' }), []);
  });
  it('withHierarchy fills the project and the card that links this one', () => {
    const rows = [
      { id: 'a', name: 'Parent', items: [{ text: 'x', items: [{ linkedCardId: 'b' }] }] },
      { id: 'b', name: 'Enfant', items: [] },
      { id: 'c', name: 'Libre', items: [] },
    ];
    TM.withHierarchy(rows, { b: { project: 'Site web' } });
    assert.deepEqual(rows.map((r) => [r.parent, r.project]), [['', ''], ['Parent', 'Site web'], ['', '']]);
  });

  it('groupByProject makes sections in first-seen order, free cards last, null without projects', () => {
    const r = (id, project) => ({ id, project });
    const g = TM.groupByProject([r('a', 'B'), r('b', ''), r('c', 'A'), r('d', 'B')], { 'p:A': true });
    assert.deepEqual(g.map((x) => [x.name, x.rows.length, x.open]), [['B', 2, true], ['A', 1, false], ['Sans projet', 1, true]]);
    assert.equal(TM.groupByProject([r('a', '')]), null);
  });

  it('sectionStats averages each task once, subtasks first', () => {
    const stats = TM.sectionStats([
      { progress: 10, items: [{ progress: 0 }, { progress: 100 }, { linkedCardId: 'other', progress: 0 }] },
      { progress: 40, items: [] },
      { progress: null },
    ]);
    assert.equal(stats.progress, 45);
    assert.equal(stats.subs, 2);
    assert.equal(stats.tasks, 3);
    assert.equal(TM.sectionStats([{ items: [{ done: true }] }]).progress, 100);
    assert.equal(TM.sectionStats([{ progress: null }]).progress, null);
    assert.equal(TM.sectionStats([{ progress: 0, blocked: true }]).blocked, true);
    assert.equal(TM.sectionStats([{ progress: 0, items: [{ text: 'a', blocked: true, progress: 0 }] }]).blocked, true);
    assert.equal(TM.sectionStats([{ progress: 100, blocked: true }]).blocked, false);
    assert.equal(TM.sectionStats([{ progress: 40, statutKey: 'completed', blocked: true }]).blocked, false);
    assert.equal(TM.sectionStats([{ progress: 10 }]).blocked, false);
  });

  it('groupByProject keeps an empty project and the priority set on it', () => {
    const rows = [{ id: 'a', project: 'B', projectId: 'b' }, { id: 'z', project: '' }];
    const g = TM.groupByProject(rows, {}, [
      { id: 'b', name: 'B', priority: 6.6 },
      { id: 'c', name: 'C', priority: 2 },
    ]);
    assert.deepEqual(g.map((x) => [x.name, x.rows.length, x.priority, x.id]), [
      ['B', 1, 6.6, 'b'],
      ['C', 0, 2, 'c'],
      ['Sans projet', 1, null, ''],
    ]);
    assert.equal(TM.clampPriority(11), 10);
    assert.equal(TM.clampPriority(6.55), 6.6);
    assert.equal(TM.clampPriority('haute'), null);
    assert.equal(TM.formatPriority(5), '5.0');
    assert.equal(TM.formatPriority(6.5), '6.5');
    assert.equal(TM.formatPriority(10), '10.0');
    assert.equal(TM.formatPriority(null), '');
    const items = TM.projectPriorityItems(5, function () {});
    assert.equal(items[0].label, 'Critique');
    assert.equal(items.find((it) => it.checked).label, 'Importante');
    assert.equal(items[items.length - 1].label, 'Retirer');
  });
});
