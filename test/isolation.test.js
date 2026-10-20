'use strict';

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

function card(id, extra) {
  return Object.assign({ id: id, name: id, items: [], assignees: [] }, extra || {});
}

describe('Isolation', () => {
  let Iso;
  let VT;
  let DM;

  before(() => {
    loadComponent('shared/isolation.js');
    loadComponent('shared/view-tabs.js');
    loadComponent('docs/docs-model.js');
    Iso = global.Isolation;
    VT = global.ViewTabs;
    DM = global.DocsModel;
  });

  afterEach(() => {
    Iso.clear();
    Iso.setWorld([]);
  });

  const rows = [
    card('parent', {
      project: 'Site',
      projectId: 'g:site',
      assignees: [{ id: 'ada', name: 'Ada' }],
      items: [
        { id: 'a', text: 'A', items: [{ id: 'a1', text: 'A1' }] },
        { id: 'b', text: 'B' },
        { id: 'link', text: 'Lien', linkedCardId: 'child' },
      ],
    }),
    card('child', { project: '', items: [{ id: 'c1', text: 'Chez l’enfant' }] }),
    card('other', {
      project: 'Autre',
      projectId: 'g:autre',
      assignees: [{ id: 'bob', name: 'Bob' }],
      items: [{ id: 'o1', text: 'Ailleurs' }],
    }),
  ];

  function world() {
    return Iso.indexRows(rows);
  }

  it('a project keeps its cards, their linked children and their subtasks', () => {
    const k = Iso.kept({ kind: 'project', id: 'g:site', label: 'Site' }, world());
    assert.equal(k.cards.parent, true);
    assert.equal(k.cards.child, true);
    assert.equal(k.cards.other, undefined);
    assert.equal(k.subs['sub:parent:a'], true);
    assert.equal(k.subs['sub:parent:a1'], true);
    assert.equal(k.subs['sub:child:c1'], true);
    assert.equal(k.subs['sub:other:o1'], undefined);
  });

  it('a parent task keeps its subtree and fades the rest', () => {
    const k = Iso.kept({ kind: 'task', id: 'parent', label: 'parent' }, world());
    assert.equal(k.cards.parent, true);
    assert.equal(k.cards.child, true);
    assert.equal(k.cards.other, undefined);
    assert.equal(k.subs['sub:parent:b'], true);
  });

  it('a subtask keeps its parent card, itself and its nested lines', () => {
    const k = Iso.kept({ kind: 'subtask', id: 'sub:parent:a', label: 'A', cardId: 'parent' }, world());
    assert.equal(k.cards.parent, true);
    assert.equal(k.cards.child, undefined);
    assert.equal(k.subs['sub:parent:a'], true);
    assert.equal(k.subs['sub:parent:a1'], true);
    assert.equal(k.subs['sub:parent:b'], undefined);
  });

  it('a person keeps the cards assigned to them and the work under those cards', () => {
    const k = Iso.kept({ kind: 'person', id: 'ada', label: 'Ada' }, world());
    assert.equal(k.cards.parent, true);
    assert.equal(k.cards.child, true);
    assert.equal(k.cards.other, undefined);
    assert.equal(k.subs['sub:parent:a'], true);
  });

  it('an unknown subject does not dim the board', () => {
    assert.equal(Iso.kept({ kind: 'task', id: 'missing' }, world()), null);
    assert.equal(Iso.kept(null, world()), null);
  });

  it('resolves a project id from the goal map', () => {
    const map = Iso.indexProjects({
      nodes: [
        { id: 'o', level: 'objective', name: 'Lancer' },
        { id: 'g:site', level: 'project', name: 'Site' },
      ],
      links: [
        { from: 'g:site', to: 'o' },
        { from: 'parent', to: 'g:site' },
      ],
    });
    assert.deepEqual(map.parent, { id: 'g:site', name: 'Site' });
  });

  it('opens the task page, the parent page for a subtask, and the project or person page', () => {
    Iso.set({ kind: 'task', id: 'parent', label: 'Parent' });
    assert.deepEqual(Iso.docTarget(), { kind: 'task', id: 'parent', name: 'Parent' });
    Iso.set({ kind: 'subtask', id: 'sub:parent:a', label: 'A', cardId: 'parent' });
    assert.equal(Iso.docTarget().kind, 'task');
    assert.equal(Iso.docTarget().id, 'parent');
    Iso.set({ kind: 'project', id: 'g:site', label: 'Site' });
    assert.deepEqual(Iso.docTarget(), { kind: 'project', id: 'g:site', name: 'Site' });
    Iso.set({ kind: 'person', id: 'ada', label: 'Ada' });
    assert.equal(Iso.docTarget().kind, 'person');
    Iso.clear();
    assert.equal(Iso.docTarget(), null);
  });

  it('the menu offers the task, the subtask, the project and each person', () => {
    Iso.setWorld(rows);
    const items = Iso.menuItems({
      cardId: 'parent',
      cardName: 'Parent',
      subId: 'sub:parent:a',
      subName: 'A',
      people: Iso.peopleOf(rows[0]),
    });
    const sub = items.filter((it) => it.children)[0];
    assert.equal(sub.label, 'Isoler');
    assert.deepEqual(sub.children.map((c) => c.label), ['Cette tâche', 'Cette sous-tâche', 'Projet « Site »', 'Ada']);
  });

  it('Documents URL carries the project or the person', () => {
    const loc = new URL('https://example.test/table.html?x=1');
    const project = new URL(VT.hrefForSubject('./docs.html', loc, 'project', 'g:site', 'Site'));
    assert.equal(project.searchParams.get('docProject'), 'g:site');
    assert.equal(project.searchParams.get('docName'), 'Site');
    assert.equal(project.searchParams.get('docTask'), null);
    const person = new URL(VT.hrefForSubject('./docs.html', loc, 'person', 'ada', 'Ada'));
    assert.equal(person.searchParams.get('docPerson'), 'ada');
    assert.equal(DM.normalizeSubject({ k: 'person', id: 'ada' }).k, 'person');
    assert.equal(DM.normalizeSubject('person:ada').id, 'ada');
    assert.equal(DM.normalizeSubject({ k: 'project', id: 'g:site' }).id, 'g:site');
  });
});
