'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('GanttUI helpers', () => {
  let GanttUI;

  before(() => {
    loadComponent('gantt/gantt-model.js');
    loadComponent('gantt/gantt-ui.js');
    GanttUI = global.GanttUI;
    assert.ok(GanttUI);
  });

  beforeEach(() => {
    try {
      global.localStorage.removeItem(GanttUI.LABELS_W_STORAGE_KEY);
      global.localStorage.removeItem(GanttUI.FILTERS_STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  });

  it('exports labels width constants', () => {
    assert.equal(GanttUI.LABELS_W_MIN, 280);
    assert.equal(GanttUI.LABELS_W_DEFAULT, 560);
    assert.ok(GanttUI.LABELS_W_STORAGE_KEY);
  });

  it('clampLabelsWidth enforces min and leaves room for calendar', () => {
    assert.equal(GanttUI.clampLabelsWidth(100, 1000), GanttUI.LABELS_W_MIN);
    assert.equal(GanttUI.clampLabelsWidth(900, 1000), 780); // 1000 - 220
    assert.equal(GanttUI.clampLabelsWidth(500, 1000), 500);
    assert.equal(
      GanttUI.clampLabelsWidth(400, { clientWidth: 800 }),
      400
    );
  });

  it('store/read labels width round-trips via localStorage', () => {
    assert.equal(GanttUI.readStoredLabelsWidth(), GanttUI.LABELS_W_DEFAULT);
    GanttUI.storeLabelsWidth(640);
    assert.equal(GanttUI.readStoredLabelsWidth(), 640);
  });

  it('readStoredLabelsWidth ignores out-of-range and invalid values', () => {
    GanttUI.storeLabelsWidth(50);
    assert.equal(GanttUI.readStoredLabelsWidth(), GanttUI.LABELS_W_DEFAULT);
    global.localStorage.setItem(GanttUI.LABELS_W_STORAGE_KEY, 'nope');
    assert.equal(GanttUI.readStoredLabelsWidth(), GanttUI.LABELS_W_DEFAULT);
    global.localStorage.setItem(GanttUI.LABELS_W_STORAGE_KEY, '9999');
    assert.equal(GanttUI.readStoredLabelsWidth(), GanttUI.LABELS_W_DEFAULT);
  });

  it('defaults hideCompleted on and persists filter preferences', () => {
    const defaults = GanttUI.readStoredFilters();
    assert.equal(defaults.hideCompleted, true);
    assert.equal(defaults.hideUndated, false);
    assert.equal(defaults.sortBy, 'date');

    GanttUI.storeFilters({
      hideCompleted: false,
      hideUndated: true,
      sortBy: 'progress',
      sortDir: 'asc',
    });
    const stored = GanttUI.readStoredFilters();
    assert.deepEqual(stored, {
      hideCompleted: false,
      hideUndated: true,
      sortBy: 'progress',
      sortDir: 'asc',
    });

    global.localStorage.setItem(GanttUI.FILTERS_STORAGE_KEY, '{bad');
    assert.deepEqual(GanttUI.readStoredFilters(), GanttUI.DEFAULT_FILTERS);
  });

  it('shouldShowPriorityFire only above Importante', () => {
    assert.equal(typeof GanttUI.shouldShowPriorityFire, 'function');
    assert.equal(
      GanttUI.shouldShowPriorityFire({
        priorityEnabled: true,
        priorityTierI: 0,
        priorityLabel: 'Critique',
      }),
      true
    );
    assert.equal(
      GanttUI.shouldShowPriorityFire({
        priorityEnabled: true,
        priorityTierI: 2,
        priorityLabel: 'Prioritaire',
      }),
      true
    );
    assert.equal(
      GanttUI.shouldShowPriorityFire({
        priorityEnabled: true,
        priorityTierI: 3,
        priorityLabel: 'Importante',
      }),
      false
    );
    assert.equal(
      GanttUI.shouldShowPriorityFire({
        priorityEnabled: true,
        priorityTierI: 4,
        priorityLabel: 'Flexible',
      }),
      false
    );
    assert.equal(
      GanttUI.shouldShowPriorityFire({
        priorityEnabled: false,
        priorityTierI: 0,
        priorityLabel: 'Critique',
      }),
      false
    );
  });
});
