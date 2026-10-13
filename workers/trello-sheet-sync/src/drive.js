// Mirrors the Power-Up's Documents view with a Google Drive folder, one Markdown file per document.
// Documents are archived Trello cards named "📄 Title" whose description holds the text (see
// components/docs/docs-trello.js). Same rule as the Sheet: both sides are edited, and when the same
// document changed on both sides since the last pass, Trello wins.
//
//   Trello save  -> file updated (webhook, syncDocumentCard)
//   Drive edit   -> document updated (cron / POST /documents/sync)
//   new .md file -> new document
//   file deleted -> document stays; the file is recreated (same as deleting a Sheet row)
//   document deleted -> file goes to the Drive trash
//
// Files this module owns carry appProperties { trelloCardId, sig, md5 }. sig is a hash of the Trello
// title + text; md5 is Drive's checksum of the file bytes, so a Drive edit is visible without
// downloading every file. Files that are not .md and have no trelloCardId are never touched.
//
//   syncDocumentCard(env, cardId)  one document, from the Trello webhook (Trello wins)
//   syncAllDocuments(env)          full reconcile, cron and POST /sync

import { authedFetch } from './googleSheets.js';
import { joinDesc, splitDesc } from './descMeta.js';
import * as trello from './trello.js';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const MARK = '📄';
const UNTITLED = 'Sans titre';
const MAX_TITLE = 120;
const MAX_DESC = 16384;
// Each change is an upload plus a metadata stamp. Leave room for the Sheet sync (50 subrequests).
const MAX_CHANGES_PER_PASS = 8;

export let docSyncStatus = null;

export const driveEnabled = (env) => /^[A-Za-z0-9_-]{10,}$/.test(String((env && env.GOOGLE_DRIVE_FOLDER_ID) || ''));

export const isDocCard = (card) => !!(card && typeof card.name === 'string' && card.name.startsWith(MARK));

export const titleOf = (name) => String(name || '').replace(/^📄\s?/, '').trim() || UNTITLED;

