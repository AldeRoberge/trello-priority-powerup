/*
 * Role: UI of the Mindmap view — tasks, people, places and the goal hierarchy as one graph (SVG), with the links
 * "Dépend de" (task → task), "Est fait par" (task → person), "Est fait à" (task → place) and
 * "Contribue à" (task → project → objective → goal → mission → vision, any level may be skipped).
 * Data: GanttTrello.loadBoard (same records as the Gantt / Table / Kanban); graph and layout come from
 * MindmapModel. Editable here: the dependency links (card inputs.dependsOn, saved with
 * PriorityTrello.saveCardInputsById) and the goal levels + their links (MindmapGoalsTrello); people and
 * places are edited in the card.
 *  - drag the background (or hold the middle button anywhere) to pan, wheel to zoom, drag a node to move it
 *  - drag from a pin (card side) onto another node to link it (task → task: dependency; otherwise "Contribue à")
 *  - click a node to focus it: it stays where it is and its neighbourhood gathers around it
 *    (goals above, what it needs to the right, places lower right, work below, people lower left).
 *    The next relation sits just behind, dimmer. Click the background and the map returns.
 *    Each link is read from that node (a task "Sera fait par Aldé", the person "Va faire"),
 *    and the side panel lists its links
 *  - click a link to select it: delete, reverse or re-target it from the panel (Suppr also deletes it)
 *  - "Ajouter" creates a vision / mission / goal / objective / project; "Hiérarchie" lays the graph out from the center
 *  - "Groupes" picks the lens (hiérarchie, vision, mission, but, objectif, projet, type, manuel). A group is a soft
 *    boundary. Zooming out hides what is inside; zooming in shows it, and up close a task opens into nodes
 *    (progrès, priorité, statut, pause, échéance). Click a group to select it, drag it to move its contents,
 *    double-click its name to rename it, double-click the boundary to open or close it. Drop a card on a group to add it.
 *  - "Dépend de…" / "Contribue à…" (panel) or the Relier button: click another node to add / remove the link
 * Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var S = (global.MindmapUiParts = global.MindmapUiParts || {});

  var MM = function () { return global.MindmapModel; };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var CHAR_W = 6.6; // average glyph width of the 13px label, used to wrap text
  var HEAD_PAD = 9;
  var LINE_H = 17;
  var GRID = 18; // matches the canvas dot grid (background-size in applyView / CSS)
  var PIN_GAP = 6; // wires stop this far outside the card so the pin stays visible
  var SIDES = {
    top: { nx: 0, ny: -1 },
    right: { nx: 1, ny: 0 },
    bottom: { nx: 0, ny: 1 },
    left: { nx: -1, ny: 0 },
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

  function s(tag, attrs, children) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function icon(name) {
    return h('i', { class: 'ti ti-' + name });
  }

  function clip(text, max) {
    text = String(text || '');
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  /** Greedy word wrap on a character budget; long words are broken, overflow past maxLines is ellipsised. */
  function wrap(text, maxChars, maxLines) {
    var words = String(text || '').trim().split(/\s+/).filter(Boolean);
    var lines = [];
    var cur = '';
    words.forEach(function (w) {
      while (w.length > maxChars) {
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, maxChars));
        w = w.slice(maxChars);
      }
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    if (!lines.length) lines.push('');
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = clip(lines[maxLines - 1] + '…', maxChars);
    }
    return lines;
  }

  function hueOf(text) {
    var hsh = 0;
    String(text || '').split('').forEach(function (c) { hsh = (hsh * 31 + c.charCodeAt(0)) % 360; });
    return hsh;
  }

  /** Rectangle with only the top corners rounded (card header). */
  function topRounded(x, y, w, hgt, r) {
    return 'M' + x + ',' + (y + hgt) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + hgt) + 'Z';
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function mount(root, t) {
    var M = Object.create(null);
    M.root = root;
    M.t = t;
    if (global.Timers) global.Timers.ensure(t);
    var __parts = (global.MindmapUiPartsMountMount || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  global.MindmapUI = { mount: mount };

  // shared with the mount parts
  S.CHAR_W = CHAR_W;
  S.GRID = GRID;
  S.HEAD_PAD = HEAD_PAD;
  S.LINE_H = LINE_H;
  S.MM = MM;
  S.PIN_GAP = PIN_GAP;
  S.SIDES = SIDES;
  S.SVGNS = SVGNS;
  S.clip = clip;
  S.h = h;
  S.hueOf = hueOf;
  S.icon = icon;
  S.initials = initials;
  S.mount = mount;
  S.s = s;
  S.topRounded = topRounded;
  S.wrap = wrap;
})(typeof window !== 'undefined' ? window : this);
