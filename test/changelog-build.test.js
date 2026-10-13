'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { parseChangelog } = require(path.join(__dirname, '..', 'scripts', 'stamp-build.js'));

describe('parseChangelog', () => {
  it('reads dated sections newest first with their bullet items', () => {
    const text = [
      '# Journal',
      '',
      '## 2026-10-13',
      '- Premier fait',
      '- Deuxième fait',
      '',
      '## 2026-10-06',
      '- Ancien fait'
    ].join('\n');
    assert.deepEqual(parseChangelog(text), [
      { date: '2026-10-13', items: ['Premier fait', 'Deuxième fait'] },
      { date: '2026-10-06', items: ['Ancien fait'] }
    ]);
  });

  it('ignores bullets before the first dated section and text outside bullets', () => {
    const text = '- orphelin\nparagraphe libre\n## 2026-01-02\n- ok\n';
    assert.deepEqual(parseChangelog(text), [{ date: '2026-01-02', items: ['ok'] }]);
  });

  it('caps the number of releases', () => {
    const text = ['## 2026-03-03', '- a', '## 2026-02-02', '- b', '## 2026-01-01', '- c'].join('\n');
    assert.equal(parseChangelog(text, 2).length, 2);
  });

  it('returns no releases for empty input', () => {
    assert.deepEqual(parseChangelog(''), []);
    assert.deepEqual(parseChangelog(undefined), []);
  });

  it('parses the committed CHANGELOG.md', () => {
    const file = path.join(__dirname, '..', 'CHANGELOG.md');
    const releases = parseChangelog(fs.readFileSync(file, 'utf8'));
    assert.ok(releases.length >= 1, 'CHANGELOG.md should have at least one dated section');
    assert.match(releases[0].date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(releases[0].items.length >= 1);
  });
});
