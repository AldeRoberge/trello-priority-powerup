'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('DashboardTrello.ensureInbox / ingest', () => {
  let DT;
  let store;
  let rest;
  const t = {
    board: async () => ({ id: 'b1' }),
    get: async (scope, vis, key) => (store[key] === undefined ? null : store[key]),
    set: async (scope, vis, key, val) => {
      store[key] = val;
    },
  };

  before(() => {
    loadComponent('statut/statut-match.js');
    loadComponent('statut/statut-trello.js');
    loadComponent('dashboard/dashboard-model.js');
    loadComponent('dashboard/dashboard-trello.js');
    DT = global.DashboardTrello;
    assert.ok(DT);
  });

  beforeEach(() => {
    store = {};
    rest = [];
    global.SheetsTrello = {
      trelloRest: async (tt, path, method) => {
        rest.push([method, path]);
        return { ok: true, data: { id: 'newlist' } };
      },
    };
  });

  const settingsOf = () => store[global.StatutTrello.STATUT_SETTINGS_KEY];

  it('assigns the triage Statut to an existing list that reads like an inbox, without creating anything', async () => {
    const res = await DT.ensureInbox(t, [{ id: 'l1', name: 'À faire' }, { id: 'l2', name: 'Inbox' }]);
    assert.deepEqual(res, { listId: 'l2', created: false });
    assert.equal(rest.length, 0);
    assert.equal(settingsOf().listCategories.l2, 'triage');
  });

  it('creates an Inbox list at the top of the board when none exists, and marks it triage', async () => {
    const res = await DT.ensureInbox(t, [{ id: 'l1', name: 'À faire' }, { id: 'l3', name: 'Terminé' }]);
    assert.deepEqual(res, { listId: 'newlist', created: true });
    assert.equal(rest.length, 1);
    assert.equal(rest[0][0], 'POST');
    assert.match(rest[0][1], /^\/lists\?name=Inbox&idBoard=b1&pos=top$/);
    assert.equal(settingsOf().listCategories.newlist, 'triage');
  });

  it('ingest refuses to drop cards in another list when the board has no triage list', async () => {
    await assert.rejects(
      DT.ingest(t, ['x'], [{ id: 'l1', name: 'À faire', category: 'unstarted' }]),
      (err) => err.reason === 'no-triage-list'
    );
  });
});

describe('DashboardTrello next step and priority', () => {
  let DT;
  let data;
  let writes;
  const t = {};

  before(() => {
    loadComponent('dashboard/dashboard-model.js');
    loadComponent('dashboard/dashboard-trello.js');
    DT = global.DashboardTrello;
  });

  beforeEach(() => {
    data = { items: [] };
    writes = 0;
    global.CompletionTrello = {
      normalizeCompletionData: (d) => d,
      getCardCompletionById: async () => data,
      saveCardCompletionById: async (tt, id, next) => {
        writes++;
        data = next;
      },
    };
  });

  it('saveNextStep makes the text the first step and rewrites it when the same field is typed again', async () => {
    await DT.saveNextStep(t, 'c1', 'Appeler');
    assert.deepEqual(data.items.map((i) => i.text), ['Appeler']);
    await DT.saveNextStep(t, 'c1', 'Appeler le comptable');
    assert.deepEqual(data.items.map((i) => i.text), ['Appeler le comptable']);
    assert.equal(writes, 2);
  });

  it('saveNextStep writes nothing for the same text, an empty text or no checklist store', async () => {
    await DT.saveNextStep(t, 'c1', 'Appeler');
    await DT.saveNextStep(t, 'c1', ' appeler ');
    await DT.saveNextStep(t, 'c1', '   ');
    assert.equal(writes, 1);
    global.CompletionTrello = null;
    await DT.saveNextStep(t, 'c1', 'Autre');
    assert.equal(writes, 1);
  });

  it('saveNextStep keeps the other fields of the checklist (the estimate, the progress)', async () => {
    data = { items: [], estimatedMinutes: 45, progress: 0 };
    await DT.saveNextStep(t, 'c1', 'Appeler');
    assert.equal(data.estimatedMinutes, 45);
  });

  describe('savePriority', () => {
    let saved;
    beforeEach(() => {
      saved = null;
      global.PriorityTrello = {
        getCardInputsById: async () => ({ impact: 5, empressement: 'vite' }),
        saveCardInputsById: async (tt, id, patch) => {
          saved = patch;
          return Object.assign({}, patch, { normalized: true });
        },
        ensureBoardPriorityContext: async () => ({ settings: true }),
        computeDisplay: (inputs) => ({ score: inputs.impact * 0.93, tierLabel: 'Haute', tierI: 1 }),
      };
    });

    it('merges the patch into the stored inputs and returns the score of what was saved', async () => {
      const display = await DT.savePriority(t, 'c1', { impact: 8 });
      assert.equal(saved.impact, 8);
      assert.equal(saved.empressement, 'vite', 'the other inputs stay');
      assert.deepEqual({ ...display }, { priority: 7.4, tier: 'Haute', tierI: 1 });
    });

    it('prefers the matrix label and still saves when the score cannot be computed', async () => {
      global.PriorityTrello.computeDisplay = () => ({ score: 3, matrixLabel: 'Matrice', tierLabel: 'Basse', tierI: 3 });
      assert.equal((await DT.savePriority(t, 'c1', { impact: 3 })).tier, 'Matrice');
      global.PriorityTrello.computeDisplay = () => { throw new Error('boom'); };
      assert.equal(await DT.savePriority(t, 'c1', { impact: 4 }), null);
      assert.equal(saved.impact, 4);
      global.PriorityTrello.computeDisplay = () => ({ score: 5, priorityEnabled: false });
      assert.equal(await DT.savePriority(t, 'c1', { impact: 4 }), null);
      delete global.PriorityTrello.computeDisplay;
      assert.equal(await DT.savePriority(t, 'c1', { impact: 4 }), null);
    });
  });
});

