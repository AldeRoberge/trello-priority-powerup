'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

loadComponent('priority/priority-ui.js');
loadComponent('priority/priority-trello.js');

const PU = global.PriorityUI;
const PT = global.PriorityTrello;

describe('Échéance vague mode', () => {
  it('exposes vague option catalog and mode constants', () => {
    assert.equal(PU.DUE_DATE_MODE_PRECISE, 'precise');
    assert.equal(PU.DUE_DATE_MODE_VAGUE, 'vague');
    assert.ok(Array.isArray(PU.DUE_DATE_VAGUE_OPTIONS));
    assert.ok(PU.DUE_DATE_VAGUE_OPTIONS.length >= 8);
    const ids = PU.DUE_DATE_VAGUE_OPTIONS.map((o) => o.id);
    assert.equal(ids[0], 'bientot');
    assert.equal(ids[ids.length - 1], 'tres-lointain');
    assert.ok(ids.includes('proche'));
    assert.ok(ids.includes('lointain'));
    assert.ok(ids.includes('eventuellement'));
    assert.equal(PU.DUE_DATE_VAGUE_DEFAULT_ID, 'proche');
  });

  it('maps continuum endpoints on the vague slider helpers', () => {
    assert.equal(PU.dueVagueIndex('bientot'), 0);
    assert.equal(
      PU.dueVagueIdAtIndex(PU.DUE_DATE_VAGUE_OPTIONS.length - 1),
      'tres-lointain'
    );
    assert.equal(PU.formatDueVagueLabel('bientot'), 'Bientôt');
    assert.equal(
      PU.formatDueVagueCountdown('tres-lointain'),
      'À faire dans un futur très lointain'
    );
  });

  it('normalizeDueVague accepts known ids only', () => {
    assert.equal(PU.normalizeDueVague('proche'), 'proche');
    assert.equal(PU.normalizeDueVague('  lointain '), 'lointain');
    assert.equal(PU.normalizeDueVague('nope'), '');
    assert.equal(PU.normalizeDueVague(null), '');
  });

  it('normalizeDueMode defaults to precise', () => {
    assert.equal(PU.normalizeDueMode('vague'), 'vague');
    assert.equal(PU.normalizeDueMode('precise'), 'precise');
    assert.equal(PU.normalizeDueMode(''), 'precise');
    assert.equal(PU.normalizeDueMode(null), 'precise');
  });

  it('resolveDueVagueToDate maps horizons to future ISO dates', () => {
    const now = new Date(2026, 6, 20); // 2026-07-20 local
    const proche = PU.resolveDueVagueToDate('proche', now);
    const lointain = PU.resolveDueVagueToDate('lointain', now);
    const eventually = PU.resolveDueVagueToDate('eventuellement', now);
    assert.equal(proche, '2026-08-19');
    assert.equal(lointain, '2027-07-20');
    // 1095 days crosses leap day 2028-02-29 → 2029-07-19
    assert.equal(eventually, '2029-07-19');
    assert.equal(PU.resolveDueVagueToDate('bogus', now), '');
  });

  it('formatDueVagueCountdown uses À faire phrasing (no day count)', () => {
    assert.equal(
      PU.formatDueVagueCountdown('proche'),
      'À faire dans un futur proche'
    );
    assert.equal(
      PU.formatDueVagueCountdown('eventuellement'),
      'À faire éventuellement'
    );
    assert.equal(PU.formatDueVagueLabel('eventuellement'), 'Éventuellement');
    assert.equal(PU.formatDueVagueCountdown(''), '');
  });

  it('withDueDateDisplay uses vague label instead of day countdown', () => {
    const display = PU.withDueDateDisplay(
      { label: 'Urgente', tierI: 1 },
      {
        dueDate: '2026-08-19',
        dueMode: 'vague',
        dueVague: 'proche',
        dueEnabled: true
      }
    );
    assert.equal(display.dueCountdown, 'À faire dans un futur proche');
    assert.equal(display.duePast, false);
    assert.equal(display.dueMode, 'vague');
    assert.equal(display.dueVague, 'proche');
    assert.equal(display.dueTime, undefined);
  });

  it('isDueEnabled is true for vague horizon without relying on time', () => {
    assert.equal(
      PU.isDueEnabled({
        dueMode: 'vague',
        dueVague: 'lointain',
        dueDate: '2027-07-20',
        dueEnabled: true
      }),
      true
    );
    assert.equal(
      PU.isDueEnabled({
        dueMode: 'vague',
        dueVague: 'lointain',
        dueEnabled: false
      }),
      false
    );
  });

  it('normalizeInputs keeps dueMode and dueVague', () => {
    const normalized = PT.normalizeInputs({
      urgency: 0.5,
      impact: 0.5,
      ease: 0.5,
      dueMode: 'vague',
      dueVague: 'proche',
      dueDate: '2026-08-19'
    });
    assert.equal(normalized.dueMode, 'vague');
    assert.equal(normalized.dueVague, 'proche');
    assert.equal(normalized.dueDate, '2026-08-19');
    assert.equal(normalized.dueTime, undefined);
  });

  it('normalizeInputs resolves missing dueDate from vague id', () => {
    const normalized = PT.normalizeInputs({
      urgency: 0.5,
      impact: 0.5,
      ease: 0.5,
      dueVague: 'proche'
    });
    assert.equal(normalized.dueMode, 'vague');
    assert.equal(normalized.dueVague, 'proche');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(normalized.dueDate));
  });

  it('isDueVagueEligible is true only beyond one week (labeled toggle)', () => {
    const now = new Date(2026, 6, 20);
    assert.equal(PU.isDueVagueEligible('2026-07-27', now), false); // +7 → icons-only
    assert.equal(PU.isDueVagueEligible('2026-07-28', now), true); // +8 → labels
    assert.equal(PU.isDueVagueEligible('2026-08-19', now), true);
    assert.equal(PU.isDueVagueEligible('', now), false);
  });


  it('formatDueCountdownFromInputs prefers Vague horizon labels', () => {
    assert.equal(
      PU.formatDueCountdownFromInputs({
        dueMode: 'vague',
        dueVague: 'eventuellement',
        dueDate: '2029-07-19',
        dueEnabled: true
      }),
      'À faire éventuellement'
    );
    assert.doesNotMatch(
      PU.formatDueCountdownFromInputs({
        dueMode: 'vague',
        dueVague: 'eventuellement',
        dueDate: '2029-07-19',
        dueEnabled: true
      }),
      /ans restants/
    );
  });

  it('withDueDateDisplay keeps À faire éventuellement on the card face text', () => {
    const display = PU.withDueDateDisplay(
      { label: 'Secondaire', tierI: 5 },
      {
        dueDate: '2029-07-19',
        dueMode: 'vague',
        dueVague: 'eventuellement',
        dueEnabled: true
      }
    );
    assert.equal(display.dueCountdown, 'À faire éventuellement');
    assert.equal(
      PU.formatDueBadgeText(display),
      'Tâche secondaire (À faire éventuellement)'
    );
  });
});
