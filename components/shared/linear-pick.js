/*
 * Role: shared searchable picker in the style of Linear's "Changer le statut…" popover. One list of
 * choices with a filter field on top, a check on the current one and 1-9 shortcuts: Table, Kanban and
 * the new-card composer all pick a status / urgency / category through it.
 *
 *   LinearPick.open({
 *     anchor,                 // element the popover hangs from (or a { x, y } point)
 *     placeholder,            // filter field text, e.g. 'Changer le statut…'
 *     items: [{ id, label, icon?, color?, hint? }],
 *     current,                // id of the checked item
 *     onPick(item),           // called once, then the popover closes
 *     onClose(),              // optional
 *   })
 *   LinearPick.close()
 *
 * Pure helpers (filterItems, digitIndex) are exported for unit tests.
 */
(function (global) {
  'use strict';

  var current = null;

  function norm(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    return typeof t.normalize === 'function' ? t.normalize('NFD').replace(/[̀-ͯ]/g, '') : t;
  }

  /** Items whose label contains every word of `q` (accent and case blind); all of them when `q` is empty. */
  function filterItems(items, q) {
    var words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return (items || []).slice();
    return (items || []).filter(function (it) {
      var label = norm(it.label);
      return words.every(function (w) { return label.indexOf(w) !== -1; });
    });
  }

  /** "1".."9" -> 0..8, anything else -> -1 (the shortcut shown next to the nth item). */
  function digitIndex(key) {
    return /^[1-9]$/.test(String(key)) ? Number(key) - 1 : -1;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function close() {
    if (!current) return;
    var c = current;
    current = null;
    document.removeEventListener('mousedown', c.onDown, true);
    document.removeEventListener('keydown', c.onKey, true);
    if (c.root.parentNode) c.root.parentNode.removeChild(c.root);
    if (typeof c.opts.onClose === 'function') c.opts.onClose();
  }

  function place(root, anchor) {
    var narrow = global.ViewShell && typeof global.ViewShell.isNarrow === 'function'
      ? global.ViewShell.isNarrow()
      : (window.innerWidth || 1024) <= 640;
    if (narrow) {
      root.classList.add('is-sheet');
      root.style.left = '8px';
      root.style.right = '8px';
      root.style.top = 'auto';
      root.style.bottom = '8px';
      return;
    }
    var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: (anchor && anchor.x) || 0, bottom: (anchor && anchor.y) || 0, top: (anchor && anchor.y) || 0 };
    var w = root.offsetWidth;
    var h = root.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    root.style.left = left + 'px';
    root.style.top = top + 'px';
  }

  function open(opts) {
    opts = opts || {};
    close();
    var items = opts.items || [];
    var root = el('div', 'lp-pop');
    root.setAttribute('role', 'listbox');
    var input = el('input', 'lp-input');
    input.type = 'text';
    input.placeholder = opts.placeholder || 'Rechercher…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    var list = el('div', 'lp-list');
    root.appendChild(input);
    root.appendChild(list);
    var shown = [];
    var active = 0;

    function pick(it) {
      if (!it) return;
      var cb = opts.onPick;
      close();
      if (typeof cb === 'function') cb(it);
    }

    function paint() {
      list.textContent = '';
      shown = filterItems(items, input.value);
      if (active >= shown.length) active = Math.max(0, shown.length - 1);
      if (!shown.length) list.appendChild(el('div', 'lp-empty', 'Aucun résultat'));
      shown.forEach(function (it, i) {
        var row = el('button', 'lp-item' + (i === active ? ' is-active' : ''));
        row.type = 'button';
        row.setAttribute('role', 'option');
        if (it.icon) {
          var ic = el('i', 'ti ti-' + it.icon + ' lp-icon');
          if (it.color) ic.style.color = it.color;
          row.appendChild(ic);
        } else if (it.color) {
          var dot = el('span', 'lp-dot');
          dot.style.background = it.color;
          row.appendChild(dot);
        }
        row.appendChild(el('span', 'lp-label', it.label));
        if (it.id === opts.current) row.appendChild(el('i', 'ti ti-check lp-check'));
        var hint = it.hint || (!input.value && i < 9 ? String(i + 1) : '');
        if (hint) row.appendChild(el('kbd', 'lp-key', hint));
        row.addEventListener('mouseenter', function () {
          active = i;
          Array.prototype.forEach.call(list.children, function (n, j) { n.classList.toggle('is-active', j === i); });
        });
        row.addEventListener('click', function () { pick(it); });
        list.appendChild(row);
      });
      var on = list.querySelector('.is-active');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', function () { active = 0; paint(); });

    function onKey(e) {
      if (!current || current.root !== root) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (shown.length) active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
        paint();
      } else if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        pick(shown[active]);
      } else if (!input.value && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var d = digitIndex(e.key);
        if (d >= 0 && d < shown.length) { e.preventDefault(); e.stopPropagation(); pick(shown[d]); }
      }
    }
    function onDown(e) { if (!root.contains(e.target)) close(); }

    current = { root: root, opts: opts, onKey: onKey, onDown: onDown };
    document.body.appendChild(root);
    active = Math.max(0, items.map(function (it) { return it.id; }).indexOf(opts.current));
    paint();
    place(root, opts.anchor);
    document.addEventListener('keydown', onKey, true);
    // Registered on the next tick so the click that opened the popover does not close it at once.
    setTimeout(function () { if (current && current.root === root) document.addEventListener('mousedown', onDown, true); }, 0);
    input.focus();
    return true;
  }

  global.LinearPick = {
    open: open,
    close: close,
    isOpen: function () { return !!current; },
    filterItems: filterItems,
    digitIndex: digitIndex,
  };
})(typeof window !== 'undefined' ? window : this);
