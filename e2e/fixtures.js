'use strict';
/*
 * Playwright fixtures: a fake Trello per worker, a fresh board per test, and an `app` helper that
 * opens the Power-Up pages and watches everything a user would notice go wrong (uncaught errors,
 * console errors, failed requests, layout problems, unsupported Trello calls).
 *
 *   const { test, expect } = require('../fixtures');
 *   test('...', async ({ app, page }) => {
 *     await app.open('table');
 *     ...
 *   });
 */
const base = require('@playwright/test');
const { startServer } = require('./fake-trello/server');
const { Problems } = require('./problems');
const { installMocks } = require('./mocks');
const { runChecks, waitSettled } = require('./page-checks');

const STRICT = process.env.E2E_STRICT === '1';

// A URL built from a missing value: https://undefined/..., /cards/undefined, ?x=undefined, /null, =NaN
const BAD_URL = new RegExp(['^https?://undefined[/:]', '/undefined(/|\\?|$)', '[?&=]undefined(&|$)', '/null(/|\\?|$)', '\\[object Object\\]', '=NaN'].join('|'));

class App {
  constructor(page, context, server, problems, testInfo) {
    this.page = page;
    this.context = context;
    this.server = server;
    this.model = server.model;
    this.problems = problems;
    this.testInfo = testInfo;
    this.allowed = []; // expected problems: [{ kind, pattern }]
  }

  get url() {
    return this.server.url;
  }

  step(text) {
    this.problems.step(text);
  }

  /** Marks a kind of problem as expected in this test (e.g. the 401s of a signed-out board). */
  allow(kind, pattern) {
    this.allowed.push({ kind, pattern: pattern || null });
  }

  isAllowed(p) {
    return this.allowed.some((a) => (a.kind === p.kind || a.kind === '*') && (!a.pattern || a.pattern.test(p.message)));
  }

  /** Opens one of the Power-Up pages the way Trello would (inside the fake Trello). */
  async open(name, opts) {
    opts = opts || {};
    const q = new URLSearchParams(opts.query || {});
    if (opts.card) q.set('__card', opts.card);
    const qs = q.toString();
    const file = /\.html$/.test(name) ? name : name + '.html';
    this.step('open ' + file + (qs ? '?' + qs : ''));
    await this.page.goto(this.server.url + '/' + file + (qs ? '?' + qs : ''), { waitUntil: 'load' });
    if (opts.settle !== false) await this.settle();
  }

  /** Opens the fake Trello board with the Power-Up's board buttons and card badges. */
  async openBoard() {
    this.step('open fake board');
    await this.page.goto(this.server.url + '/__fake/board.html', { waitUntil: 'load' });
    await this.page.waitForFunction(() => window.__fakeBoardReady || window.__fakeBoardError, null, { timeout: 15000 });
    const err = await this.page.evaluate(() => window.__fakeBoardError);
    if (err) throw new Error('Fake board did not start: ' + err);
  }

  /** Waits for the loading placeholders to go away. */
  async settle(timeout) {
    await this.page.waitForLoadState('load').catch(() => {});
    const ok = await waitSettled(this.page, timeout || 10000);
    // let late renders and debounced saves finish
    await this.page.waitForTimeout(150);
    return ok;
  }

  /** Runs the layout / text checks now and records what they find as warnings. */
  async check(label) {
    const issues = await runChecks(this.page);
    issues.forEach((i) => this.problems.warn(i.kind, i.message));
    return issues;
  }

  async setTheme(theme) {
    await this.page.request.post(this.server.url + '/__fake/config', { data: { theme } });
  }

  async setAuthorized(on) {
    await this.page.request.post(this.server.url + '/__fake/auth', { data: { authorized: !!on } });
  }

  /** The Trello card with this id or (part of) name. */
  card(idOrName) {
    return this.model.cards.find((c) => c.id === idOrName) || this.model.cards.find((c) => c.name.indexOf(idOrName) >= 0) || null;
  }

  list(idOrName) {
    return this.model.lists.find((l) => l.id === idOrName) || this.model.lists.find((l) => l.name === idOrName) || null;
  }

  /** Plugin data of a card ("cardPriority", "cardCompletion", ...). */
  cardData(cardId, key) {
    return this.model.rpc('get', [cardId, 'shared', key], { board: 'b1', member: 'm1' });
  }

  /** REST calls the Power-Up made, optionally filtered by method / path pattern. */
  rest(method, pattern) {
    return this.model.restLog.filter((c) => (!method || c.method === method) && (!pattern || pattern.test(c.path)));
  }

  /** Calls made to the Trello host UI (modal / popup / alert / showCard) from the top window. */
  async hostCalls() {
    return this.page.evaluate(() => (window.top.__fakeCalls || []).slice());
  }
}

