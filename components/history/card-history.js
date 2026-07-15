/**
 * Persisted card edit history (undo / redo / revert).
 * Stored in card/private so it does not compete with shared plugin data.
 */
(function (global) {
  'use strict';

  var HISTORY_KEY = 'cardEditHistory';
  var MAX_ENTRIES = 20;
  var MAX_SERIALIZED = 3800;

  function clone(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return null;
    }
  }

  function stableStringify(value) {
    try {
      return JSON.stringify(value == null ? null : value);
    } catch (e) {
      return '';
    }
  }

  function deepEqual(a, b) {
    return stableStringify(a) === stableStringify(b);
  }

  function makeId() {
    return (
      'h' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function emptyStore() {
    return { version: 1, entries: [], cursor: 0 };
  }

  function normalizeStore(raw) {
    var store = emptyStore();
    if (!raw || typeof raw !== 'object') return store;
    if (Array.isArray(raw.entries)) {
      store.entries = raw.entries.filter(function (e) {
        return e && typeof e === 'object' && e.id && e.before && e.after;
      });
    }
    var cursor = Number(raw.cursor);
    if (!isFinite(cursor) || cursor < 0) cursor = store.entries.length;
    if (cursor > store.entries.length) cursor = store.entries.length;
    store.cursor = cursor;
    return store;
  }

  function serializedSize(store) {
    return stableStringify(store).length;
  }

  function trimStore(store) {
    var next = {
      version: 1,
      entries: (store.entries || []).slice(),
      cursor: store.cursor | 0
    };
    while (next.entries.length > MAX_ENTRIES) {
      next.entries.shift();
      next.cursor = Math.max(0, next.cursor - 1);
    }
    while (
      serializedSize(next) > MAX_SERIALIZED &&
      next.entries.length > 1
    ) {
      next.entries.shift();
      next.cursor = Math.max(0, next.cursor - 1);
    }
    if (serializedSize(next) > MAX_SERIALIZED && next.entries.length === 1) {
      var only = next.entries[0];
      next.entries = [
        {
          id: only.id,
          at: only.at,
          label: only.label,
          domains: only.domains,
          before: slimPayload(only.before),
          after: slimPayload(only.after)
        }
      ];
      next.cursor = Math.min(next.cursor, 1);
    }
    return next;
  }

  function slimPayload(partial) {
    var out = clone(partial) || {};
    if (out.completion && out.completion.items && out.completion.items.length > 8) {
      out.completion = {
        items: out.completion.items.slice(0, 8),
        progress: out.completion.progress,
        _truncated: true
      };
    }
    if (out.priority && Array.isArray(out.priority.blockedReasons)) {
      out.priority = Object.assign({}, out.priority, {
        blockedReasons: out.priority.blockedReasons.slice(0, 5)
      });
    }
    return out;
  }

  function changedDomains(before, after) {
    var domains = [];
    var keys = ['priority', 'completion', 'statut', 'info', 'goals'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (!deepEqual(before && before[key], after && after[key])) {
        domains.push(key);
      }
    }
    return domains;
  }

  function pickDomains(snapshot, domains) {
    var out = {};
    for (var i = 0; i < domains.length; i++) {
      var key = domains[i];
      out[key] = clone(snapshot && snapshot[key]);
    }
    return out;
  }

  function axisLabel(key) {
    if (key === 'urgency') return 'Urgence';
    if (key === 'impact') return 'Impact';
    if (key === 'ease') return 'Facilit\u00e9';
    return key;
  }

  function buildLabel(before, after, domains, hint) {
    if (typeof hint === 'string' && hint.trim() && hint.indexOf(':') !== -1) {
      return hint.trim().slice(0, 120);
    }

    var parts = [];
    var d = domains || [];

    if (d.indexOf('priority') !== -1) {
      var bp = (before && before.priority) || {};
      var ap = (after && after.priority) || {};
      ['urgency', 'impact', 'ease'].forEach(function (axis) {
        if (bp[axis] !== ap[axis]) {
          parts.push(axisLabel(axis) + ' : ' + bp[axis] + ' \u2192 ' + ap[axis]);
        }
      });
      if (!!bp.enAttente !== !!ap.enAttente) {
        parts.push(ap.enAttente ? 'Bloqu\u00e9 activ\u00e9' : 'Bloqu\u00e9 d\u00e9sactiv\u00e9');
      }
      if (bp.dueDate !== ap.dueDate || bp.dueTime !== ap.dueTime) {
        parts.push('\u00c9ch\u00e9ance modifi\u00e9e');
      }
      if (
        !deepEqual(bp.blockedReasons, ap.blockedReasons) ||
        !deepEqual(bp.blockedLinks, ap.blockedLinks)
      ) {
        parts.push('Motifs de blocage');
      }
      if (
        bp.estimatedDurationMinutes !== ap.estimatedDurationMinutes &&
        parts.length === 0
      ) {
        parts.push('Dur\u00e9e estim\u00e9e');
      }
      if (parts.length === 0) parts.push('Priorit\u00e9');
    }

    if (d.indexOf('completion') !== -1) {
      var bi = ((before && before.completion && before.completion.items) || []).length;
      var ai = ((after && after.completion && after.completion.items) || []).length;
      if (bi !== ai) {
        parts.push('Progr\u00e8s : ' + bi + ' \u2192 ' + ai + ' t\u00e2ches');
      } else {
        parts.push('Progr\u00e8s modifi\u00e9');
      }
    }

    if (d.indexOf('statut') !== -1) {
      parts.push('Statut / liste');
    }

    if (d.indexOf('info') !== -1) {
      var bInfo = (before && before.info) || {};
      var aInfo = (after && after.info) || {};
      var infoParts = [];
      if (bInfo.name !== aInfo.name) infoParts.push('Titre');
      if (bInfo.desc !== aInfo.desc) infoParts.push('Description');
      if (!deepEqual(bInfo.memberIds, aInfo.memberIds)) infoParts.push('Membres');
      if (!deepEqual(bInfo.labelIds, aInfo.labelIds)) infoParts.push('\u00c9tiquettes');
      if (!infoParts.length) infoParts.push('Information');
      parts = parts.concat(infoParts);
    }

    if (d.indexOf('goals') !== -1) {
      parts.push('Projet li\u00e9');
    }

    if (!parts.length) {
      if (typeof hint === 'string' && hint.trim()) return hint.trim().slice(0, 120);
      return 'Modification';
    }

    var label = parts.slice(0, 3).join(' · ');
    return label.slice(0, 120);
  }

  function create(options) {
    options = options || {};
    var t = options.t;
    var onChange = typeof options.onChange === 'function' ? options.onChange : function () {};
    var store = emptyStore();
    var muteDepth = 0;
    var saveChain = Promise.resolve();

    function isMuted() {
      return muteDepth > 0;
    }

    function beginMute() {
      muteDepth += 1;
    }

    function endMute() {
      muteDepth = Math.max(0, muteDepth - 1);
    }

    function notify() {
      try {
        onChange(listEntries(), {
          canUndo: canUndo(),
          canRedo: canRedo()
        });
      } catch (e) {
        /* ignore */
      }
    }

    function persist() {
      store = trimStore(store);
      if (!t || typeof t.set !== 'function') return Promise.resolve(store);
      saveChain = saveChain
        .then(function () {
          return t.set('card', 'private', HISTORY_KEY, store);
        })
        .catch(function (err) {
          console.error('CardHistory.save failed', err);
          while (store.entries.length > 0) {
            store.entries.shift();
            store.cursor = Math.max(0, store.cursor - 1);
            store = trimStore(store);
            if (serializedSize(store) <= Math.floor(MAX_SERIALIZED * 0.85)) break;
          }
          return t.set('card', 'private', HISTORY_KEY, store).catch(function (retryErr) {
            console.error('CardHistory.save retry failed', retryErr);
          });
        });
      return saveChain;
    }

    function load() {
      if (!t || typeof t.get !== 'function') {
        store = emptyStore();
        return Promise.resolve(store);
      }
      return t
        .get('card', 'private', HISTORY_KEY)
        .then(function (raw) {
          store = normalizeStore(raw);
          notify();
          return store;
        })
        .catch(function (err) {
          console.error('CardHistory.load failed', err);
          store = emptyStore();
          return store;
        });
    }

    function record(before, after, hint) {
      if (isMuted()) return null;
      var domains = changedDomains(before, after);
      if (!domains.length) return null;

      var entry = {
        id: makeId(),
        at: new Date().toISOString(),
        label: buildLabel(before, after, domains, hint),
        domains: domains,
        before: pickDomains(before, domains),
        after: pickDomains(after, domains)
      };

      store.entries = store.entries.slice(0, store.cursor);
      store.entries.push(entry);
      store.cursor = store.entries.length;
      store = trimStore(store);
      persist();
      notify();
      return entry;
    }

    function listEntries() {
      // Newest first for UI; only applied entries up to cursor.
      var applied = store.entries.slice(0, store.cursor);
      return applied
        .slice()
        .reverse()
        .map(function (e) {
          return {
            id: e.id,
            at: e.at,
            label: e.label,
            domains: e.domains.slice()
          };
        });
    }

    function canUndo() {
      return store.cursor > 0;
    }

    function canRedo() {
      return store.cursor < store.entries.length;
    }

    function undo(applySnapshot) {
      if (!canUndo()) return Promise.resolve(null);
      var entry = store.entries[store.cursor - 1];
      if (!entry) return Promise.resolve(null);
      beginMute();
      var applyFn =
        typeof applySnapshot === 'function' ? applySnapshot : function () {};
      return Promise.resolve()
        .then(function () {
          return applyFn(clone(entry.before));
        })
        .then(function () {
          store.cursor -= 1;
          return persist();
        })
        .then(function () {
          notify();
          return clone(entry.before);
        })
        .finally(function () {
          endMute();
        });
    }

    function redo(applySnapshot) {
      if (!canRedo()) return Promise.resolve(null);
      var entry = store.entries[store.cursor];
      if (!entry) return Promise.resolve(null);
      beginMute();
      var applyFn =
        typeof applySnapshot === 'function' ? applySnapshot : function () {};
      return Promise.resolve()
        .then(function () {
          return applyFn(clone(entry.after));
        })
        .then(function () {
          store.cursor += 1;
          return persist();
        })
        .then(function () {
          notify();
          return clone(entry.after);
        })
        .finally(function () {
          endMute();
        });
    }

    function revertTo(entryId, applySnapshot) {
      var idx = -1;
      for (var i = 0; i < store.cursor; i++) {
        if (store.entries[i] && store.entries[i].id === entryId) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return Promise.resolve(null);
      var entry = store.entries[idx];
      beginMute();
      var applyFn =
        typeof applySnapshot === 'function' ? applySnapshot : function () {};
      return Promise.resolve()
        .then(function () {
          return applyFn(clone(entry.before));
        })
        .then(function () {
          store.entries = store.entries.slice(0, idx);
          store.cursor = idx;
          return persist();
        })
        .then(function () {
          notify();
          return clone(entry.before);
        })
        .finally(function () {
          endMute();
        });
    }

    return {
      HISTORY_KEY: HISTORY_KEY,
      load: load,
      record: record,
      undo: undo,
      redo: redo,
      revertTo: revertTo,
      list: listEntries,
      canUndo: canUndo,
      canRedo: canRedo,
      beginMute: beginMute,
      endMute: endMute,
      isMuted: isMuted,
      changedDomains: changedDomains,
      buildLabel: buildLabel
    };
  }

  global.CardHistory = {
    HISTORY_KEY: HISTORY_KEY,
    create: create,
    changedDomains: changedDomains,
    buildLabel: buildLabel,
    deepEqual: deepEqual,
    clone: clone
  };
})(typeof window !== 'undefined' ? window : this);
