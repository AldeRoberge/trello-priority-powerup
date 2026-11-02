/**
 * gantt-ui: mountGantt() part 2 of 5.
 * The body of mountGantt runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see gantt-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.GanttUiParts = global.GanttUiParts || {});
  var P = (global.GanttUiPartsMountMountGantt = global.GanttUiPartsMountMountGantt || { list: [] });

  P.list.push({
    define: function (M) {
    M.renderToolbar = function renderToolbar() {
      M.toolbar.innerHTML = '';
      if (M.state.filterMenuOutsideHandler) {
        document.removeEventListener(
          'pointerdown',
          M.state.filterMenuOutsideHandler,
          true
        );
        M.state.filterMenuOutsideHandler = null;
      }
      M.state.filterMenuOpen = false;

      function tbGroup(caption, extraClass) {
        var g = S.el('div', 'gantt-tb-group' + (extraClass ? ' ' + extraClass : ''));
        if (caption) g.appendChild(S.el('span', 'gantt-tb-caption', { text: caption }));
        return g;
      }

      var viewGroup = tbGroup();
      var zoom = S.el('div', 'gantt-zoom gantt-segmented');
      [
        { mode: 'day', label: 'Jour', icon: 'ti-calendar' },
        { mode: 'week', label: 'Semaine', icon: 'ti-calendar-week' },
        { mode: 'month', label: 'Mois', icon: 'ti-calendar-month' },
        { mode: 'year', label: 'Ann\u00e9e', icon: 'ti-calendar-stats' },
      ].forEach(function (spec) {
        var btn = S.el(
          'button',
          'gantt-btn' + (M.state.viewMode === spec.mode ? ' is-active' : ''),
          { type: 'button', title: spec.label }
        );
        var icon = S.el('i', 'ti ' + spec.icon);
        icon.setAttribute('aria-hidden', 'true');
        btn.appendChild(icon);
        btn.appendChild(document.createTextNode(spec.label));
        btn.addEventListener('click', function () {
          M.state.viewMode = spec.mode;
          M.state.zoom = 1;
          M.state.spanBefore = 0;
          M.state.spanAfter = 0;
          M.state.scrollToToday = true;
          M.render();
        });
        zoom.appendChild(btn);
      });
      viewGroup.appendChild(zoom);
      M.toolbar.appendChild(viewGroup);

      var navGroup = tbGroup();
      var nav = S.el('div', 'gantt-nav gantt-segmented');
      var prev = S.el('button', 'gantt-btn', { type: 'button', text: '\u2039' });
      prev.title = 'Pr\u00e9c\u00e9dent';
      prev.addEventListener('click', function () {
        M.nudgePeriod(-1);
      });
      var today = S.el('button', 'gantt-btn', { type: 'button', text: "Aujourd'hui" });
      var todayIcon = S.el('i', 'ti ti-circle-dot');
      todayIcon.setAttribute('aria-hidden', 'true');
      today.insertBefore(todayIcon, today.firstChild);
      today.addEventListener('click', function () {
        M.state.anchor = M.model.toIsoDate(new Date());
        M.state.spanBefore = 0;
        M.state.spanAfter = 0;
        M.state.scrollToToday = true;
        M.render();
      });
      var next = S.el('button', 'gantt-btn', { type: 'button', text: '\u203a' });
      next.title = 'Suivant';
      next.addEventListener('click', function () {
        M.nudgePeriod(1);
      });
      nav.appendChild(prev);
      nav.appendChild(today);
      nav.appendChild(next);
      navGroup.appendChild(nav);
      M.toolbar.appendChild(navGroup);

      var title = S.el('div', 'gantt-title');
      var r = M.range();
      var multiSpan = (M.state.spanBefore || 0) + (M.state.spanAfter || 0) > 0;
      if (M.state.viewMode === 'year') {
        title.textContent = r.start.getFullYear() + ' – ' + r.end.getFullYear();
      } else if (M.state.viewMode === 'month' && !multiSpan) {
        title.textContent =
          r.start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      } else if (M.state.viewMode === 'month') {
        var sameMonthYear = r.start.getFullYear() === r.end.getFullYear();
        title.textContent =
          r.start.toLocaleDateString(
            'fr-FR',
            sameMonthYear ? { month: 'long' } : { month: 'long', year: 'numeric' }
          ) +
          ' \u2013 ' +
          r.end.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      } else if (M.state.viewMode === 'day' && !multiSpan) {
        title.textContent = r.start.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      } else {
        // "28 sept. \u2013 4 oct. 2026", like the French day / month titles (not raw ISO dates).
        var sameYear = r.start.getFullYear() === r.end.getFullYear();
        title.textContent =
          r.start.toLocaleDateString(
            'fr-FR',
            sameYear
              ? { day: 'numeric', month: 'short' }
              : { day: 'numeric', month: 'short', year: 'numeric' }
          ) +
          ' \u2013 ' +
          r.end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
      }
      M.toolbar.appendChild(title);

      var displayGroup = tbGroup();
      var GF = global.GanttFilters;
      var filters = S.el('div', 'gantt-filters');

      if (GF) {
        M.sortPanel = GF.createSortPanel({
          getKeys: function () {
            return M.state.sortKeys;
          },
          setKeys: function (keys) {
            M.state.sortKeys = keys;
            M.onSortChanged();
          },
          getGroup: function () {
            return M.state.groupByStatus;
          },
          setGroup: function (on) {
            M.state.groupByStatus = !!on;
            if (on) M.state.groupByProject = false;
            M.onSortChanged();
          },
          getGroupProject: function () {
            return M.state.groupByProject;
          },
          setGroupProject: function (on) {
            M.state.groupByProject = !!on;
            if (on) M.state.groupByStatus = false;
            M.onSortChanged();
          },
        });
        displayGroup.appendChild(M.sortPanel.wrap);

        M.filterPanel = GF.createFilterPanel({
          getCriteria: function () {
            return M.state.criteria;
          },
          setCriteria: M.applyCriteria,
          getFacets: function () {
            return M.currentFacets();
          },
          hasMe: function () {
            return M.meIds().length > 0;
          },
          getOptions: M.filterOptions,
          setOption: function (name, on) {
            M.state[name] = !!on;
            M.onFiltersChanged();
          },
          getCounts: M.taskCounts,
          onReset: M.resetAllFilters,
        });
        displayGroup.appendChild(M.filterPanel.wrap);
      }
      M.toolbar.appendChild(displayGroup);
      M.renderSummaryBar();

      filters = tbGroup();
      filters.classList.add('gantt-tb-group--tools');
      // Only offered while Trello is not authorized (saving dates needs it); otherwise it is just clutter.
      var authBtn = M.makeIconBtn('gantt-btn is-active', 'ti-key', 'Autoriser Trello', function () {
        M.ganttTrello.ensureRestAuthorized(M.t).then(function (res) {
          if (res && res.ok) {
            M.state.authHint = '';
            M.state.restAuthorized = true;
            M.setStatus('');
            M.renderToolbar();
          } else {
            M.setStatus(
              'Autorisation refus\u00e9e' +
                (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
          }
        });
      });
      authBtn.title =
        'Requis pour enregistrer les dates (glisser les barres)';
      if (M.state.restAuthorized === false || M.state.authHint) filters.appendChild(authBtn);

      // Secondary actions live in one "Plus" menu, grouped by purpose, instead of five loose icons.
      var outlookAuth = S.OA();
      var outlookSync = S.OS();
      var menuSections = [];

      var syncItems = [];
      if (outlookAuth && outlookSync) {
        if (typeof outlookAuth.isConfigured === 'function' && !outlookAuth.isConfigured()) {
          syncItems.push({
            icon: 'ti-alert-triangle',
            label: 'Outlook (configuration requise)',
            onClick: function () {
              M.setStatus(
                'Outlook non configuré : déployez clientId dans outlook-config.js (Pages), puis rechargez le Gantt.',
                true
              );
            },
          });
        } else {
          syncItems.push({
            icon: M.state.outlookConnected ? 'ti-plug-connected-x' : 'ti-plug-connected',
            label: M.state.outlookConnected ? 'Déconnecter Outlook' : 'Connecter Outlook',
            onClick: function () {
              if (M.state.outlookConnected) {
                M.setStatus('Déconnexion Outlook…');
                outlookAuth.disconnect().then(function (res) {
                  M.state.outlookConnected = false;
                  if (res && res.ok) {
                    M.setStatus('Outlook déconnecté');
                  } else {
                    M.setStatus(
                      'Déconnexion Outlook échouée' +
                        (res && res.reason ? ' (' + res.reason + ')' : ''),
                      true
                    );
                  }
                  M.renderToolbar();
                });
                return;
              }
              M.setStatus('Connexion Outlook…');
              outlookAuth.connect().then(function (res) {
                if (res && res.ok) {
                  M.state.outlookConnected = true;
                  M.setStatus('Outlook connecté');
                  M.renderToolbar();
                  M.runOutlookSync();
                } else {
                  M.state.outlookConnected = false;
                  M.setStatus(
                    'Connexion Outlook refusée' +
                      (res && res.reason ? ' (' + res.reason + ')' : ''),
                    true
                  );
                  M.renderToolbar();
                }
              });
            },
          });
          if (M.state.outlookConnected) {
            syncItems.push({
              icon: 'ti-refresh',
              label: M.state.outlookSyncing ? 'Sync Outlook…' : 'Synchroniser Outlook',
              disabled: !!M.state.outlookSyncing,
              onClick: function () {
                M.runOutlookSync();
              },
            });
          }
        }
      }
      syncItems.push({
        icon: 'ti-table',
        label: 'Google Sheets',
        onClick: M.openGoogleSheetsSync,
      });
      syncItems.push({
        icon: 'ti-bolt',
        label: 'Power Automate',
        onClick: M.openPowerAutomateGuide,
      });
      menuSections.push({ title: 'Synchronisation', items: syncItems });

      menuSections.push({
        title: 'Exporter',
        items: [
          {
            icon: 'ti-download',
            label: 'Calendrier (.ics)',
            onClick: M.exportIcsCalendar,
          },
        ],
      });

      if (GF && typeof GF.createPopover === 'function') {
        var toolsPop = GF.createPopover({
          className: 'gantt-pop--menu',
          ariaLabel: 'Plus d’options',
        });
        toolsPop.pop.setAttribute('role', 'menu');
        toolsPop.button.setAttribute('aria-haspopup', 'menu');
        toolsPop.button.title = 'Synchronisation et export';
        toolsPop.button.setAttribute('aria-label', 'Plus d’options');
        toolsPop.button.appendChild(S.el('i', 'ti ti-dots'));
        toolsPop.button.classList.add('gantt-btn--icon');
        menuSections.forEach(function (sec) {
          var secEl = S.el('section', 'gantt-pop-section gantt-menu-section');
          secEl.appendChild(S.el('div', 'gantt-pop-caption', { text: sec.title }));
          sec.items.forEach(function (item) {
            var row = S.el('button', 'gantt-menu-item', { type: 'button' });
            row.setAttribute('role', 'menuitem');
            if (item.disabled) row.disabled = true;
            row.appendChild(S.el('i', 'ti ' + item.icon));
            var txt = S.el('span', 'gantt-menu-text');
            txt.appendChild(S.el('span', 'gantt-menu-label', { text: item.label }));
            if (item.hint) txt.appendChild(S.el('span', 'gantt-menu-hint', { text: item.hint }));
            row.appendChild(txt);
            row.addEventListener('click', function () {
              toolsPop.close();
              item.onClick();
            });
            secEl.appendChild(row);
          });
          toolsPop.pop.appendChild(secEl);
        });
        filters.appendChild(toolsPop.wrap);
      }

      var refresh = M.makeIconBtn('gantt-btn gantt-btn--icon', 'ti-reload', 'Actualiser', function () {
        M.reload();
      });
      filters.appendChild(refresh);
      var HD = global.HideDone;
      if (HD) {
        var hdBtn = M.makeIconBtn(
          'gantt-btn' + (M.state.hideCompleted ? ' is-active' : ''),
          'ti-' + HD.icon(M.state.hideCompleted),
          HD.label(M.state.hideCompleted),
          function () {
            M.state.hideCompleted = !M.state.hideCompleted;
            M.onFiltersChanged();
          }
        );
        hdBtn.title = HD.title(M.state.hideCompleted);
        hdBtn.classList.add('gantt-btn--hide-done');
        M.hideDoneBtn = hdBtn;
        filters.appendChild(hdBtn);
        M.refreshHideDoneBtn();
      }
      if (M.histBtn) filters.appendChild(M.histBtn);
      M.toolbar.appendChild(filters);
    };
    M.openGoogleSheetsSync = function openGoogleSheetsSync() {
      var url =
        global.PriorityTrello && typeof PriorityTrello.pageUrl === 'function'
          ? PriorityTrello.pageUrl('./google-sheets-sync.html')
          : './google-sheets-sync.html';
      if (M.t && typeof M.t.modal === 'function') {
        try {
          M.t.modal({
            url: url,
            title: 'Google Sheets ↔ Trello',
            fullscreen: false,
            height: 640,
          });
          return;
        } catch (err) {
          console.warn('GanttUI Google Sheets modal failed', err);
        }
      }
      try {
        global.open(url, '_blank', 'noopener');
      } catch (e2) {
        M.setStatus('Impossible d’ouvrir les réglages Google Sheets', true);
      }
    };
    M.openPowerAutomateGuide = function openPowerAutomateGuide() {
      var url =
        global.PriorityTrello && typeof PriorityTrello.pageUrl === 'function'
          ? PriorityTrello.pageUrl('./outlook-power-automate.html')
          : './outlook-power-automate.html';
      if (M.t && typeof M.t.modal === 'function') {
        try {
          M.t.modal({
            url: url,
            title: 'Power Automate \u2192 Outlook',
            fullscreen: false,
            height: 640,
          });
          return;
        } catch (err) {
          console.warn('GanttUI Power Automate modal failed', err);
        }
      }
      try {
        global.open(url, '_blank', 'noopener');
      } catch (e2) {
        M.setStatus('Impossible d\u2019ouvrir le guide Power Automate', true);
      }
    };
    M.exportIcsCalendar = function exportIcsCalendar() {
      var ics = S.OI();
      if (!ics || typeof ics.exportBoard !== 'function') {
        M.setStatus('Module ICS manquant', true);
        return;
      }
      M.setStatus('Export .ics\u2026');
      var cards = [];
      var ids = Object.keys(M.state.cardsById || {});
      for (var i = 0; i < ids.length; i++) {
        cards.push(M.state.cardsById[ids[i]]);
      }
      Promise.resolve(
        cards.length
          ? ics.exportBoard(M.t, { cards: cards })
          : ics.exportBoard(M.t)
      )
        .then(function (res) {
          if (!res || !res.ok) {
            if (res && res.reason === 'no-dated-cards') {
              M.setStatus('Aucune carte dat\u00e9e \u00e0 exporter', true);
            } else {
              M.setStatus(
                'Export .ics \u00e9chou\u00e9' +
                  (res && res.reason ? ' (' + res.reason + ')' : ''),
                true
              );
            }
            return;
          }
          M.setStatus(
            'Fichier .ics t\u00e9l\u00e9charg\u00e9 (' +
              res.eventCount +
              ' \u00e9v\u00e9nement(s)) — importez-le dans Outlook'
          );
        })
        .catch(function (err) {
          M.setStatus(
            'Export .ics\u00a0: ' +
              (err && err.message ? err.message : String(err)),
            true
          );
        });
    };
    M.formatOutlookSummary = function formatOutlookSummary(summary) {
      if (!summary) return 'Sync Outlook termin\u00e9e';
      var parts = [];
      if (summary.created) parts.push(summary.created + ' cr\u00e9\u00e9(s)');
      if (summary.updated) parts.push(summary.updated + ' maj');
      if (summary.deleted) parts.push(summary.deleted + ' supprim\u00e9(s)');
      if (summary.merged && !summary.updated) {
        parts.push(summary.merged + ' \u00e0 jour');
      }
      if (summary.errors) parts.push(summary.errors + ' erreur(s)');
      if (!parts.length) return 'Outlook : rien \u00e0 synchroniser';
      return 'Outlook : ' + parts.join(', ');
    };
    M.runOutlookSync = function runOutlookSync() {
      var outlookSync = S.OS();
      var outlookAuth = S.OA();
      if (!outlookSync || typeof outlookSync.syncBoard !== 'function') {
        M.setStatus('Module Outlook sync manquant', true);
        return Promise.resolve();
      }
      if (
        outlookAuth &&
        typeof outlookAuth.isConfigured === 'function' &&
        !outlookAuth.isConfigured()
      ) {
        M.setStatus('OutlookConfig.clientId manquant', true);
        return Promise.resolve();
      }
      M.state.outlookSyncing = true;
      M.setStatus('Sync Outlook\u2026');
      M.renderToolbar();
      return outlookSync
        .syncBoard(M.t)
        .then(function (summary) {
          M.state.outlookSyncing = false;
          if (!summary || !summary.ok) {
            M.setStatus(
              'Sync Outlook \u00e9chou\u00e9e' +
                (summary && summary.reason ? ' (' + summary.reason + ')' : ''),
              true
            );
          } else {
            M.setStatus(M.formatOutlookSummary(summary));
            if (summary.updated) {
              return M.reload({ syncOutlook: false }).then(function () {
                M.setStatus(M.formatOutlookSummary(summary));
              });
            }
          }
          M.renderToolbar();
          return summary;
        })
        .catch(function (err) {
          M.state.outlookSyncing = false;
          M.setStatus(
            'Sync Outlook\u00a0: ' +
              (err && err.message ? err.message : String(err)),
            true
          );
          M.renderToolbar();
        });
    };
    M.refreshRestAuthorized = function refreshRestAuthorized() {
      var api = global.PriorityTrello;
      if (!api || typeof api.isRestAuthorized !== 'function') return Promise.resolve(null);
      return Promise.resolve(api.isRestAuthorized(M.t)).then(
        function (ok) {
          M.state.restAuthorized = !!ok;
          return M.state.restAuthorized;
        },
        function () {
          return null;
        }
      );
    };
    M.refreshOutlookConnected = function refreshOutlookConnected() {
      var outlookAuth = S.OA();
      if (!outlookAuth || typeof outlookAuth.isConnected !== 'function') {
        M.state.outlookConnected = false;
        return Promise.resolve(false);
      }
      return outlookAuth.isConnected().then(function (connected) {
        M.state.outlookConnected = !!connected;
        return M.state.outlookConnected;
      });
    };
    M.saveProjectIcon = function saveProjectIcon(id, icon) {
      var GG = global.MindmapGoalsTrello;
      var WO = global.WorkOS;
      if (!id || !GG || typeof GG.save !== 'function' || !WO || typeof WO.withNodeEdit !== 'function') return;
      var next = WO.withNodeEdit(M.state.goals, id, { icon: icon });
      M.state.goals = next;
      M.applySort();
      M.renderChart();
      GG.save(M.t, next).then(function (saved) {
        if (saved) M.state.goals = saved;
      }, function () { /* the glyph stays until the next reload */ });
    };
    M.saveProjectPriority = function saveProjectPriority(projectId, score) {
      var GG = global.MindmapGoalsTrello;
      var WO = global.WorkOS;
      if (!projectId || !GG || typeof GG.save !== 'function' || !WO || typeof WO.withNodeEdit !== 'function') {
        M.setStatus('Projet indisponible', true);
        return;
      }
      var next = WO.withNodeEdit(M.state.goals, projectId, { priority: score });
      M.state.goals = next;
      M.applySort();
      M.renderChart();
      M.setStatus(score == null ? 'Priorité retirée' : 'Priorité enregistrée');
      GG.save(M.t, next).then(function (saved) {
        if (saved) M.state.goals = saved;
        M.applySort();
        M.renderChart();
      }, function () {
        M.setStatus('Échec de l’enregistrement du projet', true);
        M.reload({ quiet: true });
      });
    };
    M.projectSectionMeta = function projectSectionMeta(row) {
      if (!row || row.sectionKey !== 'project') return [];
      var nodes = [];
      var hasPri = typeof row.priority === 'number';
      if (!row.projectId) {
        nodes.push(S.el('span', 'gantt-section-pri is-empty', { text: '-', 'aria-hidden': 'true' }));
      } else {
        var pri = S.el('button', 'gantt-section-pri' + (hasPri ? '' : ' is-empty'), {
          type: 'button',
          title: 'Priorité',
          text: hasPri && global.TableModel ? global.TableModel.formatPriority(row.priority) : (hasPri ? Number(row.priority).toFixed(1) : '-'),
        });
        pri.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        pri.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (!global.TableModel || !global.ContextMenu || typeof global.ContextMenu.show !== 'function') return;
          var rect = pri.getBoundingClientRect();
          global.ContextMenu.show(
            { clientX: rect.left, clientY: rect.bottom + 4 },
            global.TableModel.projectPriorityItems(row.priority, function (score) {
              M.saveProjectPriority(row.projectId, score);
            })
          );
        });
        nodes.push(pri);
      }
      var stats = global.TableModel && typeof global.TableModel.sectionStats === 'function'
        ? global.TableModel.sectionStats(row.children || [])
        : { progress: null, subs: 0 };
      var prog = stats.progress;
      if (stats.blocked && prog == null) prog = 0;
      var progEl = S.el('span', 'gantt-section-prog' + (prog == null ? ' is-empty' : '') + (stats.blocked ? ' is-blocked' : ''), {
        text: prog == null ? '-' : prog + '%',
        title: stats.blocked ? 'Une tâche est bloquée' : ((prog != null && prog >= 100) ? 'Rouvrir les tâches' : 'Terminer les tâches'),
      });
      if (row.children && row.children.length) {
        progEl.style.cursor = 'pointer';
        progEl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        progEl.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var CT = global.CompletionTrello;
          var next = CT && typeof CT.parentClickPercent === 'function' ? CT.parentClickPercent(prog) : ((prog != null && prog >= 100) ? 0 : 100);
          M.saveProjectProgress(row, next);
        });
      }
      nodes.push(progEl);
      return nodes;
    };
    M.saveProjectProgress = function saveProjectProgress(row, pct) {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.saveProgressTree !== 'function') {
        M.setStatus('Éditeur de progrès indisponible', true);
        return;
      }
      var cards = [];
      (function walk(list) {
        (list || []).forEach(function (n) {
          if (!n) return;
          if (n.cardId) cards.push(n);
          else walk(n.children);
        });
      })(row.children);
      if (!cards.length) return;
      var wasDone = {};
      cards.forEach(function (n) { if (n.cardId) wasDone[n.cardId] = !!n.dueComplete || n.category === 'completed'; });
      M.setStatus('Enregistrement…');
      CT.saveProgressTree(M.t, cards, pct).then(function (ids) {
        if (pct < 100 || !global.TableTrello || typeof global.TableTrello.moveCard !== 'function') return null;
        var list = (M.state.boardLists || []).filter(function (l) { return l.category === 'completed'; })[0];
        if (!list) return null;
        var chain = Promise.resolve();
        (ids || []).forEach(function (id) {
          if (wasDone[id]) return;
          chain = chain.then(function () { return global.TableTrello.moveCard(M.t, id, list.id, 'bottom'); });
        });
        return chain;
      }).then(function () {
        M.setStatus(pct >= 100 ? '« ' + (row.name || 'Projet') + ' » terminé' : 'Enregistré');
        return M.reload({ quiet: true });
      }, function (err) {
        M.setStatus('Erreur progrès : ' + (err && err.message ? err.message : err), true);
      });
    };
    M.projectOfNode = function projectOfNode(node) {
      var W = global.WorkOS;
      if (!W || typeof W.projectOf !== 'function' || !node || !node.cardId) return null;
      var p = null;
      try { p = W.projectOf(M.state.goals, node.cardId); } catch (e) { p = null; }
      if (!p || !p.id) return null;
      return {
        id: p.id,
        name: p.name || 'Projet',
        icon: p.icon || null,
        priority: typeof p.priority === 'number' ? p.priority : null,
      };
    };
    M.sectionTone = function sectionTone(row) {
      if (row && row.sectionKey === 'project') return 'project';
      return (row && row.sectionKey) || 'pending';
    };
    M.sectionDropKey = function sectionDropKey(row) {
      if (row && row.sectionKey === 'project') return 'project:' + (row.projectId || '');
      return (row && row.sectionKey) || 'pending';
    };
    M.setSectionsExpanded = function setSectionsExpanded(open) {
      (M.state.tree || []).forEach(function (n) {
        if (n && n.kind === 'section') M.state.expanded[n.id] = !!open;
      });
      M.renderChart();
    };
    M.applySort = function applySort() {
      if (
        M.state.groupByProject &&
        typeof M.model.sortTreeRootsGroupedByProject === 'function'
      ) {
        M.state.tree = M.model.sortTreeRootsGroupedByProject(
          M.state.tree,
          M.state.sortKeys,
          null,
          { group: true, projectOf: M.projectOfNode }
        );
        return;
      }
      var opts = { group: M.state.groupByStatus !== false };
      if (typeof M.model.sortTreeRootsGroupedByState === 'function') {
        M.state.tree = M.model.sortTreeRootsGroupedByState(
          M.state.tree,
          M.state.sortKeys,
          null,
          opts
        );
      } else if (typeof M.model.sortTreeRootsMulti === 'function') {
        M.state.tree = M.model.sortTreeRootsMulti(M.state.tree, M.state.sortKeys);
      }
    };
    M.isSelectableGanttRow = function isSelectableGanttRow(row) {
      return !!(row && row.kind !== 'section' && row.id);
    };
    M.sortKeyIndex = function sortKeyIndex(mode) {
      for (var i = 0; i < M.state.sortKeys.length; i++) {
        if (M.state.sortKeys[i].by === mode) return i;
      }
      return -1;
    };
    M.setSortBy = function setSortBy(mode, opts) {
      opts = opts || {};
      var next = S.normalizeSortBy(mode);
      var at = M.sortKeyIndex(next);
      var keys = M.state.sortKeys.slice();
      var dir = M.model.sortFieldDefaultDir
        ? M.model.sortFieldDefaultDir(next)
        : S.normalizeSortDir(null, next);
      if (opts.dir === 'asc' || opts.dir === 'desc') {
        keys = [{ by: next, dir: opts.dir }];
      } else if (at !== -1) {
        keys[at] = { by: next, dir: keys[at].dir === 'asc' ? 'desc' : 'asc' };
      } else if (opts.additive) {
        keys.push({ by: next, dir: dir });
      } else {
        keys = [{ by: next, dir: dir }];
      }
      M.state.sortKeys = S.normalizeSortKeysUi(keys);
      M.onSortChanged();
    };
    M.sortIndicator = function sortIndicator(mode) {
      var at = M.sortKeyIndex(mode);
      if (at === -1) return null;
      var dir = M.state.sortKeys[at].dir;
      var ind = S.el('span', 'gantt-sort-indicator', {
        text: dir === 'asc' ? '▲' : '▼',
        'aria-hidden': 'true',
      });
      if (M.state.sortKeys.length > 1) {
        ind.appendChild(
          S.el('sup', 'gantt-sort-level', { text: String(at + 1) })
        );
      }
      return ind;
    };
    M.bindSortableHeader = function bindSortableHeader(slot, mode, label) {
      slot.classList.add('is-sortable');
      var at = M.sortKeyIndex(mode);
      var active = at !== -1;
      if (active) slot.classList.add('is-active');
      var dirHint = active
        ? M.state.sortKeys[at].dir === 'asc'
          ? ' croissant'
          : ' décroissant'
        : '';
      slot.title =
        'Trier par ' +
        label +
        dirHint +
        ' · Maj+clic : ajouter comme niveau de tri';
      slot.setAttribute('role', 'button');
      slot.setAttribute('tabindex', '0');
      slot.setAttribute('aria-pressed', active ? 'true' : 'false');
      function onSort(additive) {
        M.setSortBy(mode, { additive: !!additive });
      }
      slot.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        onSort(e.shiftKey);
      });
      slot.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort(e.shiftKey);
        }
      });
    };
    M.toggleExpand = function toggleExpand(nodeId) {
      if (M.state.expanded[nodeId] == null) {
        // Default roots open: first toggle closes
        M.state.expanded[nodeId] = false;
      } else {
        M.state.expanded[nodeId] = !M.state.expanded[nodeId];
      }
      M.renderChart();
    };
    M.closeCardOverlay = function closeCardOverlay(opts) {
      opts = opts || {};
      if (M.state.cardOverlayKeyHandler) {
        document.removeEventListener('keydown', M.state.cardOverlayKeyHandler, true);
        M.state.cardOverlayKeyHandler = null;
      }
      if (M.state.cardOverlay && M.state.cardOverlay.parentNode) {
        M.state.cardOverlay.parentNode.removeChild(M.state.cardOverlay);
      }
      M.state.cardOverlay = null;
      if (opts.reload !== false) {
        M.reload({ quiet: true });
      }
    };
    M.cardIdsForSectionDrag = function cardIdsForSectionDrag(originRow) {
      var selected = M.selectedRows().filter(function (r) {
        return r && r.kind === 'card' && r.cardId;
      });
      var originSelected = !!(originRow && M.state.selected[originRow.id]);
      var seen = Object.create(null);
      var ids = [];
      function pushId(cid) {
        var id = cid != null ? String(cid) : '';
        if (!id || seen[id]) return;
        seen[id] = true;
        ids.push(id);
      }
      if (originSelected && selected.length) {
        for (var i = 0; i < selected.length; i++) {
          pushId(selected[i].cardId);
        }
      }
      if (originRow && originRow.kind === 'card' && originRow.cardId) {
        pushId(originRow.cardId);
      }
      return ids;
    };
    M.applyProjectDrop = function applyProjectDrop(cardIds, projectId) {
      var W = global.WorkOS;
      var GG = global.MindmapGoalsTrello;
      if (
        !W ||
        typeof W.withTaskProject !== 'function' ||
        !GG ||
        typeof GG.save !== 'function'
      ) {
        M.setStatus('Projet indisponible', true);
        return;
      }
      if (M.state.saving) return;
      M.state.saving = true;
      var pid = projectId || null;
      var next = M.state.goals || { nodes: [], links: [] };
      cardIds.forEach(function (cid) {
        next = W.withTaskProject(next, cid, pid);
      });
      M.state.goals = next;
      M.applySort();
      M.renderChart();
      M.setStatus(pid ? 'Projet enregistré' : 'Projet retiré');
      GG.save(M.t, next).then(
        function (saved) {
          M.state.saving = false;
          if (saved && saved.nodes) M.state.goals = saved;
          M.applySort();
          M.renderChart();
        },
        function () {
          M.state.saving = false;
          M.setStatus('Échec de l’enregistrement du projet', true);
          M.reload({ quiet: true });
        }
      );
    };
    M.applySectionDrop = function applySectionDrop(cardIds, sectionKey) {
      if (!cardIds || !cardIds.length || !sectionKey) return;
      if (String(sectionKey).indexOf('project:') === 0) {
        M.applyProjectDrop(cardIds, String(sectionKey).slice('project:'.length));
        return;
      }
      if (typeof M.ganttTrello.moveCardToStateSection !== 'function') return;
      if (M.state.saving) return;
      M.state.saving = true;
      var label =
        sectionKey === 'started'
          ? 'En cours'
          : sectionKey === 'blocked'
            ? 'Bloqu\u00e9'
            : 'En attente';
      M.setStatus(
        'D\u00e9placement vers ' +
          label +
          (cardIds.length > 1 ? ' (' + cardIds.length + ')' : '') +
          '\u2026'
      );

      var chain = Promise.resolve({ ok: true, results: [] });
      cardIds
        .reduce(function (p, cid) {
          return p.then(function (acc) {
            var prevCard = M.state.cardsById[cid] || {};
            var prevState = {
              listId: prevCard.listId || null,
              blocked: !!(prevCard.inputs && prevCard.inputs.enAttente),
            };
            return M.ganttTrello
              .moveCardToStateSection(M.t, cid, sectionKey)
              .then(function (res) {
                acc.results.push(res);
                if (!res || !res.ok) acc.ok = false;
                else {
                  M.record({
                    type: 'move',
                    targetId: cid,
                    title: prevCard.name || '',
                    key: 'statut',
                    before: prevCard.listName || (prevState.blocked ? 'Bloqu\u00e9' : ''),
                    after: label,
                    beforeVal: prevState,
                    afterVal: {
                      listId: res.listId || prevState.listId,
                      blocked: sectionKey === 'blocked',
                    },
                  });
                }
                return acc;
              });
          });
        }, chain)
        .then(function (acc) {
          M.state.saving = false;
          M.state.suppressCardOpen = false;
          if (!acc.ok) {
            M.setStatus(
              '\u00c9chec du d\u00e9placement de statut',
              true
            );
          } else {
            M.state.selected = Object.create(null);
            M.setStatus(
              cardIds.length === 1
                ? 'Statut mis \u00e0 jour'
                : cardIds.length + ' cartes mises \u00e0 jour'
            );
          }
          return M.reload();
        })
        .catch(function (err) {
          M.state.saving = false;
          M.state.suppressCardOpen = false;
          M.setStatus(
            'Erreur\u00a0: ' + (err && err.message ? err.message : String(err)),
            true
          );
          return M.reload();
        });
    };
    M.bindLabelSectionDrag = function bindLabelSectionDrag(labelRow, row) {
      if (!row || row.kind !== 'card' || !row.cardId) return;
      var canProject =
        M.state.groupByProject &&
        global.WorkOS &&
        typeof global.WorkOS.withTaskProject === 'function';
      var canStatus = typeof M.ganttTrello.moveCardToStateSection === 'function';
      if (M.state.groupByProject) {
        if (!canProject) return;
      } else if (!canStatus) {
        return;
      }

      labelRow.classList.add('is-section-draggable');
      labelRow.title =
        labelRow.title ||
        (M.state.groupByProject
          ? 'Glisser vers un projet'
          : 'Glisser vers une section pour changer le statut');

      labelRow.addEventListener('pointerdown', function (ev) {
        if (ev.button != null && ev.button !== 0) return;
        if (M.state.saving || M.state.sectionDrag) return;
        var tgt = ev.target;
        if (tgt && tgt.closest) {
          if (tgt.closest('.gantt-select-box')) return;
          if (tgt.closest('.gantt-twist')) return;
          if (tgt.closest('.gantt-row-actions')) return;
          if (tgt.closest('.gantt-detail-icons')) return;
          if (tgt.closest('.gantt-rename-input')) return;
          if (tgt.closest('.gantt-action-btn')) return;
        }

        var cardIds = M.cardIdsForSectionDrag(row);
        if (!cardIds.length) return;

        var drag = {
          pointerId: ev.pointerId,
          startX: ev.clientX,
          startY: ev.clientY,
          cardIds: cardIds,
          originRowId: row.id,
          active: false,
          ghost: null,
          dropKey: null,
        };
        M.state.sectionDrag = drag;

        function clearDropHighlight() {
          var nodes = M.root.querySelectorAll(
            '.gantt-row--section.is-drop-target'
          );
          for (var i = 0; i < nodes.length; i++) {
            nodes[i].classList.remove('is-drop-target');
          }
        }

        function highlightSectionAt(clientX, clientY) {
          clearDropHighlight();
          drag.dropKey = null;
          var under = document.elementFromPoint(clientX, clientY);
          var section =
            under && under.closest
              ? under.closest('.gantt-row--section[data-section-key]')
              : null;
          if (!section) return;
          section.classList.add('is-drop-target');
          drag.dropKey = section.getAttribute('data-section-key');
        }

        function onMove(e) {
          if (!M.state.sectionDrag || M.state.sectionDrag !== drag) return;
          var dx = e.clientX - drag.startX;
          var dy = e.clientY - drag.startY;
          if (!drag.active) {
            if (dx * dx + dy * dy < 36) return;
            drag.active = true;
            M.state.suppressCardOpen = true;
            try {
              labelRow.setPointerCapture(ev.pointerId);
            } catch (capErr) {
              /* ignore */
            }
            var ghost = S.el('div', 'gantt-section-drag-ghost', {
              text:
                cardIds.length > 1
                  ? cardIds.length + ' cartes'
                  : row.name || 'Carte',
            });
            document.body.appendChild(ghost);
            drag.ghost = ghost;
            labelRow.classList.add('is-dragging-section');
            M.root.classList.add('is-section-dragging');
          }
          if (drag.ghost) {
            drag.ghost.style.left = e.clientX + 12 + 'px';
            drag.ghost.style.top = e.clientY + 12 + 'px';
          }
          highlightSectionAt(e.clientX, e.clientY);
        }

        function cleanup() {
          clearDropHighlight();
          if (drag.ghost && drag.ghost.parentNode) {
            drag.ghost.parentNode.removeChild(drag.ghost);
          }
          labelRow.classList.remove('is-dragging-section');
          M.root.classList.remove('is-section-dragging');
          try {
            labelRow.releasePointerCapture(ev.pointerId);
          } catch (relErr) {
            /* ignore */
          }
          document.removeEventListener('pointermove', onMove, true);
          document.removeEventListener('pointerup', onUp, true);
          document.removeEventListener('pointercancel', onUp, true);
          if (M.state.sectionDrag === drag) M.state.sectionDrag = null;
        }

        function onUp(e) {
          if (!M.state.sectionDrag || M.state.sectionDrag !== drag) {
            cleanup();
            return;
          }
          var wasActive = drag.active;
          var dropKey = drag.dropKey;
          var ids = drag.cardIds.slice();
          cleanup();
          if (!wasActive) return;
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          if (!dropKey || M.state.saving) {
            M.state.suppressCardOpen = false;
            return;
          }
          M.applySectionDrop(ids, dropKey);
        }

        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', onUp, true);
        document.addEventListener('pointercancel', onUp, true);
      });
    };
    M.openCard = function openCard(cardId, cardName) {
      if (!cardId || !global.TaskFocus) return;
      M.closeMiniPopover();
      M.closeCardOverlay({ reload: false });
      global.TaskFocus.open({
        t: M.t,
        cardId: cardId,
        name: cardName || '',
        onChange: function () { M.refreshBoardQuiet(); },
        onToast: function (m, kind) { M.setStatus(m || '', kind === 'error'); },
      });
    };
    M.refreshBoardQuiet = function refreshBoardQuiet() {
      return M.reload({ quiet: true });
    };
    M.createCardIn = function createCardIn(title, listId, pos, listName) {
      if (!listId || !global.PriorityTrello) return Promise.resolve();
      var QP = global.QuickParse;
      var q = QP && QP.parse ? QP.parse(title) : { name: title, dueDate: '' };
      return global.PriorityTrello.createCard(M.t, { name: q.name || title, idList: listId, pos: pos }).then(function (res) {
        if (!res || res.ok === false) throw new Error((res && res.reason) || 'erreur');
        var cardId = res.cardId;
        var dates = q.dueDate && global.GanttTrello
          ? global.GanttTrello.saveCardDates(M.t, cardId, { dueDate: q.dueDate }).catch(function () {})
          : Promise.resolve();
        return Promise.resolve(dates).then(function () {
          M.record({ type: 'create', targetId: cardId, title: q.name || title, after: listName || '' });
          return M.refreshBoardQuiet();
        });
      });
    };
    M.defaultNewCardList = function defaultNewCardList() {
      var lists = M.state.boardLists || [];
      var open = lists.filter(function (l) { return l.category !== 'completed' && l.category !== 'canceled' && l.category !== 'blocked'; });
      return open.filter(function (l) { return l.category === 'unstarted'; })[0] || open[0] || null;
    };
    M.buildAddRow = function buildAddRow() {
      var list = M.defaultNewCardList();
      if (!list || !global.AddRow) return null;
      var label = S.el('div', 'gantt-row gantt-row--add ar-row');
      label.style.height = S.ROW_H + 'px';
      var cell = S.el('div', 'gantt-label-cell gantt-label-cell--add');
      cell.appendChild(S.el('i', 'ti ti-plus ar-plus gantt-add-plus'));
      cell.appendChild(global.AddRow.input({
        className: 'gantt-add-input',
        onSubmit: function (title, input) {
          input.disabled = true;
          M.createCardIn(title, list.id, 'bottom', list.name).then(function () {
            M.setStatus('Carte créée dans « ' + list.name + ' »');
            var next = M.body.querySelector('.gantt-add-input');
            if (next) next.focus({ preventScroll: true });
          }, function (err) {
            input.disabled = false;
            M.setStatus('Erreur : ' + (err && err.message ? err.message : err), true);
          });
        },
      }));
      label.appendChild(cell);
      var time = S.el('div', 'gantt-row gantt-row--add gantt-timeline-row');
      time.style.height = S.ROW_H + 'px';
      time.style.width = M.state.timelineWidth + 'px';
      return { label: label, time: time };
    };
    M.bindLabelInsert = function bindLabelInsert(labelsCol) {
      if (!global.InsertGap) return;
      global.InsertGap.watch(labelsCol, {
        item: '.gantt-row[data-card-id]',
        float: true,
        placeholder: 'Titre…',
        onCreate: function (title, info) {
          var above = info.above;
          var id = above && above.getAttribute('data-card-id');
          var rec = (id && M.state.cardsById[id]) || {};
          var listId = rec.listId;
          if (!listId || !global.PriorityTrello) return Promise.resolve();
          var siblings = [];
          Object.keys(M.state.cardsById).forEach(function (k) {
            var c = M.state.cardsById[k];
            if (c && c.listId === listId) siblings.push({ id: c.id || k, pos: c.pos || 0 });
          });
          siblings.sort(function (a, b) { return a.pos - b.pos; });
          var belowId = info.below && info.below.getAttribute('data-card-id');
          var index = siblings.length;
          if (belowId) {
            for (var i = 0; i < siblings.length; i++) if (siblings[i].id === belowId) { index = i; break; }
          } else if (id) {
            for (var j = 0; j < siblings.length; j++) if (siblings[j].id === id) { index = j + 1; break; }
          }
          var pos = global.TableModel && global.TableModel.dropPos ? global.TableModel.dropPos(siblings, index) : 'bottom';
          return M.createCardIn(title, listId, pos, rec.listName);
        },
      });
    };
    },
    run: function (M) {

    }
  });
})(typeof window !== 'undefined' ? window : this);
