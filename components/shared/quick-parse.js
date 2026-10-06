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

  var api = { parse: parse };
  global.QuickParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
