'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('StatutMatch / StatutTrello', () => {
  let SM;
  let ST;

  before(() => {
    loadComponent('statut/statut-match.js');
    loadComponent('statut/statut-trello.js');
    SM = global.StatutMatch;
    ST = global.StatutTrello;
    assert.ok(SM);
    assert.ok(ST);
  });

  it('normalizes names (accents)', () => {
    assert.equal(SM.normalizeName('À faire'), 'a faire');
  });

  it('levenshtein distance', () => {
    assert.equal(SM.levenshtein('bloque', 'bloque'), 0);
    assert.equal(SM.levenshtein('bloque', 'bloquer'), 1);
    assert.equal(SM.levenshtein('bloque', 'blocked'), 3);
  });

  it('matches common list names to categories', () => {
    assert.equal(SM.matchListToCategory('À faire')?.key, 'unstarted');
    assert.equal(SM.matchListToCategory('Bloqué')?.key, 'blocked');
    assert.equal(SM.matchListToCategory('Done')?.key, 'completed');
    assert.equal(SM.matchListToCategory('In Progress')?.key, 'started');
    assert.equal(SM.matchListToCategory('XYZ123QQQ'), null);
  });

  it('detectFromLists assigns roles', () => {
    const detected = SM.detectFromLists([
      { id: '1', name: 'En attente' },
      { id: '2', name: 'À faire' },
      { id: '3', name: 'En cours' },
      { id: '4', name: 'Bloqué' },
      { id: '5', name: 'Terminé' },
    ]);
    assert.ok(
      detected.listCategories['1'] === 'backlog' ||
        detected.listCategories['1'] === 'triage'
    );
    assert.equal(detected.listCategories['2'], 'unstarted');
    assert.equal(detected.listCategories['3'], 'started');
    assert.equal(detected.listCategories['4'], 'blocked');
    assert.equal(detected.listCategories['5'], 'completed');
    assert.equal(detected.roleLists.blocked, '4');
    assert.equal(detected.roleLists.completed, '5');
  });

  it('normalizeSettings drops invalid categories', () => {
    const normalized = ST.normalizeSettings({
      initialized: true,
      listCategories: { a: 'started', b: 'nope' },
      roleLists: { blocked: '4' },
      autoMoveBlocked: false,
      showUnassigned: true,
    });
    assert.equal(normalized.listCategories.b, null);
    assert.equal(normalized.listCategories.a, 'started');
    assert.equal(normalized.autoMoveBlocked, false);
    assert.equal(normalized.autoMoveCompleted, true);
    assert.equal(normalized.showUnassigned, true);
    assert.equal(ST.normalizeSettings({}).showUnassigned, false);
  });

  it('groupListsByCategory respects includeUnassigned', () => {
    const lists = [
      { id: '2', name: 'À faire' },
      { id: '4', name: 'Bloqué' },
      { id: 'x', name: 'Misc' },
    ];
    const settings = {
      listCategories: { 2: 'unstarted', 4: 'blocked', x: null },
    };
    const groups = ST.groupListsByCategory(lists, settings);
    assert.ok(groups.length >= 2);
    const uncat = groups.find((g) => g.key === '_none');
    assert.ok(uncat && uncat.lists.length === 1);

    const hidden = ST.groupListsByCategory(
      [
        { id: '2', name: 'À faire' },
        { id: 'x', name: 'Misc' },
      ],
      { listCategories: { 2: 'unstarted', x: null } },
      { includeUnassigned: false }
    );
    assert.equal(
      hidden.find((g) => g.key === '_none'),
      undefined
    );
  });

  it('categoryStyle icons', () => {
    assert.equal(SM.categoryStyle('completed').icon, 'check');
    assert.equal(SM.categoryStyle('blocked').icon, 'ban');
    assert.equal(SM.categoryStyle('started').icon, 'play');
  });
});
