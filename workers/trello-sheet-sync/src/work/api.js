// /work/api: what the browser asks once signed in. The Power-Up views run unchanged on top of a small
// stand-in for Trello's client SDK (components/work/work-sdk.js); this file answers its calls:
//   POST /rpc          t.get / t.set / t.board / t.cards ... (plugin data from the store, the rest from Trello)
//   GET  /boot         who is signed in + board ids + imports Trello's plugin data the first time
//   ANY  /trello/1/..  the Trello REST API, with the key and token added here (the browser never sees them)
//   ANY  /sheet/..     the Google Sheet sync endpoints, authorised by the session instead of the shared secret
//   GET  /changes      plugin-data entries changed since a time (so the Power-Up inside Trello can catch up)

import { SNAPSHOT_QUERY, bucketKey, bucketsFromPluginData, isAllowedTrelloPath, normalizeSnapshot, readFromSnapshot, sheetConnectionPatch } from './model.js';

const TRELLO = 'https://api.trello.com';
/** TRELLO_API_BASE points local tests at a fake Trello. */
const trelloBase = (env) => String(env.TRELLO_API_BASE || TRELLO).replace(/\/+$/, '');
const SNAPSHOT_TTL_MS = 20 * 1000;
const ME_TTL_MS = 24 * 3600 * 1000;
const SETTINGS_KEY = 'googleSheetsSettings';
const SECRET_KEY = 'googleSheetsSecret';
const SECRET_URL_KEY = 'googleSheetsSecretUrl';

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
}

export function storeOf(env) {
  return env.WORK_STORE.get(env.WORK_STORE.idFromName('main'));
}

