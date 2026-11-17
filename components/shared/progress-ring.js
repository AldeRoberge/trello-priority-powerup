/**
 * Progress ring shared by Gantt, Kanban and Mindmap (same look as the Table's "Progrès" column).
 * Circle that fills clockwise with the %, becoming a solid green disc with a checkmark at 100 %.
 * ProgressRing.create(p)  -> <svg class="pg-ring"> (add class `is-done` on a parent or call set())
 * ProgressRing.set(svg,p) -> updates the arc and the done state
 * ProgressRing.bindDrag(el,o) -> press and drag the ring up or to the right to raise the %, down or left to lower it; a plain click calls o.onClick
 * ProgressRing.setBlocked(svg,b) -> blocked cards show a red pause (II) instead of the ring; callers bind the click to unblock
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var C = 2 * Math.PI * 7;

  function clamp(p) {
    p = Number(p);
    return isFinite(p) ? Math.max(0, Math.min(100, p)) : 0;
  }

  function create(p, blocked) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('class', 'pg-ring');
    svg.innerHTML =
      '<circle class="pg-track" cx="10" cy="10" r="7" fill="none" stroke-width="2"/>' +
      '<circle class="pg-arc" cx="10" cy="10" r="7" fill="none" stroke-width="2" stroke-linecap="round" transform="rotate(-90 10 10)" stroke-dasharray="' + C.toFixed(2) + '"/>' +
      '<circle class="pg-disc" cx="10" cy="10" r="9.5"/>' +
      '<path class="pg-check" d="M6 10.3l2.6 2.6L14 7.5" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<g class="pg-pause"><rect x="5.5" y="4" width="3" height="12" rx="0.8"/><rect x="11.5" y="4" width="3" height="12" rx="0.8"/></g>';
    set(svg, p);
    setBlocked(svg, blocked);
    return svg;
  }

  function set(svg, p) {
    p = clamp(p);
    var arc = svg.querySelector('.pg-arc');
    if (arc) arc.setAttribute('stroke-dashoffset', (C * (1 - p / 100)).toFixed(2));
    svg.classList.toggle('is-done', p >= 100);
  }

  function setBlocked(svg, blocked) {
    svg.classList.toggle('is-blocked', !!blocked);
  }

  /**
   * Makes `el` (a button holding the ring) draggable. o = { get() -> current %, onPreview(p) while dragging, onCommit(p) on release
   * when it changed, onClick(e) for a click without drag, span px for 0..100 (default 90), step (default 5) }.
   * Pointer events stop here: the card click and the card drag never fire. Returns nothing; the listeners live with el.
   */
  function bindDrag(el, o) {
    var span = o.span || 90;
    var step = o.step || 5;
    var moved = false;
    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      var x0 = e.clientX;
      var y0 = e.clientY;
      var start = clamp(o.get());
      var pct = start;
      moved = false;
      var card = el.closest('[draggable]');
      var wasDraggable = card && card.draggable;
      if (card) card.draggable = false;
      el.classList.add('is-dragging');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* the document listeners still follow the pointer */ }
      function move(ev) {
        var d = (ev.clientX - x0) - (ev.clientY - y0);
        if (!moved && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 4) return;
        moved = true;
        pct = clamp(Math.round((start + (d / span) * 100) / step) * step);
        if (o.onPreview) o.onPreview(pct);
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
        el.classList.remove('is-dragging');
        if (card) card.draggable = wasDraggable;
        if (moved) {
          global.setTimeout(function () { moved = false; }, 0);
          if (pct !== start && o.onCommit) o.onCommit(pct);
          else if (o.onPreview) o.onPreview(start);
        }
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    });
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      if (!moved && o.onClick) o.onClick(e);
    });
  }

  global.ProgressRing = {
    bindDrag: bindDrag, create: create, set: set, setBlocked: setBlocked, clamp: clamp, CIRCUMFERENCE: C };
})(typeof window !== 'undefined' ? window : this);
