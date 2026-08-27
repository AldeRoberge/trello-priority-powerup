/**
 * Config.gs — tab layout, Script Properties, and the tiny key/value _Config tab.
 *
 * Nothing secret lives in the spreadsheet itself. The Trello API key/token and
 * the setup token (the bearer secret Cerveau uses to push config) live in
 * PropertiesService, which is per-script and never rendered in any cell.
 */

var TASKS_TAB = 'Tasks';
var STATE_TAB = '_SyncState';
var CONFIG_TAB = '_Config';
var LOG_TAB = '_SyncLog';

// Fixed columns on the Tasks tab. Column A is hidden (the join key). Which of
// B..G are actually read/written is controlled by the syncFields config below
// — disabled columns are simply left alone, never cleared.
var COL = {
  ID: 1, // A — TrelloCardId (hidden)
  CATEGORY: 2, // B — Catégorie (custom field)
  NAME: 3, // C — Objet (card.name)
  DESC: 4, // D — Description (card.desc, visible part only)
  STATUT: 5, // E — Statut (derived from list, category label ± emoji)
  PRIORITY: 6, // F — Priorité (read-only, Trello → Sheet)
  PROGRESS: 7, // G — Progrès (read-only, Trello → Sheet)
};

var HEADERS = ['TrelloCardId', 'Catégorie', 'Objet', 'Description', 'Statut', 'Priorité', 'Progrès'];

// Baseline snapshot per card (the 3-way-merge reference point) + when it was
// last touched. No "writing" lock needed: Apps Script edits made via the
// Spreadsheet service don't re-fire the script's own installable onEdit
// trigger, and even if they did, the merge is idempotent — once a field's
// baseline matches both sides there's nothing left to push either way.
var STATE_COLS = [
  'TrelloCardId',
  'baseline_category',
  'baseline_name',
  'baseline_desc',
  'baseline_statut',
  'lastSyncedAt',
];

var DEFAULT_SYNC_FIELDS = ['category', 'name', 'desc', 'statut', 'priority', 'progress'];

function getProp(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setProp(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

/** Trello key/token + setup token, entered once by hand — see docs/google-sheets-sync.md. */
function getSecrets() {
  return {
    appKey: getProp('TRELLO_APP_KEY'),
    token: getProp('TRELLO_TOKEN'),
    setupToken: getProp('SETUP_TOKEN'),
    boardId: getProp('TRELLO_BOARD_ID'),
  };
}

function requireSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Missing tab "' + name + '" — run setupTemplate() first.');
  return sheet;
}

/** Reads the syncFields list Cerveau last pushed. Falls back to "everything on". */
function getSyncFields() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_TAB);
  if (!sheet) return DEFAULT_SYNC_FIELDS.slice();
  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === 'syncFields') {
      var raw = String(values[i][1] || '').trim();
      if (!raw) return DEFAULT_SYNC_FIELDS.slice();
      return raw.split(',').map(function (s) {
        return s.trim();
      }).filter(Boolean);
    }
  }
  return DEFAULT_SYNC_FIELDS.slice();
}

function fieldEnabled(key) {
  return getSyncFields().indexOf(key) !== -1;
}

/** Writes config pushed from Cerveau's settings page into the _Config tab. */
function writeConfig(config) {
  var sheet = requireSheet(CONFIG_TAB);
  var rows = [
    ['boardId', config.boardId || ''],
    ['syncFields', (config.syncFields || DEFAULT_SYNC_FIELDS).join(',')],
    ['updatedAt', new Date().toISOString()],
  ];
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  if (config.boardId) setProp('TRELLO_BOARD_ID', config.boardId);
}

function appendLog(cardId, field, trelloValue, sheetValue, note) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_TAB);
  if (!sheet) return;
  sheet.appendRow([
    new Date().toISOString(),
    cardId || '',
    field || '',
    trelloValue == null ? '' : String(trelloValue),
    sheetValue == null ? '' : String(sheetValue),
    note || '',
  ]);
}
