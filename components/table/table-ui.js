/*
 * Role: UI of the Table view — a spreadsheet-like grid of the board's cards.
 * Inline cell editing (Objet, Statut, Catégorie, Description), sortable headers, filter,
 * drag-to-reorder rows (dropping into another list changes the Statut), column picker shared
 * with the Google Sheet, "Show in Google Sheet". Data + writes: TableTrello; pure helpers: TableModel.
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

  function mount(root, t) {
    var state = {
      lists: [],
      rows: [],
      columns: TM().DEFAULT_COLUMNS.slice(),
      sort: null, // {key, dir}
      filter: '',
      categoryFieldId: null,
      categoryAvailable: false,
      sheet: null, // SheetsTrello settings
      authOk: true,
      editing: null, // {rowId, key}
      selected: null, // {rowId, key}
      dragId: null,
      status: '',
      statusKind: '',
      menuOpen: false,
    };
    var pushTimer = null;
    var statusTimer = null;

    root.innerHTML = '';
    var els = {
      bar: h('div', { class: 'tb-bar' }),
      banner: h('div', { class: 'tb-banner', hidden: true }),
      wrap: h('div', { class: 'tb-wrap' }),
    };
    root.appendChild(h('div', { class: 'tb-root' }, [els.bar, els.banner, els.wrap]));

    function setStatus(msg, kind, keepMs) {
      state.status = msg || '';
      state.statusKind = kind || '';
      var s = els.bar.querySelector('.tb-status');
      if (s) {
        s.textContent = state.status;
        s.className = 'tb-status' + (kind ? ' is-' + kind : '');
      }
      clearTimeout(statusTimer);
      if (msg && kind !== 'error') {
        statusTimer = setTimeout(function () {
          setStatus('', '');
        }, keepMs || 2500);
      }
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
        TT().pushToSheet(t, state.rows).then(function (res) {
          if (res && res.ok) setStatus('Google Sheet à jour', 'ok');
          else if (res && res.reason !== 'not-connected') setStatus('Sheet : ' + (res.detail || res.reason), 'error');
        });
      }, 800);
    }

    /* ── Rendering ─────────────────────────────────────────────────── */
    function visibleRows() {
      var rows = TM().filterRows(state.rows, state.filter);
      if (state.sort) rows = TM().sortRows(rows, state.sort.key, state.sort.dir);
      return rows;
    }

    function canReorder() {
      return !state.sort && !state.filter;
    }

    function renderBanner() {
      els.banner.innerHTML = '';
      if (!state.authOk) {
        els.banner.hidden = false;
        els.banner.appendChild(h('span', { text: 'Trello doit être autorisé pour modifier les cartes depuis la table. ' }));
        els.banner.appendChild(
          h('button', {
            class: 'tb-btn tb-btn--primary',
            text: 'Autoriser Trello',
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
          renderGrid();
        },
      });
      var colsBtn = h('button', {
        class: 'tb-btn',
        text: 'Colonnes',
        onclick: function (e) {
          e.stopPropagation();
          state.menuOpen = !state.menuOpen;
          renderMenu();
        },
      });
      var sheetBtn = h('button', {
        class: 'tb-btn tb-btn--primary',
        text: connected ? 'Afficher dans Google Sheet' : 'Connecter Google Sheets',
        onclick: function () {
          if (connected && state.sheet.sheetUrl) window.open(state.sheet.sheetUrl, '_blank', 'noopener');
          else openSheetSettings();
        },
      });
      var children = [
        h('strong', { class: 'tb-title', text: 'Table' }),
        filter,
        h('button', { class: 'tb-btn', text: 'Actualiser', onclick: function () { reload(); } }),
        colsBtn,
      ];
      if (state.sort) {
        children.push(
          h('button', {
            class: 'tb-btn',
            text: 'Ordre du tableau',
            title: 'Retirer le tri',
            onclick: function () {
              state.sort = null;
              renderGrid();
            },
          })
        );
      }
      children.push(h('span', { class: 'tb-status' + (state.statusKind ? ' is-' + state.statusKind : ''), text: state.status }));
      children.push(h('span', { class: 'tb-spacer' }));
      if (connected) {
        children.push(
          h('button', {
            class: 'tb-btn',
            text: 'Synchroniser',
            title: 'Forcer une synchronisation Trello ⇄ Sheet',
            onclick: function () {
              setStatus('Synchronisation…');
              TT()
                .pushToSheet(t, state.rows)
                .then(function () {
                  return SH().syncNow(state.sheet);
                })
                .then(function (res) {
                  if (res.ok) {
                    setStatus('Synchronisé', 'ok');
                    reload({ quiet: true });
                  } else setStatus('Sheet : ' + (res.detail || res.reason), 'error');
                });
            },
          })
        );
      }
      children.push(sheetBtn);
      children.forEach(function (c) {
        els.bar.appendChild(c);
      });
      els.bar.appendChild(h('div', { class: 'tb-menu', hidden: !state.menuOpen, id: 'tbMenu' }));
      renderMenu();
    }

    function renderMenu() {
      var menu = els.bar.querySelector('#tbMenu');
      if (!menu) return;
      menu.hidden = !state.menuOpen;
      if (!state.menuOpen) return;
      menu.innerHTML = '';
      menu.addEventListener('click', function (e) {
        e.stopPropagation();
      });
      menu.appendChild(h('div', { class: 'tb-menu-title', text: 'Colonnes (aussi celles du Google Sheet)' }));
      var all = Object.keys(TM().COLUMNS);
      var ordered = state.columns.concat(
        all.filter(function (k) {
          return state.columns.indexOf(k) === -1;
        })
      );
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
              ' ' + TM().COLUMNS[key].header,
            ]),
            on
              ? h('span', { class: 'tb-menu-move' }, [
                  h('button', { text: '↑', disabled: idx === 0, onclick: function () { moveColumn(idx, -1); } }),
                  h('button', { text: '↓', disabled: idx === state.columns.length - 1, onclick: function () { moveColumn(idx, 1); } }),
                ])
              : null,
          ])
        );
      });
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

    function heatStyle(key, row) {
      var spec = TM().COLUMNS[key];
      var v = row[key];
      if (!spec.heat || typeof v !== 'number') return '';
      var frac = Math.max(0, Math.min(1, v / spec.heat));
      return 'background:rgba(52,187,140,' + (0.08 + frac * 0.5).toFixed(2) + ')';
    }

    function renderGrid() {
      renderBar();
      var rows = visibleRows();
      var table = h('table', { class: 'tb-grid' });
      var head = h('tr', {}, [h('th', { class: 'tb-corner' })]);
      state.columns.forEach(function (key) {
        var spec = TM().COLUMNS[key];
        var arrow = state.sort && state.sort.key === key ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
        head.appendChild(
          h('th', {
            style: 'min-width:' + spec.width + 'px;width:' + spec.width + 'px',
            title: 'Trier',
            onclick: function () {
              if (state.sort && state.sort.key === key) {
                state.sort = state.sort.dir === 'asc' ? { key: key, dir: 'desc' } : null;
              } else state.sort = { key: key, dir: 'asc' };
              renderGrid();
            },
            text: spec.header + arrow,
          })
        );
      });
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
          var after = e.offsetY >= tr.offsetHeight / 2;
          dropRow(state.dragId, row, after);
        });

        var num = h('td', { class: 'tb-num' }, [
          h('span', {
            class: 'tb-handle',
            text: '⋮⋮',
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
          }),
          h('span', { text: String(i + 1) }),
          h('button', {
            class: 'tb-rowbtn',
            text: '↗',
            title: 'Ouvrir la carte',
            onclick: function () { openCard(row); },
          }),
          h('button', {
            class: 'tb-rowbtn tb-rowbtn--danger',
            text: '✕',
            title: 'Archiver la carte',
            onclick: function (e) {
              var btn = e.currentTarget;
              if (btn.getAttribute('data-armed') !== '1') {
                btn.setAttribute('data-armed', '1');
                btn.textContent = 'Archiver ?';
                setTimeout(function () {
                  btn.setAttribute('data-armed', '0');
                  btn.textContent = '✕';
                }, 2500);
                return;
              }
              TT().archiveCard(t, row.id).then(function () {
                state.rows = state.rows.filter(function (r) { return r.id !== row.id; });
                renderGrid();
                setStatus('Carte archivée', 'ok');
              }, fail);
            },
          }),
        ]);
        tr.appendChild(num);

        state.columns.forEach(function (key) {
          tr.appendChild(renderCell(row, key));
        });
        body.appendChild(tr);
      });

      var addInput = h('input', {
        class: 'tb-add',
        placeholder: '＋ Nouvelle carte (Entrée)',
        onkeydown: function (e) {
          if (e.key !== 'Enter') return;
          var name = e.target.value.trim();
          if (!name || !state.lists.length) return;
          e.target.disabled = true;
          TT()
            .createRow(t, name, state.lists[0].id)
            .then(function () {
              reload({ quiet: true });
              setStatus('Carte créée dans « ' + state.lists[0].name + ' »', 'ok');
            }, function (err) {
              e.target.disabled = false;
              fail(err);
            });
        },
      });
      body.appendChild(
        h('tr', { class: 'tb-add-row' }, [
          h('td', { class: 'tb-num' }),
          h('td', { colspan: String(state.columns.length) }, [addInput]),
        ])
      );
      table.appendChild(body);
      els.wrap.innerHTML = '';
      els.wrap.appendChild(table);
    }

    function renderCell(row, key) {
      var spec = TM().COLUMNS[key];
      var isEditing = state.editing && state.editing.rowId === row.id && state.editing.key === key;
      var editable = spec.editable && !(key === 'category' && !state.categoryAvailable);
      var selected = state.selected && state.selected.rowId === row.id && state.selected.key === key;
      var td = h('td', {
        class: 'tb-cell tb-cell--' + spec.kind + (editable ? '' : ' is-ro') + (selected ? ' is-selected' : ''),
        style: heatStyle(key, row) || null,
      });

      if (isEditing) {
        td.classList.add('is-editing');
        td.appendChild(editor(row, key, spec));
        return td;
      }
      if (spec.kind === 'link') {
        if (row.link) td.appendChild(h('a', { href: row.link, target: '_blank', rel: 'noopener', text: 'Ouvrir' }));
        return td;
      }
      td.textContent = TM().cellText(row, key);
      td.addEventListener('click', function () {
        state.selected = { rowId: row.id, key: key };
        if (editable) beginEdit(row.id, key);
        else renderGrid();
      });
      return td;
    }

    function beginEdit(rowId, key) {
      state.editing = { rowId: rowId, key: key };
      renderGrid();
      var input = els.wrap.querySelector('.is-editing input, .is-editing textarea, .is-editing select');
      if (input) {
        input.focus();
        if (input.select && input.tagName !== 'SELECT') input.select();
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
      if (spec.kind === 'list') {
        var sel = h('select', {
          class: 'tb-input',
          onchange: function (e) { finish(true, e.target.value); },
          onblur: function () { finish(false); },
          onkeydown: function (e) { if (e.key === 'Escape') finish(false); },
        });
        state.lists.forEach(function (l) {
          sel.appendChild(h('option', { value: l.id, text: l.name, selected: l.id === row.listId }));
        });
        return sel;
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
      if (dir === 'right') ci += 1;
      if (dir === 'left') ci -= 1;
      if (ri < 0 || ri >= rows.length || ci < 0 || ci >= state.columns.length) return;
      var nextKey = state.columns[ci];
      var spec = TM().COLUMNS[nextKey];
      state.selected = { rowId: rows[ri].id, key: nextKey };
      if (spec.editable && !(nextKey === 'category' && !state.categoryAvailable)) beginEdit(rows[ri].id, nextKey);
      else renderGrid();
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
        var list = state.lists.filter(function (l) { return l.id === value; })[0];
        if (!list) return renderGrid();
        row.listId = list.id;
        row.statut = list.name;
        write = TT().moveCard(t, row.id, list.id, 'bottom').then(function () { return reload({ quiet: true }); });
      }
      renderGrid();
      if (!write) return;
      setStatus('Enregistrement…');
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

    function dropRow(dragId, targetRow, after) {
      state.dragId = null;
      var moved = state.rows.filter(function (r) { return r.id === dragId; })[0];
      if (!moved || moved.id === targetRow.id) return renderGrid();
      var siblings = state.rows
        .filter(function (r) { return r.listId === targetRow.listId && r.id !== moved.id; })
        .sort(function (a, b) { return a.pos - b.pos; });
      var idx = siblings.findIndex(function (r) { return r.id === targetRow.id; }) + (after ? 1 : 0);
      var pos = TM().dropPos(siblings, idx);
      var listChanged = moved.listId !== targetRow.listId;
      var list = state.lists.filter(function (l) { return l.id === targetRow.listId; })[0];
      moved.pos = pos;
      moved.listId = targetRow.listId;
      if (list) moved.statut = list.name;
      state.rows = TM().orderByLists(state.rows, state.lists);
      renderGrid();
      setStatus('Enregistrement…');
      var op = listChanged ? TT().moveCard(t, moved.id, targetRow.listId, pos) : TT().reorderCard(t, moved.id, pos);
      op.then(function () { setStatus('Ordre enregistré', 'ok'); schedulePush(); }, function (err) {
        fail(err);
        reload({ quiet: true });
      });
    }

    /* ── Loading ───────────────────────────────────────────────────── */
    function reload(opts) {
      if (!opts || !opts.quiet) els.wrap.innerHTML = '<div class="tb-loading">Chargement…</div>';
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
          state.sheet = res[2];
          state.authOk = !!res[3];
          renderBanner();
          renderGrid();
          schedulePush();
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
    return reload();
  }

  global.TableUI = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
