/*
 * Role: UI of the Document view, a Google-Docs-like editor for the board's documents.
 *  - left: the board's documents (search, new, duplicate, export, delete); right: outline of the headings
 *  - toolbar (marks, color, highlight, align) + keyboard shortcuts + Markdown shortcuts + "/" (tables, callouts)
 *  - each line is a block: the left handle drags it, turns it into another type, or adds one (including a picture)
 *  - typing ** * ~~ == ++ ` renders the mark; the signs show again while the caret is in the word. [[ links a document
 *  - the link button and Ctrl+K search documents; the selected words stay. A pasted address stays a web link
 *  - "@" mentions: @ people (and everything), @@ tasks, @@@ documents; an unknown name can be created; chips open the card / document
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

  var S = (global.DocsUiParts = global.DocsUiParts || {});

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
    var M = Object.create(null);
    M.root = root;
    M.t = t;
    var __parts = (global.DocsUiPartsMountMount || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  global.DocsUI = { mount: mount, COMMANDS: COMMANDS };

  // shared with the mount parts
  S.BLOCK_SEL = BLOCK_SEL;
  S.COMMANDS = COMMANDS;
  S.DH = DH;
  S.DL = DL;
  S.DM = DM;
  S.DT = DT;
  S.INK_LABELS = INK_LABELS;
  S.LAST_KEY = LAST_KEY;
  S.OPEN_KEY = OPEN_KEY;
  S.REFRESH_MIN_MS = REFRESH_MIN_MS;
  S.SAVE_DELAY_MS = SAVE_DELAY_MS;
  S.SORT_KEY = SORT_KEY;
  S.SORT_LABELS = SORT_LABELS;
  S.SP = SP;
  S.escHtml = escHtml;
  S.h = h;
  S.icon = icon;
  S.isAuthReason = isAuthReason;
  S.loadOpenFolders = loadOpenFolders;
  S.loadSort = loadSort;
  S.mount = mount;
  S.reasonText = reasonText;
  S.recall = recall;
  S.remember = remember;
  S.sizeLabel = sizeLabel;
})(typeof window !== 'undefined' ? window : this);
