/*
 * Role: Trello I/O for the Table view. Trello is the source of truth: every cell edit is written
 * straight to Trello (REST via the Power-Up token), then mirrored to the Google Sheet by the
 * Worker webhook (native fields) and by pushToSheet() (computed columns).
 * Reuses GanttTrello.loadBoard for records (score, progress, list...) and
 * PriorityTrello.restPutCard / createCard for writes.
 */
(function (global) {
  'use strict';

  var TABLE_KEY = 'tableSettings';

  function GT() {
    return global.GanttTrello;
  }
  function PT() {
    return global.PriorityTrello;
  }
  function ST() {
    return global.SheetsTrello;
  }
  function TM() {
    return global.TableModel;
  }

  async function getTableSettings(t) {
    var raw = await t.get('board', 'shared', TABLE_KEY);
    var cols = raw && raw.columns;
    // Once connected, the Sheet's column set is the shared source (kept in googleSheetsSettings).
    var sheet = ST() ? await ST().getSettings(t) : null;
    return {
      columns: TM().normalizeColumns(cols && cols.length ? cols : sheet && sheet.columns),
    };
  }

  async function saveColumns(t, columns) {
    var cols = TM().normalizeColumns(columns);
    await t.set('board', 'shared', TABLE_KEY, { columns: cols });
    var sheet = await ST().getSettings(t);
    sheet.columns = cols;
    await ST().saveSettings(t, sheet);
    return cols;
  }

  /** Catégorie custom field values by card id (empty map when Custom Fields is unavailable). */
  async function loadCategories(t) {
    var out = { map: Object.create(null), fieldId: null, available: false };
    var boardId = await t.board('id').then(function (b) {
      return b.id;
    });
    var fields = await ST().trelloRest(t, '/boards/' + boardId + '/customFields');
    if (!fields.ok) return out;
    var field = (fields.data || []).filter(function (f) {
      return f.name === 'Catégorie' && f.type === 'text';
    })[0];
    if (!field) return out;
    out.fieldId = field.id;
    out.available = true;
    var cards = await ST().trelloRest(t, '/boards/' + boardId + '/cards?filter=open&fields=id&customFieldItems=true');
    if (cards.ok) {
      (cards.data || []).forEach(function (c) {
        var item = (c.customFieldItems || []).filter(function (i) {
          return i.idCustomField === field.id;
        })[0];
        if (item && item.value && item.value.text) out.map[c.id] = item.value.text;
      });
    }
    return out;
  }

  /** Everything the grid needs: rows (board order), lists, category field info. */
  async function load(t) {
    var board = await GT().loadBoard(t);
    var cats = await loadCategories(t).catch(function () {
      return { map: Object.create(null), fieldId: null, available: false };
    });
    var rows = board.cards.map(function (rec) {
      return TM().rowFromRecord(rec, cats.map[rec.id]);
    });
    return {
      lists: TM().enrichLists(board.lists, board.settings, global.StatutMatch),
      rows: TM().orderByLists(rows, board.lists),
      categoryFieldId: cats.fieldId,
      categoryAvailable: cats.available,
    };
  }

  function need(res) {
    if (res && res.ok === false) {
      var err = new Error(res.reason || 'trello-write-failed');
      err.reason = res.reason;
      throw err;
    }
    return res;
  }

  async function ensureAuth(t) {
    var res = await GT().ensureRestAuthorized(t);
    if (!res.ok) {
      var err = new Error(res.reason || 'not-authorized');
      err.reason = res.reason || 'not-authorized';
      throw err;
    }
  }

  async function saveName(t, id, name) {
    await ensureAuth(t);
    need(await PT().restPutCard(t, id, { name: name }));
  }

  /** `row.fullDesc` still holds the hidden Cerveau metadata; only the visible text is replaced. */
  async function saveDesc(t, row, visible) {
    await ensureAuth(t);
    var dm = global.DescMeta;
    var meta = dm && typeof dm.splitDesc === 'function' ? dm.splitDesc(row.fullDesc).meta : {};
    var full = dm && typeof dm.joinDesc === 'function' ? dm.joinDesc(visible, meta) : visible;
    need(await PT().restPutCard(t, row.id, { desc: full }));
    return full;
  }

  async function moveCard(t, id, listId, pos) {
    await ensureAuth(t);
    var body = { idList: listId };
    if (pos != null) body.pos = pos;
    need(await PT().restPutCard(t, id, body));
  }

  async function reorderCard(t, id, pos) {
    await ensureAuth(t);
    need(await PT().restPutCard(t, id, { pos: pos }));
  }

  async function saveCategory(t, cardId, fieldId, text) {
    await ensureAuth(t);
    var res = await ST().trelloRest(
      t,
      '/cards/' + cardId + '/customField/' + fieldId + '/item',
      'PUT',
      text ? { value: { text: text } } : { value: '' }
    );
    need(res);
  }

  async function createRow(t, name, listId) {
    await ensureAuth(t);
    var res = await PT().createCard(t, { name: name, idList: listId, pos: 'bottom' });
    return need(res);
  }

  async function archiveCard(t, id) {
    await ensureAuth(t);
    need(await PT().restPutCard(t, id, { closed: true }));
  }

  async function unarchiveCard(t, id) {
    await ensureAuth(t);
    need(await PT().restPutCard(t, id, { closed: false }));
  }

  async function pushToSheet(t, rows) {
    var settings = await ST().getSettings(t);
    if (!ST().isConnected(settings)) return { ok: false, reason: 'not-connected' };
    return ST().pushComputed(settings, TM().pushPayload(rows));
  }

  global.TableTrello = {
    getTableSettings: getTableSettings,
    saveColumns: saveColumns,
    load: load,
    saveName: saveName,
    saveDesc: saveDesc,
    moveCard: moveCard,
    reorderCard: reorderCard,
    saveCategory: saveCategory,
    createRow: createRow,
    archiveCard: archiveCard,
    unarchiveCard: unarchiveCard,
    pushToSheet: pushToSheet,
  };
})(typeof window !== 'undefined' ? window : this);
