/**
 * Code.gs — entry points + the sync orchestration.
 *
 * One-time setup (see docs/google-sheets-sync.md):
 *   1. Paste these 4 files (+ appsscript.json) into Extensions > Apps Script
 *      on a blank spreadsheet.
 *   2. Run setupTemplate() once from the editor (creates the tabs + a
 *      SETUP_TOKEN, printed to the execution log).
 *   3. Fill in TRELLO_APP_KEY / TRELLO_TOKEN via setTrelloCredentials(...)
 *      (see the doc — do NOT hardcode them in a cell).
 *   4. Deploy > New deployment > Web app (execute as me, anyone can access).
 *   5. Paste the /exec URL + the SETUP_TOKEN into Cerveau's Google Sheets
 *      settings panel (Gantt > "Google Sheets").
 *
 * Everything from here on runs unattended:
 *   - doPost(e)            <- Trello webhook (card changed) or Cerveau config push
 *   - onEditInstallable(e) <- user (or the Sheets API) edits the Tasks tab
 */

/* ── One-time setup helpers ──────────────────────────────────────────── */

function setupTemplate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTab_(ss, TASKS_TAB, HEADERS);
  ensureTab_(ss, STATE_TAB, STATE_COLS);
  ensureTab_(ss, CONFIG_TAB, ['key', 'value']);
  ensureTab_(ss, LOG_TAB, ['timestamp', 'cardId', 'field', 'trelloValue', 'sheetValue(discarded)', 'note']);

  ss.getSheetByName(TASKS_TAB).hideColumns(COL.ID);
  [STATE_TAB, CONFIG_TAB, LOG_TAB].forEach(function (name) {
    ss.getSheetByName(name).hideSheet();
  });

  if (!getProp('SETUP_TOKEN')) {
    setProp('SETUP_TOKEN', Utilities.getUuid());
  }
  installTriggers();

  Logger.log('Setup done. SETUP_TOKEN = ' + getProp('SETUP_TOKEN'));
  Logger.log('Now call setTrelloCredentials("<appKey>", "<token>") from the editor (Run > select function), then deploy as a Web App.');
}

function ensureTab_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Run once from the editor with your own values filled in, then delete the args from history. */
function setTrelloCredentials(appKey, token) {
  setProp('TRELLO_APP_KEY', appKey);
  setProp('TRELLO_TOKEN', token);
  Logger.log('Trello credentials stored in Script Properties.');
}

function installTriggers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ScriptApp.getProjectTriggers();
  var hasEdit = existing.some(function (t) {
    return t.getHandlerFunction() === 'onEditInstallable';
  });
  if (!hasEdit) {
    ScriptApp.newTrigger('onEditInstallable').forSpreadsheet(ss).onEdit().create();
  }
}

/* ── Web app entry points ────────────────────────────────────────────── */

function doGet(e) {
  return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var raw = e && e.postData ? e.postData.contents : '';
    var body = raw ? JSON.parse(raw) : {};

    if (body.setupToken !== undefined) {
      return handleConfigPush_(body);
    }
    return handleTrelloWebhook_(body);
  } catch (err) {
    Logger.log('doPost error: ' + err);
    // Always 200 — a non-2xx response makes Trello disable the webhook.
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function handleConfigPush_(body) {
  var secrets = getSecrets();
  if (!secrets.setupToken || body.setupToken !== secrets.setupToken) {
    return jsonOut_({ ok: false, error: 'bad setupToken' });
  }
  writeConfig(body.config || {});
  return jsonOut_({ ok: true });
}

function handleTrelloWebhook_(body) {
  var action = body.action;
  if (!action || !action.data) return jsonOut_({ ok: true, ignored: true });

  var cardId = action.data.card && action.data.card.id;
  if (cardId) {
    syncFromTrelloCard(cardId);
    return jsonOut_({ ok: true });
  }
  return jsonOut_({ ok: true, ignored: true });
}

function jsonOut_(obj) {
  // text/plain on purpose: avoids Apps Script's JSON-content-type CORS
  // preflight quirk. Cerveau's fetch() call parses the body as JSON anyway.
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.TEXT);
}

/* ── onEdit (Sheet → Trello direction) ───────────────────────────────── */

function onEditInstallable(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== TASKS_TAB) return;
  var row = e.range.getRow();
  if (row === 1) return; // header
  try {
    syncFromSheetRow(row);
  } catch (err) {
    Logger.log('onEditInstallable row ' + row + ' failed: ' + err);
  }
}

/* ── Core sync ────────────────────────────────────────────────────────── */

function findRowByCardId_(sheet, cardId) {
  var ids = sheet.getRange(2, COL.ID, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(cardId)) return i + 2;
  }
  return -1;
}

