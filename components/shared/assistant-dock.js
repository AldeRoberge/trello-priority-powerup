/*
 * Role: collapsible project-scope Assistant docked at the bottom of a view (Table, Gantt, Kanban, Mindmap).
 * One bar ("Assistant"), a drag grip to resize, and the full AssistantMount chat inside when open.
 *
 *   AssistantDock.mount({ t, after: mountEl, onRefresh, isBusy })
 *     after     element the dock is inserted after (the view's mount node, inside a flex-column body)
 *     onRefresh () => any   called to reload the view while the dock is open (the assistant edits cards)
 *     isBusy    () => bool  true while the user is editing: skips the periodic refresh
 */
(function (global) {
  'use strict';

  var HEIGHT_KEY = 'tp.assistantDockHeight';
  var LEGACY_HEIGHT_KEY = 'tb.dockHeight';
  var MIN_H = 160;
  var POLL_MS = 20000;
  var OLD_MS = 25000; // lines start fading
  var GONE_MS = 60000; // lines vanish (until the chat is hovered / focused / scrolled up)

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function icon(name) {
    var i = el('i', 'ti ti-' + name);
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function mount(opts) {
    opts = opts || {};
    var dock = { open: false, mounted: false, height: 220, poll: null, body: null };
    try {
      var saved = parseInt(global.localStorage.getItem(HEIGHT_KEY) || global.localStorage.getItem(LEGACY_HEIGHT_KEY), 10);
      if (saved >= MIN_H) dock.height = saved;
    } catch (e) { /* storage unavailable */ }

    var root = el('div', 'ad-dock');
    if (opts.after && opts.after.parentNode) opts.after.parentNode.insertBefore(root, opts.after.nextSibling);
    else document.body.appendChild(root);

    function maxHeight() {
      return Math.max(180, Math.round(global.innerHeight * 0.75));
    }

    function setHeight(px, persist) {
      dock.height = Math.max(MIN_H, Math.min(maxHeight(), Math.round(px)));
      if (dock.body) dock.body.style.height = dock.height + 'px';
      if (persist) {
        try { global.localStorage.setItem(HEIGHT_KEY, String(dock.height)); } catch (e) { /* ignore */ }
      }
    }

    function refresh() {
      if (typeof opts.onRefresh !== 'function') return;
      try { opts.onRefresh(); } catch (e) { /* view gone */ }
    }

    function toggle(force) {
      dock.open = typeof force === 'boolean' ? force : !dock.open;
      render();
      if (dock.open && !dock.mounted && global.AssistantMount) {
        dock.mounted = true;
        var mountEl = dock.body.querySelector('#assistantMount');
        global.AssistantMount.mount(mountEl, opts.t, { resizeBody: false, focusComposer: true }).catch(function (err) {
          dock.mounted = false;
          mountEl.textContent = '';
          mountEl.appendChild(el('div', 'ad-dock-error', 'Assistant indisponible : ' + (err && err.message)));
        });
      }
      clearInterval(dock.poll);
      dock.poll = null;
      if (dock.open) {
        dock.poll = setInterval(function () {
          if (typeof opts.isBusy === 'function' && opts.isBusy()) return;
          refresh();
        }, POLL_MS);
      } else if (dock.mounted) refresh();
    }


    /* MMO-style log behaviour: lines fade with age, scroll arrows, "awake" on hover / focus / scroll-up. */
    function enhanceLog(body) {
      var log = null;
      var bound = null;
      var arrows = el('div', 'ad-dock-arrows');
      var up = el('button', 'ad-dock-arrow');
      var down = el('button', 'ad-dock-arrow');
      up.type = down.type = 'button';
      up.title = 'Remonter'; down.title = 'Descendre';
      up.appendChild(icon('chevron-up')); down.appendChild(icon('chevron-down'));
      arrows.appendChild(up); arrows.appendChild(down);
      body.appendChild(arrows);

      function atBottom() { return log.scrollHeight - log.scrollTop - log.clientHeight < 8; }
      function awake() {
        return body.matches(':hover') || body.contains(document.activeElement) || !atBottom();
      }
      function tick() {
        if (!log || !log.isConnected) { find(); if (!log) return; }
        var now = Date.now();
        var kids = log.children;
        for (var i = 0; i < kids.length; i++) {
          var k = kids[i];
          if (!k.classList.contains('agent-msg')) continue;
          if (!k.dataset.adT || k.classList.contains('is-streaming')) k.dataset.adT = String(now);
          var age = now - Number(k.dataset.adT);
          k.classList.toggle('is-old', age > OLD_MS);
          k.classList.toggle('is-gone', age > GONE_MS);
        }
        body.classList.toggle('is-awake', awake());
        up.disabled = log.scrollTop <= 0;
        down.disabled = atBottom();
      }
      function find() {
        log = body.querySelector('.agent-messages');
        if (log && log !== bound) {
          bound = log;
          log.addEventListener('scroll', tick, { passive: true });
          new MutationObserver(tick).observe(log, { childList: true });
        }
      }
      up.addEventListener('click', function () { log.scrollBy({ top: -Math.max(40, log.clientHeight * 0.8) }); });
      down.addEventListener('click', function () { log.scrollBy({ top: Math.max(40, log.clientHeight * 0.8) }); });
      body.addEventListener('mouseenter', tick);
      body.addEventListener('mouseleave', tick);
      body.addEventListener('focusin', tick);
      body.addEventListener('focusout', function () { setTimeout(tick, 0); });
      setInterval(function () { if (body.isConnected) tick(); }, 1000);
      find();
      new MutationObserver(function () { find(); tick(); }).observe(body, { childList: true, subtree: true });
    }

    function render() {
      var keep = dock.body;
      root.innerHTML = '';
      root.classList.toggle('is-open', dock.open);
      var grip = el('div', 'ad-dock-grip');
      grip.title = 'Glisser pour redimensionner';
      grip.addEventListener('pointerdown', function (e) {
        if (!dock.open) return;
        e.preventDefault();
        var startY = e.clientY;
        var startH = dock.height;
        function move(ev) { setHeight(startH + (startY - ev.clientY), false); }
        function up() {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          setHeight(dock.height, true);
        }
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });
      var bar = el('div', 'ad-dock-bar');
      bar.setAttribute('role', 'button');
      bar.tabIndex = 0;
      bar.setAttribute('aria-expanded', dock.open ? 'true' : 'false');
      bar.addEventListener('click', function () { toggle(); });
      bar.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
      bar.appendChild(icon('sparkles'));
      bar.appendChild(el('strong', null, 'Assistant'));
      bar.appendChild(el('span', 'ad-dock-hint', 'Posez une question ou demandez une modification sur tout le projet…'));
      bar.appendChild(el('span', 'ad-dock-spacer'));
      bar.appendChild(icon(dock.open ? 'chevron-down' : 'chevron-up'));
      root.appendChild(grip);
      root.appendChild(bar);
      if (dock.open) {
        if (!keep) {
          keep = el('div', 'ad-dock-body tp-page--priority tp-page--assistant');
          var m = el('div');
          m.id = 'assistantMount';
          keep.appendChild(m);
          enhanceLog(keep);
        }
        dock.body = keep;
        keep.style.height = dock.height + 'px';
        root.appendChild(keep);
      }
    }

    render();
    return { toggle: toggle, root: root };
  }

  global.AssistantDock = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
