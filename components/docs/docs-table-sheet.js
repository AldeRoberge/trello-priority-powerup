/*
 * Full-screen sheet view of a table (a Google Sheets look): column letters, row numbers, a
 * formula bar, a selection you can drag, keyboard navigation, copy / paste with Sheets and Excel,
 * its own undo. It edits a DocsTableModel and tells the host after every change.
 * Also exports rulesPanel(), the conditional formatting editor shared with the inline table bar.
 * window.DocsTableSheet.open({ model, sel, h, icon, inkLabels, onChange(model), onClose() }).
 */
(function (global) {
  'use strict';

  function TM() { return global.DocsTableModel; }
  function TA() { return global.DocsTableActions; }

  var CF_LABELS = {
    gt: 'supérieur à', lt: 'inférieur à', ge: 'au moins', le: 'au plus', eq: 'égal à',
    ne: 'différent de', has: 'contient', empty: 'est vide', filled: 'n’est pas vide',
  };

  /** The rules editor. opts: { h, icon, labels, headers(): string[], rules, onChange(rules), defaultCol }. */
  function rulesPanel(opts) {
    var h = opts.h;
    var rules = opts.rules.map(function (r) { return Object.assign({}, r); });
    var box = h('div', { class: 'dc-cf' });
    var colors = [{ v: '', t: 'Aucune' }].concat(TM().COLORS.map(function (id) { return { v: id, t: (opts.labels || {})[id] || id }; }));

    function select(options, value, onChange, label) {
      var s = h('select', { class: 'dc-cf-select', 'aria-label': label });
      options.forEach(function (o) {
        var op = h('option', { value: String(o.v), text: o.t });
        if (String(o.v) === String(value)) op.selected = true;
        s.appendChild(op);
      });
      s.addEventListener('change', function () { onChange(s.value); });
      return s;
    }

    function save() {
      opts.onChange(rules.map(function (r) { return Object.assign({}, r); }));
    }

    function draw() {
      while (box.firstChild) box.removeChild(box.firstChild);
      var cols = [{ v: -1, t: 'Toutes les colonnes' }].concat(opts.headers().map(function (t, i) {
        return { v: i, t: TM().colName(i) + (t ? ' · ' + String(t).slice(0, 18) : '') };
      }));
      if (!rules.length) box.appendChild(h('div', { class: 'dc-cf-empty', text: 'Aucune règle' }));
      rules.forEach(function (rule, i) {
        var value = h('input', {
          class: 'dc-cf-input', type: 'text', value: rule.v, placeholder: 'Valeur', 'aria-label': 'Valeur',
          onchange: function (e) { rule.v = e.target.value; save(); },
        });
        if (rule.op === 'empty' || rule.op === 'filled') value.style.visibility = 'hidden';
        box.appendChild(h('div', { class: 'dc-cf-rule' }, [
          select(cols, rule.c, function (v) { rule.c = parseInt(v, 10); save(); }, 'Colonne'),
          select(Object.keys(CF_LABELS).map(function (k) { return { v: k, t: CF_LABELS[k] }; }), rule.op, function (v) { rule.op = v; save(); draw(); }, 'Condition'),
          value,
          select(colors, rule.bg, function (v) { rule.bg = v; save(); }, 'Fond'),
          select(colors, rule.fg, function (v) { rule.fg = v; save(); }, 'Texte'),
          h('label', { class: 'dc-cf-row', title: 'Colorer toute la ligne' }, [
            h('input', { type: 'checkbox', checked: rule.row ? true : null, onchange: function (e) { rule.row = e.target.checked; save(); } }),
            h('span', { text: 'Ligne' }),
          ]),
          h('button', {
            type: 'button', class: 'dc-cf-del', title: 'Supprimer la règle', 'aria-label': 'Supprimer la règle',
            onclick: function () { rules.splice(i, 1); save(); draw(); },
          }, [opts.icon('trash')]),
        ]));
      });
      box.appendChild(h('button', {
        type: 'button', class: 'dc-cf-add',
        onclick: function () {
          rules.push({ c: opts.defaultCol >= 0 ? opts.defaultCol : -1, op: 'gt', v: '', bg: 'green', fg: '', row: false });
          save();
          draw();
        },
      }, [opts.icon('plus'), h('span', { text: 'Règle' })]));
    }
    draw();
    return box;
  }

  function open(opts) {
    var T = TM();
    var A = TA();
    var h = opts.h;
    var icon = opts.icon;
    var doc = global.document;
    var m = T.normalize(opts.model);
    T.recalc(m);
    var s0 = T.clampRect(m, opts.sel || { r1: 0, c1: 0, r2: 0, c2: 0 });
    var anchor = { r: s0.r1, c: s0.c1 };
    var focus = { r: s0.r1, c: s0.c1 };
    var editing = null;
    var hist = [];
    var redoHist = [];
    var cells = [];
    var px = [];
    var dragSel = false;
    var resizing = null;
    var openPop = null;
    var closed = false;

    function width() { return T.width(m); }

    function initWidths() {
      var n = width();
      px = [];
      for (var i = 0; i < n; i++) px.push(m.w.length === n ? Math.max(60, Math.round(m.w[i] * 9)) : 150);
    }
    initWidths();

    /* ── Skeleton ──────────────────────────────────────────────────── */

    var nameBox = h('div', { class: 'dcs-name', 'aria-label': 'Cellule' });
    var fx = h('input', { class: 'dcs-fx', type: 'text', 'aria-label': 'Formule', spellcheck: 'false', autocomplete: 'off' });
    var status = h('div', { class: 'dcs-status' });
    var table = h('table', { class: 'dcs-grid dc-table', role: 'grid' });
    var scroller = h('div', { class: 'dcs-scroll', tabindex: '0', role: 'application', 'aria-label': 'Feuille' }, [table]);
    var toolbar = h('div', { class: 'dcs-toolbar', role: 'toolbar', 'aria-label': 'Feuille' });
    var root = h('div', { class: 'dcs', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Feuille' }, [
      h('div', { class: 'dcs-top' }, [
        h('button', { class: 'dcs-btn', type: 'button', title: 'Fermer', 'aria-label': 'Fermer', onclick: close }, [icon('x')]),
        toolbar,
      ]),
      h('div', { class: 'dcs-fxbar' }, [nameBox, icon('math-function'), fx]),
      scroller,
      status,
    ]);

    /* ── Model changes ─────────────────────────────────────────────── */

    function rect() {
      return T.rect(anchor.r, anchor.c, focus.r, focus.c);
    }

    function setSel(rc) {
      anchor = { r: rc.r1, c: rc.c1 };
      focus = { r: rc.r2, c: rc.c2 };
      paintSel();
    }

    function snap() {
      return JSON.stringify(m);
    }

    function pushHist(s) {
      hist.push(s);
      if (hist.length > 100) hist.shift();
      redoHist = [];
      paintToolbar();
    }

    function notify() {
      if (opts.onChange) opts.onChange(m);
    }

    function changed(before) {
      pushHist(before);
      T.recalc(m);
      render();
      notify();
    }

    function step(redo) {
      commit();
      var from = redo ? redoHist : hist;
      var to = redo ? hist : redoHist;
      var prev = from.pop();
      if (!prev) return;
      to.push(snap());
      m = JSON.parse(prev);
      T.normalize(m);
      anchor = { r: Math.min(anchor.r, m.rows.length - 1), c: Math.min(anchor.c, width() - 1) };
      focus = { r: Math.min(focus.r, m.rows.length - 1), c: Math.min(focus.c, width() - 1) };
      initWidths();
      render();
      notify();
      paintToolbar();
    }

    function act(id, arg) {
      commit();
      var before = snap();
      var res = A.run(m, id, rect(), arg);
      if (!res) return false;
      if (id === 'widths-reset' || id.indexOf('col-') === 0) initWidths();
      anchor = { r: res.sel.r1, c: res.sel.c1 };
      focus = { r: res.sel.r2, c: res.sel.c2 };
      changed(before);
      return true;
    }

    /* ── Editing ───────────────────────────────────────────────────── */

    function cellOf(r, c) {
      return m.rows[r] && m.rows[r][c];
    }

    function startEdit(initial) {
      commit();
      var cell = cellOf(focus.r, focus.c);
      var td = cells[focus.r] && cells[focus.r][focus.c];
      if (!cell || !td) return;
      var value = initial != null ? initial : (cell.f || T.cellText(cell));
      var input = h('input', { class: 'dcs-input', type: 'text', value: value, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Modifier' });
      editing = { r: focus.r, c: focus.c, input: input, td: td };
      td.classList.add('is-edit');
      td.appendChild(input);
      input.addEventListener('input', function () { fx.value = input.value; });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); moveAfterEdit(e.shiftKey ? -1 : 1, 0); }
        else if (e.key === 'Tab') { e.preventDefault(); moveAfterEdit(0, e.shiftKey ? -1 : 1); }
        else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
      });
      input.addEventListener('blur', function () {
        global.setTimeout(function () { if (editing && editing.input === input && doc.activeElement !== fx) commit(); }, 0);
      });
      input.focus();
      input.setSelectionRange(value.length, value.length);
      fx.value = value;
    }

    function endEditDom() {
      if (!editing) return;
      var e = editing;
      editing = null;
      e.td.classList.remove('is-edit');
      if (e.input.parentNode) e.input.parentNode.removeChild(e.input);
    }

    function cancelEdit() {
      endEditDom();
      paintSel();
      scroller.focus();
    }

    function commit() {
      if (!editing) return;
      var e = editing;
      var value = e.input.value;
      endEditDom();
      var cell = cellOf(e.r, e.c);
      if (!cell) return;
      if (value === (cell.f || T.cellText(cell))) { paintSel(); return; }
      var before = snap();
      T.setInput(cell, value);
      changed(before);
    }

    function moveAfterEdit(dr, dc) {
      commit();
      move(dr, dc, false);
      scroller.focus();
    }

    function commitFx(refocus) {
      var cell = cellOf(focus.r, focus.c);
      if (!cell) return;
      var value = fx.value;
      if (value !== (cell.f || T.cellText(cell))) {
        var before = snap();
        T.setInput(cell, value);
        changed(before);
      }
      if (refocus) scroller.focus();
    }

    /* ── Selection and keys ────────────────────────────────────────── */

    function clamp(p) {
      return { r: Math.max(0, Math.min(p.r, m.rows.length - 1)), c: Math.max(0, Math.min(p.c, width() - 1)) };
    }

    function move(dr, dc, extend, jump) {
      var base = focus;
      var next = clamp({
        r: jump && dr ? (dr > 0 ? m.rows.length - 1 : 0) : base.r + dr,
        c: jump && dc ? (dc > 0 ? width() - 1 : 0) : base.c + dc,
      });
      focus = next;
      if (!extend) anchor = { r: next.r, c: next.c };
      paintSel();
      var td = cells[next.r] && cells[next.r][next.c];
      if (td && td.scrollIntoView) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function clearSel() {
      var before = snap();
      T.clearCells(m, rect());
      changed(before);
    }

    function copyRect(cut, e) {
      var tsv = T.toDelimited(T.gridOf(m, rect()), '\t');
      if (e && e.clipboardData) {
        e.preventDefault();
        e.clipboardData.setData('text/plain', tsv);
      } else if (global.navigator && global.navigator.clipboard) global.navigator.clipboard.writeText(tsv).catch(function () {});
      if (cut) clearSel();
    }

    function pasteText(text) {
      var body = String(text || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
      if (body === '') return;
      var grid = body.indexOf('\t') < 0 && body.indexOf('\n') < 0 ? [[body]] : T.parseDelimited(body, '\t');
      var rc = rect();
      var before = snap();
      var covered = T.putGrid(m, rc.r1, rc.c1, grid);
      if (!covered) return;
      initWidths();
      anchor = { r: covered.r1, c: covered.c1 };
      focus = { r: covered.r2, c: covered.c2 };
      changed(before);
    }

    function onKey(e) {
      if (editing) return;
      var mod = e.ctrlKey || e.metaKey;
      var k = e.key;
      if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); step(e.shiftKey); return; }
      if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); step(true); return; }
      if (mod && (k === 'a' || k === 'A')) {
        e.preventDefault();
        anchor = { r: 0, c: 0 };
        focus = { r: m.rows.length - 1, c: width() - 1 };
        paintSel();
        return;
      }
      if (mod && (k === 'c' || k === 'x' || k === 'v' || k === 'C' || k === 'X' || k === 'V')) return; // native clipboard events
      if (e.altKey && e.shiftKey && /^Arrow/.test(k)) {
        e.preventDefault();
        act({ ArrowUp: 'row-up', ArrowDown: 'row-down', ArrowLeft: 'col-mvleft', ArrowRight: 'col-mvright' }[k]);
        return;
      }
      if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0, e.shiftKey, mod); return; }
      if (k === 'ArrowDown') { e.preventDefault(); move(1, 0, e.shiftKey, mod); return; }
      if (k === 'ArrowLeft') { e.preventDefault(); move(0, -1, e.shiftKey, mod); return; }
      if (k === 'ArrowRight') { e.preventDefault(); move(0, 1, e.shiftKey, mod); return; }
      if (k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1, false); return; }
      if (k === 'Enter') { e.preventDefault(); if (e.shiftKey) move(-1, 0, false); else startEdit(); return; }
      if (k === 'F2') { e.preventDefault(); startEdit(); return; }
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearSel(); return; }
      if (k === 'Escape') { e.preventDefault(); if (openPop) closePop(); else close(); return; }
      if (!mod && !e.altKey && k.length === 1) {
        e.preventDefault();
        startEdit(k);
      }
    }

    function cellFromEvent(e) {
      var el = e.target;
      while (el && el !== table) {
        if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute('data-c') && el.hasAttribute('data-r')) {
          return { r: parseInt(el.getAttribute('data-r'), 10), c: parseInt(el.getAttribute('data-c'), 10) };
        }
        el = el.parentNode;
      }
      return null;
    }

    function formulaInsertTarget() {
      if (!editing) return false;
      var v = editing.input.value;
      if (v.charAt(0) !== '=') return false;
      var before = v.slice(0, editing.input.selectionStart == null ? v.length : editing.input.selectionStart);
      return before === '=' || /[=+\-*\/^&(,;:<>]$/.test(before);
    }

    function onMouseDown(e) {
      if (e.button !== 0) return;
      closePop();
      var p = cellFromEvent(e);
      var head = e.target.closest && e.target.closest('[data-head]');
      if (e.target.closest && e.target.closest('.dcs-rz')) return;
      if (p && formulaInsertTarget()) {
        e.preventDefault();
        var inp = editing.input;
        var at = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
        var ref = T.refName(p.r, p.c);
        inp.value = inp.value.slice(0, at) + ref + inp.value.slice(inp.selectionEnd == null ? at : inp.selectionEnd);
        inp.setSelectionRange(at + ref.length, at + ref.length);
        fx.value = inp.value;
        return;
      }
      commit();
      if (head) {
        e.preventDefault();
        var kind = head.getAttribute('data-head');
        var idx = parseInt(head.getAttribute('data-idx'), 10);
        var last = { r: m.rows.length - 1, c: width() - 1 };
        if (kind === 'col') { if (!e.shiftKey) anchor = { r: 0, c: idx }; focus = { r: last.r, c: idx }; }
        else if (kind === 'row') { if (!e.shiftKey) anchor = { r: idx, c: 0 }; focus = { r: idx, c: last.c }; }
        else { anchor = { r: 0, c: 0 }; focus = last; }
        paintSel();
        scroller.focus();
        return;
      }
      if (!p) return;
      e.preventDefault();
      focus = p;
      if (!e.shiftKey) anchor = { r: p.r, c: p.c };
      dragSel = true;
      paintSel();
      scroller.focus();
    }

    function onMouseMove(e) {
      if (resizing) {
        px[resizing.c] = Math.max(50, resizing.start + (e.clientX - resizing.x));
        applyWidths();
        return;
      }
      if (!dragSel) return;
      if (!(e.buttons & 1)) { dragSel = false; return; }
      var p = cellFromEvent(e);
      if (p && (p.r !== focus.r || p.c !== focus.c)) { focus = p; paintSel(); }
    }

    function onMouseUp() {
      dragSel = false;
      if (resizing) {
        resizing = null;
        storeWidths();
      }
    }

    function applyWidths() {
      var cols = table.querySelectorAll('col[data-col]');
      Array.prototype.forEach.call(cols, function (col, i) { col.style.width = px[i] + 'px'; });
      table.style.width = 46 + px.reduce(function (a, b) { return a + b; }, 0) + 'px';
    }

    function storeWidths() {
      var sum = px.reduce(function (a, b) { return a + b; }, 0);
      var w = px.map(function (n) { return Math.round((n / sum) * 100); });
      w[w.length - 1] += 100 - w.reduce(function (a, b) { return a + b; }, 0);
      var ok = w.every(function (n) { return n >= 3 && n <= 95; });
      var before = snap();
      m.w = ok ? w : [];
      pushHist(before);
      notify();
    }

    /* ── Rendering ─────────────────────────────────────────────────── */

    function render() {
      var n = width();
      if (px.length !== n) initWidths();
      while (table.firstChild) table.removeChild(table.firstChild);
      cells = [];
      var colgroup = h('colgroup');
      colgroup.appendChild(h('col', { style: 'width:46px' }));
      px.forEach(function (w) { colgroup.appendChild(h('col', { 'data-col': '1', style: 'width:' + w + 'px' })); });
      table.appendChild(colgroup);
      var thead = h('thead');
      var hr = h('tr');
      hr.appendChild(h('th', { class: 'dcs-corner', 'data-head': 'all', 'data-idx': '0' }));
      for (var c = 0; c < n; c++) {
        var th = h('th', { class: 'dcs-colhead', 'data-head': 'col', 'data-idx': String(c) }, [h('span', { text: T.colName(c) })]);
        var rz = h('span', { class: 'dcs-rz', 'data-c': null, 'aria-hidden': 'true' });
        (function (col) {
          rz.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            commit();
            resizing = { c: col, x: e.clientX, start: px[col] };
          });
        })(c);
        th.appendChild(rz);
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = h('tbody');
      m.rows.forEach(function (row, r) {
        var tr = h('tr');
        tr.appendChild(h('th', { class: 'dcs-rowhead', 'data-head': 'row', 'data-idx': String(r), text: String(r + 1) }));
        cells[r] = [];
        row.forEach(function (cell, c) {
          var td = h('td', { 'data-r': String(r), 'data-c': String(c), role: 'gridcell' });
          if (r === 0) td.classList.add('dcs-hdr');
          if (cell.bg) td.setAttribute('data-bg', cell.bg);
          if (cell.fg) td.setAttribute('data-fg', cell.fg);
          if (m.al[c]) td.setAttribute('data-align', m.al[c]);
          var style = T.cfStyle(m, r, c);
          if (style && style.bg) td.setAttribute('data-cbg', style.bg);
          if (style && style.fg) td.setAttribute('data-cfg', style.fg);
          var text = T.cellText(cell);
          var box = h('div', { class: 'dcs-t', text: text });
          if (cell.f && /^#/.test(text)) box.classList.add('is-err');
          td.appendChild(box);
          tr.appendChild(td);
          cells[r][c] = td;
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      applyWidths();
      paintSel();
      paintToolbar();
    }

    function paintSel() {
      var rc = rect();
      for (var r = 0; r < cells.length; r++) {
        for (var c = 0; c < cells[r].length; c++) {
          var td = cells[r][c];
          var inside = r >= rc.r1 && r <= rc.r2 && c >= rc.c1 && c <= rc.c2;
          td.classList.toggle('is-sel', inside && (rc.r1 !== rc.r2 || rc.c1 !== rc.c2));
          td.classList.toggle('is-active', r === focus.r && c === focus.c);
        }
      }
      Array.prototype.forEach.call(table.querySelectorAll('.dcs-colhead, .dcs-rowhead'), function (th) {
        var idx = parseInt(th.getAttribute('data-idx'), 10);
        var on = th.getAttribute('data-head') === 'col' ? idx >= rc.c1 && idx <= rc.c2 : idx >= rc.r1 && idx <= rc.r2;
        th.classList.toggle('is-on', on);
      });
      var single = rc.r1 === rc.r2 && rc.c1 === rc.c2;
      nameBox.textContent = single ? T.refName(rc.r1, rc.c1) : T.refName(rc.r1, rc.c1) + ':' + T.refName(rc.r2, rc.c2);
      if (!editing) {
        var cell = cellOf(focus.r, focus.c);
        fx.value = cell ? (cell.f || T.cellText(cell)) : '';
      }
      paintStatus(rc);
    }

    function paintStatus(rc) {
      var nums = [];
      T.eachCell(m, rc, function (cell) {
        var n = T.parseNumber(T.cellText(cell));
        if (n != null) nums.push(n);
      });
      if (nums.length < 2) { status.textContent = ''; return; }
      var sum = nums.reduce(function (a, b) { return a + b; }, 0);
      status.textContent = 'Somme ' + T.formatNumber(sum, 'auto') + '  ·  Moyenne ' + T.formatNumber(sum / nums.length, 'auto') + '  ·  Nombre ' + nums.length;
    }

    /* ── Toolbar ───────────────────────────────────────────────────── */

    var btns = {};

    function closePop() {
      if (openPop && openPop.parentNode) openPop.parentNode.removeChild(openPop);
      openPop = null;
    }

    function placePop(pop, anchorEl) {
      root.appendChild(pop);
      var r = anchorEl.getBoundingClientRect();
      var left = Math.max(8, Math.min(r.left, (global.innerWidth || 800) - pop.offsetWidth - 8));
      pop.style.left = left + 'px';
      pop.style.top = r.bottom + 6 + 'px';
      openPop = pop;
    }

    function menuPop(anchorEl, items) {
      closePop();
      var pop = h('div', { class: 'dcs-pop dcs-menu', role: 'menu' }, items.map(function (it) {
        return h('button', {
          class: 'dcs-menu-item', type: 'button',
          onmousedown: function (e) { e.preventDefault(); },
          onclick: function () { closePop(); it.run(); scroller.focus(); },
        }, [icon(it.icon), h('span', { text: it.label })]);
      }));
      placePop(pop, anchorEl);
    }

    function tbtn(id, ic, title, run) {
      var b = h('button', { class: 'dcs-btn', type: 'button', title: title, 'aria-label': title }, [icon(ic)]);
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { run(b); });
      btns[id] = b;
      return b;
    }

    function actMenu(list) {
      return function (anchorEl) {
        menuPop(anchorEl, list.map(function (it) { return { icon: it.icon, label: it.label, run: function () { act(it.id); } }; }));
      };
    }

    function colorsPop(anchorEl) {
      closePop();
      var labels = opts.inkLabels || {};
      function sw(kind, id) {
        return h('button', {
          type: 'button',
          class: 'dc-swatch ' + (id ? 'dc-swatch--' + (kind === 'bg' ? 'hi' : 'ink') + ' dc-swatch--' + id : 'dc-swatch--none'),
          title: id ? (labels[id] || id) : 'Aucun',
          'aria-label': (kind === 'bg' ? 'Fond ' : 'Texte ') + (id ? (labels[id] || id) : 'aucun'),
          onmousedown: function (e) { e.preventDefault(); },
          onclick: function () { closePop(); act(kind, id); scroller.focus(); },
        });
      }
      function row(label, kind) {
        var line = h('div', { class: 'dc-color-row' }, [h('span', { class: 'dc-color-label', text: label }), sw(kind, '')]);
        T.COLORS.forEach(function (id) { line.appendChild(sw(kind, id)); });
        return line;
      }
      placePop(h('div', { class: 'dcs-pop dc-color-pop' }, [row('Fond', 'bg'), row('Texte', 'fg')]), anchorEl);
    }

    function rulesPop(anchorEl) {
      closePop();
      var pop = h('div', { class: 'dcs-pop dcs-rules' }, [rulesPanel({
        h: h,
        icon: icon,
        labels: opts.inkLabels,
        headers: function () { return m.rows[0].map(T.cellText); },
        rules: m.cf,
        defaultCol: focus.c,
        onChange: function (rules) {
          var before = snap();
          m.cf = rules.map(T.cleanRule).filter(Boolean);
          changed(before);
        },
      })]);
      placePop(pop, anchorEl);
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
      var input = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/plain', hidden: true });
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new global.FileReader();
        reader.onload = function () {
          var grid = T.parseDelimited(String(reader.result || ''));
          if (!grid.length) return;
          var before = snap();
          var n = T.fromGrid(grid);
          m.rows = n.rows;
          m.al = n.al;
          m.w = [];
          m.cf = [];
          anchor = { r: 0, c: 0 };
          focus = { r: 0, c: 0 };
          initWidths();
          changed(before);
        };
        reader.readAsText(file);
      });
      root.appendChild(input);
      input.click();
      global.setTimeout(function () { if (input.parentNode) input.parentNode.removeChild(input); }, 60000);
    }

    function moreMenu(anchorEl) {
      menuPop(anchorEl, [
        { icon: 'clipboard-copy', label: 'Copier tout (Sheets, Excel)', run: function () { copyAll(); } },
        { icon: 'file-export', label: 'Exporter en CSV', run: function () { download('tableau.csv', T.toDelimited(T.gridOf(m), ';')); } },
        { icon: 'file-import', label: 'Importer un CSV', run: importCsv },
        { icon: 'eraser', label: 'Vider la sélection', run: function () { act('clear'); } },
        { icon: 'clear-formatting', label: 'Effacer le format', run: function () { act('clear-format'); } },
      ]);
    }

    function copyAll() {
      var tsv = T.toDelimited(T.gridOf(m), '\t');
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) global.navigator.clipboard.writeText(tsv).catch(function () {});
    }

    function paintToolbar() {
      if (btns.undo) btns.undo.classList.toggle('is-off', !hist.length);
      if (btns.redo) btns.redo.classList.toggle('is-off', !redoHist.length);
    }

    function sep() { return h('span', { class: 'dcs-sep', 'aria-hidden': 'true' }); }

    [
      tbtn('undo', 'arrow-back-up', 'Annuler', function () { step(false); }),
      tbtn('redo', 'arrow-forward-up', 'Rétablir', function () { step(true); }),
      sep(),
      tbtn('row', 'layout-rows', 'Ligne', actMenu(A.MENUS.row)),
      tbtn('col', 'layout-columns', 'Colonne', actMenu(A.MENUS.col)),
      sep(),
      tbtn('color', 'palette', 'Couleurs', colorsPop),
      tbtn('fmt', '123', 'Format', actMenu(A.MENUS.fmt)),
      tbtn('rules', 'color-swatch', 'Mise en forme conditionnelle', rulesPop),
      tbtn('sum', 'sum', 'Calculer', actMenu(A.MENUS.sum)),
      sep(),
      tbtn('more', 'dots', 'Plus', moreMenu),
    ].forEach(function (el) { toolbar.appendChild(el); });

    /* ── Events and lifecycle ──────────────────────────────────────── */

    scroller.addEventListener('keydown', onKey);
    scroller.addEventListener('mousedown', onMouseDown);
    scroller.addEventListener('dblclick', function (e) {
      var p = cellFromEvent(e);
      if (p) { focus = p; anchor = { r: p.r, c: p.c }; paintSel(); startEdit(); }
    });
    scroller.addEventListener('copy', function (e) { if (!editing) copyRect(false, e); });
    scroller.addEventListener('cut', function (e) { if (!editing) copyRect(true, e); });
    scroller.addEventListener('paste', function (e) {
      if (editing) return;
      e.preventDefault();
      pasteText(e.clipboardData ? e.clipboardData.getData('text/plain') : '');
    });
    fx.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commitFx(true); }
      else if (e.key === 'Escape') { e.preventDefault(); paintSel(); scroller.focus(); }
    });
    fx.addEventListener('change', function () { commitFx(false); });
    doc.addEventListener('mousemove', onMouseMove);
    doc.addEventListener('mouseup', onMouseUp);
    root.addEventListener('mousedown', function (e) {
      if (openPop && !openPop.contains(e.target) && !(e.target.closest && e.target.closest('.dcs-btn'))) closePop();
    });

    function close() {
      if (closed) return;
      commit();
      closed = true;
      closePop();
      doc.removeEventListener('mousemove', onMouseMove);
      doc.removeEventListener('mouseup', onMouseUp);
      if (root.parentNode) root.parentNode.removeChild(root);
      doc.documentElement.style.overflow = prevOverflow;
      if (opts.onClose) opts.onClose(m);
    }

    var prevOverflow = doc.documentElement.style.overflow;
    doc.documentElement.style.overflow = 'hidden';
    doc.body.appendChild(root);
    render();
    scroller.focus();
    return { close: close, model: function () { return m; } };
  }

  global.DocsTableSheet = { open: open, rulesPanel: rulesPanel };
})(typeof window !== 'undefined' ? window : this);
