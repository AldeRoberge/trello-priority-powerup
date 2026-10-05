// Minimal Google Sheets v4 client for Cloudflare Workers (service-account JWT signed with Web
// Crypto, no google-auth-library). Same approach as vvd-smart-dashboard's url-shortener worker.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Sheets to read/write cells; Drive metadata (read-only) to learn who last edited the file.
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
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

/** Authenticated fetch for the Drive helpers in drive.js (same service-account token). */
export async function authedFetch(env, url, init = {}) {
  const token = await accessToken(env);
  return fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}` } });
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

/**
 * Adds rows right after the last row that holds data, on the sheet with this id. Unlike
 * values.append (which guesses a "table" from a range), this can never land above the header.
 */
export async function appendRowsToSheet(env, sheetId, rows) {
  if (!rows.length) return;
  const cell = (v) => {
    if (typeof v === 'number') return { userEnteredValue: { numberValue: v } };
    if (typeof v === 'boolean') return { userEnteredValue: { boolValue: v } };
    return { userEnteredValue: { stringValue: v == null ? '' : String(v) } };
  };
  await batchUpdate(env, [
    { appendCells: { sheetId, rows: rows.map((r) => ({ values: r.map(cell) })), fields: 'userEnteredValue' } },
  ]);
}

export async function clearRange(env, range) {
  await call(env, `/values/${encodeURIComponent(range)}:clear`, { method: 'POST', body: '{}' });
}

/** Sheet (tab) metadata: ids, conditional formats. */
export async function getMeta(env) {
  return call(env, '?fields=sheets(properties(sheetId,title,gridProperties),conditionalFormats,protectedRanges(protectedRangeId))');
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

/** Several ranges in one call; returns one 2D array per range (same order). */
export async function batchGet(env, ranges) {
  if (!ranges.length) return [];
  const q = ranges.map((r) => 'ranges=' + encodeURIComponent(r)).join('&');
  const data = await call(env, `/values:batchGet?${q}&valueRenderOption=UNFORMATTED_VALUE`);
  return (data.valueRanges || []).map((v) => v.values || []);
}

/** Inserts rows right under the header (newest first) and writes them. */
export async function prependRows(env, sheetId, tab, rows) {
  if (!rows.length) return;
  await batchUpdate(env, [
    { insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 1 + rows.length }, inheritFromBefore: false } },
  ]);
  await writeRange(env, `${tab}!A2`, rows);
}

/** Drive metadata of the spreadsheet: version counter, modifiedTime, last editor. */
export async function getFileMeta(env) {
  const token = await accessToken(env);
  const res = await fetch(
    `${DRIVE_API}/${env.GOOGLE_SHEET_ID}?fields=version,modifiedTime,lastModifyingUser(displayName,emailAddress)&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive metadata failed: ${res.status} ${await res.text()}`);
  return res.json();
}
