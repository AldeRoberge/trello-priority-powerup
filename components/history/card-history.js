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
      store.entries = raw.entries
        .filter(function (e) {
          return e && typeof e === 'object' && e.id && e.before && e.after;
        })
        .map(function (e) {
          var domains = Array.isArray(e.domains) ? e.domains : changedDomains(e.before, e.after);
          var relabeled = buildLabel(e.before, e.after, domains, e.label);
          return Object.assign({}, e, {
            domains: domains,
            // Refresh vague legacy labels when diffs are still available.
            label: relabeled || e.label || 'Modification'
          });
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

  function domainSlice(snapshot, key) {
    var value = snapshot && snapshot[key];
    if (!value || typeof value !== 'object') return value;
    if (key === 'statut') {
      return {
        listId: value.listId || null,
        dueComplete: !!value.dueComplete
      };
    }
    if (key === 'info') {
      return {
        name: value.name || '',
        desc: value.desc || '',
        memberIds: value.memberIds || [],
        labelIds: value.labelIds || []
      };
    }
    if (key === 'goals') {
      return { projectId: value.projectId || null };
    }
    return value;
  }

  function changedDomains(before, after) {
    var domains = [];
    var keys = ['priority', 'completion', 'statut', 'info', 'goals'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (!deepEqual(domainSlice(before, key), domainSlice(after, key))) {
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

  var MONTHS_FR = [
    'janv.',
    'f\u00e9vr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'ao\u00fbt',
    'sept.',
    'oct.',
    'nov.',
    'd\u00e9c.'
  ];

  var LABEL_MAX = 160;

  function axisLabel(key) {
    if (key === 'urgency') return 'Urgence';
    if (key === 'impact') return 'Impact';
    if (key === 'ease') return 'Facilit\u00e9';
    return key;
  }

  function quoteText(value, maxLen) {
    var s = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
    maxLen = maxLen || 36;
    if (!s) return '\u00ab \u00bb';
    if (maxLen > 0 && s.length > maxLen) {
      s = s.slice(0, Math.max(1, maxLen - 1)) + '\u2026';
    }
    return '\u00ab ' + s + ' \u00bb';
  }

  function fullText(value) {
    return String(value == null ? '' : value).trim();
  }

  function formatDueFr(date, time) {
    if (!date) return 'aucune';
    var m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    var out = String(date);
    if (m) {
      var monthIdx = Number(m[2]) - 1;
      var day = Number(m[3]);
      var month = MONTHS_FR[monthIdx] || m[2];
      out = day + ' ' + month + ' ' + m[1];
    }
    if (time) out += ' \u00b7 ' + String(time).slice(0, 5);
    return out;
  }

  function formatMinutesFr(mins) {
    if (mins == null || mins === '') return 'aucune';
    var n = Number(mins);
    if (!isFinite(n)) return String(mins);
    if (n < 60) return n + ' min';
    var h = Math.floor(n / 60);
    var rem = n % 60;
    if (!rem) return h + ' h';
    return h + ' h ' + rem + ' min';
  }

  function itemMap(items) {
    var map = Object.create(null);
    (items || []).forEach(function (item) {
      if (item && item.id) map[String(item.id)] = item;
    });
    return map;
  }

  function displayNameForId(summaries, id, fallback) {
    var list = summaries || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === String(id)) {
        return list[i].name || list[i].text || fallback || String(id);
      }
    }
    return fallback || String(id);
  }

  function idDiffLabels(beforeIds, afterIds, beforeSummaries, afterSummaries) {
    var beforeSet = Object.create(null);
    var afterSet = Object.create(null);
    (beforeIds || []).forEach(function (id) {
      beforeSet[String(id)] = true;
    });
    (afterIds || []).forEach(function (id) {
      afterSet[String(id)] = true;
    });
    var added = [];
    var removed = [];
    (afterIds || []).forEach(function (id) {
      if (!beforeSet[String(id)]) {
        added.push(displayNameForId(afterSummaries, id, id));
      }
    });
    (beforeIds || []).forEach(function (id) {
      if (!afterSet[String(id)]) {
        removed.push(displayNameForId(beforeSummaries, id, id));
      }
    });
    return { added: added, removed: removed };
  }

  function describeCompletion(before, after) {
    var bItems = (before && before.items) || [];
    var aItems = (after && after.items) || [];
    var bMap = itemMap(bItems);
    var aMap = itemMap(aItems);
    var parts = [];

    Object.keys(aMap).forEach(function (id) {
      if (!bMap[id]) {
        parts.push('T\u00e2che ajout\u00e9e : ' + quoteText(aMap[id].text));
      }
    });
    Object.keys(bMap).forEach(function (id) {
      if (!aMap[id]) {
        parts.push('T\u00e2che supprim\u00e9e : ' + quoteText(bMap[id].text));
      }
    });
    Object.keys(aMap).forEach(function (id) {
      if (!bMap[id]) return;
      var b = bMap[id];
      var a = aMap[id];
      if ((b.text || '') !== (a.text || '')) {
        parts.push(
          'T\u00e2che renomm\u00e9e : ' +
            quoteText(b.text, 24) +
            ' \u2192 ' +
            quoteText(a.text, 24)
        );
        return;
      }
      var bDone = !!b.done || Number(b.progress) >= 100;
      var aDone = !!a.done || Number(a.progress) >= 100;
      if (bDone !== aDone) {
        parts.push(
          (aDone ? 'T\u00e2che coch\u00e9e : ' : 'T\u00e2che d\u00e9coch\u00e9e : ') +
            quoteText(a.text)
        );
        return;
      }
      var bp = Number(b.progress);
      var ap = Number(a.progress);
      if (isFinite(bp) && isFinite(ap) && bp !== ap) {
        parts.push(
          'T\u00e2che ' +
            quoteText(a.text, 28) +
            ' : ' +
            bp +
            '\u00a0% \u2192 ' +
            ap +
            '\u00a0%'
        );
      }
    });

    if (!bItems.length && !aItems.length) {
      var bProg = before && before.progress != null ? Number(before.progress) : null;
      var aProg = after && after.progress != null ? Number(after.progress) : null;
      if (isFinite(bProg) && isFinite(aProg) && bProg !== aProg) {
        parts.push('Progr\u00e8s : ' + bProg + '\u00a0% \u2192 ' + aProg + '\u00a0%');
      }
    }

    if (!parts.length) parts.push('Progr\u00e8s modifi\u00e9');
    return parts;
  }

  function describeBlocked(bp, ap) {
    var bReasons = Array.isArray(bp.blockedReasons) ? bp.blockedReasons : [];
    var aReasons = Array.isArray(ap.blockedReasons) ? ap.blockedReasons : [];
    if (!deepEqual(bReasons, aReasons)) {
      if (!bReasons.length && aReasons.length) {
        return 'Motif de blocage : ' + quoteText(aReasons[0], 40);
      }
      if (bReasons.length && !aReasons.length) {
        return 'Motifs de blocage effac\u00e9s';
      }
      if (aReasons.length) {
        return 'Motif de blocage : ' + quoteText(aReasons.join(', '), 40);
      }
    }
    if (!deepEqual(bp.blockedLinks, ap.blockedLinks)) {
      return 'Lien de blocage modifi\u00e9';
    }
    return '';
  }

  function buildLabel(before, after, domains, hint) {
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
        parts.push(
          '\u00c9ch\u00e9ance : ' +
            formatDueFr(bp.dueDate, bp.dueTime) +
            ' \u2192 ' +
            formatDueFr(ap.dueDate, ap.dueTime)
        );
      }
      var blockedLabel = describeBlocked(bp, ap);
      if (blockedLabel) parts.push(blockedLabel);
      if (bp.estimatedDurationMinutes !== ap.estimatedDurationMinutes) {
        parts.push(
          'Dur\u00e9e : ' +
            formatMinutesFr(bp.estimatedDurationMinutes) +
            ' \u2192 ' +
            formatMinutesFr(ap.estimatedDurationMinutes)
        );
      }
      if (!parts.length) parts.push('Priorit\u00e9');
    }

    if (d.indexOf('completion') !== -1) {
      parts = parts.concat(
        describeCompletion(
          (before && before.completion) || {},
          (after && after.completion) || {}
        )
      );
    }

    if (d.indexOf('statut') !== -1) {
      var bs = (before && before.statut) || {};
      var as_ = (after && after.statut) || {};
      if (String(bs.listId || '') !== String(as_.listId || '')) {
        var fromList = bs.listName || 'liste inconnue';
        var toList = as_.listName || 'liste inconnue';
        parts.push('Liste : ' + fromList + ' \u2192 ' + toList);
      }
      if (!!bs.dueComplete !== !!as_.dueComplete) {
        parts.push(
          as_.dueComplete ? 'Carte marqu\u00e9e termin\u00e9e' : 'Carte rouverte'
        );
      }
      if (
        String(bs.listId || '') === String(as_.listId || '') &&
        !!bs.dueComplete === !!as_.dueComplete
      ) {
        parts.push('Statut modifi\u00e9');
      }
    }

    if (d.indexOf('info') !== -1) {
      var bInfo = (before && before.info) || {};
      var aInfo = (after && after.info) || {};
      if (bInfo.name !== aInfo.name) {
        parts.push(
          'Titre : ' +
            quoteText(bInfo.name, 28) +
            ' \u2192 ' +
            quoteText(aInfo.name, 28)
        );
      }
      if (bInfo.desc !== aInfo.desc) {
        var bDesc = String(bInfo.desc || '').trim();
        var aDesc = String(aInfo.desc || '').trim();
        if (!bDesc && aDesc) {
          parts.push('Description ajout\u00e9e : ' + quoteText(aDesc, 40));
        } else if (bDesc && !aDesc) {
          parts.push('Description effac\u00e9e');
        } else {
          parts.push(
            'Description : ' +
              quoteText(bDesc, 24) +
              ' \u2192 ' +
              quoteText(aDesc, 24)
          );
        }
      }
      if (!deepEqual(bInfo.memberIds, aInfo.memberIds)) {
        var mem = idDiffLabels(
          bInfo.memberIds,
          aInfo.memberIds,
          bInfo.members,
          aInfo.members
        );
        mem.added.forEach(function (n) {
          parts.push('Membre ajout\u00e9 : ' + n);
        });
        mem.removed.forEach(function (n) {
          parts.push('Membre retir\u00e9 : ' + n);
        });
        if (!mem.added.length && !mem.removed.length) {
          parts.push('Membres modifi\u00e9s');
        }
      }
      if (!deepEqual(bInfo.labelIds, aInfo.labelIds)) {
        var lab = idDiffLabels(
          bInfo.labelIds,
          aInfo.labelIds,
          bInfo.labels,
          aInfo.labels
        );
        lab.added.forEach(function (n) {
          parts.push('\u00c9tiquette ajout\u00e9e : ' + quoteText(n, 28));
        });
        lab.removed.forEach(function (n) {
          parts.push('\u00c9tiquette retir\u00e9e : ' + quoteText(n, 28));
        });
        if (!lab.added.length && !lab.removed.length) {
          parts.push('\u00c9tiquettes modifi\u00e9es');
        }
      }
      if (!parts.length) parts.push('Information');
    }

    if (d.indexOf('goals') !== -1) {
      var bg = (before && before.goals) || {};
      var ag = (after && after.goals) || {};
      var fromProj = bg.projectName || (bg.projectId ? 'projet' : 'aucun');
      var toProj = ag.projectName || (ag.projectId ? 'projet' : 'aucun');
      if (!bg.projectId && ag.projectId) {
        parts.push('Projet li\u00e9 : ' + toProj);
      } else if (bg.projectId && !ag.projectId) {
        parts.push('Projet d\u00e9li\u00e9 : ' + fromProj);
      } else {
        parts.push('Projet : ' + fromProj + ' \u2192 ' + toProj);
      }
    }

    if (!parts.length) {
      if (typeof hint === 'string' && hint.trim()) return hint.trim().slice(0, LABEL_MAX);
      return 'Modification';
    }

    // Prefer concrete diffs; ignore vague generic hints.
    var label = parts.slice(0, 2).join(' · ');
    return label.slice(0, LABEL_MAX);
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
