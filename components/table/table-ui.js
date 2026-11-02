/*
 * Role: UI of the Table view — a spreadsheet-like grid of the board's cards.
 *  - click an Objet to rename it in place (F2 / Enter too); the card opens from the ↗ button in the row gutter
 *  - Statut cells are colored pills; clicking one opens a menu of the board's lists with icons
 *  - sortable headers (faint arrows on hover), filter, drag-to-reorder, column picker
 *  - right-click anywhere: context menu adapted to what is under the mouse
 * Data + writes: TableTrello; pure helpers: TableModel; menus: TableMenu. Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var S = (global.TableUiParts = global.TableUiParts || {});

  var TM = function () {
    return global.TableModel;
  };
  var TT = function () {
    return global.TableTrello;
  };
  var SH = function () {
    return global.SheetsTrello;
  };
  var MENU = function () {
    return global.TableMenu;
  };

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
    return h('i', { class: 'ti ti-' + name + (cls ? ' ' + cls : '') });
  }

  function btn(iconName, label, opts) {
    opts = opts || {};
    return h(
      'button',
      {
        class: 'tb-btn' + (opts.primary ? ' tb-btn--primary' : '') + (opts.active ? ' is-active' : '') + (label ? '' : ' tb-btn--icon'),
        title: opts.title || label || null,
        onclick: opts.onclick,
      },
      [icon(iconName), label ? h('span', { text: label }) : null]
    );
  }

  function mount(root, t) {
    var M = Object.create(null);
    M.root = root;
    M.t = t;
    if (global.Timers) global.Timers.ensure(t);
    var __parts = (global.TableUiPartsMountMount || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  global.TableUI = { mount: mount };

  // shared with the mount parts
  S.MENU = MENU;
  S.SH = SH;
  S.TM = TM;
  S.TT = TT;
  S.btn = btn;
  S.h = h;
  S.icon = icon;
  S.mount = mount;
})(typeof window !== 'undefined' ? window : this);
