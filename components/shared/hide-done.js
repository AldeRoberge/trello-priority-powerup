/*
 * Role: one shared "hide completed tasks" preference for the Table, Gantt, Kanban and Mindmap views.
 *  - a single stored flag (hidden by default), so a choice made in one view applies to all of them
 *  - the same wording and icon everywhere (HideDone.label / title / icon)
 *  - views subscribe to be told when another view (or tab) changes it
 * Exposes window.HideDone.
 */
(function (global) {
  'use strict';

  var KEY = 'tp-hide-done';
  var listeners = [];

  function get() {
    // Hidden unless the user explicitly chose to show completed tasks.
    try { return global.localStorage.getItem(KEY) !== '0'; } catch (e) { return true; }
  }

  function set(on) {
    on = !!on;
    if (on === get()) return on;
    try { global.localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    notify(on);
    return on;
  }

  function notify(on) {
    listeners.slice().forEach(function (fn) { try { fn(on); } catch (e) { /* ignore */ } });
  }

  /** Calls fn(hidden) whenever the preference changes (here or in another tab). */
  function subscribe(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  if (global.addEventListener) {
    global.addEventListener('storage', function (e) {
      if (e && e.key === KEY) notify(get());
    });
  }

  global.HideDone = {
    KEY: KEY,
    get: get,
    set: set,
    toggle: function () { return set(!get()); },
    subscribe: subscribe,
    icon: function (hidden) { return hidden ? 'eye-off' : 'eye'; },
    label: function (hidden, count) {
      return hidden ? 'Terminées masquées' + (count ? ' (' + count + ')' : '') : 'Terminées';
    },
    title: function (hidden) {
      return hidden ? 'Afficher les tâches terminées' : 'Masquer les tâches terminées';
    },
    /**
     * Fills a view's own toolbar button with the same content in every view: the eye icon, then the number of
     * hidden tasks in a quiet pill (only while they are hidden). The words go in the tooltip, so the toolbar
     * stays one compact line and the button keeps the same width whatever the state.
     */
    decorate: function (btn, hidden, count) {
      if (!btn || !global.document) return btn;
      var doc = global.document;
      hidden = !!hidden;
      count = Math.max(0, Number(count) || 0);
      btn.textContent = '';
      var i = doc.createElement('i');
      i.className = 'ti ti-' + (hidden ? 'eye-off' : 'eye');
      i.setAttribute('aria-hidden', 'true');
      btn.appendChild(i);
      var n = doc.createElement('span');
      n.className = 'hd-n';
      n.textContent = hidden && count ? String(Math.min(count, 99)) : '';
      btn.appendChild(n);
      btn.classList.add('hd-btn');
      btn.classList.toggle('is-hiding', hidden);
      var words = hidden ? 'Terminées masquées' + (count ? ' (' + count + ')' : '') : 'Terminées affichées';
      btn.title = words + ' · ' + (hidden ? 'cliquer pour les afficher' : 'cliquer pour les masquer');
      btn.setAttribute('aria-label', words);
      btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      return btn;
    },
  };
})(typeof window !== 'undefined' ? window : this);
