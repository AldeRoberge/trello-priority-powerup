/*
 * Rich-text actions for the document editor: highlight, text color, tables,
 * callouts and alignment. DocsUI owns the toolbar; this file owns the DOM edits.
 * Storage stays in DocsModel (Markdown round-trip).
 */
(function (global) {
  'use strict';

  function create(api) {
    function editor() {
      return api.getEditor();
    }

    function unwrapEl(el) {
      var parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }

    function focusCell(cell) {
      var ed = editor();
      if (!cell || !ed) return;
      ed.focus();
      var sel = global.getSelection();
      var r = api.doc.createRange();
      r.selectNodeContents(cell);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      api.saveSel();
    }

    function makeTable(cols, rows) {
      var doc = api.doc;
      var table = doc.createElement('table');
      table.className = 'dc-table';
      var thead = doc.createElement('thead');
      var hr = doc.createElement('tr');
      var c;
      for (c = 0; c < cols; c++) {
        var th = doc.createElement('th');
        th.appendChild(doc.createElement('br'));
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      var tbody = doc.createElement('tbody');
      var r;
      for (r = 0; r < rows; r++) {
        var tr = doc.createElement('tr');
        for (c = 0; c < cols; c++) {
          var td = doc.createElement('td');
          td.appendChild(doc.createElement('br'));
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(thead);
      table.appendChild(tbody);
      return table;
    }

    function addTableRow(table, afterTr) {
      var n = (table.querySelector('tr') || { children: { length: 1 } }).children.length || 1;
      var tr = api.doc.createElement('tr');
      var head = table.querySelector('thead tr');
      for (var i = 0; i < n; i++) {
        var td = api.doc.createElement('td');
        var align = head && head.children[i] && head.children[i].getAttribute('data-align');
        if (align === 'center' || align === 'right') td.setAttribute('data-align', align);
        td.appendChild(api.doc.createElement('br'));
        tr.appendChild(td);
      }
      var body = table.querySelector('tbody') || table;
      if (afterTr && afterTr.parentNode && afterTr.parentNode.tagName === 'THEAD') body.insertBefore(tr, body.firstChild);
      else if (afterTr && afterTr.parentNode) afterTr.parentNode.insertBefore(tr, afterTr.nextSibling);
      else body.appendChild(tr);
      return tr;
    }

    function addTableCol(table) {
      Array.prototype.forEach.call(table.querySelectorAll('tr'), function (tr) {
        var cell = api.doc.createElement(tr.querySelector('th') ? 'th' : 'td');
        cell.appendChild(api.doc.createElement('br'));
        tr.appendChild(cell);
      });
    }

    function deleteTableRow(tr) {
      var table = api.closestIn(tr, 'TABLE');
      if (!table || table.querySelectorAll('tr').length <= 1) return;
      var next = tr.nextElementSibling || tr.previousElementSibling;
      tr.parentNode.removeChild(tr);
      if (next) focusCell(next.firstChild);
    }

    function deleteTableCol(table, cell) {
      var idx = Array.prototype.indexOf.call(cell.parentNode.children, cell);
      var first = table.querySelector('tr');
      if (!first || first.children.length <= 1 || idx < 0) return;
      Array.prototype.forEach.call(table.querySelectorAll('tr'), function (tr) {
        if (tr.children[idx]) tr.removeChild(tr.children[idx]);
      });
      var row = table.querySelector('tr');
      if (row) focusCell(row.children[Math.min(idx, row.children.length - 1)]);
    }

    function moveTableCell(cell, dir) {
      var table = api.closestIn(cell, 'TABLE');
      if (!table) return;
      var cells = Array.prototype.slice.call(table.querySelectorAll('th,td'));
      var i = cells.indexOf(cell) + dir;
      if (i >= 0 && i < cells.length) focusCell(cells[i]);
      else if (dir > 0) focusCell(addTableRow(table).firstChild);
    }

    function cellBelow(cell) {
      var tr = cell.parentNode;
      var idx = Array.prototype.indexOf.call(tr.children, cell);
      var next = tr.nextElementSibling;
      if (!next && tr.parentNode && tr.parentNode.tagName === 'THEAD') {
        var body = api.closestIn(cell, 'TABLE').querySelector('tbody');
        next = body && body.querySelector('tr');
      }
      if (!next) next = addTableRow(api.closestIn(cell, 'TABLE'));
      return next.children[idx] || next.lastChild;
    }

    function fixTables() {
      var ed = editor();
      if (!ed) return;
      Array.prototype.forEach.call(ed.querySelectorAll('table'), function (table) {
        table.classList.add('dc-table');
        Array.prototype.slice.call(table.querySelectorAll('td table, th table')).forEach(function (nested) {
          if (table.parentNode) table.parentNode.insertBefore(nested, table.nextSibling);
        });
        Array.prototype.forEach.call(table.querySelectorAll('td, th'), function (cell) {
          Array.prototype.slice.call(cell.childNodes).forEach(function (n) {
            if (n.nodeType === 1 && /^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|UL|OL)$/.test(n.tagName)) {
              while (n.firstChild) cell.insertBefore(n.firstChild, n);
              cell.removeChild(n);
            }
          });
          if (!cell.childNodes.length) cell.appendChild(api.doc.createElement('br'));
        });
      });
      var last = ed.lastElementChild;
      if (last && last.tagName === 'TABLE') {
        var p = api.doc.createElement('p');
        p.appendChild(api.doc.createElement('br'));
        ed.appendChild(p);
      }
    }

    function insertTable() {
      var ed = editor();
      if (!ed) return;
      var table = makeTable(3, 2);
      var row = api.currentRow();
      if (row && row.tagName === 'TABLE') row.parentNode.insertBefore(table, row.nextSibling);
      else if (row && row.parentNode === ed && (row.tagName === 'P' || row.tagName === 'DIV') && api.isEmptyBlock(row)) {
        row.parentNode.replaceChild(table, row);
      } else if (row && row.parentNode) {
        var after = row.tagName === 'LI' ? row.parentNode : row;
        if (after.parentNode) after.parentNode.insertBefore(table, after.nextSibling);
        else ed.appendChild(table);
      } else ed.appendChild(table);
      fixTables();
      focusCell(table.querySelector('th,td'));
    }

    function replaceWithParagraph(el) {
      var p = api.doc.createElement('p');
      var text = (el.innerText || el.textContent || '').replace(/[ \t]+\n/g, '\n').trim();
      if (text) {
        text.split('\n').forEach(function (line, i) {
          if (i) p.appendChild(api.doc.createElement('br'));
          if (line) p.appendChild(api.doc.createTextNode(line));
        });
      }
      if (!p.childNodes.length) p.appendChild(api.doc.createElement('br'));
      el.parentNode.replaceChild(p, el);
      return p;
    }

    function leaveTable() {
      var table = api.closestIn(api.selNode(), 'TABLE');
      if (!table) return;
      api.focusInside(replaceWithParagraph(table));
    }

    function setAlign(dir) {
      var n = api.selNode();
      var cell = n && api.closestIn(n, 'TD,TH');
      if (cell) {
        var table = api.closestIn(cell, 'TABLE');
        var idx = Array.prototype.indexOf.call(cell.parentNode.children, cell);
        var clear = dir === 'left' || cell.getAttribute('data-align') === dir;
        Array.prototype.forEach.call(table.querySelectorAll('tr'), function (tr) {
          var c = tr.children[idx];
          if (!c) return;
          if (clear) c.removeAttribute('data-align');
          else c.setAttribute('data-align', dir);
        });
        return;
      }
      var block = n && api.closestIn(n, 'P,H1,H2,H3,H4,H5,H6,BLOCKQUOTE');
      if (!block) return;
      if (dir === 'left' || block.getAttribute('data-align') === dir) block.removeAttribute('data-align');
      else block.setAttribute('data-align', dir);
    }

    function isBlockEl(node) {
      return node && node.nodeType === 1 && /^(P|DIV|H[1-6]|UL|OL|PRE|BLOCKQUOTE|TABLE|HR|FIGURE)$/.test(node.tagName);
    }

    function blankText(value) {
      return !String(value || '').replace(/[\s\u00a0\u200b\ufeff]/g, '');
    }

    function ensureBlock(node) {
      if (isBlockEl(node)) return node;
      var p = api.doc.createElement('p');
      if (node.parentNode) node.parentNode.insertBefore(p, node);
      if (node) p.appendChild(node);
      if (!p.firstChild) p.appendChild(api.doc.createElement('br'));
      return p;
    }

    function quoteIsBlank(bq) {
      return !bq.querySelector('img, hr, table, pre, ul, ol, figure') && blankText(bq.textContent);
    }

    function copyQuoteChrome(from, to) {
      var kind = from.getAttribute('data-callout');
      if (kind) {
        to.className = from.className;
        to.setAttribute('data-callout', kind);
      }
      var align = from.getAttribute('data-align');
      if (align) to.setAttribute('data-align', align);
    }

    /** The quote's direct child that holds the caret. */
    function quoteLine() {
      var n = api.selNode();
      var bq = n && api.closestIn(n, 'BLOCKQUOTE');
      if (!bq) return null;
      var el = n;
      while (el && el.parentNode !== bq) el = el.parentNode;
      if (!el || el === bq) return null;
      return { bq: bq, line: el };
    }

    function atLineStart(el) {
      var sel = global.getSelection();
      if (!sel || !sel.isCollapsed || !sel.rangeCount) return false;
      if (sel.anchorNode !== el && !(el.contains && el.contains(sel.anchorNode))) return false;
      var range = api.doc.createRange();
      try {
        range.selectNodeContents(el);
        range.setEnd(sel.anchorNode, sel.anchorOffset);
      } catch (err) {
        return false;
      }
      return blankText(range.toString());
    }

    /**
     * Drop the quote and keep every line as a normal block.
     * execCommand('outdent') deletes a line or paints the quote color onto the words.
     */
    function unwrapQuote(bq) {
      var parent = bq && bq.parentNode;
      if (!parent) return null;
      var sel = global.getSelection();
      var anchor = sel && sel.rangeCount ? sel.anchorNode : null;
      var kept = null;
      Array.prototype.slice.call(bq.childNodes).forEach(function (node) {
        if (node.nodeType === 3 && blankText(node.nodeValue)) return;
        var block = ensureBlock(node);
        if (anchor && (block === anchor || (block.contains && block.contains(anchor)))) kept = block;
        else if (!kept) kept = block;
        parent.insertBefore(block, bq);
      });
      if (!kept) {
        kept = api.doc.createElement('p');
        kept.appendChild(api.doc.createElement('br'));
        parent.insertBefore(kept, bq);
      }
      parent.removeChild(bq);
      return kept;
    }

    /** Pull one line out of the quote. The words stay; the other lines stay quoted. */
    function splitQuoteAt(bq, line) {
      var parent = bq.parentNode;
      if (!parent) return null;
      var tail = api.doc.createElement('blockquote');
      copyQuoteChrome(bq, tail);
      var next = line.nextSibling;
      while (next) {
        var follow = next.nextSibling;
        tail.appendChild(next);
        next = follow;
      }
      var block = ensureBlock(line);
      parent.insertBefore(block, bq.nextSibling);
      if (tail.childNodes.length && !quoteIsBlank(tail)) parent.insertBefore(tail, block.nextSibling);
      if (quoteIsBlank(bq)) parent.removeChild(bq);
      api.focusInside(block);
      return block;
    }

    /** Backspace at the start of a quoted line turns it into normal text. */
    function exitQuote() {
      var hit = quoteLine();
      if (!hit || !atLineStart(hit.line)) return false;
      if (blankText(hit.line.textContent)) {
        var empty = hit.line;
        var kept = unwrapQuote(hit.bq);
        api.focusInside(empty.isConnected ? empty : kept);
        return true;
      }
      return !!splitQuoteAt(hit.bq, hit.line);
    }

    /** Enter on an empty quoted line leaves the quote. The lines above stay quoted. */
    function leaveEmptyQuote() {
      var hit = quoteLine();
      if (!hit || !blankText(hit.line.textContent)) return false;
      return !!splitQuoteAt(hit.bq, hit.line);
    }

    function setCallout(kind) {
      leaveTable();
      var bq = api.closestIn(api.selNode(), 'BLOCKQUOTE');
      if (bq && bq.getAttribute('data-callout') === kind) {
        bq.removeAttribute('data-callout');
        bq.classList.remove('dc-callout');
        return;
      }
      if (!bq) {
        api.doc.execCommand('formatBlock', false, '<blockquote>');
        bq = api.closestIn(api.selNode(), 'BLOCKQUOTE');
      }
      if (!bq) return;
      bq.setAttribute('data-callout', kind);
      bq.classList.add('dc-callout');
    }

    function applyRich(kind, color) {
      api.restoreSel();
      var sel = global.getSelection();
      var ed = editor();
      if (!sel || !sel.rangeCount || !ed) return;
      var hostSel = kind === 'hi' ? 'MARK' : '.dc-ink';
      function finish() {
        api.onEdit();
        api.paintToolbarState();
      }
      if (sel.isCollapsed) {
        var host = api.closestIn(api.selNode(), hostSel);
        if (!host || color) return;
        unwrapEl(host);
        finish();
        return;
      }
      var host2 = api.closestIn(api.selNode(), hostSel);
      if (host2 && sel.toString() === host2.textContent) {
        var current = kind === 'hi' ? (host2.getAttribute('data-c') || 'yellow') : (host2.getAttribute('data-c') || '');
        if (!color || current === color) unwrapEl(host2);
        else if (kind === 'hi' && color === 'yellow') host2.removeAttribute('data-c');
        else {
          host2.setAttribute('data-c', color);
          if (kind === 'ink') host2.classList.add('dc-ink');
        }
        finish();
        return;
      }
      if (!color) return;
      var range = sel.getRangeAt(0);
      var el = api.doc.createElement(kind === 'hi' ? 'mark' : 'span');
      if (kind === 'ink') el.className = 'dc-ink';
      if (!(kind === 'hi' && color === 'yellow')) el.setAttribute('data-c', color);
      try {
        range.surroundContents(el);
      } catch (err) {
        el.appendChild(range.extractContents());
        range.insertNode(el);
      }
      var after = api.doc.createTextNode('\u200b');
      if (el.parentNode) el.parentNode.insertBefore(after, el.nextSibling);
      var r = api.doc.createRange();
      r.setStart(after, after.nodeValue.length);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      api.saveSel();
      finish();
    }

    function openChoiceMenu(anchor, items) {
      if (!anchor) return;
      api.saveSel();
      api.closePop();
      var pop = api.h('div', { class: 'dc-pop dc-menu', role: 'menu' }, items.map(function (it) {
        return api.h('button', {
          class: 'dc-menu-item',
          type: 'button',
          onmousedown: function (e) { e.preventDefault(); },
          onclick: function () {
            api.closePop();
            api.restoreSel();
            it.run();
            api.onEdit();
            api.paintToolbarState();
          },
        }, [api.icon(it.icon), api.h('span', { text: it.label })]);
      }));
      api.setPop(pop);
      api.placePop(pop, anchor.getBoundingClientRect());
    }

    function openColorPop(anchor) {
      if (!anchor) return;
      api.saveSel();
      api.closePop();
      function swatch(label, kind, id) {
        var labels = api.inkLabels || {};
        var title = id ? (labels[id] || id) : 'Aucun';
        return api.h('button', {
          type: 'button',
          class: 'dc-swatch' + (id ? ' dc-swatch--' + kind + ' dc-swatch--' + id : ' dc-swatch--none'),
          title: title,
          'aria-label': label + ', ' + title,
          onmousedown: function (e) { e.preventDefault(); },
          onclick: function () {
            api.closePop();
            applyRich(kind, id || '');
          },
        });
      }
      function row(label, kind) {
        var line = api.h('div', { class: 'dc-color-row' });
        line.appendChild(api.h('span', { class: 'dc-color-label', text: label }));
        line.appendChild(swatch(label, kind, ''));
        (api.inks() || []).forEach(function (id) { line.appendChild(swatch(label, kind, id)); });
        return line;
      }
      var pop = api.h('div', { class: 'dc-pop dc-color-pop' }, [row('Texte', 'ink'), row('Surlignage', 'hi')]);
      api.setPop(pop);
      api.placePop(pop, anchor.getBoundingClientRect());
    }

    function openTableMenu(anchor) {
      var cell = api.closestIn(api.selNode(), 'TD,TH');
      if (!cell) {
        insertTable();
        api.onEdit();
        api.paintToolbarState();
        return;
      }
      var table = api.closestIn(cell, 'TABLE');
      openChoiceMenu(anchor, [
        { icon: 'row-insert-bottom', label: 'Ajouter une ligne', run: function () { focusCell(addTableRow(table, cell.parentNode).firstChild); } },
        { icon: 'column-insert-right', label: 'Ajouter une colonne', run: function () { addTableCol(table); } },
        { icon: 'row-remove', label: 'Supprimer la ligne', run: function () { deleteTableRow(cell.parentNode); } },
        { icon: 'column-remove', label: 'Supprimer la colonne', run: function () { deleteTableCol(table, cell); } },
      ]);
    }

    function openCalloutMenu(anchor) {
      openChoiceMenu(anchor, [
        { icon: 'info-circle', label: 'Note', run: function () { setCallout('note'); } },
        { icon: 'bulb', label: 'Conseil', run: function () { setCallout('tip'); } },
        { icon: 'alert-triangle', label: 'Attention', run: function () { setCallout('warning'); } },
      ]);
    }

    function openAlignMenu(anchor) {
      openChoiceMenu(anchor, [
        { icon: 'align-left', label: 'Gauche', run: function () { setAlign('left'); } },
        { icon: 'align-center', label: 'Centre', run: function () { setAlign('center'); } },
        { icon: 'align-right', label: 'Droite', run: function () { setAlign('right'); } },
      ]);
    }

    function run(cmd) {
      if (cmd === 'quote') {
        var bq = api.closestIn(api.selNode(), 'BLOCKQUOTE');
        if (bq) {
          var kept = unwrapQuote(bq);
          if (kept) api.focusInside(kept);
        } else api.doc.execCommand('formatBlock', false, '<blockquote>');
        return true;
      }
      if (cmd === 'highlight') {
        applyRich('hi', api.closestIn(api.selNode(), 'MARK') ? '' : 'yellow');
        return true;
      }
      if (cmd === 'table') {
        insertTable();
        return true;
      }
      if (cmd === 'callout-note' || cmd === 'callout-tip' || cmd === 'callout-warning') {
        setCallout(cmd.slice('callout-'.length));
        return true;
      }
      if (cmd === 'align-left' || cmd === 'align-center' || cmd === 'align-right') {
        setAlign(cmd.slice('align-'.length));
        return true;
      }
      return false;
    }

    return {
      fixTables: fixTables,
      focusCell: focusCell,
      moveTableCell: moveTableCell,
      cellBelow: cellBelow,
      insertTable: insertTable,
      setAlign: setAlign,
      setCallout: setCallout,
      unwrapQuote: unwrapQuote,
      exitQuote: exitQuote,
      leaveEmptyQuote: leaveEmptyQuote,
      applyRich: applyRich,
      openChoiceMenu: openChoiceMenu,
      openColorPop: openColorPop,
      openTableMenu: openTableMenu,
      openCalloutMenu: openCalloutMenu,
      openAlignMenu: openAlignMenu,
      run: run,
    };
  }

  global.DocsRich = { create: create };
})(typeof window !== 'undefined' ? window : this);
