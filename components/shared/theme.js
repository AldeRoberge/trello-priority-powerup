/*
 * Role: the look of the app. Two independent choices, both saved in this browser:
 *   mode  : 'auto' (follows Trello) | 'light' | 'dark'
 *   style : one of THEMES (tokens live in themes.css, keyed on html[data-theme])
 * Loaded in <head> before the stylesheets so the page paints in the right look at once.
 *
 *   Theme.apply()            set data-theme (and data-color-mode when the mode is forced) on <html>
 *   Theme.mode() / setMode() 'auto' | 'light' | 'dark'
 *   Theme.style() / setStyle(id)
 *   Theme.resolveMode(trello) the mode to show, given the one Trello reports ('light' | 'dark' | null)
 *   Theme.THEMES              [{ id, label, swatch: { light: [bg, surface, accent], dark: [...] } }]
 */
(function (global) {
  'use strict';

  var STYLE_KEY = 'trello-priority-powerup/theme-style';
  var MODE_KEY = 'trello-priority-powerup/theme-mode';
  var COLOR_MODE_KEY = 'trello-priority-powerup/color-mode';
  var DEFAULT_STYLE = 'classique';

  var THEMES = [
    { id: 'classique', label: 'Classique', swatch: { light: ['#f1f2f4', '#ffffff', '#0c66e4'], dark: ['#1d2125', '#282e33', '#579dff'] } },
    { id: 'cristal', label: 'Cristal', swatch: { light: ['#f5f5f7', '#ffffff', '#007aff'], dark: ['#000000', '#1c1c1e', '#0a84ff'] } },
    { id: 'fluide', label: 'Fluide', swatch: { light: ['#f3f3f3', '#fbfbfb', '#0f6cbd'], dark: ['#202020', '#2b2b2b', '#479ef5'] } },
    { id: 'tonal', label: 'Tonal', swatch: { light: ['#fef7ff', '#f3edf7', '#6750a4'], dark: ['#141218', '#211f26', '#d0bcff'] } },
    { id: 'sauge', label: 'Sauge', swatch: { light: ['#f4f6f1', '#ffffff', '#3f6b4f'], dark: ['#171c18', '#222922', '#8fc7a0'] } },
  ];

  function read(key) {
    try {
      return global.localStorage ? global.localStorage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (global.localStorage) global.localStorage.setItem(key, value);
    } catch (e) {
      /* storage unavailable: the choice lasts until the page closes */
    }
  }

  function style() {
    var s = read(STYLE_KEY);
    for (var i = 0; i < THEMES.length; i += 1) if (THEMES[i].id === s) return s;
    return DEFAULT_STYLE;
  }

  function mode() {
    var m = read(MODE_KEY);
    return m === 'light' || m === 'dark' ? m : 'auto';
  }

  /** The mode to show: the forced one, else what Trello reports. */
  function resolveMode(trello) {
    var m = mode();
    if (m !== 'auto') return m;
    return trello === 'light' || trello === 'dark' ? trello : null;
  }

  /** Inline page background: only the classic dark look needs it (themes paint their own from CSS). */
  function rootBackground(effectiveMode) {
    return effectiveMode === 'dark' && style() === DEFAULT_STYLE ? '#1d2125' : '';
  }

  function apply() {
    var root = global.document && global.document.documentElement;
    if (!root) return;
    var s = style();
    if (s === DEFAULT_STYLE) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', s);
    var forced = mode();
    var effective = forced !== 'auto' ? forced : root.getAttribute('data-color-mode');
    if (forced !== 'auto') {
      root.setAttribute('data-color-mode', forced);
      write(COLOR_MODE_KEY, forced);
    }
    if (effective === 'light' || effective === 'dark') {
      root.style.colorScheme = effective;
      root.style.backgroundColor = rootBackground(effective);
    }
  }

  function setStyle(id) {
    write(STYLE_KEY, id);
    apply();
  }

  function setMode(m) {
    write(MODE_KEY, m === 'light' || m === 'dark' ? m : 'auto');
    apply();
  }

  global.Theme = {
    THEMES: THEMES,
    style: style,
    mode: mode,
    setStyle: setStyle,
    setMode: setMode,
    resolveMode: resolveMode,
    rootBackground: rootBackground,
    apply: apply,
  };

  apply();
})(typeof window !== 'undefined' ? window : this);
