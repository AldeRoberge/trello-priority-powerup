'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SRC = path.join(__dirname, '..', 'workers', 'trello-sheet-sync', 'src');
const load = (f) => import(pathToFileURL(path.join(SRC, f)).href);

describe('trello-sheet-sync worker logic', () => {
  let plan;
  let columns;
  let statut;
  let descMeta;

  before(async () => {
    plan = await load('plan.js');
    columns = await load('columns.js');
    statut = await load('statut.js');
    descMeta = await load('descMeta.js');
  });

  const lists = [
    { id: 'l1', name: 'À faire' },
    { id: 'l2', name: 'En cours' },
    { id: 'l3', name: 'Terminé' },
  ];
  const keys = ['category', 'name', 'statut', 'priority', 'desc'];
  const card = (o) => ({ id: 'c1', name: 'Tâche', desc: '', idList: 'l1', due: null, shortUrl: 'https://trello.com/c/x', pos: 1, category: '', ...o });

  describe('columns', () => {
    it('normalizes, dedupes and falls back to defaults', () => {
      assert.deepEqual(columns.normalizeColumns('name, foo, name,statut'), ['name', 'statut']);
      assert.deepEqual(columns.normalizeColumns([]), columns.DEFAULT_COLUMNS);
    });
    it('round-trips headers to keys', () => {
      const header = columns.headerRow(['name', 'priority']);
      assert.deepEqual(header, ['TrelloCardId', 'Objet', 'Priorité']);
      assert.deepEqual(columns.keysFromHeader(header), ['name', 'priority']);
    });
  });

  describe('statut', () => {
    it('maps list names to labels and back', () => {
      assert.equal(statut.statutLabelForList('En cours'), '▶️ En cours');
      assert.equal(statut.statutLabelForList('Ma liste perso'), 'Ma liste perso');
      assert.equal(statut.findListForStatut(lists, '✅ Terminé').id, 'l3');
      assert.equal(statut.findListForStatut(lists, 'doing').id, 'l2');
      assert.equal(statut.findListForStatut(lists, 'zzz'), null);
    });
  });

  describe('descMeta', () => {
    it('keeps hidden metadata out of the sheet and re-attaches it', () => {
      const full = 'Bonjour\n\n<!-- cerveau-meta {"a":1} -->';
      const { visible, hidden } = descMeta.splitDesc(full);
      assert.equal(visible, 'Bonjour');
      assert.equal(descMeta.joinDesc('Salut', hidden), 'Salut\n\n<!-- cerveau-meta {"a":1} -->');
    });
  });

  describe('mergeField', () => {
    it('propagates the side that changed', () => {
      assert.deepEqual(plan.mergeField('a', 'b', 'a'), { next: 'b', writeSheet: true, writeTrello: false });
      assert.deepEqual(plan.mergeField('a', 'a', 'c'), { next: 'c', writeSheet: false, writeTrello: true });
      assert.equal(plan.mergeField('a', 'a', 'a').writeSheet, false);
    });
    it('Trello wins when both changed differently', () => {
      const m = plan.mergeField('a', 'b', 'c');
      assert.equal(m.next, 'b');
      assert.equal(m.writeSheet, true);
      assert.equal(m.conflict, true);
    });
  });

  describe('planSync', () => {
    const run = (o) => plan.planSync({ keys, lists, state: {}, timeZone: 'America/Toronto', ...o });

    it('appends cards missing from the sheet and records their baseline', () => {
      const out = run({ cards: [card({ name: 'A' }), card({ id: 'c2', name: 'B', pos: 2, idList: 'l2' })], rows: [] });
      assert.equal(out.appendRows.length, 2);
      assert.deepEqual(out.appendRows[1], ['c2', '', 'B', '▶️ En cours', '', '']);
      assert.equal(out.newState.c2.name, 'B');
    });

    it('pushes a Sheet edit of the name to Trello', () => {
      const state = { c1: { name: 'Tâche', desc: '', statut: '⚪ Non démarré', category: '' } };
      const out = run({ cards: [card()], state, rows: [['c1', '', 'Nouveau nom', '⚪ Non démarré', 3, '']] });
      assert.deepEqual(out.trelloUpdates, [{ cardId: 'c1', fields: { name: 'Nouveau nom' }, category: undefined }]);
      assert.equal(out.newState.c1.name, 'Nouveau nom');
    });

    it('moves the card when the Statut cell changes', () => {
      const state = { c1: { name: 'Tâche', desc: '', statut: '⚪ Non démarré', category: '' } };
      const out = run({ cards: [card()], state, rows: [['c1', '', 'Tâche', '✅ Terminé', '', '']] });
      assert.equal(out.trelloUpdates[0].fields.idList, 'l3');
    });

    it('restores an unknown Statut instead of writing it', () => {
      const state = { c1: { name: 'Tâche', desc: '', statut: '⚪ Non démarré', category: '' } };
      const out = run({ cards: [card()], state, rows: [['c1', '', 'Tâche', 'n’importe quoi', '', '']] });
      assert.equal(out.trelloUpdates.length, 0);
      assert.ok(out.cellWrites.some((w) => w.col === 4 && w.value === '⚪ Non démarré'));
      assert.equal(out.log[0].note, 'statut inconnu — restauré');
    });

    it('writes Trello changes into the Sheet, leaving computed columns alone', () => {
      const state = { c1: { name: 'Tâche', desc: '', statut: '⚪ Non démarré', category: '' } };
      const out = run({ cards: [card({ name: 'Renommée' })], state, rows: [['c1', '', 'Tâche', '⚪ Non démarré', 7.5, '']] });
      assert.deepEqual(out.cellWrites, [{ row: 2, col: 3, value: 'Renommée' }]);
    });

    it('creates a card for a row without id, in the list matching its Statut', () => {
      const out = run({ cards: [], rows: [['', 'Cat', 'Nouvelle', 'doing', '', 'note']] });
      assert.equal(out.trelloCreates.length, 1);
      assert.equal(out.trelloCreates[0].listId, 'l2');
      assert.equal(out.trelloCreates[0].desc, 'note');
      assert.ok(out.cellWrites.some((w) => w.col === 4 && w.value === '▶️ En cours'));
    });

    it('ignores blank rows and drops rows of archived cards', () => {
      const out = run({ cards: [], rows: [['', '', '', '', '', ''], ['gone', '', 'x', '', '', '']] });
      assert.equal(out.trelloCreates.length, 0);
      assert.deepEqual(out.deleteRows, [3]);
    });

    it('keeps the first of duplicated ids', () => {
      const state = { c1: { name: 'Tâche', desc: '', statut: '⚪ Non démarré', category: '' } };
      const out = run({
        cards: [card()],
        state,
        rows: [['c1', '', 'Tâche', '⚪ Non démarré', '', ''], ['c1', '', 'Autre', '⚪ Non démarré', '', '']],
      });
      assert.equal(out.trelloUpdates.length, 0);
    });

    it('preserves the hidden description metadata on write-back', () => {
      const full = 'Vieux\n\n<!-- cerveau-meta {"a":1} -->';
      const state = { c1: { name: 'Tâche', desc: 'Vieux', statut: '⚪ Non démarré', category: '' } };
      const out = run({ cards: [card({ desc: full })], state, rows: [['c1', '', 'Tâche', '⚪ Non démarré', '', 'Neuf']] });
      assert.equal(out.trelloUpdates[0].fields.desc, 'Neuf\n\n<!-- cerveau-meta {"a":1} -->');
    });
  });
});
