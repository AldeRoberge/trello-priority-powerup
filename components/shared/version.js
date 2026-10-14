(function (global) {
  const SINGULAR_UNITS = {
    second: 'une seconde',
    minute: 'une minute',
    hour: 'une heure',
    day: 'un jour',
    week: 'une semaine',
    month: 'un mois',
    year: 'une année',
  };

  const PLURAL_UNITS = {
    second: 'secondes',
    minute: 'minutes',
    hour: 'heures',
    day: 'jours',
    week: 'semaines',
    month: 'mois',
    year: 'années',
  };

  function unitPhrase(n, unit) {
    if (n === 1) return SINGULAR_UNITS[unit] || `un ${unit}`;
    return `${n} ${PLURAL_UNITS[unit] || `${unit}s`}`;
  }

  function formatUtc(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'horodatage invalide';
    const pad = (v) => String(v).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
      + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  }

  function relativeAgo(iso) {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return 'à une date inconnue';

    let elapsedSec = Math.round((Date.now() - then) / 1000);

    if (elapsedSec < 0) {
      if (elapsedSec > -90) return 'à l\'instant';
      elapsedSec = Math.abs(elapsedSec);
    }

    if (elapsedSec < 45) return 'à l\'instant';

    const tiers = [
      ['year', 31536000],
      ['month', 2592000],
      ['week', 604800],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
      ['second', 1],
    ];

    for (const [unit, size] of tiers) {
      const count = Math.floor(elapsedSec / size);
      if (count >= 1) {
        return `il y a ${unitPhrase(count, unit)}`;
      }
    }

    return 'à l\'instant';
  }

  function updatedLabel(iso) {
    const ago = relativeAgo(iso);
    const prefix = 'Binaires de l\'application Cerveau mis à jour';
    return ago === 'à l\'instant' ? `${prefix} à l\'instant` : `${prefix} ${ago}`;
  }

  function parseTimestampMs(value) {
    if (value == null || value === '') return NaN;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? NaN : ms;
  }

  function lastModifiedMs(response) {
    const header = response.headers && response.headers.get('Last-Modified');
    if (!header) return NaN;
    return parseTimestampMs(header);
  }

  async function headLastModified(url) {
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) return NaN;
      return lastModifiedMs(res);
    } catch {
      return NaN;
    }
  }

  function resolveBuiltAt(builtAtIso, ...otherMs) {
    const candidates = [parseTimestampMs(builtAtIso), ...otherMs]
      .filter((ms) => !Number.isNaN(ms));
    if (!candidates.length) throw new Error('build info not found');
    return new Date(Math.max(...candidates)).toISOString();
  }

  async function fetchBuiltAt(url, probeUrl) {
    const [buildRes, probeMs] = await Promise.all([
      fetch(url, { cache: 'no-store' }),
      probeUrl ? headLastModified(probeUrl) : Promise.resolve(NaN),
    ]);
    if (!buildRes.ok) throw new Error('build info not found');
    const info = await buildRes.json();
    const { builtAt, releases } = info;
    const resolved = resolveBuiltAt(builtAt, lastModifiedMs(buildRes), probeMs);
    global.BuildVersion.current = resolved;
    global.BuildVersion.commit = info.commit || '';
    global.BuildVersion.releases = Array.isArray(releases) ? releases : [];
    return resolved;
  }

  /** True when the page HTML is an older deploy than build-info.json. */
  function needsReload(running, remote, busy, alreadyTried) {
    if (!running || !remote || running === remote) return false;
    if (busy) return false;
    if (alreadyTried && alreadyTried === remote) return false;
    return true;
  }

  /** Page URL that misses the cached HTML. '' when it already carries this build. */
  function urlWithBuild(href, commit) {
    const u = new URL(href);
    if (u.searchParams.get('v') === commit) return '';
    u.searchParams.set('v', commit);
    return u.href;
  }

  function pageBusy() {
    const el = global.document && global.document.activeElement;
    if (!el || el === global.document.body || el === global.document.documentElement) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  const RELOAD_KEY = 'cerveau-build-reload';
  const POLL_MS = 30000;

  function watchBuild() {
    const doc = global.document;
    if (!doc || typeof doc.querySelector !== 'function' || !global.location || typeof global.fetch !== 'function') {
      return;
    }
    const meta = doc.querySelector('meta[name="cerveau-build"]');
    const running = (meta && meta.getAttribute && meta.getAttribute('content')) || '';
    if (!running) return;

    function tick() {
      const infoUrl = new URL('build-info.json', global.location.href);
      infoUrl.searchParams.set('t', String(Date.now()));
      global.fetch(infoUrl.href, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((info) => {
          const remote = (info && info.commit) || '';
          let tried = '';
          try {
            tried = global.sessionStorage ? global.sessionStorage.getItem(RELOAD_KEY) || '' : '';
          } catch (e) {
            tried = '';
          }
          if (!needsReload(running, remote, pageBusy(), tried)) return;
          const next = urlWithBuild(global.location.href, remote);
          if (!next) return;
          try {
            if (global.sessionStorage) global.sessionStorage.setItem(RELOAD_KEY, remote);
          } catch (e2) {
            /* private mode */
          }
          global.location.replace(next);
        })
        .catch(() => {});
    }

    tick();
    global.setInterval(tick, POLL_MS);
    doc.addEventListener('visibilitychange', () => {
      if (!doc.hidden) tick();
    });
    doc.addEventListener('focusout', () => {
      global.setTimeout(tick, 400);
    });
  }

  global.BuildVersion = {
    formatUtc,
    relativeAgo,
    updatedLabel,
    parseTimestampMs,
    resolveBuiltAt,
    fetchBuiltAt,
    needsReload,
    urlWithBuild,
  };

  watchBuild();
})(window);
