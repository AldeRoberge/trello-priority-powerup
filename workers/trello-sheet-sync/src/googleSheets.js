// Minimal Google Sheets v4 client for Cloudflare Workers (service-account JWT signed with Web
// Crypto, no google-auth-library). Same approach as vvd-smart-dashboard's url-shortener worker.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

function b64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToBuffer(pem) {
  const b64 = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

let cached = null;

async function accessToken(env) {
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToBuffer(env.GOOGLE_SERVICE_ACCOUNT_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${b64url(sig)}`,
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cached = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.value;
}

async function call(env, path, init) {
  const token = await accessToken(env);
  const res = await fetch(`${API}/${env.GOOGLE_SHEET_ID}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Sheets API ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function readRange(env, range) {
  const data = await call(env, `/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`);
  return data.values || [];
}

export async function writeCells(env, cells) {
  if (!cells.length) return;
  await call(env, '/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: cells.map((c) => ({ range: c.range, values: [[c.value]] })) }),
  });
}

export async function writeRange(env, range, values) {
  await call(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values }) });
}

export async function appendRows(env, range, rows) {
  if (!rows.length) return;
  await call(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: rows }),
  });
}

export async function clearRange(env, range) {
  await call(env, `/values/${encodeURIComponent(range)}:clear`, { method: 'POST', body: '{}' });
}

/** Sheet (tab) metadata: ids, conditional formats. */
export async function getMeta(env) {
  return call(env, '?fields=sheets(properties(sheetId,title,gridProperties),conditionalFormats)');
}

export async function batchUpdate(env, requests) {
  if (!requests.length) return;
  await call(env, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
}

/** "A1" column letters for a 1-based column number. */
export function colLetter(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
