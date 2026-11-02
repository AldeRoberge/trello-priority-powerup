/*
 * Role: Journey screen. The map is context (missions, projects, dependencies).
 * The queue is direction (a few actions, each with a reason that comes from the data).
 *
 *   JourneyUI.mount(container, t, { load })
 *     load() optional -> { lists, cards, settings, goals }
 */
(function (global) {
  'use strict';

  var S = (global.JourneyUiParts = global.JourneyUiParts || {});

  var ZOOMS = [
    { id: 'overview', label: 'Carte' },
    { id: 'project', label: 'Projet' },
    { id: 'task', label: 'Tâche' },
  ];

  function JM() { return global.JourneyModel; }
  function GT() { return global.GanttTrello; }
  function CT() { return global.CompletionTrello; }
  function PT() { return global.PriorityTrello; }
  function GG() { return global.MindmapGoalsTrello; }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function icon(name) {
    var i = document.createElement('i');
    i.className = 'ti ti-' + name;
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function svgEl(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
  }

  function shortDay(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    if (!m) return '';
    var months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    var label = (+m[3]) + ' ' + months[+m[2] - 1];
    if (+m[1] !== new Date().getFullYear()) label += ' ' + m[1];
    return label;
  }

  function countLabel(c) {
    if (!c) return '';
    var bits = [];
    if (c.open) bits.push(c.open + (c.open > 1 ? ' ouvertes' : ' ouverte'));
    if (c.waiting) bits.push(c.waiting + ' en attente');
    if (c.blocked) bits.push(c.blocked + (c.blocked > 1 ? ' bloquées' : ' bloquée'));
    if (c.done) bits.push(c.done + (c.done > 1 ? ' faites' : ' faite'));
    return bits.join(' · ');
  }

  function levelIcon(level) {
    var levels = (JM() && JM().LEVELS) || [];
    for (var i = 0; i < levels.length; i++) if (levels[i].id === level) return levels[i].icon;
    return 'flag-3';
  }

  function taskIcon(state, here) {
    if (state === 'done') return 'check';
    if (state === 'blocked') return 'player-pause';
    if (state === 'waiting') return 'lock';
    if (here) return 'map-pin';
    return 'circle';
  }

  function mount(container, t, opts) {
    var M = Object.create(null);
    M.container = container;
    M.t = t;
    M.opts = opts;
    var __parts = (global.JourneyUiPartsMountMount || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  global.JourneyUI = { mount: mount };

  // shared with the mount parts
  S.CT = CT;
  S.GG = GG;
  S.GT = GT;
  S.JM = JM;
  S.PT = PT;
  S.ZOOMS = ZOOMS;
  S.countLabel = countLabel;
  S.el = el;
  S.icon = icon;
  S.levelIcon = levelIcon;
  S.mount = mount;
  S.shortDay = shortDay;
  S.svgEl = svgEl;
  S.taskIcon = taskIcon;
})(typeof window !== 'undefined' ? window : this);
