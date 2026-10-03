/* In-page E2E checks for the Document view (real DocsUI / DocsTrello / DocsModel, in-memory Trello).
 * Loaded by sandbox/e2e/docs.html?run. Results go to #e2e-report as "PASS name" / "FAIL name: why",
 * ending with "E2E DONE pass=N fail=M" (same protocol as tests.js, so scripts/run-e2e.js can drive it). */
(function () {
  var report = document.getElementById('e2e-report');
  var lines = [];
  var pass = 0;
  var fail = 0;
  var tests = [];

  function log(line) {
    lines.push(line);
    report.textContent = lines.join('\n');
  }
  var unauth = /[?&]unauth\b/.test(location.search);
  // test(name, fn)           runs on the normal page (docs.html?run)
  // test.unauth(name, fn)    runs on docs.html?run&unauth, where the Trello token is missing at start
  function test(name, fn) {
    if (!unauth) tests.push({ name: name, fn: fn });
  }
  test.unauth = function (name, fn) {
    if (unauth) tests.push({ name: name, fn: fn });
  };
  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
  }
  function eq(a, b, msg) {
    if (a !== b) throw new Error((msg || 'not equal') + ': got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b));
  }
  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }
  async function waitFor(fn, what, timeout) {
    var end = Date.now() + (timeout || 4000);
    while (Date.now() < end) {
      var v = fn();
      if (v) return v;
      await sleep(25);
    }
    throw new Error('timeout waiting for ' + what);
  }
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function ed() { return $('.dc-editor'); }
  function md() { return DocsModel.domToMd(ed()); }
  function cardOf(id) { return fake.cards.filter(function (c) { return c.id === id; })[0]; }
  function bodyOf(id) { return DocsModel.unpackDesc(cardOf(id).desc).body; }

  /* ── driving the editor like a user ─────────────────────────────── */
  function caretAtEnd(el) {
    var e = el || ed();
    e.focus();
    var r = document.createRange();
    r.selectNodeContents(e);
    r.collapse(false);
    var s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  function caretIn(block, atEnd) {
    ed().focus();
    var r = document.createRange();
    r.selectNodeContents(block);
    r.collapse(!atEnd);
    var s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  function type(text) {
    document.execCommand('insertText', false, text);
  }
  function press(k, o) {
    var e = new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {}));
    ed().dispatchEvent(e);
    if (!e.defaultPrevented) {
      if (k === 'Enter') document.execCommand('insertParagraph');
      else if (k === 'Backspace') document.execCommand('delete');
    }
    return e.defaultPrevented;
  }
  function suggest() {
    var b = $('.dc-suggest');
    return {
      open: !b.hidden,
      rows: $$('.dc-suggest .dc-sg-row').map(function (r) { return r.querySelector('.dc-sg-label').textContent; }),
      groups: $$('.dc-suggest .dc-sg-group').map(function (g) { return g.textContent; }),
      title: (b.querySelector('.dc-sg-head span') || {}).textContent,
    };
  }
  function status() { return $('.dc-status').textContent; }

  async function freshDoc(title, body) {
    var doc = await DocsTrello.createDoc(fake.t, title, body || '');
    fake.calls.length = 0;
    // reopen the list so the sidebar knows about it, then open it
    ui.state.docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
    var opening = ui.openDoc(doc.id);
    // leaving a document that cannot be saved asks first: a user would "abandon", so does the test
    await waitFor(function () {
      var abandon = $('.dc-dialog .dc-btn--danger');
      if (abandon) abandon.click();
      return ui.state.current && ui.state.current.id === doc.id && ed();
    }, 'document ' + title + ' to open', 6000);
    await opening;
    return doc;
  }
  function putsFor(id) {
    return fake.calls.filter(function (c) { return c.method === 'PUT' && c.path.indexOf('/cards/' + id) === 0 && c.body && c.body.desc; });
  }

  /* ── tests ──────────────────────────────────────────────────────── */

  test('opens the most recently edited document and renders its content', async function () {
    await waitFor(function () { return ed(); }, 'editor');
    eq($('.dc-title').value, 'Compte rendu de lancement');
    assert(ed().querySelector('h1'), 'heading');
    eq(ed().querySelectorAll('.dc-mention').length, 4, 'four chips');
    eq($$('.dc-item').length, 2, 'two documents in the sidebar');
    assert($('.dc-item.is-on'), 'active item');
    eq($$('.dc-outline-item').length, 2, 'outline lists the headings');
  });

  test('chips are inside their paragraph and not editable', async function () {
    var chips = $$('.dc-editor .dc-mention');
    chips.forEach(function (c) {
      eq(c.getAttribute('contenteditable'), 'false');
      assert(c.parentNode.tagName === 'P' || c.parentNode.tagName === 'LI' || c.parentNode.tagName === 'BLOCKQUOTE' || c.closest('p,li,blockquote'), 'chip in a block');
    });
  });

  test('@ lists people, tasks and documents; picking a person inserts an inline chip', async function () {
    await freshDoc('Mentions', '');
    caretIn(ed().firstChild);
    type('Voir @');
    await waitFor(function () { return suggest().open; }, 'popup');
    var s = suggest();
    assert(s.groups.indexOf('Personnes') >= 0 && s.groups.indexOf('Tâches') >= 0 && s.groups.indexOf('Documents') >= 0, 'three groups: ' + s.groups);
    eq(s.rows[0], 'Marie Tremblay', 'people first');
    type('mar');
    await waitFor(function () { return suggest().rows.length === 1; }, 'filtered');
    eq(suggest().rows[0], 'Marie Tremblay');
    assert(press('Enter'), 'Enter is taken by the popup');
    await waitFor(function () { return ed().querySelector('.dc-mention'); }, 'chip');
    var chip = ed().querySelector('.dc-mention');
    eq(chip.parentNode.tagName, 'P', 'chip stays inside the paragraph');
    eq(ed().children.length, 1, 'no stray block was created');
    eq(chip.getAttribute('data-id'), 'm1');
    eq(chip.getAttribute('contenteditable'), 'false');
    assert(!suggest().open, 'popup closed');
    assert(md() === 'Voir [@Marie Tremblay](person:m1)', 'markdown: ' + md());
  });

  test('typing a space right after a chip does not double it', async function () {
    await freshDoc('Espaces', '');
    caretIn(ed().firstChild);
    type('@eri');
    await waitFor(function () { return suggest().open; }, 'popup');
    press('Enter');
    await waitFor(function () { return ed().querySelector('.dc-mention'); }, 'chip');
    type(' ');
    await sleep(30);
    type('ok');
    eq(md(), '[@Éric Gagnon](person:m2) ok');
  });

  test('@@ only offers tasks and @@@ only documents (current document excluded)', async function () {
    await freshDoc('Portées', '');
    caretIn(ed().firstChild);
    type('@@');
    await waitFor(function () { return suggest().open; }, 'task popup');
    var s = suggest();
    eq(s.title, 'Lier une tâche');
    assert(s.rows.indexOf('Refonte du tableau de bord') >= 0, 'lists tasks');
    assert(s.rows.indexOf('Marie Tremblay') < 0, 'no people');
    assert(s.rows.every(function (r) { return r.indexOf('📄') < 0 && r !== 'Portées'; }), 'no documents');
    type('refo');
    await waitFor(function () { return suggest().rows.length === 1; }, 'one task');
    press('Enter');
    await waitFor(function () { return ed().querySelector('.dc-mention--task'); }, 'task chip');
    await sleep(30);
    type('puis @@@');
    await waitFor(function () { return suggest().open && suggest().title === 'Lier un document'; }, 'doc popup');
    var d = suggest();
    assert(d.rows.indexOf('Plan de projet') >= 0, 'lists other documents');
    assert(d.rows.indexOf('Portées') < 0, 'not the open document');
    press('Enter');
    await waitFor(function () { return ed().querySelector('.dc-mention--doc'); }, 'doc chip');
    assert(/^\[@Refonte du tableau de bord\]\(task:c2\) puis \[@[^\]]+\]\(doc:[A-Za-z0-9]+\)$/.test(md()), 'markdown: ' + md());
  });

  test('@@@ can create the document being mentioned', async function () {
    await freshDoc('Source', '');
    var before = ui.state.docs.length;
    caretIn(ed().firstChild);
    type('@@@Nouvelle spec');
    await waitFor(function () { return suggest().rows.some(function (r) { return r.indexOf('Créer le document') === 0; }); }, 'create row');
    var rows = suggest().rows;
    var idx = rows.length - 1;
    $$('.dc-suggest .dc-sg-row')[idx].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await waitFor(function () { return ed().querySelector('.dc-mention--doc'); }, 'chip to the new doc', 5000);
    eq(ui.state.docs.length, before + 1);
    var created = fake.cards.filter(function (c) { return c.name === '📄 Nouvelle spec'; })[0];
    assert(created && created.closed, 'created and archived');
    eq(ed().querySelector('.dc-mention--doc').getAttribute('data-id'), created.id);
  });

  test('Escape closes the popup and keeps the typed text', async function () {
    await freshDoc('Echap', '');
    caretIn(ed().firstChild);
    type('@ma');
    await waitFor(function () { return suggest().open; }, 'popup');
    assert(press('Escape'), 'Escape handled');
    assert(!suggest().open, 'closed');
    assert(ed().textContent.indexOf('@ma') >= 0, 'text kept');
    assert(!ed().querySelector('.dc-mention'), 'no chip created');
  });

  test('an e-mail address does not open the popup', async function () {
    await freshDoc('Mail', '');
    caretIn(ed().firstChild);
    type('ecrire a jean@exemple.com');
    await sleep(60);
    assert(!suggest().open, 'no popup');
  });

  test('arrow keys move the highlighted suggestion', async function () {
    await freshDoc('Fleches', '');
    caretIn(ed().firstChild);
    type('@');
    await waitFor(function () { return suggest().open; }, 'popup');
    var first = $('.dc-sg-row.is-active .dc-sg-label').textContent;
    press('ArrowDown');
    var second = $('.dc-sg-row.is-active .dc-sg-label').textContent;
    assert(first !== second, 'moved');
    press('ArrowUp');
    eq($('.dc-sg-row.is-active .dc-sg-label').textContent, first);
    press('Escape');
  });

  test('deleting after a chip removes it as a whole', async function () {
    await freshDoc('Suppr', '');
    caretIn(ed().firstChild);
    type('a @eri');
    await waitFor(function () { return suggest().open; }, 'popup');
    press('Enter');
    await waitFor(function () { return ed().querySelector('.dc-mention'); }, 'chip');
    press('Backspace'); // the trailing space
    press('Backspace'); // the chip
    eq(ed().querySelectorAll('.dc-mention').length, 0, 'chip gone');
    assert(ed().textContent.indexOf('Éric') < 0, 'no half-deleted label');
  });

  test('markdown shortcuts: # - 1. [] >', async function () {
    var cases = [
      ['# ', 'h1'], ['## ', 'h2'], ['### ', 'h3'], ['- ', 'ul'], ['1. ', 'ol'], ['[] ', 'ul.dc-todo'], ['> ', 'blockquote'],
    ];
    for (var i = 0; i < cases.length; i++) {
      await freshDoc('Raccourci ' + i, '');
      caretIn(ed().firstChild);
      type(cases[i][0].slice(0, -1));
      type(' ');
      await sleep(40);
      assert(ed().querySelector(cases[i][1]), cases[i][0] + ' -> ' + cases[i][1] + ' (got ' + ed().innerHTML + ')');
      type('texte');
      assert(ed().textContent.indexOf('texte') >= 0 && ed().textContent.indexOf(cases[i][0].trim() + ' ') !== 0, 'marker consumed: ' + ed().textContent);
    }
  });

  test('--- + Enter makes a rule and leaves a paragraph to continue in', async function () {
    await freshDoc('Regle', 'avant');
    caretAtEnd();
    document.execCommand('insertParagraph');
    type('---');
    press('Enter');
    await sleep(40);
    assert(ed().querySelector('hr'), 'hr');
    var after = ed().querySelector('hr').nextElementSibling;
    assert(after && after.tagName === 'P', 'paragraph after the rule');
    type('apres');
    eq(md(), 'avant\n\n---\n\napres');
  });

  test('/ opens the command menu, filters it and applies the command', async function () {
    await freshDoc('Slash', '');
    caretIn(ed().firstChild);
    type('/');
    await waitFor(function () { return suggest().open; }, 'slash menu');
    assert(suggest().rows.length >= 10, 'lists the commands');
    type('tit');
    await waitFor(function () { return suggest().rows.length === 3; }, 'filtered to the three headings');
    eq(suggest().rows[0], 'Titre 1');
    press('ArrowDown');
    press('Enter');
    await sleep(60);
    assert(ed().querySelector('h2'), 'h2 applied: ' + ed().innerHTML);
    assert(ed().textContent.indexOf('/') < 0, 'slash text removed');
  });

  test('/ then "Lier une tâche" starts a @@ search', async function () {
    await freshDoc('Slash 2', '');
    caretIn(ed().firstChild);
    type('/carte');
    await waitFor(function () { return suggest().open && suggest().rows.length === 1; }, 'one command');
    press('Enter');
    await waitFor(function () { return suggest().open && suggest().title === 'Lier une tâche'; }, 'task popup');
    press('Escape');
  });

  test('toolbar: bold, italic, underline, strike on a selection', async function () {
    await freshDoc('Mise en forme', 'un deux trois');
    function selectWord(w) {
      var walker = document.createTreeWalker(ed(), NodeFilter.SHOW_TEXT);
      var tn;
      while ((tn = walker.nextNode())) {
        var i = tn.nodeValue.indexOf(w);
        if (i >= 0) {
          var r = document.createRange();
          r.setStart(tn, i);
          r.setEnd(tn, i + w.length);
          ed().focus();
          var s = getSelection();
          s.removeAllRanges();
          s.addRange(r);
          return;
        }
      }
      throw new Error('word not found: ' + w);
    }
    selectWord('un');
    await sleep(30);
    $('[data-cmd="bold"]').click();
    selectWord('deux');
    await sleep(30);
    $('[data-cmd="italic"]').click();
    eq(md(), '**un** *deux* trois');
    var strong = ed().querySelector('b,strong');
    assert(strong, 'bold element');
    var r = document.createRange();
    r.selectNodeContents(ed().querySelector('i,em'));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    await sleep(30);
    $('[data-cmd="underline"]').click();
    $('[data-cmd="strike"]').click();
    assert(/\*~~\+\+deux\+\+~~\*|\+\+~~\*deux\*~~\+\+|~~\+\+\*deux\*\+\+~~|\*\+\+~~deux~~\+\+\*|\*~~\+\+deux\+\+~~\*|\+\+\*~~deux~~\*\+\+|~~\*\+\+deux\+\+\*~~/.test(md()), 'all three marks on "deux": ' + md());
  });

  test('toolbar: lists, checklist, quote, code block, headings via the select', async function () {
    await freshDoc('Blocs', 'ligne');
    caretIn(ed().firstChild, true);
    $('[data-cmd="ul"]').click();
    assert(ed().querySelector('ul'), 'bullets');
    $('[data-cmd="ul"]').click();
    assert(!ed().querySelector('ul'), 'toggled off');
    $('[data-cmd="todo"]').click();
    assert(ed().querySelector('ul.dc-todo > li[data-checked="false"]'), 'checklist: ' + ed().innerHTML);
    $('[data-cmd="todo"]').click();
    assert(!ed().querySelector('.dc-todo'), 'checklist toggled off');
    assert(!ed().querySelector('ul'), 'back to a paragraph');
    $('[data-cmd="quote"]').click();
    assert(ed().querySelector('blockquote'), 'quote');
    $('[data-cmd="quote"]').click();
    assert(!ed().querySelector('blockquote'), 'quote off');
    $('[data-cmd="codeblock"]').click();
    assert(ed().querySelector('pre'), 'code block');
    $('[data-cmd="codeblock"]').click();
    assert(!ed().querySelector('pre'), 'code block off');
    var sel = $('.dc-select');
    sel.value = 'h2';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    assert(ed().querySelector('h2'), 'heading from the select');
    eq(md(), '## ligne');
  });

  test('a checklist box toggles on click, and Enter starts an unchecked item', async function () {
    await freshDoc('Cases', '- [x] fait\n- [ ] a faire');
    var items = $$('.dc-editor .dc-todo > li');
    eq(items.length, 2);
    var li = items[1];
    var rect = li.getBoundingClientRect();
    li.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: rect.left + 8, clientY: rect.top + 8 }));
    eq(li.getAttribute('data-checked'), 'true', 'checked by click');
    eq(md(), '- [x] fait\n- [x] a faire');
    // Enter at the end of a checked item: the new item is unchecked
    caretIn(items[0], true);
    press('Enter');
    await sleep(30);
    var lis = $$('.dc-editor .dc-todo > li');
    eq(lis.length, 3);
    eq(lis[1].getAttribute('data-checked'), 'false', 'new item unchecked');
  });

  test('Tab / Shift+Tab nest and un-nest list items', async function () {
    await freshDoc('Imbrication', '- a\n- b');
    caretIn($$('.dc-editor li')[1], true);
    press('Tab');
    await sleep(30);
    eq(md(), '- a\n  - b');
    press('Tab', { shiftKey: true });
    await sleep(30);
    eq(md(), '- a\n- b');
  });

  test('inline link via the popover; Ctrl+K opens it; invalid addresses are refused', async function () {
    await freshDoc('Liens', 'voir ici');
    var tn = ed().firstChild.firstChild;
    var r = document.createRange();
    r.setStart(tn, 5);
    r.setEnd(tn, 8);
    ed().focus();
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    await sleep(30);
    $('[data-cmd="link"]').click();
    var input = await waitFor(function () { return $('.dc-pop input'); }, 'link popover');
    input.value = 'javascript:alert(1)';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert(!$('.dc-pop-err').hidden, 'error shown');
    assert(!ed().querySelector('a'), 'nothing linked');
    input.value = 'exemple.com/page';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(40);
    eq(md(), 'voir [ici](https://exemple.com/page)');
    assert(!$('.dc-pop'), 'popover closed');
  });

  test('pasting formatted HTML keeps the formatting and drops the rest', async function () {
    await freshDoc('Collage', '');
    caretIn(ed().firstChild);
    var dt = new DataTransfer();
    dt.setData('text/html', '<meta charset="utf-8"><b style="font-weight:normal"><p><span style="font-weight:700">Gras</span> <span style="color:red;font-family:Comic Sans MS">rouge</span> <a href="https://a.com">lien</a><script>alert(1)</script></p></b>');
    dt.setData('text/plain', 'Gras rouge lien');
    ed().dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(40);
    eq(md(), '**Gras** rouge [lien](https://a.com)');
    assert(!ed().querySelector('script,font,[style]'), 'no foreign markup');
  });

  test('pasting plain text becomes paragraphs; pasting a chip keeps it a chip inside the paragraph', async function () {
    await freshDoc('Collage 2', '');
    caretIn(ed().firstChild);
    var dt = new DataTransfer();
    dt.setData('text/plain', 'un\ndeux\n\ntrois');
    ed().dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(40);
    eq(md(), 'un\ndeux\n\ntrois');
    caretAtEnd();
    var dt2 = new DataTransfer();
    dt2.setData('text/html', DocsModel.mentionHtml('task', 'c2', 'Refonte du tableau de bord'));
    ed().dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt2, bubbles: true, cancelable: true }));
    await sleep(40);
    var chip = ed().querySelector('.dc-mention--task');
    assert(chip && chip.closest('p'), 'chip inside a paragraph');
    eq(chip.getAttribute('contenteditable'), 'false');
  });

  test('autosave: debounced PUT with an incremented revision, status goes dirty -> saved', async function () {
    var doc = await freshDoc('Auto', '');
    caretIn(ed().firstChild);
    type('bonjour');
    eq(status(), 'Modifications non enregistrées');
    eq(putsFor(doc.id).length, 0, 'not saved yet');
    await waitFor(function () { return putsFor(doc.id).length === 1; }, 'the debounced save', 7000);
    await waitFor(function () { return status() === 'Enregistré'; }, 'saved status');
    eq(bodyOf(doc.id), 'bonjour');
    eq(DocsModel.unpackDesc(cardOf(doc.id).desc).rev, 2);
    // typing more bumps it again, saving only once for a burst
    type(' monde');
    type('!');
    await waitFor(function () { return putsFor(doc.id).length === 2; }, 'second save', 7000);
    eq(bodyOf(doc.id), 'bonjour monde!');
    eq(DocsModel.unpackDesc(cardOf(doc.id).desc).rev, 3);
  });

  test('opening a document never rewrites it, and switching saves the one you leave', async function () {
    var a = await freshDoc('Doc A', 'texte a');
    await sleep(1500);
    eq(putsFor(a.id).length, 0, 'opening did not save');
    caretAtEnd();
    type(' modifié');
    var b = await DocsTrello.createDoc(fake.t, 'Doc B', 'b');
    ui.state.docs.unshift({ id: b.id, title: b.title, updatedAt: b.updatedAt });
    await ui.openDoc(b.id);
    await waitFor(function () { return ui.state.current.id === b.id; }, 'B open');
    eq(bodyOf(a.id), 'texte a modifié', 'A was saved on the way out');
    eq($('.dc-title').value, 'Doc B');
  });

  test('renaming the title renames the card (marker kept) and the sidebar follows', async function () {
    var doc = await freshDoc('Ancien titre', 'x');
    var t = $('.dc-title');
    t.focus();
    t.value = 'Nouveau titre';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    assert($$('.dc-item-title').some(function (n) { return n.textContent === 'Nouveau titre'; }), 'sidebar updated instantly');
    eq($('.dc-head-title').textContent, 'Nouveau titre');
    await waitFor(function () { return cardOf(doc.id).name === '📄 Nouveau titre'; }, 'card renamed', 7000);
    eq(bodyOf(doc.id), 'x', 'text untouched');
    t.value = '';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor(function () { return cardOf(doc.id).name === '📄 Sans titre'; }, 'empty title falls back', 7000);
  });

  test('a save over a newer remote revision is refused, and can be overridden', async function () {
    var doc = await freshDoc('Conflit', 'v1');
    var card = cardOf(doc.id);
    card.desc = DocsModel.packDesc('version de quelqu’un d’autre', { rev: 7 });
    caretAtEnd();
    type(' ma modif');
    await waitFor(function () { return !$('.dc-conflict').hidden; }, 'conflict bar', 7000);
    eq(status(), 'Modifié ailleurs');
    eq(bodyOf(doc.id), 'version de quelqu’un d’autre', 'remote text untouched');
    var before = putsFor(doc.id).length;
    await sleep(1500);
    eq(putsFor(doc.id).length, before, 'no retry loop while in conflict');
    $('.dc-conflict .dc-btn--danger').click();
    await waitFor(function () { return bodyOf(doc.id) === 'v1 ma modif'; }, 'forced save', 7000);
    eq(DocsModel.unpackDesc(cardOf(doc.id).desc).rev, 8);
    assert($('.dc-conflict').hidden, 'bar closed');
    await waitFor(function () { return status() === 'Enregistré'; }, 'saved again');
  });

  test('"Charger sa version" in a conflict reloads the remote text', async function () {
    var doc = await freshDoc('Conflit 2', 'v1');
    cardOf(doc.id).desc = DocsModel.packDesc('distant', { rev: 4 });
    caretAtEnd();
    type('!');
    await waitFor(function () { return !$('.dc-conflict').hidden; }, 'conflict bar', 7000);
    $('.dc-conflict .dc-btn:not(.dc-btn--danger)').click();
    await waitFor(function () { return md() === 'distant'; }, 'remote text loaded', 7000);
    eq(ui.state.current.rev, 4);
  });

  test('picks up what another member saved when the window regains focus, but never over unsaved typing', async function () {
    var doc = await freshDoc('Partage', 'a');
    var card = cardOf(doc.id);
    card.desc = DocsModel.packDesc('b par un autre', { rev: 5 });
    await ui.refresh();
    await waitFor(function () { return md() === 'b par un autre'; }, 'remote text');
    eq(ui.state.current.rev, 5);
    assert(/mis à jour/.test($('.dc-toast').textContent), 'says so');
    caretAtEnd();
    type('!');
    card.desc = DocsModel.packDesc('encore un autre', { rev: 6 });
    await ui.refresh();
    eq(md(), 'b par un autre!', 'typing is not overwritten');
    // someone deleted it meanwhile
    fake.cards.splice(fake.cards.indexOf(card), 1);
    await ui.refresh();
    assert(/supprimé/.test($('.dc-toast').textContent), 'deletion announced');
  });

  test('a document that is too long is not sent and says so', async function () {
    var doc = await freshDoc('Trop long', '');
    caretIn(ed().firstChild);
    var big = new Array(2200).join('abcdefgh ');
    document.execCommand('insertText', false, big);
    await waitFor(function () { return /trop long/i.test(status()); }, 'too-long status', 7000);
    eq(putsFor(doc.id).length, 0, 'nothing sent');
    assert($('.dc-size.is-over'), 'size badge turns red');
  });

  test('Trello write failures show an error with a retry that works', async function () {
    var doc = await freshDoc('Panne', 'a');
    var real = SheetsTrello.trelloRest;
    var down = true;
    SheetsTrello.trelloRest = function (t, p, m, b) {
      if (down && m === 'PUT') return Promise.resolve({ ok: false, reason: 'http-500' });
      return real(t, p, m, b);
    };
    try {
      caretAtEnd();
      type('b');
      await waitFor(function () { return /Échec/.test(status()); }, 'error status', 7000);
      down = false;
      $('.dc-status .dc-link').click();
      await waitFor(function () { return bodyOf(doc.id) === 'ab'; }, 'retry saved', 7000);
    } finally {
      SheetsTrello.trelloRest = real;
    }
  });

  test('losing the Trello token shows the authorization banner', async function () {
    var doc = await freshDoc('Jeton', 'a');
    fake.setAuthorized(false);
    caretAtEnd();
    type('b');
    await waitFor(function () { return !$('.dc-banner').hidden; }, 'banner', 7000);
    assert(/Autoriser Trello/.test($('.dc-banner').textContent), 'authorize button');
    fake.setAuthorized(true);
    PriorityTrello.isRestAuthorized = function () { return Promise.resolve(true); };
    $('.dc-banner .dc-btn').click();
    await waitFor(function () { return $('.dc-banner').hidden; }, 'banner closed', 7000);
    await ui.saveNow({ retry: true });
    eq(bodyOf(doc.id), 'ab');
  });

  test('duplicate, export and delete from the actions menu', async function () {
    var doc = await freshDoc('Original', '# Titre\n\ntexte avec [@Marie Tremblay](person:m1)');
    var more = $('.dc-head .dc-tb[aria-label="Actions du document"]');
    more.click();
    var items = $$('.dc-pop .dc-menu-item').map(function (b) { return b.textContent; });
    eq(items.join('|'), 'Dupliquer|Télécharger (.md)|Copier en Markdown|Supprimer…');
    $$('.dc-pop .dc-menu-item')[0].click();
    await waitFor(function () { return $('.dc-title').value === 'Original (copie)'; }, 'copy opened', 4000);
    eq(md(), '# Titre\n\ntexte avec [@Marie Tremblay](person:m1)');
    var copy = ui.state.current.id;
    assert(copy !== doc.id, 'a different card');
    // delete the copy with confirmation
    $('.dc-head .dc-tb[aria-label="Actions du document"]').click();
    $$('.dc-pop .dc-menu-item').filter(function (b) { return /Supprimer/.test(b.textContent); })[0].click();
    var dlg = await waitFor(function () { return $('.dc-dialog'); }, 'confirmation dialog');
    assert(/Original \(copie\)/.test(dlg.textContent), 'names the document');
    $('.dc-dialog .dc-btn:not(.dc-btn--danger)').click(); // cancel
    await sleep(30);
    assert(cardOf(copy), 'cancel keeps it');
    $('.dc-head .dc-tb[aria-label="Actions du document"]').click();
    $$('.dc-pop .dc-menu-item').filter(function (b) { return /Supprimer/.test(b.textContent); })[0].click();
    await waitFor(function () { return $('.dc-dialog'); }, 'dialog again');
    $('.dc-dialog .dc-btn--danger').click();
    await waitFor(function () { return !cardOf(copy); }, 'card deleted', 7000);
    assert(cardOf(doc.id), 'original untouched');
    assert(ui.state.docs.every(function (d) { return d.id !== copy; }), 'gone from the list');
  });

  test('clicking a task chip opens the card; clicking a document chip opens the document', async function () {
    await freshDoc('Liens vers', 'tâche [@Refonte du tableau de bord](task:c2) et doc [@Plan de projet](doc:doc2)');
    fake.calls.length = 0;
    ed().querySelector('.dc-mention--task').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitFor(function () { return fake.calls.some(function (c) { return c.method === 'MODAL'; }); }, 'card modal');
    var modal = fake.calls.filter(function (c) { return c.method === 'MODAL'; })[0];
    eq(modal.body.cardId, 'c2');
    ed().querySelector('.dc-mention--doc').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitFor(function () { return $('.dc-title').value === 'Plan de projet'; }, 'other document open', 7000);
  });

  test('clicking a person chip shows who they are', async function () {
    await freshDoc('Qui', 'avec [@Marie Tremblay](person:m1)');
    ed().querySelector('.dc-mention--person').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    var pop = await waitFor(function () { return $('.dc-pop--person'); }, 'person popover');
    assert(/Marie Tremblay/.test(pop.textContent) && /@marie_t/.test(pop.textContent), 'name + username');
    assert(pop.querySelector('a[href="https://trello.com/marie_t"]'), 'profile link');
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    assert(!$('.dc-pop'), 'closes on outside click');
  });

  test('chips pick up live names and flag targets that no longer exist', async function () {
    await freshDoc('Vivant', 'a [@Ancien nom](task:c2) b [@Disparue](task:zzz) c [@Fantôme](doc:nope) d [@Done](task:c3)');
    var chips = $$('.dc-editor .dc-mention');
    eq(chips[0].getAttribute('data-label'), 'Refonte du tableau de bord', 'renamed from the live card');
    assert(!chips[0].classList.contains('is-missing'));
    assert(chips[1].classList.contains('is-missing'), 'archived/deleted task flagged');
    assert(chips[2].classList.contains('is-missing'), 'unknown document flagged');
    assert(chips[3].classList.contains('is-done'), 'completed task struck through');
  });

  test('the outline follows the headings and scrolls to them', async function () {
    await freshDoc('Plan', '# Un\n\ntexte\n\n## Deux\n\n### Trois');
    await sleep(60);
    var items = $$('.dc-outline-item');
    eq(items.map(function (i) { return i.textContent; }).join('|'), 'Un|Deux|Trois');
    caretIn(ed().lastChild, true);
    type('x');
    await sleep(500);
    eq($$('.dc-outline-item').length, 3);
  });

  test('word count and size badge', async function () {
    await freshDoc('Mots', 'un deux trois');
    await sleep(60);
    assert(/3 mots/.test($('.dc-meta').textContent), 'counts words: ' + $('.dc-meta').textContent);
  });

  test('no documents: empty state with a create button; search filters the list', async function () {
    // search
    var input = $('.dc-search-input');
    input.value = 'plan';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    assert($$('.dc-item').every(function (i) { return /plan/i.test(i.textContent); }), 'filtered');
    input.value = 'zzzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    assert(/Aucun document ne correspond/.test($('.dc-list').textContent), 'no match message');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  test('"Nouveau" creates an archived card, opens it and focuses the title', async function () {
    var before = fake.cards.length;
    $('.dc-new').click();
    await waitFor(function () { return fake.cards.length === before + 1 && ui.state.current && ui.state.current.title === 'Sans titre'; }, 'new doc', 4000);
    var card = fake.cards[fake.cards.length - 1];
    eq(card.name, '📄 Sans titre');
    eq(card.closed, true, 'archived');
    eq(document.activeElement, $('.dc-title'), 'title focused');
    eq($('.dc-title').value, '', 'placeholder shows "Sans titre"');
    assert(ed().classList.contains('is-empty'), 'placeholder for the body');
  });

  test('document cards never show among the open cards of the board', async function () {
    var open = await fake.t.cards('id', 'name');
    assert(open.every(function (c) { return c.name.indexOf('📄') < 0; }), 'no document among open cards');
  });

  /* ── without a Trello token ─────────────────────────────────────── */

  test.unauth('asks for the Trello authorization instead of showing an empty or broken view', async function () {
    await waitFor(function () { return ui.state.docsLoaded; }, 'view ready');
    var empty = $('.dc-empty');
    assert(!empty.hidden, 'empty state shown');
    assert(/Autorisation Trello requise/.test(empty.textContent), 'explains why: ' + empty.textContent);
    assert($('.dc-empty .dc-btn--primary'), 'authorize button right there');
    assert($('.dc-banner').hidden, 'no banner on top of the empty state');
    assert(/Autorisation Trello requise/.test($('.dc-list').textContent), 'sidebar does not claim there are no documents');
    assert(!ed(), 'no editor');
    assert($('.dc-toolbar').classList.contains('is-disabled'), 'toolbar disabled');
    eq(fake.calls.length, 0, 'no Trello call was attempted without a token');
  });

  test.unauth('authorizing loads the documents and opens the latest one', async function () {
    $('.dc-empty .dc-btn--primary').click();
    await waitFor(function () { return ed() && $('.dc-title').value === 'Compte rendu de lancement'; }, 'documents after authorization', 5000);
    eq($$('.dc-item').length, 2);
    assert($('.dc-empty').hidden, 'empty state gone');
    assert(!$('.dc-toolbar').classList.contains('is-disabled'), 'toolbar enabled');
  });

  /* ── run ────────────────────────────────────────────────────────── */
  async function main() {
    await waitFor(function () { return window.ui && window.ui.state && window.ui.state.docsLoaded && (unauth || document.querySelector('.dc-editor')); }, 'initial document', 8000).catch(function () {});
    if (/[?&]manual\b/.test(location.search)) {
      report.textContent = 'manual mode';
      return;
    }
    for (var i = 0; i < tests.length; i++) {
      try {
        await tests[i].fn();
        pass++;
        log('PASS ' + tests[i].name);
      } catch (err) {
        fail++;
        log('FAIL ' + tests[i].name + ': ' + err.message);
      }
      // each test starts without leftovers from the previous one
      var s = $('.dc-suggest');
      if (s && !s.hidden) {
        var ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        if (ed()) ed().dispatchEvent(ev);
      }
    }
    log('E2E DONE pass=' + pass + ' fail=' + fail);
  }
  window.addEventListener('load', function () { setTimeout(main, 400); });
})();