/** "Plan: Q3/Q4?" -> "Plan- Q3-Q4-.md" (Drive accepts anything, but other tools sync these files). */
export function fileName(title) {
  const t = String(title || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .trim();
  return `${t || UNTITLED}.md`;
}

/** "Notes.md" -> "Notes". The title keeps characters fileName() would strip. */
export function titleFromFile(name) {
  const base = String(name || '')
    .replace(/\.md$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE);
  return base || UNTITLED;
}

/** The visible text of a document card (the hidden cerveau-meta block is not part of the file). */
export function docMarkdown(desc) {
  return `${splitDesc(desc).visible.replace(/\s+$/, '')}\n`;
}

function bumpRev(hidden) {
  if (hidden && /rev:\s*\d+/.test(hidden)) return hidden.replace(/rev:\s*(\d+)/, (_, n) => `rev: ${Number(n) + 1}`);
  return '<!--cerveau-meta\ntype: document\nrev: 2\n-->';
}

/**
 * Card name + description for a Drive file. Keeps the hidden block (cover, subject, tags) and bumps
 * its revision so an open editor notices. Null when the result would not fit in a Trello description.
 * `title` is already the document title, not a file name.
 */
export function cardFromDrive(card, title, markdown) {
  const clean = String(title || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) || UNTITLED;
  const body = String(markdown || '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  const hidden = card ? bumpRev(splitDesc(card.desc).hidden) : '<!--cerveau-meta\ntype: document\nrev: 1\n-->';
  const desc = joinDesc(body, hidden);
  if (desc.length > MAX_DESC) return null;
  return { name: `${MARK} ${clean}`, desc, title: clean };
}

export async function signature(title, markdown) {
  const bytes = new TextEncoder().encode(`${title}\n${markdown}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function propsOf(cardId, sig, md5, prev) {
  const out = { trelloCardId: cardId, sig };
  const m = md5 || (prev && prev.md5) || '';
  if (m) out.md5 = m;
  return out;
}

function isLooseMarkdown(f) {
  if (f.appProperties && f.appProperties.trelloCardId) return false;
  if (f.mimeType === 'application/vnd.google-apps.folder') return false;
  return /\.md$/i.test(f.name || '') || f.mimeType === 'text/markdown';
}

/** Drive renamed the file (not just our ":" -> "-" file name). */
function driveRenamed(file, title) {
  return titleFromFile(file.name) !== title && file.name !== fileName(title);
}

function multipart(metadata, content) {
  const boundary = `cerveau${crypto.randomUUID().replace(/-/g, '')}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  return { body, headers: { 'content-type': `multipart/related; boundary=${boundary}` } };
}

async function drive(env, url, init) {
  const res = await authedFetch(env, url, init);
  const text = await res.text();
  if (!res.ok) {
    const quota = /storageQuotaExceeded|do not have storage quota/i.test(text)
      ? ' (un compte de service ne peut pas créer de fichiers dans un Drive personnel : utilisez un Drive partagé, voir docs/documents.md)'
      : '';
    throw new Error(`Drive ${(init && init.method) || 'GET'} failed: ${res.status} ${text.slice(0, 300)}${quota}`);
  }
  return text ? JSON.parse(text) : null;
}

async function download(env, fileId) {
  const res = await authedFetch(env, `${FILES}/${fileId}?alt=media&supportsAllDrives=true`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Drive GET failed: ${res.status} ${text.slice(0, 300)}`);
  return text;
}

function stamp(env, fileId, appProperties) {
  return drive(env, `${FILES}/${fileId}?supportsAllDrives=true&fields=id`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appProperties }),
  });
}

/** Files in the Drive folder. `cardId` narrows to one document; otherwise every file (not folders). */
async function listFiles(env, cardId) {
  const only = cardId ? ` and appProperties has { key='trelloCardId' and value='${cardId}' }` : '';
  const q = `'${env.GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed=false${only}`;
  const files = [];
  let pageToken = '';
  do {
    const url =
      `${FILES}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('nextPageToken,files(id,name,mimeType,md5Checksum,appProperties)')}` +
      `&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const data = await drive(env, url);
    files.push(...((data && data.files) || []));
    pageToken = (data && data.nextPageToken) || '';
  } while (pageToken);
  return files.filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');
}

function trash(env, fileId) {
  return drive(env, `${FILES}/${fileId}?supportsAllDrives=true&fields=id`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

/** Uploads the card's text. Drive's checksum is stored so the next pass can see edits. */
async function writeFile(env, card, keep, title, markdown, sig) {
  const appProperties = propsOf(card.id, sig, keep && keep.appProperties && keep.appProperties.md5, keep && keep.appProperties);
  const metadata = { name: fileName(title), appProperties };
  let id;
  let uploaded;
  if (!keep) {
    const m = multipart({ ...metadata, parents: [env.GOOGLE_DRIVE_FOLDER_ID], mimeType: 'text/markdown' }, markdown);
    uploaded = await drive(env, `${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,md5Checksum`, {
      method: 'POST',
      headers: m.headers,
      body: m.body,
    });
    id = uploaded && uploaded.id;
  } else {
    const m = multipart(metadata, markdown);
    uploaded = await drive(env, `${UPLOAD}/${keep.id}?uploadType=multipart&supportsAllDrives=true&fields=id,md5Checksum`, {
      method: 'PATCH',
      headers: m.headers,
      body: m.body,
    });
    id = keep.id;
  }
  const md5 = (uploaded && uploaded.md5Checksum) || '';
  if (id && md5) await stamp(env, id, propsOf(card.id, sig, md5, null));
  return keep ? 'updated' : 'created';
}

/**
 * Pushes one document to its file. Used by the webhook: Trello just changed, so it wins.
 * @returns {Promise<'created'|'updated'|'unchanged'>}
 */
async function push(env, card, files) {
  const title = titleOf(card.name);
  const markdown = docMarkdown(card.desc);
  const sig = await signature(title, markdown);
  const [keep, ...duplicates] = files;
  for (const dup of duplicates) await trash(env, dup.id);
  if (keep && keep.appProperties && keep.appProperties.sig === sig) return 'unchanged';
  return writeFile(env, card, keep, title, markdown, sig);
}

/** Writes Drive text (or just a new title) onto the card and remembers the file's checksum. */
async function pullIntoCard(env, card, file, markdown, title) {
  const built = cardFromDrive(card, title, markdown);
  if (!built) return 'skipped';
  await trello.updateCard(env, card.id, { name: built.name, desc: built.desc });
  const sig = await signature(built.title, docMarkdown(built.desc));
  await stamp(env, file.id, propsOf(card.id, sig, file.md5Checksum, file.appProperties));
  return 'pulled';
}

/**
 * One document against its files. Drive wins only when Trello has not changed since the last pass.
 * @returns {Promise<'created'|'updated'|'pulled'|'unchanged'|'skipped'|'stamped'>}
 */
async function reconcile(env, card, files) {
  const [keep, ...duplicates] = files;
  for (const dup of duplicates) await trash(env, dup.id);
  if (!keep) return push(env, card, []);
  const title = titleOf(card.name);
  const markdown = docMarkdown(card.desc);
  const sig = await signature(title, markdown);
  const storedSig = (keep.appProperties && keep.appProperties.sig) || '';
  const storedMd5 = (keep.appProperties && keep.appProperties.md5) || '';
  const driveMd5 = keep.md5Checksum || '';
  const trelloChanged = storedSig !== sig;
  const contentChanged = !!(storedMd5 && driveMd5 && storedMd5 !== driveMd5);
  const renamed = driveRenamed(keep, title);
  if (!trelloChanged && (contentChanged || renamed)) {
    const text = contentChanged ? await download(env, keep.id) : splitDesc(card.desc).visible;
    return pullIntoCard(env, card, keep, text, renamed ? titleFromFile(keep.name) : title);
  }
  if (!trelloChanged && !storedMd5 && driveMd5) {
    await stamp(env, keep.id, propsOf(card.id, sig, driveMd5, keep.appProperties));
    return 'stamped';
  }
  if (!trelloChanged) return 'unchanged';
  return push(env, card, [keep]);
}

async function importFile(env, listId, file) {
  const markdown = await download(env, file.id);
  const built = cardFromDrive(null, titleFromFile(file.name), markdown);
  if (!built) return 'skipped';
  const card = await trello.createCard(env, { idList: listId, name: built.name, desc: built.desc, pos: 'bottom' });
  await trello.updateCard(env, card.id, { closed: true });
  const sig = await signature(built.title, docMarkdown(built.desc));
  await stamp(env, file.id, propsOf(card.id, sig, file.md5Checksum, file.appProperties));
  return 'imported';
}

const inflight = new Map(); // cardId -> { again } : autosave fires a webhook every second or so

async function syncOne(env, cardId) {
  const card = await trello.getCard(env, cardId);
  const files = await listFiles(env, cardId);
  if (!card || !isDocCard(card) || !card.closed) {
    for (const f of files) await trash(env, f.id);
    return files.length ? 'trashed' : 'none';
  }
  return push(env, card, files);
}

/** One document, from a webhook. Calls that arrive while one is running collapse into one re-run. */
export async function syncDocumentCard(env, cardId) {
  if (!driveEnabled(env) || !/^[a-f0-9]{24}$/i.test(String(cardId || ''))) return null;
  const running = inflight.get(cardId);
  if (running) {
    running.again = true;
    return 'queued';
  }
  const state = { again: false };
  inflight.set(cardId, state);
  try {
    let result;
    do {
      state.again = false;
      result = await syncOne(env, cardId);
    } while (state.again);
    docSyncStatus = { at: new Date().toISOString(), ok: true, last: result };
    return result;
  } catch (err) {
    docSyncStatus = { at: new Date().toISOString(), ok: false, error: String(err && err.message ? err.message : err) };
    throw err;
  } finally {
    inflight.delete(cardId);
  }
}

function needsWrite(card, mine) {
  if (!mine.length || mine.length > 1) return true;
  const f = mine[0];
  const title = titleOf(card.name);
  const storedMd5 = (f.appProperties && f.appProperties.md5) || '';
  const driveMd5 = f.md5Checksum || '';
  if (storedMd5 && driveMd5 && storedMd5 !== driveMd5) return true;
  if (driveRenamed(f, title)) return true;
  return false; // caller also compares sig
}

/** Full pass: documents and files meet in the middle. At most MAX_CHANGES_PER_PASS writes. */
export async function syncAllDocuments(env) {
  if (!driveEnabled(env)) return { enabled: false };
  const summary = {
    enabled: true,
    documents: 0,
    created: 0,
    updated: 0,
    pulled: 0,
    imported: 0,
    trashed: 0,
    unchanged: 0,
    skipped: 0,
    stamped: 0,
    remaining: 0,
  };
  try {
    const cards = ((await trello.getClosedCards(env)) || []).filter(isDocCard);
    const files = await listFiles(env);
    const byCard = new Map();
    const loose = [];
    for (const f of files) {
      const id = f.appProperties && f.appProperties.trelloCardId;
      if (id) byCard.set(id, [...(byCard.get(id) || []), f]);
      else if (isLooseMarkdown(f)) loose.push(f);
    }
    summary.documents = cards.length;
    let budget = MAX_CHANGES_PER_PASS;
    const spend = (result) => {
      summary[result] = (summary[result] || 0) + 1;
      if (result !== 'unchanged') budget -= 1;
    };
    for (const card of cards) {
      const mine = byCard.get(card.id) || [];
      byCard.delete(card.id);
      if (budget <= 0) {
        const sig = await signature(titleOf(card.name), docMarkdown(card.desc));
        const f = mine[0];
        const changed = needsWrite(card, mine) || !f || !f.appProperties || f.appProperties.sig !== sig;
        summary[changed ? 'remaining' : 'unchanged'] += 1;
        continue;
      }
      spend(await reconcile(env, card, mine));
    }
    for (const orphans of byCard.values()) {
      for (const f of orphans) {
        if (budget <= 0) {
          summary.remaining += 1;
          continue;
        }
        await trash(env, f.id);
        spend('trashed');
      }
    }
    let listId;
    for (const f of loose) {
      if (budget <= 0) {
        summary.remaining += 1;
        continue;
      }
      if (listId === undefined) {
        const lists = await trello.getLists(env);
        listId = (lists && lists[0] && lists[0].id) || '';
      }
      if (!listId) {
        spend('skipped');
        continue;
      }
      spend(await importFile(env, listId, f));
    }
    docSyncStatus = { at: new Date().toISOString(), ok: true, ...summary };
    return summary;
  } catch (err) {
    const error = String(err && err.message ? err.message : err);
    docSyncStatus = { at: new Date().toISOString(), ok: false, error };
    return { ...summary, error };
  }
}
