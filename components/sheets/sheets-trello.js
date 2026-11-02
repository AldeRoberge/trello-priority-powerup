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
  var SECRET_KEY = 'googleSheetsSecret';
  // The Worker URL the member's secret was issued for (board/private, next to the secret). The shared URL can be changed
  // by any board member, so the secret is only ever sent to this one.
  var SECRET_URL_KEY = 'googleSheetsSecretUrl';

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

  /* ── Settings ────────────────────────────────────────────────────────
   * Worker URL, Sheet URL and columns live in board/shared. The Worker secret
   * lives in board/private: Trello refuses secrets in shared pluginData ("Detected
   * potential secret"), so each member pastes the connection code once. */

  function trimUrl(u) {
    return typeof u === 'string' ? u.trim().replace(/\/+$/, '') : '';
  }

  /** Host of a URL, for messages ("autre.example.com"). */
  function hostOf(u) {
    try {
      return new URL(u).host;
    } catch (e) {
      return String(u || '');
    }
  }

  function normalizeSettings(raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    var model = TM();
    var out = {
      workerUrl: trimUrl(s.workerUrl),
      secret: typeof s.secret === 'string' ? s.secret.trim() : '',
      secretUrl: trimUrl(s.secretUrl),
      sheetUrl: typeof s.sheetUrl === 'string' ? s.sheetUrl.trim() : '',
      columns: model ? model.normalizeColumns(s.columns) : Array.isArray(s.columns) ? s.columns : [],
      connectedAt: s.connectedAt || null,
    };
    // The shared Worker URL is not the one this member's secret was issued for: the secret must not go there.
    out.urlChanged = !!(out.secret && out.secretUrl && out.secretUrl !== out.workerUrl);
    return out;
  }

  function isConnected(settings) {
    return !!(settings && settings.workerUrl && settings.secret && !settings.urlChanged);
  }

  async function getSettings(t) {
    var shared = (await t.get('board', 'shared', SETTINGS_KEY)) || {};
    var secret = await t.get('board', 'private', SECRET_KEY);
    var secretUrl = await t.get('board', 'private', SECRET_URL_KEY);
    if (secret && !secretUrl && shared.workerUrl) {
      // Connected before secrets were tied to a URL: tie it to the one shared today, so nobody is disconnected by the update.
      secretUrl = trimUrl(shared.workerUrl);
      try {
        await t.set('board', 'private', SECRET_URL_KEY, secretUrl);
      } catch (e) {
        /* tied for this call only; tried again next time */
      }
    }
    return normalizeSettings(Object.assign({}, shared, { secret: secret, secretUrl: secretUrl }));
  }

  /**
   * opts.bind: the member just connected with their own code, so the secret is tied to this URL. Any other save (columns,
   * Sheet link) leaves the tie alone: a changed shared URL must not drag the secret along. No secret, no tie.
   */
  async function saveSettings(t, settings, opts) {
    var normalized = normalizeSettings(settings);
    var shared = Object.assign({}, normalized);
    delete shared.secret;
    delete shared.secretUrl;
    delete shared.urlChanged;
    await t.set('board', 'private', SECRET_KEY, normalized.secret);
    if (!normalized.secret) normalized.secretUrl = '';
    else if (opts && opts.bind) normalized.secretUrl = normalized.workerUrl;
    if (!normalized.secret || (opts && opts.bind)) await t.set('board', 'private', SECRET_URL_KEY, normalized.secretUrl);
    normalized.urlChanged = !!(normalized.secret && normalized.secretUrl && normalized.secretUrl !== normalized.workerUrl);
    await t.set('board', 'shared', SETTINGS_KEY, shared);
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
    }, { bind: true });
    return { ok: true, settings: saved };
  }

  /* ── Worker client ─────────────────────────────────────────────────── */

  async function workerCall(settings, method, path, body) {
    if (!isConnected(settings)) return { ok: false, reason: settings && settings.urlChanged ? 'url-changed' : 'not-connected' };
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

  /** Documents ↔ the Drive folder (no-op when the folder is not configured). */
  function syncDocuments(settings) {
    return workerCall(settings, 'POST', '/documents/sync');
  }

  /** Documents ↔ Google Keep notes (no-op when Keep is not configured). */
  function syncKeep(settings) {
    return workerCall(settings, 'POST', '/keep/sync');
  }

  /** Sets the Sheet's column set (the Worker re-lays out the tab, keeping the values). */
  function pushColumns(settings, columns) {
    return workerCall(settings, 'PUT', '/config', { columns: columns });
  }

  function logs(settings, opts) {
    opts = opts || {};
    return workerCall(settings, 'GET', '/logs?limit=' + (opts.limit || 200) + '&level=' + encodeURIComponent(opts.level || 'VERBOSE'));
  }

  function activities(settings, opts) {
    opts = opts || {};
    return workerCall(settings, 'GET', '/activities?limit=' + (opts.limit || 200));
  }

  function ackAlerts(settings) {
    return workerCall(settings, 'POST', '/alerts/ack');
  }

  function setLogLevel(settings, level) {
    return workerCall(settings, 'PUT', '/config', { logLevel: level });
  }

  /** Sheet look: 'light' or 'dark' (Trello dark palette + Lexend). The Worker reformats the tabs. */
  function setSheetTheme(settings, theme) {
    return workerCall(settings, 'PUT', '/config', { sheetTheme: theme });
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
    hostOf: hostOf,
    connectWithCode: connectWithCode,
    workerCall: workerCall,
    info: info,
    syncNow: syncNow,
    syncDocuments: syncDocuments,
    syncKeep: syncKeep,
    pushColumns: pushColumns,
    pushComputed: pushComputed,
    logs: logs,
    activities: activities,
    ackAlerts: ackAlerts,
    setLogLevel: setLogLevel,
    setSheetTheme: setSheetTheme,
    ensureCategoryCustomField: ensureCategoryCustomField,
  };
})(typeof window !== 'undefined' ? window : this);