exports.expect = base.expect;
exports.test = base.test.extend({
  theme: ['light', { option: true }],

  server: [
    async ({}, use) => {
      const srv = await startServer();
      await use(srv);
      await srv.close();
    },
    { scope: 'worker' },
  ],

  app: async ({ page, context, server, theme }, use, testInfo) => {
    server.model.reset();
    server.model.config.theme = theme;
    const problems = new Problems();
    const app = new App(page, context, server, problems, testInfo);
    const local = server.url;

    // The app's TpDebug.error() prints only the error name unless debug logging is on; keep the
    // message / stack on a console.debug line so a failure says what actually broke.
    await context.addInitScript(() => {
      let tp;
      Object.defineProperty(window, 'TpDebug', {
        configurable: true,
        get() {
          return tp;
        },
        set(v) {
          tp = v;
          if (v && typeof v.error === 'function' && !v.__e2eWrapped) {
            const orig = v.error;
            v.__e2eWrapped = true;
            v.error = function (domain, event, err) {
              try {
                const why = String((err && (err.stack || err.message)) || err);
                console.debug('__tp_detail__' + domain + '.' + event + ' :: ' + why.split(String.fromCharCode(10)).slice(0, 4).join(' | '));
              } catch (e) { /* ignore */ }
              return orig.apply(this, arguments);
            };
          }
        },
      });
    });
    await installMocks(context, local, (url) => !/undefined|null|NaN/.test(url) && problems.warn('unmocked-external', 'Request to ' + url.slice(0, 120) + ' was blocked (no mock for this host)'));

    const pathOf = (u) => {
      try {
        const x = new URL(u);
        return x.pathname + x.search.replace(/([?&])(key|token)=[^&]*/g, '$1$2=…');
      } catch (e) {
        return u;
      }
    };

    // Requests cut short because the user changed page are not errors of the page being left.
    let navAt = 0;
    const leaving = () => Date.now() - navAt < 2500;
    page.on('request', (req) => {
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) navAt = Date.now();
      const u = req.url();
      let decoded = u;
      try {
        decoded = decodeURIComponent(u);
      } catch (e) { /* keep raw */ }
      if (BAD_URL.test(decoded)) {
        problems.error('bad-url', req.method() + ' ' + pathOf(u).slice(0, 160) + ' (a value was undefined/null when the URL was built)');
      }
    });
    page.on('pageerror', (err) => !(leaving() && /Failed to fetch|Load failed|NetworkError|aborted/i.test(err && err.message)) && problems.error('pageerror', (err && err.message) + (err && err.stack ? '\n' + String(err.stack).split('\n').slice(1, 3).join(' ') : '')));
    page.on('crash', () => problems.error('crash', 'The page crashed'));
    const details = {};
    page.on('console', (msg) => {
      if (msg.type() === 'debug' && msg.text().indexOf('__tp_detail__') === 0) {
        const m = /^__tp_detail__(\S+) :: (.*)$/.exec(msg.text());
        if (m) details[m[1]] = m[2];
        return;
      }
      if (msg.type() !== 'error') return;
      let text = msg.text();
      const tag = /^\[Cerveau\] (\S+)/.exec(text);
      if (tag && details[tag[1]]) text += ' — ' + details[tag[1]];
      if (leaving() && /Failed to fetch|Load failed|NetworkError|aborted/i.test(text)) return;
      // The status of a failed request is reported by the response listener below.
      if (/^Failed to load resource: (the server responded with a status of \d+|net::ERR_)/.test(text)) return;
      const loc = msg.location();
      problems.error('console.error', text + (loc && loc.url ? ' (' + pathOf(loc.url) + ':' + loc.lineNumber + ')' : ''));
    });
    page.on('response', (res) => {
      const status = res.status();
      if (status < 400) return;
      const u = res.url();
      if (u.indexOf(local) !== 0) return;
      const req = res.request();
      const label = req.method() + ' ' + pathOf(u) + ' → ' + status;
      if (u.indexOf(local + '/__fake/1/') === 0) {
        if (status >= 500) problems.error('rest-5xx', label);
        else problems.warn('rest-4xx', label);
      } else if (u.indexOf(local + '/__fake/') !== 0) {
        problems.error('http-' + status, label);
      }
    });
    page.on('requestfailed', (req) => {
      const u = req.url();
      if (u.indexOf(local) !== 0) return;
      const why = (req.failure() && req.failure().errorText) || '';
      if (/ERR_ABORTED/.test(why)) return; // navigation away / cancelled on purpose
      problems.error('request-failed', req.method() + ' ' + pathOf(u) + ' ' + why);
    });
    page.on('dialog', async (dialog) => {
      problems.info('dialog', dialog.type() + ': ' + dialog.message());
      try {
        await dialog.accept(dialog.type() === 'prompt' ? 'Test' : undefined);
      } catch (e) { /* already closed */ }
    });
    context.on('page', (popup) => {
      if (popup === page) return;
      problems.info('popup', 'Opened a new tab');
      popup.close().catch(() => {});
    });

    await use(app);

    // End of test: one last look at the page, then what the fake Trello saw.
    if (!page.isClosed()) {
      try {
        const issues = await runChecks(page);
        issues.forEach((i) => problems.warn(i.kind, i.message));
      } catch (e) { /* page went away */ }
    }
    server.model.gaps.forEach((g) => problems.error('fake-trello-gap', 'The app used ' + g.what + ', which the fake Trello does not implement yet (extend e2e/fake-trello)'));
    server.model.violations.forEach((v) => problems.error('plugin-data-limit', 'pluginData ' + v.bucket + ' reached ' + v.size + ' characters writing "' + v.key + '" (Trello refuses over 4096)'));

    const all = problems.list.filter((p) => !app.isAllowed(p));
    await testInfo.attach('problems', { body: JSON.stringify({ test: testInfo.titlePath.join(' › '), project: testInfo.project.name, problems: all }, null, 2), contentType: 'application/json' });
    all.filter((p) => p.severity === 'warn').forEach((p) => testInfo.annotations.push({ type: 'warn:' + p.kind, description: p.message }));
    const failing = all.filter((p) => p.severity === 'error' || (STRICT && p.severity === 'warn'));
    if (failing.length) {
      throw new Error(failing.length + ' problem(s) found while using the app:\n  ' + failing.map((p) => '[' + p.kind + '] ' + p.message + (p.after && p.after.length ? '\n      after: ' + p.after.join(' → ') : '')).join('\n  '));
    }
  },
});
