// Trello <-> Google Sheet sync Worker.
//   POST /webhook/<SYNC_SECRET>  Trello webhook: record who did what, then sync right away
//   scheduled (every minute)     catches up, then watches the Sheet for ~50 s so an edit in the
//                                Sheet reaches Trello within seconds
//   GET  /info                   sheet URL, columns, log level, last sync, unacknowledged alerts
//   PUT  /config                 {columns?, logLevel?, sheetTheme?: 'light'|'dark'}
//   POST /sync                   manual full sync
//   POST /push                   {cards:[...]} computed columns from the Power-Up
//   GET  /logs?limit=&level=     Logs tab            GET /activities?limit=   Activities tab
//   POST /alerts/ack             acknowledge CRITICAL alerts
//   POST /documents/sync         mirror the Documents view into the Drive folder now
//   POST /webhook/register       (re)register the Trello webhook
// Everything except the webhook and /health needs the header x-sync-secret.

import { COLUMNS, DEFAULT_COLUMNS } from './columns.js';
import { LEVEL_NAMES } from './journal.js';
import {
  runSync,
  loadConfig,
  saveSettings,
  pushComputed,
  watchSheet,
  enqueueActivities,
  readLogs,
  readActivities,
  readAlerts,
  ackAlerts,
  readColumns,
  parseTheme,
  lastSync,
} from './sync.js';
import { describeAction, isDocumentAction, isEntityAction } from './webhook.js';
import { ensureWebhook } from './trello.js';
import { driveEnabled, syncDocumentCard, syncAllDocuments, docSyncStatus } from './drive.js';

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

async function handleWebhook(request, env, ctx) {
  if (request.method !== 'POST') return new Response('ok'); // Trello verifies the URL with HEAD
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    /* not JSON */
  }
  if (isEntityAction(payload)) return new Response('ok'); // Entities view cards: nothing to sync
  if (isDocumentAction(payload)) {
    // Document view cards: no Sheet sync and no Activities, only the Drive copy
    const cardId = payload.action.data.card.id;
    if (driveEnabled(env)) ctx.waitUntil(syncDocumentCard(env, cardId).catch((e) => console.error('document sync failed', e)));
    return new Response('ok');
  }
  // A deleted card no longer has a name: if it was a document, its Drive file must go
  if (driveEnabled(env) && payload && payload.action && payload.action.type === 'deleteCard' && payload.action.data && payload.action.data.card) {
    ctx.waitUntil(syncDocumentCard(env, payload.action.data.card.id).catch((e) => console.error('document cleanup failed', e)));
  }
  ctx.waitUntil(
    (async () => {
      try {
        const { activities } = describeAction(payload);
        await enqueueActivities(env, activities); // atomic append; flushed by the next pass
        await runSync(env);
      } catch (e) {
        console.error('webhook handling failed', e);
      }
    })(),
  );
  return new Response('ok');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });

    if (url.pathname === '/health') return json(request, env, { ok: true });
    if (url.pathname === `/webhook/${env.SYNC_SECRET}`) return handleWebhook(request, env, ctx);

    if (request.headers.get('x-sync-secret') !== env.SYNC_SECRET) return json(request, env, { error: 'unauthorized' }, 401);

    try {
      if (url.pathname === '/info' && request.method === 'GET') {
        const cfg = await loadConfig(env);
        return json(request, env, {
          sheetUrl: `https://docs.google.com/spreadsheets/d/${env.GOOGLE_SHEET_ID}/edit`,
          boardId: env.TRELLO_BOARD_ID,
          columns: await readColumns(env),
          logLevel: cfg.logLevel || 'INFO',
          sheetTheme: parseTheme(cfg.sheetTheme),
          levels: LEVEL_NAMES,
          available: Object.entries(COLUMNS).map(([key, c]) => ({ key, header: c.header, dir: c.dir })),
          defaults: DEFAULT_COLUMNS,
          lastSync,
          documents: { enabled: driveEnabled(env), folderUrl: driveEnabled(env) ? `https://drive.google.com/drive/folders/${env.GOOGLE_DRIVE_FOLDER_ID}` : '', status: docSyncStatus },
          alerts: await readAlerts(env),
        });
      }
      if (url.pathname === '/config' && request.method === 'PUT') {
        const body = await request.json();
        const saved = await saveSettings(env, { columns: body.columns, logLevel: body.logLevel, sheetTheme: body.sheetTheme });
        return json(request, env, { ...saved, sync: await runSync(env, { forceFormat: true }) });
      }
      if (url.pathname === '/sync' && request.method === 'POST') return json(request, env, { ...(await runSync(env)), documents: await syncAllDocuments(env) });
      if (url.pathname === '/documents/sync' && request.method === 'POST') return json(request, env, await syncAllDocuments(env));
      if (url.pathname === '/push' && request.method === 'POST') {
        const body = await request.json();
        return json(request, env, await pushComputed(env, Array.isArray(body.cards) ? body.cards : []));
      }
      if (url.pathname === '/logs' && request.method === 'GET') {
        const limit = Math.min(500, Number(url.searchParams.get('limit')) || 200);
        return json(request, env, { logs: await readLogs(env, { limit, level: url.searchParams.get('level') || 'VERBOSE' }) });
      }
      if (url.pathname === '/activities' && request.method === 'GET') {
        const limit = Math.min(500, Number(url.searchParams.get('limit')) || 200);
        return json(request, env, { activities: await readActivities(env, { limit }) });
      }
      if (url.pathname === '/alerts/ack' && request.method === 'POST') {
        await ackAlerts(env);
        return json(request, env, { ok: true });
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

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        // Documents change rarely and the webhook already mirrors each save: reconcile every 10 minutes
        if (new Date(event.scheduledTime).getUTCMinutes() % 10 === 0) await syncAllDocuments(env).catch((e) => console.error('documents sync failed', e));
        await watchSheet(env).catch((e) => console.error('scheduled sync failed', e));
      })(),
    );
  },
};
