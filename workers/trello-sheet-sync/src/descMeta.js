// Mirror of components/shared/desc-meta.js: Cerveau hides its metadata at the end of the card
// description; the Sheet only ever shows/edits the visible part.

const LEGACY_MARK = /\n\n\[[a-zA-Z0-9_-]+\]:/;

export function splitDesc(desc) {
  const text = String(desc || '').replace(/\r\n/g, '\n');
  const html = /<!--\s*cerveau-meta\b[\s\S]*?-->/i.exec(text);
  if (html) {
    return { visible: text.slice(0, html.index).replace(/\s+$/, ''), hidden: text.slice(html.index) };
  }
  const m = text.match(LEGACY_MARK);
  if (!m) return { visible: text, hidden: '' };
  return { visible: text.slice(0, m.index), hidden: text.slice(m.index) };
}

export function joinDesc(visible, hidden) {
  const v = String(visible || '');
  const h = String(hidden || '');
  if (!h) return v;
  if (!v) return h.replace(/^\s+/, '');
  return /^\s/.test(h) ? v + h : `${v}\n\n${h}`;
}
