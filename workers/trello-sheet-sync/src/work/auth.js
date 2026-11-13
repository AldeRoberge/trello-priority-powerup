// Google sign-in for /work (OIDC code flow with PKCE), same approach as /storage.
// Only the addresses in WORK_ALLOWED_EMAILS get a session cookie scoped to /work.
// The id token comes straight from Google's token endpoint over TLS, so its claims are checked
// (issuer, audience, expiry, nonce, verified email) without fetching the signing keys.

import { b64urlEncode, decodeJwtPayload, randomToken, readCookie, signJwt, verifyJwt } from './jwt.js';

export const SESSION_COOKIE = 'work_session';
export const SESSION_DAYS = 60;
const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';

export class NotAllowedError extends Error {}

export function allowedEmails(env) {
  return String(env.WORK_ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isConfigured(env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET && allowedEmails(env).length);
}

export const redirectUri = (origin) => `${origin}/work/api/auth/google/callback`;

export async function startGoogleSignIn(env, requestUrl) {
  const { origin } = new URL(requestUrl);
  const verifier = randomToken();
  const nonce = randomToken();
  const state = await signJwt({ verifier, nonce }, env.SESSION_SECRET, 600);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
    nonce,
    code_challenge: b64urlEncode(new Uint8Array(digest)),
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE}?${params}`;
}

/** Checks the claims of the id token and returns the session payload; throws NotAllowedError for a stranger. */
export function sessionFromIdToken(env, idToken, nonce, now = Date.now()) {
  const claims = decodeJwtPayload(idToken);
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') throw new Error('Unexpected token issuer');
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw new Error('Token was issued for another application');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < now) throw new Error('Identity token expired');
  if (claims.nonce !== nonce) throw new Error('Sign-in nonce did not match');
  if (typeof claims.email !== 'string' || claims.email_verified === false) throw new Error('No verified email address');
  if (!allowedEmails(env).includes(claims.email.toLowerCase())) throw new NotAllowedError(claims.email);
  return { email: claims.email, name: typeof claims.name === 'string' ? claims.name : null, picture: typeof claims.picture === 'string' ? claims.picture : null };
}

export async function finishGoogleSignIn(env, requestUrl) {
  const url = new URL(requestUrl);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) throw new Error('Sign-in did not return an authorization code');
  const payload = await verifyJwt(state, env.SESSION_SECRET);
  if (!payload || typeof payload.verifier !== 'string' || typeof payload.nonce !== 'string') throw new Error('Bad sign-in state');
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(url.origin),
      code_verifier: payload.verifier,
    }),
  });
  if (!res.ok) throw new Error('Google rejected the authorization code');
  const { id_token: idToken } = await res.json();
  if (!idToken) throw new Error('Google did not return an identity token');
  const user = sessionFromIdToken(env, idToken, payload.nonce);
  return signJwt(user, env.SESSION_SECRET, SESSION_DAYS * 86400);
}

/**
 * Local development only: WORK_DEV_USER signs in without Google. It counts only when nothing real sits behind the
 * Worker (TRELLO_API_BASE points at a local fake), so setting it on the deployed Worker does nothing.
 */
export function isDevMode(env) {
  if (!env.WORK_DEV_USER || !env.TRELLO_API_BASE) return false;
  try {
    return ['localhost', '127.0.0.1'].includes(new URL(env.TRELLO_API_BASE).hostname);
  } catch {
    return false;
  }
}

/** The origin the browser used (the Host header in development, where wrangler shows the production host in the URL). */
export function publicOrigin(request, env) {
  const url = new URL(request.url);
  return isDevMode(env) && request.headers.get('host') ? `http://${request.headers.get('host')}` : url.origin;
}

/** The signed-in user, or null. The allowlist is re-checked on every request so removing an address takes effect at once. */
export async function readSession(request, env) {
  if (isDevMode(env)) return { email: env.WORK_DEV_USER, name: 'Dev', picture: null };
  const payload = await verifyJwt(readCookie(request, SESSION_COOKIE), env.SESSION_SECRET);
  if (!payload || typeof payload.email !== 'string') return null;
  if (!allowedEmails(env).includes(payload.email.toLowerCase())) return null;
  return { email: payload.email, name: payload.name || null, picture: payload.picture || null };
}

export function sessionCookie(token, requestUrl, maxAge = SESSION_DAYS * 86400) {
  const secure = new URL(requestUrl).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/work; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
