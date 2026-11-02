/**
 * dashboard-ui: mount() part 2 of 3.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see dashboard-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.DashboardUiParts = global.DashboardUiParts || {});
  var P = (global.DashboardUiPartsMountMount = global.DashboardUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.loadProjectShots = function loadProjectShots(p, cb) {
      M.findProjectDocId(p).then(function (id) {
        if (!id) { cb([]); return; }
        return M.loadNoteImages(id).then(function (rows) { cb(rows); });
      }, function () { cb([]); });
    };
    M.foldName = function foldName(s) {
      return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    };
    M.pickOutcome = function pickOutcome(p, anchor) {
      if (!global.LinearPick || !S.WO() || !S.WO().withProjectOutcome) return;
      var nodes = ((M.state.goals && M.state.goals.nodes) || []).filter(function (n) { return n && n.level === 'objective'; });
      var items = nodes.slice().sort(M.byName).map(function (n) { return { id: n.id, label: n.name, icon: 'flag' }; });
      if (p.outcomeId) items.unshift({ id: '', label: 'Aucun', icon: 'circle-x' });
      global.LinearPick.open({
        anchor: anchor,
        placeholder: 'Résultat…',
        digits: false,
        current: p.outcomeId || '',
        items: items,
        create: function (q) {
          q = String(q || '').replace(/\s+/g, ' ').trim();
          return q ? { id: 'new:' + q, label: 'Nouveau résultat « ' + q + ' »', icon: 'plus' } : null;
        },
        onPick: function (it) {
          var done;
          if (!it || !it.id) done = M.commitGoals(S.WO().withProjectOutcome(M.state.goals, p.id, null), 'Résultat retiré');
          else if (it.id.indexOf('new:') === 0) {
            var name = it.id.slice(4).replace(/\s+/g, ' ').trim().slice(0, 120);
            if (!name) return;
            var want = M.foldName(name);
            var existing = nodes.filter(function (n) { return M.foldName(n.name) === want; })[0];
            if (existing) done = M.commitGoals(S.WO().withProjectOutcome(M.state.goals, p.id, { id: existing.id }));
            else {
              var GG = global.MindmapGoalsTrello;
              if (!GG || typeof GG.newId !== 'function') return M.setStatus('Projets indisponibles ici.', 'error');
              done = M.commitGoals(S.WO().withProjectOutcome(M.state.goals, p.id, { id: GG.newId(), name: name }), 'Résultat enregistré');
            }
          } else done = M.commitGoals(S.WO().withProjectOutcome(M.state.goals, p.id, { id: it.id }), 'Résultat enregistré');
          if (done && done.catch) done.catch(function () {});
        },
      });
    };
    M.saveProjectStep = function saveProjectStep(p, text) {
      var id = p.step && p.step.cardId;
      var row = (M.state.rows || []).filter(function (r) { return r.id === id; })[0];
      if (!row || !S.DT()) return;
      row.items = S.DM().withNextStep(row.items, text);
      M.applyGoals(M.state.goals);
      M.render();
      M.save(row, function () { return S.DT().saveNextStep(M.t, row.id, text); }, { ok: 'Prochaine action enregistrée' });
    };
    M.saveProjectMetric = function saveProjectMetric(p, n) {
      if (!p.metricId || !global.GoalsTrello || typeof global.GoalsTrello.updateMetric !== 'function') return;
      (M.state.projects || []).forEach(function (x) {
        if (x.id !== p.id) return;
        x.metricValue = n;
        var parts = String(x.metricLabel || '').split(' / ');
        x.metricLabel = parts.length > 1 ? n + ' / ' + parts[1] : String(n);
      });
      M.render();
      M.write(global.GoalsTrello.updateMetric(M.t, p.metricId, { currentValue: n }), 'Mesure enregistrée');
    };
    M.columnFields = function columnFields() {
      var TT = global.TriageTree;
      if (!TT) return {};
      return {
        columns: M.state.triageCols,
        sorts: M.state.triageSorts,
        widths: M.state.triageWidths,
        onSorts: function (next) {
          M.state.triageSorts = next || [];
          TT.prefs.setSorts(M.state.triageSorts);
          M.render();
        },
        onColumns: function (next) {
          M.state.triageCols = TT.normalizeColumns(next);
          TT.prefs.setColumns(M.state.triageCols);
          M.render();
        },
        onWidths: function (next) {
          M.state.triageWidths = next || {};
          TT.prefs.setWidths(M.state.triageWidths);
          M.render();
        },
        onWidth: function (key, w) {
          M.state.triageWidths = Object.assign({}, M.state.triageWidths);
          M.state.triageWidths[key] = w;
          TT.prefs.setWidths(M.state.triageWidths);
        },
        taskProgress: function (row) {
          return {
            blocked: !!row.blocked,
            onSet: function (pct) { M.setProgress(row, pct); },
            onUnblock: function () { M.exitBlocked(row); },
          };
        },
        priorityEl: function (row) { return M.prioBadge(row); },
        label: function (row, key) {
          if (!row) return '';
          if (key === 'due') {
            if (row.dueVague) return M.VAGUE_SHORT[row.dueVague] || row.dueVague;
            var iso = S.DM().plannedDay ? S.DM().plannedDay(row) : (row.due || '');
            return iso ? S.dayLabel(iso, M.today) : '';
          }
          if (key === 'estimate') return row.estimate ? S.DM().formatMinutes(row.estimate) : '';
          if (key === 'desc') return String(row.desc || '').replace(/\s+/g, ' ').trim();
          return TT.cellLabel(row, key);
        },
        edit: function (row, key, anchor) {
          var spec = TT.COLUMNS[key];
          var kind = spec && spec.edit;
          if (!kind) return;
          if (kind === 'places') return M.openEntities(row, 'places', anchor);
          if (kind === 'estimate') return M.estimateMenu(row, anchor);
          M.openEditor(row, kind, anchor);
        },
      };
    };
    M.treeCtx = function treeCtx(selId) {
      var picked = M.pickedProject();
      return Object.assign(M.columnFields(), {
        selectedProject: picked ? picked.id : '',
        selectProject: function (id) {
          M.state.projectSel = { id: id, at: M.state.selected };
          M.state.subSel = null;
          M.state.docOpen = false;
          M.render();
        },
        pickIcon: function (node, icon) { M.saveProject(node.id, { icon: icon }); },
        setProgress: function (node, pct) { M.setProjectProgress(node, pct); },
        addingKey: M.state.subAdding || '',
        startAdd: function (key, mode) { M.beginAdd(key, mode); },
        chooseAdd: function (key, anchor) {
          var CM = global.ContextMenu;
          if (!CM || typeof CM.show !== 'function' || !anchor) return M.beginAdd(key, 'sub');
          var r = anchor.getBoundingClientRect();
          CM.show({ clientX: r.left, clientY: r.bottom + 4 }, [
            { id: 'add-task', label: 'Tâche', icon: 'checkbox', action: function () { M.beginAdd(key, 'task'); } },
            { id: 'add-sub', label: 'Sous-tâche', icon: 'subtask', action: function () { M.beginAdd(key, 'sub'); } },
          ]);
        },
        stopAdd: function () {
          if (!M.state.subAdding) return;
          M.state.subAdding = '';
          M.state.addMode = '';
          M.renderUnlessTyping();
        },
        addSub: M.addSubtask,
        addTask: M.addSiblingTask,
        addInProject: M.addInProject,
        taskEl: function (row) { return M.triageRow(row, !picked && !M.state.subSel && row.id === selId); },
        toggle: function (key) {
          if (M.state.triageFold[key]) delete M.state.triageFold[key];
          else M.state.triageFold[key] = true;
          global.TriageTree.prefs.setCollapsed(M.state.triageFold);
          M.render();
        },
        select: function (id) {
          M.state.selected = id;
          M.state.projectSel = null;
          M.state.subSel = null;
          M.state.docOpen = false;
          M.render();
        },
        selectSub: function (n) {
          if (!n || !n.id) {
            M.state.selected = n && n.taskId;
            M.state.subSel = null;
          } else {
            M.state.selected = n.taskId;
            M.state.subSel = { taskId: n.taskId, itemId: n.id, parentId: n.parentId || '', key: n.key };
          }
          M.state.projectSel = null;
          M.state.docOpen = false;
          M.render();
          if (global.matchMedia && global.matchMedia('(max-width: 760px)').matches) M.els.main.scrollTop = 0;
        },
        selectedKey: M.state.subSel && M.state.subSel.taskId === selId ? M.state.subSel.key : '',
      });
    };
    M.triageListEl = function triageListEl(q, selId) {
      if (global.TriageTree && global.TriageTree.sortRows) q = global.TriageTree.sortRows(q, M.state.triageSorts, { lists: M.state.lists });
      var built = M.triageBuilt(q);
      if (!built) {
        var flat = S.h('div', { class: 'db-list db-triage-list' }, []);
        if (global.TriageTree && q.length) flat.appendChild(global.TriageTree.colHead(M.columnFields()));
        var flatCtx = global.TriageTree ? M.treeCtx(selId) : null;
        q.forEach(function (r) {
          var row = M.triageRow(r, r.id === selId);
          flat.appendChild(row);
          if (!flatCtx || !global.TriageTree.pinAdd) return;
          var items = Array.isArray(r.items) ? r.items.filter(function (i) { return i && typeof i.text === 'string'; }) : [];
          var done = 0;
          items.forEach(function (i) { if (i.done === true || Number(i.progress) >= 100) done++; });
          var key = 't:' + r.id;
          global.TriageTree.pinAdd(row, {
            key: key, count: items.length, done: done, total: items.length, depth: 0, choices: 'menu',
          }, flatCtx);
          if (M.state.subAdding !== key) return;
          var extra = global.TriageTree.addField({
            key: 'a:' + key,
            taskId: r.id,
            parentId: '',
            depth: M.state.addMode === 'task' ? 0 : 1,
            mode: M.state.addMode === 'task' ? 'task' : 'sub',
          }, flatCtx);
          if (extra) flat.appendChild(extra);
        });
        return flat;
      }
      var list = S.h('div', { class: 'db-list db-triage-list', role: 'tree', 'aria-label': 'Triage' }, []);
      list.appendChild(global.TriageTree.render(built, M.treeCtx(selId)));
      return list;
    };
    M.treeToggle = function treeToggle() {
      if (!global.TriageTree) return null;
      var label = M.state.triageTree ? 'Afficher en liste simple' : 'Afficher en arbre (projets, tâches, sous-tâches)';
      return S.h('button', {
        class: 'db-icon-btn' + (M.state.triageTree ? ' is-on' : ''),
        type: 'button',
        title: label,
        'aria-label': label,
        'aria-pressed': String(!!M.state.triageTree),
        'data-fk': 'triage-tree',
        onclick: function () {
          M.state.triageTree = !M.state.triageTree;
          if (!M.state.triageTree) M.state.subSel = null;
          global.TriageTree.prefs.setTreeOn(M.state.triageTree);
          M.render();
        },
      }, [S.icon('list-tree')]);
    };
    M.allToggle = function allToggle() {
      if (!global.TriageTree) return null;
      var label = M.state.triageAll ? 'Afficher seulement les cartes à trier' : 'Afficher toutes les tâches des projets';
      return S.h('button', {
        class: 'db-icon-btn' + (M.state.triageAll ? ' is-on' : ''),
        type: 'button',
        title: label,
        'aria-label': label,
        'aria-pressed': String(!!M.state.triageAll),
        'data-fk': 'triage-all',
        onclick: function () {
          M.state.triageAll = !M.state.triageAll;
          if (global.TriageTree.prefs.setAllOn) global.TriageTree.prefs.setAllOn(M.state.triageAll);
          M.render();
        },
      }, [S.icon('list-check')]);
    };
    M.columnsButton = function columnsButton() {
      var TT = global.TriageTree;
      if (!TT || typeof TT.openColumns !== 'function') return null;
      return S.h('button', {
        class: 'db-icon-btn',
        type: 'button',
        title: 'Colonnes',
        'aria-label': 'Colonnes',
        onclick: function (e) {
          e.stopPropagation();
          TT.openColumns(e.currentTarget, M.columnFields());
        },
      }, [S.icon('columns-3')]);
    };
    M.editRowTitle = function editRowTitle(r, nameEl) {
      if (nameEl.querySelector('input')) return;
      var input = S.h('input', { class: 'db-row-name tri-row-edit', type: 'text', maxlength: '300', spellcheck: 'true', 'aria-label': 'Titre' });
      input.value = r.name || '';
      var done = false;
      function finish(save_) {
        if (done) return;
        done = true;
        var v = input.value.replace(/\s+/g, ' ').trim();
        if (save_ && v && v !== r.name) {
          r.name = v;
          M.save(r, function () { return global.TableTrello.saveName(M.t, r.id, v); });
        }
        M.refreshRow(r);
      }
      ['click', 'dblclick', 'mousedown', 'keyup'].forEach(function (ev) {
        input.addEventListener(ev, function (e) { e.stopPropagation(); });
      });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', function () { finish(true); });
      nameEl.replaceWith(input);
      input.focus();
      input.select();
    };
    M.triageRow = function triageRow(r, selected) {
      var sub = (S.WO() && S.WO().stepText(r)) || S.DM().snippet(r.desc, 90);
      return S.h('div', {
        class: 'db-row tri-row' + (selected ? ' is-sel' : ''),
        'data-id': r.id,
        'data-card': r.id,
        ondblclick: function (e) {
          var nameEl = e.target && e.target.closest ? e.target.closest('.db-row-name') : null;
          if (nameEl) M.editRowTitle(r, nameEl);
        },
        onclick: function () {
          M.state.selected = r.id;
          M.state.projectSel = null;
          M.state.subSel = null;
          M.state.docOpen = false;
          M.render();
          // On a phone the pane is above the list: bring it into view.
          if (global.matchMedia && global.matchMedia('(max-width: 760px)').matches) M.els.main.scrollTop = 0;
        },
      }, [
        S.h('span', { class: 'db-row-main' }, [
          S.h('span', { class: 'db-row-name', text: r.name }),
          sub ? S.h('span', { class: 'db-step', text: sub }) : null,
        ]),
        global.TriageTree && global.TriageTree.colsEl ? global.TriageTree.colsEl(r, M.columnFields()) : null,
      ]);
    };
    M.renderUnlessTyping = function renderUnlessTyping() {
      var a = document.activeElement;
      if (a && M.els.main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
      M.render();
      return true;
    };
    M.refreshRow = function refreshRow(row) {
      var cur = M.els.main.querySelector('.db-triage-list .db-row[data-id="' + row.id + '"]');
      if (!cur) return;
      var fresh = M.triageRow(row, cur.classList.contains('is-sel'));
      if (global.TriageTree) global.TriageTree.carryOver(cur, fresh, M.treeCtx(M.state.selected));
      cur.replaceWith(fresh);
    };
    M.exitHint = function exitHint(id) {
      var ex = S.DM().exitById(id);
      if (!ex) return '';
      function into(cats) {
        var l = S.DT().listFor(M.state.lists, cats);
        return l ? 'va dans « ' + l.name + ' »' : '';
      }
      var what = {
        accept: into(['unstarted', 'backlog']),
        backlog: into(['backlog', 'unstarted']),
        waiting: 'reste au backlog, avec le nom de la personne',
        someday: 'reste au backlog, sans date',
        reference: 'garde une ligne dans le document « Références »',
        cancel: 'annule la carte',
      }[id] || '';
      return ex.label + ' (' + ex.key.toUpperCase() + ')' + (what ? ' : ' + what : '');
    };
    M.triageHost = function triageHost() {
      return {
        t: M.t,
        today: M.today,
        save: M.save,
        perform: M.perform,
        openCard: M.openCard,
        openEditor: M.openEditor,
        pasteImages: M.pasteCardImages,
        resolveImage: M.resolveImage,
        imageError: M.imageError,
        shots: function (row) { return M.shotsOf(row && row.id); },
        loadImages: M.loadCardShots,
        openEntities: M.openEntities,
        pickProject: M.pickProject,
        estimateMenu: M.estimateMenu,
        plan: function (row, iso) { M.plan(row, iso); },
        projectOf: M.projectOfRow,
        refreshRow: M.refreshRow,
        setProgress: M.setProgress,
        toggleSub: M.toggleSubtask,
        addSub: M.addSubtask,
        hintOf: M.exitHint,
        dayLabel: function (iso) { return S.dayLabel(iso, M.today); },
        dayText: function (row) {
          return row.dueVague ? (M.VAGUE_SHORT[row.dueVague] || row.dueVague) : S.dayLabel(S.DM().plannedDay(row), M.today);
        },
        dayIcon: function (row) {
          return row.dueVague ? 'calendar-time' : S.dayIconName(S.DM().plannedDay(row), M.today);
        },
        cardMenu: function (row, anchor) {
          var CM = global.ContextMenu;
          if (!CM || typeof CM.show !== 'function' || !anchor) return;
          var r = anchor.getBoundingClientRect();
          CM.show({ clientX: r.left, clientY: r.bottom + 4 }, M.withIso(row, S.menuEntries(row, M.menuCtx(row)), anchor));
        },
      };
    };
    M.docHost = function docHost() {
      return {
        t: M.t,
        today: function () { return M.today; },
        rows: function () { return M.state.rows; },
        lists: function () { return M.state.lists; },
        goals: function () { return M.state.goals; },
        projects: function () { return M.state.projects.map(function (p) { return { id: p.id, name: p.name }; }); },
        onClose: function () { M.closeDoc(); },
        onCreated: M.docCreated,
        status: M.setStatus,
      };
    };
    M.openDoc = function openDoc() {
      if (!global.TriageDocUI || !global.TriageDocModel) return M.setStatus('Document indisponible ici.', 'error');
      if (!M.hasTriage()) return M.setStatus('Ce tableau n’a pas de liste de triage.', 'error');
      M.state.section = 'triage';
      M.state.docOpen = true;
      M.render();
      if (M.docUI) M.docUI.focus();
    };
    M.closeDoc = function closeDoc() {
      M.state.docOpen = false;
      M.render();
    };
    M.docCreated = function docCreated(result, plan, finished) {
      var made = result.created.filter(function (c) { return plan.tasks.some(function (x) { return x.id === c.taskId && x.createdId === c.cardId; }); });
      var n = made.length;
      var msg = n === 1 ? '« ' + made[0].title + ' » créée dans le triage' : n + ' cartes créées dans le triage';
      var points = (result.failures || []).length;
      if (points) msg += ' · ' + points + (points === 1 ? ' point à revoir' : ' points à revoir') + ' (le détail est dans le document)';
      if (finished) {
        M.state.docOpen = false;
        if (made[0]) M.state.selected = made[0].cardId;
      }
      var undo = function () {
        if (M.state.undo !== undo) return;
        M.state.undo = null;
        M.setStatus('Annulation…', 'busy');
        global.TriageDocTrello.undo(M.t, result).then(function (out) {
          var failures = (out && out.failures) || [];
          if (failures.length && M.docUI) {
            // what could not be taken back is shown in the document, with all its details
            M.docUI.addProblems(failures);
            M.state.docOpen = true;
            M.render();
            M.setStatus('Annulation incomplète : ' + failures.length + (failures.length === 1 ? ' étape a échoué' : ' étapes ont échoué') + ' (le détail est dans le document)', 'error', 12000);
          } else {
            M.setStatus('Création annulée', 'ok');
          }
          M.reload({ quiet: true });
        }, M.fail);
      };
      M.state.undo = undo;
      M.setStatus(msg, result.failed.length ? 'error' : 'ok', 9000, { label: 'Annuler', run: undo });
      M.reload({ quiet: true });
      setTimeout(function () { M.reload({ quiet: true }); }, 1200);
    };
    M.docButton = function docButton() {
      return S.h('button', {
        class: 'db-icon-btn',
        type: 'button',
        title: 'Nouveau document',
        'aria-label': 'Nouveau document',
        'data-fk': 'new-document',
        onclick: M.openDoc,
      }, [S.icon('file-plus')]);
    };
    M.docPane = function docPane() {
      if (!M.docUI) M.docUI = global.TriageDocUI.create(M.docHost());
      return M.docUI.el;
    };
    M.splitGrip = function splitGrip(page) {
      var KEY = 'tp-split-width:triage';
      var MIN = 260;
      function room() { var w = page.getBoundingClientRect().width; return w ? Math.max(MIN, w - 360) : 4000; }
      function apply(w) { page.style.setProperty('--db-split-w', Math.max(MIN, Math.min(room(), w)) + 'px'); }
      function save(w) { try { global.localStorage.setItem(KEY, String(w)); } catch (e) {} }
      var left = function () { return page.querySelector('.db-split-l'); };
      try {
        var saved = parseInt(global.localStorage.getItem(KEY), 10);
        if (saved) apply(saved);
      } catch (e) {}
      var grip = S.h('div', { class: 'sp-grip', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Redimensionner la liste', tabindex: '0' });
      function current() { return Math.round(left().getBoundingClientRect().width); }
      function set(w, persist) { apply(w); if (persist) save(current()); }
      grip.addEventListener('pointerdown', function (e) {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        var startX = e.clientX;
        var startW = current();
        grip.classList.add('is-drag');
        document.documentElement.classList.add('sp-resizing');
        try { grip.setPointerCapture(e.pointerId); } catch (err) {}
        function move(ev) { set(startW + (ev.clientX - startX), false); }
        function done() {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', done);
          grip.removeEventListener('pointercancel', done);
          grip.classList.remove('is-drag');
          document.documentElement.classList.remove('sp-resizing');
          save(current());
        }
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', done);
        grip.addEventListener('pointercancel', done);
      });
      grip.addEventListener('dblclick', function () {
        page.style.removeProperty('--db-split-w');
        try { global.localStorage.removeItem(KEY); } catch (e) {}
      });
      grip.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        set(current() + (e.key === 'ArrowRight' ? 16 : -16), true);
      });
      return S.h('div', { class: 'db-split-gripbox' }, [grip]);
    };
    M.splitPage = function splitPage(l, r) {
      var page = S.h('div', { class: 'db-page db-page--split' }, [l, r]);
      page.insertBefore(M.splitGrip(page), r);
      return page;
    };
    M.renderTriage = function renderTriage() {
      var q = M.triageRows();
      if (M.state.docOpen && global.TriageDocUI) {
        var open = M.triageListEl(q, null);
        M.els.main.appendChild(M.splitPage(
          S.h('div', { class: 'db-split-l', 'data-keep': 'list' }, [M.pageHead('Triage', '', S.h('div', { class: 'db-head-tools' }, [M.columnsButton(), M.treeToggle(), M.allToggle(), M.docButton(), S.h('span', { class: 'db-badge', text: String(q.length) })])), open]),
          S.h('div', { class: 'db-split-r', 'data-keep': 'pane' }, [M.docPane()])
        ));
        return;
      }
      if (!q.length) {
        var none = !M.hasTriage() ? 'Aucune liste de triage sur ce tableau.' : M.state.filter ? 'Aucune carte ne correspond.' : 'Boîte de triage vide. Bien joué.';
        M.els.main.appendChild(S.h('div', { class: 'db-page' }, [
          M.pageHead('Triage', '', M.hasTriage() ? S.h('div', { class: 'db-head-tools' }, [M.allToggle(), global.TriageDocUI ? M.docButton() : null]) : null),
          M.hasTriage() ? null : M.inboxBanner(),
          S.h('div', { class: 'db-empty' }, [S.icon('inbox'), S.h('p', { text: none })]),
        ]));
        return;
      }
      var sel = q.filter(function (r) { return r.id === M.state.selected; })[0] || M.triageOrder(q)[0] || q[0];
      M.state.selected = sel.id;
      var sub = M.pickedSub(sel);
      var pane = M.pickedProject() && global.TriageUI.projectDetail
        ? global.TriageUI.projectDetail(M.pickedProject(), {
          saveProject: M.saveProject,
          pickIcon: function (project, icon) { M.saveProject(project.id, { icon: icon }); },
          pasteImages: M.pasteProjectImages,
          resolveImage: M.resolveImage,
          imageError: M.imageError,
          shots: function (project) { return M.shotsOf(M.projectDocs[project.id]); },
          loadImages: M.loadProjectShots,
          pickOutcome: M.pickOutcome,
          saveStep: M.saveProjectStep,
          saveMetric: M.saveProjectMetric,
        })
        : sub && sub.linkedRow
          ? global.TriageUI.detail(sub.linkedRow, M.triageHost())
          : sub && global.TriageUI.subDetail
            ? global.TriageUI.subDetail(sub, M.subHost(sub))
            : global.TriageUI.detail(sel, M.triageHost());
      var list = M.triageListEl(q, sel.id);
      M.els.main.appendChild(M.splitPage(
        S.h('div', { class: 'db-split-l', 'data-keep': 'list' }, [M.pageHead('Triage', '', S.h('div', { class: 'db-head-tools' }, [M.columnsButton(), M.treeToggle(), M.allToggle(), global.TriageDocUI ? M.docButton() : null, S.h('span', { class: 'db-badge', text: String(q.length) })])), list]),
        S.h('div', { class: 'db-split-r', 'data-keep': 'pane' }, [pane])
      ));
    };
    M.workList = function workList() {
      var lists = M.state.lists || [];
      var list = S.DT().listFor(lists, ['unstarted', 'backlog']);
      if (list) return list;
      for (var i = 0; i < lists.length; i++) {
        var c = lists[i].category;
        if (c !== 'triage' && c !== 'completed' && c !== 'canceled') return lists[i];
      }
      return null;
    };
    M.createHere = function createHere(draft) {
      var list = M.workList();
      var TT = global.TableTrello;
      if (!list || !TT || typeof TT.createRow !== 'function') {
        M.setStatus('Aucune liste « À faire » pour créer la tâche.', 'error');
        return;
      }
      var day = draft.date || '';
      var vague = draft.vague || '';
      var hhmm = vague ? '' : (draft.time || '');
      var row = {
        id: 'new-' + Date.now(),
        listId: list.id,
        pos: Date.now(),
        name: draft.name,
        statut: list.name,
        statutKey: list.category || 'unstarted',
        start: vague ? '' : day,
        due: vague ? '' : day,
        dueVague: vague,
        dueMode: vague ? 'vague' : (day ? 'precise' : ''),
        startTime: hhmm,
        dueTime: hhmm,
        estimate: 0,
        priority: null,
        items: [],
        dueDone: false,
        blocked: false,
        desc: '',
        fullDesc: '',
      };
      M.state.rows.push(row);
      M.render();
      var born = M.els.main.querySelector('.db-task[data-id="' + row.id + '"]');
      if (born && born.scrollIntoView) born.scrollIntoView({ block: 'nearest' });
      var job = TT.createRow(M.t, draft.name, list.id).then(function (res) {
        var id = res && res.cardId;
        if (!id) throw new Error('no-card');
        row.id = id;
        if (!day && !vague) return res;
        return S.DT().planAt ? S.DT().planAt(M.t, id, day, vague, hhmm) : S.DT().planDay(M.t, id, day);
      });
      M.write(job, '« ' + draft.name + ' » créée');
    };
    M.plan = function plan(row, iso, vague, time, endTime) {
      var hhmm = vague ? '' : (time || '');
      var until = vague ? '' : (endTime || hhmm);
      row.dueVague = vague || '';
      row.dueMode = vague ? 'vague' : (iso ? 'precise' : '');
      row.start = vague ? '' : iso;
      row.due = vague ? '' : iso;
      row.startTime = hhmm;
      row.dueTime = until;
      M.save(row, function () {
        return S.DT().planAt
          ? S.DT().planAt(M.t, row.id, iso, vague || '', hhmm, until)
          : S.DT().planDay(M.t, row.id, iso);
      });
      M.render();
    };
    M.planMany = function planMany(moves, message) {
      var done = [];
      (moves || []).forEach(function (m) {
        var row = M.state.rows.filter(function (r) { return r.id === m.id; })[0];
        if (!row) return;
        done.push({
          row: row,
          move: m,
          before: { due: row.due || '', start: row.start || '', startTime: row.startTime || '', dueTime: row.dueTime || '', dueVague: row.dueVague || '', dueMode: row.dueMode || '' },
        });
      });
      if (!done.length) return;
      done.forEach(function (x) {
        var hhmm = x.move.time || '';
        Object.assign(x.row, { dueVague: '', dueMode: 'precise', start: x.move.date, due: x.move.date, startTime: hhmm, dueTime: hhmm });
        M.save(x.row, function () { return S.DT().planAt(M.t, x.row.id, x.move.date, '', hhmm); });
      });
      function undo() {
        if (M.state.undo !== undo) return;
        M.state.undo = null;
        done.forEach(function (x) {
          // A reload may have replaced the card since: act on the current one.
          var cur = M.state.rows.filter(function (r) { return r.id === x.row.id; })[0] || x.row;
          Object.assign(cur, x.before);
          M.save(cur, function () { return S.DT().restoreDates(M.t, cur.id, x.before); });
        });
        M.setStatus('Remis comme avant', 'ok');
        M.render();
      }
      M.state.undo = undo;
      M.setStatus(message, 'ok', 9000, { label: 'Défaire', run: undo });
      M.render();
    };
    M.handOver = function handOver(row, from, to, when) {
      var change = S.PB().handover(row, from, to);
      var was = {
        assignees: (row.assignees || []).map(function (a) { return Object.assign({}, a); }),
        customs: ((row.inputs && row.inputs.customAssignees) || []).map(function (c) { return Object.assign({}, c); }),
        dates: { due: row.due || '', start: row.start || '', startTime: row.startTime || '', dueTime: row.dueTime || '', dueVague: row.dueVague || '', dueMode: row.dueMode || '' },
      };
      var backMembers = was.assignees.filter(function (a) { return !a.custom; }).map(function (a) { return String(a.id); });
      S.PB().applyHandover(row, change);
      M.save(row, function () { return S.DT().setAssignees(M.t, row.id, { members: change.members, contacts: change.contacts }); });
      // plan() paints and writes the day after the people (the writes of one card run in order).
      if (when && when.vague) M.plan(row, '', when.vague);
      else if (when) M.plan(row, when.iso, '', when.time || '');
      function undo() {
        if (M.state.undo !== undo) return;
        M.state.undo = null;
        var cur = M.state.rows.filter(function (r) { return r.id === row.id; })[0] || row;
        cur.assignees = was.assignees.map(function (a) { return Object.assign({}, a); });
        cur.inputs = Object.assign({}, cur.inputs || {}, { customAssignees: was.customs.map(function (c) { return Object.assign({}, c); }) });
        M.save(cur, function () { return S.DT().setAssignees(M.t, cur.id, { members: change.members ? backMembers : null, contacts: change.contacts ? was.customs : null }); });
        if (when) {
          Object.assign(cur, was.dates);
          M.save(cur, function () { return S.DT().restoreDates(M.t, cur.id, was.dates); });
        }
        M.setStatus('Remis comme avant', 'ok');
        M.render();
      }
      M.state.undo = undo;
      M.setStatus('« ' + row.name + ' »' + (to.key === S.ME ? ' reprise' : ' confiée à ' + to.name), 'ok', 9000, { label: 'Défaire', run: undo });
      M.render();
    };
    M.stepLine = function stepLine(row) {
      var text = S.WO() && S.WO().stepText ? S.WO().stepText(row) : '';
      if (!text) return null;
      return S.h('span', { class: 'db-step', text: text });
    };
    M.placeLine = function placeLine(row) {
      var place = S.WO() && M.state.places ? M.state.places[row.id] : null;
      var label = place ? S.WO().placeLabel(place) : '';
      if (!label) return null;
      var kids = [S.h('span', { text: label })];
      if (place.projectId && global.ProjectIcon) {
        var glyph = global.ProjectIcon.button({
          t: M.t,
          id: place.projectId,
          icon: place.icon,
          goals: function () { return M.state.goals; },
          onSaved: function (saved) {
            if (saved) M.applyGoals(saved);
            M.render();
          },
        });
        if (glyph) kids.unshift(glyph);
      }
      return S.h('span', { class: 'db-place' }, kids);
    };
    M.taskCard = function taskCard(row, showDue, owner) {
      var late = !!(S.DM().plannedDay(row) && S.DM().plannedDay(row) < M.today);
      var hard = S.WO() && S.WO().dateKind(row) === 'hard';
      var el = S.h('div', { class: 'db-task' + (late ? ' is-late' : '') + (hard ? ' is-hard' : ''), draggable: 'true', title: row.name, 'data-id': row.id, 'data-card': row.id }, [
        S.h('div', { class: 'db-task-name', text: row.name }),
        M.stepLine(row),
        M.placeLine(row),
        S.h('div', { class: 'db-task-meta' }, [
          hard ? S.h('span', { class: 'db-chip', text: 'Échéance' }) : null,
          M.prioBadge(row, true),
          M.estChip(row),
          row.startTime ? S.h('span', { class: 'db-chip', text: S.clockLabel(row.startTime) }) : null,
          showDue === true ? M.dueChip(row) : null,
        ]),
      ]);
      el.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', row.id);
        e.dataTransfer.setData(S.OWNER_TYPE, typeof owner === 'string' ? owner : S.ME);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('is-drag');
      });
      el.addEventListener('dragend', function () { el.classList.remove('is-drag'); });
      el.addEventListener('dblclick', function () { M.openCard(row); });
      return el;
    };
    M.dropZone = function dropZone(el, spec) {
      var iso = typeof spec === 'string' ? spec : ((spec && spec.iso) || '');
      var vague = spec && spec.vague ? spec.vague : '';
      var owner = spec && spec.owner ? spec.owner : S.ME; // the row this zone belongs to
      el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('is-drop'); });
      el.addEventListener('dragleave', function () { el.classList.remove('is-drop'); });
      el.addEventListener('drop', function (e) {
        e.preventDefault();
        el.classList.remove('is-drop');
        var id = e.dataTransfer.getData('text/plain');
        var row = M.state.rows.filter(function (r) { return r.id === id; })[0];
        if (!row) return;
        var wantTime = spec && spec.time ? spec.time : '';
        var curDay = row.dueVague ? '' : (row.start || row.due || '');
        var moves = vague ? row.dueVague !== vague : (row.dueVague || curDay !== iso || (row.startTime || '') !== wantTime);
        // Dropped on another person's row: the card changes hands (and day, when the cell is another day's).
        var from = e.dataTransfer.getData(S.OWNER_TYPE) || S.ME;
        var team = from !== owner && S.PB() ? M.teamList() : [];
        var heir = team.length ? S.PB().byKey(team, M.state.me, owner) : null;
        var giver = heir ? S.PB().byKey(team, M.state.me, from) : null;
        if (heir && S.PB().needsHandover(row, giver, heir)) {
          M.handOver(row, giver, heir, moves ? { iso: iso, vague: vague, time: wantTime } : null);
          return;
        }
        if (vague) {
          if (moves) M.plan(row, '', vague);
          return;
        }
        if (moves) M.plan(row, iso, '', wantTime);
      });
      return el;
    };
    M.vagueOptions = function vagueOptions() {
      var opts = global.PriorityUI && global.PriorityUI.DUE_DATE_VAGUE_OPTIONS;
      if (!opts || !opts.length) return [];
      return opts.map(function (o) { return { id: o.id, label: o.label, days: o.days }; });
    };
    M.isoFromMs = function isoFromMs(ms) {
      var d = new Date(ms);
      return isFinite(d.getTime()) ? S.DM().isoOf(d) : M.today;
    };
    M.bucketRange = function bucketRange(b) {
      if (!b || b.vague || !b.date) return null;
      var start = Date.parse(b.date + 'T' + (b.time || '00:00') + ':00');
      var end;
      if (b.endTime === '24:00') end = Date.parse(S.DM().addDays(b.date, 1) + 'T00:00:00');
      else if (b.endTime) end = Date.parse((b.end && b.end !== b.date ? b.end : b.date) + 'T' + b.endTime + ':00');
      else if (b.end) end = Date.parse(b.end + 'T00:00:00');
      if (!isFinite(start) || !isFinite(end) || end <= start) return null;
      return { start: start, end: end };
    };
    M.ensureZoom = function ensureZoom() {
      if (!(M.state.zoomP > 0) && S.DM().zoomFit) {
        var avail = Math.max(320, (M.els.main.clientWidth || 960) - 280);
        M.state.zoomP = S.DM().zoomFit(M.state.scale || 'day', avail, M.ZOOM_COUNTS[M.state.scale] || 7);
      }
      var layout = S.DM().zoomLayout(M.state.zoomP || 180);
      M.state.zoomP = layout.pxPerDay;
      M.state.zoomColPx = layout.colPx;
      if (layout.scale !== M.state.scale) {
        M.state.scale = layout.scale;
        if (S.DT().setScale) S.DT().setScale(M.state.scale);
      }
      return layout;
    };
    M.pointerOnStrip = function pointerOnStrip(clientX, strip) {
      if (!strip) return clientX;
      var rect = strip.getBoundingClientRect();
      if (clientX == null || clientX < rect.left || clientX > rect.right) return rect.left + rect.width / 2;
      return clientX;
    };
    M.readFocalMs = function readFocalMs(clientX, colPx) {
      var strip = M.els.main.querySelector('.db-board-days');
      if (!strip) return null;
      var cols = strip.querySelectorAll('[data-zoom-start]');
      if (!cols.length) return null;
      var rect = strip.getBoundingClientRect();
      var local = (clientX == null ? rect.left + rect.width / 2 : clientX) - rect.left;
      var x = strip.scrollLeft + local;
      var col = colPx > 0 ? colPx : (M.state.zoomColPx || 160);
      var stride = col + 4;
      var i = Math.floor(x / stride);
      if (i < 0) i = 0;
      if (i >= cols.length) i = cols.length - 1;
      var frac = (x - i * stride) / col;
      if (frac < 0) frac = 0;
      if (frac > 1) frac = 1;
      var a = +cols[i].getAttribute('data-zoom-start');
      var b = +cols[i].getAttribute('data-zoom-end');
      if (!isFinite(a) || !isFinite(b) || b <= a) return null;
      return a + frac * (b - a);
    };
    M.scrollStripTo = function scrollStripTo(strip, ms, clientX) {
      if (!strip || ms == null) return;
      var cols = strip.querySelectorAll('[data-zoom-start]');
      if (!cols.length) return;
      var col = M.state.zoomColPx || 160;
      var x = 0;
      for (var i = 0; i < cols.length; i++) {
        var a = +cols[i].getAttribute('data-zoom-start');
        var b = +cols[i].getAttribute('data-zoom-end');
        if (ms < b || i === cols.length - 1) {
          var frac = b > a ? (ms - a) / (b - a) : 0;
          if (frac < 0) frac = 0;
          if (frac > 1) frac = 1;
          x += frac * col;
          break;
        }
        x += col + 4;
      }
      var rect = strip.getBoundingClientRect();
      var local = clientX == null ? rect.width / 2 : clientX - rect.left;
      if (local < 0) local = 0;
      if (rect.width > 0 && local > rect.width) local = rect.width;
      strip.scrollLeft = Math.max(0, x - local);
    };
    M.anchorScroll = function anchorScroll(strip, clientX, oldCol, newCol) {
      if (!strip || !(oldCol > 0) || !(newCol > 0)) return;
      var rect = strip.getBoundingClientRect();
      var local = (clientX == null ? rect.left + rect.width / 2 : clientX) - rect.left;
      var x = strip.scrollLeft + local;
      var i = Math.floor(x / (oldCol + 4));
      var frac = (x - i * (oldCol + 4)) / oldCol;
      if (frac < 0) frac = 0;
      if (frac > 1) frac = 1;
      strip.scrollLeft = Math.max(0, i * (newCol + 4) + frac * newCol - local);
    };
    M.paintZoom = function paintZoom(layout) {
      var root = M.els.main.querySelector('.db-zoom');
      if (!root || !layout) return;
      var range = root.querySelector('.db-zoom-range');
      if (range && document.activeElement !== range) range.value = String(S.DM().zoomSlider(layout.pxPerDay));
      var bounds = S.DM().zoomBounds();
      var btns = root.querySelectorAll('.db-zoom-btn');
      if (btns[0]) btns[0].disabled = layout.pxPerDay >= bounds.max * 0.985;
      if (btns[1]) btns[1].disabled = layout.scale === 'vague';
    };
    M.applyZoom = function applyZoom(px, clientX) {
      if (!S.DM().zoomLayout) return;
      M.state.zoomTouched = true;
      var prevCol = M.state.zoomColPx;
      var prevScale = M.state.scale;
      var strip = M.els.main.querySelector('.db-board-days');
      var x = M.pointerOnStrip(clientX, strip);
      var focal = M.readFocalMs(x, prevCol);
      var layout = S.DM().zoomLayout(px);
      M.state.zoomP = layout.pxPerDay;
      M.state.zoomColPx = layout.colPx;
      if (layout.scale !== prevScale) {
        M.state.zoomFocalMs = focal;
        M.state.zoomFocalX = x;
        if (focal != null) M.state.zoomDay = M.isoFromMs(focal);
        M.state.scale = layout.scale;
        if (S.DT().setScale) S.DT().setScale(M.state.scale);
        M.render();
        return;
      }
      if (strip && layout.scale !== 'vague' && prevCol > 0) {
        strip.style.gridTemplateColumns = 'repeat(' + strip.children.length + ', ' + layout.colPx + 'px)';
        M.anchorScroll(strip, x, prevCol, layout.colPx);
        if (global.PeopleBoardUI) global.PeopleBoardUI.sync(M.els.main);
      }
      M.paintZoom(layout);
    };
    M.zoomTick = function zoomTick() {
      M.zoomAnim.raf = 0;
      var ratio = M.zoomAnim.target / M.zoomAnim.cur;
      if (!isFinite(ratio) || ratio <= 0) return;
      var done = Math.abs(Math.log(ratio)) < 0.004;
      var next = done ? M.zoomAnim.target : M.zoomAnim.cur * Math.pow(ratio, 0.3);
      M.applyZoom(next, M.zoomAnim.x);
      var applied = M.state.zoomP;
      if (Math.abs(applied - next) / Math.max(next, 1e-6) > 0.002) {
        M.zoomAnim.target = applied;
        done = true;
      }
      M.zoomAnim.cur = applied;
      if (!done) M.zoomAnim.raf = requestAnimationFrame(M.zoomTick);
    };
    M.easeZoom = function easeZoom(target, clientX) {
      var bounds = S.DM().zoomBounds ? S.DM().zoomBounds() : { min: 0.05, max: 30000 };
      if (target < bounds.min) target = bounds.min;
      if (target > bounds.max) target = bounds.max;
      if (!M.zoomAnim.raf) M.zoomAnim.cur = M.state.zoomP > 0 ? M.state.zoomP : target;
      M.zoomAnim.target = target;
      M.zoomAnim.x = clientX;
      if (!M.zoomAnim.raf) M.zoomAnim.raf = requestAnimationFrame(M.zoomTick);
    };
    },
    run: function (M) {
    M.VAGUE_SHORT = {
      'bientot': 'Bientôt',
      'sous-peu': 'Sous peu',
      'quelques-semaines': 'Quelques sem.',
      'proche': 'Proche',
      'prochain-mois': 'Mois prochain',
      'quelques-mois': 'Quelques mois',
      'semestre': 'Semestre',
      'long-terme': 'À long terme',
      'lointain': 'Lointain',
      'an-ou-deux': '1 ou 2 ans',
      'eventuellement': 'Éventuellement',
      'assez-lointain': 'Assez lointain',
      'tres-lointain': 'Très lointain',
    };
    M.MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    M.zoomAnim = { raf: 0, cur: 0, target: 0, x: 0 };
    M.ZOOM_COUNTS = { minute: 12, hour: 12, day: 7, week: 8, month: 12, year: 5, years: 12, vague: 8 };
    M.els.main.addEventListener('wheel', function (e) {
      if (M.state.section !== 'orchestrator') return;
      if (e.ctrlKey || e.metaKey) return;
      var node = e.target;
      if (node && node.closest && node.closest('input, textarea, select, .db-zoom-range')) return;
      // Over the people rows the wheel scrolls through the people (sideways it moves the columns with my row).
      // Without more people than fit, it zooms like everywhere else on the board.
      var crowd = node && node.closest ? node.closest('.pb-people') : null;
      if (crowd) {
        var days = M.els.main.querySelector('.db-board-days');
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          if (days) days.scrollLeft += e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1);
          e.preventDefault();
          return;
        }
        if (crowd.scrollHeight > crowd.clientHeight + 1) return;
      }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (!e.deltaY || !(M.state.zoomP > 0)) return;
      e.preventDefault();
      var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1;
      var f = Math.exp(-e.deltaY * unit * 0.002);
      if (f < 0.6) f = 0.6;
      if (f > 1.6) f = 1.6;
      M.easeZoom((M.zoomAnim.raf ? M.zoomAnim.target : M.state.zoomP) * f, e.clientX);
    }, { passive: false });
    M.MIDDLE = 1;
    M.els.main.addEventListener('mousedown', function (e) {
      if (e.button !== M.MIDDLE || M.state.section !== 'orchestrator') return;
      if (!e.target.closest || !e.target.closest('.db-board, .pb-people')) return;
      e.preventDefault();
    }, true);
    M.els.main.addEventListener('pointerdown', function (e) {
      if (e.button !== M.MIDDLE || M.state.section !== 'orchestrator') return;
      if (!e.target.closest) return;
      if (e.target.closest('input, textarea, select, .db-zoom')) return;
      var board = e.target.closest('.db-board, .pb-people');
      if (!board) return;
      var strip = M.els.main.querySelector('.db-board-days');
      if (!strip) return;
      e.preventDefault();
      e.stopPropagation();
      var body = e.target.closest('.db-col-body') || e.target.closest('.pb-people');
      var pan = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: strip.scrollLeft,
        top: body ? body.scrollTop : 0,
        body: body,
      };
      strip.classList.add('is-panning');
      try { strip.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
      function onMove(ev) {
        if (ev.pointerId !== pan.id) return;
        strip.scrollLeft = pan.left - (ev.clientX - pan.x);
        if (pan.body) pan.body.scrollTop = pan.top - (ev.clientY - pan.y);
      }
      function onUp(ev) {
        if (ev.pointerId !== pan.id) return;
        strip.classList.remove('is-panning');
        strip.removeEventListener('pointermove', onMove);
        strip.removeEventListener('pointerup', onUp);
        strip.removeEventListener('pointercancel', onUp);
        try { strip.releasePointerCapture(pan.id); } catch (err2) { /* not captured */ }
      }
      strip.addEventListener('pointermove', onMove);
      strip.addEventListener('pointerup', onUp);
      strip.addEventListener('pointercancel', onUp);
    });
    M.els.main.addEventListener('auxclick', function (e) {
      if (e.button === M.MIDDLE && M.state.section === 'orchestrator') e.preventDefault();
    });
    }
  });
})(typeof window !== 'undefined' ? window : this);
