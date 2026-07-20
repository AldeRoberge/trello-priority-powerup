'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('OutlookIcs', () => {
  let OutlookIcs;

  before(() => {
    clearComponentCache();
    loadComponent('gantt/gantt-model.js');
    loadComponent('outlook/outlook-config.js');
    loadComponent('outlook/outlook-sync.js');
    loadComponent('outlook/outlook-ics.js');
    OutlookIcs = global.OutlookIcs;
    assert.ok(OutlookIcs);
  });

  it('escapeText escapes ICS special characters', () => {
    assert.equal(OutlookIcs.escapeText('a;b,c\\d'), 'a\\;b\\,c\\\\d');
    assert.equal(OutlookIcs.escapeText('line1\nline2'), 'line1\\nline2');
  });

  it('buildVEvent returns null for undated cards', () => {
    assert.equal(OutlookIcs.buildVEvent({ id: '1', name: 'x' }), null);
  });

  it('buildVEvent creates all-day event with exclusive DTEND', () => {
    const vevent = OutlookIcs.buildVEvent(
      {
        id: 'abc',
        name: 'Ship it',
        desc: 'Details here',
        startDate: '2026-07-01',
        dueDate: '2026-07-03',
      },
      '20260720T120000Z'
    );
    assert.match(vevent, /BEGIN:VEVENT/);
    assert.match(vevent, /UID:trello-card-abc@trello-cerveau/);
    assert.match(vevent, /DTSTART;VALUE=DATE:20260701/);
    assert.match(vevent, /DTEND;VALUE=DATE:20260704/);
    assert.match(vevent, /SUMMARY:Ship it/);
    assert.match(vevent, /DESCRIPTION:Details here/);
  });

  it('buildVEvent creates timed event when dueTime set', () => {
    const vevent = OutlookIcs.buildVEvent(
      {
        id: 't1',
        name: 'Call',
        startDate: '2026-07-01',
        dueDate: '2026-07-01',
        dueTime: '15:30',
      },
      '20260720T120000Z'
    );
    assert.match(vevent, /DTSTART:20260701T090000/);
    assert.match(vevent, /DTEND:20260701T153000/);
  });

  it('buildCalendar skips undated and counts events', () => {
    const built = OutlookIcs.buildCalendar(
      [
        { id: '1', name: 'A', startDate: '2026-07-01', dueDate: '2026-07-01' },
        { id: '2', name: 'No dates' },
        { id: '3', name: 'B', dueDate: '2026-07-05' },
      ],
      { calName: 'Test Cal' }
    );
    assert.equal(built.eventCount, 2);
    assert.match(built.ics, /BEGIN:VCALENDAR/);
    assert.match(built.ics, /X-WR-CALNAME:Test Cal/);
    assert.match(built.ics, /END:VCALENDAR/);
    assert.equal((built.ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  });
});
