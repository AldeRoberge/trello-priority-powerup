/*
 * Table editor inside a document or a note: a small bar above the table, cell ranges, column
 * resize, paste from Sheets / Excel, formulas, conditional formatting, its own undo.
 * DocsRich owns it (DocsTableUI.create(api)); the logic is in DocsTableModel / DocsTableActions,
 * the full-screen grid in DocsTableSheet. The table stays a plain <table class="dc-table"> whose
 * data-* attributes are saved as Markdown by DocsModel.
 */
(function (global) {
  'use strict';

  function TM() { return global.DocsTableModel; }
  function TA() { return global.DocsTableActions; }

  var EDIT_FORMULA = /^\s*=\s*\S/;

  function create(api) {
    var h = api.h;
    var icon = api.icon;
    var doc = api.doc;
    var ed = null;
    var bar = null;
    var sel = null; // { table, r1, c1, r2, c2 }
    var rangeMode = false;
    var undoStack = [];
    var redoStack = [];
    var lastSnapAt = 0;
    var raf = 0;
    var refreshTimer = 0;
    var drag = null;
    var resize = null;
    var buttons = {};

    /* ── DOM <-> model ─────────────────────────────────────────────── */

    function cellEls(tr) {
      return Array.prototype.filter.call(tr.children, function (el) { return el.tagName === 'TD' || el.tagName === 'TH'; });
    }

    function rowEls(table) {
      return Array.prototype.slice.call(table.rows || []);
    }

    function cleanText(s) {
      return String(s || '').replace(/[​﻿]/g, '');
    }

    function hasInline(el) {
      return !!el.querySelector('a, strong, b, em, i, u, s, del, mark, code, span, .dc-mention');
    }

    function activeCell(table) {
      var n = api.selNode();
      var c = n && api.closestIn(n, 'TD,TH');
      return c && table.contains(c) ? c : null;
    }

    function readModel(table, skip) {
      var t = TM();
      var m = { rows: [], w: [], al: [], cf: [] };
      rowEls(table).forEach(function (tr) {
        var row = [];
        cellEls(tr).forEach(function (el) {
          var cell = { t: cleanText(el.textContent) };
          var f = el.getAttribute('data-f');
          var editing = el.hasAttribute('data-edit');
          if (el === skip) {
            if (f) { cell.f = f; cell.t = ''; }
          } else if (editing || (!f && EDIT_FORMULA.test(cell.t))) {
            if (EDIT_FORMULA.test(cell.t)) { cell.f = cell.t.trim(); cell.t = ''; }
          } else if (f) {
            cell.f = f;
          } else if (hasInline(el)) {
            cell.h = el.innerHTML;
          }
          ['bg', 'fg', 'fmt'].forEach(function (k) {
            var v = el.getAttribute('data-' + k);
            if (v) cell[k] = v;
          });
          row.push(cell);
        });
        m.rows.push(row);
      });
      if (m.rows[0]) m.rows[0].forEach(function (c, i) { m.al[i] = ''; });
      var first = rowEls(table)[0];
      if (first) cellEls(first).forEach(function (el, i) {
        var a = el.getAttribute('data-align');
        m.al[i] = a === 'center' || a === 'right' ? a : '';
      });
      var w = String(table.getAttribute('data-w') || '').split(',').map(Number);
      if (m.rows[0] && w.length === m.rows[0].length && w.every(function (n) { return n >= 3 && n <= 95; })) m.w = w;
      try {
        var rules = JSON.parse(table.getAttribute('data-cf') || '[]');
        if (Array.isArray(rules)) m.cf = rules.map(t.cleanRule).filter(Boolean);
      } catch (err) {
        m.cf = [];
      }
      return t.normalize(m);
    }

    function setAttr(el, name, value) {
      if (value) {
        if (el.getAttribute(name) !== value) el.setAttribute(name, value);
      } else if (el.hasAttribute(name)) el.removeAttribute(name);
    }

    /** Push colors, formats, conditional styles, widths and computed values onto the existing cells. */
    function paint(table, m, skip) {
      var t = TM();
      var rows = rowEls(table);
      var n = t.width(m);
      rows.forEach(function (tr, r) {
        cellEls(tr).forEach(function (el, c) {
          var cell = m.rows[r] && m.rows[r][c];
          if (!cell) return;
          setAttr(el, 'data-bg', cell.bg || '');
          setAttr(el, 'data-fg', cell.fg || '');
          setAttr(el, 'data-fmt', cell.fmt || '');
          setAttr(el, 'data-f', cell.f || '');
          setAttr(el, 'data-align', m.al[c] || '');
          var style = t.cfStyle(m, r, c);
          setAttr(el, 'data-cbg', style && style.bg || '');
          setAttr(el, 'data-cfg', style && style.fg || '');
          if (cell.f && el !== skip && !el.hasAttribute('data-edit')) {
            if (cleanText(el.textContent) !== cell.t) {
              el.textContent = cell.t;
              if (!cell.t) el.appendChild(doc.createElement('br'));
            }
          }
        });
      });
      setAttr(table, 'data-w', m.w.length === n ? m.w.join(',') : '');
      setAttr(table, 'data-cf', m.cf.length ? JSON.stringify(m.cf) : '');
      var group = table.querySelector('colgroup');
      if (m.w.length === n) {
        if (!group) {
          group = doc.createElement('colgroup');
          table.insertBefore(group, table.firstChild);
        }
        while (group.children.length > n) group.removeChild(group.lastChild);
        while (group.children.length < n) group.appendChild(doc.createElement('col'));
        Array.prototype.forEach.call(group.children, function (col, i) { col.style.width = m.w[i] + '%'; });
      } else if (group) group.parentNode.removeChild(group);
    }

    function writeModel(table, m) {
      var thead = doc.createElement('thead');
      var tbody = doc.createElement('tbody');
      m.rows.forEach(function (row, r) {
        var tr = doc.createElement('tr');
        row.forEach(function (cell) {
          var el = doc.createElement(r === 0 ? 'th' : 'td');
          if (cell.h != null && !cell.f) el.innerHTML = cell.h;
          else if (cell.t) el.appendChild(doc.createTextNode(cell.t));
          if (!el.firstChild) el.appendChild(doc.createElement('br'));
          tr.appendChild(el);
        });
        (r === 0 ? thead : tbody).appendChild(tr);
      });
      Array.prototype.slice.call(table.children).forEach(function (k) {
        if (k.tagName === 'THEAD' || k.tagName === 'TBODY' || k.tagName === 'TFOOT' || k.tagName === 'COLGROUP') table.removeChild(k);
      });
      table.appendChild(thead);
      table.appendChild(tbody);
      paint(table, m, null);
    }

    /** Recompute formulas and conditional styles in place, without moving the caret. */
    function refresh(table) {
      if (!table) return; // may run before the editor is in the page (setMd)
      var skip = activeCell(table);
      var m = readModel(table, skip);
      TM().recalc(m);
      paint(table, m, skip);
    }

    function refreshAll() {
      if (!ed) return;
      Array.prototype.forEach.call(ed.querySelectorAll('table'), refresh);
    }

    /* ── Selection ─────────────────────────────────────────────────── */

    function coords(cell) {
      var tr = cell.parentNode;
      return { r: tr.rowIndex, c: cell.cellIndex };
    }

    function cellAt(table, r, c) {
      var tr = table.rows[r];
      return tr ? cellEls(tr)[c] || null : null;
    }

    function clearMarks() {
      if (!ed) return;
      Array.prototype.forEach.call(ed.querySelectorAll('.dc-tsel'), function (el) { el.classList.remove('dc-tsel'); });
      Array.prototype.forEach.call(ed.querySelectorAll('table.dc-ranging'), function (el) { el.classList.remove('dc-ranging'); });
    }

    function markRange() {
      clearMarks();
      if (!sel || !sel.table.isConnected || !rangeMode) return;
      for (var r = sel.r1; r <= sel.r2; r++) for (var c = sel.c1; c <= sel.c2; c++) {
        var el = cellAt(sel.table, r, c);
        if (el) el.classList.add('dc-tsel');
      }
    }

    function setSel(table, r1, c1, r2, c2, range) {
      sel = { table: table, r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
      rangeMode = !!range && (sel.r1 !== sel.r2 || sel.c1 !== sel.c2);
      markRange();
      schedulePlace();
    }

    function onSelectionChange() {
      if (!ed || !ed.isConnected) {
        destroy();
        return;
      }
      if (resize) return;
      if (drag && drag.active) return;
      var cell = api.closestIn(api.selNode(), 'TD,TH');
      if (!cell) {
        var focused = doc.activeElement;
        var inUi = focused && ((bar && bar.contains(focused)) || (focused.closest && focused.closest('.dc-pop')));
        if (!inUi) hideBar();
        return;
      }
      var table = api.closestIn(cell, 'TABLE');
      var p = coords(cell);
      if (rangeMode && sel && sel.table === table && p.r >= sel.r1 && p.r <= sel.r2 && p.c >= sel.c1 && p.c <= sel.c2) {
        schedulePlace();
        return;
      }
      if (cell.getAttribute('data-f') && !cell.hasAttribute('data-edit')) startEdit(cell);
      setSel(table, p.r, p.c, p.r, p.c, false);
    }

    /** A formula cell shows its source while the caret is in it. */
    function startEdit(cell) {
      var f = cell.getAttribute('data-f');
      if (!f) return;
      cell.setAttribute('data-edit', '1');
      cell.textContent = f;
      var r = doc.createRange();
      r.selectNodeContents(cell);
      r.collapse(false);
      var s = global.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }

    /** The caret left a cell: turn typed "=..." into a formula, reformat numbers, recompute. */
    function settle(table) {
      if (!table || !table.isConnected) return;
      var cur = activeCell(table);
      var changed = false;
      rowEls(table).forEach(function (tr) {
        cellEls(tr).forEach(function (el) {
          if (el === cur) return;
          if (el.hasAttribute('data-edit')) {
            el.removeAttribute('data-edit');
            var txt = cleanText(el.textContent);
            if (EDIT_FORMULA.test(txt)) el.setAttribute('data-f', txt.trim());
            else el.removeAttribute('data-f');
            changed = true;
          } else if (!el.getAttribute('data-f') && EDIT_FORMULA.test(cleanText(el.textContent))) {
            el.setAttribute('data-f', cleanText(el.textContent).trim());
            changed = true;
          }
        });
      });
      var m = readModel(table, cur);
      rowEls(table).forEach(function (tr, r) {
        cellEls(tr).forEach(function (el, c) {
          var cell = m.rows[r][c];
          if (el === cur || !cell || cell.f || !cell.fmt || r === 0) return;
          var before = cell.t;
          TM().setInput(cell, before);
          if (cell.t !== before) {
            el.textContent = cell.t;
            changed = true;
          }
        });
      });
      TM().recalc(m);
      paint(table, m, cur);
      if (changed) api.onEdit();
    }

    /* ── Undo (tables only) ────────────────────────────────────────── */

    function snapshot(table) {
      return { table: table, html: table.innerHTML, w: table.getAttribute('data-w') || '', cf: table.getAttribute('data-cf') || '' };
    }

    function restore(snap) {
      var table = snap.table;
      table.innerHTML = snap.html;
      setAttr(table, 'data-w', snap.w);
      setAttr(table, 'data-cf', snap.cf);
      Array.prototype.forEach.call(table.querySelectorAll('[data-edit]'), function (el) { el.removeAttribute('data-edit'); });
      refresh(table);
    }

    function pushUndo(table) {
      undoStack.push(snapshot(table));
      if (undoStack.length > 60) undoStack.shift();
      redoStack = [];
      lastSnapAt = Date.now();
      paintBar();
    }

    function undo(redo) {
      var from = redo ? redoStack : undoStack;
      var to = redo ? undoStack : redoStack;
      var snap;
      while ((snap = from.pop())) if (snap.table.isConnected) break;
      if (!snap || !snap.table.isConnected) { paintBar(); return false; }
      to.push(snapshot(snap.table));
      restore(snap);
      lastSnapAt = 0;
      var first = snap.table.rows[0] && cellEls(snap.table.rows[0])[0];
      if (first) api.focusCell(first);
      api.onEdit();
      paintBar();
      return true;
    }

    /* ── Commands ──────────────────────────────────────────────────── */

    function rectOf(s) {
      return { r1: s.r1, c1: s.c1, r2: s.r2, c2: s.c2 };
    }

    /** Run fn(model, rect) on the selected table. fn returns { sel } or null (nothing to do). */
    function mutate(fn, opts) {
      opts = opts || {};
      if (!sel || !sel.table.isConnected) return false;
      var table = sel.table;
      var m = readModel(table, null);
      var res = fn(m, rectOf(sel));
      if (!res) return false;
      pushUndo(table);
      TM().recalc(m);
      if (opts.rebuild !== false) writeModel(table, m);
      else paint(table, m, null);
      var to = res.sel || rectOf(sel);
      setSel(table, to.r1, to.c1, to.r2, to.c2, rangeMode && opts.keepRange);
      if (!opts.keepFocus) {
        var el = cellAt(table, to.r1, to.c1);
        if (el) api.focusCell(el);
      }
      api.onEdit();
      return true;
    }

    function exec(id, arg, opts) {
      return mutate(function (m, rc) { return TA().run(m, id, rc, arg); }, Object.assign({ keepRange: /^(bg|fg|fmt-|clear)/.test(id) }, opts || {}));
    }

    function tableMd(table) {
      return TM().toDelimited(TM().gridOf(readModel(table, null)), ';');
    }

    function tsvOf(table, rc) {
      var m = readModel(table, null);
      TM().recalc(m);
      return TM().toDelimited(TM().gridOf(m, rc), '\t');
    }

    function copyText(text) {
      function legacy() {
        var ta = doc.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        doc.body.appendChild(ta);
        ta.select();
        try { doc.execCommand('copy'); } catch (err) { /* nothing to do */ }
        doc.body.removeChild(ta);
      }
      var restoreCell = sel && cellAt(sel.table, sel.r1, sel.c1);
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(text).catch(function () { legacy(); if (restoreCell) api.focusCell(restoreCell); });
      } else {
        legacy();
        if (restoreCell) api.focusCell(restoreCell);
      }
    }

    function download(name, text) {
      var blob = new global.Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
      var url = global.URL.createObjectURL(blob);
      var a = doc.createElement('a');
      a.href = url;
      a.download = name;
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
      global.setTimeout(function () { global.URL.revokeObjectURL(url); }, 1000);
    }

    function importCsv() {
      if (!sel) return;
      var table = sel.table;
      var input = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/plain', hidden: true });
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new global.FileReader();
        reader.onload = function () {
          var grid = TM().parseDelimited(String(reader.result || ''));
          if (!grid.length) return;
          sel = { table: table, r1: 0, c1: 0, r2: 0, c2: 0 };
          mutate(function (m) {
            var n = TM().fromGrid(grid);
            m.rows = n.rows; m.al = n.al; m.w = []; m.cf = [];
            return { sel: { r1: 0, c1: 0, r2: 0, c2: 0 } };
          });
        };
        reader.readAsText(file);
      });
      doc.body.appendChild(input);
      input.click();
      global.setTimeout(function () { if (input.parentNode) input.parentNode.removeChild(input); }, 60000);
    }

    function openSheetFor(cell) {
      var table = api.closestIn(cell, 'TABLE');
      if (!table) return;
      var p = coords(cell);
      setSel(table, p.r, p.c, p.r, p.c, false);
      openSheet();
    }

    function deleteTable() {
      if (!sel) return;
      var table = sel.table;
      var p = table.parentNode;
      var next = table.nextElementSibling;
      pushUndo(table);
      var para = doc.createElement('p');
      para.appendChild(doc.createElement('br'));
      if (next && next.tagName === 'P' && !/\S/.test(next.textContent || '')) {
        p.removeChild(table);
        api.focusInside(next);
      } else {
        p.replaceChild(para, table);
        api.focusInside(para);
      }
      sel = null;
      rangeMode = false;
      hideBar();
      api.onEdit();
    }

    function openSheet() {
      if (!sel || !global.DocsTableSheet) return;
      var table = sel.table;
      var m = readModel(table, null);
      TM().recalc(m);
      pushUndo(table);
      hideBar();
      global.DocsTableSheet.open({
        model: m,
        sel: rectOf(sel),
        icon: icon,
        h: h,
        inkLabels: api.inkLabels,
        onChange: function (next) {
          if (!table.isConnected) return;
          writeModel(table, next);
          api.onEdit();
        },
        onClose: function () {
          if (!table.isConnected) return;
          var first = cellAt(table, 0, 0);
          if (first) api.focusCell(first);
        },
      });
    }

    /* ── Menus ─────────────────────────────────────────────────────── */

    function menuItems(ids, list) {
      return list.filter(function (it) { return ids.indexOf(it.id) >= 0; }).map(function (it) {
        return { icon: it.icon, label: it.label, run: function () { exec(it.id); } };
      });
    }

    function menu(anchor, items) {
      api.openChoiceMenu(anchor, items);
    }

    function openRowMenu(anchor) { menu(anchor, TA().MENUS.row.map(function (it) { return { icon: it.icon, label: it.label, run: function () { exec(it.id); } }; })); }
    function openColMenu(anchor) { menu(anchor, TA().MENUS.col.map(function (it) { return { icon: it.icon, label: it.label, run: function () { exec(it.id); } }; })); }
    function openFmtMenu(anchor) { menu(anchor, TA().MENUS.fmt.map(function (it) { return { icon: it.icon, label: it.label, run: function () { exec(it.id); } }; })); }
    function openSumMenu(anchor) { menu(anchor, TA().MENUS.sum.map(function (it) { return { icon: it.icon, label: it.label, run: function () { exec(it.id); } }; })); }

    function openMoreMenu(anchor) {
      menu(anchor, [
        { icon: 'clipboard-copy', label: 'Copier (Sheets, Excel)', run: function () { if (sel) copyText(tsvOf(sel.table, null)); } },
        { icon: 'file-export', label: 'Exporter en CSV', run: function () { if (sel) download('tableau.csv', tableMd(sel.table)); } },
        { icon: 'file-import', label: 'Importer un CSV', run: importCsv },
        { icon: 'eraser', label: 'Vider les cellules', run: function () { exec('clear'); } },
        { icon: 'clear-formatting', label: 'Effacer le format', run: function () { exec('clear-format'); } },
        { icon: 'text-size', label: 'Convertir en texte', run: function () { api.leaveTable && api.leaveTable(); api.onEdit(); } },
        { icon: 'trash', label: 'Supprimer le tableau', run: deleteTable },
      ]);
    }

    function swatch(kind, id) {
      var labels = api.inkLabels || {};
      return h('button', {
        type: 'button',
        class: 'dc-swatch ' + (id ? 'dc-swatch--' + (kind === 'bg' ? 'hi' : 'ink') + ' dc-swatch--' + id : 'dc-swatch--none'),
        title: id ? (labels[id] || id) : 'Aucun',
        'aria-label': (kind === 'bg' ? 'Fond ' : 'Texte ') + (id ? (labels[id] || id) : 'aucun'),
        onmousedown: function (e) { e.preventDefault(); },
        onclick: function () {
          api.closePop();
          exec(kind, id);
        },
      });
    }

    function openColors(anchor) {
      if (!sel) return;
      api.saveSel();
      api.closePop();
      function row(label, kind) {
        var line = h('div', { class: 'dc-color-row' }, [h('span', { class: 'dc-color-label', text: label }), swatch(kind, '')]);
        TM().COLORS.forEach(function (id) { line.appendChild(swatch(kind, id)); });
        return line;
      }
      var pop = h('div', { class: 'dc-pop dc-color-pop' }, [row('Fond', 'bg'), row('Texte', 'fg')]);
      api.setPop(pop);
      api.placePop(pop, anchor.getBoundingClientRect());
    }

    function openRules(anchor) {
      if (!sel || !global.DocsTableSheet) return;
      var table = sel.table;
      api.saveSel();
      api.closePop();
      var panel = global.DocsTableSheet.rulesPanel({
        h: h,
        icon: icon,
        labels: api.inkLabels,
        headers: function () { return readModel(table, null).rows[0].map(TM().cellText); },
        rules: readModel(table, null).cf,
        defaultCol: sel.c1,
        onChange: function (rules) { exec('cf', rules, { keepFocus: true, rebuild: false }); },
      });
      var pop = h('div', { class: 'dc-pop dc-cf-pop' }, [panel]);
      api.setPop(pop);
      api.placePop(pop, anchor.getBoundingClientRect());
    }

    function openCellMenu(x, y) {
      var anchor = { getBoundingClientRect: function () { return { left: x, right: x, top: y, bottom: y, width: 0, height: 0 }; } };
      var M = TA().MENUS;
      var ids = ['row-above', 'row-below', 'row-del', 'col-left', 'col-right', 'col-del', 'sort-asc', 'sort-desc'];
      var items = menuItems(ids, M.row.concat(M.col));
      items.push({ icon: 'palette', label: 'Couleurs…', run: function () { global.setTimeout(function () { openColors(anchor); }, 0); } });
      items.push({ icon: 'eraser', label: 'Vider', run: function () { exec('clear'); } });
      items.push({ icon: 'arrows-maximize', label: 'Feuille', run: openSheet });
      menu(anchor, items);
    }

    /* ── The bar ───────────────────────────────────────────────────── */

    function barButton(id, ic, title, run) {
      var b = h('button', { class: 'dc-tb-btn', type: 'button', title: title, 'aria-label': title }, [icon(ic)]);
      b.addEventListener('mousedown', function (e) { e.preventDefault(); api.saveSel(); });
      b.addEventListener('click', function (e) { e.preventDefault(); run(b); });
      buttons[id] = b;
      return b;
    }

    function sep() {
      return h('span', { class: 'dc-tb-sep', 'aria-hidden': 'true' });
    }

    function buildBar() {
      bar = h('div', { class: 'dc-tbar', role: 'toolbar', 'aria-label': 'Tableau' }, [
        barButton('undo', 'arrow-back-up', 'Annuler', function () { undo(false); }),
        barButton('redo', 'arrow-forward-up', 'Rétablir', function () { undo(true); }),
        sep(),
        barButton('row', 'layout-rows', 'Ligne', openRowMenu),
        barButton('col', 'layout-columns', 'Colonne', openColMenu),
        sep(),
        barButton('color', 'palette', 'Couleurs', openColors),
        barButton('fmt', '123', 'Format', openFmtMenu),
        barButton('rules', 'color-swatch', 'Mise en forme conditionnelle', openRules),
        barButton('sum', 'sum', 'Calculer', openSumMenu),
        sep(),
        barButton('sheet', 'arrows-maximize', 'Feuille', function () { openSheet(); }),
        barButton('more', 'dots', 'Plus', openMoreMenu),
      ]);
      bar.hidden = true;
      doc.body.appendChild(bar);
    }

    function paintBar() {
      if (!bar) return;
      var u = undoStack.some(function (s) { return s.table.isConnected; });
      var r = redoStack.some(function (s) { return s.table.isConnected; });
      buttons.undo.classList.toggle('is-off', !u);
      buttons.redo.classList.toggle('is-off', !r);
    }

    function hideBar() {
      if (bar) bar.hidden = true;
    }

    function schedulePlace() {
      if (raf) return;
      raf = global.requestAnimationFrame(function () {
        raf = 0;
        place();
      });
    }

    function place() {
      if (!sel || !sel.table.isConnected || !ed || !ed.isConnected) {
        hideBar();
        return;
      }
      if (!bar) buildBar();
      var rect = sel.table.getBoundingClientRect();
      var vh = global.innerHeight || 800;
      if (rect.bottom < 40 || rect.top > vh - 20) {
        bar.hidden = true;
        return;
      }
      bar.hidden = false;
      paintBar();
      var w = bar.offsetWidth;
      var hh = bar.offsetHeight;
      var top = rect.top - hh - 6;
      if (top < 8) top = 8;
      var left = Math.max(8, Math.min(rect.left, (global.innerWidth || 1000) - w - 8));
      bar.style.left = left + 'px';
      bar.style.top = top + 'px';
    }

    /* ── Mouse: ranges and column resize ───────────────────────────── */

    function cellFrom(target) {
      return target && target.nodeType === 1 ? api.closestIn(target, 'TD,TH') : target && target.parentNode ? api.closestIn(target.parentNode, 'TD,TH') : null;
    }

    function edgeHit(e, cell) {
      var rect = cell.getBoundingClientRect();
      var tr = cell.parentNode;
      var last = cellEls(tr).length - 1;
      return cell.cellIndex < last && rect.right - e.clientX >= 0 && rect.right - e.clientX <= 5;
    }

    function onMouseDown(e) {
      if (e.button !== 0) return;
      var cell = cellFrom(e.target);
      if (!cell || !ed.contains(cell)) {
        if (rangeMode) { rangeMode = false; markRange(); }
        return;
      }
      var table = api.closestIn(cell, 'TABLE');
      if (edgeHit(e, cell)) {
        startResize(e, table, cell.cellIndex);
        return;
      }
      var p = coords(cell);
      if (e.shiftKey && sel && sel.table === table) {
        e.preventDefault();
        setSel(table, sel.r1 === p.r || sel.r2 === p.r ? sel.r1 : sel.r1, sel.c1, p.r, p.c, true);
        return;
      }
      drag = { table: table, r: p.r, c: p.c, active: false };
      if (rangeMode) { rangeMode = false; markRange(); }
    }

    function onMouseMove(e) {
      if (resize) {
        moveResize(e);
        return;
      }
      if (drag) {
        if (!(e.buttons & 1)) { drag = null; return; }
        var cell = cellFrom(e.target);
        if (!cell || api.closestIn(cell, 'TABLE') !== drag.table) return;
        var p = coords(cell);
        if (!drag.active && p.r === drag.r && p.c === drag.c) return;
        drag.active = true;
        drag.table.classList.add('dc-ranging');
        e.preventDefault();
        setSel(drag.table, drag.r, drag.c, p.r, p.c, true);
        return;
      }
      var el = cellFrom(e.target);
      var hover = !!el && ed.contains(el) && edgeHit(e, el);
      Array.prototype.forEach.call(ed.querySelectorAll('.dc-col-hover'), function (t) {
        if (!hover || t !== api.closestIn(el, 'TABLE')) t.classList.remove('dc-col-hover');
      });
      if (hover) api.closestIn(el, 'TABLE').classList.add('dc-col-hover');
    }

    function onMouseUp() {
      if (resize) {
        endResize();
        return;
      }
      if (drag) {
        var wasActive = drag.active;
        var table = drag.table;
        drag = null;
        if (wasActive) {
          table.classList.remove('dc-ranging');
          var anchor = sel && cellAt(table, sel.r1, sel.c1);
          if (anchor) api.focusCell(anchor);
          markRange();
        }
      }
    }

    function startResize(e, table, index) {
      var m = readModel(table, null);
      var n = TM().width(m);
      var total = table.getBoundingClientRect().width || 1;
      var widths = m.w.length === n ? m.w.slice() : cellEls(table.rows[0]).map(function (el) { return Math.round((el.getBoundingClientRect().width / total) * 100); });
      var sum = widths.reduce(function (a, b) { return a + b; }, 0);
      widths[n - 1] += 100 - sum;
      e.preventDefault();
      resize = { table: table, index: index, startX: e.clientX, total: total, widths: widths, base: widths.slice(), before: snapshot(table), model: m };
    }

    function moveResize(e) {
      var d = ((e.clientX - resize.startX) / resize.total) * 100;
      var i = resize.index;
      var a = resize.base[i];
      var b = resize.base[i + 1];
      d = Math.max(5 - a, Math.min(b - 5, d));
      resize.widths[i] = Math.round(a + d);
      resize.widths[i + 1] = Math.round(b - d);
      var m = resize.model;
      m.w = resize.widths.slice();
      paint(resize.table, m, null);
      schedulePlace();
    }

    function endResize() {
      var r = resize;
      resize = null;
      var m = r.model;
      var sum = m.w.reduce(function (a, b) { return a + b; }, 0);
      m.w[m.w.length - 1] += 100 - sum;
      paint(r.table, m, null);
      undoStack.push(r.before);
      redoStack = [];
      paintBar();
      api.onEdit();
    }

    /* ── Keyboard, clipboard ───────────────────────────────────────── */

    function onKeyDown(e) {
      var cell = api.closestIn(api.selNode(), 'TD,TH');
      if (!cell || !sel) return;
      var mod = e.ctrlKey || e.metaKey;
      var key = e.key;
      if (mod && !e.altKey && (key === 'z' || key === 'Z' || key === 'y' || key === 'Y')) {
        var redo = key === 'y' || key === 'Y' || e.shiftKey;
        if ((redo ? redoStack : undoStack).some(function (s) { return s.table.isConnected; })) {
          e.preventDefault();
          undo(redo);
        }
        return;
      }
      if (e.altKey && e.shiftKey && /^Arrow(Up|Down|Left|Right)$/.test(key)) {
        e.preventDefault();
        exec({ ArrowUp: 'row-up', ArrowDown: 'row-down', ArrowLeft: 'col-mvleft', ArrowRight: 'col-mvright' }[key]);
        return;
      }
      if (rangeMode) {
        if (key === 'Escape') { rangeMode = false; markRange(); return; }
        if (key === 'Delete' || key === 'Backspace') {
          e.preventDefault();
          exec('clear');
          return;
        }
        if (/^Arrow/.test(key) || key === 'Tab' || key === 'Enter') {
          rangeMode = false;
          markRange();
          return;
        }
        if (!mod && key.length === 1) {
          rangeMode = false;
          markRange();
          var a = cellAt(sel.table, sel.r1, sel.c1);
          if (a) api.focusCell(a);
          return;
        }
      }
      if (mod && key.toLowerCase() === 'a' && !e.shiftKey && cell) {
        // a second Ctrl+A inside a cell selects the whole grid
        if (rangeMode && sel.r1 === 0 && sel.c1 === 0) return;
        var all = TM().gridOf(readModel(sel.table, null));
        if (!all.length) return;
        e.preventDefault();
        setSel(sel.table, 0, 0, all.length - 1, all[0].length - 1, true);
      }
    }

    function onCopy(e, cut) {
      if (!sel || !rangeMode || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', tsvOf(sel.table, rectOf(sel)));
      if (cut) exec('clear');
    }

    function onPaste(e) {
      var cell = api.closestIn(api.selNode(), 'TD,TH');
      if (!cell || !sel || !e.clipboardData) return;
      var text = e.clipboardData.getData('text/plain');
      if (text === '' ) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var body = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
      if (body.indexOf('\t') < 0 && body.indexOf('\n') < 0) {
        doc.execCommand('insertText', false, body);
        return;
      }
      var grid = TM().parseDelimited(text.replace(/\r\n?/g, '\n').replace(/\n$/, ''), '\t');
      if (!grid.length) return;
      var p = coords(cell);
      sel = { table: sel.table, r1: p.r, c1: p.c, r2: p.r, c2: p.c };
      mutate(function (m, rc) {
        var covered = TM().putGrid(m, rc.r1, rc.c1, grid);
        return covered ? { sel: covered } : null;
      }, { keepRange: true });
      if (sel && (sel.r1 !== sel.r2 || sel.c1 !== sel.c2)) { rangeMode = true; markRange(); }
    }

    function onBeforeInput(e) {
      var cell = cellFrom(e.target && e.target.nodeType === 1 ? e.target : null) || api.closestIn(api.selNode(), 'TD,TH');
      if (!cell) return;
      var table = api.closestIn(cell, 'TABLE');
      if (!table) return;
      // one undo step per burst of typing
      if (Date.now() - lastSnapAt > 1200) pushUndo(table);
      else lastSnapAt = Date.now();
    }

    function onInput(e) {
      var cell = api.closestIn(api.selNode(), 'TD,TH');
      if (!cell) return;
      global.clearTimeout(refreshTimer);
      var table = api.closestIn(cell, 'TABLE');
      refreshTimer = global.setTimeout(function () { refresh(table); }, 350);
    }

    function onFocusOut(e) {
      var table = e.target && e.target.nodeType === 1 ? api.closestIn(e.target, 'TABLE') : null;
      if (!table) return;
      global.setTimeout(function () {
        if (!ed || !ed.isConnected) return;
        if (activeCell(table)) return;
        settle(table);
      }, 0);
    }

    function onContextMenu(e) {
      var cell = cellFrom(e.target);
      if (!cell || !ed.contains(cell)) return;
      var table = api.closestIn(cell, 'TABLE');
      var p = coords(cell);
      if (!(rangeMode && sel && sel.table === table && p.r >= sel.r1 && p.r <= sel.r2 && p.c >= sel.c1 && p.c <= sel.c2)) {
        setSel(table, p.r, p.c, p.r, p.c, false);
      }
      e.preventDefault();
      openCellMenu(e.clientX, e.clientY);
    }

    /* ── Wiring ────────────────────────────────────────────────────── */

    var onScroll = function () { schedulePlace(); };
    var onDocSel = function () { onSelectionChange(); };

    var docBound = false;

    /** Safe to call many times: the editor gets its listeners once, the document ones while it is alive. */
    function attach() {
      var el = api.getEditor();
      if (!el) return;
      ed = el;
      if (!el.__dcTableUi) {
        el.__dcTableUi = true;
        el.addEventListener('mousedown', onMouseDown);
        el.addEventListener('keydown', onKeyDown, true);
        el.addEventListener('copy', function (e) { onCopy(e, false); });
        el.addEventListener('cut', function (e) { onCopy(e, true); });
        el.addEventListener('paste', onPaste, true);
        el.addEventListener('beforeinput', onBeforeInput);
        el.addEventListener('input', onInput);
        el.addEventListener('focusout', onFocusOut);
        el.addEventListener('contextmenu', onContextMenu);
      }
      if (!docBound) {
        docBound = true;
        doc.addEventListener('mousemove', onMouseMove);
        doc.addEventListener('mouseup', onMouseUp);
        doc.addEventListener('selectionchange', onDocSel);
        global.addEventListener('scroll', onScroll, true);
        global.addEventListener('resize', onScroll);
      }
    }

    function destroy() {
      if (docBound) {
        docBound = false;
        doc.removeEventListener('mousemove', onMouseMove);
        doc.removeEventListener('mouseup', onMouseUp);
        doc.removeEventListener('selectionchange', onDocSel);
        global.removeEventListener('scroll', onScroll, true);
        global.removeEventListener('resize', onScroll);
      }
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      bar = null;
      sel = null;
      rangeMode = false;
      undoStack = [];
      redoStack = [];
    }

    return {
      attach: attach,
      refreshAll: refreshAll,
      refresh: refresh,
      openSheetFor: openSheetFor,
      readModel: readModel,
      writeModel: writeModel,
      destroy: destroy,
      hide: hideBar,
    };
  }

  global.DocsTableUI = { create: create };
})(typeof window !== 'undefined' ? window : this);
