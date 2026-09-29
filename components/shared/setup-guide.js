/* Customizable install guide (landing page, outside the Trello iframe).
 * The user edits app name / GitHub owner / repo; every placeholder in the guide
 * (data-bind / data-href-path) and the one-line setup commands follow. */
(function (global) {
  'use strict';

  var UPSTREAM = { owner: 'AldeRoberge', repo: 'trello-priority-powerup', branch: 'main' };
  var STORAGE_KEY = 'tp.setupGuide.v1';
  var LANG_KEY = 'tp.setupGuide.lang';
  var FIELDS = ['appName', 'owner', 'repo', 'author', 'appKey'];

  function str(v) {
    return typeof v === 'string' ? v.trim() : '';
  }

  /** Normalize raw form values; invalid characters are dropped, blanks fall back to defaults. */
  function clean(raw, defaults) {
    raw = raw || {};
    defaults = defaults || {};
    var owner = str(raw.owner).replace(/[^A-Za-z0-9-]/g, '') || defaults.owner || UPSTREAM.owner;
    var repo = str(raw.repo).replace(/[^A-Za-z0-9._-]/g, '') || defaults.repo || UPSTREAM.repo;
    var appKey = str(raw.appKey).toLowerCase();
    return {
      appName: str(raw.appName) || defaults.appName || 'Trello Cerveau',
      owner: owner,
      repo: repo,
      author: str(raw.author) || owner,
      appKey: /^[a-f0-9]{32}$/.test(appKey) ? appKey : '',
    };
  }

  function pagesUrl(owner, repo) {
    var host = owner.toLowerCase() + '.github.io';
    return repo.toLowerCase() === host
      ? 'https://' + host + '/'
      : 'https://' + host + '/' + repo + '/';
  }

  function rawScriptUrl(file) {
    return (
      'https://raw.githubusercontent.com/' +
      UPSTREAM.owner + '/' + UPSTREAM.repo + '/' + UPSTREAM.branch + '/scripts/' + file
    );
  }

  function urls(cfg) {
    var pages = pagesUrl(cfg.owner, cfg.repo);
    return {
      pagesUrl: pages,
      connectorUrl: pages + 'index.html',
      repoUrl: 'https://github.com/' + cfg.owner + '/' + cfg.repo,
      scriptPs1Url: rawScriptUrl('setup.ps1'),
      scriptShUrl: rawScriptUrl('setup.sh'),
    };
  }

  function psQuote(s) {
    return "'" + String(s).replace(/'/g, "''") + "'";
  }

  function shQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }

  function powershellCommand(cfg) {
    var u = urls(cfg);
    var line =
      'powershell -ExecutionPolicy Bypass -File .\\setup.ps1' +
      ' -AppName ' + psQuote(cfg.appName) +
      ' -Owner ' + psQuote(cfg.owner) +
      ' -Repo ' + psQuote(cfg.repo) +
      ' -Author ' + psQuote(cfg.author);
    if (cfg.appKey) line += ' -AppKey ' + psQuote(cfg.appKey);
    return 'irm ' + u.scriptPs1Url + ' -OutFile setup.ps1\n' + line;
  }

  function bashCommand(cfg) {
    var u = urls(cfg);
    var line =
      'bash setup.sh' +
      ' --name ' + shQuote(cfg.appName) +
      ' --owner ' + shQuote(cfg.owner) +
      ' --repo ' + shQuote(cfg.repo) +
      ' --author ' + shQuote(cfg.author);
    if (cfg.appKey) line += ' --app-key ' + shQuote(cfg.appKey);
    return 'curl -fsSLO ' + u.scriptShUrl + '\n' + line;
  }

  /** Owner/repo default to the site the guide is served from (owner.github.io/repo/). */
  function defaultsFromLocation(loc, brandName) {
    var d = { owner: UPSTREAM.owner, repo: UPSTREAM.repo, appName: brandName || 'Trello Cerveau' };
    var host = loc && typeof loc.hostname === 'string' ? loc.hostname : '';
    var m = /^([a-z0-9-]+)\.github\.io$/i.exec(host);
    if (m) {
      d.owner = m[1];
      var seg = ((loc.pathname || '').split('/')[1] || '').trim();
      d.repo = seg && !/\.html?$/i.test(seg) ? seg : m[1] + '.github.io';
    }
    return d;
  }

  function applyBindings(doc, cfg) {
    var u = urls(cfg);
    var values = {
      appName: cfg.appName,
      owner: cfg.owner,
      repo: cfg.repo,
      author: cfg.author,
      pagesUrl: u.pagesUrl,
      connectorUrl: u.connectorUrl,
      repoUrl: u.repoUrl,
    };
    Array.prototype.forEach.call(doc.querySelectorAll('[data-bind]'), function (el) {
      var key = el.getAttribute('data-bind');
      if (key in values) el.textContent = values[key];
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-href-bind]'), function (el) {
      var k = el.getAttribute('data-href-bind');
      if (k in values) el.href = values[k];
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-href-path]'), function (el) {
      var p = el.getAttribute('data-href-path');
      el.href = p ? u.repoUrl + '/blob/' + UPSTREAM.branch + '/' + p : u.repoUrl;
    });
    var ps = doc.getElementById('setupCmdPs');
    if (ps) ps.textContent = powershellCommand(cfg);
    var sh = doc.getElementById('setupCmdSh');
    if (sh) sh.textContent = bashCommand(cfg);
  }

  function readStored(win) {
    try {
      var raw = win.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) || {} : {};
    } catch (e) {
      return {};
    }
  }

  function writeStored(win, raw) {
    try {
      win.localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    } catch (e) {
      /* private mode: customization just isn't remembered */
    }
  }

  function copyText(win, doc, text, btn, t) {
    var use = btn.querySelector('use');
    var label = btn.querySelector('span');
    var done = function () {
      if (use) use.setAttribute('href', '#i-check');
      if (label) label.textContent = t('copied');
      btn.classList.add('is-done');
      setTimeout(function () {
        if (use) use.setAttribute('href', '#i-copy');
        if (label) label.textContent = t('copy');
        btn.classList.remove('is-done');
      }, 1600);
    };
    if (win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText) {
      win.navigator.clipboard.writeText(text).then(done, function () {});
    }
  }

  /** Static-HTML translations: data-i18n (innerHTML), data-i18n-title, data-i18n-aria. */
  function applyLang(doc, strings) {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-i18n]'), function (el) {
      var v = strings[el.getAttribute('data-i18n')];
      if (typeof v === 'string') el.innerHTML = v;
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-i18n-title]'), function (el) {
      var v = strings[el.getAttribute('data-i18n-title')];
      if (typeof v === 'string') {
        el.title = v;
        if (el.tagName === 'BUTTON') el.setAttribute('aria-label', v);
      }
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-i18n-aria]'), function (el) {
      var v = strings[el.getAttribute('data-i18n-aria')];
      if (typeof v === 'string') el.setAttribute('aria-label', v);
    });
  }

  /** Inputs read like inline text: they hug their content. */
  function autosize(el) {
    var n = (el.value || el.placeholder || '').length;
    el.size = Math.max(3, n + 1);
  }

  function init(doc, win, brandName) {
    var defaults = defaultsFromLocation(win.location, brandName);
    var i18n = global.SetupI18n;
    var lang = 'fr';
    try { lang = win.localStorage.getItem(LANG_KEY) || ''; } catch (e) {}
    if (lang !== 'fr' && lang !== 'en') lang = i18n ? i18n.detect(win.navigator) : 'fr';
    var t = function (key) {
      var d = (i18n && i18n.strings[lang]) || {};
      return d[key] || key;
    };
    var inputs = {};
    FIELDS.forEach(function (f) {
      inputs[f] = doc.getElementById('setup_' + f);
    });

    // Priority: URL query (?appName=…&owner=…) > saved > defaults.
    var raw = readStored(win);
    try {
      var qs = new win.URLSearchParams(win.location.search);
      FIELDS.forEach(function (f) {
        if (qs.get(f)) raw[f] = qs.get(f);
      });
    } catch (e) {}

    FIELDS.forEach(function (f) {
      if (!inputs[f]) return;
      inputs[f].value = raw[f] || '';
      inputs[f].placeholder = f === 'author' ? defaults.owner : f === 'appKey' ? '••••••••' : defaults[f] || '';
    });

    function current() {
      var r = {};
      FIELDS.forEach(function (f) {
        r[f] = inputs[f] ? inputs[f].value : '';
      });
      return r;
    }

    function refresh() {
      var r = current();
      writeStored(win, r);
      var cfg = clean(r, defaults);
      if (inputs.author) inputs.author.placeholder = cfg.owner;
      applyBindings(doc, cfg);
      FIELDS.forEach(function (f) { if (inputs[f]) autosize(inputs[f]); });
    }

    function setLang(next) {
      lang = next;
      try { win.localStorage.setItem(LANG_KEY, lang); } catch (e) {}
      doc.documentElement.lang = lang;
      if (i18n) applyLang(doc, i18n.strings[lang]);
      Array.prototype.forEach.call(doc.querySelectorAll('[data-lang]'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
      });
      refresh();
    }
    Array.prototype.forEach.call(doc.querySelectorAll('[data-lang]'), function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
    });

    FIELDS.forEach(function (f) {
      if (inputs[f]) inputs[f].addEventListener('input', refresh);
    });

    var reset = doc.getElementById('setupReset');
    if (reset) {
      reset.addEventListener('click', function () {
        FIELDS.forEach(function (f) {
          if (inputs[f]) inputs[f].value = '';
        });
        refresh();
      });
    }

    Array.prototype.forEach.call(doc.querySelectorAll('[data-copy]'), function (btn) {
      btn.addEventListener('click', function () {
        var target = doc.getElementById(btn.getAttribute('data-copy'));
        if (target) copyText(win, doc, target.textContent.trim(), btn, t);
      });
    });

    var tabs = doc.querySelectorAll('[data-setup-tab]');
    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (t) {
          var on = t === tab;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          var panel = doc.getElementById(t.getAttribute('data-setup-tab'));
          if (panel) panel.hidden = !on;
        });
      });
    });
    // Default tab follows the visitor's OS.
    var isWin = /Win/i.test((win.navigator && win.navigator.platform) || '');
    var pick = doc.querySelector('[data-setup-tab="' + (isWin ? 'setupPanelPs' : 'setupPanelSh') + '"]');
    if (pick) pick.click();

    setLang(lang);
  }

  global.SetupGuide = {
    UPSTREAM: UPSTREAM,
    clean: clean,
    urls: urls,
    pagesUrl: pagesUrl,
    psQuote: psQuote,
    shQuote: shQuote,
    powershellCommand: powershellCommand,
    bashCommand: bashCommand,
    defaultsFromLocation: defaultsFromLocation,
    init: init,
  };
})(typeof window !== 'undefined' ? window : this);
