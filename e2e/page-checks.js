'use strict';
/*
 * Health checks run inside the page (and every iframe) after the user did something. Each returns
 * plain objects { kind, message } so the fixture can record them as problems.
 *
 *   blank-page        nothing visible rendered
 *   stuck-skeleton    loading placeholders (.sk) still on screen after the view settled
 *   broken-text       "undefined", "NaN", "[object Object]", "Invalid Date" shown to the user
 *   h-overflow        the document scrolls sideways (a view must scroll inside its own panes)
 *   clipped-text      text cut by overflow:hidden without wrapping or an ellipsis
 *   unnamed-control   button / link / field with no text, title, aria-label or placeholder
 *   broken-image      <img> that failed to load
 *   duplicate-id      the same id twice in one document
 *   offscreen-popup   a menu / popover (fixed or absolute, high z-index) cut by the viewport
 */

/* eslint-disable no-undef */
function inPageChecks(opts) {
  const out = [];
  const add = (kind, message) => {
    if (out.length < 60) out.push({ kind, message });
  };
  const doc = document;
  const win = window;
  if (doc.readyState !== 'complete') return out; // still loading: nothing to judge yet
  if (win.frameElement) {
    // the connector runs in a hidden iframe on the fake board; its markup is not on screen
    const fr = win.frameElement.getBoundingClientRect();
    if (!fr.width || !fr.height || win.parent.getComputedStyle(win.frameElement).display === 'none') return out;
  }
  const isVisible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = win.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    return true;
  };
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    if (cls) s += '.' + cls;
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (txt) s += ' "' + txt + '"';
    return s;
  };

  // blank page
  const body = doc.body;
  if (!body || !(body.innerText || '').trim().length) {
    if (!body || !body.querySelector('canvas, svg, img, iframe, input')) add('blank-page', 'No visible content was rendered');
  }

  // stuck skeletons
  if (!opts.loading) {
    const sk = Array.from(doc.querySelectorAll('.sk, .sk-box')).filter(isVisible);
    if (sk.length) add('stuck-skeleton', sk.length + ' loading placeholder(s) still visible, first: ' + describe(sk[0]));
  }

  // broken text
  const text = (body && body.innerText) || '';
  const bad = /\b(undefined|NaN|Invalid Date)\b|\[object Object\]/.exec(text);
  if (bad) {
    const at = Math.max(0, bad.index - 25);
    add('broken-text', 'Visible text contains "' + bad[0] + '": …' + text.slice(at, bad.index + 40).replace(/\s+/g, ' ') + '…');
  }

  // horizontal overflow of the document
  const root = doc.documentElement;
  if (root.scrollWidth > win.innerWidth + 1) {
    let culprit = '';
    const all = doc.querySelectorAll('body *');
    for (let i = 0; i < all.length; i++) {
      const r = all[i].getBoundingClientRect();
      if (r.right > win.innerWidth + 1 && isVisible(all[i]) && !all[i].closest('[hidden]')) {
        const cs = win.getComputedStyle(all[i]);
        if (cs.position !== 'fixed') {
          culprit = describe(all[i]) + ' (right edge ' + Math.round(r.right) + 'px > viewport ' + win.innerWidth + 'px)';
          break;
        }
      }
    }
    add('h-overflow', 'The page scrolls sideways: scrollWidth ' + root.scrollWidth + ' > ' + win.innerWidth + (culprit ? '; first: ' + culprit : ''));
  }

  // clipped text (overflow hidden, content wider than box, no ellipsis, no wrapping)
  let clipped = 0;
  const leaves = doc.querySelectorAll('body *');
  for (let i = 0; i < leaves.length && clipped < 6; i++) {
    const el = leaves[i];
    if (el.children.length > 0 || !(el.textContent || '').trim()) continue;
    if (el.closest('svg, script, style, [hidden], textarea, pre, code, canvas')) continue;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'inline') continue;
    const clips = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
    if (!clips || cs.textOverflow === 'ellipsis') continue;
    // clientWidth <= 4: visually hidden labels (screen-reader only), not text a user can see
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 4 && isVisible(el)) {
      clipped++;
      add('clipped-text', describe(el) + ' is cut off (' + el.scrollWidth + 'px of text in ' + el.clientWidth + 'px)');
    }
  }

  // controls with no accessible name
  let unnamed = 0;
  const controls = doc.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="menuitem"], input:not([type="hidden"]), select, textarea');
  for (let i = 0; i < controls.length && unnamed < 8; i++) {
    const el = controls[i];
    if (!isVisible(el)) continue;
    const name =
      (el.getAttribute('aria-label') || '').trim() ||
      (el.getAttribute('title') || '').trim() ||
      (el.getAttribute('placeholder') || '').trim() ||
      (el.getAttribute('aria-labelledby') ? 'x' : '') ||
      (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio') && el.closest('label') ? 'x' : '') ||
      (el.labels && el.labels.length ? 'x' : '') ||
      (el.tagName === 'INPUT' && el.value && /button|submit|reset/.test(el.type) ? el.value : '') ||
      (el.tagName === 'SELECT' && el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '') ||
      (el.innerText || el.textContent || '').trim() ||
      (el.querySelector('img[alt]:not([alt=""]), svg title') ? 'x' : '');
    if (!name) {
      unnamed++;
      add('unnamed-control', describe(el) + ' has no text, title or aria-label');
    }
  }

  // broken images (same-origin only: external ones are blocked on purpose)
  Array.from(doc.images || []).forEach((img) => {
    if (img.complete && img.naturalWidth === 0 && img.src && img.src.indexOf(location.origin) === 0 && isVisible(img)) {
      add('broken-image', 'Image did not load: ' + img.src.replace(location.origin, ''));
    }
  });

  // duplicate ids
  const seen = {};
  const dups = [];
  doc.querySelectorAll('[id]').forEach((el) => {
    if (seen[el.id]) {
      if (dups.indexOf(el.id) < 0) dups.push(el.id);
    } else seen[el.id] = true;
  });
  if (dups.length) add('duplicate-id', 'Duplicate id' + (dups.length > 1 ? 's' : '') + ': ' + dups.slice(0, 5).join(', '));

  // popovers cut by the viewport
  const pops = doc.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], [class*="context-menu"], [class*="popover"], [class*="-pop"]');
  Array.from(pops).forEach((el) => {
    if (!isVisible(el)) return;
    const cs = win.getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
    const r = el.getBoundingClientRect();
    if (r.width > 40 && r.height > 20 && (r.left < -2 || r.top < -2 || r.right > win.innerWidth + 2 || r.bottom > win.innerHeight + 2)) {
      add('offscreen-popup', describe(el) + ' is cut by the window (' + Math.round(r.left) + ',' + Math.round(r.top) + ' → ' + Math.round(r.right) + ',' + Math.round(r.bottom) + ' in ' + win.innerWidth + 'x' + win.innerHeight + ')');
    }
  });

  return out;
}

