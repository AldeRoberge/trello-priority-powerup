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
  let integrity;
  let journal;
  let webhook;

  before(async () => {
    plan = await load('plan.js');
    columns = await load('columns.js');
    statut = await load('statut.js');
    descMeta = await load('descMeta.js');
    integrity = await load('integrity.js');
    journal = await load('journal.js');
    webhook = await load('webhook.js');
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
      assert.equal(out.logs[0].code, 'STATUT_REVERTED');
      assert.equal(out.logs[0].level, 'WARNING');
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

  describe('planSync: logs, activities and read-only protection', () => {
    const run = (o) => plan.planSync({ keys, lists, state: {}, timeZone: 'America/Toronto', sheetUser: 'Alex (a@x.ca)', ...o });
    const state = { c1: { name: 'Tâche', desc: '', statut: '⚪ Non démarré', category: '', due: '', link: 'https://trello.com/c/x' } };

    it('records who made a Sheet edit as an activity and an INFO log', () => {
      const out = run({ cards: [card()], state, rows: [['c1', '', 'Renommée', '⚪ Non démarré', '', '']] });
      assert.equal(out.activities.length, 1);
      assert.deepEqual(
        { u: out.activities[0].user, o: out.activities[0].origin, f: out.activities[0].field, b: out.activities[0].before, a: out.activities[0].after },
        { u: 'Alex (a@x.ca)', o: 'Google Sheets', f: 'Objet', b: 'Tâche', a: 'Renommée' },
      );
      assert.equal(out.logs.find((l) => l.code === 'SHEET_EDIT').level, 'INFO');
    });

    it('logs an overwritten Sheet change as a WARNING with both values', () => {
      const out = run({ cards: [card({ name: 'Trello' })], state, rows: [['c1', '', 'Sheet', '⚪ Non démarré', '', '']] });
      const c = out.logs.find((l) => l.code === 'CONFLICT');
      assert.equal(c.level, 'WARNING');
      assert.match(c.message, /Sheet/);
      assert.match(c.message, /Trello/);
      assert.equal(out.activities.length, 0);
    });

    it('restores an emptied title', () => {
      const out = run({ cards: [card()], state, rows: [['c1', '', '', '⚪ Non démarré', '', '']] });
      assert.equal(out.trelloUpdates.length, 0);
      assert.ok(out.logs.some((l) => l.code === 'NAME_EMPTY'));
      assert.ok(out.cellWrites.some((w) => w.col === 3 && w.value === 'Tâche'));
    });

    it('reverts an edit in a read-only Trello column (Carte) and warns', () => {
      const k = ['name', 'link'];
      const out = plan.planSync({ keys: k, lists, cards: [card()], state, timeZone: 'UTC', rows: [['c1', 'Tâche', 'https://evil.example']] });
      assert.ok(out.cellWrites.some((w) => w.col === 3 && w.value === 'https://trello.com/c/x'));
      assert.equal(out.logs.find((l) => l.code === 'READONLY_REVERTED').level, 'WARNING');
    });

    it('does not warn when Trello itself changed a read-only column', () => {
      const k = ['name', 'link'];
      const out = plan.planSync({ keys: k, lists, cards: [card({ shortUrl: 'https://trello.com/c/new' })], state, timeZone: 'UTC', rows: [['c1', 'Tâche', 'https://trello.com/c/x']] });
      assert.equal(out.logs.filter((l) => l.code === 'READONLY_REVERTED').length, 0);
      assert.ok(out.cellWrites.some((w) => w.value === 'https://trello.com/c/new'));
    });

    it('restores a computed (pushed) column that someone typed over', () => {
      const k = ['name', 'priority'];
      const st = { c1: { ...state.c1, pushed: { priority: 7.9 } } };
      const out = plan.planSync({ keys: k, lists, cards: [card()], state: st, timeZone: 'UTC', rows: [['c1', 'Tâche', 1]] });
      assert.ok(out.cellWrites.some((w) => w.col === 3 && w.value === 7.9));
      assert.ok(out.logs.some((l) => l.code === 'READONLY_REVERTED'));
    });

    it('flags rows whose id is unknown vs. cards archived in Trello', () => {
      const out = run({ cards: [], state: { old: {} }, rows: [['old', '', 'A', '', '', ''], ['typed-by-hand', '', 'B', '', '', '']] });
      assert.deepEqual(out.deleteRows, [2, 3]);
      assert.equal(out.logs.find((l) => l.code === 'UNKNOWN_ID').level, 'WARNING');
      assert.equal(out.logs.find((l) => l.code === 'ROW_REMOVED').level, 'DEBUG');
    });
  });

  describe('integrity (header tampering)', () => {
    const layout = ['TrelloCardId', 'Catégorie', 'Objet', 'Statut', 'Priorité'];

    it('accepts an untouched header', () => {
      const r = integrity.checkHeader(layout.slice(), layout, layout);
      assert.equal(r.tampered, false);
      assert.equal(r.relayout, false);
    });

    it('treats a configured column change as legitimate, not tampering', () => {
      const r = integrity.checkHeader(layout.slice(), layout, ['TrelloCardId', 'Objet']);
      assert.equal(r.tampered, false);
      assert.equal(r.relayout, true);
    });

    it('detects a renamed column and maps its data back by position', () => {
      const actual = ['TrelloCardId', 'Catégorie', 'Titre !!', 'Statut', 'Priorité'];
      const r = integrity.checkHeader(actual, layout, layout);
      assert.equal(r.tampered, true);
      assert.deepEqual(r.changes[0], { type: 'renamed', position: 2, from: 'Objet', to: 'Titre !!' });
      assert.deepEqual(r.keys, ['category', 'name', 'statut', 'priority']);
      assert.match(integrity.describeChange(r.changes[0]), /renommée/);
    });

    it('detects moved columns and keeps each column data', () => {
      const actual = ['TrelloCardId', 'Objet', 'Catégorie', 'Statut', 'Priorité'];
      const r = integrity.checkHeader(actual, layout, layout);
      assert.equal(r.tampered, true);
      assert.equal(r.changes[0].type, 'moved');
      assert.deepEqual(r.keys, ['name', 'category', 'statut', 'priority']);
    });

    it('detects a deleted column', () => {
      const actual = ['TrelloCardId', 'Catégorie', 'Statut', 'Priorité'];
      const r = integrity.checkHeader(actual, layout, layout);
      assert.equal(r.tampered, true);
      assert.ok(r.changes.some((c) => c.type === 'removed'));
      assert.deepEqual(r.keys, ['category', 'statut', 'priority']);
    });

    it('an inserted column does not steal its neighbour key', () => {
      const actual = ['TrelloCardId', 'Catégorie', 'Ma colonne', 'Objet', 'Statut', 'Priorité'];
      const r = integrity.checkHeader(actual, layout, layout);
      assert.equal(r.tampered, true);
      assert.deepEqual(r.keys, ['category', null, 'name', 'statut', 'priority']);
    });

    it('flags a change of the key column as an id change', () => {
      const r = integrity.checkHeader(['Id', 'Catégorie', 'Objet', 'Statut', 'Priorité'], layout, layout);
      assert.equal(r.changes[0].type, 'id');
    });

    it('does not call the first run tampering', () => {
      const r = integrity.checkHeader([], null, layout);
      assert.equal(r.tampered, false);
      assert.equal(r.relayout, true);
    });
  });

  describe('journal', () => {
    it('filters by level and keeps order', () => {
      const j = journal.createJournal({ level: 'WARNING' });
      j.log('DEBUG', 'A', 'no');
      j.log('INFO', 'B', 'no');
      j.log('WARNING', 'C', 'yes');
      j.log('CRITICAL', 'D', 'yes');
      assert.deepEqual(j.logs.map((l) => l.code), ['C', 'D']);
      assert.equal(j.hasCritical(), true);
      assert.equal(j.wants('INFO'), false);
      assert.equal(j.wants('ERROR'), true);
    });

    it('parses levels defensively', () => {
      assert.equal(journal.parseLevel('debug'), 'DEBUG');
      assert.equal(journal.parseLevel('nope'), 'INFO');
      assert.equal(journal.LEVELS.CRITICAL > journal.LEVELS.ERROR, true);
    });

    it('formats rows with the board timezone and clips long text', () => {
      const row = journal.logRow({ at: new Date('2026-09-29T18:03:07Z'), level: 'INFO', code: 'X', message: 'm'.repeat(900), card: 'c' }, 'America/Toronto');
      assert.equal(row[0], '2026-09-29 14:03:07');
      assert.ok(row[3].length <= 500);
      assert.equal(row.length, journal.LOG_HEADERS.length);
      assert.equal(journal.activityRow({ at: new Date(), user: 'u' }, 'UTC').length, journal.ACTIVITY_HEADERS.length);
    });
  });

  describe('webhook -> activities', () => {
    const base = { id: 'a1', date: '2026-09-29T18:00:00Z', memberCreator: { fullName: 'Marie Tremblay', username: 'marie' } };

    it('describes a rename with before/after and the author', () => {
      const { activities, cardId } = webhook.describeAction({ action: { ...base, type: 'updateCard', data: { card: { id: 'c1', name: 'Nouveau' }, old: { name: 'Ancien' } } } });
      assert.equal(cardId, 'c1');
      assert.deepEqual(
        { u: activities[0].user, a: activities[0].action, f: activities[0].field, b: activities[0].before, af: activities[0].after, r: activities[0].ref },
        { u: 'Marie Tremblay', a: 'modifiée', f: 'Objet', b: 'Ancien', af: 'Nouveau', r: 'a1' },
      );
    });

    it('describes a move between lists and several changes in one action', () => {
      const { activities } = webhook.describeAction({
        action: { ...base, type: 'updateCard', data: { card: { id: 'c1', name: 'X' }, old: { idList: 'l1', name: 'Y' }, listBefore: { name: 'À faire' }, listAfter: { name: 'En cours' } } },
      });
      assert.equal(activities.length, 2);
      const move = activities.find((a) => a.fieldKey === 'statut');
      assert.deepEqual([move.action, move.before, move.after], ['déplacée', 'À faire', 'En cours']);
    });

    it('covers archive, comment and creation, and ignores list-level actions', () => {
      const d = (type, data) => webhook.describeAction({ action: { ...base, type, data } }).activities;
      assert.equal(d('updateCard', { card: { id: 'c', closed: true }, old: { closed: false } })[0].action, 'archivée');
      assert.equal(d('commentCard', { card: { id: 'c' }, text: 'Salut' })[0].after, 'Salut');
      assert.equal(d('createCard', { card: { id: 'c', name: 'N' }, list: { name: 'À faire' } })[0].action, 'créée');
      assert.deepEqual(d('updateList', { list: { id: 'l' } }), []);
    });

    it('ignores the cards of the Entities view (archived "🧩 Name" cards)', () => {
      const save = { ...base, type: 'updateCard', data: { card: { id: 'e1', name: '🧩 Ficus' }, old: { desc: 'avant' } } };
      assert.equal(webhook.isEntityAction({ action: save }), true);
      assert.equal(webhook.isDocumentAction({ action: save }), false);
      assert.deepEqual(webhook.describeAction({ action: save }), { activities: [], cardId: null });
      assert.equal(webhook.isEntityAction({ action: { ...base, type: 'updateCard', data: { card: { id: 'c1', name: 'Tâche' } } } }), false);
      assert.equal(webhook.isEntityAction(null), false);
    });

    it('ignores the cards of the Document view (archived "📄 Title" cards that autosave)', () => {
      const save = { ...base, type: 'updateCard', data: { card: { id: 'd1', name: '📄 Plan de projet' }, old: { desc: 'avant' } } };
      assert.equal(webhook.isDocumentAction({ action: save }), true);
      assert.deepEqual(webhook.describeAction({ action: save }), { activities: [], cardId: null });
      for (const type of ['createCard', 'updateCard', 'commentCard', 'deleteCard']) {
        assert.equal(webhook.describeAction({ action: { ...base, type, data: { card: { id: 'd1', name: '📄 X' }, old: { closed: false } } } }).activities.length, 0, type);
      }
      // a normal task is still described, and so are list-level actions without a card
      assert.equal(webhook.isDocumentAction({ action: { ...base, type: 'updateCard', data: { card: { id: 'c1', name: 'Tâche' } } } }), false);
      assert.equal(webhook.isDocumentAction({ action: { ...base, type: 'updateList', data: { list: { id: 'l' } } } }), false);
      assert.equal(webhook.isDocumentAction(null), false);
      assert.equal(webhook.describeAction({ action: { ...base, type: 'updateCard', data: { card: { id: 'c1', name: 'Tâche' }, old: { name: 'Avant' } } } }).activities.length, 1);
    });

    it('recognizes the echo of a Worker write, on the same card and field only', () => {
      const now = 1_000_000;
      const recent = [{ cardId: 'c1', field: 'name', at: now - 10_000 }];
      assert.equal(webhook.isEcho({ cardId: 'c1', fieldKey: 'name' }, recent, now), true);
      assert.equal(webhook.isEcho({ cardId: 'c1', fieldKey: 'desc' }, recent, now), false);
      assert.equal(webhook.isEcho({ cardId: 'c2', fieldKey: 'name' }, recent, now), false);
      assert.equal(webhook.isEcho({ cardId: 'c1', fieldKey: 'name' }, recent, now + 200_000), false);
      assert.equal(webhook.isEcho({ cardId: 'c9', fieldKey: 'due' }, [{ cardId: 'c9', field: '*', at: now }], now), true);
    });
  });
});
