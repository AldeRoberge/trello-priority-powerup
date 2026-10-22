/*
 * Role: pure logic of the Aujourd'hui page (greeting, the day's plan, the timeline geometry).
 * No Trello, no DOM: covered by test/today-model.test.js. Builds on DashboardModel (rows, days, estimates).
 *
 * The day is made of blocks on a clock:
 *   fixed   a task that has a time today (start, and an end when the card gives one, else start + estimate)
 *   flow    a projection of the tasks without a time, laid one after the other from "now" in the free gaps,
 *           best first. It is only a preview: "Planifier ma journée" writes it, dragging a block fixes one.
 * Overdue tasks always flow: their old time belongs to a day that is gone.
 * Minutes are minutes since midnight; days are local ISO days.
 * The page is a board of widgets (layout): each one has a column, a row and a size.
 * Exposes window.TodayModel.
 */
(function (global) {
  'use strict';

  var WORK_END = 18 * 60; // a flow block that starts at or after this is flagged late
  var FLOW_LIMIT = 22 * 60; // nothing is projected past this: the rest is "overflow"
  var STEP = 5; // minutes: the grid of every time the page writes
  var WORK_START = 8 * 60 + 15; // before this is early morning (same start as the Gantt)
  var AFTERNOON_OFF = 16 * 60 + 45; // late afternoon, same end as the Gantt
  var FRIDAY_OFF = 12 * 60; // Friday afternoon
  var WINDOW_FROM = 6 * 60; // the clock shows early morning
  var WINDOW_TO = 19 * 60; // …and late afternoon

  var DAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function DM() {
    return global.DashboardModel;
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* ── Words ─────────────────────────────────────────────────────── */

  /** Greeting for the time of day (Québec French). */
  function hello(now) {
    var h = (now || new Date()).getHours();
    if (h >= 5 && h < 12) return 'Bon matin';
    if (h >= 12 && h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }

  /**
   * First name out of a display name. '' when it does not look like a name
   * (a username such as "rotmg", an email, nothing).
   */
  function firstName(full) {
    var s = String(full == null ? '' : full).replace(/\s+/g, ' ').trim();
    if (!s || s.indexOf('@') >= 0) return '';
    var first = s.split(' ')[0];
    if (!/^[A-ZÀ-ÖØ-Þ]/.test(first) || /[0-9_]/.test(first)) return '';
    return first;
  }

  /** "mercredi 14 octobre" */
  function dayTitle(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return DAYS_LONG[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_LONG[d.getMonth()];
  }

  /** 870 → "14 h 30", 540 → "9 h" (non-breaking spaces). */
  function fmtClock(min) {
    var m = Math.max(0, Math.round(min));
    var h = Math.floor(m / 60) % 24;
    var r = m % 60;
    return h + ' h' + (r ? ' ' + pad2(r) : '');
  }

  /** "9 h à 9 h 30" */
  function fmtRange(start, end) {
    return fmtClock(start) + ' à ' + fmtClock(end);
  }

  /** In minutes → "maintenant", "dans 25 min", "dans 1 h 10". */
  function inWords(minutes) {
    var m = Math.round(minutes);
    if (m <= 0) return 'maintenant';
    if (m < 60) return 'dans ' + m + ' min';
    var h = Math.floor(m / 60);
    var r = m % 60;
    return 'dans ' + h + ' h' + (r ? ' ' + pad2(r) : '');
  }

  /** 90 → "1 h 30" (same words as everywhere else in the app). */
  function fmtDuration(min) {
    return DM().formatMinutes(min);
  }

  /** Distance from now, signed: -180 → "-3 h", -50 → "-50 min", 75 → "+1 h 15", 0 → "Maintenant". */
  function fmtOffset(deltaMin) {
    var d = Math.round(deltaMin);
    if (!d) return 'Maintenant';
    return (d < 0 ? '-' : '+') + fmtDuration(Math.abs(d));
  }

  /* ── Minutes on a grid ─────────────────────────────────────────── */

  function snap(min, step) {
    var s = step > 0 ? step : STEP;
    return Math.round(min / s) * s;
  }

  function ceilTo(min, step) {
    var s = step > 0 ? step : STEP;
    return Math.ceil(min / s) * s;
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  /** The text of a time typed or dragged ("14:30") ↔ minutes. */
  function toClock(min) {
    return DM().hhmm(clamp(Math.round(min), 0, 1439));
  }

  /**
   * The times of a time menu, every half hour: [{ time: '14:30', minute: 870, label: '14 h 30' }].
   * A menu has one level, so this stays flat (the menu's search box finds "14").
   */
  function timeSlots(fromHour, toHour, stepMinutes) {
    var out = [];
    var step = stepMinutes > 0 ? stepMinutes : 30;
    var last = (toHour == null ? 22 : toHour) * 60 + 30;
    for (var m = (fromHour == null ? 6 : fromHour) * 60; m <= last; m += step) {
      out.push({ time: pad2(Math.floor(m / 60)) + ':' + pad2(m % 60), minute: m, label: fmtClock(m) });
    }
    return out;
  }

  /* ── Quick add: "Dentiste à 15 h 30" ───────────────────────────── */

  var CLOCK_END = /(?:^|\s)(?:(?:à|a|vers|@)\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?|(?:à|vers)\s+(midi)|(\d{1,2}):(\d{2}))\s*$/i;

  /**
   * Takes a clock time off the end of a title: "Dentiste à 15 h 30", "Appel vers 9h", "Rapport 14:00", "Dîner à midi".
   * A bare "2h" is left alone (it is more likely a duration than an hour).
   * Returns { name, time: 'HH:MM' } or null. Never leaves an empty name.
   */
  function splitClock(text) {
    var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    var m = CLOCK_END.exec(s);
    if (!m) return null;
    var h;
    var min;
    if (m[3]) {
      h = 12;
      min = 0;
    } else if (m[4] != null && m[5] != null) {
      h = +m[4];
      min = +m[5];
    } else {
      h = +m[1];
      min = m[2] != null ? +m[2] : 0;
    }
    if (!(h >= 0 && h <= 23 && min >= 0 && min <= 59)) return null;
    var name = s.slice(0, m.index).replace(/[\s,;:–-]+$/, '').trim();
    if (!name) return null;
    return { name: name, time: pad2(h) + ':' + pad2(min) };
  }

  /* ── Blocks ────────────────────────────────────────────────────── */

  /**
   * Where a card sits on today's clock: { start, end, explicit } or null (no time, a vague horizon, or another day).
   * A card that gives both a start and a different due time on the same day is a span (a meeting);
   * any other timed card lasts its estimate (30 min when it has none).
   */
  function rowRange(row, today) {
    if (!row || row.dueVague || !today) return null;
    var dm = DM();
    if (dm.plannedDay(row) !== today) return null;
    var oneDay = !row.start || !row.due || row.start === row.due;
    var startClock = row.startTime || (oneDay ? row.dueTime : '') || '';
    var start = dm.parseClock(startClock);
    if (start == null || start >= 1440) return null;
    var endClock = oneDay && row.startTime && row.dueTime ? dm.parseClock(row.dueTime) : null;
    var explicit = endClock != null && endClock > start;
    var end = explicit ? endClock : start + dm.estimateOf(row);
    return { start: start, end: Math.min(end, 1440), explicit: explicit };
  }

  function mergeIntervals(list) {
    var sorted = list.slice().sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    sorted.forEach(function (iv) {
      var last = out[out.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else out.push([iv[0], iv[1]]);
    });
    return out;
  }

  /**
   * Lays `rows` one after the other from `opts.start`, in order, skipping the fixed blocks.
   * A row that cannot end before `opts.limit` is returned in `overflow` (the next ones are still tried).
   * Returns { blocks: [{ id, row, start, end, kind: 'flow', late }], overflow: [row] }.
   */
  function flowPlan(fixed, rows, opts) {
    opts = opts || {};
    var limit = opts.limit > 0 ? opts.limit : FLOW_LIMIT;
    var softEnd = opts.softEnd > 0 ? opts.softEnd : WORK_END;
    var busy = mergeIntervals((fixed || []).map(function (b) { return [b.start, b.end]; }));
    var cursor = ceilTo(opts.start == null ? DM().DAY_START : opts.start, STEP);
    var blocks = [];
    var overflow = [];
    var left = (rows || []).slice();

    // First start from `from` where [start, start + d) misses every fixed block.
    function earliest(d, from) {
      var s = from;
      var moved = true;
      while (moved) {
        moved = false;
        for (var i = 0; i < busy.length; i++) {
          if (s < busy[i][1] && s + d > busy[i][0]) {
            s = ceilTo(busy[i][1], STEP);
            moved = true;
          }
        }
      }
      return s;
    }

    while (left.length) {
      // The best task that fits right here goes first: a short one fills the gap in front of a fixed block
      // that the best task is too long for. With nothing in the way this is always the first task.
      var pick = -1;
      for (var i = 0; i < left.length; i++) {
        var d = DM().estimateOf(left[i]);
        if (earliest(d, cursor) === cursor && cursor + d <= limit) {
          pick = i;
          break;
        }
      }
      var row;
      var s;
      if (pick >= 0) {
        row = left.splice(pick, 1)[0];
        s = cursor;
      } else {
        row = left.shift();
        s = earliest(DM().estimateOf(row), cursor);
      }
      var dur = DM().estimateOf(row);
      if (s + dur > limit) {
        overflow.push(row);
        continue;
      }
      blocks.push({ id: row.id, row: row, start: s, end: s + dur, kind: 'flow', late: s >= softEnd });
      cursor = ceilTo(s + dur, STEP);
    }
    return { blocks: blocks, overflow: overflow };
  }

  /**
   * Side by side columns for blocks that overlap in time (adjacent blocks do not overlap).
   * Sets `lane` and `lanes` on each block; returns the same array.
   */
  function layoutLanes(blocks) {
    var list = (blocks || []).slice().sort(function (a, b) { return a.start - b.start || a.end - b.end; });
    var cluster = [];
    var laneEnds = [];
    var clusterEnd = -1;
    function close() {
      cluster.forEach(function (b) { b.lanes = laneEnds.length; });
      cluster = [];
      laneEnds = [];
    }
    list.forEach(function (b) {
      if (cluster.length && b.start >= clusterEnd) close();
      var lane = -1;
      for (var i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i] <= b.start) { lane = i; break; }
      }
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = b.end;
      b.lane = lane;
      clusterEnd = cluster.length ? Math.max(clusterEnd, b.end) : b.end;
      cluster.push(b);
    });
    close();
    return blocks;
  }

  /* ── Elastic time axis ─────────────────────────────────────────── */

  /**
   * Time ↔ pixels for the timeline. The axis is linear (`pxPerHour`) except where a block is too short to read:
   * there the minutes stretch so the block gets `minBlockPx`, and everything after it moves down. Hour lines are
   * drawn through yOf, so the axis stays true. A short block never paints over its neighbour.
   * opts: { from, to (minutes), pxPerHour, minBlockPx }.
   * Returns { height, yOf(minute), minOf(y), ticks(step) }.
   */
  function elasticScale(blocks, opts) {
    opts = opts || {};
    var from = opts.from == null ? 8 * 60 : opts.from;
    var to = opts.to == null ? 18 * 60 : opts.to;
    if (to <= from) to = from + 60;
    var base = (opts.pxPerHour > 0 ? opts.pxPerHour : 56) / 60;
    var minPx = opts.minBlockPx > 0 ? opts.minBlockPx : 24;
    var inside = (blocks || []).filter(function (b) { return b.end > from && b.start < to && b.end > b.start; });
    var cuts = [from, to];
    inside.forEach(function (b) {
      cuts.push(Math.max(from, b.start), Math.min(to, b.end));
    });
    cuts = cuts.sort(function (a, b) { return a - b; }).filter(function (v, i, a) { return i === 0 || v !== a[i - 1]; });
    var segs = [];
    var y = 0;
    for (var i = 0; i < cuts.length - 1; i++) {
      var a = cuts[i];
      var b = cuts[i + 1];
      var dens = base;
      for (var k = 0; k < inside.length; k++) {
        var blk = inside[k];
        if (blk.start < b && blk.end > a) {
          var need = minPx / (blk.end - blk.start);
          if (need > dens) dens = need;
        }
      }
      segs.push({ a: a, b: b, y0: y, dens: dens });
      y += (b - a) * dens;
    }
    var total = y;

    function yOf(minute) {
      var m = clamp(minute, from, to);
      for (var j = 0; j < segs.length; j++) {
        if (m <= segs[j].b) return segs[j].y0 + (m - segs[j].a) * segs[j].dens;
      }
      return total;
    }

    function minOf(py) {
      var v = clamp(py, 0, total);
      for (var j = 0; j < segs.length; j++) {
        var end = segs[j].y0 + (segs[j].b - segs[j].a) * segs[j].dens;
        if (v <= end) return segs[j].a + (v - segs[j].y0) / segs[j].dens;
      }
      return to;
    }

    function ticks(step) {
      var s = step > 0 ? step : 60;
      var out = [];
      for (var m = ceilTo(from, s); m <= to; m += s) out.push({ minute: m, y: yOf(m), hour: m % 60 === 0 });
      return out;
    }

    return { from: from, to: to, height: total, yOf: yOf, minOf: minOf, ticks: ticks };
  }

  /**
   * Minutes that are off the clock for `iso` (local day), clipped to [from, to).
   * Weekdays: before 8 h 15 and from 16 h 45. Friday: also from noon. Saturday and Sunday: the whole day.
   * Returns [{ start, end }].
   */
  function offRanges(iso, from, to) {
    var lo = from == null ? 0 : from;
    var hi = to == null ? 24 * 60 : to;
    if (!(hi > lo)) return [];
    var dow = weekdayIndex(iso);
    var raw = dow === 0 || dow === 6
      ? [[0, 24 * 60]]
      : dow === 5
        ? [[0, WORK_START], [FRIDAY_OFF, 24 * 60]]
        : [[0, WORK_START], [AFTERNOON_OFF, 24 * 60]];
    var out = [];
    raw.forEach(function (sp) {
      var a = Math.max(sp[0], lo);
      var b = Math.min(sp[1], hi);
      if (b > a) out.push({ start: a, end: b });
    });
    return out;
  }

  function weekdayIndex(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return -1;
    return new Date(+m[1], +m[2] - 1, +m[3]).getDay();
  }

  /** Hours the timeline shows: at least 6 h to 19 h, widened for blocks and for "now". */
  function windowRange(blocks, nowMin) {
    var from = WINDOW_FROM;
    var to = WINDOW_TO;
    (blocks || []).forEach(function (b) {
      from = Math.min(from, Math.floor(b.start / 60) * 60);
      to = Math.max(to, Math.ceil(b.end / 60) * 60);
    });
    if (nowMin != null && nowMin >= 5 * 60) {
      from = Math.min(from, Math.floor(nowMin / 60) * 60);
      to = Math.max(to, Math.ceil((nowMin + 1) / 60) * 60 + 60);
    }
    return { from: clamp(from, 0, 23 * 60), to: clamp(to, 60, 24 * 60) };
  }

  /** Free stretches of at least `minLen` minutes between `from` and `to`, around the blocks. */
  function freeGaps(blocks, from, to, minLen) {
    var need = minLen > 0 ? minLen : 30;
    var busy = mergeIntervals((blocks || []).map(function (b) { return [b.start, b.end]; }))
      .filter(function (iv) { return iv[1] > from && iv[0] < to; });
    var out = [];
    var cursor = from;
    busy.forEach(function (iv) {
      var start = Math.max(iv[0], from);
      if (start - cursor >= need) out.push({ start: cursor, end: start });
      cursor = Math.max(cursor, iv[1]);
    });
    if (to - cursor >= need) out.push({ start: cursor, end: to });
    return out;
  }

  /* ── The day ───────────────────────────────────────────────────── */

  function isDone(row) {
    return !!row && (row.statutKey === 'completed' || !!row.dueDone) && row.statutKey !== 'canceled' && row.statutKey !== 'triage';
  }

  function byStart(a, b) {
    return a.start - b.start || a.end - b.end || DM().byPriority(a.row, b.row);
  }

  /**
   * Everything the page shows about one day.
   * opts: { today, nowMin (null when the day is not today), capacity }
   * Returns {
   *   overdue, planned (today's, timed first), done (completed, planned today),
   *   fixed, flow, overflow, blocks (fixed + flow by start), doneBlocks,
   *   stats: { open, overdue, done, total, minutes, capacity, remaining, over, timed, blocked, pct },
   *   focus: { row, block, state, minutesTo, progress } | null,
   *   window: { from, to }, flowStart
   * }
   */
  function buildDay(rows, opts) {
    opts = opts || {};
    var dm = DM();
    var today = opts.today;
    var nowMin = opts.nowMin == null ? null : opts.nowMin;
    var capacity = opts.capacity > 0 ? opts.capacity : dm.DEFAULT_CAPACITY;
    var list = rows || [];

    var late = dm.overdue(list, today);
    var tasks = dm.tasksOn(list, today);
    var open = late.concat(tasks);

    var fixed = [];
    var untimed = [];
    tasks.forEach(function (r) {
      var range = rowRange(r, today);
      if (range) fixed.push({ id: r.id, row: r, start: range.start, end: range.end, kind: 'fixed', explicit: range.explicit });
      else untimed.push(r);
    });
    fixed.sort(byStart);

    var flowRows = late.concat(untimed).filter(function (r) { return !r.blocked; });
    var flowStart = nowMin == null ? dm.DAY_START : Math.max(dm.DAY_START, ceilTo(nowMin, STEP));
    var flow = flowPlan(fixed, flowRows, { start: flowStart });
    var blocks = fixed.concat(flow.blocks).sort(byStart);
    layoutLanes(blocks);

    var planned = fixed.map(function (b) { return b.row; }).concat(untimed);
    var done = list.filter(function (r) { return isDone(r) && dm.plannedDay(r) === today; })
      .sort(function (a, b) { return (a.pos || 0) - (b.pos || 0); });
    var doneBlocks = [];
    done.forEach(function (r) {
      var range = rowRange(r, today);
      if (range) doneBlocks.push({ id: r.id, row: r, start: range.start, end: range.end, kind: 'done' });
    });

    var minutes = dm.minutesOf(open);
    var total = open.length + done.length;
    var stats = {
      open: open.length,
      overdue: late.length,
      done: done.length,
      total: total,
      minutes: minutes,
      capacity: capacity,
      remaining: Math.max(0, capacity - minutes),
      over: minutes > capacity,
      timed: fixed.length,
      blocked: open.filter(function (r) { return r.blocked; }).length,
      pct: total ? Math.round((done.length / total) * 100) : 0,
    };

    return {
      today: today,
      overdue: late,
      planned: planned,
      done: done,
      fixed: fixed,
      flow: flow.blocks,
      overflow: flow.overflow,
      blocks: blocks,
      doneBlocks: doneBlocks,
      stats: stats,
      focus: focusOf(blocks, open, nowMin, list, today),
      window: windowRange(blocks, nowMin),
      flowStart: flowStart,
    };
  }

  /**
   * What to do now. The block under the clock, else the next one, else the best open task
   * (state 'late' when everything on the clock is behind), else a backlog suggestion.
   * state: 'now' | 'soon' | 'late' | 'backlog'
   */
  function focusOf(blocks, open, nowMin, rows, today) {
    var doable = (blocks || []).filter(function (b) { return !b.row.blocked; }).sort(byStart);
    var i;
    if (nowMin != null) {
      for (i = 0; i < doable.length; i++) {
        var b = doable[i];
        if (b.kind === 'fixed' && b.start <= nowMin && nowMin < b.end) {
          return { row: b.row, block: b, state: 'now', minutesTo: 0, progress: (nowMin - b.start) / Math.max(1, b.end - b.start) };
        }
      }
      for (i = 0; i < doable.length; i++) {
        if (doable[i].end > nowMin) {
          var gap = doable[i].start - nowMin;
          return { row: doable[i].row, block: doable[i], state: gap <= STEP ? 'now' : 'soon', minutesTo: Math.max(0, gap), progress: 0 };
        }
      }
    } else if (doable.length) {
      return { row: doable[0].row, block: doable[0], state: 'soon', minutesTo: 0, progress: 0 };
    }
    var rest = (open || []).filter(function (r) { return !r.blocked; })[0];
    if (rest) return { row: rest, block: null, state: nowMin == null ? 'soon' : 'late', minutesTo: 0, progress: 0 };
    var back = DM().nextAction(rows || [], today);
    if (back && back.from === 'backlog' && !back.row.blocked) return { row: back.row, block: null, state: 'backlog', minutesTo: 0, progress: 0 };
    return null;
  }

  /** Open work worth pulling into today, best first, without blocked cards and without `skipId`. */
  function suggest(rows, today, limit, skipId) {
    return DM().unplanned(rows || [])
      .filter(function (r) { return !r.blocked && r.id !== skipId; })
      .slice(0, limit > 0 ? limit : 5);
  }

  /** The headline under the greeting. */
  function headline(stats) {
    if (!stats || !stats.total) return 'Journée libre';
    if (!stats.open) return 'Tout est fait. Belle journée !';
    return stats.open + (stats.open > 1 ? ' tâches' : ' tâche') + ' à faire';
  }

  /* ── Bilan de la semaine ───────────────────────────────────────── */

  function parseDay(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  /** Monday of the week that contains `iso` ('' when the day is not a date). */
  function weekStart(iso) {
    var d = parseDay(iso);
    if (!d) return '';
    var day = d.getDay();
    return DM().addDays(iso, day === 0 ? -6 : 1 - day);
  }

  /** "Aujourd’hui", "Hier", or "lundi 12". */
  function dayLabel(iso, today) {
    if (iso && iso === today) return 'Aujourd’hui';
    var dm = DM();
    if (iso && iso === dm.addDays(today, -1)) return 'Hier';
    var d = parseDay(iso);
    if (!d) return '';
    return DAYS_LONG[d.getDay()] + ' ' + d.getDate();
  }

  /** Minutes the card actually carries. A missing estimate stays 0 (no invented half hour). */
  function loggedMinutes(list) {
    return (list || []).reduce(function (n, r) {
      return n + (r && r.estimate > 0 ? Math.round(r.estimate) : 0);
    }, 0);
  }

  function byDoneOrder(a, b) {
    var dm = DM();
    var as = dm.parseClock(a.startTime || a.dueTime || '');
    var bs = dm.parseClock(b.startTime || b.dueTime || '');
    if (as == null) as = 9999;
    if (bs == null) bs = 9999;
    return as - bs || (a.pos || 0) - (b.pos || 0);
  }

  /**
   * Completed work whose planned day falls in this week (Monday through Sunday).
   * A card with no day, a vague horizon, or a day outside the week stays out:
   * the page has no completion date, so the planned day is the day it counts for
   * (same rule as today's done list).
   * Returns { from, to, days: [{ iso, label, rows, minutes }], count, minutes }.
   */
  function weekRecap(rows, today) {
    var from = weekStart(today);
    var empty = { from: '', to: '', days: [], count: 0, minutes: 0 };
    if (!from) return empty;
    var dm = DM();
    var to = dm.addDays(from, 6);
    var byDay = {};
    (rows || []).forEach(function (r) {
      if (!isDone(r)) return;
      var day = dm.plannedDay(r);
      if (!day || day < from || day > to) return;
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(r);
    });
    var days = Object.keys(byDay).sort().map(function (iso) {
      var list = byDay[iso].slice().sort(byDoneOrder);
      return { iso: iso, label: dayLabel(iso, today), rows: list, minutes: loggedMinutes(list) };
    });
    return {
      from: from,
      to: to,
      days: days,
      count: days.reduce(function (n, d) { return n + d.rows.length; }, 0),
      minutes: days.reduce(function (n, d) { return n + d.minutes; }, 0),
    };
  }

  /* ── Widget board ──────────────────────────────────────────────── */

  var LAYOUT_COLS = 12;
  var LAYOUT_ROW = 16; // one grid row, in px. The page and the tests share this.
  var LAYOUT_MIN_W = 3;
  var LAYOUT_MIN_H = 5;
  var LAYOUT_MAX_H = 96;
  var LAYOUT_TITLE = 40;
  var LAYOUT_V = 2; // 2 introduces the week recap on boards saved before it existed.

  // Default geometry: greeting and weather on the first band, then the day's
  // sections down the left and the clock beside them. h is in grid rows.
  var WIDGETS = [
    { id: 'hello', label: 'Bonjour', icon: 'sun', w: 7, h: 16 },
    { id: 'weather', label: 'Météo', icon: 'cloud', w: 5, h: 16 },
    { id: 'focus', label: 'Prochaine', icon: 'target-arrow', w: 7, h: 11 },
    { id: 'late', label: 'En retard', icon: 'alert-circle', w: 7, h: 16 },
    { id: 'tasks', label: 'À faire', icon: 'list-check', w: 7, h: 16 },
    { id: 'sugg', label: 'À planifier', icon: 'bulb', w: 7, h: 12 },
    { id: 'review', label: 'Revue', icon: 'list-search', w: 7, h: 12 },
    { id: 'week', label: 'Bilan de la semaine', icon: 'calendar-week', w: 7, h: 14 },
    { id: 'plan', label: 'Planning', icon: 'calendar-time', w: 5, h: 55 },
  ];

  function widgetById(id) {
    for (var i = 0; i < WIDGETS.length; i++) if (WIDGETS[i].id === id) return WIDGETS[i];
    return null;
  }

  function copyItem(it) {
    return { id: it.id, c: it.c, r: it.r, w: it.w, h: it.h };
  }

  function cloneLayout(layout) {
    return JSON.parse(JSON.stringify(layout));
  }

  /** The arrangement a new visitor sees. */
  function defaultLayout() {
    var left = [
      { id: 'focus', w: 7, h: 11 },
      { id: 'late', w: 7, h: 16 },
      { id: 'tasks', w: 7, h: 16 },
      { id: 'week', w: 7, h: 14 },
      { id: 'sugg', w: 7, h: 12 },
      { id: 'review', w: 7, h: 12 },
    ];
    var items = [
      { id: 'hello', c: 0, r: 0, w: 7, h: 16 },
      { id: 'weather', c: 7, r: 0, w: 5, h: 16 },
    ];
    var r = 16;
    var span = 0;
    left.forEach(function (it) {
      items.push({ id: it.id, c: 0, r: r, w: it.w, h: it.h });
      r += it.h;
      span += it.h;
    });
    items.push({ id: 'plan', c: 7, r: 16, w: 5, h: span });
    return { v: LAYOUT_V, titles: {}, items: items };
  }

  /**
   * A board saved before the week recap existed gets that widget once, under the
   * left column. Closing it afterwards stays closed (the saved version is current).
   * An empty board stays empty: the visitor closed every widget on purpose.
   */
  function adoptWeek(layout) {
    if (!layout.items.length || findItem(layout.items, 'week')) return;
    var cat = widgetById('week');
    var anchor = null;
    layout.items.forEach(function (it) {
      if (it.c >= 7) return;
      if (!anchor || it.r + it.h > anchor.r + anchor.h) anchor = it;
    });
    var box = clampBox({ id: 'week', c: anchor ? anchor.c : 0, r: anchor ? anchor.r + anchor.h : 0, w: cat.w, h: cat.h });
    layout.items.push(box);
    var plan = findItem(layout.items, 'plan');
    if (plan && anchor && plan.c >= box.c + box.w && plan.r <= anchor.r) {
      var need = box.r + box.h - plan.r;
      if (need > plan.h) plan.h = Math.min(need, LAYOUT_MAX_H);
    }
    pushDown(layout.items, 'week');
  }

  function clampBox(it) {
    var w = clamp(it.w | 0, LAYOUT_MIN_W, LAYOUT_COLS);
    var c = clamp(it.c | 0, 0, LAYOUT_COLS - w);
    return {
      id: String(it.id),
      c: c,
      r: Math.max(0, it.r | 0),
      w: w,
      h: clamp(it.h | 0, LAYOUT_MIN_H, LAYOUT_MAX_H),
    };
  }

  function boxesOverlap(a, b) {
    return a.c < b.c + b.w && a.c + a.w > b.c && a.r < b.r + b.h && a.r + a.h > b.r;
  }

  function cleanTitle(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, LAYOUT_TITLE);
  }

  /**
   * A saved board, or the default when nothing was saved. An empty item list is kept:
   * the visitor closed every widget. Unknown ids and duplicates are dropped.
   */
  function normalizeLayout(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) return defaultLayout();
    var items = [];
    var seen = {};
    raw.items.forEach(function (it) {
      if (!it || !widgetById(it.id) || seen[it.id]) return;
      seen[it.id] = true;
      items.push(clampBox(it));
    });
    var titles = {};
    var src = raw.titles && typeof raw.titles === 'object' ? raw.titles : {};
    Object.keys(src).forEach(function (id) {
      if (!widgetById(id)) return;
      var t = cleanTitle(src[id]);
      if (t) titles[id] = t;
    });
    var layout = { v: LAYOUT_V, titles: titles, items: items };
    if ((raw.v | 0) < LAYOUT_V) adoptWeek(layout);
    return layout;
  }

  function layoutLabel(layout, id) {
    var cat = widgetById(id);
    if (!cat) return '';
    var custom = layout && layout.titles && layout.titles[id];
    return custom || cat.label;
  }

  function hiddenWidgets(layout) {
    var have = {};
    ((layout && layout.items) || []).forEach(function (it) { have[it.id] = true; });
    return WIDGETS.filter(function (w) { return !have[w.id]; }).map(function (w) {
      return { id: w.id, label: w.label, icon: w.icon };
    });
  }

  function findItem(items, id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  /** The widget immediately to the right, the one a width drag should share the row with. */
  function rightNeighbor(items, it) {
    var best = null;
    items.forEach(function (o) {
      if (o.id === it.id || o.c !== it.c + it.w) return;
      var overlap = Math.min(it.r + it.h, o.r + o.h) - Math.max(it.r, o.r);
      if (overlap <= 0) return;
      if (!best || overlap > best.overlap) best = { item: o, overlap: overlap };
    });
    return best ? best.item : null;
  }

  function choosePush(a, b, i, j, pinnedId) {
    if (a.id === pinnedId) return b;
    if (b.id === pinnedId) return a;
    if (a.r !== b.r) return a.r > b.r ? a : b;
    return i > j ? a : b;
  }

  /** Move whatever sits on `pinnedId` downward until nothing overlaps. */
  function pushDown(items, pinnedId) {
    var changed = false;
    var guard = 0;
    var limit = items.length * items.length + 2;
    while (guard++ < limit) {
      var hit = false;
      for (var i = 0; i < items.length; i++) {
        for (var j = 0; j < items.length; j++) {
          if (i === j || !boxesOverlap(items[i], items[j])) continue;
          var push = choosePush(items[i], items[j], i, j, pinnedId);
          var other = push === items[i] ? items[j] : items[i];
          var nr = other.r + other.h;
          if (push.r !== nr) {
            push.r = nr;
            hit = true;
            changed = true;
          }
        }
      }
      if (!hit) break;
    }
    return changed;
  }

  /** Slide every widget except the one the visitor just placed up into the free cells. */
  function compactUp(items, pinnedId) {
    var changed = false;
    var sorted = items.slice().sort(function (a, b) { return a.r - b.r || a.c - b.c; });
    sorted.forEach(function (it) {
      if (it.id === pinnedId) return;
      var r = it.r;
      while (r > 0) {
        var trial = { id: it.id, c: it.c, r: r - 1, w: it.w, h: it.h };
        var blocked = false;
        for (var i = 0; i < items.length; i++) {
          if (items[i] !== it && boxesOverlap(trial, items[i])) { blocked = true; break; }
        }
        if (blocked) break;
        r--;
      }
      if (r !== it.r) {
        it.r = r;
        changed = true;
      }
    });
    return changed;
  }

  function settle(items, pinnedId) {
    var guard = 0;
    while (guard++ < 16) {
      var pushed = pushDown(items, pinnedId);
      var compacted = compactUp(items, pinnedId);
      if (!pushed && !compacted) return;
    }
    pushDown(items, pinnedId);
  }

  function applyWidth(items, it, w) {
    var want = clamp(w, LAYOUT_MIN_W, LAYOUT_COLS - it.c);
    var nb = rightNeighbor(items, it);
    if (!nb) {
      it.w = want;
      return;
    }
    var nbW = nb.w - (want - it.w);
    if (nbW < LAYOUT_MIN_W) {
      want -= LAYOUT_MIN_W - nbW;
      nbW = LAYOUT_MIN_W;
    }
    if (want < LAYOUT_MIN_W) want = LAYOUT_MIN_W;
    it.w = want;
    nb.w = nbW;
    nb.c = it.c + it.w;
    if (nb.c + nb.w > LAYOUT_COLS) nb.w = LAYOUT_COLS - nb.c;
  }

  function withItems(layout, fn) {
    var next = cloneLayout(normalizeLayout(layout));
    fn(next);
    return next;
  }

  function closeLayout(layout, id) {
    return withItems(layout, function (next) {
      next.items = next.items.filter(function (it) { return it.id !== id; });
      settle(next.items, null);
    });
  }

  function openLayout(layout, id) {
    return withItems(layout, function (next) {
      if (!widgetById(id) || findItem(next.items, id)) return;
      var cat = widgetById(id);
      var bottom = 0;
      next.items.forEach(function (it) { bottom = Math.max(bottom, it.r + it.h); });
      next.items.push({ id: id, c: 0, r: bottom, w: cat.w, h: cat.h });
      settle(next.items, id);
    });
  }

  /** `w` or `h` null keeps that side. A width change shares the row with the widget on the right. */
  function resizeLayout(layout, id, w, h) {
    return withItems(layout, function (next) {
      var it = findItem(next.items, id);
      if (!it) return;
      if (w != null && w !== it.w) applyWidth(next.items, it, w);
      if (h != null && h !== it.h) it.h = clamp(h, LAYOUT_MIN_H, LAYOUT_MAX_H);
      settle(next.items, id);
    });
  }

  function moveLayout(layout, id, c, r) {
    return withItems(layout, function (next) {
      var it = findItem(next.items, id);
      if (!it) return;
      var box = clampBox({ id: id, c: c, r: r, w: it.w, h: it.h });
      it.c = box.c;
      it.r = box.r;
      settle(next.items, id);
    });
  }

  function renameLayout(layout, id, title) {
    return withItems(layout, function (next) {
      var cat = widgetById(id);
      if (!cat) return;
      var t = cleanTitle(title);
      if (!t || t === cat.label) delete next.titles[id];
      else next.titles[id] = t;
    });
  }

  /** Narrow screens stack the open widgets, full width, in reading order. The saved board is untouched. */
  function presentLayout(layout, narrow) {
    var items = normalizeLayout(layout).items.map(copyItem);
    if (!narrow) return items;
    items.sort(function (a, b) { return a.r - b.r || a.c - b.c; });
    var r = 0;
    items.forEach(function (it) {
      it.c = 0;
      it.w = LAYOUT_COLS;
      it.r = r;
      r += it.h;
    });
    return items;
  }

  function layoutSignature(layout) {
    var n = normalizeLayout(layout);
    var items = n.items.map(copyItem).sort(function (a, b) {
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    var titles = {};
    Object.keys(n.titles).sort().forEach(function (k) { titles[k] = n.titles[k]; });
    return JSON.stringify({ titles: titles, items: items });
  }

  function layoutSame(a, b) {
    return layoutSignature(a) === layoutSignature(b);
  }

  global.TodayModel = {
    WORK_END: WORK_END,
    WORK_START: WORK_START,
    AFTERNOON_OFF: AFTERNOON_OFF,
    FRIDAY_OFF: FRIDAY_OFF,
    FLOW_LIMIT: FLOW_LIMIT,
    STEP: STEP,
    hello: hello,
    firstName: firstName,
    dayTitle: dayTitle,
    fmtClock: fmtClock,
    fmtRange: fmtRange,
    inWords: inWords,
    fmtDuration: fmtDuration,
    fmtOffset: fmtOffset,
    snap: snap,
    ceilTo: ceilTo,
    toClock: toClock,
    timeSlots: timeSlots,
    splitClock: splitClock,
    rowRange: rowRange,
    flowPlan: flowPlan,
    layoutLanes: layoutLanes,
    elasticScale: elasticScale,
    windowRange: windowRange,
    offRanges: offRanges,
    freeGaps: freeGaps,
    isDone: isDone,
    buildDay: buildDay,
    suggest: suggest,
    headline: headline,
    weekRecap: weekRecap,
    layout: {
      COLS: LAYOUT_COLS,
      ROW: LAYOUT_ROW,
      MIN_W: LAYOUT_MIN_W,
      MIN_H: LAYOUT_MIN_H,
      MAX_H: LAYOUT_MAX_H,
      widgets: function () { return WIDGETS.map(function (w) { return { id: w.id, label: w.label, icon: w.icon, w: w.w, h: w.h }; }); },
      defaults: defaultLayout,
      normalize: normalizeLayout,
      label: layoutLabel,
      hidden: hiddenWidgets,
      close: closeLayout,
      open: openLayout,
      resize: resizeLayout,
      move: moveLayout,
      rename: renameLayout,
      present: presentLayout,
      same: layoutSame,
    },
  };
})(typeof window !== 'undefined' ? window : this);
