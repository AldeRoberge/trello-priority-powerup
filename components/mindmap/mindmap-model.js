/*
 * Role: pure graph model of the Mindmap view. No Trello / DOM, so it is unit-tested
 * (test/mindmap-model.test.js). Input: the records of GanttTrello.loadBoard. Output: nodes and edges.
 *
 *   Node kinds  task | person | place | goal (level vision | mission | goal | work, stored apart, see mindmap-goals-trello.js)
 *   Edge kinds  serves   smaller → bigger  "Contribue à"   (task → work → goal → mission → vision, any levels skipped)
 *               depends  task → task    "Dépend de"        (inputs.dependsOn: ids of the prerequisites)
 *               by       task → person  "Est fait par"     (assignees: Trello members + Hors Trello)
 *               at       task → place   "Est fait à"       (inputs.places.at)
 *               from / via / to         the stops of a trip (inputs.places.from / via[] / to)
 *
 * relationPhrase() reads an edge from the focused node and, for assignment and place links, from the
 * task's phase: planned ("Sera fait par"), in progress ("Est en train d'être fait par"), done ("Complété par").
 *
 * An edge always points from the task to the thing it needs. Dependencies on unknown (deleted or filtered
 * out) cards are dropped; cycles are kept but reported by findCycles().
 *
 * Groups are loose boundaries, not boxes. buildGroups() gathers nodes that share a vision, mission,
 * goal, objective, project, label / entity type, or a manual set. scene() decides what the current zoom
 * shows: far away a group is one chip, closer its members appear, and up close a task breaks into facet
 * nodes (progress, priority, status, pause, due). The lens is which of those meanings the flat map uses.
 *
 * orbit() is a temporary reading of the same graph: the focused node stays where it is, and each
 * direct relation takes a fixed side (above, right, lower right, below, lower left, left). A person,
 * a place, or a goal whose only neighbours are the work under it opens into a full ring. The next
 * relation sits just behind. Nothing is written back; the caller keeps the resting layout.
 */
