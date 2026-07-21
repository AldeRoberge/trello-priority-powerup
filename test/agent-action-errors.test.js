'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('agent rich action errors', () => {
  var Agent;

  before(() => {
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    assert.ok(Agent);
    assert.equal(typeof Agent.formatChangeRecap, 'function');
    assert.equal(typeof Agent.formatActionErrors, 'function');
    assert.equal(typeof Agent.actionFailure, 'function');
    assert.equal(typeof Agent.executeAction, 'function');
  });

  it('actionFailure builds structured ok:false results', () => {
    var fail = Agent.actionFailure('set_members', 'Assignés indisponibles', {
      code: 'bridge-missing',
      cause: 'missing: bridge.addMember',
      hint: 'Ouvre le popup Power-Up.'
    });
    assert.equal(fail.ok, false);
    assert.equal(fail.tool, 'set_members');
    assert.equal(fail.error, 'Assignés indisponibles');
    assert.equal(fail.code, 'bridge-missing');
    assert.match(fail.cause, /addMember/);
    assert.match(fail.hint, /popup/i);
  });

  it('formatChangeRecap includes code, cause, and hint for failures', () => {
    var recap = Agent.formatChangeRecap({
      results: [
        { ok: true, tool: 'set_agent_color', detail: 'sky → teal' },
        {
          ok: false,
          tool: 'set_members',
          error: 'Assignés indisponibles',
          code: 'bridge-missing',
          cause: 'missing: bridge.addMember / bridge.removeMember',
          hint: 'Ce pont agent n\'expose pas addMember/removeMember.'
        }
      ]
    });
    assert.match(recap, /✓ set_agent_color: sky → teal/);
    assert.match(recap, /✗ set_members: Assignés indisponibles \[bridge-missing\]/);
    assert.match(recap, /cause: missing: bridge\.addMember/);
    assert.match(recap, /→ Ce pont agent/);
  });

  it('formatActionErrors builds a user-facing summary', () => {
    var text = Agent.formatActionErrors({
      results: [
        {
          ok: false,
          tool: 'set_members',
          error: 'Assignés indisponibles',
          hint: 'Ouvre la carte via le popup Power-Up.'
        }
      ]
    });
    assert.match(text, /Une action a échoué/);
    assert.match(text, /set_members/);
    assert.match(text, /Assignés indisponibles/);
    assert.match(text, /popup Power-Up/);
  });

  it('set_members without bridge helpers returns bridge-missing rich error', async () => {
    var result = await Agent.executeAction({}, {
      tool: 'set_members',
      args: { add: [{ id: 'm1' }] }
    });
    assert.equal(result.ok, false);
    assert.equal(result.tool, 'set_members');
    assert.equal(result.error, 'Assignés indisponibles');
    assert.equal(result.code, 'bridge-missing');
    assert.match(result.cause, /addMember/);
    assert.match(result.hint, /popup/i);

    var applied = await Agent.executeActions({}, [
      { tool: 'set_members', args: { add: [{ id: 'm1' }] } }
    ]);
    assert.equal(applied.ok, false);
    assert.match(applied.recap, /\[bridge-missing\]/);
    assert.match(applied.errorSummary, /Assignés indisponibles/);
  });

  it('set_members translates OAuth reason codes', async () => {
    var result = await Agent.executeAction(
      {
        loadBoardMembers: function () {
          return [{ id: 'm1', fullName: 'Alice' }];
        },
        addMember: function () {
          return { ok: false, reason: 'not-authorized' };
        },
        removeMember: function () {
          return { ok: true };
        }
      },
      { tool: 'set_members', args: { add: [{ id: 'm1' }] } }
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /OAuth|Autorisation/i);
    assert.equal(result.code, 'not-authorized');
    assert.match(result.hint, /Autorise/i);
  });

  it('set_members reports unmatched member specs', async () => {
    var result = await Agent.executeAction(
      {
        loadBoardMembers: function () {
          return [{ id: 'm1', fullName: 'Alice' }];
        },
        addMember: function () {
          return { ok: true };
        },
        removeMember: function () {
          return { ok: true };
        }
      },
      { tool: 'set_members', args: { add: [{ matchText: 'BobInexistant' }] } }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 'member-not-found');
    assert.match(result.cause, /BobInexistant/);
    assert.match(result.hint, /boardMembers|ownership/i);
  });

  it('upsert_person recap names the person and marks create vs update', async () => {
    loadComponent('people/people.js');
    var People = global.People;
    assert.ok(People);

    var directory = People.emptyDirectory();
    var bridge = {
      getPeople: function () {
        return directory;
      },
      upsertPerson: async function (patch) {
        directory = People.upsert(directory, patch);
        return {
          ok: true,
          person: directory.people[directory.people.length - 1],
          directory: directory
        };
      },
      getPriorityState: function () {
        return {};
      },
      getCompletion: function () {
        return { items: [] };
      }
    };

    var created = await Agent.executeAction(bridge, {
      tool: 'upsert_person',
      args: { name: 'Marie Curie', relation: 'ma boss', aliases: ['boss'] }
    });
    assert.equal(created.ok, true);
    assert.match(created.detail, /Marie Curie/);
    assert.match(created.detail, /cr[eé]ée/i);
    assert.match(created.detail, /relation:\s*ma boss/i);
    assert.match(created.summary, /ajout/i);
    assert.doesNotMatch(created.detail, /aucun diff/i);

    var updated = await Agent.executeAction(bridge, {
      tool: 'upsert_person',
      args: { name: 'Marie Curie', relation: 'N+1', addAlias: 'patronne' }
    });
    assert.equal(updated.ok, true);
    assert.match(updated.detail, /Marie Curie/);
    assert.match(updated.detail, /mise \u00e0 jour/i);
    assert.match(updated.detail, /relation/);
    assert.doesNotMatch(updated.detail, /aucun diff/i);

    var noop = await Agent.executeAction(bridge, {
      tool: 'upsert_person',
      args: { name: 'Marie Curie', relation: 'N+1' }
    });
    assert.equal(noop.ok, true);
    assert.match(noop.detail, /d[eé]j[aà] \u00e0 jour/i);
    assert.doesNotMatch(noop.detail, /aucun diff/i);

    var recap = Agent.formatChangeRecap({
      results: [created, updated, noop]
    });
    assert.match(recap, /✓ upsert_person: "Marie Curie"/);
    assert.doesNotMatch(recap, /aucun diff/i);
  });

  it('set_members and set_labels recap list the ops', async () => {
    var members = await Agent.executeAction(
      {
        loadBoardMembers: function () {
          return [{ id: 'm1', fullName: 'Alice' }];
        },
        addMember: function () {
          return { ok: true };
        },
        removeMember: function () {
          return { ok: true };
        }
      },
      { tool: 'set_members', args: { add: [{ id: 'm1' }] } }
    );
    assert.equal(members.ok, true);
    assert.match(members.detail, /\+Alice/);
    assert.doesNotMatch(members.detail, /aucun diff/i);

    var labels = await Agent.executeAction(
      {
        loadBoardLabels: function () {
          return [{ id: 'l1', name: 'Urgent', color: 'red' }];
        },
        loadCardLabels: function () {
          return [];
        },
        addLabel: function () {
          return { ok: true };
        },
        removeLabel: function () {
          return { ok: true };
        }
      },
      { tool: 'set_labels', args: { add: [{ id: 'l1' }] } }
    );
    assert.equal(labels.ok, true);
    assert.match(labels.detail, /\+Urgent/);
    assert.doesNotMatch(labels.detail, /aucun diff/i);
  });
});
