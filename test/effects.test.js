'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('CelebrationEffects', () => {
  let FX;

  before(() => {
    loadComponent('shared/effects.js');
    FX = global.CelebrationEffects;
    assert.ok(FX);
  });

  it('lists 22 effects', () => {
    assert.equal(FX.list().length, 22);
  });

  it('normalizes known ids and aliases', () => {
    const expected = [
      'fireworks',
      'confetti',
      'hearts',
      'sparkles',
      'shooting_stars',
      'bubbles',
      'aurora',
      'balloons',
      'petals',
      'flowers',
      'rainbow',
      'disco',
      'beep',
      'boop',
      'zap',
      'thunder',
      'fanfare',
      'bonk',
      'laser',
      'coin',
      'drumroll',
      'banner',
    ];
    for (const id of expected) {
      assert.ok(FX.list().includes(id), `missing ${id}`);
      assert.equal(FX.normalize(id), id);
    }
    assert.equal(FX.normalize('confettis'), 'confetti');
    assert.equal(FX.normalize('etoiles'), 'shooting_stars');
    assert.equal(FX.normalize('beep_beep'), 'beep');
    assert.equal(FX.normalize('tonnerre'), 'thunder');
    assert.equal(FX.normalize('fullscreen_text'), 'banner');
    assert.equal(FX.normalize('fleurs'), 'flowers');
    assert.equal(FX.normalize('bouquet'), 'flowers');
    assert.equal(FX.normalize('lava'), null);
  });

  it('exposes labels and play APIs', () => {
    assert.ok(typeof FX.label('fireworks') === 'string' && FX.label('fireworks').length > 0);
    assert.equal(typeof FX.play, 'function');
    assert.equal(typeof FX.clear, 'function');
    assert.equal(typeof FX.playSubtaskPop, 'function');
    assert.equal(typeof FX.playUiSound, 'function');
    assert.equal(FX.playSubtaskPop(null, { sound: false }).ok, false);
    assert.equal(FX.play('banner', { sound: false }).ok, false);
  });

  it('playUiSound accepts known ids and aliases', () => {
    for (const id of [
      'trash',
      'block',
      'unblock',
      'complete_all',
      'reset',
      'reset_arm',
      'reset_all',
      'uncomplete',
      'add',
      'done',
    ]) {
      const once = FX.playUiSound(id);
      assert.ok(once && once.ok && once.sound === id, id);
    }
    assert.equal(FX.playUiSound('delete').sound, 'trash');
    assert.equal(FX.playUiSound('nope').ok, false);
  });
});

describe('PriorityAgent trigger_effect', () => {
  let Agent;

  before(() => {
    loadComponent('shared/effects.js');
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    assert.ok(Agent && typeof Agent.executeAction === 'function');
  });

  it('plays effects via bridge and localizes banner text', async () => {
    const played = [];
    let bridgeLang = 'fr';
    const bridge = {
      getProfile: () => ({ language: bridgeLang }),
      playEffect: (name, opts) => {
        played.push({ name, opts: opts || {} });
        return { ok: true, effect: name };
      },
    };

    let res = await Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'confetti' },
    });
    assert.ok(res && res.ok);
    assert.equal(played[0].name, 'confetti');

    res = await Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'nope' },
    });
    assert.ok(res && !res.ok);

    res = await Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'thunder', text: 'TWO' },
    });
    assert.ok(res && res.ok);
    assert.equal(played[played.length - 1].opts.text, 'DEUX');

    bridgeLang = 'en';
    res = await Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'thunder', text: 'TWO' },
    });
    assert.ok(res && res.ok);
    assert.equal(played[played.length - 1].opts.text, 'TWO');

    res = await Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'banner', text: 'BOOM', sound: 'fanfare' },
    });
    assert.ok(res && res.ok);
    const last = played[played.length - 1];
    assert.equal(last.name, 'banner');
    assert.equal(last.opts.sound, 'fanfare');
    assert.equal(last.opts.text, 'BOOM');

    res = await Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'banner' },
    });
    assert.ok(res && !res.ok);
  });
});
