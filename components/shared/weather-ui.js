/*
 * Role: how the weather looks on the Aujourd'hui page.
 *  - icon(kind, isDay)   a hand-drawn SVG glyph (sun, moon, clouds, rain, snow, storm, fog)
 *  - sky(scene)          the animated background of the hero card (clouds, rain, snow, stars, lightning)
 *  - panel(live, opts)   current weather, a tip, the next hours and, on demand, the next days
 *  - placePicker(anchor) search a city and pick it
 * Data and wording come from Weather (weather.js). Styles: weather-ui.css (prefix wx-).
 * Exposes window.WeatherUI.
 */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var seq = 0;
  var openPicker = null;

  function W() {
    return global.Weather;
  }

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function icon(name, cls) {
    return h('i', { class: 'ti ti-' + name + (cls ? ' ' + cls : '') });
  }

  function r1(n) {
    return Math.round(n * 10) / 10;
  }

  /* ── Glyphs (viewBox 0 0 64 64) ────────────────────────────────── */

  function sunShape(cx, cy, s, uid) {
    var rays = '';
    for (var i = 0; i < 8; i++) {
      var a = (Math.PI / 4) * i;
      rays += '<line x1="' + r1(Math.cos(a) * 17) + '" y1="' + r1(Math.sin(a) * 17) + '" x2="' + r1(Math.cos(a) * 23) + '" y2="' + r1(Math.sin(a) * 23) + '"/>';
    }
    return '<g transform="translate(' + cx + ' ' + cy + ') scale(' + s + ')">' +
      '<g class="wx-rays" stroke="#ffc83d" stroke-width="3.4" stroke-linecap="round">' + rays + '</g>' +
      '<circle r="12" fill="url(#' + uid + 's)"/></g>';
  }

  function moonShape(x, y, s, uid) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')" class="wx-moon">' +
      '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="url(#' + uid + 'm)"/>' +
      '<circle cx="17.5" cy="6.5" r="0.9" fill="#fff8d6"/><circle cx="20.5" cy="9.6" r="0.6" fill="#fff8d6"/></g>';
  }

  function cloudShape(x, y, s, fill) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')" fill="' + fill + '">' +
      '<circle cx="22" cy="34" r="10"/><circle cx="34" cy="28" r="13"/><circle cx="46" cy="35" r="9"/>' +
      '<rect x="12" y="34" width="43" height="14" rx="7"/></g>';
  }

  function drops(xs, y, len, w) {
    return '<g class="wx-drops" stroke="#62b4ff" stroke-width="' + w + '" stroke-linecap="round">' +
      xs.map(function (x, i) {
        return '<line class="wx-d' + (i % 3) + '" x1="' + x + '" y1="' + y + '" x2="' + (x - len * 0.35) + '" y2="' + (y + len) + '"/>';
      }).join('') + '</g>';
  }

  function flakes(points) {
    return '<g class="wx-flakes" fill="#ffffff">' +
      points.map(function (p, i) {
        return '<circle class="wx-f' + (i % 3) + '" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (p[2] || 2.3) + '"/>';
      }).join('') + '</g>';
  }

  function glyphBody(kind, day, uid) {
    var white = 'url(#' + uid + 'c)';
    var grey = 'url(#' + uid + 'g)';
    var dark = 'url(#' + uid + 'k)';
    switch (kind) {
      case 'clear':
        return day ? sunShape(32, 32, 1.12, uid) : moonShape(10, 8, 2.1, uid);
      case 'partly':
        return (day ? sunShape(24, 24, 0.78, uid) : moonShape(6, 4, 1.4, uid)) + cloudShape(7, 10, 0.95, white);
      case 'cloudy':
        return cloudShape(-5, -3, 0.78, grey) + cloudShape(8, 9, 0.95, white);
      case 'fog':
        return cloudShape(3, -9, 0.92, white) +
          '<g class="wx-bars" stroke="#e3eaf3" stroke-width="3.2" stroke-linecap="round">' +
          '<line x1="14" y1="44" x2="46" y2="44"/><line x1="20" y1="51" x2="52" y2="51"/><line x1="14" y1="58" x2="40" y2="58"/></g>';
      case 'drizzle':
        return cloudShape(4, -8, 0.95, grey) + drops([24, 33, 42], 45, 7, 2.2);
      case 'rain':
        return cloudShape(4, -8, 0.95, grey) + drops([22, 31, 40, 49], 45, 10, 3);
      case 'sleet':
        return cloudShape(4, -8, 0.95, grey) + drops([24, 40], 45, 9, 2.8) + flakes([[32, 49, 2.3], [48, 53, 2.1]]);
      case 'snow':
        return cloudShape(4, -8, 0.95, white) + flakes([[22, 48], [33, 54], [44, 48], [27, 60, 1.8], [40, 61, 1.8]]);
      case 'storm':
        return cloudShape(4, -9, 0.95, dark) +
          '<path class="wx-bolt" d="M35 35 L25 50 H33 L29 62 L43 43 H35 L40 35 Z" fill="#ffd23f" stroke="#ffb703" stroke-width="1" stroke-linejoin="round"/>';
      default:
        return cloudShape(8, 6, 1, white);
    }
  }

  /**
   * SVG glyph for a kind of weather. `kind` comes from Weather.describe(...).kind.
   * Add class wx-anim to a parent to make the rays turn, the rain fall, the flakes drift.
   */
  function glyph(kind, isDay, size) {
    var uid = 'wx' + ++seq;
    var day = isDay !== false && isDay !== 0;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('class', 'wx-glyph wx-glyph--' + kind);
    svg.setAttribute('aria-hidden', 'true');
    if (size) {
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
    }
    svg.innerHTML =
      '<defs>' +
      '<radialGradient id="' + uid + 's" cx="40%" cy="36%" r="72%"><stop offset="0" stop-color="#fff2a8"/><stop offset=".55" stop-color="#ffcf4a"/><stop offset="1" stop-color="#ff9f1c"/></radialGradient>' +
      '<linearGradient id="' + uid + 'm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbe6"/><stop offset="1" stop-color="#f0d474"/></linearGradient>' +
      '<linearGradient id="' + uid + 'c" gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="0" y2="50"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d3deec"/></linearGradient>' +
      '<linearGradient id="' + uid + 'g" gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="0" y2="50"><stop offset="0" stop-color="#c3cedc"/><stop offset="1" stop-color="#8797ac"/></linearGradient>' +
      '<linearGradient id="' + uid + 'k" gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="0" y2="50"><stop offset="0" stop-color="#9aa7ba"/><stop offset="1" stop-color="#5d6b80"/></linearGradient>' +
      '</defs>' + glyphBody(kind, day, uid);
    return svg;
  }

  /* ── Sky: a gradient and a few moving things ───────────────────── */

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(str) {
    var n = 2166136261;
    for (var i = 0; i < str.length; i++) n = Math.imul(n ^ str.charCodeAt(i), 16777619);
    return n >>> 0;
  }

  /**
   * Negative delay that keeps a looping animation on the same beat when the page is drawn again
   * (every click rebuilds the page: without this the clouds would jump back to the start).
   */
  function beat(dur, offset) {
    return '-' + (((Date.now() / 1000) + offset) % dur).toFixed(2) + 's';
  }

  function sky(scene, isDay) {
    var name = scene || 'clear-day';
    var root = h('div', { class: 'wx-sky wx-sky--' + name, 'aria-hidden': 'true' });
    var r = rng(hashStr(name));
    var night = isDay === false || /night$/.test(name);
    function add(cls, css) {
      var el = document.createElement('i');
      el.className = cls;
      if (css) el.style.cssText = css;
      root.appendChild(el);
      return el;
    }
    function clouds(n, dark) {
      for (var i = 0; i < n; i++) {
        var dur = 80 + r() * 90;
        add('wx-cloud' + (dark ? ' wx-cloud--dark' : ''),
          'top:' + r1(r() * 62) + '%;width:' + Math.round(150 + r() * 190) + 'px;height:' + Math.round(40 + r() * 38) + 'px;' +
          'opacity:' + r1(0.28 + r() * 0.26) + ';animation-duration:' + r1(dur) + 's;animation-delay:' + beat(dur, r() * dur));
      }
    }
    function rain(n, long) {
      for (var i = 0; i < n; i++) {
        var dur = 0.6 + r() * 0.5;
        add('wx-drop', 'left:' + r1(r() * 112) + '%;height:' + Math.round((long ? 20 : 14) + r() * 14) + 'px;' +
          'animation-duration:' + r1(dur) + 's;animation-delay:' + beat(dur, r() * dur));
      }
    }
    function snow(n) {
      for (var i = 0; i < n; i++) {
        var dur = 7 + r() * 8;
        var size = r1(3 + r() * 3.4);
        add('wx-flake', 'left:' + r1(r() * 100) + '%;width:' + size + 'px;height:' + size + 'px;opacity:' + r1(0.55 + r() * 0.4) + ';' +
          'animation-duration:' + r1(dur) + 's;animation-delay:' + beat(dur, r() * dur));
      }
    }
    function stars(n) {
      for (var i = 0; i < n; i++) {
        var dur = 2.4 + r() * 3.2;
        var size = r1(1 + r() * 1.7);
        add('wx-star', 'left:' + r1(r() * 100) + '%;top:' + r1(r() * 78) + '%;width:' + size + 'px;height:' + size + 'px;' +
          'animation-duration:' + r1(dur) + 's;animation-delay:' + beat(dur, r() * dur));
      }
    }
    if (name === 'clear-day') { add('wx-glow'); clouds(2, false); }
    else if (name === 'clear-night') { add('wx-glow wx-glow--moon'); stars(34); }
    else if (name === 'partly-day') { add('wx-glow'); clouds(4, false); }
    else if (name === 'partly-night') { add('wx-glow wx-glow--moon'); stars(18); clouds(3, true); }
    else if (name === 'cloudy') clouds(6, true);
    else if (name === 'fog') { add('wx-band'); add('wx-band wx-band--2'); add('wx-band wx-band--3'); }
    else if (name === 'rain') { clouds(4, true); rain(46, false); }
    else if (name === 'sleet') { clouds(4, true); rain(26, false); snow(14); }
    else if (name === 'snow') { clouds(3, false); snow(34); }
    else if (name === 'storm') { clouds(4, true); rain(40, true); add('wx-flash'); }
    else add('wx-glow');
    if (night) root.classList.add('is-night');
    return root;
  }

  /* ── Panel ─────────────────────────────────────────────────────── */

  function skeletonPanel() {
    return h('div', { class: 'wx-skel' }, [
      h('span', { class: 'wx-skel-bar wx-skel-bar--big' }),
      h('span', { class: 'wx-skel-bar' }),
      h('span', { class: 'wx-skel-bar wx-skel-bar--short' }),
    ]);
  }

  function hourCell(model, hour, first) {
    var Wx = W();
    var src = first ? model.now : hour;
    var d = Wx.describe(src.code, first ? model.now.isDay : hour.isDay);
    var pop = !first && hour.pop != null && hour.pop >= 20 ? Wx.fmtPop(hour.pop) : '';
    return h('div', { class: 'wx-h' + (first ? ' is-now' : ''), title: d.label }, [
      h('span', { class: 'wx-h-t', text: first ? 'Maint.' : Wx.fmtHour(hour.hour) }),
      glyph(d.kind, first ? model.now.isDay : hour.isDay, 26),
      h('span', { class: 'wx-h-deg', text: Wx.fmtTemp(first ? model.now.temp : hour.temp) }),
      h('span', { class: 'wx-h-pop', text: pop }),
    ]);
  }

  function dayCell(model, day, index) {
    var Wx = W();
    var d = Wx.describe(day.code, true);
    return h('div', { class: 'wx-day', title: d.label }, [
      h('span', { class: 'wx-day-n', text: index === 0 ? 'Auj.' : Wx.dayShort(day.date) }),
      glyph(d.kind, true, 26),
      h('span', { class: 'wx-day-t' }, [
        h('b', { text: Wx.fmtTemp(day.max) }),
        h('span', { text: Wx.fmtTemp(day.min) }),
      ]),
      h('span', { class: 'wx-h-pop', text: day.pop != null && day.pop >= 20 ? Wx.fmtPop(day.pop) : '' }),
    ]);
  }

  /**
   * The weather card content. live = Weather.current(); opts: { expanded, onPlace(anchor), onToggle(), onRefresh() }.
   * Everything on it is a quiet button or text; nothing here moves when it is clicked.
   */
  function panel(live, opts) {
    opts = opts || {};
    var Wx = W();
    var model = live && live.model;
    var place = (live && live.place) || (Wx && Wx.loadPlace()) || { name: '' };
    var root = h('section', { class: 'wx wx-anim', 'aria-label': 'Météo' });

    var placeBtn = h('button', {
      class: 'wx-place',
      type: 'button',
      title: 'Changer de ville',
      onclick: function (e) { if (opts.onPlace) opts.onPlace(e.currentTarget); },
    }, [icon('map-pin'), h('span', { text: place.name }), icon('chevron-down', 'wx-caret')]);
    var refresh = h('button', {
      class: 'wx-iconbtn' + (live && (live.status === 'loading' || live.status === 'refreshing') ? ' is-spin' : ''),
      type: 'button',
      title: 'Actualiser',
      'aria-label': 'Actualiser la météo',
      onclick: function () { if (opts.onRefresh) opts.onRefresh(); },
    }, [icon('refresh')]);
    root.appendChild(h('div', { class: 'wx-top' }, [placeBtn, refresh]));

    if (!model) {
      if (live && live.status === 'error') {
        root.appendChild(h('div', { class: 'wx-empty' }, [icon('cloud-off'), h('span', { text: 'Météo indisponible' })]));
      } else {
        root.appendChild(skeletonPanel());
      }
      return root;
    }

    var now = model.now;
    var d = Wx.describe(now.code, now.isDay);
    var today = Wx.dayOf(model, now.date) || model.days[0] || null;
    var facts = [];
    if (now.feels != null && Math.round(now.feels) !== Math.round(now.temp)) facts.push('Ressenti ' + Wx.fmtTemp(now.feels));
    if (today && today.max != null) facts.push(Wx.fmtTemp(today.max) + ' / ' + Wx.fmtTemp(today.min));
    if (today && today.pop != null && today.pop >= 20) facts.push(Wx.fmtPop(today.pop) + ' de pluie');
    root.appendChild(h('div', { class: 'wx-now' }, [
      h('span', { class: 'wx-big' }, [glyph(d.kind, now.isDay, 72)]),
      h('span', { class: 'wx-temp', text: Wx.fmtTemp(now.temp) }),
      h('span', { class: 'wx-desc' }, [
        h('b', { text: d.label }),
        h('small', { text: facts.join(' · ') }),
      ]),
    ]));

    var tip = Wx.advice(model);
    if (tip) root.appendChild(h('div', { class: 'wx-tip is-' + tip.tone }, [icon(tip.icon), h('span', { text: tip.text })]));

    var hours = Wx.upcoming(model, 12);
    if (hours.length) {
      var strip = h('div', { class: 'wx-hours', role: 'list' }, hours.map(function (hr, i) { return hourCell(model, hr, i === 0); }));
      root.appendChild(h('div', { class: 'wx-strip' }, [
        strip,
        h('button', {
          class: 'wx-iconbtn wx-more',
          type: 'button',
          title: opts.expanded ? 'Masquer les prochains jours' : 'Voir les prochains jours',
          'aria-label': opts.expanded ? 'Masquer les prochains jours' : 'Voir les prochains jours',
          'aria-expanded': opts.expanded ? 'true' : 'false',
          onclick: function () { if (opts.onToggle) opts.onToggle(); },
        }, [icon(opts.expanded ? 'chevron-up' : 'calendar-week')]),
      ]));
    }

    if (opts.expanded) {
      var days = (model.days || []).slice(0, 5);
      var sun = today && today.sunrise && today.sunset
        ? h('div', { class: 'wx-sun' }, [
            h('span', {}, [icon('sunrise'), document.createTextNode(' ' + clock(today.sunrise))]),
            h('span', {}, [icon('sunset'), document.createTextNode(' ' + clock(today.sunset))]),
          ])
        : null;
      root.appendChild(h('div', { class: 'wx-week' }, [
        h('div', { class: 'wx-days' }, days.map(function (day, i) { return dayCell(model, day, i); })),
        sun,
      ]));
    }
    return root;
  }

  /** "2026-10-14T18:05" → "18 h 05" */
  function clock(isoTime) {
    var m = W().minutesOf(isoTime);
    if (m == null) return '';
    var hh = Math.floor(m / 60);
    var mm = m % 60;
    return hh + ' h' + (mm ? ' ' + (mm < 10 ? '0' : '') + mm : '');
  }

  /* ── City picker ───────────────────────────────────────────────── */

  function closePicker() {
    if (openPicker) {
      openPicker.close();
      openPicker = null;
    }
  }

  /**
   * Popover under `anchor`: type a city, pick a result. opts.onPick(place) is called once, then it closes.
   * With nothing typed it offers the places chosen before.
   */
  function placePicker(anchor, opts) {
    opts = opts || {};
    closePicker();
    var Wx = W();
    var timer = null;
    var token = 0;
    var results = [];
    var active = -1;
    var list = h('div', { class: 'wx-pop-list', role: 'listbox' });
    var input = h('input', {
      class: 'wx-pop-input',
      type: 'text',
      placeholder: 'Ville…',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': 'Chercher une ville',
    });
    var pop = h('div', { class: 'wx-pop', role: 'dialog', 'aria-label': 'Choisir une ville' }, [
      h('div', { class: 'wx-pop-field' }, [icon('search'), input]),
      list,
    ]);

    function pick(place) {
      closePicker();
      if (opts.onPick) opts.onPick(place);
    }

    function paint(items, note, recent) {
      results = items;
      active = items.length ? 0 : -1;
      list.textContent = '';
      if (note) list.appendChild(h('div', { class: 'wx-pop-note', text: note }));
      items.forEach(function (p, i) {
        var detail = [p.region, p.country].filter(function (x, k, a) { return x && a.indexOf(x) === k; }).join(', ');
        list.appendChild(h('button', {
          class: 'wx-pop-item' + (i === 0 ? ' is-on' : ''),
          type: 'button',
          role: 'option',
          onmouseenter: function () { setActive(i); },
          onclick: function () { pick(p); },
        }, [
          icon(recent ? 'history' : 'map-pin'),
          h('span', { class: 'wx-pop-name', text: p.name }),
          detail ? h('span', { class: 'wx-pop-detail', text: detail }) : null,
        ]));
      });
    }

    function setActive(i) {
      active = i;
      Array.prototype.forEach.call(list.querySelectorAll('.wx-pop-item'), function (el, k) {
        el.classList.toggle('is-on', k === i);
      });
    }

    function showRecent() {
      paint(Wx.recentPlaces(), '', true);
    }

    function search() {
      var q = input.value.replace(/\s+/g, ' ').trim();
      if (q.length < 2) { showRecent(); return; }
      var mine = ++token;
      Wx.searchPlaces(q).then(function (found) {
        if (mine !== token || !pop.parentNode) return;
        paint(found, found.length ? '' : 'Aucune ville trouvée', false);
      }, function () {
        if (mine !== token || !pop.parentNode) return;
        paint([], 'Recherche impossible', false);
      });
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(search, 240);
    });
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); closePicker(); }
      else if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); setActive((active + 1) % results.length); }
      else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); setActive((active - 1 + results.length) % results.length); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[active]) pick(results[active]);
      }
    });
    pop.addEventListener('keydown', function (e) { e.stopPropagation(); });

    function onDown(e) {
      if (!pop.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target))) closePicker();
    }

    document.body.appendChild(pop);
    var rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 20, bottom: 40, top: 20 };
    var width = 280;
    var left = Math.max(8, Math.min(rect.left, global.innerWidth - width - 8));
    pop.style.left = left + 'px';
    pop.style.top = Math.min(rect.bottom + 6, Math.max(8, global.innerHeight - 340)) + 'px';
    pop.style.width = width + 'px';
    showRecent();
    document.addEventListener('mousedown', onDown, true);
    setTimeout(function () { input.focus(); }, 0);

    openPicker = {
      close: function () {
        clearTimeout(timer);
        token++;
        document.removeEventListener('mousedown', onDown, true);
        if (pop.parentNode) pop.parentNode.removeChild(pop);
      },
    };
    return openPicker;
  }

  global.WeatherUI = {
    glyph: glyph,
    sky: sky,
    panel: panel,
    placePicker: placePicker,
    closePicker: closePicker,
    clock: clock,
  };
})(typeof window !== 'undefined' ? window : this);