async function trello(env, path, init) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${trelloBase(env)}/1${path}${sep}key=${encodeURIComponent(env.TRELLO_KEY)}&token=${encodeURIComponent(env.TRELLO_TOKEN)}`, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`Trello ${path.split('?')[0]} failed: ${res.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

export async function getMe(env, store) {
  const hit = await store.cacheGet('me');
  if (hit && Date.now() - hit.at < ME_TTL_MS) return hit.value;
  const me = await trello(env, '/members/me?fields=fullName,username,initials,avatarUrl');
  await store.cachePut('me', me);
  return me;
}

export async function getSnapshot(env, store, { fresh = false } = {}) {
  const hit = await store.cacheGet('snapshot');
  if (hit && !fresh && Date.now() - hit.at < SNAPSHOT_TTL_MS) return hit.value;
  const raw = await trello(env, `/boards/${env.TRELLO_BOARD_ID}?${SNAPSHOT_QUERY}`);
  const snap = normalizeSnapshot(raw);
  await store.cachePut('snapshot', snap);
  return snap;
}

export async function dropSnapshot(env) {
  await storeOf(env).cacheDrop('snapshot');
}

/** Copies Trello's plugin data into the store the first time. Never overwrites what is already there. */
export async function importFromTrello(env, store, me) {
  const ctx = { board: env.TRELLO_BOARD_ID, member: me.id };
  const [boardData, memberData, withCards] = await Promise.all([
    trello(env, `/boards/${env.TRELLO_BOARD_ID}/pluginData`).catch(() => []),
    trello(env, '/members/me/pluginData').catch(() => []),
    trello(env, `/boards/${env.TRELLO_BOARD_ID}?fields=id&cards=all&card_fields=id&card_pluginData=true`).catch(() => ({ cards: [] })),
  ]);
  const entries = [].concat(boardData || [], memberData || []);
  for (const c of (withCards && withCards.cards) || []) for (const e of c.pluginData || []) entries.push({ ...e, scope: 'card', idModel: e.idModel || c.id });
  const imported = await store.importBuckets(bucketsFromPluginData(entries, ctx));
  await store.setValues('meta', { importedAt: new Date().toISOString() });
  return imported;
}

/** The Sheet connection must go through this session, not through the shared secret stored in Trello. */
async function applySheetConnection(store, ctx, origin) {
  const patch = sheetConnectionPatch(origin);
  const shared = bucketKey('board', 'shared', ctx);
  const priv = bucketKey('board', 'private', ctx);
  const current = (await store.getValue(shared, SETTINGS_KEY)) || {};
  if (current.workerUrl !== patch.shared.workerUrl) await store.setValues(shared, { [SETTINGS_KEY]: { ...current, ...patch.shared, connectedAt: current.connectedAt || new Date().toISOString() } });
  const secret = await store.getValue(priv, SECRET_KEY);
  if (secret !== patch.secret) await store.setValues(priv, { [SECRET_KEY]: patch.secret, [SECRET_URL_KEY]: patch.secretUrl });
}

export async function boot(env, user, origin) {
  const store = storeOf(env);
  const me = await getMe(env, store);
  const ctx = { board: env.TRELLO_BOARD_ID, member: me.id };
  let imported = 0;
  if (!(await store.getValue('meta', 'importedAt'))) imported = await importFromTrello(env, store, me);
  await applySheetConnection(store, ctx, origin);
  return { user, board: env.TRELLO_BOARD_ID, member: me.id, imported };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/** One t.* call. Returns { result } or { error: { name, message } } like the fake SDK host. */
export async function rpc(env, request) {
  const msg = await readJson(request);
  const store = storeOf(env);
  const me = await getMe(env, store);
  const ctx = { ...(msg.ctx || {}), board: env.TRELLO_BOARD_ID, member: me.id };
  const args = Array.isArray(msg.args) ? msg.args : [];
  try {
    switch (msg.method) {
      case 'get': {
        const v = await store.getValue(bucketKey(args[0], args[1], ctx), args[2]);
        return { result: v === null ? (args[3] === undefined ? null : args[3]) : v };
      }
      case 'set': {
        const bucket = bucketKey(args[0], args[1], ctx);
        const values = args[2] && typeof args[2] === 'object' ? args[2] : { [args[2]]: args[3] };
        await store.setValues(bucket, values);
        return { result: null };
      }
      case 'remove': {
        const bucket = bucketKey(args[0], args[1], ctx);
        const values = {};
        for (const k of [].concat(args[2])) values[k] = null;
        await store.setValues(bucket, values);
        return { result: null };
      }
      case 'getAll': {
        const out = {};
        for (const scope of ['board', 'card', 'member']) {
          for (const vis of ['shared', 'private']) {
            const b = await store.getBucket(bucketKey(scope, vis, ctx));
            if (Object.keys(b).length) (out[scope] = out[scope] || {})[vis] = b;
          }
        }
        return { result: out };
      }
      case 'loadSecret': {
        const v = await store.getValue('secret', args[0]);
        return { result: v };
      }
      case 'storeSecret': {
        await store.setValues('secret', { [args[0]]: args[1] });
        return { result: null };
      }
      default: {
        const snap = await getSnapshot(env, store);
        const result = readFromSnapshot(snap, msg.method, args, ctx, me);
        if (result === undefined) return { error: { name: 'NotImplemented', message: `t.${msg.method}() is not available in /work` } };
        return { result };
      }
    }
  } catch (err) {
    return { error: { name: (err && err.name) || 'Error', message: String((err && err.message) || err) } };
  }
}

/** Forwards a Trello REST call with the Worker's key and token. */
export async function proxyTrello(env, request, url, prefix) {
  const path = url.pathname.slice(prefix.length);
  if (!isAllowedTrelloPath(path)) return jsonResponse({ error: 'forbidden path' }, 403);
  const params = new URLSearchParams(url.search);
  params.delete('key');
  params.delete('token');
  params.set('key', env.TRELLO_KEY);
  params.set('token', env.TRELLO_TOKEN);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const headers = new Headers();
  const type = request.headers.get('content-type');
  if (type) headers.set('content-type', type);
  const res = await fetch(`${trelloBase(env)}${path}?${params}`, { method: request.method, headers, body: hasBody ? await request.arrayBuffer() : undefined });
  if (hasBody || request.method === 'DELETE') await dropSnapshot(env);
  return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' } });
}

export async function allData(env) {
  const store = storeOf(env);
  return { buckets: await store.getAllBuckets(), now: Date.now() };
}

export async function changes(env, since) {
  return { changes: await storeOf(env).changesSince(since), now: Date.now() };
}
