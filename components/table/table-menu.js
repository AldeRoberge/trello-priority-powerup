/*
 * Role: rich popup menu for the Table view — used for the right-click context menu and the
 * Statut dropdown. Items: { icon, label, hint, color, checked, danger, disabled, action, children? } plus
 * { sep: true } and { title: 'Section' } rows. `children` opens a flyout.
 * Icons are Tabler webfont names (without "ti-").
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
    if (typeof a.closeSub === 'function') a.closeSub();
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

    var sub = null;

    function closeSub() {
      if (!sub) return;
      if (sub.owner) sub.owner.classList.remove('is-open');
      if (sub.node.parentNode) sub.node.parentNode.removeChild(sub.node);
      sub = null;
    }

    function setSubCursor(i) {
      if (!sub) return;
      if (sub.cursor >= 0 && sub.rows[sub.cursor]) sub.rows[sub.cursor].el.classList.remove('is-active');
      sub.cursor = i;
      if (sub.rows[i]) {
        sub.rows[i].el.classList.add('is-active');
        if (typeof sub.rows[i].el.scrollIntoView === 'function') sub.rows[i].el.scrollIntoView({ block: 'nearest' });
      }
    }

    function makeRow(item, hint) {
      var hasKids = item.children && item.children.length;
      var row = el('div', 'tbm-item' + (item.danger ? ' is-danger' : '') + (item.disabled ? ' is-disabled' : ''));
      row.setAttribute('role', 'menuitem');
      if (hasKids) row.setAttribute('aria-haspopup', 'menu');
      var ic = el('i', 'ti ti-' + (item.icon || 'point') + ' tbm-icon');
      if (item.color) ic.style.color = item.color;
      row.appendChild(ic);
      row.appendChild(el('span', 'tbm-label', item.label || ''));
      if (item.checked) row.appendChild(el('i', 'ti ti-check tbm-check'));
      else if (item.hint || hint) {
        var hnt = el('span', 'tbm-hint', item.hint || hint);
        if (item.hint) hnt.title = item.hint;
        row.appendChild(hnt);
      }
      if (hasKids) row.appendChild(el('i', 'ti ti-chevron-right tbm-chevron'));
      return row;
    }

    function openSub(ownerEl, item) {
      if (!item.children || !item.children.length) return;
      if (sub && sub.owner === ownerEl) return;
      closeSub();
      var fly = el('div', 'tbm tbm-sub');
      fly.setAttribute('role', 'menu');
      var subRows = [];
      item.children.forEach(function (child) {
        if (!child) return;
        if (child.sep) { fly.appendChild(el('div', 'tbm-sep')); return; }
        if (child.title) { fly.appendChild(el('div', 'tbm-title', child.title)); return; }
        var row = makeRow(child);
        var idx = subRows.length;
        row.addEventListener('click', function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
          run(child);
        });
        row.addEventListener('mousemove', function () {
          if (!child.disabled && sub && sub.cursor !== idx) setSubCursor(idx);
        });
        subRows.push({ el: row, item: child });
        fly.appendChild(row);
      });
      document.body.appendChild(fly);
      ownerEl.classList.add('is-open');
      var rect = ownerEl.getBoundingClientRect();
      var vw = global.innerWidth || 800;
      var vh = global.innerHeight || 600;
      fly.style.visibility = 'hidden';
      var fw = fly.offsetWidth || 200;
      var fh = fly.offsetHeight || 80;
      var left = rect.right + 4;
      if (left + fw > vw - 6) left = Math.max(6, rect.left - fw - 4);
      var top = rect.top - 6;
      if (top + fh > vh - 6) top = Math.max(6, vh - fh - 6);
      fly.style.left = Math.round(left) + 'px';
      fly.style.top = Math.round(top) + 'px';
      fly.style.maxHeight = (vh - 12) + 'px';
      fly.style.visibility = '';
      var checked = subRows.findIndex(function (r) { return r.item.checked; });
      sub = { node: fly, rows: subRows, cursor: -1, owner: ownerEl };
      if (checked >= 0) setSubCursor(checked);
    }

    function addRow(item, hint) {
      var row = makeRow(item, hint);
      var idx = rows.length;
      row.addEventListener('click', function (e) {
        // Keep the click from reaching "click outside" handlers that would close what the action just opened (Colonnes…).
        if (e && e.stopPropagation) e.stopPropagation();
        if (item.children && item.children.length) openSub(row, item);
        else run(item);
      });
      row.addEventListener('mousemove', function () {
        if (cursor !== idx) setCursor(idx);
        if (item.children && item.children.length) openSub(row, item);
        else closeSub();
      });
      rows.push({ el: row, item: item });
      list.appendChild(row);
    }

    function render(query) {
      closeSub();
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
        else if (!item.sep) {
          tagged.push({ item: item, section: section });
          if (item.children) {
            item.children.forEach(function (child) {
              if (child && !child.sep && !child.title) tagged.push({ item: child, section: item.label || section });
            });
          }
        }
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
      closeSub: closeSub,
      onDown: function (e) {
        if (node.contains(e.target)) return;
        if (sub && sub.node.contains(e.target)) return;
        hide();
      },
      onBlur: hide,
      onKey: function (e) {
        if (sub && sub.rows.length) {
          var subEnabled = sub.rows.map(function (r, i) { return r.item.disabled ? -1 : i; }).filter(function (i) { return i >= 0; });
          if (e.key === 'Escape' || e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            closeSub();
            return;
          }
          if (e.key === 'Enter' && sub.rows[sub.cursor]) {
            e.preventDefault();
            e.stopPropagation();
            run(sub.rows[sub.cursor].item);
            return;
          }
          if (subEnabled.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End')) {
            e.preventDefault();
            var sp = subEnabled.indexOf(sub.cursor);
            if (e.key === 'ArrowDown') setSubCursor(subEnabled[(sp + 1) % subEnabled.length]);
            else if (e.key === 'ArrowUp') setSubCursor(subEnabled[(sp <= 0 ? subEnabled.length : sp) - 1]);
            else if (e.key === 'Home') setSubCursor(subEnabled[0]);
            else setSubCursor(subEnabled[subEnabled.length - 1]);
            return;
          }
        }
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
        } else if (e.key === 'ArrowRight' && rows[cursor] && rows[cursor].item.children && rows[cursor].item.children.length) {
          e.preventDefault();
          openSub(rows[cursor].el, rows[cursor].item);
        } else if (e.key === 'Enter' && rows[cursor] && rows[cursor].item.children && rows[cursor].item.children.length) {
          e.preventDefault();
          e.stopPropagation();
          openSub(rows[cursor].el, rows[cursor].item);
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
