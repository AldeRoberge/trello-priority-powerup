'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('daily document', () => {
  let DD;
  let DM;

  before(() => {
    loadComponent('docs/docs-model.js');
    loadComponent('docs/docs-daily.js');
    DD = global.DocsDaily;
    DM = global.DocsModel;
  });

  const row = (id, name, extra) => Object.assign({ id, name, statutKey: 'unstarted', labels: [], inputs: {} }, extra);
  const TODAY = '2026-10-31';

  const rows = [
    row('a', 'Trim beard', { due: TODAY, priority: 5 }),
    row('b', 'Epoxy', { due: '2026-10-29', priority: 9 }),
    row('c', 'Done today', { due: TODAY, statutKey: 'completed' }),
    row('d', 'Old done', { due: '2026-10-01', statutKey: 'completed' }),
    row('e', 'Pumpkins', { inputs: { customAssignees: [{ name: 'Kate' }] } }),
    row('f', 'Candy', { inputs: { customAssignees: [{ name: 'Kate' }] } }),
    row('g', 'Pegs', { inputs: { places: { from: { id: 'p1', name: 'Chalet' } } } }),
    row('h', 'Budget'),
    row('i', 'Future', { due: '2026-11-20' }),
    row('j', 'Vague one', { due: '2026-12-01', dueVague: 'bientot' }),
    row('k', 'AirPods', { labels: [{ name: 'Travail' }] }),
  ];

  it('files each open task in one section', () => {
    const s = DD.build(rows, TODAY);
    const by = Object.fromEntries(s.map((x) => [x.title, x.items.map((i) => i.id)]));
    assert.deepEqual(by['À faire aujourd’hui'], ['b', 'a', 'c']);
    assert.deepEqual(by['À apporter à Kate'], ['e', 'f']);
    assert.deepEqual(by['À rapporter de Chalet'], ['g']);
    assert.deepEqual(by['À faire éventuellement'].sort(), ['h', 'j']);
    assert.deepEqual(by['Travail'], ['k']);
    const all = [].concat(...Object.values(by));
    assert.equal(new Set(all).size, all.length);
    assert.ok(!all.includes('d') && !all.includes('i'));
  });

  it('checks a task finished today', () => {
    const s = DD.build(rows, TODAY)[0];
    assert.equal(s.items.find((i) => i.id === 'c').done, true);
    assert.equal(s.items.find((i) => i.id === 'a').done, false);
  });

  it('writes a warning, chips and a rule, and renders as a callout and a checklist', () => {
    const md = DD.markdown(DD.build(rows, TODAY), '');
    assert.match(md, /^> \[!warning\]\n> Document généré automatiquement/);
    assert.match(md, /- \[ \] \[@Trim beard\]\(task:a\)/);
    assert.match(md, /- \[x\] \[@Done today\]\(task:c\)/);
    const html = DM.mdToHtml(md);
    assert.match(html, /data-callout="warning"/);
    assert.match(html, /dc-todo/);
    assert.match(html, /data-m="task" data-id="a"/);
  });

  it('round-trips through parse', () => {
    const items = DD.parse(DD.markdown(DD.build(rows, TODAY), '')).items;
    const c = items.find((i) => i.taskId === 'c');
    assert.equal(c.checked, true);
    assert.equal(c.kind, 'today');
    assert.equal(items.find((i) => i.taskId === 'e').kind, 'group');
  });

  it('turns typed lines into cards and keeps the rest as notes', () => {
    const md = DD.markdown(DD.build(rows, TODAY), '').replace(
      '## À faire éventuellement\n',
      '## À faire éventuellement\n\n- [ ] Call Marc\n'
    ).replace('- [ ] \n\n## À apporter', '- [ ] Buy glue\n- [x] Water plants\n\n## À apporter')
      .replace('## À rapporter de Chalet\n', '## À rapporter de Chalet\n\n- [ ] Drill bits\n');
    const r = DD.reconcile(md);
    assert.deepEqual(r.create.map((c) => [c.kind, c.text, c.done]), [
      ['today', 'Buy glue', false],
      ['today', 'Water plants', true],
      ['later', 'Call Marc', false],
    ]);
    assert.deepEqual(r.strays, ['- [ ] Drill bits']);
  });

  it('ignores empty boxes and keeps user notes under the rule', () => {
    const md = DD.markdown(DD.build([], TODAY), 'Ma note');
    assert.deepEqual(DD.reconcile(md).create, []);
    assert.equal(DD.parse(md).notes.trim(), 'Ma note');
    assert.match(DD.markdown(DD.build([], TODAY), DD.notesOf(md)), /---\n\nMa note$/);
  });

  it('escapes brackets in a task name', () => {
    const md = DD.markdown([{ kind: 'today', title: 'À faire aujourd’hui', items: [{ id: 'z', name: 'Fix [x] thing', done: false }] }], '');
    assert.equal(DD.parse(md).items[0].taskId, 'z');
  });

  it('accepts the day subject on a document', () => {
    assert.deepEqual(DM.normalizeSubject('day:today'), { k: 'day', id: 'today' });
    assert.deepEqual(DM.unpackDesc(DM.packDesc('x', { subject: { k: 'day', id: 'today' } })).subject, { k: 'day', id: 'today' });
    assert.equal(DM.normalizeSubject('day:other'), null);
  });
});
