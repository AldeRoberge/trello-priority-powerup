'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('SetupGuide', () => {
  let SG;
  beforeEach(() => {
    clearComponentCache();
    delete global.SetupGuide;
    SG = loadComponent('shared/setup-guide.js').SetupGuide;
  });

  it('clean falls back to defaults and strips invalid characters', () => {
    const c = SG.clean({ appName: '  ', owner: 'my user!', repo: 'a b/c', appKey: 'nope' }, { appName: 'X', owner: 'zed', repo: 'r' });
    assert.equal(c.appName, 'X');
    assert.equal(c.owner, 'myuser');
    assert.equal(c.repo, 'abc');
    assert.equal(c.author, 'myuser');
    assert.equal(c.appKey, '');
  });

  it('accepts a 32-hex app key, lowercased', () => {
    const key = 'E449F4C01B03A2501072808ABE5611AB';
    assert.equal(SG.clean({ appKey: key }).appKey, key.toLowerCase());
  });

  it('derives the Pages and connector URLs', () => {
    const u = SG.urls({ owner: 'Foo', repo: 'bar' });
    assert.equal(u.connectorUrl, 'https://foo.github.io/bar/index.html');
    assert.equal(u.repoUrl, 'https://github.com/Foo/bar');
    assert.equal(SG.urls({ owner: 'foo', repo: 'foo.github.io' }).connectorUrl, 'https://foo.github.io/index.html');
  });

  it('quotes shell arguments safely', () => {
    assert.equal(SG.psQuote("it's"), "'it''s'");
    assert.equal(SG.shQuote("it's"), String.raw`'it'\''s'`);
    const cmd = SG.bashCommand({ appName: "O'Brien $(x)", owner: 'o', repo: 'r', author: 'o', appKey: '' });
    assert.ok(cmd.includes(String.raw`--name 'O'\''Brien $(x)'`));
    assert.ok(!cmd.includes('--app-key'));
  });

  it('powershell command carries every option', () => {
    const cmd = SG.powershellCommand({ appName: 'Mon App', owner: 'o', repo: 'r', author: 'a', appKey: 'a'.repeat(32) });
    assert.match(cmd, /-AppName 'Mon App' -Owner 'o' -Repo 'r' -Author 'a' -AppKey 'a{32}'/);
    assert.match(cmd, /^irm https:\/\/raw\.githubusercontent\.com\/.*setup\.ps1 -OutFile setup\.ps1\n/);
  });

  it('defaults follow the github.io location', () => {
    const d = SG.defaultsFromLocation({ hostname: 'zed.github.io', pathname: '/my-repo/index.html' }, 'Nova');
    assert.deepEqual(d, { owner: 'zed', repo: 'my-repo', appName: 'Nova' });
    const local = SG.defaultsFromLocation({ hostname: 'localhost', pathname: '/' }, 'Nova');
    assert.equal(local.owner, SG.UPSTREAM.owner);
    const root = SG.defaultsFromLocation({ hostname: 'zed.github.io', pathname: '/index.html' }, 'Nova');
    assert.equal(root.repo, 'zed.github.io');
  });
});
