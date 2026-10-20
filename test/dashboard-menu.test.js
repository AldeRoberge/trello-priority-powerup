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
    assert.equal(items[0].id, 'archive', 'Archiver is always first');
    assert.equal(items[1].id, 'accept');
    assert.equal(items[1].group, 'Trier');
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

  describe('day chip menu', () => {
    const vagues = [
      { id: 'bientot', label: 'Bientôt' },
      { id: 'eventuellement', label: 'Éventuellement' },
    ];
    const friday = '2026-10-16';

    it('says "Lundi prochain" for the next Monday instead of its date', () => {
      assert.equal(UI.dayLabel('2026-10-19', friday), 'Lundi prochain');
      assert.equal(UI.dayLabel('2026-10-18', friday), 'dim. 18 oct.');
      assert.equal(UI.dayLabel('2026-10-20', friday), 'mar. 20 oct.');
      // A later Monday keeps its date, and tomorrow wins when tomorrow is a Monday.
      assert.equal(UI.dayLabel('2026-10-26', friday), 'lun. 26 oct.');
      assert.equal(UI.dayLabel('2026-10-19', '2026-10-18'), 'Demain');
      assert.equal(UI.dayLabel('2026-10-26', '2026-10-19'), 'Lundi prochain');
    });

    it('lists the eight days, then the vague horizons under "Plus tard"', () => {
      const items = UI.dueChoices({ due: '', dueVague: '' }, friday, vagues);
      assert.deepEqual(items.slice(0, 8).map((i) => i.label), [
        'Aujourd’hui', 'Demain', 'dim. 18 oct.', 'Lundi prochain', 'mar. 20 oct.', 'mer. 21 oct.', 'jeu. 22 oct.', 'ven. 23 oct.',
      ]);
      const later = items[8];
      assert.equal(items.length, 9);
      assert.equal(later.id, 'later');
      assert.equal(later.label, 'Plus tard');
      assert.deepEqual(later.children.map((c) => c.id), ['vague:bientot', 'vague:eventuellement']);
      assert.equal(items.some((i) => i.checked), false);
    });

    it('checks the planned day, or the horizon, but never both', () => {
      const onDay = UI.dueChoices({ due: '2026-10-19', dueVague: '' }, friday, vagues);
      assert.equal(onDay.filter((i) => i.checked)[0].id, 'plan:2026-10-19');
      assert.equal(onDay[8].children.some((c) => c.checked), false);

      const onHorizon = UI.dueChoices({ due: '2026-10-19', dueVague: 'eventuellement' }, friday, vagues);
      assert.equal(onHorizon.slice(0, 8).some((i) => i.checked), false);
      assert.equal(onHorizon[8].children.filter((c) => c.checked)[0].id, 'vague:eventuellement');
    });

    it('has no "Plus tard" entry when no horizon is known', () => {
      const items = UI.dueChoices({}, friday, []);
      assert.equal(items.length, 8);
      assert.equal(items.some((i) => i.id === 'later'), false);
    });
  });

  it('empty space offers a new card, the sections and reload', () => {
    const items = UI.pageEntries({ section: 'triage', canCreate: true });
    const id = ids(items);
    assert.ok(id.indexOf('new-card') >= 0);
    assert.ok(id.indexOf('new-document') >= 0);
    assert.ok(id.indexOf('go:triage') >= 0);
    assert.ok(id.indexOf('go:today') >= 0);
    assert.ok(id.indexOf('reload') >= 0);
    assert.equal(items.filter((it) => it.id === 'go:triage')[0].checked, true);
  });
});
