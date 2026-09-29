/* Mock LLM + fake Trello client for the assistant E2E harness.
 *
 * fetch() to any /chat/completions is answered here (as an SSE stream). The last
 * user message picks the behaviour:
 *   [slow]   → 1500 ms delay      [multi] → 3 chips, multi-select
 *   [chips]  → 3 chips, single    otherwise → short echo reply
 * Every request body is recorded in window.__llm.requests.
 */
(function () {
  var llm = { requests: [], delays: { slow: 1500, fast: 50 } };
  window.__llm = llm;

  function lastUser(messages) {
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return String(messages[i].content || '');
    }
    return '';
  }

  function replyFor(text) {
    var out = {
      message: 'Reçu : ' + text.replace(/\[[a-z]+\]/g, '').trim().slice(0, 60),
      actions: [],
      suggestions: [],
      followUps: []
    };
    if (/\[chips\]/.test(text)) out.suggestions = ['Alpha', 'Bravo', 'Charlie'];
    if (/\[multi\]/.test(text)) {
      out.suggestions = ['Alpha', 'Bravo', 'Charlie'];
      out.suggestionsMulti = true;
    }
    return out;
  }

  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, init) {
    if (!/chat\/completions/.test(String(url))) {
      return realFetch ? realFetch(url, init) : Promise.reject(new Error('no fetch'));
    }
    var body = {};
    try {
      body = JSON.parse((init && init.body) || '{}');
    } catch (e) { /* ignore */ }
    var messages = body.messages || [];
    var text = lastUser(messages);
    llm.requests.push({ at: Date.now(), messages: messages, text: text });
    var delay = /\[slow\]/.test(text) ? llm.delays.slow : llm.delays.fast;
    var content = JSON.stringify(replyFor(text));
    return new Promise(function (resolve) {
      setTimeout(function () {
        var enc = new TextEncoder();
        var chunk =
          'data: ' +
          JSON.stringify({
            model: body.model || 'mock',
            choices: [{ delta: { content: content }, finish_reason: null }]
          }) +
          '\n\n';
        var fin =
          'data: ' +
          JSON.stringify({
            model: body.model || 'mock',
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
          }) +
          '\n\ndata: [DONE]\n\n';
        if (body.stream) {
          var stream = new ReadableStream({
            start: function (c) {
              c.enqueue(enc.encode(chunk));
              c.enqueue(enc.encode(fin));
              c.close();
            }
          });
          resolve(
            new Response(stream, {
              status: 200,
              headers: { 'Content-Type': 'text/event-stream' }
            })
          );
        } else {
          resolve(
            new Response(
              JSON.stringify({
                model: body.model || 'mock',
                choices: [{ message: { role: 'assistant', content: content }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
        }
      }, delay);
    });
  };

  var store = {};
  window.__fakeT = {
    get: function (scope, vis, key) {
      return Promise.resolve(store[scope + '/' + vis + '/' + key]);
    },
    set: function (scope, vis, key, value) {
      store[scope + '/' + vis + '/' + key] = value;
      return Promise.resolve();
    },
    remove: function () { return Promise.resolve(); },
    getAll: function () { return Promise.resolve({}); },
    sizeTo: function () { return Promise.resolve(); },
    card: function () { return Promise.resolve({ id: 'c1', name: 'Carte test', desc: '' }); },
    board: function () { return Promise.resolve({ id: 'b1', name: 'Board' }); },
    lists: function () { return Promise.resolve([]); },
    cards: function () { return Promise.resolve([]); },
    member: function () { return Promise.resolve({ id: 'm1', fullName: 'Testeur' }); },
    getContext: function () { return { card: 'c1', board: 'b1', member: 'm1' }; },
    alert: function () { return Promise.resolve(); }
  };
  store['member/private/agentProvider'] = {
    preset: 'openai',
    baseUrl: 'https://mock.local/v1',
    model: 'mock-model',
    modelMode: 'auto',
    apiKey: 'test-key'
  };
})();
