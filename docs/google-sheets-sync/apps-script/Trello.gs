/**
 * Trello.gs — thin REST wrapper around the Trello API, plus the small ports
 * of Cerveau's client-side logic that this backend needs to replicate
 * (statut = list name category matching, hidden description metadata).
 *
 * Scope note: Priorité and Progrès sync **Trello → Sheet only** in v1.
 *   - Progrès = % of checked checklist items (native Trello data, safe to
 *     compute here).
 *   - Priorité = the raw "impact" input from Cerveau's priority plugin data
 *     (cardPriority.impact). Cerveau's actual on-screen priority score is a
 *     board-configurable weighted formula that only runs client-side inside
 *     the Power-Up; porting it here was out of scope for this pass (see
 *     docs/google-sheets-sync-plan.md, risk #1). Editing this column in the
 *     Sheet does not write back to Trello.
 */

var TRELLO_API = 'https://api.trello.com/1';

function trelloAuthQS_() {
  var s = getSecrets();
  if (!s.appKey || !s.token) {
    throw new Error('TRELLO_APP_KEY / TRELLO_TOKEN not set — see docs/google-sheets-sync.md step 3.');
  }
  return 'key=' + encodeURIComponent(s.appKey) + '&token=' + encodeURIComponent(s.token);
}

function trelloFetch_(path, method, bodyObj) {
  var sep = path.indexOf('?') === -1 ? '?' : '&';
  var url = TRELLO_API + path + sep + trelloAuthQS_();
  var options = {
    method: method || 'get',
    muteHttpExceptions: true,
    contentType: 'application/json',
  };
  if (bodyObj !== undefined) options.payload = JSON.stringify(bodyObj);
  var resp = UrlFetchApp.fetch(url, options);
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Trello API ' + method + ' ' + path + ' -> ' + code + ': ' + text);
  }
  return text ? JSON.parse(text) : null;
}

/** Full card fetch: native fields + checklists (for Progrès) + plugin data (for Priorité). */
function getCard(cardId) {
  var fields = 'name,desc,idList,idBoard,dateLastActivity';
  var path =
    '/cards/' +
    encodeURIComponent(cardId) +
    '?fields=' + fields +
    '&checklists=all&checkItem_fields=state&customFieldItems=true&pluginData=true';
  return trelloFetch_(path, 'get');
}

function listCardsOnBoard(boardId) {
  var fields = 'name,desc,idList,idBoard,dateLastActivity';
  var path =
    '/boards/' +
    encodeURIComponent(boardId) +
    '/cards?fields=' + fields +
    '&checklists=all&checkItem_fields=state&customFieldItems=true&pluginData=true';
  return trelloFetch_(path, 'get');
}

function updateCard(cardId, fieldsObj) {
  return trelloFetch_('/cards/' + encodeURIComponent(cardId), 'put', fieldsObj);
}

function createCard(listId, name, desc) {
  var path =
    '/cards?idList=' + encodeURIComponent(listId) +
    '&name=' + encodeURIComponent(name || '') +
    (desc ? '&desc=' + encodeURIComponent(desc) : '');
  return trelloFetch_(path, 'post');
}

function getBoardLists(boardId) {
  return trelloFetch_('/boards/' + encodeURIComponent(boardId) + '/lists?fields=name', 'get');
}

function registerWebhook(boardId, callbackUrl) {
  return trelloFetch_('/webhooks', 'post', {
    description: 'Cerveau Google Sheets sync',
    callbackURL: callbackUrl,
    idModel: boardId,
  });
}

/* ── Catégorie custom field ──────────────────────────────────────────── */

function getOrCreateCategoryField(boardId) {
  var fields = trelloFetch_('/boards/' + encodeURIComponent(boardId) + '/customFields', 'get');
  for (var i = 0; i < fields.length; i++) {
    if (fields[i].name === 'Catégorie') return fields[i];
  }
  return trelloFetch_('/customFields', 'post', {
    idModel: boardId,
    modelType: 'board',
    name: 'Catégorie',
    type: 'text',
    pos: 'bottom',
  });
}

function readCategoryValue(card, categoryFieldId) {
  var items = card.customFieldItems || [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].idCustomField === categoryFieldId) {
      return (items[i].value && items[i].value.text) || '';
    }
  }
  return '';
}

function writeCategoryValue(cardId, categoryFieldId, text) {
  // NOTE: unverified against a live board (no Trello access from the
  // environment that wrote this). Trello's own docs have used the singular
  // "/1/card/{id}/..." form for this specific endpoint in the past, unlike
  // every other endpoint in this file. If this 404s, try singular "card"
  // instead of "cards" here — see
  // https://developer.atlassian.com/cloud/trello/rest/api-group-custom-fields/
  var path = '/cards/' + encodeURIComponent(cardId) + '/customField/' + encodeURIComponent(categoryFieldId) + '/item';
  return trelloFetch_(path, 'put', { value: { text: String(text || '') } });
}

/* ── Progrès (checklist completion %) ────────────────────────────────── */

function computeProgressPercent(card) {
  var checklists = card.checklists || [];
  var total = 0;
  var done = 0;
  checklists.forEach(function (cl) {
    (cl.checkItems || []).forEach(function (item) {
      total++;
      if (item.state === 'complete') done++;
    });
  });
  if (!total) return '';
  return Math.round((done / total) * 100) + '%';
}

