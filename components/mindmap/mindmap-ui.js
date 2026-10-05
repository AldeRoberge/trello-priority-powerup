/*
 * Role: UI of the Mindmap view — tasks, people, places and the goal hierarchy as one graph (SVG), with the links
 * "Dépend de" (task → task), "Est fait par" (task → person), "Est fait à" (task → place) and
 * "Contribue à" (task → unit of work → goal → mission → vision, any level may be skipped).
 * Data: GanttTrello.loadBoard (same records as the Gantt / Table / Kanban); graph and layout come from
 * MindmapModel. Editable here: the dependency links (card inputs.dependsOn, saved with
 * PriorityTrello.saveCardInputsById) and the goal levels + their links (MindmapGoalsTrello); people and
 * places are edited in the card.
 *  - drag the background (or hold the middle button anywhere) to pan, wheel to zoom, drag a node to move it
 *  - drag from a pin (card side) onto another node to link it (task → task: dependency; otherwise "Contribue à")
 *  - click a node to focus it: its neighbours stay lit and the side panel lists its links
 *  - click a link to select it: delete, reverse or re-target it from the panel (Suppr also deletes it)
 *  - "Ajouter" creates a vision / mission / goal / unit of work; "Hiérarchie" lays the graph out from the center
 *  - "Dépend de…" / "Contribue à…" (panel) or the Relier button: click another node to add / remove the link
 * Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var MM = function () { return global.MindmapModel; };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var CHAR_W = 6.6; // average glyph width of the 13px label, used to wrap text
  var HEAD_PAD = 9;
  var LINE_H = 17;
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
    var HD = global.HideDone;
    var state = {
      records: [],
      filter: '',
      hideDone: HD.get(),
      show: { depends: true, by: true, at: true, goals: true },
      goals: { nodes: [], links: [] },
      goalsLoaded: false, // false until the goal card was read (writing before would overwrite it)
      goalsAuth: null, // null = unknown, false = Trello REST not authorized yet
      layout: 'free', // 'free' (force) | 'tree' (hierarchy from the center)
      graph: { nodes: [], edges: [] },
      cycles: {},
      selected: null,
      selectedEdge: null,
      relink: null, // edge id whose target is being replaced
      confirmDelete: null, // goal node id waiting for a second click
      linkFrom: null, // node id waiting for a target
      view: { x: 0, y: 0, k: 1 },
      status: '',
      statusKind: '',
    };
    var statusTimer = null;
    var nodeEls = Object.create(null);
    var edgeEls = Object.create(null);

    root.innerHTML = '';
    var els = {
      bar: h('div', { class: 'mm-bar' }),
      hint: h('div', { class: 'mm-hint', hidden: true }),
      canvas: h('div', { class: 'mm-canvas' }),
      panel: h('aside', { class: 'mm-panel', hidden: true }),
      composer: h('form', { class: 'mm-composer', hidden: true }),
    };
    var svg = s('svg', { class: 'mm-svg', width: '100%', height: '100%' });
    var defs = s('defs');
    ['depends', 'by', 'at', 'serves'].forEach(function (k) {
      defs.appendChild(s('marker', { id: 'mm-arrow-' + k, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' },
        [s('path', { d: 'M0 0 L10 5 L0 10 z', class: 'mm-arrow mm-arrow--' + k })]));
    });
    svg.appendChild(defs);
    var gView = s('g', { class: 'mm-view' });
    var gEdges = s('g', { class: 'mm-edges' });
    var gNodes = s('g', { class: 'mm-nodes' });
    gView.appendChild(gEdges);
    gView.appendChild(gNodes);
    svg.appendChild(gView);
    els.canvas.appendChild(svg);
    els.canvas.appendChild(els.panel);
    els.canvas.appendChild(els.composer);
    els.canvas.appendChild(h('div', { class: 'mm-legend' }, [
      legendItem('serves', 'Contribue à'),
      legendItem('depends', 'Dépend de'),
      legendItem('by', 'Est fait par'),
      legendItem('at', 'Est fait à'),
    ]));
    root.appendChild(h('div', { class: 'mm-root', tabindex: '-1' }, [els.bar, els.hint, els.canvas]));

    function legendItem(kind, label) {
      return h('span', { class: 'mm-legend-item' }, [
        h('span', { class: 'mm-swatch mm-swatch--' + kind }),
        label,
      ]);
    }

    function setStatus(text, kind) {
      state.status = text || '';
      state.statusKind = kind || '';
      clearTimeout(statusTimer);
      if (text && kind !== 'error') statusTimer = setTimeout(function () { setStatus(''); renderBar(); }, 2500);
      renderBar();
    }

    function recById(id) {
      for (var i = 0; i < state.records.length; i++) if (state.records[i].id === id) return state.records[i];
      return null;
    }
    function nodeById(id) {
      for (var i = 0; i < state.graph.nodes.length; i++) if (state.graph.nodes[i].id === id) return state.graph.nodes[i];
      return null;
    }

    /* ── Toolbar ───────────────────────────────────────────────────── */
    function toggle(key, iconName, label) {
      return h('button', {
        class: 'mm-btn' + (state.show[key] ? ' is-active' : ''),
        title: label,
        'aria-pressed': state.show[key] ? 'true' : 'false',
        onclick: function () { state.show[key] = !state.show[key]; rebuild({ relayout: true }); },
      }, [icon(iconName), label]);
    }

    function renderBar() {
      var filter = h('input', {
        class: 'mm-filter', type: 'search', placeholder: 'Filtrer (tâche, personne, lieu)…', value: state.filter,
        'aria-label': 'Filtrer',
      });
      filter.addEventListener('input', function () {
        state.filter = filter.value;
        clearTimeout(filter._t);
        filter._t = setTimeout(function () { rebuild({ relayout: true, keepFocus: true }); }, 180);
      });
      var tasks = state.graph.nodes.filter(function (n) { return n.kind === 'task'; }).length;
      var kids = [
        h('span', { class: 'mm-search' }, [icon('search'), filter]),
        toggle('depends', 'arrow-bend-down-right', 'Dépendances'),
        toggle('by', 'user', 'Personnes'),
        toggle('at', 'map-pin', 'Lieux'),
        toggle('goals', 'target-arrow', 'Objectifs'),
        h('button', {
          class: 'mm-btn' + (state.linkFrom ? ' is-active' : ''),
          title: 'Choisir une tâche ou un objectif, puis cliquer l’élément à relier',
          onclick: function () {
            if (state.linkFrom) return endLink();
            var n = state.selected && nodeById(state.selected);
            if (n && MM().rankOf(n) >= 0) startLink(n.id);
            else setStatus('Sélectionnez d’abord une tâche ou un objectif', 'error');
          },
        }, [icon('link'), 'Relier']),
        h('button', {
          class: 'mm-btn',
          title: 'Créer une vision, une mission, un objectif ou une unité de travail',
          onclick: function () { openComposer(); },
        }, [icon('plus'), 'Ajouter']),
        h('button', {
          class: 'mm-btn' + (state.layout === 'tree' ? ' is-active' : ''),
          'aria-pressed': state.layout === 'tree' ? 'true' : 'false',
          title: 'Disposer du centre (vision, mission) vers l’extérieur (objectifs, unités de travail, tâches)',
          onclick: function () { state.layout = state.layout === 'tree' ? 'free' : 'tree'; rebuild({ relayout: true, fresh: true }); },
        }, [icon('hierarchy-3'), 'Hiérarchie']),
        state.goalsAuth === false ? h('button', {
          class: 'mm-btn mm-btn--primary',
          title: 'Trello doit être autorisé pour lire et enregistrer les objectifs',
          onclick: function () { authorizeGoals(); },
        }, [icon('key'), 'Autoriser Trello']) : null,
        h('span', { class: 'mm-spacer' }),
      ];
      if (state.status) {
        kids.push(h('span', { class: 'mm-status' + (state.statusKind ? ' is-' + state.statusKind : '') }, [state.status]));
      }
      kids.push(h('span', { class: 'mm-count' }, [tasks + (tasks > 1 ? ' tâches' : ' tâche')]));
      var doneCount = state.records.filter(function (r) { return MM().isClosed(r); }).length;
      kids.push(h('button', {
        class: 'mm-btn' + (state.hideDone ? ' is-active' : ''), 'aria-pressed': state.hideDone ? 'true' : 'false',
        title: HD.title(state.hideDone),
        onclick: function () { HD.set(!state.hideDone); },
      }, [icon(HD.icon(state.hideDone)), HD.label(state.hideDone, doneCount)]));
      kids.push(h('button', { class: 'mm-btn mm-btn--icon', title: 'Recentrer', 'aria-label': 'Recentrer', onclick: fit }, [icon('focus-2')]));
      kids.push(h('button', { class: 'mm-btn mm-btn--icon', title: 'Réorganiser', 'aria-label': 'Réorganiser', onclick: function () { rebuild({ relayout: true, fresh: true }); } }, [icon('layout-grid')]));
      kids.push(h('button', { class: 'mm-btn mm-btn--icon', title: 'Actualiser', 'aria-label': 'Actualiser', onclick: function () { reload(); } }, [icon('refresh')]));
      els.bar.textContent = '';
      kids.forEach(function (k) { els.bar.appendChild(k); });
      if (document.activeElement === document.body && state.filter) {
        // keep typing flow after a re-render triggered by the filter
        var f = els.bar.querySelector('.mm-filter');
        if (f) { f.focus(); var l = f.value.length; f.setSelectionRange(l, l); }
      }
    }

    /* ── Graph build / layout ─────────────────────────────────────── */
    function rebuild(opts) {
      opts = opts || {};
      var prev = Object.create(null);
      state.graph.nodes.forEach(function (n) { if (isFinite(n.x)) prev[n.id] = { x: n.x, y: n.y }; });
      var g = MM().buildGraph(state.records, { hideDone: state.hideDone, filter: state.filter, show: state.show });
      var anyNew = false;
      g.nodes.forEach(function (n) {
        measure(n);
        n.fixed = false;
        if (!opts.fresh && prev[n.id] && !opts.relayout) { n.x = prev[n.id].x; n.y = prev[n.id].y; n.pinned = true; n.fixed = true; }
        else anyNew = true;
      });
      if (opts.relayout || anyNew) {
        MM().layout(g.nodes, g.edges);
        // the model lays out points; cards are bigger, so open the layout up and then push overlaps apart
        g.nodes.forEach(function (n) { if (!n.fixed) { n.x *= 1.5; n.y *= 1.3; } });
        separate(g.nodes);
      }
      g.nodes.forEach(function (n) { n.pinned = false; });
      state.graph = g;
      state.cycles = {};
      MM().findCycles(g.edges).forEach(function (id) { state.cycles[id] = true; });
      if (state.selected && !nodeById(state.selected)) state.selected = null;
      if (state.linkFrom && !nodeById(state.linkFrom)) state.linkFrom = null;
      renderBar();
      renderGraph();
      renderPanel();
      if (opts.relayout || !opts.keepView) fit();
    }

    /** Card size and wrapped text lines for a node (full label, never cropped). */
    function measure(n) {
      var rec = n.rec || {};
      var iconW = n.kind === 'task' ? 0 : 30;
      n.w = n.kind === 'task' ? 210 : n.kind === 'person' ? 180 : 170;
      n.lines = wrap(n.label, Math.floor((n.w - 24 - iconW) / CHAR_W), 5);
      n.headH = Math.max(n.kind === 'task' ? 0 : 34, n.lines.length * LINE_H + HEAD_PAD * 2 - 2);
      var hasProgress = n.kind === 'task' && typeof rec.progress === 'number' && rec.progress > 0;
      n.bodyH = n.kind === 'task' && (rec.listName || hasProgress) ? 26 : 0;
      n.h = n.headH + n.bodyH;
    }

    function nodeBox(n) {
      return { w: n.w || 180, h: n.h || 40 };
    }

    /** Push overlapping cards apart (cards laid out by hand — `fixed` — never move). */
    function separate(nodes) {
      var gap = 28;
      for (var it = 0; it < 60; it++) {
        var any = false;
        for (var i = 0; i < nodes.length; i++) {
          for (var j = i + 1; j < nodes.length; j++) {
            var a = nodes[i];
            var b = nodes[j];
            if (a.fixed && b.fixed) continue;
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            var ox = (a.w + b.w) / 2 + gap - Math.abs(dx);
            var oy = (a.h + b.h) / 2 + gap - Math.abs(dy);
            if (ox <= 0 || oy <= 0) continue;
            any = true;
            var wa = a.fixed ? 0 : b.fixed ? 1 : 0.5;
            var wb = b.fixed ? 0 : a.fixed ? 1 : 0.5;
            if (ox < oy) {
              var sx = dx < 0 ? -1 : 1;
              a.x -= sx * ox * wa; b.x += sx * ox * wb;
            } else {
              var sy = dy < 0 ? -1 : 1;
              a.y -= sy * oy * wa; b.y += sy * oy * wb;
            }
          }
        }
        if (!any) break;
      }
    }

    /** Anchor of a card side (card-border midpoint) and its outward normal. */
    function anchor(n, side) {
      var d = SIDES[side];
      return { x: n.x + d.nx * n.w / 2, y: n.y + d.ny * n.h / 2, nx: d.nx, ny: d.ny, side: side };
    }

    /** Facing sides for a wire between two cards. */
    function facing(a, b) {
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var horizontal = Math.abs(dx) / ((a.w + b.w) / 2) >= Math.abs(dy) / ((a.h + b.h) / 2);
      if (horizontal) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
      return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
    }

    function wirePath(p1, p2) {
      var dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      var off = Math.max(30, Math.min(140, dist * 0.4));
      return 'M' + p1.x.toFixed(1) + ',' + p1.y.toFixed(1) +
        ' C' + (p1.x + p1.nx * off).toFixed(1) + ',' + (p1.y + p1.ny * off).toFixed(1) +
        ' ' + (p2.x + p2.nx * off).toFixed(1) + ',' + (p2.y + p2.ny * off).toFixed(1) +
        ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
    }

    function renderGraph() {
      gEdges.textContent = '';
      gNodes.textContent = '';
      nodeEls = Object.create(null);
      edgeEls = Object.create(null);
      var graph = state.graph;
      graph.edges.forEach(function (e) {
        var cls = e.kind === 'depends' ? 'depends' : e.kind === 'by' ? 'by' : 'at';
        var glow = s('path', { class: 'mm-edge-glow mm-edge-glow--' + cls });
        var line = s('path', { class: 'mm-edge mm-edge--' + cls + (state.cycles[e.from] && state.cycles[e.to] && e.kind === 'depends' ? ' is-cycle' : ''), 'marker-end': 'url(#mm-arrow-' + cls + ')' });
        var title = s('title');
        title.textContent = MM().EDGE_LABELS[e.kind] || e.kind;
        line.appendChild(title);
        var label = s('text', { class: 'mm-edge-label', 'text-anchor': 'middle' });
        label.textContent = MM().EDGE_LABELS[e.kind] || e.kind;
        var wrapG = s('g', { class: 'mm-wire-group' }, [glow, line, label]);
        if (e.kind === 'depends') {
          // wide invisible stroke so a dependency is easy to click (select / remove it)
          var hit = s('path', { class: 'mm-edge-hit' });
          hit.addEventListener('click', function (ev) { ev.stopPropagation(); onEdgeClick(e); });
          wrapG.appendChild(hit);
          edgeEls[e.id] = { line: line, glow: glow, label: label, hit: hit, e: e };
        } else {
          edgeEls[e.id] = { line: line, glow: glow, label: label, e: e };
        }
        gEdges.appendChild(wrapG);
      });
      graph.nodes.forEach(function (n) {
        var g = buildNodeEl(n);
        nodeEls[n.id] = g;
        gNodes.appendChild(g);
      });
      positionAll();
      applyFocus();
    }

    function buildNodeEl(n) {
      var g = s('g', { class: 'mm-node mm-node--' + n.kind, tabindex: '0', role: 'button', 'aria-label': n.label, 'data-id': n.id });
      var rec = n.rec || {};
      var accent = n.kind === 'task' ? (rec.color || 'hsl(210 62% 58%)') : n.kind === 'person' ? 'hsl(' + hueOf(n.label) + ' 55% 62%)' : 'hsl(150 50% 46%)';
      g.style.setProperty('--mm-accent', accent);
      if (n.bodyH) g.setAttribute('data-body', '');
      var x0 = -n.w / 2;
      var y0 = -n.h / 2;
      g.appendChild(s('rect', { class: 'mm-shape', x: x0, y: y0, width: n.w, height: n.h, rx: 9 }));
      g.appendChild(s('path', { class: 'mm-head', d: topRounded(x0, y0, n.w, n.headH, 9) }));
      g.appendChild(s('line', { class: 'mm-head-rule', x1: x0, x2: x0 + n.w, y1: y0 + n.headH, y2: y0 + n.headH }));
      var textX = x0 + 12;
      if (n.kind !== 'task') {
        var cy = y0 + n.headH / 2;
        textX = x0 + 42;
        if (n.kind === 'person') {
          g.appendChild(s('circle', { class: 'mm-avatar', cx: x0 + 24, cy: cy, r: 13 }));
          var it = s('text', { class: 'mm-initials', 'text-anchor': 'middle', x: x0 + 24, y: cy + 4 });
          it.textContent = initials(n.label);
          g.appendChild(it);
        } else {
          g.appendChild(s('path', {
            class: 'mm-pinicon',
            d: 'M' + (x0 + 24) + ',' + (cy + 9) + 'C' + (x0 + 14) + ',' + (cy - 1) + ' ' + (x0 + 15) + ',' + (cy - 9) + ' ' + (x0 + 24) + ',' + (cy - 9) +
              'C' + (x0 + 33) + ',' + (cy - 9) + ' ' + (x0 + 34) + ',' + (cy - 1) + ' ' + (x0 + 24) + ',' + (cy + 9) + 'Z',
          }));
          g.appendChild(s('circle', { class: 'mm-pinhole', cx: x0 + 24, cy: cy - 3, r: 2.6 }));
        }
      }
      n.lines.forEach(function (line, i) {
        var tx = s('text', { class: 'mm-label', x: textX, y: y0 + HEAD_PAD + 12 + i * LINE_H });
        tx.textContent = line;
        g.appendChild(tx);
      });
      if (n.bodyH) {
        var by = y0 + n.headH;
        var hasProgress = typeof rec.progress === 'number' && rec.progress > 0;
        if (rec.listName) {
          var lt = s('text', { class: 'mm-sub', x: x0 + 12, y: by + 17 });
          lt.textContent = clip(rec.listName, hasProgress ? 17 : 30);
          g.appendChild(lt);
        }
        if (hasProgress) {
          var pw = 60;
          var px = x0 + n.w - 12 - pw - 30;
          g.appendChild(s('rect', { class: 'mm-progress-track', x: px, y: by + 11, width: pw, height: 4, rx: 2 }));
          g.appendChild(s('rect', { class: 'mm-progress', x: px, y: by + 11, width: Math.max(0, pw * Math.min(100, rec.progress) / 100), height: 4, rx: 2 }));
          var pt = s('text', { class: 'mm-sub', x: x0 + n.w - 12, y: by + 16, 'text-anchor': 'end' });
          pt.textContent = Math.round(rec.progress) + '%';
          g.appendChild(pt);
        }
      }
      if (n.kind === 'task') {
        Object.keys(SIDES).forEach(function (side) {
          var a = anchor({ x: 0, y: 0, w: n.w, h: n.h }, side);
          var pin = s('g', { class: 'mm-pin', transform: 'translate(' + a.x + ',' + a.y + ')', 'data-side': side });
          pin.appendChild(s('circle', { class: 'mm-pin-hit', r: 11 }));
          pin.appendChild(s('circle', { class: 'mm-pin-dot', r: 5 }));
          pin.addEventListener('pointerdown', function (ev) { startWireDrag(ev, n, side); });
          g.appendChild(pin);
        });
      }
      var title = s('title');
      title.textContent = n.label;
      g.appendChild(title);
      attachNodeEvents(g, n);
      return g;
    }

    function positionAll() {
      state.graph.nodes.forEach(positionNode);
      state.graph.edges.forEach(positionEdge);
    }
    function positionNode(n) {
      var g = nodeEls[n.id];
      if (g) g.setAttribute('transform', 'translate(' + n.x.toFixed(1) + ',' + n.y.toFixed(1) + ')');
    }
    function positionEdge(e) {
      var ref = edgeEls[e.id];
      var a = nodeById(e.from);
      var b = nodeById(e.to);
      if (!ref || !a || !b) return;
      var sides = facing(a, b);
      var p1 = anchor(a, sides[0]);
      var p2 = anchor(b, sides[1]);
      // the wire stops just outside each card so the pin and arrowhead stay visible
      p1.x += p1.nx * PIN_GAP; p1.y += p1.ny * PIN_GAP;
      p2.x += p2.nx * PIN_GAP; p2.y += p2.ny * PIN_GAP;
      var d = wirePath(p1, p2);
      [ref.line, ref.glow, ref.hit].forEach(function (l) { if (l) l.setAttribute('d', d); });
      ref.label.setAttribute('x', ((p1.x + p2.x) / 2).toFixed(1));
      ref.label.setAttribute('y', ((p1.y + p2.y) / 2 - 6).toFixed(1));
    }

    function applyFocus() {
      var focus = state.selected;
      var near = focus ? MM().neighbours(state.graph.edges, focus) : null;
      state.graph.nodes.forEach(function (n) {
        var g = nodeEls[n.id];
        if (!g) return;
        var lit = !focus || n.id === focus || near[n.id];
        g.classList.toggle('is-dim', !lit);
        g.classList.toggle('is-selected', n.id === focus);
        g.classList.toggle('is-linking', n.id === state.linkFrom);
        g.classList.toggle('is-cycle', !!state.cycles[n.id]);
      });
      state.graph.edges.forEach(function (e) {
        var ref = edgeEls[e.id];
        if (!ref) return;
        var lit = !focus || e.from === focus || e.to === focus;
        ref.line.classList.toggle('is-dim', !lit);
        ref.glow.classList.toggle('is-dim', !lit);
        ref.label.classList.toggle('is-shown', !!focus && lit);
      });
    }

    /* ── Interaction ──────────────────────────────────────────────── */
    function attachNodeEvents(g, n) {
      var moved = false;
      g.addEventListener('pointerdown', function (ev) {
        if (ev.button) return;
        ev.stopPropagation();
        moved = false;
        var start = { x: ev.clientX, y: ev.clientY, nx: n.x, ny: n.y };
        try { g.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        function move(me) {
          var dx = me.clientX - start.x;
          var dy = me.clientY - start.y;
          if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
          moved = true;
          n.x = start.nx + dx / state.view.k;
          n.y = start.ny + dy / state.view.k;
          positionNode(n);
          state.graph.edges.forEach(function (e) { if (e.from === n.id || e.to === n.id) positionEdge(e); });
        }
        function up() {
          g.removeEventListener('pointermove', move);
          g.removeEventListener('pointerup', up);
          g.removeEventListener('pointercancel', up);
          if (!moved) onNodeClick(n);
        }
        g.addEventListener('pointermove', move);
        g.addEventListener('pointerup', up);
        g.addEventListener('pointercancel', up);
      });
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onNodeClick(n); }
        if (ev.key === 'Escape') { endLink(); select(null); }
      });
    }

    /** Drag from a card's pin to another task: "source depends on target" (dropping on an existing link removes it). */
    function startWireDrag(ev, n, side) {
      if (ev.button) return;
      ev.stopPropagation();
      ev.preventDefault();
      var from = anchor(n, side);
      var temp = s('path', { class: 'mm-wire-temp' });
      gEdges.appendChild(temp);
      root.classList.add('is-wiring');
      var target = null;
      function toGraph(me) {
        var r = svg.getBoundingClientRect();
        return { x: (me.clientX - r.left - state.view.x) / state.view.k, y: (me.clientY - r.top - state.view.y) / state.view.k };
      }
      function targetAt(me) {
        var el = document.elementFromPoint(me.clientX, me.clientY);
        var ng = el && el.closest && el.closest('.mm-node--task');
        var id = ng && ng.getAttribute('data-id');
        return id && id !== n.id ? id : null;
      }
      function move(me) {
        var p = toGraph(me);
        var id = targetAt(me);
        if (id !== target) {
          if (target && nodeEls[target]) nodeEls[target].classList.remove('is-drop-target');
          target = id;
          if (target && nodeEls[target]) nodeEls[target].classList.add('is-drop-target');
        }
        var end = { x: p.x, y: p.y, nx: 0, ny: 0 };
        var tn = target && nodeById(target);
        if (tn) end = anchor(tn, facing(n, tn)[1]);
        else end.nx = Math.abs(p.x - from.x) > Math.abs(p.y - from.y) ? (p.x > from.x ? -1 : 1) : 0;
        if (!tn && !end.nx) end.ny = p.y > from.y ? -1 : 1;
        var start = { x: from.x + from.nx * PIN_GAP, y: from.y + from.ny * PIN_GAP, nx: from.nx, ny: from.ny };
        temp.setAttribute('d', wirePath(start, end));
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancel);
        finish();
        if (target) toggleDependency(n.id.slice(2), target.slice(2));
      }
      function cancel() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancel);
        target = null;
        finish();
      }
      function finish() {
        if (target && nodeEls[target]) nodeEls[target].classList.remove('is-drop-target');
        if (temp.parentNode) temp.parentNode.removeChild(temp);
        root.classList.remove('is-wiring');
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', cancel);
      move(ev);
    }

    function onNodeClick(n) {
      if (state.linkFrom && n.kind === 'task') {
        if (n.id === state.linkFrom) return endLink();
        return toggleDependency(state.linkFrom.slice(2), n.id.slice(2));
      }
      select(n.id === state.selected ? null : n.id);
    }

    function onEdgeClick(e) {
      select(e.from);
    }

    function select(id) {
      state.selected = id;
      applyFocus();
      renderPanel();
    }

    function startLink(nodeId) {
      state.linkFrom = nodeId;
      var n = nodeById(nodeId);
      els.hint.hidden = false;
      els.hint.textContent = '';
      els.hint.appendChild(icon('link'));
      els.hint.appendChild(document.createTextNode(' Cliquez la tâche dont « ' + clip(n ? n.label : '', 40) + ' » dépend (re-cliquer une dépendance la retire). Échap pour terminer.'));
      root.classList.add('is-linking');
      renderBar();
      applyFocus();
    }
    function endLink() {
      state.linkFrom = null;
      els.hint.hidden = true;
      root.classList.remove('is-linking');
      renderBar();
      applyFocus();
    }

    /** Adds the dependency "cardId depends on depId", or removes it when it already exists. */
    function toggleDependency(cardId, depId) {
      var rec = recById(cardId);
      if (!rec) return Promise.resolve();
      var current = ((rec.inputs && rec.inputs.dependsOn) || []).slice();
      var at = current.indexOf(depId);
      if (at < 0 && MM().wouldCycle(state.graph.edges, 't:' + cardId, 't:' + depId)) {
        setStatus('Impossible : cela créerait une boucle de dépendances', 'error');
        return Promise.resolve();
      }
      if (at >= 0) current.splice(at, 1);
      else current.push(depId);
      return saveDependsOn(rec, current);
    }

    function saveDependsOn(rec, list) {
      var pt = global.PriorityTrello;
      if (!pt || typeof pt.saveCardInputsById !== 'function') {
        setStatus('Enregistrement indisponible', 'error');
        return Promise.resolve();
      }
      setStatus('Enregistrement…');
      return pt.saveCardInputsById(t, rec.id, { dependsOn: list }).then(function (saved) {
        rec.inputs = Object.assign({}, rec.inputs || {}, saved || {});
        if (!list.length) delete rec.inputs.dependsOn;
        setStatus('Enregistré', 'ok');
        rebuild({ keepView: true });
      }).catch(function (err) {
        setStatus('Échec : ' + ((err && err.message) || 'erreur'), 'error');
      });
    }

    function openCard(rec) {
      if (!rec || typeof t.modal !== 'function') return;
      t.modal({
        title: rec.name || 'Carte',
        url: global.PriorityTrello.pageUrl('./popup.html'),
        args: { cardId: rec.id, cardName: rec.name || '', openSection: null },
        fullscreen: true,
        accentColor: '#22272B',
        callback: function () {
          return t.modal({
            title: 'Mindmap',
            url: global.PriorityTrello.pageUrl('./mindmap.html'),
            fullscreen: true,
            accentColor: '#22272B',
          });
        },
      });
    }

    /* ── Side panel ───────────────────────────────────────────────── */
    function linkRow(label, node, removeFn) {
      var kids = [
        h('button', { class: 'mm-link', onclick: function () { select(node.id); }, title: 'Voir ' + node.label }, [
          icon(node.kind === 'task' ? 'checkbox' : node.kind === 'person' ? 'user' : 'map-pin'),
          h('span', { text: clip(node.label, 36) }),
        ]),
      ];
      if (removeFn) {
        kids.push(h('button', { class: 'mm-x', title: 'Retirer ce lien', 'aria-label': 'Retirer', onclick: removeFn }, [icon('x')]));
      }
      return h('li', { class: 'mm-row' }, kids);
    }

    function section(title, rows, extra) {
      if (!rows.length && !extra) return null;
      return h('div', { class: 'mm-sec' }, [
        h('h4', { text: title }),
        rows.length ? h('ul', { class: 'mm-list' }, rows) : null,
        extra || null,
      ]);
    }

    function renderPanel() {
      var n = state.selected && nodeById(state.selected);
      els.panel.textContent = '';
      if (!n) { els.panel.hidden = true; return; }
      els.panel.hidden = false;
      var edges = state.graph.edges;
      var head = h('div', { class: 'mm-panel-head' }, [
        h('div', { class: 'mm-panel-kind', text: n.kind === 'task' ? 'Tâche' : n.kind === 'person' ? 'Personne' : 'Lieu' }),
        h('h3', { text: n.label }),
        h('button', { class: 'mm-x mm-panel-close', 'aria-label': 'Fermer', onclick: function () { select(null); } }, [icon('x')]),
      ]);
      els.panel.appendChild(head);
      var rec = n.kind === 'task' ? n.rec : null;
      if (rec) {
        els.panel.appendChild(h('div', { class: 'mm-panel-meta' }, [
          rec.listName ? h('span', { class: 'mm-chip', text: rec.listName }) : null,
          typeof rec.progress === 'number' ? h('span', { class: 'mm-chip', text: Math.round(rec.progress) + ' %' }) : null,
          rec.dueDate ? h('span', { class: 'mm-chip', text: 'Échéance ' + rec.dueDate }) : null,
          state.cycles[n.id] ? h('span', { class: 'mm-chip mm-chip--warn', text: 'Boucle de dépendances' }) : null,
        ]));
      }
      function pick(kind, dir, fn) {
        return edges.filter(function (e) {
          return e.kind === kind && (dir === 'out' ? e.from === n.id : e.to === n.id);
        }).map(fn);
      }
      var sections = [];
      if (n.kind === 'task') {
        sections.push(section('Dépend de', pick('depends', 'out', function (e) {
          var dep = nodeById(e.to);
          return linkRow('', dep, function () { toggleDependency(n.id.slice(2), dep.id.slice(2)); });
        }), h('button', { class: 'mm-btn mm-btn--small', onclick: function () { startLink(n.id); } }, [icon('plus'), 'Dépend de…'])));
        sections.push(section('Bloque', pick('depends', 'in', function (e) { return linkRow('', nodeById(e.from)); })));
        sections.push(section('Est fait par', pick('by', 'out', function (e) { return linkRow('', nodeById(e.to)); })));
        var placeRows = [];
        ['at', 'from', 'via', 'to'].forEach(function (k) {
          pick(k, 'out', function (e) {
            var li = linkRow('', nodeById(e.to));
            if (k !== 'at') li.appendChild(h('span', { class: 'mm-tag', text: MM().EDGE_LABELS[k] }));
            placeRows.push(li);
          });
        });
        sections.push(section('Est fait à', placeRows));
      } else if (n.kind === 'person') {
        sections.push(section('Fait', pick('by', 'in', function (e) { return linkRow('', nodeById(e.from)); })));
      } else {
        var rows = [];
        edges.filter(function (e) { return e.to === n.id; }).forEach(function (e) {
          var li = linkRow('', nodeById(e.from));
          if (e.kind !== 'at') li.appendChild(h('span', { class: 'mm-tag', text: MM().EDGE_LABELS[e.kind] }));
          rows.push(li);
        });
        sections.push(section('Tâches ici', rows));
      }
      sections.forEach(function (sec) { if (sec) els.panel.appendChild(sec); });
      if (rec) {
        els.panel.appendChild(h('button', { class: 'mm-btn mm-btn--primary mm-open', onclick: function () { openCard(rec); } }, [icon('external-link'), 'Ouvrir la carte']));
      }
    }

    /* ── Pan / zoom ───────────────────────────────────────────────── */
    function applyView() {
      var v = state.view;
      gView.setAttribute('transform', 'translate(' + v.x.toFixed(1) + ',' + v.y.toFixed(1) + ') scale(' + v.k.toFixed(3) + ')');
      // the dot grid pans and zooms with the graph
      els.canvas.style.backgroundSize = (18 * v.k).toFixed(2) + 'px ' + (18 * v.k).toFixed(2) + 'px';
      els.canvas.style.backgroundPosition = v.x.toFixed(1) + 'px ' + v.y.toFixed(1) + 'px';
    }

    function fit() {
      var nodes = state.graph.nodes;
      var w = els.canvas.clientWidth || 800;
      var hgt = els.canvas.clientHeight || 500;
      if (!nodes.length) { state.view = { x: w / 2, y: hgt / 2, k: 1 }; return applyView(); }
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      nodes.forEach(function (n) {
        var b = nodeBox(n);
        x0 = Math.min(x0, n.x - b.w / 2); x1 = Math.max(x1, n.x + b.w / 2);
        y0 = Math.min(y0, n.y - b.h / 2); y1 = Math.max(y1, n.y + b.h / 2 + 16);
      });
      var pad = 40;
      var k = Math.min(1.2, (w - pad * 2) / Math.max(1, x1 - x0), (hgt - pad * 2) / Math.max(1, y1 - y0));
      k = Math.max(0.15, k);
      state.view = { k: k, x: w / 2 - ((x0 + x1) / 2) * k, y: hgt / 2 - ((y0 + y1) / 2) * k };
      applyView();
    }

    // middle mouse button pans from anywhere (even over a card), like Miro; also stop the browser autoscroll
    svg.addEventListener('mousedown', function (ev) { if (ev.button === 1) ev.preventDefault(); });
    svg.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 && ev.button !== 1) return;
      if (ev.button === 1) ev.preventDefault();
      var start = { x: ev.clientX, y: ev.clientY, vx: state.view.x, vy: state.view.y };
      var moved = false;
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      function move(me) {
        var dx = me.clientX - start.x;
        var dy = me.clientY - start.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        state.view.x = start.vx + dx;
        state.view.y = start.vy + dy;
        applyView();
      }
      function up() {
        svg.removeEventListener('pointermove', move);
        svg.removeEventListener('pointerup', up);
        svg.removeEventListener('pointercancel', up);
        if (!moved && state.selected && ev.button === 0) select(null);
      }
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerup', up);
      svg.addEventListener('pointercancel', up);
    });
    svg.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var r = svg.getBoundingClientRect();
      var px = ev.clientX - r.left;
      var py = ev.clientY - r.top;
      var v = state.view;
      var k = Math.max(0.15, Math.min(3, v.k * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
      v.x = px - ((px - v.x) / v.k) * k;
      v.y = py - ((py - v.y) / v.k) * k;
      v.k = k;
      applyView();
    }, { passive: false });
    root.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { endLink(); select(null); }
    });
    global.addEventListener('resize', function () { if (!state.graph.nodes.length) fit(); });

    /* ── Loading ───────────────────────────────────────────────────── */
    function reload() {
      els.canvas.classList.add('is-loading');
      return global.GanttTrello.loadBoard(t).then(function (board) {
        state.records = board.cards || [];
        els.canvas.classList.remove('is-loading');
        rebuild({ relayout: true });
      }).catch(function (err) {
        els.canvas.classList.remove('is-loading');
        gNodes.textContent = '';
        gEdges.textContent = '';
        els.hint.hidden = false;
        els.hint.textContent = 'Impossible de charger le tableau : ' + ((err && err.message) || err);
      });
    }

    HD.subscribe(function (on) {
      state.hideDone = on;
      rebuild({ relayout: true });
    });
    renderBar();
    return reload();
  }

  global.MindmapUI = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
