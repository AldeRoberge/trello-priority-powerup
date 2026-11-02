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
    var M = Object.create(null);
    M.config = config;
    var __parts = (global.PriorityUIPartsMountCreateDueDateField || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  // exports
  S.createDueDateField = createDueDateField;

  // shared with the createDueDateField parts
  S.S = S;
})(typeof window !== 'undefined' ? window : this);
