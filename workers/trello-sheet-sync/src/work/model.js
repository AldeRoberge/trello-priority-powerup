// Pure logic of /work (no network, no Durable Object): how a Power-Up client call (t.get, t.cards...)
// is answered from a Trello board snapshot plus the plugin-data store. Mirrors e2e/fake-trello/model.js,
// which is the reference for the shapes the views expect.

/** REST query that returns the whole board in one call. */
export const SNAPSHOT_QUERY =
  'fields=name,desc,closed,url,shortUrl' +
  '&members=all&member_fields=fullName,username,initials,avatarUrl' +
  '&labels=all&label_fields=name,color' +
  '&customFields=true' +
  '&lists=open&list_fields=name,pos,closed' +
  '&cards=open&card_fields=name,desc,idList,pos,closed,due,start,dueComplete,idMembers,idLabels,idShort,shortLink,shortUrl,url,dateLastActivity,badges,cover' +
  '&card_customFieldItems=true';

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Where a value lives: one bucket per model (board, member, card) and visibility. */
export function bucketKey(scope, visibility, ctx) {
  let key;
  if (scope === 'board') key = `board:${ctx.board}`;
  else if (scope === 'member') key = `member:${ctx.member}`;
  else if (scope === 'organization') key = 'organization:o';
  else if (scope === 'card') key = `card:${ctx.card || ''}`;
  else key = `card:${scope}`; // a card id: a board view reads other cards
  return visibility === 'private' ? `${key}|private` : `${key}|shared`;
}

export function pickObject(obj, fields) {
  if (!fields || !fields.length) return clone(obj);
  const out = {};
  for (const f of fields) if (obj && f in obj) out[f] = clone(obj[f]);
  if (obj && obj.id) out.id = obj.id;
  return out;
}

export function normalizeSnapshot(raw) {
  const r = raw || {};
  const cards = Array.isArray(r.cards) ? r.cards : [];
  return {
    board: { id: r.id, name: r.name, desc: r.desc || '', closed: !!r.closed, url: r.url, shortUrl: r.shortUrl },
    members: Array.isArray(r.members) ? r.members : [],
    labels: Array.isArray(r.labels) ? r.labels : [],
    customFields: Array.isArray(r.customFields) ? r.customFields : [],
    lists: (Array.isArray(r.lists) ? r.lists : []).slice().sort((a, b) => a.pos - b.pos),
    cards,
  };
}

export function cardView(snap, card, fields) {
  const members = snap.members.filter((m) => (card.idMembers || []).includes(m.id));
  const labels = snap.labels.filter((l) => (card.idLabels || []).includes(l.id));
  const full = { ...card, idBoard: snap.board.id, members: clone(members), labels: clone(labels), customFieldItems: card.customFieldItems || [] };
  if (!fields || !fields.length) return clone(full);
  const out = { id: card.id };
  for (const f of fields) if (f in full) out[f] = clone(full[f]);
  return out;
}

function listPos(snap, idList) {
  const l = snap.lists.find((x) => x.id === idList);
  return l ? l.pos : 0;
}

/** Answers the board and card calls from a snapshot. Returns undefined for a method that is not a snapshot read. */
export function readFromSnapshot(snap, method, args, ctx, me) {
  args = args || [];
  switch (method) {
    case 'board':
      return pickObject({ ...snap.board, members: snap.members, labels: snap.labels, customFields: snap.customFields }, args);
    case 'lists':
      return snap.lists
        .filter((l) => !l.closed)
        .map((l) => pickObject({ ...l, cards: snap.cards.filter((c) => c.idList === l.id).map((c) => cardView(snap, c)) }, args));
    case 'cards':
      return snap.cards
        .filter((c) => !c.closed)
        .slice()
        .sort((a, b) => listPos(snap, a.idList) - listPos(snap, b.idList) || a.pos - b.pos)
        .map((c) => cardView(snap, c, args));
    case 'card': {
      const card = snap.cards.find((c) => c.id === ctx.card || c.shortLink === ctx.card);
      if (!card) throw Object.assign(new Error('No card in this iframe context'), { name: 'NoCardContext' });
      return cardView(snap, card, args.length ? args : null);
    }
    case 'list': {
      const card = snap.cards.find((c) => c.id === ctx.card);
      const list = snap.lists.find((l) => l.id === (card ? card.idList : ctx.list));
      if (!list) throw Object.assign(new Error('No list in this iframe context'), { name: 'NoListContext' });
      return pickObject(list, args);
    }
    case 'member': {
      const m = snap.members.find((x) => x.id === ctx.member) || me || { id: ctx.member };
      return pickObject(m, args);
    }
    case 'organization':
      return pickObject({ id: 'o', name: 'work', displayName: 'Work' }, args);
    case 'isMemberSignedIn':
    case 'memberCanWriteToModel':
      return true;
    default:
      return undefined;
  }
}

/** Trello plugin-data entries -> { bucketKey: { key: value } }. Entries are { scope, idModel, access, value: '{"k":...}' }. */
export function bucketsFromPluginData(entries, ctx) {
  const out = {};
  for (const e of entries || []) {
    if (!e || typeof e !== 'object') continue;
    let value = e.value;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        continue;
      }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const scope = e.scope === 'organization' ? 'organization' : e.scope;
    if (scope !== 'board' && scope !== 'card' && scope !== 'member' && scope !== 'organization') continue;
    const key = bucketKey(scope === 'card' ? e.idModel : scope, e.access === 'private' ? 'private' : 'shared', {
      board: scope === 'board' ? e.idModel : ctx.board,
      member: scope === 'member' ? e.idModel : ctx.member,
      card: scope === 'card' ? e.idModel : '',
    });
    out[key] = { ...(out[key] || {}), ...value };
  }
  return out;
}

/** Keys the standalone app overrides for itself: the Sheet connection goes through the signed-in session. */
export function sheetConnectionPatch(origin) {
  const url = `${origin}/work/api/sheet`;
  return { shared: { workerUrl: url }, secret: 'work-session', secretUrl: url };
}

/** Only calls to the Trello REST API under /1/ are forwarded, never anything about tokens or webhooks. */
export function isAllowedTrelloPath(path) {
  const p = String(path || '');
  if (!/^\/1\/[A-Za-z]/.test(p)) return false;
  if (p.includes('..') || p.includes('//')) return false;
  if (/^\/1\/(tokens|webhooks|enterprises|organizations)(\/|$)/i.test(p)) return false;
  if (/^\/1\/members\/[^/]+\/(tokens|applications|enterprises)(\/|$)/i.test(p)) return false;
  return true;
}
