/*
 * Role: UI of the Table view — a spreadsheet-like grid of the board's cards.
 *  - click an Objet to open the card (pencil / F2 / Enter to rename), double-click any row to open
 *  - Statut cells are colored pills; clicking one opens a menu of the board's lists with icons
 *  - sortable headers (faint arrows on hover), filter, drag-to-reorder, column picker
 *  - right-click anywhere: context menu adapted to what is under the mouse
 * Data + writes: TableTrello; pure helpers: TableModel; menus: TableMenu. Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var TM = function () {
    return global.TableModel;
  };
  var TT = function () {
    return global.TableTrello;
  };
  var SH = function () {
    return global.SheetsTrello;
  };
  var MENU = function () {
    return global.TableMenu;
  };

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function icon(name, cls) {
    return h('i', { class: 'ti ti-' + name + (cls ? ' ' + cls : '') });
  }

  function btn(iconName, label, opts) {
    opts = opts || {};
    return h(
      'button',
      {
        class: 'tb-btn' + (opts.primary ? ' tb-btn--primary' : '') + (label ? '' : ' tb-btn--icon'),
        title: opts.title || label || null,
        onclick: opts.onclick,
      },
      [icon(iconName), label ? h('span', { text: label }) : null]
    );
  }

  /* Placeholder grid (header + rows) shown while data loads. */
  function skeletonRows() {
    var widths = [40, 75, 55, 65, 45, 70, 50];
    var out = '';
    for (var r = 0; r < 14; r++) {
      out += '<div class="tb-skel-row">';
      for (var c = 0; c < 6; c++) {
        var w = r === 0 ? 45 : widths[(r * 3 + c * 2) % widths.length];
        out += '<div class="tb-skel-cell"><span class="tb-skel-block" style="--w:' + w + '%"></span></div>';
      }
      out += '</div>';
    }
    return out;
  }

  function mount(root, t) {
    var state = {
      lists: [],
      rows: [],
      columns: TM().DEFAULT_COLUMNS.slice(),
      widths: {},
      sheetTheme: 'light',
      sort: null, // {key, dir}
      filter: '',
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
    };
    var pushTimer = null;
    var statusTimer = null;

    root.innerHTML = '';
    var els = {
      bar: h('div', { class: 'tb-bar' }),
      banner: h('div', { class: 'tb-banner', hidden: true }),
      alert: h('div', { class: 'tb-alert', hidden: true }),
      wrap: h('div', { class: 'tb-wrap' }),
      drawer: h('div', { class: 'tb-drawer', hidden: true }),
      dock: h('div', { class: 'tb-dock' }),
    };
    var shell = h('div', { class: 'tb-root', tabindex: '-1' }, [els.bar, els.banner, els.alert, els.wrap, els.drawer, els.dock]);
    root.appendChild(shell);

    /* ── Status line (with optional action, e.g. Annuler) ─────────── */
    function setStatus(msg, kind, keepMs, action) {
      state.status = msg || '';
      state.statusKind = kind || '';
      state.statusAction = action || null;
      state.statusIcon = kind === 'busy' && /^Enregistrement/.test(msg || '') ? 'device-floppy' : 'refresh';
      paintStatus();
      clearTimeout(statusTimer);
      if (msg && kind !== 'error' && kind !== 'busy') {
        statusTimer = setTimeout(function () {
          setStatus('', '');
        }, keepMs || (action ? 8000 : 2500));
      }
    }

    function paintStatus() {
      var s = els.bar.querySelector('.tb-status');
      if (!s) return;
      s.className = 'tb-status' + (state.statusKind ? ' is-' + state.statusKind : '');
      s.innerHTML = '';
      if (state.statusKind === 'ok') s.appendChild(icon('check'));
      if (state.statusKind === 'busy') s.appendChild(icon(state.statusIcon || 'loader-2', 'tb-spin'));
      if (state.statusKind === 'error') s.appendChild(icon('alert-triangle'));
      s.appendChild(document.createTextNode(state.status));
      if (state.statusAction) {
        s.appendChild(
          h('button', {
            class: 'tb-link',
            onclick: function () {
              var a = state.statusAction;
              setStatus('', '');
              a.run();
            },
          }, [icon('arrow-back-up'), a_label(state.statusAction)])
        );
      }
    }
    function a_label(a) {
      return document.createTextNode(' ' + a.label);
    }

    function fail(err) {
      var reason = err && (err.reason || err.message);
      if (reason === 'not-authorized' || reason === 'no-token' || reason === 'auth-failed') {
        state.authOk = false;
        renderBanner();
        setStatus('Autorisez Trello pour enregistrer les modifications.', 'error');
      } else {
        setStatus('Échec : ' + (reason || 'erreur inconnue'), 'error');
      }
    }

    /* ── Sheet mirroring ───────────────────────────────────────────── */
    function schedulePush() {
      if (!SH().isConnected(state.sheet)) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(function () {
        setStatus('Synchronisation avec le Sheet…', 'busy');
        TT().pushToSheet(t, state.rows).then(function (res) {
          if (res && res.ok) setStatus('Google Sheet à jour', 'ok');
          else if (res && res.reason !== 'not-connected') setStatus('Sheet : ' + (res.detail || res.reason), 'error');
        });
      }, 800);
    }

    /* ── Helpers ───────────────────────────────────────────────────── */
    function visibleRows() {
      var rows = TM().filterRows(state.rows, state.filter);
      if (state.sort) rows = TM().sortRows(rows, state.sort.key, state.sort.dir);
      return rows;
    }
    function canReorder() {
      return !state.sort && !state.filter;
    }
    function findRow(id) {
      return state.rows.filter(function (r) { return r.id === id; })[0] || null;
    }
    function isEditable(key) {
      return TM().COLUMNS[key].editable && !(key === 'category' && !state.categoryAvailable);
    }
    function listById(id) {
      return state.lists.filter(function (l) { return l.id === id; })[0] || null;
    }
    function copyText(text) {
      var done = function () { setStatus('Copié', 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
    }

    function setSort(key, dir) {
      state.sort = key ? { key: key, dir: dir } : null;
      renderGrid();
    }

    function hideColumn(key) {
      if (state.columns.length <= 1) return;
      applyColumns(state.columns.filter(function (k) { return k !== key; }));
    }

    /* ── Banner / toolbar ──────────────────────────────────────────── */
    function renderBanner() {
      els.banner.innerHTML = '';
      if (!state.authOk) {
        els.banner.hidden = false;
        els.banner.appendChild(icon('lock'));
        els.banner.appendChild(h('span', { text: 'Trello doit être autorisé pour modifier les cartes depuis la table.' }));
        els.banner.appendChild(
          btn('key', 'Autoriser Trello', {
            primary: true,
            onclick: function () {
              global.GanttTrello.ensureRestAuthorized(t).then(function (r) {
                state.authOk = !!r.ok;
                renderBanner();
              });
            },
          })
        );
      } else {
        els.banner.hidden = true;
      }
    }

    function openSheet() {
      if (SH().isConnected(state.sheet) && state.sheet.sheetUrl) window.open(state.sheet.sheetUrl, '_blank', 'noopener');
      else openSheetSettings();
    }

    function syncNow() {
      setStatus('Synchronisation avec le Sheet…', 'busy');
      TT()
        .pushToSheet(t, state.rows)
        .then(function () { return SH().syncNow(state.sheet); })
        .then(function (res) {
          if (res.ok) {
            setStatus('Synchronisé', 'ok');
            reload({ quiet: true });
          } else setStatus('Sheet : ' + (res.detail || res.reason), 'error');
        });
    }

    function renderBar() {
      els.bar.innerHTML = '';
      var connected = SH().isConnected(state.sheet);
      var filter = h('input', {
        class: 'tb-filter',
        type: 'search',
        placeholder: 'Filtrer…',
        value: state.filter,
        oninput: function (e) {
          state.filter = e.target.value;
          renderGrid({ keepFocus: 'filter' });
        },
      });
      var kids = [
        h('label', { class: 'tb-search' }, [icon('search'), filter]),
        btn('refresh', null, { title: 'Actualiser', onclick: function () { reload(); } }),
        btn('columns-3', 'Colonnes', {
          onclick: function (e) {
            e.stopPropagation();
            state.menuOpen = !state.menuOpen;
            renderMenu();
          },
        }),
      ];
      if (state.sort) kids.push(btn('arrows-sort', 'Ordre du tableau', { title: 'Retirer le tri', onclick: function () { setSort(null); } }));
      kids.push(h('span', { class: 'tb-status' }));
      kids.push(h('span', { class: 'tb-spacer' }));
      if (connected) {
        var logBtn = btn('list-details', 'Logs', { title: 'Journal de la synchronisation', onclick: function () { openDrawer('logs'); } });
        logBtn.appendChild(h('span', { class: 'tb-badge', hidden: !state.alerts.length, text: '!' }));
        kids.push(logBtn);
        kids.push(btn('activity', 'Activités', { title: 'Qui a fait quoi, dans Trello et dans le Sheet', onclick: function () { openDrawer('activities'); } }));
      }
      if (connected) kids.push(btn('refresh-dot', 'Synchroniser', { title: 'Forcer une synchronisation Trello ⇄ Sheet', onclick: syncNow }));
      kids.push(
        btn(connected ? 'brand-google-drive' : 'plug-connected', connected ? 'Afficher dans Google Sheet' : 'Connecter Google Sheets', {
          primary: true,
          onclick: openSheet,
        })
      );
      kids.forEach(function (c) { els.bar.appendChild(c); });
      els.bar.appendChild(h('div', { class: 'tb-menu', hidden: !state.menuOpen, id: 'tbMenu' }));
      paintStatus();
      renderMenu();
    }

    function renderMenu() {
      var menu = els.bar.querySelector('#tbMenu');
      if (!menu) return;
      menu.hidden = !state.menuOpen;
      if (!state.menuOpen) return;
      menu.innerHTML = '';
      menu.onclick = function (e) { e.stopPropagation(); };
      menu.appendChild(h('div', { class: 'tbm-title', text: 'Colonnes (aussi celles du Google Sheet)' }));
      var all = Object.keys(TM().COLUMNS);
      var ordered = state.columns.concat(all.filter(function (k) { return state.columns.indexOf(k) === -1; }));
      ordered.forEach(function (key) {
        var on = state.columns.indexOf(key) !== -1;
        var idx = state.columns.indexOf(key);
        menu.appendChild(
          h('div', { class: 'tb-menu-row' }, [
            h('label', {}, [
              h('input', {
                type: 'checkbox',
                checked: on,
                onchange: function (e) {
                  var next = state.columns.slice();
                  if (e.target.checked) next.push(key);
                  else next = next.filter(function (k) { return k !== key; });
                  if (!next.length) return renderMenu();
                  applyColumns(next);
                },
              }),
              icon(TM().COLUMNS[key].icon, 'tb-col-icon'),
              h('span', { text: TM().COLUMNS[key].header }),
            ]),
            on
              ? h('span', { class: 'tb-menu-move' }, [
                  h('button', { title: 'Monter', disabled: idx === 0, onclick: function () { moveColumn(idx, -1); } }, [icon('arrow-up')]),
                  h('button', { title: 'Descendre', disabled: idx === state.columns.length - 1, onclick: function () { moveColumn(idx, 1); } }, [icon('arrow-down')]),
                ])
              : null,
          ])
        );
      });
      if (SH().isConnected(state.sheet)) {
        menu.appendChild(h('div', { class: 'tbm-sep' }));
        menu.appendChild(h('div', { class: 'tbm-title', text: 'Thème du Google Sheet' }));
        var themeSel = h('select', {
          class: 'tb-select',
          title: 'Apparence du Google Sheet',
          onchange: function (e) {
            var theme = e.target.value;
            setStatus('Thème du Sheet…');
            SH().setSheetTheme(state.sheet, theme).then(function (res) {
              if (res.ok) { state.sheetTheme = theme; setStatus(theme === 'dark' ? 'Sheet en mode sombre' : 'Sheet en mode clair', 'ok'); }
              else setStatus('Sheet : ' + (res.detail || res.reason), 'error');
            });
          },
        });
        [['light', 'Clair'], ['dark', 'Sombre (style Trello, Lexend)']].forEach(function (o) {
          themeSel.appendChild(h('option', { value: o[0], text: o[1], selected: o[0] === state.sheetTheme }));
        });
        menu.appendChild(h('div', { class: 'tb-menu-row' }, [themeSel]));
      }
    }

    function moveColumn(idx, delta) {
      var next = state.columns.slice();
      var to = idx + delta;
      if (to < 0 || to >= next.length) return;
      var tmp = next[idx];
      next[idx] = next[to];
      next[to] = tmp;
      applyColumns(next);
    }

    function applyColumns(next) {
      state.columns = next;
      renderGrid();
      renderMenu();
      TT()
        .saveColumns(t, next)
        .then(function () {
          state.sheet = Object.assign({}, state.sheet, { columns: next });
          if (SH().isConnected(state.sheet)) {
            setStatus('Colonnes du Sheet…');
            return SH().pushColumns(state.sheet, next).then(function (res) {
              if (res.ok) {
                setStatus('Colonnes appliquées au Sheet', 'ok');
                schedulePush();
              } else setStatus('Sheet : ' + (res.detail || res.reason), 'error');
            });
          }
        });
    }

    function openSheetSettings() {
      t.modal({
        title: 'Google Sheets ↔ Trello',
        url: global.PriorityTrello.pageUrl('./google-sheets-sync.html'),
        fullscreen: false,
        height: 560,
        accentColor: '#22272B',
        callback: function () {
          SH().getSettings(t).then(function (s) {
            state.sheet = s;
            renderBar();
            schedulePush();
          });
        },
      });
    }

    function openCard(row) {
      if (!row) return;
      t.modal({
        title: row.name || 'Carte',
        url: global.PriorityTrello.pageUrl('./popup.html'),
        args: { cardId: row.id, cardName: row.name || '', openSection: null },
        fullscreen: true,
        accentColor: '#22272B',
        callback: function () {
          return t.modal({
            title: 'Table',
            url: global.PriorityTrello.pageUrl('./table.html'),
            fullscreen: true,
            accentColor: '#22272B',
          });
        },
      });
    }

    /* ── Grid ──────────────────────────────────────────────────────── */
    function heatStyle(key, row) {
      var spec = TM().COLUMNS[key];
      var v = row[key];
      if (!spec.heat || typeof v !== 'number') return null;
      var frac = Math.max(0, Math.min(1, v / spec.heat));
      return 'background:rgba(52,187,140,' + (0.08 + frac * 0.5).toFixed(2) + ')';
    }

    /* ── Column widths (drag the right edge of a header; double-click resets) ── */
    var MIN_COL = 60;
    function colWidth(key) {
      var w = state.widths[key];
      return typeof w === 'number' && w >= MIN_COL ? w : TM().COLUMNS[key].width;
    }
    function saveWidths() {
      TT().saveWidths(t, state.widths).catch(fail);
    }
    function resizer(key) {
      return h('span', {
        class: 'tb-resizer',
        title: 'Glisser pour redimensionner · double-clic pour réinitialiser',
        onclick: function (e) { e.stopPropagation(); },
        ondblclick: function (e) {
          e.stopPropagation();
          delete state.widths[key];
          renderGrid();
          saveWidths();
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
            var w = Math.max(MIN_COL, Math.round(startW + ev.clientX - startX));
            th.style.width = th.style.minWidth = w + 'px';
            table.style.width = startTable + (w - startW) + 'px';
            state.widths[key] = w;
          }
          function up() {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            document.body.classList.remove('tb-resizing');
            saveWidths();
          }
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
        },
      });
    }

    function renderGrid(opts) {
      opts = opts || {};
      var scrollTop = els.wrap.scrollTop;
      var scrollLeft = els.wrap.scrollLeft;
      if (opts.keepFocus !== 'filter') renderBar();
      var rows = visibleRows();
      var table = h('table', { class: 'tb-grid' });
      var head = h('tr', {}, [h('th', { class: 'tb-corner' })]);
      var tableWidth = 96;
      state.columns.forEach(function (key) {
        var spec = TM().COLUMNS[key];
        var width = colWidth(key);
        tableWidth += width;
        var active = state.sort && state.sort.key === key;
        var sortIcon = active ? (state.sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrows-sort';
        head.appendChild(
          h('th', {
            class: 'tb-th' + (active ? ' is-sorted' : ''),
            'data-key': key,
            style: 'min-width:' + width + 'px;width:' + width + 'px',
            title: 'Cliquer pour trier',
            onclick: function () {
              if (active) setSort(state.sort.dir === 'asc' ? key : null, 'desc');
              else setSort(key, 'asc');
            },
          }, [icon(spec.icon, 'tb-th-icon'), h('span', { class: 'tb-th-text', text: spec.header }), icon(sortIcon, 'tb-sort'), resizer(key)])
        );
      });
      table.style.width = tableWidth + 'px';
      table.appendChild(h('thead', {}, [head]));

      var body = h('tbody');
      rows.forEach(function (row, i) {
        var tr = h('tr', { 'data-id': row.id });
        tr.addEventListener('dragover', function (e) {
          if (!state.dragId || !canReorder()) return;
          e.preventDefault();
          tr.classList.toggle('is-drop-before', e.offsetY < tr.offsetHeight / 2);
          tr.classList.toggle('is-drop-after', e.offsetY >= tr.offsetHeight / 2);
        });
        tr.addEventListener('dragleave', function () {
          tr.classList.remove('is-drop-before', 'is-drop-after');
        });
        tr.addEventListener('drop', function (e) {
          if (!state.dragId || !canReorder()) return;
          e.preventDefault();
          dropRow(state.dragId, row, e.offsetY >= tr.offsetHeight / 2);
        });

        tr.appendChild(
          h('td', { class: 'tb-num', 'data-row': row.id }, [
            h('span', {
              class: 'tb-handle' + (canReorder() ? '' : ' is-off'),
              draggable: canReorder() ? 'true' : null,
              title: canReorder() ? 'Glisser pour réordonner' : 'Retirez le tri/filtre pour réordonner',
              ondragstart: function (e) {
                state.dragId = row.id;
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', row.id); } catch (err) { /* ignore */ }
              },
              ondragend: function () {
                state.dragId = null;
                renderGrid();
              },
            }, [icon('grip-vertical')]),
            h('span', { class: 'tb-rownum', text: String(i + 1) }),
            h('button', {
              class: 'tb-rowbtn',
              title: 'Ouvrir la carte',
              onclick: function () { openCard(row); },
            }, [icon('arrow-up-right')]),
            h('button', {
              class: 'tb-rowbtn tb-rowbtn--danger',
              title: 'Archiver la carte',
              onclick: function () { archiveRow(row); },
            }, [icon('archive')]),
          ])
        );
        state.columns.forEach(function (key) { tr.appendChild(renderCell(row, key)); });
        body.appendChild(tr);
      });

      if (!rows.length && state.filter) {
        body.appendChild(
          h('tr', { class: 'tb-empty-row' }, [
            h('td', { colspan: String(state.columns.length + 1) }, [
              'Aucune carte ne correspond à « ' + state.filter + ' ». ',
              h('button', {
                class: 'tb-empty-clear',
                type: 'button',
                onclick: function () { state.filter = ''; renderBar(); renderGrid(); },
              }, ['Effacer le filtre']),
            ]),
          ])
        );
      }
      var addInput = h('input', {
        class: 'tb-add',
        id: 'tbAdd',
        placeholder: 'Nouvelle carte — écrire un titre puis Entrée',
        onkeydown: function (e) {
          if (e.key !== 'Enter') return;
          var name = e.target.value.trim();
          if (!name || !state.lists.length) return;
          createIn(state.lists[0], name, e.target);
        },
      });
      body.appendChild(
        h('tr', { class: 'tb-add-row' }, [
          h('td', { class: 'tb-num' }, [icon('plus')]),
          h('td', { colspan: String(state.columns.length) }, [addInput]),
        ])
      );
      table.appendChild(body);
      els.wrap.innerHTML = '';
      els.wrap.appendChild(table);
      els.wrap.scrollTop = scrollTop;
      els.wrap.scrollLeft = scrollLeft;
      var ae = document.activeElement;
      if (!state.editing && (!ae || ae === document.body)) shell.focus({ preventScroll: true });
    }

    function createIn(list, name, input) {
      if (input) input.disabled = true;
      TT()
        .createRow(t, name, list.id)
        .then(function () {
          reload({ quiet: true });
          setStatus('Carte créée dans « ' + list.name + ' »', 'ok');
        }, function (err) {
          if (input) input.disabled = false;
          fail(err);
        });
    }

    function statutPill(row) {
      var list = listById(row.listId);
      var color = row.statutColor || (list && list.color) || '#626f86';
      var pill = h('span', { class: 'tb-pill', style: '--pill:' + color }, [
        icon(TM().statutIcon(row.statutKey || (list && list.category) || '_none')),
        h('span', { text: row.statut || '—' }),
      ]);
      return pill;
    }

    /* ── Rich cell values ─────────────────────────────────────────── */
    // Columns edited through the shared CardFields popovers (same editors as the card page / Gantt).
    var POP_KIND = { progress: 'progress', urgency: 'priority', priority: 'priority', tier: 'priority', due: 'due', desc: 'desc' };
    var URGENCY_TONE = { Aucun: 0, 'Bientôt': 1, 'Assez vite': 2, Vite: 3, 'Au plus vite': 4 };

    function todayIso() {
      var d = new Date();
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }

    function richValue(row, key) {
      if (key === 'progress' && typeof row.progress === 'number') {
        var p = Math.max(0, Math.min(100, row.progress));
        return h('span', { class: 'tb-prog' + (p >= 100 ? ' is-done' : '') }, [
          h('span', { class: 'tb-prog-bar' }, [h('i', { style: 'width:' + p + '%' })]),
          h('span', { class: 'tb-prog-num', text: p + '%' }),
        ]);
      }
      if (key === 'urgency' && row.urgency) {
        var tone = URGENCY_TONE[row.urgency];
        return h('span', { class: 'tb-chip tb-chip--u' + (tone == null ? 0 : tone) }, [icon('flame'), h('span', { text: row.urgency })]);
      }
      if (key === 'priority' && typeof row.priority === 'number') {
        return h('span', { class: 'tb-num-strong', text: String(row.priority) });
      }
      if (key === 'due' && row.due) {
        var overdue = /^\d{4}-\d{2}-\d{2}/.test(row.due) && row.due.slice(0, 10) < todayIso() && row.statutKey !== 'completed' && row.statutKey !== 'canceled';
        return h('span', { class: 'tb-chip tb-chip--due' + (overdue ? ' is-overdue' : '') }, [icon(overdue ? 'calendar-exclamation' : 'calendar-event'), h('span', { text: row.due })]);
      }
      return null;
    }

    /** Opens the shared CardFields editor of `kind` for a row, hanging from `anchor`. */
    function openEditor(row, kind, anchor) {
      if (!global.CardFields || !anchor) return false;
      return global.CardFields.open(kind, {
        t: t,
        cardId: row.id,
        cardName: row.name,
        anchor: anchor,
        value: kind === 'desc' ? row.desc : undefined,
        save: kind === 'desc'
          ? function (text) {
              var prev = row.desc;
              row.desc = text;
              return TT().saveDesc(t, row, text).then(function (full) { row.fullDesc = full; }, function (err) { row.desc = prev; throw err; });
            }
          : undefined,
        onSaved: function () { setStatus('Enregistré', 'ok'); schedulePush(); },
        onError: function (m) { setStatus(m, 'error'); },
        onClose: function (changed) { if (changed) reload({ quiet: true }); else renderGrid(); },
      });
    }

    function openField(row, key, td) {
      var kind = POP_KIND[key];
      if (!kind) return false;
      var anchor = td || els.wrap.querySelector('td[data-row="' + row.id + '"][data-key="' + key + '"]');
      state.selected = { rowId: row.id, key: key };
      markSelected();
      return openEditor(row, kind, anchor);
    }

    /** Row-menu entry: works even when the column is hidden (hangs from the row number cell). */
    function openFieldFor(row, kind) {
      var td = els.wrap.querySelector('td[data-row="' + row.id + '"].tb-cell--' + kind) || els.wrap.querySelector('td.tb-num[data-row="' + row.id + '"]');
      openEditor(row, kind, td);
    }

    function renderCell(row, key) {
      var spec = TM().COLUMNS[key];
      var isEditing = state.editing && state.editing.rowId === row.id && state.editing.key === key;
      var editable = isEditable(key);
      var selected = state.selected && state.selected.rowId === row.id && state.selected.key === key;
      var td = h('td', {
        class: 'tb-cell tb-cell--' + spec.kind + (editable ? '' : ' is-ro') + (selected ? ' is-selected' : ''),
        'data-row': row.id,
        'data-key': key,
        style: heatStyle(key, row),
      });

      if (isEditing) {
        td.classList.add('is-editing');
        td.appendChild(editor(row, key, spec));
        return td;
      }

      if (key === 'name') {
        td.title = row.name;
        td.appendChild(h('span', { class: 'tb-name', text: row.name }));
        td.addEventListener('click', function () {
          state.selected = { rowId: row.id, key: key };
          beginEdit(row.id, key);
        });
        return td;
      }

      if (spec.kind === 'link') {
        if (row.link) {
          td.appendChild(h('a', { class: 'tb-linkcell', href: row.link, target: '_blank', rel: 'noopener' }, [icon('external-link'), h('span', { text: 'Trello' })]));
        }
        return td;
      }

      if (spec.kind === 'list') {
        td.classList.add('tb-cell--pill');
        td.appendChild(statutPill(row));
        td.appendChild(icon('chevron-down', 'tb-caret'));
        td.addEventListener('click', function () {
          state.selected = { rowId: row.id, key: key };
          openStatutMenu(row, td);
        });
        return td;
      }

      var rich = richValue(row, key);
      if (POP_KIND[key]) {
        td.classList.add('tb-cell--pop', 'tb-cell--' + POP_KIND[key]);
        td.classList.remove('is-ro');
      }
      if (key === 'tier' && row.tier) {
        td.appendChild(h('span', { class: 'tb-tier', text: row.tier }));
      } else if (rich) {
        td.appendChild(rich);
      } else {
        td.textContent = TM().cellText(row, key);
        if (POP_KIND[key] && !td.textContent) td.appendChild(h('span', { class: 'tb-empty-hint', text: 'Définir' }));
      }
      td.addEventListener('click', function () {
        state.selected = { rowId: row.id, key: key };
        if (POP_KIND[key] && openField(row, key, td)) return;
        if (key === 'category' && !state.categoryAvailable) setStatus('Champ personnalisé « Catégorie » absent de ce tableau Trello', 'error', 4000);
        if (editable) beginEdit(row.id, key);
        else renderGrid();
      });
      return td;
    }

    /* ── Statut dropdown (colored, with icons) ─────────────────────── */
    function statutItems(row) {
      return state.lists.map(function (l) {
        return {
          icon: l.icon,
          color: l.color,
          label: l.name,
          checked: l.id === row.listId,
          action: function () { commitEdit(row, 'statut', l.id); },
        };
      });
    }

    function openStatutMenu(row, td) {
      var r = td.getBoundingClientRect();
      MENU().show({ x: r.left, y: r.bottom + 2, above: r.top - 2 }, [{ title: 'Statut' }].concat(statutItems(row)), { minWidth: Math.max(190, r.width) });
    }

    /* ── Editing ───────────────────────────────────────────────────── */
    function beginEdit(rowId, key) {
      if (POP_KIND[key]) {
        var pr = findRow(rowId);
        if (pr && openField(pr, key)) return;
      }
      state.editing = { rowId: rowId, key: key };
      renderGrid();
      var input = els.wrap.querySelector('.is-editing input, .is-editing textarea');
      if (input) {
        input.focus();
        if (input.select) input.select();
      }
    }

    function editor(row, key, spec) {
      var done = false;
      function finish(commit, value, move) {
        if (done) return;
        done = true;
        state.editing = null;
        if (commit) commitEdit(row, key, value);
        else renderGrid();
        if (move) moveSelection(row.id, key, move);
      }
      var tag = spec.kind === 'longtext' ? 'textarea' : 'input';
      var el = h(tag, { class: 'tb-input', rows: tag === 'textarea' ? '3' : null });
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
    }

    function moveSelection(rowId, key, dir) {
      var rows = visibleRows();
      var ri = rows.findIndex(function (r) { return r.id === rowId; });
      var ci = state.columns.indexOf(key);
      if (dir === 'down') ri += 1;
      if (dir === 'up') ri -= 1;
      if (dir === 'right') ci += 1;
      if (dir === 'left') ci -= 1;
      if (ri < 0 || ri >= rows.length || ci < 0 || ci >= state.columns.length) return;
      var nextKey = state.columns[ci];
      state.selected = { rowId: rows[ri].id, key: nextKey };
      if (state.editing) {
        if (isEditable(nextKey) && nextKey !== 'statut') return beginEdit(rows[ri].id, nextKey);
      }
      renderGrid();
    }

    function commitEdit(row, key, value) {
      var prev = row[key];
      var write = null;
      if (key === 'name') {
        value = String(value).trim();
        if (!value || value === prev) return renderGrid();
        row.name = value;
        write = TT().saveName(t, row.id, value);
      } else if (key === 'desc') {
        if (value === prev) return renderGrid();
        row.desc = value;
        write = TT().saveDesc(t, row, value).then(function (full) { row.fullDesc = full; });
      } else if (key === 'category') {
        value = String(value).trim();
        if (value === prev) return renderGrid();
        row.category = value;
        write = TT().saveCategory(t, row.id, state.categoryFieldId, value);
      } else if (key === 'statut') {
        if (value === row.listId) return renderGrid();
        var list = listById(value);
        if (!list) return renderGrid();
        row.listId = list.id;
        row.statut = list.name;
        row.statutKey = list.category;
        row.statutColor = list.color;
        write = TT().moveCard(t, row.id, list.id, 'bottom').then(function () { return reload({ quiet: true }); });
      }
      renderGrid();
      if (!write) return;
      setStatus('Enregistrement…', 'busy');
      write.then(
        function () {
          setStatus('Enregistré', 'ok');
          schedulePush();
        },
        function (err) {
          row[key] = prev;
          renderGrid();
          fail(err);
        }
      );
    }

    function archiveRow(row) {
      TT().archiveCard(t, row.id).then(function () {
        state.rows = state.rows.filter(function (r) { return r.id !== row.id; });
        renderGrid();
        setStatus('« ' + (row.name || 'Carte') + ' » archivée', 'ok', 8000, {
          label: 'Annuler',
          run: function () {
            TT().unarchiveCard(t, row.id).then(function () {
              reload({ quiet: true });
              setStatus('Carte restaurée', 'ok');
            }, fail);
          },
        });
      }, fail);
    }

    function dropRow(dragId, targetRow, after) {
      state.dragId = null;
      var moved = findRow(dragId);
      if (!moved || moved.id === targetRow.id) return renderGrid();
      var siblings = state.rows
        .filter(function (r) { return r.listId === targetRow.listId && r.id !== moved.id; })
        .sort(function (a, b) { return a.pos - b.pos; });
      var idx = siblings.findIndex(function (r) { return r.id === targetRow.id; }) + (after ? 1 : 0);
      var pos = TM().dropPos(siblings, idx);
      var listChanged = moved.listId !== targetRow.listId;
      var list = listById(targetRow.listId);
      moved.pos = pos;
      moved.listId = targetRow.listId;
      if (list) {
        moved.statut = list.name;
        moved.statutKey = list.category;
        moved.statutColor = list.color;
      }
      state.rows = TM().orderByLists(state.rows, state.lists);
      renderGrid();
      setStatus('Enregistrement…', 'busy');
      var op = listChanged ? TT().moveCard(t, moved.id, targetRow.listId, pos) : TT().reorderCard(t, moved.id, pos);
      op.then(function () { setStatus('Ordre enregistré', 'ok'); schedulePush(); }, function (err) {
        fail(err);
        reload({ quiet: true });
      });
    }

    /* ── Right-click context menu ──────────────────────────────────── */
    function generalItems() {
      var connected = SH().isConnected(state.sheet);
      var items = [
        { icon: 'plus', label: 'Nouvelle carte', hint: state.lists[0] ? state.lists[0].name : '', action: function () {
          var a = document.getElementById('tbAdd');
          if (a) { a.scrollIntoView({ block: 'nearest' }); a.focus(); }
        } },
        { icon: 'refresh', label: 'Actualiser', action: function () { reload(); } },
        { icon: 'columns-3', label: 'Colonnes…', action: function () { state.menuOpen = true; renderMenu(); } },
      ];
      if (state.sort) items.push({ icon: 'arrows-sort', label: 'Retirer le tri (ordre du tableau)', action: function () { setSort(null); } });
      items.push({ sep: true });
      if (connected) {
        items.push({ icon: 'refresh-dot', label: 'Synchroniser avec le Sheet', action: syncNow });
        items.push({ icon: 'list-details', label: 'Voir les logs', action: function () { openDrawer('logs'); } });
        items.push({ icon: 'activity', label: 'Voir les activités', action: function () { openDrawer('activities'); } });
      }
      items.push({ icon: connected ? 'brand-google-drive' : 'plug-connected', label: connected ? 'Afficher dans Google Sheet' : 'Connecter Google Sheets', action: openSheet });
      return items;
    }

    function headerItems(key) {
      var spec = TM().COLUMNS[key];
      var idx = state.columns.indexOf(key);
      var sorted = state.sort && state.sort.key === key ? state.sort.dir : null;
      return [
        { title: spec.header },
        { icon: 'sort-ascending', label: 'Trier de A à Z', checked: sorted === 'asc', action: function () { setSort(key, 'asc'); } },
        { icon: 'sort-descending', label: 'Trier de Z à A', checked: sorted === 'desc', action: function () { setSort(key, 'desc'); } },
        { icon: 'arrows-sort', label: 'Retirer le tri', disabled: !sorted, action: function () { setSort(null); } },
        { sep: true },
        { icon: 'arrow-left', label: 'Déplacer à gauche', disabled: idx <= 0, action: function () { moveColumn(idx, -1); } },
        { icon: 'arrow-right', label: 'Déplacer à droite', disabled: idx >= state.columns.length - 1, action: function () { moveColumn(idx, 1); } },
        { icon: 'eye-off', label: 'Masquer la colonne', disabled: state.columns.length <= 1, action: function () { hideColumn(key); } },
        { icon: 'columns-3', label: 'Colonnes…', action: function () { state.menuOpen = true; renderMenu(); } },
      ];
    }

    function rowItems(row, key) {
      var spec = key ? TM().COLUMNS[key] : null;
      var editable = key && isEditable(key);
      var list = listById(row.listId);
      var items = [
        { title: row.name || 'Carte' },
        { icon: 'arrow-up-right', label: 'Ouvrir la carte', hint: 'double-clic', action: function () { openCard(row); } },
        { icon: 'brand-trello', label: 'Ouvrir dans Trello', disabled: !row.link, action: function () { window.open(row.link, '_blank', 'noopener'); } },
        { icon: 'link', label: 'Copier le lien de la carte', disabled: !row.link, action: function () { copyText(row.link); } },
      ];
      items.push({ sep: true });
      items.push({ title: 'Modifier' });
      [
        ['progress', 'chart-donut', 'Progrès…'],
        ['priority', 'flag', 'Priorité…'],
        ['due', 'calendar-event', 'Échéance…'],
        ['desc', 'align-left', 'Description…'],
      ].forEach(function (f) {
        items.push({ icon: f[1], label: f[2], action: function () { openFieldFor(row, f[0]); } });
      });
      if (key && spec.kind !== 'link') {
        items.push({ sep: true });
        if (editable && key !== 'statut') {
          items.push({ icon: 'pencil', label: 'Modifier « ' + spec.header + ' »', hint: 'F2', action: function () { beginEdit(row.id, key); } });
        }
        items.push({ icon: 'copy', label: 'Copier la valeur', action: function () { copyText(TM().cellText(row, key)); } });
        if (editable && key !== 'statut' && key !== 'name') {
          items.push({
            icon: 'clipboard',
            label: 'Coller',
            action: function () {
              if (!navigator.clipboard || !navigator.clipboard.readText) return setStatus('Collage non autorisé par le navigateur', 'error');
              navigator.clipboard.readText().then(function (txt) { commitEdit(row, key, txt); }, function () { setStatus('Collage refusé', 'error'); });
            },
          });
          items.push({ icon: 'eraser', label: 'Effacer la cellule', hint: 'Suppr', disabled: !row[key], action: function () { commitEdit(row, key, ''); } });
        }
      }
      if (!key || key === 'statut') {
        items.push({ sep: true });
        items.push({ title: 'Statut' });
        statutItems(row).forEach(function (i) { items.push(i); });
      }
      if (key) {
        var sorted = state.sort && state.sort.key === key ? state.sort.dir : null;
        items.push({ sep: true });
        items.push({ icon: 'sort-ascending', label: 'Trier « ' + spec.header + ' » de A à Z', checked: sorted === 'asc', action: function () { setSort(key, 'asc'); } });
        items.push({ icon: 'sort-descending', label: 'Trier « ' + spec.header + ' » de Z à A', checked: sorted === 'desc', action: function () { setSort(key, 'desc'); } });
        items.push({ icon: 'eye-off', label: 'Masquer la colonne', disabled: state.columns.length <= 1, action: function () { hideColumn(key); } });
      }
      items.push({ sep: true });
      items.push({
        icon: 'plus',
        label: 'Nouvelle carte dans « ' + (list ? list.name : 'la liste') + ' »',
        disabled: !list,
        action: function () {
          var name = 'Nouvelle carte';
          createIn(list, name, null);
        },
      });
      items.push({ icon: 'archive', label: 'Archiver la carte', danger: true, action: function () { archiveRow(row); } });
      return items;
    }

    shell.addEventListener('contextmenu', function (e) {
      if (e.target.closest('input,textarea')) return; // keep the native menu while typing
      e.preventDefault();
      var pt = { x: e.clientX, y: e.clientY };
      var th = e.target.closest('th[data-key]');
      var cell = e.target.closest('td[data-key]');
      var num = e.target.closest('td.tb-num[data-row]');
      var items;
      if (th) items = headerItems(th.getAttribute('data-key'));
      else if (cell) {
        var row = findRow(cell.getAttribute('data-row'));
        var key = cell.getAttribute('data-key');
        if (row) state.selected = { rowId: row.id, key: key };
        items = row ? rowItems(row, key) : generalItems();
        if (row) markSelected();
      } else if (num && findRow(num.getAttribute('data-row'))) {
        items = rowItems(findRow(num.getAttribute('data-row')), null);
      } else items = generalItems();
      MENU().show(pt, items, { minWidth: 230 });
    });

    function markSelected() {
      els.wrap.querySelectorAll('.is-selected').forEach(function (n) { n.classList.remove('is-selected'); });
      if (!state.selected) return;
      var sel = 'td[data-row="' + state.selected.rowId + '"][data-key="' + state.selected.key + '"]';
      var n = els.wrap.querySelector(sel);
      if (n) n.classList.add('is-selected');
    }

    /* ── Keyboard on the selected cell ─────────────────────────────── */
    shell.addEventListener('keydown', function (e) {
      if (state.editing || e.target.closest('input,textarea') || !state.selected) return;
      var row = findRow(state.selected.rowId);
      var key = state.selected.key;
      if (!row) return;
      var dirs = { ArrowDown: 'down', ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right' };
      if (dirs[e.key]) {
        e.preventDefault();
        moveSelection(row.id, key, dirs[e.key]);
      } else if (e.key === 'F2' || e.key === 'Enter') {
        e.preventDefault();
        if (key === 'statut') {
          var td = els.wrap.querySelector('td[data-row="' + row.id + '"][data-key="statut"]');
          if (td) openStatutMenu(row, td);
        } else if (POP_KIND[key] || isEditable(key)) beginEdit(row.id, key);
        else openCard(row);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && isEditable(key) && key !== 'name' && key !== 'statut') {
        e.preventDefault();
        commitEdit(row, key, '');
      }
    });

    /* ── Alerts (CRITICAL) + Logs / Activities drawer ─────────────── */
    var LEVEL_ICONS = { CRITICAL: 'alert-octagon', ERROR: 'circle-x', WARNING: 'alert-triangle', INFO: 'info-circle', DEBUG: 'bug', VERBOSE: 'message-2' };
    var LEVELS_UI = ['VERBOSE', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];
    var journal = { logs: [], activities: [], level: 'INFO', minLevel: 'INFO', error: '', loading: false };
    var drawerTimer = null;

    function loadAlerts() {
      if (!SH().isConnected(state.sheet)) return Promise.resolve();
      return SH().info(state.sheet).then(function (res) {
        if (!res.ok) return;
        state.alerts = (res.data && res.data.alerts) || [];
        journal.level = (res.data && res.data.logLevel) || 'INFO';
        state.sheetTheme = (res.data && res.data.sheetTheme) || 'light';
        renderAlerts();
        var b = els.bar.querySelector('.tb-badge');
        if (b) b.hidden = !state.alerts.length;
      });
    }

    function renderAlerts() {
      els.alert.innerHTML = '';
      if (!state.alerts.length) {
        els.alert.hidden = true;
        return;
      }
      els.alert.hidden = false;
      var a = state.alerts[0];
      var more = state.alerts.length > 1 ? ' (+' + (state.alerts.length - 1) + ' autre' + (state.alerts.length > 2 ? 's' : '') + ')' : '';
      els.alert.appendChild(icon('alert-octagon', 'tb-alert-icon'));
      els.alert.appendChild(
        h('div', { class: 'tb-alert-text' }, [
          h('strong', { text: 'Quelque chose s’est produit dans le Google Sheet — j’ai dû restaurer.' + more }),
          h('div', { text: (a['Message'] || '') + (a['Utilisateur'] ? '  —  ' + a['Utilisateur'] : '') + '  ·  ' + (a['Horodatage'] || '') }),
        ])
      );
      els.alert.appendChild(btn('list-details', 'Voir les logs', { onclick: function () { openDrawer('logs', 'CRITICAL'); } }));
      els.alert.appendChild(
        btn('check', 'Compris', {
          onclick: function () {
            state.alerts = [];
            renderAlerts();
            SH().ackAlerts(state.sheet).then(function () { renderBar(); });
          },
        })
      );
    }

    function openDrawer(kind, minLevel, force) {
      state.drawer = state.drawer === kind && !minLevel && !force ? null : kind;
      if (minLevel) journal.minLevel = minLevel;
      renderDrawer();
      clearInterval(drawerTimer);
      if (state.drawer) {
        refreshDrawer();
        drawerTimer = setInterval(refreshDrawer, 15000);
      }
    }

    function refreshDrawer() {
      if (!state.drawer || !SH().isConnected(state.sheet)) return Promise.resolve();
      journal.loading = true;
      var call = state.drawer === 'logs' ? SH().logs(state.sheet, { limit: 300, level: journal.minLevel }) : SH().activities(state.sheet, { limit: 300 });
      return call.then(function (res) {
        journal.loading = false;
        if (!res.ok) journal.error = res.detail || res.reason;
        else {
          journal.error = '';
          if (state.drawer === 'logs') journal.logs = res.data.logs || [];
          else journal.activities = res.data.activities || [];
        }
        renderDrawer();
      });
    }

    function shorten(v) {
      v = String(v == null ? '' : v).replace(/\s+/g, ' ');
      return v.length > 90 ? v.slice(0, 89) + '…' : v;
    }

    function beforeAfter(r) {
      var b = r['Avant'];
      var a = r['Après'];
      if (!b && !a) return '';
      var box = h('span', { class: 'tb-diff' });
      if (b) box.appendChild(h('span', { class: 'tb-diff-old', title: b, text: shorten(b) }));
      if (b && a) box.appendChild(icon('arrow-right', 'tb-diff-arrow'));
      if (a) box.appendChild(h('span', { class: 'tb-diff-new', title: a, text: shorten(a) }));
      return box;
    }

    function initials(name) {
      return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join('') || '?';
    }

    function renderDrawer() {
      var d = els.drawer;
      d.innerHTML = '';
      d.hidden = !state.drawer;
      if (!state.drawer) return;
      var isLogs = state.drawer === 'logs';
      var head = h('div', { class: 'tb-drawer-head' }, [
        h('div', { class: 'tb-tabs' }, [
          h('button', { class: 'tb-tab' + (isLogs ? ' is-on' : ''), onclick: function () { openDrawer('logs', journal.minLevel, true); } }, [icon('list-details'), h('span', { text: 'Logs' })]),
          h('button', { class: 'tb-tab' + (!isLogs ? ' is-on' : ''), onclick: function () { openDrawer('activities', null, true); } }, [icon('activity'), h('span', { text: 'Activités' })]),
        ]),
      ]);
      if (isLogs) {
        var minSel = h('select', { class: 'tb-select', title: 'Niveau minimum affiché', onchange: function (e) { journal.minLevel = e.target.value; refreshDrawer(); } });
        LEVELS_UI.forEach(function (l) { minSel.appendChild(h('option', { value: l, text: 'Afficher ≥ ' + l, selected: l === journal.minLevel })); });
        var recSel = h('select', {
          class: 'tb-select',
          title: 'Niveau enregistré dans le Sheet (Logs)',
          onchange: function (e) {
            SH().setLogLevel(state.sheet, e.target.value).then(function (r) {
              if (r.ok) { journal.level = e.target.value; setStatus('Niveau enregistré : ' + e.target.value, 'ok'); }
              else setStatus('Sheet : ' + (r.detail || r.reason), 'error');
            });
          },
        });
        LEVELS_UI.forEach(function (l) { recSel.appendChild(h('option', { value: l, text: 'Enregistrer ≥ ' + l, selected: l === journal.level })); });
        head.appendChild(minSel);
        head.appendChild(recSel);
      }
      head.appendChild(h('span', { class: 'tb-spacer' }));
      head.appendChild(btn('refresh', null, { title: 'Actualiser', onclick: refreshDrawer }));
      head.appendChild(btn('brand-google-drive', null, { title: 'Ouvrir l’onglet dans Google Sheet', onclick: openSheet }));
      head.appendChild(btn('chevron-down', null, { title: 'Fermer', onclick: function () { state.drawer = null; clearInterval(drawerTimer); renderDrawer(); } }));
      d.appendChild(head);

      var body = h('div', { class: 'tb-drawer-body' });
      if (journal.error) body.appendChild(h('div', { class: 'tb-loading', text: 'Impossible de charger : ' + journal.error }));
      var rows = isLogs ? journal.logs : journal.activities;
      if (!rows.length && !journal.error) body.appendChild(h('div', { class: 'tb-loading', text: journal.loading ? 'Chargement…' : isLogs ? 'Aucune entrée à ce niveau.' : 'Aucune activité pour le moment.' }));
      var table = h('table', { class: 'tb-jgrid' });
      if (rows.length) {
        table.appendChild(
          h('thead', {}, [h('tr', {}, (isLogs ? ['Heure', 'Niveau', 'Message', 'Carte', 'Champ', 'Changement', 'Utilisateur'] : ['Heure', 'Utilisateur', 'Origine', 'Action', 'Carte', 'Champ', 'Changement']).map(function (t2) { return h('th', { text: t2 }); }))])
        );
        var tb = h('tbody');
        rows.forEach(function (r) {
          var tr = h('tr');
          if (isLogs) {
            var lv = r['Niveau'];
            tr.className = 'lv-row lv-row-' + lv;
            tr.appendChild(h('td', { class: 'tb-nowrap', text: r['Horodatage'] }));
            tr.appendChild(h('td', {}, [h('span', { class: 'tb-lv lv-' + lv }, [icon(LEVEL_ICONS[lv] || 'point'), h('span', { text: lv })])]));
            tr.appendChild(h('td', { class: 'tb-msg', title: r['Code'], text: r['Message'] }));
            tr.appendChild(h('td', { text: r['Carte'] }));
            tr.appendChild(h('td', { text: r['Champ'] }));
            tr.appendChild(h('td', {}, [beforeAfter(r)]));
            tr.appendChild(h('td', { text: r['Utilisateur'] }));
          } else {
            var fromTrello = r['Origine'] === 'Trello';
            tr.appendChild(h('td', { class: 'tb-nowrap', text: r['Horodatage'] }));
            tr.appendChild(h('td', {}, [h('span', { class: 'tb-user' }, [h('span', { class: 'tb-avatar', text: initials(r['Utilisateur']) }), h('span', { text: r['Utilisateur'] })])]));
            tr.appendChild(h('td', {}, [h('span', { class: 'tb-origin' }, [icon(fromTrello ? 'brand-trello' : 'table'), h('span', { text: r['Origine'] })])]));
            tr.appendChild(h('td', { text: r['Action'] }));
            tr.appendChild(h('td', { text: r['Carte'] }));
            tr.appendChild(h('td', { text: r['Champ'] }));
            tr.appendChild(h('td', {}, [beforeAfter(r)]));
          }
          tb.appendChild(tr);
        });
        table.appendChild(tb);
        body.appendChild(table);
      }
      d.appendChild(body);
    }

    /* ── Assistant dock (project-scope chat under the table) ──────── */
    var DOCK_KEY = 'tb.dockHeight';
    var dock = { open: false, mounted: false, height: 340, poll: null, body: null };
    try {
      var savedH = parseInt(global.localStorage.getItem(DOCK_KEY), 10);
      if (savedH >= 160) dock.height = savedH;
    } catch (e) { /* storage unavailable */ }

    function maxDockHeight() {
      return Math.max(180, Math.round(shell.clientHeight * 0.75));
    }

    function setDockHeight(px, persist) {
      dock.height = Math.max(160, Math.min(maxDockHeight(), Math.round(px)));
      if (dock.body) dock.body.style.height = dock.height + 'px';
      if (persist) {
        try { global.localStorage.setItem(DOCK_KEY, String(dock.height)); } catch (e) { /* ignore */ }
      }
    }

    function toggleDock(force) {
      dock.open = typeof force === 'boolean' ? force : !dock.open;
      renderDock();
      if (dock.open && !dock.mounted && global.AssistantMount) {
        dock.mounted = true;
        var mountEl = dock.body.querySelector('#assistantMount');
        global.AssistantMount.mount(mountEl, t, { resizeBody: false, focusComposer: true }).catch(function (err) {
          dock.mounted = false;
          mountEl.textContent = '';
          mountEl.appendChild(h('div', { class: 'tb-loading', text: 'Assistant indisponible : ' + (err && err.message) }));
        });
      }
      clearInterval(dock.poll);
      dock.poll = null;
      if (dock.open) {
        // The assistant can edit cards; keep the grid current while it is open.
        dock.poll = setInterval(function () {
          if (state.editing || (global.CardFields && global.CardFields.isOpen())) return;
          reload({ quiet: true });
        }, 20000);
      } else if (dock.mounted) reload({ quiet: true });
    }

    function renderDock() {
      var keep = dock.body;
      els.dock.innerHTML = '';
      els.dock.classList.toggle('is-open', dock.open);
      var grip = h('div', {
        class: 'tb-dock-grip',
        title: 'Glisser pour redimensionner',
        onpointerdown: function (e) {
          if (!dock.open) return;
          e.preventDefault();
          var startY = e.clientY;
          var startH = dock.height;
          function move(ev) { setDockHeight(startH + (startY - ev.clientY), false); }
          function up() {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            setDockHeight(dock.height, true);
          }
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
        },
      });
      var bar = h('div', {
        class: 'tb-dock-bar',
        role: 'button',
        tabindex: '0',
        'aria-expanded': dock.open ? 'true' : 'false',
        onclick: function () { toggleDock(); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDock(); }
        },
      }, [
        icon('sparkles'),
        h('strong', { text: 'Assistant' }),
        h('span', { class: 'tb-dock-hint', text: 'Posez une question ou demandez une modification sur tout le projet…' }),
        h('span', { class: 'tb-spacer' }),
        icon(dock.open ? 'chevron-down' : 'chevron-up'),
      ]);
      els.dock.appendChild(grip);
      els.dock.appendChild(bar);
      if (dock.open) {
        if (!keep) {
          keep = h('div', { class: 'tb-dock-body tp-page--priority tp-page--assistant' }, [h('div', { id: 'assistantMount' })]);
        }
        dock.body = keep;
        keep.style.height = dock.height + 'px';
        els.dock.appendChild(keep);
      }
    }

    /* ── Loading ───────────────────────────────────────────────────── */
    function reload(opts) {
      if (!opts || !opts.quiet) els.wrap.innerHTML = skeletonRows();
      return Promise.all([
        TT().load(t),
        TT().getTableSettings(t),
        SH().getSettings(t),
        global.PriorityTrello.isRestAuthorized(t).catch(function () {
          return false;
        }),
      ])
        .then(function (res) {
          var data = res[0];
          state.lists = data.lists;
          state.rows = data.rows;
          state.categoryFieldId = data.categoryFieldId;
          state.categoryAvailable = data.categoryAvailable;
          state.columns = res[1].columns;
          state.widths = res[1].widths || {};
          state.sheet = res[2];
          state.authOk = !!res[3];
          renderBanner();
          renderGrid();
          schedulePush();
          loadAlerts();
        })
        .catch(function (err) {
          els.wrap.innerHTML = '';
          els.wrap.appendChild(h('div', { class: 'tb-loading', text: 'Impossible de charger le tableau : ' + (err && err.message) }));
        });
    }

    document.addEventListener('click', function () {
      if (state.menuOpen) {
        state.menuOpen = false;
        renderMenu();
      }
    });

    renderBar();
    renderDock();
    setInterval(loadAlerts, 30000);
    return reload();
  }

  global.TableUI = { mount: mount, skeletonRows: skeletonRows };
})(typeof window !== 'undefined' ? window : this);
