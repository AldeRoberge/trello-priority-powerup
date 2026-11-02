/*
 * Role: the Aujourd'hui page of the Dashboard.
 *   Hero      greeting, how the day stands, and the weather (sky, now, next hours, next days)
 *   À faire   what to do now, late work, today's tasks, quick add, work worth pulling in, the revue,
 *             and the week's completed-work recap (Bilan de la semaine)
 *   Planning  the day on a clock: tasks with a time sit at that time, the others are laid out from now
 *             (dashed) and become real with "Planifier ma journée". Drag to move, drag the bottom edge to
 *             resize, click an empty hour to add a task there.
 * Logic is in TodayModel (pure); the weather in Weather / WeatherUI. Every write goes through the helpers
 * dashboard-ui.js hands over (`api`), so the right-click menu, undo and Trello writes stay in one place.
 * The page is a board of widgets (TodayModel.layout). Modifier starts off; while it is on, widgets can be moved, resized, closed and renamed.
 * Exposes window.TodayUI.create(api) → { render(container) }. Styles: today-ui.css (prefix td-).
 */
(function (global) {
  'use strict';

  var S = (global.TodayUiParts = global.TodayUiParts || {});

  var NS = 'http://www.w3.org/2000/svg';
  var ZOOMS = [44, 56, 72, 96, 128]; // pixels per hour of the timeline
  var DEFAULT_ZOOM = 2;
  var MIN_BLOCK_PX = 26;
  var DROP_STEP = 5; // minutes: where a drop or a resize lands
  var CLICK_STEP = 15; // minutes: where a click on an empty hour lands
  var PRIO_COLORS = ['#c9372c', '#e2740b', '#b38600', '#5e6ad2'];
  var KEYS = { zoom: 'tp-today-zoom', week: 'tp-today-week', sugg: 'tp-today-sugg', layout: 'tp-today-layout' };

  function TM() { return global.TodayModel; }
  function DM() { return global.DashboardModel; }
  function WX() { return global.Weather; }
  function WUI() { return global.WeatherUI; }
  function WO() { return global.WorkOS; }

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
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

  function text(s) {
    return document.createTextNode(s);
  }

  function remember(key, value) {
    try { global.localStorage.setItem(key, String(value)); } catch (e) { /* storage unavailable: kept for this session only */ }
  }

  function recall(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }

  function plural(n, one, many) {
    return n + ' ' + (n > 1 ? many : one);
  }

  /** Ring of the day in the hero: how much of today's work is done. */
  function doneRing(done, total) {
    var c = 2 * Math.PI * 14;
    var pct = total ? Math.min(1, done / total) : 0;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 36 36');
    svg.setAttribute('class', 'td-donering');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML =
      '<circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="4"/>' +
      '<circle cx="18" cy="18" r="14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" transform="rotate(-90 18 18)" ' +
      'stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (c * (1 - pct)).toFixed(2) + '"/>';
    return svg;
  }

  function accentOf(row) {
    return row && row.tierI != null ? PRIO_COLORS[Math.min(row.tierI, PRIO_COLORS.length - 1)] : '';
  }

  function create(api) {
    var M = Object.create(null);
    M.api = api;
    var __parts = (global.TodayUiPartsMountCreate || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  global.TodayUI = { create: create };

  // shared with the create parts
  S.CLICK_STEP = CLICK_STEP;
  S.DEFAULT_ZOOM = DEFAULT_ZOOM;
  S.DM = DM;
  S.DROP_STEP = DROP_STEP;
  S.KEYS = KEYS;
  S.MIN_BLOCK_PX = MIN_BLOCK_PX;
  S.NS = NS;
  S.PRIO_COLORS = PRIO_COLORS;
  S.TM = TM;
  S.WO = WO;
  S.WUI = WUI;
  S.WX = WX;
  S.ZOOMS = ZOOMS;
  S.accentOf = accentOf;
  S.create = create;
  S.doneRing = doneRing;
  S.h = h;
  S.icon = icon;
  S.plural = plural;
  S.recall = recall;
  S.remember = remember;
  S.text = text;
})(typeof window !== 'undefined' ? window : this);
