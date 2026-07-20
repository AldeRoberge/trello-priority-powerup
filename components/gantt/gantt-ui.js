/* Gantt chart UI — toolbar, rows, bars, drag/resize. */
(function (global) {
  'use strict';

  var ROW_H = 36;
  var LABEL_W = 240;
  var EDGE_PX = 6;
  var MIN_TIMELINE_W = 640;

  var STATUT_TABLER = {
    inbox: 'ti-inbox',
    hourglass: 'ti-hourglass',
    circle: 'ti-circle',
    play: 'ti-player-play',
    ban: 'ti-ban',
    check: 'ti-check',
    x: 'ti-x',
    dot: 'ti-point-filled',
  };

  function GM() {
    return global.GanttModel;
  }

  function GT() {
    return global.GanttTrello;
  }

  function OA() {
    return global.OutlookAuth || null;
  }

  function OS() {
    return global.OutlookSync || null;
  }

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  function iconEl(tiClass, title, extraClass) {
    var wrap = el(
      'span',
      'gantt-detail-icon' + (extraClass ? ' ' + extraClass : '')
    );
    if (title) wrap.title = title;
    var i = el('i', 'ti ' + tiClass);
    i.setAttribute('aria-hidden', 'true');
    wrap.appendChild(i);
    return wrap;
  }

  function mountGantt(mount, t, options) {
    options = options || {};
    var model = GM();
    var ganttTrello = GT();
    if (!model || !ganttTrello) {
      mount.textContent = 'Gantt modules missing.';
      return { destroy: function () {} };
    }

    var state = {
      viewMode: 'week',
      anchor: model.toIsoDate(new Date()),
      tree: [],
      cardsById: Object.create(null),
      expanded: Object.create(null),
      selected: Object.create(null),
      hideCompleted: false,
      hideUndated: false,
      sortBy: 'date',
      loading: true,
      error: '',
      authHint: '',
      timelineWidth: MIN_TIMELINE_W,
      widthMeasured: false,
      drag: null,
      paint: null,
      saving: false,
      outlookConnected: false,
      outlookSyncing: false,
    };

    var root = el('div', 'gantt-root');
    var toolbar = el('div', 'gantt-toolbar');
    var bulkBar = el('div', 'gantt-bulk');
    var body = el('div', 'gantt-body');
    var statusBar = el('div', 'gantt-status');
    root.appendChild(toolbar);
    root.appendChild(bulkBar);
    root.appendChild(statusBar);
    root.appendChild(body);
    mount.innerHTML = '';
    mount.appendChild(root);

    function setStatus(msg, isError) {
      statusBar.textContent = msg || '';
      statusBar.classList.toggle('is-error', !!isError);
    }

    function range() {
      return model.viewRange(state.viewMode, state.anchor);
    }

    function visibleRows() {
      var flat = model.flattenVisible(state.tree, state.expanded);
      return model.filterRows(flat, {
        hideCompleted: state.hideCompleted,
        hideUndated: state.hideUndated,
      });
    }

    function renderToolbar() {
      toolbar.innerHTML = '';

      var zoom = el('div', 'gantt-zoom');
      ['week', 'month', 'year'].forEach(function (mode) {
        var labels = { week: 'Semaine', month: 'Mois', year: 'Ann\u00e9e' };
        var btn = el('button', 'gantt-btn' + (state.viewMode === mode ? ' is-active' : ''), {
          type: 'button',
          text: labels[mode],
        });
        btn.addEventListener('click', function () {
          state.viewMode = mode;
          render();
        });
        zoom.appendChild(btn);
      });
      toolbar.appendChild(zoom);

      var nav = el('div', 'gantt-nav');
      var prev = el('button', 'gantt-btn', { type: 'button', text: '\u2039' });
      prev.title = 'Pr\u00e9c\u00e9dent';
      prev.addEventListener('click', function () {
        state.anchor = model.toIsoDate(
          model.shiftAnchor(state.viewMode, state.anchor, -1)
        );
        render();
      });
      var today = el('button', 'gantt-btn', { type: 'button', text: "Aujourd'hui" });
      today.addEventListener('click', function () {
        state.anchor = model.toIsoDate(new Date());
        render();
      });
      var next = el('button', 'gantt-btn', { type: 'button', text: '\u203a' });
      next.title = 'Suivant';
      next.addEventListener('click', function () {
        state.anchor = model.toIsoDate(
          model.shiftAnchor(state.viewMode, state.anchor, 1)
        );
        render();
      });
      nav.appendChild(prev);
      nav.appendChild(today);
      nav.appendChild(next);
      toolbar.appendChild(nav);

      var title = el('div', 'gantt-title');
      var r = range();
      if (state.viewMode === 'year') {
        title.textContent = String(r.start.getFullYear());
      } else if (state.viewMode === 'month') {
        title.textContent =
          r.start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      } else {
        title.textContent =
          model.toIsoDate(r.start) + ' \u2192 ' + model.toIsoDate(r.end);
      }
      toolbar.appendChild(title);

      var sortWrap = el('label', 'gantt-sort');
      sortWrap.appendChild(document.createTextNode('Trier\u00a0: '));
      var sortSel = el('select', 'gantt-select');
      [
        ['date', 'Date'],
        ['priority', 'Priorit\u00e9'],
        ['name', 'Nom'],
      ].forEach(function (opt) {
        var o = el('option', '', { value: opt[0], text: opt[1] });
        if (state.sortBy === opt[0]) o.selected = true;
        sortSel.appendChild(o);
      });
      sortSel.addEventListener('change', function () {
        state.sortBy = sortSel.value || 'date';
        applySort();
        renderChart();
      });
      sortWrap.appendChild(sortSel);
      toolbar.appendChild(sortWrap);

      var filters = el('div', 'gantt-filters');
      var hideDone = el('label', 'gantt-check');
      var doneCb = el('input', '', { type: 'checkbox' });
      doneCb.checked = state.hideCompleted;
      doneCb.addEventListener('change', function () {
        state.hideCompleted = !!doneCb.checked;
        renderChart();
      });
      hideDone.appendChild(doneCb);
      hideDone.appendChild(document.createTextNode(' Masquer termin\u00e9s'));
      filters.appendChild(hideDone);

      var hideUndated = el('label', 'gantt-check');
      var undatedCb = el('input', '', { type: 'checkbox' });
      undatedCb.checked = state.hideUndated;
      undatedCb.addEventListener('change', function () {
        state.hideUndated = !!undatedCb.checked;
        renderChart();
      });
      hideUndated.appendChild(undatedCb);
      hideUndated.appendChild(document.createTextNode(' Masquer sans date'));
      filters.appendChild(hideUndated);

      var authBtn = el('button', 'gantt-btn', {
        type: 'button',
        text: 'Autoriser Trello',
      });
      authBtn.title =
        'Requis pour enregistrer les dates (glisser les barres)';
      authBtn.addEventListener('click', function () {
        ganttTrello.ensureRestAuthorized(t).then(function (res) {
          if (res && res.ok) {
            state.authHint = '';
            setStatus('');
          } else {
            setStatus(
              'Autorisation refus\u00e9e' +
                (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
          }
        });
      });
      filters.appendChild(authBtn);

      var outlookAuth = OA();
      var outlookSync = OS();
      if (outlookAuth && outlookSync) {
        if (
          typeof outlookAuth.isConfigured === 'function' &&
          !outlookAuth.isConfigured()
        ) {
          var outlookHint = el('button', 'gantt-btn', {
            type: 'button',
            text: 'Outlook (config)',
          });
          outlookHint.title =
            'D\u00e9finissez OutlookConfig.clientId (Entra SPA) pour activer la sync';
          outlookHint.disabled = true;
          filters.appendChild(outlookHint);
        } else {
          var outlookConnect = el('button', 'gantt-btn', {
            type: 'button',
            text: state.outlookConnected
              ? 'D\u00e9connecter Outlook'
              : 'Connecter Outlook',
          });
          outlookConnect.title = state.outlookConnected
            ? 'D\u00e9connecter le compte Microsoft'
            : 'Autoriser Outlook Calendar (Microsoft Graph)';
          outlookConnect.addEventListener('click', function () {
            if (state.outlookConnected) {
              setStatus('D\u00e9connexion Outlook\u2026');
              outlookAuth.disconnect().then(function (res) {
                state.outlookConnected = false;
                if (res && res.ok) {
                  setStatus('Outlook d\u00e9connect\u00e9');
                } else {
                  setStatus(
                    'D\u00e9connexion Outlook \u00e9chou\u00e9e' +
                      (res && res.reason ? ' (' + res.reason + ')' : ''),
                    true
                  );
                }
                renderToolbar();
              });
              return;
            }
            setStatus('Connexion Outlook\u2026');
            outlookAuth.connect().then(function (res) {
              if (res && res.ok) {
                state.outlookConnected = true;
                setStatus('Outlook connect\u00e9');
                renderToolbar();
                runOutlookSync();
              } else {
                state.outlookConnected = false;
                setStatus(
                  'Connexion Outlook refus\u00e9e' +
                    (res && res.reason ? ' (' + res.reason + ')' : ''),
                  true
                );
                renderToolbar();
              }
            });
          });
          filters.appendChild(outlookConnect);

          if (state.outlookConnected) {
            var outlookSyncBtn = el('button', 'gantt-btn', {
              type: 'button',
              text: state.outlookSyncing ? 'Sync\u2026' : 'Sync Outlook',
            });
            outlookSyncBtn.disabled = !!state.outlookSyncing;
            outlookSyncBtn.title =
              'Synchroniser titres, descriptions et dates avec Outlook';
            outlookSyncBtn.addEventListener('click', function () {
              runOutlookSync();
            });
            filters.appendChild(outlookSyncBtn);
          }
        }
      }

      var refresh = el('button', 'gantt-btn', { type: 'button', text: 'Actualiser' });
      refresh.addEventListener('click', function () {
        reload();
      });
      filters.appendChild(refresh);
      toolbar.appendChild(filters);
    }

    function formatOutlookSummary(summary) {
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
    }

    function runOutlookSync() {
      var outlookSync = OS();
      var outlookAuth = OA();
      if (!outlookSync || typeof outlookSync.syncBoard !== 'function') {
        setStatus('Module Outlook sync manquant', true);
        return Promise.resolve();
      }
      if (
        outlookAuth &&
        typeof outlookAuth.isConfigured === 'function' &&
        !outlookAuth.isConfigured()
      ) {
        setStatus('OutlookConfig.clientId manquant', true);
        return Promise.resolve();
      }
      state.outlookSyncing = true;
      setStatus('Sync Outlook\u2026');
      renderToolbar();
      return outlookSync
        .syncBoard(t)
        .then(function (summary) {
          state.outlookSyncing = false;
          if (!summary || !summary.ok) {
            setStatus(
              'Sync Outlook \u00e9chou\u00e9e' +
                (summary && summary.reason ? ' (' + summary.reason + ')' : ''),
              true
            );
          } else {
            setStatus(formatOutlookSummary(summary));
            if (summary.updated) {
              return reload({ syncOutlook: false }).then(function () {
                setStatus(formatOutlookSummary(summary));
              });
            }
          }
          renderToolbar();
          return summary;
        })
        .catch(function (err) {
          state.outlookSyncing = false;
          setStatus(
            'Sync Outlook\u00a0: ' +
              (err && err.message ? err.message : String(err)),
            true
          );
          renderToolbar();
        });
    }

    function refreshOutlookConnected() {
      var outlookAuth = OA();
      if (!outlookAuth || typeof outlookAuth.isConnected !== 'function') {
        state.outlookConnected = false;
        return Promise.resolve(false);
      }
      return outlookAuth.isConnected().then(function (connected) {
        state.outlookConnected = !!connected;
        return state.outlookConnected;
      });
    }

    function applySort() {
      if (typeof model.sortTreeRoots === 'function') {
        state.tree = model.sortTreeRoots(state.tree, state.sortBy);
      }
    }

    function toggleExpand(nodeId) {
      if (state.expanded[nodeId] == null) {
        // Default roots open: first toggle closes
        state.expanded[nodeId] = false;
      } else {
        state.expanded[nodeId] = !state.expanded[nodeId];
      }
      renderChart();
    }

    function openCard(cardId, cardName) {
      if (!cardId || !t) return;
      var appName =
        (global.PriorityBrand &&
        typeof PriorityBrand.getAppName === 'function'
          ? PriorityBrand.getAppName()
          : null) ||
        (global.PriorityRestConfig && PriorityRestConfig.appName) ||
        'Trello Cerveau';
      var pageUrl =
        global.PriorityTrello && typeof PriorityTrello.pageUrl === 'function'
          ? PriorityTrello.pageUrl('./popup.html')
          : './popup.html';
      if (typeof t.modal === 'function') {
        try {
          return t.modal({
            title: appName,
            url: pageUrl,
            args: {
              cardId: String(cardId),
              cardName: cardName || '',
              openSection: 'priority',
            },
            height: 1100,
            fullscreen: false,
            accentColor: '#22272B',
          });
        } catch (e) {
          /* fall through */
        }
      }
      if (typeof t.showCard === 'function') {
        try {
          t.showCard(cardId);
        } catch (e2) {
          /* ignore */
        }
      }
    }

    function buildDetailIcons(row) {
      var icons = el('div', 'gantt-detail-icons');

      function slot(className, node) {
        var cell = el('span', 'gantt-detail-slot' + (className ? ' ' + className : ''));
        if (node) cell.appendChild(node);
        icons.appendChild(cell);
      }

      if (row.kind === 'card') {
        if (row.blocked) {
          slot('is-blocked', iconEl('ti-player-pause', 'Bloqu\u00e9', 'is-blocked'));
        } else {
          slot('is-blocked', null);
        }

        if (row.priorityEnabled !== false && row.priorityLabel) {
          var pTitle =
            row.priorityLabel +
            (row.priorityScore != null
              ? ' \u00b7 ' + Number(row.priorityScore).toFixed(1)
              : '');
          var pIcon = iconEl('ti-flame', pTitle, 'is-priority');
          if (row.priorityFill) pIcon.style.color = row.priorityFill;
          slot('is-priority', pIcon);
        } else {
          slot('is-priority', null);
        }

        var pct = Math.round(row.progress || 0);
        var progText = el('span', 'gantt-progress-text', {
          text: pct + '%',
          title: 'Progr\u00e8s ' + pct + '%',
        });
        slot('is-progress', progText);

        if (row.categoryIcon || row.category) {
          var ti =
            STATUT_TABLER[row.categoryIcon] ||
            STATUT_TABLER.dot ||
            'ti-point-filled';
          var sIcon = iconEl(
            ti,
            row.categoryLabel || row.category || 'Statut',
            'is-statut'
          );
          if (row.color) sIcon.style.color = row.color;
          slot('is-statut', sIcon);
        } else {
          slot('is-statut', null);
        }

        if (row.duePast) {
          slot(
            'is-overdue',
            iconEl(
              'ti-box',
              row.dueCountdown || 'En retard',
              'is-overdue'
            )
          );
        } else if (row.dueCountdown) {
          slot(
            'is-due',
            iconEl('ti-calendar-event', row.dueCountdown, 'is-due')
          );
        } else {
          slot('is-due', null);
        }

        if (row.subtaskCount > 0) {
          var sub = iconEl(
            'ti-list-check',
            row.subtaskCount + ' sous-t\u00e2che(s)',
            'is-subtasks'
          );
          sub.appendChild(
            el('span', 'gantt-icon-label', { text: String(row.subtaskCount) })
          );
          slot('is-subtasks', sub);
        } else {
          slot('is-subtasks', null);
        }
      } else {
        slot('is-blocked', null);
        slot('is-priority', null);
        var localPct = Math.round(row.progress || 0);
        slot(
          'is-progress',
          el('span', 'gantt-progress-text', {
            text: localPct + '%',
            title: 'Progr\u00e8s ' + localPct + '%',
          })
        );
        slot('is-statut', null);
        slot('is-due', null);
        slot('is-subtasks', null);
      }

      return icons;
    }

    function selectedRows() {
      var rows = visibleRows();
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i] && state.selected[rows[i].id]) out.push(rows[i]);
      }
      return out;
    }

    function selectedCount() {
      return selectedRows().length;
    }

    function clearSelection() {
      state.selected = Object.create(null);
      renderBulkBar();
      renderChart();
    }

    function toggleSelected(rowId, on) {
      if (on) state.selected[rowId] = true;
      else delete state.selected[rowId];
      renderBulkBar();
    }

    function runBulk(op) {
      var rows = selectedRows().filter(canEditSubtask);
      if (!rows.length) {
        setStatus('Aucune sous-t\u00e2che s\u00e9lectionn\u00e9e pour cette action', true);
        return;
      }
      if (state.saving) return;

      if (op === 'delete') {
        var ok = true;
        try {
          ok = global.confirm
            ? global.confirm(
                'Supprimer ' + rows.length + ' sous-t\u00e2che(s)\u00a0?'
              )
            : true;
        } catch (e) {
          ok = true;
        }
        if (!ok) return;
      }

      state.saving = true;
      setStatus(
        op === 'delete'
          ? 'Suppression\u2026'
          : op === 'done'
            ? 'Marquage termin\u00e9\u2026'
            : 'R\u00e9ouverture\u2026'
      );

      var chain = Promise.resolve();
      var failed = 0;
      rows.forEach(function (row) {
        chain = chain.then(function () {
          if (op === 'delete') {
            return ganttTrello.deleteSubtask(t, subtaskMeta(row)).then(function (res) {
              if (!res || !res.ok) failed += 1;
            });
          }
          return ganttTrello
            .setSubtaskDone(t, subtaskMeta(row), op === 'done')
            .then(function (res) {
              if (!res || !res.ok) failed += 1;
            });
        });
      });

      chain
        .then(function () {
          state.saving = false;
          state.selected = Object.create(null);
          if (failed) {
            setStatus(failed + ' \u00e9chec(s)', true);
          } else {
            setStatus(
              op === 'delete'
                ? 'Sous-t\u00e2ches supprim\u00e9es'
                : op === 'done'
                  ? 'Sous-t\u00e2ches termin\u00e9es'
                  : 'Sous-t\u00e2ches rouvertes'
            );
          }
          return reload();
        })
        .catch(function (err) {
          state.saving = false;
          setStatus(
            'Erreur\u00a0: ' + (err && err.message ? err.message : String(err)),
            true
          );
          return reload();
        });
    }

    function makeIconBtn(className, iconClass, label, onClick) {
      var btn = el('button', className, { type: 'button', title: label });
      var icon = el('i', 'ti ' + iconClass);
      icon.setAttribute('aria-hidden', 'true');
      btn.appendChild(icon);
      btn.appendChild(document.createTextNode(label));
      btn.addEventListener('click', onClick);
      return btn;
    }

    function renderBulkBar() {
      bulkBar.innerHTML = '';
      var n = selectedCount();
      if (!n) {
        bulkBar.classList.remove('is-visible');
        return;
      }
      bulkBar.classList.add('is-visible');
      bulkBar.appendChild(
        el('span', 'gantt-bulk-count', {
          text: n + ' s\u00e9lectionn\u00e9e(s)',
        })
      );

      bulkBar.appendChild(
        makeIconBtn('gantt-btn', 'ti-circle-check', 'Terminer', function () {
          runBulk('done');
        })
      );
      bulkBar.appendChild(
        makeIconBtn('gantt-btn', 'ti-reload', 'Rouvrir', function () {
          runBulk('reopen');
        })
      );
      bulkBar.appendChild(
        makeIconBtn(
          'gantt-btn gantt-btn--danger',
          'ti-trash',
          'Supprimer',
          function () {
            runBulk('delete');
          }
        )
      );
      bulkBar.appendChild(
        makeIconBtn(
          'gantt-btn',
          'ti-deselect',
          'Tout d\u00e9s\u00e9lectionner',
          function () {
            clearSelection();
          }
        )
      );
    }

    function canEditSubtask(row) {
      if (!row) return false;
      if (row.kind === 'local' && row.parentCardId && row.itemId) return true;
      if (
        row.kind === 'checklist' &&
        row.parentCardId &&
        row.parentItemId &&
        row.itemId
      ) {
        return true;
      }
      if (row.kind === 'card' && row.linkParentCardId && row.cardId) return true;
      return false;
    }

    function subtaskMeta(row) {
      return {
        kind: row.kind,
        parentCardId: row.parentCardId || null,
        itemId: row.itemId || null,
        parentItemId: row.parentItemId || null,
        cardId: row.cardId || null,
        linkParentCardId: row.linkParentCardId || null,
        linkItemId: row.linkItemId || null,
      };
    }

    function toggleSubtaskDone(row) {
      if (state.saving || !canEditSubtask(row)) return;
      state.saving = true;
      var nextDone = !row.done;
      setStatus(nextDone ? 'Marquage termin\u00e9\u2026' : 'R\u00e9ouverture\u2026');
      ganttTrello
        .setSubtaskDone(t, subtaskMeta(row), nextDone)
        .then(function (res) {
          state.saving = false;
          if (!res || !res.ok) {
            setStatus(
              '\u00c9chec' +
                (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
            return reload();
          }
          setStatus(nextDone ? 'Sous-t\u00e2che termin\u00e9e' : 'Sous-t\u00e2che rouverte');
          return reload();
        })
        .catch(function (err) {
          state.saving = false;
          setStatus(
            'Erreur\u00a0: ' + (err && err.message ? err.message : String(err)),
            true
          );
          return reload();
        });
    }

    function deleteSubtaskRow(row) {
      if (state.saving || !canEditSubtask(row)) return;
      var label = row.name || 'cette sous-t\u00e2che';
      var ok = true;
      try {
        ok = global.confirm
          ? global.confirm('Supprimer \u00ab\u00a0' + label + '\u00a0\u00bb\u00a0?')
          : true;
      } catch (e) {
        ok = true;
      }
      if (!ok) return;
      state.saving = true;
      setStatus('Suppression\u2026');
      ganttTrello
        .deleteSubtask(t, subtaskMeta(row))
        .then(function (res) {
          state.saving = false;
          if (!res || !res.ok) {
            setStatus(
              '\u00c9chec suppression' +
                (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
            return reload();
          }
          setStatus('Sous-t\u00e2che supprim\u00e9e');
          return reload();
        })
        .catch(function (err) {
          state.saving = false;
          setStatus(
            'Erreur\u00a0: ' + (err && err.message ? err.message : String(err)),
            true
          );
          return reload();
        });
    }

    function commitRename(row, nextName) {
      var trimmed = typeof nextName === 'string' ? nextName.trim() : '';
      if (!trimmed || trimmed === row.name) {
        renderChart();
        return;
      }
      if (state.saving || !canEditSubtask(row)) return;
      state.saving = true;
      setStatus('Renommage\u2026');
      ganttTrello
        .renameSubtask(t, subtaskMeta(row), trimmed)
        .then(function (res) {
          state.saving = false;
          if (!res || !res.ok) {
            setStatus(
              '\u00c9chec renommage' +
                (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
            return reload();
          }
          row.name = res.name || trimmed;
          setStatus('Sous-t\u00e2che renomm\u00e9e');
          return reload();
        })
        .catch(function (err) {
          state.saving = false;
          setStatus(
            'Erreur\u00a0: ' + (err && err.message ? err.message : String(err)),
            true
          );
          return reload();
        });
    }

    function startInlineRename(row, nameEl) {
      if (state.saving || !canEditSubtask(row) || !nameEl || !nameEl.parentNode) {
        return;
      }
      var input = el('input', 'gantt-rename-input', {
        type: 'text',
        maxlength: '500',
      });
      input.value = row.name || '';
      input.setAttribute('aria-label', 'Renommer la sous-t\u00e2che');
      var finished = false;

      function finish(save) {
        if (finished) return;
        finished = true;
        var value = input.value;
        if (save) commitRename(row, value);
        else renderChart();
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      });
      input.addEventListener('blur', function () {
        finish(true);
      });

      nameEl.parentNode.replaceChild(input, nameEl);
      input.focus();
      input.select();
    }

    function buildSubtaskActions(row) {
      var actions = el('div', 'gantt-row-actions');
      var editable = canEditSubtask(row);

      var doneBtn = el(
        'button',
        'gantt-action-btn gantt-action-btn--done' + (row.done ? ' is-on' : ''),
        {
          type: 'button',
          title: row.done
            ? 'Marquer non termin\u00e9'
            : 'Marquer termin\u00e9',
        }
      );
      doneBtn.innerHTML =
        '<i class="ti ' +
        (row.done ? 'ti-circle-check' : 'ti-check') +
        '" aria-hidden="true"></i>';
      if (!editable) {
        doneBtn.disabled = true;
        doneBtn.classList.add('is-disabled');
      } else {
        doneBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          toggleSubtaskDone(row);
        });
      }
      actions.appendChild(doneBtn);

      var renameBtn = el('button', 'gantt-action-btn gantt-action-btn--rename', {
        type: 'button',
        title: 'Renommer',
        text: '\u270e',
      });
      if (!editable) {
        renameBtn.disabled = true;
        renameBtn.classList.add('is-disabled');
      } else {
        renameBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var nameEl = renameBtn
            .closest('.gantt-label-cell')
            .querySelector('.gantt-task-name');
          startInlineRename(row, nameEl);
        });
      }
      actions.appendChild(renameBtn);

      var delBtn = el('button', 'gantt-action-btn gantt-action-btn--delete', {
        type: 'button',
        title:
          row.kind === 'card'
            ? 'Retirer le lien'
            : 'Supprimer la sous-t\u00e2che',
      });
      delBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
      if (!editable) {
        delBtn.disabled = true;
        delBtn.classList.add('is-disabled');
      } else {
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          deleteSubtaskRow(row);
        });
      }
      actions.appendChild(delBtn);

      return actions;
    }

    function applyIntervalToRow(row, interval) {
      var parts = model.intervalToParts(interval);
      row.startDate = parts.startDate;
      row.dueDate = parts.dueDate;
      if (row.cardId && state.cardsById[row.cardId]) {
        state.cardsById[row.cardId].startDate = parts.startDate;
        state.cardsById[row.cardId].dueDate = parts.dueDate;
      }
    }

    function persistRow(row) {
      if (!row || row.kind !== 'card' || !row.cardId) return Promise.resolve();
      state.saving = true;
      setStatus('Enregistrement\u2026');
      return ganttTrello
        .saveCardDates(t, row.cardId, {
          startDate: row.startDate,
          dueDate: row.dueDate,
          dueTime:
            (state.cardsById[row.cardId] &&
              state.cardsById[row.cardId].dueTime) ||
            '',
        })
        .then(function (res) {
          state.saving = false;
          if (!res || !res.ok) {
            var reason = (res && res.reason) || 'error';
            if (reason === 'auth-failed' || reason === 'not-authorized') {
              state.authHint =
                'Autorisez l\u2019acc\u00e8s Trello pour enregistrer les dates.';
              setStatus(state.authHint, true);
            } else {
              setStatus('\u00c9chec enregistrement (' + reason + ')', true);
            }
            return reload();
          }
          setStatus('Dates enregistr\u00e9es');
          var outlookSync = OS();
          if (
            state.outlookConnected &&
            outlookSync &&
            typeof outlookSync.scheduleSyncCard === 'function'
          ) {
            outlookSync.scheduleSyncCard(t, row.cardId);
          }
          setTimeout(function () {
            if (!state.saving) setStatus('');
          }, 1500);
          return res;
        })
        .catch(function (err) {
          state.saving = false;
          setStatus(
            'Erreur\u00a0: ' + (err && err.message ? err.message : String(err)),
            true
          );
          return reload();
        });
    }

    function dateAtTimelineX(timeRow, clientX) {
      var rect = timeRow.getBoundingClientRect();
      var x = clientX - rect.left;
      var d = model.xToDate(x, range(), state.timelineWidth);
      return model.snapDate(d, state.viewMode);
    }

    function orderedInterval(a, b) {
      if (!a || !b) return null;
      if (a.getTime() <= b.getTime()) return { start: a, end: b };
      return { start: b, end: a };
    }

    function placeGhost(ghostEl, interval) {
      var geo = model.barGeometry(interval, range(), state.timelineWidth);
      if (!geo || !geo.visible) {
        ghostEl.hidden = true;
        return;
      }
      ghostEl.hidden = false;
      ghostEl.style.left = geo.left + 'px';
      ghostEl.style.width = geo.width + 'px';
    }

    function bindTimelinePaint(timeRow, row) {
      if (row.kind !== 'card' || !row.cardId) return;
      timeRow.classList.add('is-paintable');
      timeRow.title = 'Cliquer ou glisser pour d\u00e9finir une dur\u00e9e';

      var ghost = el('div', 'gantt-paint-ghost');
      ghost.hidden = true;
      timeRow.appendChild(ghost);

      timeRow.addEventListener('pointermove', function (ev) {
        if (state.paint || state.drag || state.saving) return;
        var d = dateAtTimelineX(timeRow, ev.clientX);
        if (!d) {
          ghost.hidden = true;
          return;
        }
        placeGhost(ghost, { start: d, end: d });
      });

      timeRow.addEventListener('pointerleave', function () {
        if (state.paint) return;
        ghost.hidden = true;
      });

      timeRow.addEventListener('pointerdown', function (ev) {
        if (ev.button != null && ev.button !== 0) return;
        if (state.saving || state.drag || state.paint) return;
        if (ev.target && ev.target.closest && ev.target.closest('.gantt-bar')) {
          return;
        }
        var origin = dateAtTimelineX(timeRow, ev.clientX);
        if (!origin) return;
        ev.preventDefault();
        ev.stopPropagation();

        state.paint = {
          row: row,
          origin: origin,
          current: origin,
          pointerId: ev.pointerId,
        };
        timeRow.classList.add('is-painting');
        placeGhost(ghost, { start: origin, end: origin });
        timeRow.setPointerCapture(ev.pointerId);

        function onMove(e) {
          if (!state.paint) return;
          var cur = dateAtTimelineX(timeRow, e.clientX);
          if (!cur) return;
          state.paint.current = cur;
          var iv = orderedInterval(state.paint.origin, cur);
          if (iv) placeGhost(ghost, iv);
        }

        function onUp() {
          timeRow.releasePointerCapture(ev.pointerId);
          timeRow.removeEventListener('pointermove', onMove);
          timeRow.removeEventListener('pointerup', onUp);
          timeRow.removeEventListener('pointercancel', onUp);
          timeRow.classList.remove('is-painting');
          var paint = state.paint;
          state.paint = null;
          ghost.hidden = true;
          if (!paint) return;
          var iv = orderedInterval(paint.origin, paint.current);
          if (!iv) return;
          applyIntervalToRow(row, iv);
          applySort();
          renderChart();
          persistRow(row);
        }

        timeRow.addEventListener('pointermove', onMove);
        timeRow.addEventListener('pointerup', onUp);
        timeRow.addEventListener('pointercancel', onUp);
      });
    }

    function bindBarDrag(barEl, row, interval) {
      if (row.kind !== 'card' || !row.cardId) return;

      function onPointerDown(ev) {
        if (ev.button != null && ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();

        var rect = barEl.getBoundingClientRect();
        var localX = ev.clientX - rect.left;
        var mode = 'move';
        if (localX <= EDGE_PX) mode = 'start';
        else if (localX >= rect.width - EDGE_PX) mode = 'end';

        var r = range();
        var startX = ev.clientX;
        var origin = {
          start: interval.start,
          end: interval.end,
        };
        state.drag = {
          row: row,
          mode: mode,
          origin: origin,
          startX: startX,
          range: r,
          width: state.timelineWidth,
          pointerId: ev.pointerId,
        };
        barEl.classList.add('is-dragging');
        barEl.setPointerCapture(ev.pointerId);

        function onMove(e) {
          if (!state.drag) return;
          var dx = e.clientX - state.drag.startX;
          var dayDelta = Math.round(
            (dx / state.drag.width) * model.rangeDayCount(state.drag.range)
          );
          var next;
          if (state.drag.mode === 'move') {
            next = model.shiftInterval(state.drag.origin, dayDelta);
          } else {
            next = model.resizeInterval(
              state.drag.origin,
              state.drag.mode === 'start' ? 'start' : 'end',
              dayDelta
            );
          }
          if (!next) return;
          next = {
            start: model.snapDate(next.start, state.viewMode),
            end: model.snapDate(next.end, state.viewMode),
          };
          if (next.end.getTime() < next.start.getTime()) {
            if (state.drag.mode === 'start') next.start = next.end;
            else next.end = next.start;
          }
          applyIntervalToRow(row, next);
          updateBarEl(barEl, row, next);
        }

        function onUp() {
          barEl.releasePointerCapture(ev.pointerId);
          barEl.removeEventListener('pointermove', onMove);
          barEl.removeEventListener('pointerup', onUp);
          barEl.removeEventListener('pointercancel', onUp);
          barEl.classList.remove('is-dragging');
          var drag = state.drag;
          state.drag = null;
          if (!drag) return;
          var finalInterval = model.resolveBarInterval(row);
          if (
            finalInterval &&
            (model.toIsoDate(finalInterval.start) !==
              model.toIsoDate(drag.origin.start) ||
              model.toIsoDate(finalInterval.end) !==
                model.toIsoDate(drag.origin.end))
          ) {
            persistRow(row);
          }
        }

        barEl.addEventListener('pointermove', onMove);
        barEl.addEventListener('pointerup', onUp);
        barEl.addEventListener('pointercancel', onUp);
      }

      barEl.addEventListener('pointerdown', onPointerDown);
    }

    function updateBarEl(barEl, row, interval) {
      var r = range();
      var geo = model.barGeometry(interval, r, state.timelineWidth);
      if (!geo || !geo.visible) {
        barEl.style.display = 'none';
        return;
      }
      barEl.style.display = '';
      barEl.style.left = geo.left + 'px';
      barEl.style.width = geo.width + 'px';
      var fill = barEl.querySelector('.gantt-bar-fill');
      if (fill) {
        fill.style.width = Math.max(0, Math.min(100, row.progress || 0)) + '%';
      }
    }

    function renderChart() {
      body.innerHTML = '';
      if (state.loading) {
        body.appendChild(el('div', 'gantt-empty', { text: 'Chargement\u2026' }));
        return;
      }
      if (state.error) {
        body.appendChild(el('div', 'gantt-empty is-error', { text: state.error }));
        return;
      }

      var r = range();
      var rows = visibleRows();
      var chart = el('div', 'gantt-chart');
      var labelsCol = el('div', 'gantt-labels');
      var timelineCol = el('div', 'gantt-timeline');
      var dayCount = model.rangeDayCount(r);
      var dayW = state.timelineWidth / Math.max(1, dayCount);
      timelineCol.style.setProperty('--gantt-day-w', dayW + 'px');
      timelineCol.style.width = state.timelineWidth + 'px';

      var headerLabels = el('div', 'gantt-row gantt-row--header');
      var headerCell = el('div', 'gantt-label-cell gantt-label-cell--header');
      var selectAll = el('input', 'gantt-select-box', { type: 'checkbox' });
      selectAll.title = 'Tout s\u00e9lectionner / d\u00e9s\u00e9lectionner';
      var visibleForSelect = rows;
      var selectedVisible = 0;
      for (var vi = 0; vi < visibleForSelect.length; vi++) {
        if (
          visibleForSelect[vi] &&
          visibleForSelect[vi].id &&
          state.selected[visibleForSelect[vi].id]
        ) {
          selectedVisible++;
        }
      }
      selectAll.checked =
        visibleForSelect.length > 0 &&
        selectedVisible === visibleForSelect.length;
      selectAll.indeterminate =
        selectedVisible > 0 && selectedVisible < visibleForSelect.length;
      selectAll.addEventListener('change', function () {
        var on = !!selectAll.checked;
        var list = visibleRows();
        state.selected = Object.create(null);
        if (on) {
          for (var si = 0; si < list.length; si++) {
            if (list[si] && list[si].id) state.selected[list[si].id] = true;
          }
        }
        renderBulkBar();
        renderChart();
      });
      headerCell.appendChild(selectAll);
      headerCell.appendChild(el('span', 'gantt-twist-spacer'));
      headerCell.appendChild(el('span', 'gantt-header-title', { text: 'T\u00e2ches' }));
      headerCell.appendChild(el('span', 'gantt-detail-icons gantt-detail-icons--header'));
      headerCell.appendChild(el('span', 'gantt-row-actions gantt-row-actions--header'));
      headerLabels.appendChild(headerCell);
      labelsCol.appendChild(headerLabels);

      var headerTimeline = el('div', 'gantt-row gantt-row--header gantt-timeline-header');
      headerTimeline.style.width = state.timelineWidth + 'px';
      r.columns.forEach(function (col) {
        var cell = el('div', 'gantt-col-head', { text: col.label });
        cell.style.width = 100 / r.columns.length + '%';
        headerTimeline.appendChild(cell);
      });
      timelineCol.appendChild(headerTimeline);

      // Today marker
      var todayDate = model.startOfDay(new Date());
      if (
        todayDate.getTime() >= r.start.getTime() &&
        todayDate.getTime() <= r.end.getTime()
      ) {
        var todayX = model.dateToX(todayDate, r, state.timelineWidth);
        var marker = el('div', 'gantt-today-line');
        marker.style.left = todayX + 'px';
        timelineCol.appendChild(marker);
      }

      if (!rows.length) {
        var empty = el('div', 'gantt-empty', {
          text: 'Aucune t\u00e2che \u00e0 afficher.',
        });
        body.appendChild(empty);
        return;
      }

      rows.forEach(function (row, rowIndex) {
        var oddClass = rowIndex % 2 === 1 ? ' is-odd' : '';
        var labelRow = el(
          'div',
          'gantt-row' +
            oddClass +
            (state.selected[row.id] ? ' is-selected' : '')
        );
        labelRow.style.height = ROW_H + 'px';
        var labelCell = el('div', 'gantt-label-cell');
        labelCell.style.setProperty('--gantt-depth', String(row.depth || 0));

        var sel = el('input', 'gantt-select-box', { type: 'checkbox' });
        sel.checked = !!state.selected[row.id];
        sel.title = 'S\u00e9lectionner';
        sel.addEventListener('click', function (e) {
          e.stopPropagation();
        });
        sel.addEventListener('change', function () {
          toggleSelected(row.id, !!sel.checked);
          labelRow.classList.toggle('is-selected', !!sel.checked);
          renderBulkBar();
        });
        labelCell.appendChild(sel);

        if (row.expandable) {
          var isOpen =
            state.expanded[row.id] === true ||
            (state.expanded[row.id] == null && row.depth === 0);
          var twist = el('button', 'gantt-twist', {
            type: 'button',
            text: isOpen ? '\u25be' : '\u25b8',
          });
          twist.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleExpand(row.id);
          });
          labelCell.appendChild(twist);
        } else {
          labelCell.appendChild(el('span', 'gantt-twist-spacer'));
        }

        var nameBtn = el(
          'button',
          'gantt-task-name' +
            (row.kind === 'card' ? ' is-card' : '') +
            (canEditSubtask(row) ? ' is-renamable' : '') +
            (row.done ? ' is-done' : ''),
          { type: 'button', text: row.name }
        );
        if (row.kind === 'card' && row.cardId) {
          nameBtn.addEventListener('click', function () {
            openCard(row.cardId, row.name);
          });
        }
        if (canEditSubtask(row) && row.kind !== 'card') {
          nameBtn.title = 'Double-clic pour renommer';
          nameBtn.addEventListener('dblclick', function (e) {
            e.preventDefault();
            e.stopPropagation();
            startInlineRename(row, nameBtn);
          });
        }
        labelCell.appendChild(nameBtn);

        labelCell.appendChild(buildDetailIcons(row));
        labelCell.appendChild(buildSubtaskActions(row));

        labelRow.appendChild(labelCell);
        labelsCol.appendChild(labelRow);

        var timeRow = el(
          'div',
          'gantt-row gantt-timeline-row' + oddClass
        );
        timeRow.style.height = ROW_H + 'px';
        timeRow.style.width = state.timelineWidth + 'px';

        var interval = model.resolveBarInterval(row);
        var hasVisibleBar = false;
        if (interval) {
          var geo = model.barGeometry(interval, r, state.timelineWidth);
          if (geo && geo.visible) {
            hasVisibleBar = true;
            var bar = el('div', 'gantt-bar');
            if (row.kind === 'card') bar.classList.add('is-editable');
            bar.style.left = geo.left + 'px';
            bar.style.width = geo.width + 'px';
            bar.style.backgroundColor = row.color || 'var(--tp-primary, #0c66e4)';
            if (row.category) bar.setAttribute('data-category', row.category);
            bar.title =
              (row.name || '') +
              ' \u00b7 ' +
              model.toIsoDate(interval.start) +
              ' \u2192 ' +
              model.toIsoDate(interval.end);

            var fill = el('div', 'gantt-bar-fill');
            fill.style.width = Math.max(0, Math.min(100, row.progress || 0)) + '%';
            bar.appendChild(fill);

            var label = el('span', 'gantt-bar-label', {
              text: Math.round(row.progress || 0) + '%',
            });
            bar.appendChild(label);

            if (row.kind === 'card') {
              bar.appendChild(el('span', 'gantt-bar-edge gantt-bar-edge--start'));
              bar.appendChild(el('span', 'gantt-bar-edge gantt-bar-edge--end'));
              bindBarDrag(bar, row, interval);
            }

            timeRow.appendChild(bar);
          }
        }

        if (row.kind === 'card' && row.cardId && !hasVisibleBar) {
          bindTimelinePaint(timeRow, row);
        }

        timelineCol.appendChild(timeRow);
      });

      chart.appendChild(labelsCol);
      var scroll = el('div', 'gantt-timeline-scroll');
      scroll.appendChild(timelineCol);
      chart.appendChild(scroll);
      body.appendChild(chart);

      // Measure available width once (or when viewport changed a lot).
      requestAnimationFrame(function () {
        var avail = scroll.clientWidth || MIN_TIMELINE_W;
        var nextW = Math.max(MIN_TIMELINE_W, avail);
        if (!state.widthMeasured || Math.abs(nextW - state.timelineWidth) > 48) {
          state.widthMeasured = true;
          if (Math.abs(nextW - state.timelineWidth) > 8) {
            state.timelineWidth = nextW;
            renderChart();
          }
        }
      });
    }

    function render() {
      renderToolbar();
      renderChart();
      if (typeof t.sizeTo === 'function') {
        try {
          t.sizeTo(document.body);
        } catch (e) {
          /* ignore */
        }
      }
    }

    function reload(options) {
      options = options || {};
      state.loading = true;
      state.error = '';
      setStatus('Chargement du tableau\u2026');
      render();
      return ganttTrello
        .loadBoard(t)
        .then(function (data) {
          state.loading = false;
          state.tree = (data && data.tree) || [];
          applySort();
          state.cardsById = Object.create(null);
          var cards = (data && data.cards) || [];
          for (var i = 0; i < cards.length; i++) {
            if (cards[i] && cards[i].id) {
              state.cardsById[cards[i].id] = cards[i];
            }
          }
          // Drop selections for rows that no longer exist.
          var still = Object.create(null);
          var flat = model.flattenVisible(state.tree, state.expanded);
          for (var fi = 0; fi < flat.length; fi++) {
            if (flat[fi] && state.selected[flat[fi].id]) {
              still[flat[fi].id] = true;
            }
          }
          state.selected = still;
          setStatus(cards.length + ' carte(s)');
          renderBulkBar();
          render();
          return refreshOutlookConnected().then(function (connected) {
            renderToolbar();
            if (
              options.syncOutlook &&
              connected &&
              !state.outlookSyncing
            ) {
              return runOutlookSync();
            }
          });
        })
        .catch(function (err) {
          state.loading = false;
          state.error =
            'Impossible de charger le Gantt\u00a0: ' +
            (err && err.message ? err.message : String(err));
          setStatus(state.error, true);
          render();
        });
    }

    // Auth button in status when needed
    statusBar.addEventListener('click', function () {
      if (!state.authHint) return;
      ganttTrello.ensureRestAuthorized(t).then(function (res) {
        if (res && res.ok) {
          state.authHint = '';
          setStatus('');
        }
      });
    });

    refreshOutlookConnected().then(function () {
      renderToolbar();
      reload({ syncOutlook: true });
    });

    return {
      destroy: function () {
        mount.innerHTML = '';
      },
      reload: reload,
      getState: function () {
        return state;
      },
    };
  }

  global.GanttUI = {
    mountGantt: mountGantt,
  };
})(typeof window !== 'undefined' ? window : this);
