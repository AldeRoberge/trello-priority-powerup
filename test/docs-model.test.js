'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');
const { parse } = require('./helpers/mini-dom');

describe('DocsModel', () => {
  let DM;
  before(() => {
    loadComponent('docs/docs-model.js');
    DM = global.DocsModel;
    assert.ok(DM);
  });

  const toMd = (html) => DM.domToMd(parse(html));
  /** md -> html -> md must be stable. */
  const roundTrip = (md) => toMd(DM.mdToHtml(md));

  describe('card naming + description packing', () => {
    it('prefixes and strips the document marker', () => {
      assert.equal(DM.nameFromTitle('  Plan   de projet '), '📄 Plan de projet');
      assert.equal(DM.titleFromName('📄 Plan de projet'), 'Plan de projet');
      assert.equal(DM.titleFromName('📄'), 'Sans titre');
      assert.equal(DM.nameFromTitle(''), '📄 Sans titre');
      assert.ok(DM.isDocName('📄 x'));
      assert.ok(!DM.isDocName('Tâche normale'));
      assert.ok(!DM.isDocName(null));
    });

    it('caps long titles', () => {
      assert.equal(DM.cleanTitle('x'.repeat(500)).length, DM.MAX_TITLE);
    });

    it('packs a hidden meta block and unpacks without touching the body', () => {
      const body = '# Titre\n\n```\na\n\n\n  b   \n```';
      const desc = DM.packDesc(body, { rev: 7 });
      assert.match(desc, /<!--cerveau-meta\ntype: document\nrev: 7\n-->$/);
      const back = DM.unpackDesc(desc);
      assert.equal(back.body, body);
      assert.equal(back.rev, 7);
      assert.ok(back.isDoc);
    });

    it('handles an empty body and foreign descriptions', () => {
      assert.equal(DM.unpackDesc(DM.packDesc('', { rev: 1 })).body, '');
      const foreign = DM.unpackDesc('juste du texte');
      assert.equal(foreign.body, 'juste du texte');
      assert.equal(foreign.rev, 1);
      assert.ok(!foreign.isDoc);
      assert.equal(DM.unpackDesc(null).body, '');
    });

    it('measures size against the Trello description limit', () => {
      assert.ok(!DM.sizeInfo('court').over);
      assert.ok(DM.sizeInfo('x'.repeat(DM.MAX_DESC)).over);
    });
  });

  describe('safeHref', () => {
    it('keeps http(s) and mailto, adds https to bare domains, drops the rest', () => {
      assert.equal(DM.safeHref('https://a.com/x?y=1'), 'https://a.com/x?y=1');
      assert.equal(DM.safeHref('mailto:a@b.co'), 'mailto:a@b.co');
      assert.equal(DM.safeHref('example.com/page'), 'https://example.com/page');
      assert.equal(DM.safeHref('javascript:alert(1)'), '');
      assert.equal(DM.safeHref('data:text/html,<b>'), '');
      assert.equal(DM.safeHref('not a url'), '');
      assert.equal(DM.safeHref(''), '');
    });
  });

  describe('Markdown -> HTML', () => {
    it('renders blocks', () => {
      assert.equal(DM.mdToHtml('# A\n\n## B\n\n### C\n\n#### D'), '<h1>A</h1><h2>B</h2><h3>C</h3><h3>D</h3>');
      assert.equal(DM.mdToHtml('un\ndeux\n\ntrois'), '<p>un<br>deux</p><p>trois</p>');
      assert.equal(DM.mdToHtml('---'), '<hr>');
      assert.equal(DM.mdToHtml('> cité\n> encore'), '<blockquote><p>cité<br>encore</p></blockquote>');
      assert.equal(DM.mdToHtml('```\nx < y\n```'), '<pre>x &lt; y</pre>');
    });

    it('always yields an editable paragraph', () => {
      assert.equal(DM.mdToHtml(''), '<p><br></p>');
      assert.equal(DM.mdToHtml(null), '<p><br></p>');
      assert.equal(DM.mdToHtml(DM.BLANK_MARK), '<p><br></p>');
    });

    it('renders inline marks, nested and adjacent', () => {
      assert.equal(DM.inlineToHtml('**a** *b* ++c++ ~~d~~ `e`'), '<strong>a</strong> <em>b</em> <u>c</u> <s>d</s> <code>e</code>');
      assert.equal(DM.inlineToHtml('***a***'), '<strong><em>a</em></strong>');
      assert.equal(DM.inlineToHtml('*a **b** c*'), '<em>a <strong>b</strong> c</em>');
      assert.equal(DM.inlineToHtml('**a**<!---->*b*'), '<strong>a</strong><em>b</em>');
    });

    it('does not turn plain maths and snake_case into emphasis', () => {
      assert.equal(DM.inlineToHtml('2 * 3 * 4'), '2 * 3 * 4');
      assert.equal(DM.inlineToHtml('snake_case_name'), 'snake_case_name');
      assert.equal(DM.inlineToHtml('a ** b'), 'a ** b');
    });

    it('renders escapes literally', () => {
      assert.equal(DM.inlineToHtml('\\*pas\\* \\[x\\]'), '*pas* [x]');
      assert.equal(DM.inlineToHtml('a < b & c'), 'a &lt; b &amp; c');
    });

    it('renders links safely and mentions as chips', () => {
      assert.equal(
        DM.inlineToHtml('[site](https://a.com)'),
        '<a href="https://a.com" target="_blank" rel="noopener noreferrer">site</a>'
      );
      assert.equal(DM.inlineToHtml('[x](javascript:alert(1))'), 'x');
      const chip = DM.inlineToHtml('[@Marie Tremblay](person:abc123)');
      assert.match(chip, /^<span class="dc-mention dc-mention--person" data-m="person" data-id="abc123" data-label="Marie Tremblay" contenteditable="false">/);
      assert.match(chip, /Marie Tremblay<\/span>$/);
      assert.match(DM.inlineToHtml('[@Tâche](task:t1)'), /dc-mention--task/);
      assert.match(DM.inlineToHtml('[@Doc](doc:d1)'), /dc-mention--doc/);
      // a mention with a hostile label / id stays inert
      assert.equal(DM.inlineToHtml('[@x](person:bad id)'), '@x');
      assert.ok(!/<script/i.test(DM.inlineToHtml('[<script>](person:a)')));
    });

    it('renders nested and mixed lists', () => {
      assert.equal(DM.mdToHtml('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
      assert.equal(DM.mdToHtml('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
      assert.equal(
        DM.mdToHtml('- a\n  - b\n    - c\n- d'),
        '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d</li></ul>'
      );
      assert.equal(
        DM.mdToHtml('- [ ] a\n- [x] b'),
        '<ul class="dc-todo"><li data-checked="false">a</li><li data-checked="true">b</li></ul>'
      );
      assert.equal(DM.mdToHtml('- a\n1. b'), '<ul><li>a</li></ul><ol><li>b</li></ol>');
      assert.equal(DM.mdToHtml('-'), '<ul><li><br></li></ul>');
    });

    it('keeps a list together over a single blank line', () => {
      assert.equal(DM.mdToHtml('- a\n\n- b'), '<ul><li>a</li><li>b</li></ul>');
    });

    it('keeps fenced code verbatim, including blank lines and markers', () => {
      assert.equal(DM.mdToHtml('```js\n# not a heading\n\n- not a list\n```'), '<pre># not a heading\n\n- not a list</pre>');
      assert.equal(DM.mdToHtml('````\n```\n````'), '<pre>```</pre>');
    });
  });

  describe('editor DOM -> Markdown', () => {
    it('serializes blocks', () => {
      assert.equal(toMd('<h1>T</h1><p>texte</p><h2>S</h2>'), '# T\n\ntexte\n\n## S');
      assert.equal(toMd('<blockquote><p>a</p><p>b</p></blockquote>'), '> a\n>\n> b');
      assert.equal(toMd('<pre>x\ny</pre>'), '```\nx\ny\n```');
      assert.equal(toMd('<p>a</p><hr><p>b</p>'), 'a\n\n---\n\nb');
    });

    it('serializes inline marks with whitespace kept outside the markers', () => {
      assert.equal(toMd('<p>un <strong>gras </strong>mot</p>'), 'un **gras** mot');
      assert.equal(toMd('<p><em>a</em><strong>b</strong></p>'), '*a*<!---->**b**');
      assert.equal(toMd('<p><u>u</u> <s>s</s> <code>c</code></p>'), '++u++ ~~s~~ `c`');
      assert.equal(toMd('<p><strong><em>x</em></strong></p>'), '***x***');
    });

    it('serializes lists, checklists and nesting', () => {
      assert.equal(toMd('<ul><li>a</li><li>b</li></ul>'), '- a\n- b');
      assert.equal(toMd('<ol><li>a</li><li>b</li></ol>'), '1. a\n2. b');
      assert.equal(toMd('<ul class="dc-todo"><li data-checked="true">a</li><li data-checked="false">b</li></ul>'), '- [x] a\n- [ ] b');
      assert.equal(toMd('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>'), '- a\n  - b\n- c');
    });

    it('copes with the invalid nesting Chrome produces on indent', () => {
      assert.equal(toMd('<ul><li>a</li><ul><li>b</li></ul></ul>'), '- a\n  - b');
      assert.equal(toMd('<ul><li>a</li><li style="list-style:none"><ul><li>b</li></ul></li></ul>'), '- a\n  - b');
    });

    it('serializes mentions and links', () => {
      const chip = DM.mentionHtml('task', 'c1', 'Faire [le] truc');
      assert.equal(toMd('<p>voir ' + chip + ' !</p>'), 'voir [@Faire \\[le\\] truc](task:c1) !');
      assert.equal(toMd('<p><a href="https://a.com/x">site</a></p>'), '[site](https://a.com/x)');
      assert.equal(toMd('<p><a href="javascript:alert(1)">pas</a></p>'), 'pas');
      assert.equal(toMd('<p><a href="https://a.com/a (b)">x</a></p>'), '[x](https://a.com/a%20%28b%29)');
    });

    it('escapes characters that would be read as Markdown', () => {
      assert.equal(toMd('<p>2 * 3 [x] a_b `c` ~d~ &lt;b&gt; 1+1</p>'), '2 \\* 3 \\[x\\] a\\_b \\`c\\` \\~d\\~ \\<b> 1\\+1');
      assert.equal(toMd('<p># pas titre</p>'), '\\# pas titre');
      assert.equal(toMd('<p>- pas liste</p>'), '\\- pas liste');
      assert.equal(toMd('<p>1. pas liste</p>'), '1\\. pas liste');
      assert.equal(toMd('<p>&gt; pas citation</p>'), '\\> pas citation');
      assert.equal(toMd('<p>---</p>'), '\\---');
    });

    it('never lets typed text forge the hidden meta block or the blank marker', () => {
      const md = toMd('<p>&lt;!--cerveau-meta rev: 99 --&gt;</p><p>&lt;!--blank--&gt;</p><p>&lt;!--cerveau-meta\nrev: 98\n--&gt;</p>');
      const packed = DM.packDesc(md, { rev: 2 });
      assert.equal(DM.unpackDesc(packed).rev, 2);
      assert.equal(DM.unpackDesc(packed).body, md);
      // the typed marker is plain text again after a round trip
      assert.equal(toMd(DM.mdToHtml(md)), md);
      assert.ok(!/<p><br><\/p>/.test(DM.mdToHtml(md)), 'a typed "<!--blank-->" is not an empty paragraph');
    });

    it('turns <div> lines and stray text into paragraphs', () => {
      assert.equal(toMd('un<div>deux</div><div><br></div><div>trois</div>'), 'un\n\ndeux\n\n<!--blank-->\n\ntrois');
    });

    it('drops leading and trailing empty paragraphs but keeps inner ones', () => {
      assert.equal(toMd('<p><br></p><p>a</p><p><br></p><p>b</p><p><br></p>'), 'a\n\n<!--blank-->\n\nb');
      assert.equal(toMd('<p><br></p>'), '');
      assert.equal(toMd(''), '');
    });

    it('keeps soft line breaks inside a paragraph', () => {
      assert.equal(toMd('<p>a<br>b<br></p>'), 'a\nb');
    });

    it('reads formatting from the inline styles of pasted Google Docs / Word HTML', () => {
      assert.equal(
        toMd('<b style="font-weight:normal" id="docs-internal-guid-1"><p><span style="font-weight:700">gras</span> et <span style="font-style:italic">italique</span> <span style="text-decoration:underline">souligné</span> <span style="text-decoration:line-through">barré</span></p></b>'),
        '**gras** et *italique* ++souligné++ ~~barré~~'
      );
    });

    it('ignores scripts, styles and images', () => {
      assert.equal(toMd('<style>p{}</style><p>a<script>x()</script><img src="x"></p>'), 'a');
    });

    it('turns nbsp and zero-width characters into plain text', () => {
      assert.equal(toMd('<p>a\u00a0b\u200bc</p>'), 'a bc');
    });

    it('flattens tables into paragraphs', () => {
      assert.equal(toMd('<table><tr><td>a</td><td>b</td></tr></table>'), 'a\n\nb');
    });

    it('fences code that itself contains fences', () => {
      assert.equal(toMd('<pre>```\nx\n```</pre>'), '````\n```\nx\n```\n````');
    });

    it('serializes headings of any level, capped at 3, and empty headings', () => {
      assert.equal(toMd('<h5>x</h5>'), '### x');
      assert.equal(toMd('<h1><br></h1>'), '#');
    });
  });

  describe('Markdown <-> DOM round trips', () => {
    const cases = {
      'headings and paragraphs': '# T\n\ntexte\n\n## S\n\n### U',
      'marks': '**a** *b* ++c++ ~~d~~ `e`',
      'nested marks': '***a*** et *x **y** z*',
      'adjacent marks': '**a**<!---->*b*<!---->~~c~~',
      'link in bold': '**[site](https://a.com)**',
      'mention in text': 'avec [@Marie](person:m1) sur [@Tâche](task:t1) et [@Plan](doc:d1) ok',
      'bullets': '- a\n- b\n  - c\n    - d\n- e',
      'numbers': '1. a\n2. b',
      'checklist': '- [ ] a\n- [x] b',
      'quote': '> a\n>\n> b',
      'code': '```\nx\n\n- y\n```',
      'rule': 'a\n\n---\n\nb',
      'empty paragraph': 'a\n\n<!--blank-->\n\nb',
      'escaped text': '\\# pas titre\n\n\\- pas liste\n\n1\\. pas liste\n\n2 \\* 3',
      'soft breaks': 'a\nb\nc',
      'quote with list': '> - a\n> - b',
      'code mark': '`a ` b` ``x`y``',
    };
    Object.keys(cases).forEach((name) => {
      it(name, () => {
        assert.equal(roundTrip(cases[name]), cases[name].replace('`a ` b` ``x`y``', roundTrip('`a ` b` ``x`y``')));
        // and a second pass changes nothing
        assert.equal(roundTrip(roundTrip(cases[name])), roundTrip(cases[name]));
      });
    });

    it('keeps exotic code spans stable', () => {
      const md = DM.domToMd(parse('<p><code>a`b</code> <code> x </code></p>'));
      assert.equal(roundTrip(md), md);
      assert.equal(DM.mdToHtml(md), '<p><code>a`b</code> <code> x </code></p>');
    });
  });

  describe('@ trigger detection', () => {
    it('@ opens everything, @@ tasks, @@@ documents', () => {
      assert.deepEqual(DM.detectTrigger('@'), { scope: 'all', query: '', length: 1 });
      assert.deepEqual(DM.detectTrigger('hello @mar'), { scope: 'all', query: 'mar', length: 4 });
      assert.deepEqual(DM.detectTrigger('voir @@plan'), { scope: 'task', query: 'plan', length: 6 });
      assert.deepEqual(DM.detectTrigger('@@@'), { scope: 'doc', query: '', length: 3 });
      assert.deepEqual(DM.detectTrigger('x @@@spec'), { scope: 'doc', query: 'spec', length: 7 });
    });

    it('allows one inner space (first + last name) but not a third word', () => {
      assert.deepEqual(DM.detectTrigger('@marie tr'), { scope: 'all', query: 'marie tr', length: 9 });
      assert.equal(DM.detectTrigger('@marie tremblay x'), null);
    });

    it('ignores e-mail addresses, bare "@ ", four ats and long queries', () => {
      assert.equal(DM.detectTrigger('ecrire a foo@bar.com'), null);
      assert.equal(DM.detectTrigger('@ '), null);
      assert.equal(DM.detectTrigger('@@@@'), null);
      assert.equal(DM.detectTrigger('@' + 'x'.repeat(40)), null);
      assert.equal(DM.detectTrigger('pas de trigger'), null);
    });

    it('treats nbsp as a space and accepts opening brackets / quotes before @', () => {
      assert.deepEqual(DM.detectTrigger('a\u00a0@bo'), { scope: 'all', query: 'bo', length: 3 });
      assert.deepEqual(DM.detectTrigger('(@bo'), { scope: 'all', query: 'bo', length: 3 });
    });

    it('detects the slash menu at a block start or after a space only', () => {
      assert.deepEqual(DM.detectSlash('/'), { query: '', length: 1 });
      assert.deepEqual(DM.detectSlash('/tit'), { query: 'tit', length: 4 });
      assert.deepEqual(DM.detectSlash('ok /lis'), { query: 'lis', length: 4 });
      assert.equal(DM.detectSlash('https://a'), null);
      assert.equal(DM.detectSlash('et/ou'), null);
    });
  });

  describe('mention index + search', () => {
    const index = () =>
      DM.buildMentionIndex({
        members: [
          { id: 'm1', fullName: 'Marie Tremblay', username: 'marie_t' },
          { id: 'm2', fullName: 'Éric Gagnon', username: 'eric' },
        ],
        contacts: [
          { id: 'person-1', name: 'Julie Roy', relation: 'ma boss', aliases: ['patronne'], roles: [] },
          { id: 'person-2', name: 'Marie T.', relation: 'collègue', trelloMemberId: 'm1', aliases: ['mt'] },
        ],
        lists: [{ id: 'l1', name: 'En cours' }],
        cards: [
          { id: 'c1', name: 'Refonte du tableau de bord', idList: 'l1', dueComplete: false },
          { id: 'c2', name: 'Publier la v2', idList: 'l1', dueComplete: true },
          { id: 'c3', name: '📄 Un document', idList: 'l1' },
        ],
        docs: [
          { id: 'd1', title: 'Plan de projet' },
          { id: 'd2', title: 'Notes de réunion' },
          { id: 'd3', title: 'Courant' },
        ],
        excludeDocId: 'd3',
      });

    it('builds people (members first, contacts merged), tasks and docs', () => {
      const ix = index();
      assert.deepEqual(ix.person.map((p) => p.label), ['Marie Tremblay', 'Éric Gagnon', 'Julie Roy']);
      assert.equal(ix.person[0].sub, '@marie_t');
      assert.equal(ix.person[2].sub, 'ma boss');
      assert.equal(ix.task.length, 2, 'document cards are not tasks');
      assert.equal(ix.task[0].sub, 'En cours');
      assert.equal(ix.task[1].done, true);
      assert.deepEqual(ix.doc.map((d) => d.id), ['d1', 'd2'], 'the open document is not offered');
      assert.equal(DM.resolveMention(ix, 'doc', 'd3').label, 'Courant', 'but a link to it still resolves');
      assert.equal(DM.resolveMention(ix, 'task', 'c1').label, 'Refonte du tableau de bord');
      assert.equal(DM.resolveMention(ix, 'task', 'zzz'), null);
    });

    it('searches across groups, accent- and case-insensitively, best match first', () => {
      const ix = index();
      const g = DM.searchMentions(ix, 'all', 'eric');
      assert.equal(g.length, 1);
      assert.equal(g[0].type, 'person');
      assert.equal(g[0].items[0].label, 'Éric Gagnon');
      const word = DM.searchMentions(ix, 'all', 'bord');
      assert.equal(word[0].items[0].id, 'c1');
      assert.equal(DM.searchMentions(ix, 'all', 'patronne')[0].items[0].label, 'Julie Roy', 'aliases match');
      assert.equal(DM.searchMentions(ix, 'all', 'mt')[0].items[0].label, 'Marie Tremblay', 'a merged contact alias matches the member');
    });

    it('scopes @@ to tasks and @@@ to documents', () => {
      const ix = index();
      const tasks = DM.searchMentions(ix, 'task', '');
      assert.deepEqual(tasks.map((g) => g.type), ['task']);
      assert.equal(tasks[0].items.length, 2);
      const docs = DM.searchMentions(ix, 'doc', 'plan');
      assert.deepEqual(docs.map((g) => g.type), ['doc']);
      assert.equal(docs[0].items[0].id, 'd1');
    });

    it('shows a few of each group for an empty @ and omits empty groups', () => {
      const ix = index();
      assert.deepEqual(DM.searchMentions(ix, 'all', '').map((g) => g.type), ['person', 'task', 'doc']);
      assert.deepEqual(DM.searchMentions(ix, 'all', 'zzzz'), []);
    });

    it('ranks prefix matches above substring matches', () => {
      const ix = DM.buildMentionIndex({
        cards: [
          { id: 'a', name: 'Préparer la revue' },
          { id: 'b', name: 'Revue de code' },
        ],
      });
      assert.deepEqual(DM.searchMentions(ix, 'task', 'revue')[0].items.map((i) => i.id), ['b', 'a']);
    });

    it('drops items whose id cannot be stored in a link', () => {
      const ix = DM.buildMentionIndex({ cards: [{ id: 'bad id!', name: 'x' }, { id: 'ok_1', name: 'y' }] });
      assert.deepEqual(ix.task.map((t) => t.id), ['ok_1']);
    });
  });

  describe('utilities', () => {
    it('counts words', () => {
      assert.equal(DM.countWords(' un  deux\ntrois '), 3);
      assert.equal(DM.countWords(''), 0);
    });

    it('formats relative times in French', () => {
      const now = Date.parse('2026-10-03T12:00:00Z');
      assert.equal(DM.relativeTime('2026-10-03T11:59:50Z', now), 'à l’instant');
      assert.equal(DM.relativeTime('2026-10-03T11:55:00Z', now), 'il y a 5 min');
      assert.equal(DM.relativeTime('2026-10-03T09:00:00Z', now), 'il y a 3 h');
      assert.equal(DM.relativeTime('2026-10-02T09:00:00Z', now), 'hier');
      assert.equal(DM.relativeTime('2026-09-29T12:00:00Z', now), 'il y a 4 j');
      assert.match(DM.relativeTime('2026-08-03T12:00:00Z', now), /^3 août$/);
      assert.match(DM.relativeTime('2025-08-03T12:00:00Z', now), /^3 août 2025$/);
      assert.equal(DM.relativeTime('nope', now), '');
    });

    it('exports Markdown with plain @mentions', () => {
      const md = 'voir [@Marie \\[T\\]](person:m1) et [@Plan](doc:d1)';
      assert.equal(DM.mentionsToPlain(md), 'voir @Marie [T] et @Plan');
      assert.equal(DM.exportMarkdown('Mon doc', md), '# Mon doc\n\nvoir @Marie [T] et @Plan\n');
    });

    it('filters documents by title, accent-insensitive', () => {
      const docs = [{ title: 'Réunion' }, { title: 'Plan' }];
      assert.deepEqual(DM.filterDocs(docs, 'reunion').map((d) => d.title), ['Réunion']);
      assert.equal(DM.filterDocs(docs, '').length, 2);
    });
  });
});
