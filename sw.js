/*
 * Service worker of the Notes app: opens it offline. The app shell is cached as it is used and
 * refreshed in the background (stale-while-revalidate, GitHub Pages caches for 10 minutes only).
 * Trello calls are never cached: the notes themselves live in IndexedDB.
 */
const CACHE = 'keep-shell-v1';
const SHELL = [
  './keep.html',
  './manifest.webmanifest',
  './assets/notes-192.png',
  './assets/notes-180.png',
  './components/keep/keep-ui.css',
  './components/keep/keep-model.js',
  './components/keep/keep-store.js',
  './components/keep/keep-sync.js',
  './components/keep/keep-auth.js',
  './components/keep/keep-ui.js',
  './components/keep/keep-boot.js',
  './components/shared/rest-config.js',
  './components/sheets/sheets-trello.js',
  './components/docs/docs-model.js',
  './components/docs/docs-trello.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(SHELL.map((u) => cache.add(u).catch(() => {})))).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'api.trello.com' || url.hostname === 'trello.com') return;
  const sameOrigin = url.origin === self.location.origin;
  const cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!sameOrigin && !cdn) return;
  // Pages version their assets with ?v=...: match without the query so an old copy still opens offline
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return (await network) || (req.mode === 'navigate' ? cache.match('./keep.html') : Response.error());
    }),
  );
});
