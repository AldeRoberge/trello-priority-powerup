'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

const MARIE = { id: 'm1', fullName: 'Marie Tremblay', username: 'marie', initials: 'MT', avatarUrl: 'https://trello-members.s3.amazonaws.com/m1/abc' };
const LUC = { id: 'm2', fullName: 'Luc Roy', username: 'luc' };

let DH;
let DM;

function desc(body, rev) {
  return DM.packDesc(body, rev || 1);
}
function created(id, date, who, name) {
  return { id, type: 'createCard', date, idMemberCreator: who.id, memberCreator: who, data: { card: { id: 'd1', name: name || '📄 Plan' } } };
}
function bodyEdit(id, date, who, before, after) {
  return { id, type: 'updateCard', date, idMemberCreator: who.id, memberCreator: who, data: { old: { desc: desc(before) }, card: { id: 'd1', desc: desc(after, 2) } } };
}
function rename(id, date, who, from, to) {
  return { id, type: 'updateCard', date, idMemberCreator: who.id, memberCreator: who, data: { old: { name: '📄 ' + from }, card: { id: 'd1', name: '📄 ' + to } } };
}

describe('DocsHistory', () => {
  before(() => {
    loadComponent('docs/docs-model.js');
    loadComponent('docs/docs-history.js');
    DH = global.DocsHistory;
    DM = global.DocsModel;
    assert.ok(DH && DM);
  });

  describe('toEvents', () => {
    it('turns card actions into events, oldest first, with the member', () => {
      const ev = DH.toEvents([
        bodyEdit('a2', '2026-10-13T10:01:00.000Z', MARIE, 'A', 'A\nB'),
        created('a1', '2026-10-13T10:00:00.000Z', MARIE),
      ]);
      assert.deepEqual(ev.map((e) => e.kind), ['create', 'body']);
      assert.equal(ev[0].title, 'Plan');
      assert.equal(ev[1].before, 'A');
      assert.equal(ev[1].after, 'A\nB');
      assert.equal(ev[1].member.name, 'Marie Tremblay');
      assert.equal(ev[1].member.initials, 'MT');
      assert.equal(ev[1].member.avatar, MARIE.avatarUrl + '/50.png');
    });

    it('skips saves that only touched the hidden meta block, duplicates and unknown actions', () => {
      const same = bodyEdit('a1', '2026-10-13T10:00:00.000Z', MARIE, 'X', 'X');
      same.data.card.desc = DM.packDesc('X', 7, { cover: { type: 'color', value: '#f00' } });
      const ev = DH.toEvents([
        same,
        bodyEdit('a2', '2026-10-13T10:01:00.000Z', MARIE, 'X', 'Y'),
        bodyEdit('a2', '2026-10-13T10:01:00.000Z', MARIE, 'X', 'Y'),
        { id: 'a3', type: 'commentCard', date: '2026-10-13T10:02:00.000Z', data: {} },
        rename('a4', '2026-10-13T10:03:00.000Z', LUC, 'Plan', 'Plan'),
      ]);
      assert.deepEqual(ev.map((e) => e.id), ['a2']);
    });

    it('falls back to a generic name and initials when Trello sends no member', () => {
      const a = bodyEdit('a1', '2026-10-13T10:00:00.000Z', MARIE, '', 'x');
      delete a.memberCreator;
      const ev = DH.toEvents([a]);
      assert.equal(ev[0].member.id, 'm1');
      assert.equal(ev[0].member.name, 'Quelqu’un');
      assert.equal(ev[0].member.avatar, '');
    });
  });

  describe('groupVersions', () => {
    it('merges one person’s autosaves and splits on another person or a long pause', () => {
      const v = DH.groupVersions(DH.toEvents([
        created('c', '2026-10-13T09:00:00.000Z', MARIE),
        bodyEdit('e1', '2026-10-13T09:00:05.000Z', MARIE, '', 'Un'),
        bodyEdit('e2', '2026-10-13T09:00:09.000Z', MARIE, 'Un', 'Un deux'),
        bodyEdit('e3', '2026-10-13T09:05:00.000Z', LUC, 'Un deux', 'Un deux trois'),
        bodyEdit('e4', '2026-10-13T11:00:00.000Z', LUC, 'Un deux trois', 'Fin'),
      ]));
      assert.equal(v.length, 3, 'newest first');
      assert.deepEqual(v.map((x) => x.id), ['e4', 'e3', 'e2']);
      assert.equal(v[2].created, true);
      assert.equal(v[2].createdTitle, 'Plan');
      assert.equal(v[2].count, 3);
      assert.equal(v[2].prevBody, '');
      assert.equal(v[2].body, 'Un deux');
      assert.equal(v[1].prevBody, 'Un deux');
      assert.equal(v[1].body, 'Un deux trois');
      assert.equal(v[0].body, 'Fin');
      assert.equal(v[0].member.name, 'Luc Roy');
    });

    it('carries the text through rename-only versions and keeps the net rename', () => {
      const v = DH.groupVersions(DH.toEvents([
        bodyEdit('e1', '2026-10-13T09:00:00.000Z', MARIE, 'Début', 'Texte'),
        rename('r1', '2026-10-13T10:00:00.000Z', LUC, 'Plan', 'Plan 2'),
        rename('r2', '2026-10-13T10:00:30.000Z', LUC, 'Plan 2', 'Plan final'),
      ]));
      assert.equal(v[0].titleFrom, 'Plan');
      assert.equal(v[0].titleTo, 'Plan final');
      assert.equal(v[0].body, 'Texte');
      assert.equal(v[0].prevBody, 'Texte');
      assert.equal(v[1].prevBody, 'Début', 'the window starts with the oldest loaded text');
      assert.match(DH.versionSummary(v[0]), /Renommé « Plan » en « Plan final »/);
    });

    it('drops a rename that came back to the same title', () => {
      const v = DH.groupVersions(DH.toEvents([
        rename('r1', '2026-10-13T10:00:00.000Z', LUC, 'A', 'B'),
        rename('r2', '2026-10-13T10:00:10.000Z', LUC, 'B', 'A'),
      ]));
      assert.equal(v.length, 1);
      assert.equal(v[0].titleFrom, undefined);
      assert.equal(v[0].body, null, 'no text change loaded: unknown');
    });
  });

  describe('diffs', () => {
    it('diffLines keeps shared lines and marks removed/added ones', () => {
      const d = DH.diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne');
      assert.deepEqual(d, [
        { op: '=', text: 'a' },
        { op: '-', text: 'b' },
        { op: '+', text: 'B' },
        { op: '=', text: 'c' },
        { op: '=', text: 'd' },
        { op: '+', text: 'e' },
      ]);
    });

    it('diffStats counts words, and is unknown without both texts', () => {
      assert.deepEqual(DH.diffStats('un deux', 'un deux\ntrois quatre'), { added: 2, removed: 0, known: true });
      assert.deepEqual(DH.diffStats('# Titre long', '# Titre'), { added: 1, removed: 2, known: true });
      assert.equal(DH.diffStats(null, 'x').known, false);
    });

    it('compactDiff keeps context around changes and folds the rest', () => {
      const a = ['1', '2', '3', '4', '5', '6', '7', '8'].join('\n');
      const b = ['1', '2', '3', '4', 'X', '6', '7', '8'].join('\n');
      const c = DH.compactDiff(DH.diffLines(a, b), 1);
      assert.deepEqual(c.map((x) => x.op), ['gap', '=', '-', '+', '=', 'gap']);
      assert.equal(c[0].count, 3);
      assert.equal(c[5].count, 2);
      assert.deepEqual(DH.compactDiff(DH.diffLines('a', 'a'), 2), []);
    });
  });

  it('dayLabel says today, yesterday, or a short date', () => {
    const now = new Date(2026, 9, 13, 15, 0).getTime();
    assert.equal(DH.dayLabel(new Date(2026, 9, 13, 8, 0).toISOString(), now), 'Aujourd’hui');
    assert.equal(DH.dayLabel(new Date(2026, 9, 12, 23, 0).toISOString(), now), 'Hier');
    assert.equal(DH.dayLabel(new Date(2026, 9, 2, 12, 0).toISOString(), now), '2 oct.');
    assert.equal(DH.dayLabel(new Date(2025, 0, 5, 12, 0).toISOString(), now), '5 janv. 2025');
  });

  it('whoFromActions gives the author and the newest editor', () => {
    const w = DH.whoFromActions([
      bodyEdit('e2', '2026-10-13T11:00:00.000Z', LUC, 'a', 'b'),
      bodyEdit('e1', '2026-10-13T10:00:00.000Z', MARIE, '', 'a'),
      created('c', '2026-10-13T09:00:00.000Z', MARIE),
    ]);
    assert.equal(w.author.member.name, 'Marie Tremblay');
    assert.equal(w.editor.member.name, 'Luc Roy');
    assert.equal(w.editor.date, '2026-10-13T11:00:00.000Z');
    const only = DH.whoFromActions([created('c', '2026-10-13T09:00:00.000Z', MARIE)]);
    assert.equal(only.editor.member.id, 'm1', 'never edited: the author is the last editor');
    assert.deepEqual(DH.whoFromActions([]), { author: null, editor: null });
  });

  describe('Trello reads', () => {
    function stub(handler) {
      const calls = [];
      global.SheetsTrello = {
        trelloRest: async (t, path) => {
          calls.push(path);
          return handler(path);
        },
      };
      return calls;
    }

    it('loadWho reads the creation and the latest edits of the card', async () => {
      const calls = stub((p) => ({
        ok: true,
        data: p.includes('createCard') ? [created('c', '2026-10-13T09:00:00.000Z', MARIE)] : [bodyEdit('e', '2026-10-13T10:00:00.000Z', LUC, '', 'x')],
      }));
      const w = await DH.loadWho({}, 'd1');
      assert.equal(w.author.member.id, 'm1');
      assert.equal(w.editor.member.id, 'm2');
      assert.equal(calls.length, 2);
      assert.ok(calls.every((p) => p.startsWith('/cards/d1/actions?filter=')));
      assert.ok(calls.some((p) => p.includes('memberCreator_fields=')));
    });

    it('loadPage pages with `before` and only asks for the creation on the first page', async () => {
      const full = Array.from({ length: 300 }, (_, i) => bodyEdit('u' + i, '2026-10-13T10:00:00.000Z', LUC, '', 'x' + i));
      const calls = stub((p) => ({ ok: true, data: p.includes('createCard') ? [created('c', '2026-10-13T09:00:00.000Z', MARIE)] : full }));
      const p1 = await DH.loadPage({}, 'd1');
      assert.equal(p1.actions.length, 301);
      assert.equal(p1.before, 'u299');
      assert.equal(p1.more, true);
      assert.equal(calls.length, 2);
      await DH.loadPage({}, 'd1', 'u299');
      assert.equal(calls.length, 3);
      assert.match(calls[2], /&before=u299$/);
    });

    it('rejects with the Trello reason when the read fails', async () => {
      stub(() => ({ ok: false, reason: 'unauthorized' }));
      await assert.rejects(DH.loadWho({}, 'd1'), (e) => e.reason === 'unauthorized');
    });

    it('loadMe resolves the signed-in member once', async () => {
      let n = 0;
      const t = { member: async () => { n++; return { id: 'm1', fullName: 'Marie Tremblay' }; } };
      assert.deepEqual(await DH.loadMe(t), { id: 'm1', name: 'Marie Tremblay' });
      await DH.loadMe(t);
      assert.equal(n, 1);
    });
  });
});
