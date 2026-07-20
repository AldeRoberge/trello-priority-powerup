/* Build Outlook-compatible .ics calendar from Gantt/Trello cards (no Entra). */
(function (global) {
  'use strict';

  function sync() {
    return global.OutlookSync || null;
  }

  function brandName() {
    var brand = global.PriorityBrand;
    if (brand && typeof brand.getAppName === 'function') {
      return brand.getAppName() || 'Trello Cerveau';
    }
    return (brand && brand.appName) || 'Trello Cerveau';
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** Escape text for ICS TEXT values (RFC 5545). */
  function escapeText(value) {
    return String(value == null ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n/g, '\\n')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\n');
  }

  function isoDateToIcsDate(isoDate) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
    if (!m) return '';
    return m[1] + m[2] + m[3];
  }

  function isoDateTimeToIcsLocal(isoDate, hhmm) {
    var date = isoDateToIcsDate(isoDate);
    if (!date) return '';
    var t = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
    if (!t) return date;
    return date + 'T' + t[1] + t[2] + '00';
  }

  function utcStampNow() {
    var d = new Date();
    return (
      d.getUTCFullYear() +
      pad2(d.getUTCMonth() + 1) +
      pad2(d.getUTCDate()) +
      'T' +
      pad2(d.getUTCHours()) +
      pad2(d.getUTCMinutes()) +
      pad2(d.getUTCSeconds()) +
      'Z'
    );
  }

  function addDaysIso(isoDate, days) {
    var s = sync();
    if (s && typeof s.addDaysIso === 'function') {
      return s.addDaysIso(isoDate, days);
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
    if (!m) return '';
    var dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    dt.setDate(dt.getDate() + (Number(days) || 0));
    return (
      dt.getFullYear() +
      '-' +
      pad2(dt.getMonth() + 1) +
      '-' +
      pad2(dt.getDate())
    );
  }

  function cardUid(cardId) {
    var id = String(cardId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
    return 'trello-card-' + id + '@trello-cerveau';
  }

  /**
   * Build one VEVENT from a card-like object (id, name, desc, dates).
   * Returns null if undated.
   */
  function buildVEvent(card, stamp) {
    var s = sync();
    var snap =
      s && typeof s.snapshotFromCard === 'function'
        ? s.snapshotFromCard(card)
        : {
            name: (card && card.name) || '',
            desc: (card && card.desc) || '',
            startDate: (card && card.startDate) || '',
            dueDate: (card && card.dueDate) || '',
            dueTime: (card && card.dueTime) || '',
          };

    var startDate = snap.startDate || snap.dueDate;
    var dueDate = snap.dueDate || snap.startDate;
    if (!startDate || !dueDate) return null;

    var lines = [];
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + cardUid(card && card.id));
    lines.push('DTSTAMP:' + (stamp || utcStampNow()));

    if (snap.dueTime) {
      var startTime = '09:00';
      if (startDate === dueDate && snap.dueTime <= startTime) {
        startTime = '08:00';
      }
      lines.push(
        'DTSTART:' + isoDateTimeToIcsLocal(startDate, startTime)
      );
      lines.push('DTEND:' + isoDateTimeToIcsLocal(dueDate, snap.dueTime));
    } else {
      var endExclusive = addDaysIso(dueDate, 1);
      lines.push('DTSTART;VALUE=DATE:' + isoDateToIcsDate(startDate));
      lines.push('DTEND;VALUE=DATE:' + isoDateToIcsDate(endExclusive));
    }

    lines.push('SUMMARY:' + escapeText(snap.name || '(Sans titre)'));
    if (snap.desc) {
      lines.push('DESCRIPTION:' + escapeText(snap.desc));
    }
    lines.push('END:VEVENT');
    return lines.join('\r\n');
  }

  /**
   * @param {Array} cards board card records from GanttTrello.loadBoard
   * @param {{ calName?: string }} [options]
   * @returns {{ ics: string, eventCount: number }}
   */
  function buildCalendar(cards, options) {
    options = options || {};
    var stamp = utcStampNow();
    var name = options.calName || brandName() + ' — Gantt';
    var events = [];
    var list = Array.isArray(cards) ? cards : [];

    for (var i = 0; i < list.length; i++) {
      var vevent = buildVEvent(list[i], stamp);
      if (vevent) events.push(vevent);
    }

    var body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//' + brandName() + '//Gantt ICS//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:' + escapeText(name),
    ]
      .concat(events)
      .concat(['END:VCALENDAR'])
      .join('\r\n');

    return { ics: body + '\r\n', eventCount: events.length };
  }

  function downloadIcs(icsText, filename) {
    var name =
      typeof filename === 'string' && filename
        ? filename
        : 'trello-gantt.ics';
    if (typeof document === 'undefined' || typeof Blob === 'undefined') {
      return { ok: false, reason: 'no-dom' };
    }
    var blob = new Blob([icsText], {
      type: 'text/calendar;charset=utf-8',
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        /* ignore */
      }
    }, 1000);
    return { ok: true, filename: name };
  }

  /**
   * Export dated cards from a board payload (or reload via GanttTrello).
   */
  async function exportBoard(t, options) {
    options = options || {};
    var gt = global.GanttTrello;
    var data =
      options.boardData ||
      (gt && typeof gt.loadBoard === 'function' ? await gt.loadBoard(t) : null);
    var cards = (data && data.cards) || options.cards || [];
    var built = buildCalendar(cards, {
      calName: options.calName,
    });
    if (!built.eventCount) {
      return { ok: false, reason: 'no-dated-cards', eventCount: 0 };
    }
    var file =
      options.filename ||
      'trello-gantt-' + utcStampNow().slice(0, 8) + '.ics';
    var dl = downloadIcs(built.ics, file);
    return Object.assign({ eventCount: built.eventCount, ics: built.ics }, dl);
  }

  global.OutlookIcs = {
    escapeText: escapeText,
    isoDateToIcsDate: isoDateToIcsDate,
    isoDateTimeToIcsLocal: isoDateTimeToIcsLocal,
    buildVEvent: buildVEvent,
    buildCalendar: buildCalendar,
    downloadIcs: downloadIcs,
    exportBoard: exportBoard,
    cardUid: cardUid,
  };
})(typeof window !== 'undefined' ? window : this);
