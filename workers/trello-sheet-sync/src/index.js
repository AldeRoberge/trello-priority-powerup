// Trello <-> Google Sheet sync Worker.
//   POST /webhook/<SYNC_SECRET>  Trello webhook: something changed on the board -> sync now
//   scheduled (every minute)     picks up Sheet edits (Sheets has no push notifications)
//   GET  /info                   sheet URL, columns, last sync    (header x-sync-secret)
//   PUT  /config {columns}       choose / reorder Sheet columns   (header x-sync-secret)
//   POST /sync                   manual full sync                 (header x-sync-secret)
//   POST /push {cards:[...]}     computed columns from the Power-Up (priority, progress...)

import { COLUMNS, DEFAULT_COLUMNS } from './columns.js';
import { runSync, readColumns, saveColumns, pushComputed, lastSync } from './sync.js';
import { ensureWebhook } from './trello.js';

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const h = { vary: 'origin' };
  if (origin && allowed.includes(origin)) {
    h['access-control-allow-origin'] = origin;
    h['access-control-allow-methods'] = 'GET,POST,PUT,OPTIONS';
    h['access-control-allow-headers'] = 'content-type,x-sync-secret';
    h['access-control-max-age'] = '86400';
  }
  return h;
}

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(request, env) },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });

    if (url.pathname === '/health') return json(request, env, { ok: true });

    if (url.pathname === `/webhook/${env.SYNC_SECRET}`) {
      // Trello verifies the callback URL with HEAD when the webhook is created.
      if (request.method === 'POST') ctx.waitUntil(runSync(env).catch((e) => console.error('webhook sync failed', e)));
      return new Response('ok');
    }

    if (request.headers.get('x-sync-secret') !== env.SYNC_SECRET) return json(request, env, { error: 'unauthorized' }, 401);

    try {
      if (url.pathname === '/info' && request.method === 'GET') {
        return json(request, env, {
          sheetUrl: `https://docs.google.com/spreadsheets/d/${env.GOOGLE_SHEET_ID}/edit`,
          boardId: env.TRELLO_BOARD_ID,
          columns: await readColumns(env),
          available: Object.entries(COLUMNS).map(([key, c]) => ({ key, header: c.header, dir: c.dir })),
          defaults: DEFAULT_COLUMNS,
          lastSync,
        });
      }
      if (url.pathname === '/config' && request.method === 'PUT') {
        const body = await request.json();
        const columns = await saveColumns(env, body.columns);
        return json(request, env, { columns, sync: await runSync(env, { forceFormat: true }) });
      }
      if (url.pathname === '/sync' && request.method === 'POST') {
        return json(request, env, { sync: await runSync(env) });
      }
      if (url.pathname === '/push' && request.method === 'POST') {
        const body = await request.json();
        return json(request, env, await pushComputed(env, Array.isArray(body.cards) ? body.cards : []));
      }
      if (url.pathname === '/webhook/register' && request.method === 'POST') {
        const callback = `${url.origin}/webhook/${env.SYNC_SECRET}`;
        return json(request, env, { webhook: await ensureWebhook(env, callback) });
      }
    } catch (err) {
      return json(request, env, { error: String(err && err.message ? err.message : err) }, 500);
    }
    return json(request, env, { error: 'not found' }, 404);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runSync(env).catch((e) => console.error('scheduled sync failed', e)));
  },
};
