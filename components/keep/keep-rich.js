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

    var TOOLS = [
      { id: 'bold', i: 'bold', t: 'Gras', run: function () { document.execCommand('bold'); } },
      { id: 'italic', i: 'italic', t: 'Italique', run: function () { document.execCommand('italic'); } },
      { id: 'underline', i: 'underline', t: 'Souligné', run: function () { document.execCommand('underline'); } },
      { id: 'strike', i: 'strikethrough', t: 'Barré', run: function () { document.execCommand('strikeThrough'); } },
      { id: 'h2', i: 'heading', t: 'Titre', run: function () { toggleBlock('h2'); } },
      { id: 'ul', i: 'list', t: 'Puces', run: function () { toggleList('ul'); } },
      { id: 'ol', i: 'list-numbers', t: 'Numérotée', run: function () { toggleList('ol'); } },
      { id: 'todo', i: 'checkbox', t: 'Liste à cocher', run: toggleTodo },
      { id: 'quote', i: 'quote', t: 'Citation', run: toggleQuote },
      { id: 'pre', i: 'code', t: 'Code', run: function () { toggleBlock('pre'); } },
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

    /* ── editing behaviour ───────────────────────────────────────── */

    ed.addEventListener('input', function (e) {
      if (!ed.firstChild) ed.innerHTML = '<p><br></p>';
      if (e && e.inputType === 'insertParagraph') {
        var li = closestIn(selNode(), 'LI');
        if (li && li.parentNode.classList.contains('dc-todo') && !/\S/.test(li.textContent || '')) li.setAttribute('data-checked', 'false');
      }
      changed();
    });

    ed.addEventListener('keydown', function (e) {
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
    ed.addEventListener('blur', saveSel);
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
      toggleTodo: function () { ed.focus(); toggleTodo(); changed(); },
      destroy: closePop,
    };
  }

  global.KeepRich = { create: create, renderInto: renderInto, toggleTodoAt: toggleTodoAt };
})(typeof window !== 'undefined' ? window : globalThis);
