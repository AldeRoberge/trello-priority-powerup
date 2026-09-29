/*
 * Role: board-scoped settings + client for the Trello <-> Google Sheet sync Worker
 * (workers/trello-sheet-sync, deployed by scripts/setup-sheet-sync.ps1).
 * The Worker does the actual syncing (Trello webhook + 1-minute cron for Sheet edits); this file
 * only stores the connection (Worker URL, shared secret, Sheet URL), chosen columns, and calls
 * the Worker's /info, /config, /sync and /push endpoints. Also keeps the small Trello REST helper
 * used to create the "Catégorie" custom field.
 */
(function (global) {
  'use strict';

  var SETTINGS_KEY = 'googleSheetsSettings';

  function TM() {
    return global.TableModel || null;
  }

  function restCfg() {
    var cfg = global.PriorityRestConfig;
    return cfg && cfg.appKey ? cfg : null;
  }

  async function restToken(t) {
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return null;
    return api.getToken();
  }

  async function trelloRest(t, path, method, body) {
    var cfg = restCfg();
    if (!cfg) return { ok: false, reason: 'no-app-key' };
    var token = await restToken(t);
    if (!token) return { ok: false, reason: 'not-authorized' };

    var sep = path.indexOf('?') === -1 ? '?' : '&';
    var url =
      'https://api.trello.com/1' + path + sep +
      'key=' + encodeURIComponent(cfg.appKey) + '&token=' + encodeURIComponent(token);

    var response = await fetch(url, {
      method: method || 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    var text = '';
    try {
      text = await response.text();
    } catch (e) {
      /* ignore */
    }
    if (!response.ok) {
      return { ok: false, reason: 'http-' + response.status, detail: text };
    }
    var json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (e) {
      /* non-JSON response */
    }
    return { ok: true, data: json };
  }

  /* ── Settings (board/shared) ─────────────────────────────────────────
   * The Worker secret is stored here, so any board member who can open the
   * Table can sync. Trello shares this key with every board member only. */

  function normalizeSettings(raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    var model = TM();
    return {
      workerUrl: typeof s.workerUrl === 'string' ? s.workerUrl.trim().replace(/\/+$/, '') : '',
      secret: typeof s.secret === 'string' ? s.secret.trim() : '',
      sheetUrl: typeof s.sheetUrl === 'string' ? s.sheetUrl.trim() : '',
      columns: model ? model.normalizeColumns(s.columns) : Array.isArray(s.columns) ? s.columns : [],
      connectedAt: s.connectedAt || null,
    };
  }

  function isConnected(settings) {
    return !!(settings && settings.workerUrl && settings.secret);
  }

  async function getSettings(t) {
    return normalizeSettings(await t.get('board', 'shared', SETTINGS_KEY));
  }

  async function saveSettings(t, settings) {
    var normalized = normalizeSettings(settings);
    await t.set('board', 'shared', SETTINGS_KEY, normalized);
    return normalized;
  }

  /** Parses the connection code from the setup script and saves it. */
  async function connectWithCode(t, code) {
    var model = TM();
    var parsed = model ? model.parseConnectionCode(code) : null;
    if (!parsed) return { ok: false, reason: 'invalid-code' };
    var current = await getSettings(t);
    var saved = await saveSettings(t, {
      workerUrl: parsed.workerUrl,
      secret: parsed.secret,
      sheetUrl: parsed.sheetUrl,
      columns: current.columns,
      connectedAt: new Date().toISOString(),
    });
    return { ok: true, settings: saved };
  }

  /* ── Worker client ─────────────────────────────────────────────────── */

  async function workerCall(settings, method, path, body) {
    if (!isConnected(settings)) return { ok: false, reason: 'not-connected' };
    try {
      var response = await fetch(settings.workerUrl + path, {
        method: method,
        headers: { 'x-sync-secret': settings.secret, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      var text = await response.text();
      var json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (e) {
        /* ignore */
      }
      if (!response.ok) {
        return { ok: false, reason: 'http-' + response.status, detail: (json && json.error) || text };
      }
      return { ok: true, data: json };
    } catch (err) {
      return { ok: false, reason: 'network', detail: err && err.message };
    }
  }

  function info(settings) {
    return workerCall(settings, 'GET', '/info');
  }

  function syncNow(settings) {
    return workerCall(settings, 'POST', '/sync');
  }

  /** Sets the Sheet's column set (the Worker re-lays out the tab, keeping the values). */
  function pushColumns(settings, columns) {
    return workerCall(settings, 'PUT', '/config', { columns: columns });
  }

  /** Mirrors the browser-computed columns (score, progress...) into the Sheet. */
  function pushComputed(settings, payload) {
    return workerCall(settings, 'POST', '/push', payload);
  }

  /* ── Catégorie custom field ─────────────────────────────────────────── */

  async function ensureCategoryCustomField(t) {
    var boardId = await t.board('id').then(function (b) {
      return b.id;
    });
    var existing = await trelloRest(t, '/boards/' + boardId + '/customFields');
    if (!existing.ok) return existing;
    var found = (existing.data || []).filter(function (f) {
      return f.name === 'Catégorie' && f.type === 'text';
    })[0];
    if (found) return { ok: true, data: found };
    return trelloRest(t, '/customFields', 'POST', {
      idModel: boardId,
      modelType: 'board',
      name: 'Catégorie',
      type: 'text',
      pos: 'bottom',
    });
  }

  global.SheetsTrello = {
    trelloRest: trelloRest,
    getSettings: getSettings,
    saveSettings: saveSettings,
    normalizeSettings: normalizeSettings,
    isConnected: isConnected,
    connectWithCode: connectWithCode,
    workerCall: workerCall,
    info: info,
    syncNow: syncNow,
    pushColumns: pushColumns,
    pushComputed: pushComputed,
    ensureCategoryCustomField: ensureCategoryCustomField,
  };
})(typeof window !== 'undefined' ? window : this);
