// Documents <-> Google Keep notes (Google Workspace only: the Keep API needs domain-wide delegation).
// A tracked document and a Keep note share a title. Both sides are editable; when both changed
// before a pass, Trello wins (same rule as drive.js).
//
// The Keep API has no update: a change from Trello is a create, then a delete of the old note
// (the note id changes). Only notes whose id this module stored are ever deleted.
//
// Tracked documents: titles in KEEP_LISTS ("a|b|c") plus every "To bring to ..." document (the
// Documents view creates those from the tasks). A Keep note with a tracked title and no document
// becomes a document.
//
// State (document id -> { noteId, sig, noteSig }) lives in one archived card "🗝 Keep sync",
// because the document description is rewritten by the editor and drops unknown keys.
//
//   syncAllKeep(env)   full pass (cron, POST /keep/sync)

import { keepFetch } from './googleSheets.js';
import { joinDesc, splitDesc } from './descMeta.js';
import * as trello from './trello.js';

const MARK = '📄';
const STATE_NAME = '🗝 Keep sync';
const UNTITLED = 'Sans titre';
const MAX_DESC = 16384;
const MAX_CHANGES_PER_PASS = 6;
export const DEFAULT_LISTS = 'To sell/to buy|Todo in Rouyn|Things to pack for Cottage';
const AUTO_PREFIX = /^to bring to\b/i;

export let keepSyncStatus = null;

export const keepEnabled = (env) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String((env && env.KEEP_USER_EMAIL) || ''));

const fold = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const titleOf = (name) => String(name || '').replace(/^📄\s?/, '').trim() || UNTITLED;

export function trackedTitles(env) {
  return String((env && env.KEEP_LISTS) || DEFAULT_LISTS)
    .split('|')
    .map(fold)
    .filter(Boolean);
}

export const isTracked = (env, title) => AUTO_PREFIX.test(String(title || '').trim()) || trackedTitles(env).includes(fold(title));

/* ── Markdown <-> Keep ─────────────────────────────────────────────── */

/** "[@Pain](task:abc)" -> "Pain"; links and light formatting lose their markup (Keep has none). */
export function plain(text) {
  return String(text || '')
    .replace(/\[@?((?:\\.|[^\]\\])*)\]\((?:task|doc|person|entity|https?:)[^)]*\)/g, (_, t) => t.replace(/\\(.)/g, '$1'))
    .replace(/(\*\*|~~|==|\+\+)(.+?)\1/g, '$2')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const RE_HEAD = /^\s{0,3}#{1,6}\s+(.*?)\s*$/;
const RE_ITEM = /^\s{0,3}[-*+]\s+\[( |x|X)\](?:[ \t]+(.*))?$/;
const RE_BULLET = /^\s{0,3}[-*+]\s+(.*)$/;

/**
 * Document -> Keep body. A list (checklist) when the document is made of checkboxes, otherwise a
 * text note. `## Section` becomes a parent item and its checkboxes its children (Keep has one level).
 */
export function markdownToBody(markdown, kind) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  if (kind === 'text') return { text: { text: lines.join('\n').replace(/\s+$/, '') } };
  const items = [];
  let section = null;
  for (const raw of lines) {
    const head = RE_HEAD.exec(raw);
    if (head) {
      const text = plain(head[1]);
      if (text) {
        section = { text: { text }, checked: false, childListItems: [] };
        items.push(section);
      }
      continue;
    }
    const m = RE_ITEM.exec(raw) || RE_BULLET.exec(raw);
    if (!m) continue;
    const box = RE_ITEM.test(raw);
    const text = plain(box ? m[2] : m[1]);
    if (!text) continue;
    const item = { text: { text }, checked: box && m[1] !== ' ' };
    if (section) section.childListItems.push(item);
    else items.push(item);
  }
  for (const it of items) if (it.childListItems && !it.childListItems.length) delete it.childListItems;
  return { list: { listItems: items } };
}

/** Which kind a document should become: checkboxes make a list, anything else stays text. */
export function kindOfMarkdown(markdown) {
  return /^\s{0,3}[-*+]\s+\[[ xX]\]/m.test(String(markdown || '')) ? 'list' : 'text';
}

/**
 * Keep note -> Markdown. `previous` is the current document text: a line whose plain text did not
 * change keeps its original markup (task links, formatting), so a Keep edit does not strip them.
 */
