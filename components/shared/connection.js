/*
 * Role: one place that knows whether the network is reachable, and how to show it.
 * Offline is shown as a broken-link icon with a small spinner (we are trying to reconnect), never as a sentence.
 * Also keeps unsent edits on this device (drafts) so a closed tab or a failed save never loses them.
 * Browser only (no Trello). Exposes window.Connection.
 */
(function (global) {
  'use strict';

  var listeners = [];
  var DRAFT_PREFIX = 'cerveau.draft.';

  function offline() {
    return !!(global.navigator && global.navigator.onLine === false);
  }

  /** True for a failed request (no response), not for an answer such as http-404 or conflict. */
  function isNetworkError(err) {
    if (offline()) return true;
    if (!err) return false;
    if (err.offline === true || err.reason === 'network') return true;
    if (err.reason) return false;
    return err.name === 'TypeError' || /failed to fetch|networkerror|load failed|network request failed/i.test(String(err.message || err));
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  function emit() {
    var off = offline();
    listeners.slice().forEach(function (fn) {
      try { fn(off); } catch (e) { /* a listener must not block the others */ }
    });
  }

  function icon(name, cls) {
    var i = document.createElement('i');
    i.className = 'ti ti-' + name + (cls ? ' ' + cls : '');
    return i;
  }

  function injectStyle() {
    if (!global.document || document.getElementById('cn-style')) return;
    var s = document.createElement('style');
    s.id = 'cn-style';
    s.textContent =
      '.cn-offline{display:inline-flex;align-items:center;gap:3px;color:var(--tp-danger-text,#d93025)}' +
      '.cn-offline .ti{font-size:16px}' +
      '.cn-offline .cn-spin{font-size:13px;opacity:.8;animation:cn-spin .9s linear infinite}' +
      '@keyframes cn-spin{to{transform:rotate(360deg)}}' +
      '@media (prefers-reduced-motion:reduce){.cn-offline .cn-spin{animation-duration:3s}}';
    document.head.appendChild(s);
  }

  /** Broken link + spinner, same size everywhere. */
  function indicator(title) {
    injectStyle();
    var w = document.createElement('span');
    w.className = 'cn-offline';
    w.title = title || 'Hors ligne, reconnexion en cours';
    w.setAttribute('role', 'status');
    w.appendChild(icon('unlink'));
    w.appendChild(icon('loader-2', 'cn-spin'));
    return w;
  }

  /* ── Drafts: unsent edits kept on this device until the server confirms them ── */

  function readDraft(key) {
    try {
      var raw = global.localStorage.getItem(DRAFT_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeDraft(key, value) {
    try {
      global.localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(Object.assign({ at: Date.now() }, value)));
      return true;
    } catch (e) {
      return false; /* storage full or blocked: the edit stays in memory and the save retries */
    }
  }

  function clearDraft(key) {
    try { global.localStorage.removeItem(DRAFT_PREFIX + key); } catch (e) { /* ignore */ }
  }

  if (global.addEventListener) {
    global.addEventListener('online', emit);
    global.addEventListener('offline', emit);
  }

  global.Connection = {
    offline: offline,
    isNetworkError: isNetworkError,
    onChange: onChange,
    indicator: indicator,
    readDraft: readDraft,
    writeDraft: writeDraft,
    clearDraft: clearDraft,
  };
})(typeof window !== 'undefined' ? window : this);
