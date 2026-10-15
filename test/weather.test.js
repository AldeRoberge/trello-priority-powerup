'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

/** A trimmed Open-Meteo answer: 2 days of hours, current hour 15 h on 2026-10-14. */
function forecast(over) {
  over = over || {};
  const hours = [];
  for (let d = 14; d <= 15; d++) {
    for (let h = 0; h < 24; h++) hours.push('2026-10-' + d + 'T' + String(h).padStart(2, '0') + ':00');
  }
  const n = hours.length;
  const fill = (v) => new Array(n).fill(v);
  const hourly = {
    time: hours,
    temperature_2m: fill(8),
    precipitation_probability: fill(10),
    weather_code: fill(3),
    is_day: hours.map((t) => (+t.slice(11, 13) >= 7 && +t.slice(11, 13) < 18 ? 1 : 0)),
  };
  Object.keys(over.hourly || {}).forEach((k) => {
    const patch = over.hourly[k];
    Object.keys(patch).forEach((idx) => { hourly[k][Number(idx)] = patch[idx]; });
  });
  return {
    timezone: 'America/Toronto',
    current: Object.assign({
      time: '2026-10-14T15:30',
      temperature_2m: 8.6,
      apparent_temperature: 5.0,
      relative_humidity_2m: 81,
      is_day: 1,
      precipitation: 0,
      weather_code: 3,
      wind_speed_10m: 17.6,
      wind_gusts_10m: 30,
    }, over.current || {}),
    hourly,
    daily: {
      time: ['2026-10-14', '2026-10-15'],
      weather_code: [3, 61],
      temperature_2m_max: [11.2, 9],
      temperature_2m_min: [3.1, 4],
      precipitation_probability_max: [20, 80],
      sunrise: ['2026-10-14T07:12', '2026-10-15T07:13'],
      sunset: ['2026-10-14T18:05', '2026-10-15T18:03'],
      uv_index_max: [2.4, 1],
    },
  };
}

/** Hour index of 2026-10-14 `h` o'clock in forecast(). */
const at = (h) => h;

function memoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
}