function readStateRow_(cardId) {
  var sheet = requireSheet(STATE_TAB);
  var row = findRowByCardId_(sheet, cardId);
  if (row === -1) {
    return { row: -1, baseline_category: '', baseline_name: '', baseline_desc: '', baseline_statut: '' };
  }
  var values = sheet.getRange(row, 1, 1, STATE_COLS.length).getValues()[0];
  return {
    row: row,
    baseline_category: values[1],
    baseline_name: values[2],
    baseline_desc: values[3],
    baseline_statut: values[4],
  };
}

function writeStateRow_(cardId, state) {
  var sheet = requireSheet(STATE_TAB);
  var row = state.row;
  var values = [cardId, state.baseline_category, state.baseline_name, state.baseline_desc, state.baseline_statut, new Date().toISOString()];
  if (row === -1) {
    sheet.appendRow(values);
  } else {
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
  }
}

/**
 * 3-way merge for one field. Trello wins on a genuine conflict (both sides
 * changed since the last sync, to different values) — same rule Cerveau's
 * Outlook sync already uses.
 */
function mergeField_(cardId, field, baseline, trelloVal, sheetVal) {
  var t = trelloVal == null ? '' : String(trelloVal);
  var s = sheetVal == null ? '' : String(sheetVal);
  var b = baseline == null ? '' : String(baseline);

  var trelloChanged = t !== b;
  var sheetChanged = s !== b;

  if (!trelloChanged && !sheetChanged) return { next: b, writeSheet: false, writeTrello: false };
  if (trelloChanged && !sheetChanged) return { next: t, writeSheet: true, writeTrello: false };
  if (!trelloChanged && sheetChanged) return { next: s, writeSheet: false, writeTrello: true };
  if (t === s) return { next: t, writeSheet: false, writeTrello: false };

  appendLog(cardId, field, t, s, 'conflict — Trello value kept');
  return { next: t, writeSheet: true, writeTrello: false };
}

/** Trello → Sheet direction, entry point from the webhook. */
function syncFromTrelloCard(cardId) {
  var card = getCard(cardId);
  applyMerge_(cardId, card);
}

/** Sheet → Trello direction, entry point from onEdit. New rows create a card. */
function syncFromSheetRow(rowIndex) {
  var sheet = requireSheet(TASKS_TAB);
  var row = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
  var cardId = row[COL.ID - 1];
  var name = row[COL.NAME - 1];

  if (!cardId && name) {
    createCardFromRow_(rowIndex, row);
    return;
  }
  if (!cardId) return; // blank row, nothing to do

  var card = getCard(cardId);
  applyMerge_(cardId, card, rowIndex);
}

function createCardFromRow_(rowIndex, row) {
  var secrets = getSecrets();
  if (!secrets.boardId) throw new Error('No board configured yet — save settings in Cerveau first.');
  var lists = getBoardLists(secrets.boardId);
  var statutValue = fieldEnabled('statut') ? row[COL.STATUT - 1] : '';
  var targetList = (statutValue && findListForStatutValue(secrets.boardId, statutValue)) || lists[0];
  if (!targetList) throw new Error('Board has no lists to create a card into.');

  var desc = fieldEnabled('desc') ? row[COL.DESC - 1] : '';
  var card = createCard(targetList.id, row[COL.NAME - 1], desc);

  var sheet = requireSheet(TASKS_TAB);
  sheet.getRange(rowIndex, COL.ID).setValue(card.id);

  if (fieldEnabled('category') && row[COL.CATEGORY - 1]) {
    var field = getOrCreateCategoryField(secrets.boardId);
    writeCategoryValue(card.id, field.id, row[COL.CATEGORY - 1]);
  }

  writeStateRow_(card.id, {
    row: -1,
    baseline_category: fieldEnabled('category') ? row[COL.CATEGORY - 1] : '',
    baseline_name: row[COL.NAME - 1],
    baseline_desc: desc,
    baseline_statut: statutLabelForList(targetList.name),
  });
}

/**
 * Runs the merge for every enabled bidirectional field on one card, applying
 * whichever side needs writing. `knownRow` avoids a second sheet scan when
 * the caller already knows it (the onEdit path).
 */
