/*
 * Role: UI of the Document view, a Google-Docs-like editor for the board's documents.
 *  - left: the board's documents (search, new, duplicate, export, delete); right: outline of the headings
 *  - toolbar (marks, color, highlight, align) + keyboard shortcuts + Markdown shortcuts + "/" (tables, callouts)
 *  - each line is a block: the left handle drags it, turns it into another type, or adds one (including a picture)
 *  - typing ** * ~~ == ++ ` renders the mark; the signs show again while the caret is in the word. [[ links a document
 *  - the link button and Ctrl+K search documents; the selected words stay. A pasted address stays a web link
 *  - "@" mentions: @ people (and everything), @@ tasks, @@@ documents; chips open the card / document
 *    a known entity is linked in place (faint until hover); the words stay as typed
 *    a task chip grows a pin when the pointer is close: parent (top), sibling (right), person (left)
 *    Backspace right after a person keeps the first name; another Backspace removes the mention
 *  - selecting text shows a bar (style, color, bold, italic, …), "Créer une tâche" and "Créer une entité"
 *  - autosave (debounced) with revision check, so two people editing the same document are warned
 * Data + writes: DocsTrello; pure helpers (Markdown <-> HTML, mention search): DocsModel. Icons: Tabler webfont.
 *
 * Contents
 *   1. helpers          2. mount: state + skeleton       3. documents list (sidebar)
 *   4. editor surface   5. commands + toolbar (+ block handles)   6. suggestions (@ and /)
 *   7. popovers/dialogs (+ cover: color, gradient, Unsplash, upload)
 *   8. saving + remote refresh       9. boot
 */
