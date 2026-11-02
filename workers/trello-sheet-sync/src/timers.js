// Card timers: email the ones that ended while no open tab announced them.
// The Power-Up stores `cardTimers` in the board's shared plugin data; the open tab marks a timer
// `firedAt` once it has shown it. Trello's REST API cannot write plugin data, so the Worker remembers
// what it already emailed in the TIMER_STATE KV namespace (without it, nothing is sent).

import { getBoardPluginData } from './trello.js';

const KEY = 'cardTimers';
const GRACE_MS = 90 * 1000;
const SENT_TTL_SECONDS = 7 * 24 * 3600;

/** Every timer found in the board plugin data entries (value is a JSON string of the shared values). */
export function timersFromPluginData(entries) {
  const out = [];
  for (const entry of entries || []) {
    let value = entry && entry.value;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        continue;
      }
    }
    const map = value && typeof value === 'object' ? value[KEY] : null;
    if (!map || typeof map !== 'object') continue;
    for (const timer of Object.values(map)) {
      if (timer && timer.id && timer.endsAt && !Number.isNaN(Date.parse(timer.endsAt))) out.push(timer);
    }
  }
  return out;
}

/** Ended for longer than the grace period, not announced by a tab, not emailed yet. */
export function pickUnannounced(timers, now, sentIds, graceMs = GRACE_MS) {
  return timers.filter((x) => !x.firedAt && !sentIds.has(x.id) && Date.parse(x.endsAt) + graceMs <= now);
}

export function emailFor(timer) {
  const title = timer.title || 'Carte';
  return {
    subject: `Minuteur terminé : ${title}`,
    text: `Le minuteur de la carte « ${title} » est terminé.${timer.label ? `\n${timer.label}` : ''}`,
  };
}

async function send(env, timer) {
  const mail = emailFor(timer);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.TIMER_EMAIL_FROM, to: [env.TIMER_EMAIL_TO], subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

export async function notifyDueTimers(env, now = Date.now()) {
  if (!env.RESEND_API_KEY || !env.TIMER_EMAIL_TO || !env.TIMER_EMAIL_FROM || !env.TIMER_STATE) return 0;
  const timers = timersFromPluginData(await getBoardPluginData(env));
  const late = timers.filter((x) => !x.firedAt && Date.parse(x.endsAt) + GRACE_MS <= now);
  if (!late.length) return 0;
  const sent = new Set();
  for (const x of late) if (await env.TIMER_STATE.get(`sent:${x.id}`)) sent.add(x.id);
  let count = 0;
  for (const x of pickUnannounced(late, now, sent)) {
    await send(env, x);
    await env.TIMER_STATE.put(`sent:${x.id}`, '1', { expirationTtl: SENT_TTL_SECONDS });
    count += 1;
  }
  return count;
}
