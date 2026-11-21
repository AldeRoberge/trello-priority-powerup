// Router for https://alderoberge.com/work/* and /life/* (Worker routes next to /storage on the same zone).
//   /<app>/api/*   JSON API, Google sign-in and the session cookie (see api.js)
//   /<app>/sdk.js  the Trello SDK stand-in
//   /<app>/*.html  the Power-Up pages, served from GitHub Pages through this Worker with the Trello SDK
//                  script swapped for the stand-in; they need a session, everything else is public static
// Sign-in is the same as /storage: Google, only WORK_ALLOWED_EMAILS.
// /work reads the work board (TRELLO_BOARD_ID), /life the home board (LIFE_BOARD_ID). Each keeps its own
// Power-Up data and its own session cookie; only /work is wired to the Google Sheet sync.

import { NotAllowedError, WORK_APP, finishGoogleSignIn, isConfigured, publicOrigin, readSession, sessionCookie, startGoogleSignIn } from './auth.js';
import { allData, boot, changes, jsonResponse, proxyTrello, rpc } from './api.js';

const TRELLO_SDK = 'https://p.trellocdn.com/power-up.min.js';
const DEFAULT_ASSETS = 'https://alderoberge.github.io/trello-priority-powerup';
/** https://trello.com/b/oESYPwNf/home (the short link works wherever the REST API wants a board id). */
const DEFAULT_LIFE_BOARD = 'oESYPwNf';

const LIFE_APP = { name: 'life', prefix: '/life', cookie: 'life_session' };

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Which app a path belongs to, or null. */
export function appOf(pathname) {
  for (const app of [WORK_APP, LIFE_APP]) if (pathname === app.prefix || pathname.startsWith(`${app.prefix}/`)) return app;
  return null;
}

/** The environment as seen by one app: its own board and its own store. */
export function scopedEnv(env, app) {
  if (app.name !== 'life') return { ...env, APP_NAME: 'work' };
  return { ...env, APP_NAME: 'life', TRELLO_BOARD_ID: env.LIFE_BOARD_ID || DEFAULT_LIFE_BOARD };
}

const FAVICON = '<link rel="icon" type="image/svg+xml" href="/work/assets/icon.svg">';

export function signInPage(reason, app = WORK_APP) {
  const messages = {
    not_allowed: 'Ce compte Google n’a pas accès.',
    failed: 'La connexion a échoué. Réessayez.',
    unconfigured: 'La connexion Google n’est pas configurée.',
  };
  const title = app.name === 'life' ? 'Life' : 'Work';
  const note = reason && messages[reason] ? `<p class="n">${escapeHtml(messages[reason])}</p>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${FAVICON}
<style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#1d2125;color:#dee4ea;font:15px system-ui,sans-serif}
main{text-align:center}h1{font-size:22px;font-weight:600;margin:0 0 18px}a{display:inline-block;padding:10px 18px;border-radius:8px;background:#e08a4f;color:#1d2125;font-weight:600;text-decoration:none}
a:hover{filter:brightness(1.08)}.n{color:#f87168;margin:0 0 14px}</style></head><body><main><h1>${title}</h1>${note}<a href="${app.prefix}/api/auth/google">Se connecter avec Google</a></main></body></html>`;
}

function redirect(location, status = 302) {
  return new Response(null, { status, headers: { location, 'cache-control': 'no-store' } });
}

/** A write must come from this very site: the Origin header names the host the request was sent to. */
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

async function handleAuth(request, env, url, app) {
  const route = url.pathname.slice(`${app.prefix}/api/auth`.length);
  if (route === '/google') {
    if (!isConfigured(env)) return redirect(`${app.prefix}/?signin=unconfigured`);
    return redirect(await startGoogleSignIn(env, request.url, app));
  }
  if (route === '/google/callback') {
    try {
      const token = await finishGoogleSignIn(env, request.url, app);
      return new Response(null, { status: 302, headers: { location: `${app.prefix}/`, 'set-cookie': sessionCookie(token, request.url, undefined, app) } });
    } catch (err) {
      const reason = err instanceof NotAllowedError ? 'not_allowed' : 'failed';
      if (reason === 'failed') console.error(`${app.name} sign-in failed`, err);
      return redirect(`${app.prefix}/?signin=${reason}`);
    }
  }
  if (route === '/logout' && request.method === 'POST') {
    if (!sameOrigin(request) || !request.headers.get('origin')) return jsonResponse({ error: 'bad_origin' }, 403);
    return jsonResponse({ ok: true }, 200, { 'set-cookie': `${app.cookie}=; Path=${app.prefix}; HttpOnly; Max-Age=0` });
  }
  return jsonResponse({ error: 'not found' }, 404);
}

