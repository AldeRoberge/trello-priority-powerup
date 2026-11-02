/**
 * Gantt chart UI — toolbar, rows, bars, drag/resize (gantt.html).
 * Exposes window.GanttUI.mountGantt(mount, t, options).
 *
 * Role: DOM + pointer interactions. Layout math → GanttModel; load/save dates
 * → GanttTrello; optional Outlook sync via OutlookSync. Mini editors reuse
 * PriorityUI.mountMiniPriority / mountMiniDue / mountMiniBlocked.
 */
(function (global) {
  'use strict';

  var S = (global.GanttUiParts = global.GanttUiParts || {});

  var ROW_H = 40;
  var LABEL_W = 240;
  var EDGE_HANDLE_CLASS_START = 'gantt-bar-edge--start';
  var EDGE_HANDLE_CLASS_END = 'gantt-bar-edge--end';
  var MIN_TIMELINE_W = 640;
  var LABELS_W_MIN = 280;
  var LABELS_W_DEFAULT = 560;
  var LABELS_W_STORAGE_KEY = 'tp-gantt-labels-width';
  var FILTERS_STORAGE_KEY = 'tp-gantt-filters';
  var DEFAULT_FILTERS = {
    hideCompleted: true,
    hideUndated: false,
    hideBlocked: false,
    sortBy: 'date',
    sortDir: 'asc',
    sortKeys: [{ by: 'date', dir: 'asc' }],
    groupByStatus: true,
    groupByProject: false,
    criteria: {
      query: '',
      statuses: [],
      assignees: [],
      priorities: [],
      lists: [],
      labels: [],
      due: [],
    },
  };
  // Minimum header-column width per zoom mode. When the viewport is narrower,
  // the timeline grows past the scrollport so columns stay readable.
  var MIN_COL_W = {
    day: 32,
    week: 88,
    month: 30,
    year: 72,
  };
  // Priority dot for tiers strictly above Importante (Critique / Urgente / Prioritaire).
  var PRIORITY_FIRE_TIER_MAX = 2;

  function GM() {
    return global.GanttModel;
  }

  function GT() {
    return global.GanttTrello;
  }

  function playGanttUiSound(name, opts) {
    try {
      if (
        global.CelebrationEffects &&
        typeof global.CelebrationEffects.playUiSound === 'function'
      ) {
        return global.CelebrationEffects.playUiSound(name, opts || {});
      }
    } catch (e) {
      /* ignore */
    }
    return { ok: false };
  }

  function PU() {
    return global.PriorityUI;
  }

  function TC() {
    return global.TpConfirm || null;
  }

  function OA() {
    return global.OutlookAuth || null;
  }

  function OS() {
    return global.OutlookSync || null;
  }

  function OI() {
    return global.OutlookIcs || null;
  }

  function readStoredLabelsWidth() {
    try {
      var raw =
        global.localStorage && global.localStorage.getItem(LABELS_W_STORAGE_KEY);
      var n = raw != null ? parseInt(raw, 10) : NaN;
      if (isFinite(n) && n >= LABELS_W_MIN && n <= 1200) return n;
    } catch (e) {
      /* ignore */
    }
    return LABELS_W_DEFAULT;
  }

  function storeLabelsWidth(w) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(LABELS_W_STORAGE_KEY, String(w));
      }
    } catch (e) {
      /* ignore */
    }
  }

  function normalizeSortBy(value) {
    var model = GM();
    if (model && typeof model.normalizeSortBy === 'function') {
      return model.normalizeSortBy(value);
    }
    return value === 'priority' ||
      value === 'name' ||
      value === 'progress' ||
      value === 'subtasks'
      ? value
      : 'date';
  }

  function normalizeSortDir(value, sortBy) {
    if (value === 'asc' || value === 'desc') return value;
    var model = GM();
    if (model && typeof model.defaultSortDir === 'function') {
      return model.defaultSortDir(sortBy);
    }
    return sortBy === 'progress' || sortBy === 'subtasks' ? 'desc' : 'asc';
  }

  function normalizeSortKeysUi(raw) {
    var model = GM();
    if (model && typeof model.normalizeSortKeys === 'function') {
      return model.normalizeSortKeys(raw);
    }
    return [{ by: 'date', dir: 'asc' }];
  }

  function normalizeCriteriaUi(raw) {
    var model = GM();
    if (model && typeof model.normalizeCriteria === 'function') {
      return model.normalizeCriteria(raw);
    }
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

  function defaultFilters() {
    return {
      hideCompleted: DEFAULT_FILTERS.hideCompleted,
      hideUndated: DEFAULT_FILTERS.hideUndated,
      hideBlocked: DEFAULT_FILTERS.hideBlocked,
      sortBy: DEFAULT_FILTERS.sortBy,
      sortDir: DEFAULT_FILTERS.sortDir,
      sortKeys: normalizeSortKeysUi(DEFAULT_FILTERS.sortKeys),
      groupByStatus: DEFAULT_FILTERS.groupByStatus,
      groupByProject: DEFAULT_FILTERS.groupByProject,
      criteria: normalizeCriteriaUi(DEFAULT_FILTERS.criteria),
    };
  }

  /**
   * Stored preferences. `sortBy` / `sortDir` mirror the first sort level (older
   * saves only had those); `sortKeys` is the full multi-level sort. The search
   * text is never restored so the chart does not open mysteriously filtered.
   */
  function readStoredFilters() {
    var out = defaultFilters();
    try {
      var raw =
        global.localStorage && global.localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) return out;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return out;
      if (typeof parsed.hideCompleted === 'boolean') {
        out.hideCompleted = parsed.hideCompleted;
      }
      if (typeof parsed.hideUndated === 'boolean') {
        out.hideUndated = parsed.hideUndated;
      }
      if (typeof parsed.hideBlocked === 'boolean') {
        out.hideBlocked = parsed.hideBlocked;
      }
      if (typeof parsed.groupByStatus === 'boolean') {
        out.groupByStatus = parsed.groupByStatus;
      }
      if (typeof parsed.groupByProject === 'boolean') {
        out.groupByProject = parsed.groupByProject;
      }
      if (out.groupByProject) out.groupByStatus = false;
      if (Array.isArray(parsed.sortKeys) && parsed.sortKeys.length) {
        out.sortKeys = normalizeSortKeysUi(parsed.sortKeys);
      } else if (typeof parsed.sortBy === 'string') {
        var by = normalizeSortBy(parsed.sortBy);
        out.sortKeys = [{ by: by, dir: normalizeSortDir(parsed.sortDir, by) }];
      }
      out.sortBy = out.sortKeys[0].by;
      out.sortDir = out.sortKeys[0].dir;
      if (parsed.criteria && typeof parsed.criteria === 'object') {
        out.criteria = normalizeCriteriaUi(parsed.criteria);
        out.criteria.query = '';
      }
    } catch (e) {
      return defaultFilters();
    }
    return out;
  }

  function storeFilters(filters) {
    filters = filters || {};
    var sortKeys;
    if (Array.isArray(filters.sortKeys) && filters.sortKeys.length) {
      sortKeys = normalizeSortKeysUi(filters.sortKeys);
    } else {
      var by = normalizeSortBy(filters.sortBy);
      sortKeys = [{ by: by, dir: normalizeSortDir(filters.sortDir, by) }];
    }
    var criteria = normalizeCriteriaUi(filters.criteria);
    criteria.query = '';
    var payload = {
      hideCompleted:
        typeof filters.hideCompleted === 'boolean'
          ? filters.hideCompleted
          : DEFAULT_FILTERS.hideCompleted,
      hideUndated:
        typeof filters.hideUndated === 'boolean'
          ? filters.hideUndated
          : DEFAULT_FILTERS.hideUndated,
      hideBlocked:
        typeof filters.hideBlocked === 'boolean'
          ? filters.hideBlocked
          : DEFAULT_FILTERS.hideBlocked,
      sortBy: sortKeys[0].by,
      sortDir: sortKeys[0].dir,
      sortKeys: sortKeys,
      groupByStatus:
        typeof filters.groupByStatus === 'boolean'
          ? filters.groupByStatus
          : DEFAULT_FILTERS.groupByStatus,
      groupByProject:
        typeof filters.groupByProject === 'boolean'
          ? filters.groupByProject
          : DEFAULT_FILTERS.groupByProject,
      criteria: criteria,
    };
    try {
      if (global.localStorage) {
        global.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload));
      }
    } catch (e) {
      /* ignore */
    }
    return payload;
  }

  /**
   * Clamp labels column width. `chartWidthOrEl` may be a pixel number or an element with clientWidth.
   */
  function clampLabelsWidth(width, chartWidthOrEl) {
    var chartW = 1000;
    if (typeof chartWidthOrEl === 'number' && chartWidthOrEl > 0) {
      chartW = chartWidthOrEl;
    } else if (chartWidthOrEl && chartWidthOrEl.clientWidth) {
      chartW = chartWidthOrEl.clientWidth;
    }
    var min =
      global.ViewShell && typeof global.ViewShell.labelsMin === 'function'
        ? global.ViewShell.labelsMin(chartW)
        : LABELS_W_MIN;
    var room = chartW < 640 ? 120 : 220;
    var max = Math.max(min, chartW - room);
    if (chartW < 640) max = Math.max(min, Math.min(max, Math.round(chartW * 0.46))); // phone: the timeline keeps more than half
    var w = Math.round(Number(width) || LABELS_W_DEFAULT);
    return Math.max(min, Math.min(max, w));
  }

  /**
   * Text colour that reads best on a bar of colour `bg` (white or dark navy,
   * whichever contrasts more). Bar colours are user-configurable and can be
   * pale. Returns null when `bg` is not a hex / rgb() colour.
   */
  function barTextColor(bg) {
    var s = typeof bg === 'string' ? bg.trim() : '';
    var rgb = null;
    var hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (hex) {
      var h = hex[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      rgb = [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ];
    } else {
      var fn = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
      if (fn) rgb = [Number(fn[1]), Number(fn[2]), Number(fn[3])];
    }
    if (!rgb) return null;
    var lin = rgb.map(function (v) {
      var c = Math.min(255, v) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    var lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    var dark = '#172b4d';
    var darkLum = 0.0246; // relative luminance of #172b4d
    var onWhite = 1.05 / (lum + 0.05);
    var onDark = (lum + 0.05) / (darkLum + 0.05);
    return onWhite >= onDark ? '#ffffff' : dark;
  }

  function minColumnWidth(mode) {
    var m =
      GM() && typeof GM().normalizeViewMode === 'function'
        ? GM().normalizeViewMode(mode)
        : mode;
    return MIN_COL_W[m] || MIN_COL_W.week;
  }

  /**
   * Timeline pixel width for the current zoom: fill the scrollport when possible,
   * otherwise expand so each header column keeps a readable minimum width.
   */
  function computeTimelineWidth(availPx, mode, columnCount, zoom) {
    var avail = Math.max(0, Math.round(Number(availPx) || 0));
    var cols = Math.max(1, Math.round(Number(columnCount) || 1));
    var minContent = cols * minColumnWidth(mode);
    var z = Number(zoom);
    if (!(z >= 1) || !isFinite(z)) z = 1;
    return Math.max(Math.round(Math.max(avail, minContent) * z), 1);
  }

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  function iconEl(tiClass, title, extraClass) {
    var wrap = el(
      'span',
      'gantt-detail-icon' + (extraClass ? ' ' + extraClass : '')
    );
    if (title) wrap.title = title;
    var i = el('i', 'ti ' + tiClass);
    i.setAttribute('aria-hidden', 'true');
    wrap.appendChild(i);
    return wrap;
  }

  function iconButton(tiClass, title, extraClass) {
    var wrap = el(
      'button',
      'gantt-detail-icon gantt-detail-icon--btn' +
        (extraClass ? ' ' + extraClass : ''),
      { type: 'button', title: title || '' }
    );
    if (title) wrap.setAttribute('aria-label', title);
    var i = el('i', 'ti ' + tiClass);
    i.setAttribute('aria-hidden', 'true');
    wrap.appendChild(i);
    return wrap;
  }

  function priorityDotEl(title, fill, muted) {
    var wrap = el(
      'button',
      'gantt-detail-icon gantt-detail-icon--btn is-priority' +
        (muted ? ' is-priority-muted' : ''),
      { type: 'button', title: title || 'Priorit\u00e9' }
    );
    wrap.setAttribute('aria-label', title || 'Priorit\u00e9');
    var dot = el('span', 'gantt-priority-dot');
    dot.setAttribute('aria-hidden', 'true');
    if (fill) dot.style.backgroundColor = fill;
    wrap.appendChild(dot);
    return wrap;
  }

  function priorityFireTierMax() {
    var ui = PU();
    if (ui && ui.TIER_I && typeof ui.TIER_I.IMPORTANTE === 'number') {
      return ui.TIER_I.IMPORTANTE - 1;
    }
    return PRIORITY_FIRE_TIER_MAX;
  }

  function shouldShowPriorityFire(row) {
    if (!row || row.priorityEnabled === false) return false;
    if (row.priorityTierI == null || !isFinite(Number(row.priorityTierI))) {
      return false;
    }
    return Number(row.priorityTierI) <= priorityFireTierMax();
  }

  function mountGantt(mount, t, options) {
    var M = Object.create(null);
    M.mount = mount;
    M.t = t;
    M.options = options;
    var __parts = (global.GanttUiPartsMountMountGantt || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  global.GanttUI = {
    mountGantt: mountGantt,
    clampLabelsWidth: clampLabelsWidth,
    barTextColor: barTextColor,
    minColumnWidth: minColumnWidth,
    computeTimelineWidth: computeTimelineWidth,
    readStoredLabelsWidth: readStoredLabelsWidth,
    storeLabelsWidth: storeLabelsWidth,
    readStoredFilters: readStoredFilters,
    storeFilters: storeFilters,
    shouldShowPriorityFire: shouldShowPriorityFire,
    LABELS_W_MIN: LABELS_W_MIN,
    LABELS_W_DEFAULT: LABELS_W_DEFAULT,
    LABELS_W_STORAGE_KEY: LABELS_W_STORAGE_KEY,
    FILTERS_STORAGE_KEY: FILTERS_STORAGE_KEY,
    DEFAULT_FILTERS: DEFAULT_FILTERS,
    MIN_COL_W: MIN_COL_W,
  };

  // shared with the mountGantt parts
  S.DEFAULT_FILTERS = DEFAULT_FILTERS;
  S.EDGE_HANDLE_CLASS_END = EDGE_HANDLE_CLASS_END;
  S.EDGE_HANDLE_CLASS_START = EDGE_HANDLE_CLASS_START;
  S.FILTERS_STORAGE_KEY = FILTERS_STORAGE_KEY;
  S.GM = GM;
  S.GT = GT;
  S.LABELS_W_DEFAULT = LABELS_W_DEFAULT;
  S.LABELS_W_MIN = LABELS_W_MIN;
  S.LABELS_W_STORAGE_KEY = LABELS_W_STORAGE_KEY;
  S.LABEL_W = LABEL_W;
  S.MIN_COL_W = MIN_COL_W;
  S.MIN_TIMELINE_W = MIN_TIMELINE_W;
  S.OA = OA;
  S.OI = OI;
  S.OS = OS;
  S.PRIORITY_FIRE_TIER_MAX = PRIORITY_FIRE_TIER_MAX;
  S.PU = PU;
  S.ROW_H = ROW_H;
  S.TC = TC;
  S.barTextColor = barTextColor;
  S.clampLabelsWidth = clampLabelsWidth;
  S.computeTimelineWidth = computeTimelineWidth;
  S.defaultFilters = defaultFilters;
  S.el = el;
  S.iconButton = iconButton;
  S.iconEl = iconEl;
  S.minColumnWidth = minColumnWidth;
  S.mountGantt = mountGantt;
  S.normalizeCriteriaUi = normalizeCriteriaUi;
  S.normalizeSortBy = normalizeSortBy;
  S.normalizeSortDir = normalizeSortDir;
  S.normalizeSortKeysUi = normalizeSortKeysUi;
  S.playGanttUiSound = playGanttUiSound;
  S.priorityDotEl = priorityDotEl;
  S.priorityFireTierMax = priorityFireTierMax;
  S.readStoredFilters = readStoredFilters;
  S.readStoredLabelsWidth = readStoredLabelsWidth;
  S.shouldShowPriorityFire = shouldShowPriorityFire;
  S.storeFilters = storeFilters;
  S.storeLabelsWidth = storeLabelsWidth;
})(typeof window !== 'undefined' ? window : this);