(function (global) {
  'use strict';

  var EDGE_LABELS = {
    depends: 'Dépend de',
    by: 'Est fait par',
    at: 'Est fait à',
    from: 'Départ de',
    via: 'Passe par',
    to: 'Arrivée à',
  };
  // What a task → task link means ("depends" is the default; the others are stored in inputs.depTypes).
  var DEP_LABELS = {
    depends: 'Dépend de',
    needs: 'Nécessite',
    after: 'Vient après',
    parts: 'Est composée de',
  };
  var PLACE_EDGES =['at', 'from', 'via', 'to'];

  // Assignment and place verbs, [from the task, from the other end], by task phase.
  // The other card already shows the person's name, so the phrase stays the verb.
  var PHASE_VERBS = {
    by: {
      will: ['Sera fait par', 'Va faire'],
      doing: ['Est en train d\u2019\u00eatre fait par', 'Est en train de faire'],
      done: ['Compl\u00e9t\u00e9 par', 'A compl\u00e9t\u00e9'],
      canceled: ['Ne sera pas fait par', 'Ne fera pas'],
    },
    at: {
      will: ['Sera fait \u00e0', 'Accueillera'],
      doing: ['Est en train d\u2019\u00eatre fait \u00e0', 'Accueille'],
      done: ['Compl\u00e9t\u00e9 \u00e0', 'A accueilli'],
      canceled: ['Ne sera pas fait \u00e0', 'N\u2019accueillera pas'],
    },
    from: {
      will: ['Partira de', 'Sera le d\u00e9part'],
      doing: ['Part de', 'Est le d\u00e9part'],
      done: ['Est parti de', 'A \u00e9t\u00e9 le d\u00e9part'],
      canceled: ['Ne partira pas de', 'Ne sera pas le d\u00e9part'],
    },
    via: {
      will: ['Passera par', 'Sera une \u00e9tape'],
      doing: ['Passe par', 'Est une \u00e9tape'],
      done: ['Est pass\u00e9 par', 'A \u00e9t\u00e9 une \u00e9tape'],
      canceled: ['Ne passera pas par', 'Ne sera pas une \u00e9tape'],
    },
    to: {
      will: ['Arrivera \u00e0', 'Sera l\u2019arriv\u00e9e'],
      doing: ['Arrive \u00e0', 'Est l\u2019arriv\u00e9e'],
      done: ['Est arriv\u00e9 \u00e0', 'A \u00e9t\u00e9 l\u2019arriv\u00e9e'],
      canceled: ['N\u2019arrivera pas \u00e0', 'Ne sera pas l\u2019arriv\u00e9e'],
    },
  };
  var DEP_INVERSE = {
    depends: 'Est n\u00e9cessaire \u00e0',
    needs: 'Est requis par',
    after: 'Pr\u00e9c\u00e8de',
    parts: 'Fait partie de',
  };

  function foldList(name) {
    return String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** When the board has no stored category, the list title still says where the card sits. */
  function categoryFromList(name) {
    var n = foldList(name);
    if (!n) return '';
    function starts(words) {
      for (var i = 0; i < words.length; i++) {
        if (n === words[i] || n.indexOf(words[i] + ' ') === 0) return true;
      }
      return false;
    }
    if (starts(['canceled', 'cancelled', 'annule', 'annulee', 'abandoned'])) return 'canceled';
    if (starts(['completed', 'complete', 'done', 'fini', 'finie', 'finished', 'termine', 'terminee', 'closed'])) return 'completed';
    if (starts(['blocked', 'bloque', 'paused', 'stuck']) || n === 'on hold' || n === 'en pause') return 'blocked';
    if (starts(['started', 'doing', 'wip']) || n === 'en cours' || n.indexOf('en cours ') === 0 || n === 'in progress' || n.indexOf('in progress ') === 0) return 'started';
    return '';
  }

  /**
   * will: planned or paused, not being done right now.
   * doing: list "En cours", or some progress, and not blocked.
   * done: completed (category, list title, dueComplete, or 100%).
   * canceled: dropped.
   */
  function taskPhase(rec) {
    rec = rec && typeof rec === 'object' ? rec : {};
    var cat = rec.category || categoryFromList(rec.listName);
    if (cat === 'canceled') return 'canceled';
    if (cat === 'completed' || rec.dueComplete || rec.done) return 'done';
    if (typeof rec.progress === 'number' && rec.progress >= 100) return 'done';
    if (rec.blocked || cat === 'blocked') return 'will';
    if (cat === 'started') return 'doing';
    if (typeof rec.progress === 'number' && rec.progress > 0) return 'doing';
    return 'will';
  }

  /**
   * How to read `edge` when `focusId` is the node the user clicked (or null).
   * Returns { text, verb, phase, from, to }. `from` → `to` is the reading direction
   * (arrow leaves the focused end). The phrase is the verb only: the other card
   * already carries the name. getNode(id) → node ({ label, rec }).
   */
  function relationPhrase(edge, focusId, getNode) {
    var e = edge || {};
    var get = typeof getNode === 'function' ? getNode : function (id) {
      return getNode && getNode[id];
    };
    var fromN = get(e.from);
    var towardOther = !!(focusId && focusId === e.to && focusId !== e.from);
    var phase = null;
    var verb;
    var pair = PHASE_VERBS[e.kind];
    if (pair) {
      phase = taskPhase(fromN && fromN.rec);
      var sides = pair[phase] || pair.will;
      verb = towardOther ? sides[1] : sides[0];
    } else if (e.kind === 'depends') {
      var key = DEP_LABELS[e.dep] ? e.dep : 'depends';
      verb = towardOther ? DEP_INVERSE[key] : DEP_LABELS[key];
    } else if (e.kind === 'serves') {
      verb = towardOther ? 'Reçoit' : EDGE_LABELS.serves;
    } else if (e.kind === 'sub') {
      verb = towardOther ? 'Sous-tâche de' : EDGE_LABELS.sub;
    } else {
      verb = EDGE_LABELS[e.kind] || e.kind || '';
    }
    return {
      text: verb,
      verb: verb,
      phase: phase,
      from: towardOther ? e.to : e.from,
      to: towardOther ? e.from : e.to,
    };
  }

  // Goal hierarchy, highest to smallest. A task is the last level. "serves" edges point from the
  // smaller thing to the bigger one it contributes to (task → project → objective → goal → mission → vision).
  EDGE_LABELS.serves = 'Contribue à';
  EDGE_LABELS.sub = 'Sous-tâche';
  var LEVELS = [
    { id: 'vision', label: 'Vision', icon: 'eye', hue: 275 },
    { id: 'mission', label: 'Mission', icon: 'flag-3', hue: 330 },
    { id: 'goal', label: 'But', icon: 'target-arrow', hue: 25 },
    { id: 'objective', label: 'Objectif', icon: 'ruler', hue: 160 },
    { id: 'project', label: 'Projet', icon: 'stack-2', hue: 45 },
  ];
  // Data stored before the Objective / Project split used 'work' (unit of work) for a project.
  var LEVEL_ALIASES = { work: 'project' };
  var TASK_RANK = LEVELS.length;

  function levelById(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
    return null;
  }

  /** 0 (vision) … 4 (project), 5 for a task, -1 for people / places. */
  function rankOf(node) {
    if (!node) return -1;
    if (node.kind === 'task') return TASK_RANK;
    if (node.kind === 'goal') {
      for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === node.level) return i;
    }
    return -1;
  }

  /** `{i, c}` kept on a goal node. DocsModel's catalog when the page has it; otherwise a plain glyph and a hex color. */
  function cleanIcon(raw) {
    if (global.DocsModel && typeof global.DocsModel.normalizeIcon === 'function') return global.DocsModel.normalizeIcon(raw);
    if (!raw || typeof raw !== 'object') return null;
    var name = String(raw.i == null ? '' : raw.i).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    var color = String(raw.c == null ? '' : raw.c).trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(name)) name = '';
    if (!/^#[0-9a-f]{6}$/.test(color)) color = '';
    if (!name && !color) return null;
    var out = {};
    if (name) out.i = name;
    if (color) out.c = color;
    return out;
  }

  /** Cleans the stored goal data: known levels, named nodes, unique ids, links without duplicates. */
  function normalizeGoals(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var nodes = [];
    var ids = Object.create(null);
    (Array.isArray(src.nodes) ? src.nodes : []).forEach(function (n) {
      var name = n && typeof n.name === 'string' ? n.name.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
      var level = n && LEVEL_ALIASES[n.level] ? LEVEL_ALIASES[n.level] : n && n.level;
      if (!name || !n.id || ids[n.id] || !levelById(level)) return;
      ids[n.id] = true;
      var node = { id: String(n.id), level: level, name: name };
      var desc = typeof n.desc === 'string' ? n.desc.replace(/\r\n?/g, '\n').trim().slice(0, 2000) : '';
      if (desc) node.desc = desc;
      var icon = cleanIcon(n.icon);
      if (icon) node.icon = icon;
      var listId = level === 'project' && typeof n.listId === 'string' ? n.listId.trim().slice(0, 32) : '';
      if (listId && /^[A-Za-z0-9]+$/.test(listId)) node.listId = listId;
      nodes.push(node);
    });
    var links = [];
    var seen = Object.create(null);
    (Array.isArray(src.links) ? src.links : []).forEach(function (l) {
      if (!l || typeof l.from !== 'string' || typeof l.to !== 'string' || l.from === l.to) return;
      var key = l.from + '>' + l.to;
      if (seen[key]) return;
      seen[key] = true;
      links.push({ from: l.from, to: l.to });
    });
    return { nodes: nodes, links: links };
  }

  /**
   * What a drag from `a` to `b` means: { kind:'depends', from, to } for two tasks, { kind:'serves', from, to }
   * (smaller → bigger) when one is a goal level and the other lower, or { error } otherwise.
   */
  function linkBetween(a, b) {
    var ra = rankOf(a);
    var rb = rankOf(b);
    if (ra < 0 || rb < 0 || a.id === b.id) return { error: 'Ce lien n’est pas possible ici' };
    if (ra === TASK_RANK && rb === TASK_RANK) return { kind: 'depends', from: a.id, to: b.id };
    if (ra === rb) return { error: 'Reliez deux niveaux différents (ex. Mission → Objectif)' };
    return ra > rb ? { kind: 'serves', from: a.id, to: b.id } : { kind: 'serves', from: b.id, to: a.id };
  }

  function levelRank(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return i;
    return -1;
  }

  /**
   * Where a node belongs: its chain of 'serves' parents (first parent at each step), nearest first,
   * up to the vision. Node ids, not including the node itself.
   */
  function ancestors(edges, id) {
    var parent = Object.create(null);
    (edges || []).forEach(function (e) {
      if (e.kind === 'serves' && !parent[e.from]) parent[e.from] = e.to;
    });
    var out = [];
    var seen = Object.create(null);
    seen[id] = true;
    for (var p = parent[id]; p && !seen[p]; p = parent[p]) {
      seen[p] = true;
      out.push(p);
    }
    return out;
  }

  /**
   * Kept for callers. A task without a project, or a project without an objective, is ordinary
   * work, so nothing is flagged on the node. The breadcrumb still shows the parents that exist.
   */
  function contextFlags() {
    return [];
  }

  function isClosed(rec) {
    return rec.category === 'completed' || rec.category === 'canceled';
  }

  function placeRefs(inputs) {
    var p = (inputs && inputs.places) || {};
    var out = [];
    if (p.at) out.push({ kind: 'at', ref: p.at });
    if (p.from) out.push({ kind: 'from', ref: p.from });
    (Array.isArray(p.via) ? p.via : []).forEach(function (r) {
      out.push({ kind: 'via', ref: r });
    });
    if (p.to) out.push({ kind: 'to', ref: p.to });
    return out.filter(function (x) {
      return x.ref && (x.ref.id || x.ref.name);
    });
  }

  /**
   * opts: { hideDone: bool, filter: string, show: { depends, by, at } (default all true) }
   * Returns { nodes: [{id, kind, label, rec?, degree}], edges: [{id, kind, from, to}] }.
   * With a filter, only the matching tasks (and what they link to / depend on) are kept.
   */
  function buildGraph(records, opts) {
    opts = opts || {};
    var show = Object.assign({ depends: true, by: true, at: true }, opts.show || {});
    var q = String(opts.filter || '').trim().toLowerCase();
    var all = Array.isArray(records) ? records : [];
    var byId = Object.create(null);
    all.forEach(function (r) {
      byId[r.id] = r;
    });

    var tasks = all.filter(function (r) {
      if (opts.hideDone && isClosed(r)) return false;
      return true;
    });
    var taskIds = Object.create(null);
    tasks.forEach(function (r) {
      taskIds[r.id] = true;
    });

    var nodes = [];
    var edges = [];
    var nodeById = Object.create(null);
    var edgeSeen = Object.create(null);

    function addNode(id, kind, label, rec) {
      if (nodeById[id]) return nodeById[id];
      var n = { id: id, kind: kind, label: label, degree: 0 };
      if (rec) n.rec = rec;
      nodeById[id] = n;
      nodes.push(n);
      return n;
    }
    function addEdge(kind, from, to, dep) {
      var id = kind + ':' + from + '>' + to;
      if (edgeSeen[id] || !nodeById[from] || !nodeById[to]) return;
      edgeSeen[id] = true;
      var edge = { id: id, kind: kind, from: from, to: to };
      if (dep) edge.dep = dep;
      edges.push(edge);
      nodeById[from].degree++;
      nodeById[to].degree++;
    }

    tasks.forEach(function (r) {
      addNode('t:' + r.id, 'task', r.name || '(sans titre)', r);
    });

    if (show.goals !== false && opts.goals) {
      var goals = normalizeGoals(opts.goals);
      goals.nodes.forEach(function (g) {
        var n = addNode(g.id, 'goal', g.name);
        n.level = g.level;
        if (g.icon) n.icon = g.icon;
      });
      goals.links.forEach(function (l) {
        var a = nodeById[l.from];
        var b = nodeById[l.to];
        if (a && b && rankOf(a) > rankOf(b) && rankOf(b) >= 0) addEdge('serves', l.from, l.to);
      });
    }

    tasks.forEach(function (r) {
      var from = 't:' + r.id;
      if (show.depends) {
        var deps = (r.inputs && r.inputs.dependsOn) || [];
        var types = (r.inputs && r.inputs.depTypes) || {};
        deps.forEach(function (d) {
          if (d !== r.id && taskIds[d]) addEdge('depends', from, 't:' + d, DEP_LABELS[types[d]] ? types[d] : null);
        });
      }
      if (show.by) {
        (r.assignees || []).forEach(function (a) {
          var pid = 'p:' + (a.trelloId || a.id);
          addNode(pid, 'person', a.name || a.id);
          addEdge('by', from, pid);
        });
      }
      if (show.at) {
        placeRefs(r.inputs).forEach(function (x) {
          var key = x.ref.id || 'n:' + String(x.ref.name).toLowerCase();
          var lid = 'l:' + key;
          addNode(lid, 'place', x.ref.name || x.ref.id);
          addEdge(x.kind, from, lid);
        });
      }
    });

    // Subtasks: local checklist items become nodes under their card; linked cards get a link from the parent.
    if (show.sub !== false) {
      tasks.forEach(function (r) {
        var from = 't:' + r.id;
        (Array.isArray(r.items) ? r.items : []).forEach(function (it) {
          if (!it) return;
          var linked = it.linkedCardId != null ? String(it.linkedCardId).trim() : '';
          if (linked) {
            if (linked !== r.id) addEdge('sub', from, 't:' + linked);
            return;
          }
          if (!it.id || (opts.hideDone && (it.done || it.progress >= 100))) return;
          var sid = 's:' + r.id + ':' + it.id;
          var sn = addNode(sid, 'subtask', it.text || 'Sous-tâche');
          sn.parentId = r.id;
          sn.progress = typeof it.progress === 'number' ? it.progress : it.done ? 100 : 0;
          addEdge('sub', from, sid);
        });
      });
    }

    if (q) {
      var keepTask = Object.create(null);
      nodes.forEach(function (n) {
        if (n.kind === 'task' && n.label.toLowerCase().indexOf(q) >= 0) keepTask[n.id] = true;
      });
      var keep = Object.create(null);
      Object.keys(keepTask).forEach(function (id) {
        keep[id] = true;
      });
      edges.forEach(function (e) {
        if (keepTask[e.from]) keep[e.to] = true;
        if (keepTask[e.to] && nodeById[e.from].kind === 'task') keep[e.from] = true;
      });
      // Persons / places that matched by name pull in the tasks linked to them.
      nodes.forEach(function (n) {
        if (n.kind !== 'task' && n.label.toLowerCase().indexOf(q) >= 0) {
          keep[n.id] = true;
          edges.forEach(function (e) {
            if (e.to === n.id) keep[e.from] = true;
          });
        }
      });
      nodes = nodes.filter(function (n) {
        return keep[n.id];
      });
      edges = edges.filter(function (e) {
        return keep[e.from] && keep[e.to];
      });
      nodes.forEach(function (n) {
        n.degree = 0;
      });
      edges.forEach(function (e) {
        nodeById[e.from].degree++;
        nodeById[e.to].degree++;
      });
    }
    return { nodes: nodes, edges: edges };
  }

  /** Task ids that sit on a dependency cycle (A → B → A). */
  function findCycles(edges) {
    var adj = Object.create(null);
    (edges || []).forEach(function (e) {
      if (e.kind !== 'depends') return;
      (adj[e.from] = adj[e.from] || []).push(e.to);
    });
    var state = Object.create(null); // 1 = on stack, 2 = done
    var onCycle = Object.create(null);
    var stack = [];
    function visit(n) {
      state[n] = 1;
      stack.push(n);
      (adj[n] || []).forEach(function (m) {
        if (state[m] === 1) {
          for (var i = stack.length - 1; i >= 0; i--) {
            onCycle[stack[i]] = true;
            if (stack[i] === m) break;
          }
        } else if (!state[m]) visit(m);
      });
      stack.pop();
      state[n] = 2;
    }
    Object.keys(adj).forEach(function (n) {
      if (!state[n]) visit(n);
    });
    return Object.keys(onCycle);
  }

  /** True when making `from` depend on `to` would close a dependency cycle (to already depends on from). */
  function wouldCycle(edges, from, to) {
    if (from === to) return true;
    var adj = Object.create(null);
    (edges || []).forEach(function (e) {
      if (e.kind === 'depends') (adj[e.from] = adj[e.from] || []).push(e.to);
    });
    var seen = Object.create(null);
    var todo = [to];
    while (todo.length) {
      var n = todo.pop();
      if (n === from) return true;
      if (seen[n]) continue;
      seen[n] = true;
      (adj[n] || []).forEach(function (m) {
        todo.push(m);
      });
    }
    return false;
  }

  /** Ids connected to `id` by one edge, in either direction (for highlighting). */
  function neighbours(edges, id) {
    var out = Object.create(null);
    (edges || []).forEach(function (e) {
      if (e.from === id) out[e.to] = true;
      if (e.to === id) out[e.from] = true;
    });
    return out;
  }

  /**
   * Deterministic force layout (seeded circle start, repulsion + springs + gravity). Mutates and
   * returns the nodes with x / y in a roughly [-W/2, W/2] space. Hand-placed nodes (pinned) stay put.
   */
  function layout(nodes, edges, opts) {
    opts = opts || {};
    var iterations = opts.iterations || 260;
    var n = nodes.length;
    if (!n) return nodes;
    var idx = Object.create(null);
    nodes.forEach(function (nd, i) {
      idx[nd.id] = i;
      if (nd.pinned && isFinite(nd.x) && isFinite(nd.y)) return;
      var ring = nd.kind === 'task' ? 1 : 1.7;
      var a = (i / n) * Math.PI * 2;
      nd.x = Math.cos(a) * 120 * ring * Math.sqrt(n / 4 + 1);
      nd.y = Math.sin(a) * 120 * ring * Math.sqrt(n / 4 + 1);
    });
    var rest = { depends: 150, by: 130, at: 130, from: 130, via: 130, to: 130 };
    var vx = new Array(n).fill(0);
    var vy = new Array(n).fill(0);
    for (var it = 0; it < iterations; it++) {
      var cool = 1 - it / iterations;
      var fx = new Array(n).fill(0);
      var fy = new Array(n).fill(0);
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          var dx = nodes[i].x - nodes[j].x;
          var dy = nodes[i].y - nodes[j].y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            dx = (i % 2 ? 1 : -1) * 0.5;
            dy = (j % 2 ? 1 : -1) * 0.5;
            d2 = 1;
          }
          if (d2 > 640000) continue;
          var f = 9000 / d2;
          var d = Math.sqrt(d2);
          fx[i] += (dx / d) * f;
          fy[i] += (dy / d) * f;
          fx[j] -= (dx / d) * f;
          fy[j] -= (dy / d) * f;
        }
      }
      edges.forEach(function (e) {
        var a = idx[e.from];
        var b = idx[e.to];
        if (a == null || b == null) return;
        var dx = nodes[b].x - nodes[a].x;
        var dy = nodes[b].y - nodes[a].y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var f = (d - (rest[e.kind] || 130)) * 0.04;
        fx[a] += (dx / d) * f;
        fy[a] += (dy / d) * f;
        fx[b] -= (dx / d) * f;
        fy[b] -= (dy / d) * f;
      });
      for (var k = 0; k < n; k++) {
        if (nodes[k].pinned) continue;
        fx[k] -= nodes[k].x * 0.012;
        fy[k] -= nodes[k].y * 0.012;
        vx[k] = (vx[k] + fx[k]) * 0.6;
        vy[k] = (vy[k] + fy[k]) * 0.6;
        var sp = Math.sqrt(vx[k] * vx[k] + vy[k] * vy[k]);
        var max = 40 * cool + 2;
        if (sp > max) {
          vx[k] = (vx[k] / sp) * max;
          vy[k] = (vy[k] / sp) * max;
        }
        nodes[k].x += vx[k];
        nodes[k].y += vy[k];
      }
    }
    return nodes;
  }

  /**
   * Radial "from the center" layout of the goal hierarchy: the vision(s) in the middle, then missions,
   * goals, objectives, projects and tasks on rings further out; every node sits in the angular wedge of its
   * first parent (wedges are proportional to the number of leaves below). Tasks with no goal, people and
   * places go on the outermost ring. Mutates and returns the nodes (x / y); sizes via opts.cardW / cardGap.
   */
  function layoutHierarchy(nodes, edges, opts) {
    opts = opts || {};
    var cardW = opts.cardW || 230;
    var ringGap = opts.ringGap || 300;
    var byId = Object.create(null);
    nodes.forEach(function (n) {
      byId[n.id] = n;
    });
    var parent = Object.create(null);
    var kids = Object.create(null);
    (edges || []).forEach(function (e) {
      if (e.kind !== 'serves' || parent[e.from]) return;
      parent[e.from] = e.to;
      (kids[e.to] = kids[e.to] || []).push(e.from);
    });
    function inTree(n) {
      return rankOf(n) >= 0 && (rankOf(n) < TASK_RANK || parent[n.id] || kids[n.id]);
    }
    var tree = nodes.filter(inTree);
    var outer = nodes.filter(function (n) {
      return !inTree(n);
    });
    var roots = tree.filter(function (n) {
      return !parent[n.id];
    });
    var weight = Object.create(null);
    function weigh(n, depth) {
      if (weight[n.id]) return weight[n.id];
      var ks = depth > 8 ? [] : kids[n.id] || [];
      var w = 0;
      ks.forEach(function (k) {
        w += weigh(byId[k], depth + 1);
      });
      weight[n.id] = Math.max(1, w);
      return weight[n.id];
    }
    roots.forEach(function (r) {
      weigh(r, 0);
    });
    var angle = Object.create(null);
    function spread(list, a0, a1, depth) {
      var total = 0;
      list.forEach(function (n) {
        total += weight[n.id];
      });
      var a = a0;
      list.forEach(function (n) {
        var span = ((a1 - a0) * weight[n.id]) / total;
        angle[n.id] = a + span / 2;
        if (depth < 8 && kids[n.id]) spread(kids[n.id].map(function (k) { return byId[k]; }), a, a + span, depth + 1);
        a += span;
      });
    }
    roots.sort(function (a, b) {
      return rankOf(a) - rankOf(b);
    });
    spread(roots, -Math.PI / 2, (Math.PI * 3) / 2, 0);
    // ring radii: one ring per rank, widened when a ring holds too many cards for its circumference
    var radius = [];
    var counts = [];
    tree.forEach(function (n) {
      counts[rankOf(n)] = (counts[rankOf(n)] || 0) + 1;
    });
    var rootsOnTop = roots.length === 1 && rankOf(roots[0]) === 0;
    for (var r = 0; r <= TASK_RANK; r++) {
      var need = ((counts[r] || 0) * (cardW + 40)) / (2 * Math.PI);
      var base = r === 0 ? (rootsOnTop ? 0 : need) : (radius[r - 1] || 0) + ringGap;
      radius[r] = r === 0 && rootsOnTop ? 0 : Math.max(base, need);
    }
    tree.forEach(function (n) {
      var rr = radius[rankOf(n)] || 0;
      var a = angle[n.id] || 0;
      n.x = Math.cos(a) * rr;
      n.y = Math.sin(a) * rr;
    });
    var lastRank = 0;
    for (var q = 0; q <= TASK_RANK; q++) if (counts[q]) lastRank = q;
    var outerR = (radius[lastRank] || 0) + ringGap;
    outerR = Math.max(outerR, (outer.length * (cardW + 40)) / (2 * Math.PI));
    outer.forEach(function (n, i) {
      var a = (i / Math.max(1, outer.length)) * Math.PI * 2 - Math.PI / 2;
      n.x = Math.cos(a) * outerR;
      n.y = Math.sin(a) * outerR;
    });
    return nodes;
  }

  var LENSES = [
    { id: 'hierarchy', label: 'Hiérarchie' },
    { id: 'vision', label: 'Vision' },
    { id: 'mission', label: 'Mission' },
    { id: 'goal', label: 'But' },
    { id: 'objective', label: 'Objectif' },
    { id: 'project', label: 'Projet' },
    { id: 'type', label: 'Type' },
    { id: 'manual', label: 'Manuel' },
  ];

  function lensById(id) {
    for (var i = 0; i < LENSES.length; i++) if (LENSES[i].id === id) return LENSES[i];
    return null;
  }

  /** overview (chips) → structure (levels) → work (cards) → detail (a task opens into nodes). */
  function zoomBand(k) {
    k = typeof k === 'number' && isFinite(k) ? k : 1;
    if (k < 0.45) return 'overview';
    if (k < 0.8) return 'structure';
    if (k < 1.55) return 'work';
    return 'detail';
  }

  function hueOfText(text) {
    var hsh = 0;
    String(text || '').split('').forEach(function (c) { hsh = (hsh * 31 + c.charCodeAt(0)) % 360; });
    return hsh;
  }

  /** Stored manual groups: unique ids, trimmed names, unique member ids. Empty groups are dropped. */
  function normalizeManual(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var ids = Object.create(null);
    list.forEach(function (g) {
      if (!g || g.id == null) return;
      var id = String(g.id).slice(0, 40);
      if (!id || ids[id]) return;
      var name = g.name != null ? String(g.name).replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      if (!name) name = 'Groupe';
      var members = [];
      var seen = Object.create(null);
      (Array.isArray(g.members) ? g.members : []).forEach(function (m) {
        var mid = m == null ? '' : String(m).slice(0, 80);
        if (!mid || seen[mid]) return;
        seen[mid] = true;
        members.push(mid);
      });
      if (!members.length) return;
      ids[id] = true;
      out.push({ id: id, name: name, members: members });
    });
    return out;
  }

  function servesIndex(edges) {
    var kids = Object.create(null);
    var parent = Object.create(null);
    (edges || []).forEach(function (e) {
      if (!e || e.kind !== 'serves') return;
      if (!parent[e.from]) parent[e.from] = e.to;
      (kids[e.to] = kids[e.to] || []).push(e.from);
    });
    return { kids: kids, parent: parent };
  }

  function collectDesc(id, kids, into, guard) {
    if (guard > 16) return;
    (kids[id] || []).forEach(function (c) {
      if (into[c]) return;
      into[c] = true;
      collectDesc(c, kids, into, guard + 1);
    });
  }

  function makeGroup(spec) {
    return {
      id: spec.id,
      label: spec.label,
      level: spec.level || '',
      lens: spec.lens,
      hue: spec.hue,
      anchorId: spec.anchorId || null,
      members: spec.members,
      parentId: spec.parentId || null,
      taskCount: 0,
    };
  }

  function countTasks(g, byAnchor, byId, seen) {
    var n = 0;
    g.members.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      var node = byId[id];
      if (node && node.kind === 'task') n++;
      else if (byAnchor[id]) n += countTasks(byAnchor[id], byAnchor, byId, seen);
    });
    return n;
  }

  function finishGroups(groups, byId) {
    var byAnchor = Object.create(null);
    groups.forEach(function (g) { if (g.anchorId) byAnchor[g.anchorId] = g; });
    groups.forEach(function (g) { g.taskCount = countTasks(g, byAnchor, byId, Object.create(null)); });
    return groups;
  }

  function looseLabel(lens) {
    if (lens === 'vision') return 'Sans vision';
    if (lens === 'mission') return 'Sans mission';
    if (lens === 'goal') return 'Sans but';
    if (lens === 'objective') return 'Sans objectif';
    return 'Sans projet';
  }

  /**
   * Groups for one lens. hierarchy nests every goal level; a named level flattens to that level;
   * type uses opts.buckets, else entityType / typeName, else the first label; manual uses opts.manual.
   * Tasks with no group of that lens land in one loose group (except type and manual).
   */
  function buildGroups(graph, opts) {
    opts = opts || {};
    var lens = lensById(opts.lens) ? opts.lens : 'hierarchy';
    var nodes = (graph && graph.nodes) || [];
    var edges = (graph && graph.edges) || [];
    var byId = Object.create(null);
    nodes.forEach(function (n) { byId[n.id] = n; });
    var groups = [];

    if (lens === 'manual') {
      normalizeManual(opts.manual).forEach(function (g) {
        var members = g.members.filter(function (id) { return byId[id]; });
        if (!members.length) return;
        groups.push(makeGroup({
          id: g.id, label: g.name, level: 'manual', lens: 'manual',
          hue: hueOfText(g.name), members: members,
        }));
      });
      return finishGroups(groups, byId);
    }

    if (lens === 'type') {
      if (Array.isArray(opts.buckets) && opts.buckets.length) {
        opts.buckets.forEach(function (b, i) {
          if (!b) return;
          var members = [];
          var seen = Object.create(null);
          (Array.isArray(b.members) ? b.members : []).forEach(function (m) {
            var id = byId[m] ? String(m) : byId['t:' + m] ? 't:' + m : '';
            if (!id || seen[id]) return;
            seen[id] = true;
            members.push(id);
          });
          if (!members.length) return;
          var name = String(b.name || 'Type').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Type';
          groups.push(makeGroup({
            id: 'grp:type:' + String(b.id || i),
            label: name, level: 'type', lens: 'type',
            hue: typeof b.hue === 'number' ? b.hue : hueOfText(name),
            members: members,
          }));
        });
      } else {
        var buckets = Object.create(null);
        var order = [];
        nodes.forEach(function (n) {
          if (n.kind !== 'task') return;
          var rec = n.rec || {};
          var typeName = rec.entityType || rec.typeName || '';
          var lab = !typeName && Array.isArray(rec.labels) ? rec.labels.filter(function (l) { return l && (l.name || l.id); })[0] : null;
          var key = typeName ? 'e:' + typeName : lab ? 'l:' + (lab.id || lab.name) : 'none';
          var name = typeName || (lab && lab.name) || 'Sans type';
          if (!buckets[key]) {
            buckets[key] = { name: name, members: [] };
            order.push(key);
          }
          buckets[key].members.push(n.id);
        });
        order.forEach(function (key) {
          var b = buckets[key];
          groups.push(makeGroup({
            id: 'grp:type:' + key, label: b.name, level: 'type', lens: 'type',
            hue: hueOfText(b.name), members: b.members,
          }));
        });
      }
      return finishGroups(groups, byId);
    }

    var idx = servesIndex(edges);
    var levelFilter = lens === 'hierarchy' ? null : lens;
    nodes.forEach(function (n) {
      if (n.kind !== 'goal') return;
      if (levelFilter && n.level !== levelFilter) return;
      var memberMap = Object.create(null);
      if (lens === 'hierarchy') (idx.kids[n.id] || []).forEach(function (c) { if (byId[c]) memberMap[c] = true; });
      else collectDesc(n.id, idx.kids, memberMap, 0);
      var members = Object.keys(memberMap);
      if (!members.length) return;
      var lv = levelById(n.level);
      var parentNode = lens === 'hierarchy' ? idx.parent[n.id] : null;
      var parentId = parentNode && byId[parentNode] && byId[parentNode].kind === 'goal' ? 'grp:' + parentNode : null;
      groups.push(makeGroup({
        id: 'grp:' + n.id,
        label: n.label,
        level: n.level,
        lens: lens,
        hue: lv ? lv.hue : hueOfText(n.label),
        anchorId: n.id,
        members: members,
        parentId: parentId,
      }));
    });

    var taken = Object.create(null);
    groups.forEach(function (g) {
      if (g.anchorId) taken[g.anchorId] = true;
      g.members.forEach(function (id) { taken[id] = true; });
    });
    var loose = [];
    nodes.forEach(function (n) {
      if (n.kind === 'task' && !taken[n.id]) loose.push(n.id);
    });
    if (loose.length) {
      groups.push(makeGroup({
        id: 'grp:loose', label: looseLabel(lens), level: 'loose', lens: lens,
        hue: 210, members: loose,
      }));
    }
    return finishGroups(groups, byId);
  }

  /**
   * User edits on top of a lens: { groupId: { name?, extra?: [nodeId], omit?: [nodeId] } }.
   * extra pulls a node into the group, omit takes one out, name renames the boundary.
   */
  function applyGroupEdits(groups, edits, byId) {
    if (!edits || typeof edits !== 'object') return groups || [];
    var next = (groups || []).map(function (g) {
      var e = edits[g.id];
      if (!e || typeof e !== 'object') return g;
      var omit = Object.create(null);
      (Array.isArray(e.omit) ? e.omit : []).forEach(function (id) { if (id != null) omit[String(id)] = true; });
      var members = g.members.filter(function (id) { return !omit[id]; });
      var seen = Object.create(null);
      members.forEach(function (id) { seen[id] = true; });
      (Array.isArray(e.extra) ? e.extra : []).forEach(function (id) {
        id = id == null ? '' : String(id);
        if (!id || seen[id] || omit[id] || (byId && !byId[id])) return;
        seen[id] = true;
        members.push(id);
      });
      var name = e.name != null ? String(e.name).replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      return makeGroup({
        id: g.id, label: name || g.label, level: g.level, lens: g.lens,
        hue: g.hue, anchorId: g.anchorId, members: members, parentId: g.parentId,
      });
    });
    return finishGroups(next, byId || {});
  }

  function autoOpen(g, lens, band) {
    if (band === 'work' || band === 'detail') return true;
    if (band === 'overview') return false;
    if (lens === 'hierarchy') {
      var r = levelRank(g.level);
      return r >= 0 && r < levelRank('project');
    }
    return true;
  }

  /** The nodes a task is made of, once you are close enough to read them. People and places stay real nodes. */
  function facetsOf(node) {
    if (!node || node.kind !== 'task') return [];
    var rec = node.rec || {};
    var out = [];
    var prog = typeof rec.progress === 'number' ? Math.round(Math.max(0, Math.min(100, rec.progress))) : 0;
    out.push({ id: 'f:' + node.id + ':progress', kind: 'facet', facet: 'progress', parentId: node.id, label: prog + ' %', value: prog });
    if (rec.priorityLabel) out.push({ id: 'f:' + node.id + ':priority', kind: 'facet', facet: 'priority', parentId: node.id, label: String(rec.priorityLabel) });
    if (rec.listName) out.push({ id: 'f:' + node.id + ':status', kind: 'facet', facet: 'status', parentId: node.id, label: String(rec.listName) });
    if (rec.blocked) out.push({ id: 'f:' + node.id + ':blocked', kind: 'facet', facet: 'blocked', parentId: node.id, label: 'En pause' });
    var due = rec.dueCountdown || (rec.due ? String(rec.due).slice(0, 10) : '');
    if (due) out.push({ id: 'f:' + node.id + ':due', kind: 'facet', facet: 'due', parentId: node.id, label: String(due) });
    return out;
  }

  /**
   * What the map shows at this zoom. opts: { lens, zoom, manual, buckets, force:{groupId:'open'|'closed'},
 * focusId, openTasks:{nodeId:true} }. A closed group hides its members. People, places and subtasks
 * follow their tasks. At the detail band, the focused task (or one pinned in openTasks) opens into facet nodes.
   */
  function scene(graph, opts) {
    opts = opts || {};
    var lens = lensById(opts.lens) ? opts.lens : 'hierarchy';
    var band = zoomBand(opts.zoom);
    var nodes = (graph && graph.nodes) || [];
    var edges = (graph && graph.edges) || [];
    var byNode = Object.create(null);
    nodes.forEach(function (n) { byNode[n.id] = n; });
    var groups = applyGroupEdits(buildGroups(graph, opts), opts.edits, byNode);
    var byGroup = Object.create(null);
    var force = opts.force || {};
    groups.forEach(function (g) {
      var f = force[g.id];
      g.open = f === 'open' ? true : f === 'closed' ? false : autoOpen(g, lens, band);
      g.hidden = false;
      byGroup[g.id] = g;
    });
    function ancestorClosed(g) {
      var p = g.parentId && byGroup[g.parentId];
      var guard = 0;
      while (p && guard++ < 16) {
        if (!p.open || p.hidden) return true;
        p = p.parentId && byGroup[p.parentId];
      }
      return false;
    }
    groups.forEach(function (g) {
      if (ancestorClosed(g)) { g.hidden = true; g.open = false; }
    });
    var memberOf = Object.create(null);
    groups.forEach(function (g) {
      g.members.forEach(function (id) { (memberOf[id] = memberOf[id] || []).push(g.id); });
    });
    var hidden = Object.create(null);
    Object.keys(memberOf).forEach(function (id) {
      var open = memberOf[id].some(function (gid) {
        var g = byGroup[gid];
        return g && g.open && !g.hidden;
      });
      if (!open) hidden[id] = true;
    });
    var showSat = Object.create(null);
    edges.forEach(function (e) {
      [e.from, e.to].forEach(function (id, i, ends) {
        var other = ends[1 - i];
        var node = byNode[id];
        var host = byNode[other];
        if (!node || !host || host.kind !== 'task' || hidden[host.id]) return;
        if (node.kind === 'person' || node.kind === 'place' || node.kind === 'subtask') showSat[id] = true;
      });
    });
    nodes.forEach(function (n) {
      if ((n.kind === 'person' || n.kind === 'place' || n.kind === 'subtask') && !showSat[n.id]) hidden[n.id] = true;
    });
    var facets = [];
    nodes.forEach(function (n) {
      if (n.kind !== 'task' || hidden[n.id]) return;
      var explode = (band === 'detail' && opts.focusId === n.id) || (opts.openTasks && opts.openTasks[n.id]);
      if (!explode) return;
      facetsOf(n).forEach(function (f) { facets.push(f); });
    });
    return { band: band, lens: lens, groups: groups, hidden: hidden, facets: facets };
  }

  /**
   * Where each node sits while `focusId` is the center of attention.
   * The focus keeps the coordinates it was given. Direct relations take a fixed side of the
   * compass. When the only relations are the work under a person, a place or a goal, they
   * open into a ring. One further relation sits behind each of those. Nodes already far
   * from the focus stay put; a node sitting in the neighbourhood steps outward.
   * Does not mutate `nodes`. Returns { positions: {id:{x,y}}, rings: {id:0|1|2} }.
   */
  function orbit(nodes, edges, focusId) {
    var list = nodes || [];
    var byId = Object.create(null);
    list.forEach(function (n) { if (n && n.id != null) byId[n.id] = n; });
    var focus = byId[focusId];
    var positions = {};
    var rings = {};
    if (!focus || !isFinite(focus.x) || !isFinite(focus.y)) return { positions: positions, rings: rings };
    var cx = focus.x;
    var cy = focus.y;
    positions[focus.id] = { x: cx, y: cy };
    rings[focus.id] = 0;

    var wedges = {
      above: [-120, -60],
      needs: [-60, 0],
      where: [0, 60],
      below: [60, 120],
      who: [120, 180],
      needed: [180, 240],
    };
    var buckets = { above: [], below: [], needs: [], needed: [], who: [], where: [] };
    var direct = Object.create(null);
    var rank = { above: 1, below: 2, needs: 3, needed: 4, who: 5, where: 6 };

    function roleOf(edge) {
      var out = edge.from === focusId;
      if (edge.kind === 'sub') return out ? 'below' : 'above';
      if (edge.kind === 'serves') return out ? 'above' : 'below';
      if (edge.kind === 'depends') return out ? 'needs' : 'needed';
      if (edge.kind === 'by') return focus.kind === 'person' ? 'below' : 'who';
      if (edge.kind === 'at' || edge.kind === 'from' || edge.kind === 'via' || edge.kind === 'to') {
        return focus.kind === 'place' ? 'below' : 'where';
      }
      return 'below';
    }

    (edges || []).forEach(function (e) {
      if (!e) return;
      var other = e.from === focusId ? e.to : e.to === focusId ? e.from : null;
      if (!other || other === focusId || !byId[other]) return;
      var role = roleOf(e);
      var prev = direct[other];
      if (prev && rank[prev] <= rank[role]) return;
      if (prev) {
        var pile = buckets[prev];
        var at = pile.indexOf(other);
        if (at >= 0) pile.splice(at, 1);
      }
      direct[other] = role;
      buckets[role].push(other);
    });

    function clusterKey(id) {
      var parent = '';
      (edges || []).forEach(function (e) {
        if (!parent && e && e.kind === 'serves' && e.from === id) parent = String(e.to);
      });
      var node = byId[id];
      return parent + '\n' + (node && node.label ? node.label : id);
    }
    Object.keys(buckets).forEach(function (role) {
      buckets[role].sort(function (a, b) {
        var ka = clusterKey(a);
        var kb = clusterKey(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
    });

    var usedRoles = Object.keys(buckets).filter(function (role) { return buckets[role].length; });
    var fullRing = usedRoles.length === 1 && usedRoles[0] === 'below';
    var placed = Object.create(null);
    placed[focus.id] = true;

    function toRad(deg) { return deg * Math.PI / 180; }

    function placeIds(ids, a0, a1, base) {
      if (!ids.length) return;
      var span = a1 - a0;
      if (span <= 0) span += Math.PI * 2;
      var gap = span / ids.length;
      var widest = 220;
      ids.forEach(function (id) {
        var n = byId[id];
        if (n && n.w) widest = Math.max(widest, n.w);
      });
      var radius = Math.max(base, (widest + 40) / gap);
      ids.forEach(function (id, i) {
        var a = a0 + gap * (i + 0.5);
        positions[id] = { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
        rings[id] = 1;
        placed[id] = true;
      });
    }

    if (fullRing) placeIds(buckets.below, toRad(-90), toRad(270), 280);
    else usedRoles.forEach(function (role) {
      var span = wedges[role];
      placeIds(buckets[role], toRad(span[0]), toRad(span[1]), 280);
    });

    var kindRank = { goal: 0, place: 1, person: 2, task: 3, subtask: 4 };
    var contextLeft = 18;
    var ring1 = Object.keys(rings).filter(function (id) { return rings[id] === 1; });
    ring1.forEach(function (pid) {
      if (contextLeft <= 0) return;
      var parent = positions[pid];
      var extras = [];
      var seen = Object.create(null);
      (edges || []).forEach(function (e) {
        if (!e) return;
        var other = e.from === pid ? e.to : e.to === pid ? e.from : null;
        if (!other || placed[other] || seen[other] || !byId[other]) return;
        seen[other] = true;
        extras.push(other);
      });
      extras.sort(function (a, b) {
        var ka = kindRank[byId[a].kind] != null ? kindRank[byId[a].kind] : 9;
        var kb = kindRank[byId[b].kind] != null ? kindRank[byId[b].kind] : 9;
        if (ka !== kb) return ka - kb;
        var la = byId[a].label || a;
        var lb = byId[b].label || b;
        return la < lb ? -1 : la > lb ? 1 : 0;
      });
      extras = extras.slice(0, Math.min(5, contextLeft));
      if (!extras.length) return;
      var pa = Math.atan2(parent.y - cy, parent.x - cx);
      var pr = Math.sqrt(Math.pow(parent.x - cx, 2) + Math.pow(parent.y - cy, 2)) || 280;
      var fan = Math.min(0.7, 0.22 * extras.length);
      var radius = pr + 170;
      extras.forEach(function (id, i) {
        var t = extras.length === 1 ? 0 : (i / (extras.length - 1)) - 0.5;
        var a = pa + t * fan;
        positions[id] = { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
        rings[id] = 2;
        placed[id] = true;
        contextLeft--;
      });
    });

    var moving = Object.keys(placed).filter(function (id) { return id !== focus.id; });
    moving.forEach(function (id) {
      var near = positions[id];
      var node = byId[id];
      var fdx = near.x - cx;
      var fdy = near.y - cy;
      var minFocus = ((node.w || 200) + (focus.w || 200)) / 2 + 36;
      var fd = Math.sqrt(fdx * fdx + fdy * fdy);
      if (fd >= minFocus) return;
      if (fd < 1) { fdx = 1; fdy = 0; fd = 1; }
      near.x = cx + (fdx / fd) * minFocus;
      near.y = cy + (fdy / fd) * minFocus;
    });

    var bubble = 0;
    moving.forEach(function (id) {
      var p = positions[id];
      bubble = Math.max(bubble, Math.sqrt(Math.pow(p.x - cx, 2) + Math.pow(p.y - cy, 2)));
    });
    bubble += 120;
    list.forEach(function (n) {
      if (!n || placed[n.id] || !isFinite(n.x) || !isFinite(n.y)) return;
      var dx = n.x - cx;
      var dy = n.y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bubble) {
        var a = dist < 8 ? ((String(n.id).length * 1.7) % 6) : Math.atan2(dy, dx);
        positions[n.id] = { x: cx + Math.cos(a) * bubble, y: cy + Math.sin(a) * bubble };
      } else {
        positions[n.id] = { x: n.x, y: n.y };
      }
    });
    return { positions: positions, rings: rings };
  }

  var PERSPECTIVES = [
    { id: 'network', label: 'Réseau', icon: 'topology-star-3' },
    { id: 'people', label: 'Personnes', icon: 'users' },
    { id: 'places', label: 'Lieux', icon: 'map-pin' },
    { id: 'time', label: 'Échéances', icon: 'calendar-event' },
    { id: 'status', label: 'Statuts', icon: 'progress' },
    { id: 'urgency', label: 'Urgence', icon: 'flag' },
  ];

  var STATUS_COLUMNS = [
    { key: 'blocked', label: 'Bloqué' },
    { key: 'doing', label: 'En cours' },
    { key: 'will', label: 'À faire' },
    { key: 'done', label: 'Terminé' },
    { key: 'canceled', label: 'Annulé' },
  ];

  /** Status column of a task: blocked wins over the planned/doing phase. */
  function statusBucket(rec) {
    rec = rec && typeof rec === 'object' ? rec : {};
    var phase = taskPhase(rec);
    if (phase === 'will' && (rec.blocked || rec.category === 'blocked' || categoryFromList(rec.listName) === 'blocked')) return 'blocked';
    return phase;
  }

  function perspectiveById(id) {
    for (var i = 0; i < PERSPECTIVES.length; i++) if (PERSPECTIVES[i].id === id) return PERSPECTIVES[i];
    return null;
  }

  var TIME_COLUMNS = [
    { key: 'late', label: 'En retard' },
    { key: 'week', label: 'Cette semaine' },
    { key: 'month', label: 'Ce mois-ci' },
    { key: 'later', label: 'Plus tard' },
    { key: 'none', label: 'Sans échéance' },
  ];

  /** Which TIME_COLUMNS bucket a due date (ISO text) falls in, relative to `now`. */
  function dueBucket(due, now) {
    if (!due) return 'none';
    var m = /^(d{4})-(d{2})-(d{2})/.exec(String(due));
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(due);
    if (isNaN(d.getTime())) return 'none';
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 86400000);
    if (days < 0) return 'late';
    if (days < 7) return 'week';
    if (days < 31) return 'month';
    return 'later';
  }

  /**
   * The same nodes regrouped around one question: who ('people'), where ('places') or when ('time').
   * Tasks stack in a column under their person, place or due-date bucket (a task with several people
   * sits under the first; its other wires stay). Everything that does not answer the question goes in
   * a last, receded column. Does not mutate `nodes`.
   * Returns { positions: {id:{x,y}}, dim: {id:true}, heads: [{key,label,x,y,count}] }; heads are the
   * column titles (a person or place card is its own title, so it has no head).
   */
  function perspective(nodes, edges, id, opts) {
    var list = nodes || [];
    var now = (opts && opts.now) || new Date();
    var out = { positions: {}, dim: {}, heads: [] };
    if (!perspectiveById(id) || id === 'network') return out;
    var byId = Object.create(null);
    list.forEach(function (n) { if (n && n.id != null) byId[n.id] = n; });

    var cols = [];
    var colOf = Object.create(null); // task id → column index
    var headKind = id === 'people' ? 'person' : id === 'places' ? 'place' : '';
    if (headKind) {
      list.filter(function (n) { return n.kind === headKind; }).forEach(function (n) {
        colOf['col:' + n.id] = cols.length;
        cols.push({ key: n.id, head: n, items: [] });
      });
      (edges || []).forEach(function (e) {
        if (!e || !byId[e.from] || byId[e.from].kind !== 'task' || colOf[e.from] != null) return;
        var ok = headKind === 'person' ? e.kind === 'by' : PLACE_EDGES.indexOf(e.kind) >= 0;
        var at = ok ? colOf['col:' + e.to] : null;
        if (at != null) { colOf[e.from] = at; cols[at].items.push(byId[e.from]); }
      });
      cols.sort(function (a, b) { return b.items.length - a.items.length || String(a.head.label).localeCompare(String(b.head.label), 'fr'); });
      var loose = { key: '', label: headKind === 'person' ? 'Sans responsable' : 'Sans lieu', items: [] };
      list.forEach(function (n) { if (n.kind === 'task' && colOf[n.id] == null) loose.items.push(n); });
      if (loose.items.length) cols.push(loose);
    } else if (id === 'status') {
      STATUS_COLUMNS.forEach(function (c) { cols.push({ key: c.key, label: c.label, items: [] }); });
      list.forEach(function (n) {
        if (n.kind !== 'task') return;
        var b = statusBucket(n.rec);
        for (var i = 0; i < cols.length; i++) if (cols[i].key === b) cols[i].items.push(n);
      });
      cols = cols.filter(function (c) { return c.items.length; });
    } else if (id === 'urgency') {
      var tiers = Object.create(null);
      list.forEach(function (n) {
        if (n.kind !== 'task') return;
        var r = n.rec || {};
        var label = r.priorityEnabled !== false && r.priorityLabel ? String(r.priorityLabel) : '';
        if (!tiers[label]) { tiers[label] = { key: label || 'none', label: label || 'Sans urgence', items: [], score: -Infinity }; cols.push(tiers[label]); }
        tiers[label].items.push(n);
        if (typeof r.priorityScore === 'number') tiers[label].score = Math.max(tiers[label].score, r.priorityScore);
      });
      cols.sort(function (a, b) {
        if (!a.key || a.key === 'none') return 1;
        if (!b.key || b.key === 'none') return -1;
        return b.score - a.score;
      });
    } else {
      TIME_COLUMNS.forEach(function (c) { cols.push({ key: c.key, label: c.label, items: [] }); });
      list.forEach(function (n) {
        if (n.kind !== 'task') return;
        var b = dueBucket(n.rec && n.rec.due, now);
        for (var i = 0; i < cols.length; i++) if (cols[i].key === b) cols[i].items.push(n);
      });
      cols = cols.filter(function (c) { return c.items.length; });
    }

    function byDue(a, b) {
      var da = a.rec && a.rec.due ? String(a.rec.due) : '\uffff';
      var db = b.rec && b.rec.due ? String(b.rec.due) : '\uffff';
      return da < db ? -1 : da > db ? 1 : String(a.label).localeCompare(String(b.label), 'fr');
    }
    function byScore(a, b) {
      var sa = a.rec && typeof a.rec.priorityScore === 'number' ? a.rec.priorityScore : -Infinity;
      var sb = b.rec && typeof b.rec.priorityScore === 'number' ? b.rec.priorityScore : -Infinity;
      return sa === sb ? byDue(a, b) : sb - sa;
    }
    var GAP = 14;
    var colW = 0;
    list.forEach(function (n) { colW = Math.max(colW, n.w || 200); });
    colW += 46;
    // The receded column: whatever is not a task and not already a column title.
    var rest = list.filter(function (n) { return n.kind !== 'task' && !(headKind && n.kind === headKind); });
    var all = cols.length + (rest.length ? 1 : 0);
    var x0 = -((all - 1) * colW) / 2;
    cols.forEach(function (c, ci) {
      var x = x0 + ci * colW;
      var y = 0;
      if (c.head) {
        out.positions[c.head.id] = { x: x, y: y + (c.head.h || 40) / 2 };
        y += (c.head.h || 40) + GAP * 1.5;
      } else {
        out.heads.push({ key: c.key, label: c.label, x: x, y: y + 12, count: c.items.length });
        y += 34;
      }
      c.items.sort(id === 'urgency' ? byScore : byDue).forEach(function (n) {
        out.positions[n.id] = { x: x, y: y + (n.h || 60) / 2 };
        y += (n.h || 60) + GAP;
      });
    });
    if (rest.length) {
      var rx = x0 + cols.length * colW;
      var ry = 34;
      out.heads.push({ key: 'context', label: 'Contexte', x: rx, y: 12, count: rest.length, dim: true });
      rest.forEach(function (n) {
        out.positions[n.id] = { x: rx, y: ry + (n.h || 40) / 2 };
        out.dim[n.id] = true;
        ry += (n.h || 40) + GAP;
      });
    }
    return out;
  }

  function ellipsePath(cx, cy, rx, ry) {
    rx = Math.max(8, rx);
    ry = Math.max(8, ry);
    var x0 = (cx - rx).toFixed(1);
    var x1 = (cx + rx).toFixed(1);
    var y = cy.toFixed(1);
    return 'M' + x0 + ',' + y + 'A' + rx.toFixed(1) + ',' + ry.toFixed(1) + ' 0 1 0 ' + x1 + ',' + y +
      'A' + rx.toFixed(1) + ',' + ry.toFixed(1) + ' 0 1 0 ' + x0 + ',' + y + 'Z';
  }

  function convexHull(points) {
    var pts = points.slice().sort(function (a, b) { return a.x === b.x ? a.y - b.y : a.x - b.x; });
    var uniq = [];
    pts.forEach(function (p) {
      var last = uniq[uniq.length - 1];
      if (last && last.x === p.x && last.y === p.y) return;
      uniq.push(p);
    });
    if (uniq.length <= 2) return uniq;
    function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
    var lower = [];
    uniq.forEach(function (p) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    });
    var upper = [];
    for (var i = uniq.length - 1; i >= 0; i--) {
      var p = uniq[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  /**
   * Soft boundary around the cards themselves. Each point is a centre {x, y, w?, h?}.
   * The outline sits just outside every card edge, with only the corners rounded.
   */
  function looseHull(points, pad) {
    pad = typeof pad === 'number' ? pad : 18;
    var pts = (points || []).filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); });
    if (!pts.length) return '';
    if (pts.length === 1) {
      var only = pts[0];
      var hw = (only.w || 160) / 2 + pad;
      var hh = (only.h || 48) / 2 + pad;
      return roundedHull([
        { x: only.x - hw, y: only.y - hh },
        { x: only.x + hw, y: only.y - hh },
        { x: only.x + hw, y: only.y + hh },
        { x: only.x - hw, y: only.y + hh },
      ], Math.min(16, pad + 4));
    }
    var corners = [];
    pts.forEach(function (p) {
      var hw = (p.w || 160) / 2 + pad;
      var hh = (p.h || 48) / 2 + pad;
      corners.push(
        { x: p.x - hw, y: p.y - hh },
        { x: p.x + hw, y: p.y - hh },
        { x: p.x + hw, y: p.y + hh },
        { x: p.x - hw, y: p.y + hh }
      );
    });
    var hull = convexHull(corners);
    if (hull.length < 3) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      corners.forEach(function (p) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      });
      return ellipsePath((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2);
    }
    return roundedHull(hull, Math.min(22, pad + 8));
  }

  /** Straight sides along the hull, a short curve only at each corner. */
  function roundedHull(pts, radius) {
    var n = pts.length;
    radius = Math.max(4, radius || 0);
    function fmt(v) { return v.toFixed(1); }
    var d = [];
    for (var i = 0; i < n; i++) {
      var prev = pts[(i + n - 1) % n];
      var cur = pts[i];
      var next = pts[(i + 1) % n];
      var v1x = cur.x - prev.x;
      var v1y = cur.y - prev.y;
      var v2x = next.x - cur.x;
      var v2y = next.y - cur.y;
      var l1 = Math.sqrt(v1x * v1x + v1y * v1y) || 1;
      var l2 = Math.sqrt(v2x * v2x + v2y * v2y) || 1;
      var trim = Math.min(radius, l1 / 2.5, l2 / 2.5);
      var sx = cur.x - (v1x / l1) * trim;
      var sy = cur.y - (v1y / l1) * trim;
      var ex = cur.x + (v2x / l2) * trim;
      var ey = cur.y + (v2y / l2) * trim;
      d.push((i === 0 ? 'M' : 'L') + fmt(sx) + ',' + fmt(sy));
      d.push('Q' + fmt(cur.x) + ',' + fmt(cur.y) + ' ' + fmt(ex) + ',' + fmt(ey));
    }
    d.push('Z');
    return d.join(' ');
  }

  global.MindmapModel = {
    LEVELS: LEVELS,
    TASK_RANK: TASK_RANK,
    levelById: levelById,
    rankOf: rankOf,
    normalizeGoals: normalizeGoals,
    ancestors: ancestors,
    contextFlags: contextFlags,
    linkBetween: linkBetween,
    layoutHierarchy: layoutHierarchy,
    EDGE_LABELS: EDGE_LABELS,
    DEP_LABELS: DEP_LABELS,
    PLACE_EDGES: PLACE_EDGES,
    taskPhase: taskPhase,
    relationPhrase: relationPhrase,
    buildGraph: buildGraph,
    isClosed: isClosed,
    findCycles: findCycles,
    wouldCycle: wouldCycle,
    neighbours: neighbours,
    layout: layout,
    LENSES: LENSES,
    lensById: lensById,
    zoomBand: zoomBand,
    normalizeManual: normalizeManual,
    buildGroups: buildGroups,
    applyGroupEdits: applyGroupEdits,
    scene: scene,
    facetsOf: facetsOf,
    orbit: orbit,
    PERSPECTIVES: PERSPECTIVES,
    perspectiveById: perspectiveById,
    perspective: perspective,
    dueBucket: dueBucket,
    looseHull: looseHull,
  };
})(typeof window !== 'undefined' ? window : this);
