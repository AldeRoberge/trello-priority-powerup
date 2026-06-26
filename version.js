(function (global) {
  const SMALL_NUMBERS = [
    'zero', 'one', 'two', 'three', 'four', 'five',
    'six', 'seven', 'eight', 'nine', 'ten',
  ];

  function toWords(n) {
    n = Math.abs(Math.round(n));
    return n <= 10 ? SMALL_NUMBERS[n] : String(n);
  }

  function formatUtc(iso) {
    const d = new Date(iso);
    const pad = (v) => String(v).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
      + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  }

  function relativeAgo(iso) {
    const then = new Date(iso).getTime();
    const diffSec = Math.round((then - Date.now()) / 1000);

    if (Math.abs(diffSec) < 45) return 'just now';

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
      const count = Math.round(diffSec / size);
      if (Math.abs(count) >= 1) {
        const n = Math.abs(count);
        const label = n === 1 ? unit : `${unit}s`;
        return count < 0 ? `${toWords(n)} ${label} ago` : `in ${toWords(n)} ${label}`;
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
