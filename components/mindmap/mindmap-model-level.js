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

/**
 * mindmap-model: part 1 of 2 (level).
 * Names are shared with the other parts through window.MindmapModelParts (see mindmap-model.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.MindmapModelParts = global.MindmapModelParts || {});

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
      if (level === 'project' && typeof n.priority === 'number' && isFinite(n.priority)) {
        node.priority = Math.round(Math.max(0, Math.min(10, n.priority)) * 10) / 10;
      }
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

  // exports
  S.DEP_INVERSE = DEP_INVERSE;
  S.DEP_LABELS = DEP_LABELS;
  S.EDGE_LABELS = EDGE_LABELS;
  S.LENSES = LENSES;
  S.LEVELS = LEVELS;
  S.LEVEL_ALIASES = LEVEL_ALIASES;
  S.PHASE_VERBS = PHASE_VERBS;
  S.PLACE_EDGES = PLACE_EDGES;
  S.TASK_RANK = TASK_RANK;
  S.ancestors = ancestors;
  S.buildGraph = buildGraph;
  S.categoryFromList = categoryFromList;
  S.cleanIcon = cleanIcon;
  S.collectDesc = collectDesc;
  S.contextFlags = contextFlags;
  S.countTasks = countTasks;
  S.findCycles = findCycles;
  S.finishGroups = finishGroups;
  S.foldList = foldList;
  S.hueOfText = hueOfText;
  S.isClosed = isClosed;
  S.layout = layout;
  S.layoutHierarchy = layoutHierarchy;
  S.lensById = lensById;
  S.levelById = levelById;
  S.levelRank = levelRank;
  S.linkBetween = linkBetween;
  S.looseLabel = looseLabel;
  S.makeGroup = makeGroup;
  S.neighbours = neighbours;
  S.normalizeGoals = normalizeGoals;
  S.normalizeManual = normalizeManual;
  S.placeRefs = placeRefs;
  S.rankOf = rankOf;
  S.relationPhrase = relationPhrase;
  S.servesIndex = servesIndex;
  S.taskPhase = taskPhase;
  S.wouldCycle = wouldCycle;
  S.zoomBand = zoomBand;
})(typeof window !== 'undefined' ? window : this);
