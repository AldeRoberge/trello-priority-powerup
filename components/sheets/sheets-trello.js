/*
 * Role: Trello REST calls + board-scoped settings for the Google Sheets sync
 * feature. This file only handles *setup* (create the Catégorie custom
 * field, register the Trello webhook, push field-mapping config to the
 * Apps Script backend, persist the chosen settings). The actual sync loop
 * runs entirely in Apps Script — see docs/google-sheets-sync/apps-script/
 * and docs/google-sheets-sync.md.
 */
(function (global) {
  'use strict';

  var SETTINGS_KEY = 'googleSheetsSettings';

  var DEFAULT_FIELDS = ['category', 'name', 'desc', 'statut', 'priority', 'progress'];

  var FIELD_LABELS = {
    category: 'Catégorie',
    name: 'Objet (titre)',
    desc: 'Description',
    statut: 'Statut',
    priority: 'Priorité (lecture seule)',
    progress: 'Progrès (lecture seule)',
  };

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

  /* ── Settings (board/shared, visible to any board member) ──────────── */

  function normalizeSettings(raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    return {
      webAppUrl: typeof s.webAppUrl === 'string' ? s.webAppUrl.trim() : '',
      setupToken: typeof s.setupToken === 'string' ? s.setupToken.trim() : '',
      fields: Array.isArray(s.fields) && s.fields.length ? s.fields.slice() : DEFAULT_FIELDS.slice(),
      connectedAt: s.connectedAt || null,
    };
  }

  async function getSettings(t) {
    var raw = await t.get('board', 'shared', SETTINGS_KEY);
    return normalizeSettings(raw);
  }

  async function saveSettings(t, settings) {
    var normalized = normalizeSettings(settings);
    await t.set('board', 'shared', SETTINGS_KEY, normalized);
    return normalized;
  }

  /* ── Setup actions ────────────────────────────────────────────────── */

  async function ensureCategoryCustomField(t) {
    var boardId = await t.board('id').then(function (b) {
      return b.id;
    });
    var existing = await trelloRest(t, '/boards/' + boardId + '/customFields');
    if (!existing.ok) return existing;
    var found = (existing.data || []).filter(function (f) {
      return f.name === 'Catégorie';
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

  async function registerWebhook(t, webAppUrl) {
    var boardId = await t.board('id').then(function (b) {
      return b.id;
    });
    return trelloRest(t, '/webhooks', 'POST', {
      description: 'Cerveau Google Sheets sync',
      callbackURL: webAppUrl,
      idModel: boardId,
    });
  }

  /**
   * Pushes { boardId, syncFields } to the Apps Script Web App. Uses
   * text/plain as the request content-type on purpose: Apps Script Web Apps
   * don't reliably answer the CORS preflight a real "application/json"
   * fetch triggers, but a "simple request" (text/plain, no custom headers)
   * skips preflight entirely and Apps Script still parses the body fine via
   * e.postData.contents. See Code.gs jsonOut_() for the matching response side.
   */
  async function pushConfig(webAppUrl, setupToken, config) {
    if (!webAppUrl) return { ok: false, reason: 'no-url' };
    try {
      var response = await fetch(webAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ setupToken: setupToken, config: config }),
      });
      var text = await response.text();
      var json = null;
      try {
        json = JSON.parse(text);
      } catch (e) {
        /* ignore */
      }
      if (!response.ok || !json || json.ok !== true) {
        return { ok: false, reason: 'rejected', detail: text };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'network', error: err && err.message };
    }
  }

  async function testConnection(webAppUrl) {
    if (!webAppUrl) return { ok: false, reason: 'no-url' };
    try {
      var response = await fetch(webAppUrl, { method: 'GET' });
      var text = await response.text();
      return { ok: response.ok && /ok/i.test(text), status: response.status, body: text };
    } catch (err) {
      return { ok: false, reason: 'network', error: err && err.message };
    }
  }

  global.SheetsTrello = {
    DEFAULT_FIELDS: DEFAULT_FIELDS,
    FIELD_LABELS: FIELD_LABELS,
    getSettings: getSettings,
    saveSettings: saveSettings,
    ensureCategoryCustomField: ensureCategoryCustomField,
    registerWebhook: registerWebhook,
    pushConfig: pushConfig,
    testConnection: testConnection,
  };
})(typeof window !== 'undefined' ? window : this);
