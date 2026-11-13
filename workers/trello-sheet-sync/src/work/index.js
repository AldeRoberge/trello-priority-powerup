// Router for https://alderoberge.com/work/* (a Worker route next to /storage on the same zone).
//   /work/api/*   JSON API, Google sign-in and the session cookie (see api.js)
//   /work/sdk.js  the Trello SDK stand-in
//   /work/*.html  the Power-Up pages, served from GitHub Pages through this Worker with the Trello SDK
//                 script swapped for the stand-in; they need a session, everything else is public static
// Sign-in is the same as /storage: Google, only WORK_ALLOWED_EMAILS.

import { NotAllowedError, SESSION_COOKIE, finishGoogleSignIn, isConfigured, publicOrigin, readSession, sessionCookie, startGoogleSignIn } from './auth.js';
import { allData, boot, changes, jsonResponse, proxyTrello, rpc } from './api.js';

const TRELLO_SDK = 'https://p.trellocdn.com/power-up.min.js';
const DEFAULT_ASSETS = 'https://alderoberge.github.io/trello-priority-powerup';

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function signInPage(reason) {
  const messages = {
    not_allowed: 'Ce compte Google n’a pas accès.',
    failed: 'La connexion a échoué. Réessayez.',
    unconfigured: 'La connexion Google n’est pas configurée.',
  };
  const note = reason && messages[reason] ? `<p class="n">${escapeHtml(messages[reason])}</p>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Work</title>
<style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#1d2125;color:#dee4ea;font:15px system-ui,sans-serif}
main{text-align:center}h1{font-size:22px;font-weight:600;margin:0 0 18px}a{display:inline-block;padding:10px 18px;border-radius:8px;background:#e08a4f;color:#1d2125;font-weight:600;text-decoration:none}
a:hover{filter:brightness(1.08)}.n{color:#f87168;margin:0 0 14px}</style></head><body><main><h1>Work</h1>${note}<a href="/work/api/auth/google">Se connecter avec Google</a></main></body></html>`;
}

/** A write must come from this very site: the Origin header names the host the request was sent to. */
function redirect(location, status = 302) {
  return new Response(null, { status, headers: { location, 'cache-control': 'no-store' } });
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

async function handleAuth(request, env, url) {
  const route = url.pathname.slice('/work/api/auth'.length);
  if (route === '/google') {
    if (!isConfigured(env)) return redirect('/work/?signin=unconfigured');
    return redirect(await startGoogleSignIn(env, request.url));
  }
  if (route === '/google/callback') {
    try {
      const token = await finishGoogleSignIn(env, request.url);
      return new Response(null, { status: 302, headers: { location: '/work/', 'set-cookie': sessionCookie(token, request.url) } });
    } catch (err) {
      const reason = err instanceof NotAllowedError ? 'not_allowed' : 'failed';
      if (reason === 'failed') console.error('work sign-in failed', err);
      return redirect(`/work/?signin=${reason}`);
    }
  }
  if (route === '/logout' && request.method === 'POST') {
    if (!sameOrigin(request) || !request.headers.get('origin')) return jsonResponse({ error: 'bad_origin' }, 403);
    return jsonResponse({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=; Path=/work; HttpOnly; Max-Age=0` });
  }
  return jsonResponse({ error: 'not found' }, 404);
}

async function handleApi(request, env, ctx, url, worker) {
  if (url.pathname === '/work/api/health') return jsonResponse({ ok: true, signInConfigured: isConfigured(env) });
  if (url.pathname.startsWith('/work/api/auth/')) return handleAuth(request, env, url);

  const user = await readSession(request, env);
  if (!user) return jsonResponse({ error: 'unauthorized' }, 401);
  if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request)) return jsonResponse({ error: 'bad_origin' }, 403);

  try {
    if (url.pathname === '/work/api/me') return jsonResponse({ user });
    if (url.pathname === '/work/api/boot') return jsonResponse(await boot(env, user, publicOrigin(request, env)));
    if (url.pathname === '/work/api/rpc' && request.method === 'POST') return jsonResponse(await rpc(env, request));
    if (url.pathname === '/work/api/data') return jsonResponse(await allData(env));
    if (url.pathname === '/work/api/changes') return jsonResponse(await changes(env, url.searchParams.get('since')));
    if (url.pathname.startsWith('/work/api/trello/')) return await proxyTrello(env, request, url, '/work/api/trello');
    if (url.pathname.startsWith('/work/api/sheet/')) {
      // Same endpoints as the Worker's own admin API; the session replaces the shared secret.
      const headers = new Headers({ 'x-sync-secret': env.SYNC_SECRET });
      const type = request.headers.get('content-type');
      if (type) headers.set('content-type', type);
      const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
      const inner = new Request(`${url.origin}/${url.pathname.slice('/work/api/sheet/'.length)}${url.search}`, {
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
export function rewriteHtml(html, config) {
  const inject = `<script>window.__WORK__=${JSON.stringify(config).replace(/</g, '\\u003c')};</script><script src="/work/sdk.js"></script>`;
  if (!html.includes(TRELLO_SDK)) return html;
  return html.split(`<script src="${TRELLO_SDK}"></script>`).join(inject);
}

async function fetchAsset(env, path, request) {
  return fetch(`${assetsOrigin(env)}/${path}`, {
    method: 'GET',
    headers: { accept: request.headers.get('accept') || '*/*' },
    cf: { cacheEverything: true, cacheTtl: 60 },
  });
}

async function handlePage(request, env, url) {
  let path = url.pathname.slice('/work/'.length);
  if (!path) {
    const user = await readSession(request, env);
    if (!user) return new Response(signInPage(url.searchParams.get('signin')), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    return redirect('/work/dashboard.html');
  }
  if (path.includes('..')) return new Response('bad path', { status: 400 });

  if (path === 'sdk.js') path = 'components/work/work-sdk.js';
  const isHtml = path.endsWith('.html');
  let config = null;
  if (isHtml) {
    const user = await readSession(request, env);
    if (!user) return new Response(signInPage(), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    const info = await boot(env, user, publicOrigin(request, env));
    config = { board: info.board, member: info.member, user };
  }
  const res = await fetchAsset(env, path, request);
  if (!res.ok) return new Response('Not found', { status: res.status === 404 ? 404 : 502 });
  if (!isHtml) return new Response(res.body, { status: 200, headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'cache-control': path.endsWith('work-sdk.js') ? 'no-cache' : url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=60' } });
  return new Response(rewriteHtml(await res.text(), config), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function handleWork(request, env, ctx, worker) {
  const url = new URL(request.url);
  if (url.pathname === '/work') return redirect('/work/', 301);
  if (!env.WORK_STORE) return jsonResponse({ error: 'WORK_STORE binding is missing' }, 500);
  if (url.pathname.startsWith('/work/api/')) return handleApi(request, env, ctx, url, worker);
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  return handlePage(request, env, url);
}
