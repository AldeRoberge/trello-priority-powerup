/*
 * Role: the notes kept on this device, so the app opens and edits offline.
 * One record per note: { id, ...note fields, base, dirty, deleted }. `base` is the last state that
 * Trello and this device agreed on (see KeepModel.resolve). Unsent changes are the records that are
 * `dirty` or `deleted`: there is no separate queue to get out of step.
 * IndexedDB in the browser, memory when it is missing (tests, private mode). Exposes window.KeepStore.
 */
(function (global) {
  'use strict';

  function memoryAdapter() {
    var notes = new Map();
    var meta = new Map();
    return {
      all: function () { return Promise.resolve(Array.from(notes.values()).map(clone)); },
      get: function (id) { return Promise.resolve(notes.has(id) ? clone(notes.get(id)) : null); },
      put: function (rec) { notes.set(rec.id, clone(rec)); return Promise.resolve(); },
      remove: function (id) { notes.delete(id); return Promise.resolve(); },
      getMeta: function (k) { return Promise.resolve(meta.has(k) ? meta.get(k) : null); },
      setMeta: function (k, v) { meta.set(k, v); return Promise.resolve(); },
    };
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function idbAdapter(name) {
    var opening = null;
    function db() {
      if (!opening) {
        opening = new Promise(function (resolve, reject) {
          var req = global.indexedDB.open(name, 1);
          req.onupgradeneeded = function () {
            req.result.createObjectStore('notes', { keyPath: 'id' });
            req.result.createObjectStore('meta');
          };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { reject(req.error); };
        });
      }
      return opening;
    }
    function run(store, mode, fn) {
      return db().then(function (d) {
        return new Promise(function (resolve, reject) {
          var tx = d.transaction(store, mode);
          var req = fn(tx.objectStore(store));
          tx.oncomplete = function () { resolve(req ? req.result : undefined); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    }
    return {
      all: function () { return run('notes', 'readonly', function (s) { return s.getAll(); }).then(function (r) { return r || []; }); },
      get: function (id) { return run('notes', 'readonly', function (s) { return s.get(id); }).then(function (r) { return r || null; }); },
      put: function (rec) { return run('notes', 'readwrite', function (s) { return s.put(rec); }); },
      remove: function (id) { return run('notes', 'readwrite', function (s) { return s.delete(id); }); },
      getMeta: function (k) { return run('meta', 'readonly', function (s) { return s.get(k); }).then(function (r) { return r == null ? null : r; }); },
      setMeta: function (k, v) { return run('meta', 'readwrite', function (s) { return s.put(v, k); }); },
    };
  }

  /** @param {object} [adapter] defaults to IndexedDB, or memory when it is unavailable */
  function create(adapter) {
    var a = adapter || (global.indexedDB ? idbAdapter('keep-notes') : memoryAdapter());
    return {
      all: function () { return a.all(); },
      get: function (id) { return a.get(id); },
      put: function (rec) { return a.put(rec); },
      remove: function (id) { return a.remove(id); },
      getMeta: function (k) { return a.getMeta(k); },
      setMeta: function (k, v) { return a.setMeta(k, v); },
      /** Notes the user can see (not marked deleted). */
      visible: function () {
        return a.all().then(function (list) { return list.filter(function (r) { return !r.deleted; }); });
      },
      pending: function () {
        return a.all().then(function (list) { return list.filter(function (r) { return r.dirty || r.deleted; }).length; });
      },
    };
  }

  global.KeepStore = { create: create, memoryAdapter: memoryAdapter, idbAdapter: idbAdapter };
})(typeof window !== 'undefined' ? window : globalThis);
