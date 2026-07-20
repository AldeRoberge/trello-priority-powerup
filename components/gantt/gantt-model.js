/* Gantt chart — pure layout / date math (no DOM, no Trello). */
(function (global) {
  'use strict';

  var VIEW_MODES = ['week', 'month', 'year'];
  var MS_DAY = 24 * 60 * 60 * 1000;
  var WEEKDAY_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var MONTH_SHORT = [
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
    'd\u00e9c.',
  ];

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function toIsoDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return (
      date.getFullYear() +
      '-' +
      pad2(date.getMonth() + 1) +
      '-' +
      pad2(date.getDate())
    );
  }

  function parseIsoDate(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      if (isNaN(value.getTime())) return null;
      return startOfDay(value);
    }
    if (typeof value !== 'string') return null;
    var trimmed = value.trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]) - 1;
    var d = Number(m[3]);
    var date = new Date(y, mo, d);
    if (
      date.getFullYear() !== y ||
      date.getMonth() !== mo ||
      date.getDate() !== d
    ) {
      return null;
    }
    return date;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, days) {
    var d = startOfDay(date);
    d.setDate(d.getDate() + (Number(days) || 0));
    return d;
  }

  function dayDiff(a, b) {
    var sa = startOfDay(a).getTime();
    var sb = startOfDay(b).getTime();
    return Math.round((sa - sb) / MS_DAY);
  }

  function startOfWeek(date) {
    var d = startOfDay(date);
    var day = d.getDay();
    var mondayOffset = day === 0 ? -6 : 1 - day;
    return addDays(d, mondayOffset);
  }

  function endOfWeek(date) {
    return addDays(startOfWeek(date), 6);
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  function startOfYear(date) {
    return new Date(date.getFullYear(), 0, 1);
  }

  function endOfYear(date) {
    return new Date(date.getFullYear(), 11, 31);
  }

  function isViewMode(mode) {
    return VIEW_MODES.indexOf(mode) >= 0;
  }

  function normalizeViewMode(mode) {
    return isViewMode(mode) ? mode : 'week';
  }

  function columnLabel(date, mode) {
    if (mode === 'year') {
      return MONTH_SHORT[date.getMonth()] || String(date.getMonth() + 1);
    }
    if (mode === 'month') {
      return String(date.getDate());
    }
    return WEEKDAY_SHORT[date.getDay()] + ' ' + date.getDate();
  }

  /**
   * Visible window + header columns for a zoom mode, anchored on `anchor`.
   * @returns {{ mode, start: Date, end: Date, columns: Array }}
   */
  function viewRange(mode, anchor) {
    var m = normalizeViewMode(mode);
    var a = parseIsoDate(anchor) || startOfDay(new Date());
    var start;
    var end;
    var columns = [];
    var cursor;
    var colEnd;

    if (m === 'week') {
      start = startOfWeek(a);
      end = endOfWeek(a);
      cursor = start;
      while (cursor.getTime() <= end.getTime()) {
        colEnd = cursor;
        columns.push({
          key: toIsoDate(cursor),
          label: columnLabel(cursor, m),
          start: cursor,
          end: colEnd,
        });
        cursor = addDays(cursor, 1);
      }
    } else if (m === 'month') {
      start = startOfMonth(a);
      end = endOfMonth(a);
      cursor = start;
      while (cursor.getTime() <= end.getTime()) {
        colEnd = cursor;
        columns.push({
          key: toIsoDate(cursor),
          label: columnLabel(cursor, m),
          start: cursor,
          end: colEnd,
        });
        cursor = addDays(cursor, 1);
      }
    } else {
      start = startOfYear(a);
      end = endOfYear(a);
      for (var mi = 0; mi < 12; mi++) {
        cursor = new Date(a.getFullYear(), mi, 1);
        colEnd = endOfMonth(cursor);
        columns.push({
          key: cursor.getFullYear() + '-' + pad2(mi + 1),
          label: columnLabel(cursor, m),
          start: cursor,
          end: colEnd,
        });
      }
    }

    return { mode: m, start: start, end: end, columns: columns };
  }

  function shiftAnchor(mode, anchor, direction) {
    var m = normalizeViewMode(mode);
    var a = parseIsoDate(anchor) || startOfDay(new Date());
    var dir = direction < 0 ? -1 : 1;
    if (m === 'week') return addDays(a, dir * 7);
    if (m === 'month') {
      return new Date(a.getFullYear(), a.getMonth() + dir, 1);
    }
    return new Date(a.getFullYear() + dir, a.getMonth(), 1);
  }

  /**
   * Resolve [start, end] inclusive day range for a bar.
   * Prefer startDate + dueDate; due-only uses estimate or 1 day; start-only = 1 day.
   */
  function resolveBarInterval(parts) {
    parts = parts || {};
    var start = parseIsoDate(parts.startDate);
    var due = parseIsoDate(parts.dueDate);
    var est =
      typeof parts.estimatedMinutes === 'number' && isFinite(parts.estimatedMinutes)
        ? Math.max(0, Math.round(parts.estimatedMinutes))
        : null;

    if (start && due) {
      if (due.getTime() < start.getTime()) {
        return { start: due, end: start };
      }
      return { start: start, end: due };
    }
    if (due && !start) {
      if (est != null && est > 0) {
        var days = Math.max(1, Math.ceil(est / (60 * 24)));
        return { start: addDays(due, -(days - 1)), end: due };
      }
      return { start: due, end: due };
    }
    if (start && !due) {
      return { start: start, end: start };
    }
    return null;
  }

  function rangeDayCount(range) {
    if (!range || !range.start || !range.end) return 1;
    return Math.max(1, dayDiff(range.end, range.start) + 1);
  }

  function dateToX(date, range, widthPx) {
    var d = parseIsoDate(date);
    if (!d || !range) return 0;
    var w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 1;
    var total = rangeDayCount(range);
    var offset = dayDiff(d, range.start);
    return (offset / total) * w;
  }

  function xToDate(x, range, widthPx) {
    if (!range) return null;
    var w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 1;
    var total = rangeDayCount(range);
    var dayW = w / total;
    // Floor so each day column [i*dayW, (i+1)*dayW) maps to day i (matches barGeometry / CSS grid).
    var offset = Math.floor(Number(x) / dayW);
    if (!isFinite(offset) || offset < 0) offset = 0;
    if (offset >= total) offset = total - 1;
    return addDays(range.start, offset);
  }

  function snapDate(date, mode) {
    var d = parseIsoDate(date);
    if (!d) return null;
    var m = normalizeViewMode(mode);
    if (m === 'year') {
      return startOfMonth(d);
    }
    return startOfDay(d);
  }

  function shiftInterval(interval, dayDelta) {
    if (!interval || !interval.start || !interval.end) return null;
    var delta = Number(dayDelta) || 0;
    return {
      start: addDays(interval.start, delta),
      end: addDays(interval.end, delta),
    };
  }

  function resizeInterval(interval, edge, dayDelta) {
    if (!interval || !interval.start || !interval.end) return null;
    var delta = Number(dayDelta) || 0;
    var start = interval.start;
    var end = interval.end;
    if (edge === 'start') {
      start = addDays(start, delta);
      if (start.getTime() > end.getTime()) start = end;
    } else {
      end = addDays(end, delta);
      if (end.getTime() < start.getTime()) end = start;
    }
    return { start: start, end: end };
  }

  /** Order two dates into an inclusive [start, end] interval (paint / click-drag). */
  function orderedInterval(a, b) {
    var start = a instanceof Date ? startOfDay(a) : parseIsoDate(a);
    var end = b instanceof Date ? startOfDay(b) : parseIsoDate(b);
    if (!start || !end) return null;
    if (start.getTime() <= end.getTime()) return { start: start, end: end };
    return { start: end, end: start };
  }

  /**
   * Header “select all” checkbox derived state.
   * @returns {{ checked: boolean, indeterminate: boolean }}
   */
  function selectAllCheckboxState(selectedCount, visibleCount) {
    var vis = Math.max(0, Math.round(Number(visibleCount) || 0));
    var sel = Math.max(0, Math.round(Number(selectedCount) || 0));
    if (sel > vis) sel = vis;
    return {
      checked: vis > 0 && sel === vis,
      indeterminate: sel > 0 && sel < vis,
    };
  }

  function intervalToParts(interval) {
    if (!interval) return { startDate: '', dueDate: '' };
    return {
      startDate: toIsoDate(interval.start),
      dueDate: toIsoDate(interval.end),
    };
  }

  function barGeometry(interval, range, widthPx) {
    if (!interval || !range) return null;
    var total = rangeDayCount(range);
    var w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 1;
    var dayW = w / total;
    var startOffset = dayDiff(interval.start, range.start);
    var endOffset = dayDiff(interval.end, range.start);
    var left = startOffset * dayW;
    var width = (endOffset - startOffset + 1) * dayW;
    var visible =
      endOffset >= 0 && startOffset < total && width > 0;
    return {
      left: left,
      width: Math.max(dayW * 0.35, width),
      visible: visible,
      clippedLeft: startOffset < 0,
      clippedRight: endOffset >= total,
    };
  }

  /**
   * Build nest tree from enriched board cards.
   * cardRecords: [{ id, name, progress, category, startDate, dueDate, estimatedMinutes,
   *   items: completion items, dueComplete, listId, listName, color }]
   */
  function buildNestTree(cardRecords) {
    var byId = Object.create(null);
    var linkedIds = Object.create(null);
    var i;
    var card;
    var items;
    var item;
    var linkId;

    for (i = 0; i < (cardRecords || []).length; i++) {
      card = cardRecords[i];
      if (!card || !card.id) continue;
      byId[String(card.id)] = card;
    }

    for (i = 0; i < (cardRecords || []).length; i++) {
      card = cardRecords[i];
      if (!card) continue;
      items = Array.isArray(card.items) ? card.items : [];
      for (var j = 0; j < items.length; j++) {
        item = items[j];
        linkId =
          item && item.linkedCardId != null
            ? String(item.linkedCardId).trim()
            : '';
        if (linkId) linkedIds[linkId] = true;
      }
    }

    function localNode(item, depth, parentCardId) {
      var itemId = item && item.id != null ? String(item.id) : '';
      var node = {
        id: 'local:' + (itemId || Math.random()),
        kind: 'local',
        name: item.text || 'Sous-t\u00e2che',
        progress:
          typeof item.progress === 'number' ? item.progress : item.done ? 100 : 0,
        done: !!item.done,
        depth: depth,
        expandable: false,
        children: [],
        startDate: '',
        dueDate: '',
        estimatedMinutes: item.estimatedMinutes || null,
        category: null,
        color: null,
        cardId: null,
        parentCardId: parentCardId || null,
        itemId: itemId || null,
        parentItemId: null,
      };
      var checklist = Array.isArray(item.items) ? item.items : [];
      for (var c = 0; c < checklist.length; c++) {
        var ch = checklist[c];
        if (!ch) continue;
        var nestedId = ch.id != null ? String(ch.id) : '';
        node.children.push({
          id: 'check:' + (nestedId || c),
          kind: 'checklist',
          name: ch.text || 'Item',
          progress:
            typeof ch.progress === 'number' ? ch.progress : ch.done ? 100 : 0,
          done: !!ch.done,
          depth: depth + 1,
          expandable: false,
          children: [],
          startDate: '',
          dueDate: '',
          estimatedMinutes: ch.estimatedMinutes || null,
          category: null,
          color: null,
          cardId: null,
          parentCardId: parentCardId || null,
          itemId: nestedId || null,
          parentItemId: itemId || null,
        });
      }
      if (node.children.length) node.expandable = true;
      return node;
    }

    function cardNode(rec, depth, linkMeta) {
      var id = String(rec.id);
      var node = {
        id: 'card:' + id,
        kind: 'card',
        cardId: id,
        name: rec.name || 'Carte',
        progress: typeof rec.progress === 'number' ? rec.progress : 0,
        done: !!rec.dueComplete || rec.category === 'completed',
        depth: depth,
        expandable: false,
        children: [],
        startDate: rec.startDate || '',
        dueDate: rec.dueDate || '',
        estimatedMinutes: rec.estimatedMinutes || null,
        category: rec.category || null,
        categoryIcon: rec.categoryIcon || null,
        categoryLabel: rec.categoryLabel || '',
        color: rec.color || null,
        listId: rec.listId || null,
        listName: rec.listName || '',
        dueComplete: !!rec.dueComplete,
        subtaskCount:
          typeof rec.subtaskCount === 'number'
            ? rec.subtaskCount
            : Array.isArray(rec.items)
              ? rec.items.length
              : 0,
        priorityScore: rec.priorityScore != null ? rec.priorityScore : null,
        priorityTierI: rec.priorityTierI != null ? rec.priorityTierI : null,
        priorityLabel: rec.priorityLabel || '',
        priorityFill: rec.priorityFill || null,
        priorityEnabled: rec.priorityEnabled !== false,
        blocked: !!rec.blocked,
        duePast: !!rec.duePast,
        dueCountdown: rec.dueCountdown || '',
        priorityRankTier:
          rec.priorityRankTier != null ? rec.priorityRankTier : 100,
        priorityRankScore:
          rec.priorityRankScore != null ? rec.priorityRankScore : -1,
        parentCardId: null,
        itemId: null,
        parentItemId: null,
        linkParentCardId: null,
        linkItemId: null,
      };
      if (linkMeta) {
        node.linkParentCardId = linkMeta.parentCardId || null;
        node.linkItemId = linkMeta.itemId || null;
      }
      var rawItems = Array.isArray(rec.items) ? rec.items : [];
      for (var k = 0; k < rawItems.length; k++) {
        var it = rawItems[k];
        if (!it) continue;
        var linked =
          it.linkedCardId != null ? String(it.linkedCardId).trim() : '';
        if (linked) {
          var childRec = byId[linked];
          var linkInfo = {
            parentCardId: id,
            itemId: it.id != null ? String(it.id) : null,
          };
          if (childRec) {
            node.children.push(cardNode(childRec, depth + 1, linkInfo));
          } else {
            node.children.push({
              id: 'card:' + linked,
              kind: 'card',
              cardId: linked,
              name: it.text || 'Carte li\u00e9e',
              progress:
                typeof it.progress === 'number'
                  ? it.progress
                  : it.done
                    ? 100
                    : 0,
              done: !!it.done,
              depth: depth + 1,
              expandable: false,
              children: [],
              startDate: '',
              dueDate: '',
              estimatedMinutes: null,
              category: null,
              categoryIcon: null,
              categoryLabel: '',
              color: null,
              listId: null,
              listName: '',
              dueComplete: false,
              missing: true,
              subtaskCount: 0,
              priorityScore: null,
              priorityTierI: null,
              priorityLabel: '',
              priorityFill: null,
              priorityEnabled: false,
              blocked: false,
              duePast: false,
              dueCountdown: '',
              priorityRankTier: 100,
              priorityRankScore: -1,
              parentCardId: null,
              itemId: null,
              parentItemId: null,
              linkParentCardId: linkInfo.parentCardId,
              linkItemId: linkInfo.itemId,
            });
          }
        } else {
          node.children.push(localNode(it, depth + 1, id));
        }
      }
      if (node.children.length) node.expandable = true;
      return node;
    }

    var roots = [];
    for (i = 0; i < (cardRecords || []).length; i++) {
      card = cardRecords[i];
      if (!card || !card.id) continue;
      if (linkedIds[String(card.id)]) continue;
      roots.push(cardNode(card, 0));
    }

    roots.sort(function (a, b) {
      var da = a.dueDate || a.startDate || '';
      var db = b.dueDate || b.startDate || '';
      if (da && db && da !== db) return da < db ? -1 : 1;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return String(a.name).localeCompare(String(b.name), 'fr');
    });

    return roots;
  }

  function compareRootsByPriority(a, b) {
    var ta = a && a.priorityRankTier != null ? a.priorityRankTier : 100;
    var tb = b && b.priorityRankTier != null ? b.priorityRankTier : 100;
    if (ta !== tb) return ta - tb;
    var sa = a && a.priorityRankScore != null ? a.priorityRankScore : -1;
    var sb = b && b.priorityRankScore != null ? b.priorityRankScore : -1;
    if (sa !== sb) return sb - sa;
    return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'fr');
  }

  function compareRootsByDate(a, b) {
    var da = (a && (a.dueDate || a.startDate)) || '';
    var db = (b && (b.dueDate || b.startDate)) || '';
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'fr');
  }

  function compareRootsByName(a, b) {
    return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'fr');
  }

  function progressValue(node) {
    var p = node && typeof node.progress === 'number' ? node.progress : 0;
    if (node && (node.done || node.category === 'completed')) {
      return Math.max(p, 100);
    }
    return p;
  }

  /** Higher progress / completedness first; name as tiebreaker. */
  function compareRootsByProgress(a, b) {
    var pa = progressValue(a);
    var pb = progressValue(b);
    if (pa !== pb) return pb - pa;
    return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'fr');
  }

  /**
   * Sort top-level Gantt rows. Nested children keep their relative order.
   * @param {'date'|'priority'|'name'|'progress'} sortBy
   */
  function sortTreeRoots(nodes, sortBy) {
    var list = (nodes || []).slice();
    var mode =
      sortBy === 'priority' || sortBy === 'name' || sortBy === 'progress'
        ? sortBy
        : 'date';
    if (mode === 'priority') list.sort(compareRootsByPriority);
    else if (mode === 'name') list.sort(compareRootsByName);
    else if (mode === 'progress') list.sort(compareRootsByProgress);
    else list.sort(compareRootsByDate);
    return list;
  }

  /**
   * Flatten tree for rendering; expandedSet maps node.id → true.
   * Roots are expanded by default when not listed.
   */
  function flattenVisible(nodes, expandedSet) {
    var out = [];
    expandedSet = expandedSet || {};

    function walk(list) {
      for (var i = 0; i < (list || []).length; i++) {
        var n = list[i];
        if (!n) continue;
        out.push(n);
        var open =
          expandedSet[n.id] === true ||
          (expandedSet[n.id] == null && n.depth === 0 && n.expandable);
        if (open && n.children && n.children.length) {
          walk(n.children);
        }
      }
    }

    walk(nodes);
    return out;
  }

  function filterRows(rows, options) {
    options = options || {};
    return (rows || []).filter(function (row) {
      if (!row) return false;
      if (options.hideCompleted && (row.done || row.category === 'completed')) {
        return false;
      }
      if (options.hideUndated) {
        var interval = resolveBarInterval(row);
        if (!interval) return false;
      }
      return true;
    });
  }

  /** Depth-first search for a node id in a nest tree. */
  function findNodeById(nodes, id) {
    if (id == null || id === '') return null;
    var want = String(id);
    for (var i = 0; i < (nodes || []).length; i++) {
      var n = nodes[i];
      if (!n) continue;
      if (String(n.id) === want) return n;
      var found = findNodeById(n.children, want);
      if (found) return found;
    }
    return null;
  }

  /**
   * Collect ids for a node and all nested descendants (for cascade select).
   * @returns {string[]}
   */
  function collectSubtreeIds(node) {
    var out = [];
    function walk(n) {
      if (!n || n.id == null || n.id === '') return;
      out.push(String(n.id));
      var kids = n.children || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i]);
    }
    walk(node);
    return out;
  }

  global.GanttModel = {
    VIEW_MODES: VIEW_MODES,
    MS_DAY: MS_DAY,
    toIsoDate: toIsoDate,
    parseIsoDate: parseIsoDate,
    startOfDay: startOfDay,
    addDays: addDays,
    dayDiff: dayDiff,
    startOfWeek: startOfWeek,
    endOfWeek: endOfWeek,
    startOfMonth: startOfMonth,
    endOfMonth: endOfMonth,
    startOfYear: startOfYear,
    endOfYear: endOfYear,
    normalizeViewMode: normalizeViewMode,
    viewRange: viewRange,
    shiftAnchor: shiftAnchor,
    resolveBarInterval: resolveBarInterval,
    rangeDayCount: rangeDayCount,
    dateToX: dateToX,
    xToDate: xToDate,
    snapDate: snapDate,
    shiftInterval: shiftInterval,
    resizeInterval: resizeInterval,
    orderedInterval: orderedInterval,
    selectAllCheckboxState: selectAllCheckboxState,
    intervalToParts: intervalToParts,
    barGeometry: barGeometry,
    buildNestTree: buildNestTree,
    flattenVisible: flattenVisible,
    filterRows: filterRows,
    findNodeById: findNodeById,
    collectSubtreeIds: collectSubtreeIds,
    compareRootsByPriority: compareRootsByPriority,
    compareRootsByProgress: compareRootsByProgress,
    sortTreeRoots: sortTreeRoots,
  };
})(typeof window !== 'undefined' ? window : this);
