/**
 * mindmap-ui: mount() part 3 of 3.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see mindmap-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.MindmapUiParts = global.MindmapUiParts || {});
  var P = (global.MindmapUiPartsMountMount = global.MindmapUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.applyLod = function applyLod(forceRebuild) {
      if (!M.state.graph || !M.gGroups) return;
      var sig = M.lodSignature();
      var scale = M.state.view.k;
      if (!forceRebuild && sig === M.state.lodSig && M.state.scene && scale === M.state.lodScale) return;
      var scaleOnly = !forceRebuild && sig === M.state.lodSig && M.state.scene && scale !== M.state.lodScale;
      M.state.lodScale = scale;
      if (!scaleOnly) {
        M.state.lodSig = sig;
        M.state.scene = S.MM().scene(M.state.graph, {
          lens: M.state.lens,
          zoom: M.state.view.k,
          manual: M.state.manual,
          edits: M.state.groupEdits,
          force: M.state.groupForce,
          focusId: M.state.selected,
        });
        var hide = M.groupsShown() ? M.state.scene.hidden : {};
        M.state.graph.nodes.forEach(function (n) {
          var el = M.nodeEls[n.id];
          if (el) el.setAttribute('display', hide[n.id] ? 'none' : '');
        });
        M.state.graph.edges.forEach(function (e) {
          var ref = M.edgeEls[e.id];
          if (!ref || !ref.line || !ref.line.parentNode) return;
          ref.line.parentNode.setAttribute('display', M.groupsShown() && (hide[e.from] || hide[e.to]) ? 'none' : '');
        });
      }
      M.drawHulls();
      if (!scaleOnly) M.drawFacets();
    };
    M.editsKey = function editsKey() { return 'tp-mindmap-group-edits:' + (M.state.boardId || 'local'); };
    M.loadEdits = function loadEdits() {
      try {
        var raw = JSON.parse(localStorage.getItem(M.editsKey()) || '{}');
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      } catch (e) { return {}; }
    };
    M.saveEdits = function saveEdits() {
      try { localStorage.setItem(M.editsKey(), JSON.stringify(M.state.groupEdits)); } catch (e) { /* ignore */ }
    };
    M.editGroup = function editGroup(gid, mut, quiet) {
      var cur = M.state.groupEdits[gid] || {};
      var e = {
        extra: Array.isArray(cur.extra) ? cur.extra.slice() : [],
        omit: Array.isArray(cur.omit) ? cur.omit.slice() : [],
      };
      if (cur.name) e.name = cur.name;
      mut(e);
      e.extra = e.extra.filter(Boolean);
      e.omit = e.omit.filter(Boolean);
      if (!e.extra.length && !e.omit.length && !e.name) delete M.state.groupEdits[gid];
      else M.state.groupEdits[gid] = e;
      M.saveEdits();
      if (!quiet) M.applyLod(true);
    };
    M.groupById = function groupById(id) {
      return M.state.scene && M.state.scene.groups.filter(function (g) { return g.id === id; })[0];
    };
    M.groupMoveIds = function groupMoveIds(g) {
      var ids = Object.create(null);
      if (!g) return ids;
      if (g.anchorId) ids[g.anchorId] = true;
      (g.members || []).forEach(function (id) { ids[id] = true; });
      var groups = (M.state.scene && M.state.scene.groups) || [];
      var grew = true;
      var guard = 0;
      while (grew && guard++ < 8) {
        grew = false;
        groups.forEach(function (child) {
          if (!child.anchorId || !ids[child.anchorId]) return;
          child.members.forEach(function (id) {
            if (!ids[id]) { ids[id] = true; grew = true; }
          });
        });
      }
      M.state.graph.edges.forEach(function (e) {
        var other = ids[e.from] ? e.to : ids[e.to] ? e.from : '';
        if (!other || ids[other]) return;
        var n = M.nodeById(other);
        if (n && (n.kind === 'person' || n.kind === 'place' || n.kind === 'subtask')) ids[other] = true;
      });
      return ids;
    };
    M.selectGroup = function selectGroup(id) {
      M.state.multi = {};
      M.state.selected = null;
      M.state.selectedEdge = null;
      M.state.selectedGroup = id;
      M.state.confirmDelete = null;
      M.applyFocus();
      M.renderPanel();
      M.paintGroupSelection();
    };
    M.startGroupGesture = function startGroupGesture(ev, g, kind) {
      if (!ev || ev.button) return;
      ev.stopPropagation();
      ev.preventDefault();
      kind = kind || 'shape';
      var now = Date.now();
      var again = M.state.groupTap && M.state.groupTap.id === g.id && M.state.groupTap.kind === kind && now - M.state.groupTap.at < 450;
      M.state.groupTap = { id: g.id, at: now, kind: kind };
      var ids = M.groupMoveIds(g);
      var nodes = M.state.graph.nodes.filter(function (n) { return ids[n.id]; });
      var lead = (g.anchorId && M.nodeById(g.anchorId)) || nodes[0];
      if (!lead) { M.selectGroup(g.id); return; }
      M.selectGroup(g.id);
      var start = { x: ev.clientX, y: ev.clientY, nx: lead.x, ny: lead.y };
      var drag = M.dragGroup(nodes, lead);
      var moved = false;
      function move(me) {
        var dx = me.clientX - start.x;
        var dy = me.clientY - start.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        drag(start.nx + dx / M.state.view.k, start.ny + dy / M.state.view.k, me.altKey);
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
        M.gGuides.textContent = '';
        if (moved) { M.state.groupTap = null; M.paintGroupSelection(); return; }
        M.selectGroup(g.id);
        if (!again) return;
        if (kind === 'label') M.renameGroupInline(g);
        else M.toggleGroup(g.id);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    };
    M.groupBox = function groupBox(g, exceptId) {
      var scene = M.state.scene;
      if (!scene || !g) return null;
      var pts = [];
      function add(id) {
        if (!id || id === exceptId) return;
        var node = M.nodeById(id);
        if (node && isFinite(node.x) && isFinite(node.y)) pts.push(node);
      }
      if (!g.open) {
        if (g.anchorId && !scene.hidden[g.anchorId]) add(g.anchorId);
        else g.members.forEach(add);
        if (!pts.length) return null;
        var cx = 0;
        var cy = 0;
        pts.forEach(function (p) { cx += p.x; cy += p.y; });
        cx /= pts.length;
        cy /= pts.length;
        var sc = 1 / (M.state.view.k || 1);
        return { x0: cx - 100 * sc, y0: cy - 36 * sc, x1: cx + 100 * sc, y1: cy + 36 * sc };
      }
      if (g.anchorId) add(g.anchorId);
      g.members.forEach(function (id) { if (!scene.hidden[id]) add(id); });
      if (!pts.length) return null;
      var x0 = Infinity;
      var y0 = Infinity;
      var x1 = -Infinity;
      var y1 = -Infinity;
      pts.forEach(function (p) {
        var b = M.nodeBox(p);
        x0 = Math.min(x0, p.x - b.w / 2);
        x1 = Math.max(x1, p.x + b.w / 2);
        y0 = Math.min(y0, p.y - b.h / 2);
        y1 = Math.max(y1, p.y + b.h / 2);
      });
      return { x0: x0 - 18, y0: y0 - 18, x1: x1 + 18, y1: y1 + 18 };
    };
    M.groupAt = function groupAt(n) {
      var scene = M.state.scene;
      if (!scene || !n || (n.kind !== 'task' && n.kind !== 'goal')) return '';
      var best = '';
      var bestArea = Infinity;
      scene.groups.forEach(function (g) {
        if (g.hidden || g.anchorId === n.id || g.members.indexOf(n.id) >= 0) return;
        var box = M.groupBox(g, n.id);
        if (!box || n.x < box.x0 || n.x > box.x1 || n.y < box.y0 || n.y > box.y1) return;
        var area = (box.x1 - box.x0) * (box.y1 - box.y0);
        if (area < bestArea) { bestArea = area; best = g.id; }
      });
      return best;
    };
    M.groupHolding = function groupHolding(nodeId) {
      var scene = M.state.scene;
      if (!scene) return '';
      if (M.state.selectedGroup) {
        var sel = M.groupById(M.state.selectedGroup);
        if (sel && (sel.anchorId === nodeId || sel.members.indexOf(nodeId) >= 0)) return sel.id;
      }
      var found = '';
      scene.groups.forEach(function (g) {
        if (g.members.indexOf(nodeId) >= 0) found = g.id;
      });
      return found;
    };
    M.addNodeToGroup = function addNodeToGroup(gid, n) {
      if (!gid || !n || (n.kind !== 'task' && n.kind !== 'goal')) return;
      var g = M.groupById(gid);
      if (!g || g.anchorId === n.id || g.members.indexOf(n.id) >= 0) return;
      if (g.lens === 'manual') { M.addToManual(gid, [n]); M.setStatus('Dans « ' + g.label + ' »', 'ok'); return; }
      (M.state.scene ? M.state.scene.groups : []).forEach(function (other) {
        if (other.id === gid || other.lens === 'manual' || other.members.indexOf(n.id) < 0) return;
        M.editGroup(other.id, function (e) {
          e.extra = e.extra.filter(function (id) { return id !== n.id; });
          if (e.omit.indexOf(n.id) < 0) e.omit.push(n.id);
        }, true);
      });
      M.editGroup(gid, function (e) {
        e.omit = e.omit.filter(function (id) { return id !== n.id; });
        if (e.extra.indexOf(n.id) < 0) e.extra.push(n.id);
      });
      M.setStatus('Dans « ' + g.label + ' »', 'ok');
    };
    M.removeNodeFromGroup = function removeNodeFromGroup(gid, n) {
      if (!gid || !n) return;
      var g = M.groupById(gid);
      if (!g || g.anchorId === n.id) return;
      if (g.lens === 'manual') {
        M.state.manual = S.MM().normalizeManual(M.state.manual.map(function (mg) {
          if (mg.id !== gid) return mg;
          return { id: mg.id, name: mg.name, members: mg.members.filter(function (id) { return id !== n.id; }) };
        }));
        M.saveManual();
        M.applyLod(true);
      } else {
        M.editGroup(gid, function (e) {
          e.extra = e.extra.filter(function (id) { return id !== n.id; });
          if (e.omit.indexOf(n.id) < 0) e.omit.push(n.id);
        });
      }
      M.setStatus('Retiré', 'ok');
    };
    M.renameGroup = function renameGroup(g, name) {
      name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!name || !g || name === g.label) return;
      if (g.lens === 'manual') { M.renameManual(g.id, name); return; }
      if (g.anchorId) {
        var node = M.nodeById(g.anchorId);
        if (node && node.kind === 'goal') { M.renameGoal(g.anchorId, name); return; }
      }
      M.editGroup(g.id, function (e) { e.name = name; });
    };
    M.toggleGroup = function toggleGroup(id) {
      var g = M.state.scene && M.state.scene.groups.filter(function (x) { return x.id === id; })[0];
      if (!g) return;
      M.state.groupForce[id] = g.open ? 'closed' : 'open';
      M.applyLod(true);
    };
    M.hullClass = function hullClass(g, closed) {
      return 'mm-hull ' + (closed ? 'is-closed' : 'is-open') + (M.state.selectedGroup === g.id ? ' is-selected' : '');
    };
    M.bindShape = function bindShape(el, g) {
      el.addEventListener('pointerdown', function (ev) { M.startGroupGesture(ev, g, 'shape'); });
    };
    M.hullLabel = function hullLabel(g, x, y, text) {
      var sc = 1 / (M.state.view.k || 1);
      var t = S.s('text', {
        class: 'mm-hull-label' + (M.state.selectedGroup === g.id ? ' is-selected' : ''),
        'text-anchor': 'middle', 'dominant-baseline': 'middle', 'data-group': g.id,
        transform: 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + sc.toFixed(3) + ')',
      });
      t.textContent = text;
      t.addEventListener('pointerdown', function (ev) { M.startGroupGesture(ev, g, 'label'); });
      return t;
    };
    M.drawHulls = function drawHulls() {
      var oldLabels = M.gTop.querySelectorAll('.mm-hull-label');
      for (var i = oldLabels.length - 1; i >= 0; i--) oldLabels[i].parentNode.removeChild(oldLabels[i]);
      M.gGroups.textContent = '';
      var scene = M.state.scene;
      if (!M.groupsShown() || !scene) return;
      var byNode = Object.create(null);
      M.state.graph.nodes.forEach(function (n) { byNode[n.id] = n; });
      var k = M.state.view.k || 1;
      scene.groups.forEach(function (g) {
        if (g.hidden) return;
        var pts = [];
        function add(n) {
          if (!n || !isFinite(n.x) || !isFinite(n.y)) return;
          pts.push({ x: n.x, y: n.y, w: n.w || 160, h: n.h || 48 });
        }
        var hue = 'hsl(' + g.hue + ' 55% 52%)';
        if (g.open) {
          if (g.anchorId) add(byNode[g.anchorId]);
          g.members.forEach(function (id) { if (!scene.hidden[id]) add(byNode[id]); });
          if (!pts.length) return;
          var d = S.MM().looseHull(pts, 18);
          var hull = S.s('path', { class: M.hullClass(g, false), d: d, 'data-group': g.id });
          hull.style.setProperty('--mm-hull', hue);
          var hit = S.s('path', { class: 'mm-hull-hit', d: d, 'data-group': g.id });
          M.bindShape(hit, g);
          M.gGroups.appendChild(hull);
          M.gGroups.appendChild(hit);
          var top = pts[0];
          pts.forEach(function (p) { if (p.y - p.h / 2 < top.y - top.h / 2) top = p; });
          M.gTop.appendChild(M.hullLabel(g, top.x, top.y - top.h / 2 - 22 / k, g.label));
          return;
        }
        if (g.anchorId && byNode[g.anchorId] && !scene.hidden[g.anchorId]) {
          add(byNode[g.anchorId]);
          var halo = S.s('path', { class: M.hullClass(g, true), d: S.MM().looseHull(pts, 18), 'data-group': g.id });
          halo.style.setProperty('--mm-hull', hue);
          M.bindShape(halo, g);
          M.gGroups.appendChild(halo);
          if (g.taskCount) M.gTop.appendChild(M.hullLabel(g, pts[0].x + pts[0].w / 2, pts[0].y - pts[0].h / 2, String(g.taskCount)));
          return;
        }
        g.members.forEach(function (id) { add(byNode[id]); });
        if (!pts.length) return;
        var cx = 0;
        var cy = 0;
        pts.forEach(function (p) { cx += p.x; cy += p.y; });
        cx /= pts.length;
        cy /= pts.length;
        var sc = 1 / k;
        var chip = S.s('ellipse', {
          class: M.hullClass(g, true), cx: cx.toFixed(1), cy: cy.toFixed(1),
          rx: (86 * sc).toFixed(1), ry: (22 * sc).toFixed(1), 'data-group': g.id,
        });
        chip.style.setProperty('--mm-hull', hue);
        M.bindShape(chip, g);
        M.gGroups.appendChild(chip);
        M.gTop.appendChild(M.hullLabel(g, cx, cy, g.label + (g.taskCount ? ' · ' + g.taskCount : '')));
      });
    };
    M.drawFacets = function drawFacets() {
      M.gFacets.textContent = '';
      var scene = M.state.scene;
      if (!scene || !scene.facets.length) return;
      var byParent = Object.create(null);
      scene.facets.forEach(function (f) { (byParent[f.parentId] = byParent[f.parentId] || []).push(f); });
      Object.keys(byParent).forEach(function (pid) {
        var parent = M.nodeById(pid);
        if (!parent || !isFinite(parent.x)) return;
        var list = byParent[pid];
        var panelOpen = M.els.panel && !M.els.panel.hidden;
        var dir = panelOpen ? -1 : 1;
        list.forEach(function (f, i) {
          f.x = parent.x + dir * ((parent.w || 180) / 2 + 86);
          f.y = parent.y + (i - (list.length - 1) / 2) * 36;
          var link = S.s('line', {
            class: 'mm-facet-link',
            x1: parent.x.toFixed(1), y1: (parent.y + (parent.h || 40) / 2).toFixed(1),
            x2: f.x.toFixed(1), y2: f.y.toFixed(1),
          });
          var el = M.buildFacetEl(f);
          el.setAttribute('transform', 'translate(' + f.x.toFixed(1) + ',' + f.y.toFixed(1) + ')');
          M.gFacets.appendChild(link);
          M.gFacets.appendChild(el);
        });
      });
    };
    M.buildFacetEl = function buildFacetEl(f) {
      var w = Math.max(76, Math.min(190, String(f.label || '').length * 7.2 + 28));
      var hgt = 28;
      var g = S.s('g', { class: 'mm-node mm-node--facet mm-facet--' + f.facet, 'data-facet': f.facet, 'data-parent': f.parentId });
      g.style.setProperty('--mm-accent', 'hsl(' + (M.FACET_HUE[f.facet] || 210) + ' 55% 46%)');
      g.appendChild(S.s('rect', { class: 'mm-shape', x: -w / 2, y: -hgt / 2, width: w, height: hgt, rx: 14 }));
      var tx = S.s('text', { class: 'mm-facet-label', 'text-anchor': 'middle', x: 0, y: 4 });
      tx.textContent = f.label;
      g.appendChild(tx);
      g.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      g.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var parent = M.nodeById(f.parentId);
        var rec = parent && parent.rec;
        if (parent) M.select(parent.id);
        if (!rec) return;
        var anchor = M.nodeEls[parent.id];
        if (f.facet === 'progress') M.openFieldEditor(rec, 'progress', anchor);
        else if (f.facet === 'priority') M.openFieldEditor(rec, 'priority', anchor);
        else if (f.facet === 'blocked') M.openFieldEditor(rec, 'blocked', anchor);
        else if (f.facet === 'due') M.openFieldEditor(rec, 'due', anchor);
      });
      return g;
    };
    M.groupsShown = function groupsShown() { return !!M.state.groupsOn && !M.state.persp; };
    M.drawHeads = function drawHeads() {
      while (M.gHeads.firstChild) M.gHeads.removeChild(M.gHeads.firstChild);
      if (!M.state.persp) return;
      M.state.persp.heads.forEach(function (hd) {
        var g = S.s('g', { class: 'mm-head' + (hd.dim ? ' is-dim' : ''), transform: 'translate(' + hd.x.toFixed(1) + ',' + hd.y.toFixed(1) + ')' });
        g.appendChild(S.s('text', { class: 'mm-head-label', 'text-anchor': 'middle', y: 0 }, [hd.label]));
        g.appendChild(S.s('text', { class: 'mm-head-count', 'text-anchor': 'middle', y: 16 }, [String(hd.count)]));
        M.gHeads.appendChild(g);
      });
    };
    M.showPerspective = function showPerspective(id, animate) {
      M.closePerspMenu();
      var p = S.MM().perspectiveById(id);
      if (!p || id === 'network') {
        if (!M.state.persp) return;
        var back = {};
        var home = M.state.rest || {};
        M.state.graph.nodes.forEach(function (n) { if (home[n.id]) back[n.id] = { x: home[n.id].x, y: home[n.id].y }; });
        M.state.persp = null;
        M.root.classList.remove('is-persp');
        M.drawHeads();
        M.applyFocus();
        M.renderBar();
        M.applyLod(true);
        var token = M.state.rest;
        M.moveTo(back, animate !== false, function (gen) {
          if (gen !== M.poseGen) return;
          if (M.state.rest === token) M.state.rest = null;
          if (M.state.selected && M.nodeById(M.state.selected)) M.beginOrbit(true); else M.fit();
        });
        return;
      }
      if (!M.state.rest) {
        M.state.rest = {};
        M.state.graph.nodes.forEach(function (n) { M.state.rest[n.id] = { x: n.x, y: n.y }; });
      }
      M.state.rings = null;
      var pose = S.MM().perspective(M.state.graph.nodes, M.state.graph.edges, id);
      M.state.persp = { id: id, dim: pose.dim, heads: pose.heads };
      M.root.classList.add('is-persp');
      M.drawHeads();
      M.applyFocus();
      M.renderBar();
      M.applyLod(true);
      M.moveTo(pose.positions, animate !== false, function (gen) {
        if (gen !== M.poseGen) return;
        M.fit();
      });
    };
    M.closePerspMenu = function closePerspMenu() {
      if (M.perspMenuEl && M.perspMenuEl.parentNode) M.perspMenuEl.parentNode.removeChild(M.perspMenuEl);
      M.perspMenuEl = null;
    };
    M.openPerspMenu = function openPerspMenu(btn) {
      if (M.perspMenuEl) { M.closePerspMenu(); return; }
      var menu = S.h('div', { class: 'mm-menu mm-lens', role: 'menu' });
      var current = M.state.persp ? M.state.persp.id : 'network';
      S.MM().PERSPECTIVES.forEach(function (p) {
        var b = S.h('button', { class: 'mm-menu-item' + (p.id === current ? ' is-active' : ''), type: 'button' }, [
          S.icon(p.icon),
          S.h('span', { class: 'mm-menu-label', text: p.label }),
          S.h('kbd', { text: p.id === current ? '\u2713' : '' }),
        ]);
        b.addEventListener('click', function () { M.showPerspective(p.id, true); });
        menu.appendChild(b);
      });
      var br = btn.getBoundingClientRect();
      var rr = M.root.getBoundingClientRect();
      menu.style.left = Math.max(4, br.left - rr.left) + 'px';
      menu.style.top = (br.bottom - rr.top + 4) + 'px';
      M.root.appendChild(menu);
      M.perspMenuEl = menu;
    };
    M.closeLensMenu = function closeLensMenu() {
      if (M.lensMenuEl && M.lensMenuEl.parentNode) M.lensMenuEl.parentNode.removeChild(M.lensMenuEl);
      M.lensMenuEl = null;
    };
    M.openLensMenu = function openLensMenu(btn) {
      if (M.lensMenuEl) { M.closeLensMenu(); return; }
      var menu = S.h('div', { class: 'mm-menu mm-lens', role: 'menu' });
      S.MM().LENSES.forEach(function (l) {
        var on = M.state.groupsOn && M.state.lens === l.id;
        var b = S.h('button', { class: 'mm-menu-item' + (on ? ' is-active' : ''), type: 'button' }, [
          S.h('span', { class: 'mm-menu-label', text: l.label }),
          S.h('kbd', { text: on ? '✓' : '' }),
        ]);
        b.addEventListener('click', function () {
          M.state.lens = l.id;
          M.state.groupsOn = true;
          M.state.groupForce = {};
          M.saveLens();
          M.closeLensMenu();
          M.renderBar();
          M.applyLod(true);
        });
        menu.appendChild(b);
      });
      menu.appendChild(S.h('div', { class: 'mm-menu-sep' }));
      var off = S.h('button', { class: 'mm-menu-item', type: 'button' }, [S.h('span', { class: 'mm-menu-label', text: 'Aucun' })]);
      off.addEventListener('click', function () {
        M.state.groupsOn = false;
        M.saveLens();
        M.closeLensMenu();
        M.renderBar();
        M.applyLod(true);
      });
      menu.appendChild(off);
      var br = btn.getBoundingClientRect();
      var rr = M.root.getBoundingClientRect();
      menu.style.left = Math.max(4, br.left - rr.left) + 'px';
      menu.style.top = (br.bottom - rr.top + 4) + 'px';
      M.root.appendChild(menu);
      M.lensMenuEl = menu;
    };
    M.createManualGroup = function createManualGroup(nodes) {
      if (!nodes || !nodes.length) return;
      var goals = nodes.filter(function (n) { return n.kind === 'goal'; });
      var name = goals.length === 1 ? goals[0].label : 'Groupe';
      var seen = Object.create(null);
      var members = [];
      nodes.forEach(function (n) {
        if (!n || seen[n.id]) return;
        seen[n.id] = true;
        members.push(n.id);
      });
      if (!members.length) return;
      var g = { id: 'mg' + Math.random().toString(36).slice(2, 10), name: name, members: members };
      M.state.manual = S.MM().normalizeManual(M.state.manual.concat([g]));
      M.state.lens = 'manual';
      M.state.groupsOn = true;
      M.state.groupForce = {};
      M.saveLens();
      M.saveManual();
      M.setStatus('Groupe « ' + name + ' »', 'ok');
      M.renderBar();
      M.applyLod(true);
    };
    M.addToManual = function addToManual(groupId, nodes) {
      M.state.manual = M.state.manual.map(function (g) {
        if (g.id !== groupId) return g;
        var members = g.members.slice();
        nodes.forEach(function (n) { if (n && members.indexOf(n.id) < 0) members.push(n.id); });
        return { id: g.id, name: g.name, members: members };
      });
      M.state.lens = 'manual';
      M.state.groupsOn = true;
      M.saveLens();
      M.saveManual();
      M.renderBar();
      M.applyLod(true);
    };
    M.removeFromManual = function removeFromManual(nodes) {
      var ids = Object.create(null);
      nodes.forEach(function (n) { if (n) ids[n.id] = true; });
      M.state.manual = S.MM().normalizeManual(M.state.manual.map(function (g) {
        return { id: g.id, name: g.name, members: g.members.filter(function (id) { return !ids[id]; }) };
      }));
      M.saveManual();
      M.applyLod(true);
    };
    M.dissolveGroup = function dissolveGroup(id) {
      M.state.manual = M.state.manual.filter(function (g) { return g.id !== id; });
      delete M.state.groupForce[id];
      M.saveManual();
      M.applyLod(true);
    };
    M.renameManual = function renameManual(id, name) {
      name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!name) return;
      M.state.manual = M.state.manual.map(function (g) { return g.id === id ? { id: g.id, name: name, members: g.members } : g; });
      M.saveManual();
      M.applyLod(true);
    };
    M.renameGroupInline = function renameGroupInline(g) {
      var el = M.svg.querySelector('.mm-hull-label[data-group="' + g.id + '"]');
      if (!el || M.els.canvas.querySelector('.mm-title-edit')) return;
      var r = el.getBoundingClientRect();
      var cr = M.els.canvas.getBoundingClientRect();
      var input = S.h('input', {
        class: 'mm-title-edit', type: 'text', maxlength: '80', 'aria-label': 'Nom du groupe', value: g.label || g.name || '',
        style: 'left:' + (r.left - cr.left).toFixed(1) + 'px;top:' + (r.top - cr.top).toFixed(1) + 'px;width:' + Math.max(140, r.width + 28).toFixed(1) + 'px;height:28px;font-size:13px',
      });
      var done = false;
      function finish(save) {
        if (done) return;
        done = true;
        var v = input.value;
        if (input.parentNode) input.parentNode.removeChild(input);
        if (save) M.renameGroup(g, v);
      }
      input.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', function () { finish(true); });
      ['pointerdown', 'dblclick', 'wheel'].forEach(function (type) { input.addEventListener(type, function (ev) { ev.stopPropagation(); }); });
      M.els.canvas.appendChild(input);
      input.focus();
      input.select();
    };
    M.bindBoard = function bindBoard() {
      var p = null;
      try { if (M.t && typeof M.t.board === 'function') p = M.t.board('id'); } catch (e) { p = null; }
      function use(id) {
        M.state.boardId = id ? String(id) : 'local';
        M.state.manual = M.loadManual();
        M.state.groupEdits = M.loadEdits();
        M.applyLod(true);
      }
      if (!p || typeof p.then !== 'function') { use('local'); return; }
      p.then(function (b) { use(b && typeof b === 'object' ? b.id : b); }, function () { use('local'); });
    };
    M.applyView = function applyView() {
      var v = M.state.view;
      var zl = M.els.bar && M.els.bar.querySelector('.mm-zoom');
      if (zl) zl.textContent = Math.round(v.k * 100) + ' %';
      M.gView.setAttribute('transform', 'translate(' + v.x.toFixed(1) + ',' + v.y.toFixed(1) + ') scale(' + v.k.toFixed(3) + ')');
      // the dot grid pans and zooms with the graph
      M.els.canvas.style.backgroundSize = (18 * v.k).toFixed(2) + 'px ' + (18 * v.k).toFixed(2) + 'px';
      M.els.canvas.style.backgroundPosition = v.x.toFixed(1) + 'px ' + v.y.toFixed(1) + 'px';
      M.applyLod(false);
    };
    M.zoomBy = function zoomBy(f) {
      var cx = (M.els.canvas.clientWidth || 800) / 2, cy = (M.els.canvas.clientHeight || 500) / 2;
      M.state.view = global.GraphCanvas.zoomAt(M.state.view, cx, cy, f, 0.1, 3);
      M.applyView();
    };
    M.fit = function fit() {
      var nodes = M.state.graph.nodes;
      var w = M.els.canvas.clientWidth || 800;
      var hgt = M.els.canvas.clientHeight || 500;
      if (!nodes.length) { M.state.view = { x: w / 2, y: hgt / 2, k: 1 }; return M.applyView(); }
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      nodes.forEach(function (n) {
        var b = M.nodeBox(n);
        x0 = Math.min(x0, n.x - b.w / 2); x1 = Math.max(x1, n.x + b.w / 2);
        y0 = Math.min(y0, n.y - b.h / 2); y1 = Math.max(y1, n.y + b.h / 2 + 16);
      });
      M.state.view = global.GraphCanvas.fitView({ x0: x0, y0: y0, x1: x1, y1: y1 }, w, hgt, 40, 1.2, 0.15);
      M.applyView();
    };
    M.editTitleInline = function editTitleInline(n) {
      var rec = n.kind === 'task' ? n.rec : null;
      if (n.kind === 'task' ? !rec || !global.TableTrello : n.kind !== 'goal' || !M.goalsEditable()) return;
      if (M.els.canvas.querySelector('.mm-title-edit')) return;
      var k = M.state.view.k;
      var left = M.state.view.x + (n.x - n.w / 2 + 6) * k;
      var top = M.state.view.y + (n.y - n.h / 2 + 4) * k;
      var input = S.h('input', {
        class: 'mm-title-edit',
        type: 'text',
        maxlength: '300',
        'aria-label': 'Titre',
        value: n.kind === 'task' ? rec.name || '' : n.label,
        style: 'left:' + left.toFixed(1) + 'px;top:' + top.toFixed(1) + 'px;width:' + ((n.w - 12) * k).toFixed(1) + 'px;height:' + ((n.headH - 8) * k).toFixed(1) + 'px;font-size:' + (14 * k).toFixed(1) + 'px',
      });
      var done = false;
      function finish(save) {
        if (done) return;
        done = true;
        var v = input.value.replace(/\s+/g, ' ').trim();
        if (input.parentNode) input.parentNode.removeChild(input);
        if (!save || !v) return;
        if (n.kind === 'task') {
          if (v !== rec.name) M.runEdit(function () { return global.TableTrello.saveName(M.t, rec.id, v); }, M.nameEntry(rec, v));
        } else {
          M.renameGoal(n.id, v);
        }
      }
      input.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); finish(true); } else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', function () { finish(true); });
      ['pointerdown', 'dblclick', 'wheel'].forEach(function (type) { input.addEventListener(type, function (ev) { ev.stopPropagation(); }); });
      M.els.canvas.appendChild(input);
      input.focus();
      input.select();
    };
    M.closeSub = function closeSub() {
      if (M.menuEl) {
        var open = M.menuEl.querySelector('.is-open');
        if (open) open.classList.remove('is-open');
      }
      if (M.subEl && M.subEl.parentNode) M.subEl.parentNode.removeChild(M.subEl);
      M.subEl = null;
    };
    M.closeMenu = function closeMenu() {
      M.closeSub();
      if (M.menuEl && M.menuEl.parentNode) M.menuEl.parentNode.removeChild(M.menuEl);
      M.menuEl = null;
    };
    M.moveNodes = function moveNodes(nodes, apply) {
      apply();
      var ids = {};
      nodes.forEach(function (n) { ids[n.id] = true; M.positionNode(n); });
      M.state.graph.edges.forEach(function (e) { if (ids[e.from] || ids[e.to]) M.positionEdge(e); });
    };
    M.alignNodes = function alignNodes(axis) {
      var nodes = M.pickedNodes();
      if (nodes.length < 2) return;
      var gap = 24;
      M.moveNodes(nodes, function () {
        var avg = nodes.reduce(function (a, n) { return a + n[axis]; }, 0) / nodes.length;
        var other = axis === 'y' ? 'x' : 'y';
        var size = axis === 'y' ? 'w' : 'h';
        nodes.sort(function (a, b) { return a[other] - b[other]; });
        nodes.forEach(function (n) { n[axis] = avg; });
        for (var i = 1; i < nodes.length; i++) {
          var min = nodes[i - 1][other] + (nodes[i - 1][size] + nodes[i][size]) / 2 + gap;
          if (nodes[i][other] < min) nodes[i][other] = min;
        }
      });
      M.setStatus(axis === 'y' ? 'Alignés horizontalement' : 'Alignés verticalement', 'ok');
    };
    M.distributeNodes = function distributeNodes(axis) {
      var nodes = M.pickedNodes();
      if (nodes.length < 3) return;
      var size = axis === 'x' ? 'w' : 'h';
      M.moveNodes(nodes, function () {
        nodes.sort(function (a, b) { return a[axis] - b[axis]; });
        var first = nodes[0];
        var last = nodes[nodes.length - 1];
        var span = (last[axis] - last[size] / 2) - (first[axis] + first[size] / 2);
        var total = nodes.slice(1, -1).reduce(function (a, n) { return a + n[size]; }, 0);
        var gap = (span - total) / (nodes.length - 1);
        var cursor = first[axis] + first[size] / 2;
        for (var i = 1; i < nodes.length - 1; i++) {
          cursor += gap;
          nodes[i][axis] = cursor + nodes[i][size] / 2;
          cursor += nodes[i][size];
        }
      });
    };
    M.openMenu = function openMenu(ev) {
      ev.preventDefault();
      M.closeMenu();
      var onNode = ev.target.closest && ev.target.closest('.mm-node');
      var n = onNode && M.nodeById(onNode.getAttribute('data-id'));
      if (n && (n.kind === 'task' || n.kind === 'goal') && !M.state.multi[n.id]) M.select(n.id);
      var count = M.pickedNodes().length;
      var ICONS = {
        copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
        cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
        paste: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
        open: '<path d="M7 17 17 7M8 7h9v9"/>',
        progress: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 9 9h-9z"/>',
        flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
        due: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>',
        desc: '<path d="M4 6h16M4 12h10M4 18h14"/>',
        ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
        link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
        status: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1.5"/><circle cx="14" cy="12" r="1.5"/><circle cx="10" cy="18" r="1.5"/>',
        archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
        trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
        alignH: '<path d="M3 12h18"/><rect x="5" y="6" width="4" height="12" rx="1"/><rect x="15" y="8" width="4" height="8" rx="1"/>',
        alignV: '<path d="M12 3v18"/><rect x="6" y="5" width="12" height="4" rx="1"/><rect x="8" y="15" width="8" height="4" rx="1"/>',
        distH: '<path d="M3 4v16M21 4v16"/><rect x="9" y="7" width="6" height="10" rx="1"/>',
        distV: '<path d="M4 3h16M4 21h16"/><rect x="7" y="9" width="10" height="6" rx="1"/>',
        selectAll: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
        layout: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
        group: '<circle cx="8" cy="12" r="3"/><circle cx="16" cy="8" r="3"/><circle cx="16" cy="16" r="3"/>',
        chevron: '<path d="m9 6 6 6-6 6"/>',
        alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/>',
      };
      function icon(name) {
        var s = S.h('span', { class: 'mm-menu-ico' });
        s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
        return s;
      }
      var items = [];
      var cardRec = n && n.kind === 'task' && n.rec && global.TableTrello ? n.rec : null;
      if (cardRec) {
        var TTm = global.TableTrello;
        var anchorEl = onNode;
        items.push({ title: 'Carte' });
        items.push(['Archiver la carte', '', function () { M.deleteSelection({ force: true, nodes: [n] }); }, false, 'archive']);
        items.push(null);
        items.push(['Ouvrir la carte', '', function () { M.openCard(cardRec); }, false, 'open']);
        items.push(['Progrès…', '', function () { M.openFieldEditor(cardRec, 'progress', anchorEl); }, false, 'progress']);
        items.push(['Priorité…', '', function () { M.openFieldEditor(cardRec, 'priority', anchorEl); }, false, 'flag']);
        items.push(['Échéance…', '', function () { M.openFieldEditor(cardRec, 'due', anchorEl); }, false, 'due']);
        items.push(['Description…', '', function () { M.openFieldEditor(cardRec, 'desc', anchorEl); }, false, 'desc']);
        items.push(['Minuteur…', '', function () { M.openFieldEditor(cardRec, 'timer', anchorEl); }, false, 'alarm']);
        items.push([cardRec.blocked ? 'Bloqué…' : 'Bloquer…', '', function () { M.openFieldEditor(cardRec, 'blocked', anchorEl); }, false, 'ban']);
        items.push(['Contribue à… / Dépend de…', '', function () { M.startLink(n.id); }, false, 'link']);
        var statusLists = M.state.lists || [];
        if (statusLists.length) {
          var currentList = null;
          statusLists.forEach(function (l) {
            if (String(l.id) === String(cardRec.listId)) currentList = l;
          });
          items.push({
            label: 'Statut',
            hint: currentList ? currentList.name : '',
            icon: 'status',
            children: statusLists.map(function (l) {
              var here = String(l.id) === String(cardRec.listId);
              return {
                label: l.name,
                checked: here,
                action: function () {
                  if (here) return;
                  M.runEdit(function () { return TTm.moveCard(M.t, cardRec.id, l.id, 'bottom'); }, M.statusEntry(cardRec, l.id));
                },
              };
            }),
          });
        }
        items.push(null);
      }
      if (count) {
        items.push(['Copier', 'Ctrl+C', M.copySelection, false, 'copy'], ['Couper', 'Ctrl+X', function () { if (M.copySelection()) M.deleteSelection({ force: true }); }, false, 'cut']);
      }
      items.push(['Coller', 'Ctrl+V', M.pasteClip, !M.state.clip, 'paste']);
      if (count) items.push(['Supprimer', 'Suppr', function () { M.deleteSelection({ force: true }); }, false, 'trash']);
      items.push(null);
      items.push(['Aligner horizontalement', '', function () { M.alignNodes('y'); }, count < 2, 'alignH']);
      items.push(['Aligner verticalement', '', function () { M.alignNodes('x'); }, count < 2, 'alignV']);
      items.push(['Répartir horizontalement', '', function () { M.distributeNodes('x'); }, count < 3, 'distH']);
      items.push(['Répartir verticalement', '', function () { M.distributeNodes('y'); }, count < 3, 'distV']);
      items.push(null);
      var picked = M.pickedNodes();
      if (picked.length) {
        items.push(['Grouper', '', function () { M.createManualGroup(picked); }, false, 'group']);
        M.state.manual.slice(0, 6).forEach(function (g) {
          items.push(['Dans « ' + g.name + ' »', '', function () { M.addToManual(g.id, picked); }, false, 'group']);
        });
        var inGroup = picked.some(function (n) {
          return M.state.manual.some(function (g) { return g.members.indexOf(n.id) >= 0; });
        });
        if (inGroup) items.push(['Retirer du groupe', '', function () { M.removeFromManual(picked); }, false, 'group']);
      }
      var groupHit = ev.target.closest && ev.target.closest('[data-group]');
      var gid = groupHit && groupHit.getAttribute('data-group');
      var manualHit = gid && M.state.manual.filter(function (g) { return g.id === gid; })[0];
      if (manualHit) {
        items.push(['Renommer le groupe', '', function () { M.renameGroupInline(manualHit); }, false, 'group']);
        items.push(['Dissoudre le groupe', '', function () { M.dissolveGroup(manualHit.id); }, false, 'trash']);
      }
      if (global.Isolation && n) {
        var iso = {};
        if (n.kind === 'task') {
          iso.cardId = (n.rec && n.rec.id) || String(n.id || '').replace(/^t:/, '');
          iso.cardName = n.label || '';
          iso.people = global.Isolation.peopleOf(n.rec || {});
        } else if (n.kind === 'subtask' && n.parentId) {
          var itemId = String(n.id || '').split(':').slice(2).join(':');
          iso.cardId = n.parentId;
          iso.subId = itemId ? 'sub:' + n.parentId + ':' + itemId : '';
          iso.subName = n.label || '';
        } else if (n.kind === 'goal' && n.level === 'project') {
          iso.projectId = n.id;
          iso.projectName = n.label || '';
        } else if (n.kind === 'person') {
          iso.people = [{ id: String(n.id || '').replace(/^p:/, ''), name: n.label || '' }];
        }
        global.Isolation.menuItems(iso).forEach(function (it) {
          items.push(it && it.sep ? null : it);
        });
      }
      items.push(['Tout sélectionner', 'Ctrl+A', M.selectAll, false, 'selectAll']);
      items.push(['Réorganiser tout', '', function () { M.rebuild({ relayout: true, fresh: true }); }, false, 'layout']);
      function renderItem(it, inSub) {
        if (!it) return S.h('div', { class: 'mm-menu-sep' });
        if (it.title && !it.children) return S.h('div', { class: 'mm-menu-title', text: it.title });
        if (it.children) return renderSubmenu(it);
        var tuple = Array.isArray(it);
        var label = tuple ? it[0] : it.label;
        var hint = tuple ? it[1] : (it.checked ? '✓' : (it.hint || ''));
        var action = tuple ? it[2] : it.action;
        var disabled = tuple ? !!it[3] : !!it.disabled;
        var iconName = tuple ? it[4] : it.icon;
        var parts = [];
        if (iconName) parts.push(icon(iconName));
        parts.push(S.h('span', { class: 'mm-menu-label', text: label }));
        if (hint) parts.push(S.h('kbd', { text: hint }));
        var b = S.h('button', {
          class: 'mm-menu-item',
          type: 'button',
          role: 'menuitem',
          disabled: disabled || null,
        }, parts);
        b.addEventListener('mouseenter', function () { if (!inSub) M.closeSub(); });
        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          M.closeMenu();
          if (typeof action === 'function') action();
        });
        return b;
      }
      function renderSubmenu(it) {
        var parts = [icon(it.icon || 'status'), S.h('span', { class: 'mm-menu-label', text: it.label })];
        if (it.hint) parts.push(S.h('kbd', { class: 'mm-menu-current', title: it.hint, text: it.hint }));
        parts.push(icon('chevron'));
        var b = S.h('button', { class: 'mm-menu-item', type: 'button', role: 'menuitem', 'aria-haspopup': 'menu' }, parts);
        function show(ev) {
          if (ev) ev.stopPropagation();
          openSub(b, it.children);
        }
        b.addEventListener('mouseenter', show);
        b.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (!M.subEl) show(ev);
        });
        return b;
      }
      function openSub(anchor, children) {
        M.closeSub();
        anchor.classList.add('is-open');
        var fly = S.h('div', { class: 'mm-menu mm-submenu', role: 'menu' }, children.map(function (c) { return renderItem(c, true); }));
        fly.style.visibility = 'hidden';
        M.els.canvas.appendChild(fly);
        var ar = anchor.getBoundingClientRect();
        var cr = M.els.canvas.getBoundingClientRect();
        var fw = fly.offsetWidth || 180;
        var fh = fly.offsetHeight || 40;
        var left = ar.right - cr.left + 4;
        if (left + fw > cr.width - 4) left = Math.max(4, ar.left - cr.left - fw - 4);
        var top = ar.top - cr.top - 4;
        if (top + fh > cr.height - 4) top = Math.max(4, cr.height - fh - 4);
        fly.style.left = left + 'px';
        fly.style.top = Math.max(4, top) + 'px';
        fly.style.visibility = '';
        M.subEl = fly;
      }
      var menu = S.h('div', { class: 'mm-menu', role: 'menu' }, items.map(function (it) { return renderItem(it, false); }));
      var r = M.els.canvas.getBoundingClientRect();
      menu.style.left = Math.max(4, Math.min(ev.clientX - r.left, r.width - 250)) + 'px';
      menu.style.top = Math.max(4, Math.min(ev.clientY - r.top, r.height - items.length * 30)) + 'px';
      M.els.canvas.appendChild(menu);
      M.menuEl = menu;
    };
    M.showSkeleton = function showSkeleton(on) {
      M.els.canvas.classList.toggle('is-loading', on);
      if (on && !M.els.skel) {
        M.els.skel = S.h('div', { class: 'sk-canvas-wrap', 'aria-hidden': 'true' });
        M.els.skel.innerHTML = global.Skeleton.html('mindmap.canvas');
        M.els.canvas.appendChild(M.els.skel);
      } else if (!on && M.els.skel) {
        M.els.skel.remove();
        M.els.skel = null;
      }
    };
    M.reload = function reload(opts) {
      var quiet = !!(opts && opts.quiet);
      if (!quiet) M.showSkeleton(true);
      return global.GanttTrello.loadBoard(M.t).then(function (board) {
        M.state.records = board.cards || [];
        M.state.lists = board.lists || M.state.lists || [];
        M.showSkeleton(false);
        M.rebuild({ relayout: !quiet });
        global.Skeleton.remember('mindmap', { nodes: M.state.graph.nodes.length });
      }).catch(function (err) {
        M.showSkeleton(false);
        M.gNodes.textContent = '';
        M.gEdges.textContent = '';
        M.els.hint.hidden = false;
        M.els.hint.textContent = 'Impossible de charger le tableau : ' + ((err && err.message) || err);
      });
    };
    M.taskRec = function taskRec(cardId) {
      return (M.state.records || []).filter(function (r) { return r.id === cardId; })[0] || null;
    };
    M.openNewCard = function openNewCard() {
      var open = (M.state.lists || []).filter(function (l) { return l.category !== 'completed' && l.category !== 'canceled' && l.category !== 'blocked'; });
      var target = open.filter(function (l) { return l.category === 'unstarted'; })[0] || open[0];
      if (!target || !global.NewCard) return;
      global.NewCard.open({
        t: M.t,
        lists: M.state.lists,
        listId: target.id,
        onError: function (err) { M.setStatus('Échec : ' + ((err && err.message) || 'erreur'), 'error'); },
        onCreated: function (c) { M.setStatus('Carte créée dans « ' + c.list.name + ' »', 'ok'); M.refreshAfterEdit(); },
      });
    };
    },
    run: function (M) {
    M.perspMenuEl = null;
    global.GraphCanvas.attachPinch(M.svg, { get: function () { return M.state.view; }, set: function (v) { M.state.view = v; M.applyView(); }, minK: 0.15, maxK: 3 });
    M.svg.addEventListener('mousedown', function (ev) { if (ev.button === 1) ev.preventDefault(); });
    M.svg.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 && ev.button !== 1) return;
      if (ev.button === 1) ev.preventDefault();
      if (ev.button === 0 && (M.state.marqueeTool || ev.shiftKey || ev.ctrlKey || ev.metaKey) && !M.state.linkFrom && !M.state.relink) { ev.preventDefault(); return M.startMarquee(ev); }
      var start = { x: ev.clientX, y: ev.clientY, vx: M.state.view.x, vy: M.state.view.y };
      var moved = false;
      var edgeId = ev.target && ev.target.getAttribute ? ev.target.getAttribute('data-edge') : null; // pointer capture would retarget the click
      try { M.svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      function move(me) {
        var dx = me.clientX - start.x;
        var dy = me.clientY - start.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        M.state.view.x = start.vx + dx;
        M.state.view.y = start.vy + dy;
        M.applyView();
      }
      function up() {
        M.svg.removeEventListener('pointermove', move);
        M.svg.removeEventListener('pointerup', up);
        M.svg.removeEventListener('pointercancel', up);
        if (moved || ev.button !== 0) return;
        if (edgeId && M.edgeById(edgeId)) M.onEdgeClick(M.edgeById(edgeId));
        else if (M.state.selected || M.state.selectedEdge || M.state.selectedGroup) M.select(null);
      }
      M.svg.addEventListener('pointermove', move);
      M.svg.addEventListener('pointerup', up);
      M.svg.addEventListener('pointercancel', up);
    });
    M.svg.addEventListener('dblclick', function (ev) {
      var hit = ev.target.closest && ev.target.closest('.mm-node');
      if (!ev.button && hit && !ev.target.closest('.mm-pin')) {
        var hn = M.nodeById(hit.getAttribute('data-id'));
        if (hn && (hn.kind === 'task' || hn.kind === 'goal')) { ev.preventDefault(); M.editTitleInline(hn); }
        return;
      }
      if (ev.button || (ev.target.closest && ev.target.closest('.mm-node, .mm-edge-hit'))) return;
      var r = M.svg.getBoundingClientRect();
      M.askNewTask(null, null, { x: (ev.clientX - r.left - M.state.view.x) / M.state.view.k, y: (ev.clientY - r.top - M.state.view.y) / M.state.view.k }, ev);
    });
    M.svg.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var r = M.svg.getBoundingClientRect();
      var px = ev.clientX - r.left;
      var py = ev.clientY - r.top;
      M.state.view = global.GraphCanvas.zoomAt(M.state.view, px, py, ev.deltaY < 0 ? 1.12 : 1 / 1.12, 0.15, 3);
      M.applyView();
    }, { passive: false });
    M.root.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { M.endLink(); M.select(null); }
      var tag = ev.target && ev.target.tagName;
      var typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && M.state.selectedEdge && !typing) {
        ev.preventDefault();
        M.removeEdge(M.edgeById(M.state.selectedEdge));
      }
    });
    document.addEventListener('keydown', function (ev) {
      var tag = ev.target && ev.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (ev.target && ev.target.isContentEditable)) return;
      var mod = ev.ctrlKey || ev.metaKey;
      var k = String(ev.key || '').toLowerCase();
      if (mod && k === 'a') { ev.preventDefault(); M.selectAll(); }
      else if (mod && k === 'c') { if (M.copySelection()) ev.preventDefault(); }
      else if (mod && k === 'x') { if (M.copySelection()) { ev.preventDefault(); M.deleteSelection({ force: true }); } }
      else if (mod && k === 'v') { ev.preventDefault(); M.pasteClip(); }
      else if ((ev.key === 'Delete' || ev.key === 'Backspace') && !M.state.selectedEdge && M.pickedNodes().length) { ev.preventDefault(); M.deleteSelection(); }
    });
    M.menuEl = null;
    M.subEl = null;
    M.svg.addEventListener('contextmenu', M.openMenu);
    document.addEventListener('pointerdown', function (ev) {
      if (M.menuEl && !M.menuEl.contains(ev.target) && !(M.subEl && M.subEl.contains(ev.target))) M.closeMenu();
      if (M.perspMenuEl && !M.perspMenuEl.contains(ev.target) && !(ev.target.closest && ev.target.closest('.mm-persp-btn'))) M.closePerspMenu();
      if (M.lensMenuEl && !M.lensMenuEl.contains(ev.target) && !(ev.target.closest && ev.target.closest('.mm-lens-btn'))) M.closeLensMenu();
    }, true);
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { M.closeMenu(); M.closeLensMenu(); M.closePerspMenu(); } });
    global.addEventListener('resize', function () { if (!M.state.graph.nodes.length) M.fit(); });
    M.HD.subscribe(function (on) {
      M.state.hideDone = on;
      M.rebuild({ relayout: true });
    });
    if (global.LinearKeys) {
      global.LinearKeys.attach({
        t: M.t,
        hoverSelector: '.mm-node--task[data-id]',
        idOf: function (el) { return String(el.getAttribute('data-id') || '').replace(/^t:/, ''); },
        selectedId: function () { var s = String(M.state.selected || ''); return s.indexOf('t:') === 0 ? s.slice(2) : ''; },
        row: function (id) { var r = M.taskRec(id); return r ? { id: id, listId: r.listId, name: r.name } : null; },
        lists: function () { return M.state.lists || []; },
        setStatus: function (row, list) {
          var rec = M.taskRec(row.id);
          if (!rec) return;
          M.runEdit(function () { return global.TableTrello.moveCard(M.t, rec.id, list.id, 'bottom'); }, M.statusEntry(rec, list.id));
        },
        setUrgency: function (row, urgencyId) {
          M.runEdit(function () { return global.LinearKeys.saveUrgency(M.t, row.id, urgencyId); });
        },
        openDue: function (row, anchor) {
          var rec = M.taskRec(row.id);
          if (rec) M.openFieldEditor(rec, 'due', anchor);
        },
        newCard: M.openNewCard,
      });
    }
    M.renderBar();
    M.bindBoard();
    if (global.AssistantDock) {
      global.AssistantDock.mount({ t: M.t, after: M.root, onRefresh: function () { M.reload({ quiet: true }); }, isBusy: function () { return global.CardFields && global.CardFields.isOpen(); } });
    }
    if (global.CommandPalette) {
      global.CommandPalette.attach({
        cards: function () { return M.state.records.map(function (r) { return { id: r.id, name: r.name }; }); },
        onCard: function (id) { if (M.nodeById('t:' + id)) M.select('t:' + id); },
        actions: function () { return [{ label: 'Nouvelle carte', icon: 'plus', run: M.openNewCard }]; },
        isBusy: function () { return global.CardFields && global.CardFields.isOpen(); },
      });
    }
    return { v: M.reload().then(M.loadGoals) };
    }
  });
})(typeof window !== 'undefined' ? window : this);
