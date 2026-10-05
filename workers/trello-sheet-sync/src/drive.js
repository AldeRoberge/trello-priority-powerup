// Mirrors the Power-Up's Documents view into a Google Drive folder, one Markdown file per document.
// Documents are archived Trello cards named "📄 Title" whose description holds the text (see
// components/docs/docs-trello.js). Trello stays the source of truth: this is a one-way copy.
//
// Files are found again through appProperties { trelloCardId, sig } (sig = hash of title + text),
// so renaming a document renames its file, an unchanged document costs no upload, and a deleted
// document's file goes to the Drive trash. Files without trelloCardId are never touched.
//
//   syncDocumentCard(env, cardId)  one document, called from the Trello webhook (debounced per card)
//   syncAllDocuments(env)          full reconcile, called by the cron and by POST /sync

import { authedFetch } from './googleSheets.js';
import { splitDesc } from './descMeta.js';
import * as trello from './trello.js';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const MARK = '📄';
const UNTITLED = 'Sans titre';
// Free Workers plans allow 50 subrequests per invocation: leave room for the Sheet sync.
const MAX_CHANGES_PER_PASS = 20;

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

/** The visible text of a document card (the hidden cerveau-meta block is not part of the file). */
export function docMarkdown(desc) {
  return `${splitDesc(desc).visible.replace(/\s+$/, '')}\n`;
}

export async function signature(title, markdown) {
  const bytes = new TextEncoder().encode(`${title}\n${markdown}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
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

/** Files of the Drive folder that this module created; `cardId` narrows to one document. */
async function listFiles(env, cardId) {
  const only = cardId ? ` and appProperties has { key='trelloCardId' and value='${cardId}' }` : '';
  const q = `'${env.GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed=false${only}`;
  const files = [];
  let pageToken = '';
  do {
    const url =
      `${FILES}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('nextPageToken,files(id,name,appProperties)')}` +
      `&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const data = await drive(env, url);
    files.push(...((data && data.files) || []));
    pageToken = (data && data.nextPageToken) || '';
  } while (pageToken);
  return files.filter((f) => f.appProperties && f.appProperties.trelloCardId);
}

function trash(env, fileId) {
  return drive(env, `${FILES}/${fileId}?supportsAllDrives=true&fields=id`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

/**
 * Brings one document's file up to date. `files` are the folder's files already tied to this card.
 * @returns {Promise<'created'|'updated'|'unchanged'>}
 */
async function upsert(env, card, files) {
  const title = titleOf(card.name);
  const markdown = docMarkdown(card.desc);
  const sig = await signature(title, markdown);
  const [keep, ...duplicates] = files;
  for (const dup of duplicates) await trash(env, dup.id); // two webhooks racing can both create
  if (keep && keep.appProperties.sig === sig) return 'unchanged';
  const metadata = { name: fileName(title), appProperties: { trelloCardId: card.id, sig } };
  if (!keep) {
    const m = multipart({ ...metadata, parents: [env.GOOGLE_DRIVE_FOLDER_ID], mimeType: 'text/markdown' }, markdown);
    await drive(env, `${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id`, { method: 'POST', headers: m.headers, body: m.body });
    return 'created';
  }
  const m = multipart(metadata, markdown);
  await drive(env, `${UPLOAD}/${keep.id}?uploadType=multipart&supportsAllDrives=true&fields=id`, { method: 'PATCH', headers: m.headers, body: m.body });
  return 'updated';
}

const inflight = new Map(); // cardId -> { again } : autosave fires a webhook every second or so

async function syncOne(env, cardId) {
  const card = await trello.getCard(env, cardId);
  const files = await listFiles(env, cardId);
  if (!card || !isDocCard(card) || !card.closed) {
    for (const f of files) await trash(env, f.id); // deleted, or no longer a document
    return files.length ? 'trashed' : 'none';
  }
  return upsert(env, card, files);
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

/** Full pass: every document -> file, orphan files -> trash. At most MAX_CHANGES_PER_PASS writes. */
export async function syncAllDocuments(env) {
  if (!driveEnabled(env)) return { enabled: false };
  const summary = { enabled: true, documents: 0, created: 0, updated: 0, trashed: 0, unchanged: 0, remaining: 0 };
  try {
    const cards = ((await trello.getClosedCards(env)) || []).filter(isDocCard);
    const files = await listFiles(env);
    const byCard = new Map();
    for (const f of files) {
      const id = f.appProperties.trelloCardId;
      byCard.set(id, [...(byCard.get(id) || []), f]);
    }
    summary.documents = cards.length;
    let budget = MAX_CHANGES_PER_PASS;
    for (const card of cards) {
      const mine = byCard.get(card.id) || [];
      byCard.delete(card.id);
      if (budget <= 0) {
        // cheap check only: would this document cost a write?
        const sig = await signature(titleOf(card.name), docMarkdown(card.desc));
        if (!mine.length || mine.length > 1 || mine[0].appProperties.sig !== sig) summary.remaining++;
        else summary.unchanged++;
        continue;
      }
      const result = await upsert(env, card, mine);
      summary[result]++;
      if (result !== 'unchanged') budget--;
    }
    for (const orphans of byCard.values()) {
      for (const f of orphans) {
        if (budget <= 0) {
          summary.remaining++;
          continue;
        }
        await trash(env, f.id);
        summary.trashed++;
        budget--;
      }
    }
    docSyncStatus = { at: new Date().toISOString(), ok: true, ...summary };
    return summary;
  } catch (err) {
    const error = String(err && err.message ? err.message : err);
    docSyncStatus = { at: new Date().toISOString(), ok: false, error };
    return { ...summary, error };
  }
}
