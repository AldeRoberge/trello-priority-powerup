(function (global) {
  const SMALL_NUMBERS = [
    'zero', 'one', 'two', 'three', 'four', 'five',
    'six', 'seven', 'eight', 'nine', 'ten',
  ];

  const SINGULAR_PHRASES = {
    hour: 'an hour',
    minute: 'a minute',
    second: 'a second',
    day: 'a day',
    week: 'a week',
    month: 'a month',
    year: 'a year',
  };

  function toWords(n) {
    n = Math.abs(Math.round(n));
    return n <= 10 ? SMALL_NUMBERS[n] : String(n);
  }

  function unitPhrase(n, unit) {
    if (n === 1) return SINGULAR_PHRASES[unit] || `one ${unit}`;
    return `${toWords(n)} ${unit}s`;
  }

  function formatUtc(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'invalid timestamp';
    const pad = (v) => String(v).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
      + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  }

  function relativeAgo(iso) {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return 'at an unknown time';

    // Positive elapsed = built in the past (UTC-safe; both sides are epoch ms)
    let elapsedSec = Math.round((Date.now() - then) / 1000);

    // Small future skew (viewer clock slightly behind CI) → just now
    if (elapsedSec < 0) {
      if (elapsedSec > -90) return 'just now';
      // Larger mismatch: still show "ago" — deploy stamps should never be future
      elapsedSec = Math.abs(elapsedSec);
    }

    if (elapsedSec < 45) return 'just now';

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
        return `${unitPhrase(count, unit)} ago`;
      }
    }

    return 'just now';
  }

  function updatedLabel(iso) {
    return `Updated ${relativeAgo(iso)}`;
  }

  async function fetchBuiltAt(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('build info not found');
    const { builtAt } = await res.json();
    return builtAt;
  }

  global.BuildVersion = {
    formatUtc,
    relativeAgo,
    updatedLabel,
    fetchBuiltAt,
  };
})(window);
