/**
 * Gantt chart — pure layout / date math (no DOM, no Trello).
 * Exposes window.GanttModel.
 *
 * Role: view modes (day/week/month/year), column headers, row geometry,
 * bar hit-testing, agenda snap, filter/sort of card rows. Consumed by GanttUI.
 */

/**
 * gantt-model: part 1 of 3 (day).
 * Names are shared with the other parts through window.GanttModelParts (see gantt-model.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.GanttModelParts = global.GanttModelParts || {});

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

  function pad3(n) {
    var v = Math.floor(Number(n) || 0);
    if (v < 0) v = 0;
    if (v > 999) v = 999;
    if (v < 10) return '00' + v;
    if (v < 100) return '0' + v;
    return String(v);
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
      // Previous, current and next year: 36 month columns.
      start = new Date(a.getFullYear() - 1, 0, 1);
      end = new Date(a.getFullYear() + 1, 11, 31);
      for (var mi = 0; mi < 36; mi++) {
        cursor = new Date(a.getFullYear() - 1, mi, 1);
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

  /** Move `count` periods (day, week, month, or year). Negative goes earlier. */
  function addPeriods(mode, anchor, count) {
    var m = normalizeViewMode(mode);
    var a = parseIsoDate(anchor) || startOfDay(new Date());
    var n = Math.trunc(Number(count) || 0);
    if (m === 'day') return addDays(a, n);
    if (m === 'week') return addDays(a, n * 7);
    if (m === 'month') return new Date(a.getFullYear(), a.getMonth() + n, 1);
    return new Date(a.getFullYear() + n, 0, 1);
  }

  /**
   * Same window as viewRange, plus `before` / `after` extra periods.
   * Year's base window stays the previous, current and next year; each extra
   * period is one more year. Zero on both sides matches viewRange.
   */
  function spanRange(mode, anchor, before, after, now) {
    var m = normalizeViewMode(mode);
    var b = Math.max(0, Math.floor(Number(before) || 0));
    var f = Math.max(0, Math.floor(Number(after) || 0));
    if (b === 0 && f === 0) return viewRange(m, anchor, now);

    var ref = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
    var columns = [];
    var start;
    var end;
    var cursor;
    var h;
    var isTodayDay;

    if (m === 'year') {
      var a = parseIsoDate(anchor) || startOfDay(new Date());
      var y0 = a.getFullYear() - 1 - b;
      var years = 3 + b + f;
      start = new Date(y0, 0, 1);
      end = new Date(y0 + years - 1, 11, 31);
      for (var mi = 0; mi < years * 12; mi++) {
        cursor = new Date(y0, mi, 1);
        columns.push({
          key: cursor.getFullYear() + '-' + pad2(cursor.getMonth() + 1),
          label: columnLabel(cursor, m, ref),
          relative: null,
          start: cursor,
          end: endOfMonth(cursor),
        });
      }
      return { mode: m, start: start, end: end, columns: columns };
    }

    var origin = addPeriods(m, anchor, -b);
    if (m === 'week') origin = startOfWeek(origin);
    else if (m === 'month') origin = startOfMonth(origin);
    else origin = startOfDay(origin);
    var last = addPeriods(m, anchor, f);
    if (m === 'week') end = endOfWeek(last);
    else if (m === 'month') end = endOfMonth(last);
    else end = startOfDay(last);
    start = origin;

    if (m === 'day') {
      cursor = start;
      while (cursor.getTime() <= end.getTime()) {
        isTodayDay = dayDiff(cursor, startOfDay(ref)) === 0;
        for (h = 0; h < 24; h++) {
          columns.push({
            key: toIsoDate(cursor) + 'T' + pad2(h),
            label: String(h) + 'h',
            relative: isTodayDay && ref.getHours() === h ? 'today' : null,
            start: cursor,
            end: cursor,
            hour: h,
          });
        }
        cursor = addDays(cursor, 1);
      }
    } else {
      cursor = start;
      while (cursor.getTime() <= end.getTime()) {
        columns.push({
          key: toIsoDate(cursor),
          label: columnLabel(cursor, m, ref),
          relative: relativeDayKey(cursor, ref),
          start: cursor,
          end: cursor,
        });
        cursor = addDays(cursor, 1);
      }
    }
    return { mode: m, start: start, end: end, columns: columns };
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
        hasStartTime
          ? parts.startTime
          : mode === 'day' || mode === 'week'
            ? dayStart
            : null
      );
      endDt = combineDateTime(
        due,
        hasDueTime
          ? parts.dueTime
          : mode === 'day' || mode === 'week'
            ? dayEnd
            : null
      );
      hasTime = true;
    } else if (mode === 'day' || mode === 'week') {
      // Week drag/paint uses continuous time like Agenda — date-only cards
      // open as work-hours spans so edges can be resized to real times.
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

  /**
   * Work-day fraction of a 24h day (0–1) for CSS off-hours overlays.
   * @returns {{ start: number, end: number }|null}
   */
  function workDayFractions(dayStart, dayEnd) {
    var startTime = normalizeWorkTime(dayStart, DEFAULT_DAY_START);
    var endTime = normalizeWorkTime(dayEnd, DEFAULT_DAY_END);
    var s = parseTime(startTime);
    var e = parseTime(endTime);
    if (!s || !e) return null;
    var start = (s.hours * 60 + s.minutes) / (24 * 60);
    var end = (e.hours * 60 + e.minutes) / (24 * 60);
    if (!(end > start)) return null;
    return { start: start, end: end };
  }

  /**
   * Compress morning/night so work hours dominate each day column.
   * Off-hours together get ~OFF_HOURS_VISUAL_SHARE of the column (split by duration).
   * @returns {object|null} warp with real/visual breakpoints in [0,1]
   */
  var OFF_HOURS_VISUAL_SHARE = 0.2;

  function buildTimeWarp(dayStart, dayEnd, options) {
    var frac = workDayFractions(dayStart, dayEnd);
    if (!frac) return null;
    var morningR = frac.start;
    var nightR = 1 - frac.end;
    var offR = morningR + nightR;
    if (!(offR > 0) || !(frac.end > frac.start)) return null;
    var offShare =
      options && typeof options.offVisualShare === 'number'
        ? options.offVisualShare
        : OFF_HOURS_VISUAL_SHARE;
    if (!(offShare > 0)) offShare = OFF_HOURS_VISUAL_SHARE;
    if (offShare > 0.45) offShare = 0.45;
    var morningV = offShare * (morningR / offR);
    var nightV = offShare * (nightR / offR);
    var workV = 1 - morningV - nightV;
    return {
      morningEnd: morningR,
      nightStart: frac.end,
      visualMorningEnd: morningV,
      visualNightStart: morningV + workV,
      visualMorningShare: morningV,
      visualWorkShare: workV,
      visualNightShare: nightV,
    };
  }

  function realFracToVisual(realFrac, warp) {
    var r = Number(realFrac);
    if (!warp || !isFinite(r)) return r;
    if (r <= 0) return 0;
    if (r >= 1) return 1;
    if (r <= warp.morningEnd) {
      if (!(warp.morningEnd > 0)) return warp.visualMorningEnd;
      return (r / warp.morningEnd) * warp.visualMorningEnd;
    }
    if (r <= warp.nightStart) {
      var workR = warp.nightStart - warp.morningEnd;
      if (!(workR > 0)) return warp.visualNightStart;
      var t = (r - warp.morningEnd) / workR;
      return (
        warp.visualMorningEnd +
        t * (warp.visualNightStart - warp.visualMorningEnd)
      );
    }
    var nightR = 1 - warp.nightStart;
    if (!(nightR > 0)) return 1;
    var t2 = (r - warp.nightStart) / nightR;
    return warp.visualNightStart + t2 * (1 - warp.visualNightStart);
  }

  function visualFracToReal(visualFrac, warp) {
    var v = Number(visualFrac);
    if (!warp || !isFinite(v)) return v;
    if (v <= 0) return 0;
    if (v >= 1) return 1;
    if (v <= warp.visualMorningEnd) {
      if (!(warp.visualMorningEnd > 0)) return warp.morningEnd;
      return (v / warp.visualMorningEnd) * warp.morningEnd;
    }
    if (v <= warp.visualNightStart) {
      var workV = warp.visualNightStart - warp.visualMorningEnd;
      if (!(workV > 0)) return warp.nightStart;
      var t = (v - warp.visualMorningEnd) / workV;
      return warp.morningEnd + t * (warp.nightStart - warp.morningEnd);
    }
    var nightV = 1 - warp.visualNightStart;
    if (!(nightV > 0)) return 1;
    var t2 = (v - warp.visualNightStart) / nightV;
    return warp.nightStart + t2 * (1 - warp.nightStart);
  }

  function mapOptions(options) {
    return options && typeof options === 'object' ? options : null;
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
   * (noon → middle of today's column when linear). Optional options.timeWarp
   * compresses morning/night in day/week views.
   */
  function dateTimeToX(date, range, widthPx, options) {
    if (!(date instanceof Date) || isNaN(date.getTime()) || !range || !range.start) {
      return 0;
    }
    var w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 1;
    var total = rangeDayCount(range);
    var startMs = startOfDay(range.start).getTime();
    var offsetMs = date.getTime() - startMs;
    var dayFloat = offsetMs / MS_DAY;
    var opts = mapOptions(options);
    var warp = opts && opts.timeWarp;
    if (warp && (range.mode === 'day' || range.mode === 'week') && dayFloat >= 0) {
      var dayIndex = Math.floor(dayFloat);
      var realFrac = dayFloat - dayIndex;
      dayFloat = dayIndex + realFracToVisual(realFrac, warp);
    }
    var x = (dayFloat / total) * w;
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
  function xToDateTime(x, range, widthPx, options) {
    if (!range || !range.start) return null;
    var w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 1;
    var total = rangeDayCount(range);
    var ratio = Number(x) / w;
    if (!isFinite(ratio)) ratio = 0;
    if (ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;
    var dayFloat = ratio * total;
    var opts = mapOptions(options);
    var warp = opts && opts.timeWarp;
    if (warp && (range.mode === 'day' || range.mode === 'week')) {
      var dayIndex = Math.floor(dayFloat);
      if (dayIndex >= total) dayIndex = total - 1;
      if (dayIndex < 0) dayIndex = 0;
      var visualFrac = dayFloat - Math.floor(dayFloat);
      // At exact end of timeline, dayFloat === total → treat as end of last day.
      if (ratio >= 1) {
        dayFloat = total;
      } else {
        dayFloat = dayIndex + visualFracToReal(visualFrac, warp);
      }
    }
    var startMs = startOfDay(range.start).getTime();
    return new Date(startMs + dayFloat * MS_DAY);
  }

  /**
   * How many pixels one real second occupies at `date` (time warp included).
   * Used to decide how much of the clock the now-line tooltip shows.
   */
  function timelinePxPerSecond(date, range, widthPx, options) {
    if (!(date instanceof Date) || isNaN(date.getTime()) || !range) return 0;
    var x0 = dateTimeToX(date, range, widthPx, options);
    var fore =
      dateTimeToX(new Date(date.getTime() + 1000), range, widthPx, options) - x0;
    var back =
      x0 - dateTimeToX(new Date(date.getTime() - 1000), range, widthPx, options);
    // The timeline clamps at both ends, so one side can shrink to nothing.
    var px = fore > back ? fore : back;
    if (!isFinite(px) || px < 0) return 0;
    return px;
  }

  /**
   * Tooltip for the red now-line. Precision follows the zoom:
   * HH:MM, then seconds, then milliseconds once a second is wide enough
   * to point at (hour grid, including compressed off-hours).
   * @param {number} pxPerSecond from timelinePxPerSecond
   */
  function formatNowLineTitle(date, pxPerSecond) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    var px = Number(pxPerSecond);
    if (!isFinite(px) || px < 0) px = 0;
    var clock = pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    if (px >= 0.002) clock += ':' + pad2(date.getSeconds());
    if (px >= 0.004) clock += '.' + pad3(date.getMilliseconds());
    return 'Maintenant \u00b7 ' + clock;
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
    // Day (Agenda) and Week support continuous time drag with minute snapping.
    if (m !== 'day' && m !== 'week') return snapDate(d, m);
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

  function barGeometry(interval, range, widthPx, options) {
    if (!interval || !range) return null;
    var w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 1;
    var useTime =
      range.mode === 'day' ||
      range.mode === 'week' ||
      interval.hasTime === true;
    if (useTime) {
      var left = dateTimeToX(interval.start, range, widthPx, options);
      var right = dateTimeToX(interval.end, range, widthPx, options);
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

  // exports
  S.AGENDA_SNAP_MINUTES = AGENDA_SNAP_MINUTES;
  S.DEFAULT_DAY_END = DEFAULT_DAY_END;
  S.DEFAULT_DAY_START = DEFAULT_DAY_START;
  S.MONTH_SHORT = MONTH_SHORT;
  S.MS_DAY = MS_DAY;
  S.MS_MINUTE = MS_MINUTE;
  S.OFF_HOURS_VISUAL_SHARE = OFF_HOURS_VISUAL_SHARE;
  S.STATE_SECTION_LABELS = STATE_SECTION_LABELS;
  S.STATE_SECTION_ORDER = STATE_SECTION_ORDER;
  S.VIEW_MODES = VIEW_MODES;
  S.WEEKDAY_LONG = WEEKDAY_LONG;
  S.WEEKDAY_SHORT = WEEKDAY_SHORT;
  S.addDays = addDays;
  S.addPeriods = addPeriods;
  S.barGeometry = barGeometry;
  S.buildTimeWarp = buildTimeWarp;
  S.columnLabel = columnLabel;
  S.combineDateTime = combineDateTime;
  S.dateTimeToX = dateTimeToX;
  S.dateToX = dateToX;
  S.dayDiff = dayDiff;
  S.endOfMonth = endOfMonth;
  S.endOfWeek = endOfWeek;
  S.endOfYear = endOfYear;
  S.formatNowLineTitle = formatNowLineTitle;
  S.intervalToParts = intervalToParts;
  S.isViewMode = isViewMode;
  S.mapOptions = mapOptions;
  S.normalizeViewMode = normalizeViewMode;
  S.normalizeWorkTime = normalizeWorkTime;
  S.orderedInterval = orderedInterval;
  S.pad2 = pad2;
  S.pad3 = pad3;
  S.parseIsoDate = parseIsoDate;
  S.parseTime = parseTime;
  S.rangeDayCount = rangeDayCount;
  S.realFracToVisual = realFracToVisual;
  S.relativeDayKey = relativeDayKey;
  S.relativeDayLabel = relativeDayLabel;
  S.resizeInterval = resizeInterval;
  S.resizeIntervalMs = resizeIntervalMs;
  S.resolveBarInterval = resolveBarInterval;
  S.selectAllCheckboxState = selectAllCheckboxState;
  S.shiftAnchor = shiftAnchor;
  S.shiftInterval = shiftInterval;
  S.shiftIntervalMs = shiftIntervalMs;
  S.snapDate = snapDate;
  S.snapDateTime = snapDateTime;
  S.spanRange = spanRange;
  S.startOfDay = startOfDay;
  S.startOfMonth = startOfMonth;
  S.startOfWeek = startOfWeek;
  S.startOfYear = startOfYear;
  S.timelinePxPerSecond = timelinePxPerSecond;
  S.toIsoDate = toIsoDate;
  S.toIsoTime = toIsoTime;
  S.viewRange = viewRange;
  S.visualFracToReal = visualFracToReal;
  S.workDayFractions = workDayFractions;
  S.xToDate = xToDate;
  S.xToDateTime = xToDateTime;
})(typeof window !== 'undefined' ? window : this);
