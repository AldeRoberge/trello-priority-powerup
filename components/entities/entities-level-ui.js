/*
 * Role: the slider of a GAUGE field (kind "level"): how full a bottle is, a battery's charge, how much of a disk is
 * used. One control shared by the entity page and the composer. The range comes from EntitiesModel.levelBounds
 * (minimum 0, maximum = the capacity field or a fixed max); the value is stored in the field's unit, not as a percent.
 * "Vide" and "Plein" jump to the ends; an empty gauge says "Cliquer pour définir…" and is set by touching it.
 *
 * Usage: EntitiesLevelUI.create({ field, bounds, value, label, onChange(number | '') }) -> HTMLElement
 *        EntitiesLevelUI.readout(bounds, value, unit) -> string   (pure, tested)
 */
(function (global) {
  'use strict';

  function fmt(n) {
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }

  /** "350 ml sur 591 ml · 59 %" — or "59 %" when the maximum is only a guess; '' value: the invitation to set it. */
  function readout(bounds, value, unit) {
    if (value === undefined || value === null || value === '') return 'Cliquer pour définir…';
    var u = unit ? ' ' + unit : '';
    var pct = bounds.max > bounds.min ? Math.round(((value - bounds.min) / (bounds.max - bounds.min)) * 100) : 0;
    if (!bounds.known) return fmt(value) + u + (u.trim() === '%' ? '' : ' · ' + pct + ' %');
    return fmt(value) + u + ' sur ' + fmt(bounds.max) + u + ' · ' + pct + ' %';
  }

  function stepFor(bounds) {
    var range = bounds.max - bounds.min;
    return range >= 100 ? 1 : range >= 10 ? 0.5 : 0.1;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function create(o) {
    var b = o.bounds;
    var unit = o.field.unit || (b.known ? '' : '%');
    var unset = o.value === undefined || o.value === null || o.value === '';
    var box = el('div', 'lv' + (unset ? ' lv--unset' : ''));
    var row = el('div', 'lv-row');
    var range = el('input', 'lv-range');
    range.type = 'range';
    range.min = String(b.min);
    range.max = String(b.max);
    range.step = String(stepFor(b));
    range.value = String(unset ? b.max : Math.min(b.max, Math.max(b.min, o.value)));
    range.setAttribute('aria-label', (o.label || o.field.label) + (unit ? ' (' + unit + ')' : ''));
    var read = el('div', 'lv-read', readout(b, unset ? '' : o.value, unit));
    var cur = unset ? '' : o.value;

    function paint(v) {
      box.classList.toggle('lv--unset', v === '');
      read.textContent = readout(b, v, unit);
      var span = b.max - b.min || 1;
      box.style.setProperty('--lv-fill', (v === '' ? 0 : ((v - b.min) / span) * 100) + '%');
    }
    function commit(v) {
      cur = v;
      range.value = String(v === '' ? b.max : v);
      paint(v);
      if (o.onChange) o.onChange(v);
    }
    function end(label, v, title) {
      var btn = el('button', 'lv-end', label);
      btn.type = 'button';
      btn.title = title;
      btn.addEventListener('click', function () { commit(v); });
      return btn;
    }
    range.addEventListener('input', function () { paint(parseFloat(range.value)); });
    range.addEventListener('change', function () { commit(parseFloat(range.value)); });
    row.appendChild(end('Vide', b.min, 'Mettre au minimum'));
    row.appendChild(range);
    row.appendChild(end('Plein', b.max, 'Mettre au maximum'));
    box.appendChild(row);
    var foot = el('div', 'lv-foot');
    foot.appendChild(read);
    if (!unset) {
      var clear = el('button', 'lv-clear', 'Effacer');
      clear.type = 'button';
      clear.addEventListener('click', function () { commit(''); });
      foot.appendChild(clear);
    }
    box.appendChild(foot);
    if (!b.known) box.appendChild(el('div', 'lv-hint', 'Indiquez le maximum (capacité) pour une jauge précise.'));
    paint(cur);
    return box;
  }

  global.EntitiesLevelUI = { create: create, readout: readout, stepFor: stepFor };
})(typeof window !== 'undefined' ? window : this);
