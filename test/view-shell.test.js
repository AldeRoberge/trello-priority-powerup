'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadComponent } = require('./helpers/load');

describe('ViewShell', () => {
  let VS;

  before(() => {
    loadComponent('shared/view-shell.js');
    VS = global.ViewShell;
    assert.ok(VS);
  });

  it('keeps Gantt labels at 280px on a desktop chart', () => {
    assert.equal(VS.labelsMin(1000), 280);
    assert.equal(VS.labelsMin(640), 280);
  });

  it('shrinks Gantt labels on a phone-sized chart so the timeline still shows', () => {
    assert.equal(VS.labelsMin(375), 158);
    assert.equal(VS.labelsMin(320), 134);
    assert.ok(VS.labelsMin(375) + 120 <= 375);
  });

  it('caps the assistant dock at 42% on a narrow screen', () => {
    const orig = VS.isNarrow;
    VS.isNarrow = () => true;
    try {
      assert.equal(VS.dockMaxHeight(667), Math.round(667 * 0.42));
      assert.ok(VS.dockMaxHeight(667) < 667 * 0.5);
    } finally {
      VS.isNarrow = orig;
    }
  });

  it('caps the assistant dock at 75% on a wide screen', () => {
    const orig = VS.isNarrow;
    VS.isNarrow = () => false;
    try {
      assert.equal(VS.dockMaxHeight(900), Math.round(900 * 0.75));
    } finally {
      VS.isNarrow = orig;
    }
  });

  it('treats 640px as the shared narrow breakpoint', () => {
    assert.equal(VS.NARROW_MAX, 640);
    assert.equal(VS.NARROW_MQ, '(max-width: 640px)');
  });
});

describe('ViewShell on every view page', () => {
  const root = path.join(__dirname, '..');
  const VT = (function () {
    loadComponent('shared/view-tabs.js');
    return global.ViewTabs;
  })();

  it('loads view-shell.css and view-shell.js next to the tab strip', () => {
    for (const v of VT.VIEWS) {
      const file = path.join(root, v.page);
      const html = fs.readFileSync(file, 'utf8');
      assert.match(html, /components\/shared\/view-shell\.css/, v.page + ' loads view-shell.css');
      assert.match(html, /components\/shared\/view-shell\.js/, v.page + ' loads view-shell.js');
      assert.match(html, /viewport-fit=cover/, v.page + ' has viewport-fit=cover');
    }
  });
});
