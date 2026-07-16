'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Task title split', () => {
  let Agent;

  before(() => {
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    assert.ok(Agent);
    assert.equal(typeof Agent.titleMayBeCompound, 'function');
    assert.equal(typeof Agent.normalizeSplitTaskResult, 'function');
    assert.equal(typeof Agent.splitTaskTitle, 'function');
  });

  it('titleMayBeCompound detects slash alternatives and also-clauses', () => {
    assert.equal(Agent.titleMayBeCompound('Commander le matériel'), false);
    assert.equal(
      Agent.titleMayBeCompound('Do single portrait/landscape video test'),
      true
    );
    assert.equal(
      Agent.titleMayBeCompound(
        'Export the video. Also, evaluate portrait mode benefits for a shooter.'
      ),
      true
    );
    assert.equal(
      Agent.titleMayBeCompound(
        'Long enough title that should still look compound when it has also in the middle of the sentence'
      ),
      true
    );
  });

  it('normalizeSplitTaskResult accepts polished multi-task payloads', () => {
    const original =
      "Do single portrait/landscape video test with opengate, 4K, Apple Pro Res HQ. Also, we should export the video I've been working on as a test to see the changes; also, we should see what benefits it a pour shooter in portrait mode.";
    const result = Agent.normalizeSplitTaskResult(
      {
        shouldSplit: true,
        tasks: [
          'Do single portrait/landscape video test with OpenGate, 4K, Apple ProRes HQ',
          'Export the video as a test to review the changes',
          'Evaluate portrait-mode benefits for the shooter',
        ],
      },
      original
    );
    assert.equal(result.shouldSplit, true);
    assert.equal(result.tasks.length, 3);
    assert.match(result.tasks[0], /portrait\/landscape/i);
    assert.doesNotMatch(result.tasks[0], /^Do a single portrait video test/i);
    assert.match(result.tasks[1], /export/i);
    assert.match(result.tasks[2], /shooter|portrait/i);
  });

  it('normalizeSplitTaskResult rejects single-task and empty payloads', () => {
    assert.deepEqual(
      Agent.normalizeSplitTaskResult({ shouldSplit: true, tasks: ['Only one'] }, 'Only one'),
      { shouldSplit: false, tasks: ['Only one'] }
    );
    assert.deepEqual(Agent.normalizeSplitTaskResult(null, 'Keep me'), {
      shouldSplit: false,
      tasks: ['Keep me'],
    });
    assert.deepEqual(
      Agent.normalizeSplitTaskResult(
        { shouldSplit: false, tasks: ['A', 'B'] },
        'A and B'
      ),
      { shouldSplit: false, tasks: ['A and B'] }
    );
  });

  it('normalizeSplitTaskResult dedupes and accepts {text} rows', () => {
    const result = Agent.normalizeSplitTaskResult(
      {
        shouldSplit: true,
        tasks: [
          { text: 'First task' },
          { title: 'Second task' },
          'First task',
          { text: 'Third task' },
        ],
      },
      'compound'
    );
    assert.equal(result.shouldSplit, true);
    assert.deepEqual(result.tasks, ['First task', 'Second task', 'Third task']);
  });
});
