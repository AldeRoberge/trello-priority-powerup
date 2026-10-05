/*
 * Role: shared "Historique" panel for the Table, Gantt, Kanban and Documents views.
 *  - keeps a local, per-board record of what the view changed (plain data, so it survives a reload)
 *  - renders it as a filterable, searchable list grouped by day, each entry undoable / redoable
 *  - the host supplies `apply(entry, back)`, the write that moves an entry to its before / after state
 * Exposes window.HistoryPanel.create(cfg). Icons: Tabler webfont. Styles: history-panel.css.
 */
(function (global) {
  'use strict';

  var TYPES = {
    archive: { icon: 'archive', tone: 'warn', group: 'archive' },
    create: { icon: 'plus', tone: 'ok', group: 'create' },
    edit: { icon: 'pencil', tone: 'info', group: 'edit' },
    progress: { icon: 'progress-check', tone: 'info', group: 'edit' },
    field: { icon: 'adjustments', tone: 'info', group: 'edit' },
    dates: { icon: 'calendar-event', tone: 'info', group: 'edit' },
    move: { icon: 'arrows-move', tone: 'violet', group: 'move' },
    reorder: { icon: 'arrows-sort', tone: 'violet', group: 'move' },
    delete: { icon: 'trash', tone: 'danger', group: 'archive' },
  };

  var FILTERS = [
    { id: 'all', label: 'Tout', icon: 'list' },
    { id: 'archive', label: 'Archivages', icon: 'archive' },
    { id: 'edit', label: 'Modifications', icon: 'pencil' },
    { id: 'move', label: 'Déplacements', icon: 'arrows-move' },
    { id: 'create', label: 'Créations', icon: 'plus' },
    { id: 'undone', label: 'Annulées', icon: 'arrow-back-up' },
  ];

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function icon(name, cls) {
    return h('i', { class: 'ti ti-' + name + (cls ? ' ' + cls : '') });
  }

  function btn(iconName, label, opts) {
    opts = opts || {};
    return h('button', {
      class: 'hp-btn' + (opts.active ? ' is-active' : '') + (label ? '' : ' hp-btn--icon'),
      type: 'button',
      title: opts.title || label || null,
      onclick: opts.onclick,
    }, [icon(iconName), label ? h('span', { text: label }) : null]);
  }

  function shorten(v) {
    v = String(v == null ? '' : v).replace(/\s+/g, ' ');
    return v.length > 90 ? v.slice(0, 89) + '…' : v;
  }

  function relTime(ts, now) {
    var s = Math.max(0, Math.round(((now || Date.now()) - ts) / 1000));
    if (s < 45) return 'à l’instant';
    if (s < 3600) return 'il y a ' + Math.max(1, Math.round(s / 60)) + ' min';
    if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
    return '';
  }

  function dayLabel(ts, now) {
    var d = new Date(ts);
    var today = new Date(now || Date.now());
    var key = d.toDateString();
    if (key === today.toDateString()) return 'Aujourd’hui';
    var y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (key === y.toDateString()) return 'Hier';
    var label = d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function clock(ts) {
    return new Date(ts).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * cfg: {
   *   key        storage key (include the board id so boards do not share a history)
   *   max        entries kept (default 200)
   *   apply      function (entry, back) -> Promise: performs the undo (back) or redo write
   *   canToggle  optional function (entry) -> bool; default: every type but "field"
   *   verb       function (entry) -> string: what happened, shown after the title
   *   after      optional function (entry, back) -> Promise: runs once a toggle succeeded (reload, sheet push…)
   *   onStatus   optional function (message, kind) for toasts; kind 'busy' | 'ok'
   *   onError    optional function (err)
   *   onChange   optional function (count) fired when the number of entries changes
   *   repaint    optional function: re-render the host drawer that embeds renderInto() (Table)
   * }
   * An entry is plain data: { type, title, targetId, before, after, beforeVal, afterVal, label, key, … }.
   */
  function create(cfg) {
    var max = cfg.max || 200;
    var state = { items: [], filter: 'all', q: '', busy: {}, confirmClear: false, open: false };
    var drawer = null;
    var listeners = [];

    try {
      var saved = JSON.parse(global.localStorage.getItem(cfg.key) || '[]');
      if (Array.isArray(saved)) {
        state.items = saved.filter(function (e) { return e && e.id && TYPES[e.type]; }).slice(0, max);
      }
    } catch (e) { /* storage unavailable or corrupted: start empty */ }

    function persist() {
      try { global.localStorage.setItem(cfg.key, JSON.stringify(state.items.slice(0, max))); } catch (e) { /* storage unavailable */ }
    }

    function changed() {
      if (cfg.onChange) cfg.onChange(state.items.length);
      listeners.forEach(function (fn) { fn(state.items.length, state.open); });
      repaint();
    }

    function canToggle(e) {
      return cfg.canToggle ? cfg.canToggle(e) : e.type !== 'field';
    }

    function record(e) {
      e.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      e.ts = Date.now();
      e.state = 'done';
      state.items.unshift(e);
      if (state.items.length > max) state.items.length = max;
      persist();
      changed();
      return e;
    }

    function toggle(e) {
      if (state.busy[e.id] || !canToggle(e)) return Promise.resolve();
      var back = e.state === 'done';
      state.busy[e.id] = true;
      if (cfg.onStatus) cfg.onStatus(back ? 'Annulation…' : 'Rétablissement…', 'busy');
      repaint();
      var run;
      try { run = Promise.resolve(cfg.apply(e, back)); } catch (err) { run = Promise.reject(err); }
      return run.then(
        function () {
          e.state = back ? 'undone' : 'done';
          e.tsChanged = Date.now();
          delete state.busy[e.id];
          persist();
          if (cfg.onStatus) cfg.onStatus(back ? 'Action annulée' : 'Action rétablie', 'ok');
          return cfg.after ? cfg.after(e, back) : undefined;
        },
        function (err) {
          delete state.busy[e.id];
          if (cfg.onError) cfg.onError(err);
        }
      ).then(function () { changed(); });
    }

    function clear() {
      state.items = [];
      state.confirmClear = false;
      persist();
      changed();
    }

    function visible() {
      var q = state.q.trim().toLowerCase();
      return state.items.filter(function (e) {
        if (state.filter === 'undone' ? e.state !== 'undone' : state.filter !== 'all' && TYPES[e.type].group !== state.filter) return false;
        if (!q) return true;
        return [e.title, e.before, e.after, cfg.verb(e)].join(' ').toLowerCase().indexOf(q) !== -1;
      });
    }

    function diff(before, after) {
      var box = h('span', { class: 'hp-diff' });
      box.appendChild(h('span', { class: 'hp-diff-old', title: before, text: shorten(before) || '(vide)' }));
      box.appendChild(icon('arrow-right', 'hp-diff-arrow'));
      box.appendChild(h('span', { class: 'hp-diff-new', title: after, text: shorten(after) || '(vide)' }));
      return box;
    }

    function itemEl(e) {
      var meta = TYPES[e.type];
      var undone = e.state === 'undone';
      var busy = !!state.busy[e.id];
      var title = h('div', { class: 'hp-title' }, [
        h('strong', { class: 'hp-card', text: e.title || 'Sans titre' }),
        h('span', { class: 'hp-verb', text: cfg.verb(e) }),
        undone ? h('span', { class: 'hp-tag', text: 'Annulée' }) : null,
      ]);
      var detail = null;
      if (e.detail) detail = h('div', { class: 'hp-sub' }, [icon(e.detailIcon || 'info-circle'), h('span', { text: e.detail })]);
      else if (e.before || e.after) detail = h('div', { class: 'hp-sub' }, [diff(e.before, e.after)]);
      var when = relTime(e.ts);
      var side = h('div', { class: 'hp-side' }, [
        h('span', { class: 'hp-time', title: new Date(e.ts).toLocaleString('fr-CA'), text: clock(e.ts) + (when ? ' · ' + when : '') }),
        canToggle(e)
          ? h('button', {
              class: 'hp-act' + (undone ? ' is-redo' : ''),
              type: 'button',
              disabled: busy ? true : null,
              title: undone ? 'Rétablir cette modification' : 'Annuler cette modification',
              onclick: function () { toggle(e); },
            }, [icon(busy ? 'loader-2' : undone ? 'arrow-forward-up' : 'arrow-back-up', busy ? 'hp-spin' : ''), h('span', { text: undone ? 'Rétablir' : 'Annuler' })])
          : h('span', { class: 'hp-noundo', title: 'Annulation indisponible pour cette modification', text: 'Non annulable' }),
      ]);
      return h('li', { class: 'hp-item' + (undone ? ' is-undone' : '') }, [
        h('span', { class: 'hp-ico hp-ico--' + meta.tone }, [icon(meta.icon)]),
        h('div', { class: 'hp-main' }, [title, detail]),
        side,
      ]);
    }

    function fillList(listEl) {
      listEl.innerHTML = '';
      var items = visible();
      if (!items.length) {
        listEl.appendChild(h('li', { class: 'hp-empty' }, [
          icon('history'),
          h('div', { text: state.items.length ? 'Aucune entrée ne correspond à ce filtre.' : 'Rien dans l’historique pour le moment.' }),
          state.items.length ? null : h('small', { text: 'Archivages, modifications, déplacements et créations faits depuis cette vue apparaîtront ici, avec un bouton pour les annuler.' }),
        ]));
        return;
      }
      var counts = {};
      items.forEach(function (e) { var k = new Date(e.ts).toDateString(); counts[k] = (counts[k] || 0) + 1; });
      var last = '';
      items.forEach(function (e) {
        var k = new Date(e.ts).toDateString();
        if (k !== last) {
          last = k;
          listEl.appendChild(h('li', { class: 'hp-day' }, [h('span', { text: dayLabel(e.ts) }), h('em', { text: String(counts[k]) })]));
        }
        listEl.appendChild(itemEl(e));
      });
    }

    function countsByFilter() {
      var c = { all: state.items.length, undone: 0, archive: 0, edit: 0, move: 0, create: 0 };
      state.items.forEach(function (e) {
        c[TYPES[e.type].group] += 1;
        if (e.state === 'undone') c.undone += 1;
      });
      return c;
    }

    /** Appends search + clear + close to `head`, then the filter chips and the list to `d`. */
    function renderInto(d, head, onClose) {
      var listEl = h('ul', { class: 'hp-list' });
      head.appendChild(h('span', { class: 'hp-search' }, [
        icon('search'),
        h('input', {
          class: 'hp-input', type: 'search', placeholder: 'Chercher un élément ou une valeur…', value: state.q,
          oninput: function (ev) { state.q = ev.target.value; fillList(listEl); },
        }),
      ]));
      head.appendChild(h('span', { class: 'hp-spacer' }));
      head.appendChild(
        state.confirmClear
          ? btn('trash', 'Confirmer l’effacement', { title: 'Les actions ne pourront plus être annulées depuis ici', onclick: clear })
          : btn('trash', null, {
              title: 'Vider l’historique',
              onclick: function () {
                if (!state.items.length) return;
                state.confirmClear = true;
                repaint();
                setTimeout(function () { if (state.confirmClear) { state.confirmClear = false; repaint(); } }, 4000);
              },
            })
      );
      if (onClose) head.appendChild(btn('chevron-down', null, { title: 'Fermer', onclick: onClose }));
      d.appendChild(head);
      var counts = countsByFilter();
      d.appendChild(h('div', { class: 'hp-chips' }, FILTERS.map(function (f) {
        return h('button', {
          class: 'hp-chip' + (state.filter === f.id ? ' is-on' : ''),
          type: 'button',
          onclick: function () { state.filter = f.id; repaint(); },
        }, [icon(f.icon), h('span', { text: f.label }), h('em', { text: String(counts[f.id] || 0) })]);
      })));
      fillList(listEl);
      d.appendChild(h('div', { class: 'hp-body' }, [listEl]));
    }

    function repaint() {
      if (drawer && state.open) paintDrawer();
      else if (cfg.repaint) cfg.repaint();
    }

    /* Stand-alone docked drawer for hosts without one (Gantt, Kanban, Documents). */
    function paintDrawer() {
      drawer.innerHTML = '';
      drawer.hidden = !state.open;
      if (!state.open) return;
      var head = h('div', { class: 'hp-head' }, [h('span', { class: 'hp-head-title' }, [icon('history'), h('span', { text: 'Historique' })])]);
      renderInto(drawer, head, function () { setOpen(false); });
    }

    function setOpen(open, parent) {
      state.open = !!open;
      if (open && !drawer) {
        drawer = h('div', { class: 'hp-drawer', hidden: true });
        (parent || document.body).appendChild(drawer);
      }
      if (drawer) paintDrawer();
      listeners.forEach(function (fn) { fn(state.items.length, state.open); });
    }

    return {
      record: record,
      toggle: toggle,
      clear: clear,
      renderInto: renderInto,
      open: function (parent) { setOpen(true, parent); },
      close: function () { setOpen(false); },
      toggleDrawer: function (parent) { setOpen(!state.open, parent); },
      isOpen: function () { return state.open; },
      count: function () { return state.items.length; },
      items: function () { return state.items; },
      subscribe: function (fn) { listeners.push(fn); },
      /** Appends a toolbar button (with entry-count badge) that opens / closes the docked drawer. */
      button: function (parent) {
        var badge = h('span', { class: 'hp-badge', hidden: !state.items.length, text: String(Math.min(state.items.length, 99)) });
        var b = h('button', {
          class: 'hp-btn hp-toolbar-btn', type: 'button', title: 'Historique des modifications, avec annulation',
          onclick: function () { setOpen(!state.open, parent); },
        }, [icon('history'), h('span', { text: 'Historique' }), badge]);
        listeners.push(function (n, open) {
          badge.hidden = !n;
          badge.textContent = String(Math.min(n, 99));
          b.classList.toggle('is-active', !!open);
        });
        return b;
      },
    };
  }

  global.HistoryPanel = { create: create, TYPES: TYPES, FILTERS: FILTERS, _relTime: relTime, _dayLabel: dayLabel };
})(typeof window !== 'undefined' ? window : globalThis);
