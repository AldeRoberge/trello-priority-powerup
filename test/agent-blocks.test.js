'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('AgentBlocks', () => {
  let AgentBlocks;
  let PriorityAgent;

  beforeEach(() => {
    clearComponentCache();
    delete global.AgentBlocks;
    delete global.PriorityAgent;
    delete global.PriorityUI;
    delete global.StatutMatch;
    loadComponent('priority/priority-matrix.js');
    loadComponent('priority/priority-ui.js');
    loadComponent('statut/statut-match.js');
    AgentBlocks = loadComponent('agent/agent-blocks.js').AgentBlocks;
    PriorityAgent = loadComponent('agent/agent.js').PriorityAgent;
  });

  it('exposes normalizeBlocks and synthesizer', () => {
    assert.equal(typeof AgentBlocks.normalizeBlocks, 'function');
    assert.equal(typeof AgentBlocks.synthesizeBlocksFromResults, 'function');
    assert.equal(typeof AgentBlocks.renderBlock, 'function');
    assert.equal(typeof AgentBlocks.fillMessageContent, 'function');
    assert.equal(typeof PriorityAgent.normalizeBlocks, 'function');
  });

  it('normalizes priority / subtask / due / progress blocks', () => {
    const blocks = AgentBlocks.normalizeBlocks(
      [
        { type: 'priority', tier: 'Critique', urgency: 4, impact: 3, ease: 2 },
        { type: 'subtask', text: 'Rédiger le brief', estimatedMinutes: 30 },
        { type: 'due', dueDate: '2026-07-21', dueTime: '14:00' },
        { type: 'progress', progress: 40, doneCount: 1, totalCount: 3 },
        { type: 'nope', text: 'ignored' },
        null
      ],
      {}
    );
    assert.equal(blocks.length, 4);
    assert.equal(blocks[0].type, 'priority');
    assert.equal(blocks[0].tier, 'Critique');
    assert.equal(blocks[1].type, 'subtask');
    assert.equal(blocks[1].text, 'Rédiger le brief');
    assert.equal(blocks[1].estimatedMinutes, 30);
    assert.equal(blocks[2].type, 'due');
    assert.equal(blocks[2].dueDate, '2026-07-21');
    assert.equal(blocks[3].type, 'progress');
    assert.equal(blocks[3].progress, 40);
  });

  it('normalizes card_ref from boardCards index', () => {
    const blocks = AgentBlocks.normalizeBlocks(
      [{ type: 'card_ref', cardIndex: 1, fields: ['name', 'list'] }],
      {
        boardCards: [
          { id: 'a', name: 'Alpha', list: 'Inbox' },
          { id: 'b', name: 'Beta', list: 'Doing', due: '2026-08-01' }
        ]
      }
    );
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, 'card_ref');
    assert.equal(blocks[0].name, 'Beta');
    assert.equal(blocks[0].list, 'Doing');
    assert.equal(blocks[0].cardIndex, 1);
  });

  it('normalizes statut, project, diff, members, labels', () => {
    const blocks = AgentBlocks.normalizeBlocks(
      [
        { type: 'statut', listName: 'En cours', category: 'started' },
        { type: 'project', name: 'Sport 2026', projectId: 'p1' },
        {
          type: 'diff',
          rows: [{ label: 'Urgence', before: 'Basse', after: 'Haute' }]
        },
        {
          type: 'members',
          people: [{ name: 'Ada', op: 'add' }, { name: 'Bob', op: 'remove' }]
        },
        {
          type: 'labels',
          labels: [{ name: 'Urgent', color: 'red', op: 'add' }]
        }
      ],
      {}
    );
    assert.equal(blocks.length, 5);
    assert.equal(blocks[0].type, 'statut');
    assert.equal(blocks[1].type, 'project');
    assert.equal(blocks[2].type, 'diff');
    assert.equal(blocks[2].rows.length, 1);
    assert.equal(blocks[3].type, 'members');
    assert.equal(blocks[3].people.length, 2);
    assert.equal(blocks[4].type, 'labels');
  });

  it('normalizes blocked, task_types, priority matrixLabel, dueBand', () => {
    const blocks = AgentBlocks.normalizeBlocks(
      [
        {
          type: 'blocked',
          enabled: true,
          reasons: ["En attente d'une approbation"],
          links: [{ id: 'st1', label: 'Valider le devis' }]
        },
        { type: 'blocked', cleared: true },
        { type: 'task_types', types: ['action', 'process'] },
        {
          type: 'priority',
          tier: 'Importante',
          urgency: 2,
          impact: 2,
          ease: 4,
          matrixLabel: 'Victoire rapide'
        },
        {
          type: 'due',
          dueDate: '2026-07-22',
          dueBand: 'soon'
        },
        { type: 'due', dueDate: '2026-07-22', dueBand: 'nope' }
      ],
      {}
    );
    assert.equal(blocks.length, 6);
    assert.equal(blocks[0].type, 'blocked');
    assert.equal(blocks[0].enabled, true);
    assert.equal(blocks[0].reasons.length, 1);
    assert.equal(blocks[0].links[0].label, 'Valider le devis');
    assert.equal(blocks[1].type, 'blocked');
    assert.equal(blocks[1].cleared, true);
    assert.equal(blocks[2].type, 'task_types');
    assert.equal(blocks[2].types.length, 2);
    assert.equal(blocks[2].types[0].id, 'action');
    assert.ok(blocks[2].types[0].label);
    assert.equal(blocks[3].matrixLabel, 'Victoire rapide');
    assert.equal(blocks[4].dueBand, 'soon');
    assert.equal(blocks[5].dueBand, undefined);
  });

  it('synthesizes blocked and task_types from tool visuals', () => {
    const blocks = AgentBlocks.synthesizeBlocksFromResults({
      results: [
        {
          ok: true,
          tool: 'set_blocked',
          visual: {
            type: 'blocked',
            enabled: true,
            reasons: ["En attente d'un cable"]
          }
        },
        {
          ok: true,
          tool: 'set_task_types',
          visual: { type: 'task_types', types: ['material', 'action'] }
        }
      ]
    });
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].type, 'blocked');
    assert.equal(blocks[1].type, 'task_types');
    assert.equal(blocks[1].types[0].id, 'material');
  });

  it('caps blocks at MAX_BLOCKS', () => {
    const raw = [];
    for (let i = 0; i < 10; i++) {
      raw.push({ type: 'subtask', text: 'Item ' + i });
    }
    const blocks = AgentBlocks.normalizeBlocks(raw, {});
    assert.equal(blocks.length, AgentBlocks.MAX_BLOCKS);
  });

  it('synthesizes blocks from tool visual payloads', () => {
    const blocks = AgentBlocks.synthesizeBlocksFromResults({
      results: [
        {
          ok: true,
          tool: 'set_priority',
          visual: {
            type: 'priority',
            tier: 'Importante',
            urgency: 2,
            impact: 3,
            ease: 4
          }
        },
        {
          ok: true,
          tool: 'add_subtask',
          visual: { type: 'subtask', text: 'Nouvelle étape', done: false }
        },
        { ok: false, tool: 'set_due', error: 'nope' },
        {
          ok: true,
          tool: 'set_due',
          visual: { type: 'due', dueDate: '2026-07-22' }
        }
      ]
    });
    assert.equal(blocks.length, 3);
    assert.equal(blocks[0].type, 'priority');
    assert.equal(blocks[1].type, 'subtask');
    assert.equal(blocks[2].type, 'due');
  });

  it('dedupes synthesized priority blocks', () => {
    const blocks = AgentBlocks.synthesizeBlocksFromResults({
      results: [
        {
          ok: true,
          tool: 'set_priority',
          visual: { type: 'priority', tier: 'Flexible', urgency: 1, impact: 1, ease: 3 }
        },
        {
          ok: true,
          tool: 'set_priority',
          visual: { type: 'priority', tier: 'Critique', urgency: 4, impact: 4, ease: 5 }
        }
      ]
    });
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].tier, 'Flexible');
  });

  it('hides incomplete {{ placeholders while streaming', () => {
    assert.equal(
      AgentBlocks.hideIncompleteBlockMarker('Hello {{'),
      'Hello '
    );
    assert.equal(
      AgentBlocks.hideIncompleteBlockMarker('Hello {{0'),
      'Hello '
    );
    assert.equal(
      AgentBlocks.hideIncompleteBlockMarker('Hello {{0}'),
      'Hello '
    );
    assert.equal(
      AgentBlocks.hideIncompleteBlockMarker('Hello {{0}} world'),
      'Hello {{0}} world'
    );
  });

  it('strips indent before block placeholders', () => {
    assert.equal(
      AgentBlocks.normalizeBlockPlaceholderIndent('Priorité :\n  {{0}}\nSuite'),
      'Priorité :\n{{0}}\nSuite'
    );
    assert.equal(
      AgentBlocks.normalizeBlockPlaceholderIndent('\t{{1}} ok'),
      '{{1}} ok'
    );
    assert.equal(
      AgentBlocks.normalizeBlockPlaceholderIndent('inline {{0}} keep'),
      'inline {{0}} keep'
    );
  });

  it('fills message content with placeholders and orphan blocks', () => {
    const bubble = {
      children: [],
      replaceChildren() {
        this.children = [];
      },
      appendChild(node) {
        this.children.push(node);
      }
    };
    // Upgrade document.createElement for this test
    const realCreate = global.document.createElement;
    global.document.createElement = function (tag) {
      const node = {
        tagName: String(tag).toUpperCase(),
        className: '',
        style: {},
        childNodes: [],
        textContent: '',
        setAttribute() {},
        getAttribute() {
          return null;
        },
        appendChild(child) {
          this.childNodes.push(child);
        },
        classList: {
          add(c) {
            this._c = (this._c || []).concat(c);
          }
        }
      };
      return node;
    };
    global.document.createTextNode = function (t) {
      return { nodeType: 3, textContent: t };
    };

    try {
      AgentBlocks.fillMessageContent(
        bubble,
        'Priorité :\n  {{0}}\n  Et voici une autre carte.',
        [
          { type: 'priority', tier: 'Critique', urgency: 4, impact: 3, ease: 2 },
          { type: 'subtask', text: 'Orphan subtask' }
        ],
        { streaming: false }
      );
      assert.ok(bubble.children.length >= 2);
      const types = bubble.children
        .filter((n) => n.className && String(n.className).indexOf('agent-block') >= 0)
        .map((n) => n.className);
      assert.ok(types.some((c) => c.indexOf('priority') >= 0));
      assert.ok(types.some((c) => c.indexOf('subtask') >= 0));
      const texts = bubble.children
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent);
      assert.ok(
        texts.every((t) => !/^[ \t]/.test(t) && !/[ \t]$/.test(t.replace(/\n$/, ''))),
        'text chunks around blocks should not keep leading/trailing indent: ' +
          JSON.stringify(texts)
      );
    } finally {
      global.document.createElement = realCreate;
    }
  });

  it('PriorityAgent.normalizeBlocks delegates to AgentBlocks', () => {
    const blocks = PriorityAgent.normalizeBlocks(
      [{ type: 'due', dueVague: 'cette semaine' }],
      {}
    );
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, 'due');
    assert.equal(blocks[0].dueVague, 'cette semaine');
  });

  it('enrichResultVisual attaches priority visual from bridge', () => {
    const bridge = {
      getPriorityState() {
        return {
          urgency: 4,
          impact: 3,
          ease: 2,
          priorityEnabled: true
        };
      }
    };
    const enriched = PriorityAgent.enrichResultVisual(bridge, {
      ok: true,
      tool: 'set_priority',
      args: { tier: 'Critique' },
      summary: 'ok',
      detail: 'urgency 1 → 4'
    });
    assert.ok(enriched.visual);
    assert.equal(enriched.visual.type, 'priority');
    assert.equal(enriched.visual.urgency, 4);
    assert.equal(enriched.visual.impact, 3);
  });

  it('enrichResultVisual attaches subtask visual for add_subtask', () => {
    const bridge = {
      getCompletion() {
        return {
          progress: 0,
          items: [
            { id: 'x1', text: 'Brief', done: false, progress: 0, estimatedMinutes: 20 }
          ]
        };
      }
    };
    const enriched = PriorityAgent.enrichResultVisual(bridge, {
      ok: true,
      tool: 'add_subtask',
      id: 'x1',
      args: { text: 'Brief' },
      summary: 'ok',
      detail: '+ "Brief"'
    });
    // already has no visual — enrich should build one
    assert.ok(enriched.visual);
    assert.equal(enriched.visual.type, 'subtask');
    assert.equal(enriched.visual.text, 'Brief');
  });
});
