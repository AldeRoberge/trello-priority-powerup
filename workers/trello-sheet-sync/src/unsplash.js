// Unsplash search for document covers: GET /unsplash?q=... -> { enabled, results: [{ k:'unsplash', v, x, by, u }] }
// Uses the official API with the secret UNSPLASH_ACCESS_KEY (https://unsplash.com/oauth/applications).
// Without the secret the route answers { enabled: false } and the app shows its curated gallery instead.

const PER_PAGE = 24;

export function unsplashEnabled(env) {
  return !!env.UNSPLASH_ACCESS_KEY;
}

/** Keeps what a cover needs: the photo id (images.unsplash.com/<id>), its ixid and the author credit. */
export function shapePhotos(data) {
  const raw = data && Array.isArray(data.results) ? data.results : [];
  return raw
    .map((p) => {
      const m = /^https:\/\/images\.unsplash\.com\/(photo-[A-Za-z0-9-]{6,80})(?:\?(.*))?$/.exec((p && p.urls && p.urls.raw) || '');
      if (!m || (p && p.premium)) return null;
      const ix = /(?:^|&)ixid=([A-Za-z0-9_-]{1,80})/.exec(m[2] || '');
      const user = (p && p.user) || {};
      const out = { k: 'unsplash', v: m[1] };
      if (ix) out.x = ix[1];
      if (user.name) out.by = String(user.name).slice(0, 60);
      if (user.username) out.u = String(user.username).slice(0, 60);
      return out;
    })
    .filter(Boolean);
}

export async function searchUnsplash(env, query) {
  if (!unsplashEnabled(env)) return { enabled: false, results: [] };
  const q = String(query || '').trim().slice(0, 100);
  if (q.length < 2) return { enabled: true, results: [] };
  const url = `https://api.unsplash.com/search/photos?per_page=${PER_PAGE}&orientation=landscape&content_filter=high&query=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`, 'accept-version': 'v1' } });
  if (!res.ok) throw new Error(`unsplash search failed (${res.status})`);
  return { enabled: true, results: shapePhotos(await res.json()) };
}
