'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('project icons', () => {
  before(() => {
    loadComponent('docs/docs-model.js');
    loadComponent('mindmap/mindmap-model.js');
    loadComponent('shared/work-os.js');
    loadComponent('shared/project-icon.js');
    loadComponent('gantt/gantt-model.js');
    loadComponent('table/table-model.js');
    loadComponent('journey/journey-model.js');
  });

  it('keeps a catalog icon on a project and drops an unknown one', () => {
    const n = global.MindmapModel.normalizeGoals({
      nodes: [
        { id: 'g:p', level: 'project', name: 'Site', icon: { i: 'rocket', c: '#0c66e4' } },
        { id: 'g:q', level: 'project', name: 'Autre', icon: { i: 'not-an-icon', c: 'red' } },
      ],
      links: [],
    });
    assert.deepEqual(n.nodes[0].icon, { i: 'rocket', c: '#0c66e4' });
    assert.equal(n.nodes[1].icon, undefined);
  });

  it('asks the assistant for one icon and ignores a name outside the catalog', async () => {
    global.PriorityAgent = {
      isConfigured: () => true,
      getProvider: async () => ({ apiKey: 'x', baseUrl: 'http://x', model: 'm' }),
      chatCompletions: async () => ({ content: '{"i":"plane","c":"#0c66e4"}' }),
    };
    assert.deepEqual(await global.ProjectIcon.suggest({}, 'Voyage', ''), { i: 'plane', c: '#0c66e4' });

    global.PriorityAgent.isConfigured = () => false;
    assert.equal(await global.ProjectIcon.suggest({}, 'Voyage'), null);

    global.PriorityAgent.isConfigured = () => true;
    global.PriorityAgent.chatCompletions = async () => ({ content: '{"i":"not-an-icon"}' });
    assert.equal(await global.ProjectIcon.suggest({}, 'X'), null);
  });

  it('a Gantt project section carries the icon', () => {
    const grouped = global.GanttModel.sortTreeRootsGroupedByProject(
      [{ id: 'card:a', kind: 'card', cardId: 'a', name: 'A', children: [] }],
      'name',
      'asc',
      { projectOf: () => ({ id: 'p', name: 'Site', icon: { i: 'rocket' } }) }
    );
    assert.equal(grouped[0].sectionKey, 'project');
    assert.deepEqual(grouped[0].icon, { i: 'rocket' });
  });

  it('a place, a table section, a mindmap node and Parcours keep the same icon', async () => {
    const goals = {
      nodes: [{ id: 'p', level: 'project', name: 'Site', icon: { i: 'rocket', c: '#0c66e4' } }],
      links: [{ from: 'card', to: 'p' }],
    };
    const place = global.WorkOS.places(goals).card;
    assert.equal(place.projectId, 'p');
    assert.deepEqual(place.icon, { i: 'rocket', c: '#0c66e4' });

    const sections = global.TableModel.groupByProject(
      [{ id: 'card', project: 'Site', projectId: 'p', projectIcon: place.icon }],
      {}
    );
    assert.equal(sections[0].id, 'p');
    assert.deepEqual(sections[0].icon, { i: 'rocket', c: '#0c66e4' });

    const graph = global.MindmapModel.buildGraph([], { goals: goals });
    assert.deepEqual(graph.nodes.filter((n) => n.id === 'p')[0].icon, { i: 'rocket', c: '#0c66e4' });

    const parcours = global.JourneyModel.prepare([], goals);
    assert.deepEqual(parcours.byId.p.icon, { i: 'rocket', c: '#0c66e4' });

    global.MindmapGoalsTrello = { save: async (_t, g) => g };
    const saved = await global.ProjectIcon.save({}, { nodes: [{ id: 'p', level: 'project', name: 'Site' }], links: [] }, 'p', { i: 'plane', c: '#0c66e4' });
    assert.deepEqual(saved.nodes[0].icon, { i: 'plane', c: '#0c66e4' });
    assert.deepEqual(global.ProjectIcon.of('p'), { i: 'plane', c: '#0c66e4' });
  });
});
