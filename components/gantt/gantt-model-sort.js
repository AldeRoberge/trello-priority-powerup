/**
 * gantt-model: part 2 of 3 (workHoursBand).
 * Names are shared with the other parts through window.GanttModelParts (see gantt-model.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.GanttModelParts = global.GanttModelParts || {});

  // from earlier parts (values)
  var DEFAULT_DAY_END = S.DEFAULT_DAY_END;
  var DEFAULT_DAY_START = S.DEFAULT_DAY_START;
  var STATE_SECTION_LABELS = S.STATE_SECTION_LABELS;

  // from other parts (functions, resolved at call time)
  function addDays() { return S.addDays.apply(this, arguments); }
  function buildTimeWarp() { return S.buildTimeWarp.apply(this, arguments); }
  function combineDateTime() { return S.combineDateTime.apply(this, arguments); }
  function dateTimeToX() { return S.dateTimeToX.apply(this, arguments); }
  function mapOptions() { return S.mapOptions.apply(this, arguments); }
  function normalizeWorkTime() { return S.normalizeWorkTime.apply(this, arguments); }
  function parseIsoDate() { return S.parseIsoDate.apply(this, arguments); }
  function rangeDayCount() { return S.rangeDayCount.apply(this, arguments); }
  function startOfDay() { return S.startOfDay.apply(this, arguments); }
  function toIsoDate() { return S.toIsoDate.apply(this, arguments); }

  /**
   * Agenda work-hours overlay band within a day range.
   * @returns {{ left: number, width: number }|null}
   */
  function workHoursBand(dayStart, dayEnd, range, widthPx, options) {
    if (!range || !range.start) return null;
    if (range.mode !== 'day') return null;
    var start = combineDateTime(range.start, normalizeWorkTime(dayStart, DEFAULT_DAY_START));
    var end = combineDateTime(range.start, normalizeWorkTime(dayEnd, DEFAULT_DAY_END));
    if (!start || !end) return null;
    if (end.getTime() <= start.getTime()) return null;
    var mapOpts = mapOptions(options) || {};
    if (!mapOpts.timeWarp) {
      mapOpts = {
        timeWarp: buildTimeWarp(dayStart, dayEnd),
      };
    }
    var left = dateTimeToX(start, range, widthPx, mapOpts);
    var right = dateTimeToX(end, range, widthPx, mapOpts);
    return { left: left, width: Math.max(0, right - left) };
  }

  /**
   * Morning / night overlays for timed views (Agenda + week).
   * Each day contributes [midnight → dayStart] and [dayEnd → next midnight].
   * @returns {Array<{ left: number, width: number, kind: 'morning'|'night' }>}
   */
  function offHoursBands(dayStart, dayEnd, range, widthPx, options) {
    if (!range || !range.start) return [];
    if (range.mode !== 'day' && range.mode !== 'week') return [];
    var startTime = normalizeWorkTime(dayStart, DEFAULT_DAY_START);
    var endTime = normalizeWorkTime(dayEnd, DEFAULT_DAY_END);
    var workStart0 = combineDateTime(range.start, startTime);
    var workEnd0 = combineDateTime(range.start, endTime);
    if (!workStart0 || !workEnd0) return [];
    if (workEnd0.getTime() <= workStart0.getTime()) return [];

    var mapOpts = mapOptions(options) || {};
    if (!mapOpts.timeWarp) {
      mapOpts = { timeWarp: buildTimeWarp(dayStart, dayEnd) };
    }

    var bands = [];
    var total = rangeDayCount(range);
    var di;
    for (di = 0; di < total; di++) {
      var day = addDays(range.start, di);
      var midnight = startOfDay(day);
      var workStart = combineDateTime(day, startTime);
      var workEnd = combineDateTime(day, endTime);
      var nextMidnight = addDays(day, 1);
      if (!workStart || !workEnd) continue;

      if (workStart.getTime() > midnight.getTime()) {
        var mLeft = dateTimeToX(midnight, range, widthPx, mapOpts);
        var mRight = dateTimeToX(workStart, range, widthPx, mapOpts);
        if (mRight > mLeft) {
          bands.push({
            left: mLeft,
            width: mRight - mLeft,
            kind: 'morning',
          });
        }
      }
      if (nextMidnight.getTime() > workEnd.getTime()) {
        var nLeft = dateTimeToX(workEnd, range, widthPx, mapOpts);
        var nRight = dateTimeToX(nextMidnight, range, widthPx, mapOpts);
        if (nRight > nLeft) {
          bands.push({
            left: nLeft,
            width: nRight - nLeft,
            kind: 'night',
          });
        }
      }
    }
    return bands;
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
        blocked: !!item.blocked && !item.done,
        depth: depth,
        expandable: false,
        children: [],
        startDate: item.startDate || '',
        dueDate: item.dueDate || '',
        startTime: item.startTime || '',
        dueTime: item.dueTime || '',
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
          startDate: ch.startDate || '',
          dueDate: ch.dueDate || '',
          startTime: ch.startTime || '',
          dueTime: ch.dueTime || '',
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
        startTime: rec.startTime || '',
        dueTime: rec.dueTime || '',
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
        assignees: Array.isArray(rec.assignees) ? rec.assignees : [],
        labels: Array.isArray(rec.labels) ? rec.labels : [],
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
              assignees: [],
              labels: [],
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

  /** Ascending progress / completedness; name as tiebreaker. */
  function compareRootsByProgress(a, b) {
    var pa = progressValue(a);
    var pb = progressValue(b);
    if (pa !== pb) return pa - pb;
    return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'fr');
  }

  function subtaskCountValue(node) {
    if (node && typeof node.subtaskCount === 'number') return node.subtaskCount;
    if (node && node.children && node.children.length) return node.children.length;
    return 0;
  }

  /** Ascending subtask count; name as tiebreaker. */
  function compareRootsBySubtasks(a, b) {
    var ca = subtaskCountValue(a);
    var cb = subtaskCountValue(b);
    if (ca !== cb) return ca - cb;
    return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'fr');
  }

  function normalizeSortBy(sortBy) {
    if (
      sortBy === 'priority' ||
      sortBy === 'name' ||
      sortBy === 'progress' ||
      sortBy === 'subtasks'
    ) {
      return sortBy;
    }
    return 'date';
  }

  /** Default direction for each column (first click). */
  function defaultSortDir(sortBy) {
    var mode = normalizeSortBy(sortBy);
    if (mode === 'progress' || mode === 'subtasks') return 'desc';
    return 'asc';
  }

  function normalizeSortDir(sortBy, sortDir) {
    if (sortDir === 'asc' || sortDir === 'desc') return sortDir;
    return defaultSortDir(sortBy);
  }

  /**
   * Sort top-level Gantt rows. Nested children keep their relative order.
   * Ascending: date earlier→later, name A→Z, progress 0→100, subtasks few→many,
   * priority higher→lower importance. Pass sortDir 'desc' to reverse.
   * @param {'date'|'priority'|'name'|'progress'|'subtasks'} sortBy
   * @param {'asc'|'desc'} [sortDir]
   */
  function sortTreeRoots(nodes, sortBy, sortDir) {
    var list = (nodes || []).slice().filter(function (n) {
      return n && n.kind !== 'section';
    });
    var mode = normalizeSortBy(sortBy);
    var dir = normalizeSortDir(mode, sortDir);
    var base;
    if (mode === 'priority') base = compareRootsByPriority;
    else if (mode === 'name') base = compareRootsByName;
    else if (mode === 'progress') base = compareRootsByProgress;
    else if (mode === 'subtasks') base = compareRootsBySubtasks;
    else base = compareRootsByDate;
    var mult = dir === 'desc' ? -1 : 1;
    list.sort(function (a, b) {
      var r = base(a, b);
      return r === 0 ? 0 : r * mult;
    });
    return list;
  }

  // ── Multi-level sorting ──────────────────────────────────────────────
  var STATUS_RANK = { started: 0, pending: 1, blocked: 2, completed: 3 };
  var MAX_SORT_KEYS = 5;
  var SORT_FIELDS = [
    { key: 'status', label: 'Statut', icon: 'ti-circle-dot', dir: 'asc' },
    { key: 'priority', label: 'Priorité', icon: 'ti-flame', dir: 'asc' },
    { key: 'date', label: 'Date', icon: 'ti-calendar', dir: 'asc' },
    { key: 'name', label: 'Nom', icon: 'ti-abc', dir: 'asc' },
    { key: 'progress', label: 'Progrès', icon: 'ti-percentage', dir: 'desc' },
    { key: 'subtasks', label: 'Sous-tâches', icon: 'ti-list-check', dir: 'desc' },
    { key: 'list', label: 'Liste', icon: 'ti-layout-columns', dir: 'asc' },
    { key: 'assignee', label: 'Assigné', icon: 'ti-user', dir: 'asc' },
  ];

  function isSortField(key) {
    for (var i = 0; i < SORT_FIELDS.length; i++) {
      if (SORT_FIELDS[i].key === key) return true;
    }
    return false;
  }

  function sortFieldDefaultDir(key) {
    for (var i = 0; i < SORT_FIELDS.length; i++) {
      if (SORT_FIELDS[i].key === key) return SORT_FIELDS[i].dir;
    }
    return 'asc';
  }

  /** completed | blocked | started | pending. */
  function nodeStatusKey(node) {
    if (!node) return 'pending';
    if (node.done || node.category === 'completed') return 'completed';
    return stateSectionKey(node);
  }

  function firstAssigneeName(node) {
    var list = node && Array.isArray(node.assignees) ? node.assignees : [];
    var names = list
      .map(function (a) {
        return String((a && a.name) || '');
      })
      .filter(Boolean)
      .sort(function (x, y) {
        return x.localeCompare(y, 'fr');
      });
    return names.length ? names[0] : null;
  }

  /**
   * Ascending comparison for one sort field. Returns a number, or
   * { missing: -1 | 0 | 1 } when a value is absent on either side (no date, no
   * list, no assignee): those rows always go last, whatever the direction.
   */
  function fieldCompare(key, a, b) {
    var x;
    var y;
    if (key === 'status') {
      return STATUS_RANK[nodeStatusKey(a)] - STATUS_RANK[nodeStatusKey(b)];
    }
    if (key === 'priority') {
      var ta = a && a.priorityRankTier != null ? a.priorityRankTier : 100;
      var tb = b && b.priorityRankTier != null ? b.priorityRankTier : 100;
      if (ta !== tb) return ta - tb;
      var sa = a && a.priorityRankScore != null ? a.priorityRankScore : -1;
      var sb = b && b.priorityRankScore != null ? b.priorityRankScore : -1;
      return sb - sa;
    }
    if (key === 'name') {
      return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'fr');
    }
    if (key === 'progress') return progressValue(a) - progressValue(b);
    if (key === 'subtasks') return subtaskCountValue(a) - subtaskCountValue(b);
    if (key === 'date') {
      x = (a && (a.dueDate || a.startDate)) || '';
      y = (b && (b.dueDate || b.startDate)) || '';
    } else if (key === 'list') {
      x = (a && a.listName) || '';
      y = (b && b.listName) || '';
    } else if (key === 'assignee') {
      x = firstAssigneeName(a) || '';
      y = firstAssigneeName(b) || '';
    } else {
      return 0;
    }
    if (!x || !y) return { missing: !x && !y ? 0 : !x ? 1 : -1 };
    if (key === 'date') return x === y ? 0 : x < y ? -1 : 1;
    return x.localeCompare(y, 'fr');
  }

  function compareByKey(spec, a, b) {
    var r = fieldCompare(spec.by, a, b);
    if (r && typeof r === 'object') return r.missing;
    return spec.dir === 'desc' ? -r : r;
  }

  /**
   * Clean a list of sort levels: [{ by, dir }]. Unknown fields are dropped, a
   * field may appear once (first wins), at most MAX_SORT_KEYS levels.
   * Empty → date ascending.
   */
  function normalizeSortKeys(raw) {
    var out = [];
    var seen = Object.create(null);
    var list = Array.isArray(raw) ? raw : [];
    for (var i = 0; i < list.length && out.length < MAX_SORT_KEYS; i++) {
      var it = list[i];
      var by = it && typeof it === 'object' ? it.by : it;
      if (typeof by !== 'string' || !isSortField(by) || seen[by]) continue;
      seen[by] = true;
      out.push({
        by: by,
        dir:
          it && (it.dir === 'asc' || it.dir === 'desc')
            ? it.dir
            : sortFieldDefaultDir(by),
      });
    }
    if (!out.length) out.push({ by: 'date', dir: 'asc' });
    return out;
  }

  /**
   * Sort top-level rows by several levels at once (priority → date → name…).
   * A later level only breaks ties of the earlier ones; original order is the
   * final tiebreaker so equal rows never shuffle.
   */
  function sortTreeRootsMulti(nodes, keys) {
    var specs = normalizeSortKeys(keys);
    var list = (nodes || [])
      .filter(function (n) {
        return n && n.kind !== 'section';
      })
      .map(function (n, i) {
        return { n: n, i: i };
      });
    list.sort(function (x, y) {
      for (var k = 0; k < specs.length; k++) {
        var r = compareByKey(specs[k], x.n, y.n);
        if (r) return r;
      }
      return x.i - y.i;
    });
    return list.map(function (w) {
      return w.n;
    });
  }

  // ── Filter criteria ──────────────────────────────────────────────────
  // criteria = {
  //   query: string,          text in name / list / assignee / label
  //   statuses: string[],     started | pending | blocked | completed (any of)
  //   assignees: string[],    'me' | 'none' | <person id> (any of)
  //   priorities: string[],   tier keys from priorityKey(), 'none' = no priority
  //   lists: string[],        Trello list ids
  //   labels: string[],       label ids
  //   due: string[],          overdue | today | week | none (any of)
  // }
  var STATUS_KEYS = ['started', 'pending', 'blocked', 'completed'];
  var STATUS_LABELS = {
    started: 'En cours',
    pending: 'À faire',
    blocked: 'Bloqué',
    completed: 'Terminé',
  };
  var DUE_KEYS = ['overdue', 'today', 'week', 'none'];
  var DUE_LABELS = {
    overdue: 'En retard',
    today: "Aujourd'hui",
    week: 'Cette semaine',
    none: 'Sans échéance',
  };

  function emptyCriteria() {
    return {
      query: '',
      statuses: [],
      assignees: [],
      priorities: [],
      lists: [],
      labels: [],
      due: [],
    };
  }

  function stringList(raw, allowed) {
    var out = [];
    var list = Array.isArray(raw) ? raw : [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i] == null ? '' : String(list[i]);
      if (!v || out.indexOf(v) !== -1) continue;
      if (allowed && allowed.indexOf(v) === -1) continue;
      out.push(v);
    }
    return out;
  }

  function normalizeCriteria(raw) {
    var c = emptyCriteria();
    if (!raw || typeof raw !== 'object') return c;
    c.query = typeof raw.query === 'string' ? raw.query.trim().slice(0, 80) : '';
    c.statuses = stringList(raw.statuses, STATUS_KEYS);
    c.assignees = stringList(raw.assignees);
    c.priorities = stringList(raw.priorities);
    c.lists = stringList(raw.lists);
    c.labels = stringList(raw.labels);
    c.due = stringList(raw.due, DUE_KEYS);
    return c;
  }

  /** Number of active criteria groups (a group with any choice counts once). */
  function criteriaCount(criteria) {
    var c = normalizeCriteria(criteria);
    return (
      (c.query ? 1 : 0) +
      (c.statuses.length ? 1 : 0) +
      (c.assignees.length ? 1 : 0) +
      (c.priorities.length ? 1 : 0) +
      (c.lists.length ? 1 : 0) +
      (c.labels.length ? 1 : 0) +
      (c.due.length ? 1 : 0)
    );
  }

  function foldText(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    if (typeof t.normalize === 'function') {
      t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    return t;
  }

  /** Stable key for the priority facet: tier index, or 'none' when unset. */
  function priorityKey(node) {
    if (!node || node.priorityEnabled === false) return 'none';
    if (node.priorityTierI == null || !isFinite(Number(node.priorityTierI))) {
      return 'none';
    }
    return 'tier:' + Number(node.priorityTierI);
  }

  function isMeAssignee(assignee, meIds) {
    if (!assignee || !meIds || !meIds.length) return false;
    if (meIds.indexOf(String(assignee.id)) !== -1) return true;
    return !!(
      assignee.trelloId && meIds.indexOf(String(assignee.trelloId)) !== -1
    );
  }

  function dueBucketMatches(node, key, today) {
    var due = (node && node.dueDate) || '';
    if (key === 'none') return !due;
    if (!due) return false;
    if (key === 'overdue') {
      return !!(node.duePast) || (due < today && !(node.done || node.category === 'completed'));
    }
    if (key === 'today') return due === today;
    if (key === 'week') {
      var t0 = parseIsoDate(today);
      if (!t0) return false;
      var end = new Date(t0.getTime());
      end.setDate(end.getDate() + 6);
      var endIso = toIsoDate(end);
      return due >= today && due <= endIso;
    }
    return false;
  }

  /**
   * Does one card row pass the criteria? Groups are ANDed, choices inside a
   * group are ORed. ctx = { meIds: string[], today: 'YYYY-MM-DD' }.
   */
  function matchesCriteria(node, criteria, ctx) {
    var c = normalizeCriteria(criteria);
    ctx = ctx || {};
    var list;
    var i;
    var ok;
    if (c.query) {
      var hay = foldText(
        [
          node.name,
          node.listName,
          (node.assignees || [])
            .map(function (a) {
              return a && a.name;
            })
            .join(' '),
          (node.labels || [])
            .map(function (l) {
              return l && l.name;
            })
            .join(' '),
        ].join(' ')
      );
      var words = foldText(c.query).split(/\s+/).filter(Boolean);
      for (i = 0; i < words.length; i++) {
        if (hay.indexOf(words[i]) === -1) return false;
      }
    }
    if (c.statuses.length && c.statuses.indexOf(nodeStatusKey(node)) === -1) {
      return false;
    }
    if (c.assignees.length) {
      list = node.assignees || [];
      ok = false;
      for (i = 0; i < c.assignees.length && !ok; i++) {
        var tok = c.assignees[i];
        if (tok === 'none') {
          ok = !list.length;
        } else if (tok === 'me') {
          for (var m = 0; m < list.length && !ok; m++) {
            ok = isMeAssignee(list[m], ctx.meIds);
          }
        } else {
          for (var q = 0; q < list.length && !ok; q++) {
            ok = String(list[q].id) === tok || String(list[q].trelloId || '') === tok;
          }
        }
      }
      if (!ok) return false;
    }
    if (c.priorities.length && c.priorities.indexOf(priorityKey(node)) === -1) {
      return false;
    }
    if (c.lists.length && c.lists.indexOf(String(node.listId || '')) === -1) {
      return false;
    }
    if (c.labels.length) {
      list = node.labels || [];
      ok = false;
      for (i = 0; i < list.length && !ok; i++) {
        ok = c.labels.indexOf(String(list[i].id)) !== -1;
      }
      if (!ok) return false;
    }
    if (c.due.length) {
      var today = ctx.today || toIsoDate(new Date());
      ok = false;
      for (i = 0; i < c.due.length && !ok; i++) {
        ok = dueBucketMatches(node, c.due[i], today);
      }
      if (!ok) return false;
    }
    return true;
  }

  /**
   * Facets present in the tree (for building filter chips), each with a count
   * of root + linked cards. Only real cards are counted.
   */
  function collectFacets(tree, ctx) {
    ctx = ctx || {};
    var facets = {
      total: 0,
      statuses: { started: 0, pending: 0, blocked: 0, completed: 0 },
      assignees: [],
      unassigned: 0,
      mine: 0,
      lists: [],
      labels: [],
      priorities: [],
      noPriority: 0,
    };
    var byPerson = Object.create(null);
    var byList = Object.create(null);
    var byLabel = Object.create(null);
    var byTier = Object.create(null);

    function walk(nodes) {
      for (var i = 0; i < (nodes || []).length; i++) {
        var n = nodes[i];
        if (!n) continue;
        if (n.kind === 'section') {
          walk(n.children);
          continue;
        }
        if (n.kind === 'card' && !n.missing) {
          facets.total++;
          facets.statuses[nodeStatusKey(n)]++;
          var people = n.assignees || [];
          if (!people.length) facets.unassigned++;
          var mine = false;
          for (var p = 0; p < people.length; p++) {
            var a = people[p];
            if (isMeAssignee(a, ctx.meIds)) mine = true;
            var rec =
              byPerson[a.id] ||
              (byPerson[a.id] = { id: a.id, name: a.name, initials: a.initials, count: 0 });
            rec.count++;
          }
          if (mine) facets.mine++;
          if (n.listId) {
            var lr =
              byList[n.listId] ||
              (byList[n.listId] = { id: n.listId, name: n.listName || '—', count: 0 });
            lr.count++;
          }
          var labs = n.labels || [];
          for (var l = 0; l < labs.length; l++) {
            var lb =
              byLabel[labs[l].id] ||
              (byLabel[labs[l].id] = {
                id: labs[l].id,
                name: labs[l].name || '',
                color: labs[l].color || '',
                count: 0,
              });
            lb.count++;
          }
          var pk = priorityKey(n);
          if (pk === 'none') {
            facets.noPriority++;
          } else {
            var pr =
              byTier[pk] ||
              (byTier[pk] = {
                key: pk,
                tier: Number(n.priorityTierI),
                label: n.priorityLabel || pk,
                fill: n.priorityFill || null,
                count: 0,
              });
            pr.count++;
          }
        }
        walk(n.children);
      }
    }
    walk(tree);

    function values(map) {
      return Object.keys(map).map(function (k) {
        return map[k];
      });
    }
    facets.assignees = values(byPerson).sort(function (x, y) {
      return String(x.name).localeCompare(String(y.name), 'fr');
    });
    facets.lists = values(byList).sort(function (x, y) {
      return String(x.name).localeCompare(String(y.name), 'fr');
    });
    facets.labels = values(byLabel).sort(function (x, y) {
      return String(x.name).localeCompare(String(y.name), 'fr');
    });
    facets.priorities = values(byTier).sort(function (x, y) {
      return x.tier - y.tier;
    });
    return facets;
  }

  /**
   * State section for a root card: En cours → À faire → Bloqué.
   * Blocked wins over list category when enAttente is set.
   * @returns {'started'|'pending'|'blocked'}
   */
  function stateSectionKey(node) {
    if (!node) return 'pending';
    if (node.kind === 'section' && node.sectionKey) {
      return node.sectionKey === 'started' || node.sectionKey === 'blocked'
        ? node.sectionKey
        : 'pending';
    }
    if (node.blocked || node.category === 'blocked') return 'blocked';
    if (node.category === 'started') return 'started';
    return 'pending';
  }

  function stateSectionLabel(sectionKey) {
    var key = sectionKey === 'started' || sectionKey === 'blocked' ? sectionKey : 'pending';
    return STATE_SECTION_LABELS[key];
  }

  // exports
  S.DUE_KEYS = DUE_KEYS;
  S.DUE_LABELS = DUE_LABELS;
  S.MAX_SORT_KEYS = MAX_SORT_KEYS;
  S.SORT_FIELDS = SORT_FIELDS;
  S.STATUS_KEYS = STATUS_KEYS;
  S.STATUS_LABELS = STATUS_LABELS;
  S.STATUS_RANK = STATUS_RANK;
  S.buildNestTree = buildNestTree;
  S.collectFacets = collectFacets;
  S.compareByKey = compareByKey;
  S.compareRootsByDate = compareRootsByDate;
  S.compareRootsByName = compareRootsByName;
  S.compareRootsByPriority = compareRootsByPriority;
  S.compareRootsByProgress = compareRootsByProgress;
  S.compareRootsBySubtasks = compareRootsBySubtasks;
  S.criteriaCount = criteriaCount;
  S.defaultSortDir = defaultSortDir;
  S.dueBucketMatches = dueBucketMatches;
  S.emptyCriteria = emptyCriteria;
  S.fieldCompare = fieldCompare;
  S.firstAssigneeName = firstAssigneeName;
  S.foldText = foldText;
  S.isMeAssignee = isMeAssignee;
  S.isSortField = isSortField;
  S.matchesCriteria = matchesCriteria;
  S.nodeStatusKey = nodeStatusKey;
  S.normalizeCriteria = normalizeCriteria;
  S.normalizeSortBy = normalizeSortBy;
  S.normalizeSortDir = normalizeSortDir;
  S.normalizeSortKeys = normalizeSortKeys;
  S.offHoursBands = offHoursBands;
  S.priorityKey = priorityKey;
  S.progressValue = progressValue;
  S.sortFieldDefaultDir = sortFieldDefaultDir;
  S.sortTreeRoots = sortTreeRoots;
  S.sortTreeRootsMulti = sortTreeRootsMulti;
  S.stateSectionKey = stateSectionKey;
  S.stateSectionLabel = stateSectionLabel;
  S.stringList = stringList;
  S.subtaskCountValue = subtaskCountValue;
  S.workHoursBand = workHoursBand;
})(typeof window !== 'undefined' ? window : this);
