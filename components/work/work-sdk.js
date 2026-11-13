/*
 * Role: stand-in for https://p.trellocdn.com/power-up.min.js on https://alderoberge.com/work.
 * The views are unchanged: they call TrelloPowerUp.iframe() and get a client `t`. Here the client does
 * not talk to a Trello host window but to the Worker:
 *   - plugin data (t.get / t.set / t.getAll) is kept in memory and loaded once in one request, so a read
 *     never waits for the network; writes update memory first and are sent in order in the background;
 *   - t.board / t.lists / t.cards / t.card ... go to POST /work/api/rpc (answered from Trello, cached 20 s);
 *   - REST calls to https://api.trello.com/1/... are rewritten to /work/api/trello/1/... (the Worker adds
 *     the key and token, so the browser never holds them);
 *   - t.modal / t.popup / t.alert / t.showCard are drawn by this window (the top one), like Trello's host.
 * The Worker injects window.__WORK__ = { board, member, user } before this file.
 * Browser only. Exposes window.TrelloPowerUp (same shape as the real SDK for what the app uses).
 */
(function () {
  'use strict';
  var CFG = window.__WORK__ || { board: '', member: '', user: null };
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var REST_BASE = 'https://api.trello.com/1/';
  var API = '/work/api/';
  var COLOR_KEY = 'trello-priority-powerup/color-mode';

  function topWindow() {
    try {
      void window.top.document;
      return window.top;
    } catch (e) {
      return window;
    }
  }
  var TOP = topWindow();
  var DOC = TOP.document;
  // One state per tab, shared by the page and the modals it opens (same origin).
  var STATE = TOP.__workState || (TOP.__workState = { data: null, ready: null, since: 0, writes: Promise.resolve(), reads: {}, calls: [] });

  function theme() {
    try {
      var m = localStorage.getItem(COLOR_KEY);
      if (m === 'dark' || m === 'light') return m;
    } catch (e) { /* storage blocked */ }
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /* ── REST rewrite ────────────────────────────────────────────────────── */
  function rewrite(url) {
    return typeof url === 'string' && url.indexOf(REST_BASE) === 0 ? API + 'trello/1/' + url.slice(REST_BASE.length) : url;
  }
  function isWrite(method) {
    method = String(method || 'GET').toUpperCase();
    return method !== 'GET' && method !== 'HEAD';
  }
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : input && input.url;
      if (typeof url === 'string' && url.indexOf(REST_BASE) === 0) {
        var method = (init && init.method) || (input && input.method) || 'GET';
        if (isWrite(method)) STATE.reads = {}; // what was read may have changed
        var target = rewrite(url);
        var p = typeof input === 'string' ? nativeFetch(target, init) : nativeFetch(new Request(target, input), init);
        return p.then(function (res) {
          if (res.status === 401 && target.indexOf(API) === 0) signedOut();
          return res;
        });
      }
      return nativeFetch(input, init);
    };
  }
  var xhrOpen = window.XMLHttpRequest && XMLHttpRequest.prototype.open;
  if (xhrOpen) {
    XMLHttpRequest.prototype.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments);
      args[1] = rewrite(String(url));
      if (isWrite(method)) STATE.reads = {};
      return xhrOpen.apply(this, args);
    };
  }

  function signedOut() {
    if (TOP.__workSignedOut) return;
    TOP.__workSignedOut = true;
    TOP.location.assign('/work/');
  }

  function api(path, init) {
    return nativeFetch(API + path, Object.assign({ credentials: 'same-origin' }, init || {})).then(function (res) {
      if (res.status === 401) {
        signedOut();
        throw new Error('Session expirée');
      }
      return res.json().then(function (body) {
        if (!res.ok) throw new Error((body && body.error) || 'http-' + res.status);
        return body;
      });
    });
  }
  function post(path, body) {
    return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  /* ── plugin data, in memory ──────────────────────────────────────────── */
  function bucketKey(scope, visibility, ctx) {
    var key;
    if (scope === 'board') key = 'board:' + ctx.board;
    else if (scope === 'member') key = 'member:' + ctx.member;
    else if (scope === 'organization') key = 'organization:o';
    else if (scope === 'card') key = 'card:' + (ctx.card || '');
    else key = 'card:' + scope;
    return visibility === 'private' ? key + '|private' : key + '|shared';
  }
  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }
  function loadData() {
    if (STATE.ready) return STATE.ready;
    STATE.ready = api('data').then(function (r) {
      STATE.data = r.buckets || {};
      pointSheetAtThisSite();
      STATE.since = r.now || Date.now();
    });
    STATE.ready.catch(function () { STATE.ready = null; });
    return STATE.ready;
  }
  // Start now: the page script asks for data a moment later and finds it already on its way.
  if (CFG.board) loadData().catch(function () { /* the first t.get reports it */ });

  /** The Sheet sync is reached through this site (the session replaces the shared secret), whatever URL was saved. */
  function pointSheetAtThisSite() {
    var url = location.origin + '/work/api/sheet';
    var shared = STATE.data['board:' + CFG.board + '|shared'];
    var priv = STATE.data['board:' + CFG.board + '|private'] = STATE.data['board:' + CFG.board + '|private'] || {};
    if (shared && shared.googleSheetsSettings) shared.googleSheetsSettings.workerUrl = url;
    priv.googleSheetsSecretUrl = url;
    priv.googleSheetsSecret = 'work-session';
  }

  /** Merges what changed elsewhere (another tab, the Sheet sync) when the tab comes back. */
  function catchUp() {
    if (!STATE.data) return;
    api('changes?since=' + STATE.since).then(function (r) {
      STATE.since = r.now || STATE.since;
      (r.changes || []).forEach(function (c) {
        STATE.data[c.bucket] = STATE.data[c.bucket] || {};
        STATE.data[c.bucket][c.key] = c.value;
      });
      pointSheetAtThisSite();
    }).catch(function () { /* next time */ });
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) catchUp();
  });

  function queueWrite(method, args, ctx) {
    var run = function () { return post('rpc', { method: method, args: args, ctx: ctx }); };
    STATE.writes = STATE.writes.then(run, run);
    return STATE.writes.then(function (r) {
      if (r && r.error) throw Object.assign(new Error(r.error.message), { name: r.error.name || 'Error' });
      return null;
    });
  }

  /* ── Host: modals, popups, alerts (drawn by the top window) ───────────── */
  var HOST_CSS =
    '.wk-backdrop{position:fixed;inset:0;background:rgba(9,30,66,.54);z-index:2147483000;display:flex;align-items:center;justify-content:center}' +
    '.wk-modal{background:#fff;color:#172b4d;border-radius:8px;box-shadow:0 8px 24px rgba(9,30,66,.4);display:flex;flex-direction:column;overflow:hidden;max-width:100vw;max-height:100vh}' +
    '.wk-modal.wk-full{width:min(1400px,calc(100vw - 32px));height:calc(100vh - 32px)}' +
    '.wk-head{display:flex;align-items:center;justify-content:space-between;padding:6px 6px 6px 16px;font:600 14px system-ui,sans-serif;background:#22272b;color:#fff}' +
    '.wk-x{background:transparent;border:0;color:inherit;font-size:20px;line-height:1;cursor:pointer;padding:4px 8px;border-radius:4px}' +
    '.wk-x:hover{background:rgba(255,255,255,.14)}' +
    '.wk-modal iframe{border:0;flex:1;width:100%;min-height:0;background:#fff}' +
    'html[data-color-mode="dark"] .wk-modal iframe{background:#1d2125}' +
    '.wk-pop{position:fixed;z-index:2147483100;background:#fff;color:#172b4d;border-radius:8px;box-shadow:0 8px 16px rgba(9,30,66,.25);width:304px;font:14px system-ui,sans-serif;overflow:hidden}' +
    '.wk-pop h4{margin:0;padding:10px 12px;font-size:14px;border-bottom:1px solid #dfe1e6;display:flex;justify-content:space-between}' +
    '.wk-pop button.wk-item{display:block;width:100%;text-align:left;padding:8px 12px;border:0;background:none;cursor:pointer;font:inherit}' +
    '.wk-pop button.wk-item:hover{background:#f1f2f4}.wk-pop iframe{border:0;width:100%;display:block}' +
    '.wk-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#172b4d;color:#fff;padding:10px 16px;border-radius:6px;z-index:2147483200;font:14px system-ui,sans-serif}';

  function Host() {
    this.modal = null;
    this.popup = null;
  }
  Host.prototype.ensureStyle = function () {
    if (DOC.getElementById('wk-host-css')) return;
    var s = DOC.createElement('style');
    s.id = 'wk-host-css';
    s.textContent = HOST_CSS;
    DOC.head.appendChild(s);
  };
  Host.prototype.frameName = function (opts, kind) {
    return 'work-t:' + JSON.stringify({ args: opts.args || {}, ctx: opts.ctx || {}, fullscreen: !!opts.fullscreen, kind: kind });
  };
  Host.prototype.openModal = function (opts) {
    this.ensureStyle();
    this.closeModal(true);
    var self = this;
    var back = DOC.createElement('div');
    back.className = 'wk-backdrop';
    var box = DOC.createElement('div');
    box.className = 'wk-modal' + (opts.fullscreen ? ' wk-full' : '');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', opts.title || 'Modal');
    if (!opts.fullscreen) {
      box.style.width = 'min(768px, 100vw)';
      box.style.height = Math.min(opts.height || 600, TOP.innerHeight - 16) + 'px';
    }
    var head = DOC.createElement('div');
    head.className = 'wk-head';
    var title = DOC.createElement('span');
    title.textContent = opts.title || '';
    var x = DOC.createElement('button');
    x.className = 'wk-x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Fermer');
    x.textContent = '×';
    x.addEventListener('click', function () { self.closeModal(false); });
    head.appendChild(title);
    head.appendChild(x);
    var frame = DOC.createElement('iframe');
    frame.setAttribute('title', opts.title || 'modal');
    frame.name = this.frameName(opts, 'modal');
    frame.src = opts.url;
    box.appendChild(head);
    box.appendChild(frame);
    back.appendChild(box);
    back.addEventListener('mousedown', function (e) { if (e.target === back) self.closeModal(false); });
    DOC.body.appendChild(back);
    this.modal = { el: back, titleEl: title, callback: opts.callback };
    return Promise.resolve();
  };
  Host.prototype.closeModal = function (silent) {
    var m = this.modal;
    if (!m) return Promise.resolve();
    this.modal = null;
    if (m.el.parentNode) m.el.parentNode.removeChild(m.el);
    if (!silent && typeof m.callback === 'function') {
      try { m.callback(); } catch (e) { console.error('modal callback failed', e); }
    }
    return Promise.resolve();
  };
  Host.prototype.openPopup = function (opts, makeClient) {
    this.ensureStyle();
    this.closePopup();
    var self = this;
    var pop = DOC.createElement('div');
    pop.className = 'wk-pop';
    var h = DOC.createElement('h4');
    h.textContent = opts.title || '';
    var x = DOC.createElement('button');
    x.className = 'wk-x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Fermer');
    x.textContent = '×';
    x.style.color = 'inherit';
    x.addEventListener('click', function () { self.closePopup(); });
    h.appendChild(x);
    pop.appendChild(h);
    if (opts.url) {
      var f = DOC.createElement('iframe');
      f.name = this.frameName(opts, 'popup');
      f.src = opts.url;
      f.style.height = (opts.height || 200) + 'px';
      pop.appendChild(f);
    } else if (opts.items) {
      opts.items.forEach(function (item) {
        var b = DOC.createElement('button');
        b.type = 'button';
        b.className = 'wk-item';
        b.textContent = item.text || '';
        b.addEventListener('click', function () {
          if (typeof item.callback === 'function') item.callback(makeClient(), opts);
        });
        pop.appendChild(b);
      });
    } else if (opts.type === 'confirm') {
      var msg = DOC.createElement('p');
      msg.style.cssText = 'margin:0;padding:12px';
      msg.textContent = opts.message || '';
      pop.appendChild(msg);
      var ok = DOC.createElement('button');
      ok.type = 'button';
      ok.className = 'wk-item';
      ok.textContent = opts.confirmText || 'Confirmer';
      ok.addEventListener('click', function () {
        self.closePopup();
        if (typeof opts.onConfirm === 'function') opts.onConfirm(makeClient());
      });
      pop.appendChild(ok);
    }
    var rect = opts.element && opts.element.getBoundingClientRect ? opts.element.getBoundingClientRect() : null;
    pop.style.left = Math.max(8, Math.min(TOP.innerWidth - 312, rect ? rect.left : TOP.innerWidth / 2 - 152)) + 'px';
    pop.style.top = Math.max(8, rect ? rect.bottom + 4 : 80) + 'px';
    DOC.body.appendChild(pop);
    this.popup = { el: pop };
    return Promise.resolve();
  };
  Host.prototype.closePopup = function () {
    if (this.popup && this.popup.el.parentNode) this.popup.el.parentNode.removeChild(this.popup.el);
    this.popup = null;
    return Promise.resolve();
  };
  Host.prototype.alert = function (opts) {
    this.ensureStyle();
    var el = DOC.createElement('div');
    el.className = 'wk-toast';
    el.setAttribute('role', 'status');
    el.textContent = (opts && opts.message) || '';
    DOC.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, (opts && opts.duration ? opts.duration : 4) * 1000);
    return Promise.resolve();
  };
  function getHost() {
    if (!TOP.__workHost) TOP.__workHost = new Host();
    return TOP.__workHost;
  }
  if (TOP === window) getHost(); // built by the top page, so it outlives any modal
  function hostCall(name, args) {
    var h = getHost();
    if (TOP === window) return h[name].apply(h, args);
    return h[name].apply(h, args);
  }

  /* ── client (what TrelloPowerUp.iframe() returns) ────────────────────── */
  function frameSetup() {
    if (typeof window.name === 'string' && window.name.indexOf('work-t:') === 0) {
      try { return JSON.parse(window.name.slice(7)); } catch (e) { /* fall through */ }
    }
    var q = new URLSearchParams(location.search);
    var card = q.get('__card');
    try {
      if (card) sessionStorage.setItem('work.card', card);
      else card = sessionStorage.getItem('work.card');
    } catch (e) { /* storage blocked */ }
    // A page opened directly is a full-screen view, like the modals Trello opens for the views.
    return { args: {}, ctx: { card: card || null }, fullscreen: true, kind: 'page' };
  }

  function makeClient(setup) {
    setup = setup || {};
    var ctx = Object.assign({ board: CFG.board, member: CFG.member, card: null, list: null }, setup.ctx || {});
    var args = setup.args || {};
    var base = setup.base || location.href;
    var themeListeners = [];
    var t = {};

    // The real client returns Bluebird promises: t.card('id').get('id'), .spread(), .tap().
    function chain(p) {
      p.get = function (key) { return chain(p.then(function (v) { return v == null ? v : v[key]; })); };
      p.spread = function (fn) { return chain(p.then(function (v) { return fn.apply(null, v); })); };
      p.tap = function (fn) { return chain(p.then(function (v) { return Promise.resolve(fn(v)).then(function () { return v; }); })); };
      return p;
    }
    function remote(name) {
      return function () {
        var a = Array.prototype.slice.call(arguments);
        var cacheable = ['board', 'lists', 'cards', 'card', 'list', 'member', 'organization'].indexOf(name) >= 0;
        var key = cacheable ? name + JSON.stringify([a, ctx.card, ctx.list]) : '';
        if (cacheable && STATE.reads[key]) return chain(STATE.reads[key].then(clone));
        var p = post('rpc', { method: name, args: a, ctx: ctx }).then(function (r) {
          if (r.error) throw Object.assign(new Error(r.error.message), { name: r.error.name || 'Error' });
          return r.result;
        });
        if (cacheable) {
          STATE.reads[key] = p;
          // Short on purpose: another tab or the Sheet may change the board.
          setTimeout(function () { if (STATE.reads[key] === p) delete STATE.reads[key]; }, 3000);
          p.catch(function () { if (STATE.reads[key] === p) delete STATE.reads[key]; });
          return chain(p.then(clone));
        }
        return chain(p);
      };
    }
    ['board', 'lists', 'cards', 'card', 'list', 'member', 'organization', 'isMemberSignedIn', 'memberCanWriteToModel'].forEach(function (name) {
      t[name] = remote(name);
    });

    t.get = function (scope, visibility, key, def) {
      return chain(loadData().then(function () {
        var b = STATE.data[bucketKey(scope, visibility, ctx)];
        var v = b && Object.prototype.hasOwnProperty.call(b, key) ? b[key] : undefined;
        return clone(v === undefined ? (def === undefined ? null : def) : v);
      }));
    };
    t.set = function (scope, visibility, key, value) {
      var values = key && typeof key === 'object' ? key : (function () { var o = {}; o[key] = value; return o; })();
      return chain(loadData().then(function () {
        var bk = bucketKey(scope, visibility, ctx);
        var b = STATE.data[bk] = STATE.data[bk] || {};
        Object.keys(values).forEach(function (k) {
          if (values[k] === undefined || values[k] === null) delete b[k];
          else b[k] = clone(values[k]);
        });
        return queueWrite('set', [scope, visibility, values], ctx);
      }));
    };
    t.remove = function (scope, visibility, keys) {
      return chain(loadData().then(function () {
        var bk = bucketKey(scope, visibility, ctx);
        var b = STATE.data[bk];
        [].concat(keys).forEach(function (k) { if (b) delete b[k]; });
        return queueWrite('remove', [scope, visibility, keys], ctx);
      }));
    };
    t.getAll = function () {
      return chain(loadData().then(function () {
        var out = {};
        ['board', 'card', 'member'].forEach(function (scope) {
          ['shared', 'private'].forEach(function (vis) {
            var b = STATE.data[bucketKey(scope, vis, ctx)];
            if (b && Object.keys(b).length) (out[scope] = out[scope] || {})[vis] = clone(b);
          });
        });
        return out;
      }));
    };
    t.loadSecret = function (key) { return chain(post('rpc', { method: 'loadSecret', args: [key], ctx: ctx }).then(function (r) { return r.result; })); };
    t.storeSecret = function (key, value) { return chain(post('rpc', { method: 'storeSecret', args: [key, value], ctx: ctx }).then(function () { return null; })); };

    t.getContext = function () {
      var c = { board: ctx.board, member: ctx.member, card: ctx.card, list: ctx.list, theme: theme(), initialTheme: theme(), locale: 'fr', permissions: { board: 'write', card: 'write', organization: 'write' } };
      if (setup.fullscreen) c.fullscreen = true;
      return c;
    };
    t.arg = function (key) { return args[key]; };
    t.args = args;
    t.render = function (fn) {
      setTimeout(function () {
        try {
          var r = fn();
          if (r && typeof r.then === 'function') r.then(null, function (e) { console.error('t.render callback rejected', e); });
        } catch (e) {
          console.error('t.render callback threw', e);
        }
      }, 0);
    };
    t.sizeTo = function () { return Promise.resolve(); };
    t.subscribeToThemeChanges = function (fn) { themeListeners.push(fn); };
    t.signUrl = function (url) { return new URL(url, base).href; };
    t.localizeKey = function (key) { return key; };
    t.localizeKeys = function () { return {}; };
    t.notifyParent = function () { return Promise.resolve(); };
    t.hideAlert = function () { return Promise.resolve(); };
    t.closeBoardBar = function () { return Promise.resolve(); };
    t.hideCard = function () { return hostCall('closeModal', [false]); };
    t.updateModal = function (o) {
      var m = getHost().modal;
      if (m && o && o.title) m.titleEl.textContent = o.title;
      return Promise.resolve();
    };

    t.modal = function (opts) {
      opts = Object.assign({}, opts);
      opts.url = new URL(opts.url, base).href;
      opts.ctx = ctx;
      return hostCall('openModal', [opts]);
    };
    t.closeModal = function () { return hostCall('closeModal', [false]); };
    t.popup = function (opts) {
      opts = Object.assign({}, opts);
      if (opts.url) opts.url = new URL(opts.url, base).href;
      opts.ctx = ctx;
      return hostCall('openPopup', [opts, function () { return makeClient({ ctx: ctx, args: args, base: base }); }]);
    };
    t.closePopup = function () { return hostCall('closePopup', []); };
    t.alert = function (opts) { return hostCall('alert', [opts]); };
    // The card back is the task page, in a full-screen modal over the current view.
    t.showCard = function (id) {
      var open = function (name) {
        return hostCall('openModal', [{ title: name || '', url: new URL('./popup.html', base).href, fullscreen: true, args: { cardName: name || '', openSection: 'priority' }, ctx: Object.assign({}, ctx, { card: id }) }]);
      };
      return t.cards('id', 'name').then(function (all) {
        var c = (all || []).filter(function (x) { return x.id === id; })[0];
        return open(c && c.name);
      }, function () { return open(''); });
    };
    t.navigate = function (opts) {
      if (opts && opts.url) TOP.open(opts.url, '_blank', 'noopener');
      return Promise.resolve();
    };

    // REST: the Worker holds the token, the page only needs to believe it is signed in.
    var restApi = {
      isAuthorized: function () { return Promise.resolve(true); },
      getToken: function () { return Promise.resolve('work-session'); },
      authorize: function () { return Promise.resolve('work-session'); },
      clearToken: function () { return Promise.resolve(); },
      storeToken: function () { return Promise.resolve(); },
    };
    t.getRestApi = function () { return restApi; };
    t.authorize = function () { return Promise.resolve('work-session'); };
    t.__setTheme = function (th) { themeListeners.forEach(function (fn) { fn(th); }); };
    return t;
  }

  function AuthDeniedError() {
    var e = new Error('Authorization denied');
    e.name = 'AuthDeniedError';
    return e;
  }

  var sdk = {
    iframe: function () {
      var t = makeClient(frameSetup());
      window.__workClient = t;
      return t;
    },
    // The connector (index.html) is not used here: the views are opened directly.
    initialize: function () {},
    util: { relativeUrl: function (path) { return new URL(path, location.href).href; } },
    restApiError: { AuthDeniedError: AuthDeniedError, InvalidTokenError: AuthDeniedError },
    Promise: Promise,
    __work: true,
  };
  // power-up.min.js, if some page still loads it, must not replace the stand-in.
  try {
    Object.defineProperty(window, 'TrelloPowerUp', { configurable: true, get: function () { return sdk; }, set: function () { /* ignored */ } });
  } catch (e) {
    window.TrelloPowerUp = sdk;
  }
})();
