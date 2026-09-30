'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('Places directory', () => {
  let Places;

  before(() => {
    clearComponentCache();
    loadComponent('places/places.js');
    Places = global.Places;
    assert.ok(Places);
  });

  it('normalizes places with kind, aliases, notes', () => {
    const dir = Places.normalizeDirectory({
      places: [
        {
          name: '  Maison Montréal  ',
          kind: 'maison',
          aliases: ['chez moi', 'Chez moi'],
          notes: 'Clé sous le paillasson',
        },
        { name: '' },
        { name: 'maison montréal' },
      ],
    });
    assert.equal(dir.places.length, 1);
    assert.equal(dir.places[0].name, 'Maison Montréal');
    assert.ok(dir.places[0].id.startsWith('place-'));
    assert.ok(dir.places[0].aliases.includes('chez moi'));
    assert.equal(dir.places[0].kind, 'maison');
    assert.equal(dir.places[0].notes, 'Clé sous le paillasson');
    assert.equal(Places.findByAliasOrName(dir, 'home').name, 'Maison Montréal');
  });

  it('finds a place by kind alias including FR determinants', () => {
    const dir = Places.upsert(Places.emptyDirectory(), {
      name: 'Maison Montréal',
      kind: 'maison',
      aliases: ['chez moi'],
    });
    assert.equal(Places.findByAliasOrName(dir, 'chez moi').name, 'Maison Montréal');
    assert.equal(Places.findByAliasOrName(dir, 'la maison').name, 'Maison Montréal');
    assert.equal(Places.findByAliasOrName(dir, 'home').name, 'Maison Montréal');
    assert.equal(Places.findByAliasOrName(dir, 'Maison Montréal').name, 'Maison Montréal');
    assert.equal(Places.findByAliasOrName(dir, 'inconnu'), null);
  });

  it('expands work / cottage synonym groups', () => {
    const work = Places.upsert(Places.emptyDirectory(), {
      name: 'Bureau downtown',
      kind: 'travail',
    });
    for (const q of ['au bureau', 'work', 'office', 'workplace']) {
      assert.equal(Places.findByAliasOrName(work, q).name, 'Bureau downtown', q);
    }

    const cottage = Places.upsert(Places.emptyDirectory(), {
      name: 'Chalet Laurentides',
      kind: 'chalet',
    });
    assert.equal(Places.findByAliasOrName(cottage, 'cottage').name, 'Chalet Laurentides');
  });

  it('resolves chez moi in blocked-reason text', () => {
    const dir = Places.upsert(Places.emptyDirectory(), {
      name: 'Maison Montréal',
      aliases: ['chez moi'],
    });
    assert.equal(
      Places.resolveInText('Bloqué chez moi', dir),
      'Bloqué Maison Montréal'
    );
  });

  it('upserts by matchText and merges fields', () => {
    let dir = Places.upsert(Places.emptyDirectory(), {
      name: 'Maison Montréal',
      aliases: ['chez moi'],
    });
    dir = Places.upsert(dir, {
      matchText: 'chez moi',
      notes: 'Nouveau code',
      addAlias: 'home',
    });
    assert.equal(dir.places.length, 1);
    assert.equal(dir.places[0].notes, 'Nouveau code');
    assert.ok(dir.places[0].aliases.includes('home'));
  });

  it('removes a place by alias', () => {
    let dir = Places.upsert(Places.emptyDirectory(), {
      name: 'Maison Montréal',
      aliases: ['chez moi'],
    });
    dir = Places.remove(dir, 'chez moi');
    assert.equal(dir.places.length, 0);
  });

  it('toAgentContext and placesPromptLines', () => {
    const empty = Places.placesPromptLines([]);
    assert.ok(empty.some((l) => /vide|DEMANDE/i.test(l)));
    const dir = Places.upsert(Places.emptyDirectory(), {
      name: 'Maison Montréal',
      kind: 'maison',
      aliases: ['chez moi'],
    });
    const ctx = Places.toAgentContext(dir);
    assert.equal(ctx.length, 1);
    assert.equal(ctx[0].name, 'Maison Montréal');
    const filled = Places.placesPromptLines(dir);
    assert.ok(filled.some((l) => /Maison Montréal/.test(l)));
  });

  it('normalizePlaces omits empty slots', () => {
    assert.deepEqual(Places.normalizePlaces(null), {});
    assert.deepEqual(Places.normalizePlaces({}), {});
    const map = Places.normalizePlaces({
      from: { name: 'Entrepôt' },
      to: { name: 'Client' },
      at: null,
      junk: { name: 'x' },
    });
    assert.ok(map.from && map.from.name === 'Entrepôt');
    assert.ok(map.to && map.to.name === 'Client');
    assert.equal(map.at, undefined);
    assert.ok(Places.hasAnyPlace(map));
    assert.equal(Places.hasAnyPlace({}), false);
  });

  it('keeps address and GPS on directory places, and clears GPS on request', () => {
    let dir = Places.upsert(Places.emptyDirectory(), {
      name: 'Chalet',
      address: '12 chemin du Lac',
      lat: '48.1189',
      lng: -77.7828,
    });
    assert.equal(dir.places[0].address, '12 chemin du Lac');
    assert.equal(dir.places[0].lat, 48.1189);
    assert.equal(dir.places[0].lng, -77.7828);
    dir = Places.upsert(dir, { matchText: 'Chalet', notes: 'x' });
    assert.equal(dir.places[0].lat, 48.1189, 'untouched by unrelated patch');
    dir = Places.upsert(dir, { matchText: 'Chalet', lat: null, lng: null });
    assert.equal(dir.places[0].lat, undefined);
    const bad = Places.upsert(Places.emptyDirectory(), { name: 'X', lat: 200, lng: 0 });
    assert.equal(bad.places[0].lat, undefined);
  });

  it('keeps GPS out of the shared board catalog', () => {
    const dir = Places.upsert(Places.emptyDirectory(), {
      name: 'Maison',
      lat: 45.5,
      lng: -73.5,
    });
    const merged = Places.mergeIntoPlaceCatalog([], dir);
    assert.deepEqual(Object.keys(merged.catalog[0]).sort(), ['id', 'name']);
  });

  it('parseCoordinates reads decimals and map links', () => {
    assert.deepEqual(Places.parseCoordinates('48.1189, -77.7828'), { lat: 48.1189, lng: -77.7828 });
    assert.deepEqual(Places.parseCoordinates('48,1189 ; -77,7828'), { lat: 48.1189, lng: -77.7828 });
    assert.deepEqual(
      Places.parseCoordinates('https://www.google.com/maps/place/X/@48.1189,-77.7828,15z/data=!3d48.12!4d-77.78'),
      { lat: 48.12, lng: -77.78 }
    );
    assert.deepEqual(
      Places.parseCoordinates('https://www.google.com/maps/@48.1189,-77.7828,15z'),
      { lat: 48.1189, lng: -77.7828 }
    );
    assert.deepEqual(
      Places.parseCoordinates('https://maps.google.com/?q=48.1,-77.7'),
      { lat: 48.1, lng: -77.7 }
    );
    assert.equal(Places.parseCoordinates('pas des coordonnées'), null);
    assert.equal(Places.parseCoordinates('99, 200'), null);
  });

  it('keeps a hand-placed node position on a stop, only when valid', () => {
    const map = Places.normalizePlaces({
      from: { name: 'A', x: 36.4, y: -18 },
      via: [{ name: 'B', x: 'nope', y: 5 }, { name: 'C', x: 99999, y: 0 }],
      to: { name: 'D', x: null, y: null },
    });
    assert.equal(map.from.x, 36);
    assert.equal(map.from.y, -18);
    assert.equal(map.via[0].x, undefined);
    assert.equal(map.via[1].x, undefined);
    assert.equal(map.to.x, undefined);
    // and it never reaches the shared board catalog
    const dir = Places.upsert(Places.emptyDirectory(), { name: 'A' });
    assert.deepEqual(Object.keys(Places.toCatalogEntry(dir.places[0])).sort(), ['id', 'name']);
  });

  it('directionsUrl needs every stop locatable', () => {
    const a = { name: 'A', lat: 1, lng: 2 };
    const b = { name: 'B', address: '3 rue X' };
    const c = { name: 'C', lat: 5, lng: 6 };
    const url = Places.directionsUrl([a, b, c]);
    assert.match(url, /origin=1%2C2/);
    assert.match(url, /waypoints=3%20rue%20X/);
    assert.match(url, /destination=5%2C6/);
    assert.equal(Places.directionsUrl([a, { name: 'nu' }]), '');
    assert.equal(Places.directionsUrl([a]), '');
  });

  it('card route: via stops, per-stop action, ordering', () => {
    const map = Places.normalizePlaces({
      from: { name: 'Val-d’Or', do: 'Charger le camion' },
      via: [{ name: 'Quincaillerie', do: 'Acheter les vis' }, { name: '' }, null],
      to: { name: 'Chalet' },
    });
    assert.equal(map.from.do, 'Charger le camion');
    assert.equal(map.via.length, 1);
    assert.deepEqual(
      Places.routeStops(map).map((s) => s.key + ':' + s.ref.name),
      ['from:Val-d’Or', 'via:Quincaillerie', 'to:Chalet']
    );
    assert.equal(Places.refsOf(map).length, 3);
    assert.ok(Places.hasAnyPlace({ via: [{ name: 'A' }] }));
    const many = Places.normalizePlaces({
      via: Array.from({ length: 20 }, (_, i) => ({ name: 'P' + i })),
    });
    assert.equal(many.via.length, Places.MAX_VIA);
  });

  it('mergeIntoPlaceCatalog merges directory into slim catalog', () => {
    const dir = Places.upsert(Places.emptyDirectory(), {
      name: 'Maison Montréal',
      kind: 'maison',
    });
    const merged = Places.mergeIntoPlaceCatalog([], dir);
    assert.equal(merged.changed, true);
    assert.equal(merged.catalog.length, 1);
    assert.equal(merged.catalog[0].name, 'Maison Montréal');
    assert.ok(merged.catalog[0].id.startsWith('place-'));
    const again = Places.mergeIntoPlaceCatalog(merged.catalog, dir);
    assert.equal(again.changed, false);
  });

  it('resolvePlaceSpec resolves aliases to slim refs', () => {
    const dir = Places.upsert(Places.emptyDirectory(), {
      name: 'Maison Montréal',
      aliases: ['chez moi'],
    });
    const hit = Places.resolvePlaceSpec(dir, 'chez moi');
    assert.equal(hit.name, 'Maison Montréal');
    assert.equal(Places.resolvePlaceSpec(dir, 'inconnu'), null);
  });
});

describe('Places + PriorityUI catalog helpers', () => {
  let Places;
  let PriorityUI;

  before(() => {
    clearComponentCache();
    loadComponent('places/places.js');
    loadComponent('priority/priority-ui.js');
    Places = global.Places;
    PriorityUI = global.PriorityUI;
    assert.ok(Places);
    assert.ok(PriorityUI);
  });

  it('PriorityUI.normalizePlaces delegates and omits empty', () => {
    const map = PriorityUI.normalizePlaces({
      at: { id: 'place-home-abcd', name: 'Maison' },
    });
    assert.equal(map.at.name, 'Maison');
    assert.equal(map.from, undefined);
  });

  it('upsertPlaceCatalog and mergeIntoPlaceCatalog', () => {
    PriorityUI.setPlaceCatalog([]);
    const created = PriorityUI.upsertPlaceCatalog({ name: 'Bureau' });
    assert.ok(created && created.id.startsWith('place-'));
    assert.equal(PriorityUI.getPlaceCatalog().length, 1);
    const merged = PriorityUI.mergeIntoPlaceCatalog([
      { id: created.id, name: 'Bureau' },
      { name: 'Chalet' },
    ]);
    assert.ok(merged.catalog.length >= 2);
  });
});
