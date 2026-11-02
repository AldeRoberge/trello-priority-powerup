/**
 * mindmap-ui: mount() part 2 of 3.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see mindmap-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.MindmapUiParts = global.MindmapUiParts || {});
  var P = (global.MindmapUiPartsMountMount = global.MindmapUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.nudgeOrbitIntoView = function nudgeOrbitIntoView() {
      if (!M.state.rings) return;
      var k = M.state.view.k || 1;
      var w = M.els.canvas.clientWidth || 0;
      var h = M.els.canvas.clientHeight || 0;
      if (!w || !h) return;
      var pad = 16;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      M.state.graph.nodes.forEach(function (n) {
        var ring = M.state.rings[n.id];
        if (ring !== 0 && ring !== 1 && ring !== 2) return;
        var hw = (n.w || 160) / 2;
        var hh = (n.h || 40) / 2;
        minX = Math.min(minX, n.x - hw);
        maxX = Math.max(maxX, n.x + hw);
        minY = Math.min(minY, n.y - hh);
        maxY = Math.max(maxY, n.y + hh);
      });
      if (!isFinite(minX)) return;
      var left = minX * k + M.state.view.x;
      var right = maxX * k + M.state.view.x;
      var top = minY * k + M.state.view.y;
      var bottom = maxY * k + M.state.view.y;
      var dx = 0;
      var dy = 0;
      if (top < pad) dy = pad - top;
      else if (bottom > h - pad) dy = (h - pad) - bottom;
      if (left < pad) dx = pad - left;
      else if (right > w - pad) dx = (w - pad) - right;
      if (bottom - top > h - pad * 2 || right - left > w - pad * 2) {
        var focus = M.state.selected && M.nodeById(M.state.selected);
        if (focus) {
          var fx = focus.x * k + M.state.view.x + dx;
          var fy = focus.y * k + M.state.view.y + dy;
          var fw = ((focus.w || 160) * k) / 2;
          var fh = ((focus.h || 40) * k) / 2;
          if (fx - fw < pad) dx += pad - (fx - fw);
          if (fx + fw > w - pad) dx -= (fx + fw) - (w - pad);
          if (fy - fh < pad) dy += pad - (fy - fh);
          if (fy + fh > h - pad) dy -= (fy + fh) - (h - pad);
        }
      }
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      M.state.view.x += dx;
      M.state.view.y += dy;
      M.applyView();
    };
    M.parkOrbit = function parkOrbit() {
      M.poseGen++;
      M.poseTargets = null;
      if (M.orbitFrame) clearInterval(M.orbitFrame);
      M.orbitFrame = 0;
      if (M.state.rest) {
        M.state.graph.nodes.forEach(function (n) {
          var home = M.state.rest[n.id];
          if (home) { n.x = home.x; n.y = home.y; }
        });
      }
      M.state.rest = null;
      M.state.rings = null;
    };
    M.beginOrbit = function beginOrbit(animate) {
      if (M.state.persp) { M.state.rings = null; M.applyFocus(); return; }
      var focus = M.state.selected && M.nodeById(M.state.selected);
      if (!focus || !isFinite(focus.x) || !isFinite(focus.y)) return;
      if (!M.state.rest) {
        M.state.rest = {};
        M.state.graph.nodes.forEach(function (n) {
          M.state.rest[n.id] = { x: n.x, y: n.y };
        });
      }
      var virtual = M.state.graph.nodes.map(function (n) {
        var home = M.state.rest[n.id] || { x: n.x, y: n.y };
        var here = n.id === focus.id;
        return {
          id: n.id, kind: n.kind, label: n.label, w: n.w, h: n.h,
          x: here ? focus.x : home.x,
          y: here ? focus.y : home.y,
        };
      });
      var pose = S.MM().orbit(virtual, M.state.graph.edges, focus.id);
      M.state.rings = pose.rings;
      M.applyFocus();
      M.moveTo(pose.positions, animate);
    };
    M.endOrbit = function endOrbit(animate) {
      if (M.state.persp) { M.state.rings = null; M.applyFocus(); return; }
      if (!M.state.rest) {
        M.state.rings = null;
        M.syncOrbitRing();
        return;
      }
      var token = M.state.rest;
      var back = {};
      M.state.graph.nodes.forEach(function (n) {
        if (token[n.id]) back[n.id] = { x: token[n.id].x, y: token[n.id].y };
      });
      M.state.rings = null;
      M.applyFocus();
      M.moveTo(back, animate, function (gen) {
        if (gen !== M.poseGen) return;
        if (M.state.rest === token) M.state.rest = null;
        M.syncOrbitRing();
      });
    };
    M.select = function select(id) {
      M.state.multi = {};
      M.state.selected = id;
      M.state.selectedEdge = null;
      M.state.selectedGroup = null;
      M.state.confirmDelete = null;
      M.applyFocus();
      M.renderPanel();
      M.applyLod();
      if (id) M.beginOrbit(true);
      else M.endOrbit(true);
      if (typeof M.paintGroupSelection === 'function') M.paintGroupSelection();
    };
    M.selectEdge = function selectEdge(id) {
      M.state.multi = {};
      M.state.selectedEdge = id;
      M.state.selected = null;
      M.state.selectedGroup = null;
      M.state.confirmDelete = null;
      M.endOrbit(true);
      M.applyFocus();
      M.renderPanel();
      if (typeof M.paintGroupSelection === 'function') M.paintGroupSelection();
    };
    M.pickedNodes = function pickedNodes() {
      var ids = Object.keys(M.state.multi);
      if (!ids.length && M.state.selected) ids = [M.state.selected];
      return ids.map(M.nodeById).filter(function (n) { return n && (n.kind === 'task' || n.kind === 'goal'); });
    };
    M.toggleMulti = function toggleMulti(n) {
      if (n.kind !== 'task' && n.kind !== 'goal') return;
      if (!Object.keys(M.state.multi).length && M.state.selected && M.state.selected !== n.id) M.state.multi[M.state.selected] = true;
      M.state.selected = null;
      M.state.selectedEdge = null;
      M.state.selectedGroup = null;
      if (M.state.multi[n.id]) delete M.state.multi[n.id]; else M.state.multi[n.id] = true;
      M.endOrbit(false);
      M.applyFocus();
      M.renderPanel();
      if (typeof M.paintGroupSelection === 'function') M.paintGroupSelection();
    };
    M.selectAll = function selectAll() {
      M.state.multi = {};
      M.state.graph.nodes.forEach(function (n) { if (n.kind === 'task' || n.kind === 'goal') M.state.multi[n.id] = true; });
      M.state.selected = null;
      M.state.selectedEdge = null;
      M.state.selectedGroup = null;
      M.state.confirmDelete = null;
      M.endOrbit(false);
      M.applyFocus();
      M.renderPanel();
      if (typeof M.paintGroupSelection === 'function') M.paintGroupSelection();
      M.setStatus(Object.keys(M.state.multi).length + ' éléments sélectionnés', 'ok');
    };
    M.copySelection = function copySelection() {
      var nodes = M.pickedNodes();
      if (!nodes.length) return false;
      var ids = {};
      nodes.forEach(function (n) { ids[n.id] = true; });
      var clip = { tasks: [], goals: [], depends: [], serves: [] };
      nodes.forEach(function (n) {
        if (n.kind === 'task' && n.rec) clip.tasks.push({ id: n.id, name: n.rec.name || n.label, listId: n.rec.listId, x: n.x, y: n.y });
        else if (n.kind === 'goal') clip.goals.push({ id: n.id, level: n.level, name: n.label, x: n.x, y: n.y });
      });
      M.state.graph.edges.forEach(function (e) {
        if (!ids[e.from] || !ids[e.to]) return;
        if (e.kind === 'depends') clip.depends.push({ from: e.from, to: e.to, dep: e.dep });
        else if (e.kind === 'serves') clip.serves.push({ from: e.from, to: e.to });
      });
      M.state.clip = clip;
      M.state.pasteN = 0;
      try { navigator.clipboard.writeText(nodes.map(function (n) { return n.label; }).join('\n')); } catch (e) { /* the internal clipboard is enough */ }
      M.setStatus(nodes.length + (nodes.length > 1 ? ' éléments copiés' : ' élément copié'), 'ok');
      return true;
    };
    M.deleteSelection = function deleteSelection(opts) {
      var nodes = (opts && opts.nodes) || M.pickedNodes();
      if (!nodes.length) return Promise.resolve();
      var key = nodes.map(function (n) { return n.id; }).sort().join('|');
      if (!(opts && opts.force) && !(M.state.confirmDeleteKey === key && Date.now() - M.state.confirmDeleteAt < 4000)) {
        M.state.confirmDeleteKey = key;
        M.state.confirmDeleteAt = Date.now();
        M.setStatus('Appuyez encore sur Suppr pour supprimer ' + nodes.length + (nodes.length > 1 ? ' éléments' : ' élément'), 'ok');
        return Promise.resolve();
      }
      M.state.confirmDeleteKey = null;
      var tasks = nodes.filter(function (n) { return n.kind === 'task' && n.rec; });
      var goals = nodes.filter(function (n) { return n.kind === 'goal'; });
      var gone = {};
      nodes.forEach(function (n) { gone[n.id] = true; });
      var pt = global.PriorityTrello;
      M.select(null);
      M.setStatus('Suppression…');
      var step = Promise.resolve();
      if (tasks.length) {
        step = global.GanttTrello.ensureRestAuthorized(M.t).then(function (auth) {
          if (!auth || !auth.ok) throw new Error('Trello n’est pas autorisé');
          return Promise.all(tasks.map(function (n) {
            return pt.restPutCard(M.t, n.rec.id, { closed: true }).then(function (r) {
              if (r && r.ok === false) throw new Error(r.reason || 'erreur');
            });
          }));
        });
      }
      return step.then(function () {
        var drop = M.state.goals.links.filter(function (l) { return gone[l.from] || gone[l.to]; }).map(function (l) { return l.from + '>' + l.to; });
        if (goals.length && M.goalsEditable()) {
          return M.saveGoals(M.goalsWith({ nodes: M.state.goals.nodes.filter(function (g) { return !gone[g.id]; }), unlink: drop }));
        }
        if (tasks.length && drop.length && M.state.goalsLoaded) return M.saveGoals(M.goalsWith({ unlink: drop }));
        return null;
      }).then(function () {
        if (!tasks.length) return null;
        return global.GanttTrello.loadBoard(M.t).then(function (board) {
          M.state.records = board.cards || [];
          M.state.lists = board.lists || M.state.lists || [];
          M.rebuild({ keepView: true });
          M.setStatus(nodes.length + (nodes.length > 1 ? ' éléments supprimés' : ' élément supprimé'), 'ok');
        });
      }).catch(function (err) {
        M.setStatus('Échec : ' + ((err && err.message) || 'erreur'), 'error');
      });
    };
    M.pasteClip = function pasteClip() {
      var clip = M.state.clip;
      var pt = global.PriorityTrello;
      if (!clip || (!clip.tasks.length && !clip.goals.length)) { M.setStatus('Rien à coller : copiez d’abord (Ctrl+C)', 'error'); return Promise.resolve(); }
      if (clip.goals.length && !M.goalsEditable()) return Promise.resolve();
      M.state.pasteN++;
      var off = 40 * M.state.pasteN;
      var map = {};
      var added = [];
      M.setStatus('Collage…');
      var chain = Promise.resolve();
      clip.tasks.forEach(function (c) {
        chain = chain.then(function () {
          return pt.createCard(M.t, { name: c.name, idList: c.listId }).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.reason) || 'erreur');
            map[c.id] = 't:' + res.cardId;
            M.state.dropPos['t:' + res.cardId] = { x: c.x + off, y: c.y + off };
            added.push('t:' + res.cardId);
          });
        });
      });
      return chain.then(function () {
        // The cards were just made over REST: Trello's client may not know them yet.
        var jobs = clip.tasks.map(function (c) {
          var deps = clip.depends.filter(function (d) { return d.from === c.id; });
          if (!deps.length) return null;
          var cardId = map[c.id].slice(2);
          var list = deps.map(function (d) { return map[d.to].slice(2); });
          var types = {};
          deps.forEach(function (d) { if (d.dep && d.dep !== 'depends') types[map[d.to].slice(2)] = d.dep; });
          var attempt = 0;
          var save = function () {
            return pt.saveCardInputsById(M.t, cardId, { dependsOn: list, depTypes: types }).catch(function (err) {
              if (++attempt >= 8 || !/not found|not on current board/i.test((err && err.message) || '')) throw err;
              return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(save);
            });
          };
          return save();
        }).filter(Boolean);
        return Promise.all(jobs);
      }).then(function () {
        if (!clip.goals.length && !clip.serves.length) return null;
        var GG = global.MindmapGoalsTrello;
        var newGoals = clip.goals.map(function (g) {
          var id = GG.newId();
          map[g.id] = id;
          M.state.dropPos[id] = { x: g.x + off, y: g.y + off };
          added.push(id);
          return { id: id, level: g.level, name: g.name };
        });
        var links = clip.serves.filter(function (l) { return map[l.from] && map[l.to]; }).map(function (l) { return { from: map[l.from], to: map[l.to] }; });
        if (!newGoals.length && !links.length) return null;
        if (!M.state.goalsLoaded) return null;
        return M.saveGoals(M.goalsWith({ nodes: M.state.goals.nodes.concat(newGoals), link: links }));
      }).then(function () {
        return global.GanttTrello.loadBoard(M.t);
      }).then(function (board) {
        M.state.records = board.cards || [];
        M.state.lists = board.lists || M.state.lists || [];
        M.rebuild({ keepView: true });
        M.state.multi = {};
        added.forEach(function (id) { if (M.nodeById(id)) M.state.multi[id] = true; });
        M.state.selected = null;
        M.applyFocus();
        M.renderPanel();
        M.setStatus(added.length + (added.length > 1 ? ' éléments collés' : ' élément collé'), 'ok');
      }).catch(function (err) {
        M.setStatus('Échec : ' + ((err && err.message) || 'erreur'), 'error');
      });
    };
    M.startLink = function startLink(nodeId) {
      M.state.linkFrom = nodeId;
      M.state.relink = null;
      M.els.hint.hidden = true;
      M.root.classList.add('is-linking');
      M.renderBar();
      M.applyFocus();
    };
    M.startRelink = function startRelink(edgeId) {
      M.state.relink = edgeId;
      M.state.linkFrom = null;
      M.els.hint.hidden = true;
      M.root.classList.add('is-linking');
      M.renderBar();
      M.applyFocus();
    };
    M.endLink = function endLink() {
      M.state.linkFrom = null;
      M.state.relink = null;
      M.els.hint.hidden = true;
      M.root.classList.remove('is-linking');
      M.renderBar();
      M.applyFocus();
    };
    M.applyLink = function applyLink(aId, bId) {
      var res = S.MM().linkBetween(M.nodeById(aId), M.nodeById(bId));
      if (res.error) { M.setStatus(res.error, 'error'); return Promise.resolve(); }
      if (res.kind === 'depends') return M.toggleDependency(res.from.slice(2), res.to.slice(2));
      return M.toggleServes(res.from, res.to);
    };
    M.linkFromPin = function linkFromPin(n, side, targetId) {
      var tn = M.nodeById(targetId);
      if (tn && n.kind === 'task' && tn.kind === 'task' && (side === 'right' || side === 'bottom')) return M.applyLink(targetId, n.id);
      return M.applyLink(n.id, targetId);
    };
    M.askNewTask = function askNewTask(src, side, p, me, wire) {
      var r = M.els.canvas.getBoundingClientRect();
      var input = S.h('input', { class: 'mm-input mm-newtask', type: 'text', placeholder: 'Nouvelle tâche…', maxlength: '120', 'aria-label': 'Nom de la nouvelle tâche' });
      input.style.cssText = 'position:absolute;z-index:5;width:210px;left:' + Math.max(4, me.clientX - r.left - (side === 'right' ? 0 : side === 'left' ? 210 : 105)) + 'px;top:' + Math.max(4, me.clientY - r.top - 16) + 'px';
      var done = false;
      var list = S.h('ul', { class: 'mm-suggest', role: 'listbox' });
      list.style.cssText = 'position:absolute;z-index:6;width:210px;left:' + input.style.left + ';top:' + (parseFloat(input.style.top) + 36) + 'px';
      list.hidden = true;
      list.addEventListener('mousedown', function (ev) { ev.preventDefault(); }); // keep the focus in the input
      var matches = [];
      var active = -1;
      function close() {
        done = true;
        [input, list, wire].forEach(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); });
      }
      function paintActive() {
        Array.prototype.forEach.call(list.children, function (li, i) { li.classList.toggle('is-active', i === active); });
      }
      function refresh() {
        var q = input.value.trim().toLowerCase();
        matches = !q ? [] : M.state.graph.nodes.filter(function (n) {
          return n.kind === 'task' && (!src || n.id !== src.id) && n.label.toLowerCase().indexOf(q) >= 0;
        }).slice(0, 8);
        active = -1;
        list.textContent = '';
        matches.forEach(function (n, i) {
          var li = S.h('li', { class: 'mm-suggest-item', role: 'option', text: n.label });
          li.addEventListener('click', function () { choose(n); });
          li.addEventListener('mousemove', function () { active = i; paintActive(); });
          list.appendChild(li);
        });
        list.hidden = !matches.length;
      }
      function choose(n) {
        close();
        if (src) M.linkFromPin(src, side, n.id);
        else M.select(n.id);
      }
      input.addEventListener('input', refresh);
      input.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Escape') close();
        else if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && matches.length) {
          ev.preventDefault();
          active = ev.key === 'ArrowDown' ? (active + 1) % matches.length : (active - 1 + matches.length) % matches.length;
          paintActive();
        } else if (ev.key === 'Enter') {
          ev.preventDefault();
          if (active >= 0) return choose(matches[active]);
          var name = input.value.trim();
          close();
          if (name) M.createTaskAt(src, side, p, name);
        }
      });
      input.addEventListener('blur', function () {
        if (done) return;
        var name = input.value.trim();
        close();
        if (name) M.createTaskAt(src, side, p, name); // clicking away keeps what was typed
      });
      M.els.canvas.appendChild(list);
      M.els.canvas.appendChild(input);
      input.focus();
    };
    M.createTaskAt = function createTaskAt(src, side, p, name) {
      var pt = global.PriorityTrello;
      var srcRec = src && src.rec;
      var sel = !srcRec && M.state.selected && M.nodeById(M.state.selected);
      var listRec = srcRec || (sel && sel.kind === 'task' && sel.rec) || M.state.records[0];
      if (!pt || typeof pt.createCard !== 'function' || !listRec || !listRec.listId) {
        M.setStatus('Création indisponible', 'error');
        return Promise.resolve();
      }
      var below = side === 'bottom';
      var above = side === 'top';
      var pos = { x: p.x + (side === 'right' ? 105 : side === 'left' ? -105 : 0), y: p.y + (below ? 22 : above ? -22 : 0) };
      M.setStatus('Création…', 'busy');
      // Show the card right away, exactly where it was dropped; the real card replaces it once Trello answers.
      var temp = { id: 'new-' + Date.now().toString(36), name: name, listId: listRec.listId, listName: listRec.listName, progress: 0, inputs: {}, assignees: [], items: [], pending: true };
      M.state.pending.push(temp);
      M.state.dropPos['t:' + temp.id] = pos;
      M.rebuild({ keepView: true });
      function dropTemp() {
        M.state.pending = M.state.pending.filter(function (r) { return r !== temp; });
      }
      return pt.createCard(M.t, { name: name, idList: listRec.listId }).then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.reason) || 'erreur');
        var newId = res.cardId;
        var tempNode = M.nodeById('t:' + temp.id);
        M.state.dropPos['t:' + newId] = tempNode && isFinite(tempNode.x) ? { x: tempNode.x, y: tempNode.y } : pos;
        // swap the placeholder for the real id in place so the card does not flicker or move
        dropTemp();
        M.state.records = M.state.records.concat([Object.assign({}, temp, { id: newId, pending: false })]);
        M.rebuild({ keepView: true });
        if (!src) return null;
        var dependsOnSrc = side === 'right' || side === 'bottom';
        var depCard = dependsOnSrc ? newId : src.rec.id;
        var depId = dependsOnSrc ? src.rec.id : newId;
        var existing = dependsOnSrc ? [] : ((src.rec.inputs && src.rec.inputs.dependsOn) || []).slice();
        // The card was just made over REST: Trello's client may not know it yet ("Card not found or not on current board").
        var attempt = 0;
        var save = function () {
          return pt.saveCardInputsById(M.t, depCard, { dependsOn: existing.concat([depId]) }).catch(function (err) {
            if (++attempt >= 8 || !/not found|not on current board/i.test((err && err.message) || '')) throw err;
            return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(save);
          });
        };
        return save();
      }).then(function () {
        return global.GanttTrello.loadBoard(M.t);
      }).then(function (board) {
        M.state.records = board.cards || [];
        M.state.lists = board.lists || M.state.lists || [];
        M.setStatus('Tâche créée', 'ok');
        M.rebuild({ keepView: true });
      }).catch(function (err) {
        dropTemp();
        M.rebuild({ keepView: true });
        M.setStatus('Échec : ' + ((err && err.message) || 'erreur'), 'error');
      });
    };
    M.edgesWithout = function edgesWithout(e) {
      return M.state.graph.edges.filter(function (x) { return x.id !== e.id; });
    };
    M.removeEdge = function removeEdge(e) {
      if (!e) return Promise.resolve();
      if (e.kind === 'depends') return M.setDependency(e.from.slice(2), e.to.slice(2), false);
      if (e.kind === 'serves') return M.toggleServes(e.from, e.to);
      M.setStatus('Ce lien se modifie dans la carte (Ouvrir la carte)', 'error');
      return Promise.resolve();
    };
    M.reverseEdge = function reverseEdge(e) {
      if (!e || e.kind !== 'depends') return Promise.resolve();
      if (S.MM().wouldCycle(M.edgesWithout(e), e.to, e.from)) {
        M.setStatus('Impossible : cela créerait une boucle de dépendances', 'error');
        return Promise.resolve();
      }
      return M.setDependency(e.from.slice(2), e.to.slice(2), false).then(function () {
        return M.setDependency(e.to.slice(2), e.from.slice(2), true, e.dep);
      }).then(function () { M.selectEdge('depends:' + e.to + '>' + e.from); });
    };
    M.retarget = function retarget(e, n) {
      M.endLink();
      if (!e) return Promise.resolve();
      if (e.kind === 'depends') {
        if (n.kind !== 'task' || n.id === e.from || n.id === e.to) { M.setStatus('Choisissez une autre tâche', 'error'); return Promise.resolve(); }
        if (S.MM().wouldCycle(M.edgesWithout(e), e.from, n.id)) {
          M.setStatus('Impossible : cela créerait une boucle de dépendances', 'error');
          return Promise.resolve();
        }
        return M.setDependency(e.from.slice(2), e.to.slice(2), false).then(function () {
          return M.setDependency(e.from.slice(2), n.id.slice(2), true, e.dep);
        }).then(function () { M.selectEdge('depends:' + e.from + '>' + n.id); });
      }
      if (e.kind === 'serves') {
        var from = M.nodeById(e.from);
        if (n.kind !== 'goal' || S.MM().rankOf(from) <= S.MM().rankOf(n)) { M.setStatus('Choisissez un élément d’un niveau supérieur', 'error'); return Promise.resolve(); }
        return M.saveGoals(M.goalsWith({ unlink: [e.from + '>' + e.to], link: [{ from: e.from, to: n.id }] })).then(function () { M.selectEdge('serves:' + e.from + '>' + n.id); });
      }
      M.setStatus('Ce lien se modifie dans la carte (Ouvrir la carte)', 'error');
      return Promise.resolve();
    };
    M.resource = function resource(e, n) {
      if (!e) return Promise.resolve();
      if (e.kind === 'depends') {
        if (n.kind !== 'task' || n.id === e.from || n.id === e.to) { M.setStatus('Choisissez une autre tâche', 'error'); return Promise.resolve(); }
        if (S.MM().wouldCycle(M.edgesWithout(e), n.id, e.to)) {
          M.setStatus('Impossible : cela créerait une boucle de dépendances', 'error');
          return Promise.resolve();
        }
        return M.setDependency(e.from.slice(2), e.to.slice(2), false).then(function () {
          return M.setDependency(n.id.slice(2), e.to.slice(2), true, e.dep);
        }).then(function () { M.selectEdge('depends:' + n.id + '>' + e.to); });
      }
      if (e.kind === 'serves') {
        var to = M.nodeById(e.to);
        if (n.id === e.to || S.MM().rankOf(n) < 0 || S.MM().rankOf(n) >= S.MM().rankOf(to)) { M.setStatus('Choisissez un élément d’un niveau inférieur', 'error'); return Promise.resolve(); }
        return M.saveGoals(M.goalsWith({ unlink: [e.from + '>' + e.to], link: [{ from: n.id, to: e.to }] })).then(function () { M.selectEdge('serves:' + n.id + '>' + e.to); });
      }
      M.setStatus('Ce lien se modifie dans la carte (Ouvrir la carte)', 'error');
      return Promise.resolve();
    };
    M.reasonText = function reasonText(err) {
      var r = err && (err.reason || err.message);
      if (r === 'conflict') return 'modifié ailleurs, actualisez la vue';
      if (r === 'too-long') return 'trop de données (16 000 caractères max)';
      if (r === 'not-authorized' || r === 'auth-failed') return 'Trello n’est pas autorisé';
      return r || 'erreur';
    };
    M.goalsWith = function goalsWith(change) {
      var drop = Object.create(null);
      (change.unlink || []).forEach(function (k) { drop[k] = true; });
      return {
        nodes: (change.nodes || M.state.goals.nodes).slice(),
        links: (change.links || M.state.goals.links).filter(function (l) { return !drop[l.from + '>' + l.to]; }).concat(change.link || []),
      };
    };
    M.goalsEditable = function goalsEditable() {
      if (M.state.goalsLoaded) return true;
      M.setStatus('Autorisez Trello pour modifier les objectifs', 'error');
      return false;
    };
    M.record = function record(e) {
      e.type = 'edit';
      return M.HP ? M.HP.record(e) : e;
    };
    M.applyEntry = function applyEntry(e, back) {
      var val = back ? e.beforeVal : e.afterVal;
      var TT = global.TableTrello;
      if (e.kind === 'goals') {
        return global.MindmapGoalsTrello.save(M.t, S.MM().normalizeGoals(val)).then(function (saved) { M.state.goals = saved; });
      }
      if (e.kind === 'deps') {
        return global.PriorityTrello.saveCardInputsById(M.t, e.targetId, { dependsOn: val.dependsOn || [], depTypes: val.depTypes || {} });
      }
      if (e.kind === 'name') return TT.saveName(M.t, e.targetId, val);
      if (e.kind === 'status') return TT.moveCard(M.t, e.targetId, val, 'bottom');
      if (e.kind === 'progress') return M.writeProgressTo(e.targetId, val);
      return Promise.resolve();
    };
    M.saveGoals = function saveGoals(next) {
      var GG = global.MindmapGoalsTrello;
      if (!GG) { M.setStatus('Enregistrement indisponible', 'error'); return Promise.resolve(); }
      var prev = M.state.goals;
      M.state.goals = S.MM().normalizeGoals(next);
      M.setStatus('Enregistrement…');
      M.rebuild({ keepView: true });
      return GG.save(M.t, M.state.goals).then(function (saved) {
        M.state.goals = saved;
        M.record({ kind: 'goals', title: 'Objectifs et liens', verb: 'modifiés', beforeVal: prev, afterVal: saved });
        M.setStatus('Enregistré', 'ok');
      }).catch(function (err) {
        M.state.goals = prev;
        M.rebuild({ keepView: true });
        M.setStatus('Échec : ' + M.reasonText(err), 'error');
      });
    };
    M.toggleServes = function toggleServes(from, to) {
      if (!M.goalsEditable()) return Promise.resolve();
      var key = from + '>' + to;
      var has = M.state.goals.links.some(function (l) { return l.from + '>' + l.to === key; });
      return M.saveGoals(has ? M.goalsWith({ unlink: [key] }) : M.goalsWith({ link: [{ from: from, to: to }] }));
    };
    M.createGoal = function createGoal(level, name, parentId) {
      if (!M.goalsEditable()) return Promise.resolve();
      name = String(name || '').replace(/\s+/g, ' ').trim();
      if (!name) { M.setStatus('Donnez un nom', 'error'); return Promise.resolve(); }
      var id = global.MindmapGoalsTrello.newId();
      var parent = parentId && M.nodeById(parentId);
      var link = parent && S.MM().rankOf(parent) >= 0 && S.MM().rankOf(parent) < S.MM().rankOf({ kind: 'goal', level: level }) ? [{ from: id, to: parentId }] : [];
      var p = M.saveGoals(M.goalsWith({ nodes: M.state.goals.nodes.concat([{ id: id, level: level, name: name }]), link: link }));
      if (level === 'project' && global.ProjectIcon && typeof global.ProjectIcon.suggest === 'function') {
        p = p.then(function () {
          return global.ProjectIcon.suggest(M.t, name, '').then(function (icon) {
            if (!icon) return;
            var cur = (M.state.goals.nodes || []).filter(function (n) { return n && n.id === id; })[0];
            if (!cur || cur.icon) return;
            return M.saveGoals(M.goalsWith({
              nodes: M.state.goals.nodes.map(function (n) {
                return n.id === id ? Object.assign({}, n, { icon: icon }) : n;
              }),
            }));
          });
        });
      }
      M.select(id); // the optimistic rebuild already created the node
      return p;
    };
    M.renameGoal = function renameGoal(id, name) {
      name = String(name || '').replace(/\s+/g, ' ').trim();
      var cur = M.state.goals.nodes.filter(function (n) { return n.id === id; })[0];
      if (!cur || !name || name === cur.name || !M.goalsEditable()) return Promise.resolve();
      return M.saveGoals(M.goalsWith({ nodes: M.state.goals.nodes.map(function (n) { return n.id === id ? Object.assign({}, n, { name: name }) : n; }) }));
    };
    M.deleteGoal = function deleteGoal(id) {
      if (!M.goalsEditable()) return Promise.resolve();
      var drop = M.state.goals.links.filter(function (l) { return l.from === id || l.to === id; }).map(function (l) { return l.from + '>' + l.to; });
      M.select(null);
      return M.saveGoals(M.goalsWith({ nodes: M.state.goals.nodes.filter(function (n) { return n.id !== id; }), unlink: drop }));
    };
    M.loadGoals = function loadGoals() {
      var GG = global.MindmapGoalsTrello;
      if (!GG || !global.SheetsTrello) { M.state.goalsAuth = null; return Promise.resolve(); }
      return GG.isAuthorized(M.t).then(function (ok) {
        M.state.goalsAuth = ok;
        if (!ok) { M.renderBar(); return; }
        return GG.load(M.t).then(function (data) {
          M.state.goals = data;
          M.state.goalsLoaded = true;
          M.rebuild({ relayout: true });
        });
      }).catch(function (err) {
        M.setStatus('Objectifs indisponibles : ' + M.reasonText(err), 'error');
      });
    };
    M.authorizeGoals = function authorizeGoals() {
      global.MindmapGoalsTrello.authorize(M.t).then(function () { return M.loadGoals(); }, function (err) {
        M.setStatus('Autorisation refusée : ' + M.reasonText(err), 'error');
      });
    };
    M.closeComposer = function closeComposer() {
      M.els.composer.hidden = true;
      M.els.composer.textContent = '';
    };
    M.openComposer = function openComposer(level, parentId) {
      if (!M.goalsEditable()) return;
      var levels = S.MM().LEVELS;
      if (!level) {
        var have = {};
        M.state.goals.nodes.forEach(function (n) { have[n.level] = true; });
        level = (levels.filter(function (l) { return !have[l.id]; })[0] || levels[2]).id;
      }
      var levelSel = S.h('select', { class: 'mm-input', 'aria-label': 'Niveau' }, levels.map(function (l) {
        return S.h('option', { value: l.id, text: l.label });
      }));
      levelSel.value = level;
      var nameInput = S.h('input', { class: 'mm-input', type: 'text', placeholder: 'Nom', maxlength: '120', 'aria-label': 'Nom' });
      var parentSel = S.h('select', { class: 'mm-input', 'aria-label': 'Contribue à' });
      function fillParents() {
        var rank = S.MM().rankOf({ kind: 'goal', level: levelSel.value });
        parentSel.textContent = '';
        parentSel.appendChild(S.h('option', { value: '', text: rank === 0 ? '— (niveau le plus haut)' : '— Aucun —' }));
        M.state.graph.nodes.filter(function (n) { return n.kind === 'goal' && S.MM().rankOf(n) < rank; }).forEach(function (n) {
          parentSel.appendChild(S.h('option', { value: n.id, text: M.kindLabel(n) + ' · ' + S.clip(n.label, 40) }));
        });
        parentSel.value = parentId && M.nodeById(parentId) && S.MM().rankOf(M.nodeById(parentId)) < rank ? parentId : '';
        parentSel.disabled = rank === 0;
      }
      levelSel.addEventListener('change', fillParents);
      fillParents();
      M.els.composer.textContent = '';
      [
        S.h('div', { class: 'mm-composer-title', text: 'Nouvel élément' }),
        S.h('label', { class: 'mm-field' }, [S.h('span', { text: 'Niveau' }), levelSel]),
        S.h('label', { class: 'mm-field' }, [S.h('span', { text: 'Nom' }), nameInput]),
        S.h('label', { class: 'mm-field' }, [S.h('span', { text: 'Contribue à' }), parentSel]),
        S.h('div', { class: 'mm-composer-actions' }, [
          S.h('button', { class: 'mm-btn', type: 'button', onclick: M.closeComposer }, ['Annuler']),
          S.h('button', { class: 'mm-btn mm-btn--primary', type: 'submit' }, [S.icon('plus'), 'Créer']),
        ]),
      ].forEach(function (c) { M.els.composer.appendChild(c); });
      M.els.composer.onsubmit = function (ev) {
        ev.preventDefault();
        if (!nameInput.value.trim()) { nameInput.focus(); return; }
        var lv = levelSel.value;
        var parent = parentSel.value;
        M.closeComposer();
        M.createGoal(lv, nameInput.value, parent);
      };
      M.els.composer.onkeydown = function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); M.closeComposer(); } };
      M.els.composer.hidden = false;
      nameInput.focus();
    };
    M.toggleDependency = function toggleDependency(cardId, depId) {
      var rec = M.recById(cardId);
      if (!rec) return Promise.resolve();
      var current = ((rec.inputs && rec.inputs.dependsOn) || []).slice();
      var at = current.indexOf(depId);
      if (at < 0 && S.MM().wouldCycle(M.state.graph.edges, 't:' + cardId, 't:' + depId)) {
        M.setStatus('Impossible : cela créerait une boucle de dépendances', 'error');
        return Promise.resolve();
      }
      if (at >= 0) current.splice(at, 1);
      else current.push(depId);
      return M.saveDependsOn(rec, current);
    };
    M.setDependency = function setDependency(cardId, depId, on, type) {
      var rec = M.recById(cardId);
      if (!rec) return Promise.resolve();
      var current = ((rec.inputs && rec.inputs.dependsOn) || []).slice();
      var at = current.indexOf(depId);
      if (on && at < 0) current.push(depId);
      else if (!on && at >= 0) current.splice(at, 1);
      else return Promise.resolve();
      return M.saveDependsOn(rec, current, on && type && type !== 'depends' ? M.one(depId, type) : null);
    };
    M.one = function one(k, v) { var o = {}; o[k] = v; return o; };
    M.edgeLabel = function edgeLabel(e) {
      return S.MM().relationPhrase(e, M.state.selected, M.nodeById).text;
    };
    M.setEdgeType = function setEdgeType(e, type) {
      var rec = M.recById(e.from.slice(2));
      if (!rec) return Promise.resolve();
      var current = ((rec.inputs && rec.inputs.dependsOn) || []).slice();
      return M.saveDependsOn(rec, current, M.one(e.to.slice(2), type === 'depends' ? null : type)).then(function () { M.selectEdge(e.id); });
    };
    M.saveDependsOn = function saveDependsOn(rec, list, typeChange) {
      var pt = global.PriorityTrello;
      if (!pt || typeof pt.saveCardInputsById !== 'function') {
        M.setStatus('Enregistrement indisponible', 'error');
        return Promise.resolve();
      }
      M.setStatus('Enregistrement…');
      var beforeDeps = { dependsOn: ((rec.inputs && rec.inputs.dependsOn) || []).slice(), depTypes: Object.assign({}, rec.inputs && rec.inputs.depTypes) };
      return pt.saveCardInputsById(M.t, rec.id, { dependsOn: list, depTypes: Object.assign({}, rec.inputs && rec.inputs.depTypes, typeChange || {}) }).then(function (saved) {
        M.record({
          kind: 'deps', targetId: rec.id, title: rec.name, verb: 'dépendances modifiées',
          beforeVal: beforeDeps, afterVal: { dependsOn: list.slice(), depTypes: Object.assign({}, saved && saved.depTypes) },
        });
        rec.inputs = Object.assign({}, rec.inputs || {}, saved || {});
        if (!list.length) delete rec.inputs.dependsOn;
        if (!saved || !saved.depTypes) delete rec.inputs.depTypes;
        M.setStatus('Enregistré', 'ok');
        M.rebuild({ keepView: true });
      }).catch(function (err) {
        M.setStatus('Échec : ' + ((err && err.message) || 'erreur'), 'error');
      });
    };
    M.openCard = function openCard(rec) {
      if (!rec || !global.TaskFocus) return;
      global.TaskFocus.open({
        t: M.t,
        cardId: rec.id,
        name: rec.name || '',
        onChange: function () { M.reload({ quiet: true }); },
        onToast: function (m, kind) { M.setStatus(m || '', kind === 'error' ? 'error' : 'ok'); },
      });
    };
    M.linkRow = function linkRow(label, node, removeFn) {
      var kids = [
        S.h('button', { class: 'mm-link', onclick: function () { M.select(node.id); }, title: 'Voir ' + node.label }, [
          S.icon(M.nodeIcon(node)),
          S.h('span', { text: S.clip(node.label, 36) }),
        ]),
      ];
      if (removeFn) {
        kids.push(S.h('button', { class: 'mm-x', title: 'Retirer ce lien', 'aria-label': 'Retirer', onclick: removeFn }, [S.icon('x')]));
      }
      return S.h('li', { class: 'mm-row' }, kids);
    };
    M.section = function section(title, rows, extra) {
      if (!rows.length && !extra) return null;
      return S.h('div', { class: 'mm-sec' }, [
        S.h('h4', { text: title }),
        rows.length ? S.h('ul', { class: 'mm-list' }, rows) : null,
        extra || null,
      ]);
    };
    M.renderEdgePanel = function renderEdgePanel(e) {
      M.els.panel.hidden = false;
      var a = M.nodeById(e.from);
      var b = M.nodeById(e.to);
      M.els.panel.appendChild(S.h('div', { class: 'mm-panel-head' }, [
        S.h('div', { class: 'mm-panel-kind', text: 'Lien' }),
        S.h('h3', { text: M.edgeLabel(e) }),
        S.h('button', { class: 'mm-x mm-panel-close', 'aria-label': 'Fermer', onclick: function () { M.select(null); } }, [S.icon('x')]),
      ]));
      M.els.panel.appendChild(M.section('De', [M.linkRow('', a)]));
      M.els.panel.appendChild(M.section('Vers', [M.linkRow('', b)]));
      var editable = e.kind === 'depends' || e.kind === 'serves';
      var actions = S.h('div', { class: 'mm-actions' });
      if (e.kind === 'depends') {
        actions.appendChild(S.h('button', { class: 'mm-btn mm-btn--small', onclick: function () { M.reverseEdge(e); } }, [S.icon('arrows-exchange'), 'Inverser le sens']));
      }
      if (e.kind === 'depends') {
        var typeSel = S.h('select', { class: 'mm-input', 'aria-label': 'Nature du lien' }, Object.keys(S.MM().DEP_LABELS).map(function (k) {
          return S.h('option', { value: k, text: S.MM().DEP_LABELS[k] });
        }));
        typeSel.value = e.dep || 'depends';
        typeSel.addEventListener('change', function () { M.setEdgeType(e, typeSel.value); });
        M.els.panel.appendChild(S.h('label', { class: 'mm-field' }, [S.h('span', { text: 'Nature du lien' }), typeSel]));
      }
      if (editable) {
        actions.appendChild(S.h('button', { class: 'mm-btn mm-btn--small', onclick: function () { M.startRelink(e.id); } }, [S.icon('replace'), 'Changer la cible…']));
        actions.appendChild(S.h('button', { class: 'mm-btn mm-btn--small mm-btn--danger', onclick: function () { M.removeEdge(e); } }, [S.icon('trash'), 'Supprimer le lien']));
        M.els.panel.appendChild(actions);
      } else {
        M.els.panel.appendChild(S.h('p', { class: 'mm-note', text: 'Ce lien vient de la carte (personnes et lieux) : modifiez-le dans la carte.' }));
        if (a && a.rec) M.els.panel.appendChild(S.h('button', { class: 'mm-btn mm-btn--primary mm-open', onclick: function () { M.openCard(a.rec); } }, [S.icon('external-link'), 'Ouvrir la carte']));
      }
    };
    M.goalEditor = function goalEditor(n) {
      var input = S.h('input', { class: 'mm-input', type: 'text', value: n.label, maxlength: '120', 'aria-label': 'Nom' });
      function commit() { M.renameGoal(n.id, input.value); }
      input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); } });
      input.addEventListener('change', commit);
      var sure = M.state.confirmDelete === n.id;
      var kids = [
        S.h('label', { class: 'mm-field' }, [S.h('span', { text: 'Nom' }), input]),
        S.h('button', {
          class: 'mm-btn mm-btn--small' + (sure ? ' mm-btn--danger' : ''),
          onclick: function () {
            if (M.state.confirmDelete === n.id) return M.deleteGoal(n.id);
            M.state.confirmDelete = n.id;
            M.renderPanel();
          },
        }, [S.icon('trash'), sure ? 'Confirmer la suppression' : 'Supprimer']),
      ];
      var rank = S.MM().rankOf(n);
      var lowerLevels = S.MM().LEVELS.filter(function (l, i) { return i > rank; });
      if (lowerLevels.length) {
        kids.push(S.h('div', { class: 'mm-actions' }, lowerLevels.map(function (l) {
          return S.h('button', { class: 'mm-btn mm-btn--small', title: 'Créer ' + l.label.toLowerCase() + ' qui contribue à celui-ci', onclick: function () { M.openComposer(l.id, n.id); } }, [S.icon('plus'), l.label]);
        })));
      }
      return S.h('div', { class: 'mm-sec' }, kids);
    };
    M.refreshAfterEdit = function refreshAfterEdit() {
      return global.GanttTrello.loadBoard(M.t).then(function (board) {
        M.state.records = board.cards || [];
        M.state.lists = board.lists || M.state.lists || [];
        M.rebuild({ keepView: true });
      }).catch(function (err) { M.setStatus('Échec : ' + ((err && err.message) || 'erreur'), 'error'); });
    };
    M.runEdit = function runEdit(fn, entry) {
      M.setStatus('Enregistrement…');
      return Promise.resolve().then(fn).then(function () {
        if (entry) M.record(entry);
        M.setStatus('Enregistré', 'ok');
        return M.refreshAfterEdit();
      }, function (err) {
        M.setStatus('Échec : ' + ((err && err.message) || 'erreur'), 'error');
        return M.refreshAfterEdit();
      });
    };
    M.visibleDesc = function visibleDesc(rec) {
      var dm = global.DescMeta;
      return dm && typeof dm.splitDesc === 'function' ? dm.splitDesc(rec.desc || '').visible : String(rec.desc || '');
    };
    M.openFieldEditor = function openFieldEditor(rec, kind, anchor) {
      var CF = global.CardFields;
      var TT = global.TableTrello;
      if (!CF || !TT) return M.setStatus('Éditeur indisponible', 'error');
      CF.open(kind, {
        t: M.t,
        cardId: rec.id,
        cardName: rec.name,
        anchor: anchor,
        minutes: kind === 'estimate' ? rec.estimatedMinutes || 0 : undefined,
        value: kind === 'desc' ? M.visibleDesc(rec) : undefined,
        save: kind === 'desc' ? function (text) { return TT.saveDesc(M.t, { id: rec.id, fullDesc: rec.desc || '' }, text); } : undefined,
        onSaved: function () { M.setStatus('Enregistré', 'ok'); },
        onError: function (m) { M.setStatus(m, 'error'); },
        onClose: function (changed) { if (changed) M.refreshAfterEdit(); },
      });
    };
    M.openEntityPicker = function openEntityPicker(rec, kind, anchor, slot) {
      var CE = global.CardEntities;
      if (!CE) return M.setStatus('Éditeur indisponible', 'error');
      CE.open(kind, {
        t: M.t,
        rec: rec,
        anchor: anchor,
        slot: slot,
        onSaved: function () { M.setStatus('Enregistré', 'ok'); },
        onError: function (m) { M.setStatus(m, 'error'); },
        onClose: function (changed) { if (changed) M.refreshAfterEdit(); },
      });
    };
    M.progressEntry = function progressEntry(rec, from, to) {
      return { kind: 'progress', targetId: rec.id, title: rec.name, verb: 'progrès ' + from + ' % → ' + to + ' %', beforeVal: from, afterVal: to };
    };
    M.nameEntry = function nameEntry(rec, to) {
      return { kind: 'name', targetId: rec.id, title: rec.name, verb: 'renommée « ' + to + ' »', beforeVal: rec.name, afterVal: to };
    };
    M.statusEntry = function statusEntry(rec, toListId) {
      var list = (M.state.lists || []).filter(function (l) { return String(l.id) === String(toListId); })[0];
      return { kind: 'status', targetId: rec.id, title: rec.name, verb: 'déplacée' + (list ? ' vers « ' + list.name + ' »' : ''), beforeVal: rec.listId, afterVal: String(toListId) };
    };
    M.writeProgressTo = function writeProgressTo(cardId, pct) {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.getCardCompletionById !== 'function') return Promise.reject(new Error('Éditeur de progrès indisponible'));
      if (typeof CT.saveProgressTree === 'function') return CT.saveProgressTree(M.t, [{ id: cardId }], pct);
      return CT.getCardCompletionById(M.t, cardId).then(function (data) {
        data = CT.normalizeCompletionData(data || { items: [] });
        var next = data.items && data.items.length
          ? Object.assign({}, data, { items: CT.applyMasterProgress(data.items, pct) })
          : Object.assign({}, data, { progress: pct });
        return CT.saveCardCompletionById(M.t, cardId, CT.normalizeCompletionData(next));
      });
    };
    M.renderCardInfo = function renderCardInfo(rec) {
      var TT = global.TableTrello;
      var pct = typeof rec.progress === 'number' ? Math.max(0, Math.min(100, Math.round(rec.progress))) : 0;
      var visible = M.visibleDesc(rec);

      // title
      var title = S.h('textarea', { class: 'mm-card-title', rows: '1', 'aria-label': 'Titre de la carte', maxlength: '300' });
      title.value = rec.name || '';
      function fitTitle() { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; }
      title.addEventListener('input', fitTitle);
      title.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); title.blur(); } });
      title.addEventListener('change', function () {
        var v = title.value.trim();
        if (!v || v === rec.name) { title.value = rec.name || ''; return; }
        M.runEdit(function () { return TT.saveName(M.t, rec.id, v); }, M.nameEntry(rec, v));
      });

      // status (list)
      var lists = M.state.lists || [];
      var status = S.h('select', { class: 'mm-input', 'aria-label': 'Statut' }, lists.map(function (l) {
        var o = S.h('option', { value: String(l.id), text: l.name });
        if (String(l.id) === String(rec.listId)) o.selected = true;
        return o;
      }));
      status.addEventListener('change', function () {
        if (status.value === String(rec.listId)) return;
        M.runEdit(function () { return TT.moveCard(M.t, rec.id, status.value, 'bottom'); }, M.statusEntry(rec, status.value));
      });

      // progress: click or drag the bar to set the %, the detailed editor via the button
      var fill = S.h('div', { class: 'mm-card-fill', style: 'width:' + pct + '%' });
      var num = S.h('span', { class: 'mm-card-num', text: pct + ' %' });
      var ringEl = global.ProgressRing ? global.ProgressRing.create(pct) : null;
      var bar = S.h('div', { class: 'mm-card-bar mm-card-bar--edit', title: 'Cliquer ou glisser pour régler le progrès' }, [fill]);
      bar.addEventListener('pointerdown', function (ev) {
        if (ev.button !== 0) return;
        ev.preventDefault();
        var val = pct;
        function at(x) { var r = bar.getBoundingClientRect(); return r.width ? Math.max(0, Math.min(100, Math.round((x - r.left) / r.width * 100))) : val; }
        function move(e) { val = at(e.clientX); fill.style.width = val + '%'; num.textContent = val + ' %'; if (ringEl) global.ProgressRing.set(ringEl, val); }
        function up() {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.removeEventListener('pointercancel', up);
          if (val !== pct) M.runEdit(function () { return M.writeProgressTo(rec.id, val); }, M.progressEntry(rec, pct, val));
        }
        move(ev);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
      });
      var detail = S.h('button', { class: 'mm-x', title: 'Progrès détaillé (sous-tâches)', 'aria-label': 'Progrès détaillé', onclick: function (ev) { M.openFieldEditor(rec, 'progress', ev.currentTarget); } }, [S.icon('adjustments')]);

      function fieldBtn(kind, ic, text, extra) {
        return S.h('button', { class: 'mm-btn mm-btn--small' + (extra || ''), onclick: function (ev) { M.openFieldEditor(rec, kind, ev.currentTarget); } }, [S.icon(ic), text]);
      }
      var TMod = global.TableModel;
      var urgency = rec.priorityEnabled !== false && rec.priorityLabel
        ? rec.priorityLabel + (typeof rec.priorityScore === 'number' ? ' · ' + (TMod && TMod.formatPriority ? TMod.formatPriority(rec.priorityScore) : Number(rec.priorityScore).toFixed(1)) : '')
        : 'Priorité…';
      var due = rec.dueDate ? 'Échéance ' + (TMod && TMod.formatDay ? TMod.formatDay(rec.dueDate) : rec.dueDate) : 'Échéance…';

      var CF = global.CardFields;
      var est = rec.estimatedMinutes > 0 && CF && CF.formatMinutes ? CF.formatMinutes(rec.estimatedMinutes) : '';

      /** One property row: its chips (or a quiet "Cliquer pour ajouter…"), the whole row opens the picker. */
      function entityRow(label, kind, chips, slot) {
        var open = S.h('button', {
          class: 'mm-ent',
          type: 'button',
          title: label,
          onclick: function (ev) { M.openEntityPicker(rec, kind, ev.currentTarget, slot); },
        }, chips.length ? chips : [S.h('span', { class: 'mm-empty', text: 'Cliquer pour ajouter…' })]);
        return S.h('div', { class: 'mm-field' }, [S.h('span', { text: label }), open]);
      }
      var CE = global.CardEntities;
      var peopleChips = (rec.assignees || []).map(function (a) {
        return S.h('span', { class: 'mm-chip', title: a.custom ? a.name + ' (hors Trello)' : a.name }, [S.icon('user'), a.name]);
      });
      var placeChips = (CE ? CE.placeChips(rec.inputs && rec.inputs.places) : []).map(function (p) {
        return S.h('span', { class: 'mm-chip', title: p.label }, [S.icon('map-pin'), (p.slot === 'at' ? '' : p.label + ' ') + p.name]);
      });
      var labelChips = (rec.labels || []).map(function (l) {
        var dot = CE && CE.COLORS[l.color] ? S.h('span', { class: 'mm-dot', style: 'background:' + CE.COLORS[l.color] }) : null;
        return S.h('span', { class: 'mm-chip' }, [dot, l.name || l.color || '·']);
      });

      var descBody = visible.trim()
        ? S.h('div', { class: 'mm-card-desc', text: visible, title: 'Cliquer pour modifier', onclick: function (ev) { if (!String(global.getSelection()).length) M.openFieldEditor(rec, 'desc', ev.currentTarget); } })
        : S.h('button', { class: 'mm-btn mm-btn--small', onclick: function (ev) { M.openFieldEditor(rec, 'desc', ev.currentTarget); } }, [S.icon('plus'), 'Ajouter une description']);

      M.els.panel.appendChild(S.h('div', { class: 'mm-card' }, [
        title,
        S.h('label', { class: 'mm-field' }, [S.h('span', { text: 'Statut (colonne Trello)' }), status]),
        S.h('div', { class: 'mm-field' }, [S.h('span', { text: 'Avancement' }), S.h('div', { class: 'mm-card-progress' }, [ringEl, bar, num, detail])]),
        S.h('div', { class: 'mm-field' }, [S.h('span', { text: 'Priorité, échéance, blocage' })]),
        S.h('div', { class: 'mm-actions' }, [
          fieldBtn('priority', 'flag', urgency),
          fieldBtn('due', 'calendar-event', due),
          fieldBtn('estimate', 'clock', est || 'Estimer…'),
          fieldBtn('blocked', 'ban', rec.blocked ? 'Bloqué' : 'Bloquer…', rec.blocked ? ' mm-btn--danger' : ''),
        ]),
        entityRow('Personnes', 'people', peopleChips),
        entityRow('Lieux', 'places', placeChips),
        entityRow('Étiquettes', 'labels', labelChips),
        S.h('h4', { class: 'mm-card-h', text: 'Description' }),
        descBody,
      ]));
      M.els.panel.appendChild(S.h('button', { class: 'mm-btn mm-btn--primary mm-open', onclick: function () { M.openCard(rec); } }, [S.icon('external-link'), 'Ouvrir la carte']));
      setTimeout(fitTitle, 0);
    };
    M.contextBlock = function contextBlock(n) {
      if (n.kind !== 'task' && n.kind !== 'goal') return null;
      var chain = S.MM().ancestors(M.state.graph.edges, n.id).reverse().map(M.nodeById).filter(Boolean);
      var flags = n.kind === 'task' && n.rec && S.MM().isClosed(n.rec) ? [] : S.MM().contextFlags(M.state.graph, n.id); // nothing is missing on a finished task
      if (!chain.length && !flags.length) return null;
      var crumbs = [];
      chain.forEach(function (a) {
        if (crumbs.length) crumbs.push(S.h('span', { class: 'mm-crumb-sep', text: '/' }));
        crumbs.push(S.h('button', {
          class: 'mm-crumb',
          title: M.kindLabel(a),
          onclick: function () { M.select(a.id); },
        }, [S.h('span', { class: 'mm-crumb-kind', text: M.kindLabel(a) }), a.label]));
      });
      return S.h('div', { class: 'mm-sec mm-context' }, [
        crumbs.length ? S.h('div', { class: 'mm-crumbs', 'aria-label': 'Contexte' }, crumbs) : null,
        flags.length ? S.h('div', { class: 'mm-panel-meta' }, flags.map(function (fl) {
          return S.h('span', { class: 'mm-chip mm-chip--warn', text: fl.label });
        })) : null,
      ]);
    };
    M.phraseSections = function phraseSections(n, kinds, dir) {
      var order = { doing: 0, will: 1, done: 2, canceled: 3 };
      var buckets = [];
      var index = Object.create(null);
      M.state.graph.edges.forEach(function (e) {
        if (kinds.indexOf(e.kind) < 0) return;
        if (dir === 'out' && e.from !== n.id) return;
        if (dir === 'in' && e.to !== n.id) return;
        if (e.from !== n.id && e.to !== n.id) return;
        var ph = S.MM().relationPhrase(e, n.id, M.nodeById);
        if (!index[ph.verb]) {
          index[ph.verb] = { verb: ph.verb, phase: ph.phase || '', rows: [] };
          buckets.push(index[ph.verb]);
        }
        var other = M.nodeById(e.from === n.id ? e.to : e.from);
        if (other) index[ph.verb].rows.push(M.linkRow('', other));
      });
      buckets.sort(function (a, b) {
        var oa = order[a.phase] != null ? order[a.phase] : 9;
        var ob = order[b.phase] != null ? order[b.phase] : 9;
        return oa - ob;
      });
      return buckets.map(function (b) { return M.section(b.verb, b.rows); });
    };
    M.renderPanel = function renderPanel() {
      M.els.panel.textContent = '';
      var edge = M.state.selectedEdge && M.edgeById(M.state.selectedEdge);
      if (edge) return M.renderEdgePanel(edge);
      var n = M.state.selected && M.nodeById(M.state.selected);
      if (!n) { M.els.panel.hidden = true; return; }
      M.els.panel.hidden = false;
      var edges = M.state.graph.edges;
      var head = S.h('div', { class: 'mm-panel-head' }, [
        S.h('div', { class: 'mm-panel-kind', text: M.kindLabel(n) }),
        n.kind === 'goal' ? null : S.h('h3', { text: n.label }),
        S.h('button', { class: 'mm-x mm-panel-close', 'aria-label': 'Fermer', onclick: function () { M.select(null); } }, [S.icon('x')]),
      ]);
      M.els.panel.appendChild(head);
      var context = M.contextBlock(n);
      if (context) M.els.panel.appendChild(context);
      var rec = n.kind === 'task' ? n.rec : null;
      if (rec) {
        var tab = M.state.panelTab === 'props' ? 'props' : 'info';
        M.els.panel.appendChild(S.h('div', { class: 'mm-tabs', role: 'tablist' }, [['info', 'Information'], ['props', 'Propriétés']].map(function (d) {
          return S.h('button', {
            class: 'mm-tab' + (tab === d[0] ? ' is-active' : ''),
            role: 'tab',
            'aria-selected': tab === d[0] ? 'true' : 'false',
            text: d[1],
            onclick: function () { M.state.panelTab = d[0]; M.renderPanel(); },
          });
        })));
        if (tab === 'info') return M.renderCardInfo(rec);
      }
      if (rec) {
        M.els.panel.appendChild(S.h('div', { class: 'mm-panel-meta' }, [
          rec.listName ? S.h('span', { class: 'mm-chip', text: rec.listName }) : null,
          typeof rec.progress === 'number' ? S.h('span', { class: 'mm-chip', text: Math.round(rec.progress) + ' %' }) : null,
          rec.dueDate ? S.h('span', { class: 'mm-chip', text: 'Échéance ' + rec.dueDate }) : null,
          M.state.cycles[n.id] ? S.h('span', { class: 'mm-chip mm-chip--warn', text: 'Boucle de dépendances' }) : null,
        ]));
      }
      function pick(kind, dir, fn) {
        return edges.filter(function (e) {
          return e.kind === kind && (dir === 'out' ? e.from === n.id : e.to === n.id);
        }).map(fn);
      }
      var sections = [];
      function servesUp(extraBtn) {
        return M.section('Contribue à', pick('serves', 'out', function (e) {
          return M.linkRow('', M.nodeById(e.to), function () { M.toggleServes(e.from, e.to); });
        }), extraBtn);
      }
      function servesDown() {
        return M.section('Reçoit', pick('serves', 'in', function (e) {
          return M.linkRow('', M.nodeById(e.from), function () { M.toggleServes(e.from, e.to); });
        }));
      }
      if (n.kind === 'goal') {
        sections.push(M.goalEditor(n));
        sections.push(servesUp(S.h('button', { class: 'mm-btn mm-btn--small', onclick: function () { M.startLink(n.id); } }, [S.icon('link'), 'Relier…'])));
        sections.push(servesDown());
      } else if (n.kind === 'task') {
        sections.push(servesUp(S.h('button', { class: 'mm-btn mm-btn--small', onclick: function () { M.startLink(n.id); } }, [S.icon('link'), 'Contribue à…'])));
        sections.push(M.section('Dépend de', pick('depends', 'out', function (e) {
          var dep = M.nodeById(e.to);
          return M.linkRow('', dep, function () { M.toggleDependency(n.id.slice(2), dep.id.slice(2)); });
        }), S.h('button', { class: 'mm-btn mm-btn--small', onclick: function () { M.startLink(n.id); } }, [S.icon('link'), 'Dépend de…'])));
        M.phraseSections(n, ['depends'], 'in').forEach(function (sec) { sections.push(sec); });
        M.phraseSections(n, ['by'], 'out').forEach(function (sec) { sections.push(sec); });
        M.phraseSections(n, ['at', 'from', 'via', 'to'], 'out').forEach(function (sec) { sections.push(sec); });
      } else if (n.kind === 'subtask') {
        sections.push(M.section('Sous-tâche de', edges.filter(function (e) { return e.kind === 'sub' && e.to === n.id; }).map(function (e) { return M.linkRow('', M.nodeById(e.from)); })));
        if (typeof n.progress === 'number') M.els.panel.appendChild(S.h('div', { class: 'mm-chips' }, [S.h('span', { class: 'mm-chip', text: Math.round(n.progress) + ' %' })]));
      } else if (n.kind === 'person') {
        M.phraseSections(n, ['by'], 'in').forEach(function (sec) { sections.push(sec); });
      } else {
        M.phraseSections(n, ['at', 'from', 'via', 'to'], 'in').forEach(function (sec) { sections.push(sec); });
      }
      sections.forEach(function (sec) { if (sec) M.els.panel.appendChild(sec); });
      if (rec) {
        M.els.panel.appendChild(S.h('button', { class: 'mm-btn mm-btn--primary mm-open', onclick: function () { M.openCard(rec); } }, [S.icon('external-link'), 'Ouvrir la carte']));
      }
    };
    M.manualKey = function manualKey() { return 'tp-mindmap-groups:' + (M.state.boardId || 'local'); };
    M.loadManual = function loadManual() {
      try { return S.MM().normalizeManual(JSON.parse(localStorage.getItem(M.manualKey()) || '[]')); }
      catch (e) { return []; }
    };
    M.saveManual = function saveManual() {
      try { localStorage.setItem(M.manualKey(), JSON.stringify(M.state.manual)); } catch (e) { /* ignore */ }
    };
    M.saveLens = function saveLens() {
      try {
        localStorage.setItem('tp-mindmap-lens', M.state.lens);
        localStorage.setItem('tp-mindmap-groups-on', M.state.groupsOn ? '1' : '0');
      } catch (e) { /* ignore */ }
    };
    M.editsSig = function editsSig() {
      return Object.keys(M.state.groupEdits || {}).sort().map(function (id) {
        var e = M.state.groupEdits[id] || {};
        return id + ':' + (e.name || '') + '/' + (e.extra || []).join(',') + '/' + (e.omit || []).join(',');
      }).join(';');
    };
    M.lodSignature = function lodSignature() {
      var force = M.state.groupForce || {};
      var fk = Object.keys(force).sort().map(function (id) { return id + '=' + force[id]; }).join(',');
      return [M.groupsShown() ? 1 : 0, M.state.lens, S.MM().zoomBand(M.state.view.k), M.state.selected || '', fk, M.state.manual.length, M.editsSig(), M.state.graph.nodes.length, M.state.graph.edges.length].join('|');
    };
    },
    run: function (M) {
    M.HP = null;
    if (global.HistoryPanel) {
      M.histBoard = '';
      try { M.histBoard = (M.t && typeof M.t.getContext === 'function' && M.t.getContext().board) || ''; } catch (ctxErr) { /* no context */ }
      M.HP = global.HistoryPanel.create({
        key: 'tp-mindmap-history' + (M.histBoard ? ':' + M.histBoard : ''),
        max: 60,
        apply: M.applyEntry,
        verb: function (e) { return e.verb || 'modifié'; },
        after: function (e) { return e.kind === 'goals' ? Promise.resolve(M.rebuild({ keepView: true })) : M.refreshAfterEdit(); },
        onStatus: function (m, kind, openHistory) { M.setStatus(m, kind === 'busy' ? '' : kind, openHistory); },
        onError: function (err) { M.setStatus('Échec : ' + M.reasonText(err), 'error'); },
      });
    }
    M.FACET_HUE = { progress: 150, priority: 25, status: 210, blocked: 0, due: 265 };
    M.lensMenuEl = null;
    }
  });
})(typeof window !== 'undefined' ? window : this);
