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
    assert.deepEqual(KM.parseFlags('pin,color=rouge,nope,arch'), { pin: true, arch: true, color: '' });
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
});
