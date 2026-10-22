'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');
const FakeTrello = require('../sandbox/e2e/fake-trello.js');

describe('document page (subject + fields)', () => {
  let DM;
  let DT;
  let VT;

  before(() => {
    loadComponent('docs/docs-model.js');
    loadComponent('docs/docs-trello.js');
    loadComponent('shared/view-tabs.js');
    DM = global.DocsModel;
    DT = global.DocsTrello;
    VT = global.ViewTabs;
  });

  it('packs and unpacks a task subject, tags and people without touching the body', () => {
    const body = '# Notes\n\nligne';
    const desc = DM.packDesc(body, {
      rev: 3,
      subject: { k: 'task', id: 'card123' },
      props: { tags: ['Urgent', 'urgent', 'Plan'], people: ['m1', 'm1', 'bad id'] },
    });
    const back = DM.unpackDesc(desc);
    assert.equal(back.body, body);
    assert.equal(back.rev, 3);
    assert.deepEqual(back.subject, { k: 'task', id: 'card123' });
    assert.deepEqual(back.props.tags, ['Urgent', 'Plan']);
    assert.deepEqual(back.props.people, ['m1']);
    assert.deepEqual(DM.normalizeProps({ people: ['person-m1abc-xy12', 'person-m1abc-xy12'] }).people, ['person-m1abc-xy12']);
  });

  it('drops a forged or unknown subject and keeps a cover line', () => {
    assert.equal(DM.normalizeSubject('note:abc'), null);
    assert.equal(DM.normalizeSubject({ k: 'task', id: 'a b' }), null);
    const desc = DM.packDesc('x', { rev: 1, cover: { k: 'color', v: '#0c66e4' }, subject: 'entity:ent1' });
    const back = DM.unpackDesc(desc);
    assert.equal(back.cover.k, 'color');
    assert.deepEqual(back.subject, { k: 'entity', id: 'ent1' });
    assert.equal(back.props, null);
  });

  it('finds the document already bound to a subject', () => {
    const docs = [
      { id: 'd1', subject: { k: 'task', id: 'c1' } },
      { id: 'd2', subject: null },
    ];
    assert.equal(DM.docForSubject(docs, 'task', 'c1').id, 'd1');
    assert.equal(DM.docForSubject(docs, 'entity', 'c1'), null);
  });

  it('builds a document URL and an entity URL', () => {
    const loc = { href: 'https://example.com/gantt.html?x=1#z', search: '?x=1', hash: '#z' };
    const task = new URL(VT.hrefForSubject('./docs.html', loc, 'task', 'abc'));
    assert.equal(task.searchParams.get('docTask'), 'abc');
    assert.equal(task.searchParams.get('x'), '1');
    assert.equal(task.hash, '#z');
    const ent = new URL(VT.hrefForSubject('./entities.html', loc, 'entity', 'e9'));
    assert.equal(ent.searchParams.get('entity'), 'e9');
    assert.equal(ent.searchParams.get('docEntity'), null);
  });

  describe('DocsTrello', () => {
    let fake;

    beforeEach(() => {
      fake = FakeTrello.create({
        cards: [
          { id: 'task1', name: 'Arroser', idList: 'l1', desc: 'visible\n\n<!--cerveau-meta\ntype: card\n-->', members: [{ id: 'm1', fullName: 'Marie Tremblay' }], labels: [{ id: 'lb1', name: 'Maison', color: 'green' }] },
          { id: 'ent1', name: '🧩 Monstera', idList: 'l1', closed: true, desc: 'Entité Monstera\n\n<!--cerveau-entity\n{"name":"Monstera","aliases":["plante"]}\n-->' },
        ],
        members: [{ id: 'm1', fullName: 'Marie Tremblay', username: 'marie' }],
      });
      global.SheetsTrello = { trelloRest: fake.trelloRest };
      global.DescMeta = {
        splitDesc(full) {
          const text = String(full || '');
          const start = text.lastIndexOf('<!--cerveau-meta');
          if (start < 0) return { visible: text.trim(), meta: {} };
          return { visible: text.slice(0, start).trim(), meta: { type: 'card' } };
        },
        joinDesc(visible, meta) {
          if (!meta || !Object.keys(meta).length) return visible;
          return visible + '\n\n<!--cerveau-meta\ntype: ' + meta.type + '\n-->';
        },
      };
    });

    it('creates a page bound to a task and keeps the link when the text is saved', async () => {
      const doc = await DT.createDoc(fake.t, 'Arroser', 'notes', { subject: { k: 'task', id: 'task1' }, props: { tags: ['eau'] } });
      assert.deepEqual(doc.subject, { k: 'task', id: 'task1' });
      assert.deepEqual(doc.props.tags, ['eau']);
      const listed = await DT.listDocs(fake.t);
      assert.equal(DM.docForSubject(listed, 'task', 'task1').id, doc.id);
      await DT.saveDoc(fake.t, { id: doc.id, body: 'notes 2', rev: 1 });
      const again = await DT.loadDoc(fake.t, doc.id);
      assert.equal(again.body, 'notes 2');
      assert.deepEqual(again.subject, { k: 'task', id: 'task1' });
      assert.deepEqual(again.props.tags, ['eau']);
    });

    it('reuses the existing page and reads the task fields', async () => {
      const first = await DT.ensureSubjectDoc(fake.t, 'task', 'task1');
      assert.equal(first.created, true);
      assert.equal(first.doc.title, 'Arroser');
      const second = await DT.ensureSubjectDoc(fake.t, 'task', 'task1');
      assert.equal(second.created, false);
      assert.equal(second.doc.id, first.doc.id);
      const face = await DT.loadCardFace(fake.t, 'task1');
      assert.equal(face.desc, 'visible');
      assert.equal(face.members[0].name, 'Marie Tremblay');
      assert.equal(face.labels[0].name, 'Maison');
      await DT.setCardMembers(fake.t, 'task1', []);
      assert.deepEqual((await DT.loadCardFace(fake.t, 'task1')).members, []);
      await DT.saveCardDesc(fake.t, 'task1', 'nouveau');
      const card = fake.cards.find((c) => c.id === 'task1');
      assert.match(card.desc, /nouveau/);
      assert.match(card.desc, /cerveau-meta/);
    });

    it('reads an entity face and patches tags without dropping the subject', async () => {
      const face = await DT.loadEntityFace(fake.t, 'ent1');
      assert.equal(face.name, 'Monstera');
      assert.deepEqual(face.aliases, ['plante']);
      const choices = await DT.listEntityChoices(fake.t);
      assert.deepEqual(choices.map((c) => c.name), ['Monstera']);
      const doc = await DT.createDoc(fake.t, 'Monstera', '', { subject: { k: 'entity', id: 'ent1' } });
      const patched = await DT.patchMeta(fake.t, doc, { props: { tags: ['vivant'], people: ['m1'] } });
      assert.deepEqual(patched.subject, { k: 'entity', id: 'ent1' });
      assert.deepEqual(patched.props.tags, ['vivant']);
      const cleared = await DT.patchMeta(fake.t, { id: doc.id, rev: patched.rev }, { subject: null });
      assert.equal(cleared.subject, null);
      assert.deepEqual(cleared.props.tags, ['vivant']);
    });
  });
});
