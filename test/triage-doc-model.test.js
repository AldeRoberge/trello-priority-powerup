'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('TriageDocModel', () => {
  let M;
  before(() => {
    loadComponent('kanban/kanban-ai.js');
    loadComponent('dashboard/triage-doc-model.js');
    M = global.TriageDocModel;
    assert.ok(M);
  });

  /* A node-like tree: what the editor gives, without a browser. */
  const text = (s) => ({ nodeType: 3, nodeValue: s });
  const el = (name, kids = [], attrs = {}) => ({
    nodeType: 1,
    nodeName: name.toUpperCase(),
    childNodes: kids,
    getAttribute: (k) => (attrs[k] == null ? null : attrs[k]),
  });
  const root = (...kids) => el('div', kids);

  const rawCtx = {
    projects: [{ id: 'g:p1', name: 'Refonte du site' }, { id: 'g:p2', name: 'Déclaration d’impôts' }],
    members: [
      { id: 'm1', fullName: 'Paul Tremblay', username: 'paul' },
      { id: 'm2', fullName: 'Marie Gagnon', username: 'marie' },
      { id: 'm3', fullName: 'Paul Lavoie', username: 'plavoie' },
    ],
    customAssignees: [
      { id: 'c1', name: 'Sylviane Mailhot' },
      { id: 'c2', name: 'Marie Gagnon', trelloMemberId: 'm2' },
    ],
    places: [{ id: 'p1', name: 'Bureau' }, { id: 'p2', name: 'Maison' }],
    labels: [{ id: 'lb1', name: 'Urgent', color: 'red' }, { id: 'lb3', name: 'Finances', color: 'green' }],
    entities: [{ name: 'Sylviane Mailhot', types: ['Personne'], roles: ['boss'] }],
  };

  describe('partsFromNode', () => {
    it('reads lines, keeps indentation and blank lines', () => {
      const parts = M.partsFromNode(root(
        text('Projet'),
        el('div', [text('- étape un')]),
        el('div', [text('\tsous-étape')]),
        el('div', [el('br')]),
        el('div', [text('Fin')])
      ));
      assert.deepEqual(parts, [{ type: 'text', text: 'Projet\n- étape un\n\tsous-étape\n\nFin' }]);
    });

    it('splits the text where an image sits and ignores what is inside the image block', () => {
      const parts = M.partsFromNode(root(
        el('div', [text('Avant')]),
        el('figure', [el('img'), el('button', [text('x')])], { 'data-img': 'i7' }),
        el('div', [text('Après')])
      ));
      assert.deepEqual(parts, [
        { type: 'text', text: 'Avant' },
        { type: 'image', id: 'i7' },
        { type: 'text', text: 'Après' },
      ]);
    });

    it('turns non-breaking spaces into spaces, drops trailing spaces and long blank runs', () => {
      const parts = M.partsFromNode(root(text('a\u00a0b  \n\n\n\nc')));
      assert.equal(parts[0].text, 'a b\n\nc');
    });

    it('an empty editor has no parts and no content', () => {
      assert.deepEqual(M.partsFromNode(root(el('div', [el('br')]))), []);
      assert.equal(M.hasContent([]), false);
      assert.equal(M.hasContent([{ type: 'text', text: '  ' }]), false);
      assert.equal(M.hasContent([{ type: 'image', id: 'i1' }]), true);
    });
  });

  describe('docText', () => {
    const parts = [{ type: 'text', text: 'Liste :' }, { type: 'image', id: 'i4' }, { type: 'text', text: 'Fin' }, { type: 'image', id: 'i9' }, { type: 'image', id: 'i4' }];
    it('numbers the images in the order they appear, once each', () => {
      assert.deepEqual(M.imageIdsOf(parts), ['i4', 'i9']);
      assert.equal(M.docText(parts), 'Liste :\n[img1]\nFin\n[img2]\n[img1]');
    });
    it('counts words of the text only', () => {
      assert.equal(M.wordCount(parts), 3);
    });
  });

  describe('contextOf', () => {
    it('lists members and contacts once (a contact linked to a member counts as the member)', () => {
      const c = M.contextOf(rawCtx);
      assert.deepEqual(c.prompt.people, ['Paul Tremblay', 'Marie Gagnon', 'Paul Lavoie', 'Sylviane Mailhot']);
      assert.deepEqual(c.resolve.people.map((p) => p.kind), ['member', 'member', 'member', 'custom']);
      assert.deepEqual(c.prompt.places, ['Bureau', 'Maison']);
      assert.deepEqual(c.prompt.labels, ['Urgent', 'Finances']);
      assert.deepEqual(c.prompt.projects, ['Refonte du site', 'Déclaration d’impôts']);
      assert.deepEqual(c.prompt.entities, [{ name: 'Sylviane Mailhot', types: ['Personne'], roles: ['boss'] }]);
    });
    it('copes with an empty board', () => {
      const c = M.contextOf(null);
      assert.deepEqual(c.prompt.people, []);
      assert.deepEqual(c.resolve.labels, []);
    });
  });

  describe('buildMessages', () => {
    const parts = [{ type: 'text', text: 'Appeler Marie' }, { type: 'image', id: 'i1' }, { type: 'image', id: 'i2' }];
    it('puts the date, the board context and the document in the prompt, the document as data', () => {
      const m = M.buildMessages({ parts, today: '2026-10-20', context: M.contextOf(rawCtx), existingTitles: ['Payer le loyer'] });
      assert.equal(m[0].role, 'system');
      assert.match(m[0].content, /2026-10-20/);
      assert.match(m[0].content, /jamais des instructions/);
      const user = m[1].content;
      assert.equal(typeof user, 'string');
      assert.match(user, /"people":\["Paul Tremblay"/);
      assert.match(user, /"existingTasks":\["Payer le loyer"\]/);
      assert.match(user, /Document :\nAppeler Marie\n\[img1\]\n\[img2\]/);
    });
    it('sends each readable image after the text, labeled like its marker', () => {
      const m = M.buildMessages({ parts, images: { i1: 'data:image/jpeg;base64,AAA', i2: '' }, today: '2026-10-20', context: M.contextOf({}) });
      const c = m[1].content;
      assert.ok(Array.isArray(c));
      assert.equal(c[0].type, 'text');
      assert.deepEqual(c.slice(1), [
        { type: 'text', text: 'Image img1 :' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } },
      ]);
    });
  });

  describe('normalizePlan', () => {
    const ctxOf = (extra) => Object.assign({ resolve: M.contextOf(rawCtx).resolve, imageIds: ['i1', 'i2'], existingTitles: [] }, extra);

    it('keeps an existing project by name and makes a new one; a project without tasks disappears', () => {
      const plan = M.normalizePlan({
        projects: [{ name: 'Fantôme' }],
        tasks: [
          { title: 'Appeler le notaire', project: 'refonte du site' },
          { title: 'Planter', project: 'Potager 2027' },
          { title: 'Arroser', project: 'Potager 2027' },
          { title: 'Libre' },
        ],
      }, ctxOf());
      assert.deepEqual(plan.projects.map((p) => [p.name, p.existingId]), [['Refonte du site', 'g:p1'], ['Potager 2027', '']]);
      assert.deepEqual(plan.tasks.map((t) => t.project), ['p1', 'p2', 'p2', '']);
    });

    it('checks titles, dates, urgency and duration', () => {
      const plan = M.normalizePlan({
        tasks: [
          { title: '  Rapport   mensuel  ', due: '2026-10-23', urgency: 'Au plus vite', estimate: '1h30' },
          { title: 'Bad date', due: '2026-02-31', urgency: 'aucune', estimate: 'beaucoup' },
          { title: 'Minutes', estimate: 45 },
          { title: 'Huge', estimate: 99999 },
        ],
      }, ctxOf());
      const [a, b, c, d] = plan.tasks;
      assert.equal(a.title, 'Rapport mensuel');
      assert.deepEqual([a.due, a.urgency, a.estimate], ['2026-10-23', 'au-plus-vite', 90]);
      assert.deepEqual([b.due, b.urgency, b.estimate], ['', '', 0]);
      assert.equal(c.estimate, 45);
      assert.equal(d.estimate, 1440);
    });

    it('matches people, places and labels to the board and keeps unknown people and places as new', () => {
      const plan = M.normalizePlan({
        tasks: [{ title: 'Réunion', people: ['marie', 'Paul', 'Sylviane Mailhot', 'Sylvain Roy', 'Marie Gagnon'], places: ['bureau', 'Café Zéro'], labels: ['finances', 'Inconnue'] }],
      }, ctxOf());
      const t = plan.tasks[0];
      assert.deepEqual(t.people, [
        { name: 'Marie Gagnon', id: 'm2', kind: 'member' },
        { name: 'Paul', id: '', kind: 'new' }, // two Pauls: no guess
        { name: 'Sylviane Mailhot', id: 'c1', kind: 'custom' },
        { name: 'Sylvain Roy', id: '', kind: 'new' },
      ]);
      assert.deepEqual(t.places, [{ name: 'Bureau', id: 'p1' }, { name: 'Café Zéro', id: '' }]);
      assert.deepEqual(t.labels, [{ name: 'Finances', id: 'lb3', color: 'green' }]);
    });

    it('nests subtasks one level, accepts plain strings and caps the lists', () => {
      const many = Array.from({ length: 40 }, (_, i) => 'étape ' + i);
      const plan = M.normalizePlan({
        tasks: [{ title: 'Déménager', subtasks: ['Boîtes', { text: 'Camion', estimate: 30, items: ['Réserver', { text: 'Payer' }, ''] }, { text: '' }].concat(many) }],
      }, ctxOf());
      const subs = plan.tasks[0].subtasks;
      assert.equal(subs.length, 25);
      assert.deepEqual(subs[1], { id: 't1s2', text: 'Camion', estimate: 30, items: [{ id: 't1s2i1', text: 'Réserver' }, { id: 't1s2i2', text: 'Payer' }] });
      assert.deepEqual(subs[0].items, []);
    });

    it('maps the image labels to editor images, keeps what was read, drops unknown labels', () => {
      const plan = M.normalizePlan({
        images: [{ id: 'img2', text: 'Ordonnance : appeler la pharmacie' }, { id: 'img9', text: 'ghost' }, { id: 'img1', text: '' }],
        tasks: [{ title: 'Pharmacie', images: ['img2', 'img2', 'img7'] }],
      }, ctxOf());
      assert.deepEqual(plan.images, [{ id: 'i2', label: 'img2', text: 'Ordonnance : appeler la pharmacie' }]);
      assert.deepEqual(plan.tasks[0].imageIds, ['i2']);
    });

    it('marks a task already in the triage and leaves it out; repeated titles are kept once', () => {
      const plan = M.normalizePlan({ tasks: [{ title: 'Payer le loyer' }, { title: 'payer le loyer' }, { title: 'Acheter du lait' }, { title: 'Acheter du lait' }] }, ctxOf({ existingTitles: ['Payer le loyer'] }));
      assert.equal(plan.tasks.length, 2);
      assert.deepEqual([plan.tasks[0].include, plan.tasks[0].duplicate], [false, 'Payer le loyer']);
      assert.deepEqual([plan.tasks[1].include, plan.tasks[1].duplicate], [true, '']);
    });

    it('survives nonsense', () => {
      assert.deepEqual(M.normalizePlan(null, {}).tasks, []);
      assert.deepEqual(M.normalizePlan({ tasks: [null, 3, { title: '' }, 'Une vraie'] }, {}).tasks.map((t) => t.title), ['Une vraie']);
      assert.equal(M.normalizePlan({ tasks: Array.from({ length: 80 }, (_, i) => ({ title: 't' + i })) }, {}).tasks.length, M.MAX_TASKS);
    });
  });

  describe('outlinePlan (no provider)', () => {
    const outline = (...parts) => M.outlinePlan(parts, { resolve: M.contextOf(rawCtx).resolve, imageIds: parts.filter((p) => p.type === 'image').map((p) => p.id) });

    it('reads headings as projects, lines as tasks and deeper lines as subtasks', () => {
      const plan = outline({
        type: 'text',
        text: '# Déménagement\n- Réserver le camion\n  - Comparer les prix\n  - Appeler Marc\n      - Demander un devis\n- Changer l’adresse\n\nPayer le loyer',
      });
      assert.deepEqual(plan.projects.map((p) => p.name), ['Déménagement']);
      assert.deepEqual(plan.tasks.map((t) => [t.title, t.project]), [['Réserver le camion', 'p1'], ['Changer l’adresse', 'p1'], ['Payer le loyer', 'p1']]);
      const subs = plan.tasks[0].subtasks;
      assert.deepEqual(subs.map((s) => s.text), ['Comparer les prix', 'Appeler Marc']);
      assert.deepEqual(subs[1].items.map((i) => i.text), ['Demander un devis']);
    });

    it('a line ending with a colon takes the flat bullets below it as subtasks, until a blank line', () => {
      const plan = outline({ type: 'text', text: 'Courses :\n- lait\n- pain\n\n- Appeler Luc' });
      assert.deepEqual(plan.tasks.map((t) => t.title), ['Courses', 'Appeler Luc']);
      assert.deepEqual(plan.tasks[0].subtasks.map((s) => s.text), ['lait', 'pain']);
    });

    it('"Projet : X" is a project too, numbers and checkboxes are stripped', () => {
      const plan = outline({ type: 'text', text: 'Projet : Potager\n1. Acheter le terreau\n[ ] Planter\n- [x] Arroser' });
      assert.deepEqual(plan.projects.map((p) => p.name), ['Potager']);
      assert.deepEqual(plan.tasks.map((t) => t.title), ['Acheter le terreau', 'Planter', 'Arroser']);
    });

    it('an image goes with the task above it, or the first task when it comes first', () => {
      const plan = outline(
        { type: 'image', id: 'i1' },
        { type: 'text', text: 'Premier\nSecond' },
        { type: 'image', id: 'i2' }
      );
      assert.deepEqual(plan.tasks.map((t) => t.imageIds), [['i1'], ['i2']]);
    });
  });

  describe('what the review shows', () => {
    const mkPlan = () => M.normalizePlan({
      tasks: [
        { title: 'A', project: 'Alpha', subtasks: [{ text: 's1', items: ['n1', 'n2'] }, 's2'] },
        { title: 'B', project: 'Alpha' },
        { title: 'C', project: 'Beta' },
        { title: 'D' },
      ],
    }, { resolve: M.contextOf({}).resolve, imageIds: [], existingTitles: [] });

    it('groups by project in order, loose tasks last', () => {
      const g = M.groups(mkPlan());
      assert.deepEqual(g.map((x) => [x.project && x.project.name, x.tasks.map((t) => t.title)]), [['Alpha', ['A', 'B']], ['Beta', ['C']], [null, ['D']]]);
    });

    it('counts what would be created and says it in French', () => {
      const plan = mkPlan();
      const s = M.stats(plan);
      assert.deepEqual(s, { tasks: 4, subtasks: 4, projects: 2 });
      assert.equal(M.summaryLine(s), '2 projets · 4 tâches · 4 sous-tâches');
      assert.equal(M.createLabel(s), 'Créer 4 tâches');
      plan.tasks[3].include = false;
      plan.tasks[2].include = false;
      assert.deepEqual(M.stats(plan), { tasks: 2, subtasks: 4, projects: 1 });
      assert.equal(M.summaryLine({ tasks: 1, subtasks: 1, projects: 1 }), '1 projet · 1 tâche · 1 sous-tâche');
      assert.equal(M.createLabel({ tasks: 1 }), 'Créer 1 tâche');
      assert.equal(M.createLabel({ tasks: 0 }), 'Créer');
    });

    it('a project box is all, some or none, and sets its tasks together', () => {
      const plan = mkPlan();
      assert.equal(M.projectState(plan, 'p1'), 'all');
      plan.tasks[0].include = false;
      assert.equal(M.projectState(plan, 'p1'), 'some');
      M.setProject(plan, 'p1', false);
      assert.equal(M.projectState(plan, 'p1'), 'none');
      M.setProject(plan, 'p1', true);
      assert.equal(M.projectState(plan, 'p1'), 'all');
    });

    it('a task already written is not counted again and keeps its box', () => {
      const plan = mkPlan();
      plan.tasks[0].createdId = 'card1';
      assert.equal(M.stats(plan).tasks, 3);
      M.setProject(plan, 'p1', false);
      assert.equal(plan.tasks[0].include, true);
    });

    it('lists the images no task keeps', () => {
      const plan = M.normalizePlan({ tasks: [{ title: 'X', images: ['img1'] }] }, { resolve: M.contextOf({}).resolve, imageIds: ['i1', 'i2'] });
      assert.deepEqual(M.orphanImages(plan, [{ type: 'image', id: 'i1' }, { type: 'image', id: 'i2' }]), ['i2']);
    });
  });

  describe('parse', () => {
    const parts = [{ type: 'text', text: 'Appeler Marie demain\n- Préparer les notes' }, { type: 'image', id: 'i1' }];
    const reply = (obj) => ({ content: JSON.stringify(obj) });
    let calls;
    let saved;
    beforeEach(() => {
      calls = [];
      saved = global.PriorityAgent;
      global.PriorityAgent = {
        getProvider: async () => ({ key: 'k' }),
        isConfigured: () => true,
        chatCompletions: async (p, messages, opts) => {
          calls.push({ messages, opts });
          return reply({ summary: 'ok', tasks: [{ title: 'Appeler Marie', people: ['Marie'], subtasks: ['Préparer les notes'] }] });
        },
      };
    });
    afterEach(() => { global.PriorityAgent = saved; });

    it('asks the provider with the document and the images, and normalizes the plan', async () => {
      const res = await M.parse({}, { parts, images: { i1: 'data:image/jpeg;base64,AAA' }, context: rawCtx, today: '2026-10-20', existingTitles: [] });
      assert.equal(res.via, 'ai');
      assert.equal(calls.length, 1);
      assert.ok(Array.isArray(calls[0].messages[1].content));
      assert.equal(calls[0].opts.temperature, 0.2);
      assert.deepEqual(res.plan.tasks[0].people, [{ name: 'Marie Gagnon', id: 'm2', kind: 'member' }]);
      assert.deepEqual(res.notes, []);
    });

    it('asks again without the images when the model cannot read them, and says so', async () => {
      let n = 0;
      global.PriorityAgent.chatCompletions = async (p, messages) => {
        n++;
        calls.push({ messages });
        if (n === 1) throw new Error('image input not supported');
        return reply({ tasks: [{ title: 'Appeler Marie' }] });
      };
      const res = await M.parse({}, { parts, images: { i1: 'data:image/jpeg;base64,AAA' }, context: {}, today: '2026-10-20' });
      assert.equal(calls.length, 2);
      assert.equal(typeof calls[1].messages[1].content, 'string');
      assert.match(res.notes[0], /images/);
      assert.equal(res.plan.tasks.length, 1);
    });

    it('does not retry a text-only document that failed', async () => {
      global.PriorityAgent.chatCompletions = async () => { throw new Error('réseau'); };
      await assert.rejects(M.parse({}, { parts: [parts[0]], images: {}, context: {} }), /réseau/);
    });

    it('rejects an unreadable reply', async () => {
      global.PriorityAgent.chatCompletions = async () => ({ content: 'pas du json' });
      await assert.rejects(M.parse({}, { parts: [parts[0]], context: {} }), /illisible/);
    });

    it('falls back to the structure of the text, with a note, when no provider is configured', async () => {
      global.PriorityAgent.isConfigured = () => false;
      const res = await M.parse({}, { parts: [parts[0]], context: {} });
      assert.equal(res.via, 'outline');
      assert.equal(calls.length, 0);
      assert.match(res.notes[0], /fournisseur/);
      assert.equal(res.plan.tasks[0].title.indexOf('Appeler Marie'), 0);
      assert.deepEqual(res.plan.tasks[0].subtasks.map((s) => s.text), []);
    });

    it('works with no assistant on the page at all', async () => {
      global.PriorityAgent = undefined;
      const res = await M.parse({}, { parts: [parts[0]], context: {} });
      assert.equal(res.via, 'outline');
    });
  });

  describe('editing the plan by asking the AI', () => {
    const resolve = () => M.contextOf(rawCtx).resolve;
    const base = () => M.normalizePlan({
      summary: 'Un projet de jardin.',
      images: [{ id: 'img1', text: 'Liste : terreau' }],
      tasks: [
        { title: 'Préparer', project: 'Potager', desc: 'Notes', due: '2026-10-23', urgency: 'vite', estimate: 30, people: ['Marie'], places: ['Maison'], labels: ['Finances'], images: ['img1'], subtasks: [{ text: 'Terreau', estimate: 10, items: ['Tuteurs'] }] },
        { title: 'Appeler', project: 'Potager' },
        { title: 'Payer le loyer' },
      ],
    }, { resolve: resolve(), imageIds: ['i1'], existingTitles: [] });
    const norm = () => ({ resolve: resolve(), imageIds: ['i1'], existingTitles: [] });

    it('planForPrompt shows names, leaves empty fields out and flags what the user put aside', () => {
      const plan = base();
      plan.tasks[2].include = false;
      const p = M.planForPrompt(plan);
      assert.deepEqual(p.projects, ['Potager']);
      assert.deepEqual(p.tasks[0], {
        id: 't1', title: 'Préparer', project: 'Potager', desc: 'Notes', due: '2026-10-23', urgency: 'vite', estimate: 30,
        people: ['Marie Gagnon'], places: ['Maison'], labels: ['Finances'], subtasks: [{ text: 'Terreau', estimate: 10, items: ['Tuteurs'] }],
      });
      assert.deepEqual(p.tasks[1], { id: 't2', title: 'Appeler', project: 'Potager' });
      assert.deepEqual(p.tasks[2], { id: 't3', title: 'Payer le loyer', ecartee: true });
    });

    it('a task written as just its id is unchanged, a task with some fields keeps the others', () => {
      const plan = base();
      plan.tasks[1].include = false; // the user put it aside
      const next = M.normalizePlan({ tasks: [{ id: 't1', title: 'Préparer le jardin', due: '' }, { id: 't2' }, { id: 't3' }] }, Object.assign(norm(), { previous: plan }));
      const [a, b, c] = next.tasks;
      assert.equal(a.title, 'Préparer le jardin');
      assert.equal(a.due, '');
      assert.deepEqual([a.desc, a.urgency, a.estimate], ['Notes', 'vite', 30]);
      assert.deepEqual(a.people, plan.tasks[0].people);
      assert.deepEqual(a.places, plan.tasks[0].places);
      assert.deepEqual(a.labels, plan.tasks[0].labels);
      assert.deepEqual(a.imageIds, ['i1']);
      assert.deepEqual(a.subtasks.map((x) => [x.text, x.estimate, x.items.map((i) => i.text)]), [['Terreau', 10, ['Tuteurs']]]);
      assert.equal(b.include, false);
      assert.equal(next.projects.length, 1);
      assert.equal(next.projects[0].name, 'Potager');
      assert.equal(a.project, 'p1');
      assert.equal(b.project, 'p1');
      assert.equal(c.project, '');
      assert.deepEqual(next.images, plan.images);
      assert.equal(next.summary, 'Un projet de jardin.');
    });

    it('a field that is written replaces the old one, an empty one clears it', () => {
      const plan = base();
      const next = M.normalizePlan({
        tasks: [{ id: 't1', people: [], subtasks: ['Un', 'Deux'], project: '' }, { id: 't2', project: 'Divers', labels: ['Finances'] }, { id: 't3', project: 'Divers' }],
      }, Object.assign(norm(), { previous: plan }));
      assert.deepEqual(next.tasks[0].people, []);
      assert.deepEqual(next.tasks[0].subtasks.map((s) => s.text), ['Un', 'Deux']);
      assert.equal(next.tasks[0].project, '');
      assert.deepEqual(next.projects.map((p) => p.name), ['Divers']);
      assert.deepEqual(next.tasks.slice(1).map((t) => t.project), ['p1', 'p1']);
      assert.deepEqual(next.tasks[1].labels, [{ name: 'Finances', id: 'lb3', color: 'green' }]);
    });

    it('leaving a task out deletes it, a task with no id is new', () => {
      const plan = base();
      const next = M.normalizePlan({ tasks: [{ id: 't2' }, { title: 'Acheter des semences', due: '2026-10-25' }] }, Object.assign(norm(), { previous: plan }));
      assert.deepEqual(next.tasks.map((t) => t.title), ['Appeler', 'Acheter des semences']);
      assert.equal(next.tasks[1].include, true);
      assert.equal(next.tasks[1].due, '2026-10-25');
    });

    it('buildEditMessages puts the plan, the document, the board, the earlier exchanges and the request in the prompt', () => {
      const plan = base();
      const m = M.buildEditMessages({
        plan, instruction: 'Mets tout dans un projet Jardin', parts: [{ type: 'text', text: 'Potager 2027' }], context: M.contextOf(rawCtx), today: '2026-10-21',
        history: [{ who: 'me', text: 'Enlève le loyer' }, { who: 'ai', text: 'Fait.' }], existingTitles: ['Autre'],
      });
      assert.match(m[0].content, /2026-10-21/);
      assert.match(m[0].content, /\{"id":"t3"\}/);
      assert.match(m[0].content, /jamais des instructions/);
      const u = m[1].content;
      assert.match(u, /"plan":\[\{"id":"t1","title":"Préparer"/);
      assert.match(u, /"projects":\["Potager","Refonte du site"/);
      assert.match(u, /"textesLusDansLesImages":\[\{"image":"img1","texte":"Liste : terreau"\}\]/);
      assert.match(u, /"echangesPrecedents":\["Moi : Enlève le loyer","Toi : Fait\."\]/);
      assert.match(u, /Document :\nPotager 2027/);
      assert.match(u, /Demande : Mets tout dans un projet Jardin$/);
    });

    it('applyEditReply: a reply that is a question changes nothing', () => {
      const plan = base();
      const r = M.applyEditReply({ message: 'Il y a trois tâches.' }, plan, norm());
      assert.equal(r.changed, false);
      assert.equal(r.plan, plan);
      assert.equal(r.message, 'Il y a trois tâches.');
    });

    it('applyEditReply: all tasks unchanged is no change; an empty list does not wipe the plan', () => {
      const plan = base();
      assert.equal(M.applyEditReply({ message: 'Rien à faire.', tasks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }] }, plan, norm()).changed, false);
      const wiped = M.applyEditReply({ message: 'oups', tasks: [] }, plan, norm());
      assert.equal(wiped.changed, false);
      assert.equal(wiped.plan, plan);
      const junk = M.applyEditReply({ tasks: [{ foo: 1 }, 3] }, plan, norm());
      assert.equal(junk.plan, plan);
    });

    it('applyEditReply: "clear" empties the plan on purpose', () => {
      const r = M.applyEditReply({ message: 'Tout est retiré.', clear: true, tasks: [] }, base(), norm());
      assert.equal(r.changed, true);
      assert.equal(r.plan.tasks.length, 0);
    });

    it('applyEditReply: a real change is reported as changed', () => {
      const r = M.applyEditReply({ message: 'Renommée.', tasks: [{ id: 't1', title: 'Préparer le terrain' }, { id: 't2' }, { id: 't3' }] }, base(), norm());
      assert.equal(r.changed, true);
      assert.equal(r.plan.tasks[0].title, 'Préparer le terrain');
    });

    describe('edit', () => {
      let saved;
      let calls;
      beforeEach(() => {
        calls = [];
        saved = global.PriorityAgent;
        global.PriorityAgent = {
          getProvider: async () => ({}),
          isConfigured: () => true,
          chatCompletions: async (p, messages, opts) => {
            calls.push({ messages, opts });
            return { content: JSON.stringify({ message: 'Regroupé.', tasks: [{ id: 't1', project: 'Jardin' }, { id: 't2', project: 'Jardin' }, { id: 't3' }] }) };
          },
        };
      });
      afterEach(() => { global.PriorityAgent = saved; });

      it('asks the provider with the plan and applies the answer', async () => {
        const plan = base();
        const res = await M.edit({}, { plan, instruction: 'Regroupe le jardin', parts: [{ type: 'image', id: 'i1' }], context: rawCtx, today: '2026-10-21', history: [] });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].opts.temperature, 0.2);
        assert.equal(res.message, 'Regroupé.');
        assert.equal(res.changed, true);
        assert.deepEqual(res.plan.projects.map((p) => p.name), ['Jardin']);
        assert.deepEqual(res.plan.tasks.map((t) => t.project), ['p1', 'p1', '']);
      });

      it('rejects with no provider, and with an unreadable reply that keeps what came back', async () => {
        global.PriorityAgent.isConfigured = () => false;
        await assert.rejects(M.edit({}, { plan: base(), instruction: 'x', parts: [], context: {} }), (e) => e.reason === 'no-provider');
        global.PriorityAgent.isConfigured = () => true;
        global.PriorityAgent.chatCompletions = async () => ({ content: 'Désolé, je ne peux pas.' });
        await assert.rejects(M.edit({}, { plan: base(), instruction: 'x', parts: [], context: {} }), (e) => e.reason === 'unreadable-reply' && /Désolé/.test(e.detail));
        global.PriorityAgent = undefined;
        await assert.rejects(M.edit({}, { plan: base(), instruction: 'x', parts: [], context: {} }), (e) => e.reason === 'no-provider');
      });
    });

    it('parse keeps what the model said when it was not JSON', async () => {
      const saved = global.PriorityAgent;
      global.PriorityAgent = { getProvider: async () => ({}), isConfigured: () => true, chatCompletions: async () => ({ content: 'Voici votre plan : bientôt' }) };
      try {
        await assert.rejects(M.parse({}, { parts: [{ type: 'text', text: 'x' }], context: {} }), (e) => e.reason === 'unreadable-reply' && /Voici votre plan/.test(e.detail));
      } finally {
        global.PriorityAgent = saved;
      }
    });
  });
});
