/**
 * Gantt sort + filter controls (gantt.html).
 * Exposes window.GanttFilters.
 *
 * Role: DOM widgets for multi-level sorting (a stack of "Statut → Priorité → Nom"
 * levels) and rich filtering (assignee, status, priority, due, list, label, search),
 * plus the summary strip that shows what is active. State lives in GanttUI; every
 * widget here takes getters / setters and never touches the tree. Rules
 * (comparators, criteria matching, facets) live in GanttModel. Pure helpers
 * (presets, describeCriteria, describeSort) are exported for unit tests.
 */
(function (global) {
  'use strict';

  function GM() {
    return global.GanttModel;
  }

  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') n.textContent = attrs[k];
        else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
      });
    }
    return n;
  }

  function icon(tiClass) {
    var i = el('i', 'ti ' + tiClass);
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  // ── Pure helpers ─────────────────────────────────────────────────────

  var DIR_LABELS = {
    status: ['En cours → Terminé', 'Terminé → En cours'],
    priority: ['Plus urgent d’abord', 'Moins urgent d’abord'],
    date: ['Plus proche d’abord', 'Plus lointaine d’abord'],
    name: ['A → Z', 'Z → A'],
    progress: ['0 → 100 %', '100 → 0 %'],
    subtasks: ['Moins → plus', 'Plus → moins'],
    list: ['A → Z', 'Z → A'],
    assignee: ['A → Z', 'Z → A'],
  };

  function sortDirLabel(by, dir) {
    var pair = DIR_LABELS[by] || ['Croissant', 'Décroissant'];
    return dir === 'desc' ? pair[1] : pair[0];
  }

  function sortFieldLabel(by) {
    var fields = (GM() && GM().SORT_FIELDS) || [];
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].key === by) return fields[i].label;
    }
    return by;
  }

  function sortFieldIcon(by) {
    var fields = (GM() && GM().SORT_FIELDS) || [];
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].key === by) return fields[i].icon;
    }
    return 'ti-arrows-sort';
  }

  /** "Priorité ▲ › Date ▲" style summary of the sort levels. */
  function describeSort(keys) {
    return (keys || [])
      .map(function (k) {
        return sortFieldLabel(k.by) + ' ' + (k.dir === 'desc' ? '▼' : '▲');
      })
      .join(' › ');
  }

  var SORT_PRESETS = [
    {
      id: 'urgent',
      label: 'Urgent d’abord',
      icon: 'ti-flame',
      keys: [
        { by: 'priority', dir: 'asc' },
        { by: 'date', dir: 'asc' },
        { by: 'name', dir: 'asc' },
      ],
    },
    {
      id: 'deadline',
      label: 'Échéances',
      icon: 'ti-calendar-due',
      keys: [
        { by: 'date', dir: 'asc' },
        { by: 'priority', dir: 'asc' },
      ],
    },
    {
      id: 'people',
      label: 'Par personne',
      icon: 'ti-users',
      keys: [
        { by: 'assignee', dir: 'asc' },
        { by: 'priority', dir: 'asc' },
        { by: 'date', dir: 'asc' },
      ],
    },
    {
      id: 'progress',
      label: 'Avancement',
      icon: 'ti-percentage',
      keys: [
        { by: 'progress', dir: 'desc' },
        { by: 'name', dir: 'asc' },
      ],
    },
    {
      id: 'az',
      label: 'Alphabétique',
      icon: 'ti-abc',
      keys: [{ by: 'name', dir: 'asc' }],
    },
  ];

  var ACTIVE_STATUSES = ['started', 'pending', 'blocked'];

  var FILTER_PRESETS = [
    {
      id: 'mine',
      label: 'Mes tâches',
      icon: 'ti-user-check',
      criteria: { assignees: ['me'], statuses: ACTIVE_STATUSES },
    },
    {
      id: 'overdue',
      label: 'En retard',
      icon: 'ti-alarm',
      criteria: { due: ['overdue'], statuses: ACTIVE_STATUSES },
    },
    {
      id: 'week',
      label: 'Cette semaine',
      icon: 'ti-calendar-week',
      criteria: { due: ['overdue', 'week'], statuses: ACTIVE_STATUSES },
    },
    {
      id: 'unassigned',
      label: 'Non assignées',
      icon: 'ti-user-question',
      criteria: { assignees: ['none'], statuses: ACTIVE_STATUSES },
    },
    {
      id: 'blocked',
      label: 'Bloquées',
      icon: 'ti-lock',
      criteria: { statuses: ['blocked'] },
    },
  ];

  function sameList(a, b) {
    if (a.length !== b.length) return false;
    var x = a.slice().sort();
    var y = b.slice().sort();
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  /** True when the criteria are exactly the preset (nothing more, nothing less). */
  function presetMatches(preset, criteria) {
    var model = GM();
    var want = model.normalizeCriteria(preset.criteria);
    var have = model.normalizeCriteria(criteria);
    return (
      !have.query &&
      sameList(want.statuses, have.statuses) &&
      sameList(want.assignees, have.assignees) &&
      sameList(want.priorities, have.priorities) &&
      sameList(want.lists, have.lists) &&
      sameList(want.labels, have.labels) &&
      sameList(want.due, have.due)
    );
  }

  function toggleIn(list, value) {
    var out = (list || []).slice();
    var at = out.indexOf(value);
    if (at === -1) out.push(value);
    else out.splice(at, 1);
    return out;
  }

  function withGroup(criteria, group, values) {
    var next = GM().normalizeCriteria(criteria);
    next[group] = values;
    return next;
  }

  /**
   * Summary of active criteria for the chip strip:
   * [{ group, caption, text, icon }]. `facets` (GanttModel.collectFacets) gives
   * names for ids.
   */
  function describeCriteria(criteria, facets) {
    var model = GM();
    var c = model.normalizeCriteria(criteria);
    facets = facets || {};
    var out = [];

    function nameOf(list, id, fallback) {
      for (var i = 0; i < (list || []).length; i++) {
        if (String(list[i].id) === String(id)) return list[i].name || fallback;
      }
      return fallback;
    }

    if (c.query) {
      out.push({ group: 'query', caption: 'Recherche', text: '« ' + c.query + ' »', icon: 'ti-search' });
    }
    if (c.assignees.length) {
      out.push({
        group: 'assignees',
        caption: 'Assigné',
        icon: 'ti-user',
        text: c.assignees
          .map(function (tok) {
            if (tok === 'me') return 'Moi';
            if (tok === 'none') return 'Non assigné';
            return nameOf(facets.assignees, tok, 'Inconnu');
          })
          .join(', '),
      });
    }
    if (c.statuses.length) {
      out.push({
        group: 'statuses',
        caption: 'Statut',
        icon: 'ti-circle-dot',
        text: c.statuses
          .map(function (s) {
            return model.STATUS_LABELS[s];
          })
          .join(', '),
      });
    }
    if (c.priorities.length) {
      out.push({
        group: 'priorities',
        caption: 'Priorité',
        icon: 'ti-flame',
        text: c.priorities
          .map(function (k) {
            if (k === 'none') return 'Sans priorité';
            for (var i = 0; i < (facets.priorities || []).length; i++) {
              if (facets.priorities[i].key === k) return facets.priorities[i].label;
            }
            return k;
          })
          .join(', '),
      });
    }
    if (c.due.length) {
      out.push({
        group: 'due',
        caption: 'Échéance',
        icon: 'ti-calendar-due',
        text: c.due
          .map(function (k) {
            return model.DUE_LABELS[k];
          })
          .join(', '),
      });
    }
    if (c.lists.length) {
      out.push({
        group: 'lists',
        caption: 'Liste',
        icon: 'ti-layout-columns',
        text: c.lists
          .map(function (id) {
            return nameOf(facets.lists, id, 'Liste');
          })
          .join(', '),
      });
    }
    if (c.labels.length) {
      out.push({
        group: 'labels',
        caption: 'Étiquette',
        icon: 'ti-tag',
        text: c.labels
          .map(function (id) {
            return nameOf(facets.labels, id, 'Étiquette');
          })
          .join(', '),
      });
    }
    return out;
  }

  // ── Popover plumbing (one open at a time) ────────────────────────────

  var openPop = null;

  function closeOpenPop() {
    if (openPop) {
      var p = openPop;
      openPop = null;
      p.close();
    }
  }

  /**
   * Button + anchored popover. `build(body)` (re)fills the popover; call
   * `refresh()` after any state change while it is open.
   */
  function createPopover(opts) {
    var wrap = el('div', 'gantt-pop-wrap');
    var button = el('button', 'gantt-btn gantt-pop-btn', { type: 'button' });
    var pop = el('div', 'gantt-pop ' + (opts.className || ''));
    pop.hidden = true;
    pop.setAttribute('role', 'dialog');
    if (opts.ariaLabel) pop.setAttribute('aria-label', opts.ariaLabel);
    var isOpen = false;
    var outside = null;
    var keyHandler = null;

    function close() {
      if (!isOpen) return;
      isOpen = false;
      pop.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (outside) document.removeEventListener('pointerdown', outside, true);
      if (keyHandler) document.removeEventListener('keydown', keyHandler, true);
      outside = null;
      keyHandler = null;
      if (openPop && openPop.wrap === wrap) openPop = null;
      if (opts.onClose) opts.onClose();
    }

    /** Anchored to the button's right edge; slide right if that clips the left. */
    function keepOnScreen() {
      pop.style.left = '';
      pop.style.right = '0';
      var r = pop.getBoundingClientRect();
      if (r.left < 8) {
        var w = wrap.getBoundingClientRect();
        pop.style.right = 'auto';
        pop.style.left = 8 - w.left + 'px';
      }
    }

    function open() {
      closeOpenPop();
      isOpen = true;
      pop.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      openPop = { wrap: wrap, close: close };
      if (opts.onOpen) opts.onOpen();
      keepOnScreen();
      outside = function (e) {
        if (wrap.contains(e.target)) return;
        close();
      };
      keyHandler = function (e) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
          button.focus();
        }
      };
      setTimeout(function () {
        if (!isOpen) return;
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', keyHandler, true);
      }, 0);
    }

    button.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isOpen) close();
      else open();
    });
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    wrap.appendChild(button);
    wrap.appendChild(pop);
    return {
      wrap: wrap,
      button: button,
      pop: pop,
      open: open,
      close: close,
      isOpen: function () {
        return isOpen;
      },
    };
  }

  function badge(n) {
    var b = el('span', 'gantt-filter-badge');
    b.textContent = n ? String(n) : '';
    b.hidden = !n;
    return b;
  }

  function chip(spec) {
    var b = el(
      'button',
      'gantt-chip' + (spec.active ? ' is-active' : '') + (spec.className ? ' ' + spec.className : ''),
      { type: 'button' }
    );
    b.setAttribute('aria-pressed', spec.active ? 'true' : 'false');
    if (spec.title) b.title = spec.title;
    if (spec.disabled) b.disabled = true;
    if (spec.avatar) {
      b.appendChild(el('span', 'gantt-chip-avatar', { text: spec.avatar }));
    } else if (spec.dot) {
      var dot = el('span', 'gantt-chip-dot');
      dot.style.backgroundColor = spec.dot;
      b.appendChild(dot);
    } else if (spec.icon) {
      b.appendChild(icon(spec.icon));
    }
    b.appendChild(el('span', 'gantt-chip-text', { text: spec.label }));
    if (spec.count != null) b.appendChild(el('span', 'gantt-chip-count', { text: String(spec.count) }));
    if (spec.onClick) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        spec.onClick(e);
      });
    }
    return b;
  }

  // ── Sort panel ───────────────────────────────────────────────────────

  /**
   * opts: { getKeys, setKeys(keys), getGroup, setGroup(bool) }
   * @returns {{ wrap, refresh }}
   */
  function createSortPanel(opts) {
    var model = GM();
    var ui = createPopover({
      className: 'gantt-pop--sort',
      ariaLabel: 'Trier les tâches',
      onOpen: function () {
        build();
      },
    });
    ui.button.title = 'Trier les tâches (plusieurs niveaux)';
    var btnBadge = badge(0);

    function refreshButton() {
      var keys = opts.getKeys();
      ui.button.textContent = '';
      ui.button.appendChild(icon('ti-arrows-sort'));
      ui.button.appendChild(document.createTextNode('Trier : ' + sortFieldLabel(keys[0].by)));
      ui.button.appendChild(
        el('span', 'gantt-sort-dir', { text: keys[0].dir === 'desc' ? '▼' : '▲' })
      );
      btnBadge = badge(keys.length > 1 ? keys.length : 0);
      ui.button.appendChild(btnBadge);
      ui.button.classList.toggle('is-active', keys.length > 1);
    }

    function commit(keys) {
      opts.setKeys(model.normalizeSortKeys(keys));
      refreshButton();
      if (ui.isOpen()) build();
    }

    var dragFrom = -1;

    function build() {
      var keys = opts.getKeys();
      var pop = ui.pop;
      pop.textContent = '';

      var head = el('div', 'gantt-pop-head');
      head.appendChild(icon('ti-arrows-sort'));
      head.appendChild(el('span', 'gantt-pop-title', { text: 'Tri multi-niveaux' }));
      head.appendChild(
        el('span', 'gantt-pop-hint', {
          text: 'Le niveau 1 prime ; les suivants départagent les égalités.',
        })
      );
      pop.appendChild(head);

      var list = el('ol', 'gantt-levels');
      keys.forEach(function (k, idx) {
        var li = el('li', 'gantt-level');
        li.draggable = true;
        li.setAttribute('data-index', String(idx));

        var grip = el('span', 'gantt-level-grip', { tabindex: '0', role: 'button' });
        grip.title = 'Glisser pour réordonner (ou Alt + ↑ / ↓)';
        grip.setAttribute('aria-label', 'Réordonner le niveau ' + (idx + 1));
        grip.appendChild(icon('ti-grip-vertical'));
        grip.addEventListener('keydown', function (e) {
          if (!e.altKey) return;
          var to = e.key === 'ArrowUp' ? idx - 1 : e.key === 'ArrowDown' ? idx + 1 : -1;
          if (to < 0 || to >= keys.length) return;
          e.preventDefault();
          var next = keys.slice();
          next.splice(to, 0, next.splice(idx, 1)[0]);
          commit(next);
          var again = ui.pop.querySelectorAll('.gantt-level-grip')[to];
          if (again) again.focus();
        });
        li.appendChild(grip);
        li.appendChild(el('span', 'gantt-level-num', { text: String(idx + 1) }));

        var sel = el('select', 'gantt-select gantt-level-field');
        sel.setAttribute('aria-label', 'Champ du niveau ' + (idx + 1));
        model.SORT_FIELDS.forEach(function (f) {
          var taken = false;
          for (var j = 0; j < keys.length; j++) {
            if (j !== idx && keys[j].by === f.key) taken = true;
          }
          if (taken) return;
          var o = el('option', '', { value: f.key, text: f.label });
          if (f.key === k.by) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', function () {
          var next = keys.slice();
          next[idx] = { by: sel.value, dir: model.sortFieldDefaultDir(sel.value) };
          commit(next);
        });
        li.appendChild(sel);

        var dirBtn = el('button', 'gantt-level-dir', { type: 'button' });
        dirBtn.title = 'Inverser le sens';
        dirBtn.appendChild(icon(k.dir === 'desc' ? 'ti-sort-descending' : 'ti-sort-ascending'));
        dirBtn.appendChild(document.createTextNode(sortDirLabel(k.by, k.dir)));
        dirBtn.addEventListener('click', function () {
          var next = keys.slice();
          next[idx] = { by: k.by, dir: k.dir === 'desc' ? 'asc' : 'desc' };
          commit(next);
        });
        li.appendChild(dirBtn);

        var rm = el('button', 'gantt-level-remove', { type: 'button' });
        rm.title = 'Retirer ce niveau';
        rm.setAttribute('aria-label', 'Retirer le niveau ' + (idx + 1));
        rm.appendChild(icon('ti-x'));
        rm.disabled = keys.length <= 1;
        rm.addEventListener('click', function () {
          var next = keys.slice();
          next.splice(idx, 1);
          commit(next);
        });
        li.appendChild(rm);

        li.addEventListener('dragstart', function (e) {
          dragFrom = idx;
          li.classList.add('is-dragging');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try {
              e.dataTransfer.setData('text/plain', String(idx));
            } catch (err) {
              /* ignore */
            }
          }
        });
        li.addEventListener('dragend', function () {
          dragFrom = -1;
          li.classList.remove('is-dragging');
          list.querySelectorAll('.is-drop-before, .is-drop-after').forEach(function (n) {
            n.classList.remove('is-drop-before', 'is-drop-after');
          });
        });
        li.addEventListener('dragover', function (e) {
          if (dragFrom < 0) return;
          e.preventDefault();
          var rect = li.getBoundingClientRect();
          var after = e.clientY > rect.top + rect.height / 2;
          li.classList.toggle('is-drop-after', after);
          li.classList.toggle('is-drop-before', !after);
        });
        li.addEventListener('dragleave', function () {
          li.classList.remove('is-drop-before', 'is-drop-after');
        });
        li.addEventListener('drop', function (e) {
          if (dragFrom < 0) return;
          e.preventDefault();
          var rect = li.getBoundingClientRect();
          var after = e.clientY > rect.top + rect.height / 2;
          var to = idx + (after ? 1 : 0);
          var next = keys.slice();
          var moved = next.splice(dragFrom, 1)[0];
          if (dragFrom < to) to--;
          next.splice(to, 0, moved);
          dragFrom = -1;
          commit(next);
        });

        list.appendChild(li);
      });
      pop.appendChild(list);

      // Add a level
      var unused = model.SORT_FIELDS.filter(function (f) {
        return !keys.some(function (k) {
          return k.by === f.key;
        });
      });
      if (unused.length && keys.length < model.MAX_SORT_KEYS) {
        var add = el('div', 'gantt-pop-section');
        add.appendChild(el('div', 'gantt-pop-caption', { text: 'Ajouter un niveau' }));
        var row = el('div', 'gantt-chip-row');
        unused.forEach(function (f) {
          row.appendChild(
            chip({
              label: f.label,
              icon: f.icon,
              onClick: function () {
                commit(keys.concat([{ by: f.key, dir: f.dir }]));
              },
            })
          );
        });
        add.appendChild(row);
        pop.appendChild(add);
      }

      // Presets
      var presets = el('div', 'gantt-pop-section');
      presets.appendChild(el('div', 'gantt-pop-caption', { text: 'Modèles' }));
      var prow = el('div', 'gantt-chip-row');
      SORT_PRESETS.forEach(function (p) {
        var active =
          JSON.stringify(model.normalizeSortKeys(p.keys)) === JSON.stringify(keys);
        prow.appendChild(
          chip({
            label: p.label,
            icon: p.icon,
            active: active,
            title: describeSort(model.normalizeSortKeys(p.keys)),
            onClick: function () {
              commit(p.keys);
            },
          })
        );
      });
      presets.appendChild(prow);
      pop.appendChild(presets);

      // Grouping
      var foot = el('div', 'gantt-pop-foot');
      var lab = el('label', 'gantt-switch');
      var cb = el('input', '', { type: 'checkbox' });
      cb.checked = !!opts.getGroup();
      cb.addEventListener('change', function () {
        opts.setGroup(!!cb.checked);
      });
      lab.appendChild(cb);
      lab.appendChild(el('span', 'gantt-switch-track'));
      lab.appendChild(
        el('span', 'gantt-switch-text', {
          text: 'Regrouper par statut (En cours · À faire · Bloqué)',
        })
      );
      foot.appendChild(lab);
      pop.appendChild(foot);
    }

    refreshButton();
    return {
      wrap: ui.wrap,
      refresh: function () {
        refreshButton();
        if (ui.isOpen()) build();
      },
      close: ui.close,
    };
  }

  // ── Filter panel ─────────────────────────────────────────────────────

  var LABEL_COLORS = {
    green: '#4bce97',
    yellow: '#e2b203',
    orange: '#f38a3f',
    red: '#f87168',
    purple: '#9f8fef',
    blue: '#579dff',
    sky: '#6cc3e0',
    lime: '#94c748',
    pink: '#e774bb',
    black: '#8590a2',
  };

  function labelColor(name) {
    var base = String(name || '').replace(/_(light|dark)$/, '');
    return LABEL_COLORS[base] || '#8590a2';
  }

  var STATUS_DOT = {
    started: '#579dff',
    pending: '#8590a2',
    blocked: '#f87168',
    completed: '#4bce97',
  };

  /**
   * opts: {
   *   getCriteria, setCriteria(c), getFacets(), hasMe(), getOptions(),
   *   setOption(name, bool), getCounts() -> {shown,total}, onReset()
   * }
   * @returns {{ wrap, refresh, searchInput }}
   */
  function createFilterPanel(opts) {
    var model = GM();
    var ui = createPopover({
      className: 'gantt-pop--filter',
      ariaLabel: 'Filtrer les tâches',
      onOpen: function () {
        buildBody();
      },
    });
    ui.button.title = 'Filtrer les tâches affichées';

    var searchInput = el('input', 'gantt-search', {
      type: 'search',
      placeholder: 'Rechercher… (titre, personne, liste, étiquette)',
    });
    searchInput.setAttribute('aria-label', 'Rechercher une tâche');
    searchInput.autocomplete = 'off';
    var bodyEl = el('div', 'gantt-filter-body');
    var footCount = el('span', 'gantt-pop-count');

    function activeCount() {
      var o = opts.getOptions();
      return (
        model.criteriaCount(opts.getCriteria()) +
        (o.hideCompleted ? 1 : 0) +
        (o.hideBlocked ? 1 : 0) +
        (o.hideUndated ? 1 : 0)
      );
    }

    function refreshButton() {
      ui.button.textContent = '';
      ui.button.appendChild(icon('ti-filter'));
      ui.button.appendChild(document.createTextNode('Filtres'));
      var n = activeCount();
      ui.button.appendChild(badge(n));
      ui.button.classList.toggle('is-active', n > 0);
    }

    function setCriteria(next) {
      opts.setCriteria(model.normalizeCriteria(next));
      refresh();
    }

    function group(title, iconClass, chips, hint) {
      var sec = el('section', 'gantt-pop-section');
      var cap = el('div', 'gantt-pop-caption');
      cap.appendChild(icon(iconClass));
      cap.appendChild(document.createTextNode(title));
      if (hint) cap.appendChild(el('span', 'gantt-pop-caption-hint', { text: hint }));
      sec.appendChild(cap);
      var row = el('div', 'gantt-chip-row');
      chips.forEach(function (c) {
        row.appendChild(c);
      });
      sec.appendChild(row);
      return sec;
    }

    function buildBody() {
      var c = model.normalizeCriteria(opts.getCriteria());
      var facets = opts.getFacets();
      var options = opts.getOptions();
      bodyEl.textContent = '';

      // Presets
      var presets = el('div', 'gantt-chip-row gantt-presets');
      FILTER_PRESETS.forEach(function (p) {
        presets.appendChild(
          chip({
            label: p.label,
            icon: p.icon,
            className: 'gantt-chip--preset',
            active: presetMatches(p, c),
            disabled: p.id === 'mine' && !opts.hasMe(),
            title:
              p.id === 'mine' && !opts.hasMe()
                ? 'Utilisateur Trello non identifié'
                : '',
            onClick: function () {
              setCriteria(presetMatches(p, c) ? model.emptyCriteria() : p.criteria);
            },
          })
        );
      });
      bodyEl.appendChild(presets);

      // Assignee
      var people = [
        chip({
          label: 'Moi',
          icon: 'ti-user-check',
          count: facets.mine,
          active: c.assignees.indexOf('me') !== -1,
          disabled: !opts.hasMe(),
          title: opts.hasMe() ? '' : 'Utilisateur Trello non identifié',
          onClick: function () {
            setCriteria(withGroup(c, 'assignees', toggleIn(c.assignees, 'me')));
          },
        }),
        chip({
          label: 'Non assigné',
          icon: 'ti-user-question',
          count: facets.unassigned,
          active: c.assignees.indexOf('none') !== -1,
          onClick: function () {
            setCriteria(withGroup(c, 'assignees', toggleIn(c.assignees, 'none')));
          },
        }),
      ];
      (facets.assignees || []).forEach(function (p) {
        people.push(
          chip({
            label: p.name,
            avatar: p.initials,
            count: p.count,
            active: c.assignees.indexOf(p.id) !== -1,
            onClick: function () {
              setCriteria(withGroup(c, 'assignees', toggleIn(c.assignees, p.id)));
            },
          })
        );
      });
      bodyEl.appendChild(group('Assigné à', 'ti-users', people));

      // Status
      bodyEl.appendChild(
        group(
          'Statut',
          'ti-circle-dot',
          model.STATUS_KEYS.map(function (s) {
            return chip({
              label: model.STATUS_LABELS[s],
              dot: STATUS_DOT[s],
              count: facets.statuses ? facets.statuses[s] : null,
              active: c.statuses.indexOf(s) !== -1,
              onClick: function () {
                setCriteria(withGroup(c, 'statuses', toggleIn(c.statuses, s)));
              },
            });
          })
        )
      );

      // Priority
      var prios = (facets.priorities || []).map(function (p) {
        return chip({
          label: p.label,
          dot: p.fill || '#8590a2',
          count: p.count,
          active: c.priorities.indexOf(p.key) !== -1,
          onClick: function () {
            setCriteria(withGroup(c, 'priorities', toggleIn(c.priorities, p.key)));
          },
        });
      });
      prios.push(
        chip({
          label: 'Sans priorité',
          icon: 'ti-flame-off',
          count: facets.noPriority,
          active: c.priorities.indexOf('none') !== -1,
          onClick: function () {
            setCriteria(withGroup(c, 'priorities', toggleIn(c.priorities, 'none')));
          },
        })
      );
      bodyEl.appendChild(group('Priorité', 'ti-flame', prios));

      // Due
      bodyEl.appendChild(
        group(
          'Échéance',
          'ti-calendar-due',
          model.DUE_KEYS.map(function (k) {
            return chip({
              label: model.DUE_LABELS[k],
              active: c.due.indexOf(k) !== -1,
              onClick: function () {
                setCriteria(withGroup(c, 'due', toggleIn(c.due, k)));
              },
            });
          })
        )
      );

      // Lists
      if ((facets.lists || []).length > 1) {
        bodyEl.appendChild(
          group(
            'Liste',
            'ti-layout-columns',
            facets.lists.map(function (l) {
              return chip({
                label: l.name,
                count: l.count,
                active: c.lists.indexOf(l.id) !== -1,
                onClick: function () {
                  setCriteria(withGroup(c, 'lists', toggleIn(c.lists, l.id)));
                },
              });
            })
          )
        );
      }

      // Labels
      if ((facets.labels || []).length) {
        bodyEl.appendChild(
          group(
            'Étiquettes',
            'ti-tag',
            facets.labels.map(function (l) {
              return chip({
                label: l.name || '(sans nom)',
                dot: labelColor(l.color),
                count: l.count,
                active: c.labels.indexOf(l.id) !== -1,
                onClick: function () {
                  setCriteria(withGroup(c, 'labels', toggleIn(c.labels, l.id)));
                },
              });
            })
          )
        );
      }

      // Display switches
      var sw = el('section', 'gantt-pop-section gantt-switches');
      var cap = el('div', 'gantt-pop-caption');
      cap.appendChild(icon('ti-eye-off'));
      cap.appendChild(document.createTextNode('Masquer'));
      sw.appendChild(cap);
      [
        ['hideCompleted', 'Tâches terminées'],
        ['hideBlocked', 'Tâches bloquées'],
        ['hideUndated', 'Tâches sans date'],
      ].forEach(function (pair) {
        var lab = el('label', 'gantt-switch');
        var cb = el('input', '', { type: 'checkbox' });
        cb.checked = !!options[pair[0]];
        cb.addEventListener('change', function () {
          opts.setOption(pair[0], !!cb.checked);
          refresh();
        });
        lab.appendChild(cb);
        lab.appendChild(el('span', 'gantt-switch-track'));
        lab.appendChild(el('span', 'gantt-switch-text', { text: pair[1] }));
        sw.appendChild(lab);
      });
      bodyEl.appendChild(sw);

      updateFoot();
    }

    function updateFoot() {
      var counts = opts.getCounts();
      footCount.textContent = counts.shown + ' / ' + counts.total + ' tâche(s) affichée(s)';
    }

    var built = false;
    function ensureShell() {
      if (built) return;
      built = true;
      var pop = ui.pop;
      var head = el('div', 'gantt-pop-head');
      head.appendChild(icon('ti-filter'));
      head.appendChild(el('span', 'gantt-pop-title', { text: 'Filtrer les tâches' }));
      pop.appendChild(head);
      var searchWrap = el('div', 'gantt-search-wrap');
      searchWrap.appendChild(icon('ti-search'));
      searchWrap.appendChild(searchInput);
      pop.appendChild(searchWrap);
      pop.appendChild(bodyEl);
      var foot = el('div', 'gantt-pop-foot gantt-pop-foot--split');
      foot.appendChild(footCount);
      var reset = el('button', 'gantt-link-btn', { type: 'button' });
      reset.appendChild(icon('ti-restore'));
      reset.appendChild(document.createTextNode('Tout réinitialiser'));
      reset.addEventListener('click', function () {
        opts.onReset();
        searchInput.value = '';
        refresh();
      });
      foot.appendChild(reset);
      pop.appendChild(foot);
    }

    searchInput.addEventListener('input', function () {
      var next = model.normalizeCriteria(opts.getCriteria());
      next.query = searchInput.value;
      opts.setCriteria(next);
      refreshButton();
      updateFoot();
    });

    ensureShell();

    function refresh() {
      refreshButton();
      if (ui.isOpen()) buildBody();
      var q = opts.getCriteria().query || '';
      if (searchInput.value.trim() !== q) searchInput.value = q;
    }

    var origOpen = ui.button;
    origOpen.addEventListener('click', function () {
      if (ui.isOpen()) {
        setTimeout(function () {
          try {
            searchInput.focus();
          } catch (e) {
            /* ignore */
          }
        }, 0);
      }
    });

    refreshButton();
    return {
      wrap: ui.wrap,
      refresh: refresh,
      close: ui.close,
      searchInput: searchInput,
    };
  }

  // ── Summary strip ────────────────────────────────────────────────────

  /**
   * opts: { getKeys, getGroup, getCriteria, getFacets, getOptions, getCounts,
   *         onOpenSort(), onOpenFilter(), onCriteria(next), onOption(name,false), onReset() }
   */
  function createSummaryBar(opts) {
    var model = GM();
    var root = el('div', 'gantt-summary');

    function pill(item, onRemove) {
      var p = el('span', 'gantt-pill');
      p.appendChild(icon(item.icon));
      if (item.caption) p.appendChild(el('span', 'gantt-pill-caption', { text: item.caption }));
      p.appendChild(el('span', 'gantt-pill-text', { text: item.text }));
      var x = el('button', 'gantt-pill-x', { type: 'button' });
      x.title = 'Retirer ce filtre';
      x.setAttribute('aria-label', 'Retirer le filtre ' + (item.caption || item.text));
      x.appendChild(icon('ti-x'));
      x.addEventListener('click', onRemove);
      p.appendChild(x);
      return p;
    }

    function refresh() {
      root.textContent = '';
      var keys = opts.getKeys();
      var sortBtn = el('button', 'gantt-summary-sort', { type: 'button' });
      sortBtn.title = 'Modifier le tri';
      sortBtn.appendChild(icon('ti-arrows-sort'));
      keys.forEach(function (k, i) {
        if (i) sortBtn.appendChild(el('span', 'gantt-summary-sep', { text: '›' }));
        var lvl = el('span', 'gantt-summary-level');
        if (keys.length > 1) lvl.appendChild(el('span', 'gantt-summary-num', { text: String(i + 1) }));
        lvl.appendChild(document.createTextNode(sortFieldLabel(k.by)));
        lvl.appendChild(el('span', 'gantt-summary-dir', { text: k.dir === 'desc' ? '▼' : '▲' }));
        sortBtn.appendChild(lvl);
      });
      if (opts.getGroup()) {
        sortBtn.appendChild(el('span', 'gantt-summary-tag', { text: 'par statut' }));
      }
      sortBtn.addEventListener('click', opts.onOpenSort);
      root.appendChild(sortBtn);

      var criteria = model.normalizeCriteria(opts.getCriteria());
      var facets = opts.getFacets();
      var items = describeCriteria(criteria, facets);
      var options = opts.getOptions();
      var hides = [
        ['hideCompleted', 'Tâches terminées', 'ti-circle-check'],
        ['hideBlocked', 'Tâches bloquées', 'ti-lock'],
        ['hideUndated', 'Tâches sans date', 'ti-calendar-off'],
      ];

      var strip = el('div', 'gantt-summary-pills');
      items.forEach(function (item) {
        strip.appendChild(
          pill(item, function () {
            var next = model.normalizeCriteria(criteria);
            next[item.group] = item.group === 'query' ? '' : [];
            opts.onCriteria(next);
          })
        );
      });
      hides.forEach(function (h) {
        if (!options[h[0]]) return;
        strip.appendChild(
          pill({ icon: h[2], caption: 'Masqué', text: h[1] }, function () {
            opts.onOption(h[0], false);
          })
        );
      });
      root.appendChild(strip);

      var counts = opts.getCounts();
      var filtered = counts.shown !== counts.total;
      var count = el('button', 'gantt-summary-count' + (filtered ? ' is-filtered' : ''), {
        type: 'button',
      });
      count.title = 'Ouvrir les filtres';
      count.appendChild(icon('ti-list-details'));
      count.appendChild(
        document.createTextNode(
          filtered
            ? counts.shown + ' / ' + counts.total + ' tâches'
            : counts.total + (counts.total > 1 ? ' tâches' : ' tâche')
        )
      );
      count.addEventListener('click', opts.onOpenFilter);
      root.appendChild(count);

      if (items.length) {
        var clear = el('button', 'gantt-link-btn', { type: 'button' });
        clear.appendChild(icon('ti-restore'));
        clear.appendChild(document.createTextNode('Effacer'));
        clear.title = 'Effacer tous les filtres';
        clear.addEventListener('click', opts.onReset);
        root.appendChild(clear);
      }
    }

    refresh();
    return { root: root, refresh: refresh };
  }

  global.GanttFilters = {
    SORT_PRESETS: SORT_PRESETS,
    FILTER_PRESETS: FILTER_PRESETS,
    sortDirLabel: sortDirLabel,
    describeSort: describeSort,
    describeCriteria: describeCriteria,
    presetMatches: presetMatches,
    toggleIn: toggleIn,
    createPopover: createPopover,
    createSortPanel: createSortPanel,
    createFilterPanel: createFilterPanel,
    createSummaryBar: createSummaryBar,
  };
})(typeof window !== 'undefined' ? window : this);
