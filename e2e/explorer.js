'use strict';
/*
 * Click-everything explorer: a seeded, reproducible "monkey" that uses a page the way a person
 * would, with the real mouse and keyboard. Each step picks something visible (a button, a row, a
 * field, a menu item...), clicks / right-clicks / double-clicks / types / drags it, and the
 * fixtures watch for uncaught errors, console errors, failed requests and a frozen page. Every 8
 * steps the layout checks run too. The last actions are copied onto each problem as repro steps.
 *
 *   await explore(app, { steps: 80, seed: 'table' })
 *
 * E2E_STEPS, E2E_EXPLORE_MS and E2E_SEED override the budget and the seed.
 */
const { runChecks } = require('./page-checks');

const TEXTS = [
  'Test',
  'Réunion demain à 14 h',
  'a',
  'x'.repeat(400),
  '<b>gras</b> & "guillemets" \'simples\'',
  '日本語 😀 émoji',
  '   ',
  '42',
  '-1',
  '2026-12-31',
  '@Alex #Urgent !p1',
  '[[lien]] **fort** _it_',
  'ligne 1\nligne 2',
  '0',
  '99999999999',
  '${injection} {{x}} %s',
];

const KEYS = ['Escape', 'Enter', 'Tab', 'Shift+Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace', 'Control+z', 'Control+Shift+z', 'Control+a', 'Control+c', 'Control+v', 'Space', 'Home', 'End', '/', '?'];

function rng(seedText) {
  let h = 1779033703 ^ String(seedText).length;
  for (let i = 0; i < String(seedText).length; i++) {
    h = Math.imul(h ^ String(seedText).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Runs in each frame: tags what a user could interact with right now and describes it. */
function collectTargets(opts) {
  const SEL = [
    'button', 'a[href]', '[role="button"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]', '[role="checkbox"]', '[role="switch"]', 'summary',
    'input:not([type="hidden"]):not([type="file"])', 'select', 'textarea', '[contenteditable=""]', '[contenteditable="true"]', '[draggable="true"]',
    '[tabindex]:not([tabindex="-1"])', 'tr[data-id]', '[data-id]', '[data-card-id]', '[onclick]',
  ].join(',');
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const seen = new Set();
  const out = [];
  document.querySelectorAll('[data-pw-x]').forEach((e) => e.removeAttribute('data-pw-x'));
  const labelOf = (el) => {
    const t = (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.innerText || el.value || '').trim().replace(/\s+/g, ' ');
    return t.slice(0, 40);
  };
  const consider = (el) => {
    if (seen.has(el) || el.closest('[hidden], [inert], [aria-hidden="true"]')) return;
    seen.add(el);
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none' || Number(cs.opacity) === 0) return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      if (/^(mailto:|tel:|javascript:)/i.test(href) || el.hasAttribute('download')) return;
    }
    const type = (el.getAttribute('type') || '').toLowerCase();
    let kind = 'click';
    if (tag === 'select') kind = 'select';
    else if (tag === 'textarea' || el.isContentEditable || (tag === 'input' && !/^(checkbox|radio|button|submit|reset|range|color|image)$/.test(type))) kind = 'text';
    else if (type === 'range') kind = 'range';
    else if (el.draggable || el.closest('[draggable="true"]')) kind = 'drag';
    const id = String(out.length);
    el.setAttribute('data-pw-x', id);
    out.push({ id, kind, tag, label: labelOf(el), x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 24), nav: tag === 'a' && !el.target && !/^https?:/i.test(el.getAttribute('href') || '') });
  };
  document.querySelectorAll(SEL).forEach(consider);
  if (opts.pointer) {
    // clickable things drawn as plain elements (rows, cards, chips)
    const all = document.body ? document.body.querySelectorAll('*') : [];
    for (let i = 0; i < all.length && out.length < 500; i++) {
      const el = all[i];
      if (seen.has(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.cursor === 'pointer' && !(el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer')) consider(el);
    }
  }
  return out.slice(0, 500);
}

async function withTimeout(promise, ms, label) {
  let timer;
  const t = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(label + ' timed out after ' + ms + ' ms')), ms);
  });
  try {
    return await Promise.race([promise, t]);
  } finally {
    clearTimeout(timer);
  }
}

async function targetsOf(page) {
  const all = [];
  for (const frame of page.frames()) {
    if (frame.isDetached()) continue;
    try {
      const list = await withTimeout(frame.evaluate(collectTargets, { pointer: true }), 2500, 'collect');
      list.forEach((t) => all.push(Object.assign(t, { frame })));
    } catch (e) { /* frame busy or gone */ }
  }
  return all;
}

