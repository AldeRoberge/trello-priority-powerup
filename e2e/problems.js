'use strict';
/*
 * One list of everything that looked wrong during a test. "error" fails the test; "warn" is only
 * reported (e2e/.out/problems.md) unless E2E_STRICT=1; "info" is context.
 */
class Problems {
  constructor() {
    this.list = [];
    this.seen = new Set();
    this.trail = []; // recent user actions, copied onto a problem as repro steps
  }

  step(text) {
    this.trail.push(text);
    if (this.trail.length > 12) this.trail.shift();
  }

  add(severity, kind, message, extra) {
    const msg = String(message || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    const key = kind + '|' + msg;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.list.push(Object.assign({ severity, kind, message: msg, after: this.trail.slice(-6) }, extra || {}));
  }

  error(kind, message, extra) {
    this.add('error', kind, message, extra);
  }

  warn(kind, message, extra) {
    this.add('warn', kind, message, extra);
  }

  info(kind, message, extra) {
    this.add('info', kind, message, extra);
  }

  get errors() {
    return this.list.filter((p) => p.severity === 'error');
  }

  get warnings() {
    return this.list.filter((p) => p.severity === 'warn');
  }

  summary(severities) {
    return this.list
      .filter((p) => !severities || severities.indexOf(p.severity) >= 0)
      .map((p) => '[' + p.kind + '] ' + p.message + (p.after && p.after.length ? '\n      after: ' + p.after.join(' → ') : ''))
      .join('\n  ');
  }
}

module.exports = { Problems };
