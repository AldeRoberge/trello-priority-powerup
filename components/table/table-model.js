/*
 * Role: pure data helpers for the Table view (spreadsheet-like grid of the board's cards).
 * No Trello / DOM access here so it can be unit-tested (test/table-model.test.js).
 * Column keys match workers/trello-sheet-sync/src/columns.js so the Table and the Google Sheet
 * share one column configuration.
 */
(function (global) {
  'use strict';

  // kind: text | longtext | list | number | date | link ; editable: written back to Trello.
  var COLUMNS = {
    category: { header: 'Catégorie', kind: 'text', editable: true, width: 200 },
    name: { header: 'Objet', kind: 'text', editable: true, width: 380 },
    statut: { header: 'Statut', kind: 'list', editable: true, width: 140 },
    urgency: { header: 'Urgence', kind: 'text', editable: false, width: 110 },
    impact: { header: 'Impact et besoin', kind: 'number', editable: false, width: 120 },
    priority: { header: 'Priorité', kind: 'number', editable: false, width: 90, heat: 10 },
    tier: { header: 'Palier', kind: 'text', editable: false, width: 110 },
    progress: { header: 'Progrès', kind: 'number', editable: false, width: 90, heat: 100 },
    desc: { header: 'Description', kind: 'longtext', editable: true, width: 380 },
    due: { header: 'Échéance', kind: 'date', editable: false, width: 110 },
    link: { header: 'Carte', kind: 'link', editable: false, width: 90 },
  };

  var DEFAULT_COLUMNS = [
    'category', 'name', 'statut', 'urgency', 'impact', 'priority', 'progress', 'desc', 'due', 'link',
  ];

  var URGENCY_LABELS = {
    aucun: 'Aucun',
    bientot: 'Bientôt',
    'assez-vite': 'Assez vite',
    vite: 'Vite',
    'au-plus-vite': 'Au plus vite',
  };

  function normalizeColumns(input) {
    var list = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var key = String(list[i]).trim();
      if (COLUMNS[key] && !seen[key]) {
        seen[key] = true;
        out.push(key);
      }
    }
    return out.length ? out : DEFAULT_COLUMNS.slice();
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function splitVisible(desc) {
    var dm = global.DescMeta;
    if (dm && typeof dm.splitDesc === 'function') return dm.splitDesc(desc).visible;
    return String(desc || '');
  }

  /** One grid row from a GanttTrello.loadBoard record (+ optional Catégorie value). */
  function rowFromRecord(rec, category) {
    var inputs = rec.inputs || {};
    var enabled = rec.priorityEnabled !== false;
    return {
      id: rec.id,
      listId: rec.listId || '',
      pos: typeof rec.pos === 'number' ? rec.pos : 0,
      fullDesc: rec.desc || '',
      category: category || '',
      name: rec.name || '',
      statut: rec.listName || '',
      urgency: enabled && inputs.empressement ? URGENCY_LABELS[inputs.empressement] || '' : '',
      impact: enabled && typeof inputs.impact === 'number' ? inputs.impact : null,
      priority: enabled && typeof rec.priorityScore === 'number' ? round1(rec.priorityScore) : null,
      tier: enabled ? rec.priorityLabel || '' : '',
      progress: typeof rec.progress === 'number' ? Math.round(rec.progress) : null,
      desc: splitVisible(rec.desc),
      due: rec.dueDate || '',
      link: rec.url || '',
    };
  }

  function cellText(row, key) {
    var v = row[key];
    if (v == null) return '';
    if (key === 'progress' && typeof v === 'number') return v + '%';
    return String(v);
  }

  function compareRows(a, b, key) {
    var av = a[key];
    var bv = b[key];
    var ae = av == null || av === '';
    var be = bv == null || bv === '';
    if (ae && be) return 0;
    if (ae) return 1; // empties always last
    if (be) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av).localeCompare(String(bv), 'fr', { sensitivity: 'base', numeric: true });
  }

  function sortRows(rows, key, dir) {
    if (!key || !COLUMNS[key]) return rows.slice();
    var sign = dir === 'desc' ? -1 : 1;
    return rows
      .map(function (r, i) {
        return { r: r, i: i };
      })
      .sort(function (x, y) {
        var av = x.r[key];
        var bv = y.r[key];
        var emptyA = av == null || av === '';
        var emptyB = bv == null || bv === '';
        if (emptyA !== emptyB) return emptyA ? 1 : -1; // keep empties last in both directions
        return sign * compareRows(x.r, y.r, key) || x.i - y.i;
      })
      .map(function (x) {
        return x.r;
      });
  }

  function filterRows(rows, text) {
    var q = String(text || '').trim().toLowerCase();
    if (!q) return rows.slice();
    return rows.filter(function (r) {
      return ['category', 'name', 'statut', 'tier', 'desc'].some(function (k) {
        return String(r[k] || '').toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  /** Board order: lists left to right, then card position within the list. */
  function orderByLists(rows, lists) {
    var rank = {};
    (lists || []).forEach(function (l, i) {
      rank[l.id] = i;
    });
    return rows
      .map(function (r, i) {
        return { r: r, i: i };
      })
      .sort(function (a, b) {
        var ra = rank[a.r.listId] == null ? 1e9 : rank[a.r.listId];
        var rb = rank[b.r.listId] == null ? 1e9 : rank[b.r.listId];
        return ra - rb || a.r.pos - b.r.pos || a.i - b.i;
      })
      .map(function (x) {
        return x.r;
      });
  }

  /**
   * Trello `pos` for a card dropped at `index` among `siblings` (the target list's other cards,
   * sorted by pos, without the moved card).
   */
  function dropPos(siblings, index) {
    var prev = index > 0 && siblings[index - 1] ? siblings[index - 1].pos : null;
    var next = index < siblings.length && siblings[index] ? siblings[index].pos : null;
    if (prev == null && next == null) return 65536;
    if (prev == null) return next / 2;
    if (next == null) return prev + 65536;
    return (prev + next) / 2;
  }

  /** Payload for POST /push on the Worker: only what the browser can compute. */
  function pushPayload(rows) {
    return {
      cards: rows.map(function (r) {
        return {
          id: r.id,
          urgency: r.urgency || '',
          impact: r.impact == null ? '' : r.impact,
          priority: r.priority == null ? '' : r.priority,
          tier: r.tier || '',
          progress: r.progress == null ? '' : r.progress,
        };
      }),
    };
  }

  /** Decodes the code printed by scripts/setup-sheet-sync.ps1. Returns null when invalid. */
  function parseConnectionCode(code) {
    try {
      var clean = String(code || '').replace(/\s+/g, '');
      var bin = typeof atob === 'function' ? atob(clean) : Buffer.from(clean, 'base64').toString('binary');
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var data = JSON.parse(new TextDecoder('utf-8').decode(bytes));
      if (!data || data.v !== 1 || !/^https:\/\//.test(data.workerUrl || '') || !data.secret) return null;
      return {
        workerUrl: String(data.workerUrl).replace(/\/+$/, ''),
        secret: String(data.secret),
        sheetUrl: /^https:\/\/docs\.google\.com\//.test(data.sheetUrl || '') ? data.sheetUrl : '',
      };
    } catch (e) {
      return null;
    }
  }

  global.TableModel = {
    COLUMNS: COLUMNS,
    DEFAULT_COLUMNS: DEFAULT_COLUMNS,
    normalizeColumns: normalizeColumns,
    rowFromRecord: rowFromRecord,
    cellText: cellText,
    sortRows: sortRows,
    filterRows: filterRows,
    orderByLists: orderByLists,
    dropPos: dropPos,
    pushPayload: pushPayload,
    parseConnectionCode: parseConnectionCode,
  };
})(typeof window !== 'undefined' ? window : this);
