/*
 * Role: global command palette (Ctrl+K / Cmd+K) shared by the card views. One searchable list that
 * mixes the project views, the view's own actions and its cards, so a card is found and opened, and a
 * view is reached, without the mouse. It is built on LinearPick, so it looks and behaves like the S/P/D pickers.
 *
 *   CommandPalette.attach({
 *     cards() -> [{ id, name, hint? }],      // hint: a short second line, e.g. the list name
 *     onCard(id),                             // open the card in the current view
 *     actions() -> [{ label, icon, run }],    // optional: actions of the current view
 *     isBusy() -> bool,                       // optional: an inline editor is open
 *   }) -> detach()
 *
 * buildItems is exported for unit tests.
 */
(function (global) {
  'use strict';

  var MAX_CARDS = 1200;

  /** Palette entries: views first, then actions, then cards (capped so a huge board stays fast). */
  function buildItems(views, actions, cards, activeKey) {
    var out = [];
    (views || []).forEach(function (v) {
      if (v.key === activeKey) return;
      out.push({ id: 'view:' + v.key, label: 'Aller à ' + v.label, icon: v.icon });
    });
    (actions || []).forEach(function (a, i) {
      out.push({ id: 'act:' + i, label: a.label, icon: a.icon || 'bolt' });
    });
    (cards || []).slice(0, MAX_CARDS).forEach(function (c) {
      if (!c || !c.id) return;
      out.push({ id: 'card:' + c.id, label: c.name || 'Sans titre', icon: 'cards', hint: c.hint || undefined });
    });
    return out;
  }

  function activeViewKey(loc) {
    var m = /\/([a-z]+)\.html$/.exec((loc && loc.pathname) || '');
    return m ? m[1] : '';
  }

  function attach(o) {
    function open() {
      var LP = global.LinearPick;
      if (!LP || LP.isOpen()) return;
      if (typeof o.isBusy === 'function' && o.isBusy()) return;
      var VT = global.ViewTabs;
      var views = (VT && VT.VIEWS) || [];
      var actions = typeof o.actions === 'function' ? o.actions() || [] : [];
      var items = buildItems(views, actions, typeof o.cards === 'function' ? o.cards() : [], activeViewKey(global.location));
      LP.open({
        anchor: { x: Math.max(8, ((global.innerWidth || 800) - 460) / 2), y: 72 },
        digits: false,
        wide: true,
        placeholder: 'Chercher une carte, une vue, une action…',
        items: items,
        onPick: function (it) {
          var kind = it.id.slice(0, it.id.indexOf(':'));
          var key = it.id.slice(kind.length + 1);
          if (kind === 'card') return typeof o.onCard === 'function' && o.onCard(key);
          if (kind === 'act') return actions[Number(key)] && actions[Number(key)].run();
          var v = views.filter(function (x) { return x.key === key; })[0];
          if (v && VT) global.location.assign(VT.hrefFor(v.page, global.location));
        },
      });
    }
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || String(e.key).toLowerCase() !== 'k') return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      open();
    }
    document.addEventListener('keydown', onKey);
    return function detach() { document.removeEventListener('keydown', onKey); };
  }

  global.CommandPalette = { attach: attach, buildItems: buildItems, activeViewKey: activeViewKey };
})(typeof window !== 'undefined' ? window : this);