/* ── Priorité (read-only, best-effort — see file header) ────────────── */

function readPriorityDisplay(card) {
  var pluginData = card.pluginData || [];
  for (var i = 0; i < pluginData.length; i++) {
    if (pluginData[i].scope !== 'shared') continue;
    var value = pluginData[i].value;
    var parsed;
    try {
      parsed = typeof value === 'string' ? JSON.parse(value) : value;
    } catch (e) {
      continue;
    }
    if (parsed && typeof parsed === 'object' && parsed.cardPriority) {
      parsed = parsed.cardPriority;
    }
    if (parsed && typeof parsed === 'object' && typeof parsed.impact === 'number') {
      return parsed.impact;
    }
  }
  return '';
}

/* ── Description hidden metadata (mirrors Cerveau's descMeta split) ──── */

var DESC_META_MARK = /\n\n\[[a-zA-Z0-9_-]+\]:/;

function splitDescMeta(desc) {
  var text = String(desc || '');
  var match = text.match(DESC_META_MARK);
  if (!match) return { visible: text, hiddenBlock: '' };
  var idx = match.index;
  return { visible: text.slice(0, idx), hiddenBlock: text.slice(idx) };
}

function joinDescMeta(visible, hiddenBlock) {
  return String(visible || '') + String(hiddenBlock || '');
}

/* ── Statut ← list name (condensed port of components/statut/statut-match.js) ── */

var STATUT_CATEGORIES = [
  { key: 'triage', label: 'Triage', emoji: '📥', aliases: ['triage', 'a trier', 'inbox', 'incoming', 'nouveautes', 'new'] },
  { key: 'backlog', label: 'Backlog', emoji: '⏳', aliases: ['backlog', 'icebox', 'en attente', 'someday', 'later', 'ideas', 'idees'] },
  { key: 'unstarted', label: 'Non démarré', emoji: '⚪', aliases: ['unstarted', 'a faire', 'todo', 'to do', 'ready', 'next', 'up next', 'ouvert', 'open', 'pending'] },
  { key: 'started', label: 'En cours', emoji: '▶️', aliases: ['started', 'en cours', 'in progress', 'doing', 'wip', 'working', 'in review', 'review', 'qa', 'testing'] },
  { key: 'blocked', label: 'Bloqué', emoji: '🚫', aliases: ['blocked', 'bloque', 'on hold', 'en pause', 'paused', 'waiting', 'stuck'] },
  { key: 'completed', label: 'Terminé', emoji: '✅', aliases: ['completed', 'complete', 'termine', 'terminee', 'done', 'fini', 'finished', 'closed'] },
  { key: 'canceled', label: 'Annulé', emoji: '❌', aliases: ['canceled', 'cancelled', 'annule', 'wont do', 'wontfix', 'abandoned', 'dropped', 'rejected'] },
];

function normalizeListName_(name) {
  // NFD-decompose then drop anything outside a-z0-9 (incl. the now-detached
  // accent marks, e.g. "é" -> "e" + a combining mark that gets stripped by
  // the final replace below) — avoids embedding a literal combining-mark
  // regex range in source, which is easy to corrupt via copy/paste.
  return String(name || '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/[_/\\|]+/g, ' ')
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simplified vs. the Power-Up: exact/substring alias matching only (no
 * Levenshtein fuzz). Name your lists close to a standard workflow word
 * (Backlog / À faire / En cours / Bloqué / Terminé / Annulé) for a clean
 * match — see docs/google-sheets-sync.md.
 */
function matchListToStatut(listName) {
  var norm = normalizeListName_(listName);
  if (!norm) return null;
  for (var i = 0; i < STATUT_CATEGORIES.length; i++) {
    var cat = STATUT_CATEGORIES[i];
    for (var j = 0; j < cat.aliases.length; j++) {
      var alias = cat.aliases[j];
      if (norm === alias || norm.indexOf(alias) !== -1 || alias.indexOf(norm) !== -1) {
        return cat;
      }
    }
  }
  return null;
}

function statutLabelForList(listName) {
  var cat = matchListToStatut(listName);
  if (!cat) return listName || '';
  return cat.emoji + ' ' + cat.label;
}

/** Sheet → Trello direction: find a list on the board matching a typed Statut label/word. */
function findListForStatutValue(boardId, statutValue) {
  var wanted = normalizeListName_(String(statutValue || '').replace(/^[^\w]+/, ''));
  if (!wanted) return null;
  var cat = null;
  for (var i = 0; i < STATUT_CATEGORIES.length; i++) {
    if (STATUT_CATEGORIES[i].key === wanted || normalizeListName_(STATUT_CATEGORIES[i].label) === wanted) {
      cat = STATUT_CATEGORIES[i];
      break;
    }
  }
  if (!cat) return null;
  var lists = getBoardLists(boardId);
  for (var j = 0; j < lists.length; j++) {
    if (matchListToStatut(lists[j].name) && matchListToStatut(lists[j].name).key === cat.key) {
      return lists[j];
    }
  }
  return null;
}
