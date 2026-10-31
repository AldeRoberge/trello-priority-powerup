/**
 * Role: the "Aujourd'hui" document. A page generated from the board: what is due today, what to bring
 * to someone, what to bring back from a place, what can wait. Each line is a checkbox followed by a
 * task chip, so the page and the cards stay one thing.
 * Pure (no Trello, no DOM). Exposes window.DocsDaily (no bundler).
 *
 *   build(rows, today)        → sections [{ kind, title, items: [{ id, name, done }] }]
 *   markdown(sections, notes) → the page body (warning, sections, rule, free notes)
 *   parse(body)               → { items: [{ kind, checked, taskId, text }], notes }
 *   reconcile(body)           → { create: [{ kind, text, done }], strays: [text] } lines typed by hand
 *
 * Page layout: a warning callout, one `##` heading per section with `- [ ] [@Nom](task:ID)` lines,
 * then a `---` rule. Everything under the first rule belongs to the user and is kept as it is.
 */
(function (global) {
  'use strict';

  var TITLE = 'Aujourd’hui';
  var TODAY_TITLE = 'À faire aujourd’hui';
  var LATER_TITLE = 'À faire éventuellement';
  var WORK_TITLE = 'Travail';
  var MAX_LATER = 40;
  var WARNING = 'Document généré automatiquement. Cocher une case ou écrire une ligne met la tâche à jour, et inversement.';
  var RE_ITEM = /^\s{0,3}[-*+]\s+\[( |x|X)\](?:[ \t]+(.*))?$/;
  var RE_TASK = /\[@(?:\\.|[^\]\\])*\]\(task:([A-Za-z0-9_-]+)\)/;
  var RE_RULE = /^\s{0,3}([-_*])\1{2,}\s*$/;
  var RE_HEAD = /^##\s+(.*?)\s*$/;

  function fold(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[’']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function clean(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function isDone(row) {
    return !!row && (row.statutKey === 'completed' || row.statutKey === 'canceled');
  }

  function names(list) {
    return (list || [])
      .map(function (p) { return clean(p && (p.name || p.fullName || p.label)); })
      .filter(Boolean);
  }

  function place(row, slot) {
    var p = row && row.inputs && row.inputs.places;
    return p && p[slot] && clean(p[slot].name) ? clean(p[slot].name) : '';
  }

  function hasLabel(row, re) {
    return (row.labels || []).some(function (l) { return re.test(fold(l && l.name)); });
  }

  function byOrder(a, b) {
    var ap = typeof a.priority === 'number' ? a.priority : -1;
    var bp = typeof b.priority === 'number' ? b.priority : -1;
    if (ap !== bp) return bp - ap;
    return (a.pos || 0) - (b.pos || 0);
  }

  function item(row) {
    return { id: row.id, name: clean(row.name) || 'Sans titre', done: isDone(row) };
  }

  /**
   * @param {object[]} rows board rows (TableModel.rowFromRecord)
   * @param {string} today local ISO day
   */
  function build(rows, today) {
    var open = [];
    var todayRows = [];
    var groups = Object.create(null);
    var order = [];
    var work = [];
    var later = [];

    function group(key, title, row) {
      if (!groups[key]) {
        groups[key] = { kind: 'group', title: title, rows: [] };
        order.push(key);
      }
      groups[key].rows.push(row);
    }

    (rows || []).forEach(function (row) {
      if (!row || !row.id) return;
      var due = row.dueVague ? '' : String(row.due || '').slice(0, 10);
      if (isDone(row)) {
        if (due && due === today) todayRows.push(row);
        return;
      }
      open.push(row);
      if (due && due <= today) {
        todayRows.push(row);
        return;
      }
      var from = place(row, 'from');
      var people = names(row.inputs && row.inputs.customAssignees);
      var to = place(row, 'to');
      if (from) group('from:' + fold(from), 'À rapporter de ' + from, row);
      else if (people.length) group('to:' + fold(people[0]), 'À apporter à ' + people[0], row);
      else if (to) group('to:' + fold(to), 'À apporter à ' + to, row);
      else if (hasLabel(row, /^(travail|work)$/)) work.push(row);
      else if (!due) later.push(row);
    });

    var sections = [{ kind: 'today', title: TODAY_TITLE, items: todayRows.sort(byOrder).map(item) }];
    order.forEach(function (key) {
      sections.push({ kind: 'group', title: groups[key].title, items: groups[key].rows.sort(byOrder).map(item) });
    });
    sections.push({ kind: 'later', title: LATER_TITLE, items: later.sort(byOrder).slice(0, MAX_LATER).map(item) });
    if (work.length) sections.push({ kind: 'work', title: WORK_TITLE, items: work.sort(byOrder).map(item) });
    return sections;
  }

  function label(name) {
    return String(name).replace(/[\\\[\]]/g, '\\$&');
  }

  function line(it) {
    return '- [' + (it.done ? 'x' : ' ') + '] [@' + label(it.name) + '](task:' + it.id + ')';
  }

  /** The page body. Empty "today" and "later" keep one blank checkbox: that is where the user types. */
  function markdown(sections, notes) {
    var out = ['> [!warning]', '> ' + WARNING, ''];
    (sections || []).forEach(function (s) {
      var typed = s.kind === 'today' || s.kind === 'later';
      if (!s.items.length && !typed) return;
      out.push('## ' + s.title, '');
      s.items.forEach(function (it) { out.push(line(it)); });
      if (typed) out.push('- [ ] ');
      out.push('');
    });
    out.push('---');
    var tail = String(notes == null ? '' : notes).replace(/^\s*\n/, '').replace(/\s+$/, '');
    if (tail) out.push('', tail);
    return out.join('\n');
  }

  function kindOf(title) {
    var f = fold(title);
    if (f === fold(TODAY_TITLE)) return 'today';
    if (f === fold(LATER_TITLE)) return 'later';
    if (f === fold(WORK_TITLE)) return 'work';
    return 'group';
  }

  /** Splits the body at its first rule: managed part, then the user's notes. */
  function split(body) {
    var lines = String(body == null ? '' : body).replace(/\r\n?/g, '\n').split('\n');
    var i;
    for (i = 0; i < lines.length; i++) {
      if (RE_RULE.test(lines[i])) return { head: lines.slice(0, i), notes: lines.slice(i + 1).join('\n') };
    }
    return { head: lines, notes: '' };
  }

  function parse(body) {
    var parts = split(body);
    var kind = '';
    var items = [];
    parts.head.forEach(function (ln) {
      var h = RE_HEAD.exec(ln);
      if (h) {
        kind = kindOf(h[1]);
        return;
      }
      var m = RE_ITEM.exec(ln);
      if (!m) return;
      var task = RE_TASK.exec(m[2] || '');
      items.push({ kind: kind, checked: m[1] !== ' ', taskId: task ? task[1] : '', text: clean(m[2]) });
    });
    return { items: items, notes: parts.notes };
  }

  /**
   * Lines the user wrote by hand (a checkbox with no task chip). Under "today" and "later" each becomes a
   * card. Anywhere else it moves to the notes, so nothing typed is lost.
   */
  function reconcile(body) {
    var create = [];
    var strays = [];
    parse(body).items.forEach(function (it) {
      if (it.taskId || !it.text) return;
      if (it.kind === 'today' || it.kind === 'later') create.push({ kind: it.kind, text: it.text, done: it.checked });
      else strays.push('- [' + (it.checked ? 'x' : ' ') + '] ' + it.text);
    });
    return { create: create, strays: strays };
  }

  /** Free notes to keep when the page is rebuilt: what was under the rule, then stray lines. */
  function notesOf(body) {
    var r = reconcile(body);
    var notes = parse(body).notes.replace(/\s+$/, '');
    return [notes].concat(r.strays).filter(Boolean).join('\n');
  }

  global.DocsDaily = {
    TITLE: TITLE,
    WARNING: WARNING,
    build: build,
    markdown: markdown,
    parse: parse,
    reconcile: reconcile,
    notesOf: notesOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
