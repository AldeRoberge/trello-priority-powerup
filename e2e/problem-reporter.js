'use strict';
/*
 * Playwright reporter: collects the "problems" attachment of every test (see fixtures.js) into
 * e2e/.out/problems.md, grouped by kind and by page, so the run ends with one readable list of what
 * the app got wrong, including warnings that did not fail a test.
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '.out');

class ProblemReporter {
  constructor() {
    this.rows = [];
    this.tests = 0;
  }

  onTestEnd(test, result) {
    this.tests++;
    const att = (result.attachments || []).find((a) => a.name === 'problems' && a.body);
    if (!att) return;
    try {
      const data = JSON.parse(att.body.toString('utf8'));
      (data.problems || []).forEach((p) => this.rows.push(Object.assign({ test: data.test, project: data.project }, p)));
    } catch (e) { /* ignore malformed attachment */ }
  }

  onEnd() {
    const real = this.rows.filter((r) => r.severity !== 'info');
    fs.mkdirSync(OUT, { recursive: true });
    const lines = ['# Problems found by the Playwright run', '', this.tests + ' tests, ' + real.filter((r) => r.severity === 'error').length + ' errors, ' + real.filter((r) => r.severity === 'warn').length + ' warnings.', ''];
    const byKey = new Map();
    real.forEach((r) => {
      const key = r.severity + '|' + r.kind + '|' + r.message.replace(/\d+/g, 'N');
      if (!byKey.has(key)) byKey.set(key, { first: r, tests: [] });
      byKey.get(key).tests.push(r.project + ' › ' + r.test);
    });
    ['error', 'warn'].forEach((sev) => {
      const group = Array.from(byKey.values()).filter((g) => g.first.severity === sev);
      if (!group.length) return;
      lines.push('## ' + (sev === 'error' ? 'Errors' : 'Warnings') + ' (' + group.length + ' distinct)', '');
      group
        .sort((a, b) => a.first.kind.localeCompare(b.first.kind) || b.tests.length - a.tests.length)
        .forEach((g) => {
          lines.push('- **' + g.first.kind + '** — ' + g.first.message);
          if (g.first.after && g.first.after.length) lines.push('  - after: ' + g.first.after.join(' → '));
          lines.push('  - seen in ' + g.tests.length + ' test(s): ' + g.tests.slice(0, 3).join('; ') + (g.tests.length > 3 ? '; …' : ''));
        });
      lines.push('');
    });
    fs.writeFileSync(path.join(OUT, 'problems.md'), lines.join('\n'));
    fs.writeFileSync(path.join(OUT, 'problems.json'), JSON.stringify(this.rows, null, 2));
    const errs = real.filter((r) => r.severity === 'error').length;
    const warns = real.filter((r) => r.severity === 'warn').length;
    console.log('\nProblems: ' + errs + ' errors, ' + warns + ' warnings → e2e/.out/problems.md');
  }

  printsToStdio() {
    return false;
  }
}

module.exports = ProblemReporter;