describe('DashboardTrello undo of a decision', () => {
  let DT;
  let calls;
  let doc;
  const t = {};

  before(() => {
    loadComponent('dashboard/dashboard-model.js');
    loadComponent('dashboard/dashboard-trello.js');
    DT = global.DashboardTrello;
  });

  beforeEach(() => {
    calls = [];
    doc = { id: 'd1', title: 'Références', body: '- Ancienne', rev: 3 };
    global.TableTrello = {
      unarchiveCard: async (tt, id) => calls.push(['unarchive', id]),
      moveCard: async (tt, id, listId, pos) => calls.push(['move', id, listId, pos]),
    };
    global.PriorityTrello = {
      restPutCard: async (tt, id, body) => {
        calls.push(['put', id, body]);
        return { ok: true };
      },
      getCardInputsById: async () => ({}),
      saveCardInputsById: async (tt, id, patch) => {
        calls.push(['inputs', id, patch]);
        return patch;
      },
    };
    global.GanttTrello = {
      saveCardDates: async (tt, id, d) => {
        calls.push(['dates', id, d]);
        return { ok: true };
      },
    };
    global.DocsTrello = {
      listDocs: async () => [{ id: doc.id, title: doc.title }],
      loadDoc: async () => Object.assign({}, doc),
      saveDoc: async (tt, d) => {
        doc = Object.assign({}, doc, { body: d.body, rev: d.rev + 1 });
      },
      createDoc: async (tt, title, body) => {
        doc = { id: 'd2', title, body, rev: 1 };
        return { id: 'd2' };
      },
    };
  });

  it('restoreTriage moves the card back to its list and place', async () => {
    await DT.restoreTriage(t, { id: 'c1', listId: 'inbox', pos: 1024 });
    assert.deepEqual(calls, [['move', 'c1', 'inbox', 1024]]);
  });

  it('restoreTriage unarchives first when the decision archived the card', async () => {
    await DT.restoreTriage(t, { id: 'c1', listId: 'inbox', pos: 5, archived: true });
    assert.deepEqual(calls.map((c) => c[0]), ['unarchive', 'move']);
  });

  it('restoreTriage writes the old description back after a waiting decision', async () => {
    await DT.restoreTriage(t, { id: 'c1', listId: 'inbox', pos: 5, restoreDesc: true, fullDesc: 'Texte' });
    assert.deepEqual(calls[1], ['put', 'c1', { desc: 'Texte' }]);
    calls.length = 0;
    await DT.restoreTriage(t, { id: 'c1', listId: 'inbox', pos: 5, restoreDesc: true });
    assert.deepEqual(calls[1], ['put', 'c1', { desc: '' }], 'a card that had no note gets an empty one back');
  });

  it('restoreTriage writes the dates back after an "Un jour" decision', async () => {
    const local = { start: '2026-10-20', due: '2026-10-20', startTime: '', dueTime: '', dueVague: '', dueMode: 'precise' };
    await DT.restoreTriage(t, { id: 'c1', listId: 'inbox', pos: 5, restoreDates: true, local });
    const dates = calls.filter((c) => c[0] === 'dates')[0];
    assert.deepEqual({ ...dates[2] }, { startDate: '2026-10-20', dueDate: '2026-10-20', startTime: '', dueTime: '' });
    const inputs = calls.filter((c) => c[0] === 'inputs')[0];
    assert.equal(inputs[2].dueMode, 'precise');
    assert.equal(inputs[2].dueVague, '');
  });

  it('restoreTriage fails loudly when Trello refuses the dates', async () => {
    global.GanttTrello.saveCardDates = async () => ({ ok: false, reason: 'not-authorized' });
    await assert.rejects(
      DT.restoreTriage(t, { id: 'c1', listId: 'inbox', pos: 5, restoreDates: true, local: {} }),
      (err) => err.reason === 'not-authorized'
    );
  });

  it('fileReference adds a line to Références and unfileReference takes exactly that line out', async () => {
    const ref = await DT.fileReference(t, { name: 'Appeler le comptable', desc: '' });
    assert.equal(doc.body, '- Ancienne\n- Appeler le comptable');
    assert.deepEqual({ ...ref }, { docId: 'd1', added: '\n- Appeler le comptable' });
    await DT.unfileReference(t, ref);
    assert.equal(doc.body, '- Ancienne');
  });

  it('fileReference keeps the note under the line, and undoing removes both', async () => {
    const ref = await DT.fileReference(t, { name: 'Idée', desc: 'Détails' });
    assert.equal(doc.body, '- Ancienne\n- Idée\n\nDétails');
    await DT.unfileReference(t, ref);
    assert.equal(doc.body, '- Ancienne');
  });

  it('fileReference creates the document when there is none, and undoing leaves it empty', async () => {
    global.DocsTrello.listDocs = async () => [];
    const ref = await DT.fileReference(t, { name: 'Première', desc: '' });
    assert.equal(doc.title, 'Références');
    assert.equal(doc.body, '- Première');
    assert.equal(ref.docId, 'd2');
    global.DocsTrello.listDocs = async () => [{ id: doc.id, title: doc.title }];
    await DT.unfileReference(t, ref);
    assert.equal(doc.body, '');
  });

  it('unfileReference leaves a document alone when the line is no longer there', async () => {
    const ref = await DT.fileReference(t, { name: 'Idée', desc: '' });
    doc = Object.assign({}, doc, { body: '- Autre chose entièrement' });
    await DT.unfileReference(t, ref);
    assert.equal(doc.body, '- Autre chose entièrement');
    await DT.unfileReference(t, null);
    await DT.unfileReference(t, { docId: 'zzz', added: 'x' });
  });
});

