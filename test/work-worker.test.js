'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const dir = path.join(__dirname, '..', 'workers', 'trello-sheet-sync', 'src', 'work');
const load = (f) => import(pathToFileURL(path.join(dir, f)).href);

const ENV = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 's', SESSION_SECRET: 'shh', WORK_ALLOWED_EMAILS: 'Me@Example.com, other@example.com' };

function idToken(claims) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'RS256' })}.${enc(claims)}.sig`;
}
const good = { iss: 'https://accounts.google.com', aud: 'cid', exp: Math.floor(Date.now() / 1000) + 600, nonce: 'n1', email: 'me@example.com', email_verified: true, name: 'Me' };

test('jwt: a signed token verifies, a forged, expired or foreign one does not', async () => {
  const { signJwt, verifyJwt } = await load('jwt.js');
  const token = await signJwt({ email: 'a@b.c' }, 'secret', 60);
  assert.equal((await verifyJwt(token, 'secret')).email, 'a@b.c');
  assert.equal(await verifyJwt(token, 'other secret'), null);
  assert.equal(await verifyJwt(token.slice(0, -2) + 'xx', 'secret'), null);
  assert.equal(await verifyJwt(await signJwt({ a: 1 }, 'secret', -10), 'secret'), null);
  assert.equal(await verifyJwt('nonsense', 'secret'), null);
  assert.equal(await verifyJwt('', 'secret'), null);
});

test('jwt: readCookie finds one cookie among several', async () => {
  const { readCookie } = await load('jwt.js');
  const req = new Request('https://x.test/', { headers: { cookie: 'a=1; work_session=abc%20d; b=2' } });
  assert.equal(readCookie(req, 'work_session'), 'abc d');
  assert.equal(readCookie(req, 'missing'), '');
});

test('auth: the allowlist is case-insensitive and an unknown address is refused', async () => {
  const { sessionFromIdToken, NotAllowedError, isConfigured } = await load('auth.js');
  assert.equal(isConfigured(ENV), true);
  assert.equal(isConfigured({ ...ENV, WORK_ALLOWED_EMAILS: '' }), false);
  assert.equal(sessionFromIdToken(ENV, idToken(good), 'n1').email, 'me@example.com');
  assert.throws(() => sessionFromIdToken(ENV, idToken({ ...good, email: 'x@y.z' }), 'n1'), NotAllowedError);
});

test('auth: wrong audience, issuer, nonce, expiry or unverified email are refused', async () => {
  const { sessionFromIdToken } = await load('auth.js');
  for (const bad of [{ aud: 'other' }, { iss: 'https://evil.test' }, { nonce: 'zzz' }, { exp: 1 }, { email_verified: false }]) {
    assert.throws(() => sessionFromIdToken(ENV, idToken({ ...good, ...bad }), 'n1'), bad.email_verified === false ? /verified/ : Error, JSON.stringify(bad));
  }
});

test('auth: a session cookie is scoped to /work, HttpOnly, and Secure on https', async () => {
  const { sessionCookie, readSession } = await load('auth.js');
  const { signJwt } = await load('jwt.js');
  const cookie = sessionCookie('tok', 'https://alderoberge.com/work/x');
  assert.match(cookie, /Path=\/work/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(sessionCookie('tok', 'http://localhost:8787/work/x'), /Secure/);
  const token = await signJwt({ email: 'me@example.com', name: 'Me' }, ENV.SESSION_SECRET, 60);
  const ok = await readSession(new Request('https://x.test/', { headers: { cookie: `work_session=${token}` } }), ENV);
  assert.equal(ok.email, 'me@example.com');
  // removing the address from the allowlist ends the session at once
  assert.equal(await readSession(new Request('https://x.test/', { headers: { cookie: `work_session=${token}` } }), { ...ENV, WORK_ALLOWED_EMAILS: 'other@example.com' }), null);
});

const snapRaw = {
  id: 'b1', name: 'B', members: [{ id: 'm1', fullName: 'A' }], labels: [{ id: 'lb1', name: 'Urgent' }], customFields: [],
  lists: [{ id: 'l2', name: 'Deux', pos: 2000 }, { id: 'l1', name: 'Un', pos: 1000 }],
  cards: [
    { id: 'c2', name: 'Deux', idList: 'l2', pos: 1, idMembers: [], idLabels: [] },
    { id: 'c1', name: 'Un', idList: 'l1', pos: 5, idMembers: ['m1'], idLabels: ['lb1'] },
    { id: 'c0', name: 'Un bis', idList: 'l1', pos: 1, idMembers: [], idLabels: [] },
  ],
};

test('model: cards come back in list then position order with members and labels joined', async () => {
  const { normalizeSnapshot, readFromSnapshot } = await load('model.js');
  const snap = normalizeSnapshot(snapRaw);
  const cards = readFromSnapshot(snap, 'cards', [], {});
  assert.deepEqual(cards.map((c) => c.id), ['c0', 'c1', 'c2']);
  assert.equal(cards[1].members[0].fullName, 'A');
  assert.equal(cards[1].labels[0].name, 'Urgent');
  assert.deepEqual(readFromSnapshot(snap, 'cards', ['name'], {})[0], { id: 'c0', name: 'Un bis' });
});

test('model: lists, board, card, list and member answers', async () => {
  const { normalizeSnapshot, readFromSnapshot } = await load('model.js');
  const snap = normalizeSnapshot(snapRaw);
  assert.deepEqual(readFromSnapshot(snap, 'lists', ['name'], {}).map((l) => l.name), ['Un', 'Deux']);
  assert.equal(readFromSnapshot(snap, 'board', [], {}).members.length, 1);
  assert.equal(readFromSnapshot(snap, 'card', ['name'], { card: 'c1' }).name, 'Un');
  assert.throws(() => readFromSnapshot(snap, 'card', [], { card: 'nope' }), (e) => e.name === 'NoCardContext');
  assert.equal(readFromSnapshot(snap, 'list', ['name'], { card: 'c2' }).name, 'Deux');
  assert.equal(readFromSnapshot(snap, 'member', [], { member: 'm1' }).fullName, 'A');
  assert.equal(readFromSnapshot(snap, 'nothing', [], {}), undefined);
});

test('model: a card is reachable by id from a board view, private data is per visibility', async () => {
  const { bucketKey } = await load('model.js');
  const ctx = { board: 'b1', member: 'm1', card: 'c9' };
  assert.equal(bucketKey('board', 'shared', ctx), 'board:b1|shared');
  assert.equal(bucketKey('member', 'private', ctx), 'member:m1|private');
  assert.equal(bucketKey('card', 'shared', ctx), 'card:c9|shared');
  assert.equal(bucketKey('c3', 'shared', ctx), 'card:c3|shared');
});

test('model: Trello plugin data is imported into buckets, bad entries are skipped', async () => {
  const { bucketsFromPluginData } = await load('model.js');
  const out = bucketsFromPluginData(
    [
      { scope: 'board', idModel: 'b1', access: 'shared', value: JSON.stringify({ a: 1 }) },
      { scope: 'board', idModel: 'b1', access: 'private', value: JSON.stringify({ secret: 's' }) },
      { scope: 'member', idModel: 'm1', access: 'private', value: JSON.stringify({ k: 2 }) },
      { scope: 'card', idModel: 'c1', access: 'shared', value: JSON.stringify({ cardPriority: { impact: 3 } }) },
      { scope: 'card', idModel: 'c1', access: 'shared', value: JSON.stringify({ more: true }) },
      { scope: 'board', idModel: 'b1', access: 'shared', value: 'not json' },
      { scope: 'board', idModel: 'b1', access: 'shared', value: '[1]' },
      null,
    ],
    { board: 'b1', member: 'm1' }
  );
  assert.deepEqual(out['board:b1|shared'], { a: 1 });
  assert.deepEqual(out['board:b1|private'], { secret: 's' });
  assert.deepEqual(out['member:m1|private'], { k: 2 });
  assert.deepEqual(out['card:c1|shared'], { cardPriority: { impact: 3 }, more: true });
});

test('model: only the Trello REST API is forwarded, never tokens or webhooks', async () => {
  const { isAllowedTrelloPath } = await load('model.js');
  assert.equal(isAllowedTrelloPath('/1/cards/abc'), true);
  assert.equal(isAllowedTrelloPath('/1/boards/b1/cards'), true);
  for (const bad of ['/1/tokens/x', '/1/webhooks', '/1/members/me/tokens', '/2/cards', '/1/../x', '/1//cards', '/cards', '', '/1/organizations/o']) {
    assert.equal(isAllowedTrelloPath(bad), false, bad);
  }
});

test('model: the Sheet connection of /work goes through the session, not the shared secret', async () => {
  const { sheetConnectionPatch } = await load('model.js');
  const p = sheetConnectionPatch('https://alderoberge.com');
  assert.equal(p.shared.workerUrl, 'https://alderoberge.com/work/api/sheet');
  assert.equal(p.secretUrl, p.shared.workerUrl);
  assert.ok(p.secret);
});

test('page: the Trello SDK script is replaced by the stand-in with the identity injected first', async () => {
  const { rewriteHtml, signInPage } = await load('index.js');
  const html = '<head><script src="https://p.trellocdn.com/power-up.min.js"></script><script src="./a.js"></script></head>';
  const out = rewriteHtml(html, { board: 'b1', member: 'm1', user: { email: '</script>' } });
  assert.match(out, /window\.__WORK__=\{"board":"b1"/);
  assert.match(out, /<script src="\/work\/sdk\.js"><\/script><script src="\.\/a\.js">/);
  assert.doesNotMatch(out, /trellocdn/);
  assert.doesNotMatch(out, /"<\/script>"/); // an address cannot close the script tag
  assert.equal(rewriteHtml('<p>no sdk</p>', {}), '<p>no sdk</p>');
  assert.match(signInPage('not_allowed'), /n’a pas accès/);
  assert.doesNotMatch(signInPage('<b>'), /<b>/);
});
