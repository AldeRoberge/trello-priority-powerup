'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Notes model (Keep clone)', () => {
  let KM;
  let DM;

  before(() => {
    loadComponent('docs/docs-model.js');
    loadComponent('keep/keep-model.js');
    KM = global.KeepModel;
    DM = global.DocsModel;
  });

  it('only reorders done items in flat lists (nested lists keep their shape)', () => {
    assert.equal(KM.isFlatList('- [ ] a\n- [x] b'), true);
    assert.equal(KM.isFlatList('- [ ] a\n  - [x] b'), false);
    assert.equal(KM.isFlatList('1. a\n   1. b'), false);
  });

  it('keeps the indent of nested checklist items', () => {
    const body = ['- [ ] a', '  - [x] b', '    - [ ] c'].join('\n');
    const lines = KM.parseLines(body);
    assert.deepEqual(lines.map((l) => l.t), ['item', 'item', 'item']);
    assert.equal(lines[2].text, 'c');
    assert.equal(KM.serializeLines(lines), body);
  });

  it('parses checklist items and text lines and writes them back identically', () => {
    const body = 'eBay\n- [ ] Vendre consoles\n- [x] Vendre lentilles';
    const lines = KM.parseLines(body);
    assert.deepEqual(lines.map((l) => l.t), ['text', 'item', 'item']);
    assert.equal(lines[2].checked, true);
    assert.equal(KM.serializeLines(lines), body);
    assert.equal(KM.isList(body), true);
    assert.equal(KM.isList('juste du texte'), false);
  });

  it('switches between text and list, and sinks done items', () => {
    assert.equal(KM.toList('a\n\nb'), '- [ ] a\n- [ ] b');
    assert.equal(KM.toText('- [x] a\n- [ ] b'), 'a\nb');
    assert.equal(KM.sinkDone('- [x] a\n- [ ] b\n- [ ] c'), '- [ ] b\n- [ ] c\n- [x] a');
    assert.equal(KM.toggleItem('- [ ] a\n- [ ] b', 1), '- [ ] a\n- [x] b');
  });

  it('round-trips pin, archive and colour through the hidden document meta', () => {
    const note = { id: 'n1', title: 'Courses', body: '- [ ] lait', pin: true, arch: false, color: 'green', rev: 3, props: { tags: ['maison'], people: [] } };
    const desc = DM.packDesc(note.body, { rev: 3, props: KM.propsFor(note) });
    assert.match(desc, /keep: pin,color=green/);
    assert.match(desc, /tags: maison/);
    const back = KM.fromDoc({ id: 'n1', title: 'Courses', body: DM.unpackDesc(desc).body, rev: 3, props: DM.unpackDesc(desc).props });
    assert.equal(back.pin, true);
    assert.equal(back.color, 'green');
    assert.equal(back.arch, false);
    assert.deepEqual(back.props.tags, ['maison']);
    // a document the Documents view saved without notes flags is a plain note
    assert.equal(KM.fromDoc({ id: 'x', title: 'Doc', body: 'x', props: null }).pin, false);
    assert.equal(DM.unpackDesc(DM.packDesc('x', { rev: 1 })).props, null);
  });

  it('ignores unknown flags and treats the untitled placeholder as empty', () => {
    assert.deepEqual(KM.parseFlags('pin,color=rouge,nope,arch'), { pin: true, arch: true, color: '', pct: 0, ord: null });
    assert.equal(KM.fromDoc({ id: 'x', title: 'Sans titre', body: '' }).title, '');
  });

  it('sorts pinned notes first then newest, and searches without accents', () => {
    const sorted = KM.sortNotes([
      { id: 'a', pin: false, updatedAt: '2026-01-02' },
      { id: 'b', pin: true, updatedAt: '2026-01-01' },
      { id: 'c', pin: false, updatedAt: '2026-01-03' },
    ]);
    assert.deepEqual(sorted.map((n) => n.id), ['b', 'c', 'a']);
    assert.equal(KM.matches({ title: 'Caméras rétro', body: '- [ ] Sony' }, 'camera'), true);
    assert.equal(KM.matches({ title: 'x', body: '- [ ] Sony' }, 'sony'), true);
    assert.equal(KM.matches({ title: 'x', body: '' }, 'zzz'), false);
  });

  it('decides push / pull / copy / same from the last agreed state', () => {
    const base = { title: 'A', body: 'x', pin: false, arch: false, color: '' };
    const same = Object.assign({}, base);
    assert.equal(KM.resolve(base, same, same), 'same');
    assert.equal(KM.resolve(base, { ...base, body: 'y' }, base), 'push');
    assert.equal(KM.resolve(base, base, { ...base, body: 'z' }), 'pull');
    assert.equal(KM.resolve(base, { ...base, body: 'y' }, { ...base, body: 'z' }), 'copy');
    assert.equal(KM.resolve(null, { ...base, body: 'y' }, { ...base, body: 'z' }), 'copy');
  });

  it('round-trips the progress and order flags through the keep: meta line', () => {
    const n = { pin: true, arch: false, color: 'blue', pct: 40, ord: 1536.5 };
    const str = KM.flagString(n);
    assert.equal(str, 'pin,color=blue,pct=40,ord=1536.5');
    assert.deepEqual(KM.parseFlags(str), { pin: true, arch: false, color: 'blue', pct: 40, ord: 1536.5 });
    assert.equal(KM.flagString({ pct: 0, ord: null }), '');
    assert.equal(KM.parseFlags('pct=250,ord=abc').pct, 100);
    assert.equal(KM.parseFlags('pct=250,ord=abc').ord, null);
    // the Documents packer must keep the new tokens, not strip them
    assert.equal(DM.normalizeProps({ keep: 'pin,pct=40,ord=-2048,bogus' }).keep, 'pin,pct=40,ord=-2048');
    const note = KM.fromDoc({ id: '1', title: 't', body: 'b', props: { keep: 'pct=100,ord=2048' } });
    assert.equal(note.pct, 100);
    assert.equal(note.ord, 2048);
    assert.equal(KM.isDone(note), true);
    assert.equal(KM.isDone(KM.blank('x')), false);
    // a change of progress or order counts as a change (it is synced)
    assert.notEqual(KM.snapshot({ ...note, pct: 50 }), KM.snapshot(note));
    assert.notEqual(KM.snapshot({ ...note, ord: 1 }), KM.snapshot(note));
  });

  it('sorts pinned first, then new notes (no ord) newest first, then by ord', () => {
    const sorted = KM.sortNotes([
      { id: 'o2', pin: false, ord: 2048, updatedAt: '2026-01-09' },
      { id: 'o1', pin: false, ord: 1024, updatedAt: '2026-01-01' },
      { id: 'new', pin: false, ord: null, updatedAt: '2026-01-05' },
      { id: 'p2', pin: true, ord: 2048, updatedAt: '2026-01-01' },
      { id: 'p1', pin: true, ord: 1024, updatedAt: '2026-01-01' },
    ]);
    assert.deepEqual(sorted.map((n) => n.id), ['p1', 'p2', 'new', 'o1', 'o2']);
  });

  it('plans a reorder: one ord when neighbours have one, a renumber otherwise, nothing when it does not move', () => {
    const g = (...ords) => ords.map((o, i) => ({ id: 'n' + i, ord: o }));
    assert.deepEqual(KM.reorderPlan(g(1024, 2048, 3072), 'n2', 1), [{ id: 'n2', ord: 1536 }]);
    assert.deepEqual(KM.reorderPlan(g(1024, 2048, 3072), 'n2', 0), [{ id: 'n2', ord: 0 }]);
    assert.deepEqual(KM.reorderPlan(g(1024, 2048, 3072), 'n0', 2), [{ id: 'n0', ord: 4096 }]);
    assert.deepEqual(KM.reorderPlan(g(1024, 2048, 3072), 'n1', 1), []);
    assert.deepEqual(KM.reorderPlan(g(null, null, null), 'n2', 0), [
      { id: 'n2', ord: 1024 }, { id: 'n0', ord: 2048 }, { id: 'n1', ord: 3072 },
    ]);
    const tight = [{ id: 'a', ord: 1 }, { id: 'b', ord: 1.001 }, { id: 'c', ord: 5000 }];
    const plan = KM.reorderPlan(tight, 'c', 1);
    assert.deepEqual(plan.map((c) => c.id).sort(), ['a', 'b', 'c']);
    assert.deepEqual(plan.map((c) => c.ord).sort((x, y) => x - y), [1024, 2048, 3072]);
    assert.deepEqual(KM.reorderPlan(g(1024), 'zzz', 0), []);
  });
});
