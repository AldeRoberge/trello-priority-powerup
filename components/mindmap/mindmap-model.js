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
 * An edge always points from the task to the thing it needs. Dependencies on unknown (deleted or filtered
 * out) cards are dropped; cycles are kept but reported by findCycles().
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

  // Goal hierarchy, highest to smallest. A task is the last level. "serves" edges point from the
  // smaller thing to the bigger one it contributes to (task → project → objective → goal → mission → vision).
  EDGE_LABELS.serves = 'Contribue à';
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
      nodes.push({ id: String(n.id), level: level, name: name });
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
   * Context gaps of a node as [{ id, label }]. Never blocking, standalone work stays legitimate: a task
   * should sit in a project, a project serve an objective, an objective a goal / mission / vision.
   * `graph` is a buildGraph result with the goal nodes shown.
   */
  function contextFlags(graph, id) {
    var byId = Object.create(null);
    graph.nodes.forEach(function (n) {
      byId[n.id] = n;
    });
    var node = byId[id];
    if (!node) return [];
    var rank = rankOf(node);
    var above = ancestors(graph.edges, id).map(function (a) {
      return rankOf(byId[a]);
    });
    var projectRank = levelRank('project');
    var objectiveRank = levelRank('objective');
    if (rank === TASK_RANK && above.indexOf(projectRank) < 0) return [{ id: 'no-project', label: 'Sans projet' }];
    if (rank === projectRank && above.indexOf(objectiveRank) < 0) return [{ id: 'no-objective', label: 'Sans objectif' }];
    if (rank === objectiveRank && !above.length) return [{ id: 'no-goal', label: 'Sans but ni mission' }];
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
    buildGraph: buildGraph,
    isClosed: isClosed,
    findCycles: findCycles,
    wouldCycle: wouldCycle,
    neighbours: neighbours,
    layout: layout,
  };
})(typeof window !== 'undefined' ? window : this);
