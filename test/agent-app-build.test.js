'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('PriorityAgent app build awareness', () => {
  let Agent;

  beforeEach(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    Agent = loadComponent('agent/agent.js').PriorityAgent;
  });

  it('systemPrompt gives the build timestamp when known', () => {
    const prompt = Agent.systemPrompt({
      today: '2026-10-06',
      nowTime: '12:00',
      appBuiltAt: '2026-10-06T14:00:00.000Z'
    });
    assert.match(prompt, /2026-10-06T14:00:00\.000Z/);
    assert.match(prompt, /JAMAIS que tu ne peux pas/);
  });

  it('systemPrompt gives the build age and recent changes from the changelog', () => {
    const builtAt = new Date(Date.now() - 3 * 86400000).toISOString();
    const prompt = Agent.systemPrompt({
      today: '2026-10-06',
      nowTime: '12:00',
      appBuiltAt: builtAt,
      appReleases: [
        { date: '2026-10-13', items: ['Nouveauté A', 'Nouveauté B'] },
        { date: '2026-10-06', items: ['Ancienne'] },
        { date: '2026-09-01', items: ['Trop vieille'] }
      ]
    });
    assert.match(prompt, /il y a 3 jours/);
    assert.match(prompt, /2026-10-13 :/);
    assert.match(prompt, /Nouveauté A/);
    assert.match(prompt, /Ancienne/);
    assert.doesNotMatch(prompt, /Trop vieille/);
  });

  it('systemPrompt age label uses singular and hour units', () => {
    const oneHourAgo = new Date(Date.now() - 90 * 60000).toISOString();
    assert.match(
      Agent.systemPrompt({ today: '2026-10-06', nowTime: '12:00', appBuiltAt: oneHourAgo }),
      /il y a 1 heure/
    );
  });

  it('systemPrompt admits missing build info instead of guessing', () => {
    const prompt = Agent.systemPrompt({ today: '2026-10-06', nowTime: '12:00' });
    assert.match(prompt, /pas pu .{1,3}tre charg/);
  });

  it('systemPrompt knows the computer clock and answers in that time', () => {
    const prompt = Agent.systemPrompt({
      today: '2026-10-13',
      nowTime: '20:04',
      timeZone: 'America/Toronto',
      utcOffset: 'UTC-4',
      appBuiltAt: '2026-10-14T00:04:00.000Z'
    });
    assert.match(prompt, /toujours : il est 2026-10-13 20:04 \(America\/Toronto, UTC-4\)/);
    assert.match(prompt, /Toute heure que tu dis/);
    assert.match(prompt, /INTERDIT de demander l'heure ou le fuseau/);
    const built = new Date('2026-10-14T00:04:00.000Z');
    const pad = (n) => String(n).padStart(2, '0');
    const local = built.getFullYear() + '-' + pad(built.getMonth() + 1) + '-' + pad(built.getDate()) +
      ' ' + pad(built.getHours()) + ':' + pad(built.getMinutes());
    assert.match(prompt, new RegExp('build exporté le ' + local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(prompt.indexOf('Horloge de son ordinateur, toujours') >= 0);
    assert.ok(prompt.lastIndexOf('Horloge de son ordinateur, toujours') > prompt.indexOf('Horloge de son ordinateur, toujours'));
    assert.ok(prompt.trim().endsWith('UTC seulement si on le demande explicitement.'));
  });

  it('localClock matches the computer offset', () => {
    const d = new Date('2026-10-14T00:04:00.000Z');
    const c = Agent.localClock(d);
    assert.equal(c.nowTime, Agent.nowTimeLocal(d));
    assert.equal(c.today.length, 10);
    const east = -d.getTimezoneOffset();
    const sign = east >= 0 ? '+' : '-';
    const abs = Math.abs(east);
    const offH = Math.floor(abs / 60);
    const offM = abs % 60;
    const expected = 'UTC' + sign + offH + (offM ? ':' + String(offM).padStart(2, '0') : '');
    assert.equal(c.utcOffset, expected);
    assert.ok(c.timeZone);
  });
});
