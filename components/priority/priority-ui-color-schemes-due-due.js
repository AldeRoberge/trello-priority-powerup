/**
 * priority-ui-color-schemes-due: part 2 of 2 (expandBlockedReasonsForDisplay).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui-color-schemes-due.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var BLOCKED_LABEL = S.BLOCKED_LABEL;
  var BLOCKED_LINK_TYPE_SUBTASK = S.BLOCKED_LINK_TYPE_SUBTASK;
  var BLOCKED_REASON_WAITING_OTHER_TASK = S.BLOCKED_REASON_WAITING_OTHER_TASK;

  // from other parts (functions, resolved at call time)
  function formatBlockedWaitingOnLabel() { return S.formatBlockedWaitingOnLabel.apply(this, arguments); }
  function normalizeBlockedReasons() { return S.normalizeBlockedReasons.apply(this, arguments); }
  function resolveBlockedLinkLabel() { return S.resolveBlockedLinkLabel.apply(this, arguments); }
  function formatDueCountdown() { return S.formatDueCountdown.apply(this, arguments); }
  function isDueEnabled() { return S.isDueEnabled.apply(this, arguments); }

  /**
   * Expand reasons for display: replace the generic waiting-other reason with
   * one label per linked task (humanized "En attente de …"), using stored labels
   * when live subtask text is unavailable.
   * When the user already has an explicit motif, do not also append link
   * chips — avoids "Manger…" + "En attente de manger…".
   */
  function expandBlockedReasonsForDisplay(reasons, links, items) {
    var list = normalizeBlockedReasons(reasons);
    var linkList = normalizeBlockedLinks(links);
    var out = [];
    var waitingExpanded = false;
    var hasExplicitReason = false;
    for (var e = 0; e < list.length; e++) {
      if (list[e] !== BLOCKED_REASON_WAITING_OTHER_TASK) {
        hasExplicitReason = true;
        break;
      }
    }
    for (var i = 0; i < list.length; i++) {
      if (list[i] === BLOCKED_REASON_WAITING_OTHER_TASK) {
        waitingExpanded = true;
        // Explicit motifs already describe the wait — skip named link expansion.
        if (hasExplicitReason) continue;
        if (linkList.length) {
          for (var j = 0; j < linkList.length; j++) {
            out.push(
              formatBlockedWaitingOnLabel(resolveBlockedLinkLabel(linkList[j], items))
            );
          }
        } else {
          out.push(BLOCKED_REASON_WAITING_OTHER_TASK);
        }
      } else {
        out.push(list[i]);
      }
    }
    // Only auto-surface link labels when there is no typed motif yet.
    if (!waitingExpanded && linkList.length && !hasExplicitReason) {
      for (var k = 0; k < linkList.length; k++) {
        out.push(
          formatBlockedWaitingOnLabel(resolveBlockedLinkLabel(linkList[k], items))
        );
      }
    }
    return out;
  }

  /**
   * Elegant French summary for badges / collapsed section.
   * One reason as-is; several as comma-separated when short, else « first +N ».
   * Pass `links` (and optional `items`) to expand waiting-on-task chips with names.
   */
  function formatBlockedReasonsSummary(reasons, options) {
    var list =
      options && (options.links != null || options.items != null)
        ? expandBlockedReasonsForDisplay(reasons, options.links, options.items)
        : normalizeBlockedReasons(reasons);
    var emptyLabel =
      options && options.empty != null ? options.empty : BLOCKED_LABEL;
    if (!list.length) return emptyLabel;
    if (list.length === 1) return list[0];
    var maxLen = options && options.maxLength != null ? options.maxLength : 42;
    var comma = list.join(', ');
    if (comma.length <= maxLen) return comma;
    return list[0] + ' +' + (list.length - 1);
  }

  /** Normalize one blocked link (`{ type: 'subtask', id, label? }`). */
  function normalizeBlockedLink(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.type !== BLOCKED_LINK_TYPE_SUBTASK) return null;
    var id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) return null;
    var out = { type: BLOCKED_LINK_TYPE_SUBTASK, id: id };
    if (typeof raw.label === 'string' && raw.label.trim()) {
      out.label = raw.label.trim();
    }
    return out;
  }

  /**
   * Normalize multi waiting-on links to a de-duplicated `{ type, id, label? }[]`.
   * Accepts an array, a single link, or an inputs object with
   * `blockedLinks` (preferred), legacy `blockedLink`, or `blockedSubtaskId`.
   */
  function normalizeBlockedLinks(raw) {
    var list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.blockedLinks)) {
        list = raw.blockedLinks;
      } else if (raw.blockedLink != null || raw.type === BLOCKED_LINK_TYPE_SUBTASK) {
        var single =
          raw.type === BLOCKED_LINK_TYPE_SUBTASK
            ? normalizeBlockedLink(raw)
            : normalizeBlockedLink(raw.blockedLink);
        if (single) list = [single];
      }
      if (!list.length && typeof raw.blockedSubtaskId === 'string') {
        var legacyId = raw.blockedSubtaskId.trim();
        if (legacyId) list = [{ type: BLOCKED_LINK_TYPE_SUBTASK, id: legacyId }];
      }
    }
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var link = normalizeBlockedLink(list[i]);
      if (!link || seen[link.id]) continue;
      seen[link.id] = true;
      out.push(link);
    }
    return out;
  }

  function blockedLinksFromRaw(raw) {
    return normalizeBlockedLinks(raw);
  }

  /** @deprecated Prefer blockedLinksFromRaw / normalizeBlockedLinks. */
  function blockedLinkFromRaw(raw) {
    var links = normalizeBlockedLinks(raw);
    return links.length ? links[0] : null;
  }

  function findSubtaskById(items, id) {
    if (!id || !items || !items.length) return null;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item && item.id === id) return item;
    }
    return null;
  }

  // ── 3d. Due-date helpers (labels, ISO, vague phrases, countdown) ────────
  // Canonical storage is ISO + HH:MM; UI can show FR vague copy (“demain”).

  var DUE_DATE_LABEL = '\u00c9ch\u00e9ance';
  var DUE_DATE_PLACEHOLDER = 'Choisir une date';
  var DUE_DATE_TODAY_LABEL = 'Aujourd\'hui';
  var DUE_DATE_PREV_MONTH = 'Mois pr\u00e9c\u00e9dent';
  var DUE_DATE_NEXT_MONTH = 'Mois suivant';
  var DUE_DATE_PREV_YEAR = 'Ann\u00e9e pr\u00e9c\u00e9dente';
  var DUE_DATE_NEXT_YEAR = 'Ann\u00e9e suivante';
  var DUE_DATE_PREV_YEARS = 'Ann\u00e9es pr\u00e9c\u00e9dentes';
  var DUE_DATE_NEXT_YEARS = 'Ann\u00e9es suivantes';
  var DUE_DATE_PICK_DAY_LABEL = 'Choisir le jour';
  var DUE_DATE_PICK_MONTH_LABEL = 'Choisir le mois';
  var DUE_DATE_PICK_YEAR_LABEL = 'Choisir l\'ann\u00e9e';
  var DUE_DATE_CALENDAR_LABEL = 'Calendrier d\'\u00e9ch\u00e9ance';
  var DUE_DATE_BOX_LABEL = 'Date';
  var DUE_DATE_CLEAR_LABEL = 'Effacer la date';
  var DUE_DATE_MASTER_CLEAR_LABEL = 'Effacer la date et l\'heure';
  var DUE_DATE_START_LABEL = 'D\u00e9but';
  var DUE_DATE_START_CLEAR_LABEL = 'Effacer la date de d\u00e9but';
  var DUE_DATE_START_PLACEHOLDER = 'Ajouter une date de d\u00e9but';
  var DUE_DATE_RECURRING_LABEL = 'R\u00e9currente';
  var DUE_DATE_RECURRING_CLEAR_LABEL = 'Effacer la r\u00e9currence';
  var DUE_DATE_RECURRING_NONE = 'Ne pas r\u00e9p\u00e9ter';
  var DUE_DATE_RECURRING_DAILY = 'Chaque jour';
  var DUE_DATE_RECURRING_WEEKLY = 'Chaque semaine';
  var DUE_DATE_RECURRING_MONTHLY = 'Chaque mois';
  var DUE_DATE_RECURRING_YEARLY = 'Chaque ann\u00e9e';
  var DUE_DATE_TIME_LABEL = 'Heure';
  var DUE_DATE_TIME_PLACEHOLDER = 'Choisir une heure';
  var DUE_DATE_TIME_CLEAR_LABEL = 'Effacer l\'heure';
  var DUE_DATE_TIME_PICKER_LABEL = 'Choix de l\'heure';
  var DUE_DATE_TIME_SUGGESTIONS_LABEL = 'Suggestions';
  var DUE_DATE_QUICK_SUGGESTIONS_LABEL = 'Suggestions de date';
  var DUE_DATE_TIME_DIAL_LABEL = 'Horloge';
  var DUE_DATE_TIME_HOURS_ARIA = 'Heures';
  var DUE_DATE_TIME_MINUTES_ARIA = 'Minutes';
  var DUE_DATE_TIME_MODE_HOUR_LABEL = 'Heure';
  var DUE_DATE_TIME_MODE_MINUTE_LABEL = 'Minutes';
  var DUE_DATE_TIME_AM_LABEL = 'AM';
  var DUE_DATE_TIME_PM_LABEL = 'PM';
  var DUE_DATE_TIME_MERIDIEM_ARIA = 'Matin ou apr\u00e8s-midi';
  var DUE_DATE_TIME_DEFAULT = '08:00';
  var DUE_DATE_TIME_PERIODS = [
    { id: 'matin', label: 'Matin', time: '09:00' },
    { id: 'midi', label: 'Midi', time: '12:00' },
    { id: 'apres-midi', label: 'Apr\u00e8s-midi', time: '14:00' },
    { id: 'soir', label: 'Soir', time: '18:00' }
  ];
  /** Quick date chips shown when Échéance has no day set. */
  var DUE_DATE_QUICK_SUGGESTIONS = [
    { id: 'cet-apres-midi', label: 'Cet apr\u00e8s-midi', hint: '14:00' },
    { id: 'demain-matin', label: 'Demain matin', hint: '09:00' },
    { id: 'lundi-prochain', label: 'Lundi prochain', hint: '09:00' },
    { id: 'dans-une-semaine', label: 'Dans une semaine', hint: '+7 j' },
    { id: 'dans-deux-semaines', label: 'Dans deux semaines', hint: '+14 j' }
  ];
  /** Precise calendar day vs vague horizon (proxy dueDate still stored). */
  var DUE_DATE_MODE_PRECISE = 'precise';
  var DUE_DATE_MODE_VAGUE = 'vague';
  var DUE_DATE_MODE_PRECISE_LABEL = 'Pr\u00e9cis';
  var DUE_DATE_MODE_VAGUE_LABEL = 'Vague';
  var DUE_DATE_VAGUE_OPTIONS_LABEL = 'Horizon approximatif';
  /**
   * Vague horizon continuum (slider steps) — near → far.
   * Keep proche / lointain / eventuellement ids for agent + stored cards.
   */
  var DUE_DATE_VAGUE_OPTIONS = [
    { id: 'bientot', label: 'Bient\u00f4t', days: 7 },
    { id: 'sous-peu', label: 'Sous peu', days: 14 },
    { id: 'quelques-semaines', label: 'Dans quelques semaines', days: 21 },
    { id: 'proche', label: 'Dans un futur proche', days: 30 },
    { id: 'prochain-mois', label: 'Dans le mois qui vient', days: 45 },
    { id: 'quelques-mois', label: 'Dans quelques mois', days: 90 },
    { id: 'semestre', label: 'Dans un semestre', days: 180 },
    { id: 'long-terme', label: '\u00c0 long terme', days: 270 },
    { id: 'lointain', label: 'Dans un futur lointain', days: 365 },
    { id: 'an-ou-deux', label: 'Dans un an ou deux', days: 548 },
    { id: 'eventuellement', label: '\u00c9ventuellement', days: 1095 },
    { id: 'assez-lointain', label: 'Dans un futur assez lointain', days: 1460 },
    { id: 'tres-lointain', label: 'Dans un futur tr\u00e8s lointain', days: 1825 }
  ];
  /** Default Vague slider step when entering Vague with no prior horizon. */
  var DUE_DATE_VAGUE_DEFAULT_ID = 'proche';
  /** Legacy Vague ids still accepted when loading stored card data. */
  var DUE_DATE_VAGUE_LEGACY_DAYS = {};
  /** Shared workplace times for quick-date presets (match period chips). */
  var DUE_DATE_QUICK_MORNING_TIME = '09:00';
  var DUE_DATE_QUICK_AFTERNOON_TIME = '14:00';
  var DUE_DATE_TIME_MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  var DUE_DATE_TIME_CLOCK_SIZE = 200;
  var DUE_DATE_TIME_CLOCK_INNER_R = 52;
  var DUE_DATE_TIME_CLOCK_OUTER_R = 82;
  var DUE_DATE_TIME_CLOCK_MINUTE_R = 74;
  var DUE_DATE_MONTH_NAMES = [
    'janvier',
    'f\u00e9vrier',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'ao\u00fbt',
    'septembre',
    'octobre',
    'novembre',
    'd\u00e9cembre'
  ];
  var DUE_DATE_MONTH_SHORT = [
    'janv.',
    'f\u00e9vr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'ao\u00fbt',
    'sept.',
    'oct.',
    'nov.',
    'd\u00e9c.'
  ];
  var DUE_DATE_YEAR_PICKER_COUNT = 12;
  var DUE_DATE_WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  var DUE_DATE_WEEKDAY_NAMES = [
    'dimanche',
    'lundi',
    'mardi',
    'mercredi',
    'jeudi',
    'vendredi',
    'samedi'
  ];
  var MS_PER_DAY = 86400000;
  var MS_PER_HOUR = 3600000;
  var MS_PER_MINUTE = 60000;
  /** Show hour-granular countdown only when |remaining| hours is below this. */
  var COUNTDOWN_HOUR_DISPLAY_MAX = 10;
  var COUNTDOWN_DAYS_PER_WEEK = 7;
  var COUNTDOWN_WEEK_THRESHOLD_DAYS = 30;
  var COUNTDOWN_YEAR_THRESHOLD_DAYS = 365;
  var DAYS_PER_MONTH_AVG = 30.44;
  var DAYS_PER_YEAR_AVG = 365.25;

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function toIsoDate(date) {
    if (!date || isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function normalizeDueDate(value) {
    if (value == null || value === '') return '';
    if (typeof value !== 'string') return '';
    var trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return '';
    var parts = trimmed.split('-');
    var year = +parts[0];
    var month = +parts[1];
    var day = +parts[2];
    var date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return '';
    }
    return trimmed;
  }

  function normalizeDueTime(value) {
    if (value == null || value === '') return '';
    if (typeof value !== 'string') return '';
    var trimmed = value.trim();
    var match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    if (!match) return '';
    var hours = +match[1];
    var minutes = +match[2];
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
    return pad2(hours) + ':' + pad2(minutes);
  }

  /** Whether a quick-date chip is still meaningful at `now` (local). */
  function isDueDateQuickSuggestionAvailable(id, now) {
    if (!id || typeof id !== 'string') return false;
    if (id === 'cet-apres-midi') {
      var at = now || new Date();
      var afternoonParts = DUE_DATE_QUICK_AFTERNOON_TIME.split(':');
      var afternoonMins = (+afternoonParts[0]) * 60 + (+afternoonParts[1]);
      var nowMins = at.getHours() * 60 + at.getMinutes();
      // « Cet après-midi » is today-only; hide once the afternoon target has passed.
      return nowMins < afternoonMins;
    }
    for (var i = 0; i < DUE_DATE_QUICK_SUGGESTIONS.length; i++) {
      if (DUE_DATE_QUICK_SUGGESTIONS[i].id === id) return true;
    }
    return false;
  }

  /** Resolve a quick-date chip id to `{ iso, time }` (local calendar + workplace time). */
  function resolveDueDateQuickSuggestion(id) {
    if (!id || typeof id !== 'string') return null;
    if (!isDueDateQuickSuggestionAvailable(id)) return null;
    var now = new Date();
    var today = startOfLocalDay(now);
    var date;
    var time = DUE_DATE_QUICK_MORNING_TIME;
    if (id === 'cet-apres-midi') {
      // Always today at afternoon time — never reinterpret as tomorrow.
      time = DUE_DATE_QUICK_AFTERNOON_TIME;
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    } else if (id === 'demain-matin') {
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    } else if (id === 'lundi-prochain') {
      // JS getDay(): Sun=0 … Sat=6. Want next Monday (1).
      var dow = today.getDay();
      var daysUntilMonday = dow === 0 ? 1 : (8 - dow);
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysUntilMonday);
    } else if (id === 'dans-une-semaine') {
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    } else if (id === 'dans-deux-semaines') {
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14);
    } else {
      return null;
    }
    return { iso: toIsoDate(date), time: time };
  }

  function normalizeDueMode(value) {
    return value === DUE_DATE_MODE_VAGUE
      ? DUE_DATE_MODE_VAGUE
      : DUE_DATE_MODE_PRECISE;
  }

  function normalizeDueVague(value) {
    if (typeof value !== 'string') return '';
    var id = value.trim();
    if (!id) return '';
    for (var i = 0; i < DUE_DATE_VAGUE_OPTIONS.length; i++) {
      if (DUE_DATE_VAGUE_OPTIONS[i].id === id) return id;
    }
    if (Object.prototype.hasOwnProperty.call(DUE_DATE_VAGUE_LEGACY_DAYS, id)) {
      return id;
    }
    return '';
  }

  function dueVagueOption(id) {
    var normalized = normalizeDueVague(id);
    if (!normalized) return null;
    for (var i = 0; i < DUE_DATE_VAGUE_OPTIONS.length; i++) {
      if (DUE_DATE_VAGUE_OPTIONS[i].id === normalized) {
        return DUE_DATE_VAGUE_OPTIONS[i];
      }
    }
    if (Object.prototype.hasOwnProperty.call(DUE_DATE_VAGUE_LEGACY_DAYS, normalized)) {
      return {
        id: normalized,
        label: normalized,
        days: DUE_DATE_VAGUE_LEGACY_DAYS[normalized]
      };
    }
    return null;
  }

  function dueVagueIndex(id) {
    var normalized = normalizeDueVague(id);
    if (!normalized) return -1;
    for (var i = 0; i < DUE_DATE_VAGUE_OPTIONS.length; i++) {
      if (DUE_DATE_VAGUE_OPTIONS[i].id === normalized) return i;
    }
    return -1;
  }

  function dueVagueIdAtIndex(index) {
    var i = Math.round(Number(index));
    if (!isFinite(i) || !DUE_DATE_VAGUE_OPTIONS.length) return '';
    if (i < 0) i = 0;
    if (i >= DUE_DATE_VAGUE_OPTIONS.length) i = DUE_DATE_VAGUE_OPTIONS.length - 1;
    return DUE_DATE_VAGUE_OPTIONS[i].id;
  }

  /** Approximate YYYY-MM-DD for a vague horizon chip (local calendar). */
  function resolveDueVagueToDate(id, now) {
    var opt = dueVagueOption(id);
    if (!opt) return '';
    var at = now || new Date();
    var today = startOfLocalDay(at);
    var date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + opt.days
    );
    return toIsoDate(date) || '';
  }

  function formatDueVagueLabel(id) {
    var opt = dueVagueOption(id);
    if (!opt) return '';
    return opt.label || '';
  }

  /**
   * Badge / countdown text for vague mode — action phrasing, no day count.
   * Ex. "À faire éventuellement" (not "3 ans restants" / "~ Éventuellement").
   */
  function formatDueVagueCountdown(id) {
    var opt = dueVagueOption(id);
    if (!opt) return '';
    if (opt.id === 'bientot') return '\u00c0 faire bient\u00f4t';
    if (opt.id === 'sous-peu') return '\u00c0 faire sous peu';
    if (opt.id === 'proche') return '\u00c0 faire dans un futur proche';
    if (opt.id === 'lointain') return '\u00c0 faire dans un futur lointain';
    if (opt.id === 'eventuellement') return '\u00c0 faire \u00e9ventuellement';
    if (opt.id === 'tres-lointain') {
      return '\u00c0 faire dans un futur tr\u00e8s lointain';
    }
    var label = formatDueVagueLabel(id);
    if (!label) return '';
    return '\u00c0 faire ' + label.charAt(0).toLowerCase() + label.slice(1);
  }

  /**
   * Due face text from stored inputs — Vague horizon label or precise countdown.
   * Used by board badges, overview / task summary, and display helpers.
   */
  function formatDueCountdownFromInputs(inputs, now) {
    if (!isDueEnabled(inputs)) return '';
    if (isDueVagueMode(inputs)) {
      var vagueId = normalizeDueVague(inputs.dueVague);
      return vagueId ? formatDueVagueCountdown(vagueId) : '';
    }
    var dueDate = normalizeDueDate(inputs && inputs.dueDate);
    if (!dueDate) return '';
    return formatDueCountdown(dueDate, now, inputs && inputs.dueTime) || '';
  }

  function isDueVagueMode(inputs) {
    if (!inputs) return false;
    if (normalizeDueMode(inputs.dueMode) === DUE_DATE_MODE_VAGUE) return true;
    return !!normalizeDueVague(inputs.dueVague);
  }

  /**
   * Far-horizon due dates (> 1 week) get the labeled Précis/Vague toggle;
   * nearer dates still offer Vague, but icon-only.
   */
  function isDueVagueEligible(iso, now) {
    var days = daysUntilDue(iso, now);
    return isFinite(days) && days > COUNTDOWN_DAYS_PER_WEEK;
  }

  function startOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function dueDateToLocalDate(iso) {
    var normalized = normalizeDueDate(iso);
    if (!normalized) return null;
    var parts = normalized.split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }

  function dueInstant(iso, time) {
    var date = dueDateToLocalDate(iso);
    if (!date) return null;
    var normalizedTime = normalizeDueTime(time);
    if (normalizedTime) {
      var parts = normalizedTime.split(':');
      date.setHours(+parts[0], +parts[1], 0, 0);
    }
    return date;
  }

  /**
   * Build a Trello card `due` ISO string from Échéance parts (local calendar).
   * Date-only → local midnight (round-trips without a dueTime).
   */
  function trelloDueIsoFromParts(dueDate, dueTime) {
    var instant = dueInstant(dueDate, dueTime);
    if (!instant) return null;
    return instant.toISOString();
  }

  /**
   * Parse Trello `due` (ISO) into `{ dueDate, dueTime? }` in local time.
   * Midnight local is treated as date-only (no dueTime).
   */
  function parseTrelloDueToParts(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return null;
    var trimmed = value.trim();
    if (!trimmed) return null;
    var date = new Date(trimmed);
    if (isNaN(date.getTime())) return null;
    var dueDate = toIsoDate(date);
    if (!dueDate) return null;
    var hours = date.getHours();
    var minutes = date.getMinutes();
    if (hours === 0 && minutes === 0) return { dueDate: dueDate };
    return { dueDate: dueDate, dueTime: pad2(hours) + ':' + pad2(minutes) };
  }

  /** Canonical ISO for compare/sync ('' when empty/invalid). */
  function canonicalizeTrelloDueIso(value) {
    var parts = parseTrelloDueToParts(value);
    if (!parts) return '';
    return trelloDueIsoFromParts(parts.dueDate, parts.dueTime) || '';
  }

  function inputsToTrelloDueIso(inputs) {
    if (!inputs) return '';
    var dueDate = normalizeDueDate(inputs.dueDate);
    if (!dueDate) return '';
    return trelloDueIsoFromParts(dueDate, inputs.dueTime) || '';
  }

  /** Start date → Trello `start` ISO (optional startTime; else local midnight). */
  function inputsToTrelloStartIso(inputs) {
    if (!inputs) return '';
    var startDate = normalizeDueDate(inputs.startDate);
    if (!startDate) return '';
    return trelloDueIsoFromParts(startDate, inputs.startTime || null) || '';
  }

  var RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

  function normalizeRecurrence(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var frequency =
      typeof raw.frequency === 'string' ? raw.frequency.trim().toLowerCase() : '';
    if (RECURRENCE_FREQUENCIES.indexOf(frequency) === -1) return null;
    var interval = Math.round(Number(raw.interval));
    if (!isFinite(interval) || interval < 1) interval = 1;
    if (interval > 99) interval = 99;
    var out = { frequency: frequency, interval: interval };
    if (frequency === 'weekly') {
      var days = [];
      var seen = Object.create(null);
      var list = Array.isArray(raw.weekdays) ? raw.weekdays : [];
      for (var i = 0; i < list.length; i++) {
        var d = Math.round(Number(list[i]));
        if (!isFinite(d) || d < 0 || d > 6 || seen[d]) continue;
        seen[d] = true;
        days.push(d);
      }
      days.sort(function (a, b) {
        return a - b;
      });
      if (!days.length) {
        var fallback = new Date();
        days = [fallback.getDay()];
      }
      out.weekdays = days;
    }
    return out;
  }

  function addCalendarMonths(date, months) {
    var d = new Date(date.getTime());
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    var maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, maxDay));
    return d;
  }

  function occurrenceInstant(iso, time) {
    return dueInstant(iso, time) || dueDateToLocalDate(iso);
  }

  function advanceDateByRecurrence(iso, recurrence) {
    var date = dueDateToLocalDate(iso);
    var rule = normalizeRecurrence(recurrence);
    if (!date || !rule) return iso || '';
    var interval = rule.interval || 1;
    var next = new Date(date.getTime());

    if (rule.frequency === 'daily') {
      next.setDate(next.getDate() + interval);
      return toIsoDate(next);
    }

    if (rule.frequency === 'monthly') {
      return toIsoDate(addCalendarMonths(next, interval));
    }

    if (rule.frequency === 'yearly') {
      return toIsoDate(addCalendarMonths(next, interval * 12));
    }

    // weekly
    var weekdays = (rule.weekdays || []).slice().sort(function (a, b) {
      return a - b;
    });
    if (!weekdays.length) weekdays = [date.getDay()];
    var dow = date.getDay();
    var i;
    for (i = 0; i < weekdays.length; i++) {
      if (weekdays[i] > dow) {
        next.setDate(next.getDate() + (weekdays[i] - dow));
        return toIsoDate(next);
      }
    }
    var first = weekdays[0];
    next.setDate(next.getDate() + (7 - dow + first) + (interval - 1) * 7);
    return toIsoDate(next);
  }

  function advanceDateByRecurrenceAfter(iso, recurrence, time, now) {
    var rule = normalizeRecurrence(recurrence);
    var nextIso = advanceDateByRecurrence(iso, rule);
    var at = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
    var guard = 0;
    while (nextIso && guard < 500) {
      var nextInstant = occurrenceInstant(nextIso, time);
      if (!nextInstant || nextInstant.getTime() > at.getTime()) break;
      nextIso = advanceDateByRecurrence(nextIso, rule);
      guard++;
    }
    return nextIso || '';
  }

  /**
   * Next occurrence parts after completing a recurring card.
   * Advances due (keeps time) and start by the same calendar-day delta.
   * When a task is overdue, jumps to the first future occurrence instead of
   * rolling through stale dates one completion at a time.
   */
  function nextOccurrenceParts(parts, recurrence, options) {
    var rule = normalizeRecurrence(recurrence);
    if (!rule || !parts || !parts.dueDate) return null;
    options = options || {};
    var nextDue = advanceDateByRecurrenceAfter(
      parts.dueDate,
      rule,
      parts.dueTime || '',
      options.now
    );
    if (!nextDue) return null;
    var out = {
      dueDate: nextDue,
      dueTime: parts.dueTime || '',
      startDate: ''
    };
    if (parts.startDate) {
      var start = dueDateToLocalDate(parts.startDate);
      var due = dueDateToLocalDate(parts.dueDate);
      var nextDueDate = dueDateToLocalDate(nextDue);
      if (start && due && nextDueDate) {
        var delta = nextDueDate.getTime() - due.getTime();
        out.startDate = toIsoDate(new Date(start.getTime() + delta));
      }
    }
    return out;
  }

  function formatRecurrenceLabelFr(recurrence, time) {
    var rule = normalizeRecurrence(recurrence);
    if (!rule) return 'Ne pas r\u00e9p\u00e9ter';
    var n = rule.interval || 1;
    var label = '';
    if (rule.frequency === 'daily') {
      label = n === 1 ? 'Chaque jour' : 'Tous les ' + n + ' jours';
    } else if (rule.frequency === 'weekly') {
      label = n === 1 ? 'Chaque semaine' : 'Toutes les ' + n + ' semaines';
    } else if (rule.frequency === 'monthly') {
      label = n === 1 ? 'Chaque mois' : 'Tous les ' + n + ' mois';
    } else if (rule.frequency === 'yearly') {
      label = n === 1 ? 'Chaque ann\u00e9e' : 'Tous les ' + n + ' ans';
    } else {
      label = 'R\u00e9currente';
    }
    var timeText = formatDueTimeDisplay(time);
    return timeText ? label + ' \u00e0 ' + timeText : label;
  }

  function formatDueDateBoxDisplay(iso) {
    var date = dueDateToLocalDate(iso);
    if (!date) return '';
    try {
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (err) {
      return (
        date.getDate() +
        ' ' +
        DUE_DATE_MONTH_NAMES[date.getMonth()] +
        ' ' +
        date.getFullYear()
      );
    }
  }

  function normalizeTimeFormatPref(raw) {
    if (raw === 12 || raw === true) return '12';
    var s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (s === '12' || s === '12h' || s === 'hour12' || s === 'h12') return '12';
    return '24';
  }

  function setTimeFormat(format) {
    S.preferredTimeFormat = normalizeTimeFormatPref(format);
    return S.preferredTimeFormat;
  }

  function getTimeFormat() {
    return S.preferredTimeFormat === '12' ? '12' : '24';
  }

  function isHour12() {
    return getTimeFormat() === '12';
  }

  function hour24ToHour12Parts(hour24) {
    var h = ((Number(hour24) % 24) + 24) % 24;
    var isPm = h >= 12;
    var hour12 = h % 12;
    if (hour12 === 0) hour12 = 12;
    return { hour12: hour12, isPm: isPm };
  }

  function hour12PartsToHour24(hour12, isPm) {
    var n = Number(hour12);
    if (!isFinite(n) || n < 1) n = 12;
    if (n > 12) n = 12;
    var h24 = n % 12;
    if (isPm) h24 += 12;
    return h24;
  }

  /** Clock label for triggers / chips: "14:30" or "2:30 PM". */
  function formatDueTimeDisplay(time) {
    var normalized = normalizeDueTime(time);
    if (!normalized) return '';
    var parts = normalized.split(':');
    var hours = +parts[0];
    var minutes = +parts[1];
    if (!isHour12()) return pad2(hours) + ':' + pad2(minutes);
    var conv = hour24ToHour12Parts(hours);
    var suffix = conv.isPm ? DUE_DATE_TIME_PM_LABEL : DUE_DATE_TIME_AM_LABEL;
    return conv.hour12 + ':' + pad2(minutes) + ' ' + suffix;
  }

  function formatDueDateDisplay(iso, time) {
    var dateText = formatDueDateBoxDisplay(iso);
    if (!dateText) return '';
    var timeText = formatDueTimeDisplay(time);
    if (!timeText) return dateText;
    return dateText + ' \u00b7 ' + timeText;
  }

  /** Column index in a Sunday-first week (JS getDay(): Sun=0 … Sat=6). */
  function sundayOffset(date) {
    return date.getDay();
  }

  function daysUntilDue(iso, now) {
    var due = dueDateToLocalDate(iso);
    if (!due) return NaN;
    var today = startOfLocalDay(now || new Date());
    return Math.round((startOfLocalDay(due).getTime() - today.getTime()) / MS_PER_DAY);
  }

  function msUntilDue(iso, time, now) {
    var due = dueInstant(iso, time);
    if (!due) return NaN;
    return due.getTime() - (now || new Date()).getTime();
  }

  function isDuePast(iso, time, now) {
    if (normalizeDueTime(time)) return msUntilDue(iso, time, now) < 0;
    return daysUntilDue(iso, now) < 0;
  }

  /**
   * Échéance proximity band for section chrome coloring.
   * overdue | imminent (≤2j) | soon (≤2 sem) | weeks (≤1 mois) | month (≤3 mois) | far
   */
  var DUE_PROXIMITY_BANDS = [
    'overdue',
    'imminent',
    'soon',
    'weeks',
    'month',
    'far'
  ];

  var DUE_BAND_ACCENTS = {
    overdue: '#C9372C',
    imminent: '#FF9F1A',
    soon: '#F2D600',
    weeks: '#61BD4F',
    month: '#0079BF',
    far: '#B3BAC5'
  };

  function dueBandAccent(band) {
    return DUE_BAND_ACCENTS[band] || '';
  }

  // exports
  S.COUNTDOWN_DAYS_PER_WEEK = COUNTDOWN_DAYS_PER_WEEK;
  S.COUNTDOWN_HOUR_DISPLAY_MAX = COUNTDOWN_HOUR_DISPLAY_MAX;
  S.COUNTDOWN_WEEK_THRESHOLD_DAYS = COUNTDOWN_WEEK_THRESHOLD_DAYS;
  S.COUNTDOWN_YEAR_THRESHOLD_DAYS = COUNTDOWN_YEAR_THRESHOLD_DAYS;
  S.DAYS_PER_MONTH_AVG = DAYS_PER_MONTH_AVG;
  S.DAYS_PER_YEAR_AVG = DAYS_PER_YEAR_AVG;
  S.DUE_BAND_ACCENTS = DUE_BAND_ACCENTS;
  S.DUE_DATE_BOX_LABEL = DUE_DATE_BOX_LABEL;
  S.DUE_DATE_CALENDAR_LABEL = DUE_DATE_CALENDAR_LABEL;
  S.DUE_DATE_CLEAR_LABEL = DUE_DATE_CLEAR_LABEL;
  S.DUE_DATE_LABEL = DUE_DATE_LABEL;
  S.DUE_DATE_MASTER_CLEAR_LABEL = DUE_DATE_MASTER_CLEAR_LABEL;
  S.DUE_DATE_MODE_PRECISE = DUE_DATE_MODE_PRECISE;
  S.DUE_DATE_MODE_PRECISE_LABEL = DUE_DATE_MODE_PRECISE_LABEL;
  S.DUE_DATE_MODE_VAGUE = DUE_DATE_MODE_VAGUE;
  S.DUE_DATE_MODE_VAGUE_LABEL = DUE_DATE_MODE_VAGUE_LABEL;
  S.DUE_DATE_MONTH_NAMES = DUE_DATE_MONTH_NAMES;
  S.DUE_DATE_MONTH_SHORT = DUE_DATE_MONTH_SHORT;
  S.DUE_DATE_NEXT_MONTH = DUE_DATE_NEXT_MONTH;
  S.DUE_DATE_NEXT_YEAR = DUE_DATE_NEXT_YEAR;
  S.DUE_DATE_NEXT_YEARS = DUE_DATE_NEXT_YEARS;
  S.DUE_DATE_PICK_DAY_LABEL = DUE_DATE_PICK_DAY_LABEL;
  S.DUE_DATE_PICK_MONTH_LABEL = DUE_DATE_PICK_MONTH_LABEL;
  S.DUE_DATE_PICK_YEAR_LABEL = DUE_DATE_PICK_YEAR_LABEL;
  S.DUE_DATE_PLACEHOLDER = DUE_DATE_PLACEHOLDER;
  S.DUE_DATE_PREV_MONTH = DUE_DATE_PREV_MONTH;
  S.DUE_DATE_PREV_YEAR = DUE_DATE_PREV_YEAR;
  S.DUE_DATE_PREV_YEARS = DUE_DATE_PREV_YEARS;
  S.DUE_DATE_QUICK_AFTERNOON_TIME = DUE_DATE_QUICK_AFTERNOON_TIME;
  S.DUE_DATE_QUICK_MORNING_TIME = DUE_DATE_QUICK_MORNING_TIME;
  S.DUE_DATE_QUICK_SUGGESTIONS = DUE_DATE_QUICK_SUGGESTIONS;
  S.DUE_DATE_QUICK_SUGGESTIONS_LABEL = DUE_DATE_QUICK_SUGGESTIONS_LABEL;
  S.DUE_DATE_RECURRING_CLEAR_LABEL = DUE_DATE_RECURRING_CLEAR_LABEL;
  S.DUE_DATE_RECURRING_DAILY = DUE_DATE_RECURRING_DAILY;
  S.DUE_DATE_RECURRING_LABEL = DUE_DATE_RECURRING_LABEL;
  S.DUE_DATE_RECURRING_MONTHLY = DUE_DATE_RECURRING_MONTHLY;
  S.DUE_DATE_RECURRING_NONE = DUE_DATE_RECURRING_NONE;
  S.DUE_DATE_RECURRING_WEEKLY = DUE_DATE_RECURRING_WEEKLY;
  S.DUE_DATE_RECURRING_YEARLY = DUE_DATE_RECURRING_YEARLY;
  S.DUE_DATE_START_CLEAR_LABEL = DUE_DATE_START_CLEAR_LABEL;
  S.DUE_DATE_START_LABEL = DUE_DATE_START_LABEL;
  S.DUE_DATE_START_PLACEHOLDER = DUE_DATE_START_PLACEHOLDER;
  S.DUE_DATE_TIME_AM_LABEL = DUE_DATE_TIME_AM_LABEL;
  S.DUE_DATE_TIME_CLEAR_LABEL = DUE_DATE_TIME_CLEAR_LABEL;
  S.DUE_DATE_TIME_CLOCK_INNER_R = DUE_DATE_TIME_CLOCK_INNER_R;
  S.DUE_DATE_TIME_CLOCK_MINUTE_R = DUE_DATE_TIME_CLOCK_MINUTE_R;
  S.DUE_DATE_TIME_CLOCK_OUTER_R = DUE_DATE_TIME_CLOCK_OUTER_R;
  S.DUE_DATE_TIME_CLOCK_SIZE = DUE_DATE_TIME_CLOCK_SIZE;
  S.DUE_DATE_TIME_DEFAULT = DUE_DATE_TIME_DEFAULT;
  S.DUE_DATE_TIME_DIAL_LABEL = DUE_DATE_TIME_DIAL_LABEL;
  S.DUE_DATE_TIME_HOURS_ARIA = DUE_DATE_TIME_HOURS_ARIA;
  S.DUE_DATE_TIME_LABEL = DUE_DATE_TIME_LABEL;
  S.DUE_DATE_TIME_MERIDIEM_ARIA = DUE_DATE_TIME_MERIDIEM_ARIA;
  S.DUE_DATE_TIME_MINUTES_ARIA = DUE_DATE_TIME_MINUTES_ARIA;
  S.DUE_DATE_TIME_MINUTE_STEPS = DUE_DATE_TIME_MINUTE_STEPS;
  S.DUE_DATE_TIME_MODE_HOUR_LABEL = DUE_DATE_TIME_MODE_HOUR_LABEL;
  S.DUE_DATE_TIME_MODE_MINUTE_LABEL = DUE_DATE_TIME_MODE_MINUTE_LABEL;
  S.DUE_DATE_TIME_PERIODS = DUE_DATE_TIME_PERIODS;
  S.DUE_DATE_TIME_PICKER_LABEL = DUE_DATE_TIME_PICKER_LABEL;
  S.DUE_DATE_TIME_PLACEHOLDER = DUE_DATE_TIME_PLACEHOLDER;
  S.DUE_DATE_TIME_PM_LABEL = DUE_DATE_TIME_PM_LABEL;
  S.DUE_DATE_TIME_SUGGESTIONS_LABEL = DUE_DATE_TIME_SUGGESTIONS_LABEL;
  S.DUE_DATE_TODAY_LABEL = DUE_DATE_TODAY_LABEL;
  S.DUE_DATE_VAGUE_DEFAULT_ID = DUE_DATE_VAGUE_DEFAULT_ID;
  S.DUE_DATE_VAGUE_LEGACY_DAYS = DUE_DATE_VAGUE_LEGACY_DAYS;
  S.DUE_DATE_VAGUE_OPTIONS = DUE_DATE_VAGUE_OPTIONS;
  S.DUE_DATE_VAGUE_OPTIONS_LABEL = DUE_DATE_VAGUE_OPTIONS_LABEL;
  S.DUE_DATE_WEEKDAYS = DUE_DATE_WEEKDAYS;
  S.DUE_DATE_WEEKDAY_NAMES = DUE_DATE_WEEKDAY_NAMES;
  S.DUE_DATE_YEAR_PICKER_COUNT = DUE_DATE_YEAR_PICKER_COUNT;
  S.DUE_PROXIMITY_BANDS = DUE_PROXIMITY_BANDS;
  S.MS_PER_DAY = MS_PER_DAY;
  S.MS_PER_HOUR = MS_PER_HOUR;
  S.MS_PER_MINUTE = MS_PER_MINUTE;
  S.RECURRENCE_FREQUENCIES = RECURRENCE_FREQUENCIES;
  S.addCalendarMonths = addCalendarMonths;
  S.advanceDateByRecurrence = advanceDateByRecurrence;
  S.advanceDateByRecurrenceAfter = advanceDateByRecurrenceAfter;
  S.blockedLinkFromRaw = blockedLinkFromRaw;
  S.blockedLinksFromRaw = blockedLinksFromRaw;
  S.canonicalizeTrelloDueIso = canonicalizeTrelloDueIso;
  S.daysUntilDue = daysUntilDue;
  S.dueBandAccent = dueBandAccent;
  S.dueDateToLocalDate = dueDateToLocalDate;
  S.dueInstant = dueInstant;
  S.dueVagueIdAtIndex = dueVagueIdAtIndex;
  S.dueVagueIndex = dueVagueIndex;
  S.dueVagueOption = dueVagueOption;
  S.expandBlockedReasonsForDisplay = expandBlockedReasonsForDisplay;
  S.findSubtaskById = findSubtaskById;
  S.formatBlockedReasonsSummary = formatBlockedReasonsSummary;
  S.formatDueCountdownFromInputs = formatDueCountdownFromInputs;
  S.formatDueDateBoxDisplay = formatDueDateBoxDisplay;
  S.formatDueDateDisplay = formatDueDateDisplay;
  S.formatDueTimeDisplay = formatDueTimeDisplay;
  S.formatDueVagueCountdown = formatDueVagueCountdown;
  S.formatDueVagueLabel = formatDueVagueLabel;
  S.formatRecurrenceLabelFr = formatRecurrenceLabelFr;
  S.getTimeFormat = getTimeFormat;
  S.hour12PartsToHour24 = hour12PartsToHour24;
  S.hour24ToHour12Parts = hour24ToHour12Parts;
  S.inputsToTrelloDueIso = inputsToTrelloDueIso;
  S.inputsToTrelloStartIso = inputsToTrelloStartIso;
  S.isDueDateQuickSuggestionAvailable = isDueDateQuickSuggestionAvailable;
  S.isDuePast = isDuePast;
  S.isDueVagueEligible = isDueVagueEligible;
  S.isDueVagueMode = isDueVagueMode;
  S.isHour12 = isHour12;
  S.msUntilDue = msUntilDue;
  S.nextOccurrenceParts = nextOccurrenceParts;
  S.normalizeBlockedLink = normalizeBlockedLink;
  S.normalizeBlockedLinks = normalizeBlockedLinks;
  S.normalizeDueDate = normalizeDueDate;
  S.normalizeDueMode = normalizeDueMode;
  S.normalizeDueTime = normalizeDueTime;
  S.normalizeDueVague = normalizeDueVague;
  S.normalizeRecurrence = normalizeRecurrence;
  S.normalizeTimeFormatPref = normalizeTimeFormatPref;
  S.occurrenceInstant = occurrenceInstant;
  S.pad2 = pad2;
  S.parseTrelloDueToParts = parseTrelloDueToParts;
  S.resolveDueDateQuickSuggestion = resolveDueDateQuickSuggestion;
  S.resolveDueVagueToDate = resolveDueVagueToDate;
  S.setTimeFormat = setTimeFormat;
  S.startOfLocalDay = startOfLocalDay;
  S.sundayOffset = sundayOffset;
  S.toIsoDate = toIsoDate;
  S.trelloDueIsoFromParts = trelloDueIsoFromParts;
})(typeof window !== 'undefined' ? window : this);
