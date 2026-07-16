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

  it('normalizeStateColors returns lowercase hex for color inputs', () => {
    const colors = SM.normalizeStateColors({ blue: '#0C66E4' });
    assert.equal(colors.blue, '#0c66e4');
    assert.equal(colors.gray, '#626f86');
    assert.equal(SM.normalizeHexColor('#ABC', '#000000'), '#aabbcc');
  });

  it('En cours restores prior progress or 99% from Terminé', async () => {
    loadComponent('priority/priority-trello.js');
    loadComponent('completion/completion-trello.js');
    const CT = global.CompletionTrello;
    assert.ok(CT);

    const store = Object.create(null);
    const t = {
      get(_scope, _visibility, key) {
        return Promise.resolve(store[key]);
      },
      set(_scope, _visibility, key, value) {
        store[key] = value;
        return Promise.resolve();
      },
    };

    // Stub dueComplete so side effects do not need REST.
    const PT = global.PriorityTrello;
    const prevSetDue = PT && PT.setCardDueComplete;
    const prevClearBlocked = PT && PT.clearBlockedIfComplete;
    if (PT) {
      PT.setCardDueComplete = async () => ({ ok: true, synced: false });
      PT.clearBlockedIfComplete = async () => ({ ok: true, cleared: false });
    }

    const settings = {
      listCategories: { done: 'completed', wip: 'started' },
      roleLists: { completed: 'done' },
      autoMoveCompleted: false,
      autoMoveBlocked: false,
    };

    store[CT.CARD_COMPLETION_KEY] = CT.normalizeCompletionData({
      items: [],
      progress: 60,
    });
    await ST.applyStatutSideEffects(t, 'done', settings);
    assert.equal(store[CT.CARD_COMPLETION_KEY].progress, 100);
    assert.ok(store[CT.COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY]);
    assert.equal(store[CT.COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY].progress, 60);

    const side = await ST.applyStatutSideEffects(t, 'wip', settings);
    assert.equal(side.category, 'started');
    assert.equal(side.progressIncomplete, true);
    assert.equal(store[CT.CARD_COMPLETION_KEY].progress, 60);
    assert.equal(store[CT.COMPLETION_PREVIOUS_BEFORE_COMPLETE_KEY], null);

    // Already at 100% when entering Terminé → En cours uses 99%.
    store[CT.CARD_COMPLETION_KEY] = CT.normalizeCompletionData({
      items: [],
      progress: 100,
    });
    await ST.applyStatutSideEffects(t, 'done', settings);
    const near = await ST.applyStatutSideEffects(t, 'wip', settings);
    assert.equal(near.progressIncomplete, true);
    assert.equal(store[CT.CARD_COMPLETION_KEY].progress, 99);

    if (PT) {
      if (prevSetDue) PT.setCardDueComplete = prevSetDue;
      if (prevClearBlocked) PT.clearBlockedIfComplete = prevClearBlocked;
    }
  });
});
