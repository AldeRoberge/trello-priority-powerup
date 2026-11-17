/**
 * table-ui: mount() multi-selection of rows (between the grid part and the menu/events part).
 * Shift+click picks a range, Ctrl/Cmd+click toggles one row, a click on the row number toggles it,
 * Escape clears. A compact bar in the toolbar offers Fusionner (AI merge, CardMerge), Terminer, Archiver.
 * State: M.state.multi (row id -> true), M.state.multiAnchor, M.state.order (row ids as drawn, set by renderGrid).
 * Order and shared names: see table-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.TableUiParts = global.TableUiParts || {});
  var P = (global.TableUiPartsMountMount = global.TableUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    /** Picked rows in the order the table shows them (a row hidden by a filter is not counted). */
    M.pickedRows = function pickedRows() {
      var multi = M.state.multi || {};
      return (M.state.order || []).filter(function (id) { return multi[id]; }).map(M.findRow).filter(Boolean);
    };
    M.clearPicks = function clearPicks() {
      M.state.multi = Object.create(null);
      M.state.multiAnchor = '';
      M.paintPicks();
    };
    M.paintPicks = function paintPicks() {
      var multi = M.state.multi || {};
      M.els.wrap.querySelectorAll('tbody tr[data-id]').forEach(function (tr) {
        tr.classList.toggle('is-picked', !!multi[tr.getAttribute('data-id')]);
      });
      M.paintBulk();
    };
    M.pickClick = function pickClick(row, e) {
      var id = row.id;
      var keep = e.ctrlKey || e.metaKey;
      if (e.shiftKey) {
        var order = M.state.order || [];
        var anchor = M.state.multiAnchor || (M.state.selected && M.state.selected.rowId) || id;
        var a = order.indexOf(anchor);
        var b = order.indexOf(id);
        var next = keep ? Object.assign(Object.create(null), M.state.multi) : Object.create(null);
        if (a < 0 || b < 0) next[id] = true;
        else order.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function (rid) { next[rid] = true; });
        M.state.multi = next;
        if (!M.state.multiAnchor) M.state.multiAnchor = anchor;
      } else {
        if (M.state.multi[id]) delete M.state.multi[id];
        else M.state.multi[id] = true;
        M.state.multiAnchor = id;
      }
      M.paintPicks();
    };
    /** The toolbar group for the current selection, or null without one. */
    M.bulkNode = function bulkNode() {
      var n = M.pickedRows().length;
      if (!n) return null;
      var merge = S.btn('arrows-join', 'Fusionner', { title: 'Fusionner les cartes choisies avec l’IA', onclick: M.mergePicked });
      merge.disabled = n < 2;
      return S.h('span', { class: 'tb-bulk', role: 'group', 'aria-label': 'Sélection' }, [
        S.h('span', { class: 'tb-bulk-n', text: n + (n > 1 ? ' sélectionnées' : ' sélectionnée') }),
        merge,
        S.btn('circle-check', null, { title: 'Terminer les cartes choisies', onclick: M.completePicked }),
        S.btn('archive', null, { title: 'Archiver les cartes choisies', onclick: M.archivePicked }),
        S.btn('x', null, { title: 'Effacer la sélection', onclick: M.clearPicks }),
      ]);
    };
    M.paintBulk = function paintBulk() {
      if (!M.els.bar) return;
      var old = M.els.bar.querySelector('.tb-bulk');
      var next = M.bulkNode();
      if (old && next) old.parentNode.replaceChild(next, old);
      else if (old) old.parentNode.removeChild(old);
      else if (next) {
        var anchor = M.els.bar.querySelector('.tb-status');
        if (anchor) M.els.bar.insertBefore(next, anchor);
        else M.els.bar.appendChild(next);
      }
    };
    M.mergePicked = function mergePicked() {
      var rows = M.pickedRows();
      if (rows.length < 2 || M.state.merging) return;
      if (!global.CardMerge) return M.setStatus('Fusion indisponible', 'error');
      M.state.merging = true;
      M.setStatus('Fusion de ' + rows.length + ' cartes…', 'busy');
      global.CardMerge.merge(M.t, rows).then(function (res) {
        M.clearPicks();
        M.record(res.entry); // offers its own Annuler toast
        M.setStatus(res.source === 'ai' ? 'Cartes fusionnées' : 'Cartes fusionnées (sans IA)', 'ok');
        M.schedulePush();
      }, function (err) {
        if (err && err.partial) M.record(err.partial.entry);
        M.fail(err);
      }).then(function () {
        M.state.merging = false;
        return M.reload({ quiet: true });
      });
    };
    M.completePicked = function completePicked() {
      var rows = M.pickedRows();
      if (!rows.length) return;
      M.clearPicks();
      M.saveSectionProgress({ name: rows.length + (rows.length > 1 ? ' cartes' : ' carte'), rows: rows }, 100);
    };
    M.archivePicked = function archivePicked() {
      var rows = M.pickedRows();
      if (!rows.length) return;
      var entries = [];
      var chain = Promise.resolve();
      rows.forEach(function (row) {
        chain = chain.then(function () {
          return S.TT().archiveCard(M.t, row.id).then(function () {
            M.state.rows = M.state.rows.filter(function (r) { return r.id !== row.id; });
            entries.push(M.record({ type: 'archive', targetId: row.id, title: row.name, after: row.statut || '', quiet: true }));
          });
        });
      });
      chain.then(null, M.fail).then(function () {
        M.clearPicks();
        M.renderGrid();
        if (entries.length && M.HP) M.HP.toast(entries, entries.length + (entries.length > 1 ? ' cartes archivées' : ' carte archivée'));
      });
    };
    },
    run: function (M) {
    M.state.multi = Object.create(null);
    M.state.multiAnchor = '';
    M.state.order = [];
    M.state.merging = false;
    M.els.wrap.addEventListener('mousedown', function (e) {
      if (e.shiftKey && e.target.closest('tr[data-id]')) e.preventDefault(); // no text selection while picking a range
    }, true);
    M.els.wrap.addEventListener('click', function (e) {
      var picking = e.shiftKey || e.ctrlKey || e.metaKey;
      var onNumber = !!e.target.closest('.tb-rownum');
      if (!picking && !onNumber) return;
      var tr = e.target.closest('tr[data-id]');
      if (!tr || e.target.closest('a, input, textarea, select')) return;
      if (!picking && e.target.closest('.tb-rowbtn, .tb-handle')) return;
      var row = M.findRow(tr.getAttribute('data-id'));
      if (!row) return;
      e.preventDefault();
      e.stopPropagation(); // before the cell's own click (select, edit, menu)
      M.pickClick(row, e);
    }, true);
    M.shell.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || e.target.closest('input,textarea') || !M.pickedRows().length) return;
      e.stopPropagation(); // keeps the task panel open
      M.clearPicks();
    });
    }
  });
})(typeof window !== 'undefined' ? window : this);
