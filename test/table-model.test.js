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
    assert.equal(row.category, 'Vidéo');
    assert.equal(row.statut, 'En cours');
    assert.equal(TM.cellText(row, 'progress'), '42%');
  });

  it('blanks computed columns when priority is disabled', () => {
    const row = TM.rowFromRecord(rec({ priorityEnabled: false }));
    assert.equal(row.priority, null);
    assert.equal(row.urgency, '');
  });

  it('shows only the visible part of the description', () => {
    const row = TM.rowFromRecord(rec({ desc: 'Bonjour\n\n<!-- cerveau-meta\nfoo: bar\n-->' }));
    assert.equal(row.desc, 'Bonjour');
    assert.match(row.fullDesc, /cerveau-meta/);
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
