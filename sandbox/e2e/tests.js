/* In-page E2E checks for the Assistant chat (real scripts, mocked LLM).
 * Results go to #e2e-report as "PASS name" / "FAIL name: why" lines, ending with
 * "E2E DONE pass=N fail=M". Driven by scripts/run-e2e.js (headless Edge/Chrome). */
(function () {
  var report = document.getElementById('e2e-report');
  var lines = [];
  var pass = 0;
  var fail = 0;

  function log(line) {
    lines.push(line);
    report.textContent = lines.join('\n');
  }
  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }
  async function waitFor(fn, what, timeout) {
    var end = Date.now() + (timeout || 4000);
    while (Date.now() < end) {
      var v = fn();
      if (v) return v;
      await sleep(30);
    }
    throw new Error('timeout waiting for ' + what);
  }
  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
  }
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function key(k, opts) {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', Object.assign({ key: k, code: 'Digit' + k, shiftKey: true, bubbles: true, cancelable: true }, opts || {}))
    );
  }
  function userTexts() {
    return $$('.agent-msg--user .agent-msg-bubble').map(function (b) { return b.textContent; });
  }
  function typeAndSend(text) {
    var input = $('.agent-composer-input');
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    $('.agent-send-btn').click();
  }
  async function settle() {
    await waitFor(function () { return !$('.agent-msg.is-pending'); }, 'no pending reply', 8000);
    await sleep(150);
  }

  var tests = [];
  function test(name, fn) { tests.push({ name: name, fn: fn }); }

  test('mounts the chat panel with a composer', async function () {
    await waitFor(function () { return $('.agent-composer-input'); }, 'composer');
    assert($('.agent-send-btn'), 'send button');
  });

  test('layout: mode picker sits in a compact footer below the composer', async function () {
    var composer = $('.agent-composer');
    var foot = $('.agent-composer-foot');
    assert(foot && composer, 'foot + composer exist');
    assert(!composer.contains($('.agent-model-mode-select')), 'select is not inside the composer row');
    assert(foot.contains($('.agent-model-mode-select')), 'select is in the footer');
    assert(
      composer.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING,
      'footer follows composer'
    );
    var h = $('.agent-model-mode-wrap').getBoundingClientRect().height;
    assert(h > 0 && h <= 30, 'mode pill is small (height ' + h + ')');
    assert($('.agent-send-btn-icon'), 'send button has an icon');
    assert($('.agent-model-mode-icon'), 'mode picker has an icon');
  });

  test('layout: stats/debug block is below the composer, not above', async function () {
    var info = $('.agent-chat-info');
    var composer = $('.agent-composer');
    assert(info && composer, 'elements exist');
    assert(
      composer.compareDocumentPosition(info) & Node.DOCUMENT_POSITION_FOLLOWING,
      'info follows composer in DOM'
    );
    if (!info.hidden) {
      var a = composer.getBoundingClientRect();
      var b = info.getBoundingClientRect();
      assert(b.top >= a.bottom - 1, 'info is rendered under the composer');
    }
  });

  test('layout: composer input, mode pill and send share the rounded language', async function () {
    var wrap = getComputedStyle($('.agent-composer .tp-tab-complete-wrap') || $('.agent-composer-input'));
    var send = getComputedStyle($('.agent-send-btn'));
    var r1 = parseFloat(wrap.borderTopLeftRadius);
    var r2 = parseFloat(send.borderTopLeftRadius);
    assert(r1 >= 10 && r2 >= 10, 'radii ' + r1 + '/' + r2 + ' should be >= 10');
    assert(r1 === r2, 'input and send radius match (' + r1 + ' vs ' + r2 + ')');
  });

  test('layout: send is an icon-only square', async function () {
    var b = $('.agent-send-btn').getBoundingClientRect();
    assert(Math.abs(b.width - b.height) <= 1, 'square (' + b.width + 'x' + b.height + ')');
    var label = $('.agent-send-btn-label').getBoundingClientRect();
    assert(label.width <= 1, 'label visually hidden');
    assert($('.agent-send-btn').getAttribute('aria-label') === 'Envoyer', 'still labelled for screen readers');
  });

  test('layout: stats are collapsed by default with a toggle', async function () {
    var toggle = $('.agent-info-toggle');
    assert(toggle, 'info toggle exists');
    assert(toggle.getAttribute('aria-expanded') === 'false', 'collapsed by default');
    assert(!$('.agent-chat-stats .agent-chat-stats-label'), 'no detail labels while collapsed');
  });

  test('a message gets a reply', async function () {
    typeAndSend('Bonjour assistant');
    await settle();
    assert(userTexts().indexOf('Bonjour assistant') !== -1, 'user bubble');
    assert(/Reçu : Bonjour assistant/.test(document.body.textContent), 'assistant reply');
  });

  test('single-choice chips show 1-3 badges and a number key sends the choice', async function () {
    typeAndSend('[chips] propose');
    await settle();
    var chips = await waitFor(function () {
      var c = $$('.agent-suggestion-chip');
      return c.length === 3 && c;
    }, '3 chips');
    var nums = chips.map(function (c) { return (c.querySelector('.agent-suggestion-num') || {}).textContent; });
    assert(nums.join(',') === '\u21e71,\u21e72,\u21e73', 'badges ' + nums.join(','));
    key('2');
    await waitFor(function () { return userTexts().indexOf('Bravo') !== -1; }, 'Bravo sent');
    await settle();
  });

  test('shortcuts need Shift: a bare digit never picks a chip, and Shift+digit is ignored while typing', async function () {
    typeAndSend('[chips] encore');
    await settle();
    await waitFor(function () { return $$('.agent-suggestion-chip').length === 3; }, 'chips');
    key('1', { shiftKey: false });
    await sleep(200);
    assert(userTexts().indexOf('Alpha') === -1, 'bare 1 must not send Alpha');
    var input = $('.agent-composer-input');
    input.value = 'du texte';
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: '!', code: 'Digit1', shiftKey: true, bubbles: true, cancelable: true })
    );
    await sleep(200);
    assert(userTexts().indexOf('Alpha') === -1, 'Shift+1 while typing must not send Alpha');
    input.value = '';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: '#', code: 'Digit3', shiftKey: true, bubbles: true, cancelable: true })
    );
    await waitFor(function () { return userTexts().indexOf('Charlie') !== -1; }, 'Charlie via Shift+3 from empty composer');
    await settle();
  });

  test('multi-select: number keys toggle, countdown runs, then all picks are sent together', async function () {
    typeAndSend('[multi] plusieurs');
    await settle();
    await waitFor(function () { return $$('.agent-suggestion-chip').length === 3; }, 'chips');
    key('1');
    await waitFor(function () { return $$('.agent-suggestion-chip.is-selected').length === 1; }, '1 selected');
    await waitFor(function () {
      var c = $('.agent-send-btn-count');
      return c && !c.hidden && /^[1-5]$/.test(c.textContent);
    }, 'countdown visible on send button');
    key('3');
    await waitFor(function () { return $$('.agent-suggestion-chip.is-selected').length === 2; }, '2 selected');
    key('3'); // toggle Charlie off again
    await waitFor(function () { return $$('.agent-suggestion-chip.is-selected').length === 1; }, 'toggle off');
    key('2');
    await waitFor(function () { return userTexts().indexOf('Alpha. Bravo') !== -1; }, 'combined send after countdown', 9000);
    await settle();
  });

  test('parallel: an independent message runs in its own lane while the main turn is slow', async function () {
    var before = window.__llm.requests.length;
    typeAndSend('[slow] premier sujet un peu long');
    await waitFor(function () { return $('.agent-msg.is-pending'); }, 'main pending');
    typeAndSend('Ajoute une sous-tâche pour appeler le client');
    var lane = await waitFor(function () { return $('.agent-msg--lane'); }, 'lane row');
    assert(/Parallèle/.test(lane.getAttribute('data-lane')), 'lane tag');
    await waitFor(function () {
      return /Reçu : Ajoute une sous-tâche/.test(document.body.textContent);
    }, 'lane reply');
    assert(
      !/Reçu : premier sujet/.test(document.body.textContent),
      'lane replied BEFORE the slow main turn finished (true concurrency)'
    );
    assert($('.agent-msg.is-pending'), 'main turn still pending');
    assert(window.__llm.requests.length - before === 2, 'two LLM requests in flight/served');
    await settle();
    await waitFor(function () {
      return /Reçu : premier sujet/.test(document.body.textContent);
    }, 'main reply', 5000);
  });

  test('parallel: history order is main pair first, then the lane pair', async function () {
    typeAndSend('Question de suivi finale');
    await settle();
    var last = window.__llm.requests[window.__llm.requests.length - 1];
    var msgs = last.messages.filter(function (m) { return m.role !== 'system'; });
    var texts = msgs.map(function (m) { return String(m.content); });
    var iMain = texts.findIndex(function (t) { return /premier sujet/.test(t) && m0(t); });
    function m0() { return true; }
    var iMainAns = texts.findIndex(function (t, i) { return i > iMain && /Reçu : premier sujet/.test(t); });
    var iLane = texts.findIndex(function (t) { return /Ajoute une sous-tâche/.test(t) && !/Reçu/.test(t); });
    var iLaneAns = texts.findIndex(function (t) { return /Reçu : Ajoute une sous-tâche/.test(t); });
    assert(iMain > -1 && iMainAns > iMain, 'main user then main answer');
    assert(iLane > iMainAns, 'lane user comes after the main answer (deferred)');
    assert(iLaneAns > iLane, 'lane answer follows its question');
  });

  test('routing: a short follow-up while busy is queued, not run as a lane', async function () {
    var lanesBefore = $$('.agent-msg--lane').length;
    typeAndSend('[slow] travail lent en cours');
    await waitFor(function () { return $('.agent-msg.is-pending'); }, 'main pending');
    typeAndSend('non plutôt demain');
    await waitFor(function () { return $('.agent-msg--user.is-queued'); }, 'queued row');
    assert($$('.agent-msg--lane').length === lanesBefore, 'no new lane');
    await settle();
    await waitFor(function () { return !$('.agent-msg--user.is-queued'); }, 'queue drained', 8000);
    await settle();
  });

  test('routing: // prefix forces a lane even for a short message', async function () {
    var lanesBefore = $$('.agent-msg--lane').length;
    typeAndSend('[slow] encore un travail lent');
    await waitFor(function () { return $('.agent-msg.is-pending'); }, 'main pending');
    typeAndSend('// ok');
    await waitFor(function () { return $$('.agent-msg--lane').length === lanesBefore + 1; }, 'new lane');
    assert(userTexts().indexOf('ok') !== -1, 'prefix stripped in the user bubble');
    await settle();
    await sleep(2200);
    await settle();
  });

  test('chips are neutral (same colour whatever the AI asked) and left-aligned', async function () {
    typeAndSend('[chips] neutre');
    await settle();
    var chips = await waitFor(function () {
      var c = $$('.agent-suggestion-chip');
      return c.length === 3 && c;
    }, 'chips');
    var cs = chips.map(function (c) { return getComputedStyle(c); });
    assert(cs.every(function (c) { return c.backgroundColor === cs[0].backgroundColor; }), 'same background');
    assert(cs.every(function (c) { return c.borderTopColor === cs[0].borderTopColor; }), 'same border colour');
    assert(cs.every(function (c) { return c.justifyContent === 'flex-start'; }), 'left aligned');
    var xs = chips.map(function (c) { return c.querySelector('.agent-suggestion-num').getBoundingClientRect().left; });
    assert(xs.every(function (x) { return Math.abs(x - xs[0]) < 1; }), 'badges line up');
    key('1');
    await waitFor(function () { return userTexts().indexOf('Alpha') !== -1; }, 'Alpha sent');
    await settle();
  });

  test('no console errors were raised', async function () {
    assert(!window.__errors.length, 'errors: ' + window.__errors.join(' | '));
  });

  // ── ?chats: the Assistant page with its list of conversations (own page in scripts/run-e2e.js) ──
  var withChats = /[?&]chats\b/.test(location.search);
  var chatTests = [];
  function chatTest(name, fn) { chatTests.push({ name: name, fn: fn }); }
  function memoryStorage() {
    var d = {};
    return {
      getItem: function (k) { return d[k] === undefined ? null : d[k]; },
      setItem: function (k, v) { d[k] = String(v); },
      removeItem: function (k) { delete d[k]; }
    };
  }
  function rowTitles() { return $$('.agent-chats-list:not(.agent-chats-list--archived) .agent-chats-item').map(function (b) { return b.textContent; }); }
  function rowByTitle(title, archived) {
    var sel = archived ? '.agent-chats-list--archived .agent-chats-row' : '.agent-chats-list:not(.agent-chats-list--archived) .agent-chats-row';
    return $$(sel).filter(function (r) { return r.querySelector('.agent-chats-item').textContent === title; })[0];
  }
  function assistantTexts() { return $$('.agent-msg--assistant .agent-msg-bubble').map(function (b) { return b.textContent; }); }

  chatTest('chats: opens on a new, empty conversation with the list on the left', async function () {
    await waitFor(function () { return $('.agent-chats'); }, 'the list');
    var aside = $('.agent-chats');
    assert(innerWidth >= 760, 'wide viewport (' + innerWidth + 'px)');
    assert(aside.getBoundingClientRect().width > 150, 'the list is visible (layout "' + $('.agent-chats-layout').className + '")');
    assert(aside.getBoundingClientRect().right <= $('.agent-composer').getBoundingClientRect().left + 1, 'the list is left of the chat');
    assert($$('.agent-msg').length === 0, 'no message on screen');
    assert(rowTitles().length === 0, 'nothing listed yet');
    assert($('.agent-chats-new').classList.contains('is-current'), 'the new conversation is the current one');
    assert(getComputedStyle($('.agent-chats-head-new')).display === 'none', 'header + is hidden while the list is shown');
  });

  chatTest('chats: the first message creates a conversation titled by it, under Aujourd’hui', async function () {
    typeAndSend('Première question');
    await settle();
    var row = await waitFor(function () { return rowByTitle('Première question'); }, 'listed conversation');
    assert(row.classList.contains('is-current'), 'it is the current one');
    assert($('.agent-chats-group-title').textContent === 'Aujourd’hui', 'grouped under today');
    assert(!$('.agent-chats-new').classList.contains('is-current'), 'new is no longer the current one');
  });

  chatTest('chats: Nouvelle conversation empties the chat and keeps the old one in the list', async function () {
    $('.agent-chats-new').click();
    await waitFor(function () { return $$('.agent-msg').length === 0; }, 'chat emptied');
    assert(rowByTitle('Première question'), 'old conversation still listed');
    assert(!rowByTitle('Première question').classList.contains('is-current'), 'and no longer current');
    assert($('.agent-chats-new').classList.contains('is-current'), 'new is current');
    $('.agent-chats-new').click();
    await sleep(100);
    assert(rowTitles().length === 1, 'asking again does not create an empty entry');
  });

  chatTest('chats: opening an earlier conversation brings its messages back, and only it feeds the model', async function () {
    typeAndSend('Deuxième question');
    await settle();
    await waitFor(function () { return rowByTitle('Deuxième question'); }, 'second conversation');
    assert(rowTitles().join('|') === 'Deuxième question|Première question', 'newest first: ' + rowTitles().join('|'));
    rowByTitle('Première question').querySelector('.agent-chats-item').click();
    await waitFor(function () { return userTexts().join('|') === 'Première question'; }, 'first conversation shown');
    assert(assistantTexts().some(function (t) { return /Reçu : Première question/.test(t); }), 'its answer is back');
    assert(rowByTitle('Première question').classList.contains('is-current'), 'now the current one');
    typeAndSend('suite');
    await settle();
    var req = window.__llm.requests.filter(function (r) { return r.text.indexOf('suite') !== -1; }).pop();
    assert(req, 'a request carried the new message');
    var sent = req.messages.map(function (m) { return String(m.content); }).join('\n');
    assert(/Première question/.test(sent), 'the open conversation is sent');
    assert(!/Deuxième question/.test(sent), 'the other conversation is not');
    assert(userTexts().join('|') === 'Première question|suite', 'it continues in place');
  });

  chatTest('chats: archive icon removes the open conversation from the list and opens a fresh one', async function () {
    var row = rowByTitle('Première question');
    var act = row.querySelector('.agent-chats-act');
    assert(act.getBoundingClientRect().width === 26, 'the archive icon always has its own place');
    act.click();
    await waitFor(function () { return !rowByTitle('Première question'); }, 'removed from the list');
    assert($$('.agent-msg').length === 0, 'a fresh conversation is on screen');
    assert(rowTitles().join('|') === 'Deuxième question', 'the other one stays');
    var toggle = $('.agent-chats-archived-toggle');
    assert(!toggle.disabled && $('.agent-chats-archived-count').textContent === '1', 'archived count is 1');
    assert($('.agent-chats-list--archived').hidden, 'archived list is folded');
  });

  chatTest('chats: an archived conversation is restored by clicking it, and opens', async function () {
    $('.agent-chats-archived-toggle').click();
    var row = await waitFor(function () { return rowByTitle('Première question', true); }, 'archived row');
    row.querySelector('.agent-chats-item').click();
    await waitFor(function () { return userTexts().join('|') === 'Première question|suite'; }, 'restored and opened');
    assert(rowByTitle('Première question'), 'back in the main list');
    assert($$('.agent-chats-list--archived .agent-chats-row').length === 0, 'out of the archived list');
  });

  chatTest('chats: right-click menu archives and restores', async function () {
    var row = rowByTitle('Deuxième question');
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 }));
    var item = await waitFor(function () {
      return $$('.cm-item, [role="menuitem"]').filter(function (i) { return /Archiver/.test(i.textContent); })[0];
    }, 'Archiver in the context menu');
    item.click();
    await waitFor(function () { return !rowByTitle('Deuxième question'); }, 'archived through the menu');
    assert(rowByTitle('Deuxième question', true), 'listed as archived');
    rowByTitle('Deuxième question', true).querySelector('.agent-chats-act').click();
    await waitFor(function () { return rowByTitle('Deuxième question'); }, 'restored with its icon');
    assert(userTexts().join('|') === 'Première question|suite', 'restoring does not change what is open');
  });

  chatTest('chats: opening and new stay quiet while the assistant answers', async function () {
    $('.agent-chats-new').click();
    await waitFor(function () { return $$('.agent-msg').length === 0; }, 'fresh');
    typeAndSend('[slow] question lente');
    await waitFor(function () { return $('.agent-msg.is-pending'); }, 'answer pending');
    assert($('.agent-chats').classList.contains('is-locked'), 'the list is marked quiet');
    $('.agent-chats-new').click();
    rowByTitle('Deuxième question').querySelector('.agent-chats-item').click();
    await sleep(150);
    assert(userTexts().join('|') === '[slow] question lente', 'the conversation did not change');
    await settle();
    await waitFor(function () { return !$('.agent-chats').classList.contains('is-locked'); }, 'unlocked');
    assert(assistantTexts().some(function (t) { return /Reçu : question lente/.test(t); }), 'the answer landed in its own conversation');
    rowByTitle('Deuxième question').querySelector('.agent-chats-item').click();
    await waitFor(function () { return userTexts().join('|') === 'Deuxième question'; }, 'opens once it is done');
  });

  chatTest('chats: the list can be hidden, then + in the header starts a conversation', async function () {
    $('.agent-chats-head-toggle').click();
    await waitFor(function () { return getComputedStyle($('.agent-chats')).display === 'none'; }, 'list hidden');
    var plus = $('.agent-chats-head-new');
    assert(getComputedStyle(plus).display !== 'none', 'header + is shown');
    plus.click();
    await waitFor(function () { return $$('.agent-msg').length === 0; }, 'fresh conversation');
    $('.agent-chats-head-toggle').click();
    await waitFor(function () { return getComputedStyle($('.agent-chats')).display !== 'none'; }, 'list back');
  });

  chatTest('no console errors were raised', async function () {
    assert(!window.__errors.length, 'errors: ' + window.__errors.join(' | '));
  });

  window.__errors = [];
  window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) {
    window.__errors.push('unhandled: ' + String((e.reason && e.reason.message) || e.reason));
  });

  async function main() {
    var run = withChats ? chatTests : tests;
    if (withChats) document.body.style.width = '1000px';
    try {
      AgentUI.mount(document.getElementById('assistantMount'), {
        t: window.__fakeT,
        scope: 'project',
        standalone: true,
        initiallyOpen: true,
        chatList: withChats ? { key: 'e2e', storage: memoryStorage() } : null
      });
    } catch (err) {
      log('FAIL mount: ' + err.message);
      log('E2E DONE pass=0 fail=1');
      return;
    }
    // ?manual → just mount the panel (for looking at it / poking by hand)
    if (/[?&]manual\b/.test(location.search)) {
      report.textContent = 'manual mode';
      return;
    }
    for (var i = 0; i < run.length; i++) {
      try {
        await run[i].fn();
        pass++;
        log('PASS ' + run[i].name);
      } catch (err) {
        fail++;
        log('FAIL ' + run[i].name + ': ' + err.message);
      }
    }
    log('E2E DONE pass=' + pass + ' fail=' + fail);
  }
  window.addEventListener('load', function () { setTimeout(main, 300); });
})();
