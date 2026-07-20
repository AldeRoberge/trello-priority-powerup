'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

loadComponent('priority/priority-trello.js');

const PT = global.PriorityTrello;

describe('iframe client options', () => {
  beforeEach(() => {
    global.PriorityRestConfig = null;
  });

  it('iframeClientOptions opts out of ADS tokens', () => {
    const opts = PT.iframeClientOptions();
    assert.equal(opts.useADSTokens, false);
    assert.equal(opts.appKey, undefined);
  });

  it('iframeClientOptions merges REST app key when configured', () => {
    global.PriorityRestConfig = {
      appKey: 'test-key',
      appAuthor: 'Test Author',
    };
    global.PriorityBrand = { appName: 'Cerveau', appAuthor: 'Brand Author' };
    const opts = PT.iframeClientOptions();
    assert.equal(opts.useADSTokens, false);
    assert.equal(opts.appKey, 'test-key');
    assert.ok(opts.appName);
    assert.equal(opts.appAuthor, 'Test Author');
  });

  it('createIframeClient passes useADSTokens:false and syncs data-color-mode', () => {
    const attrs = {};
    global.document.documentElement.setAttribute = (k, v) => {
      attrs[k] = v;
    };
    global.document.documentElement.getAttribute = (k) => attrs[k] || null;

    let themeCb = null;
    const iframeOpts = [];
    global.TrelloPowerUp = {
      iframe(opts) {
        iframeOpts.push(opts);
        return {
          getContext() {
            return { theme: 'dark', initialTheme: 'dark' };
          },
          subscribeToThemeChanges(cb) {
            themeCb = cb;
          },
        };
      },
    };

    const t = PT.createIframeClient();
    assert.equal(iframeOpts.length, 1);
    assert.equal(iframeOpts[0].useADSTokens, false);
    assert.equal(attrs['data-color-mode'], 'dark');
    assert.equal(typeof themeCb, 'function');

    themeCb('light');
    assert.equal(attrs['data-color-mode'], 'light');
    assert.equal(t.getContext().theme, 'dark');
  });

  it('sizeToContent skips fullscreen modals', () => {
    let sizeCalls = 0;
    const tFs = {
      getContext() {
        return { fullscreen: true };
      },
      sizeTo() {
        sizeCalls += 1;
      },
    };
    PT.sizeToContent(tFs);
    assert.equal(sizeCalls, 0);

    const tNormal = {
      getContext() {
        return { fullscreen: false };
      },
      sizeTo() {
        sizeCalls += 1;
        return Promise.resolve();
      },
    };
    PT.sizeToContent(tNormal);
    assert.equal(sizeCalls, 1);
    assert.equal(PT.isFullscreenModal(tFs), true);
    assert.equal(PT.isFullscreenModal(tNormal), false);
  });

  it('sizeToContent skips nested iframes', () => {
    let sizeCalls = 0;
    const prevParent = global.parent;
    const prevTop = global.top;
    try {
      global.top = {};
      global.parent = { other: true };
      const tNested = {
        getContext() {
          return { fullscreen: false };
        },
        arg() {
          return null;
        },
        sizeTo() {
          sizeCalls += 1;
        },
      };
      assert.equal(PT.isNestedPowerUpIframe(), true);
      assert.equal(PT.shouldSkipSizeTo(tNested), true);
      PT.sizeToContent(tNested);
      assert.equal(sizeCalls, 0);
    } finally {
      global.parent = prevParent;
      global.top = prevTop;
    }
  });

  it('cardDataPromise uses REST when cardId arg is set', async () => {
    const urls = [];
    global.fetch = async (url) => {
      urls.push(String(url));
      return {
        ok: true,
        async json() {
          return { id: 'card123', name: 'From REST', desc: 'Body' };
        },
      };
    };
    const t = {
      arg(key) {
        return key === 'cardId' ? 'card123' : null;
      },
      async getRestApi() {
        return {
          async isAuthorized() {
            return true;
          },
          async getToken() {
            return 'tok';
          },
        };
      },
      card() {
        throw new Error('t.card should not be used for overlay cardId');
      },
    };
    global.PriorityRestConfig = { appKey: 'key', appAuthor: 'Test' };
    const card = await PT.cardDataPromise(t, 'name', 'desc');
    assert.equal(card.name, 'From REST');
    assert.equal(card.desc, 'Body');
    assert.equal(urls.length, 1);
    assert.match(urls[0], /\/cards\/card123\?/);
    assert.match(urls[0], /fields=name%2Cdesc|fields=name,desc/);
  });
});
