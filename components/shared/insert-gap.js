/*
 * Trello-style insert: the pointer in the seam under an item reveals a +, and
 * clicking it opens a one-line title at that spot.
 *
 *   InsertGap.watch(container, {
 *     item: '.kb-card',          // elements that stack
 *     placeholder: 'Titre…',
 *     enabled: function () { return true; },
 *     float: false,              // composer follows the seam instead of joining the list
 *     tail: '.tb-add-row',       // when inserting after the last item, land before this
 *     wrap: function (input) {}, // optional node that holds the input (a <tr>, an <li>)
 *     mode: 'split',              // whole row: top half inserts before, bottom half after
 *     onCreate: function (title, info) {}, // info.above / info.below / info.index
 *   })
 *
 * gapAt / underAt / splitAt are pure and unit-tested. `under` is for free-positioned
 * items (a mindmap node): the pointer sits just below that item, not in a column seam.
 * `split` covers the row itself, so a flush list still offers a spot above, in the
 * middle, and below.
 */
(function (global) {
  'use strict';

  var watches = [];
  var listening = false;

  function gapAt(rects, x, y, slack) {
    var rows = (rects || []).slice().sort(function (a, b) {
      return a.top - b.top || a.left - b.left;
    });
    if (!rows.length) return null;
    slack = slack == null ? 14 : slack;
    var left = rows[0].left;
    var right = rows[0].right;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i].left < left) left = rows[i].left;
      if (rows[i].right > right) right = rows[i].right;
    }
    if (x < left - 12 || x > right + 12) return null;
    var best = null;
    for (var j = 0; j < rows.length; j++) {
      var below = rows[j + 1] || null;
      var seam = below ? (rows[j].bottom + below.top) / 2 : rows[j].bottom + 8;
      var dist = Math.abs(y - seam);
      if (dist > slack) continue;
      var mid = (rows[j].top + rows[j].bottom) / 2;
      if (Math.abs(y - mid) < dist) continue;
      if (below) {
        var mid2 = (below.top + below.bottom) / 2;
        if (Math.abs(y - mid2) < dist) continue;
      }
      if (!best || dist < best.dist) {
        best = { index: j + 1, seam: seam, dist: dist, above: rows[j], below: below };
      }
    }
    return best;
  }

  /**
   * The whole row is a target: the top half (and the space above) inserts before it,
   * the bottom half and the gap under it insert after it. Used by the entity list,
   * where rows sit flush and the thin seam is too easy to miss.
   */
  function splitAt(rects, x, y, slack) {
    var rows = (rects || []).slice().sort(function (a, b) {
      return a.top - b.top || a.left - b.left;
    });
    if (!rows.length) return null;
    slack = slack == null ? 36 : slack;
    var left = rows[0].left;
    var right = rows[0].right;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i].left < left) left = rows[i].left;
      if (rows[i].right > right) right = rows[i].right;
    }
    if (x < left - 12 || x > right + 12) return null;
    for (var j = 0; j < rows.length; j++) {
      var row = rows[j];
      var prev = rows[j - 1] || null;
      var next = rows[j + 1] || null;
      var mid = (row.top + row.bottom) / 2;
      var zoneStart = prev ? (prev.bottom + row.top) / 2 : row.top - slack;
      var zoneEnd = next ? (row.bottom + next.top) / 2 : row.bottom + slack;
      if (y < zoneStart || y >= zoneEnd) continue;
      if (y < mid) {
        return { index: j, seam: row.top, dist: Math.abs(y - row.top), above: prev, below: row, anchor: 'below' };
      }
      var seam = next ? (row.bottom + next.top) / 2 : row.bottom + 6;
      return { index: j + 1, seam: seam, dist: Math.abs(y - seam), above: row, below: next, anchor: 'above' };
    }
    return null;
  }

  /** Pointer just under a free-positioned item (not a vertical list). */
  function underAt(rects, x, y, slack) {
    slack = slack == null ? 18 : slack;
    var best = null;
    (rects || []).forEach(function (r, i) {
      if (x < r.left - 8 || x > r.right + 8) return;
      if (y < r.bottom - 6 || y > r.bottom + slack) return;
      var dist = Math.max(0, y - r.bottom);
      if (!best || dist < best.dist) {
        best = { index: i + 1, seam: r.bottom + 8, dist: dist, above: r, below: null };
      }
    });
    return best;
  }

  function ensureCss() {
    if (!global.document || global.document.getElementById('insert-gap-css')) return;
    var src = '';
    var scripts = global.document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i].getAttribute('src') || '';
      if (/insert-gap\.js/.test(s)) { src = s; break; }
    }
    var href = src
      ? src.replace(/insert-gap\.js(\?[^#]*)?$/, function (_m, q) { return 'insert-gap.css' + (q || ''); })
      : 'components/shared/insert-gap.css';
    var link = global.document.createElement('link');
    link.id = 'insert-gap-css';
    link.rel = 'stylesheet';
    link.href = href;
    global.document.head.appendChild(link);
  }

  function hide(w) {
    if (w.btn) w.btn.hidden = true;
    w.hit = null;
  }

  function childOf(container, el) {
    while (el && el.parentNode !== container) el = el.parentNode;
    return el && el.parentNode === container ? el : null;
  }

  var RECT_MS = 120;

  function rectsOf(w) {
    var now = Date.now();
    if (w.rects && now - w.rectAt < RECT_MS) return w.rects;
    var nodes = w.container.querySelectorAll(w.opts.item);
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].closest && nodes[i].closest('.ig-compose')) continue;
      var r = nodes[i].getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      out.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, el: nodes[i] });
    }
    w.rects = out;
    w.rectAt = now;
    return out;
  }

  function sameHit(a, b) {
    return !!(a && b && a.index === b.index && Math.abs(a.seam - b.seam) < 0.5);
  }

  function placeButton(w, hit) {
    var btn = w.btn;
    var a = hit.above;
    var b = hit.below;
    var box = a || b;
    if (!box) return;
    var x = a && b
      ? (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2
      : (box.left + box.right) / 2;
    btn.style.left = x + 'px';
    btn.style.top = hit.seam + 'px';
    btn.hidden = false;
    w.hit = hit;
  }

  function moveAt(w, x, y, target) {
    if (w.composing) return;
    if (w.opts.enabled && w.opts.enabled() === false) { hide(w); return; }
    if (target && target.closest && target.closest('.ig-compose')) { hide(w); return; }
    var rows = rectsOf(w);
    var hit = w.opts.mode === 'under'
      ? underAt(rows, x, y, w.opts.slack)
      : w.opts.mode === 'split'
        ? splitAt(rows, x, y, w.opts.slack)
        : gapAt(rows, x, y, w.opts.slack);
    if (!hit) { hide(w); return; }
    if (sameHit(w.hit, hit)) return;
    placeButton(w, hit);
  }

  function onMove(w, e) {
    w.px = e.clientX;
    w.py = e.clientY;
    w.pt = e.target;
    if (w.moveRaf) return;
    var raf = global.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    w.moveRaf = raf(function () {
      w.moveRaf = 0;
      moveAt(w, w.px, w.py, w.pt);
    });
  }

  function removeCompose(w) {
    w.composing = false;
    if (w.compose && w.compose.parentNode) w.compose.parentNode.removeChild(w.compose);
    w.compose = null;
  }

  function openCompose(w) {
    var hit = w.hit;
    if (!hit || w.composing) return;
    w.composing = true;
    hide(w);
    var input = global.document.createElement('input');
    input.type = 'text';
    input.className = 'ig-input';
    input.placeholder = w.opts.placeholder || 'Titre…';
    input.setAttribute('aria-label', input.placeholder);
    input.autocomplete = 'off';
    var node;
    if (w.opts.float) {
      node = global.document.createElement('form');
      node.className = 'ig-compose ig-compose--float';
      node.style.left = ((hit.above.left + hit.above.right) / 2) + 'px';
      node.style.top = (hit.above.bottom + 4) + 'px';
      node.appendChild(input);
      global.document.body.appendChild(node);
    } else {
      node = w.opts.wrap ? w.opts.wrap(input, hit) : null;
      if (!node) {
        node = global.document.createElement('form');
        node.className = 'ig-compose';
        node.appendChild(input);
      } else if (!node.contains(input)) {
        node.appendChild(input);
      }
      if (!node.classList.contains('ig-compose')) node.classList.add('ig-compose');
      var aboveEl = hit.above ? childOf(w.container, hit.above.el) : null;
      var belowEl = hit.below ? childOf(w.container, hit.below.el) : null;
      var ref = hit.anchor === 'above' && aboveEl ? aboveEl.nextSibling : belowEl;
      if (!ref && w.opts.tail) ref = w.container.querySelector(w.opts.tail);
      if (ref) w.container.insertBefore(node, ref);
      else w.container.appendChild(node);
    }
    w.compose = node;
    var busy = false;
    function close() { removeCompose(w); }
    function submit() {
      if (busy) return;
      var title = input.value.replace(/\s+/g, ' ').trim();
      if (!title) { close(); return; }
      busy = true;
      input.disabled = true;
      var info = {
        index: hit.index,
        above: hit.above ? hit.above.el : null,
        below: hit.below ? hit.below.el : null,
        anchor: hit.anchor || '',
      };
      var job;
      try { job = w.opts.onCreate(title, info); }
      catch (err) { busy = false; input.disabled = false; return; }
      Promise.resolve(job).then(close, function () {
        busy = false;
        input.disabled = false;
        input.focus();
      });
    }
    node.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    input.addEventListener('blur', function () {
      setTimeout(function () {
        if (!w.compose || busy) return;
        if (input.value.replace(/\s+/g, ' ').trim()) submit();
        else close();
      }, 0);
    });
    input.focus();
  }

  function ensureListen() {
    if (listening || !global.document) return;
    listening = true;
    global.addEventListener('scroll', function () {
      watches.forEach(function (w) {
        w.rectAt = 0;
        hide(w);
      });
    }, true);
  }

  function detach(w) {
    watches = watches.filter(function (x) { return x !== w; });
    hide(w);
    removeCompose(w);
    if (w.btn && w.btn.parentNode) w.btn.parentNode.removeChild(w.btn);
  }

  function watch(container, opts) {
    if (!container || !global.document) return { detach: function () {} };
    opts = opts || {};
    ensureCss();
    ensureListen();
    var prev = null;
    for (var i = 0; i < watches.length; i++) if (watches[i].container === container) prev = watches[i];
    if (prev) detach(prev);
    var btn = global.document.createElement('button');
    btn.type = 'button';
    btn.className = 'ig-plus';
    btn.hidden = true;
    btn.title = 'Ajouter ici';
    btn.setAttribute('aria-label', 'Ajouter ici');
    btn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
    var w = { container: container, opts: opts, btn: btn, hit: null, composing: false, compose: null };
    btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openCompose(w); });
    btn.addEventListener('pointerleave', function (e) {
      if (e.relatedTarget && container.contains(e.relatedTarget)) return;
      hide(w);
    });
    global.document.body.appendChild(btn);
    container.addEventListener('pointermove', function (e) { onMove(w, e); });
    container.addEventListener('pointerleave', function (e) {
      if (e.relatedTarget === btn) return;
      hide(w);
    });
    watches.push(w);
    return { detach: function () { detach(w); } };
  }

  global.InsertGap = { watch: watch, gapAt: gapAt, underAt: underAt, splitAt: splitAt };
})(typeof window !== 'undefined' ? window : global);
