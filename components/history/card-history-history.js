/**
 * Persisted card edit history (undo / redo / revert).
 * Stored in card/private so it does not compete with shared plugin data.
 * Exposes window.CardHistory.
 *
 * Hard limit: card/private is ONE 4096 budget shared with cardAgentChat —
 * MAX_ENTRIES=8, MAX_SERIALIZED≈1000. Entries are slim diffs, not full snaps.
 * UI (history-ui) calls record / undo / redo / revertTo.
 */

/**
 * card-history: part 1 of 2 (dbg).
 * Names are shared with the other parts through window.CardHistoryParts (see card-history.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.CardHistoryParts = global.CardHistoryParts || {});

  // from other parts (functions, resolved at call time)
  function buildLabel() { return S.buildLabel.apply(this, arguments); }

function dbg() { return global.TpDebug || null; }
  function dbgLog(domain, event, meta) { var d = dbg(); if (d && d.log) d.log(domain, event, meta); }
  function dbgError(domain, event, err, meta) { var d = dbg(); if (d && d.error) d.error(domain, event, err, meta); else if (err) console.error(domain + '.' + event, err); }

  var HISTORY_KEY = 'cardEditHistory';
  // card/private is ONE 4096 budget shared with cardAgentChat etc.
  // Keep history tiny so chat + history can coexist.
  var MAX_ENTRIES = 8;
  var MAX_SERIALIZED = 1000;
  var PLUGIN_PRIVATE_BUDGET = 3900;

  function clone(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return value;
    }
  }

  function stableStringify(value) {
    try {
      return JSON.stringify(canonicalize(value));
    } catch (e) {
      return '';
    }
  }

  function canonicalize(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      return value.map(canonicalize);
    }
    var keys = Object.keys(value).sort();
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = canonicalize(value[keys[i]]);
    }
    return out;
  }

  function deepEqual(a, b) {
    return stableStringify(a) === stableStringify(b);
  }

  function makeId() {
    return (
      'h' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function emptyStore() {
    return { version: 1, entries: [], cursor: 0 };
  }

  function normalizeStore(raw) {
    var store = emptyStore();
    if (!raw || typeof raw !== 'object') return store;
    if (Array.isArray(raw.entries)) {
      store.entries = raw.entries
        .filter(function (e) {
          return e && typeof e === 'object' && e.id && e.before && e.after;
        })
        .map(function (e) {
          var domains = Array.isArray(e.domains) ? e.domains : changedDomains(e.before, e.after);
          var relabeled = buildLabel(e.before, e.after, domains, e.label);
          return Object.assign({}, e, {
            domains: domains,
            // Refresh vague legacy labels when diffs are still available.
            label: relabeled || e.label || 'Modification'
          });
        });
    }
    var cursor = Number(raw.cursor);
    if (!isFinite(cursor) || cursor < 0) cursor = store.entries.length;
    if (cursor > store.entries.length) cursor = store.entries.length;
    store.cursor = cursor;
    return store;
  }

  function serializedSize(store) {
    return stableStringify(store).length;
  }

  function slimCompletion(completion) {
    if (!completion || typeof completion !== 'object') return completion;
    var items = Array.isArray(completion.items) ? completion.items : [];
    var slimItems = items.slice(0, 5).map(function (item) {
      if (!item || typeof item !== 'object') return item;
      var row = {
        id: item.id,
        text: String(item.text || '').slice(0, 48),
        progress: item.progress,
        done: !!item.done
      };
      if (item.estimatedMinutes != null) row.estimatedMinutes = item.estimatedMinutes;
      if (item.linkedCardId) row.linkedCardId = item.linkedCardId;
      if (Array.isArray(item.items) && item.items.length) {
        row.items = item.items.slice(0, 5).map(function (nested) {
          if (!nested || typeof nested !== 'object') return nested;
          var child = {
            id: nested.id,
            text: String(nested.text || '').slice(0, 48),
            progress: nested.progress,
            done: !!nested.done
          };
          if (nested.estimatedMinutes != null) {
            child.estimatedMinutes = nested.estimatedMinutes;
          }
          return child;
        });
        if (item.items.length > row.items.length) row._itemsTruncated = true;
      }
      return row;
    });
    var out = { items: slimItems };
    if (slimItems.length === 0 && completion.progress != null) {
      out.progress = completion.progress;
    }
    if (completion.estimatedMinutes != null) {
      out.estimatedMinutes = completion.estimatedMinutes;
    }
    if (
      typeof completion.estimatedMinutesOffset === 'number' &&
      completion.estimatedMinutesOffset !== 0
    ) {
      out.estimatedMinutesOffset = completion.estimatedMinutesOffset;
    }
    if (items.length > slimItems.length) out._truncated = true;
    return out;
  }

  function slimRecurrence(recurrence) {
    if (!recurrence || typeof recurrence !== 'object') return null;
    var frequency =
      typeof recurrence.frequency === 'string'
        ? recurrence.frequency.trim().toLowerCase()
        : '';
    if (!frequency) return null;
    var interval = Math.round(Number(recurrence.interval));
    if (!isFinite(interval) || interval < 1) interval = 1;
    var out = { frequency: frequency, interval: interval };
    if (frequency === 'weekly' && Array.isArray(recurrence.weekdays)) {
      out.weekdays = recurrence.weekdays
        .map(function (d) {
          return Number(d);
        })
        .filter(function (d) {
          return isFinite(d) && d >= 0 && d <= 6;
        })
        .slice(0, 7);
    }
    return out;
  }

  function slimPriority(priority) {
    if (!priority || typeof priority !== 'object') return priority;
    var out = {
      urgency: priority.urgency,
      impact: priority.impact,
      ease: priority.ease,
      enAttente: !!priority.enAttente,
      priorityEnabled: priority.priorityEnabled !== false
    };
    if (priority.dueDate) out.dueDate = String(priority.dueDate).slice(0, 32);
    if (priority.dueTime) out.dueTime = String(priority.dueTime).slice(0, 8);
    if (priority.startDate) out.startDate = String(priority.startDate).slice(0, 32);
    if (priority.estimatedDurationMinutes != null) {
      out.estimatedDurationMinutes = priority.estimatedDurationMinutes;
    }
    var recur = slimRecurrence(priority.recurrence);
    if (recur) out.recurrence = recur;
    if (Array.isArray(priority.blockedReasons) && priority.blockedReasons.length) {
      out.blockedReasons = priority.blockedReasons.slice(0, 3).map(function (r) {
        if (typeof r === 'string') return r.slice(0, 60);
        if (r && typeof r === 'object') {
          return {
            text: String(r.text || r.reason || '').slice(0, 60)
          };
        }
        return r;
      });
    }
    if (Array.isArray(priority.blockedLinks) && priority.blockedLinks.length) {
      out.blockedLinks = priority.blockedLinks.slice(0, 3).map(function (link) {
        if (typeof link === 'string') return link.slice(0, 80);
        if (link && typeof link === 'object') {
          return {
            id: link.id ? String(link.id).slice(0, 40) : undefined,
            name: link.name ? String(link.name).slice(0, 60) : undefined,
            url: link.url ? String(link.url).slice(0, 80) : undefined
          };
        }
        return link;
      });
    }
    return out;
  }

  function slimPayload(partial) {
    var out = clone(partial) || {};
    if (out.completion) out.completion = slimCompletion(out.completion);
    if (out.priority) out.priority = slimPriority(out.priority);
    if (out.info && typeof out.info === 'object') {
      out.info = {
        name: String(out.info.name || '').slice(0, 80),
        desc: String(out.info.desc || '').slice(0, 120),
        memberIds: Array.isArray(out.info.memberIds)
          ? out.info.memberIds.slice(0, 8)
          : [],
        labelIds: Array.isArray(out.info.labelIds)
          ? out.info.labelIds.slice(0, 8)
          : []
      };
    }
    if (out.goals && typeof out.goals === 'object') {
      out.goals = { projectId: out.goals.projectId || null };
    }
    if (out.statut && typeof out.statut === 'object') {
      out.statut = {
        listId: out.statut.listId || null,
        dueComplete: !!out.statut.dueComplete
      };
    }
    return out;
  }

  function trimStoreToBudget(store, budget) {
    var limit =
      typeof budget === 'number' && isFinite(budget) && budget > 200
        ? Math.floor(budget)
        : MAX_SERIALIZED;
    var next = {
      version: 1,
      entries: (store.entries || []).slice(),
      cursor: store.cursor | 0
    };
    while (next.entries.length > MAX_ENTRIES) {
      next.entries.shift();
      next.cursor = Math.max(0, next.cursor - 1);
    }
    // Always slim payloads — full card snapshots blow the shared private budget.
    next.entries = next.entries.map(function (e) {
      if (!e || typeof e !== 'object') return e;
      return {
        id: e.id,
        at: e.at,
        label: String(e.label || '').slice(0, 120),
        domains: Array.isArray(e.domains) ? e.domains.slice(0, 5) : [],
        before: slimPayload(e.before),
        after: slimPayload(e.after)
      };
    });
    while (serializedSize(next) > limit && next.entries.length > 1) {
      next.entries.shift();
      next.cursor = Math.max(0, next.cursor - 1);
    }
    while (serializedSize(next) > limit && next.entries.length === 1) {
      var only = next.entries[0];
      next.entries = [
        {
          id: only.id,
          at: only.at,
          label: String(only.label || '').slice(0, 40),
          domains: (only.domains || []).slice(0, 2),
          before: slimPayload(only.before),
          after: slimPayload(only.after)
        }
      ];
      next.cursor = Math.min(next.cursor, 1);
      if (serializedSize(next) > limit) {
        next.entries = [];
        next.cursor = 0;
      }
      break;
    }
    if (serializedSize(next) > limit) {
      next.entries = [];
      next.cursor = 0;
    }
    return next;
  }

  function trimStore(store) {
    return trimStoreToBudget(store, MAX_SERIALIZED);
  }

  function domainSlice(snapshot, key) {
    var value = snapshot && snapshot[key];
    if (!value || typeof value !== 'object') return value;
    if (key === 'statut') {
      return {
        listId: value.listId || null,
        dueComplete: !!value.dueComplete
      };
    }
    if (key === 'info') {
      return {
        name: value.name || '',
        desc: value.desc || '',
        memberIds: value.memberIds || [],
        labelIds: value.labelIds || []
      };
    }
    if (key === 'goals') {
      return { projectId: value.projectId || null };
    }
    return value;
  }

  function changedDomains(before, after) {
    var domains = [];
    var keys = ['priority', 'completion', 'statut', 'info', 'goals'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (!deepEqual(domainSlice(before, key), domainSlice(after, key))) {
        domains.push(key);
      }
    }
    return domains;
  }

  function pickDomains(snapshot, domains) {
    var out = {};
    for (var i = 0; i < domains.length; i++) {
      var key = domains[i];
      if (key === 'completion') {
        out[key] = slimCompletion(snapshot && snapshot.completion);
      } else if (key === 'priority') {
        out[key] = slimPriority(snapshot && snapshot.priority);
      } else if (key === 'info') {
        var info = snapshot && snapshot.info;
        out[key] = info
          ? {
              name: String(info.name || '').slice(0, 80),
              desc: String(info.desc || '').slice(0, 120),
              memberIds: Array.isArray(info.memberIds)
                ? info.memberIds.slice(0, 8)
                : [],
              labelIds: Array.isArray(info.labelIds)
                ? info.labelIds.slice(0, 8)
                : []
            }
          : info;
      } else {
        out[key] = clone(domainSlice(snapshot, key));
      }
    }
    return slimPayload(out);
  }

  var MONTHS_FR = [
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

  var LABEL_MAX = 160;

  function axisLabel(key) {
    if (key === 'urgency') return 'Urgence';
    if (key === 'impact') return 'Impact';
    if (key === 'ease') return 'Facilit\u00e9';
    return key;
  }

  function quoteText(value, maxLen) {
    var s = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
    maxLen = maxLen || 36;
    if (!s) return '\u00ab \u00bb';
    if (maxLen > 0 && s.length > maxLen) {
      s = s.slice(0, Math.max(1, maxLen - 1)) + '\u2026';
    }
    return '\u00ab ' + s + ' \u00bb';
  }

  function fullText(value) {
    return String(value == null ? '' : value).trim();
  }

  /** Compact French clock for history copy (e.g. "14 h", "14 h 30"). */
  function formatHistoryTimeFr(time) {
    if (!time) return '';
    var PU = global.PriorityUI;
    if (PU && typeof PU.formatDueTimeCompactFr === 'function') {
      var compact = PU.formatDueTimeCompactFr(time);
      if (compact) return compact;
    }
    var raw = String(time).slice(0, 5);
    var parts = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!parts) return raw;
    var hours = Number(parts[1]);
    var minutes = Number(parts[2]);
    if (!isFinite(hours) || !isFinite(minutes)) return raw;
    if (minutes === 0) return String(hours) + ' h';
    return (
      String(hours) +
      ' h ' +
      (minutes < 10 ? '0' + minutes : String(minutes))
    );
  }

  function formatHistoryDateFr(date) {
    if (!date) return '';
    var m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(date);
    var monthIdx = Number(m[2]) - 1;
    var day = Number(m[3]);
    var month = MONTHS_FR[monthIdx] || m[2];
    return day + ' ' + month + ' ' + m[1];
  }

  /** Relative day word vs today (lowercase), or '' when not nearby. */
  function relativeDayWordFr(date, now) {
    var m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    var due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isFinite(due.getTime())) return '';
    var at = now || new Date();
    var today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    var days = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (days === 0) return 'aujourd\'hui';
    if (days === 1) return 'demain';
    if (days === -1) return 'hier';
    if (days === 2) return 'apr\u00e8s-demain';
    return '';
  }

  /** Parenthetical day context: "(demain, le 17 juil. 2026)". */
  function dueDayParenFr(date, now) {
    var calendar = formatHistoryDateFr(date);
    if (!calendar) return '';
    var relative = relativeDayWordFr(date, now);
    if (relative) return ' (' + relative + ', le ' + calendar + ')';
    return ' (le ' + calendar + ')';
  }

  /**
   * Sentence-style due change for history labels.
   * Ex.: "Heure de l'échéance modifiée de 14 h à 18 h (demain, le 17 juil. 2026)"
   */
  function describeDueChange(beforeDate, beforeTime, afterDate, afterTime, now) {
    var bDate = beforeDate || '';
    var aDate = afterDate || '';
    var bTime = beforeTime ? String(beforeTime).slice(0, 5) : '';
    var aTime = afterTime ? String(afterTime).slice(0, 5) : '';
    var at = now || new Date();

    if (!bDate && !aDate) return '';

    if (!bDate && aDate) {
      var setTime = formatHistoryTimeFr(aTime);
      if (setTime) {
        return (
          '\u00c9ch\u00e9ance fix\u00e9e \u00e0 ' +
          setTime +
          dueDayParenFr(aDate, at)
        );
      }
      return '\u00c9ch\u00e9ance fix\u00e9e' + dueDayParenFr(aDate, at);
    }

    if (bDate && !aDate) {
      var wasTime = formatHistoryTimeFr(bTime);
      return (
        '\u00c9ch\u00e9ance retir\u00e9e (\u00e9tait le ' +
        formatHistoryDateFr(bDate) +
        (wasTime ? ' \u00e0 ' + wasTime : '') +
        ')'
      );
    }

    var dateChanged = bDate !== aDate;
    var timeChanged = bTime !== aTime;

    if (!dateChanged && timeChanged) {
      var fromTime = formatHistoryTimeFr(bTime);
      var toTime = formatHistoryTimeFr(aTime);
      if (!bTime && aTime) {
        return (
          'Heure d\'\u00e9ch\u00e9ance ajout\u00e9e : ' +
          toTime +
          dueDayParenFr(aDate, at)
        );
      }
      if (bTime && !aTime) {
        return (
          'Heure d\'\u00e9ch\u00e9ance retir\u00e9e' + dueDayParenFr(aDate, at)
        );
      }
      return (
        'Heure de l\'\u00e9ch\u00e9ance modifi\u00e9e de ' +
        fromTime +
        ' \u00e0 ' +
        toTime +
        dueDayParenFr(aDate, at)
      );
    }

    if (dateChanged && !timeChanged) {
      var keepTime = formatHistoryTimeFr(aTime || bTime);
      return (
        'Date d\'\u00e9ch\u00e9ance modifi\u00e9e du ' +
        formatHistoryDateFr(bDate) +
        ' au ' +
        formatHistoryDateFr(aDate) +
        (keepTime ? ' (toujours \u00e0 ' + keepTime + ')' : '')
      );
    }

    // Date + time both changed.
    var fromFull =
      formatHistoryDateFr(bDate) +
      (formatHistoryTimeFr(bTime) ? ' \u00e0 ' + formatHistoryTimeFr(bTime) : '');
    var toFull =
      formatHistoryDateFr(aDate) +
      (formatHistoryTimeFr(aTime) ? ' \u00e0 ' + formatHistoryTimeFr(aTime) : '');
    var relative = relativeDayWordFr(aDate, at);
    return (
      '\u00c9ch\u00e9ance modifi\u00e9e du ' +
      fromFull +
      ' au ' +
      toFull +
      (relative ? ' (' + relative + ')' : '')
    );
  }

  /**
   * Human label for startDate changes in cardPriority.
   */
  function describeStartChange(beforeDate, afterDate) {
    var bDate = beforeDate || '';
    var aDate = afterDate || '';
    if (bDate === aDate) return '';
    if (!bDate && aDate) {
      return 'D\u00e9but fix\u00e9 au ' + formatHistoryDateFr(aDate);
    }
    if (bDate && !aDate) {
      return 'D\u00e9but retir\u00e9 (\u00e9tait le ' + formatHistoryDateFr(bDate) + ')';
    }
    return (
      'D\u00e9but modifi\u00e9 du ' +
      formatHistoryDateFr(bDate) +
      ' au ' +
      formatHistoryDateFr(aDate)
    );
  }

  function recurrenceKey(raw) {
    if (!raw || typeof raw !== 'object') return '';
    var frequency =
      typeof raw.frequency === 'string' ? raw.frequency.trim().toLowerCase() : '';
    if (!frequency) return '';
    var interval = Math.round(Number(raw.interval));
    if (!isFinite(interval) || interval < 1) interval = 1;
    var key = frequency + ':' + interval;
    if (frequency === 'weekly' && Array.isArray(raw.weekdays)) {
      key +=
        ':' +
        raw.weekdays
          .map(function (d) {
            return Number(d);
          })
          .filter(function (d) {
            return isFinite(d) && d >= 0 && d <= 6;
          })
          .sort(function (a, b) {
            return a - b;
          })
          .join(',');
    }
    return key;
  }

  function formatRecurrenceHistoryFr(raw) {
    if (
      typeof window !== 'undefined' &&
      window.PriorityUI &&
      typeof window.PriorityUI.formatRecurrenceLabelFr === 'function'
    ) {
      return window.PriorityUI.formatRecurrenceLabelFr(raw);
    }
    if (!raw || typeof raw !== 'object' || !raw.frequency) return 'Ne pas r\u00e9p\u00e9ter';
    var n = Math.round(Number(raw.interval));
    if (!isFinite(n) || n < 1) n = 1;
    if (raw.frequency === 'daily') {
      return n === 1 ? 'Chaque jour' : 'Tous les ' + n + ' jours';
    }
    if (raw.frequency === 'weekly') {
      return n === 1 ? 'Chaque semaine' : 'Toutes les ' + n + ' semaines';
    }
    if (raw.frequency === 'monthly') {
      return n === 1 ? 'Chaque mois' : 'Tous les ' + n + ' mois';
    }
    if (raw.frequency === 'yearly') {
      return n === 1 ? 'Chaque ann\u00e9e' : 'Tous les ' + n + ' ans';
    }
    return 'R\u00e9currente';
  }

  function describeRecurrenceChange(before, after) {
    var bKey = recurrenceKey(before);
    var aKey = recurrenceKey(after);
    if (bKey === aKey) return '';
    if (!bKey && aKey) {
      return 'R\u00e9p\u00e9tition : ' + formatRecurrenceHistoryFr(after).toLowerCase();
    }
    if (bKey && !aKey) {
      return 'R\u00e9p\u00e9tition d\u00e9sactiv\u00e9e';
    }
    return (
      'R\u00e9p\u00e9tition : ' +
      formatRecurrenceHistoryFr(before).toLowerCase() +
      ' \u2192 ' +
      formatRecurrenceHistoryFr(after).toLowerCase()
    );
  }

  function formatMinutesFr(mins) {
    if (mins == null || mins === '') return 'aucune';
    var n = Number(mins);
    if (!isFinite(n)) return String(mins);
    if (n < 60) return n + ' min';
    var h = Math.floor(n / 60);
    var rem = n % 60;
    if (!rem) return h + ' h';
    return h + ' h ' + rem + ' min';
  }

  function itemMap(items) {
    var map = Object.create(null);
    (items || []).forEach(function (item) {
      if (item && item.id) map[String(item.id)] = item;
    });
    return map;
  }

  function displayNameForId(summaries, id, fallback) {
    var list = summaries || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === String(id)) {
        return list[i].name || list[i].text || fallback || String(id);
      }
    }
    return fallback || String(id);
  }

  function idDiffLabels(beforeIds, afterIds, beforeSummaries, afterSummaries) {
    var beforeSet = Object.create(null);
    var afterSet = Object.create(null);
    (beforeIds || []).forEach(function (id) {
      beforeSet[String(id)] = true;
    });
    (afterIds || []).forEach(function (id) {
      afterSet[String(id)] = true;
    });
    var added = [];
    var removed = [];
    (afterIds || []).forEach(function (id) {
      if (!beforeSet[String(id)]) {
        added.push(displayNameForId(afterSummaries, id, id));
      }
    });
    (beforeIds || []).forEach(function (id) {
      if (!afterSet[String(id)]) {
        removed.push(displayNameForId(beforeSummaries, id, id));
      }
    });
    return { added: added, removed: removed };
  }

  function itemProgressPercent(item) {
    if (!item || typeof item !== 'object') return 0;
    var p = Number(item.progress);
    if (isFinite(p)) return Math.max(0, Math.min(100, Math.round(p)));
    return item.done === true ? 100 : 0;
  }

  function overallCompletionPercent(completion) {
    var items = (completion && completion.items) || [];
    if (items.length) {
      var sum = 0;
      for (var i = 0; i < items.length; i++) {
        sum += itemProgressPercent(items[i]);
      }
      return Math.round(sum / items.length);
    }
    var p = Number(completion && completion.progress);
    return isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 0;
  }

  // exports
  S.HISTORY_KEY = HISTORY_KEY;
  S.LABEL_MAX = LABEL_MAX;
  S.MAX_ENTRIES = MAX_ENTRIES;
  S.MAX_SERIALIZED = MAX_SERIALIZED;
  S.MONTHS_FR = MONTHS_FR;
  S.PLUGIN_PRIVATE_BUDGET = PLUGIN_PRIVATE_BUDGET;
  S.axisLabel = axisLabel;
  S.canonicalize = canonicalize;
  S.changedDomains = changedDomains;
  S.clone = clone;
  S.dbg = dbg;
  S.dbgError = dbgError;
  S.dbgLog = dbgLog;
  S.deepEqual = deepEqual;
  S.describeDueChange = describeDueChange;
  S.describeRecurrenceChange = describeRecurrenceChange;
  S.describeStartChange = describeStartChange;
  S.displayNameForId = displayNameForId;
  S.domainSlice = domainSlice;
  S.dueDayParenFr = dueDayParenFr;
  S.emptyStore = emptyStore;
  S.formatHistoryDateFr = formatHistoryDateFr;
  S.formatHistoryTimeFr = formatHistoryTimeFr;
  S.formatMinutesFr = formatMinutesFr;
  S.formatRecurrenceHistoryFr = formatRecurrenceHistoryFr;
  S.fullText = fullText;
  S.idDiffLabels = idDiffLabels;
  S.itemMap = itemMap;
  S.itemProgressPercent = itemProgressPercent;
  S.makeId = makeId;
  S.normalizeStore = normalizeStore;
  S.overallCompletionPercent = overallCompletionPercent;
  S.pickDomains = pickDomains;
  S.quoteText = quoteText;
  S.recurrenceKey = recurrenceKey;
  S.relativeDayWordFr = relativeDayWordFr;
  S.serializedSize = serializedSize;
  S.slimCompletion = slimCompletion;
  S.slimPayload = slimPayload;
  S.slimPriority = slimPriority;
  S.slimRecurrence = slimRecurrence;
  S.stableStringify = stableStringify;
  S.trimStore = trimStore;
  S.trimStoreToBudget = trimStoreToBudget;
})(typeof window !== 'undefined' ? window : this);
