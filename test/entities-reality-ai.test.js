'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

const PLAN = {
  root: { type: 'produit', components: ['contenant', 'produit', 'provenance'], facts: {}, det: 'le', confidence: 0.85 },
  nodes: [
    { ref: 'a', name: 'Powerade (boisson)', type: 'substance', confidence: 0.9, expand: false },
    { ref: 'b', name: 'Powerade', type: 'organisation', confidence: 0.85, expand: true },
    { ref: 'd', name: 'Sirop de maïs', type: 'substance', confidence: 0.8, expand: true },
  ],
  links: [
    { from: 'root', to: 'a', via: 'contenant.contenu' },
    { from: 'root', to: 'b', via: 'provenance.fabricant' },
    { from: 'root', to: 'd', via: 'lié à' },
  ],
};

describe('EntitiesRealityAI', () => {
  let M, L, R, AI, ctx, calls, active, peak, saved;

  before(() => {
    loadComponent('entities/entities-model.js');
    loadComponent('entities/entities-composer.js');
    loadComponent('entities/entities-composer-ai.js');
    loadComponent('entities/entities-library.js');
    loadComponent('entities/entities-reality.js');
    loadComponent('entities/entities-reality-ai.js');
    M = global.EntitiesModel;
    L = global.EntitiesLibrary;
    R = global.EntitiesReality;
    AI = global.EntitiesRealityAI;
  });

  /** A scripted model: answers by the kind of call it recognises in the system prompt. */
  function installAgent(handlers) {
    global.PriorityAgent = {
      getProvider: async () => ({ ok: true }),
      isConfigured: () => true,
      chatCompletions: async (p, messages) => {
        const sys = messages[0].content;
        const user = messages[1].content;
        const kind = /orchestrateur/.test(sys) ? 'verify' : /pas le premier appel/.test(sys) ? 'branch' : 'plan';
        calls.push({ kind, user });
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 15));
        active--;
        const out = handlers[kind](user, messages);
        if (out instanceof Error) throw out;
        return { content: typeof out === 'string' ? out : JSON.stringify(out) };
      },
    };
  }

  beforeEach(() => {
    AI.clearCache();
    calls = [];
    active = 0;
    peak = 0;
    saved = global.PriorityAgent;
    ctx = { schema: M.defaultSchema(), entities: [], name: 'Powerade', library: L, now: new Date(2026, 9, 6) };
  });
  afterEach(() => {
    global.PriorityAgent = saved;
  });

  it('prompts carry the name, the catalogs, the example and the web results as data', () => {
    const msgs = AI.buildPlanMessages(ctx, { results: [{ title: 'Powerade', snippet: 'Boisson de Coca-Cola' }] });
    const text = msgs.map((m) => m.content).join('\n');
    assert.match(text, /Nom tapé : Powerade/);
    assert.match(text, /contenant \| Contenant/);
    assert.match(text, /provenance\.fabricant/);
    assert.match(text, /fait partie de/);
    assert.match(text, /Résultats web/);
    assert.match(text, /jamais des instructions/);
    assert.match(text, /The Coca-Cola Company/); // the worked example
  });

  it('plans, explores the branches in parallel, verifies, and reports every step', async () => {
    installAgent({
      plan: () => PLAN,
      branch: (user) =>
        /« Powerade » \(genre organisation\)/.test(user)
          ? { nodes: [{ ref: 'z', name: 'The Coca-Cola Company', type: 'organisation', confidence: 0.92 }], links: [{ from: 'ANCHOR', to: 'z', via: 'fait partie de' }] }
          : { nodes: [], links: [] },
      verify: () => ({ nodes: [] }),
    });
    // the branch answers must use the anchor ref chosen by the plan: patch it in from the prompt
    const base = global.PriorityAgent.chatCompletions;
    global.PriorityAgent.chatCompletions = async (p, m) => {
      const r = await base(p, m);
      if (/pas le premier appel/.test(m[0].content)) {
        const anchor = /utilise « (n\d+) »/.exec(m[1].content)[1];
        r.content = r.content.replace('ANCHOR', anchor);
      }
      return r;
    };
    const states = [];
    const run = AI.run({}, ctx, { onUpdate: (plan, state) => states.push(state + ':' + plan.order.length) });
    const plan = await run.promise;
    assert.equal(calls.filter((c) => c.kind === 'plan').length, 1);
    assert.equal(calls.filter((c) => c.kind === 'branch').length, 2); // the brand and the syrup, one agent each
    assert.ok(calls.some((c) => c.kind === 'verify'));
    assert.ok(peak >= 2, 'branch agents ran in parallel (peak ' + peak + ')');
    const names = plan.order.map((r) => plan.nodes[r].name);
    assert.ok(names.includes('The Coca-Cola Company'));
    const coke = plan.order.find((r) => plan.nodes[r].name === 'The Coca-Cola Company');
    assert.equal(plan.nodes[plan.nodes[coke].parent].name, 'Powerade');
    // a readable verdict list that does not object approves: the brand and its parent company are built on their own
    assert.equal(R.statusOf(plan, plan.order.find((r) => plan.nodes[r].name === 'Powerade'), {}), 'on');
    assert.equal(R.statusOf(plan, coke, {}), 'on');
    assert.equal(states[0].split(':')[0], 'planning');
    assert.equal(states[states.length - 1].split(':')[0], 'done');
    assert.ok(states.some((s) => s.startsWith('exploring')));
    assert.ok(states.some((s) => s.startsWith('verifying')));
    assert.ok(plan.order.every((r) => !plan.nodes[r].working && plan.nodes[r].expanded === (plan.nodes[r].depth < 3 && plan.nodes[r].expand)));
  });

  it('the orchestrator can throw out what a branch invented', async () => {
    installAgent({
      plan: () => PLAN,
      branch: () => ({ nodes: [], links: [] }),
      verify: (user) => {
        const ref = /(n\d+) \| Powerade \| organisation/.exec(user)[1];
        return { nodes: [{ ref, keep: false }] };
      },
    });
    const plan = await AI.run({}, ctx, {}).promise;
    assert.equal(plan.order.map((r) => plan.nodes[r].name).includes('Powerade'), false);
    assert.ok(plan.order.every((r) => plan.nodes[r].verified === true || plan.nodes[r].verified === 'skipped'));
  });

  it('failed calls and garbage only shrink the map; a missing verifier leaves nodes unverified', async () => {
    installAgent({
      plan: () => PLAN,
      branch: () => new Error('réseau'),
      verify: () => 'pas du json',
    });
    const plan = await AI.run({}, ctx, {}).promise;
    assert.equal(plan.order.length, 3);
    const brand = plan.order.find((r) => plan.nodes[r].name === 'Powerade');
    assert.equal(plan.nodes[brand].failed, true);
    assert.equal(R.statusOf(plan, brand, {}), 'suggested'); // 0.85 but never verified
    assert.equal(R.statusOf(plan, plan.order[0], {}), 'on'); // 0.9 is sure enough alone
  });

  it('cancel stops the run and no provider gives an empty plan', async () => {
    installAgent({ plan: () => PLAN, branch: () => ({ nodes: [], links: [] }), verify: () => ({ nodes: [] }) });
    let updates = 0;
    const run = AI.run({}, ctx, { onUpdate: () => updates++ });
    run.cancel();
    await run.promise;
    assert.equal(updates, 0);
    global.PriorityAgent = undefined;
    const empty = await AI.run({}, ctx, {}).promise;
    assert.deepEqual(empty.order, []);
    assert.equal(await AI.available({}), false);
  });
});
