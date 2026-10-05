/*
 * Role: UI of the Document view, a Google-Docs-like editor for the board's documents.
 *  - left: the board's documents (search, new, duplicate, export, delete); right: outline of the headings
 *  - toolbar + keyboard shortcuts + Markdown shortcuts ("# ", "- ", "1. ", "[] ", "> ") + "/" command menu
 *  - "@" mentions: @ people (and everything), @@ tasks, @@@ documents; chips open the card / document
 *  - autosave (debounced) with revision check, so two people editing the same document are warned
 * Data + writes: DocsTrello; pure helpers (Markdown <-> HTML, mention search): DocsModel. Icons: Tabler webfont.
 *
 * Contents
 *   1. helpers          2. mount: state + skeleton       3. documents list (sidebar)
 *   4. editor surface   5. commands + toolbar            6. suggestions (@ and /)
 *   7. popovers/dialogs 8. saving + remote refresh       9. boot
 */
(function (global) {
  'use strict';

  var DM = function () {
    return global.DocsModel;
  };
  var DT = function () {
    return global.DocsTrello;
  };

  var SAVE_DELAY_MS = 1200;
  var REFRESH_MIN_MS = 20000;
  var LAST_KEY = 'cerveau.docs.last';

  /* ── 1. Helpers ──────────────────────────────────────────────────── */

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
    return h('i', { class: 'ti ti-' + name + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
  }

  function remember(key, value) {
    try {
      if (value == null) global.localStorage.removeItem(key);
      else global.localStorage.setItem(key, value);
    } catch (e) {
      /* storage unavailable in this iframe: the last document is just not remembered */
    }
  }
  function recall(key) {
    try {
      return global.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function reasonText(err) {
    var r = (err && (err.reason || err.message)) || '';
    if (r === 'not-authorized' || r === 'no-token' || r === 'auth-failed') return 'Autorisez Trello pour enregistrer vos documents.';
    if (r === 'http-401' || r === 'http-403') return 'L’autorisation Trello a expiré ou ne couvre pas ce tableau.';
    if (r === 'http-404') return 'Ce document n’existe plus.';
    if (r === 'too-long') return 'Le document dépasse la taille maximale d’une description Trello (16 384 caractères).';
    if (r === 'no-list') return 'Le tableau n’a aucune liste : créez-en une pour pouvoir ajouter des documents.';
    if (r === 'no-app-key') return 'Clé API Trello absente (components/shared/rest-config.js).';
    if (r === 'conflict') return 'Ce document a été modifié par quelqu’un d’autre.';
    return 'Échec : ' + (r || 'erreur inconnue');
  }

  function isAuthReason(err) {
    var r = err && (err.reason || err.message);
    return r === 'not-authorized' || r === 'no-token' || r === 'auth-failed' || r === 'http-401';
  }

  var BLOCK_SEL = 'P,DIV,H1,H2,H3,H4,H5,H6,LI,BLOCKQUOTE,PRE';

  var COMMANDS = [
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
    { id: 'mention-person', label: 'Mentionner une personne', icon: 'user', hint: '@', kw: 'personne mention arobase' },
    { id: 'mention-task', label: 'Lier une tâche', icon: 'checkbox', hint: '@@', kw: 'tache carte lien' },
    { id: 'mention-doc', label: 'Lier un document', icon: 'file-text', hint: '@@@', kw: 'document page lien' },
  ];

  /* ── 2. Mount: state + skeleton ──────────────────────────────────── */

  function mount(root, t) {
    var state = {
      docs: [],
      docsLoaded: false,
      filter: '',
      current: null, // {id,title,body,rev,updatedAt} as last loaded / saved
      authOk: true,
      sources: null,
      index: null,
      saveState: 'saved', // saved | dirty | saving | error | conflict
      saveMsg: '',
      conflict: null,
      busy: '',
      sideCollapsed: false,
    };
    var editor = null;
    var saving = false;
    var saveTimer = null;
    var lastMd = '';
    var savedTitle = '';
    var lastRange = null;
    var sugg = null; // {kind:'mention'|'slash', trig, entries, active}
    var pop = null; // open popover element
    var metaTimer = null;
    var lastRefreshAt = Date.now();
    var toastTimer = null;
    var loadToken = 0;

    root.innerHTML = '';
    var els = {
      banner: h('div', { class: 'dc-banner', hidden: true }),
      side: h('aside', { class: 'dc-side', 'aria-label': 'Documents' }),
      sideList: h('div', { class: 'dc-list', role: 'listbox' }),
      search: h('input', { class: 'dc-search-input', type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher un document' }),
      main: h('section', { class: 'dc-doc' }),
      head: h('div', { class: 'dc-head' }),
      headTitle: h('span', { class: 'dc-head-title' }),
      toolbar: h('div', { class: 'dc-toolbar', role: 'toolbar', 'aria-label': 'Mise en forme' }),
      conflict: h('div', { class: 'dc-conflict', hidden: true, role: 'alert' }),
      scroll: h('div', { class: 'dc-scroll' }),
      page: h('article', { class: 'dc-page' }),
      title: h('input', { class: 'dc-title', type: 'text', placeholder: 'Sans titre', maxlength: String(DM().MAX_TITLE), 'aria-label': 'Titre du document', spellcheck: 'true' }),
      meta: h('div', { class: 'dc-meta' }),
      empty: h('div', { class: 'dc-empty', hidden: true }),
      outline: h('aside', { class: 'dc-outline', 'aria-label': 'Plan du document' }),
      suggest: h('div', { class: 'dc-suggest', hidden: true, role: 'listbox' }),
      toast: h('div', { class: 'dc-toast', hidden: true, role: 'status', 'aria-live': 'polite' }),
      status: h('span', { class: 'dc-status' }),
    };
    var shell = h('div', { class: 'dc-root', tabindex: '-1' }, [
      els.banner,
      h('div', { class: 'dc-main' }, [els.side, els.main, els.outline]),
      els.suggest,
      els.toast,
    ]);
    root.appendChild(shell);

    els.main.appendChild(els.head);
    els.main.appendChild(els.toolbar);
    els.main.appendChild(els.conflict);
    els.main.appendChild(els.scroll);
    els.main.appendChild(els.empty);
    els.scroll.appendChild(els.page);
    els.page.appendChild(els.title);
    els.page.appendChild(els.meta);

    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, false);
    } catch (e) {
      /* old engines */
    }

    /* toast / banner / status */
    function toast(msg, kind, action) {
      clearTimeout(toastTimer);
      els.toast.hidden = !msg;
      els.toast.className = 'dc-toast' + (kind ? ' is-' + kind : '');
      els.toast.textContent = '';
      if (!msg) return;
      els.toast.appendChild(document.createTextNode(msg));
      if (action) {
        els.toast.appendChild(
          h('button', {
            class: 'dc-link',
            onclick: function () {
              toast('');
              action.run();
            },
          }, [action.label])
        );
      }
      if (kind !== 'error') toastTimer = setTimeout(function () { toast(''); }, action ? 7000 : 2600);
    }

    /** The banner is for losing the token while editing; with no document open the empty state asks instead. */
    function paintBanner() {
      els.banner.textContent = '';
      els.banner.hidden = state.authOk || !state.current;
      if (els.banner.hidden) return;
      els.banner.appendChild(icon('lock'));
      els.banner.appendChild(h('span', { text: 'Trello doit être autorisé pour lire et enregistrer les documents.' }));
      els.banner.appendChild(authButton());
    }

    function authButton() {
      return h('button', {
        class: 'dc-btn dc-btn--primary',
        onclick: function () {
          DT().authorize(t).then(
            function () {
              state.authOk = true;
              paintBanner();
              if (state.current) saveNow({ retry: true });
              else boot();
            },
            function (err) {
              toast(reasonText(err), 'error');
            }
          );
        },
      }, [icon('key'), 'Autoriser Trello']);
    }

    function setSave(kind, msg) {
      state.saveState = kind;
      state.saveMsg = msg || '';
      paintStatus();
    }

    function paintStatus() {
      var s = els.status;
      s.className = 'dc-status is-' + state.saveState;
      s.textContent = '';
      if (!state.current) return;
      var k = state.saveState;
      if (k === 'saved') s.appendChild(icon('cloud-check'));
      else if (k === 'dirty') s.appendChild(icon('pencil'));
      else if (k === 'saving') s.appendChild(icon('loader-2', 'dc-spin'));
      else s.appendChild(icon('alert-triangle'));
      var label =
        k === 'saved' ? 'Enregistré' : k === 'dirty' ? 'Modifications non enregistrées' : k === 'saving' ? 'Enregistrement…' : state.saveMsg || 'Échec de l’enregistrement';
      s.appendChild(h('span', { text: label }));
      if (k === 'error') {
        s.appendChild(h('button', { class: 'dc-link', onclick: function () { saveNow({ retry: true }); } }, ['Réessayer']));
      }
    }

    /* ── 3. Documents list (sidebar) ─────────────────────────────── */

    function sortDocs() {
      state.docs.sort(function (a, b) {
        return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
      });
    }

    function buildSide() {
      els.side.textContent = '';
      els.side.appendChild(
        h('div', { class: 'dc-side-head' }, [
          h('span', { class: 'dc-side-title', text: 'Documents' }),
          h('button', {
            class: 'dc-btn dc-btn--primary dc-new',
            title: 'Nouveau document',
            onclick: function () { newDoc(); },
          }, [icon('plus'), h('span', { text: 'Nouveau' })]),
        ])
      );
      els.search.addEventListener('input', function () {
        state.filter = els.search.value;
        paintList();
      });
      els.side.appendChild(h('label', { class: 'dc-search' }, [icon('search'), els.search]));
      els.side.appendChild(els.sideList);
    }

    function paintList() {
      var list = els.sideList;
      list.textContent = '';
      if (!state.docsLoaded) {
        for (var i = 0; i < 5; i++) list.appendChild(h('div', { class: 'dc-skel' }, [h('span', { class: 'dc-skel-bar' })]));
        return;
      }
      var docs = DM().filterDocs(state.docs, state.filter);
      if (!docs.length) {
        list.appendChild(
          h('p', {
            class: 'dc-list-empty',
            text: !state.authOk ? 'Autorisation Trello requise.' : state.filter ? 'Aucun document ne correspond.' : 'Aucun document pour l’instant.',
          })
        );
        return;
      }
      docs.forEach(function (d) {
        var on = state.current && state.current.id === d.id;
        var more = h('button', {
          class: 'dc-item-more',
          title: 'Actions',
          'aria-label': 'Actions du document',
          onclick: function (e) {
            e.stopPropagation();
            openDocMenu(more, d.id);
          },
        }, [icon('dots')]);
        var row = h('div', {
          class: 'dc-item' + (on ? ' is-on' : ''),
          role: 'option',
          'aria-selected': on ? 'true' : 'false',
          tabindex: '0',
          'data-id': d.id,
          onclick: function () { openDoc(d.id); },
          onkeydown: function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openDoc(d.id);
            }
          },
          oncontextmenu: function (e) {
            e.preventDefault();
            openDocMenu(more, d.id);
          },
        }, [
          icon('file-text', 'dc-item-icon'),
          h('span', { class: 'dc-item-main' }, [
            h('span', { class: 'dc-item-title', text: d.title }),
            h('span', { class: 'dc-item-time', text: DM().relativeTime(d.updatedAt) }),
          ]),
          more,
        ]);
        list.appendChild(row);
      });
    }

    function touchListItem(id, patch) {
      var d = state.docs.filter(function (x) { return x.id === id; })[0];
      if (!d) return;
      Object.keys(patch).forEach(function (k) { d[k] = patch[k]; });
      sortDocs();
      paintList();
    }

    /* ── 4. Editor surface ───────────────────────────────────────── */

    function closestIn(node, selector) {
      var el = node && node.nodeType === 3 ? node.parentNode : node;
      while (el && el !== editor) {
        if (el.nodeType === 1 && el.matches && el.matches(selector)) return el;
        el = el.parentNode;
      }
      return null;
    }

    function selNode() {
      var sel = global.getSelection();
      return sel && sel.rangeCount && editor && editor.contains(sel.anchorNode) ? sel.anchorNode : null;
    }

    function saveSel() {
      var sel = global.getSelection();
      if (sel && sel.rangeCount && editor && editor.contains(sel.anchorNode)) lastRange = sel.getRangeAt(0).cloneRange();
    }

    /**
     * Gives the editor focus back with the selection it had. When it already had focus the live
     * selection is kept (toolbar buttons do not steal focus); otherwise (popover input, <select>)
     * focus() would reset the caret to the start, so the remembered range is put back.
     */
    function restoreSel() {
      if (!editor) return;
      var had = document.activeElement === editor;
      editor.focus({ preventScroll: true });
      var sel = global.getSelection();
      if (!had && lastRange) {
        sel.removeAllRanges();
        sel.addRange(lastRange);
      }
    }

    /** Anything typed or pasted straight into the root (outside a block) is wrapped in a paragraph. */
    function normalizeRoot() {
      if (!editor) return;
      var sel = global.getSelection();
      var keep = sel && sel.rangeCount && editor.contains(sel.anchorNode)
        ? { an: sel.anchorNode, ao: sel.anchorOffset, fn: sel.focusNode, fo: sel.focusOffset }
        : null;
      var changed = false;
      var run = [];
      function flush() {
        if (!run.length) return;
        var p = document.createElement('p');
        editor.insertBefore(p, run[0]);
        run.forEach(function (n) { p.appendChild(n); });
        run = [];
        changed = true;
      }
      Array.prototype.slice.call(editor.childNodes).forEach(function (n) {
        var inline = n.nodeType === 3
          ? /[^\s]|\u00a0/.test(n.nodeValue)
          : n.nodeType === 1 && !/^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|PRE|HR|TABLE)$/.test(n.nodeName);
        if (inline) run.push(n);
        else flush();
      });
      flush();
      if (changed && keep) sel.setBaseAndExtent(keep.an, keep.ao, keep.fn, keep.fo);
    }

    function textBeforeCaret() {
      var sel = global.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed || !editor || !editor.contains(sel.anchorNode)) return null;
      var block = closestIn(sel.anchorNode, BLOCK_SEL) || editor;
      var r = document.createRange();
      r.selectNodeContents(block);
      r.setEnd(sel.anchorNode, sel.anchorOffset);
      return r.toString();
    }

    /** Selects the n characters just before the caret (the typed "@que" / "/tit"). */
    function selectBackward(n) {
      var sel = global.getSelection();
      var node = sel.anchorNode;
      var off = sel.anchorOffset;
      if (!node || node.nodeType !== 3) return false;
      var walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      var range = document.createRange();
      range.setEnd(node, off);
      var remaining = n;
      while (remaining > 0 && node) {
        var take = Math.min(off, remaining);
        off -= take;
        remaining -= take;
        if (remaining === 0) {
          range.setStart(node, off);
          break;
        }
        walker.currentNode = node;
        var prev = walker.previousNode();
        if (!prev) {
          range.setStart(node, 0);
          break;
        }
        node = prev;
        off = prev.nodeValue.length;
      }
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }

    function isEmptyDoc() {
      return !editor.querySelector('.dc-mention, hr, li, pre, blockquote, h1, h2, h3') && !/\S/.test(editor.textContent.replace(/\u200b/g, ''));
    }

    function paintEmptyClass() {
      editor.classList.toggle('is-empty', isEmptyDoc());
    }

    function blockType() {
      var n = selNode();
      if (!n) return 'p';
      if (closestIn(n, 'PRE')) return 'codeblock';
      var hd = closestIn(n, 'H1,H2,H3,H4,H5,H6');
      if (hd) return 'h' + Math.min(3, parseInt(hd.tagName.charAt(1), 10));
      return 'p';
    }

    function paintToolbarState() {
      if (!editor) return;
      var n = selNode();
      var inEditor = !!n;
      function on(cmd, v) {
        var b = els.toolbar.querySelector('[data-cmd="' + cmd + '"]');
        if (b) {
          b.classList.toggle('is-on', !!v);
          b.setAttribute('aria-pressed', v ? 'true' : 'false');
        }
      }
      var q = function (c) {
        try { return inEditor && document.queryCommandState(c); } catch (e) { return false; }
      };
      on('bold', q('bold'));
      on('italic', q('italic'));
      on('underline', q('underline'));
      on('strike', q('strikeThrough'));
      on('code', inEditor && !!closestIn(n, 'CODE'));
      on('link', inEditor && !!closestIn(n, 'A'));
      var li = inEditor && closestIn(n, 'LI');
      var list = li && li.parentNode;
      on('ul', !!list && list.tagName === 'UL' && !list.classList.contains('dc-todo'));
      on('ol', !!list && list.tagName === 'OL');
      on('todo', !!list && list.tagName === 'UL' && list.classList.contains('dc-todo'));
      on('quote', inEditor && !!closestIn(n, 'BLOCKQUOTE'));
      on('codeblock', inEditor && !!closestIn(n, 'PRE'));
      var sel = els.toolbar.querySelector('.dc-select');
      if (sel && inEditor) sel.value = blockType() === 'codeblock' ? 'p' : blockType();
    }

    function onEdit() {
      normalizeRoot();
      fixChips();
      paintEmptyClass();
      if (state.saveState !== 'conflict') setSave('dirty');
      scheduleSave(SAVE_DELAY_MS);
      clearTimeout(metaTimer);
      metaTimer = setTimeout(function () {
        paintMeta();
        paintOutline();
      }, 350);
    }

    function paintMeta() {
      els.meta.textContent = '';
      if (!state.current || !editor) return;
      var words = DM().countWords(editor.innerText || editor.textContent || '');
      var parts = [words + (words > 1 ? ' mots' : ' mot')];
      if (state.current.updatedAt) parts.push('modifié ' + DM().relativeTime(state.current.updatedAt));
      els.meta.appendChild(h('span', { text: parts.join(' · ') }));
      var size = DM().sizeInfo(lastDomMd());
      if (size.ratio >= 0.8) {
        var over = size.over;
        els.meta.appendChild(
          h('span', {
            class: 'dc-size' + (over ? ' is-over' : ''),
            title: 'Un document est stocké dans la description d’une carte Trello (16 384 caractères au maximum).',
            text: size.length.toLocaleString('fr-FR') + ' / ' + size.max.toLocaleString('fr-FR') + ' car.',
          })
        );
      }
    }

    function lastDomMd() {
      return editor ? DM().domToMd(editor) : '';
    }

    function paintOutline() {
      els.outline.textContent = '';
      if (!editor) return;
      var heads = Array.prototype.slice.call(editor.querySelectorAll('h1,h2,h3')).filter(function (x) {
        return /\S/.test(x.textContent);
      });
      els.outline.classList.toggle('is-empty', !heads.length);
      if (!heads.length) return;
      els.outline.appendChild(h('div', { class: 'dc-outline-title', text: 'Plan' }));
      heads.forEach(function (el) {
        els.outline.appendChild(
          h('button', {
            class: 'dc-outline-item dc-outline-item--' + el.tagName.toLowerCase(),
            title: el.textContent,
            onclick: function () {
              el.scrollIntoView({ block: 'start', behavior: 'smooth' });
            },
          }, [el.textContent])
        );
      });
    }

    function buildEditor(doc) {
      var old = els.page.querySelector('.dc-editor');
      var ed = h('div', {
        class: 'dc-editor',
        contenteditable: 'true',
        spellcheck: 'true',
        lang: 'fr',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Contenu du document',
        'data-placeholder': 'Écrivez ici… « / » pour les commandes, « @ » pour mentionner une personne, « @@ » une tâche, « @@@ » un document',
      });
      ed.innerHTML = DM().mdToHtml(doc.body);
      if (old) els.page.replaceChild(ed, old);
      else els.page.appendChild(ed);
      editor = ed;
      attachEditor(ed);
      lastRange = null;
      lastMd = DM().domToMd(ed); // baseline = the normalized form, so opening never rewrites a document
      paintEmptyClass();
      refreshChips();
      paintOutline();
      paintMeta();
      paintToolbarState();
    }

    function attachEditor(ed) {
      ed.addEventListener('input', onInput);
      ed.addEventListener('keydown', onKeydown);
      ed.addEventListener('paste', onPaste);
      ed.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) e.preventDefault();
      });
      ed.addEventListener('blur', function () {
        saveSel();
        if (state.saveState === 'dirty') saveNow();
      });
      ed.addEventListener('mousedown', function (e) {
        var li = e.target && e.target.closest && e.target.closest('.dc-todo > li');
        if (li && ed.contains(li) && e.offsetX >= 0 && e.clientX - li.getBoundingClientRect().left < 24 && e.target === li) {
          e.preventDefault();
          li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true');
          onEdit();
        }
      });
      ed.addEventListener('click', onEditorClick);
      ed.addEventListener('mouseover', function (e) {
        var chip = e.target.closest && e.target.closest('.dc-mention--task');
        if (!chip || !ed.contains(chip) || (pop && !(previewChip && !previewPinned))) return;
        clearTimeout(previewTimer);
        previewTimer = setTimeout(function () { if (!pop || !previewPinned) openTaskPreview(chip, false); }, 350);
      });
      ed.addEventListener('mouseout', function (e) {
        var chip = e.target.closest && e.target.closest('.dc-mention--task');
        if (!chip) return;
        clearTimeout(previewTimer);
        if (!previewPinned) scheduleClosePreview();
      });
    }

    function onEditorClick(e) {
      var chip = e.target.closest && e.target.closest('.dc-mention');
      if (chip && editor.contains(chip)) {
        e.preventDefault();
        openMention(chip);
        return;
      }
      var a = e.target.closest && e.target.closest('a');
      if (a && editor.contains(a)) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) global.open(a.getAttribute('href'), '_blank', 'noopener');
        else openLinkPopover(a);
      }
    }

    function onInput(e) {
      var type = e.inputType || '';
      if (type === 'insertParagraph') {
        // a new checklist item must start unchecked
        var n = selNode();
        var li = n && closestIn(n, 'LI');
        if (li && li.parentNode && li.parentNode.classList && li.parentNode.classList.contains('dc-todo')) li.setAttribute('data-checked', 'false');
      }
      if (type === 'insertText' && (e.data === ' ' || e.data === '\u00a0')) {
        // editing commands are refused while another one is still dispatching this very event,
        // so the space-triggered rewrites run once it has returned (before any further keystroke)
        Promise.resolve().then(function () {
          if (!editor) return;
          dropSpaceAfterChip();
          applyMarkdownShortcut();
          onEdit();
        });
      }
      onEdit();
      updateSuggest();
    }

    function applyMarkdownShortcut() {
      var n = selNode();
      if (!n) return;
      var block = closestIn(n, 'P,DIV');
      if (!block || closestIn(block, 'PRE')) return;
      var text = block.textContent.replace(/[\u00a0\u200b]/g, ' ');
      var cmd = null;
      var m = /^(#{1,3}) $/.exec(text);
      if (m) cmd = 'h' + m[1].length;
      else if (/^[-*] $/.test(text)) cmd = 'ul';
      else if (/^1[.)] $/.test(text)) cmd = 'ol';
      else if (/^\[ ?\] $/.test(text)) cmd = 'todo';
      else if (/^> $/.test(text)) cmd = 'quote';
      if (!cmd) return;
      var r = document.createRange();
      r.selectNodeContents(block);
      var sel = global.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('delete');
      runCommand(cmd, { silent: true });
    }

    function onKeydown(e) {
      var mod = e.ctrlKey || e.metaKey;
      if (sugg && handleSuggestKey(e)) return;
      if (mod && !e.shiftKey && !e.altKey) {
        var k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); saveNow({ retry: true }); return; }
        if (k === 'k') { e.preventDefault(); openLinkPopover(); return; }
        if (k === 'e') { e.preventDefault(); runCommand('code'); return; }
      }
      if (mod && e.shiftKey && !e.altKey) {
        if (e.key === 'X' || e.key === 'x') { e.preventDefault(); runCommand('strike'); return; }
        if (e.key === '7' || e.key === '&') { e.preventDefault(); runCommand('ol'); return; }
        if (e.key === '8' || e.key === '*') { e.preventDefault(); runCommand('ul'); return; }
        if (e.key === '9' || e.key === '(') { e.preventDefault(); runCommand('todo'); return; }
      }
      if (mod && e.altKey && /^[0-3]$/.test(e.key)) {
        e.preventDefault();
        runCommand(e.key === '0' ? 'p' : 'h' + e.key);
        return;
      }
      if (e.key === 'Tab') {
        var n = selNode();
        if (n && closestIn(n, 'LI')) {
          e.preventDefault();
          document.execCommand(e.shiftKey ? 'outdent' : 'indent');
          onEdit();
        } else if (n && closestIn(n, 'PRE')) {
          e.preventDefault();
          document.execCommand('insertText', false, '  ');
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !mod) {
        var before = textBeforeCaret();
        var nn = selNode();
        var block = nn && closestIn(nn, 'P,DIV');
        if (block && !closestIn(block, 'LI') && before !== null) {
          var t2 = block.textContent.replace(/[\u00a0\u200b]/g, ' ').trim();
          if (/^(---|\*\*\*|___)$/.test(t2)) {
            e.preventDefault();
            var rr = document.createRange();
            rr.selectNodeContents(block);
            var s2 = global.getSelection();
            s2.removeAllRanges();
            s2.addRange(rr);
            document.execCommand('delete');
            insertRule();
            onEdit();
            return;
          }
          if (/^```[\w-]*$/.test(t2)) {
            e.preventDefault();
            var r3 = document.createRange();
            r3.selectNodeContents(block);
            var s3 = global.getSelection();
            s3.removeAllRanges();
            s3.addRange(r3);
            document.execCommand('delete');
            runCommand('codeblock', { silent: true });
            onEdit();
            return;
          }
        }
      }
    }

    function onPaste(e) {
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
      } else {
        out = text
          .replace(/\r\n?/g, '\n')
          .split(/\n{2,}/)
          .map(function (para) { return '<p>' + escHtml(para).replace(/\n/g, '<br>') + '</p>'; })
          .join('');
      }
      var single = /^<p>((?:(?!<\/?p>)[\s\S])*)<\/p>$/.exec(out);
      document.execCommand('insertHTML', false, plainChips(single ? withCompanion(single[1]) : out));
      fixChips();
      refreshChips();
      onEdit();
    }

    /** Re-labels chips from live data and greys the ones whose target is gone. */
    function refreshChips() {
      if (!editor || !state.index) return;
      var failed = (state.sources && state.sources.failed) || [];
      Array.prototype.forEach.call(editor.querySelectorAll('.dc-mention'), function (chip) {
        var type = chip.getAttribute('data-m');
        var id = chip.getAttribute('data-id');
        var item = DM().resolveMention(state.index, type, id);
        var missing = false;
        if (item) {
          if (chip.getAttribute('data-label') !== item.label) {
            chip.setAttribute('data-label', item.label);
            var last = chip.lastChild;
            if (last && last.nodeType === 3) last.nodeValue = item.label;
          }
          chip.title = item.sub ? item.sub : '';
        } else if (type === 'task') missing = !!state.sources && failed.indexOf('cards') < 0;
        else if (type === 'doc') missing = state.docsLoaded;
        chip.classList.toggle('is-missing', !!missing);
        if (missing) chip.title = type === 'task' ? 'Tâche introuvable (archivée ou supprimée)' : 'Document introuvable';
        chip.classList.toggle('is-done', !!(item && item.done));
      });
    }

    function rebuildIndex() {
      var src = state.sources || { members: [], contacts: [], cards: [], lists: [], failed: [] };
      state.index = DM().buildMentionIndex({
        members: src.members,
        contacts: src.contacts,
        cards: src.cards,
        lists: src.lists,
        docs: state.docs.map(function (d) {
          return { id: d.id, title: d.title, sub: DM().relativeTime(d.updatedAt) };
        }),
        excludeDocId: state.current ? state.current.id : '',
      });
      refreshChips();
    }

    function loadSources() {
      return DT()
        .loadMentionSources(t)
        .then(function (src) {
          state.sources = src;
          rebuildIndex();
        });
    }

    function openMention(chip) {
      var type = chip.getAttribute('data-m');
      var id = chip.getAttribute('data-id');
      if (type === 'doc') {
        if (state.docs.some(function (d) { return d.id === id; }) || (state.current && state.current.id === id)) openDoc(id);
        else toast('Ce document est introuvable.', 'error');
      } else if (type === 'task') {
        openTaskPreview(chip, true);
      } else {
        openPersonPopover(chip);
      }
    }

    /** Quick preview of a linked task (hover or click); "Ouvrir" opens the full card. */
    var previewTimer = null;
    var previewChip = null;
    var previewPinned = false;
    function openTaskPreview(chip, pin) {
      clearTimeout(previewTimer);
      if (previewChip === chip && pop && pop.classList.contains('dc-pop--task')) {
        if (pin) previewPinned = true;
        return;
      }
      closePop();
      previewChip = chip;
      previewPinned = !!pin;
      var id = chip.getAttribute('data-id');
      var name = chip.getAttribute('data-label') || 'Carte';
      var item = DM().resolveMention(state.index, 'task', id);
      var body = h('div', { class: 'dc-pop-sub', text: 'Chargement…' });
      var head = [h('div', { class: 'dc-pop-name', text: name })];
      if (item && item.sub) head.push(h('div', { class: 'dc-pop-sub', text: item.sub }));
      var openBtn = h('button', { class: 'dc-btn dc-btn--primary', type: 'button', onclick: function () { closePop(); openTask(id, name); } }, [icon('external-link'), 'Ouvrir']);
      var el = h('div', { class: 'dc-pop dc-pop--task' }, head.concat([body, h('div', { class: 'dc-pop-row' }, [openBtn])]));
      pop = el;
      el.addEventListener('mouseenter', function () { clearTimeout(previewTimer); });
      el.addEventListener('mouseleave', function () { if (!previewPinned) scheduleClosePreview(); });
      placePop(el, chip.getBoundingClientRect());
      var rest = global.PriorityTrello && global.PriorityTrello.trelloRest;
      if (!item || !rest) {
        body.textContent = item ? '' : 'Tâche introuvable (archivée ou supprimée).';
        return;
      }
      Promise.resolve(rest(t, '/cards/' + encodeURIComponent(id) + '?fields=desc,due,dueComplete,idMembers,badges')).then(
        function (res) {
          if (pop !== el) return;
          var c = res && res.ok !== false ? res.data : null;
          if (!c) { body.textContent = 'Aperçu indisponible.'; return; }
          var lines = [];
          if (c.due) {
            var d = new Date(c.due);
            lines.push(h('div', { class: 'dc-pop-line dc-pop-line--plain' }, [icon(c.dueComplete ? 'circle-check' : 'clock'), d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' })]));
          }
          var desc = String(c.desc || '').trim();
          if (desc) lines.push(h('div', { class: 'dc-pop-desc', text: desc.length > 400 ? desc.slice(0, 400) + '…' : desc }));
          else if (!lines.length) lines.push(h('div', { class: 'dc-pop-sub', text: 'Aucune description.' }));
          if (body.parentNode) {
            lines.forEach(function (n) { body.parentNode.insertBefore(n, body); });
            body.parentNode.removeChild(body);
          }
        },
        function () { if (pop === el) body.textContent = 'Aperçu indisponible.'; }
      );
    }

    function scheduleClosePreview() {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(function () {
        if (!previewPinned && pop && pop.classList.contains('dc-pop--task')) closePop();
      }, 250);
    }

    function openTask(cardId, name) {
      saveNow().then(function () {
        t.modal({
          title: name || 'Carte',
          url: global.PriorityTrello.pageUrl('./popup.html'),
          args: { cardId: cardId, cardName: name || '', openSection: null },
          fullscreen: true,
          accentColor: '#22272B',
          callback: function () {
            return t.modal({
              title: 'Documents',
              url: global.PriorityTrello.pageUrl('./docs.html'),
              fullscreen: true,
              accentColor: '#22272B',
            });
          },
        });
      });
    }

    /* ── 5. Commands + toolbar ───────────────────────────────────── */

    function setBlock(tag) {
      document.execCommand('formatBlock', false, '<' + tag + '>');
    }

    function insertRule() {
      document.execCommand('insertHorizontalRule');
      // keep a paragraph after the rule so the caret has somewhere to go
      var hrs = editor.querySelectorAll('hr');
      var hr = hrs[hrs.length - 1];
      var sel = global.getSelection();
      if (sel.rangeCount) {
        var a = sel.anchorNode;
        var hrNear = closestIn(a, 'HR') || null;
        hr = hrNear || hr;
      }
      if (hr && !hr.nextElementSibling) {
        var p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        hr.parentNode.insertBefore(p, hr.nextSibling);
        var r = document.createRange();
        r.setStart(p, 0);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }

    function markTodoList(ul) {
      ul.classList.add('dc-todo');
      Array.prototype.forEach.call(ul.children, function (li) {
        if (li.tagName === 'LI' && !li.hasAttribute('data-checked')) li.setAttribute('data-checked', 'false');
      });
    }
    function unmarkTodoList(ul) {
      ul.classList.remove('dc-todo');
      Array.prototype.forEach.call(ul.children, function (li) {
        if (li.tagName === 'LI') li.removeAttribute('data-checked');
      });
    }

    function toggleTodo() {
      var n = selNode();
      var li = n && closestIn(n, 'LI');
      var ul = li && li.parentNode;
      if (ul && ul.tagName === 'UL') {
        if (ul.classList.contains('dc-todo')) {
          unmarkTodoList(ul);
          document.execCommand('insertUnorderedList'); // the checklist button is a toggle: off = plain paragraphs
        } else markTodoList(ul);
        return;
      }
      if (ul && ul.tagName === 'OL') document.execCommand('insertOrderedList'); // OL -> plain paragraphs first
      document.execCommand('insertUnorderedList');
      var n2 = selNode();
      var li2 = n2 && closestIn(n2, 'LI');
      if (li2 && li2.parentNode.tagName === 'UL') markTodoList(li2.parentNode);
    }

    function toggleList(kind) {
      var n = selNode();
      var li = n && closestIn(n, 'LI');
      var ul = li && li.parentNode;
      if (kind === 'ul' && ul && ul.tagName === 'UL' && ul.classList.contains('dc-todo')) {
        unmarkTodoList(ul); // checklist -> plain bullets
        return;
      }
      document.execCommand(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
    }

    function toggleInlineCode() {
      var sel = global.getSelection();
      if (!sel.rangeCount) return;
      var n = selNode();
      var code = n && closestIn(n, 'CODE');
      if (code) {
        var r = document.createRange();
        r.selectNodeContents(code);
        sel.removeAllRanges();
        sel.addRange(r);
        document.execCommand('insertText', false, code.textContent);
        return;
      }
      if (sel.isCollapsed) return;
      var text = sel.toString();
      document.execCommand('insertHTML', false, '<code>' + escHtml(text) + '</code>\u200b');
    }

    function runCommand(cmd, opts) {
      if (!editor) return;
      opts = opts || {};
      restoreSel();
      switch (cmd) {
        case 'undo': document.execCommand('undo'); break;
        case 'redo': document.execCommand('redo'); break;
        case 'bold': document.execCommand('bold'); break;
        case 'italic': document.execCommand('italic'); break;
        case 'underline': document.execCommand('underline'); break;
        case 'strike': document.execCommand('strikeThrough'); break;
        case 'code': toggleInlineCode(); break;
        case 'p': case 'h1': case 'h2': case 'h3': {
          if (cmd !== 'p' && blockType() === cmd && !opts.force) setBlock('p');
          else setBlock(cmd);
          break;
        }
        case 'ul': case 'ol': toggleList(cmd); break;
        case 'todo': toggleTodo(); break;
        case 'quote': {
          var n = selNode();
          if (n && closestIn(n, 'BLOCKQUOTE')) document.execCommand('outdent');
          else document.execCommand('formatBlock', false, '<blockquote>');
          break;
        }
        case 'codeblock': {
          if (blockType() === 'codeblock') setBlock('p');
          else setBlock('pre');
          break;
        }
        case 'hr': insertRule(); break;
        case 'indent': document.execCommand('indent'); break;
        case 'outdent': document.execCommand('outdent'); break;
        case 'link': openLinkPopover(); return;
        case 'mention-person': document.execCommand('insertText', false, '@'); break;
        case 'mention-task': document.execCommand('insertText', false, '@@'); break;
        case 'mention-doc': document.execCommand('insertText', false, '@@@'); break;
        default: return;
      }
      if (!opts.silent) {
        onEdit();
        paintToolbarState();
      }
    }

    function buildToolbar() {
      var bar = els.toolbar;
      bar.textContent = '';
      function btn(cmd, iconName, title, extra) {
        return h('button', {
          class: 'dc-tb' + (extra ? ' ' + extra : ''),
          type: 'button',
          title: title,
          'aria-label': title,
          'data-cmd': cmd,
          onmousedown: function (e) { e.preventDefault(); },
          onclick: function () { runCommand(cmd); },
        }, [icon(iconName)]);
      }
      function sep() { return h('span', { class: 'dc-tb-sep', role: 'separator' }); }
      var blockSelect = h('select', {
        class: 'dc-select',
        'aria-label': 'Style de paragraphe',
        onchange: function () {
          var v = blockSelect.value;
          runCommand(v, { force: true });
        },
      }, [
        h('option', { value: 'p', text: 'Texte' }),
        h('option', { value: 'h1', text: 'Titre 1' }),
        h('option', { value: 'h2', text: 'Titre 2' }),
        h('option', { value: 'h3', text: 'Titre 3' }),
      ]);
      var side = h('button', {
        class: 'dc-tb dc-tb--side',
        type: 'button',
        title: 'Afficher / masquer la liste des documents',
        'aria-label': 'Afficher ou masquer la liste des documents',
        onclick: function () {
          state.sideCollapsed = !state.sideCollapsed;
          shell.classList.toggle('is-side-collapsed', state.sideCollapsed);
        },
      }, [icon('layout-sidebar')]);
      els.head.textContent = '';
      var mentionBtn = function (cmd, iconName, label, hint) {
        return h('button', {
          class: 'dc-tb dc-tb--text',
          type: 'button',
          title: label + ' (' + hint + ')',
          'data-cmd': cmd,
          onmousedown: function (e) { e.preventDefault(); },
          onclick: function () { runCommand(cmd); },
        }, [icon(iconName), h('span', { text: hint })]);
      };
      var more = h('button', {
        class: 'dc-tb',
        type: 'button',
        title: 'Actions du document',
        'aria-label': 'Actions du document',
        onclick: function (e) {
          e.stopPropagation();
          if (state.current) openDocMenu(more, state.current.id);
        },
      }, [icon('dots')]);
      [side, icon('file-text', 'dc-head-icon'), els.headTitle, h('span', { class: 'dc-spacer' }), els.status, more].forEach(function (c) {
        els.head.appendChild(c);
      });
      [
        btn('undo', 'arrow-back-up', 'Annuler (Ctrl+Z)'),
        btn('redo', 'arrow-forward-up', 'Rétablir (Ctrl+Y)'),
        sep(),
        blockSelect,
        sep(),
        btn('bold', 'bold', 'Gras (Ctrl+B)'),
        btn('italic', 'italic', 'Italique (Ctrl+I)'),
        btn('underline', 'underline', 'Souligné (Ctrl+U)'),
        btn('strike', 'strikethrough', 'Barré (Ctrl+Maj+X)'),
        btn('code', 'code', 'Code (Ctrl+E)'),
        btn('link', 'link', 'Lien (Ctrl+K)'),
        sep(),
        btn('ul', 'list', 'Liste à puces (Ctrl+Maj+8)'),
        btn('ol', 'list-numbers', 'Liste numérotée (Ctrl+Maj+7)'),
        btn('todo', 'list-check', 'Liste de tâches (Ctrl+Maj+9)'),
        btn('quote', 'quote', 'Citation'),
        btn('codeblock', 'file-code', 'Bloc de code'),
        btn('hr', 'separator-horizontal', 'Séparateur'),
        sep(),
        mentionBtn('mention-person', 'user', 'Mentionner une personne', '@'),
        mentionBtn('mention-task', 'checkbox', 'Lier une tâche', '@@'),
        mentionBtn('mention-doc', 'file-text', 'Lier un document', '@@@'),
      ].forEach(function (c) { bar.appendChild(c); });
    }

    function paintHead() {
      var title = state.current ? DM().cleanTitle(els.title.value) || DM().UNTITLED : '';
      els.headTitle.textContent = title;
      els.headTitle.title = title;
      els.head.classList.toggle('has-doc', !!state.current);
    }

    /* ── 6. Suggestions (@ and /) ────────────────────────────────── */

    function closeSuggest() {
      sugg = null;
      els.suggest.hidden = true;
      els.suggest.textContent = '';
    }

    function updateSuggest() {
      if (!editor) return closeSuggest();
      var before = textBeforeCaret();
      if (before == null) return closeSuggest();
      var trig = DM().detectTrigger(before);
      if (trig) {
        var groups = DM().searchMentions(state.index, trig.scope, trig.query);
        var entries = [];
        groups.forEach(function (g) {
          g.items.forEach(function (item) { entries.push({ kind: 'item', item: item, group: g.label }); });
        });
        if (trig.scope === 'doc' && trig.query.trim()) {
          entries.push({ kind: 'create', title: DM().cleanTitle(trig.query) });
        }
        var keep = sugg && sugg.kind === 'mention' && sugg.trig.scope === trig.scope && sugg.trig.query === trig.query ? sugg.active : 0;
        sugg = { kind: 'mention', trig: trig, entries: entries, groups: groups, active: Math.min(keep, Math.max(0, entries.length - 1)) };
        paintSuggest();
        return;
      }
      var sl = DM().detectSlash(before);
      if (sl) {
        var q = DM().fold(sl.query);
        var cmds = COMMANDS.filter(function (c) {
          return !q || DM().fold(c.label + ' ' + c.kw).indexOf(q) >= 0;
        });
        if (cmds.length) {
          sugg = { kind: 'slash', trig: sl, entries: cmds.map(function (c) { return { kind: 'cmd', cmd: c }; }), active: 0 };
          paintSuggest();
          return;
        }
      }
      closeSuggest();
    }

    function caretRect() {
      var sel = global.getSelection();
      if (!sel.rangeCount) return null;
      var r = sel.getRangeAt(0).cloneRange();
      r.collapse(true);
      var rect = r.getClientRects()[0];
      if (rect && (rect.width || rect.height)) return rect;
      var block = closestIn(sel.anchorNode, BLOCK_SEL) || editor;
      return block.getBoundingClientRect();
    }

    function paintSuggest() {
      var box = els.suggest;
      box.textContent = '';
      var s = sugg;
      if (!s) return;
      box.hidden = false;
      var title =
        s.kind === 'slash' ? 'Commandes' : s.trig.scope === 'task' ? 'Lier une tâche' : s.trig.scope === 'doc' ? 'Lier un document' : 'Mentionner';
      box.appendChild(
        h('div', { class: 'dc-sg-head' }, [
          h('span', { text: title }),
          s.kind === 'mention' ? h('span', { class: 'dc-sg-hint', text: '@ tout · @@ tâches · @@@ documents' }) : null,
        ])
      );
      if (!s.entries.length) {
        box.appendChild(h('div', { class: 'dc-sg-none', text: 'Aucun résultat' }));
      }
      var lastGroup = '';
      s.entries.forEach(function (en, i) {
        if (en.kind === 'item' && s.trig.scope === 'all' && en.group !== lastGroup) {
          lastGroup = en.group;
          box.appendChild(h('div', { class: 'dc-sg-group', text: en.group }));
        }
        var row;
        if (en.kind === 'item') {
          var it = en.item;
          var lead =
            it.type === 'person'
              ? h('span', { class: 'dc-sg-avatar', text: it.initials || '?' })
              : icon(it.type === 'task' ? (it.done ? 'circle-check' : 'checkbox') : 'file-text', 'dc-sg-icon dc-sg-icon--' + it.type);
          row = h('div', { class: 'dc-sg-row' }, [
            lead,
            h('span', { class: 'dc-sg-label', text: it.label }),
            it.sub ? h('span', { class: 'dc-sg-sub', text: it.sub }) : null,
          ]);
        } else if (en.kind === 'create') {
          row = h('div', { class: 'dc-sg-row dc-sg-row--create' }, [
            icon('file-plus', 'dc-sg-icon dc-sg-icon--doc'),
            h('span', { class: 'dc-sg-label', text: 'Créer le document « ' + en.title + ' »' }),
          ]);
        } else {
          row = h('div', { class: 'dc-sg-row' }, [
            icon(en.cmd.icon, 'dc-sg-icon'),
            h('span', { class: 'dc-sg-label', text: en.cmd.label }),
            en.cmd.hint ? h('span', { class: 'dc-sg-sub', text: en.cmd.hint }) : null,
          ]);
        }
        row.setAttribute('role', 'option');
        row.setAttribute('data-i', String(i));
        if (i === s.active) row.classList.add('is-active');
        row.addEventListener('mousedown', function (e) {
          e.preventDefault();
          applySuggest(en);
        });
        row.addEventListener('mousemove', function () {
          if (sugg && sugg.active !== i) {
            sugg.active = i;
            markActive();
          }
        });
        box.appendChild(row);
      });
      placeSuggest();
    }

    function markActive() {
      Array.prototype.forEach.call(els.suggest.querySelectorAll('.dc-sg-row'), function (row) {
        var on = Number(row.getAttribute('data-i')) === sugg.active;
        row.classList.toggle('is-active', on);
        if (on && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      });
    }

    function placeSuggest() {
      var rect = caretRect();
      var box = els.suggest;
      if (!rect) return;
      box.style.left = '0px';
      box.style.top = '0px';
      var bw = box.offsetWidth;
      var bh = box.offsetHeight;
      var vw = global.innerWidth;
      var vh = global.innerHeight;
      var left = Math.max(8, Math.min(rect.left, vw - bw - 8));
      var top = rect.bottom + 6;
      if (top + bh > vh - 8) top = Math.max(8, rect.top - bh - 6);
      box.style.left = left + 'px';
      box.style.top = top + 'px';
    }

    function handleSuggestKey(e) {
      var s = sugg;
      if (!s) return false;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSuggest();
        return true;
      }
      if (!s.entries.length) return false;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var n = s.entries.length;
        s.active = (s.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        markActive();
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggest(s.entries[s.active]);
        return true;
      }
      return false;
    }

    /**
     * Chrome hoists a contenteditable="false" span out of its paragraph when it is part of an
     * insertHTML fragment. So chips are inserted as plain spans (which also keeps native undo) and
     * made non-editable right after, by fixChips().
     */
    function plainChips(html) {
      return html.replace(/ contenteditable="false"/g, '');
    }
    /**
     * Chrome drops the class / data-* of a lone inserted element (it treats it as a "styled span"
     * paste and inlines its computed style). Any text beside it prevents that: a zero-width space
     * (ignored when saving) is enough.
     */
    function withCompanion(html) {
      var tpl = document.createElement('template');
      tpl.innerHTML = html;
      var nodes = tpl.content.childNodes;
      return nodes.length === 1 && nodes[0].nodeType === 1 ? html + '&#8203;' : html;
    }
    function fixChips() {
      if (!editor) return;
      Array.prototype.forEach.call(editor.querySelectorAll('.dc-mention:not([contenteditable="false"])'), function (chip) {
        chip.setAttribute('contenteditable', 'false');
      });
    }

    function insertMention(item) {
      document.execCommand('insertHTML', false, plainChips(DM().mentionHtml(item.type, item.id, item.label)) + '&nbsp;');
      fixChips();
      refreshChips();
      onEdit();
    }

    /** The space that follows a fresh chip is already there: typing another one would double it. */
    function dropSpaceAfterChip() {
      var sel = global.getSelection();
      var n = sel && sel.anchorNode;
      if (!n || n.nodeType !== 3 || !sel.isCollapsed || sel.anchorOffset !== 2) return;
      var prev = n.previousSibling;
      if (prev && prev.nodeType === 1 && prev.classList.contains('dc-mention') && /^[\u00a0 ]{2}/.test(n.nodeValue)) {
        document.execCommand('delete');
      }
    }

    function applySuggest(entry) {
      var s = sugg;
      if (!s || !entry) return;
      closeSuggest();
      restoreSel();
      selectBackward(s.trig.length);
      if (entry.kind === 'item') {
        insertMention(entry.item);
      } else if (entry.kind === 'cmd') {
        document.execCommand('delete');
        var id = entry.cmd.id;
        saveSel();
        runCommand(id, { force: true });
      } else if (entry.kind === 'create') {
        document.execCommand('delete');
        saveSel();
        createFromMention(entry.title);
      }
    }

    function createFromMention(title) {
      var range = lastRange;
      setBusy('Création du document…');
      DT().createDoc(t, title, '').then(
        function (doc) {
          setBusy('');
          state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
          sortDocs();
          paintList();
          rebuildIndex();
          lastRange = range;
          restoreSel();
          insertMention({ type: 'doc', id: doc.id, label: doc.title });
          toast('Document « ' + doc.title + ' » créé.', 'ok');
        },
        function (err) {
          setBusy('');
          failure(err);
        }
      );
    }

    /* ── 7. Popovers + dialogs ───────────────────────────────────── */

    function closePop() {
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
      pop = null;
      previewChip = null;
      previewPinned = false;
    }

    function placePop(el, rect) {
      shell.appendChild(el);
      var w = el.offsetWidth;
      var hh = el.offsetHeight;
      var left = Math.max(8, Math.min(rect.left, global.innerWidth - w - 8));
      var top = rect.bottom + 6;
      if (top + hh > global.innerHeight - 8) top = Math.max(8, rect.top - hh - 6);
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    }

    function openLinkPopover(existing) {
      saveSel();
      closePop();
      var n = selNode();
      var a = existing || (n && closestIn(n, 'A'));
      var sel = global.getSelection();
      var rect = a ? a.getBoundingClientRect() : sel.rangeCount ? caretRect() : els.toolbar.getBoundingClientRect();
      var input = h('input', { class: 'dc-input', type: 'text', placeholder: 'https://…', value: a ? a.getAttribute('href') || '' : '', 'aria-label': 'Adresse du lien', spellcheck: 'false' });
      var err = h('div', { class: 'dc-pop-err', hidden: true });
      function apply() {
        var href = DM().safeHref(input.value);
        if (!href) {
          err.hidden = false;
          err.textContent = 'Adresse non valide (http, https ou mailto).';
          return;
        }
        closePop();
        restoreSel();
        var s = global.getSelection();
        if (a) {
          var r = document.createRange();
          r.selectNodeContents(a);
          s.removeAllRanges();
          s.addRange(r);
          document.execCommand('createLink', false, href);
        } else if (s.isCollapsed) {
          document.execCommand('insertHTML', false, '<a href="' + escHtml(href) + '">' + escHtml(input.value.trim()) + '</a>&nbsp;');
        } else {
          document.execCommand('createLink', false, href);
        }
        onEdit();
      }
      function removeLink() {
        closePop();
        restoreSel();
        if (a) {
          var r = document.createRange();
          r.selectNodeContents(a);
          var s = global.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        }
        document.execCommand('unlink');
        onEdit();
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); apply(); }
        else if (e.key === 'Escape') { e.preventDefault(); closePop(); restoreSel(); }
      });
      var buttons = [h('button', { class: 'dc-btn dc-btn--primary', type: 'button', onclick: apply }, ['Appliquer'])];
      if (a) {
        buttons.push(h('button', { class: 'dc-btn', type: 'button', title: 'Ouvrir le lien', onclick: function () { global.open(a.getAttribute('href'), '_blank', 'noopener'); } }, [icon('external-link')]));
        buttons.push(h('button', { class: 'dc-btn', type: 'button', title: 'Retirer le lien', onclick: removeLink }, [icon('unlink')]));
      }
      pop = h('div', { class: 'dc-pop' }, [h('div', { class: 'dc-pop-row' }, [input]), err, h('div', { class: 'dc-pop-row' }, buttons)]);
      placePop(pop, rect);
      input.focus();
      input.select();
    }

    function openPersonPopover(chip) {
      closePop();
      var id = chip.getAttribute('data-id');
      var item = DM().resolveMention(state.index, 'person', id);
      var label = chip.getAttribute('data-label') || 'Personne';
      var rows = [h('div', { class: 'dc-pop-name', text: label })];
      if (item && item.sub) rows.push(h('div', { class: 'dc-pop-sub', text: item.sub }));
      if (item && item.email) rows.push(h('a', { class: 'dc-pop-line', href: 'mailto:' + item.email }, [icon('mail'), item.email]));
      if (item && item.phone) rows.push(h('div', { class: 'dc-pop-line' }, [icon('phone'), item.phone]));
      if (item && item.username) {
        rows.push(
          h('a', { class: 'dc-pop-line', href: 'https://trello.com/' + encodeURIComponent(item.username), target: '_blank', rel: 'noopener noreferrer' }, [icon('brand-trello'), 'Profil Trello'])
        );
      }
      if (!item) rows.push(h('div', { class: 'dc-pop-sub', text: 'Contact privé d’un autre membre ou personne retirée du tableau.' }));
      pop = h('div', { class: 'dc-pop dc-pop--person' }, rows);
      placePop(pop, chip.getBoundingClientRect());
    }

    function openDocMenu(anchor, docId) {
      closePop();
      var d = state.docs.filter(function (x) { return x.id === docId; })[0] || (state.current && state.current.id === docId ? state.current : null);
      if (!d) return;
      function item(iconName, label, run, danger) {
        return h('button', {
          class: 'dc-menu-item' + (danger ? ' is-danger' : ''),
          type: 'button',
          onclick: function () {
            closePop();
            run();
          },
        }, [icon(iconName), h('span', { text: label })]);
      }
      pop = h('div', { class: 'dc-pop dc-menu', role: 'menu' }, [
        item('copy', 'Dupliquer', function () { duplicateDoc(docId); }),
        item('download', 'Télécharger (.md)', function () { exportDoc(docId, 'download'); }),
        item('clipboard', 'Copier en Markdown', function () { exportDoc(docId, 'copy'); }),
        h('div', { class: 'dc-menu-sep' }),
        item('trash', 'Supprimer…', function () { confirmDelete(docId); }, true),
      ]);
      placePop(pop, anchor.getBoundingClientRect());
    }

    function dialog(opts) {
      return new Promise(function (resolve) {
        var overlay = h('div', { class: 'dc-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title });
        function done(v) {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(v);
        }
        var cancel = h('button', { class: 'dc-btn', type: 'button', onclick: function () { done(false); } }, [opts.cancel || 'Annuler']);
        var ok = h('button', { class: 'dc-btn ' + (opts.danger ? 'dc-btn--danger' : 'dc-btn--primary'), type: 'button', onclick: function () { done(true); } }, [opts.ok || 'OK']);
        overlay.appendChild(h('div', { class: 'dc-dialog' }, [
          h('h2', { class: 'dc-dialog-title', text: opts.title }),
          h('p', { class: 'dc-dialog-text', text: opts.text }),
          h('div', { class: 'dc-dialog-actions' }, [cancel, ok]),
        ]));
        overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(false); });
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) done(false); });
        shell.appendChild(overlay);
        (opts.danger ? cancel : ok).focus();
      });
    }

    function confirmDelete(docId) {
      var d = state.docs.filter(function (x) { return x.id === docId; })[0];
      if (!d) return;
      dialog({
        title: 'Supprimer « ' + d.title + ' » ?',
        text: 'Le document sera supprimé définitivement de Trello. Les liens @ qui pointent vers lui deviendront orphelins.',
        ok: 'Supprimer',
        danger: true,
      }).then(function (yes) {
        if (!yes) return;
        DT().deleteDoc(t, docId).then(
          function () {
            var wasCurrent = state.current && state.current.id === docId;
            state.docs = state.docs.filter(function (x) { return x.id !== docId; });
            if (wasCurrent) {
              state.current = null;
              remember(LAST_KEY, null);
              showCurrent();
              if (state.docs.length) openDoc(state.docs[0].id, { skipSave: true });
            }
            paintList();
            rebuildIndex();
            toast('Document supprimé.', 'ok');
          },
          failure
        );
      });
    }

    function exportDoc(docId, mode) {
      var load = state.current && state.current.id === docId
        ? Promise.resolve({ title: els.title.value || state.current.title, body: lastDomMd() })
        : DT().loadDoc(t, docId);
      load.then(function (doc) {
        var text = DM().exportMarkdown(doc.title, doc.body);
        if (mode === 'copy') {
          copyText(text);
          return;
        }
        try {
          var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = h('a', { href: url, download: (DM().cleanTitle(doc.title) || 'document').replace(/[\\/:*?"<>|]/g, '-') + '.md' });
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          toast('Fichier .md prêt.', 'ok');
        } catch (e) {
          copyText(text);
        }
      }, failure);
    }

    function copyText(text) {
      function legacy() {
        var ta = h('textarea', { style: 'position:fixed;opacity:0;left:-9999px' });
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        toast(ok ? 'Markdown copié.' : 'Copie impossible depuis cette fenêtre.', ok ? 'ok' : 'error');
      }
      if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('Markdown copié.', 'ok'); }, legacy);
      } else legacy();
    }

    function setBusy(msg) {
      state.busy = msg || '';
      shell.classList.toggle('is-busy', !!msg);
      if (msg) toast(msg);
    }

    /* ── 8. Opening, creating, saving ────────────────────────────── */

    function failure(err) {
      if (isAuthReason(err)) {
        state.authOk = false;
        paintBanner();
      }
      toast(reasonText(err), 'error');
    }

    function showCurrent() {
      var has = !!state.current;
      els.scroll.hidden = !has;
      els.toolbar.classList.toggle('is-disabled', !has);
      els.empty.hidden = has || !state.docsLoaded;
      paintHead();
      if (!has) {
        editor = null;
        els.outline.textContent = '';
        els.outline.classList.add('is-empty');
        els.conflict.hidden = true;
        paintStatus();
        paintEmpty();
      }
    }

    function paintEmpty() {
      var e = els.empty;
      e.textContent = '';
      if (!state.authOk) {
        e.appendChild(icon('lock', 'dc-empty-icon'));
        e.appendChild(h('h2', { text: 'Autorisation Trello requise' }));
        e.appendChild(h('p', { text: 'Les documents sont enregistrés dans votre tableau Trello. Autorisez le Power-Up une seule fois pour les lire et les modifier.' }));
        e.appendChild(authButton());
        return;
      }
      e.appendChild(icon('file-text', 'dc-empty-icon'));
      e.appendChild(h('h2', { text: state.docs.length ? 'Choisissez un document' : 'Aucun document pour l’instant' }));
      e.appendChild(h('p', { text: 'Rédigez des notes, des comptes rendus ou des spécifications, et reliez-les à vos tâches, aux personnes et aux autres documents.' }));
      e.appendChild(h('button', { class: 'dc-btn dc-btn--primary', onclick: function () { newDoc(); } }, [icon('plus'), 'Nouveau document']));
      e.appendChild(
        h('ul', { class: 'dc-tips' }, [
          h('li', {}, [h('kbd', { text: '@' }), ' une personne (ou tout chercher)']),
          h('li', {}, [h('kbd', { text: '@@' }), ' une tâche du tableau']),
          h('li', {}, [h('kbd', { text: '@@@' }), ' un autre document']),
          h('li', {}, [h('kbd', { text: '/' }), ' titres, listes, citations, code…']),
        ])
      );
    }

    function openDoc(id, opts) {
      opts = opts || {};
      if (state.current && state.current.id === id && !opts.reload) return Promise.resolve();
      closeSuggest();
      closePop();
      var token = ++loadToken;
      var pre = state.current && !opts.skipSave ? saveNow() : Promise.resolve(true);
      return pre.then(function (ok) {
        if (token !== loadToken) return;
        if (!ok && state.current && (state.saveState === 'error' || state.saveState === 'conflict')) {
          return dialog({
            title: 'Changer de document ?',
            text: 'Les dernières modifications de « ' + (state.current.title || 'ce document') + ' » n’ont pas pu être enregistrées. Elles seront perdues.',
            ok: 'Abandonner mes changements',
            cancel: 'Rester',
            danger: true,
          }).then(function (yes) {
            if (yes) return load();
          });
        }
        return load();
      });

      function load() {
        els.page.classList.add('is-loading');
        return DT().loadDoc(t, id).then(
          function (doc) {
            if (token !== loadToken) return;
            els.page.classList.remove('is-loading');
            state.current = doc;
            savedTitle = doc.title;
            els.title.value = doc.title === DM().UNTITLED ? '' : doc.title;
            els.conflict.hidden = true;
            state.conflict = null;
            showCurrent();
            rebuildIndex();
            buildEditor(doc);
            setSave('saved');
            remember(LAST_KEY, id);
            paintList();
            els.scroll.scrollTop = 0;
            if (opts.focusTitle) {
              els.title.focus();
              els.title.select();
            }
          },
          function (err) {
            els.page.classList.remove('is-loading');
            if (token !== loadToken) return;
            if ((err && err.reason) === 'http-404' || (err && err.reason) === 'not-a-document') {
              state.docs = state.docs.filter(function (d) { return d.id !== id; });
              paintList();
            }
            failure(err);
          }
        );
      }
    }

    function newDoc(title, body) {
      if (state.busy) return;
      var go = state.current ? saveNow() : Promise.resolve(true);
      go.then(function () {
        setBusy('Création du document…');
        DT().createDoc(t, title || DM().UNTITLED, body || '').then(
          function (doc) {
            setBusy('');
            toast('');
            state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
            sortDocs();
            state.filter = '';
            els.search.value = '';
            openDoc(doc.id, { skipSave: true, focusTitle: !title });
          },
          function (err) {
            setBusy('');
            failure(err);
          }
        );
      });
    }

    function duplicateDoc(docId) {
      var src = state.current && state.current.id === docId
        ? Promise.resolve({ title: els.title.value || state.current.title, body: lastDomMd() })
        : DT().loadDoc(t, docId);
      src.then(function (doc) {
        newDoc(DM().cleanTitle((doc.title || DM().UNTITLED) + ' (copie)'), doc.body);
      }, failure);
    }

    function scheduleSave(ms) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { saveNow(); }, ms == null ? SAVE_DELAY_MS : ms);
    }

    /** Saves title and text if either changed. Resolves true when nothing is left unsaved. */
    function saveNow(opts) {
      opts = opts || {};
      clearTimeout(saveTimer);
      if (!state.current || !editor) return Promise.resolve(true);
      if (saving) {
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(saveNow(opts)); }, 150);
        });
      }
      if (state.saveState === 'conflict' && !opts.force) return Promise.resolve(false);
      var cur = state.current;
      var md = DM().domToMd(editor);
      var want = DM().cleanTitle(els.title.value) || DM().UNTITLED;
      var bodyChanged = md !== lastMd;
      var titleChanged = want !== savedTitle;
      if (!bodyChanged && !titleChanged && !opts.force) {
        if (state.saveState !== 'saved') setSave('saved');
        return Promise.resolve(true);
      }
      if (bodyChanged && DM().sizeInfo(md).over) {
        setSave('error', 'Document trop long : réduisez-le pour enregistrer.');
        return Promise.resolve(false);
      }
      saving = true;
      setSave('saving');
      var chain = Promise.resolve();
      if (titleChanged) {
        chain = chain.then(function () {
          return DT().renameDoc(t, cur.id, want).then(function (r) {
            savedTitle = r.title;
            cur.title = r.title;
            touchListItem(cur.id, { title: r.title });
            rebuildIndex();
          });
        });
      }
      if (bodyChanged || opts.force) {
        chain = chain.then(function () {
          return DT().saveDoc(t, { id: cur.id, body: md, rev: cur.rev }, { force: !!opts.force }).then(function (res) {
            cur.rev = res.rev;
            cur.updatedAt = res.updatedAt;
            cur.body = md;
            lastMd = md;
            touchListItem(cur.id, { updatedAt: res.updatedAt });
          });
        });
      }
      return chain.then(
        function () {
          saving = false;
          if (state.current !== cur) return true;
          var stillDirty = editor && (DM().domToMd(editor) !== lastMd || (DM().cleanTitle(els.title.value) || DM().UNTITLED) !== savedTitle);
          setSave(stillDirty ? 'dirty' : 'saved');
          if (stillDirty) scheduleSave(300);
          paintMeta();
          return !stillDirty;
        },
        function (err) {
          saving = false;
          if (err && err.reason === 'conflict') {
            state.conflict = err.remote;
            setSave('conflict', 'Modifié ailleurs');
            paintConflict();
          } else {
            if (isAuthReason(err)) {
              state.authOk = false;
              paintBanner();
            }
            setSave('error', reasonText(err));
          }
          return false;
        }
      );
    }

    function paintConflict() {
      var c = els.conflict;
      c.textContent = '';
      c.hidden = !state.conflict;
      if (!state.conflict) return;
      c.appendChild(icon('alert-triangle'));
      c.appendChild(h('span', { text: 'Quelqu’un d’autre a enregistré une version plus récente de ce document.' }));
      c.appendChild(
        h('button', {
          class: 'dc-btn',
          onclick: function () {
            state.conflict = null;
            c.hidden = true;
            openDoc(state.current.id, { reload: true, skipSave: true });
          },
        }, [icon('refresh'), 'Charger sa version'])
      );
      c.appendChild(
        h('button', {
          class: 'dc-btn dc-btn--danger',
          onclick: function () {
            var remote = state.conflict;
            state.current.rev = remote.rev;
            state.conflict = null;
            c.hidden = true;
            setSave('dirty');
            saveNow({ force: true });
          },
        }, [icon('device-floppy'), 'Écraser avec la mienne'])
      );
    }

    /** When the window regains focus, pick up what other members saved (only if there is nothing unsaved here). */
    function refreshRemote(force) {
      if (!state.authOk || !state.docsLoaded || saving || (force !== true && Date.now() - lastRefreshAt < REFRESH_MIN_MS)) return Promise.resolve();
      lastRefreshAt = Date.now();
      return DT().listDocs(t).then(function (docs) {
        var openId = state.current && state.current.id;
        state.docs = docs;
        paintList();
        rebuildIndex();
        if (!openId) return;
        if (!docs.some(function (d) { return d.id === openId; })) {
          toast('Ce document a été supprimé par quelqu’un d’autre.', 'error');
          return;
        }
        if (state.saveState !== 'saved' || !editor || DM().domToMd(editor) !== lastMd) return;
        return DT().loadDoc(t, openId).then(function (doc) {
          if (!state.current || state.current.id !== openId || saving || DM().domToMd(editor) !== lastMd) return;
          if (doc.rev === state.current.rev) return;
          var top = els.scroll.scrollTop;
          state.current = doc;
          savedTitle = doc.title;
          els.title.value = doc.title === DM().UNTITLED ? '' : doc.title;
          buildEditor(doc);
          els.scroll.scrollTop = top;
          toast('Document mis à jour par quelqu’un d’autre.', 'ok');
        }, function () {});
      }, function () {});
    }

    /* ── 9. Boot ─────────────────────────────────────────────────── */

    els.title.addEventListener('input', function () {
      if (!state.current) return;
      state.current.title = els.title.value;
      paintHead();
      touchListItem(state.current.id, { title: els.title.value || DM().UNTITLED });
      if (state.saveState !== 'conflict') setSave('dirty');
      scheduleSave(SAVE_DELAY_MS);
    });
    els.title.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (editor) {
          editor.focus();
          var r = document.createRange();
          r.selectNodeContents(editor);
          r.collapse(true);
          var s = global.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        }
      }
    });
    els.title.addEventListener('blur', function () {
      if (state.saveState === 'dirty') saveNow();
    });

    document.addEventListener('selectionchange', function () {
      if (!editor) return;
      saveSel();
      paintToolbarState();
      if (editor === document.activeElement || (sugg && editor.contains(global.getSelection().anchorNode))) updateSuggest();
    });
    document.addEventListener('mousedown', function (e) {
      if (pop && !pop.contains(e.target)) closePop();
      if (sugg && !els.suggest.contains(e.target) && !(editor && editor.contains(e.target))) closeSuggest();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePop();
    });
    global.addEventListener('resize', function () {
      if (sugg) placeSuggest();
    });
    els.scroll.addEventListener('scroll', function () {
      if (sugg) placeSuggest(); // the caret moved on screen, the popup follows (layout shifts also scroll)
      closePop();
    });
    global.addEventListener('focus', refreshRemote);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') saveNow();
      else refreshRemote();
    });
    global.addEventListener('pagehide', function () {
      saveNow();
    });

    buildSide();
    buildToolbar();
    paintList();
    showCurrent();

    function boot() {
      DT().isAuthorized(t).then(function (ok) {
        state.authOk = ok;
        paintBanner();
        if (!ok) {
          state.docsLoaded = true;
          paintList();
          showCurrent();
          return;
        }
        loadSources().catch(function () {});
        return DT().listDocs(t).then(function (docs) {
          return DT().ensureDefaultDoc(t, docs).then(
            function (r) { return r.docs; },
            function (err) { failure(err); return docs; } // creation failed: show the empty state
          );
        }).then(
          function (docs) {
            state.docs = docs;
            state.docsLoaded = true;
            paintList();
            rebuildIndex();
            var last = recall(LAST_KEY);
            var pick = docs.filter(function (d) { return d.id === last; })[0] || docs[0];
            if (pick) return openDoc(pick.id, { skipSave: true });
            showCurrent();
          },
          function (err) {
            state.docsLoaded = true;
            paintList();
            showCurrent();
            failure(err);
          }
        );
      });
    }

    boot();

    return {
      state: state,
      openDoc: openDoc,
      newDoc: newDoc,
      saveNow: saveNow,
      getEditor: function () { return editor; },
      refresh: function () { return refreshRemote(true); },
      reload: boot,
    };
  }

  global.DocsUI = { mount: mount, COMMANDS: COMMANDS };
})(typeof window !== 'undefined' ? window : this);
