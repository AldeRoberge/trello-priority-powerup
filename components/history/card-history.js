/**
 * Persisted card edit history (undo / redo / revert).
 * Stored in card/private so it does not compete with shared plugin data.
 */
(function (global) {
  'use strict';

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

  function slimPriority(priority) {
    if (!priority || typeof priority !== 'object') return priority;
    var out = {
      urgency: priority.urgency,
      impact: priority.impact,
      ease: priority.ease,
      enAttente: !!priority.enAttente,
      priorityEnabled: priority.priorityEnabled !== false
    };
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

  function describeCompletion(before, after, quoteMax) {
    quoteMax = quoteMax == null ? 36 : quoteMax;
    var renameMax = quoteMax > 0 ? Math.min(quoteMax, 48) : 0;
    var bItems = (before && before.items) || [];
    var aItems = (after && after.items) || [];
    var bMap = itemMap(bItems);
    var aMap = itemMap(aItems);
    var parts = [];
    var bPct = overallCompletionPercent(before);
    var aPct = overallCompletionPercent(after);

    Object.keys(aMap).forEach(function (id) {
      if (!bMap[id]) {
        parts.push(
          'T\u00e2che ajout\u00e9e : ' +
            quoteText(aMap[id].text, quoteMax) +
            ' (' +
            itemProgressPercent(aMap[id]) +
            '\u00a0%)'
        );
      }
    });
    Object.keys(bMap).forEach(function (id) {
      if (!aMap[id]) {
        parts.push(
          'T\u00e2che supprim\u00e9e : ' +
            quoteText(bMap[id].text, quoteMax) +
            ' (' +
            itemProgressPercent(bMap[id]) +
            '\u00a0%)'
        );
      }
    });
    Object.keys(aMap).forEach(function (id) {
      if (!bMap[id]) return;
      var b = bMap[id];
      var a = aMap[id];
      if ((b.text || '') !== (a.text || '')) {
        parts.push(
          'T\u00e2che renomm\u00e9e : ' +
            quoteText(b.text, renameMax || 24) +
            ' \u2192 ' +
            quoteText(a.text, renameMax || 24)
        );
      }
      var bp = itemProgressPercent(b);
      var ap = itemProgressPercent(a);
      if (bp !== ap) {
        if ((bp < 100 && ap >= 100) || (!b.done && a.done && ap >= 100)) {
          parts.push(
            'T\u00e2che coch\u00e9e : ' + quoteText(a.text || b.text, quoteMax)
          );
        } else if ((bp >= 100 && ap < 100) || (b.done && !a.done && bp >= 100)) {
          parts.push(
            'T\u00e2che d\u00e9coch\u00e9e : ' +
              quoteText(a.text || b.text, quoteMax) +
              ' (' +
              ap +
              '\u00a0%)'
          );
        } else {
          parts.push(
            'T\u00e2che ' +
              quoteText(a.text || b.text, renameMax || 28) +
              ' : ' +
              bp +
              '\u00a0% \u2192 ' +
              ap +
              '\u00a0%'
          );
        }
      }
      var bEst = b.estimatedMinutes;
      var aEst = a.estimatedMinutes;
      if (bEst !== aEst && (bEst != null || aEst != null)) {
        parts.push(
          'Dur\u00e9e ' +
            quoteText(a.text || b.text, renameMax || 28) +
            ' : ' +
            formatMinutesFr(bEst) +
            ' \u2192 ' +
            formatMinutesFr(aEst)
        );
      }
    });

    if (bPct !== aPct) {
      parts.push('Progr\u00e8s global : ' + bPct + '\u00a0% \u2192 ' + aPct + '\u00a0%');
    }

    if (bItems.length !== aItems.length && !parts.length) {
      parts.push(
        'Nombre de t\u00e2ches : ' + bItems.length + ' \u2192 ' + aItems.length
      );
    }

    // Detect reorder when membership unchanged.
    if (
      bItems.length > 1 &&
      bItems.length === aItems.length &&
      Object.keys(bMap).length === Object.keys(aMap).length
    ) {
      var sameMembership = Object.keys(bMap).every(function (id) {
        return !!aMap[id];
      });
      if (sameMembership) {
        var orderChanged = bItems.some(function (item, idx) {
          return !aItems[idx] || String(aItems[idx].id) !== String(item.id);
        });
        if (orderChanged) {
          parts.push('Ordre des t\u00e2ches modifi\u00e9');
        }
      }
    }

    var bOff = before && before.estimatedMinutesOffset;
    var aOff = after && after.estimatedMinutesOffset;
    if (bOff !== aOff && (bOff != null || aOff != null)) {
      parts.push(
        'Ajustement de dur\u00e9e : ' +
          formatMinutesFr(bOff) +
          ' \u2192 ' +
          formatMinutesFr(aOff)
      );
    }

    var bCardEst = before && before.estimatedMinutes;
    var aCardEst = after && after.estimatedMinutes;
    if (
      !bItems.length &&
      !aItems.length &&
      bCardEst !== aCardEst &&
      (bCardEst != null || aCardEst != null)
    ) {
      parts.push(
        'Dur\u00e9e estim\u00e9e : ' +
          formatMinutesFr(bCardEst) +
          ' \u2192 ' +
          formatMinutesFr(aCardEst)
      );
    }

    if (!parts.length) {
      parts.push(
        'Progr\u00e8s : ' +
          bItems.length +
          ' t\u00e2che' +
          (bItems.length === 1 ? '' : 's') +
          ' \u00b7 ' +
          bPct +
          '\u00a0% \u2192 ' +
          aItems.length +
          ' t\u00e2che' +
          (aItems.length === 1 ? '' : 's') +
          ' \u00b7 ' +
          aPct +
          '\u00a0%'
      );
    }
    return parts;
  }

  function describeBlocked(bp, ap, quoteMax) {
    quoteMax = quoteMax == null ? 40 : quoteMax;
    var bReasons = Array.isArray(bp.blockedReasons) ? bp.blockedReasons : [];
    var aReasons = Array.isArray(ap.blockedReasons) ? ap.blockedReasons : [];
    if (!deepEqual(bReasons, aReasons)) {
      if (!bReasons.length && aReasons.length) {
        return 'Cause de blocage : ' + quoteText(aReasons[0], quoteMax);
      }
      if (bReasons.length && !aReasons.length) {
        return 'Causes de blocage effac\u00e9es';
      }
      if (aReasons.length) {
        return 'Cause de blocage : ' + quoteText(aReasons.join(', '), quoteMax);
      }
    }
    if (!deepEqual(bp.blockedLinks, ap.blockedLinks)) {
      return 'Lien de blocage modifi\u00e9';
    }
    return '';
  }

  /**
   * Collect human-readable change lines.
   * @param {object} [options]
   * @param {boolean} [options.detail] — full text, no truncation
   */
  function collectChangeParts(before, after, domains, options) {
    options = options || {};
    var detail = !!options.detail;
    var quoteMax = detail ? 0 : 36;
    var titleMax = detail ? 0 : 28;
    var parts = [];
    var d = domains || [];

    if (d.indexOf('priority') !== -1) {
      var bp = (before && before.priority) || {};
      var ap = (after && after.priority) || {};
      ['urgency', 'impact', 'ease'].forEach(function (axis) {
        if (bp[axis] !== ap[axis]) {
          var feminine = axis === 'urgency' || axis === 'ease';
          parts.push(
            axisLabel(axis) +
              ' pass\u00e9' +
              (feminine ? 'e' : '') +
              ' de ' +
              bp[axis] +
              ' \u00e0 ' +
              ap[axis]
          );
        }
      });
      if (!!bp.enAttente !== !!ap.enAttente) {
        parts.push(ap.enAttente ? 'Bloqu\u00e9 activ\u00e9' : 'Bloqu\u00e9 d\u00e9sactiv\u00e9');
      }
      if (bp.dueDate !== ap.dueDate || bp.dueTime !== ap.dueTime) {
        parts.push(
          describeDueChange(bp.dueDate, bp.dueTime, ap.dueDate, ap.dueTime)
        );
      }
      var startLabel = describeStartChange(bp.startDate, ap.startDate);
      if (startLabel) parts.push(startLabel);
      var recurLabel = describeRecurrenceChange(bp.recurrence, ap.recurrence);
      if (recurLabel) parts.push(recurLabel);
      var blockedLabel = describeBlocked(bp, ap, detail ? 0 : 40);
      if (blockedLabel) parts.push(blockedLabel);
      if (bp.estimatedDurationMinutes !== ap.estimatedDurationMinutes) {
        parts.push(
          'Dur\u00e9e : ' +
            formatMinutesFr(bp.estimatedDurationMinutes) +
            ' \u2192 ' +
            formatMinutesFr(ap.estimatedDurationMinutes)
        );
      }
      if (!parts.length) parts.push('Priorit\u00e9');
    }

    if (d.indexOf('completion') !== -1) {
      parts = parts.concat(
        describeCompletion(
          (before && before.completion) || {},
          (after && after.completion) || {},
          quoteMax
        )
      );
    }

    if (d.indexOf('statut') !== -1) {
      var bs = (before && before.statut) || {};
      var as_ = (after && after.statut) || {};
      if (String(bs.listId || '') !== String(as_.listId || '')) {
        var fromList = bs.listName || 'liste inconnue';
        var toList = as_.listName || 'liste inconnue';
        parts.push('D\u00e9plac\u00e9e de ' + fromList + ' vers ' + toList);
      }
      if (!!bs.dueComplete !== !!as_.dueComplete) {
        parts.push(
          as_.dueComplete ? 'Carte marqu\u00e9e termin\u00e9e' : 'Carte rouverte'
        );
      }
      if (
        String(bs.listId || '') === String(as_.listId || '') &&
        !!bs.dueComplete === !!as_.dueComplete
      ) {
        parts.push('Statut modifi\u00e9');
      }
    }

    if (d.indexOf('info') !== -1) {
      var bInfo = (before && before.info) || {};
      var aInfo = (after && after.info) || {};
      if (bInfo.name !== aInfo.name) {
        parts.push(
          'Titre : ' +
            quoteText(bInfo.name, titleMax) +
            ' \u2192 ' +
            quoteText(aInfo.name, titleMax)
        );
      }
      if (bInfo.desc !== aInfo.desc) {
        var bDesc = fullText(bInfo.desc);
        var aDesc = fullText(aInfo.desc);
        if (detail) {
          if (!bDesc && aDesc) {
            parts.push('Description ajout\u00e9e');
            parts.push('Apr\u00e8s : ' + aDesc);
          } else if (bDesc && !aDesc) {
            parts.push('Description effac\u00e9e');
            parts.push('Avant : ' + bDesc);
          } else {
            parts.push('Description modifi\u00e9e');
            parts.push('Avant : ' + bDesc);
            parts.push('Apr\u00e8s : ' + aDesc);
          }
        } else if (!bDesc && aDesc) {
          parts.push('Description ajout\u00e9e : ' + quoteText(aDesc, 40));
        } else if (bDesc && !aDesc) {
          parts.push('Description effac\u00e9e');
        } else {
          parts.push(
            'Description : ' +
              quoteText(bDesc, 24) +
              ' \u2192 ' +
              quoteText(aDesc, 24)
          );
        }
      }
      if (!deepEqual(bInfo.memberIds, aInfo.memberIds)) {
        var mem = idDiffLabels(
          bInfo.memberIds,
          aInfo.memberIds,
          bInfo.members,
          aInfo.members
        );
        mem.added.forEach(function (n) {
          parts.push('Membre ajout\u00e9 : ' + n);
        });
        mem.removed.forEach(function (n) {
          parts.push('Membre retir\u00e9 : ' + n);
        });
        if (!mem.added.length && !mem.removed.length) {
          parts.push('Membres modifi\u00e9s');
        }
      }
      if (!deepEqual(bInfo.labelIds, aInfo.labelIds)) {
        var lab = idDiffLabels(
          bInfo.labelIds,
          aInfo.labelIds,
          bInfo.labels,
          aInfo.labels
        );
        lab.added.forEach(function (n) {
          parts.push('\u00c9tiquette ajout\u00e9e : ' + quoteText(n, titleMax || 28));
        });
        lab.removed.forEach(function (n) {
          parts.push('\u00c9tiquette retir\u00e9e : ' + quoteText(n, titleMax || 28));
        });
        if (!lab.added.length && !lab.removed.length) {
          parts.push('\u00c9tiquettes modifi\u00e9es');
        }
      }
      if (!parts.length) parts.push('Détails');
    }

    if (d.indexOf('goals') !== -1) {
      var bg = (before && before.goals) || {};
      var ag = (after && after.goals) || {};
      var fromProj = bg.projectName || (bg.projectId ? 'projet' : 'aucun');
      var toProj = ag.projectName || (ag.projectId ? 'projet' : 'aucun');
      if (!bg.projectId && ag.projectId) {
        parts.push('Projet li\u00e9 : ' + toProj);
      } else if (bg.projectId && !ag.projectId) {
        parts.push('Projet d\u00e9li\u00e9 : ' + fromProj);
      } else {
        parts.push('Projet : ' + fromProj + ' \u2192 ' + toProj);
      }
    }

    return parts;
  }

  function buildLabel(before, after, domains, hint) {
    var parts = collectChangeParts(before, after, domains, { detail: false });
    if (!parts.length) {
      if (typeof hint === 'string' && hint.trim()) return hint.trim().slice(0, LABEL_MAX);
      return 'Modification';
    }
    return parts.slice(0, 2).join(' · ').slice(0, LABEL_MAX);
  }

  function formatAbsoluteTime(iso) {
    if (!iso) return '';
    var then = Date.parse(iso);
    if (!isFinite(then)) return String(iso);
    try {
      return new Date(then).toLocaleString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return String(iso);
    }
  }

  var DOMAIN_LABELS = {
    priority: 'Priorit\u00e9',
    completion: 'Progr\u00e8s',
    statut: 'Statut',
    info: 'Détails',
    goals: 'Objectifs'
  };

  function describeEntry(entry) {
    if (!entry) return null;
    var domains = Array.isArray(entry.domains)
      ? entry.domains
      : changedDomains(entry.before, entry.after);
    var lines = collectChangeParts(entry.before, entry.after, domains, {
      detail: true
    });
    if (!lines.length) lines = [entry.label || 'Modification'];
    return {
      id: entry.id,
      at: entry.at,
      absoluteTime: formatAbsoluteTime(entry.at),
      label: entry.label || '',
      domains: domains.slice(),
      domainLabels: domains.map(function (key) {
        return DOMAIN_LABELS[key] || key;
      }),
      lines: lines
    };
  }

  function create(options) {
    options = options || {};
    var t = options.t;
    var onChange = typeof options.onChange === 'function' ? options.onChange : function () {};
    var store = emptyStore();
    var muteDepth = 0;
    var saveChain = Promise.resolve();

    function isMuted() {
      return muteDepth > 0;
    }

    function beginMute() {
      muteDepth += 1;
    }

    function endMute() {
      muteDepth = Math.max(0, muteDepth - 1);
    }

    function notify() {
      try {
        onChange(listEntries(), {
          canUndo: canUndo(),
          canRedo: canRedo()
        });
      } catch (e) {
        /* ignore */
      }
    }

    function persist() {
      store = trimStore(store);
      if (!t || typeof t.set !== 'function') return Promise.resolve(store);
      saveChain = saveChain
        .then(function () {
          // Reserve room for other card/private keys (chat, etc.): 4096 shared.
          if (typeof t.get !== 'function') {
            return t.set('card', 'private', HISTORY_KEY, store);
          }
          return Promise.resolve(t.get('card', 'private'))
            .then(function (all) {
              var bag = all && typeof all === 'object' ? all : {};
              var others = {};
              Object.keys(bag).forEach(function (key) {
                if (key !== HISTORY_KEY) others[key] = bag[key];
              });
              var otherSize = 0;
              try {
                otherSize = JSON.stringify(others).length;
              } catch (e) {
                otherSize = 0;
              }
              var room = Math.max(
                350,
                PLUGIN_PRIVATE_BUDGET - otherSize - HISTORY_KEY.length - 24
              );
              store = trimStoreToBudget(store, Math.min(MAX_SERIALIZED, room));
              return t.set('card', 'private', HISTORY_KEY, store);
            })
            .catch(function () {
              store = trimStore(store);
              return t.set('card', 'private', HISTORY_KEY, store);
            });
        })
        .catch(function (err) {
          console.error('CardHistory.save failed', err);
          // Drop entries until empty — card/private is shared with chat.
          while (store.entries.length > 0) {
            store.entries.shift();
            store.cursor = Math.max(0, store.cursor - 1);
            store = trimStoreToBudget(store, Math.floor(MAX_SERIALIZED * 0.5));
            if (serializedSize(store) <= 400) break;
          }
          if (!store.entries.length) {
            store = emptyStore();
          }
          return t.set('card', 'private', HISTORY_KEY, store).catch(function (retryErr) {
            console.error('CardHistory.save retry failed', retryErr);
            // Last resort: leave empty in memory so we stop thrashing.
            store = emptyStore();
          });
        });
      return saveChain;
    }

    function load() {
      if (!t || typeof t.get !== 'function') {
        store = emptyStore();
        return Promise.resolve(store);
      }
      return t
        .get('card', 'private', HISTORY_KEY)
        .then(function (raw) {
          store = trimStore(normalizeStore(raw));
          notify();
          // Rewrite slimmed history so an oversized legacy blob frees card/private room.
          if (raw != null) {
            persist();
          }
          return store;
        })
        .catch(function (err) {
          console.error('CardHistory.load failed', err);
          store = emptyStore();
          persist();
          return store;
        });
    }

    function record(before, after, hint) {
      if (isMuted()) return null;
      var domains = changedDomains(before, after);
      if (!domains.length) return null;

      var entry = {
        id: makeId(),
        at: new Date().toISOString(),
        label: buildLabel(before, after, domains, hint),
        domains: domains,
        before: pickDomains(before, domains),
        after: pickDomains(after, domains)
      };

      store.entries = store.entries.slice(0, store.cursor);
      store.entries.push(entry);
      store.cursor = store.entries.length;
      store = trimStore(store);
      persist();
      notify();
      return entry;
    }

    function listEntries() {
      // Newest first for UI; only applied entries up to cursor.
      var applied = store.entries.slice(0, store.cursor);
      return applied
        .slice()
        .reverse()
        .map(function (e) {
          var details = describeEntry(e);
          var domains = Array.isArray(e.domains)
            ? e.domains
            : changedDomains(e.before, e.after);
          // Rebuild so relative day words (demain, hier…) stay current.
          var liveLabel = buildLabel(e.before, e.after, domains, e.label);
          return {
            id: e.id,
            at: e.at,
            label: liveLabel || e.label,
            domains: domains.slice(),
            details: details
          };
        });
    }

    function getEntry(entryId) {
      if (!entryId) return null;
      for (var i = 0; i < store.cursor; i++) {
        var e = store.entries[i];
        if (e && e.id === entryId) {
          var copied = clone(e);
          return copied != null ? copied : e;
        }
      }
      return null;
    }

    function getEntryDetails(entryId) {
      var entry = getEntry(entryId);
      if (!entry) return null;
      return describeEntry(entry) || {
        id: entryId,
        at: entry.at || '',
        absoluteTime: formatAbsoluteTime(entry.at),
        label: entry.label || 'Modification',
        domains: entry.domains || [],
        domainLabels: (entry.domains || []).map(function (key) {
          return DOMAIN_LABELS[key] || key;
        }),
        lines: entry.label ? [entry.label] : ['Modification']
      };
    }

    function canUndo() {
      return store.cursor > 0;
    }

    function canRedo() {
      return store.cursor < store.entries.length;
    }

    function undo(applySnapshot) {
      if (!canUndo()) return Promise.resolve(null);
      var entry = store.entries[store.cursor - 1];
      if (!entry) return Promise.resolve(null);
      beginMute();
      var applyFn =
        typeof applySnapshot === 'function' ? applySnapshot : function () {};
      return Promise.resolve()
        .then(function () {
          return applyFn(clone(entry.before));
        })
        .then(function () {
          store.cursor -= 1;
          return persist();
        })
        .then(function () {
          notify();
          return clone(entry.before);
        })
        .finally(function () {
          endMute();
        });
    }

    function redo(applySnapshot) {
      if (!canRedo()) return Promise.resolve(null);
      var entry = store.entries[store.cursor];
      if (!entry) return Promise.resolve(null);
      beginMute();
      var applyFn =
        typeof applySnapshot === 'function' ? applySnapshot : function () {};
      return Promise.resolve()
        .then(function () {
          return applyFn(clone(entry.after));
        })
        .then(function () {
          store.cursor += 1;
          return persist();
        })
        .then(function () {
          notify();
          return clone(entry.after);
        })
        .finally(function () {
          endMute();
        });
    }

    function revertTo(entryId, applySnapshot) {
      var idx = -1;
      for (var i = 0; i < store.cursor; i++) {
        if (store.entries[i] && store.entries[i].id === entryId) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return Promise.resolve(null);
      var entry = store.entries[idx];
      beginMute();
      var applyFn =
        typeof applySnapshot === 'function' ? applySnapshot : function () {};
      return Promise.resolve()
        .then(function () {
          return applyFn(clone(entry.before));
        })
        .then(function () {
          store.entries = store.entries.slice(0, idx);
          store.cursor = idx;
          return persist();
        })
        .then(function () {
          notify();
          return clone(entry.before);
        })
        .finally(function () {
          endMute();
        });
    }

    return {
      HISTORY_KEY: HISTORY_KEY,
      load: load,
      record: record,
      undo: undo,
      redo: redo,
      revertTo: revertTo,
      list: listEntries,
      getEntry: getEntry,
      getEntryDetails: getEntryDetails,
      canUndo: canUndo,
      canRedo: canRedo,
      beginMute: beginMute,
      endMute: endMute,
      isMuted: isMuted,
      changedDomains: changedDomains,
      buildLabel: buildLabel,
      describeEntry: describeEntry
    };
  }

  global.CardHistory = {
    HISTORY_KEY: HISTORY_KEY,
    create: create,
    changedDomains: changedDomains,
    buildLabel: buildLabel,
    describeEntry: describeEntry,
    collectChangeParts: collectChangeParts,
    describeDueChange: describeDueChange,
    deepEqual: deepEqual,
    clone: clone
  };
})(typeof window !== 'undefined' ? window : this);
