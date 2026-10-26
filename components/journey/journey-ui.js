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
      adding: null, // id of the card whose "new subtask" input is open
      draftText: '',
    };
    var live = null;
    var blurGuard = false; // true while the map is torn down, so a field that loses focus then is not taken for a click-away
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
        // only the toast goes: a full repaint would wipe a title or a new subtask being typed
        var tip = container.querySelector('.jy-toast');
        if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
      }, 4000);
    }

    async function reload() {
      var mine = ++state.gen;
      try {
        var data = opts.load ? await opts.load() : await loadBoard();
        if (mine !== state.gen) return;
        state.board = data || state.board;
        if (global.Isolation) global.Isolation.adopt(t, (state.board && state.board.cards) || [], state.board && state.board.goals);
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

    /** Sets a card's progress in place (reaching 100 % also moves it to the completed list, like the Tableau). */
    async function setProgress(id, pct, prev) {
      var rec = recOf(id);
      var cq = global.CardQuick;
      var pt = PT();
      if (!rec || !cq || typeof cq.setProgress !== 'function') { paint(); return; }
      if (state.busy) { paint(); return; }
      state.busy = true;
      try {
        if (!(await authorize())) { toast('Autorisation requise'); state.busy = false; return; }
        var beforeList = rec.listId;
        var moved = await cq.setProgress(t, rec, listsForNew(), pct);
        rec.progress = pct;
        remember(rec.name, async function () {
          await cq.setProgress(t, { id: id }, [], prev);
          if (moved && pt && typeof pt.restPutCard === 'function') await pt.restPutCard(t, id, { idList: beforeList });
        });
        toast(pct >= 100 ? 'Terminée' : 'Progrès ' + pct + ' %');
        await reload();
      } catch (e) {
        toast('Pas enregistré');
      }
      state.busy = false;
    }

    async function rename(id, name) {
      var rec = recOf(id);
      var tt = global.TableTrello;
      if (!rec || !tt || typeof tt.saveName !== 'function' || state.busy) { paint(); return; }
      var before = rec.name || '';
      state.busy = true;
      try {
        await tt.saveName(t, id, name);
        rec.name = name;
        remember(name, async function () { await tt.saveName(t, id, before); });
        toast('Renommée');
        await reload();
      } catch (e) {
        toast('Pas enregistré');
      }
      state.busy = false;
    }

    /** Renames a mission or project (kept with the goals, like the Mindmap). */
    async function renameGoal(id, name) {
      var gg = GG();
      var goals = state.board.goals || { nodes: [], links: [] };
      if (state.busy || !gg || typeof gg.save !== 'function') { paint(); return; }
      if (state.authGoals === false) { toast('Autorisez Trello pour modifier les objectifs'); return; }
      var before = null;
      var nodes = (goals.nodes || []).map(function (g) {
        if (g.id !== id) return g;
        before = g.name;
        return Object.assign({}, g, { name: name });
      });
      if (before == null) { paint(); return; }
      state.busy = true;
      try {
        await gg.save(t, { nodes: nodes, links: goals.links || [] });
        remember(name, async function () {
          await gg.save(t, { nodes: (nodes || []).map(function (g) { return g.id === id ? Object.assign({}, g, { name: before }) : g; }), links: goals.links || [] });
        });
        toast('Renommé');
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

    /** Brings a closed card back: its subtasks go back to 0 %, and it leaves the completed list for the first open one. */
    async function reopen(id) {
      if (state.busy) return;
      var rec = recOf(id);
      var ct = CT();
      var pt = PT();
      if (!rec || !ct || !pt) return;
      state.busy = true;
      try {
        if (!(await authorize())) { toast('Autorisation requise'); state.busy = false; return; }
        var prev = typeof ct.getCardCompletionById === 'function' ? await ct.getCardCompletionById(t, id) : { items: [] };
        var next = typeof ct.markNotFullyComplete === 'function' ? ct.markNotFullyComplete(prev) : prev;
        if (typeof ct.saveCardCompletionById === 'function') await ct.saveCardCompletionById(t, id, next);
        var body = { dueComplete: false };
        var beforeList = rec.listId;
        var beforeDue = !!rec.dueComplete;
        if (rec.category === 'completed' && openListId()) body.idList = openListId();
        if (typeof pt.restPutCard === 'function') await pt.restPutCard(t, id, body);
        remember(rec.name, async function () {
          if (typeof ct.saveCardCompletionById === 'function') await ct.saveCardCompletionById(t, id, prev);
          if (typeof pt.restPutCard === 'function') await pt.restPutCard(t, id, { dueComplete: beforeDue, idList: beforeList });
        });
        toast('Rouverte');
        await reload();
      } catch (e) {
        toast('Pas enregistré');
      }
      state.busy = false;
    }

    /* ── Subtasks (the card's own checklist items, kept in its completion data) ───────────────────────────── */

    /** Puts a card's new completion data into the map at once, so a click does not wait for the whole board to reload. */
    function patchItems(cardId, data) {
      var rec = recOf(cardId);
      var ct = CT();
      if (!rec || !data) return;
      rec.items = data.items || [];
      if (ct && typeof ct.computeCardProgress === 'function') {
        var p = ct.computeCardProgress(data);
        if (p && typeof p.percent === 'number') rec.progress = p.percent;
      }
    }

    /**
     * Changes a card's subtasks: change(data) returns { data }. Saved, shown at once, undoable, then the board is
     * reloaded in the background (blocking a subtask can block the card). Resolves to what change() returned, or null.
     */
    async function editItems(cardId, label, change) {
      var ct = CT();
      if (state.busy || !ct || !recOf(cardId) || typeof ct.getCardCompletionById !== 'function') return null;
      state.busy = true;
      var out = null;
      try {
        if (!(await authorize())) { toast('Autorisation requise'); state.busy = false; return null; }
        var before = ct.normalizeCompletionData((await ct.getCardCompletionById(t, cardId)) || { items: [] });
        out = change(before);
        if (!out || !out.data) { state.busy = false; return null; }
        await ct.saveCardCompletionById(t, cardId, out.data);
        remember(label, async function () { await ct.saveCardCompletionById(t, cardId, before); });
        patchItems(cardId, out.data);
        toast(label);
      } catch (e) {
        out = null;
        toast('Pas enregistré');
      }
      state.busy = false;
      if (out) reload();
      return out;
    }

    function itemOf(n) {
      var rec = recOf(n.parent);
      var items = (rec && rec.items) || [];
      for (var i = 0; i < items.length; i++) if (items[i] && String(items[i].id) === n.itemId) return items[i];
      return null;
    }

    function toggleSub(n) {
      if (!n.itemId) return null;
      var done = n.state !== 'done';
      return editItems(n.parent, done ? 'Sous-tâche terminée' : 'Sous-tâche rouverte', function (data) {
        return { data: CT().applyItemProgress(data, n.itemId, done ? 100 : 0) };
      });
    }

    function setSubProgress(n, pct) {
      if (!n.itemId) return null;
      return editItems(n.parent, pct >= 100 ? 'Sous-tâche terminée' : 'Progrès ' + pct + ' %', function (data) {
        return { data: CT().applyItemProgress(data, n.itemId, pct) };
      });
    }

    function blockSub(n) {
      if (!n.itemId || n.state === 'done') return null;
      var next = n.state !== 'blocked';
      return editItems(n.parent, next ? 'Sous-tâche bloquée' : 'Sous-tâche débloquée', function (data) {
        return { data: CT().setItemBlocked(data, n.itemId, next) };
      });
    }

    function renameSub(n, text) {
      if (!n.itemId) return null;
      return editItems(n.parent, 'Renommée', function (data) {
        return { data: CT().applyItemText(data, n.itemId, text) };
      });
    }

    function deleteSub(n) {
      var gt = GT();
      if (!n.itemId || !gt || typeof gt.removeTopLevelItem !== 'function') return null;
      return editItems(n.parent, 'Sous-tâche supprimée', function (data) {
        return { data: gt.removeTopLevelItem(data, n.itemId) };
      });
    }

    /** Sets (or, with '', clears) a subtask's due day; its other schedule fields are kept. */
    function setSubDue(n, day) {
      if (!n.itemId) return null;
      var item = itemOf(n) || {};
      var parts = { startDate: item.startDate, startTime: item.startTime, dueDate: day, dueTime: day ? item.dueTime : '' };
      return editItems(n.parent, day ? 'Échéance réglée' : 'Échéance retirée', function (data) {
        return { data: CT().applyItemDates(data, n.itemId, null, parts) };
      });
    }

    function setSubEstimate(n, minutes) {
      if (!n.itemId) return null;
      return editItems(n.parent, minutes ? 'Effort réglé' : 'Effort retiré', function (data) {
        return { data: CT().applyItemEstimate(data, n.itemId, minutes || null, { lock: true }) };
      });
    }

    /** Adds a subtask to a card; the input stays open for the next one. */
    async function addSub(cardId, text) {
      var title = String(text || '').replace(/\s+/g, ' ').trim();
      if (!title) return null;
      var out = await editItems(cardId, 'Sous-tâche ajoutée', function (data) {
        var added = CT().addLocalItem(data, title);
        return added.item ? { data: added.data, item: added.item } : null;
      });
      return out;
    }

    /** Opens the "new subtask" input under a card (bringing the card into view first when the map does not show it). */
    function startAdding(cardId) {
      state.adding = String(cardId);
      state.draftText = '';
      if (live && live.byPos['add:' + cardId]) paint();
      else selectNode(cardId, 'task');
    }

    function openCard(id) {
      var rec = recOf(id);
      if (!rec || !global.TaskFocus) return;
      global.TaskFocus.open({
        t: t,
        cardId: rec.id,
        name: rec.name || '',
        onChange: function () { reload(); },
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

    var pendingPick = null;

    /**
     * A click on a box selects it (which re-centers the map), but only after a short wait: a second click in that time
     * is a double-click and renames the box in place instead, as in the Mindmap.
     */
    function pickNode(n, node) {
      var again = pendingPick && pendingPick.id === n.id;
      if (pendingPick) { clearTimeout(pendingPick.timer); pendingPick = null; }
      if (n.kind !== 'task' && n.kind !== 'goal' && n.kind !== 'check') { selectNode(n.id, 'project'); return; }
      if (again) {
        var box = node.isConnected ? node : container.querySelector('.jy-node[data-id="' + n.id + '"]');
        if (box) editName(box, n);
        return;
      }
      pendingPick = {
        id: n.id,
        timer: setTimeout(function () {
          pendingPick = null;
          if (n.kind === 'check') selectNode(n.parent, 'task');
          else selectNode(n.id, n.kind === 'task' ? 'task' : 'project');
        }, 260),
      };
    }

    function selectNode(id, zoom) {
      state.selected = id;
      state.focus = id;
      if (zoom) state.zoom = zoom;
      state.scrollTo = id;
      paint();
    }

    function dayOffset(days) {
      var d = new Date();
      d.setDate(d.getDate() + days);
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }

    /** Right-click on a subtask: done, pause, rename, progress, due day, effort, open the card, delete. */
    function subMenuFor(n, node, point) {
      if (!global.ContextMenu || !n.itemId) return;
      var done = n.state === 'done';
      var items = [
        { id: 'done', label: done ? 'Rouvrir' : 'Terminer', icon: done ? 'circle' : 'circle-check', action: function () { toggleSub(n); } },
      ];
      if (!done) {
        items.push({
          id: 'block',
          label: n.state === 'blocked' ? 'Débloquer' : 'Bloquer',
          icon: 'player-pause',
          action: function () { blockSub(n); },
        });
      }
      items.push({ id: 'rename', label: 'Renommer', icon: 'pencil', action: function () { editName(node, n); } });
      items.push({ sep: true });
      items.push({
        id: 'progress',
        label: 'Progrès',
        icon: 'progress',
        children: [0, 25, 50, 75, 100].map(function (p) {
          return { id: 'p' + p, label: p + ' %', icon: 'progress', checked: Math.round(n.progress || 0) === p, action: function () { setSubProgress(n, p); } };
        }),
      });
      var dues = [
        { id: 'd0', label: 'Aujourd’hui', icon: 'circle-dot', day: dayOffset(0) },
        { id: 'd1', label: 'Demain', icon: 'arrow-curve-right', day: dayOffset(1) },
        { id: 'd7', label: 'Dans une semaine', icon: 'calendar-week', day: dayOffset(7) },
      ].map(function (d) {
        return { id: d.id, label: d.label, icon: d.icon, checked: n.dueDate === d.day, action: function () { setSubDue(n, d.day); } };
      });
      if (n.dueDate) dues.push({ id: 'dnone', label: 'Retirer la date', icon: 'calendar-off', action: function () { setSubDue(n, ''); } });
      items.push({ id: 'due', label: 'Échéance', icon: 'calendar-event', children: dues });
      var efforts = [5, 15, 30, 60, 120, 240].map(function (m) {
        return { id: 'e' + m, label: JM().formatMinutes(m), icon: 'clock', checked: n.minutes === m, action: function () { setSubEstimate(n, m); } };
      });
      if (n.minutes) efforts.push({ id: 'enone', label: 'Non estimée', icon: 'clock-off', action: function () { setSubEstimate(n, 0); } });
      items.push({ id: 'estimate', label: 'Effort', icon: 'clock', children: efforts });
      items.push({ sep: true });
      items.push({ id: 'open', label: 'Ouvrir la carte', icon: 'external-link', action: function () { openCard(n.parent); } });
      items.push({ sep: true });
      items.push({ id: 'delete', label: 'Supprimer', icon: 'trash', danger: true, action: function () { deleteSub(n); } });
      if (global.Isolation && n.parent && n.itemId) {
        items = items.concat(global.Isolation.menuItems({
          cardId: n.parent,
          subId: 'sub:' + n.parent + ':' + n.itemId,
          subName: n.name || '',
        }));
      }
      global.ContextMenu.show(point, items);
    }

    function menuFor(id, anchor, point) {
      if (!global.ContextMenu) return;
      var rec = recOf(id);
      var node = JM().prepare(state.board.cards, state.board.goals).byId[id];
      if (!node) return;
      var items = [];
      if (rec) {
        if (global.TableTrello && global.TableTrello.archiveCard) {
          items.push({ id: 'archive', label: 'Archiver', icon: 'archive', danger: true, action: function () { archive(id); } });
          items.push({ sep: true });
        }
        items.push({ id: 'open', label: 'Ouvrir', icon: 'external-link', action: function () { openCard(id); } });
        var closed = !!(JM().isClosed && JM().isClosed(rec));
        items.push(closed
          ? { id: 'done', label: 'Rouvrir', icon: 'circle', action: function () { reopen(id); } }
          : { id: 'done', label: 'Terminer', icon: 'check', success: true, action: function () { complete(id); } });
        if (!closed) {
          items.push({ id: 'sub', label: 'Nouvelle sous-tâche', icon: 'plus', action: function () { startAdding(id); } });
        }
        var box = container.querySelector('.jy-node[data-id="' + id + '"]');
        if (box) items.push({ id: 'rename', label: 'Renommer', icon: 'pencil', action: function () { editName(box, { id: id, kind: 'task', name: rec.name || '' }); } });
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
      } else if (node.kind === 'goal') {
        items.push({ id: 'add', label: 'Nouvelle tâche', icon: 'plus', action: function () { createUnder(node); } });
      }
      if (global.Isolation) {
        var iso = {};
        if (rec) {
          iso.cardId = id;
          iso.cardName = rec.name || '';
          iso.people = global.Isolation.peopleOf(rec);
        } else if (node.kind === 'goal' && node.level === 'project') {
          iso.projectId = node.id;
          iso.projectName = node.name || '';
        }
        items = items.concat(global.Isolation.menuItems(iso));
      }
      if (items.length) global.ContextMenu.show(point, items);
    }

    function paint() {
      live = null;
      var search = container.querySelector('.jy-search');
      var keepFocus = search && document.activeElement === search;
      var caret = keepFocus ? search.selectionStart : null;
      blurGuard = true;
      container.textContent = '';
      blurGuard = false;
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
        adding: state.adding,
      });
      var byPos = Object.create(null);
      view.nodes.forEach(function (n) {
        var p = state.pos[n.id];
        if (p && isFinite(p.x) && isFinite(p.y)) { n.x = p.x; n.y = p.y; }
        byPos[n.id] = n;
      });
      view.nodes.forEach(function (n) {
        var owner = (n.kind === 'check' || n.kind === 'add') && byPos[n.parent];
        if (!owner) return;
        var moved = state.pos[n.id]; // a subtask the user moved keeps its place relative to its card
        if (moved && isFinite(moved.dx) && isFinite(moved.dy)) { n.offX = moved.dx; n.offY = moved.dy; }
        n.x = owner.x + n.offX;
        n.y = owner.y + n.offY;
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
      } else if (state.adding) {
        var draft = container.querySelector('.jy-add-input');
        if (draft) {
          draft.focus({ preventScroll: true });
          draft.setSelectionRange(draft.value.length, draft.value.length);
        } else {
          state.adding = null; // the card is no longer on the map
        }
      }
      settleView();
    }

    function bar(graph) {
      var row = el('div', 'jy-bar');
      var search = el('input', 'jy-search tp-search-input');
      search.type = 'search';
      search.placeholder = 'Rechercher…';
      search.value = state.query;
      search.setAttribute('aria-label', 'Rechercher');
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
        if (isTree(ref.e)) {
          var tw = gcm.treeWire(a, b);
          ref.line.setAttribute('d', tw.d);
          ref.hit.setAttribute('d', tw.d);
          ref.arrow.setAttribute('d', '');
          ref.ends = [tw.p1, tw.p2];
          return;
        }
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
          var hit = elAt && elAt.closest && elAt.closest('.jy-node:not(.is-check)');
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

      var babiesOf = Object.create(null);
      view.nodes.forEach(function (n) {
        if (n.kind === 'check' || n.kind === 'add') (babiesOf[n.parent] = babiesOf[n.parent] || []).push(n);
      });

      view.nodes.forEach(function (n) {
        var node = nodeEl(n, graph);
        nodeEls[n.id] = node;
        if (n.kind === 'add') {
          // the "+" under a card's subtasks follows the card; it is not moved on its own
          gc.world.appendChild(node);
          return;
        }
        if (n.kind === 'check') {
          // a subtask moves on its own (the card's drag takes it along); a click selects its card (a double-click renames it)
          gc.dragNode(node, {
            node: n,
            onMove: function (x, y) {
              node.style.left = x + 'px';
              node.style.top = y + 'px';
              redrawAround(n.id);
            },
            onEnd: function (moved) {
              if (!moved) return;
              var owner = byPos[n.parent];
              if (!owner) return;
              n.offX = n.x - owner.x;
              n.offY = n.y - owner.y;
              state.pos[n.id] = { dx: n.offX, dy: n.offY };
              savePos();
            },
            onClick: function () { pickNode(n, node); },
          });
          gc.world.appendChild(node);
          return;
        }
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
            (babiesOf[n.id] || []).forEach(function (b) {
              b.x = x + b.offX;
              b.y = y + b.offY;
              nodeEls[b.id].style.left = b.x + 'px';
              nodeEls[b.id].style.top = b.y + 'px';
              redrawAround(b.id);
            });
            redrawAround(n.id);
          },
          onEnd: function (moved) {
            if (!moved) return;
            state.pos[n.id] = { x: n.x, y: n.y };
            savePos();
          },
          onClick: function () { pickNode(n, node); },
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

    /** Leaves the camera alone while the box is well inside the screen; otherwise glides just far enough to bring it back in. */
    function revealSmoothly(gc, n) {
      var s = gc.size();
      var v = gc.view;
      var mx = s.w * 0.2, my = s.h * 0.2;
      var x0 = n.x * v.k + v.x, x1 = (n.x + n.w) * v.k + v.x;
      var y0 = n.y * v.k + v.y, y1 = (n.y + n.h) * v.k + v.y;
      var dx = 0, dy = 0;
      if (x0 < mx) dx = mx - x0; else if (x1 > s.w - mx) dx = s.w - mx - x1;
      if (y0 < my) dy = my - y0; else if (y1 > s.h - my) dy = s.h - my - y1;
      if (x1 - x0 > s.w - 2 * mx) dx = s.w / 2 - (x0 + x1) / 2;
      if (y1 - y0 > s.h - 2 * my) dy = s.h / 2 - (y0 + y1) / 2;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      var from = { x: v.x, y: v.y, k: v.k };
      var t0 = null;
      var dur = 320;
      var step = function (now) {
        if (!live || live.gc !== gc) return;
        if (t0 === null) t0 = now;
        var p = Math.min(1, (now - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        gc.setView({ x: from.x + dx * e, y: from.y + dy * e, k: from.k });
        if (p < 1) global.requestAnimationFrame(step);
      };
      global.requestAnimationFrame(step);
    }

    /** After the map is in the page (sizes are known): center the focused box, or fit everything the first time. */
    function settleView() {
      if (!live) return;
      var gc = live.gc;
      if (state.scrollTo) {
        var n = live.byPos[state.scrollTo];
        state.scrollTo = null;
        if (n) {
          if (state.view) revealSmoothly(gc, n); else gc.setView(GC().centerOn(n.x + n.w / 2, n.y + n.h / 2, gc.size().w, gc.size().h, gc.view.k));
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

    /** Links to subtasks (checklist items and linked cards) are drawn as a tree, without arrowheads. */
    function isTree(e) { return e.kind === 'check' || e.kind === 'sub'; }

    function edgeClass(e, graph) {
      var base = 'jy-wire';
      if (e.kind === 'serves') return base + ' is-serves' + (e.cross ? ' is-cross' : '');
      if (e.kind === 'check') return base + ' is-sub is-tree is-check';
      if (e.kind === 'sub') return base + ' is-sub is-tree';
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

    /**
     * The status icon of a task: a button that completes the task (or brings it back when it is closed). A task that
     * waits for another one keeps its lock, quieter and not clickable.
     */
    function statusIcon(id, stateName, here) {
      var closed = stateName === 'done';
      var btn = el('button', 'jy-node-ico jy-ico-btn gc-nodrag');
      btn.type = 'button';
      btn.appendChild(icon(taskIcon(stateName, here)));
      if (stateName === 'waiting') {
        btn.disabled = true;
        btn.title = 'En attente d’une autre tâche';
        return btn;
      }
      btn.title = closed ? 'Terminée — cliquer pour rouvrir' : 'Terminer';
      btn.setAttribute('aria-label', closed ? 'Rouvrir' : 'Terminer');
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (closed) reopen(id);
        else complete(id);
      });
      return btn;
    }

    function nodeEl(n) {
      if (n.kind === 'check') return checkEl(n);
      if (n.kind === 'add') return addEl(n);
      var node = el('div', 'jy-node is-' + (n.state || 'ready') + (n.here ? ' is-here' : '') + (n.id === state.selected ? ' is-on' : '') + (n.kind !== 'task' ? ' is-goal' : ''));
      node.style.left = n.x + 'px';
      node.style.top = n.y + 'px';
      node.style.width = n.w + 'px';
      node.style.height = n.h + 'px';
      node.dataset.id = n.id;
      if (n.kind === 'task') node.setAttribute('data-iso-card', n.id);
      else if (n.level === 'project') {
        node.setAttribute('data-iso-project', n.id);
        node.setAttribute('data-iso-label', n.name || '');
      }
      node.setAttribute('role', 'button');
      node.tabIndex = 0;
      var top = el('div', 'jy-node-top');
      if (n.kind === 'task') {
        top.appendChild(statusIcon(n.id, n.state, n.here));
      } else if (n.level === 'project' && n.kind !== 'bucket' && global.ProjectIcon) {
        var projBtn = global.ProjectIcon.button({
          t: t,
          id: n.id,
          icon: n.icon,
          className: 'ip-glyph jy-node-ico',
          goals: function () { return state.board && state.board.goals; },
          onSaved: function (saved) {
            if (saved && state.board) state.board.goals = saved;
            paint();
          },
        });
        if (projBtn) top.appendChild(projBtn);
        else top.appendChild(el('span', 'jy-node-ico')).appendChild(icon(levelIcon(n.level)));
      } else {
        var icoName = n.kind === 'bucket' ? 'inbox' : levelIcon(n.level);
        top.appendChild(el('span', 'jy-node-ico')).appendChild(icon(icoName));
      }
      top.appendChild(el('span', 'jy-node-name', n.name));
      node.appendChild(top);
      var meta = n.kind === 'task' ? taskMeta(n) : countLabel(n.counts);
      var metaEl = el('div', 'jy-node-meta' + (meta ? '' : ' is-empty') + (n.rec && n.rec.duePast ? ' is-overdue' : ''), meta || '');
      node.appendChild(metaEl);
      if (n.kind === 'task') {
        node.appendChild(progressRow(n));
        var blocked = !!(n.rec && n.rec.blocked);
        node.appendChild(pauseButton(blocked, 'Bloquée', function () { toggleBlock(n.id); }));
      }
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
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); selectNode(n.id, n.kind === 'task' ? 'task' : 'project'); }
      });
      node.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        menuFor(n.id, node, e);
      });
      return node;
    }

    /** Progress bar of a task box (same as the Tableau and the Kanban): click or drag it to set the %, saved on release. */
    function progressRow(n) {
      var rec = n.rec || {};
      var pct = n.state === 'done' ? 100 : clampPct(rec.progress);
      var row = el('div', 'jy-node-prog' + (pct >= 100 ? ' is-done' : '') + (rec.blocked ? ' is-blocked' : ''));
      var bar = el('span', 'jy-prog-bar gc-nodrag');
      bar.title = 'Cliquer ou glisser pour régler le progrès';
      var fill = el('i');
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      var num = el('span', 'jy-prog-num', pct + '%');
      row.appendChild(bar);
      row.appendChild(num);
      bar.addEventListener('pointerdown', function (ev) {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        var next = pct;
        function at(x) {
          var r = bar.getBoundingClientRect();
          return r.width ? clampPct(((x - r.left) / r.width) * 100) : next;
        }
        function move(e) {
          next = at(e.clientX);
          fill.style.width = next + '%';
          num.textContent = next + '%';
          row.classList.toggle('is-done', next >= 100);
        }
        function up() {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.removeEventListener('pointercancel', up);
          row.classList.remove('is-dragging');
          if (next !== pct) setProgress(n.id, next, pct);
        }
        row.classList.add('is-dragging');
        move(ev);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
      });
      return row;
    }

    function clampPct(v) {
      v = Number(v);
      return isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
    }

    /**
     * The "II" of a task or subtask box: blocks or unblocks it. Quiet when it does not apply (`disabled`), red when
     * blocked.
     */
    function pauseButton(blocked, label, onToggle, disabled) {
      var b = el('button', 'jy-pause gc-nodrag' + (blocked ? ' is-on' : ''));
      b.type = 'button';
      b.title = blocked ? label + ' — cliquer pour débloquer' : 'Bloquer';
      b.setAttribute('aria-label', b.title);
      b.setAttribute('aria-pressed', blocked ? 'true' : 'false');
      b.appendChild(icon('player-pause'));
      if (disabled) b.disabled = true;
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        onToggle();
      });
      return b;
    }

    /** Double-click a task or goal box: edit its title in place (Enter or leaving the field saves, Escape cancels). */
    function editName(node, n) {
      if (node.querySelector('.jy-name-edit')) return;
      var nameEl = node.querySelector('.jy-node-name');
      if (!nameEl) return;
      var input = el('textarea', 'jy-name-edit gc-nodrag');
      input.rows = 1;
      input.maxLength = 300;
      input.setAttribute('aria-label', 'Titre');
      input.value = n.name || '';
      function fit() {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
      }
      var finished = false;
      function finish(save) {
        if (finished) return;
        finished = true;
        var v = input.value.replace(/\s+/g, ' ').trim();
        if (save && v && v !== n.name) {
          if (n.kind === 'task') rename(n.id, v);
          else if (n.kind === 'check') renameSub(n, v);
          else renameGoal(n.id, v);
          return;
        }
        if (input.parentNode) input.replaceWith(nameEl);
      }
      input.addEventListener('input', fit);
      input.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', function () { finish(true); });
      ['pointerdown', 'dblclick', 'wheel', 'click'].forEach(function (type) {
        input.addEventListener(type, function (ev) { ev.stopPropagation(); });
      });
      nameEl.replaceWith(input);
      fit();
      input.focus();
      input.select();
    }

    /**
     * A subtask of a card: a small node under it. Its circle completes it, a double-click renames it, "II" pauses it,
     * and the right-click menu has the rest.
     */
    function checkEl(n) {
      var done = n.state === 'done';
      var blocked = n.state === 'blocked';
      var node = el('div', 'jy-node is-check is-' + (done ? 'done' : (blocked ? 'blocked' : 'open')));
      node.style.left = n.x + 'px';
      node.style.top = n.y + 'px';
      node.style.width = n.w + 'px';
      node.style.height = n.h + 'px';
      node.dataset.id = n.id;
      if (n.parent && n.itemId) {
        node.setAttribute('data-iso-sub', 'sub:' + n.parent + ':' + n.itemId);
        node.setAttribute('data-iso-label', n.name || '');
      }
      var top = el('div', 'jy-node-top');
      var ring = el('button', 'jy-node-ico jy-ico-btn gc-nodrag');
      ring.type = 'button';
      ring.title = done ? 'Faite — cliquer pour rouvrir' : 'Terminer';
      ring.setAttribute('aria-label', done ? 'Rouvrir la sous-tâche' : 'Terminer la sous-tâche');
      ring.setAttribute('aria-pressed', done ? 'true' : 'false');
      ring.appendChild(icon(done ? 'circle-check' : 'circle'));
      ring.addEventListener('click', function (ev) {
        ev.stopPropagation();
        toggleSub(n);
      });
      top.appendChild(ring);
      top.appendChild(el('span', 'jy-node-name', n.name));
      node.appendChild(top);
      if (n.meta) node.appendChild(el('div', 'jy-node-meta' + (n.overdue ? ' is-overdue' : ''), n.meta));
      node.appendChild(pauseButton(blocked, 'Bloquée', function () { blockSub(n); }, done));
      node.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        subMenuFor(n, node, e);
      });
      return node;
    }

    /** The "+" under a card's subtasks; once clicked, a field to type the next subtask (Enter adds it and stays open). */
    function addEl(n) {
      var node = el(n.draft ? 'div' : 'button', 'jy-node is-check is-add gc-nodrag' + (n.draft ? ' is-draft' : ''));
      node.style.left = n.x + 'px';
      node.style.top = n.y + 'px';
      node.style.width = n.w + 'px';
      node.style.height = n.h + 'px';
      node.dataset.id = n.id;
      if (!n.draft) {
        node.type = 'button';
        node.title = 'Nouvelle sous-tâche';
        node.setAttribute('aria-label', 'Nouvelle sous-tâche');
        node.appendChild(icon('plus'));
        node.addEventListener('click', function (ev) {
          ev.stopPropagation();
          startAdding(n.parent);
        });
        return node;
      }
      var input = el('input', 'jy-add-input');
      input.type = 'text';
      input.maxLength = 300;
      input.placeholder = 'Nouvelle sous-tâche…';
      input.setAttribute('aria-label', 'Nouvelle sous-tâche');
      input.value = state.draftText || '';
      var finished = false;
      /** Closes the field in place (no repaint: this may be a click on something else that must still land). */
      function close() {
        if (finished) return;
        finished = true;
        state.adding = null;
        state.draftText = '';
        var shown = container.querySelector('.jy-node[data-id="' + n.id + '"]');
        if (shown && shown.parentNode) {
          var pill = addEl(Object.assign({}, n, { draft: false, w: 24, h: 24 }));
          shown.parentNode.replaceChild(pill, shown);
          if (live && live.byPos[n.id]) { live.byPos[n.id].w = 24; live.byPos[n.id].h = 24; live.byPos[n.id].draft = false; }
        }
      }
      async function submit(keepOpen) {
        var text = input.value.replace(/\s+/g, ' ').trim();
        if (!text) { if (!keepOpen) close(); return; }
        if (state.busy) return;
        if (!keepOpen) { finished = true; state.adding = null; }
        state.draftText = '';
        input.readOnly = true;
        var out = await addSub(n.parent, text);
        if (!out) { // not saved: the field comes back with what was typed
          state.adding = n.parent;
          state.draftText = text;
          paint();
        }
      }
      input.addEventListener('input', function () { state.draftText = input.value; });
      input.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); submit(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      });
      input.addEventListener('blur', function () {
        if (blurGuard || finished || !input.isConnected) return;
        submit(false);
      });
      ['pointerdown', 'dblclick', 'wheel', 'click'].forEach(function (type) {
        input.addEventListener(type, function (ev) { ev.stopPropagation(); });
      });
      node.appendChild(input);
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
          var subBtn = el('button', 'jy-btn', 'Sous-tâche');
          subBtn.type = 'button';
          subBtn.insertBefore(icon('plus'), subBtn.firstChild);
          subBtn.addEventListener('click', function () { startAdding(id); });
          row.appendChild(subBtn);
        } else {
          var reopenBtn = el('button', 'jy-btn', 'Rouvrir');
          reopenBtn.type = 'button';
          reopenBtn.addEventListener('click', function () { reopen(id); });
          row.appendChild(reopenBtn);
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
      var ico = el('button', 'jy-row-ico jy-ico-btn');
      ico.type = 'button';
      ico.appendChild(icon(taskIcon(a.state, a.id === here)));
      if (a.state === 'waiting') {
        ico.disabled = true;
        ico.title = 'En attente d’une autre tâche';
      } else {
        ico.title = 'Terminer';
        ico.setAttribute('aria-label', 'Terminer');
        ico.addEventListener('click', function (e) {
          e.stopPropagation();
          complete(a.id);
        });
      }
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