export function bodyToMarkdown(body, previous) {
  if (body && body.text) return String(body.text.text || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  const keep = new Map();
  for (const raw of String(previous || '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = RE_ITEM.exec(raw);
    if (m && m[2] && plain(m[2]) !== m[2].trim()) keep.set(plain(m[2]), m[2]);
  }
  const out = [];
  const line = (it) => {
    const text = String((it.text && it.text.text) || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    out.push(`- [${it.checked ? 'x' : ' '}] ${keep.get(text) || text}`);
  };
  for (const it of (body && body.list && body.list.listItems) || []) {
    const kids = it.childListItems || [];
    if (kids.length) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(`## ${String((it.text && it.text.text) || '').trim() || 'Section'}`, '');
      kids.forEach(line);
      out.push('');
    } else line(it);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
}

export async function signature(title, markdown) {
  const bytes = new TextEncoder().encode(`${title}\n${String(markdown || '').replace(/\s+$/, '')}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── Keep API ──────────────────────────────────────────────────────── */

async function keep(env, path, init) {
  const res = await keepFetch(env, path, init);
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Keep a refusé l'accès (${res.status}). Vérifiez la délégation à l'échelle du domaine (scope keep) et l'API Keep dans la console Admin. ${text}`);
    }
    throw new Error(`Keep ${init && init.method ? init.method : 'GET'} ${path.split('?')[0]} failed: ${res.status} ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function listNotes(env) {
  const notes = [];
  let token = '';
  do {
    const q = `/notes?pageSize=100&filter=${encodeURIComponent('trashed = false')}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const page = await keep(env, q);
    notes.push(...(page.notes || []));
    token = page.nextPageToken || '';
  } while (token && notes.length < 1000);
  return notes;
}

const createNote = (env, title, body) => keep(env, '/notes', { method: 'POST', body: JSON.stringify({ title, body }) });
const deleteNote = (env, name) => keep(env, `/${name}`, { method: 'DELETE' });

/* ── State card ────────────────────────────────────────────────────── */

async function loadState(env, closed) {
  const card = closed.find((c) => c.name === STATE_NAME) || null;
  let docs = {};
  if (card) {
    try {
      docs = JSON.parse(card.desc || '{}').docs || {};
    } catch {
      docs = {};
    }
  }
  return { card, docs };
}

async function saveState(env, state) {
  const desc = JSON.stringify({ docs: state.docs });
  if (state.card) {
    if (state.card.desc !== desc) await trello.updateCard(env, state.card.id, { desc });
    return;
  }
  const listId = (((await trello.getLists(env)) || [])[0] || {}).id || '';
  if (!listId) return;
  const card = await trello.createCard(env, { idList: listId, name: STATE_NAME, desc, pos: 'bottom' });
  await trello.updateCard(env, card.id, { closed: true });
}

/* ── Pass ──────────────────────────────────────────────────────────── */

function cardFromKeep(card, title, markdown) {
  const clean = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 120) || UNTITLED;
  let hidden = card ? splitDesc(card.desc).hidden : '';
  if (hidden && /rev:\s*\d+/.test(hidden)) hidden = hidden.replace(/rev:\s*(\d+)/, (_, n) => `rev: ${Number(n) + 1}`);
  else hidden = `<!--cerveau-meta\ntype: document\nrev: ${card ? 2 : 1}\n-->`;
  const desc = joinDesc(String(markdown || '').replace(/\s+$/, ''), hidden);
  return desc.length > MAX_DESC ? null : { name: `${MARK} ${clean}`, desc };
}

/** Document -> a fresh note, then the old one is deleted (create first: a failed create loses nothing). */
async function pushDoc(env, card, title, markdown, entry, kind) {
  const note = await createNote(env, title, markdownToBody(markdown, kind));
  if (entry && entry.noteId) await deleteNote(env, entry.noteId).catch(() => {});
  return { noteId: note.name, sig: await signature(title, markdown), noteSig: await signature(title, bodyToMarkdown(note.body || markdownToBody(markdown, kind), markdown)), kind };
}

export async function syncAllKeep(env) {
  if (!keepEnabled(env)) return { enabled: false };
  const summary = { enabled: true, documents: 0, created: 0, updated: 0, pulled: 0, imported: 0, unchanged: 0, remaining: 0 };
  try {
    const closed = (await trello.getClosedCards(env)) || [];
    const docs = closed.filter((c) => typeof c.name === 'string' && c.name.startsWith(MARK) && isTracked(env, titleOf(c.name)));
    const state = await loadState(env, closed);
    const notes = await listNotes(env);
    const byName = new Map(notes.map((n) => [n.name, n]));
    const byTitle = new Map();
    for (const n of notes) {
      const k = fold(n.title);
      if (!byTitle.has(k)) byTitle.set(k, n);
    }
    const claimed = new Set();
    let budget = MAX_CHANGES_PER_PASS;
    let dirty = false;
    summary.documents = docs.length;

    for (const card of docs) {
      const title = titleOf(card.name);
      const markdown = splitDesc(card.desc).visible.replace(/\s+$/, '');
      const entry = state.docs[card.id];
      let note = entry && byName.get(entry.noteId);
      if (!note && !entry) note = byTitle.get(fold(title)); // first meeting: adopt the note with the same title
      if (note) claimed.add(note.name);
      if (budget <= 0) {
        summary.remaining++;
        continue;
      }
      if (!note) {
        // new document, or the note was deleted/trashed in Keep: write it out again
        const kind = (entry && entry.kind) || kindOfMarkdown(markdown);
        state.docs[card.id] = await pushDoc(env, card, title, markdown, null, kind);
        summary[entry ? 'updated' : 'created']++;
        budget--;
        dirty = true;
        continue;
      }
      const kind = (entry && entry.kind) || (note.body && note.body.text ? 'text' : 'list');
      const sig = await signature(title, markdown);
      const noteMd = bodyToMarkdown(note.body, markdown);
      const noteSig = await signature(String(note.title || UNTITLED), noteMd);
      if (!entry) {
        // adopted: Trello wins unless the document is empty
        if (!markdown) {
          const built = cardFromKeep(card, note.title || title, noteMd);
          if (built) await trello.updateCard(env, card.id, built);
          state.docs[card.id] = { noteId: note.name, sig: await signature(note.title || title, noteMd), noteSig, kind };
          summary.pulled++;
        } else {
          state.docs[card.id] = await pushDoc(env, card, title, markdown, { noteId: note.name }, kind);
          summary.updated++;
        }
        budget--;
        dirty = true;
        continue;
      }
      const trelloChanged = entry.sig !== sig;
      const keepChanged = entry.noteSig !== noteSig;
      if (!trelloChanged && keepChanged) {
        const built = cardFromKeep(card, note.title || title, noteMd);
        if (!built) {
          summary.unchanged++;
          continue;
        }
        await trello.updateCard(env, card.id, built);
        state.docs[card.id] = { noteId: note.name, sig: await signature(note.title || title, noteMd), noteSig, kind };
        summary.pulled++;
        budget--;
        dirty = true;
      } else if (trelloChanged) {
        state.docs[card.id] = await pushDoc(env, card, title, markdown, entry, kind);
        summary.updated++;
        budget--;
        dirty = true;
      } else summary.unchanged++;
    }

    // Notes with a tracked title and no document become documents
    let listId;
    for (const note of notes) {
      if (claimed.has(note.name) || !isTracked(env, note.title)) continue;
      if (budget <= 0) {
        summary.remaining++;
        continue;
      }
      if (listId === undefined) listId = (((await trello.getLists(env)) || [])[0] || {}).id || '';
      if (!listId) break;
      const md = bodyToMarkdown(note.body, '');
      const built = cardFromKeep(null, note.title, md);
      if (!built) continue;
      const card = await trello.createCard(env, { idList: listId, name: built.name, desc: built.desc, pos: 'bottom' });
      await trello.updateCard(env, card.id, { closed: true });
      state.docs[card.id] = {
        noteId: note.name,
        sig: await signature(note.title, md),
        noteSig: await signature(note.title, md),
        kind: note.body && note.body.text ? 'text' : 'list',
      };
      summary.imported++;
      budget--;
      dirty = true;
    }

    if (dirty) await saveState(env, state);
    keepSyncStatus = { at: new Date().toISOString(), ok: true, ...summary };
    return summary;
  } catch (err) {
    const error = String(err && err.message ? err.message : err);
    keepSyncStatus = { at: new Date().toISOString(), ok: false, error };
    return { ...summary, error };
  }
}
