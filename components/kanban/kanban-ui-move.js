/**
 * kanban-ui: mount() part 2 of 2.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see kanban-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.KanbanUiParts = global.KanbanUiParts || {});
  var P = (global.KanbanUiPartsMountMount = global.KanbanUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.laneCell = function laneCell(lane, cell) {
      var list = cell.list;
      var body = S.h('div', { class: 'kb-cards' });
      cell.cards.forEach(function (row) { body.appendChild(M.tile(row, list)); });
      var el = S.h('div', {
        class: 'kb-cell' + (S.KM().isClosedKey(list.category) ? ' is-closed' : ''),
        'data-list': list.id,
        'data-lane': lane.key,
        style: '--kb-accent:' + list.color,
      }, [body]);
      M.bindDropZone(el, body, list, lane.key);
      return el;
    };
    M.lanesBoard = function lanesBoard(model) {
      var grid = S.h('div', { class: 'kb-lanes', style: '--kb-n:' + model.columns.length });
      var heads = S.h('div', { class: 'kb-lanes-heads' });
      model.columns.forEach(function (col) { heads.appendChild(M.laneColHead(col)); });
      grid.appendChild(heads);
      model.lanes.forEach(function (lane) {
        grid.appendChild(M.laneHead(lane));
        // An empty or folded row is just its title: there is nothing to drop into (a card only moves along its own row).
        if (!lane.count || M.state.lanesFolded[lane.key]) return;
        lane.cells.forEach(function (cell) { grid.appendChild(M.laneCell(lane, cell)); });
      });
      return grid;
    };
    M.renderBoard = function renderBoard() {
      M.state.smartIds = M.state.smart ? M.smartIds(M.state.smart) : null;
      if (global.Isolation) global.Isolation.adopt(M.t, M.state.rows);
      var scrollX = M.els.board.scrollLeft;
      var scrollY = M.els.board.scrollTop;
      var scrolls = {};
      var focusId = '';
      var active = document.activeElement;
      if (active && active.closest && M.els.board.contains(active)) {
        var focusedCard = active.closest('.kb-card');
        if (focusedCard) focusId = focusedCard.getAttribute('data-id') || '';
      }
      M.els.board.querySelectorAll('.kb-col').forEach(function (c) {
        var b = c.querySelector('.kb-col-scroll');
        if (b) scrolls[c.getAttribute('data-list')] = b.scrollTop;
      });
      M.els.board.textContent = '';
      M.els.board.classList.toggle('is-lanes', M.state.lanes);
      M.els.board.classList.toggle('is-projects', !!M.state.projects && !M.state.lanes);
      var model = M.state.lanes ? S.KM().buildLanes(M.state.rows, M.state.lists, M.viewOpts()) : null;
      var cols = M.state.projects && !M.state.lanes
        ? S.KM().buildProjectColumns(M.state.rows, M.state.lists, M.projectNodes(), M.viewOpts())
        : (model ? model.columns : M.columns());
      if (!cols.length) {
        M.els.board.appendChild(S.h('div', { class: 'kb-loading', text: 'Aucune liste dans ce tableau.' }));
        return;
      }
      if (model) M.els.board.appendChild(M.lanesBoard(model));
      else cols.forEach(function (c) { M.els.board.appendChild(M.column(c)); });
      global.Skeleton.remember('kanban', { cols: cols.map(function (c) { return c.cards.length; }) });
      M.alignChips();
      M.els.board.scrollLeft = scrollX;
      if (model) M.els.board.scrollTop = scrollY;
      M.els.board.querySelectorAll('.kb-col').forEach(function (c) {
        var b = c.querySelector('.kb-col-scroll');
        var s = scrolls[c.getAttribute('data-list')];
        if (b && s) b.scrollTop = s;
      });
      if (focusId) {
        var again = M.els.board.querySelector('.kb-card[data-id="' + focusId + '"]');
        if (again) again.focus({ preventScroll: true });
      }
    };
    M.moveProject = function moveProject(projectId, listId) {
      M.state.dragProjectId = null;
      var os = global.WorkOS;
      var GG = global.MindmapGoalsTrello;
      var cur = M.projectNodes().filter(function (n) { return n.id === projectId; })[0];
      if (!cur || !listId || cur.listId === listId) return M.renderBoard();
      if (!os || typeof os.withProjectList !== 'function' || !GG || typeof GG.save !== 'function') {
        M.setStatus('Enregistrement impossible', 'error');
        return M.renderBoard();
      }
      var next = os.withProjectList(M.state.goals, projectId, listId);
      M.state.goals = next;
      M.renderBoard();
      M.setStatus('Déplacement…');
      GG.save(M.t, next).then(function (saved) {
        M.state.goals = saved || next;
        M.setStatus('Projet déplacé', 'ok');
      }, function () {
        M.setStatus('Échec du déplacement', 'error');
        M.reload({ quiet: true });
      });
    };
    M.dropCard = function dropCard(id, listId, index, lane, projectId) {
      M.state.dragId = null;
      var moved = M.findRow(id);
      var list = M.listById(listId);
      if (!moved || !list) return M.renderBoard();
      var wantProject = projectId == null ? null : String(projectId);
      var siblings = S.KM().siblingsFor(M.state.rows, listId, id);
      var at = index == null ? siblings.length : index;
      // `index` counts the *visible* tiles; map it onto the full list so hidden cards keep their place.
      var visible = siblings.filter(function (r) {
        if (lane && S.KM().laneKey(r) !== lane) return false;
        return M.columns().some(function (c) { return c.list.id === listId && c.cards.indexOf(r) !== -1; });
      });
      if (visible.length !== siblings.length && at < visible.length) at = siblings.indexOf(visible[at]);
      else if (visible.length !== siblings.length) at = siblings.length;
      var pos = S.TM().dropPos(siblings, at);
      var listChanged = moved.listId !== listId;
      var from = { listId: moved.listId, statut: moved.statut, pos: moved.pos };
      var projectChanged = wantProject != null && (moved.projectId || '') !== wantProject;
      var nextGoals = null;
      if (projectChanged) {
        var os = global.WorkOS;
        var GG = global.MindmapGoalsTrello;
        if (!os || typeof os.withTaskProject !== 'function' || !GG || typeof GG.save !== 'function') {
          M.setStatus('Projets indisponibles', 'error');
          projectChanged = false;
        } else {
          nextGoals = os.withTaskProject(M.state.goals, id, wantProject || null);
          M.state.goals = nextGoals;
          if (typeof os.places === 'function') M.state.places = os.places(nextGoals);
          moved.projectId = wantProject;
        }
      }
      var orderChanged = listChanged || from.pos !== pos;
      if (!orderChanged && !projectChanged) return M.renderBoard();
      if (orderChanged) {
        moved.pos = pos;
        moved.listId = listId;
        moved.statut = list.name;
        moved.statutKey = list.category;
        moved.statutColor = list.color;
        if (listChanged) S.TT().syncCompleted(M.t, [moved]);
      }
      // Dropped into a hidden (completed) column: dissolve the tile instead of making it vanish.
      var tile = M.state.hideDone && !M.filtering() ? M.els.board.querySelector('.kb-card[data-id="' + id + '"]') : null;
      var target = M.columns().filter(function (c) { return c.list.id === listId; })[0];
      if (tile && target && target.hidden && orderChanged) {
        tile.classList.remove('is-dragging');
        tile.classList.add('is-dissolving');
        setTimeout(M.renderBoard, 450);
      } else M.renderBoard();
      M.paintCount();
      M.setStatus('Enregistrement…', 'busy');
      var jobs = [];
      if (orderChanged) {
        var op = listChanged ? S.TT().moveCard(M.t, id, listId, pos) : S.TT().reorderCard(M.t, id, pos);
        jobs.push(op.then(function () {
          if (listChanged) M.record({ type: 'move', targetId: id, title: moved.name, key: 'statut', before: from.statut, after: list.name, beforeVal: from.listId, afterVal: listId, beforePos: from.pos, afterPos: pos });
          else M.record({ type: 'reorder', targetId: id, title: moved.name, after: list.name, beforeVal: from.pos, afterVal: pos });
        }));
      }
      if (nextGoals) {
        jobs.push(global.MindmapGoalsTrello.save(M.t, nextGoals).then(function (saved) {
          M.state.goals = saved || nextGoals;
        }));
      }
      Promise.all(jobs).then(function () {
        var load = list.category === 'started' && global.WorkOS ? global.WorkOS.wip(M.state.rows, global.WorkOS.DEFAULT_WIP) : null;
        var note = load && load.over ? ' · En cours ' + load.count + '/' + load.cap : '';
        var msg = projectChanged
          ? (wantProject ? 'Projet enregistré' : 'Projet retiré')
          : (listChanged ? 'Carte déplacée dans « ' + list.name + ' »' : 'Ordre enregistré');
        M.setStatus(msg + note, 'ok');
        M.renderBoard();
      }, function (err) {
        M.fail(err);
        M.reload({ quiet: true });
      });
    };
    M.dropList = function dropList(listId, index) {
      M.state.dragListId = null;
      var from = M.state.lists.map(function (l) { return l.id; });
      var next = S.KM().reorderLists(M.state.lists, listId, index);
      var changed = next.some(function (l, i) { return l.id !== from[i]; });
      M.els.board.classList.remove('is-dragging-list');
      if (!changed) return M.renderBoard();
      var list = M.listById(listId);
      M.state.lists = next;
      M.renderBoard();
      M.setStatus('Enregistrement…', 'busy');
      S.TT().moveList(M.t, listId, index).then(function () {
        M.setStatus('Colonne « ' + (list ? list.name : '') + ' » déplacée', 'ok');
      }, function (err) {
        M.fail(err);
        M.reload({ quiet: true });
      });
    };
    M.posAt = function posAt(listId, aboveId, belowId) {
      var siblings = M.state.rows.filter(function (r) { return r.listId === listId; }).sort(function (a, b) {
        return (a.pos || 0) - (b.pos || 0);
      });
      var index = siblings.length;
      if (belowId) {
        var bi = siblings.findIndex(function (r) { return r.id === belowId; });
        if (bi >= 0) index = bi;
      } else if (aboveId) {
        var ai = siblings.findIndex(function (r) { return r.id === aboveId; });
        if (ai >= 0) index = ai + 1;
      }
      return S.TM().dropPos ? S.TM().dropPos(siblings, index) : 'bottom';
    };
    M.createIn = function createIn(list, typed, pos) {
      var QP = global.QuickParse;
      var q = QP ? QP.parse(typed) : { name: typed, dueDate: '' };
      var name = q.name;
      return S.TT().createRow(M.t, name, list.id, pos).then(function (res) {
        var cardId = res && res.cardId;
        // "… demain": the date is lifted out of the title into the card's due date.
        if (cardId && q.dueDate && global.GanttTrello) global.GanttTrello.saveCardDates(M.t, cardId, { dueDate: q.dueDate }).catch(function () { /* the card exists; the date can be set by hand */ });
        if (cardId) M.record({ type: 'create', targetId: cardId, title: name, after: list.name });
        // Trello's client-side card cache can lag right after a REST create: retry before giving up.
        function present() { return !cardId || M.state.rows.some(function (r) { return r.id === cardId; }); }
        function again(attempt) {
          return M.reload({ quiet: true }).then(function () {
            if (present() || attempt >= 4) return;
            return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () { return again(attempt + 1); });
          });
        }
        return again(0).then(function () { M.setStatus('Carte créée dans « ' + list.name + ' »' + (q.dueDate ? ' · échéance ' + q.dueDate : ''), 'ok'); });
      });
    };
    M.writeProgress = function writeProgress(cardId, pct) {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.getCardCompletionById !== 'function') return Promise.reject(new Error('Éditeur de progrès indisponible'));
      if (typeof CT.saveProgressTree === 'function') return CT.saveProgressTree(M.t, [{ id: cardId }], pct);
      return CT.getCardCompletionById(M.t, cardId).then(function (data) {
        data = CT.normalizeCompletionData(data || { items: [] });
        var next = data.items && data.items.length
          ? Object.assign({}, data, { items: CT.applyMasterProgress(data.items, pct) })
          : Object.assign({}, data, { progress: pct });
        return CT.saveCardCompletionById(M.t, cardId, CT.normalizeCompletionData(next)).then(function () { return [cardId]; });
      });
    };
    M.saveProgress = function saveProgress(row, pct) {
      var prev = row.progress;
      var from = { listId: row.listId, statut: row.statut, pos: row.pos };
      var wasDone = row.statutKey === 'completed';
      row.progress = pct;
      M.setStatus('Enregistrement…', 'busy');
      M.writeProgress(row.id, pct)
        .then(function (ids) {
          var done = pct >= 100
            ? M.state.lists.filter(function (l) { return l.category === 'completed'; })[0]
            : null;
          if (!done) return null;
          var chain = Promise.resolve(null);
          (ids || [row.id]).forEach(function (id) {
            if (id === row.id && wasDone) return;
            chain = chain.then(function () { return S.TT().moveCard(M.t, id, done.id, 'bottom').then(function () { return done; }); });
          });
          return chain;
        })
        .then(function (done) {
          var known = typeof prev === 'number';
          if (prev !== pct) {
            M.record({
              type: known ? 'progress' : 'field', label: 'Progrès', targetId: row.id, title: row.name,
              before: known ? prev + ' %' : '', after: pct + ' %', beforeVal: prev, afterVal: pct,
            });
          }
          if (done) {
            M.record({ type: 'move', targetId: row.id, title: row.name, key: 'statut', before: from.statut, after: done.name, beforeVal: from.listId, afterVal: done.id, beforePos: from.pos, afterPos: 'bottom' });
          }
          M.setStatus(done ? 'Carte terminée — déplacée dans « ' + done.name + ' »' : 'Enregistré', 'ok');
          return M.reload({ quiet: true });
        }, function (err) {
          row.progress = prev;
          M.renderBoard();
          M.fail(err);
          // The progress write may have landed before the move failed: show what Trello really has.
          M.reload({ quiet: true });
        });
    };
    M.unblockRow = function unblockRow(row) {
      M.setStatus('Déblocage…');
      return global.GanttTrello.setCardBlocked(M.t, row.id, false).then(function (res) {
        if (!res || !res.ok) {
          M.setStatus('Échec du déblocage' + (res && res.reason ? ' (' + res.reason + ')' : ''), 'error');
        } else {
          M.record({ type: 'edit', key: 'blocked', label: 'Blocage', targetId: row.id, title: row.name, before: 'Bloqué', after: 'Non', beforeVal: true, afterVal: false });
          M.setStatus('Carte débloquée', 'ok');
        }
        return M.reload({ quiet: true });
      }, M.fail);
    };
    M.goalPlaces = function goalPlaces() {
      var goals = global.MindmapGoalsTrello;
      var os = global.WorkOS;
      if (!goals || typeof goals.load !== 'function' || !os || typeof os.places !== 'function') return Promise.resolve({});
      return goals.load(M.t).then(function (g) {
        M.state.goals = g || { nodes: [], links: [] };
        if (global.ProjectIcon && typeof global.ProjectIcon.remember === 'function') global.ProjectIcon.remember(M.state.goals);
        return os.places(M.state.goals);
      }).catch(function () { return {}; });
    };
    M.reload = function reload(opts) {
      if (!opts || !opts.quiet) M.els.board.innerHTML = global.Skeleton.html('kanban.cols');
      return Promise.all([
        S.TT().load(M.t),
        global.PriorityTrello.isRestAuthorized(M.t).catch(function () { return false; }),
        M.goalPlaces(),
      ]).then(function (res) {
        M.state.lists = res[0].lists;
        M.state.rows = res[0].rows;
        M.state.authOk = !!res[1];
        M.state.places = res[2] || {};
        (M.state.rows || []).forEach(function (row) {
          var place = M.state.places[row.id];
          row.projectId = place && place.projectId ? place.projectId : '';
        });
        M.renderBanner();
        M.renderBar();
        M.renderBoard();
      }).catch(function (err) {
        M.els.board.textContent = '';
        M.els.board.appendChild(S.h('div', { class: 'kb-loading', text: 'Impossible de charger le tableau : ' + (err && err.message) }));
      });
    };
    M.openNewCard = function openNewCard() {
      var cols = M.state.lists.filter(function (l) { return l.category !== 'completed' && l.category !== 'canceled' && l.category !== 'blocked'; });
      var target = cols.filter(function (l) { return l.category === 'unstarted'; })[0] || cols[0];
      if (!target || !global.NewCard) return;
      global.NewCard.open({
        t: M.t,
        lists: M.state.lists,
        listId: target.id,
        onError: M.fail,
        onCreated: function (c) {
          if (c.cardId) M.record({ type: 'create', targetId: c.cardId, title: c.name, after: c.list.name });
          function present() { return !c.cardId || M.state.rows.some(function (r) { return r.id === c.cardId; }); }
          (function again(n) {
            return M.reload({ quiet: true }).then(function () {
              if (present() || n >= 4) return M.setStatus('Carte créée dans « ' + c.list.name + ' »', 'ok');
              return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () { return again(n + 1); });
            });
          })(0);
        },
      });
    };
    M.typingTarget = function typingTarget(node) {
      if (!node || !node.tagName) return false;
      var tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
    };
    M.moveLaneFocus = function moveLaneFocus(cur, dx, dy) {
      var cell = cur.closest('.kb-cell');
      if (!cell) return null;
      var listId = cell.getAttribute('data-list');
      if (dy) {
        var inList = [].slice.call(M.els.board.querySelectorAll('.kb-cell[data-list="' + listId + '"] .kb-card'));
        return inList[inList.indexOf(cur) + dy] || null;
      }
      var ids = [].slice.call(M.els.board.querySelectorAll('.kb-colhead')).map(function (n) { return n.getAttribute('data-list'); });
      var lane = cell.getAttribute('data-lane');
      var inCell = [].slice.call(cell.querySelectorAll('.kb-card'));
      var i = inCell.indexOf(cur);
      for (var k = ids.indexOf(listId) + dx; k >= 0 && k < ids.length; k += dx) {
        var there = [].slice.call(M.els.board.querySelectorAll('.kb-cell[data-list="' + ids[k] + '"][data-lane="' + lane + '"] .kb-card'));
        if (there.length) return there[Math.min(i, there.length - 1)];
      }
      return null;
    };
    M.moveCardFocus = function moveCardFocus(dx, dy) {
      var cols = [].slice.call(M.els.board.querySelectorAll('.kb-col'));
      var cur = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.kb-card') : null;
      if (!cur || !M.els.board.contains(cur)) {
        var first = M.els.board.querySelector('.kb-card');
        if (first) first.focus();
        return;
      }
      if (M.state.lanes) {
        var hop = M.moveLaneFocus(cur, dx, dy);
        if (!hop) return;
        hop.focus({ preventScroll: true });
        hop.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
      var col = cur.closest('.kb-col');
      var inCol = [].slice.call(col.querySelectorAll('.kb-card'));
      var i = inCol.indexOf(cur);
      var next = null;
      if (dy) next = inCol[i + dy] || null;
      else if (dx) {
        var dest = cols[cols.indexOf(col) + dx];
        if (!dest) return;
        var there = [].slice.call(dest.querySelectorAll('.kb-card'));
        next = there.length ? there[Math.min(i, there.length - 1)] : null;
      }
      if (!next) return;
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    },
    run: function (M) {
    M.HD.subscribe(function (on) {
      M.state.hideDone = on;
      M.renderBar();
      M.renderBoard();
    });
    if (global.LinearKeys) {
      global.LinearKeys.attach({
        t: M.t,
        hoverSelector: '.kb-card',
        idOf: function (el) { return el.getAttribute('data-id'); },
        row: M.findRow,
        lists: function () { return M.state.lists; },
        selectedId: function () {
          var active = document.activeElement && document.activeElement.closest && document.activeElement.closest('.kb-card');
          if (active && M.els.board.contains(active)) return active.getAttribute('data-id');
          return M.state.detailId || '';
        },
        anchorFor: function (id) {
          return M.els.board.querySelector('.kb-card[data-id="' + id + '"]') || M.els.detailBody;
        },
        setStatus: function (row, list) { M.dropCard(row.id, list.id, null); },
        setUrgency: function (row, urgencyId) {
          M.setStatus('Enregistrement…', 'busy');
          global.LinearKeys.saveUrgency(M.t, row.id, urgencyId).then(function () {
            M.record({ type: 'field', label: 'Urgence', targetId: row.id, title: row.name });
            return M.reload({ quiet: true });
          }).then(function () { M.setStatus('Enregistré', 'ok'); }, M.fail);
        },
        openDue: function (row, anchor) { M.openEditor(row, 'due', anchor); },
        newCard: M.openNewCard,
      });
    }
    if (global.CommandPalette) {
      global.CommandPalette.attach({
        cards: function () {
          return M.state.rows.map(function (r) { var l = M.listById(r.listId); return { id: r.id, name: r.name, hint: l ? l.name : '' }; });
        },
        onCard: function (id) {
          var row = M.findRow(id);
          if (!row) return;
          M.openDetail(row);
          var n = M.els.board.querySelector('.kb-card[data-id="' + id + '"]');
          if (n) { n.scrollIntoView({ block: 'nearest', inline: 'nearest' }); n.focus({ preventScroll: true }); }
        },
        actions: function () { return [{ label: 'Nouvelle carte', icon: 'plus', run: M.openNewCard }]; },
        isBusy: function () { return global.CardFields && global.CardFields.isOpen(); },
      });
    }
    document.addEventListener('keydown', function (e) {
      if (!M.els.root || !document.body.contains(M.els.root)) return;
      if (M.typingTarget(e.target)) return;
      if (e.target && e.target.closest && e.target.closest('.kb-detail')) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if ((global.LinearPick && global.LinearPick.isOpen()) || (global.NewCard && global.NewCard.isOpen()) || (global.CardFields && global.CardFields.isOpen())) return;
      if (document.querySelector('.tp-context-menu')) return;
      if (e.key === 'Escape') {
        if (!M.state.detailId) return;
        e.preventDefault();
        M.closeDetail();
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); M.moveCardFocus(0, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); M.moveCardFocus(0, -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); M.moveCardFocus(1, 0); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); M.moveCardFocus(-1, 0); }
    });
    M.renderBar();
    M.els.board.innerHTML = global.Skeleton.html('kanban.cols');
    if (global.AssistantDock) {
      global.AssistantDock.mount({ t: M.t, after: M.root, onRefresh: function () { M.reload({ quiet: true }); }, isBusy: function () { return global.CardFields && global.CardFields.isOpen(); } });
    }
    return { v: M.reload({ quiet: true }) };
    }
  });
})(typeof window !== 'undefined' ? window : this);
