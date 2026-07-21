'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('People directory', () => {
  let People;

  before(() => {
    clearComponentCache();
    loadComponent('people/people.js');
    People = global.People;
    assert.ok(People);
  });

  it('normalizes people with aliases, roles, contact fields', () => {
    const dir = People.normalizeDirectory({
      people: [
        {
          name: '  Jane Doe  ',
          aliases: ['boss', 'Boss', 'ma boss'],
          roles: ['Boss', 'N+1'],
          email: 'jane@example.com',
          phone: '514-555-0100',
          notes: 'Préfère Teams',
        },
        { name: '' },
        { name: 'jane doe' },
      ],
    });
    assert.equal(dir.people.length, 1);
    assert.equal(dir.people[0].name, 'Jane Doe');
    assert.ok(dir.people[0].id.startsWith('person-'));
    assert.ok(dir.people[0].aliases.includes('boss'));
    assert.ok(dir.people[0].aliases.includes('ma boss'));
    // Synonym expansion (patron / manager / …) happens at match time, not in storage.
    assert.equal(People.findByAliasOrName(dir, 'patron').name, 'Jane Doe');
    assert.deepEqual(dir.people[0].roles, ['Boss', 'N+1']);
    assert.equal(dir.people[0].email, 'jane@example.com');
    assert.equal(dir.people[0].phone, '514-555-0100');
  });

  it('finds a person by role alias including FR determinants', () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
      roles: ['Boss'],
    });
    assert.equal(People.findByAliasOrName(dir, 'ma boss').name, 'Jane Doe');
    assert.equal(People.findByAliasOrName(dir, 'la boss').name, 'Jane Doe');
    assert.equal(People.findByAliasOrName(dir, 'patron').name, 'Jane Doe');
    assert.equal(People.findByAliasOrName(dir, 'Jane Doe').name, 'Jane Doe');
    assert.equal(People.findByAliasOrName(dir, 'inconnu'), null);
  });

  it('expands rich synonym groups across FR/EN workplace roles', () => {
    const boss = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    });
    for (const q of ['mon chef', 'the manager', 'n+1', 'team lead', 'supervisor']) {
      assert.equal(People.findByAliasOrName(boss, q).name, 'Jane Doe', q);
    }

    const collab = People.upsert(People.emptyDirectory(), {
      name: 'Sam Peer',
      aliases: ['collègue'],
    });
    assert.equal(People.findByAliasOrName(collab, 'coworker').name, 'Sam Peer');
    assert.equal(People.findByAliasOrName(collab, 'teammate').name, 'Sam Peer');

    const client = People.upsert(People.emptyDirectory(), {
      name: 'Acme Lead',
      aliases: ['client'],
    });
    assert.equal(People.findByAliasOrName(client, 'customer').name, 'Acme Lead');

    const rh = People.upsert(People.emptyDirectory(), {
      name: 'Pat RH',
      aliases: ['rh'],
    });
    assert.equal(People.findByAliasOrName(rh, 'hr').name, 'Pat RH');
  });

  it('resolves new synonym phrases in blocked-reason text', () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['chef'],
    });
    assert.equal(
      People.resolveInText('Bloqué chez mon N+1', dir),
      'Bloqué chez Jane Doe'
    );
    assert.match(
      People.resolveInText('En attente du team lead', dir),
      /Jane Doe/
    );
  });

  it('resolves "la boss" to Jane Doe in blocked reason text', () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    });
    const input = "En attente de la réponse de la boss";
    const out = People.resolveInText(input, dir);
    assert.equal(out, 'En attente de la réponse de Jane Doe');
  });

  it('resolves ma boss / mon patron variants', () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    });
    assert.match(
      People.resolveInText('Bloqué en attendant ma boss', dir),
      /Jane Doe/
    );
    assert.match(
      People.resolveInText("En attente du patron", dir),
      /Jane Doe/
    );
  });

  it('upserts by matchText and merges contact fields', () => {
    let dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    });
    dir = People.upsert(dir, {
      matchText: 'boss',
      email: 'jane@acme.com',
      addAlias: 'N+1',
      phone: '555',
    });
    assert.equal(dir.people.length, 1);
    assert.equal(dir.people[0].email, 'jane@acme.com');
    assert.equal(dir.people[0].phone, '555');
    assert.ok(dir.people[0].aliases.includes('N+1'));
  });

  it('removes a person by alias', () => {
    let dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    });
    dir = People.remove(dir, 'ma boss');
    assert.equal(dir.people.length, 0);
  });

  it('toAgentContext exposes compact contact list', () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
      roles: ['Boss'],
      email: 'j@x.com',
    });
    const ctx = People.toAgentContext(dir);
    assert.equal(ctx.length, 1);
    assert.equal(ctx[0].name, 'Jane Doe');
    assert.ok(ctx[0].aliases.includes('boss'));
    assert.equal(ctx[0].email, 'j@x.com');
  });

  it('peoplePromptLines mention empty state or known people', () => {
    const empty = People.peoplePromptLines([]);
    assert.ok(empty.some((l) => /vide|DEMANDE/i.test(l)));
    const filled = People.peoplePromptLines(
      People.upsert(People.emptyDirectory(), {
        name: 'Jane Doe',
        aliases: ['boss'],
      })
    );
    assert.ok(filled.some((l) => /Jane Doe/.test(l)));
    assert.ok(filled.some((l) => /CONNAIS|t[eé]l/i.test(l)));
  });

  it('relation "my boss" expands aliases and keeps phone for the agent', () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Sylviane Mailhot',
      relation: 'my boss',
      roles: ['director'],
      phone: '819-824-9613 poste: 2252',
    });
    const p = dir.people[0];
    assert.equal(p.relation, 'my boss');
    assert.equal(p.phone, '819-824-9613 poste: 2252');
    // Compact seeds only — not the whole synonym group.
    assert.ok(p.aliases.includes('boss') || p.aliases.includes('my boss'));
    assert.ok(!p.aliases.some((a) => /^ceo$/i.test(a)));
    assert.ok(People.findByAliasOrName(dir, 'ma boss'));
    assert.ok(People.findByAliasOrName(dir, 'director'));
    assert.ok(People.findByAliasOrName(dir, 'du patron'));
    const ctx = People.toAgentContext(dir);
    assert.equal(ctx[0].phone, '819-824-9613 poste: 2252');
    assert.equal(ctx[0].relation, 'my boss');
    const lines = People.peoplePromptLines(dir);
    assert.ok(lines.some((l) => /819-824-9613/.test(l)));
    assert.ok(lines.some((l) => /Sylviane Mailhot/.test(l)));
  });

  it('role director alone is enough to resolve ma boss', () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Sylviane Mailhot',
      roles: ['director'],
      phone: '819-555-0000',
    });
    assert.equal(People.findByAliasOrName(dir, 'ma boss').name, 'Sylviane Mailhot');
  });

  it('longest synonym wins: chef de projet is not boss', () => {
    const pm = People.upsert(People.emptyDirectory(), {
      name: 'Alex PM',
      relation: 'chef de projet',
    });
    assert.equal(People.findByAliasOrName(pm, 'product owner').name, 'Alex PM');
    assert.equal(People.findByAliasOrName(pm, 'project manager').name, 'Alex PM');
    // Must not fall into the manager/boss group via bare "chef".
    assert.equal(People.findByAliasOrName(pm, 'ma boss'), null);
    assert.ok(
      !pm.people[0].aliases.some((a) => /^boss$/i.test(a)),
      'should not seed boss from chef de projet'
    );
  });

  it('aliasesFromRelation stays compact', () => {
    const seeds = People.aliasesFromRelation('ma boss');
    assert.ok(seeds.some((a) => /boss/i.test(a)));
    assert.ok(seeds.length <= 4);
    assert.ok(!seeds.some((a) => /ceo|pdg|vice.?pr/i.test(a)));
  });
});

