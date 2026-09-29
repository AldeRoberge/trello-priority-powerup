// Logs + Activities. Pure helpers (no I/O) so they can be unit-tested.
//   Logs       : what the sync engine did or refused to do, with a severity level
//   Activities : who changed what, in Trello or in the Google Sheet

export const LEVELS = { VERBOSE: 0, DEBUG: 1, INFO: 2, WARNING: 3, ERROR: 4, CRITICAL: 5 };
export const LEVEL_NAMES = Object.keys(LEVELS);

export const LOG_HEADERS = ['Horodatage', 'Niveau', 'Code', 'Message', 'Carte', 'Champ', 'Avant', 'Après', 'Utilisateur'];
export const ACTIVITY_HEADERS = ['Horodatage', 'Utilisateur', 'Origine', 'Action', 'Carte', 'Champ', 'Avant', 'Après', 'Réf.'];

export function parseLevel(value, fallback = 'INFO') {
  const v = String(value || '').trim().toUpperCase();
  return v in LEVELS ? v : fallback;
}

/** "2026-09-29 14:03:07" in the board's timezone. */
export function stamp(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    const g = (t) => parts.find((p) => p.type === t).value;
    return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
  } catch {
    return d.toISOString().replace('T', ' ').slice(0, 19);
  }
}

export function clip(value, max = 300) {
  const s = value == null ? '' : String(value).replace(/\r\n/g, '\n');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function logRow(e, timeZone) {
  return [stamp(e.at, timeZone), e.level, e.code, clip(e.message, 500), clip(e.card, 120), e.field || '', clip(e.before), clip(e.after), e.user || ''];
}

export function activityRow(a, timeZone) {
  return [stamp(a.at, timeZone), a.user || '', a.origin || '', a.action || '', clip(a.card, 120), a.field || '', clip(a.before), clip(a.after), a.ref || ''];
}

/**
 * Collects log entries and activities during one sync pass. Entries below `level` are dropped,
 * except that VERBOSE/DEBUG producers can ask `wants()` first to skip building them.
 */
export function createJournal({ level = 'INFO', now = () => new Date() } = {}) {
  const threshold = LEVELS[parseLevel(level)];
  const logs = [];
  const activities = [];
  return {
    logs,
    activities,
    wants: (lvl) => LEVELS[lvl] >= threshold,
    log(lvl, code, message, extra = {}) {
      if (LEVELS[lvl] < threshold) return;
      logs.push({ at: now(), level: lvl, code, message, ...extra });
    },
    activity(a) {
      activities.push({ at: now(), ...a });
    },
    hasCritical: () => logs.some((l) => l.level === 'CRITICAL'),
  };
}
