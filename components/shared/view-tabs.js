/*
 * Role: top tab strip that switches between the project views (Gantt, Table, Kanban, Documents, Entities) inside the same
 * Trello modal. Switching navigates the iframe to the sibling page and keeps the query/hash that
 * carry the Trello iframe context, so the handshake works on the new page.
 *
 *   ViewTabs.mount(el, { active: 'gantt' | 'table' | 'kanban' | 'mindmap' | 'docs' | 'entities' } — one list (VIEWS) for every page; add a view there only)
 */
(function (global) {
  'use strict';

  var VIEWS = [
    { key: 'gantt', label: 'Gantt', icon: 'timeline', page: './gantt.html' },
    { key: 'table', label: 'Tableau', icon: 'table', page: './table.html' },
    { key: 'kanban', label: 'Kanban', icon: 'layout-kanban', page: './kanban.html' },
    { key: 'mindmap', label: 'Mindmap', icon: 'hierarchy-2', page: './mindmap.html' },
    { key: 'docs', label: 'Documents', icon: 'file-text', page: './docs.html' },
    { key: 'entities', label: 'Entités', icon: 'stack-2', page: './entities.html' },
  ];

  /** URL of a sibling page carrying over the current search + hash (pure; used by tests). */
  function hrefFor(page, loc) {
    var u = new URL(page, loc.href);
    u.search = loc.search || '';
    u.hash = loc.hash || '';
    return u.href;
  }

  function mount(container, opts) {
    if (!container) return null;
    var active = (opts && opts.active) || '';
    container.textContent = '';
    container.classList.add('vt-bar');
    var nav = document.createElement('nav');
    nav.className = 'vt-tabs';
    nav.setAttribute('role', 'tablist');
    VIEWS.forEach(function (v) {
      var a = document.createElement('a');
      a.className = 'vt-tab' + (v.key === active ? ' is-on' : '');
      a.setAttribute('role', 'tab');
      a.setAttribute('aria-selected', v.key === active ? 'true' : 'false');
      a.title = v.label;
      a.href = hrefFor(v.page, global.location);
      var i = document.createElement('i');
      i.className = 'ti ti-' + v.icon;
      a.appendChild(i);
      a.appendChild(document.createTextNode(v.label));
      a.addEventListener('click', function (e) {
        if (v.key === active) return e.preventDefault();
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
        e.preventDefault();
        container.classList.add('is-leaving');
        global.location.assign(a.href);
      });
      nav.appendChild(a);
    });
    container.appendChild(nav);
    var on = nav.querySelector('.is-on');
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
    highlightFromUrl: highlightFromUrl,
    VIEWS: VIEWS,
  };
})(typeof window !== 'undefined' ? window : this);
