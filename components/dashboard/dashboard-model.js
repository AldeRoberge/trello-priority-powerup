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

  /** Day a task is planned on: its start date, else its due date, else ''. */
  function plannedDay(row) {
    return row.start || row.due || '';
  }

  /** Open work that is not in triage and has no planned day yet, best first. */
  function unplanned(rows) {
    return (rows || [])
      .filter(function (r) {
        return isOpen(r) && r.statutKey !== 'triage' && !plannedDay(r);
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

  /** Sidebar badge counts. */
  function counts(rows, today) {
    return {
      triage: triageQueue(rows).length,
      orchestrator: unplanned(rows).length,
      today: todayList(rows, today).length,
    };
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
    todayList: todayList,
    nextAction: nextAction,
    suggestions: suggestions,
    timeline: timeline,
    hhmm: hhmm,
    formatMinutes: formatMinutes,
    counts: counts,
  };
})(typeof window !== 'undefined' ? window : this);
