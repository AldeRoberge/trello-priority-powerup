/**
 * Progress ring shared by Gantt, Kanban and Mindmap (same look as the Table's "Progrès" column).
 * Circle that fills clockwise with the %, becoming a solid green disc with a checkmark at 100 %.
 * ProgressRing.create(p)  -> <svg class="pg-ring"> (add class `is-done` on a parent or call set())
 * ProgressRing.set(svg,p) -> updates the arc and the done state
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

  global.ProgressRing = { create: create, set: set, setBlocked: setBlocked, clamp: clamp, CIRCUMFERENCE: C };
})(typeof window !== 'undefined' ? window : this);
