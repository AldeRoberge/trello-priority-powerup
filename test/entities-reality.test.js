'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

const PLAN = {
  root: { type: 'produit', components: ['contenant', 'produit', 'provenance', 'identification', 'condition'], facts: { 'contenant.scelle': 'scellé' }, aliases: [], det: 'la', confidence: 0.85 },
  nodes: [
    { ref: 'a', name: 'Powerade (boisson)', type: 'substance', confidence: 0.9, facts: { 'matiere.etat': 'liquide' }, expand: false },
    { ref: 'b', name: 'Powerade', type: 'organisation', confidence: 0.85, expand: true },
    { ref: 'c', name: 'The Coca-Cola Company', type: 'organisation', confidence: 0.9 },
    { ref: 'd', name: 'Sirop de maïs', type: 'substance', confidence: 0.6 },
    { ref: 'e', name: 'Trop incertain', type: 'substance', confidence: 0.3 },
    { ref: 'f', name: 'Inconnu', type: 'zzz', confidence: 0.9 },
  ],
  links: [
    { from: 'root', to: 'a', via: 'contenant.contenu', confidence: 0.9 },
    { from: 'root', to: 'b', via: 'provenance.fabricant', confidence: 0.85 },
    { from: 'b', to: 'c', via: 'fait partie de', confidence: 0.9 },
    { from: 'c', to: 'b', via: 'fait partie de', confidence: 0.9 },
  ],
};