describe('DashboardTrello planning on the clock', () => {
  let DT;
  let calls;
  const t = {};

  before(() => {
    loadComponent('dashboard/dashboard-model.js');
    loadComponent('dashboard/dashboard-trello.js');
    DT = global.DashboardTrello;
  });

  beforeEach(() => {
    calls = [];
    global.PriorityTrello = {
      restPutCard: async () => ({ ok: true }),
      getCardInputsById: async () => ({}),
      saveCardInputsById: async (tt, id, patch) => {
        calls.push(['inputs', id, patch]);
        return patch;
      },
    };
    global.GanttTrello = {
      saveCardDates: async (tt, id, d) => {
        calls.push(['dates', id, d]);
        return { ok: true };
      },
    };
  });

  const datesOf = () => calls.filter((c) => c[0] === 'dates')[0][2];
  const inputsOf = () => calls.filter((c) => c[0] === 'inputs')[0][2];

  it('planAt writes the same hour as start and due for a task placed on the clock', async () => {
    await DT.planAt(t, 'c1', '2026-10-14', '', '14:30');
    assert.deepEqual({ ...datesOf() }, { startDate: '2026-10-14', dueDate: '2026-10-14', startTime: '14:30', dueTime: '14:30' });
    assert.equal(inputsOf().dueTime, '14:30');
  });

  it('planAt keeps a span: a meeting moved to 10:00 still ends at 11:30', async () => {
    await DT.planAt(t, 'c1', '2026-10-14', '', '10:00', '11:30');
    assert.equal(datesOf().startTime, '10:00');
    assert.equal(datesOf().dueTime, '11:30');
    assert.equal(inputsOf().dueTime, '11:30');
    assert.equal(inputsOf().dueMode, 'precise');
  });

  // The undo of a bulk plan ("Planifier ma journée", "Replanifier") puts each card's snapshot back.
  it('restoreDates puts a card back on its day and hour', async () => {
    await DT.restoreDates(t, 'c1', { start: '2026-10-13', due: '2026-10-13', startTime: '09:00', dueTime: '09:30', dueVague: '', dueMode: 'precise' });
    assert.deepEqual({ ...datesOf() }, { startDate: '2026-10-13', dueDate: '2026-10-13', startTime: '09:00', dueTime: '09:30' });
    assert.equal(inputsOf().dueMode, 'precise');
    assert.equal(inputsOf().dueVague, '');
  });

  it('restoreDates clears the dates of a card that had none', async () => {
    await DT.restoreDates(t, 'c1', { start: '', due: '', startTime: '', dueTime: '', dueVague: '', dueMode: '' });
    assert.deepEqual({ ...datesOf() }, { startDate: '', dueDate: '', startTime: '', dueTime: '' });
    assert.equal(inputsOf().dueMode, '');
  });

  it('restoreDates puts a vague horizon back as a horizon, not as a day', async () => {
    await DT.restoreDates(t, 'c1', { start: '', due: '', startTime: '', dueTime: '', dueVague: 'bientot', dueMode: 'vague' });
    assert.deepEqual({ ...datesOf() }, { startDate: '', dueDate: '', startTime: '', dueTime: '' });
    assert.equal(inputsOf().dueVague, 'bientot');
    assert.equal(inputsOf().dueMode, 'vague');
  });
});

