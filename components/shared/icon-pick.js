/*
 * The document icon chooser, for anything that stores { i, c } (a Tabler glyph and a cover color).
 *   IconPick.open({ anchor, current, fallback, onChoose(icon|null) })
 *   IconPick.button({ icon, fallback, className, onChoose }) -> button
 *   IconPick.close()
 * Catalog: DocsModel.DOC_ICONS / COVER_COLORS / normalizeIcon.
 */
(function (global) {
  'use strict';

  var pop = null;

  function DM() {
    return global.DocsModel;
  }

  function close() {
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    pop = null;
    document.removeEventListener('mousedown', onDoc, true);
    document.removeEventListener('keydown', onKey, true);
  }

  function onDoc(e) {
    if (!pop) return;
    if (pop.contains(e.target)) return;
    if (pop._anchor && (e.target === pop._anchor || (pop._anchor.contains && pop._anchor.contains(e.target)))) return;
    close();
  }

  function onKey(e) {
    if (e.key !== 'Escape' || !pop) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function glyph(name) {
    var i = el('i', 'ti ti-' + name);
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function place(box, rect) {
    var w = box.offsetWidth;
    var hh = box.offsetHeight;
    var left = Math.max(8, Math.min(rect.left, global.innerWidth - w - 8));
    var top = rect.bottom + 6;
    if (top + hh > global.innerHeight - 8) top = Math.max(8, rect.top - hh - 6);
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  }

  function open(opts) {
    var cat = DM();
    if (!cat || !opts || !opts.anchor) return;
    close();
    var current = cat.normalizeIcon(opts.current);
    var fallback = opts.fallback || 'stack-2';
    var q = '';
    var box = el('div', 'ip-pop');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Icône');
    box._anchor = opts.anchor;
    var search = el('input', 'ip-input');
    search.type = 'text';
    search.placeholder = 'Icône';
    search.setAttribute('aria-label', 'Chercher une icône');
    search.spellcheck = false;
    var colors = el('div', 'ip-colors');
    var grid = el('div', 'ip-grid');

    function choose(next) {
      current = cat.normalizeIcon(next);
      if (typeof opts.onChoose === 'function') opts.onChoose(current);
      paint();
    }

    function iconBtn(name, label, on, clear) {
      var b = el('button', 'ip-btn' + (on ? ' is-on' : ''));
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.appendChild(glyph(name));
      if (current && current.c) b.style.color = current.c;
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        choose({ i: clear ? '' : name, c: current && current.c });
      });
      return b;
    }

    function paint() {
      colors.textContent = '';
      grid.textContent = '';
      var none = el('button', 'ip-color ip-color--none' + (!(current && current.c) ? ' is-on' : ''));
      none.type = 'button';
      none.title = 'Couleur d’origine';
      none.setAttribute('aria-label', 'Couleur d’origine');
      none.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        choose({ i: current && current.i, c: '' });
      });
      colors.appendChild(none);
      cat.COVER_COLORS.forEach(function (c) {
        var b = el('button', 'ip-color' + (current && current.c === c.v ? ' is-on' : ''));
        b.type = 'button';
        b.title = c.label;
        b.setAttribute('aria-label', c.label);
        b.style.background = c.v;
        b.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          choose({ i: current && current.i, c: c.v });
        });
        colors.appendChild(b);
      });
      if (!q) grid.appendChild(iconBtn(fallback, 'Par défaut', !(current && current.i), true));
      cat.searchDocIcons(q).forEach(function (x) {
        if (!q && x.i === fallback) return;
        grid.appendChild(iconBtn(x.i, x.i, !!(current && current.i === x.i), false));
      });
    }

    search.addEventListener('input', function () { q = search.value; paint(); });
    search.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    box.appendChild(search);
    box.appendChild(colors);
    box.appendChild(grid);
    document.body.appendChild(box);
    place(box, opts.anchor.getBoundingClientRect());
    pop = box;
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    paint();
    search.focus();
  }

  /** A fixed-size glyph. Click opens the chooser. `onChoose` receives the normalized icon, or null. */
  function button(opts) {
    opts = opts || {};
    var cat = DM();
    var mark = cat ? cat.normalizeIcon(opts.icon) : null;
    var name = (mark && mark.i) || opts.fallback || 'stack-2';
    var b = el('button', (opts.className || 'ip-glyph') + (mark && mark.c ? ' has-color' : ''));
    b.type = 'button';
    b.title = 'Icône';
    b.setAttribute('aria-label', 'Changer l’icône');
    if (mark && mark.c) b.style.color = mark.c;
    b.appendChild(glyph(name));
    b.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      open({
        anchor: b,
        current: mark,
        fallback: opts.fallback || 'stack-2',
        onChoose: function (next) {
          mark = next;
          if (typeof opts.onChoose === 'function') opts.onChoose(next);
        },
      });
    });
    return b;
  }

  global.IconPick = { open: open, close: close, button: button };
})(typeof window !== 'undefined' ? window : this);
