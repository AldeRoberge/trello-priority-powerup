// Web search for the Entity interview: GET /search?q=... -> { results: [{ title, url, snippet }], answer? }
// Uses Tavily (https://tavily.com) with the secret SEARCH_API_KEY. Without the secret the route answers an
// empty list, so the app simply falls back to the model's own knowledge.

const MAX_RESULTS = 5;
const MAX_SNIPPET = 320;

export function searchEnabled(env) {
  return !!env.SEARCH_API_KEY;
}

/** Keeps only what the app needs: short titles, urls and snippets. */
export function shapeResults(data) {
  const raw = data && Array.isArray(data.results) ? data.results : [];
  const results = raw
    .slice(0, MAX_RESULTS)
    .map((r) => ({
      title: String((r && r.title) || '').slice(0, 140),
      url: String((r && r.url) || '').slice(0, 300),
      snippet: String((r && (r.content || r.snippet)) || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SNIPPET),
    }))
    .filter((r) => r.title && /^https?:\/\//.test(r.url));
  const answer = data && typeof data.answer === 'string' ? data.answer.slice(0, 500) : '';
  return answer ? { results, answer } : { results };
}

export async function searchWeb(env, query) {
  const q = String(query || '').trim().slice(0, 200);
  if (q.length < 2 || !searchEnabled(env)) return { results: [] };
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SEARCH_API_KEY}` },
    body: JSON.stringify({ query: q, max_results: MAX_RESULTS, include_answer: true, search_depth: 'basic' }),
  });
  if (!res.ok) throw new Error(`search failed (${res.status})`);
  return shapeResults(await res.json());
}