async function handleApi(request, env, ctx, url, worker, app) {
  const base = `${app.prefix}/api`;
  if (url.pathname === `${base}/health`) return jsonResponse({ ok: true, signInConfigured: isConfigured(env) });
  if (url.pathname.startsWith(`${base}/auth/`)) return handleAuth(request, env, url, app);

  const user = await readSession(request, env, app);
  if (!user) return jsonResponse({ error: 'unauthorized' }, 401);
  if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request)) return jsonResponse({ error: 'bad_origin' }, 403);

  try {
    if (url.pathname === `${base}/me`) return jsonResponse({ user });
    if (url.pathname === `${base}/boot`) return jsonResponse(await boot(env, user, publicOrigin(request, env)));
    if (url.pathname === `${base}/rpc` && request.method === 'POST') return jsonResponse(await rpc(env, request));
    if (url.pathname === `${base}/data`) return jsonResponse(await allData(env));
    if (url.pathname === `${base}/changes`) return jsonResponse(await changes(env, url.searchParams.get('since')));
    if (url.pathname.startsWith(`${base}/trello/`)) return await proxyTrello(env, request, url, `${base}/trello`);
    if (url.pathname.startsWith(`${base}/sheet/`) && app.name === 'work') {
      // Same endpoints as the Worker's own admin API; the session replaces the shared secret.
      const headers = new Headers({ 'x-sync-secret': env.SYNC_SECRET });
      const type = request.headers.get('content-type');
      if (type) headers.set('content-type', type);
      const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
      const inner = new Request(`${url.origin}/${url.pathname.slice(`${base}/sheet/`.length)}${url.search}`, {
        method: request.method,
        headers,
        body: hasBody ? await request.arrayBuffer() : undefined,
      });
      return await worker.fetch(inner, env, ctx);
    }
  } catch (err) {
    return jsonResponse({ error: String((err && err.message) || err) }, 500);
  }
  return jsonResponse({ error: 'not found' }, 404);
}

function assetsOrigin(env) {
  return String(env.WORK_ASSETS_ORIGIN || DEFAULT_ASSETS).replace(/\/+$/, '');
}

/** The page with the Trello SDK script replaced by the stand-in, and the signed-in identity injected before it. */
export function rewriteHtml(html, config, app = WORK_APP) {
  const inject = `<script>window.__WORK__=${JSON.stringify(config).replace(/</g, '\\u003c')};</script><script src="${app.prefix}/sdk.js"></script>`;
  const body = html.includes(TRELLO_SDK) ? html.split(`<script src="${TRELLO_SDK}"></script>`).join(inject) : html;
  return body.replace('</head>', `${FAVICON.replace('/work/', `${app.prefix}/`)}</head>`);
}

async function fetchAsset(env, path, request) {
  return fetch(`${assetsOrigin(env)}/${path}`, {
    method: 'GET',
    headers: { accept: request.headers.get('accept') || '*/*' },
    cf: { cacheEverything: true, cacheTtl: 60 },
  });
}

const htmlHeaders = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };

async function handlePage(request, env, url, app) {
  let path = url.pathname.slice(`${app.prefix}/`.length);
  if (!path) {
    const user = await readSession(request, env, app);
    if (!user) return new Response(signInPage(url.searchParams.get('signin'), app), { status: 401, headers: htmlHeaders });
    return redirect(`${app.prefix}/dashboard`);
  }
  if (path.includes('..')) return new Response('bad path', { status: 400 });
  // The address never shows .html: /work/docs.html moves to /work/docs (the query and hash are kept)
  if (path.endsWith('.html')) return redirect(`${app.prefix}/${path.slice(0, -'.html'.length)}${url.search}`, 301);

  if (path === 'sdk.js') path = 'components/work/work-sdk.js';
  // A page is one plain word (/work/docs); the file is its .html (no dot, so assets and scripts stay as they are)
  if (/^[a-z][a-z0-9-]*$/.test(path)) path += '.html';
  const isHtml = path.endsWith('.html');
  let config = null;
  if (isHtml) {
    const user = await readSession(request, env, app);
    if (!user) return new Response(signInPage(undefined, app), { status: 401, headers: htmlHeaders });
    const info = await boot(env, user, publicOrigin(request, env));
    config = { board: info.board, member: info.member, user };
  }
  const res = await fetchAsset(env, path, request);
  if (!res.ok) return new Response('Not found', { status: res.status === 404 ? 404 : 502 });
  if (!isHtml) return new Response(res.body, { status: 200, headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'cache-control': path.endsWith('work-sdk.js') ? 'no-cache' : url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=60' } });
  return new Response(rewriteHtml(await res.text(), config, app), { status: 200, headers: htmlHeaders });
}

export async function handleWork(request, env, ctx, worker) {
  const url = new URL(request.url);
  const app = appOf(url.pathname);
  if (!app) return new Response('Not found', { status: 404 });
  if (url.pathname === app.prefix) return redirect(`${app.prefix}/`, 301);
  if (!env.WORK_STORE) return jsonResponse({ error: 'WORK_STORE binding is missing' }, 500);
  const scoped = scopedEnv(env, app);
  if (url.pathname.startsWith(`${app.prefix}/api/`)) return handleApi(request, scoped, ctx, url, worker, app);
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  return handlePage(request, scoped, url, app);
}
