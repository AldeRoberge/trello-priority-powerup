'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');
const { parse } = require('./helpers/mini-dom');

loadComponent('docs/docs-model.js');
loadComponent('docs/docs-entities.js');
const DM = global.DocsModel;
const DE = global.DocsEntities;

const sylviane = {
  id: 'sylviane',
  name: 'Sylviane Mailhot',
  aliases: [],
  roles: [],
  types: ['Personne'],
};

function phrases(text, catalog, caret, extra) {
  return DE.linksIn(text, catalog, caret, extra).map((s) => s.phrase + '→' + s.id);
}

describe('DocsEntities', () => {
  it('reads roles and type names into the catalog', () => {
    const cat = DE.catalogOf(
      { types: [{ id: 'person', name: 'Personne' }] },
      [{
        id: 'sylviane',
        name: 'Sylviane Mailhot',
        aliases: ['Sylvie'],
        types: ['person'],
        relations: [{ type: 'works-for', to: 'me', role: 'boss' }],
      }]
    );
    assert.equal(cat[0].id, 'sylviane');
    assert.deepEqual(cat[0].aliases, ['Sylvie']);
    assert.deepEqual(cat[0].roles, ['boss']);
    assert.deepEqual(cat[0].types, ['Personne']);
  });

  it('links the name and « mon boss » after the text says who that is', () => {
    const text = 'Sylviane Mailhot est mon boss. J’ai vu mon boss.';
    assert.deepEqual(phrases(text, [sylviane]), [
      'Sylviane Mailhot→sylviane',
      'mon boss→sylviane',
      'mon boss→sylviane',
    ]);
  });

  it('learns the same link from the other order and from English', () => {
    assert.deepEqual(phrases('mon boss est Sylviane Mailhot', [sylviane]), [
      'mon boss→sylviane',
      'Sylviane Mailhot→sylviane',
    ]);
    assert.deepEqual(phrases('Sylviane Mailhot is my boss', [sylviane]), [
      'Sylviane Mailhot→sylviane',
      'my boss→sylviane',
    ]);
    assert.deepEqual(phrases('Sylviane Mailhot, mon boss, arrive', [sylviane]), [
      'Sylviane Mailhot→sylviane',
      'mon boss→sylviane',
    ]);
  });

  it('links « mon boss » from a role when the sentence is not in the text', () => {
    const boss = { id: 'sylviane', name: 'Sylviane Mailhot', aliases: [], roles: ['boss'], types: [] };
    assert.deepEqual(phrases('parler à mon boss demain', [boss]), ['mon boss→sylviane']);
    assert.deepEqual(phrases('un boss quelconque', [boss]), []);
  });

  it('does not guess when two entities share the role', () => {
    const a = { id: 'a', name: 'Sylviane Mailhot', aliases: [], roles: ['boss'], types: [] };
    const b = { id: 'b', name: 'Julie Roy', aliases: [], roles: ['boss'], types: [] };
    assert.deepEqual(phrases('mon boss arrive', [a, b]), []);
    assert.deepEqual(phrases('Sylviane Mailhot', [a, b]), ['Sylviane Mailhot→a']);
  });

  it('matches without accents and skips a match the caret is still inside', () => {
    const eric = { id: 'eric', name: 'Éric', aliases: [], roles: [], types: [] };
    assert.deepEqual(phrases('voir eric demain', [eric]), ['eric→eric']);
    const boss = { id: 'sylviane', name: 'Sylviane Mailhot', aliases: [], roles: ['boss'], types: [] };
    const text = 'mon boss arrive';
    assert.deepEqual(DE.linksIn(text, [boss], 4), []);
    assert.equal(DE.linksIn(text, [boss], 8)[0].phrase, 'mon boss');
  });

  it('keeps only model phrases that name a known entity and occur as real words', () => {
    const raw = JSON.stringify({
      links: [
        { phrase: 'la patronne', id: 'sylviane' },
        { phrase: 'elle', id: 'sylviane' },
        { phrase: 'fantôme', id: 'nope' },
      ],
    });
    const extra = DE.parseAiLinks(raw, [sylviane]);
    assert.deepEqual(extra, [{ id: 'sylviane', phrase: 'la patronne' }]);
    const text = 'la patronne arrive, elle aussi';
    assert.deepEqual(phrases(text, [sylviane], null, extra), ['la patronne→sylviane']);
  });

  it('turns a selection into an entity name and finds one that already exists', () => {
    assert.equal(DE.nameFromSelection('  Buster \n le chat'), 'Buster');
    assert.equal(DE.nameFromSelection('   '), '');
    assert.equal(DE.nameFromSelection('x'.repeat(100)).length, 80);
    const cat = [{ id: 'b', name: 'Buster', aliases: ['Minou'], roles: [], types: [] }];
    assert.equal(DE.matchId(cat, 'buster'), 'b');
    assert.equal(DE.matchId(cat, 'Minou'), 'b');
    assert.equal(DE.matchId(cat, 'Rex'), '');
  });

  it('asks the model with the catalog and the document text', () => {
    const messages = DE.aiMessages([sylviane], 'mon boss appelle');
    assert.equal(messages[0].role, 'system');
    assert.match(messages[1].content, /Sylviane Mailhot #sylviane/);
    assert.match(messages[1].content, /mon boss appelle/);
    assert.equal(messages[0].content.includes('\u2014'), false);
  });
});

describe('entity mentions in the document', () => {
  const roundTrip = (md) => DM.domToMd(parse(DM.mdToHtml(md)));

  it('stores the typed words and renders them without a chip icon', () => {
    const md = 'voir [@mon boss](entity:sylviane) ici';
    const html = DM.inlineToHtml('[@mon boss](entity:sylviane)');
    assert.match(html, /class="dc-ent"/);
    assert.match(html, /data-id="sylviane"/);
    assert.equal(html.includes('ti-'), false);
    assert.equal(roundTrip(md), md);
    assert.equal(DM.mentionsToPlain(md), 'voir @mon boss ici');
  });

  it('offers entities in the @ search, including an alias', () => {
    const ix = DM.buildMentionIndex({
      entities: [{ id: 'sylviane', name: 'Sylviane Mailhot', aliases: ['boss'], relations: [] }],
    });
    const hit = DM.searchMentions(ix, 'all', 'boss');
    assert.equal(hit[0].type, 'entity');
    assert.equal(hit[0].items[0].label, 'Sylviane Mailhot');
    assert.equal(DM.resolveMention(ix, 'entity', 'sylviane').label, 'Sylviane Mailhot');
  });
});
