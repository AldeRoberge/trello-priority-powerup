/*
 * Role: shared node-graph canvas, extracted from the Mindmap so other views (Parcours) behave the same way.
 *  - GraphCanvas.create(host, opts): an infinite canvas (dot grid) that pans (drag the background or the middle button)
 *    and zooms (wheel, around the pointer). Put your nodes in `gc.world` (absolute pixels) and your wires in `gc.svg`
 *    (same world space). `gc.dragNode` moves a node with grid snapping, `gc.wire` drags a new link out of a pin.
 *  - Pure helpers (anchor, facing, wirePath, arrowJoin, zoomAt, fitView, snap) are exported for any view and for tests.
 * Nodes are { x, y, w, h } with (x, y) the top-left corner.
 */
(function (global) {
  'use strict';

  var SIDES = {
    top: { nx: 0, ny: -1 },
    right: { nx: 1, ny: 0 },
    bottom: { nx: 0, ny: 1 },
    left: { nx: -1, ny: 0 },
  };
  var MIN_K = 0.15;
  var MAX_K = 3;
  var GRID = 18;
  var PIN_GAP = 6;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function snap(v, grid, off) {
    var g = grid || GRID;
    return Math.round((v - (off || 0)) / g) * g + (off || 0);
  }

  /** Anchor of a node side (border midpoint) and its outward normal. `n` has x, y, w, h (top-left origin). */
  function anchor(n, side) {
    var d = SIDES[side];
    return { x: n.x + n.w / 2 + d.nx * n.w / 2, y: n.y + n.h / 2 + d.ny * n.h / 2, nx: d.nx, ny: d.ny, side: side };
  }

  /** Facing sides for a wire between two nodes (top-left origin). */
  function facing(a, b) {
    var dx = (b.x + b.w / 2) - (a.x + a.w / 2);
    var dy = (b.y + b.h / 2) - (a.y + a.h / 2);
    var horizontal = Math.abs(dx) / ((a.w + b.w) / 2) >= Math.abs(dy) / ((a.h + b.h) / 2);
    if (horizontal) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
    return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  }

  function wirePath(p1, p2) {
    // handle length follows the gap along each pin's own axis, so a wide sideways gap
    // with a small vertical one does not produce a loopy S-curve
    var gap = function (p) { return p.nx ? Math.abs(p2.x - p1.x) : Math.abs(p2.y - p1.y); };
    var off1 = Math.max(18, Math.min(110, gap(p1) * 0.45));
    var off2 = Math.max(18, Math.min(110, gap(p2) * 0.45));
    return 'M' + p1.x.toFixed(1) + ',' + p1.y.toFixed(1) +
      ' C' + (p1.x + p1.nx * off1).toFixed(1) + ',' + (p1.y + p1.ny * off1).toFixed(1) +
      ' ' + (p2.x + p2.nx * off2).toFixed(1) + ',' + (p2.y + p2.ny * off2).toFixed(1) +
      ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
  }

  /** Filled arrowhead whose base sits on the end of the wire; the wire stops at that base. */
  function arrowJoin(p2, dist) {
    var len = !dist || dist > 36 ? 11 : Math.max(7, dist * 0.34);
    var hw = len * 0.42;
    var bx = p2.x + p2.nx * len;
    var by = p2.y + p2.ny * len;
    var px = -p2.ny;
    var py = p2.nx;
    return {
      base: { x: bx, y: by, nx: p2.nx, ny: p2.ny },
      d: 'M' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1) +
        ' L' + (bx + px * hw).toFixed(1) + ',' + (by + py * hw).toFixed(1) +
        ' L' + (bx - px * hw).toFixed(1) + ',' + (by - py * hw).toFixed(1) + ' Z',
    };
  }

  /** A wire between two nodes, stopping PIN_GAP outside each border. Returns { d, p1, p2 }. */
  function wireBetween(a, b, gap) {
    var g = gap == null ? PIN_GAP : gap;
    var sides = facing(a, b);
    var p1 = anchor(a, sides[0]);
    var p2 = anchor(b, sides[1]);
    p1.x += p1.nx * g; p1.y += p1.ny * g;
    p2.x += p2.nx * g; p2.y += p2.ny * g;
    return { d: wirePath(p1, p2), p1: p1, p2: p2 };
  }

  /** New view after zooming by factor f around the screen point (px, py). */
  function zoomAt(view, px, py, f, minK, maxK) {
    var k = clamp(view.k * f, minK == null ? MIN_K : minK, maxK == null ? MAX_K : maxK);
    return { k: k, x: px - ((px - view.x) / view.k) * k, y: py - ((py - view.y) / view.k) * k };
  }

  /** View that fits the world box { x0, y0, x1, y1 } into a w × h screen (centered, never above maxFit). */
  function fitView(box, w, h, pad, maxFit, minK) {
    var p = pad == null ? 40 : pad;
    if (!box || !isFinite(box.x0)) return { x: w / 2, y: h / 2, k: 1 };
    var k = Math.min(maxFit == null ? 1.2 : maxFit, (w - p * 2) / Math.max(1, box.x1 - box.x0), (h - p * 2) / Math.max(1, box.y1 - box.y0));
    k = Math.max(minK == null ? MIN_K : minK, k);
    return { k: k, x: w / 2 - ((box.x0 + box.x1) / 2) * k, y: h / 2 - ((box.y0 + box.y1) / 2) * k };
  }

  /** View that puts the world point (wx, wy) in the middle of a w × h screen at zoom k. */
  function centerOn(wx, wy, w, h, k) {
    return { k: k, x: w / 2 - wx * k, y: h / 2 - wy * k };
  }

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  /**
   * opts: { view: {x,y,k}, grid, minK, maxK, onView(view), canPan(ev) }
   * Returns { el, world, svg, view, setView, zoomBy, zoomAt, toWorld, size, dragNode, wire, destroy }.
   */
  function create(host, opts) {
    opts = opts || {};
    var grid = opts.grid || GRID;
    var minK = opts.minK || MIN_K;
    var maxK = opts.maxK || MAX_K;
    var view = Object.assign({ x: 24, y: 24, k: 1 }, opts.view || {});
    var root = el('div', 'gc');
    var world = el('div', 'gc-world');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'gc-wires');
    svg.setAttribute('width', '1');
    svg.setAttribute('height', '1');
    world.appendChild(svg);
    root.appendChild(world);
    host.appendChild(root);

    function apply(silent) {
      world.style.transform = 'translate(' + view.x.toFixed(1) + 'px,' + view.y.toFixed(1) + 'px) scale(' + view.k.toFixed(3) + ')';
      var g = (grid * view.k).toFixed(2) + 'px';
      root.style.backgroundSize = g + ' ' + g;
      root.style.backgroundPosition = view.x.toFixed(1) + 'px ' + view.y.toFixed(1) + 'px';
      if (!silent && opts.onView) opts.onView({ x: view.x, y: view.y, k: view.k });
    }

    function size() { return { w: root.clientWidth || 800, h: root.clientHeight || 500 }; }

    function setView(v, silent) {
      view.x = v.x; view.y = v.y; view.k = clamp(v.k, minK, maxK);
      apply(silent);
    }

    function zoomAtPoint(px, py, f) {
      var next = zoomAt(view, px, py, f, minK, maxK);
      setView(next);
    }

    function zoomBy(f) {
      var s = size();
      zoomAtPoint(s.w / 2, s.h / 2, f);
    }

    function toWorld(ev) {
      var r = root.getBoundingClientRect();
      return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k };
    }

    root.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var r = root.getBoundingClientRect();
      zoomAtPoint(ev.clientX - r.left, ev.clientY - r.top, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    // the middle button pans from anywhere (even over a node), like Miro; also stop the browser autoscroll
    root.addEventListener('mousedown', function (ev) { if (ev.button === 1) ev.preventDefault(); });
    root.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 && ev.button !== 1) return;
      if (ev.button === 0 && ev.target.closest && ev.target.closest('.gc-node, .gc-nodrag, button, a, input, textarea, select')) return;
      if (ev.button === 1) ev.preventDefault();
      var start = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y };
      var moved = false;
      var edgeTarget = ev.target;
      try { root.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      root.classList.add('is-panning');
      function move(me) {
        var dx = me.clientX - start.x;
        var dy = me.clientY - start.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        setView({ x: start.vx + dx, y: start.vy + dy, k: view.k });
      }
      function up() {
        root.removeEventListener('pointermove', move);
        root.removeEventListener('pointerup', up);
        root.removeEventListener('pointercancel', up);
        root.classList.remove('is-panning');
        if (opts.onBackground && !moved && ev.button === 0) opts.onBackground(edgeTarget, ev);
      }
      root.addEventListener('pointermove', move);
      root.addEventListener('pointerup', up);
      root.addEventListener('pointercancel', up);
    });

    /**
     * Makes `elNode` draggable. h = { node (x,y,w,h), onStart(), onMove(x, y, ev), onEnd(moved, ev), onClick(ev) }.
     * Position snaps to the grid (hold Alt to move freely). A press without movement is a click.
     */
    function dragNode(elNode, h) {
      elNode.classList.add('gc-node');
      elNode.addEventListener('pointerdown', function (ev) {
        if (ev.button) return;
        if (ev.target.closest && ev.target.closest('.gc-nodrag, button, a, input, textarea, select')) return;
        ev.stopPropagation();
        var n = h.node;
        var start = { x: ev.clientX, y: ev.clientY, nx: n.x, ny: n.y };
        var moved = false;
        try { elNode.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        function move(me) {
          var dx = me.clientX - start.x;
          var dy = me.clientY - start.y;
          if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
          if (!moved) { moved = true; elNode.classList.add('is-dragging'); if (h.onStart) h.onStart(); }
          var x = start.nx + dx / view.k;
          var y = start.ny + dy / view.k;
          if (!me.altKey) { x = snap(x, grid); y = snap(y, grid); }
          n.x = x; n.y = y;
          if (h.onMove) h.onMove(x, y, me);
        }
        function up(me) {
          elNode.removeEventListener('pointermove', move);
          elNode.removeEventListener('pointerup', up);
          elNode.removeEventListener('pointercancel', up);
          elNode.classList.remove('is-dragging');
          if (moved) { if (h.onEnd) h.onEnd(true, me); return; }
          if (h.onEnd) h.onEnd(false, me);
          if (h.onClick) h.onClick(me);
        }
        elNode.addEventListener('pointermove', move);
        elNode.addEventListener('pointerup', up);
        elNode.addEventListener('pointercancel', up);
      });
    }

    /**
     * Drags a new link out of a pin. o = { from: anchor, targetAt(el) -> id|null, anchorFor(id) -> anchor|null,
     * onDrop(id), onMiss(point, ev), onTarget(id|null) }. The wire follows the pointer and snaps to the hovered node.
     */
    function wire(ev, o) {
      if (ev.button) return;
      ev.stopPropagation();
      ev.preventDefault();
      var temp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      temp.setAttribute('class', 'gc-wire-temp');
      svg.appendChild(temp);
      root.classList.add('is-wiring');
      var target = null;
      var from = o.from;
      var start = { x: from.x + from.nx * PIN_GAP, y: from.y + from.ny * PIN_GAP, nx: from.nx, ny: from.ny };
      function move(me) {
        var node = document.elementFromPoint(me.clientX, me.clientY);
        var id = o.targetAt ? o.targetAt(node) : null;
        if (id !== target) {
          target = id;
          if (o.onTarget) o.onTarget(id);
        }
        var p = toWorld(me);
        var end = { x: p.x, y: p.y, nx: 0, ny: 0 };
        var a = target && o.anchorFor ? o.anchorFor(target, from) : null;
        if (a) end = a;
        else end.nx = Math.abs(p.x - from.x) > Math.abs(p.y - from.y) ? (p.x > from.x ? -1 : 1) : 0;
        if (!a && !end.nx) end.ny = p.y > from.y ? -1 : 1;
        temp.setAttribute('d', wirePath(start, end));
      }
      function finish() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancel);
        if (temp.parentNode) temp.parentNode.removeChild(temp);
        root.classList.remove('is-wiring');
        if (target && o.onTarget) o.onTarget(null);
      }
      function up(me) {
        var id = target;
        finish();
        if (id) { if (o.onDrop) o.onDrop(id); return; }
        var p = toWorld(me);
        if (o.onMiss && Math.sqrt(Math.pow(p.x - from.x, 2) + Math.pow(p.y - from.y, 2)) >= 60) o.onMiss(p, me);
      }
      function cancel() { target = null; finish(); }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', cancel);
      move(ev);
    }

    apply(true);
    return {
      el: root,
      world: world,
      svg: svg,
      view: view,
      setView: setView,
      zoomBy: zoomBy,
      zoomAt: zoomAtPoint,
      toWorld: toWorld,
      size: size,
      dragNode: dragNode,
      wire: wire,
    };
  }

  global.GraphCanvas = {
    SIDES: SIDES,
    MIN_K: MIN_K,
    MAX_K: MAX_K,
    GRID: GRID,
    PIN_GAP: PIN_GAP,
    create: create,
    snap: snap,
    anchor: anchor,
    facing: facing,
    wirePath: wirePath,
    wireBetween: wireBetween,
    arrowJoin: arrowJoin,
    zoomAt: zoomAt,
    fitView: fitView,
    centerOn: centerOn,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.GraphCanvas;
})(typeof window !== 'undefined' ? window : this);