describe('DashboardTrello daily capacity', () => {
  let DT;

  before(() => {
    loadComponent('dashboard/dashboard-model.js');
    loadComponent('dashboard/dashboard-trello.js');
    DT = global.DashboardTrello;
  });

  it('keeps a daily capacity and drops a value outside one minute to one day', () => {
    DT.setCapacity(300);
    assert.equal(DT.getCapacity(), 300);
    DT.setCapacity(10);
    assert.equal(DT.getCapacity(), global.DashboardModel.DEFAULT_CAPACITY);
    DT.setCapacity(360);
    assert.equal(DT.getCapacity(), 360);
  });
});

describe('DashboardTrello.setAssignees', () => {
  let DT;
  let rest;
  let inputs;
  const t = {};

  before(() => {
    loadComponent('dashboard/dashboard-model.js');
    loadComponent('dashboard/dashboard-trello.js');
    DT = global.DashboardTrello;
  });

  beforeEach(() => {
    rest = [];
    inputs = [];
    global.SheetsTrello = {
      trelloRest: async (tt, path, method, body) => {
        rest.push([method, path, body]);
        return { ok: true, data: {} };
      },
    };
    global.PriorityTrello = {
      saveCardInputsById: async (tt, id, patch) => {
        inputs.push([id, patch]);
        return patch;
      },
    };
  });

  it('writes the members through REST (idMembers) and the contacts into the stored inputs', async () => {
    await DT.setAssignees(t, 'c1', { members: ['m2', 'm3'], contacts: [{ id: 'person-n', name: 'Nadia' }] });
    assert.deepEqual(rest, [['PUT', '/cards/c1', { idMembers: 'm2,m3' }]]);
    assert.deepEqual(inputs, [['c1', { customAssignees: [{ id: 'person-n', name: 'Nadia' }] }]]);
  });

  it('leaves alone what is null', async () => {
    await DT.setAssignees(t, 'c1', { members: null, contacts: [] });
    assert.equal(rest.length, 0);
    assert.deepEqual(inputs, [['c1', { customAssignees: [] }]]);
    await DT.setAssignees(t, 'c1', { members: [], contacts: null });
    assert.deepEqual(rest, [['PUT', '/cards/c1', { idMembers: '' }]]);
    assert.equal(inputs.length, 1);
  });

  it('a refused write rejects with its reason, so the view can say it and reload', async () => {
    global.SheetsTrello.trelloRest = async () => ({ ok: false, reason: 'not-authorized' });
    await assert.rejects(DT.setAssignees(t, 'c1', { members: ['m2'], contacts: null }), (err) => err.reason === 'not-authorized');
    assert.equal(inputs.length, 0);
  });
});
