/**
 * journey-ui: mount() part 1 of 2.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see journey-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.JourneyUiParts = global.JourneyUiParts || {});
  var P = (global.JourneyUiPartsMountMount = global.JourneyUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.recOf = function recOf(id) {
      var cards = M.state.board.cards || [];
      for (var i = 0; i < cards.length; i++) if (cards[i] && String(cards[i].id) === String(id)) return cards[i];
      return null;
    };
    M.toast = function toast(text) {
      M.state.toast = text || '';
      var token = ++M.state.toastToken;
      M.paint();
      if (!text) return;
      setTimeout(function () {
        if (M.state.toastToken !== token) return;
        M.state.toast = '';
        // only the toast goes: a full repaint would wipe a title or a new subtask being typed
        var tip = M.container.querySelector('.jy-toast');
        if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
      }, 4000);
    };
    M.reload = async function reload() {
      var mine = ++M.state.gen;
      try {
        var data = M.opts.load ? await M.opts.load() : await M.loadBoard();
        if (mine !== M.state.gen) return;
        M.state.board = data || M.state.board;
        if (global.Isolation) global.Isolation.adopt(M.t, (M.state.board && M.state.board.cards) || [], M.state.board && M.state.board.goals);
        M.state.status = '';
        if (!M.state.didHl && global.location) {
          var hl = new URLSearchParams(global.location.search).get('hl');
          if (hl && M.recOf(hl)) {
            M.state.didHl = true;
            M.state.selected = hl;
            M.state.focus = hl;
            M.state.zoom = 'task';
            M.state.scrollTo = hl;
          }
        }
      } catch (e) {
        if (mine !== M.state.gen) return;
        M.state.status = 'Impossible de charger';
      }
      if (mine === M.state.gen) {
        M.state.loading = false;
        M.paint();
      }
    };
    M.loadBoard = async function loadBoard() {
      var board = await S.GT().loadBoard(M.t);
      var goals = { nodes: [], links: [] };
      var gg = S.GG();
      if (gg && typeof gg.isAuthorized === 'function') {
        try {
          M.state.authGoals = !!(await gg.isAuthorized(M.t));
          if (M.state.authGoals && typeof gg.load === 'function') goals = (await gg.load(M.t)) || goals;
        } catch (e) {
          M.state.authGoals = false;
        }
      }
      return {
        lists: (board && board.lists) || [],
        cards: (board && board.cards) || [],
        settings: board && board.settings,
        goals: goals,
      };
    };
    M.listsForNew = function listsForNew() {
      var cats = (M.state.board.settings && M.state.board.settings.listCategories) || {};
      var match = global.StatutMatch;
      return (M.state.board.lists || []).filter(function (l) { return l && l.id; }).map(function (l) {
        var category = cats[String(l.id)] || '';
        var style = match && match.categoryStyle ? match.categoryStyle(category || '_none') : null;
        return { id: l.id, name: l.name || '', category: category, color: style && style.color };
      });
    };
    M.openListId = function openListId() {
      var lists = M.listsForNew();
      for (var i = 0; i < lists.length; i++) {
        if (lists[i].category !== 'completed' && lists[i].category !== 'canceled') return lists[i].id;
      }
      return lists[0] ? lists[0].id : '';
    };
    M.completedListId = function completedListId() {
      var cats = (M.state.board.settings && M.state.board.settings.listCategories) || {};
      var lists = M.state.board.lists || [];
      for (var i = 0; i < lists.length; i++) {
        if (lists[i] && cats[String(lists[i].id)] === 'completed') return lists[i].id;
      }
      return null;
    };
    M.authorize = async function authorize() {
      var gt = S.GT();
      if (gt && typeof gt.ensureRestAuthorized === 'function') {
        var res = await gt.ensureRestAuthorized(M.t);
        if (res && res.ok === false) return false;
      }
      return true;
    };
    M.remember = function remember(label, run) {
      M.state.undo.push({ label: label, run: run });
      if (M.state.undo.length > 20) M.state.undo.shift();
    };
    M.complete = async function complete(id) {
      if (M.state.busy) return;
      var rec = M.recOf(id);
      var ct = S.CT();
      var pt = S.PT();
      if (!rec || !ct || !pt) return;
      M.state.busy = true;
      try {
        if (!(await M.authorize())) { M.toast('Autorisation requise'); M.state.busy = false; return; }
        var prev = typeof ct.getCardCompletionById === 'function' ? await ct.getCardCompletionById(M.t, id) : { items: [] };
        var next = typeof ct.markFullyComplete === 'function' ? ct.markFullyComplete(prev) : prev;
        if (typeof ct.saveCardCompletionById === 'function') await ct.saveCardCompletionById(M.t, id, next);
        var body = { dueComplete: true };
        var listId = M.completedListId();
        if (listId && listId !== rec.listId) body.idList = listId;
        if (typeof pt.restPutCard === 'function') await pt.restPutCard(M.t, id, body);
        var beforeList = rec.listId;
        var beforeDue = !!rec.dueComplete;
        M.remember(rec.name, async function () {
          if (typeof ct.saveCardCompletionById === 'function') await ct.saveCardCompletionById(M.t, id, prev);
          if (typeof pt.restPutCard === 'function') {
            await pt.restPutCard(M.t, id, { dueComplete: beforeDue, idList: beforeList });
          }
        });
        M.toast('Terminée');
        await M.reload();
      } catch (e) {
        M.toast('Pas enregistré');
      }
      M.state.busy = false;
    };
    M.toggleBlock = async function toggleBlock(id) {
      if (M.state.busy) return;
      var rec = M.recOf(id);
      var gt = S.GT();
      if (!rec || !gt || typeof gt.setCardBlocked !== 'function') return;
      M.state.busy = true;
      var next = !rec.blocked;
      try {
        if (!(await M.authorize())) { M.toast('Autorisation requise'); M.state.busy = false; return; }
        var res = await gt.setCardBlocked(M.t, id, next);
        if (!res || res.ok === false) throw new Error('block');
        M.remember(rec.name, async function () { await gt.setCardBlocked(M.t, id, !next); });
        M.toast(next ? 'Bloquée' : 'Débloquée');
        await M.reload();
      } catch (e) {
        M.toast('Pas enregistré');
      }
      M.state.busy = false;
    };
    M.setProgress = async function setProgress(id, pct, prev) {
      var rec = M.recOf(id);
      var cq = global.CardQuick;
      var pt = S.PT();
      if (!rec || !cq || typeof cq.setProgress !== 'function') { M.paint(); return; }
      if (M.state.busy) { M.paint(); return; }
      M.state.busy = true;
      try {
        if (!(await M.authorize())) { M.toast('Autorisation requise'); M.state.busy = false; return; }
        var beforeList = rec.listId;
        var moved = await cq.setProgress(M.t, rec, M.listsForNew(), pct);
        rec.progress = pct;
        M.remember(rec.name, async function () {
          await cq.setProgress(M.t, { id: id }, [], prev);
          if (moved && pt && typeof pt.restPutCard === 'function') await pt.restPutCard(M.t, id, { idList: beforeList });
        });
        M.toast(pct >= 100 ? 'Terminée' : 'Progrès ' + pct + ' %');
        await M.reload();
      } catch (e) {
        M.toast('Pas enregistré');
      }
      M.state.busy = false;
    };
    M.rename = async function rename(id, name) {
      var rec = M.recOf(id);
      var tt = global.TableTrello;
      if (!rec || !tt || typeof tt.saveName !== 'function' || M.state.busy) { M.paint(); return; }
      var before = rec.name || '';
      M.state.busy = true;
      try {
        await tt.saveName(M.t, id, name);
        rec.name = name;
        M.remember(name, async function () { await tt.saveName(M.t, id, before); });
        M.toast('Renommée');
        await M.reload();
      } catch (e) {
        M.toast('Pas enregistré');
      }
      M.state.busy = false;
    };
    M.renameGoal = async function renameGoal(id, name) {
      var gg = S.GG();
      var goals = M.state.board.goals || { nodes: [], links: [] };
      if (M.state.busy || !gg || typeof gg.save !== 'function') { M.paint(); return; }
      if (M.state.authGoals === false) { M.toast('Autorisez Trello pour modifier les objectifs'); return; }
      var before = null;
      var nodes = (goals.nodes || []).map(function (g) {
        if (g.id !== id) return g;
        before = g.name;
        return Object.assign({}, g, { name: name });
      });
      if (before == null) { M.paint(); return; }
      M.state.busy = true;
      try {
        await gg.save(M.t, { nodes: nodes, links: goals.links || [] });
        M.remember(name, async function () {
          await gg.save(M.t, { nodes: (nodes || []).map(function (g) { return g.id === id ? Object.assign({}, g, { name: before }) : g; }), links: goals.links || [] });
        });
        M.toast('Renommé');
        await M.reload();
      } catch (e) {
        M.toast('Pas enregistré');
      }
      M.state.busy = false;
    };
    M.archive = async function archive(id) {
      if (M.state.busy) return;
      var rec = M.recOf(id);
      var tt = global.TableTrello;
      if (!rec || !tt || typeof tt.archiveCard !== 'function') return;
      M.state.busy = true;
      try {
        if (!(await M.authorize())) { M.toast('Autorisation requise'); M.state.busy = false; return; }
        await tt.archiveCard(M.t, id);
        M.remember(rec.name, async function () {
          if (typeof tt.unarchiveCard === 'function') await tt.unarchiveCard(M.t, id);
        });
        M.toast('Archivée');
        await M.reload();
      } catch (e) {
        M.toast('Pas enregistré');
      }
      M.state.busy = false;
    };
    M.reopen = async function reopen(id) {
      if (M.state.busy) return;
      var rec = M.recOf(id);
      var ct = S.CT();
      var pt = S.PT();
      if (!rec || !ct || !pt) return;
      M.state.busy = true;
      try {
        if (!(await M.authorize())) { M.toast('Autorisation requise'); M.state.busy = false; return; }
        var prev = typeof ct.getCardCompletionById === 'function' ? await ct.getCardCompletionById(M.t, id) : { items: [] };
        var next = typeof ct.markNotFullyComplete === 'function' ? ct.markNotFullyComplete(prev) : prev;
        if (typeof ct.saveCardCompletionById === 'function') await ct.saveCardCompletionById(M.t, id, next);
        var body = { dueComplete: false };
        var beforeList = rec.listId;
        var beforeDue = !!rec.dueComplete;
        if (rec.category === 'completed' && M.openListId()) body.idList = M.openListId();
        if (typeof pt.restPutCard === 'function') await pt.restPutCard(M.t, id, body);
        M.remember(rec.name, async function () {
          if (typeof ct.saveCardCompletionById === 'function') await ct.saveCardCompletionById(M.t, id, prev);
          if (typeof pt.restPutCard === 'function') await pt.restPutCard(M.t, id, { dueComplete: beforeDue, idList: beforeList });
        });
        M.toast('Rouverte');
        await M.reload();
      } catch (e) {
        M.toast('Pas enregistré');
      }
      M.state.busy = false;
    };
    M.patchItems = function patchItems(cardId, data) {
      var rec = M.recOf(cardId);
      var ct = S.CT();
      if (!rec || !data) return;
      rec.items = data.items || [];
      if (ct && typeof ct.computeCardProgress === 'function') {
        var p = ct.computeCardProgress(data);
        if (p && typeof p.percent === 'number') rec.progress = p.percent;
      }
    };
    M.editItems = async function editItems(cardId, label, change) {
      var ct = S.CT();
      if (M.state.busy || !ct || !M.recOf(cardId) || typeof ct.getCardCompletionById !== 'function') return null;
      M.state.busy = true;
      var out = null;
      try {
        if (!(await M.authorize())) { M.toast('Autorisation requise'); M.state.busy = false; return null; }
        var before = ct.normalizeCompletionData((await ct.getCardCompletionById(M.t, cardId)) || { items: [] });
        out = change(before);
        if (!out || !out.data) { M.state.busy = false; return null; }
        await ct.saveCardCompletionById(M.t, cardId, out.data);
        M.remember(label, async function () { await ct.saveCardCompletionById(M.t, cardId, before); });
        M.patchItems(cardId, out.data);
        M.toast(label);
      } catch (e) {
        out = null;
        M.toast('Pas enregistré');
      }
      M.state.busy = false;
      if (out) M.reload();
      return out;
    };
    M.itemOf = function itemOf(n) {
      var rec = M.recOf(n.parent);
      var items = (rec && rec.items) || [];
      for (var i = 0; i < items.length; i++) if (items[i] && String(items[i].id) === n.itemId) return items[i];
      return null;
    };
    M.toggleSub = function toggleSub(n) {
      if (!n.itemId) return null;
      var done = n.state !== 'done';
      return M.editItems(n.parent, done ? 'Sous-tâche terminée' : 'Sous-tâche rouverte', function (data) {
        return { data: S.CT().applyItemProgress(data, n.itemId, done ? 100 : 0) };
      });
    };
    M.setSubProgress = function setSubProgress(n, pct) {
      if (!n.itemId) return null;
      return M.editItems(n.parent, pct >= 100 ? 'Sous-tâche terminée' : 'Progrès ' + pct + ' %', function (data) {
        return { data: S.CT().applyItemProgress(data, n.itemId, pct) };
      });
    };
    M.blockSub = function blockSub(n) {
      if (!n.itemId || n.state === 'done') return null;
      var next = n.state !== 'blocked';
      return M.editItems(n.parent, next ? 'Sous-tâche bloquée' : 'Sous-tâche débloquée', function (data) {
        return { data: S.CT().setItemBlocked(data, n.itemId, next) };
      });
    };
    M.renameSub = function renameSub(n, text) {
      if (!n.itemId) return null;
      return M.editItems(n.parent, 'Renommée', function (data) {
        return { data: S.CT().applyItemText(data, n.itemId, text) };
      });
    };
    M.deleteSub = function deleteSub(n) {
      var gt = S.GT();
      if (!n.itemId || !gt || typeof gt.removeTopLevelItem !== 'function') return null;
      return M.editItems(n.parent, 'Sous-tâche supprimée', function (data) {
        return { data: gt.removeTopLevelItem(data, n.itemId) };
      });
    };
    M.setSubDue = function setSubDue(n, day) {
      if (!n.itemId) return null;
      var item = M.itemOf(n) || {};
      var parts = { startDate: item.startDate, startTime: item.startTime, dueDate: day, dueTime: day ? item.dueTime : '' };
      return M.editItems(n.parent, day ? 'Échéance réglée' : 'Échéance retirée', function (data) {
        return { data: S.CT().applyItemDates(data, n.itemId, null, parts) };
      });
    };
    M.setSubEstimate = function setSubEstimate(n, minutes) {
      if (!n.itemId) return null;
      return M.editItems(n.parent, minutes ? 'Effort réglé' : 'Effort retiré', function (data) {
        return { data: S.CT().applyItemEstimate(data, n.itemId, minutes || null, { lock: true }) };
      });
    };
    M.addSub = async function addSub(cardId, text) {
      var title = String(text || '').replace(/\s+/g, ' ').trim();
      if (!title) return null;
      var out = await M.editItems(cardId, 'Sous-tâche ajoutée', function (data) {
        var added = S.CT().addLocalItem(data, title);
        return added.item ? { data: added.data, item: added.item } : null;
      });
      return out;
    };
    M.startAdding = function startAdding(cardId) {
      M.state.adding = String(cardId);
      M.state.draftText = '';
      if (M.live && M.live.byPos['add:' + cardId]) M.paint();
      else M.selectNode(cardId, 'task');
    };
    M.openCard = function openCard(id) {
      var rec = M.recOf(id);
      if (!rec || !global.TaskFocus) return;
      global.TaskFocus.open({
        t: M.t,
        cardId: rec.id,
        name: rec.name || '',
        onChange: function () { M.reload(); },
      });
    };
    M.goView = function goView(page, id) {
      if (!global.ViewTabs || !global.location) return;
      global.location.assign(global.ViewTabs.hrefForCard(page, global.location, id));
    };
    M.createUnder = function createUnder(goal) {
      if (!global.NewCard || typeof global.NewCard.open !== 'function') return;
      var lists = M.listsForNew();
      if (!lists.length) return;
      global.NewCard.open({
        t: M.t,
        lists: lists,
        listId: M.openListId(),
        onCreated: function (res) {
          var cardId = res && res.cardId;
          if (!cardId || !goal || goal.kind === 'bucket') { M.reload(); return; }
          M.linkTask(cardId, goal.id).then(function () { M.reload(); }, function () { M.reload(); });
        },
        onError: function () { M.toast('Pas créée'); },
      });
    };
    M.linkTask = function linkTask(cardId, goalId) {
      var gg = S.GG();
      if (!gg || typeof gg.save !== 'function') return Promise.resolve();
      var goals = M.state.board.goals || { nodes: [], links: [] };
      var link = { from: 't:' + cardId, to: goalId };
      var already = (goals.links || []).some(function (l) {
        return l && l.from === link.from && l.to === link.to;
      });
      if (already) return Promise.resolve();
      return gg.save(M.t, {
        nodes: goals.nodes || [],
        links: (goals.links || []).concat([link]),
      });
    };
    M.connectGoals = function connectGoals() {
      var gg = S.GG();
      if (!gg || typeof gg.authorize !== 'function') return;
      gg.authorize(M.t).then(function () { M.reload(); }, function () { M.toast('Pas enregistré'); });
    };
    M.undo = async function undo() {
      var entry = M.state.undo.pop();
      if (!entry) return;
      M.state.busy = true;
      try {
        await entry.run();
        M.state.toast = '';
        await M.reload();
      } catch (e) {
        M.toast('Pas annulé');
      }
      M.state.busy = false;
    };
    M.onKey = function onKey(e) {
      if (!M.container.isConnected) return;
      var typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey && !typing) {
        e.preventDefault();
        M.undo();
        return;
      }
      if (e.key === '/' && !typing) {
        e.preventDefault();
        var box = M.container.querySelector('.jy-search');
        if (box) box.focus();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && M.state.selectedEdge) {
        e.preventDefault();
        M.removeSelectedEdge();
        return;
      }
      if (e.key === 'Escape' && !typing) {
        if (M.state.selectedEdge) { M.state.selectedEdge = null; M.paint(); return; }
        if (M.state.query) { M.state.query = ''; M.paint(); return; }
        if (M.state.zoom !== 'overview' || M.state.focus || M.state.selected) {
          M.state.zoom = 'overview';
          M.state.focus = null;
          M.state.selected = null;
          M.paint();
        }
      }
    };
    M.pickNode = function pickNode(n, node) {
      var again = M.pendingPick && M.pendingPick.id === n.id;
      if (M.pendingPick) { clearTimeout(M.pendingPick.timer); M.pendingPick = null; }
      if (n.kind !== 'task' && n.kind !== 'goal' && n.kind !== 'check') { M.selectNode(n.id, 'project'); return; }
      if (again) {
        var box = node.isConnected ? node : M.container.querySelector('.jy-node[data-id="' + n.id + '"]');
        if (box) M.editName(box, n);
        return;
      }
      M.pendingPick = {
        id: n.id,
        timer: setTimeout(function () {
          M.pendingPick = null;
          if (n.kind === 'check') M.selectNode(n.parent, 'task');
          else M.selectNode(n.id, n.kind === 'task' ? 'task' : 'project');
        }, 260),
      };
    };
    M.selectNode = function selectNode(id, zoom) {
      M.state.selected = id;
      M.state.focus = id;
      if (zoom) M.state.zoom = zoom;
      M.state.scrollTo = id;
      M.paint();
    };
    M.dayOffset = function dayOffset(days) {
      var d = new Date();
      d.setDate(d.getDate() + days);
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    };
    M.subMenuFor = function subMenuFor(n, node, point) {
      if (!global.ContextMenu || !n.itemId) return;
      var done = n.state === 'done';
      var items = [
        { id: 'done', label: done ? 'Rouvrir' : 'Terminer', icon: done ? 'circle' : 'circle-check', action: function () { M.toggleSub(n); } },
      ];
      if (!done) {
        items.push({
          id: 'block',
          label: n.state === 'blocked' ? 'Débloquer' : 'Bloquer',
          icon: 'player-pause',
          action: function () { M.blockSub(n); },
        });
      }
      items.push({ id: 'rename', label: 'Renommer', icon: 'pencil', action: function () { M.editName(node, n); } });
      items.push({ sep: true });
      items.push({
        id: 'progress',
        label: 'Progrès',
        icon: 'progress',
        children: [0, 25, 50, 75, 100].map(function (p) {
          return { id: 'p' + p, label: p + ' %', icon: 'progress', checked: Math.round(n.progress || 0) === p, action: function () { M.setSubProgress(n, p); } };
        }),
      });
      var dues = [
        { id: 'd0', label: 'Aujourd’hui', icon: 'circle-dot', day: M.dayOffset(0) },
        { id: 'd1', label: 'Demain', icon: 'arrow-curve-right', day: M.dayOffset(1) },
        { id: 'd7', label: 'Dans une semaine', icon: 'calendar-week', day: M.dayOffset(7) },
      ].map(function (d) {
        return { id: d.id, label: d.label, icon: d.icon, checked: n.dueDate === d.day, action: function () { M.setSubDue(n, d.day); } };
      });
      if (n.dueDate) dues.push({ id: 'dnone', label: 'Retirer la date', icon: 'calendar-off', action: function () { M.setSubDue(n, ''); } });
      items.push({ id: 'due', label: 'Échéance', icon: 'calendar-event', children: dues });
      var efforts = [5, 15, 30, 60, 120, 240].map(function (m) {
        return { id: 'e' + m, label: S.JM().formatMinutes(m), icon: 'clock', checked: n.minutes === m, action: function () { M.setSubEstimate(n, m); } };
      });
      if (n.minutes) efforts.push({ id: 'enone', label: 'Non estimée', icon: 'clock-off', action: function () { M.setSubEstimate(n, 0); } });
      items.push({ id: 'estimate', label: 'Effort', icon: 'clock', children: efforts });
      items.push({ sep: true });
      items.push({ id: 'open', label: 'Ouvrir la carte', icon: 'external-link', action: function () { M.openCard(n.parent); } });
      items.push({ sep: true });
      items.push({ id: 'delete', label: 'Supprimer', icon: 'trash', danger: true, action: function () { M.deleteSub(n); } });
      if (global.Isolation && n.parent && n.itemId) {
        items = items.concat(global.Isolation.menuItems({
          cardId: n.parent,
          subId: 'sub:' + n.parent + ':' + n.itemId,
          subName: n.name || '',
        }));
      }
      global.ContextMenu.show(point, items);
    };
    M.menuFor = function menuFor(id, anchor, point) {
      if (!global.ContextMenu) return;
      var rec = M.recOf(id);
      var node = S.JM().prepare(M.state.board.cards, M.state.board.goals).byId[id];
      if (!node) return;
      var items = [];
      if (rec) {
        if (global.TableTrello && global.TableTrello.archiveCard) {
          items.push({ id: 'archive', label: 'Archiver', icon: 'archive', danger: true, action: function () { M.archive(id); } });
          items.push({ sep: true });
        }
        items.push({ id: 'open', label: 'Ouvrir', icon: 'external-link', action: function () { M.openCard(id); } });
        var closed = !!(S.JM().isClosed && S.JM().isClosed(rec));
        items.push(closed
          ? { id: 'done', label: 'Rouvrir', icon: 'circle', action: function () { M.reopen(id); } }
          : { id: 'done', label: 'Terminer', icon: 'check', success: true, action: function () { M.complete(id); } });
        if (!closed) {
          items.push({ id: 'sub', label: 'Nouvelle sous-tâche', icon: 'plus', action: function () { M.startAdding(id); } });
        }
        var box = M.container.querySelector('.jy-node[data-id="' + id + '"]');
        if (box) items.push({ id: 'rename', label: 'Renommer', icon: 'pencil', action: function () { M.editName(box, { id: id, kind: 'task', name: rec.name || '' }); } });
        items.push({
          id: 'block',
          label: rec.blocked ? 'Débloquer' : 'Bloquer',
          icon: 'player-pause',
          action: function () { M.toggleBlock(id); },
        });
        if (global.CardFields) {
          items.push({ sep: true });
          ['priority', 'due', 'estimate', 'progress', 'blocked'].forEach(function (kind) {
            var labels = { priority: 'Priorité', due: 'Échéance', estimate: 'Effort', progress: 'Progrès', blocked: 'Blocage' };
            items.push({
              id: kind,
              label: labels[kind],
              action: function () { global.CardFields.open(kind, { t: M.t, cardId: id, anchor: anchor }); },
            });
          });
        }
        items.push({ sep: true });
        items.push({
          id: 'views',
          label: 'Ouvrir dans',
          icon: 'app-window',
          children: [
            { id: 'table', label: 'Tableau', action: function () { M.goView('./table.html', id); } },
            { id: 'gantt', label: 'Gantt', action: function () { M.goView('./gantt.html', id); } },
            { id: 'kanban', label: 'Kanban', action: function () { M.goView('./kanban.html', id); } },
            { id: 'mindmap', label: 'Mindmap', action: function () { M.goView('./mindmap.html', id); } },
          ],
        });
      } else if (node.kind === 'goal') {
        items.push({ id: 'add', label: 'Nouvelle tâche', icon: 'plus', action: function () { M.createUnder(node); } });
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
    };
    M.paint = function paint() {
      M.live = null;
      var search = M.container.querySelector('.jy-search');
      var keepFocus = search && document.activeElement === search;
      var caret = keepFocus ? search.selectionStart : null;
      M.blurGuard = true;
      M.container.textContent = '';
      M.blurGuard = false;
      var empty = !(M.state.board.cards && M.state.board.cards.length);
      if (M.state.loading && empty) {
        M.container.innerHTML = global.Skeleton.html('journey');
        return;
      }
      if (M.state.status && empty) {
        M.container.appendChild(S.el('div', 'jy-status', M.state.status));
        return;
      }

      var now = new Date();
      var graph = S.JM().prepare(M.state.board.cards, M.state.board.goals);
      var full = S.JM().nextActions(graph, { now: now, limit: 10000, blockedLimit: 10000 });
      var here = full.now[0] ? full.now[0].id : null;
      var view = S.JM().layout(graph, {
        zoom: M.state.zoom,
        focus: M.state.focus,
        hideDone: M.state.hideDone,
        query: M.state.query,
        now: now,
        hereId: here,
        adding: M.state.adding,
      });
      var byPos = Object.create(null);
      view.nodes.forEach(function (n) {
        var p = M.state.pos[n.id];
        if (p && isFinite(p.x) && isFinite(p.y)) { n.x = p.x; n.y = p.y; }
        byPos[n.id] = n;
      });
      view.nodes.forEach(function (n) {
        var owner = (n.kind === 'check' || n.kind === 'add') && byPos[n.parent];
        if (!owner) return;
        var moved = M.state.pos[n.id]; // a subtask the user moved keeps its place relative to its card
        if (moved && isFinite(moved.dx) && isFinite(moved.dy)) { n.offX = moved.dx; n.offY = moved.dy; }
        n.x = owner.x + n.offX;
        n.y = owner.y + n.offY;
      });

      var root = S.el('div', 'jy');
      root.appendChild(M.bar(graph));
      var body = S.el('div', 'jy-body');
      var stage = S.el('div', 'jy-stage');
      stage.appendChild(M.mapOf(graph, view, byPos));
      stage.appendChild(M.detail(graph, full));
      body.appendChild(stage);
      body.appendChild(M.queue(full, here));
      root.appendChild(body);
      M.container.appendChild(root);
      global.Skeleton.remember('journey', { nodes: view.nodes.length, now: Math.min(full.now.length, 10), blocked: Math.min(full.blocked.length, 6) });

      if (keepFocus) {
        var again = M.container.querySelector('.jy-search');
        if (again) {
          again.focus();
          if (caret != null && again.setSelectionRange) again.setSelectionRange(caret, caret);
        }
      } else if (M.state.adding) {
        var draft = M.container.querySelector('.jy-add-input');
        if (draft) {
          draft.focus({ preventScroll: true });
          draft.setSelectionRange(draft.value.length, draft.value.length);
        } else {
          M.state.adding = null; // the card is no longer on the map
        }
      }
      M.settleView();
    };
    M.bar = function bar(graph) {
      var row = S.el('div', 'jy-bar');
      var search = S.el('input', 'jy-search tp-search-input');
      search.type = 'search';
      search.placeholder = 'Rechercher…';
      search.value = M.state.query;
      search.setAttribute('aria-label', 'Rechercher');
      search.addEventListener('input', function () {
        M.state.query = search.value;
        M.state.fitNext = true;
        M.paint();
      });
      var searchBox = S.el('label', 'tp-search');
      searchBox.appendChild(S.icon('search'));
      searchBox.appendChild(search);
      row.appendChild(searchBox);

      var zoom = S.el('div', 'jy-zoom');
      zoom.setAttribute('role', 'group');
      zoom.setAttribute('aria-label', 'Niveau');
      S.ZOOMS.forEach(function (z) {
        var b = S.el('button', M.state.zoom === z.id ? 'is-on' : '', z.label);
        b.type = 'button';
        b.setAttribute('aria-pressed', M.state.zoom === z.id ? 'true' : 'false');
        b.addEventListener('click', function () {
          M.state.zoom = z.id;
          if (z.id === 'overview') { M.state.focus = null; }
          if (z.id === 'task' && M.state.selected && graph.byId[M.state.selected] && graph.byId[M.state.selected].kind === 'task') {
            M.state.focus = M.state.selected;
          }
          M.state.fitNext = true;
          M.paint();
        });
        zoom.appendChild(b);
      });
      row.appendChild(zoom);

      var eye = S.el('button', 'jy-iconbtn' + (M.state.hideDone ? '' : ' is-quiet'));
      eye.type = 'button';
      eye.title = global.HideDone ? global.HideDone.title(M.state.hideDone) : 'Terminées';
      eye.appendChild(S.icon(global.HideDone ? global.HideDone.icon(M.state.hideDone) : 'eye-off'));
      eye.addEventListener('click', function () {
        M.state.hideDone = global.HideDone ? global.HideDone.toggle() : !M.state.hideDone;
        M.paint();
      });
      row.appendChild(eye);

      var tidy = S.el('button', 'jy-iconbtn' + (Object.keys(M.state.pos).length ? '' : ' is-quiet'));
      tidy.type = 'button';
      tidy.title = 'Réorganiser';
      tidy.setAttribute('aria-label', 'Réorganiser');
      tidy.appendChild(S.icon('sitemap'));
      tidy.addEventListener('click', function () { M.resetPos(); });
      row.appendChild(tidy);

      if (M.state.authGoals === false) {
        var flag = S.el('button', 'jy-iconbtn is-quiet');
        flag.type = 'button';
        flag.title = 'Objectifs';
        flag.appendChild(S.icon('flag-3'));
        flag.addEventListener('click', M.connectGoals);
        row.appendChild(flag);
      }

      var crumb = S.el('div', 'jy-crumb');
      var home = S.el('button', '', 'Carte');
      home.type = 'button';
      home.addEventListener('click', function () {
        M.state.zoom = 'overview';
        M.state.focus = null;
        M.state.selected = null;
        M.state.fitNext = true;
        M.paint();
      });
      crumb.appendChild(home);
      var trailId = M.state.focus || M.state.selected;
      if (trailId && graph.byId[trailId]) {
        S.JM().chain(graph, trailId).forEach(function (step) {
          crumb.appendChild(S.el('span', '', '/'));
          var b = S.el('button', '', step.name);
          b.type = 'button';
          b.addEventListener('click', function () { M.selectNode(step.id, 'project'); });
          crumb.appendChild(b);
        });
      }
      row.appendChild(crumb);

      var key = S.el('div', 'jy-key');
      key.appendChild(M.keyItem('', 'Contribue'));
      key.appendChild(M.keyItem('is-needs', 'Nécessite'));
      key.appendChild(M.keyItem('is-after', 'Ensuite'));
      key.appendChild(M.keyItem('is-cross', 'Aussi'));
      row.appendChild(key);
      return row;
    };
    M.keyItem = function keyItem(cls, label) {
      var s = S.el('span', '');
      var sw = S.el('i', 'jy-swatch' + (cls ? ' ' + cls : ''));
      s.appendChild(sw);
      s.appendChild(document.createTextNode(label));
      return s;
    };
    M.GC = function GC() { return global.GraphCanvas; };
    M.mapOf = function mapOf(graph, view, byPos) {
      var gcm = M.GC();
      var wrap = S.el('div', 'jy-map');
      var pct = S.el('span', 'jy-zoomtools-pct', M.state.view ? Math.round(M.state.view.k * 100) + ' %' : '100 %');
      var nodeEls = Object.create(null);
      var refs = Object.create(null);
      var handles = [];
      var gc = gcm.create(wrap, {
        view: M.state.view || undefined,
        onView: function (v) {
          M.state.view = v;
          pct.textContent = Math.round(v.k * 100) + ' %';
        },
        onBackground: function (target) {
          var w = target && target.closest && target.closest('.jy-wire');
          if (w) selectEdge(w.getAttribute('data-id'));
          else if (M.state.selectedEdge) selectEdge(null);
        },
      });

      function nodeIds(e) { return [e.from, e.to]; }

      function drawEdge(ref) {
        var a = byPos[ref.e.from];
        var b = byPos[ref.e.to];
        if (!a || !b) return;
        if (M.isTree(ref.e)) {
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
        var g = S.svgEl('g');
        g.setAttribute('class', M.edgeClass(e, graph) + (M.state.selectedEdge === e.id ? ' is-selected' : ''));
        g.setAttribute('data-id', e.id);
        var hit = S.svgEl('path');
        hit.setAttribute('class', 'jy-edge-hit');
        var line = S.svgEl('path');
        line.setAttribute('class', 'jy-edge');
        var arrow = S.svgEl('path');
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
          return id && id !== selfId && id !== S.JM().ORPHAN_ID ? id : null;
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
          onDrop: function (id) { M.linkFromPin(graph, n, side, id); },
        });
      }

      /** Two grab handles on the ends of the selected link: drag one onto another box to move that end. */
      function drawHandles() {
        handles.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
        handles = [];
        var ref = M.state.selectedEdge && refs[M.state.selectedEdge];
        if (!ref || !ref.ends || (ref.e.kind !== 'depends' && ref.e.kind !== 'serves') || ref.e.to === S.JM().ORPHAN_ID) return;
        ['from', 'to'].forEach(function (end, i) {
          var c = S.svgEl('circle');
          c.setAttribute('class', 'jy-handle');
          c.setAttribute('r', '7');
          c.setAttribute('cx', ref.ends[i].x.toFixed(1));
          c.setAttribute('cy', ref.ends[i].y.toFixed(1));
          var tip = S.svgEl('title');
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
              onDrop: function (id) { M.moveEnd(graph, e, end, id); },
            });
          });
          gc.svg.appendChild(c);
          handles.push(c);
        });
      }

      function selectEdge(id) {
        M.state.selectedEdge = id || null;
        Object.keys(refs).forEach(function (k) { refs[k].g.classList.toggle('is-selected', k === M.state.selectedEdge); });
        drawHandles();
      }

      var babiesOf = Object.create(null);
      view.nodes.forEach(function (n) {
        if (n.kind === 'check' || n.kind === 'add') (babiesOf[n.parent] = babiesOf[n.parent] || []).push(n);
      });

      view.nodes.forEach(function (n) {
        var node = M.nodeEl(n, graph);
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
              M.state.pos[n.id] = { dx: n.offX, dy: n.offY };
              M.savePos();
            },
            onClick: function () { M.pickNode(n, node); },
          });
          gc.world.appendChild(node);
          return;
        }
        ['top', 'right', 'bottom', 'left'].forEach(function (side) {
          var pin = S.el('span', 'jy-pin gc-nodrag is-' + side);
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
            M.state.pos[n.id] = { x: n.x, y: n.y };
            M.savePos();
          },
          onClick: function () { M.pickNode(n, node); },
        });
        gc.world.appendChild(node);
      });
      drawHandles();

      var tools = S.el('div', 'jy-zoomtools gc-nodrag');
      function tool(name, title, fn) {
        var b = S.el('button', 'jy-zoomtools-btn');
        b.type = 'button';
        b.title = title;
        b.setAttribute('aria-label', title);
        b.appendChild(S.icon(name));
        b.addEventListener('click', fn);
        tools.appendChild(b);
      }
      tool('zoom-out', 'Dézoomer', function () { gc.zoomBy(1 / 1.25); });
      tools.appendChild(pct);
      tool('zoom-in', 'Zoomer', function () { gc.zoomBy(1.25); });
      tool('focus-2', 'Tout voir', function () { M.fitNow(); });
      wrap.appendChild(tools);

      if (M.state.toast) {
        var tip = S.el('div', 'jy-toast');
        tip.appendChild(document.createTextNode(M.state.toast));
        var back = S.el('button', '', 'Annuler');
        back.type = 'button';
        back.addEventListener('click', function () { M.undo(); });
        tip.appendChild(back);
        wrap.appendChild(tip);
      }
      if (global.AddRow && M.openListId()) {
        wrap.appendChild(global.AddRow.line({
          float: true,
          onSubmit: function (title, input) { M.addTask(title, input); },
        }));
      }
      M.live = { gc: gc, view: view, byPos: byPos };
      return wrap;
    };
    M.addTask = async function addTask(title, input) {
      var tt = global.TableTrello;
      var listId = M.openListId();
      if (!tt || typeof tt.createRow !== 'function' || !listId) return;
      input.disabled = true;
      var QP = global.QuickParse;
      var q = QP && QP.parse ? QP.parse(title) : { name: title, dueDate: '' };
      try {
        var res = await tt.createRow(M.t, q.name || title, listId);
        if (res && res.cardId && q.dueDate && global.GanttTrello) {
          try { await global.GanttTrello.saveCardDates(M.t, res.cardId, { dueDate: q.dueDate }); } catch (e) { /* the card exists; set the date by hand */ }
        }
        await M.reload();
        var next = document.querySelector('.jy-map .ar-input');
        if (next) next.focus({ preventScroll: true });
      } catch (e) {
        input.disabled = false;
        M.toast('Pas créée');
      }
    };
    M.fitNow = function fitNow() {
      if (!M.live || !M.live.view.nodes.length) return;
      var box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      M.live.view.nodes.forEach(function (n) {
        box.x0 = Math.min(box.x0, n.x); box.y0 = Math.min(box.y0, n.y);
        box.x1 = Math.max(box.x1, n.x + n.w); box.y1 = Math.max(box.y1, n.y + n.h);
      });
      var s = M.live.gc.size();
      M.live.gc.setView(M.GC().fitView(box, s.w, s.h, 40, 1, 0.3));
    };
    M.revealSmoothly = function revealSmoothly(gc, n) {
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
        if (!M.live || M.live.gc !== gc) return;
        if (t0 === null) t0 = now;
        var p = Math.min(1, (now - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        gc.setView({ x: from.x + dx * e, y: from.y + dy * e, k: from.k });
        if (p < 1) global.requestAnimationFrame(step);
      };
      global.requestAnimationFrame(step);
    };
    M.settleView = function settleView() {
      if (!M.live) return;
      var gc = M.live.gc;
      if (M.state.scrollTo) {
        var n = M.live.byPos[M.state.scrollTo];
        M.state.scrollTo = null;
        if (n) {
          if (M.state.view) M.revealSmoothly(gc, n); else gc.setView(M.GC().centerOn(n.x + n.w / 2, n.y + n.h / 2, gc.size().w, gc.size().h, gc.view.k));
          return;
        }
      }
      if (!M.state.view || M.state.fitNext) {
        M.state.fitNext = false;
        M.fitNow();
      }
    };
    M.posKey = function posKey() {
      var board = '';
      try { board = (M.t && typeof M.t.getContext === 'function' && M.t.getContext().board) || ''; } catch (e) { /* no context */ }
      return 'tp-journey-pos' + (board ? ':' + board : '');
    };
    M.loadPos = function loadPos() {
      try {
        var raw = global.localStorage && global.localStorage.getItem(M.posKey());
        var o = raw ? JSON.parse(raw) : {};
        return o && typeof o === 'object' ? o : {};
      } catch (e) {
        return {};
      }
    };
    M.savePos = function savePos() {
      try { if (global.localStorage) global.localStorage.setItem(M.posKey(), JSON.stringify(M.state.pos)); } catch (e) { /* storage unavailable */ }
    };
    M.resetPos = function resetPos() {
      if (!Object.keys(M.state.pos).length) return;
      var before = M.state.pos;
      M.state.pos = {};
      M.savePos();
      M.remember('Disposition', async function () { M.state.pos = before; M.savePos(); });
      M.state.fitNext = true;
      M.toast('Boîtes réorganisées');
    };
    M.isTree = function isTree(e) { return e.kind === 'check' || e.kind === 'sub'; };
    M.edgeClass = function edgeClass(e, graph) {
      var base = 'jy-wire';
      if (e.kind === 'serves') return base + ' is-serves' + (e.cross ? ' is-cross' : '');
      if (e.kind === 'check') return base + ' is-sub is-tree is-check';
      if (e.kind === 'sub') return base + ' is-sub is-tree';
      if (e.dep === 'after') return base + ' is-after';
      if (e.dep === 'parts') return base + ' is-parts';
      var open = graph.state[e.to] && graph.state[e.to] !== 'done';
      return base + ' is-needs' + (open ? ' is-open' : ' is-met');
    };
    M.refFor = function refFor(graph, id) {
      var n = graph.byId[id];
      return n && n.kind === 'task' ? 't:' + id : id;
    };
    M.sameRef = function sameRef(ref, id) { return ref === id || ref === 't:' + id; };
    M.linkProblem = function linkProblem(graph, kind, from, to, except) {
      var a = graph.byId[from];
      var b = graph.byId[to];
      if (!a || !b || from === to) return 'Choisissez une autre boîte';
      if (kind === 'depends') {
        if (a.kind !== 'task' || b.kind !== 'task') return 'Seules deux tâches peuvent dépendre l’une de l’autre';
        if (S.JM().wouldCycle(graph, from, to, except)) return 'Impossible : cela créerait une boucle de dépendances';
        return '';
      }
      if (S.JM().rankOfNode(a) <= S.JM().rankOfNode(b) || S.JM().rankOfNode(b) < 0) return 'Choisissez un élément d’un niveau supérieur';
      if (M.state.authGoals === false) return 'Autorisez Trello pour modifier les objectifs';
      return '';
    };
    },
    run: function (M) {
    if (!M.container || !S.JM()) return { v: null };
    M.opts = M.opts || {};
    M.state = {
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
    M.live = null;
    M.blurGuard = false;
    M.state.pos = M.loadPos();
    if (global.HideDone && global.HideDone.subscribe) {
      global.HideDone.subscribe(function (on) {
        M.state.hideDone = on;
        M.paint();
      });
    }
    document.addEventListener('keydown', M.onKey);
    M.pendingPick = null;
    }
  });
})(typeof window !== 'undefined' ? window : this);
