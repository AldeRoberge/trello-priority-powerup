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
  };
})(typeof window !== 'undefined' ? window : this);
