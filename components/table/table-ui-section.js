/**
 * table-ui: mount() part 2 of 2.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see table-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.TableUiParts = global.TableUiParts || {});
  var P = (global.TableUiPartsMountMount = global.TableUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.commitEdit = function commitEdit(row, key, value) {
      var prev = row[key];
      var prevListId = row.listId;
      var write = null;
      if (key === 'name') {
        value = String(value).trim();
        if (!value || value === prev) return M.renderGrid();
        row.name = value;
        write = S.TT().saveName(M.t, row.id, value);
      } else if (key === 'desc') {
        if (value === prev) return M.renderGrid();
        row.desc = value;
        write = S.TT().saveDesc(M.t, row, value).then(function (full) { row.fullDesc = full; });
      } else if (key === 'category') {
        value = String(value).trim();
        if (value === prev) return M.renderGrid();
        row.category = value;
        write = S.TT().saveCategory(M.t, row.id, M.state.categoryFieldId, value);
      } else if (key === 'statut') {
        if (value === row.listId) return M.renderGrid();
        var list = M.listById(value);
        if (!list) return M.renderGrid();
        row.listId = list.id;
        row.statut = list.name;
        row.statutKey = list.category;
        row.statutColor = list.color;
        write = S.TT().moveCard(M.t, row.id, list.id, 'bottom').then(function () { return S.TT().syncCompleted(M.t, [row]); }).then(function () { return M.reload({ quiet: true }); });
      }
      M.renderGrid();
      if (!write) return;
      M.setStatus('Enregistrement…', 'busy');
      write.then(
        function () {
          M.setStatus('Enregistré', 'ok');
          M.schedulePush();
          if (key === 'statut') {
            M.record({ type: 'move', targetId: row.id, title: row.name, key: key, before: prev, after: row.statut, beforeVal: prevListId, afterVal: row.listId, afterPos: 'bottom' });
          } else {
            M.record({ type: 'edit', targetId: row.id, title: row.name, key: key, before: prev, after: value, beforeVal: prev, afterVal: value });
          }
        },
        function (err) {
          row[key] = prev;
          M.renderGrid();
          M.fail(err);
        }
      );
    };
    M.archiveRow = function archiveRow(row) {
      S.TT().archiveCard(M.t, row.id).then(function () {
        M.state.rows = M.state.rows.filter(function (r) { return r.id !== row.id; });
        M.renderGrid();
        var entry = M.record({ type: 'archive', targetId: row.id, title: row.name, after: row.statut || '' });
        M.setStatus('« ' + (row.name || 'Carte') + ' » archivée', 'ok', 8000, {
          label: 'Annuler',
          run: function () { M.toggleEntry(entry); },
        });
      }, M.fail);
    };
    M.stageGoals = function stageGoals(next) {
      M.state.goals = next;
      var os = global.WorkOS;
      if (os && typeof os.places === 'function') {
        M.state.places = os.places(next);
        S.TM().withHierarchy(M.state.rows, M.state.places);
      }
      if (global.ProjectIcon && typeof global.ProjectIcon.remember === 'function') global.ProjectIcon.remember(next);
    };
    M.saveGoals = function saveGoals(next) {
      var GG = global.MindmapGoalsTrello;
      if (!GG || typeof GG.save !== 'function') return Promise.reject(new Error('no-goals'));
      return GG.save(M.t, next).then(function (saved) {
        if (saved && saved.nodes) M.stageGoals(saved);
        return saved || next;
      });
    };
    M.projectCatalog = function projectCatalog() {
      return ((M.state.goals && M.state.goals.nodes) || []).filter(function (n) {
        return n && n.level === 'project' && n.id && n.name;
      }).map(function (n) {
        return {
          id: n.id,
          name: n.name,
          icon: n.icon || null,
          priority: typeof n.priority === 'number' ? n.priority : null,
        };
      });
    };
    M.goalsReady = function goalsReady() {
      var os = global.WorkOS;
      var GG = global.MindmapGoalsTrello;
      return !!(os && GG && typeof os.withTaskProject === 'function' && typeof os.withNodeEdit === 'function' && typeof GG.save === 'function');
    };
    M.unfoldSection = function unfoldSection(key) {
      var f = M.foldedSections();
      if (!f[key]) return;
      delete f[key];
      try { localStorage.setItem('tp-table-folded', JSON.stringify(f)); } catch (e) { /* lasts until reload */ }
    };
    M.dropRow = function dropRow(dragId, targetRow, after) {
      M.state.dragId = null;
      var moved = M.findRow(dragId);
      if (!moved || !targetRow || moved.id === targetRow.id) return M.renderGrid();
      var nextProject = targetRow.projectId || '';
      var projectChanged = M.groupMode() === 'project' && (moved.projectId || '') !== nextProject;
      var from = { listId: moved.listId, pos: moved.pos, statut: moved.statut };
      var pos = moved.pos;
      var listChanged = false;
      if (M.canReorder()) {
        var siblings = M.state.rows
          .filter(function (r) { return r.listId === targetRow.listId && r.id !== moved.id; })
          .sort(function (a, b) { return a.pos - b.pos; });
        var idx = siblings.findIndex(function (r) { return r.id === targetRow.id; }) + (after ? 1 : 0);
        pos = S.TM().dropPos(siblings, idx);
        listChanged = moved.listId !== targetRow.listId;
        var list = M.listById(targetRow.listId);
        moved.pos = pos;
        moved.listId = targetRow.listId;
        if (list) {
          moved.statut = list.name;
          moved.statutKey = list.category;
          moved.statutColor = list.color;
          if (listChanged) S.TT().syncCompleted(M.t, [moved]);
        }
        M.state.rows = S.TM().orderByLists(M.state.rows, M.state.lists);
      }
      var orderChanged = M.canReorder() && (listChanged || from.pos !== pos);
      if (projectChanged && !M.goalsReady()) {
        M.setStatus('Projets indisponibles', 'error');
        projectChanged = false;
      }
      if (!projectChanged && !orderChanged) return M.renderGrid();
      var nextGoals = null;
      if (projectChanged) {
        nextGoals = global.WorkOS.withTaskProject(M.state.goals, moved.id, nextProject || null);
        M.stageGoals(nextGoals);
      }
      M.renderGrid();
      M.setStatus('Enregistrement…', 'busy');
      var jobs = [];
      if (nextGoals) jobs.push(M.saveGoals(nextGoals));
      if (orderChanged) {
        var op = listChanged ? S.TT().moveCard(M.t, moved.id, targetRow.listId, pos) : S.TT().reorderCard(M.t, moved.id, pos);
        jobs.push(op.then(function () {
          if (listChanged) {
            M.record({ type: 'move', targetId: moved.id, title: moved.name, key: 'statut', before: from.statut, after: moved.statut, beforeVal: from.listId, afterVal: moved.listId, beforePos: from.pos, afterPos: pos });
          } else if (from.pos !== pos) {
            M.record({ type: 'reorder', targetId: moved.id, title: moved.name, after: moved.statut, beforeVal: from.pos, afterVal: pos });
          }
        }));
      }
      Promise.all(jobs).then(function () {
        M.renderGrid();
        M.setStatus(projectChanged ? (nextProject ? 'Projet enregistré' : 'Projet retiré') : 'Ordre enregistré', 'ok');
        if (orderChanged) M.schedulePush();
      }, function (err) {
        M.fail(err);
        M.reload({ quiet: true });
      });
    };
    M.dropOnSection = function dropOnSection(dragId, g) {
      M.state.dragId = null;
      var moved = M.findRow(dragId);
      if (!moved || !g) return M.renderGrid();
      var nextProject = g.free ? '' : (g.id || '');
      if (!g.free && !nextProject) return M.renderGrid();
      if ((moved.projectId || '') === nextProject) return M.renderGrid();
      if (!M.goalsReady()) return M.setStatus('Projets indisponibles', 'error');
      M.unfoldSection(g.key);
      var nextGoals = global.WorkOS.withTaskProject(M.state.goals, moved.id, nextProject || null);
      M.stageGoals(nextGoals);
      M.renderGrid();
      M.setStatus('Enregistrement…', 'busy');
      M.saveGoals(nextGoals).then(function () {
        M.renderGrid();
        M.setStatus(nextProject ? 'Projet enregistré' : 'Projet retiré', 'ok');
      }, function (err) {
        M.fail(err);
        M.reload({ quiet: true });
      });
    };
    M.saveProjectPriority = function saveProjectPriority(id, score) {
      if (!id || !M.goalsReady()) return M.setStatus('Projets indisponibles', 'error');
      var next = global.WorkOS.withNodeEdit(M.state.goals, id, { priority: score });
      M.stageGoals(next);
      M.renderGrid();
      M.setStatus('Enregistrement…', 'busy');
      M.saveGoals(next).then(function () {
        M.renderGrid();
        M.setStatus(score == null ? 'Priorité retirée' : 'Priorité enregistrée', 'ok');
      }, function (err) {
        M.fail(err);
        M.reload({ quiet: true });
      });
    };
    M.generalItems = function generalItems() {
      var connected = S.SH().isConnected(M.state.sheet);
      var items = [
        { icon: 'plus', label: 'Nouvelle carte', hint: M.newCardList() ? M.newCardList().name : '', action: function () {
          var a = document.getElementById('tbAdd');
          if (a) { a.scrollIntoView({ block: 'nearest' }); a.focus(); }
        } },
        { icon: 'refresh', label: 'Actualiser', action: function () { M.reload(); } },
        { icon: 'columns-3', label: 'Colonnes…', action: function () { M.state.menuOpen = true; M.renderMenu(); } },
      ];
      if (M.state.sorts.length) items.push({ icon: 'arrows-sort', label: 'Retirer le tri (ordre du tableau)', action: function () { M.setSort(null); } });
      items.push({ sep: true });
      if (connected) {
        items.push({ icon: 'refresh-dot', label: 'Synchroniser avec le Sheet', action: M.syncNow });
        items.push({ icon: 'list-details', label: 'Voir les logs', action: function () { M.openDrawer('logs'); } });
        items.push({ icon: 'activity', label: 'Voir les activités', action: function () { M.openDrawer('activities'); } });
      }
      items.push({ icon: connected ? 'brand-google-drive' : 'plug-connected', label: connected ? 'Afficher dans Google Sheet' : 'Connecter Google Sheets', action: M.openSheet });
      return items;
    };
    M.headerItems = function headerItems(key) {
      var spec = S.TM().COLUMNS[key];
      var idx = M.state.columns.indexOf(key);
      var sorted = M.sortOf(key) ? M.sortOf(key).dir : null;
      var others = M.state.sorts.some(function (s) { return s.key !== key; });
      return [
        { title: spec.header },
        { icon: 'sort-ascending', label: 'Trier ' + S.TM().sortLabels(key).asc, checked: sorted === 'asc' && !others, action: function () { M.setSort(key, 'asc'); } },
        { icon: 'sort-descending', label: 'Trier ' + S.TM().sortLabels(key).desc, checked: sorted === 'desc' && !others, action: function () { M.setSort(key, 'desc'); } },
        { icon: 'sort-ascending', label: 'Ajouter au tri ' + S.TM().sortLabels(key).asc, checked: sorted === 'asc' && others, disabled: !M.state.sorts.length, action: function () { M.setSort(key, 'asc', true); } },
        { icon: 'sort-descending', label: 'Ajouter au tri ' + S.TM().sortLabels(key).desc, checked: sorted === 'desc' && others, disabled: !M.state.sorts.length, action: function () { M.setSort(key, 'desc', true); } },
        { icon: 'arrows-sort', label: others ? 'Retirer ce niveau de tri' : 'Retirer le tri', disabled: !sorted, action: function () { M.setSort(key, null, true); } },
        { sep: true },
      ].concat(key === 'project' || key === 'lieu' ? [
        { icon: key === 'lieu' ? 'map-pin' : 'folder', label: 'Grouper par ' + (key === 'lieu' ? 'lieu' : 'projet'), checked: M.groupMode() === key, action: function () { M.setGroupMode(key === 'lieu' ? 'lieu' : 'project'); } },
        { sep: true },
      ] : []).concat([
        { icon: 'arrow-left', label: 'Déplacer à gauche', disabled: idx <= 0, action: function () { M.moveColumn(idx, -1); } },
        { icon: 'arrow-right', label: 'Déplacer à droite', disabled: idx >= M.state.columns.length - 1, action: function () { M.moveColumn(idx, 1); } },
        { icon: 'eye-off', label: 'Masquer la colonne', disabled: M.state.columns.length <= 1, action: function () { M.hideColumn(key); } },
        { icon: 'columns-3', label: 'Colonnes…', action: function () { M.state.menuOpen = true; M.renderMenu(); } },
      ]);
    };
    M.rowItems = function rowItems(row, key) {
      var spec = key ? S.TM().COLUMNS[key] : null;
      var editable = key && M.isEditable(key);
      var list = M.listById(row.listId);
      var items = [
        { title: row.name || 'Carte' },
        { icon: 'archive', label: 'Archiver la carte', danger: true, action: function () { M.archiveRow(row); } },
        { sep: true },
        { icon: 'arrow-up-right', label: 'Ouvrir la carte', action: function () { M.openCard(row); } },
        { icon: 'file-text', label: 'Document', action: function () { if (global.ViewTabs) global.ViewTabs.openSubject('task', row.id); } },
        { icon: 'brand-trello', label: 'Ouvrir dans Trello', disabled: !row.link, action: function () { window.open(row.link, '_blank', 'noopener'); } },
        { icon: 'link', label: 'Copier le lien de la carte', disabled: !row.link, action: function () { M.copyText(row.link); } },
      ];
      var modify = [
        ['progress', 'chart-donut', 'Progrès…'],
        ['priority', 'flag', 'Priorité…'],
        ['due', 'calendar-event', 'Échéance…'],
        ['desc', 'align-left', 'Description…'],
      ].map(function (f) {
        return { icon: f[1], label: f[2], action: function () { M.openFieldFor(row, f[0]); } };
      });
      if (key && spec && spec.kind !== 'link' && editable && key !== 'statut') {
        modify.push({ icon: 'pencil', label: spec.header, hint: 'F2', action: function () { M.beginEdit(row.id, key); } });
      }
      if (key && spec && spec.kind !== 'link' && editable && key !== 'statut' && key !== 'name') {
        modify.push({
          icon: 'clipboard',
          label: 'Coller',
          action: function () {
            if (!navigator.clipboard || !navigator.clipboard.readText) return M.setStatus('Collage non autorisé par le navigateur', 'error');
            navigator.clipboard.readText().then(function (txt) { M.commitEdit(row, key, txt); }, function () { M.setStatus('Collage refusé', 'error'); });
          },
        });
        modify.push({ icon: 'eraser', label: 'Effacer', hint: 'Suppr', disabled: !row[key], action: function () { M.commitEdit(row, key, ''); } });
      }
      items.push({ sep: true });
      items.push({ icon: 'pencil', label: 'Modifier', children: modify });
      if (key && spec && spec.kind !== 'link') {
        items.push({ icon: 'copy', label: 'Copier la valeur', action: function () { M.copyText(S.TM().cellText(row, key)); } });
      }
      if (!key || key === 'statut') {
        items.push({
          icon: (list && list.icon) || 'progress-check',
          color: list && list.color,
          label: 'Statut',
          hint: row.statut || (list && list.name) || '',
          children: M.statutItems(row),
        });
      }
      if (key && spec) {
        var sortText = S.TM().sortLabels(key);
        var sorted = M.sortOf(key) && M.state.sorts.length === 1 ? M.sortOf(key).dir : null;
        function lead(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
        items.push({
          icon: 'arrows-sort',
          label: 'Trier',
          hint: spec.header,
          children: [
            { icon: 'sort-ascending', label: lead(sortText.asc), checked: sorted === 'asc', action: function () { M.setSort(key, 'asc'); } },
            { icon: 'sort-descending', label: lead(sortText.desc), checked: sorted === 'desc', action: function () { M.setSort(key, 'desc'); } },
            { icon: 'sort-ascending', label: 'Ajouter au tri', disabled: !M.state.sorts.length, action: function () { M.setSort(key, M.sortOf(key) ? M.sortOf(key).dir : 'asc', true); } },
          ],
        });
        items.push({ icon: 'eye-off', label: 'Masquer la colonne', disabled: M.state.columns.length <= 1, action: function () { M.hideColumn(key); } });
      }
      items.push({ sep: true });
      items.push({
        icon: 'plus',
        label: 'Nouvelle carte dans « ' + (list ? list.name : 'la liste') + ' »',
        disabled: !list,
        action: function () {
          M.createIn(list, 'Nouvelle carte', null, { rename: true });
        },
      });
      if (global.Isolation) {
        items = items.concat(global.Isolation.menuItems({
          cardId: row.id,
          cardName: row.name,
          projectId: row.projectId || '',
          projectName: row.project || '',
          people: global.Isolation.peopleOf(row),
        }));
      }
      return items;
    };
    M.markSelected = function markSelected() {
      M.els.wrap.querySelectorAll('.is-selected').forEach(function (n) { n.classList.remove('is-selected'); });
      if (!M.state.selected) return;
      var sel = 'td[data-row="' + M.state.selected.rowId + '"][data-key="' + M.state.selected.key + '"]';
      var n = M.els.wrap.querySelector(sel);
      if (n) n.classList.add('is-selected');
    };
    M.loadAlerts = function loadAlerts() {
      if (!S.SH().isConnected(M.state.sheet)) return Promise.resolve();
      return S.SH().info(M.state.sheet).then(function (res) {
        if (!res.ok) return;
        M.state.alerts = (res.data && res.data.alerts) || [];
        M.journal.level = (res.data && res.data.logLevel) || 'INFO';
        M.state.sheetTheme = (res.data && res.data.sheetTheme) || 'light';
        M.renderAlerts();
        var b = M.els.bar.querySelector('.tb-badge:not(.tb-badge--soft)');
        if (b) b.hidden = !M.state.alerts.length;
      });
    };
    M.renderAlerts = function renderAlerts() {
      M.els.alert.innerHTML = '';
      if (!M.state.alerts.length) {
        M.els.alert.hidden = true;
        return;
      }
      M.els.alert.hidden = false;
      var a = M.state.alerts[0];
      var more = M.state.alerts.length > 1 ? ' (+' + (M.state.alerts.length - 1) + ' autre' + (M.state.alerts.length > 2 ? 's' : '') + ')' : '';
      M.els.alert.appendChild(S.icon('alert-octagon', 'tb-alert-icon'));
      M.els.alert.appendChild(
        S.h('div', { class: 'tb-alert-text' }, [
          S.h('strong', { text: 'Quelque chose s’est produit dans le Google Sheet — j’ai dû restaurer.' + more }),
          S.h('div', { text: (a['Message'] || '') + (a['Utilisateur'] ? '  —  ' + a['Utilisateur'] : '') + '  ·  ' + (a['Horodatage'] || '') }),
        ])
      );
      M.els.alert.appendChild(S.btn('list-details', 'Voir les logs', { onclick: function () { M.openDrawer('logs', 'CRITICAL'); } }));
      M.els.alert.appendChild(
        S.btn('check', 'Compris', {
          onclick: function () {
            M.state.alerts = [];
            M.renderAlerts();
            S.SH().ackAlerts(M.state.sheet).then(function () { M.renderBar(); });
          },
        })
      );
    };
    M.openDrawer = function openDrawer(kind, minLevel, force) {
      M.state.drawer = M.state.drawer === kind && !minLevel && !force ? null : kind;
      if (minLevel) M.journal.minLevel = minLevel;
      M.renderDrawer();
      clearInterval(M.drawerTimer);
      if (M.state.drawer && M.state.drawer !== 'history') {
        M.refreshDrawer();
        M.drawerTimer = setInterval(M.refreshDrawer, 15000);
      }
      M.renderBar();
    };
    M.refreshDrawer = function refreshDrawer() {
      if (M.state.drawer === 'history') { M.renderDrawer(); return Promise.resolve(); }
      if (!M.state.drawer || !S.SH().isConnected(M.state.sheet)) return Promise.resolve();
      M.journal.loading = true;
      var call = M.state.drawer === 'logs' ? S.SH().logs(M.state.sheet, { limit: 300, level: M.journal.minLevel }) : S.SH().activities(M.state.sheet, { limit: 300 });
      return call.then(function (res) {
        M.journal.loading = false;
        if (!res.ok) M.journal.error = res.detail || res.reason;
        else {
          M.journal.error = '';
          if (M.state.drawer === 'logs') M.journal.logs = res.data.logs || [];
          else M.journal.activities = res.data.activities || [];
        }
        M.renderDrawer();
      });
    };
    M.shorten = function shorten(v) {
      v = String(v == null ? '' : v).replace(/\s+/g, ' ');
      return v.length > 90 ? v.slice(0, 89) + '…' : v;
    };
    M.beforeAfter = function beforeAfter(r) {
      var b = r['Avant'];
      var a = r['Après'];
      if (!b && !a) return '';
      var box = S.h('span', { class: 'tb-diff' });
      if (b) box.appendChild(S.h('span', { class: 'tb-diff-old', title: b, text: M.shorten(b) }));
      if (b && a) box.appendChild(S.icon('arrow-right', 'tb-diff-arrow'));
      if (a) box.appendChild(S.h('span', { class: 'tb-diff-new', title: a, text: M.shorten(a) }));
      return box;
    };
    M.initials = function initials(name) {
      return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join('') || '?';
    };
    M.renderDrawer = function renderDrawer() {
      var d = M.els.drawer;
      d.innerHTML = '';
      d.hidden = !M.state.drawer;
      if (!M.state.drawer) return;
      var isLogs = M.state.drawer === 'logs';
      var isHist = M.state.drawer === 'history';
      var head = S.h('div', { class: 'tb-drawer-head' }, [
        S.h('div', { class: 'tb-tabs' }, [
          S.h('button', { class: 'tb-tab' + (isHist ? ' is-on' : ''), onclick: function () { M.openDrawer('history', null, true); } }, [S.icon('history'), S.h('span', { text: 'Historique' })]),
          S.h('button', { class: 'tb-tab' + (isLogs ? ' is-on' : ''), onclick: function () { M.openDrawer('logs', M.journal.minLevel, true); } }, [S.icon('list-details'), S.h('span', { text: 'Logs' })]),
          S.h('button', { class: 'tb-tab' + (!isLogs && !isHist ? ' is-on' : ''), onclick: function () { M.openDrawer('activities', null, true); } }, [S.icon('activity'), S.h('span', { text: 'Activités' })]),
        ]),
      ]);
      if (isHist) {
        M.HP.renderInto(d, head, function () { M.state.drawer = null; clearInterval(M.drawerTimer); M.renderDrawer(); M.renderBar(); });
        return;
      }
      if (isLogs) {
        var minSel = S.h('select', { class: 'tb-select', title: 'Niveau minimum affiché', onchange: function (e) { M.journal.minLevel = e.target.value; M.refreshDrawer(); } });
        M.LEVELS_UI.forEach(function (l) { minSel.appendChild(S.h('option', { value: l, text: 'Afficher ≥ ' + l, selected: l === M.journal.minLevel })); });
        var recSel = S.h('select', {
          class: 'tb-select',
          title: 'Niveau enregistré dans le Sheet (Logs)',
          onchange: function (e) {
            S.SH().setLogLevel(M.state.sheet, e.target.value).then(function (r) {
              if (r.ok) { M.journal.level = e.target.value; M.setStatus('Niveau enregistré : ' + e.target.value, 'ok'); }
              else M.setStatus('Sheet : ' + (r.detail || r.reason), 'error');
            });
          },
        });
        M.LEVELS_UI.forEach(function (l) { recSel.appendChild(S.h('option', { value: l, text: 'Enregistrer ≥ ' + l, selected: l === M.journal.level })); });
        head.appendChild(minSel);
        head.appendChild(recSel);
      }
      head.appendChild(S.h('span', { class: 'tb-spacer' }));
      head.appendChild(S.btn('refresh', null, { title: 'Actualiser', onclick: M.refreshDrawer }));
      head.appendChild(S.btn('brand-google-drive', null, { title: 'Ouvrir l’onglet dans Google Sheet', onclick: M.openSheet }));
      head.appendChild(S.btn('chevron-down', null, { title: 'Fermer', onclick: function () { M.state.drawer = null; clearInterval(M.drawerTimer); M.renderDrawer(); } }));
      d.appendChild(head);

      var body = S.h('div', { class: 'tb-drawer-body' });
      if (M.journal.error) body.appendChild(S.h('div', { class: 'tb-loading', text: 'Impossible de charger : ' + M.journal.error }));
      var rows = isLogs ? M.journal.logs : M.journal.activities;
      if (!rows.length && !M.journal.error) body.appendChild(S.h('div', { class: 'tb-loading', text: M.journal.loading ? 'Chargement…' : isLogs ? 'Aucune entrée à ce niveau.' : 'Aucune activité pour le moment.' }));
      var table = S.h('table', { class: 'tb-jgrid' });
      if (rows.length) {
        table.appendChild(
          S.h('thead', {}, [S.h('tr', {}, (isLogs ? ['Heure', 'Niveau', 'Message', 'Carte', 'Champ', 'Changement', 'Utilisateur'] : ['Heure', 'Utilisateur', 'Origine', 'Action', 'Carte', 'Champ', 'Changement']).map(function (t2) { return S.h('th', { text: t2 }); }))])
        );
        var tb = S.h('tbody');
        rows.forEach(function (r) {
          var tr = S.h('tr');
          if (isLogs) {
            var lv = r['Niveau'];
            tr.className = 'lv-row lv-row-' + lv;
            tr.appendChild(S.h('td', { class: 'tb-nowrap', text: r['Horodatage'] }));
            tr.appendChild(S.h('td', {}, [S.h('span', { class: 'tb-lv lv-' + lv }, [S.icon(M.LEVEL_ICONS[lv] || 'point'), S.h('span', { text: lv })])]));
            tr.appendChild(S.h('td', { class: 'tb-msg', title: r['Code'], text: r['Message'] }));
            tr.appendChild(S.h('td', { text: r['Carte'] }));
            tr.appendChild(S.h('td', { text: r['Champ'] }));
            tr.appendChild(S.h('td', {}, [M.beforeAfter(r)]));
            tr.appendChild(S.h('td', { text: r['Utilisateur'] }));
          } else {
            var fromTrello = r['Origine'] === 'Trello';
            tr.appendChild(S.h('td', { class: 'tb-nowrap', text: r['Horodatage'] }));
            tr.appendChild(S.h('td', {}, [S.h('span', { class: 'tb-user' }, [S.h('span', { class: 'tb-avatar', text: M.initials(r['Utilisateur']) }), S.h('span', { text: r['Utilisateur'] })])]));
            tr.appendChild(S.h('td', {}, [S.h('span', { class: 'tb-origin' }, [S.icon(fromTrello ? 'brand-trello' : 'table'), S.h('span', { text: r['Origine'] })])]));
            tr.appendChild(S.h('td', { text: r['Action'] }));
            tr.appendChild(S.h('td', { text: r['Carte'] }));
            tr.appendChild(S.h('td', { text: r['Champ'] }));
            tr.appendChild(S.h('td', {}, [M.beforeAfter(r)]));
          }
          tb.appendChild(tr);
        });
        table.appendChild(tb);
        body.appendChild(table);
      }
      d.appendChild(body);
    };
    M.colName = function colName(key) {
      var spec = key && S.TM().COLUMNS[key];
      return (spec && spec.header) || key || 'Champ';
    };
    M.applyEntry = function applyEntry(e, back) {
      var val = back ? e.beforeVal : e.afterVal;
      var row = M.findRow(e.targetId);
      if (e.type === 'archive') return back ? S.TT().unarchiveCard(M.t, e.targetId) : S.TT().archiveCard(M.t, e.targetId);
      if (e.type === 'create') return back ? S.TT().archiveCard(M.t, e.targetId) : S.TT().unarchiveCard(M.t, e.targetId);
      if (e.type === 'move') return S.TT().moveCard(M.t, e.targetId, val, back ? e.beforePos : e.afterPos);
      if (e.type === 'reorder') return S.TT().reorderCard(M.t, e.targetId, val);
      if (e.type === 'progress') return M.writeProgress(e.targetId, val);
      if (e.type === 'edit') {
        if (e.key === 'name') return S.TT().saveName(M.t, e.targetId, val);
        if (e.key === 'category') return S.TT().saveCategory(M.t, e.targetId, M.state.categoryFieldId, val);
        if (e.key === 'desc') {
          if (!row) return Promise.reject(new Error('Carte introuvable (archivée ou supprimée)'));
          return S.TT().saveDesc(M.t, row, val);
        }
      }
      return Promise.reject(new Error('Cette modification ne peut pas être annulée'));
    };
    M.histVerb = function histVerb(e) {
      if (e.type === 'archive') return 'archivée';
      if (e.type === 'create') return 'créée' + (e.after ? ' dans « ' + e.after + ' »' : '');
      if (e.type === 'move') return 'déplacée';
      if (e.type === 'reorder') return 'réordonnée' + (e.after ? ' dans « ' + e.after + ' »' : '');
      return (e.label || M.colName(e.key)) + ' modifié';
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
    M.groupMode = function groupMode() {
      try {
        var m = localStorage.getItem('tp-table-groupby');
        return m === 'lieu' || m === 'none' ? m : 'project';
      } catch (e) { return 'project'; }
    };
    M.setGroupMode = function setGroupMode(mode) {
      try { localStorage.setItem('tp-table-groupby', mode); } catch (e) { /* lasts until reload */ }
      M.renderBar();
      M.renderGrid();
    };
    M.groupItems = function groupItems() {
      var cur = M.groupMode();
      return [
        { title: 'Grouper par' },
        { icon: 'folder', label: 'Projet', checked: cur === 'project', action: function () { M.setGroupMode('project'); } },
        { icon: 'map-pin', label: 'Lieu', checked: cur === 'lieu', action: function () { M.setGroupMode('lieu'); } },
        { icon: 'list', label: 'Aucun groupe', checked: cur === 'none', action: function () { M.setGroupMode('none'); } },
      ];
    };
    M.foldedSections = function foldedSections() {
      try {
        var o = JSON.parse(localStorage.getItem('tp-table-folded') || '{}');
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
      } catch (e) { return {}; }
    };
    M.toggleSection = function toggleSection(key) {
      var f = M.foldedSections();
      if (f[key]) delete f[key]; else f[key] = true;
      try { localStorage.setItem('tp-table-folded', JSON.stringify(f)); } catch (e) { /* lasts until reload */ }
      M.renderGrid();
    };
    M.sectionPriority = function sectionPriority(g) {
      if (g.free || !g.id) return S.h('span', { class: 'tb-section-pri is-empty', text: '-', 'aria-hidden': 'true' });
      var has = typeof g.priority === 'number';
      return S.h('button', {
        class: 'tb-section-pri' + (has ? '' : ' is-empty'),
        type: 'button',
        title: 'Priorité',
        text: has ? S.TM().formatPriority(g.priority) : '-',
        onclick: function (e) {
          e.preventDefault();
          e.stopPropagation();
          var rect = e.currentTarget.getBoundingClientRect();
          S.MENU().show({ x: rect.left, y: rect.bottom + 4 }, [{ title: 'Priorité' }].concat(
            S.TM().projectPriorityItems(g.priority, function (score) { M.saveProjectPriority(g.id, score); })
          ));
        },
      });
    };
    M.sectionProgress = function sectionProgress(g) {
      var stats = S.TM().sectionStats(g.rows);
      var pct = stats.progress;
      var blocked = !!stats.blocked;
      if (blocked && pct == null) pct = 0;
      var done = pct >= 100 && !blocked;
      var box = S.h('span', {
        class: 'tb-prog tb-section-prog' + (pct == null ? ' is-empty' : '') + (done ? ' is-done' : '') + (blocked ? ' is-blocked' : ''),
        title: blocked ? 'Une tâche est bloquée' : (stats.subs ? 'Avancement des sous-tâches' : 'Avancement des tâches'),
      });
      if (g.rows && g.rows.length) {
        box.style.cursor = 'pointer';
        if (!blocked) box.title = done ? 'Rouvrir les tâches' : 'Terminer les tâches';
        box.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        box.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var CT = global.CompletionTrello;
          var next = CT && typeof CT.parentClickPercent === 'function' ? CT.parentClickPercent(pct) : (done ? 0 : 100);
          M.saveSectionProgress(g, next);
        });
      }
      if (pct == null) {
        box.textContent = '-';
        return box;
      }
      var ring = blocked && global.ProgressRing ? global.ProgressRing.create(pct, true) : M.progressRing(pct);
      if (ring && ring.classList) ring.classList.add('tb-prog-ring');
      box.appendChild(ring);
      box.appendChild(S.h('span', { class: 'tb-section-pct', text: pct + '%' }));
      return box;
    };
    M.saveSectionProgress = function saveSectionProgress(g, pct) {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.saveProgressTree !== 'function') return M.setStatus('Éditeur de progrès indisponible', 'error');
      var rows = g.rows || [];
      if (!rows.length) return;
      var wasDone = {};
      rows.forEach(function (r) {
        wasDone[r.id] = r.statutKey === 'completed';
        r.progress = pct;
      });
      M.setStatus('Enregistrement…');
      CT.saveProgressTree(M.t, rows, pct).then(function (ids) {
        return pct >= 100 ? M.moveToCompleted(ids, wasDone) : null;
      }).then(function () {
        M.setStatus(pct >= 100 ? '« ' + g.name + ' » terminé' : 'Enregistré', 'ok');
        M.schedulePush();
        M.reload({ quiet: true });
      }, function (err) {
        M.fail(err);
        M.reload({ quiet: true });
      });
    };
    M.sectionRow = function sectionRow(g) {
      var isLieu = g.kind === 'lieu';
      var sectionGlyph = S.icon(g.free ? 'inbox' : isLieu ? 'map-pin' : ((g.icon && g.icon.i) || 'stack-2'), 'tb-section-icon');
      if (!g.free && !isLieu && g.id && global.ProjectIcon) {
        var picked = global.ProjectIcon.button({
          t: M.t,
          id: g.id,
          icon: g.icon,
          className: 'ip-glyph tb-section-icon',
          goals: function () { return M.state.goals; },
          onSaved: function () { M.reload({ quiet: true }); },
        });
        if (picked) sectionGlyph = picked;
      }
      var cols = M.shownColumns();
      var pid = g.free ? '' : (g.id || ((g.rows[0] && g.rows[0].projectId) || ''));
      var tr = S.h('tr', {
        class: 'tb-section' + (g.free ? ' is-free' : ''),
        'aria-expanded': String(g.open),
        'data-project': pid,
        'data-iso-project': pid || null,
        'data-iso-label': g.free ? null : g.name,
        onclick: function (e) {
          if (e.target.closest('button, .ip-glyph, .tb-section-pri, .tb-section-prog')) return;
          M.toggleSection(g.key);
        },
      });
      tr.appendChild(S.h('td', { class: 'tb-num' }));
      tr.appendChild(S.h('td', { colspan: String(cols.length) }, [
        S.h('div', { class: 'tb-section-in' }, [
          S.h('div', { class: 'tb-section-id' }, [
            S.icon(g.open ? 'chevron-down' : 'chevron-right', 'tb-section-chev'),
            sectionGlyph,
            S.h('span', { class: 'tb-section-name', text: g.name }),
          ]),
          S.h('span', { class: 'tb-section-meta' }, [
            isLieu ? null : M.sectionPriority(g),
            M.sectionProgress(g),
            S.h('span', { class: 'tb-section-count', text: String(g.rows.length) }),
          ]),
        ]),
      ]));
      tr.addEventListener('dragover', function (e) {
        if (!M.state.dragId || isLieu) return;
        var moved = M.findRow(M.state.dragId);
        if (!moved) return;
        var nextId = g.free ? '' : (g.id || '');
        if ((moved.projectId || '') === nextId) return;
        e.preventDefault();
        tr.classList.add('is-drop-on');
      });
      tr.addEventListener('dragleave', function (e) {
        if (e.relatedTarget && tr.contains(e.relatedTarget)) return;
        tr.classList.remove('is-drop-on');
      });
      tr.addEventListener('drop', function (e) {
        if (!M.state.dragId || isLieu) return;
        e.preventDefault();
        M.dropOnSection(M.state.dragId, g);
      });
      return tr;
    };
    M.showNewHierarchyColumns = function showNewHierarchyColumns() {
      var flag = 'tp-table-hierarchy-cols';
      try {
        if (localStorage.getItem(flag)) return;
        localStorage.setItem(flag, '1');
      } catch (e) { return; }
      var add = ['project', 'parent'].filter(function (k) { return M.state.columns.indexOf(k) === -1; });
      if (!add.length) return;
      var next = M.state.columns.slice();
      var at = next.indexOf('name') + 1;
      next.splice.apply(next, [at, 0].concat(add));
      M.applyColumns(next);
    };
    M.reload = function reload(opts) {
      if (!opts || !opts.quiet) M.els.wrap.innerHTML = global.Skeleton.html('table.grid');
      return Promise.all([
        S.TT().load(M.t),
        S.TT().getTableSettings(M.t),
        S.SH().getSettings(M.t),
        global.PriorityTrello.isRestAuthorized(M.t).catch(function () {
          return false;
        }),
        M.goalPlaces(),
      ])
        .then(function (res) {
          var data = res[0];
          M.state.lists = data.lists;
          M.state.rows = S.TM().withHierarchy(data.rows, res[4]);
          M.state.categoryFieldId = data.categoryFieldId;
          M.state.categoryAvailable = data.categoryAvailable;
          M.state.columns = res[1].columns;
          M.state.widths = res[1].widths || {};
          M.state.sheet = res[2];
          M.state.authOk = !!res[3];
          M.state.places = res[4] || {};
          M.showNewHierarchyColumns();
          M.renderBanner();
          M.renderGrid();
          global.Skeleton.remember('table', { rows: M.visibleRows().length });
          M.schedulePush();
          M.loadAlerts();
        })
        .catch(function (err) {
          M.els.wrap.innerHTML = '';
          M.els.wrap.appendChild(S.h('div', { class: 'tb-loading', text: 'Impossible de charger le tableau : ' + (err && err.message) }));
        });
    };
    M.afterCreate = function afterCreate(cardId) {
      function present() { return !cardId || M.state.rows.some(function (r) { return r.id === cardId; }); }
      function again(n) {
        return M.reload({ quiet: true }).then(function () {
          if (present() || n >= 4) return;
          return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () { return again(n + 1); });
        });
      }
      return again(0);
    };
    M.newCardComposer = function newCardComposer() {
      var list = M.newCardList();
      if (!global.NewCard || !list) return;
      global.NewCard.open({
        t: M.t,
        lists: M.state.lists,
        listId: list.id,
        onError: M.fail,
        onCreated: function (c) {
          if (c.cardId) M.record({ type: 'create', targetId: c.cardId, title: c.name, after: c.list.name });
          M.afterCreate(c.cardId).then(function () { M.setStatus('Carte créée dans « ' + c.list.name + ' »', 'ok'); M.schedulePush(); });
        },
      });
    };
    },
    run: function (M) {
    M.shell.addEventListener('contextmenu', function (e) {
      if (e.target.closest('input,textarea')) {
        // While typing keep the field menu (undo/cut/copy/paste), plus "open card" for a cell editor.
        var editTd = e.target.closest('td[data-row]');
        var editRow = editTd && M.findRow(editTd.getAttribute('data-row'));
        if (!editRow || !global.ContextMenu || !global.ContextMenu.buildGenericItems) return;
        e.preventDefault();
        var fieldItems = [
          { icon: 'arrow-up-right', label: 'Ouvrir la carte en grand', action: function () { M.openCard(editRow); } },
          { sep: true },
        ].concat(global.ContextMenu.buildGenericItems(e.target, document));
        S.MENU().show({ x: e.clientX, y: e.clientY }, fieldItems, { minWidth: 230 });
        return;
      }
      e.preventDefault();
      var pt = { x: e.clientX, y: e.clientY };
      var subTr = e.target.closest('tr.tb-sub');
      var sectionTr = !subTr && e.target.closest('tr.tb-section:not(.is-free)');
      var th = e.target.closest('th[data-key]');
      var cell = e.target.closest('td[data-key]');
      var num = e.target.closest('td.tb-num[data-row]');
      var items;
      if (subTr && global.Isolation) {
        items = global.Isolation.menuItems({
          cardId: subTr.getAttribute('data-parent') || '',
          subId: subTr.getAttribute('data-iso-sub') || '',
          subName: subTr.getAttribute('data-iso-label') || '',
        });
      } else if (sectionTr && global.Isolation) {
        items = global.Isolation.menuItems({
          projectId: sectionTr.getAttribute('data-iso-project') || '',
          projectName: sectionTr.getAttribute('data-iso-label') || '',
        });
      } else if (th) items = M.headerItems(th.getAttribute('data-key'));
      else if (cell) {
        var row = M.findRow(cell.getAttribute('data-row'));
        var key = cell.getAttribute('data-key');
        if (row) M.state.selected = { rowId: row.id, key: key };
        items = row ? M.rowItems(row, key) : M.generalItems();
        if (row) M.markSelected();
      } else if (num && M.findRow(num.getAttribute('data-row'))) {
        items = M.rowItems(M.findRow(num.getAttribute('data-row')), null);
      } else items = M.generalItems();
      S.MENU().show(pt, items, { minWidth: 230 });
    });
    document.addEventListener('tp-isolation-world', function () {
      if (M.state.rows && M.state.rows.length) M.renderGrid();
    });
    M.shell.addEventListener('keydown', function (e) {
      if (M.state.editing || e.target.closest('input,textarea') || !M.state.selected) return;
      var row = M.findRow(M.state.selected.rowId);
      var key = M.state.selected.key;
      if (!row) return;
      var dirs = { ArrowDown: 'down', ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right' };
      if (dirs[e.key]) {
        e.preventDefault();
        M.moveSelection(row.id, key, dirs[e.key]);
      } else if (e.key === 'F2' || e.key === 'Enter') {
        e.preventDefault();
        if (key === 'statut') {
          var td = M.els.wrap.querySelector('td[data-row="' + row.id + '"][data-key="statut"]');
          if (td) M.openStatutMenu(row, td);
        } else if (M.POP_KIND[key] || M.isEditable(key)) M.beginEdit(row.id, key);
        else M.openCard(row);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && M.isEditable(key) && key !== 'name' && key !== 'statut') {
        e.preventDefault();
        M.commitEdit(row, key, '');
      }
    });
    M.LEVEL_ICONS = { CRITICAL: 'alert-octagon', ERROR: 'circle-x', WARNING: 'alert-triangle', INFO: 'info-circle', DEBUG: 'bug', VERBOSE: 'message-2' };
    M.LEVELS_UI = ['VERBOSE', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];
    M.journal = { logs: [], activities: [], level: 'INFO', minLevel: 'INFO', error: '', loading: false };
    M.drawerTimer = null;
    M.boardId = '';
    try { M.boardId = (M.t && typeof M.t.getContext === 'function' && M.t.getContext().board) || ''; } catch (e) { /* no context */ }
    M.HP = global.HistoryPanel.create({
      key: 'tp-table-history' + (M.boardId ? ':' + M.boardId : ''),
      apply: M.applyEntry,
      verb: M.histVerb,
      after: function () { M.schedulePush(); return M.reload({ quiet: true }); },
      onStatus: function (m, kind) { M.setStatus(m, kind); },
      onError: M.fail,
      onChange: function (n) {
        var badge = M.els.bar.querySelector('.tb-badge--soft');
        if (badge) { badge.hidden = !n; badge.textContent = String(Math.min(n, 99)); }
      },
      repaint: function () { if (M.state.drawer === 'history') M.renderDrawer(); },
    });
    document.addEventListener('click', function () {
      if (M.state.menuOpen) {
        M.state.menuOpen = false;
        M.renderMenu();
      }
    });
    M.HD.subscribe(function (on) {
      M.state.hideDone = on;
      M.renderBar();
      M.renderGrid();
    });
    M.renderBar();
    if (global.AssistantDock) {
      global.AssistantDock.mount({
        t: M.t,
        after: M.root,
        onRefresh: function () { M.reload({ quiet: true }); },
        isBusy: function () { return M.state.editing || (global.CardFields && global.CardFields.isOpen()); },
      });
    }
    setInterval(M.loadAlerts, 30000);
    if (global.LinearKeys) {
      global.LinearKeys.attach({
        t: M.t,
        hoverSelector: 'tr[data-id]',
        idOf: function (el) { return el.getAttribute('data-id'); },
        selectedId: function () { return M.state.selected ? M.state.selected.rowId : ''; },
        row: M.findRow,
        lists: function () { return M.state.lists; },
        isBusy: function () { return !!M.state.editing; },
        anchorFor: function (id) { return M.els.wrap.querySelector('tr[data-id="' + id + '"] .tb-pill') || M.els.wrap.querySelector('td[data-row="' + id + '"]'); },
        setStatus: function (row, list) { M.commitEdit(row, 'statut', list.id); },
        setUrgency: function (row, urgencyId) {
          M.setStatus('Enregistrement…', 'busy');
          global.LinearKeys.saveUrgency(M.t, row.id, urgencyId).then(function () {
            M.record({ type: 'field', label: 'Urgence', targetId: row.id, title: row.name });
            M.schedulePush();
            return M.reload({ quiet: true });
          }).then(function () { M.setStatus('Enregistré', 'ok'); }, M.fail);
        },
        openDue: function (row, anchor) { M.openEditor(row, 'due', M.els.wrap.querySelector('td[data-row="' + row.id + '"].tb-cell--due') || anchor); },
        newCard: M.newCardComposer,
      });
    }
    if (global.CommandPalette) {
      global.CommandPalette.attach({
        cards: function () { return M.state.rows.map(function (r) { var l = M.listById(r.listId); return { id: r.id, name: r.name, hint: l ? l.name : '' }; }); },
        onCard: function (id) { if (!global.CommandPalette.reveal('tr[data-id="' + id + '"]')) M.openCard(M.findRow(id)); },
        actions: function () { return [{ label: 'Nouvelle carte', icon: 'plus', run: M.newCardComposer }]; },
        isBusy: function () { return !!M.state.editing || (global.CardFields && global.CardFields.isOpen()); },
      });
    }
    return { v: M.reload() };
    }
  });
})(typeof window !== 'undefined' ? window : this);
