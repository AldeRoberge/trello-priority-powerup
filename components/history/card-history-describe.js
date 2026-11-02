/**
 * card-history: part 2 of 2 (describeCompletion).
 * Names are shared with the other parts through window.CardHistoryParts (see card-history.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.CardHistoryParts = global.CardHistoryParts || {});

  // from earlier parts (values)
  var HISTORY_KEY = S.HISTORY_KEY;
  var LABEL_MAX = S.LABEL_MAX;
  var MAX_SERIALIZED = S.MAX_SERIALIZED;
  var PLUGIN_PRIVATE_BUDGET = S.PLUGIN_PRIVATE_BUDGET;

  // from other parts (functions, resolved at call time)
  function axisLabel() { return S.axisLabel.apply(this, arguments); }
  function changedDomains() { return S.changedDomains.apply(this, arguments); }
  function clone() { return S.clone.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function deepEqual() { return S.deepEqual.apply(this, arguments); }
  function describeDueChange() { return S.describeDueChange.apply(this, arguments); }
  function describeRecurrenceChange() { return S.describeRecurrenceChange.apply(this, arguments); }
  function describeStartChange() { return S.describeStartChange.apply(this, arguments); }
  function emptyStore() { return S.emptyStore.apply(this, arguments); }
  function formatMinutesFr() { return S.formatMinutesFr.apply(this, arguments); }
  function fullText() { return S.fullText.apply(this, arguments); }
  function idDiffLabels() { return S.idDiffLabels.apply(this, arguments); }
  function itemMap() { return S.itemMap.apply(this, arguments); }
  function itemProgressPercent() { return S.itemProgressPercent.apply(this, arguments); }
  function makeId() { return S.makeId.apply(this, arguments); }
  function normalizeStore() { return S.normalizeStore.apply(this, arguments); }
  function overallCompletionPercent() { return S.overallCompletionPercent.apply(this, arguments); }
  function pickDomains() { return S.pickDomains.apply(this, arguments); }
  function quoteText() { return S.quoteText.apply(this, arguments); }
  function serializedSize() { return S.serializedSize.apply(this, arguments); }
  function trimStore() { return S.trimStore.apply(this, arguments); }
  function trimStoreToBudget() { return S.trimStoreToBudget.apply(this, arguments); }

  function describeCompletion(before, after, quoteMax) {
    quoteMax = quoteMax == null ? 36 : quoteMax;
    var renameMax = quoteMax > 0 ? Math.min(quoteMax, 48) : 0;
    var bItems = (before && before.items) || [];
    var aItems = (after && after.items) || [];
    var bMap = itemMap(bItems);
    var aMap = itemMap(aItems);
    var parts = [];
    var bPct = overallCompletionPercent(before);
    var aPct = overallCompletionPercent(after);

    Object.keys(aMap).forEach(function (id) {
      if (!bMap[id]) {
        parts.push(
          'T\u00e2che ajout\u00e9e : ' +
            quoteText(aMap[id].text, quoteMax) +
            ' (' +
            itemProgressPercent(aMap[id]) +
            '\u00a0%)'
        );
      }
    });
    Object.keys(bMap).forEach(function (id) {
      if (!aMap[id]) {
        parts.push(
          'T\u00e2che supprim\u00e9e : ' +
            quoteText(bMap[id].text, quoteMax) +
            ' (' +
            itemProgressPercent(bMap[id]) +
            '\u00a0%)'
        );
      }
    });
    Object.keys(aMap).forEach(function (id) {
      if (!bMap[id]) return;
      var b = bMap[id];
      var a = aMap[id];
      if ((b.text || '') !== (a.text || '')) {
        parts.push(
          'T\u00e2che renomm\u00e9e : ' +
            quoteText(b.text, renameMax || 24) +
            ' \u2192 ' +
            quoteText(a.text, renameMax || 24)
        );
      }
      var bp = itemProgressPercent(b);
      var ap = itemProgressPercent(a);
      if (bp !== ap) {
        if ((bp < 100 && ap >= 100) || (!b.done && a.done && ap >= 100)) {
          parts.push(
            'T\u00e2che coch\u00e9e : ' + quoteText(a.text || b.text, quoteMax)
          );
        } else if ((bp >= 100 && ap < 100) || (b.done && !a.done && bp >= 100)) {
          parts.push(
            'T\u00e2che d\u00e9coch\u00e9e : ' +
              quoteText(a.text || b.text, quoteMax) +
              ' (' +
              ap +
              '\u00a0%)'
          );
        } else {
          parts.push(
            'T\u00e2che ' +
              quoteText(a.text || b.text, renameMax || 28) +
              ' : ' +
              bp +
              '\u00a0% \u2192 ' +
              ap +
              '\u00a0%'
          );
        }
      }
      var bEst = b.estimatedMinutes;
      var aEst = a.estimatedMinutes;
      if (bEst !== aEst && (bEst != null || aEst != null)) {
        parts.push(
          'Dur\u00e9e ' +
            quoteText(a.text || b.text, renameMax || 28) +
            ' : ' +
            formatMinutesFr(bEst) +
            ' \u2192 ' +
            formatMinutesFr(aEst)
        );
      }
    });

    if (bPct !== aPct) {
      parts.push('Progr\u00e8s global : ' + bPct + '\u00a0% \u2192 ' + aPct + '\u00a0%');
    }

    if (bItems.length !== aItems.length && !parts.length) {
      parts.push(
        'Nombre de t\u00e2ches : ' + bItems.length + ' \u2192 ' + aItems.length
      );
    }

    // Detect reorder when membership unchanged.
    if (
      bItems.length > 1 &&
      bItems.length === aItems.length &&
      Object.keys(bMap).length === Object.keys(aMap).length
    ) {
      var sameMembership = Object.keys(bMap).every(function (id) {
        return !!aMap[id];
      });
      if (sameMembership) {
        var orderChanged = bItems.some(function (item, idx) {
          return !aItems[idx] || String(aItems[idx].id) !== String(item.id);
        });
        if (orderChanged) {
          parts.push('Ordre des t\u00e2ches modifi\u00e9');
        }
      }
    }

    var bOff = before && before.estimatedMinutesOffset;
    var aOff = after && after.estimatedMinutesOffset;
    if (bOff !== aOff && (bOff != null || aOff != null)) {
      parts.push(
        'Ajustement de dur\u00e9e : ' +
          formatMinutesFr(bOff) +
          ' \u2192 ' +
          formatMinutesFr(aOff)
      );
    }

    var bCardEst = before && before.estimatedMinutes;
    var aCardEst = after && after.estimatedMinutes;
    if (
      !bItems.length &&
      !aItems.length &&
      bCardEst !== aCardEst &&
      (bCardEst != null || aCardEst != null)
    ) {
      parts.push(
        'Dur\u00e9e estim\u00e9e : ' +
          formatMinutesFr(bCardEst) +
          ' \u2192 ' +
          formatMinutesFr(aCardEst)
      );
    }

    if (!parts.length) {
      parts.push(
        'Progr\u00e8s : ' +
          bItems.length +
          ' t\u00e2che' +
          (bItems.length === 1 ? '' : 's') +
          ' \u00b7 ' +
          bPct +
          '\u00a0% \u2192 ' +
          aItems.length +
          ' t\u00e2che' +
          (aItems.length === 1 ? '' : 's') +
          ' \u00b7 ' +
          aPct +
          '\u00a0%'
      );
    }
    return parts;
  }

  function describeBlocked(bp, ap, quoteMax) {
    quoteMax = quoteMax == null ? 40 : quoteMax;
    var bReasons = Array.isArray(bp.blockedReasons) ? bp.blockedReasons : [];
    var aReasons = Array.isArray(ap.blockedReasons) ? ap.blockedReasons : [];
    if (!deepEqual(bReasons, aReasons)) {
      if (!bReasons.length && aReasons.length) {
        return 'Cause de blocage : ' + quoteText(aReasons[0], quoteMax);
      }
      if (bReasons.length && !aReasons.length) {
        return 'Causes de blocage effac\u00e9es';
      }
      if (aReasons.length) {
        return 'Cause de blocage : ' + quoteText(aReasons.join(', '), quoteMax);
      }
    }
    if (!deepEqual(bp.blockedLinks, ap.blockedLinks)) {
      return 'Lien de blocage modifi\u00e9';
    }
    return '';
  }

  /**
   * Collect human-readable change lines.
   * @param {object} [options]
   * @param {boolean} [options.detail] — full text, no truncation
   */
  function collectChangeParts(before, after, domains, options) {
    options = options || {};
    var detail = !!options.detail;
    var quoteMax = detail ? 0 : 36;
    var titleMax = detail ? 0 : 28;
    var parts = [];
    var d = domains || [];

    if (d.indexOf('priority') !== -1) {
      var bp = (before && before.priority) || {};
      var ap = (after && after.priority) || {};
      var bEnabled = bp.priorityEnabled !== false;
      var aEnabled = ap.priorityEnabled !== false;
      if (bEnabled !== aEnabled) {
        parts.push(aEnabled ? 'Priorit\u00e9 activ\u00e9e' : 'Priorit\u00e9 d\u00e9sactiv\u00e9e');
      }
      ['urgency', 'impact', 'ease'].forEach(function (axis) {
        if (bp[axis] !== ap[axis]) {
          var feminine = axis === 'urgency' || axis === 'ease';
          parts.push(
            axisLabel(axis) +
              ' pass\u00e9' +
              (feminine ? 'e' : '') +
              ' de ' +
              bp[axis] +
              ' \u00e0 ' +
              ap[axis]
          );
        }
      });
      if (!!bp.enAttente !== !!ap.enAttente) {
        parts.push(ap.enAttente ? 'Bloqu\u00e9 activ\u00e9' : 'Bloqu\u00e9 d\u00e9sactiv\u00e9');
      }
      if (bp.dueDate !== ap.dueDate || bp.dueTime !== ap.dueTime) {
        parts.push(
          describeDueChange(bp.dueDate, bp.dueTime, ap.dueDate, ap.dueTime)
        );
      }
      var startLabel = describeStartChange(bp.startDate, ap.startDate);
      if (startLabel) parts.push(startLabel);
      var recurLabel = describeRecurrenceChange(bp.recurrence, ap.recurrence);
      if (recurLabel) parts.push(recurLabel);
      var blockedLabel = describeBlocked(bp, ap, detail ? 0 : 40);
      if (blockedLabel) parts.push(blockedLabel);
      if (bp.estimatedDurationMinutes !== ap.estimatedDurationMinutes) {
        parts.push(
          'Dur\u00e9e : ' +
            formatMinutesFr(bp.estimatedDurationMinutes) +
            ' \u2192 ' +
            formatMinutesFr(ap.estimatedDurationMinutes)
        );
      }
      if (!parts.length) parts.push('Priorit\u00e9 modifi\u00e9e');
    }

    if (d.indexOf('completion') !== -1) {
      parts = parts.concat(
        describeCompletion(
          (before && before.completion) || {},
          (after && after.completion) || {},
          quoteMax
        )
      );
    }

    if (d.indexOf('statut') !== -1) {
      var bs = (before && before.statut) || {};
      var as_ = (after && after.statut) || {};
      if (String(bs.listId || '') !== String(as_.listId || '')) {
        var fromList = bs.listName || 'liste inconnue';
        var toList = as_.listName || 'liste inconnue';
        parts.push('D\u00e9plac\u00e9e de ' + fromList + ' vers ' + toList);
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
            quoteText(bInfo.name, titleMax) +
            ' \u2192 ' +
            quoteText(aInfo.name, titleMax)
        );
      }
      if (bInfo.desc !== aInfo.desc) {
        var bDesc = fullText(bInfo.desc);
        var aDesc = fullText(aInfo.desc);
        if (detail) {
          if (!bDesc && aDesc) {
            parts.push('Description ajout\u00e9e');
            parts.push('Apr\u00e8s : ' + aDesc);
          } else if (bDesc && !aDesc) {
            parts.push('Description effac\u00e9e');
            parts.push('Avant : ' + bDesc);
          } else {
            parts.push('Description modifi\u00e9e');
            parts.push('Avant : ' + bDesc);
            parts.push('Apr\u00e8s : ' + aDesc);
          }
        } else if (!bDesc && aDesc) {
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
          parts.push('\u00c9tiquette ajout\u00e9e : ' + quoteText(n, titleMax || 28));
        });
        lab.removed.forEach(function (n) {
          parts.push('\u00c9tiquette retir\u00e9e : ' + quoteText(n, titleMax || 28));
        });
        if (!lab.added.length && !lab.removed.length) {
          parts.push('\u00c9tiquettes modifi\u00e9es');
        }
      }
      if (!parts.length) parts.push('D\u00e9tails modifi\u00e9s');
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

    return parts;
  }

  function buildLabel(before, after, domains, hint) {
    var parts = collectChangeParts(before, after, domains, { detail: false });
    if (!parts.length) {
      if (typeof hint === 'string' && hint.trim()) return hint.trim().slice(0, LABEL_MAX);
      return 'Modification';
    }
    return parts.slice(0, 2).join(' · ').slice(0, LABEL_MAX);
  }

  function formatAbsoluteTime(iso) {
    if (!iso) return '';
    var then = Date.parse(iso);
    if (!isFinite(then)) return String(iso);
    try {
      return new Date(then).toLocaleString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return String(iso);
    }
  }

  var DOMAIN_LABELS = {
    priority: 'Priorit\u00e9',
    completion: 'Progr\u00e8s',
    statut: 'Statut',
    info: 'Détails',
    goals: 'Objectifs'
  };

  function describeEntry(entry) {
    if (!entry) return null;
    var domains = Array.isArray(entry.domains)
      ? entry.domains
      : changedDomains(entry.before, entry.after);
    var lines = collectChangeParts(entry.before, entry.after, domains, {
      detail: true
    });
    if (!lines.length) lines = [entry.label || 'Modification'];
    return {
      id: entry.id,
      at: entry.at,
      absoluteTime: formatAbsoluteTime(entry.at),
      label: entry.label || '',
      domains: domains.slice(),
      domainLabels: domains.map(function (key) {
        return DOMAIN_LABELS[key] || key;
      }),
      lines: lines
    };
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
      var entryCountBefore = store.entries.length;
      saveChain = saveChain
        .then(function () {
          // Reserve room for other card/private keys (chat, etc.): 4096 shared.
          if (typeof t.get !== 'function') {
            return t.set('card', 'private', HISTORY_KEY, store);
          }
          return Promise.resolve(t.get('card', 'private'))
            .then(function (all) {
              var bag = all && typeof all === 'object' ? all : {};
              var others = {};
              Object.keys(bag).forEach(function (key) {
                if (key !== HISTORY_KEY) others[key] = bag[key];
              });
              var otherSize = 0;
              try {
                otherSize = JSON.stringify(others).length;
              } catch (e) {
                otherSize = 0;
              }
              var room = Math.max(
                350,
                PLUGIN_PRIVATE_BUDGET - otherSize - HISTORY_KEY.length - 24
              );
              store = trimStoreToBudget(store, Math.min(MAX_SERIALIZED, room));
              return t.set('card', 'private', HISTORY_KEY, store);
            })
            .catch(function () {
              store = trimStore(store);
              return t.set('card', 'private', HISTORY_KEY, store);
            });
        })
        .then(function () {
          dbgLog('cardHistory', 'persist', {
            entryCount: store.entries.length,
            trimmed: store.entries.length < entryCountBefore,
          });
          return store;
        })
        .catch(function (err) {
          dbgError('cardHistory', 'persist', err, { entryCount: store.entries.length });
          // Drop entries until empty — card/private is shared with chat.
          while (store.entries.length > 0) {
            store.entries.shift();
            store.cursor = Math.max(0, store.cursor - 1);
            store = trimStoreToBudget(store, Math.floor(MAX_SERIALIZED * 0.5));
            if (serializedSize(store) <= 400) break;
          }
          if (!store.entries.length) {
            store = emptyStore();
          }
          return t.set('card', 'private', HISTORY_KEY, store).catch(function (retryErr) {
            dbgError('cardHistory', 'persist.retry', retryErr);
            // Last resort: leave empty in memory so we stop thrashing.
            store = emptyStore();
          });
        });
      return saveChain;
    }

    function load() {
      if (!t || typeof t.get !== 'function') {
        store = emptyStore();
        dbgLog('cardHistory', 'load', { entryCount: 0, source: 'no-trello' });
        return Promise.resolve(store);
      }
      return t
        .get('card', 'private', HISTORY_KEY)
        .then(function (raw) {
          store = trimStore(normalizeStore(raw));
          dbgLog('cardHistory', 'load', { entryCount: store.entries.length });
          notify();
          // Rewrite slimmed history so an oversized legacy blob frees card/private room.
          if (raw != null) {
            persist();
          }
          return store;
        })
        .catch(function (err) {
          dbgError('cardHistory', 'load', err);
          store = emptyStore();
          persist();
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
      dbgLog('cardHistory', 'record', {
        domainCount: domains.length,
        domains: domains.slice(),
      });
      persist();
      notify();
      return entry;
    }

    function listEntries() {
      // Newest first for UI. Entries at/after cursor are undone (redo stack).
      return store.entries
        .map(function (e, index) {
          var details = describeEntry(e);
          var domains = Array.isArray(e.domains)
            ? e.domains
            : changedDomains(e.before, e.after);
          // Rebuild so relative day words (demain, hier…) stay current.
          var liveLabel = buildLabel(e.before, e.after, domains, e.label);
          return {
            id: e.id,
            at: e.at,
            label: liveLabel || e.label,
            domains: domains.slice(),
            details: details,
            undone: index >= store.cursor
          };
        })
        .reverse();
    }

    function getEntry(entryId) {
      if (!entryId) return null;
      for (var i = 0; i < store.entries.length; i++) {
        var e = store.entries[i];
        if (e && e.id === entryId) {
          var copied = clone(e);
          return copied != null ? copied : e;
        }
      }
      return null;
    }

    function getEntryDetails(entryId) {
      var entry = getEntry(entryId);
      if (!entry) return null;
      return describeEntry(entry) || {
        id: entryId,
        at: entry.at || '',
        absoluteTime: formatAbsoluteTime(entry.at),
        label: entry.label || 'Modification',
        domains: entry.domains || [],
        domainLabels: (entry.domains || []).map(function (key) {
          return DOMAIN_LABELS[key] || key;
        }),
        lines: entry.label ? [entry.label] : ['Modification']
      };
    }

    function canUndo() {
      return store.cursor > 0;
    }

    function canRedo() {
      return store.cursor < store.entries.length;
    }

    function undo(applySnapshot) {
      if (!canUndo()) {
        dbgLog('cardHistory', 'undo', { outcome: 'empty' });
        return Promise.resolve(null);
      }
      var entry = store.entries[store.cursor - 1];
      if (!entry) {
        dbgLog('cardHistory', 'undo', { outcome: 'empty' });
        return Promise.resolve(null);
      }
      dbgLog('cardHistory', 'undo', { outcome: 'requested' });
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
          dbgLog('cardHistory', 'undo', { outcome: 'applied' });
          notify();
          return clone(entry.before);
        })
        .finally(function () {
          endMute();
        });
    }

    function redo(applySnapshot) {
      if (!canRedo()) {
        dbgLog('cardHistory', 'redo', { outcome: 'empty' });
        return Promise.resolve(null);
      }
      var entry = store.entries[store.cursor];
      if (!entry) {
        dbgLog('cardHistory', 'redo', { outcome: 'empty' });
        return Promise.resolve(null);
      }
      dbgLog('cardHistory', 'redo', { outcome: 'requested' });
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
          dbgLog('cardHistory', 'redo', { outcome: 'applied' });
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
      var applyFn =
        typeof applySnapshot === 'function' ? applySnapshot : function () {};
      beginMute();
      // Walk newest→target so each domain slice is restored correctly, and
      // keep later entries so the user can Rétablir (redo) afterward.
      var chain = Promise.resolve();
      for (var j = store.cursor - 1; j >= idx; j--) {
        (function (stepEntry) {
          chain = chain.then(function () {
            return applyFn(clone(stepEntry.before));
          });
        })(store.entries[j]);
      }
      return chain
        .then(function () {
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

    function redoTo(entryId, applySnapshot) {
      var idx = -1;
      for (var i = store.cursor; i < store.entries.length; i++) {
        if (store.entries[i] && store.entries[i].id === entryId) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return Promise.resolve(null);
      var entry = store.entries[idx];
      var applyFn =
        typeof applySnapshot === 'function' ? applySnapshot : function () {};
      beginMute();
      var chain = Promise.resolve();
      for (var j = store.cursor; j <= idx; j++) {
        (function (stepEntry) {
          chain = chain.then(function () {
            return applyFn(clone(stepEntry.after));
          });
        })(store.entries[j]);
      }
      return chain
        .then(function () {
          store.cursor = idx + 1;
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

    return {
      HISTORY_KEY: HISTORY_KEY,
      load: load,
      record: record,
      undo: undo,
      redo: redo,
      revertTo: revertTo,
      redoTo: redoTo,
      list: listEntries,
      getEntry: getEntry,
      getEntryDetails: getEntryDetails,
      canUndo: canUndo,
      canRedo: canRedo,
      beginMute: beginMute,
      endMute: endMute,
      isMuted: isMuted,
      changedDomains: changedDomains,
      buildLabel: buildLabel,
      describeEntry: describeEntry
    };
  }

  global.CardHistory = {
    HISTORY_KEY: HISTORY_KEY,
    create: create,
    changedDomains: changedDomains,
    buildLabel: buildLabel,
    describeEntry: describeEntry,
    collectChangeParts: collectChangeParts,
    describeDueChange: describeDueChange,
    deepEqual: deepEqual,
    clone: clone
  };

  // exports
  S.DOMAIN_LABELS = DOMAIN_LABELS;
  S.buildLabel = buildLabel;
  S.collectChangeParts = collectChangeParts;
  S.create = create;
  S.describeBlocked = describeBlocked;
  S.describeCompletion = describeCompletion;
  S.describeEntry = describeEntry;
  S.formatAbsoluteTime = formatAbsoluteTime;
})(typeof window !== 'undefined' ? window : this);
