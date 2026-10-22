/*
 * Role: the left panel every view shares (Dashboard, Documents, Entités): the same header
 * (title, quiet icon actions, round "+" to create), the same search box, and a drag handle
 * on its right edge to resize it on desktop (width remembered per panel).
 * Styling lives in view-shell.css (.sp-*). No Trello. Exposes window.SidePanel.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SidePanel = api;
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  var MIN = 200;
  var MAX = 520;
  var DEFAULT = 264;
  var KEY_PREFIX = 'tp-side-width:';

  function clampWidth(w, max) {
    var n = Number(w);
    if (!isFinite(n)) return DEFAULT;
    var hi = Math.max(MIN, Math.min(MAX, max || MAX));
    return Math.round(Math.max(MIN, Math.min(hi, n)));
  }

  function icon(name) {
    var i = document.createElement('i');
    i.className = 'ti ti-' + name;
    return i;
  }

  function button(opts) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sp-btn' + (opts.accent ? ' sp-btn--accent' : '') + (opts.className ? ' ' + opts.className : '');
    if (opts.title) {
      b.title = opts.title;
      b.setAttribute('aria-label', opts.ariaLabel || opts.title);
    }
    b.appendChild(icon(opts.icon));
    if (opts.onclick) b.addEventListener('click', opts.onclick);
    return b;
  }

  /**
   * opts: { title, extra: [Node], actions: [{ icon, title, onclick, accent, className }] }
   * Quiet actions first, the accent "+" last.
   */
  function head(opts) {
    var row = document.createElement('div');
    row.className = 'sp-head';
    var h1 = document.createElement('h1');
    h1.className = 'sp-title';
    h1.textContent = opts.title || '';
    row.appendChild(h1);
    (opts.extra || []).forEach(function (n) { if (n) row.appendChild(n); });
    (opts.actions || []).forEach(function (a) { row.appendChild(button(a)); });
    return row;
  }

  /**
   * Wraps an existing <input> in the shared search box (magnifier + clear button).
   * opts: { clear: existing clear button (its visibility is managed by the caller) }
   */
  function search(input, opts) {
    opts = opts || {};
    var box = document.createElement('label');
    box.className = 'sp-search';
    input.classList.add('sp-search-input');
    if (!input.placeholder) input.placeholder = 'Rechercher…';
    box.appendChild(icon('search'));
    box.appendChild(input);
    var clear = opts.clear;
    if (!clear) {
      clear = document.createElement('button');
      clear.type = 'button';
      clear.hidden = !input.value;
      clear.setAttribute('aria-label', 'Effacer');
      clear.appendChild(icon('x'));
      clear.addEventListener('click', function () {
        input.value = '';
        clear.hidden = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      });
      input.addEventListener('input', function () { clear.hidden = !input.value; });
    }
    clear.classList.add('sp-search-clear');
    box.appendChild(clear);
    return box;
  }

  function readWidth(key) {
    try {
      var v = global.localStorage && global.localStorage.getItem(KEY_PREFIX + key);
      return v == null ? DEFAULT : clampWidth(v);
    } catch (e) {
      return DEFAULT;
    }
  }

  function saveWidth(key, w) {
    try {
      if (global.localStorage) global.localStorage.setItem(KEY_PREFIX + key, String(w));
    } catch (e) {}
  }

  /**
   * Adds a drag handle on the right edge of `side` (desktop only, see CSS) and restores the
   * saved width. Double-click the handle to go back to the default. Arrow keys resize too.
   */
  function resizable(side, key) {
    function apply(w) {
      side.style.setProperty('--sp-w', w + 'px');
    }
    apply(readWidth(key));
    side.classList.add('sp');
    var grip = document.createElement('div');
    grip.className = 'sp-grip';
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'vertical');
    grip.setAttribute('aria-label', 'Redimensionner le panneau');
    grip.tabIndex = 0;
    side.appendChild(grip);

    function current() {
      return Math.round(side.getBoundingClientRect().width) || readWidth(key);
    }
    function limit() {
      var parent = side.parentElement;
      var total = parent ? parent.getBoundingClientRect().width : MAX * 2;
      return Math.max(MIN, Math.min(MAX, total - 320));
    }
    function set(w, persist) {
      var next = clampWidth(w, limit());
      apply(next);
      if (persist) saveWidth(key, next);
      return next;
    }

    grip.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      var startX = e.clientX;
      var startW = current();
      var last = startW;
      grip.classList.add('is-drag');
      document.documentElement.classList.add('sp-resizing');
      try { grip.setPointerCapture(e.pointerId); } catch (err) {}
      function move(ev) { last = set(startW + (ev.clientX - startX), false); }
      function done() {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', done);
        grip.removeEventListener('pointercancel', done);
        grip.classList.remove('is-drag');
        document.documentElement.classList.remove('sp-resizing');
        saveWidth(key, last);
      }
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', done);
      grip.addEventListener('pointercancel', done);
    });
    grip.addEventListener('dblclick', function () { set(DEFAULT, true); });
    grip.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      set(current() + (e.key === 'ArrowRight' ? 16 : -16), true);
    });
    return grip;
  }

  return { head: head, search: search, button: button, resizable: resizable, clampWidth: clampWidth, MIN: MIN, MAX: MAX, DEFAULT: DEFAULT };
});
