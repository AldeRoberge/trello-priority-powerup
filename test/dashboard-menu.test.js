'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

function ids(items) {
  const out = [];
  (items || []).forEach((it) => {
    out.push(it.id);
    if (it.children) out.push.apply(out, ids(it.children));
  });
  return out;
}

describe('Dashboard card menu', () => {
  let UI;
  const today = '2026-10-13';
  const lists = [
    { id: 'l0', name: 'Inbox', icon: 'circle-arrow-down' },
    { id: 'l1', name: 'À faire', icon: 'circle' },
  ];

  before(() => {
    loadComponent('table/table-model.js');
    loadComponent('dashboard/dashboard-model.js');
    loadComponent('dashboard/dashboard-ui.js');
    UI = global.DashboardUI;
    assert.equal(typeof UI.menuEntries, 'function');
  });

  it('a triage card offers the exits plus the usual card actions', () => {
    const items = UI.menuEntries({
      id: 'c1',
      name: 'awdawd',
      statutKey: 'triage',
      listId: 'l0',
      urgency: 'Aucune',
      estimate: 0,
      due: '',
      link: 'https://trello.com/c/abc/1',
    }, {
      today: today,
      lists: lists,
      waitingNames: ['Paul'],
      canCreate: true,
      vagues: [{ id: 'eventuellement', label: 'Éventuellement' }],
    });
    const id = ids(items);
    [
      'accept', 'backlog', 'reference', 'waiting', 'wait:Paul', 'wait:', 'someday', 'cancel',
      'due', 'plan:' + today, 'vague:eventuellement',
      'priority', 'urgency', 'urg:vite', 'estimate', 'est:30', 'progress', 'desc', 'blocked',
      'open-card', 'open-document', 'open-trello', 'copy-link',
      'move', 'list:l0', 'new-card', 'archive',
    ].forEach((k) => {
      assert.ok(id.indexOf(k) >= 0, 'missing ' + k);
    });
    assert.equal(items[0].id, 'accept');
    assert.equal(items[0].group, 'Trier');
    assert.equal(id.indexOf('complete'), -1);
    const trello = items.filter((it) => it.id === 'open-trello')[0];
    assert.equal(!!trello.disabled, false);
  });

  it('an open card can be finished and is not offered the triage-only exits', () => {
    const items = UI.menuEntries({
      id: 'c2',
      name: 'Rapport',
      statutKey: 'started',
      listId: 'l1',
      due: today,
      estimate: 30,
      urgency: 'Vite',
    }, { today: today, lists: lists, waitingNames: [], canCreate: true });
    const id = ids(items);
    assert.ok(id.indexOf('complete') >= 0);
    assert.equal(id.indexOf('accept'), -1);
    assert.equal(id.indexOf('cancel'), -1);
    assert.equal(id.indexOf('wait:'), -1);
    assert.ok(id.indexOf('plan:' + today) >= 0);
    const due = items.filter((it) => it.id === 'due')[0];
    const todayItem = due.children.filter((it) => it.id === 'plan:' + today)[0];
    assert.equal(todayItem.checked, true);
    assert.equal(items.filter((it) => it.id === 'open-trello')[0].disabled, true);
  });

  it('empty space offers a new card, the sections and reload', () => {
    const items = UI.pageEntries({ section: 'triage', canCreate: true });
    const id = ids(items);
    assert.ok(id.indexOf('new-card') >= 0);
    assert.ok(id.indexOf('go:triage') >= 0);
    assert.ok(id.indexOf('go:today') >= 0);
    assert.ok(id.indexOf('reload') >= 0);
    assert.equal(items.filter((it) => it.id === 'go:triage')[0].checked, true);
  });
});
