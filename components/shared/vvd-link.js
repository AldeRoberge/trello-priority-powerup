/**
 * VvdLink: read-only link to the VVD Control Center, a launcher that runs on this computer
 * (default http://127.0.0.1:4391). A web page must never start or stop local processes, so
 * this file only does GET requests. Every call fails soft: it returns null (or false for ping),
 * never throws, and gives up after a short timeout so the UI is never blocked.
 *
 * The launcher answers CORS for the app origins and the Private Network Access preflight.
 * Address override: localStorage key "tp-vvd-url".
 */
(function (global) {
  'use strict';

  var DEFAULT_URL = 'http://127.0.0.1:4391';
  var URL_KEY = 'tp-vvd-url';
  var PING_TTL = 20000;
  var PING_TIMEOUT = 1500;
  var CALL_TIMEOUT = 3000;
  var FAILED = /^(fail|failed|failure|error|errored|cancel+ed|timed?_?out|rejected)$/i;
  var BAD_HEALTH = /^(down|fail|failed|failure|error|unhealthy|ko|offline|stopped|crash(ed)?)$/i;

  var pingCache = { at: 0, value: null, pending: null };

  function storage() {
    try { return global.localStorage || null; } catch (e) { return null; }
  }

  function cleanBase(raw) {
    var s = String(raw || '').trim().replace(/\/+$/, '');
    return /^https?:\/\/[^\s/]+$/i.test(s) ? s : '';
  }

  function baseUrl() {
    var ls = storage();
    var saved = '';
    try { saved = ls ? cleanBase(ls.getItem(URL_KEY)) : ''; } catch (e) { saved = ''; }
    return saved || DEFAULT_URL;
  }

  function setBaseUrl(raw) {
    var ls = storage();
    if (!ls) return false;
    try {
      var v = cleanBase(raw);
      if (v) ls.setItem(URL_KEY, v); else ls.removeItem(URL_KEY);
      pingCache = { at: 0, value: null, pending: null };
      return true;
    } catch (e) { return false; }
  }

  /** GET path -> parsed JSON, or null on any failure. Read-only by construction. */
  function getJson(path, timeoutMs) {
    var Ctl = global.AbortController;
    var ctl = Ctl ? new Ctl() : null;
    var timer = null;
    try {
      if (typeof global.fetch !== 'function') return Promise.resolve(null);
      if (ctl) timer = setTimeout(function () { try { ctl.abort(); } catch (e) { /* ignore */ } }, timeoutMs || CALL_TIMEOUT);
      return global
        .fetch(baseUrl() + path, { method: 'GET', mode: 'cors', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
        .then(function (res) { return res && res.ok ? res.json() : null; })
        .catch(function () { return null; })
        .then(function (v) { if (timer) clearTimeout(timer); return v; });
    } catch (e) {
      if (timer) clearTimeout(timer);
      return Promise.resolve(null);
    }
  }

  function ping() {
    var now = Date.now();
    if (pingCache.value !== null && now - pingCache.at < PING_TTL) return Promise.resolve(pingCache.value);
    if (pingCache.pending) return pingCache.pending;
    var p = getJson('/api/ping', PING_TIMEOUT).then(function (v) {
      var up = v !== null;
      pingCache = { at: Date.now(), value: up, pending: null };
      return up;
    });
    pingCache.pending = p;
    return p;
  }

  function apps() {
    return getJson('/api/apps').then(function (v) { return v ? listOf(v, 'apps') : null; });
  }
  function health() {
    return getJson('/api/health');
  }
  function deploys() {
    return getJson('/api/deploys').then(function (v) { return v ? listOf(v, 'deploys') : null; });
  }

  /* ---- pure helpers (unit-tested) ---- */

  function listOf(v, key) {
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v[key])) return v[key];
    return [];
  }

  function str(v) {
    return v == null ? '' : String(v);
  }

  /** health value of one app: 'ok' | 'down' | '' (unknown). Accepts a string, boolean or {ok,status}. */
  function healthOf(app, healthPayload) {
    var raw = app && app.health;
    if (raw == null && healthPayload) {
      var byApp = healthPayload.apps || healthPayload;
      raw = Array.isArray(byApp)
        ? (byApp.filter(function (h) { return h && (h.id === app.id || h.app === app.id); })[0] || null)
        : byApp && typeof byApp === 'object' ? byApp[app.id] : null;
    }
    if (raw == null) return '';
    if (typeof raw === 'boolean') return raw ? 'ok' : 'down';
    if (typeof raw === 'object') {
      if (typeof raw.ok === 'boolean') return raw.ok ? 'ok' : 'down';
      raw = raw.status != null ? raw.status : raw.state;
    }
    var s = str(raw).trim();
    if (!s) return '';
    return BAD_HEALTH.test(s) ? 'down' : 'ok';
  }

  function countFailingDeploys(list) {
    var n = 0;
    (list || []).forEach(function (d) {
      var st = d && (d.status != null ? d.status : d.state != null ? d.state : d.conclusion);
      if (st != null && FAILED.test(str(st).trim())) n += 1;
    });
    return n;
  }

  /** Combines the three payloads into {up, apps:[{id,name,status,health}], failingDeploys}. */
  function buildSummary(up, appList, healthPayload, deployList) {
    var rows = (appList || []).filter(Boolean).map(function (a) {
      return {
        id: str(a.id),
        name: str(a.name || a.id),
        status: str(a.status),
        health: healthOf(a, healthPayload)
      };
    });
    return { up: !!up, apps: rows, failingDeploys: countFailingDeploys(deployList) };
  }

  /** Short French sentence for the assistant. */
  function describeSummary(s) {
    if (!s || !s.up) return 'Le Centre de contrôle VVD ne répond pas : il doit tourner sur cet ordinateur.';
    var apps = s.apps || [];
    var running = apps.filter(function (a) { return /^(running|up|started|en cours|ok)$/i.test(a.status); });
    var sick = apps.filter(function (a) { return a.health === 'down'; });
    var parts = [];
    if (!apps.length) parts.push('Aucune application n’est listée.');
    else parts.push(running.length + ' application' + (running.length > 1 ? 's' : '') + ' sur ' + apps.length + ' en marche.');
    if (sick.length) parts.push('À surveiller : ' + sick.map(function (a) { return a.name; }).join(', ') + '.');
    var f = s.failingDeploys || 0;
    parts.push(f ? f + ' déploiement' + (f > 1 ? 's' : '') + ' en échec.' : 'Aucun déploiement en échec.');
    return parts.join(' ');
  }

  /** Never throws. null when the launcher does not answer. */
  function summary() {
    return ping()
      .then(function (up) {
        if (!up) return null;
        return Promise.all([apps(), health(), deploys()]).then(function (r) {
          return buildSummary(true, r[0], r[1], r[2]);
        });
      })
      .catch(function () { return null; });
  }

  var api = {
    baseUrl: baseUrl,
    setBaseUrl: setBaseUrl,
    ping: ping,
    apps: apps,
    health: health,
    deploys: deploys,
    summary: summary,
    buildSummary: buildSummary,
    describeSummary: describeSummary,
    healthOf: healthOf,
    countFailingDeploys: countFailingDeploys,
    DEFAULT_URL: DEFAULT_URL
  };

  global.VvdLink = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
