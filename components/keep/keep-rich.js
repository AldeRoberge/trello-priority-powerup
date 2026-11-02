/*
 * Role: rich-text editor of the Notes app. Same Markdown <-> HTML as Documents (DocsModel) and the
 * same table / callout / color actions (DocsRich); only the toolbar and the floating menus are small
 * and local. A note body stays Markdown, so a note opens as a document and the other way round.
 * Exposes window.KeepRich.create(opts) and window.KeepRich.renderInto(el, md).
 */
(function (global) {
  'use strict';

  var INK_LABELS = {
    gray: 'Gris', brown: 'Brun', orange: 'Orange', yellow: 'Jaune', green: 'Vert',
    blue: 'Bleu', purple: 'Violet', pink: 'Rose', red: 'Rouge',
  };

  function DM() { return global.DocsModel; }

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

  function icon(name) {
    return h('i', { class: 'ti ti-' + name, 'aria-hidden': 'true' });
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Read-only rendering of a Markdown body (note cards). */
  function renderInto(el, md) {
    el.innerHTML = DM().mdToHtml(String(md || ''));
    return el;
  }

  /** Flip the `index`-th checkbox of a Markdown body; returns the new Markdown. */
  function toggleTodoAt(md, index) {
    var box = document.createElement('div');
    box.innerHTML = DM().mdToHtml(String(md || ''));
    var items = box.querySelectorAll('ul.dc-todo > li');
    if (!items[index]) return md;
    items[index].setAttribute('data-checked', items[index].getAttribute('data-checked') === 'true' ? 'false' : 'true');
    return DM().domToMd(box).replace(/\s+$/, '');
  }

  function create(opts) {
    opts = opts || {};
    var ed = h('div', {
      class: 'dc-editor k-rich',
      contenteditable: 'true',
      spellcheck: 'true',
      lang: 'fr',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': 'Note',
      'data-placeholder': opts.placeholder || 'Créer une note…',
    });
    var bar = h('div', { class: 'k-rtools', role: 'toolbar', 'aria-label': 'Mise en forme' });
    var root = h('div', { class: 'k-rich-wrap' }, [ed, bar]);
    var lastRange = null;
    var pop = null;
    var rich = null;
    var buttons = {};

    function closestIn(node, selector) {
      var el = node && node.nodeType === 3 ? node.parentNode : node;
      while (el && el !== ed) {
        if (el.nodeType === 1 && el.matches && el.matches(selector)) return el;
        el = el.parentNode;
      }
      return null;
    }
    function selNode() {
      var sel = global.getSelection();
      return sel && sel.rangeCount && ed.contains(sel.anchorNode) ? sel.anchorNode : null;
    }
    function saveSel() {
      var sel = global.getSelection();
      if (sel && sel.rangeCount && ed.contains(sel.anchorNode)) lastRange = sel.getRangeAt(0).cloneRange();
    }
    function restoreSel() {
      var had = document.activeElement === ed;
      ed.focus({ preventScroll: true });
      if (!had && lastRange) {
        var sel = global.getSelection();
        sel.removeAllRanges();
        sel.addRange(lastRange);
      }
    }
    function closePop() {
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
      pop = null;
    }
    function placePop(el, rect) {
      if (el.parentNode !== document.body) document.body.appendChild(el);
      var w = el.offsetWidth;
      var hh = el.offsetHeight;
      var left = Math.max(8, Math.min(rect.left, global.innerWidth - w - 8));
      var top = rect.bottom + 6;
      if (top + hh > global.innerHeight - 8) top = Math.max(8, rect.top - hh - 6);
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    }
    function focusInside(el) {
      if (!el) return;
      ed.focus();
      var sel = global.getSelection();
      var r = document.createRange();
      if (!el.firstChild || el.tagName === 'HR') r.setStartBefore(el);
      else r.selectNodeContents(el);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      saveSel();
    }
    function isEmptyBlock(el) {
      if (!el || el.tagName === 'HR' || el.tagName === 'PRE' || el.tagName === 'TABLE') return false;
      return !/\S/.test(el.textContent || '');
    }
    function currentRow() {
      var n = selNode();
      return n ? closestIn(n, 'LI,P,H1,H2,H3,BLOCKQUOTE,PRE,TD,TH') : null;
    }

    function getMd() {
      return DM().domToMd(ed).replace(/\s+$/, '');
    }
    function paintEmpty() {
      ed.classList.toggle('is-empty', !/\S/.test(ed.textContent || '') && !ed.querySelector('table,hr,li'));
    }
    function changed() {
      paintEmpty();
      paintTools();
      if (opts.onChange) opts.onChange(getMd());
    }

    function docsRich() {
      if (rich || !global.DocsRich) return rich;
      rich = global.DocsRich.create({
        doc: document,
        getEditor: function () { return ed; },
        h: h,
        icon: icon,
        inkLabels: INK_LABELS,
        inks: function () { return DM().RICH_INKS; },
        closestIn: closestIn,
        selNode: selNode,
        saveSel: saveSel,
        restoreSel: restoreSel,
        closePop: closePop,
        placePop: placePop,
        setPop: function (el) { pop = el; },
        onEdit: changed,
        paintToolbarState: paintTools,
        currentRow: currentRow,
        isEmptyBlock: isEmptyBlock,
        focusInside: focusInside,
      });
      return rich;
    }

    function setMd(md) {
      ed.innerHTML = DM().mdToHtml(String(md || ''));
      if (!ed.firstChild) ed.innerHTML = '<p><br></p>';
      var r = docsRich();
      if (r) r.fixTables();
      paintEmpty();
    }

    /* ── formats ─────────────────────────────────────────────────── */

    function markTodo(ul) {
      ul.classList.add('dc-todo');
      Array.prototype.forEach.call(ul.children, function (li) {
        if (li.tagName === 'LI' && !li.hasAttribute('data-checked')) li.setAttribute('data-checked', 'false');
      });
    }
    function unmarkTodo(ul) {
      ul.classList.remove('dc-todo');
      Array.prototype.forEach.call(ul.children, function (li) {
        if (li.tagName === 'LI') li.removeAttribute('data-checked');
      });
    }
    function listOf() {
      var n = selNode();
      var li = n && closestIn(n, 'LI');
      return li && li.parentNode;
    }
    function toggleTodo() {
      var ul = listOf();
      if (ul && ul.tagName === 'UL') {
        if (ul.classList.contains('dc-todo')) {
          unmarkTodo(ul);
          document.execCommand('insertUnorderedList');
        } else markTodo(ul);
        return;
      }
      if (ul && ul.tagName === 'OL') document.execCommand('insertOrderedList');
      document.execCommand('insertUnorderedList');
      var after = listOf();
      if (after && after.tagName === 'UL') markTodo(after);
    }
    function toggleList(kind) {
      var ul = listOf();
      if (kind === 'ul' && ul && ul.tagName === 'UL' && ul.classList.contains('dc-todo')) {
        unmarkTodo(ul);
        return;
      }
      document.execCommand(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
    }
    function blockTag() {
      var b = closestIn(selNode(), 'H1,H2,H3,BLOCKQUOTE,PRE');
      return b ? b.tagName.toLowerCase() : 'p';
    }
    function toggleBlock(tag) {
      document.execCommand('formatBlock', false, '<' + (blockTag() === tag ? 'p' : tag) + '>');
    }
    function toggleQuote() {
      var host = closestIn(selNode(), 'BLOCKQUOTE');
      var r = docsRich();
      if (host && r) {
        var turned = r.unwrapQuote(host);
        if (turned) focusInside(turned);
      } else if (host) document.execCommand('formatBlock', false, '<p>');
      else document.execCommand('formatBlock', false, '<blockquote>');
    }
    function openLink(anchor) {
      saveSel();
      var sel = global.getSelection();
      var text = sel && sel.toString();
      var url = global.prompt('Adresse du lien', 'https://');
      if (!url) return;
      url = String(url).trim();
      if (DM().SAFE_URL && !DM().SAFE_URL.test(url)) return;
      restoreSel();
      if (text) document.execCommand('createLink', false, url);
      else document.execCommand('insertHTML', false, '<a href="' + escHtml(url) + '">' + escHtml(url) + '</a>​');
      changed();
    }

    /* Chrome can drop the caret at the start of the block after a list or block command: put it back. */
    var BLOCKS = 'LI,H1,H2,H3,BLOCKQUOTE,PRE,P';
    function caretIn() {
      var sel = global.getSelection();
      var n = selNode();
      var block = n && closestIn(n, BLOCKS);
      if (!block || !sel.isCollapsed) return null;
      var r = document.createRange();
      r.selectNodeContents(block);
      r.setEnd(sel.anchorNode, sel.anchorOffset);
      return r.toString().length;
    }
    function putCaret(offset) {
      var n = selNode();
      var block = n && closestIn(n, BLOCKS);
      if (!block || offset == null) return;
      var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      var left = offset;
      var node = walker.nextNode();
      var last = null;
      while (node) {
        last = node;
        if (left <= node.nodeValue.length) break;
        left -= node.nodeValue.length;
        node = walker.nextNode();
      }
      var sel = global.getSelection();
      var r = document.createRange();
      if (last) r.setStart(last, Math.min(left, last.nodeValue.length));
      else r.setStart(block, 0);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    function keepCaret(fn) {
      return function (b) {
        var at = caretIn();
        fn(b);
        putCaret(at);
      };
    }

    var TOOLS = [
      { id: 'bold', i: 'bold', t: 'Gras', run: function () { document.execCommand('bold'); } },
      { id: 'italic', i: 'italic', t: 'Italique', run: function () { document.execCommand('italic'); } },
      { id: 'underline', i: 'underline', t: 'Souligné', run: function () { document.execCommand('underline'); } },
      { id: 'strike', i: 'strikethrough', t: 'Barré', run: function () { document.execCommand('strikeThrough'); } },
      { id: 'h2', i: 'heading', t: 'Titre', run: keepCaret(function () { toggleBlock('h2'); }) },
      { id: 'ul', i: 'list', t: 'Puces', run: keepCaret(function () { toggleList('ul'); }) },
      { id: 'ol', i: 'list-numbers', t: 'Numérotée', run: keepCaret(function () { toggleList('ol'); }) },
      { id: 'todo', i: 'checkbox', t: 'Liste à cocher', run: keepCaret(toggleTodo) },
      { id: 'quote', i: 'quote', t: 'Citation', run: keepCaret(toggleQuote) },
      { id: 'pre', i: 'code', t: 'Code', run: keepCaret(function () { toggleBlock('pre'); }) },
      { id: 'link', i: 'link', t: 'Lien', run: openLink },
      { id: 'color', i: 'palette', t: 'Couleur', run: function (b) { var r = docsRich(); if (r) r.openColorPop(b); } },
      { id: 'table', i: 'table', t: 'Tableau', run: function () { var r = docsRich(); if (r) r.insertTable(); } },
      { id: 'callout', i: 'info-square', t: 'Encadré', run: function (b) { var r = docsRich(); if (r) r.openCalloutMenu(b); } },
    ];

    TOOLS.forEach(function (tool) {
      var b = h('button', { class: 'k-btn k-rtool', type: 'button', title: tool.t, 'aria-label': tool.t }, [icon(tool.i)]);
      b.addEventListener('mousedown', function (e) { e.preventDefault(); saveSel(); });
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        closePop();
        restoreSel();
        tool.run(b);
        changed();
      });
      buttons[tool.id] = b;
      bar.appendChild(b);
    });

    function paintTools() {
      function on(id, v) { if (buttons[id]) buttons[id].classList.toggle('is-on', !!v); }
      function state(cmd) {
        try { return document.queryCommandState(cmd); } catch (e) { return false; }
      }
      var n = selNode();
      var ul = n && closestIn(n, 'LI') && closestIn(n, 'LI').parentNode;
      on('bold', state('bold'));
      on('italic', state('italic'));
      on('underline', state('underline'));
      on('strike', state('strikeThrough'));
      on('h2', blockTag() === 'h2');
      on('pre', blockTag() === 'pre');
      on('ul', ul && ul.tagName === 'UL' && !ul.classList.contains('dc-todo'));
      on('ol', ul && ul.tagName === 'OL');
      on('todo', ul && ul.classList.contains('dc-todo'));
      on('quote', n && closestIn(n, 'BLOCKQUOTE'));
    }

    /* ── slash menu (same blocks as Documents: type "/" for a table, a callout, a title...) ── */

    var SLASH = [
      { id: 'p', label: 'Texte', icon: 'text-size', kw: 'paragraphe normal texte' },
      { id: 'h1', label: 'Titre 1', icon: 'h-1', kw: 'heading titre grand' },
      { id: 'h2', label: 'Titre 2', icon: 'h-2', kw: 'heading titre moyen' },
      { id: 'h3', label: 'Titre 3', icon: 'h-3', kw: 'heading titre petit' },
      { id: 'ul', label: 'Liste à puces', icon: 'list', kw: 'liste puces bullet' },
      { id: 'ol', label: 'Liste numérotée', icon: 'list-numbers', kw: 'liste numerotee numero' },
      { id: 'todo', label: 'Liste de tâches', icon: 'list-check', kw: 'checklist cases cocher todo' },
      { id: 'quote', label: 'Citation', icon: 'quote', kw: 'citation quote' },
      { id: 'codeblock', label: 'Bloc de code', icon: 'file-code', kw: 'code' },
      { id: 'hr', label: 'Séparateur', icon: 'separator-horizontal', kw: 'ligne separateur' },
      { id: 'table', label: 'Tableau', icon: 'table', kw: 'tableau table grille colonnes' },
      { id: 'callout-note', label: 'Note', icon: 'info-circle', kw: 'encadre note info appel' },
      { id: 'callout-tip', label: 'Conseil', icon: 'bulb', kw: 'encadre conseil astuce tip' },
      { id: 'callout-warning', label: 'Attention', icon: 'alert-triangle', kw: 'encadre attention avertissement warning' },
      { id: 'align-left', label: 'Aligner à gauche', icon: 'align-left', kw: 'aligner gauche left' },
      { id: 'align-center', label: 'Aligner au centre', icon: 'align-center', kw: 'aligner centre center milieu' },
      { id: 'align-right', label: 'Aligner à droite', icon: 'align-right', kw: 'aligner droite right' },
    ];
    var sugg = null;
    var suggEl = null;

    function closeSugg() {
      sugg = null;
      if (suggEl && suggEl.parentNode) suggEl.parentNode.removeChild(suggEl);
      suggEl = null;
    }
    function textBeforeCaret() {
      var sel = global.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed || !ed.contains(sel.anchorNode)) return null;
      var n = sel.anchorNode;
      if (n.nodeType !== 3) return null;
      return { node: n, offset: sel.anchorOffset, text: n.nodeValue.slice(0, sel.anchorOffset) };
    }
    function paintSugg() {
      if (!sugg) return closeSugg();
      if (!suggEl) suggEl = h('div', { class: 'dc-suggest k-suggest', role: 'listbox' });
      suggEl.textContent = '';
      suggEl.appendChild(h('div', { class: 'dc-sg-head' }, [h('span', { text: 'Commandes' })]));
      sugg.entries.forEach(function (c, i) {
        var row = h('div', { class: 'dc-sg-row' + (i === sugg.active ? ' is-active' : ''), role: 'option' }, [
          icon(c.icon).cloneNode(true),
          h('span', { class: 'dc-sg-label', text: c.label }),
        ]);
        row.firstChild.className = 'ti ti-' + c.icon + ' dc-sg-icon';
        row.addEventListener('mousedown', function (e) { e.preventDefault(); applySlash(c); });
        row.addEventListener('mousemove', function () {
          if (sugg && sugg.active !== i) { sugg.active = i; paintSugg(); }
        });
        suggEl.appendChild(row);
      });
      var sel = global.getSelection();
      var rect = null;
      if (sel && sel.rangeCount) {
        var r = sel.getRangeAt(0).cloneRange();
        r.collapse(true);
        rect = r.getClientRects()[0];
      }
      if (!rect || !(rect.width || rect.height)) rect = ed.getBoundingClientRect();
      placePop(suggEl, rect);
      var on = suggEl.querySelector('.is-active');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }
    function updateSlash() {
      var before = textBeforeCaret();
      var sl = before && DM().detectSlash(before.text);
      if (!sl) return closeSugg();
      var q = DM().fold(sl.query);
      var entries = SLASH.filter(function (c) { return !q || DM().fold(c.label + ' ' + c.kw).indexOf(q) >= 0; });
      if (!entries.length) return closeSugg();
      var keep = sugg ? sugg.active : 0;
      sugg = { length: sl.length, entries: entries, active: Math.min(keep, entries.length - 1) };
      paintSugg();
    }
    function runSlash(id) {
      var r = docsRich();
      if (r && r.run(id)) return;
      if (id === 'p' || id === 'h1' || id === 'h2' || id === 'h3') document.execCommand('formatBlock', false, '<' + id + '>');
      else if (id === 'ul') { if (!listOf()) toggleList('ul'); }
      else if (id === 'ol') { if (!listOf()) toggleList('ol'); }
      else if (id === 'todo') { toggleTodo(); }
      else if (id === 'codeblock') document.execCommand('formatBlock', false, '<pre>');
      else if (id === 'hr') {
        document.execCommand('insertHorizontalRule');
        var hr = ed.querySelector('hr:not([data-k])');
        if (hr) {
          hr.setAttribute('data-k', '1');
          if (!hr.nextElementSibling) {
            var p = document.createElement('p');
            p.appendChild(document.createElement('br'));
            hr.parentNode.insertBefore(p, hr.nextSibling);
          }
          focusInside(hr.nextElementSibling);
        }
      }
    }
    function applySlash(c) {
      var s = sugg;
      closeSugg();
      if (!s) return;
      ed.focus({ preventScroll: true });
      var before = textBeforeCaret();
      if (before && before.offset >= s.length) {
        var range = document.createRange();
        range.setStart(before.node, before.offset - s.length);
        range.setEnd(before.node, before.offset);
        var sel = global.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('delete');
      }
      saveSel();
      runSlash(c.id);
      Array.prototype.forEach.call(ed.querySelectorAll('hr[data-k]'), function (x) { x.removeAttribute('data-k'); });
      changed();
    }
    function slashKey(e) {
      if (!sugg) return false;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSugg(); return true; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var n = sugg.entries.length;
        sugg.active = (sugg.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        paintSugg();
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySlash(sugg.entries[sugg.active]);
        return true;
      }
      return false;
    }

    /* ── editing behaviour ───────────────────────────────────────── */

    ed.addEventListener('input', function (e) {
      if (!ed.firstChild) ed.innerHTML = '<p><br></p>';
      if (e && e.inputType === 'insertParagraph') {
        var li = closestIn(selNode(), 'LI');
        if (li && li.parentNode.classList.contains('dc-todo') && !/\S/.test(li.textContent || '')) li.setAttribute('data-checked', 'false');
      }
      changed();
      updateSlash();
    });

    ed.addEventListener('keydown', function (e) {
      if (slashKey(e)) return;
      if (e.key === 'Tab') {
        var cell = closestIn(selNode(), 'TD,TH');
        var r = docsRich();
        if (cell && r) {
          e.preventDefault();
          r.moveTableCell(cell, e.shiftKey ? -1 : 1);
          changed();
        }
        return;
      }
      var rr = docsRich();
      var sel0 = global.getSelection();
      if (rr && e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        var cellEnter = closestIn(selNode(), 'TD,TH');
        if (cellEnter) {
          e.preventDefault();
          var below = rr.cellBelow(cellEnter);
          if (below) rr.focusCell(below);
          changed();
          return;
        }
        if (rr.leaveEmptyQuote()) { e.preventDefault(); changed(); return; }
      }
      if (rr && e.key === 'Backspace' && sel0 && sel0.isCollapsed && rr.exitQuote()) {
        e.preventDefault();
        changed();
        return;
      }
      var mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && String(e.key).toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); changed(); }
      else if (mod && !e.altKey && String(e.key).toLowerCase() === 'i') { e.preventDefault(); document.execCommand('italic'); changed(); }
      else if (mod && !e.altKey && String(e.key).toLowerCase() === 'u') { e.preventDefault(); document.execCommand('underline'); changed(); }
    });

    ed.addEventListener('mousedown', function (e) {
      var li = e.target && e.target.tagName === 'LI' ? e.target : null;
      if (!li || !li.parentNode.classList.contains('dc-todo')) return;
      if (e.clientX - li.getBoundingClientRect().left > 26) return;
      e.preventDefault();
      li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true');
      changed();
    });

    ed.addEventListener('paste', function (e) {
      var cd = e.clipboardData;
      if (!cd) return;
      var html = cd.getData('text/html');
      var text = cd.getData('text/plain');
      if (!html && !text) return;
      e.preventDefault();
      var out;
      if (html) {
        var parsed = new DOMParser().parseFromString(html, 'text/html');
        out = DM().mdToHtml(DM().domToMd(parsed.body));
      } else out = DM().mdToHtml(text);
      document.execCommand('insertHTML', false, out);
      var r = docsRich();
      if (r) r.fixTables();
      changed();
    });

    ed.addEventListener('keyup', function () { saveSel(); paintTools(); });
    ed.addEventListener('mouseup', function () { saveSel(); paintTools(); });
    ed.addEventListener('blur', function () { saveSel(); global.setTimeout(closeSugg, 120); });
    document.addEventListener('mousedown', function (e) {
      if (pop && !pop.contains(e.target) && !bar.contains(e.target)) closePop();
    });

    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, false);
    } catch (err) { /* old engines */ }

    setMd(opts.md || '');

    return {
      el: root,
      ed: ed,
      getMd: getMd,
      setMd: function (md) { setMd(md); changed(); },
      focus: function () { ed.focus(); },
      toggleTodo: function () { ed.focus(); keepCaret(toggleTodo)(); changed(); },
      destroy: function () { closePop(); closeSugg(); },
    };
  }

  global.KeepRich = { create: create, renderInto: renderInto, toggleTodoAt: toggleTodoAt };
})(typeof window !== 'undefined' ? window : globalThis);
