/*
 * Role: pure graph and next-action queue for the Journey view.
 * Reads board card records (the shape GanttTrello.loadBoard returns) and the
 * Mindmap goals card ({ nodes, links }). No storage of its own.
 *
 *   JourneyModel.prepare(records, goals) -> graph
 *   JourneyModel.nextActions(graph, { now, limit }) -> { now, blocked }
 *   JourneyModel.layout(graph, { zoom, focus, hideDone, query, now, hereId })
 *   JourneyModel.chain(graph, id) -> ancestors, top first
 *   JourneyModel.linksOf(graph, id) -> { prereqs, next, parents, subs }
 *
 * A "serves" link is contribution (task → project → … → vision).
 * dependsOn + depTypes is the only task sequence: needs (and an untyped
 * dependency) block; after is a sequence; parts is composition.
 * Nothing here invents a route the data does not have.
 */
(function (global) {
  'use strict';

  var LEVELS = [
    { id: 'vision', label: 'Vision', icon: 'eye', rank: 0 },
    { id: 'mission', label: 'Mission', icon: 'flag-3', rank: 1 },
    { id: 'goal', label: 'But', icon: 'target-arrow', rank: 2 },
    { id: 'objective', label: 'Objectif', icon: 'ruler', rank: 3 },
    { id: 'project', label: 'Projet', icon: 'stack-2', rank: 4 },
  ];
  var ALIAS = { work: 'project' };
  var TASK_RANK = LEVELS.length;
  var CAP = 80;
  var ORPHAN = 'jy:orphan';
  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var NODE_W = 208;
  var NODE_H = 56;
  var STEP_X = 248;
  var PAD = 28;

  function levelById(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
    return null;
  }

  function rankOfLevel(level) {
    var lv = levelById(level);
    return lv ? lv.rank : -1;
  }

  function fold(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function parseDay(value) {
    if (value == null || value === '') return null;
    if (Object.prototype.toString.call(value) === '[object Date]') {
      if (isNaN(value.getTime())) return null;
      return { y: value.getFullYear(), m: value.getMonth(), d: value.getDate() };
    }
    var text = String(value);
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (m) return { y: +m[1], m: +m[2] - 1, d: +m[3] };
    var t = Date.parse(text);
    if (isNaN(t)) return null;
    var dt = new Date(t);
    return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
  }

  function dayKey(day) {
    return day.y * 10000 + (day.m + 1) * 100 + day.d;
  }

  function asDate(now) {
    if (Object.prototype.toString.call(now) === '[object Date]') return now;
    if (typeof now === 'number') return new Date(now);
    return new Date();
  }

  function formatDay(day, now) {
    var label = day.d + ' ' + MONTHS[day.m];
    var y = asDate(now).getFullYear();
    if (day.y !== y) label += ' ' + day.y;
    return label;
  }

  function formatMinutes(mins) {
    if (typeof mins !== 'number' || !(mins > 0)) return '';
    var m = Math.round(mins);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    var r = m % 60;
    return r ? h + ' h ' + r : h + ' h';
  }

  function isClosed(rec) {
    if (!rec) return false;
    if (rec.category === 'completed' || rec.category === 'canceled') return true;
    if (typeof rec.progress === 'number' && rec.progress >= 100) return true;
    if (rec.dueComplete) return true;
    return false;
  }

  function depKind(types, id) {
    var t = types && types[id];
    if (t === 'needs' || t === 'after' || t === 'parts') return t;
    return 'needs';
  }

  function normalizeGoals(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var nodes = [];
    var ids = Object.create(null);
    (Array.isArray(src.nodes) ? src.nodes : []).forEach(function (n) {
      var name = n && typeof n.name === 'string' ? n.name.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
      var level = n && ALIAS[n.level] ? ALIAS[n.level] : n && n.level;
      if (!name || !n.id || ids[n.id] || !levelById(level)) return;
      ids[String(n.id)] = true;
      nodes.push({ id: String(n.id), level: level, name: name });
    });
    var links = [];
    var seen = Object.create(null);
    (Array.isArray(src.links) ? src.links : []).forEach(function (l) {
      if (!l || l.from == null || l.to == null || String(l.from) === String(l.to)) return;
      var key = String(l.from) + '>' + String(l.to);
      if (seen[key]) return;
      seen[key] = true;
      links.push({ from: String(l.from), to: String(l.to) });
    });
    return { nodes: nodes, links: links };
  }

  function prepare(records, goals) {
    var list = Array.isArray(records) ? records : [];
    var cardIds = Object.create(null);
    var cards = [];
    list.forEach(function (rec) {
      if (!rec || rec.id == null || cardIds[String(rec.id)]) return;
      cardIds[String(rec.id)] = true;
      cards.push(rec);
    });

    var goalData = normalizeGoals(goals);
    var goalLevel = Object.create(null);
    var nodes = [];
    var byId = Object.create(null);

    function addNode(node) {
      if (byId[node.id]) return byId[node.id];
      byId[node.id] = node;
      nodes.push(node);
      return node;
    }

    goalData.nodes.forEach(function (g) {
      goalLevel[g.id] = g.level;
      addNode({ id: g.id, kind: 'goal', level: g.level, name: g.name, rec: null, checks: [] });
    });

    cards.forEach(function (rec) {
      var checks = [];
      (Array.isArray(rec.items) ? rec.items : []).forEach(function (item) {
        if (!item || typeof item.text !== 'string' || !item.text.trim()) return;
        checks.push({
          text: item.text.replace(/\s+/g, ' ').trim().slice(0, 160),
          done: !!(item.done || (typeof item.progress === 'number' && item.progress >= 100)),
          linkedId: item.linkedCardId ? String(item.linkedCardId) : '',
        });
      });
      addNode({
        id: String(rec.id),
        kind: 'task',
        level: 'task',
        name: rec.name || '(sans titre)',
        rec: rec,
        checks: checks,
      });
    });

    function resolve(ref) {
      if (ref == null) return null;
      var s = String(ref);
      if (goalLevel[s]) return s;
      if (cardIds[s]) return s;
      if (s.indexOf('t:') === 0 && cardIds[s.slice(2)]) return s.slice(2);
      return null;
    }

    function rankOf(id) {
      if (cardIds[id]) return TASK_RANK;
      if (goalLevel[id]) return rankOfLevel(goalLevel[id]);
      return -1;
    }

    var edges = [];
    var edgeSeen = Object.create(null);
    var parent = Object.create(null);
    var parents = Object.create(null);
    var children = Object.create(null);

    function addEdge(edge) {
      if (edgeSeen[edge.id] || !byId[edge.from] || !byId[edge.to]) return;
      edgeSeen[edge.id] = true;
      edges.push(edge);
    }

    goalData.links.forEach(function (l) {
      var from = resolve(l.from);
      var to = resolve(l.to);
      if (!from || !to || from === to) return;
      var rf = rankOf(from);
      var rt = rankOf(to);
      if (!(rf > rt && rt >= 0)) return;
      var cross = !!parent[from];
      if (!parent[from]) parent[from] = to;
      if (!parents[from]) parents[from] = [];
      parents[from].push(to);
      if (!children[to]) children[to] = [];
      children[to].push(from);
      addEdge({ id: 'serves:' + from + '>' + to, kind: 'serves', dep: null, from: from, to: to, cross: cross });
    });

    cards.forEach(function (rec) {
      var from = String(rec.id);
      var deps = (rec.inputs && rec.inputs.dependsOn) || [];
      var types = (rec.inputs && rec.inputs.depTypes) || {};
      deps.forEach(function (d) {
        var to = resolve(d);
        if (!to || to === from || !cardIds[to]) return;
        addEdge({
          id: 'depends:' + from + '>' + to,
          kind: 'depends',
          dep: depKind(types, d),
          from: from,
          to: to,
          cross: false,
        });
      });
      (Array.isArray(rec.items) ? rec.items : []).forEach(function (item) {
        if (!item || !item.linkedCardId) return;
        var to = resolve(item.linkedCardId);
        if (!to || to === from || !cardIds[to]) return;
        addEdge({ id: 'sub:' + from + '>' + to, kind: 'sub', dep: null, from: from, to: to, cross: false });
      });
    });

    var state = Object.create(null);
    var blocker = Object.create(null);
    var openAfter = Object.create(null);
    var unblocks = Object.create(null);

    function recOf(id) {
      var n = byId[id];
      return n && n.rec;
    }

    cards.forEach(function (rec) {
      unblocks[String(rec.id)] = 0;
    });

    function firstOpen(rec, kinds) {
      var deps = (rec.inputs && rec.inputs.dependsOn) || [];
      var types = (rec.inputs && rec.inputs.depTypes) || {};
      for (var i = 0; i < deps.length; i++) {
        var kind = depKind(types, deps[i]);
        if (kinds.indexOf(kind) < 0) continue;
        var to = resolve(deps[i]);
        if (!to || !cardIds[to]) continue;
        var other = recOf(to);
        if (other && !isClosed(other)) {
          return { id: to, name: other.name || '(sans titre)' };
        }
      }
      return null;
    }

    cards.forEach(function (rec) {
      var id = String(rec.id);
      var gate = firstOpen(rec, ['needs']);
      if (isClosed(rec)) state[id] = 'done';
      else if (rec.blocked) state[id] = 'blocked';
      else if (gate) state[id] = 'waiting';
      else state[id] = 'ready';
      blocker[id] = gate;
      openAfter[id] = firstOpen(rec, ['after']);
      if (state[id] === 'done') return;
      var deps = (rec.inputs && rec.inputs.dependsOn) || [];
      var types = (rec.inputs && rec.inputs.depTypes) || {};
      var counted = Object.create(null);
      deps.forEach(function (d) {
        if (depKind(types, d) !== 'needs') return;
        var to = resolve(d);
        if (!to || counted[to] || unblocks[to] == null) return;
        counted[to] = true;
        unblocks[to] += 1;
      });
    });

    return {
      nodes: nodes,
      edges: edges,
      byId: byId,
      parent: parent,
      parents: parents,
      children: children,
      state: state,
      blocker: blocker,
      openAfter: openAfter,
      unblocks: unblocks,
    };
  }

  function walkUp(graph, id, includeSelf) {
    var out = [];
    var seen = Object.create(null);
    var start = graph.byId[id];
    if (includeSelf && start && start.kind !== 'task') {
      out.push(start);
      seen[id] = true;
    }
    var cur = graph.parent[id];
    while (cur && !seen[cur] && graph.byId[cur]) {
      seen[cur] = true;
      out.push(graph.byId[cur]);
      cur = graph.parent[cur];
    }
    return out;
  }

  function chain(graph, id) {
    return walkUp(graph, id, true)
      .slice()
      .reverse()
      .map(function (n) {
        return { id: n.id, name: n.name, level: n.level };
      });
  }

  function named(graph, id) {
    var n = graph.byId[id];
    return n ? { id: n.id, name: n.name, level: n.level, state: graph.state[id] || '' } : null;
  }

  function linksOf(graph, id) {
    var prereqs = [];
    var next = [];
    var subs = [];
    (graph.edges || []).forEach(function (e) {
      if (e.kind === 'depends' && e.from === id) {
        var p = named(graph, e.to);
        if (p) prereqs.push(Object.assign({ dep: e.dep }, p));
      } else if (e.kind === 'depends' && e.to === id) {
        var n = named(graph, e.from);
        if (n) next.push(Object.assign({ dep: e.dep }, n));
      } else if (e.kind === 'sub' && (e.from === id || e.to === id)) {
        var other = e.from === id ? e.to : e.from;
        var s = named(graph, other);
        if (s) subs.push(s);
      }
    });
    var parents = ((graph.parents && graph.parents[id]) || []).map(function (pid) {
      return named(graph, pid);
    }).filter(Boolean);
    return { prereqs: prereqs, next: next, parents: parents, subs: subs };
  }

  function tasksUnder(graph, id) {
    var out = [];
    var seen = Object.create(null);
    function walk(cur) {
      ((graph.children && graph.children[cur]) || []).forEach(function (cid) {
        if (seen[cid]) return;
        seen[cid] = true;
        var n = graph.byId[cid];
        if (!n) return;
        if (n.kind === 'task') out.push(cid);
        else walk(cid);
      });
    }
    walk(id);
    return out;
  }

  function projectIdOf(graph, id) {
    var cur = graph.parent[id];
    var seen = Object.create(null);
    while (cur && !seen[cur]) {
      seen[cur] = true;
      var n = graph.byId[cur];
      if (n && n.level === 'project') return cur;
      cur = graph.parent[cur];
    }
    return null;
  }

  function missionIdOf(graph, id) {
    var cur = graph.parent[id];
    var seen = Object.create(null);
    while (cur && !seen[cur]) {
      seen[cur] = true;
      var n = graph.byId[cur];
      if (n && n.level === 'mission') return cur;
      cur = graph.parent[cur];
    }
    return null;
  }

  function dueInfo(rec, now) {
    var day = parseDay(rec && (rec.dueDate || rec.due));
    if (!day) return { band: 4, delta: 0, reason: '', label: '', state: '' };
    var delta = dayKey(day) - dayKey(parseDay(asDate(now)));
    var label = formatDay(day, now);
    if (delta < 0) return { band: 0, delta: delta, reason: 'En retard', label: label, state: 'overdue' };
    if (delta === 0) return { band: 1, delta: 0, reason: "Aujourd'hui", label: label, state: 'today' };
    if (delta === 1) return { band: 2, delta: 1, reason: 'Demain', label: label, state: 'soon' };
    if (delta <= 14) return { band: 2, delta: delta, reason: 'Dans ' + delta + ' jours', label: label, state: 'soon' };
    return { band: 3, delta: delta, reason: '', label: label, state: 'later' };
  }

  function unblockText(n) {
    if (n === 1) return 'Débloque 1 tâche';
    if (n > 1) return 'Débloque ' + n + ' tâches';
    return '';
  }

  function assigneeNames(rec) {
    var out = [];
    (rec && rec.assignees ? rec.assignees : []).forEach(function (a) {
      var name = a && (a.name || a.fullName);
      if (name) out.push(String(name));
    });
    return out;
  }

  function actionOf(graph, id, now) {
    var node = graph.byId[id];
    var rec = node && node.rec;
    if (!node || !rec) return null;
    var due = dueInfo(rec, now);
    var proj = projectIdOf(graph, id);
    var miss = missionIdOf(graph, id);
    var effort = formatMinutes(rec.estimatedMinutes);
    var also = ((graph.parents && graph.parents[id]) || []).filter(function (pid) {
      return pid !== graph.parent[id];
    }).map(function (pid) {
      return named(graph, pid);
    }).filter(Boolean);
    return {
      id: id,
      name: node.name,
      state: graph.state[id] || 'ready',
      projectId: proj || '',
      projectName: proj && graph.byId[proj] ? graph.byId[proj].name : '',
      missionId: miss || '',
      missionName: miss && graph.byId[miss] ? graph.byId[miss].name : '',
      also: also,
      reasons: [],
      dueLabel: due.label,
      dueState: due.state,
      dueBand: due.band,
      dueDelta: due.delta,
      dueReason: due.reason,
      effortLabel: effort,
      unblocks: graph.unblocks[id] || 0,
      sequence: graph.openAfter[id] ? 1 : 0,
      afterName: graph.openAfter[id] ? graph.openAfter[id].name : '',
      blockerId: graph.blocker[id] ? graph.blocker[id].id : '',
      blockerName: graph.blocker[id] ? graph.blocker[id].name : '',
      score: typeof rec.priorityScore === 'number' ? rec.priorityScore : null,
      minutes: typeof rec.estimatedMinutes === 'number' && rec.estimatedMinutes > 0 ? rec.estimatedMinutes : null,
      assignees: assigneeNames(rec),
    };
  }

  function byRank(a, b) {
    if (a.dueBand !== b.dueBand) return a.dueBand - b.dueBand;
    if (a.dueDelta !== b.dueDelta) return a.dueDelta - b.dueDelta;
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    if (a.unblocks !== b.unblocks) return b.unblocks - a.unblocks;
    var as = a.score == null ? -Infinity : a.score;
    var bs = b.score == null ? -Infinity : b.score;
    if (as !== bs) return bs - as;
    var am = a.minutes == null ? Infinity : a.minutes;
    var bm = b.minutes == null ? Infinity : b.minutes;
    if (am !== bm) return am - bm;
    return a.name.localeCompare(b.name, 'fr');
  }

  function fillReasons(item, extra) {
    var parts = [];
    if (item.state === 'waiting' && item.blockerName) parts.push('En attente de ' + item.blockerName);
    else if (item.state === 'blocked') parts.push(item.blockerName ? 'En attente de ' + item.blockerName : 'Marquée bloquée');
    else if (item.dueReason) parts.push(item.dueReason);
    var unlocks = unblockText(item.unblocks);
    if (unlocks) parts.push(unlocks);
    if (item.state === 'ready' && item.effortLabel) parts.push('Environ ' + item.effortLabel);
    if (item.state === 'ready' && item.afterName) parts.push('Vient après ' + item.afterName);
    if (extra) parts.push(extra);
    var out = [];
    parts.forEach(function (p) {
      if (p && out.length < 2 && out.indexOf(p) < 0) out.push(p);
    });
    item.reasons = out;
  }

  function nextActions(graph, opts) {
    opts = opts || {};
    var now = asDate(opts.now);
    var limit = opts.limit == null ? 5 : opts.limit;
    var blockedLimit = opts.blockedLimit == null ? 3 : opts.blockedLimit;
    var ready = [];
    var held = [];
    if (!graph || !graph.nodes) return { now: [], blocked: [] };
    graph.nodes.forEach(function (n) {
      if (n.kind !== 'task') return;
      var st = graph.state[n.id];
      if (st === 'done') return;
      var item = actionOf(graph, n.id, now);
      if (!item) return;
      if (st === 'ready') ready.push(item);
      else held.push(item);
    });
    ready.sort(byRank);
    var seenProject = Object.create(null);
    ready.forEach(function (item) {
      var extra = '';
      if (item.projectId && !seenProject[item.projectId]) {
        seenProject[item.projectId] = true;
        extra = 'Prochaine étape de ' + item.projectName;
      }
      fillReasons(item, extra);
    });
    held.sort(function (a, b) {
      if (a.unblocks !== b.unblocks) return b.unblocks - a.unblocks;
      return byRank(a, b);
    });
    held.forEach(function (item) {
      fillReasons(item, '');
    });
    return { now: ready.slice(0, limit), blocked: held.slice(0, blockedLimit) };
  }

  function summarize(graph, id) {
    var counts = { open: 0, done: 0, blocked: 0, waiting: 0 };
    var ids = id === ORPHAN
      ? graph.nodes.filter(function (n) { return n.kind === 'task' && !graph.parent[n.id]; }).map(function (n) { return n.id; })
      : tasksUnder(graph, id);
    ids.forEach(function (tid) {
      var st = graph.state[tid] || 'ready';
      if (st === 'done') counts.done += 1;
      else if (st === 'blocked') counts.blocked += 1;
      else if (st === 'waiting') counts.waiting += 1;
      else counts.open += 1;
    });
    return counts;
  }

  function goalState(counts) {
    if (counts.blocked) return 'blocked';
    if (!counts.open && counts.waiting) return 'waiting';
    if (!counts.open && !counts.waiting && !counts.blocked && counts.done) return 'done';
    return 'ready';
  }

  function layout(graph, opts) {
    opts = opts || {};
    var empty = { zoom: opts.zoom || 'overview', focus: opts.focus || null, nodes: [], edges: [], width: 0, height: 0, truncated: 0 };
    if (!graph || !graph.nodes) return empty;
    var zoom = opts.zoom || 'overview';
    var focus = opts.focus || null;
    var hideDone = opts.hideDone !== false;
    var query = fold(opts.query || '');
    var cap = opts.cap == null ? CAP : opts.cap;
    var show = Object.create(null);

    function hiddenDone(id) {
      var n = graph.byId[id];
      return !!(hideDone && n && n.kind === 'task' && graph.state[id] === 'done');
    }

    function reveal(id) {
      var seen = Object.create(null);
      var cur = id;
      while (cur && !seen[cur] && graph.byId[cur]) {
        seen[cur] = true;
        if (!hiddenDone(cur)) show[cur] = true;
        cur = graph.parent[cur];
      }
    }

    if (query) {
      graph.nodes.forEach(function (n) {
        if (fold(n.name).indexOf(query) >= 0) reveal(n.id);
      });
    } else if (zoom === 'overview') {
      graph.nodes.forEach(function (n) {
        if (n.kind !== 'task') show[n.id] = true;
      });
    } else if (zoom === 'task' && focus && graph.byId[focus] && graph.byId[focus].kind === 'task') {
      reveal(focus);
      graph.edges.forEach(function (e) {
        if (e.kind !== 'depends' && e.kind !== 'sub') return;
        if (e.from === focus) reveal(e.to);
        if (e.to === focus) reveal(e.from);
      });
      var proj = projectIdOf(graph, focus);
      if (proj) {
        var under = tasksUnder(graph, proj).filter(function (id) { return !hiddenDone(id); });
        if (under.length <= 12) under.forEach(reveal);
      }
    } else if (focus && graph.byId[focus]) {
      var root = focus;
      if (graph.byId[root].kind === 'task') root = projectIdOf(graph, root) || graph.parent[root] || root;
      reveal(root);
      if (graph.byId[root] && graph.byId[root].kind !== 'task') {
        tasksUnder(graph, root).forEach(function (id) {
          if (!hiddenDone(id)) show[id] = true;
        });
        var seenG = Object.create(null);
        function goalsDown(id) {
          if (seenG[id]) return;
          seenG[id] = true;
          show[id] = true;
          ((graph.children && graph.children[id]) || []).forEach(function (cid) {
            var n = graph.byId[cid];
            if (n && n.kind !== 'task') goalsDown(cid);
          });
        }
        goalsDown(root);
      }
    } else {
      graph.nodes.forEach(function (n) {
        if (n.kind !== 'task') show[n.id] = true;
        else if (!hiddenDone(n.id)) show[n.id] = true;
      });
    }

    var taskIds = Object.keys(show).filter(function (id) {
      return graph.byId[id] && graph.byId[id].kind === 'task';
    });
    var truncated = 0;
    if (cap >= 0 && taskIds.length > cap) {
      var ranked = taskIds.map(function (id) {
        return actionOf(graph, id, asDate(opts.now));
      }).filter(Boolean);
      ranked.sort(byRank);
      var keep = Object.create(null);
      ranked.slice(0, cap).forEach(function (item) { keep[item.id] = true; });
      if (query) {
        graph.nodes.forEach(function (n) {
          if (n.kind === 'task' && fold(n.name).indexOf(query) >= 0) keep[n.id] = true;
        });
      }
      if (focus && graph.byId[focus] && graph.byId[focus].kind === 'task') keep[focus] = true;
      taskIds.forEach(function (id) {
        if (!keep[id]) {
          delete show[id];
          truncated += 1;
        }
      });
    }

    var orphans = Object.keys(show).filter(function (id) {
      var n = graph.byId[id];
      return n && n.kind === 'task' && !graph.parent[id];
    });
    var orphanLandmark = orphans.length > 0;
    if (!orphanLandmark && !query && zoom === 'overview') {
      graph.nodes.forEach(function (n) {
        if (n.kind === 'task' && !graph.parent[n.id] && !hiddenDone(n.id)) orphanLandmark = true;
      });
    }

    var treeParent = Object.create(null);
    Object.keys(graph.parent).forEach(function (k) { treeParent[k] = graph.parent[k]; });
    var laid = [];
    Object.keys(show).forEach(function (id) {
      var n = graph.byId[id];
      if (!n) return;
      var counts = n.kind === 'task' ? null : summarize(graph, id);
      laid.push({
        id: n.id,
        kind: n.kind,
        level: n.level,
        name: n.name,
        rec: n.rec,
        checks: n.checks || [],
        state: n.kind === 'task' ? (graph.state[id] || 'ready') : goalState(counts),
        counts: counts,
        here: opts.hereId != null && String(opts.hereId) === id,
      });
    });

    if (orphanLandmark) {
      orphans.forEach(function (id) { treeParent[id] = ORPHAN; });
      laid.push({
        id: ORPHAN,
        kind: 'bucket',
        level: 'project',
        name: 'Sans projet',
        rec: null,
        checks: [],
        state: goalState(summarize(graph, ORPHAN)),
        counts: summarize(graph, ORPHAN),
        here: false,
      });
    }

    var depth = Object.create(null);
    var depOf = Object.create(null);
    laid.forEach(function (n) {
      if (n.kind === 'task') depOf[n.id] = [];
    });
    graph.edges.forEach(function (e) {
      if (e.kind !== 'depends' || e.dep === 'parts') return;
      if (depOf[e.from] && depOf[e.to]) depOf[e.from].push(e.to);
    });
    function depthOf(id, stack) {
      if (depth[id] != null) return depth[id];
      if (stack[id] || !depOf[id]) return 0;
      stack[id] = 1;
      var max = 0;
      depOf[id].forEach(function (p) {
        max = Math.max(max, 1 + depthOf(p, stack));
      });
      delete stack[id];
      depth[id] = max;
      return max;
    }
    laid.forEach(function (n) {
      if (n.kind === 'task') depthOf(n.id, Object.create(null));
    });

    var present = Object.create(null);
    graph.nodes.forEach(function (n) {
      if (n.kind === 'goal') present[rankOfLevel(n.level)] = true;
    });
    laid.forEach(function (n) {
      if (n.kind === 'bucket') present[4] = true;
    });
    var rankOrder = Object.keys(present).map(function (k) { return +k; }).sort(function (a, b) { return a - b; });
    var compact = Object.create(null);
    rankOrder.forEach(function (rank, i) { compact[rank] = i; });
    var taskCol0 = rankOrder.length;

    var byCol = Object.create(null);
    laid.forEach(function (n) {
      var col = n.kind === 'task'
        ? taskCol0 + (depth[n.id] || 0)
        : compact[n.kind === 'bucket' ? 4 : rankOfLevel(n.level)];
      if (col == null) col = 0;
      n.col = col;
      n.w = NODE_W;
      n.h = NODE_H;
      if (!byCol[col]) byCol[col] = [];
      byCol[col].push(n);
    });

    var index = Object.create(null);
    laid.forEach(function (n) { index[n.id] = n; });
    var localChildren = Object.create(null);
    laid.forEach(function (n) { localChildren[n.id] = []; });
    laid.forEach(function (n) {
      var p = treeParent[n.id];
      if (p && localChildren[p]) localChildren[p].push(n.id);
    });
    function childSort(a, b) {
      var da = depth[a] || 0;
      var db = depth[b] || 0;
      if (da !== db) return da - db;
      return index[a].name.localeCompare(index[b].name, 'fr');
    }
    var ideal = Object.create(null);
    var cursor = 0;
    function walk(id, stack) {
      if (stack[id]) return ideal[id] || 0;
      stack[id] = 1;
      var kids = (localChildren[id] || []).slice().sort(childSort);
      if (!kids.length) ideal[id] = cursor++;
      else {
        var ys = kids.map(function (k) { return walk(k, stack); });
        ideal[id] = (ys[0] + ys[ys.length - 1]) / 2;
      }
      delete stack[id];
      return ideal[id];
    }
    laid.forEach(function (n) {
      var p = treeParent[n.id];
      if (!p || !index[p]) walk(n.id, Object.create(null));
    });
    laid.forEach(function (n) {
      if (ideal[n.id] == null) ideal[n.id] = cursor++;
    });

    var width = PAD;
    var height = PAD;
    Object.keys(byCol).forEach(function (key) {
      var list = byCol[key];
      list.sort(function (a, b) {
        if (ideal[a.id] !== ideal[b.id]) return ideal[a.id] - ideal[b.id];
        return a.name.localeCompare(b.name, 'fr');
      });
      var y = PAD;
      list.forEach(function (n) {
        var lines = Math.max(1, Math.ceil(String(n.name || '').length / 26));
        n.h = 28 + lines * 16 + 18;
        n.x = PAD + n.col * STEP_X;
        n.y = y;
        y += n.h + 16;
        width = Math.max(width, n.x + n.w + PAD);
        height = Math.max(height, n.y + n.h + PAD);
      });
    });

    var laidIds = Object.create(null);
    laid.forEach(function (n) { laidIds[n.id] = true; });
    var outEdges = graph.edges.filter(function (e) {
      return laidIds[e.from] && laidIds[e.to];
    }).map(function (e) {
      return { id: e.id, kind: e.kind, dep: e.dep, from: e.from, to: e.to, cross: !!e.cross };
    });
    orphans.forEach(function (id) {
      outEdges.push({ id: 'serves:' + id + '>' + ORPHAN, kind: 'serves', dep: null, from: id, to: ORPHAN, cross: false });
    });

    return {
      zoom: zoom,
      focus: focus,
      nodes: laid,
      edges: outEdges,
      width: width,
      height: height,
      truncated: truncated,
    };
  }

  /** Hierarchy rank of a graph node: goals by level (0 = vision), tasks last, -1 for anything else. */
  function rankOfNode(n) {
    if (!n) return -1;
    if (n.kind === 'task') return TASK_RANK;
    if (n.kind === 'goal') return rankOfLevel(n.level);
    return -1;
  }

  /**
   * True when making `from` depend on `to` would close a dependency loop (`to` already depends on `from`, directly
   * or not). A link whose id is `exceptId` is ignored, so moving one end of a link is judged without that link.
   */
  function wouldCycle(graph, from, to, exceptId) {
    if (from === to) return true;
    var adj = Object.create(null);
    ((graph && graph.edges) || []).forEach(function (e) {
      if (e.kind !== 'depends' || e.id === exceptId) return;
      (adj[e.from] = adj[e.from] || []).push(e.to);
    });
    var seen = Object.create(null);
    var todo = [to];
    while (todo.length) {
      var n = todo.pop();
      if (n === from) return true;
      if (seen[n]) continue;
      seen[n] = true;
      (adj[n] || []).forEach(function (m) { todo.push(m); });
    }
    return false;
  }

  global.JourneyModel = {
    rankOfNode: rankOfNode,
    wouldCycle: wouldCycle,
    LEVELS: LEVELS,
    CAP: CAP,
    ORPHAN_ID: ORPHAN,
    prepare: prepare,
    nextActions: nextActions,
    layout: layout,
    chain: chain,
    linksOf: linksOf,
    summarize: summarize,
    formatMinutes: formatMinutes,
    isClosed: isClosed,
  };
})(typeof window !== 'undefined' ? window : this);
