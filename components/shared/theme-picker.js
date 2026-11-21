/*
 * Role: the "Apparence" setting. A mode switch (Auto / Clair / Sombre) and a grid of styles (Theme.THEMES).
 * A click applies at once through Theme and the picker redraws; nothing else to save.
 *
 *   ThemePicker.mount(el)
 */
(function (global) {
  'use strict';

  var MODES = [
    { id: 'auto', label: 'Auto', icon: 'device-desktop' },
    { id: 'light', label: 'Clair', icon: 'sun' },
    { id: 'dark', label: 'Sombre', icon: 'moon' },
  ];

  function el(tag, cls, text) {
    var n = global.document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  /** The look a preview shows: the page's current mode (Trello's in Auto). */
  function shownMode() {
    var m = global.document.documentElement.getAttribute('data-color-mode');
    return m === 'dark' ? 'dark' : 'light';
  }

  function mount(host) {
    var T = global.Theme;
    if (!host || !T) return;

    function draw() {
      host.textContent = '';

      var modes = el('div', 'tp-theme-modes');
      modes.setAttribute('role', 'radiogroup');
      modes.setAttribute('aria-label', 'Mode');
      MODES.forEach(function (m) {
        var b = el('button', 'tp-theme-mode' + (T.mode() === m.id ? ' is-active' : ''));
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', T.mode() === m.id ? 'true' : 'false');
        var i = el('i', 'ti ti-' + m.icon);
        i.setAttribute('aria-hidden', 'true');
        b.appendChild(i);
        b.appendChild(global.document.createTextNode(m.label));
        b.addEventListener('click', function () {
          T.setMode(m.id);
          draw();
        });
        modes.appendChild(b);
      });
      host.appendChild(modes);

      var grid = el('div', 'tp-theme-grid');
      grid.setAttribute('role', 'radiogroup');
      grid.setAttribute('aria-label', 'Style');
      var look = shownMode();
      T.THEMES.forEach(function (t) {
        var on = T.style() === t.id;
        var b = el('button', 'tp-theme-card' + (on ? ' is-active' : ''));
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        var sw = t.swatch[look];
        var prev = el('span', 'tp-theme-preview');
        prev.style.background = sw[0];
        var surface = el('span', 'tp-theme-preview-surface');
        surface.style.background = sw[1];
        var accent = el('span', 'tp-theme-preview-accent');
        accent.style.background = sw[2];
        prev.appendChild(surface);
        prev.appendChild(accent);
        b.appendChild(prev);
        b.appendChild(el('span', '', t.label));
        b.addEventListener('click', function () {
          T.setStyle(t.id);
          draw();
        });
        grid.appendChild(b);
      });
      host.appendChild(grid);
    }

    draw();
  }

  global.ThemePicker = { mount: mount, MODES: MODES };
})(typeof window !== 'undefined' ? window : this);
