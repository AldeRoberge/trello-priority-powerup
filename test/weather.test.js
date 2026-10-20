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

  describe('city search', () => {
    /** A geocoder row, as Open-Meteo sends it (country is missing for some territories). */
    const geo = (name, admin1, country, code, population, feature, lat, lon) => ({
      name, admin1, country, country_code: code, population, feature_code: feature || 'PPL', latitude: lat, longitude: lon,
    });
    const labels = (list) => list.map((p) => p.label);

    // What geocoding-api.open-meteo.com really answered for "Val-d'Or" (language=fr, count=20).
    const VAL_DOR = [
      geo('Val Dor', 'Penang', 'Malaisie', 'MY', 88600, 'PPL', 5.25198, 100.49046),
      geo('Val-d\'Or', 'Québec', 'Canada', 'CA', 25541, 'PPL', 48.0974, -77.79737),
      geo('Val d\'Or', 'Martinique', undefined, 'MQ', undefined, 'PPL', 14.43648, -60.86391),
      geo('Val d\'Or', 'Martinique', undefined, 'MQ', undefined, 'PPL', 14.52807, -60.94749),
      geo('Val d\'Or', undefined, undefined, 'MQ', undefined, 'PPL', 14.70983, -61.15617),
      geo('Val d\'Or', 'Martinique', undefined, 'MQ', undefined, 'PPLX', 14.43677, -60.87801),
      geo('Val-d\'Ornain', 'Grand Est', 'France', 'FR', undefined, 'PPL', 48.7, 5.0),
      geo('Aéroport de Val-d\'Or', 'Québec', 'Canada', 'CA', undefined, 'AIRP', 48.05018, -77.78279),
    ];
    const MONTREAL = [
      geo('Montréal', 'Québec', 'Canada', 'CA', 1762949, 'PPLA2', 45.50884, -73.58781),
      geo('Mont-ral', 'Catalogne', 'Espagne', 'ES', undefined, 'PPLA3', 41.28333, 1.1),
      geo('Montréal', 'Occitanie', 'France', 'FR', 1932, 'PPL', 43.1998, 2.14122),
      geo('Montréal', 'Occitanie', 'France', 'FR', 1302, 'PPL', 43.9502, 0.20217),
      geo('Montreal', 'Wisconsin', 'États-Unis', 'US', 783, 'PPL', 46.428, -90.24601),
      geo('Shipman', 'Virginie', 'États-Unis', 'US', 507, 'PPL', 37.72375, -78.83919),
      geo('Montréal', 'Auvergne-Rhône-Alpes', 'France', 'FR', 496, 'PPL', 46.0, 4.0),
      geo('Montreal', 'Missouri', 'États-Unis', 'US', undefined, 'PPL', 37.9, -92.6),
      geo('Montreal', 'Arkansas', 'États-Unis', 'US', undefined, 'PPL', 35.0, -91.0),
      geo('Montréal-Nord', 'Québec', 'Canada', 'CA', 86857, 'PPLA4', 45.6, -73.63),
    ];
    const QUEBEC = [
      geo('Québec', 'Québec', 'Canada', 'CA', 531902, 'PPLA', 46.81228, -71.21454),
      geo('Quebeck', 'Tennessee', 'États-Unis', 'US', undefined, 'PPL', 35.81673, -85.56692),
      geo('Quebec', 'Saint Mary', 'Jamaïque', 'JM', undefined, 'PPL', 18.3485, -76.8821),
      geo('Quebec', 'Louisiane', 'États-Unis', 'US', undefined, 'PPL', 32.42681, -91.30289),
      geo('Quebec', 'Basse-Saxe', 'Allemagne', 'DE', undefined, 'AIRH', 53.0, 8.0),
      geo('Quebec Citadel Peak', 'Colombie-Britannique', 'Canada', 'CA', undefined, 'PK', 50.0, -123.0),
    ];
    const rank = (rows, query) => W.rankPlaces(W.cleanResults(rows), query);

    it('puts the real Val-d’Or first, once each place, every row with a region or a country', () => {
      ['Val-d\'Or', 'Val d\'Or', 'Val-d’Or', 'val d or'].forEach((query) => {
        const list = rank(VAL_DOR, query);
        assert.equal(list[0].label, 'Val-d\'Or, Québec, Canada', query);
        assert.deepEqual(labels(list), [
          'Val-d\'Or, Québec, Canada',
          'Val d\'Or, Martinique',
          'Val Dor, Penang, Malaisie',
          'Val-d\'Ornain, Grand Est, France',
        ], query);
        list.forEach((p) => assert.ok(p.region || p.country, p.label));
      });
    });

    it('answers "Montreal" with the Québec city first and no twin rows', () => {
      const list = rank(MONTREAL, 'Montreal');
      assert.equal(list[0].label, 'Montréal, Québec, Canada');
      assert.ok(list.length <= 6);
      assert.equal(new Set(labels(list)).size, list.length);
      assert.equal(labels(list).filter((l) => l.startsWith('Montréal, Occitanie')).length, 1);
      assert.ok(!labels(list).some((l) => /Catalogne|Shipman/.test(l)), 'loose guesses are left out');
    });

    it('answers "Québec" with the city first, not the airports or peaks of the same name', () => {
      const list = rank(QUEBEC, 'Québec');
      assert.equal(list[0].label, 'Québec, Canada', 'the province is not repeated after the city');
      assert.ok(!labels(list).some((l) => /Basse-Saxe|Citadel/.test(l)));
    });

    it('a much bigger city beats the preferred country, a similar one does not', () => {
      const paris = [
        geo('Paris', 'Texas', 'États-Unis', 'US', 24782, 'PPLA2', 33.66, -95.55),
        geo('Paris', 'Ontario', 'Canada', 'CA', 12310, 'PPL', 43.19, -80.38),
        geo('Paris', 'Île-de-France', 'France', 'FR', 2138551, 'PPLC', 48.85, 2.35),
      ];
      assert.deepEqual(labels(rank(paris, 'Paris')), ['Paris, Île-de-France, France', 'Paris, Ontario, Canada', 'Paris, Texas, États-Unis']);
    });

    it('finds a big city the geocoder knows under another name, ahead of small namesakes', () => {
      const london = [
        geo('Londres', 'Angleterre', 'Royaume-Uni', 'GB', 8961989, 'PPLC', 51.5, -0.12),
        geo('London', 'Ontario', 'Canada', 'CA', 422324, 'PPL', 42.98, -81.25),
        geo('London', 'Ohio', 'États-Unis', 'US', 10060, 'PPLA2', 39.89, -83.45),
        geo('Lonton', 'État de Kachin', 'Birmanie', 'MM', undefined, 'PPL', 25.0, 97.0),
      ];
      const list = rank(london, 'London');
      assert.deepEqual(labels(list).slice(0, 2), ['Londres, Angleterre, Royaume-Uni', 'London, Ontario, Canada']);
      assert.ok(!labels(list).some((l) => l.startsWith('Lonton')));
    });

    it('prefers Canada between places that are otherwise equal, and the preference can change', () => {
      const rows = [
        geo('Sherbrooke', 'Dakota du Nord', 'États-Unis', 'US', undefined, 'PPL', 47.0, -97.0),
        geo('Sherbrooke', 'Nouvelle-Écosse', 'Canada', 'CA', undefined, 'PPL', 45.1, -61.9),
        geo('Sherbrooke', 'Québec', 'Canada', 'CA', 129447, 'PPL', 45.4, -71.9),
        geo('Sherbrooke', 'Île-du-Prince-Édouard', 'Canada', 'CA', undefined, 'PPL', 46.2, -63.1),
      ];
      const list = rank(rows, 'Sherbrooke');
      assert.equal(list[0].label, 'Sherbrooke, Québec, Canada');
      assert.equal(list.length, 4, 'same name in another region is another place');
      assert.equal(list[3].label, 'Sherbrooke, Dakota du Nord, États-Unis');
      const us = W.rankPlaces(W.cleanResults(rows.slice(0, 2)), 'Sherbrooke', 'US');
      assert.equal(us[0].country, 'États-Unis');
    });

    it('still shows what it has when nothing matches by name (a typo)', () => {
      const list = rank([geo('Montréal', 'Québec', 'Canada', 'CA', 3000, 'PPL', 45.5, -73.6)], 'Montrael');
      assert.deepEqual(labels(list), ['Montréal, Québec, Canada']);
    });

    it('lists at most six places', () => {
      const rows = [];
      for (let i = 0; i < 15; i++) rows.push(geo('Saint-Jean', 'Région ' + i, 'France', 'FR', 100 + i, 'PPL', 40 + i / 10, 2));
      assert.equal(rank(rows, 'Saint-Jean').length, 6);
      assert.equal(W.rankPlaces(W.cleanResults(rows), 'Saint-Jean', 'CA', 3).length, 3);
    });

    describe('cleanResults', () => {
      it('keeps cities only: no airport, park, peak or island', () => {
        const rows = ['PPL', 'PPLA', 'PPLX', 'AIRP', 'AIRH', 'PRK', 'MT', 'PK', 'ISLS'].map((f) => geo('X ' + f, 'R', 'C', 'CA', 1, f, 1, 1));
        assert.deepEqual(W.cleanResults(rows).map((p) => p.name), ['X PPL', 'X PPLA', 'X PPLX']);
      });

      it('names the country from its code when the geocoder leaves it out', () => {
        const p = W.cleanResults([geo('Val d\'Or', 'Martinique', undefined, 'MQ', undefined, 'PPL', 14.4, -60.9)])[0];
        assert.equal(p.country, 'Martinique');
        const q = W.cleanResults([geo('Ailleurs', undefined, undefined, 'JP', undefined, 'PPL', 35, 139)])[0];
        assert.equal(q.country, 'Japon');
      });

      it('drops rows with no coordinates, no name, or nothing to tell them apart by', () => {
        const rows = [
          geo('Cassé', 'R', 'C', 'CA', 1, 'PPL', null, null),
          geo('', 'R', 'C', 'CA', 1, 'PPL', 1, 1),
          { name: 'Sans lieu', latitude: 1, longitude: 2, feature_code: 'PPL' },
          null,
          geo('Bon', 'R', 'C', 'CA', 1, 'PPL', 1, 1),
        ];
        assert.deepEqual(W.cleanResults(rows).map((p) => p.name), ['Bon']);
      });

      it('accepts rows with no feature code, and an answer that is not a list', () => {
        const row = { name: 'Montréal', admin1: 'Québec', country: 'Canada', latitude: 45.5, longitude: -73.6 };
        assert.equal(W.cleanResults([row]).length, 1);
        assert.deepEqual(W.cleanResults(undefined), []);
        assert.deepEqual(W.cleanResults({}), []);
      });
    });

    describe('dedupe', () => {
      it('keeps the most populated of identical names and fills a missing region', () => {
        const rows = [
          geo('Lieu', undefined, undefined, 'MQ', undefined, 'PPL', 14.7, -61.1),
          geo('Lieu', 'Martinique', undefined, 'MQ', 50, 'PPL', 14.4, -60.9),
          geo('Lieu', 'Martinique', undefined, 'MQ', 10, 'PPL', 14.5, -60.9),
        ];
        const list = rank(rows, 'Lieu');
        assert.equal(list.length, 1);
        assert.equal(list[0].label, 'Lieu, Martinique');
        assert.equal(list[0].lat, 14.4);
      });

      it('keeps a region-less row when nothing else says where the place is', () => {
        const list = rank([geo('London', undefined, 'Guinée équatoriale', 'GQ', undefined, 'PPL', 1.8, 9.7)], 'London');
        assert.deepEqual(labels(list), ['London, Guinée équatoriale']);
      });

      it('ignores accents, hyphens and case when comparing names', () => {
        const rows = [
          geo('Trois-Rivières', 'Québec', 'Canada', 'CA', 144472, 'PPL', 46.34, -72.54),
          geo('Trois Rivieres', 'Québec', 'Canada', 'CA', undefined, 'PPL', 46.35, -72.55),
        ];
        assert.equal(rank(rows, 'trois-rivieres').length, 1);
      });
    });

    describe('query and name folding', () => {
      it('turns curly apostrophes straight and collapses spaces', () => {
        assert.equal(W.normalizeQuery('  Val-d’Or  '), 'Val-d\'Or');
        assert.equal(W.normalizeQuery('Val  d‘Or'), 'Val d\'Or');
        assert.equal(W.normalizeQuery(null), '');
      });

      it('folds accents, hyphens, apostrophes and case to plain words', () => {
        assert.equal(W.foldName('Val-d’Or'), 'val d or');
        assert.equal(W.foldName('Québec'), 'quebec');
        assert.equal(W.foldName('Trois-Rivières'), 'trois rivieres');
        assert.equal(W.foldName('Cœur d\'Alene'), 'coeur d alene');
        assert.equal(W.foldName('東京'), '東京');
      });
    });
  });

  describe('network', () => {
    const json =(body) => () => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

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
        { name: 'Montpellier', admin1: 'Occitanie', country: 'France', latitude: 43.61, longitude: 3.87 },
        { name: 'Montmagny', admin1: 'Montmagny', country: 'France', latitude: 46.0, longitude: 2.0 },
        { name: 'Cassé', latitude: null, longitude: null },
      ];
      const list = await W.searchPlaces('mont', json({ results }));
      assert.equal(list.length, 3);
      assert.equal(list[0].label, 'Montréal, Québec, Canada');
      assert.equal(list[2].label, 'Montmagny, France');
      assert.equal(list[0].lat, 45.51);
    });

    it('searchPlaces asks worldwide and in Canada, with straight apostrophes', async () => {
      const urls = [];
      const spy = (url) => { urls.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); };
      await W.searchPlaces('  Val-d’Or ', spy);
      assert.equal(urls.length, 2);
      assert.ok(urls.every((u) => u.includes('name=Val-d\'Or') || u.includes('name=Val-d%27Or')));
      assert.ok(urls.every((u) => u.includes('language=fr')));
      assert.equal(urls.filter((u) => u.includes('countryCode=CA')).length, 1);
      assert.ok(urls.some((u) => u.includes('count=20') && !u.includes('countryCode')));
    });

    it('searchPlaces still answers when the Canadian request fails', async () => {
      const world = { results: [{ name: 'Val-d\'Or', admin1: 'Québec', country: 'Canada', country_code: 'CA', latitude: 48.0974, longitude: -77.79737, population: 25541, feature_code: 'PPL' }] };
      const fetchImpl = (url) => (url.includes('countryCode=CA')
        ? Promise.resolve({ ok: false, status: 500 })
        : Promise.resolve({ ok: true, json: () => Promise.resolve(world) }));
      const list = await W.searchPlaces('Val-d\'Or', fetchImpl);
      assert.deepEqual(list.map((p) => p.label), ['Val-d\'Or, Québec, Canada']);
    });

    it('searchPlaces fails when the worldwide request fails', async () => {
      await assert.rejects(W.searchPlaces('Montréal', () => Promise.resolve({ ok: false, status: 500 })), /http-500/);
    });

    it('searchPlaces merges the Canadian answer in without twins', async () => {
      const montreal = { name: 'Montréal', admin1: 'Québec', country: 'Canada', country_code: 'CA', latitude: 45.50884, longitude: -73.58781, population: 1762949, feature_code: 'PPLA2' };
      const fetchImpl = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [montreal] }) });
      const list = await W.searchPlaces('Montreal', fetchImpl);
      assert.equal(list.length, 1);
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
