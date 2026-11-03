/**
 * docs-ui: mount() part 1 of 6.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see docs-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.DocsUiParts = global.DocsUiParts || {});
  var P = (global.DocsUiPartsMountMount = global.DocsUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.docsRich = function docsRich() {
      if (M.rich || !global.DocsRich) return M.rich;
      M.rich = global.DocsRich.create({
        doc: document,
        getEditor: function () { return M.editor; },
        h: S.h,
        icon: S.icon,
        inkLabels: S.INK_LABELS,
        inks: function () { return S.DM().RICH_INKS; },
        closestIn: M.closestIn,
        selNode: M.selNode,
        saveSel: M.saveSel,
        restoreSel: M.restoreSel,
        closePop: M.closePop,
        placePop: M.placePop,
        setPop: function (el) { M.pop = el; },
        onEdit: M.onEdit,
        paintToolbarState: M.paintToolbarState,
        currentRow: M.currentRow,
        isEmptyBlock: M.isEmptyBlock,
        focusInside: M.focusInside,
      });
      return M.rich;
    };
    M.fixTables = function fixTables() { var r = M.docsRich(); if (r) r.fixTables(); };
    M.focusCell = function focusCell(cell) { var r = M.docsRich(); if (r) r.focusCell(cell); };
    M.moveTableCell = function moveTableCell(cell, dir) { var r = M.docsRich(); if (r) r.moveTableCell(cell, dir); };
    M.cellBelow = function cellBelow(cell) { var r = M.docsRich(); return r ? r.cellBelow(cell) : null; };
    M.insertTable = function insertTable() { var r = M.docsRich(); if (r) r.insertTable(); };
    M.setAlign = function setAlign(dir) { var r = M.docsRich(); if (r) r.setAlign(dir); };
    M.setCallout = function setCallout(kind) { var r = M.docsRich(); if (r) r.setCallout(kind); };
    M.applyRich = function applyRich(kind, color) { var r = M.docsRich(); if (r) r.applyRich(kind, color); };
    M.openChoiceMenu = function openChoiceMenu(anchor, items) { var r = M.docsRich(); if (r) r.openChoiceMenu(anchor, items); };
    M.openColorPop = function openColorPop(anchor) { var r = M.docsRich(); if (r) r.openColorPop(anchor); };
    M.openTableMenu = function openTableMenu(anchor) { var r = M.docsRich(); if (r) r.openTableMenu(anchor); };
    M.openCalloutMenu = function openCalloutMenu(anchor) { var r = M.docsRich(); if (r) r.openCalloutMenu(anchor); };
    M.openAlignMenu = function openAlignMenu(anchor) { var r = M.docsRich(); if (r) r.openAlignMenu(anchor); };
    M.toast = function toast(msg, kind, action) {
      clearTimeout(M.toastTimer);
      M.els.toast.hidden = !msg;
      M.els.toast.className = 'dc-toast' + (kind ? ' is-' + kind : '');
      M.els.toast.textContent = '';
      if (!msg) return;
      if (action && action.onMessage) {
        M.els.toast.appendChild(S.h('button', { class: 'hp-status-link', title: 'Ouvrir l’historique', onclick: action.onMessage }, [document.createTextNode(msg)]));
        action = null;
      } else {
        M.els.toast.appendChild(document.createTextNode(msg));
      }
      if (action) {
        M.els.toast.appendChild(
          S.h('button', {
            class: 'dc-link',
            onclick: function () {
              M.toast('');
              action.run();
            },
          }, [action.label])
        );
      }
      if (kind !== 'error') M.toastTimer = setTimeout(function () { M.toast(''); }, action ? 7000 : 2600);
    };
    M.paintBanner = function paintBanner() {
      M.els.banner.textContent = '';
      M.els.banner.hidden = M.state.authOk || !M.state.current;
      if (M.els.banner.hidden) return;
      M.els.banner.appendChild(S.icon('lock'));
      M.els.banner.appendChild(S.h('span', { text: 'Trello doit être autorisé pour lire et enregistrer les documents.' }));
      M.els.banner.appendChild(M.authButton());
    };
    M.authButton = function authButton() {
      return S.h('button', {
        class: 'dc-btn dc-btn--primary',
        onclick: function () {
          S.DT().authorize(M.t).then(
            function () {
              M.state.authOk = true;
              M.paintBanner();
              if (M.state.current) M.saveNow({ retry: true });
              else M.boot();
            },
            function (err) {
              M.toast(S.reasonText(err), 'error');
            }
          );
        },
      }, [S.icon('key'), 'Autoriser Trello']);
    };
    M.setSave = function setSave(kind, msg) {
      M.state.saveState = kind;
      M.state.saveMsg = msg || '';
      M.paintStatus();
    };
    M.paintStatus = function paintStatus() {
      var s = M.els.status;
      s.className = 'dc-status is-' + M.state.saveState;
      s.textContent = '';
      if (!M.state.current) return;
      var k = M.state.saveState;
      if (k === 'offline' && global.Connection) {
        s.appendChild(global.Connection.indicator());
        return;
      }
      if (k === 'saved') s.appendChild(S.icon('cloud-check'));
      else if (k === 'dirty') s.appendChild(S.icon('pencil'));
      else if (k === 'saving') s.appendChild(S.icon('loader-2', 'dc-spin'));
      else s.appendChild(S.icon('alert-triangle'));
      var label =
        k === 'saved' ? 'Enregistré' : k === 'dirty' ? 'Modifications non enregistrées' : k === 'saving' ? 'Enregistrement…' : M.state.saveMsg || 'Échec de l’enregistrement';
      s.appendChild(S.h('span', { text: label }));
      if (k === 'error') {
        s.appendChild(S.h('button', { class: 'dc-link', onclick: function () { M.saveNow({ retry: true }); } }, ['Réessayer']));
      }
    };
    M.sortDocs = function sortDocs() {
      M.state.docs.sort(function (a, b) {
        return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
      });
    };
    M.buildSide = function buildSide() {
      M.els.side.textContent = '';
      M.els.side.appendChild(
        S.SP().head({
          title: 'Documents',
          actions: [
            { icon: 'arrows-sort', title: 'Trier', ariaLabel: 'Trier les documents', onclick: function (e) { M.openListMenu(e.currentTarget.getBoundingClientRect(), true); } },
            { icon: 'folder-plus', title: 'Nouveau dossier', onclick: function () { M.newFolder(''); } },
            { icon: 'plus', title: 'Nouveau document', accent: true, className: 'dc-new', onclick: function () { M.newDoc(); } },
          ],
        })
      );
      M.els.search.addEventListener('input', function () {
        M.state.filter = M.els.search.value;
        M.paintList();
      });
      M.els.side.appendChild(S.SP().search(M.els.search));
      M.els.side.appendChild(M.els.sideList);
      // empty area of the list: drop = move to the root, right-click = create / sort menu
      M.els.sideList.addEventListener('dragover', function (e) {
        if (!M.drag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        M.clearDropMarks();
        M.els.sideList.classList.add('is-drop-root');
      });
      M.els.sideList.addEventListener('dragleave', function (e) {
        if (!e.relatedTarget || !M.els.sideList.contains(e.relatedTarget)) M.clearDropMarks();
      });
      M.els.sideList.addEventListener('drop', function (e) {
        M.dropInto(e, '');
      });
      M.els.sideList.addEventListener('contextmenu', function (e) {
        if (e.target.closest && e.target.closest('.dc-item')) return;
        e.preventDefault();
        M.openListMenu({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY });
      });
      S.SP().resizable(M.els.side, 'docs');
    };
    M.setSort = function setSort(mode) {
      M.state.sort = mode;
      S.remember(S.SORT_KEY, mode);
      M.paintList();
    };
    M.openListMenu = function openListMenu(rect, sortOnly) {
      M.closePop();
      var items = [];
      function item(iconName, label, run, checked) {
        return S.h('button', {
          class: 'dc-menu-item' + (checked ? ' is-on' : ''),
          type: 'button',
          onclick: function () {
            M.closePop();
            run();
          },
        }, [S.icon(checked ? 'check' : iconName), S.h('span', { text: label })]);
      }
      if (!sortOnly) {
        items.push(item('plus', 'Nouveau document', function () { M.newDoc(); }));
        items.push(item('folder-plus', 'Nouveau dossier', function () { M.newFolder(''); }));
        items.push(S.h('div', { class: 'dc-menu-sep' }));
      }
      items.push(item('archive', 'Afficher les archives', function () {
        M.state.showArchived = !M.state.showArchived;
        M.paintList();
      }, M.state.showArchived));
      items.push(S.h('div', { class: 'dc-menu-sep' }));
      items.push(S.h('div', { class: 'dc-pop-sub', text: 'Trier par' }));
      S.SORT_LABELS.forEach(function (s) {
        items.push(item('arrows-sort', s[1], function () { M.setSort(s[0]); }, M.state.sort === s[0]));
      });
      M.pop = S.h('div', { class: 'dc-pop dc-menu', role: 'menu' }, items);
      M.placePop(M.pop, rect);
    };
    M.subjectGlyph = function subjectGlyph(subject) {
      if (subject && subject.k === 'entity') return 'stack-2';
      if (subject && subject.k === 'task') return 'checkbox';
      if (subject && subject.k === 'project') return 'briefcase';
      if (subject && subject.k === 'day') return 'calendar-event';
      return 'file-text';
    };
    M.visibleTasks = function visibleTasks() {
      var q = S.DM().fold(String(M.state.filter || '').trim());
      var hide = global.HideDone ? global.HideDone.get() : true;
      return (M.state.tasks || []).filter(function (d) {
        if (hide && d.dueComplete) return false;
        if (q && S.DM().fold(d.title).indexOf(q) < 0) return false;
        return true;
      });
    };
    M.paintTaskSection = function paintTaskSection(list) {
      var all = M.state.tasks || [];
      if (!all.length) return;
      var hide = global.HideDone ? global.HideDone.get() : true;
      var done = all.filter(function (d) { return d.dueComplete; }).length;
      var head = S.h('div', { class: 'dc-sec' }, [S.h('span', { class: 'dc-sec-label', text: 'Tâches' })]);
      if (done && global.HideDone) {
        head.appendChild(S.h('button', {
          class: 'dc-sec-toggle',
          type: 'button',
          title: global.HideDone.title(hide),
          'aria-label': global.HideDone.title(hide),
          onclick: function (e) {
            e.stopPropagation();
            global.HideDone.set(!global.HideDone.get());
            M.paintList();
          },
        }, [S.icon(global.HideDone.icon(hide))]));
      }
      list.appendChild(head);
      var tasks = M.visibleTasks();
      if (!tasks.length) {
        list.appendChild(S.h('p', {
          class: 'dc-list-empty',
          text: hide && done ? 'Tâches terminées masquées.' : 'Aucune tâche ne correspond.',
        }));
        return;
      }
      tasks.forEach(function (d) {
        var on = M.state.current && M.state.current.id === d.id;
        var more = S.h('button', {
          class: 'dc-item-more',
          title: 'Actions',
          'aria-label': 'Actions de la tâche',
          onclick: function (e) {
            e.stopPropagation();
            M.openDocMenu(more, d.id);
          },
        }, [S.icon('dots')]);
        list.appendChild(S.h('div', {
          class: 'sp-row dc-item' + (on ? ' is-on' : '') + (d.dueComplete ? ' is-done' : ''),
          role: 'option',
          'aria-selected': on ? 'true' : 'false',
          tabindex: '0',
          'data-id': d.id,
          onclick: function () { M.openTaskDoc(d.id); },
          onkeydown: function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              M.openTaskDoc(d.id);
            }
          },
          oncontextmenu: function (e) {
            e.preventDefault();
            M.openDocMenu(more, d.id);
          },
        }, [
          S.h('span', { class: 'dc-item-icon', 'aria-hidden': 'true' }, [S.icon('checkbox')]),
          S.h('span', { class: 'dc-item-main' }, [
            S.h('span', { class: 'dc-item-title', text: d.title }),
            S.h('span', { class: 'dc-item-time', text: S.DM().relativeTime(d.updatedAt) }),
          ]),
          more,
        ]));
      });
    };
    M.taskById = function taskById(id) {
      return (M.state.tasks || []).filter(function (x) { return x.id === id; })[0]
        || (M.state.current && M.state.current.kind === 'task' && M.state.current.id === id ? M.state.current : null);
    };
    M.isTaskId = function isTaskId(id, opts) {
      return !!((opts && opts.asTask) || M.taskById(id));
    };
    M.paintList = function paintList() {
      var list = M.els.sideList;
      list.textContent = '';
      if (!M.state.docsLoaded) {
        list.innerHTML = global.Skeleton.html('docs.list');
        return;
      }
      var rows = S.DM().folderRows(M.state.docs, M.state.idx, M.state.openFolders, M.state.filter, M.state.sort, M.state.showArchived);
      global.Skeleton.remember('docs', { items: rows.length + (M.state.tasks ? M.state.tasks.length : 0) });
      var pend = M.state.pendingFolder;
      if (pend && pend.parent && !rows.some(function (r) { return r.type === 'folder' && r.folder.id === pend.parent; })) pend = M.state.pendingFolder = null;
      M.paintTaskSection(list);
      if (pend && !pend.parent) list.appendChild(M.newFolderRow(0));
      if (!rows.length && !pend) {
        if (M.state.filter || !(M.state.tasks || []).length) {
          list.appendChild(
            S.h('p', {
              class: 'dc-list-empty',
              text: !M.state.authOk ? 'Autorisation Trello requise.' : M.state.filter ? 'Aucun document ne correspond.' : 'Aucun document pour l’instant.',
            })
          );
        }
        M.appendAddRow(list);
        return;
      }
      if ((M.state.tasks || []).length) list.appendChild(S.h('div', { class: 'dc-sec' }, [S.h('span', { class: 'dc-sec-label', text: 'Notes' })]));
      rows.forEach(function (r) {
        if (r.type === 'folder') {
          list.appendChild(M.folderRow(r));
          if (pend && pend.parent === r.folder.id) list.appendChild(M.newFolderRow(r.depth + 1));
          return;
        }
        var d = r.doc;
        var on = M.state.current && M.state.current.id === d.id;
        var more = S.h('button', {
          class: 'dc-item-more',
          title: 'Actions',
          'aria-label': 'Actions du document',
          onclick: function (e) {
            e.stopPropagation();
            M.openDocMenu(more, d.id);
          },
        }, [S.icon('dots')]);
        var row = S.h('div', {
          class: 'sp-row dc-item' + (on ? ' is-on' : '') + (r.archived ? ' is-archived' : ''),
          style: 'padding-left:' + (8 + r.depth * 16) + 'px',
          role: 'option',
          'aria-selected': on ? 'true' : 'false',
          tabindex: '0',
          'data-id': d.id,
          onclick: function () { M.openDoc(d.id); },
          onkeydown: function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              M.openDoc(d.id);
            }
          },
          oncontextmenu: function (e) {
            e.preventDefault();
            M.openDocMenu(more, d.id);
          },
        }, [
          M.docChev(r),
          M.itemIcon(d, M.subjectGlyph(d.subject)),
          S.h('span', { class: 'dc-item-main' }, [
            S.h('span', { class: 'dc-item-title', text: d.title }),
            S.h('span', { class: 'dc-item-time', text: S.DM().relativeTime(d.updatedAt) + (/^size/.test(M.state.sort) ? ' · ' + S.sizeLabel(d.size) : '') }),
          ]),
          more,
        ]);
        M.wireDrag(row, 'doc', d.id, M.docFolderOf(d.id));
        list.appendChild(row);
      });
      M.appendAddRow(list);
      M.bindDocInsert();
    };
    M.appendAddRow = function appendAddRow(list) {
      if (!global.AddRow || !M.state.authOk) return;
      list.appendChild(global.AddRow.line({
        label: 'Nouveau document',
        onSubmit: function (title) { M.newDoc(title); },
      }));
    };
    M.bindDocInsert = function bindDocInsert() {
      if (!global.InsertGap) return;
      global.InsertGap.watch(M.els.sideList, {
        item: '.dc-item',
        placeholder: 'Titre…',
        onCreate: function (title, info) {
          var above = info.above;
          if (!above) return;
          if (above.classList.contains('dc-folder')) {
            M.newDoc(title, '', above.getAttribute('data-folder') || '', '');
            return;
          }
          var id = above.getAttribute('data-id');
          M.newDoc(title, '', id ? M.docFolderOf(id) : '', (id && M.state.idx.parents && M.state.idx.parents[id]) || '');
        },
      });
    };
    M.setFolderOpen = function setFolderOpen(id, open) {
      if (open) M.state.openFolders[id] = 1;
      else delete M.state.openFolders[id];
      S.remember(S.OPEN_KEY, JSON.stringify(M.state.openFolders));
    };
    M.docFolderOf = function docFolderOf(id) {
      var cur = id;
      var hops = 0;
      var parents = M.state.idx.parents || {};
      while (parents[cur] && hops++ < 1000) cur = parents[cur];
      if (M.state.idx.docs[cur]) return M.state.idx.docs[cur];
      var own = S.DM().folderByDoc(M.state.idx, cur);
      return own ? own.id : '';
    };
    M.folderLabel = function folderLabel(f) {
      if (!f) return '';
      var d = f.doc && M.state.docs.filter(function (x) { return x.id === f.doc; })[0];
      return (d && d.title) || f.name;
    };
    M.openFolder = function openFolder(id) {
      var f = S.DM().folderById(M.state.idx, id);
      if (!f || M.creatingFolder[id]) return;
      if (f.doc) {
        M.openDoc(f.doc);
        return;
      }
      M.creatingFolder[id] = true;
      M.setBusy('Création du document…');
      S.DT().createDoc(M.t, f.name, '').then(function (doc) {
        M.setBusy('');
        M.state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt || '', size: 0, body: '' });
        M.sortDocs();
        return M.editFolders(function (idx) {
          var x = S.DM().folderById(idx, id);
          if (x && !x.doc) x.doc = doc.id;
        }).then(function () {
          M.creatingFolder[id] = false;
          var linked = S.DM().folderById(M.state.idx, id);
          if (linked && linked.doc && linked.doc !== doc.id) {
            M.state.docs = M.state.docs.filter(function (d) { return d.id !== doc.id; });
            M.paintList();
            S.DT().deleteDoc(M.t, doc.id).catch(function () {});
            return M.openDoc(linked.doc, { skipSave: true });
          }
          return M.openDoc(doc.id, { skipSave: true });
        });
      }, function (err) {
        M.creatingFolder[id] = false;
        M.setBusy('');
        M.failure(err);
      });
    };
    M.syncFolderName = function syncFolderName(docId, title) {
      var f = S.DM().folderByDoc(M.state.idx, docId);
      var name = S.DM().cleanFolderName(title);
      if (!f || !name || f.name === name) return;
      M.editFolders(function (idx) {
        var x = S.DM().folderByDoc(idx, docId);
        if (x && x.name !== name) x.name = name;
      });
    };
    M.docChev = function docChev(r) {
      if (!r.childCount) return S.h('span', { class: 'dc-chev-gap' });
      var chev = S.icon(r.open ? 'chevron-down' : 'chevron-right', 'dc-folder-chev dc-doc-chev');
      chev.addEventListener('click', function (e) {
        e.stopPropagation();
        M.setFolderOpen('doc:' + r.doc.id, !M.state.openFolders['doc:' + r.doc.id]);
        M.paintList();
      });
      return chev;
    };
    M.shownIcon = function shownIcon(doc) {
      var mark = S.DM().normalizeIcon(doc && doc.icon);
      if (doc && doc.subject && doc.subject.k === 'project' && global.ProjectIcon && typeof global.ProjectIcon.of === 'function') {
        var fromGoal = S.DM().normalizeIcon(global.ProjectIcon.of(doc.subject.id));
        if (fromGoal) return fromGoal;
      }
      return mark;
    };
    M.itemIcon = function itemIcon(doc, fallback, whenMissing) {
      var mark = M.shownIcon(doc);
      var name = (mark && mark.i) || fallback;
      var btn = S.h('button', {
        class: 'dc-item-icon' + (mark && mark.c ? ' has-color' : ''),
        type: 'button',
        tabindex: '-1',
        draggable: 'false',
        title: 'Icône',
        'aria-label': 'Changer l’icône',
      }, [S.icon(name)]);
      if (mark && mark.c) btn.style.color = mark.c;
      btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        if (!doc || !doc.id) {
          if (whenMissing) whenMissing();
          return;
        }
        if (M.pop && M.pop.classList.contains('dc-iconpick') && M.pop._for === doc.id) {
          M.closePop();
          return;
        }
        M.openIconPicker(btn, doc, fallback);
      });
      return btn;
    };
    M.scheduleIconSave = function scheduleIconSave(id) {
      clearTimeout(M.iconTimers[id]);
      M.iconTimers[id] = setTimeout(function () { M.persistIcon(id); }, 350);
    };
    M.applyIcon = function applyIcon(doc, next) {
      var norm = S.DM().normalizeIcon(next);
      doc.icon = norm;
      if (doc.subject && doc.subject.k === 'project' && global.ProjectIcon && typeof global.ProjectIcon.save === 'function') {
        global.ProjectIcon.save(M.t, null, doc.subject.id, norm);
      }
      if (M.state.current && M.state.current.id === doc.id) M.state.current.icon = norm;
      M.touchListItem(doc.id, { icon: norm });
      M.scheduleIconSave(doc.id);
    };
    M.persistIcon = function persistIcon(id) {
      M.iconTimers[id] = null;
      var d = M.state.docs.filter(function (x) { return x.id === id; })[0];
      if (!d) return;
      if (M.saving) {
        M.scheduleIconSave(id);
        return;
      }
      var cur = M.state.current && M.state.current.id === id ? M.state.current : null;
      var sent = S.DM().iconLine(d.icon);
      var pre = cur ? M.saveNow() : Promise.resolve(true);
      pre.then(function (ok) {
        if (!ok) return;
        if (M.saving) {
          M.scheduleIconSave(id);
          return;
        }
        M.saving = true;
        if (cur && M.state.current === cur) M.setSave('saving');
        S.DT().setIcon(M.t, { id: id, rev: cur ? cur.rev : (d.rev != null ? d.rev : null) }, d.icon || null).then(function (res) {
          M.saving = false;
          var newer = S.DM().iconLine(d.icon) !== sent;
          if (cur) {
            cur.rev = res.rev;
            if (res.updatedAt) cur.updatedAt = res.updatedAt;
            if (!newer) cur.icon = res.icon;
          }
          var patch = { rev: res.rev };
          if (res.updatedAt) patch.updatedAt = res.updatedAt;
          if (!newer) patch.icon = res.icon;
          M.touchListItem(id, patch);
          if (cur && M.state.current === cur) {
            var dirty = M.editor && (S.DM().domToMd(M.editor) !== M.lastMd || (S.DM().cleanTitle(M.els.title.value) || S.DM().UNTITLED) !== M.savedTitle);
            M.setSave(dirty ? 'dirty' : 'saved');
          }
          if (newer) M.scheduleIconSave(id);
        }, function (err) {
          M.saving = false;
          M.failure(err);
        });
      });
    };
    M.openIconPicker = function openIconPicker(anchor, doc, fallback) {
      M.closePop();
      var current = M.shownIcon(doc);
      var q = '';
      var box = S.h('div', { class: 'dc-pop dc-iconpick', role: 'dialog', 'aria-label': 'Icône' });
      box._for = doc.id;
      var search = S.h('input', {
        class: 'dc-input',
        type: 'text',
        placeholder: 'Icône',
        'aria-label': 'Chercher une icône',
        spellcheck: 'false',
      });
      var colors = S.h('div', { class: 'dc-iconpick-colors' });
      var grid = S.h('div', { class: 'dc-iconpick-grid' });

      function choose(next) {
        M.applyIcon(doc, next);
        current = S.DM().normalizeIcon(doc.icon);
        paint();
      }

      function iconBtn(name, label, on, clear) {
        var b = S.h('button', {
          class: 'dc-iconpick-btn' + (on ? ' is-on' : ''),
          type: 'button',
          title: label,
          'aria-label': label,
          onclick: function () {
            choose({ i: clear ? '' : name, c: current && current.c });
          },
        }, [S.icon(name)]);
        if (current && current.c) b.style.color = current.c;
        return b;
      }

      function paint() {
        colors.textContent = '';
        grid.textContent = '';
        colors.appendChild(S.h('button', {
          class: 'dc-iconpick-color dc-iconpick-color--none' + (!(current && current.c) ? ' is-on' : ''),
          type: 'button',
          title: 'Couleur d’origine',
          'aria-label': 'Couleur d’origine',
          onclick: function () { choose({ i: current && current.i, c: '' }); },
        }));
        S.DM().COVER_COLORS.forEach(function (c) {
          colors.appendChild(S.h('button', {
            class: 'dc-iconpick-color' + (current && current.c === c.v ? ' is-on' : ''),
            type: 'button',
            title: c.label,
            'aria-label': c.label,
            style: 'background:' + c.v,
            onclick: function () { choose({ i: current && current.i, c: c.v }); },
          }));
        });
        if (!q) grid.appendChild(iconBtn(fallback, 'Par défaut', !(current && current.i), true));
        S.DM().searchDocIcons(q).forEach(function (x) {
          if (!q && x.i === fallback) return;
          grid.appendChild(iconBtn(x.i, x.i, !!(current && current.i === x.i), false));
        });
      }

      search.addEventListener('input', function () { q = search.value; paint(); });
      search.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); M.closePop(); }
      });
      box.appendChild(search);
      box.appendChild(colors);
      box.appendChild(grid);
      M.pop = box;
      M.placePop(M.pop, anchor.getBoundingClientRect());
      paint();
      search.focus();
    };
    M.folderRow = function folderRow(r) {
      var f = r.folder;
      var on = !!(M.state.current && f.doc && M.state.current.id === f.doc);
      var more = S.h('button', {
        class: 'dc-item-more',
        title: 'Actions',
        'aria-label': 'Actions du dossier',
        onclick: function (e) {
          e.stopPropagation();
          M.openFolderMenu(more, f.id);
        },
      }, [S.icon('dots')]);
      var chev = r.childCount
        ? S.icon(r.open ? 'chevron-down' : 'chevron-right', 'dc-folder-chev dc-doc-chev')
        : S.h('span', { class: 'dc-chev-gap' });
      if (r.childCount) {
        chev.addEventListener('click', function (e) {
          e.stopPropagation();
          M.setFolderOpen(f.id, !M.state.openFolders[f.id]);
          M.paintList();
        });
      }
      var when = r.doc
        ? S.DM().relativeTime(r.doc.updatedAt) + (/^size/.test(M.state.sort) ? ' · ' + S.sizeLabel(r.doc.size) : '')
        : String(r.count);
      var row = S.h('div', {
        class: 'sp-row dc-item dc-folder' + (on ? ' is-on' : '') + (r.archived ? ' is-archived' : ''),
        style: 'padding-left:' + (8 + r.depth * 16) + 'px',
        role: 'treeitem',
        'aria-label': (r.doc && r.doc.title) || f.name,
        'aria-expanded': r.childCount ? (r.open ? 'true' : 'false') : null,
        'aria-selected': on ? 'true' : 'false',
        tabindex: '0',
        'data-folder': f.id,
        onclick: function () { M.openFolder(f.id); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            M.openFolder(f.id);
          }
        },
        oncontextmenu: function (e) {
          e.preventDefault();
          M.openFolderMenu(more, f.id);
        },
      }, [
        chev,
        M.itemIcon(r.doc, r.open ? 'folder-open' : 'folder', function () { M.openFolder(f.id); }),
        S.h('span', { class: 'dc-item-main' }, [
          S.h('span', { class: 'dc-item-title', text: (r.doc && r.doc.title) || f.name }),
          S.h('span', { class: 'dc-item-time', text: when }),
        ]),
        more,
      ]);
      M.wireDrag(row, 'folder', f.id, f.id);
      return row;
    };
    M.readDrag = function readDrag() {
      return M.drag;
    };
    M.clearDropMarks = function clearDropMarks() {
      Array.prototype.forEach.call(M.els.sideList.querySelectorAll('.is-drop, .is-drop-before, .is-drop-after'), function (n) {
        n.classList.remove('is-drop', 'is-drop-before', 'is-drop-after');
      });
      M.els.sideList.classList.remove('is-drop-root');
    };
    M.dropInto = function dropInto(e, folderId) {
      var p = M.readDrag();
      M.drag = null;
      M.clearDropMarks();
      if (!p) return;
      e.preventDefault();
      e.stopPropagation();
      if (p.kind === 'folder') {
        if (folderId !== p.id && (S.DM().folderById(M.state.idx, p.id) || {}).parent !== (folderId || null)) M.moveFolder(p.id, folderId);
      } else if ((M.state.idx.docs[p.id] || '') !== folderId) {
        M.moveDocToFolder(p.id, folderId);
      }
    };
    M.wireDrag = function wireDrag(row, kind, id, dropFolder) {
      row.setAttribute('draggable', 'true');
      row.addEventListener('dragstart', function (e) {
        M.closePop();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id); // Firefox only starts a drag when some data is set
        M.drag = { kind: kind, id: id };
      });
      row.addEventListener('dragend', function () {
        M.drag = null;
        M.clearDropMarks();
      });
      function nestable() {
        return kind === 'doc' && M.drag && M.drag.kind === 'doc' && M.drag.id !== id && !S.DM().isDocInside(M.state.idx, M.drag.id, id);
      }
      // top / bottom edge of a document row = place the dragged document beside it (same parent), middle = nest inside
      function edgeZone(e) {
        if (!nestable()) return '';
        var r = row.getBoundingClientRect();
        var y = (e.clientY - r.top) / (r.height || 1);
        return y < 0.28 ? 'before' : y > 0.72 ? 'after' : '';
      }
      row.addEventListener('dragover', function (e) {
        if (!M.drag) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        M.clearDropMarks();
        var zone = edgeZone(e);
        if (zone) {
          row.classList.add('is-drop-' + zone);
          return;
        }
        if (nestable()) {
          row.classList.add('is-drop');
          return;
        }
        var target = dropFolder ? M.els.sideList.querySelector('[data-folder="' + dropFolder + '"]') : null;
        if (target) target.classList.add('is-drop');
        else M.els.sideList.classList.add('is-drop-root');
      });
      row.addEventListener('drop', function (e) {
        if (edgeZone(e)) {
          var moved = M.drag.id;
          M.drag = null;
          M.clearDropMarks();
          e.preventDefault();
          e.stopPropagation();
          M.placeBeside(moved, id);
          return;
        }
        if (nestable()) {
          var src = M.drag.id;
          M.drag = null;
          M.clearDropMarks();
          e.preventDefault();
          e.stopPropagation();
          M.askNest(src, id);
          return;
        }
        M.dropInto(e, dropFolder);
      });
    };
    M.editFolders = function editFolders(mutate, okMsg) {
      return S.DT().updateFolderIndex(M.t, mutate).then(
        function (idx) {
          M.state.idx = idx;
          M.paintList();
          if (okMsg) M.toast(okMsg, 'ok');
          return true;
        },
        function (err) {
          M.failure(err);
          return false;
        }
      );
    };
    M.newFolder = function newFolder(parentId) {
      M.state.filter = '';
      M.els.search.value = '';
      if (parentId) M.setFolderOpen(parentId, true);
      M.state.pendingFolder = { parent: parentId || '', value: '' };
      M.paintList();
    };
    M.newFolderRow = function newFolderRow(depth) {
      var pend = M.state.pendingFolder;
      var finished = false;
      var input = S.h('input', {
        class: 'dc-folder-input',
        type: 'text',
        maxlength: String(S.DM().MAX_FOLDER_NAME),
        placeholder: 'Nom du dossier',
        'aria-label': 'Nom du nouveau dossier',
        value: pend.value,
      });
      function finish(commit) {
        if (finished) return;
        finished = true;
        var name = S.DM().cleanFolderName(input.value);
        M.state.pendingFolder = null;
        if (!commit || !name) {
          M.paintList();
          return;
        }
        var parentId = pend.parent;
        M.setBusy('Création du dossier…');
        S.DT().createDoc(M.t, name, '').then(function (doc) {
          M.setBusy('');
          M.state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt || '', size: 0, body: '' });
          M.sortDocs();
          return M.editFolders(function (idx) {
            var parent = parentId && S.DM().folderById(idx, parentId) ? parentId : null;
            idx.folders.push({
              id: S.DM().newFolderId(),
              name: S.DM().cleanFolderName(doc.title) || name,
              parent: parent,
              doc: doc.id,
            });
          }).then(function () {
            return M.openDoc(doc.id, { skipSave: true });
          }).then(function () {
            if (M.editor) M.editor.focus();
          });
        }, function (err) {
          M.setBusy('');
          M.failure(err);
          M.paintList();
        });
      }
      input.addEventListener('input', function () { pend.value = input.value; });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      });
      input.addEventListener('blur', function () { finish(true); });
      var row = S.h('div', { class: 'dc-item dc-folder dc-folder-new', style: 'padding-left:' + (8 + depth * 16) + 'px' }, [
        S.h('span', { class: 'dc-chev-gap' }),
        S.icon('folder', 'dc-item-icon'),
        input,
      ]);
      setTimeout(function () {
        if (finished || !input.isConnected) return;
        input.focus();
        input.select();
      }, 0);
      return row;
    };
    M.renameFolder = function renameFolder(id) {
      var f = S.DM().folderById(M.state.idx, id);
      if (!f) return;
      M.dialog({ title: 'Renommer le dossier', text: S.DM().folderPath(M.state.idx, id), input: M.folderLabel(f), ok: 'Renommer' }).then(function (name) {
        name = typeof name === 'string' ? S.DM().cleanFolderName(name) : '';
        if (!name || name === M.folderLabel(f)) return;
        var renamed = f.doc
          ? S.DT().renameDoc(M.t, f.doc, name).then(function (r) {
            M.touchListItem(f.doc, { title: r.title });
            if (M.state.current && M.state.current.id === f.doc) {
              M.state.current.title = r.title;
              M.savedTitle = r.title;
              M.els.title.value = r.title === S.DM().UNTITLED ? '' : r.title;
              M.fitTitle();
            }
            return r.title;
          })
          : Promise.resolve(name);
        renamed.then(function (title) {
          M.editFolders(function (idx) {
            var x = S.DM().folderById(idx, id);
            if (x) x.name = S.DM().cleanFolderName(title) || name;
          });
        }, M.failure);
      });
    };
    M.archiveGlyph = function archiveGlyph(kind, gone) {
      return S.h('span', { class: 'dc-arch-glyph dc-arch-glyph--' + kind + (gone ? ' is-gone' : ''), 'aria-hidden': 'true' });
    };
    M.archiveScene = function archiveScene(after) {
      var gone = after === 'all';
      return S.h('span', { class: 'dc-arch-scene', 'aria-hidden': 'true' }, [
        S.h('span', { class: 'dc-arch-pack' }, [
          M.archiveGlyph('folder', true),
          S.h('span', { class: 'dc-arch-pages' }, [
            M.archiveGlyph('doc', gone),
            M.archiveGlyph('doc', gone),
          ]),
        ]),
      ]);
    };
    M.deleteFolder = function deleteFolder(id) {
      var f = S.DM().folderById(M.state.idx, id);
      if (!f) return;
      M.dialog({
        title: 'Archiver « ' + M.folderLabel(f) + ' »',
        picks: [
          { value: 'alt', label: 'Le contenu reste', scene: M.archiveScene('keep') },
          { value: true, label: 'Tout est archivé', scene: M.archiveScene('all') },
        ],
      }).then(function (answer) {
        if (!answer) return;
        M.editFolders(function (idx) { S.DM().archiveFolderIn(idx, id, answer === true); }, 'Dossier archivé.').then(function () {
          if (M.state.current && M.state.idx.archived && M.state.idx.archived[M.state.current.id] && !M.state.showArchived) M.leaveArchivedDoc();
        });
      });
    };
    M.moveFolder = function moveFolder(id, parentId) {
      M.editFolders(function (idx) {
        var x = S.DM().folderById(idx, id);
        if (!x || (parentId && !S.DM().folderById(idx, parentId)) || S.DM().isInsideFolder(idx, id, parentId)) return;
        x.parent = parentId || null;
      });
    };
    M.moveDocToFolder = function moveDocToFolder(docId, folderId) {
      M.editFolders(function (idx) {
        if (folderId && S.DM().folderById(idx, folderId)) idx.docs[docId] = folderId;
        else delete idx.docs[docId];
        if (idx.parents) delete idx.parents[docId];
      }).then(function (ok) {
        if (ok && folderId) M.setFolderOpen(folderId, true);
        if (ok) M.paintList();
      });
    };
    M.docTitle = function docTitle(id) {
      var d = M.state.docs.filter(function (x) { return x.id === id; })[0];
      return d ? d.title : '';
    };
    M.askNest = function askNest(docId, parentId) {
      M.nestDoc(docId, parentId);
    };
    M.placeBeside = function placeBeside(docId, targetId) {
      M.editFolders(function (idx) {
        if (docId === targetId || S.DM().isDocInside(idx, docId, targetId)) return;
        idx.parents = idx.parents || {};
        var parent = idx.parents[targetId];
        if (parent) {
          idx.parents[docId] = parent;
          delete idx.docs[docId];
        } else {
          delete idx.parents[docId];
          if (idx.docs[targetId]) idx.docs[docId] = idx.docs[targetId];
          else delete idx.docs[docId];
        }
      }).then(function (ok) {
        if (ok) M.paintList();
      });
    };
    M.nestDoc = function nestDoc(docId, parentId) {
      return M.editFolders(function (idx) {
        if (S.DM().isDocInside(idx, docId, parentId)) return;
        idx.parents = idx.parents || {};
        idx.parents[docId] = parentId;
        delete idx.docs[docId];
      }).then(function (ok) {
        if (!ok) return;
        var holder = S.DM().folderByDoc(M.state.idx, parentId);
        M.setFolderOpen(holder ? holder.id : 'doc:' + parentId, true);
        M.paintList();
        if (M.state.current && (M.state.current.id === docId || M.state.current.id === parentId)) M.paintProps();
      });
    };
    M.unnestDoc = function unnestDoc(docId) {
      M.editFolders(function (idx) {
        var p = idx.parents && idx.parents[docId];
        if (!p) return;
        var cur = p;
        var hops = 0;
        while (idx.parents[cur] && hops++ < 1000) cur = idx.parents[cur];
        delete idx.parents[docId];
        var holder = S.DM().folderByDoc(idx, cur);
        if (idx.docs[cur]) idx.docs[docId] = idx.docs[cur];
        else if (holder) idx.docs[docId] = holder.id;
      });
    };
    M.openFolderPicker = function openFolderPicker(anchor, title, current, excludeId, onPick) {
      M.closePop();
      var idx = M.state.idx;
      var items = [S.h('div', { class: 'dc-pop-sub', text: title })];
      function opt(label, id, depth) {
        items.push(S.h('button', {
          class: 'dc-menu-item' + (id === current ? ' is-on' : ''),
          type: 'button',
          style: 'padding-left:' + (10 + depth * 14) + 'px',
          onclick: function () {
            M.closePop();
            if (id !== current) onPick(id);
          },
        }, [S.icon(id ? 'folder' : 'home'), S.h('span', { text: label })]));
      }
      opt('Racine (aucun dossier)', '', 0);
      (function walk(pid, depth) {
        idx.folders
          .filter(function (f) { return (f.parent || '') === pid; })
          .sort(function (a, b) { return a.name.localeCompare(b.name); })
          .forEach(function (f) {
            if (excludeId && S.DM().isInsideFolder(idx, excludeId, f.id)) return;
            opt(M.folderLabel(f), f.id, depth + 1);
            walk(f.id, depth + 1);
          });
      })('', 0);
      M.pop = S.h('div', { class: 'dc-pop dc-menu', role: 'menu' }, items);
      M.placePop(M.pop, anchor.getBoundingClientRect());
    };
    M.openFolderMenu = function openFolderMenu(anchor, folderId) {
      M.closePop();
      function item(iconName, label, run, danger) {
        return S.h('button', {
          class: 'dc-menu-item' + (danger ? ' is-danger' : ''),
          type: 'button',
          onclick: function () {
            M.closePop();
            run();
          },
        }, [S.icon(iconName), S.h('span', { text: label })]);
      }
      var f = S.DM().folderById(M.state.idx, folderId);
      if (!f) return;
      M.pop = S.h('div', { class: 'dc-pop dc-menu', role: 'menu' }, [
        item('plus', 'Nouveau document ici', function () { M.newDoc(null, null, folderId); }),
        item('folder-plus', 'Nouveau sous-dossier', function () { M.newFolder(folderId); }),
        item('pencil', 'Renommer…', function () { M.renameFolder(folderId); }),
        item('folder-share', 'Déplacer vers…', function () {
          M.openFolderPicker(anchor, 'Déplacer le dossier vers', f.parent || '', folderId, function (to) { M.moveFolder(folderId, to); });
        }),
        S.h('div', { class: 'dc-menu-sep' }),
        f.archived
          ? item('archive-off', 'Restaurer', function () { M.editFolders(function (idx) { S.DM().restoreFolderIn(idx, folderId); }, 'Dossier restauré.'); })
          : item('archive', 'Archiver…', function () { M.deleteFolder(folderId); }, true),
      ]);
      M.placePop(M.pop, anchor.getBoundingClientRect());
    };
    M.touchListItem = function touchListItem(id, patch) {
      var d = M.state.docs.filter(function (x) { return x.id === id; })[0];
      var task = !d && (M.state.tasks || []).filter(function (x) { return x.id === id; })[0];
      var hit = d || task;
      if (!hit) return;
      Object.keys(patch).forEach(function (k) { hit[k] = patch[k]; });
      if (d) M.sortDocs();
      else M.state.tasks.sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0; });
      M.paintList();
    };
    M.closestIn = function closestIn(node, selector) {
      var el = node && node.nodeType === 3 ? node.parentNode : node;
      while (el && el !== M.editor) {
        if (el.nodeType === 1 && el.matches && el.matches(selector)) return el;
        el = el.parentNode;
      }
      return null;
    };
    M.selNode = function selNode() {
      var sel = global.getSelection();
      return sel && sel.rangeCount && M.editor && M.editor.contains(sel.anchorNode) ? sel.anchorNode : null;
    };
    M.saveSel = function saveSel() {
      var sel = global.getSelection();
      if (sel && sel.rangeCount && M.editor && M.editor.contains(sel.anchorNode)) M.lastRange = sel.getRangeAt(0).cloneRange();
    };
    M.restoreSel = function restoreSel() {
      if (!M.editor) return;
      var had = document.activeElement === M.editor;
      M.editor.focus({ preventScroll: true });
      var sel = global.getSelection();
      if (!had && M.lastRange) {
        sel.removeAllRanges();
        sel.addRange(M.lastRange);
      }
    };
    M.normalizeRoot = function normalizeRoot() {
      if (!M.editor) return;
      var sel = global.getSelection();
      var keep = sel && sel.rangeCount && M.editor.contains(sel.anchorNode)
        ? { an: sel.anchorNode, ao: sel.anchorOffset, fn: sel.focusNode, fo: sel.focusOffset }
        : null;
      var changed = false;
      var run = [];
      function flush() {
        if (!run.length) return;
        var p = document.createElement('p');
        M.editor.insertBefore(p, run[0]);
        run.forEach(function (n) { p.appendChild(n); });
        run = [];
        changed = true;
      }
      Array.prototype.slice.call(M.editor.childNodes).forEach(function (n) {
        var inline = n.nodeType === 3
          ? /[^\s]|\u00a0/.test(n.nodeValue)
          : n.nodeType === 1 && !/^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|PRE|HR|TABLE|FIGURE)$/.test(n.nodeName);
        if (inline) run.push(n);
        else flush();
      });
      flush();
      if (changed && keep) sel.setBaseAndExtent(keep.an, keep.ao, keep.fn, keep.fo);
    };
    M.textBeforeCaret = function textBeforeCaret() {
      var sel = global.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed || !M.editor || !M.editor.contains(sel.anchorNode)) return null;
      var block = M.closestIn(sel.anchorNode, S.BLOCK_SEL) || M.editor;
      var r = document.createRange();
      r.selectNodeContents(block);
      r.setEnd(sel.anchorNode, sel.anchorOffset);
      return r.toString();
    };
    M.selectBackward = function selectBackward(n) {
      var sel = global.getSelection();
      var node = sel.anchorNode;
      var off = sel.anchorOffset;
      if (!node || node.nodeType !== 3) return false;
      var walker = document.createTreeWalker(M.editor, NodeFilter.SHOW_TEXT);
      var range = document.createRange();
      range.setEnd(node, off);
      var remaining = n;
      while (remaining > 0 && node) {
        var take = Math.min(off, remaining);
        off -= take;
        remaining -= take;
        if (remaining === 0) {
          range.setStart(node, off);
          break;
        }
        walker.currentNode = node;
        var prev = walker.previousNode();
        if (!prev) {
          range.setStart(node, 0);
          break;
        }
        node = prev;
        off = prev.nodeValue.length;
      }
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    };
    M.isEmptyDoc = function isEmptyDoc() {
      var n = M.editor.firstChild;
      while (n) {
        if (n.nodeType === 3) {
          if (/\S/.test(String(n.nodeValue || '').replace(/\u200b/g, ''))) return false;
        } else if (n.nodeType === 1) {
          if (n.matches && n.matches('hr, figure, table, img, li, pre, blockquote, h1, h2, h3')) return false;
          if (n.querySelector && n.querySelector('.dc-mention, hr, figure, table, img, li, pre, blockquote, h1, h2, h3')) return false;
          if (/\S/.test(String(n.textContent || '').replace(/\u200b/g, ''))) return false;
        }
        n = n.nextSibling;
      }
      return true;
    };
    M.paintEmptyClass = function paintEmptyClass() {
      M.editor.classList.toggle('is-empty', M.isEmptyDoc());
    };
    M.blockType = function blockType() {
      var n = M.selNode();
      if (!n) return 'p';
      if (M.closestIn(n, 'PRE')) return 'codeblock';
      var hd = M.closestIn(n, 'H1,H2,H3,H4,H5,H6');
      if (hd) return 'h' + Math.min(3, parseInt(hd.tagName.charAt(1), 10));
      return 'p';
    };
    },
    run: function (M) {
    M.state = {
      docs: [],
      tasks: [], // open board cards shown as documents (kind: 'task')
      idx: S.DM().emptyIndex(), // folder tree (DocsModel "Folders")
      openFolders: S.loadOpenFolders(),
      sort: S.loadSort(),
      docsLoaded: false,
      filter: '',
      current: null, // {id,title,body,rev,updatedAt} as last loaded / saved
      authOk: true,
      sources: null,
      index: null,
      entityPack: null,
      saveState: 'saved', // saved | dirty | saving | offline | error | conflict
      saveMsg: '',
      conflict: null,
      busy: '',
      sideCollapsed: false,
      face: null,
      labelCatalog: null,
      driveUrl: '',
      propFor: null,
      propOpen: {},
    };
    M.editor = null;
    M.saving = false;
    M.saveTimer = null;
    M.lastMd = '';
    M.savedTitle = '';
    M.lastRange = null;
    M.sugg = null;
    M.pop = null;
    M.rich = null;
    M.selBar = null;
    M.blockHover = null;
    M.dragBlock = null;
    M.dropAt = null;
    M.gripDragged = false;
    M.blockHideTimer = null;
    M.freshTypeOff = null;
    M.metaTimer = null;
    M.lastRefreshAt = Date.now();
    M.toastTimer = null;
    M.loadToken = 0;
    M.faceToken = 0;
    M.root.innerHTML = '';
    M.els = {
      banner: S.h('div', { class: 'dc-banner', hidden: true }),
      side: S.h('aside', { class: 'dc-side', 'aria-label': 'Documents' }),
      sideList: S.h('div', { class: 'dc-list', role: 'listbox' }),
      search: S.h('input', { class: 'dc-search-input', type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher les documents', autocomplete: 'off' }),
      main: S.h('section', { class: 'dc-doc' }),
      head: S.h('div', { class: 'dc-head' }),
      headTitle: S.h('span', { class: 'dc-head-title' }),
      toolbar: S.h('div', { class: 'dc-toolbar', role: 'toolbar', 'aria-label': 'Mise en forme' }),
      conflict: S.h('div', { class: 'dc-conflict', hidden: true, role: 'alert' }),
      scroll: S.h('div', { class: 'dc-scroll' }),
      page: S.h('article', { class: 'dc-page' }),
      cover: S.h('div', { class: 'dc-cover', hidden: true }),
      coverAdd: S.h('div', { class: 'dc-cover-add' }),
      title: S.h('textarea', { class: 'dc-title', rows: '1', placeholder: 'Sans titre', maxlength: String(S.DM().MAX_TITLE), 'aria-label': 'Titre du document', spellcheck: 'true' }),
      parent: S.h('button', { class: 'dc-parent', type: 'button', hidden: true }),
      props: S.h('div', { class: 'dc-props' }),
      meta: S.h('div', { class: 'dc-meta' }),
      links: S.h('div', { class: 'dc-backlinks', hidden: true }),
      empty: S.h('div', { class: 'dc-empty', hidden: true }),
      outline: S.h('aside', { class: 'dc-outline', 'aria-label': 'Plan du document' }),
      suggest: S.h('div', { class: 'dc-suggest', hidden: true, role: 'listbox' }),
      toast: S.h('div', { class: 'dc-toast', hidden: true, role: 'status', 'aria-live': 'polite' }),
      status: S.h('span', { class: 'dc-status' }),
    };
    M.shell = S.h('div', { class: 'dc-root is-booting', tabindex: '-1' }, [
      M.els.banner,
      S.h('div', { class: 'dc-main' }, [M.els.side, M.els.main, M.els.outline]),
      M.els.suggest,
      M.els.toast,
    ]);
    M.root.appendChild(M.shell);
    M.wireChipPins();
    M.els.main.appendChild(M.els.head);
    M.els.main.appendChild(M.els.toolbar);
    M.els.main.appendChild(M.els.conflict);
    M.els.main.appendChild(M.els.scroll);
    M.els.main.appendChild(M.els.empty);
    M.els.boot = S.h('div', { class: 'dc-boot', 'aria-hidden': 'true' });
    M.els.boot.innerHTML = global.Skeleton.html('docs.main');
    M.els.main.appendChild(M.els.boot);
    M.els.scroll.appendChild(M.els.page);
    M.els.page.appendChild(M.els.cover);
    M.els.page.appendChild(M.els.coverAdd);
    M.els.page.appendChild(M.els.parent);
    M.els.page.appendChild(M.els.title);
    M.els.page.appendChild(M.els.props);
    M.els.page.appendChild(M.els.meta);
    M.els.page.appendChild(M.els.links);
    M.els.blockUi = S.h('div', { class: 'dc-block-ui', hidden: true }, [
      S.h('button', { class: 'dc-block-add', type: 'button', 'aria-label': 'Ajouter un bloc', title: 'Ajouter' }, [S.icon('plus')]),
      S.h('div', { class: 'dc-block-grip', role: 'button', tabindex: '0', draggable: 'true', 'aria-label': 'Déplacer ou transformer', title: 'Glisser ou transformer' }, [S.icon('grip-vertical')]),
    ]);
    M.els.dropLine = S.h('div', { class: 'dc-drop-line', hidden: true });
    M.els.page.appendChild(M.els.blockUi);
    M.els.page.appendChild(M.els.dropLine);
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, false);
    } catch (e) {
      /* old engines */
    }
    M.creatingFolder = {};
    M.iconTimers = {};
    M.drag = null;
    }
  });
})(typeof window !== 'undefined' ? window : this);
