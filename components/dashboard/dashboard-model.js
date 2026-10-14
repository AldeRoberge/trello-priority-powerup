/*
 * Role: pure logic of the Dashboard view (Ingest → Triage → Orchestrator → Today).
 * No Trello / DOM access so it can be unit-tested (test/dashboard-model.test.js).
 * Rows are the shape built by DashboardTrello.load: TableModel.rowFromRecord + { start, dueDone, estimate }.
 * Dates are local ISO days ("2026-10-06"); estimates are minutes.
 */
(function (global) {
  'use strict';

  var DEFAULT_CAPACITY = 360; // minutes of focused work per day
  var DEFAULT_ESTIMATE = 30; // minutes assumed for a task without estimate
  var DAY_START = 9 * 60; // timeline starts at 09:00
  var PENDING = { triage: 1, backlog: 1, unstarted: 1, started: 1, blocked: 1, '': 1 };

  /** One task per non-empty line; bullets / numbering / checkboxes are stripped, duplicates dropped. */
  function parseLines(text) {
    var seen = {};
    var out = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach(function (raw) {
        var s = raw
          .replace(/^\s*(?:[-*•–]\s+|\d+[.)]\s+|\[[ xX]?\]\s*|- \[[ xX]?\]\s*)+/, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!s) return;
        var k = s.toLowerCase();
        if (seen[k]) return;
        seen[k] = true;
        out.push(s);
      });
    return out;
  }

  /* ── Rich capture: Markdown (from DocsModel.domToMd) → tasks ───────────────────────────── */

  var MAX_FILE_BYTES = 10 * 1024 * 1024; // Trello's attachment limit on free workspaces
  var MAX_TITLE = 140;
  var TOKEN_RE = /⟦([A-Za-z0-9_-]+)⟧/g; // ⟦id⟧ stands for an attachment chip inside the text
  var URL_RE = /https?:\/\/[^\s<>()\[\]]+/g;
  var LIST_LINE_RE = /^\s*(?:\\?[-*•]|\d+\\?[.)])\s+/; // "\-" and "1\." are how DocsModel escapes typed bullets
  var BLANK = '<!--blank-->'; // DocsModel.domToMd marker of an empty paragraph

  function token(aid) {
    return '⟦' + aid + '⟧';
  }

  /** Markdown line → plain text (formatting, link targets and block prefixes dropped). */
  function plainText(md) {
    return String(md || '')
      .replace(/^\s*(?:#{1,6}\s+|>\s*|(?:\\?[-*•]|\d+\\?[.)])\s+(?:\[[ xX]?\]\s*)?)+/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=$|[\s).,;:!?])/g, '$1$2')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\\([\\`*_{}\[\]()#+\-.!~|>])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Distinct http(s) links of a Markdown text, trailing punctuation removed. */
  function extractUrls(md) {
    var seen = {};
    var out = [];
    (String(md || '').match(URL_RE) || []).forEach(function (u) {
      u = u.replace(/[.,;:!?'"»]+$/, '');
      if (u && !seen[u]) {
        seen[u] = true;
        out.push(u);
      }
    });
    return out;
  }

  function titleFromUrl(url) {
    var m = /^https?:\/\/(?:www\.)?([^\/?#]+)([^?#]*)/.exec(url);
    if (!m) return url;
    var s = m[1] + (m[2] && m[2] !== '/' ? m[2].replace(/\/$/, '') : '');
    return s.length > 60 ? s.slice(0, 59) + '…' : s;
  }

  function cutTitle(s) {
    if (s.length <= MAX_TITLE) return { text: s, cut: false };
    var head = s.slice(0, MAX_TITLE);
    var sp = head.lastIndexOf(' ');
    return { text: (sp > 60 ? head.slice(0, sp) : head).replace(/[ ,;:.]+$/, '') + '…', cut: true };
  }

  /** Splits Markdown into task blocks: blank lines separate tasks, a block made only of list items is one task per item. */
  function captureBlocks(md) {
    var out = [];
    String(md || '')
      .replace(/\r\n?/g, '\n')
      .split(/\n{2,}/)
      .forEach(function (block) {
        var lines = block.split('\n').filter(function (l) {
          return l.trim() !== '' && l.trim() !== BLANK;
        });
        if (!lines.length) return;
        if (lines.length > 1 && lines.every(function (l) { return LIST_LINE_RE.test(l); })) {
          lines.forEach(function (l) { out.push([l]); });
        } else {
          out.push(lines);
        }
      });
    return out;
  }

  /**
   * Capture Markdown → tasks [{ title, desc, urls, aids, due }].
   *  - first line = title (plain text), following lines = description (Markdown)
   *  - a first line with formatting / links / a cut title keeps its full Markdown in the description
   *  - every link also lands in `urls` (added as a Trello link attachment)
   *  - ⟦id⟧ tokens (attachment chips) are removed from the text and listed in `aids`
   *  - a block with only attachments becomes a task named after its first file (names = { aid: fileName })
   */
  function parseCapture(md, names, now) {
    names = names || {};
    var tasks = [];
    captureBlocks(md).forEach(function (lines) {
      var aids = [];
      var clean = lines
        .map(function (l) {
          return l.replace(TOKEN_RE, function (all, id) {
            aids.push(id);
            return ' ';
          }).replace(/[ \t]+/g, ' ').trim();
        })
        .filter(function (l) {
          return l !== '' && l !== BLANK;
        });
      if (!clean.length && !aids.length) return;
      var urls = extractUrls(clean.join('\n'));
      var first = clean[0] || '';
      var title = plainText(first);
      var cut = { text: title, cut: false };
      if (!title && aids.length) {
        title = String(names[aids[0]] || 'Pièce jointe').replace(/\.[A-Za-z0-9]{1,5}$/, '');
        cut = { text: title, cut: false };
      } else if (/^https?:\/\/\S+$/.test(title)) {
        title = titleFromUrl(title);
        cut = { text: title, cut: false };
      } else {
        cut = cutTitle(title);
      }
      var rest = clean.slice(1);
      var firstMd = first.replace(LIST_LINE_RE, '');
      var desc = '';
      if (!clean.length) desc = '';
      else if (cut.cut || firstMd.replace(/\\(.)/g, '$1') !== title) desc = [firstMd].concat(rest).join('\n\n');
      else if (rest.length) desc = rest.join('\n\n');
      // "… demain" / "… vendredi": the date leaves the title and becomes the due date (QuickParse, when loaded).
      var due = '';
      var QP = global.QuickParse;
      if (QP && !cut.cut && !/^https?:\/\//.test(cut.text)) {
        var q = QP.parse(cut.text, now);
        if (q.dueDate) { cut = { text: q.name, cut: false }; due = q.dueDate; }
      }
      tasks.push({ title: cut.text, desc: desc, urls: urls, aids: aids, due: due });
    });
    return tasks;
  }

  function isoOf(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function parseIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  function addDays(iso, n) {
    var d = parseIso(iso);
    if (!d) return '';
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }

  /** `count` consecutive days starting at `fromIso`. */
  function nextDays(fromIso, count) {
    var out = [];
    for (var i = 0; i < count; i++) out.push(addDays(fromIso, i));
    return out;
  }

  function isOpen(row) {
    return row.statutKey !== 'completed' && row.statutKey !== 'canceled' && !row.dueDone;
  }

  /** Triage queue: cards sitting in a list of category "triage", oldest (board order) first. */
  function triageQueue(rows) {
    return (rows || [])
      .filter(function (r) {
        return r.statutKey === 'triage';
      })
      .sort(function (a, b) {
        return (a.pos || 0) - (b.pos || 0);
      });
  }

  function estimateOf(row) {
    return row.estimate > 0 ? row.estimate : DEFAULT_ESTIMATE;
  }

  function scoreOf(row) {
    return typeof row.priority === 'number' ? row.priority : -1;
  }

  /** Highest priority first, then earliest due, then board order. */
  function byPriority(a, b) {
    if (scoreOf(b) !== scoreOf(a)) return scoreOf(b) - scoreOf(a);
    var ad = a.due || '9999-99-99';
    var bd = b.due || '9999-99-99';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return (a.pos || 0) - (b.pos || 0);
  }

  /** Day a task is planned on. A vague horizon stays off the calendar. */
  function plannedDay(row) {
    if (row && row.dueVague) return '';
    return row.start || row.due || '';
  }

  /** Open work that is not in triage, not a vague horizon, and has no planned day yet, best first. */
  function unplanned(rows) {
    return (rows || [])
      .filter(function (r) {
        return isOpen(r) && r.statutKey !== 'triage' && !r.dueVague && !plannedDay(r);
      })
      .sort(byPriority);
  }

  /** Open, non-triage work planned on `iso`. */
  function tasksOn(rows, iso) {
    return (rows || [])
      .filter(function (r) {
        return isOpen(r) && r.statutKey !== 'triage' && plannedDay(r) === iso;
      })
      .sort(byPriority);
  }

  function minutesOf(list) {
    return list.reduce(function (n, r) {
      return n + estimateOf(r);
    }, 0);
  }

  /**
   * Orchestrator plan: one entry per day with its tasks and used minutes.
   * Tasks planned before `from` (late) are carried on the first day.
   */
  function weekPlan(rows, from, days, capacity) {
    capacity = capacity > 0 ? capacity : DEFAULT_CAPACITY;
    var list = nextDays(from, days || 7);
    return list.map(function (iso, i) {
      var tasks = tasksOn(rows, iso);
      if (i === 0) tasks = overdue(rows, from).concat(tasks);
      var used = minutesOf(tasks);
      return { date: iso, tasks: tasks, used: used, capacity: capacity, over: used > capacity };
    });
  }

  /** Open work whose planned day is before `from`. */
  function overdue(rows, from) {
    return (rows || [])
      .filter(function (r) {
        var d = plannedDay(r);
        return isOpen(r) && r.statutKey !== 'triage' && d && d < from;
      })
      .sort(byPriority);
  }

  var SCALES = [
    { id: 'minute', label: 'Minute' },
    { id: 'hour', label: 'Heure' },
    { id: 'day', label: 'Jour' },
    { id: 'week', label: 'Semaine' },
    { id: 'month', label: 'Mois' },
    { id: 'year', label: 'Ann\u00e9e' },
    { id: 'years', label: 'Ann\u00e9es' },
    { id: 'vague', label: 'Vague' },
  ];

  function mondayOf(iso) {
    var d = parseIso(iso);
    if (!d) return iso;
    var day = d.getDay();
    return addDays(iso, day === 0 ? -6 : 1 - day);
  }

  /** "14:30" → minutes since midnight. "24:00" is 1440. Anything else is null. */
  function parseClock(value) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim());
    if (!m) return null;
    var h = +m[1];
    var min = +m[2];
    if (h === 24 && min === 0) return 1440;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  function clockText(mins) {
    mins = Math.max(0, Math.min(1439, mins));
    return ('0' + Math.floor(mins / 60)).slice(-2) + ':' + ('0' + (mins % 60)).slice(-2);
  }

  /** Start time of a planned task, in minutes. A vague horizon has none. */
  function plannedMinutes(row) {
    if (!row || row.dueVague) return null;
    return parseClock(row.startTime || row.dueTime || '');
  }

  /** Open tasks planned on `from` with a day but no hour yet. */
  function untimed(rows, from) {
    return (rows || [])
      .filter(function (r) {
        return isOpen(r) && r.statutKey !== 'triage' && !r.dueVague && plannedDay(r) === from && plannedMinutes(r) == null;
      })
      .sort(byPriority);
  }

  /** Columns for one orchestrator zoom. Vague tasks stay off every calendar scale. */
  function horizonPlan(rows, from, scale, capacity, vagueOpts, nowMinutes) {
    capacity = capacity > 0 ? capacity : DEFAULT_CAPACITY;
    var clock = scale === 'hour' || scale === 'minute';
    var buckets = scale === 'vague' ? vagueBuckets(vagueOpts) : calendarBuckets(from, scale, nowMinutes);
    buckets.forEach(function (b) {
      b.tasks = [];
      b.capacity = b.slotMinutes > 0 ? b.slotMinutes : (b.workdays ? capacity * b.workdays : 0);
    });
    (rows || []).forEach(function (r) {
      if (!isOpen(r) || r.statutKey === 'triage') return;
      var b = scale === 'vague'
        ? vagueBucketFor(r, buckets, from)
        : clock
          ? clockBucketFor(r, buckets, from)
          : calendarBucketFor(r, buckets, from);
      if (b) b.tasks.push(r);
    });
    buckets.forEach(function (b) {
      b.tasks.sort(byPriority);
      b.used = minutesOf(b.tasks);
      b.over = b.capacity > 0 && b.used > b.capacity;
    });
    return buckets;
  }

  function calendarBuckets(from, scale, nowMinutes) {
    var out = [];
    if (scale === 'hour' || scale === 'minute') return clockBuckets(from, scale, nowMinutes);
    if (scale === 'week') {
      var start = mondayOf(from);
      for (var w = 0; w < 8; w++) {
        var s = addDays(start, w * 7);
        out.push({ key: s, date: s, end: addDays(s, 7), workdays: 5 });
      }
      return out;
    }
    if (scale === 'month') {
      var base = parseIso(from);
      for (var m = 0; m < 12; m++) {
        var startD = new Date(base.getFullYear(), base.getMonth() + m, 1);
        var endD = new Date(base.getFullYear(), base.getMonth() + m + 1, 1);
        out.push({ key: isoOf(startD).slice(0, 7), date: isoOf(startD), end: isoOf(endD), workdays: 20 });
      }
      return out;
    }
    if (scale === 'year' || scale === 'years') {
      var y0 = parseIso(from).getFullYear();
      var n = scale === 'years' ? 12 : 5;
      for (var y = 0; y < n; y++) {
        out.push({
          key: String(y0 + y),
          date: y === 0 ? from : (y0 + y) + '-01-01',
          end: (y0 + y + 1) + '-01-01',
          workdays: 240,
        });
      }
      return out;
    }
    nextDays(from, 7).forEach(function (iso) {
      out.push({ key: iso, date: iso, end: addDays(iso, 1), workdays: 1 });
    });
    return out;
  }

  /** Hours 8 h–19 h of `from`, or twelve 15-minute slots from the given clock (09:00 when none). */
  function clockBuckets(from, scale, nowMinutes) {
    var out = [];
    if (scale === 'hour') {
      for (var h = 8; h <= 19; h++) {
        out.push(clockSlot(from, h * 60, 60));
      }
      return out;
    }
    var step = 15;
    var origin = nowMinutes == null ? 9 * 60 : Math.floor(nowMinutes / step) * step;
    if (origin < 0) origin = 0;
    if (origin > 21 * 60) origin = 21 * 60;
    for (var i = 0; i < 12; i++) {
      if (origin + i * step >= 24 * 60) break;
      out.push(clockSlot(from, origin + i * step, step));
    }
    return out;
  }

  function clockSlot(from, startMins, step) {
    var endMins = startMins + step;
    var time = clockText(startMins);
    return {
      key: from + 'T' + time,
      date: from,
      end: endMins >= 1440 ? addDays(from, 1) : from,
      time: time,
      endTime: endMins >= 1440 ? '24:00' : clockText(endMins),
      slotMinutes: step,
      workdays: 0,
    };
  }

  function clockBucketFor(row, buckets, from) {
    if (plannedDay(row) !== from) return null;
    var mins = plannedMinutes(row);
    if (mins == null) return null;
    for (var i = 0; i < buckets.length; i++) {
      var a = parseClock(buckets[i].time);
      var b = parseClock(buckets[i].endTime);
      if (a != null && b != null && mins >= a && mins < b) return buckets[i];
    }
    return null;
  }

  function calendarBucketFor(row, buckets, from) {
    var day = plannedDay(row);
    if (!day || !buckets.length) return null;
    if (day < from) return buckets[0];
    for (var i = 0; i < buckets.length; i++) {
      if (day >= buckets[i].date && day < buckets[i].end) return buckets[i];
    }
    return null;
  }

  function vagueBuckets(opts) {
    return (opts || []).map(function (o, i) {
      return {
        key: o.id,
        vague: o.id,
        label: o.label || o.id,
        days: o.days,
        fromDays: i === 0 ? 0 : opts[i - 1].days,
        toDays: o.days,
        date: '',
        end: '',
        workdays: 0,
      };
    });
  }

  function daysBetween(from, iso) {
    var a = parseIso(from);
    var b = parseIso(iso);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
  }

  function vagueBucketFor(row, buckets, from) {
    if (!buckets.length) return null;
    if (row.dueVague) {
      for (var i = 0; i < buckets.length; i++) if (buckets[i].key === row.dueVague) return buckets[i];
    }
    var day = row.start || row.due || '';
    if (!day) return null;
    var dist = daysBetween(from, day);
    if (dist < 0) return buckets[0];
    for (var j = 0; j < buckets.length; j++) if (dist <= buckets[j].toDays) return buckets[j];
    return buckets[buckets.length - 1];
  }

  /**
   * Auto-plan onto a coarser calendar (week, month, year). Vague stays a manual choice.
   * Returns [{ id, date }]. The date is the bucket start, or today when that start is past.
   */
  function placeAuto(rows, from, scale, capacity, vagueOpts) {
    if (!scale || scale === 'day' || scale === 'vague' || scale === 'hour' || scale === 'minute') return [];
    var plan = horizonPlan(rows, from, scale, capacity, vagueOpts);
    var used = plan.map(function (b) { return b.used; });
    var out = [];
    unplanned(rows).forEach(function (r) {
      var minutes = estimateOf(r);
      for (var i = 0; i < plan.length; i++) {
        if (used[i] + minutes <= plan[i].capacity || used[i] === 0) {
          used[i] += minutes;
          out.push({ id: r.id, date: plan[i].date < from ? from : plan[i].date });
          return;
        }
      }
    });
    return out;
  }

  /**
   * Auto-plan: assigns each unplanned task (best first) to the first day with room.
   * A task bigger than a whole day goes on the first empty day. Returns [{ id, date }].
   * Tasks that do not fit in the horizon are left out.
   */
  function autoPlan(rows, from, days, capacity) {
    var plan = weekPlan(rows, from, days, capacity);
    var cap = plan.length ? plan[0].capacity : DEFAULT_CAPACITY;
    var used = plan.map(function (d) {
      return d.used;
    });
    var out = [];
    unplanned(rows).forEach(function (r) {
      var m = estimateOf(r);
      for (var i = 0; i < plan.length; i++) {
        if (used[i] + m <= cap || used[i] === 0) {
          used[i] += m;
          out.push({ id: r.id, date: plan[i].date });
          return;
        }
      }
    });
    return out;
  }

  /** Today focus list: late work first, then today's, each best first. */
  function todayList(rows, today) {
    return overdue(rows, today).concat(tasksOn(rows, today));
  }

  /**
   * "What now?": the single best task to do next. Today's list first (late work, then today's);
   * when nothing is planned, the best unplanned task. { row, from: 'today' | 'backlog' } or null.
   */
  function nextAction(rows, today) {
    var t = todayList(rows, today)[0];
    if (t) return { row: t, from: 'today' };
    var u = unplanned(rows)[0];
    return u ? { row: u, from: 'backlog' } : null;
  }

  /** Unplanned work worth pulling into today, best first (skips the task `nextAction` already shows). */
  function suggestions(rows, today, limit) {
    var next = nextAction(rows, today);
    return unplanned(rows)
      .filter(function (r) { return !next || r.id !== next.row.id; })
      .slice(0, limit > 0 ? limit : 5);
  }

  /** Sequential time blocks from 09:00 for a task list: [{ id, start, end }] in minutes since midnight. */
  function timeline(tasks, dayStart) {
    var at = dayStart == null ? DAY_START : dayStart;
    return tasks.map(function (r) {
      var block = { id: r.id, start: at, end: at + estimateOf(r) };
      at = block.end;
      return block;
    });
  }

  /**
   * Pixel boxes for those blocks. The hour scale grows until each block is at
   * least minPx tall. A block never paints over the next one: if the slot is
   * still shorter than minPx, the box shrinks to the free gap.
   * opts: { minPx, gap, hourPx, maxHourPx }. top is relative to dayStart.
   */
  function timelineLayout(blocks, dayStart, opts) {
    opts = opts || {};
    var minPx = opts.minPx > 0 ? opts.minPx : 22;
    var gap = opts.gap >= 0 ? opts.gap : 3;
    var base = opts.hourPx > 0 ? opts.hourPx : 56;
    var cap = opts.maxHourPx > 0 ? opts.maxHourPx : 360;
    var first = dayStart == null ? DAY_START : dayStart;
    var list = blocks || [];
    var shortest = 0;
    list.forEach(function (b) {
      var d = b.end - b.start;
      if (d > 0 && (!shortest || d < shortest)) shortest = d;
    });
    var hourPx = base;
    if (shortest > 0) {
      var need = Math.ceil(((minPx + gap) * 60) / shortest);
      if (need > hourPx) hourPx = need;
    }
    if (hourPx > cap) hourPx = cap;
    var items = list.map(function (b, i) {
      var top = ((b.start - first) / 60) * hourPx;
      var nextTop = i + 1 < list.length ? ((list[i + 1].start - first) / 60) * hourPx : null;
      var room = nextTop == null ? Infinity : Math.max(0, nextTop - top - gap);
      var natural = Math.max(0, ((b.end - b.start) / 60) * hourPx - gap);
      var height = Math.min(Math.max(natural, Math.min(minPx, room)), room);
      return { id: b.id, top: top, height: height };
    });
    return { hourPx: hourPx, items: items };
  }

  /** 540 → "09:00" */
  function hhmm(min) {
    var h = Math.floor(min / 60) % 24;
    var m = min % 60;
    return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
  }

  /** 90 → "1 h 30", 45 → "45 min", 120 → "2 h" */
  function formatMinutes(min) {
    min = Math.round(min || 0);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60);
    var m = min % 60;
    return h + ' h' + (m ? ' ' + ('0' + m).slice(-2) : '');
  }

  /**
   * Title typed in an orchestrator column.
   * A trailing date in the title (via `parse`) wins over the column.
   * Otherwise the task takes the column day, or its vague horizon.
   * Returns { name, date, vague } or null when there is nothing to create.
   */
  function taskDraft(typed, columnDate, parse, vague, time) {
    var raw = String(typed || '').replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    var q = typeof parse === 'function' ? parse(raw) : null;
    var name = q && q.name != null ? String(q.name).replace(/\s+/g, ' ').trim() : raw;
    if (!name) name = raw;
    if (!name) return null;
    if (q && q.dueDate) return { name: name, date: q.dueDate, vague: '' };
    var out = { name: name, date: columnDate || '', vague: vague || '' };
    if (time && !vague) out.time = time;
    return out;
  }

  /** Sidebar badge counts. */
  function counts(rows, today) {
    return {
      triage: triageQueue(rows).length,
      orchestrator: unplanned(rows).length,
      today: todayList(rows, today).length,
    };
  }

  var ZOOM_MIN_COL = 148;
  var ZOOM_VAGUE_COL = 106;

  /** How long one column of this scale is, in days. Years share a year. */
  function zoomSpanDays(scale) {
    if (scale === 'minute') return 15 / 1440;
    if (scale === 'hour') return 1 / 24;
    if (scale === 'day') return 1;
    if (scale === 'week') return 7;
    if (scale === 'month') return 30.4375;
    if (scale === 'year' || scale === 'years') return 365.25;
    return 0;
  }

  function zoomBounds() {
    return {
      min: (ZOOM_VAGUE_COL / 365.25) * 0.45,
      max: 360 / (15 / 1440),
    };
  }

  /**
   * Continuous zoom → the scale whose columns are at least ZOOM_MIN_COL wide,
   * plus the pixel width of one column. Smaller than a skinny year becomes Vague.
   * pxPerDay is clamped into zoomBounds.
   */
  function zoomLayout(pxPerDay) {
    var bounds = zoomBounds();
    var p = Number(pxPerDay);
    if (!isFinite(p) || p <= 0) p = 180;
    if (p < bounds.min) p = bounds.min;
    if (p > bounds.max) p = bounds.max;
    if (p * zoomSpanDays('year') < ZOOM_VAGUE_COL) {
      return { scale: 'vague', colPx: 168, pxPerDay: p };
    }
    var order = ['minute', 'hour', 'day', 'week', 'month', 'year'];
    var scale = 'years';
    for (var i = 0; i < order.length; i++) {
      if (p * zoomSpanDays(order[i]) >= ZOOM_MIN_COL) {
        scale = order[i];
        break;
      }
    }
    var colPx = Math.round(p * zoomSpanDays(scale));
    if (colPx < 1) colPx = 1;
    return { scale: scale, colPx: colPx, pxPerDay: p };
  }

  function zoomSlider(pxPerDay) {
    var bounds = zoomBounds();
    var p = zoomLayout(pxPerDay).pxPerDay;
    var t = (Math.log(p) - Math.log(bounds.min)) / (Math.log(bounds.max) - Math.log(bounds.min));
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return Math.round(t * 1000);
  }

  function zoomFromSlider(value) {
    var bounds = zoomBounds();
    var t = Math.max(0, Math.min(1000, Number(value) || 0)) / 1000;
    return Math.exp(Math.log(bounds.min) + t * (Math.log(bounds.max) - Math.log(bounds.min)));
  }

  /** Pixels per day so `count` columns of `scale` fill `avail`, without leaving that scale. */
  function zoomFit(scale, avail, count) {
    if (scale === 'vague') return zoomBounds().min;
    var days = zoomSpanDays(scale);
    if (!days) return 180;
    var gaps = Math.max(0, (count || 1) - 1) * 4;
    var col = (Math.max(0, avail) - gaps) / Math.max(1, count || 1);
    if (scale !== 'years') {
      col = Math.max(ZOOM_MIN_COL, col);
      // Sitting on the minimum jumps to the next scale on the first zoom-out.
      // Rest a bit above it so the columns can shrink before the scale changes.
      if (col < ZOOM_MIN_COL * 1.2) col = ZOOM_MIN_COL * 1.45;
    }
    var layout = zoomLayout(col / days);
    if (layout.scale !== scale && scale !== 'years') layout = zoomLayout(ZOOM_MIN_COL / days);
    return layout.pxPerDay;
  }

  global.DashboardModel = {
    DEFAULT_CAPACITY: DEFAULT_CAPACITY,
    DEFAULT_ESTIMATE: DEFAULT_ESTIMATE,
    DAY_START: DAY_START,
    PENDING: PENDING,
    parseLines: parseLines,
    parseCapture: parseCapture,
    plainText: plainText,
    extractUrls: extractUrls,
    captureToken: token,
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    addDays: addDays,
    nextDays: nextDays,
    isoOf: isoOf,
    isOpen: isOpen,
    triageQueue: triageQueue,
    estimateOf: estimateOf,
    byPriority: byPriority,
    plannedDay: plannedDay,
    unplanned: unplanned,
    tasksOn: tasksOn,
    overdue: overdue,
    minutesOf: minutesOf,
    weekPlan: weekPlan,
    autoPlan: autoPlan,
    SCALES: SCALES,
    parseClock: parseClock,
    untimed: untimed,
    horizonPlan: horizonPlan,
    placeAuto: placeAuto,
    zoomSpanDays: zoomSpanDays,
    zoomBounds: zoomBounds,
    zoomLayout: zoomLayout,
    zoomSlider: zoomSlider,
    zoomFromSlider: zoomFromSlider,
    zoomFit: zoomFit,
    todayList: todayList,
    nextAction: nextAction,
    suggestions: suggestions,
    timeline: timeline,
    timelineLayout: timelineLayout,
    hhmm: hhmm,
    formatMinutes: formatMinutes,
    taskDraft: taskDraft,
    counts: counts,
  };
})(typeof window !== 'undefined' ? window : this);