describe('People + agent blocked reasons', () => {
  let People;
  let PriorityAgent;

  before(() => {
    clearComponentCache();
    loadComponent('people/people.js');
    loadComponent('agent/agent.js');
    People = global.People;
    PriorityAgent = global.PriorityAgent;
    assert.ok(People);
    assert.ok(PriorityAgent);
  });

  it('resolvePeopleInReason rewrites role phrases to the canonical name', () => {
    const people = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    }).people;
    const resolved = PriorityAgent.resolvePeopleInReason(
      "En attente de la réponse de la boss",
      people
    );
    assert.equal(resolved, 'En attente de la réponse de Jane Doe');
  });

  it('set_blocked stores resolved people names via executeActions', async () => {
    const people = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    });
    let applied = null;
    const bridge = {
      getPeople: () => people,
      getPriorityState: () => ({ enAttente: false, blockedReasons: [] }),
      applyPriority: (partial) => {
        applied = partial;
      },
      getCompletion: () => ({ items: [] }),
    };
    const appliedResult = await PriorityAgent.executeActions(bridge, [
      {
        tool: 'set_blocked',
        args: {
          enAttente: true,
          blockedReasons: ["En attente de la réponse de la boss"],
        },
      },
    ]);
    assert.equal(appliedResult.results[0].ok, true);
    assert.ok(applied);
    assert.equal(applied.enAttente, true);
    assert.deepEqual(applied.blockedReasons, [
      'En attente de la réponse de Jane Doe',
    ]);
  });

  it('buildContext includes people from the bridge', () => {
    const people = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
      email: 'j@x.com',
    });
    const ctx = PriorityAgent.buildContext({
      getPeople: () => people,
      getPriorityState: () => ({}),
      getCompletion: () => ({ items: [] }),
      getCardName: () => 'Test',
    });
    assert.ok(Array.isArray(ctx.people));
    assert.equal(ctx.people.length, 1);
    assert.equal(ctx.people[0].name, 'Jane Doe');
    assert.equal(ctx.people[0].email, 'j@x.com');
  });
});

