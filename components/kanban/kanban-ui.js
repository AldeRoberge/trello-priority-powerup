/*
 * Role: UI of the Kanban view — the board's lists as columns, cards as tiles, like Trello but in the
 * app's own look (kanban-ui.css). Same data and writes as the Table (TableTrello / TableModel):
 *  - drag a card to another column or to a new position (saved to Trello as list + pos)
 *  - "+ Ajouter une carte" at the bottom of each column; click a tile to open it beside the board
 *  - urgency / due / progress chips open the shared CardFields editors; right-click: card menu
 *  - a sparkle on a tile (and one field for the board in the toolbar) asks KanbanAI; the tile
 *    field stays closed until asked, so a board does not prefetch one suggestion per card
 *  - "En retard" and "Bloquées" filter the board; arrow keys move between cards
 *  - "Par priorité" cuts the board into rows, one per priority tier (Critique on top, "Sans priorité" last):
 *    same tiles, same columns, a card can only be dragged along its own row (KanbanModel.buildLanes)
 *  - "Projets" nests each project's tasks and subtasks in the column the project occupies. Dragging the
 *    project moves the project; dragging a task still moves that task.
 * Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var S = (global.KanbanUiParts = global.KanbanUiParts || {});

  var TM = function () { return global.TableModel; };
  var TT = function () { return global.TableTrello; };
  var KM = function () { return global.KanbanModel; };
  var MENU = function () { return global.TableMenu; };
  var AI = function () { return global.KanbanAI; };

  var URGENCY_TONE = { Aucun: 0, 'Bientôt': 1, 'Assez vite': 2, Vite: 3, 'Au plus vite': 4 };

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

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  var LANES_KEY = 'tp-kanban-lanes';
  var SMART_KEY = 'tp-kanban-smart';
  var SORT_KEY = 'tp-kanban-sort';
  var SORTS = [['manual', 'Ordre manuel'], ['priority', 'Priorité'], ['progress', 'Avancement'], ['place', 'Lieu']];
  var LANES_FOLDED_KEY = 'tp-kanban-lanes-folded';
  var PROJECTS_KEY = 'tp-kanban-projects';
  var PROJ_FOLDED_KEY = 'tp-kanban-projects-folded';

  function readStored(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function writeStored(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: the choice just is not remembered */ }
  }

  /** Name, index and colour of each priority tier, from the Priority module when it is loaded. */
  function tierDefs() {
    var tiers = (global.PriorityUI && global.PriorityUI.TIERS) || [];
    return tiers.map(function (x) { return { i: x.i, label: x.label, color: x.seg }; });
  }

  function readSmart() {
    var v = readStored(SMART_KEY, null);
    return v && Array.isArray(v.filters) ? v : { sig: '', filters: [] };
  }

  /** Cheap fingerprint of the open cards so suggestions are only regenerated when the board changed. */
  function boardSig(rows) {
    var s = (rows || []).filter(function (r) { return r.statutKey !== 'completed' && r.statutKey !== 'canceled'; })
      .map(function (r) { return r.id + ':' + (r.name || '') + ':' + (r.desc || '').length; }).join('|');
    var n = 0;
    for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) | 0;
    return String(n);
  }

  function mount(root, t) {
    var M = Object.create(null);
    M.root = root;
    M.t = t;
    var __parts = (global.KanbanUiPartsMountMount || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  global.KanbanUI = { mount: mount };

  // shared with the mount parts
  S.AI = AI;
  S.KM = KM;
  S.LANES_FOLDED_KEY = LANES_FOLDED_KEY;
  S.LANES_KEY = LANES_KEY;
  S.MENU = MENU;
  S.PROJECTS_KEY = PROJECTS_KEY;
  S.PROJ_FOLDED_KEY = PROJ_FOLDED_KEY;
  S.SMART_KEY = SMART_KEY;
  S.SORTS = SORTS;
  S.SORT_KEY = SORT_KEY;
  S.TM = TM;
  S.TT = TT;
  S.URGENCY_TONE = URGENCY_TONE;
  S.boardSig = boardSig;
  S.h = h;
  S.icon = icon;
  S.mount = mount;
  S.readSmart = readSmart;
  S.readStored = readStored;
  S.tierDefs = tierDefs;
  S.todayIso = todayIso;
  S.writeStored = writeStored;
})(typeof window !== 'undefined' ? window : this);
