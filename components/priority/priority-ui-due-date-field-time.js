/**
 * priority-ui-due-date-field: createDueDateField() part 1 of 2.
 * The body of createDueDateField runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see priority-ui-due-date-field.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var P = (global.PriorityUIPartsMountCreateDueDateField = global.PriorityUIPartsMountCreateDueDateField || { list: [] });

  P.list.push({
    define: function (M) {
    M.syncViewFromValue = function syncViewFromValue(iso) {
      var date = S.dueDateToLocalDate(iso) || S.startOfLocalDay(new Date());
      M.viewYear = date.getFullYear();
      M.viewMonth = date.getMonth();
      M.focusIso = S.toIsoDate(date);
    };
    M.syncStartViewFromValue = function syncStartViewFromValue(iso) {
      var date = S.dueDateToLocalDate(iso) || S.startOfLocalDay(new Date());
      M.startViewYear = date.getFullYear();
      M.startViewMonth = date.getMonth();
      M.startFocusIso = S.toIsoDate(date);
    };
    M.makeDueLimitBtn = function makeDueLimitBtn(limitState, label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'due-limit-state-btn';
      btn.setAttribute('role', 'radio');
      btn.dataset.dueLimitState = limitState;
      btn.textContent = label;
      M.dueLimitSwitch.appendChild(btn);
      return btn;
    };
    M.syncDateFixeRow = function syncDateFixeRow() {
      var isNone = M.currentDueLimitState === S.DUE_LIMIT_STATE_NONE;
      var isVague = M.currentMode === S.DUE_DATE_MODE_VAGUE;
      M.dateFixeRow.hidden = isNone || isVague;
      M.dateFixeCheckbox.checked = M.currentDateFixe;
    };
    M.paintDueLimitSwitch = function paintDueLimitSwitch() {
      var isNone = M.currentDueLimitState === S.DUE_LIMIT_STATE_NONE;
      M.dueLimitNoneBtn.classList.toggle('is-active', isNone);
      M.dueLimitNoneBtn.setAttribute('aria-checked', isNone ? 'true' : 'false');
      M.dueLimitHasBtn.classList.toggle('is-active', !isNone);
      M.dueLimitHasBtn.setAttribute('aria-checked', !isNone ? 'true' : 'false');
      M.body.classList.toggle('is-due-limit-none', isNone);
      M.syncDateFixeRow();
    };
    M.setDueLimitState = function setDueLimitState(nextState) {
      var normalized = nextState === S.DUE_LIMIT_STATE_HAS ? S.DUE_LIMIT_STATE_HAS : S.DUE_LIMIT_STATE_NONE;
      if (normalized === M.currentDueLimitState) return;
      M.currentDueLimitState = normalized;
      M.paintDueLimitSwitch();
      M.emitChange();
      M.notifyLayout();
    };
    M.makeDueModeBtn = function makeDueModeBtn(mode, label, icon) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'due-date-mode-btn';
      btn.setAttribute('role', 'radio');
      btn.dataset.dueMode = mode;
      btn.setAttribute('aria-label', label);
      btn.title = label;
      btn.innerHTML =
        '<i class="ti ' +
        icon +
        '" aria-hidden="true"></i>' +
        '<span class="due-date-mode-btn-label">' +
        label +
        '</span>';
      M.modeSwitch.appendChild(btn);
      return btn;
    };
    M.onVagueSliderInput = function onVagueSliderInput() {
      M.applyVagueOption(S.dueVagueIdAtIndex(M.vagueSlider.value), { fromSlider: true });
    };
    M.notifyLayout = function notifyLayout() {
      requestAnimationFrame(function () {
        M.onLayoutChange();
      });
    };
    M.ensureDueDateForTime = function ensureDueDateForTime() {
      if (M.current) return false;
      M.current = S.toIsoDate(S.startOfLocalDay(new Date()));
      M.focusIso = M.current;
      M.syncViewFromValue(M.current);
      return true;
    };
    M.refreshPeriodChipLabels = function refreshPeriodChipLabels() {
      var periodChips = M.timePeriods.querySelectorAll('[data-time]');
      for (var i = 0; i < periodChips.length; i++) {
        var chip = periodChips[i];
        var hhmm = chip.dataset.time || '';
        var display = S.formatDueTimeDisplay(hhmm) || hhmm;
        var timeEl = chip.querySelector('.due-date-time-chip-time');
        if (timeEl) timeEl.textContent = display;
        var period = S.matchDueTimePeriod(hhmm);
        var labelIso = M.current || S.toIsoDate(S.startOfLocalDay(new Date()));
        var label = period
          ? S.formatDueTimePeriodLabel(period, labelIso)
          : '';
        var labelEl = chip.querySelector('.due-date-time-chip-label');
        if (labelEl && label) labelEl.textContent = label;
        chip.setAttribute(
          'aria-label',
          label ? label + ', ' + display : display
        );
      }
      var hintEls = M.suggestions.querySelectorAll('.due-date-suggestion-hint[data-hint]');
      for (var h = 0; h < hintEls.length; h++) {
        var rawHint = hintEls[h].dataset.hint || '';
        hintEls[h].textContent = S.normalizeDueTime(rawHint)
          ? S.formatDueTimeDisplay(rawHint)
          : rawHint;
      }
    };
    M.applyClockFormatUi = function applyClockFormatUi() {
      var h12 = S.isHour12();
      M.meridiemGroup.hidden = !h12;
      M.clockFace.classList.toggle('is-hour12', h12);
      M.timePopover.classList.toggle('is-hour12', h12);
      M.refreshPeriodChipLabels();
    };
    M.refreshTimeRow = function refreshTimeRow() {
      /* Date + Heure stay fully enabled/visible whenever Échéance is on. */
      M.pickers.classList.toggle('has-time', !!M.currentTime);
      M.pickers.classList.toggle('has-date', !!M.current);
      M.field.classList.toggle('is-time-open', M.timeOpen);
      M.applyClockFormatUi();
      M.timeTitle.textContent = S.formatDueTimeTriggerTitle(M.current, M.currentTime);
      if (M.currentTime) {
        M.timeValue.textContent = S.formatDueTimeDisplay(M.currentTime);
        M.timeValue.classList.remove('is-placeholder');
        M.timeTrigger.classList.add('has-value');
        M.timeTrashBtn.hidden = false;
      } else {
        M.timeValue.textContent = S.DUE_DATE_TIME_PLACEHOLDER;
        M.timeValue.classList.add('is-placeholder');
        M.timeTrigger.classList.remove('has-value');
        M.timeTrashBtn.hidden = true;
      }
      if (M.timeOpen) M.syncTimePickerSelection();
    };
    M.parseDialTime = function parseDialTime(hhmm) {
      var normalized = S.normalizeDueTime(hhmm) || S.DUE_DATE_TIME_DEFAULT;
      var parts = normalized.split(':');
      return { hour: +parts[0], minute: +parts[1] };
    };
    M.dialHhmm = function dialHhmm() {
      return S.pad2(M.dialHour) + ':' + S.pad2(M.dialMinute);
    };
    M.setDialMode = function setDialMode(mode) {
      M.dialMode = mode === 'minute' ? 'minute' : 'hour';
      M.digitalHourInput.classList.toggle('is-active', M.dialMode === 'hour');
      M.digitalMinuteInput.classList.toggle('is-active', M.dialMode === 'minute');
      M.digitalHourInput.setAttribute('aria-pressed', M.dialMode === 'hour' ? 'true' : 'false');
      M.digitalMinuteInput.setAttribute('aria-pressed', M.dialMode === 'minute' ? 'true' : 'false');
      M.clockFace.dataset.mode = M.dialMode;
      M.clockModeLabel.textContent = M.dialMode === 'minute'
        ? S.DUE_DATE_TIME_MODE_MINUTE_LABEL
        : S.DUE_DATE_TIME_MODE_HOUR_LABEL;
      M.renderClockFace();
    };
    M.digitsOnly = function digitsOnly(value, maxLen) {
      return String(value || '').replace(/\D/g, '').slice(0, maxLen);
    };
    M.parseDigitalPart = function parseDigitalPart(value, min, max, fallback) {
      var digits = M.digitsOnly(value, 2);
      if (!digits) return fallback;
      var n = parseInt(digits, 10);
      if (isNaN(n)) return fallback;
      if (n < min) n = min;
      if (n > max) n = max;
      return n;
    };
    M.digitalHourDisplayValue = function digitalHourDisplayValue() {
      if (!S.isHour12()) return S.pad2(M.dialHour);
      return S.pad2(S.hour24ToHour12Parts(M.dialHour).hour12);
    };
    M.commitDigitalHour = function commitDigitalHour(opts) {
      var advance = !!(opts && opts.advance);
      if (S.isHour12()) {
        var hour12 = M.parseDigitalPart(
          M.digitalHourInput.value,
          1,
          12,
          S.hour24ToHour12Parts(M.dialHour).hour12
        );
        M.dialHour = S.hour12PartsToHour24(hour12, M.dialHour >= 12);
        M.digitalHourInput.value = S.pad2(hour12);
      } else {
        M.dialHour = M.parseDigitalPart(M.digitalHourInput.value, 0, 23, M.dialHour);
        M.digitalHourInput.value = S.pad2(M.dialHour);
      }
      M.commitDialTime(false);
      if (advance) {
        M.setDialMode('minute');
        M.digitalMinuteInput.focus();
        M.digitalMinuteInput.select();
      }
    };
    M.commitDigitalMinute = function commitDigitalMinute() {
      var next = M.parseDigitalPart(M.digitalMinuteInput.value, 0, 59, M.dialMinute);
      M.dialMinute = next;
      M.digitalMinuteInput.value = S.pad2(M.dialMinute);
      M.commitDialTime(false);
    };
    M.commitDigitalEdits = function commitDigitalEdits() {
      if (document.activeElement === M.digitalHourInput) M.commitDigitalHour();
      else if (document.activeElement === M.digitalMinuteInput) M.commitDigitalMinute();
    };
    M.setMeridiem = function setMeridiem(nextPm) {
      var isPm = M.dialHour >= 12;
      if (nextPm === isPm) return;
      M.dialHour = nextPm ? (M.dialHour % 12) + 12 : M.dialHour % 12;
      M.commitDialTime(false);
    };
    M.commitDialTime = function commitDialTime() {
      M.selectTime(M.dialHhmm());
    };
    M.clockAngleDeg = function clockAngleDeg(value, max) {
      return (value / max) * 360;
    };
    M.renderClockFace = function renderClockFace() {
      M.clockNums.textContent = '';
      var cx = S.DUE_DATE_TIME_CLOCK_SIZE / 2;
      var h12Mode = S.isHour12();
      var selected = M.dialMode === 'hour' ? M.dialHour : M.dialMinute;
      var angle;
      var radius;
      var valueText;

      if (M.dialMode === 'hour') {
        if (h12Mode) {
          var selected12 = S.hour24ToHour12Parts(M.dialHour).hour12;
          for (var n = 1; n <= 12; n++) {
            var hour12Btn = document.createElement('button');
            hour12Btn.type = 'button';
            hour12Btn.className =
              'due-date-time-clock-num due-date-time-clock-num--outer due-date-time-clock-num--h12';
            hour12Btn.textContent = String(n);
            hour12Btn.dataset.hour12 = String(n);
            hour12Btn.setAttribute('aria-label', n + ' h');
            if (n === selected12) hour12Btn.classList.add('is-selected');
            var h12Angle = M.clockAngleDeg(n % 12, 12);
            hour12Btn.style.left = cx + 'px';
            hour12Btn.style.top = cx + 'px';
            hour12Btn.style.transform =
              'rotate(' +
              h12Angle +
              'deg) translateY(-' +
              S.DUE_DATE_TIME_CLOCK_OUTER_R +
              'px) rotate(-' +
              h12Angle +
              'deg)';
            hour12Btn.addEventListener('click', function (ev) {
              ev.stopPropagation();
              M.dialHour = S.hour12PartsToHour24(+this.dataset.hour12, M.dialHour >= 12);
              M.commitDialTime(false);
              M.setDialMode('minute');
            });
            M.clockNums.appendChild(hour12Btn);
          }
          angle = M.clockAngleDeg(selected12 % 12, 12);
          radius = S.DUE_DATE_TIME_CLOCK_OUTER_R;
          valueText = selected12 + ' heures';
        } else {
          for (var h = 0; h < 24; h++) {
            var hourBtn = document.createElement('button');
            hourBtn.type = 'button';
            hourBtn.className =
              'due-date-time-clock-num' +
              (h >= 12
                ? ' due-date-time-clock-num--outer'
                : ' due-date-time-clock-num--inner');
            hourBtn.textContent = S.pad2(h);
            hourBtn.dataset.value = String(h);
            hourBtn.setAttribute('aria-label', S.pad2(h) + ' h');
            if (h === M.dialHour) hourBtn.classList.add('is-selected');
            var hourAngle = M.clockAngleDeg(h % 12, 12);
            var hourRadius =
              h >= 12 ? S.DUE_DATE_TIME_CLOCK_OUTER_R : S.DUE_DATE_TIME_CLOCK_INNER_R;
            hourBtn.style.left = cx + 'px';
            hourBtn.style.top = cx + 'px';
            hourBtn.style.transform =
              'rotate(' +
              hourAngle +
              'deg) translateY(-' +
              hourRadius +
              'px) rotate(-' +
              hourAngle +
              'deg)';
            hourBtn.addEventListener('click', function (ev) {
              ev.stopPropagation();
              M.dialHour = +this.dataset.value;
              M.commitDialTime(false);
              M.setDialMode('minute');
            });
            M.clockNums.appendChild(hourBtn);
          }
          angle = M.clockAngleDeg(M.dialHour % 12, 12);
          radius =
            M.dialHour >= 12
              ? S.DUE_DATE_TIME_CLOCK_OUTER_R
              : S.DUE_DATE_TIME_CLOCK_INNER_R;
          valueText = S.pad2(M.dialHour) + ' heures';
        }
      } else {
        S.DUE_DATE_TIME_MINUTE_STEPS.forEach(function (m) {
          var minuteBtn = document.createElement('button');
          minuteBtn.type = 'button';
          minuteBtn.className = 'due-date-time-clock-num due-date-time-clock-num--minute';
          minuteBtn.textContent = S.pad2(m);
          minuteBtn.dataset.value = String(m);
          minuteBtn.setAttribute('aria-label', S.pad2(m) + ' min');
          if (m === M.dialMinute) minuteBtn.classList.add('is-selected');
          var minuteAngle = M.clockAngleDeg(m, 60);
          minuteBtn.style.left = cx + 'px';
          minuteBtn.style.top = cx + 'px';
          minuteBtn.style.transform =
            'rotate(' + minuteAngle + 'deg) translateY(-' + S.DUE_DATE_TIME_CLOCK_MINUTE_R +
            'px) rotate(-' + minuteAngle + 'deg)';
          minuteBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            M.dialMinute = +this.dataset.value;
            M.commitDialTime(false);
          });
          M.clockNums.appendChild(minuteBtn);
        });
        angle = M.clockAngleDeg(M.dialMinute, 60);
        radius = S.DUE_DATE_TIME_CLOCK_MINUTE_R;
        valueText = S.pad2(M.dialMinute) + ' minutes';
      }

      M.clockHand.style.transform = 'rotate(' + angle + 'deg)';
      M.clockHand.style.setProperty('--hand-length', radius + 'px');
      M.clockFace.setAttribute('aria-valuenow', String(selected));
      M.clockFace.setAttribute('aria-valuetext', valueText);

      if (document.activeElement !== M.digitalHourInput) {
        M.digitalHourInput.value = M.digitalHourDisplayValue();
      }
      if (document.activeElement !== M.digitalMinuteInput) {
        M.digitalMinuteInput.value = S.pad2(M.dialMinute);
      }

      var isPm = M.dialHour >= 12;
      M.amBtn.classList.toggle('is-selected', !isPm);
      M.pmBtn.classList.toggle('is-selected', isPm);
      M.amBtn.setAttribute('aria-pressed', !isPm ? 'true' : 'false');
      M.pmBtn.setAttribute('aria-pressed', isPm ? 'true' : 'false');
    };
    M.valueFromClockPointer = function valueFromClockPointer(clientX, clientY) {
      var rect = M.clockFace.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = clientX - cx;
      var dy = clientY - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (deg < 0) deg += 360;

      if (M.dialMode === 'hour') {
        var slot = Math.round(deg / 30) % 12;
        if (S.isHour12()) {
          var hour12 = slot === 0 ? 12 : slot;
          return S.hour12PartsToHour24(hour12, M.dialHour >= 12);
        }
        var mid = (S.DUE_DATE_TIME_CLOCK_INNER_R + S.DUE_DATE_TIME_CLOCK_OUTER_R) / 2;
        var scale = rect.width / S.DUE_DATE_TIME_CLOCK_SIZE;
        var useOuter = dist > mid * scale;
        return useOuter ? (slot === 0 ? 12 : slot + 12) : slot;
      }

      var minute = Math.round(deg / 30) * 5;
      if (minute >= 60) minute = 0;
      return minute;
    };
    M.applyPointerToDial = function applyPointerToDial(clientX, clientY, advanceOnHour) {
      var next = M.valueFromClockPointer(clientX, clientY);
      if (M.dialMode === 'hour') {
        if (next === M.dialHour) return;
        M.dialHour = next;
        M.commitDialTime(false);
        if (advanceOnHour) M.setDialMode('minute');
        else M.renderClockFace();
      } else {
        if (next === M.dialMinute) return;
        M.dialMinute = next;
        M.commitDialTime(false);
      }
    };
    M.syncTimePickerSelection = function syncTimePickerSelection() {
      var parsed = M.parseDialTime(M.currentTime || M.rememberedTime || S.DUE_DATE_TIME_DEFAULT);
      M.dialHour = parsed.hour;
      M.dialMinute = parsed.minute;
      M.renderClockFace();

      var periodChips = M.timePeriods.querySelectorAll('[data-time]');
      for (var p = 0; p < periodChips.length; p++) {
        var periodSelected = !!M.currentTime && periodChips[p].dataset.time === M.currentTime;
        periodChips[p].classList.toggle('is-selected', periodSelected);
        periodChips[p].setAttribute('aria-pressed', periodSelected ? 'true' : 'false');
      }
    };
    M.selectTime = function selectTime(hhmm) {
      if (!M.enabled) return;
      M.ensureDueDateForTime();
      if (!M.current) return;
      var next = S.normalizeDueTime(hhmm);
      M.currentTime = next || '';
      if (next) {
        M.rememberedTime = next;
        var parsed = M.parseDialTime(next);
        M.dialHour = parsed.hour;
        M.dialMinute = parsed.minute;
      }
      M.emitChange();
      M.syncTimePickerSelection();
    };
    M.refreshSuggestions = function refreshSuggestions() {
      var expanded = !M.collapseApi || M.collapseApi.isExpanded();
      var show =
        M.enabled &&
        expanded &&
        !M.current &&
        M.currentMode === S.DUE_DATE_MODE_PRECISE;
      var chips = M.suggestions.querySelectorAll('[data-suggestion]');
      var anyAvailable = false;
      for (var i = 0; i < chips.length; i++) {
        var available = S.isDueDateQuickSuggestionAvailable(chips[i].dataset.suggestion);
        chips[i].hidden = !available;
        if (available) anyAvailable = true;
      }
      var wasHidden = M.suggestions.hidden;
      M.suggestions.hidden = !(show && anyAvailable);
      if (wasHidden !== M.suggestions.hidden) M.notifyLayout();
    };
    },
    run: function (M) {
    M.el = M.config.el;
    M.onChange = M.config.onChange || function () {};
    M.onLayoutChange = M.config.onLayoutChange || function () {};
    M.initialValue = M.config.value;
    M.initialDate =
      M.initialValue && typeof M.initialValue === 'object'
        ? M.initialValue.dueDate
        : M.initialValue;
    M.initialTime =
      M.initialValue && typeof M.initialValue === 'object'
        ? M.initialValue.dueTime
        : M.config.time;
    M.current = S.normalizeDueDate(M.initialDate);
    M.currentTime = M.current ? S.normalizeDueTime(M.initialTime) : '';
    M.rememberedTime = M.currentTime || '';
    M.enabled = true;
    M.initialVague =
      M.initialValue && typeof M.initialValue === 'object'
        ? S.normalizeDueVague(M.initialValue.dueVague)
        : '';
    M.currentMode = S.normalizeDueMode(
      M.initialValue && typeof M.initialValue === 'object'
        ? M.initialValue.dueMode
        : null
    );
    if (M.initialVague) M.currentMode = S.DUE_DATE_MODE_VAGUE;
    M.hasDueDateInitially =
      (!!M.current || !!M.initialVague) &&
      (M.initialValue && typeof M.initialValue === 'object' && M.initialValue.dueEnabled != null
        ? !!M.initialValue.dueEnabled
        : M.config.enabled != null
          ? !!M.config.enabled
          : true);
    if (!M.hasDueDateInitially) {
      M.current = '';
      M.currentTime = '';
      M.initialVague = '';
    } else if (M.currentMode === S.DUE_DATE_MODE_VAGUE && M.initialVague && !M.current) {
      M.current = S.resolveDueVagueToDate(M.initialVague);
    }
    M.currentDueLimitState =
      M.initialValue &&
      typeof M.initialValue === 'object' &&
      (M.initialValue.dueLimitState === S.DUE_LIMIT_STATE_HAS ||
        M.initialValue.dueLimitState === S.DUE_LIMIT_STATE_NONE)
        ? M.initialValue.dueLimitState
        : M.hasDueDateInitially
          ? S.DUE_LIMIT_STATE_HAS
          : S.DUE_LIMIT_STATE_NONE;
    M.currentDateFixe = !!(
      M.initialValue &&
      typeof M.initialValue === 'object' &&
      M.initialValue.dateFixe
    );
    M.currentVague =
      M.currentMode === S.DUE_DATE_MODE_VAGUE && M.hasDueDateInitially
        ? M.initialVague
        : '';
    M.rememberedVague = M.currentVague || M.initialVague || '';
    M.currentStart =
      M.initialValue && typeof M.initialValue === 'object'
        ? S.normalizeDueDate(M.initialValue.startDate)
        : '';
    M.currentRecurrence = S.normalizeRecurrence(
      M.initialValue && typeof M.initialValue === 'object'
        ? M.initialValue.recurrence
        : null
    );
    if (M.currentMode === S.DUE_DATE_MODE_VAGUE) {
      M.currentTime = '';
      M.currentStart = '';
      M.currentRecurrence = null;
    }
    M.open = false;
    M.timeOpen = false;
    M.startOpen = false;
    M.startViewYear;
    M.startViewMonth;
    M.startFocusIso =
      M.currentStart || S.toIsoDate(S.startOfLocalDay(new Date()));
    M.viewYear;
    M.viewMonth;
    M.calendarMode = 'day';
    M.yearPickerStart = null;
    M.focusIso = M.current || S.toIsoDate(S.startOfLocalDay(new Date()));
    M.docListenersBound = false;
    M.uid = 'due-cal-' + Math.random().toString(36).slice(2, 9);
    M.bodyId = M.uid + '-body';
    M.collapseApi = null;
    M.syncViewFromValue(M.current);
    M.syncStartViewFromValue(M.currentStart);
    M.field = document.createElement('div');
    M.field.className = 'field field--due-date';
    M.chrome = S.createCollapsibleEnableChrome({
      title: S.DUE_DATE_LABEL,
      bodyId: M.bodyId,
      hideEnable: true,
      leadingIcon: 'ti-calendar',
      iconClass: 'due-leading-icon',
      titleClass: 'due-date-title',
      collapseLabel: 'Replier \u00c9ch\u00e9ance',
      expandLabel: 'D\u00e9velopper \u00c9ch\u00e9ance'
    });
    M.chrome.title.id = M.uid + '-label';
    M.masterClearBtn = document.createElement('button');
    M.masterClearBtn.type = 'button';
    M.masterClearBtn.className = 'due-date-master-clear';
    M.masterClearBtn.setAttribute('aria-label', S.DUE_DATE_MASTER_CLEAR_LABEL);
    M.masterClearBtn.title = S.DUE_DATE_MASTER_CLEAR_LABEL;
    M.masterClearBtn.hidden = true;
    M.masterClearBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    M.chrome.head.appendChild(M.masterClearBtn);
    M.field.appendChild(M.chrome.head);
    M.body = document.createElement('div');
    M.body.className = 'due-date-body section-toggle-body';
    M.body.id = M.bodyId;
    M.dueLimitSwitch = document.createElement('div');
    M.dueLimitSwitch.className = 'due-limit-state-switch';
    M.dueLimitSwitch.setAttribute('role', 'radiogroup');
    M.dueLimitSwitch.setAttribute('aria-label', 'Limite de temps');
    M.dueLimitNoneBtn = M.makeDueLimitBtn(S.DUE_LIMIT_STATE_NONE, 'N\u2019a pas de date limite');
    M.dueLimitHasBtn = M.makeDueLimitBtn(S.DUE_LIMIT_STATE_HAS, 'A une date limite');
    M.body.appendChild(M.dueLimitSwitch);
    M.dateFixeRow = document.createElement('div');
    M.dateFixeRow.className = 'due-date-fixe-row';
    M.dateFixeLabel = document.createElement('label');
    M.dateFixeLabel.className = 'due-date-fixe-label';
    M.dateFixeCheckbox = document.createElement('input');
    M.dateFixeCheckbox.type = 'checkbox';
    M.dateFixeCheckbox.className = 'due-date-fixe-checkbox';
    M.dateFixeCheckbox.checked = M.currentDateFixe;
    M.dateFixeText = document.createElement('span');
    M.dateFixeText.className = 'due-date-fixe-text';
    M.dateFixeText.textContent = 'Date fixe';
    M.dateFixeLabel.appendChild(M.dateFixeCheckbox);
    M.dateFixeLabel.appendChild(M.dateFixeText);
    M.dateFixeCopy = document.createElement('span');
    M.dateFixeCopy.className = 'due-date-fixe-copy';
    M.dateFixeCopy.textContent = S.DUE_DATE_FIXE_COPY;
    M.dateFixeRow.appendChild(M.dateFixeLabel);
    M.dateFixeRow.appendChild(M.dateFixeCopy);
    M.body.appendChild(M.dateFixeRow);
    M.dueLimitNoneBtn.addEventListener('click', function () {
      M.setDueLimitState(S.DUE_LIMIT_STATE_NONE);
    });
    M.dueLimitHasBtn.addEventListener('click', function () {
      M.setDueLimitState(S.DUE_LIMIT_STATE_HAS);
    });
    M.dateFixeCheckbox.addEventListener('change', function () {
      M.currentDateFixe = !!M.dateFixeCheckbox.checked;
      M.emitChange();
    });
    M.paintDueLimitSwitch();
    M.countdown = document.createElement('div');
    M.countdown.className = 'due-date-countdown';
    M.countdown.id = M.uid + '-desc';
    M.countdown.setAttribute('aria-live', 'polite');
    M.countdownMain = document.createElement('div');
    M.countdownMain.className = 'due-date-countdown-main';
    M.countdownPrimaryRow = document.createElement('div');
    M.countdownPrimaryRow.className = 'due-date-countdown-primary-row';
    M.countdownDot = document.createElement('span');
    M.countdownDot.className = 'heat-tier-dot due-date-countdown-dot';
    M.countdownDot.setAttribute('aria-hidden', 'true');
    M.countdownDot.hidden = true;
    M.countdownPrimary = document.createElement('div');
    M.countdownPrimary.className = 'due-date-countdown-primary';
    M.countdownPrimaryRow.appendChild(M.countdownDot);
    M.countdownPrimaryRow.appendChild(M.countdownPrimary);
    M.countdownSecondary = document.createElement('div');
    M.countdownSecondary.className = 'due-date-countdown-secondary';
    M.countdownMain.appendChild(M.countdownPrimaryRow);
    M.countdownMain.appendChild(M.countdownSecondary);
    M.modeSwitch = document.createElement('div');
    M.modeSwitch.className = 'due-date-mode-switch is-icons-only';
    M.modeSwitch.setAttribute('role', 'radiogroup');
    M.modeSwitch.setAttribute('aria-label', 'Mode d\'\u00e9ch\u00e9ance');
    M.preciseModeBtn = M.makeDueModeBtn(
      S.DUE_DATE_MODE_PRECISE,
      S.DUE_DATE_MODE_PRECISE_LABEL,
      'ti-target-arrow'
    );
    M.vagueModeBtn = M.makeDueModeBtn(
      S.DUE_DATE_MODE_VAGUE,
      S.DUE_DATE_MODE_VAGUE_LABEL,
      'ti-tilde'
    );
    M.countdown.appendChild(M.countdownMain);
    M.countdown.appendChild(M.modeSwitch);
    M.pickers = document.createElement('div');
    M.pickers.className = 'due-date-pickers';
    M.datePicker = document.createElement('div');
    M.datePicker.className = 'due-date-picker due-date-picker--calendar';
    M.trigger = document.createElement('div');
    M.trigger.className = 'due-date-trigger';
    M.trigger.setAttribute('role', 'group');
    M.trigger.setAttribute('aria-labelledby', M.uid + '-label');
    M.trigger.setAttribute('aria-describedby', M.uid + '-desc');
    M.triggerIcon = document.createElement('i');
    M.triggerIcon.className = 'ti ti-calendar due-date-trigger-icon';
    M.triggerIcon.setAttribute('aria-hidden', 'true');
    M.triggerText = document.createElement('span');
    M.triggerText.className = 'due-date-trigger-text';
    M.triggerTitle = document.createElement('span');
    M.triggerTitle.className = 'due-date-trigger-title';
    M.triggerTitle.textContent = S.DUE_DATE_BOX_LABEL;
    M.triggerRecurringHint = document.createElement('span');
    M.triggerRecurringHint.className = 'due-date-trigger-hint';
    M.triggerRecurringHint.hidden = true;
    M.triggerValue = document.createElement('span');
    M.triggerValue.className = 'due-date-trigger-value';
    M.triggerText.appendChild(M.triggerValue);
    M.triggerText.appendChild(M.triggerTitle);
    M.triggerText.appendChild(M.triggerRecurringHint);
    M.dateTrashBtn = document.createElement('button');
    M.dateTrashBtn.type = 'button';
    M.dateTrashBtn.className = 'due-date-trigger-clear';
    M.dateTrashBtn.setAttribute('aria-label', S.DUE_DATE_CLEAR_LABEL);
    M.dateTrashBtn.title = S.DUE_DATE_CLEAR_LABEL;
    M.dateTrashBtn.hidden = true;
    M.dateTrashBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    M.trigger.appendChild(M.triggerIcon);
    M.trigger.appendChild(M.triggerText);
    M.trigger.appendChild(M.dateTrashBtn);
    M.datePicker.appendChild(M.trigger);
    M.timePicker = document.createElement('div');
    M.timePicker.className = 'due-date-picker due-date-picker--time';
    M.timeTrigger = document.createElement('div');
    M.timeTrigger.className = 'due-date-time-trigger';
    M.timeTrigger.setAttribute('role', 'group');
    M.timeTrigger.setAttribute('aria-label', S.DUE_DATE_TIME_LABEL);
    M.timeIcon = document.createElement('i');
    M.timeIcon.className = 'ti ti-clock due-date-time-icon';
    M.timeIcon.setAttribute('aria-hidden', 'true');
    M.timeTriggerText = document.createElement('span');
    M.timeTriggerText.className = 'due-date-time-trigger-text';
    M.timeTitle = document.createElement('span');
    M.timeTitle.className = 'due-date-time-title';
    M.timeTitle.textContent = S.DUE_DATE_TIME_LABEL;
    M.timeRecurringHint = document.createElement('span');
    M.timeRecurringHint.className = 'due-date-time-hint';
    M.timeRecurringHint.hidden = true;
    M.timeValue = document.createElement('span');
    M.timeValue.className = 'due-date-time-value';
    M.timeTriggerText.appendChild(M.timeValue);
    M.timeTriggerText.appendChild(M.timeTitle);
    M.timeTriggerText.appendChild(M.timeRecurringHint);
    M.timeTrashBtn = document.createElement('button');
    M.timeTrashBtn.type = 'button';
    M.timeTrashBtn.className = 'due-date-time-trigger-clear';
    M.timeTrashBtn.setAttribute('aria-label', S.DUE_DATE_TIME_CLEAR_LABEL);
    M.timeTrashBtn.title = S.DUE_DATE_TIME_CLEAR_LABEL;
    M.timeTrashBtn.hidden = true;
    M.timeTrashBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    M.timeTrigger.appendChild(M.timeIcon);
    M.timeTrigger.appendChild(M.timeTriggerText);
    M.timeTrigger.appendChild(M.timeTrashBtn);
    M.timePicker.appendChild(M.timeTrigger);
    M.pickers.appendChild(M.datePicker);
    M.pickers.appendChild(M.timePicker);
    M.suggestions = document.createElement('div');
    M.suggestions.className = 'due-date-suggestions';
    M.suggestions.setAttribute('role', 'group');
    M.suggestions.setAttribute('aria-label', S.DUE_DATE_QUICK_SUGGESTIONS_LABEL);
    M.suggestions.hidden = !!M.current;
    S.DUE_DATE_QUICK_SUGGESTIONS.forEach(function (item) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'due-date-suggestion';
      chip.dataset.suggestion = item.id;
      chip.setAttribute(
        'aria-label',
        item.hint ? item.label + ', ' + item.hint : item.label
      );
      chip.hidden = !S.isDueDateQuickSuggestionAvailable(item.id);
      chip.innerHTML = S.dueDateQuickIconSvg(item.id);
      var chipBody = document.createElement('span');
      chipBody.className = 'due-date-suggestion-body';
      var chipLabel = document.createElement('span');
      chipLabel.className = 'due-date-suggestion-label';
      chipLabel.textContent = item.label;
      chipBody.appendChild(chipLabel);
      if (item.hint) {
        var chipHint = document.createElement('span');
        chipHint.className = 'due-date-suggestion-hint';
        chipHint.dataset.hint = item.hint;
        chipHint.textContent = S.normalizeDueTime(item.hint)
          ? S.formatDueTimeDisplay(item.hint)
          : item.hint;
        chipBody.appendChild(chipHint);
      }
      chip.appendChild(chipBody);
      chip.addEventListener('click', function () {
        M.applyQuickSuggestion(item.id);
      });
      if (
        global.ContextMenu &&
        typeof global.ContextMenu.bind === 'function'
      ) {
        ContextMenu.bind(chip, function () {
          return [
            {
              id: 'due-quick:' + item.id,
              label: item.label,
              action: function () {
                M.applyQuickSuggestion(item.id);
              },
            },
          ];
        });
      }
      M.suggestions.appendChild(chip);
    });
    M.body.appendChild(M.countdown);
    M.body.appendChild(M.pickers);
    M.vaguePanel = document.createElement('div');
    M.vaguePanel.className = 'due-date-vague';
    M.vaguePanel.setAttribute('role', 'group');
    M.vaguePanel.setAttribute('aria-label', S.DUE_DATE_VAGUE_OPTIONS_LABEL);
    M.vaguePanel.hidden = M.currentMode !== S.DUE_DATE_MODE_VAGUE;
    M.vagueSlider = document.createElement('input');
    M.vagueSlider.type = 'range';
    M.vagueSlider.className = 'due-date-vague-slider field-range';
    M.vagueSlider.min = '0';
    M.vagueSlider.max = String(Math.max(0, S.DUE_DATE_VAGUE_OPTIONS.length - 1));
    M.vagueSlider.step = '1';
    M.vagueSlider.setAttribute('aria-label', S.DUE_DATE_VAGUE_OPTIONS_LABEL);
    M.initialVagueIdx = S.dueVagueIndex(M.currentVague);
    M.vagueSlider.value = String(
      M.initialVagueIdx >= 0
        ? M.initialVagueIdx
        : Math.max(0, S.dueVagueIndex(S.DUE_DATE_VAGUE_DEFAULT_ID))
    );
    M.vagueEnds = document.createElement('div');
    M.vagueEnds.className = 'due-date-vague-ends';
    M.vagueEndNear = document.createElement('span');
    M.vagueEndNear.className = 'due-date-vague-end due-date-vague-end--near';
    M.vagueEndNear.textContent =
      (S.DUE_DATE_VAGUE_OPTIONS[0] && S.DUE_DATE_VAGUE_OPTIONS[0].label) ||
      'Bient\u00f4t';
    M.vagueEndFar = document.createElement('span');
    M.vagueEndFar.className = 'due-date-vague-end due-date-vague-end--far';
    M.vagueEndFar.textContent =
      (S.DUE_DATE_VAGUE_OPTIONS[S.DUE_DATE_VAGUE_OPTIONS.length - 1] &&
        S.DUE_DATE_VAGUE_OPTIONS[S.DUE_DATE_VAGUE_OPTIONS.length - 1].label) ||
      'Dans un futur tr\u00e8s lointain';
    M.vagueEnds.appendChild(M.vagueEndNear);
    M.vagueEnds.appendChild(M.vagueEndFar);
    M.vaguePanel.appendChild(M.vagueSlider);
    M.vaguePanel.appendChild(M.vagueEnds);
    M.vagueSlider.addEventListener('input', M.onVagueSliderInput);
    M.vagueSlider.addEventListener('change', M.onVagueSliderInput);
    M.body.appendChild(M.vaguePanel);
    M.startRow = document.createElement('div');
    M.startRow.className = 'due-date-start';
    M.startPicker = document.createElement('div');
    M.startPicker.className = 'due-date-picker due-date-picker--start';
    M.startTrigger = document.createElement('div');
    M.startTrigger.className = 'due-date-trigger due-date-trigger--start';
    M.startTrigger.setAttribute('role', 'button');
    M.startTrigger.setAttribute('tabindex', '0');
    M.startTrigger.setAttribute('aria-expanded', 'false');
    M.startTrigger.setAttribute('aria-haspopup', 'dialog');
    M.startTrigger.setAttribute('aria-label', S.DUE_DATE_START_LABEL);
    M.startTriggerIcon = document.createElement('i');
    M.startTriggerIcon.className = 'ti ti-flag due-date-trigger-icon';
    M.startTriggerIcon.setAttribute('aria-hidden', 'true');
    M.startTriggerText = document.createElement('span');
    M.startTriggerText.className = 'due-date-trigger-text';
    M.startTriggerValue = document.createElement('span');
    M.startTriggerValue.className = 'due-date-trigger-value is-placeholder';
    M.startTriggerValue.textContent = S.DUE_DATE_START_PLACEHOLDER;
    M.startTriggerTitle = document.createElement('span');
    M.startTriggerTitle.className = 'due-date-trigger-title';
    M.startTriggerTitle.textContent = S.DUE_DATE_START_LABEL;
    M.startTriggerText.appendChild(M.startTriggerValue);
    M.startTriggerText.appendChild(M.startTriggerTitle);
    M.startChevron = document.createElement('i');
    M.startChevron.className = 'ti ti-chevron-down due-date-trigger-chevron';
    M.startChevron.setAttribute('aria-hidden', 'true');
    M.startTrashBtn = document.createElement('button');
    M.startTrashBtn.type = 'button';
    M.startTrashBtn.className = 'due-date-trigger-clear';
    M.startTrashBtn.setAttribute('aria-label', S.DUE_DATE_START_CLEAR_LABEL);
    M.startTrashBtn.title = S.DUE_DATE_START_CLEAR_LABEL;
    M.startTrashBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    M.startTrashBtn.hidden = !M.currentStart;
    M.startTrigger.appendChild(M.startTriggerIcon);
    M.startTrigger.appendChild(M.startTriggerText);
    M.startTrigger.appendChild(M.startChevron);
    M.startTrigger.appendChild(M.startTrashBtn);
    M.startPicker.appendChild(M.startTrigger);
    M.startPopover = document.createElement('div');
    M.startPopover.className = 'due-date-popover due-date-popover--start';
    M.startPopover.hidden = true;
    M.startPopover.setAttribute('role', 'dialog');
    M.startPopover.setAttribute('aria-label', S.DUE_DATE_START_LABEL);
    M.startNav = document.createElement('div');
    M.startNav.className = 'due-date-nav';
    M.startPrevBtn = document.createElement('button');
    M.startPrevBtn.type = 'button';
    M.startPrevBtn.className = 'due-date-nav-btn';
    M.startPrevBtn.setAttribute('aria-label', S.DUE_DATE_PREV_MONTH);
    M.startPrevBtn.innerHTML = '<i class="ti ti-chevron-left" aria-hidden="true"></i>';
    M.startMonthLabel = document.createElement('span');
    M.startMonthLabel.className = 'due-date-month-label';
    M.startNextBtn = document.createElement('button');
    M.startNextBtn.type = 'button';
    M.startNextBtn.className = 'due-date-nav-btn';
    M.startNextBtn.setAttribute('aria-label', S.DUE_DATE_NEXT_MONTH);
    M.startNextBtn.innerHTML = '<i class="ti ti-chevron-right" aria-hidden="true"></i>';
    M.startNav.appendChild(M.startPrevBtn);
    M.startNav.appendChild(M.startMonthLabel);
    M.startNav.appendChild(M.startNextBtn);
    M.startPopover.appendChild(M.startNav);
    M.startWeekdays = document.createElement('div');
    M.startWeekdays.className = 'due-date-weekdays';
    M.startWeekdays.setAttribute('aria-hidden', 'true');
    S.DUE_DATE_WEEKDAYS.forEach(function (labelText, index) {
      var cell = document.createElement('span');
      cell.className = 'due-date-weekday';
      cell.textContent = labelText;
      cell.title = S.DUE_DATE_WEEKDAY_NAMES[index];
      M.startWeekdays.appendChild(cell);
    });
    M.startPopover.appendChild(M.startWeekdays);
    M.startGrid = document.createElement('div');
    M.startGrid.className = 'due-date-grid';
    M.startGrid.setAttribute('role', 'grid');
    M.startPopover.appendChild(M.startGrid);
    M.startFooter = document.createElement('div');
    M.startFooter.className = 'due-date-footer';
    M.startTodayBtn = document.createElement('button');
    M.startTodayBtn.type = 'button';
    M.startTodayBtn.className = 'due-date-today';
    M.startTodayBtn.textContent = S.DUE_DATE_TODAY_LABEL;
    M.startFooter.appendChild(M.startTodayBtn);
    M.startPopover.appendChild(M.startFooter);
    M.startPicker.appendChild(M.startPopover);
    M.startRow.appendChild(M.startPicker);
    M.recurringRow = document.createElement('div');
    M.recurringRow.className = 'due-date-recurring';
    M.recurringHead = document.createElement('div');
    M.recurringHead.className = 'due-date-recurring-head';
    M.recurringIcon = document.createElement('i');
    M.recurringIcon.className = 'ti ti-repeat due-date-recurring-icon';
    M.recurringIcon.setAttribute('aria-hidden', 'true');
    M.recurringTitle = document.createElement('span');
    M.recurringTitle.className = 'due-date-recurring-title';
    M.recurringTitle.textContent = S.DUE_DATE_RECURRING_LABEL;
    M.recurringClearBtn = document.createElement('button');
    M.recurringClearBtn.type = 'button';
    M.recurringClearBtn.className = 'due-date-recurring-clear';
    M.recurringClearBtn.setAttribute('aria-label', S.DUE_DATE_RECURRING_CLEAR_LABEL);
    M.recurringClearBtn.title = S.DUE_DATE_RECURRING_CLEAR_LABEL;
    M.recurringClearBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    M.recurringClearBtn.hidden = !M.currentRecurrence;
    M.recurringHead.appendChild(M.recurringIcon);
    M.recurringHead.appendChild(M.recurringTitle);
    M.recurringHead.appendChild(M.recurringClearBtn);
    M.recurringSelect = document.createElement('select');
    M.recurringSelect.className = 'due-date-recurring-select';
    M.recurringSelect.setAttribute('aria-label', S.DUE_DATE_RECURRING_LABEL);
    [
      { value: '', label: S.DUE_DATE_RECURRING_NONE },
      { value: 'daily', label: S.DUE_DATE_RECURRING_DAILY },
      { value: 'weekly', label: S.DUE_DATE_RECURRING_WEEKLY },
      { value: 'monthly', label: S.DUE_DATE_RECURRING_MONTHLY },
      { value: 'yearly', label: S.DUE_DATE_RECURRING_YEARLY }
    ].forEach(function (opt) {
      var option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      M.recurringSelect.appendChild(option);
    });
    M.recurringSelect.value = M.currentRecurrence ? M.currentRecurrence.frequency : '';
    M.recurringWeekdays = document.createElement('div');
    M.recurringWeekdays.className = 'due-date-recurring-weekdays';
    M.recurringWeekdays.setAttribute('role', 'group');
    M.recurringWeekdays.setAttribute('aria-label', 'Jours de la semaine');
    M.recurringWeekdays.hidden =
      !M.currentRecurrence || M.currentRecurrence.frequency !== 'weekly';
    M.weekdayShort = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    for (M.wd = 0; M.wd < 7; M.wd++) {
      (function (dayIndex) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'due-date-recurring-weekday';
        chip.dataset.day = String(dayIndex);
        chip.textContent = M.weekdayShort[dayIndex];
        chip.title = S.DUE_DATE_WEEKDAY_NAMES[dayIndex];
        chip.setAttribute('aria-pressed', 'false');
        chip.addEventListener('click', function () {
          M.toggleRecurrenceWeekday(dayIndex);
        });
        M.recurringWeekdays.appendChild(chip);
      })(M.wd);
    }
    M.recurringIntervalWrap = document.createElement('div');
    M.recurringIntervalWrap.className = 'due-date-recurring-interval';
    M.recurringIntervalWrap.hidden = true;
    M.recurringIntervalLabel = document.createElement('label');
    M.recurringIntervalLabel.className = 'due-date-recurring-interval-label';
    M.recurringIntervalLabel.textContent = 'Tous les';
    M.recurringIntervalInput = document.createElement('input');
    M.recurringIntervalInput.type = 'number';
    M.recurringIntervalInput.className = 'due-date-recurring-interval-input';
    M.recurringIntervalInput.min = '1';
    M.recurringIntervalInput.max = '99';
    M.recurringIntervalInput.value = String(
      (M.currentRecurrence && M.currentRecurrence.interval) || 1
    );
    M.recurringIntervalInput.setAttribute('aria-label', 'Intervalle de r\u00e9p\u00e9tition');
    M.recurringIntervalWrap.appendChild(M.recurringIntervalLabel);
    M.recurringIntervalWrap.appendChild(M.recurringIntervalInput);
    M.recurringTimeWrap = document.createElement('div');
    M.recurringTimeWrap.className = 'due-date-recurring-time';
    M.recurringTimeWrap.hidden = !M.currentRecurrence;
    M.recurringTimeLabel = document.createElement('label');
    M.recurringTimeLabel.className = 'due-date-recurring-time-label';
    M.recurringTimeLabel.textContent = '\u00c0';
    M.recurringTimeInput = document.createElement('input');
    M.recurringTimeInput.type = 'time';
    M.recurringTimeInput.className = 'due-date-recurring-time-input';
    M.recurringTimeInput.step = '300';
    M.recurringTimeInput.value = M.currentTime || M.rememberedTime || S.DUE_DATE_TIME_DEFAULT;
    M.recurringTimeInput.setAttribute('aria-label', 'Heure de r\u00e9p\u00e9tition');
    M.recurringTimeHint = document.createElement('span');
    M.recurringTimeHint.className = 'due-date-recurring-time-hint';
    M.recurringTimeHint.textContent = 'Le rappel revient \u00e0 cette heure.';
    M.recurringTimeWrap.appendChild(M.recurringTimeLabel);
    M.recurringTimeWrap.appendChild(M.recurringTimeInput);
    M.recurringTimeWrap.appendChild(M.recurringTimeHint);
    M.recurringRow.appendChild(M.recurringHead);
    M.recurringRow.appendChild(M.recurringSelect);
    M.recurringRow.appendChild(M.recurringWeekdays);
    M.recurringRow.appendChild(M.recurringIntervalWrap);
    M.recurringRow.appendChild(M.recurringTimeWrap);
    M.startRow.appendChild(M.recurringRow);
    M.body.appendChild(M.startRow);
    M.timePopover = document.createElement('div');
    M.timePopover.className = 'due-date-time-popover';
    M.timePopover.id = M.uid + '-time-popover';
    M.timePopover.hidden = true;
    M.timePopover.setAttribute('role', 'dialog');
    M.timePopover.setAttribute('aria-modal', 'false');
    M.timePopover.setAttribute('aria-label', S.DUE_DATE_TIME_PICKER_LABEL);
    M.timePeriodsSection = document.createElement('div');
    M.timePeriodsSection.className = 'due-date-time-section';
    M.timePeriods = document.createElement('div');
    M.timePeriods.className = 'due-date-time-chips due-date-time-chips--periods';
    M.timePeriods.setAttribute('role', 'group');
    M.timePeriods.setAttribute('aria-label', S.DUE_DATE_TIME_SUGGESTIONS_LABEL);
    S.DUE_DATE_TIME_PERIODS.forEach(function (period) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'due-date-time-chip due-date-time-chip--period';
      chip.dataset.time = period.time;
      chip.dataset.period = period.id;
      chip.setAttribute('aria-pressed', 'false');
      chip.innerHTML = S.dueTimePeriodIconSvg(period.id);
      var chipBody = document.createElement('span');
      chipBody.className = 'due-date-time-chip-body';
      var chipLabel = document.createElement('span');
      chipLabel.className = 'due-date-time-chip-label';
      chipLabel.textContent = period.label;
      var chipTime = document.createElement('span');
      chipTime.className = 'due-date-time-chip-time';
      chipBody.appendChild(chipLabel);
      chipBody.appendChild(chipTime);
      chip.appendChild(chipBody);
      chip.addEventListener('click', function () {
        M.selectTime(period.time);
        M.setDialMode('hour');
      });
      if (
        global.ContextMenu &&
        typeof global.ContextMenu.bind === 'function'
      ) {
        ContextMenu.bind(chip, function () {
          return [
            {
              id: 'time-period:' + period.id,
              label: period.label,
              action: function () {
                M.selectTime(period.time);
                M.setDialMode('hour');
              },
            },
          ];
        });
      }
      M.timePeriods.appendChild(chip);
    });
    M.timePeriodsSection.appendChild(M.timePeriods);
    M.timePopover.appendChild(M.timePeriodsSection);
    M.dialMode = 'hour';
    M.dialHour = 8;
    M.dialMinute = 0;
    M.dialDragging = false;
    M.timeDialSection = document.createElement('div');
    M.timeDialSection.className = 'due-date-time-section due-date-time-section--dial';
    M.timeDialHeader = document.createElement('div');
    M.timeDialHeader.className = 'due-date-time-dial-header';
    M.digitalGroup = document.createElement('div');
    M.digitalGroup.className = 'due-date-time-digital';
    M.digitalGroup.setAttribute('role', 'group');
    M.digitalGroup.setAttribute('aria-label', S.DUE_DATE_TIME_DIAL_LABEL);
    M.digitalHourInput = document.createElement('input');
    M.digitalHourInput.type = 'text';
    M.digitalHourInput.className = 'due-date-time-digital-part due-date-time-digital-part--hour is-active';
    M.digitalHourInput.setAttribute('aria-label', S.DUE_DATE_TIME_HOURS_ARIA);
    M.digitalHourInput.setAttribute('aria-pressed', 'true');
    M.digitalHourInput.setAttribute('inputmode', 'numeric');
    M.digitalHourInput.setAttribute('autocomplete', 'off');
    M.digitalHourInput.setAttribute('spellcheck', 'false');
    M.digitalHourInput.setAttribute('maxlength', '2');
    M.digitalHourInput.value = S.pad2(M.dialHour);
    M.digitalColon = document.createElement('span');
    M.digitalColon.className = 'due-date-time-digital-colon';
    M.digitalColon.textContent = ':';
    M.digitalColon.setAttribute('aria-hidden', 'true');
    M.digitalMinuteInput = document.createElement('input');
    M.digitalMinuteInput.type = 'text';
    M.digitalMinuteInput.className = 'due-date-time-digital-part due-date-time-digital-part--minute';
    M.digitalMinuteInput.setAttribute('aria-label', S.DUE_DATE_TIME_MINUTES_ARIA);
    M.digitalMinuteInput.setAttribute('aria-pressed', 'false');
    M.digitalMinuteInput.setAttribute('inputmode', 'numeric');
    M.digitalMinuteInput.setAttribute('autocomplete', 'off');
    M.digitalMinuteInput.setAttribute('spellcheck', 'false');
    M.digitalMinuteInput.setAttribute('maxlength', '2');
    M.digitalMinuteInput.value = S.pad2(M.dialMinute);
    M.digitalGroup.appendChild(M.digitalHourInput);
    M.digitalGroup.appendChild(M.digitalColon);
    M.digitalGroup.appendChild(M.digitalMinuteInput);
    M.meridiemGroup = document.createElement('div');
    M.meridiemGroup.className = 'due-date-time-meridiem';
    M.meridiemGroup.setAttribute('role', 'group');
    M.meridiemGroup.setAttribute('aria-label', S.DUE_DATE_TIME_MERIDIEM_ARIA);
    M.amBtn = document.createElement('button');
    M.amBtn.type = 'button';
    M.amBtn.className = 'due-date-time-meridiem-btn';
    M.amBtn.dataset.meridiem = 'am';
    M.amBtn.textContent = S.DUE_DATE_TIME_AM_LABEL;
    M.amBtn.setAttribute('aria-pressed', 'false');
    M.pmBtn = document.createElement('button');
    M.pmBtn.type = 'button';
    M.pmBtn.className = 'due-date-time-meridiem-btn';
    M.pmBtn.dataset.meridiem = 'pm';
    M.pmBtn.textContent = S.DUE_DATE_TIME_PM_LABEL;
    M.pmBtn.setAttribute('aria-pressed', 'false');
    M.meridiemGroup.appendChild(M.amBtn);
    M.meridiemGroup.appendChild(M.pmBtn);
    M.timeDialHeader.appendChild(M.digitalGroup);
    M.timeDialHeader.appendChild(M.meridiemGroup);
    M.clockFace = document.createElement('div');
    M.clockFace.className = 'due-date-time-clock';
    M.clockFace.setAttribute('role', 'slider');
    M.clockFace.setAttribute('aria-label', S.DUE_DATE_TIME_DIAL_LABEL);
    M.clockFace.setAttribute('tabindex', '0');
    M.clockFace.style.width = S.DUE_DATE_TIME_CLOCK_SIZE + 'px';
    M.clockFace.style.height = S.DUE_DATE_TIME_CLOCK_SIZE + 'px';
    M.clockHand = document.createElement('div');
    M.clockHand.className = 'due-date-time-clock-hand';
    M.clockHand.setAttribute('aria-hidden', 'true');
    M.clockThumb = document.createElement('div');
    M.clockThumb.className = 'due-date-time-clock-thumb';
    M.clockHand.appendChild(M.clockThumb);
    M.clockCenter = document.createElement('div');
    M.clockCenter.className = 'due-date-time-clock-center';
    M.clockCenter.setAttribute('aria-hidden', 'true');
    M.clockNums = document.createElement('div');
    M.clockNums.className = 'due-date-time-clock-nums';
    M.clockFace.appendChild(M.clockHand);
    M.clockFace.appendChild(M.clockCenter);
    M.clockFace.appendChild(M.clockNums);
    M.clockModeLabel = document.createElement('div');
    M.clockModeLabel.className = 'due-date-time-clock-mode';
    M.clockModeLabel.setAttribute('aria-live', 'polite');
    M.clockModeLabel.textContent = S.DUE_DATE_TIME_MODE_HOUR_LABEL;
    M.timeDialSection.appendChild(M.clockFace);
    M.timeDialSection.appendChild(M.clockModeLabel);
    M.timeDialSection.appendChild(M.timeDialHeader);
    M.timePopover.appendChild(M.timeDialSection);
    M.popover = document.createElement('div');
    M.popover.className = 'due-date-popover';
    M.popover.id = M.uid + '-popover';
    M.popover.hidden = true;
    M.popover.setAttribute('role', 'dialog');
    M.popover.setAttribute('aria-modal', 'false');
    M.popover.setAttribute('aria-label', S.DUE_DATE_CALENDAR_LABEL);
    M.nav = document.createElement('div');
    M.nav.className = 'due-date-nav';
    M.prevBtn = document.createElement('button');
    M.prevBtn.type = 'button';
    M.prevBtn.className = 'due-date-nav-btn';
    M.prevBtn.setAttribute('aria-label', S.DUE_DATE_PREV_MONTH);
    M.prevBtn.innerHTML = '<i class="ti ti-chevron-left" aria-hidden="true"></i>';
    M.monthLabel = document.createElement('div');
    M.monthLabel.className = 'due-date-month-label';
    M.monthLabel.id = M.uid + '-month';
    M.monthLabel.setAttribute('aria-live', 'polite');
    M.dayPickBtn = document.createElement('button');
    M.dayPickBtn.type = 'button';
    M.dayPickBtn.className = 'due-date-day-pick';
    M.dayPickBtn.setAttribute('aria-label', S.DUE_DATE_PICK_DAY_LABEL);
    M.dayPickBtn.setAttribute('aria-expanded', 'false');
    M.monthPickBtn = document.createElement('button');
    M.monthPickBtn.type = 'button';
    M.monthPickBtn.className = 'due-date-month-pick';
    M.monthPickBtn.setAttribute('aria-label', S.DUE_DATE_PICK_MONTH_LABEL);
    M.monthPickBtn.setAttribute('aria-expanded', 'false');
    M.yearPickBtn = document.createElement('button');
    M.yearPickBtn.type = 'button';
    M.yearPickBtn.className = 'due-date-year-pick';
    M.yearPickBtn.setAttribute('aria-label', S.DUE_DATE_PICK_YEAR_LABEL);
    M.yearPickBtn.setAttribute('aria-expanded', 'false');
    M.monthLabel.appendChild(M.dayPickBtn);
    M.monthLabel.appendChild(M.monthPickBtn);
    M.monthLabel.appendChild(M.yearPickBtn);
    M.nextBtn = document.createElement('button');
    M.nextBtn.type = 'button';
    M.nextBtn.className = 'due-date-nav-btn';
    M.nextBtn.setAttribute('aria-label', S.DUE_DATE_NEXT_MONTH);
    M.nextBtn.innerHTML = '<i class="ti ti-chevron-right" aria-hidden="true"></i>';
    M.nav.appendChild(M.prevBtn);
    M.nav.appendChild(M.monthLabel);
    M.nav.appendChild(M.nextBtn);
    M.popover.appendChild(M.nav);
    M.weekdays = document.createElement('div');
    M.weekdays.className = 'due-date-weekdays';
    M.weekdays.setAttribute('aria-hidden', 'true');
    S.DUE_DATE_WEEKDAYS.forEach(function (labelText, index) {
      var cell = document.createElement('span');
      cell.className = 'due-date-weekday';
      cell.textContent = labelText;
      cell.title = S.DUE_DATE_WEEKDAY_NAMES[index];
      M.weekdays.appendChild(cell);
    });
    M.popover.appendChild(M.weekdays);
    M.grid = document.createElement('div');
    M.grid.className = 'due-date-grid';
    M.grid.setAttribute('role', 'grid');
    M.grid.setAttribute('aria-labelledby', M.uid + '-month');
    M.popover.appendChild(M.grid);
    M.footer = document.createElement('div');
    M.footer.className = 'due-date-footer';
    M.todayBtn = document.createElement('button');
    M.todayBtn.type = 'button';
    M.todayBtn.className = 'due-date-today';
    M.todayBtn.textContent = S.DUE_DATE_TODAY_LABEL;
    M.footer.appendChild(M.todayBtn);
    M.popover.appendChild(M.footer);
    M.datePicker.appendChild(M.popover);
    M.timePicker.appendChild(M.timePopover);
    M.field.appendChild(M.suggestions);
    M.field.appendChild(M.body);
    M.el.appendChild(M.field);
    }
  });
})(typeof window !== 'undefined' ? window : this);
