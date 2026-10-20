'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/** Selectors of every rule that declares an infinite animation. */
function infiniteRules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (/animation[^;]*infinite/.test(m[2])) out.push(m[1].trim().replace(/\s+/g, ' '));
  }
  return out;
}

describe('Aujourd’hui weather card holds still', () => {
  const css = read('components/shared/weather-ui.css');
  const js = read('components/shared/weather-ui.js');

  it('only loading cues loop (refresh icon, placeholder bars)', () => {
    assert.deepEqual(infiniteRules(css), ['.wx-iconbtn.is-spin .ti', '.wx-skel-bar']);
  });

  it('the sky is drawn without animation timing', () => {
    assert.doesNotMatch(js, /animation-(duration|delay)/);
  });

  it('dark mode dims the sky', () => {
    assert.match(css, /html\[data-color-mode="dark"\] \.wx-sky::after/);
  });
});

describe('Assistant face and status stay calm', () => {
  const css = read('components/agent/agent-ui.css');

  it('no glow or ring keyframes are left for the status dot or the new-message pill', () => {
    assert.doesNotMatch(css, /@keyframes agent-new-message-glow/);
    assert.doesNotMatch(css, /@keyframes agent-face-status-(listen|analyze)/);
  });

  it('the face override comes after every rule that loops on the face', () => {
    const override = css.indexOf(".agent-face:not(.agent-face--spin):not([class*='agent-face--enter-'])");
    assert.ok(override > 0, 'face override is present');
    const loops = infiniteRules(css.slice(override)).filter((s) => /agent-face(?![-\w])/.test(s) && !/agent-face-(zzz|sparkle)/.test(s));
    assert.deepEqual(loops, []);
  });
});

describe('Table critical banner in dark mode', () => {
  it('has a dark variant instead of the full-bright red bar', () => {
    assert.match(read('components/table/table-ui.css'), /html\[data-color-mode="dark"\] \.tb-alert \{/);
  });
});
