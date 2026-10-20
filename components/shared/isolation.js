/*
 * Role: Isolation. One subject (a project, a task, a subtask or a person) stays bright.
 * Every other task fades, in whichever view is open. Documents opens that subject's page.
 * The choice is remembered for this browser tab. No Trello calls except an optional read of the
 * goal map so a project id can be resolved. Exposes window.Isolation.
 */
(function (global) {
  'use strict';

  var KEY = 'trello-priority-powerup/isolation';
  var RANK = { vision: 0, mission: 1, goal: 2, objective: 3, project: 4 };
  var mem = null;
  var world = emptyWorld();
  var lastRows = [];
  var placeCache = null;
  var placeWait = null;
  var roots = [];

  function emptyWorld() {
    return {
      cards: Object.create(null),
      kids: Object.create(null),
      subs: Object.create(null),
      subKids: Object.create(null),
      people: Object.create(null),
      project: Object.create(null),
    };
  }

  function bucket() {
    try {
      if (global.sessionStorage) {
        return {
          get: function () { return global.sessionStorage.getItem(KEY); },
          set: function (v) { global.sessionStorage.setItem(KEY, v); },
          del: function () { global.sessionStorage.removeItem(KEY); },
        };
      }
    } catch (e) { /* private mode: the choice lasts until the next reload */ }
    return {
      get: function () { return mem; },
      set: function (v) { mem = v; },
      del: function () { mem = null; },
    };
  }

  function clean(s, max) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 80);
  }

  function emit(name) {
    var doc = global.document;
    if (!doc || typeof doc.dispatchEvent !== 'function') return;
    try {
      doc.dispatchEvent(new Event(name));
    } catch (e) {
      try { doc.dispatchEvent(global.document.createEvent('Event')); } catch (e2) { /* no DOM */ }
    }
  }

  /** { kind, id, label, cardId } or null. */
  function read() {
    var raw = bucket().get();
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (!o || (o.kind !== 'project' && o.kind !== 'task' && o.kind !== 'subtask' && o.kind !== 'person')) return null;
      var id = clean(o.id, 120);
      if (!id) return null;
      return { kind: o.kind, id: id, label: clean(o.label, 80), cardId: clean(o.cardId, 80) };
    } catch (e) {
      return null;
    }
  }

  function write(scope) {
    if (!scope) {
      bucket().del();
      emit('tp-isolation');
      paintAll();
      return;
    }
    bucket().set(JSON.stringify({
      v: 1,
      kind: scope.kind,
      id: scope.id,
      label: scope.label || '',
      cardId: scope.cardId || '',
    }));
    emit('tp-isolation');
    paintAll();
  }

  function peopleOf(row) {
    var out = [];
    var seen = Object.create(null);
    function add(id, name) {
      id = clean(id, 80);
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push({ id: id, name: clean(name, 80) || id });
    }
    var list = (row && row.assignees) || [];
    list.forEach(function (a) {
      if (!a) return;
      add(a.trelloId || a.id, a.name);
    });
    var custom = row && row.inputs && row.inputs.customAssignees;
    (custom || []).forEach(function (a) {
      if (!a) return;
      if (typeof a === 'string') add(a, a);
      else add(a.id, a.name);
    });
    return out;
  }

  /**
   * cardId → { id, name } of the project above that card in the goal map.
   * Same parent rule as WorkOS: the higher rank is the parent.
   */
  function indexProjects(goals) {
    var nodes = (goals && goals.nodes) || [];
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
    ((goals && goals.links) || []).forEach(function (l) {
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
    var map = Object.create(null);
    Object.keys(parent).forEach(function (id) {
      if (byId[id]) return;
      var c = chain(id);
      var i;
      for (i = 0; i < c.length; i++) {
        if (c[i].level === 'project') {
          map[id] = { id: String(c[i].id), name: c[i].name || '' };
          break;
        }
      }
    });
    return map;
  }

  function mergeProjects(rows, map) {
    if (!map) return rows || [];
    (rows || []).forEach(function (r) {
      if (!r || !r.id) return;
      var p = map[r.id];
      if (!p) return;
      if (!r.projectId) r.projectId = p.id;
      if (!r.project && p.name) r.project = p.name;
    });
    return rows || [];
  }

  /** Rows from a view → who belongs to whom. Checklist lines use the Table id `sub:card:item`. */
  function indexRows(rows) {
    var w = emptyWorld();
    (rows || []).forEach(function (r) {
      if (!r || !r.id) return;
      w.cards[r.id] = true;
      w.project[r.id] = { id: r.projectId || '', name: r.project || '' };
      var set = Object.create(null);
      peopleOf(r).forEach(function (p) { set[p.id] = true; });
      w.people[r.id] = set;
    });
    function walk(items, cardId, parentSub) {
      (items || []).forEach(function (it) {
        if (!it) return;
        var linked = it.linkedCardId != null ? String(it.linkedCardId).trim() : '';
        if (linked && w.cards[linked] && !w.kids[cardId + ':' + linked]) {
          w.kids[cardId + ':' + linked] = true;
          (w.kids[cardId] || (w.kids[cardId] = [])).push(linked);
        }
        if (linked) {
          walk(it.items, cardId, parentSub);
          return;
        }
        var itemId = it.id != null ? String(it.id) : '';
        if (!itemId) return;
        var sid = 'sub:' + cardId + ':' + itemId;
        w.subs[sid] = { cardId: cardId, parentSub: parentSub || '' };
        var bucketKey = parentSub || ('card:' + cardId);
        (w.subKids[bucketKey] || (w.subKids[bucketKey] = [])).push(sid);
        walk(it.items, cardId, sid);
      });
    }
    (rows || []).forEach(function (r) {
      if (r && r.id) walk(r.items, r.id, '');
    });
    return w;
  }

  function descendants(id, kids, into) {
    (kids[id] || []).forEach(function (c) {
      if (into[c]) return;
      into[c] = true;
      descendants(c, kids, into);
    });
  }

  function subsOfCards(cardSet, subKids, into) {
    Object.keys(cardSet).forEach(function (cid) {
      var stack = (subKids['card:' + cid] || []).slice();
      while (stack.length) {
        var s = stack.pop();
        if (into[s]) continue;
        into[s] = true;
        (subKids[s] || []).forEach(function (k) { stack.push(k); });
      }
    });
  }

  /**
   * Which cards and subtasks stay bright.
   * null when nothing is isolated, or when this page cannot see the subject yet
   * (so the whole board does not go dim by mistake).
   */
  function kept(scope, w) {
    if (!scope) return null;
    w = w || emptyWorld();
    var cards = Object.create(null);
    var subs = Object.create(null);
    if (scope.kind === 'project') {
      Object.keys(w.project).forEach(function (id) {
        var p = w.project[id];
        if (!p) return;
        if ((scope.id && p.id === scope.id) || (scope.label && p.name && p.name === scope.label)) cards[id] = true;
      });
      Object.keys(cards).forEach(function (id) { descendants(id, w.kids, cards); });
      subsOfCards(cards, w.subKids, subs);
      if (!Object.keys(cards).length) return null;
    } else if (scope.kind === 'task') {
      if (!w.cards[scope.id]) return null;
      cards[scope.id] = true;
      descendants(scope.id, w.kids, cards);
      subsOfCards(cards, w.subKids, subs);
    } else if (scope.kind === 'person') {
      Object.keys(w.people).forEach(function (id) {
        if (w.people[id][scope.id]) cards[id] = true;
      });
      Object.keys(cards).forEach(function (id) { descendants(id, w.kids, cards); });
      subsOfCards(cards, w.subKids, subs);
      if (!Object.keys(cards).length) return null;
    } else if (scope.kind === 'subtask') {
      var sub = w.subs[scope.id];
      if (!sub) return null;
      cards[sub.cardId] = true;
      subs[scope.id] = true;
      var stack = (w.subKids[scope.id] || []).slice();
      while (stack.length) {
        var s = stack.pop();
        if (subs[s]) continue;
        subs[s] = true;
        (w.subKids[s] || []).forEach(function (k) { stack.push(k); });
      }
    } else return null;
    return { cards: cards, subs: subs };
  }

  function projectByName(name) {
    if (!name) return null;
    var ids = Object.keys(world.project);
    var i;
    for (i = 0; i < ids.length; i++) {
      var p = world.project[ids[i]];
      if (p && p.id && p.name === name) return p;
    }
    return null;
  }

  function same(a, b) {
    return !!(a && b && a.kind === b.kind && a.id === b.id);
  }

  /** The document page this isolation should open. */
  function docTarget(scope) {
    scope = scope || read();
    if (!scope) return null;
    if (scope.kind === 'task') return { kind: 'task', id: scope.id, name: scope.label || '' };
    if (scope.kind === 'subtask') {
      var card = scope.cardId || '';
      if (!card && scope.id.indexOf('sub:') === 0) {
        var parts = scope.id.split(':');
        card = parts.length >= 3 ? parts[1] : '';
      }
      var known = world.subs[scope.id];
      if (known && known.cardId) card = known.cardId;
      return card ? { kind: 'task', id: card, name: '' } : null;
    }
    if (scope.kind === 'project') return { kind: 'project', id: scope.id, name: scope.label || '' };
    if (scope.kind === 'person') return { kind: 'person', id: scope.id, name: scope.label || '' };
    return null;
  }

  function setScope(scope) {
    if (!scope || !scope.kind || !scope.id) return;
    write({
      kind: scope.kind,
      id: clean(scope.id, 120),
      label: clean(scope.label, 80),
      cardId: clean(scope.cardId, 80),
    });
  }

  function clear() { write(null); }

  /**
   * Right-click entries. ctx: { cardId, cardName, subId, subName, projectId, projectName, people }.
   * A project id is filled from the goal map when only the name is known.
   */
  function menuItems(ctx) {
    ctx = ctx || {};
    var cur = read();
    var children = [];
    function add(scope, label, icon) {
      if (!scope || !scope.id) return;
      var on = same(cur, scope);
      children.push({
        icon: icon,
        label: label,
        checked: on,
        action: function () { if (on) clear(); else setScope(scope); },
      });
    }
    if (ctx.cardId) add({ kind: 'task', id: ctx.cardId, label: ctx.cardName || '' }, 'Cette tâche', 'checkbox');
    if (ctx.subId) {
      add({
        kind: 'subtask',
        id: ctx.subId,
        label: ctx.subName || '',
        cardId: ctx.cardId || '',
      }, 'Cette sous-tâche', 'subtask');
    }
    var proj = null;
    if (ctx.projectId) proj = { id: ctx.projectId, name: ctx.projectName || '' };
    else if (ctx.cardId && world.project[ctx.cardId] && world.project[ctx.cardId].id) proj = world.project[ctx.cardId];
    else if (ctx.projectName) proj = projectByName(ctx.projectName);
    if (proj && proj.id) {
      var pname = proj.name || ctx.projectName || 'Ce projet';
      add({ kind: 'project', id: proj.id, label: pname }, pname === 'Ce projet' ? pname : 'Projet « ' + pname + ' »', 'stack-2');
    }
    (ctx.people || []).forEach(function (p) {
      if (!p || !p.id) return;
      add({ kind: 'person', id: p.id, label: p.name || '' }, p.name || 'Cette personne', 'user');
    });
    if (!children.length && !cur) return [];
    var items = [];
    if (children.length) items.push({ sep: true }, { icon: 'focus-2', label: 'Isoler', children: children });
    if (cur) items.push({ icon: 'circle-x', label: 'Quitter l’isolation', action: function () { clear(); } });
    return items;
  }

  function setWorld(rows) {
    lastRows = rows || [];
    world = indexRows(lastRows);
    paintAll();
  }

  /**
   * Remember these rows and, once, the goal map, so a project isolation can find its cards.
   * `goals` skips the load when the view already has the map.
   */
  function adopt(t, rows, goals) {
    lastRows = rows || [];
    if (goals && (goals.nodes || goals.links)) placeCache = indexProjects(goals);
    if (placeCache) mergeProjects(lastRows, placeCache);
    setWorld(lastRows);
    if (placeCache || placeWait || !t) return;
    var goalsApi = global.MindmapGoalsTrello;
    if (!goalsApi || typeof goalsApi.load !== 'function') return;
    placeWait = Promise.resolve()
      .then(function () { return goalsApi.load(t); })
      .then(function (g) {
        placeCache = indexProjects(g || {});
        mergeProjects(lastRows, placeCache);
        setWorld(lastRows);
        emit('tp-isolation-world');
      }, function () {
        placeCache = Object.create(null);
      });
  }

  function keepsProject(scope, k, id, name) {
    if (scope.kind === 'project') {
      if (id && scope.id && id === scope.id) return true;
      if (name && scope.label && name === scope.label) return true;
      return false;
    }
    var any = false;
    var hit = false;
    Object.keys(k.cards).forEach(function (cid) {
      var p = world.project[cid];
      if (!p || (!p.id && !p.name)) return;
      any = true;
      if ((id && p.id === id) || (name && p.name === name)) hit = true;
    });
    return !any || hit;
  }

  function paintRoot(root) {
    if (!root || !root.querySelectorAll) return;
    var scope = read();
    var k = scope ? kept(scope, world) : null;
    var nodes = root.querySelectorAll('[data-iso-card], [data-iso-sub], [data-iso-project], [data-iso-person], .kb-card[data-id], .gantt-row[data-card-id], [data-card]');
    var i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var on = true;
      if (k) {
        var sub = el.getAttribute('data-iso-sub');
        var person = el.getAttribute('data-iso-person');
        var project = el.getAttribute('data-iso-project');
        if (sub) on = !!k.subs[sub];
        else if (person) on = scope.kind !== 'person' || person === scope.id;
        else if (project) on = keepsProject(scope, k, project, el.getAttribute('data-iso-label') || '');
        else {
          var id = el.getAttribute('data-iso-card') || el.getAttribute('data-card') || el.getAttribute('data-card-id') || '';
          if (!id && el.classList && el.classList.contains('kb-card')) id = el.getAttribute('data-id') || '';
          on = !id || !!k.cards[id];
        }
      }
      if (el.classList) el.classList.toggle('iso-out', !!(k && !on));
    }
  }

  function paintAll() {
    roots.forEach(paintRoot);
  }

  function observe(root) {
    if (!root || roots.indexOf(root) >= 0) return;
    roots.push(root);
    var pending = false;
    function schedule() {
      if (pending) return;
      pending = true;
      var raf = global.requestAnimationFrame || function (fn) { fn(); };
      raf(function () {
        pending = false;
        paintRoot(root);
      });
    }
    if (typeof global.MutationObserver === 'function') {
      var mo = new global.MutationObserver(schedule);
      mo.observe(root, { childList: true, subtree: true });
    }
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener('tp-isolation', schedule);
      global.document.addEventListener('tp-isolation-world', schedule);
    }
    schedule();
  }

  function mountChip(parent) {
    if (!parent || parent.querySelector('.vt-iso')) return;
    var btn = global.document.createElement('button');
    btn.type = 'button';
    btn.className = 'vt-iso';
    btn.title = 'Quitter l’isolation';
    btn.hidden = true;
    btn.addEventListener('click', function () { clear(); });
    function paint() {
      var s = read();
      btn.hidden = !s;
      btn.textContent = '';
      if (!s) return;
      var icon = global.document.createElement('i');
      icon.className = 'ti ti-focus-2';
      icon.setAttribute('aria-hidden', 'true');
      var label = global.document.createElement('span');
      label.className = 'vt-iso-label';
      label.textContent = s.label || (s.kind === 'project' ? 'Projet' : s.kind === 'person' ? 'Personne' : 'Tâche');
      var x = global.document.createElement('i');
      x.className = 'ti ti-x vt-iso-x';
      x.setAttribute('aria-hidden', 'true');
      btn.appendChild(icon);
      btn.appendChild(label);
      btn.appendChild(x);
    }
    if (parent.firstChild) parent.insertBefore(btn, parent.firstChild);
    else parent.appendChild(btn);
    if (global.document.addEventListener) global.document.addEventListener('tp-isolation', paint);
    paint();
  }

  global.Isolation = {
    read: read,
    set: setScope,
    clear: clear,
    peopleOf: peopleOf,
    indexProjects: indexProjects,
    indexRows: indexRows,
    kept: kept,
    docTarget: docTarget,
    menuItems: menuItems,
    setWorld: setWorld,
    adopt: adopt,
    observe: observe,
    mountChip: mountChip,
    paint: paintRoot,
  };
})(typeof window !== 'undefined' ? window : this);
