/* Gantt chart — pure layout / date math (no DOM, no Trello). */
(function (global) {
  'use strict';

  var VIEW_MODES = ['day', 'week', 'month', 'year'];
  var MS_DAY = 24 * 60 * 60 * 1000;
  var MS_MINUTE = 60 * 1000;
  var DEFAULT_DAY_START = '08:15';
  var DEFAULT_DAY_END = '16:45';
  var AGENDA_SNAP_MINUTES = 15;
  var WEEKDAY_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var WEEKDAY_LONG = [
    'Dimanche',
    'Lundi',
    'Mardi',
    'Mercredi',
    'Jeudi',
    'Vendredi',
    'Samedi',
  ];
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

  /** Gantt state sections (Statut): En cours → À faire → Bloqué. */
  var STATE_SECTION_ORDER = ['started', 'pending', 'blocked'];
  var STATE_SECTION_LABELS = {
    started: 'En cours',
    pending: '\u00c0 faire',
    blocked: 'Bloqu\u00e9',
  };

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

  /** Parse `HH:MM` → `{ hours, minutes }` or null. */
  function parseTime(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return null;
    var trimmed = value.trim();
    var m = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    if (!m) return null;
    var hours = Number(m[1]);
    var minutes = Number(m[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return { hours: hours, minutes: minutes };
  }

  function toIsoTime(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
  }

  /** Combine a calendar date with optional `HH:MM` (midnight when time omitted). */
  function combineDateTime(dateOrIso, timeStr) {
    var d =
      dateOrIso instanceof Date
        ? startOfDay(dateOrIso)
        : parseIsoDate(dateOrIso);
    if (!d) return null;
    var out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var t = parseTime(timeStr);
    if (t) out.setHours(t.hours, t.minutes, 0, 0);
    return out;
  }

  function normalizeWorkTime(value, fallback) {
    var t = parseTime(value);
    if (t) return pad2(t.hours) + ':' + pad2(t.minutes);
    var fb = parseTime(fallback);
    if (fb) return pad2(fb.hours) + ':' + pad2(fb.minutes);
    return fallback || '';
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

  function columnLabel(date, mode, now) {
    if (mode === 'year') {
      return MONTH_SHORT[date.getMonth()] || String(date.getMonth() + 1);
    }
    if (mode === 'day') {
      var relative = relativeDayLabel(date, now);
      if (relative) return relative;
      return WEEKDAY_LONG[date.getDay()] || WEEKDAY_SHORT[date.getDay()];
    }
    var relativeDay = relativeDayLabel(date, now);
    if (relativeDay) return relativeDay;
    if (mode === 'month') {
      return String(date.getDate());
    }
    // Week view: full weekday names (Lundi, Mardi, Mercredi, …).
    return WEEKDAY_LONG[date.getDay()] || WEEKDAY_SHORT[date.getDay()];
  }

  /**
   * French relative day label vs `now` (defaults to today).
   * @returns {''|'Aujourd\'hui'|'Demain'|'Hier'}
   */
  function relativeDayLabel(date, now) {
    var key = relativeDayKey(date, now);
    if (key === 'today') return "Aujourd'hui";
    if (key === 'tomorrow') return 'Demain';
    if (key === 'yesterday') return 'Hier';
    return '';
  }

  /**
   * @returns {null|'today'|'tomorrow'|'yesterday'}
   */
  function relativeDayKey(date, now) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return null;
    var d = startOfDay(date);
    var n = startOfDay(now instanceof Date && !isNaN(now.getTime()) ? now : new Date());
    var diff = dayDiff(d, n);
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff === -1) return 'yesterday';
    return null;
  }

  /**
   * Visible window + header columns for a zoom mode, anchored on `anchor`.
   * @param {Date} [now] — reference day for Aujourd'hui / Demain / Hier labels
   * @returns {{ mode, start: Date, end: Date, columns: Array }}
   */
  function viewRange(mode, anchor, now) {
    var m = normalizeViewMode(mode);
    var a = parseIsoDate(anchor) || startOfDay(new Date());
    var ref = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
    var start;
    var end;
    var columns = [];
    var cursor;
    var colEnd;
    var h;
    var isTodayDay;

    if (m === 'day') {
      start = startOfDay(a);
      end = start;
      isTodayDay = dayDiff(start, startOfDay(ref)) === 0;
      for (h = 0; h < 24; h++) {
        columns.push({
          key: toIsoDate(start) + 'T' + pad2(h),
          label: String(h) + 'h',
          relative: isTodayDay && ref.getHours() === h ? 'today' : null,
          start: start,
          end: end,
          hour: h,
        });
      }
    } else if (m === 'week') {
      start = startOfWeek(a);
      end = endOfWeek(a);
      cursor = start;
      while (cursor.getTime() <= end.getTime()) {
        colEnd = cursor;
        columns.push({
          key: toIsoDate(cursor),
          label: columnLabel(cursor, m, ref),
          relative: relativeDayKey(cursor, ref),
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
          label: columnLabel(cursor, m, ref),
          relative: relativeDayKey(cursor, ref),
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
          label: columnLabel(cursor, m, ref),
          relative: null,
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
    if (m === 'day') return addDays(a, dir);
    if (m === 'week') return addDays(a, dir * 7);
    if (m === 'month') {
      return new Date(a.getFullYear(), a.getMonth() + dir, 1);
    }
    return new Date(a.getFullYear() + dir, a.getMonth(), 1);
  }

  
  /**
   * Resolve [start, end] bar interval.
   * Prefer startDate + dueDate; due-only uses estimate or 1 day; start-only = 1 day.
   * Optional times (startTime / dueTime) produce real datetimes (hasTime: true).
   * In Agenda (options.mode === 'day'), date-only cards span work hours.
   */
  function resolveBarInterval(parts, options) {
    parts = parts || {};
    options = options || {};
    var mode = options.mode ? normalizeViewMode(options.mode) : null;
    var dayStart = normalizeWorkTime(options.dayStart, DEFAULT_DAY_START);
    var dayEnd = normalizeWorkTime(options.dayEnd, DEFAULT_DAY_END);
    var start = parseIsoDate(parts.startDate);
    var due = parseIsoDate(parts.dueDate);
    var hasStartTime = !!parseTime(parts.startTime);
    var hasDueTime = !!parseTime(parts.dueTime);
    var hasAnyTime = hasStartTime || hasDueTime;
    var est =
      typeof parts.estimatedMinutes === 'number' && isFinite(parts.estimatedMinutes)
        ? Math.max(0, Math.round(parts.estimatedMinutes))
        : null;

    if (start && due) {
      if (due.getTime() < start.getTime()) {
        var swapped = start;
        start = due;
        due = swapped;
        var swapStartTime = parts.startTime;
        parts = Object.assign({}, parts, {
          startTime: parts.dueTime,
          dueTime: swapStartTime,
        });
        hasStartTime = !!parseTime(parts.startTime);
        hasDueTime = !!parseTime(parts.dueTime);
        hasAnyTime = hasStartTime || hasDueTime;
      }
    } else if (due && !start) {
      if (est != null && est > 0) {
        if (hasDueTime && est < 24 * 60) {
          var dueInstant = combineDateTime(due, parts.dueTime);
          var startFromEst = new Date(dueInstant.getTime() - est * MS_MINUTE);
          return {
            start: startFromEst,
            end: dueInstant,
            hasTime: true,
          };
        }
        var days = Math.max(1, Math.ceil(est / (60 * 24)));
        start = addDays(due, -(days - 1));
      } else {
        start = due;
      }
    } else if (start && !due) {
      due = start;
    } else {
      return null;
    }

    var startDt;
    var endDt;
    var hasTime = false;

    if (hasAnyTime) {
      startDt = combineDateTime(
        start,
        hasStartTime ? parts.startTime : mode === 'day' ? dayStart : null
      );
      endDt = combineDateTime(
        due,
        hasDueTime ? parts.dueTime : mode === 'day' ? dayEnd : null
      );
      hasTime = true;
    } else if (mode === 'day') {
      startDt = combineDateTime(start, dayStart);
      endDt = combineDateTime(due, dayEnd);
      hasTime = true;
    } else {
      startDt = start;
      endDt = due;
      hasTime = false;
    }

    if (!startDt || !endDt) return null;
    if (endDt.getTime() < startDt.getTime()) {
      return { start: endDt, end: startDt, hasTime: hasTime };
    }
    return { start: startDt, end: endDt, hasTime: hasTime };
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

  /**
   * Map a DateTime onto the timeline, preserving time-of-day within the day
   * (noon → middle of today's column). Clamped to [0, width].
   */
  function dateTimeToX(date, range, widthPx) {
    if (!(date instanceof Date) || isNaN(date.getTime()) || !range || !range.start) {
      return 0;
    }
    var w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 1;
    var total = rangeDayCount(range);
    var startMs = startOfDay(range.start).getTime();
    var offsetMs = date.getTime() - startMs;
    var x = (offsetMs / (total * MS_DAY)) * w;
    if (!isFinite(x) || x < 0) return 0;
    if (x > w) return w;
    return x;
  }

  function xToDate(x, range, widthPx) {
    if (!range) return null;
    var w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 1;
    var total = rangeDayCount(range);
    var dayW = w / total;
    var offset = Math.floor(Number(x) / dayW);
    if (!isFinite(offset) || offset < 0) offset = 0;
    if (offset >= total) offset = total - 1;
    return addDays(range.start, offset);
  }

  /** Inverse of dateTimeToX — continuous time along the timeline. */
  function xToDateTime(x, range, widthPx) {
    if (!range || !range.start) return null;
    var w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 1;
    var total = rangeDayCount(range);
    var ratio = Number(x) / w;
    if (!isFinite(ratio)) ratio = 0;
    if (ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;
    var startMs = startOfDay(range.start).getTime();
    return new Date(startMs + ratio * total * MS_DAY);
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

  function snapDateTime(date, mode, stepMinutes) {
    var d;
    if (date instanceof Date && !isNaN(date.getTime())) {
      d = new Date(date.getTime());
    } else {
      d = parseIsoDate(date);
    }
    if (!d) return null;
    var m = normalizeViewMode(mode);
    if (m !== 'day') return snapDate(d, m);
    var step =
      typeof stepMinutes === 'number' && stepMinutes > 0
        ? Math.round(stepMinutes)
        : AGENDA_SNAP_MINUTES;
    var mins = d.getHours() * 60 + d.getMinutes() + (d.getSeconds() >= 30 ? 1 : 0);
    var snapped = Math.round(mins / step) * step;
    var base = startOfDay(d);
    if (snapped >= 24 * 60) {
      base = addDays(base, 1);
      base.setHours(0, 0, 0, 0);
      return base;
    }
    if (snapped < 0) {
      base.setHours(0, 0, 0, 0);
      return base;
    }
    base.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0);
    return base;
  }

  function shiftInterval(interval, dayDelta) {
    if (!interval || !interval.start || !interval.end) return null;
    var delta = Number(dayDelta) || 0;
    return {
      start: addDays(interval.start, delta),
      end: addDays(interval.end, delta),
      hasTime: !!interval.hasTime,
    };
  }

  function shiftIntervalMs(interval, msDelta) {
    if (!interval || !interval.start || !interval.end) return null;
    var delta = Number(msDelta) || 0;
    return {
      start: new Date(interval.start.getTime() + delta),
      end: new Date(interval.end.getTime() + delta),
      hasTime: interval.hasTime !== false,
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
    return { start: start, end: end, hasTime: !!interval.hasTime };
  }

  function resizeIntervalMs(interval, edge, msDelta) {
    if (!interval || !interval.start || !interval.end) return null;
    var delta = Number(msDelta) || 0;
    var start = new Date(interval.start.getTime());
    var end = new Date(interval.end.getTime());
    if (edge === 'start') {
      start = new Date(start.getTime() + delta);
      if (start.getTime() > end.getTime()) start = new Date(end.getTime());
    } else {
      end = new Date(end.getTime() + delta);
      if (end.getTime() < start.getTime()) end = new Date(start.getTime());
    }
    return { start: start, end: end, hasTime: true };
  }

  function orderedInterval(a, b, options) {
    options = options || {};
    var keepTime = !!options.keepTime;
    var start;
    var end;
    if (a instanceof Date && !isNaN(a.getTime())) {
      start = keepTime ? new Date(a.getTime()) : startOfDay(a);
    } else {
      start = parseIsoDate(a);
    }
    if (b instanceof Date && !isNaN(b.getTime())) {
      end = keepTime ? new Date(b.getTime()) : startOfDay(b);
    } else {
      end = parseIsoDate(b);
    }
    if (!start || !end) return null;
    if (start.getTime() <= end.getTime()) {
      return { start: start, end: end, hasTime: keepTime };
    }
    return { start: end, end: start, hasTime: keepTime };
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

  function intervalToParts(interval, options) {
    if (!interval) return { startDate: '', dueDate: '' };
    options = options || {};
    var out = {
      startDate: toIsoDate(interval.start),
      dueDate: toIsoDate(interval.end),
    };
    var includeTime =
      options.includeTime === true ||
      (options.includeTime !== false && interval.hasTime === true);
    if (includeTime && interval.start && interval.end) {
      out.startTime = toIsoTime(interval.start);
      out.dueTime = toIsoTime(interval.end);
    }
    return out;
  }

  function barGeometry(interval, range, widthPx) {
    if (!interval || !range) return null;
    var w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 1;
    var useTime = range.mode === 'day' || interval.hasTime === true;
    if (useTime) {
      var left = dateTimeToX(interval.start, range, widthPx);
      var right = dateTimeToX(interval.end, range, widthPx);
      if (right < left) {
        var swap = left;
        left = right;
        right = swap;
      }
      var timedWidth = Math.max(Math.min(8, w * 0.02), right - left);
      return {
        left: left,
        width: timedWidth,
        visible: right > 0 && left < w && timedWidth > 0,
        clippedLeft: left <= 0 && right > 0,
        clippedRight: right >= w && left < w,
      };
    }
    var total = rangeDayCount(range);
    var dayW = w / total;
    var startOffset = dayDiff(interval.start, range.start);
    var endOffset = dayDiff(interval.end, range.start);
    var leftDay = startOffset * dayW;
    var width = (endOffset - startOffset + 1) * dayW;
    var visible = endOffset >= 0 && startOffset < total && width > 0;
    return {
      left: leftDay,
      width: Math.max(dayW * 0.35, width),
      visible: visible,
      clippedLeft: startOffset < 0,
      clippedRight: endOffset >= total,
    };
  }

  /**
   * Agenda work-hours overlay band within a day range.
   * @returns {{ left: number, width: number }|null}
   */
  function workHoursBand(dayStart, dayEnd, range, widthPx) {
    if (!range || !range.start) return null;
    if (range.mode !== 'day') return null;
    var start = combineDateTime(range.start, normalizeWorkTime(dayStart, DEFAULT_DAY_START));
    var end = combineDateTime(range.start, normalizeWorkTime(dayEnd, DEFAULT_DAY_END));
    if (!start || !end) return null;
    if (end.getTime() <= start.getTime()) return null;
    var left = dateTimeToX(start, range, widthPx);
    var right = dateTimeToX(end, range, widthPx);
    return { left: left, width: Math.max(0, right - left) };
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
   * Empty started/blocked sections are omitted; À faire is always shown.
   */
  function sortTreeRootsGroupedByState(nodes, sortBy, sortDir) {
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
      var sorted = sortTreeRoots(buckets[key], sortBy, sortDir);
      // Always keep À faire visible, even with no tasks.
      if (!sorted.length && key !== 'pending') continue;
      var header = makeStateSectionHeader(key);
      header.children = sorted;
      header.expandable = sorted.length > 0;
      header.subtaskCount = sorted.length;
      out.push(header);
    }
    return out;
  }

  /**
   * Drop section headers that have no visible task rows after them.
   * Collapsed sections with children are kept so the header stays clickable.
   * À faire is always kept, even when empty.
   */
  function pruneEmptyStateSections(rows, expandedSet) {
    var list = rows || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row) continue;
      if (row.kind === 'section') {
        if (row.sectionKey === 'pending') {
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
    return (rows || []).filter(function (row) {
      if (!row) return false;
      // Section headers stay until pruneEmptyStateSections runs.
      if (row.kind === 'section') return true;
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
    resolveBarInterval: resolveBarInterval,
    rangeDayCount: rangeDayCount,
    dateToX: dateToX,
    dateTimeToX: dateTimeToX,
    xToDate: xToDate,
    xToDateTime: xToDateTime,
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
    STATE_SECTION_ORDER: STATE_SECTION_ORDER,
    STATE_SECTION_LABELS: STATE_SECTION_LABELS,
    stateSectionKey: stateSectionKey,
    stateSectionLabel: stateSectionLabel,
    makeStateSectionHeader: makeStateSectionHeader,
    isNodeExpanded: isNodeExpanded,
    sortTreeRootsGroupedByState: sortTreeRootsGroupedByState,
    pruneEmptyStateSections: pruneEmptyStateSections,
  };
})(typeof window !== 'undefined' ? window : this);
