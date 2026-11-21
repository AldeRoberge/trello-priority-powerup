/*
 * Role: top tab strip that switches between the project views (Gantt, Table, Kanban, Documents, Entities) inside the same
 * Trello modal. Switching navigates the iframe to the sibling page and keeps the query/hash that
 * carry the Trello iframe context, so the handshake works on the new page.
 *
 *   ViewTabs.mount(el, { active: 'dashboard' | 'gantt' | 'table' | 'kanban' | 'mindmap' | 'journey' | 'docs' | 'entities' | 'assistant' | 'settings' | 'task' } — one list (VIEWS) for every page; add a view there only)
 *     UTILS[0] (Assistant) is a labelled tab after Dashboard; Settings is a labelled tab after the views. The task page (popup.html) passes
 *     { active: 'task', task: true, fixed: true, resolveCardId }: a first "Tâche" tab, and the views open on (and highlight) that card.
 */
(function (global) {
  'use strict';

  var VIEWS = [
    { key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', page: './dashboard.html' },
    { key: 'gantt', label: 'Gantt', icon: 'timeline', page: './gantt.html' },
    { key: 'table', label: 'Tableau', icon: 'table', page: './table.html' },
    { key: 'kanban', label: 'Kanban', icon: 'layout-kanban', page: './kanban.html' },
    { key: 'mindmap', label: 'Mindmap', icon: 'hierarchy-2', page: './mindmap.html' },
    { key: 'journey', label: 'Parcours', icon: 'route', page: './journey.html' },
    { key: 'docs', label: 'Documents', icon: 'file-text', page: './docs.html' },
    { key: 'keep', label: 'Notes', icon: 'notes', page: './keep.html' },
    { key: 'entities', label: 'Entités', icon: 'stack-2', page: './entities.html' },
  ];

  /** Icon-only pages pinned to the right of the strip (not views): the full AI chat and the settings. */
  var UTILS = [
    { key: 'assistant', label: 'Assistant', icon: 'message-chatbot', page: './assistant.html' },
    { key: 'settings', label: 'Paramètres', icon: 'settings', page: './settings.html' },
  ];

  /** The open task (card): the first tab on the task page only, not a view. */
  var TASK = { key: 'task', label: 'Tâche', icon: 'checkbox', page: './popup.html' };

  /** URL of a sibling page carrying over the current search + hash (pure; used by tests). */
  function hrefFor(page, loc) {
    var u = new URL(page, loc.href);
    u.search = loc.search || '';
    u.hash = loc.hash || '';
    return u.href;
  }

  /** The search icon of the tab strip. QuickFind (projects, tasks, documents, entities, "ask the assistant") when loaded, else the palette. */
  function searchButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'vt-util vt-search';
    b.title = 'Chercher';
    b.setAttribute('aria-label', 'Chercher');
    var i = document.createElement('i');
    i.className = 'ti ti-search';
    b.appendChild(i);
    b.addEventListener('click', function () {
      var QF = global.QuickFind;
      if (QF && typeof QF.request === 'function') return QF.request();
      if (global.CommandPalette) global.CommandPalette.open();
    });
    return b;
  }

  function mount(container, opts) {
    if (!container) return null;
    var active = (opts && opts.active) || '';
    container.textContent = '';
    container.classList.add('vt-bar');
    var nav = document.createElement('nav');
    nav.className = 'vt-tabs';
    nav.setAttribute('role', 'tablist');
    var utils = document.createElement('div');
    utils.className = 'vt-utils';
    var resolveCardId = opts && typeof opts.resolveCardId === 'function' ? opts.resolveCardId : null;
    if (opts && opts.fixed) container.classList.add('vt-bar--fixed');

    function link(v, cls, withLabel) {
      var a = document.createElement('a');
      a.className = cls + (v.key === active ? ' is-on' : '');
      a.setAttribute('role', 'tab');
      a.setAttribute('aria-selected', v.key === active ? 'true' : 'false');
      a.title = v.label;
      a.setAttribute('aria-label', v.label);
      a.href = hrefFor(v.page, global.location);
      var i = document.createElement('i');
      i.className = 'ti ti-' + v.icon;
      a.appendChild(i);
      if (withLabel) a.appendChild(document.createTextNode(v.label));
      a.addEventListener('click', function (e) {
        if (v.key === active) return e.preventDefault();
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
        e.preventDefault();
        try {
          var mode = document.documentElement.getAttribute('data-color-mode');
          var key =
            (global.PriorityTrello && global.PriorityTrello.COLOR_MODE_STORAGE_KEY) ||
            'trello-priority-powerup/color-mode';
          if ((mode === 'dark' || mode === 'light') && global.localStorage) {
            global.localStorage.setItem(key, mode);
          }
        } catch (err) {
          /* storage unavailable */
        }
        container.classList.add('is-leaving');
        if (v.key === 'docs') {
          var isoHref = isolationDocsHref();
          if (isoHref) return global.location.assign(isoHref);
        }
        if (!resolveCardId || VIEWS.indexOf(v) < 0) return global.location.assign(a.href);
        // From the task page: open the view on this card.
        Promise.resolve()
          .then(resolveCardId)
          .then(
            function (id) {
              global.location.assign(id ? hrefForCard(v.page, global.location, id) : a.href);
            },
            function () {
              global.location.assign(a.href);
            }
          );
      });
      return a;
    }

    if (opts && opts.task) nav.appendChild(link(TASK, 'vt-tab', true));
    VIEWS.forEach(function (v) {
      nav.appendChild(link(v, 'vt-tab', true));
      // The Assistant is a labelled tab right after the Dashboard (it is not a view of the cards).
      if (v.key === 'dashboard') nav.appendChild(link(UTILS[0], 'vt-tab', true));
    });
    // Touch has no Ctrl+F: a search button (shown on phones by view-tabs.css) opens the same search. Pages
    // without a palette (Assistant, Réglages) have nothing to search, so they get no button.
    if (global.CommandPalette && typeof global.CommandPalette.open === 'function') utils.appendChild(searchButton());
    // Settings is a labelled tab after the views, like Kanban and Documents.
    UTILS.slice(1).forEach(function (v) {
      nav.appendChild(link(v, 'vt-tab', true));
    });
    if (global.Isolation && typeof global.Isolation.mountChip === 'function') global.Isolation.mountChip(utils);
    if (global.Isolation && typeof global.Isolation.observe === 'function' && global.document && global.document.body) {
      global.Isolation.observe(global.document.body);
    }
    container.appendChild(nav);
    container.appendChild(utils);
    var on = container.querySelector('.is-on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return nav;
  }

  /** URL of a view page that opens on (and highlights) one card. */
  function hrefForCard(page, loc, cardId) {
    var u = new URL(page, loc.href);
    var sp = new URLSearchParams(loc.search || '');
    sp.set('hl', cardId);
    u.search = '?' + sp.toString();
    u.hash = loc.hash || '';
    return u.href;
  }

  /** Documents URL for the active isolation, or '' when nothing is isolated. */
  function isolationDocsHref() {
    var Iso = global.Isolation;
    if (!Iso || typeof Iso.docTarget !== 'function' || !global.location) return '';
    var target = Iso.docTarget();
    if (!target || !target.kind || !target.id) return '';
    return hrefForSubject('./docs.html', global.location, target.kind, target.id, target.name || '');
  }

  /**
   * URL that opens the document page of a task (`docTask`), an entity (`docEntity`),
   * a project (`docProject`) or a person (`docPerson`). `name` titles a new project or person page.
   * Pointing at Entités with kind `entity` selects that entity (`entity`) instead.
   */
  function hrefForSubject(page, loc, kind, id, name) {
    var u = new URL(page, loc.href);
    var sp = new URLSearchParams(loc.search || '');
    sp.delete('docTask');
    sp.delete('docEntity');
    sp.delete('docProject');
    sp.delete('docPerson');
    sp.delete('docName');
    sp.delete('entity');
    var docs = /\/docs\.html$/.test(u.pathname) || u.pathname === 'docs.html';
    var entities = /\/entities\.html$/.test(u.pathname) || u.pathname === 'entities.html';
    if (kind === 'entity' && entities) sp.set('entity', id);
    else if (kind === 'entity') sp.set('docEntity', id);
    else if (kind === 'project') {
      sp.set('docProject', id);
      if (name) sp.set('docName', name);
    } else if (kind === 'person') {
      sp.set('docPerson', id);
      if (name) sp.set('docName', name);
    } else sp.set('docTask', id);
    var q = sp.toString();
    u.search = q ? '?' + q : '';
    u.hash = loc.hash || '';
    return u.href;
  }

  /** Leave the current view for the full document page of a task, an entity, a project or a person. */
  function openSubjectBig(kind, id, name) {
    if (!id || !global.location) return;
    global.location.assign(hrefForSubject('./docs.html', global.location, kind, id, name || ''));
  }

  /**
   * A document opens as a popup first: the Documents page in a frame, without its chrome (?embed=1).
   * "Ouvrir en grand" leaves for the full page. Documents itself, and a page with no room for a frame, go straight to the big view.
   */
  function openSubject(kind, id, name) {
    if (!id || !global.location) return;
    var onDocs = /\/docs(\.html)?$/.test(global.location.pathname);
    if (onDocs || !global.document || !global.document.body || typeof global.document.createElement !== 'function') return openSubjectBig(kind, id, name);
    var old = global.document.querySelector('.vt-docpop');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var src = new URL(hrefForSubject('./docs.html', global.location, kind, id, name || ''));
    src.searchParams.set('embed', '1');
    var wrap = global.document.createElement('div');
    wrap.className = 'vt-docpop';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Document');
    var card = global.document.createElement('div');
    card.className = 'vt-docpop-card';
    var bar = global.document.createElement('div');
    bar.className = 'vt-docpop-bar';
    function btn(icon, label, fn) {
      var b = global.document.createElement('button');
      b.type = 'button';
      b.className = 'vt-docpop-btn';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = '<i class="ti ti-' + icon + '" aria-hidden="true"></i>';
      b.addEventListener('click', fn);
      return b;
    }
    function close() {
      global.document.removeEventListener('keydown', onKey, true);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    }
    var grow = global.document.createElement('span');
    grow.className = 'vt-docpop-grow';
    bar.appendChild(grow);
    bar.appendChild(btn('arrows-maximize', 'Ouvrir en grand', function () { close(); openSubjectBig(kind, id, name); }));
    bar.appendChild(btn('x', 'Fermer', close));
    var frame = global.document.createElement('iframe');
    frame.className = 'vt-docpop-frame';
    frame.title = 'Document';
    frame.src = src.href;
    card.appendChild(bar);
    card.appendChild(frame);
    wrap.appendChild(card);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    global.document.addEventListener('keydown', onKey, true);
    global.document.body.appendChild(wrap);
  }

  /** Leave the current view for a document by id: Documents reopens the last document it showed. */
  function openDoc(id) {
    if (!id || !global.location) return;
    try { global.localStorage.setItem('cerveau.docs.last', String(id)); } catch (e) { /* Documents opens its usual page */ }
    global.location.assign(new URL('./docs.html', global.location.href).href);
  }

  /** "Ouvrir dans" targets: view key, label, icon. Documents opens the task's document. */
  var OPEN_IN = [
    { key: 'mindmap', label: 'Mindmap', icon: 'hierarchy-2' },
    { key: 'gantt', label: 'Gantt', icon: 'timeline' },
    { key: 'docs', label: 'Documents', icon: 'file-text' },
  ];

  /** Leave the current view for another one, centred on a card. */
  function openIn(key, cardId) {
    if (!cardId || !global.location) return;
    if (key === 'docs') return openSubject('task', cardId);
    var view = VIEWS.filter(function (v) { return v.key === key; })[0];
    if (view) global.location.assign(hrefForCard(view.page, global.location, cardId));
  }

  /**
   * Highlight the card named by ?hl= : scroll its row into view and pulse it.
   * rowSelector(cardId) returns a CSS selector; the grid re-renders as data loads, so poll for a while.
   */
  function highlightFromUrl(rowSelector) {
    var id = new URLSearchParams(global.location.search).get('hl');
    if (!id) return;
    var scrolled = false;
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      var el = null;
      try {
        el = document.querySelector(rowSelector(id.replace(/["\\]/g, '')));
      } catch (e) {}
      if (el) {
        el.classList.add('vt-highlight');
        if (!scrolled) {
          scrolled = true;
          if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
        }
      }
      if (tries > 40) clearInterval(timer);
    }, 250);
  }

  global.ViewTabs = {
    mount: mount,
    hrefFor: hrefFor,
    hrefForCard: hrefForCard,
    hrefForSubject: hrefForSubject,
    openSubject: openSubject,
    openSubjectBig: openSubjectBig,
    openDoc: openDoc,
    openIn: openIn,
    OPEN_IN: OPEN_IN,
    highlightFromUrl: highlightFromUrl,
    VIEWS: VIEWS,
    UTILS: UTILS,
    TASK: TASK,
  };
})(typeof window !== 'undefined' ? window : this);