/** Runs the checks in the top page and in every iframe that has content. */
async function runChecks(page, opts) {
  let issues = await runChecksOnce(page, opts);
  if (issues.some((i) => i.kind === 'stuck-skeleton')) {
    // a view may be mid-load (the user just changed tab): only report placeholders that stay
    await page.waitForTimeout(2500);
    const again = await runChecksOnce(page, opts);
    const stuck = again.filter((i) => i.kind === 'stuck-skeleton');
    issues = issues.filter((i) => i.kind !== 'stuck-skeleton').concat(stuck);
  }
  return issues;
}

async function runChecksOnce(page, opts) {
  const issues = [];
  for (const frame of page.frames()) {
    let found;
    try {
      found = await frame.evaluate(inPageChecks, { loading: !!(opts && opts.loading) });
    } catch (err) {
      continue; // frame navigating or detached
    }
    const isTop = frame === page.mainFrame();
    let where = '';
    if (!isTop) {
      try {
        where = new URL(frame.url()).pathname.replace(/^\//, '') + ': ';
      } catch (e) {
        where = 'iframe: ';
      }
    }
    found.forEach((f) => issues.push({ kind: f.kind, message: where + f.message }));
  }
  return issues;
}

/** Waits until the view is no longer showing loading placeholders (or the time is up). */
async function waitSettled(page, timeout) {
  const end = Date.now() + (timeout || 8000);
  while (Date.now() < end) {
    let busy = false;
    for (const frame of page.frames()) {
      try {
        busy = busy || (await frame.evaluate(() => Array.from(document.querySelectorAll('.sk')).some((el) => el.getBoundingClientRect().width > 0)));
      } catch (e) { /* frame gone */ }
    }
    if (!busy) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

module.exports = { runChecks, waitSettled, inPageChecks };
