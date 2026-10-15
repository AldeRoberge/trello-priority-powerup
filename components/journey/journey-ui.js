/*
 * Role: Journey screen. The map is context (missions, projects, dependencies).
 * The queue is direction (a few actions, each with a reason that comes from the data).
 *
 *   JourneyUI.mount(container, t, { load })
 *     load() optional -> { lists, cards, settings, goals }
 */
(function (global) {
  'use strict';

  var ZOOMS = [
    { id: 'overview', label: 'Carte' },
    { id: 'project', label: 'Projet' },
    { id: 'task', label: 'Tâche' },
  ];

  function JM() { return global.JourneyModel; }
  function GT() { return global.GanttTrello; }
  function CT() { return global.CompletionTrello; }
  function PT() { return global.PriorityTrello; }
  function GG() { return global.MindmapGoalsTrello; }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function icon(name) {
    var i = document.createElement('i');
    i.className = 'ti ti-' + name;
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function svgEl(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
  }

  function shortDay(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    if (!m) return '';
    var months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    var label = (+m[3]) + ' ' + months[+m[2] - 1];
    if (+m[1] !== new Date().getFullYear()) label += ' ' + m[1];
    return label;
  }

  function countLabel(c) {
    if (!c) return '';
    var bits = [];
    if (c.open) bits.push(c.open + (c.open > 1 ? ' ouvertes' : ' ouverte'));
    if (c.waiting) bits.push(c.waiting + ' en attente');
    if (c.blocked) bits.push(c.blocked + (c.blocked > 1 ? ' bloquées' : ' bloquée'));
    if (c.done) bits.push(c.done + (c.done > 1 ? ' faites' : ' faite'));
    return bits.join(' · ');
  }

  function levelIcon(level) {
    var levels = (JM() && JM().LEVELS) || [];
    for (var i = 0; i < levels.length; i++) if (levels[i].id === level) return levels[i].icon;
    return 'flag-3';
  }

  function taskIcon(state, here) {
    if (state === 'done') return 'check';
    if (state === 'blocked') return 'player-pause';
    if (state === 'waiting') return 'lock';
    if (here) return 'map-pin';
    return 'circle';
  }

  function mount(container, t, opts) {
    if (!container || !JM()) return null;
    opts = opts || {};
    var state = {
      board: { lists: [], cards: [], settings: null, goals: { nodes: [], links: [] } },
      zoom: 'overview',
      focus: null,
      selected: null,
      query: '',
      hideDone: global.HideDone ? global.HideDone.get() : true,
      toast: '',
      toastToken: 0,
      undo: [],
      busy: false,
      loading: true,
      status: '',
      authGoals: null,
      gen: 0,
      didHl: false,
      scrollTo: null,
      view: null,
      fitNext: false,
      selectedEdge: null,
      pos: {},
    };
    var live = null;
    state.pos = loadPos();

    if (global.HideDone && global.HideDone.subscribe) {
      global.HideDone.subscribe(function (on) {
        state.hideDone = on;
        paint();
      });
    }

    function recOf(id) {
      var cards = state.board.cards || [];
      for (var i = 0; i < cards.length; i++) if (cards[i] && String(cards[i].id) === String(id)) return cards[i];
      return null;
    }

    function toast(text) {
      state.toast = text || '';
      var token = ++state.toastToken;
      paint();
      if (!text) return;
      setTimeout(function () {
        if (state.toastToken !== token) return;
        state.toast = '';
        paint();
      }, 4000);
    }

    async function reload() {
      var mine = ++state.gen;
      try {
        var data = opts.load ? await opts.load() : await loadBoard();
        if (mine !== state.gen) return;
        state.board = data || state.board;
        state.status = '';
        if (!state.didHl && global.location) {
          var hl = new URLSearchParams(global.location.search).get('hl');
          if (hl && recOf(hl)) {
            state.didHl = true;
            state.selected = hl;
            state.focus = hl;
            state.zoom = 'task';
            state.scrollTo = hl;
          }
        }
      } catch (e) {
        if (mine !== state.gen) return;
        state.status = 'Impossible de charger';
      }
      if (mine === state.gen) {
        state.loading = false;
        paint();
      }
    }

    async function loadBoard() {
      var board = await GT().loadBoard(t);
      var goals = { nodes: [], links: [] };
      var gg = GG();
      if (gg && typeof gg.isAuthorized === 'function') {
        try {
          state.authGoals = !!(await gg.isAuthorized(t));
          if (state.authGoals && typeof gg.load === 'function') goals = (await gg.load(t)) || goals;
        } catch (e) {
          state.authGoals = false;
        }
      }
      return {
        lists: (board && board.lists) || [],
        cards: (board && board.cards) || [],
        settings: board && board.settings,
        goals: goals,
      };
    }

    function listsForNew() {
      var cats = (state.board.settings && state.board.settings.listCategories) || {};
      var match = global.StatutMatch;
      return (state.board.lists || []).filter(function (l) { return l && l.id; }).map(function (l) {
        var category = cats[String(l.id)] || '';
        var style = match && match.categoryStyle ? match.categoryStyle(category || '_none') : null;
        return { id: l.id, name: l.name || '', category: category, color: style && style.color };
      });
    }

    function openListId() {
      var lists = listsForNew();
      for (var i = 0; i < lists.length; i++) {
        if (lists[i].category !== 'completed' && lists[i].category !== 'canceled') return lists[i].id;
      }
      return lists[0] ? lists[0].id : '';
    }

    function completedListId() {
      var cats = (state.board.settings && state.board.settings.listCategories) || {};
      var lists = state.board.lists || [];
      for (var i = 0; i < lists.length; i++) {
        if (lists[i] && cats[String(lists[i].id)] === 'completed') return lists[i].id;
      }
      return null;
    }

    async function authorize() {
      var gt = GT();
      if (gt && typeof gt.ensureRestAuthorized === 'function') {
        var res = await gt.ensureRestAuthorized(t);
        if (res && res.ok === false) return false;
      }
      return true;
    }

    function remember(label, run) {
      state.undo.push({ label: label, run: run });
      if (state.undo.length > 20) state.undo.shift();
    }

    async function complete(id) {
      if (state.busy) return;
      var rec = recOf(id);
      var ct = CT();
      var pt = PT();
      if (!rec || !ct || !pt) return;
      state.busy = true;
      try {
        if (!(await authorize())) { toast('Autorisation requise'); state.busy = false; return; }
        var prev = typeof ct.getCardCompletionById === 'function' ? await ct.getCardCompletionById(t, id) : { items: [] };
        var next = typeof ct.markFullyComplete === 'function' ? ct.markFullyComplete(prev) : prev;
        if (typeof ct.saveCardCompletionById === 'function') await ct.saveCardCompletionById(t, id, next);
        var body = { dueComplete: true };
        var listId = completedListId();
        if (listId && listId !== rec.listId) body.idList = listId;
        if (typeof pt.restPutCard === 'function') await pt.restPutCard(t, id, body);
        var beforeList = rec.listId;
        var beforeDue = !!rec.dueComplete;
        remember(rec.name, async function () {
          if (typeof ct.saveCardCompletionById === 'function') await ct.saveCardCompletionById(t, id, prev);
          if (typeof pt.restPutCard === 'function') {
            await pt.restPutCard(t, id, { dueComplete: beforeDue, idList: beforeList });
          }
        });
        toast('Terminée');
        await reload();
      } catch (e) {
        toast('Pas enregistré');
      }
      state.busy = false;
    }

    async function toggleBlock(id) {
      if (state.busy) return;
      var rec = recOf(id);
      var gt = GT();
      if (!rec || !gt || typeof gt.setCardBlocked !== 'function') return;
      state.busy = true;
      var next = !rec.blocked;
      try {
        if (!(await authorize())) { toast('Autorisation requise'); state.busy = false; return; }
        var res = await gt.setCardBlocked(t, id, next);
        if (!res || res.ok === false) throw new Error('block');
        remember(rec.name, async function () { await gt.setCardBlocked(t, id, !next); });
        toast(next ? 'Bloquée' : 'Débloquée');
        await reload();
      } catch (e) {
        toast('Pas enregistré');
      }
      state.busy = false;
    }

    async function archive(id) {
      if (state.busy) return;
      var rec = recOf(id);
      var tt = global.TableTrello;
      if (!rec || !tt || typeof tt.archiveCard !== 'function') return;
      state.busy = true;
      try {
        if (!(await authorize())) { toast('Autorisation requise'); state.busy = false; return; }
        await tt.archiveCard(t, id);
        remember(rec.name, async function () {
          if (typeof tt.unarchiveCard === 'function') await tt.unarchiveCard(t, id);
        });
        toast('Archivée');
        await reload();
      } catch (e) {
        toast('Pas enregistré');
      }
      state.busy = false;
    }

    function openCard(id) {
      var rec = recOf(id);
      var pt = PT();
      if (!rec || !t || typeof t.modal !== 'function' || !pt) return;
      t.modal({
        title: rec.name || 'Carte',
        url: pt.pageUrl('./popup.html'),
        args: { cardId: rec.id, cardName: rec.name || '', openSection: null },
        fullscreen: true,
        accentColor: '#22272B',
        callback: function () {
          return t.modal({
            title: 'Parcours',
            url: pt.pageUrl('./journey.html'),
            fullscreen: true,
            accentColor: '#22272B',
          });
        },
      });
    }

    function goView(page, id) {
      if (!global.ViewTabs || !global.location) return;
      global.location.assign(global.ViewTabs.hrefForCard(page, global.location, id));
    }

    function createUnder(goal) {
      if (!global.NewCard || typeof global.NewCard.open !== 'function') return;
      var lists = listsForNew();
      if (!lists.length) return;
      global.NewCard.open({
        t: t,
        lists: lists,
        listId: openListId(),
        onCreated: function (res) {
          var cardId = res && res.cardId;
          if (!cardId || !goal || goal.kind === 'bucket') { reload(); return; }
          linkTask(cardId, goal.id).then(function () { reload(); }, function () { reload(); });
        },
        onError: function () { toast('Pas créée'); },
      });
    }

    function linkTask(cardId, goalId) {
      var gg = GG();
      if (!gg || typeof gg.save !== 'function') return Promise.resolve();
      var goals = state.board.goals || { nodes: [], links: [] };
      var link = { from: 't:' + cardId, to: goalId };
      var already = (goals.links || []).some(function (l) {
        return l && l.from === link.from && l.to === link.to;
      });
      if (already) return Promise.resolve();
      return gg.save(t, {
        nodes: goals.nodes || [],
        links: (goals.links || []).concat([link]),
      });
    }

    function connectGoals() {
      var gg = GG();
      if (!gg || typeof gg.authorize !== 'function') return;
      gg.authorize(t).then(function () { reload(); }, function () { toast('Pas enregistré'); });
    }

    async function undo() {
      var entry = state.undo.pop();
      if (!entry) return;
      state.busy = true;
      try {
        await entry.run();
        state.toast = '';
        await reload();
      } catch (e) {
        toast('Pas annulé');
      }
      state.busy = false;
    }

    function onKey(e) {
      if (!container.isConnected) return;
      var typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey && !typing) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === '/' && !typing) {
        e.preventDefault();
        var box = container.querySelector('.jy-search');
        if (box) box.focus();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && state.selectedEdge) {
        e.preventDefault();
        removeSelectedEdge();
        return;
      }
      if (e.key === 'Escape' && !typing) {
        if (state.selectedEdge) { state.selectedEdge = null; paint(); return; }
        if (state.query) { state.query = ''; paint(); return; }
        if (state.zoom !== 'overview' || state.focus || state.selected) {
          state.zoom = 'overview';
          state.focus = null;
          state.selected = null;
          paint();
        }
      }
    }
    document.addEventListener('keydown', onKey);

    function selectNode(id, zoom) {
      state.selected = id;
      state.focus = id;
      if (zoom) state.zoom = zoom;
      state.scrollTo = id;
      paint();
    }

    function menuFor(id, anchor, point) {
      if (!global.ContextMenu) return;
      var rec = recOf(id);
      var node = JM().prepare(state.board.cards, state.board.goals).byId[id];
      if (!node) return;
      var items = [];
      if (rec) {
        items.push({ id: 'open', label: 'Ouvrir', icon: 'external-link', action: function () { openCard(id); } });
        if (node && JM().isClosed && !JM().isClosed(rec)) {
          items.push({ id: 'done', label: 'Terminer', icon: 'check', action: function () { complete(id); } });
        }
        items.push({
          id: 'block',
          label: rec.blocked ? 'Débloquer' : 'Bloquer',
          icon: 'player-pause',
          action: function () { toggleBlock(id); },
        });
        if (global.CardFields) {
          items.push({ sep: true });
          ['priority', 'due', 'estimate', 'progress', 'blocked'].forEach(function (kind) {
            var labels = { priority: 'Priorité', due: 'Échéance', estimate: 'Effort', progress: 'Progrès', blocked: 'Blocage' };
            items.push({
              id: kind,
              label: labels[kind],
              action: function () { global.CardFields.open(kind, { t: t, cardId: id, anchor: anchor }); },
            });
          });
        }
        items.push({ sep: true });
        items.push({
          id: 'views',
          label: 'Ouvrir dans',
          icon: 'layout-grid',
          children: [
            { id: 'table', label: 'Tableau', action: function () { goView('./table.html', id); } },
            { id: 'gantt', label: 'Gantt', action: function () { goView('./gantt.html', id); } },
            { id: 'kanban', label: 'Kanban', action: function () { goView('./kanban.html', id); } },
            { id: 'mindmap', label: 'Mindmap', action: function () { goView('./mindmap.html', id); } },
          ],
        });
        if (global.TableTrello && global.TableTrello.archiveCard) {
          items.push({ sep: true });
          items.push({ id: 'archive', label: 'Archiver', icon: 'archive', danger: true, action: function () { archive(id); } });
        }
      } else if (node.kind === 'goal') {
        items.push({ id: 'add', label: 'Nouvelle tâche', icon: 'plus', action: function () { createUnder(node); } });
      }
      if (items.length) global.ContextMenu.show(point, items);
    }

    function paint() {
      live = null;
      var search = container.querySelector('.jy-search');
      var keepFocus = search && document.activeElement === search;
      var caret = keepFocus ? search.selectionStart : null;
      container.textContent = '';
      var empty = !(state.board.cards && state.board.cards.length);
      if (state.loading && empty) {
        container.innerHTML = global.Skeleton.html('journey');
        return;
      }
      if (state.status && empty) {
        container.appendChild(el('div', 'jy-status', state.status));
        return;
      }

      var now = new Date();
      var graph = JM().prepare(state.board.cards, state.board.goals);
      var full = JM().nextActions(graph, { now: now, limit: 10000, blockedLimit: 10000 });
      var here = full.now[0] ? full.now[0].id : null;
      var view = JM().layout(graph, {
        zoom: state.zoom,
        focus: state.focus,
        hideDone: state.hideDone,
        query: state.query,
        now: now,
        hereId: here,
      });
      var byPos = Object.create(null);
      view.nodes.forEach(function (n) {
        var p = state.pos[n.id];
        if (p && isFinite(p.x) && isFinite(p.y)) { n.x = p.x; n.y = p.y; }
        byPos[n.id] = n;
      });

      var root = el('div', 'jy');
      root.appendChild(bar(graph));
      var body = el('div', 'jy-body');
      var stage = el('div', 'jy-stage');
      stage.appendChild(mapOf(graph, view, byPos));
      stage.appendChild(detail(graph, full));
      body.appendChild(stage);
      body.appendChild(queue(full, here));
      root.appendChild(body);
      container.appendChild(root);
      global.Skeleton.remember('journey', { nodes: view.nodes.length, now: Math.min(full.now.length, 10), blocked: Math.min(full.blocked.length, 6) });

      if (keepFocus) {
        var again = container.querySelector('.jy-search');
        if (again) {
          again.focus();
          if (caret != null && again.setSelectionRange) again.setSelectionRange(caret, caret);
        }
      }
      settleView();
    }

    function bar(graph) {
      var row = el('div', 'jy-bar');
      var search = el('input', 'jy-search tp-search-input');
      search.type = 'search';
      search.placeholder = 'Filtrer…';
      search.value = state.query;
      search.setAttribute('aria-label', 'Filtrer');
      search.addEventListener('input', function () {
        state.query = search.value;
        state.fitNext = true;
        paint();
      });
      var searchBox = el('label', 'tp-search');
      searchBox.appendChild(icon('search'));
      searchBox.appendChild(search);
      row.appendChild(searchBox);

      var zoom = el('div', 'jy-zoom');
      zoom.setAttribute('role', 'group');
      zoom.setAttribute('aria-label', 'Niveau');
      ZOOMS.forEach(function (z) {
        var b = el('button', state.zoom === z.id ? 'is-on' : '', z.label);
        b.type = 'button';
        b.setAttribute('aria-pressed', state.zoom === z.id ? 'true' : 'false');
        b.addEventListener('click', function () {
          state.zoom = z.id;
          if (z.id === 'overview') { state.focus = null; }
          if (z.id === 'task' && state.selected && graph.byId[state.selected] && graph.byId[state.selected].kind === 'task') {
            state.focus = state.selected;
          }
          state.fitNext = true;
          paint();
        });
        zoom.appendChild(b);
      });
      row.appendChild(zoom);

      var eye = el('button', 'jy-iconbtn' + (state.hideDone ? '' : ' is-quiet'));
      eye.type = 'button';
      eye.title = global.HideDone ? global.HideDone.title(state.hideDone) : 'Terminées';
      eye.appendChild(icon(global.HideDone ? global.HideDone.icon(state.hideDone) : 'eye-off'));
      eye.addEventListener('click', function () {
        state.hideDone = global.HideDone ? global.HideDone.toggle() : !state.hideDone;
        paint();
      });
      row.appendChild(eye);

      var tidy = el('button', 'jy-iconbtn' + (Object.keys(state.pos).length ? '' : ' is-quiet'));
      tidy.type = 'button';
      tidy.title = 'Réorganiser';
      tidy.setAttribute('aria-label', 'Réorganiser');
      tidy.appendChild(icon('sitemap'));
      tidy.addEventListener('click', function () { resetPos(); });
      row.appendChild(tidy);

      if (state.authGoals === false) {
        var flag = el('button', 'jy-iconbtn is-quiet');
        flag.type = 'button';
        flag.title = 'Objectifs';
        flag.appendChild(icon('flag-3'));
        flag.addEventListener('click', connectGoals);
        row.appendChild(flag);
      }

      var crumb = el('div', 'jy-crumb');
      var home = el('button', '', 'Carte');
      home.type = 'button';
      home.addEventListener('click', function () {
        state.zoom = 'overview';
        state.focus = null;
        state.selected = null;
        state.fitNext = true;
        paint();
      });
      crumb.appendChild(home);
      var trailId = state.focus || state.selected;
      if (trailId && graph.byId[trailId]) {
        JM().chain(graph, trailId).forEach(function (step) {
          crumb.appendChild(el('span', '', '/'));
          var b = el('button', '', step.name);
          b.type = 'button';
          b.addEventListener('click', function () { selectNode(step.id, 'project'); });
          crumb.appendChild(b);
        });
      }
      row.appendChild(crumb);

      var key = el('div', 'jy-key');
      key.appendChild(keyItem('', 'Contribue'));
      key.appendChild(keyItem('is-needs', 'Nécessite'));
      key.appendChild(keyItem('is-after', 'Ensuite'));
      key.appendChild(keyItem('is-cross', 'Aussi'));
      row.appendChild(key);
      return row;
    }

    function keyItem(cls, label) {
      var s = el('span', '');
      var sw = el('i', 'jy-swatch' + (cls ? ' ' + cls : ''));
      s.appendChild(sw);
      s.appendChild(document.createTextNode(label));
      return s;
    }

    function GC() { return global.GraphCanvas; }

    /* ── Map: shared GraphCanvas (pan, zoom, move boxes, drag links), same behaviour as the Mindmap ─────────── */
    function mapOf(graph, view, byPos) {
      var gcm = GC();
      var wrap = el('div', 'jy-map');
      var pct = el('span', 'jy-zoomtools-pct', state.view ? Math.round(state.view.k * 100) + ' %' : '100 %');
      var nodeEls = Object.create(null);
      var refs = Object.create(null);
      var handles = [];
      var gc = gcm.create(wrap, {
        view: state.view || undefined,
        onView: function (v) {
          state.view = v;
          pct.textContent = Math.round(v.k * 100) + ' %';
        },
        onBackground: function (target) {
          var w = target && target.closest && target.closest('.jy-wire');
          if (w) selectEdge(w.getAttribute('data-id'));
          else if (state.selectedEdge) selectEdge(null);
        },
      });

      function nodeIds(e) { return [e.from, e.to]; }

      function drawEdge(ref) {
        var a = byPos[ref.e.from];
        var b = byPos[ref.e.to];
        if (!a || !b) return;
        var w = gcm.wireBetween(a, b);
        var dist = Math.sqrt(Math.pow(w.p2.x - w.p1.x, 2) + Math.pow(w.p2.y - w.p1.y, 2));
        var j = gcm.arrowJoin(w.p2, dist);
        ref.line.setAttribute('d', gcm.wirePath(w.p1, { x: j.base.x, y: j.base.y, nx: j.base.nx, ny: j.base.ny }));
        ref.hit.setAttribute('d', w.d);
        ref.arrow.setAttribute('d', j.d);
        ref.ends = [w.p1, w.p2];
      }

      view.edges.forEach(function (e) {
        if (!byPos[e.from] || !byPos[e.to]) return;
        var g = svgEl('g');
        g.setAttribute('class', edgeClass(e, graph) + (state.selectedEdge === e.id ? ' is-selected' : ''));
        g.setAttribute('data-id', e.id);
        var hit = svgEl('path');
        hit.setAttribute('class', 'jy-edge-hit');
        var line = svgEl('path');
        line.setAttribute('class', 'jy-edge');
        var arrow = svgEl('path');
        arrow.setAttribute('class', 'jy-arrow');
        g.appendChild(hit);
        g.appendChild(line);
        g.appendChild(arrow);
        gc.svg.appendChild(g);
        refs[e.id] = { e: e, g: g, hit: hit, line: line, arrow: arrow, ends: null };
        drawEdge(refs[e.id]);
      });

      function redrawAround(id) {
        Object.keys(refs).forEach(function (k) {
          if (nodeIds(refs[k].e).indexOf(id) >= 0) drawEdge(refs[k]);
        });
        drawHandles();
      }

      function mark(id) {
        Object.keys(nodeEls).forEach(function (k) { nodeEls[k].classList.toggle('is-drop-target', k === id); });
      }

      function targetFor(selfId) {
        return function (elAt) {
          var hit = elAt && elAt.closest && elAt.closest('.jy-node');
          var id = hit && hit.getAttribute('data-id');
          return id && id !== selfId && id !== JM().ORPHAN_ID ? id : null;
        };
      }

      function pinWire(ev, n, side) {
        gc.wire(ev, {
          from: gcm.anchor(n, side),
          targetAt: targetFor(n.id),
          anchorFor: function (id) {
            var tn = byPos[id];
            return tn ? gcm.anchor(tn, gcm.facing(n, tn)[1]) : null;
          },
          onTarget: mark,
          onDrop: function (id) { linkFromPin(graph, n, side, id); },
        });
      }

      /** Two grab handles on the ends of the selected link: drag one onto another box to move that end. */
      function drawHandles() {
        handles.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
        handles = [];
        var ref = state.selectedEdge && refs[state.selectedEdge];
        if (!ref || !ref.ends || (ref.e.kind !== 'depends' && ref.e.kind !== 'serves') || ref.e.to === JM().ORPHAN_ID) return;
        ['from', 'to'].forEach(function (end, i) {
          var c = svgEl('circle');
          c.setAttribute('class', 'jy-handle');
          c.setAttribute('r', '7');
          c.setAttribute('cx', ref.ends[i].x.toFixed(1));
          c.setAttribute('cy', ref.ends[i].y.toFixed(1));
          var tip = svgEl('title');
          tip.textContent = 'Glisser sur une autre boîte pour déplacer ce bout du lien';
          c.appendChild(tip);
          c.addEventListener('pointerdown', function (ev) {
            var e = ref.e;
            var fixed = byPos[end === 'to' ? e.from : e.to];
            var other = byPos[end === 'to' ? e.to : e.from];
            if (!fixed || !other) return;
            gc.wire(ev, {
              from: gcm.anchor(fixed, gcm.facing(fixed, other)[0]),
              targetAt: targetFor(fixed.id),
              anchorFor: function (id) {
                var tn = byPos[id];
                return tn ? gcm.anchor(tn, gcm.facing(fixed, tn)[1]) : null;
              },
              onTarget: mark,
              onDrop: function (id) { moveEnd(graph, e, end, id); },
            });
          });
          gc.svg.appendChild(c);
          handles.push(c);
        });
      }

      function selectEdge(id) {
        state.selectedEdge = id || null;
        Object.keys(refs).forEach(function (k) { refs[k].g.classList.toggle('is-selected', k === state.selectedEdge); });
        drawHandles();
      }

      view.nodes.forEach(function (n) {
        var node = nodeEl(n, graph);
        nodeEls[n.id] = node;
        ['top', 'right', 'bottom', 'left'].forEach(function (side) {
          var pin = el('span', 'jy-pin gc-nodrag is-' + side);
          pin.addEventListener('pointerdown', function (ev) { pinWire(ev, n, side); });
          node.appendChild(pin);
        });
        gc.dragNode(node, {
          node: n,
          onMove: function (x, y) {
            node.style.left = x + 'px';
            node.style.top = y + 'px';
            redrawAround(n.id);
          },
          onEnd: function (moved) {
            if (!moved) return;
            state.pos[n.id] = { x: n.x, y: n.y };
            savePos();
          },
          onClick: function () { selectNode(n.id, n.kind === 'task' ? 'task' : 'project'); },
        });
        gc.world.appendChild(node);
      });
      drawHandles();

      var tools = el('div', 'jy-zoomtools gc-nodrag');
      function tool(name, title, fn) {
        var b = el('button', 'jy-zoomtools-btn');
        b.type = 'button';
        b.title = title;
        b.setAttribute('aria-label', title);
        b.appendChild(icon(name));
        b.addEventListener('click', fn);
        tools.appendChild(b);
      }
      tool('zoom-out', 'Dézoomer', function () { gc.zoomBy(1 / 1.25); });
      tools.appendChild(pct);
      tool('zoom-in', 'Zoomer', function () { gc.zoomBy(1.25); });
      tool('focus-2', 'Tout voir', function () { fitNow(); });
      wrap.appendChild(tools);

      if (state.toast) {
        var tip = el('div', 'jy-toast');
        tip.appendChild(document.createTextNode(state.toast));
        var back = el('button', '', 'Annuler');
        back.type = 'button';
        back.addEventListener('click', function () { undo(); });
        tip.appendChild(back);
        wrap.appendChild(tip);
      }
      if (global.AddRow && openListId()) {
        wrap.appendChild(global.AddRow.line({
          float: true,
          onSubmit: function (title, input) { addTask(title, input); },
        }));
      }
      live = { gc: gc, view: view, byPos: byPos };
      return wrap;
    }

    /** "Nouvelle carte…" on the map: a task in the first open list, left without a goal until it is linked. */
    async function addTask(title, input) {
      var tt = global.TableTrello;
      var listId = openListId();
      if (!tt || typeof tt.createRow !== 'function' || !listId) return;
      input.disabled = true;
      var QP = global.QuickParse;
      var q = QP && QP.parse ? QP.parse(title) : { name: title, dueDate: '' };
      try {
        var res = await tt.createRow(t, q.name || title, listId);
        if (res && res.cardId && q.dueDate && global.GanttTrello) {
          try { await global.GanttTrello.saveCardDates(t, res.cardId, { dueDate: q.dueDate }); } catch (e) { /* the card exists; set the date by hand */ }
        }
        await reload();
        var next = document.querySelector('.jy-map .ar-input');
        if (next) next.focus({ preventScroll: true });
      } catch (e) {
        input.disabled = false;
        toast('Pas créée');
      }
    }

    function fitNow() {
      if (!live || !live.view.nodes.length) return;
      var box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      live.view.nodes.forEach(function (n) {
        box.x0 = Math.min(box.x0, n.x); box.y0 = Math.min(box.y0, n.y);
        box.x1 = Math.max(box.x1, n.x + n.w); box.y1 = Math.max(box.y1, n.y + n.h);
      });
      var s = live.gc.size();
      live.gc.setView(GC().fitView(box, s.w, s.h, 40, 1, 0.3));
    }

    /** After the map is in the page (sizes are known): center the focused box, or fit everything the first time. */
    function settleView() {
      if (!live) return;
      var gc = live.gc;
      if (state.scrollTo) {
        var n = live.byPos[state.scrollTo];
        state.scrollTo = null;
        if (n) {
          var s = gc.size();
          gc.setView(GC().centerOn(n.x + n.w / 2, n.y + n.h / 2, s.w, s.h, gc.view.k));
          return;
        }
      }
      if (!state.view || state.fitNext) {
        state.fitNext = false;
        fitNow();
      }
    }

    function posKey() {
      var board = '';
      try { board = (t && typeof t.getContext === 'function' && t.getContext().board) || ''; } catch (e) { /* no context */ }
      return 'tp-journey-pos' + (board ? ':' + board : '');
    }

    function loadPos() {
      try {
        var raw = global.localStorage && global.localStorage.getItem(posKey());
        var o = raw ? JSON.parse(raw) : {};
        return o && typeof o === 'object' ? o : {};
      } catch (e) {
        return {};
      }
    }

    function savePos() {
      try { if (global.localStorage) global.localStorage.setItem(posKey(), JSON.stringify(state.pos)); } catch (e) { /* storage unavailable */ }
    }

    function resetPos() {
      if (!Object.keys(state.pos).length) return;
      var before = state.pos;
      state.pos = {};
      savePos();
      remember('Disposition', async function () { state.pos = before; savePos(); });
      state.fitNext = true;
      toast('Boîtes réorganisées');
    }

    function edgeClass(e, graph) {
      var base = 'jy-wire';
      if (e.kind === 'serves') return base + ' is-serves' + (e.cross ? ' is-cross' : '');
      if (e.kind === 'sub') return base + ' is-sub';
      if (e.dep === 'after') return base + ' is-after';
      if (e.dep === 'parts') return base + ' is-parts';
      var open = graph.state[e.to] && graph.state[e.to] !== 'done';
      return base + ' is-needs' + (open ? ' is-open' : ' is-met');
    }

    /* ── Editing links ──────────────────────────────────────────────── */
    function refFor(graph, id) {
      var n = graph.byId[id];
      return n && n.kind === 'task' ? 't:' + id : id;
    }

    function sameRef(ref, id) { return ref === id || ref === 't:' + id; }

    /** Why this link cannot be made, or '' when it can. `except` is the link being moved. */
    function linkProblem(graph, kind, from, to, except) {
      var a = graph.byId[from];
      var b = graph.byId[to];
      if (!a || !b || from === to) return 'Choisissez une autre boîte';
      if (kind === 'depends') {
        if (a.kind !== 'task' || b.kind !== 'task') return 'Seules deux tâches peuvent dépendre l’une de l’autre';
        if (JM().wouldCycle(graph, from, to, except)) return 'Impossible : cela créerait une boucle de dépendances';
        return '';
      }
      if (JM().rankOfNode(a) <= JM().rankOfNode(b) || JM().rankOfNode(b) < 0) return 'Choisissez un élément d’un niveau supérieur';
      if (state.authGoals === false) return 'Autorisez Trello pour modifier les objectifs';
      return '';
    }

    /**
     * Applies link changes in one go ({ op: 'add' | 'drop', kind: 'depends' | 'serves', from, to }) and offers undo.
     * Dependencies live in the card (dependsOn), the hierarchy in the goals storage.
     */
    async function editLinks(label, changes) {
      if (state.busy || !changes.length) return;
      var pt = PT();
      var gg = GG();
      var graph = JM().prepare(state.board.cards, state.board.goals);
      var cardPrev = Object.create(null);
      var cardNext = Object.create(null);
      var goalsPrev = state.board.goals || { nodes: [], links: [] };
      var goalsNext = null;
      changes.forEach(function (c) {
        if (c.kind === 'depends') {
          var rec = recOf(c.from);
          if (!rec) return;
          if (!cardNext[c.from]) {
            var inputs = rec.inputs || {};
            cardPrev[c.from] = { dependsOn: (inputs.dependsOn || []).slice(), depTypes: Object.assign({}, inputs.depTypes) };
            cardNext[c.from] = { dependsOn: cardPrev[c.from].dependsOn.slice(), depTypes: Object.assign({}, inputs.depTypes) };
          }
          var next = cardNext[c.from];
          var at = next.dependsOn.indexOf(c.to);
          if (c.op === 'add' && at < 0) next.dependsOn.push(c.to);
          if (c.op === 'drop' && at >= 0) { next.dependsOn.splice(at, 1); delete next.depTypes[c.to]; }
        } else {
          if (!goalsNext) goalsNext = { nodes: (goalsPrev.nodes || []).slice(), links: (goalsPrev.links || []).slice() };
          goalsNext.links = goalsNext.links.filter(function (l) { return !(sameRef(l.from, c.from) && sameRef(l.to, c.to)); });
          if (c.op === 'add') goalsNext.links.push({ from: refFor(graph, c.from), to: c.to });
        }
      });
      var touched = Object.keys(cardNext);
      if (!touched.length && !goalsNext) return;
      state.busy = true;
      try {
        if (!(await authorize())) { toast('Autorisation requise'); state.busy = false; return; }
        if (touched.length && (!pt || typeof pt.saveCardInputsById !== 'function')) throw new Error('save');
        if (goalsNext && (!gg || typeof gg.save !== 'function')) throw new Error('save');
        for (var i = 0; i < touched.length; i++) await pt.saveCardInputsById(t, touched[i], cardNext[touched[i]]);
        if (goalsNext) await gg.save(t, goalsNext);
        remember(label, async function () {
          for (var j = 0; j < touched.length; j++) await pt.saveCardInputsById(t, touched[j], cardPrev[touched[j]]);
          if (goalsNext) await gg.save(t, goalsPrev);
        });
        toast(label);
        await reload();
      } catch (e) {
        toast('Pas enregistré');
      }
      state.busy = false;
    }

    /** Drag from a box's pin onto another box: two tasks → "dépend de" (left/top pin: this needs it; right/bottom: it needs this). */
    function linkFromPin(graph, n, side, targetId) {
      var a = graph.byId[n.id];
      var b = graph.byId[targetId];
      if (!a || !b) { toast('Choisissez une autre boîte'); return; }
      var change;
      if (a.kind === 'task' && b.kind === 'task') {
        var needsThis = side === 'right' || side === 'bottom';
        change = { op: 'add', kind: 'depends', from: needsThis ? targetId : n.id, to: needsThis ? n.id : targetId };
      } else {
        var ra = JM().rankOfNode(a);
        var rb = JM().rankOfNode(b);
        if (ra === rb || ra < 0 || rb < 0) { toast('Choisissez un niveau différent'); return; }
        change = { op: 'add', kind: 'serves', from: ra > rb ? n.id : targetId, to: ra > rb ? targetId : n.id };
      }
      var exists = graph.edges.some(function (e) { return e.kind === change.kind && e.from === change.from && e.to === change.to; });
      if (exists) { toast('Ce lien existe déjà'); return; }
      var problem = linkProblem(graph, change.kind, change.from, change.to, null);
      if (problem) { toast(problem); return; }
      editLinks('Lien ajouté', [change]);
    }

    /** Moves one end of a link onto another box ('from' = the dependent / lower level, 'to' = what it needs / the parent). */
    function moveEnd(graph, e, end, id) {
      var from = end === 'from' ? id : e.from;
      var to = end === 'to' ? id : e.to;
      if (from === e.from && to === e.to) return;
      var exists = graph.edges.some(function (x) { return x.kind === e.kind && x.from === from && x.to === to; });
      if (exists) { toast('Ce lien existe déjà'); return; }
      var problem = linkProblem(graph, e.kind, from, to, e.id);
      if (problem) { toast(problem); return; }
      state.selectedEdge = null;
      editLinks('Lien déplacé', [{ op: 'drop', kind: e.kind, from: e.from, to: e.to }, { op: 'add', kind: e.kind, from: from, to: to }]);
    }

    function removeSelectedEdge() {
      var id = state.selectedEdge;
      if (!id) return;
      var graph = JM().prepare(state.board.cards, state.board.goals);
      var e = null;
      graph.edges.forEach(function (x) { if (x.id === id) e = x; });
      state.selectedEdge = null;
      if (!e) { toast('Ce lien se règle dans la carte'); paint(); return; }
      if (e.kind === 'sub') { toast('Ce lien vient de la liste de la carte'); paint(); return; }
      editLinks('Lien retiré', [{ op: 'drop', kind: e.kind, from: e.from, to: e.to }]);
    }

    function nodeEl(n) {
      var node = el('div', 'jy-node is-' + (n.state || 'ready') + (n.here ? ' is-here' : '') + (n.id === state.selected ? ' is-on' : '') + (n.kind !== 'task' ? ' is-goal' : ''));
      node.style.left = n.x + 'px';
      node.style.top = n.y + 'px';
      node.style.width = n.w + 'px';
      node.style.height = n.h + 'px';
      node.dataset.id = n.id;
      node.setAttribute('role', 'button');
      node.tabIndex = 0;
      var top = el('div', 'jy-node-top');
      var icoName = n.kind === 'task' ? taskIcon(n.state, n.here) : (n.kind === 'bucket' ? 'inbox' : levelIcon(n.level));
      top.appendChild(el('span', 'jy-node-ico')).appendChild(icon(icoName));
      top.appendChild(el('span', 'jy-node-name', n.name));
      node.appendChild(top);
      var meta = n.kind === 'task' ? taskMeta(n) : countLabel(n.counts);
      var metaEl = el('div', 'jy-node-meta' + (meta ? '' : ' is-empty') + (n.rec && n.rec.duePast ? ' is-overdue' : ''), meta || '');
      node.appendChild(metaEl);
      if (n.kind === 'goal' && global.NewCard) {
        var plus = el('button', 'jy-plus');
        plus.type = 'button';
        plus.title = 'Nouvelle tâche';
        plus.appendChild(icon('plus'));
        plus.addEventListener('click', function (e) {
          e.stopPropagation();
          createUnder(n);
        });
        node.appendChild(plus);
      }
      node.addEventListener('dblclick', function () {
        if (n.kind === 'task') openCard(n.id);
      });
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); selectNode(n.id, n.kind === 'task' ? 'task' : 'project'); }
      });
      node.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        menuFor(n.id, node, e);
      });
      return node;
    }

    function taskMeta(n) {
      var rec = n.rec || {};
      var bits = [];
      var due = rec.dueDate || rec.due;
      if (due) bits.push(shortDay(due));
      if (rec.estimatedMinutes) bits.push(JM().formatMinutes(rec.estimatedMinutes));
      var names = (rec.assignees || []).map(function (a) { return a && a.name; }).filter(Boolean);
      if (names.length === 1) bits.push(names[0]);
      else if (names.length > 1) bits.push(names.length + ' personnes');
      return bits.join(' · ');
    }

    function detail(graph, full) {
      var box = el('div', 'jy-detail');
      var id = state.selected || (full.now[0] && full.now[0].id);
      var node = id && graph.byId[id];
      if (!node) {
        box.appendChild(el('div', 'jy-detail-meta', state.board.cards.length ? '' : 'Aucune tâche'));
        return box;
      }
      box.appendChild(el('div', 'jy-detail-name', node.name));
      var item = null;
      full.now.concat(full.blocked).forEach(function (a) { if (a.id === id) item = a; });
      var meta = [];
      if (node.kind !== 'task') meta.push(countLabel(JM().summarize(graph, id)) || node.level || '');
      if (node.kind === 'task' && JM().isClosed(node.rec || {})) meta.push('Faite');
      if (item && item.projectName) meta.push(item.projectName);
      if (item && item.missionName && item.missionName !== item.projectName) meta.push(item.missionName);
      if (item && item.reasons.length) meta.push(item.reasons.join(' · '));
      if (item && item.also && item.also.length) meta.push('Aussi ' + item.also.map(function (a) { return a.name; }).join(', '));
      var metaEl = el('div', 'jy-detail-meta', meta.filter(Boolean).join(' · '));
      box.appendChild(metaEl);

      if (node.kind === 'task') {
        var links = JM().linksOf(graph, id);
        if (links.prereqs.length) {
          var pre = el('div', 'jy-detail-meta', '');
          pre.appendChild(document.createTextNode('Avant · '));
          links.prereqs.forEach(function (p, i) {
            if (i) pre.appendChild(document.createTextNode(', '));
            var b = el('button', 'jy-link', p.name);
            b.type = 'button';
            b.addEventListener('click', function () { selectNode(p.id, 'task'); });
            pre.appendChild(b);
          });
          box.appendChild(pre);
        }
        var opens = links.next.filter(function (n) { return n.dep === 'needs' || n.dep == null; });
        if (opens.length) {
          var nxt = el('div', 'jy-detail-meta');
          nxt.appendChild(document.createTextNode('Débloque · '));
          opens.forEach(function (p, i) {
            if (i) nxt.appendChild(document.createTextNode(', '));
            var b = el('button', 'jy-link', p.name);
            b.type = 'button';
            b.addEventListener('click', function () { selectNode(p.id, 'task'); });
            nxt.appendChild(b);
          });
          box.appendChild(nxt);
        }
        var local = (node.checks || []).filter(function (c) { return !c.linkedId; });
        if (local.length) {
          var checks = el('div', 'jy-checks');
          local.forEach(function (c) {
            checks.appendChild(el('div', 'jy-check' + (c.done ? ' is-done' : ''), (c.done ? '✓ ' : '· ') + c.text));
          });
          box.appendChild(checks);
        }
        var row = el('div', 'jy-detail-row');
        var openBtn = el('button', 'jy-btn is-primary', 'Ouvrir');
        openBtn.type = 'button';
        openBtn.addEventListener('click', function () { openCard(id); });
        row.appendChild(openBtn);
        if (!JM().isClosed(node.rec || {})) {
          var doneBtn = el('button', 'jy-btn', 'Terminer');
          doneBtn.type = 'button';
          doneBtn.addEventListener('click', function () { complete(id); });
          row.appendChild(doneBtn);
        }
        var blockBtn = el('button', 'jy-btn', (node.rec && node.rec.blocked) ? 'Débloquer' : 'Bloquer');
        blockBtn.type = 'button';
        blockBtn.addEventListener('click', function () { toggleBlock(id); });
        row.appendChild(blockBtn);
        box.appendChild(row);
      }
      return box;
    }

    function queue(full, here) {
      var aside = el('div', 'jy-queue');
      var scroll = el('div', 'jy-queue-scroll');
      scroll.appendChild(el('h2', '', 'Maintenant'));
      if (!full.now.length) scroll.appendChild(el('div', 'jy-empty', 'Rien pour l’instant'));
      full.now.slice(0, 5).forEach(function (a) { scroll.appendChild(rowEl(a, here)); });
      if (full.blocked.length) {
        scroll.appendChild(el('h2', '', 'Bloquées'));
        full.blocked.slice(0, 3).forEach(function (a) { scroll.appendChild(rowEl(a, here)); });
      }
      aside.appendChild(scroll);
      return aside;
    }

    function rowEl(a, here) {
      var row = el('div', 'jy-row is-' + a.state + (a.id === here ? ' is-here' : '') + (a.id === state.selected ? ' is-on' : '') + (a.dueState === 'overdue' ? ' is-overdue' : ''));
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      var ico = el('span', 'jy-row-ico');
      ico.appendChild(icon(taskIcon(a.state, a.id === here)));
      row.appendChild(ico);
      row.appendChild(el('span', 'jy-row-name', a.name));
      row.appendChild(el('span', 'jy-row-effort', a.effortLabel || ''));
      row.appendChild(el('span', 'jy-row-due', a.dueLabel || ''));
      var go = el('button', 'jy-row-go');
      go.type = 'button';
      go.title = 'Ouvrir';
      go.appendChild(icon('arrow-up-right'));
      go.addEventListener('click', function (e) {
        e.stopPropagation();
        openCard(a.id);
      });
      row.appendChild(go);
      var why = [];
      if (a.projectName) why.push(a.projectName);
      if (a.reasons.length) why.push(a.reasons.join(' · '));
      row.appendChild(el('span', 'jy-row-why', why.join(' · ')));
      row.addEventListener('click', function () { selectNode(a.id, 'task'); });
      row.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        menuFor(a.id, row, e);
      });
      return row;
    }

    container.classList.add('jy-mount');
    if (global.CommandPalette) {
      global.CommandPalette.attach({
        cards: function () { return (state.board.cards || []).map(function (c) { return { id: c.id, name: c.name }; }); },
        onCard: function (id) { selectNode(id, 'task'); },
      });
    }
    reload();
    return { reload: reload };
  }

  global.JourneyUI = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
