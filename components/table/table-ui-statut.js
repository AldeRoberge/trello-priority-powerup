/**
 * table-ui: mount() part 1 of 2.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see table-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.TableUiParts = global.TableUiParts || {});
  var P = (global.TableUiPartsMountMount = global.TableUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.record = function record(e) { return M.HP ? M.HP.record(e) : e; };
    M.toggleEntry = function toggleEntry(e) { if (M.HP) M.HP.toggle(e); };
    M.setStatus = function setStatus(msg, kind, keepMs, action) {
      M.state.status = msg || '';
      M.state.statusKind = kind || '';
      M.state.statusAction = action || null;
      M.state.statusIcon = kind === 'busy' && /^Enregistrement/.test(msg || '') ? 'device-floppy' : 'refresh';
      M.paintStatus();
      clearTimeout(M.statusTimer);
      if (msg && kind !== 'error' && kind !== 'busy') {
        M.statusTimer = setTimeout(function () {
          M.setStatus('', '');
        }, keepMs || (action ? 8000 : 2500));
      }
    };
    M.paintStatus = function paintStatus() {
      var s = M.els.bar.querySelector('.tb-status');
      if (!s) return;
      s.className = 'tb-status' + (M.state.statusKind ? ' is-' + M.state.statusKind : '');
      s.innerHTML = '';
      if (M.state.statusKind === 'ok') s.appendChild(S.icon('check'));
      if (M.state.statusKind === 'busy') s.appendChild(S.icon(M.state.statusIcon || 'loader-2', 'tb-spin'));
      if (M.state.statusKind === 'error') s.appendChild(S.icon('alert-triangle'));
      if (M.state.statusKind === 'ok' && M.state.status) {
        s.appendChild(S.h('button', {
          class: 'tb-status-msg',
          title: 'Ouvrir l’historique',
          onclick: function () { M.openDrawer('history', null, true); },
        }, [document.createTextNode(M.state.status)]));
      } else {
        s.appendChild(document.createTextNode(M.state.status));
      }
      if (M.state.statusAction) {
        s.appendChild(
          S.h('button', {
            class: 'tb-link',
            onclick: function () {
              var a = M.state.statusAction;
              M.setStatus('', '');
              a.run();
            },
          }, [S.icon('arrow-back-up'), M.a_label(M.state.statusAction)])
        );
        s.appendChild(
          S.h('button', { class: 'tb-link', title: 'Ouvrir l’historique des modifications', onclick: function () { M.openDrawer('history', null, true); } }, [
            S.icon('history'),
            document.createTextNode(' Historique'),
          ])
        );
      }
    };
    M.a_label = function a_label(a) {
      return document.createTextNode(' ' + a.label);
    };
    M.fail = function fail(err) {
      var reason = err && (err.reason || err.message);
      if (reason === 'not-authorized' || reason === 'no-token' || reason === 'auth-failed') {
        M.state.authOk = false;
        M.renderBanner();
        M.setStatus('Autorisez Trello pour enregistrer les modifications.', 'error');
      } else {
        M.setStatus('Échec : ' + (reason || 'erreur inconnue'), 'error');
      }
    };
    M.schedulePush = function schedulePush() {
      if (!S.SH().isConnected(M.state.sheet)) return;
      clearTimeout(M.pushTimer);
      M.pushTimer = setTimeout(function () {
        M.setStatus('Synchronisation avec le Sheet…', 'busy');
        S.TT().pushToSheet(M.t, M.state.rows).then(function (res) {
          if (res && res.ok) M.setStatus('Google Sheet à jour', 'ok');
          else if (res && res.reason !== 'not-connected') M.setStatus('Sheet : ' + (res.detail || res.reason), 'error');
        });
      }, 800);
    };
    M.visibleRows = function visibleRows() {
      var rows = S.TM().filterRows(M.state.rows, M.state.filter);
      if (M.state.hideDone) rows = rows.filter(function (r) { return r.statutKey !== 'completed' && r.statutKey !== 'canceled'; });
      if (M.state.sorts.length) rows = S.TM().sortRowsMulti(rows, M.state.sorts, { lists: M.state.lists });
      return rows;
    };
    M.canReorder = function canReorder() {
      return !M.state.sorts.length && !M.state.filter;
    };
    M.findRow = function findRow(id) {
      return M.state.rows.filter(function (r) { return r.id === id; })[0] || null;
    };
    M.isEditable = function isEditable(key) {
      return S.TM().COLUMNS[key].editable && !(key === 'category' && !M.state.categoryAvailable);
    };
    M.listById = function listById(id) {
      return M.state.lists.filter(function (l) { return l.id === id; })[0] || null;
    };
    M.copyText = function copyText(text) {
      var done = function () { M.setStatus('Copié', 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
    };
    M.sortOf = function sortOf(key) {
      return M.state.sorts.filter(function (s) { return s.key === key; })[0] || null;
    };
    M.setSort = function setSort(key, dir, add) {
      if (!key) M.state.sorts = [];
      else if (!add) M.state.sorts = dir ? [{ key: key, dir: dir }] : [];
      else {
        var at = M.state.sorts.findIndex(function (s) { return s.key === key; });
        var rest = M.state.sorts.filter(function (s) { return s.key !== key; });
        if (dir) rest.splice(at === -1 ? rest.length : at, 0, { key: key, dir: dir });
        M.state.sorts = rest;
      }
      M.renderGrid();
      M.renderBar();
    };
    M.hideColumn = function hideColumn(key) {
      if (M.state.columns.length <= 1) return;
      M.applyColumns(M.state.columns.filter(function (k) { return k !== key; }));
    };
    M.renderBanner = function renderBanner() {
      M.els.banner.innerHTML = '';
      if (!M.state.authOk) {
        M.els.banner.hidden = false;
        M.els.banner.appendChild(S.icon('lock'));
        M.els.banner.appendChild(S.h('span', { text: 'Trello doit être autorisé pour modifier les cartes depuis la table.' }));
        M.els.banner.appendChild(
          S.btn('key', 'Autoriser Trello', {
            primary: true,
            onclick: function () {
              global.GanttTrello.ensureRestAuthorized(M.t).then(function (r) {
                M.state.authOk = !!r.ok;
                M.renderBanner();
              });
            },
          })
        );
      } else {
        M.els.banner.hidden = true;
      }
    };
    M.openSheet = function openSheet() {
      if (S.SH().isConnected(M.state.sheet) && M.state.sheet.sheetUrl) window.open(M.state.sheet.sheetUrl, '_blank', 'noopener');
      else M.openSheetSettings();
    };
    M.syncNow = function syncNow() {
      M.setStatus('Synchronisation avec le Sheet…', 'busy');
      S.TT()
        .pushToSheet(M.t, M.state.rows)
        .then(function () { return S.SH().syncNow(M.state.sheet); })
        .then(function (res) {
          if (res.ok) {
            M.setStatus('Synchronisé', 'ok');
            M.reload({ quiet: true });
          } else M.setStatus('Sheet : ' + (res.detail || res.reason), 'error');
        });
    };
    M.renderBar = function renderBar() {
      M.els.bar.innerHTML = '';
      var connected = S.SH().isConnected(M.state.sheet);
      var filter = S.h('input', {
        class: 'tb-filter tp-search-input',
        type: 'search',
        placeholder: 'Rechercher…',
        'aria-label': 'Rechercher',
        value: M.state.filter,
        oninput: function (e) {
          M.state.filter = e.target.value;
          M.renderGrid({ keepFocus: 'filter' });
        },
      });
      var kids = [
        S.h('label', { class: 'tb-search tp-search' }, [S.icon('search'), filter]),
        S.btn('refresh', null, { title: 'Actualiser', onclick: function () { M.reload(); } }),
        S.btn('columns-3', 'Colonnes', {
          onclick: function (e) {
            e.stopPropagation();
            M.state.menuOpen = !M.state.menuOpen;
            M.renderMenu();
          },
        }),
      ];
      var gm = M.groupMode();
      kids.push(S.btn(gm === 'lieu' ? 'map-pin' : gm === 'none' ? 'list' : 'stack-2', gm === 'none' ? 'Groupes' : 'Par ' + (gm === 'lieu' ? 'lieu' : 'projet'), {
        active: gm !== 'project',
        title: 'Grouper par…',
        onclick: function (e) {
          e.stopPropagation();
          var rect = e.currentTarget.getBoundingClientRect();
          S.MENU().show({ x: rect.left, y: rect.bottom + 4 }, M.groupItems());
        },
      }));
      if (M.state.sorts.length) {
        kids.push(S.btn(M.state.sorts[0].dir === 'asc' ? 'sort-ascending' : 'sort-descending', 'Tri : ' + M.state.sorts.map(function (s) {
          return S.TM().COLUMNS[s.key].header + (s.dir === 'asc' ? ' ↑' : ' ↓');
        }).join(', '), {
          title: 'Trié ' + M.state.sorts.map(function (s) { return S.TM().COLUMNS[s.key].header + ' ' + S.TM().sortLabels(s.key)[s.dir]; }).join(', puis ') + ' · cliquer pour revenir à l’ordre du tableau',
          onclick: function () { M.setSort(null); },
        }));
      }
      kids.push(S.h('span', { class: 'tb-status' }));
      kids.push(S.h('span', { class: 'tb-spacer' }));
      kids.push(S.h('span', { class: 'tb-count', 'aria-live': 'polite' }));
      var doneCount = M.state.rows.filter(function (r) { return r.statutKey === 'completed' || r.statutKey === 'canceled'; }).length;
      var hideBtn = S.btn(M.HD.icon(M.state.hideDone), null, {
        active: M.state.hideDone,
        title: M.HD.label(M.state.hideDone, doneCount) + ' · ' + M.HD.title(M.state.hideDone),
        onclick: function () { M.HD.set(!M.state.hideDone); },
      });
      if (M.state.hideDone && doneCount) hideBtn.appendChild(S.h('span', { class: 'tb-badge tb-badge--soft', text: String(Math.min(doneCount, 99)) }));
      kids.push(hideBtn);
      var histBtn = S.btn('history', 'Historique', { active: M.state.drawer === 'history', title: 'Tout ce qui a été modifié depuis ce tableau, avec annulation', onclick: function () { M.openDrawer('history'); } });
      histBtn.appendChild(S.h('span', { class: 'tb-badge tb-badge--soft', hidden: !(M.HP && M.HP.count()), text: String(Math.min(M.HP ? M.HP.count() : 0, 99)) }));
      kids.push(histBtn);
      if (connected) {
        var logBtn = S.btn('list-details', 'Logs', { title: 'Journal de la synchronisation', onclick: function () { M.openDrawer('logs'); } });
        logBtn.appendChild(S.h('span', { class: 'tb-badge', hidden: !M.state.alerts.length, text: '!' }));
        kids.push(logBtn);
        kids.push(S.btn('activity', 'Activités', { title: 'Qui a fait quoi, dans Trello et dans le Sheet', onclick: function () { M.openDrawer('activities'); } }));
      }
      if (connected) kids.push(S.btn('refresh-dot', 'Synchroniser', { title: 'Forcer une synchronisation Trello ⇄ Sheet', onclick: M.syncNow }));
      kids.push(
        S.btn(connected ? 'brand-google-drive' : 'plug-connected', null, {
          title: connected ? 'Afficher dans Google Sheet' : 'Connecter Google Sheets',
          primary: true,
          onclick: M.openSheet,
        })
      );
      kids.forEach(function (c) { M.els.bar.appendChild(c); });
      M.els.bar.appendChild(S.h('div', { class: 'tb-menu', hidden: !M.state.menuOpen, id: 'tbMenu' }));
      M.paintStatus();
      M.paintCount();
      M.renderMenu();
    };
    M.paintCount = function paintCount() {
      var c = M.els.bar.querySelector('.tb-count');
      if (!c) return;
      var total = M.state.rows.length;
      var shown = M.visibleRows().length;
      c.textContent = !total ? '' : (shown === total ? total : shown + ' / ' + total) + (total > 1 ? ' cartes' : ' carte');
    };
    M.renderMenu = function renderMenu() {
      var menu = M.els.bar.querySelector('#tbMenu');
      if (!menu) return;
      menu.hidden = !M.state.menuOpen;
      if (!M.state.menuOpen) return;
      menu.innerHTML = '';
      menu.onclick = function (e) { e.stopPropagation(); };
      menu.appendChild(S.h('div', { class: 'tbm-title', text: 'Colonnes (aussi celles du Google Sheet)' }));
      var all = Object.keys(S.TM().COLUMNS);
      var ordered = M.state.columns.concat(all.filter(function (k) { return M.state.columns.indexOf(k) === -1; }));
      ordered.forEach(function (key) {
        var on = M.state.columns.indexOf(key) !== -1;
        var idx = M.state.columns.indexOf(key);
        menu.appendChild(
          S.h('div', { class: 'tb-menu-row' }, [
            S.h('label', {}, [
              S.h('input', {
                type: 'checkbox',
                checked: on,
                onchange: function (e) {
                  var next = M.state.columns.slice();
                  if (e.target.checked) next.push(key);
                  else next = next.filter(function (k) { return k !== key; });
                  if (!next.length) return M.renderMenu();
                  M.applyColumns(next);
                },
              }),
              S.icon(S.TM().COLUMNS[key].icon, 'tb-col-icon'),
              S.h('span', { text: S.TM().COLUMNS[key].header }),
            ]),
            on
              ? S.h('span', { class: 'tb-menu-move' }, [
                  S.h('button', { title: 'Monter', disabled: idx === 0, onclick: function () { M.moveColumn(idx, -1); } }, [S.icon('arrow-up')]),
                  S.h('button', { title: 'Descendre', disabled: idx === M.state.columns.length - 1, onclick: function () { M.moveColumn(idx, 1); } }, [S.icon('arrow-down')]),
                ])
              : null,
          ])
        );
      });
      if (S.SH().isConnected(M.state.sheet)) {
        menu.appendChild(S.h('div', { class: 'tbm-sep' }));
        menu.appendChild(S.h('div', { class: 'tbm-title', text: 'Thème du Google Sheet' }));
        var themeSel = S.h('select', {
          class: 'tb-select',
          title: 'Apparence du Google Sheet',
          onchange: function (e) {
            var theme = e.target.value;
            M.setStatus('Thème du Sheet…');
            S.SH().setSheetTheme(M.state.sheet, theme).then(function (res) {
              if (res.ok) { M.state.sheetTheme = theme; M.setStatus(theme === 'dark' ? 'Sheet en mode sombre' : 'Sheet en mode clair', 'ok'); }
              else M.setStatus('Sheet : ' + (res.detail || res.reason), 'error');
            });
          },
        });
        [['light', 'Clair'], ['dark', 'Sombre (style Trello, Lexend)']].forEach(function (o) {
          themeSel.appendChild(S.h('option', { value: o[0], text: o[1], selected: o[0] === M.state.sheetTheme }));
        });
        menu.appendChild(S.h('div', { class: 'tb-menu-row' }, [themeSel]));
      }
    };
    M.moveColumn = function moveColumn(idx, delta) {
      var next = M.state.columns.slice();
      var to = idx + delta;
      if (to < 0 || to >= next.length) return;
      var tmp = next[idx];
      next[idx] = next[to];
      next[to] = tmp;
      M.applyColumns(next);
    };
    M.applyColumns = function applyColumns(next) {
      M.state.columns = next;
      M.renderGrid();
      M.renderMenu();
      S.TT()
        .saveColumns(M.t, next)
        .then(function () {
          M.state.sheet = Object.assign({}, M.state.sheet, { columns: next });
          if (S.SH().isConnected(M.state.sheet)) {
            M.setStatus('Colonnes du Sheet…');
            return S.SH().pushColumns(M.state.sheet, next).then(function (res) {
              if (res.ok) {
                M.setStatus('Colonnes appliquées au Sheet', 'ok');
                M.schedulePush();
              } else M.setStatus('Sheet : ' + (res.detail || res.reason), 'error');
            });
          }
        });
    };
    M.openSheetSettings = function openSheetSettings() {
      M.t.modal({
        title: 'Google Sheets ↔ Trello',
        url: global.PriorityTrello.pageUrl('./google-sheets-sync.html'),
        fullscreen: false,
        height: 560,
        accentColor: '#22272B',
        callback: function () {
          S.SH().getSettings(M.t).then(function (s) {
            M.state.sheet = s;
            M.renderBar();
            M.schedulePush();
          });
        },
      });
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
    M.heatStyle = function heatStyle(key, row) {
      var spec = S.TM().COLUMNS[key];
      var v = row[key];
      if (!spec.heat || typeof v !== 'number') return null;
      var frac = Math.max(0, Math.min(1, v / spec.heat));
      // Blocked cards read red, like their pause icon and status pill; everything else is the green priority scale.
      var rgb = row.blocked || row.statutKey === 'blocked' ? '227,73,53' : '52,187,140';
      return 'background:rgba(' + rgb + ',' + (0.08 + frac * 0.5).toFixed(2) + ')';
    };
    M.colWidth = function colWidth(key) {
      var w = M.state.widths[key];
      var base = typeof w === 'number' && w >= M.MIN_COL ? w : S.TM().COLUMNS[key].width;
      return M.isPhone() && key === 'name' ? Math.min(base, Math.max(150, (window.innerWidth || 390) - 44 - 96)) : base;
    };
    M.saveWidths = function saveWidths() {
      S.TT().saveWidths(M.t, M.state.widths).catch(M.fail);
    };
    M.resizer = function resizer(key) {
      return S.h('span', {
        class: 'tb-resizer',
        title: 'Glisser pour redimensionner · double-clic pour réinitialiser',
        onclick: function (e) { e.stopPropagation(); },
        // The header is draggable (column reorder): that native drag would swallow the resize gesture.
        onmouseenter: function (e) { e.currentTarget.parentNode.draggable = false; },
        onmouseleave: function (e) { if (!document.body.classList.contains('tb-resizing')) e.currentTarget.parentNode.draggable = true; },
        onmousedown: function (e) { e.preventDefault(); e.stopPropagation(); },
        ondragstart: function (e) { e.preventDefault(); e.stopPropagation(); },
        ondblclick: function (e) {
          e.stopPropagation();
          delete M.state.widths[key];
          M.renderGrid();
          M.saveWidths();
        },
        onpointerdown: function (e) {
          e.preventDefault();
          e.stopPropagation();
          var th = e.currentTarget.parentNode;
          var table = th.closest('table');
          var startX = e.clientX;
          var startW = th.offsetWidth;
          var startTable = table.offsetWidth;
          document.body.classList.add('tb-resizing');
          function move(ev) {
            var w = Math.max(M.MIN_COL, Math.round(startW + ev.clientX - startX));
            th.style.width = th.style.minWidth = w + 'px';
            table.style.width = startTable + (w - startW) + 'px';
            M.state.widths[key] = w;
          }
          function up() {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            document.body.classList.remove('tb-resizing');
            th.draggable = true;
            M.saveWidths();
          }
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
        },
      });
    };
    M.isPhone = function isPhone() {
      return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
    };
    M.shownColumns = function shownColumns() {
      var cols = M.state.columns;
      if (!M.isPhone()) return cols;
      // Phone: the title, then what a glance needs (status, progress, priority, due), then the rest in the user's order.
      var first = ['name', 'statut', 'progress', 'priority', 'due'].filter(function (k) { return cols.indexOf(k) >= 0; });
      return first.concat(cols.filter(function (k) { return first.indexOf(k) < 0; }));
    };
    M.renderGrid = function renderGrid(opts) {
      opts = opts || {};
      if (global.Isolation) global.Isolation.adopt(M.t, M.state.rows);
      var scrollTop = M.els.wrap.scrollTop;
      var scrollLeft = M.els.wrap.scrollLeft;
      if (opts.keepFocus !== 'filter') M.renderBar();
      else M.paintCount();
      var rows = M.visibleRows();
      var table = S.h('table', { class: 'tb-grid' });
      var head = S.h('tr', {}, [S.h('th', { class: 'tb-corner' })]);
      var tableWidth = M.isPhone() ? 44 : 96;
      M.shownColumns().forEach(function (key) {
        var spec = S.TM().COLUMNS[key];
        var width = M.colWidth(key);
        tableWidth += width;
        var cur = M.sortOf(key);
        var active = !!cur;
        var sortIcon = active ? (cur.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrows-sort';
        // Click: sort by this column alone. Shift/Ctrl-click: add it as another level (or cycle its direction).
        var toggleSort = function (e) {
          var add = !!(e && (e.shiftKey || e.ctrlKey || e.metaKey));
          var next = !cur ? 'asc' : cur.dir === 'asc' ? 'desc' : null;
          if (!add && cur && M.state.sorts.length > 1) next = 'asc'; // collapse a multi-sort onto this column
          M.setSort(key, next, add);
        };
        head.appendChild(
          S.h('th', {
            class: 'tb-th' + (active ? ' is-sorted' : ''),
            'data-key': key,
            style: 'min-width:' + width + 'px;width:' + width + 'px',
            title: 'Cliquer pour trier · Maj+clic pour ajouter un niveau de tri',
            tabindex: '0',
            draggable: 'true',
            'aria-sort': active ? (cur.dir === 'asc' ? 'ascending' : 'descending') : null,
            onclick: toggleSort,
            ondragstart: function (e) {
              M.state.dragCol = key;
              e.dataTransfer.effectAllowed = 'move';
              try { e.dataTransfer.setData('text/plain', key); } catch (err) { /* ignore */ }
              e.currentTarget.classList.add('is-col-dragging');
            },
            ondragend: function () {
              M.state.dragCol = null;
              head.querySelectorAll('.is-col-dragging,.is-col-drop-before,.is-col-drop-after').forEach(function (el) {
                el.classList.remove('is-col-dragging', 'is-col-drop-before', 'is-col-drop-after');
              });
            },
            ondragover: function (e) {
              if (!M.state.dragCol || M.state.dragCol === key) return;
              e.preventDefault();
              var th = e.currentTarget;
              var before = e.offsetX < th.offsetWidth / 2;
              th.classList.toggle('is-col-drop-before', before);
              th.classList.toggle('is-col-drop-after', !before);
            },
            ondragleave: function (e) {
              e.currentTarget.classList.remove('is-col-drop-before', 'is-col-drop-after');
            },
            ondrop: function (e) {
              if (!M.state.dragCol || M.state.dragCol === key) return;
              e.preventDefault();
              var before = e.currentTarget.classList.contains('is-col-drop-before');
              var from = M.state.dragCol;
              M.state.dragCol = null;
              var next = M.state.columns.filter(function (k) { return k !== from; });
              var at = next.indexOf(key) + (before ? 0 : 1);
              next.splice(at, 0, from);
              if (next.join() !== M.state.columns.join()) M.applyColumns(next);
              else M.renderGrid();
            },
            onkeydown: function (e) {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              e.stopPropagation(); // the grid's own Enter handler is for the selected cell
              toggleSort(e);
            },
          }, [S.icon(spec.icon, 'tb-th-icon'), S.h('span', { class: 'tb-th-text', text: spec.header }), S.icon(sortIcon, 'tb-sort'), M.state.sorts.length > 1 && active ? S.h('span', { class: 'tb-sort-n', text: String(M.state.sorts.indexOf(cur) + 1) }) : null, M.resizer(key)])
        );
      });
      table.style.width = tableWidth + 'px';
      table.appendChild(S.h('thead', {}, [head]));

      var body = S.h('tbody');
      var rowNo = 0;
      function renderRowTr(row) {
        var i = rowNo++;
        var tr = S.h('tr', { 'data-id': row.id, 'data-iso-card': row.id });
        tr.addEventListener('dragover', function (e) {
          if (!M.state.dragId) return;
          var moved = M.findRow(M.state.dragId);
          if (!moved || moved.id === row.id) return;
          var otherProject = M.groupMode() === 'project' && (moved.projectId || '') !== (row.projectId || '');
          if (!M.canReorder() && !otherProject) return;
          e.preventDefault();
          if (M.canReorder()) {
            tr.classList.remove('is-drop-on');
            tr.classList.toggle('is-drop-before', e.offsetY < tr.offsetHeight / 2);
            tr.classList.toggle('is-drop-after', e.offsetY >= tr.offsetHeight / 2);
          } else {
            tr.classList.add('is-drop-on');
            tr.classList.remove('is-drop-before', 'is-drop-after');
          }
        });
        tr.addEventListener('dragleave', function (e) {
          if (e.relatedTarget && tr.contains(e.relatedTarget)) return;
          tr.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-on');
        });
        tr.addEventListener('drop', function (e) {
          if (!M.state.dragId) return;
          e.preventDefault();
          M.dropRow(M.state.dragId, row, e.offsetY >= tr.offsetHeight / 2);
        });

        tr.appendChild(
          S.h('td', { class: 'tb-num', 'data-row': row.id }, [
            S.h('span', {
              class: 'tb-handle' + (M.canReorder() ? '' : ' is-off'),
              draggable: 'true',
              title: M.canReorder() ? 'Glisser pour réordonner ou changer de projet' : 'Glisser vers un projet',
              ondragstart: function (e) {
                M.state.dragId = row.id;
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', row.id); } catch (err) { /* ignore */ }
              },
              ondragend: function () {
                M.state.dragId = null;
                M.renderGrid();
              },
            }, [S.icon('grip-vertical')]),
            S.h('span', { class: 'tb-rownum', text: String(i + 1) }),
            S.h('button', {
              class: 'tb-rowbtn',
              title: 'Ouvrir la carte',
              onclick: function () { M.openCard(row); },
            }, [S.icon('arrow-up-right')]),
            S.h('button', {
              class: 'tb-rowbtn tb-rowbtn--danger',
              title: 'Archiver la carte',
              onclick: function () { M.archiveRow(row); },
            }, [S.icon('archive')]),
          ])
        );
        M.shownColumns().forEach(function (key) { tr.appendChild(M.renderCell(row, key)); });
        body.appendChild(tr);
        if (M.state.expanded[row.id]) M.renderSubRows(row, body);
      }
      var sections = S.TM().groupRows(rows, M.groupMode(), M.foldedSections(), M.state.filter ? null : M.projectCatalog());
      if (!sections) rows.forEach(renderRowTr);
      else sections.forEach(function (g) {
        body.appendChild(M.sectionRow(g));
        if (g.open) g.rows.forEach(renderRowTr);
      });

      if (!rows.length && M.state.filter) {
        body.appendChild(
          S.h('tr', { class: 'tb-empty-row' }, [
            S.h('td', { colspan: String(M.state.columns.length + 1) }, [
              'Aucune carte ne correspond à « ' + M.state.filter + ' ». ',
              S.h('button', {
                class: 'tb-empty-clear',
                type: 'button',
                onclick: function () { M.state.filter = ''; M.renderBar(); M.renderGrid(); },
              }, ['Effacer le filtre']),
            ]),
          ])
        );
      }
      var addInput = global.AddRow.input({
        id: 'tbAdd',
        className: 'tb-add',
        onSubmit: function (name, input) {
          if (!M.state.lists.length) return;
          M.createIn(M.newCardList(), name, input);
        },
      });
      body.appendChild(
        S.h('tr', { class: 'tb-add-row ar-row' }, [
          S.h('td', { class: 'tb-num' }, [S.icon('plus', 'ar-plus')]),
          S.h('td', { colspan: String(M.state.columns.length) }, [addInput]),
        ])
      );
      if (global.InsertGap) {
        global.InsertGap.watch(body, {
          item: 'tr[data-id]',
          tail: '.tb-add-row',
          placeholder: 'Titre…',
          enabled: function () { return M.canReorder(); },
          wrap: function (input) {
            var tr = document.createElement('tr');
            tr.className = 'ig-compose';
            var td0 = document.createElement('td');
            td0.className = 'tb-num';
            var td1 = document.createElement('td');
            td1.colSpan = String(M.state.columns.length);
            td1.appendChild(input);
            tr.appendChild(td0);
            tr.appendChild(td1);
            return tr;
          },
          onCreate: function (title, info) {
            var above = info.above && M.findRow(info.above.getAttribute('data-id'));
            var below = info.below && M.findRow(info.below.getAttribute('data-id'));
            var list = (above && M.listById(above.listId)) || M.newCardList();
            if (!list) return Promise.resolve();
            return M.createIn(list, title, null, { pos: above ? M.posUnder(above, below) : 'bottom' });
          },
        });
      }
      table.appendChild(body);
      M.els.wrap.innerHTML = '';
      M.els.wrap.appendChild(table);
      M.els.wrap.scrollTop = scrollTop;
      M.els.wrap.scrollLeft = scrollLeft;
      var ae = document.activeElement;
      if (!M.state.editing && (!ae || ae === document.body)) M.shell.focus({ preventScroll: true });
    };
    M.newCardList = function newCardList() {
      var lists = M.state.lists || [];
      function by(cat) { return lists.filter(function (l) { return l.category === cat; })[0]; }
      return by('unstarted') || by('backlog') || by('triage') || lists.filter(function (l) {
        return l.category !== 'blocked' && l.category !== 'completed' && l.category !== 'canceled';
      })[0] || lists[0];
    };
    M.posUnder = function posUnder(above, below) {
      var siblings = M.state.rows.filter(function (r) { return r.listId === above.listId; }).sort(function (a, b) {
        return (a.pos || 0) - (b.pos || 0);
      });
      var index = siblings.length;
      if (below && below.listId === above.listId) {
        var bi = siblings.findIndex(function (r) { return r.id === below.id; });
        if (bi >= 0) index = bi;
      } else {
        var ai = siblings.findIndex(function (r) { return r.id === above.id; });
        if (ai >= 0) index = ai + 1;
      }
      return S.TM().dropPos(siblings, index);
    };
    M.createIn = function createIn(list, typed, input, opts) {
      if (input) input.disabled = true;
      var QP = global.QuickParse;
      var q = QP && !(opts && opts.rename) ? QP.parse(typed) : { name: typed, dueDate: '' };
      var name = q.name;
      S.TT()
        .createRow(M.t, name, list.id, opts && opts.pos)
        .then(function (res) {
          var cardId = res && res.cardId;
          if (cardId && q.dueDate && global.GanttTrello) {
            return global.GanttTrello.saveCardDates(M.t, cardId, { dueDate: q.dueDate }).then(function () { return res; }, function () { return res; });
          }
          return res;
        })
        .then(function (res) {
          var cardId = res && res.cardId;
          // Trello's client-side card cache can lag right after a REST create, so the new card may be
          // missing from the first reload: retry a few times before giving up.
          function loaded() { return !cardId || M.state.rows.some(function (r) { return r.id === cardId; }); }
          function reloadUntilPresent(attempt) {
            return M.reload({ quiet: true }).then(function () {
              if (loaded() || attempt >= 4) return;
              return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () {
                return reloadUntilPresent(attempt + 1);
              });
            });
          }
          return reloadUntilPresent(0).then(function () {
            var hidden = cardId && !M.visibleRows().some(function (r) { return r.id === cardId; });
            if (cardId) M.record({ type: 'create', targetId: cardId, title: name, after: list.name });
            M.setStatus('Carte créée dans « ' + list.name + ' »' + (hidden ? ' (masquée par le filtre)' : ''), 'ok', hidden ? 5000 : 0);
            if (opts && opts.rename && cardId && !hidden) M.beginEdit(cardId, 'name');
            else if (input) {
              var next = document.getElementById('tbAdd');
              if (next) next.focus({ preventScroll: true });
            }
          });
        }, function (err) {
          if (input) input.disabled = false;
          M.fail(err);
        });
    };
    M.pickStatut = function pickStatut(row, anchor, e) {
      if (!global.LinearPick || M.state.editing) return;
      if (e) e.stopPropagation();
      global.LinearPick.open({
        anchor: anchor,
        placeholder: 'Changer le statut…',
        current: row.listId,
        items: M.state.lists.map(function (l) { return { id: l.id, label: l.name, icon: S.TM().statutIcon(l.category || '_none'), color: l.color }; }),
        onPick: function (it) { M.commitEdit(row, 'statut', it.id); },
      });
    };
    M.statutPill = function statutPill(row) {
      var list = M.listById(row.listId);
      var color = row.statutColor || (list && list.color) || '#626f86';
      var pill = S.h('span', { class: 'tb-pill', style: '--pill:' + color, title: 'Changer le statut (S)', onclick: function (e) { M.pickStatut(row, e.currentTarget, e); } }, [
        S.icon(S.TM().statutIcon(row.statutKey || (list && list.category) || '_none')),
        S.h('span', { text: row.statut || '—' }),
      ]);
      return pill;
    };
    M.todayIso = function todayIso() {
      var d = new Date();
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    };
    M.progressRing = function progressRing(p) {
      var NS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 20 20');
      svg.setAttribute('class', 'tb-prog-ring');
      svg.innerHTML =
        '<circle class="tb-ring-track" cx="10" cy="10" r="7" fill="none" stroke-width="2"/>' +
        '<circle class="tb-ring-arc" cx="10" cy="10" r="7" fill="none" stroke-width="2" stroke-linecap="round" transform="rotate(-90 10 10)" stroke-dasharray="' + M.RING_C.toFixed(2) + '"/>' +
        '<circle class="tb-ring-disc" cx="10" cy="10" r="9.5"/>' +
        '<path class="tb-ring-check" d="M6 10.3l2.6 2.6L14 7.5" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      M.setRing(svg, p);
      return svg;
    };
    M.setRing = function setRing(svg, p) {
      var arc = svg.querySelector('.tb-ring-arc');
      if (arc) arc.setAttribute('stroke-dashoffset', (M.RING_C * (1 - p / 100)).toFixed(2));
    };
    M.richValue = function richValue(row, key) {
      if (key === 'progress' && typeof row.progress === 'number') {
        var p = Math.max(0, Math.min(100, row.progress));
        var ring = row.blocked && global.ProgressRing ? global.ProgressRing.create(p, true) : M.progressRing(p);
        if (row.blocked && global.ProgressRing) {
          ring.classList.add('tb-prog-ring');
          ring.setAttribute('aria-label', 'Bloqué — cliquer pour débloquer');
          ring.appendChild(Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'title'), { textContent: 'Bloqué — cliquer pour débloquer' }));
        }
        return S.h('span', { class: 'tb-prog' + (p >= 100 ? ' is-done' : '') }, [
          ring,
          S.h('span', { class: 'tb-prog-bar' }, [S.h('i', { style: 'width:' + p + '%' })]),
          S.h('span', { class: 'tb-prog-num', text: p + '%' }),
        ]);
      }
      if (key === 'urgency' && row.urgency) {
        var tone = M.URGENCY_TONE[row.urgency];
        return S.h('span', { class: 'tb-chip tb-chip--u' + (tone == null ? 0 : tone) }, [S.icon('flame'), S.h('span', { text: row.urgency })]);
      }
      if (key === 'priority' && typeof row.priority === 'number') {
        return S.h('span', { class: 'tb-num-strong', text: S.TM().formatPriority(row.priority) });
      }
      if (key === 'due' && row.due) {
        var overdue = /^\d{4}-\d{2}-\d{2}/.test(row.due) && row.due.slice(0, 10) < M.todayIso() && row.statutKey !== 'completed' && row.statutKey !== 'canceled';
        return S.h('span', { class: 'tb-chip tb-chip--due' + (overdue ? ' is-overdue' : ''), title: overdue ? 'En retard · ' + row.due : row.due }, [S.icon(overdue ? 'calendar-exclamation' : 'calendar-event'), S.h('span', { text: S.TM().dueLabel(row.due, overdue, M.todayIso()) })]);
      }
      return null;
    };
    M.bindProgressDrag = function bindProgressDrag(td, row, rich, setDragged) {
      var bar = rich.querySelector('.tb-prog-bar');
      var fill = bar && bar.firstChild;
      var num = rich.querySelector('.tb-prog-num');
      if (!bar || !fill || !num) return;
      td.classList.add('tb-cell--draggable');
      var ringEl = rich.querySelector('.tb-prog-ring');
      if (ringEl) {
        ringEl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        ringEl.addEventListener('click', function (e) {
          e.stopPropagation();
          if (row.blocked) return M.unblockRow(row);
          M.saveProgress(row, row.progress >= 100 ? 0 : 100);
        });
      }
      bar.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        var moved = true;
        var pct = row.progress;
        function pctAt(x) {
          var r = bar.getBoundingClientRect();
          return r.width ? Math.max(0, Math.min(100, Math.round(((x - r.left) / r.width) * 100))) : pct;
        }
        function paint() {
          fill.style.width = pct + '%';
          num.textContent = pct + '%';
          var ring = rich.querySelector('.tb-prog-ring');
          if (ring) M.setRing(ring, pct);
          rich.classList.toggle('is-done', pct >= 100);
        }
        function move(ev) {
          td.classList.add('is-dragging');
          pct = pctAt(ev.clientX);
          paint();
        }
        function up() {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.removeEventListener('pointercancel', up);
          td.classList.remove('is-dragging');
          if (!moved) return;
          setDragged(true);
          setTimeout(function () { setDragged(false); }, 0);
          M.saveProgress(row, pct);
        }
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
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
          M.schedulePush();
        }
        return M.reload({ quiet: true });
      }, M.fail);
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
    M.moveToCompleted = function moveToCompleted(ids, wasDone) {
      var list = M.state.lists.filter(function (l) { return l.category === 'completed'; })[0];
      if (!list) return Promise.resolve();
      var chain = Promise.resolve();
      (ids || []).forEach(function (id) {
        if (wasDone && wasDone[id]) return;
        chain = chain.then(function () { return S.TT().moveCard(M.t, id, list.id, 'bottom'); });
      });
      return chain;
    };
    M.saveProgress = function saveProgress(row, pct) {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.getCardCompletionById !== 'function') return M.setStatus('Éditeur de progrès indisponible', 'error');
      var prev = row.progress;
      var wasDone = {};
      wasDone[row.id] = row.statutKey === 'completed';
      row.progress = pct;
      M.writeProgress(row.id, pct)
        .then(function (ids) {
          return pct >= 100 ? M.moveToCompleted(ids || [row.id], wasDone) : null;
        })
        .then(function () {
          M.setStatus('Enregistré', 'ok');
          M.schedulePush();
          if (prev !== pct) {
            var known = typeof prev === 'number';
            M.record({
              type: known ? 'progress' : 'field', label: 'Progrès', targetId: row.id, title: row.name,
              before: known ? prev + ' %' : '', after: pct + ' %', beforeVal: prev, afterVal: pct,
            });
          }
          M.reload({ quiet: true });
        }, function (err) {
          row.progress = prev;
          M.renderGrid();
          M.fail(err);
        });
    };
    M.openEditor = function openEditor(row, kind, anchor) {
      if (!global.CardFields || !anchor) return false;
      return global.CardFields.open(kind, {
        t: M.t,
        cardId: row.id,
        cardName: row.name,
        anchor: anchor,
        value: kind === 'desc' ? row.desc : undefined,
        save: kind === 'desc'
          ? function (text) {
              var prev = row.desc;
              row.desc = text;
              return S.TT().saveDesc(M.t, row, text).then(function (full) {
                row.fullDesc = full;
                if (prev !== text) M.record({ type: 'edit', targetId: row.id, title: row.name, key: 'desc', before: prev, after: text, beforeVal: prev, afterVal: text });
              }, function (err) { row.desc = prev; throw err; });
            }
          : undefined,
        onSaved: function () {
          M.setStatus('Enregistré', 'ok');
          M.schedulePush();
          if (kind !== 'desc') M.record({ type: 'field', label: M.FIELD_KIND_LABELS[kind] || 'Champ', targetId: row.id, title: row.name });
        },
        onError: function (m) { M.setStatus(m, 'error'); },
        onClose: function (changed) { if (changed) M.reload({ quiet: true }); else M.renderGrid(); },
      });
    };
    M.openField = function openField(row, key, td) {
      var kind = M.POP_KIND[key];
      if (!kind) return false;
      var anchor = td || M.els.wrap.querySelector('td[data-row="' + row.id + '"][data-key="' + key + '"]');
      M.state.selected = { rowId: row.id, key: key };
      M.markSelected();
      return M.openEditor(row, kind, anchor);
    };
    M.openFieldFor = function openFieldFor(row, kind) {
      var td = M.els.wrap.querySelector('td[data-row="' + row.id + '"].tb-cell--' + kind) || M.els.wrap.querySelector('td.tb-num[data-row="' + row.id + '"]');
      M.openEditor(row, kind, td);
    };
    M.renderCell = function renderCell(row, key) {
      var spec = S.TM().COLUMNS[key];
      var isEditing = M.state.editing && M.state.editing.rowId === row.id && M.state.editing.key === key;
      var editable = M.isEditable(key);
      var selected = M.state.selected && M.state.selected.rowId === row.id && M.state.selected.key === key;
      var td = S.h('td', {
        class: 'tb-cell tb-cell--' + spec.kind + (editable ? '' : ' is-ro') + (selected ? ' is-selected' : ''),
        'data-row': row.id,
        'data-key': key,
        style: M.heatStyle(key, row),
      });
      if (key === 'due' && global.WorkOS && global.WorkOS.dateKind(row) === 'hard') td.classList.add('is-hard');

      if (isEditing) {
        td.classList.add('is-editing');
        td.appendChild(M.editor(row, key, spec));
        return td;
      }

      if (key === 'project') {
        var bits = [];
        if (row.projectId && global.ProjectIcon) {
          var glyph = global.ProjectIcon.button({
            t: M.t,
            id: row.projectId,
            icon: row.projectIcon,
            goals: function () { return M.state.goals; },
            onSaved: function () { M.reload({ quiet: true }); },
          });
          if (glyph) bits.push(glyph);
        }
        var projLabel = S.TM().cellText(row, key);
        if (projLabel) bits.push(S.h('span', { text: projLabel }));
        if (bits.length) td.appendChild(S.h('span', { class: 'tb-proj' }, bits));
        td.addEventListener('click', function () {
          M.state.selected = { rowId: row.id, key: key };
          M.renderGrid();
        });
        return td;
      }

      if (key === 'name') {
        td.classList.add('tb-cell--name'); // frozen next to the row gutter (see table-ui.css)
        td.title = row.name;
        td.appendChild(M.subToggle(row));
        td.appendChild(S.h('span', { class: 'tb-name', text: row.name }));
        var stepText = global.WorkOS && global.WorkOS.stepText(row);
        if (stepText) td.appendChild(S.h('span', { class: 'tb-step', text: stepText }));
        var place = M.state.places && global.WorkOS && M.state.columns.indexOf('project') === -1 ? global.WorkOS.placeLabel(M.state.places[row.id]) : '';
        if (place) {
          var pl = M.state.places[row.id];
          var placeKids = [S.h('span', { text: place })];
          if (pl && pl.projectId && global.ProjectIcon) {
            var placeGlyph = global.ProjectIcon.button({
              t: M.t,
              id: pl.projectId,
              icon: pl.icon,
              goals: function () { return M.state.goals; },
              onSaved: function () { M.reload({ quiet: true }); },
            });
            if (placeGlyph) placeKids.unshift(placeGlyph);
          }
          td.appendChild(S.h('span', { class: 'tb-place' }, placeKids));
        }
        td.addEventListener('click', function () {
          M.state.selected = { rowId: row.id, key: key };
          M.beginEdit(row.id, key);
        });
        return td;
      }

      if (spec.kind === 'link') {
        if (row.link) {
          td.appendChild(S.h('a', { class: 'tb-linkcell', href: row.link, target: '_blank', rel: 'noopener' }, [S.icon('external-link'), S.h('span', { text: 'Trello' })]));
        }
        return td;
      }

      if (spec.kind === 'list') {
        td.classList.add('tb-cell--pill');
        td.appendChild(M.statutPill(row));
        td.appendChild(S.icon('chevron-down', 'tb-caret'));
        td.addEventListener('click', function () {
          M.state.selected = { rowId: row.id, key: key };
          M.openStatutMenu(row, td);
        });
        return td;
      }

      var rich = M.richValue(row, key);
      if (M.POP_KIND[key]) {
        td.classList.add('tb-cell--pop', 'tb-cell--' + M.POP_KIND[key]);
        td.classList.remove('is-ro');
      }
      if (key === 'tier' && row.tier) {
        td.appendChild(S.h('span', { class: 'tb-tier', text: row.tier }));
      } else if (rich) {
        td.appendChild(rich);
      } else {
        td.textContent = key === 'desc' ? S.TM().plainMarkdown(S.TM().cellText(row, key)) : S.TM().cellText(row, key);
        if (M.POP_KIND[key] && !td.textContent) td.appendChild(S.h('span', { class: 'tb-empty-hint', text: 'Définir' }));
      }
      var dragged = false;
      if (key === 'progress' && rich) M.bindProgressDrag(td, row, rich, function (d) { dragged = d; });
      td.addEventListener('click', function () {
        if (dragged) { dragged = false; return; }
        M.state.selected = { rowId: row.id, key: key };
        if (M.POP_KIND[key] && M.openField(row, key, td)) return;
        if (key === 'category' && !M.state.categoryAvailable) M.setStatus('Champ personnalisé « Catégorie » absent de ce tableau Trello', 'error', 4000);
        if (editable) M.beginEdit(row.id, key);
        else M.renderGrid();
      });
      return td;
    };
    M.subToggle = function subToggle(row) {
      var count = S.TM().subtaskRows(row).length;
      if (!count) return S.h('span', { class: 'tb-subtoggle is-empty' });
      var open = !!M.state.expanded[row.id];
      return S.h('button', {
        class: 'tb-subtoggle',
        type: 'button',
        title: open ? 'Replier les sous-tâches' : 'Déplier les sous-tâches',
        onclick: function (e) {
          e.stopPropagation(); // the click must not start renaming the card
          M.state.expanded[row.id] = !open;
          M.renderGrid();
        },
      }, [S.icon(open ? 'chevron-down' : 'chevron-right'), S.h('span', { class: 'tb-subcount', text: String(count) })]);
    };
    M.renderSubRows = function renderSubRows(row, body) {
      S.TM().subtaskRows(row).forEach(function (sub) {
        var tr = S.h('tr', {
          class: 'tb-sub',
          'data-parent': row.id,
          'data-iso-sub': sub.id,
          'data-iso-label': sub.name || '',
        });
        tr.appendChild(S.h('td', { class: 'tb-num' }));
        M.shownColumns().forEach(function (key) { tr.appendChild(M.renderSubCell(sub, key)); });
        body.appendChild(tr);
      });
    };
    M.renderSubCell = function renderSubCell(sub, key) {
      var spec = S.TM().COLUMNS[key];
      var td = S.h('td', { class: 'tb-cell tb-cell--' + spec.kind + ' tb-cell--sub is-ro' });
      if (key === 'name') {
        td.classList.add('tb-cell--name');
        td.title = sub.name;
        // 36px matches the card's fold slot, then one step per nesting level.
        td.style.paddingLeft = (8 + 36 + 16 * sub.depth) + 'px';
        td.appendChild(S.icon(sub.done ? 'circle-check' : 'circle', 'tb-sub-icon'));
        td.appendChild(S.h('span', { class: 'tb-name' + (sub.done ? ' is-done' : ''), text: sub.name }));
      } else if (key === 'progress') {
        td.textContent = S.TM().cellText(sub, 'progress');
      } else if (key === 'due') {
        td.textContent = sub.due ? S.TM().formatDay(sub.due) : '';
      }
      return td;
    };
    M.statutItems = function statutItems(row) {
      return M.state.lists.map(function (l) {
        return {
          icon: l.icon,
          color: l.color,
          label: l.name,
          checked: l.id === row.listId,
          action: function () { M.commitEdit(row, 'statut', l.id); },
        };
      });
    };
    M.openStatutMenu = function openStatutMenu(row, td) {
      var r = td.getBoundingClientRect();
      S.MENU().show({ x: r.left, y: r.bottom + 2, above: r.top - 2 }, [{ title: 'Statut' }].concat(M.statutItems(row)), { minWidth: Math.max(190, r.width) });
    };
    M.beginEdit = function beginEdit(rowId, key) {
      if (M.POP_KIND[key]) {
        var pr = M.findRow(rowId);
        if (pr && M.openField(pr, key)) return;
      }
      M.state.editing = { rowId: rowId, key: key };
      M.renderGrid();
      var input = M.els.wrap.querySelector('.is-editing input, .is-editing textarea');
      if (input) {
        input.focus();
        if (input.select) input.select();
      }
    };
    M.editor = function editor(row, key, spec) {
      var done = false;
      function finish(commit, value, move) {
        if (done) return;
        done = true;
        M.state.editing = null;
        if (commit) M.commitEdit(row, key, value);
        else M.renderGrid();
        if (move) M.moveSelection(row.id, key, move);
      }
      var tag = spec.kind === 'longtext' ? 'textarea' : 'input';
      var el = S.h(tag, { class: 'tb-input', rows: tag === 'textarea' ? '3' : null });
      el.value = row[key] == null ? '' : String(row[key]);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') finish(false);
        else if (e.key === 'Enter' && !(tag === 'textarea' && e.shiftKey)) {
          e.preventDefault();
          finish(true, el.value, 'down');
        } else if (e.key === 'Tab') {
          e.preventDefault();
          finish(true, el.value, e.shiftKey ? 'left' : 'right');
        }
      });
      el.addEventListener('blur', function () { finish(true, el.value); });
      return el;
    };
    M.moveSelection = function moveSelection(rowId, key, dir) {
      var rows = M.visibleRows();
      var ri = rows.findIndex(function (r) { return r.id === rowId; });
      var cols = M.shownColumns();
      var ci = cols.indexOf(key);
      if (dir === 'down') ri += 1;
      if (dir === 'up') ri -= 1;
      if (dir === 'right') ci += 1;
      if (dir === 'left') ci -= 1;
      if (ri < 0 || ri >= rows.length || ci < 0 || ci >= cols.length) return;
      var nextKey = cols[ci];
      M.state.selected = { rowId: rows[ri].id, key: nextKey };
      if (M.state.editing) {
        if (M.isEditable(nextKey) && nextKey !== 'statut') return M.beginEdit(rows[ri].id, nextKey);
      }
      M.renderGrid();
    };
    },
    run: function (M) {
    M.HD = global.HideDone;
    M.state = {
      lists: [],
      rows: [],
      places: {},
      goals: { nodes: [], links: [] },
      columns: S.TM().DEFAULT_COLUMNS.slice(),
      widths: {},
      sheetTheme: 'light',
      sorts: [], // [{key, dir}] — first is the main sort, the rest break ties
      filter: '',
      hideDone: M.HD.get(),
      categoryFieldId: null,
      categoryAvailable: false,
      sheet: null,
      authOk: true,
      editing: null, // {rowId, key}
      selected: null, // {rowId, key}
      dragId: null,
      status: '',
      statusKind: '',
      statusAction: null,
      menuOpen: false,
      drawer: null, // 'logs' | 'activities'
      alerts: [],
      expanded: {}, // rowId → true when its subtasks (checklist items) show as child rows
    };
    M.pushTimer = null;
    M.statusTimer = null;
    M.HP = null;
    M.root.innerHTML = '';
    M.els = {
      bar: S.h('div', { class: 'tb-bar' }),
      banner: S.h('div', { class: 'tb-banner', hidden: true }),
      alert: S.h('div', { class: 'tb-alert', hidden: true }),
      wrap: S.h('div', { class: 'tb-wrap' }),
      drawer: S.h('div', { class: 'tb-drawer', hidden: true }),
    };
    M.shell = S.h('div', { class: 'tb-root', tabindex: '-1' }, [M.els.bar, M.els.banner, M.els.alert, M.els.wrap, M.els.drawer]);
    M.root.appendChild(M.shell);
    M.MIN_COL = 60;
    M.POP_KIND = { progress: 'progress', urgency: 'priority', priority: 'priority', tier: 'priority', due: 'due', desc: 'desc' };
    M.URGENCY_TONE = { Aucun: 0, 'Bientôt': 1, 'Assez vite': 2, Vite: 3, 'Au plus vite': 4 };
    M.RING_C = 2 * Math.PI * 7;
    M.FIELD_KIND_LABELS = { progress: 'Progrès', priority: 'Priorité', due: 'Échéance' };
    }
  });
})(typeof window !== 'undefined' ? window : this);
