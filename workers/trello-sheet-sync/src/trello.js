// Trello REST wrapper (key + token live in Worker secrets).

const API = 'https://api.trello.com/1';
export const CATEGORY_FIELD = 'Catégorie';

async function call(env, path, method = 'GET', body) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${API}${path}${sep}key=${encodeURIComponent(env.TRELLO_KEY)}&token=${encodeURIComponent(env.TRELLO_TOKEN)}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Trello ${method} ${path.split('?')[0]} failed: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export async function getLists(env) {
  return call(env, `/boards/${env.TRELLO_BOARD_ID}/lists?filter=open&fields=id,name`);
}

/** Finds the text custom field "Catégorie"; creates it when `create` is set. Null if unavailable. */
export async function getCategoryField(env, create) {
  try {
    const fields = await call(env, `/boards/${env.TRELLO_BOARD_ID}/customFields`);
    const found = fields.find((f) => f.name === CATEGORY_FIELD && f.type === 'text');
    if (found || !create) return found || null;
    return await call(env, '/customFields', 'POST', {
      idModel: env.TRELLO_BOARD_ID,
      modelType: 'board',
      name: CATEGORY_FIELD,
      type: 'text',
      pos: 'bottom',
    });
  } catch {
    return null; // Custom Fields Power-Up not enabled on the board
  }
}

/** Open cards with their Catégorie value folded in as `card.category`. */
export async function getCards(env, categoryFieldId) {
  const cards = await call(env, `/boards/${env.TRELLO_BOARD_ID}/cards?filter=open&fields=id,name,desc,idList,due,shortUrl,pos&customFieldItems=true`);
  return cards.map((c) => {
    const item = categoryFieldId ? (c.customFieldItems || []).find((i) => i.idCustomField === categoryFieldId) : null;
    return { ...c, category: item && item.value && item.value.text ? item.value.text : '' };
  });
}

export function updateCard(env, id, fields) {
  return call(env, `/cards/${id}`, 'PUT', fields);
}

export function createCard(env, fields) {
  return call(env, '/cards', 'POST', fields);
}

export function setCategory(env, cardId, fieldId, text) {
  return call(env, `/cards/${cardId}/customField/${fieldId}/item`, 'PUT', text ? { value: { text } } : { value: '' });
}

export async function ensureWebhook(env, callbackURL) {
  const hooks = await call(env, `/tokens/${env.TRELLO_TOKEN}/webhooks`);
  if (hooks.some((h) => h.callbackURL === callbackURL && h.idModel === env.TRELLO_BOARD_ID)) return 'exists';
  await call(env, '/webhooks', 'POST', { callbackURL, idModel: env.TRELLO_BOARD_ID, description: 'Cerveau Sheet sync' });
  return 'created';
}
