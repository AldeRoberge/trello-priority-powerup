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
    category: { header: 'Catégorie', icon: 'tag', kind: 'text', editable: true, width: 200 },
    name: { header: 'Objet', icon: 'file-text', kind: 'text', editable: true, width: 380 },
    project: { header: 'Projet', icon: 'folder', kind: 'text', editable: false, width: 180 },
    parent: { header: 'Tâche parente', icon: 'corner-left-up', kind: 'text', editable: false, width: 200 },
    statut: { header: 'Statut', icon: 'progress-check', kind: 'list', editable: true, width: 140 },
    urgency: { header: 'Urgence', icon: 'flame', kind: 'text', editable: false, width: 110 },
    priority: { header: 'Priorité', icon: 'flag', kind: 'number', editable: false, width: 105, heat: 10 },
    tier: { header: 'Palier', icon: 'stack-2', kind: 'text', editable: false, width: 110 },
    progress: { header: 'Progrès', icon: 'chart-donut', kind: 'number', editable: false, width: 110, heat: 100 },
    desc: { header: 'Description', icon: 'align-left', kind: 'longtext', editable: true, width: 380 },
    due: { header: 'Échéance', icon: 'calendar-event', kind: 'date', editable: false, width: 110 },
    link: { header: 'Carte', icon: 'external-link', kind: 'link', editable: false, width: 90 },
  };

  // Tabler icons (webfont, "ti-" prefix) per Statut category; colors come from StatutMatch.
  var STATUT_ICONS = {
    // All outlined circles so the picker reads as one family.
    triage: 'circle-arrow-down',
    backlog: 'circle-dashed',
    unstarted: 'circle',
    started: 'circle-half-2',
    blocked: 'ban',
    completed: 'circle-check',
    canceled: 'circle-x',
    _none: 'circle-dotted',
  };

  function statutIcon(key) {
    return STATUT_ICONS[key] || STATUT_ICONS._none;
  }

  var DEFAULT_COLUMNS = [
    'category', 'name', 'project', 'parent', 'statut', 'urgency', 'priority', 'progress', 'desc', 'due', 'link',
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

  /** Markdown → one readable line for a read-only cell (the editor still shows the raw text). */
  function plainMarkdown(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, '')
      .replace(/(\*\*|__|~~|\*|`)/g, '')
      .replace(/\s*\n+\s*/g, ' · ')
      .trim();
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function splitVisible(desc) {
    var dm = global.DescMeta;
    if (dm && typeof dm.splitDesc === 'function') return dm.splitDesc(desc).visible;
    return String(desc || '');
  }

  function metaGet(desc, key) {
    var dm = global.DescMeta;
    if (!dm || typeof dm.getMeta !== 'function') return '';
    return dm.getMeta(desc, key) || '';
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
      statutKey: rec.category || '',
      statutColor: rec.color || '',
      urgency: enabled && inputs.empressement ? URGENCY_LABELS[inputs.empressement] || '' : '',
      impact: enabled && typeof inputs.impact === 'number' ? inputs.impact : null,
      priority: enabled && typeof rec.priorityScore === 'number' ? round1(rec.priorityScore) : null,
      tier: enabled ? rec.priorityLabel || '' : '',
      tierI: enabled && typeof rec.priorityTierI === 'number' ? rec.priorityTierI : null,
      progress: typeof rec.progress === 'number' ? Math.round(rec.progress) : null,
      blocked: !!rec.blocked,
      desc: splitVisible(rec.desc),
      due: rec.dueDate || '',
      estimate: rec.estimatedMinutes > 0 ? Math.round(rec.estimatedMinutes) : 0,
      link: rec.url || '',
      items: Array.isArray(rec.items) ? rec.items : [],
      assignees: Array.isArray(rec.assignees) ? rec.assignees : [],
      labels: Array.isArray(rec.labels) ? rec.labels : [],
      inputs: { places: inputs.places || null, customAssignees: inputs.customAssignees || [] },
      start: rec.startDate || '',
      dueTime: rec.dueTime || '',
      dueVague: inputs.dueVague || '',
      waiting: metaGet(rec.desc, 'waiting'),
      waitingSince: metaGet(rec.desc, 'waiting-since'),
      outlookEvent: metaGet(rec.desc, 'outlook-event-id'),
    };
  }

  /**
   * Fills row.project (goal map project name) and row.parent (name of the card whose checklist links
   * this one) in place. places: { cardId: { project } } from WorkOS.places.
   */
  function withHierarchy(rows, places) {
    var parentOf = {};
    var byId = {};
    (rows || []).forEach(function (r) {
      byId[r.id] = r;
    });
    (rows || []).forEach(function (r) {
      (function walk(items) {
        (items || []).forEach(function (it) {
          if (!it) return;
          var linked = it.linkedCardId != null ? String(it.linkedCardId).trim() : '';
          if (linked && !parentOf[linked]) parentOf[linked] = r.id;
          walk(it.items);
        });
      })(r.items);
    });
    (rows || []).forEach(function (r) {
      var p = byId[parentOf[r.id]];
      r.parent = p ? p.name : '';
      var place = places && places[r.id];
      r.project = place && place.project ? place.project : '';
      r.projectId = place && place.projectId ? place.projectId : '';
      r.projectIcon = place && place.icon ? place.icon : null;
    });
    return rows;
  }

  /** A project priority is a score from 0 to 10, one decimal. Anything else is none. */
  function clampPriority(n) {
    if (typeof n !== 'number' || !isFinite(n)) return null;
    return Math.round(Math.max(0, Math.min(10, n)) * 10) / 10;
  }

  function formatPriority(n) {
    var c = clampPriority(n);
    return c == null ? '' : c.toFixed(1);
  }

  var PROJECT_TIERS = [
    { label: 'Critique', score: 9.3 },
    { label: 'Urgente', score: 7.9 },
    { label: 'Prioritaire', score: 6.5 },
    { label: 'Importante', score: 5 },
    { label: 'Flexible', score: 3.6 },
    { label: 'Secondaire', score: 2.1 },
    { label: 'Optionnelle', score: 0.7 },
  ];

  /** The seven priority levels, highest first. The board's heat scale when PriorityUI is loaded. */
  function projectTiers() {
    var ui = global.PriorityUI;
    var segs = ui && ui.HEAT_SEGMENTS;
    var list = [];
    if (segs && segs.length) {
      segs.forEach(function (s) {
        var score = clampPriority(s && Number(s.target));
        if (s && s.label && score != null) list.push({ label: s.label, score: score });
      });
    }
    if (!list.length) list = PROJECT_TIERS.slice();
    if (list.length > 1 && list[0].score < list[list.length - 1].score) list.reverse();
    return list;
  }

  /** Menu rows for a project's priority. `onSet(score|null)` writes the choice. */
  function projectPriorityItems(current, onSet) {
    var cur = clampPriority(current);
    var items = projectTiers().map(function (tier) {
      return {
        icon: 'flag',
        label: tier.label,
        hint: formatPriority(tier.score),
        checked: cur === tier.score,
        action: function () { onSet(tier.score); },
      };
    });
    if (cur != null) {
      items.push({ sep: true });
      items.push({ icon: 'flag-off', label: 'Retirer', action: function () { onSet(null); } });
    }
    return items;
  }

  /** Checklist leaves (not cards linked elsewhere). Returns whether any leaf was found. */
  function leafProgress(items, out) {
    var any = false;
    (items || []).forEach(function (it) {
      if (!it || it.linkedCardId) return;
      if (it.items && it.items.length) {
        if (leafProgress(it.items, out)) any = true;
        return;
      }
      any = true;
      if (typeof it.progress === 'number' && isFinite(it.progress)) out.push(Math.max(0, Math.min(100, it.progress)));
      else out.push(it.done ? 100 : 0);
    });
    return any;
  }

  /** A paused checklist item (not a finished one) blocks the task that holds it. */
  function itemsBlockProject(items) {
    var i, it, done;
    for (i = 0; i < (items || []).length; i++) {
      it = items[i];
      if (!it) continue;
      done = it.done === true || Number(it.progress) >= 100;
      if (it.blocked === true && !done) return true;
      if (itemsBlockProject(it.items)) return true;
    }
    return false;
  }

  /**
   * An open task blocks its project when the card is paused, its list is Bloqué,
   * or one of its subtasks is paused. A finished task does not.
   */
  function taskBlocksProject(row) {
    if (!row || row.done) return false;
    if (typeof row.progress === 'number' && row.progress >= 100) return false;
    var key = row.statutKey || row.category || '';
    if (key === 'completed' || key === 'canceled') return false;
    if (row.blocked || key === 'blocked') return true;
    return itemsBlockProject(row.items);
  }

  /**
   * Progress of a project's tasks. A task with subtasks counts as their average; otherwise its own
   * progress. The section average weighs each task once. { progress, tasks, subs, blocked }.
   * blocked: at least one open task (or one of its subtasks) is paused.
   */
  function sectionStats(rows) {
    var parts = [];
    var subs = 0;
    var blocked = false;
    (rows || []).forEach(function (r) {
      if (!r) return;
      if (taskBlocksProject(r)) blocked = true;
      var leaves = [];
      if (leafProgress(r.items, leaves)) {
        subs += leaves.length;
        var sum = 0;
        leaves.forEach(function (n) { sum += n; });
        parts.push(sum / leaves.length);
      } else if (typeof r.progress === 'number' && isFinite(r.progress)) {
        parts.push(Math.max(0, Math.min(100, r.progress)));
      }
    });
    var progress = null;
    if (parts.length) progress = Math.round(parts.reduce(function (a, b) { return a + b; }, 0) / parts.length);
    return { progress: progress, tasks: (rows || []).filter(Boolean).length, subs: subs, blocked: blocked };
  }

  /**
   * Sections by project, in order of first appearance, then projects with no card yet, "Sans projet" last.
   * Rows keep their order inside a section. Null when nothing is a project (the grid stays one flat list).
   * folded: { key: true }. projects: [{ id, name, icon, priority }] from the goal map, so an empty
   * project stays a drop target and keeps the priority set on its header.
   */
  function groupByProject(rows, folded, projects) {
    var by = {};
    var list = [];
    var free = [];
    (rows || []).forEach(function (r) {
      if (!r || !r.project) { if (r) free.push(r); return; }
      var g = by[r.project];
      if (!g) {
        g = by[r.project] = {
          key: 'p:' + r.project,
          id: r.projectId || '',
          icon: r.projectIcon || null,
          name: r.project,
          rows: [],
          free: false,
          priority: null,
        };
        list.push(g);
      }
      if (!g.id && r.projectId) g.id = r.projectId;
      if (!g.icon && r.projectIcon) g.icon = r.projectIcon;
      g.rows.push(r);
    });
    var catalog = [];
    (projects || []).forEach(function (p) {
      if (p && p.id && p.name) catalog.push(p);
    });
    if (!list.length && !catalog.length) return null;
    function findGroup(p) {
      var i;
      for (i = 0; i < list.length; i++) {
        if (list[i].free) continue;
        if ((p.id && list[i].id === p.id) || list[i].name === p.name) return list[i];
      }
      return null;
    }
    catalog.forEach(function (p) {
      var g = findGroup(p);
      if (g) {
        if (!g.id) g.id = p.id;
        if (p.icon) g.icon = p.icon;
        g.priority = clampPriority(p.priority);
        return;
      }
      list.push({
        key: 'p:' + p.name,
        id: p.id,
        icon: p.icon || null,
        name: p.name,
        rows: [],
        free: false,
        priority: clampPriority(p.priority),
      });
    });
    if (free.length) list.push({ key: 'p:', id: '', name: 'Sans projet', rows: free, free: true, priority: null });
    if (!list.length) return null;
    list.forEach(function (g) { g.open = !(folded && folded[g.key]); });
    return list;
  }

  /** Adds { category, color, icon } to each board list from the board's Statut settings. */
  function enrichLists(lists, settings, statutMatch) {
    var cats = (settings && settings.listCategories) || {};
    if (statutMatch && settings && settings.stateColors && typeof statutMatch.applyStateColors === 'function') {
      statutMatch.applyStateColors(settings.stateColors);
    }
    return (lists || []).map(function (l) {
      var category = cats[String(l.id)] || '';
      var style =
        statutMatch && typeof statutMatch.categoryStyle === 'function'
          ? statutMatch.categoryStyle(category || '_none')
          : null;
      return {
        id: l.id,
        name: l.name,
        category: category,
        color: style && style.color ? style.color : '#626f86',
        icon: statutIcon(category),
      };
    });
  }

  var MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  /** "2026-10-03" → "3 oct." (year only when it is not the current one); anything else is returned as is. */
  function formatDay(iso, now) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m || +m[2] < 1 || +m[2] > 12) return String(iso || '');
    var year = (now || new Date()).getFullYear();
    return +m[3] + ' ' + MONTHS_FR[+m[2] - 1] + (+m[1] === year ? '' : ' ' + m[1]);
  }

  /** Chip text for a due date: « En retard » when overdue, « Aujourd’hui » on the day, else "31 oct". */
  function dueLabel(iso, overdue, today) {
    if (overdue) return 'En retard';
    if (today && String(iso || '').slice(0, 10) === today) return 'Aujourd’hui';
    return formatDay(iso);
  }

  function cellText(row, key) {
    var v = row[key];
    if (v == null) return '';
    if (key === 'progress' && typeof v === 'number') return v + '%';
    return String(v);
  }

  /** Menu wording for a column's two sort directions ("Trier " + phrase). */
  function sortLabels(key) {
    if (key === 'urgency') return { asc: 'du moins au plus urgent', desc: 'du plus au moins urgent' };
    if (key === 'tier') return { asc: 'du plus au moins critique', desc: 'du moins au plus critique' };
    if (key === 'statut') return { asc: 'dans l’ordre du tableau', desc: 'dans l’ordre inverse' };
    var kind = COLUMNS[key] && COLUMNS[key].kind;
    if (kind === 'number') return { asc: 'du plus petit au plus grand', desc: 'du plus grand au plus petit' };
    if (kind === 'date') return { asc: 'du plus ancien au plus récent', desc: 'du plus récent au plus ancien' };
    return { asc: 'de A à Z', desc: 'de Z à A' };
  }

  var URGENCY_RANK = {};
  Object.keys(URGENCY_LABELS).forEach(function (k, i) {
    URGENCY_RANK[URGENCY_LABELS[k]] = i; // insertion order = Aucun … Au plus vite
  });

  /**
   * What a column sorts on: scales sort by their rank (Urgence: Aucun → Au plus vite, Palier: most
   * critical first, Statut: board list order), everything else by its displayed value.
   */
  function sortValue(row, key, ctx) {
    if (key === 'urgency') return row.urgency ? URGENCY_RANK[row.urgency] : null;
    if (key === 'tier') return typeof row.tierI === 'number' ? row.tierI : row.tier;
    if (key === 'statut' && ctx && ctx.listRank && ctx.listRank[row.listId] != null) return ctx.listRank[row.listId];
    return row[key];
  }

  function compareValues(av, bv) {
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av).localeCompare(String(bv), 'fr', { sensitivity: 'base', numeric: true });
  }

  /** ctx: { lists } — the board's lists in order, so Statut sorts like the board and not A→Z. */
  function sortRows(rows, key, dir, ctx) {
    return sortRowsMulti(rows, key ? [{ key: key, dir: dir }] : [], ctx);
  }

  /** Sort by several levels: sorts = [{key, dir}], the first is the main one, later ones break ties. */
  function sortRowsMulti(rows, sorts, ctx) {
    var levels = (sorts || []).filter(function (s) {
      return s && COLUMNS[s.key];
    });
    if (!levels.length) return rows.slice();
    var listRank = {};
    ((ctx && ctx.lists) || []).forEach(function (l, i) {
      listRank[l.id] = i;
    });
    var sctx = { listRank: listRank };
    return rows
      .map(function (r, i) {
        return {
          r: r,
          i: i,
          v: levels.map(function (s) {
            return sortValue(r, s.key, sctx);
          }),
        };
      })
      .sort(function (x, y) {
        for (var k = 0; k < levels.length; k++) {
          var av = x.v[k];
          var bv = y.v[k];
          var emptyA = av == null || av === '';
          var emptyB = bv == null || bv === '';
          if (emptyA !== emptyB) return emptyA ? 1 : -1; // keep empties last in both directions
          if (emptyA) continue;
          var c = (levels[k].dir === 'desc' ? -1 : 1) * compareValues(av, bv);
          if (c) return c;
        }
        return x.i - y.i;
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

  /**
   * A card's checklist items as child rows (its subtasks), nested items after their parent with a
   * depth. Items linked to another card are left out: that card already has its own row.
   */
  function subtaskRows(row) {
    var out = [];
    (function walk(items, depth) {
      (items || []).forEach(function (it) {
        if (!it || it.linkedCardId) return;
        var itemId = it.id != null ? String(it.id) : String(out.length);
        out.push({
          id: 'sub:' + row.id + ':' + itemId,
          parentId: row.id,
          depth: depth,
          name: it.text || 'Sous-tâche',
          done: !!it.done,
          progress: typeof it.progress === 'number' ? Math.round(it.progress) : it.done ? 100 : 0,
          due: it.dueDate || '',
          start: it.startDate || '',
        });
        walk(it.items, depth + 1);
      });
    })(row.items, 0);
    return out;
  }

  global.TableModel = {
    subtaskRows: subtaskRows,
    withHierarchy: withHierarchy,
    groupByProject: groupByProject,
    clampPriority: clampPriority,
    formatPriority: formatPriority,
    projectTiers: projectTiers,
    projectPriorityItems: projectPriorityItems,
    sectionStats: sectionStats,
    taskBlocksProject: taskBlocksProject,
    urgencyLabel: function (id) { return URGENCY_LABELS[id] || ''; },
    COLUMNS: COLUMNS,
    DEFAULT_COLUMNS: DEFAULT_COLUMNS,
    plainMarkdown: plainMarkdown,
    STATUT_ICONS: STATUT_ICONS,
    statutIcon: statutIcon,
    enrichLists: enrichLists,
    normalizeColumns: normalizeColumns,
    rowFromRecord: rowFromRecord,
    cellText: cellText,
    formatDay: formatDay,
    dueLabel: dueLabel,
    sortRows: sortRows,
    sortRowsMulti: sortRowsMulti,
    sortLabels: sortLabels,
    filterRows: filterRows,
    orderByLists: orderByLists,
    dropPos: dropPos,
    pushPayload: pushPayload,
    parseConnectionCode: parseConnectionCode,
  };
})(typeof window !== 'undefined' ? window : this);
