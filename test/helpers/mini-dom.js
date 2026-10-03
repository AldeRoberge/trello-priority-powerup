'use strict';

/**
 * Minimal HTML -> duck-typed DOM for tests (no jsdom in this repo).
 * Nodes expose what DocsModel.domToMd reads: nodeType, nodeName, nodeValue, childNodes, getAttribute.
 * Handles tags, quoted attributes, void elements and the few entities the editor emits.
 */
const VOID = new Set(['BR', 'HR', 'IMG', 'INPUT', 'META', 'LINK']);

function decode(s) {
  return s
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function element(name, attrs) {
  return {
    nodeType: 1,
    nodeName: name.toUpperCase(),
    childNodes: [],
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null;
    },
  };
}

function parse(html) {
  const root = element('DIV', {});
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[a-zA-Z_:][-\w:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) {
      const name = m[1].toUpperCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].nodeName === name) {
          stack.length = i;
          break;
        }
      }
    } else if (m[2]) {
      const attrs = {};
      String(m[3] || '').replace(/([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, (_a, k, v1, v2, v3) => {
        attrs[k.toLowerCase()] = decode(v1 != null ? v1 : v2 != null ? v2 : v3 != null ? v3 : '');
        return '';
      });
      const el = element(m[2], attrs);
      top.childNodes.push(el);
      if (!VOID.has(el.nodeName) && !m[4]) stack.push(el);
    } else if (m[5] != null) {
      top.childNodes.push({ nodeType: 3, nodeName: '#text', nodeValue: decode(m[5]), childNodes: [] });
    }
  }
  return root;
}

module.exports = { parse };
