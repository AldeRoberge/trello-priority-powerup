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
      new KeyboardEvent('keydown', Object.assign({ key: k, code: 'Digit' + k, bubbles: true, cancelable: true }, opts || {}))
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
    assert(nums.join(',') === '1,2,3', 'badges ' + nums.join(','));
    key('2');
    await waitFor(function () { return userTexts().indexOf('Bravo') !== -1; }, 'Bravo sent');
    await settle();
  });

  test('digit is ignored while typing a message in the composer', async function () {
    typeAndSend('[chips] encore');
    await settle();
    await waitFor(function () { return $$('.agent-suggestion-chip').length === 3; }, 'chips');
    var input = $('.agent-composer-input');
    input.value = 'du texte';
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: '1', code: 'Digit1', bubbles: true, cancelable: true })
    );
    await sleep(200);
    assert(userTexts().indexOf('Alpha') === -1, 'Alpha must not be sent');
    input.value = '';
    // Alt+digit always works, even from the composer
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: '3', code: 'Digit3', altKey: true, bubbles: true, cancelable: true })
    );
    await waitFor(function () { return userTexts().indexOf('Charlie') !== -1; }, 'Charlie via Alt+3');
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

  test('no console errors were raised', async function () {
    assert(!window.__errors.length, 'errors: ' + window.__errors.join(' | '));
  });

  window.__errors = [];
  window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) {
    window.__errors.push('unhandled: ' + String((e.reason && e.reason.message) || e.reason));
  });

  async function main() {
    try {
      AgentUI.mount(document.getElementById('assistantMount'), {
        t: window.__fakeT,
        scope: 'project',
        standalone: true,
        initiallyOpen: true
      });
    } catch (err) {
      log('FAIL mount: ' + err.message);
      log('E2E DONE pass=0 fail=1');
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
    }
    log('E2E DONE pass=' + pass + ' fail=' + fail);
  }
  window.addEventListener('load', function () { setTimeout(main, 300); });
})();