function applyMerge_(cardId, card, knownRow) {
  var sheet = requireSheet(TASKS_TAB);
  var row = knownRow || findRowByCardId_(sheet, cardId);
  if (row === -1) {
    appendSheetRowForCard_(sheet, card);
    return;
  }

  var state = readStateRow_(cardId);
  var rowValues = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  var secrets = getSecrets();

  var descSplit = splitDescMeta(card.desc);
  var listName = '';
  try {
    var lists = getBoardLists(card.idBoard);
    var match = lists.filter(function (l) {
      return l.id === card.idList;
    })[0];
    listName = match ? match.name : '';
  } catch (e) {
    /* board fetch failed — skip statut this pass */
  }

  var categoryFieldId = null;
  if (fieldEnabled('category')) {
    categoryFieldId = getOrCreateCategoryField(card.idBoard).id;
  }

  var writes = { name: false, desc: false, statut: false, category: false };
  var nextState = {
    row: state.row,
    baseline_category: state.baseline_category,
    baseline_name: state.baseline_name,
    baseline_desc: state.baseline_desc,
    baseline_statut: state.baseline_statut,
  };
  var newRowValues = rowValues.slice();

  if (fieldEnabled('name')) {
    var m = mergeField_(cardId, 'name', state.baseline_name, card.name, rowValues[COL.NAME - 1]);
    nextState.baseline_name = m.next;
    if (m.writeSheet) newRowValues[COL.NAME - 1] = m.next;
    if (m.writeTrello) writes.name = m.next;
  }

  if (fieldEnabled('desc')) {
    var m2 = mergeField_(cardId, 'desc', state.baseline_desc, descSplit.visible, rowValues[COL.DESC - 1]);
    nextState.baseline_desc = m2.next;
    if (m2.writeSheet) newRowValues[COL.DESC - 1] = m2.next;
    if (m2.writeTrello) writes.desc = joinDescMeta(m2.next, descSplit.hiddenBlock);
  }

  if (fieldEnabled('statut') && listName) {
    var trelloStatut = statutLabelForList(listName);
    var m3 = mergeField_(cardId, 'statut', state.baseline_statut, trelloStatut, rowValues[COL.STATUT - 1]);
    nextState.baseline_statut = m3.next;
    if (m3.writeSheet) newRowValues[COL.STATUT - 1] = m3.next;
    if (m3.writeTrello) writes.statut = m3.next;
  }

  if (fieldEnabled('category') && categoryFieldId) {
    var trelloCategory = readCategoryValue(card, categoryFieldId);
    var m4 = mergeField_(cardId, 'category', state.baseline_category, trelloCategory, rowValues[COL.CATEGORY - 1]);
    nextState.baseline_category = m4.next;
    if (m4.writeSheet) newRowValues[COL.CATEGORY - 1] = m4.next;
    if (m4.writeTrello) writes.category = m4.next;
  }

  // Read-only columns (Trello -> Sheet only, see Trello.gs header comment).
  if (fieldEnabled('progress')) newRowValues[COL.PROGRESS - 1] = computeProgressPercent(card);
  if (fieldEnabled('priority')) newRowValues[COL.PRIORITY - 1] = readPriorityDisplay(card);

  sheet.getRange(row, 1, 1, HEADERS.length).setValues([newRowValues]);

  var trelloPatch = {};
  if (writes.name !== false) trelloPatch.name = writes.name;
  if (writes.desc !== false) trelloPatch.desc = writes.desc;
  if (writes.statut !== false) {
    var targetList = findListForStatutValue(secrets.boardId || card.idBoard, writes.statut);
    if (targetList) trelloPatch.idList = targetList.id;
  }
  if (Object.keys(trelloPatch).length) updateCard(cardId, trelloPatch);
  if (writes.category !== false) writeCategoryValue(cardId, categoryFieldId, writes.category);

  writeStateRow_(cardId, nextState);
}

function appendSheetRowForCard_(sheet, card) {
  var secrets = getSecrets();
  var listName = '';
  try {
    var lists = getBoardLists(card.idBoard);
    var match = lists.filter(function (l) {
      return l.id === card.idList;
    })[0];
    listName = match ? match.name : '';
  } catch (e) {
    /* ignore */
  }

  var descSplit = splitDescMeta(card.desc);
  var category = '';
  if (fieldEnabled('category')) {
    var field = getOrCreateCategoryField(card.idBoard);
    category = readCategoryValue(card, field.id);
  }
  var statut = fieldEnabled('statut') && listName ? statutLabelForList(listName) : '';

  var rowValues = [
    card.id,
    fieldEnabled('category') ? category : '',
    fieldEnabled('name') ? card.name : '',
    fieldEnabled('desc') ? descSplit.visible : '',
    statut,
    fieldEnabled('priority') ? readPriorityDisplay(card) : '',
    fieldEnabled('progress') ? computeProgressPercent(card) : '',
  ];
  sheet.appendRow(rowValues);

  writeStateRow_(card.id, {
    row: -1,
    baseline_category: rowValues[COL.CATEGORY - 1],
    baseline_name: rowValues[COL.NAME - 1],
    baseline_desc: rowValues[COL.DESC - 1],
    baseline_statut: statut,
  });
}

/** Manual full re-sync — run from the editor if the Sheet and Trello drift apart. */
function syncAllCards() {
  var secrets = getSecrets();
  if (!secrets.boardId) throw new Error('No board configured — save settings in Cerveau first.');
  var cards = listCardsOnBoard(secrets.boardId);
  cards.forEach(function (card) {
    try {
      applyMerge_(card.id, card);
    } catch (err) {
      Logger.log('syncAllCards: card ' + card.id + ' failed: ' + err);
    }
  });
}
