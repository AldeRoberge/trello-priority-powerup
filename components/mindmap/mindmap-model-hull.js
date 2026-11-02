/**
 * mindmap-model: part 2 of 2 (buildGroups).
 * Names are shared with the other parts through window.MindmapModelParts (see mindmap-model.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.MindmapModelParts = global.MindmapModelParts || {});

  // from earlier parts (values)
  var DEP_LABELS = S.DEP_LABELS;
  var EDGE_LABELS = S.EDGE_LABELS;
  var LENSES = S.LENSES;
  var LEVELS = S.LEVELS;
  var PLACE_EDGES = S.PLACE_EDGES;
  var TASK_RANK = S.TASK_RANK;

  // from other parts (functions, resolved at call time)
  function ancestors() { return S.ancestors.apply(this, arguments); }
  function buildGraph() { return S.buildGraph.apply(this, arguments); }
  function categoryFromList() { return S.categoryFromList.apply(this, arguments); }
  function collectDesc() { return S.collectDesc.apply(this, arguments); }
  function contextFlags() { return S.contextFlags.apply(this, arguments); }
  function findCycles() { return S.findCycles.apply(this, arguments); }
  function finishGroups() { return S.finishGroups.apply(this, arguments); }
  function hueOfText() { return S.hueOfText.apply(this, arguments); }
  function isClosed() { return S.isClosed.apply(this, arguments); }
  function layout() { return S.layout.apply(this, arguments); }
  function layoutHierarchy() { return S.layoutHierarchy.apply(this, arguments); }
  function lensById() { return S.lensById.apply(this, arguments); }
  function levelById() { return S.levelById.apply(this, arguments); }
  function levelRank() { return S.levelRank.apply(this, arguments); }
  function linkBetween() { return S.linkBetween.apply(this, arguments); }
  function looseLabel() { return S.looseLabel.apply(this, arguments); }
  function makeGroup() { return S.makeGroup.apply(this, arguments); }
  function neighbours() { return S.neighbours.apply(this, arguments); }
  function normalizeGoals() { return S.normalizeGoals.apply(this, arguments); }
  function normalizeManual() { return S.normalizeManual.apply(this, arguments); }
  function rankOf() { return S.rankOf.apply(this, arguments); }
  function relationPhrase() { return S.relationPhrase.apply(this, arguments); }
  function servesIndex() { return S.servesIndex.apply(this, arguments); }
  function taskPhase() { return S.taskPhase.apply(this, arguments); }
  function wouldCycle() { return S.wouldCycle.apply(this, arguments); }
  function zoomBand() { return S.zoomBand.apply(this, arguments); }

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

  // exports
  S.PERSPECTIVES = PERSPECTIVES;
  S.STATUS_COLUMNS = STATUS_COLUMNS;
  S.TIME_COLUMNS = TIME_COLUMNS;
  S.applyGroupEdits = applyGroupEdits;
  S.autoOpen = autoOpen;
  S.buildGroups = buildGroups;
  S.convexHull = convexHull;
  S.dueBucket = dueBucket;
  S.ellipsePath = ellipsePath;
  S.facetsOf = facetsOf;
  S.looseHull = looseHull;
  S.orbit = orbit;
  S.perspective = perspective;
  S.perspectiveById = perspectiveById;
  S.roundedHull = roundedHull;
  S.scene = scene;
  S.statusBucket = statusBucket;
})(typeof window !== 'undefined' ? window : this);
