/*
 * Stand-in for https://p.trellocdn.com/power-up.min.js, served by e2e/fake-trello/server.js in its
 * place. Data calls (t.get, t.cards, ...) go to the fake Trello in Node over /__fake/rpc, REST calls
 * to https://api.trello.com/1/... are rewritten to /__fake/1/..., and t.modal / t.popup / t.alert are
 * drawn by a small host (Host below) in the top window, like Trello's board does.
 *
 * Read by the server, which prepends `window.__FAKE_TRELLO__ = { board, member, theme, authorized, token }`.
 * Calls to real SDK methods that are not implemented here are reported to the server (a "gap").
 * Test hooks on the top window: __fakeCalls (every host call), __fakeAlerts, __fakeCapabilities.
 */
(function () {
  'use strict';
  var CFG = window.__FAKE_TRELLO__ || { board: 'b1', member: 'm1', theme: 'light', authorized: true, token: 'fake-token' };
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var REST_BASE = 'https://api.trello.com/1/';

  /* ── REST rewrite ────────────────────────────────────────────────────── */
  function rewrite(url) {
    return typeof url === 'string' && url.indexOf(REST_BASE) === 0 ? '/__fake/1/' + url.slice(REST_BASE.length) : url;
  }
  if (nativeFetch) {
    window.fetch = function (input, init) {
      if (typeof input === 'string') return nativeFetch(rewrite(input), init);
      if (input && typeof input.url === 'string' && input.url.indexOf(REST_BASE) === 0) {
        return nativeFetch(new Request(rewrite(input.url), input), init);
      }
      return nativeFetch(input, init);
    };
  }
  var xhrOpen = window.XMLHttpRequest && XMLHttpRequest.prototype.open;
  if (xhrOpen) {
    XMLHttpRequest.prototype.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments);
      args[1] = rewrite(String(url));
      return xhrOpen.apply(this, args);
    };
  }

  function postJson(path, body) {
    return nativeFetch('/__fake' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
      return r.json();
    });
  }
  function reportGap(what) {
    try {
      postJson('/gap', { what: what, page: location.pathname });
    } catch (e) { /* ignore */ }
  }

  /* ── Host: modals, popups, alerts (lives in the top window) ──────────── */
  var HOST_CSS =
    '.fk-backdrop{position:fixed;inset:0;background:rgba(9,30,66,.54);z-index:2147483000;display:flex;align-items:center;justify-content:center}' +
    '.fk-modal{background:#fff;color:#172b4d;border-radius:8px;box-shadow:0 8px 24px rgba(9,30,66,.4);display:flex;flex-direction:column;overflow:hidden;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px)}' +
    '.fk-modal.fk-full{width:calc(100vw - 48px);height:calc(100vh - 48px)}' +
    '.fk-head{display:flex;align-items:center;justify-content:space-between;padding:8px 8px 8px 16px;font:600 14px system-ui,sans-serif;background:#22272b;color:#fff}' +
    '.fk-x{background:transparent;border:0;color:inherit;font-size:20px;line-height:1;cursor:pointer;padding:4px 8px}' +
    '.fk-modal iframe{border:0;flex:1;width:100%;min-height:0;background:#fff}' +
    '.fk-pop{position:fixed;z-index:2147483100;background:#fff;color:#172b4d;border-radius:8px;box-shadow:0 8px 16px rgba(9,30,66,.25);width:304px;font:14px system-ui,sans-serif;overflow:hidden}' +
    '.fk-pop h4{margin:0;padding:10px 12px;font-size:14px;border-bottom:1px solid #dfe1e6;display:flex;justify-content:space-between}' +
    '.fk-pop button.fk-item{display:block;width:100%;text-align:left;padding:8px 12px;border:0;background:none;cursor:pointer;font:inherit}' +
    '.fk-pop button.fk-item:hover{background:#f1f2f4}.fk-pop iframe{border:0;width:100%;display:block}' +
    '.fk-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#172b4d;color:#fff;padding:10px 16px;border-radius:6px;z-index:2147483200;font:14px system-ui,sans-serif}';

  function Host() {
    this.calls = [];
    this.modal = null;
    this.popup = null;
    this.alerts = [];
  }
  Host.prototype.record = function (name, arg) {
    this.calls.push({ name: name, arg: arg });
  };
  Host.prototype.ensureStyle = function () {
    if (document.getElementById('fk-host-css')) return;
    var s = document.createElement('style');
    s.id = 'fk-host-css';
    s.textContent = HOST_CSS;
    document.head.appendChild(s);
  };
  Host.prototype.frameName = function (opts, extra) {
    var payload = { args: opts.args || {}, ctx: opts.ctx || {}, fullscreen: !!extra.fullscreen, kind: extra.kind };
    return 'fake-t:' + JSON.stringify(payload);
  };
  Host.prototype.openModal = function (opts, from) {
    this.record('modal', { title: opts.title, url: opts.url, fullscreen: !!opts.fullscreen, args: opts.args });
    this.ensureStyle();
    this.closeModal(true);
    var self = this;
    var back = document.createElement('div');
    back.className = 'fk-backdrop';
    back.setAttribute('data-fake-modal', '');
    var box = document.createElement('div');
    box.className = 'fk-modal' + (opts.fullscreen ? ' fk-full' : '');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', opts.title || 'Modal');
    if (!opts.fullscreen) {
      box.style.width = '768px';
      box.style.height = (opts.height || 600) + 'px';
    }
    var head = document.createElement('div');
    head.className = 'fk-head';
    var title = document.createElement('span');
    title.textContent = opts.title || '';
    title.className = 'fk-title';
    var x = document.createElement('button');
    x.className = 'fk-x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Fermer');
    x.textContent = '×';
    x.addEventListener('click', function () {
      self.closeModal(false);
    });
    head.appendChild(title);
    head.appendChild(x);
    var frame = document.createElement('iframe');
    frame.setAttribute('title', opts.title || 'modal');
    frame.name = this.frameName(opts, { fullscreen: opts.fullscreen, kind: 'modal' });
    frame.src = opts.url;
    box.appendChild(head);
    box.appendChild(frame);
    back.appendChild(box);
    document.body.appendChild(back);
    this.modal = { el: back, frame: frame, titleEl: title, callback: opts.callback };
    return Promise.resolve();
  };
  Host.prototype.closeModal = function (silent) {
    var m = this.modal;
    if (!m) return Promise.resolve();
    this.modal = null;
    if (m.el.parentNode) m.el.parentNode.removeChild(m.el);
    if (!silent && typeof m.callback === 'function') {
      try {
        m.callback();
      } catch (e) {
        console.error('fake modal callback failed', e);
      }
    }
    return Promise.resolve();
  };
  Host.prototype.openPopup = function (opts, from, makeClient) {
    this.record('popup', { title: opts.title, url: opts.url, items: opts.items && opts.items.length, type: opts.type });
    this.ensureStyle();
    this.closePopup();
    var pop = document.createElement('div');
    pop.className = 'fk-pop';
    pop.setAttribute('data-fake-popup', '');
    var h = document.createElement('h4');
    h.textContent = opts.title || '';
    var x = document.createElement('button');
    x.className = 'fk-x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Fermer');
    x.textContent = '×';
    var self = this;
    x.addEventListener('click', function () {
      self.closePopup();
    });
    h.appendChild(x);
    pop.appendChild(h);
    if (opts.url) {
      var f = document.createElement('iframe');
      f.name = this.frameName(opts, { kind: 'popup' });
      f.src = opts.url;
      f.style.height = (opts.height || 200) + 'px';
      pop.appendChild(f);
    } else if (opts.items) {
      opts.items.forEach(function (item) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'fk-item';
        b.textContent = item.text || '';
        b.addEventListener('click', function () {
          if (typeof item.callback === 'function') item.callback(makeClient ? makeClient() : null, opts);
        });
        pop.appendChild(b);
      });
    } else if (opts.type === 'confirm') {
      var msg = document.createElement('p');
      msg.style.cssText = 'margin:0;padding:12px';
      msg.textContent = opts.message || '';
      pop.appendChild(msg);
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'fk-item';
      ok.textContent = opts.confirmText || 'Confirmer';
      ok.addEventListener('click', function () {
        self.closePopup();
        if (typeof opts.onConfirm === 'function') opts.onConfirm(makeClient ? makeClient() : null);
      });
      pop.appendChild(ok);
    }
    var rect = opts.element && opts.element.getBoundingClientRect ? opts.element.getBoundingClientRect() : null;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 312, rect ? rect.left : window.innerWidth / 2 - 152)) + 'px';
    pop.style.top = Math.max(8, rect ? rect.bottom + 4 : 80) + 'px';
    document.body.appendChild(pop);
    this.popup = { el: pop };
    return Promise.resolve();
  };
  Host.prototype.closePopup = function () {
    if (this.popup && this.popup.el.parentNode) this.popup.el.parentNode.removeChild(this.popup.el);
    this.popup = null;
    return Promise.resolve();
  };
  Host.prototype.alert = function (opts) {
    this.record('alert', opts);
    this.alerts.push(opts);
    this.ensureStyle();
    var el = document.createElement('div');
    el.className = 'fk-toast';
    el.setAttribute('role', 'status');
    el.textContent = (opts && opts.message) || '';
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, (opts && opts.duration ? opts.duration : 4) * 1000);
    return Promise.resolve();
  };
  Host.prototype.showCard = function (id) {
    this.record('showCard', id);
    return Promise.resolve();
  };

  function topWindow() {
    try {
      return window.top;
    } catch (e) {
      return window;
    }
  }
  function getHost() {
    var top = topWindow();
    if (!top.__fakeHost) {
      top.__fakeHost = new Host();
      top.__fakeCalls = top.__fakeHost.calls;
      top.__fakeAlerts = top.__fakeHost.alerts;
    }
    return top.__fakeHost;
  }

  /* ── client (what TrelloPowerUp.iframe() returns) ────────────────────── */
  function frameSetup() {
    if (typeof window.name === 'string' && window.name.indexOf('fake-t:') === 0) {
      try {
        return JSON.parse(window.name.slice(7));
      } catch (e) { /* fall through */ }
    }
    var q = new URLSearchParams(location.search);
    return { args: {}, ctx: { card: q.get('__card') || null }, fullscreen: q.get('__fullscreen') === '1', kind: 'page' };
  }

  function makeClient(setup) {
    setup = setup || {};
    var ctx = Object.assign({ board: CFG.board, member: CFG.member, card: null, list: null }, setup.ctx || {});
    var args = setup.args || {};
    var base = setup.base || location.href;
    var renderers = [];
    var themeListeners = [];
    var t = {};
    var NOT_IMPLEMENTED = ['boardBar', 'overlay', 'closeOverlay', 'attach', 'requestWithContext', 'getNavigationInfo', 'localizeNode', 'cardBackSection', 'setAll'];

    // The real client returns Bluebird promises: t.card('id').get('id'), .spread(), .tap().
    function chain(p) {
      p.get = function (key) {
        return chain(
          p.then(function (v) {
            return v == null ? v : v[key];
          })
        );
      };
      p.spread = function (fn) {
        return chain(
          p.then(function (v) {
            return fn.apply(null, v);
          })
        );
      };
      p.tap = function (fn) {
        return chain(
          p.then(function (v) {
            return Promise.resolve(fn(v)).then(function () {
              return v;
            });
          })
        );
      };
      return p;
    }
    function data(name) {
      return function () {
        var a = Array.prototype.slice.call(arguments);
        return chain(
          postJson('/rpc', { method: name, args: a, ctx: ctx }).then(function (r) {
            if (r.error) {
              var e = new Error(r.error.message);
              e.name = r.error.name || 'Error';
              throw e;
            }
            return r.result;
          })
        );
      };
    }
    ['get', 'set', 'remove', 'getAll', 'board', 'lists', 'cards', 'card', 'list', 'member', 'organization', 'isMemberSignedIn', 'memberCanWriteToModel', 'loadSecret', 'storeSecret'].forEach(function (name) {
      t[name] = data(name);
    });
    NOT_IMPLEMENTED.forEach(function (name) {
      t[name] = function () {
        reportGap('t.' + name + '()');
        return Promise.reject(new Error('Fake Trello does not implement t.' + name + '()'));
      };
    });

    t.getContext = function () {
      var c = { board: ctx.board, member: ctx.member, card: ctx.card, list: ctx.list, theme: CFG.theme, initialTheme: CFG.theme, locale: 'fr', permissions: { board: 'write', card: 'write', organization: 'write' } };
      if (setup.fullscreen) c.fullscreen = true;
      return c;
    };
    t.arg = function (key) {
      return args[key];
    };
    t.args = args;
    t.render = function (fn) {
      renderers.push(fn);
      setTimeout(function () {
        try {
          var r = fn();
          if (r && typeof r.then === 'function') r.then(null, function (e) { console.error('t.render callback rejected', e); });
        } catch (e) {
          console.error('t.render callback threw', e);
        }
      }, 0);
    };
    t.sizeTo = function () {
      return Promise.resolve();
    };
    t.subscribeToThemeChanges = function (fn) {
      themeListeners.push(fn);
    };
    t.signUrl = function (url) {
      return new URL(url, base).href;
    };
    t.localizeKey = function (key) {
      return key;
    };
    t.localizeKeys = function () {
      return {};
    };
    t.notifyParent = function () {
      return Promise.resolve();
    };
    t.hideAlert = function () {
      return Promise.resolve();
    };
    t.closeBoardBar = function () {
      return Promise.resolve();
    };
    t.hideCard = function () {
      getHost().record('hideCard');
      return Promise.resolve();
    };
    t.updateModal = function (o) {
      var m = getHost().modal;
      if (m && o && o.title) m.titleEl.textContent = o.title;
      return Promise.resolve();
    };

    // Host UI (always drawn by the top window).
    t.modal = function (opts) {
      opts = Object.assign({}, opts);
      opts.url = new URL(opts.url, base).href;
      opts.ctx = ctx; // a modal opened from a card keeps that card as its context
      return getHost().openModal(opts, window);
    };
    t.closeModal = function () {
      return getHost().closeModal(false);
    };
    t.popup = function (opts) {
      opts = Object.assign({}, opts);
      if (opts.url) opts.url = new URL(opts.url, base).href;
      opts.ctx = ctx;
      return getHost().openPopup(opts, window, function () {
        return makeClient({ ctx: ctx, args: args, base: base });
      });
    };
    t.closePopup = function () {
      return getHost().closePopup();
    };
    t.alert = function (opts) {
      return getHost().alert(opts);
    };
    t.showCard = function (id) {
      return getHost().showCard(id);
    };
    t.navigate = function (opts) {
      getHost().record('navigate', opts);
      return Promise.resolve();
    };

    // REST client (api.trello.com) — authorised by default, see /__fake/auth.
    var restApi = {
      isAuthorized: function () {
        return Promise.resolve(!!CFG.authorized);
      },
      getToken: function () {
        return Promise.resolve(CFG.authorized ? CFG.token : null);
      },
      authorize: function () {
        CFG.authorized = true;
        return postJson('/auth', { authorized: true }).then(function () {
          return CFG.token;
        });
      },
      clearToken: function () {
        CFG.authorized = false;
        return postJson('/auth', { authorized: false });
      },
      storeToken: function () {
        CFG.authorized = true;
        return postJson('/auth', { authorized: true });
      },
    };
    t.getRestApi = function () {
      return restApi;
    };
    t.authorize = function () {
      CFG.authorized = true;
      return postJson('/auth', { authorized: true }).then(function () {
        return CFG.token;
      });
    };
    t.__setTheme = function (theme) {
      CFG.theme = theme;
      themeListeners.forEach(function (fn) {
        fn(theme);
      });
    };
    return t;
  }

  /* ── TrelloPowerUp global ────────────────────────────────────────────── */
  function AuthDeniedError() {
    var e = new Error('Authorization denied');
    e.name = 'AuthDeniedError';
    return e;
  }

  window.TrelloPowerUp = {
    iframe: function () {
      var t = makeClient(frameSetup());
      window.__fakeClient = t;
      return t;
    },
    initialize: function (capabilities, options) {
      window.__fakeCapabilities = capabilities;
      window.__fakeInitOptions = options;
    },
    util: {
      relativeUrl: function (path) {
        return new URL(path, location.href).href;
      },
    },
    restApiError: { AuthDeniedError: AuthDeniedError, InvalidTokenError: AuthDeniedError },
    Promise: Promise,
    // fake-only: lets the fake board host build clients with a given card/list context
    __makeClient: makeClient,
    __getHost: getHost,
    __config: CFG,
  };
})();
