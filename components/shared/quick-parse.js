/*
 * Quick capture: pulls a due date out of a card title typed in a composer.
 *   "Appeler le plombier demain"        -> { name: 'Appeler le plombier', dueDate: '2026-10-07' }
 *   "Rapport vendredi"                  -> next Friday (a weekday that is today means today)
 *   "Facture dans 3 jours" / "dans 2 semaines" / "le 15 octobre" / "2026-11-02"
 * Only a trailing expression is taken, and never when it would leave an empty title.
 */
(function (global) {
  'use strict';

  var DAYS = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 };
  var MONTHS = {
    janvier: 0, 'février': 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
    juillet: 6, 'août': 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, 'décembre': 11, decembre: 11,
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; }

  /** Each rule: regex anchored at the end of the title -> Date (or null to refuse). */
  function rules(today) {
    return [
      [/\s+(?:pour\s+)?(?:le\s+)?(\d{4})-(\d{2})-(\d{2})$/i, function (m) { return new Date(+m[1], +m[2] - 1, +m[3]); }],
      [/\s+(?:pour\s+)?apr[èe]s[- ]demain$/i, function () { return addDays(today, 2); }],
      [/\s+(?:pour\s+)?demain$/i, function () { return addDays(today, 1); }],
      [/\s+(?:pour\s+)?aujourd['’]hui$/i, function () { return today; }],
      [/\s+dans\s+(\d{1,3})\s+(jours?|semaines?|mois)$/i, function (m) {
        var n = +m[1];
        var u = m[2].toLowerCase();
        if (u.indexOf('mois') === 0) return new Date(today.getFullYear(), today.getMonth() + n, today.getDate());
        return addDays(today, u.indexOf('semaine') === 0 ? n * 7 : n);
      }],
      [/\s+(?:pour\s+)?(?:le\s+|ce\s+)?(1er|\d{1,2})\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)$/i, function (m) {
        var day = m[1].toLowerCase() === '1er' ? 1 : +m[1];
        var d = new Date(today.getFullYear(), MONTHS[m[2].toLowerCase()], day);
        if (d.getDate() !== day) return null;
        if (d < today) d = new Date(today.getFullYear() + 1, d.getMonth(), day);
        return d;
      }],
      [/\s+(?:pour\s+)?(?:(?:ce|le)\s+)?(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)(?:\s+prochain)?$/i, function (m, full) {
        var target = DAYS[m[1].toLowerCase()];
        var diff = (target - today.getDay() + 7) % 7;
        if (diff === 0 && /prochain$/i.test(full)) diff = 7;
        return addDays(today, diff);
      }],
    ];
  }

  function parse(text, now) {
    var name = String(text == null ? '' : text).trim();
    var base = now instanceof Date ? now : new Date();
    var today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    var rs = rules(today);
    for (var i = 0; i < rs.length; i++) {
      var m = rs[i][0].exec(name);
      if (!m) continue;
      var rest = name.slice(0, m.index).trim();
      if (!rest) continue;
      var d = rs[i][1](m, m[0]);
      if (!d || isNaN(d.getTime())) continue;
      return { name: rest, dueDate: iso(d) };
    }
    return { name: name, dueDate: '' };
  }

  /* ── parseWhen: a date said in words, past or future, with how precise it is ───────────────
   * "15 octobre 2023" -> jour | "octobre 2023" -> mois | "2022", "l'an dernier" -> année |
   * "il y a 2 ans", "il y a quelques années", "cet été" -> approx (a best guess, shown as "vers 2024").
   * Returns { iso, precision: 'jour'|'mois'|'année'|'approx', label } or null. */
  var MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MONTH_RE = 'janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre';
  var SEASONS = { printemps: 2, 'été': 5, ete: 5, automne: 8, hiver: 11 };
  var NUMBER_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };

  function pretty(d, precision) {
    if (precision === 'jour') return d.getDate() + (d.getDate() === 1 ? 'er ' : ' ') + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
    if (precision === 'mois') return MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
    if (precision === 'année') return String(d.getFullYear());
    return 'vers ' + d.getFullYear();
  }

  function whenResult(d, precision) {
    if (!d || isNaN(d.getTime())) return null;
    return { iso: iso(d), precision: precision, label: pretty(d, precision) };
  }

  function parseWhen(text, now) {
    var s = String(text == null ? '' : text).trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ');
    if (!s) return null;
    var base = now instanceof Date ? now : new Date();
    var today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    var y = today.getFullYear();
    var m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
      var d0 = new Date(+m[1], +m[2] - 1, +m[3]);
      return d0.getDate() === +m[3] ? whenResult(d0, 'jour') : null;
    }
    if ((m = /^(\d{4})-(\d{2})$/.exec(s))) return +m[2] >= 1 && +m[2] <= 12 ? whenResult(new Date(+m[1], +m[2] - 1, 1), 'mois') : null;
    if (/^aujourd'hui$/.test(s)) return whenResult(today, 'jour');
    if (/^hier$/.test(s)) return whenResult(addDays(today, -1), 'jour');
    if (/^avant-hier$/.test(s)) return whenResult(addDays(today, -2), 'jour');
    if (/^demain$/.test(s)) return whenResult(addDays(today, 1), 'jour');
    if (/^(?:cette ann[ée]e|en ce moment)$/.test(s)) return whenResult(new Date(y, 0, 1), 'année');
    if (/^(?:l'an(?:n[ée]e)? (?:dernier|pass[ée]e?)|l'ann[ée]e (?:derni[èe]re|pass[ée]e))$/.test(s)) return whenResult(new Date(y - 1, 0, 1), 'année');
    if (/^(?:le mois dernier)$/.test(s)) return whenResult(new Date(y, today.getMonth() - 1, 1), 'mois');
    if (/^(?:ce mois-ci|ce mois)$/.test(s)) return whenResult(new Date(y, today.getMonth(), 1), 'mois');
    if (/^(?:la semaine derni[èe]re)$/.test(s)) return whenResult(addDays(today, -7), 'approx');
    if ((m = /^(?:cet|cette|l'|le |la )?\s*(printemps|[ée]t[ée]|automne|hiver)(?: derni(?:er|[èe]re))?$/.exec(s))) {
      var sm = SEASONS[m[1]];
      var yr = new Date(y, sm, 1) > today ? y - 1 : y;
      if (/derni/.test(s) && yr === y) yr = y - 1;
      return whenResult(new Date(yr, sm, 1), 'approx');
    }
    if ((m = /^il y a (quelques|\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix) (jours?|semaines?|mois|ans?|ann[ée]es?)$/.exec(s))) {
      var n = m[1] === 'quelques' ? 3 : /^\d/.test(m[1]) ? +m[1] : NUMBER_WORDS[m[1]];
      var u = m[2];
      var d1;
      if (u.indexOf('jour') === 0) d1 = addDays(today, -n);
      else if (u.indexOf('semaine') === 0) d1 = addDays(today, -7 * n);
      else if (u === 'mois') d1 = new Date(y, today.getMonth() - n, today.getDate());
      else d1 = new Date(y - n, today.getMonth(), today.getDate());
      var exact = m[1] !== 'quelques' && (u.indexOf('jour') === 0);
      return whenResult(d1, exact ? 'jour' : 'approx');
    }
    if ((m = /^(?:le |en )?(1er|\d{1,2}) (janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)(?: (\d{4}))?$/.exec(s))) {
      var day = m[1] === '1er' ? 1 : +m[1];
      var mo = MONTHS[m[2]];
      var year = m[3] ? +m[3] : y;
      var d2 = new Date(year, mo, day);
      if (d2.getDate() !== day) return null;
      if (!m[3] && d2 > today) d2 = new Date(y - 1, mo, day); // a date said without year is the last one that happened
      return whenResult(d2, 'jour');
    }
    if ((m = new RegExp('^(?:en |au mois de |fin |début |debut )?(' + MONTH_RE + ')(?: (\\d{4}))?$').exec(s))) {
      var mo2 = MONTHS[m[1]];
      var yr2 = m[2] ? +m[2] : new Date(y, mo2, 1) > today ? y - 1 : y;
      return whenResult(new Date(yr2, mo2, 1), 'mois');
    }
    if ((m = /^(?:en |vers |autour de |depuis )?(\d{4})$/.exec(s))) {
      var yr3 = +m[1];
      return yr3 >= 1900 && yr3 <= y + 1 ? whenResult(new Date(yr3, 0, 1), /^(?:vers|autour)/.test(s) ? 'approx' : 'année') : null;
    }
    return null;
  }

  var api = { parse: parse, parseWhen: parseWhen };
  global.QuickParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
