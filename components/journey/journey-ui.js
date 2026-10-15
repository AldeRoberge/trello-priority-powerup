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
      status: 'Chargement…',
      authGoals: null,
      gen: 0,
      didHl: false,
      scrollTo: null,
    };

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
      if (mine === state.gen) paint();
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
      if (e.key === 'Escape' && !typing) {
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
      var map = container.querySelector('.jy-map');
      var sl = map ? map.scrollLeft : 0;
      var st = map ? map.scrollTop : 0;
      var search = container.querySelector('.jy-search');
      var keepFocus = search && document.activeElement === search;
      var caret = keepFocus ? search.selectionStart : null;
      container.textContent = '';
      if (state.status && !(state.board.cards && state.board.cards.length)) {
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
      view.nodes.forEach(function (n) { byPos[n.id] = n; });

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

      if (keepFocus) {
        var again = container.querySelector('.jy-search');
        if (again) {
          again.focus();
          if (caret != null && again.setSelectionRange) again.setSelectionRange(caret, caret);
        }
      }
      if (state.scrollTo) {
        var target = container.querySelector('.jy-node[data-id="' + cssEscape(state.scrollTo) + '"]');
        state.scrollTo = null;
        if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center', inline: 'center' });
      } else {
        var nextMap = container.querySelector('.jy-map');
        if (nextMap) {
          nextMap.scrollLeft = sl;
          nextMap.scrollTop = st;
        }
      }
    }

    function cssEscape(id) {
      if (global.CSS && CSS.escape) return CSS.escape(String(id));
      return String(id).replace(/"/g, '');
    }

    function bar(graph) {
      var row = el('div', 'jy-bar');
      var search = el('input', 'jy-search');
      search.type = 'search';
      search.placeholder = 'Chercher';
      search.value = state.query;
      search.setAttribute('aria-label', 'Chercher');
      search.addEventListener('input', function () {
        state.query = search.value;
        paint();
      });
      row.appendChild(search);

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

    function mapOf(graph, view, byPos) {
      var scroller = el('div', 'jy-map');
      var canvas = el('div', 'jy-canvas');
      canvas.style.width = Math.max(view.width, 1) + 'px';
      canvas.style.height = Math.max(view.height, 1) + 'px';
      var svg = svgEl('svg');
      svg.setAttribute('class', 'jy-roads');
      svg.setAttribute('width', String(Math.max(view.width, 1)));
      svg.setAttribute('height', String(Math.max(view.height, 1)));
      view.edges.forEach(function (e) {
        var a = byPos[e.from];
        var b = byPos[e.to];
        if (!a || !b) return;
        var path = svgEl('path');
        path.setAttribute('class', edgeClass(e, graph));
        path.setAttribute('d', road(a, b));
        svg.appendChild(path);
      });
      canvas.appendChild(svg);
      view.nodes.forEach(function (n) { canvas.appendChild(nodeEl(n, graph)); });
      scroller.appendChild(canvas);
      if (state.toast) {
        var tip = el('div', 'jy-toast');
        tip.appendChild(document.createTextNode(state.toast));
        var back = el('button', '', 'Annuler');
        back.type = 'button';
        back.addEventListener('click', function () { undo(); });
        tip.appendChild(back);
        scroller.appendChild(tip);
      }

      var k = state.mapZoom || 1;
      canvas.style.zoom = String(k);
      var restore = state.mapScroll;
      if (restore) {
        scroller.addEventListener('scroll', function () {}, { passive: true });
        setTimeout(function () { scroller.scrollLeft = restore.l; scroller.scrollTop = restore.t; }, 0);
      }
      scroller.addEventListener('scroll', function () {
        state.mapScroll = { l: scroller.scrollLeft, t: scroller.scrollTop };
      }, { passive: true });
      scroller.addEventListener('wheel', function (e) {
        e.preventDefault();
        var next = Math.min(2.5, Math.max(0.25, k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
        if (next === k) return;
        var rect = scroller.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;
        var cx = (scroller.scrollLeft + mx) / k;
        var cy = (scroller.scrollTop + my) / k;
        k = next;
        state.mapZoom = k;
        canvas.style.zoom = String(k);
        scroller.scrollLeft = cx * k - mx;
        scroller.scrollTop = cy * k - my;
      }, { passive: false });

      var drag = null;
      scroller.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 && e.button !== 1) return;
        if (e.target.closest && e.target.closest('.jy-node, .jy-plus, button, a')) return;
        drag = { x: e.clientX, y: e.clientY, l: scroller.scrollLeft, t: scroller.scrollTop, id: e.pointerId };
        scroller.classList.add('is-panning');
        if (scroller.setPointerCapture) scroller.setPointerCapture(e.pointerId);
      });
      scroller.addEventListener('pointermove', function (e) {
        if (!drag || drag.id !== e.pointerId) return;
        scroller.scrollLeft = drag.l - (e.clientX - drag.x);
        scroller.scrollTop = drag.t - (e.clientY - drag.y);
      });
      function endDrag(e) {
        if (!drag || (e && drag.id !== e.pointerId)) return;
        drag = null;
        scroller.classList.remove('is-panning');
      }
      scroller.addEventListener('pointerup', endDrag);
      scroller.addEventListener('pointercancel', endDrag);
      scroller.addEventListener('mousedown', function (e) { if (e.button === 1) e.preventDefault(); });
      return scroller;
    }

    function edgeClass(e, graph) {
      if (e.kind === 'serves') return 'jy-edge is-serves' + (e.cross ? ' is-cross' : '');
      if (e.kind === 'sub') return 'jy-edge is-sub';
      if (e.dep === 'after') return 'jy-edge is-after';
      if (e.dep === 'parts') return 'jy-edge is-parts';
      var open = graph.state[e.to] && graph.state[e.to] !== 'done';
      return 'jy-edge is-needs' + (open ? ' is-open' : ' is-met');
    }

    function road(a, b) {
      var x1 = a.x + a.w;
      var y1 = a.y + a.h / 2;
      var x2 = b.x;
      var y2 = b.y + b.h / 2;
      if (x2 < x1) {
        var swap = x1; x1 = b.x + b.w; x2 = a.x; y1 = b.y + b.h / 2; y2 = a.y + a.h / 2;
        void swap;
      }
      var dx = Math.max(28, (x2 - x1) / 2);
      return 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2;
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
      node.addEventListener('click', function () {
        var zoom = n.kind === 'task' ? 'task' : 'project';
        selectNode(n.id, zoom);
      });
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
    reload();
    return { reload: reload };
  }

  global.JourneyUI = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
