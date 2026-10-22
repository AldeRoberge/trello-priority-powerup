'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

loadComponent('agent/agent-ui.js');

const frame = global.AgentUI.loadingFrame;
const phases = ['prepare', 'send', 'read'];

describe('AgentUI.loadingFrame', function () {
  it('starts a phase at its mark and names the step', function () {
    const view = frame('send', 0, 8000, phases);
    assert.equal(view.phase, 'send');
    assert.equal(view.label, 'Envoi de la demande');
    assert.equal(view.icon, 'ti-send');
    assert.deepEqual(view.steps.map(function (s) { return s.icon; }), ['ti-stack-2', 'ti-send', 'ti-book']);
    assert.equal(view.percent, 36);
    assert.equal(view.timeLabel, '\u2248 8 s');
    assert.deepEqual(view.steps.map(function (s) { return s.state; }), ['done', 'now', 'wait']);
  });

  it('creeps toward the next step and caps at 96', function () {
    const mid = frame('send', 4000, 8000, phases);
    assert.ok(mid.percent > 36 && mid.percent < 80);
    const done = frame('read', 8000, 8000, phases);
    assert.equal(done.percent, 96);
    const over = frame('read', 50000, 8000, phases);
    assert.equal(over.percent, 96);
    assert.equal(over.timeLabel, '50 s');
  });

  it('ignores an unknown phase by using the first step', function () {
    const view = frame('nope', 0, 8000, phases);
    assert.equal(view.phase, 'prepare');
    assert.equal(view.steps[0].state, 'now');
  });

  it('keeps the dock write step when asked', function () {
    const view = frame('write', 0, 8000, ['prepare', 'send', 'read', 'write']);
    assert.equal(view.label, '\u00c9criture');
    assert.equal(view.icon, 'ti-pencil');
    assert.equal(view.detail, 'Cartes mises \u00e0 jour');
    assert.equal(view.steps[3].state, 'now');
    assert.equal(view.percent, 92);
  });
});