async function explore(app, opts) {
  opts = opts || {};
  const page = app.page;
  const problems = app.problems;
  const steps = Number(process.env.E2E_STEPS) || opts.steps || 80;
  const budget = Number(process.env.E2E_EXPLORE_MS) || opts.ms || 40000;
  const seed = process.env.E2E_SEED || opts.seed || 'explore';
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const started = Date.now();
  const startPath = new URL(page.url()).pathname;
  problems.info('explore', 'seed "' + seed + '", up to ' + steps + ' steps');
  page.on('filechooser', (fc) => fc.setFiles([]).catch(() => {}));

  const alive = async () => {
    try {
      await withTimeout(page.evaluate(() => 1), 8000, 'ping');
      return true;
    } catch (e) {
      return false;
    }
  };

  let done = 0;
  for (let i = 0; i < steps && Date.now() - started < budget; i++) {
    if (page.isClosed()) break;
    const targets = await targetsOf(page);
    if (!targets.length) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(120);
      continue;
    }
    // Staying on the page under test is the point; navigating away stays possible but rare.
    let candidates = targets.filter((t) => !(t.nav && rand() < 0.92));
    if (!candidates.length) candidates = targets;
    const t = pick(candidates);
    const where = t.tag + (t.label ? ' "' + t.label + '"' : '');
    const roll = rand();
    const before = problems.list.length;
    try {
      if (t.kind === 'select') {
        problems.step('choose an option in ' + where);
        const loc = t.frame.locator('[data-pw-x="' + t.id + '"]');
        const values = await loc.evaluate((el) => Array.from(el.options).map((o) => o.value));
        if (values.length) await loc.selectOption(pick(values), { timeout: 1500 });
      } else if (t.kind === 'text') {
        const text = pick(TEXTS);
        problems.step('type ' + JSON.stringify(text.slice(0, 24)) + ' in ' + where);
        const loc = t.frame.locator('[data-pw-x="' + t.id + '"]');
        await loc.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
        const box = await loc.boundingBox();
        if (box) await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20));
        if (rand() < 0.5) await page.keyboard.press('Control+a');
        await page.keyboard.type(text.slice(0, 120), { delay: 0 });
        const after = rand();
        if (after < 0.45) await page.keyboard.press('Enter');
        else if (after < 0.6) await page.keyboard.press('Escape');
        else if (after < 0.8) await page.keyboard.press('Tab');
      } else if (t.kind === 'range') {
        problems.step('drag the slider ' + where);
        const loc = t.frame.locator('[data-pw-x="' + t.id + '"]');
        const box = await loc.boundingBox();
        if (box) {
          await page.mouse.move(box.x + 4, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * rand(), box.y + box.height / 2, { steps: 4 });
          await page.mouse.up();
        }
      } else if (roll < 0.07 && targets.length > 1) {
        const to = pick(targets);
        problems.step('drag ' + where + ' onto ' + to.tag + (to.label ? ' "' + to.label + '"' : ''));
        const a = await t.frame.locator('[data-pw-x="' + t.id + '"]').boundingBox();
        const b = await to.frame.locator('[data-pw-x="' + to.id + '"]').boundingBox();
        if (a && b) {
          await page.mouse.move(a.x + a.width / 2, a.y + Math.min(a.height / 2, 20));
          await page.mouse.down();
          await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 20), { steps: 6 });
          await page.mouse.up();
        }
      } else if (roll < 0.15) {
        problems.step('right-click ' + where);
        await page.mouse.click(t.x, t.y, { button: 'right' });
      } else if (roll < 0.2) {
        problems.step('double-click ' + where);
        await page.mouse.dblclick(t.x, t.y);
      } else if (roll < 0.26) {
        problems.step('hover ' + where);
        await page.mouse.move(t.x, t.y, { steps: 3 });
        await page.waitForTimeout(120);
      } else if (roll < 0.34) {
        const key = pick(KEYS);
        problems.step('press ' + key);
        await page.keyboard.press(key);
      } else if (roll < 0.38) {
        problems.step('scroll over ' + where);
        await page.mouse.move(t.x, t.y);
        await page.mouse.wheel(rand() < 0.3 ? 200 : 0, rand() < 0.5 ? 300 : -300);
      } else {
        problems.step('click ' + where);
        await page.mouse.click(t.x, t.y);
      }
    } catch (err) {
      if (page.isClosed()) break;
      problems.info('explore-step', 'step failed: ' + String(err.message).split('\n')[0].slice(0, 160));
    }
    done++;
    await page.waitForTimeout(70);

    if (!(await alive())) {
      problems.error('page-hung', 'The page stopped responding for 8 s (infinite loop or very slow handler)');
      break;
    }
    if (i % 8 === 7 || problems.list.length > before) {
      const issues = await runChecks(page).catch(() => []);
      issues.forEach((x) => problems.warn(x.kind, x.message));
    }
    // A modal opened by the fake host or a navigation is fine; remember where we are.
    if (rand() < 0.04 && new URL(page.url()).pathname !== startPath) {
      problems.step('(now on ' + new URL(page.url()).pathname + ')');
    }
  }
  problems.info('explore', done + ' actions in ' + Math.round((Date.now() - started) / 1000) + ' s');
  return done;
}

module.exports = { explore, rng, collectTargets };
