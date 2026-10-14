/**
 * Role: pure operating-system helpers shared by Dashboard, Kanban, Table and the card panel.
 * No Trello and no DOM. The next action is the first open checklist item. A vague horizon
 * stays off the calendar. A project row carries an outcome, a metric and that next step.
 * Exposes window.WorkOS (no bundler).
 */
(function (global) {
  'use strict';

  var DEFAULT_WIP = 3;
  var WAITING_DAYS = 5;
  var STALE_DAYS = 14;
  var REVIEW_DAYS = 7;
  var RANK = { vision: 0, mission: 1, goal: 2, objective: 3, project: 4 };

  function isOpen(row) {
    return !!row && row.statutKey !== 'completed' && row.statutKey !== 'canceled' && !row.dueDone;
  }

  function scoreOf(row) {
    return typeof row.priority === 'number' ? row.priority : -1;
  }

  function byPriority(a, b) {
    if (scoreOf(b) !== scoreOf(a)) return scoreOf(b) - scoreOf(a);
    var ad = a.dueVague ? '9999-99-99' : a.due || '9999-99-99';
    var bd = b.dueVague ? '9999-99-99' : b.due || '9999-99-99';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return (a.pos || 0) - (b.pos || 0);
  }

  /** First incomplete checklist line, walking into a nested list. '' when none is open. */
  function firstOpenStep(items) {
    var list = Array.isArray(items) ? items : [];
    var i;
    for (i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it || it.done === true || it.progress >= 100) continue;
      if (Array.isArray(it.items) && it.items.length) {
        var nested = firstOpenStep(it.items);
        if (nested) return nested;
      }
      var text = typeof it.text === 'string' ? it.text.replace(/\s+/g, ' ').trim() : '';
      if (text) return text;
    }
    return '';
  }

  /**
   * What to do on an open card.
   * { text, missing:false } the first open checklist item.
   * { text:'', missing:true } the checklist is exhausted and the card is still open.
   * null when the card has no checklist: the title is the action, or the card is closed.
   */
  function stepState(row) {
    if (!isOpen(row)) return null;
    var text = firstOpenStep(row.items);
    if (text) return { text: text, missing: false };
    if (Array.isArray(row.items) && row.items.length) return { text: '', missing: true };
    return null;
  }

  /**
   * hard: a time, an Outlook event, a due date with no start, or a range.
   * planned: start and due on the same day (what the orchestrator writes).
   * vague: an approximate horizon, kept off the calendar.
   */
  function dateKind(row) {
    if (!row) return '';
    if (row.dueVague) return 'vague';
    if (row.outlookEvent) return 'hard';
    var start = row.start || '';
    var due = row.due || '';
    if (row.dueTime) return 'hard';
    if (due && !start) return 'hard';
    if (due && start && due !== start) return 'hard';
    if (start || due) return 'planned';
    return '';
  }

  /** Docs whose body mentions (type, id). Docs are { id, title, body }. */
  function backlinks(docs, type, id) {
    var wantType = String(type || '');
    var wantId = String(id || '');
    if (!wantType || !wantId) return [];
    var out = [];
    (docs || []).forEach(function (d) {
      if (!d || !d.id || d.body == null) return;
      if (wantType === 'doc' && String(d.id) === wantId) return;
      var re = /\[@[^\]]*\]\((task|doc|person):([^)\s:]+)(?::short)?\)/g;
      var m;
      var body = String(d.body);
      while ((m = re.exec(body))) {
        if (m[1] === wantType && m[2] === wantId) {
          out.push({ id: d.id, title: d.title || 'Sans titre' });
          break;
        }
      }
    });
    return out;
  }

  function ageDays(since, today) {
    var a = Date.parse(String(since || '').slice(0, 10) + 'T00:00:00');
    var b = Date.parse(String(today || '').slice(0, 10) + 'T00:00:00');
    if (!isFinite(a) || !isFinite(b)) return 0;
    return Math.round((b - a) / 86400000);
  }

  function fold(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function num(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  /**
   * One row per Mindmap project: outcome (the objective above it), the next step
   * of its open tasks, work progress (mean of task progress) and the Goals metric
   * whose objectif has the same name.
   */
  /** Parent links of the goal map. A task is an id that is not itself a node. */
  function indexGoals(goals) {
    var nodes = (goals && goals.nodes) || [];
    var links = (goals && goals.links) || [];
    var byId = Object.create(null);
    nodes.forEach(function (n) {
      if (n && n.id) byId[n.id] = n;
    });
    function rankOf(id) {
      var n = byId[id];
      if (!n || RANK[n.level] == null) return 5;
      return RANK[n.level];
    }
    var parent = Object.create(null);
    links.forEach(function (l) {
      if (!l || !l.from || !l.to || l.from === l.to) return;
      var rf = rankOf(l.from);
      var rt = rankOf(l.to);
      if (rf === rt) return;
      if (rf > rt) parent[l.from] = l.to;
      else parent[l.to] = l.from;
    });
    function chain(id) {
      var out = [];
      var seen = Object.create(null);
      var cur = parent[id];
      while (cur && !seen[cur]) {
        seen[cur] = true;
        if (byId[cur]) out.push(byId[cur]);
        cur = parent[cur];
      }
      return out;
    }
    return { byId: byId, parent: parent, chain: chain };
  }

  function placeOf(nodes) {
    var place = { project: '', objective: '', goal: '' };
    var i;
    for (i = 0; i < (nodes || []).length; i++) {
      var n = nodes[i];
      if (!n) continue;
      if (n.level === 'project' && !place.project) place.project = n.name || '';
      else if (n.level === 'objective' && !place.objective) place.objective = n.name || '';
      else if (n.level === 'goal' && !place.goal) place.goal = n.name || '';
    }
    return place;
  }

  /** cardId → { project, objective, goal } for tasks linked into the goal map. */
  function places(goals) {
    var g = indexGoals(goals);
    var out = Object.create(null);
    Object.keys(g.parent).forEach(function (id) {
      if (g.byId[id]) return;
      var place = placeOf(g.chain(id));
      if (place.project || place.objective || place.goal) out[id] = place;
    });
    return out;
  }

  /** "Projet · Objectif", or the goal when the project has no objective. */
  function placeLabel(place) {
    if (!place) return '';
    var parts = [];
    if (place.project) parts.push(place.project);
    if (place.objective) parts.push(place.objective);
    else if (place.goal) parts.push(place.goal);
    return parts.join(' · ');
  }

  function projectChain(goals, rows, metrics, objectifs) {
    var indexed = indexGoals(goals);
    var byId = indexed.byId;
    var parent = indexed.parent;
    function chain(id) { return indexed.chain(id); }
    var byRow = Object.create(null);
    (rows || []).forEach(function (r) {
      if (r && r.id) byRow[r.id] = r;
    });
    var metricByGoal = Object.create(null);
    (metrics || []).forEach(function (m) {
      if (!m || !m.linkedGoalId) return;
      if (!metricByGoal[m.linkedGoalId] || m.isPrimary) metricByGoal[m.linkedGoalId] = m;
    });
    var objectifByName = Object.create(null);
    (objectifs || []).forEach(function (o) {
      if (o && o.name && o.id) objectifByName[fold(o.name)] = o;
    });
    var usesMetrics = (metrics || []).some(function (m) { return m && m.linkedGoalId; });
    var nodes = (goals && goals.nodes) || [];

    return nodes
      .filter(function (n) { return n && n.level === 'project'; })
      .map(function (p) {
        var above = chain(p.id);
        var objective = null;
        var i;
        for (i = 0; i < above.length; i++) {
          if (above[i].level === 'objective') { objective = above[i]; break; }
        }
        var taskIds = [];
        Object.keys(parent).forEach(function (id) {
          if (byId[id]) return;
          var c = chain(id);
          for (var k = 0; k < c.length; k++) {
            if (c[k].id === p.id) { taskIds.push(id); break; }
          }
        });
        var tasks = taskIds.map(function (id) { return byRow[id]; }).filter(Boolean);
        var open = tasks.filter(isOpen).sort(byPriority);
        var step = null;
        for (i = 0; i < open.length; i++) {
          var st = stepState(open[i]);
          if (st && st.text) {
            step = { text: st.text, cardId: open[i].id, cardName: open[i].name, missing: false };
            break;
          }
          if (st && st.missing) continue;
          step = { text: open[i].name, cardId: open[i].id, cardName: open[i].name, missing: false };
          break;
        }
        if (!step) step = { text: '', cardId: '', cardName: '', missing: true };
        var progresses = [];
        tasks.forEach(function (t) {
          if (typeof t.progress === 'number') progresses.push(t.progress);
        });
        var work = progresses.length
          ? Math.round(progresses.reduce(function (a, b) { return a + b; }, 0) / progresses.length)
          : null;
        var metric = null;
        if (objective) {
          var ob = objectifByName[fold(objective.name)];
          if (ob) metric = metricByGoal[ob.id] || null;
        }
        var outcomePct = null;
        var metricLabel = '';
        if (metric) {
          var cur = num(metric.currentValue);
          if (cur == null) cur = 0;
          var target = num(metric.target);
          metricLabel = target == null ? String(cur) : cur + ' / ' + target;
          if (target != null && metric.direction === 'decrease') {
            outcomePct = cur === 0 ? 0 : Math.max(0, Math.min(100, Math.round((target / cur) * 100)));
          } else if (target) {
            outcomePct = Math.max(0, Math.min(100, Math.round((cur / target) * 100)));
          }
        }
        return {
          id: p.id,
          name: p.name,
          outcome: objective ? objective.name : '',
          missingOutcome: !objective,
          step: step,
          missingStep: !!step.missing,
          work: work,
          outcomePct: outcomePct,
          metricLabel: metricLabel,
          metricId: metric ? metric.id : '',
          metricUpdated: metric && metric.updatedAt ? String(metric.updatedAt).slice(0, 10) : '',
          metricValue: metric ? (num(metric.currentValue) == null ? 0 : num(metric.currentValue)) : null,
          missingMeasure: !!(objective && usesMetrics && !metric),
          openCount: open.length,
        };
      });
  }

  function startedRows(rows) {
    return (rows || []).filter(function (r) { return isOpen(r) && r.statutKey === 'started'; }).sort(byPriority);
  }

  /** { count, cap, over, park } — park is the lowest-priority card in En cours. */
  function wip(rows, cap) {
    var limit = cap > 0 ? cap : DEFAULT_WIP;
    var started = startedRows(rows);
    return {
      count: started.length,
      cap: limit,
      over: started.length > limit,
      park: started.length ? started[started.length - 1] : null,
    };
  }

  /**
   * Flags for the revue. projects is the result of projectChain.
   * { flags:[{id,label,detail}], steps, waiting, wip, projects }
   */
  function review(rows, opts) {
    opts = opts || {};
    var today = opts.today || '';
    var cap = opts.wipCap > 0 ? opts.wipCap : DEFAULT_WIP;
    var waitDays = opts.waitingDays > 0 ? opts.waitingDays : WAITING_DAYS;
    var list = rows || [];
    var projects = opts.projects || [];
    var flags = [];
    var triage = list.filter(function (r) { return r.statutKey === 'triage'; });
    if (triage.length) flags.push({ id: 'triage', label: 'Triage', detail: String(triage.length) });
    var steps = list.filter(function (r) {
      var s = stepState(r);
      return s && s.missing;
    });
    if (steps.length) flags.push({ id: 'step', label: 'Sans prochaine action', detail: String(steps.length) });
    var waiting = list.filter(function (r) {
      return isOpen(r) && r.waiting && ageDays(r.waitingSince, today) >= waitDays;
    });
    if (waiting.length) flags.push({ id: 'waiting', label: 'En attente', detail: String(waiting.length) });
    var load = wip(list, cap);
    if (load.over) flags.push({ id: 'wip', label: 'En cours', detail: load.count + ' / ' + load.cap });
    var noOutcome = projects.filter(function (p) { return p.missingOutcome; });
    if (noOutcome.length) flags.push({ id: 'outcome', label: 'Sans résultat', detail: String(noOutcome.length) });
    var noStep = projects.filter(function (p) { return p.missingStep; });
    if (noStep.length) flags.push({ id: 'project-step', label: 'Projet sans action', detail: String(noStep.length) });
    var noMeasure = projects.filter(function (p) { return p.missingMeasure; });
    if (noMeasure.length) flags.push({ id: 'measure', label: 'Sans mesure', detail: String(noMeasure.length) });
    var staleLimit = opts.staleDays > 0 ? opts.staleDays : STALE_DAYS;
    projects.forEach(function (p) {
      if (!p) return;
      var quiet = !!(p.metricLabel && (!p.metricUpdated || (today && ageDays(p.metricUpdated, today) >= staleLimit)));
      p.staleOutcome = quiet;
    });
    var stale = projects.filter(function (p) { return p.staleOutcome; });
    if (stale.length) flags.push({ id: 'stale', label: 'Résultat immobile', detail: String(stale.length) });
    return { flags: flags, steps: steps, waiting: waiting, wip: load, projects: projects };
  }

  /** True when the revue was never opened, or last opened at least `days` ago. */
  function reviewDue(lastIso, today, days) {
    var limit = days > 0 ? days : REVIEW_DAYS;
    if (!today) return false;
    if (!lastIso) return true;
    return ageDays(lastIso, today) >= limit;
  }

  global.WorkOS = {
    DEFAULT_WIP: DEFAULT_WIP,
    WAITING_DAYS: WAITING_DAYS,
    STALE_DAYS: STALE_DAYS,
    REVIEW_DAYS: REVIEW_DAYS,
    isOpen: isOpen,
    firstOpenStep: firstOpenStep,
    stepState: stepState,
    dateKind: dateKind,
    ageDays: ageDays,
    backlinks: backlinks,
    projectChain: projectChain,
    places: places,
    placeLabel: placeLabel,
    wip: wip,
    review: review,
    reviewDue: reviewDue,
  };
})(typeof window !== 'undefined' ? window : this);
