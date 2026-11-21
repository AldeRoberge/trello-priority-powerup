/*
 * The table editor's commands, shared by the inline table bar and the sheet view.
 * run(model, id, sel, arg) changes the model and returns { sel } (the selection to show next),
 * or null when the command does not apply (header row, last column...). No DOM here.
 * Exposes window.DocsTableActions.
 */
(function (global) {
  'use strict';

  function T() { return global.DocsTableModel; }

  /** Menu groups. Labels are the whole copy of the editor: short French. */
  var MENUS = {
    row: [
      { id: 'row-above', icon: 'row-insert-top', label: 'Insérer au-dessus' },
      { id: 'row-below', icon: 'row-insert-bottom', label: 'Insérer en dessous' },
      { id: 'row-dup', icon: 'copy', label: 'Dupliquer' },
      { id: 'row-up', icon: 'arrow-up', label: 'Monter' },
      { id: 'row-down', icon: 'arrow-down', label: 'Descendre' },
      { id: 'row-del', icon: 'row-remove', label: 'Supprimer' },
    ],
    col: [
      { id: 'col-left', icon: 'column-insert-left', label: 'Insérer à gauche' },
      { id: 'col-right', icon: 'column-insert-right', label: 'Insérer à droite' },
      { id: 'col-dup', icon: 'copy', label: 'Dupliquer' },
      { id: 'col-mvleft', icon: 'arrow-left', label: 'Déplacer à gauche' },
      { id: 'col-mvright', icon: 'arrow-right', label: 'Déplacer à droite' },
      { id: 'sort-asc', icon: 'sort-ascending', label: 'Trier A → Z' },
      { id: 'sort-desc', icon: 'sort-descending', label: 'Trier Z → A' },
      { id: 'align-left', icon: 'align-left', label: 'Aligner à gauche' },
      { id: 'align-center', icon: 'align-center', label: 'Centrer' },
      { id: 'align-right', icon: 'align-right', label: 'Aligner à droite' },
      { id: 'widths-reset', icon: 'layout-columns', label: 'Largeurs égales' },
      { id: 'col-del', icon: 'column-remove', label: 'Supprimer' },
    ],
    fmt: [
      { id: 'fmt-auto', icon: '123', label: 'Automatique' },
      { id: 'fmt-num', icon: 'decimal', label: 'Nombre 1 234,50' },
      { id: 'fmt-pct', icon: 'percentage', label: 'Pourcentage' },
      { id: 'fmt-cur', icon: 'currency-dollar', label: 'Devise' },
    ],
    sum: [
      { id: 'sum', icon: 'sum', label: 'Somme' },
      { id: 'avg', icon: 'math-avg', label: 'Moyenne' },
      { id: 'min', icon: 'arrow-bar-to-down', label: 'Minimum' },
      { id: 'max', icon: 'arrow-bar-to-up', label: 'Maximum' },
      { id: 'count', icon: 'hash', label: 'Nombre' },
    ],
  };

  var SUM_FN = { sum: 'SUM', avg: 'AVERAGE', min: 'MIN', max: 'MAX', count: 'COUNT' };

  function single(sel) {
    return { r1: sel.r1, c1: sel.c1, r2: sel.r1, c2: sel.c1 };
  }

  function run(m, id, sel, arg) {
    var t = T();
    var x = t.clampRect(m, sel);
    var ok = false;
    var n;
    var fn;
    if (id === 'row-above') {
      if (x.r1 < 1) return null;
      if (!t.insertRow(m, x.r1)) return null;
      return { sel: { r1: x.r1, c1: x.c1, r2: x.r1, c2: x.c1 } };
    }
    if (id === 'row-below') {
      if (!t.insertRow(m, x.r2 + 1)) return null;
      return { sel: { r1: x.r2 + 1, c1: x.c1, r2: x.r2 + 1, c2: x.c1 } };
    }
    if (id === 'row-dup') {
      if (x.r1 < 1) return null;
      return t.duplicateRow(m, x.r1) ? { sel: { r1: x.r1 + 1, c1: x.c1, r2: x.r1 + 1, c2: x.c1 } } : null;
    }
    if (id === 'row-up') {
      if (x.r1 < 2 || !t.moveRow(m, x.r1 - 1, x.r2)) return null;
      return { sel: { r1: x.r1 - 1, c1: x.c1, r2: x.r2 - 1, c2: x.c2 } };
    }
    if (id === 'row-down') {
      if (x.r1 < 1 || x.r2 + 1 >= m.rows.length || !t.moveRow(m, x.r2 + 1, x.r1)) return null;
      return { sel: { r1: x.r1 + 1, c1: x.c1, r2: x.r2 + 1, c2: x.c2 } };
    }
    if (id === 'row-del') {
      if (x.r1 < 1) return null;
      for (n = x.r2; n >= x.r1; n--) ok = t.deleteRow(m, n) || ok;
      if (!ok) return null;
      var rr = Math.min(x.r1, m.rows.length - 1);
      return { sel: { r1: rr, c1: x.c1, r2: rr, c2: x.c1 } };
    }
    if (id === 'col-left') {
      if (!t.insertCol(m, x.c1)) return null;
      return { sel: { r1: x.r1, c1: x.c1, r2: x.r1, c2: x.c1 } };
    }
    if (id === 'col-right') {
      if (!t.insertCol(m, x.c2 + 1)) return null;
      return { sel: { r1: x.r1, c1: x.c2 + 1, r2: x.r1, c2: x.c2 + 1 } };
    }
    if (id === 'col-dup') {
      return t.duplicateCol(m, x.c1) ? { sel: { r1: x.r1, c1: x.c1 + 1, r2: x.r1, c2: x.c1 + 1 } } : null;
    }
    if (id === 'col-mvleft') {
      if (x.c1 < 1 || !t.moveCol(m, x.c1 - 1, x.c2)) return null;
      return { sel: { r1: x.r1, c1: x.c1 - 1, r2: x.r2, c2: x.c2 - 1 } };
    }
    if (id === 'col-mvright') {
      if (x.c2 + 1 >= t.width(m) || !t.moveCol(m, x.c2 + 1, x.c1)) return null;
      return { sel: { r1: x.r1, c1: x.c1 + 1, r2: x.r2, c2: x.c2 + 1 } };
    }
    if (id === 'col-del') {
      for (n = x.c2; n >= x.c1; n--) ok = t.deleteCol(m, n) || ok;
      if (!ok) return null;
      var cc = Math.min(x.c1, t.width(m) - 1);
      return { sel: { r1: x.r1, c1: cc, r2: x.r1, c2: cc } };
    }
    if (id === 'sort-asc' || id === 'sort-desc') {
      return t.sortRows(m, x.c1, id === 'sort-desc' ? 'desc' : 'asc') ? { sel: single(x) } : null;
    }
    if (id === 'align-left' || id === 'align-center' || id === 'align-right') {
      for (n = x.c1; n <= x.c2; n++) t.setAlign(m, n, id.slice(6));
      return { sel: x };
    }
    if (id === 'widths-reset') {
      if (!m.w.length) return null;
      m.w = [];
      return { sel: x };
    }
    if (id.indexOf('fmt-') === 0) {
      t.setFormat(m, x, id.slice(4));
      return { sel: x };
    }
    if (id === 'bg' || id === 'fg') {
      t.setColor(m, x, id, arg || '');
      return { sel: x };
    }
    if (SUM_FN[id]) {
      fn = SUM_FN[id];
      var at = t.autoSum(m, x, fn);
      return at ? { sel: { r1: at.r, c1: at.c, r2: at.r, c2: at.c } } : null;
    }
    if (id === 'clear') {
      t.clearCells(m, x);
      return { sel: x };
    }
    if (id === 'clear-format') {
      t.clearFormat(m, x);
      return { sel: x };
    }
    if (id === 'cf') {
      m.cf = (Array.isArray(arg) ? arg : []).map(t.cleanRule).filter(Boolean).slice(0, 30);
      return { sel: x };
    }
    if (id === 'widths') {
      m.w = Array.isArray(arg) ? arg : [];
      return { sel: x };
    }
    return null;
  }

  global.DocsTableActions = { MENUS: MENUS, run: run };
})(typeof window !== 'undefined' ? window : this);