(function (global) {
  'use strict';

  var SP = function () {
    return global.SidePanel;
  };
  var DM = function () {
    return global.DocsModel;
  };
  var DT = function () {
    return global.DocsTrello;
  };
  var DH = function () {
    return global.DocsHistory;
  };
  var DL = function () {
    return global.DocsLive;
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

  var OPEN_KEY = 'cerveau.docs.openFolders';
  function loadOpenFolders() {
    try {
      var o = JSON.parse(recall(OPEN_KEY) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (e) {
      return {};
    }
  }

  var SORT_KEY = 'cerveau.docs.sort';
  function loadSort() {
    var v = recall(SORT_KEY);
    return DM().SORTS.indexOf(v) >= 0 ? v : 'date';
  }
  var SORT_LABELS = [
    ['date', 'Modifié récemment'],
    ['date-asc', 'Modifié il y a longtemps'],
    ['name', 'Nom A → Z'],
    ['name-desc', 'Nom Z → A'],
    ['size', 'Taille (plus long d’abord)'],
    ['size-asc', 'Taille (plus court d’abord)'],
  ];

  function sizeLabel(n) {
    n = n || 0;
    return (n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + ' k' : String(n)) + ' car.';
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
    if (r === 'no-name') return 'Sélectionnez du texte pour créer une tâche.';
    if (r === 'no-app-key') return 'Clé API Trello absente (components/shared/rest-config.js).';
    if (r === 'conflict') return 'Ce document a été modifié par quelqu’un d’autre.';
    return 'Échec : ' + (r || 'erreur inconnue');
  }

  function isAuthReason(err) {
    var r = err && (err.reason || err.message);
    return r === 'not-authorized' || r === 'no-token' || r === 'auth-failed' || r === 'http-401';
  }

  var BLOCK_SEL = 'P,DIV,H1,H2,H3,H4,H5,H6,LI,BLOCKQUOTE,PRE,TD,TH';

  var INK_LABELS = {
    gray: 'Gris', brown: 'Brun', orange: 'Orange', yellow: 'Jaune', green: 'Vert',
    blue: 'Bleu', purple: 'Violet', pink: 'Rose', red: 'Rouge',
  };

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
    { id: 'image', label: 'Image', icon: 'photo', kw: 'image photo picture illustration fichier' },
    { id: 'table', label: 'Tableau', icon: 'table', kw: 'tableau table grille colonnes' },
    { id: 'callout-note', label: 'Note', icon: 'info-circle', kw: 'encadre note info appel' },
    { id: 'callout-tip', label: 'Conseil', icon: 'bulb', kw: 'encadre conseil astuce tip' },
    { id: 'callout-warning', label: 'Attention', icon: 'alert-triangle', kw: 'encadre attention avertissement warning' },
    { id: 'align-left', label: 'Aligner à gauche', icon: 'align-left', kw: 'aligner gauche left', slashOnly: true },
    { id: 'align-center', label: 'Aligner au centre', icon: 'align-center', kw: 'aligner centre center milieu', slashOnly: true },
    { id: 'align-right', label: 'Aligner à droite', icon: 'align-right', kw: 'aligner droite right', slashOnly: true },
    { id: 'mention-person', label: 'Mentionner une personne', icon: 'user', hint: '@', kw: 'personne mention arobase' },
    { id: 'mention-task', label: 'Lier une tâche', icon: 'checkbox', hint: '@@', kw: 'tache carte lien' },
    { id: 'mention-doc', label: 'Lier un document', icon: 'file-text', hint: '@@@', kw: 'document page lien' },
  ];

  /* ── 2. Mount: state + skeleton ──────────────────────────────────── */

  function mount(root, t) {
    var state = {
      docs: [],
      idx: DM().emptyIndex(), // folder tree (DocsModel "Folders")
      openFolders: loadOpenFolders(),
      sort: loadSort(),
      docsLoaded: false,
      filter: '',
      current: null, // {id,title,body,rev,updatedAt} as last loaded / saved
      authOk: true,
      sources: null,
      index: null,
      entityPack: null,
      saveState: 'saved', // saved | dirty | saving | error | conflict
      saveMsg: '',
      conflict: null,
      busy: '',
      sideCollapsed: false,
      face: null,
      labelCatalog: null,
      driveUrl: '',
    };
    var editor = null;
    var saving = false;
    var saveTimer = null;
    var lastMd = '';
    var savedTitle = '';
    var lastRange = null;
    var sugg = null; // {kind:'mention'|'slash', trig, entries, active}
    var pop = null; // open popover element
    var rich = null;
    function docsRich() {
      if (rich || !global.DocsRich) return rich;
      rich = global.DocsRich.create({
        doc: document,
        getEditor: function () { return editor; },
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
        onEdit: onEdit,
        paintToolbarState: paintToolbarState,
        currentRow: currentRow,
        isEmptyBlock: isEmptyBlock,
        focusInside: focusInside,
      });
      return rich;
    }
    function fixTables() { var r = docsRich(); if (r) r.fixTables(); }
    function focusCell(cell) { var r = docsRich(); if (r) r.focusCell(cell); }
    function moveTableCell(cell, dir) { var r = docsRich(); if (r) r.moveTableCell(cell, dir); }
    function cellBelow(cell) { var r = docsRich(); return r ? r.cellBelow(cell) : null; }
    function insertTable() { var r = docsRich(); if (r) r.insertTable(); }
    function setAlign(dir) { var r = docsRich(); if (r) r.setAlign(dir); }
    function setCallout(kind) { var r = docsRich(); if (r) r.setCallout(kind); }
    function applyRich(kind, color) { var r = docsRich(); if (r) r.applyRich(kind, color); }
    function openChoiceMenu(anchor, items) { var r = docsRich(); if (r) r.openChoiceMenu(anchor, items); }
    function openColorPop(anchor) { var r = docsRich(); if (r) r.openColorPop(anchor); }
    function openTableMenu(anchor) { var r = docsRich(); if (r) r.openTableMenu(anchor); }
    function openCalloutMenu(anchor) { var r = docsRich(); if (r) r.openCalloutMenu(anchor); }
    function openAlignMenu(anchor) { var r = docsRich(); if (r) r.openAlignMenu(anchor); }
    var selBar = null; // floating "Créer une tâche" bar for the current text selection
    var blockHover = null;
    var dragBlock = null;
    var dropAt = null;
    var gripDragged = false;
    var blockHideTimer = null;
    var freshTypeOff = null;
    var metaTimer = null;
    var lastRefreshAt = Date.now();
    var toastTimer = null;
    var loadToken = 0;
    var faceToken = 0;

    root.innerHTML = '';
    var els = {
      banner: h('div', { class: 'dc-banner', hidden: true }),
      side: h('aside', { class: 'dc-side', 'aria-label': 'Documents' }),
      sideList: h('div', { class: 'dc-list', role: 'listbox' }),
      search: h('input', { class: 'dc-search-input', type: 'search', placeholder: 'Filtrer…', 'aria-label': 'Filtrer les documents', autocomplete: 'off' }),
      main: h('section', { class: 'dc-doc' }),
      head: h('div', { class: 'dc-head' }),
      headTitle: h('span', { class: 'dc-head-title' }),
      toolbar: h('div', { class: 'dc-toolbar', role: 'toolbar', 'aria-label': 'Mise en forme' }),
      conflict: h('div', { class: 'dc-conflict', hidden: true, role: 'alert' }),
      scroll: h('div', { class: 'dc-scroll' }),
      page: h('article', { class: 'dc-page' }),
      cover: h('div', { class: 'dc-cover', hidden: true }),
      coverAdd: h('div', { class: 'dc-cover-add' }),
      title: h('input', { class: 'dc-title', type: 'text', placeholder: 'Sans titre', maxlength: String(DM().MAX_TITLE), 'aria-label': 'Titre du document', spellcheck: 'true' }),
      parent: h('button', { class: 'dc-parent', type: 'button', hidden: true }),
      props: h('div', { class: 'dc-props' }),
      meta: h('div', { class: 'dc-meta' }),
      links: h('div', { class: 'dc-backlinks', hidden: true }),
      empty: h('div', { class: 'dc-empty', hidden: true }),
      outline: h('aside', { class: 'dc-outline', 'aria-label': 'Plan du document' }),
      suggest: h('div', { class: 'dc-suggest', hidden: true, role: 'listbox' }),
      toast: h('div', { class: 'dc-toast', hidden: true, role: 'status', 'aria-live': 'polite' }),
      status: h('span', { class: 'dc-status' }),
    };
    var shell = h('div', { class: 'dc-root is-booting', tabindex: '-1' }, [
      els.banner,
      h('div', { class: 'dc-main' }, [els.side, els.main, els.outline]),
      els.suggest,
      els.toast,
    ]);
    root.appendChild(shell);
    wireChipPins();

    els.main.appendChild(els.head);
    els.main.appendChild(els.toolbar);
    els.main.appendChild(els.conflict);
    els.main.appendChild(els.scroll);
    els.main.appendChild(els.empty);
    els.boot = h('div', { class: 'dc-boot', 'aria-hidden': 'true' });
    els.boot.innerHTML = global.Skeleton.html('docs.main');
    els.main.appendChild(els.boot);
    els.scroll.appendChild(els.page);
    els.page.appendChild(els.cover);
    els.page.appendChild(els.coverAdd);
    els.page.appendChild(els.parent);
    els.page.appendChild(els.title);
    els.page.appendChild(els.props);
    els.page.appendChild(els.meta);
    els.page.appendChild(els.links);
    els.blockUi = h('div', { class: 'dc-block-ui', hidden: true }, [
      h('button', { class: 'dc-block-add', type: 'button', 'aria-label': 'Ajouter un bloc', title: 'Ajouter' }, [icon('plus')]),
      h('div', { class: 'dc-block-grip', role: 'button', tabindex: '0', draggable: 'true', 'aria-label': 'Déplacer ou transformer', title: 'Glisser ou transformer' }, [icon('grip-vertical')]),
    ]);
    els.dropLine = h('div', { class: 'dc-drop-line', hidden: true });
    els.page.appendChild(els.blockUi);
    els.page.appendChild(els.dropLine);

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
      if (action && action.onMessage) {
        els.toast.appendChild(h('button', { class: 'hp-status-link', title: 'Ouvrir l’historique', onclick: action.onMessage }, [document.createTextNode(msg)]));
        action = null;
      } else {
        els.toast.appendChild(document.createTextNode(msg));
      }
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
        SP().head({
          title: 'Documents',
          actions: [
            { icon: 'arrows-sort', title: 'Trier', ariaLabel: 'Trier les documents', onclick: function (e) { openListMenu(e.currentTarget.getBoundingClientRect(), true); } },
            { icon: 'folder-plus', title: 'Nouveau dossier', onclick: function () { newFolder(''); } },
            { icon: 'plus', title: 'Nouveau document', accent: true, className: 'dc-new', onclick: function () { newDoc(); } },
          ],
        })
      );
      els.search.addEventListener('input', function () {
        state.filter = els.search.value;
        paintList();
      });
      els.side.appendChild(SP().search(els.search));
      els.side.appendChild(els.sideList);
      // empty area of the list: drop = move to the root, right-click = create / sort menu
      els.sideList.addEventListener('dragover', function (e) {
        if (!drag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        clearDropMarks();
        els.sideList.classList.add('is-drop-root');
      });
      els.sideList.addEventListener('dragleave', function (e) {
        if (!e.relatedTarget || !els.sideList.contains(e.relatedTarget)) clearDropMarks();
      });
      els.sideList.addEventListener('drop', function (e) {
        dropInto(e, '');
      });
      els.sideList.addEventListener('contextmenu', function (e) {
        if (e.target.closest && e.target.closest('.dc-item')) return;
        e.preventDefault();
        openListMenu({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY });
      });
      SP().resizable(els.side, 'docs');
    }

    function setSort(mode) {
      state.sort = mode;
      remember(SORT_KEY, mode);
      paintList();
    }

    /** Create + sort menu: right-click on the empty list area, or the sort button (anchor rect). */
    function openListMenu(rect, sortOnly) {
      closePop();
      var items = [];
      function item(iconName, label, run, checked) {
        return h('button', {
          class: 'dc-menu-item' + (checked ? ' is-on' : ''),
          type: 'button',
          onclick: function () {
            closePop();
            run();
          },
        }, [icon(checked ? 'check' : iconName), h('span', { text: label })]);
      }
      if (!sortOnly) {
        items.push(item('plus', 'Nouveau document', function () { newDoc(); }));
        items.push(item('folder-plus', 'Nouveau dossier', function () { newFolder(''); }));
        items.push(h('div', { class: 'dc-menu-sep' }));
      }
      items.push(item('archive', 'Afficher les archives', function () {
        state.showArchived = !state.showArchived;
        paintList();
      }, state.showArchived));
      items.push(h('div', { class: 'dc-menu-sep' }));
      items.push(h('div', { class: 'dc-pop-sub', text: 'Trier par' }));
      SORT_LABELS.forEach(function (s) {
        items.push(item('arrows-sort', s[1], function () { setSort(s[0]); }, state.sort === s[0]));
      });
      pop = h('div', { class: 'dc-pop dc-menu', role: 'menu' }, items);
      placePop(pop, rect);
    }

    function subjectGlyph(subject) {
      if (subject && subject.k === 'entity') return 'stack-2';
      if (subject && subject.k === 'task') return 'checkbox';
      if (subject && subject.k === 'project') return 'briefcase';
      return 'file-text';
    }

    function paintList() {
      var list = els.sideList;
      list.textContent = '';
      if (!state.docsLoaded) {
        list.innerHTML = global.Skeleton.html('docs.list');
        return;
      }
      var rows = DM().folderRows(state.docs, state.idx, state.openFolders, state.filter, state.sort, state.showArchived);
      global.Skeleton.remember('docs', { items: rows.length });
      var pend = state.pendingFolder;
      if (pend && pend.parent && !rows.some(function (r) { return r.type === 'folder' && r.folder.id === pend.parent; })) pend = state.pendingFolder = null;
      if (pend && !pend.parent) list.appendChild(newFolderRow(0));
      if (!rows.length && !pend) {
        list.appendChild(
          h('p', {
            class: 'dc-list-empty',
            text: !state.authOk ? 'Autorisation Trello requise.' : state.filter ? 'Aucun document ne correspond.' : 'Aucun document pour l’instant.',
          })
        );
        appendAddRow(list);
        return;
      }
      rows.forEach(function (r) {
        if (r.type === 'folder') {
          list.appendChild(folderRow(r));
          if (pend && pend.parent === r.folder.id) list.appendChild(newFolderRow(r.depth + 1));
          return;
        }
        var d = r.doc;
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
          class: 'sp-row dc-item' + (on ? ' is-on' : '') + (r.archived ? ' is-archived' : ''),
          style: 'padding-left:' + (8 + r.depth * 16) + 'px',
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
          docChev(r),
          itemIcon(d, subjectGlyph(d.subject)),
          h('span', { class: 'dc-item-main' }, [
            h('span', { class: 'dc-item-title', text: d.title }),
            h('span', { class: 'dc-item-time', text: DM().relativeTime(d.updatedAt) + (/^size/.test(state.sort) ? ' · ' + sizeLabel(d.size) : '') }),
          ]),
          more,
        ]);
        wireDrag(row, 'doc', d.id, docFolderOf(d.id));
        list.appendChild(row);
      });
      appendAddRow(list);
      bindDocInsert();
    }

    /** The "Nouveau document…" line that closes the list, same as the Tableau's "Nouvelle carte…". */
    function appendAddRow(list) {
      if (!global.AddRow || !state.authOk) return;
      list.appendChild(global.AddRow.line({
        label: 'Nouveau document',
        onSubmit: function (title) { newDoc(title); },
      }));
    }

    /** + in the seam under a document (or a folder) creates one there. */
    function bindDocInsert() {
      if (!global.InsertGap) return;
      global.InsertGap.watch(els.sideList, {
        item: '.dc-item',
        placeholder: 'Titre…',
        onCreate: function (title, info) {
          var above = info.above;
          if (!above) return;
          if (above.classList.contains('dc-folder')) {
            newDoc(title, '', above.getAttribute('data-folder') || '', '');
            return;
          }
          var id = above.getAttribute('data-id');
          newDoc(title, '', id ? docFolderOf(id) : '', (id && state.idx.parents && state.idx.parents[id]) || '');
        },
      });
    }

    /* Folders */

    function setFolderOpen(id, open) {
      if (open) state.openFolders[id] = 1;
      else delete state.openFolders[id];
      remember(OPEN_KEY, JSON.stringify(state.openFolders));
    }

    /** Folder a document is shown in: its own, or that of the top document it is nested under. */
    function docFolderOf(id) {
      var cur = id;
      var hops = 0;
      var parents = state.idx.parents || {};
      while (parents[cur] && hops++ < 1000) cur = parents[cur];
      if (state.idx.docs[cur]) return state.idx.docs[cur];
      var own = DM().folderByDoc(state.idx, cur);
      return own ? own.id : '';
    }

    /** Title shown for a folder: its document's title when that card exists. */
    function folderLabel(f) {
      if (!f) return '';
      var d = f.doc && state.docs.filter(function (x) { return x.id === f.doc; })[0];
      return (d && d.title) || f.name;
    }

    /** Opens the document the folder is. Creates that document the first time, for an old folder. */
    function openFolder(id) {
      var f = DM().folderById(state.idx, id);
      if (!f) return;
      if (f.doc && state.docs.some(function (d) { return d.id === f.doc; })) {
        openDoc(f.doc);
        return;
      }
      setBusy('Création du document…');
      DT().createDoc(t, f.name, '').then(function (doc) {
        setBusy('');
        state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt || '', size: 0, body: '' });
        sortDocs();
        return editFolders(function (idx) {
          var x = DM().folderById(idx, id);
          if (x && !x.doc) x.doc = doc.id;
        }).then(function () {
          return openDoc(doc.id, { skipSave: true });
        });
      }, function (err) {
        setBusy('');
        failure(err);
      });
    }

    /** Keeps the folder name in the tree equal to the document title. */
    function syncFolderName(docId, title) {
      var f = DM().folderByDoc(state.idx, docId);
      var name = DM().cleanFolderName(title);
      if (!f || !name || f.name === name) return;
      editFolders(function (idx) {
        var x = DM().folderByDoc(idx, docId);
        if (x && x.name !== name) x.name = name;
      });
    }

    function docChev(r) {
      if (!r.childCount) return h('span', { class: 'dc-chev-gap' });
      var chev = icon(r.open ? 'chevron-down' : 'chevron-right', 'dc-folder-chev dc-doc-chev');
      chev.addEventListener('click', function (e) {
        e.stopPropagation();
        setFolderOpen('doc:' + r.doc.id, !state.openFolders['doc:' + r.doc.id]);
        paintList();
      });
      return chev;
    }

    /* Click the sidebar glyph to pick another one and a color. Stored on the document. */

    var iconTimers = {};

    function itemIcon(doc, fallback, whenMissing) {
      var mark = DM().normalizeIcon(doc && doc.icon);
      var name = (mark && mark.i) || fallback;
      var btn = h('button', {
        class: 'dc-item-icon' + (mark && mark.c ? ' has-color' : ''),
        type: 'button',
        tabindex: '-1',
        draggable: 'false',
        title: 'Icône',
        'aria-label': 'Changer l’icône',
      }, [icon(name)]);
      if (mark && mark.c) btn.style.color = mark.c;
      btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        if (!doc || !doc.id) {
          if (whenMissing) whenMissing();
          return;
        }
        if (pop && pop.classList.contains('dc-iconpick') && pop._for === doc.id) {
          closePop();
          return;
        }
        openIconPicker(btn, doc, fallback);
      });
      return btn;
    }

    function scheduleIconSave(id) {
      clearTimeout(iconTimers[id]);
      iconTimers[id] = setTimeout(function () { persistIcon(id); }, 350);
    }

    function applyIcon(doc, next) {
      var norm = DM().normalizeIcon(next);
      doc.icon = norm;
      if (state.current && state.current.id === doc.id) state.current.icon = norm;
      touchListItem(doc.id, { icon: norm });
      scheduleIconSave(doc.id);
    }

    function persistIcon(id) {
      iconTimers[id] = null;
      var d = state.docs.filter(function (x) { return x.id === id; })[0];
      if (!d) return;
      if (saving) {
        scheduleIconSave(id);
        return;
      }
      var cur = state.current && state.current.id === id ? state.current : null;
      var sent = DM().iconLine(d.icon);
      var pre = cur ? saveNow() : Promise.resolve(true);
      pre.then(function (ok) {
        if (!ok) return;
        if (saving) {
          scheduleIconSave(id);
          return;
        }
        saving = true;
        if (cur && state.current === cur) setSave('saving');
        DT().setIcon(t, { id: id, rev: cur ? cur.rev : (d.rev != null ? d.rev : null) }, d.icon || null).then(function (res) {
          saving = false;
          var newer = DM().iconLine(d.icon) !== sent;
          if (cur) {
            cur.rev = res.rev;
            if (res.updatedAt) cur.updatedAt = res.updatedAt;
            if (!newer) cur.icon = res.icon;
          }
          var patch = { rev: res.rev };
          if (res.updatedAt) patch.updatedAt = res.updatedAt;
          if (!newer) patch.icon = res.icon;
          touchListItem(id, patch);
          if (cur && state.current === cur) {
            var dirty = editor && (DM().domToMd(editor) !== lastMd || (DM().cleanTitle(els.title.value) || DM().UNTITLED) !== savedTitle);
            setSave(dirty ? 'dirty' : 'saved');
          }
          if (newer) scheduleIconSave(id);
        }, function (err) {
          saving = false;
          failure(err);
        });
      });
    }

    function openIconPicker(anchor, doc, fallback) {
      closePop();
      var current = DM().normalizeIcon(doc.icon);
      var q = '';
      var box = h('div', { class: 'dc-pop dc-iconpick', role: 'dialog', 'aria-label': 'Icône' });
      box._for = doc.id;
      var search = h('input', {
        class: 'dc-input',
        type: 'text',
        placeholder: 'Icône',
        'aria-label': 'Chercher une icône',
        spellcheck: 'false',
      });
      var colors = h('div', { class: 'dc-iconpick-colors' });
      var grid = h('div', { class: 'dc-iconpick-grid' });

      function choose(next) {
        applyIcon(doc, next);
        current = DM().normalizeIcon(doc.icon);
        paint();
      }

      function iconBtn(name, label, on, clear) {
        var b = h('button', {
          class: 'dc-iconpick-btn' + (on ? ' is-on' : ''),
          type: 'button',
          title: label,
          'aria-label': label,
          onclick: function () {
            choose({ i: clear ? '' : name, c: current && current.c });
          },
        }, [icon(name)]);
        if (current && current.c) b.style.color = current.c;
        return b;
      }

      function paint() {
        colors.textContent = '';
        grid.textContent = '';
        colors.appendChild(h('button', {
          class: 'dc-iconpick-color dc-iconpick-color--none' + (!(current && current.c) ? ' is-on' : ''),
          type: 'button',
          title: 'Couleur d’origine',
          'aria-label': 'Couleur d’origine',
          onclick: function () { choose({ i: current && current.i, c: '' }); },
        }));
        DM().COVER_COLORS.forEach(function (c) {
          colors.appendChild(h('button', {
            class: 'dc-iconpick-color' + (current && current.c === c.v ? ' is-on' : ''),
            type: 'button',
            title: c.label,
            'aria-label': c.label,
            style: 'background:' + c.v,
            onclick: function () { choose({ i: current && current.i, c: c.v }); },
          }));
        });
        if (!q) grid.appendChild(iconBtn(fallback, 'Par défaut', !(current && current.i), true));
        DM().searchDocIcons(q).forEach(function (x) {
          if (!q && x.i === fallback) return;
          grid.appendChild(iconBtn(x.i, x.i, !!(current && current.i === x.i), false));
        });
      }

      search.addEventListener('input', function () { q = search.value; paint(); });
      search.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); closePop(); }
      });
      box.appendChild(search);
      box.appendChild(colors);
      box.appendChild(grid);
      pop = box;
      placePop(pop, anchor.getBoundingClientRect());
      paint();
      search.focus();
    }

    function folderRow(r) {
      var f = r.folder;
      var on = !!(state.current && f.doc && state.current.id === f.doc);
      var more = h('button', {
        class: 'dc-item-more',
        title: 'Actions',
        'aria-label': 'Actions du dossier',
        onclick: function (e) {
          e.stopPropagation();
          openFolderMenu(more, f.id);
        },
      }, [icon('dots')]);
      var chev = icon(r.open ? 'chevron-down' : 'chevron-right', 'dc-folder-chev dc-doc-chev');
      chev.addEventListener('click', function (e) {
        e.stopPropagation();
        setFolderOpen(f.id, !state.openFolders[f.id]);
        paintList();
      });
      var when = r.doc
        ? DM().relativeTime(r.doc.updatedAt) + (/^size/.test(state.sort) ? ' · ' + sizeLabel(r.doc.size) : '')
        : String(r.count);
      var row = h('div', {
        class: 'sp-row dc-item dc-folder' + (on ? ' is-on' : '') + (r.archived ? ' is-archived' : ''),
        style: 'padding-left:' + (8 + r.depth * 16) + 'px',
        role: 'treeitem',
        'aria-label': (r.doc && r.doc.title) || f.name,
        'aria-expanded': r.open ? 'true' : 'false',
        'aria-selected': on ? 'true' : 'false',
        tabindex: '0',
        'data-folder': f.id,
        onclick: function () { openFolder(f.id); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openFolder(f.id);
          }
        },
        oncontextmenu: function (e) {
          e.preventDefault();
          openFolderMenu(more, f.id);
        },
      }, [
        chev,
        itemIcon(r.doc, r.open ? 'folder-open' : 'folder', function () { openFolder(f.id); }),
        h('span', { class: 'dc-item-main' }, [
          h('span', { class: 'dc-item-title', text: (r.doc && r.doc.title) || f.name }),
          h('span', { class: 'dc-item-time', text: when }),
        ]),
        more,
      ]);
      wireDrag(row, 'folder', f.id, f.id);
      return row;
    }

    /* Drag and drop: documents and folders can be dropped on a folder (move into it), on a document
     * (move next to it, i.e. into its folder) or on the empty list area (move to the root). */

    var drag = null; // {kind, id} while one of our rows is being dragged (dataTransfer types are unreliable across browsers)

    function readDrag() {
      return drag;
    }

    function clearDropMarks() {
      Array.prototype.forEach.call(els.sideList.querySelectorAll('.is-drop, .is-drop-before, .is-drop-after'), function (n) {
        n.classList.remove('is-drop', 'is-drop-before', 'is-drop-after');
      });
      els.sideList.classList.remove('is-drop-root');
    }

    function dropInto(e, folderId) {
      var p = readDrag();
      drag = null;
      clearDropMarks();
      if (!p) return;
      e.preventDefault();
      e.stopPropagation();
      if (p.kind === 'folder') {
        if (folderId !== p.id && (DM().folderById(state.idx, p.id) || {}).parent !== (folderId || null)) moveFolder(p.id, folderId);
      } else if ((state.idx.docs[p.id] || '') !== folderId) {
        moveDocToFolder(p.id, folderId);
      }
    }

    /**
     * @param {string} dropFolder folder a drop on this row lands in ('' = root): the folder itself for a
     *   folder row, the document's own folder for a document row
     */
    function wireDrag(row, kind, id, dropFolder) {
      row.setAttribute('draggable', 'true');
      row.addEventListener('dragstart', function (e) {
        closePop();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id); // Firefox only starts a drag when some data is set
        drag = { kind: kind, id: id };
      });
      row.addEventListener('dragend', function () {
        drag = null;
        clearDropMarks();
      });
      function nestable() {
        return kind === 'doc' && drag && drag.kind === 'doc' && drag.id !== id && !DM().isDocInside(state.idx, drag.id, id);
      }
      // top / bottom edge of a document row = place the dragged document beside it (same parent), middle = nest inside
      function edgeZone(e) {
        if (!nestable()) return '';
        var r = row.getBoundingClientRect();
        var y = (e.clientY - r.top) / (r.height || 1);
        return y < 0.28 ? 'before' : y > 0.72 ? 'after' : '';
      }
      row.addEventListener('dragover', function (e) {
        if (!drag) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        clearDropMarks();
        var zone = edgeZone(e);
        if (zone) {
          row.classList.add('is-drop-' + zone);
          return;
        }
        if (nestable()) {
          row.classList.add('is-drop');
          return;
        }
        var target = dropFolder ? els.sideList.querySelector('[data-folder="' + dropFolder + '"]') : null;
        if (target) target.classList.add('is-drop');
        else els.sideList.classList.add('is-drop-root');
      });
      row.addEventListener('drop', function (e) {
        if (edgeZone(e)) {
          var moved = drag.id;
          drag = null;
          clearDropMarks();
          e.preventDefault();
          e.stopPropagation();
          placeBeside(moved, id);
          return;
        }
        if (nestable()) {
          var src = drag.id;
          drag = null;
          clearDropMarks();
          e.preventDefault();
          e.stopPropagation();
          askNest(src, id);
          return;
        }
        dropInto(e, dropFolder);
      });
    }

    /** Runs a change of the folder tree on Trello, then repaints with the merged result. */
    function editFolders(mutate, okMsg) {
      return DT().updateFolderIndex(t, mutate).then(
        function (idx) {
          state.idx = idx;
          paintList();
          if (okMsg) toast(okMsg, 'ok');
          return true;
        },
        function (err) {
          failure(err);
          return false;
        }
      );
    }

    /** Starts creating a folder right in the tree: a row with a text box, at the root or under `parentId`. */
    function newFolder(parentId) {
      state.filter = '';
      els.search.value = '';
      if (parentId) setFolderOpen(parentId, true);
      state.pendingFolder = { parent: parentId || '', value: '' };
      paintList();
    }

    function newFolderRow(depth) {
      var pend = state.pendingFolder;
      var finished = false;
      var input = h('input', {
        class: 'dc-folder-input',
        type: 'text',
        maxlength: String(DM().MAX_FOLDER_NAME),
        placeholder: 'Nom du dossier',
        'aria-label': 'Nom du nouveau dossier',
        value: pend.value,
      });
      function finish(commit) {
        if (finished) return;
        finished = true;
        var name = DM().cleanFolderName(input.value);
        state.pendingFolder = null;
        if (!commit || !name) {
          paintList();
          return;
        }
        var parentId = pend.parent;
        setBusy('Création du dossier…');
        DT().createDoc(t, name, '').then(function (doc) {
          setBusy('');
          state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt || '', size: 0, body: '' });
          sortDocs();
          return editFolders(function (idx) {
            var parent = parentId && DM().folderById(idx, parentId) ? parentId : null;
            idx.folders.push({
              id: DM().newFolderId(),
              name: DM().cleanFolderName(doc.title) || name,
              parent: parent,
              doc: doc.id,
            });
          }).then(function () {
            return openDoc(doc.id, { skipSave: true });
          }).then(function () {
            if (editor) editor.focus();
          });
        }, function (err) {
          setBusy('');
          failure(err);
          paintList();
        });
      }
      input.addEventListener('input', function () { pend.value = input.value; });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      });
      input.addEventListener('blur', function () { finish(true); });
      var row = h('div', { class: 'dc-item dc-folder dc-folder-new', style: 'padding-left:' + (8 + depth * 16) + 'px' }, [
        icon('chevron-right', 'dc-folder-chev'),
        icon('folder', 'dc-item-icon'),
        input,
      ]);
      setTimeout(function () {
        if (finished || !input.isConnected) return;
        input.focus();
        input.select();
      }, 0);
      return row;
    }

    function renameFolder(id) {
      var f = DM().folderById(state.idx, id);
      if (!f) return;
      dialog({ title: 'Renommer le dossier', text: DM().folderPath(state.idx, id), input: folderLabel(f), ok: 'Renommer' }).then(function (name) {
        name = typeof name === 'string' ? DM().cleanFolderName(name) : '';
        if (!name || name === folderLabel(f)) return;
        var renamed = f.doc
          ? DT().renameDoc(t, f.doc, name).then(function (r) {
            touchListItem(f.doc, { title: r.title });
            if (state.current && state.current.id === f.doc) {
              state.current.title = r.title;
              savedTitle = r.title;
              els.title.value = r.title === DM().UNTITLED ? '' : r.title;
            }
            return r.title;
          })
          : Promise.resolve(name);
        renamed.then(function (title) {
          editFolders(function (idx) {
            var x = DM().folderById(idx, id);
            if (x) x.name = DM().cleanFolderName(title) || name;
          });
        }, failure);
      });
    }

    /** Archiving a folder asks whether its content goes along; nothing is deleted either way. */
    function deleteFolder(id) {
      var f = DM().folderById(state.idx, id);
      if (!f) return;
      dialog({
        title: 'Archiver le dossier « ' + folderLabel(f) + ' » ?',
        text: 'Voulez-vous aussi archiver son contenu (documents et sous-dossiers) ? Sinon, le contenu reste visible et remonte d’un niveau. Les archives se retrouvent avec « Afficher les archives ».',
        ok: 'Avec son contenu',
        alt: 'Dossier seulement',
      }).then(function (answer) {
        if (!answer) return;
        editFolders(function (idx) { DM().archiveFolderIn(idx, id, answer === true); }, 'Dossier archivé.').then(function () {
          if (state.current && state.idx.archived && state.idx.archived[state.current.id] && !state.showArchived) leaveArchivedDoc();
        });
      });
    }

    /** folderId '' = root. Refuses to put a folder inside itself. */
    function moveFolder(id, parentId) {
      editFolders(function (idx) {
        var x = DM().folderById(idx, id);
        if (!x || (parentId && !DM().folderById(idx, parentId)) || DM().isInsideFolder(idx, id, parentId)) return;
        x.parent = parentId || null;
      });
    }

    function moveDocToFolder(docId, folderId) {
      editFolders(function (idx) {
        if (folderId && DM().folderById(idx, folderId)) idx.docs[docId] = folderId;
        else delete idx.docs[docId];
        if (idx.parents) delete idx.parents[docId];
      }).then(function (ok) {
        if (ok && folderId) setFolderOpen(folderId, true);
        if (ok) paintList();
      });
    }

    function docTitle(id) {
      var d = state.docs.filter(function (x) { return x.id === id; })[0];
      return d ? d.title : '';
    }

    /** Dropping a document on another one nests it right away (easily undone by dragging it out). */
    function askNest(docId, parentId) {
      nestDoc(docId, parentId);
    }

    /** Puts `docId` at the same level as `targetId`: same parent document, or same folder / root. */
    function placeBeside(docId, targetId) {
      editFolders(function (idx) {
        if (docId === targetId || DM().isDocInside(idx, docId, targetId)) return;
        idx.parents = idx.parents || {};
        var parent = idx.parents[targetId];
        if (parent) {
          idx.parents[docId] = parent;
          delete idx.docs[docId];
        } else {
          delete idx.parents[docId];
          if (idx.docs[targetId]) idx.docs[docId] = idx.docs[targetId];
          else delete idx.docs[docId];
        }
      }).then(function (ok) {
        if (ok) paintList();
      });
    }

    function nestDoc(docId, parentId) {
      return editFolders(function (idx) {
        if (DM().isDocInside(idx, docId, parentId)) return;
        idx.parents = idx.parents || {};
        idx.parents[docId] = parentId;
        delete idx.docs[docId];
      }).then(function (ok) {
        if (!ok) return;
        var holder = DM().folderByDoc(state.idx, parentId);
        setFolderOpen(holder ? holder.id : 'doc:' + parentId, true);
        paintList();
        if (state.current && (state.current.id === docId || state.current.id === parentId)) paintProps();
      });
    }

    /** Takes a nested document out of its parent, leaving it in the parent's folder. */
    function unnestDoc(docId) {
      editFolders(function (idx) {
        var p = idx.parents && idx.parents[docId];
        if (!p) return;
        var cur = p;
        var hops = 0;
        while (idx.parents[cur] && hops++ < 1000) cur = idx.parents[cur];
        delete idx.parents[docId];
        var holder = DM().folderByDoc(idx, cur);
        if (idx.docs[cur]) idx.docs[docId] = idx.docs[cur];
        else if (holder) idx.docs[docId] = holder.id;
      });
    }

    /** Popover listing the root and every folder (optionally minus a folder's own subtree). */
    function openFolderPicker(anchor, title, current, excludeId, onPick) {
      closePop();
      var idx = state.idx;
      var items = [h('div', { class: 'dc-pop-sub', text: title })];
      function opt(label, id, depth) {
        items.push(h('button', {
          class: 'dc-menu-item' + (id === current ? ' is-on' : ''),
          type: 'button',
          style: 'padding-left:' + (10 + depth * 14) + 'px',
          onclick: function () {
            closePop();
            if (id !== current) onPick(id);
          },
        }, [icon(id ? 'folder' : 'home'), h('span', { text: label })]));
      }
      opt('Racine (aucun dossier)', '', 0);
      (function walk(pid, depth) {
        idx.folders
          .filter(function (f) { return (f.parent || '') === pid; })
          .sort(function (a, b) { return a.name.localeCompare(b.name); })
          .forEach(function (f) {
            if (excludeId && DM().isInsideFolder(idx, excludeId, f.id)) return;
            opt(folderLabel(f), f.id, depth + 1);
            walk(f.id, depth + 1);
          });
      })('', 0);
      pop = h('div', { class: 'dc-pop dc-menu', role: 'menu' }, items);
      placePop(pop, anchor.getBoundingClientRect());
    }

    function openFolderMenu(anchor, folderId) {
      closePop();
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
      var f = DM().folderById(state.idx, folderId);
      if (!f) return;
      pop = h('div', { class: 'dc-pop dc-menu', role: 'menu' }, [
        item('plus', 'Nouveau document ici', function () { newDoc(null, null, folderId); }),
        item('folder-plus', 'Nouveau sous-dossier', function () { newFolder(folderId); }),
        item('pencil', 'Renommer…', function () { renameFolder(folderId); }),
        item('folder-share', 'Déplacer vers…', function () {
          openFolderPicker(anchor, 'Déplacer le dossier vers', f.parent || '', folderId, function (to) { moveFolder(folderId, to); });
        }),
        h('div', { class: 'dc-menu-sep' }),
        f.archived
          ? item('archive-off', 'Restaurer', function () { editFolders(function (idx) { DM().restoreFolderIn(idx, folderId); }, 'Dossier restauré.'); })
          : item('archive', 'Archiver…', function () { deleteFolder(folderId); }, true),
      ]);
      placePop(pop, anchor.getBoundingClientRect());
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
          : n.nodeType === 1 && !/^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|PRE|HR|TABLE|FIGURE)$/.test(n.nodeName);
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
      var n = editor.firstChild;
      while (n) {
        if (n.nodeType === 3) {
          if (/\S/.test(String(n.nodeValue || '').replace(/\u200b/g, ''))) return false;
        } else if (n.nodeType === 1) {
          if (n.matches && n.matches('hr, figure, table, img, li, pre, blockquote, h1, h2, h3')) return false;
          if (n.querySelector && n.querySelector('.dc-mention, hr, figure, table, img, li, pre, blockquote, h1, h2, h3')) return false;
          if (/\S/.test(String(n.textContent || '').replace(/\u200b/g, ''))) return false;
        }
        n = n.nextSibling;
      }
      return true;
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
      on('highlight', inEditor && !!closestIn(n, 'MARK'));
      on('callout', inEditor && !!closestIn(n, 'BLOCKQUOTE[data-callout]'));
      var aligned = inEditor && closestIn(n, 'P,H1,H2,H3,BLOCKQUOTE,TD,TH');
      var align = aligned && aligned.getAttribute('data-align');
      on('align', align === 'center' || align === 'right');
      var sel = els.toolbar.querySelector('.dc-select');
      if (sel && inEditor) sel.value = blockType() === 'codeblock' ? 'p' : blockType();
      paintSelBarState();
    }

    function onEdit(kind) {
      if (kind !== 'text') {
        fixTables();
        fixImages();
        fixChips();
      }
      normalizeRoot();
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
      var cur = state.current;
      var words = DM().countWords(editor.textContent || '');
      var who = docWho(cur);
      var line = [];
      if (who && who.author) line.push('Créé par ' + whoName(who.author.member));
      if (cur.updatedAt) {
        var by = who && who.editor ? (Date.parse(cur.updatedAt) - Date.parse(who.editor.date) > 5000 ? whoMe : who.editor.member) : null;
        var mod = 'modifié ' + DM().relativeTime(cur.updatedAt) + (by ? ' par ' + whoName(by) : '');
        line.push(DH() ? h('button', { class: 'dc-meta-link', type: 'button', title: 'Historique des versions', onclick: openVersions }, [mod]) : mod);
      }
      line.push(words + (words > 1 ? ' mots' : ' mot'));
      var span = h('span');
      line.forEach(function (x, i) {
        if (i) span.appendChild(document.createTextNode(' · '));
        span.appendChild(typeof x === 'string' ? document.createTextNode(x) : x);
      });
      els.meta.appendChild(span);
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
      paintBacklinks();
    }

    function docsForLinks() {
      return (state.docs || []).map(function (d) {
        if (state.current && d.id === state.current.id && editor) return Object.assign({}, d, { body: lastDomMd() });
        return d;
      });
    }

    function paintBacklinks() {
      if (!els.links) return;
      els.links.textContent = '';
      if (!state.current || !global.WorkOS || typeof global.WorkOS.backlinks !== 'function') return;
      var links = global.WorkOS.backlinks(docsForLinks(), 'doc', state.current.id);
      if (!links.length) { els.links.hidden = true; return; }
      els.links.hidden = false;
      els.links.appendChild(h('span', { class: 'dc-backlinks-k', text: 'Mentionné dans' }));
      links.forEach(function (d) {
        els.links.appendChild(h('button', {
          class: 'dc-mention-link',
          type: 'button',
          text: d.title,
          onclick: function () { openDoc(d.id); },
        }));
      });
    }

    /* Author, last editor and version history (DocsHistory, from Trello card actions). */
    var whoMe = null;

    /** {author, editor} of a document, fetched once per opened document (null while loading). */
    function docWho(doc) {
      if (!DH()) return null;
      if (doc.who !== undefined) return doc.who;
      doc.who = null;
      Promise.all([DH().loadWho(t, doc.id), DH().loadMe(t)]).then(function (r) {
        doc.who = r[0];
        whoMe = r[1];
        if (state.current === doc) paintMeta();
      }, function () {});
      return null;
    }

    function whoName(m) {
      return whoMe && m && m.id === whoMe.id ? 'vous' : (m && m.name) || 'quelqu’un';
    }

    function openVersions() {
      var cur = state.current;
      if (!cur || !DH()) return;
      closePop();
      saveNow().then(function () {
        if (state.current !== cur) return;
        histFlush();
        DH().loadMe(t).then(function (me) {
          DH().openPanel({ root: shell, t: t, docId: cur.id, title: cur.title, currentBody: cur.body || '', me: me, onRestore: restoreVersion });
        });
      });
    }

    /** Writes an older text back as a new revision (undoable with Ctrl+Z like any body edit). */
    function restoreVersion(body) {
      var cur = state.current;
      if (!cur) return Promise.resolve(false);
      var was = cur.body || '';
      if (body === was) return Promise.resolve(true);
      return DT().saveDoc(t, { id: cur.id, body: body, rev: cur.rev, cover: cur.cover || null }).then(function (res) {
        var s = histSummary(was, body);
        var keep = was.length <= HIST_MAX_BODY && body.length <= HIST_MAX_BODY;
        record({
          type: 'edit', key: 'body', label: 'Contenu', targetId: cur.id,
          title: DM().cleanTitle(cur.title) || DM().UNTITLED,
          before: s.before, after: s.after,
          beforeVal: keep ? was : null, afterVal: keep ? body : null,
        });
        touchListItem(cur.id, { updatedAt: res.updatedAt, size: body.length });
        return openDoc(cur.id, { reload: true, skipSave: true }).then(function () {
          toast('Version restaurée.', 'ok');
          return true;
        });
      }, function (err) {
        failure(err);
        return false;
      });
    }

    /* Page fields: subject (task or entity), its metadata, tags, child documents. */
    var LABEL_BG = {
      green: '#216e4e', yellow: '#7f5f01', orange: '#a54800', red: '#ae2e24',
      purple: '#5e4db2', blue: '#0055cc', sky: '#206a83', lime: '#4c6b1f',
      pink: '#943d73', black: '#44546f',
    };
    var DUE_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

    function dueLabel(iso) {
      var ms = Date.parse(iso);
      if (!isFinite(ms)) return '';
      var d = new Date(ms);
      return d.getDate() + ' ' + DUE_MONTHS[d.getMonth()];
    }

    function pageProps() {
      var p = state.current && state.current.props;
      return { tags: p && p.tags ? p.tags.slice() : [], people: p && p.people ? p.people.slice() : [] };
    }

    function memberName(id) {
      var src = (state.sources && state.sources.members) || [];
      var m = src.filter(function (x) { return x.id === id; })[0];
      if (m) return m.fullName || m.name || m.username || id;
      var fm = state.face && (state.face.members || []).filter(function (x) { return x.id === id; })[0];
      return (fm && fm.name) || id;
    }

    function isTaskPage() {
      return !!(state.current && state.current.subject && state.current.subject.k === 'task' && state.face && !state.face.missing);
    }

    function propRow(iconName, label, fill, extra) {
      var value = h('div', { class: 'dc-prop-value' });
      fill(value);
      return h('div', { class: 'dc-prop' }, [
        h('div', { class: 'dc-prop-label' }, [icon(iconName), h('span', { text: label }), extra || null]),
        value,
      ]);
    }

    function emptyBtn(text, run) {
      return h('button', { class: 'dc-prop-empty', type: 'button', onclick: run }, [text]);
    }

    function chip(label, opts) {
      opts = opts || {};
      var box = h('span', { class: 'dc-chip' + (opts.dim ? ' is-dim' : '') });
      if (opts.color && LABEL_BG[opts.color]) {
        box.style.background = LABEL_BG[opts.color];
        box.style.color = '#fff';
      }
      box.appendChild(h('button', { class: 'dc-chip-main', type: 'button', title: opts.title || label, onclick: opts.onClick || null }, [label]));
      if (opts.onRemove) {
        box.appendChild(h('button', {
          class: 'dc-chip-x', type: 'button', 'aria-label': 'Retirer',
          onclick: function (e) { e.stopPropagation(); opts.onRemove(); },
        }, ['×']));
      }
      return box;
    }

    function openPicker(anchor, rows, tail) {
      closePop();
      var box = h('div', { class: 'dc-pop dc-picker' });
      var search = h('input', { class: 'dc-picker-search', type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher' });
      var list = h('div', { class: 'dc-picker-list' });
      function paint(q) {
        list.textContent = '';
        var query = DM().fold(q || '');
        var shown = 0;
        rows.forEach(function (r) {
          if (query && DM().fold(r.label).indexOf(query) < 0) return;
          if (shown >= 40) return;
          shown += 1;
          list.appendChild(h('button', {
            class: 'dc-menu-item' + (r.on ? ' is-on' : ''),
            type: 'button',
            onclick: function () { r.run(); },
          }, [icon(r.on ? 'check' : (r.icon || 'point')), h('span', { text: r.label })]));
        });
        if (typeof tail === 'function') tail(list, q || '', shown);
        if (!list.childNodes.length) list.appendChild(h('div', { class: 'dc-pop-sub', text: 'Aucun résultat' }));
      }
      search.addEventListener('input', function () { paint(search.value); });
      box.appendChild(search);
      box.appendChild(list);
      pop = box;
      placePop(pop, anchor.getBoundingClientRect());
      paint('');
      search.focus();
    }

    function patchPage(patch) {
      var cur = state.current;
      if (!cur) return Promise.resolve();
      return DT().patchMeta(t, { id: cur.id, rev: cur.rev }, patch).then(function (res) {
        cur.rev = res.rev;
        cur.updatedAt = res.updatedAt;
        if (patch.subject !== undefined) cur.subject = res.subject;
        if (patch.props !== undefined) cur.props = res.props;
        touchListItem(cur.id, { subject: cur.subject, props: cur.props, updatedAt: res.updatedAt });
        return res;
      }, failure);
    }

    function bindSubject(kind, id, title) {
      var cur = state.current;
      if (!cur) return;
      var other = DM().docForSubject(state.docs, kind, id);
      if (other && other.id !== cur.id) {
        toast(kind === 'entity' ? 'Cette entité a déjà une page.' : 'Cette tâche a déjà une page.');
        openDoc(other.id);
        return;
      }
      patchPage({ subject: { k: kind, id: id } }).then(function (res) {
        if (!res) return;
        if ((!els.title.value.trim() || cur.title === DM().UNTITLED) && title) {
          els.title.value = DM().cleanTitle(title);
          scheduleSave(10);
        }
        loadFace();
      });
    }

    function openLinkPicker(anchor) {
      var cards = ((state.sources && state.sources.cards) || []).filter(function (c) {
        return c && c.id && !DM().isDocName(c.name) && String(c.name || '').indexOf('🧩') !== 0;
      });
      function rowsFor(ents) {
        var rows = cards.map(function (c) {
          return { label: c.name || 'Sans titre', icon: 'checkbox', run: function () { closePop(); bindSubject('task', c.id, c.name); } };
        });
        (ents || []).forEach(function (ent) {
          rows.push({ label: ent.name, icon: 'stack-2', run: function () { closePop(); bindSubject('entity', ent.id, ent.name); } });
        });
        return rows;
      }
      DT().listEntityChoices(t).then(
        function (ents) { openPicker(anchor, rowsFor(ents)); },
        function () { openPicker(anchor, rowsFor([])); }
      );
    }

    function togglePerson(id) {
      if (isTaskPage()) {
        var ids = (state.face.members || []).map(function (m) { return m.id; });
        var at = ids.indexOf(id);
        if (at >= 0) ids.splice(at, 1);
        else ids.push(id);
        DT().setCardMembers(t, state.current.subject.id, ids).then(function () { loadFace(); }, failure);
        return;
      }
      var props = pageProps();
      var j = props.people.indexOf(id);
      if (j >= 0) props.people.splice(j, 1);
      else props.people.push(id);
      patchPage({ props: props }).then(function () { paintProps(); });
    }

    function openPeoplePicker(anchor) {
      var members = (state.sources && state.sources.members) || [];
      var on = isTaskPage() ? (state.face.members || []).map(function (m) { return m.id; }) : pageProps().people;
      openPicker(anchor, members.map(function (m) {
        return {
          label: m.fullName || m.name || m.username || m.id,
          icon: 'user',
          on: on.indexOf(m.id) >= 0,
          run: function () { closePop(); togglePerson(m.id); },
        };
      }));
    }

    function FC() {
      return global.FieldCatalog;
    }

    function ensureLabelCatalog() {
      if (state.labelCatalog) return Promise.resolve(state.labelCatalog);
      if (!t || typeof t.board !== 'function') {
        state.labelCatalog = [];
        return Promise.resolve(state.labelCatalog);
      }
      return t.board('labels').then(function (b) {
        state.labelCatalog = ((b && b.labels) || []).map(function (l) {
          return { id: String(l.id), name: l.name || '', color: l.color || '' };
        });
        return state.labelCatalog;
      }, function () {
        state.labelCatalog = [];
        return state.labelCatalog;
      });
    }

    function mergedLabels() {
      var seen = Object.create(null);
      var out = [];
      (state.labelCatalog || []).concat((state.face && state.face.labels) || []).forEach(function (l) {
        if (!l || l.id == null || seen[l.id]) return;
        seen[l.id] = true;
        out.push({ id: String(l.id), name: l.name || '', color: l.color || '' });
      });
      return out;
    }

    function nativeText(field) {
      var tf = state.taskFields || {};
      var inputs = tf.inputs || {};
      var meta = (state.face && state.face.meta) || {};
      if (field.kind === 'priority') {
        if (!tf.inputs || !global.PriorityMatrix) return '';
        var resolved = global.PriorityMatrix.resolveLabel(inputs);
        return (resolved && resolved.label) || '';
      }
      if (field.kind === 'place') {
        var at = inputs.places && inputs.places.at;
        if (at && at.name) return at.name;
        return meta.lieu || '';
      }
      if (field.kind === 'category') return tf.category || meta.categorie || '';
      if (field.kind === 'money') return meta.money || '';
      var key = FC().metaKey(field);
      return (key && meta[key]) || '';
    }

    function fieldRaw(field) {
      var native = nativeText(field);
      if (native) return native;
      var hit = FC().valueOn(field, (state.face && state.face.labels) || []);
      return hit ? hit.value : '';
    }

    function stripField(fieldId) {
      var fc = FC();
      if (!fc || !state.current || !state.current.subject) return Promise.resolve();
      var ids = ((state.face && state.face.labels) || []).map(function (l) { return l.id; });
      var next = fc.without(mergedLabels(), ids, fieldId);
      if (next.join(',') === ids.join(',')) return Promise.resolve();
      return DT().setCardLabels(t, state.current.subject.id, next);
    }

    function writePlace(cardId, value) {
      var PT = global.PriorityTrello;
      var UI = global.PriorityUI;
      var remembered = DT().saveCardMeta(t, cardId, 'lieu', value);
      if (!PT || typeof PT.getCardInputsById !== 'function' || typeof PT.saveCardInputsById !== 'function' || !UI || typeof UI.createPlaceRef !== 'function') {
        return remembered;
      }
      return PT.getCardInputsById(t, cardId).then(function (inputs) {
        if (!inputs) return remembered;
        var places = Object.assign({}, inputs.places || {});
        if (!value) delete places.at;
        else {
          var found = typeof UI.findPlaceCatalogByName === 'function' ? UI.findPlaceCatalogByName(value) : null;
          places.at = found || UI.createPlaceRef(value);
        }
        return PT.saveCardInputsById(t, cardId, { places: places }).then(function () { return remembered; });
      }, function () { return remembered; });
    }

    function writeCategory(cardId, value) {
      var TT = global.TableTrello;
      var sheets = global.SheetsTrello;
      var fieldId = state.taskFields && state.taskFields.categoryFieldId;
      function viaMeta() {
        return DT().saveCardMeta(t, cardId, 'categorie', value);
      }
      if (!TT || typeof TT.saveCategory !== 'function') return viaMeta();
      var ensure = fieldId
        ? Promise.resolve(fieldId)
        : sheets && typeof sheets.ensureCategoryCustomField === 'function'
          ? sheets.ensureCategoryCustomField(t).then(function (res) { return res && res.data && res.data.id; }, function () { return null; })
          : Promise.resolve(null);
      return ensure.then(function (id) {
        if (!id) return viaMeta();
        return TT.saveCategory(t, cardId, id, value).then(function () {
          if (state.taskFields) {
            state.taskFields.categoryFieldId = id;
            state.taskFields.category = value || '';
          }
        }, viaMeta);
      }, viaMeta);
    }

    function commitField(field, value) {
      if (!state.current || !state.current.subject) return;
      var cardId = state.current.subject.id;
      var job;
      if (field.kind === 'place') job = writePlace(cardId, value);
      else if (field.kind === 'category') job = writeCategory(cardId, value);
      else if (field.kind === 'priority') job = Promise.resolve();
      else job = DT().saveCardMeta(t, cardId, FC().metaKey(field), value);
      job.then(function () { return stripField(field.id); }).then(function () { loadFace(); }, failure);
    }

    function editPriority(anchor) {
      if (!global.CardFields || !isTaskPage()) return;
      global.CardFields.open('priority', {
        t: t, cardId: state.current.subject.id, cardName: state.face.name, anchor: anchor,
        onSaved: function () { stripField('priority').then(function () { loadFace(); }, failure); },
      });
    }

    function openFieldPicker(anchor, field) {
      var fc = FC();
      var current = fieldRaw(field);
      var rows = field.options.map(function (o) {
        var label = fc.pretty(o.value);
        return {
          label: label,
          icon: field.icon,
          on: fc.fold(o.value) === fc.fold(current),
          run: function () {
            closePop();
            commitField(field, fc.fold(o.value) === fc.fold(current) ? '' : o.value);
          },
        };
      });
      if (current && !rows.some(function (r) { return fc.fold(r.label) === fc.fold(current); })) {
        rows.unshift({
          label: fc.pretty(current),
          icon: field.icon,
          on: true,
          run: function () { closePop(); commitField(field, ''); },
        });
      }
      openPicker(anchor, rows, function (list, q) {
        var typed = String(q || '').trim();
        if (!typed || typed.length > 40) return;
        var query = fc.fold(typed);
        var exists = rows.some(function (r) { return fc.fold(r.label).indexOf(query) >= 0; });
        if (exists) return;
        list.appendChild(h('button', {
          class: 'dc-menu-item',
          type: 'button',
          onclick: function () { closePop(); commitField(field, typed); },
        }, [icon(field.icon), h('span', { text: typed })]));
      });
    }

    function openField(field, anchor) {
      if (field.kind === 'priority') editPriority(anchor);
      else openFieldPicker(anchor, field);
    }

    function paintLabelBag(labels) {
      els.props.appendChild(propRow('tags', 'Étiquettes', function (v) {
        if (!labels.length) v.appendChild(emptyBtn('Cliquer pour ajouter…', function (e) { openLabelPicker(e.currentTarget); }));
        labels.forEach(function (l) {
          v.appendChild(chip(l.name || 'Étiquette', {
            color: l.color,
            onClick: function (e) { openLabelPicker(e.currentTarget); },
            onRemove: function () {
              var ids = (state.face.labels || []).map(function (x) { return x.id; }).filter(function (id) { return id !== l.id; });
              DT().setCardLabels(t, state.current.subject.id, ids).then(function () { loadFace(); }, failure);
            },
          }));
        });
      }));
    }

    function paintTaskFields() {
      var fc = FC();
      if (!fc || state.labelCatalog == null) {
        paintLabelBag(state.face.labels || []);
        return;
      }
      var fields = fc.catalog(mergedLabels());
      fields.forEach(function (field) {
        els.props.appendChild(propRow(field.icon, field.label, function (v) {
          var raw = fieldRaw(field);
          var text = raw ? fc.pretty(raw) : '';
          var fromLabel = !nativeText(field) && fc.valueOn(field, state.face.labels || []);
          if (!text) {
            v.appendChild(emptyBtn('Cliquer pour ajouter…', function (e) { openField(field, e.currentTarget); }));
            return;
          }
          v.appendChild(chip(text, {
            onClick: function (e) { openField(field, e.currentTarget); },
            onRemove: field.kind === 'priority' && !fromLabel ? null : function () { commitField(field, ''); },
          }));
        }));
      });
      var loose = fc.loose(state.face.labels || []);
      if (!fields.length) paintLabelBag(state.face.labels || []);
      else if (loose.length) paintLabelBag(loose);
    }

    function openLabelPicker(anchor) {
      ensureLabelCatalog().then(function () {
        var fc = FC();
        var labels = fc ? fc.loose(mergedLabels()) : (state.labelCatalog || []);
        var on = ((state.face && state.face.labels) || []).map(function (l) { return l.id; });
        openPicker(anchor, labels.map(function (l) {
          return {
            label: l.name || 'Étiquette',
            icon: 'tag',
            on: on.indexOf(l.id) >= 0,
            run: function () {
              closePop();
              var ids = on.slice();
              var i = ids.indexOf(l.id);
              if (i >= 0) ids.splice(i, 1);
              else ids.push(l.id);
              DT().setCardLabels(t, state.current.subject.id, ids).then(function () { loadFace(); }, failure);
            },
          };
        }));
      }, failure);
    }

    function editDue(anchor) {
      if (!global.CardFields || !isTaskPage()) return;
      global.CardFields.open('due', {
        t: t, cardId: state.current.subject.id, cardName: state.face.name, anchor: anchor,
        onSaved: function () { loadFace(); },
      });
    }

    function editDesc(anchor) {
      if (!global.CardFields || !isTaskPage()) return;
      global.CardFields.open('desc', {
        t: t, cardId: state.current.subject.id, anchor: anchor, value: state.face.desc || '',
        save: function (text) { return DT().saveCardDesc(t, state.current.subject.id, text); },
        onSaved: function () { loadFace(); },
      });
    }

    function commitTag(input) {
      var raw = input.value;
      if (!raw || !String(raw).trim()) return;
      var props = pageProps();
      props.tags = props.tags.concat([raw]);
      input.value = '';
      patchPage({ props: props }).then(function () { paintProps(); });
    }

    function childDocs() {
      var id = state.current && state.current.id;
      if (!id) return [];
      var parents = (state.idx && state.idx.parents) || {};
      var folder = DM().folderByDoc(state.idx, id);
      var skip = {};
      (state.idx.folders || []).forEach(function (f) { if (f.doc) skip[f.doc] = true; });
      return state.docs.filter(function (d) {
        if (d.id === id || skip[d.id]) return false;
        if (parents[d.id] === id) return true;
        return !!(folder && state.idx.docs[d.id] === folder.id);
      });
    }

    function childFolders() {
      var folder = state.current && DM().folderByDoc(state.idx, state.current.id);
      if (!folder) return [];
      return state.idx.folders.filter(function (f) {
        return f.parent === folder.id && (state.showArchived || !f.archived);
      }).sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    }

    function paintParent() {
      var cur = state.current;
      var parents = (state.idx && state.idx.parents) || {};
      var pid = cur && parents[cur.id];
      var parent = pid && state.docs.filter(function (d) { return d.id === pid; })[0];
      if (!parent && cur && state.idx && state.idx.docs[cur.id]) {
        var holder = DM().folderById(state.idx, state.idx.docs[cur.id]);
        if (holder && holder.doc && holder.doc !== cur.id) parent = state.docs.filter(function (d) { return d.id === holder.doc; })[0];
      }
      if (!parent && cur) {
        var me = DM().folderByDoc(state.idx, cur.id);
        var up = me && me.parent && DM().folderById(state.idx, me.parent);
        if (up && up.doc) parent = state.docs.filter(function (d) { return d.id === up.doc; })[0];
      }
      els.parent.hidden = !parent;
      els.parent.textContent = '';
      if (!parent) return;
      els.parent.appendChild(icon('corner-down-right'));
      els.parent.appendChild(document.createTextNode(parent.title));
      els.parent.onclick = function () { openDoc(parent.id); };
    }

    function loadFace() {
      var cur = state.current;
      var sub = cur && cur.subject;
      var token = ++faceToken;
      state.face = null;
      state.taskFields = null;
      paintProps();
      if (!sub || sub.k === 'project') return;
      var req = sub.k === 'task' ? DT().loadCardFace(t, sub.id) : DT().loadEntityFace(t, sub.id);
      req.then(function (face) {
        if (token !== faceToken || !state.current || !state.current.subject || state.current.subject.id !== sub.id) return;
        state.face = face;
        var extra = sub.k === 'task'
          ? Promise.all([
            ensureLabelCatalog(),
            DT().loadTaskFields ? DT().loadTaskFields(t, sub.id).catch(function () { return null; }) : Promise.resolve(null),
          ])
          : Promise.resolve(null);
        return extra.then(function (pair) {
          if (token !== faceToken) return;
          if (pair && pair[1]) state.taskFields = pair[1];
          paintProps();
        });
      }, function () {
        if (token !== faceToken) return;
        state.face = { missing: true, id: sub.id };
        paintProps();
      });
    }

    function paintProps() {
      var active = document.activeElement;
      if (active && els.props.contains(active) && active.tagName === 'INPUT') return;
      els.props.textContent = '';
      paintParent();
      var cur = state.current;
      if (!cur) return;
      var sub = cur.subject;
      if (!sub) {
        els.props.appendChild(propRow('link', 'Lié à', function (v) {
          v.appendChild(emptyBtn('Cliquer pour lier…', function (e) { openLinkPicker(e.currentTarget); }));
        }));
      } else if (sub.k !== 'project') {
        var face = state.face;
        var missing = !!(face && face.missing);
        var name = (face && face.name) || (sub.k === 'entity' ? 'Entité' : 'Tâche');
        els.props.appendChild(propRow(sub.k === 'entity' ? 'stack-2' : 'checkbox', sub.k === 'entity' ? 'Entité' : 'Tâche', function (v) {
          v.appendChild(chip(missing ? 'Introuvable' : name, {
            dim: missing,
            onClick: function () {
              if (missing) return;
              if (sub.k === 'task' && t && typeof t.showCard === 'function') t.showCard(sub.id);
              else if (sub.k === 'entity' && global.ViewTabs) global.location.assign(global.ViewTabs.hrefForSubject('./entities.html', global.location, 'entity', sub.id));
            },
            onRemove: function () { patchPage({ subject: null }).then(function () { loadFace(); }); },
          }));
        }));
      }
      if (isTaskPage()) {
        els.props.appendChild(propRow('users', 'Personnes', function (v) {
          var members = state.face.members || [];
          if (!members.length) v.appendChild(emptyBtn('Cliquer pour ajouter…', function (e) { openPeoplePicker(e.currentTarget); }));
          members.forEach(function (m) {
            v.appendChild(chip(m.name || memberName(m.id), {
              onClick: function (e) { openPeoplePicker(e.currentTarget); },
              onRemove: function () { togglePerson(m.id); },
            }));
          });
        }));
        paintTaskFields();
        els.props.appendChild(propRow('calendar-event', 'Échéance', function (v) {
          var due = dueLabel(state.face.due);
          v.appendChild(due
            ? h('button', { class: 'dc-prop-text', type: 'button', onclick: function (e) { editDue(e.currentTarget); } }, [due])
            : emptyBtn('Cliquer pour ajouter…', function (e) { editDue(e.currentTarget); }));
        }));
        els.props.appendChild(propRow('align-left', 'Description', function (v) {
          var shown = String(state.face.desc || '').replace(/\s+/g, ' ').trim();
          if (shown.length > 90) shown = shown.slice(0, 90) + '…';
          v.appendChild(shown
            ? h('button', { class: 'dc-prop-text', type: 'button', onclick: function (e) { editDesc(e.currentTarget); } }, [shown])
            : emptyBtn('Cliquer pour ajouter…', function (e) { editDesc(e.currentTarget); }));
        }));
      } else if (!sub || sub.k === 'entity') {
        if (sub && state.face && state.face.aliases && state.face.aliases.length) {
          els.props.appendChild(propRow('quote', 'Alias', function (v) {
            state.face.aliases.forEach(function (a) { v.appendChild(h('span', { class: 'dc-chip is-quiet', text: a })); });
          }));
        }
        els.props.appendChild(propRow('users', 'Personnes', function (v) {
          var people = pageProps().people;
          if (!people.length) v.appendChild(emptyBtn('Cliquer pour ajouter…', function (e) { openPeoplePicker(e.currentTarget); }));
          people.forEach(function (id) {
            v.appendChild(chip(memberName(id), {
              onClick: function (e) { openPeoplePicker(e.currentTarget); },
              onRemove: function () { togglePerson(id); },
            }));
          });
        }));
      }
      var tags = pageProps().tags;
      els.props.appendChild(propRow('tag', 'Mots-clés', function (v) {
        tags.forEach(function (tag) {
          v.appendChild(chip(tag, {
            onRemove: function () {
              var props = pageProps();
              props.tags = props.tags.filter(function (x) { return x.toLowerCase() !== tag.toLowerCase(); });
              patchPage({ props: props }).then(function () { paintProps(); });
            },
          }));
        });
        v.appendChild(h('input', {
          class: 'dc-tag-input' + (tags.length ? '' : ' is-empty'),
          type: 'text',
          placeholder: tags.length ? '' : 'Cliquer pour ajouter…',
          'aria-label': 'Mot-clé',
          maxlength: '20',
          onkeydown: function (e) {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitTag(e.target);
              e.target.blur();
            } else if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); }
          },
          onblur: function (e) { commitTag(e.target); },
        }));
      }));
      var addDoc = h('button', {
        class: 'dc-prop-add', type: 'button', title: 'Nouveau sous-document', 'aria-label': 'Nouveau sous-document',
        onclick: function (e) { e.stopPropagation(); newDoc(null, null, null, cur.id); },
      }, [icon('plus')]);
      els.props.appendChild(propRow('files', 'Documents', function (v) {
        childFolders().forEach(function (f) {
          v.appendChild(h('button', { class: 'dc-subdoc', type: 'button', onclick: function () { openFolder(f.id); } }, [
            icon('folder'),
            h('span', { text: folderLabel(f) }),
          ]));
        });
        childDocs().forEach(function (d) {
          v.appendChild(h('button', { class: 'dc-subdoc', type: 'button', onclick: function () { openDoc(d.id); } }, [
            icon(subjectGlyph(d.subject)),
            h('span', { text: d.title }),
          ]));
        });
      }, addDoc));
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
      doc.savedCover = doc.cover || null;
      paintCover();
      attachEditor(ed);
      lastRange = null;
      ensureTail();
      fixImages();
      fixTables();
      hydrateImages();
      hideBlockUi();
      lastMd = DM().domToMd(ed); // baseline = the normalized form, so opening never rewrites a document
      paintEmptyClass();
      refreshChips();
      watchEntities(ed);
      paintOutline();
      paintMeta();
      paintToolbarState();
      loadFace();
    }

    function attachEditor(ed) {
      ed.addEventListener('input', onInput);
      ed.addEventListener('keydown', onKeydown);
      ed.addEventListener('paste', onPaste);
      ed.addEventListener('dragover', onEditorDragOver);
      ed.addEventListener('drop', onEditorDrop);
      ed.addEventListener('blur', function () {
        saveSel();
        if (state.saveState === 'dirty') saveNow();
      });
      ed.addEventListener('mousedown', function (e) {
        if (e.target === ed && e.button === 0) {
          var under = preBelowClick(e.clientY);
          if (under) {
            e.preventDefault();
            focusEdge(placeAfter(under), false);
            return;
          }
          ensureTail();
          var tail = ed.lastElementChild;
          if (tail && tail.tagName === 'P') focusInside(tail);
        }
        var li = e.target && e.target.closest && e.target.closest('.dc-todo > li');
        if (li && ed.contains(li) && e.offsetX >= 0 && e.clientX - li.getBoundingClientRect().left < 24 && e.target === li) {
          e.preventDefault();
          li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true');
          onEdit();
        }
      });
      ed.addEventListener('click', onEditorClick);
      ed.addEventListener('contextmenu', onEditorContextMenu, true);
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
      if (!attachEditor.hot) {
        attachEditor.hot = true;
        document.addEventListener('selectionchange', function () {
          if (editor) paintLiveHot();
        });
      }
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
        var docId = anchorDocId(a);
        if (docId) {
          if (state.docs.some(function (d) { return d.id === docId; }) || (state.current && state.current.id === docId)) openDoc(docId);
          else toast('Ce document est introuvable.', 'error');
          return;
        }
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
      if (!e.isComposing && type === 'insertText' && e.data && /[*~=`+\]]/.test(e.data)) {
        Promise.resolve().then(function () {
          if (!editor) return;
          if (applyWikiClose() || applyInlineLive()) onEdit('text');
          paintLiveHot();
        });
      }
      onEdit(type === 'insertText' || type === 'insertCompositionText' || type.indexOf('delete') === 0 ? 'text' : '');
      updateSuggest();
    }

    function applyMarkdownShortcut() {
      var n = selNode();
      if (!n) return;
      var block = closestIn(n, 'P,DIV');
      if (!block || closestIn(block, 'PRE') || closestIn(block, 'TD,TH')) return;
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

    /* Live Preview: a closing pair becomes the mark. Signs come back only inside the word. */

    function liveTextNode() {
      var sel = global.getSelection();
      if (!sel || !sel.isCollapsed || !sel.rangeCount || !editor || !editor.contains(sel.anchorNode)) return null;
      var node = sel.anchorNode;
      if (!node || node.nodeType !== 3) return null;
      if (closestIn(node, 'PRE,CODE')) return null;
      return node;
    }

    function placeCaretAfter(mark) {
      var sel = global.getSelection();
      if (!sel || !mark || !mark.parentNode) return;
      var after = mark.nextSibling;
      if (!after || after.nodeType !== 3) {
        after = document.createTextNode('\u200b');
        mark.parentNode.insertBefore(after, mark.nextSibling);
      }
      var r = document.createRange();
      r.setStart(after, after.nodeValue.length);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }

    function applyInlineLive() {
      var live = DL();
      if (!live) return false;
      var node = liveTextNode();
      if (!node || closestIn(node, 'A,.dc-mention,STRONG,B,EM,I,S,STRIKE,DEL,U,MARK')) return false;
      var hit = live.closingMark(node.nodeValue, global.getSelection().anchorOffset);
      if (!hit) return false;
      var sel = global.getSelection();
      var range = document.createRange();
      range.setStart(node, hit.start);
      range.setEnd(node, hit.end);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertHTML', false, '<' + hit.tag + '>' + escHtml(hit.text) + '</' + hit.tag + '>\u200b');
      var cur = global.getSelection();
      var inside = cur && cur.anchorNode && closestIn(cur.anchorNode, hit.tag);
      if (inside && editor.contains(inside)) placeCaretAfter(inside);
      return true;
    }

    function applyWikiClose() {
      var live = DL();
      if (!live || !state.index) return false;
      var node = liveTextNode();
      if (!node) return false;
      var hit = live.wikiClose(node.nodeValue, global.getSelection().anchorOffset);
      if (!hit) return false;
      var want = DM().fold(hit.title);
      var docs = state.index.doc || [];
      var found = null;
      var i;
      for (i = 0; i < docs.length; i++) {
        if (DM().fold(docs[i].label) !== want) continue;
        if (found) return false;
        found = docs[i];
      }
      if (!found) return false;
      var sel = global.getSelection();
      var range = document.createRange();
      range.setStart(node, hit.start);
      range.setEnd(node, hit.end);
      sel.removeAllRanges();
      sel.addRange(range);
      insertMention({ type: 'doc', id: found.id, label: found.label });
      return true;
    }

    function liveHotEl() {
      var live = DL();
      if (!live || !editor) return null;
      var sel = global.getSelection();
      if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return null;
      var el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode;
      while (el && el !== editor) {
        if (el.nodeType === 1 && live.syntaxOf(el.tagName) && !closestIn(el, 'PRE')) {
          if (el.tagName === 'MARK' && el.hasAttribute('data-c')) {
            el = el.parentNode;
            continue;
          }
          return el;
        }
        el = el.parentNode;
      }
      return null;
    }

    function paintLiveHot() {
      if (!editor) return;
      var next = liveHotEl();
      var prev = editor.querySelectorAll('.dc-hot');
      var i;
      for (i = 0; i < prev.length; i++) {
        if (prev[i] === next) continue;
        prev[i].classList.remove('dc-hot');
        prev[i].removeAttribute('data-syn');
      }
      if (!next) return;
      var syn = DL().syntaxOf(next.tagName);
      if (!syn) return;
      next.setAttribute('data-syn', syn);
      next.classList.add('dc-hot');
    }

    function atLiveEdge(mark, which) {
      var sel = global.getSelection();
      if (!sel || !sel.isCollapsed || !sel.rangeCount) return false;
      if (sel.anchorNode !== mark && !mark.contains(sel.anchorNode)) return false;
      var r = document.createRange();
      try {
        r.selectNodeContents(mark);
        if (which === 'back') r.setEnd(sel.anchorNode, sel.anchorOffset);
        else r.setStart(sel.anchorNode, sel.anchorOffset);
      } catch (err) {
        return false;
      }
      return !r.toString().replace(/[\u200b\ufeff]/g, '');
    }

    /** Backspace or Delete on a visible sign removes the mark and leaves the word. */
    function unwrapLiveEdge(which) {
      var el = liveHotEl();
      if (!el || !el.classList.contains('dc-hot') || el.children.length) return false;
      if (!atLiveEdge(el, which)) return false;
      var text = el.textContent.replace(/[\u200b\ufeff]/g, '');
      var sel = global.getSelection();
      var range = document.createRange();
      range.selectNode(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, text);
      if (el.isConnected && el.parentNode) {
        var tn = document.createTextNode(text);
        el.parentNode.replaceChild(tn, el);
        var r3 = document.createRange();
        r3.setStart(tn, which === 'back' ? 0 : tn.nodeValue.length);
        r3.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r3);
        return true;
      }
      if (which === 'back' && text) {
        var s2 = global.getSelection();
        var n = s2 && s2.anchorNode;
        var off = s2 ? s2.anchorOffset : 0;
        if (n && n.nodeType === 3 && off >= text.length) {
          var r2 = document.createRange();
          r2.setStart(n, off - text.length);
          r2.collapse(true);
          s2.removeAllRanges();
          s2.addRange(r2);
        }
      }
      return true;
    }

    /** Skips empty and zero-width text nodes sitting between the caret and a chip. */
    function skipBlankText(node) {
      var prev = node;
      while (prev && prev.nodeType === 3 && !String(prev.nodeValue || '').replace(/[\u200b\ufeff]/g, '')) prev = prev.previousSibling;
      return prev;
    }

    /**
     * Person chip a plain Backspace should shorten to its first name.
     * The caret is either flush against the chip, or just after the single space that follows it
     * (the space inserted with the mention). A second Backspace, once the name is already short, deletes it.
     */
    function personMentionToShorten() {
      var sel = global.getSelection();
      if (!sel || !sel.isCollapsed || !sel.rangeCount || !editor || !editor.contains(sel.anchorNode)) return null;
      var node = sel.anchorNode;
      var offset = sel.anchorOffset;
      var chip = null;
      if (node.nodeType === 3) {
        var head = String(node.nodeValue || '').slice(0, offset).replace(/[\u200b\ufeff]/g, '');
        if (head === '' || (head.length === 1 && /^[\u00a0 ]$/.test(head))) chip = skipBlankText(node.previousSibling);
      } else if (node.nodeType === 1 && offset > 0) {
        var prev = skipBlankText(node.childNodes[offset - 1]);
        if (prev && prev.nodeType === 3) {
          var gap = String(prev.nodeValue || '').replace(/[\u200b\ufeff]/g, '');
          if (gap.length === 1 && /^[\u00a0 ]$/.test(gap)) chip = skipBlankText(prev.previousSibling);
        } else chip = prev;
      }
      if (!chip || chip.nodeType !== 1 || !chip.classList || !chip.classList.contains('dc-mention')) return null;
      if (chip.getAttribute('data-m') !== 'person' || chip.getAttribute('data-short') === '1') return null;
      var full = String(chip.getAttribute('data-label') || '').replace(/\s+/g, ' ').trim();
      var first = DM().firstName(full);
      if (!first || first === full) return null;
      return chip;
    }

    function shortenPersonChip(chip) {
      var first = DM().firstName(chip.getAttribute('data-label') || '');
      chip.setAttribute('data-short', '1');
      var last = chip.lastChild;
      if (last && last.nodeType === 3) last.nodeValue = first;
      else chip.appendChild(document.createTextNode(first));
    }

    /** Same list kind, so a checklist stays checkboxes and a disc stays a disc. */
    function listKindOf(list) {
      if (!list) return '';
      if (list.classList && list.classList.contains('dc-todo')) return 'todo';
      return list.tagName === 'OL' ? 'ol' : 'ul';
    }

    function createList(kind) {
      var el = document.createElement(kind === 'ol' ? 'ol' : 'ul');
      if (kind === 'todo') el.classList.add('dc-todo');
      return el;
    }

    function listOfItem(li) {
      var parent = li && li.parentNode;
      if (!parent || (parent.tagName !== 'UL' && parent.tagName !== 'OL')) return null;
      return parent;
    }

    function prevListItem(li) {
      var n = li.previousElementSibling;
      while (n && n.tagName !== 'LI') n = n.previousElementSibling;
      return n && n.tagName === 'LI' ? n : null;
    }

    /** Nested list of the same kind at the end of an item, created when missing. */
    function ensureNested(li, kind) {
      var last = li.lastElementChild;
      if (last && (last.tagName === 'UL' || last.tagName === 'OL') && listKindOf(last) === kind) return last;
      var nest = createList(kind);
      li.appendChild(nest);
      return nest;
    }

    function keepCaret(li, move) {
      var sel = global.getSelection();
      var mark = null;
      if (sel && sel.rangeCount && li.contains(sel.anchorNode)) {
        mark = { node: sel.anchorNode, offset: sel.anchorOffset };
      }
      var ok = move();
      if (ok && mark && mark.node && editor.contains(mark.node)) {
        try {
          var max = mark.node.nodeType === 3 ? mark.node.length : mark.node.childNodes.length;
          var range = document.createRange();
          range.setStart(mark.node, Math.min(mark.offset, max));
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (err) { /* caret stays where the move left it */ }
      }
      return ok;
    }

    /**
     * Tab nests the item under the previous one (a subtask). Shift+Tab lifts it back.
     * execCommand('indent') is not used: Chrome turns the marker into another bullet.
     */
    function indentListItem(li) {
      var parent = listOfItem(li);
      var prev = parent && prevListItem(li);
      if (!prev || prev === li) return false;
      return keepCaret(li, function () {
        ensureNested(prev, listKindOf(parent)).appendChild(li);
        return true;
      });
    }

    function outdentListItem(li) {
      var parent = listOfItem(li);
      var owner = parent && parent.parentNode;
      if (!owner || owner.tagName !== 'LI') return false;
      var grand = listOfItem(owner);
      if (!grand) return false;
      return keepCaret(li, function () {
        var follow = [];
        var n = li.nextElementSibling;
        while (n) {
          var next = n.nextElementSibling;
          if (n.tagName === 'LI') follow.push(n);
          n = next;
        }
        grand.insertBefore(li, owner.nextSibling);
        if (follow.length) {
          var nest = ensureNested(li, listKindOf(parent));
          follow.forEach(function (item) { nest.appendChild(item); });
        }
        pruneEmpty(parent);
        return true;
      });
    }

    function itemPlain(li) {
      var text = '';
      var i;
      for (i = 0; i < li.childNodes.length; i++) {
        var k = li.childNodes[i];
        if (k.nodeType === 1 && (k.tagName === 'UL' || k.tagName === 'OL')) continue;
        text += k.textContent || '';
      }
      return text.replace(/[\u00a0\u200b\ufeff]/g, '').replace(/\s+/g, '');
    }

    function itemHasNested(li) {
      var i;
      for (i = 0; i < li.children.length; i++) {
        var tag = li.children[i].tagName;
        if (tag === 'UL' || tag === 'OL') return true;
      }
      return false;
    }

    function padItem(li) {
      if (itemPlain(li)) return;
      var i;
      for (i = 0; i < li.childNodes.length; i++) {
        if (li.childNodes[i].nodeType === 1 && li.childNodes[i].tagName === 'BR') return;
      }
      li.insertBefore(document.createElement('br'), li.firstChild);
    }

    /** Enter on an empty nested item lifts only that item. Siblings stay put. */
    function exitEmptyItem(li) {
      var parent = listOfItem(li);
      if (!parent) return false;
      var owner = parent.parentNode;
      if (owner && owner.tagName === 'LI' && listOfItem(owner)) {
        var grand = listOfItem(owner);
        grand.insertBefore(li, owner.nextSibling);
        if (listKindOf(grand) === 'todo') {
          if (!li.hasAttribute('data-checked')) li.setAttribute('data-checked', 'false');
        } else li.removeAttribute('data-checked');
        pruneEmpty(parent);
        focusInside(li);
        return true;
      }
      var p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      var next = li.nextSibling;
      parent.removeChild(li);
      var rest = null;
      if (next) {
        rest = createList(listKindOf(parent));
        while (next) {
          var n2 = next.nextSibling;
          rest.appendChild(next);
          next = n2;
        }
      }
      var host = parent.parentNode;
      if (!parent.querySelector('li')) {
        host.insertBefore(p, parent);
        host.removeChild(parent);
      } else host.insertBefore(p, parent.nextSibling);
      if (rest && rest.childNodes.length) host.insertBefore(rest, p.nextSibling);
      focusInside(p);
      return true;
    }

    /**
     * A new item stays in the same list. Nested items are not pulled up to the root,
     * which is what the browser does when it splits a parent item.
     */
    function splitListItem(li, range) {
      var parent = listOfItem(li);
      if (!parent) return false;
      var tail = document.createRange();
      try {
        tail.setStart(range.startContainer, range.startOffset);
        tail.setEnd(li, li.childNodes.length);
      } catch (err) {
        return false;
      }
      var frag = tail.extractContents();
      var fresh = document.createElement('li');
      if (listKindOf(parent) === 'todo') fresh.setAttribute('data-checked', 'false');
      var lists = [];
      var seenText = false;
      while (frag.firstChild) {
        var node = frag.firstChild;
        frag.removeChild(node);
        if (node.nodeType === 1 && (node.tagName === 'UL' || node.tagName === 'OL')) {
          lists.push(node);
          continue;
        }
        var blank = node.nodeType === 3
          ? !/\S/.test((node.nodeValue || '').replace(/[\u00a0\u200b\ufeff]/g, ''))
          : node.nodeType === 1 && node.tagName === 'BR';
        if (!seenText && blank) continue;
        fresh.appendChild(node);
        if (!blank) seenText = true;
      }
      if (!seenText) lists.forEach(function (list) { li.appendChild(list); });
      else lists.forEach(function (list) { fresh.appendChild(list); });
      if (!fresh.firstChild) fresh.appendChild(document.createElement('br'));
      padItem(li);
      parent.insertBefore(fresh, li.nextSibling);
      focusInside(fresh);
      return true;
    }

    function enterListItem(li) {
      var parent = listOfItem(li);
      if (!parent) return false;
      var sel = global.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
      if (sel.anchorNode !== li && !li.contains(sel.anchorNode)) return false;
      if (!itemPlain(li) && !itemHasNested(li)) return exitEmptyItem(li);
      return splitListItem(li, sel.getRangeAt(0));
    }

    function onKeydown(e) {
      var mod = e.ctrlKey || e.metaKey;
      if (sugg && handleSuggestKey(e)) return;
      if (e.key === 'Backspace' && !mod && !e.shiftKey && !e.altKey) {
        var person = personMentionToShorten();
        if (person) {
          e.preventDefault();
          shortenPersonChip(person);
          onEdit();
          return;
        }
        if (unwrapLiveEdge('back')) {
          e.preventDefault();
          onEdit('text');
          paintLiveHot();
          return;
        }
        if (docsRich() && docsRich().exitQuote()) {
          e.preventDefault();
          onEdit();
          paintToolbarState();
          return;
        }
      }
      if (e.key === 'Delete' && !mod && !e.shiftKey && !e.altKey && unwrapLiveEdge('del')) {
        e.preventDefault();
        onEdit('text');
        paintLiveHot();
        return;
      }
      if (mod && !e.shiftKey && !e.altKey) {
        var k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); saveNow({ retry: true }); return; }
        if (k === 'k') { e.preventDefault(); openLinkPopover(); return; }
        if (k === 'e') { e.preventDefault(); runCommand('code'); return; }
      }
      if (mod && e.shiftKey && !e.altKey) {
        if (e.key === 'X' || e.key === 'x') { e.preventDefault(); runCommand('strike'); return; }
        if (e.key === 'H' || e.key === 'h') { e.preventDefault(); runCommand('highlight'); return; }
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
        var tabCell = n && closestIn(n, 'TD,TH');
        if (tabCell) {
          e.preventDefault();
          moveTableCell(tabCell, e.shiftKey ? -1 : 1);
          onEdit();
          return;
        }
        var li = n && closestIn(n, 'LI');
        if (li) {
          e.preventDefault();
          if (e.shiftKey ? outdentListItem(li) : indentListItem(li)) onEdit();
        } else if (n && closestIn(n, 'PRE')) {
          e.preventDefault();
          document.execCommand('insertText', false, '  ');
        }
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !e.altKey && !mod) {
        var preEdge = closestIn(selNode(), 'PRE');
        if (preEdge && onCodeEdge(preEdge, e.key === 'ArrowDown' ? 'end' : 'start')) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusEdge(placeAfter(preEdge), false);
          } else {
            var above = blockBefore(preEdge);
            if (above) {
              e.preventDefault();
              focusEdge(above, true);
            }
          }
          return;
        }
      }
      if (e.key === 'Enter' && !mod) {
        var enterCell = closestIn(selNode(), 'TD,TH');
        if (enterCell) {
          e.preventDefault();
          if (e.shiftKey) document.execCommand('insertHTML', false, '<br>');
          else focusCell(cellBelow(enterCell));
          onEdit();
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey && !mod) {
        if (docsRich() && docsRich().leaveEmptyQuote()) {
          e.preventDefault();
          onEdit();
          paintToolbarState();
          return;
        }
        var liEnter = closestIn(selNode(), 'LI');
        if (liEnter && !closestIn(selNode(), 'PRE')) {
          e.preventDefault();
          if (enterListItem(liEnter)) onEdit();
          return;
        }
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
      var pasted = imageFilesFrom(cd);
      if (pasted.length) {
        e.preventDefault();
        var at = selNode();
        insertImageFiles(pasted, at && rowOf(at), false);
        return;
      }
      var html = cd.getData('text/html');
      var text = cd.getData('text/plain');
      if (!html && !text) return;
      e.preventDefault();
      var out;
      if (html) {
        var parsed = new DOMParser().parseFromString(html, 'text/html');
        out = DM().mdToHtml(DM().domToMd(parsed.body));
      } else if (DL() && DL().looksLikeMarkdown(text)) {
        out = DM().mdToHtml(text);
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
      if (!html) applyWikiClose();
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
          var short = type === 'person' && chip.getAttribute('data-short') === '1';
          var shown = short ? (DM().firstName(item.label) || item.label) : item.label;
          if (chip.getAttribute('data-label') !== item.label) chip.setAttribute('data-label', item.label);
          var last = chip.lastChild;
          if (last && last.nodeType === 3 && last.nodeValue !== shown) last.nodeValue = shown;
          chip.title = item.sub ? item.sub : '';
        } else if (type === 'task') missing = !!state.sources && failed.indexOf('cards') < 0;
        else if (type === 'doc') missing = state.docsLoaded;
        chip.classList.toggle('is-missing', !!missing);
        if (missing) chip.title = type === 'task' ? 'Tâche introuvable (archivée ou supprimée)' : 'Document introuvable';
        chip.classList.toggle('is-done', !!(item && item.done));
      });
    }

    function watchEntities(ed) {
      if (!global.DocsEntities || typeof global.DocsEntities.watch !== 'function') return;
      global.DocsEntities.watch(ed, {
        t: t,
        paused: function () { return !!sugg; },
        onChange: function () { onEdit('text'); },
        onCatalog: function (pack) {
          state.entityPack = pack;
          rebuildIndex();
        },
      });
    }

    function rebuildIndex() {
      var src = state.sources || { members: [], contacts: [], cards: [], lists: [], failed: [] };
      var pack = state.entityPack;
      state.index = DM().buildMentionIndex({
        members: src.members,
        contacts: src.contacts,
        cards: src.cards,
        lists: src.lists,
        docs: state.docs.map(function (d) {
          return { id: d.id, title: d.title, sub: DM().relativeTime(d.updatedAt) };
        }),
        excludeDocId: state.current ? state.current.id : '',
        entities: pack && pack.entities ? pack.entities : [],
      });
      refreshChips();
    }

    function loadSources() {
      return DT()
        .loadMentionSources(t)
        .then(function (src) {
          state.sources = src;
          rebuildIndex();
          var STT = global.StatutTrello;
          var TM = global.TableModel;
          if (!STT || typeof STT.readStatutSettings !== 'function' || !TM || typeof TM.enrichLists !== 'function') {
            state.taskLists = src.lists || [];
            return;
          }
          return STT.readStatutSettings(t).then(function (settings) {
            state.taskLists = TM.enrichLists(src.lists || [], settings, global.StatutMatch);
          }, function () {
            state.taskLists = src.lists || [];
          });
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

    /**
     * Quick card panel for a linked task (hover or click): the shared CardQuick, so the quick actions
     * (status, progress, blocked, priority, due date, estimate, description, rename, archive) are the
     * Kanban's. Using it (or opening one of its editors or menus) pins it until a click elsewhere.
     */
    var previewTimer = null;
    var previewChip = null;
    var previewPinned = false;
    var quick = null;
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
      var el = h('div', { class: 'dc-pop dc-pop--task' });
      pop = el;
      el.addEventListener('mouseenter', function () { clearTimeout(previewTimer); });
      el.addEventListener('mouseleave', function () { if (!previewPinned) scheduleClosePreview(); });
      // Using the panel pins it: several quick actions in a row, until a click elsewhere.
      el.addEventListener('mousedown', function () { previewPinned = true; });
      var rect = chip.getBoundingClientRect();
      if (!global.CardQuick) {
        el.appendChild(h('div', { class: 'dc-pop-name', text: name }));
        el.appendChild(h('div', { class: 'dc-pop-row' }, [h('button', { class: 'dc-btn dc-btn--primary', type: 'button', onclick: function () { closePop(); openTask(id, name); } }, [icon('external-link'), 'Ouvrir'])]));
        placePop(el, rect);
        return;
      }
      placePop(el, rect);
      quick = global.CardQuick.mount(el, {
        t: t,
        cardId: id,
        name: name,
        mentions: global.WorkOS && typeof global.WorkOS.backlinks === 'function'
          ? global.WorkOS.backlinks(docsForLinks(), 'task', id).map(function (d) {
              return { title: d.title, open: function () { closePop(); openDoc(d.id); } };
            })
          : [],
        onOpen: function () { closePop(); openTask(id, name); },
        onChange: function () { loadSources(); },
        onHold: function (on) { if (on) previewPinned = true; },
        onToast: function (m, kind, action) { toast(m, kind === 'error' ? 'error' : '', action); },
        onGone: function () { if (pop === el) closePop(); },
      });
      // The panel grows once the card is loaded: keep it on screen until the user resizes or zooms it.
      if (global.ResizeObserver) {
        var ro = new global.ResizeObserver(function () {
          if (pop !== el) { ro.disconnect(); return; }
          if (el._userSized) return;
          placePop(el, rect);
        });
        ro.observe(el);
        el._ro = ro;
      }
      wireTaskPopSize(el);
    }

    /** Drag any corner to grow the task preview; the wheel zooms it around the cursor. */
    function wireTaskPopSize(el) {
      var CQ = global.CardQuick;
      if (!CQ || typeof CQ.resizeRect !== 'function' || typeof CQ.zoomAt !== 'function') return;
      var minW = 260;
      var minH = 160;
      ['nw', 'ne', 'sw', 'se'].forEach(function (corner) {
        var handle = h('div', { class: 'dc-pop-corner dc-pop-corner--' + corner });
        handle.addEventListener('pointerdown', function (e) {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          previewPinned = true;
          el._userSized = true;
          var scale = el._scale || 1;
          var startX = e.clientX;
          var startY = e.clientY;
          var start = el.getBoundingClientRect();
          try { handle.setPointerCapture(e.pointerId); } catch (err) { /* listeners still follow */ }
          function move(ev) {
            var box = CQ.resizeRect(start, corner, ev.clientX - startX, ev.clientY - startY, minW * scale, minH * scale);
            el.classList.add('is-sized');
            el.style.maxWidth = 'none';
            el.style.width = (box.width / scale) + 'px';
            el.style.height = (box.height / scale) + 'px';
            el.style.left = box.left + 'px';
            el.style.top = box.top + 'px';
          }
          function up() {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', up);
            handle.removeEventListener('pointercancel', up);
          }
          handle.addEventListener('pointermove', move);
          handle.addEventListener('pointerup', up);
          handle.addEventListener('pointercancel', up);
        });
        el.appendChild(handle);
      });
      el.addEventListener('wheel', function (e) {
        e.preventDefault();
        var prev = el._scale || 1;
        var dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;
        else if (e.deltaMode === 2) dy *= 400;
        var next = Math.max(0.7, Math.min(2.5, prev * Math.exp(-dy * 0.0015)));
        if (Math.abs(next - prev) < 0.001) return;
        var vis = el.getBoundingClientRect();
        var at = CQ.zoomAt(vis, e.clientX, e.clientY, prev, next);
        el._scale = at.scale;
        el._userSized = true;
        el.style.transformOrigin = '0 0';
        el.style.transform = at.scale === 1 ? '' : 'scale(' + at.scale + ')';
        el.style.left = at.left + 'px';
        el.style.top = at.top + 'px';
      }, { passive: false });
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
      if (docsRich() && docsRich().run(cmd)) {
        if (cmd !== 'highlight' && !opts.silent) {
          onEdit();
          paintToolbarState();
        }
        return;
      }
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
          var quoted = selNode();
          var host = quoted && closestIn(quoted, 'BLOCKQUOTE');
          if (host && docsRich()) {
            var turned = docsRich().unwrapQuote(host);
            if (turned) focusInside(turned);
          } else if (host) document.execCommand('formatBlock', false, '<p>');
          else document.execCommand('formatBlock', false, '<blockquote>');
          break;
        }
        case 'codeblock': {
          if (blockType() === 'codeblock') setBlock('p');
          else setBlock('pre');
          break;
        }
        case 'hr': insertRule(); break;
        case 'image': {
          var imgNode = selNode();
          var imgRow = imgNode && rowOf(imgNode);
          if (!imgRow) return;
          openImagePopover(imgRow, isEmptyBlock(imgRow) || isImageBlock(imgRow));
          return;
        }
        case 'indent': document.execCommand('indent'); break;
        case 'outdent': document.execCommand('outdent'); break;
        case 'link': openLinkPopover(); return;
        case 'table': insertTable(); break;
        case 'callout-note': setCallout('note'); break;
        case 'callout-tip': setCallout('tip'); break;
        case 'callout-warning': setCallout('warning'); break;
        case 'align-left': setAlign('left'); break;
        case 'align-center': setAlign('center'); break;
        case 'align-right': setAlign('right'); break;
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

    /* ── 5b. Block handles: drag, transform, add (including a picture) ─ */

    function isImageBlock(el) {
      return !!(el && el.classList && el.classList.contains('dc-image'));
    }

    function isEmptyBlock(el) {
      if (!el || isImageBlock(el) || el.tagName === 'HR' || el.tagName === 'PRE' || el.tagName === 'TABLE') return false;
      return !/\S/.test(el.textContent || '');
    }

    function rowOf(node) {
      if (!node || !editor || !editor.contains(node) || node === editor) return null;
      var el = node.nodeType === 1 ? node : node.parentNode;
      var li = null;
      while (el && el !== editor) {
        if (el.tagName === 'LI' && !li) li = el;
        el = el.parentNode;
      }
      if (li && editor.contains(li)) return li;
      el = node.nodeType === 1 ? node : node.parentNode;
      while (el && el.parentNode !== editor) el = el.parentNode;
      if (!el || el === editor) return null;
      if (el.tagName === 'UL' || el.tagName === 'OL') return el.querySelector('li');
      return el;
    }

    function currentRow() {
      var n = selNode();
      return n ? rowOf(n) : null;
    }

    /* Vertical center of the block's first line, so a heading, a padded code block and a quote all match. */
    function firstLineCenter(block) {
      if (block.tagName === 'HR') {
        var hr = block.getBoundingClientRect();
        return hr.top + hr.height / 2;
      }
      if (isImageBlock(block)) {
        var img = block.querySelector('img') || block;
        var ir = img.getBoundingClientRect();
        if (ir.height) return ir.top + Math.min(ir.height, 24) / 2;
      }
      var range = document.createRange();
      var text = null;
      var blank = null;
      var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = walker.nextNode())) {
        if (/\S/.test(n.data)) { text = n; break; }
        if (!blank && n.data) blank = n;
      }
      try {
        if (text) {
          range.setStart(text, 0);
          range.setEnd(text, 1);
        } else if (blank) {
          range.setStart(blank, 0);
          range.setEnd(blank, Math.min(1, blank.data.length));
        } else {
          var br = block.querySelector('br');
          if (br) {
            range.setStartBefore(br);
            range.setEndAfter(br);
          } else {
            range.selectNodeContents(block);
          }
        }
        var rects = range.getClientRects();
        var i;
        for (i = 0; i < rects.length; i++) {
          if (rects[i].height >= 1) return rects[i].top + rects[i].height / 2;
        }
      } catch (err) { /* empty or detached: use the line box */ }
      var box = block.getBoundingClientRect();
      var cs = global.getComputedStyle(block);
      var lead = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0);
      var lh = parseFloat(cs.lineHeight);
      if (!(lh > 0)) lh = (parseFloat(cs.fontSize) || 15) * 1.7;
      return box.top + lead + Math.min(box.height - lead, lh) / 2;
    }

    function showBlockUi(block) {
      if (!block || !editor || !editor.contains(block) || !els.blockUi) return;
      blockHover = block;
      var pageRect = els.page.getBoundingClientRect();
      var center = firstLineCenter(block);
      var uiH = els.blockUi.offsetHeight || 22;
      els.blockUi.style.top = (center - pageRect.top - els.page.clientTop - uiH / 2) + 'px';
      els.blockUi.hidden = false;
    }

    function hideBlockUi() {
      blockHover = null;
      if (els.blockUi) els.blockUi.hidden = true;
    }

    function scheduleHideBlock() {
      clearTimeout(blockHideTimer);
      blockHideTimer = setTimeout(function () {
        if (dragBlock) return;
        if (pop && (pop.classList.contains('dc-block-menu') || pop.querySelector('input[type="file"]'))) return;
        hideBlockUi();
      }, 200);
    }

    function placeDropLine(row, before) {
      var y = (before ? row.getBoundingClientRect().top : row.getBoundingClientRect().bottom) - els.page.getBoundingClientRect().top - els.page.clientTop;
      els.dropLine.style.top = Math.max(0, y) + 'px';
      els.dropLine.hidden = false;
    }

    function focusInside(el) {
      if (!el || !editor) return;
      editor.focus();
      var sel = global.getSelection();
      var r = document.createRange();
      if (!el.firstChild || el.tagName === 'HR' || isImageBlock(el)) {
        r.setStartBefore(el);
        r.collapse(true);
      } else {
        r.selectNodeContents(el);
        r.collapse(true);
      }
      sel.removeAllRanges();
      sel.addRange(r);
      saveSel();
    }

    function ensureTail() {
      if (!editor) return;
      var last = editor.lastElementChild;
      if (last && (last.tagName === 'HR' || last.tagName === 'PRE' || isImageBlock(last))) {
        var p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        editor.appendChild(p);
      }
    }

    /** Text on one side of a collapsed caret inside a code block. */
    function preSideText(pre, edge) {
      var sel = global.getSelection();
      if (!sel || !sel.isCollapsed || !sel.rangeCount || !pre.contains(sel.anchorNode)) return null;
      var range = sel.getRangeAt(0);
      var slice = document.createRange();
      try {
        slice.selectNodeContents(pre);
        if (edge === 'end') slice.setStart(range.endContainer, range.endOffset);
        else slice.setEnd(range.startContainer, range.startOffset);
      } catch (err) {
        return null;
      }
      return slice.toString().replace(/[\u200b\ufeff]/g, '');
    }

    /** True on the first or last line. A trailing break from <br> still counts as the last line. */
    function onCodeEdge(pre, edge) {
      var text = preSideText(pre, edge);
      if (text === null) return false;
      if (edge === 'end') return text.replace(/\n$/, '').indexOf('\n') < 0;
      return text.replace(/^\n/, '').indexOf('\n') < 0;
    }

    function nextEditable(el) {
      while (el && (el.tagName === 'HR' || isImageBlock(el))) el = el.nextElementSibling;
      return el || null;
    }

    function prevEditable(el) {
      while (el && (el.tagName === 'HR' || isImageBlock(el))) el = el.previousElementSibling;
      return el || null;
    }

    function insertParagraphAfter(el) {
      var p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      el.parentNode.insertBefore(p, el.nextSibling);
      return p;
    }

    /** The block a Down arrow from a code block should land in. Creates a paragraph when nothing follows. */
    function placeAfter(pre) {
      var next = nextEditable(pre.nextElementSibling);
      if (next) return next;
      var li = pre.parentNode && pre.parentNode.tagName === 'LI' ? pre.parentNode : null;
      if (li) {
        var more = nextEditable(li.nextElementSibling);
        if (more) return more;
        var list = li.parentNode;
        if (list && (list.tagName === 'UL' || list.tagName === 'OL')) {
          var afterList = nextEditable(list.nextElementSibling);
          if (afterList) return afterList;
          return insertParagraphAfter(list);
        }
      }
      return insertParagraphAfter(pre);
    }

    function blockBefore(pre) {
      var prev = prevEditable(pre.previousElementSibling);
      if (prev) return prev;
      var li = pre.parentNode && pre.parentNode.tagName === 'LI' ? pre.parentNode : null;
      if (!li) return null;
      var prevLi = prevEditable(li.previousElementSibling);
      if (prevLi) return prevLi;
      var list = li.parentNode;
      return list ? prevEditable(list.previousElementSibling) : null;
    }

    function focusEdge(el, atEnd) {
      if (!el || !editor) return;
      if (el.tagName === 'UL' || el.tagName === 'OL') {
        var lis = el.querySelectorAll('li');
        var li = atEnd ? lis[lis.length - 1] : lis[0];
        if (li) el = li;
      }
      if (!atEnd) {
        focusInside(el);
        return;
      }
      editor.focus();
      var sel = global.getSelection();
      var r = document.createRange();
      if (!el.firstChild || el.tagName === 'HR' || isImageBlock(el)) {
        r.setStart(el, el.childNodes.length);
        r.collapse(true);
      } else {
        r.selectNodeContents(el);
        r.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(r);
      saveSel();
    }

    /**
     * A click in the editor padding just under a code block (or under the empty paragraph that follows it).
     * Clicks that land on a later block are left alone.
     */
    function preBelowClick(y) {
      if (!editor) return null;
      var pres = editor.querySelectorAll('pre');
      var best = null;
      var bestBottom = -1;
      for (var i = 0; i < pres.length; i++) {
        var bottom = pres[i].getBoundingClientRect().bottom;
        if (y >= bottom - 2 && bottom >= bestBottom) {
          best = pres[i];
          bestBottom = bottom;
        }
      }
      if (!best) return null;
      var next = nextEditable(best.nextElementSibling);
      if (!next && best.parentNode && best.parentNode.tagName === 'LI') {
        next = nextEditable(best.parentNode.nextElementSibling);
        if (!next && best.parentNode.parentNode) next = nextEditable(best.parentNode.parentNode.nextElementSibling);
      }
      if (!next) return best;
      if (y < next.getBoundingClientRect().top - 2) return best;
      if (next.tagName === 'P' && !/\S/.test(next.textContent || '')) return best;
      return null;
    }

    function ensureEditor() {
      if (!editor) return;
      if (!editor.firstElementChild) {
        var p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        editor.appendChild(p);
      }
      ensureTail();
    }

    function pruneEmpty(el) {
      if (!el || el === editor || !el.parentNode) return;
      if ((el.tagName === 'UL' || el.tagName === 'OL') && !el.querySelector('li')) el.parentNode.removeChild(el);
    }

    function fixImages() {
      if (!editor) return;
      Array.prototype.slice.call(editor.querySelectorAll('p > figure.dc-image, div > figure.dc-image')).forEach(function (fig) {
        var parent = fig.parentNode;
        // A picture is a direct child of the editor. Hoisting that match would
        // pull it out of the contenteditable onto the page, so it would not save.
        if (!parent || parent === editor) return;
        var host = parent.parentNode;
        if (!host || !editor.contains(parent)) return;
        host.insertBefore(fig, parent.nextSibling);
        if (parent !== editor && !/\S/.test(parent.textContent || '') && !parent.querySelector('figure, hr, img, li, pre')) host.removeChild(parent);
      });
      Array.prototype.forEach.call(editor.querySelectorAll('figure.dc-image'), function (fig) {
        fig.setAttribute('contenteditable', 'false');
        var img = fig.querySelector('img');
        if (img) img.setAttribute('draggable', 'false');
      });
    }

    function watchImage(fig, img) {
      if (!img || img._dcWatch) return;
      img._dcWatch = true;
      img.addEventListener('load', function () {
        fig.classList.remove('is-loading');
        fig.classList.remove('is-broken');
      });
      img.addEventListener('error', function () {
        fig.classList.remove('is-loading');
        fig.classList.add('is-broken');
      });
      if (!img.getAttribute('src')) return;
      if (img.complete && img.naturalWidth) {
        fig.classList.remove('is-loading');
        fig.classList.remove('is-broken');
      } else if (img.complete) {
        fig.classList.remove('is-loading');
        fig.classList.add('is-broken');
      } else fig.classList.add('is-loading');
    }

    function makeFigure(src, alt) {
      var fig = document.createElement('figure');
      fig.className = 'dc-image';
      fig.setAttribute('contenteditable', 'false');
      fig.setAttribute('data-src', src);
      fig.setAttribute('data-alt', alt || '');
      var img = document.createElement('img');
      img.alt = alt || '';
      img.setAttribute('draggable', 'false');
      if (src.indexOf('upload:') !== 0) img.src = src;
      fig.appendChild(img);
      watchImage(fig, img);
      return fig;
    }

    function replaceBlock(block, node) {
      if (block.tagName !== 'LI') {
        block.parentNode.replaceChild(node, block);
        return;
      }
      var list = block.parentNode;
      var parent = list.parentNode;
      var next = block.nextSibling;
      var ref = list.nextSibling;
      list.removeChild(block);
      var rest = null;
      if (next) {
        rest = document.createElement(list.tagName);
        if (list.className) rest.className = list.className;
        while (next) {
          var n2 = next.nextSibling;
          rest.appendChild(next);
          next = n2;
        }
      }
      if (!list.querySelector('li')) {
        parent.removeChild(list);
        parent.insertBefore(node, ref);
      } else parent.insertBefore(node, list.nextSibling);
      if (rest && rest.childNodes.length) parent.insertBefore(rest, node.nextSibling);
    }

    function insertNodeAfter(block, node) {
      if (block.tagName !== 'LI') {
        block.parentNode.insertBefore(node, block.nextSibling);
        return;
      }
      var list = block.parentNode;
      var parent = list.parentNode;
      var next = block.nextSibling;
      if (!next) {
        parent.insertBefore(node, list.nextSibling);
        return;
      }
      var rest = document.createElement(list.tagName);
      if (list.className) rest.className = list.className;
      while (next) {
        var n2 = next.nextSibling;
        rest.appendChild(next);
        next = n2;
      }
      parent.insertBefore(node, list.nextSibling);
      parent.insertBefore(rest, node.nextSibling);
    }

    function commitImage(block, src, alt, replace) {
      var fig = makeFigure(src, alt);
      if (!block || !editor.contains(block)) {
        editor.appendChild(fig);
        return fig;
      }
      if (replace || isEmptyBlock(block) || isImageBlock(block) || block.tagName === 'HR') replaceBlock(block, fig);
      else insertNodeAfter(block, fig);
      return fig;
    }

    function imageFileList(list) {
      var out = [];
      if (!list) return out;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && /^image\/(jpeg|png|webp|gif)$/.test(list[i].type)) out.push(list[i]);
      }
      return out;
    }

    function imageFilesFrom(data) {
      if (!data) return [];
      var out = imageFileList(data.files);
      if (out.length || !data.items) return out;
      for (var i = 0; i < data.items.length; i++) {
        var it = data.items[i];
        if (it.kind === 'file' && /^image\/(jpeg|png|webp|gif)$/.test(it.type)) {
          var f = it.getAsFile();
          if (f) out.push(f);
        }
      }
      return out;
    }

    function imageExt(file) {
      var t = String((file && file.type) || '').toLowerCase();
      if (t === 'image/png') return 'png';
      if (t === 'image/webp') return 'webp';
      if (t === 'image/gif') return 'gif';
      return 'jpg';
    }

    function hydrateImages() {
      if (!editor || !DT() || typeof DT().coverBlobUrl !== 'function') return;
      Array.prototype.forEach.call(editor.querySelectorAll('figure.dc-image'), function (fig) {
        var src = fig.getAttribute('data-src') || '';
        if (src.indexOf('upload:') !== 0) return;
        var img = fig.querySelector('img');
        if (!img || img.getAttribute('data-hydrated') === src) return;
        var parts = src.slice(7).split('/');
        if (parts.length !== 3) return;
        fig.classList.add('is-loading');
        DT().coverBlobUrl(t, { k: 'upload', c: parts[0], a: parts[1], n: parts[2] }).then(function (url) {
          if (!img.isConnected) return;
          if (url) {
            img.src = url;
            img.setAttribute('data-hydrated', src);
            fig.classList.remove('is-loading');
            fig.classList.remove('is-broken');
          } else {
            fig.classList.remove('is-loading');
            fig.classList.add('is-broken');
          }
        }, function () {
          if (!fig.isConnected) return;
          fig.classList.remove('is-loading');
          fig.classList.add('is-broken');
        });
      });
    }

    function insertImageFiles(files, block, replace) {
      if (!state.current || !files.length) return;
      var anchor = block && editor.contains(block) ? block : editor.lastElementChild;
      var first = true;
      var chain = Promise.resolve();
      files.forEach(function (file) {
        chain = chain.then(function () {
          var rep = first && !!replace;
          first = false;
          return DT().uploadCover(t, state.current.id, file, imageExt(file)).then(function (cover) {
            if (!cover || !cover.a) throw new Error('upload-failed');
            var src = 'upload:' + cover.c + '/' + cover.a + '/' + cover.n;
            var alt = String(file.name || '').replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 200);
            anchor = commitImage(anchor, src, alt, rep);
          });
        });
      });
      chain.then(function () {
        ensureEditor();
        hydrateImages();
        onEdit();
        if (anchor && editor.contains(anchor)) showBlockUi(anchor);
      }, function (err) {
        toast(reasonText(err), 'error');
      });
    }

    function openImagePopover(block, replace) {
      if (!block) return;
      closePop();
      var input = h('input', { class: 'dc-input', type: 'text', placeholder: 'https://…', 'aria-label': 'Adresse de l’image', spellcheck: 'false' });
      var file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true });
      var err = h('div', { class: 'dc-pop-err', hidden: true });
      function applyUrl() {
        var src = DM().imageSrc(input.value);
        if (!src || src.indexOf('upload:') === 0) {
          err.hidden = false;
          err.textContent = 'Adresse non valide.';
          return;
        }
        closePop();
        var fig = commitImage(block, src, '', replace);
        ensureEditor();
        onEdit();
        if (fig) showBlockUi(fig);
      }
      file.addEventListener('change', function () {
        var picked = imageFileList(file.files);
        closePop();
        if (picked.length) insertImageFiles(picked, block, replace);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); applyUrl(); }
        else if (e.key === 'Escape') { e.preventDefault(); closePop(); }
      });
      pop = h('div', { class: 'dc-pop' }, [
        h('div', { class: 'dc-pop-row' }, [
          input,
          h('button', { class: 'dc-btn', type: 'button', title: 'Fichier', 'aria-label': 'Choisir un fichier', onclick: function () { file.click(); } }, [icon('upload')]),
        ]),
        err,
        file,
      ]);
      var anchor = els.blockUi && !els.blockUi.hidden ? els.blockUi : block;
      placePop(pop, anchor.getBoundingClientRect());
      input.focus();
    }

    function plainFrom(el) {
      var p = document.createElement('p');
      if (isImageBlock(el)) {
        var alt = el.getAttribute('data-alt') || '';
        if (alt) p.textContent = alt;
        else p.appendChild(document.createElement('br'));
      } else if (el.tagName === 'HR') {
        p.appendChild(document.createElement('br'));
      } else if (el.tagName === 'PRE' || el.tagName === 'BLOCKQUOTE') {
        var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) p.textContent = text;
        else p.appendChild(document.createElement('br'));
      } else {
        while (el.firstChild) p.appendChild(el.firstChild);
        if (!p.childNodes.length) p.appendChild(document.createElement('br'));
      }
      el.parentNode.replaceChild(p, el);
      return p;
    }

    function blockKind(block) {
      if (!block) return '';
      if (isImageBlock(block)) return 'image';
      var tag = block.tagName;
      if (tag === 'HR') return 'hr';
      if (tag === 'PRE') return 'codeblock';
      if (tag === 'TABLE') return 'table';
      if (tag === 'BLOCKQUOTE') {
        var callout = block.getAttribute('data-callout');
        if (callout === 'note' || callout === 'tip' || callout === 'warning') return 'callout-' + callout;
        return 'quote';
      }
      if (tag === 'LI') {
        var list = block.parentNode;
        if (list.classList && list.classList.contains('dc-todo')) return 'todo';
        return list.tagName === 'OL' ? 'ol' : 'ul';
      }
      if (/^H[1-3]$/.test(tag)) return tag.toLowerCase();
      return 'p';
    }

    function blockCommands() {
      return COMMANDS.filter(function (c) {
        return !c.slashOnly && c.id !== 'mention-person' && c.id !== 'mention-task' && c.id !== 'mention-doc';
      });
    }

    function transformBlock(block, cmd) {
      if (!block || !editor || !editor.contains(block)) return;
      if (cmd === 'image') {
        openImagePopover(block, true);
        return;
      }
      if (block.tagName === 'BLOCKQUOTE' && (cmd === 'p' || cmd === 'quote') && docsRich()) {
        var turned = docsRich().unwrapQuote(block);
        if (turned) {
          focusInside(turned);
          onEdit();
          showBlockUi(currentRow() || turned);
        }
        return;
      }
      var target = block;
      if (isImageBlock(block) || block.tagName === 'HR' || block.tagName === 'PRE') target = plainFrom(block);
      focusInside(target);
      runCommand(cmd, { force: true });
      var row = currentRow();
      if (row) showBlockUi(row);
    }

    function removeBlock(block) {
      if (!block || !editor || !editor.contains(block)) return;
      var parent = block.parentNode;
      parent.removeChild(block);
      pruneEmpty(parent);
      ensureEditor();
      onEdit();
      hideBlockUi();
    }

    function addBlockAfter(block) {
      if (!block || !editor || !editor.contains(block)) return;
      closePop();
      var fresh;
      if (block.tagName === 'LI') {
        fresh = document.createElement('li');
        if (block.parentNode.classList && block.parentNode.classList.contains('dc-todo')) fresh.setAttribute('data-checked', 'false');
        fresh.appendChild(document.createElement('br'));
        block.parentNode.insertBefore(fresh, block.nextSibling);
      } else {
        fresh = document.createElement('p');
        fresh.appendChild(document.createElement('br'));
        block.parentNode.insertBefore(fresh, block.nextSibling);
      }
      focusInside(fresh);
      onEdit();
      showBlockUi(fresh);
      openBlockMenu(fresh, els.blockUi.querySelector('.dc-block-add'), true);
    }

    function armFreshType() {
      if (!editor) return;
      if (freshTypeOff) editor.removeEventListener('input', freshTypeOff);
      freshTypeOff = function () {
        editor.removeEventListener('input', freshTypeOff);
        freshTypeOff = null;
        if (pop && pop.classList.contains('dc-block-menu')) closePop();
      };
      editor.addEventListener('input', freshTypeOff);
    }

    function openBlockMenu(block, anchor, fresh) {
      if (!block || !anchor) return;
      closePop();
      var kind = blockKind(block);
      var items = blockCommands().map(function (cmd) {
        return h('button', {
          class: 'dc-menu-item' + (cmd.id === kind ? ' is-on' : ''),
          type: 'button',
          onclick: function () {
            closePop();
            transformBlock(block, cmd.id);
          },
        }, [icon(cmd.icon), h('span', { text: cmd.label })]);
      });
      items.push(h('div', { class: 'dc-menu-sep' }));
      items.push(h('button', {
        class: 'dc-menu-item is-danger',
        type: 'button',
        onclick: function () {
          closePop();
          removeBlock(block);
        },
      }, [icon('trash'), h('span', { text: 'Supprimer' })]));
      pop = h('div', { class: 'dc-pop dc-menu dc-block-menu', role: 'menu' }, items);
      pop._block = block;
      placePop(pop, anchor.getBoundingClientRect());
      if (fresh) armFreshType();
    }

    function unwrapLi(li) {
      var nodes = [];
      var p = document.createElement('p');
      Array.prototype.slice.call(li.childNodes).forEach(function (k) {
        if (k.nodeType === 1 && (k.tagName === 'UL' || k.tagName === 'OL')) {
          if (!p.childNodes.length) p.appendChild(document.createElement('br'));
          nodes.push(p);
          p = document.createElement('p');
          nodes.push(k);
        } else p.appendChild(k);
      });
      if (p.childNodes.length) nodes.push(p);
      if (!nodes.length) {
        var empty = document.createElement('p');
        empty.appendChild(document.createElement('br'));
        nodes.push(empty);
      }
      return nodes;
    }

    function moveBlock(src, dest, before) {
      if (!src || !dest || src === dest || src.contains(dest)) return;
      var destParent = dest.parentNode;
      var ref = before ? dest : dest.nextSibling;
      if (ref === src) return;
      var srcParent = src.parentNode;
      if (srcParent === destParent) {
        srcParent.insertBefore(src, ref);
        return;
      }
      if (src.tagName === 'LI' && destParent === editor) {
        var nodes = unwrapLi(src);
        srcParent.removeChild(src);
        nodes.forEach(function (n) { editor.insertBefore(n, ref); });
        pruneEmpty(srcParent);
        return;
      }
      if (src.tagName === 'LI' && (destParent.tagName === 'UL' || destParent.tagName === 'OL')) {
        if (destParent.classList.contains('dc-todo')) {
          if (!src.hasAttribute('data-checked')) src.setAttribute('data-checked', 'false');
        } else src.removeAttribute('data-checked');
        destParent.insertBefore(src, ref);
        pruneEmpty(srcParent);
        return;
      }
      if (src.tagName !== 'LI' && (destParent.tagName === 'UL' || destParent.tagName === 'OL')) {
        var li = document.createElement('li');
        if (destParent.classList.contains('dc-todo')) li.setAttribute('data-checked', 'false');
        if (src.tagName === 'P' || /^H[1-6]$/.test(src.tagName)) {
          while (src.firstChild) li.appendChild(src.firstChild);
          if (!li.childNodes.length) li.appendChild(document.createElement('br'));
          srcParent.removeChild(src);
        } else li.appendChild(src);
        destParent.insertBefore(li, ref);
        return;
      }
      if (destParent === editor && srcParent === editor) editor.insertBefore(src, ref);
    }

    function onEditorDragOver(e) {
      if (dragBlock) {
        var row = rowOf(e.target);
        if (!row || row === dragBlock || dragBlock.contains(row) || row.contains(dragBlock)) {
          els.dropLine.hidden = true;
          dropAt = null;
          return;
        }
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        var r = row.getBoundingClientRect();
        var before = e.clientY < r.top + r.height / 2;
        dropAt = { row: row, before: before };
        placeDropLine(row, before);
        return;
      }
      var types = e.dataTransfer && e.dataTransfer.types;
      if (types && Array.prototype.indexOf.call(types, 'Files') >= 0) e.preventDefault();
    }

    function onEditorDrop(e) {
      if (dragBlock && dropAt) {
        e.preventDefault();
        var src = dragBlock;
        var at = dropAt;
        dragBlock = null;
        dropAt = null;
        els.dropLine.hidden = true;
        src.classList.remove('is-dragging');
        var beforeMd = lastDomMd();
        moveBlock(src, at.row, at.before);
        ensureEditor();
        if (editor.contains(src)) showBlockUi(rowOf(src) || src);
        if (lastDomMd() !== beforeMd) onEdit();
        return;
      }
      var files = imageFilesFrom(e.dataTransfer);
      if (!files.length) return;
      e.preventDefault();
      insertImageFiles(files, rowOf(e.target), false);
    }

    function wireBlockUi() {
      if (!els.blockUi) return;
      var addBtn = els.blockUi.querySelector('.dc-block-add');
      var grip = els.blockUi.querySelector('.dc-block-grip');
      addBtn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
      });
      addBtn.addEventListener('click', function (e) {
        e.preventDefault();
        addBlockAfter(blockHover);
      });
      grip.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        if (pop && !pop.classList.contains('dc-block-menu')) closePop();
      });
      grip.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        openBlockMenu(blockHover, grip, false);
      });
      grip.addEventListener('click', function (e) {
        e.preventDefault();
        if (gripDragged) return;
        if (pop && pop.classList.contains('dc-block-menu') && pop._block === blockHover) {
          closePop();
          return;
        }
        openBlockMenu(blockHover, grip, false);
      });
      grip.addEventListener('dragstart', function (e) {
        if (!blockHover) {
          e.preventDefault();
          return;
        }
        gripDragged = true;
        dragBlock = blockHover;
        dragBlock.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', 'bloc'); } catch (err) { /* some browsers refuse */ }
          try { e.dataTransfer.setDragImage(dragBlock, 16, 16); } catch (err2) { /* ignore */ }
        }
        closePop();
      });
      grip.addEventListener('dragend', function () {
        if (dragBlock) dragBlock.classList.remove('is-dragging');
        dragBlock = null;
        dropAt = null;
        els.dropLine.hidden = true;
        setTimeout(function () { gripDragged = false; }, 0);
      });
      els.page.addEventListener('mouseover', function (e) {
        if (els.blockUi.contains(e.target)) {
          clearTimeout(blockHideTimer);
          return;
        }
        if (dragBlock) return;
        var row = rowOf(e.target);
        if (row) {
          clearTimeout(blockHideTimer);
          showBlockUi(row);
        } else scheduleHideBlock();
      });
      els.page.addEventListener('mouseleave', scheduleHideBlock);
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
      function toolBtn(name, iconName, title, open) {
        var b = h('button', {
          class: 'dc-tb',
          type: 'button',
          title: title,
          'aria-label': title,
          'data-cmd': name,
          onmousedown: function (e) { e.preventDefault(); },
          onclick: function () { open(b); },
        }, [icon(iconName)]);
        return b;
      }
      var colorBtn = toolBtn('color', 'palette', 'Couleur', openColorPop);
      var calloutBtn = toolBtn('callout', 'note', 'Encadré', openCalloutMenu);
      var tableBtn = toolBtn('table', 'table', 'Tableau', function (b) {
        restoreSel();
        if (closestIn(selNode(), 'TABLE')) openTableMenu(b);
        else runCommand('table');
      });
      var alignBtn = toolBtn('align', 'align-center', 'Alignement', openAlignMenu);
      [side, icon('file-text', 'dc-head-icon'), els.headTitle, h('span', { class: 'dc-spacer' }), els.status, HP.button(shell), more].forEach(function (c) {
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
        btn('link', 'link', 'Lier un document (Ctrl+K)'),
        btn('highlight', 'highlight', 'Surligner (Ctrl+Maj+H)'),
        colorBtn,
        sep(),
        btn('ul', 'list', 'Liste à puces (Ctrl+Maj+8)'),
        btn('ol', 'list-numbers', 'Liste numérotée (Ctrl+Maj+7)'),
        btn('todo', 'list-check', 'Liste de tâches (Ctrl+Maj+9)'),
        btn('quote', 'quote', 'Citation'),
        calloutBtn,
        btn('codeblock', 'file-code', 'Bloc de code'),
        btn('hr', 'separator-horizontal', 'Séparateur'),
        tableBtn,
        alignBtn,
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
      var live = DL();
      if (live && !closestIn(selNode(), 'PRE,CODE')) {
        var wiki = live.wikiQuery(before);
        if (wiki) {
          var wgroups = DM().searchMentions(state.index, 'doc', wiki.query);
          var wentries = [];
          wgroups.forEach(function (g) {
            g.items.forEach(function (item) { wentries.push({ kind: 'item', item: item, group: g.label }); });
          });
          if (wiki.query.trim()) wentries.push({ kind: 'create', title: DM().cleanTitle(wiki.query) });
          var wkeep = sugg && sugg.kind === 'wiki' && sugg.trig.query === wiki.query ? sugg.active : 0;
          sugg = {
            kind: 'wiki',
            trig: { scope: 'doc', query: wiki.query, length: wiki.length },
            entries: wentries,
            groups: wgroups,
            active: Math.min(wkeep, Math.max(0, wentries.length - 1)),
          };
          paintSuggest();
          return;
        }
      }
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
        h('div', { class: 'dc-sg-head' }, [h('span', { text: title })])
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
              : icon(
                  it.type === 'task' ? (it.done ? 'circle-check' : 'checkbox') : it.type === 'entity' ? 'stack-2' : 'file-text',
                  'dc-sg-icon dc-sg-icon--' + it.type
                );
          row = h('div', { class: 'dc-sg-row' }, [
            lead,
            h('span', { class: 'dc-sg-label', text: it.label }),
            it.sub ? h('span', { class: 'dc-sg-sub', text: it.sub }) : null,
          ]);
        } else if (en.kind === 'create') {
          row = h('div', { class: 'dc-sg-row dc-sg-row--create' }, [
            icon('plus', 'dc-sg-icon dc-sg-icon--doc'),
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
      Array.prototype.forEach.call(editor.querySelectorAll('.dc-mention:not([contenteditable="false"]), .dc-ent:not([contenteditable="false"])'), function (chip) {
        chip.setAttribute('contenteditable', 'false');
      });
    }

    function insertMention(item) {
      /* An entity keeps the typed words flush with the next letter. A zero-width
         space still stops Chrome from stripping the span's attributes. */
      var trail = item.type === 'entity' ? '&#8203;' : '&nbsp;';
      document.execCommand('insertHTML', false, plainChips(DM().mentionHtml(item.type, item.id, item.label)) + trail);
      fixChips();
      refreshChips();
      onEdit();
    }

    /** Puts a mention where `range` is, even if the selection was lost while the task was created. */
    function insertMentionAtRange(range, item) {
      if (!editor || !range || !editor.contains(range.startContainer)) return false;
      editor.focus({ preventScroll: true });
      var sel = global.getSelection();
      sel.removeAllRanges();
      var restored = false;
      try {
        sel.addRange(range);
        restored = !sel.isCollapsed && editor.contains(sel.anchorNode);
      } catch (e) {
        restored = false;
      }
      if (restored) {
        insertMention(item);
        return true;
      }
      var tpl = document.createElement('template');
      tpl.innerHTML = plainChips(DM().mentionHtml(item.type, item.id, item.label));
      var chip = tpl.content.firstChild;
      if (!chip) return false;
      var space = document.createTextNode(item.type === 'entity' ? '\u200b' : '\u00a0');
      range.deleteContents();
      range.insertNode(space);
      range.insertNode(chip);
      fixChips();
      var caret = document.createRange();
      caret.setStartAfter(space);
      caret.collapse(true);
      sel.removeAllRanges();
      try { sel.addRange(caret); } catch (e2) { /* the caret stays where the browser left it */ }
      refreshChips();
      onEdit();
      return true;
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
          record({ type: 'create', targetId: doc.id, title: doc.title });
          toast('Document « ' + doc.title + ' » créé.', 'ok');
        },
        function (err) {
          setBusy('');
          failure(err);
        }
      );
    }

    /* ── 6b. Selection bar (format + create a task) ──────────────── */

    function hideSelBar() {
      if (selBar && selBar.parentNode) selBar.parentNode.removeChild(selBar);
      selBar = null;
    }

    function rangeInOneMention(range) {
      if (!range) return false;
      var a = closestIn(range.startContainer, '.dc-mention');
      var b = closestIn(range.endContainer, '.dc-mention');
      return !!(a && a === b);
    }

    /** Only the selection the user has right now (not the one remembered for menus). */
    function liveSelectionRange() {
      var sel = global.getSelection();
      if (
        sel && sel.rangeCount && !sel.isCollapsed && editor &&
        editor.contains(sel.anchorNode) && editor.contains(sel.focusNode)
      ) {
        return sel.getRangeAt(0).cloneRange();
      }
      return null;
    }

    function selectionRange() {
      var live = liveSelectionRange();
      if (live) return live;
      if (lastRange && !lastRange.collapsed && editor && editor.contains(lastRange.startContainer)) {
        return lastRange.cloneRange();
      }
      return null;
    }

    function selectedDraft() {
      var range = liveSelectionRange();
      if (!range || rangeInOneMention(range)) return null;
      return DM().taskFromSelection(range.toString());
    }

    function taskListPool() {
      var lists = state.taskLists && state.taskLists.length ? state.taskLists : (state.sources && state.sources.lists) || [];
      return DM().taskListsForCreate(lists);
    }

    function selectionClientRect() {
      var sel = global.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
      var live = sel.getRangeAt(0);
      var rects = live.getClientRects();
      var rect = rects.length ? rects[0] : live.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return null;
      return rect;
    }

    function placeSelBar() {
      if (!selBar) return;
      var rect = selectionClientRect();
      if (!rect) {
        if (!(pop && pop.classList.contains('dc-sel-pop'))) hideSelBar();
        return;
      }
      selBar.style.left = '0px';
      selBar.style.top = '0px';
      var w = selBar.offsetWidth;
      var hh = selBar.offsetHeight;
      var left = Math.max(8, Math.min(rect.left, global.innerWidth - w - 8));
      var top = rect.top - hh - 8;
      if (top < 8) top = Math.min(global.innerHeight - hh - 8, rect.bottom + 8);
      selBar.style.left = left + 'px';
      selBar.style.top = top + 'px';
    }

    function updateSelBar() {
      if (!state.current || sugg) {
        hideSelBar();
        return;
      }
      if (!editorSelection()) {
        if (selBar && pop && pop.classList.contains('dc-sel-pop')) return;
        hideSelBar();
        return;
      }
      var lists = taskListPool();
      var shape = (selectedDraft() ? '1' : '0') + (lists.length > 1 ? '1' : '0') + (canCreateEntity() ? '1' : '0');
      if (selBar && selBar.parentNode && selBar.getAttribute('data-shape') === shape) {
        paintSelBarState();
        placeSelBar();
        return;
      }
      function keep(e) {
        e.preventDefault();
        holdSelection();
      }
      function ibtn(cmd, iconName, title) {
        return h('button', {
          class: 'dc-selbar-icon',
          type: 'button',
          title: title,
          'aria-label': title,
          'data-cmd': cmd,
          onmousedown: keep,
          onclick: function () {
            closePop();
            runCommand(cmd);
          },
        }, [icon(iconName)]);
      }
      function sep() { return h('span', { class: 'dc-selbar-sep', role: 'separator' }); }
      var parts = [
        h('button', {
          class: 'dc-selbar-style',
          type: 'button',
          title: 'Style',
          'aria-label': 'Style',
          onmousedown: keep,
          onclick: function (e) { openStyleMenu(e.currentTarget); },
        }, [h('span', { class: 'dc-selbar-style-label', text: 'Texte' }), icon('chevron-down')]),
        sep(),
        h('button', {
          class: 'dc-selbar-icon dc-selbar-color',
          type: 'button',
          title: 'Couleur',
          'aria-label': 'Couleur',
          onmousedown: keep,
          onclick: function (e) { openInkPopover(e.currentTarget); },
        }, [h('span', { class: 'dc-selbar-a', text: 'A' }), h('span', { class: 'dc-selbar-a-bar' })]),
        sep(),
        ibtn('bold', 'bold', 'Gras'),
        ibtn('italic', 'italic', 'Italique'),
        ibtn('underline', 'underline', 'Souligné'),
        ibtn('strike', 'strikethrough', 'Barré'),
        sep(),
        ibtn('link', 'link', 'Lier un document'),
        ibtn('ul', 'list', 'Liste à puces'),
        ibtn('ol', 'list-numbers', 'Liste numérotée'),
        h('button', {
          class: 'dc-selbar-icon',
          type: 'button',
          title: 'Plus',
          'aria-label': 'Plus',
          onmousedown: keep,
          onclick: function (e) { openSelMore(e.currentTarget); },
        }, [icon('dots')]),
      ];
      if (selectedDraft()) {
        parts.push(sep());
        parts.push(h('button', {
          class: 'dc-selbar-btn',
          type: 'button',
          onmousedown: keep,
          onclick: function () { createTaskFromSelection(); },
        }, [icon('plus'), h('span', { text: 'Créer une tâche' })]));
        if (lists.length > 1) {
          parts.push(h('button', {
            class: 'dc-selbar-btn dc-selbar-btn--more',
            type: 'button',
            title: 'Choisir la liste',
            'aria-label': 'Choisir la liste',
            onmousedown: keep,
            onclick: function (e) { openTaskListMenu(e.currentTarget); },
          }, [icon('chevron-down')]));
        }
        if (canCreateEntity()) {
          parts.push(h('button', {
            class: 'dc-selbar-btn',
            type: 'button',
            onmousedown: keep,
            onclick: function () { createEntityFromSelection(); },
          }, [icon('stack-2'), h('span', { text: 'Créer une entité' })]));
        }
      }
      hideSelBar();
      selBar = h('div', { class: 'dc-selbar', role: 'toolbar', 'aria-label': 'Sélection', 'data-shape': shape }, parts);
      shell.appendChild(selBar);
      paintSelBarState();
      placeSelBar();
    }

    function openTaskListMenu(anchor) {
      var lists = taskListPool();
      if (!lists.length) return;
      var rect = anchor.getBoundingClientRect();
      var def = DM().defaultTaskListId(lists);
      saveSel();
      hideSelBar();
      closePop();
      pop = h('div', { class: 'dc-pop dc-menu', role: 'menu' }, lists.map(function (l) {
        return h('button', {
          class: 'dc-menu-item' + (String(l.id) === String(def) ? ' is-on' : ''),
          type: 'button',
          onclick: function () {
            closePop();
            createTaskFromSelection(String(l.id));
          },
        }, [icon(l.icon || 'circle'), h('span', { text: l.name || 'Liste' })]);
      }));
      placePop(pop, rect);
    }

    var heldRange = null;

    function holdSelection() {
      var live = liveSelectionRange();
      if (live) {
        heldRange = live;
        lastRange = live.cloneRange();
      }
      return heldRange;
    }

    var SEL_INKS = [
      { id: 'gray', label: 'Gris', fg: '#626f86', bg: '#dfe1e6' },
      { id: 'brown', label: 'Brun', fg: '#8f6b4f', bg: '#f3e2d4' },
      { id: 'orange', label: 'Orange', fg: '#e56910', bg: '#ffe2bd' },
      { id: 'yellow', label: 'Jaune', fg: '#b38600', bg: '#f8e6a0' },
      { id: 'green', label: 'Vert', fg: '#1f845a', bg: '#d3f1a7' },
      { id: 'blue', label: 'Bleu', fg: '#0c66e4', bg: '#cce0ff' },
      { id: 'purple', label: 'Violet', fg: '#6e5dc6', bg: '#dfd8fd' },
      { id: 'pink', label: 'Rose', fg: '#cd519d', bg: '#fdd0ec' },
      { id: 'red', label: 'Rouge', fg: '#c9372c', bg: '#ffd2d2' },
    ];
    var STYLE_LABEL = { p: 'Texte', h1: 'Titre 1', h2: 'Titre 2', h3: 'Titre 3' };

    function editorSelection() {
      var range = liveSelectionRange();
      if (!range || rangeInOneMention(range)) return null;
      if (!String(range.toString()).replace(/[\s\u200b\ufeff]/g, '')) return null;
      return range;
    }

    function inkHost(node, kind) {
      var el = node && node.nodeType === 3 ? node.parentNode : node;
      while (el && el !== editor) {
        if (el.nodeType === 1) {
          if (kind === 'h' && el.tagName === 'MARK') return el;
          if (kind === 'c' && el.classList && el.classList.contains('dc-ink')) return el;
        }
        el = el.parentNode;
      }
      return null;
    }

    function inkHere() {
      var n = selNode();
      var colorEl = inkHost(n, 'c');
      var hiEl = inkHost(n, 'h');
      return {
        color: colorEl ? colorEl.getAttribute('data-c') || '' : '',
        hi: hiEl ? (hiEl.getAttribute('data-c') || 'yellow') : '',
      };
    }

    function slicesInRange(range) {
      var root = range.commonAncestorContainer;
      var rootEl = root.nodeType === 1 ? root : root.parentNode;
      if (!rootEl) return [];
      var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
      var out = [];
      var node;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue || !editor.contains(node) || closestIn(node, '.dc-mention')) continue;
        var hit = false;
        try { hit = range.intersectsNode(node); } catch (err) { hit = false; }
        if (!hit) continue;
        var start = node === range.startContainer ? range.startOffset : 0;
        var end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
        if (start > end) { var swap = start; start = end; end = swap; }
        if (end > start) out.push({ node: node, start: start, end: end });
      }
      return out;
    }

    function isolateText(node, start, end) {
      var text = node;
      if (start > 0) text = text.splitText(start);
      if (text.nodeValue && end - start < text.nodeValue.length) text.splitText(end - start);
      return text;
    }

    function unwrapEl(el) {
      var parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }

    function pullOut(text, stop) {
      var node = text;
      while (node.parentNode && node.parentNode !== stop) {
        var parent = node.parentNode;
        var right = parent.cloneNode(false);
        while (node.nextSibling) right.appendChild(node.nextSibling);
        var mid = parent.cloneNode(false);
        mid.appendChild(node);
        parent.parentNode.insertBefore(mid, parent.nextSibling);
        if (right.childNodes.length) parent.parentNode.insertBefore(right, mid.nextSibling);
        if (!parent.childNodes.length) parent.parentNode.removeChild(parent);
        node = mid;
      }
      if (node.parentNode === stop) {
        var after = stop.cloneNode(false);
        while (node.nextSibling) after.appendChild(node.nextSibling);
        stop.parentNode.insertBefore(node, stop.nextSibling);
        if (after.childNodes.length) stop.parentNode.insertBefore(after, node.nextSibling);
        if (!stop.childNodes.length) stop.parentNode.removeChild(stop);
      }
      while (node && node.nodeType !== 3) node = node.firstChild;
      return node || text;
    }

    function paintSlice(node, start, end, kind, name) {
      var text = isolateText(node, start, end);
      var host = inkHost(text, kind);
      if (!name) {
        if (!host) return text;
        if (host.textContent === text.nodeValue) {
          unwrapEl(host);
          return text;
        }
        return pullOut(text, host);
      }
      if (host && host.textContent === text.nodeValue) {
        host.setAttribute('data-c', name);
        if (kind === 'c') host.classList.add('dc-ink');
        return text;
      }
      var el = document.createElement(kind === 'h' ? 'mark' : 'span');
      if (kind === 'c') el.className = 'dc-ink';
      el.setAttribute('data-c', name);
      text.parentNode.insertBefore(el, text);
      el.appendChild(text);
      return text;
    }

    function applyInk(kind, name) {
      if (!editor) return;
      var range = liveSelectionRange();
      if (!range && lastRange && editor.contains(lastRange.startContainer)) {
        var sel0 = global.getSelection();
        sel0.removeAllRanges();
        try { sel0.addRange(lastRange); } catch (e0) { return; }
        range = liveSelectionRange();
      }
      if (!range) return;
      var now = kind === 'h' ? inkHere().hi : inkHere().color;
      var next = name && now === name ? '' : (name || '');
      var slices = slicesInRange(range);
      if (!slices.length) return;
      var first = null;
      var last = null;
      var i;
      for (i = slices.length - 1; i >= 0; i--) {
        var piece = paintSlice(slices[i].node, slices[i].start, slices[i].end, kind, next);
        if (piece && piece.nodeType === 3) {
          if (!last) last = piece;
          first = piece;
        }
      }
      if (first && last && last.nodeValue != null) {
        var sel = global.getSelection();
        var r = document.createRange();
        try {
          r.setStart(first, 0);
          r.setEnd(last, last.nodeValue.length);
          sel.removeAllRanges();
          sel.addRange(r);
        } catch (e1) { /* the nodes moved */ }
        saveSel();
      }
      onEdit();
      paintToolbarState();
    }

    function paintSelBarState() {
      if (!selBar) return;
      var n = selNode();
      var inEditor = !!n;
      function q(cmd) {
        try { return inEditor && document.queryCommandState(cmd); } catch (e) { return false; }
      }
      var li = inEditor && closestIn(n, 'LI');
      var list = li && li.parentNode;
      var states = {
        bold: q('bold'),
        italic: q('italic'),
        underline: q('underline'),
        strike: q('strikeThrough'),
        code: inEditor && !!closestIn(n, 'CODE'),
        link: inEditor && !!closestIn(n, 'A'),
        ul: !!list && list.tagName === 'UL' && !list.classList.contains('dc-todo'),
        ol: !!list && list.tagName === 'OL',
      };
      Array.prototype.forEach.call(selBar.querySelectorAll('[data-cmd]'), function (b) {
        var cmd = b.getAttribute('data-cmd');
        if (!Object.prototype.hasOwnProperty.call(states, cmd)) return;
        var on = !!states[cmd];
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var label = selBar.querySelector('.dc-selbar-style-label');
      if (label) label.textContent = STYLE_LABEL[blockType()] || 'Texte';
      var ink = inkHere();
      var sw = null;
      SEL_INKS.forEach(function (c) { if (c.id === ink.color) sw = c; });
      var stripe = selBar.querySelector('.dc-selbar-a-bar');
      if (stripe) stripe.style.background = sw ? sw.fg : 'currentColor';
    }

    function openStyleMenu(anchor) {
      if (pop && pop.classList.contains('dc-style-pop')) {
        closePop();
        return;
      }
      holdSelection();
      closePop();
      var cur = blockType();
      if (cur === 'codeblock') cur = 'p';
      var rows = [['p', 'Texte', 'pilcrow'], ['h1', 'Titre 1', 'h-1'], ['h2', 'Titre 2', 'h-2'], ['h3', 'Titre 3', 'h-3']];
      pop = h('div', { class: 'dc-pop dc-menu dc-sel-pop dc-style-pop', role: 'menu' }, rows.map(function (row) {
        return h('button', {
          class: 'dc-menu-item' + (cur === row[0] ? ' is-on' : ''),
          type: 'button',
          onmousedown: function (e) { e.preventDefault(); holdSelection(); },
          onclick: function () {
            closePop();
            runCommand(row[0], { force: true });
          },
        }, [icon(row[2]), h('span', { text: row[1] })]);
      }));
      placePop(pop, anchor.getBoundingClientRect());
    }

    function openSelMore(anchor) {
      if (pop && pop.classList.contains('dc-more-pop')) {
        closePop();
        return;
      }
      holdSelection();
      closePop();
      var rows = [['code', 'code', 'Code'], ['quote', 'quote', 'Citation'], ['todo', 'list-check', 'Liste de tâches']];
      pop = h('div', { class: 'dc-pop dc-menu dc-sel-pop dc-more-pop', role: 'menu' }, rows.map(function (row) {
        return h('button', {
          class: 'dc-menu-item',
          type: 'button',
          onmousedown: function (e) { e.preventDefault(); holdSelection(); },
          onclick: function () {
            closePop();
            runCommand(row[0]);
          },
        }, [icon(row[1]), h('span', { text: row[2] })]);
      }));
      placePop(pop, anchor.getBoundingClientRect());
    }

    function inkSwatch(kind, id, bg, label, current) {
      return h('button', {
        class: 'dc-swatch' + (!id ? ' dc-swatch--none' : '') + (current && current === id ? ' is-on' : ''),
        type: 'button',
        title: label,
        'aria-label': label,
        'data-ink': id || 'none',
        style: bg ? 'background:' + bg : '',
        onmousedown: function (e) { e.preventDefault(); holdSelection(); },
        onclick: function () {
          applyInk(kind, id);
          closePop();
        },
      });
    }

    function openInkPopover(anchor) {
      if (pop && pop.classList.contains('dc-ink-pop')) {
        closePop();
        return;
      }
      holdSelection();
      closePop();
      var ink = inkHere();
      function row(kind, current) {
        var buttons = [inkSwatch(kind, '', '', 'Aucune', current)];
        SEL_INKS.forEach(function (c) {
          buttons.push(inkSwatch(kind, c.id, kind === 'h' ? c.bg : c.fg, c.label, current));
        });
        return h('div', { class: 'dc-ink-row' }, buttons);
      }
      pop = h('div', { class: 'dc-pop dc-ink-pop dc-sel-pop' }, [
        h('div', { class: 'dc-ink-label', text: 'Texte' }),
        row('c', ink.color),
        h('div', { class: 'dc-ink-label', text: 'Surlignage' }),
        row('h', ink.hi),
      ]);
      placePop(pop, anchor.getBoundingClientRect());
    }

    /** The project this page belongs to: the page itself, or a project document above it. */
    function projectHere() {
      var cur = state.current;
      var id = cur && cur.id;
      var hops = 0;
      var parents = (state.idx && state.idx.parents) || {};
      while (id && hops++ < 30) {
        var d = id === cur.id ? cur : (state.docs || []).filter(function (x) { return x.id === id; })[0];
        if (d && d.subject && d.subject.k === 'project') return d.subject.id;
        id = parents[id];
      }
      return '';
    }

    function createTaskFromSelection(listId) {
      var range = liveSelectionRange() || (heldRange && editor && editor.contains(heldRange.startContainer) ? heldRange.cloneRange() : selectionRange());
      heldRange = null;
      var draft = range && !rangeInOneMention(range) ? DM().taskFromSelection(range.toString()) : null;
      if (!draft || !state.current) return;
      var kept = range.cloneRange();
      lastRange = kept;
      hideSelBar();
      closePop();
      var lists = state.taskLists && state.taskLists.length ? state.taskLists : (state.sources && state.sources.lists) || [];
      var id = listId || DM().defaultTaskListId(lists);
      setBusy('Création de la tâche…');
      DT().createTask(t, draft.name, id, draft.desc).then(function (card) {
        setBusy('');
        if (!state.sources) state.sources = { members: [], contacts: [], cards: [], lists: lists, failed: [] };
        state.sources.cards = (state.sources.cards || []).filter(function (c) { return c && c.id !== card.id; });
        state.sources.cards.push({ id: card.id, name: card.name, idList: card.idList, dueComplete: false });
        rebuildIndex();
        var projectId = projectHere();
        var placed = projectId && DT().linkTaskToProject
          ? DT().linkTaskToProject(t, card.id, projectId).then(function () {
            return DT().ensureProjectDocs ? DT().ensureProjectDocs(t, state.docs) : { docs: state.docs };
          }, function () { return { docs: state.docs }; })
          : Promise.resolve(null);
        placed.then(function (r) {
          if (!r || !r.docs) return;
          state.docs = r.docs;
          state.idx = DT().getFolderIndex();
          state.docs.forEach(function (d) {
            if (d.subject && d.subject.k === 'project' && d.subject.id === projectId) setFolderOpen('doc:' + d.id, true);
          });
          paintList();
          if (state.current) paintProps();
        });
        if (!insertMentionAtRange(kept, { type: 'task', id: card.id, label: card.name })) {
          toast('Tâche créée, mais le lien n’a pas pu remplacer la sélection.', 'error');
          return;
        }
        var listName = '';
        lists.forEach(function (l) { if (l && String(l.id) === String(card.idList)) listName = l.name || ''; });
        toast(listName ? 'Tâche créée dans « ' + listName + ' ».' : 'Tâche créée.', 'ok');
      }, function (err) {
        setBusy('');
        failure(err);
      });
    }

    function canCreateEntity() {
      var EM = global.EntitiesModel;
      var ET = global.EntitiesTrello;
      var DE = global.DocsEntities;
      return !!(EM && ET && DE && typeof EM.createEntity === 'function' && typeof ET.load === 'function' && typeof ET.commit === 'function' && typeof DE.nameFromSelection === 'function');
    }

    function createEntityFromSelection() {
      var DE = global.DocsEntities;
      var EM = global.EntitiesModel;
      var ET = global.EntitiesTrello;
      var range = liveSelectionRange() || (heldRange && editor && editor.contains(heldRange.startContainer) ? heldRange.cloneRange() : selectionRange());
      heldRange = null;
      var name = range && !rangeInOneMention(range) && DE ? DE.nameFromSelection(range.toString()) : '';
      if (!name || !state.current || !canCreateEntity()) return;
      var kept = range.cloneRange();
      lastRange = kept;
      hideSelBar();
      closePop();
      var known = state.entityPack;
      var knownId = known ? DE.matchId(DE.catalogOf(known.schema, known.entities), name) : '';
      setBusy(knownId ? '' : 'Création de l’entité…');
      var ready = knownId
        ? Promise.resolve({ id: knownId, created: false, pack: known })
        : ET.load(t).then(function (pack) {
            if (!pack) pack = { schema: EM.defaultSchema(), entities: [], cards: {} };
            if (!pack.cards) pack.cards = {};
            var schema = pack.schema || EM.defaultSchema();
            var again = DE.matchId(DE.catalogOf(schema, pack.entities), name);
            if (again) return { id: again, created: false, pack: pack };
            var entity = EM.createEntity(schema, { name: name });
            return ET.commit(t, pack, schema, (pack.entities || []).concat([entity])).then(function (next) {
              return { id: entity.id, created: true, pack: next };
            });
          });
      ready.then(function (res) {
        setBusy('');
        if (res.pack) {
          state.entityPack = res.pack;
          rebuildIndex();
        }
        if (!insertMentionAtRange(kept, { type: 'entity', id: res.id, label: name })) {
          toast(res.created ? 'Entité créée, mais le lien n’a pas pu remplacer la sélection.' : 'Le lien n’a pas pu remplacer la sélection.', 'error');
          return;
        }
        watchEntities(editor);
        toast(res.created ? 'Entité créée.' : 'Lié à l’entité existante.', 'ok');
      }, function (err) {
        setBusy('');
        failure(err);
      });
    }

    function onEditorContextMenu(e) {
      var CM = global.ContextMenu;
      if (!CM || typeof CM.show !== 'function' || typeof CM.buildGenericItems !== 'function') return;
      if (!selectedDraft()) return;
      holdSelection();
      var items = CM.buildGenericItems(e.target, document) || [];
      items.unshift({ sep: true });
      if (canCreateEntity()) {
        items.unshift({
          id: 'create-entity',
          label: 'Créer une entité',
          icon: 'stack-2',
          action: function () { createEntityFromSelection(); },
        });
      }
      items.unshift({
        id: 'create-task',
        label: 'Créer une tâche',
        icon: 'plus',
        action: function () { createTaskFromSelection(); },
      });
      e.preventDefault();
      e.stopPropagation();
      hideSelBar();
      CM.show(e, items);
    }

    /* ── 7. Popovers + dialogs ───────────────────────────────────── */

    function closePop() {
      if (quick) {
        quick.destroy();
        quick = null;
      }
      if (pop && pop._ro) pop._ro.disconnect();
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
      pop = null;
      previewChip = null;
      previewPinned = false;
    }

    function placePop(el, rect) {
      if (el.parentNode !== shell) shell.appendChild(el); // re-appending would drop the focus of a field inside
      var w = el.offsetWidth;
      var hh = el.offsetHeight;
      var left = Math.max(8, Math.min(rect.left, global.innerWidth - w - 8));
      var top = rect.bottom + 6;
      if (top + hh > global.innerHeight - 8) top = Math.max(8, rect.top - hh - 6);
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    }

    function anchorDocId(node) {
      if (!node || typeof node.getAttribute !== 'function') return '';
      var fromData = DM().cleanId(node.getAttribute('data-doc'));
      if (fromData) return fromData;
      return DM().docLinkId(node.getAttribute('href'));
    }

    /** A scheme the editor will not turn into a web link (`javascript:`, `doc:`, …). */
    function rejectedAddress(q) {
      var s = String(q || '').trim();
      if (!s || DM().safeHref(s)) return false;
      return /^[a-z][a-z0-9+.-]*:/i.test(s);
    }

    function docNamed(title) {
      var folded = DM().fold(title);
      var list = (state.index && state.index.doc) || [];
      var i;
      for (i = 0; i < list.length; i++) {
        if (DM().fold(list[i].label) === folded) return true;
      }
      if (state.current) {
        var self = DM().resolveMention(state.index, 'doc', state.current.id);
        if (self && DM().fold(self.label) === folded) return true;
      }
      return false;
    }

    function openLinkPopover(existing) {
      saveSel();
      closeSuggest();
      closePop();
      var n = selNode();
      var anchor = existing || (n && closestIn(n, 'A'));
      var sel = global.getSelection();
      var rect = anchor ? anchor.getBoundingClientRect() : sel.rangeCount ? caretRect() : els.toolbar.getBoundingClientRect();
      var seed = '';
      if (anchor) {
        var existingId = anchorDocId(anchor);
        if (existingId) {
          var known = DM().resolveMention(state.index, 'doc', existingId);
          seed = (known && known.label) || '';
        } else seed = anchor.getAttribute('href') || '';
      } else {
        var raw = '';
        if (sel && !sel.isCollapsed && editor && editor.contains(sel.anchorNode)) raw = sel.toString();
        else if (lastRange && !lastRange.collapsed) raw = lastRange.toString();
        raw = String(raw).replace(/\s+/g, ' ').trim();
        if (raw.length <= 80) seed = raw;
      }
      var input = h('input', {
        class: 'dc-input',
        type: 'text',
        placeholder: 'Document…',
        value: seed,
        'aria-label': 'Document',
        spellcheck: 'false',
      });
      var err = h('div', { class: 'dc-pop-err', hidden: true });
      var list = h('div', { class: 'dc-link-list', role: 'listbox' });
      var choices = [];
      var active = 0;
      var activeKey = anchorDocId(anchor);
      activeKey = activeKey ? 'doc:' + activeKey : '';

      function choiceKey(ch) {
        if (!ch) return '';
        if (ch.kind === 'doc') return 'doc:' + ch.item.id;
        if (ch.kind === 'url') return 'url:' + ch.href;
        return 'create:' + ch.title;
      }
      function choicesFor(raw) {
        var trimmed = String(raw || '').trim();
        if (rejectedAddress(trimmed)) return [];
        var href = DM().safeHref(trimmed);
        if (href) return [{ kind: 'url', href: href }];
        var out = [];
        function pushDocs(query) {
          DM().searchMentions(state.index, 'doc', query).forEach(function (g) {
            g.items.forEach(function (item) { out.push({ kind: 'doc', item: item }); });
          });
        }
        pushDocs(trimmed);
        var title = DM().cleanTitle(trimmed);
        var create = title && !docNamed(title) ? { kind: 'create', title: title } : null;
        if (!out.length && trimmed) {
          if (create) out.push(create);
          pushDocs('');
          return out;
        }
        if (create) out.push(create);
        return out;
      }
      function indexFor(rows) {
        var i;
        if (activeKey) {
          for (i = 0; i < rows.length; i++) {
            if (choiceKey(rows[i]) === activeKey) return i;
          }
        }
        return 0;
      }
      function stampDoc(link, id) {
        link.setAttribute('href', 'doc:' + id);
        link.setAttribute('data-doc', id);
        link.classList.add('dc-doclink');
        link.removeAttribute('target');
        link.removeAttribute('rel');
      }
      function docAnchorHtml(id, label) {
        return '<a class="dc-doclink" href="doc:' + escHtml(id) + '" data-doc="' + escHtml(id) + '">' + escHtml(label) + '</a>';
      }
      function writeDocLink(linkNode, id) {
        if (linkNode && linkNode.parentNode && editor && editor.contains(linkNode)) {
          stampDoc(linkNode, id);
          onEdit();
          return;
        }
        restoreSel();
        var s = global.getSelection();
        if (!s || !s.rangeCount) return;
        if (s.isCollapsed) {
          var item = DM().resolveMention(state.index, 'doc', id);
          document.execCommand('insertHTML', false, withCompanion(docAnchorHtml(id, (item && item.label) || 'Document')));
        } else {
          document.execCommand('createLink', false, 'doc:' + id);
          var link = closestIn(selNode(), 'A');
          if (!link) {
            document.execCommand('insertHTML', false, withCompanion(docAnchorHtml(id, s.toString())));
            link = closestIn(selNode(), 'A');
          }
          if (link) stampDoc(link, id);
        }
        onEdit();
      }
      function applyDoc(id) {
        var range = lastRange;
        var linkNode = anchor;
        closePop();
        lastRange = range;
        writeDocLink(linkNode, id);
      }
      function applyHref(href) {
        var range = lastRange;
        closePop();
        lastRange = range;
        if (anchor && anchor.parentNode && editor && editor.contains(anchor)) {
          anchor.setAttribute('href', href);
          anchor.removeAttribute('data-doc');
          anchor.classList.remove('dc-doclink');
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
          onEdit();
          return;
        }
        restoreSel();
        var s = global.getSelection();
        if (s && s.isCollapsed) {
          document.execCommand('insertHTML', false, withCompanion('<a href="' + escHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escHtml(href) + '</a>'));
        } else {
          document.execCommand('createLink', false, href);
        }
        onEdit();
      }
      function applyCreate(title) {
        var range = lastRange;
        var linkNode = anchor;
        closePop();
        setBusy('Création du document…');
        DT().createDoc(t, title, '').then(
          function (doc) {
            setBusy('');
            state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
            sortDocs();
            paintList();
            rebuildIndex();
            lastRange = range;
            writeDocLink(linkNode, doc.id);
            record({ type: 'create', targetId: doc.id, title: doc.title });
            toast('Document « ' + doc.title + ' » créé.', 'ok');
          },
          function (err) {
            setBusy('');
            failure(err);
          }
        );
      }
      function applyChoice(ch) {
        if (!ch) return;
        if (ch.kind === 'url') applyHref(ch.href);
        else if (ch.kind === 'doc') applyDoc(ch.item.id);
        else if (ch.kind === 'create') applyCreate(ch.title);
      }
      function removeLink() {
        var range = lastRange;
        closePop();
        lastRange = range;
        restoreSel();
        if (anchor && anchor.parentNode) {
          var r = document.createRange();
          r.selectNodeContents(anchor);
          var s = global.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        }
        document.execCommand('unlink');
        onEdit();
      }
      function markActive() {
        Array.prototype.forEach.call(list.querySelectorAll('.dc-sg-row'), function (row) {
          var on = Number(row.getAttribute('data-i')) === active;
          row.classList.toggle('is-active', on);
          if (on && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
        });
      }
      function paintChoices() {
        choices = choicesFor(input.value);
        active = indexFor(choices);
        if (choices[active]) activeKey = choiceKey(choices[active]);
        list.textContent = '';
        err.hidden = true;
        if (rejectedAddress(input.value)) {
          err.hidden = false;
          err.textContent = 'Adresse non valide (http, https ou mailto).';
        } else if (!choices.length) {
          list.appendChild(h('div', { class: 'dc-sg-none', text: 'Aucun document' }));
        }
        choices.forEach(function (ch, i) {
          var row;
          if (ch.kind === 'doc') {
            row = h('div', { class: 'dc-sg-row', title: ch.item.label }, [
              icon('file-text', 'dc-sg-icon dc-sg-icon--doc'),
              h('span', { class: 'dc-sg-label', text: ch.item.label }),
              ch.item.sub ? h('span', { class: 'dc-sg-sub', text: ch.item.sub }) : null,
            ]);
          } else if (ch.kind === 'create') {
            row = h('div', { class: 'dc-sg-row dc-sg-row--create', title: ch.title }, [
              icon('plus', 'dc-sg-icon dc-sg-icon--doc'),
              h('span', { class: 'dc-sg-label', text: 'Créer le document « ' + ch.title + ' »' }),
            ]);
          } else {
            row = h('div', { class: 'dc-sg-row', title: ch.href }, [
              icon('link', 'dc-sg-icon'),
              h('span', { class: 'dc-sg-label', text: ch.href }),
            ]);
          }
          row.setAttribute('role', 'option');
          row.setAttribute('data-i', String(i));
          if (i === active) row.classList.add('is-active');
          row.addEventListener('mousedown', function (e) { e.preventDefault(); });
          row.addEventListener('click', function () { applyChoice(ch); });
          row.addEventListener('mousemove', function () {
            if (active !== i) {
              active = i;
              activeKey = choiceKey(ch);
              markActive();
            }
          });
          list.appendChild(row);
        });
        if (pop && pop.parentNode) placePop(pop, rect);
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          if (!choices.length) return;
          e.preventDefault();
          active = (active + (e.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
          activeKey = choiceKey(choices[active]);
          markActive();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          var rows = choicesFor(input.value);
          if (!rows.length) {
            if (String(input.value || '').trim()) {
              err.hidden = false;
              err.textContent = 'Adresse non valide (http, https ou mailto).';
            }
            return;
          }
          applyChoice(rows[indexFor(rows)]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          var range = lastRange;
          closePop();
          lastRange = range;
          restoreSel();
        }
      });
      input.addEventListener('input', paintChoices);
      var tools = [];
      if (anchor && !anchorDocId(anchor)) {
        tools.push(h('button', {
          class: 'dc-tb',
          type: 'button',
          title: 'Ouvrir le lien',
          'aria-label': 'Ouvrir le lien',
          onclick: function () { global.open(anchor.getAttribute('href'), '_blank', 'noopener'); },
        }, [icon('external-link')]));
      }
      if (anchor) {
        tools.push(h('button', {
          class: 'dc-tb',
          type: 'button',
          title: 'Retirer le lien',
          'aria-label': 'Retirer le lien',
          onmousedown: function (e) { e.preventDefault(); },
          onclick: removeLink,
        }, [icon('unlink')]));
      }
      var field = h('div', { class: 'dc-pop-row' }, [input].concat(tools));
      pop = h('div', { class: 'dc-pop dc-pop--link' }, [field, list, err]);
      paintChoices();
      placePop(pop, rect);
      input.focus();
      input.select();
    }

    function openPersonPopover(chip) {
      closePop();
      var id = chip.getAttribute('data-id');
      var item = DM().resolveMention(state.index, 'person', id);
      var label = (item && item.label) || chip.getAttribute('data-label') || 'Personne';
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
      var asFolder = DM().folderByDoc(state.idx, docId);
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
        item('plus', 'Nouveau sous-document', function () { newDoc(null, null, null, docId); }),
        item('copy', 'Dupliquer', function () { duplicateDoc(docId); }),
        state.current && state.current.id === docId
          ? item('photo', state.current.cover ? 'Changer la couverture' : 'Ajouter une couverture', function () {
            if (!state.current.cover) addCover();
            else openCoverPicker(anchor.getBoundingClientRect());
          })
          : null,
        state.current && state.current.id === docId && DH()
          ? item('history', 'Historique des versions', openVersions)
          : null,
        item('download', 'Télécharger (.md)', function () { exportDoc(docId, 'download'); }),
        item('clipboard', 'Copier en Markdown', function () { exportDoc(docId, 'copy'); }),
        !asFolder && state.idx.parents && state.idx.parents[docId] && state.docs.some(function (x) { return x.id === state.idx.parents[docId]; })
          ? item('arrow-bar-up', 'Sortir du document parent', function () { unnestDoc(docId); })
          : null,
        asFolder ? null : item('folder-share', 'Déplacer vers un dossier…', function () {
          openFolderPicker(anchor, 'Déplacer le document vers', state.idx.docs[docId] || '', '', function (to) { moveDocToFolder(docId, to); });
        }),
        state.driveUrl
          ? item('brand-google-drive', 'Afficher dans Google Drive', function () {
            window.open(state.driveUrl, '_blank', 'noopener');
          })
          : null,
        h('div', { class: 'dc-menu-sep' }),
        asFolder
          ? (asFolder.archived
            ? item('archive-off', 'Restaurer', function () { editFolders(function (idx) { DM().restoreFolderIn(idx, asFolder.id); }, 'Dossier restauré.'); })
            : item('archive', 'Archiver…', function () { deleteFolder(asFolder.id); }, true))
          : (state.idx.archived && state.idx.archived[docId]
            ? item('archive-off', 'Restaurer', function () { restoreDoc(docId); })
            : item('archive', 'Archiver', function () { confirmDelete(docId); }, true)),
      ]);
      placePop(pop, anchor.getBoundingClientRect());
    }

    /* ── Cover (banner above the title) ──────────────────────────── */

    var COVER_TAB_KEY = 'cerveau.docs.coverTab';
    var COVER_TABS = [['color', 'Couleur'], ['gradient', 'Dégradé'], ['unsplash', 'Unsplash'], ['upload', 'Importer']];
    var coverTimer = null;
    var coverCur = null;
    var repositioning = false;
    var unsplashRemote = true; // false once the Worker said it cannot search: the curated gallery is used

    function coverLabel(c) {
      if (!c) return 'Aucune';
      if (c.k === 'color') {
        var col = DM().COVER_COLORS.filter(function (x) { return x.v === c.v; })[0];
        return 'Couleur' + (col ? ' ' + col.label.toLowerCase() : '');
      }
      if (c.k === 'gradient') {
        var g = DM().COVER_GRADIENTS.filter(function (x) { return x.id === c.v; })[0];
        return 'Dégradé' + (g ? ' ' + g.label.toLowerCase() : '');
      }
      if (c.k === 'unsplash') return 'Photo Unsplash' + (c.by ? ' (' + c.by + ')' : '');
      if (c.k === 'upload') return 'Image importée';
      return 'Image (lien)';
    }

    function coverBtn(iconName, label, run) {
      return h('button', { class: 'dc-cover-btn', type: 'button', onclick: function (e) { e.stopPropagation(); run(e.currentTarget); } }, [icon(iconName), h('span', { text: label })]);
    }

    function paintCover() {
      var box = els.cover;
      var cur = state.current;
      var c = cur && cur.cover;
      repositioning = false;
      box.onpointerdown = null;
      box.textContent = '';
      box.className = 'dc-cover';
      box.style.background = '';
      box.hidden = !c;
      els.page.classList.toggle('has-cover', !!c);
      els.coverAdd.textContent = '';
      if (!cur) return;
      if (!c) {
        els.coverAdd.appendChild(
          h('button', { class: 'dc-cover-ghost', type: 'button', onclick: addCover }, [icon('photo'), h('span', { text: 'Ajouter une couverture' })])
        );
        return;
      }
      var bg = DM().coverBackground(c);
      var isImage = !bg;
      if (bg) box.style.background = bg;
      else {
        var img = h('img', { class: 'dc-cover-img', alt: '', draggable: 'false' });
        var st = DM().coverImageStyle(c);
        img.style.objectPosition = st.objectPosition;
        img.style.transformOrigin = st.transformOrigin;
        img.style.transform = st.transform;
        img.addEventListener('error', function () { box.classList.add('is-broken'); });
        var url = DM().coverImageUrl(c, (global.devicePixelRatio || 1) > 1.5 ? 2400 : 1600);
        if (url) img.src = url;
        else {
          box.classList.add('is-loading');
          DT().coverBlobUrl(t, c).then(
            function (u) {
              box.classList.remove('is-loading');
              if (state.current === cur && cur.cover === c) img.src = u;
            },
            function () {
              box.classList.remove('is-loading');
              box.classList.add('is-broken');
            }
          );
        }
        box.appendChild(img);
        box.appendChild(icon('photo-off', 'dc-cover-broken'));
        var credit = DM().unsplashCredit(c);
        if (credit) {
          box.appendChild(
            h('div', { class: 'dc-cover-credit' }, [
              'Photo : ',
              h('a', { href: credit.profile, target: '_blank', rel: 'noopener noreferrer', text: credit.name }),
              ' / ',
              h('a', { href: credit.site, target: '_blank', rel: 'noopener noreferrer', text: 'Unsplash' }),
            ])
          );
        }
      }
      box.appendChild(
        h('div', { class: 'dc-cover-actions' }, [
          coverBtn('photo', 'Changer', function (btn) { openCoverPicker(btn.getBoundingClientRect()); }),
          isImage ? coverBtn('arrows-move', 'Repositionner', startReposition) : null,
          coverBtn('trash', 'Retirer', function () { setCover(null); }),
        ])
      );
    }

    /** Shows the new cover right away; the write is debounced so trying several swatches costs one save. */
    function setCover(next) {
      var cur = state.current;
      if (!cur) return;
      cur.cover = DM().normalizeCover(next);
      paintCover();
      if (pop && pop.classList.contains('dc-cover-pop') && pop._paint) pop._paint();
      clearTimeout(coverTimer);
      coverCur = cur;
      coverTimer = setTimeout(function () { persistCover(cur); }, 450);
    }

    function flushCover() {
      if (!coverTimer) return;
      clearTimeout(coverTimer);
      persistCover(coverCur);
    }

    function persistCover(cur) {
      coverTimer = null;
      if (!cur) return;
      if (saving) {
        coverTimer = setTimeout(function () { persistCover(cur); }, 200);
        return;
      }
      var pre = state.current === cur ? saveNow() : Promise.resolve(true);
      pre.then(function (ok) {
        if (!ok) return; // conflict / error banner already shown; "Écraser" saves the cover with the text
        if (saving) {
          coverTimer = setTimeout(function () { persistCover(cur); }, 200);
          return;
        }
        var want = cur.cover || null;
        var before = cur.savedCover || null;
        if (DM().sameCover(before, want)) return;
        saving = true;
        if (state.current === cur) setSave('saving');
        DT().setCover(t, cur, want).then(
          function (res) {
            saving = false;
            cur.rev = res.rev;
            cur.updatedAt = res.updatedAt;
            cur.savedCover = res.cover;
            touchListItem(cur.id, { updatedAt: res.updatedAt });
            record({
              type: 'edit', key: 'cover', label: 'Couverture', targetId: cur.id,
              title: DM().cleanTitle(cur.title) || DM().UNTITLED,
              before: coverLabel(before), after: coverLabel(res.cover),
              beforeVal: DM().packCover(before), afterVal: DM().packCover(res.cover),
            });
            if (state.current !== cur) return;
            var dirty = editor && (DM().domToMd(editor) !== lastMd || (DM().cleanTitle(els.title.value) || DM().UNTITLED) !== savedTitle);
            setSave(dirty ? 'dirty' : 'saved');
            if (dirty) scheduleSave(300);
            paintMeta();
          },
          function (err) {
            saving = false;
            if (state.current !== cur) return failure(err);
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
          }
        );
      });
    }

    /** Like Notion: a gallery photo right away, with the picker open to change it. */
    function addCover() {
      setCover(DM().randomCover());
      var btn = els.cover.querySelector('.dc-cover-actions .dc-cover-btn');
      openCoverPicker((btn || els.cover).getBoundingClientRect());
    }

    function startReposition() {
      var cur = state.current;
      var c = cur && cur.cover;
      var box = els.cover;
      var img = box.querySelector('.dc-cover-img');
      if (!c || !img) return;
      closePop();
      repositioning = true;
      var ZMIN = DM().COVER_ZOOM_MIN;
      var ZMAX = DM().COVER_ZOOM_MAX;
      var pos = { px: c.px == null ? 50 : c.px, y: c.y == null ? 50 : c.y, z: c.z || ZMIN };
      box.classList.add('is-repositioning');
      var actions = box.querySelector('.dc-cover-actions');
      actions.textContent = '';
      function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
      }
      /** Rendered photo size at the current zoom (object-fit: cover, then scaled). */
      function geo() {
        var bw = box.clientWidth;
        var bh = box.clientHeight;
        var s = img.naturalWidth ? Math.max(bw / img.naturalWidth, bh / img.naturalHeight) : 0;
        var k = pos.z / 100;
        return { bw: bw, bh: bh, w: s ? img.naturalWidth * s * k : bw * k, h: s ? img.naturalHeight * s * k : bh * k };
      }
      function paint() {
        var at = pos.px + '% ' + pos.y + '%';
        img.style.objectPosition = at;
        img.style.transformOrigin = at;
        img.style.transform = pos.z > ZMIN ? 'scale(' + pos.z / 100 + ')' : '';
        range.value = String(Math.round(pos.z));
      }
      /** Zooms keeping the photo point under (cx, cy) in place; the photo never gets smaller than the banner. */
      function zoomTo(z, cx, cy) {
        var g = geo();
        if (cx == null) { cx = g.bw / 2; cy = g.bh / 2; }
        var fx = (cx - (pos.px / 100) * (g.bw - g.w)) / g.w;
        var fy = (cy - (pos.y / 100) * (g.bh - g.h)) / g.h;
        pos.z = clamp(z, ZMIN, ZMAX);
        var n = geo();
        if (n.w - n.bw > 0.5) pos.px = clamp(((cx - fx * n.w) / (n.bw - n.w)) * 100, 0, 100);
        if (n.h - n.bh > 0.5) pos.y = clamp(((cy - fy * n.h) / (n.bh - n.h)) * 100, 0, 100);
        paint();
      }
      function onWheel(e) {
        e.preventDefault();
        var r = box.getBoundingClientRect();
        zoomTo(pos.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
      }
      function end(save) {
        document.removeEventListener('keydown', onKey, true);
        box.removeEventListener('wheel', onWheel);
        repositioning = false;
        var next = DM().normalizeCover(Object.assign({}, c, { px: Math.round(pos.px), y: Math.round(pos.y), z: Math.round(pos.z) }));
        if (save && state.current === cur && !DM().sameCover(next, c)) setCover(next);
        else paintCover();
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); end(false); }
        else if (e.key === 'Enter') { e.preventDefault(); end(true); }
        else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(pos.z + 20); }
        else if (e.key === '-') { e.preventDefault(); zoomTo(pos.z - 20); }
      }
      var range = h('input', {
        type: 'range', min: String(ZMIN), max: String(ZMAX), step: '1', 'aria-label': 'Zoom',
        oninput: function (e) { zoomTo(Number(e.target.value)); },
      });
      document.addEventListener('keydown', onKey, true);
      box.addEventListener('wheel', onWheel, { passive: false });
      actions.appendChild(
        h('div', { class: 'dc-cover-zoom' }, [
          h('button', { class: 'dc-cover-zoom-btn', type: 'button', title: 'Zoom arrière', 'aria-label': 'Zoom arrière', onclick: function () { zoomTo(pos.z - 20); } }, [icon('zoom-out')]),
          range,
          h('button', { class: 'dc-cover-zoom-btn', type: 'button', title: 'Zoom avant', 'aria-label': 'Zoom avant', onclick: function () { zoomTo(pos.z + 20); } }, [icon('zoom-in')]),
        ])
      );
      actions.appendChild(coverBtn('check', 'Enregistrer', function () { end(true); }));
      actions.appendChild(coverBtn('x', 'Annuler', function () { end(false); }));
      paint();
      box.onpointerdown = function (e) {
        if (!repositioning || e.button !== 0 || (e.target.closest && e.target.closest('.dc-cover-actions'))) return;
        e.preventDefault();
        var sx = e.clientX;
        var sy = e.clientY;
        var start = { px: pos.px, y: pos.y };
        var g = geo();
        var ox = g.w - g.bw;
        var oy = g.h - g.bh;
        if (ox <= 1 && oy <= 1) return;
        try {
          box.setPointerCapture(e.pointerId);
        } catch (err) {
          /* pointer already gone: the drag just ends at the cover edge */
        }
        box.onpointermove = function (ev) {
          if (ox > 1) pos.px = clamp(start.px - ((ev.clientX - sx) / ox) * 100, 0, 100);
          if (oy > 1) pos.y = clamp(start.y - ((ev.clientY - sy) / oy) * 100, 0, 100);
          paint();
        };
        box.onpointerup = box.onpointercancel = function () {
          box.onpointermove = box.onpointerup = box.onpointercancel = null;
        };
      };
    }

    /** Large photos are scaled down before upload (Trello attachments are capped, and covers are wide). */
    function prepareCoverImage(file) {
      return new Promise(function (resolve, reject) {
        var type = String((file && file.type) || '');
        var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[type];
        if (!ext) return reject(new Error('Format non pris en charge (JPG, PNG, WebP ou GIF).'));
        if (ext === 'gif') {
          return file.size <= 10 * 1024 * 1024 ? resolve({ blob: file, ext: ext }) : reject(new Error('Image trop lourde (10 Mo au maximum).'));
        }
        var url = URL.createObjectURL(file);
        var im = new Image();
        im.onload = function () {
          URL.revokeObjectURL(url);
          var max = 2400;
          if (im.naturalWidth <= max && file.size <= 2 * 1024 * 1024) return resolve({ blob: file, ext: ext });
          var scale = Math.min(1, max / im.naturalWidth);
          var cv = document.createElement('canvas');
          cv.width = Math.round(im.naturalWidth * scale);
          cv.height = Math.round(im.naturalHeight * scale);
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          cv.toBlob(function (b) {
            if (!b) return reject(new Error('Image illisible.'));
            resolve({ blob: b, ext: b.type === 'image/webp' ? 'webp' : 'jpg' });
          }, 'image/webp', 0.85);
        };
        im.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('Image illisible.'));
        };
        im.src = url;
      });
    }

    function openCoverPicker(rect) {
      closePop();
      if (!state.current) return;
      var tab = recall(COVER_TAB_KEY);
      if (!COVER_TABS.some(function (x) { return x[0] === tab; })) tab = 'color';
      var tabBar = h('div', { class: 'dc-cover-tabs', role: 'tablist' });
      var body = h('div', { class: 'dc-cover-body' });
      var query = '';
      var searchTimer = null;
      var searchToken = 0;

      function current() {
        return state.current && state.current.cover;
      }

      function swatch(cover, style, label) {
        var on = DM().sameCover(current(), cover);
        var b = h('button', {
          class: 'dc-swatch' + (on ? ' is-on' : ''),
          type: 'button',
          title: label,
          'aria-label': label,
          'aria-pressed': on ? 'true' : 'false',
          onclick: function () { setCover(cover); },
        });
        b.style.background = style;
        return b;
      }

      function paintTabs() {
        tabBar.textContent = '';
        COVER_TABS.forEach(function (x) {
          tabBar.appendChild(
            h('button', {
              class: 'dc-cover-tab' + (x[0] === tab ? ' is-on' : ''),
              type: 'button',
              role: 'tab',
              'aria-selected': x[0] === tab ? 'true' : 'false',
              onclick: function () {
                tab = x[0];
                remember(COVER_TAB_KEY, tab);
                paint();
              },
            }, [x[1]])
          );
        });
      }

      function photoGrid(list, box) {
        box.textContent = '';
        if (!list.length) {
          box.appendChild(h('p', { class: 'dc-cover-none', text: 'Aucune photo.' }));
          return;
        }
        var cur = current();
        list.forEach(function (p) {
          var on = cur && cur.k === 'unsplash' && cur.v === p.v;
          var img = h('img', { alt: '', loading: 'lazy', src: DM().unsplashUrl(p.v, 400, p.x) });
          box.appendChild(
            h('button', {
              class: 'dc-cover-thumb' + (on ? ' is-on' : ''),
              type: 'button',
              title: p.by ? 'Photo : ' + p.by : 'Photo Unsplash',
              onclick: function () { setCover(p); },
            }, [img])
          );
        });
      }

      function runSearch(grid) {
        var token = ++searchToken;
        var local = DM().searchGallery(query);
        if (!query.trim() || !unsplashRemote) return photoGrid(local, grid);
        grid.classList.add('is-loading');
        DT().searchUnsplash(t, query).then(
          function (res) {
            if (token !== searchToken) return;
            grid.classList.remove('is-loading');
            if (res === null) unsplashRemote = false;
            photoGrid(res === null ? local : res, grid);
          },
          function () {
            if (token !== searchToken) return;
            grid.classList.remove('is-loading');
            photoGrid(local, grid);
          }
        );
      }

      function paintUpload() {
        var file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true });
        var err = h('div', { class: 'dc-pop-err', hidden: true });
        var label = h('span', { text: 'Choisir une image' });
        var drop = h('button', { class: 'dc-cover-drop', type: 'button', onclick: function () { file.click(); } }, [icon('upload'), label]);
        function showErr(msg) {
          err.hidden = !msg;
          err.textContent = msg || '';
        }
        function upload(f) {
          if (!f || !state.current) return;
          var cur = state.current;
          showErr('');
          drop.disabled = true;
          drop.classList.add('is-busy');
          label.textContent = 'Envoi…';
          prepareCoverImage(f)
            .then(function (p) { return DT().uploadCover(t, cur.id, p.blob, p.ext); })
            .then(
              function (cover) {
                drop.disabled = false;
                drop.classList.remove('is-busy');
                label.textContent = 'Choisir une image';
                if (state.current === cur) setCover(cover);
              },
              function (e) {
                drop.disabled = false;
                drop.classList.remove('is-busy');
                label.textContent = 'Choisir une image';
                showErr(e && e.reason ? reasonText(e) : (e && e.message) || 'Envoi impossible.');
              }
            );
        }
        file.addEventListener('change', function () { upload(file.files && file.files[0]); });
        drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
        drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
        drop.addEventListener('drop', function (e) {
          e.preventDefault();
          drop.classList.remove('is-over');
          upload(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
        });
        var link = h('input', { class: 'dc-input dc-cover-link', type: 'url', placeholder: 'Coller un lien d’image…', 'aria-label': 'Lien d’une image', spellcheck: 'false' });
        function applyLink() {
          var c = DM().coverFromLink(link.value);
          if (!c) return showErr('Lien non valide (https).');
          showErr('');
          setCover(c);
        }
        link.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
        });
        link.addEventListener('paste', function () { setTimeout(applyLink, 0); });
        body.appendChild(drop);
        body.appendChild(file);
        body.appendChild(h('div', { class: 'dc-cover-or', text: 'ou' }));
        body.appendChild(link);
        body.appendChild(err);
      }

      function paint() {
        paintTabs();
        body.textContent = '';
        body.className = 'dc-cover-body is-' + tab;
        if (tab === 'color') {
          var grid = h('div', { class: 'dc-cover-grid' });
          DM().COVER_COLORS.forEach(function (c) { grid.appendChild(swatch({ k: 'color', v: c.v }, c.v, c.label)); });
          body.appendChild(grid);
        } else if (tab === 'gradient') {
          var grid2 = h('div', { class: 'dc-cover-grid' });
          DM().COVER_GRADIENTS.forEach(function (g) { grid2.appendChild(swatch({ k: 'gradient', v: g.id }, g.css, g.label)); });
          body.appendChild(grid2);
        } else if (tab === 'unsplash') {
          var input = h('input', { class: 'dc-input dc-cover-search', type: 'search', placeholder: 'Rechercher des photos…', 'aria-label': 'Rechercher sur Unsplash', value: query });
          var photos = h('div', { class: 'dc-cover-photos' });
          input.addEventListener('input', function () {
            query = input.value;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () { runSearch(photos); }, 350);
          });
          body.appendChild(input);
          body.appendChild(photos);
          runSearch(photos);
          setTimeout(function () { input.focus(); }, 0);
        } else {
          paintUpload();
        }
      }

      pop = h('div', { class: 'dc-pop dc-cover-pop', role: 'dialog', 'aria-label': 'Couverture' }, [tabBar, body]);
      pop._paint = function () {
        // keep the search results and the upload field: only the selection marks change
        if (tab === 'color' || tab === 'gradient') paint();
        else if (tab === 'unsplash') {
          var cur = current();
          Array.prototype.forEach.call(pop.querySelectorAll('.dc-cover-thumb'), function (b) {
            var img = b.querySelector('img');
            b.classList.toggle('is-on', !!(cur && cur.k === 'unsplash' && img && img.src.indexOf('/' + cur.v + '?') >= 0));
          });
        }
      };
      paint();
      placePop(pop, rect);
    }

    function dialog(opts) {
      return new Promise(function (resolve) {
        var overlay = h('div', { class: 'dc-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title });
        function done(v) {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(v);
        }
        var alt = opts.alt ? h('button', { class: 'dc-btn', type: 'button', onclick: function () { done('alt'); } }, [opts.alt]) : null;
        var cancel = h('button', { class: 'dc-btn', type: 'button', onclick: function () { done(false); } }, [opts.cancel || 'Annuler']);
        var field = opts.input != null ? h('input', { class: 'dc-dialog-input', type: 'text', maxlength: String(DM().MAX_FOLDER_NAME), value: opts.input }) : null;
        var ok = h('button', { class: 'dc-btn ' + (opts.danger ? 'dc-btn--danger' : 'dc-btn--primary'), type: 'button', onclick: function () { done(field ? field.value : true); } }, [opts.ok || 'OK']);
        if (field) field.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); done(field.value); } });
        overlay.appendChild(h('div', { class: 'dc-dialog' }, [
          h('h2', { class: 'dc-dialog-title', text: opts.title }),
          h('p', { class: 'dc-dialog-text', text: opts.text }),
          field,
          h('div', { class: 'dc-dialog-actions' }, [cancel, alt, ok]),
        ]));
        overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(false); });
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) done(false); });
        shell.appendChild(overlay);
        (field || (opts.danger ? cancel : ok)).focus();
      });
    }

    /** Opens another visible document when the current one has just been archived (or shows the empty state). */
    function leaveArchivedDoc() {
      state.current = null;
      remember(LAST_KEY, null);
      showCurrent();
      var next = state.docs.filter(function (x) { return !(state.idx.archived || {})[x.id]; })[0];
      if (next) openDoc(next.id, { skipSave: true });
    }

    /** Archive, not delete: the document is only flagged, it stays in Trello and can be restored. */
    function confirmDelete(docId) {
      var d = state.docs.filter(function (x) { return x.id === docId; })[0];
      if (!d) return;
      var wasCurrent = state.current && state.current.id === docId;
      editFolders(function (idx) { DM().archiveDocIn(idx, docId); }, 'Document archivé.').then(function (ok) {
        if (ok && wasCurrent && !state.showArchived) leaveArchivedDoc();
      });
    }

    function restoreDoc(docId) {
      editFolders(function (idx) { DM().restoreDocIn(idx, docId); }, 'Document restauré.');
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
      if (!has) state.face = null;
      paintProps();
      if (!has) {
        editor = null;
        paintCover();
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
        e.appendChild(authButton());
        return;
      }
      e.appendChild(icon('file-text', 'dc-empty-icon'));
      e.appendChild(h('h2', { text: state.docs.length ? 'Aucun document sélectionné' : 'Aucun document' }));
      e.appendChild(h('button', { class: 'dc-btn dc-btn--primary', onclick: function () { newDoc(); } }, [icon('plus'), 'Nouveau document']));
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
        histFlush();
        return DT().loadDoc(t, id).then(
          function (doc) {
            if (token !== loadToken) return;
            els.page.classList.remove('is-loading');
            state.current = doc;
            histBase(doc);
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

    function newDoc(title, body, folderId, parentDocId, cover) {
      if (state.busy) return;
      var go = state.current ? saveNow() : Promise.resolve(true);
      go.then(function () {
        setBusy('Création du document…');
        DT().createDoc(t, title || DM().UNTITLED, body || '', { cover: cover }).then(
          function (doc) {
            setBusy('');
            toast('');
            record({ type: 'create', targetId: doc.id, title: doc.title });
            state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
            sortDocs();
            state.filter = '';
            els.search.value = '';
            var placed = Promise.resolve();
            if (folderId) {
              setFolderOpen(folderId, true);
              moveDocToFolder(doc.id, folderId);
            } else if (parentDocId) {
              placed = nestDoc(doc.id, parentDocId) || Promise.resolve();
            }
            placed.then(function () {
              openDoc(doc.id, { skipSave: true, focusTitle: !title });
            });
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
        ? Promise.resolve({ title: els.title.value || state.current.title, body: lastDomMd(), cover: state.current.cover })
        : DT().loadDoc(t, docId);
      src.then(function (doc) {
        newDoc(DM().cleanTitle((doc.title || DM().UNTITLED) + ' (copie)'), doc.body, null, null, doc.cover);
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
            var oldTitle = savedTitle;
            savedTitle = r.title;
            cur.title = r.title;
            histRenamed(cur.id, oldTitle, r.title);
            touchListItem(cur.id, { title: r.title });
            syncFolderName(cur.id, r.title);
            if (cur.subject && cur.subject.k === 'project' && DT().syncProjectTitle) {
              DT().syncProjectTitle(t, cur.subject.id, r.title).catch(function () {});
            }
            rebuildIndex();
          });
        });
      }
      if (bodyChanged || opts.force) {
        chain = chain.then(function () {
          var coverAt = cur.cover || null;
          return DT().saveDoc(t, { id: cur.id, body: md, rev: cur.rev, cover: coverAt }, { force: !!opts.force }).then(function (res) {
            cur.rev = res.rev;
            cur.updatedAt = res.updatedAt;
            cur.body = md;
            cur.savedCover = coverAt;
            lastMd = md;
            histBodySaved();
            touchListItem(cur.id, { updatedAt: res.updatedAt, size: md.length });
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
        return DT().ensureFolderDocs(t, docs).then(function (r) { return r.docs; }, function () { return docs; });
      }).then(function (docs) {
        var keep = state.saveState !== 'saved' && state.current ? [state.current.id] : [];
        return DT().ensureProjectDocs
          ? DT().ensureProjectDocs(t, docs, { keepTitles: keep }).then(function (r) { return r.docs; }, function () { return docs; })
          : docs;
      }).then(function (docs) {
        var openId = state.current && state.current.id;
        state.docs = docs;
        state.idx = DT().getFolderIndex();
        paintList();
        rebuildIndex();
        if (!openId) return;
        if (!docs.some(function (d) { return d.id === openId; })) {
          toast('Ce document a été supprimé par quelqu’un d’autre.', 'error');
          return;
        }
        if (state.saveState !== 'saved' || !editor || DM().domToMd(editor) !== lastMd || coverTimer || repositioning) return;
        return DT().loadDoc(t, openId).then(function (doc) {
          if (!state.current || state.current.id !== openId || saving || DM().domToMd(editor) !== lastMd) return;
          if (doc.rev === state.current.rev) return;
          var top = els.scroll.scrollTop;
          state.current = doc;
          histBase(doc);
          savedTitle = doc.title;
          els.title.value = doc.title === DM().UNTITLED ? '' : doc.title;
          buildEditor(doc);
          els.scroll.scrollTop = top;
          toast('Document mis à jour par quelqu’un d’autre.', 'ok');
        }, function () {});
      }, function () {});
    }

    /* ── History panel (Historique) ──────────────────────────────── */

    var HP = null;
    var HIST_MAX_BODY = 6000; // bigger bodies are not kept in the history, so those entries are not undoable
    var editBase = null; // {id, body}: the body as of the last recorded history entry (or load)
    var histTimer = null;

    function record(e) { return HP ? HP.record(e) : e; }

    function histBase(doc) {
      clearTimeout(histTimer);
      editBase = { id: doc.id, body: doc.body || '' };
    }

    /** Autosaves are grouped: one "Contenu modifié" entry per editing burst (45 s idle, document switch, page close). */
    function histBodySaved() {
      clearTimeout(histTimer);
      histTimer = setTimeout(histFlush, 45000);
    }

    function histSummary(a, b) {
      var x = a.split('\n');
      var y = b.split('\n');
      var i = 0;
      while (i < x.length && i < y.length && x[i] === y[i]) i++;
      return { before: x[i] || '', after: y[i] || '' };
    }

    function histFlush() {
      clearTimeout(histTimer);
      if (!editBase || !state.current || state.current.id !== editBase.id) return;
      var now = state.current.body || '';
      if (now === editBase.body) return;
      var s = histSummary(editBase.body, now);
      var keep = editBase.body.length <= HIST_MAX_BODY && now.length <= HIST_MAX_BODY;
      record({
        type: 'edit', key: 'body', label: 'Contenu', targetId: state.current.id,
        title: DM().cleanTitle(state.current.title) || DM().UNTITLED,
        before: s.before, after: s.after,
        beforeVal: keep ? editBase.body : null, afterVal: keep ? now : null,
      });
      editBase.body = now;
    }

    function histRenamed(id, oldTitle, newTitle) {
      if (oldTitle === newTitle) return;
      record({ type: 'edit', key: 'name', targetId: id, title: newTitle, before: oldTitle, after: newTitle, beforeVal: oldTitle, afterVal: newTitle });
    }

    function histDeleted(d, body) {
      record({ type: 'delete', targetId: d.id, title: d.title, beforeBody: body != null && body.length <= HIST_MAX_BODY ? body : null });
      if (editBase && editBase.id === d.id) editBase = null;
    }

    function histAddLocal(doc) {
      state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
      sortDocs();
      paintList();
      rebuildIndex();
    }

    function histDropLocal(id) {
      var wasCurrent = state.current && state.current.id === id;
      state.docs = state.docs.filter(function (x) { return x.id !== id; });
      if (wasCurrent) {
        clearTimeout(saveTimer);
        state.current = null;
        editBase = null;
        remember(LAST_KEY, null);
        showCurrent();
        if (state.docs.length) openDoc(state.docs[0].id, { skipSave: true });
      }
      paintList();
      rebuildIndex();
    }

    function histCanToggle(e) {
      if (e.type === 'delete') return e.beforeBody != null;
      if (e.type === 'edit' && e.key === 'body') return e.beforeVal != null && e.afterVal != null;
      return e.type === 'create' || e.type === 'edit';
    }

    /** Runs the write that moves an entry back to its "before" state (`back`) or forward to its "after" state. */
    function histApply(e, back) {
      var val = back ? e.beforeVal : e.afterVal;
      var id = e.targetId;
      var isCur = !!(state.current && state.current.id === id);
      if (e.type === 'create' || e.type === 'delete') {
        var remove = e.type === 'create' ? back : !back;
        if (remove) {
          var snap = e.type === 'create'
            ? (isCur ? Promise.resolve(lastDomMd()) : DT().loadDoc(t, id).then(function (d) { return d.body; }))
            : Promise.resolve(null);
          return snap.then(function (body) {
            if (e.type === 'create') e.afterBody = body.length <= HIST_MAX_BODY ? body : '';
            return DT().deleteDoc(t, id);
          }).then(function () { histDropLocal(id); });
        }
        return DT().createDoc(t, e.title, (e.type === 'create' ? e.afterBody : e.beforeBody) || '').then(function (doc) {
          e.targetId = doc.id;
          histAddLocal(doc);
        });
      }
      if (e.type === 'edit' && e.key === 'name') {
        return DT().renameDoc(t, id, val).then(function (r) {
          touchListItem(id, { title: r.title });
          if (state.current && state.current.id === id) {
            state.current.title = r.title;
            savedTitle = r.title;
            els.title.value = r.title === DM().UNTITLED ? '' : r.title;
            paintHead();
          }
          rebuildIndex();
        });
      }
      if (e.type === 'edit' && e.key === 'body') {
        var pre = isCur ? saveNow().then(function () { histFlush(); }) : Promise.resolve();
        return pre.then(function () { return DT().loadDoc(t, id); }).then(function (doc) {
          return DT().saveDoc(t, { id: id, body: val, rev: doc.rev, cover: doc.cover }, { force: true });
        }).then(function (res) {
          touchListItem(id, { updatedAt: res.updatedAt, size: String(val || '').length });
          if (isCur) return openDoc(id, { reload: true, skipSave: true });
        });
      }
      if (e.type === 'edit' && e.key === 'cover') {
        var pre2 = isCur ? saveNow() : Promise.resolve();
        return pre2.then(function () { return DT().loadDoc(t, id); }).then(function (doc) {
          return DT().setCover(t, doc, DM().parseCover(val));
        }).then(function (res) {
          touchListItem(id, { updatedAt: res.updatedAt });
          if (state.current && state.current.id === id) {
            state.current.rev = res.rev;
            state.current.cover = res.cover;
            state.current.savedCover = res.cover;
            paintCover();
          }
        });
      }
      return Promise.reject(new Error('Cette modification ne peut pas être annulée'));
    }

    function histVerb(e) {
      if (e.type === 'create') return 'créé';
      if (e.type === 'delete') return 'supprimé';
      if (e.key === 'name') return 'renommé';
      if (e.key === 'cover') return 'couverture modifiée';
      return 'contenu modifié';
    }

    var histBoard = '';
    try { histBoard = (t && typeof t.getContext === 'function' && t.getContext().board) || ''; } catch (e) { /* no context */ }
    HP = global.HistoryPanel.create({
      key: 'tp-docs-history:' + histBoard,
      apply: histApply,
      canToggle: histCanToggle,
      verb: histVerb,
      onStatus: function (m, kind, openHistory) {
        toast(m, kind === 'ok' ? 'ok' : '', kind === 'ok' && openHistory ? { onMessage: openHistory } : null);
      },
      onError: failure,
    });

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

    var selPaint = 0;
    document.addEventListener('selectionchange', function () {
      if (!editor) return;
      saveSel();
      if (selPaint) return;
      selPaint = requestAnimationFrame(function () {
        selPaint = 0;
        if (!editor) return;
        paintToolbarState();
        var sel = global.getSelection();
        if (editor === document.activeElement || (sugg && sel && editor.contains(sel.anchorNode))) updateSuggest();
        updateSelBar();
      });
    });
    document.addEventListener('mousedown', function (e) {
      var inSel = e.target.closest && e.target.closest('.dc-selbar');
      if (pop && !pop.contains(e.target) && !inSel && !(e.target.closest && e.target.closest('.cf-pop, .tp-context-menu'))) closePop();
      if (sugg && !els.suggest.contains(e.target) && !(editor && editor.contains(e.target))) closeSuggest();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closePop();
        if (!editorSelection()) hideSelBar();
      }
    });
    global.addEventListener('resize', function () {
      if (sugg) placeSuggest();
      if (selBar) placeSelBar();
      if (blockHover) showBlockUi(blockHover);
    });
    els.scroll.addEventListener('scroll', function () {
      if (sugg) placeSuggest(); // the caret moved on screen, the popup follows (layout shifts also scroll)
      closePop();
      if (selBar) placeSelBar();
    });
    global.addEventListener('focus', refreshRemote);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') saveNow();
      else refreshRemote();
    });
    global.addEventListener('pagehide', function () {
      histFlush();
      flushCover();
      saveNow();
    });

    buildSide();
    buildToolbar();
    wireBlockUi();
    paintList();
    showCurrent();

    function takeWantedSubject() {
      var sp;
      try { sp = new URLSearchParams(global.location.search); } catch (e) { return null; }
      var task = DM().cleanId(sp.get('docTask'));
      var entity = DM().cleanId(sp.get('docEntity'));
      var project = DM().normalizeSubject({ k: 'project', id: sp.get('docProject') });
      var person = DM().normalizeSubject({ k: 'person', id: sp.get('docPerson') });
      var name = String(sp.get('docName') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      var want = task ? { k: 'task', id: task }
        : entity ? { k: 'entity', id: entity }
        : project ? { k: 'project', id: project.id, name: name }
        : person ? { k: 'person', id: person.id, name: name }
        : null;
      if (!want) return null;
      try {
        var u = new URL(global.location.href);
        u.searchParams.delete('docTask');
        u.searchParams.delete('docEntity');
        u.searchParams.delete('docProject');
        u.searchParams.delete('docPerson');
        u.searchParams.delete('docName');
        global.history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch (e2) { /* the param simply stays in the address */ }
      return want;
    }

    /* Opens the Drive folder once the Sheet worker has one, and pulls Drive edits before the next cron. */
    function loadDrive() {
      var ST = global.SheetsTrello;
      if (!ST || !t || !ST.getSettings) return;
      var settings = null;
      ST.getSettings(t).then(function (s) {
        settings = s;
        if (!ST.isConnected(settings)) return null;
        return ST.info(settings);
      }).then(function (res) {
        if (!res || !res.ok) return null;
        var docs = res.data && res.data.documents;
        if (!docs || !docs.enabled || !docs.folderUrl) return null;
        state.driveUrl = docs.folderUrl;
        if (els.head && !els.driveBtn) {
          els.driveBtn = h('button', {
            class: 'dc-tb',
            type: 'button',
            title: 'Afficher dans Google Drive',
            'aria-label': 'Afficher dans Google Drive',
            onclick: function () { window.open(state.driveUrl, '_blank', 'noopener'); },
          }, [icon('brand-google-drive')]);
          var more = els.head.querySelector('[aria-label="Actions du document"]');
          if (more && more.parentNode) more.parentNode.insertBefore(els.driveBtn, more);
          else els.head.appendChild(els.driveBtn);
        }
        return ST.syncDocuments(settings);
      }).then(function (res) {
        if (!res || !res.ok || !res.data) return;
        var d = res.data;
        if ((d.pulled || 0) + (d.imported || 0) > 0) return refreshRemote(true);
      }).catch(function () { /* Drive is optional */ });
    }

    /* Mindmap-style pins on a task mention. The dot exists only while the pointer is close to that edge. */
    function wireChipPins() {
      var Pins = global.DocsPins;
      if (!Pins || shell._chipPins) return;
      shell._chipPins = true;
      var REACH = 30;
      var HOT = 14;
      var layer = h('div', { class: 'dc-pin-layer' });
      var dots = {};
      Pins.ROLES.forEach(function (r) {
        var dot = h('button', {
          type: 'button',
          class: 'dc-pin dc-pin--' + r.id,
          title: r.label,
          'aria-label': r.label,
          'data-role': r.id,
        });
        dot.hidden = true;
        dots[r.id] = dot;
        dot.addEventListener('pointerdown', function (e) { startDrag(e, r.id); });
        layer.appendChild(dot);
      });
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'dc-pin-wire');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.appendChild(path);
      svg.hidden = true;
      layer.appendChild(svg);
      document.body.appendChild(layer);

      var hoverChip = null;
      var drag = null;
      var pick = null;

      function hideDots() {
        Pins.ROLES.forEach(function (r) {
          var dot = dots[r.id];
          dot.hidden = true;
          dot.classList.remove('is-near', 'is-hot');
        });
      }

      function placeDot(role, x, y, hot) {
        var dot = dots[role];
        dot.hidden = false;
        dot.style.left = x + 'px';
        dot.style.top = y + 'px';
        dot.classList.add('is-near');
        dot.classList.toggle('is-hot', !!hot);
      }

      function showNear(x, y) {
        hideDots();
        hoverChip = null;
        if (!editor) return;
        var best = null;
        Array.prototype.forEach.call(editor.querySelectorAll('.dc-mention--task'), function (chip) {
          var rect = chip.getBoundingClientRect();
          if (x < rect.left - 48 || x > rect.right + 48 || y < rect.top - 48 || y > rect.bottom + 48) return;
          var n = Pins.nearest(rect, x, y, REACH, HOT);
          if (n && (!best || n.d < best.d)) best = { chip: chip, rect: rect, d: n.d };
        });
        if (!best) return;
        hoverChip = best.chip;
        Pins.visible(best.rect, x, y, REACH, HOT).forEach(function (p) {
          placeDot(p.role, p.x, p.y, p.hot);
        });
      }

      function drawWire(x, y) {
        var x1 = drag.x;
        var y1 = drag.y;
        var c1x = x1 + drag.nx * 36;
        var c1y = y1 + drag.ny * 36;
        path.setAttribute('d', 'M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + x.toFixed(1) + ',' + y.toFixed(1) + ' ' + x.toFixed(1) + ',' + y.toFixed(1));
        path.setAttribute('stroke', drag.role === 'person' ? 'var(--dc-person)' : 'var(--dc-task)');
      }

      function onMove(e) {
        if (pick || !editor) return;
        if (drag) { drawWire(e.clientX, e.clientY); return; }
        showNear(e.clientX, e.clientY);
      }

      function startDrag(e, roleId) {
        if (e.button !== 0 || !hoverChip) return;
        e.preventDefault();
        e.stopPropagation();
        clearTimeout(previewTimer);
        if (!previewPinned) closePop();
        var role = Pins.roleById(roleId);
        var dot = dots[roleId];
        drag = {
          role: roleId,
          chip: hoverChip,
          fromId: hoverChip.getAttribute('data-id'),
          x: parseFloat(dot.style.left),
          y: parseFloat(dot.style.top),
          nx: role.nx,
          ny: role.ny,
          sx: e.clientX,
          sy: e.clientY,
        };
        svg.hidden = false;
        layer.classList.add('is-wiring');
        try { dot.setPointerCapture(e.pointerId); } catch (err) {}
        drawWire(e.clientX, e.clientY);
      }

      function endDrag(e) {
        if (!drag) return;
        var d = drag;
        var moved = Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy);
        drag = null;
        svg.hidden = true;
        layer.classList.remove('is-wiring');
        hideDots();
        if (moved < 8) return;
        var hit = dropTarget(d, e.clientX, e.clientY);
        if (hit) commit(d, hit);
        else openPick(d, e.clientX, e.clientY);
      }

      function dropTarget(d, x, y) {
        var stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
        var i;
        for (i = 0; i < stack.length; i++) {
          var el = stack[i];
          if (!el || !el.closest || !editor.contains(el)) continue;
          if (d.role === 'person') {
            var person = el.closest('.dc-mention[data-m="person"]');
            if (person) return { id: person.getAttribute('data-id') };
          } else {
            var task = el.closest('.dc-mention--task');
            if (task && task !== d.chip) return { id: task.getAttribute('data-id') };
          }
        }
        return null;
      }

      function commit(d, hit) {
        if (d.role === 'person') linkPerson(d.fromId, hit.id);
        else linkTasks(d.role, d.fromId, hit.id);
      }

      function linkTasks(role, fromId, toId) {
        var spec = Pins.taskWrite(role, fromId, toId);
        var PT = global.PriorityTrello;
        if (!spec || !PT || typeof PT.getCardInputsById !== 'function' || typeof PT.saveCardInputsById !== 'function') {
          toast('Lien impossible.', 'error');
          return;
        }
        PT.getCardInputsById(t, spec.cardId).then(function (inputs) {
          var next = Pins.appendDep(inputs && inputs.dependsOn, inputs && inputs.depTypes, spec.addId, spec.depType, spec.cardId);
          if (!next) return;
          if (!next.changed) { toast('Déjà lié.', 'ok'); return; }
          return PT.saveCardInputsById(t, spec.cardId, { dependsOn: next.dependsOn, depTypes: next.depTypes }).then(function () {
            toast(role === 'parent' ? 'Tâche parente liée.' : 'Tâche voisine liée.', 'ok');
          });
        }).catch(function (err) { failure(err); });
      }

      function linkPerson(cardId, personId) {
        var item = state.index && DM().resolveMention(state.index, 'person', personId);
        if (item && item.contact) { toast('Membre du tableau seulement.', 'error'); return; }
        var api = DT();
        if (!api || typeof api.loadCardFace !== 'function' || typeof api.setCardMembers !== 'function') {
          toast('Lien impossible.', 'error');
          return;
        }
        api.loadCardFace(t, cardId).then(function (face) {
          var next = Pins.appendMember((face.members || []).map(function (m) { return m.id; }), personId);
          if (!next) return;
          if (!next.changed) { toast('Déjà responsable.', 'ok'); return; }
          return api.setCardMembers(t, cardId, next.ids).then(function () {
            toast('Responsable ajouté.', 'ok');
          });
        }).catch(function (err) { failure(err); });
      }

      function closePick() {
        document.removeEventListener('mousedown', onPickOut, true);
        if (pick && pick.parentNode) pick.parentNode.removeChild(pick);
        pick = null;
      }

      function onPickOut(e) {
        if (pick && !pick.contains(e.target)) closePick();
      }

      function openPick(d, x, y) {
        closePick();
        var role = Pins.roleById(d.role);
        var box = h('div', { class: 'dc-suggest dc-pin-pick' });
        var input = h('input', { class: 'dc-input', type: 'text', placeholder: role.label + '…', 'aria-label': role.label });
        var list = h('div');
        box.appendChild(input);
        box.appendChild(list);
        var matches = [];
        var active = 0;
        function pool() {
          var idx = state.index;
          if (!idx) return [];
          var src = role.kind === 'person' ? (idx.person || []) : (idx.task || []);
          return src.filter(function (it) {
            if (role.kind === 'person' && it.contact) return false;
            if (role.kind === 'task' && it.id === d.fromId) return false;
            return true;
          });
        }
        function paint() {
          var q = input.value.trim().toLowerCase();
          matches = pool().filter(function (it) {
            return !q || String(it.label || '').toLowerCase().indexOf(q) >= 0;
          }).slice(0, 8);
          if (active >= matches.length) active = 0;
          list.textContent = '';
          matches.forEach(function (it, i) {
            var row = h('div', { class: 'dc-sg-row' + (i === active ? ' is-active' : ''), role: 'option' });
            row.appendChild(h('span', { class: 'dc-sg-label', text: it.label }));
            row.addEventListener('mousedown', function (ev) {
              ev.preventDefault();
              choose(it);
            });
            list.appendChild(row);
          });
        }
        function choose(it) {
          var from = d.fromId;
          var roleId = d.role;
          closePick();
          if (roleId === 'person') linkPerson(from, it.id);
          else linkTasks(roleId, from, it.id);
        }
        input.addEventListener('input', paint);
        input.addEventListener('keydown', function (ev) {
          ev.stopPropagation();
          if (ev.key === 'Escape') { ev.preventDefault(); closePick(); }
          else if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && matches.length) {
            ev.preventDefault();
            active = ev.key === 'ArrowDown' ? (active + 1) % matches.length : (active - 1 + matches.length) % matches.length;
            paint();
          } else if (ev.key === 'Enter' && matches[active]) {
            ev.preventDefault();
            choose(matches[active]);
          }
        });
        document.body.appendChild(box);
        box.style.left = Math.max(8, Math.min(x, global.innerWidth - 268)) + 'px';
        box.style.top = Math.max(8, Math.min(y + 8, global.innerHeight - 220)) + 'px';
        pick = box;
        paint();
        input.focus();
        setTimeout(function () { document.addEventListener('mousedown', onPickOut, true); }, 0);
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', endDrag);
      document.addEventListener('pointercancel', function () {
        drag = null;
        svg.hidden = true;
        layer.classList.remove('is-wiring');
        hideDots();
      });
      document.addEventListener('scroll', function () { if (!drag) hideDots(); }, true);
    }

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
        }).then(function (docs) {
          return DT().ensureFolderDocs(t, docs).then(function (r) { return r.docs; }, function () { return docs; });
        }).then(function (docs) {
          return DT().ensureProjectDocs
            ? DT().ensureProjectDocs(t, docs).then(function (r) { return r.docs; }, function () { return docs; })
            : docs;
        }).then(
          function (docs) {
            state.docs = docs;
            state.idx = DT().getFolderIndex();
            state.docsLoaded = true;
            paintList();
            rebuildIndex();
            loadDrive();
            var want = takeWantedSubject();
            if (want) {
              var existing = DM().docForSubject(docs, want.k, want.id);
              if (existing) return openDoc(existing.id, { skipSave: true });
              return DT().ensureSubjectDoc(t, want.k, want.id, want.name).then(function (r) {
                state.docs = r.docs;
                state.idx = DT().getFolderIndex();
                paintList();
                return openDoc(r.doc.id, { skipSave: true });
              }, function (err) {
                failure(err);
              });
            }
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
      }).then(endBoot, endBoot);
    }

    /** The page placeholder stays until the first document is open (or the load failed). */
    function endBoot() {
      shell.classList.remove('is-booting');
    }

    boot();

    if (global.AssistantDock) {
      global.AssistantDock.mount({
        t: t,
        after: root,
        onRefresh: function () { refreshRemote(true); },
        isBusy: function () {
          var ae = document.activeElement;
          var typing = ae && root.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
          return !!typing || saving || (global.CardFields && global.CardFields.isOpen());
        },
      });
    }

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
