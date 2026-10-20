/*
 * Role: weather for the Today page, from Open-Meteo (free, no key, no account).
 *  - pure helpers (describe, parse, upcoming, advice, formatting) are covered by test/weather.test.js
 *  - the chosen place and the last forecast live in localStorage: the page paints at once, then refreshes quietly
 *  - only a city's coordinates are ever sent, never anything about the user's tasks
 * Exposes window.Weather.
 */
(function (global) {
  'use strict';

  var PLACE_KEY = 'tp-weather-place';
  var RECENT_KEY = 'tp-weather-recent';
  var CACHE_KEY = 'tp-weather-cache';
  var TTL_MS = 20 * 60 * 1000;
  var MAX_RECENT = 4;
  var FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  var GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  var DEFAULT_PLACE = { name: 'Montréal', region: 'Québec', country: 'Canada', lat: 45.51, lon: -73.59 };

  /* WMO weather codes → what to draw (kind) and how to say it in French. */
  var CODES = {
    0: { kind: 'clear', day: 'Ensoleillé', night: 'Ciel dégagé' },
    1: { kind: 'clear', day: 'Généralement ensoleillé', night: 'Plutôt dégagé' },
    2: { kind: 'partly', label: 'Partiellement nuageux' },
    3: { kind: 'cloudy', label: 'Couvert' },
    45: { kind: 'fog', label: 'Brouillard' },
    48: { kind: 'fog', label: 'Brouillard givrant' },
    51: { kind: 'drizzle', label: 'Bruine légère' },
    53: { kind: 'drizzle', label: 'Bruine' },
    55: { kind: 'drizzle', label: 'Forte bruine' },
    56: { kind: 'sleet', label: 'Bruine verglaçante' },
    57: { kind: 'sleet', label: 'Forte bruine verglaçante' },
    61: { kind: 'rain', label: 'Pluie faible' },
    63: { kind: 'rain', label: 'Pluie' },
    65: { kind: 'rain', label: 'Forte pluie' },
    66: { kind: 'sleet', label: 'Pluie verglaçante' },
    67: { kind: 'sleet', label: 'Forte pluie verglaçante' },
    71: { kind: 'snow', label: 'Faible neige' },
    73: { kind: 'snow', label: 'Neige' },
    75: { kind: 'snow', label: 'Forte neige' },
    77: { kind: 'snow', label: 'Grains de neige' },
    80: { kind: 'rain', label: 'Averses' },
    81: { kind: 'rain', label: 'Averses' },
    82: { kind: 'rain', label: 'Fortes averses' },
    85: { kind: 'snow', label: 'Averses de neige' },
    86: { kind: 'snow', label: 'Fortes averses de neige' },
    95: { kind: 'storm', label: 'Orage' },
    96: { kind: 'storm', label: 'Orage et grêle' },
    99: { kind: 'storm', label: 'Violent orage et grêle' },
  };
  var UNKNOWN = { kind: 'cloudy', label: 'Variable' };
  var DAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

  function num(v) {
    var n = Number(v);
    return v == null || v === '' || !isFinite(n) ? null : n;
  }

  /**
   * What a WMO code looks like.
   * { code, kind, label, scene, wet, snowy }
   *  kind   glyph to draw: clear partly cloudy fog drizzle rain sleet snow storm
   *  scene  sky of the hero card: clear-day clear-night partly-day partly-night cloudy fog rain sleet snow storm
   *  wet    anything that falls from the sky
   */
  function describe(code, isDay) {
    var day = isDay !== false && isDay !== 0;
    // A missing code must not read as 0 (clear sky).
    var n = code == null || code === '' ? NaN : Number(code);
    var c = CODES[n] || UNKNOWN;
    var kind = c.kind;
    var scene = kind;
    if (kind === 'clear' || kind === 'partly') scene = kind + (day ? '-day' : '-night');
    else if (kind === 'drizzle') scene = 'rain';
    return {
      code: isFinite(n) ? n : null,
      kind: kind,
      label: c.label || (day ? c.day : c.night),
      scene: scene,
      wet: kind === 'drizzle' || kind === 'rain' || kind === 'sleet' || kind === 'snow' || kind === 'storm',
      snowy: kind === 'snow' || kind === 'sleet',
    };
  }

  /* ── Forecast → model ──────────────────────────────────────────── */

  /**
   * Open-Meteo JSON → { at, place, tz, now, hours, days }.
   * Times stay the place's local ISO strings ("2026-10-14T15:00"); nothing is converted.
   */
  function parse(json, place) {
    if (!json || !json.current || !json.hourly || !json.daily) return null;
    var c = json.current;
    var hr = json.hourly;
    var dl = json.daily;
    var time = String(c.time || '');
    if (time.length < 13) return null;
    var hours = (hr.time || []).map(function (t, i) {
      return {
        time: t,
        date: t.slice(0, 10),
        hour: +t.slice(11, 13),
        temp: num(hr.temperature_2m && hr.temperature_2m[i]),
        pop: num(hr.precipitation_probability && hr.precipitation_probability[i]),
        code: num(hr.weather_code && hr.weather_code[i]),
        isDay: hr.is_day ? hr.is_day[i] === 1 : true,
      };
    });
    var days = (dl.time || []).map(function (d, i) {
      return {
        date: d,
        code: num(dl.weather_code && dl.weather_code[i]),
        max: num(dl.temperature_2m_max && dl.temperature_2m_max[i]),
        min: num(dl.temperature_2m_min && dl.temperature_2m_min[i]),
        pop: num(dl.precipitation_probability_max && dl.precipitation_probability_max[i]),
        sunrise: (dl.sunrise && dl.sunrise[i]) || '',
        sunset: (dl.sunset && dl.sunset[i]) || '',
        uv: num(dl.uv_index_max && dl.uv_index_max[i]),
      };
    });
    return {
      at: Date.now(),
      place: place || null,
      tz: json.timezone || '',
      now: {
        time: time,
        date: time.slice(0, 10),
        hour: +time.slice(11, 13),
        temp: num(c.temperature_2m),
        feels: num(c.apparent_temperature),
        humidity: num(c.relative_humidity_2m),
        wind: num(c.wind_speed_10m),
        gust: num(c.wind_gusts_10m),
        precip: num(c.precipitation),
        code: num(c.weather_code),
        isDay: c.is_day === 1 || c.is_day === true,
      },
      hours: hours,
      days: days,
    };
  }

  /** Index of the hour that contains "now" (the place's own clock), or -1. */
  function nowIndex(model) {
    if (!model || !model.now) return -1;
    var key = String(model.now.time).slice(0, 13);
    for (var i = 0; i < model.hours.length; i++) {
      if (model.hours[i].time.slice(0, 13) === key) return i;
    }
    return -1;
  }

  /** The current hour and the ones after it, up to `count`. */
  function upcoming(model, count) {
    var i = nowIndex(model);
    if (i < 0) return [];
    return model.hours.slice(i, i + (count > 0 ? count : 12));
  }

  /** Forecast of one clock hour of one day ("2026-10-14", 15), or null. */
  function hourAt(model, date, hour) {
    if (!model || !model.hours) return null;
    for (var i = 0; i < model.hours.length; i++) {
      if (model.hours[i].date === date && model.hours[i].hour === hour) return model.hours[i];
    }
    return null;
  }

  /** Daily entry for an ISO date, or null. */
  function dayOf(model, date) {
    if (!model || !model.days) return null;
    for (var i = 0; i < model.days.length; i++) if (model.days[i].date === date) return model.days[i];
    return null;
  }

  /** "2026-10-14T18:05" → minutes since midnight (1085), or null. */
  function minutesOf(isoTime) {
    var m = /T(\d{2}):(\d{2})/.exec(String(isoTime || ''));
    return m ? +m[1] * 60 + +m[2] : null;
  }

  /* ── Wording ───────────────────────────────────────────────────── */

  function fmtTemp(n) {
    if (n == null || !isFinite(n)) return '–';
    var r = Math.round(n);
    if (r === 0) return '0°';
    return (r < 0 ? '−' + Math.abs(r) : String(r)) + '°';
  }

  function fmtHour(h) {
    return h + ' h';
  }

  function fmtPop(p) {
    return p == null ? '' : Math.round(p) + ' %';
  }

  /** "2026-10-14" → "mer." */
  function dayShort(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '';
    return DAYS_SHORT[new Date(+m[1], +m[2] - 1, +m[3], 12).getDay()];
  }

  function isRainy(h) {
    if (!h) return false;
    var d = describe(h.code, h.isDay);
    return d.wet && !d.snowy && d.kind !== 'storm';
  }

  /**
   * One short sentence that turns the forecast into something to do, or null when there is nothing worth saying.
   * { icon, text, tone: 'warn' | 'info' | 'nice' }
   */
  function advice(model) {
    if (!model || !model.now) return null;
    var now = model.now;
    var here = describe(now.code, now.isDay);
    var ahead = upcoming(model, 12).filter(function (h) { return h.hour >= 7 && h.hour <= 22; });
    var soon = ahead.slice(1, 11);
    var i;

    if (here.kind === 'storm') return { icon: 'bolt', text: 'Orage en cours : restez à l’abri.', tone: 'warn' };
    for (i = 0; i < soon.length; i++) {
      if (describe(soon[i].code, soon[i].isDay).kind === 'storm') {
        return { icon: 'bolt', text: 'Orage prévu vers ' + fmtHour(soon[i].hour) + '.', tone: 'warn' };
      }
    }
    if (here.snowy) return { icon: 'snowflake', text: 'Il neige : prévoyez plus de temps pour vos déplacements.', tone: 'warn' };
    for (i = 0; i < soon.length; i++) {
      if (describe(soon[i].code, soon[i].isDay).snowy) {
        return { icon: 'snowflake', text: 'Neige prévue vers ' + fmtHour(soon[i].hour) + '.', tone: 'warn' };
      }
    }
    if (here.wet) {
      var stop = null;
      for (i = 1; i < ahead.length; i++) {
        if (!isRainy(ahead[i]) && (ahead[i].pop == null || ahead[i].pop < 40)) { stop = ahead[i]; break; }
      }
      return {
        icon: 'umbrella',
        text: stop ? 'Il pleut jusqu’à ' + fmtHour(stop.hour) + '.' : 'Il pleut pour le reste de la journée.',
        tone: 'warn',
      };
    }
    for (i = 0; i < soon.length; i++) {
      if (isRainy(soon[i]) || (soon[i].pop != null && soon[i].pop >= 60)) {
        return { icon: 'umbrella', text: 'Pluie probable vers ' + fmtHour(soon[i].hour) + '.', tone: 'warn' };
      }
    }
    if (now.gust != null && now.gust >= 55) {
      return { icon: 'wind', text: 'Vent fort : rafales jusqu’à ' + Math.round(now.gust) + ' km/h.', tone: 'warn' };
    }
    var feels = now.feels != null ? now.feels : now.temp;
    if (feels != null && feels <= -10) return { icon: 'temperature-snow', text: 'Très froid : habillez-vous chaudement.', tone: 'warn' };
    if (feels != null && feels >= 30) return { icon: 'temperature-sun', text: 'Grande chaleur : pensez à vous hydrater.', tone: 'warn' };
    if (here.kind === 'clear' && now.isDay && feels != null && feels >= 14 && feels <= 28) {
      return { icon: 'sun', text: 'Belle journée pour prendre l’air.', tone: 'nice' };
    }
    return null;
  }

  /* ── Place + cache (localStorage) ──────────────────────────────── */

  function store(storage) {
    if (storage) return storage;
    try { return global.localStorage || null; } catch (e) { return null; }
  }

  function readJson(key, storage) {
    var s = store(storage);
    if (!s) return null;
    try { return JSON.parse(s.getItem(key)); } catch (e) { return null; }
  }

  function writeJson(key, value, storage) {
    var s = store(storage);
    if (!s) return;
    try { s.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full or blocked: stays per session */ }
  }

  function cleanPlace(p) {
    if (!p || typeof p !== 'object') return null;
    var lat = num(p.lat);
    var lon = num(p.lon);
    var name = String(p.name || '').replace(/\s+/g, ' ').trim();
    if (lat == null || lon == null || !name || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return {
      name: name.slice(0, 80),
      region: String(p.region || '').slice(0, 80),
      country: String(p.country || '').slice(0, 80),
      lat: Math.round(lat * 100) / 100,
      lon: Math.round(lon * 100) / 100,
    };
  }

  function placeKey(p) {
    return p ? p.lat + ',' + p.lon : '';
  }

  /** The place the user picked, or the default one. */
  function loadPlace(storage) {
    return cleanPlace(readJson(PLACE_KEY, storage)) || DEFAULT_PLACE;
  }

  /** True once the user has picked a city (otherwise the default is only a guess). */
  function hasChosenPlace(storage) {
    return !!cleanPlace(readJson(PLACE_KEY, storage));
  }

  function recentPlaces(storage) {
    var list = readJson(RECENT_KEY, storage);
    return (Array.isArray(list) ? list : []).map(cleanPlace).filter(Boolean).slice(0, MAX_RECENT);
  }

  function savePlace(place, storage) {
    var p = cleanPlace(place);
    if (!p) return null;
    writeJson(PLACE_KEY, p, storage);
    var recent = [p].concat(recentPlaces(storage).filter(function (r) { return placeKey(r) !== placeKey(p); }));
    writeJson(RECENT_KEY, recent.slice(0, MAX_RECENT), storage);
    return p;
  }

  function readCache(place, storage) {
    var c = readJson(CACHE_KEY, storage);
    if (!c || !c.model || c.key !== placeKey(place)) return null;
    return { model: c.model, at: num(c.at) || 0, fresh: Date.now() - (num(c.at) || 0) < TTL_MS };
  }

  function writeCache(place, model, storage) {
    writeJson(CACHE_KEY, { key: placeKey(place), at: Date.now(), model: model }, storage);
  }

  /* ── Network ───────────────────────────────────────────────────── */

  function forecastUrl(place) {
    return FORECAST_URL +
      '?latitude=' + encodeURIComponent(place.lat) +
      '&longitude=' + encodeURIComponent(place.lon) +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m,wind_gusts_10m' +
      '&hourly=temperature_2m,precipitation_probability,weather_code,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max' +
      '&timezone=auto&forecast_days=5&wind_speed_unit=kmh';
  }

  function getJson(url, fetchImpl) {
    var f = fetchImpl || global.fetch;
    if (typeof f !== 'function') return Promise.reject(new Error('no-fetch'));
    return Promise.resolve(f(url)).then(function (res) {
      if (!res || !res.ok) throw new Error('http-' + (res && res.status));
      return res.json();
    });
  }

  function fetchForecast(place, fetchImpl) {
    return getJson(forecastUrl(place), fetchImpl).then(function (json) {
      var model = parse(json, place);
      if (!model) throw new Error('bad-forecast');
      return model;
    });
  }

  /* ── City search: clean, de-duplicate, rank ───────────────────── */

  // The geocoder returns airports and parks, the same village three times, rows with no country,
  // and orders by population before spelling ("Val Dor" in Malaysia ahead of Val-d'Or).
  // So we ask for more, clean what comes back, and order it ourselves.
  var PREFERRED_COUNTRY = 'CA';
  var SEARCH_SHOWN = 6;
  var BIG_CITY = 100000;
  var regionNames;

  /** Straight apostrophes and single spaces: what the keyboard may type is not what the geocoder indexes. */
  function normalizeQuery(query) {
    return String(query || '').replace(/[‘’ʼ´`]/g, "'").replace(/\s+/g, ' ').trim();
  }

  /** Words only, lowercase, no accents: "Val-d’Or", "val d'or" and "VAL D OR" are the same. */
  function foldName(text) {
    var t = String(text || '');
    try { t = t.normalize('NFD'); } catch (e) { /* very old engine: accents stay */ }
    return t.replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  /** "MQ" → "Martinique" (the geocoder leaves the country out for some territories). */
  function countryName(code) {
    code = String(code || '').toUpperCase();
    if (!code) return '';
    try {
      if (regionNames === undefined) {
        regionNames = typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(['fr-CA', 'fr'], { type: 'region' }) : null;
      }
      return (regionNames && regionNames.of(code)) || code;
    } catch (e) { return code; }
  }

  /** One geocoder row → a place with a `code` and a `population` for ranking, or null when it is no use as a city. */
  function placeFromResult(r) {
    if (!r || typeof r !== 'object') return null;
    var feature = String(r.feature_code || '');
    if (feature && feature.indexOf('PPL') !== 0) return null; // airports, parks, peaks, islands
    var code = String(r.country_code || '').toUpperCase();
    var place = cleanPlace({ name: r.name, region: r.admin1, country: r.country || countryName(code), lat: r.latitude, lon: r.longitude });
    if (!place || !(place.region || place.country)) return null; // nothing to tell it apart by
    place.code = code;
    place.population = num(r.population) || 0;
    return place;
  }

  function cleanResults(results) {
    return (Array.isArray(results) ? results : []).map(placeFromResult).filter(Boolean);
  }

  /** Same name in the same country and region (or one of them has no region) is the same place to a person. Keeps the most populated. */
  function dedupePlaces(places) {
    var kept = [];
    places.forEach(function (p) {
      var name = foldName(p.name);
      var where = p.code || foldName(p.country);
      var region = foldName(p.region);
      var twin = null;
      for (var i = 0; i < kept.length && !twin; i++) {
        var k = kept[i];
        if (k.name === name && k.where === where && (!k.region || !region || k.region === region)) twin = k;
      }
      if (!twin) {
        kept.push({ name: name, where: where, region: region, place: p, index: kept.length });
        return;
      }
      if (p.population > twin.place.population) {
        var regionKept = twin.place.region;
        twin.place = p;
        if (!p.region) p.region = regionKept;
      } else if (!twin.place.region) {
        twin.place.region = p.region;
      }
      twin.region = twin.region || region;
    });
    return kept.map(function (k) { return k.place; });
  }

  /**
   * How well a place's name answers what was typed (`q` is folded):
   * 0 the name itself, or a big city the geocoder found under another name (Londres for "London")
   * 1 same letters with other spacing ("Val Dor" for "Val-d'Or")
   * 2 starts with or contains it
   * 3 unrelated and small: a loose guess
   */
  function nameGroup(place, q) {
    var n = foldName(place.name);
    if (!q) return 2;
    if (n === q) return 0;
    if (n.replace(/ /g, '') === q.replace(/ /g, '')) return 1;
    if (n.indexOf(q) >= 0) return 2;
    return place.population >= BIG_CITY ? 0 : 3;
  }

  /** Cleaned places → at most `limit` of them, the right city first, each with a `label`. */
  function rankPlaces(places, query, preferred, limit) {
    var q = foldName(normalizeQuery(query));
    var country = preferred === undefined ? PREFERRED_COUNTRY : String(preferred || '').toUpperCase();
    var rows = dedupePlaces(places || []).map(function (p, i) {
      return {
        place: p,
        index: i,
        group: nameGroup(p, q),
        // a tenfold bigger city outweighs being in the preferred country, so "Paris" stays Paris, France
        score: Math.log10(1 + p.population) + (country && p.code === country ? 1 : 0),
      };
    });
    var close = rows.filter(function (r) { return r.group < 3; });
    if (close.length) rows = close;
    rows.sort(function (a, b) {
      return a.group - b.group || b.score - a.score || a.index - b.index;
    });
    return rows.slice(0, limit > 0 ? limit : SEARCH_SHOWN).map(function (r) {
      var p = r.place;
      return {
        name: p.name,
        region: p.region,
        country: p.country,
        lat: p.lat,
        lon: p.lon,
        label: [p.name, p.region, p.country].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(', '),
      };
    });
  }

  function geocodeUrl(q, count, country) {
    return GEOCODE_URL + '?name=' + encodeURIComponent(q) + '&count=' + count + '&language=fr&format=json' +
      (country ? '&countryCode=' + encodeURIComponent(country) : '');
  }

  /**
   * City search → [{ name, region, country, lat, lon, label }], best first, no twins (empty for a query shorter than 2 letters).
   * Asks worldwide and, as a second request, in `opts.country` (default Canada) so a local small town is never crowded out
   * by the many same-named villages in France; if that second request fails the worldwide one still answers.
   */
  function searchPlaces(query, fetchImpl, opts) {
    var q = normalizeQuery(query);
    if (q.length < 2) return Promise.resolve([]);
    var country = opts && opts.country !== undefined ? opts.country : PREFERRED_COUNTRY;
    var world = getJson(geocodeUrl(q, 20), fetchImpl);
    var local = country
      ? getJson(geocodeUrl(q, 10, country), fetchImpl).then(null, function () { return null; })
      : Promise.resolve(null);
    return Promise.all([world, local]).then(function (both) {
      var raw = [].concat((both[0] && both[0].results) || [], (both[1] && both[1].results) || []);
      return rankPlaces(cleanResults(raw), q, country);
    });
  }

  /* ── Live state shared by every render ─────────────────────────── */

  var live = { place: null, model: null, status: 'idle' };
  var listeners = [];
  var inflight = null;

  function notify() {
    listeners.slice().forEach(function (fn) { try { fn(live); } catch (e) { /* a listener must not break the others */ } });
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function current() {
    if (!live.place) {
      live.place = loadPlace();
      var cached = readCache(live.place);
      if (cached) live.model = cached.model;
    }
    return live;
  }

  /**
   * Shows the cached forecast at once, then asks Open-Meteo unless the cache is still fresh.
   * `force` skips the freshness check (new place, manual refresh).
   */
  function refresh(opts) {
    opts = opts || {};
    var place = loadPlace();
    var samePlace = live.place && placeKey(live.place) === placeKey(place);
    live.place = place;
    if (!samePlace) live.model = null;
    var cached = readCache(place);
    if (cached && !live.model) {
      live.model = cached.model;
      live.status = 'ok';
      notify();
    }
    if (cached && cached.fresh && !opts.force) return Promise.resolve(live);
    if (inflight && samePlace) return inflight;
    live.status = live.model ? 'refreshing' : 'loading';
    notify();
    var job = fetchForecast(place, opts.fetch).then(function (model) {
      if (placeKey(live.place) !== placeKey(place)) return live;
      live.model = model;
      live.status = 'ok';
      writeCache(place, model);
      return live;
    }, function () {
      if (placeKey(live.place) === placeKey(place)) live.status = live.model ? 'stale' : 'error';
      return live;
    }).then(function (state) {
      if (inflight === job) inflight = null;
      notify();
      return state;
    });
    inflight = job;
    return job;
  }

  /** Picks a new city and loads its forecast. */
  function setPlace(place) {
    var saved = savePlace(place);
    if (!saved) return Promise.resolve(live);
    return refresh({ force: true });
  }

  global.Weather = {
    TTL_MS: TTL_MS,
    DEFAULT_PLACE: DEFAULT_PLACE,
    describe: describe,
    parse: parse,
    nowIndex: nowIndex,
    upcoming: upcoming,
    hourAt: hourAt,
    dayOf: dayOf,
    minutesOf: minutesOf,
    advice: advice,
    fmtTemp: fmtTemp,
    fmtHour: fmtHour,
    fmtPop: fmtPop,
    dayShort: dayShort,
    forecastUrl: forecastUrl,
    fetchForecast: fetchForecast,
    searchPlaces: searchPlaces,
    normalizeQuery: normalizeQuery,
    foldName: foldName,
    cleanResults: cleanResults,
    rankPlaces: rankPlaces,
    loadPlace: loadPlace,
    hasChosenPlace: hasChosenPlace,
    recentPlaces: recentPlaces,
    savePlace: savePlace,
    readCache: readCache,
    writeCache: writeCache,
    placeKey: placeKey,
    subscribe: subscribe,
    current: current,
    refresh: refresh,
    setPlace: setPlace,
  };
})(typeof window !== 'undefined' ? window : this);
