/**
 * Opt-in console diagnostics for the Power-Up runtime.
 * Exposes window.TpDebug (no bundler). Off by default; call configure(true)
 * after loading the member profile preference.
 */
(function (global) {
  'use strict';

  var PREFIX = '[Cerveau]';
  var enabled = false;
  var sessionId = '';

  function nowMs() {
    return typeof Date.now === 'function' ? Date.now() : new Date().getTime();
  }

  function ensureSessionId() {
    if (sessionId) return sessionId;
    sessionId = 's' + nowMs().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    return sessionId;
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function sanitizeMeta(meta) {
    if (!isPlainObject(meta)) return undefined;
    var out = {};
    var keys = Object.keys(meta);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = meta[key];
      if (value == null) continue;
      var t = typeof value;
      if (t === 'boolean' || t === 'number') {
        if (t === 'number' && !isFinite(value)) continue;
        out[key] = value;
      } else if (t === 'string') {
        // Short reason / event codes only — never free-form content.
        var s = value.trim();
        if (!s) continue;
        if (s.length > 80) s = s.slice(0, 77) + '...';
        out[key] = s;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }

  function errorMeta(err) {
    if (!err) return { error: 'unknown' };
    var name = err && typeof err.name === 'string' ? err.name : 'Error';
    var code =
      err && typeof err.code === 'string'
        ? err.code
        : err && typeof err.status === 'number'
          ? 'http_' + err.status
          : '';
    var out = { error: name };
    if (code) out.code = code;
    return out;
  }

  function emit(level, domain, event, meta) {
    if (!enabled) return;
    var label = PREFIX + ' ' + String(domain || 'runtime') + '.' + String(event || 'event');
    var payload = sanitizeMeta(meta);
    var fn =
      level === 'warn'
        ? console.warn
        : level === 'error'
          ? console.error
          : console.log;
    if (typeof fn !== 'function') return;
    if (payload) fn.call(console, label, payload);
    else fn.call(console, label);
  }

  function configure(nextEnabled) {
    var was = enabled;
    enabled = nextEnabled === true;
    if (enabled && !was) {
      emit('log', 'debug', 'enabled', { session: ensureSessionId() });
    }
    return enabled;
  }

  function isEnabled() {
    return enabled === true;
  }

  function log(domain, event, meta) {
    emit('log', domain, event, meta);
  }

  function warn(domain, event, meta) {
    emit('warn', domain, event, meta);
  }

  /**
   * Always logs errors (even when debug is off) with sanitized metadata.
   * Prefer this over console.error(err) for network/storage failures.
   */
  function error(domain, event, err, meta) {
    var base = errorMeta(err);
    var extra = sanitizeMeta(meta) || {};
    var merged = {};
    var k;
    for (k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k)) merged[k] = base[k];
    }
    for (k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) merged[k] = extra[k];
    }
    var label = PREFIX + ' ' + String(domain || 'runtime') + '.' + String(event || 'error');
    if (enabled) {
      console.error(label, merged);
    } else {
      console.error(label, merged.error || 'Error');
    }
  }

  function start(domain, event, meta) {
    var t0 = nowMs();
    log(domain, event + '.start', meta);
    return {
      end: function (outcomeMeta) {
        var done = sanitizeMeta(outcomeMeta) || {};
        done.durationMs = Math.max(0, nowMs() - t0);
        log(domain, event + '.end', done);
      },
      fail: function (err, outcomeMeta) {
        var done = sanitizeMeta(outcomeMeta) || {};
        done.durationMs = Math.max(0, nowMs() - t0);
        error(domain, event + '.fail', err, done);
      }
    };
  }

  /**
   * Load member preference and configure the logger.
   * Safe when UserProfile / t are missing (leaves logging off).
   */
  async function configureFromProfile(t) {
    if (typeof global.UserProfile === 'undefined' || typeof global.UserProfile.load !== 'function') {
      configure(false);
      return false;
    }
    try {
      var profile = await global.UserProfile.load(t);
      var on =
        typeof global.UserProfile.isDebugLoggingEnabled === 'function'
          ? global.UserProfile.isDebugLoggingEnabled(profile)
          : !!(profile && profile.debugLogging);
      configure(on);
      return on;
    } catch (err) {
      error('debug', 'configureFromProfile', err);
      configure(false);
      return false;
    }
  }

  global.TpDebug = {
    PREFIX: PREFIX,
    configure: configure,
    isEnabled: isEnabled,
    configureFromProfile: configureFromProfile,
    log: log,
    warn: warn,
    error: error,
    start: start,
    sanitizeMeta: sanitizeMeta,
    errorMeta: errorMeta
  };
})(typeof window !== 'undefined' ? window : this);
