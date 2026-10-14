/*
 * Role: shared phone / narrow-iframe chrome for every project view.
 * Sets --vvh from visualViewport, marks html.tp-narrow / html.tp-coarse, caps the
 * assistant dock, turns a long-press into the existing context menu, and collapses
 * the Documents list into a drawer. No Trello. Exposes window.ViewShell.
 */
(function (global) {
  'use strict';

  var NARROW_MAX = 640;
  var NARROW_MQ = '(max-width: 640px)';
  var COARSE_MQ = '(pointer: coarse)';
  var LONG_PRESS_MS = 480;
  var MOVE_PX = 12;
  var booted = false;

  function mq(query) {
    if (!global.matchMedia) return null;
    try {
      return global.matchMedia(query);
    } catch (e) {
      return null;
    }
  }

  function isNarrow() {
    var m = mq(NARROW_MQ);
    if (m) return !!m.matches;
    return (global.innerWidth || 1024) <= NARROW_MAX;
  }

  function isCoarse() {
    var m = mq(COARSE_MQ);
    if (m) return !!m.matches;
    var nav = global.navigator;
    return !!(nav && (nav.maxTouchPoints > 0 || nav.msMaxTouchPoints > 0));
  }

  function viewportHeight() {
    var vv = global.visualViewport;
    if (vv && vv.height > 0) return Math.round(vv.height);
    return Math.round(global.innerHeight || 800);
  }

  /** Assistant dock cap: 42% on a phone, 75% on a desktop iframe. */
  function dockMaxHeight(height) {
    var h = height > 0 ? height : viewportHeight();
    var ratio = isNarrow() || h < 700 ? 0.42 : 0.75;
    return Math.max(140, Math.round(h * ratio));
  }

  /**
   * Gantt labels pane minimum. Below 640px of chart, leave ~120px for the timeline
   * (Sheets freeze: the name stays, the rest pans).
   */
  function labelsMin(chartW) {
    var w = Number(chartW) || 0;
    if (w > 0 && w < NARROW_MAX) return Math.max(132, Math.min(200, Math.round(w * 0.42)));
    return 280;
  }

  function rootEl() {
    return global.document && global.document.documentElement;
  }

  function syncViewport() {
    var html = rootEl();
    if (!html || !html.style || !html.classList) return;
    if (typeof html.style.setProperty === 'function') {
      html.style.setProperty('--vvh', viewportHeight() + 'px');
    } else {
      html.style['--vvh'] = viewportHeight() + 'px';
    }
    if (typeof html.classList.toggle === 'function') {
      html.classList.toggle('tp-narrow', isNarrow());
      html.classList.toggle('tp-coarse', isCoarse());
    }
  }

  function installLongPress(doc) {
    if (!doc || typeof doc.addEventListener !== 'function') return;
    var timer = null;
    var start = null;

    function clear() {
      if (timer) {
        global.clearTimeout(timer);
        timer = null;
      }
      start = null;
    }

    function fire() {
      if (!start || !start.target || typeof start.target.dispatchEvent !== 'function') {
        clear();
        return;
      }
      var t = start;
      clear();
      var ev;
      try {
        ev = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: t.x,
          clientY: t.y,
          view: global,
        });
      } catch (e) {
        return;
      }
      t.target.dispatchEvent(ev);
    }

    doc.addEventListener(
      'touchstart',
      function (e) {
        if (!e || !e.touches || e.touches.length !== 1) return;
        var t = e.touches[0];
        start = { x: t.clientX, y: t.clientY, target: e.target };
        timer = global.setTimeout(fire, LONG_PRESS_MS);
      },
      { passive: true }
    );
    doc.addEventListener(
      'touchmove',
      function (e) {
        if (!start || !e.touches || !e.touches[0]) return;
        var t = e.touches[0];
        if (Math.abs(t.clientX - start.x) > MOVE_PX || Math.abs(t.clientY - start.y) > MOVE_PX) clear();
      },
      { passive: true }
    );
    doc.addEventListener('touchend', clear, { passive: true });
    doc.addEventListener('touchcancel', clear, { passive: true });
  }

  function collapseDocsOnce() {
    if (!isNarrow()) return;
    var doc = global.document;
    if (!doc) return;
    var done = false;
    function tryCollapse() {
      if (done) return;
      var root = doc.querySelector('.dc-root');
      if (!root || root.classList.contains('is-side-collapsed')) return;
      var btn = root.querySelector('.dc-tb--side');
      if (!btn) return;
      done = true;
      try {
        btn.click();
      } catch (e) {
        /* ignore */
      }
    }
    tryCollapse();
    if (done || typeof global.MutationObserver !== 'function' || !doc.body) return;
    var obs = new MutationObserver(tryCollapse);
    obs.observe(doc.body, { childList: true, subtree: true });
    global.setTimeout(function () {
      obs.disconnect();
    }, 8000);
  }

  function bindDocsScrim() {
    var doc = global.document;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    doc.addEventListener('click', function (e) {
      if (!isNarrow() || !e || !e.target || !e.target.closest) return;
      var root = doc.querySelector('.dc-root');
      if (!root || root.classList.contains('is-side-collapsed')) return;
      if (e.target.closest('.dc-side, .dc-tb--side')) return;
      if (!e.target.closest('.dc-main')) return;
      var btn = root.querySelector('.dc-tb--side');
      if (btn) {
        try {
          btn.click();
        } catch (err) {
          /* ignore */
        }
      }
    });
  }

  function boot() {
    if (booted) return;
    var html = rootEl();
    if (!html) return;
    booted = true;
    syncViewport();
    var doc = global.document;
    if (doc) installLongPress(doc);
    bindDocsScrim();
    collapseDocsOnce();
    if (global.visualViewport && typeof global.visualViewport.addEventListener === 'function') {
      global.visualViewport.addEventListener('resize', syncViewport);
      global.visualViewport.addEventListener('scroll', syncViewport);
    }
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('resize', syncViewport);
    }
    var narrow = mq(NARROW_MQ);
    if (narrow) {
      if (typeof narrow.addEventListener === 'function') narrow.addEventListener('change', syncViewport);
      else if (typeof narrow.addListener === 'function') narrow.addListener(syncViewport);
    }
  }

  global.ViewShell = {
    NARROW_MAX: NARROW_MAX,
    NARROW_MQ: NARROW_MQ,
    isNarrow: isNarrow,
    isCoarse: isCoarse,
    viewportHeight: viewportHeight,
    dockMaxHeight: dockMaxHeight,
    labelsMin: labelsMin,
    syncViewport: syncViewport,
    boot: boot,
  };

  if (global.document) {
    if (global.document.readyState === 'loading' && typeof global.document.addEventListener === 'function') {
      global.document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : this);
