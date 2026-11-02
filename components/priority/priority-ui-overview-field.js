/**
 * priority-ui: part 7 of 12 (createOverviewField).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var BLOCKED_REASON_PLACEHOLDER = S.BLOCKED_REASON_PLACEHOLDER;
  var COMPLETED_BADGE_PREFIX = S.COMPLETED_BADGE_PREFIX;
  var DUE_PROXIMITY_BANDS = S.DUE_PROXIMITY_BANDS;
  var PROGRESS_CHECK_SVG = S.PROGRESS_CHECK_SVG;
  var PROGRESS_PAUSE_SVG = S.PROGRESS_PAUSE_SVG;

  // from other parts (functions, resolved at call time)
  function bindCollapsibleEnable() { return S.bindCollapsibleEnable.apply(this, arguments); }
  function brandAppName() { return S.brandAppName.apply(this, arguments); }
  function buildOverviewSummaryText() { return S.buildOverviewSummaryText.apply(this, arguments); }
  function bumpBlockedReasonFreq() { return S.bumpBlockedReasonFreq.apply(this, arguments); }
  function createCollapsibleEnableChrome() { return S.createCollapsibleEnableChrome.apply(this, arguments); }
  function dueBandAccent() { return S.dueBandAccent.apply(this, arguments); }
  function normalizeBlockedReason() { return S.normalizeBlockedReason.apply(this, arguments); }
  function normalizeBlockedReasons() { return S.normalizeBlockedReasons.apply(this, arguments); }
  function rankBlockedReasonSuggestions() { return S.rankBlockedReasonSuggestions.apply(this, arguments); }
  function readCssVar() { return S.readCssVar.apply(this, arguments); }
  function statutCategoryStyle() { return S.statutCategoryStyle.apply(this, arguments); }

  /**
   * Overview / résumé strip (collapsible) or footer actions box.
   * Status-first hero + Motifs + open tasks + contextual actions.
   *
   * config.compact — card-back / embedded strip: no accordion chrome, tighter
   * layout, short action labels (used by the Trello Cerveau card-back section).
   * When onAction is provided, compact still shows action chips + composers and
   * interactive task checks; without onAction it stays read-only.
   * config.actionsOnly — popup footer: actions + composers only (no Résumé chrome).
   */
  function createOverviewField(config) {
    config = config || {};
    var compact = !!config.compact;
    var actionsOnly = !!config.actionsOnly && !compact;
    var mountEl = config.el;
    var onJump = typeof config.onJump === 'function' ? config.onJump : null;
    var onAction =
      typeof config.onAction === 'function' ? config.onAction : null;
    var interactive = !!onAction;
    var onLayoutChange =
      typeof config.onLayoutChange === 'function' ? config.onLayoutChange : null;
    var onExpandChange =
      typeof config.onExpandChange === 'function' ? config.onExpandChange : null;

    var titleText = typeof config.title === 'string' ? config.title : '';
    var statusText = typeof config.status === 'string' ? config.status : '';
    var statusCategory =
      typeof config.statusCategory === 'string' ? config.statusCategory : '';
    var statusColor =
      typeof config.statusColor === 'string' ? config.statusColor : '';
    var progressPercent =
      config.progressPercent != null && isFinite(+config.progressPercent)
        ? Math.max(0, Math.min(100, Math.round(+config.progressPercent)))
        : null;
    var progressColor =
      typeof config.progressColor === 'string' ? config.progressColor : '';
    var progressBlocked = !!config.progressBlocked;
    var dueCountdown =
      typeof config.dueCountdown === 'string' ? config.dueCountdown : '';
    var dueBand = typeof config.dueBand === 'string' ? config.dueBand : '';
    var dueDays =
      config.dueDays != null && isFinite(+config.dueDays)
        ? Math.round(+config.dueDays)
        : null;
    var priorityLabel =
      typeof config.priorityLabel === 'string' ? config.priorityLabel : '';
    var priorityColor =
      typeof config.priorityColor === 'string' ? config.priorityColor : '';
    var summaryTextValue =
      typeof config.summaryText === 'string' ? config.summaryText : '';
    var blockedReasonsList = normalizeBlockedReasons(config.blockedReasons);
    var overviewTasks = Array.isArray(config.tasks) ? config.tasks.slice() : [];
    var tasksDone =
      config.tasksDone != null && isFinite(+config.tasksDone)
        ? Math.max(0, Math.round(+config.tasksDone))
        : 0;
    var tasksTotal =
      config.tasksTotal != null && isFinite(+config.tasksTotal)
        ? Math.max(0, Math.round(+config.tasksTotal))
        : 0;
    var features =
      config.features && typeof config.features === 'object'
        ? Object.assign({}, config.features)
        : {
            statut: true,
            progress: true,
            due: true,
            priority: true
          };

    var bodyId = 'overview-section-body-' + Math.random().toString(36).slice(2, 9);
    var composerMode = ''; // '' | 'block' | 'add-subtask'

    var section = document.createElement('div');
    section.className =
      'variant-overview-section' +
      (compact ? ' variant-overview-section--compact' : '') +
      (actionsOnly ? ' variant-overview-section--actions' : '');

    var field = document.createElement('div');
    field.className =
      'field field--overview is-enabled' +
      (compact ? ' field--overview-compact' : '') +
      (actionsOnly ? ' field--overview-actions' : '');
    section.appendChild(field);

    var chrome = null;
    if (!compact && !actionsOnly) {
      chrome = createCollapsibleEnableChrome({
        title: 'R\u00e9sum\u00e9',
        bodyId: bodyId,
        hideEnable: true,
        leadingIcon: 'ti-layout-dashboard',
        iconClass: 'overview-leading-icon',
        titleClass: 'overview-enable-title',
        collapseLabel: 'Replier R\u00e9sum\u00e9',
        expandLabel: 'D\u00e9velopper R\u00e9sum\u00e9'
      });
      field.appendChild(chrome.head);
    }

    var body = document.createElement('div');
    body.className =
      'overview-section-body' +
      (compact || actionsOnly ? '' : ' section-toggle-body');
    body.id = bodyId;

    function makeJumpable(el, jumpKeyOrRef, label) {
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      if (label) {
        el.title = compact ? 'Ouvrir ' + brandAppName() : 'Aller \u00e0 ' + label;
      }
      function resolveKey() {
        if (jumpKeyOrRef && typeof jumpKeyOrRef === 'object') {
          return jumpKeyOrRef.key;
        }
        return jumpKeyOrRef;
      }
      function go() {
        if (onJump) onJump(resolveKey());
      }
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    }

    function emitAction(id, payload) {
      if (!onAction) return;
      if (payload !== undefined) onAction(id, payload);
      else onAction(id);
    }

    // ── Title ──────────────────────────────────────────────────────────
    var titleBtn = document.createElement('div');
    titleBtn.className = 'overview-title';
    makeJumpable(titleBtn, 'info', 'D\u00e9tails');

    var titleIcon = document.createElement('i');
    titleIcon.className = 'ti ti-heading overview-title-icon';
    titleIcon.setAttribute('aria-hidden', 'true');
    titleBtn.appendChild(titleIcon);

    var titleValue = document.createElement('span');
    titleValue.className = 'overview-title-text';
    titleBtn.appendChild(titleValue);

    if (!compact && !actionsOnly) {
      var titleChevron = document.createElement('i');
      titleChevron.className = 'ti ti-chevron-right overview-title-chevron';
      titleChevron.setAttribute('aria-hidden', 'true');
      titleBtn.appendChild(titleChevron);
    }

    // Trello already shows the card title above this section.
    if (compact) titleBtn.hidden = true;
    if (!actionsOnly) body.appendChild(titleBtn);

    // ── Status hero ────────────────────────────────────────────────────
    var hero = document.createElement('div');
    hero.className = 'overview-hero';
    var progressJump = { key: 'progress' };
    makeJumpable(hero, progressJump, 'Progr\u00e8s');

    var heroRing = document.createElement('span');
    heroRing.className = 'overview-progress-ring tp-completion-check overview-hero-ring';
    heroRing.setAttribute('aria-hidden', 'true');
    heroRing.innerHTML = PROGRESS_CHECK_SVG;

    var heroMain = document.createElement('div');
    heroMain.className = 'overview-hero-main';

    var heroTop = document.createElement('div');
    heroTop.className = 'overview-hero-top';

    var heroPhase = document.createElement('span');
    heroPhase.className = 'overview-hero-phase';
    heroTop.appendChild(heroPhase);

    var heroCount = document.createElement('span');
    heroCount.className = 'overview-hero-count';
    heroTop.appendChild(heroCount);

    var heroPct = document.createElement('span');
    heroPct.className = 'overview-hero-pct';
    heroTop.appendChild(heroPct);

    var heroSentence = document.createElement('p');
    heroSentence.className = 'overview-hero-sentence';

    var heroTrack = document.createElement('div');
    heroTrack.className = 'overview-progress-track overview-hero-track';
    var heroFill = document.createElement('div');
    heroFill.className = 'overview-progress-fill';
    heroTrack.appendChild(heroFill);

    heroMain.appendChild(heroTop);
    heroMain.appendChild(heroSentence);
    heroMain.appendChild(heroTrack);

    hero.appendChild(heroRing);
    hero.appendChild(heroMain);
    if (!actionsOnly) body.appendChild(hero);

    // ── Motifs band ────────────────────────────────────────────────────
    var motifsEl = document.createElement('div');
    motifsEl.className = 'overview-motifs';
    motifsEl.hidden = true;
    makeJumpable(motifsEl, { key: 'blocked' }, 'Motifs');
    if (!actionsOnly) body.appendChild(motifsEl);

    // ── Meta row (due + priority) ──────────────────────────────────────
    var metrics = document.createElement('div');
    metrics.className = 'overview-metrics overview-metrics--meta';
    if (!actionsOnly) body.appendChild(metrics);

    function makeCell(key, jumpKey, label, iconClass, options) {
      options = options || {};
      var cell = document.createElement('div');
      cell.className = 'overview-cell overview-cell--' + key;
      cell.dataset.overviewKey = key;
      makeJumpable(cell, jumpKey, label);

      var head = document.createElement('div');
      head.className = 'overview-cell-head';

      var icon = document.createElement('i');
      icon.className = 'ti ' + iconClass + ' overview-cell-icon';
      icon.setAttribute('aria-hidden', 'true');
      head.appendChild(icon);

      if (!options.hideLabel) {
        var lab = document.createElement('span');
        lab.className = 'overview-cell-label';
        lab.textContent = label;
        head.appendChild(lab);
      } else {
        cell.classList.add('overview-cell--nolabel');
      }

      cell.appendChild(head);

      var valueWrap = document.createElement('div');
      valueWrap.className = 'overview-cell-value';
      cell.appendChild(valueWrap);

      metrics.appendChild(cell);
      return { cell: cell, value: valueWrap, head: head, icon: icon };
    }

    // Keep a progress cell for tests / jump compatibility (visually in hero).
    var progressCell = makeCell(
      'progress',
      progressJump,
      'Progr\u00e8s',
      'ti-progress'
    );
    progressCell.cell.classList.add('overview-cell--progress-mirror');
    progressCell.cell.setAttribute('hidden', '');

    var dueCell = makeCell('due', 'due', '\u00c9ch\u00e9ance', 'ti-calendar-event');
    var priorityCell = makeCell('priority', 'priority', 'Priorit\u00e9', 'ti-flame');

    var priorityDot = document.createElement('span');
    priorityDot.className = 'heat-tier-dot overview-priority-dot';
    priorityDot.setAttribute('aria-hidden', 'true');

    var priorityText = document.createElement('span');
    priorityText.className = 'overview-priority-label';

    // ── Task strip ─────────────────────────────────────────────────────
    var tasksWrap = document.createElement('div');
    tasksWrap.className = 'overview-tasks';
    tasksWrap.hidden = true;
    if (!actionsOnly) body.appendChild(tasksWrap);

    var tasksList = document.createElement('div');
    tasksList.className = 'overview-tasks-list';
    tasksWrap.appendChild(tasksList);

    var tasksDoneHint = document.createElement('div');
    tasksDoneHint.className = 'overview-tasks-done-hint';
    tasksDoneHint.hidden = true;
    tasksWrap.appendChild(tasksDoneHint);

    // ── Actions + composers ────────────────────────────────────────────
    var actionsEl = document.createElement('div');
    actionsEl.className =
      'overview-actions' +
      (actionsOnly ? ' overview-actions--footer' : '') +
      (compact ? ' overview-actions--compact' : '');
    actionsEl.hidden = true;
    if (!compact || interactive) body.appendChild(actionsEl);

    var composerEl = document.createElement('div');
    composerEl.className =
      'overview-composer' + (compact ? ' overview-composer--compact' : '');
    composerEl.hidden = true;
    if (!compact || interactive) body.appendChild(composerEl);

    function setFeatureVisible(cell, on) {
      if (on) {
        cell.removeAttribute('hidden');
      } else {
        cell.setAttribute('hidden', '');
      }
    }

    function resolveDoneBlocked() {
      var isBlocked = statusCategory === 'blocked' || !!progressBlocked;
      var isDone =
        statusCategory === 'completed' ||
        (progressPercent != null && progressPercent >= 100);
      return { isBlocked: isBlocked && !isDone, isDone: isDone };
    }

    function phaseLabel(isBlocked, isDone) {
      if (isDone) {
        return (statusText || '').trim() || 'Termin\u00e9';
      }
      if (isBlocked) {
        return statusCategory === 'blocked' && (statusText || '').trim()
          ? (statusText || '').trim()
          : 'Bloqu\u00e9';
      }
      if (
        (progressPercent != null && progressPercent > 0) ||
        (tasksTotal > 0 && tasksDone > 0) ||
        statusCategory === 'started'
      ) {
        return 'En cours';
      }
      if ((statusText || '').trim()) return (statusText || '').trim();
      return '\u00c0 faire';
    }

    function closeComposer() {
      composerMode = '';
      composerEl.hidden = true;
      composerEl.replaceChildren();
      if (actionsOnly) {
        section.hidden = !!actionsEl.hidden;
      }
      if (onLayoutChange) onLayoutChange();
    }

    function openBlockComposer() {
      composerMode = 'block';
      if (actionsOnly) section.hidden = false;
      composerEl.hidden = false;
      composerEl.replaceChildren();

      var head = document.createElement('div');
      head.className = 'overview-composer-head';
      head.textContent = 'Pourquoi en attente\u00a0?';
      composerEl.appendChild(head);

      var suggestions = document.createElement('div');
      suggestions.className = 'overview-composer-suggestions';
      var ranked = rankBlockedReasonSuggestions({
        query: '',
        selected: [],
        cap: 6
      });
      for (var i = 0; i < ranked.length; i++) {
        (function (reason) {
          var chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'overview-composer-chip';
          chip.textContent = reason;
          chip.addEventListener('click', function (e) {
            if (e && e.preventDefault) e.preventDefault();
            if (e && e.stopPropagation) e.stopPropagation();
            bumpBlockedReasonFreq(reason);
            emitAction('block', { reasons: [reason] });
            closeComposer();
          });
          suggestions.appendChild(chip);
        })(ranked[i]);
      }
      composerEl.appendChild(suggestions);

      var row = document.createElement('div');
      row.className = 'overview-composer-row';

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'overview-composer-input';
      input.placeholder = BLOCKED_REASON_PLACEHOLDER;
      input.setAttribute('aria-label', 'Cause du blocage');

      var submit = document.createElement('button');
      submit.type = 'button';
      submit.className = 'overview-action-chip overview-action-chip--primary';
      submit.textContent = 'Bloquer';

      function commitCustom() {
        var reason = normalizeBlockedReason(input.value);
        if (reason) bumpBlockedReasonFreq(reason);
        emitAction('block', { reasons: reason ? [reason] : [] });
        closeComposer();
      }

      submit.addEventListener('click', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        commitCustom();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitCustom();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeComposer();
        }
      });

      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'overview-action-chip overview-action-chip--ghost';
      cancel.textContent = 'Annuler';
      cancel.addEventListener('click', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        closeComposer();
      });

      row.appendChild(input);
      row.appendChild(submit);
      row.appendChild(cancel);
      composerEl.appendChild(row);

      if (onLayoutChange) onLayoutChange();
      setTimeout(function () {
        try {
          input.focus();
        } catch (err) { /* ignore */ }
      }, 0);
    }

    function openAddSubtaskComposer() {
      composerMode = 'add-subtask';
      if (actionsOnly) section.hidden = false;
      composerEl.hidden = false;
      composerEl.replaceChildren();

      var head = document.createElement('div');
      head.className = 'overview-composer-head';
      head.textContent = 'Nouvelle sous-t\u00e2che';
      composerEl.appendChild(head);

      var row = document.createElement('div');
      row.className = 'overview-composer-row';

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'overview-composer-input';
      input.placeholder = 'D\u00e9crire la sous-t\u00e2che\u2026';
      input.setAttribute('aria-label', 'Nouvelle sous-t\u00e2che');

      var submit = document.createElement('button');
      submit.type = 'button';
      submit.className = 'overview-action-chip overview-action-chip--primary';
      submit.textContent = 'Ajouter';

      function commit() {
        var text = String(input.value || '').trim();
        if (!text) {
          input.focus();
          return;
        }
        emitAction('add-subtask', { text: text });
        closeComposer();
      }

      submit.addEventListener('click', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        commit();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeComposer();
        }
      });

      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'overview-action-chip overview-action-chip--ghost';
      cancel.textContent = 'Annuler';
      cancel.addEventListener('click', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        closeComposer();
      });

      row.appendChild(input);
      row.appendChild(submit);
      row.appendChild(cancel);
      composerEl.appendChild(row);

      if (onLayoutChange) onLayoutChange();
      setTimeout(function () {
        try {
          input.focus();
        } catch (err) { /* ignore */ }
      }, 0);
    }

    function paintActions() {
      if (!actionsEl.parentNode || (compact && !interactive)) {
        actionsEl.hidden = true;
        closeComposer();
        return;
      }
      actionsEl.replaceChildren();
      var state = resolveDoneBlocked();
      if (state.isDone) {
        actionsEl.hidden = true;
        closeComposer();
        return;
      }

      var chips = [];
      if (state.isBlocked) {
        chips.push({
          id: 'unblock',
          label: compact ? 'D\u00e9bloquer' : 'Marquer d\u00e9bloqu\u00e9',
          icon: 'ti-player-play',
          variant: 'primary'
        });
      } else {
        chips.push({
          id: 'complete',
          label: 'Terminer',
          icon: 'ti-check',
          variant: 'primary'
        });
      }
      // Keep add-subtask immediately right of the primary status chip (✓ / play).
      chips.push({
        id: 'add-subtask',
        label: compact ? 'Sous-t\u00e2che' : 'Ajouter une sous-t\u00e2che',
        icon: 'ti-plus',
        variant: 'neutral'
      });
      if (!state.isBlocked) {
        chips.push({
          id: 'block',
          label: compact ? 'En attente\u2026' : 'Mettre en attente\u2026',
          icon: 'ti-player-pause',
          variant: 'warn'
        });
      }
      if (dueDays != null && isFinite(dueDays) && dueDays <= 0) {
        chips.push({
          id: 'postpone-tomorrow',
          label: compact ? 'Demain' : 'Reporter \u00e0 demain',
          icon: 'ti-calendar-plus',
          variant: 'neutral'
        });
      }

      actionsEl.hidden = false;
      for (var i = 0; i < chips.length; i++) {
        (function (chip) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'overview-action-chip' +
            (chip.variant === 'primary'
              ? ' overview-action-chip--primary'
              : chip.variant === 'warn'
                ? ' overview-action-chip--warn'
                : '');
          btn.dataset.overviewAction = chip.id;
          if (chip.icon) {
            var ic = document.createElement('i');
            ic.className = 'ti ' + chip.icon;
            ic.setAttribute('aria-hidden', 'true');
            btn.appendChild(ic);
          }
          var lab = document.createElement('span');
          lab.textContent = chip.label;
          btn.appendChild(lab);
          btn.addEventListener('click', function (e) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (chip.id === 'block') {
              if (composerMode === 'block') closeComposer();
              else openBlockComposer();
              return;
            }
            if (chip.id === 'add-subtask') {
              if (composerMode === 'add-subtask') closeComposer();
              else openAddSubtaskComposer();
              return;
            }
            emitAction(chip.id);
          });
          if (
            global.ContextMenu &&
            typeof global.ContextMenu.bind === 'function'
          ) {
            ContextMenu.bind(btn, function () {
              return [
                {
                  id: chip.id,
                  label: chip.label,
                  action: function () {
                    btn.click();
                  },
                },
              ];
            });
          }
          actionsEl.appendChild(btn);
        })(chips[i]);
      }
    }

    function paintMotifs(isBlocked) {
      motifsEl.replaceChildren();
      if (!isBlocked || !blockedReasonsList.length) {
        motifsEl.hidden = true;
        return;
      }
      motifsEl.hidden = false;
      if (!compact) {
        var label = document.createElement('span');
        label.className = 'overview-motifs-label';
        label.textContent = 'Motifs';
        motifsEl.appendChild(label);
      }
      for (var i = 0; i < blockedReasonsList.length; i++) {
        var chip = document.createElement('span');
        chip.className = 'overview-motif-chip';
        chip.textContent = blockedReasonsList[i];
        motifsEl.appendChild(chip);
      }
    }

    function paintTasks(isBlocked) {
      tasksList.replaceChildren();
      var showTasks = overviewTasks.length > 0 || tasksDone > 0;
      if (!showTasks) {
        tasksWrap.hidden = true;
        return;
      }
      tasksWrap.hidden = false;

      if (!overviewTasks.length) {
        tasksList.hidden = true;
      } else {
        tasksList.hidden = false;
        for (var i = 0; i < overviewTasks.length; i++) {
          (function (task) {
            var row = document.createElement('div');
            row.className =
              'overview-task-row' +
              (task.blocked ? ' is-blocked' : '') +
              (task.done ? ' is-done' : '');
            row.dataset.taskId = task.id || '';

            var check = document.createElement('button');
            check.type = 'button';
            check.className =
              'overview-progress-ring tp-completion-check overview-task-check';
            check.setAttribute(
              'aria-label',
              task.blocked
                ? 'D\u00e9bloquer'
                : task.done
                  ? 'Marquer non fait'
                  : 'Marquer termin\u00e9'
            );
            check.classList.toggle('is-checked', !!task.done && !task.blocked);
            check.classList.toggle('is-blocked', !!task.blocked);
            check.innerHTML = task.blocked
              ? PROGRESS_PAUSE_SVG
              : PROGRESS_CHECK_SVG;
            if (compact && !interactive) {
              check.disabled = true;
              check.tabIndex = -1;
            } else {
              check.addEventListener('click', function (e) {
                if (e && e.preventDefault) e.preventDefault();
                if (e && e.stopPropagation) e.stopPropagation();
                if (!task.id) return;
                emitAction('toggle-task', { id: task.id });
              });
            }

            var text = document.createElement('span');
            text.className = 'overview-task-text';
            text.textContent = task.text || '';
            if (!compact) {
              text.setAttribute('role', 'button');
              text.tabIndex = 0;
              text.title = 'Aller \u00e0 Progr\u00e8s';
              function jumpProgress(e) {
                if (e && e.preventDefault) e.preventDefault();
                if (e && e.stopPropagation) e.stopPropagation();
                if (onJump) onJump(isBlocked ? 'blocked' : 'progress');
              }
              text.addEventListener('click', jumpProgress);
              text.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  jumpProgress(e);
                }
              });
            }

            row.appendChild(check);
            row.appendChild(text);
            if (
              !compact &&
              global.ContextMenu &&
              typeof global.ContextMenu.bind === 'function' &&
              typeof global.ContextMenu.buildOverviewTaskItems === 'function'
            ) {
              ContextMenu.bind(row, function () {
                return ContextMenu.buildOverviewTaskItems({
                  done: !!task.done,
                  blocked: !!task.blocked,
                  onToggle: function () {
                    if (!task.id) return;
                    emitAction('toggle-task', { id: task.id });
                  },
                  onJumpProgress: function () {
                    if (onJump) onJump(isBlocked ? 'blocked' : 'progress');
                  },
                });
              });
            }
            tasksList.appendChild(row);
          })(overviewTasks[i]);
        }
      }

      if (tasksDone > 0) {
        tasksDoneHint.hidden = false;
        tasksDoneHint.textContent =
          '+' +
          tasksDone +
          ' termin\u00e9e' +
          (tasksDone > 1 ? 's' : '');
        if (!compact) {
          tasksDoneHint.setAttribute('role', 'button');
          tasksDoneHint.tabIndex = 0;
          tasksDoneHint.title = 'Aller \u00e0 Progr\u00e8s';
          tasksDoneHint.onclick = function (e) {
            if (e && e.preventDefault) e.preventDefault();
            if (onJump) onJump('progress');
          };
        }
      } else {
        tasksDoneHint.hidden = true;
        tasksDoneHint.textContent = '';
        tasksDoneHint.onclick = null;
      }
    }

    function paint() {
      var t = (titleText || '').trim();
      if (t) {
        titleValue.textContent = t;
        titleValue.classList.remove('is-empty');
        titleBtn.classList.remove('is-empty');
      } else {
        titleValue.textContent = 'Sans titre';
        titleValue.classList.add('is-empty');
        titleBtn.classList.add('is-empty');
      }

      var progressFeatureOn =
        features.progress !== false || features.statut !== false;
      var due = (dueCountdown || '').trim();
      // Mirror cell stays hidden; hero carries progress UX.
      setFeatureVisible(progressCell.cell, false);
      setFeatureVisible(dueCell.cell, features.due !== false && !!due);
      // Compact: Trello's badges just above already show the priority.
      setFeatureVisible(priorityCell.cell, features.priority !== false && !compact);
      metrics.hidden =
        (dueCell.cell.getAttribute('hidden') != null ||
          features.due === false ||
          !due) &&
        (priorityCell.cell.getAttribute('hidden') != null ||
          features.priority === false ||
          compact);

      var state = resolveDoneBlocked();
      var isBlocked = state.isBlocked;
      var isDone = state.isDone;
      progressJump.key = isBlocked ? 'blocked' : 'progress';

      var statusStyle = statutCategoryStyle(statusCategory || '_none');
      var statusAccent = statusColor || statusStyle.color || '';
      var accent = isBlocked
        ? statusAccent || readCssVar('--blocked-accent', '#ae2e24')
        : isDone
          ? statusAccent || progressColor || '#22a06b'
          : progressColor || statusAccent || '';

      // Compact: an untouched card has nothing to report — skip "À faire".
      hero.hidden =
        compact &&
        !isBlocked &&
        !isDone &&
        !(progressPercent > 0) &&
        !(tasksTotal > 0 && tasksDone > 0) &&
        statusCategory !== 'started';
      hero.classList.toggle('is-blocked', isBlocked);
      hero.classList.toggle('is-done', isDone);
      hero.classList.toggle('has-progress-accent', !!accent);
      if (accent) {
        hero.style.setProperty('--overview-progress-accent', accent);
        hero.style.setProperty('--overview-status-accent', accent);
        heroRing.style.setProperty('--completion-check-fill', accent);
      } else {
        hero.style.removeProperty('--overview-progress-accent');
        hero.style.removeProperty('--overview-status-accent');
        heroRing.style.removeProperty('--completion-check-fill');
      }

      var showPct =
        progressPercent != null && progressFeatureOn
          ? progressPercent
          : isDone
            ? 100
            : null;
      var ringPct = showPct != null ? showPct : 0;
      heroRing.classList.toggle('is-checked', !!isDone);
      heroRing.classList.toggle(
        'has-progress',
        !isDone && !isBlocked && ringPct > 0
      );
      heroRing.classList.toggle('is-blocked', isBlocked);
      heroRing.style.setProperty('--completion-progress', String(ringPct));
      heroRing.innerHTML = isBlocked ? PROGRESS_PAUSE_SVG : PROGRESS_CHECK_SVG;

      heroPhase.textContent = phaseLabel(isBlocked, isDone);
      if (tasksTotal > 0) {
        heroCount.hidden = false;
        heroCount.textContent = tasksDone + '/' + tasksTotal;
      } else {
        heroCount.hidden = true;
        heroCount.textContent = '';
      }
      if (showPct != null && !isBlocked) {
        heroPct.hidden = false;
        heroPct.textContent = showPct + '\u00a0%';
      } else {
        heroPct.hidden = true;
        heroPct.textContent = '';
      }

      var sentence =
        (summaryTextValue || '').trim() ||
        buildOverviewSummaryText({
          phase: isDone ? 'done' : isBlocked ? 'blocked' : 'in_progress',
          stuck: isBlocked,
          blockedReasons: blockedReasonsList,
          progressPercent: progressPercent,
          tasksDone: tasksDone,
          tasksTotal: tasksTotal,
          tasksOpen: Math.max(0, tasksTotal - tasksDone),
          openLabels: overviewTasks.map(function (task) {
            return task.text;
          })
        });
      heroSentence.textContent = sentence;
      // Compact: the sentence only repeats the phase / motifs, so drop it.
      heroSentence.hidden =
        !sentence ||
        (compact &&
          (isBlocked ||
            sentence.trim().toLowerCase() ===
              heroPhase.textContent.trim().toLowerCase()));
      // Hide the bar when blocked — Motifs / phase carry the status.
      heroTrack.hidden = isBlocked || (showPct == null && !isDone);
      heroFill.style.width =
        showPct != null ? showPct + '%' : isDone ? '100%' : '0%';

      // Mirror values into hidden progress cell for getData / legacy tests.
      progressCell.value.textContent = isBlocked
        ? phaseLabel(true, false)
        : isDone
          ? phaseLabel(false, true)
          : showPct != null
            ? showPct + '\u00a0%'
            : phaseLabel(false, false);
      progressCell.cell.classList.toggle('is-blocked', isBlocked);
      progressCell.cell.classList.toggle('is-done', !!isDone && !isBlocked);
      progressCell.cell.classList.toggle(
        'is-status-mode',
        isDone || (isBlocked && progressPercent == null)
      );
      progressCell.cell.classList.toggle(
        'is-progress-mode',
        !isDone && progressPercent != null
      );

      var dueDone = !!isDone && !isBlocked && !!due;
      var dueText = dueDone ? COMPLETED_BADGE_PREFIX : due;
      var dueBandActive = dueDone ? '' : dueBand;
      var dueAccentColor = '';
      dueCell.value.textContent = dueText;
      dueCell.value.classList.toggle('is-empty', !dueText);
      dueCell.cell.classList.toggle('is-done', dueDone);
      for (var bi = 0; bi < DUE_PROXIMITY_BANDS.length; bi++) {
        var bandName = DUE_PROXIMITY_BANDS[bi];
        dueCell.cell.classList.toggle(
          'is-due-' + bandName,
          dueBandActive === bandName
        );
      }
      dueCell.cell.classList.toggle('is-overdue', dueBandActive === 'overdue');
      if (dueBandActive) {
        dueCell.cell.dataset.dueBand = dueBandActive;
        dueAccentColor = dueBandAccent(dueBandActive) || '';
        if (dueAccentColor) {
          dueCell.cell.style.setProperty('--overview-due-accent', dueAccentColor);
        } else {
          dueCell.cell.style.removeProperty('--overview-due-accent');
        }
      } else {
        if (dueCell.cell.dataset) delete dueCell.cell.dataset.dueBand;
        dueCell.cell.style.removeProperty('--overview-due-accent');
      }
      dueCell.cell.classList.toggle('has-due-accent', !!dueAccentColor);

      var pl = (priorityLabel || '').trim();
      var priorityDone = !!isDone && !isBlocked;
      priorityCell.value.innerHTML = '';
      priorityCell.cell.classList.toggle('is-complete', priorityDone);
      if (pl) {
        if (priorityColor) {
          priorityDot.style.background = priorityDone
            ? 'var(--text-muted, #626f86)'
            : priorityColor;
          priorityCell.value.appendChild(priorityDot);
          if (priorityDone) {
            priorityCell.cell.style.removeProperty('--overview-priority-accent');
          } else {
            priorityCell.cell.style.setProperty(
              '--overview-priority-accent',
              priorityColor
            );
          }
        } else {
          priorityCell.cell.style.removeProperty('--overview-priority-accent');
        }
        priorityText.textContent = pl;
        priorityCell.value.appendChild(priorityText);
        priorityCell.value.classList.remove('is-empty');
      } else {
        priorityText.textContent = 'Non prioris\u00e9e';
        priorityCell.value.appendChild(priorityText);
        priorityCell.value.classList.add('is-empty');
        priorityCell.cell.style.removeProperty('--overview-priority-accent');
      }
      priorityCell.cell.classList.toggle(
        'has-priority-color',
        !!(pl && priorityColor && !priorityDone)
      );

      paintMotifs(isBlocked);
      paintTasks(isBlocked);
      paintActions();

      if (actionsOnly) {
        section.hidden = !!actionsEl.hidden && !!composerEl.hidden;
      }

      if (onLayoutChange) onLayoutChange();
    }

    function summaryText() {
      var t = (titleText || '').trim();
      return t || 'Sans titre';
    }

    field.appendChild(body);

    var collapse = null;
    if (!compact && chrome) {
      collapse = bindCollapsibleEnable({
        field: field,
        body: body,
        chrome: chrome,
        alwaysEnabled: true,
        enabled: true,
        expanded: config.expanded != null ? !!config.expanded : true,
        getSummary: summaryText,
        onLayoutChange: onLayoutChange,
        onExpandChange: onExpandChange || function () {},
        getContextMenuItems: function (api) {
          if (
            !global.ContextMenu ||
            typeof global.ContextMenu.buildOverviewItems !== 'function'
          ) {
            return [];
          }
          return ContextMenu.buildOverviewItems({
            isExpanded: api.isExpanded,
            setExpanded: api.setExpanded,
            getData: function () {
              return {
                title: titleText,
                status: statusText,
                statusCategory: statusCategory,
                progressPercent: progressPercent,
                progressBlocked: progressBlocked,
                dueDays: dueDays,
              };
            },
            onAction: function (id) {
              if (api && typeof api.setExpanded === 'function') {
                api.setExpanded(true);
              }
              if (id === 'block') {
                openBlockComposer();
                return;
              }
              if (id === 'add-subtask') {
                openAddSubtaskComposer();
                return;
              }
              emitAction(id);
            },
          });
        },
      });
    }

    paint();
    if (collapse && collapse.refreshSummary) collapse.refreshSummary();

    if (mountEl) {
      mountEl.appendChild(section);
    }

    function setData(next) {
      if (!next || typeof next !== 'object') return;
      if (next.title != null) titleText = String(next.title || '');
      if (next.status != null) statusText = String(next.status || '');
      if (next.statusCategory != null) {
        statusCategory = String(next.statusCategory || '');
      }
      if (next.statusColor != null) {
        statusColor = String(next.statusColor || '');
      }
      if (next.progressPercent !== undefined) {
        if (next.progressPercent == null || next.progressPercent === '') {
          progressPercent = null;
        } else if (isFinite(+next.progressPercent)) {
          progressPercent = Math.max(
            0,
            Math.min(100, Math.round(+next.progressPercent))
          );
        }
      }
      if (next.progressColor != null) {
        progressColor = String(next.progressColor || '');
      }
      if (next.progressBlocked != null) {
        progressBlocked = !!next.progressBlocked;
      }
      if (next.dueCountdown != null) {
        dueCountdown = String(next.dueCountdown || '');
      }
      if (next.dueBand != null) dueBand = String(next.dueBand || '');
      if (next.dueDays !== undefined) {
        if (next.dueDays == null || next.dueDays === '') {
          dueDays = null;
        } else if (isFinite(+next.dueDays)) {
          dueDays = Math.round(+next.dueDays);
        }
      }
      if (next.priorityLabel != null) {
        priorityLabel = String(next.priorityLabel || '');
      }
      if (next.priorityColor != null) {
        priorityColor = String(next.priorityColor || '');
      }
      if (next.summaryText != null) {
        summaryTextValue = String(next.summaryText || '');
      }
      if (next.blockedReasons !== undefined) {
        blockedReasonsList = normalizeBlockedReasons(next.blockedReasons);
      }
      if (next.tasks !== undefined) {
        overviewTasks = Array.isArray(next.tasks) ? next.tasks.slice() : [];
      }
      if (next.tasksDone !== undefined) {
        tasksDone =
          next.tasksDone != null && isFinite(+next.tasksDone)
            ? Math.max(0, Math.round(+next.tasksDone))
            : 0;
      }
      if (next.tasksTotal !== undefined) {
        tasksTotal =
          next.tasksTotal != null && isFinite(+next.tasksTotal)
            ? Math.max(0, Math.round(+next.tasksTotal))
            : 0;
      }
      if (next.features && typeof next.features === 'object') {
        features = Object.assign({}, features, next.features);
      }
      paint();
      if (collapse && collapse.refreshSummary) collapse.refreshSummary();
    }

    return {
      el: section,
      field: field,
      compact: compact,
      actionsOnly: actionsOnly,
      setData: setData,
      setExpanded: function (on) {
        if (collapse && typeof collapse.setExpanded === 'function') {
          collapse.setExpanded(!!on);
        }
      },
      isExpanded: function () {
        if (compact || actionsOnly) return true;
        return collapse && typeof collapse.isExpanded === 'function'
          ? collapse.isExpanded()
          : true;
      },
      getData: function () {
        return {
          title: titleText,
          status: statusText,
          statusCategory: statusCategory,
          statusColor: statusColor,
          progressPercent: progressPercent,
          progressColor: progressColor,
          progressBlocked: progressBlocked,
          dueCountdown: dueCountdown,
          dueBand: dueBand,
          dueDays: dueDays,
          priorityLabel: priorityLabel,
          priorityColor: priorityColor,
          summaryText: summaryTextValue,
          blockedReasons: blockedReasonsList.slice(),
          tasks: overviewTasks.slice(),
          tasksDone: tasksDone,
          tasksTotal: tasksTotal,
          features: Object.assign({}, features)
        };
      }
    };
  }

  /**
   * True when `el` or an ancestor up to (not including) `root` is hidden.
   * A search field inside a closed picker must not steal the empty-row gesture.
   */
  function isHiddenBranch(el, root) {
    var node = el;
    while (node && node !== root) {
      if (node.hidden) return true;
      node = node.parentElement;
    }
    return false;
  }

  /**
   * 'field' = focus it; 'open' = click it to start adding; '' = ignore.
   * Opener buttons are the + / pick controls, not chip remove or create-inside-picker.
   */
  function rowEditControlKind(el) {
    if (!el || el.disabled || el.hidden || el.readOnly) return '';
    var tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT') return 'field';
    if (
      el.isContentEditable ||
      el.contentEditable === 'true' ||
      el.contentEditable === true
    ) {
      return 'field';
    }
    if (tag !== 'BUTTON') return '';
    var cls = typeof el.className === 'string' ? el.className : '';
    if (
      /(?:^|\s)info-[\w-]*-add-btn(?:\s|$)/.test(cls) ||
      /(?:^|\s)info-parent-pick-btn(?:\s|$)/.test(cls) ||
      /(?:^|\s)info-route-choose-btn(?:\s|$)/.test(cls)
    ) {
      return 'open';
    }
    return '';
  }

  /** First visible field, else the first visible add/pick button. */
  function firstRowEditControl(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return null;
    var nodes = root.querySelectorAll(
      'textarea, input, [contenteditable="true"], button'
    );
    var opener = null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (isHiddenBranch(el, root)) continue;
      var kind = rowEditControlKind(el);
      if (kind === 'field') return el;
      if (kind === 'open' && !opener) opener = el;
    }
    return opener;
  }

  // exports
  S.createOverviewField = createOverviewField;
  S.firstRowEditControl = firstRowEditControl;
  S.isHiddenBranch = isHiddenBranch;
  S.rowEditControlKind = rowEditControlKind;
})(typeof window !== 'undefined' ? window : this);
