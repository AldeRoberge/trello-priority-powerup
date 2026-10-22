'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('Aujourd’hui edit mode and widget scale', () => {
  const js = read('components/dashboard/today-ui.js');
  const css = read('components/dashboard/today-ui.css');

  it('starts out of edit mode', () => {
    assert.match(js, /arrange:\s*false/);
  });

  it('resize handles exist only while the board is being edited', () => {
    assert.match(js, /ui\.arrange && !ui\.narrow \? h\('span', \{ class: 'td-resize td-resize-e' \}\)/);
    assert.match(js, /if \(!ui\.arrange \|\| e\.button !== 0 \|\| \(ui\.narrow && axis !== 's'\)\) return;/);
  });

  it('the weather follows the widget box, not the window', () => {
    assert.match(css, /container:\s*tdcol \/ size/);
    assert.match(css, /cqmin/);
    assert.match(css, /@container tdcol \(max-height:\s*150px\)/);
    assert.doesNotMatch(css, /@media \(max-height:\s*640px\)/);
  });
});
