/*
 * Role: card timers ("Minuteur"). One timer per card, stored board-level in Trello plugin data so it
 * follows the user across devices, fired in the open tab (chime, Notification, toast) and, when no tab
 * handled it, by the Worker's minute cron (email).
 *
 *   Timers.parseDuration('2 h 30')            → minutes (number) or null
 *   Timers.formatRemaining(ms)                → '12 min', '2 h 05', '45 s'
 *   Timers.list(t) / set(t, card, minutes, label) / cancel(t, cardId) → Promise
 *   Timers.start(t, { onFire(timer), onChange(list) })  → stop()   (1 s ticker, fires each timer once)
 *   Timers.menuItem(ctx)                      → context-menu item opening the popover (ctx: t, cardId, cardName, anchor)
 *
 * Pure helpers (parseDuration, formatRemaining, dueTimers, upsert, without) are exported for unit tests.
 */
(function (global) {
  'use strict';

  var KEY = 'cardTimers';
  var MAX_MINUTES = 60 * 24 * 30;
  var UNIT = { s: 1 / 60, sec: 1 / 60, m: 1, min: 1, mn: 1, h: 60, hr: 60, j: 1440, d: 1440 };

  /** "2 h 30", "45 min", "1h", "90", "1 j", "1,5 h" → minutes. A bare number is minutes. */
  function parseDuration(text) {
    var s = String(text == null ? '' : text).toLowerCase().replace(/,/g, '.').replace(/\b(heures?|minutes?|jours?|secondes?)\b/g, function (w) {
      return { h: 'h', m: 'min', j: 'j', s: 's' }[w.charAt(0)];
    }).trim();
    if (!s) return null;
    var hm = s.match(/^(\d+):(\d{1,2})$/);
    if (hm) return clamp(Number(hm[1]) * 60 + Number(hm[2]));
    if (/^\d+(\.\d+)?$/.test(s)) return clamp(Number(s));
    var re = /(\d+(?:\.\d+)?)\s*(sec|min|mn|hr|[smhjd])(?![a-z])\s*/g;
    var total = 0;
    var used = 0;
    var m;
    while ((m = re.exec(s))) {
      total += Number(m[1]) * UNIT[m[2]];
      used += m[0].length;
    }
    // "2 h 30": a trailing bare number continues in the next smaller unit.
    var tail = s.slice(used).trim().match(/^(\d+)$/);
    if (tail && used) {
      if (/h(r)?\s*$/.test(s.slice(0, used).trim())) total += Number(tail[1]);
      else return null;
      used = s.length;
    }
    if (!used || s.slice(used).trim()) return null;
    return clamp(total);
  }

  function clamp(min) {
    if (!isFinite(min) || min <= 0) return null;
    return Math.min(MAX_MINUTES, Math.max(1 / 60, min));
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function formatRemaining(ms) {
    var sec = Math.max(0, Math.ceil(ms / 1000));
    if (sec < 90) return sec + ' s';
    var min = Math.ceil(sec / 60);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60);
    if (h < 24) return h + ' h ' + pad(min % 60);
    var d = Math.floor(h / 24);
    return d + ' j' + (h % 24 ? ' ' + (h % 24) + ' h' : '');
  }

  function norm(raw) {
    var map = raw && typeof raw === 'object' ? raw : {};
    var out = {};
    Object.keys(map).forEach(function (id) {
      var x = map[id];
      if (x && x.endsAt && !isNaN(Date.parse(x.endsAt))) out[id] = x;
    });
    return out;
  }

  /** Timers whose end has passed and that nobody announced yet. */
  function dueTimers(map, now) {
    return Object.keys(map || {}).map(function (id) { return map[id]; }).filter(function (x) {
      return !x.firedAt && Date.parse(x.endsAt) <= now;
    });
  }

  function upsert(map, timer) {
    var out = Object.assign({}, map);
    out[timer.cardId] = timer;
    return out;
  }

  function without(map, cardId) {
    var out = Object.assign({}, map);
    delete out[cardId];
    return out;
  }

  /* ── Storage ─────────────────────────────────────────────────────── */

  var cache = {};
  var cacheSig = '';

  /** Running timer of a card from the last read (no I/O), for the chips views draw. */
  function running(cardId) {
    var x = cache[cardId];
    return x && !x.firedAt ? x : null;
  }

  /** "14 h 30", "demain 14 h 30", or "3/11 14 h 30". */
  function endLabel(timer) {
    var d = new Date(timer.endsAt);
    var hm = d.getHours() + ' h ' + pad(d.getMinutes());
    var n = new Date();
    var days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
    if (days === 1) return 'demain ' + hm;
    if (days > 1) return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + hm;
    return hm;
  }

  function remember(map) {
    cache = map;
    var sig = Object.keys(map).sort().map(function (k) { return map[k].id + (map[k].firedAt ? '!' : ''); }).join('|');
    if (sig !== cacheSig) {
      var initial = cacheSig === '' && sig === '';
      cacheSig = sig;
      if (!initial && global.dispatchEvent && typeof global.CustomEvent === 'function') global.dispatchEvent(new CustomEvent('timers-changed'));
    }
    return map;
  }

  function load(t) {
    return Promise.resolve(t.get('board', 'shared', KEY)).then(norm).then(remember);
  }

  function save(t, map) {
    return Promise.resolve(t.set('board', 'shared', KEY, map)).then(function () { return remember(map); });
  }

  function list(t) {
    return load(t).then(function (map) {
      return Object.keys(map).map(function (id) { return map[id]; }).sort(function (a, b) {
        return Date.parse(a.endsAt) - Date.parse(b.endsAt);
      });
    });
  }

  function set(t, card, minutes, label) {
    var ms = Math.round(minutes * 60000);
    return load(t).then(function (map) {
      var timer = {
        id: card.id + ':' + Date.now(),
        cardId: card.id,
        title: card.name || '',
        endsAt: new Date(Date.now() + ms).toISOString(),
        label: label || '',
      };
      return save(t, upsert(map, timer)).then(function () { return timer; });
    });
  }

  function cancel(t, cardId) {
    return load(t).then(function (map) {
      if (!map[cardId]) return map;
      return save(t, without(map, cardId));
    });
  }

  function markFired(t, id) {
    return load(t).then(function (map) {
      var key = Object.keys(map).filter(function (k) { return map[k].id === id; })[0];
      if (!key) return map;
      var next = Object.assign({}, map);
      next[key] = Object.assign({}, map[key], { firedAt: new Date().toISOString() });
      return save(t, next);
    });
  }

  /* ── Announcing ──────────────────────────────────────────────────── */

  var announced = {};

  function announce(timer) {
    if (announced[timer.id]) return;
    announced[timer.id] = true;
    var AG = global.AgentGuides;
    if (AG && typeof AG.chime === 'function') AG.chime(true);
    if (!global.Notification) return;
    var title = 'Minuteur terminé : ' + (timer.title || 'carte');
    try {
      if (Notification.permission === 'granted') new Notification(title, { body: timer.label || '' });
    } catch (err) { /* blocked */ }
  }

  function askPermission() {
    try {
      if (global.Notification && Notification.permission === 'default' && Notification.requestPermission) Notification.requestPermission();
    } catch (err) { /* ignore */ }
  }

  /**
   * Checks every second and on tab focus; announces each due timer once, then marks it fired.
   * onFire(timer) lets the host show a toast; onChange(list) runs after each store change.
   */
  function start(t, hooks) {
    hooks = hooks || {};
    var busy = false;
    function tick() {
      if (busy) return;
      busy = true;
      load(t).then(function (map) {
        var due = dueTimers(map, Date.now());
        if (!due.length) return null;
        due.forEach(function (x) {
          announce(x);
          if (typeof hooks.onFire === 'function') hooks.onFire(x);
        });
        return Promise.all(due.map(function (x) { return markFired(t, x.id); })).then(function () {
          if (typeof hooks.onChange === 'function') return list(t).then(hooks.onChange);
          return null;
        });
      }).then(function () { busy = false; }, function () { busy = false; });
    }
    var iv = setInterval(tick, 5000);
    var onVis = function () { if (!document.hidden) tick(); };
    if (global.document && document.addEventListener) document.addEventListener('visibilitychange', onVis);
    tick();
    return function stop() {
      clearInterval(iv);
      if (global.document && document.removeEventListener) document.removeEventListener('visibilitychange', onVis);
    };
  }

  function toast(timer, t) {
    if (!global.document || !document.body) return;
    var n = document.createElement('div');
    n.className = 'tm-toast';
    n.setAttribute('role', 'status');
    n.textContent = 'Minuteur terminé : ' + (timer.title || 'carte');
    n.addEventListener('click', function () {
      try { if (t && t.showCard) t.showCard(timer.cardId); } catch (err) { /* not in Trello */ }
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    document.body.appendChild(n);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 15000);
  }

  var running = false;

  /** Starts the ticker once per page, with a built-in toast. Safe to call from every view. */
  function ensure(t) {
    if (running || !t || typeof t.get !== 'function') return;
    running = true;
    start(t, { onFire: function (x) { toast(x, t); } });
  }

  /** Menu item shared by every view; the popover itself is CardFields kind 'timer'. */
  function menuItem(ctx) {
    return {
      icon: 'alarm',
      label: 'Minuteur…',
      action: function () {
        if (global.CardFields) global.CardFields.open('timer', ctx);
      },
    };
  }

  global.Timers = {
    KEY: KEY,
    PRESETS: [['10 min', 10], ['30 min', 30], ['1 h', 60], ['2 h', 120], ['1 j', 1440]],
    parseDuration: parseDuration,
    formatRemaining: formatRemaining,
    dueTimers: dueTimers,
    upsert: upsert,
    without: without,
    list: list,
    running: running,
    endLabel: endLabel,
    set: set,
    cancel: cancel,
    start: start,
    ensure: ensure,
    askPermission: askPermission,
    menuItem: menuItem,
  };
})(typeof window !== 'undefined' ? window : this);
