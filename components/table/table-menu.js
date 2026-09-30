/*
 * Role: rich popup menu for the Table view — used for the right-click context menu and the
 * Statut dropdown. Items: { icon, label, hint, color, checked, danger, disabled, action } plus
 * { sep: true } and { title: 'Section' } rows. Icons are Tabler webfont names (without "ti-").
 * Keyboard: Up/Down/Home/End move, Enter runs, Escape closes.
 */
(function (global) {
  'use strict';

  var active = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function hide() {
    if (!active) return;
    var a = active;
    active = null;
    document.removeEventListener('mousedown', a.onDown, true);
    document.removeEventListener('keydown', a.onKey, true);
    global.removeEventListener('blur', a.onBlur);
    global.removeEventListener('resize', a.onBlur);
    if (a.node.parentNode) a.node.parentNode.removeChild(a.node);
    if (typeof a.onClose === 'function') a.onClose();
  }

  /**
   * @param {{x:number,y:number}} point  viewport coordinates (e.g. mouse event or a cell rect corner)
   * @param {object[]} items
   * @param {{minWidth?:number,onClose?:function}} [opts]
   */
  function show(point, items, opts) {
    hide();
    opts = opts || {};
    var node = el('div', 'tbm');
    node.setAttribute('role', 'menu');
    if (opts.minWidth) node.style.minWidth = opts.minWidth + 'px';
    var rows = [];
    var cursor = -1;

    function setCursor(i) {
      if (cursor >= 0 && rows[cursor]) rows[cursor].el.classList.remove('is-active');
      cursor = i;
      if (rows[cursor]) {
        rows[cursor].el.classList.add('is-active');
        rows[cursor].el.scrollIntoView({ block: 'nearest' });
      }
    }

    function run(item) {
      if (item.disabled) return;
      hide();
      if (typeof item.action === 'function') item.action();
    }

    var real = items.filter(function (i) {
      return i && !i.sep && !i.title;
    });
    var input = null;
    var list = node;
    if (real.length >= 6) {
      var wrap = el('div', 'tbm-search');
      wrap.appendChild(el('i', 'ti ti-search tbm-search-icon'));
      input = el('input', 'tbm-search-input');
      input.type = 'text';
      input.placeholder = 'Rechercher…';
      input.setAttribute('aria-label', 'Rechercher une action');
      input.setAttribute('autocomplete', 'off');
      wrap.appendChild(input);
      node.appendChild(wrap);
      list = el('div', 'tbm-list');
      node.appendChild(list);
    }

    function addRow(item, hint) {
      var row = el('div', 'tbm-item' + (item.danger ? ' is-danger' : '') + (item.disabled ? ' is-disabled' : ''));
      row.setAttribute('role', 'menuitem');
      var ic = el('i', 'ti ti-' + (item.icon || 'point') + ' tbm-icon');
      if (item.color) ic.style.color = item.color;
      row.appendChild(ic);
      row.appendChild(el('span', 'tbm-label', item.label || ''));
      if (item.checked) row.appendChild(el('i', 'ti ti-check tbm-check'));
      else if (item.hint || hint) row.appendChild(el('span', 'tbm-hint', item.hint || hint));
      row.addEventListener('click', function () {
        run(item);
      });
      var idx = rows.length;
      row.addEventListener('mousemove', function () {
        if (cursor !== idx) setCursor(idx);
      });
      rows.push({ el: row, item: item });
      list.appendChild(row);
    }

    function render(query) {
      while (list.firstChild) list.removeChild(list.firstChild);
      rows = [];
      cursor = -1;
      query = String(query || '').trim();
      if (!query) {
        items.forEach(function (item) {
          if (!item) return;
          if (item.sep) return list.appendChild(el('div', 'tbm-sep'));
          if (item.title) return list.appendChild(el('div', 'tbm-title', item.title));
          addRow(item);
        });
        return;
      }
      var section = '';
      var tagged = [];
      items.forEach(function (item) {
        if (!item) return;
        if (item.title) section = item.title;
        else if (!item.sep) tagged.push({ item: item, section: section });
      });
      var rank = global.ContextMenu && global.ContextMenu.rank;
      var text = function (t) {
        return t.item.label + ' ' + t.section;
      };
      var hits = rank
        ? rank(query, tagged, text)
        : tagged.filter(function (t) {
            return text(t).toLowerCase().indexOf(query.toLowerCase()) !== -1;
          });
      if (!hits.length) return list.appendChild(el('div', 'tbm-empty', 'Aucun résultat'));
      hits.forEach(function (t) {
        addRow(t.item, t.section);
      });
      var first = rows.findIndex(function (r) {
        return !r.item.disabled;
      });
      if (first >= 0) setCursor(first);
    }
    render('');
    if (input) {
      input.addEventListener('input', function () {
        render(input.value);
      });
    }

    document.body.appendChild(node);
    var vw = global.innerWidth;
    var vh = global.innerHeight;
    var w = node.offsetWidth;
    var h = node.offsetHeight;
    var left = Math.max(6, Math.min(point.x, vw - w - 6));
    var top = point.y;
    if (top + h > vh - 6) top = Math.max(6, (point.above != null ? point.above : point.y) - h);
    if (top + h > vh - 6) top = Math.max(6, vh - h - 6);
    node.style.left = Math.round(left) + 'px';
    node.style.top = Math.round(top) + 'px';
    node.style.maxHeight = vh - 12 + 'px';

    var checked = rows.findIndex(function (r) {
      return r.item.checked;
    });
    if (checked >= 0) setCursor(checked);
    if (input) input.focus();

    active = {
      node: node,
      onClose: opts.onClose,
      onDown: function (e) {
        if (!node.contains(e.target)) hide();
      },
      onBlur: hide,
      onKey: function (e) {
        var enabled = rows
          .map(function (r, i) {
            return r.item.disabled ? -1 : i;
          })
          .filter(function (i) {
            return i >= 0;
          });
        if (input && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement !== input) input.focus();
        if (!enabled.length) return;
        var pos = enabled.indexOf(cursor);
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          hide();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setCursor(enabled[(pos + 1) % enabled.length]);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setCursor(enabled[(pos <= 0 ? enabled.length : pos) - 1]);
        } else if (e.key === 'Home') {
          e.preventDefault();
          setCursor(enabled[0]);
        } else if (e.key === 'End') {
          e.preventDefault();
          setCursor(enabled[enabled.length - 1]);
        } else if (e.key === 'Enter' && rows[cursor]) {
          e.preventDefault();
          e.stopPropagation();
          run(rows[cursor].item);
        }
      },
    };
    document.addEventListener('mousedown', active.onDown, true);
    document.addEventListener('keydown', active.onKey, true);
    global.addEventListener('blur', active.onBlur);
    global.addEventListener('resize', active.onBlur);
  }

  global.TableMenu = { show: show, hide: hide };
})(typeof window !== 'undefined' ? window : this);