describe('Weather', () => {
  let W;
  before(() => {
    loadComponent('shared/weather.js');
    W = global.Weather;
    assert.ok(W);
  });

  describe('describe', () => {
    it('names a clear sky differently by day and by night', () => {
      assert.equal(W.describe(0, true).label, 'Ensoleillé');
      assert.equal(W.describe(0, false).label, 'Ciel dégagé');
      assert.equal(W.describe(0, true).scene, 'clear-day');
      assert.equal(W.describe(0, false).scene, 'clear-night');
      assert.equal(W.describe(2, false).scene, 'partly-night');
    });

    it('maps rain, drizzle and showers to the rain sky, snow and storms to their own', () => {
      assert.equal(W.describe(61, true).scene, 'rain');
      assert.equal(W.describe(53, true).scene, 'rain');
      assert.equal(W.describe(80, true).scene, 'rain');
      assert.equal(W.describe(73, true).scene, 'snow');
      assert.equal(W.describe(95, true).scene, 'storm');
      assert.equal(W.describe(45, true).scene, 'fog');
      assert.equal(W.describe(66, true).scene, 'sleet');
    });

    it('knows what falls from the sky', () => {
      assert.equal(W.describe(3, true).wet, false);
      assert.equal(W.describe(61, true).wet, true);
      assert.equal(W.describe(71, true).snowy, true);
      assert.equal(W.describe(61, true).snowy, false);
    });

    it('never throws on an unknown or missing code', () => {
      assert.equal(W.describe(1234, true).label, 'Variable');
      assert.equal(W.describe(null, true).kind, 'cloudy');
      assert.equal(W.describe(undefined, false).scene, 'cloudy');
    });
  });

  describe('parse', () => {
    it('keeps the place clock and numbers, and nothing converted', () => {
      const m = W.parse(forecast(), { name: 'Montréal' });
      assert.equal(m.now.temp, 8.6);
      assert.equal(m.now.feels, 5);
      assert.equal(m.now.hour, 15);
      assert.equal(m.now.date, '2026-10-14');
      assert.equal(m.now.isDay, true);
      assert.equal(m.hours.length, 48);
      assert.equal(m.hours[at(15)].hour, 15);
      assert.equal(m.days.length, 2);
      assert.equal(m.days[0].sunset, '2026-10-14T18:05');
      assert.equal(m.place.name, 'Montréal');
    });

    it('refuses an answer that has no current weather', () => {
      assert.equal(W.parse(null), null);
      assert.equal(W.parse({ hourly: {}, daily: {} }), null);
    });

    it('turns missing numbers into null instead of 0', () => {
      const json = forecast();
      delete json.current.apparent_temperature;
      const m = W.parse(json);
      assert.equal(m.now.feels, null);
      assert.equal(W.fmtTemp(m.now.feels), '–');
    });
  });

  describe('hours', () => {
    it('upcoming starts at the current hour', () => {
      const m = W.parse(forecast());
      const next = W.upcoming(m, 4);
      assert.deepEqual(next.map((h) => h.hour), [15, 16, 17, 18]);
    });

    it('hourAt and dayOf look a clock hour and a day up', () => {
      const m = W.parse(forecast());
      assert.equal(W.hourAt(m, '2026-10-15', 9).time, '2026-10-15T09:00');
      assert.equal(W.hourAt(m, '2026-10-20', 9), null);
      assert.equal(W.dayOf(m, '2026-10-15').max, 9);
      assert.equal(W.dayOf(m, '2026-11-01'), null);
    });

    it('minutesOf reads a sunrise string', () => {
      assert.equal(W.minutesOf('2026-10-14T18:05'), 18 * 60 + 5);
      assert.equal(W.minutesOf(''), null);
    });
  });

  describe('wording', () => {
    it('writes temperatures with a real minus and a degree sign', () => {
      assert.equal(W.fmtTemp(8.6), '9°');
      assert.equal(W.fmtTemp(-3.2), '−3°');
      assert.equal(W.fmtTemp(-0.2), '0°');
      assert.equal(W.fmtTemp(null), '–');
    });

    it('writes hours and chances in French', () => {
      assert.equal(W.fmtHour(15), '15 h');
      assert.equal(W.fmtPop(40), '40 %');
      assert.equal(W.fmtPop(null), '');
    });

    it('names the weekday', () => {
      assert.equal(W.dayShort('2026-10-14'), 'mer.');
      assert.equal(W.dayShort('2026-10-18'), 'dim.');
      assert.equal(W.dayShort('nope'), '');
    });
  });

  describe('advice', () => {
    it('warns about rain coming', () => {
      const m = W.parse(forecast({ hourly: { weather_code: { 17: 61 }, precipitation_probability: { 17: 90 } } }));
      const a = W.advice(m);
      assert.equal(a.icon, 'umbrella');
      assert.match(a.text, /Pluie probable vers 17 h/);
    });

    it('says until when it rains when it is raining now', () => {
      const m = W.parse(forecast({
        current: { weather_code: 61 },
        hourly: { weather_code: { 15: 61, 16: 61, 17: 61 }, precipitation_probability: { 15: 90, 16: 90, 17: 70 } },
      }));
      assert.match(W.advice(m).text, /Il pleut jusqu’à 18 h/);
    });

    it('warns about snow and storms before anything else', () => {
      const snow = W.parse(forecast({ current: { weather_code: 73 } }));
      assert.equal(W.advice(snow).icon, 'snowflake');
      const storm = W.parse(forecast({ hourly: { weather_code: { 18: 95 } } }));
      assert.equal(W.advice(storm).icon, 'bolt');
      assert.match(W.advice(storm).text, /Orage prévu vers 18 h/);
    });

    it('warns about strong wind, cold and heat', () => {
      assert.equal(W.advice(W.parse(forecast({ current: { wind_gusts_10m: 70 } }))).icon, 'wind');
      assert.equal(W.advice(W.parse(forecast({ current: { apparent_temperature: -14, temperature_2m: -8 } }))).icon, 'temperature-snow');
      assert.equal(W.advice(W.parse(forecast({ current: { apparent_temperature: 33, temperature_2m: 30 } }))).icon, 'temperature-sun');
    });

    it('is happy on a clear mild day and silent on an ordinary one', () => {
      const nice = W.advice(W.parse(forecast({ current: { weather_code: 0, apparent_temperature: 21, temperature_2m: 21 } })));
      assert.equal(nice.tone, 'nice');
      assert.equal(W.advice(W.parse(forecast())), null);
    });

    it('is silent without a forecast', () => {
      assert.equal(W.advice(null), null);
    });
  });

  describe('place and cache', () => {
    let store;
    beforeEach(() => { store = memoryStorage(); });

    it('falls back to the default place until one is chosen', () => {
      assert.equal(W.loadPlace(store).name, 'Montréal');
      assert.equal(W.hasChosenPlace(store), false);
    });

    it('saves a chosen place, rounded, and remembers recent ones once each', () => {
      W.savePlace({ name: 'Québec', region: 'Québec', country: 'Canada', lat: 46.8123, lon: -71.2145 }, store);
      assert.equal(W.hasChosenPlace(store), true);
      assert.deepEqual([W.loadPlace(store).lat, W.loadPlace(store).lon], [46.81, -71.21]);
      W.savePlace({ name: 'Gatineau', lat: 45.48, lon: -75.65 }, store);
      W.savePlace({ name: 'Québec', lat: 46.81, lon: -71.21 }, store);
      assert.deepEqual(W.recentPlaces(store).map((p) => p.name), ['Québec', 'Gatineau']);
    });

    it('refuses a place without coordinates or a name', () => {
      assert.equal(W.savePlace({ name: 'Nulle part' }, store), null);
      assert.equal(W.savePlace({ lat: 1, lon: 2 }, store), null);
      assert.equal(W.savePlace({ name: 'Mars', lat: 400, lon: 2 }, store), null);
      assert.equal(W.hasChosenPlace(store), false);
    });

    it('keeps the forecast per place and reports whether it is fresh', () => {
      const place = W.loadPlace(store);
      const model = W.parse(forecast(), place);
      W.writeCache(place, model, store);
      const hit = W.readCache(place, store);
      assert.equal(hit.fresh, true);
      assert.equal(hit.model.now.temp, 8.6);
      assert.equal(W.readCache({ name: 'Ailleurs', lat: 1, lon: 2 }, store), null);
    });
  });

  describe('network', () => {
    const json = (body) => () => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

    it('asks for one place in km/h with the place’s own clock', () => {
      const url = W.forecastUrl({ lat: 45.51, lon: -73.59 });
      assert.match(url, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=45\.51&longitude=-73\.59/);
      assert.match(url, /timezone=auto/);
      assert.match(url, /wind_speed_unit=kmh/);
      assert.match(url, /precipitation_probability/);
    });

    it('fetchForecast parses the answer', async () => {
      const m = await W.fetchForecast({ name: 'Montréal', lat: 45.51, lon: -73.59 }, json(forecast()));
      assert.equal(m.now.code, 3);
      assert.equal(m.place.name, 'Montréal');
    });

    it('fetchForecast fails on a bad status and on an answer it cannot read', async () => {
      await assert.rejects(W.fetchForecast({ lat: 1, lon: 2 }, () => Promise.resolve({ ok: false, status: 500 })), /http-500/);
      await assert.rejects(W.fetchForecast({ lat: 1, lon: 2 }, json({})), /bad-forecast/);
    });

    it('searchPlaces maps cities and builds one readable label', async () => {
      const results = [
        { name: 'Montréal', admin1: 'Québec', country: 'Canada', latitude: 45.50884, longitude: -73.58781 },
        { name: 'Paris', admin1: 'Paris', country: 'France', latitude: 48.85, longitude: 2.35 },
        { name: 'Cassé', latitude: null, longitude: null },
      ];
      const list = await W.searchPlaces('mont', json({ results }));
      assert.equal(list.length, 2);
      assert.equal(list[0].label, 'Montréal, Québec, Canada');
      assert.equal(list[1].label, 'Paris, France');
      assert.equal(list[0].lat, 45.51);
    });

    it('searchPlaces does not call the network for a one-letter query', async () => {
      let calls = 0;
      const list = await W.searchPlaces('m', () => { calls++; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); });
      assert.deepEqual(list, []);
      assert.equal(calls, 0);
    });

    it('searchPlaces returns an empty list when nothing matches', async () => {
      assert.deepEqual(await W.searchPlaces('zzzzzz', json({})), []);
    });
  });
});
