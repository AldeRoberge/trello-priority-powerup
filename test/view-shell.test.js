'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
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

  describe('dockBottom (where floating controls sit above the assistant dock)', () => {
    let saved;
    beforeEach(() => {
      saved = { q: global.document.querySelector, de: global.document.documentElement };
    });
    afterEach(() => {
      global.document.querySelector = saved.q;
      global.document.documentElement = saved.de;
    });
    function withDock(rect, viewportHeight) {
      global.document.documentElement = { clientHeight: viewportHeight };
      global.document.querySelector = (sel) => (sel === '.ad-dock' && rect ? { getBoundingClientRect: () => rect } : null);
    }

    it('hangs the control `gap` px above the dock top (12 by default)', () => {
      withDock({ top: 600, height: 100 }, 700);
      assert.equal(VS.dockBottom(12), 112);
      assert.equal(VS.dockBottom(), 112);
      assert.equal(VS.dockBottom(0), 100);
    });

    it('never goes under 16 px from the bottom', () => {
      withDock({ top: 699, height: 1 }, 700);
      assert.equal(VS.dockBottom(12), 16);
    });

    it('is null with no dock, or a dock that is not showing', () => {
      withDock(null, 700);
      assert.equal(VS.dockBottom(12), null);
      withDock({ top: 700, height: 0 }, 700);
      assert.equal(VS.dockBottom(12), null);
    });
  });

  it('guards every drag bar, Triage and quick-card bars included, so a scroll never changes a progress', () => {
    const bars = VS.GUARDED_BARS.split(',').map((s) => s.trim());
    for (const sel of ['.kb-prog-bar', '.tb-prog-bar', '.jy-prog-bar', '.tt-prog-bar', '.cq-bar', '.gantt-bar']) {
      assert.ok(bars.includes(sel), sel + ' is held back until the finger shows its intent');
    }
  });

  it('gives every guarded bar a touch-action: pan-* rule on coarse pointers (JS guard and CSS stay in step)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', 'view-shell.css'), 'utf8');
    // The "Phone pass 2" coarse block: every rule that sets touch-action: pan-y or pan-x pan-y (Kanban's lists swipe sideways).
    const start = css.indexOf('Phone pass 2');
    assert.ok(start >= 0, 'the phone block exists');
    const block = css.slice(start, css.indexOf('\n}\n', start)).replace(/\/\*[\s\S]*?\*\//g, '');
    const covered = new Set();
    for (const m of block.matchAll(/([^{}]+)\{[^{}]*touch-action:\s*pan-[^;{}]*;[^{}]*\}/g)) {
      m[1].split(',').forEach((sel) => covered.add(sel.trim()));
    }
    assert.ok(covered.size > 0, 'the coarse touch-action rules exist');
    for (const sel of VS.GUARDED_BARS.split(',').map((x) => x.trim())) {
      assert.ok(covered.has(sel), sel + ' has a touch-action: pan-* rule');
    }
  });
});
