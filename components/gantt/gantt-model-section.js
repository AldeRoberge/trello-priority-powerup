/**
 * gantt-model: part 3 of 3 (makeStateSectionHeader).
 * Names are shared with the other parts through window.GanttModelParts (see gantt-model.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.GanttModelParts = global.GanttModelParts || {});

  // from earlier parts (values)
  var AGENDA_SNAP_MINUTES = S.AGENDA_SNAP_MINUTES;
  var DEFAULT_DAY_END = S.DEFAULT_DAY_END;
  var DEFAULT_DAY_START = S.DEFAULT_DAY_START;
  var DUE_KEYS = S.DUE_KEYS;
  var DUE_LABELS = S.DUE_LABELS;
  var MAX_SORT_KEYS = S.MAX_SORT_KEYS;
  var MS_DAY = S.MS_DAY;
  var MS_MINUTE = S.MS_MINUTE;
  var OFF_HOURS_VISUAL_SHARE = S.OFF_HOURS_VISUAL_SHARE;
  var SORT_FIELDS = S.SORT_FIELDS;
  var STATE_SECTION_LABELS = S.STATE_SECTION_LABELS;
  var STATE_SECTION_ORDER = S.STATE_SECTION_ORDER;
  var STATUS_KEYS = S.STATUS_KEYS;
  var STATUS_LABELS = S.STATUS_LABELS;
  var VIEW_MODES = S.VIEW_MODES;

  // from other parts (functions, resolved at call time)
  function addDays() { return S.addDays.apply(this, arguments); }
  function addPeriods() { return S.addPeriods.apply(this, arguments); }
  function barGeometry() { return S.barGeometry.apply(this, arguments); }
  function buildNestTree() { return S.buildNestTree.apply(this, arguments); }
  function buildTimeWarp() { return S.buildTimeWarp.apply(this, arguments); }
  function collectFacets() { return S.collectFacets.apply(this, arguments); }
  function combineDateTime() { return S.combineDateTime.apply(this, arguments); }
  function compareRootsByPriority() { return S.compareRootsByPriority.apply(this, arguments); }
  function compareRootsByProgress() { return S.compareRootsByProgress.apply(this, arguments); }
  function compareRootsBySubtasks() { return S.compareRootsBySubtasks.apply(this, arguments); }
  function criteriaCount() { return S.criteriaCount.apply(this, arguments); }
  function dateTimeToX() { return S.dateTimeToX.apply(this, arguments); }
  function dateToX() { return S.dateToX.apply(this, arguments); }
  function dayDiff() { return S.dayDiff.apply(this, arguments); }
  function defaultSortDir() { return S.defaultSortDir.apply(this, arguments); }
  function emptyCriteria() { return S.emptyCriteria.apply(this, arguments); }
  function endOfMonth() { return S.endOfMonth.apply(this, arguments); }
  function endOfWeek() { return S.endOfWeek.apply(this, arguments); }
  function endOfYear() { return S.endOfYear.apply(this, arguments); }
  function formatNowLineTitle() { return S.formatNowLineTitle.apply(this, arguments); }
  function intervalToParts() { return S.intervalToParts.apply(this, arguments); }
  function matchesCriteria() { return S.matchesCriteria.apply(this, arguments); }
  function nodeStatusKey() { return S.nodeStatusKey.apply(this, arguments); }
  function normalizeCriteria() { return S.normalizeCriteria.apply(this, arguments); }
  function normalizeSortBy() { return S.normalizeSortBy.apply(this, arguments); }
  function normalizeSortDir() { return S.normalizeSortDir.apply(this, arguments); }
  function normalizeSortKeys() { return S.normalizeSortKeys.apply(this, arguments); }
  function normalizeViewMode() { return S.normalizeViewMode.apply(this, arguments); }
  function normalizeWorkTime() { return S.normalizeWorkTime.apply(this, arguments); }
  function offHoursBands() { return S.offHoursBands.apply(this, arguments); }
  function orderedInterval() { return S.orderedInterval.apply(this, arguments); }
  function parseIsoDate() { return S.parseIsoDate.apply(this, arguments); }
  function parseTime() { return S.parseTime.apply(this, arguments); }
  function priorityKey() { return S.priorityKey.apply(this, arguments); }
  function rangeDayCount() { return S.rangeDayCount.apply(this, arguments); }
  function realFracToVisual() { return S.realFracToVisual.apply(this, arguments); }
  function relativeDayKey() { return S.relativeDayKey.apply(this, arguments); }
  function relativeDayLabel() { return S.relativeDayLabel.apply(this, arguments); }
  function resizeInterval() { return S.resizeInterval.apply(this, arguments); }
  function resizeIntervalMs() { return S.resizeIntervalMs.apply(this, arguments); }
  function resolveBarInterval() { return S.resolveBarInterval.apply(this, arguments); }
  function selectAllCheckboxState() { return S.selectAllCheckboxState.apply(this, arguments); }
  function shiftAnchor() { return S.shiftAnchor.apply(this, arguments); }
  function shiftInterval() { return S.shiftInterval.apply(this, arguments); }
  function shiftIntervalMs() { return S.shiftIntervalMs.apply(this, arguments); }
  function snapDate() { return S.snapDate.apply(this, arguments); }
  function snapDateTime() { return S.snapDateTime.apply(this, arguments); }
  function sortFieldDefaultDir() { return S.sortFieldDefaultDir.apply(this, arguments); }
  function sortTreeRoots() { return S.sortTreeRoots.apply(this, arguments); }
  function sortTreeRootsMulti() { return S.sortTreeRootsMulti.apply(this, arguments); }
  function spanRange() { return S.spanRange.apply(this, arguments); }
  function startOfDay() { return S.startOfDay.apply(this, arguments); }
  function startOfMonth() { return S.startOfMonth.apply(this, arguments); }
  function startOfWeek() { return S.startOfWeek.apply(this, arguments); }
  function startOfYear() { return S.startOfYear.apply(this, arguments); }
  function stateSectionKey() { return S.stateSectionKey.apply(this, arguments); }
  function stateSectionLabel() { return S.stateSectionLabel.apply(this, arguments); }
  function timelinePxPerSecond() { return S.timelinePxPerSecond.apply(this, arguments); }
  function toIsoDate() { return S.toIsoDate.apply(this, arguments); }
  function toIsoTime() { return S.toIsoTime.apply(this, arguments); }
  function viewRange() { return S.viewRange.apply(this, arguments); }
  function visualFracToReal() { return S.visualFracToReal.apply(this, arguments); }
  function workDayFractions() { return S.workDayFractions.apply(this, arguments); }
  function workHoursBand() { return S.workHoursBand.apply(this, arguments); }
  function xToDate() { return S.xToDate.apply(this, arguments); }
  function xToDateTime() { return S.xToDateTime.apply(this, arguments); }

  function makeStateSectionHeader(sectionKey) {
    var key =
      sectionKey === 'started' || sectionKey === 'blocked' ? sectionKey : 'pending';
    return {
      id: 'section:' + key,
      kind: 'section',
      sectionKey: key,
      name: STATE_SECTION_LABELS[key],
      category: key === 'pending' ? 'unstarted' : key,
      categoryLabel: STATE_SECTION_LABELS[key],
      depth: 0,
      expandable: true,
      children: [],
      progress: 0,
      done: false,
      startDate: '',
      dueDate: '',
      cardId: null,
      parentCardId: null,
      itemId: null,
      blocked: key === 'blocked',
      subtaskCount: 0,
    };
  }

  function isNodeExpanded(node, expandedSet) {
    if (!node) return false;
    expandedSet = expandedSet || {};
    if (expandedSet[node.id] === true) return true;
    if (expandedSet[node.id] === false) return false;
    // Depth-0 expandable nodes (task roots and state sections) start open.
    return !!(node.depth === 0 && node.expandable);
  }

  /**
   * Group roots into En cours → À faire → Bloqué sections (tasks as children),
   * sorting within each section with the usual sortTreeRoots rules.
   * All three section headers are always shown (even when empty) so status
   * is visible and section drag-drop always has a target.
   */
  function sortTreeRootsGroupedByState(nodes, sortBy, sortDir, opts) {
    var multi = Array.isArray(sortBy);
    if (opts && opts.group === false) {
      var all = [];
      (nodes || []).forEach(function (n) {
        if (!n) return;
        if (n.kind === 'section') {
          (n.children || []).forEach(function (c) {
            if (c) all.push(c);
          });
        } else {
          all.push(n);
        }
      });
      return multi
        ? sortTreeRootsMulti(all, sortBy)
        : sortTreeRoots(all, sortBy, sortDir);
    }
    var buckets = {
      started: [],
      pending: [],
      blocked: [],
    };
    function bucketNode(n) {
      if (!n || n.kind === 'section') return;
      buckets[stateSectionKey(n)].push(n);
    }
    (nodes || []).forEach(function (n) {
      if (!n) return;
      if (n.kind === 'section') {
        (n.children || []).forEach(bucketNode);
        return;
      }
      bucketNode(n);
    });
    var out = [];
    for (var i = 0; i < STATE_SECTION_ORDER.length; i++) {
      var key = STATE_SECTION_ORDER[i];
      var sorted = multi
        ? sortTreeRootsMulti(buckets[key], sortBy)
        : sortTreeRoots(buckets[key], sortBy, sortDir);
      var header = makeStateSectionHeader(key);
      header.children = sorted;
      header.expandable = sorted.length > 0;
      header.subtaskCount = sorted.length;
      out.push(header);
    }
    return out;
  }

  /** A project section (or "Sans projet" when `project` is null). */
  function makeProjectSectionHeader(project) {
    var id = project && project.id ? String(project.id) : '';
    return {
      id: 'section:project:' + id,
      kind: 'section',
      sectionKey: 'project',
      projectId: id,
      icon: project && project.icon ? project.icon : null,
      priority: project && typeof project.priority === 'number' ? project.priority : null,
      name: project && project.name ? String(project.name) : 'Sans projet',
      category: null,
      categoryLabel: '',
      depth: 0,
      expandable: true,
      children: [],
      progress: 0,
      done: false,
      startDate: '',
      dueDate: '',
      cardId: null,
      parentCardId: null,
      itemId: null,
      blocked: false,
      subtaskCount: 0,
    };
  }

  function unwrapSectionRoots(nodes) {
    var all = [];
    (nodes || []).forEach(function (n) {
      if (!n) return;
      if (n.kind === 'section') {
        (n.children || []).forEach(function (c) {
          if (c) all.push(c);
        });
      } else {
        all.push(n);
      }
    });
    return all;
  }

  /**
   * Group roots under their project (name order), "Sans projet" last.
   * opts.projectOf(node) -> { id, name } | null. Subtasks stay on their card.
   * When nothing belongs to a project, the list stays flat. opts.group === false unwraps.
   */
  function sortTreeRootsGroupedByProject(nodes, sortBy, sortDir, opts) {
    opts = opts || {};
    var multi = Array.isArray(sortBy);
    var roots = unwrapSectionRoots(nodes);
    function sorted(list) {
      return multi ? sortTreeRootsMulti(list, sortBy) : sortTreeRoots(list, sortBy, sortDir);
    }
    if (opts.group === false) return sorted(roots);
    var projectOf = typeof opts.projectOf === 'function' ? opts.projectOf : function () { return null; };
    var buckets = [];
    var byId = Object.create(null);
    var free = [];
    roots.forEach(function (n) {
      if (!n || n.kind === 'section') return;
      var p = null;
      try { p = projectOf(n); } catch (e) { p = null; }
      if (!p || !p.id) { free.push(n); return; }
      var id = String(p.id);
      var g = byId[id];
      if (!g) {
        g = {
          id: id,
          name: String(p.name || 'Projet'),
          icon: p.icon || null,
          priority: typeof p.priority === 'number' ? p.priority : null,
          rows: [],
        };
        byId[id] = g;
        buckets.push(g);
      }
      g.rows.push(n);
    });
    if (!buckets.length) return sorted(roots);
    buckets.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base' });
    });
    var out = [];
    buckets.forEach(function (g) {
      var header = makeProjectSectionHeader(g);
      header.children = sorted(g.rows);
      header.expandable = header.children.length > 0;
      header.subtaskCount = header.children.length;
      out.push(header);
    });
    if (free.length) {
      var loose = makeProjectSectionHeader(null);
      loose.children = sorted(free);
      loose.expandable = loose.children.length > 0;
      loose.subtaskCount = loose.children.length;
      out.push(loose);
    }
    return out;
  }

  /**
   * Drop section headers that have no visible task rows after them.
   * Collapsed sections with children are kept so the header stays clickable.
   * En cours / À faire / Bloqué headers are always kept, even when empty.
   */
  function pruneEmptyStateSections(rows, expandedSet) {
    var list = rows || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row) continue;
      if (row.kind === 'section') {
        var sectionKey = row.sectionKey;
        if (
          sectionKey === 'started' ||
          sectionKey === 'pending' ||
          sectionKey === 'blocked'
        ) {
          out.push(row);
          continue;
        }
        var hasTask = false;
        for (var j = i + 1; j < list.length; j++) {
          if (!list[j]) continue;
          if (list[j].kind === 'section') break;
          hasTask = true;
          break;
        }
        if (hasTask) {
          out.push(row);
          continue;
        }
        if (
          !isNodeExpanded(row, expandedSet) &&
          row.children &&
          row.children.length
        ) {
          out.push(row);
        }
        continue;
      }
      out.push(row);
    }
    return out;
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
        var open = isNodeExpanded(n, expandedSet);
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
    var hasCriteria = criteriaCount(options.criteria) > 0;
    var ctx = { meIds: options.meIds || [], today: options.today };
    // Rows of a card that fails the criteria (its subtasks, linked cards) go too.
    var skipBelow = -1;
    return (rows || []).filter(function (row) {
      if (!row) return false;
      // Section headers stay until pruneEmptyStateSections runs.
      if (row.kind === 'section') {
        skipBelow = -1;
        return true;
      }
      var depth = typeof row.depth === 'number' ? row.depth : 0;
      if (skipBelow >= 0) {
        if (depth > skipBelow) return false;
        skipBelow = -1;
      }
      if (hasCriteria && row.kind === 'card' && !row.missing) {
        if (!matchesCriteria(row, options.criteria, ctx)) {
          skipBelow = depth;
          return false;
        }
      }
      if (options.hideCompleted && (row.done || row.category === 'completed')) {
        return false;
      }
      if (options.hideBlocked && (row.blocked || row.category === 'blocked')) {
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

  /**
   * Ids of nodes in the subtree that have children (need expanding to show cascade).
   * @returns {string[]}
   */
  function collectExpandableSubtreeIds(node) {
    var out = [];
    function walk(n) {
      if (!n || n.id == null || n.id === '') return;
      var kids = n.children || [];
      if (kids.length) {
        out.push(String(n.id));
        for (var i = 0; i < kids.length; i++) walk(kids[i]);
      }
    }
    walk(node);
    return out;
  }

  /**
   * Depth-first list of every node in the nest tree (ignores expand/collapse).
   */
  function flattenAll(nodes) {
    var out = [];
    function walk(list) {
      for (var i = 0; i < (list || []).length; i++) {
        var n = list[i];
        if (!n) continue;
        out.push(n);
        if (n.children && n.children.length) walk(n.children);
      }
    }
    walk(nodes);
    return out;
  }

  /**
   * Checkbox state for a row given a selected-id map (cascade-aware).
   * @returns {{ checked: boolean, indeterminate: boolean }}
   */
  function rowSelectionState(node, selectedMap) {
    selectedMap = selectedMap || {};
    if (!node || node.id == null || node.id === '') {
      return { checked: false, indeterminate: false };
    }
    var ids = collectSubtreeIds(node);
    if (ids.length <= 1) {
      var alone = !!selectedMap[String(node.id)];
      return { checked: alone, indeterminate: false };
    }
    var selected = 0;
    for (var i = 0; i < ids.length; i++) {
      if (selectedMap[ids[i]]) selected += 1;
    }
    if (!selected) return { checked: false, indeterminate: false };
    if (selected >= ids.length) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  }

  global.GanttModel = {
    VIEW_MODES: VIEW_MODES,
    MS_DAY: MS_DAY,
    MS_MINUTE: MS_MINUTE,
    DEFAULT_DAY_START: DEFAULT_DAY_START,
    DEFAULT_DAY_END: DEFAULT_DAY_END,
    AGENDA_SNAP_MINUTES: AGENDA_SNAP_MINUTES,
    toIsoDate: toIsoDate,
    toIsoTime: toIsoTime,
    parseIsoDate: parseIsoDate,
    parseTime: parseTime,
    combineDateTime: combineDateTime,
    normalizeWorkTime: normalizeWorkTime,
    startOfDay: startOfDay,
    addDays: addDays,
    dayDiff: dayDiff,
    relativeDayLabel: relativeDayLabel,
    relativeDayKey: relativeDayKey,
    startOfWeek: startOfWeek,
    endOfWeek: endOfWeek,
    startOfMonth: startOfMonth,
    endOfMonth: endOfMonth,
    startOfYear: startOfYear,
    endOfYear: endOfYear,
    normalizeViewMode: normalizeViewMode,
    viewRange: viewRange,
    shiftAnchor: shiftAnchor,
    addPeriods: addPeriods,
    spanRange: spanRange,
    resolveBarInterval: resolveBarInterval,
    rangeDayCount: rangeDayCount,
    dateToX: dateToX,
    dateTimeToX: dateTimeToX,
    xToDate: xToDate,
    xToDateTime: xToDateTime,
    timelinePxPerSecond: timelinePxPerSecond,
    formatNowLineTitle: formatNowLineTitle,
    buildTimeWarp: buildTimeWarp,
    realFracToVisual: realFracToVisual,
    visualFracToReal: visualFracToReal,
    OFF_HOURS_VISUAL_SHARE: OFF_HOURS_VISUAL_SHARE,
    snapDate: snapDate,
    snapDateTime: snapDateTime,
    shiftInterval: shiftInterval,
    shiftIntervalMs: shiftIntervalMs,
    resizeInterval: resizeInterval,
    resizeIntervalMs: resizeIntervalMs,
    orderedInterval: orderedInterval,
    selectAllCheckboxState: selectAllCheckboxState,
    intervalToParts: intervalToParts,
    barGeometry: barGeometry,
    workHoursBand: workHoursBand,
    workDayFractions: workDayFractions,
    offHoursBands: offHoursBands,
    buildNestTree: buildNestTree,
    flattenVisible: flattenVisible,
    filterRows: filterRows,
    findNodeById: findNodeById,
    collectSubtreeIds: collectSubtreeIds,
    collectExpandableSubtreeIds: collectExpandableSubtreeIds,
    flattenAll: flattenAll,
    rowSelectionState: rowSelectionState,
    compareRootsByPriority: compareRootsByPriority,
    compareRootsByProgress: compareRootsByProgress,
    compareRootsBySubtasks: compareRootsBySubtasks,
    normalizeSortBy: normalizeSortBy,
    defaultSortDir: defaultSortDir,
    normalizeSortDir: normalizeSortDir,
    sortTreeRoots: sortTreeRoots,
    SORT_FIELDS: SORT_FIELDS,
    MAX_SORT_KEYS: MAX_SORT_KEYS,
    normalizeSortKeys: normalizeSortKeys,
    sortFieldDefaultDir: sortFieldDefaultDir,
    sortTreeRootsMulti: sortTreeRootsMulti,
    nodeStatusKey: nodeStatusKey,
    STATUS_KEYS: STATUS_KEYS,
    STATUS_LABELS: STATUS_LABELS,
    DUE_KEYS: DUE_KEYS,
    DUE_LABELS: DUE_LABELS,
    emptyCriteria: emptyCriteria,
    normalizeCriteria: normalizeCriteria,
    criteriaCount: criteriaCount,
    priorityKey: priorityKey,
    matchesCriteria: matchesCriteria,
    collectFacets: collectFacets,
    STATE_SECTION_ORDER: STATE_SECTION_ORDER,
    STATE_SECTION_LABELS: STATE_SECTION_LABELS,
    stateSectionKey: stateSectionKey,
    stateSectionLabel: stateSectionLabel,
    makeStateSectionHeader: makeStateSectionHeader,
    isNodeExpanded: isNodeExpanded,
    sortTreeRootsGroupedByState: sortTreeRootsGroupedByState,
    sortTreeRootsGroupedByProject: sortTreeRootsGroupedByProject,
    makeProjectSectionHeader: makeProjectSectionHeader,
    pruneEmptyStateSections: pruneEmptyStateSections,
  };

  // exports
  S.collectExpandableSubtreeIds = collectExpandableSubtreeIds;
  S.collectSubtreeIds = collectSubtreeIds;
  S.filterRows = filterRows;
  S.findNodeById = findNodeById;
  S.flattenAll = flattenAll;
  S.flattenVisible = flattenVisible;
  S.isNodeExpanded = isNodeExpanded;
  S.makeProjectSectionHeader = makeProjectSectionHeader;
  S.makeStateSectionHeader = makeStateSectionHeader;
  S.pruneEmptyStateSections = pruneEmptyStateSections;
  S.rowSelectionState = rowSelectionState;
  S.sortTreeRootsGroupedByProject = sortTreeRootsGroupedByProject;
  S.sortTreeRootsGroupedByState = sortTreeRootsGroupedByState;
  S.unwrapSectionRoots = unwrapSectionRoots;
})(typeof window !== 'undefined' ? window : this);