describe('People ↔ Hors Trello assignees', () => {
  let People;
  let PriorityUI;
  let PriorityAgent;

  before(() => {
    clearComponentCache();
    loadComponent('people/people.js');
    loadComponent('priority/priority-ui.js');
    loadComponent('agent/agent.js');
    People = global.People;
    PriorityUI = global.PriorityUI;
    PriorityAgent = global.PriorityAgent;
    assert.ok(People);
    assert.ok(PriorityUI);
    assert.ok(PriorityAgent);
  });

  it('toCustomAssignee shares person-* id for Hors Trello', () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    });
    const draft = People.toCustomAssignee(dir.people[0]);
    assert.ok(draft);
    assert.equal(draft.name, 'Jane Doe');
    assert.ok(PriorityUI.isCustomAssigneeId(draft.id));
    assert.equal(draft.id, dir.people[0].id);
  });

  it('resolveAssigneeSpec maps ma boss → Jane Doe draft', () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    });
    const draft = People.resolveAssigneeSpec(dir, 'ma boss');
    assert.ok(draft);
    assert.equal(draft.name, 'Jane Doe');
    assert.equal(draft.id, dir.people[0].id);
  });

  it('createCustomAssignee reuses People id', () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    });
    const created = PriorityUI.createCustomAssignee(
      People.toCustomAssignee(dir.people[0])
    );
    assert.equal(created.id, dir.people[0].id);
    assert.equal(created.name, 'Jane Doe');
  });

  it('mergeIntoAssigneeCatalog upserts People into Hors Trello catalog', () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    });
    const merged = People.mergeIntoAssigneeCatalog([], dir);
    assert.equal(merged.changed, true);
    assert.equal(merged.catalog.length, 1);
    assert.equal(merged.catalog[0].id, dir.people[0].id);
    assert.equal(merged.catalog[0].name, 'Jane Doe');
  });

  it('matchCustomAssignee resolves aliases via People directory', () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    });
    const onCard = [
      PriorityUI.createCustomAssignee(People.toCustomAssignee(dir.people[0])),
    ];
    const hit = PriorityAgent.matchCustomAssignee(onCard, 'ma boss', dir);
    assert.ok(hit);
    assert.equal(hit.name, 'Jane Doe');
    assert.equal(hit.id, dir.people[0].id);
  });

  it('set_custom_assignees add:["ma boss"] assigns Jane Doe', async () => {
    const dir = People.upsert(People.emptyDirectory(), {
      name: 'Jane Doe',
      aliases: ['boss'],
    });
    let state = { customAssignees: [] };
    const catalog = [];
    const bridge = {
      getPeople: () => dir,
      getPriorityState: () => state,
      applyPriority: (partial) => {
        state = Object.assign({}, state, partial);
      },
      setCustomAssignees: (list) => {
        state.customAssignees = list;
        return { ok: true, customAssignees: list };
      },
      getCustomAssigneeCatalog: () => catalog,
      getCompletion: () => ({ items: [] }),
    };
    const result = await PriorityAgent.executeActions(bridge, [
      { tool: 'set_custom_assignees', args: { add: ['ma boss'] } },
    ]);
    assert.equal(result.results[0].ok, true);
    assert.equal(state.customAssignees.length, 1);
    assert.equal(state.customAssignees[0].name, 'Jane Doe');
    assert.equal(state.customAssignees[0].id, dir.people[0].id);
  });

  it('upsert_person syncs into Hors Trello catalog via bridge', async () => {
    let directory = People.emptyDirectory();
    let catalog = [];
    const bridge = {
      getPeople: () => directory,
      upsertPerson: async (patch) => {
        directory = People.upsert(directory, patch);
        return {
          ok: true,
          person: directory.people[directory.people.length - 1],
          directory,
        };
      },
      upsertCustomAssigneeCatalog: async (entry) => {
        const upserted = PriorityUI.upsertCustomAssigneeCatalog(entry);
        catalog = PriorityUI.getCustomAssigneeCatalog();
        return { ok: true, entry: upserted, customAssigneeCatalog: catalog };
      },
      getPriorityState: () => ({}),
      getCompletion: () => ({ items: [] }),
    };
    PriorityUI.setCustomAssigneeCatalog([]);
    const result = await PriorityAgent.executeActions(bridge, [
      {
        tool: 'upsert_person',
        args: { name: 'Jane Doe', aliases: ['boss'] },
      },
    ]);
    assert.equal(result.results[0].ok, true);
    assert.equal(directory.people.length, 1);
    assert.ok(catalog.some((p) => p.name === 'Jane Doe'));
    assert.equal(catalog[0].id, directory.people[0].id);
    assert.match(result.results[0].detail, /Jane Doe/);
    assert.match(result.results[0].detail, /cr[eé]ée/i);
    assert.doesNotMatch(result.results[0].detail, /aucun diff/i);
    assert.match(result.recap, /Jane Doe/);
  });
});
