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
});
