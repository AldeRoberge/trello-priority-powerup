'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('OutlookSync', () => {
  let OutlookSync;
  let GanttModel;

  before(() => {
    clearComponentCache();
    loadComponent('gantt/gantt-model.js');
    loadComponent('outlook/outlook-config.js');
    loadComponent('outlook/outlook-sync.js');
    OutlookSync = global.OutlookSync;
    GanttModel = global.GanttModel;
    assert.ok(OutlookSync);
    assert.ok(GanttModel);
  });

  it('mergeCardEvent prefers Trello when only Trello changed', () => {
    const base = {
      name: 'A',
      desc: 'd',
      startDate: '2026-07-01',
      dueDate: '2026-07-02',
      dueTime: '',
    };
    const trello = Object.assign({}, base, { name: 'B' });
    const outlook = Object.assign({}, base);
    const m = OutlookSync.mergeCardEvent(trello, outlook, base);
    assert.equal(m.nextSynced.name, 'B');
    assert.ok(m.toOutlook);
    assert.equal(m.toOutlook.name, 'B');
    assert.equal(m.toTrello, null);
  });

  it('mergeCardEvent prefers Outlook when only Outlook changed', () => {
    const base = {
      name: 'A',
      desc: 'd',
      startDate: '2026-07-01',
      dueDate: '2026-07-02',
      dueTime: '',
    };
    const trello = Object.assign({}, base);
    const outlook = Object.assign({}, base, { desc: 'new desc' });
    const m = OutlookSync.mergeCardEvent(trello, outlook, base);
    assert.equal(m.nextSynced.desc, 'new desc');
    assert.ok(m.toTrello);
    assert.equal(m.toTrello.desc, 'new desc');
    assert.equal(m.toOutlook, null);
  });

  it('mergeCardEvent prefers Trello when both sides changed', () => {
    const base = {
      name: 'A',
      desc: 'd',
      startDate: '2026-07-01',
      dueDate: '2026-07-02',
      dueTime: '',
    };
    const trello = Object.assign({}, base, { name: 'TrelloWin' });
    const outlook = Object.assign({}, base, { name: 'OutlookWin' });
    const m = OutlookSync.mergeCardEvent(trello, outlook, base);
    assert.equal(m.nextSynced.name, 'TrelloWin');
    assert.ok(m.toOutlook);
    assert.equal(m.toOutlook.name, 'TrelloWin');
    assert.equal(m.toTrello, null);
  });

  it('mergeCardEvent no-ops when nothing changed', () => {
    const snap = {
      name: 'A',
      desc: '',
      startDate: '2026-07-01',
      dueDate: '2026-07-01',
      dueTime: '',
    };
    const m = OutlookSync.mergeCardEvent(snap, snap, snap);
    assert.equal(m.toTrello, null);
    assert.equal(m.toOutlook, null);
    assert.equal(m.nextSynced.name, 'A');
  });

  it('resolveCardInterval uses Gantt bar start→due', () => {
    const iv = OutlookSync.resolveCardInterval({
      startDate: '2026-07-01',
      dueDate: '2026-07-10',
    });
    assert.equal(iv.startDate, '2026-07-01');
    assert.equal(iv.dueDate, '2026-07-10');
  });

  it('resolveCardInterval returns null when undated', () => {
    assert.equal(OutlookSync.resolveCardInterval({ name: 'x' }), null);
    assert.equal(OutlookSync.resolveCardInterval({}), null);
  });

  it('buildEventPayload all-day uses exclusive end', () => {
    const payload = OutlookSync.buildEventPayload({
      name: 'Task',
      desc: 'Details',
      startDate: '2026-07-01',
      dueDate: '2026-07-03',
      dueTime: '',
    });
    assert.equal(payload.isAllDay, true);
    assert.equal(payload.subject, 'Task');
    assert.equal(payload.body.content, 'Details');
    assert.match(payload.start.dateTime, /^2026-07-01T/);
    assert.match(payload.end.dateTime, /^2026-07-04T/);
  });

  it('buildEventPayload timed uses dueTime', () => {
    const payload = OutlookSync.buildEventPayload({
      name: 'Timed',
      desc: '',
      startDate: '2026-07-01',
      dueDate: '2026-07-01',
      dueTime: '15:30',
    });
    assert.equal(payload.isAllDay, false);
    assert.match(payload.end.dateTime, /T15:30:00$/);
  });

  it('snapshotFromEvent maps all-day exclusive end back to inclusive due', () => {
    const snap = OutlookSync.snapshotFromEvent({
      subject: 'Hello',
      bodyPreview: 'Body text',
      isAllDay: true,
      start: { date: '2026-07-01' },
      end: { date: '2026-07-04' },
    });
    assert.equal(snap.name, 'Hello');
    assert.equal(snap.desc, 'Body text');
    assert.equal(snap.startDate, '2026-07-01');
    assert.equal(snap.dueDate, '2026-07-03');
    assert.equal(snap.dueTime, '');
  });

  it('snapshotFromEvent maps timed end time', () => {
    const snap = OutlookSync.snapshotFromEvent({
      subject: 'Meet',
      body: { contentType: 'text', content: 'Notes' },
      isAllDay: false,
      start: { dateTime: '2026-07-01T09:00:00' },
      end: { dateTime: '2026-07-01T17:00:00' },
    });
    assert.equal(snap.startDate, '2026-07-01');
    assert.equal(snap.dueDate, '2026-07-01');
    assert.equal(snap.dueTime, '17:00');
    assert.equal(snap.desc, 'Notes');
  });

  it('snapshotFromCard includes name desc and interval', () => {
    const snap = OutlookSync.snapshotFromCard({
      name: 'Card',
      desc: 'Desc',
      startDate: '2026-07-05',
      dueDate: '2026-07-08',
      dueTime: '',
    });
    assert.equal(snap.name, 'Card');
    assert.equal(snap.desc, 'Desc');
    assert.equal(snap.startDate, '2026-07-05');
    assert.equal(snap.dueDate, '2026-07-08');
  });

  it('addDaysIso shifts calendar dates', () => {
    assert.equal(OutlookSync.addDaysIso('2026-07-01', 1), '2026-07-02');
    assert.equal(OutlookSync.addDaysIso('2026-07-01', -1), '2026-06-30');
  });
});
