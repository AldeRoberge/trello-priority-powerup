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
    return ago === 'à l\'instant' ? 'Mis à jour à l\'instant' : `Mis à jour ${ago}`;
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