describe('EntitiesReality', () => {
  let M, C, L, R, schema, root, ctx;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-composer.js');
    loadComponent('entities/entities-composer-ai.js');
    loadComponent('entities/entities-library.js');
    loadComponent('entities/entities-reality.js');
    M = global.EntitiesModel;
    C = global.EntitiesComposer;
    L = global.EntitiesLibrary;
    R = global.EntitiesReality;
  });

  beforeEach(() => {
    schema = M.defaultSchema();
    root = C.newDraft({ name: 'Powerade' });
    ctx = { schema, entities: [], draft: root, library: L };
  });

  const verified = (plan) => R.applyVerdicts(plan, { nodes: plan.order.map((ref) => ({ ref, keep: true })) });

  it('normalizeBranch drops unknown genres, weak nodes and garbage, keeps the root', () => {
    const b = R.normalizeBranch(JSON.stringify(PLAN), ctx, 'root');
    assert.deepEqual(b.nodes.map((n) => n.lref), ['a', 'b', 'c', 'd']);
    assert.equal(b.root.type, 'produit');
    assert.deepEqual(b.root.components, ['contenant', 'produit', 'provenance', 'identification', 'condition']);
    assert.equal(b.root.det, 'la');
    assert.deepEqual(R.normalizeBranch('pas du json', ctx, 'root'), { root: null, nodes: [], links: [] });
    assert.equal(R.normalizeBranch(JSON.stringify(PLAN), ctx, 'n1').root, null);
  });

  it('addBranch builds the map, refuses loops and attaches orphans', () => {
    const plan = R.addBranch(R.emptyPlan(), 'root', R.normalizeBranch(PLAN, ctx, 'root'), { source: 'ia', rootName: 'Powerade' });
    assert.equal(plan.order.length, 4);
    const names = plan.order.map((r) => plan.nodes[r].name);
    assert.deepEqual(names, ['Powerade (boisson)', 'Powerade', 'The Coca-Cola Company', 'Sirop de maïs']);
    const loops = plan.edges.filter((e) => e.via === 'fait partie de');
    assert.equal(loops.length, 1); // c -> b was refused
    const syrup = plan.order[3];
    assert.ok(plan.edges.some((e) => e.to === syrup && e.from === 'root' && e.via === 'lié à'));
    assert.equal(plan.nodes[plan.order[1]].expand, true);
  });

  it('a node named like the root merges into it only when it is the same kind', () => {
    const raw = { nodes: [{ ref: 'x', name: 'Powerade', type: 'produit', confidence: 0.9 }, { ref: 'y', name: 'Powerade', type: 'organisation', confidence: 0.9 }], links: [] };
    let plan = R.addBranch(R.emptyPlan(), 'root', { root: { type: 'produit', components: [], facts: {}, aliases: [], det: '', conf: 0.8 }, nodes: [], links: [] }, {});
    plan = R.addBranch(plan, 'root', R.normalizeBranch(raw, ctx, 'x0'), { rootName: 'Powerade' });
    assert.equal(plan.order.length, 1);
    assert.equal(plan.nodes[plan.order[0]].type, 'produit' === plan.root.type ? 'organisation' : '');
  });

  it('names found twice stay one node (the web converges)', () => {
    let plan = R.addBranch(R.emptyPlan(), 'root', R.normalizeBranch(PLAN, ctx, 'root'), {});
    const b = plan.order[1];
    const again = { nodes: [{ ref: 'z', name: 'the coca-cola company', type: 'organisation', confidence: 0.95 }], links: [{ from: b, to: 'z', via: 'fait partie de' }] };
    plan = R.addBranch(plan, b, R.normalizeBranch(again, ctx, b), {});
    assert.equal(plan.order.length, 4);
    assert.equal(plan.nodes[plan.order[2]].conf, 0.95);
  });

  it('verdicts: drop, merge duplicates, lower or slightly raise confidence, take descendants along', () => {
    let plan = R.addBranch(R.emptyPlan(), 'root', R.normalizeBranch(PLAN, ctx, 'root'), {});
    const [a, b, c, d] = plan.order;
    const out = R.applyVerdicts(plan, {
      nodes: [
        { ref: a, keep: true, confidence: 1 },
        { ref: b, keep: false },
        { ref: d, keep: true, confidence: 0.4, name: 'Sirop de glucose-fructose' },
      ],
    });
    assert.equal(out.nodes[b], undefined);
    assert.equal(plan.nodes[c].parent, b); // Coca-Cola hangs under the brand
    assert.equal(out.nodes[c], undefined); // child of a dropped node
    assert.equal(out.nodes[a].conf, 0.9); // raised by 0.1 at most, capped at 0.9 (it was 0.9)
    assert.equal(out.nodes[a].verified, true);
    assert.equal(out.nodes[d].conf, 0.4);
    assert.equal(out.nodes[d].name, 'Sirop de glucose-fructose');
    assert.ok(out.edges.every((e) => e.from === 'root' || out.nodes[e.from]));
    const same = R.applyVerdicts(plan, { same: [[c, b]] });
    assert.equal(same.nodes[b], undefined);
    assert.ok(same.nodes[c]);
    assert.ok(same.edges.every((e) => e.from !== e.to));
  });

  it('only verified, confident nodes are built on their own; the rest is suggested', () => {
    const plan = R.addBranch(R.emptyPlan(), 'root', R.normalizeBranch(PLAN, ctx, 'root'), {});
    const [a, b, c, d] = plan.order;
    assert.equal(R.statusOf(plan, a, {}), 'on'); // 0.9 is sure enough alone
    assert.equal(R.statusOf(plan, b, {}), 'pending'); // 0.85, not verified yet
    assert.equal(R.statusOf(plan, d, {}), 'suggested');
    const v = verified(plan);
    assert.equal(R.statusOf(v, b, {}), 'on');
    assert.equal(R.statusOf(v, c, {}), 'on'); // its parent is on
    assert.equal(R.statusOf(v, b, { excluded: { [b]: true } }), 'off');
    assert.equal(R.statusOf(v, c, { excluded: { [b]: true } }), 'off'); // a node goes with its parent
    assert.equal(R.statusOf(v, d, { accepted: { [d]: true } }), 'on');
    const skipped = R.markChecked(plan, plan.order);
    assert.equal(R.statusOf(skipped, b, {}), 'suggested');
  });

  it('build: the bottle gets its components, its contents, its maker and the maker\'s parent', () => {
    const plan = verified(R.addBranch(R.emptyPlan(), 'root', R.normalizeBranch(PLAN, ctx, 'root'), {}));
    const out = R.build(ctx, plan, {});
    const s = out.schema;
    assert.deepEqual(out.draft.types.length, 1);
    ['contenant', 'identification', 'condition', 'provenance'].forEach((c) => assert.ok(M.componentIdsOf(s, out.draft).includes(c), c));
    assert.equal(out.draft.answers['contenant.scelle'], 'scellé');
    const byName = (n) => out.extras.find((d) => d.name === n);
    const liquid = byName('Powerade (boisson)');
    const brand = out.extras.find((d) => d.name === 'Powerade');
    const coke = byName('The Coca-Cola Company');
    assert.ok(liquid && brand && coke);
    assert.equal(out.extras.some((d) => d.name === 'Sirop de maïs'), false); // 0.6: only suggested
    assert.deepEqual(out.draft.answers['contenant.contenu'], [liquid.id]);
    assert.equal(out.draft.answers['provenance.fabricant'], brand.id);
    assert.equal(out.draft.answers['produit.marque'], 'Powerade');
    assert.equal(liquid.answers['matiere.etat'], 'liquide');
    assert.ok(brand.relations.some((r) => r.type === 'fait partie de' && r.to === coke.id));
    // the whole map is accepted by finalize
    const fin = C.finalize(s, [], [out.draft].concat(out.extras));
    assert.equal(fin.skipped.length, 0);
    assert.equal(fin.created.length, 4);
  });

  it('build is pure and follows the switches', () => {
    const plan = verified(R.addBranch(R.emptyPlan(), 'root', R.normalizeBranch(PLAN, ctx, 'root'), {}));
    const [, b, , d] = plan.order;
    const before = JSON.stringify(ctx);
    const off = R.build(ctx, plan, { excluded: { [b]: true } });
    assert.equal(JSON.stringify(ctx), before);
    assert.deepEqual(off.extras.map((x) => x.name), ['Powerade (boisson)']);
    assert.equal(off.draft.answers['provenance.fabricant'], undefined);
    const more = R.build(ctx, plan, { accepted: { [d]: true } });
    assert.ok(more.extras.some((x) => x.name === 'Sirop de maïs'));
  });

  it('build reuses existing entities and never edits them or the user\'s answers', () => {
    const s0 = L.install(schema, ['organisation', 'substance', 'produit']).schema;
    const coke = M.createEntity(s0, { name: 'The Coca-Cola Company', aliases: ['Coca-Cola'], types: ['organisation'] });
    const c2 = { schema: s0, entities: [coke], draft: C.setAnswer(C.newDraft({ name: 'Powerade', types: ['produit'] }), 'produit.marque', 'Gatorade'), library: L };
    const plan = verified(R.addBranch(R.emptyPlan(), 'root', R.normalizeBranch(PLAN, c2, 'root'), {}));
    const out = R.build(c2, plan, {});
    assert.deepEqual(out.reused, [coke.id]);
    assert.equal(out.extras.some((d) => d.name === 'The Coca-Cola Company'), false);
    const brand = out.extras.find((d) => d.name === 'Powerade');
    assert.ok(brand.relations.some((r) => r.to === coke.id));
    assert.equal(out.draft.answers['produit.marque'], 'Gatorade'); // the user's answer stays
  });

  it('tree lists the map depth-first with status and link label; hints propose the maker as brand', () => {
    const plan = verified(R.addBranch(R.emptyPlan(), 'root', R.normalizeBranch(PLAN, ctx, 'root'), {}));
    const rows = R.tree(plan, ctx, {});
    assert.deepEqual(rows.map((r) => r.name), ['Powerade (boisson)', 'Powerade', 'The Coca-Cola Company', 'Sirop de maïs']);
    assert.deepEqual(rows.map((r) => r.depth), [1, 1, 2, 1]);
    assert.equal(rows[1].via, 'Fabriqué par');
    assert.equal(rows[2].via, 'Fait partie de');
    assert.equal(rows[3].status, 'suggested');
    const h = R.hintsFromPlan(plan, ctx);
    assert.deepEqual(h.types.map((t) => t.id), ['produit']);
    assert.equal(h.candidates['produit.marque'][0].label, 'Powerade');
  });

  it('a type is only a list of components: a thing can have several, in the plan and in what is built', () => {
    const raw = {
      root: { types: ['produit', 'objet', 'zzz'], components: ['contenant'], confidence: 0.85 },
      nodes: [{ ref: 'a', name: 'Bouteille Powerade', types: ['objet', 'substance'], confidence: 0.9 }, { ref: 'b', name: 'Rien', types: ['zzz'], confidence: 0.9 }],
      links: [{ from: 'root', to: 'a', via: 'lié à' }],
    };
    const b = R.normalizeBranch(raw, ctx, 'root');
    assert.deepEqual(b.root.types, ['produit', 'objet']);
    assert.deepEqual(b.nodes.map((n) => n.types), [['objet', 'substance']]); // a node with no valid genre is dropped
    const plan = verified(R.addBranch(R.emptyPlan(), 'root', b, {}));
    const out = R.build(ctx, plan, {});
    assert.equal(out.draft.types.length, 2);
    assert.equal(out.extras[0].types.length, 2);
    // the components of the entity are the union of those of its types
    const comps = M.componentIdsOf(out.schema, out.draft);
    ['produit', 'matiere', 'provenance', 'propriete', 'contenant'].forEach((c) => assert.ok(comps.includes(c), c));
    // the user can switch one genre off, and a genre the user chose stays
    const off = R.build(ctx, plan, { excluded: { 'type:objet': true } });
    assert.equal(off.draft.types.length, 1);
    assert.deepEqual(R.rootTypes(plan, ctx, { excluded: { 'type:objet': true } }).map((t) => t.on), [true, false]);
    assert.deepEqual(R.hintsFromPlan(plan, ctx).types.map((t) => t.id), ['produit', 'objet']);
    const mine = R.build(Object.assign({}, ctx, { draft: C.newDraft({ name: 'Powerade', types: ['place'] }) }), plan, {});
    assert.ok(mine.draft.types.includes('place') && mine.draft.types.length === 3);
  });

  it('the new components are in the library', () => {
    ['contenant', 'identification', 'condition'].forEach((id) => assert.ok(L.COMPONENTS.some((c) => c.id === id), id));
  });
});
