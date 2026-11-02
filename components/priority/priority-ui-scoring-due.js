/**
 * priority-ui: part 4 of 12 (dueProximityBand).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */

/**
 * priority-ui-scoring: part 1 of 2 (dueProximityBand).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui-scoring.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var AXIS_SCORE_MAX = S.AXIS_SCORE_MAX;
  var AXIS_UI_MAX = S.AXIS_UI_MAX;
  var BASE_EASE_WEIGHT = S.BASE_EASE_WEIGHT;
  var BASE_IMPACT_WEIGHT = S.BASE_IMPACT_WEIGHT;
  var BLOCKED_DESCRIPTION = S.BLOCKED_DESCRIPTION;
  var BLOCKED_LABEL = S.BLOCKED_LABEL;
  var BLOCKED_SYMBOL = S.BLOCKED_SYMBOL;
  var COUNTDOWN_DAYS_PER_WEEK = S.COUNTDOWN_DAYS_PER_WEEK;
  var COUNTDOWN_HOUR_DISPLAY_MAX = S.COUNTDOWN_HOUR_DISPLAY_MAX;
  var COUNTDOWN_WEEK_THRESHOLD_DAYS = S.COUNTDOWN_WEEK_THRESHOLD_DAYS;
  var COUNTDOWN_YEAR_THRESHOLD_DAYS = S.COUNTDOWN_YEAR_THRESHOLD_DAYS;
  var DAMPEN_MAX = S.DAMPEN_MAX;
  var DAMPEN_POWER = S.DAMPEN_POWER;
  var DATE_GAIN_FIXED = S.DATE_GAIN_FIXED;
  var DATE_GAIN_MOVABLE = S.DATE_GAIN_MOVABLE;
  var DATE_PROXIMITY_TAU_DAYS = S.DATE_PROXIMITY_TAU_DAYS;
  var DAYS_PER_MONTH_AVG = S.DAYS_PER_MONTH_AVG;
  var DAYS_PER_YEAR_AVG = S.DAYS_PER_YEAR_AVG;
  var DUE_DATE_BOX_LABEL = S.DUE_DATE_BOX_LABEL;
  var DUE_DATE_MODE_VAGUE = S.DUE_DATE_MODE_VAGUE;
  var DUE_DATE_MONTH_NAMES = S.DUE_DATE_MONTH_NAMES;
  var DUE_DATE_TIME_AM_LABEL = S.DUE_DATE_TIME_AM_LABEL;
  var DUE_DATE_TIME_LABEL = S.DUE_DATE_TIME_LABEL;
  var DUE_DATE_TIME_PERIODS = S.DUE_DATE_TIME_PERIODS;
  var DUE_DATE_TIME_PM_LABEL = S.DUE_DATE_TIME_PM_LABEL;
  var DUE_DATE_WEEKDAY_NAMES = S.DUE_DATE_WEEKDAY_NAMES;
  var DUE_LIMIT_STATE_NONE = S.DUE_LIMIT_STATE_NONE;
  var DUE_PROXIMITY_BANDS = S.DUE_PROXIMITY_BANDS;
  var EASE_COST_DEFS = S.EASE_COST_DEFS;
  var EASE_FLOOR = S.EASE_FLOOR;
  var EASE_QUICK_WINS = S.EASE_QUICK_WINS;
  var EISENHOWER_IMPACT_THRESHOLD = S.EISENHOWER_IMPACT_THRESHOLD;
  var EISENHOWER_URGENCY_THRESHOLD = S.EISENHOWER_URGENCY_THRESHOLD;
  var EMPRESSEMENT_DEFAULT_ID = S.EMPRESSEMENT_DEFAULT_ID;
  var EMPRESSEMENT_OPTIONS = S.EMPRESSEMENT_OPTIONS;
  var EMPRESSEMENT_PULL_MAX = S.EMPRESSEMENT_PULL_MAX;
  var EMPRESSEMENT_UI_MAX = S.EMPRESSEMENT_UI_MAX;
  var IMPACT_EXP = S.IMPACT_EXP;
  var IMPACT_FACTOR_DEFS = S.IMPACT_FACTOR_DEFS;
  var IMPACT_SYNERGY_PER_EXTRA = S.IMPACT_SYNERGY_PER_EXTRA;
  var INUTILE_EPS = S.INUTILE_EPS;
  var INUTILE_LABEL = S.INUTILE_LABEL;
  var INUTILE_STYLES = S.INUTILE_STYLES;
  var INUTILE_STYLES_DARK = S.INUTILE_STYLES_DARK;
  var LABELS = S.LABELS;
  var MS_PER_DAY = S.MS_PER_DAY;
  var MS_PER_HOUR = S.MS_PER_HOUR;
  var MS_PER_MINUTE = S.MS_PER_MINUTE;
  var PRESSURE_MAX = S.PRESSURE_MAX;
  var SCORE_MAX = S.SCORE_MAX;
  var TIERS_DARK = S.TIERS_DARK;
  var TIER_DEFS = S.TIER_DEFS;
  var TIER_I_MAX = S.TIER_I_MAX;
  var TRELLO_BADGE_COLOR_MUTED = S.TRELLO_BADGE_COLOR_MUTED;
  var URGENCY_BOOST_MAX = S.URGENCY_BOOST_MAX;
  var URGENCY_BOOST_MIN_U = S.URGENCY_BOOST_MIN_U;
  var URGENCY_MIGRATION_MODE = S.URGENCY_MIGRATION_MODE;
  var URGENCY_REVIEW_THRESHOLD_10 = S.URGENCY_REVIEW_THRESHOLD_10;
  var URGENCY_TO_TB = S.URGENCY_TO_TB;
  var WB = S.WB;
  var WI = S.WI;
  var WT = S.WT;

  // from other parts (functions, resolved at call time)
  function applySectionGlow() { return S.applySectionGlow.apply(this, arguments); }
  function clamp() { return S.clamp.apply(this, arguments); }
  function clearSectionGlow() { return S.clearSectionGlow.apply(this, arguments); }
  function deriveLegacyUrgency() { return S.deriveLegacyUrgency.apply(this, arguments); }
  function empressementIndex() { return S.empressementIndex.apply(this, arguments); }
  function calcEisenhower() { return S.calcEisenhower.apply(this, arguments); }
  function calcValueEffort() { return S.calcValueEffort.apply(this, arguments); }
  function calcWSJF() { return S.calcWSJF.apply(this, arguments); }
  function daysUntilDue() { return S.daysUntilDue.apply(this, arguments); }
  function dueBandAccent() { return S.dueBandAccent.apply(this, arguments); }
  function dueDateToLocalDate() { return S.dueDateToLocalDate.apply(this, arguments); }
  function escapeHtml() { return S.escapeHtml.apply(this, arguments); }
  function formatBaseline() { return S.formatBaseline.apply(this, arguments); }
  function formatBlockedReasonsSummary() { return S.formatBlockedReasonsSummary.apply(this, arguments); }
  function formatDueCountdownFromInputs() { return S.formatDueCountdownFromInputs.apply(this, arguments); }
  function formatEisenhower() { return S.formatEisenhower.apply(this, arguments); }
  function formatValueEffort() { return S.formatValueEffort.apply(this, arguments); }
  function formatWSJF() { return S.formatWSJF.apply(this, arguments); }
  function hour24ToHour12Parts() { return S.hour24ToHour12Parts.apply(this, arguments); }
  function isBlockedWaitingOtherTask() { return S.isBlockedWaitingOtherTask.apply(this, arguments); }
  function isDuePast() { return S.isDuePast.apply(this, arguments); }
  function isDueVagueMode() { return S.isDueVagueMode.apply(this, arguments); }
  function isHour12() { return S.isHour12.apply(this, arguments); }
  function levelIconSvg() { return S.levelIconSvg.apply(this, arguments); }
  function msUntilDue() { return S.msUntilDue.apply(this, arguments); }
  function normalizeBlockedLinks() { return S.normalizeBlockedLinks.apply(this, arguments); }
  function normalizeBlockedReasons() { return S.normalizeBlockedReasons.apply(this, arguments); }
  function normalizeDueDate() { return S.normalizeDueDate.apply(this, arguments); }
  function normalizeDueTime() { return S.normalizeDueTime.apply(this, arguments); }
  function normalizeDueVague() { return S.normalizeDueVague.apply(this, arguments); }
  function overrideBaseline() { return S.overrideBaseline.apply(this, arguments); }
  function overrideEisenhower() { return S.overrideEisenhower.apply(this, arguments); }
  function overrideValueEffort() { return S.overrideValueEffort.apply(this, arguments); }
  function overrideWSJF() { return S.overrideWSJF.apply(this, arguments); }
  function pad2() { return S.pad2.apply(this, arguments); }
  function priorityStylesForScore() { return S.priorityStylesForScore.apply(this, arguments); }
  function resolveDueVagueToDate() { return S.resolveDueVagueToDate.apply(this, arguments); }
  function sundayOffset() { return S.sundayOffset.apply(this, arguments); }

var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var AXIS_SCORE_MAX = S.AXIS_SCORE_MAX;
  var AXIS_UI_MAX = S.AXIS_UI_MAX;
  var BASE_EASE_WEIGHT = S.BASE_EASE_WEIGHT;
  var BASE_IMPACT_WEIGHT = S.BASE_IMPACT_WEIGHT;
  var BLOCKED_DESCRIPTION = S.BLOCKED_DESCRIPTION;
  var BLOCKED_LABEL = S.BLOCKED_LABEL;
  var BLOCKED_SYMBOL = S.BLOCKED_SYMBOL;
  var COUNTDOWN_DAYS_PER_WEEK = S.COUNTDOWN_DAYS_PER_WEEK;
  var COUNTDOWN_HOUR_DISPLAY_MAX = S.COUNTDOWN_HOUR_DISPLAY_MAX;
  var COUNTDOWN_WEEK_THRESHOLD_DAYS = S.COUNTDOWN_WEEK_THRESHOLD_DAYS;
  var COUNTDOWN_YEAR_THRESHOLD_DAYS = S.COUNTDOWN_YEAR_THRESHOLD_DAYS;
  var DAMPEN_MAX = S.DAMPEN_MAX;
  var DAMPEN_POWER = S.DAMPEN_POWER;
  var DATE_GAIN_FIXED = S.DATE_GAIN_FIXED;
  var DATE_GAIN_MOVABLE = S.DATE_GAIN_MOVABLE;
  var DATE_PROXIMITY_TAU_DAYS = S.DATE_PROXIMITY_TAU_DAYS;
  var DAYS_PER_MONTH_AVG = S.DAYS_PER_MONTH_AVG;
  var DAYS_PER_YEAR_AVG = S.DAYS_PER_YEAR_AVG;
  var DUE_DATE_BOX_LABEL = S.DUE_DATE_BOX_LABEL;
  var DUE_DATE_MODE_VAGUE = S.DUE_DATE_MODE_VAGUE;
  var DUE_DATE_MONTH_NAMES = S.DUE_DATE_MONTH_NAMES;
  var DUE_DATE_TIME_AM_LABEL = S.DUE_DATE_TIME_AM_LABEL;
  var DUE_DATE_TIME_LABEL = S.DUE_DATE_TIME_LABEL;
  var DUE_DATE_TIME_PERIODS = S.DUE_DATE_TIME_PERIODS;
  var DUE_DATE_TIME_PM_LABEL = S.DUE_DATE_TIME_PM_LABEL;
  var DUE_DATE_WEEKDAY_NAMES = S.DUE_DATE_WEEKDAY_NAMES;
  var DUE_LIMIT_STATE_NONE = S.DUE_LIMIT_STATE_NONE;
  var DUE_PROXIMITY_BANDS = S.DUE_PROXIMITY_BANDS;
  var EASE_COST_DEFS = S.EASE_COST_DEFS;
  var EASE_FLOOR = S.EASE_FLOOR;
  var EASE_QUICK_WINS = S.EASE_QUICK_WINS;
  var EISENHOWER_IMPACT_THRESHOLD = S.EISENHOWER_IMPACT_THRESHOLD;
  var EISENHOWER_URGENCY_THRESHOLD = S.EISENHOWER_URGENCY_THRESHOLD;
  var EMPRESSEMENT_DEFAULT_ID = S.EMPRESSEMENT_DEFAULT_ID;
  var EMPRESSEMENT_OPTIONS = S.EMPRESSEMENT_OPTIONS;
  var EMPRESSEMENT_PULL_MAX = S.EMPRESSEMENT_PULL_MAX;
  var EMPRESSEMENT_UI_MAX = S.EMPRESSEMENT_UI_MAX;
  var IMPACT_EXP = S.IMPACT_EXP;
  var IMPACT_FACTOR_DEFS = S.IMPACT_FACTOR_DEFS;
  var IMPACT_SYNERGY_PER_EXTRA = S.IMPACT_SYNERGY_PER_EXTRA;
  var INUTILE_EPS = S.INUTILE_EPS;
  var INUTILE_LABEL = S.INUTILE_LABEL;
  var INUTILE_STYLES = S.INUTILE_STYLES;
  var INUTILE_STYLES_DARK = S.INUTILE_STYLES_DARK;
  var LABELS = S.LABELS;
  var MS_PER_DAY = S.MS_PER_DAY;
  var MS_PER_HOUR = S.MS_PER_HOUR;
  var MS_PER_MINUTE = S.MS_PER_MINUTE;
  var PRESSURE_MAX = S.PRESSURE_MAX;
  var SCORE_MAX = S.SCORE_MAX;
  var TIERS_DARK = S.TIERS_DARK;
  var TIER_DEFS = S.TIER_DEFS;
  var TIER_I_MAX = S.TIER_I_MAX;
  var TRELLO_BADGE_COLOR_MUTED = S.TRELLO_BADGE_COLOR_MUTED;
  var URGENCY_BOOST_MAX = S.URGENCY_BOOST_MAX;
  var URGENCY_BOOST_MIN_U = S.URGENCY_BOOST_MIN_U;
  var URGENCY_MIGRATION_MODE = S.URGENCY_MIGRATION_MODE;
  var URGENCY_REVIEW_THRESHOLD_10 = S.URGENCY_REVIEW_THRESHOLD_10;
  var URGENCY_TO_TB = S.URGENCY_TO_TB;
  var WB = S.WB;
  var WI = S.WI;
  var WT = S.WT;
  function calcEisenhower() { return S.calcEisenhower.apply(this, arguments); }
  function calcValueEffort() { return S.calcValueEffort.apply(this, arguments); }
  function calcWSJF() { return S.calcWSJF.apply(this, arguments); }
  function daysUntilDue() { return S.daysUntilDue.apply(this, arguments); }
  function dueBandAccent() { return S.dueBandAccent.apply(this, arguments); }
  function dueDateToLocalDate() { return S.dueDateToLocalDate.apply(this, arguments); }
  function escapeHtml() { return S.escapeHtml.apply(this, arguments); }
  function formatBaseline() { return S.formatBaseline.apply(this, arguments); }
  function formatBlockedReasonsSummary() { return S.formatBlockedReasonsSummary.apply(this, arguments); }
  function formatDueCountdownFromInputs() { return S.formatDueCountdownFromInputs.apply(this, arguments); }
  function formatEisenhower() { return S.formatEisenhower.apply(this, arguments); }
  function formatValueEffort() { return S.formatValueEffort.apply(this, arguments); }
  function formatWSJF() { return S.formatWSJF.apply(this, arguments); }
  function hour24ToHour12Parts() { return S.hour24ToHour12Parts.apply(this, arguments); }
  function isBlockedWaitingOtherTask() { return S.isBlockedWaitingOtherTask.apply(this, arguments); }
  function isDuePast() { return S.isDuePast.apply(this, arguments); }
  function isDueVagueMode() { return S.isDueVagueMode.apply(this, arguments); }
  function isHour12() { return S.isHour12.apply(this, arguments); }
  function levelIconSvg() { return S.levelIconSvg.apply(this, arguments); }
  function msUntilDue() { return S.msUntilDue.apply(this, arguments); }
  function normalizeBlockedLinks() { return S.normalizeBlockedLinks.apply(this, arguments); }
  function normalizeBlockedReasons() { return S.normalizeBlockedReasons.apply(this, arguments); }
  function normalizeDueDate() { return S.normalizeDueDate.apply(this, arguments); }
  function normalizeDueTime() { return S.normalizeDueTime.apply(this, arguments); }
  function normalizeDueVague() { return S.normalizeDueVague.apply(this, arguments); }
  function overrideBaseline() { return S.overrideBaseline.apply(this, arguments); }
  function overrideEisenhower() { return S.overrideEisenhower.apply(this, arguments); }
  function overrideValueEffort() { return S.overrideValueEffort.apply(this, arguments); }
  function overrideWSJF() { return S.overrideWSJF.apply(this, arguments); }
  function pad2() { return S.pad2.apply(this, arguments); }
  function priorityStylesForScore() { return S.priorityStylesForScore.apply(this, arguments); }
  function resolveDueVagueToDate() { return S.resolveDueVagueToDate.apply(this, arguments); }
  function sundayOffset() { return S.sundayOffset.apply(this, arguments); }

  function dueProximityBand(iso, time, now) {
    if (!normalizeDueDate(iso)) return '';
    if (isDuePast(iso, time, now)) return 'overdue';
    var days = daysUntilDue(iso, now);
    if (!isFinite(days)) return '';
    if (days <= 2) return 'imminent';
    if (days <= 14) return 'soon';
    if (days <= 30) return 'weeks';
    if (days <= 90) return 'month';
    return 'far';
  }

  function applyDueProximityBand(el, band) {
    if (!el) return;
    if (!band) {
      clearDueProximityBand(el);
      return;
    }
    for (var i = 0; i < DUE_PROXIMITY_BANDS.length; i++) {
      var name = DUE_PROXIMITY_BANDS[i];
      el.classList.toggle('is-due-' + name, name === band);
    }
    el.classList.toggle('is-overdue', band === 'overdue');
    el.classList.toggle('is-past', band === 'overdue');
    if (el.dataset) el.dataset.dueBand = band;
    applySectionGlow(el.classList.contains('field--due-date') ? el : el.querySelector('.field--due-date') || el, dueBandAccent(band));
  }

  function clearDueProximityBand(el) {
    if (!el) return;
    for (var i = 0; i < DUE_PROXIMITY_BANDS.length; i++) {
      el.classList.remove('is-due-' + DUE_PROXIMITY_BANDS[i]);
    }
    el.classList.remove('is-overdue', 'is-past');
    if (el.dataset) delete el.dataset.dueBand;
    clearSectionGlow(
      el.classList.contains('field--due-date')
        ? el
        : el.querySelector('.field--due-date') || el
    );
  }

  function capitalizeCountdownPhrase(text) {
    if (!text) return '';
    var first = text.charAt(0);
    var upper = first.toLocaleUpperCase('fr-FR');
    return upper === first ? text : upper + text.slice(1);
  }

  /** French compact clock for collapsed section summaries (e.g. "9 h", "14 h 30", "2 h 30 PM"). */
  function formatDueTimeCompactFr(time) {
    var normalized = normalizeDueTime(time);
    if (!normalized) return '';
    var parts = normalized.split(':');
    var hours = +parts[0];
    var minutes = +parts[1];
    if (!isHour12()) {
      if (minutes === 0) return String(hours) + ' h';
      return String(hours) + ' h ' + pad2(minutes);
    }
    var conv = hour24ToHour12Parts(hours);
    var suffix = conv.isPm ? DUE_DATE_TIME_PM_LABEL : DUE_DATE_TIME_AM_LABEL;
    if (minutes === 0) return conv.hour12 + ' h ' + suffix;
    return conv.hour12 + ' h ' + pad2(minutes) + ' ' + suffix;
  }

  /** Match a due time to a period chip (matin / midi / après-midi / soir). */
  function matchDueTimePeriod(time) {
    var normalized = normalizeDueTime(time);
    if (!normalized) return null;
    for (var i = 0; i < DUE_DATE_TIME_PERIODS.length; i++) {
      if (DUE_DATE_TIME_PERIODS[i].time === normalized) return DUE_DATE_TIME_PERIODS[i];
    }
    return null;
  }

  function findDueTimePeriodById(id) {
    if (!id || typeof id !== 'string') return null;
    for (var i = 0; i < DUE_DATE_TIME_PERIODS.length; i++) {
      if (DUE_DATE_TIME_PERIODS[i].id === id) return DUE_DATE_TIME_PERIODS[i];
    }
    return null;
  }

  /**
   * Adaptive period chip / headline label for a day
   * (Ce matin, Demain midi, Hier soir, Lundi après-midi, …).
   * Falls back to the bare period label when no date is set.
   */
  function formatDueTimePeriodLabel(periodOrId, iso, now) {
    var period =
      periodOrId && typeof periodOrId === 'object'
        ? periodOrId
        : findDueTimePeriodById(periodOrId);
    if (!period) return '';

    var periodWord = period.label.toLocaleLowerCase('fr-FR');
    var normalized = normalizeDueDate(iso);
    if (!normalized) return period.label;

    var days = daysUntilDue(normalized, now);
    if (!isFinite(days)) return period.label;

    if (days === 0) {
      if (period.id === 'matin') return 'Ce matin';
      if (period.id === 'midi') return 'Ce midi';
      if (period.id === 'apres-midi') return 'Cet apr\u00e8s-midi';
      if (period.id === 'soir') return 'Ce soir';
      return period.label;
    }
    if (days === 1) {
      return period.id === 'midi' ? 'Demain midi' : 'Demain ' + periodWord;
    }
    if (days === -1) {
      return period.id === 'midi' ? 'Hier midi' : 'Hier ' + periodWord;
    }
    if (days === 2) {
      return period.id === 'midi'
        ? 'Apr\u00e8s-demain midi'
        : 'Apr\u00e8s-demain ' + periodWord;
    }

    var due = dueDateToLocalDate(normalized);
    if (!due) return period.label;

    if ((days >= 3 && days <= 7) || (days <= -2 && days >= -7)) {
      var weekday = capitalizeCountdownPhrase(
        DUE_DATE_WEEKDAY_NAMES[sundayOffset(due)]
      );
      return period.id === 'midi' ? weekday + ' midi' : weekday + ' ' + periodWord;
    }

    var shortDay = formatDueDateDayMonthShort(normalized, now);
    return period.id === 'midi' ? shortDay + ' midi' : shortDay + ' ' + periodWord;
  }

  /** Short calendar day label, e.g. "20 juil." (adds year when not current). */
  function formatDueDateDayMonthShort(iso, now) {
    var date = dueDateToLocalDate(iso);
    if (!date) return '';
    var at = now || new Date();
    try {
      var opts = { day: 'numeric', month: 'short' };
      if (date.getFullYear() !== at.getFullYear()) opts.year = 'numeric';
      return date.toLocaleDateString('fr-FR', opts);
    } catch (err) {
      var text =
        date.getDate() + ' ' + DUE_DATE_MONTH_NAMES[date.getMonth()];
      if (date.getFullYear() !== at.getFullYear()) text += ' ' + date.getFullYear();
      return text;
    }
  }

  /**
   * Relative calendar day for human-readable due titles
   * (Aujourd'hui, Demain, Lundi prochain, Lundi 20 juil., …).
   */
  function formatDueDateRelativeDay(iso, now) {
    var normalized = normalizeDueDate(iso);
    if (!normalized) return '';
    var days = daysUntilDue(normalized, now);
    if (days === 0) return 'Aujourd\'hui';
    if (days === 1) return 'Demain';
    if (days === -1) return 'Hier';
    if (days === 2) return 'Apr\u00e8s-demain';

    var due = dueDateToLocalDate(normalized);
    if (!due) return '';
    var weekday = capitalizeCountdownPhrase(DUE_DATE_WEEKDAY_NAMES[sundayOffset(due)]);
    if (days >= 3 && days <= 7) return weekday + ' prochain';
    if (days <= -2 && days >= -7) return weekday + ' dernier';
    return weekday + ' ' + formatDueDateDayMonthShort(normalized, now);
  }

  /** French "une"/"deux"/digit counts for relative trigger titles. */
  function frRelativeCount(n, singular, plural) {
    if (n === 1) return 'une ' + singular;
    if (n === 2) return 'deux ' + plural;
    return n + ' ' + plural;
  }

  /**
   * Humanized label for due-date-trigger-title when a day is selected
   * (Hier, Demain, Dans deux jours, …). Falls back to "Date".
   */
  function formatDueDateTriggerTitle(iso, now) {
    var normalized = normalizeDueDate(iso);
    if (!normalized) return DUE_DATE_BOX_LABEL;
    var days = daysUntilDue(normalized, now);
    if (!isFinite(days)) return DUE_DATE_BOX_LABEL;
    if (days === 0) return 'Aujourd\'hui';
    if (days === 1) return 'Demain';
    if (days === -1) return 'Hier';
    if (days === 2) return 'Dans deux jours';
    if (days === -2) return 'Il y a deux jours';
    if (days >= 3 && days <= 6) return 'Dans ' + days + ' jours';
    if (days <= -3 && days >= -6) return 'Il y a ' + (-days) + ' jours';
    return formatDueDateRelativeDay(normalized, now) || DUE_DATE_BOX_LABEL;
  }

  /**
   * Humanized label for due-date-time-title when a time is selected
   * (Dans une heure, Dans 15 minutes, Il y a une heure, …). Falls back to "Heure".
   */
  function formatDueTimeTriggerTitle(iso, time, now) {
    var dueTime = normalizeDueTime(time);
    if (!dueTime) return DUE_DATE_TIME_LABEL;
    var normalized = normalizeDueDate(iso);
    if (!normalized) return DUE_DATE_TIME_LABEL;

    var ms = msUntilDue(normalized, dueTime, now);
    if (!isFinite(ms)) return DUE_DATE_TIME_LABEL;

    var past = ms < 0;
    var abs = Math.abs(ms);
    var prefix = past ? 'Il y a ' : 'Dans ';

    if (abs < MS_PER_MINUTE / 2) return past ? '\u00c0 l\'instant' : 'Maintenant';

    var minutes = Math.max(1, Math.round(abs / MS_PER_MINUTE));
    if (minutes < 60) {
      return prefix + frRelativeCount(minutes, 'minute', 'minutes');
    }

    var hours = Math.max(1, Math.round(abs / MS_PER_HOUR));
    if (hours < 36) {
      return prefix + frRelativeCount(hours, 'heure', 'heures');
    }

    // Farther than ~1.5 days: reuse the day-scale trigger phrasing.
    return formatDueDateTriggerTitle(normalized, now);
  }

  /**
   * Human-readable due headline + remaining line for the Échéance body.
   * Ex. primary "6 jours restants", secondary "Lundi prochain à midi".
   * Past dues use countdown phrasing ("En retard de 5 jours") instead of
   * calendar lines like "Aujourd'hui à 8 h".
   */
  function formatDueDateHumanReadable(iso, time, now) {
    var normalized = normalizeDueDate(iso);
    if (!normalized) return { primary: '', secondary: '' };

    var dueTime = normalizeDueTime(time);
    var at = now || new Date();

    // Overdue: never show "Aujourd'hui à 8 h" — use "En retard de…".
    if (isDuePast(normalized, dueTime, at)) {
      return {
        primary: formatDueCountdown(normalized, at, time),
        secondary: ''
      };
    }

    var dayPhrase = formatDueDateRelativeDay(normalized, at);
    var period = matchDueTimePeriod(time);
    var whenPhrase = dayPhrase;

    if (period) {
      whenPhrase = formatDueTimePeriodLabel(period, normalized, at);
      // Keep period feel, but always name the clock ("Demain soir à 18 h").
      var periodClock = formatDueTimeCompactFr(dueTime || period.time);
      if (periodClock) whenPhrase += ' \u00e0 ' + periodClock;
    } else if (dueTime) {
      whenPhrase = dayPhrase + ' \u00e0 ' + formatDueTimeCompactFr(dueTime);
    }

    var countdown = formatDueCountdown(normalized, at, time);
    // Avoid "Demain matin" / "Demain" duplication when countdown is only the day name.
    var countdownKey = countdown ? countdown.toLocaleLowerCase('fr-FR') : '';
    var redundant =
      !countdown ||
      !whenPhrase ||
      countdownKey === dayPhrase.toLocaleLowerCase('fr-FR') ||
      countdownKey === whenPhrase.toLocaleLowerCase('fr-FR');

    if (redundant) {
      return { primary: whenPhrase || countdown, secondary: '' };
    }

    return { primary: countdown, secondary: whenPhrase };
  }

  /** Compact header summary when an enabled due-date section is collapsed. */
  function formatDueDateCompactSummary(iso, time, now) {
    var human = formatDueDateHumanReadable(iso, time, now);
    if (!normalizeDueDate(iso)) return 'Aucune';
    if (human.secondary && human.primary) {
      return human.secondary + ' (' + human.primary + ')';
    }
    return human.primary || formatDueCountdown(iso, now, time) || '';
  }

  function formatDueCountdownDays(days) {
    if (!isFinite(days)) return '';
    if (days < 0) {
      var late = -days;
      if (late === 1) return 'en retard d\'une journ\u00e9e';
      if (late < COUNTDOWN_DAYS_PER_WEEK) return 'en retard de ' + late + ' jours';
      if (late < COUNTDOWN_WEEK_THRESHOLD_DAYS) {
        var lateWeeks = Math.max(1, Math.round(late / COUNTDOWN_DAYS_PER_WEEK));
        return lateWeeks === 1
          ? 'en retard de 1 semaine'
          : 'en retard de ' + lateWeeks + ' semaines';
      }
      if (late < COUNTDOWN_YEAR_THRESHOLD_DAYS) {
        var lateMonths = Math.max(1, Math.round(late / DAYS_PER_MONTH_AVG));
        return lateMonths === 1
          ? 'en retard de 1 mois'
          : 'en retard de ' + lateMonths + ' mois';
      }
      var lateYears = Math.max(1, Math.round(late / DAYS_PER_YEAR_AVG));
      return lateYears === 1
        ? 'en retard de 1 an'
        : 'en retard de ' + lateYears + ' ans';
    }
    if (days === 0) return 'aujourd\'hui';
    if (days === 1) return 'demain';
    if (days < COUNTDOWN_DAYS_PER_WEEK) return days + ' jours restants';
    if (days < COUNTDOWN_WEEK_THRESHOLD_DAYS) {
      var weeks = Math.max(1, Math.round(days / COUNTDOWN_DAYS_PER_WEEK));
      return weeks === 1 ? '1 semaine restante' : weeks + ' semaines restantes';
    }
    if (days < COUNTDOWN_YEAR_THRESHOLD_DAYS) {
      var months = Math.max(1, Math.round(days / DAYS_PER_MONTH_AVG));
      return months === 1 ? '1 mois restant' : months + ' mois restants';
    }
    var years = Math.max(1, Math.round(days / DAYS_PER_YEAR_AVG));
    return years === 1 ? '1 an restant' : years + ' ans restants';
  }

  function formatDueCountdown(iso, now, time) {
    var dueTime = normalizeDueTime(time);
    if (!dueTime) {
      return capitalizeCountdownPhrase(formatDueCountdownDays(daysUntilDue(iso, now)));
    }

    var ms = msUntilDue(iso, dueTime, now);
    if (!isFinite(ms)) return '';
    var abs = Math.abs(ms);
    var past = ms < 0;
    var phrase;

    if (abs < MS_PER_MINUTE / 2) {
      phrase = past ? 'en retard de 1 min' : 'maintenant';
    } else {
      var minutes = Math.max(1, Math.round(abs / MS_PER_MINUTE));
      if (minutes < 60) {
        if (past) {
          phrase = minutes === 1 ? 'en retard de 1 min' : 'en retard de ' + minutes + ' min';
        } else {
          phrase = minutes === 1 ? '1 min restante' : minutes + ' min restantes';
        }
      } else {
        var hours = Math.max(1, Math.round(abs / MS_PER_HOUR));
        if (hours < COUNTDOWN_HOUR_DISPLAY_MAX) {
          if (past) {
            phrase = hours === 1 ? 'en retard de 1 h' : 'en retard de ' + hours + ' h';
          } else {
            phrase = hours === 1 ? '1 h restante' : hours + ' h restantes';
          }
        } else if (!past) {
          // ≥10 h left: day-scale (e.g. same-day 12 h → Aujourd'hui, not "12 h").
          phrase = formatDueCountdownDays(daysUntilDue(iso, now));
        } else {
          var days = Math.max(1, Math.round(abs / MS_PER_DAY));
          phrase = formatDueCountdownDays(-days);
        }
      }
    }

    return capitalizeCountdownPhrase(phrase);
  }

  function dueBadgeSuffix(display) {
    if (!display) return '';
    if (typeof display.dueCountdown === 'string' && display.dueCountdown) {
      return display.dueCountdown;
    }
    return '';
  }

  function formatDueBadgeText(display) {
    var label = taskBadgeLabel(display);
    var suffix = dueBadgeSuffix(display);
    if (!label) return suffix || '';
    if (!suffix) return label;
    return label + ' (' + suffix + ')';
  }

  function isDueEnabled(inputs) {
    if (!inputs) return false;
    if (inputs.dueEnabled === false) return false;
    if (isDueVagueMode(inputs) && normalizeDueVague(inputs.dueVague)) return true;
    return !!normalizeDueDate(inputs.dueDate);
  }

  function withDueDateDisplay(display, inputs) {
    if (!display) return display;
    // Disabled checkbox keeps dueDate stored but skips badge/overdue effects.
    if (inputs && inputs.dueEnabled === false) return display;
    var dueVagueId = normalizeDueVague(inputs && inputs.dueVague);
    var vagueMode = isDueVagueMode(inputs) && !!dueVagueId;
    var dueDate = normalizeDueDate(inputs && inputs.dueDate);
    if (!dueDate && !vagueMode) return display;
    if (vagueMode && !dueDate) {
      dueDate = resolveDueVagueToDate(dueVagueId);
    }
    if (!dueDate) return display;
    var dueTime = vagueMode ? '' : normalizeDueTime(inputs && inputs.dueTime);
    var next = {
      dueDate: dueDate,
      dueCountdown: formatDueCountdownFromInputs(inputs),
      duePast: vagueMode ? false : isDuePast(dueDate, dueTime)
    };
    if (dueTime) next.dueTime = dueTime;
    if (vagueMode) {
      next.dueMode = DUE_DATE_MODE_VAGUE;
      next.dueVague = dueVagueId;
    }
    return Object.assign({}, display, next);
  }
  var BLOCKED_STYLES = {
    label: BLOCKED_LABEL,
    fill: '#FCE8E8',
    text: '#5D1A1A',
    seg: '#AE2E24',
    tint: '#C9372C',
    description: BLOCKED_DESCRIPTION
  };
  var BLOCKED_STYLES_DARK = {
    label: BLOCKED_LABEL,
    fill: '#3D1F1F',
    text: '#FFECEB',
    seg: '#F87171',
    tint: '#5C2020',
    description: BLOCKED_DESCRIPTION
  };

  function blockedThemeVisuals() {
    return {
      fill: readCssVar('--blocked-fill', BLOCKED_STYLES.fill),
      text: readCssVar('--blocked-text', BLOCKED_STYLES.text),
      seg: readCssVar('--blocked-accent', BLOCKED_STYLES.seg),
      tint: readCssVar('--blocked-border', BLOCKED_STYLES.tint)
    };
  }

  var TASK_BADGE_LABELS = {
    Critique: 'T\u00e2che critique',
    Urgente: 'T\u00e2che urgente',
    Urgent: 'T\u00e2che urgente',
    Prioritaire: 'T\u00e2che prioritaire',
    Importante: 'T\u00e2che importante',
    Important: 'T\u00e2che importante',
    Flexible: 'T\u00e2che flexible',
    Secondaire: 'T\u00e2che secondaire',
    Optionnelle: 'T\u00e2che optionnelle',
    Optionnel: 'T\u00e2che optionnelle',
    Inutile: 'T\u00e2che inutile',
    'Bloqu\u00e9': 'T\u00e2che'
  };

  var COMPLETED_BADGE_PREFIX = 'Compl\u00e9t\u00e9';

  function brandAppName() {
    var brand = global.PriorityBrand;
    if (brand && typeof brand.getAppName === 'function') return brand.getAppName();
    if (brand && typeof brand.appName === 'string' && brand.appName.trim()) {
      return brand.appName.trim();
    }
    var cfg = global.PriorityRestConfig;
    if (cfg && typeof cfg.appName === 'string' && cfg.appName.trim()) {
      return cfg.appName.trim();
    }
    return 'Trello Cerveau';
  }

  /** Card-back CTA / modal title — product name from PriorityBrand.appName. */
  var DEFINE_PRIORITY_LABEL = brandAppName();

  function taskBadgeLabelForTierKey(tier) {
    if (!tier) return '';
    if (Object.prototype.hasOwnProperty.call(TASK_BADGE_LABELS, tier)) {
      return TASK_BADGE_LABELS[tier];
    }
    return 'T\u00e2che ' + tier.charAt(0).toLowerCase() + tier.slice(1);
  }

  function formatCompletedBadgeLabel(taskLabel) {
    return COMPLETED_BADGE_PREFIX + ' (' + taskLabel + ')';
  }

  var EISENHOWER_BADGE_LABELS = {
    Faire: '\u00c0 faire maintenant',
    Planifier: '\u00c0 planifier',
    'D\u00e9l\u00e9guer': '\u00c0 d\u00e9l\u00e9guer',
    '\u00c9liminer': '\u00c0 \u00e9liminer'
  };

  // Unicode dots for Trello badge text (largest = highest priority).
  var BADGE_DOT_DEFAULT = '\u25CF'; // ●
  var TIER_BADGE_DOTS = {
    0: '\u2B24', // ⬤ Critique
    1: '\u2B24', // ⬤ Urgente
    2: BADGE_DOT_DEFAULT, // ● Prioritaire
    3: '\u2022', // • Importante
    4: '\u00B7', // · Flexible
    5: '\u00B7', // · Secondaire
    6: '\u00B7' // · Optionnelle
  };
  var BADGE_DOT_INUTILE = '\u00B7';
  var BADGE_DOT_COMPLETE = '\u2713';

  // Heat-badge dot diameter (px): low score → small, high score → large.
  var HEAT_TIER_DOT_MIN = 5;
  var HEAT_TIER_DOT_MAX = 14;
  var HEAT_TIER_DOT_SCORE_MAX = SCORE_MAX;
  var HEAT_TIER_DOT_FALLBACK = 9;
  var HEAT_TIER_DOT_SIZES = {
    0: 14, // Critique
    1: 12, // Urgente
    2: 10, // Prioritaire
    3: 9,  // Importante
    4: 7,  // Flexible
    5: 6,  // Secondaire
    6: 5   // Optionnelle
  };

  function heatTierDotSizePx(display) {
    if (!display) return HEAT_TIER_DOT_FALLBACK;
    if (display.inutile) return HEAT_TIER_DOT_MIN;
    var score = display.score;
    if (typeof score === 'number' && isFinite(score)) {
      var t = clamp(score / HEAT_TIER_DOT_SCORE_MAX, 0, 1);
      return HEAT_TIER_DOT_MIN + t * (HEAT_TIER_DOT_MAX - HEAT_TIER_DOT_MIN);
    }
    var tierI = display.tierI;
    if (tierI != null && Object.prototype.hasOwnProperty.call(HEAT_TIER_DOT_SIZES, tierI)) {
      return HEAT_TIER_DOT_SIZES[tierI];
    }
    return HEAT_TIER_DOT_FALLBACK;
  }

  // Help-modal level dots: low index → small, high index → large.
  var HELP_LEVEL_DOT_MIN = 5;
  var HELP_LEVEL_DOT_MAX = 12;

  function helpLevelDotSizePx(level, rangeStart, rangeEnd) {
    if (rangeEnd <= rangeStart) {
      return (HELP_LEVEL_DOT_MIN + HELP_LEVEL_DOT_MAX) / 2;
    }
    var t = clamp((level - rangeStart) / (rangeEnd - rangeStart), 0, 1);
    return HELP_LEVEL_DOT_MIN + t * (HELP_LEVEL_DOT_MAX - HELP_LEVEL_DOT_MIN);
  }

  function createHelpLevelDot(level, rangeStart, rangeEnd) {
    var dot = document.createElement('span');
    dot.className = 'help-modal-level-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.setProperty('--help-level-dot-size', helpLevelDotSizePx(level, rangeStart, rangeEnd).toFixed(2) + 'px');
    return dot;
  }

  function tierBadgeDotChar(display, completed) {
    if (completed) return BADGE_DOT_COMPLETE;
    if (!display) return BADGE_DOT_DEFAULT;
    if (display.blocked) return BLOCKED_SYMBOL;
    if (display.inutile) return BADGE_DOT_INUTILE;
    var i = display.tierI;
    if (i != null && Object.prototype.hasOwnProperty.call(TIER_BADGE_DOTS, i)) {
      return TIER_BADGE_DOTS[i];
    }
    return BADGE_DOT_DEFAULT;
  }

  function schemeBadgePreviewSamples() {
    var samples = [];
    // Least → most critical so the settings preview reads as a rising scale.
    for (var i = TIER_DEFS.length - 1; i >= 0; i--) {
      var def = TIER_DEFS[i];
      var label = taskBadgeLabelForTierKey(def.label);
      var color = Object.prototype.hasOwnProperty.call(S.TIER_TRELLO_BADGE_COLORS, def.i)
        ? S.TIER_TRELLO_BADGE_COLORS[def.i]
        : TRELLO_BADGE_COLOR_MUTED;
      var dot = Object.prototype.hasOwnProperty.call(TIER_BADGE_DOTS, def.i)
        ? TIER_BADGE_DOTS[def.i]
        : BADGE_DOT_DEFAULT;
      samples.push({
        tierI: def.i,
        label: label,
        color: color,
        dot: dot,
        text: dot + ' ' + label
      });
    }
    return samples;
  }

  function tierTrelloBadgeColor(display) {
    if (!display || display.inutile) return TRELLO_BADGE_COLOR_MUTED;
    var i = display.tierI;
    if (i != null && Object.prototype.hasOwnProperty.call(S.TIER_TRELLO_BADGE_COLORS, i)) {
      return S.TIER_TRELLO_BADGE_COLORS[i];
    }
    return TRELLO_BADGE_COLOR_MUTED;
  }

  function blockedTaskBadgeLabel(display) {
    if (!display) return TASK_BADGE_LABELS[BLOCKED_LABEL];
    var base = taskBadgeLabelForTierKey(classicTierLabel(display));
    if (base) return base;
    return TASK_BADGE_LABELS[BLOCKED_LABEL];
  }

  /**
   * Face-badge reason: drop "Bloqué à cause de …" — the ⊘ already marks blocked.
   */
  function compactBlockedReasonForBadge(reason) {
    var text = typeof reason === 'string' ? reason.trim() : '';
    if (!text) return '';
    var stripped = text.replace(
      /^bloqu\u00e9\s+\u00e0\s+cause\s+(de\s+|d\')/i,
      ''
    );
    return (stripped || text).trim();
  }

  function taskBadgeLabel(display) {
    if (!display) return '';
    if (display.blocked) return blockedTaskBadgeLabel(display);
    if (display.eisenhowerLabel && EISENHOWER_BADGE_LABELS[display.eisenhowerLabel]) {
      return EISENHOWER_BADGE_LABELS[display.eisenhowerLabel];
    }
    return taskBadgeLabelForTierKey(classicTierLabel(display));
  }

  function formatBlockedBadgeText(display, reason) {
    var label = blockedTaskBadgeLabel(display);
    var reasonText;
    if (reason != null && reason !== '') {
      reasonText = typeof reason === 'string'
        ? reason
        : formatBlockedReasonsSummary(reason, {
            empty: '',
            links: display && display.blockedLinks
          });
    } else if (display && (display.blockedReasons || display.blockedLinks)) {
      reasonText = formatBlockedReasonsSummary(
        display.blockedReasons != null ? display.blockedReasons : display.blockedReason,
        {
          empty: '',
          links: display.blockedLinks
        }
      );
    } else if (display && display.blockedReason) {
      reasonText = display.blockedReason;
    } else {
      reasonText = '';
    }
    reasonText = compactBlockedReasonForBadge(reasonText);
    // ⊘ already means blocked — skip a bare "Bloqué" reason.
    if (!reasonText || reasonText === BLOCKED_LABEL) return label;
    return reasonText + ' (' + label + ')';
  }

  function isDarkTheme() {
    return document.documentElement.getAttribute('data-color-mode') === 'dark';
  }

  function readCssVar(name, fallback) {
    try {
      if (typeof document === 'undefined' || !document.documentElement) {
        return fallback || '';
      }
      if (typeof getComputedStyle !== 'function') {
        return fallback || '';
      }
      var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback || '';
    } catch (e) {
      return fallback || '';
    }
  }

  function tierVisuals(source) {
    if (source && (source.blocked || source.label === BLOCKED_LABEL)) {
      return blockedThemeVisuals();
    }
    var inutile = source && (source.inutile || source.label === INUTILE_LABEL);
    if (inutile) {
      var idle = isDarkTheme() ? INUTILE_STYLES_DARK : INUTILE_STYLES;
      return { fill: idle.fill, text: idle.text, seg: idle.seg, tint: idle.tint };
    }
    var i = source && source.i != null ? source.i : TIER_I_MAX;
    if (isDarkTheme()) {
      var dark = TIERS_DARK[i] || TIERS_DARK[TIER_I_MAX];
      return { fill: dark.fill, text: dark.text, seg: dark.seg, tint: dark.tint };
    }
    var light = S.TIERS[i] || S.TIERS[TIER_I_MAX];
    return { fill: light.fill, text: light.text, seg: light.seg, tint: light.fill };
  }

  // ── 4. Matrix label bridge (PriorityMatrix) ─────────────────────────────

  function isInutile(inputs) {
    var I = inputs.impact != null ? inputs.impact : 0;
    var F = inputs.ease != null ? inputs.ease : AXIS_SCORE_MAX;
    var E = empressementIndex(inputs);
    return I < INUTILE_EPS && F <= INUTILE_EPS && E <= 0;
  }

  var matrixSettings = null;

  function setMatrixSettings(settings) {
    matrixSettings = settings;
  }

  function getMatrixSettings() {
    return matrixSettings;
  }

  function resolveMatrixLabel(inputs, tier, score, labelSettings) {
    var Matrix = typeof PriorityMatrix !== 'undefined' ? PriorityMatrix : null;
    if (!Matrix) return null;
    var settings = labelSettings != null ? labelSettings : matrixSettings;
    var ctx = Matrix.buildResolveContext(settings, tier, score);
    // The matrix's Urgence axis (0–4) has no direct UI input anymore; derive it
    // from Empressement + Échéance so quadrant rules keep matching sensibly.
    var matrixInputs =
      inputs && inputs.urgency == null
        ? Object.assign({}, inputs, { urgency: deriveLegacyUrgency(inputs) })
        : inputs;
    return Matrix.resolveLabel(matrixInputs, ctx);
  }

  function isEnAttente(inputs) {
    return !!(inputs && inputs.enAttente);
  }

  function withBlockedDisplay(display, inputs) {
    if (!display || !isEnAttente(inputs)) return display;
    var reasons = normalizeBlockedReasons(inputs);
    var next = {
      blocked: true,
      blockedReasons: reasons
    };
    // Legacy single-string field: first selected reason (badge helpers prefer blockedReasons).
    if (reasons.length) next.blockedReason = reasons[0];
    var links = normalizeBlockedLinks(inputs);
    if (
      links.length &&
      (isBlockedWaitingOtherTask(reasons) || links.length > 0)
    ) {
      next.blockedLinks = links;
      // Soft back-compat for older readers expecting a single link.
      next.blockedLink = links[0];
    }
    return Object.assign({}, display, next);
  }

  function withDisplayExtras(display, inputs) {
    var next = withDueDateDisplay(withBlockedDisplay(display, inputs), inputs);
    if (!next) return next;
    if (inputs && inputs.priorityEnabled === false) {
      return Object.assign({}, next, { priorityEnabled: false });
    }
    return next;
  }

  function resolveDisplay(result, inputs, labelSettings) {
    var inputsSafe = inputs || {};
    if (!isInutile(inputsSafe)) {
      if (result && result.eisenhower) {
        var eq = result.eisenhower;
        return withDisplayExtras({
          inutile: false,
          score: result.score,
          label: result.tier.label,
          tierLabel: eq.label,
          matrixLabel: eq.label,
          description: eq.description || '',
          eisenhowerLabel: eq.label,
          eisenhowerQuadrant: eq.id,
          matrixRuleId: null,
          matrixLevels: null,
          matrixEnabled: false,
          matrixDisabled: false,
          fill: eq.fill || result.tier.fill,
          text: eq.text || result.tier.text,
          seg: eq.seg || result.tier.seg,
          tierI: result.tier.i,
          cardTier: result.tier
        }, inputsSafe);
      }
      var settings = labelSettings != null ? labelSettings : matrixSettings;
      var matrix = resolveMatrixLabel(inputsSafe, result.tier, result.score, settings);
      var matrixEnabled = !settings || settings.enabled !== false;
      return withDisplayExtras({
        inutile: false,
        score: result.score,
        label: result.tier.label,
        tierLabel: result.tier.label,
        matrixLabel: matrix && matrix.fromMatrix ? matrix.label : null,
        descriptionTitle:
          matrix && matrix.fromMatrix ? null : (result.tier.title || null),
        description: matrix
          ? matrix.description
          : (result.tier.description || ''),
        matrixRuleId: matrix ? matrix.ruleId : null,
        matrixLevels: matrix ? matrix.levels : null,
        matrixEnabled: matrixEnabled,
        matrixDisabled: matrix ? !!matrix.matrixDisabled : !matrixEnabled,
        fill: result.tier.fill,
        text: result.tier.text,
        seg: result.tier.seg,
        tierI: result.tier.i,
        cardTier: result.tier
      }, inputsSafe);
    }
    return withDisplayExtras({
      inutile: true,
      score: 0,
      label: INUTILE_LABEL,
      descriptionTitle: INUTILE_STYLES.title || '',
      description: INUTILE_STYLES.description || '',
      tierLabel: INUTILE_LABEL,
      matrixRuleId: null,
      matrixLevels: null,
      fill: INUTILE_STYLES.fill,
      text: INUTILE_STYLES.text,
      seg: INUTILE_STYLES.seg,
      tierI: null,
      cardTier: {
        inutile: true,
        i: 'inutile',
        label: INUTILE_LABEL,
        fill: INUTILE_STYLES.fill,
        seg: INUTILE_STYLES.seg
      }
    }, inputsSafe);
  }

  function classicTierLabel(display) {
    if (!display) return '';
    return display.tierLabel || display.label || '';
  }

  function tierDescriptionTitle(display) {
    if (!display) return '';
    if (display.inutile) return INUTILE_STYLES.title || '';
    if (display.matrixLabel) return display.matrixLabel;
    if (display.descriptionTitle) return display.descriptionTitle;
    if (display.tierI == null) return '';
    for (var k = 0; k < S.TIERS.length; k++) {
      if (S.TIERS[k].i === display.tierI) return S.TIERS[k].title || '';
    }
    return '';
  }

  function tierDescriptionBody(display) {
    if (display.inutile) return INUTILE_STYLES.description || '';
    if (display.description) return display.description;
    if (display.tierI == null) return '';
    for (var k = 0; k < S.TIERS.length; k++) {
      if (S.TIERS[k].i === display.tierI) return S.TIERS[k].description || '';
    }
    return '';
  }

  function formatTierDescriptionTooltip(label, title, description) {
    var parts = [];
    if (label) parts.push(label);
    if (title) parts.push(title);
    if (description) parts.push(description);
    return parts.join('. ');
  }

  function tierDescriptionContentKey(display) {
    if (!display) return '';
    if (display.inutile) {
      return 'inutile:' + (INUTILE_STYLES.title || '') + '\n' + (INUTILE_STYLES.description || '');
    }
    if (display.matrixLabel) {
      return 'matrix:' + display.matrixLabel + '\n' + (display.description || '');
    }
    return (
      'tier:' +
      (tierDescriptionTitle(display) || '') +
      '\n' +
      tierDescriptionBody(display)
    );
  }

  // exports
  S.BADGE_DOT_COMPLETE = BADGE_DOT_COMPLETE;
  S.BADGE_DOT_DEFAULT = BADGE_DOT_DEFAULT;
  S.BADGE_DOT_INUTILE = BADGE_DOT_INUTILE;
  S.BLOCKED_STYLES = BLOCKED_STYLES;
  S.BLOCKED_STYLES_DARK = BLOCKED_STYLES_DARK;
  S.COMPLETED_BADGE_PREFIX = COMPLETED_BADGE_PREFIX;
  S.DEFINE_PRIORITY_LABEL = DEFINE_PRIORITY_LABEL;
  S.EISENHOWER_BADGE_LABELS = EISENHOWER_BADGE_LABELS;
  S.HEAT_TIER_DOT_FALLBACK = HEAT_TIER_DOT_FALLBACK;
  S.HEAT_TIER_DOT_MAX = HEAT_TIER_DOT_MAX;
  S.HEAT_TIER_DOT_MIN = HEAT_TIER_DOT_MIN;
  S.HEAT_TIER_DOT_SCORE_MAX = HEAT_TIER_DOT_SCORE_MAX;
  S.HEAT_TIER_DOT_SIZES = HEAT_TIER_DOT_SIZES;
  S.HELP_LEVEL_DOT_MAX = HELP_LEVEL_DOT_MAX;
  S.HELP_LEVEL_DOT_MIN = HELP_LEVEL_DOT_MIN;
  S.TASK_BADGE_LABELS = TASK_BADGE_LABELS;
  S.TIER_BADGE_DOTS = TIER_BADGE_DOTS;
  S.applyDueProximityBand = applyDueProximityBand;
  S.blockedTaskBadgeLabel = blockedTaskBadgeLabel;
  S.blockedThemeVisuals = blockedThemeVisuals;
  S.brandAppName = brandAppName;
  S.capitalizeCountdownPhrase = capitalizeCountdownPhrase;
  S.classicTierLabel = classicTierLabel;
  S.clearDueProximityBand = clearDueProximityBand;
  S.compactBlockedReasonForBadge = compactBlockedReasonForBadge;
  S.createHelpLevelDot = createHelpLevelDot;
  S.dueBadgeSuffix = dueBadgeSuffix;
  S.dueProximityBand = dueProximityBand;
  S.findDueTimePeriodById = findDueTimePeriodById;
  S.formatBlockedBadgeText = formatBlockedBadgeText;
  S.formatCompletedBadgeLabel = formatCompletedBadgeLabel;
  S.formatDueBadgeText = formatDueBadgeText;
  S.formatDueCountdown = formatDueCountdown;
  S.formatDueCountdownDays = formatDueCountdownDays;
  S.formatDueDateCompactSummary = formatDueDateCompactSummary;
  S.formatDueDateDayMonthShort = formatDueDateDayMonthShort;
  S.formatDueDateHumanReadable = formatDueDateHumanReadable;
  S.formatDueDateRelativeDay = formatDueDateRelativeDay;
  S.formatDueDateTriggerTitle = formatDueDateTriggerTitle;
  S.formatDueTimeCompactFr = formatDueTimeCompactFr;
  S.formatDueTimePeriodLabel = formatDueTimePeriodLabel;
  S.formatDueTimeTriggerTitle = formatDueTimeTriggerTitle;
  S.formatTierDescriptionTooltip = formatTierDescriptionTooltip;
  S.frRelativeCount = frRelativeCount;
  S.getMatrixSettings = getMatrixSettings;
  S.heatTierDotSizePx = heatTierDotSizePx;
  S.helpLevelDotSizePx = helpLevelDotSizePx;
  S.isDarkTheme = isDarkTheme;
  S.isDueEnabled = isDueEnabled;
  S.isEnAttente = isEnAttente;
  S.isInutile = isInutile;
  S.matchDueTimePeriod = matchDueTimePeriod;
  S.matrixSettings = matrixSettings;
  S.readCssVar = readCssVar;
  S.resolveDisplay = resolveDisplay;
  S.resolveMatrixLabel = resolveMatrixLabel;
  S.schemeBadgePreviewSamples = schemeBadgePreviewSamples;
  S.setMatrixSettings = setMatrixSettings;
  S.taskBadgeLabel = taskBadgeLabel;
  S.taskBadgeLabelForTierKey = taskBadgeLabelForTierKey;
  S.tierBadgeDotChar = tierBadgeDotChar;
  S.tierDescriptionBody = tierDescriptionBody;
  S.tierDescriptionContentKey = tierDescriptionContentKey;
  S.tierDescriptionTitle = tierDescriptionTitle;
  S.tierTrelloBadgeColor = tierTrelloBadgeColor;
  S.tierVisuals = tierVisuals;
  S.withBlockedDisplay = withBlockedDisplay;
  S.withDisplayExtras = withDisplayExtras;
  S.withDueDateDisplay = withDueDateDisplay;
})(typeof window !== 'undefined' ? window : this);
