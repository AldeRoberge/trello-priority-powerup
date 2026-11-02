/**
 * journey-ui: mount() part 2 of 2.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see journey-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.JourneyUiParts = global.JourneyUiParts || {});
  var P = (global.JourneyUiPartsMountMount = global.JourneyUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.editLinks = async function editLinks(label, changes) {
      if (M.state.busy || !changes.length) return;
      var pt = S.PT();
      var gg = S.GG();
      var graph = S.JM().prepare(M.state.board.cards, M.state.board.goals);
      var cardPrev = Object.create(null);
      var cardNext = Object.create(null);
      var goalsPrev = M.state.board.goals || { nodes: [], links: [] };
      var goalsNext = null;
      changes.forEach(function (c) {
        if (c.kind === 'depends') {
          var rec = M.recOf(c.from);
          if (!rec) return;
          if (!cardNext[c.from]) {
            var inputs = rec.inputs || {};
            cardPrev[c.from] = { dependsOn: (inputs.dependsOn || []).slice(), depTypes: Object.assign({}, inputs.depTypes) };
            cardNext[c.from] = { dependsOn: cardPrev[c.from].dependsOn.slice(), depTypes: Object.assign({}, inputs.depTypes) };
          }
          var next = cardNext[c.from];
          var at = next.dependsOn.indexOf(c.to);
          if (c.op === 'add' && at < 0) next.dependsOn.push(c.to);
          if (c.op === 'drop' && at >= 0) { next.dependsOn.splice(at, 1); delete next.depTypes[c.to]; }
        } else {
          if (!goalsNext) goalsNext = { nodes: (goalsPrev.nodes || []).slice(), links: (goalsPrev.links || []).slice() };
          goalsNext.links = goalsNext.links.filter(function (l) { return !(M.sameRef(l.from, c.from) && M.sameRef(l.to, c.to)); });
          if (c.op === 'add') goalsNext.links.push({ from: M.refFor(graph, c.from), to: c.to });
        }
      });
      var touched = Object.keys(cardNext);
      if (!touched.length && !goalsNext) return;
      M.state.busy = true;
      try {
        if (!(await M.authorize())) { M.toast('Autorisation requise'); M.state.busy = false; return; }
        if (touched.length && (!pt || typeof pt.saveCardInputsById !== 'function')) throw new Error('save');
        if (goalsNext && (!gg || typeof gg.save !== 'function')) throw new Error('save');
        for (var i = 0; i < touched.length; i++) await pt.saveCardInputsById(M.t, touched[i], cardNext[touched[i]]);
        if (goalsNext) await gg.save(M.t, goalsNext);
        M.remember(label, async function () {
          for (var j = 0; j < touched.length; j++) await pt.saveCardInputsById(M.t, touched[j], cardPrev[touched[j]]);
          if (goalsNext) await gg.save(M.t, goalsPrev);
        });
        M.toast(label);
        await M.reload();
      } catch (e) {
        M.toast('Pas enregistré');
      }
      M.state.busy = false;
    };
    M.linkFromPin = function linkFromPin(graph, n, side, targetId) {
      var a = graph.byId[n.id];
      var b = graph.byId[targetId];
      if (!a || !b) { M.toast('Choisissez une autre boîte'); return; }
      var change;
      if (a.kind === 'task' && b.kind === 'task') {
        var needsThis = side === 'right' || side === 'bottom';
        change = { op: 'add', kind: 'depends', from: needsThis ? targetId : n.id, to: needsThis ? n.id : targetId };
      } else {
        var ra = S.JM().rankOfNode(a);
        var rb = S.JM().rankOfNode(b);
        if (ra === rb || ra < 0 || rb < 0) { M.toast('Choisissez un niveau différent'); return; }
        change = { op: 'add', kind: 'serves', from: ra > rb ? n.id : targetId, to: ra > rb ? targetId : n.id };
      }
      var exists = graph.edges.some(function (e) { return e.kind === change.kind && e.from === change.from && e.to === change.to; });
      if (exists) { M.toast('Ce lien existe déjà'); return; }
      var problem = M.linkProblem(graph, change.kind, change.from, change.to, null);
      if (problem) { M.toast(problem); return; }
      M.editLinks('Lien ajouté', [change]);
    };
    M.moveEnd = function moveEnd(graph, e, end, id) {
      var from = end === 'from' ? id : e.from;
      var to = end === 'to' ? id : e.to;
      if (from === e.from && to === e.to) return;
      var exists = graph.edges.some(function (x) { return x.kind === e.kind && x.from === from && x.to === to; });
      if (exists) { M.toast('Ce lien existe déjà'); return; }
      var problem = M.linkProblem(graph, e.kind, from, to, e.id);
      if (problem) { M.toast(problem); return; }
      M.state.selectedEdge = null;
      M.editLinks('Lien déplacé', [{ op: 'drop', kind: e.kind, from: e.from, to: e.to }, { op: 'add', kind: e.kind, from: from, to: to }]);
    };
    M.removeSelectedEdge = function removeSelectedEdge() {
      var id = M.state.selectedEdge;
      if (!id) return;
      var graph = S.JM().prepare(M.state.board.cards, M.state.board.goals);
      var e = null;
      graph.edges.forEach(function (x) { if (x.id === id) e = x; });
      M.state.selectedEdge = null;
      if (!e) { M.toast('Ce lien se règle dans la carte'); M.paint(); return; }
      if (e.kind === 'sub') { M.toast('Ce lien vient de la liste de la carte'); M.paint(); return; }
      M.editLinks('Lien retiré', [{ op: 'drop', kind: e.kind, from: e.from, to: e.to }]);
    };
    M.statusIcon = function statusIcon(id, stateName, here) {
      var closed = stateName === 'done';
      var btn = S.el('button', 'jy-node-ico jy-ico-btn gc-nodrag');
      btn.type = 'button';
      btn.appendChild(S.icon(S.taskIcon(stateName, here)));
      if (stateName === 'waiting') {
        btn.disabled = true;
        btn.title = 'En attente d’une autre tâche';
        return btn;
      }
      btn.title = closed ? 'Terminée — cliquer pour rouvrir' : 'Terminer';
      btn.setAttribute('aria-label', closed ? 'Rouvrir' : 'Terminer');
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (closed) M.reopen(id);
        else M.complete(id);
      });
      return btn;
    };
    M.nodeEl = function nodeEl(n) {
      if (n.kind === 'check') return M.checkEl(n);
      if (n.kind === 'add') return M.addEl(n);
      var node = S.el('div', 'jy-node is-' + (n.state || 'ready') + (n.here ? ' is-here' : '') + (n.id === M.state.selected ? ' is-on' : '') + (n.kind !== 'task' ? ' is-goal' : ''));
      node.style.left = n.x + 'px';
      node.style.top = n.y + 'px';
      node.style.width = n.w + 'px';
      node.style.height = n.h + 'px';
      node.dataset.id = n.id;
      if (n.kind === 'task') node.setAttribute('data-iso-card', n.id);
      else if (n.level === 'project') {
        node.setAttribute('data-iso-project', n.id);
        node.setAttribute('data-iso-label', n.name || '');
      }
      node.setAttribute('role', 'button');
      node.tabIndex = 0;
      var top = S.el('div', 'jy-node-top');
      if (n.kind === 'task') {
        top.appendChild(M.statusIcon(n.id, n.state, n.here));
      } else if (n.level === 'project' && n.kind !== 'bucket' && global.ProjectIcon) {
        var projBtn = global.ProjectIcon.button({
          t: M.t,
          id: n.id,
          icon: n.icon,
          className: 'ip-glyph jy-node-ico',
          goals: function () { return M.state.board && M.state.board.goals; },
          onSaved: function (saved) {
            if (saved && M.state.board) M.state.board.goals = saved;
            M.paint();
          },
        });
        if (projBtn) top.appendChild(projBtn);
        else top.appendChild(S.el('span', 'jy-node-ico')).appendChild(S.icon(S.levelIcon(n.level)));
      } else {
        var icoName = n.kind === 'bucket' ? 'inbox' : S.levelIcon(n.level);
        top.appendChild(S.el('span', 'jy-node-ico')).appendChild(S.icon(icoName));
      }
      top.appendChild(S.el('span', 'jy-node-name', n.name));
      node.appendChild(top);
      var meta = n.kind === 'task' ? M.taskMeta(n) : S.countLabel(n.counts);
      var metaEl = S.el('div', 'jy-node-meta' + (meta ? '' : ' is-empty') + (n.rec && n.rec.duePast ? ' is-overdue' : ''), meta || '');
      node.appendChild(metaEl);
      if (n.kind === 'task') {
        node.appendChild(M.progressRow(n));
        var blocked = !!(n.rec && n.rec.blocked);
        node.appendChild(M.pauseButton(blocked, 'Bloquée', function () { M.toggleBlock(n.id); }));
      }
      if (n.kind === 'goal' && global.NewCard) {
        var plus = S.el('button', 'jy-plus');
        plus.type = 'button';
        plus.title = 'Nouvelle tâche';
        plus.appendChild(S.icon('plus'));
        plus.addEventListener('click', function (e) {
          e.stopPropagation();
          M.createUnder(n);
        });
        node.appendChild(plus);
      }
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); M.selectNode(n.id, n.kind === 'task' ? 'task' : 'project'); }
      });
      node.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        M.menuFor(n.id, node, e);
      });
      return node;
    };
    M.progressRow = function progressRow(n) {
      var rec = n.rec || {};
      var pct = n.state === 'done' ? 100 : M.clampPct(rec.progress);
      var row = S.el('div', 'jy-node-prog' + (pct >= 100 ? ' is-done' : '') + (rec.blocked ? ' is-blocked' : ''));
      var bar = S.el('span', 'jy-prog-bar gc-nodrag');
      bar.title = 'Cliquer ou glisser pour régler le progrès';
      var fill = S.el('i');
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      var num = S.el('span', 'jy-prog-num', pct + '%');
      row.appendChild(bar);
      row.appendChild(num);
      bar.addEventListener('pointerdown', function (ev) {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        var next = pct;
        function at(x) {
          var r = bar.getBoundingClientRect();
          return r.width ? M.clampPct(((x - r.left) / r.width) * 100) : next;
        }
        function move(e) {
          next = at(e.clientX);
          fill.style.width = next + '%';
          num.textContent = next + '%';
          row.classList.toggle('is-done', next >= 100);
        }
        function up() {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.removeEventListener('pointercancel', up);
          row.classList.remove('is-dragging');
          if (next !== pct) M.setProgress(n.id, next, pct);
        }
        row.classList.add('is-dragging');
        move(ev);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
      });
      return row;
    };
    M.clampPct = function clampPct(v) {
      v = Number(v);
      return isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
    };
    M.pauseButton = function pauseButton(blocked, label, onToggle, disabled) {
      var b = S.el('button', 'jy-pause gc-nodrag' + (blocked ? ' is-on' : ''));
      b.type = 'button';
      b.title = blocked ? label + ' — cliquer pour débloquer' : 'Bloquer';
      b.setAttribute('aria-label', b.title);
      b.setAttribute('aria-pressed', blocked ? 'true' : 'false');
      b.appendChild(S.icon('player-pause'));
      if (disabled) b.disabled = true;
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        onToggle();
      });
      return b;
    };
    M.editName = function editName(node, n) {
      if (node.querySelector('.jy-name-edit')) return;
      var nameEl = node.querySelector('.jy-node-name');
      if (!nameEl) return;
      var input = S.el('textarea', 'jy-name-edit gc-nodrag');
      input.rows = 1;
      input.maxLength = 300;
      input.setAttribute('aria-label', 'Titre');
      input.value = n.name || '';
      function fit() {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
      }
      var finished = false;
      function finish(save) {
        if (finished) return;
        finished = true;
        var v = input.value.replace(/\s+/g, ' ').trim();
        if (save && v && v !== n.name) {
          if (n.kind === 'task') M.rename(n.id, v);
          else if (n.kind === 'check') M.renameSub(n, v);
          else M.renameGoal(n.id, v);
          return;
        }
        if (input.parentNode) input.replaceWith(nameEl);
      }
      input.addEventListener('input', fit);
      input.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', function () { finish(true); });
      ['pointerdown', 'dblclick', 'wheel', 'click'].forEach(function (type) {
        input.addEventListener(type, function (ev) { ev.stopPropagation(); });
      });
      nameEl.replaceWith(input);
      fit();
      input.focus();
      input.select();
    };
    M.checkEl = function checkEl(n) {
      var done = n.state === 'done';
      var blocked = n.state === 'blocked';
      var node = S.el('div', 'jy-node is-check is-' + (done ? 'done' : (blocked ? 'blocked' : 'open')));
      node.style.left = n.x + 'px';
      node.style.top = n.y + 'px';
      node.style.width = n.w + 'px';
      node.style.height = n.h + 'px';
      node.dataset.id = n.id;
      if (n.parent && n.itemId) {
        node.setAttribute('data-iso-sub', 'sub:' + n.parent + ':' + n.itemId);
        node.setAttribute('data-iso-label', n.name || '');
      }
      var top = S.el('div', 'jy-node-top');
      var ring = S.el('button', 'jy-node-ico jy-ico-btn gc-nodrag');
      ring.type = 'button';
      ring.title = done ? 'Faite — cliquer pour rouvrir' : 'Terminer';
      ring.setAttribute('aria-label', done ? 'Rouvrir la sous-tâche' : 'Terminer la sous-tâche');
      ring.setAttribute('aria-pressed', done ? 'true' : 'false');
      ring.appendChild(S.icon(done ? 'circle-check' : 'circle'));
      ring.addEventListener('click', function (ev) {
        ev.stopPropagation();
        M.toggleSub(n);
      });
      top.appendChild(ring);
      top.appendChild(S.el('span', 'jy-node-name', n.name));
      node.appendChild(top);
      if (n.meta) node.appendChild(S.el('div', 'jy-node-meta' + (n.overdue ? ' is-overdue' : ''), n.meta));
      node.appendChild(M.pauseButton(blocked, 'Bloquée', function () { M.blockSub(n); }, done));
      node.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        M.subMenuFor(n, node, e);
      });
      return node;
    };
    M.addEl = function addEl(n) {
      var node = S.el(n.draft ? 'div' : 'button', 'jy-node is-check is-add gc-nodrag' + (n.draft ? ' is-draft' : ''));
      node.style.left = n.x + 'px';
      node.style.top = n.y + 'px';
      node.style.width = n.w + 'px';
      node.style.height = n.h + 'px';
      node.dataset.id = n.id;
      if (!n.draft) {
        node.type = 'button';
        node.title = 'Nouvelle sous-tâche';
        node.setAttribute('aria-label', 'Nouvelle sous-tâche');
        node.appendChild(S.icon('plus'));
        node.addEventListener('click', function (ev) {
          ev.stopPropagation();
          M.startAdding(n.parent);
        });
        return node;
      }
      var input = S.el('input', 'jy-add-input');
      input.type = 'text';
      input.maxLength = 300;
      input.placeholder = 'Nouvelle sous-tâche…';
      input.setAttribute('aria-label', 'Nouvelle sous-tâche');
      input.value = M.state.draftText || '';
      var finished = false;
      /** Closes the field in place (no repaint: this may be a click on something else that must still land). */
      function close() {
        if (finished) return;
        finished = true;
        M.state.adding = null;
        M.state.draftText = '';
        var shown = M.container.querySelector('.jy-node[data-id="' + n.id + '"]');
        if (shown && shown.parentNode) {
          var pill = M.addEl(Object.assign({}, n, { draft: false, w: 24, h: 24 }));
          shown.parentNode.replaceChild(pill, shown);
          if (M.live && M.live.byPos[n.id]) { M.live.byPos[n.id].w = 24; M.live.byPos[n.id].h = 24; M.live.byPos[n.id].draft = false; }
        }
      }
      async function submit(keepOpen) {
        var text = input.value.replace(/\s+/g, ' ').trim();
        if (!text) { if (!keepOpen) close(); return; }
        if (M.state.busy) return;
        if (!keepOpen) { finished = true; M.state.adding = null; }
        M.state.draftText = '';
        input.readOnly = true;
        var out = await M.addSub(n.parent, text);
        if (!out) { // not saved: the field comes back with what was typed
          M.state.adding = n.parent;
          M.state.draftText = text;
          M.paint();
        }
      }
      input.addEventListener('input', function () { M.state.draftText = input.value; });
      input.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); submit(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      });
      input.addEventListener('blur', function () {
        if (M.blurGuard || finished || !input.isConnected) return;
        submit(false);
      });
      ['pointerdown', 'dblclick', 'wheel', 'click'].forEach(function (type) {
        input.addEventListener(type, function (ev) { ev.stopPropagation(); });
      });
      node.appendChild(input);
      return node;
    };
    M.taskMeta = function taskMeta(n) {
      var rec = n.rec || {};
      var bits = [];
      var due = rec.dueDate || rec.due;
      if (due) bits.push(S.shortDay(due));
      if (rec.estimatedMinutes) bits.push(S.JM().formatMinutes(rec.estimatedMinutes));
      var names = (rec.assignees || []).map(function (a) { return a && a.name; }).filter(Boolean);
      if (names.length === 1) bits.push(names[0]);
      else if (names.length > 1) bits.push(names.length + ' personnes');
      return bits.join(' · ');
    };
    M.detail = function detail(graph, full) {
      var box = S.el('div', 'jy-detail');
      var id = M.state.selected || (full.now[0] && full.now[0].id);
      var node = id && graph.byId[id];
      if (!node) {
        box.appendChild(S.el('div', 'jy-detail-meta', M.state.board.cards.length ? '' : 'Aucune tâche'));
        return box;
      }
      box.appendChild(S.el('div', 'jy-detail-name', node.name));
      var item = null;
      full.now.concat(full.blocked).forEach(function (a) { if (a.id === id) item = a; });
      var meta = [];
      if (node.kind !== 'task') meta.push(S.countLabel(S.JM().summarize(graph, id)) || node.level || '');
      if (node.kind === 'task' && S.JM().isClosed(node.rec || {})) meta.push('Faite');
      if (item && item.projectName) meta.push(item.projectName);
      if (item && item.missionName && item.missionName !== item.projectName) meta.push(item.missionName);
      if (item && item.reasons.length) meta.push(item.reasons.join(' · '));
      if (item && item.also && item.also.length) meta.push('Aussi ' + item.also.map(function (a) { return a.name; }).join(', '));
      var metaEl = S.el('div', 'jy-detail-meta', meta.filter(Boolean).join(' · '));
      box.appendChild(metaEl);

      if (node.kind === 'task') {
        var links = S.JM().linksOf(graph, id);
        if (links.prereqs.length) {
          var pre = S.el('div', 'jy-detail-meta', '');
          pre.appendChild(document.createTextNode('Avant · '));
          links.prereqs.forEach(function (p, i) {
            if (i) pre.appendChild(document.createTextNode(', '));
            var b = S.el('button', 'jy-link', p.name);
            b.type = 'button';
            b.addEventListener('click', function () { M.selectNode(p.id, 'task'); });
            pre.appendChild(b);
          });
          box.appendChild(pre);
        }
        var opens = links.next.filter(function (n) { return n.dep === 'needs' || n.dep == null; });
        if (opens.length) {
          var nxt = S.el('div', 'jy-detail-meta');
          nxt.appendChild(document.createTextNode('Débloque · '));
          opens.forEach(function (p, i) {
            if (i) nxt.appendChild(document.createTextNode(', '));
            var b = S.el('button', 'jy-link', p.name);
            b.type = 'button';
            b.addEventListener('click', function () { M.selectNode(p.id, 'task'); });
            nxt.appendChild(b);
          });
          box.appendChild(nxt);
        }
        var row = S.el('div', 'jy-detail-row');
        var openBtn = S.el('button', 'jy-btn is-primary', 'Ouvrir');
        openBtn.type = 'button';
        openBtn.addEventListener('click', function () { M.openCard(id); });
        row.appendChild(openBtn);
        if (!S.JM().isClosed(node.rec || {})) {
          var doneBtn = S.el('button', 'jy-btn', 'Terminer');
          doneBtn.type = 'button';
          doneBtn.addEventListener('click', function () { M.complete(id); });
          row.appendChild(doneBtn);
          var subBtn = S.el('button', 'jy-btn', 'Sous-tâche');
          subBtn.type = 'button';
          subBtn.insertBefore(S.icon('plus'), subBtn.firstChild);
          subBtn.addEventListener('click', function () { M.startAdding(id); });
          row.appendChild(subBtn);
        } else {
          var reopenBtn = S.el('button', 'jy-btn', 'Rouvrir');
          reopenBtn.type = 'button';
          reopenBtn.addEventListener('click', function () { M.reopen(id); });
          row.appendChild(reopenBtn);
        }
        var blockBtn = S.el('button', 'jy-btn', (node.rec && node.rec.blocked) ? 'Débloquer' : 'Bloquer');
        blockBtn.type = 'button';
        blockBtn.addEventListener('click', function () { M.toggleBlock(id); });
        row.appendChild(blockBtn);
        box.appendChild(row);
      }
      return box;
    };
    M.queue = function queue(full, here) {
      var aside = S.el('div', 'jy-queue');
      var scroll = S.el('div', 'jy-queue-scroll');
      scroll.appendChild(S.el('h2', '', 'Maintenant'));
      if (!full.now.length) scroll.appendChild(S.el('div', 'jy-empty', 'Rien pour l’instant'));
      full.now.slice(0, 5).forEach(function (a) { scroll.appendChild(M.rowEl(a, here)); });
      if (full.blocked.length) {
        scroll.appendChild(S.el('h2', '', 'Bloquées'));
        full.blocked.slice(0, 3).forEach(function (a) { scroll.appendChild(M.rowEl(a, here)); });
      }
      aside.appendChild(scroll);
      return aside;
    };
    M.rowEl = function rowEl(a, here) {
      var row = S.el('div', 'jy-row is-' + a.state + (a.id === here ? ' is-here' : '') + (a.id === M.state.selected ? ' is-on' : '') + (a.dueState === 'overdue' ? ' is-overdue' : ''));
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      var ico = S.el('button', 'jy-row-ico jy-ico-btn');
      ico.type = 'button';
      ico.appendChild(S.icon(S.taskIcon(a.state, a.id === here)));
      if (a.state === 'waiting') {
        ico.disabled = true;
        ico.title = 'En attente d’une autre tâche';
      } else {
        ico.title = 'Terminer';
        ico.setAttribute('aria-label', 'Terminer');
        ico.addEventListener('click', function (e) {
          e.stopPropagation();
          M.complete(a.id);
        });
      }
      row.appendChild(ico);
      row.appendChild(S.el('span', 'jy-row-name', a.name));
      row.appendChild(S.el('span', 'jy-row-effort', a.effortLabel || ''));
      row.appendChild(S.el('span', 'jy-row-due', a.dueLabel || ''));
      var go = S.el('button', 'jy-row-go');
      go.type = 'button';
      go.title = 'Ouvrir';
      go.appendChild(S.icon('arrow-up-right'));
      go.addEventListener('click', function (e) {
        e.stopPropagation();
        M.openCard(a.id);
      });
      row.appendChild(go);
      var why = [];
      if (a.projectName) why.push(a.projectName);
      if (a.reasons.length) why.push(a.reasons.join(' · '));
      row.appendChild(S.el('span', 'jy-row-why', why.join(' · ')));
      row.addEventListener('click', function () { M.selectNode(a.id, 'task'); });
      row.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        M.menuFor(a.id, row, e);
      });
      return row;
    };
    },
    run: function (M) {
    M.container.classList.add('jy-mount');
    if (global.CommandPalette) {
      global.CommandPalette.attach({
        cards: function () { return (M.state.board.cards || []).map(function (c) { return { id: c.id, name: c.name }; }); },
        onCard: function (id) { M.selectNode(id, 'task'); },
      });
    }
    M.reload();
    return { v: { reload: M.reload } };
    }
  });
})(typeof window !== 'undefined' ? window : this);
