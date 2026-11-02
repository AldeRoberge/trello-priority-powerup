/**
 * dashboard-ui: mount() part 1 of 3.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see dashboard-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.DashboardUiParts = global.DashboardUiParts || {});
  var P = (global.DashboardUiPartsMountMount = global.DashboardUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.triageRows = function triageRows() {
      var rows = M.viewRows();
      if (!M.state.triageAll || !S.WO() || typeof S.WO().projectOf !== 'function') return S.DM().triageQueue(rows);
      return rows.filter(function (r) {
        if (r.statutKey === 'triage') return true;
        return S.DM().isOpen(r) && !!S.WO().projectOf(M.state.goals, r.id);
      }).sort(function (a, b) { return (a.pos || 0) - (b.pos || 0); });
    };
    M.viewRows = function viewRows() {
      return M.state.filter && S.TM() ? S.TM().filterRows(M.state.rows, M.state.filter) : M.state.rows;
    };
    M.setStatus = function setStatus(msg, kind, keepMs, action) {
      M.state.status = msg || '';
      M.state.statusKind = kind || '';
      M.els.status.className = 'db-status' + (kind ? ' is-' + kind : '');
      M.els.status.textContent = '';
      if (kind === 'ok') M.els.status.appendChild(S.icon('check'));
      if (kind === 'busy') M.els.status.appendChild(S.icon('refresh', 'db-spin'));
      if (kind === 'error') M.els.status.appendChild(S.icon('alert-triangle'));
      M.els.status.appendChild(document.createTextNode(msg || ''));
      if (action && typeof action.run === 'function') {
        M.els.status.appendChild(S.h('button', { class: 'db-undo', type: 'button', onclick: function () { action.run(); } }, [S.icon('arrow-back-up'), document.createTextNode(action.label)]));
      }
      clearTimeout(M.statusTimer);
      if (msg && kind !== 'error' && kind !== 'busy') {
        M.statusTimer = setTimeout(function () { M.setStatus('', ''); }, keepMs || 2500);
      }
    };
    M.hasTriage = function hasTriage() {
      return !!S.DT().listFor(M.state.lists, ['triage']);
    };
    M.activateInbox = function activateInbox() {
      if (M.state.busy) return;
      M.state.busy = true;
      M.setStatus('Préparation de la boîte de triage…', 'busy');
      S.DT().ensureInbox(M.t, M.state.lists).then(function (res) {
        // Trello's client cache can lag behind a REST list creation: reload until the list shows up.
        function again(n) {
          return M.reload({ quiet: true }).then(function () {
            if (M.hasTriage() || n >= 5) return;
            return new Promise(function (r) { setTimeout(r, 700); }).then(function () { return again(n + 1); });
          });
        }
        return again(0).then(function () {
          M.state.busy = false;
          M.setStatus(res.created ? 'Liste « Inbox » créée.' : 'Liste de triage activée.', 'ok');
        });
      }, function (err) { M.state.busy = false; M.fail(err); });
    };
    M.inboxBanner = function inboxBanner() {
      return S.h('div', { class: 'db-banner' }, [
        S.icon('alert-circle'),
        S.h('span', { text: 'Ce tableau n’a pas de liste de triage : les tâches capturées n’auraient nulle part où arriver.' }),
        S.h('button', { class: 'db-btn', type: 'button', onclick: M.activateInbox }, [S.icon('inbox'), document.createTextNode('Créer la boîte « Inbox »')]),
      ]);
    };
    M.fail = function fail(err) {
      var reason = err && (err.reason || err.message);
      if (reason === 'not-authorized' || reason === 'no-token' || reason === 'auth-failed') {
        M.state.authOk = false;
        M.setStatus('Autorisez Trello (REST) pour enregistrer : ouvrez le Kanban ou le Tableau une fois.', 'error');
      } else {
        M.setStatus('Erreur : ' + (reason || 'inconnue'), 'error');
      }
    };
    M.write = function write(promise, okMsg) {
      return promise.then(function (r) {
        if (okMsg) M.setStatus(okMsg, 'ok');
        M.scheduleReload();
        return r;
      }, function (err) {
        M.fail(err);
        M.reload({ quiet: true });
      });
    };
    M.save = function save(row, factory, opts) {
      opts = opts || {};
      var prev = M.queues[row.id] || Promise.resolve();
      var run = prev.then(factory, factory);
      M.queues[row.id] = run.then(function () {}, function () {});
      return M.write(run.then(function (res) {
        if (typeof opts.then === 'function') {
          try { opts.then(res); } catch (e) { /* a view hook must not fail the write */ }
        }
        return res;
      }), opts.ok);
    };
    M.scheduleReload = function scheduleReload() {
      clearTimeout(M.reloadTimer);
      M.reloadTimer = setTimeout(function tick() {
        // A re-render would drop the caret of a field being edited: wait until the user leaves it.
        var a = document.activeElement;
        if (a && M.els.main.contains(a) && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) {
          M.reloadTimer = setTimeout(tick, 1500);
          return;
        }
        M.reload({ quiet: true });
      }, 2500);
    };
    M.renderSide = function renderSide() {
      var c = S.DM().counts(M.viewRows(), M.today);
      M.els.nav.textContent = '';
      S.SECTIONS.forEach(function (s) {
        var n = s.key === 'triage' ? c.triage : s.key === 'orchestrator' ? c.orchestrator : s.key === 'today' ? c.today : 0;
        M.els.nav.appendChild(S.h('button', {
          class: 'sp-row db-nav' + (M.state.section === s.key ? ' is-on' : ''),
          type: 'button',
          title: s.label + ' (' + s.hint + ')',
          onclick: function () { M.go(s.key); },
        }, [
          S.icon(s.icon),
          S.h('span', { class: 'db-nav-label', text: s.label }),
          n ? S.h('span', { class: 'sp-count db-badge', text: String(n) }) : null,
        ]));
      });
    };
    M.buildSide = function buildSide() {
      M.els.side.appendChild(global.SidePanel.head({
        title: 'Dashboard',
        actions: [{ icon: 'plus', title: 'Nouvelle carte', accent: true, onclick: function () { M.createCard(); } }],
      }));
      M.els.side.appendChild(global.SidePanel.search(M.els.filter));
      M.els.side.appendChild(M.els.nav);
      global.SidePanel.resizable(M.els.side, 'dashboard');
    };
    M.go = function go(key) {
      M.state.section = key;
      M.render();
    };
    M.prioBadge = function prioBadge(row, askIfEmpty) {
      var has = typeof row.priority === 'number';
      if (!has && askIfEmpty !== true) return null;
      var badge = S.h('button', {
        class: has ? 'db-prio db-prio--btn db-prio--' + (row.tierI == null ? 'n' : Math.min(row.tierI, 4)) : 'db-chip db-chip--btn is-empty',
        type: 'button',
        title: (has ? (row.tier || 'Priorité') + ' · ' : '') + 'Cliquer pour changer la priorité',
        onclick: function (e) {
          e.stopPropagation();
          if (!global.CardFields) return;
          global.CardFields.open('priority', {
            t: M.t,
            cardId: row.id,
            cardName: row.name,
            anchor: badge,
            onSaved: function () { M.setStatus('Enregistré', 'ok', 2500); },
            onError: function (m) { M.setStatus(m, 'error'); },
            onClose: function (changed) { if (changed) M.reload({ quiet: true }); },
          });
        },
      }, has ? [document.createTextNode('P' + (global.TableModel ? global.TableModel.formatPriority(row.priority) : Number(row.priority).toFixed(1)))] : [S.icon('flag'), document.createTextNode('Prioriser…')]);
      return badge;
    };
    M.setEstimate = function setEstimate(row, minutes) {
      row.estimate = minutes;
      M.save(row, function () { return S.DT().saveEstimate(M.t, row.id, minutes); });
      M.render();
    };
    M.estimateMenu = function estimateMenu(row, anchor) {
      var CM = global.ContextMenu;
      if (!CM || typeof CM.show !== 'function' || !anchor) return;
      var r = anchor.getBoundingClientRect();
      var items = S.QUICK_ESTIMATES.map(function (m) {
        return {
          id: 'est:' + m,
          label: m ? S.DM().formatMinutes(m) : 'Non estimée',
          icon: m ? 'clock' : 'clock-off',
          checked: (row.estimate || 0) === m,
          action: function () { M.setEstimate(row, m); },
        };
      });
      CM.show({ clientX: r.left, clientY: r.bottom + 4 }, items);
    };
    M.estChip = function estChip(row) {
      var empty = !row.estimate;
      var chip = S.h('button', {
        class: 'db-chip db-chip--btn' + (empty ? ' is-empty' : ''),
        type: 'button',
        title: 'Cliquer pour changer l’estimation',
        onclick: function (e) {
          e.stopPropagation();
          M.estimateMenu(row, chip);
        },
      }, [S.icon('clock'), document.createTextNode(empty ? 'Estimer…' : S.DM().formatMinutes(row.estimate))]);
      return chip;
    };
    M.menuChip = function menuChip(cls, title, iconName, text, buildItems) {
      var kids = [];
      if (iconName) kids.push(S.icon(iconName));
      kids.push(document.createTextNode(text));
      var chip = S.h('button', {
        class: 'db-chip db-chip--btn' + (cls ? ' ' + cls : ''),
        type: 'button',
        title: title,
        onclick: function (e) {
          e.stopPropagation();
          var CM = global.ContextMenu;
          if (!CM || typeof CM.show !== 'function') return;
          var r = chip.getBoundingClientRect();
          CM.show({ clientX: r.left, clientY: r.bottom + 4 }, buildItems());
        },
      }, kids);
      return chip;
    };
    M.dueChip = function dueChip(row) {
      var vague = row.dueVague || '';
      var day = vague ? '' : row.due || '';
      var late = !!day && day < M.today && S.DM().isOpen(row);
      var label = vague ? (M.VAGUE_SHORT[vague] || vague) : !day ? 'Planifier…' : S.dayLabel(day, M.today);
      var cls = (late ? 'is-late' : '') + (!vague && !day ? ' is-empty' : '');
      var iconName = vague ? 'calendar-time' : day ? S.dayIconName(day, M.today) : 'calendar-plus';
      return M.menuChip(cls.trim(), 'Cliquer pour changer le jour', iconName, label, function () {
        var vagues = M.vagueOptions().map(function (v) { return { id: v.id, label: M.VAGUE_SHORT[v.id] || v.label }; });
        function withAction(item) {
          if (item.children) {
            item.children.forEach(withAction);
            return item;
          }
          var id = String(item.id);
          item.action = function () {
            if (id.indexOf('vague:') === 0) M.plan(row, '', id.slice(6));
            else M.plan(row, id.slice(5));
          };
          return item;
        }
        return S.dueChoices(row, M.today, vagues).map(withAction);
      });
    };
    M.capChip = function capChip(used) {
      var over = used > M.state.capacity;
      var label = (used ? S.DM().formatMinutes(used) : '0') + ' / ' + S.DM().formatMinutes(M.state.capacity);
      return S.h('span', {
        class: 'db-chip' + (over ? ' is-late' : ''),
        title: label,
      }, [document.createTextNode(label)]);
    };
    M.openCard = function openCard(row) {
      if (!row || !global.TaskFocus) return;
      global.TaskFocus.open({
        t: M.t,
        cardId: row.id,
        name: row.name || '',
        onChange: function () { M.reload({ quiet: true }); },
        onToast: function (m, kind) { M.setStatus(m || '', kind === 'error' ? 'error' : 'ok'); },
      });
    };
    M.namesForWaiting = function namesForWaiting() {
      var seen = {};
      var out = [];
      function add(n) {
        n = String(n || '').replace(/\s+/g, ' ').trim();
        var key = n.toLowerCase();
        if (!n || seen[key]) return;
        seen[key] = true;
        out.push(n);
      }
      M.people.forEach(add);
      M.state.rows.forEach(function (r) { add(r.waiting); });
      return out;
    };
    M.menuCtx = function menuCtx(row) {
      var team = M.teamList();
      return {
        today: M.today,
        lists: M.state.lists,
        waitingNames: M.namesForWaiting(),
        canCreate: !!(S.DT().listFor(M.state.lists, ['triage']) && global.NewCard),
        vagues: M.vagueOptions().map(function (v) { return { id: v.id, label: M.VAGUE_SHORT[v.id] || v.label }; }),
        people: row && team.length ? S.PB().menuPeople(row, team, M.state.me) : [],
      };
    };
    M.teamList = function teamList() {
      if (!S.PB() || !M.state.me || !M.state.teamRaw) return [];
      return S.PB().people({ members: M.state.teamRaw.members, catalog: M.state.teamRaw.catalog, me: M.state.me, rows: M.state.rows });
    };
    M.loadTeam = function loadTeam() {
      var pt = global.PriorityTrello;
      if (!pt || !S.PB()) return Promise.resolve();
      if (M.state.teamRaw && Date.now() - M.state.teamAt < 30000) return Promise.resolve();
      function soft(fn, fallback) {
        try {
          return Promise.resolve(fn()).then(function (v) { return v; }, function () { return fallback; });
        } catch (e) {
          return Promise.resolve(fallback);
        }
      }
      return Promise.all([
        soft(function () { return pt.getCurrentMember(M.t); }, null),
        soft(function () { return pt.getBoardMembers(M.t); }, []),
        soft(function () { return pt.getCustomAssigneeCatalog(M.t); }, []),
      ]).then(function (r) {
        M.state.me = S.PB().meOf(r[0]);
        M.state.teamRaw = { members: r[1] || [], catalog: r[2] || [] };
        M.state.teamAt = Date.now();
      });
    };
    M.advanceSelection = function advanceSelection(row) {
      if (!row || M.state.selected !== row.id) return;
      var q = M.triageRows();
      var i = -1;
      for (var n = 0; n < q.length; n++) if (q[n].id === row.id) i = n;
      var nxt = i >= 0 ? (q[i + 1] || q[i - 1]) : null;
      M.state.selected = nxt && nxt.id !== row.id ? nxt.id : null;
    };
    M.applyList = function applyList(row, list) {
      if (!list) return;
      row.listId = list.id;
      row.statut = list.name;
      row.statutKey = list.category;
    };
    M.snapshotOf = function snapshotOf(row, extra) {
      return Object.assign({
        id: row.id,
        name: row.name,
        listId: row.listId,
        pos: row.pos,
        triage: row.statutKey === 'triage',
        fullDesc: row.fullDesc || row.desc || '',
        local: {
          waiting: row.waiting || '',
          waitingSince: row.waitingSince || '',
          start: row.start || '',
          due: row.due || '',
          startTime: row.startTime || '',
          dueTime: row.dueTime || '',
          dueVague: row.dueVague || '',
          dueMode: row.dueMode || '',
        },
      }, extra || {});
    };
    M.offerUndo = function offerUndo(row, snap, message) {
      function undo() {
        if (M.state.undo !== undo) return;
        M.state.undo = null;
        // A reload may have replaced the card since: act on the current one.
        var cur = M.state.rows.filter(function (r) { return r.id === snap.id; })[0] || row;
        if (M.state.rows.indexOf(cur) < 0) M.state.rows.push(cur);
        M.applyList(cur, M.state.lists.filter(function (l) { return l.id === snap.listId; })[0]);
        cur.pos = snap.pos;
        cur.fullDesc = snap.fullDesc;
        Object.assign(cur, snap.local);
        if (snap.triage) {
          M.state.selected = snap.id;
          M.state.section = 'triage';
        }
        M.save(cur, function () { return S.DT().restoreTriage(M.t, snap); }, { ok: '« ' + snap.name + ' » ' + (snap.triage ? 'remise en triage' : 'remise en place') });
        M.render();
      }
      M.state.undo = undo;
      M.setStatus(message, 'ok', 8000, { label: snap.triage ? 'Remettre en triage' : 'Défaire', run: undo });
    };
    M.exitMove = function exitMove(row, cats, label) {
      var list = S.DT().listFor(M.state.lists, cats);
      if (!list) return M.setStatus('Aucune liste « ' + label + ' » : définissez les Statuts du tableau.', 'error');
      var snap = M.snapshotOf(row);
      M.advanceSelection(row);
      M.applyList(row, list);
      M.save(row, function () { return S.DT().moveToCategory(M.t, row, M.state.lists, cats); });
      M.offerUndo(row, snap, '« ' + row.name + ' » → ' + list.name);
      M.render();
    };
    M.exitCancel = function exitCancel(row) {
      var snap = M.snapshotOf(row, { archived: !S.DT().listFor(M.state.lists, ['canceled']) });
      M.advanceSelection(row);
      M.state.rows = M.state.rows.filter(function (r) { return r.id !== row.id; });
      M.save(row, function () { return S.DT().cancel(M.t, row, M.state.lists); });
      M.offerUndo(row, snap, '« ' + row.name + ' » annulée');
      M.render();
    };
    M.exitReference = function exitReference(row) {
      var snap = M.snapshotOf(row, { archived: !S.DT().listFor(M.state.lists, ['canceled']) });
      M.advanceSelection(row);
      M.state.rows = M.state.rows.filter(function (r) { return r.id !== row.id; });
      M.save(row, function () {
        return S.DT().fileReference(M.t, row).then(function (ref) {
          snap.reference = ref;
          return S.DT().cancel(M.t, row, M.state.lists);
        });
      });
      M.offerUndo(row, snap, '« ' + row.name + ' » dans Références');
      M.render();
    };
    M.exitWait = function exitWait(row, name) {
      var list = S.DT().listFor(M.state.lists, ['backlog', 'unstarted']);
      if (!list) return M.setStatus('Aucune liste « Backlog » : définissez les Statuts du tableau.', 'error');
      var snap = M.snapshotOf(row, { restoreDesc: true });
      M.advanceSelection(row);
      row.waiting = name;
      M.applyList(row, list);
      M.save(row, function () { return S.DT().setWaiting(M.t, row, M.state.lists, name); });
      M.offerUndo(row, snap, 'En attente de ' + name);
      M.render();
    };
    M.exitSomeday = function exitSomeday(row) {
      var list = S.DT().listFor(M.state.lists, ['backlog', 'unstarted']);
      if (!list) return M.setStatus('Aucune liste « Backlog » : définissez les Statuts du tableau.', 'error');
      var snap = M.snapshotOf(row, { restoreDates: true });
      M.advanceSelection(row);
      row.dueVague = 'eventuellement';
      row.due = '';
      row.start = '';
      row.dueMode = 'vague';
      M.applyList(row, list);
      M.save(row, function () { return S.DT().setSomeday(M.t, row, M.state.lists); });
      M.offerUndo(row, snap, '« ' + row.name + ' » → Un jour');
      M.render();
    };
    M.exitComplete = function exitComplete(row, done) {
      row.dueDone = !!done;
      M.write(S.DT().complete(M.t, row, M.state.lists, !!done));
      M.setStatus(done ? '« ' + row.name + ' » terminée' : '« ' + row.name + ' » rouverte', 'ok');
      M.render();
    };
    M.exitArchive = function exitArchive(row) {
      var snap = M.snapshotOf(row, { archived: true });
      M.advanceSelection(row);
      M.state.rows = M.state.rows.filter(function (r) { return r.id !== row.id; });
      M.save(row, function () { return global.TableTrello.archiveCard(M.t, row.id); });
      M.offerUndo(row, snap, '« ' + row.name + ' » archivée');
      M.render();
    };
    M.setProgress = function setProgress(row, pct) {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.getCardCompletionById !== 'function') return M.setStatus('Éditeur de progrès indisponible', 'error');
      row.progress = pct;
      if (Array.isArray(row.items) && row.items.length && CT.applyMasterProgress) row.items = CT.applyMasterProgress(row.items, pct);
      if (M.state.selected === row.id) M.render(); // the pane on the right shows it too
      else M.refreshRow(row);
      var wasDone = !!row.dueDone || row.statutKey === 'completed';
      M.save(row, function () {
        var write = typeof CT.saveProgressTree === 'function'
          ? CT.saveProgressTree(M.t, [row], pct)
          : CT.getCardCompletionById(M.t, row.id).then(function (data) {
              data = CT.normalizeCompletionData(data || { items: [] });
              var next = data.items && data.items.length
                ? Object.assign({}, data, { items: CT.applyMasterProgress(data.items, pct) })
                : Object.assign({}, data, { progress: pct });
              return CT.saveCardCompletionById(M.t, row.id, CT.normalizeCompletionData(next)).then(function () { return [row.id]; });
            });
        return write.then(function (ids) {
          if (pct < 100) return null;
          var chain = Promise.resolve();
          (ids || [row.id]).forEach(function (id) {
            if (id === row.id && wasDone) return;
            chain = chain.then(function () { return S.DT().complete(M.t, { id: id }, M.state.lists, true); });
          });
          return chain;
        });
      }, { ok: pct >= 100 ? '« ' + row.name + ' » terminée' : 'Enregistré', then: function () { if (pct >= 100) row.dueDone = true; } });
    };
    M.rowsForProject = function rowsForProject(node) {
      var q = M.triageRows();
      var want = node && node.id ? String(node.id) : '';
      return (q || []).filter(function (r) {
        if (!r || !r.id) return false;
        var p = S.WO() && typeof S.WO().projectOf === 'function' ? S.WO().projectOf(M.state.goals, r.id) : null;
        if (want) return !!(p && String(p.id) === want);
        return !p || !p.id;
      });
    };
    M.setProjectProgress = function setProjectProgress(node, pct) {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.saveProgressTree !== 'function') return M.setStatus('Éditeur de progrès indisponible', 'error');
      var rows = M.rowsForProject(node);
      if (!rows.length) return;
      var wasDone = {};
      rows.forEach(function (row) {
        wasDone[row.id] = !!row.dueDone || row.statutKey === 'completed';
        row.progress = pct;
        if (Array.isArray(row.items) && row.items.length && CT.applyMasterProgress) row.items = CT.applyMasterProgress(row.items, pct);
        if (pct >= 100) row.dueDone = true;
      });
      M.render();
      var name = (node && node.name) || 'Projet';
      M.write(CT.saveProgressTree(M.t, rows, pct).then(function (ids) {
        if (pct < 100) return null;
        var chain = Promise.resolve();
        (ids || []).forEach(function (id) {
          if (wasDone[id]) return;
          chain = chain.then(function () { return S.DT().complete(M.t, { id: id }, M.state.lists, true); });
        });
        return chain;
      }), pct >= 100 ? '« ' + name + ' » terminé' : 'Enregistré');
    };
    M.toggleSubtask = function toggleSubtask(row, itemId, done) {
      var CT = global.CompletionTrello;
      if (!CT || !CT.applyItemProgress) return M.setStatus('Éditeur de progrès indisponible', 'error');
      var local = CT.applyItemProgress({ items: row.items || [] }, itemId, done ? 100 : 0);
      row.items = local.items;
      if (CT.computeCardProgress) row.progress = Math.round(CT.computeCardProgress(local).percent);
      M.refreshRow(row);
      M.save(row, function () {
        return CT.getCardCompletionById(M.t, row.id).then(function (data) {
          return CT.saveCardCompletionById(M.t, row.id, CT.applyItemProgress(data || { items: [] }, itemId, done ? 100 : 0));
        });
      }, { ok: 'Enregistré' });
    };
    M.exitBlocked = function exitBlocked(row) {
      var on = !row.blocked;
      row.blocked = on;
      var job = global.GanttTrello && global.GanttTrello.setCardBlocked
        ? global.GanttTrello.setCardBlocked(M.t, row.id, on)
        : Promise.resolve();
      M.write(Promise.resolve(job).then(function (res) {
        if (res && res.ok === false) throw new Error(res.reason || 'Échec du blocage');
      }));
      M.setStatus(on ? 'Carte bloquée' : 'Carte débloquée', 'ok');
      M.render();
    };
    M.openEditor = function openEditor(row, kind, anchor) {
      if (!global.CardFields || !anchor) return;
      var extra = {};
      if (kind === 'desc' && global.TableTrello && global.TableTrello.saveDesc) {
        extra.value = row.desc || '';
        extra.save = function (text) {
          var prev = row.desc;
          row.desc = text;
          return global.TableTrello.saveDesc(M.t, row, text).then(function (full) {
            row.fullDesc = full;
          }, function (err) { row.desc = prev; throw err; });
        };
        extra.uploadImage = function (file) {
          return M.attachNote(row.id, file).then(function () { M.render(); return null; });
        };
      }
      global.CardFields.open(kind, Object.assign({
        t: M.t,
        cardId: row.id,
        cardName: row.name,
        anchor: anchor,
        onSaved: function () { M.setStatus('Enregistré', 'ok', 2500); },
        onError: function (m) { M.setStatus(m, 'error'); },
        onClose: function (changed) { if (changed) M.reload({ quiet: true }); },
      }, extra));
    };
    M.copyLink = function copyLink(url) {
      var clip = global.navigator && global.navigator.clipboard;
      if (!url || !clip || typeof clip.writeText !== 'function') return;
      clip.writeText(url).then(function () { M.setStatus('Lien copié', 'ok'); }, function () {});
    };
    M.askWaiting = function askWaiting(row, anchor) {
      if (!row || !global.LinearPick) return;
      var from = anchor && anchor.getBoundingClientRect ? anchor : M.els.main.querySelector('[data-exit="waiting"]') || M.els.main;
      global.LinearPick.open({
        anchor: from,
        placeholder: 'En attente de…',
        digits: false,
        current: row.waiting || '',
        items: M.namesForWaiting().map(function (n) { return { id: n, label: n, icon: 'user' }; }),
        create: function (q) { return { id: q, label: 'En attente de « ' + q + ' »', icon: 'user-plus' }; },
        onPick: function (it) { M.exitWait(row, it.id); },
      });
    };
    M.byName = function byName(a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' });
    };
    M.applyGoals = function applyGoals(next) {
      M.state.goals = next || { nodes: [], links: [] };
      M.state.projects = S.WO() ? S.WO().projectChain(M.state.goals, M.state.rows, M.state.metrics || [], M.state.objectifs || []) : [];
      M.state.places = S.WO() ? S.WO().places(M.state.goals) : {};
    };
    M.goalsSaver = function goalsSaver() {
      var GG = global.MindmapGoalsTrello;
      if (!GG || typeof GG.save !== 'function' || !S.WO()) {
        M.setStatus('Projets indisponibles ici.', 'error');
        return null;
      }
      return GG;
    };
    M.commitGoals = function commitGoals(next, okMsg) {
      var GG = M.goalsSaver();
      if (!GG) return Promise.reject(new Error('Projets indisponibles ici.'));
      M.applyGoals(next);
      M.render();
      return GG.save(M.t, next).then(function (saved) {
        M.applyGoals(saved);
        M.setStatus(okMsg || 'Projet enregistré', 'ok');
        return saved;
      }, function (err) {
        if (err && err.reason === 'conflict') M.setStatus('Les projets ont changé ailleurs : rechargés.', 'error');
        else M.fail(err);
        M.reload({ quiet: true });
        throw err;
      });
    };
    M.projectOfRow = function projectOfRow(row) {
      var p = S.WO() && S.WO().projectOf ? S.WO().projectOf(M.state.goals, row.id) : null;
      if (!p) return null;
      var place = M.state.places && M.state.places[row.id];
      return { text: p.name, title: place ? S.WO().placeLabel(place) : p.name, glyph: (p.icon && p.icon.i) || '' };
    };
    M.setProject = function setProject(row, projectId) {
      if (!S.WO() || !S.WO().withTaskProject) return M.setStatus('Projets indisponibles ici.', 'error');
      M.commitGoals(S.WO().withTaskProject(M.state.goals, row.id, projectId), projectId ? 'Projet enregistré' : 'Projet retiré').catch(function () {});
    };
    M.pickProject = function pickProject(row, anchor) {
      var projects = (M.state.projects || []).slice().sort(M.byName);
      if (!projects.length) return M.setStatus('Aucun projet pour l’instant : créez-en un dans la Mindmap.', '', 4500);
      if (!global.LinearPick) return;
      var cur = S.WO() && S.WO().projectOf ? S.WO().projectOf(M.state.goals, row.id) : null;
      var items = projects.map(function (p) { return { id: p.id, label: p.name + (p.outcome ? ' · ' + p.outcome : ''), icon: (p.icon && p.icon.i) || 'stack-2' }; });
      if (cur) items.unshift({ id: '', label: 'Aucun projet', icon: 'circle-x' });
      global.LinearPick.open({
        anchor: anchor,
        placeholder: 'Choisir un projet…',
        digits: false,
        current: cur ? cur.id : '',
        items: items,
        onPick: function (it) { M.setProject(row, it.id || null); },
      });
    };
    M.openEntities = function openEntities(row, kind, anchor) {
      var CE = global.CardEntities;
      if (!CE) return M.setStatus('Éditeur indisponible', 'error');
      CE.open(kind, {
        t: M.t,
        rec: row,
        anchor: anchor,
        onSaved: function () { M.setStatus('Enregistré', 'ok'); },
        onError: function (m) { M.setStatus(m, 'error'); },
        onClose: function (changed) { if (changed) M.reload({ quiet: true }); },
      });
    };
    M.createCard = function createCard() {
      var target = S.DT().newCardList(M.state.lists);
      if (!target || !global.NewCard) return;
      global.NewCard.open({
        t: M.t,
        lists: M.state.lists,
        listId: target.id,
        onError: M.fail,
        onCreated: function (c) {
          M.setStatus('Carte créée dans « ' + c.list.name + ' »', 'ok');
          M.reload({ quiet: true });
          setTimeout(function () { M.reload({ quiet: true }); }, 1200);
        },
      });
    };
    M.perform = function perform(row, id, anchor) {
      if (id === 'accept') return M.exitMove(row, ['unstarted', 'backlog'], 'À faire');
      if (id === 'backlog') return M.exitMove(row, ['backlog', 'unstarted'], 'Backlog');
      if (id === 'cancel') return M.exitCancel(row);
      if (id === 'reference') return M.exitReference(row);
      if (id === 'someday') return M.exitSomeday(row);
      if (id === 'complete') return M.exitComplete(row, true);
      if (id === 'reopen') return M.exitComplete(row, false);
      if (id === 'archive') return M.exitArchive(row);
      if (id === 'blocked') return M.exitBlocked(row);
      if (id === 'priority' || id === 'progress') return M.openEditor(row, id, anchor);
      if (id === 'desc') {
        if (M.state.section === 'triage' && row && M.state.selected === row.id && !M.pickedProject()) {
          var descBox = M.els.main.querySelector('.tri-desc-rich[data-fk="desc"]');
          if (descBox) { descBox.focus(); return; }
        }
        return M.openEditor(row, id, anchor);
      }
      if (id === 'open-card') return M.openCard(row);
      if (id === 'open-document') {
        if (global.ViewTabs && typeof global.ViewTabs.openSubject === 'function') global.ViewTabs.openSubject('task', row.id);
        return;
      }
      if (id.indexOf('open-in:') === 0) {
        if (global.ViewTabs && typeof global.ViewTabs.openIn === 'function') global.ViewTabs.openIn(id.slice(8), row.id);
        return;
      }
      if (id === 'open-trello') {
        if (row && row.link) global.open(row.link, '_blank', 'noopener');
        return;
      }
      if (id === 'copy-link') return M.copyLink(row && row.link);
      if (id === 'new-card') return M.createCard();
      if (id === 'new-document') return M.openDoc();
      if (id === 'reload') return M.reload();
      if (id.indexOf('go:') === 0) return M.go(id.slice(3));
      if (id === 'waiting' || id === 'wait:') return M.askWaiting(row, anchor);
      if (id.indexOf('wait:') === 0) return M.exitWait(row, id.slice(5));
      if (id.indexOf('plan:') === 0) return M.plan(row, id.slice(5));
      if (id.indexOf('vague:') === 0) return M.plan(row, '', id.slice(6));
      if (id.indexOf('assign:') === 0) {
        var heir = S.PB().byKey(M.teamList(), M.state.me, id.slice(7));
        if (heir && S.PB().needsHandover(row, 'all', heir)) M.handOver(row, 'all', heir, null);
        return;
      }
      if (id.indexOf('urg:') === 0) {
        var uid = id.slice(4);
        var lab = uid;
        S.URGENCIES.forEach(function (u) { if (u[0] === uid) lab = u[1]; });
        row.urgency = lab;
        M.save(row, function () { return S.DT().savePriority(M.t, row.id, { empressement: uid }); }, {
          then: function (d) {
            if (!d) return;
            row.priority = d.priority;
            row.tier = d.tier;
            row.tierI = d.tierI;
            if (!M.renderUnlessTyping()) M.refreshRow(row);
          },
        });
        M.setStatus('Urgence modifiée', 'ok');
        M.render();
        return;
      }
      if (id.indexOf('est:') === 0) return M.setEstimate(row, Number(id.slice(4)) || 0);
      if (id.indexOf('list:') === 0) {
        var lid = id.slice(5);
        var list = M.state.lists.filter(function (l) { return l.id === lid; })[0];
        if (!list || list.id === row.listId) return;
        if (row.statutKey === 'triage') M.advanceSelection(row);
        M.applyList(row, list);
        M.write(global.TableTrello.moveCard(M.t, row.id, list.id, 'bottom'));
        M.setStatus('« ' + row.name + ' » → ' + list.name, 'ok');
        M.render();
      }
    };
    M.withActions = function withActions(row, entries, anchor) {
      return (entries || []).map(function (it) {
        var item = {
          id: it.id,
          label: it.label,
          icon: it.icon,
          group: it.group,
          hint: it.hint,
          checked: !!it.checked,
          disabled: !!it.disabled,
          danger: !!it.danger,
        };
        if (it.children) item.children = M.withActions(row, it.children, anchor);
        else item.action = function () { M.perform(row, it.id, anchor); };
        return item;
      });
    };
    M.withIso = function withIso(row, entries, anchor) {
      var items = M.withActions(row, entries, anchor);
      if (!row || !global.Isolation) return items;
      var proj = S.WO() && S.WO().projectOf ? S.WO().projectOf(M.state.goals, row.id) : null;
      return items.concat(global.Isolation.menuItems({
        cardId: row.id,
        cardName: row.name,
        projectId: proj && proj.id,
        projectName: (proj && proj.name) || row.project || '',
        people: global.Isolation.peopleOf(row),
      }));
    };
    M.pageHead = function pageHead(title, sub, right) {
      return S.h('header', { class: 'db-head' }, [
        S.h('div', {}, [S.h('h1', { class: 'db-title', text: title }), sub ? S.h('p', { class: 'db-sub', text: sub }) : null]),
        right || null,
      ]);
    };
    M.triageBuilt = function triageBuilt(q) {
      if (!global.TriageTree || !M.state.triageTree) return null;
      return global.TriageTree.build(q, {
        projectOf: function (r) {
          var p = S.WO() && S.WO().projectOf ? S.WO().projectOf(M.state.goals, r.id) : null;
          return p ? { id: p.id, name: p.name, icon: p.icon || null } : null;
        },
        collapsed: M.state.triageFold,
        adding: M.state.subAdding ? { key: M.state.subAdding, mode: M.state.addMode === 'task' ? 'task' : 'sub' } : '',
      });
    };
    M.addSubtask = function addSubtask(taskId, parentId, text) {
      var row = (M.state.rows || []).filter(function (r) { return r.id === taskId; })[0];
      var CTm = global.CompletionTrello;
      if (!row || !CTm || !S.DT().addSubtask) return;
      var local = parentId ? CTm.addChecklistItem({ items: row.items || [] }, parentId, text) : CTm.addLocalItem({ items: row.items || [] }, text);
      if (!local || !local.item) return M.setStatus('Sous-tâche non ajoutée', 'error');
      row.items = local.data.items;
      M.render();
      M.save(row, function () { return S.DT().addSubtask(M.t, row.id, parentId, text); }, { ok: 'Sous-tâche ajoutée' });
    };
    M.beginAdd = function beginAdd(key, mode) {
      delete M.state.triageFold[key];
      M.state.subAdding = key;
      M.state.addMode = mode === 'task' ? 'task' : 'sub';
      M.render();
    };
    M.placeTriageCard = function placeTriageCard(clean, list, pos, projectId, fallbackPos) {
      var TT = global.TableTrello;
      if (!TT || typeof TT.createRow !== 'function') return M.setStatus('Tâche non ajoutée', 'error');
      TT.createRow(M.t, clean, list.id, pos).then(function (res) {
        var cardId = res && res.cardId;
        if (!cardId) throw new Error('Tâche non ajoutée');
        M.state.rows.push({
          id: cardId,
          name: clean,
          listId: list.id,
          statut: list.name,
          statutKey: list.category || 'triage',
          pos: typeof pos === 'number' ? pos : ((fallbackPos || 0) + 1024),
          items: [],
          desc: '',
          progress: 0,
        });
        var placed = projectId && S.WO() && S.WO().withTaskProject
          ? M.commitGoals(S.WO().withTaskProject(M.state.goals, cardId, projectId), 'Tâche ajoutée')
          : Promise.resolve().then(function () {
            M.render();
            M.setStatus('Tâche ajoutée', 'ok');
          });
        return Promise.resolve(placed).then(function () {
          return M.reload({ quiet: true }).then(function () {
            if (M.state.rows.some(function (r) { return r.id === cardId; })) return null;
            return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () { return M.reload({ quiet: true }); });
          });
        }, function () { /* commitGoals already reported the project save */ });
      }, function (err) { M.fail(err); });
    };
    M.addSiblingTask = function addSiblingTask(taskId, text) {
      var clean = String(text || '').replace(/\s+/g, ' ').trim();
      if (!clean) return;
      var row = (M.state.rows || []).filter(function (r) { return r.id === taskId; })[0];
      if (!row) return M.setStatus('Tâche non ajoutée', 'error');
      var list = (M.state.lists || []).filter(function (l) { return l.id === row.listId; })[0];
      if (!list && S.DT()) list = S.DT().listFor(M.state.lists, ['triage']);
      if (!list) return M.setStatus('Ce tableau n’a pas de liste de triage.', 'error');
      var siblings = (M.state.rows || []).filter(function (r) { return r.listId === list.id; }).slice().sort(function (a, b) {
        return (a.pos || 0) - (b.pos || 0);
      });
      var index = siblings.length;
      for (var i = 0; i < siblings.length; i++) if (siblings[i].id === row.id) { index = i + 1; break; }
      var pos = global.TableModel && global.TableModel.dropPos ? global.TableModel.dropPos(siblings, index) : 'bottom';
      var project = S.WO() && S.WO().projectOf ? S.WO().projectOf(M.state.goals, row.id) : null;
      M.placeTriageCard(clean, list, pos, project && project.id, row.pos);
    };
    M.addInProject = function addInProject(projectId, text) {
      var clean = String(text || '').replace(/\s+/g, ' ').trim();
      if (!clean) return;
      if (!S.DT()) return M.setStatus('Ce tableau n’a pas de liste de triage.', 'error');
      var list = S.DT().listFor(M.state.lists, ['triage']);
      if (!list) return M.setStatus('Ce tableau n’a pas de liste de triage.', 'error');
      var want = projectId || '';
      var siblings = (M.state.rows || []).filter(function (r) {
        if (r.listId !== list.id) return false;
        var p = S.WO() && S.WO().projectOf ? S.WO().projectOf(M.state.goals, r.id) : null;
        return (p && p.id ? p.id : '') === want;
      }).slice().sort(function (a, b) { return (a.pos || 0) - (b.pos || 0); });
      var pos = global.TableModel && global.TableModel.dropPos ? global.TableModel.dropPos(siblings, siblings.length) : 'bottom';
      var last = siblings.length ? siblings[siblings.length - 1].pos : 0;
      M.placeTriageCard(clean, list, pos, want, last);
    };
    M.locateItem = function locateItem(items, itemId, parentId) {
      items = items || [];
      var i;
      if (parentId) {
        for (i = 0; i < items.length; i++) {
          if (!items[i] || items[i].id !== parentId) continue;
          var kids = items[i].items || [];
          for (var k = 0; k < kids.length; k++) if (kids[k] && kids[k].id === itemId) return { item: kids[k], parent: items[i] };
        }
        return null;
      }
      for (i = 0; i < items.length; i++) if (items[i] && items[i].id === itemId) return { item: items[i], parent: null };
      return null;
    };
    M.pickedSub = function pickedSub(card) {
      var s = M.state.subSel;
      if (!s || !M.state.triageTree) return null;
      if (!card || s.taskId !== card.id) { M.state.subSel = null; return null; }
      var found = M.locateItem(card.items, s.itemId, s.parentId);
      if (!found) { M.state.subSel = null; return null; }
      var linkedId = found.item.linkedCardId ? String(found.item.linkedCardId) : '';
      var linkedRow = linkedId ? (M.state.rows.filter(function (r) { return r.id === linkedId; })[0] || null) : null;
      return { card: card, item: found.item, parent: found.parent, linkedRow: linkedRow };
    };
    M.mutateSub = function mutateSub(row, fn, ok) {
      var CT = global.CompletionTrello;
      if (!CT) return M.setStatus('Éditeur de progrès indisponible', 'error');
      var local = fn(CT, { items: row.items || [] });
      if (!local || !local.items) return;
      row.items = local.items;
      if (CT.computeCardProgress) row.progress = Math.round(CT.computeCardProgress(local).percent);
      var finish = row.progress >= 100 && !row.dueDone;
      M.render();
      M.save(row, function () {
        return CT.getCardCompletionById(M.t, row.id).then(function (data) {
          var next = fn(CT, data || { items: [] });
          return CT.saveCardCompletionById(M.t, row.id, next).then(function () {
            if (!finish) return next;
            return S.DT().complete(M.t, row, M.state.lists, true).then(function () { return next; });
          });
        });
      }, {
        ok: finish ? '« ' + row.name + ' » terminée' : (ok || 'Enregistré'),
        then: function (next) {
          if (finish) row.dueDone = true;
          if (next && CT.computeEstimatedTotal) row.estimate = CT.computeEstimatedTotal(next) || 0;
        },
      });
    };
    M.openSubEstimate = function openSubEstimate(item, anchor, onPick) {
      var CM = global.ContextMenu;
      if (!CM || typeof CM.show !== 'function' || !anchor) return;
      var cur = item.estimatedMinutes || 0;
      var r = anchor.getBoundingClientRect();
      CM.show({ clientX: r.left, clientY: r.bottom + 4 }, S.QUICK_ESTIMATES.map(function (m) {
        return {
          id: 'est:' + m,
          label: m ? S.DM().formatMinutes(m) : 'Non estimée',
          icon: m ? 'clock' : 'clock-off',
          checked: cur === m,
          action: function () { onPick(m); },
        };
      }));
    };
    M.openSubDay = function openSubDay(anchor, iso, onPick) {
      if (!anchor) return;
      var input = document.createElement('input');
      input.type = 'date';
      input.value = iso || '';
      input.setAttribute('aria-label', 'Jour prévu');
      input.className = 'tri-day-pop';
      var box = anchor.getBoundingClientRect();
      input.style.position = 'fixed';
      input.style.left = box.left + 'px';
      input.style.top = box.bottom + 'px';
      input.style.opacity = '0';
      input.style.width = box.width + 'px';
      input.style.height = '1px';
      document.body.appendChild(input);
      function close() { if (input.parentNode) input.parentNode.removeChild(input); }
      input.addEventListener('change', function () { var v = input.value; close(); onPick(v); });
      input.addEventListener('blur', function () { setTimeout(close, 200); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.focus();
    };
    M.subHost = function subHost(spec) {
      var card = spec.card;
      var item = spec.item;
      var parentId = spec.parent ? spec.parent.id : '';
      function dates(iso) {
        return iso
          ? { startDate: iso, dueDate: iso }
          : { startDate: '', dueDate: '', startTime: '', dueTime: '' };
      }
      return {
        today: M.today,
        dayLabel: function (iso) { return S.dayLabel(iso, M.today); },
        showCard: function () { M.state.subSel = null; M.render(); },
        openCard: function () { M.openCard({ id: item.linkedCardId, name: item.text || '' }); },
        rename: function (text) {
          M.mutateSub(card, function (CT, data) {
            return parentId ? CT.applyChecklistItemText(data, parentId, item.id, text) : CT.applyItemText(data, item.id, text);
          });
        },
        setEstimate: function (minutes) {
          M.mutateSub(card, function (CT, data) {
            return parentId
              ? CT.applyChecklistItemEstimate(data, parentId, item.id, minutes)
              : CT.applyItemEstimate(data, item.id, minutes);
          });
        },
        openEstimate: function (anchor) {
          M.openSubEstimate(item, anchor, function (m) { M.subHost(spec).setEstimate(m); });
        },
        plan: function (iso) {
          M.mutateSub(card, function (CT, data) {
            return CT.applyItemDates(data, parentId || item.id, parentId ? item.id : '', dates(iso));
          });
        },
        openDay: function (anchor, iso) {
          M.openSubDay(anchor, iso, function (next) { M.subHost(spec).plan(next); });
        },
        setProgress: function (pct) {
          M.mutateSub(card, function (CT, data) {
            return parentId
              ? CT.applyChecklistItemProgress(data, parentId, item.id, pct)
              : CT.applyItemProgress(data, item.id, pct);
          });
        },
        toggleBlocked: function () {
          var on = item.blocked !== true;
          M.mutateSub(card, function (CT, data) { return CT.setItemBlocked(data, item.id, on); }, on ? 'Sous-tâche bloquée' : 'Sous-tâche débloquée');
        },
        toggleChild: function (childId, done) {
          M.mutateSub(card, function (CT, data) { return CT.applyChecklistItemProgress(data, item.id, childId, done ? 100 : 0); });
        },
        addChild: function (text) { M.addSubtask(card.id, item.id, text); },
      };
    };
    M.triageOrder = function triageOrder(q) {
      var built = M.triageBuilt(q);
      return built ? built.tasks : q;
    };
    M.focusEntries = function focusEntries(q) {
      var built = M.triageBuilt(q);
      if (!built) return q.map(function (r) { return { kind: 'task', taskId: r.id }; });
      var out = [];
      built.nodes.forEach(function (n) {
        if (n.kind === 'task') out.push({ kind: 'task', taskId: n.row.id });
        else if (n.kind === 'sub' && n.id) out.push({ kind: 'sub', taskId: n.taskId, itemId: n.id, parentId: n.parentId || '', key: n.key });
      });
      return out;
    };
    M.focusAt = function focusAt(list) {
      var sub = M.state.subSel;
      var i;
      if (sub) {
        for (i = 0; i < list.length; i++) if (list[i].kind === 'sub' && list[i].key === sub.key) return i;
      }
      for (i = 0; i < list.length; i++) if (list[i].kind === 'task' && list[i].taskId === M.state.selected) return i;
      return -1;
    };
    M.applyFocus = function applyFocus(entry) {
      if (!entry) return;
      M.state.selected = entry.taskId;
      M.state.projectSel = null;
      M.state.docOpen = false;
      M.state.subSel = entry.kind === 'sub'
        ? { taskId: entry.taskId, itemId: entry.itemId, parentId: entry.parentId, key: entry.key }
        : null;
      M.render();
    };
    M.pickedProject = function pickedProject() {
      var ps = M.state.projectSel;
      if (!ps || ps.at !== M.state.selected) return null;
      var p = (M.state.projects || []).filter(function (x) { return x.id === ps.id; })[0];
      if (!p) return null;
      var node = ((M.state.goals && M.state.goals.nodes) || []).filter(function (n) { return n && n.id === p.id; })[0];
      return Object.assign({}, p, { desc: node && node.desc ? node.desc : '' });
    };
    M.saveProject = function saveProject(id, patch, okMsg) {
      if (!S.WO() || !S.WO().withNodeEdit) {
        M.setStatus('Projets indisponibles ici.', 'error');
        return Promise.reject(new Error('Projets indisponibles ici.'));
      }
      return M.commitGoals(S.WO().withNodeEdit(M.state.goals, id, patch), okMsg).then(function (saved) {
        return saved;
      }, function (err) {
        if (err) err.reported = true;
        throw err;
      });
    };
    M.imageExt = function imageExt(file) {
      var kind = String((file && file.type) || '').toLowerCase();
      if (kind === 'image/png') return 'png';
      if (kind === 'image/webp') return 'webp';
      if (kind === 'image/gif') return 'gif';
      return 'jpg';
    };
    M.attachNote = function attachNote(cardId, file) {
      var docs = global.DocsTrello;
      var ui = global.TriageUI;
      if (!docs || typeof docs.uploadCover !== 'function') return Promise.reject(new Error('Image non ajoutée'));
      return docs.uploadCover(M.t, cardId, file, M.imageExt(file), 'note').then(function (cover) {
        if (!cover || !cover.c || !cover.a || !cover.n) throw new Error('upload-failed');
        var alt = ui && ui.imageAlt ? ui.imageAlt(file) : '';
        var list = M.noteCache[cardId] || (M.noteCache[cardId] = []);
        list.push({ src: 'upload:' + cover.c + '/' + cover.a + '/' + cover.n, alt: alt });
        return null;
      });
    };
    M.shotsOf = function shotsOf(cardId) {
      return M.noteCache[cardId] ? M.noteCache[cardId].slice() : [];
    };
    M.loadNoteImages = function loadNoteImages(cardId) {
      if (!cardId) return Promise.resolve([]);
      if (M.noteCache[cardId]) return Promise.resolve(M.shotsOf(cardId));
      var docs = global.DocsTrello;
      if (!docs || typeof docs.listNoteImages !== 'function') return Promise.resolve([]);
      return docs.listNoteImages(M.t, cardId).then(function (rows) {
        M.noteCache[cardId] = rows || [];
        return M.shotsOf(cardId);
      });
    };
    M.resolveImage = function resolveImage(src) {
      if (!src || src.indexOf('upload:') !== 0) return Promise.resolve(src || '');
      var parts = src.slice(7).split('/');
      var docs = global.DocsTrello;
      if (parts.length !== 3 || !docs || typeof docs.coverBlobUrl !== 'function') return Promise.resolve('');
      return docs.coverBlobUrl(M.t, { k: 'upload', c: parts[0], a: parts[1], n: parts[2] });
    };
    M.imageError = function imageError(msg) { M.setStatus(msg, 'error'); };
    M.findProjectDocId = function findProjectDocId(p) {
      if (M.projectDocs[p.id]) return Promise.resolve(M.projectDocs[p.id]);
      if (M.projectDocMiss[p.id]) return Promise.resolve('');
      var docs = global.DocsTrello;
      if (!docs || typeof docs.listDocs !== 'function') return Promise.resolve('');
      return docs.listDocs(M.t).then(function (list) {
        var found = (list || []).filter(function (d) {
          return d && d.subject && d.subject.k === 'project' && d.subject.id === p.id;
        })[0];
        if (found) { M.projectDocs[p.id] = found.id; return found.id; }
        M.projectDocMiss[p.id] = true;
        return '';
      }, function () { return ''; });
    };
    M.projectDocId = function projectDocId(p) {
      return M.findProjectDocId(p).then(function (id) {
        if (id) return id;
        var docs = global.DocsTrello;
        if (!docs || typeof docs.createDoc !== 'function') return Promise.reject(new Error('Image non ajoutée'));
        var glyph = p.icon && (p.icon.i || p.icon.c) ? p.icon : { i: 'stack-2' };
        return docs.createDoc(M.t, p.name || 'Projet', '', { subject: { k: 'project', id: p.id }, icon: glyph }).then(function (doc) {
          if (!doc || !doc.id) throw new Error('Image non ajoutée');
          delete M.projectDocMiss[p.id];
          M.projectDocs[p.id] = doc.id;
          return doc.id;
        });
      });
    };
    M.attachFiles = function attachFiles(cardId, files) {
      var seq = Promise.resolve();
      (files || []).forEach(function (file) {
        seq = seq.then(function () { return M.attachNote(cardId, file); });
      });
      return seq;
    };
    M.pasteProjectImages = function pasteProjectImages(p, files) {
      M.setStatus('Image…', 'busy');
      return M.projectDocId(p).then(function (docId) {
        return M.attachFiles(docId, files);
      }).then(function () {
        M.setStatus('Image ajoutée', 'ok');
        M.render();
      }, function (err) {
        M.fail(err);
        throw err;
      });
    };
    M.pasteCardImages = function pasteCardImages(row, files) {
      M.setStatus('Image…', 'busy');
      return M.attachFiles(row.id, files).then(function () {
        M.setStatus('Image ajoutée', 'ok');
        M.render();
      }, function (err) {
        M.fail(err);
        throw err;
      });
    };
    M.loadCardShots = function loadCardShots(row, cb) {
      M.loadNoteImages(row && row.id).then(function (rows) { cb(rows); }, function () { cb([]); });
    };
    },
    run: function (M) {
    M.state = {
      section: 'triage',
      lists: [],
      rows: [],
      projects: [],
      places: {},
      selected: null, // triage selection (card id)
      undo: null, // takes back the last decision (a function while it can be)
      goals: { nodes: [], links: [] }, // the Mindmap goal map: projects and the tasks under them
      objectifs: [],
      metrics: [],
      capacity: S.DT().getCapacity(),
      scale: S.DT().getScale ? S.DT().getScale() : 'day',
      zoomP: 0, // pixels per day; 0 means "fit the saved scale" until the user zooms
      zoomTouched: false,
      zoomColPx: 0,
      zoomDay: '', // clock scales follow the day under the cursor
      zoomFocalMs: null,
      zoomFocalX: null,
      busy: false,
      status: '',
      statusKind: '',
      authOk: true,
      landed: false, // first load decides the landing section once
      composer: null, // orchestrator column open for a new task ('pool', 'cal:ISO', 'vague:id')
      composerText: '',
      me: null, // the viewer as a person (PeopleBoardModel.meOf): my row of the Orchestrateur
      teamRaw: null, // { members, catalog }: who can be handed a card (see teamList)
      teamAt: 0,
      filter: '', // side-panel search: narrows every section
      docOpen: false, // the Document pane (paste text and images, get tasks) replaces the card pane of the Triage
      triageTree: !global.TriageTree || global.TriageTree.prefs.treeOn(), // projects > tasks > subtasks, or the flat list
      triageFold: global.TriageTree ? global.TriageTree.prefs.collapsed() : {}, // folded lines of the tree (keys of TriageTree)
      triageCols: global.TriageTree && global.TriageTree.prefs.columns ? global.TriageTree.prefs.columns() : ['progress', 'priority'],
      triageAll: !!(global.TriageTree && global.TriageTree.prefs.allOn && global.TriageTree.prefs.allOn()), // every open task of the projects, not only the untriaged
      triageSorts: global.TriageTree && global.TriageTree.prefs.sorts ? global.TriageTree.prefs.sorts() : [],
      triageWidths: global.TriageTree && global.TriageTree.prefs.widths ? global.TriageTree.prefs.widths() : {},
      subSel: null, // { taskId, itemId, parentId, key } when a subtask, not its card, is open in the pane
    };
    M.docUI = null;
    M.statusTimer = null;
    M.reloadTimer = null;
    M.today = S.todayIso();
    M.root.innerHTML = '';
    M.els = {
      side: S.h('nav', { class: 'sp db-side', 'aria-label': 'Dashboard' }),
      nav: S.h('div', { class: 'db-nav-list' }),
      filter: S.h('input', { type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher les cartes', autocomplete: 'off' }),
      main: S.h('main', { class: 'db-main' }),
      status: S.h('div', { class: 'db-status' }),
    };
    M.shell = S.h('div', { class: 'db-root', tabindex: '-1' }, [M.els.side, S.h('div', { class: 'db-col' }, [M.els.main, M.els.status])]);
    M.filterTimer = null;
    M.els.filter.addEventListener('input', function () {
      clearTimeout(M.filterTimer);
      M.filterTimer = setTimeout(function () {
        M.state.filter = M.els.filter.value;
        M.render();
      }, 120);
    });
    M.root.appendChild(M.shell);
    M.queues = {};
    M.buildSide();
    M.people = [];
    M.projectDocs = Object.create(null);
    M.projectDocMiss = Object.create(null);
    M.noteCache = Object.create(null);
    }
  });
})(typeof window !== 'undefined' ? window : this);
