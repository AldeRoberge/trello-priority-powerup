'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

function fakeStorage(opts) {
  const data = new Map();
  let failures = (opts && opts.failWrites) || 0;
  return {
    data,
    failNext(n) { failures = n; },
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      if (failures > 0) { failures--; throw new Error('QuotaExceededError'); }
      data.set(k, String(v));
    },
    removeItem: (k) => { data.delete(k); },
  };
}

const HOUR = 3600000;
const DAY = 24 * HOUR;
const msg = (role, content, extra) => Object.assign({ role, content }, extra || {});

describe('AgentChats', () => {
  let AgentChats;
  before(() => {
    loadComponent('agent/agent-chats.js');
    AgentChats = global.AgentChats;
    assert.equal(typeof AgentChats.createController, 'function');
  });

  function make(extra) {
    let now = Date.UTC(2026, 9, 21, 15, 0, 0);
    const storage = (extra && extra.storage) || fakeStorage();
    const c = AgentChats.createController({ storage, key: 'k', now: () => now });
    return { c, storage, tick: (ms) => { now += ms; }, at: () => now };
  }

  describe('titleFrom', () => {
    it('is the first thing the user said, on one line', () => {
      assert.equal(AgentChats.titleFrom([msg('user', '  Quelles   tâches\nen retard ? '), msg('assistant', 'Voici')]), 'Quelles tâches en retard ?');
    });

    it('cuts a long first message at a word and adds an ellipsis', () => {
      const t = AgentChats.titleFrom([msg('user', 'Peux-tu me préparer un plan détaillé pour la semaine prochaine avec les priorités')]);
      assert.ok(t.endsWith('…'));
      assert.ok(t.length <= AgentChats.MAX_TITLE + 1);
      assert.ok(!/\s…$/.test(t));
    });

    it('skips assistant turns and self-prompts, and is empty without a user message', () => {
      assert.equal(AgentChats.titleFrom([msg('assistant', 'Bonjour'), msg('user', 'auto', { selfPrompt: true }), msg('user', 'Salut')]), 'Salut');
      assert.equal(AgentChats.titleFrom([msg('assistant', 'Bonjour')]), '');
      assert.equal(AgentChats.titleFrom(null), '');
    });
  });

  describe('groupByDay', () => {
    it('buckets by local day, newest first, and drops empty buckets', () => {
      const now = new Date(2026, 9, 21, 15, 0, 0).getTime();
      const mk = (id, ago) => ({ id, title: id, updatedAt: now - ago, archived: false });
      const groups = AgentChats.groupByDay(
        [mk('old', 90 * DAY), mk('week', 4 * DAY), mk('today-a', 2 * HOUR), mk('yday', 20 * HOUR), mk('today-b', 1 * HOUR), mk('month', 20 * DAY)],
        now
      );
      assert.deepEqual(groups.map((g) => g.key), ['today', 'yesterday', 'week', 'month', 'older']);
      assert.deepEqual(groups[0].chats.map((c) => c.id), ['today-b', 'today-a']);
      assert.equal(groups[0].label, 'Aujourd’hui');
      assert.equal(groups[1].label, 'Hier');
      assert.deepEqual(AgentChats.groupByDay([mk('only', HOUR)], now).map((g) => g.key), ['today']);
      assert.deepEqual(AgentChats.groupByDay([], now), []);
    });
  });

  describe('controller', () => {
    it('starts on an empty draft that is not listed', () => {
      const { c } = make();
      assert.equal(c.current().messages.length, 0);
      const v = c.view();
      assert.equal(v.isDraft, true);
      assert.deepEqual(v.groups, []);
      assert.deepEqual(v.archived, []);
    });

    it('stores a conversation once it has a message, titled by the first user message', () => {
      const { c, storage } = make();
      const id = c.current().id;
      c.saveMessages([msg('user', 'Planifie ma semaine'), msg('assistant', 'Voici un plan.')]);
      const v = c.view();
      assert.equal(v.isDraft, false);
      assert.equal(v.currentId, id);
      assert.equal(v.groups[0].chats[0].title, 'Planifie ma semaine');
      assert.ok(storage.data.get('k'), 'written to the storage');
    });

    it('does not store a draft without messages', () => {
      const { c, storage } = make();
      c.saveMessages([]);
      c.saveMessages([msg('user', '   ')]);
      assert.equal(storage.data.has('k'), false);
      assert.deepEqual(c.view().groups, []);
    });

    it('a new conversation keeps the old one in the list and asking again does nothing', () => {
      const { c, tick } = make();
      const first = c.current().id;
      c.saveMessages([msg('user', 'Un'), msg('assistant', 'ok')]);
      tick(1000);
      const draft = c.startNew();
      assert.notEqual(draft.id, first);
      assert.equal(c.current().id, draft.id);
      assert.equal(c.startNew().id, draft.id, 'still the same empty draft');
      const v = c.view();
      assert.equal(v.isDraft, true);
      assert.deepEqual(v.groups[0].chats.map((x) => x.id), [first]);
    });

    it('opens an earlier conversation with its messages', () => {
      const { c, tick } = make();
      const first = c.current().id;
      c.saveMessages([msg('user', 'Un'), msg('assistant', 'ok')]);
      tick(1000);
      c.startNew();
      c.saveMessages([msg('user', 'Deux'), msg('assistant', 'ok')]);
      const opened = c.open(first);
      assert.equal(opened.messages[0].content, 'Un');
      assert.equal(c.current().id, first);
      assert.equal(c.open('nope'), null);
    });

    it('opening does not reorder the list, new messages do', () => {
      const { c, tick } = make();
      const a = c.current().id;
      c.saveMessages([msg('user', 'A'), msg('assistant', 'a')]);
      tick(1000);
      c.startNew();
      const b = c.current().id;
      c.saveMessages([msg('user', 'B'), msg('assistant', 'b')]);
      tick(1000);
      c.open(a);
      c.saveMessages([msg('user', 'A'), msg('assistant', 'a')]);
      assert.deepEqual(c.view().groups[0].chats.map((x) => x.id), [b, a], 'untouched');
      tick(1000);
      c.saveMessages([msg('user', 'A'), msg('assistant', 'a'), msg('user', 'encore')]);
      assert.deepEqual(c.view().groups[0].chats.map((x) => x.id), [a, b]);
    });

    it('archives a conversation out of the list, and a fresh one replaces it when it was on screen', () => {
      const { c, tick } = make();
      const a = c.current().id;
      c.saveMessages([msg('user', 'A'), msg('assistant', 'a')]);
      tick(1000);
      c.startNew();
      const b = c.current().id;
      c.saveMessages([msg('user', 'B'), msg('assistant', 'b')]);
      assert.deepEqual(c.archive(a), { ok: true, wasCurrent: false });
      assert.equal(c.current().id, b);
      assert.deepEqual(c.view().groups[0].chats.map((x) => x.id), [b]);
      assert.deepEqual(c.view().archived.map((x) => x.id), [a]);
      const res = c.archive(b);
      assert.deepEqual(res, { ok: true, wasCurrent: true });
      assert.notEqual(c.current().id, b);
      assert.equal(c.current().messages.length, 0);
      assert.equal(c.view().isDraft, true);
      assert.deepEqual(c.archive(b), { ok: false, wasCurrent: false }, 'already archived');
      assert.deepEqual(c.archive('nope'), { ok: false, wasCurrent: false });
    });

    it('restores an archived conversation, and opening one brings it back to the list', () => {
      const { c, tick } = make();
      const a = c.current().id;
      c.saveMessages([msg('user', 'A'), msg('assistant', 'a')]);
      tick(1000);
      c.startNew();
      const b = c.current().id;
      c.saveMessages([msg('user', 'B'), msg('assistant', 'b')]);
      c.archive(a);
      c.archive(b);
      assert.equal(c.restore(a), true);
      assert.equal(c.restore(a), false, 'not archived any more');
      assert.deepEqual(c.view().archived.map((x) => x.id), [b]);
      c.open(b);
      assert.deepEqual(c.view().archived, []);
      assert.equal(c.view().groups[0].chats.length, 2);
    });

    it('emptying the conversation on screen (editing the first message) removes it from the list', () => {
      const { c } = make();
      const id = c.current().id;
      c.saveMessages([msg('user', 'A'), msg('assistant', 'a')]);
      c.saveMessages([]);
      assert.deepEqual(c.view().groups, []);
      assert.equal(c.current().id, id);
      assert.equal(c.view().isDraft, true);
    });

    it('survives a reload: a new controller reads what was stored', () => {
      const { c, storage } = make();
      c.saveMessages([msg('user', 'A'), msg('assistant', 'a', { selfPrompt: true })]);
      const again = AgentChats.createController({ storage, key: 'k' });
      const chat = again.view().groups[0].chats[0];
      assert.equal(chat.title, 'A');
      assert.notEqual(again.current().id, chat.id, 'opens on a new conversation');
      assert.equal(again.open(chat.id).messages[1].selfPrompt, true);
    });

    it('ignores corrupt storage and keeps conversations per key', () => {
      const storage = fakeStorage();
      storage.data.set('k', '{not json');
      const bad = AgentChats.createController({ storage, key: 'k' });
      assert.deepEqual(bad.view().groups, []);
      const one = AgentChats.createController({ storage, key: 'board-1' });
      one.saveMessages([msg('user', 'A'), msg('assistant', 'a')]);
      const other = AgentChats.createController({ storage, key: 'board-2' });
      assert.deepEqual(other.view().groups, []);
      assert.equal(AgentChats.keyFor('abc'), 'trello-priority-powerup/assistant-chats/abc');
    });

    it('notifies listeners on every change, and a broken listener does not stop the others', () => {
      const { c } = make();
      let calls = 0;
      c.onChange(() => { throw new Error('boom'); });
      const off = c.onChange(() => { calls++; });
      c.saveMessages([msg('user', 'A'), msg('assistant', 'a')]);
      c.startNew();
      assert.equal(calls, 2);
      off();
      c.startNew();
      c.saveMessages([msg('user', 'B')]);
      assert.equal(calls, 2);
    });

    it('keeps at most MAX_CHATS, dropping archived ones first', () => {
      const { c, tick } = make();
      const ids = [];
      for (let i = 0; i < AgentChats.MAX_CHATS; i++) {
        ids.push(c.current().id);
        c.saveMessages([msg('user', 'chat ' + i), msg('assistant', 'ok')]);
        tick(1000);
        c.startNew();
      }
      c.archive(ids[AgentChats.MAX_CHATS - 1]);
      c.saveMessages([msg('user', 'one more'), msg('assistant', 'ok')]);
      const v = c.view();
      assert.equal(v.groups.reduce((n, g) => n + g.chats.length, 0) + v.archived.length, AgentChats.MAX_CHATS);
      assert.equal(v.archived.length, 0, 'the archived one went first');
    });

    it('drops the oldest conversations and retries when the browser refuses the write', () => {
      const storage = fakeStorage();
      const { c, tick } = make({ storage });
      for (let i = 0; i < 4; i++) {
        c.saveMessages([msg('user', 'chat ' + i), msg('assistant', 'ok')]);
        tick(1000);
        c.startNew();
      }
      storage.failNext(1);
      c.saveMessages([msg('user', 'chat 4'), msg('assistant', 'ok')]);
      assert.equal(c.persisted(), true, 'the retry with fewer conversations went through');
      const titles = c.view().groups.reduce((all, g) => all.concat(g.chats.map((x) => x.title)), []);
      assert.ok(titles.includes('chat 4'), 'the newest conversation is kept');
      assert.ok(!titles.includes('chat 0'), 'the oldest was dropped');
      assert.ok(JSON.parse(storage.data.get('k')).chats.length < 5);
      const refusing = fakeStorage({ failWrites: 99 });
      const { c: c2 } = make({ storage: refusing });
      c2.saveMessages([msg('user', 'B'), msg('assistant', 'b')]);
      assert.equal(c2.persisted(), false, 'storage never accepts: kept in memory only');
      assert.equal(c2.view().persisted, false);
      assert.equal(c2.view().groups[0].chats[0].title, 'B', 'still listed for this session');
    });
  });

  describe('importLegacy (the single chat the old Assistant kept in Trello)', () => {
    it('carries it over once as a conversation dated by its last save', () => {
      const { c } = make();
      assert.equal(c.legacyPending(), true);
      const made = c.importLegacy({ messages: [msg('user', 'Ancienne question'), msg('assistant', 'Ancienne réponse')], updatedAt: '2026-10-01T12:00:00.000Z' });
      assert.equal(made.title, 'Ancienne question');
      assert.equal(made.updatedAt, Date.parse('2026-10-01T12:00:00.000Z'));
      assert.equal(c.legacyPending(), false);
      assert.equal(c.importLegacy({ messages: [msg('user', 'again')] }), null, 'never twice');
      assert.equal(c.view().groups[0].chats.length, 1);
    });

    it('marks it done even when there was nothing to carry', () => {
      const { c } = make();
      assert.equal(c.importLegacy({ messages: [] }), null);
      assert.equal(c.legacyPending(), false);
      assert.deepEqual(c.view().groups, []);
    });

    it('is remembered across reloads', () => {
      const { c, storage } = make();
      c.importLegacy({ messages: [msg('user', 'Q'), msg('assistant', 'R')] });
      assert.equal(AgentChats.createController({ storage, key: 'k' }).legacyPending(), false);
    });
  });
});
