/**
 * Canonical Power-Up capability checklist for Trello admin configuration.
 * Used by the connector (runtime probes) and Paramètres → Débogage (developer UI).
 * Exposes window.PowerUpCapabilities (no bundler).
 */
(function (global) {
  'use strict';

  var ADMIN_URL = 'https://trello.com/power-ups/admin';
  var STORAGE_KEY = 'capabilityProbe';
  /** Do not rewrite member storage more often than this per capability. */
  var PERSIST_MIN_MS = 60 * 60 * 1000;

  /**
   * Capabilities that must be enabled in Power-Up admin.
   * `how` = how a developer confirms the handler is actually being called.
   */
  var REQUIRED = [
    {
      id: 'card-badges',
      label: 'Badges face de carte',
      how: 'Ouvrir le tableau — pastille de priorité sur les cartes.',
    },
    {
      id: 'card-detail-badges',
      label: 'Badges dos de carte',
      how: 'Ouvrir une carte — badges Priorité / Progrès (clic → éditeur).',
    },
    {
      id: 'card-back-section',
      label: 'Section dos de carte',
      how: 'Ouvrir une carte — section Cerveau et ouverture auto du modal.',
    },
    {
      id: 'board-buttons',
      label: 'Boutons du tableau',
      how: 'Menu du tableau — Paramètres du Cerveau / Assistant / Gantt.',
    },
    {
      id: 'list-sorters',
      label: 'Tris de liste',
      how: 'Menu … d’une liste → Trier par… → Priorité.',
    },
    {
      id: 'on-enable',
      label: 'À l’activation',
      how: 'Retirer puis réajouter le Power-Up — modal d’accueil.',
    },
  ];

  /**
   * Handlers exist only to avoid console errors if left checked by mistake.
   * Keep these OFF in admin.
   */
  var STUBS = [
    {
      id: 'card-buttons',
      label: 'Boutons de carte',
      how: 'Ne pas cocher — l’éditeur s’ouvre via les badges / la section.',
    },
    {
      id: 'list-actions',
      label: 'Actions de liste',
      how: 'Ne pas cocher — le tri passe par list-sorters.',
    },
    {
      id: 'on-disable',
      label: 'À la désactivation',
      how: 'Ne pas cocher — aucun nettoyage requis.',
    },
  ];

  var memorySeenAt = Object.create(null);
  var probeCache = null;
  var probeLoad = null;
  var persistTimers = Object.create(null);

  function dbg() {
    return global.TpDebug || null;
  }

  function knownIds() {
    var ids = Object.create(null);
    REQUIRED.forEach(function (c) {
      ids[c.id] = 'required';
    });
    STUBS.forEach(function (c) {
      ids[c.id] = 'stub';
    });
    return ids;
  }

  function findEntry(id) {
    var i;
    for (i = 0; i < REQUIRED.length; i++) {
      if (REQUIRED[i].id === id) return { kind: 'required', entry: REQUIRED[i] };
    }
    for (i = 0; i < STUBS.length; i++) {
      if (STUBS[i].id === id) return { kind: 'stub', entry: STUBS[i] };
    }
    return null;
  }

  function normalizeProbe(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (id) {
      var row = raw[id];
      if (!row || typeof row !== 'object') return;
      var at = typeof row.at === 'string' ? row.at : '';
      if (!at || Number.isNaN(Date.parse(at))) return;
      out[id] = { at: at };
    });
    return out;
  }

  function loadProbe(t) {
    if (!t || typeof t.get !== 'function') {
      return Promise.resolve(normalizeProbe(probeCache));
    }
    if (probeLoad) return probeLoad;
    probeLoad = Promise.resolve()
      .then(function () {
        return t.get('member', 'private', STORAGE_KEY);
      })
      .then(function (stored) {
        probeCache = normalizeProbe(stored);
        return probeCache;
      })
      .catch(function () {
        probeCache = probeCache || {};
        return probeCache;
      })
      .then(function (probe) {
        probeLoad = null;
        return probe;
      });
    return probeLoad;
  }

  function persistProbe(t, probe) {
    if (!t || typeof t.set !== 'function') return Promise.resolve(probe);
    probeCache = normalizeProbe(probe);
    return Promise.resolve()
      .then(function () {
        return t.set('member', 'private', STORAGE_KEY, probeCache);
      })
      .then(function () {
        return probeCache;
      })
      .catch(function (err) {
        var d = dbg();
        if (d && d.error) d.error('capabilities', 'probe.persist', err);
        return probeCache;
      });
  }

  /**
   * Record that Trello invoked a capability handler (admin toggle is ON).
   * Debounced per capability to avoid write storms from badge polling.
   */
  function markSeen(t, capabilityId) {
    var id = typeof capabilityId === 'string' ? capabilityId : '';
    if (!id || !findEntry(id)) return Promise.resolve(null);

    var nowMs = Date.now();
    var nowIso = new Date(nowMs).toISOString();
    memorySeenAt[id] = nowIso;

    return loadProbe(t).then(function (probe) {
      var prev = probe[id];
      var prevMs = prev && prev.at ? Date.parse(prev.at) : 0;
      if (prevMs && nowMs - prevMs < PERSIST_MIN_MS) {
        return probe;
      }
      var next = Object.assign({}, probe);
      next[id] = { at: nowIso };
      // Collapse concurrent badge refreshes into one write.
      if (persistTimers[id]) return next;
      persistTimers[id] = true;
      return persistProbe(t, next).then(function (saved) {
        persistTimers[id] = false;
        var d = dbg();
        if (d && d.log) d.log('capabilities', 'probe.seen', { id: id });
        return saved;
      });
    });
  }

  function formatRelative(iso, nowMs) {
    var ms = Date.parse(iso);
    if (Number.isNaN(ms)) return '';
    var delta = Math.max(0, (nowMs || Date.now()) - ms);
    var sec = Math.floor(delta / 1000);
    if (sec < 60) return 'à l’instant';
    var min = Math.floor(sec / 60);
    if (min < 60) return 'il y a ' + min + ' min';
    var hr = Math.floor(min / 60);
    if (hr < 48) return 'il y a ' + hr + ' h';
    var days = Math.floor(hr / 24);
    return 'il y a ' + days + ' j';
  }

  /**
   * @returns {{ id, kind, label, how, expectedOn, seen, seenAt, relative, status, statusLabel, tone }}
   * status: ok | missing | stub-hit | idle-stub
   */
  function evaluate(capabilityId, probe, options) {
    options = options || {};
    var nowMs = options.nowMs || Date.now();
    var found = findEntry(capabilityId);
    if (!found) return null;
    var probeRow =
      (probe && probe[capabilityId]) ||
      (memorySeenAt[capabilityId] ? { at: memorySeenAt[capabilityId] } : null);
    var seenAt = probeRow && probeRow.at ? probeRow.at : '';
    var seen = !!seenAt;
    var expectedOn = found.kind === 'required';
    var status;
    var statusLabel;
    var tone;
    if (expectedOn) {
      if (seen) {
        status = 'ok';
        statusLabel = 'Observée (' + formatRelative(seenAt, nowMs) + ')';
        tone = 'ok';
      } else {
        status = 'missing';
        statusLabel = 'Pas encore observée — cocher dans l’admin';
        tone = 'warn';
      }
    } else if (seen) {
      status = 'stub-hit';
      statusLabel = 'Appelée — décochez dans l’admin';
      tone = 'error';
    } else {
      status = 'idle-stub';
      statusLabel = 'Correctement inactive';
      tone = 'ok';
    }
    return {
      id: found.entry.id,
      kind: found.kind,
      label: found.entry.label,
      how: found.entry.how,
      expectedOn: expectedOn,
      seen: seen,
      seenAt: seenAt,
      relative: seenAt ? formatRelative(seenAt, nowMs) : '',
      status: status,
      statusLabel: statusLabel,
      tone: tone,
    };
  }

  function evaluateAll(probe, options) {
    var rows = [];
    REQUIRED.forEach(function (c) {
      rows.push(evaluate(c.id, probe, options));
    });
    STUBS.forEach(function (c) {
      rows.push(evaluate(c.id, probe, options));
    });
    return rows;
  }

  function summarize(rows) {
    var required = rows.filter(function (r) {
      return r && r.kind === 'required';
    });
    var stubs = rows.filter(function (r) {
      return r && r.kind === 'stub';
    });
    var requiredSeen = required.filter(function (r) {
      return r.seen;
    }).length;
    var stubHits = stubs.filter(function (r) {
      return r.seen;
    }).length;
    var missing = required.length - requiredSeen;
    var ok = missing === 0 && stubHits === 0;
    var parts = [
      requiredSeen + '/' + required.length + ' capacités requises observées',
    ];
    if (stubHits > 0) {
      parts.push(stubHits + ' stub(s) à décocher');
    }
    return {
      ok: ok,
      requiredTotal: required.length,
      requiredSeen: requiredSeen,
      missing: missing,
      stubHits: stubHits,
      label: parts.join(' · '),
    };
  }

  function requiredIds() {
    return REQUIRED.map(function (c) {
      return c.id;
    });
  }

  function stubIds() {
    return STUBS.map(function (c) {
      return c.id;
    });
  }

  /** Reset in-memory cache (tests). */
  function _resetForTests() {
    memorySeenAt = Object.create(null);
    probeCache = null;
    probeLoad = null;
    persistTimers = Object.create(null);
  }

  global.PowerUpCapabilities = {
    ADMIN_URL: ADMIN_URL,
    STORAGE_KEY: STORAGE_KEY,
    REQUIRED: REQUIRED,
    STUBS: STUBS,
    knownIds: knownIds,
    findEntry: findEntry,
    normalizeProbe: normalizeProbe,
    loadProbe: loadProbe,
    markSeen: markSeen,
    formatRelative: formatRelative,
    evaluate: evaluate,
    evaluateAll: evaluateAll,
    summarize: summarize,
    requiredIds: requiredIds,
    stubIds: stubIds,
    _resetForTests: _resetForTests,
  };
})(typeof window !== 'undefined' ? window : this);
