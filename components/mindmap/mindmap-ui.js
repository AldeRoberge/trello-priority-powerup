/*
 * Role: UI of the Mindmap view — tasks, people and places as one graph (SVG), with the links
 * "Dépend de" (task → task), "Est fait par" (task → person) and "Est fait à" (task → place).
 * Data: GanttTrello.loadBoard (same records as the Gantt / Table / Kanban); graph and layout come from
 * MindmapModel. Only the dependency links are editable here (card inputs.dependsOn, saved with
 * PriorityTrello.saveCardInputsById); people and places are edited in the card.
 *  - drag the background to pan, wheel to zoom, drag a node to move it
 *  - click a node to focus it: its neighbours stay lit and the side panel lists its links
 *  - "Dépend de…" (panel) or the Relier button: click another task to add / remove a dependency
 * Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var MM = function () { return global.MindmapModel; };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var HIDE_DONE_KEY = 'tp-mindmap-hide-done';
  var TASK_W = 168;
  var TASK_H = 34;

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

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function mount(root, t) {
    function readHideDone() {
      try { return global.localStorage.getItem(HIDE_DONE_KEY) === '1'; } catch (e) { return false; }
    }
    var state = {
      records: [],
      filter: '',
      hideDone: readHideDone(),
      show: { depends: true, by: true, at: true },
      graph: { nodes: [], edges: [] },
      cycles: {},
      selected: null,
      linkFrom: null, // task node id waiting for a target
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
    };
    var svg = s('svg', { class: 'mm-svg', width: '100%', height: '100%' });
    var defs = s('defs');
    ['depends', 'by', 'at'].forEach(function (k) {
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
    els.canvas.appendChild(h('div', { class: 'mm-legend' }, [
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
        h('button', {
          class: 'mm-btn' + (state.hideDone ? ' is-active' : ''), 'aria-pressed': state.hideDone ? 'true' : 'false',
          onclick: function () {
            state.hideDone = !state.hideDone;
            try { global.localStorage.setItem(HIDE_DONE_KEY, state.hideDone ? '1' : '0'); } catch (e) { /* ignore */ }
            rebuild({ relayout: true });
          },
        }, [icon('eye-off'), 'Masquer terminées']),
        h('button', {
          class: 'mm-btn' + (state.linkFrom ? ' is-active' : ''),
          title: 'Choisir une tâche, puis cliquer la tâche dont elle dépend',
          onclick: function () {
            if (state.linkFrom) return endLink();
            var n = state.selected && nodeById(state.selected);
            if (n && n.kind === 'task') startLink(n.id);
            else setStatus('Sélectionnez d’abord une tâche', 'error');
          },
        }, [icon('link'), 'Relier']),
        h('span', { class: 'mm-spacer' }),
      ];
      if (state.status) {
        kids.push(h('span', { class: 'mm-status' + (state.statusKind ? ' is-' + state.statusKind : '') }, [state.status]));
      }
      kids.push(h('span', { class: 'mm-count' }, [tasks + (tasks > 1 ? ' tâches' : ' tâche')]));
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
        if (!opts.fresh && prev[n.id] && !opts.relayout) { n.x = prev[n.id].x; n.y = prev[n.id].y; n.pinned = true; }
        else anyNew = true;
      });
      if (opts.relayout || anyNew) MM().layout(g.nodes, g.edges);
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

    function nodeBox(n) {
      if (n.kind === 'task') return { w: TASK_W, h: TASK_H };
      if (n.kind === 'person') return { w: 40, h: 40 };
      return { w: Math.min(150, 34 + n.label.length * 6.4), h: 28 };
    }

    /** Point where the segment from the centre of `n` towards (tx, ty) leaves its box (for edge ends). */
    function edgePoint(n, tx, ty) {
      var b = nodeBox(n);
      var dx = tx - n.x;
      var dy = ty - n.y;
      if (!dx && !dy) return { x: n.x, y: n.y };
      if (n.kind === 'person') {
        var d = Math.sqrt(dx * dx + dy * dy);
        return { x: n.x + (dx / d) * 21, y: n.y + (dy / d) * 21 };
      }
      var sx = (b.w / 2) / Math.abs(dx || 1e-6);
      var sy = (b.h / 2) / Math.abs(dy || 1e-6);
      var k = Math.min(sx, sy);
      return { x: n.x + dx * k, y: n.y + dy * k };
    }

    function renderGraph() {
      gEdges.textContent = '';
      gNodes.textContent = '';
      nodeEls = Object.create(null);
      edgeEls = Object.create(null);
      var graph = state.graph;
      graph.edges.forEach(function (e) {
        var cls = e.kind === 'depends' ? 'depends' : e.kind === 'by' ? 'by' : 'at';
        var line = s('line', { class: 'mm-edge mm-edge--' + cls + (state.cycles[e.from] && state.cycles[e.to] && e.kind === 'depends' ? ' is-cycle' : ''), 'marker-end': 'url(#mm-arrow-' + cls + ')' });
        var title = s('title');
        title.textContent = MM().EDGE_LABELS[e.kind] || e.kind;
        line.appendChild(title);
        var label = s('text', { class: 'mm-edge-label', 'text-anchor': 'middle' });
        label.textContent = MM().EDGE_LABELS[e.kind] || e.kind;
        var wrap = s('g', {}, [line, label]);
        if (e.kind === 'depends') {
          // wide invisible stroke so a dependency is easy to click (select / remove it)
          var hit = s('line', { class: 'mm-edge-hit' });
          hit.addEventListener('click', function (ev) { ev.stopPropagation(); onEdgeClick(e); });
          wrap.appendChild(hit);
          edgeEls[e.id] = { line: line, label: label, hit: hit, e: e };
        } else {
          edgeEls[e.id] = { line: line, label: label, e: e };
        }
        gEdges.appendChild(wrap);
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
      var g = s('g', { class: 'mm-node mm-node--' + n.kind, tabindex: '0', role: 'button', 'aria-label': n.label });
      var b = nodeBox(n);
      if (n.kind === 'task') {
        var rec = n.rec || {};
        var rect = s('rect', { class: 'mm-shape', x: -b.w / 2, y: -b.h / 2, width: b.w, height: b.h, rx: 8 });
        if (rec.color) rect.style.stroke = rec.color;
        g.appendChild(rect);
        g.appendChild(s('rect', { class: 'mm-stripe', x: -b.w / 2, y: -b.h / 2, width: 5, height: b.h, rx: 2, fill: rec.color || '#8590a2' }));
        var tx = s('text', { class: 'mm-label', x: -b.w / 2 + 14, y: 4 });
        tx.textContent = clip(n.label, 24);
        g.appendChild(tx);
        if (typeof rec.progress === 'number' && rec.progress > 0) {
          g.appendChild(s('rect', { class: 'mm-progress', x: -b.w / 2 + 8, y: b.h / 2 - 5, width: Math.max(0, (b.w - 16) * Math.min(100, rec.progress) / 100), height: 2.5, rx: 1 }));
        }
      } else if (n.kind === 'person') {
        g.appendChild(s('circle', { class: 'mm-shape', r: 20 }));
        var it = s('text', { class: 'mm-initials', 'text-anchor': 'middle', y: 4 });
        it.textContent = initials(n.label);
        g.appendChild(it);
        var pl = s('text', { class: 'mm-label mm-label--below', 'text-anchor': 'middle', y: 36 });
        pl.textContent = clip(n.label, 20);
        g.appendChild(pl);
      } else {
        g.appendChild(s('rect', { class: 'mm-shape', x: -b.w / 2, y: -b.h / 2, width: b.w, height: b.h, rx: 14 }));
        var lt = s('text', { class: 'mm-label', 'text-anchor': 'middle', y: 4 });
        lt.textContent = clip(n.label, 22);
        g.appendChild(lt);
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
      var p1 = edgePoint(a, b.x, b.y);
      var p2 = edgePoint(b, a.x, a.y);
      [ref.line, ref.hit].forEach(function (l) {
        if (!l) return;
        l.setAttribute('x1', p1.x.toFixed(1)); l.setAttribute('y1', p1.y.toFixed(1));
        l.setAttribute('x2', p2.x.toFixed(1)); l.setAttribute('y2', p2.y.toFixed(1));
      });
      ref.label.setAttribute('x', ((p1.x + p2.x) / 2).toFixed(1));
      ref.label.setAttribute('y', ((p1.y + p2.y) / 2 - 4).toFixed(1));
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

    svg.addEventListener('pointerdown', function (ev) {
      if (ev.button) return;
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
        if (!moved && state.selected) select(null);
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

    renderBar();
    return reload();
  }

  global.MindmapUI = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
