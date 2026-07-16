'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('PriorityAgent status brief', () => {
  let Agent;

  before(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    assert.ok(Agent);
    assert.equal(typeof Agent.buildStatusBriefSnapshot, 'function');
    assert.equal(typeof Agent.buildHeuristicStatusBrief, 'function');
    assert.equal(typeof Agent.fingerprintStatusBriefSnapshot, 'function');
  });

  function snap(overrides) {
    return Object.assign(
      {
        cardName: 'Task',
        phase: 'not_started',
        stuck: false,
        statutCategory: null,
        statutListName: null,
        blockedReasons: [],
        progressPercent: null,
        subtasksDone: 0,
        subtasksTotal: 0,
        estimatedRemainingMinutes: null,
        dueMissing: false,
        duePast: false,
        dueSoon: false,
        dueCountdown: null,
        dueDate: null,
        dueTime: null,
        priorityTier: '',
        ease: 3,
        scale: 'medium',
        youAssigned: false,
        unassigned: true,
        otherNames: [],
        assigneeCount: 0,
      },
      overrides || {}
    );
  }

  it('buildStatusBriefSnapshot marks stuck when blocked', () => {
    const snapshot = Agent.buildStatusBriefSnapshot({
      cardName: 'Fix login',
      blocked: { enabled: true, blockedReasons: ['Attente design'] },
      progress: { percent: 20, doneCount: 1, totalCount: 2 },
      statut: { category: 'started', listName: 'En cours' },
      due: { enabled: true, dueDate: null },
      ownership: {
        members: [{ id: 'me', fullName: 'Alex Demers' }],
        you: { id: 'me', fullName: 'Alex Demers' },
        youAssigned: true,
        unassigned: false,
        assigneeCount: 1,
      },
      priority: { enabled: true, ease: 4 },
      display: { label: 'Importante', duePast: false, dueCountdown: null },
    });
    assert.equal(snapshot.phase, 'stuck');
    assert.equal(snapshot.stuck, true);
    assert.equal(snapshot.youAssigned, true);
    assert.deepEqual(snapshot.blockedReasons, ['Attente design']);
    assert.equal(snapshot.dueMissing, true);
    assert.equal(snapshot.scale, 'petit');
  });

  it('buildStatusBriefSnapshot detects project scale', () => {
    const snapshot = Agent.buildStatusBriefSnapshot({
      progress: {
        percent: 10,
        doneCount: 1,
        totalCount: 8,
        estimatedRemainingMinutes: 400,
        items: [
          { text: 'Done bit', done: true },
          { text: 'Rédiger le brief', done: false },
          { text: 'Valider avec Sam', done: false },
        ],
      },
      statut: { category: 'started' },
      due: { enabled: true, dueDate: '2026-08-01' },
      ownership: {
        members: [{ id: 'other', fullName: 'Sam Boss' }],
        you: { id: 'me', fullName: 'Alex' },
        youAssigned: false,
        unassigned: false,
        assigneeCount: 1,
      },
      priority: { enabled: true, ease: 2 },
      display: { label: 'Critique' },
    });
    assert.equal(snapshot.phase, 'in_progress');
    assert.equal(snapshot.scale, 'gros');
    assert.equal(snapshot.youAssigned, false);
    assert.deepEqual(snapshot.otherNames, ['Sam']);
    assert.deepEqual(snapshot.nextOpenItems[0], 'Rédiger le brief');
  });

  it('heuristic: stuck + you mentions blocking', () => {
    const sentence = Agent.buildHeuristicStatusBrief(
      snap({
        phase: 'stuck',
        stuck: true,
        youAssigned: true,
        unassigned: false,
        blockedReasons: ['Attente API'],
      })
    );
    assert.match(sentence, /bloqu/i);
    assert.match(sentence, /\u00c0 toi|À toi/i);
    assert.match(sentence, /API/i);
  });

  it('heuristic: stuck + someone else names them', () => {
    const sentence = Agent.buildHeuristicStatusBrief(
      snap({
        phase: 'stuck',
        stuck: true,
        youAssigned: false,
        unassigned: false,
        otherNames: ['Sam'],
        assigneeCount: 1,
      })
    );
    assert.match(sentence, /Sam/);
    assert.match(sentence, /bloqu/i);
  });

  it('heuristic: in progress + you + missing due uses next work, not percent', () => {
    const sentence = Agent.buildHeuristicStatusBrief(
      snap({
        phase: 'in_progress',
        youAssigned: true,
        unassigned: false,
        progressPercent: 40,
        dueMissing: true,
        scale: 'moyen',
        nextOpenItems: ['Finaliser le montage'],
        subtasksOpen: 2,
      })
    );
    assert.match(sentence, /\u00c0 toi|À toi/i);
    assert.match(sentence, /montage/i);
    assert.match(sentence, /\u00e9ch\u00e9ance|échéance/i);
    assert.doesNotMatch(sentence, /40|%|quick|vite/i);
  });

  it('heuristic: not started unassigned missing due', () => {
    const sentence = Agent.buildHeuristicStatusBrief(
      snap({
        phase: 'not_started',
        unassigned: true,
        dueMissing: true,
      })
    );
    assert.match(sentence, /Personne|assign/i);
    assert.match(sentence, /\u00e9ch\u00e9ance|échéance|dort/i);
  });

  it('heuristic: petit fix not started for you', () => {
    const sentence = Agent.buildHeuristicStatusBrief(
      snap({
        phase: 'not_started',
        youAssigned: true,
        unassigned: false,
        scale: 'petit',
      })
    );
    assert.match(sentence, /\u00c0 toi|À toi/i);
    assert.match(sentence, /petit|fix/i);
    assert.doesNotMatch(sentence, /quick/i);
  });

  it('heuristic: gros chantier not started for you', () => {
    const sentence = Agent.buildHeuristicStatusBrief(
      snap({
        phase: 'not_started',
        youAssigned: true,
        unassigned: false,
        scale: 'gros',
      })
    );
    assert.match(sentence, /\u00c0 toi|À toi/i);
    assert.match(sentence, /chantier|gros/i);
  });

  it('buildStatusBriefSnapshot marks dueSoon within 14 days', () => {
    const snapshot = Agent.buildStatusBriefSnapshot({
      today: '2026-07-16',
      progress: { percent: 10, doneCount: 0, totalCount: 1 },
      statut: { category: 'started' },
      due: { enabled: true, dueDate: '2026-07-18', dueTime: '14:30' },
      ownership: {
        members: [{ id: 'me', fullName: 'Alex' }],
        you: { id: 'me', fullName: 'Alex' },
        youAssigned: true,
        unassigned: false,
        assigneeCount: 1,
      },
      display: {
        label: 'Importante',
        duePast: false,
        dueCountdown: 'Dans 2 jours',
      },
    });
    assert.equal(snapshot.dueSoon, true);
    assert.equal(snapshot.dueTime, '14:30');
    assert.equal(snapshot.dueMissing, false);
  });

  it('buildStatusBriefSnapshot does not mark far due as soon', () => {
    const snapshot = Agent.buildStatusBriefSnapshot({
      today: '2026-07-16',
      due: { enabled: true, dueDate: '2026-09-01', dueTime: '09:00' },
      display: { duePast: false, dueCountdown: 'Dans 47 jours' },
    });
    assert.equal(snapshot.dueSoon, false);
    assert.equal(snapshot.dueTime, '09:00');
  });

  it('heuristic: soon due includes countdown and clock time', () => {
    const sentence = Agent.buildHeuristicStatusBrief(
      snap({
        phase: 'in_progress',
        youAssigned: true,
        unassigned: false,
        dueSoon: true,
        dueCountdown: 'Demain',
        dueTime: '14:30',
        nextOpenItems: ['Finaliser le montage'],
        subtasksOpen: 1,
      })
    );
    assert.match(sentence, /montage/i);
    assert.match(sentence, /demain/i);
    assert.match(sentence, /14\s*h/i);
  });

  it('heuristic: far due stays silent about timing', () => {
    const sentence = Agent.buildHeuristicStatusBrief(
      snap({
        phase: 'in_progress',
        youAssigned: true,
        unassigned: false,
        dueSoon: false,
        dueDate: '2026-09-01',
        dueCountdown: 'Dans 47 jours',
        dueTime: '09:00',
        nextOpenItems: ['Finaliser le montage'],
      })
    );
    assert.match(sentence, /montage/i);
    assert.doesNotMatch(sentence, /47|09|septembre|échéance/i);
  });

  it('fingerprint changes when ownership changes', () => {
    const a = Agent.fingerprintStatusBriefSnapshot(
      snap({ youAssigned: true, unassigned: false })
    );
    const b = Agent.fingerprintStatusBriefSnapshot(
      snap({ youAssigned: false, unassigned: true })
    );
    assert.notEqual(a, b);
    assert.equal(
      a,
      Agent.fingerprintStatusBriefSnapshot(
        snap({ youAssigned: true, unassigned: false })
      )
    );
  });

  it('ownership flows through buildContext', () => {
    const ctx = Agent.buildContext({
      getOwnership() {
        return {
          members: [
            { id: '1', fullName: 'Alex Demers' },
            { id: '2', fullName: 'Sam Boss' },
          ],
          you: { id: '1', fullName: 'Alex Demers' },
          youAssigned: true,
          assigneeCount: 2,
          unassigned: false,
        };
      },
    });
    assert.ok(ctx.ownership);
    assert.equal(ctx.ownership.youAssigned, true);
    assert.equal(ctx.ownership.assigneeCount, 2);
    assert.equal(ctx.ownership.members.length, 2);
  });
});
