/**
 * dashboard-ui: mount() part, project right-click actions in the Triage list.
 *   - "Tout marquer comme terminé": the tasks fade out slowly (hover pauses and brings one back,
 *     leaving restarts the fade), sparkle where they were, then the list settles back into place
 *     and the tasks are completed.
 *   - "Archiver toutes les cartes": one undo for the whole project.
 * Order and shared names: see dashboard-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.DashboardUiParts = global.DashboardUiParts || {});
  var P = (global.DashboardUiPartsMountMount = global.DashboardUiPartsMountMount || { list: [] });

  var FADE_MS = 3200;
  var BACK_MS = 260;

  function reduced() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  P.list.push({
    define: function (M) {
      /** The project node of a right-clicked project line: id (empty for the free group) and name. */
      M.projectNodeOf = function projectNodeOf(el) {
        var nameEl = el.querySelector('.tt-name');
        return { id: el.getAttribute('data-iso-project') || '', name: (nameEl && nameEl.textContent) || 'Sans projet' };
      };

      M.projectMenuEntries = function projectMenuEntries(node) {
        var rows = M.rowsForProject(node);
        var open = rows.filter(function (r) { return !(r.dueDone || r.statutKey === 'completed'); });
        return [
          { id: 'project-complete-all', label: 'Tout marquer comme terminé', icon: 'circle-check', group: 'Trier', success: true, disabled: !open.length, action: function () { M.completeProjectAnimated(node); } },
          { id: 'project-archive-all', label: 'Archiver toutes les cartes', icon: 'archive', group: 'Trier', disabled: !rows.length, action: function () { M.archiveProject(node); } },
        ];
      };

      M.archiveProject = function archiveProject(node) {
        var rows = M.rowsForProject(node);
        if (!rows.length) return;
        var snaps = rows.map(function (r) { return { row: r, snap: M.snapshotOf(r, { archived: true }) }; });
        var gone = {};
        rows.forEach(function (r) { gone[r.id] = true; });
        M.state.rows = M.state.rows.filter(function (r) { return !gone[r.id]; });
        if (M.state.selected && gone[M.state.selected]) M.state.selected = null;
        snaps.forEach(function (s) {
          M.save(s.row, function () { return global.TableTrello.archiveCard(M.t, s.row.id); });
        });
        function undo() {
          if (M.state.undo !== undo) return;
          M.state.undo = null;
          snaps.forEach(function (s) {
            var cur = M.state.rows.filter(function (r) { return r.id === s.snap.id; })[0] || s.row;
            if (M.state.rows.indexOf(cur) < 0) M.state.rows.push(cur);
            M.applyList(cur, M.state.lists.filter(function (l) { return l.id === s.snap.listId; })[0]);
            cur.pos = s.snap.pos;
            cur.fullDesc = s.snap.fullDesc;
            Object.assign(cur, s.snap.local);
            M.save(cur, function () { return S.DT().restoreTriage(M.t, s.snap); });
          });
          M.setStatus(rows.length + ' cartes remises en place', 'ok');
          M.render();
        }
        M.state.undo = undo;
        M.setStatus(rows.length + (rows.length > 1 ? ' cartes archivées' : ' carte archivée') + ' (« ' + node.name + ' »)', 'ok', 8000, { label: 'Défaire', run: undo });
        M.render();
      };

      function tops(root) {
        var out = {};
        var list = root.querySelectorAll('[data-key], .db-row[data-id]');
        for (var i = 0; i < list.length; i++) {
          var id = list[i].getAttribute('data-key') || list[i].getAttribute('data-id');
          if (id) out[id] = list[i].getBoundingClientRect().top;
        }
        return out;
      }

      /** Rows that moved glide from where they were; rows that are new settle in from above. */
      function settle(before) {
        var root = M.els.main.querySelector('.db-triage-list');
        if (!root || reduced()) return;
        var list = root.querySelectorAll('[data-key], .db-row[data-id]');
        for (var i = 0; i < list.length; i++) {
          var el = list[i];
          var id = el.getAttribute('data-key') || el.getAttribute('data-id');
          var was = before[id];
          var now = el.getBoundingClientRect().top;
          var from = was == null ? -14 : was - now;
          if (Math.abs(from) < 1 && was != null) continue;
          el.style.transition = 'none';
          el.style.transform = 'translateY(' + from + 'px)';
          if (was == null) el.style.opacity = '0';
          (function (node, delay) {
            global.requestAnimationFrame(function () {
              global.requestAnimationFrame(function () {
                node.style.transition = 'transform 520ms cubic-bezier(.2,.8,.2,1) ' + delay + 'ms, opacity 380ms ease ' + delay + 'ms';
                node.style.transform = '';
                node.style.opacity = '';
                setTimeout(function () { node.style.transition = ''; }, 520 + delay + 60);
              });
            });
          })(el, Math.min(i, 12) * 28);
        }
      }

      /** The red "II" of a project line: unblock every blocked task of the project. */
      M.unblockProject = function unblockProject(node) {
        var rows = M.rowsForProject(node).filter(function (r) { return r.blocked; });
        if (!rows.length) return M.setStatus('Aucune tâche bloquée à débloquer (une sous-tâche bloque peut-être encore)', 'ok', 4000);
        rows.forEach(function (r) { M.exitBlocked(r); });
        M.setStatus(rows.length + (rows.length > 1 ? ' tâches débloquées' : ' tâche débloquée'), 'ok');
      };

      /* Manual order of the Triage list (drag and drop). */
      M.reorderProject = function reorderProject(ids) {
        var DND = global.TriageDnd;
        if (!DND) return;
        var o = DND.order();
        o.projects = ids;
        DND.setOrder(o);
        M.render();
      };
      M.reorderTask = function reorderTask(projectId, ids) {
        var DND = global.TriageDnd;
        if (!DND) return;
        var o = DND.order();
        o.tasks[projectId || ''] = ids;
        DND.setOrder(o);
        // A column sort would win over the order just chosen: the drop is the new order.
        if (M.state.triageSorts && M.state.triageSorts.length) {
          M.state.triageSorts = [];
          if (global.TriageTree && global.TriageTree.prefs.setSorts) global.TriageTree.prefs.setSorts([]);
        }
        M.render();
      };
      M.hasCustomOrder = function hasCustomOrder() {
        var DND = global.TriageDnd;
        if (!DND) return false;
        var o = DND.order();
        return !!(o.projects.length || Object.keys(o.tasks).some(function (k) { return o.tasks[k] && o.tasks[k].length; }));
      };
      M.resetCustomOrder = function resetCustomOrder() {
        if (global.TriageDnd) global.TriageDnd.setOrder({ projects: [], tasks: {} });
        M.render();
      };
      M.moveToProject = function moveToProject(taskId, projectId, opts) {
        var WO = S.WO();
        if (!WO || !WO.withTaskProject) return;
        var DND = global.TriageDnd;
        if (opts && opts.near && DND) {
          var o = DND.order();
          var list = (o.tasks[projectId || ''] || []).filter(function (x) { return x !== taskId; });
          var at = list.indexOf(opts.near);
          if (at >= 0) {
            list.splice(opts.after ? at + 1 : at, 0, taskId);
            o.tasks[projectId || ''] = list;
            DND.setOrder(o);
          }
        }
        var p = projectId ? ((M.state.goals && M.state.goals.nodes) || []).filter(function (n) { return n && n.id === projectId; })[0] : null;
        M.commitGoals(WO.withTaskProject(M.state.goals, taskId, projectId || null), p ? 'Tâche placée dans « ' + p.name + ' »' : 'Tâche retirée du projet');
      };
      M.makeSubtask = function makeSubtask(childId, parentId) {
        var CT = global.CompletionTrello;
        if (!CT || typeof CT.setParentCard !== 'function') return M.setStatus('Sous-tâches indisponibles ici', 'error');
        var child = M.state.rows.filter(function (r) { return r.id === childId; })[0];
        var parent = M.state.rows.filter(function (r) { return r.id === parentId; })[0];
        M.setStatus('Déplacement…', 'busy');
        CT.setParentCard(M.t, childId, parentId).then(function (res) {
          if (res && res.ok === false) {
            var why = { self: 'Une tâche ne peut pas devenir sa propre sous-tâche.', cycle: 'Cette tâche contient déjà l’autre : impossible.' }[res.reason] || 'Sous-tâche non créée.';
            return M.setStatus(why, 'error');
          }
          M.setStatus('« ' + (child ? child.name : 'Tâche') + ' » est maintenant une sous-tâche de « ' + (parent ? parent.name : 'la tâche') + ' »', 'ok', 5000);
          return M.reload({ quiet: true });
        }, function (err) { M.fail(err); });
      };

      M.completeProjectAnimated = function completeProjectAnimated(node) {
        var rows = M.rowsForProject(node).filter(function (r) { return !(r.dueDone || r.statutKey === 'completed'); });
        if (!rows.length) return;
        var listEl = M.els.main.querySelector('.db-triage-list');
        var els = [];
        rows.forEach(function (r) {
          var el = listEl && listEl.querySelector('.db-row[data-id="' + r.id + '"]');
          if (el) els.push(el);
        });
        function commit(before) {
          M.setProjectProgress(node, 100);
          if (before) global.requestAnimationFrame(function () { settle(before); });
        }
        if (!els.length || reduced()) return commit(null);

        var before = tops(listEl);
        var left = els.length;
        var rects = [];
        var finished = false;
        var guard = setTimeout(function () { end(); }, FADE_MS + 4000);

        function end() {
          if (finished) return;
          finished = true;
          clearTimeout(guard);
          els.forEach(function (el) { el.removeEventListener('mouseenter', el.__fadeIn); el.removeEventListener('mouseleave', el.__fadeOut); });
          var fx = global.CelebrationEffects;
          rects.forEach(function (rect, i) {
            if (fx && typeof fx.playSubtaskPop === 'function') {
              setTimeout(function () { fx.playSubtaskPop({ x: rect.left + Math.min(rect.width, 160) / 2, y: rect.top + rect.height / 2 }, { sound: i === 0 }); }, i * 70);
            }
          });
          setTimeout(function () { commit(before); }, 420);
        }

        els.forEach(function (el) {
          var gone = false;
          function fadeOut() {
            if (gone) return;
            el.style.transition = 'opacity ' + FADE_MS + 'ms linear';
            el.style.opacity = '0';
          }
          el.__fadeIn = function () {
            if (gone) return;
            el.style.transition = 'opacity ' + BACK_MS + 'ms ease-out';
            el.style.opacity = '1';
          };
          el.__fadeOut = fadeOut;
          el.addEventListener('mouseenter', el.__fadeIn);
          el.addEventListener('mouseleave', fadeOut);
          el.addEventListener('transitionend', function (e) {
            if (e.propertyName !== 'opacity' || gone) return;
            if (parseFloat(global.getComputedStyle(el).opacity) > 0.02) return;
            gone = true;
            rects.push(el.getBoundingClientRect());
            left -= 1;
            if (left <= 0) end();
          });
          // The pointer may already be on the row: it then stays until the user leaves.
          if (el.matches(':hover')) el.__fadeIn(); else requestAnimationFrame(function () { fadeOut(); });
        });
        M.setStatus('« ' + node.name + ' » : tout se termine…', 'busy');
        setTimeout(function () { if (M.state.statusKind === 'busy') M.setStatus('', ''); }, FADE_MS + 600);
      };
    },
    run: function () {}
  });
})(typeof window !== 'undefined' ? window : this);
