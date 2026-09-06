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
