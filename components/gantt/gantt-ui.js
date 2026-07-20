/* Gantt chart UI — toolbar, rows, bars, drag/resize. */
(function (global) {
  'use strict';

  var ROW_H = 40;
  var LABEL_W = 240;
  var EDGE_PX = 6;
  var MIN_TIMELINE_W = 640;
  var LABELS_W_MIN = 280;
  var LABELS_W_DEFAULT = 560;
  var LABELS_W_STORAGE_KEY = 'tp-gantt-labels-width';
  var FILTERS_STORAGE_KEY = 'tp-gantt-filters';
  var DEFAULT_FILTERS = {
    hideCompleted: true,
    hideUndated: false,
    hideBlocked: false,
    sortBy: 'date',
    sortDir: 'asc',
  };
  // Priority dot for tiers strictly above Importante (Critique / Urgente / Prioritaire).
  var PRIORITY_FIRE_TIER_MAX = 2;

  function GM() {
    return global.GanttModel;
  }

  function GT() {
    return global.GanttTrello;
  }

  function playGanttUiSound(name, opts) {
    try {
      if (
        global.CelebrationEffects &&
        typeof global.CelebrationEffects.playUiSound === 'function'
      ) {
        return global.CelebrationEffects.playUiSound(name, opts || {});
      }
    } catch (e) {
      /* ignore */
    }
    return { ok: false };
  }

  function PU() {
    return global.PriorityUI;
  }

  function TC() {
    return global.TpConfirm || null;
  }

  function OA() {
    return global.OutlookAuth || null;
  }

  function OS() {
    return global.OutlookSync || null;
  }

  function OI() {
    return global.OutlookIcs || null;
  }

  function readStoredLabelsWidth() {
    try {
      var raw =
        global.localStorage && global.localStorage.getItem(LABELS_W_STORAGE_KEY);
      var n = raw != null ? parseInt(raw, 10) : NaN;
      if (isFinite(n) && n >= LABELS_W_MIN && n <= 1200) return n;
    } catch (e) {
      /* ignore */
    }
    return LABELS_W_DEFAULT;
  }

  function storeLabelsWidth(w) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(LABELS_W_STORAGE_KEY, String(w));
      }
    } catch (e) {
      /* ignore */
    }
  }

  function normalizeSortBy(value) {
    var model = GM();
    if (model && typeof model.normalizeSortBy === 'function') {
      return model.normalizeSortBy(value);
    }
    return value === 'priority' ||
      value === 'name' ||
      value === 'progress' ||
      value === 'subtasks'
      ? value
      : 'date';
  }

  function normalizeSortDir(value, sortBy) {
    if (value === 'asc' || value === 'desc') return value;
    var model = GM();
    if (model && typeof model.defaultSortDir === 'function') {
      return model.defaultSortDir(sortBy);
    }
    return sortBy === 'progress' || sortBy === 'subtasks' ? 'desc' : 'asc';
  }

  function readStoredFilters() {
    var out = {
      hideCompleted: DEFAULT_FILTERS.hideCompleted,
      hideUndated: DEFAULT_FILTERS.hideUndated,
      hideBlocked: DEFAULT_FILTERS.hideBlocked,
      sortBy: DEFAULT_FILTERS.sortBy,
      sortDir: DEFAULT_FILTERS.sortDir,
    };
    try {
      var raw =
        global.localStorage && global.localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) return out;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return out;
      if (typeof parsed.hideCompleted === 'boolean') {
        out.hideCompleted = parsed.hideCompleted;
      }
      if (typeof parsed.hideUndated === 'boolean') {
        out.hideUndated = parsed.hideUndated;
      }
      if (typeof parsed.hideBlocked === 'boolean') {
        out.hideBlocked = parsed.hideBlocked;
      }
      if (typeof parsed.sortBy === 'string') {
        out.sortBy = normalizeSortBy(parsed.sortBy);
      }
      if (typeof parsed.sortDir === 'string') {
        out.sortDir = normalizeSortDir(parsed.sortDir, out.sortBy);
      } else {
        out.sortDir = normalizeSortDir(null, out.sortBy);
      }
    } catch (e) {
      /* ignore */
    }
    return out;
  }

  function storeFilters(filters) {
    filters = filters || {};
    var sortBy = normalizeSortBy(filters.sortBy);
    var payload = {
      hideCompleted:
        typeof filters.hideCompleted === 'boolean'
          ? filters.hideCompleted
          : DEFAULT_FILTERS.hideCompleted,
      hideUndated:
        typeof filters.hideUndated === 'boolean'
          ? filters.hideUndated
          : DEFAULT_FILTERS.hideUndated,
      hideBlocked:
        typeof filters.hideBlocked === 'boolean'
          ? filters.hideBlocked
          : DEFAULT_FILTERS.hideBlocked,
      sortBy: sortBy,
      sortDir: normalizeSortDir(filters.sortDir, sortBy),
    };
    try {
      if (global.localStorage) {
        global.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload));
      }
    } catch (e) {
      /* ignore */
    }
    return payload;
  }

  /**
   * Clamp labels column width. `chartWidthOrEl` may be a pixel number or an element with clientWidth.
   */
  function clampLabelsWidth(width, chartWidthOrEl) {
    var chartW = 1000;
    if (typeof chartWidthOrEl === 'number' && chartWidthOrEl > 0) {
      chartW = chartWidthOrEl;
    } else if (chartWidthOrEl && chartWidthOrEl.clientWidth) {
      chartW = chartWidthOrEl.clientWidth;
    }
    var max = Math.max(LABELS_W_MIN, chartW - 220);
    var w = Math.round(Number(width) || LABELS_W_DEFAULT);
    return Math.max(LABELS_W_MIN, Math.min(max, w));
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

  function iconButton(tiClass, title, extraClass) {
    var wrap = el(
      'button',
      'gantt-detail-icon gantt-detail-icon--btn' +
        (extraClass ? ' ' + extraClass : ''),
      { type: 'button', title: title || '' }
    );
    if (title) wrap.setAttribute('aria-label', title);
    var i = el('i', 'ti ' + tiClass);
    i.setAttribute('aria-hidden', 'true');
    wrap.appendChild(i);
    return wrap;
  }

  function priorityDotEl(title, fill, muted) {
    var wrap = el(
      'button',
      'gantt-detail-icon gantt-detail-icon--btn is-priority' +
        (muted ? ' is-priority-muted' : ''),
      { type: 'button', title: title || 'Priorit\u00e9' }
    );
    wrap.setAttribute('aria-label', title || 'Priorit\u00e9');
    var dot = el('span', 'gantt-priority-dot');
    dot.setAttribute('aria-hidden', 'true');
    if (fill) dot.style.backgroundColor = fill;
    wrap.appendChild(dot);
    return wrap;
  }

  function priorityFireTierMax() {
    var ui = PU();
    if (ui && ui.TIER_I && typeof ui.TIER_I.IMPORTANTE === 'number') {
      return ui.TIER_I.IMPORTANTE - 1;
    }
    return PRIORITY_FIRE_TIER_MAX;
  }

  function shouldShowPriorityFire(row) {
    if (!row || row.priorityEnabled === false) return false;
    if (row.priorityTierI == null || !isFinite(Number(row.priorityTierI))) {
      return false;
    }
    return Number(row.priorityTierI) <= priorityFireTierMax();
  }

  function mountGantt(mount, t, options) {
    options = options || {};
    var model = GM();
    var ganttTrello = GT();
    if (!model || !ganttTrello) {
      mount.textContent = 'Gantt modules missing.';
      return { destroy: function () {} };
    }

    var storedFilters = readStoredFilters();
    var state = {
      viewMode: 'week',
      anchor: model.toIsoDate(new Date()),
      tree: [],
      cardsById: Object.create(null),
      expanded: Object.create(null),
      selected: Object.create(null),
      hideCompleted: storedFilters.hideCompleted,
      hideUndated: storedFilters.hideUndated,
      hideBlocked: storedFilters.hideBlocked,
      sortBy: storedFilters.sortBy,
      sortDir: storedFilters.sortDir,
      loading: true,
      error: '',
      authHint: '',
      timelineWidth: MIN_TIMELINE_W,
      labelsWidth: readStoredLabelsWidth(),
      widthMeasured: false,
      drag: null,
      paint: null,
      splitDrag: null,
      saving: false,
      outlookConnected: false,
      outlookSyncing: false,
      cardOverlay: null,
      cardOverlayKeyHandler: null,
      miniPopover: null,
      miniPopoverKeyHandler: null,
      miniPopoverOutsideHandler: null,
      sectionDrag: null,
      suppressCardOpen: false,
      ganttSettings: {
        dayStart: model.DEFAULT_DAY_START || '08:15',
        dayEnd: model.DEFAULT_DAY_END || '16:45',
      },
    };

    function persistFilters() {
      storeFilters({
        hideCompleted: state.hideCompleted,
        hideUndated: state.hideUndated,
        hideBlocked: state.hideBlocked,
        sortBy: state.sortBy,
        sortDir: state.sortDir,
      });
    }

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

    function bindLabelsSplitter(splitter, labelsCol, chartEl, scrollEl) {
      splitter.addEventListener('pointerdown', function (ev) {
        if (ev.button != null && ev.button !== 0) return;
        if (state.splitDrag || state.drag || state.paint) return;
        ev.preventDefault();
        ev.stopPropagation();
        state.splitDrag = {
          startX: ev.clientX,
          startW: labelsCol.getBoundingClientRect().width || state.labelsWidth,
          pointerId: ev.pointerId,
        };
        splitter.classList.add('is-dragging');
        root.classList.add('is-resizing');
        splitter.setPointerCapture(ev.pointerId);

        function onMove(e) {
          if (!state.splitDrag) return;
          var next = clampLabelsWidth(
            state.splitDrag.startW + (e.clientX - state.splitDrag.startX),
            chartEl
          );
          state.labelsWidth = next;
          labelsCol.style.width = next + 'px';
        }

        function onUp() {
          splitter.releasePointerCapture(ev.pointerId);
          splitter.removeEventListener('pointermove', onMove);
          splitter.removeEventListener('pointerup', onUp);
          splitter.removeEventListener('pointercancel', onUp);
          splitter.classList.remove('is-dragging');
          root.classList.remove('is-resizing');
          state.splitDrag = null;
          state.labelsWidth = clampLabelsWidth(state.labelsWidth, chartEl);
          storeLabelsWidth(state.labelsWidth);
          labelsCol.style.width = state.labelsWidth + 'px';
          // Remeasure timeline so day grid matches the new calendar width.
          var avail = (scrollEl && scrollEl.clientWidth) || MIN_TIMELINE_W;
          var nextW = Math.max(MIN_TIMELINE_W, avail);
          if (Math.abs(nextW - state.timelineWidth) > 4) {
            state.timelineWidth = nextW;
            state.widthMeasured = true;
            renderChart();
          }
        }

        splitter.addEventListener('pointermove', onMove);
        splitter.addEventListener('pointerup', onUp);
        splitter.addEventListener('pointercancel', onUp);
      });
    }

    function setStatus(msg, isError) {
      statusBar.textContent = msg || '';
      statusBar.classList.toggle('is-error', !!isError);
    }

    function range() {
      return model.viewRange(state.viewMode, state.anchor);
    }

    function intervalOptions() {
      return {
        mode: state.viewMode,
        dayStart: state.ganttSettings.dayStart,
        dayEnd: state.ganttSettings.dayEnd,
      };
    }

    /** Day (Agenda) and Week timelines support begin/end times, not just dates. */
    function usesTimedTimeline() {
      return state.viewMode === 'day' || state.viewMode === 'week';
    }

    function formatIntervalTitle(interval) {
      if (!interval) return '';
      var start = model.toIsoDate(interval.start);
      var end = model.toIsoDate(interval.end);
      if (interval.hasTime && typeof model.toIsoTime === 'function') {
        start += ' ' + model.toIsoTime(interval.start);
        end += ' ' + model.toIsoTime(interval.end);
      }
      return start === end ? start : start + ' \u2192 ' + end;
    }

    function visibleRows() {
      var flat = model.flattenVisible(state.tree, state.expanded);
      var filtered = model.filterRows(flat, {
        hideCompleted: state.hideCompleted,
        hideUndated: state.hideUndated,
        hideBlocked: state.hideBlocked,
      });
      if (typeof model.pruneEmptyStateSections === 'function') {
        return model.pruneEmptyStateSections(filtered, state.expanded);
      }
      return filtered;
    }

    function renderToolbar() {
      toolbar.innerHTML = '';

      var zoom = el('div', 'gantt-zoom');
      [
        { mode: 'day', label: 'Agenda', icon: 'ti-calendar' },
        { mode: 'week', label: 'Semaine', icon: 'ti-calendar-week' },
        { mode: 'month', label: 'Mois', icon: 'ti-calendar-month' },
        { mode: 'year', label: 'Ann\u00e9e', icon: 'ti-calendar-stats' },
      ].forEach(function (spec) {
        var btn = el(
          'button',
          'gantt-btn' + (state.viewMode === spec.mode ? ' is-active' : ''),
          { type: 'button', title: spec.label }
        );
        var icon = el('i', 'ti ' + spec.icon);
        icon.setAttribute('aria-hidden', 'true');
        btn.appendChild(icon);
        btn.appendChild(document.createTextNode(spec.label));
        btn.addEventListener('click', function () {
          state.viewMode = spec.mode;
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
      } else if (state.viewMode === 'day') {
        title.textContent = r.start.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      } else {
        title.textContent =
          model.toIsoDate(r.start) + ' \u2192 ' + model.toIsoDate(r.end);
      }
      toolbar.appendChild(title);

      var sortWrap = el('label', 'gantt-sort');
      sortWrap.appendChild(document.createTextNode('Trier\u00a0: '));
      var sortSel = el('select', 'gantt-select');
      sortSel.setAttribute('data-gantt-sort', '1');
      [
        ['date', 'Date'],
        ['priority', 'Priorit\u00e9'],
        ['name', 'Nom'],
        ['progress', 'Progr\u00e8s'],
        ['subtasks', 'Sous-t\u00e2ches'],
      ].forEach(function (opt) {
        var o = el('option', '', { value: opt[0], text: opt[1] });
        if (state.sortBy === opt[0]) o.selected = true;
        sortSel.appendChild(o);
      });
      sortSel.addEventListener('change', function () {
        setSortBy(sortSel.value || 'date', { resetDir: true });
      });
      sortWrap.appendChild(sortSel);
      toolbar.appendChild(sortWrap);

      var filters = el('div', 'gantt-filters');
      var hideDone = el('label', 'gantt-check');
      var doneCb = el('input', '', { type: 'checkbox' });
      doneCb.checked = state.hideCompleted;
      doneCb.addEventListener('change', function () {
        state.hideCompleted = !!doneCb.checked;
        persistFilters();
        renderChart();
      });
      hideDone.appendChild(doneCb);
      hideDone.appendChild(document.createTextNode(' Masquer termin\u00e9s'));
      filters.appendChild(hideDone);

      var hideBlocked = el('label', 'gantt-check');
      var blockedCb = el('input', '', { type: 'checkbox' });
      blockedCb.checked = state.hideBlocked;
      blockedCb.addEventListener('change', function () {
        state.hideBlocked = !!blockedCb.checked;
        persistFilters();
        renderChart();
      });
      hideBlocked.appendChild(blockedCb);
      hideBlocked.appendChild(document.createTextNode(' Masquer bloqu\u00e9es'));
      filters.appendChild(hideBlocked);

      var hideUndated = el('label', 'gantt-check');
      var undatedCb = el('input', '', { type: 'checkbox' });
      undatedCb.checked = state.hideUndated;
      undatedCb.addEventListener('change', function () {
        state.hideUndated = !!undatedCb.checked;
        persistFilters();
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
            'D\u00e9ployez OutlookConfig.clientId (Entra SPA) pour activer la sync';
          outlookHint.addEventListener('click', function () {
            setStatus(
              'Outlook non configur\u00e9\u00a0: d\u00e9ployez clientId dans outlook-config.js (Pages), puis rechargez le Gantt.',
              true
            );
          });
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

      var icsBtn = el('button', 'gantt-btn', {
        type: 'button',
        text: 'Exporter .ics',
      });
      icsBtn.title =
        'T\u00e9l\u00e9charger un calendrier (.ics) pour Outlook — sans compte Entra';
      icsBtn.addEventListener('click', function () {
        exportIcsCalendar();
      });
      filters.appendChild(icsBtn);

      var paBtn = el('button', 'gantt-btn', {
        type: 'button',
        text: 'Power Automate',
      });
      paBtn.title =
        'Guide : synchroniser Trello \u2192 Outlook automatiquement (cloud Microsoft, sans h\u00e9bergement)';
      paBtn.addEventListener('click', function () {
        openPowerAutomateGuide();
      });
      filters.appendChild(paBtn);

      var refresh = el('button', 'gantt-btn', { type: 'button', text: 'Actualiser' });
      refresh.addEventListener('click', function () {
        reload();
      });
      filters.appendChild(refresh);
      toolbar.appendChild(filters);
    }

    function openPowerAutomateGuide() {
      var url =
        global.PriorityTrello && typeof PriorityTrello.pageUrl === 'function'
          ? PriorityTrello.pageUrl('./outlook-power-automate.html')
          : './outlook-power-automate.html';
      if (t && typeof t.modal === 'function') {
        try {
          t.modal({
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
        setStatus('Impossible d\u2019ouvrir le guide Power Automate', true);
      }
    }

    function exportIcsCalendar() {
      var ics = OI();
      if (!ics || typeof ics.exportBoard !== 'function') {
        setStatus('Module ICS manquant', true);
        return;
      }
      setStatus('Export .ics\u2026');
      var cards = [];
      var ids = Object.keys(state.cardsById || {});
      for (var i = 0; i < ids.length; i++) {
        cards.push(state.cardsById[ids[i]]);
      }
      Promise.resolve(
        cards.length
          ? ics.exportBoard(t, { cards: cards })
          : ics.exportBoard(t)
      )
        .then(function (res) {
          if (!res || !res.ok) {
            if (res && res.reason === 'no-dated-cards') {
              setStatus('Aucune carte dat\u00e9e \u00e0 exporter', true);
            } else {
              setStatus(
                'Export .ics \u00e9chou\u00e9' +
                  (res && res.reason ? ' (' + res.reason + ')' : ''),
                true
              );
            }
            return;
          }
          setStatus(
            'Fichier .ics t\u00e9l\u00e9charg\u00e9 (' +
              res.eventCount +
              ' \u00e9v\u00e9nement(s)) — importez-le dans Outlook'
          );
        })
        .catch(function (err) {
          setStatus(
            'Export .ics\u00a0: ' +
              (err && err.message ? err.message : String(err)),
            true
          );
        });
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
      if (typeof model.sortTreeRootsGroupedByState === 'function') {
        state.tree = model.sortTreeRootsGroupedByState(
          state.tree,
          state.sortBy,
          state.sortDir
        );
      } else if (typeof model.sortTreeRoots === 'function') {
        state.tree = model.sortTreeRoots(state.tree, state.sortBy, state.sortDir);
      }
    }

    function isSelectableGanttRow(row) {
      return !!(row && row.kind !== 'section' && row.id);
    }

    function defaultSortDir(mode) {
      if (typeof model.defaultSortDir === 'function') {
        return model.defaultSortDir(mode);
      }
      if (mode === 'progress' || mode === 'subtasks') return 'desc';
      return 'asc';
    }

    /**
     * @param {string} mode
     * @param {{ resetDir?: boolean, dir?: 'asc'|'desc' }} [opts]
     * Clicking the same column toggles asc/desc; a new column uses its default dir.
     */
    function setSortBy(mode, opts) {
      opts = opts || {};
      var next = normalizeSortBy(mode);
      if (opts.dir === 'asc' || opts.dir === 'desc') {
        state.sortBy = next;
        state.sortDir = opts.dir;
      } else if (opts.resetDir || state.sortBy !== next) {
        state.sortBy = next;
        state.sortDir = defaultSortDir(next);
      } else {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      }
      var sel = root.querySelector('select[data-gantt-sort]');
      if (sel) sel.value = state.sortBy;
      persistFilters();
      applySort();
      renderChart();
    }

    function sortIndicator(active) {
      if (!active) return null;
      return el('span', 'gantt-sort-indicator', {
        text: state.sortDir === 'asc' ? '\u25B2' : '\u25BC',
        'aria-hidden': 'true',
      });
    }

    function bindSortableHeader(slot, mode, label) {
      slot.classList.add('is-sortable');
      var active = state.sortBy === mode;
      if (active) slot.classList.add('is-active');
      var dirHint =
        active
          ? state.sortDir === 'asc'
            ? ' croissant'
            : ' d\u00e9croissant'
          : '';
      slot.title = 'Trier par ' + label + dirHint;
      slot.setAttribute('role', 'button');
      slot.setAttribute('tabindex', '0');
      slot.setAttribute('aria-pressed', active ? 'true' : 'false');
      function onSort() {
        setSortBy(mode);
      }
      slot.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        onSort();
      });
      slot.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort();
        }
      });
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

    function closeCardOverlay(opts) {
      opts = opts || {};
      if (state.cardOverlayKeyHandler) {
        document.removeEventListener('keydown', state.cardOverlayKeyHandler, true);
        state.cardOverlayKeyHandler = null;
      }
      if (state.cardOverlay && state.cardOverlay.parentNode) {
        state.cardOverlay.parentNode.removeChild(state.cardOverlay);
      }
      state.cardOverlay = null;
      if (opts.reload !== false) {
        reload({ quiet: true });
      }
    }

    function cardIdsForSectionDrag(originRow) {
      var selected = selectedRows().filter(function (r) {
        return r && r.kind === 'card' && r.cardId;
      });
      var originSelected = !!(originRow && state.selected[originRow.id]);
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
    }

    function applySectionDrop(cardIds, sectionKey) {
      if (
        !cardIds ||
        !cardIds.length ||
        !sectionKey ||
        typeof ganttTrello.moveCardToStateSection !== 'function'
      ) {
        return;
      }
      if (state.saving) return;
      state.saving = true;
      var label =
        sectionKey === 'started'
          ? 'En cours'
          : sectionKey === 'blocked'
            ? 'Bloqu\u00e9'
            : 'En attente';
      setStatus(
        'D\u00e9placement vers ' +
          label +
          (cardIds.length > 1 ? ' (' + cardIds.length + ')' : '') +
          '\u2026'
      );

      var chain = Promise.resolve({ ok: true, results: [] });
      cardIds
        .reduce(function (p, cid) {
          return p.then(function (acc) {
            return ganttTrello
              .moveCardToStateSection(t, cid, sectionKey)
              .then(function (res) {
                acc.results.push(res);
                if (!res || !res.ok) acc.ok = false;
                return acc;
              });
          });
        }, chain)
        .then(function (acc) {
          state.saving = false;
          state.suppressCardOpen = false;
          if (!acc.ok) {
            setStatus(
              '\u00c9chec du d\u00e9placement de statut',
              true
            );
          } else {
            state.selected = Object.create(null);
            setStatus(
              cardIds.length === 1
                ? 'Statut mis \u00e0 jour'
                : cardIds.length + ' cartes mises \u00e0 jour'
            );
          }
          return reload();
        })
        .catch(function (err) {
          state.saving = false;
          state.suppressCardOpen = false;
          setStatus(
            'Erreur\u00a0: ' + (err && err.message ? err.message : String(err)),
            true
          );
          return reload();
        });
    }

    function bindLabelSectionDrag(labelRow, row) {
      if (!row || row.kind !== 'card' || !row.cardId) return;
      if (typeof ganttTrello.moveCardToStateSection !== 'function') return;

      labelRow.classList.add('is-section-draggable');
      labelRow.title = labelRow.title || 'Glisser vers une section pour changer le statut';

      labelRow.addEventListener('pointerdown', function (ev) {
        if (ev.button != null && ev.button !== 0) return;
        if (state.saving || state.sectionDrag) return;
        var tgt = ev.target;
        if (tgt && tgt.closest) {
          if (tgt.closest('.gantt-select-box')) return;
          if (tgt.closest('.gantt-twist')) return;
          if (tgt.closest('.gantt-row-actions')) return;
          if (tgt.closest('.gantt-detail-icons')) return;
          if (tgt.closest('.gantt-rename-input')) return;
          if (tgt.closest('.gantt-action-btn')) return;
        }

        var cardIds = cardIdsForSectionDrag(row);
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
        state.sectionDrag = drag;

        function clearDropHighlight() {
          var nodes = root.querySelectorAll(
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
          if (!state.sectionDrag || state.sectionDrag !== drag) return;
          var dx = e.clientX - drag.startX;
          var dy = e.clientY - drag.startY;
          if (!drag.active) {
            if (dx * dx + dy * dy < 36) return;
            drag.active = true;
            state.suppressCardOpen = true;
            try {
              labelRow.setPointerCapture(ev.pointerId);
            } catch (capErr) {
              /* ignore */
            }
            var ghost = el('div', 'gantt-section-drag-ghost', {
              text:
                cardIds.length > 1
                  ? cardIds.length + ' cartes'
                  : row.name || 'Carte',
            });
            document.body.appendChild(ghost);
            drag.ghost = ghost;
            labelRow.classList.add('is-dragging-section');
            root.classList.add('is-section-dragging');
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
          root.classList.remove('is-section-dragging');
          try {
            labelRow.releasePointerCapture(ev.pointerId);
          } catch (relErr) {
            /* ignore */
          }
          document.removeEventListener('pointermove', onMove, true);
          document.removeEventListener('pointerup', onUp, true);
          document.removeEventListener('pointercancel', onUp, true);
          if (state.sectionDrag === drag) state.sectionDrag = null;
        }

        function onUp(e) {
          if (!state.sectionDrag || state.sectionDrag !== drag) {
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
          if (!dropKey || state.saving) {
            state.suppressCardOpen = false;
            return;
          }
          applySectionDrop(ids, dropKey);
        }

        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', onUp, true);
        document.addEventListener('pointercancel', onUp, true);
      });
    }

    function openCard(cardId, cardName, options) {
      if (!cardId || !t) return;
      options = options || {};
      var openSection =
        typeof options.openSection === 'string' && options.openSection
          ? options.openSection
          : 'priority';
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
      var ganttUrl =
        global.PriorityTrello && typeof PriorityTrello.pageUrl === 'function'
          ? PriorityTrello.pageUrl('./gantt.html')
          : './gantt.html';
      var args = {
        cardId: String(cardId),
        cardName: cardName || '',
        openSection: openSection,
      };

      closeMiniPopover();
      closeCardOverlay({ reload: false });

      // Do not nest popup.html inside this fullscreen Gantt iframe: the Power-Up
      // client talks to window.parent, so a nested iframe never receives `render`
      // from Trello and stays on "Ouverture de Cerveau…". Open a real modal, then
      // restore Gantt when the task editor closes.
      if (typeof t.modal !== 'function') {
        console.error('Gantt openCard: t.modal unavailable');
        return;
      }
      return t.modal({
        title: cardName || appName,
        url: pageUrl,
        args: args,
        fullscreen: true,
        accentColor: '#22272B',
        callback: function () {
          if (typeof t.modal !== 'function') return;
          t.modal({
            title: 'Gantt',
            url: ganttUrl,
            fullscreen: true,
            accentColor: '#22272B',
          });
        },
      });
    }

    /**
     * Re-fetch board data and re-render without the loading flash
     * (no "Chargement…" empty state). Used after mini-editor closes.
     */
    function refreshBoardQuiet() {
      return reload({ quiet: true });
    }

    function closeMiniPopover(opts) {
      opts = opts || {};
      var shouldRefresh = !!opts.reload;
      if (state.miniPopoverKeyHandler) {
        document.removeEventListener('keydown', state.miniPopoverKeyHandler, true);
        state.miniPopoverKeyHandler = null;
      }
      if (state.miniPopoverOutsideHandler) {
        document.removeEventListener(
          'pointerdown',
          state.miniPopoverOutsideHandler,
          true
        );
        state.miniPopoverOutsideHandler = null;
      }
      if (state.miniPopover) {
        if (
          state.miniPopover.mountApi &&
          typeof state.miniPopover.mountApi.destroy === 'function'
        ) {
          try {
            state.miniPopover.mountApi.destroy();
          } catch (e) {
            /* ignore */
          }
        }
        if (state.miniPopover.el && state.miniPopover.el.parentNode) {
          state.miniPopover.el.parentNode.removeChild(state.miniPopover.el);
        }
      }
      state.miniPopover = null;
      // Quiet refresh: update icons/bars without the full-page "Chargement…" blink.
      if (shouldRefresh) refreshBoardQuiet();
    }

    function positionMiniPopover(popoverEl, anchorEl) {
      if (!popoverEl || !anchorEl) return;
      var margin = 8;
      var rect = anchorEl.getBoundingClientRect();
      var rootRect = root.getBoundingClientRect();
      popoverEl.style.visibility = 'hidden';
      popoverEl.style.left = '0px';
      popoverEl.style.top = '0px';
      var pw = popoverEl.offsetWidth || 320;
      var ph = popoverEl.offsetHeight || 200;
      var left = rect.left - rootRect.left;
      var top = rect.bottom - rootRect.top + 6;
      if (left + pw > rootRect.width - margin) {
        left = Math.max(margin, rootRect.width - pw - margin);
      }
      if (left < margin) left = margin;
      if (top + ph > rootRect.height - margin) {
        top = rect.top - rootRect.top - ph - 6;
      }
      if (top < margin) top = margin;
      popoverEl.style.left = Math.round(left) + 'px';
      popoverEl.style.top = Math.round(top) + 'px';
      popoverEl.style.visibility = '';
    }

    /**
     * Shared anchored mini editor popover.
     * opts: { anchor, title, sectionKey, cardId, cardName, mount(bodyEl) → api }
     */
    function openMiniEditor(opts) {
      opts = opts || {};
      if (!opts.anchor || typeof opts.mount !== 'function') return;
      closeMiniPopover();

      var popover = el('div', 'gantt-mini-popover');
      popover.setAttribute('role', 'dialog');
      popover.setAttribute('aria-label', opts.title || 'Modifier');

      var head = el('div', 'gantt-mini-popover-head');
      head.appendChild(
        el('div', 'gantt-mini-popover-title', { text: opts.title || '' })
      );
      var closeBtn = el('button', 'gantt-mini-popover-close', {
        type: 'button',
        title: 'Fermer',
        text: '\u00d7',
      });
      closeBtn.setAttribute('aria-label', 'Fermer');
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeMiniPopover({ reload: true });
      });
      head.appendChild(closeBtn);

      var bodyEl = el('div', 'gantt-mini-popover-body');
      var foot = el('div', 'gantt-mini-popover-foot');
      var openFullBtn = el('button', 'gantt-mini-popover-full', {
        type: 'button',
        text: 'Ouvrir la section',
      });
      openFullBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var sectionKey = opts.sectionKey || 'priority';
        var cardId = opts.cardId;
        var cardName = opts.cardName || '';
        closeMiniPopover({ reload: false });
        openCard(cardId, cardName, { openSection: sectionKey });
      });
      foot.appendChild(openFullBtn);

      popover.appendChild(head);
      popover.appendChild(bodyEl);
      popover.appendChild(foot);
      root.appendChild(popover);

      var mountApi = null;
      try {
        mountApi = opts.mount(bodyEl) || null;
      } catch (mountErr) {
        console.error('Gantt mini editor mount failed', mountErr);
        bodyEl.textContent = 'Impossible d\u2019ouvrir l\u2019\u00e9diteur.';
      }

      state.miniPopover = {
        el: popover,
        mountApi: mountApi,
        cardId: opts.cardId,
        sectionKey: opts.sectionKey,
      };

      positionMiniPopover(popover, opts.anchor);

      state.miniPopoverKeyHandler = function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeMiniPopover({ reload: true });
        }
      };
      document.addEventListener('keydown', state.miniPopoverKeyHandler, true);

      state.miniPopoverOutsideHandler = function (e) {
        if (!state.miniPopover || !state.miniPopover.el) return;
        var target = e.target;
        if (state.miniPopover.el.contains(target)) return;
        if (opts.anchor && opts.anchor.contains && opts.anchor.contains(target)) {
          return;
        }
        closeMiniPopover({ reload: true });
      };
      // Defer so the opening click does not immediately close.
      setTimeout(function () {
        if (!state.miniPopover) return;
        document.addEventListener(
          'pointerdown',
          state.miniPopoverOutsideHandler,
          true
        );
      }, 0);

      closeBtn.focus();
    }

    function openMiniPriority(row, anchor) {
      if (!row || !row.cardId || !anchor) return;
      var PT = global.PriorityTrello;
      var ui = PU();
      if (!PT || !ui || typeof ui.mountMiniPriority !== 'function') {
        setStatus('\u00c9diteur de priorit\u00e9 indisponible', true);
        return;
      }
      openMiniEditor({
        anchor: anchor,
        title: 'Priorit\u00e9',
        sectionKey: 'priority',
        cardId: row.cardId,
        cardName: row.name,
        mount: function (bodyEl) {
          var loading = el('div', 'gantt-mini-popover-loading', {
            text: 'Chargement\u2026',
          });
          bodyEl.appendChild(loading);
          var apiHolder = { destroy: function () {} };

          Promise.all([
            PT.getCardInputsById(t, row.cardId),
            typeof PT.getBoardFormula === 'function'
              ? PT.getBoardFormula(t)
              : Promise.resolve('baseline'),
          ])
            .then(function (pair) {
              if (!state.miniPopover || state.miniPopover.cardId !== row.cardId) {
                return;
              }
              bodyEl.removeChild(loading);
              var inputs = pair[0] || {};
              var formula = pair[1] || 'baseline';
              var mounted = ui.mountMiniPriority(bodyEl, {
                id: 'gantt-' + row.cardId,
                formula: formula,
                defaults: inputs,
                dimensions: PT.PRIORITY_DIMENSIONS,
                onStateChange: function (next) {
                  PT.saveCardInputsById(t, row.cardId, {
                    urgency: next.urgency,
                    impact: next.impact,
                    ease: next.ease,
                  })
                    .then(function () {
                      setStatus('Priorit\u00e9 enregistr\u00e9e');
                    })
                    .catch(function (err) {
                      setStatus(
                        'Erreur priorit\u00e9\u00a0: ' +
                          (err && err.message ? err.message : String(err)),
                        true
                      );
                    });
                },
              });
              apiHolder.destroy = function () {
                if (mounted && mounted.destroy) mounted.destroy();
              };
              if (state.miniPopover) state.miniPopover.mountApi = apiHolder;
              positionMiniPopover(state.miniPopover.el, anchor);
            })
            .catch(function (err) {
              loading.textContent =
                'Erreur\u00a0: ' +
                (err && err.message ? err.message : String(err));
            });

          return apiHolder;
        },
      });
    }

    function openMiniDue(row, anchor) {
      if (!row || !row.cardId || !anchor) return;
      var PT = global.PriorityTrello;
      var ui = PU();
      if (!PT || !ui || typeof ui.mountMiniDue !== 'function') {
        setStatus('\u00c9diteur d\u2019\u00e9ch\u00e9ance indisponible', true);
        return;
      }
      openMiniEditor({
        anchor: anchor,
        title: '\u00c9ch\u00e9ance',
        sectionKey: 'due',
        cardId: row.cardId,
        cardName: row.name,
        mount: function (bodyEl) {
          var loading = el('div', 'gantt-mini-popover-loading', {
            text: 'Chargement\u2026',
          });
          bodyEl.appendChild(loading);
          var apiHolder = { destroy: function () {} };

          PT.getCardInputsById(t, row.cardId)
            .then(function (inputs) {
              if (!state.miniPopover || state.miniPopover.cardId !== row.cardId) {
                return;
              }
              bodyEl.removeChild(loading);
              var mounted = ui.mountMiniDue(bodyEl, {
                value: inputs || {},
                onChange: function (values) {
                  var patch = {
                    dueDate: values.dueDate || '',
                    dueTime: values.dueTime || '',
                    dueEnabled: !!values.dueEnabled,
                    dueMode: values.dueMode,
                    dueVague: values.dueVague || '',
                    startDate: values.startDate || '',
                    recurrence: values.recurrence || null,
                  };
                  var chain = PT.saveCardInputsById(t, row.cardId, patch);
                  if (typeof ganttTrello.saveCardDates === 'function') {
                    chain = chain.then(function () {
                      return ganttTrello.saveCardDates(t, row.cardId, {
                        startDate: values.startDate || '',
                        dueDate: values.dueDate || '',
                        dueTime: values.dueTime || '',
                      });
                    });
                  }
                  chain
                    .then(function () {
                      setStatus('\u00c9ch\u00e9ance enregistr\u00e9e');
                    })
                    .catch(function (err) {
                      setStatus(
                        'Erreur \u00e9ch\u00e9ance\u00a0: ' +
                          (err && err.message ? err.message : String(err)),
                        true
                      );
                    });
                },
              });
              apiHolder.destroy = function () {
                if (mounted && mounted.destroy) mounted.destroy();
              };
              if (state.miniPopover) state.miniPopover.mountApi = apiHolder;
              positionMiniPopover(state.miniPopover.el, anchor);
            })
            .catch(function (err) {
              loading.textContent =
                'Erreur\u00a0: ' +
                (err && err.message ? err.message : String(err));
            });

          return apiHolder;
        },
      });
    }

    function openMiniBlocked(row, anchor) {
      if (!row || !row.cardId || !anchor) return;
      var PT = global.PriorityTrello;
      var ui = PU();
      if (!PT || !ui || typeof ui.mountMiniBlocked !== 'function') {
        setStatus('\u00c9diteur Bloqu\u00e9 indisponible', true);
        return;
      }
      openMiniEditor({
        anchor: anchor,
        title: 'Bloqu\u00e9',
        sectionKey: 'blocked',
        cardId: row.cardId,
        cardName: row.name,
        mount: function (bodyEl) {
          var loading = el('div', 'gantt-mini-popover-loading', {
            text: 'Chargement\u2026',
          });
          bodyEl.appendChild(loading);
          var apiHolder = { destroy: function () {} };

          PT.getCardInputsById(t, row.cardId)
            .then(function (inputs) {
              if (!state.miniPopover || state.miniPopover.cardId !== row.cardId) {
                return;
              }
              bodyEl.removeChild(loading);
              var mounted = ui.mountMiniBlocked(bodyEl, {
                value: !!(inputs && inputs.enAttente),
                blockedReasons: (inputs && inputs.blockedReasons) || [],
                blockedLinks: (inputs && inputs.blockedLinks) || [],
                hideSubtaskPicker: true,
                onChange: function (next) {
                  PT.saveCardInputsById(t, row.cardId, {
                    enAttente: !!next.enAttente,
                    blockedReasons: next.blockedReasons || [],
                    blockedLinks: next.blockedLinks || [],
                  })
                    .then(function () {
                      setStatus(
                        next.enAttente
                          ? 'Carte bloqu\u00e9e'
                          : 'Carte d\u00e9bloqu\u00e9e'
                      );
                    })
                    .catch(function (err) {
                      setStatus(
                        'Erreur blocage\u00a0: ' +
                          (err && err.message ? err.message : String(err)),
                        true
                      );
                    });
                },
              });
              apiHolder.destroy = function () {
                if (mounted && mounted.destroy) mounted.destroy();
              };
              if (state.miniPopover) state.miniPopover.mountApi = apiHolder;
              positionMiniPopover(state.miniPopover.el, anchor);
            })
            .catch(function (err) {
              loading.textContent =
                'Erreur\u00a0: ' +
                (err && err.message ? err.message : String(err));
            });

          return apiHolder;
        },
      });
    }

    function openMiniProgress(row, anchor) {
      if (!row || !row.cardId || !anchor) return;
      var CT = global.CompletionTrello;
      var CU = global.CompletionUI;
      if (
        !CT ||
        !CU ||
        typeof CU.mountMiniProgress !== 'function' ||
        typeof CT.getCardCompletionById !== 'function'
      ) {
        setStatus('\u00c9diteur de progr\u00e8s indisponible', true);
        return;
      }
      openMiniEditor({
        anchor: anchor,
        title: 'Progr\u00e8s',
        sectionKey: 'progress',
        cardId: row.cardId,
        cardName: row.name,
        mount: function (bodyEl) {
          var loading = el('div', 'gantt-mini-popover-loading', {
            text: 'Chargement\u2026',
          });
          bodyEl.appendChild(loading);
          var apiHolder = { destroy: function () {} };

          CT.getCardCompletionById(t, row.cardId)
            .then(function (data) {
              if (!state.miniPopover || state.miniPopover.cardId !== row.cardId) {
                return;
              }
              bodyEl.removeChild(loading);
              var mounted = CU.mountMiniProgress(bodyEl, {
                data: data || { items: [] },
                onChange: function (nextData) {
                  CT.saveCardCompletionById(t, row.cardId, nextData)
                    .then(function () {
                      setStatus('Progr\u00e8s enregistr\u00e9');
                    })
                    .catch(function (err) {
                      setStatus(
                        'Erreur progr\u00e8s\u00a0: ' +
                          (err && err.message ? err.message : String(err)),
                        true
                      );
                    });
                },
              });
              apiHolder.destroy = function () {
                if (mounted && mounted.destroy) mounted.destroy();
              };
              if (state.miniPopover) state.miniPopover.mountApi = apiHolder;
              positionMiniPopover(state.miniPopover.el, anchor);
            })
            .catch(function (err) {
              loading.textContent =
                'Erreur\u00a0: ' +
                (err && err.message ? err.message : String(err));
            });

          return apiHolder;
        },
      });
    }

    function buildDetailIcons(row) {
      var icons = el('div', 'gantt-detail-icons');

      function slot(className, node) {
        var cell = el('span', 'gantt-detail-slot' + (className ? ' ' + className : ''));
        if (node) cell.appendChild(node);
        icons.appendChild(cell);
      }

      if (row.kind === 'card') {
        var isBlocked = !!row.blocked;
        var blockedBtn = iconButton(
          'ti-player-pause',
          isBlocked ? 'Bloqu\u00e9 \u2014 modifier' : 'Bloquer',
          isBlocked ? 'is-blocked' : 'is-blocked-ghost'
        );
        blockedBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openMiniBlocked(row, blockedBtn);
        });
        slot('is-blocked', blockedBtn);

        var pTitle =
          (row.priorityLabel || 'Priorit\u00e9') +
          (row.priorityScore != null
            ? ' \u00b7 ' + Number(row.priorityScore).toFixed(1)
            : '');
        var showFire = shouldShowPriorityFire(row);
        var priorityBtn = priorityDotEl(
          pTitle,
          showFire ? row.priorityFill || null : null,
          !showFire
        );
        priorityBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openMiniPriority(row, priorityBtn);
        });
        slot('is-priority', priorityBtn);

        var pct = Math.round(row.progress || 0);
        var progBtn = el('button', 'gantt-progress-text gantt-progress-text--btn', {
          type: 'button',
          text: pct + '%',
          title: 'Progr\u00e8s ' + pct + '%',
        });
        progBtn.setAttribute('aria-label', 'Progr\u00e8s ' + pct + '%');
        progBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openMiniProgress(row, progBtn);
        });
        slot('is-progress', progBtn);

        var dueTitle =
          row.dueCountdown ||
          (row.dueDate
            ? '\u00c9ch\u00e9ance ' + row.dueDate
            : 'D\u00e9finir l\u2019\u00e9ch\u00e9ance');
        var dueBtn;
        if (row.duePast) {
          dueBtn = iconButton('ti-clock', dueTitle, 'is-overdue');
        } else if (row.dueCountdown || row.dueDate) {
          dueBtn = iconButton('ti-calendar-event', dueTitle, 'is-due');
        } else {
          dueBtn = iconButton(
            'ti-calendar-event',
            'D\u00e9finir l\u2019\u00e9ch\u00e9ance',
            'is-due-muted'
          );
        }
        dueBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openMiniDue(row, dueBtn);
        });
        slot(row.duePast ? 'is-overdue' : 'is-due', dueBtn);
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
        slot('is-due', null);
      }

      return icons;
    }

    function buildSubtaskTitleBadge(row) {
      if (!row || !(row.subtaskCount > 0)) return null;
      var sub = iconEl(
        'ti-list-check',
        row.subtaskCount + ' sous-t\u00e2che(s)',
        'is-subtasks'
      );
      sub.appendChild(
        el('span', 'gantt-icon-label', { text: String(row.subtaskCount) })
      );
      return sub;
    }

    function toggleCardBlocked(row) {
      if (!row || row.kind !== 'card' || !row.cardId || state.saving) return;
      if (typeof ganttTrello.setCardBlocked !== 'function') {
        setStatus('Blocage indisponible', true);
        return;
      }
      var nextBlocked = !row.blocked;
      state.saving = true;
      setStatus(nextBlocked ? 'Blocage\u2026' : 'D\u00e9blocage\u2026');
      ganttTrello
        .setCardBlocked(t, row.cardId, nextBlocked)
        .then(function (res) {
          state.saving = false;
          if (!res || !res.ok) {
            setStatus(
              (nextBlocked
                ? '\u00c9chec du blocage'
                : '\u00c9chec du d\u00e9blocage') +
                (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
            return reload();
          }
          setStatus(nextBlocked ? 'Carte bloqu\u00e9e' : 'Carte d\u00e9bloqu\u00e9e');
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

    function selectedRows() {
      // Walk the full nest tree so cascade-selected children count even if collapsed.
      var rows =
        typeof model.flattenAll === 'function'
          ? model.flattenAll(state.tree)
          : visibleRows();
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        if (
          rows[i] &&
          isSelectableGanttRow(rows[i]) &&
          state.selected[rows[i].id]
        ) {
          out.push(rows[i]);
        }
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

    function expandSubtreeForSelect(node) {
      if (!node || typeof model.collectExpandableSubtreeIds !== 'function') {
        return;
      }
      var ids = model.collectExpandableSubtreeIds(node);
      for (var i = 0; i < ids.length; i++) {
        state.expanded[ids[i]] = true;
      }
    }

    function toggleSelected(rowId, on) {
      var node =
        typeof model.findNodeById === 'function'
          ? model.findNodeById(state.tree, rowId)
          : null;
      var ids =
        node && typeof model.collectSubtreeIds === 'function'
          ? model.collectSubtreeIds(node)
          : rowId
            ? [String(rowId)]
            : [];
      for (var i = 0; i < ids.length; i++) {
        if (on) state.selected[ids[i]] = true;
        else delete state.selected[ids[i]];
      }
      // Reveal nested children so cascade selection is visible.
      if (on && node) expandSubtreeForSelect(node);
      renderBulkBar();
      renderChart();
    }

    function confirmTrash(message, mouseEvent) {
      var confirmApi = TC();
      if (confirmApi && typeof confirmApi.askActions === 'function') {
        return confirmApi.askActions(t, {
          title: message,
          mouseEvent: mouseEvent || null,
          actions: [
            { id: 'done', text: 'Marquer comme termin\u00e9' },
            { id: 'delete', text: 'Supprimer' },
            { id: 'cancel', text: 'Annuler' },
          ],
        });
      }
      if (confirmApi && typeof confirmApi.ask === 'function') {
        return confirmApi
          .ask(t, {
            title: 'Supprimer',
            message: message,
            confirmText: 'Supprimer',
            cancelText: 'Annuler',
            confirmStyle: 'danger',
            mouseEvent: mouseEvent || null,
          })
          .then(function (ok) {
            return ok ? 'delete' : 'cancel';
          });
      }
      return Promise.resolve(
        global.confirm && global.confirm(message) ? 'delete' : 'cancel'
      );
    }

    function markSubtaskDone(row) {
      if (state.saving || !canEditSubtask(row)) return Promise.resolve();
      if (row.done) {
        setStatus('D\u00e9j\u00e0 termin\u00e9e');
        return Promise.resolve();
      }
      state.saving = true;
      setStatus('Marquage termin\u00e9\u2026');
      return ganttTrello
        .setSubtaskDone(t, subtaskMeta(row), true)
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
          playGanttUiSound('complete_all');
          setStatus('Sous-t\u00e2che termin\u00e9e');
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

    function runBulk(op, mouseEvent) {
      var rows = selectedRows().filter(canEditSubtask);
      if (!rows.length) {
        setStatus('Aucune sous-t\u00e2che s\u00e9lectionn\u00e9e pour cette action', true);
        return;
      }
      if (state.saving) return;

      var start = function () {
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
              if (op === 'delete') playGanttUiSound('trash');
              else if (op === 'done') playGanttUiSound('complete_all');
              else playGanttUiSound('uncomplete');
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
      };

      if (op === 'delete') {
        confirmTrash(
          'Supprimer ' + rows.length + ' sous-t\u00e2che(s)\u00a0?',
          mouseEvent
        ).then(function (choice) {
          if (choice === 'done') {
            runBulk('done', mouseEvent);
            return;
          }
          if (choice === 'delete') start();
        });
        return;
      }
      start();
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
          function (e) {
            runBulk('delete', e);
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
      // Board cards (roots and linked children) — blocked or not.
      if (row.kind === 'card' && row.cardId) return true;
      return false;
    }

    function isLinkedCardRow(row) {
      return !!(row && row.kind === 'card' && row.linkParentCardId && row.cardId);
    }

    function isBoardRootCard(row) {
      return !!(row && row.kind === 'card' && row.cardId && !row.linkParentCardId);
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

    function deleteSubtaskRow(row, mouseEvent) {
      if (state.saving || !canEditSubtask(row)) return;
      var label = row.name || 'cette t\u00e2che';
      var prompt = isBoardRootCard(row)
        ? 'Archiver \u00ab\u00a0' + label + '\u00a0\u00bb\u00a0?'
        : isLinkedCardRow(row)
          ? 'Retirer le lien vers \u00ab\u00a0' + label + '\u00a0\u00bb\u00a0?'
          : 'Supprimer \u00ab\u00a0' + label + '\u00a0\u00bb\u00a0?';
      confirmTrash(prompt, mouseEvent).then(function (choice) {
        if (!choice || choice === 'cancel') return;
        if (choice === 'done') {
          markSubtaskDone(row);
          return;
        }
        state.saving = true;
        setStatus(isBoardRootCard(row) ? 'Archivage\u2026' : 'Suppression\u2026');
        ganttTrello
          .deleteSubtask(t, subtaskMeta(row))
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
            if (state.selected[row.id]) delete state.selected[row.id];
            playGanttUiSound('trash');
            setStatus(
              res.archived
                ? 'Carte archiv\u00e9e'
                : res.unlinked
                  ? 'Lien retir\u00e9'
                  : 'Sous-t\u00e2che supprim\u00e9e'
            );
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

      var delBtn = el('button', 'gantt-action-btn gantt-action-btn--delete', {
        type: 'button',
        title: isBoardRootCard(row)
          ? 'Archiver la carte'
          : isLinkedCardRow(row)
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
          deleteSubtaskRow(row, e);
        });
      }
      actions.appendChild(delBtn);

      return actions;
    }

    function applyIntervalToRow(row, interval) {
      var parts = model.intervalToParts(interval, {
        includeTime: usesTimedTimeline() || !!interval.hasTime,
      });
      row.startDate = parts.startDate;
      row.dueDate = parts.dueDate;
      row.startTime = parts.startTime || '';
      row.dueTime = parts.dueTime || '';
      if (row.cardId && state.cardsById[row.cardId]) {
        state.cardsById[row.cardId].startDate = parts.startDate;
        state.cardsById[row.cardId].dueDate = parts.dueDate;
        state.cardsById[row.cardId].startTime = parts.startTime || '';
        state.cardsById[row.cardId].dueTime = parts.dueTime || '';
      }
    }

    function persistRow(row) {
      if (!row || row.kind !== 'card' || !row.cardId) return Promise.resolve();
      state.saving = true;
      var clearing = !row.startDate && !row.dueDate;
      setStatus(clearing ? 'Effacement des dates\u2026' : 'Enregistrement\u2026');
      return ganttTrello
        .saveCardDates(t, row.cardId, {
          startDate: row.startDate || '',
          dueDate: row.dueDate || '',
          startTime: clearing
            ? ''
            : row.startTime ||
              (state.cardsById[row.cardId] &&
                state.cardsById[row.cardId].startTime) ||
              '',
          dueTime: clearing
            ? ''
            : row.dueTime ||
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
          setStatus(clearing ? 'Dates effac\u00e9es' : 'Dates enregistr\u00e9es');
          var outlookSync = OS();
          if (
            state.outlookConnected &&
            outlookSync &&
            typeof outlookSync.scheduleSyncCard === 'function'
          ) {
            outlookSync.scheduleSyncCard(t, row.cardId);
          }
          if (clearing) {
            renderChart();
          } else {
            setTimeout(function () {
              if (!state.saving) setStatus('');
            }, 1500);
          }
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

    function clearRowDates(row) {
      if (state.saving || !row || row.kind !== 'card' || !row.cardId) return;
      row.startDate = '';
      row.dueDate = '';
      row.startTime = '';
      row.dueTime = '';
      if (state.cardsById[row.cardId]) {
        state.cardsById[row.cardId].startDate = '';
        state.cardsById[row.cardId].dueDate = '';
        state.cardsById[row.cardId].startTime = '';
        state.cardsById[row.cardId].dueTime = '';
      }
      persistRow(row);
    }

    function dateAtTimelineX(timeRow, clientX) {
      var rect = timeRow.getBoundingClientRect();
      // Use the laid-out row width when it differs slightly from state.timelineWidth
      // (subpixel / scrollbars), so hover lines up with the day grid.
      var width =
        rect.width > 0 ? rect.width : state.timelineWidth || MIN_TIMELINE_W;
      var x = clientX - rect.left;
      var r = range();
      if (usesTimedTimeline() && typeof model.xToDateTime === 'function') {
        var dt = model.xToDateTime(x, r, width);
        return model.snapDateTime
          ? model.snapDateTime(
              dt,
              state.viewMode,
              model.AGENDA_SNAP_MINUTES || 15
            )
          : dt;
      }
      var d = model.xToDate(x, r, width);
      return model.snapDate(d, state.viewMode);
    }

    function placeGhost(ghostEl, interval) {
      var geo = model.barGeometry(
        interval,
        range(),
        state.timelineWidth
      );
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
        placeGhost(ghost, {
          start: d,
          end: d,
          hasTime: usesTimedTimeline(),
        });
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
        placeGhost(ghost, {
          start: origin,
          end: origin,
          hasTime: usesTimedTimeline(),
        });
        timeRow.setPointerCapture(ev.pointerId);

        function onMove(e) {
          if (!state.paint) return;
          var cur = dateAtTimelineX(timeRow, e.clientX);
          if (!cur) return;
          state.paint.current = cur;
          var iv = model.orderedInterval(state.paint.origin, cur, {
            keepTime: usesTimedTimeline(),
          });
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
          var iv = model.orderedInterval(paint.origin, paint.current, {
            keepTime: usesTimedTimeline(),
          });
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
        if (
          ev.target &&
          ev.target.closest &&
          ev.target.closest('.gantt-bar-clear')
        ) {
          return;
        }
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
          hasTime: !!interval.hasTime,
        };
        state.drag = {
          row: row,
          mode: mode,
          origin: origin,
          startX: startX,
          range: r,
          width: state.timelineWidth,
          pointerId: ev.pointerId,
          agenda: usesTimedTimeline(),
        };
        barEl.classList.add('is-dragging');
        barEl.setPointerCapture(ev.pointerId);

        function onMove(e) {
          if (!state.drag) return;
          var dx = e.clientX - state.drag.startX;
          var next;
          if (state.drag.agenda) {
            var msDelta =
              (dx / state.drag.width) *
              model.rangeDayCount(state.drag.range) *
              model.MS_DAY;
            if (state.drag.mode === 'move') {
              next = model.shiftIntervalMs(state.drag.origin, msDelta);
            } else {
              next = model.resizeIntervalMs(
                state.drag.origin,
                state.drag.mode === 'start' ? 'start' : 'end',
                msDelta
              );
            }
            if (!next) return;
            next = {
              start: model.snapDateTime(next.start, state.viewMode),
              end: model.snapDateTime(next.end, state.viewMode),
              hasTime: true,
            };
          } else {
            var dayDelta = Math.round(
              (dx / state.drag.width) * model.rangeDayCount(state.drag.range)
            );
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
              hasTime: !!state.drag.origin.hasTime,
            };
          }
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
          var finalInterval = model.resolveBarInterval(row, intervalOptions());
          if (
            finalInterval &&
            (finalInterval.start.getTime() !== drag.origin.start.getTime() ||
              finalInterval.end.getTime() !== drag.origin.end.getTime())
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
      var visibleForSelect = [];
      for (var vs = 0; vs < rows.length; vs++) {
        if (isSelectableGanttRow(rows[vs])) visibleForSelect.push(rows[vs]);
      }
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
      var selectState = model.selectAllCheckboxState(
        selectedVisible,
        visibleForSelect.length
      );
      selectAll.checked = selectState.checked;
      selectAll.indeterminate = selectState.indeterminate;
      selectAll.addEventListener('change', function () {
        var on = !!selectAll.checked;
        var list = visibleRows();
        state.selected = Object.create(null);
        if (on) {
          for (var si = 0; si < list.length; si++) {
            if (isSelectableGanttRow(list[si])) {
              state.selected[list[si].id] = true;
            }
          }
        }
        renderBulkBar();
        renderChart();
      });
      headerCell.appendChild(selectAll);

      var headerNest = el('div', 'gantt-nest');
      headerNest.appendChild(el('span', 'gantt-twist-spacer'));

      var titleWrap = el('div', 'gantt-header-title-wrap');
      var titleSort = el('span', 'gantt-header-title');
      titleSort.appendChild(document.createTextNode('T\u00e2ches'));
      var nameInd = sortIndicator(state.sortBy === 'name');
      if (nameInd) titleSort.appendChild(nameInd);
      bindSortableHeader(titleSort, 'name', 'nom');
      titleWrap.appendChild(titleSort);

      var subSort = el('span', 'gantt-header-subtasks-sort');
      subSort.appendChild(iconEl('ti-list-check', '', 'is-subtasks'));
      var subInd = sortIndicator(state.sortBy === 'subtasks');
      if (subInd) subSort.appendChild(subInd);
      bindSortableHeader(subSort, 'subtasks', 'sous-t\u00e2ches');
      titleWrap.appendChild(subSort);
      headerNest.appendChild(titleWrap);
      headerCell.appendChild(headerNest);

      var headerIcons = el('div', 'gantt-detail-icons gantt-detail-icons--header');
      [
        { cls: 'is-blocked', sortable: false },
        {
          cls: 'is-priority',
          sortable: true,
          mode: 'priority',
          label: 'priorit\u00e9',
          content: function (slot) {
            slot.appendChild(priorityDotEl('', null));
            var ind = sortIndicator(state.sortBy === 'priority');
            if (ind) slot.appendChild(ind);
          },
        },
        {
          cls: 'is-progress',
          sortable: true,
          mode: 'progress',
          label: 'progr\u00e8s',
          content: function (slot) {
            slot.appendChild(
              el('span', 'gantt-progress-text', { text: '%' })
            );
            var ind = sortIndicator(state.sortBy === 'progress');
            if (ind) slot.appendChild(ind);
          },
        },
        { cls: 'is-due', sortable: false },
      ].forEach(function (spec) {
        var slot = el('span', 'gantt-detail-slot ' + spec.cls);
        if (spec.sortable) {
          if (typeof spec.content === 'function') spec.content(slot);
          bindSortableHeader(slot, spec.mode, spec.label);
        }
        headerIcons.appendChild(slot);
      });
      headerCell.appendChild(headerIcons);
      headerCell.appendChild(el('span', 'gantt-row-actions gantt-row-actions--header'));
      headerLabels.appendChild(headerCell);
      labelsCol.appendChild(headerLabels);

      var headerTimeline = el('div', 'gantt-row gantt-row--header gantt-timeline-header');
      if (state.viewMode === 'day') {
        headerTimeline.classList.add('gantt-timeline-header--day');
      }
      headerTimeline.style.width = state.timelineWidth + 'px';
      r.columns.forEach(function (col) {
        var headClass = 'gantt-col-head';
        if (col.relative === 'today') headClass += ' is-today';
        else if (col.relative === 'tomorrow') headClass += ' is-tomorrow';
        else if (col.relative === 'yesterday') headClass += ' is-yesterday';
        var cell = el('div', headClass, { text: col.label });
        cell.style.width = 100 / r.columns.length + '%';
        if (typeof col.hour === 'number') {
          cell.title = col.hour + ' h';
        } else if (col.relative === 'today') {
          cell.title = "Aujourd'hui";
        } else if (col.relative === 'tomorrow') {
          cell.title = 'Demain';
        } else if (col.relative === 'yesterday') {
          cell.title = 'Hier';
        } else if (col.key) {
          cell.title = col.key;
        }
        headerTimeline.appendChild(cell);
      });
      timelineCol.appendChild(headerTimeline);

      if (
        state.viewMode === 'day' &&
        typeof model.workHoursBand === 'function'
      ) {
        var band = model.workHoursBand(
          state.ganttSettings.dayStart,
          state.ganttSettings.dayEnd,
          r,
          state.timelineWidth
        );
        if (band && band.width > 0) {
          var workEl = el('div', 'gantt-work-hours');
          workEl.style.left = band.left + 'px';
          workEl.style.width = band.width + 'px';
          workEl.title =
            'Heures de travail \u00b7 ' +
            state.ganttSettings.dayStart +
            ' \u2013 ' +
            state.ganttSettings.dayEnd;
          timelineCol.appendChild(workEl);
        }
      }

      // Today marker — placed at the current time within today's column.
      var now = new Date();
      var todayDate = model.startOfDay(now);
      if (
        todayDate.getTime() >= r.start.getTime() &&
        todayDate.getTime() <= r.end.getTime()
      ) {
        var todayX =
          typeof model.dateTimeToX === 'function'
            ? model.dateTimeToX(now, r, state.timelineWidth)
            : model.dateToX(todayDate, r, state.timelineWidth);
        var marker = el('div', 'gantt-today-line');
        marker.style.left = todayX + 'px';
        marker.title =
          "Maintenant \u00b7 " +
          now.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          });
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

        if (row.kind === 'section') {
          var sectionOpen =
            typeof model.isNodeExpanded === 'function'
              ? model.isNodeExpanded(row, state.expanded)
              : state.expanded[row.id] !== false;
          var sectionLabelRow = el(
            'div',
            'gantt-row gantt-row--section' +
              (row.sectionKey ? ' is-' + row.sectionKey : '') +
              (sectionOpen ? '' : ' is-collapsed')
          );
          sectionLabelRow.style.height = ROW_H + 'px';
          sectionLabelRow.setAttribute(
            'data-section-key',
            row.sectionKey || 'pending'
          );
          var sectionCell = el('div', 'gantt-label-cell gantt-label-cell--section');
          var sectionTwist = el('button', 'gantt-twist gantt-section-twist', {
            type: 'button',
            text: sectionOpen ? '\u25be' : '\u25b8',
            title: sectionOpen
              ? 'Replier la section'
              : 'D\u00e9plier la section',
          });
          sectionTwist.setAttribute(
            'aria-expanded',
            sectionOpen ? 'true' : 'false'
          );
          sectionTwist.setAttribute('aria-label', row.name || 'Section');
          function toggleSection(e) {
            if (e) {
              e.preventDefault();
              e.stopPropagation();
            }
            toggleExpand(row.id);
          }
          sectionTwist.addEventListener('click', toggleSection);
          var sectionTitle = el('button', 'gantt-section-title', {
            type: 'button',
            text: row.name || '',
          });
          sectionTitle.title =
            (row.name || '') +
            (sectionOpen ? ' \u2014 Replier' : ' \u2014 D\u00e9plier');
          sectionTitle.addEventListener('click', toggleSection);
          sectionCell.appendChild(sectionTwist);
          sectionCell.appendChild(sectionTitle);
          if (row.children && row.children.length) {
            sectionCell.appendChild(
              el('span', 'gantt-section-count', {
                text: String(row.children.length),
              })
            );
          }
          sectionLabelRow.appendChild(sectionCell);
          labelsCol.appendChild(sectionLabelRow);

          var sectionTimeRow = el(
            'div',
            'gantt-row gantt-row--section gantt-timeline-row' +
              (row.sectionKey ? ' is-' + row.sectionKey : '') +
              (sectionOpen ? '' : ' is-collapsed')
          );
          sectionTimeRow.style.height = ROW_H + 'px';
          sectionTimeRow.style.width = state.timelineWidth + 'px';
          sectionTimeRow.setAttribute(
            'data-section-key',
            row.sectionKey || 'pending'
          );
          timelineCol.appendChild(sectionTimeRow);
          return;
        }

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
        var selState =
          typeof model.rowSelectionState === 'function'
            ? model.rowSelectionState(row, state.selected)
            : {
                checked: !!state.selected[row.id],
                indeterminate: false,
              };
        sel.checked = !!selState.checked;
        sel.indeterminate = !!selState.indeterminate;
        sel.title = row.expandable
          ? 'S\u00e9lectionner (avec sous-t\u00e2ches)'
          : 'S\u00e9lectionner';
        sel.addEventListener('click', function (e) {
          e.stopPropagation();
        });
        sel.addEventListener('change', function () {
          // Indeterminate is cleared by the browser before `change`; read prior
          // cascade state so a partial parent click selects the whole subtree.
          var prior =
            typeof model.rowSelectionState === 'function'
              ? model.rowSelectionState(row, state.selected)
              : null;
          var wantOn = prior && prior.indeterminate ? true : !!sel.checked;
          toggleSelected(row.id, wantOn);
        });
        labelCell.appendChild(sel);

        var nest = el('div', 'gantt-nest');
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
          nest.appendChild(twist);
        } else {
          nest.appendChild(el('span', 'gantt-twist-spacer'));
        }

        var nameWrap = el('div', 'gantt-task-title-wrap');
        var nameBtn = el(
          'button',
          'gantt-task-name' +
            (row.kind === 'card' ? ' is-card' : '') +
            (row.depth > 0 || row.kind === 'local' || row.kind === 'checklist'
              ? ' is-subtask'
              : '') +
            (canEditSubtask(row) ? ' is-renamable' : '') +
            (row.done ? ' is-done' : ''),
          { type: 'button', text: row.name }
        );
        nameBtn.title = row.name || '';
        if (canEditSubtask(row)) {
          nameBtn.title =
            (row.name || '') + ' \u2014 Double-clic pour renommer';
          nameBtn.addEventListener('dblclick', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (openClickTimer) {
              clearTimeout(openClickTimer);
              openClickTimer = null;
            }
            startInlineRename(row, nameBtn);
          });
        }
        var openClickTimer = null;
        if (row.kind === 'card' && row.cardId) {
          nameBtn.addEventListener('click', function () {
            if (state.suppressCardOpen) {
              state.suppressCardOpen = false;
              if (openClickTimer) {
                clearTimeout(openClickTimer);
                openClickTimer = null;
              }
              return;
            }
            if (openClickTimer) clearTimeout(openClickTimer);
            openClickTimer = setTimeout(function () {
              openClickTimer = null;
              if (state.suppressCardOpen) {
                state.suppressCardOpen = false;
                return;
              }
              openCard(row.cardId, row.name);
            }, 280);
          });
        }
        nameWrap.appendChild(nameBtn);
        var subBadge = buildSubtaskTitleBadge(row);
        if (subBadge) nameWrap.appendChild(subBadge);
        nest.appendChild(nameWrap);
        labelCell.appendChild(nest);

        labelCell.appendChild(buildDetailIcons(row));
        labelCell.appendChild(buildSubtaskActions(row));

        labelRow.appendChild(labelCell);
        bindLabelSectionDrag(labelRow, row);
        labelsCol.appendChild(labelRow);

        var timeRow = el(
          'div',
          'gantt-row gantt-timeline-row' + oddClass
        );
        timeRow.style.height = ROW_H + 'px';
        timeRow.style.width = state.timelineWidth + 'px';

        var interval = model.resolveBarInterval(row, intervalOptions());
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
              (row.name || '') + ' \u00b7 ' + formatIntervalTitle(interval);

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
              var clearBtn = el('button', 'gantt-bar-clear', {
                type: 'button',
                title: 'Effacer les dates',
                text: '\u00d7',
              });
              clearBtn.setAttribute('aria-label', 'Effacer d\u00e9but et \u00e9ch\u00e9ance');
              clearBtn.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                e.stopPropagation();
              });
              clearBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                clearRowDates(row);
              });
              bar.appendChild(clearBtn);
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

      var splitter = el('div', 'gantt-splitter');
      splitter.title = 'Glisser pour redimensionner';
      splitter.setAttribute('role', 'separator');
      splitter.setAttribute('aria-orientation', 'vertical');
      splitter.setAttribute('aria-label', 'Redimensionner les colonnes');
      chart.appendChild(splitter);

      var scroll = el('div', 'gantt-timeline-scroll');
      scroll.appendChild(timelineCol);
      chart.appendChild(scroll);
      body.appendChild(chart);

      labelsCol.style.width = clampLabelsWidth(state.labelsWidth, chart) + 'px';
      state.labelsWidth = clampLabelsWidth(state.labelsWidth, chart);
      bindLabelsSplitter(splitter, labelsCol, chart, scroll);

      // Keep task list and calendar rows aligned while scrolling.
      var syncingScroll = false;
      function syncScroll(from, to) {
        if (syncingScroll) return;
        syncingScroll = true;
        to.scrollTop = from.scrollTop;
        syncingScroll = false;
      }
      labelsCol.addEventListener('scroll', function () {
        syncScroll(labelsCol, scroll);
      });
      scroll.addEventListener('scroll', function () {
        syncScroll(scroll, labelsCol);
      });

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
      // Gantt is always opened as a fullscreen board modal — never call t.sizeTo.
    }

    function reload(options) {
      options = options || {};
      // Soft reloads (e.g. after mini editors) skip the empty "Chargement…" flash.
      var quiet = options.quiet === true;
      if (!quiet) {
        state.loading = true;
        state.error = '';
        setStatus('Chargement du tableau\u2026');
        render();
      }
      return ganttTrello
        .loadBoard(t)
        .then(function (data) {
          state.loading = false;
          state.error = '';
          state.tree = (data && data.tree) || [];
          if (data && data.ganttSettings) {
            state.ganttSettings = data.ganttSettings;
          }
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
          if (!quiet) setStatus(cards.length + ' carte(s)');
          renderBulkBar();
          if (quiet) renderChart();
          else render();
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
        closeMiniPopover({ reload: false });
        closeCardOverlay({ reload: false });
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
    clampLabelsWidth: clampLabelsWidth,
    readStoredLabelsWidth: readStoredLabelsWidth,
    storeLabelsWidth: storeLabelsWidth,
    readStoredFilters: readStoredFilters,
    storeFilters: storeFilters,
    shouldShowPriorityFire: shouldShowPriorityFire,
    LABELS_W_MIN: LABELS_W_MIN,
    LABELS_W_DEFAULT: LABELS_W_DEFAULT,
    LABELS_W_STORAGE_KEY: LABELS_W_STORAGE_KEY,
    FILTERS_STORAGE_KEY: FILTERS_STORAGE_KEY,
    DEFAULT_FILTERS: DEFAULT_FILTERS,
  };
})(typeof window !== 'undefined' ? window : this);
