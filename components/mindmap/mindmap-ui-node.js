/**
 * mindmap-ui: mount() part 1 of 3.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see mindmap-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.MindmapUiParts = global.MindmapUiParts || {});
  var P = (global.MindmapUiPartsMountMount = global.MindmapUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.legendItem = function legendItem(kind, label) {
      return S.h('span', { class: 'mm-legend-item' }, [
        S.h('span', { class: 'mm-swatch mm-swatch--' + kind }),
        label,
      ]);
    };
    M.setStatus = function setStatus(text, kind, openHistory) {
      M.state.status = text || '';
      M.state.statusKind = kind || '';
      M.state.statusOpen = kind === 'ok' ? openHistory || null : null;
      clearTimeout(M.statusTimer);
      if (text && kind !== 'error' && kind !== 'busy') M.statusTimer = setTimeout(function () { M.setStatus(''); M.renderBar(); }, 2500);
      M.renderBar();
    };
    M.recById = function recById(id) {
      for (var i = 0; i < M.state.records.length; i++) if (M.state.records[i].id === id) return M.state.records[i];
      return null;
    };
    M.nodeById = function nodeById(id) {
      for (var i = 0; i < M.state.graph.nodes.length; i++) if (M.state.graph.nodes[i].id === id) return M.state.graph.nodes[i];
      return null;
    };
    M.edgeById = function edgeById(id) {
      for (var i = 0; i < M.state.graph.edges.length; i++) if (M.state.graph.edges[i].id === id) return M.state.graph.edges[i];
      return null;
    };
    M.levelOf = function levelOf(n) {
      return n && n.kind === 'goal' ? S.MM().levelById(n.level) : null;
    };
    M.kindLabel = function kindLabel(n) {
      if (!n) return '';
      var lv = M.levelOf(n);
      return lv ? lv.label : n.kind === 'task' ? 'Tâche' : n.kind === 'person' ? 'Personne' : 'Lieu';
    };
    M.nodeIcon = function nodeIcon(n) {
      var lv = M.levelOf(n);
      return lv ? lv.icon : n.kind === 'task' ? 'checkbox' : n.kind === 'person' ? 'user' : 'map-pin';
    };
    M.tool = function tool(iconName, label, opts) {
      opts = opts || {};
      var glyph = S.icon(iconName);
      glyph.setAttribute('aria-hidden', 'true');
      var kids = [glyph];
      if (opts.badge) kids.push(S.h('span', { class: 'mm-tool-n', text: opts.badge }));
      var attrs = {
        class: 'mm-tool' + (opts.armed ? ' is-armed' : (opts.pressed ? ' is-on' : '')) + (opts.menu ? ' mm-tool--menu' : '') + (opts.extra ? ' ' + opts.extra : ''),
        type: 'button',
        title: opts.title || label,
        'aria-label': label,
        onclick: opts.onclick,
      };
      if (opts.toggle !== false) attrs['aria-pressed'] = opts.pressed ? 'true' : 'false';
      if (opts.menu) attrs['aria-haspopup'] = 'menu';
      return S.h('button', attrs, kids);
    };
    M.toolSep = function toolSep() {
      return S.h('span', { class: 'mm-tool-sep', 'aria-hidden': 'true' });
    };
    M.showTool = function showTool(key, iconName, label) {
      return M.tool(iconName, label, {
        pressed: !!M.state.show[key],
        onclick: function () { M.state.show[key] = !M.state.show[key]; M.rebuild({ relayout: true }); },
      });
    };
    M.renderBar = function renderBar() {
      var filter = S.h('input', {
        class: 'mm-filter tp-search-input', type: 'search', placeholder: 'Rechercher…', value: M.state.filter,
        'aria-label': 'Rechercher',
      });
      filter.addEventListener('input', function () {
        M.state.filter = filter.value;
        clearTimeout(filter._t);
        filter._t = setTimeout(function () { M.rebuild({ relayout: true, keepFocus: true }); }, 180);
      });
      var tasks = M.state.graph.nodes.filter(function (n) { return n.kind === 'task'; }).length;
      var kids = [
        S.h('span', { class: 'mm-search tp-search' }, [S.icon('search'), filter]),
        S.h('div', { class: 'mm-tools', role: 'group', 'aria-label': 'Outils' }, [
          M.showTool('depends', 'arrow-curve-right', 'Dépendances'),
          M.showTool('by', 'user', 'Personnes'),
          M.showTool('at', 'map-pin', 'Lieux'),
          M.showTool('goals', 'target-arrow', 'Objectifs'),
          M.toolSep(),
          M.tool('link', 'Relier', {
            pressed: !!M.state.linkFrom,
            title: 'Relier',
            onclick: function () {
              if (M.state.linkFrom) return M.endLink();
              var n = M.state.selected && M.nodeById(M.state.selected);
              if (n && S.MM().rankOf(n) >= 0) M.startLink(n.id);
              else M.setStatus('Sélectionnez d’abord une tâche ou un objectif', 'error');
            },
          }),
          M.tool('plus', 'Ajouter', {
            toggle: false,
            title: 'Ajouter',
            onclick: function () { M.openComposer(); },
          }),
          M.toolSep(),
          M.tool('hierarchy-3', 'Hiérarchie', {
            pressed: M.state.layout === 'tree',
            title: 'Hiérarchie',
            onclick: function () { M.state.layout = M.state.layout === 'tree' ? 'free' : 'tree'; M.rebuild({ relayout: true, fresh: true }); },
          }),
          M.tool((S.MM().perspectiveById(M.state.persp ? M.state.persp.id : 'network') || {}).icon || 'topology-star-3', 'Perspective', {
            pressed: !!M.state.persp,
            menu: true,
            extra: 'mm-persp-btn',
            title: 'Perspective',
            onclick: function (ev) { M.openPerspMenu(ev.currentTarget); },
          }),
          M.tool('circle-dashed', 'Groupes', {
            pressed: !!M.state.groupsOn,
            menu: true,
            extra: 'mm-lens-btn',
            title: 'Groupes',
            onclick: function (ev) { M.openLensMenu(ev.currentTarget); },
          }),
          M.toolSep(),
          M.tool('pointer', 'Pointeur', {
            pressed: !M.state.marqueeTool,
            armed: !M.state.marqueeTool,
            title: 'Pointeur',
            onclick: function () {
              if (!M.state.marqueeTool) return;
              M.state.marqueeTool = false;
              M.root.classList.remove('is-marquee');
              M.renderBar();
            },
          }),
          M.tool('marquee-2', 'Sélection', {
            pressed: !!M.state.marqueeTool,
            armed: !!M.state.marqueeTool,
            title: 'Sélection',
            onclick: function () {
              if (M.state.marqueeTool) return;
              M.state.marqueeTool = true;
              M.root.classList.add('is-marquee');
              M.renderBar();
            },
          }),
          M.tool('grid-dots', 'Grille', {
            pressed: !!M.state.snap,
            title: 'Grille',
            onclick: function () {
              M.state.snap = !M.state.snap;
              try { localStorage.setItem('tp-mindmap-snap', M.state.snap ? '1' : '0'); } catch (e) { /* ignore */ }
              M.renderBar();
            },
          }),
        ]),
        M.state.goalsAuth === false ? S.h('button', {
          class: 'mm-btn mm-btn--primary',
          title: 'Trello doit être autorisé pour lire et enregistrer les objectifs',
          onclick: function () { M.authorizeGoals(); },
        }, [S.icon('key'), 'Autoriser Trello']) : null,
        S.h('span', { class: 'mm-spacer' }),
      ];
      if (M.state.status) {
        var statusKids = M.state.statusKind === 'busy' ? [S.h('i', { class: 'ti ti-loader-2 mm-spin', 'aria-hidden': 'true' }), M.state.status] : [M.state.status];
        if (M.state.statusOpen) statusKids = [S.h('button', { class: 'hp-status-link', title: 'Ouvrir l’historique', onclick: M.state.statusOpen }, [M.state.status])];
        kids.push(S.h('span', { class: 'mm-status' + (M.state.statusKind ? ' is-' + M.state.statusKind : '') }, statusKids));
      }
      kids.push(S.h('span', { class: 'mm-count' }, [tasks + (tasks > 1 ? ' tâches' : ' tâche')]));
      var doneCount = M.state.records.filter(function (r) { return S.MM().isClosed(r); }).length;
      kids.push(S.h('div', { class: 'mm-tools', role: 'group', 'aria-label': 'Affichage' }, [
        M.tool(M.HD.icon(M.state.hideDone), M.HD.label(M.state.hideDone, doneCount), {
          pressed: M.state.hideDone,
          title: M.HD.title(M.state.hideDone),
          badge: M.state.hideDone && doneCount ? String(Math.min(doneCount, 99)) : '',
          onclick: function () { M.HD.set(!M.state.hideDone); },
        }),
        M.toolSep(),
        M.tool('zoom-out', 'Dézoomer', { toggle: false, onclick: function () { M.zoomBy(1 / 1.25); } }),
        S.h('button', {
          class: 'mm-tool mm-tool--zoom mm-zoom',
          type: 'button',
          title: 'Zoom 100 %',
          'aria-label': 'Zoom 100 %',
          onclick: function () { M.zoomBy(1 / M.state.view.k); },
        }, [Math.round(M.state.view.k * 100) + ' %']),
        M.tool('zoom-in', 'Zoomer', { toggle: false, onclick: function () { M.zoomBy(1.25); } }),
        M.toolSep(),
        M.tool('focus-2', 'Recentrer', { toggle: false, onclick: M.fit }),
        M.tool('layout-grid', 'Réorganiser', { toggle: false, onclick: function () { M.rebuild({ relayout: true, fresh: true }); } }),
        M.tool('refresh', 'Actualiser', { toggle: false, onclick: function () { M.reload().then(M.loadGoals); } }),
      ]));
      M.els.bar.textContent = '';
      kids.forEach(function (k) { if (k) M.els.bar.appendChild(k); });
      if (document.activeElement === document.body && M.state.filter) {
        // keep typing flow after a re-render triggered by the filter
        var f = M.els.bar.querySelector('.mm-filter');
        if (f) { f.focus(); var l = f.value.length; f.setSelectionRange(l, l); }
      }
    };
    M.rebuild = function rebuild(opts) {
      opts = opts || {};
      M.parkOrbit();
      var prev = Object.create(null);
      M.state.graph.nodes.forEach(function (n) { if (isFinite(n.x)) prev[n.id] = { x: n.x, y: n.y }; });
      var g = S.MM().buildGraph(M.state.pending.length ? M.state.records.concat(M.state.pending) : M.state.records, { hideDone: M.state.hideDone, filter: M.state.filter, show: M.state.show, goals: M.state.goals });
      var anyNew = false;
      g.nodes.forEach(function (n) {
        M.measure(n);
        n.fixed = false;
        if (M.state.dropPos[n.id]) { n.x = M.state.dropPos[n.id].x; n.y = M.state.dropPos[n.id].y; n.pinned = true; n.fixed = true; n.placed = true; delete M.state.dropPos[n.id]; }
        else if (!opts.fresh && prev[n.id] && !opts.relayout) { n.x = prev[n.id].x; n.y = prev[n.id].y; n.pinned = true; n.fixed = true; }
        else anyNew = true;
      });
      if (opts.relayout && M.state.layout === 'tree') {
        S.MM().layoutHierarchy(g.nodes, g.edges, { cardW: 230, ringGap: 280 });
        M.separate(g.nodes);
      } else if (opts.relayout || anyNew) {
        if (!opts.relayout) M.placeNearNeighbours(g);
        S.MM().layout(g.nodes, g.edges);
        // the model lays out points; cards are bigger, so open the layout up and then push overlaps apart
        g.nodes.forEach(function (n) { if (!n.fixed && !n.placed) { n.x *= 1.5; n.y *= 1.3; } });
        M.separate(g.nodes);
      }
      g.nodes.forEach(function (n) { n.pinned = false; });
      M.state.graph = g;
      M.state.cycles = {};
      S.MM().findCycles(g.edges).forEach(function (id) { M.state.cycles[id] = true; });
      if (M.state.selected && !M.nodeById(M.state.selected)) M.state.selected = null;
      if (M.state.selectedEdge && !M.edgeById(M.state.selectedEdge)) M.state.selectedEdge = null;
      Object.keys(M.state.multi).forEach(function (id) { if (!M.nodeById(id)) delete M.state.multi[id]; });
      if (M.state.relink && !M.edgeById(M.state.relink)) M.state.relink = null;
      if (M.state.linkFrom && !M.nodeById(M.state.linkFrom)) M.state.linkFrom = null;
      if (M.state.persp) {
        var again = M.state.persp.id;
        M.state.persp = null;
        M.renderBar();
        M.renderGraph();
        M.renderPanel();
        M.showPerspective(again, false);
        return;
      }
      if (M.state.selected && M.nodeById(M.state.selected)) M.beginOrbit(false);
      M.renderBar();
      M.renderGraph();
      M.renderPanel();
      if (opts.relayout || !opts.keepView) M.fit();
    };
    M.measure = function measure(n) {
      var rec = n.rec || {};
      var iconW = n.kind === 'task' ? 0 : 30;
      n.w = n.kind === 'task' ? 210 : n.kind === 'person' ? 180 : n.kind === 'goal' ? 210 : 170;
      n.lines = S.wrap(n.label, Math.floor((n.w - 24 - iconW) / S.CHAR_W), 5);
      n.headH = Math.max(n.kind === 'task' ? 0 : 34, n.lines.length * S.LINE_H + S.HEAD_PAD * 2 - 2);
      n.bodyH = n.kind === 'goal' ? 24 : n.kind === 'task' ? 26 : 0;
      n.h = n.headH + n.bodyH;
    };
    M.placeNearNeighbours = function placeNearNeighbours(g) {
      var byId = Object.create(null);
      g.nodes.forEach(function (n) { byId[n.id] = n; });
      var used = Object.create(null);
      g.nodes.forEach(function (n) {
        if (n.fixed) return;
        var anchorNode = null;
        g.edges.forEach(function (e) {
          var other = e.from === n.id ? byId[e.to] : e.to === n.id ? byId[e.from] : null;
          if (other && other.fixed && !anchorNode) anchorNode = other;
        });
        if (!anchorNode) return;
        var k = (used[anchorNode.id] = (used[anchorNode.id] || 0) + 1);
        var len = Math.sqrt(anchorNode.x * anchorNode.x + anchorNode.y * anchorNode.y) || 1;
        var ux = anchorNode.x / len;
        var uy = anchorNode.y / len;
        if (len < 2) { ux = 1; uy = 0; }
        // outward, fanned sideways for each further card on the same anchor
        var side = (k % 2 ? 1 : -1) * Math.ceil(k / 2);
        n.x = anchorNode.x + ux * 280 - uy * 150 * side;
        n.y = anchorNode.y + uy * 280 + ux * 150 * side;
        n.pinned = true;
        n.placed = true;
      });
    };
    M.nodeBox = function nodeBox(n) {
      return { w: n.w || 180, h: n.h || 40 };
    };
    M.separate = function separate(nodes) {
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
    };
    M.anchor = function anchor(n, side) {
      var d = S.SIDES[side];
      return { x: n.x + d.nx * n.w / 2, y: n.y + d.ny * n.h / 2, nx: d.nx, ny: d.ny, side: side };
    };
    M.facing = function facing(a, b) {
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var horizontal = Math.abs(dx) / ((a.w + b.w) / 2) >= Math.abs(dy) / ((a.h + b.h) / 2);
      if (horizontal) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
      return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
    };
    M.wirePath = function wirePath(p1, p2) { return global.GraphCanvas.wirePath(p1, p2); };
    M.arrowJoin = function arrowJoin(p2, dist) { return global.GraphCanvas.arrowJoin(p2, dist); };
    M.seatDash = function seatDash(path) {
      if (!path || !path.classList.contains('mm-edge--sub')) return;
      var len = 0;
      try { len = path.getTotalLength(); } catch (e) { len = 0; }
      if (!len) return;
      var dash = 2;
      var period = dash + 4;
      path.style.strokeDashoffset = String((len % period) - dash / 2);
    };
    M.renderGraph = function renderGraph() {
      M.gEdges.textContent = '';
      M.gNodes.textContent = '';
      M.nodeEls = Object.create(null);
      M.edgeEls = Object.create(null);
      var graph = M.state.graph;
      graph.edges.forEach(function (e) {
        var cls = e.kind === 'depends' ? 'depends' : e.kind === 'by' ? 'by' : e.kind === 'serves' ? 'serves' : e.kind === 'sub' ? 'sub' : 'at';
        var glow = S.s('path', { class: 'mm-edge-glow mm-edge-glow--' + cls });
        var line = S.s('path', { class: 'mm-edge mm-edge--' + cls + (M.state.cycles[e.from] && M.state.cycles[e.to] && e.kind === 'depends' ? ' is-cycle' : '') });
        var arrow = S.s('path', { class: 'mm-arrow mm-arrow--' + cls });
        var neck = S.s('path', { class: 'mm-edge-neck mm-edge-neck--' + cls });
        var title = S.s('title');
        title.textContent = M.edgeLabel(e);
        line.appendChild(title);
        var label = S.s('text', { class: 'mm-edge-label mm-edge-label--' + cls, 'text-anchor': 'middle' });
        label.textContent = M.edgeLabel(e);
        var wrapG = S.s('g', { class: 'mm-wire-group' }, [glow, line, neck, arrow, label]);
        // wide invisible stroke so any link is easy to click (select / delete / change it)
        var hit = S.s('path', { class: 'mm-edge-hit', 'data-edge': e.id });
        hit.addEventListener('click', function (ev) { ev.stopPropagation(); M.onEdgeClick(e); });
        wrapG.appendChild(hit);
        M.edgeEls[e.id] = { line: line, glow: glow, arrow: arrow, neck: neck, label: label, title: title, hit: hit, e: e };
        M.gEdges.appendChild(wrapG);
      });
      graph.nodes.forEach(function (n) {
        var g = M.buildNodeEl(n);
        M.nodeEls[n.id] = g;
        M.gNodes.appendChild(g);
      });
      if (global.Isolation) {
        var isoRows = [];
        (M.state.graph.nodes || []).forEach(function (n) {
          if (n && n.kind === 'task' && n.rec) isoRows.push(n.rec);
        });
        global.Isolation.adopt(M.t, isoRows);
      }
      M.positionAll();
      M.applyFocus();
      M.applyLod(true);
      M.syncOrbitRing();
      if (global.InsertGap) {
        global.InsertGap.watch(M.els.canvas, {
          item: '.mm-node--task',
          mode: 'under',
          float: true,
          placeholder: 'Titre…',
          onCreate: function (title, info) {
            var id = info.above && info.above.getAttribute('data-id');
            var n = id && M.nodeById(id);
            if (!n || n.kind !== 'task') return Promise.resolve();
            return M.createTaskAt(n, 'bottom', { x: n.x, y: n.y }, title);
          },
        });
      }
    };
    M.buildNodeEl = function buildNodeEl(n) {
      var g = S.s('g', { class: 'mm-node mm-node--' + n.kind, tabindex: '0', role: 'button', 'aria-label': n.label, 'data-id': n.id });
      var rec = n.rec || {};
      var lv = M.levelOf(n);
      var accent = n.kind === 'task' ? (rec.color || 'hsl(210 62% 58%)') : n.kind === 'subtask' ? 'hsl(200 40% 62%)' : n.kind === 'person' ? 'hsl(' + S.hueOf(n.label) + ' 55% 62%)' : lv ? 'hsl(' + lv.hue + ' 70% 60%)' : 'hsl(150 50% 46%)';
      g.style.setProperty('--mm-accent', accent);
      if (n.bodyH) g.setAttribute('data-body', '');
      var x0 = -n.w / 2;
      var y0 = -n.h / 2;
      var corner = n.kind === 'person' ? 16 : n.kind === 'place' ? 4 : n.kind === 'goal' ? 14 : 9;
      if (n.headH && corner > n.headH / 2) corner = Math.max(4, n.headH / 2);
      g.appendChild(S.s('rect', { class: 'mm-shape', x: x0, y: y0, width: n.w, height: n.h, rx: corner }));
      g.appendChild(S.s('path', { class: 'mm-head', d: S.topRounded(x0, y0, n.w, n.headH, corner) }));
      g.appendChild(S.s('line', { class: 'mm-head-rule', x1: x0, x2: x0 + n.w, y1: y0 + n.headH, y2: y0 + n.headH }));
      var textX = x0 + 12;
      if (n.kind !== 'task') {
        var cy = y0 + n.headH / 2;
        textX = x0 + 42;
        if (n.kind === 'goal' && n.level === 'project' && global.ProjectIcon) {
          var projBtn = global.ProjectIcon.button({
            t: M.t,
            id: n.id,
            icon: n.icon,
            goals: function () { return M.state.goals; },
            className: 'ip-glyph mm-proj-ico',
            onSaved: function (saved) {
              if (saved) M.state.goals = saved;
              M.renderGraph();
            },
          });
          if (projBtn) {
            var fo = S.s('foreignObject', { x: x0 + 15, y: cy - 9, width: 18, height: 18 });
            fo.appendChild(projBtn);
            g.appendChild(fo);
          } else {
            g.appendChild(S.s('circle', { class: 'mm-avatar', cx: x0 + 24, cy: cy, r: 13 }));
            var miss = S.s('text', { class: 'mm-initials', 'text-anchor': 'middle', x: x0 + 24, y: cy + 4 });
            miss.textContent = lv ? lv.label.charAt(0) : S.initials(n.label);
            g.appendChild(miss);
          }
        } else if (n.kind === 'person' || n.kind === 'goal') {
          g.appendChild(S.s('circle', { class: 'mm-avatar', cx: x0 + 24, cy: cy, r: 13 }));
          var it = S.s('text', { class: 'mm-initials', 'text-anchor': 'middle', x: x0 + 24, y: cy + 4 });
          it.textContent = lv ? lv.label.charAt(0) : S.initials(n.label);
          g.appendChild(it);
        } else if (n.kind === 'subtask') {
          g.appendChild(S.s('circle', { class: 'mm-avatar', cx: x0 + 24, cy: cy, r: 11 }));
          g.appendChild(S.s('path', { class: 'mm-check', d: 'M' + (x0 + 19) + ',' + cy + 'l4,4l7,-8', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
        } else {
          g.appendChild(S.s('path', {
            class: 'mm-pinicon',
            d: 'M' + (x0 + 24) + ',' + (cy + 9) + 'C' + (x0 + 14) + ',' + (cy - 1) + ' ' + (x0 + 15) + ',' + (cy - 9) + ' ' + (x0 + 24) + ',' + (cy - 9) +
              'C' + (x0 + 33) + ',' + (cy - 9) + ' ' + (x0 + 34) + ',' + (cy - 1) + ' ' + (x0 + 24) + ',' + (cy + 9) + 'Z',
          }));
          g.appendChild(S.s('circle', { class: 'mm-pinhole', cx: x0 + 24, cy: cy - 3, r: 2.6 }));
        }
      }
      n.lines.forEach(function (line, i) {
        var tx = S.s('text', { class: 'mm-label', x: textX, y: y0 + S.HEAD_PAD + 12 + i * S.LINE_H });
        tx.textContent = line;
        g.appendChild(tx);
      });
      if (n.kind === 'goal') {
        var gt = S.s('text', { class: 'mm-sub mm-level', x: x0 + 12, y: y0 + n.headH + 16 });
        gt.textContent = lv ? lv.label.toUpperCase() : '';
        g.appendChild(gt);
      } else if (n.bodyH) {
        var by = y0 + n.headH;
        var hasProgress = n.kind === 'task';
        var prog = typeof rec.progress === 'number' ? Math.max(0, Math.min(100, rec.progress)) : 0;
        if (rec.listName) {
          var lt = S.s('text', { class: 'mm-sub', x: x0 + 12, y: by + 17 });
          lt.textContent = S.clip(rec.listName, hasProgress ? 12 : 30);
          g.appendChild(lt);
        }
        if (hasProgress) {
          var pw = 50;
          var px = x0 + n.w - 12 - pw - 30;
          if (global.ProgressRing) {
            var ring = global.ProgressRing.create(prog, rec.blocked);
            ring.setAttribute('x', px - 20);
            ring.setAttribute('y', by + 6);
            ring.setAttribute('width', 14);
            ring.setAttribute('height', 14);
            if (rec.blocked) {
              var ringTitle = S.s('title');
              ringTitle.textContent = 'Bloqué — cliquer pour débloquer';
              ring.appendChild(ringTitle);
              ring.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
              ring.addEventListener('click', function (ev) {
                ev.stopPropagation();
                M.runEdit(function () { return global.GanttTrello.setCardBlocked(M.t, rec.id, false); });
              });
            } else {
              ring.style.pointerEvents = 'none';
            }
            g.appendChild(ring);
          }
          g.appendChild(S.s('rect', { class: 'mm-progress-track', x: px, y: by + 11, width: pw, height: 4, rx: 2 }));
          var fillEl = S.s('rect', { class: 'mm-progress' + (rec.blocked ? ' is-blocked' : ''), x: px, y: by + 11, width: pw * prog / 100, height: 4, rx: 2 });
          g.appendChild(fillEl);
          var pt = S.s('text', { class: 'mm-sub' + (rec.blocked ? ' is-blocked' : ''), x: x0 + n.w - 12, y: by + 16, 'text-anchor': 'end' });
          pt.textContent = Math.round(prog) + '%';
          g.appendChild(pt);
          // drag the slider in place (without moving the card)
          var sliderHit = S.s('rect', { class: 'mm-progress-hit', x: px - 4, y: by + 4, width: pw + 8, height: 18 });
          var sliderTitle = S.s('title');
          sliderTitle.textContent = 'Glisser pour régler le progrès';
          sliderHit.appendChild(sliderTitle);
          sliderHit.addEventListener('pointerdown', function (ev) {
            if (ev.button) return;
            ev.stopPropagation();
            ev.preventDefault();
            var val = Math.round(prog);
            function at(x) {
              var r = sliderHit.getBoundingClientRect();
              var pad = r.width * 4 / (pw + 8);
              var inner = r.width - 2 * pad;
              return inner > 0 ? Math.max(0, Math.min(100, Math.round((x - r.left - pad) / inner * 100))) : val;
            }
            function move(e) {
              val = at(e.clientX);
              fillEl.setAttribute('width', pw * val / 100);
              pt.textContent = val + '%';
              if (ring && global.ProgressRing.set) global.ProgressRing.set(ring, val);
            }
            function up() {
              document.removeEventListener('pointermove', move);
              document.removeEventListener('pointerup', up);
              document.removeEventListener('pointercancel', up);
              if (val !== Math.round(prog)) M.runEdit(function () { return M.writeProgressTo(rec.id, val); }, M.progressEntry(rec, Math.round(prog), val));
            }
            move(ev);
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', up);
            document.addEventListener('pointercancel', up);
          });
          g.appendChild(sliderHit);
        }
      }
      if (n.kind === 'task' || n.kind === 'goal') {
        Object.keys(S.SIDES).forEach(function (side) {
          var a = M.anchor({ x: 0, y: 0, w: n.w, h: n.h }, side);
          var pin = S.s('g', { class: 'mm-pin', transform: 'translate(' + a.x + ',' + a.y + ')', 'data-side': side });
          pin.appendChild(S.s('circle', { class: 'mm-pin-hit', r: 11 }));
          pin.appendChild(S.s('circle', { class: 'mm-pin-dot', r: 5 }));
          pin.addEventListener('pointerdown', function (ev) { M.startWireDrag(ev, n, side); });
          g.appendChild(pin);
        });
      }
      var title = S.s('title');
      title.textContent = n.label;
      g.appendChild(title);
      M.attachNodeEvents(g, n);
      if (n.kind === 'task') g.setAttribute('data-iso-card', (n.rec && n.rec.id) || String(n.id || '').replace(/^t:/, ''));
      else if (n.kind === 'subtask' && n.parentId) {
        var subItem = String(n.id || '').split(':').slice(2).join(':');
        if (subItem) g.setAttribute('data-iso-sub', 'sub:' + n.parentId + ':' + subItem);
      } else if (n.kind === 'person') g.setAttribute('data-iso-person', String(n.id || '').replace(/^p:/, ''));
      else if (n.kind === 'goal' && n.level === 'project') {
        g.setAttribute('data-iso-project', n.id);
        g.setAttribute('data-iso-label', n.label || '');
      }
      return g;
    };
    M.positionAll = function positionAll() {
      M.state.graph.nodes.forEach(M.positionNode);
      M.state.graph.edges.forEach(M.positionEdge);
    };
    M.positionNode = function positionNode(n) {
      var g = M.nodeEls[n.id];
      if (g) g.setAttribute('transform', 'translate(' + n.x.toFixed(1) + ',' + n.y.toFixed(1) + ')');
    };
    M.positionEdge = function positionEdge(e) {
      var ref = M.edgeEls[e.id];
      var read = S.MM().relationPhrase(e, M.state.selected, M.nodeById);
      var a = M.nodeById(read.from);
      var b = M.nodeById(read.to);
      if (!ref || !a || !b) return;
      if (ref.label) ref.label.textContent = read.text;
      if (ref.title) ref.title.textContent = read.text;
      var sides = M.facing(a, b);
      var p1 = M.anchor(a, sides[0]);
      var p2 = M.anchor(b, sides[1]);
      // the wire stops just outside each card so the pin and arrowhead stay visible
      p1.x += p1.nx * S.PIN_GAP; p1.y += p1.ny * S.PIN_GAP;
      p2.x += p2.nx * S.PIN_GAP; p2.y += p2.ny * S.PIN_GAP;
      var dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      var join = M.arrowJoin(p2, dist);
      var base = join.base;
      var room = Math.max(0, dist - 12);
      var neckLen = Math.min(16, room * 0.35);
      var end = base;
      if (ref.neck && neckLen >= 6) {
        var sx = base.x + base.nx * neckLen;
        var sy = base.y + base.ny * neckLen;
        ref.neck.setAttribute('display', '');
        ref.neck.setAttribute('d', 'M' + sx.toFixed(1) + ',' + sy.toFixed(1) + ' L' + base.x.toFixed(1) + ',' + base.y.toFixed(1));
        end = { x: sx, y: sy, nx: base.nx, ny: base.ny };
      } else if (ref.neck) ref.neck.setAttribute('display', 'none');
      var d = M.wirePath(p1, end);
      if (ref.line) ref.line.setAttribute('d', d);
      if (ref.glow) ref.glow.setAttribute('d', d);
      if (ref.hit) ref.hit.setAttribute('d', M.wirePath(p1, p2));
      if (ref.arrow) ref.arrow.setAttribute('d', join.d);
      M.seatDash(ref.line);
      // sit the phrase nearer the object, off the wire, so several links from one node don't share one spot
      var dx = p2.x - p1.x;
      var dy = p2.y - p1.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var mx = p1.x + dx * 0.62;
      var my = p1.y + dy * 0.62;
      ref.label.setAttribute('x', (mx - dy / len * 14).toFixed(1));
      ref.label.setAttribute('y', (my + dx / len * 14).toFixed(1));
      ref.ends = [p1, p2];
      if (M.state.selectedEdge === e.id) M.drawHandles();
    };
    M.drawHandles = function drawHandles() {
      M.gHandles.textContent = '';
      var e = M.state.selectedEdge && M.edgeById(M.state.selectedEdge);
      var ref = e && M.edgeEls[e.id];
      if (!ref || !ref.ends || (e.kind !== 'depends' && e.kind !== 'serves')) return;
      ['from', 'to'].forEach(function (end, i) {
        var c = S.s('circle', { class: 'mm-edge-handle', r: 7, cx: ref.ends[i].x.toFixed(1), cy: ref.ends[i].y.toFixed(1) });
        var t = S.s('title');
        t.textContent = 'Glisser sur une autre carte pour déplacer ce bout du lien';
        c.appendChild(t);
        c.addEventListener('pointerdown', function (ev) { M.startEndDrag(ev, e, end); });
        M.gHandles.appendChild(c);
      });
    };
    M.startEndDrag = function startEndDrag(ev, e, end) {
      if (ev.button) return;
      ev.stopPropagation();
      ev.preventDefault();
      var fixed = M.nodeById(end === 'to' ? e.from : e.to);
      var ref = M.edgeEls[e.id];
      if (!fixed || !ref) return;
      var temp = S.s('path', { class: 'mm-wire-temp' });
      M.gEdges.appendChild(temp);
      M.root.classList.add('is-wiring');
      var target = null;
      function toGraph(me) {
        var r = M.svg.getBoundingClientRect();
        return { x: (me.clientX - r.left - M.state.view.x) / M.state.view.k, y: (me.clientY - r.top - M.state.view.y) / M.state.view.k };
      }
      function move(me) {
        var el = document.elementFromPoint(me.clientX, me.clientY);
        var ng = el && el.closest && el.closest('.mm-node--task, .mm-node--goal');
        var id = ng && ng.getAttribute('data-id');
        id = id && id !== fixed.id ? id : null;
        if (id !== target) {
          if (target && M.nodeEls[target]) M.nodeEls[target].classList.remove('is-drop-target');
          target = id;
          if (target && M.nodeEls[target]) M.nodeEls[target].classList.add('is-drop-target');
        }
        var p = toGraph(me);
        var tn = target && M.nodeById(target);
        var far = tn ? M.anchor(tn, M.facing(fixed, tn)[1]) : { x: p.x, y: p.y, nx: 0, ny: 0 };
        var near = end === 'to' ? ref.ends[0] : ref.ends[1];
        var a = end === 'to' ? near : far;
        var b = end === 'to' ? far : near;
        temp.setAttribute('d', M.wirePath({ x: a.x, y: a.y, nx: a.nx || 0, ny: a.ny || 0 }, { x: b.x, y: b.y, nx: b.nx || 0, ny: b.ny || 0 }));
      }
      function done() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', done);
        if (target && M.nodeEls[target]) M.nodeEls[target].classList.remove('is-drop-target');
        if (temp.parentNode) temp.parentNode.removeChild(temp);
        M.root.classList.remove('is-wiring');
      }
      function up() {
        var id = target;
        done();
        if (id) (end === 'to' ? M.retarget(e, M.nodeById(id)) : M.resource(e, M.nodeById(id)));
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', done);
      move(ev);
    };
    M.applyFocus = function applyFocus() {
      var focus = M.state.selected;
      var selEdge = M.state.selectedEdge && M.edgeById(M.state.selectedEdge);
      var near = focus ? S.MM().neighbours(M.state.graph.edges, focus) : null;
      M.state.graph.nodes.forEach(function (n) {
        var g = M.nodeEls[n.id];
        if (!g) return;
        var ring = M.state.rings && M.state.rings[n.id];
        var context = !!(focus && !selEdge && ring === 2);
        var lit = selEdge ? n.id === selEdge.from || n.id === selEdge.to : !focus || n.id === focus || near[n.id] || ring === 1;
        var receded = !!(M.state.persp && M.state.persp.dim[n.id] && n.id !== focus);
        g.classList.toggle('is-dim', (!lit && !context) || receded);
        g.classList.toggle('is-context', context);
        g.classList.toggle('is-selected', n.id === focus);
        g.classList.toggle('is-multi', !!M.state.multi[n.id]);
        g.classList.toggle('is-linking', n.id === M.state.linkFrom);
        g.classList.toggle('is-cycle', !!M.state.cycles[n.id]);
      });
      M.state.graph.edges.forEach(function (e) {
        var ref = M.edgeEls[e.id];
        if (!ref) return;
        var chosen = !!selEdge && e.id === selEdge.id;
        var lit = selEdge ? chosen : !focus || e.from === focus || e.to === focus;
        var contextEdge = !lit && !selEdge && !!focus && M.state.rings && (
          (M.state.rings[e.from] === 1 && M.state.rings[e.to] === 2) ||
          (M.state.rings[e.to] === 1 && M.state.rings[e.from] === 2)
        );
        var gone = !!(M.state.persp && (M.state.persp.dim[e.from] || M.state.persp.dim[e.to]) && e.from !== focus && e.to !== focus);
        var dimEdge = (!lit && !contextEdge) || gone;
        ref.line.classList.toggle('is-dim', dimEdge);
        ref.glow.classList.toggle('is-dim', dimEdge);
        if (ref.arrow) ref.arrow.classList.toggle('is-dim', dimEdge);
        if (ref.neck) ref.neck.classList.toggle('is-dim', dimEdge);
        ref.line.classList.toggle('is-context', !!contextEdge);
        ref.glow.classList.toggle('is-context', !!contextEdge);
        if (ref.arrow) ref.arrow.classList.toggle('is-context', !!contextEdge);
        if (ref.neck) ref.neck.classList.toggle('is-context', !!contextEdge);
        ref.line.classList.toggle('is-selected', chosen);
        ref.glow.classList.toggle('is-selected', chosen);
        ref.label.classList.toggle('is-shown', (!!focus || chosen) && lit);
        M.positionEdge(e);
      });
      M.drawSelectionBox();
      M.drawHandles();
    };
    M.dragGroup = function dragGroup(nodes, lead) {
      var dragging = {};
      nodes.forEach(function (m) { dragging[m.id] = true; });
      if (M.poseTargets) {
        M.state.graph.nodes.forEach(function (m) {
          if (dragging[m.id] || !M.poseTargets[m.id]) return;
          m.x = M.poseTargets[m.id].x;
          m.y = M.poseTargets[m.id].y;
        });
      }
      M.poseGen++;
      if (M.orbitFrame) clearInterval(M.orbitFrame);
      var hold = null;
      if (M.state.rest) {
        hold = {};
        nodes.forEach(function (m) {
          var home = M.state.rest[m.id];
          if (home) hold[m.id] = { dx: m.x - home.x, dy: m.y - home.y };
        });
      }
      var origin = nodes.map(function (m) { return { n: m, x: m.x, y: m.y }; });
      var x0 = lead.x, y0 = lead.y;
      var ids = {};
      nodes.forEach(function (m) { ids[m.id] = true; });
      var others = M.state.graph.nodes.filter(function (m) { return !ids[m.id] && (m.kind === 'task' || m.kind === 'goal'); });
      var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity; // bounding box of the dragged group at the start
      nodes.forEach(function (m) {
        var b = M.nodeBox(m);
        bx0 = Math.min(bx0, m.x - b.w / 2); bx1 = Math.max(bx1, m.x + b.w / 2);
        by0 = Math.min(by0, m.y - b.h / 2); by1 = Math.max(by1, m.y + b.h / 2);
      });
      return function (x, y, free) {
        if (M.state.snap && !free) { x = Math.round(x / S.GRID) * S.GRID; y = Math.round(y / S.GRID) * S.GRID; }
        var dx = x - x0, dy = y - y0;
        M.gGuides.textContent = '';
        if (!free && others.length) {
          // smart guides (like Miro / draw.io): snap edges and centres to those of the other cards
          var tol = 6 / M.state.view.k;
          var gx = null, gy = null;
          var mx = [bx0 + dx, (bx0 + bx1) / 2 + dx, bx1 + dx];
          var my = [by0 + dy, (by0 + by1) / 2 + dy, by1 + dy];
          others.forEach(function (o) {
            var b = M.nodeBox(o);
            var ox = [o.x - b.w / 2, o.x, o.x + b.w / 2];
            var oy = [o.y - b.h / 2, o.y, o.y + b.h / 2];
            mx.forEach(function (v) { ox.forEach(function (w) { var d = w - v; if (Math.abs(d) <= tol && (!gx || Math.abs(d) < Math.abs(gx.d))) gx = { d: d, at: w }; }); });
            my.forEach(function (v) { oy.forEach(function (w) { var d = w - v; if (Math.abs(d) <= tol && (!gy || Math.abs(d) < Math.abs(gy.d))) gy = { d: d, at: w }; }); });
          });
          if (gx) dx += gx.d;
          if (gy) dy += gy.d;
          var top = by0 + dy - 40, bottom = by1 + dy + 40, left = bx0 + dx - 40, right = bx1 + dx + 40;
          if (gx) M.gGuides.appendChild(S.s('line', { class: 'mm-guide', x1: gx.at, x2: gx.at, y1: top, y2: bottom }));
          if (gy) M.gGuides.appendChild(S.s('line', { class: 'mm-guide', y1: gy.at, y2: gy.at, x1: left, x2: right }));
        }
        origin.forEach(function (o) {
          o.n.x = o.x + dx;
          o.n.y = o.y + dy;
          M.positionNode(o.n);
          if (hold && hold[o.n.id] && M.state.rest && M.state.rest[o.n.id]) {
            M.state.rest[o.n.id].x = o.n.x - hold[o.n.id].dx;
            M.state.rest[o.n.id].y = o.n.y - hold[o.n.id].dy;
          }
          if (M.poseTargets) M.poseTargets[o.n.id] = { x: o.n.x, y: o.n.y };
        });
        M.state.graph.edges.forEach(function (e) { if (ids[e.from] || ids[e.to]) M.positionEdge(e); });
        M.drawSelectionBox();
        M.drawHulls();
      };
    };
    M.drawSelectionBox = function drawSelectionBox() {
      M.gBox.textContent = '';
      var nodes = M.pickedNodes();
      if (nodes.length < 2) return;
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      nodes.forEach(function (n) {
        var b = M.nodeBox(n);
        x0 = Math.min(x0, n.x - b.w / 2); x1 = Math.max(x1, n.x + b.w / 2);
        y0 = Math.min(y0, n.y - b.h / 2); y1 = Math.max(y1, n.y + b.h / 2);
      });
      var pad = 14;
      var rect = S.s('rect', { class: 'mm-selbox-rect', x: (x0 - pad).toFixed(1), y: (y0 - pad).toFixed(1), width: (x1 - x0 + pad * 2).toFixed(1), height: (y1 - y0 + pad * 2).toFixed(1), rx: 8 });
      rect.addEventListener('pointerdown', function (ev) {
        if (ev.button || M.state.marqueeTool || ev.shiftKey || ev.ctrlKey || ev.metaKey) return; // let the canvas start a rectangle
        ev.stopPropagation();
        var lead = nodes[0];
        var start = { x: ev.clientX, y: ev.clientY, nx: lead.x, ny: lead.y };
        var drag = M.dragGroup(nodes, lead);
        var moved = false;
        try { rect.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        function move(me) {
          var dx = me.clientX - start.x, dy = me.clientY - start.y;
          if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
          moved = true;
          drag(start.nx + dx / M.state.view.k, start.ny + dy / M.state.view.k, me.altKey);
        }
        function up() {
          rect.removeEventListener('pointermove', move);
          rect.removeEventListener('pointerup', up);
          rect.removeEventListener('pointercancel', up);
          M.gGuides.textContent = '';
          if (!moved) M.select(null);
        }
        rect.addEventListener('pointermove', move);
        rect.addEventListener('pointerup', up);
        rect.addEventListener('pointercancel', up);
      });
      M.gBox.appendChild(rect);
      M.gBox.appendChild(S.s('text', { class: 'mm-selbox-label', x: (x0 - pad + 6).toFixed(1), y: (y0 - pad - 5).toFixed(1), text: nodes.length + ' sélectionnés · glisser pour déplacer' }));
    };
    M.startMarquee = function startMarquee(ev) {
      var r = M.svg.getBoundingClientRect();
      function toGraph(me) { return { x: (me.clientX - r.left - M.state.view.x) / M.state.view.k, y: (me.clientY - r.top - M.state.view.y) / M.state.view.k }; }
      var additive = ev.shiftKey || ev.ctrlKey || ev.metaKey;
      var base = additive ? M.pickedNodes().reduce(function (o, n) { o[n.id] = true; return o; }, {}) : {};
      var a = toGraph(ev);
      var box = S.s('rect', { class: 'mm-marquee', x: a.x, y: a.y, width: 0, height: 0 });
      M.gTop.appendChild(box);
      var moved = false;
      try { M.svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      function move(me) {
        var p = toGraph(me);
        if (!moved && Math.abs(me.clientX - ev.clientX) + Math.abs(me.clientY - ev.clientY) < 4) return;
        moved = true;
        var x0 = Math.min(a.x, p.x), y0 = Math.min(a.y, p.y), x1 = Math.max(a.x, p.x), y1 = Math.max(a.y, p.y);
        box.setAttribute('x', x0); box.setAttribute('y', y0); box.setAttribute('width', x1 - x0); box.setAttribute('height', y1 - y0);
        var multi = Object.assign({}, base);
        M.state.graph.nodes.forEach(function (n) {
          if (n.kind !== 'task' && n.kind !== 'goal') return;
          var b = M.nodeBox(n);
          if (n.x + b.w / 2 >= x0 && n.x - b.w / 2 <= x1 && n.y + b.h / 2 >= y0 && n.y - b.h / 2 <= y1) multi[n.id] = true;
        });
        M.state.multi = multi;
        M.state.selected = null;
        M.state.selectedEdge = null;
        M.applyFocus();
        M.drawSelectionBox();
      }
      function up() {
        M.svg.removeEventListener('pointermove', move);
        M.svg.removeEventListener('pointerup', up);
        M.svg.removeEventListener('pointercancel', up);
        if (box.parentNode) box.parentNode.removeChild(box);
        if (!moved) { if (!additive) M.select(null); return; }
        if (M.state.rest) M.endOrbit(true);
        M.renderPanel();
        var count = Object.keys(M.state.multi).length;
        M.setStatus(count + (count > 1 ? ' éléments sélectionnés' : ' élément sélectionné'), 'ok');
      }
      M.svg.addEventListener('pointermove', move);
      M.svg.addEventListener('pointerup', up);
      M.svg.addEventListener('pointercancel', up);
    };
    M.attachNodeEvents = function attachNodeEvents(g, n) {
      var moved = false;
      var modKey = false;
      g.addEventListener('pointerdown', function (ev) {
        if (ev.button) return;
        ev.stopPropagation();
        moved = false;
        modKey = ev.ctrlKey || ev.metaKey || ev.shiftKey;
        var start = { x: ev.clientX, y: ev.clientY, nx: n.x, ny: n.y };
        // a card of the multi-selection drags the whole selection with it
        var group = !modKey && M.state.multi[n.id] && M.pickedNodes().length > 1 ? M.pickedNodes() : null;
        var drag = M.dragGroup(group || [n], n);
        try { g.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        function move(me) {
          var dx = me.clientX - start.x;
          var dy = me.clientY - start.y;
          if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
          moved = true;
          drag(start.nx + dx / M.state.view.k, start.ny + dy / M.state.view.k, me.altKey);
        }
        function up(me) {
          g.removeEventListener('pointermove', move);
          g.removeEventListener('pointerup', up);
          g.removeEventListener('pointercancel', up);
          M.gGuides.textContent = '';
          if (!moved) { if (modKey && !M.state.relink && !M.state.linkFrom) M.toggleMulti(n); else M.onNodeClick(n); return; }
          if (me && me.altKey && M.state.selectedGroup) {
            var sel = M.groupById(M.state.selectedGroup);
            if (sel && sel.members.indexOf(n.id) >= 0) M.removeNodeFromGroup(M.state.selectedGroup, n);
          } else if (me && !me.altKey) {
            var gid = M.groupAt(n);
            if (gid) M.addNodeToGroup(gid, n);
          }
        }
        g.addEventListener('pointermove', move);
        g.addEventListener('pointerup', up);
        g.addEventListener('pointercancel', up);
      });
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); M.onNodeClick(n); }
        if (ev.key === 'Escape') { M.endLink(); M.select(null); }
      });
    };
    M.startWireDrag = function startWireDrag(ev, n, side) {
      if (ev.button) return;
      ev.stopPropagation();
      ev.preventDefault();
      var from = M.anchor(n, side);
      var temp = S.s('path', { class: 'mm-wire-temp' });
      M.gEdges.appendChild(temp);
      M.root.classList.add('is-wiring');
      var target = null;
      function toGraph(me) {
        var r = M.svg.getBoundingClientRect();
        return { x: (me.clientX - r.left - M.state.view.x) / M.state.view.k, y: (me.clientY - r.top - M.state.view.y) / M.state.view.k };
      }
      function targetAt(me) {
        var el = document.elementFromPoint(me.clientX, me.clientY);
        var ng = el && el.closest && el.closest('.mm-node--task, .mm-node--goal');
        var id = ng && ng.getAttribute('data-id');
        return id && id !== n.id ? id : null;
      }
      function move(me) {
        var p = toGraph(me);
        var id = targetAt(me);
        if (id !== target) {
          if (target && M.nodeEls[target]) M.nodeEls[target].classList.remove('is-drop-target');
          target = id;
          if (target && M.nodeEls[target]) M.nodeEls[target].classList.add('is-drop-target');
        }
        var end = { x: p.x, y: p.y, nx: 0, ny: 0 };
        var tn = target && M.nodeById(target);
        if (tn) end = M.anchor(tn, M.facing(n, tn)[1]);
        else end.nx = Math.abs(p.x - from.x) > Math.abs(p.y - from.y) ? (p.x > from.x ? -1 : 1) : 0;
        if (!tn && !end.nx) end.ny = p.y > from.y ? -1 : 1;
        var start = { x: from.x + from.nx * S.PIN_GAP, y: from.y + from.ny * S.PIN_GAP, nx: from.nx, ny: from.ny };
        temp.setAttribute('d', M.wirePath(start, end));
      }
      function up(me) {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancel);
        if (target) {
          finish();
          return M.linkFromPin(n, side, target);
        }
        var p = me && toGraph(me);
        if (n.kind !== 'task' || !me || !M.els.canvas.contains(me.target) || Math.sqrt(Math.pow(p.x - from.x, 2) + Math.pow(p.y - from.y, 2)) < 60) return finish(); // a click on the pin, not a drag
        finish(true);
        M.askNewTask(n, side, p, me, temp);
      }
      function cancel() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancel);
        target = null;
        finish();
      }
      function finish(keepWire) {
        if (target && M.nodeEls[target]) M.nodeEls[target].classList.remove('is-drop-target');
        if (!keepWire && temp.parentNode) temp.parentNode.removeChild(temp);
        M.root.classList.remove('is-wiring');
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', cancel);
      move(ev);
    };
    M.onNodeClick = function onNodeClick(n) {
      if (M.state.relink) {
        var edge = M.edgeById(M.state.relink);
        if (edge && n.id === edge.from) return;
        return M.retarget(edge, n);
      }
      if (M.state.linkFrom && S.MM().rankOf(n) >= 0) {
        if (n.id === M.state.linkFrom) return M.endLink();
        return M.applyLink(M.state.linkFrom, n.id);
      }
      M.select(n.id === M.state.selected ? null : n.id);
    };
    M.onEdgeClick = function onEdgeClick(e) {
      if (M.state.relink || M.state.linkFrom) return;
      M.selectEdge(e.id);
    };
    M.paintGroupSelection = function paintGroupSelection() {
      if (!M.gGroups) return;
      var id = M.state.selectedGroup;
      var nodes = M.svg.querySelectorAll('.mm-hull, .mm-hull-label');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].classList.toggle('is-selected', nodes[i].getAttribute('data-group') === id);
      }
    };
    M.syncOrbitRing = function syncOrbitRing() {
      var focus = M.state.selected && M.nodeById(M.state.selected);
      var rings = M.state.rings;
      if (!focus || !rings || !M.gEdges) {
        if (M.orbitRingEl && M.orbitRingEl.parentNode) M.orbitRingEl.parentNode.removeChild(M.orbitRingEl);
        return;
      }
      var sum = 0;
      var count = 0;
      M.state.graph.nodes.forEach(function (n) {
        if (rings[n.id] !== 1) return;
        sum += Math.sqrt(Math.pow(n.x - focus.x, 2) + Math.pow(n.y - focus.y, 2));
        count++;
      });
      if (!count) {
        if (M.orbitRingEl && M.orbitRingEl.parentNode) M.orbitRingEl.parentNode.removeChild(M.orbitRingEl);
        return;
      }
      if (!M.orbitRingEl) M.orbitRingEl = S.s('circle', { class: 'mm-orbit-ring' });
      if (!M.orbitRingEl.parentNode) M.gEdges.insertBefore(M.orbitRingEl, M.gEdges.firstChild);
      M.orbitRingEl.setAttribute('cx', focus.x.toFixed(1));
      M.orbitRingEl.setAttribute('cy', focus.y.toFixed(1));
      M.orbitRingEl.setAttribute('r', (sum / count).toFixed(1));
    };
    M.moveTo = function moveTo(targets, animate, done) {
      var gen = ++M.poseGen;
      M.poseTargets = targets;
      if (M.orbitFrame) clearInterval(M.orbitFrame);
      M.orbitFrame = 0;
      var from = {};
      M.state.graph.nodes.forEach(function (n) { from[n.id] = { x: n.x, y: n.y }; });
      function apply(t) {
        M.state.graph.nodes.forEach(function (n) {
          var a = from[n.id];
          var b = targets[n.id];
          if (!a || !b || !isFinite(b.x) || !isFinite(b.y)) return;
          n.x = a.x + (b.x - a.x) * t;
          n.y = a.y + (b.y - a.y) * t;
        });
        if (M.state.graph.nodes.some(function (n) { return M.nodeEls[n.id]; })) {
          M.positionAll();
          try { M.drawHulls(); } catch (e) { /* a hull must not freeze the move */ }
          try { M.drawSelectionBox(); } catch (e) { /* ignore */ }
          try { M.syncOrbitRing(); } catch (e) { /* ignore */ }
        }
      }
      function finish() {
        if (M.orbitFrame) clearInterval(M.orbitFrame);
        M.orbitFrame = 0;
        M.nudgeOrbitIntoView();
        if (done) done(gen);
      }
      var reduce = false;
      try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduce = false; }
      if (!animate || reduce) {
        apply(1);
        finish();
        return;
      }
      // One interval, started here. Chained timeouts stall in a background tab, so the gather never arrives.
      var t0 = performance.now();
      M.orbitFrame = setInterval(function () {
        if (gen !== M.poseGen) { clearInterval(M.orbitFrame); M.orbitFrame = 0; return; }
        var t = Math.min(1, (performance.now() - t0) / 480);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        try { apply(e); } catch (err) { /* keep the interval alive */ }
        if (t >= 1) finish();
      }, 16);
    };
    },
    run: function (M) {
    M.HD = global.HideDone;
    M.state = {
      records: [],
      filter: '',
      hideDone: M.HD.get(),
      show: { depends: true, by: true, at: true, goals: true },
      goals: { nodes: [], links: [] },
      goalsLoaded: false, // false until the goal card was read (writing before would overwrite it)
      goalsAuth: null, // null = unknown, false = Trello REST not authorized yet
      layout: 'free', // 'free' (force) | 'tree' (hierarchy from the center)
      graph: { nodes: [], edges: [] },
      cycles: {},
      selected: null,
      rest: null, // home positions while a focus orbit or a perspective is on screen
      persp: null, // { id, dim, heads } while a perspective (people, places, time) rearranges the map
      rings: null, // node id → 0 focus, 1 direct, 2 the relation just behind
      selectedEdge: null,
      selectedGroup: null,
      multi: {}, // node id → true: cards / goals picked with Ctrl+A or Ctrl/Maj+click
      clip: null, // internal clipboard (Ctrl+C / Ctrl+X) pasted by Ctrl+V
      pasteN: 0,
      confirmDeleteAt: 0,
      snap: (function () { try { return localStorage.getItem('tp-mindmap-snap') !== '0'; } catch (e) { return true; } })(),
      pending: [], // placeholder cards shown while Trello is still creating them
      dropPos: {}, // node id → graph position chosen for a task just created from the canvas
      relink: null, // edge id whose target is being replaced
      confirmDelete: null, // goal node id waiting for a second click
      linkFrom: null, // node id waiting for a target
      view: { x: 0, y: 0, k: 1 },
      lens: (function () {
        try {
          var v = localStorage.getItem('tp-mindmap-lens') || 'hierarchy';
          return S.MM().lensById(v) ? v : 'hierarchy';
        } catch (e) { return 'hierarchy'; }
      })(),
      groupsOn: (function () { try { return localStorage.getItem('tp-mindmap-groups-on') !== '0'; } catch (e) { return true; } })(),
      manual: [],
      boardId: '',
      groupEdits: {},
      groupForce: {},
      scene: null,
      lodSig: '',
      status: '',
      statusKind: '',
    };
    M.statusTimer = null;
    M.nodeEls = Object.create(null);
    M.edgeEls = Object.create(null);
    M.poseGen = 0;
    M.orbitFrame = 0;
    M.orbitRingEl = null;
    M.poseTargets = null;
    M.root.innerHTML = '';
    M.els = {
      bar: S.h('div', { class: 'mm-bar', role: 'toolbar', 'aria-label': 'Outils' }),
      hint: S.h('div', { class: 'mm-hint', hidden: true }),
      canvas: S.h('div', { class: 'mm-canvas' }),
      panel: S.h('aside', { class: 'mm-panel', hidden: true }),
      composer: S.h('form', { class: 'mm-composer', hidden: true }),
    };
    M.svg = S.s('svg', { class: 'mm-svg', width: '100%', height: '100%' });
    M.gView = S.s('g', { class: 'mm-view' });
    M.gGroups = S.s('g', { class: 'mm-groups' });
    M.gHeads = S.s('g', { class: 'mm-heads' });
    M.gEdges = S.s('g', { class: 'mm-edges' });
    M.gNodes = S.s('g', { class: 'mm-nodes' });
    M.gFacets = S.s('g', { class: 'mm-facets' });
    M.gBox = S.s('g', { class: 'mm-selbox' });
    M.gTop = S.s('g', { class: 'mm-top' });
    M.gGuides = S.s('g', { class: 'mm-guides' });
    M.gHandles = S.s('g', { class: 'mm-handles' });
    M.gView.appendChild(M.gGroups);
    M.gView.appendChild(M.gHeads);
    M.gView.appendChild(M.gBox);
    M.gView.appendChild(M.gEdges);
    M.gView.appendChild(M.gNodes);
    M.gView.appendChild(M.gFacets);
    M.gView.appendChild(M.gHandles);
    M.gView.appendChild(M.gGuides);
    M.gView.appendChild(M.gTop);
    M.svg.appendChild(M.gView);
    M.els.canvas.appendChild(M.svg);
    M.els.canvas.appendChild(M.els.panel);
    M.els.canvas.appendChild(M.els.composer);
    if (global.AddRow) {
      // New tasks land in the middle of what is on screen, fanned out so several do not stack.
      M.added = 0;
      M.els.canvas.appendChild(global.AddRow.line({
        float: true,
        onSubmit: function (title, input) {
          var r = M.els.canvas.getBoundingClientRect();
          var k = M.state.view.k || 1;
          var fan = (M.added++ % 6) * 28;
          M.createTaskAt(null, '', { x: (r.width / 2 - M.state.view.x) / k + fan, y: (r.height / 2 - M.state.view.y) / k + fan }, title);
          input.value = '';
        },
      }));
    }
    M.els.canvas.appendChild(S.h('div', { class: 'mm-legend' }, [
      M.legendItem('serves', 'Contribue à'),
      M.legendItem('depends', 'Dépend de'),
      M.legendItem('sub', 'Sous-tâche'),
      M.legendItem('by', 'Est fait par'),
      M.legendItem('at', 'Est fait à'),
    ]));
    M.root.appendChild(S.h('div', { class: 'mm-root', tabindex: '-1' }, [M.els.bar, M.els.hint, M.els.canvas]));
    }
  });
})(typeof window !== 'undefined' ? window : this);
