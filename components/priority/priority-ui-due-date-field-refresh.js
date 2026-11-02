/**
 * priority-ui-due-date-field: createDueDateField() part 2 of 2.
 * The body of createDueDateField runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see priority-ui-due-date-field.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var P = (global.PriorityUIPartsMountCreateDueDateField = global.PriorityUIPartsMountCreateDueDateField || { list: [] });

  P.list.push({
    define: function (M) {
    M.refreshVagueSlider = function refreshVagueSlider() {
      var idx = S.dueVagueIndex(M.currentVague);
      if (idx < 0) idx = Math.max(0, S.dueVagueIndex(S.DUE_DATE_VAGUE_DEFAULT_ID));
      if (String(M.vagueSlider.value) !== String(idx)) {
        M.vagueSlider.value = String(idx);
      }
      var label = S.formatDueVagueLabel(
        M.currentVague || S.dueVagueIdAtIndex(idx)
      );
      M.vagueSlider.setAttribute(
        'aria-valuetext',
        label || S.DUE_DATE_VAGUE_OPTIONS_LABEL
      );
      M.vagueSlider.disabled = !M.enabled;
    };
    M.refreshModeUi = function refreshModeUi() {
      var isVague = M.currentMode === S.DUE_DATE_MODE_VAGUE;
      var showLabels = !!M.current && S.isDueVagueEligible(M.current);
      M.field.classList.toggle('is-vague-mode', isVague);
      M.field.dataset.dueMode = M.currentMode;
      M.modeSwitch.hidden = false;
      M.vagueModeBtn.hidden = false;
      M.modeSwitch.classList.toggle('is-icons-only', !showLabels);
      M.preciseModeBtn.classList.toggle('is-active', !isVague);
      M.vagueModeBtn.classList.toggle('is-active', isVague);
      M.preciseModeBtn.setAttribute('aria-checked', isVague ? 'false' : 'true');
      M.vagueModeBtn.setAttribute('aria-checked', isVague ? 'true' : 'false');
      M.vaguePanel.hidden = !isVague;
      M.pickers.hidden = isVague;
      M.startRow.hidden = isVague;
      M.syncDateFixeRow();
      if (isVague) {
        M.hidePickers();
        M.hideStartPicker();
      } else {
        M.showPickers();
      }
      M.refreshVagueSlider();
      M.refreshSuggestions();
      M.notifyLayout();
    };
    M.setDueMode = function setDueMode(nextMode, options) {
      options = options || {};
      var mode = S.normalizeDueMode(nextMode);
      if (mode === M.currentMode && !options.force) return;
      M.currentMode = mode;
      if (mode === S.DUE_DATE_MODE_VAGUE) {
        M.currentTime = '';
        M.currentStart = '';
        M.currentRecurrence = null;
        if (!M.currentVague && M.rememberedVague) {
          M.currentVague = M.rememberedVague;
        }
        if (!M.currentVague) {
          M.currentVague = S.DUE_DATE_VAGUE_DEFAULT_ID;
          M.rememberedVague = M.currentVague;
        }
        if (M.currentVague) {
          M.current = S.resolveDueVagueToDate(M.currentVague);
          if (M.current) M.syncViewFromValue(M.current);
        } else {
          M.current = '';
        }
      } else {
        if (M.currentVague) M.rememberedVague = M.currentVague;
        M.currentVague = '';
      }
      M.refreshModeUi();
      if (!options.silent) M.emitChange();
      else {
        M.refreshCountdown();
        M.refreshStartTrigger();
        M.refreshRecurrenceUi();
      }
    };
    M.applyVagueOption = function applyVagueOption(id, opts) {
      opts = opts || {};
      if (!M.enabled || M.currentMode !== S.DUE_DATE_MODE_VAGUE) return;
      var nextId = S.normalizeDueVague(id);
      if (!nextId) return;
      // Slider always keeps a horizon selected (no toggle-off).
      if (M.currentVague === nextId) {
        M.refreshVagueSlider();
        if (!opts.fromSlider) M.emitChange();
        return;
      }
      M.currentVague = nextId;
      M.rememberedVague = nextId;
      M.current = S.resolveDueVagueToDate(nextId);
      M.currentTime = '';
      M.currentStart = '';
      M.currentRecurrence = null;
      if (M.current) M.syncViewFromValue(M.current);
      M.refreshVagueSlider();
      M.emitChange();
    };
    M.applyQuickSuggestion = function applyQuickSuggestion(id) {
      if (!M.enabled) return;
      if (M.currentMode !== S.DUE_DATE_MODE_PRECISE) M.setDueMode(S.DUE_DATE_MODE_PRECISE, { silent: true });
      var resolved = S.resolveDueDateQuickSuggestion(id);
      if (!resolved || !resolved.iso) return;
      var next = S.normalizeDueDate(resolved.iso);
      if (!next) return;
      M.current = next;
      if (M.currentVague) M.rememberedVague = M.currentVague;
      M.currentVague = '';
      M.currentTime = S.normalizeDueTime(resolved.time) || '';
      if (M.currentTime) M.rememberedTime = M.currentTime;
      M.focusIso = next;
      M.syncViewFromValue(next);
      if (M.open) M.renderCalendar();
      M.emitChange();
    };
    M.refreshTrigger = function refreshTrigger() {
      var display = S.formatDueDateBoxDisplay(M.current);
      M.triggerTitle.textContent = S.formatDueDateTriggerTitle(M.current);
      var triggerDays = M.current ? S.daysUntilDue(M.current) : NaN;
      var dayIconName =
        global.ContextMenu && typeof global.ContextMenu.dayIcon === 'function'
          ? global.ContextMenu.dayIcon(triggerDays)
          : 'calendar';
      M.triggerIcon.className = 'ti ti-' + dayIconName + ' due-date-trigger-icon';
      if (display) {
        M.triggerValue.textContent = display;
        M.triggerValue.classList.remove('is-placeholder');
        M.trigger.classList.add('has-value');
        M.datePicker.classList.add('has-value');
        M.dateTrashBtn.hidden = false;
      } else {
        M.triggerValue.textContent = S.DUE_DATE_PLACEHOLDER;
        M.triggerValue.classList.add('is-placeholder');
        M.trigger.classList.remove('has-value');
        M.datePicker.classList.remove('has-value');
        M.dateTrashBtn.hidden = true;
      }
    };
    M.refreshTodayBtn = function refreshTodayBtn() {
      var todayIso = S.toIsoDate(S.startOfLocalDay(new Date()));
      var hideToday = !!M.current && M.current === todayIso;
      M.todayBtn.hidden = hideToday;
      M.footer.hidden = hideToday;
    };
    M.paintCountdownDot = function paintCountdownDot(band) {
      var accent = S.dueBandAccent(band);
      if (!accent) {
        M.countdownDot.hidden = true;
        M.countdownDot.style.removeProperty('background');
        return;
      }
      M.countdownDot.hidden = false;
      M.countdownDot.style.background = accent;
    };
    M.refreshVagueToggle = function refreshVagueToggle() {
      var showLabels = !!M.current && S.isDueVagueEligible(M.current);
      M.modeSwitch.hidden = false;
      M.vagueModeBtn.hidden = false;
      M.modeSwitch.classList.toggle('is-icons-only', !showLabels);
      return true;
    };
    M.syncMasterClearBtn = function syncMasterClearBtn(hasDue) {
      M.masterClearBtn.hidden = !hasDue;
    };
    M.clearDueDateAndTime = function clearDueDateAndTime() {
      if (M.currentTime) M.rememberedTime = M.currentTime;
      M.current = '';
      M.currentTime = '';
      M.currentVague = '';
      M.rememberedVague = '';
      S.playPriorityUiSound('trash');
      M.emitChange();
      if (M.open) M.renderCalendar();
      if (M.timeOpen) M.syncTimePickerSelection();
    };
    M.refreshCountdown = function refreshCountdown() {
      var hasVague = M.currentMode === S.DUE_DATE_MODE_VAGUE && !!M.currentVague;
      M.refreshVagueToggle();
      if (!M.current && !hasVague) {
        M.countdownPrimary.textContent = '';
        M.countdownSecondary.textContent = '';
        M.countdownSecondary.hidden = true;
        M.countdown.classList.remove('is-past');
        M.countdown.classList.add('is-empty');
        M.countdown.hidden = !M.enabled;
        M.field.classList.remove('has-due-date');
        M.syncMasterClearBtn(false);
        M.paintCountdownDot('');
        S.clearDueProximityBand(M.field);
        M.refreshTimeRow();
        M.refreshTrigger();
        M.refreshSuggestions();
        M.refreshVagueSlider();
        M.refreshTodayBtn();
        if (M.collapseApi) M.collapseApi.refreshSummary();
        return;
      }
      M.countdown.hidden = false;
      M.refreshTrigger();
      M.refreshTimeRow();
      M.refreshSuggestions();
      M.refreshVagueSlider();
      M.refreshTodayBtn();
      if (!M.enabled) {
        M.countdownPrimary.textContent = '';
        M.countdownSecondary.textContent = '';
        M.countdownSecondary.hidden = true;
        M.countdown.classList.remove('is-past');
        M.countdown.classList.add('is-empty');
        M.countdown.hidden = true;
        M.field.classList.remove('has-due-date');
        M.syncMasterClearBtn(false);
        M.paintCountdownDot('');
        S.clearDueProximityBand(M.field);
        if (M.collapseApi) M.collapseApi.refreshSummary();
        return;
      }
      M.countdown.classList.remove('is-empty');
      M.syncMasterClearBtn(true);
      if (hasVague) {
        M.countdownPrimary.textContent = S.formatDueVagueCountdown(M.currentVague);
        M.countdownSecondary.textContent = '';
        M.countdownSecondary.hidden = true;
        M.countdown.classList.remove('is-past');
        M.field.classList.add('has-due-date');
        if (M.current) {
          var vagueBand = S.dueProximityBand(M.current, '');
          S.applyDueProximityBand(M.field, vagueBand);
          M.paintCountdownDot(vagueBand);
        } else {
          M.paintCountdownDot('');
          S.clearDueProximityBand(M.field);
        }
        if (M.collapseApi) M.collapseApi.refreshSummary();
        return;
      }
      var human = S.formatDueDateHumanReadable(M.current, M.currentTime);
      var band = S.dueProximityBand(M.current, M.currentTime);
      var past = band === 'overdue';
      M.countdownPrimary.textContent = human.primary || '';
      M.countdownSecondary.textContent = human.secondary || '';
      M.countdownSecondary.hidden = !human.secondary;
      M.countdown.classList.toggle('is-past', past);
      M.field.classList.add('has-due-date');
      S.applyDueProximityBand(M.field, band);
      M.paintCountdownDot(band);
      if (M.collapseApi) M.collapseApi.refreshSummary();
    };
    M.buildDueSummary = function buildDueSummary() {
      if (M.currentMode === S.DUE_DATE_MODE_VAGUE && M.currentVague) {
        var vagueLabel = S.formatDueVagueCountdown(M.currentVague);
        if (!vagueLabel) return '';
        var wrapVague = document.createElement('span');
        wrapVague.className = 'due-summary due-summary--vague';
        var icon = document.createElement('i');
        icon.className = 'ti ti-tilde due-summary-vague-icon';
        icon.setAttribute('aria-hidden', 'true');
        var textVague = document.createElement('span');
        textVague.className = 'due-summary-label';
        textVague.textContent = S.formatDueVagueLabel(M.currentVague);
        wrapVague.appendChild(icon);
        wrapVague.appendChild(textVague);
        return wrapVague;
      }
      if (!M.current) return S.formatDueDateCompactSummary(M.current, M.currentTime);
      var label = S.formatDueDateCompactSummary(M.current, M.currentTime);
      if (!label) return '';
      var band = S.dueProximityBand(M.current, M.currentTime);
      var accent = S.dueBandAccent(band);
      var wrap = document.createElement('span');
      wrap.className = 'due-summary';
      if (band && wrap.dataset) wrap.dataset.dueBand = band;
      if (accent) {
        var dot = document.createElement('span');
        dot.className = 'heat-tier-dot due-summary-dot';
        dot.setAttribute('aria-hidden', 'true');
        dot.style.background = accent;
        wrap.appendChild(dot);
      }
      var text = document.createElement('span');
      text.className = 'due-summary-label';
      text.textContent = label;
      wrap.appendChild(text);
      return wrap;
    };
    M.refreshStartTrigger = function refreshStartTrigger() {
      var display = S.formatDueDateBoxDisplay(M.currentStart);
      if (display) {
        M.startTriggerValue.textContent = display;
        M.startTriggerValue.classList.remove('is-placeholder');
        M.startTrigger.classList.add('has-value');
        M.startPicker.classList.add('has-value');
        M.startTrashBtn.hidden = false;
      } else {
        M.startTriggerValue.textContent = S.DUE_DATE_START_PLACEHOLDER;
        M.startTriggerValue.classList.add('is-placeholder');
        M.startTrigger.classList.remove('has-value');
        M.startPicker.classList.remove('has-value');
        M.startTrashBtn.hidden = true;
      }
      M.startTrigger.setAttribute('aria-expanded', M.startOpen ? 'true' : 'false');
    };
    M.refreshRecurrenceUi = function refreshRecurrenceUi() {
      var rule = M.currentRecurrence;
      var recurrenceHint = rule
        ? S.formatRecurrenceLabelFr(rule, M.currentTime || M.rememberedTime || S.DUE_DATE_TIME_DEFAULT)
        : '';
      M.recurringSelect.value = rule ? rule.frequency : '';
      M.recurringClearBtn.hidden = !rule;
      M.recurringWeekdays.hidden = !rule || rule.frequency !== 'weekly';
      var interval = rule && rule.interval ? rule.interval : 1;
      M.recurringIntervalInput.value = String(interval);
      M.recurringIntervalWrap.hidden = !rule;
      M.recurringTimeWrap.hidden = !rule;
      M.recurringTimeInput.value = M.currentTime || M.rememberedTime || S.DUE_DATE_TIME_DEFAULT;
      M.triggerRecurringHint.hidden = !rule;
      M.timeRecurringHint.hidden = !rule;
      M.triggerRecurringHint.textContent = recurrenceHint;
      M.timeRecurringHint.textContent = recurrenceHint;
      var selected = rule && rule.weekdays ? rule.weekdays : [];
      var chips = M.recurringWeekdays.querySelectorAll('.due-date-recurring-weekday');
      for (var i = 0; i < chips.length; i++) {
        var day = +chips[i].dataset.day;
        var on = selected.indexOf(day) !== -1;
        chips[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        chips[i].classList.toggle('is-selected', on);
      }
    };
    M.toggleRecurrenceWeekday = function toggleRecurrenceWeekday(dayIndex) {
      if (!M.currentRecurrence || M.currentRecurrence.frequency !== 'weekly') return;
      var days = (M.currentRecurrence.weekdays || []).slice();
      var idx = days.indexOf(dayIndex);
      if (idx === -1) {
        days.push(dayIndex);
      } else if (days.length > 1) {
        days.splice(idx, 1);
      } else {
        return;
      }
      M.currentRecurrence = S.normalizeRecurrence({
        frequency: 'weekly',
        interval: M.currentRecurrence.interval || 1,
        weekdays: days
      });
      M.emitChange();
    };
    M.renderStartCalendar = function renderStartCalendar() {
      if (M.startViewYear == null || M.startViewMonth == null) {
        M.syncStartViewFromValue(M.currentStart);
      }
      var monthName = S.DUE_DATE_MONTH_NAMES[M.startViewMonth];
      var monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      M.startMonthLabel.textContent = monthCap + ' ' + M.startViewYear;

      M.startGrid.textContent = '';
      var first = new Date(M.startViewYear, M.startViewMonth, 1);
      var startOffset = S.sundayOffset(first);
      var gridStart = new Date(M.startViewYear, M.startViewMonth, 1 - startOffset);
      var todayIso = S.toIsoDate(S.startOfLocalDay(new Date()));

      var row = null;
      for (var i = 0; i < 42; i++) {
        if (i % 7 === 0) {
          row = document.createElement('div');
          row.className = 'due-date-row';
          row.setAttribute('role', 'row');
          M.startGrid.appendChild(row);
        }
        var cellDate = new Date(
          gridStart.getFullYear(),
          gridStart.getMonth(),
          gridStart.getDate() + i
        );
        var iso = S.toIsoDate(cellDate);
        var inMonth = cellDate.getMonth() === M.startViewMonth;
        var isToday = iso === todayIso;
        var isPast = iso < todayIso;
        var isSelected = !!M.currentStart && iso === M.currentStart;
        var isFocused = iso === M.startFocusIso;

        var cell = document.createElement('div');
        cell.className = 'due-date-cell';
        cell.setAttribute('role', 'gridcell');

        var dayBtn = document.createElement('button');
        dayBtn.type = 'button';
        dayBtn.className = 'due-date-day';
        dayBtn.dataset.iso = iso;
        dayBtn.textContent = String(cellDate.getDate());
        dayBtn.setAttribute(
          'aria-label',
          S.DUE_DATE_WEEKDAY_NAMES[S.sundayOffset(cellDate)] +
            ' ' +
            cellDate.getDate() +
            ' ' +
            S.DUE_DATE_MONTH_NAMES[cellDate.getMonth()] +
            ' ' +
            cellDate.getFullYear()
        );
        dayBtn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        dayBtn.tabIndex = isFocused ? 0 : -1;
        if (!inMonth) dayBtn.classList.add('is-outside');
        if (isToday) dayBtn.classList.add('is-today');
        if (isPast) dayBtn.classList.add('is-past');
        if (isSelected) dayBtn.classList.add('is-selected');
        dayBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          M.selectStartIso(ev.currentTarget.dataset.iso);
        });
        cell.appendChild(dayBtn);
        row.appendChild(cell);
      }

      var hideToday = !!M.currentStart && M.currentStart === todayIso;
      M.startTodayBtn.hidden = hideToday;
      M.startFooter.hidden = hideToday;
    };
    M.selectStartIso = function selectStartIso(iso) {
      var next = S.normalizeDueDate(iso);
      if (!next) return;
      M.currentStart = next;
      M.startFocusIso = next;
      M.syncStartViewFromValue(next);
      M.emitChange();
      M.renderStartCalendar();
      M.hideStartPicker();
    };
    M.shiftStartMonth = function shiftStartMonth(delta) {
      M.startViewMonth += delta;
      while (M.startViewMonth < 0) {
        M.startViewMonth += 12;
        M.startViewYear -= 1;
      }
      while (M.startViewMonth > 11) {
        M.startViewMonth -= 12;
        M.startViewYear += 1;
      }
      var daysInMonth = new Date(M.startViewYear, M.startViewMonth + 1, 0).getDate();
      var focusDay = S.dueDateToLocalDate(M.startFocusIso);
      var day = focusDay ? Math.min(focusDay.getDate(), daysInMonth) : 1;
      M.startFocusIso = S.toIsoDate(new Date(M.startViewYear, M.startViewMonth, day));
      M.renderStartCalendar();
    };
    M.showStartPicker = function showStartPicker() {
      if (M.startOpen) return;
      M.startOpen = true;
      if (M.currentStart) M.syncStartViewFromValue(M.currentStart);
      else {
        M.syncStartViewFromValue('');
        M.startFocusIso = S.toIsoDate(S.startOfLocalDay(new Date()));
      }
      M.startPopover.hidden = false;
      M.field.classList.add('is-start-open');
      M.renderStartCalendar();
      M.refreshStartTrigger();
      M.bindDocListeners();
      document.addEventListener('mousedown', M.onStartDocMouseDown, true);
      M.notifyLayout();
    };
    M.hideStartPicker = function hideStartPicker() {
      if (!M.startOpen) return;
      M.startOpen = false;
      M.startPopover.hidden = true;
      M.field.classList.remove('is-start-open');
      document.removeEventListener('mousedown', M.onStartDocMouseDown, true);
      M.refreshStartTrigger();
      M.unbindDocListeners();
      M.notifyLayout();
    };
    M.onStartDocMouseDown = function onStartDocMouseDown(ev) {
      if (!M.startOpen) return;
      if (M.startPicker.contains(ev.target)) return;
      M.hideStartPicker();
    };
    M.emitChange = function emitChange() {
      M.refreshCountdown();
      M.refreshStartTrigger();
      M.refreshRecurrenceUi();
      M.onChange(M.getValues());
    };
    M.getValues = function getValues() {
      var vagueActive = M.currentMode === S.DUE_DATE_MODE_VAGUE && !!M.currentVague;
      var out = {
        dueDate: M.current || '',
        dueTime: M.current && M.currentMode === S.DUE_DATE_MODE_PRECISE ? (M.currentTime || '') : '',
        dueEnabled: !!(M.current || vagueActive),
        dueMode: M.currentMode,
        dueVague: vagueActive ? M.currentVague : '',
        startDate:
          M.currentMode === S.DUE_DATE_MODE_PRECISE ? M.currentStart || '' : '',
        recurrence:
          M.currentMode === S.DUE_DATE_MODE_PRECISE ? M.currentRecurrence : null,
        dueLimitState: M.currentDueLimitState,
        dateFixe: M.currentMode === S.DUE_DATE_MODE_VAGUE ? false : M.currentDateFixe
      };
      return out;
    };
    M.getValue = function getValue() {
      return M.current || '';
    };
    M.setValue = function setValue(value, options) {
      options = options || {};
      if (value && typeof value === 'object') {
        M.current = S.normalizeDueDate(value.dueDate);
        M.currentTime = M.current ? S.normalizeDueTime(value.dueTime) : '';
        if (M.currentTime) M.rememberedTime = M.currentTime;
        // dueEnabled:false with a date means "cleared" (legacy disable checkbox).
        if (value.dueEnabled === false) {
          M.current = '';
          M.currentTime = '';
          M.currentVague = '';
          M.rememberedVague = '';
        }
        if (value.dueVague !== undefined) {
          var nextVague = S.normalizeDueVague(value.dueVague);
          if (nextVague) {
            M.currentVague = nextVague;
            M.rememberedVague = nextVague;
          } else {
            // Empty dueVague while precise must not wipe session memory.
            M.currentVague = '';
          }
        }
        if (value.dueMode !== undefined) {
          M.currentMode = S.normalizeDueMode(value.dueMode);
        } else if (M.currentVague) {
          M.currentMode = S.DUE_DATE_MODE_VAGUE;
        }
        if (M.currentMode === S.DUE_DATE_MODE_VAGUE) {
          if (!M.currentVague && M.rememberedVague) M.currentVague = M.rememberedVague;
          if (M.currentVague && !M.current) {
            M.current = S.resolveDueVagueToDate(M.currentVague);
          }
          M.currentTime = '';
          M.currentStart = '';
          M.currentRecurrence = null;
        } else {
          if (M.currentVague) M.rememberedVague = M.currentVague;
          M.currentVague = '';
        }
        if (value.startDate !== undefined && M.currentMode === S.DUE_DATE_MODE_PRECISE) {
          M.currentStart = S.normalizeDueDate(value.startDate);
        }
        if (value.recurrence !== undefined && M.currentMode === S.DUE_DATE_MODE_PRECISE) {
          M.currentRecurrence = S.normalizeRecurrence(value.recurrence);
        }
        if (value.dueLimitState !== undefined) {
          M.currentDueLimitState =
            value.dueLimitState === S.DUE_LIMIT_STATE_HAS
              ? S.DUE_LIMIT_STATE_HAS
              : S.DUE_LIMIT_STATE_NONE;
        }
        if (value.dateFixe !== undefined) {
          M.currentDateFixe = !!value.dateFixe;
        }
      } else {
        M.current = S.normalizeDueDate(value);
        if (!M.current) M.currentTime = '';
        if (M.currentVague) M.rememberedVague = M.currentVague;
        M.currentVague = '';
        M.currentMode = S.DUE_DATE_MODE_PRECISE;
      }
      if (M.current) {
        M.syncViewFromValue(M.current);
      } else {
        M.syncViewFromValue('');
      }
      M.syncStartViewFromValue(M.currentStart);
      if (M.collapseApi && options.expand != null) {
        M.collapseApi.setExpanded(!!options.expand, { notifyLayout: false });
      } else if (M.collapseApi && M.current && !options.preserveCollapse) {
        // Keep current expand state; do not force-open on every setValue.
      }
      M.refreshModeUi();
      M.refreshCountdown();
      M.refreshStartTrigger();
      M.refreshRecurrenceUi();
      M.paintDueLimitSwitch();
    };
    M.setEnabled = function setEnabled(nextEnabled, options) {
      // No enable checkbox — treat as expand control when asked to open/close.
      options = options || {};
      if (M.collapseApi && options.expand != null) {
        M.collapseApi.setExpanded(!!options.expand);
        return;
      }
      if (M.collapseApi && nextEnabled && options.expand !== false) {
        M.collapseApi.setExpanded(true);
      }
    };
    M.clampFocusToViewMonth = function clampFocusToViewMonth() {
      var daysInMonth = new Date(M.viewYear, M.viewMonth + 1, 0).getDate();
      var focusDay = S.dueDateToLocalDate(M.focusIso);
      var day = focusDay ? Math.min(focusDay.getDate(), daysInMonth) : 1;
      M.focusIso = S.toIsoDate(new Date(M.viewYear, M.viewMonth, day));
    };
    M.yearPickerRangeStart = function yearPickerRangeStart(year) {
      var nowYear = new Date().getFullYear();
      var y = year == null ? M.viewYear : year;
      if (y < nowYear) y = nowYear;
      var offset = y - nowYear;
      return nowYear + Math.floor(offset / S.DUE_DATE_YEAR_PICKER_COUNT) * S.DUE_DATE_YEAR_PICKER_COUNT;
    };
    M.syncNavChrome = function syncNavChrome() {
      var monthName = S.DUE_DATE_MONTH_NAMES[M.viewMonth];
      var monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      var focusDay = S.dueDateToLocalDate(M.focusIso);
      var nowYear = new Date().getFullYear();
      M.dayPickBtn.textContent = String(focusDay ? focusDay.getDate() : 1);
      M.monthPickBtn.textContent = monthCap;
      M.yearPickBtn.textContent = String(M.viewYear);
      M.dayPickBtn.hidden = M.calendarMode === 'year';
      M.monthPickBtn.hidden = M.calendarMode === 'year';
      M.yearPickBtn.hidden = false;
      M.dayPickBtn.setAttribute('aria-expanded', M.calendarMode === 'date' ? 'true' : 'false');
      M.monthPickBtn.setAttribute('aria-expanded', M.calendarMode === 'month' ? 'true' : 'false');
      M.yearPickBtn.setAttribute('aria-expanded', M.calendarMode === 'year' ? 'true' : 'false');
      M.dayPickBtn.classList.toggle('is-active', M.calendarMode === 'date');
      M.monthPickBtn.classList.toggle('is-active', M.calendarMode === 'month');
      M.yearPickBtn.classList.toggle('is-active', M.calendarMode === 'year');

      if (M.calendarMode === 'year') {
        if (M.yearPickerStart == null) M.yearPickerStart = M.yearPickerRangeStart(M.viewYear);
        if (M.yearPickerStart < nowYear) M.yearPickerStart = nowYear;
        var endYear = M.yearPickerStart + S.DUE_DATE_YEAR_PICKER_COUNT - 1;
        M.yearPickBtn.textContent = M.yearPickerStart + '\u2013' + endYear;
        M.prevBtn.setAttribute('aria-label', S.DUE_DATE_PREV_YEARS);
        M.nextBtn.setAttribute('aria-label', S.DUE_DATE_NEXT_YEARS);
        M.prevBtn.disabled = M.yearPickerStart <= nowYear;
      } else if (M.calendarMode === 'month') {
        M.yearPickBtn.textContent = String(M.viewYear);
        M.prevBtn.setAttribute('aria-label', S.DUE_DATE_PREV_YEAR);
        M.nextBtn.setAttribute('aria-label', S.DUE_DATE_NEXT_YEAR);
        M.prevBtn.disabled = false;
      } else {
        M.prevBtn.setAttribute('aria-label', S.DUE_DATE_PREV_MONTH);
        M.nextBtn.setAttribute('aria-label', S.DUE_DATE_NEXT_MONTH);
        M.prevBtn.disabled = false;
      }

      M.weekdays.hidden = M.calendarMode !== 'day';
      M.popover.dataset.calendarMode = M.calendarMode;
    };
    M.setCalendarMode = function setCalendarMode(mode) {
      var next = mode === 'month' || mode === 'year' || mode === 'date' ? mode : 'day';
      M.calendarMode = next;
      if (M.calendarMode === 'year') {
        M.yearPickerStart = M.yearPickerRangeStart(M.viewYear);
      }
      M.renderCalendar(M.calendarMode === 'day');
    };
    M.shiftCalendar = function shiftCalendar(delta) {
      if (M.calendarMode === 'year') {
        var nowYear = new Date().getFullYear();
        if (M.yearPickerStart == null) M.yearPickerStart = M.yearPickerRangeStart(M.viewYear);
        var nextStart = M.yearPickerStart + delta * S.DUE_DATE_YEAR_PICKER_COUNT;
        if (nextStart < nowYear) nextStart = nowYear;
        if (nextStart === M.yearPickerStart && delta < 0) return;
        M.yearPickerStart = nextStart;
        M.renderCalendar();
        return;
      }
      if (M.calendarMode === 'month') {
        M.viewYear += delta;
        M.clampFocusToViewMonth();
        M.renderCalendar(true);
        return;
      }
      var next = new Date(M.viewYear, M.viewMonth + delta, 1);
      M.viewYear = next.getFullYear();
      M.viewMonth = next.getMonth();
      M.clampFocusToViewMonth();
      M.renderCalendar(true);
    };
    M.selectMonth = function selectMonth(monthIndex) {
      if (monthIndex < 0 || monthIndex > 11) return;
      M.viewMonth = monthIndex;
      M.clampFocusToViewMonth();
      M.calendarMode = 'day';
      M.renderCalendar(true);
    };
    M.selectDayOfMonth = function selectDayOfMonth(dayNum) {
      if (!isFinite(dayNum) || dayNum < 1) return;
      var daysInMonth = new Date(M.viewYear, M.viewMonth + 1, 0).getDate();
      var day = Math.min(Math.floor(dayNum), daysInMonth);
      var iso = S.toIsoDate(new Date(M.viewYear, M.viewMonth, day));
      M.selectIso(iso);
    };
    M.selectYear = function selectYear(year) {
      if (!isFinite(year)) return;
      var nowYear = new Date().getFullYear();
      if (year < nowYear) return;
      M.viewYear = year;
      M.yearPickerStart = M.yearPickerRangeStart(year);
      M.clampFocusToViewMonth();
      M.calendarMode = 'month';
      M.renderCalendar();
    };
    M.selectIso = function selectIso(iso) {
      if (!M.enabled) return;
      var next = S.normalizeDueDate(iso);
      if (!next) return;
      if (M.currentMode !== S.DUE_DATE_MODE_PRECISE) {
        M.currentMode = S.DUE_DATE_MODE_PRECISE;
        if (M.currentVague) M.rememberedVague = M.currentVague;
        M.currentVague = '';
        M.refreshModeUi();
      }
      if (!M.currentTime) {
        M.currentTime = M.rememberedTime || S.DUE_DATE_TIME_DEFAULT;
      }
      if (M.currentTime) M.rememberedTime = M.currentTime;
      M.current = next;
      M.focusIso = next;
      M.syncViewFromValue(next);
      M.calendarMode = 'day';
      M.emitChange();
      M.renderCalendar();
    };
    M.focusDayButton = function focusDayButton(iso) {
      var btn = M.grid.querySelector('[data-iso="' + iso + '"]');
      if (btn) btn.focus();
    };
    M.renderDatePicker = function renderDatePicker() {
      M.grid.className = 'due-date-grid due-date-grid--dates';
      M.grid.setAttribute('role', 'listbox');
      M.grid.setAttribute('aria-label', S.DUE_DATE_PICK_DAY_LABEL);
      var daysInMonth = new Date(M.viewYear, M.viewMonth + 1, 0).getDate();
      var now = S.startOfLocalDay(new Date());
      var todayDay =
        now.getFullYear() === M.viewYear && now.getMonth() === M.viewMonth ? now.getDate() : -1;
      var selectedDay = M.current
        ? (function () {
            var d = S.dueDateToLocalDate(M.current);
            return d && d.getFullYear() === M.viewYear && d.getMonth() === M.viewMonth
              ? d.getDate()
              : -1;
          })()
        : -1;
      var focusDay = S.dueDateToLocalDate(M.focusIso);
      var focusedDay =
        focusDay && focusDay.getFullYear() === M.viewYear && focusDay.getMonth() === M.viewMonth
          ? focusDay.getDate()
          : -1;

      for (var d = 1; d <= daysInMonth; d++) {
        var dateBtn = document.createElement('button');
        dateBtn.type = 'button';
        dateBtn.className = 'due-date-date-option';
        dateBtn.dataset.day = String(d);
        dateBtn.textContent = String(d);
        dateBtn.setAttribute('role', 'option');
        dateBtn.setAttribute(
          'aria-label',
          d +
            ' ' +
            S.DUE_DATE_MONTH_NAMES[M.viewMonth] +
            ' ' +
            M.viewYear
        );
        var cellDate = new Date(M.viewYear, M.viewMonth, d);
        var isPast = cellDate.getTime() < now.getTime();
        var daySelected = d === focusedDay || (focusedDay < 0 && d === selectedDay);
        dateBtn.setAttribute('aria-selected', daySelected ? 'true' : 'false');
        if (d === todayDay) dateBtn.classList.add('is-today');
        if (d === selectedDay) dateBtn.classList.add('is-current');
        if (daySelected) dateBtn.classList.add('is-selected');
        if (isPast) dateBtn.classList.add('is-past');
        dateBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          M.selectDayOfMonth(+ev.currentTarget.dataset.day);
        });
        M.grid.appendChild(dateBtn);
      }
    };
    M.renderMonthPicker = function renderMonthPicker() {
      M.grid.className = 'due-date-grid due-date-grid--months';
      M.grid.setAttribute('role', 'listbox');
      M.grid.setAttribute('aria-label', S.DUE_DATE_PICK_MONTH_LABEL);
      var now = new Date();
      var thisMonth = now.getFullYear() === M.viewYear ? now.getMonth() : -1;
      var selectedMonth = M.current
        ? (function () {
            var d = S.dueDateToLocalDate(M.current);
            return d && d.getFullYear() === M.viewYear ? d.getMonth() : -1;
          })()
        : -1;

      for (var m = 0; m < 12; m++) {
        var monthBtn = document.createElement('button');
        monthBtn.type = 'button';
        monthBtn.className = 'due-date-month-option';
        monthBtn.dataset.month = String(m);
        monthBtn.textContent = S.DUE_DATE_MONTH_SHORT[m];
        monthBtn.setAttribute('role', 'option');
        monthBtn.setAttribute(
          'aria-label',
          S.DUE_DATE_MONTH_NAMES[m].charAt(0).toUpperCase() + S.DUE_DATE_MONTH_NAMES[m].slice(1) + ' ' + M.viewYear
        );
        var isPast =
          M.viewYear < now.getFullYear() ||
          (M.viewYear === now.getFullYear() && m < now.getMonth());
        var monthSelected = m === M.viewMonth;
        monthBtn.setAttribute('aria-selected', monthSelected ? 'true' : 'false');
        if (m === thisMonth) monthBtn.classList.add('is-today');
        if (m === selectedMonth) monthBtn.classList.add('is-current');
        if (monthSelected) monthBtn.classList.add('is-selected');
        if (isPast) monthBtn.classList.add('is-past');
        monthBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          M.selectMonth(+ev.currentTarget.dataset.month);
        });
        M.grid.appendChild(monthBtn);
      }
    };
    M.renderYearPicker = function renderYearPicker() {
      M.grid.className = 'due-date-grid due-date-grid--years';
      M.grid.setAttribute('role', 'listbox');
      M.grid.setAttribute('aria-label', S.DUE_DATE_PICK_YEAR_LABEL);
      var nowYear = new Date().getFullYear();
      if (M.yearPickerStart == null || M.yearPickerStart < nowYear) {
        M.yearPickerStart = M.yearPickerRangeStart(M.viewYear);
      }
      var selectedYear = M.current
        ? (function () {
            var d = S.dueDateToLocalDate(M.current);
            return d ? d.getFullYear() : -1;
          })()
        : -1;

      for (var i = 0; i < S.DUE_DATE_YEAR_PICKER_COUNT; i++) {
        var year = M.yearPickerStart + i;
        var yearBtn = document.createElement('button');
        yearBtn.type = 'button';
        yearBtn.className = 'due-date-year-option';
        yearBtn.dataset.year = String(year);
        yearBtn.textContent = String(year);
        yearBtn.setAttribute('role', 'option');
        yearBtn.setAttribute('aria-label', String(year));
        var yearSelected = year === M.viewYear;
        yearBtn.setAttribute('aria-selected', yearSelected ? 'true' : 'false');
        if (year === nowYear) yearBtn.classList.add('is-today');
        if (year === selectedYear) yearBtn.classList.add('is-current');
        if (yearSelected) yearBtn.classList.add('is-selected');
        yearBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          M.selectYear(+ev.currentTarget.dataset.year);
        });
        M.grid.appendChild(yearBtn);
      }
    };
    M.renderDayGrid = function renderDayGrid(keepFocus) {
      M.grid.className = 'due-date-grid';
      M.grid.setAttribute('role', 'grid');
      M.grid.setAttribute('aria-labelledby', M.uid + '-month');

      var first = new Date(M.viewYear, M.viewMonth, 1);
      var startOffset = S.sundayOffset(first);
      var gridStart = new Date(M.viewYear, M.viewMonth, 1 - startOffset);
      var todayIso = S.toIsoDate(S.startOfLocalDay(new Date()));

      var row = null;
      for (var i = 0; i < 42; i++) {
        if (i % 7 === 0) {
          row = document.createElement('div');
          row.className = 'due-date-row';
          row.setAttribute('role', 'row');
          M.grid.appendChild(row);
        }
        var cellDate = new Date(
          gridStart.getFullYear(),
          gridStart.getMonth(),
          gridStart.getDate() + i
        );
        var iso = S.toIsoDate(cellDate);
        var inMonth = cellDate.getMonth() === M.viewMonth;
        var isToday = iso === todayIso;
        var isPast = iso < todayIso;
        var isSelected = !!M.current && iso === M.current;
        var isFocused = iso === M.focusIso;

        var cell = document.createElement('div');
        cell.className = 'due-date-cell';
        cell.setAttribute('role', 'gridcell');

        var dayBtn = document.createElement('button');
        dayBtn.type = 'button';
        dayBtn.className = 'due-date-day';
        dayBtn.dataset.iso = iso;
        dayBtn.textContent = String(cellDate.getDate());
        dayBtn.setAttribute(
          'aria-label',
          S.DUE_DATE_WEEKDAY_NAMES[S.sundayOffset(cellDate)] +
            ' ' +
            cellDate.getDate() +
            ' ' +
            S.DUE_DATE_MONTH_NAMES[cellDate.getMonth()] +
            ' ' +
            cellDate.getFullYear()
        );
        dayBtn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        dayBtn.tabIndex = isFocused ? 0 : -1;

        if (!inMonth) dayBtn.classList.add('is-outside');
        if (isToday) dayBtn.classList.add('is-today');
        if (isPast) dayBtn.classList.add('is-past');
        if (isSelected) dayBtn.classList.add('is-selected');

        dayBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          M.selectIso(ev.currentTarget.dataset.iso);
        });

        cell.appendChild(dayBtn);
        row.appendChild(cell);
      }

      if (keepFocus) M.focusDayButton(M.focusIso);
    };
    M.renderCalendar = function renderCalendar(keepFocus) {
      M.syncNavChrome();
      M.grid.textContent = '';
      if (M.calendarMode === 'month') {
        M.renderMonthPicker();
        return;
      }
      if (M.calendarMode === 'year') {
        M.renderYearPicker();
        return;
      }
      if (M.calendarMode === 'date') {
        M.renderDatePicker();
        return;
      }
      M.renderDayGrid(keepFocus);
    };
    M.shiftMonth = function shiftMonth(delta) {
      M.shiftCalendar(delta);
    };
    M.onDocKeyDown = function onDocKeyDown(ev) {
      if (ev.key === 'Escape' && M.startOpen) {
        ev.preventDefault();
        M.hideStartPicker();
        return;
      }
      if (!M.open || !M.enabled || M.calendarMode !== 'day') return;
      if (!M.grid.contains(document.activeElement) && document.activeElement !== M.todayBtn) {
        return;
      }
      var focusDate = S.dueDateToLocalDate(M.focusIso) || S.startOfLocalDay(new Date());
      var nextDate = null;
      if (ev.key === 'ArrowLeft') {
        nextDate = new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate() - 1);
      } else if (ev.key === 'ArrowRight') {
        nextDate = new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate() + 1);
      } else if (ev.key === 'ArrowUp') {
        nextDate = new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate() - 7);
      } else if (ev.key === 'ArrowDown') {
        nextDate = new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate() + 7);
      } else if (ev.key === 'Home') {
        nextDate = new Date(M.viewYear, M.viewMonth, 1);
      } else if (ev.key === 'End') {
        nextDate = new Date(M.viewYear, M.viewMonth + 1, 0);
      } else if (ev.key === 'PageUp') {
        ev.preventDefault();
        M.shiftMonth(ev.shiftKey ? -12 : -1);
        return;
      } else if (ev.key === 'PageDown') {
        ev.preventDefault();
        M.shiftMonth(ev.shiftKey ? 12 : 1);
        return;
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        if (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.iso) {
          ev.preventDefault();
          M.selectIso(document.activeElement.dataset.iso);
        }
        return;
      }
      if (!nextDate) return;
      ev.preventDefault();
      M.focusIso = S.toIsoDate(nextDate);
      if (nextDate.getMonth() !== M.viewMonth || nextDate.getFullYear() !== M.viewYear) {
        M.viewYear = nextDate.getFullYear();
        M.viewMonth = nextDate.getMonth();
      }
      M.renderCalendar(true);
    };
    M.bindDocListeners = function bindDocListeners() {
      if (M.docListenersBound) return;
      document.addEventListener('keydown', M.onDocKeyDown, true);
      M.docListenersBound = true;
    };
    M.unbindDocListeners = function unbindDocListeners() {
      if (M.docListenersBound && !M.open && !M.timeOpen && !M.startOpen) {
        document.removeEventListener('keydown', M.onDocKeyDown, true);
        M.docListenersBound = false;
      }
    };
    M.showPickers = function showPickers() {
      if (!M.enabled) return;
      var wasOpen = M.open && M.timeOpen;
      M.open = true;
      M.timeOpen = true;
      M.calendarMode = 'day';
      if (M.current) M.syncViewFromValue(M.current);
      else {
        M.syncViewFromValue('');
        M.focusIso = S.toIsoDate(S.startOfLocalDay(new Date()));
      }
      M.popover.hidden = false;
      M.timePopover.hidden = false;
      M.field.classList.add('is-open', 'is-time-open');
      M.setDialMode(M.dialMode === 'minute' ? 'minute' : 'hour');
      M.renderCalendar();
      M.syncTimePickerSelection();
      M.bindDocListeners();
      if (!wasOpen) M.notifyLayout();
    };
    M.hidePickers = function hidePickers() {
      if (!M.open && !M.timeOpen) return;
      M.commitDigitalEdits();
      M.open = false;
      M.timeOpen = false;
      M.popover.hidden = true;
      M.timePopover.hidden = true;
      M.field.classList.remove('is-open', 'is-time-open');
      M.unbindDocListeners();
      M.notifyLayout();
    };
    M.endClockDrag = function endClockDrag(event) {
      if (!M.dialDragging) return;
      M.dialDragging = false;
      M.clockFace.classList.remove('is-dragging');
      if (event && M.dialMode === 'hour') M.setDialMode('minute');
    };
    },
    run: function (M) {
    M.masterClearBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!M.enabled) return;
      M.clearDueDateAndTime();
    });
    M.dateTrashBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!M.enabled) return;
      M.clearDueDateAndTime();
    });
    M.preciseModeBtn.addEventListener('click', function () {
      M.setDueMode(S.DUE_DATE_MODE_PRECISE);
    });
    M.vagueModeBtn.addEventListener('click', function () {
      M.setDueMode(S.DUE_DATE_MODE_VAGUE);
    });
    M.timeTrashBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!M.enabled) return;
      M.currentTime = '';
      M.rememberedTime = '';
      S.playPriorityUiSound('trash');
      M.emitChange();
      if (M.timeOpen) M.syncTimePickerSelection();
    });
    M.digitalHourInput.addEventListener('focus', function () {
      M.setDialMode('hour');
      requestAnimationFrame(function () {
        M.digitalHourInput.select();
      });
    });
    M.digitalMinuteInput.addEventListener('focus', function () {
      M.setDialMode('minute');
      requestAnimationFrame(function () {
        M.digitalMinuteInput.select();
      });
    });
    M.digitalHourInput.addEventListener('click', function () {
      M.digitalHourInput.select();
    });
    M.digitalMinuteInput.addEventListener('click', function () {
      M.digitalMinuteInput.select();
    });
    M.digitalHourInput.addEventListener('input', function () {
      M.digitalHourInput.value = M.digitsOnly(M.digitalHourInput.value, 2);
      if (M.digitalHourInput.value.length === 2) {
        M.commitDigitalHour({ advance: true });
      }
    });
    M.digitalMinuteInput.addEventListener('input', function () {
      M.digitalMinuteInput.value = M.digitsOnly(M.digitalMinuteInput.value, 2);
      if (M.digitalMinuteInput.value.length === 2) {
        M.commitDigitalMinute();
      }
    });
    M.digitalHourInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        M.commitDigitalHour({ advance: true });
      } else if (event.key === 'ArrowRight' &&
          M.digitalHourInput.selectionStart === M.digitalHourInput.value.length) {
        event.preventDefault();
        M.commitDigitalHour({ advance: true });
      }
    });
    M.digitalMinuteInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        M.commitDigitalMinute();
        M.digitalMinuteInput.blur();
      } else if (event.key === 'ArrowLeft' && M.digitalMinuteInput.selectionStart === 0) {
        event.preventDefault();
        M.commitDigitalMinute();
        M.setDialMode('hour');
        M.digitalHourInput.focus();
        M.digitalHourInput.select();
      }
    });
    M.digitalHourInput.addEventListener('blur', function () {
      /* Defer so focus moves (e.g. hour → minute) before commit. */
      setTimeout(function () {
        if (document.activeElement === M.digitalHourInput) return;
        if (!M.timeOpen) return;
        if (M.digitalHourInput.value.length) M.commitDigitalHour();
        else M.digitalHourInput.value = M.digitalHourDisplayValue();
      }, 0);
    });
    M.digitalMinuteInput.addEventListener('blur', function () {
      setTimeout(function () {
        if (document.activeElement === M.digitalMinuteInput) return;
        if (!M.timeOpen) return;
        if (M.digitalMinuteInput.value.length) M.commitDigitalMinute();
        else M.digitalMinuteInput.value = S.pad2(M.dialMinute);
      }, 0);
    });
    M.amBtn.addEventListener('click', function () {
      M.setMeridiem(false);
    });
    M.pmBtn.addEventListener('click', function () {
      M.setMeridiem(true);
    });
    M.clockFace.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      if (event.target && event.target.closest &&
          event.target.closest('.due-date-time-clock-num')) {
        return;
      }
      M.dialDragging = true;
      M.clockFace.classList.add('is-dragging');
      if (M.clockFace.setPointerCapture) {
        try { M.clockFace.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
      }
      M.applyPointerToDial(event.clientX, event.clientY, false);
      event.preventDefault();
    });
    M.clockFace.addEventListener('pointermove', function (event) {
      if (!M.dialDragging) return;
      M.applyPointerToDial(event.clientX, event.clientY, false);
    });
    M.clockFace.addEventListener('pointerup', M.endClockDrag);
    M.clockFace.addEventListener('pointercancel', M.endClockDrag);
    M.clockFace.addEventListener('keydown', function (event) {
      var step = event.shiftKey ? 5 : 1;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (M.dialMode === 'hour') M.dialHour = (M.dialHour + 1) % 24;
        else M.dialMinute = (M.dialMinute + step) % 60;
        M.commitDialTime(false);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        if (M.dialMode === 'hour') M.dialHour = (M.dialHour + 23) % 24;
        else M.dialMinute = (M.dialMinute + 60 - step) % 60;
        M.commitDialTime(false);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        M.setDialMode(M.dialMode === 'hour' ? 'minute' : 'hour');
      }
    });
    M.prevBtn.addEventListener('click', function () {
      M.shiftMonth(-1);
    });
    M.nextBtn.addEventListener('click', function () {
      M.shiftMonth(1);
    });
    M.monthPickBtn.addEventListener('click', function () {
      M.setCalendarMode(M.calendarMode === 'month' ? 'day' : 'month');
    });
    M.dayPickBtn.addEventListener('click', function () {
      M.setCalendarMode(M.calendarMode === 'date' ? 'day' : 'date');
    });
    M.yearPickBtn.addEventListener('click', function () {
      M.setCalendarMode(M.calendarMode === 'year' ? 'day' : 'year');
    });
    M.todayBtn.addEventListener('click', function () {
      M.calendarMode = 'day';
      M.selectIso(S.toIsoDate(S.startOfLocalDay(new Date())));
    });
    M.startTrigger.addEventListener('click', function (event) {
      if (event.target.closest('.due-date-trigger-clear')) return;
      event.preventDefault();
      event.stopPropagation();
      if (M.startOpen) M.hideStartPicker();
      else M.showStartPicker();
    });
    M.startTrigger.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('.due-date-trigger-clear')) return;
      event.preventDefault();
      if (M.startOpen) M.hideStartPicker();
      else M.showStartPicker();
    });
    M.startTrashBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      M.currentStart = '';
      S.playPriorityUiSound('trash');
      M.emitChange();
      if (M.startOpen) {
        M.syncStartViewFromValue('');
        M.renderStartCalendar();
      }
    });
    M.startPrevBtn.addEventListener('click', function () {
      M.shiftStartMonth(-1);
    });
    M.startNextBtn.addEventListener('click', function () {
      M.shiftStartMonth(1);
    });
    M.startTodayBtn.addEventListener('click', function () {
      M.selectStartIso(S.toIsoDate(S.startOfLocalDay(new Date())));
    });
    M.recurringSelect.addEventListener('change', function () {
      var freq = M.recurringSelect.value;
      if (!freq) {
        M.currentRecurrence = null;
      } else {
        if (!M.current) {
          M.current = S.toIsoDate(S.startOfLocalDay(new Date()));
          M.focusIso = M.current;
          M.syncViewFromValue(M.current);
        }
        if (!M.currentTime) {
          M.currentTime = M.rememberedTime || S.DUE_DATE_TIME_DEFAULT;
          M.rememberedTime = M.currentTime;
        }
        var weekdays;
        if (freq === 'weekly') {
          if (
            M.currentRecurrence &&
            M.currentRecurrence.frequency === 'weekly' &&
            M.currentRecurrence.weekdays &&
            M.currentRecurrence.weekdays.length
          ) {
            weekdays = M.currentRecurrence.weekdays.slice();
          } else {
            var due = S.dueDateToLocalDate(M.current);
            weekdays = [due ? due.getDay() : new Date().getDay()];
          }
        }
        M.currentRecurrence = S.normalizeRecurrence({
          frequency: freq,
          interval:
            M.currentRecurrence && M.currentRecurrence.interval
              ? M.currentRecurrence.interval
              : 1,
          weekdays: weekdays
        });
      }
      M.emitChange();
    });
    M.recurringClearBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!M.currentRecurrence) return;
      M.currentRecurrence = null;
      S.playPriorityUiSound('trash');
      M.emitChange();
    });
    M.recurringIntervalInput.addEventListener('change', function () {
      if (!M.currentRecurrence) return;
      var next = Math.round(Number(M.recurringIntervalInput.value));
      if (!isFinite(next) || next < 1) next = 1;
      if (next > 99) next = 99;
      M.currentRecurrence = S.normalizeRecurrence({
        frequency: M.currentRecurrence.frequency,
        interval: next,
        weekdays: M.currentRecurrence.weekdays
      });
      M.emitChange();
    });
    M.recurringTimeInput.addEventListener('change', function () {
      if (!M.currentRecurrence) return;
      M.selectTime(M.recurringTimeInput.value || S.DUE_DATE_TIME_DEFAULT);
    });
    M.collapseApi = S.bindCollapsibleEnable({
      field: M.field,
      body: M.body,
      chrome: M.chrome,
      alwaysEnabled: true,
      enabled: true,
      expanded: M.config.expanded != null ? !!M.config.expanded : !!M.current,
      getSummary: M.buildDueSummary,
      onLayoutChange: M.notifyLayout,
      onExpandChange: function (expanded, options) {
        M.refreshSuggestions();
        if (typeof M.config.onExpandChange === 'function') {
          M.config.onExpandChange(expanded, options);
        }
      },
      getContextMenuItems: function (api) {
        if (
          !global.ContextMenu ||
          typeof global.ContextMenu.buildDueItems !== 'function'
        ) {
          return [];
        }
        var hasDue = !!(
          M.current ||
          (M.currentMode === S.DUE_DATE_MODE_VAGUE && M.currentVague)
        );
        return ContextMenu.buildDueItems({
          isExpanded: api.isExpanded,
          setExpanded: api.setExpanded,
          suggestions: S.DUE_DATE_QUICK_SUGGESTIONS,
          applyQuick: function (id) {
            api.setExpanded(true);
            M.applyQuickSuggestion(id);
          },
          clearDue: function () {
            M.clearDueDateAndTime();
          },
          clearDisabled: !hasDue,
        });
      },
    });
    M.refreshCountdown();
    M.refreshStartTrigger();
    M.refreshRecurrenceUi();
    M.refreshModeUi();
    return { v: {
      el: M.field,
      getValue: M.getValue,
      getValues: M.getValues,
      setValue: M.setValue,
      setEnabled: M.setEnabled,
      applyQuickSuggestion: M.applyQuickSuggestion,
      clearDueDateAndTime: M.clearDueDateAndTime,
      refreshTimeFormat: function () {
        M.refreshCountdown();
      },
      setEnableAllowed: M.collapseApi.setEnableAllowed,
      isEnableAllowed: M.collapseApi.isEnableAllowed,
      setExpanded: M.collapseApi.setExpanded,
      isEnabled: function () {
        return !!(M.current || (M.currentMode === S.DUE_DATE_MODE_VAGUE && M.currentVague));
      },
      isExpanded: M.collapseApi.isExpanded
    } };
    }
  });
})(typeof window !== 'undefined' ? window : this);
