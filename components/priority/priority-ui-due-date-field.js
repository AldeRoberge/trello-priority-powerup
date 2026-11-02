/**
 * priority-ui: part 10 of 12 (createDueDateField).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var DUE_DATE_BOX_LABEL = S.DUE_DATE_BOX_LABEL;
  var DUE_DATE_CALENDAR_LABEL = S.DUE_DATE_CALENDAR_LABEL;
  var DUE_DATE_CLEAR_LABEL = S.DUE_DATE_CLEAR_LABEL;
  var DUE_DATE_FIXE_COPY = S.DUE_DATE_FIXE_COPY;
  var DUE_DATE_LABEL = S.DUE_DATE_LABEL;
  var DUE_DATE_MASTER_CLEAR_LABEL = S.DUE_DATE_MASTER_CLEAR_LABEL;
  var DUE_DATE_MODE_PRECISE = S.DUE_DATE_MODE_PRECISE;
  var DUE_DATE_MODE_PRECISE_LABEL = S.DUE_DATE_MODE_PRECISE_LABEL;
  var DUE_DATE_MODE_VAGUE = S.DUE_DATE_MODE_VAGUE;
  var DUE_DATE_MODE_VAGUE_LABEL = S.DUE_DATE_MODE_VAGUE_LABEL;
  var DUE_DATE_MONTH_NAMES = S.DUE_DATE_MONTH_NAMES;
  var DUE_DATE_MONTH_SHORT = S.DUE_DATE_MONTH_SHORT;
  var DUE_DATE_NEXT_MONTH = S.DUE_DATE_NEXT_MONTH;
  var DUE_DATE_NEXT_YEAR = S.DUE_DATE_NEXT_YEAR;
  var DUE_DATE_NEXT_YEARS = S.DUE_DATE_NEXT_YEARS;
  var DUE_DATE_PICK_DAY_LABEL = S.DUE_DATE_PICK_DAY_LABEL;
  var DUE_DATE_PICK_MONTH_LABEL = S.DUE_DATE_PICK_MONTH_LABEL;
  var DUE_DATE_PICK_YEAR_LABEL = S.DUE_DATE_PICK_YEAR_LABEL;
  var DUE_DATE_PLACEHOLDER = S.DUE_DATE_PLACEHOLDER;
  var DUE_DATE_PREV_MONTH = S.DUE_DATE_PREV_MONTH;
  var DUE_DATE_PREV_YEAR = S.DUE_DATE_PREV_YEAR;
  var DUE_DATE_PREV_YEARS = S.DUE_DATE_PREV_YEARS;
  var DUE_DATE_QUICK_SUGGESTIONS = S.DUE_DATE_QUICK_SUGGESTIONS;
  var DUE_DATE_QUICK_SUGGESTIONS_LABEL = S.DUE_DATE_QUICK_SUGGESTIONS_LABEL;
  var DUE_DATE_RECURRING_CLEAR_LABEL = S.DUE_DATE_RECURRING_CLEAR_LABEL;
  var DUE_DATE_RECURRING_DAILY = S.DUE_DATE_RECURRING_DAILY;
  var DUE_DATE_RECURRING_LABEL = S.DUE_DATE_RECURRING_LABEL;
  var DUE_DATE_RECURRING_MONTHLY = S.DUE_DATE_RECURRING_MONTHLY;
  var DUE_DATE_RECURRING_NONE = S.DUE_DATE_RECURRING_NONE;
  var DUE_DATE_RECURRING_WEEKLY = S.DUE_DATE_RECURRING_WEEKLY;
  var DUE_DATE_RECURRING_YEARLY = S.DUE_DATE_RECURRING_YEARLY;
  var DUE_DATE_START_CLEAR_LABEL = S.DUE_DATE_START_CLEAR_LABEL;
  var DUE_DATE_START_LABEL = S.DUE_DATE_START_LABEL;
  var DUE_DATE_START_PLACEHOLDER = S.DUE_DATE_START_PLACEHOLDER;
  var DUE_DATE_TIME_AM_LABEL = S.DUE_DATE_TIME_AM_LABEL;
  var DUE_DATE_TIME_CLEAR_LABEL = S.DUE_DATE_TIME_CLEAR_LABEL;
  var DUE_DATE_TIME_CLOCK_INNER_R = S.DUE_DATE_TIME_CLOCK_INNER_R;
  var DUE_DATE_TIME_CLOCK_MINUTE_R = S.DUE_DATE_TIME_CLOCK_MINUTE_R;
  var DUE_DATE_TIME_CLOCK_OUTER_R = S.DUE_DATE_TIME_CLOCK_OUTER_R;
  var DUE_DATE_TIME_CLOCK_SIZE = S.DUE_DATE_TIME_CLOCK_SIZE;
  var DUE_DATE_TIME_DEFAULT = S.DUE_DATE_TIME_DEFAULT;
  var DUE_DATE_TIME_DIAL_LABEL = S.DUE_DATE_TIME_DIAL_LABEL;
  var DUE_DATE_TIME_HOURS_ARIA = S.DUE_DATE_TIME_HOURS_ARIA;
  var DUE_DATE_TIME_LABEL = S.DUE_DATE_TIME_LABEL;
  var DUE_DATE_TIME_MERIDIEM_ARIA = S.DUE_DATE_TIME_MERIDIEM_ARIA;
  var DUE_DATE_TIME_MINUTES_ARIA = S.DUE_DATE_TIME_MINUTES_ARIA;
  var DUE_DATE_TIME_MINUTE_STEPS = S.DUE_DATE_TIME_MINUTE_STEPS;
  var DUE_DATE_TIME_MODE_HOUR_LABEL = S.DUE_DATE_TIME_MODE_HOUR_LABEL;
  var DUE_DATE_TIME_MODE_MINUTE_LABEL = S.DUE_DATE_TIME_MODE_MINUTE_LABEL;
  var DUE_DATE_TIME_PERIODS = S.DUE_DATE_TIME_PERIODS;
  var DUE_DATE_TIME_PICKER_LABEL = S.DUE_DATE_TIME_PICKER_LABEL;
  var DUE_DATE_TIME_PLACEHOLDER = S.DUE_DATE_TIME_PLACEHOLDER;
  var DUE_DATE_TIME_PM_LABEL = S.DUE_DATE_TIME_PM_LABEL;
  var DUE_DATE_TIME_SUGGESTIONS_LABEL = S.DUE_DATE_TIME_SUGGESTIONS_LABEL;
  var DUE_DATE_TODAY_LABEL = S.DUE_DATE_TODAY_LABEL;
  var DUE_DATE_VAGUE_DEFAULT_ID = S.DUE_DATE_VAGUE_DEFAULT_ID;
  var DUE_DATE_VAGUE_OPTIONS = S.DUE_DATE_VAGUE_OPTIONS;
  var DUE_DATE_VAGUE_OPTIONS_LABEL = S.DUE_DATE_VAGUE_OPTIONS_LABEL;
  var DUE_DATE_WEEKDAYS = S.DUE_DATE_WEEKDAYS;
  var DUE_DATE_WEEKDAY_NAMES = S.DUE_DATE_WEEKDAY_NAMES;
  var DUE_DATE_YEAR_PICKER_COUNT = S.DUE_DATE_YEAR_PICKER_COUNT;
  var DUE_LIMIT_STATE_HAS = S.DUE_LIMIT_STATE_HAS;
  var DUE_LIMIT_STATE_NONE = S.DUE_LIMIT_STATE_NONE;

  // from other parts (functions, resolved at call time)
  function applyDueProximityBand() { return S.applyDueProximityBand.apply(this, arguments); }
  function bindCollapsibleEnable() { return S.bindCollapsibleEnable.apply(this, arguments); }
  function clearDueProximityBand() { return S.clearDueProximityBand.apply(this, arguments); }
  function createCollapsibleEnableChrome() { return S.createCollapsibleEnableChrome.apply(this, arguments); }
  function daysUntilDue() { return S.daysUntilDue.apply(this, arguments); }
  function dueBandAccent() { return S.dueBandAccent.apply(this, arguments); }
  function dueDateQuickIconSvg() { return S.dueDateQuickIconSvg.apply(this, arguments); }
  function dueDateToLocalDate() { return S.dueDateToLocalDate.apply(this, arguments); }
  function dueProximityBand() { return S.dueProximityBand.apply(this, arguments); }
  function dueTimePeriodIconSvg() { return S.dueTimePeriodIconSvg.apply(this, arguments); }
  function dueVagueIdAtIndex() { return S.dueVagueIdAtIndex.apply(this, arguments); }
  function dueVagueIndex() { return S.dueVagueIndex.apply(this, arguments); }
  function formatDueDateBoxDisplay() { return S.formatDueDateBoxDisplay.apply(this, arguments); }
  function formatDueDateCompactSummary() { return S.formatDueDateCompactSummary.apply(this, arguments); }
  function formatDueDateHumanReadable() { return S.formatDueDateHumanReadable.apply(this, arguments); }
  function formatDueDateTriggerTitle() { return S.formatDueDateTriggerTitle.apply(this, arguments); }
  function formatDueTimeDisplay() { return S.formatDueTimeDisplay.apply(this, arguments); }
  function formatDueTimePeriodLabel() { return S.formatDueTimePeriodLabel.apply(this, arguments); }
  function formatDueTimeTriggerTitle() { return S.formatDueTimeTriggerTitle.apply(this, arguments); }
  function formatDueVagueCountdown() { return S.formatDueVagueCountdown.apply(this, arguments); }
  function formatDueVagueLabel() { return S.formatDueVagueLabel.apply(this, arguments); }
  function formatRecurrenceLabelFr() { return S.formatRecurrenceLabelFr.apply(this, arguments); }
  function hour12PartsToHour24() { return S.hour12PartsToHour24.apply(this, arguments); }
  function hour24ToHour12Parts() { return S.hour24ToHour12Parts.apply(this, arguments); }
  function isDueDateQuickSuggestionAvailable() { return S.isDueDateQuickSuggestionAvailable.apply(this, arguments); }
  function isDueVagueEligible() { return S.isDueVagueEligible.apply(this, arguments); }
  function isHour12() { return S.isHour12.apply(this, arguments); }
  function matchDueTimePeriod() { return S.matchDueTimePeriod.apply(this, arguments); }
  function normalizeDueDate() { return S.normalizeDueDate.apply(this, arguments); }
  function normalizeDueMode() { return S.normalizeDueMode.apply(this, arguments); }
  function normalizeDueTime() { return S.normalizeDueTime.apply(this, arguments); }
  function normalizeDueVague() { return S.normalizeDueVague.apply(this, arguments); }
  function normalizeRecurrence() { return S.normalizeRecurrence.apply(this, arguments); }
  function pad2() { return S.pad2.apply(this, arguments); }
  function playPriorityUiSound() { return S.playPriorityUiSound.apply(this, arguments); }
  function resolveDueDateQuickSuggestion() { return S.resolveDueDateQuickSuggestion.apply(this, arguments); }
  function resolveDueVagueToDate() { return S.resolveDueVagueToDate.apply(this, arguments); }
  function startOfLocalDay() { return S.startOfLocalDay.apply(this, arguments); }
  function sundayOffset() { return S.sundayOffset.apply(this, arguments); }
  function toIsoDate() { return S.toIsoDate.apply(this, arguments); }

  // Échéance section: start + due calendars, time, recurrence, vague phrases.
  // Syncs with Trello card due/start via PriorityTrello (cardDueSyncedIso).

  function createDueDateField(config) {
    var el = config.el;
    var onChange = config.onChange || function () {};
    var onLayoutChange = config.onLayoutChange || function () {};
    var initialValue = config.value;
    var initialDate =
      initialValue && typeof initialValue === 'object'
        ? initialValue.dueDate
        : initialValue;
    var initialTime =
      initialValue && typeof initialValue === 'object'
        ? initialValue.dueTime
        : config.time;
    var current = normalizeDueDate(initialDate);
    var currentTime = current ? normalizeDueTime(initialTime) : '';
    var rememberedTime = currentTime || '';
    // Section is always on (no enable checkbox). dueEnabled tracks whether a
    // date is set — empty stays optional / visually quiet (no has-due-date).
    var enabled = true;
    var initialVague =
      initialValue && typeof initialValue === 'object'
        ? normalizeDueVague(initialValue.dueVague)
        : '';
    var currentMode = normalizeDueMode(
      initialValue && typeof initialValue === 'object'
        ? initialValue.dueMode
        : null
    );
    if (initialVague) currentMode = DUE_DATE_MODE_VAGUE;
    var hasDueDateInitially =
      (!!current || !!initialVague) &&
      (initialValue && typeof initialValue === 'object' && initialValue.dueEnabled != null
        ? !!initialValue.dueEnabled
        : config.enabled != null
          ? !!config.enabled
          : true);
    if (!hasDueDateInitially) {
      current = '';
      currentTime = '';
      initialVague = '';
    } else if (currentMode === DUE_DATE_MODE_VAGUE && initialVague && !current) {
      current = resolveDueVagueToDate(initialVague);
    }
    // "N'a pas de date limite" (default) hides the picker; scoring ignores the
    // date entirely while in that state, even if a date is still remembered underneath.
    var currentDueLimitState =
      initialValue &&
      typeof initialValue === 'object' &&
      (initialValue.dueLimitState === DUE_LIMIT_STATE_HAS ||
        initialValue.dueLimitState === DUE_LIMIT_STATE_NONE)
        ? initialValue.dueLimitState
        : hasDueDateInitially
          ? DUE_LIMIT_STATE_HAS
          : DUE_LIMIT_STATE_NONE;
    var currentDateFixe = !!(
      initialValue &&
      typeof initialValue === 'object' &&
      initialValue.dateFixe
    );
    var currentVague =
      currentMode === DUE_DATE_MODE_VAGUE && hasDueDateInitially
        ? initialVague
        : '';
    // Keep last Vague chip across Précis ↔ Vague toggles (like rememberedTime).
    var rememberedVague = currentVague || initialVague || '';
    var currentStart =
      initialValue && typeof initialValue === 'object'
        ? normalizeDueDate(initialValue.startDate)
        : '';
    var currentRecurrence = normalizeRecurrence(
      initialValue && typeof initialValue === 'object'
        ? initialValue.recurrence
        : null
    );
    if (currentMode === DUE_DATE_MODE_VAGUE) {
      currentTime = '';
      currentStart = '';
      currentRecurrence = null;
    }
    var open = false;
    var timeOpen = false;
    var startOpen = false;
    var startViewYear;
    var startViewMonth;
    var startFocusIso =
      currentStart || toIsoDate(startOfLocalDay(new Date()));
    var viewYear;
    var viewMonth;
    var calendarMode = 'day'; /* day | date | month | year */
    var yearPickerStart = null;
    var focusIso = current || toIsoDate(startOfLocalDay(new Date()));
    var docListenersBound = false;
    var uid = 'due-cal-' + Math.random().toString(36).slice(2, 9);
    var bodyId = uid + '-body';
    var collapseApi = null;
    /* Calendar + time panels stay expanded whenever Échéance is enabled. */

    function syncViewFromValue(iso) {
      var date = dueDateToLocalDate(iso) || startOfLocalDay(new Date());
      viewYear = date.getFullYear();
      viewMonth = date.getMonth();
      focusIso = toIsoDate(date);
    }

    function syncStartViewFromValue(iso) {
      var date = dueDateToLocalDate(iso) || startOfLocalDay(new Date());
      startViewYear = date.getFullYear();
      startViewMonth = date.getMonth();
      startFocusIso = toIsoDate(date);
    }

    syncViewFromValue(current);
    syncStartViewFromValue(currentStart);

    var field = document.createElement('div');
    field.className = 'field field--due-date';

    var chrome = createCollapsibleEnableChrome({
      title: DUE_DATE_LABEL,
      bodyId: bodyId,
      hideEnable: true,
      leadingIcon: 'ti-calendar',
      iconClass: 'due-leading-icon',
      titleClass: 'due-date-title',
      collapseLabel: 'Replier \u00c9ch\u00e9ance',
      expandLabel: 'D\u00e9velopper \u00c9ch\u00e9ance'
    });
    chrome.title.id = uid + '-label';

    var masterClearBtn = document.createElement('button');
    masterClearBtn.type = 'button';
    masterClearBtn.className = 'due-date-master-clear';
    masterClearBtn.setAttribute('aria-label', DUE_DATE_MASTER_CLEAR_LABEL);
    masterClearBtn.title = DUE_DATE_MASTER_CLEAR_LABEL;
    masterClearBtn.hidden = true;
    masterClearBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    chrome.head.appendChild(masterClearBtn);
    field.appendChild(chrome.head);

    var body = document.createElement('div');
    body.className = 'due-date-body section-toggle-body';
    body.id = bodyId;

    var dueLimitSwitch = document.createElement('div');
    dueLimitSwitch.className = 'due-limit-state-switch';
    dueLimitSwitch.setAttribute('role', 'radiogroup');
    dueLimitSwitch.setAttribute('aria-label', 'Limite de temps');

    function makeDueLimitBtn(limitState, label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'due-limit-state-btn';
      btn.setAttribute('role', 'radio');
      btn.dataset.dueLimitState = limitState;
      btn.textContent = label;
      dueLimitSwitch.appendChild(btn);
      return btn;
    }
    var dueLimitNoneBtn = makeDueLimitBtn(DUE_LIMIT_STATE_NONE, 'N\u2019a pas de date limite');
    var dueLimitHasBtn = makeDueLimitBtn(DUE_LIMIT_STATE_HAS, 'A une date limite');
    body.appendChild(dueLimitSwitch);

    var dateFixeRow = document.createElement('div');
    dateFixeRow.className = 'due-date-fixe-row';
    var dateFixeLabel = document.createElement('label');
    dateFixeLabel.className = 'due-date-fixe-label';
    var dateFixeCheckbox = document.createElement('input');
    dateFixeCheckbox.type = 'checkbox';
    dateFixeCheckbox.className = 'due-date-fixe-checkbox';
    dateFixeCheckbox.checked = currentDateFixe;
    var dateFixeText = document.createElement('span');
    dateFixeText.className = 'due-date-fixe-text';
    dateFixeText.textContent = 'Date fixe';
    dateFixeLabel.appendChild(dateFixeCheckbox);
    dateFixeLabel.appendChild(dateFixeText);
    var dateFixeCopy = document.createElement('span');
    dateFixeCopy.className = 'due-date-fixe-copy';
    dateFixeCopy.textContent = DUE_DATE_FIXE_COPY;
    dateFixeRow.appendChild(dateFixeLabel);
    dateFixeRow.appendChild(dateFixeCopy);
    body.appendChild(dateFixeRow);

    function syncDateFixeRow() {
      var isNone = currentDueLimitState === DUE_LIMIT_STATE_NONE;
      var isVague = currentMode === DUE_DATE_MODE_VAGUE;
      dateFixeRow.hidden = isNone || isVague;
      dateFixeCheckbox.checked = currentDateFixe;
    }

    function paintDueLimitSwitch() {
      var isNone = currentDueLimitState === DUE_LIMIT_STATE_NONE;
      dueLimitNoneBtn.classList.toggle('is-active', isNone);
      dueLimitNoneBtn.setAttribute('aria-checked', isNone ? 'true' : 'false');
      dueLimitHasBtn.classList.toggle('is-active', !isNone);
      dueLimitHasBtn.setAttribute('aria-checked', !isNone ? 'true' : 'false');
      body.classList.toggle('is-due-limit-none', isNone);
      syncDateFixeRow();
    }

    function setDueLimitState(nextState) {
      var normalized = nextState === DUE_LIMIT_STATE_HAS ? DUE_LIMIT_STATE_HAS : DUE_LIMIT_STATE_NONE;
      if (normalized === currentDueLimitState) return;
      currentDueLimitState = normalized;
      paintDueLimitSwitch();
      emitChange();
      notifyLayout();
    }

    dueLimitNoneBtn.addEventListener('click', function () {
      setDueLimitState(DUE_LIMIT_STATE_NONE);
    });
    dueLimitHasBtn.addEventListener('click', function () {
      setDueLimitState(DUE_LIMIT_STATE_HAS);
    });
    dateFixeCheckbox.addEventListener('change', function () {
      currentDateFixe = !!dateFixeCheckbox.checked;
      emitChange();
    });
    paintDueLimitSwitch();

    var countdown = document.createElement('div');
    countdown.className = 'due-date-countdown';
    countdown.id = uid + '-desc';
    countdown.setAttribute('aria-live', 'polite');

    var countdownMain = document.createElement('div');
    countdownMain.className = 'due-date-countdown-main';

    var countdownPrimaryRow = document.createElement('div');
    countdownPrimaryRow.className = 'due-date-countdown-primary-row';
    var countdownDot = document.createElement('span');
    countdownDot.className = 'heat-tier-dot due-date-countdown-dot';
    countdownDot.setAttribute('aria-hidden', 'true');
    countdownDot.hidden = true;
    var countdownPrimary = document.createElement('div');
    countdownPrimary.className = 'due-date-countdown-primary';
    countdownPrimaryRow.appendChild(countdownDot);
    countdownPrimaryRow.appendChild(countdownPrimary);

    var countdownSecondary = document.createElement('div');
    countdownSecondary.className = 'due-date-countdown-secondary';

    countdownMain.appendChild(countdownPrimaryRow);
    countdownMain.appendChild(countdownSecondary);

    var modeSwitch = document.createElement('div');
    modeSwitch.className = 'due-date-mode-switch is-icons-only';
    modeSwitch.setAttribute('role', 'radiogroup');
    modeSwitch.setAttribute('aria-label', 'Mode d\'\u00e9ch\u00e9ance');

    function makeDueModeBtn(mode, label, icon) {
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
      modeSwitch.appendChild(btn);
      return btn;
    }

    var preciseModeBtn = makeDueModeBtn(
      DUE_DATE_MODE_PRECISE,
      DUE_DATE_MODE_PRECISE_LABEL,
      'ti-target-arrow'
    );
    var vagueModeBtn = makeDueModeBtn(
      DUE_DATE_MODE_VAGUE,
      DUE_DATE_MODE_VAGUE_LABEL,
      'ti-tilde'
    );

    countdown.appendChild(countdownMain);
    countdown.appendChild(modeSwitch);

    var pickers = document.createElement('div');
    pickers.className = 'due-date-pickers';

    var datePicker = document.createElement('div');
    datePicker.className = 'due-date-picker due-date-picker--calendar';

    var trigger = document.createElement('div');
    trigger.className = 'due-date-trigger';
    trigger.setAttribute('role', 'group');
    trigger.setAttribute('aria-labelledby', uid + '-label');
    trigger.setAttribute('aria-describedby', uid + '-desc');

    var triggerIcon = document.createElement('i');
    triggerIcon.className = 'ti ti-calendar due-date-trigger-icon';
    triggerIcon.setAttribute('aria-hidden', 'true');

    var triggerText = document.createElement('span');
    triggerText.className = 'due-date-trigger-text';

    var triggerTitle = document.createElement('span');
    triggerTitle.className = 'due-date-trigger-title';
    triggerTitle.textContent = DUE_DATE_BOX_LABEL;
    var triggerRecurringHint = document.createElement('span');
    triggerRecurringHint.className = 'due-date-trigger-hint';
    triggerRecurringHint.hidden = true;

    var triggerValue = document.createElement('span');
    triggerValue.className = 'due-date-trigger-value';

    triggerText.appendChild(triggerValue);
    triggerText.appendChild(triggerTitle);
    triggerText.appendChild(triggerRecurringHint);

    var dateTrashBtn = document.createElement('button');
    dateTrashBtn.type = 'button';
    dateTrashBtn.className = 'due-date-trigger-clear';
    dateTrashBtn.setAttribute('aria-label', DUE_DATE_CLEAR_LABEL);
    dateTrashBtn.title = DUE_DATE_CLEAR_LABEL;
    dateTrashBtn.hidden = true;
    dateTrashBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';

    trigger.appendChild(triggerIcon);
    trigger.appendChild(triggerText);
    trigger.appendChild(dateTrashBtn);

    datePicker.appendChild(trigger);

    var timePicker = document.createElement('div');
    timePicker.className = 'due-date-picker due-date-picker--time';

    var timeTrigger = document.createElement('div');
    timeTrigger.className = 'due-date-time-trigger';
    timeTrigger.setAttribute('role', 'group');
    timeTrigger.setAttribute('aria-label', DUE_DATE_TIME_LABEL);

    var timeIcon = document.createElement('i');
    timeIcon.className = 'ti ti-clock due-date-time-icon';
    timeIcon.setAttribute('aria-hidden', 'true');

    var timeTriggerText = document.createElement('span');
    timeTriggerText.className = 'due-date-time-trigger-text';

    var timeTitle = document.createElement('span');
    timeTitle.className = 'due-date-time-title';
    timeTitle.textContent = DUE_DATE_TIME_LABEL;
    var timeRecurringHint = document.createElement('span');
    timeRecurringHint.className = 'due-date-time-hint';
    timeRecurringHint.hidden = true;

    var timeValue = document.createElement('span');
    timeValue.className = 'due-date-time-value';

    timeTriggerText.appendChild(timeValue);
    timeTriggerText.appendChild(timeTitle);
    timeTriggerText.appendChild(timeRecurringHint);

    var timeTrashBtn = document.createElement('button');
    timeTrashBtn.type = 'button';
    timeTrashBtn.className = 'due-date-time-trigger-clear';
    timeTrashBtn.setAttribute('aria-label', DUE_DATE_TIME_CLEAR_LABEL);
    timeTrashBtn.title = DUE_DATE_TIME_CLEAR_LABEL;
    timeTrashBtn.hidden = true;
    timeTrashBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';

    timeTrigger.appendChild(timeIcon);
    timeTrigger.appendChild(timeTriggerText);
    timeTrigger.appendChild(timeTrashBtn);

    timePicker.appendChild(timeTrigger);

    pickers.appendChild(datePicker);
    pickers.appendChild(timePicker);

    var suggestions = document.createElement('div');
    suggestions.className = 'due-date-suggestions';
    suggestions.setAttribute('role', 'group');
    suggestions.setAttribute('aria-label', DUE_DATE_QUICK_SUGGESTIONS_LABEL);
    suggestions.hidden = !!current;

    DUE_DATE_QUICK_SUGGESTIONS.forEach(function (item) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'due-date-suggestion';
      chip.dataset.suggestion = item.id;
      chip.setAttribute(
        'aria-label',
        item.hint ? item.label + ', ' + item.hint : item.label
      );
      chip.hidden = !isDueDateQuickSuggestionAvailable(item.id);
      chip.innerHTML = dueDateQuickIconSvg(item.id);
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
        chipHint.textContent = normalizeDueTime(item.hint)
          ? formatDueTimeDisplay(item.hint)
          : item.hint;
        chipBody.appendChild(chipHint);
      }
      chip.appendChild(chipBody);
      chip.addEventListener('click', function () {
        applyQuickSuggestion(item.id);
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
                applyQuickSuggestion(item.id);
              },
            },
          ];
        });
      }
      suggestions.appendChild(chip);
    });

    body.appendChild(countdown);
    body.appendChild(pickers);

    var vaguePanel = document.createElement('div');
    vaguePanel.className = 'due-date-vague';
    vaguePanel.setAttribute('role', 'group');
    vaguePanel.setAttribute('aria-label', DUE_DATE_VAGUE_OPTIONS_LABEL);
    vaguePanel.hidden = currentMode !== DUE_DATE_MODE_VAGUE;

    var vagueSlider = document.createElement('input');
    vagueSlider.type = 'range';
    vagueSlider.className = 'due-date-vague-slider field-range';
    vagueSlider.min = '0';
    vagueSlider.max = String(Math.max(0, DUE_DATE_VAGUE_OPTIONS.length - 1));
    vagueSlider.step = '1';
    vagueSlider.setAttribute('aria-label', DUE_DATE_VAGUE_OPTIONS_LABEL);
    var initialVagueIdx = dueVagueIndex(currentVague);
    vagueSlider.value = String(
      initialVagueIdx >= 0
        ? initialVagueIdx
        : Math.max(0, dueVagueIndex(DUE_DATE_VAGUE_DEFAULT_ID))
    );

    var vagueEnds = document.createElement('div');
    vagueEnds.className = 'due-date-vague-ends';
    var vagueEndNear = document.createElement('span');
    vagueEndNear.className = 'due-date-vague-end due-date-vague-end--near';
    vagueEndNear.textContent =
      (DUE_DATE_VAGUE_OPTIONS[0] && DUE_DATE_VAGUE_OPTIONS[0].label) ||
      'Bient\u00f4t';
    var vagueEndFar = document.createElement('span');
    vagueEndFar.className = 'due-date-vague-end due-date-vague-end--far';
    vagueEndFar.textContent =
      (DUE_DATE_VAGUE_OPTIONS[DUE_DATE_VAGUE_OPTIONS.length - 1] &&
        DUE_DATE_VAGUE_OPTIONS[DUE_DATE_VAGUE_OPTIONS.length - 1].label) ||
      'Dans un futur tr\u00e8s lointain';
    vagueEnds.appendChild(vagueEndNear);
    vagueEnds.appendChild(vagueEndFar);

    vaguePanel.appendChild(vagueSlider);
    vaguePanel.appendChild(vagueEnds);

    function onVagueSliderInput() {
      applyVagueOption(dueVagueIdAtIndex(vagueSlider.value), { fromSlider: true });
    }
    vagueSlider.addEventListener('input', onVagueSliderInput);
    vagueSlider.addEventListener('change', onVagueSliderInput);

    body.appendChild(vaguePanel);

    // ── Start date (Début) ─────────────────────────────────────────────
    var startRow = document.createElement('div');
    startRow.className = 'due-date-start';

    var startPicker = document.createElement('div');
    startPicker.className = 'due-date-picker due-date-picker--start';

    var startTrigger = document.createElement('div');
    startTrigger.className = 'due-date-trigger due-date-trigger--start';
    startTrigger.setAttribute('role', 'button');
    startTrigger.setAttribute('tabindex', '0');
    startTrigger.setAttribute('aria-expanded', 'false');
    startTrigger.setAttribute('aria-haspopup', 'dialog');
    startTrigger.setAttribute('aria-label', DUE_DATE_START_LABEL);

    var startTriggerIcon = document.createElement('i');
    startTriggerIcon.className = 'ti ti-flag due-date-trigger-icon';
    startTriggerIcon.setAttribute('aria-hidden', 'true');

    var startTriggerText = document.createElement('span');
    startTriggerText.className = 'due-date-trigger-text';
    var startTriggerValue = document.createElement('span');
    startTriggerValue.className = 'due-date-trigger-value is-placeholder';
    startTriggerValue.textContent = DUE_DATE_START_PLACEHOLDER;
    var startTriggerTitle = document.createElement('span');
    startTriggerTitle.className = 'due-date-trigger-title';
    startTriggerTitle.textContent = DUE_DATE_START_LABEL;
    startTriggerText.appendChild(startTriggerValue);
    startTriggerText.appendChild(startTriggerTitle);

    var startChevron = document.createElement('i');
    startChevron.className = 'ti ti-chevron-down due-date-trigger-chevron';
    startChevron.setAttribute('aria-hidden', 'true');

    var startTrashBtn = document.createElement('button');
    startTrashBtn.type = 'button';
    startTrashBtn.className = 'due-date-trigger-clear';
    startTrashBtn.setAttribute('aria-label', DUE_DATE_START_CLEAR_LABEL);
    startTrashBtn.title = DUE_DATE_START_CLEAR_LABEL;
    startTrashBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    startTrashBtn.hidden = !currentStart;

    startTrigger.appendChild(startTriggerIcon);
    startTrigger.appendChild(startTriggerText);
    startTrigger.appendChild(startChevron);
    startTrigger.appendChild(startTrashBtn);
    startPicker.appendChild(startTrigger);

    var startPopover = document.createElement('div');
    startPopover.className = 'due-date-popover due-date-popover--start';
    startPopover.hidden = true;
    startPopover.setAttribute('role', 'dialog');
    startPopover.setAttribute('aria-label', DUE_DATE_START_LABEL);

    var startNav = document.createElement('div');
    startNav.className = 'due-date-nav';
    var startPrevBtn = document.createElement('button');
    startPrevBtn.type = 'button';
    startPrevBtn.className = 'due-date-nav-btn';
    startPrevBtn.setAttribute('aria-label', DUE_DATE_PREV_MONTH);
    startPrevBtn.innerHTML = '<i class="ti ti-chevron-left" aria-hidden="true"></i>';
    var startMonthLabel = document.createElement('span');
    startMonthLabel.className = 'due-date-month-label';
    var startNextBtn = document.createElement('button');
    startNextBtn.type = 'button';
    startNextBtn.className = 'due-date-nav-btn';
    startNextBtn.setAttribute('aria-label', DUE_DATE_NEXT_MONTH);
    startNextBtn.innerHTML = '<i class="ti ti-chevron-right" aria-hidden="true"></i>';
    startNav.appendChild(startPrevBtn);
    startNav.appendChild(startMonthLabel);
    startNav.appendChild(startNextBtn);
    startPopover.appendChild(startNav);

    var startWeekdays = document.createElement('div');
    startWeekdays.className = 'due-date-weekdays';
    startWeekdays.setAttribute('aria-hidden', 'true');
    DUE_DATE_WEEKDAYS.forEach(function (labelText, index) {
      var cell = document.createElement('span');
      cell.className = 'due-date-weekday';
      cell.textContent = labelText;
      cell.title = DUE_DATE_WEEKDAY_NAMES[index];
      startWeekdays.appendChild(cell);
    });
    startPopover.appendChild(startWeekdays);

    var startGrid = document.createElement('div');
    startGrid.className = 'due-date-grid';
    startGrid.setAttribute('role', 'grid');
    startPopover.appendChild(startGrid);

    var startFooter = document.createElement('div');
    startFooter.className = 'due-date-footer';
    var startTodayBtn = document.createElement('button');
    startTodayBtn.type = 'button';
    startTodayBtn.className = 'due-date-today';
    startTodayBtn.textContent = DUE_DATE_TODAY_LABEL;
    startFooter.appendChild(startTodayBtn);
    startPopover.appendChild(startFooter);
    startPicker.appendChild(startPopover);
    startRow.appendChild(startPicker);

    // ── Recurring (beside start date) ──────────────────────────────────
    var recurringRow = document.createElement('div');
    recurringRow.className = 'due-date-recurring';

    var recurringHead = document.createElement('div');
    recurringHead.className = 'due-date-recurring-head';
    var recurringIcon = document.createElement('i');
    recurringIcon.className = 'ti ti-repeat due-date-recurring-icon';
    recurringIcon.setAttribute('aria-hidden', 'true');
    var recurringTitle = document.createElement('span');
    recurringTitle.className = 'due-date-recurring-title';
    recurringTitle.textContent = DUE_DATE_RECURRING_LABEL;
    var recurringClearBtn = document.createElement('button');
    recurringClearBtn.type = 'button';
    recurringClearBtn.className = 'due-date-recurring-clear';
    recurringClearBtn.setAttribute('aria-label', DUE_DATE_RECURRING_CLEAR_LABEL);
    recurringClearBtn.title = DUE_DATE_RECURRING_CLEAR_LABEL;
    recurringClearBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    recurringClearBtn.hidden = !currentRecurrence;
    recurringHead.appendChild(recurringIcon);
    recurringHead.appendChild(recurringTitle);
    recurringHead.appendChild(recurringClearBtn);

    var recurringSelect = document.createElement('select');
    recurringSelect.className = 'due-date-recurring-select';
    recurringSelect.setAttribute('aria-label', DUE_DATE_RECURRING_LABEL);
    [
      { value: '', label: DUE_DATE_RECURRING_NONE },
      { value: 'daily', label: DUE_DATE_RECURRING_DAILY },
      { value: 'weekly', label: DUE_DATE_RECURRING_WEEKLY },
      { value: 'monthly', label: DUE_DATE_RECURRING_MONTHLY },
      { value: 'yearly', label: DUE_DATE_RECURRING_YEARLY }
    ].forEach(function (opt) {
      var option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      recurringSelect.appendChild(option);
    });
    recurringSelect.value = currentRecurrence ? currentRecurrence.frequency : '';

    var recurringWeekdays = document.createElement('div');
    recurringWeekdays.className = 'due-date-recurring-weekdays';
    recurringWeekdays.setAttribute('role', 'group');
    recurringWeekdays.setAttribute('aria-label', 'Jours de la semaine');
    recurringWeekdays.hidden =
      !currentRecurrence || currentRecurrence.frequency !== 'weekly';

    var weekdayShort = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    for (var wd = 0; wd < 7; wd++) {
      (function (dayIndex) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'due-date-recurring-weekday';
        chip.dataset.day = String(dayIndex);
        chip.textContent = weekdayShort[dayIndex];
        chip.title = DUE_DATE_WEEKDAY_NAMES[dayIndex];
        chip.setAttribute('aria-pressed', 'false');
        chip.addEventListener('click', function () {
          toggleRecurrenceWeekday(dayIndex);
        });
        recurringWeekdays.appendChild(chip);
      })(wd);
    }

    var recurringIntervalWrap = document.createElement('div');
    recurringIntervalWrap.className = 'due-date-recurring-interval';
    recurringIntervalWrap.hidden = true;
    var recurringIntervalLabel = document.createElement('label');
    recurringIntervalLabel.className = 'due-date-recurring-interval-label';
    recurringIntervalLabel.textContent = 'Tous les';
    var recurringIntervalInput = document.createElement('input');
    recurringIntervalInput.type = 'number';
    recurringIntervalInput.className = 'due-date-recurring-interval-input';
    recurringIntervalInput.min = '1';
    recurringIntervalInput.max = '99';
    recurringIntervalInput.value = String(
      (currentRecurrence && currentRecurrence.interval) || 1
    );
    recurringIntervalInput.setAttribute('aria-label', 'Intervalle de r\u00e9p\u00e9tition');
    recurringIntervalWrap.appendChild(recurringIntervalLabel);
    recurringIntervalWrap.appendChild(recurringIntervalInput);

    var recurringTimeWrap = document.createElement('div');
    recurringTimeWrap.className = 'due-date-recurring-time';
    recurringTimeWrap.hidden = !currentRecurrence;
    var recurringTimeLabel = document.createElement('label');
    recurringTimeLabel.className = 'due-date-recurring-time-label';
    recurringTimeLabel.textContent = '\u00c0';
    var recurringTimeInput = document.createElement('input');
    recurringTimeInput.type = 'time';
    recurringTimeInput.className = 'due-date-recurring-time-input';
    recurringTimeInput.step = '300';
    recurringTimeInput.value = currentTime || rememberedTime || DUE_DATE_TIME_DEFAULT;
    recurringTimeInput.setAttribute('aria-label', 'Heure de r\u00e9p\u00e9tition');
    var recurringTimeHint = document.createElement('span');
    recurringTimeHint.className = 'due-date-recurring-time-hint';
    recurringTimeHint.textContent = 'Le rappel revient \u00e0 cette heure.';
    recurringTimeWrap.appendChild(recurringTimeLabel);
    recurringTimeWrap.appendChild(recurringTimeInput);
    recurringTimeWrap.appendChild(recurringTimeHint);

    recurringRow.appendChild(recurringHead);
    recurringRow.appendChild(recurringSelect);
    recurringRow.appendChild(recurringWeekdays);
    recurringRow.appendChild(recurringIntervalWrap);
    recurringRow.appendChild(recurringTimeWrap);
    startRow.appendChild(recurringRow);
    body.appendChild(startRow);

    var timePopover = document.createElement('div');
    timePopover.className = 'due-date-time-popover';
    timePopover.id = uid + '-time-popover';
    timePopover.hidden = true;
    timePopover.setAttribute('role', 'dialog');
    timePopover.setAttribute('aria-modal', 'false');
    timePopover.setAttribute('aria-label', DUE_DATE_TIME_PICKER_LABEL);

    var timePeriodsSection = document.createElement('div');
    timePeriodsSection.className = 'due-date-time-section';

    var timePeriods = document.createElement('div');
    timePeriods.className = 'due-date-time-chips due-date-time-chips--periods';
    timePeriods.setAttribute('role', 'group');
    timePeriods.setAttribute('aria-label', DUE_DATE_TIME_SUGGESTIONS_LABEL);

    DUE_DATE_TIME_PERIODS.forEach(function (period) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'due-date-time-chip due-date-time-chip--period';
      chip.dataset.time = period.time;
      chip.dataset.period = period.id;
      chip.setAttribute('aria-pressed', 'false');
      chip.innerHTML = dueTimePeriodIconSvg(period.id);
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
        selectTime(period.time);
        setDialMode('hour');
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
                selectTime(period.time);
                setDialMode('hour');
              },
            },
          ];
        });
      }
      timePeriods.appendChild(chip);
    });

    timePeriodsSection.appendChild(timePeriods);
    timePopover.appendChild(timePeriodsSection);

    var dialMode = 'hour';
    var dialHour = 8;
    var dialMinute = 0;
    var dialDragging = false;

    var timeDialSection = document.createElement('div');
    timeDialSection.className = 'due-date-time-section due-date-time-section--dial';

    var timeDialHeader = document.createElement('div');
    timeDialHeader.className = 'due-date-time-dial-header';

    var digitalGroup = document.createElement('div');
    digitalGroup.className = 'due-date-time-digital';
    digitalGroup.setAttribute('role', 'group');
    digitalGroup.setAttribute('aria-label', DUE_DATE_TIME_DIAL_LABEL);

    var digitalHourInput = document.createElement('input');
    digitalHourInput.type = 'text';
    digitalHourInput.className = 'due-date-time-digital-part due-date-time-digital-part--hour is-active';
    digitalHourInput.setAttribute('aria-label', DUE_DATE_TIME_HOURS_ARIA);
    digitalHourInput.setAttribute('aria-pressed', 'true');
    digitalHourInput.setAttribute('inputmode', 'numeric');
    digitalHourInput.setAttribute('autocomplete', 'off');
    digitalHourInput.setAttribute('spellcheck', 'false');
    digitalHourInput.setAttribute('maxlength', '2');
    digitalHourInput.value = pad2(dialHour);

    var digitalColon = document.createElement('span');
    digitalColon.className = 'due-date-time-digital-colon';
    digitalColon.textContent = ':';
    digitalColon.setAttribute('aria-hidden', 'true');

    var digitalMinuteInput = document.createElement('input');
    digitalMinuteInput.type = 'text';
    digitalMinuteInput.className = 'due-date-time-digital-part due-date-time-digital-part--minute';
    digitalMinuteInput.setAttribute('aria-label', DUE_DATE_TIME_MINUTES_ARIA);
    digitalMinuteInput.setAttribute('aria-pressed', 'false');
    digitalMinuteInput.setAttribute('inputmode', 'numeric');
    digitalMinuteInput.setAttribute('autocomplete', 'off');
    digitalMinuteInput.setAttribute('spellcheck', 'false');
    digitalMinuteInput.setAttribute('maxlength', '2');
    digitalMinuteInput.value = pad2(dialMinute);

    digitalGroup.appendChild(digitalHourInput);
    digitalGroup.appendChild(digitalColon);
    digitalGroup.appendChild(digitalMinuteInput);

    var meridiemGroup = document.createElement('div');
    meridiemGroup.className = 'due-date-time-meridiem';
    meridiemGroup.setAttribute('role', 'group');
    meridiemGroup.setAttribute('aria-label', DUE_DATE_TIME_MERIDIEM_ARIA);

    var amBtn = document.createElement('button');
    amBtn.type = 'button';
    amBtn.className = 'due-date-time-meridiem-btn';
    amBtn.dataset.meridiem = 'am';
    amBtn.textContent = DUE_DATE_TIME_AM_LABEL;
    amBtn.setAttribute('aria-pressed', 'false');

    var pmBtn = document.createElement('button');
    pmBtn.type = 'button';
    pmBtn.className = 'due-date-time-meridiem-btn';
    pmBtn.dataset.meridiem = 'pm';
    pmBtn.textContent = DUE_DATE_TIME_PM_LABEL;
    pmBtn.setAttribute('aria-pressed', 'false');

    meridiemGroup.appendChild(amBtn);
    meridiemGroup.appendChild(pmBtn);
    timeDialHeader.appendChild(digitalGroup);
    timeDialHeader.appendChild(meridiemGroup);

    var clockFace = document.createElement('div');
    clockFace.className = 'due-date-time-clock';
    clockFace.setAttribute('role', 'slider');
    clockFace.setAttribute('aria-label', DUE_DATE_TIME_DIAL_LABEL);
    clockFace.setAttribute('tabindex', '0');
    clockFace.style.width = DUE_DATE_TIME_CLOCK_SIZE + 'px';
    clockFace.style.height = DUE_DATE_TIME_CLOCK_SIZE + 'px';

    var clockHand = document.createElement('div');
    clockHand.className = 'due-date-time-clock-hand';
    clockHand.setAttribute('aria-hidden', 'true');
    var clockThumb = document.createElement('div');
    clockThumb.className = 'due-date-time-clock-thumb';
    clockHand.appendChild(clockThumb);

    var clockCenter = document.createElement('div');
    clockCenter.className = 'due-date-time-clock-center';
    clockCenter.setAttribute('aria-hidden', 'true');

    var clockNums = document.createElement('div');
    clockNums.className = 'due-date-time-clock-nums';

    clockFace.appendChild(clockHand);
    clockFace.appendChild(clockCenter);
    clockFace.appendChild(clockNums);

    var clockModeLabel = document.createElement('div');
    clockModeLabel.className = 'due-date-time-clock-mode';
    clockModeLabel.setAttribute('aria-live', 'polite');
    clockModeLabel.textContent = DUE_DATE_TIME_MODE_HOUR_LABEL;

    timeDialSection.appendChild(clockFace);
    timeDialSection.appendChild(clockModeLabel);
    timeDialSection.appendChild(timeDialHeader);
    timePopover.appendChild(timeDialSection);

    var popover = document.createElement('div');
    popover.className = 'due-date-popover';
    popover.id = uid + '-popover';
    popover.hidden = true;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'false');
    popover.setAttribute('aria-label', DUE_DATE_CALENDAR_LABEL);

    var nav = document.createElement('div');
    nav.className = 'due-date-nav';

    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'due-date-nav-btn';
    prevBtn.setAttribute('aria-label', DUE_DATE_PREV_MONTH);
    prevBtn.innerHTML = '<i class="ti ti-chevron-left" aria-hidden="true"></i>';

    var monthLabel = document.createElement('div');
    monthLabel.className = 'due-date-month-label';
    monthLabel.id = uid + '-month';
    monthLabel.setAttribute('aria-live', 'polite');

    var dayPickBtn = document.createElement('button');
    dayPickBtn.type = 'button';
    dayPickBtn.className = 'due-date-day-pick';
    dayPickBtn.setAttribute('aria-label', DUE_DATE_PICK_DAY_LABEL);
    dayPickBtn.setAttribute('aria-expanded', 'false');

    var monthPickBtn = document.createElement('button');
    monthPickBtn.type = 'button';
    monthPickBtn.className = 'due-date-month-pick';
    monthPickBtn.setAttribute('aria-label', DUE_DATE_PICK_MONTH_LABEL);
    monthPickBtn.setAttribute('aria-expanded', 'false');

    var yearPickBtn = document.createElement('button');
    yearPickBtn.type = 'button';
    yearPickBtn.className = 'due-date-year-pick';
    yearPickBtn.setAttribute('aria-label', DUE_DATE_PICK_YEAR_LABEL);
    yearPickBtn.setAttribute('aria-expanded', 'false');

    monthLabel.appendChild(dayPickBtn);
    monthLabel.appendChild(monthPickBtn);
    monthLabel.appendChild(yearPickBtn);

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'due-date-nav-btn';
    nextBtn.setAttribute('aria-label', DUE_DATE_NEXT_MONTH);
    nextBtn.innerHTML = '<i class="ti ti-chevron-right" aria-hidden="true"></i>';

    nav.appendChild(prevBtn);
    nav.appendChild(monthLabel);
    nav.appendChild(nextBtn);
    popover.appendChild(nav);

    var weekdays = document.createElement('div');
    weekdays.className = 'due-date-weekdays';
    weekdays.setAttribute('aria-hidden', 'true');
    DUE_DATE_WEEKDAYS.forEach(function (labelText, index) {
      var cell = document.createElement('span');
      cell.className = 'due-date-weekday';
      cell.textContent = labelText;
      cell.title = DUE_DATE_WEEKDAY_NAMES[index];
      weekdays.appendChild(cell);
    });
    popover.appendChild(weekdays);

    var grid = document.createElement('div');
    grid.className = 'due-date-grid';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-labelledby', uid + '-month');
    popover.appendChild(grid);

    var footer = document.createElement('div');
    footer.className = 'due-date-footer';

    var todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.className = 'due-date-today';
    todayBtn.textContent = DUE_DATE_TODAY_LABEL;

    footer.appendChild(todayBtn);
    popover.appendChild(footer);

    /* Calendar under Date, time under Heure — side-by-side columns. */
    datePicker.appendChild(popover);
    timePicker.appendChild(timePopover);

    /* Suggestions sit above section-toggle-shell (wraps body in bindCollapsibleEnable). */
    field.appendChild(suggestions);
    field.appendChild(body);
    el.appendChild(field);

    function notifyLayout() {
      requestAnimationFrame(function () {
        onLayoutChange();
      });
    }

    function ensureDueDateForTime() {
      if (current) return false;
      current = toIsoDate(startOfLocalDay(new Date()));
      focusIso = current;
      syncViewFromValue(current);
      return true;
    }

    function refreshPeriodChipLabels() {
      var periodChips = timePeriods.querySelectorAll('[data-time]');
      for (var i = 0; i < periodChips.length; i++) {
        var chip = periodChips[i];
        var hhmm = chip.dataset.time || '';
        var display = formatDueTimeDisplay(hhmm) || hhmm;
        var timeEl = chip.querySelector('.due-date-time-chip-time');
        if (timeEl) timeEl.textContent = display;
        var period = matchDueTimePeriod(hhmm);
        var labelIso = current || toIsoDate(startOfLocalDay(new Date()));
        var label = period
          ? formatDueTimePeriodLabel(period, labelIso)
          : '';
        var labelEl = chip.querySelector('.due-date-time-chip-label');
        if (labelEl && label) labelEl.textContent = label;
        chip.setAttribute(
          'aria-label',
          label ? label + ', ' + display : display
        );
      }
      var hintEls = suggestions.querySelectorAll('.due-date-suggestion-hint[data-hint]');
      for (var h = 0; h < hintEls.length; h++) {
        var rawHint = hintEls[h].dataset.hint || '';
        hintEls[h].textContent = normalizeDueTime(rawHint)
          ? formatDueTimeDisplay(rawHint)
          : rawHint;
      }
    }

    function applyClockFormatUi() {
      var h12 = isHour12();
      meridiemGroup.hidden = !h12;
      clockFace.classList.toggle('is-hour12', h12);
      timePopover.classList.toggle('is-hour12', h12);
      refreshPeriodChipLabels();
    }

    function refreshTimeRow() {
      /* Date + Heure stay fully enabled/visible whenever Échéance is on. */
      pickers.classList.toggle('has-time', !!currentTime);
      pickers.classList.toggle('has-date', !!current);
      field.classList.toggle('is-time-open', timeOpen);
      applyClockFormatUi();
      timeTitle.textContent = formatDueTimeTriggerTitle(current, currentTime);
      if (currentTime) {
        timeValue.textContent = formatDueTimeDisplay(currentTime);
        timeValue.classList.remove('is-placeholder');
        timeTrigger.classList.add('has-value');
        timeTrashBtn.hidden = false;
      } else {
        timeValue.textContent = DUE_DATE_TIME_PLACEHOLDER;
        timeValue.classList.add('is-placeholder');
        timeTrigger.classList.remove('has-value');
        timeTrashBtn.hidden = true;
      }
      if (timeOpen) syncTimePickerSelection();
    }

    function parseDialTime(hhmm) {
      var normalized = normalizeDueTime(hhmm) || DUE_DATE_TIME_DEFAULT;
      var parts = normalized.split(':');
      return { hour: +parts[0], minute: +parts[1] };
    }

    function dialHhmm() {
      return pad2(dialHour) + ':' + pad2(dialMinute);
    }

    function setDialMode(mode) {
      dialMode = mode === 'minute' ? 'minute' : 'hour';
      digitalHourInput.classList.toggle('is-active', dialMode === 'hour');
      digitalMinuteInput.classList.toggle('is-active', dialMode === 'minute');
      digitalHourInput.setAttribute('aria-pressed', dialMode === 'hour' ? 'true' : 'false');
      digitalMinuteInput.setAttribute('aria-pressed', dialMode === 'minute' ? 'true' : 'false');
      clockFace.dataset.mode = dialMode;
      clockModeLabel.textContent = dialMode === 'minute'
        ? DUE_DATE_TIME_MODE_MINUTE_LABEL
        : DUE_DATE_TIME_MODE_HOUR_LABEL;
      renderClockFace();
    }

    function digitsOnly(value, maxLen) {
      return String(value || '').replace(/\D/g, '').slice(0, maxLen);
    }

    function parseDigitalPart(value, min, max, fallback) {
      var digits = digitsOnly(value, 2);
      if (!digits) return fallback;
      var n = parseInt(digits, 10);
      if (isNaN(n)) return fallback;
      if (n < min) n = min;
      if (n > max) n = max;
      return n;
    }

    function digitalHourDisplayValue() {
      if (!isHour12()) return pad2(dialHour);
      return pad2(hour24ToHour12Parts(dialHour).hour12);
    }

    function commitDigitalHour(opts) {
      var advance = !!(opts && opts.advance);
      if (isHour12()) {
        var hour12 = parseDigitalPart(
          digitalHourInput.value,
          1,
          12,
          hour24ToHour12Parts(dialHour).hour12
        );
        dialHour = hour12PartsToHour24(hour12, dialHour >= 12);
        digitalHourInput.value = pad2(hour12);
      } else {
        dialHour = parseDigitalPart(digitalHourInput.value, 0, 23, dialHour);
        digitalHourInput.value = pad2(dialHour);
      }
      commitDialTime(false);
      if (advance) {
        setDialMode('minute');
        digitalMinuteInput.focus();
        digitalMinuteInput.select();
      }
    }

    function commitDigitalMinute() {
      var next = parseDigitalPart(digitalMinuteInput.value, 0, 59, dialMinute);
      dialMinute = next;
      digitalMinuteInput.value = pad2(dialMinute);
      commitDialTime(false);
    }

    function commitDigitalEdits() {
      if (document.activeElement === digitalHourInput) commitDigitalHour();
      else if (document.activeElement === digitalMinuteInput) commitDigitalMinute();
    }

    function setMeridiem(nextPm) {
      var isPm = dialHour >= 12;
      if (nextPm === isPm) return;
      dialHour = nextPm ? (dialHour % 12) + 12 : dialHour % 12;
      commitDialTime(false);
    }

    function commitDialTime() {
      selectTime(dialHhmm());
    }

    function clockAngleDeg(value, max) {
      return (value / max) * 360;
    }

    function renderClockFace() {
      clockNums.textContent = '';
      var cx = DUE_DATE_TIME_CLOCK_SIZE / 2;
      var h12Mode = isHour12();
      var selected = dialMode === 'hour' ? dialHour : dialMinute;
      var angle;
      var radius;
      var valueText;

      if (dialMode === 'hour') {
        if (h12Mode) {
          var selected12 = hour24ToHour12Parts(dialHour).hour12;
          for (var n = 1; n <= 12; n++) {
            var hour12Btn = document.createElement('button');
            hour12Btn.type = 'button';
            hour12Btn.className =
              'due-date-time-clock-num due-date-time-clock-num--outer due-date-time-clock-num--h12';
            hour12Btn.textContent = String(n);
            hour12Btn.dataset.hour12 = String(n);
            hour12Btn.setAttribute('aria-label', n + ' h');
            if (n === selected12) hour12Btn.classList.add('is-selected');
            var h12Angle = clockAngleDeg(n % 12, 12);
            hour12Btn.style.left = cx + 'px';
            hour12Btn.style.top = cx + 'px';
            hour12Btn.style.transform =
              'rotate(' +
              h12Angle +
              'deg) translateY(-' +
              DUE_DATE_TIME_CLOCK_OUTER_R +
              'px) rotate(-' +
              h12Angle +
              'deg)';
            hour12Btn.addEventListener('click', function (ev) {
              ev.stopPropagation();
              dialHour = hour12PartsToHour24(+this.dataset.hour12, dialHour >= 12);
              commitDialTime(false);
              setDialMode('minute');
            });
            clockNums.appendChild(hour12Btn);
          }
          angle = clockAngleDeg(selected12 % 12, 12);
          radius = DUE_DATE_TIME_CLOCK_OUTER_R;
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
            hourBtn.textContent = pad2(h);
            hourBtn.dataset.value = String(h);
            hourBtn.setAttribute('aria-label', pad2(h) + ' h');
            if (h === dialHour) hourBtn.classList.add('is-selected');
            var hourAngle = clockAngleDeg(h % 12, 12);
            var hourRadius =
              h >= 12 ? DUE_DATE_TIME_CLOCK_OUTER_R : DUE_DATE_TIME_CLOCK_INNER_R;
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
              dialHour = +this.dataset.value;
              commitDialTime(false);
              setDialMode('minute');
            });
            clockNums.appendChild(hourBtn);
          }
          angle = clockAngleDeg(dialHour % 12, 12);
          radius =
            dialHour >= 12
              ? DUE_DATE_TIME_CLOCK_OUTER_R
              : DUE_DATE_TIME_CLOCK_INNER_R;
          valueText = pad2(dialHour) + ' heures';
        }
      } else {
        DUE_DATE_TIME_MINUTE_STEPS.forEach(function (m) {
          var minuteBtn = document.createElement('button');
          minuteBtn.type = 'button';
          minuteBtn.className = 'due-date-time-clock-num due-date-time-clock-num--minute';
          minuteBtn.textContent = pad2(m);
          minuteBtn.dataset.value = String(m);
          minuteBtn.setAttribute('aria-label', pad2(m) + ' min');
          if (m === dialMinute) minuteBtn.classList.add('is-selected');
          var minuteAngle = clockAngleDeg(m, 60);
          minuteBtn.style.left = cx + 'px';
          minuteBtn.style.top = cx + 'px';
          minuteBtn.style.transform =
            'rotate(' + minuteAngle + 'deg) translateY(-' + DUE_DATE_TIME_CLOCK_MINUTE_R +
            'px) rotate(-' + minuteAngle + 'deg)';
          minuteBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            dialMinute = +this.dataset.value;
            commitDialTime(false);
          });
          clockNums.appendChild(minuteBtn);
        });
        angle = clockAngleDeg(dialMinute, 60);
        radius = DUE_DATE_TIME_CLOCK_MINUTE_R;
        valueText = pad2(dialMinute) + ' minutes';
      }

      clockHand.style.transform = 'rotate(' + angle + 'deg)';
      clockHand.style.setProperty('--hand-length', radius + 'px');
      clockFace.setAttribute('aria-valuenow', String(selected));
      clockFace.setAttribute('aria-valuetext', valueText);

      if (document.activeElement !== digitalHourInput) {
        digitalHourInput.value = digitalHourDisplayValue();
      }
      if (document.activeElement !== digitalMinuteInput) {
        digitalMinuteInput.value = pad2(dialMinute);
      }

      var isPm = dialHour >= 12;
      amBtn.classList.toggle('is-selected', !isPm);
      pmBtn.classList.toggle('is-selected', isPm);
      amBtn.setAttribute('aria-pressed', !isPm ? 'true' : 'false');
      pmBtn.setAttribute('aria-pressed', isPm ? 'true' : 'false');
    }

    function valueFromClockPointer(clientX, clientY) {
      var rect = clockFace.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = clientX - cx;
      var dy = clientY - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (deg < 0) deg += 360;

      if (dialMode === 'hour') {
        var slot = Math.round(deg / 30) % 12;
        if (isHour12()) {
          var hour12 = slot === 0 ? 12 : slot;
          return hour12PartsToHour24(hour12, dialHour >= 12);
        }
        var mid = (DUE_DATE_TIME_CLOCK_INNER_R + DUE_DATE_TIME_CLOCK_OUTER_R) / 2;
        var scale = rect.width / DUE_DATE_TIME_CLOCK_SIZE;
        var useOuter = dist > mid * scale;
        return useOuter ? (slot === 0 ? 12 : slot + 12) : slot;
      }

      var minute = Math.round(deg / 30) * 5;
      if (minute >= 60) minute = 0;
      return minute;
    }

    function applyPointerToDial(clientX, clientY, advanceOnHour) {
      var next = valueFromClockPointer(clientX, clientY);
      if (dialMode === 'hour') {
        if (next === dialHour) return;
        dialHour = next;
        commitDialTime(false);
        if (advanceOnHour) setDialMode('minute');
        else renderClockFace();
      } else {
        if (next === dialMinute) return;
        dialMinute = next;
        commitDialTime(false);
      }
    }

    function syncTimePickerSelection() {
      var parsed = parseDialTime(currentTime || rememberedTime || DUE_DATE_TIME_DEFAULT);
      dialHour = parsed.hour;
      dialMinute = parsed.minute;
      renderClockFace();

      var periodChips = timePeriods.querySelectorAll('[data-time]');
      for (var p = 0; p < periodChips.length; p++) {
        var periodSelected = !!currentTime && periodChips[p].dataset.time === currentTime;
        periodChips[p].classList.toggle('is-selected', periodSelected);
        periodChips[p].setAttribute('aria-pressed', periodSelected ? 'true' : 'false');
      }
    }

    function selectTime(hhmm) {
      if (!enabled) return;
      ensureDueDateForTime();
      if (!current) return;
      var next = normalizeDueTime(hhmm);
      currentTime = next || '';
      if (next) {
        rememberedTime = next;
        var parsed = parseDialTime(next);
        dialHour = parsed.hour;
        dialMinute = parsed.minute;
      }
      emitChange();
      syncTimePickerSelection();
    }

    function refreshSuggestions() {
      var expanded = !collapseApi || collapseApi.isExpanded();
      var show =
        enabled &&
        expanded &&
        !current &&
        currentMode === DUE_DATE_MODE_PRECISE;
      var chips = suggestions.querySelectorAll('[data-suggestion]');
      var anyAvailable = false;
      for (var i = 0; i < chips.length; i++) {
        var available = isDueDateQuickSuggestionAvailable(chips[i].dataset.suggestion);
        chips[i].hidden = !available;
        if (available) anyAvailable = true;
      }
      var wasHidden = suggestions.hidden;
      suggestions.hidden = !(show && anyAvailable);
      if (wasHidden !== suggestions.hidden) notifyLayout();
    }

    function refreshVagueSlider() {
      var idx = dueVagueIndex(currentVague);
      if (idx < 0) idx = Math.max(0, dueVagueIndex(DUE_DATE_VAGUE_DEFAULT_ID));
      if (String(vagueSlider.value) !== String(idx)) {
        vagueSlider.value = String(idx);
      }
      var label = formatDueVagueLabel(
        currentVague || dueVagueIdAtIndex(idx)
      );
      vagueSlider.setAttribute(
        'aria-valuetext',
        label || DUE_DATE_VAGUE_OPTIONS_LABEL
      );
      vagueSlider.disabled = !enabled;
    }

    function refreshModeUi() {
      var isVague = currentMode === DUE_DATE_MODE_VAGUE;
      var showLabels = !!current && isDueVagueEligible(current);
      field.classList.toggle('is-vague-mode', isVague);
      field.dataset.dueMode = currentMode;
      modeSwitch.hidden = false;
      vagueModeBtn.hidden = false;
      modeSwitch.classList.toggle('is-icons-only', !showLabels);
      preciseModeBtn.classList.toggle('is-active', !isVague);
      vagueModeBtn.classList.toggle('is-active', isVague);
      preciseModeBtn.setAttribute('aria-checked', isVague ? 'false' : 'true');
      vagueModeBtn.setAttribute('aria-checked', isVague ? 'true' : 'false');
      vaguePanel.hidden = !isVague;
      pickers.hidden = isVague;
      startRow.hidden = isVague;
      syncDateFixeRow();
      if (isVague) {
        hidePickers();
        hideStartPicker();
      } else {
        showPickers();
      }
      refreshVagueSlider();
      refreshSuggestions();
      notifyLayout();
    }

    function setDueMode(nextMode, options) {
      options = options || {};
      var mode = normalizeDueMode(nextMode);
      if (mode === currentMode && !options.force) return;
      currentMode = mode;
      if (mode === DUE_DATE_MODE_VAGUE) {
        currentTime = '';
        currentStart = '';
        currentRecurrence = null;
        if (!currentVague && rememberedVague) {
          currentVague = rememberedVague;
        }
        if (!currentVague) {
          currentVague = DUE_DATE_VAGUE_DEFAULT_ID;
          rememberedVague = currentVague;
        }
        if (currentVague) {
          current = resolveDueVagueToDate(currentVague);
          if (current) syncViewFromValue(current);
        } else {
          current = '';
        }
      } else {
        if (currentVague) rememberedVague = currentVague;
        currentVague = '';
      }
      refreshModeUi();
      if (!options.silent) emitChange();
      else {
        refreshCountdown();
        refreshStartTrigger();
        refreshRecurrenceUi();
      }
    }

    function applyVagueOption(id, opts) {
      opts = opts || {};
      if (!enabled || currentMode !== DUE_DATE_MODE_VAGUE) return;
      var nextId = normalizeDueVague(id);
      if (!nextId) return;
      // Slider always keeps a horizon selected (no toggle-off).
      if (currentVague === nextId) {
        refreshVagueSlider();
        if (!opts.fromSlider) emitChange();
        return;
      }
      currentVague = nextId;
      rememberedVague = nextId;
      current = resolveDueVagueToDate(nextId);
      currentTime = '';
      currentStart = '';
      currentRecurrence = null;
      if (current) syncViewFromValue(current);
      refreshVagueSlider();
      emitChange();
    }

    function applyQuickSuggestion(id) {
      if (!enabled) return;
      if (currentMode !== DUE_DATE_MODE_PRECISE) setDueMode(DUE_DATE_MODE_PRECISE, { silent: true });
      var resolved = resolveDueDateQuickSuggestion(id);
      if (!resolved || !resolved.iso) return;
      var next = normalizeDueDate(resolved.iso);
      if (!next) return;
      current = next;
      if (currentVague) rememberedVague = currentVague;
      currentVague = '';
      currentTime = normalizeDueTime(resolved.time) || '';
      if (currentTime) rememberedTime = currentTime;
      focusIso = next;
      syncViewFromValue(next);
      if (open) renderCalendar();
      emitChange();
    }

    function refreshTrigger() {
      var display = formatDueDateBoxDisplay(current);
      triggerTitle.textContent = formatDueDateTriggerTitle(current);
      var triggerDays = current ? daysUntilDue(current) : NaN;
      var dayIconName =
        global.ContextMenu && typeof global.ContextMenu.dayIcon === 'function'
          ? global.ContextMenu.dayIcon(triggerDays)
          : 'calendar';
      triggerIcon.className = 'ti ti-' + dayIconName + ' due-date-trigger-icon';
      if (display) {
        triggerValue.textContent = display;
        triggerValue.classList.remove('is-placeholder');
        trigger.classList.add('has-value');
        datePicker.classList.add('has-value');
        dateTrashBtn.hidden = false;
      } else {
        triggerValue.textContent = DUE_DATE_PLACEHOLDER;
        triggerValue.classList.add('is-placeholder');
        trigger.classList.remove('has-value');
        datePicker.classList.remove('has-value');
        dateTrashBtn.hidden = true;
      }
    }

    function refreshTodayBtn() {
      var todayIso = toIsoDate(startOfLocalDay(new Date()));
      var hideToday = !!current && current === todayIso;
      todayBtn.hidden = hideToday;
      footer.hidden = hideToday;
    }

    function paintCountdownDot(band) {
      var accent = dueBandAccent(band);
      if (!accent) {
        countdownDot.hidden = true;
        countdownDot.style.removeProperty('background');
        return;
      }
      countdownDot.hidden = false;
      countdownDot.style.background = accent;
    }

    function refreshVagueToggle() {
      var showLabels = !!current && isDueVagueEligible(current);
      modeSwitch.hidden = false;
      vagueModeBtn.hidden = false;
      modeSwitch.classList.toggle('is-icons-only', !showLabels);
      return true;
    }

    function syncMasterClearBtn(hasDue) {
      masterClearBtn.hidden = !hasDue;
    }

    function clearDueDateAndTime() {
      if (currentTime) rememberedTime = currentTime;
      current = '';
      currentTime = '';
      currentVague = '';
      rememberedVague = '';
      playPriorityUiSound('trash');
      emitChange();
      if (open) renderCalendar();
      if (timeOpen) syncTimePickerSelection();
    }

    function refreshCountdown() {
      var hasVague = currentMode === DUE_DATE_MODE_VAGUE && !!currentVague;
      refreshVagueToggle();
      if (!current && !hasVague) {
        countdownPrimary.textContent = '';
        countdownSecondary.textContent = '';
        countdownSecondary.hidden = true;
        countdown.classList.remove('is-past');
        countdown.classList.add('is-empty');
        countdown.hidden = !enabled;
        field.classList.remove('has-due-date');
        syncMasterClearBtn(false);
        paintCountdownDot('');
        clearDueProximityBand(field);
        refreshTimeRow();
        refreshTrigger();
        refreshSuggestions();
        refreshVagueSlider();
        refreshTodayBtn();
        if (collapseApi) collapseApi.refreshSummary();
        return;
      }
      countdown.hidden = false;
      refreshTrigger();
      refreshTimeRow();
      refreshSuggestions();
      refreshVagueSlider();
      refreshTodayBtn();
      if (!enabled) {
        countdownPrimary.textContent = '';
        countdownSecondary.textContent = '';
        countdownSecondary.hidden = true;
        countdown.classList.remove('is-past');
        countdown.classList.add('is-empty');
        countdown.hidden = true;
        field.classList.remove('has-due-date');
        syncMasterClearBtn(false);
        paintCountdownDot('');
        clearDueProximityBand(field);
        if (collapseApi) collapseApi.refreshSummary();
        return;
      }
      countdown.classList.remove('is-empty');
      syncMasterClearBtn(true);
      if (hasVague) {
        countdownPrimary.textContent = formatDueVagueCountdown(currentVague);
        countdownSecondary.textContent = '';
        countdownSecondary.hidden = true;
        countdown.classList.remove('is-past');
        field.classList.add('has-due-date');
        if (current) {
          var vagueBand = dueProximityBand(current, '');
          applyDueProximityBand(field, vagueBand);
          paintCountdownDot(vagueBand);
        } else {
          paintCountdownDot('');
          clearDueProximityBand(field);
        }
        if (collapseApi) collapseApi.refreshSummary();
        return;
      }
      var human = formatDueDateHumanReadable(current, currentTime);
      var band = dueProximityBand(current, currentTime);
      var past = band === 'overdue';
      countdownPrimary.textContent = human.primary || '';
      countdownSecondary.textContent = human.secondary || '';
      countdownSecondary.hidden = !human.secondary;
      countdown.classList.toggle('is-past', past);
      field.classList.add('has-due-date');
      applyDueProximityBand(field, band);
      paintCountdownDot(band);
      if (collapseApi) collapseApi.refreshSummary();
    }

    function buildDueSummary() {
      if (currentMode === DUE_DATE_MODE_VAGUE && currentVague) {
        var vagueLabel = formatDueVagueCountdown(currentVague);
        if (!vagueLabel) return '';
        var wrapVague = document.createElement('span');
        wrapVague.className = 'due-summary due-summary--vague';
        var icon = document.createElement('i');
        icon.className = 'ti ti-tilde due-summary-vague-icon';
        icon.setAttribute('aria-hidden', 'true');
        var textVague = document.createElement('span');
        textVague.className = 'due-summary-label';
        textVague.textContent = formatDueVagueLabel(currentVague);
        wrapVague.appendChild(icon);
        wrapVague.appendChild(textVague);
        return wrapVague;
      }
      if (!current) return formatDueDateCompactSummary(current, currentTime);
      var label = formatDueDateCompactSummary(current, currentTime);
      if (!label) return '';
      var band = dueProximityBand(current, currentTime);
      var accent = dueBandAccent(band);
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
    }

    function refreshStartTrigger() {
      var display = formatDueDateBoxDisplay(currentStart);
      if (display) {
        startTriggerValue.textContent = display;
        startTriggerValue.classList.remove('is-placeholder');
        startTrigger.classList.add('has-value');
        startPicker.classList.add('has-value');
        startTrashBtn.hidden = false;
      } else {
        startTriggerValue.textContent = DUE_DATE_START_PLACEHOLDER;
        startTriggerValue.classList.add('is-placeholder');
        startTrigger.classList.remove('has-value');
        startPicker.classList.remove('has-value');
        startTrashBtn.hidden = true;
      }
      startTrigger.setAttribute('aria-expanded', startOpen ? 'true' : 'false');
    }

    function refreshRecurrenceUi() {
      var rule = currentRecurrence;
      var recurrenceHint = rule
        ? formatRecurrenceLabelFr(rule, currentTime || rememberedTime || DUE_DATE_TIME_DEFAULT)
        : '';
      recurringSelect.value = rule ? rule.frequency : '';
      recurringClearBtn.hidden = !rule;
      recurringWeekdays.hidden = !rule || rule.frequency !== 'weekly';
      var interval = rule && rule.interval ? rule.interval : 1;
      recurringIntervalInput.value = String(interval);
      recurringIntervalWrap.hidden = !rule;
      recurringTimeWrap.hidden = !rule;
      recurringTimeInput.value = currentTime || rememberedTime || DUE_DATE_TIME_DEFAULT;
      triggerRecurringHint.hidden = !rule;
      timeRecurringHint.hidden = !rule;
      triggerRecurringHint.textContent = recurrenceHint;
      timeRecurringHint.textContent = recurrenceHint;
      var selected = rule && rule.weekdays ? rule.weekdays : [];
      var chips = recurringWeekdays.querySelectorAll('.due-date-recurring-weekday');
      for (var i = 0; i < chips.length; i++) {
        var day = +chips[i].dataset.day;
        var on = selected.indexOf(day) !== -1;
        chips[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        chips[i].classList.toggle('is-selected', on);
      }
    }

    function toggleRecurrenceWeekday(dayIndex) {
      if (!currentRecurrence || currentRecurrence.frequency !== 'weekly') return;
      var days = (currentRecurrence.weekdays || []).slice();
      var idx = days.indexOf(dayIndex);
      if (idx === -1) {
        days.push(dayIndex);
      } else if (days.length > 1) {
        days.splice(idx, 1);
      } else {
        return;
      }
      currentRecurrence = normalizeRecurrence({
        frequency: 'weekly',
        interval: currentRecurrence.interval || 1,
        weekdays: days
      });
      emitChange();
    }

    function renderStartCalendar() {
      if (startViewYear == null || startViewMonth == null) {
        syncStartViewFromValue(currentStart);
      }
      var monthName = DUE_DATE_MONTH_NAMES[startViewMonth];
      var monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      startMonthLabel.textContent = monthCap + ' ' + startViewYear;

      startGrid.textContent = '';
      var first = new Date(startViewYear, startViewMonth, 1);
      var startOffset = sundayOffset(first);
      var gridStart = new Date(startViewYear, startViewMonth, 1 - startOffset);
      var todayIso = toIsoDate(startOfLocalDay(new Date()));

      var row = null;
      for (var i = 0; i < 42; i++) {
        if (i % 7 === 0) {
          row = document.createElement('div');
          row.className = 'due-date-row';
          row.setAttribute('role', 'row');
          startGrid.appendChild(row);
        }
        var cellDate = new Date(
          gridStart.getFullYear(),
          gridStart.getMonth(),
          gridStart.getDate() + i
        );
        var iso = toIsoDate(cellDate);
        var inMonth = cellDate.getMonth() === startViewMonth;
        var isToday = iso === todayIso;
        var isPast = iso < todayIso;
        var isSelected = !!currentStart && iso === currentStart;
        var isFocused = iso === startFocusIso;

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
          DUE_DATE_WEEKDAY_NAMES[sundayOffset(cellDate)] +
            ' ' +
            cellDate.getDate() +
            ' ' +
            DUE_DATE_MONTH_NAMES[cellDate.getMonth()] +
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
          selectStartIso(ev.currentTarget.dataset.iso);
        });
        cell.appendChild(dayBtn);
        row.appendChild(cell);
      }

      var hideToday = !!currentStart && currentStart === todayIso;
      startTodayBtn.hidden = hideToday;
      startFooter.hidden = hideToday;
    }

    function selectStartIso(iso) {
      var next = normalizeDueDate(iso);
      if (!next) return;
      currentStart = next;
      startFocusIso = next;
      syncStartViewFromValue(next);
      emitChange();
      renderStartCalendar();
      hideStartPicker();
    }

    function shiftStartMonth(delta) {
      startViewMonth += delta;
      while (startViewMonth < 0) {
        startViewMonth += 12;
        startViewYear -= 1;
      }
      while (startViewMonth > 11) {
        startViewMonth -= 12;
        startViewYear += 1;
      }
      var daysInMonth = new Date(startViewYear, startViewMonth + 1, 0).getDate();
      var focusDay = dueDateToLocalDate(startFocusIso);
      var day = focusDay ? Math.min(focusDay.getDate(), daysInMonth) : 1;
      startFocusIso = toIsoDate(new Date(startViewYear, startViewMonth, day));
      renderStartCalendar();
    }

    function showStartPicker() {
      if (startOpen) return;
      startOpen = true;
      if (currentStart) syncStartViewFromValue(currentStart);
      else {
        syncStartViewFromValue('');
        startFocusIso = toIsoDate(startOfLocalDay(new Date()));
      }
      startPopover.hidden = false;
      field.classList.add('is-start-open');
      renderStartCalendar();
      refreshStartTrigger();
      bindDocListeners();
      document.addEventListener('mousedown', onStartDocMouseDown, true);
      notifyLayout();
    }

    function hideStartPicker() {
      if (!startOpen) return;
      startOpen = false;
      startPopover.hidden = true;
      field.classList.remove('is-start-open');
      document.removeEventListener('mousedown', onStartDocMouseDown, true);
      refreshStartTrigger();
      unbindDocListeners();
      notifyLayout();
    }

    function onStartDocMouseDown(ev) {
      if (!startOpen) return;
      if (startPicker.contains(ev.target)) return;
      hideStartPicker();
    }

    function emitChange() {
      refreshCountdown();
      refreshStartTrigger();
      refreshRecurrenceUi();
      onChange(getValues());
    }

    function getValues() {
      var vagueActive = currentMode === DUE_DATE_MODE_VAGUE && !!currentVague;
      var out = {
        dueDate: current || '',
        dueTime: current && currentMode === DUE_DATE_MODE_PRECISE ? (currentTime || '') : '',
        dueEnabled: !!(current || vagueActive),
        dueMode: currentMode,
        dueVague: vagueActive ? currentVague : '',
        startDate:
          currentMode === DUE_DATE_MODE_PRECISE ? currentStart || '' : '',
        recurrence:
          currentMode === DUE_DATE_MODE_PRECISE ? currentRecurrence : null,
        dueLimitState: currentDueLimitState,
        dateFixe: currentMode === DUE_DATE_MODE_VAGUE ? false : currentDateFixe
      };
      return out;
    }

    function getValue() {
      return current || '';
    }

    function setValue(value, options) {
      options = options || {};
      if (value && typeof value === 'object') {
        current = normalizeDueDate(value.dueDate);
        currentTime = current ? normalizeDueTime(value.dueTime) : '';
        if (currentTime) rememberedTime = currentTime;
        // dueEnabled:false with a date means "cleared" (legacy disable checkbox).
        if (value.dueEnabled === false) {
          current = '';
          currentTime = '';
          currentVague = '';
          rememberedVague = '';
        }
        if (value.dueVague !== undefined) {
          var nextVague = normalizeDueVague(value.dueVague);
          if (nextVague) {
            currentVague = nextVague;
            rememberedVague = nextVague;
          } else {
            // Empty dueVague while precise must not wipe session memory.
            currentVague = '';
          }
        }
        if (value.dueMode !== undefined) {
          currentMode = normalizeDueMode(value.dueMode);
        } else if (currentVague) {
          currentMode = DUE_DATE_MODE_VAGUE;
        }
        if (currentMode === DUE_DATE_MODE_VAGUE) {
          if (!currentVague && rememberedVague) currentVague = rememberedVague;
          if (currentVague && !current) {
            current = resolveDueVagueToDate(currentVague);
          }
          currentTime = '';
          currentStart = '';
          currentRecurrence = null;
        } else {
          if (currentVague) rememberedVague = currentVague;
          currentVague = '';
        }
        if (value.startDate !== undefined && currentMode === DUE_DATE_MODE_PRECISE) {
          currentStart = normalizeDueDate(value.startDate);
        }
        if (value.recurrence !== undefined && currentMode === DUE_DATE_MODE_PRECISE) {
          currentRecurrence = normalizeRecurrence(value.recurrence);
        }
        if (value.dueLimitState !== undefined) {
          currentDueLimitState =
            value.dueLimitState === DUE_LIMIT_STATE_HAS
              ? DUE_LIMIT_STATE_HAS
              : DUE_LIMIT_STATE_NONE;
        }
        if (value.dateFixe !== undefined) {
          currentDateFixe = !!value.dateFixe;
        }
      } else {
        current = normalizeDueDate(value);
        if (!current) currentTime = '';
        if (currentVague) rememberedVague = currentVague;
        currentVague = '';
        currentMode = DUE_DATE_MODE_PRECISE;
      }
      if (current) {
        syncViewFromValue(current);
      } else {
        syncViewFromValue('');
      }
      syncStartViewFromValue(currentStart);
      if (collapseApi && options.expand != null) {
        collapseApi.setExpanded(!!options.expand, { notifyLayout: false });
      } else if (collapseApi && current && !options.preserveCollapse) {
        // Keep current expand state; do not force-open on every setValue.
      }
      refreshModeUi();
      refreshCountdown();
      refreshStartTrigger();
      refreshRecurrenceUi();
      paintDueLimitSwitch();
    }

    function setEnabled(nextEnabled, options) {
      // No enable checkbox — treat as expand control when asked to open/close.
      options = options || {};
      if (collapseApi && options.expand != null) {
        collapseApi.setExpanded(!!options.expand);
        return;
      }
      if (collapseApi && nextEnabled && options.expand !== false) {
        collapseApi.setExpanded(true);
      }
    }

    function clampFocusToViewMonth() {
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var focusDay = dueDateToLocalDate(focusIso);
      var day = focusDay ? Math.min(focusDay.getDate(), daysInMonth) : 1;
      focusIso = toIsoDate(new Date(viewYear, viewMonth, day));
    }

    function yearPickerRangeStart(year) {
      var nowYear = new Date().getFullYear();
      var y = year == null ? viewYear : year;
      if (y < nowYear) y = nowYear;
      var offset = y - nowYear;
      return nowYear + Math.floor(offset / DUE_DATE_YEAR_PICKER_COUNT) * DUE_DATE_YEAR_PICKER_COUNT;
    }

    function syncNavChrome() {
      var monthName = DUE_DATE_MONTH_NAMES[viewMonth];
      var monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      var focusDay = dueDateToLocalDate(focusIso);
      var nowYear = new Date().getFullYear();
      dayPickBtn.textContent = String(focusDay ? focusDay.getDate() : 1);
      monthPickBtn.textContent = monthCap;
      yearPickBtn.textContent = String(viewYear);
      dayPickBtn.hidden = calendarMode === 'year';
      monthPickBtn.hidden = calendarMode === 'year';
      yearPickBtn.hidden = false;
      dayPickBtn.setAttribute('aria-expanded', calendarMode === 'date' ? 'true' : 'false');
      monthPickBtn.setAttribute('aria-expanded', calendarMode === 'month' ? 'true' : 'false');
      yearPickBtn.setAttribute('aria-expanded', calendarMode === 'year' ? 'true' : 'false');
      dayPickBtn.classList.toggle('is-active', calendarMode === 'date');
      monthPickBtn.classList.toggle('is-active', calendarMode === 'month');
      yearPickBtn.classList.toggle('is-active', calendarMode === 'year');

      if (calendarMode === 'year') {
        if (yearPickerStart == null) yearPickerStart = yearPickerRangeStart(viewYear);
        if (yearPickerStart < nowYear) yearPickerStart = nowYear;
        var endYear = yearPickerStart + DUE_DATE_YEAR_PICKER_COUNT - 1;
        yearPickBtn.textContent = yearPickerStart + '\u2013' + endYear;
        prevBtn.setAttribute('aria-label', DUE_DATE_PREV_YEARS);
        nextBtn.setAttribute('aria-label', DUE_DATE_NEXT_YEARS);
        prevBtn.disabled = yearPickerStart <= nowYear;
      } else if (calendarMode === 'month') {
        yearPickBtn.textContent = String(viewYear);
        prevBtn.setAttribute('aria-label', DUE_DATE_PREV_YEAR);
        nextBtn.setAttribute('aria-label', DUE_DATE_NEXT_YEAR);
        prevBtn.disabled = false;
      } else {
        prevBtn.setAttribute('aria-label', DUE_DATE_PREV_MONTH);
        nextBtn.setAttribute('aria-label', DUE_DATE_NEXT_MONTH);
        prevBtn.disabled = false;
      }

      weekdays.hidden = calendarMode !== 'day';
      popover.dataset.calendarMode = calendarMode;
    }

    function setCalendarMode(mode) {
      var next = mode === 'month' || mode === 'year' || mode === 'date' ? mode : 'day';
      calendarMode = next;
      if (calendarMode === 'year') {
        yearPickerStart = yearPickerRangeStart(viewYear);
      }
      renderCalendar(calendarMode === 'day');
    }

    function shiftCalendar(delta) {
      if (calendarMode === 'year') {
        var nowYear = new Date().getFullYear();
        if (yearPickerStart == null) yearPickerStart = yearPickerRangeStart(viewYear);
        var nextStart = yearPickerStart + delta * DUE_DATE_YEAR_PICKER_COUNT;
        if (nextStart < nowYear) nextStart = nowYear;
        if (nextStart === yearPickerStart && delta < 0) return;
        yearPickerStart = nextStart;
        renderCalendar();
        return;
      }
      if (calendarMode === 'month') {
        viewYear += delta;
        clampFocusToViewMonth();
        renderCalendar(true);
        return;
      }
      var next = new Date(viewYear, viewMonth + delta, 1);
      viewYear = next.getFullYear();
      viewMonth = next.getMonth();
      clampFocusToViewMonth();
      renderCalendar(true);
    }

    function selectMonth(monthIndex) {
      if (monthIndex < 0 || monthIndex > 11) return;
      viewMonth = monthIndex;
      clampFocusToViewMonth();
      calendarMode = 'day';
      renderCalendar(true);
    }

    function selectDayOfMonth(dayNum) {
      if (!isFinite(dayNum) || dayNum < 1) return;
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var day = Math.min(Math.floor(dayNum), daysInMonth);
      var iso = toIsoDate(new Date(viewYear, viewMonth, day));
      selectIso(iso);
    }

    function selectYear(year) {
      if (!isFinite(year)) return;
      var nowYear = new Date().getFullYear();
      if (year < nowYear) return;
      viewYear = year;
      yearPickerStart = yearPickerRangeStart(year);
      clampFocusToViewMonth();
      calendarMode = 'month';
      renderCalendar();
    }

    function selectIso(iso) {
      if (!enabled) return;
      var next = normalizeDueDate(iso);
      if (!next) return;
      if (currentMode !== DUE_DATE_MODE_PRECISE) {
        currentMode = DUE_DATE_MODE_PRECISE;
        if (currentVague) rememberedVague = currentVague;
        currentVague = '';
        refreshModeUi();
      }
      if (!currentTime) {
        currentTime = rememberedTime || DUE_DATE_TIME_DEFAULT;
      }
      if (currentTime) rememberedTime = currentTime;
      current = next;
      focusIso = next;
      syncViewFromValue(next);
      calendarMode = 'day';
      emitChange();
      renderCalendar();
    }

    function focusDayButton(iso) {
      var btn = grid.querySelector('[data-iso="' + iso + '"]');
      if (btn) btn.focus();
    }

    function renderDatePicker() {
      grid.className = 'due-date-grid due-date-grid--dates';
      grid.setAttribute('role', 'listbox');
      grid.setAttribute('aria-label', DUE_DATE_PICK_DAY_LABEL);
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var now = startOfLocalDay(new Date());
      var todayDay =
        now.getFullYear() === viewYear && now.getMonth() === viewMonth ? now.getDate() : -1;
      var selectedDay = current
        ? (function () {
            var d = dueDateToLocalDate(current);
            return d && d.getFullYear() === viewYear && d.getMonth() === viewMonth
              ? d.getDate()
              : -1;
          })()
        : -1;
      var focusDay = dueDateToLocalDate(focusIso);
      var focusedDay =
        focusDay && focusDay.getFullYear() === viewYear && focusDay.getMonth() === viewMonth
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
            DUE_DATE_MONTH_NAMES[viewMonth] +
            ' ' +
            viewYear
        );
        var cellDate = new Date(viewYear, viewMonth, d);
        var isPast = cellDate.getTime() < now.getTime();
        var daySelected = d === focusedDay || (focusedDay < 0 && d === selectedDay);
        dateBtn.setAttribute('aria-selected', daySelected ? 'true' : 'false');
        if (d === todayDay) dateBtn.classList.add('is-today');
        if (d === selectedDay) dateBtn.classList.add('is-current');
        if (daySelected) dateBtn.classList.add('is-selected');
        if (isPast) dateBtn.classList.add('is-past');
        dateBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          selectDayOfMonth(+ev.currentTarget.dataset.day);
        });
        grid.appendChild(dateBtn);
      }
    }

    function renderMonthPicker() {
      grid.className = 'due-date-grid due-date-grid--months';
      grid.setAttribute('role', 'listbox');
      grid.setAttribute('aria-label', DUE_DATE_PICK_MONTH_LABEL);
      var now = new Date();
      var thisMonth = now.getFullYear() === viewYear ? now.getMonth() : -1;
      var selectedMonth = current
        ? (function () {
            var d = dueDateToLocalDate(current);
            return d && d.getFullYear() === viewYear ? d.getMonth() : -1;
          })()
        : -1;

      for (var m = 0; m < 12; m++) {
        var monthBtn = document.createElement('button');
        monthBtn.type = 'button';
        monthBtn.className = 'due-date-month-option';
        monthBtn.dataset.month = String(m);
        monthBtn.textContent = DUE_DATE_MONTH_SHORT[m];
        monthBtn.setAttribute('role', 'option');
        monthBtn.setAttribute(
          'aria-label',
          DUE_DATE_MONTH_NAMES[m].charAt(0).toUpperCase() + DUE_DATE_MONTH_NAMES[m].slice(1) + ' ' + viewYear
        );
        var isPast =
          viewYear < now.getFullYear() ||
          (viewYear === now.getFullYear() && m < now.getMonth());
        var monthSelected = m === viewMonth;
        monthBtn.setAttribute('aria-selected', monthSelected ? 'true' : 'false');
        if (m === thisMonth) monthBtn.classList.add('is-today');
        if (m === selectedMonth) monthBtn.classList.add('is-current');
        if (monthSelected) monthBtn.classList.add('is-selected');
        if (isPast) monthBtn.classList.add('is-past');
        monthBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          selectMonth(+ev.currentTarget.dataset.month);
        });
        grid.appendChild(monthBtn);
      }
    }

    function renderYearPicker() {
      grid.className = 'due-date-grid due-date-grid--years';
      grid.setAttribute('role', 'listbox');
      grid.setAttribute('aria-label', DUE_DATE_PICK_YEAR_LABEL);
      var nowYear = new Date().getFullYear();
      if (yearPickerStart == null || yearPickerStart < nowYear) {
        yearPickerStart = yearPickerRangeStart(viewYear);
      }
      var selectedYear = current
        ? (function () {
            var d = dueDateToLocalDate(current);
            return d ? d.getFullYear() : -1;
          })()
        : -1;

      for (var i = 0; i < DUE_DATE_YEAR_PICKER_COUNT; i++) {
        var year = yearPickerStart + i;
        var yearBtn = document.createElement('button');
        yearBtn.type = 'button';
        yearBtn.className = 'due-date-year-option';
        yearBtn.dataset.year = String(year);
        yearBtn.textContent = String(year);
        yearBtn.setAttribute('role', 'option');
        yearBtn.setAttribute('aria-label', String(year));
        var yearSelected = year === viewYear;
        yearBtn.setAttribute('aria-selected', yearSelected ? 'true' : 'false');
        if (year === nowYear) yearBtn.classList.add('is-today');
        if (year === selectedYear) yearBtn.classList.add('is-current');
        if (yearSelected) yearBtn.classList.add('is-selected');
        yearBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          selectYear(+ev.currentTarget.dataset.year);
        });
        grid.appendChild(yearBtn);
      }
    }

    function renderDayGrid(keepFocus) {
      grid.className = 'due-date-grid';
      grid.setAttribute('role', 'grid');
      grid.setAttribute('aria-labelledby', uid + '-month');

      var first = new Date(viewYear, viewMonth, 1);
      var startOffset = sundayOffset(first);
      var gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
      var todayIso = toIsoDate(startOfLocalDay(new Date()));

      var row = null;
      for (var i = 0; i < 42; i++) {
        if (i % 7 === 0) {
          row = document.createElement('div');
          row.className = 'due-date-row';
          row.setAttribute('role', 'row');
          grid.appendChild(row);
        }
        var cellDate = new Date(
          gridStart.getFullYear(),
          gridStart.getMonth(),
          gridStart.getDate() + i
        );
        var iso = toIsoDate(cellDate);
        var inMonth = cellDate.getMonth() === viewMonth;
        var isToday = iso === todayIso;
        var isPast = iso < todayIso;
        var isSelected = !!current && iso === current;
        var isFocused = iso === focusIso;

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
          DUE_DATE_WEEKDAY_NAMES[sundayOffset(cellDate)] +
            ' ' +
            cellDate.getDate() +
            ' ' +
            DUE_DATE_MONTH_NAMES[cellDate.getMonth()] +
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
          selectIso(ev.currentTarget.dataset.iso);
        });

        cell.appendChild(dayBtn);
        row.appendChild(cell);
      }

      if (keepFocus) focusDayButton(focusIso);
    }

    function renderCalendar(keepFocus) {
      syncNavChrome();
      grid.textContent = '';
      if (calendarMode === 'month') {
        renderMonthPicker();
        return;
      }
      if (calendarMode === 'year') {
        renderYearPicker();
        return;
      }
      if (calendarMode === 'date') {
        renderDatePicker();
        return;
      }
      renderDayGrid(keepFocus);
    }

    function shiftMonth(delta) {
      shiftCalendar(delta);
    }

    function onDocKeyDown(ev) {
      if (ev.key === 'Escape' && startOpen) {
        ev.preventDefault();
        hideStartPicker();
        return;
      }
      if (!open || !enabled || calendarMode !== 'day') return;
      if (!grid.contains(document.activeElement) && document.activeElement !== todayBtn) {
        return;
      }
      var focusDate = dueDateToLocalDate(focusIso) || startOfLocalDay(new Date());
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
        nextDate = new Date(viewYear, viewMonth, 1);
      } else if (ev.key === 'End') {
        nextDate = new Date(viewYear, viewMonth + 1, 0);
      } else if (ev.key === 'PageUp') {
        ev.preventDefault();
        shiftMonth(ev.shiftKey ? -12 : -1);
        return;
      } else if (ev.key === 'PageDown') {
        ev.preventDefault();
        shiftMonth(ev.shiftKey ? 12 : 1);
        return;
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        if (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.iso) {
          ev.preventDefault();
          selectIso(document.activeElement.dataset.iso);
        }
        return;
      }
      if (!nextDate) return;
      ev.preventDefault();
      focusIso = toIsoDate(nextDate);
      if (nextDate.getMonth() !== viewMonth || nextDate.getFullYear() !== viewYear) {
        viewYear = nextDate.getFullYear();
        viewMonth = nextDate.getMonth();
      }
      renderCalendar(true);
    }

    function bindDocListeners() {
      if (docListenersBound) return;
      document.addEventListener('keydown', onDocKeyDown, true);
      docListenersBound = true;
    }

    function unbindDocListeners() {
      if (docListenersBound && !open && !timeOpen && !startOpen) {
        document.removeEventListener('keydown', onDocKeyDown, true);
        docListenersBound = false;
      }
    }

    function showPickers() {
      if (!enabled) return;
      var wasOpen = open && timeOpen;
      open = true;
      timeOpen = true;
      calendarMode = 'day';
      if (current) syncViewFromValue(current);
      else {
        syncViewFromValue('');
        focusIso = toIsoDate(startOfLocalDay(new Date()));
      }
      popover.hidden = false;
      timePopover.hidden = false;
      field.classList.add('is-open', 'is-time-open');
      setDialMode(dialMode === 'minute' ? 'minute' : 'hour');
      renderCalendar();
      syncTimePickerSelection();
      bindDocListeners();
      if (!wasOpen) notifyLayout();
    }

    function hidePickers() {
      if (!open && !timeOpen) return;
      commitDigitalEdits();
      open = false;
      timeOpen = false;
      popover.hidden = true;
      timePopover.hidden = true;
      field.classList.remove('is-open', 'is-time-open');
      unbindDocListeners();
      notifyLayout();
    }

    masterClearBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!enabled) return;
      clearDueDateAndTime();
    });

    dateTrashBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!enabled) return;
      clearDueDateAndTime();
    });

    preciseModeBtn.addEventListener('click', function () {
      setDueMode(DUE_DATE_MODE_PRECISE);
    });
    vagueModeBtn.addEventListener('click', function () {
      setDueMode(DUE_DATE_MODE_VAGUE);
    });

    timeTrashBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!enabled) return;
      currentTime = '';
      rememberedTime = '';
      playPriorityUiSound('trash');
      emitChange();
      if (timeOpen) syncTimePickerSelection();
    });

    digitalHourInput.addEventListener('focus', function () {
      setDialMode('hour');
      requestAnimationFrame(function () {
        digitalHourInput.select();
      });
    });

    digitalMinuteInput.addEventListener('focus', function () {
      setDialMode('minute');
      requestAnimationFrame(function () {
        digitalMinuteInput.select();
      });
    });

    digitalHourInput.addEventListener('click', function () {
      digitalHourInput.select();
    });

    digitalMinuteInput.addEventListener('click', function () {
      digitalMinuteInput.select();
    });

    digitalHourInput.addEventListener('input', function () {
      digitalHourInput.value = digitsOnly(digitalHourInput.value, 2);
      if (digitalHourInput.value.length === 2) {
        commitDigitalHour({ advance: true });
      }
    });

    digitalMinuteInput.addEventListener('input', function () {
      digitalMinuteInput.value = digitsOnly(digitalMinuteInput.value, 2);
      if (digitalMinuteInput.value.length === 2) {
        commitDigitalMinute();
      }
    });

    digitalHourInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitDigitalHour({ advance: true });
      } else if (event.key === 'ArrowRight' &&
          digitalHourInput.selectionStart === digitalHourInput.value.length) {
        event.preventDefault();
        commitDigitalHour({ advance: true });
      }
    });

    digitalMinuteInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitDigitalMinute();
        digitalMinuteInput.blur();
      } else if (event.key === 'ArrowLeft' && digitalMinuteInput.selectionStart === 0) {
        event.preventDefault();
        commitDigitalMinute();
        setDialMode('hour');
        digitalHourInput.focus();
        digitalHourInput.select();
      }
    });

    digitalHourInput.addEventListener('blur', function () {
      /* Defer so focus moves (e.g. hour → minute) before commit. */
      setTimeout(function () {
        if (document.activeElement === digitalHourInput) return;
        if (!timeOpen) return;
        if (digitalHourInput.value.length) commitDigitalHour();
        else digitalHourInput.value = digitalHourDisplayValue();
      }, 0);
    });

    digitalMinuteInput.addEventListener('blur', function () {
      setTimeout(function () {
        if (document.activeElement === digitalMinuteInput) return;
        if (!timeOpen) return;
        if (digitalMinuteInput.value.length) commitDigitalMinute();
        else digitalMinuteInput.value = pad2(dialMinute);
      }, 0);
    });

    amBtn.addEventListener('click', function () {
      setMeridiem(false);
    });

    pmBtn.addEventListener('click', function () {
      setMeridiem(true);
    });

    clockFace.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      if (event.target && event.target.closest &&
          event.target.closest('.due-date-time-clock-num')) {
        return;
      }
      dialDragging = true;
      clockFace.classList.add('is-dragging');
      if (clockFace.setPointerCapture) {
        try { clockFace.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
      }
      applyPointerToDial(event.clientX, event.clientY, false);
      event.preventDefault();
    });

    clockFace.addEventListener('pointermove', function (event) {
      if (!dialDragging) return;
      applyPointerToDial(event.clientX, event.clientY, false);
    });

    function endClockDrag(event) {
      if (!dialDragging) return;
      dialDragging = false;
      clockFace.classList.remove('is-dragging');
      if (event && dialMode === 'hour') setDialMode('minute');
    }

    clockFace.addEventListener('pointerup', endClockDrag);
    clockFace.addEventListener('pointercancel', endClockDrag);

    clockFace.addEventListener('keydown', function (event) {
      var step = event.shiftKey ? 5 : 1;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (dialMode === 'hour') dialHour = (dialHour + 1) % 24;
        else dialMinute = (dialMinute + step) % 60;
        commitDialTime(false);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        if (dialMode === 'hour') dialHour = (dialHour + 23) % 24;
        else dialMinute = (dialMinute + 60 - step) % 60;
        commitDialTime(false);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setDialMode(dialMode === 'hour' ? 'minute' : 'hour');
      }
    });

    prevBtn.addEventListener('click', function () {
      shiftMonth(-1);
    });

    nextBtn.addEventListener('click', function () {
      shiftMonth(1);
    });

    monthPickBtn.addEventListener('click', function () {
      setCalendarMode(calendarMode === 'month' ? 'day' : 'month');
    });

    dayPickBtn.addEventListener('click', function () {
      setCalendarMode(calendarMode === 'date' ? 'day' : 'date');
    });

    yearPickBtn.addEventListener('click', function () {
      setCalendarMode(calendarMode === 'year' ? 'day' : 'year');
    });

    todayBtn.addEventListener('click', function () {
      calendarMode = 'day';
      selectIso(toIsoDate(startOfLocalDay(new Date())));
    });

    startTrigger.addEventListener('click', function (event) {
      if (event.target.closest('.due-date-trigger-clear')) return;
      event.preventDefault();
      event.stopPropagation();
      if (startOpen) hideStartPicker();
      else showStartPicker();
    });

    startTrigger.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('.due-date-trigger-clear')) return;
      event.preventDefault();
      if (startOpen) hideStartPicker();
      else showStartPicker();
    });

    startTrashBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      currentStart = '';
      playPriorityUiSound('trash');
      emitChange();
      if (startOpen) {
        syncStartViewFromValue('');
        renderStartCalendar();
      }
    });

    startPrevBtn.addEventListener('click', function () {
      shiftStartMonth(-1);
    });

    startNextBtn.addEventListener('click', function () {
      shiftStartMonth(1);
    });

    startTodayBtn.addEventListener('click', function () {
      selectStartIso(toIsoDate(startOfLocalDay(new Date())));
    });

    recurringSelect.addEventListener('change', function () {
      var freq = recurringSelect.value;
      if (!freq) {
        currentRecurrence = null;
      } else {
        if (!current) {
          current = toIsoDate(startOfLocalDay(new Date()));
          focusIso = current;
          syncViewFromValue(current);
        }
        if (!currentTime) {
          currentTime = rememberedTime || DUE_DATE_TIME_DEFAULT;
          rememberedTime = currentTime;
        }
        var weekdays;
        if (freq === 'weekly') {
          if (
            currentRecurrence &&
            currentRecurrence.frequency === 'weekly' &&
            currentRecurrence.weekdays &&
            currentRecurrence.weekdays.length
          ) {
            weekdays = currentRecurrence.weekdays.slice();
          } else {
            var due = dueDateToLocalDate(current);
            weekdays = [due ? due.getDay() : new Date().getDay()];
          }
        }
        currentRecurrence = normalizeRecurrence({
          frequency: freq,
          interval:
            currentRecurrence && currentRecurrence.interval
              ? currentRecurrence.interval
              : 1,
          weekdays: weekdays
        });
      }
      emitChange();
    });

    recurringClearBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!currentRecurrence) return;
      currentRecurrence = null;
      playPriorityUiSound('trash');
      emitChange();
    });

    recurringIntervalInput.addEventListener('change', function () {
      if (!currentRecurrence) return;
      var next = Math.round(Number(recurringIntervalInput.value));
      if (!isFinite(next) || next < 1) next = 1;
      if (next > 99) next = 99;
      currentRecurrence = normalizeRecurrence({
        frequency: currentRecurrence.frequency,
        interval: next,
        weekdays: currentRecurrence.weekdays
      });
      emitChange();
    });

    recurringTimeInput.addEventListener('change', function () {
      if (!currentRecurrence) return;
      selectTime(recurringTimeInput.value || DUE_DATE_TIME_DEFAULT);
    });

    collapseApi = bindCollapsibleEnable({
      field: field,
      body: body,
      chrome: chrome,
      alwaysEnabled: true,
      enabled: true,
      expanded: config.expanded != null ? !!config.expanded : !!current,
      getSummary: buildDueSummary,
      onLayoutChange: notifyLayout,
      onExpandChange: function (expanded, options) {
        refreshSuggestions();
        if (typeof config.onExpandChange === 'function') {
          config.onExpandChange(expanded, options);
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
          current ||
          (currentMode === DUE_DATE_MODE_VAGUE && currentVague)
        );
        return ContextMenu.buildDueItems({
          isExpanded: api.isExpanded,
          setExpanded: api.setExpanded,
          suggestions: DUE_DATE_QUICK_SUGGESTIONS,
          applyQuick: function (id) {
            api.setExpanded(true);
            applyQuickSuggestion(id);
          },
          clearDue: function () {
            clearDueDateAndTime();
          },
          clearDisabled: !hasDue,
        });
      },
    });
    refreshCountdown();
    refreshStartTrigger();
    refreshRecurrenceUi();
    refreshModeUi();

    return {
      el: field,
      getValue: getValue,
      getValues: getValues,
      setValue: setValue,
      setEnabled: setEnabled,
      applyQuickSuggestion: applyQuickSuggestion,
      clearDueDateAndTime: clearDueDateAndTime,
      refreshTimeFormat: function () {
        refreshCountdown();
      },
      setEnableAllowed: collapseApi.setEnableAllowed,
      isEnableAllowed: collapseApi.isEnableAllowed,
      setExpanded: collapseApi.setExpanded,
      isEnabled: function () {
        return !!(current || (currentMode === DUE_DATE_MODE_VAGUE && currentVague));
      },
      isExpanded: collapseApi.isExpanded
    };
  }

  // exports
  S.createDueDateField = createDueDateField;
})(typeof window !== 'undefined' ? window : this);
