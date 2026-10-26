'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('AgentGuides', () => {
  let Guides;
  let Agent;

  beforeEach(() => {
    clearComponentCache();
    delete global.AgentGuides;
    delete global.PriorityAgent;
    Guides = loadComponent('agent/agent-guides.js').AgentGuides;
    Agent = loadComponent('agent/agent.js').PriorityAgent;
  });

  it('opens breathe or stretch from a short request', () => {
    assert.deepEqual(Guides.matchIntent('Start 15 min timer'), {
      kind: 'timer',
      minutes: 15
    });
    assert.deepEqual(Guides.matchIntent('pomodoro 25 min'), {
      kind: 'timer',
      minutes: 25
    });
    assert.deepEqual(Guides.matchIntent('I want to meditate now'), {
      kind: 'breathe',
      preset: null
    });
    assert.deepEqual(Guides.matchIntent('Respirer 30 secondes'), {
      kind: 'breathe',
      preset: '30s'
    });
    assert.deepEqual(Guides.matchIntent('on médite, le 4-2-6'), {
      kind: 'breathe',
      preset: '426'
    });
    assert.deepEqual(Guides.matchIntent('étirements'), {
      kind: 'stretch',
      id: null
    });
    assert.deepEqual(Guides.matchIntent('le cou'), {
      kind: 'stretch',
      id: 'cou'
    });
    assert.equal(
      Guides.matchIntent(
        'Regarde le dos de cette longue carte et dis-moi ce qui bloque vraiment le travail de toute l équipe aujourd hui merci'
      ),
      null
    );
  });

  it('normalizes guide and check payloads', () => {
    assert.deepEqual(Guides.normalizeGuide({ kind: 'meditation' }), {
      kind: 'breathe',
      preset: null
    });
    assert.deepEqual(Guides.normalizeGuide({ kind: 'stretch', id: 'épaules' }), {
      kind: 'stretch',
      id: 'epaules'
    });
    assert.equal(Guides.normalizeGuide({ kind: 'nope' }), null);
    assert.deepEqual(
      Guides.normalizeCheck({ seconds: 45, message: 'Comment tu te sens?' }),
      { seconds: 45, message: 'Comment tu te sens?' }
    );
    assert.equal(Guides.timerTitle(15, false), 'Start 15 min timer');
    assert.equal(Guides.timerTitle(15, true), '15 min');
    assert.equal(Guides.formatClock(15 * 60000), '15:00');
    assert.equal(Guides.formatClock(61000), '1:01');
    assert.deepEqual(Guides.normalizeGuide({ kind: 'pomodoro' }), {
      kind: 'timer',
      minutes: 15
    });
    assert.deepEqual(Guides.normalizeGuide({ kind: 'timer', minutes: 25 }), {
      kind: 'timer',
      minutes: 25
    });
    assert.equal(Guides.normalizeCheck({ seconds: 2, message: 'Trop tôt' }), null);
    assert.equal(Guides.normalizeCheck({ seconds: 45, message: '   ' }), null);
  });

  it('reads a guide and a later check out of a reply', () => {
    const found = Guides.collect({
      message: 'Okay.',
      actions: [
        { op: 'show_guide', kind: 'breathe' },
        { op: 'schedule_check', seconds: 45, message: 'Comment tu te sens?' },
        { op: 'create', title: 'Autre' }
      ]
    });
    assert.deepEqual(found.guides, [{ kind: 'breathe', preset: null }]);
    assert.deepEqual(found.checks, [{ seconds: 45, message: 'Comment tu te sens?' }]);
  });

  it('walks inspire, hold, expire, then stays empty', () => {
    assert.equal(Guides.breatheAt('426', 0).label, 'Inspire');
    assert.equal(Guides.breatheAt('426', 4000).label, 'Garde');
    assert.equal(Guides.breatheAt('426', 6000).label, 'Expire');
    assert.equal(Guides.breatheAt('426', 12000).phase, 'rest');
    assert.equal(Guides.breatheAt('426', 12000).height, 0);
    assert.equal(Guides.breatheAt('426', 0).scale < Guides.breatheAt('426', 2000).scale, true);
    assert.equal(Guides.breatheAt('426', 42000).done, true);
    const pts = Guides.breathePoints('426');
    assert.deepEqual(pts.slice(0, 5).map((p) => [p.t, p.y]), [
      [0, 0],
      [4000, 1],
      [6000, 1],
      [12000, 0],
      [14000, 0]
    ]);
    const mid = Guides.breatheTrace(pts, 2000);
    assert.equal(mid[mid.length - 1].y, 0.5);
  });

  it('splits due reminders from the ones still waiting', () => {
    const tasks = [
      { id: 'a', message: 'Maintenant', at: 1000 },
      { id: 'b', message: 'Plus tard', at: 5000 }
    ];
    const split = Guides.dueTasks(tasks, 1000);
    assert.deepEqual(split.due.map((t) => t.id), ['a']);
    assert.deepEqual(split.pending.map((t) => t.id), ['b']);
    assert.equal(Guides.formatRemain(45000), '45 s');
    assert.equal(Guides.formatRemain(65000), '1 min 5 s');
  });

  it('executes show_guide and schedule_check without touching the card', async () => {
    const applied = await Agent.executeActions({}, [
      { tool: 'show_guide', args: { kind: 'breathe', preset: '30s' } },
      { tool: 'schedule_check', args: { seconds: 45, message: 'Comment tu te sens?' } },
      { tool: 'show_guide', args: { kind: 'nope' } }
    ]);
    assert.equal(applied.results[0].ok, true);
    assert.equal(applied.results[0].guide.preset, '30s');
    assert.equal(applied.results[1].ok, true);
    assert.equal(applied.results[1].schedule.seconds, 45);
    assert.equal(applied.results[2].ok, false);
  });
});
