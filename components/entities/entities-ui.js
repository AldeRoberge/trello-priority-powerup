/*
 * Role: UI of the Entities view ("Entités"): define rich things once ("Monstera", "Hôtel de Ville"), give them
 * types, typed properties, links and a history, then find them by describing them ("mes plantes au travail").
 *  - left: a source list (search box that also understands a request, type filter pills, entities grouped by type,
 *    one "+" button that opens the composer)
 *  - right: the entity as a page (big editable name, type pills, aliases, then properties as grouped lists,
 *    links, and two collapsed rows: "Modèle et variantes", "Historique" with per-entry undo)
 *  - "Types et composants": the components (groups of typed fields) and types (bundles of components)
 * Data + writes: EntitiesTrello; pure logic (schema, mutations, history, query, text resolution): EntitiesModel.
 *
 * Contents
 *   1. helpers   2. mount: state + skeleton   (popovers and menus)   3. sidebar   4. entity editor
 *   5. schema editor   6. saving   7. boot
 */
(function (global) {
  'use strict';

  var EM = function () {
    return global.EntitiesModel;
  };
  var ET = function () {
    return global.EntitiesTrello;
  };
  var ES = function () {
    return global.EntitiesSystems;
  };
  var ESAI = function () {
    return global.EntitiesSystemsAI;
  };

  var SAVE_DELAY_MS = 700;
  var KIND_LABELS = {
    text: 'Texte',
    number: 'Nombre',
    date: 'Date',
    bool: 'Oui / non',
    choice: 'Choix',
    ref: 'Lien vers une entité',
    refs: 'Liens vers des entités',
    multi: 'Choix multiple',
    longtext: 'Texte long',
    level: 'Jauge (curseur)',
    geo: 'Coordonnées (lat, lon)',
    url: 'Lien web',
  };

  /* ── 1. Helpers ──────────────────────────────────────────────────── */

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function icon(name) {
    return h('i', { class: 'ti ti-' + name, 'aria-hidden': 'true' });
  }

  /** Lowercase, accent-free text for searching in pickers. */
  function fold(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function cap(s) {
    s = String(s || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** The tile of an entity takes the color of the nature of its first type (iOS system colors). */
  var NATURE_COLORS = {
    matter: '#ff9500',
    living: '#34c759',
    agent: '#0a84ff',
    place: '#30b0c7',
    event: '#af52de',
    social: '#5e5ce6',
    abstract: '#ff2d55',
  };
  var NEUTRAL_COLOR = '#8e8e93';

  var RELATIVE = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat('fr', { numeric: 'auto' }) : null;

  /** "à l’instant", "il y a 3 min", "hier", then a short date once it is older than a week. */
  function whenText(ts) {
    var d = ts ? new Date(ts) : null;
    if (!d || isNaN(d.getTime())) return '';
    var diff = (Date.now() - d.getTime()) / 1000;
    if (RELATIVE && diff >= 0 && diff < 7 * 86400) {
      if (diff < 60) return 'à l’instant';
      if (diff < 3600) return RELATIVE.format(-Math.round(diff / 60), 'minute');
      if (diff < 86400) return RELATIVE.format(-Math.round(diff / 3600), 'hour');
      return RELATIVE.format(-Math.round(diff / 86400), 'day');
    }
    return d.toLocaleDateString('fr-CA', { dateStyle: 'medium' });
  }

  function splitList(s) {
    return String(s || '')
      .split(',')
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
  }

  function reasonText(err) {
    var r = (err && (err.reason || err.message)) || '';
    if (r === 'not-authorized' || r === 'no-token' || r === 'auth-failed') return 'Autorisez Trello pour enregistrer vos entités.';
    if (r === 'http-401' || r === 'http-403') return 'L’autorisation Trello a expiré ou ne couvre pas ce tableau.';
    if (r === 'too-long') return 'Cette entité dépasse la taille maximale d’une description Trello.';
    if (r === 'no-list') return 'Le tableau n’a aucune liste : créez-en une pour pouvoir enregistrer des entités.';
    if (r === 'conflict') return 'Modifié ailleurs entre-temps : rechargez pour voir la dernière version.';
    return 'Échec : ' + (r || 'erreur inconnue');
  }

  function isAuthReason(err) {
    var r = err && (err.reason || err.message);
    return r === 'not-authorized' || r === 'no-token' || r === 'auth-failed' || r === 'http-401';
  }

  /* ── 2. Mount: state + skeleton ──────────────────────────────────── */

  function mount(root, t) {
    var state = {
      data: null,
      schema: EM().defaultSchema(),
      entities: [],
      selId: null,
      mode: 'entity', // 'entity' | 'schema'
      query: '',
      typeFilter: '',
      authOk: false,
      loaded: false,
      saveState: 'idle',
      saveMsg: '',
      confirm: '', // id of the thing waiting for a second click (delete)
      openHistory: false, // the "Historique" row is expanded
      openModel: undefined, // "Modèle et variantes": undefined = open only when the entity has a model or variants
      linkOpen: false, // the inline "add a link" form is showing
      refocus: '', // selector to focus after the next paintMain
      folds: {}, // schema editor: which type/component cards are expanded
      handled: {}, // finding ids whose card was created (hidden for this session)
      draftRule: null, // a rule the AI wrote, waiting for the user's yes
      proposals: [], // value changes the AI deduced from a sentence, waiting for the user's yes
      ai: false, // a model is configured
    };
    var saveTimer = null;
    var saving = false;
    var dirty = false;

    root.textContent = '';
    root.classList.add('en-root');
    var els = {
      banner: h('div', { class: 'en-banner', hidden: true }),
      side: h('aside', { class: 'en-side' }),
      main: h('main', { class: 'en-main' }),
      toast: h('div', { class: 'en-toast', hidden: true, role: 'status' }),
      status: h('span', { class: 'en-status' }),
    };
    root.appendChild(els.banner);
    root.appendChild(h('div', { class: 'en-body' }, [els.side, els.main]));
    root.appendChild(els.toast);

    var toastTimer = null;
    function toast(msg, kind) {
      els.toast.textContent = msg;
      els.toast.className = 'en-toast' + (kind ? ' en-toast--' + kind : '');
      els.toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        els.toast.hidden = true;
      }, 5000);
    }

    function failure(err) {
      if (isAuthReason(err)) {
        state.authOk = false;
        paintBanner();
      }
      toast(reasonText(err), 'error');
    }

    function selected() {
      return EM().findById(state.entities, state.selId);
    }

    function typeName(id) {
      var ty = EM().findById(state.schema.types, id);
      return ty ? ty.name : id;
    }

    function paintBanner() {
      els.banner.textContent = '';
      els.banner.hidden = state.authOk;
      if (state.authOk) return;
      els.banner.appendChild(icon('lock'));
      els.banner.appendChild(h('span', { text: 'Trello doit être autorisé pour lire et enregistrer les entités.' }));
      els.banner.appendChild(
        h(
          'button',
          {
            class: 'en-btn en-btn--primary',
            onclick: function () {
              ET().authorize(t).then(
                function () {
                  state.authOk = true;
                  paintBanner();
                  boot();
                },
                function (err) {
                  toast(reasonText(err), 'error');
                }
              );
            },
          },
          [icon('key'), 'Autoriser Trello']
        )
      );
    }

    /* ── Popovers and menus ─────────────────────────────────────── */

    var pop = null;

    function closePop(refocus) {
      if (!pop) return;
      var p = pop;
      pop = null;
      document.removeEventListener('mousedown', p.onDown, true);
      document.removeEventListener('keydown', p.onKey, true);
      global.removeEventListener('resize', p.onClose);
      els.main.removeEventListener('scroll', p.onClose);
      listBox.removeEventListener('scroll', p.onClose);
      if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
      p.anchor.setAttribute('aria-expanded', 'false');
      if (refocus && document.body.contains(p.anchor)) p.anchor.focus();
    }

    /** Floating panel under `anchor` (a menu or a picker); `build(el, close)` fills it. Click the anchor again, press Escape or click away to close. */
    function openPop(anchor, build, opts) {
      opts = opts || {};
      var toggling = pop && pop.anchor === anchor;
      closePop();
      if (toggling) return;
      var el = h('div', { class: 'en-pop' + (opts.className ? ' ' + opts.className : ''), role: opts.role || 'menu' });
      build(el, function (refocus) {
        closePop(refocus);
      });
      root.appendChild(el);
      var a = anchor.getBoundingClientRect();
      var r = el.getBoundingClientRect();
      var vw = document.documentElement.clientWidth;
      var vh = document.documentElement.clientHeight;
      var left = opts.align === 'end' ? a.right - r.width : a.left;
      left = Math.max(8, Math.min(left, vw - r.width - 8));
      var top = a.bottom + 6;
      if (top + r.height > vh - 8 && a.top - r.height - 6 > 8) top = a.top - r.height - 6;
      el.style.left = left + 'px';
      el.style.top = Math.max(8, top) + 'px';
      anchor.setAttribute('aria-expanded', 'true');
      var p = {
        el: el,
        anchor: anchor,
        onClose: function () {
          closePop();
        },
        onDown: function (ev) {
          if (!el.contains(ev.target) && !anchor.contains(ev.target)) closePop();
        },
        onKey: function (ev) {
          if (ev.key === 'Escape') {
            ev.preventDefault();
            ev.stopPropagation();
            closePop(true);
            return;
          }
          if (ev.key === 'Tab') {
            closePop();
            return;
          }
          if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
          var items = Array.prototype.slice.call(el.querySelectorAll('.en-menu-item:not([disabled]), .en-pop-search'));
          if (!items.length) return;
          ev.preventDefault();
          var i = items.indexOf(document.activeElement);
          i = ev.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
          items[i].focus();
        },
      };
      pop = p;
      document.addEventListener('mousedown', p.onDown, true);
      document.addEventListener('keydown', p.onKey, true);
      global.addEventListener('resize', p.onClose);
      els.main.addEventListener('scroll', p.onClose);
      listBox.addEventListener('scroll', p.onClose);
      var first = el.querySelector('.en-pop-search') || el.querySelector('.en-menu-item');
      if (first) first.focus();
    }

    /** A row of a menu. `fn` runs after the menu closes (unless opts.keepOpen). */
    function menuItem(ic, label, sub, fn, opts) {
      opts = opts || {};
      return h(
        'button',
        {
          class: 'en-menu-item' + (opts.danger ? ' is-danger' : ''),
          type: 'button',
          role: 'menuitem',
          onclick: function (ev) {
            if (!opts.keepOpen) closePop();
            fn(ev);
          },
        },
        [
          icon(ic),
          h('span', { class: 'en-menu-text' }, [h('span', { class: 'en-menu-label', text: label }), sub ? h('span', { class: 'en-menu-sub', text: sub }) : null]),
          opts.check ? h('span', { class: 'en-menu-check' }, [icon('check')]) : null,
        ]
      );
    }

    /* ── 3. Sidebar ─────────────────────────────────────────────── */

    var listBox = h('div', { class: 'en-list' });
    var chipBox = h('div', { class: 'en-chips' });
    var typeBar = h('div', { class: 'en-filters', role: 'group', 'aria-label': 'Filtrer par type', hidden: true });
    var clearBtn = h(
      'button',
      {
        class: 'en-search-clear',
        type: 'button',
        hidden: true,
        'aria-label': 'Effacer la recherche',
        onclick: function () {
          setQuery('');
          queryInput.focus();
        },
      },
      [icon('x')]
    );
    var queryInput = h('input', {
      class: 'en-search-input',
      type: 'search',
      placeholder: 'Rechercher ou décrire…',
      title: 'Cherchez un nom, ou décrivez ce que vous voulez : « mes plantes au travail »',
      'aria-label': 'Filtrer les entités',
      autocomplete: 'off',
      oninput: function () {
        setQuery(queryInput.value, true);
      },
      onkeydown: function (ev) {
        if (ev.key === 'Escape' && queryInput.value) {
          ev.stopPropagation();
          setQuery('');
        } else if (ev.key === 'ArrowDown') {
          var first = listBox.querySelector('.en-row');
          if (first) {
            ev.preventDefault();
            first.focus();
          }
        }
      },
    });

    function setQuery(v, fromInput) {
      state.query = v;
      if (!fromInput) queryInput.value = v;
      clearBtn.hidden = !v;
      paintList();
    }

    listBox.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      var rows = Array.prototype.slice.call(listBox.querySelectorAll('.en-row'));
      var i = rows.indexOf(document.activeElement);
      if (i < 0) return;
      ev.preventDefault();
      if (ev.key === 'ArrowUp' && i === 0) return queryInput.focus();
      var next = rows[ev.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : i - 1];
      if (next) next.focus();
    });

    function visibleEntities() {
      var q = state.query.trim();
      var list = state.entities;
      var info = null;
      if (q) {
        info = EM().resolveText(state.schema, state.entities, q);
        if (info.recognized) list = info.entities;
        else list = EM().query(state.schema, state.entities, { text: q });
      }
      if (state.typeFilter) {
        list = list.filter(function (e) {
          return EM().isA(state.schema, e, state.typeFilter);
        });
      }
      return { list: list, info: info && info.recognized ? info : null };
    }

    /** What an entity looks like in lists: the icon of its first type, tinted by the nature of that type. */
    function entityVisual(e) {
      var first = e && e.types && e.types.length ? EM().findById(state.schema.types, e.types[0]) : null;
      var nature = first ? EM().natureOfType(state.schema, first.id) : '';
      var nat = EM().natureById(nature);
      return {
        icon: (first && first.icon) || (nat && nat.icon) || (first ? 'tag' : 'circle-dashed'),
        color: NATURE_COLORS[nature] || NEUTRAL_COLOR,
      };
    }

    function tile(e, size) {
      var v = entityVisual(e);
      return h('span', { class: 'en-tile en-tile--' + size, style: '--tile:' + v.color, 'aria-hidden': 'true' }, [icon(v.icon)]);
    }

    /** Type filter pills: only types that have entities, the busiest first, the rest behind "Plus". */
    function fillTypes() {
      typeBar.textContent = '';
      var counts = {};
      state.entities.forEach(function (e) {
        EM()
          .typeClosure(state.schema, e.types)
          .forEach(function (id) {
            counts[id] = (counts[id] || 0) + 1;
          });
      });
      var used = state.schema.types
        .filter(function (ty) {
          return counts[ty.id] > 0 || ty.id === state.typeFilter;
        })
        .sort(function (a, b) {
          return (counts[b.id] || 0) - (counts[a.id] || 0) || a.name.localeCompare(b.name, 'fr');
        });
      typeBar.hidden = used.length < 2 && !state.typeFilter;
      if (typeBar.hidden) return;
      var MAX = 4;
      var shown = used.slice(0, MAX);
      var active = used.filter(function (ty) {
        return ty.id === state.typeFilter;
      })[0];
      if (active && shown.indexOf(active) < 0) shown[MAX - 1] = active;
      function pill(label, id, count) {
        var on = state.typeFilter === id;
        return h(
          'button',
          {
            class: 'en-pill' + (on ? ' is-on' : ''),
            type: 'button',
            'aria-pressed': String(on),
            onclick: function () {
              state.typeFilter = on ? '' : id;
              paintList();
            },
          },
          [label, count != null ? h('span', { class: 'en-pill-n', text: String(count) }) : null]
        );
      }
      typeBar.appendChild(pill('Tout', '', null));
      shown.forEach(function (ty) {
        typeBar.appendChild(pill(ty.name, ty.id, counts[ty.id] || 0));
      });
      var rest = used.filter(function (ty) {
        return shown.indexOf(ty) < 0;
      });
      if (rest.length) {
        typeBar.appendChild(
          h(
            'button',
            {
              class: 'en-pill en-pill--more',
              type: 'button',
              'aria-haspopup': 'menu',
              'aria-expanded': 'false',
              onclick: function (ev) {
                openPop(ev.currentTarget, function (el) {
                  rest.forEach(function (ty) {
                    el.appendChild(
                      menuItem(ty.icon || 'tag', ty.name, counts[ty.id] + (counts[ty.id] > 1 ? ' entités' : ' entité'), function () {
                        state.typeFilter = ty.id;
                        paintList();
                      })
                    );
                  });
                });
              },
            },
            ['Plus', icon('chevron-down')]
          )
        );
      }
    }

    function paintList(opts) {
      fillTypes();
      paintWatch();
      schemaLink.classList.toggle('is-on', state.mode === 'schema');
      var vis = visibleEntities();
      chipBox.textContent = '';
      if (vis.info) {
        vis.info.mentions.forEach(function (m) {
          var label = m.kind === 'type' ? 'Type : ' + m.name : m.kind === 'entity' ? m.name : 'Valeur : ' + m.name;
          chipBox.appendChild(h('span', { class: 'en-chip en-chip--' + m.kind, text: label }));
        });
      }
      listBox.textContent = '';
      if (!state.loaded) {
        listBox.appendChild(h('p', { class: 'en-list-hint', text: 'Chargement…' }));
        return;
      }
      if (!state.entities.length) {
        listBox.appendChild(h('p', { class: 'en-list-hint', text: 'Aucune entité pour l’instant.' }));
        return;
      }
      if (!vis.list.length) {
        listBox.appendChild(h('p', { class: 'en-list-hint', text: 'Aucune entité ne correspond.' }));
        return;
      }
      var groups = {};
      var order = [];
      vis.list.forEach(function (e) {
        var key = e.types[0] || '';
        if (!groups[key]) {
          groups[key] = [];
          order.push(key);
        }
        groups[key].push(e);
      });
      order.sort(function (a, b) {
        if (!a || !b) return a ? -1 : 1; // "Sans type" last
        return typeName(a).localeCompare(typeName(b), 'fr', { sensitivity: 'base' });
      });
      order.forEach(function (key) {
        listBox.appendChild(h('div', { class: 'en-group' }, [h('span', { text: key ? typeName(key) : 'Sans type' }), h('span', { class: 'en-group-n', text: String(groups[key].length) })]));
        groups[key]
          .slice()
          .sort(function (a, b) {
            return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
          })
          .forEach(function (e) {
            var on = e.id === state.selId && state.mode === 'entity';
            var sub = rowSummary(e);
            listBox.appendChild(
              h(
                'button',
                {
                  class: 'en-row' + (on ? ' is-on' : ''),
                  type: 'button',
                  'data-id': e.id,
                  'aria-current': on ? 'true' : null,
                  onclick: function (ev) {
                    openEntity(e.id, { focus: ev.detail === 0 });
                  },
                },
                [tile(e, 'sm'), h('span', { class: 'en-row-text' }, [h('span', { class: 'en-row-name', text: e.name }), sub ? h('span', { class: 'en-row-sub', text: sub }) : null])]
              )
            );
          });
      });
      var sel = listBox.querySelector('.en-row.is-on');
      if (sel && opts && opts.reveal) sel.scrollIntoView({ block: 'nearest' });
      if (sel && opts && opts.focus) sel.focus();
    }

    function rowSummary(e) {
      var parts = [];
      var data = EM().effectiveData(state.entities, e, state.schema);
      Object.keys(data).forEach(function (cid) {
        Object.keys(data[cid]).forEach(function (key) {
          var f = EM().fieldOf(state.schema, cid + '.' + key);
          if (f && f.field.kind === 'ref') parts.push(EM().formatValue(f.field, data[cid][key], state.entities));
        });
      });
      var base = e.base ? EM().findById(state.entities, e.base) : null;
      if (base) parts.unshift('variante de ' + base.name);
      return parts.join(' · ');
    }

    var schemaLink = h(
      'button',
      {
        class: 'en-side-link',
        type: 'button',
        onclick: function () {
          state.mode = 'schema';
          paintList();
          paintMain();
        },
      },
      [icon('adjustments'), 'Types et composants']
    );

    /* Systems: what the rules of the schema notice about the entities, and the AI "what changed" input. */
    var watchBox = h('div', { class: 'en-watch' });
    var observeBox = h('div', { class: 'en-observe', hidden: true });

    function findings() {
      if (!ES() || !(state.schema.systems || []).length) return [];
      return ES()
        .evaluate(state.schema, state.entities)
        .filter(function (f) {
          return !state.handled[f.id];
        });
    }

    var LEVEL_ICON = { alert: 'alert-circle', warn: 'alert-triangle', info: 'info-circle' };

    function paintWatch() {
      var list = findings();
      watchBox.textContent = '';
      watchBox.hidden = !list.length;
      if (!list.length) return;
      var box = h('details', { class: 'en-watch-box' }, [h('summary', { class: 'en-watch-sum' }, [icon('eye'), list.length + ' à surveiller', icon('chevron-right')])]);
      if (state.watchOpen) box.setAttribute('open', '');
      box.addEventListener('toggle', function () {
        state.watchOpen = box.open;
      });
      list.forEach(function (f) {
        box.appendChild(
          h('button', { class: 'en-watch-row en-watch-row--' + f.level, type: 'button', onclick: function () { openEntity(f.entityId); } }, [icon(LEVEL_ICON[f.level] || 'info-circle'), h('span', { text: f.text })])
        );
      });
      watchBox.appendChild(box);
    }

    function createFindingCard(f) {
      ET()
        .createBoardCard(t, f.card, 'Proposée par la règle « ' + f.systemName + ' » pour ' + f.entityName + '.')
        .then(
          function () {
            state.handled[f.id] = true;
            toast('Carte créée : ' + f.card);
            paintList();
            paintMain();
          },
          failure
        );
    }

    function paintObserve() {
      observeBox.textContent = '';
      observeBox.hidden = !state.ai || !ESAI();
      if (observeBox.hidden) return;
      var input = h('input', { class: 'en-input en-observe-input', placeholder: 'Dire ce qui a changé…', 'aria-label': 'Dire ce qui a changé' });
      input.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' || !input.value.trim()) return;
        var text = input.value;
        input.disabled = true;
        ESAI()
          .observe(t, state.schema, state.entities, text)
          .then(function (r) {
            input.disabled = false;
            if (r.error) return toast(r.error === 'no-ai' ? 'Aucun modèle configuré.' : 'Je n’ai pas pu analyser la phrase.', 'error');
            if (!r.changes.length) return toast('Rien à changer pour les entités nommées.');
            state.proposals = r.changes;
            input.value = '';
            paintObserve();
          });
      });
      observeBox.appendChild(h('div', { class: 'en-search' }, [icon('sparkles'), input]));
      state.proposals.forEach(function (c) {
        function done() {
          state.proposals = state.proposals.filter(function (x) {
            return x !== c;
          });
          paintObserve();
        }
        observeBox.appendChild(
          h('div', { class: 'en-proposal' }, [
            h('span', { class: 'en-proposal-text', text: c.entityName + ' · ' + c.label + ' : ' + (c.from === undefined ? '' : EM().formatValue(EM().fieldOf(state.schema, c.path).field, c.from, state.entities) + ' → ') + c.display }),
            h('button', {
              class: 'en-icon-btn',
              type: 'button',
              title: 'Appliquer',
              'aria-label': 'Appliquer',
              onclick: function () {
                state.entities = state.entities.map(function (e) {
                  return e.id === c.entityId ? EM().setValue(state.schema, e, c.path, c.value) : e;
                });
                scheduleSave();
                done();
                paintList();
                paintMain();
              },
            }, [icon('check')]),
            h('button', { class: 'en-icon-btn', type: 'button', title: 'Ignorer', 'aria-label': 'Ignorer', onclick: done }, [icon('x')]),
          ])
        );
      });
    }

    function buildSide() {
      var newBtn = h(
        'button',
        {
          class: 'en-icon-btn en-icon-btn--accent',
          type: 'button',
          title: 'Nouvelle entité',
          'aria-label': 'Nouvelle entité',
          onclick: function () {
            openComposer();
          },
        },
        [icon('plus')]
      );
      els.side.appendChild(
        h('div', { class: 'en-side-head' }, [
          h('div', { class: 'en-title' }, [h('h1', { class: 'en-title-text', text: 'Entités' }), els.status, newBtn]),
          h('div', { class: 'en-search' }, [icon('search'), queryInput, clearBtn]),
          typeBar,
          chipBox,
        ])
      );
      els.side.appendChild(watchBox);
      els.side.appendChild(listBox);
      els.side.appendChild(h('div', { class: 'en-side-foot' }, [observeBox, schemaLink]));
      bindMenus();
    }

    /** Opens the guided interview; what it creates (and any new type) is saved like any other edit. */
    function openComposer(opts) {
      if (!global.EntitiesComposerUI) return newEntity();
      var Composer = global.EntitiesInterviewUI && global.EntitiesInterview ? global.EntitiesInterviewUI : global.EntitiesComposerUI;
      Composer.open({
        t: t,
        schema: state.schema,
        entities: state.entities,
        initialText: opts && opts.text,
        initialTypes: (opts && opts.types) || (state.typeFilter ? [state.typeFilter] : []),
        onDone: function (res) {
          state.schema = res.schema;
          state.entities = res.entities;
          state.selId = res.rootId;
          state.mode = 'entity';
          setQuery('');
          scheduleSave();
          paintList({ reveal: true });
          paintMain();
          toast(res.created.length > 1 ? res.created.length + ' entités créées et liées.' : 'Entité créée.');
          if (res.again) openComposer({ types: res.types });
        },
      });
    }

    function newEntity() {
      state.mode = 'entity';
      var name = 'Nouvelle entité';
      var n = 1;
      while (
        state.entities.some(function (e) {
          return e.name === name;
        })
      ) {
        n += 1;
        name = 'Nouvelle entité ' + n;
      }
      var types = state.typeFilter ? [state.typeFilter] : [];
      var e = EM().createEntity(state.schema, { name: name, types: types });
      state.entities = state.entities.concat([e]);
      state.selId = e.id;
      scheduleSave();
      paintList({ reveal: true });
      paintMain();
      var input = els.main.querySelector('.en-name');
      if (input) {
        input.focus();
        input.select();
      }
    }

    /* ── 4. Entity editor ───────────────────────────────────────── */

    function applyEntity(fn, opts) {
      var cur = selected();
      if (!cur) return;
      var next;
      try {
        next = fn(cur);
      } catch (err) {
        toast('Modification refusée : ' + (err && err.message), 'error');
        return;
      }
      if (!next || next === cur) return;
      state.entities = state.entities.map(function (e) {
        return e.id === cur.id ? next : e;
      });
      scheduleSave();
      paintList();
      if (opts && opts.rebuild) paintMain();
      else paintHistory();
    }

    var COLLAPSE_KEY = 'tp-entities-collapsed-sections';
    var collapsedSections = (function () {
      try {
        return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}') || {};
      } catch (err) {
        return {};
      }
    })();

    /** Entity page section; the title toggles it open/closed (remembered per title). */
    var SECTION_ICONS = {
      propriete: 'key', adresse: 'map-pin', matiere: 'flask', provenance: 'world', acquisition: 'shopping-cart', location: 'map-pin',
      produit: 'package', contenant: 'box', identification: 'id', condition: 'heart-rate-monitor', vivant: 'leaf', personne: 'user',
      emploi: 'briefcase', organisation: 'building', geographie: 'map', pays: 'flag', construction: 'building', espace: 'ruler-measure',
      temps: 'clock', concept: 'bulb', regle: 'gavel', names: 'tag', contexte: 'sitemap', liens: 'link',
    };
    function sectionIcon(id) {
      return SECTION_ICONS[id] || 'category';
    }

    function section(title, body, aside, cls, iconName) {
      var box = h('section', { class: 'en-sec' + (cls ? ' ' + cls : '') + (collapsedSections[title] ? ' is-collapsed' : '') });
      var toggle = h('button', { class: 'en-sec-toggle', type: 'button', 'aria-expanded': String(!collapsedSections[title]) }, [
        icon('chevron-right'),
        iconName ? h('span', { class: 'en-sec-ico' }, [icon(iconName)]) : null,
        h('h3', { class: 'en-sec-title', text: title }),
      ]);
      toggle.addEventListener('click', function () {
        var collapsed = !box.classList.contains('is-collapsed');
        box.classList.toggle('is-collapsed', collapsed);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        if (collapsed) collapsedSections[title] = true;
        else delete collapsedSections[title];
        try {
          localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsedSections));
        } catch (err) {}
      });
      box.appendChild(h('header', { class: 'en-sec-head' }, [toggle, aside || null]));
      box.appendChild(body);
      return box;
    }

    /** Collapsible block ("Historique", "Modèle et variantes"): a quiet row until opened. */
    function disclosure(title, meta, open, onToggle) {
      return h('button', { class: 'en-disc' + (open ? ' is-open' : ''), type: 'button', 'aria-expanded': String(open), onclick: onToggle }, [
        h('span', { class: 'en-disc-title', text: title }),
        meta ? h('span', { class: 'en-disc-meta', text: meta }) : null,
        icon('chevron-right'),
      ]);
    }

    var historyBox = h('section', { class: 'en-sec en-sec--disc' });

    function paintHistory() {
      historyBox.textContent = '';
      var e = selected();
      if (!e) return;
      var list = e.history.slice().reverse();
      var open = !!state.openHistory;
      historyBox.appendChild(
        disclosure('Historique', list.length + (list.length > 1 ? ' changements' : ' changement'), open, function () {
          state.openHistory = !state.openHistory;
          paintHistory();
        })
      );
      if (!open) return;
      var set = h('div', { class: 'en-set' });
      list.forEach(function (entry) {
        var revertable = EM().isRevertable(entry);
        set.appendChild(
          h('div', { class: 'en-hist-row' + (entry.undoOf ? ' is-undo' : '') }, [
            h('span', { class: 'en-hist-when', title: entry.ts ? new Date(entry.ts).toLocaleString('fr-CA') : '', text: whenText(entry.ts) }),
            h('span', { class: 'en-hist-text', text: EM().describeEntry(state.schema, state.entities, entry) }),
            revertable
              ? h(
                  'button',
                  {
                    class: 'en-link',
                    type: 'button',
                    title: 'Annuler ce changement',
                    onclick: function () {
                      applyEntity(
                        function (cur) {
                          return EM().revertEntry(state.schema, cur, entry.id);
                        },
                        { rebuild: true }
                      );
                    },
                  },
                  [icon('arrow-back-up'), 'Annuler']
                )
              : null,
          ])
        );
      });
      historyBox.appendChild(set);
    }

    function fieldInput(e, comp, field) {
      var path = comp.id + '.' + field.key;
      var val = EM().effectiveValue(state.entities, e, path, state.schema);
      function commit(v, rebuild) {
        applyEntity(
          function (cur) {
            return EM().setValue(state.schema, cur, path, v);
          },
          { rebuild: !!rebuild || !!e.base || hasDefaults(e) }
        );
      }
      function selectWrap(sel) {
        return h('span', { class: 'en-select' }, [sel]);
      }
      var aria = comp.name + ' : ' + field.label;
      if (field.kind === 'bool') {
        return h('input', {
          type: 'checkbox',
          class: 'en-switch',
          role: 'switch',
          'aria-label': aria,
          checked: val ? true : null,
          onchange: function (ev) {
            commit(ev.target.checked ? true : '');
          },
        });
      }
      if (field.kind === 'choice') {
        var sel = h('select', { class: 'en-ctl', 'aria-label': aria, onchange: function () { commit(sel.value); } });
        sel.appendChild(h('option', { value: '', text: '—' }));
        (field.options || []).forEach(function (o) {
          sel.appendChild(h('option', { value: o, text: o }));
        });
        sel.value = val || '';
        return selectWrap(sel);
      }
      if (field.kind === 'ref' || field.kind === 'refs') {
        var pool = state.entities
          .filter(function (x) {
            if (x.id === e.id) return false;
            if (!field.refTypes || !field.refTypes.length) return true;
            return field.refTypes.some(function (ty) {
              return EM().isA(state.schema, x, ty);
            });
          })
          .sort(function (a, b) {
            return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
          });
        if (field.kind === 'ref') {
          var rs = h('select', { class: 'en-ctl', 'aria-label': aria, onchange: function () { commit(rs.value); } });
          rs.appendChild(h('option', { value: '', text: '—' }));
          pool.forEach(function (x) {
            rs.appendChild(h('option', { value: x.id, text: x.name }));
          });
          rs.value = val || '';
          return selectWrap(rs);
        }
        var cur = Array.isArray(val) ? val.slice() : [];
        var wrap = h('div', { class: 'en-refs' });
        cur.forEach(function (id) {
          var o = EM().findById(state.entities, id);
          wrap.appendChild(
            h('span', { class: 'en-token' }, [
              o ? o.name : '?',
              h(
                'button',
                {
                  class: 'en-token-x',
                  type: 'button',
                  'aria-label': 'Retirer ' + (o ? o.name : 'ce lien'),
                  onclick: function () {
                    commit(
                      cur.filter(function (x) {
                        return x !== id;
                      }),
                      true
                    );
                  },
                },
                [icon('x')]
              ),
            ])
          );
        });
        var rest = pool.filter(function (x) {
          return cur.indexOf(x.id) < 0;
        });
        if (rest.length) {
          var add = h('select', {
            class: 'en-ctl en-ctl--add',
            'aria-label': aria + ' : ajouter',
            onchange: function () {
              if (add.value) commit(cur.concat([add.value]), true);
            },
          });
          add.appendChild(h('option', { value: '', text: cur.length ? '+ Ajouter' : '+ Ajouter…' }));
          rest.forEach(function (x) {
            add.appendChild(h('option', { value: x.id, text: x.name }));
          });
          wrap.appendChild(add);
        }
        return wrap;
      }
      if (field.kind === 'multi') {
        var box = h('div', { class: 'en-pills' });
        (field.options || []).forEach(function (o) {
          var on = (val || []).indexOf(o) >= 0;
          box.appendChild(
            h(
              'button',
              {
                class: 'en-pill' + (on ? ' is-on' : ''),
                type: 'button',
                'aria-pressed': String(on),
                onclick: function () {
                  var now = (EM().effectiveValue(state.entities, selected() || e, path, state.schema) || []).filter(function (x) {
                    return x !== o;
                  });
                  if (!on) now.push(o);
                  commit(now, true);
                },
              },
              [o]
            )
          );
        });
        return box;
      }
      if (field.kind === 'longtext') {
        var ta = h('textarea', { class: 'en-ctl en-area', rows: '3', maxlength: '1500', placeholder: 'Ajouter…', 'aria-label': aria, onchange: function () { commit(ta.value); } });
        ta.value = val == null ? '' : String(val);
        return ta;
      }
      if (field.kind === 'level' && global.EntitiesLevelUI) {
        // a gauge: a slider between 0 and the capacity (how full, how charged)
        return global.EntitiesLevelUI.create({
          field: field,
          label: aria,
          value: val,
          bounds: EM().levelBounds(field, function (k) {
            return EM().effectiveValue(state.entities, e, comp.id + '.' + k, state.schema);
          }),
          onChange: function (v) { commit(v); },
        });
      }
      var type = field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : field.kind === 'url' ? 'url' : 'text';
      var inp = h('input', {
        class: 'en-ctl' + (val == null || val === '' ? ' is-empty' : ''),
        type: type,
        step: field.kind === 'number' ? 'any' : null,
        placeholder: field.kind === 'geo' ? '45.5017, -73.5673' : field.kind === 'url' ? 'https://…' : field.kind === 'date' ? null : 'Ajouter…',
        'aria-label': aria + (field.unit ? ' (' + field.unit + ')' : ''),
        value: val == null ? '' : String(val),
        onchange: function () {
          // the maximum of a gauge of this component (the capacity) changes the slider's scale
          commit(inp.value, comp.fields.some(function (f2) { return f2.kind === 'level' && f2.maxField === field.key; }));
        },
      });
      if (field.kind === 'url' && val) {
        return h('div', { class: 'en-unit' }, [
          inp,
          h('a', { class: 'en-iconlink', href: String(val), target: '_blank', rel: 'noopener noreferrer', title: 'Ouvrir le lien', 'aria-label': 'Ouvrir le lien' }, [icon('arrow-up-right')]),
        ]);
      }
      return field.unit ? h('div', { class: 'en-unit' }, [inp, h('span', { class: 'en-unit-sfx', text: field.unit })]) : inp;
    }

    /** Do this entity's archetypes give any default value? (then editing a field changes its provenance badge) */
    function hasDefaults(e) {
      return Object.keys(EM().archetypeDefaults(state.schema, e.types)).length > 0;
    }

    /** Where a field's value comes from: the type's default, the model it follows, or this entity (resettable). */
    function fieldMeta(e, comp, f) {
      var path = comp.id + '.' + f.key;
      var meta = h('span', { class: 'en-prop-meta' });
      var origin = EM().originOf(state.entities, e, path, state.schema);
      var base = e.base ? EM().findById(state.entities, e.base) : null;
      var archDefault = EM().archetypeDefaults(state.schema, e.types);
      var hasArch = !!(archDefault[comp.id] && archDefault[comp.id][f.key] !== undefined);
      function resetButton(title) {
        return h(
          'button',
          {
            class: 'en-reset',
            type: 'button',
            title: title,
            'aria-label': 'Réinitialiser : ' + title,
            onclick: function () {
              applyEntity(
                function (cur) {
                  return EM().setValue(state.schema, cur, path, undefined);
                },
                { rebuild: true }
              );
            },
          },
          [icon('arrow-back-up')]
        );
      }
      if (origin === 'archetype') {
        meta.appendChild(h('span', { class: 'en-prov', title: 'Valeur par défaut du type : la modifier ici crée une valeur propre à cette entité' }, [icon('sparkles'), 'par défaut']));
        return meta;
      }
      if (!base) {
        if (origin === 'own' && hasArch) meta.appendChild(resetButton('Revenir à la valeur par défaut du type'));
        return meta;
      }
      if (origin && origin !== 'own') {
        var from = (EM().findById(state.entities, origin) || { name: '?' }).name;
        meta.appendChild(h('span', { class: 'en-prov', title: 'Hérité de « ' + from + ' » : la modifier ici crée une valeur propre' }, [icon('git-fork'), 'hérité']));
      } else if (origin === 'own' && EM().effectiveValue(state.entities, base, path) !== undefined) {
        meta.appendChild(resetButton('Revenir à la valeur du modèle'));
      }
      return meta;
    }

    var fieldUid = 0;

    function propRow(e, comp, f) {
      var control = fieldInput(e, comp, f);
      var label = h('label', { class: 'en-prop-label', text: f.label });
      var focusable = control.matches('input,select,textarea') ? control : control.querySelector('input,select,textarea');
      if (focusable) {
        fieldUid += 1;
        focusable.id = 'en-f' + fieldUid;
        label.setAttribute('for', focusable.id);
      }
      var stack = f.kind === 'longtext' || f.kind === 'multi' || f.kind === 'refs';
      return h('div', { class: 'en-prop' + (stack ? ' en-prop--stack' : '') + (f.kind === 'bool' ? ' en-prop--switch' : '') }, [label, h('div', { class: 'en-prop-value' }, [control]), fieldMeta(e, comp, f)]);
    }

    function cloneSelected(detach) {
      var cur = selected();
      if (!cur) return;
      var copy;
      try {
        copy = EM().cloneEntity(state.schema, state.entities, cur.id, { detach: detach });
      } catch (err) {
        toast('Copie refusée : ' + (err && err.message), 'error');
        return;
      }
      state.entities = state.entities.concat([copy]);
      state.selId = copy.id;
      scheduleSave();
      paintList({ reveal: true });
      paintMain();
      var input = els.main.querySelector('.en-name');
      if (input) {
        input.focus();
        input.select();
      }
    }

    function openEntity(id, opts) {
      state.selId = id;
      state.mode = 'entity';
      state.confirm = '';
      state.linkOpen = false;
      paintList({ reveal: true, focus: opts && opts.focus });
      paintMain();
    }

    /** A small clickable reference to another entity. */
    function entityChip(other) {
      return h('button', { class: 'en-ref', type: 'button', onclick: function () { openEntity(other.id); } }, [tile(other, 'xs'), h('span', { text: other.name })]);
    }

    /** The picker behind "+ Type": every type, searchable, a check on those the entity already has. */
    function typePicker(anchor, e) {
      openPop(
        anchor,
        function (el, close) {
          var types = state.schema.types.slice().sort(function (a, b) {
            return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
          });
          var search = types.length > 7 ? h('input', { class: 'en-pop-search', type: 'search', placeholder: 'Chercher un type', 'aria-label': 'Chercher un type', autocomplete: 'off' }) : null;
          var listEl = h('div', { class: 'en-pop-list' });
          function fill() {
            var q = search ? fold(search.value) : '';
            listEl.textContent = '';
            var n = 0;
            types.forEach(function (ty) {
              if (q && fold(ty.name + ' ' + ty.aliases.join(' ')).indexOf(q) < 0) return;
              n += 1;
              var has = e.types.indexOf(ty.id) >= 0;
              var nat = EM().natureById(EM().natureOfType(state.schema, ty.id));
              listEl.appendChild(
                menuItem(
                  ty.icon || (nat && nat.icon) || 'tag',
                  ty.name,
                  nat ? nat.name : '',
                  function () {
                    applyEntity(
                      function (cur) {
                        var set = cur.types.filter(function (x) {
                          return x !== ty.id;
                        });
                        if (!has) set.push(ty.id);
                        return EM().setTypes(state.schema, cur, set);
                      },
                      { rebuild: true }
                    );
                  },
                  { check: has }
                )
              );
            });
            if (!n) listEl.appendChild(h('p', { class: 'en-list-hint', text: 'Aucun type ne correspond.' }));
          }
          if (search) {
            search.addEventListener('input', fill);
            el.appendChild(search);
          }
          el.appendChild(listEl);
          el.appendChild(
            h('div', { class: 'en-pop-foot' }, [
              menuItem('adjustments', 'Gérer les types…', '', function () {
                state.mode = 'schema';
                paintList();
                paintMain();
              }),
            ])
          );
          fill();
        },
        { className: 'en-pop--picker', role: 'dialog' }
      );
    }

    /** The "•••" menu of the entity page: duplicate, detach, delete (two clicks). */
    function moreMenu(anchor, e) {
      openPop(
        anchor,
        function (el) {
          el.appendChild(menuItem('git-fork', 'Créer une variante', 'Une entité qui hérite de celle-ci', function () { cloneSelected(false); }));
          el.appendChild(menuItem('copy', 'Dupliquer', 'Une copie sans lien avec l’original', function () { cloneSelected(true); }));
          if (e.base) {
            el.appendChild(
              menuItem('unlink', 'Détacher du modèle', 'Garde les valeurs, ne le suit plus', function () {
                applyEntity(
                  function (cur) {
                    return EM().detachEntity(state.entities, cur);
                  },
                  { rebuild: true }
                );
              })
            );
          }
          el.appendChild(h('div', { class: 'en-menu-sep' }));
          var armed = false;
          var del = menuItem(
            'trash',
            'Supprimer l’entité',
            '',
            function () {
              if (!armed) {
                armed = true;
                del.querySelector('.en-menu-label').textContent = 'Confirmer la suppression';
                del.querySelector('.en-menu-text').appendChild(h('span', { class: 'en-menu-sub', text: 'Retire aussi les liens qui pointent vers elle' }));
                return;
              }
              closePop();
              deleteEntityNow(e);
            },
            { danger: true, keepOpen: true }
          );
          el.appendChild(del);
        },
        { align: 'end' }
      );
    }

    function deleteEntityNow(e) {
      state.entities = EM().deleteEntity(state.schema, state.entities, e.id);
      if (global.EntitiesDirectories) global.EntitiesDirectories.forget(t, e); // its People / Places record goes too
      if (state.selId === e.id) state.selId = null;
      state.confirm = '';
      scheduleSave();
      paintList();
      paintMain();
    }

    /* ── Right-click menus (the app's shared ContextMenu) ──────────── */

    function CM() {
      return global.ContextMenu && typeof global.ContextMenu.show === 'function' ? global.ContextMenu : null;
    }

    function copyToClipboard(text, what) {
      try {
        navigator.clipboard.writeText(String(text)).then(
          function () { toast(what + ' copié'); },
          function () { toast('Copie impossible', 'error'); }
        );
      } catch (err) {
        toast('Copie impossible', 'error');
      }
    }

    function scrollToSection(title) {
      var heads = els.main.querySelectorAll('.en-sec-title');
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].textContent !== title) continue;
        var box = heads[i].closest('.en-sec');
        if (box.classList.contains('is-collapsed')) box.querySelector('.en-sec-toggle').click();
        box.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
    }

    /** The links of an entity as menu rows: what it points to, then what points to it. Each opens the other entity. */
    function linkItems(e) {
      var out = [];
      e.relations.forEach(function (r) {
        var other = EM().findById(state.entities, r.to);
        if (other) out.push({ id: 'open-linked:' + r.type + r.to, label: cap(r.type) + ' : ' + other.name, icon: 'arrow-up-right', action: function () { openEntity(other.id); } });
      });
      // links held in the entity's own link fields (Contenu, Fabriqué par, Lieu...)
      EM()
        .componentIdsOf(state.schema, e)
        .forEach(function (cid) {
          var comp = EM().findById(state.schema.components, cid);
          if (!comp) return;
          comp.fields.forEach(function (f) {
            if (f.kind !== 'ref' && f.kind !== 'refs') return;
            var v = EM().effectiveValue(state.entities, e, cid + '.' + f.key, state.schema);
            (Array.isArray(v) ? v : v ? [v] : []).forEach(function (id) {
              var other = EM().findById(state.entities, id);
              if (other) out.push({ id: 'open-linked:' + cid + f.key + id, label: f.label + ' : ' + other.name, icon: 'arrow-up-right', action: function () { openEntity(other.id); } });
            });
          });
        });
      EM()
        .linksOf(state.schema, state.entities, e.id)
        .filter(function (l) {
          return l.dir === 'in' && l.via !== 'variante de';
        })
        .forEach(function (l) {
          var other = EM().findById(state.entities, l.other);
          if (!other) return;
          var via = String(l.via);
          var label = l.inverse && l.inverse !== via ? l.inverse : via.indexOf(' / ') >= 0 ? 'Utilisé comme « ' + via.split(' / ').pop() + ' » par' : '← ' + via;
          out.push({ id: 'open-linked:in' + l.other + via, label: cap(label) + ' : ' + other.name, icon: 'corner-down-left', action: function () { openEntity(other.id); } });
        });
      return out;
    }

    /** Everything one entity offers: open, see its links and components, create, rename, copy, delete. */
    function entityItems(e) {
      var links = linkItems(e);
      var comps = EM()
        .componentIdsOf(state.schema, e)
        .map(function (cid) { return EM().findById(state.schema.components, cid); })
        .filter(Boolean);
      function here(fn) {
        return function () {
          if (state.selId !== e.id || state.mode !== 'entity') openEntity(e.id);
          fn();
        };
      }
      var items = [];
      if (state.selId !== e.id || state.mode !== 'entity') items.push({ id: 'open-card', label: 'Ouvrir', icon: 'arrow-up-right', group: 'Ouvrir', action: function () { openEntity(e.id); } });
      items.push({
        id: 'show-links',
        label: 'Liens',
        icon: 'link',
        group: 'Ouvrir',
        hint: links.length ? String(links.length) : '',
        children: links.length ? links : [{ id: 'no-links', label: 'Aucun lien', disabled: true }],
        action: links.length ? null : function () {},
        disabled: !links.length,
      });
      items.push({
        id: 'show-components',
        label: 'Composants',
        icon: 'layout-list',
        group: 'Ouvrir',
        hint: comps.length ? String(comps.length) : '',
        children: comps.length
          ? comps.map(function (c) {
              return {
                id: 'component:' + c.id,
                label: c.name,
                icon: 'box',
                hint: c.fields.length ? c.fields.length + ' champ' + (c.fields.length > 1 ? 's' : '') : '',
                action: here(function () { scrollToSection(c.name); }),
              };
            })
          : [{ id: 'no-components', label: 'Aucun composant', disabled: true }],
        disabled: !comps.length,
        action: comps.length ? null : function () {},
      });
      items.push({ id: 'open-history', label: 'Historique', icon: 'history', group: 'Ouvrir', action: here(function () { var d = els.main.querySelector('.en-sec--disc .en-disc:last-of-type, .en-sec--disc .en-disc'); if (d) { d.scrollIntoView({ block: 'center' }); if (!d.classList.contains('is-open')) d.click(); } }) });
      // a type is just a list of components: an entity can carry several, switched here with a check
      items.push({
        id: 'show-types',
        label: 'Types',
        icon: 'category',
        group: 'Modifier',
        hint: e.types.length ? String(e.types.length) : '',
        children: state.schema.types.map(function (ty) {
          var has = e.types.indexOf(ty.id) >= 0;
          return {
            id: 'type:' + ty.id,
            label: ty.name,
            icon: ty.icon || 'stack-2',
            checked: has,
            action: here(function () {
              applyEntity(
                function (cur) {
                  var set = has
                    ? cur.types.filter(function (x) { return x !== ty.id; })
                    : cur.types.concat([ty.id]);
                  return EM().setTypes(state.schema, cur, set);
                },
                { rebuild: true }
              );
            }),
          };
        }),
      });
      items.push({ sep: true });
      items.push({
        id: 'add-link',
        label: 'Ajouter un lien…',
        icon: 'plus',
        group: 'Créer',
        action: function () {
          openEntity(e.id);
          state.linkOpen = true;
          state.refocus = '.en-link-type';
          paintMain();
        },
      });
      items.push({ id: 'create-variant', label: 'Créer une variante', icon: 'git-fork', group: 'Créer', action: here(function () { cloneSelected(false); }) });
      items.push({ id: 'duplicate', label: 'Dupliquer', icon: 'copy', group: 'Créer', action: here(function () { cloneSelected(true); }) });
      if (e.base) {
        items.push({
          id: 'detach',
          label: 'Détacher du modèle',
          icon: 'unlink',
          group: 'Modifier',
          action: here(function () {
            applyEntity(function (cur) { return EM().detachEntity(state.entities, cur); }, { rebuild: true });
          }),
        });
      }
      items.push({
        id: 'edit',
        label: 'Renommer',
        icon: 'edit',
        group: 'Modifier',
        action: here(function () {
          var input = els.main.querySelector('.en-name');
          if (input) {
            input.focus();
            input.select();
          }
        }),
      });
      items.push({ sep: true });
      items.push({ id: 'copy', label: 'Copier le nom', icon: 'copy', group: 'Presse-papiers', action: function () { copyToClipboard(e.name, 'Nom'); } });
      items.push({ sep: true });
      items.push({
        id: 'delete',
        label: 'Supprimer l’entité',
        icon: 'trash',
        danger: true,
        group: 'Suppression',
        children: [
          {
            id: 'delete-confirm',
            label: 'Confirmer la suppression',
            icon: 'trash',
            danger: true,
            hint: 'Retire aussi les liens qui pointent vers elle',
            action: function () { deleteEntityNow(e); },
          },
        ],
      });
      return items;
    }

    function listItems() {
      var items = [
        { id: 'new-entity', label: 'Nouvelle entité', icon: 'plus', group: 'Créer', action: function () { openComposer(); } },
        { id: 'open-schema', label: 'Types et composants', icon: 'settings', group: 'Ouvrir', action: function () { schemaLink.click(); } },
      ];
      if (state.query) items.push({ id: 'filter-clear', label: 'Effacer la recherche', icon: 'x', group: 'Filtres', action: function () { setQuery(''); } });
      return items;
    }

    /** What a right-click on the page offers: the field, link or section under the pointer, then the entity. */
    function mainItems(ev) {
      var e = selected();
      if (!e || state.mode !== 'entity') return listItems();
      var items = [];
      var target = ev.target;
      var row = target.closest && target.closest('.en-prop');
      var sec = target.closest && target.closest('.en-sec');
      var chip = target.closest && target.closest('.en-ref');
      if (chip) {
        items.push({ id: 'open-card', label: 'Ouvrir ' + chip.textContent, icon: 'arrow-up-right', group: 'Ouvrir', action: function () { chip.click(); } });
        items.push({ sep: true });
      }
      if (row) {
        var label = row.querySelector('.en-prop-label');
        var control = row.querySelector('.en-prop-value input:not([type=checkbox]), .en-prop-value select, .en-prop-value textarea');
        var reset = row.querySelector('.en-reset');
        var shown = control ? (control.tagName === 'SELECT' ? control.options[control.selectedIndex].text : control.value) : row.querySelector('.en-prop-value') ? row.querySelector('.en-prop-value').innerText.trim() : '';
        if (control && !control.disabled) items.push({ id: 'edit', label: 'Modifier ' + (label ? label.textContent.toLowerCase() : 'la valeur'), icon: 'edit', group: 'Modifier', action: function () { control.focus(); } });
        if (reset) items.push({ id: 'revert', label: row.classList.contains('en-prop--link') ? 'Retirer le lien' : 'Revenir à la valeur d’origine', icon: row.classList.contains('en-prop--link') ? 'x' : 'history', group: 'Modifier', action: function () { reset.click(); } });
        if (shown && shown !== '—') items.push({ id: 'copy-value', label: 'Copier la valeur', icon: 'copy', group: 'Presse-papiers', action: function () { copyToClipboard(shown, 'Valeur'); } });
        if (items.length && !items[items.length - 1].sep) items.push({ sep: true });
      }
      if (sec && sec.querySelector('.en-sec-title')) {
        var toggle = sec.querySelector('.en-sec-toggle');
        var remove = Array.prototype.filter.call(sec.querySelectorAll('.en-sec-head .en-link'), function (b) { return b.textContent === 'Retirer'; })[0];
        items.push({
          id: 'toggle-expand',
          label: sec.classList.contains('is-collapsed') ? 'Déplier « ' + sec.querySelector('.en-sec-title').textContent + ' »' : 'Replier « ' + sec.querySelector('.en-sec-title').textContent + ' »',
          icon: 'layout-list',
          group: 'Affichage',
          action: function () { toggle.click(); },
        });
        if (remove) items.push({ id: 'remove', label: 'Retirer ce composant de l’entité', icon: 'x', group: 'Suppression', action: function () { remove.click(); } });
        items.push({ sep: true });
      }
      return items.concat(entityItems(e));
    }

    function bindMenus() {
      listBox.addEventListener('contextmenu', function (ev) {
        var cm = CM();
        if (!cm) return;
        var rowEl = ev.target.closest && ev.target.closest('.en-row');
        var e = rowEl && EM().findById(state.entities, rowEl.getAttribute('data-id'));
        ev.preventDefault();
        ev.stopPropagation();
        cm.show(ev, e ? entityItems(e) : listItems());
      });
      els.main.addEventListener('contextmenu', function (ev) {
        var cm = CM();
        if (!cm || cm.isNativeEditableTarget(ev.target)) return; // text fields keep the shared copy / paste menu
        ev.preventDefault();
        ev.stopPropagation();
        cm.show(ev, mainItems(ev));
      });
    }

    /** Title block: type icon, big editable name, type pills, aliases. */
    function heroBlock(e) {
      var nameInput = h('input', {
        class: 'en-name',
        type: 'text',
        'aria-label': 'Nom',
        placeholder: 'Nom',
        maxlength: '80',
        autocomplete: 'off',
        value: e.name,
        onchange: function () {
          applyEntity(function (cur) {
            return EM().renameEntity(cur, nameInput.value);
          });
          nameInput.value = (selected() || e).name;
        },
        onkeydown: function (ev) {
          if (ev.key === 'Enter') nameInput.blur();
          else if (ev.key === 'Escape') {
            nameInput.value = (selected() || e).name;
            nameInput.blur();
          }
        },
      });
      var moreBtn = h(
        'button',
        {
          class: 'en-icon-btn',
          type: 'button',
          title: 'Plus d’actions',
          'aria-label': 'Plus d’actions',
          'aria-haspopup': 'menu',
          'aria-expanded': 'false',
          onclick: function (ev) {
            moreMenu(ev.currentTarget, selected() || e);
          },
        },
        [icon('dots')]
      );

      var typesRow = h('div', { class: 'en-typesrow' });
      var typeNames = [];
      e.types.forEach(function (tid) {
        var ty = EM().findById(state.schema.types, tid);
        if (!ty) return;
        typeNames.push(fold(ty.name));
        var nat = EM().natureById(EM().natureOfType(state.schema, tid));
        typesRow.appendChild(
          h('span', { class: 'en-typepill', style: '--tile:' + ((nat && NATURE_COLORS[nat.id]) || NEUTRAL_COLOR) }, [
            icon(ty.icon || (nat && nat.icon) || 'tag'),
            h('span', { text: ty.name + (ty.role ? ' (rôle)' : '') }),
            h(
              'button',
              {
                class: 'en-typepill-x',
                type: 'button',
                title: 'Retirer le type ' + ty.name,
                'aria-label': 'Retirer le type ' + ty.name,
                onclick: function () {
                  applyEntity(
                    function (cur) {
                      return EM().setTypes(
                        state.schema,
                        cur,
                        cur.types.filter(function (x) {
                          return x !== tid;
                        })
                      );
                    },
                    { rebuild: true }
                  );
                },
              },
              [icon('x')]
            ),
          ])
        );
      });
      EM()
        .naturesOf(state.schema, e)
        .forEach(function (n) {
          var nat = EM().natureById(n);
          if (typeNames.indexOf(fold(nat.name)) >= 0) return;
          typesRow.appendChild(h('span', { class: 'en-nature', title: nat.hint, text: nat.name }));
        });
      typesRow.appendChild(
        h(
          'button',
          {
            class: 'en-typeadd',
            type: 'button',
            'aria-haspopup': 'dialog',
            'aria-expanded': 'false',
            onclick: function (ev) {
              typePicker(ev.currentTarget, selected() || e);
            },
          },
          [icon('plus'), e.types.length ? 'Type' : 'Ajouter un type']
        )
      );
      var base = e.base ? EM().findById(state.entities, e.base) : null;
      if (base) {
        typesRow.appendChild(
          h('button', { class: 'en-typepill en-typepill--model', type: 'button', title: 'Cette entité suit son modèle : ouvrir « ' + base.name + ' »', onclick: function () { openEntity(base.id); } }, [icon('git-fork'), 'Variante de ' + base.name])
        );
      }

      return h('header', { class: 'en-hero' }, [h('div', { class: 'en-hero-top' }, [tile(e, 'lg'), nameInput, moreBtn]), typesRow]);
    }

    /** "Autres noms" as a section of the entity page, laid out like a component's property rows. */
    function aliasesSection(e, removeBtn) {
      var aliasBox = h('div', { class: 'en-aliases' });
      function setAliasList(list, refocus) {
        applyEntity(function (cur) {
          return EM().setAliases(cur, list);
        });
        fillAliases();
        if (refocus) {
          var inp = aliasBox.querySelector('.en-alias-input');
          if (inp) inp.focus();
        }
      }
      function fillAliases() {
        var cur = selected() || e;
        aliasBox.textContent = '';
        cur.aliases.forEach(function (a) {
          aliasBox.appendChild(
            h('span', { class: 'en-token' }, [
              a,
              h('button', { class: 'en-token-x', type: 'button', 'aria-label': 'Retirer l’alias ' + a, onclick: function () { setAliasList(cur.aliases.filter(function (x) { return x !== a; }), true); } }, [icon('x')]),
            ])
          );
        });
        var input = h('input', {
          class: 'en-alias-input',
          type: 'text',
          maxlength: '40',
          autocomplete: 'off',
          placeholder: cur.aliases.length ? 'Ajouter…' : 'ex. travail, work, bureau',
          title: 'Un alias est un autre nom : l’assistant comprend « au travail » si l’alias est « travail ».',
          'aria-label': 'Ajouter un alias',
          onkeydown: function (ev) {
            if (ev.key === 'Enter' || ev.key === ',') {
              ev.preventDefault();
              commitAlias(true);
            } else if (ev.key === 'Backspace' && !input.value && cur.aliases.length) {
              setAliasList(cur.aliases.slice(0, -1), true);
            }
          },
          onblur: function () {
            commitAlias(false);
          },
        });
        function commitAlias(refocus) {
          var parts = splitList(input.value);
          if (!parts.length) return;
          input.value = '';
          setAliasList((selected() || e).aliases.concat(parts), refocus);
        }
        aliasBox.appendChild(input);
      }
      fillAliases();
      var row = h('div', { class: 'en-prop en-prop--stack' }, [h('label', { class: 'en-prop-label', text: 'Alias' }), h('div', { class: 'en-prop-value' }, [aliasBox]), h('span', { class: 'en-prop-meta' })]);
      return section('Autres noms', h('div', { class: 'en-set' }, [row]), removeBtn, null, sectionIcon('names'));
    }

    function paintMain() {
      var viewKey = state.mode + ':' + (state.selId || '');
      var same = els.main.dataset.view === viewKey;
      var keep = same ? els.main.scrollTop : 0;
      if (!same) {
        state.openModel = undefined;
        state.linkOpen = false;
      }
      closePop();
      els.main.textContent = '';
      els.main.dataset.view = viewKey;
      var page = h('div', { class: 'en-page' });
      els.main.appendChild(page);
      if (state.mode === 'schema') {
        page.classList.add('en-page--schema');
        paintSchema(page);
      } else paintEntity(page);
      els.main.scrollTop = keep;
      if (state.refocus) {
        var f = page.querySelector(state.refocus);
        state.refocus = '';
        if (f) f.focus();
      }
    }

    function paintEntity(page) {
      var e = selected();
      if (!e) {
        page.classList.add('en-page--empty');
        page.appendChild(emptyState());
        return;
      }
      page.appendChild(heroBlock(e));
      EM()
        .ontologyIssues(state.schema, state.entities, e)
        .forEach(function (i) {
          var fix =
            i.code === 'relation-nature'
              ? h(
                  'button',
                  {
                    class: 'en-link',
                    type: 'button',
                    title: 'Garde le lien, mais avec le lien général « lié à »',
                    onclick: function () {
                      applyEntity(
                        function (cur) {
                          return EM().addRelation(EM().removeRelation(cur, i.relType, i.other), 'lié à', i.other);
                        },
                        { rebuild: true }
                      );
                    },
                  },
                  ['Remplacer par « lié à »']
                )
              : null;
          page.appendChild(h('div', { class: 'en-notice en-notice--' + i.level, role: 'note' }, [icon(i.level === 'error' ? 'alert-circle' : i.level === 'info' ? 'info-circle' : 'alert-triangle'), h('span', { text: i.message }), fix]));
        });
      findings()
        .filter(function (f) {
          return f.entityId === e.id;
        })
        .forEach(function (f) {
          var cardBtn = f.card
            ? h('button', { class: 'en-link', type: 'button', onclick: function () { createFindingCard(f); } }, ['Créer la carte « ' + f.card + ' »'])
            : null;
          page.appendChild(h('div', { class: 'en-notice en-notice--' + (f.level === 'alert' ? 'error' : f.level), role: 'note' }, [icon(LEVEL_ICON[f.level] || 'info-circle'), h('span', { text: f.text }), cardBtn]));
        });
      var ownIds = EM().componentIdsOf(state.schema, { types: e.types });
      var comps = EM()
        .componentIdsOf(state.schema, e)
        .map(function (cid) {
          return EM().findById(state.schema.components, cid);
        })
        .filter(Boolean);
      comps.forEach(function (comp) {
        var own = ownIds.indexOf(comp.id) < 0;
        var removeBtn = own
          ? h(
              'button',
              {
                class: 'en-link',
                type: 'button',
                title: 'Retirer ces champs de cette entité (les valeurs saisies restent en mémoire)',
                onclick: function () {
                  applyEntity(
                    function (cur) {
                      var base = comp.builtin === 'aliases' ? EM().setAliases(cur, []) : cur; // the other names go with their component
                      var left = EM().setComponents(
                        state.schema,
                        base,
                        (cur.components || []).filter(function (x) {
                          return x !== comp.id;
                        })
                      );
                      return left;
                    },
                    { rebuild: true }
                  );
                },
              },
              ['Retirer']
            )
          : null;
        if (comp.builtin === 'aliases') {
          page.appendChild(aliasesSection(e, removeBtn));
          return;
        }
        var rows = comp.fields.map(function (f) {
          return propRow(e, comp, f);
        });
        if (!rows.length) rows = [h('p', { class: 'en-set-empty', text: 'Aucun champ : ajoutez-en dans « Types et composants ».' })];
        page.appendChild(section(comp.name, h('div', { class: 'en-set' }, rows), removeBtn, null, sectionIcon(comp.id)));
      });
      if (!comps.length) page.appendChild(h('p', { class: 'en-hint en-hint--lead', text: 'Pas encore de champs : choisissez un type pour en obtenir (ex. Plante : arrosage, santé), ou ajoutez-en.' }));
      var addFields = addFieldsRow(e, !comps.length);
      if (addFields) page.appendChild(addFields);
      page.appendChild(linksSection(e));
      var ctx = contextSection(e);
      if (ctx) page.appendChild(ctx);
      page.appendChild(modelSection(e));
      page.appendChild(historyBox);
      paintHistory();
    }

    /** "+ Ajouter des champs": groups of fields (components) for this entity only, without changing its type. */
    function addFieldsRow(e, first) {
      var have = EM().componentIdsOf(state.schema, e);
      var avail = state.schema.components.filter(function (c) {
        return have.indexOf(c.id) < 0 && (c.fields.length || c.builtin);
      });
      if (!avail.length) return null;
      return h('div', { class: 'en-addrow' }, [
        h(
          'button',
          {
            class: 'en-btn en-btn--ghost',
            type: 'button',
            'aria-haspopup': 'menu',
            'aria-expanded': 'false',
            title: 'Ajouter un groupe de champs à cette entité seulement, sans changer son type',
            onclick: function (ev) {
              openPop(ev.currentTarget, function (el) {
                avail.forEach(function (c) {
                  el.appendChild(
                    menuItem(
                      'forms',
                      c.name,
                      c.fields
                        .map(function (x) {
                          return x.label;
                        })
                        .join(', '),
                      function () {
                        applyEntity(
                          function (cur) {
                            return EM().setComponents(state.schema, cur, (cur.components || []).concat([c.id]));
                          },
                          { rebuild: true }
                        );
                      }
                    )
                  );
                });
              });
            },
          },
          [icon('plus'), first ? 'Ajouter des champs' : 'Ajouter d’autres champs']
        ),
      ]);
    }

    /** Where the entity sits (containment), what it contains, what anchors it in matter: derived, read-only. */
    function contextSection(e) {
      var rows = [];
      function row(label, nodes) {
        rows.push(h('div', { class: 'en-prop en-prop--ctx' }, [h('span', { class: 'en-prop-label', text: label }), h('div', { class: 'en-prop-value en-crumb' }, nodes), h('span', { class: 'en-prop-meta' })]));
      }
      function chain(ids) {
        var nodes = [];
        ids.forEach(function (id, i) {
          var o = EM().findById(state.entities, id);
          if (!o) return;
          if (i) nodes.push(h('span', { class: 'en-crumb-sep', text: '›' }));
          nodes.push(entityChip(o));
        });
        return nodes;
      }
      var path = EM().pathOf(state.schema, state.entities, e.id);
      if (path.length > 1) {
        row(
          'Se trouve dans',
          chain(
            path
              .filter(function (p) {
                return p.id !== e.id;
              })
              .map(function (p) {
                return p.id;
              })
          )
        );
      }
      var inside = EM().descendantsOf(state.schema, state.entities, e.id);
      if (inside.length) {
        var nodes = inside.slice(0, 12).map(function (id) {
          return EM().findById(state.entities, id);
        });
        nodes = nodes.filter(Boolean).map(entityChip);
        if (inside.length > 12) nodes.push(h('span', { class: 'en-hint', text: '+ ' + (inside.length - 12) }));
        row('Contient', nodes);
      }
      var g = EM().groundingOf(state.schema, state.entities, e.id);
      if (g.grounded && g.path.length > 1) row('Ancré par', chain(g.path.slice(1)));
      if (!rows.length) return null;
      return section('Contexte', h('div', { class: 'en-set' }, rows), null, null, sectionIcon('contexte'));
    }

    /** Free relations ("situé dans", "fait de"…) and the ones that point here, as a list with an inline "add". */
    function linksSection(e) {
      var rows = [];
      e.relations.forEach(function (r) {
        var other = EM().findById(state.entities, r.to);
        rows.push(
          h('div', { class: 'en-prop en-prop--link' }, [
            h('span', { class: 'en-prop-label', text: cap(r.type) }),
            h('div', { class: 'en-prop-value' }, [other ? entityChip(other) : h('span', { class: 'en-hint', text: '(supprimée)' })]),
            h('span', { class: 'en-prop-meta' }, [
              h(
                'button',
                {
                  class: 'en-reset',
                  type: 'button',
                  title: 'Retirer le lien',
                  'aria-label': 'Retirer le lien ' + r.type,
                  onclick: function () {
                    applyEntity(
                      function (cur) {
                        return EM().removeRelation(cur, r.type, r.to);
                      },
                      { rebuild: true }
                    );
                  },
                },
                [icon('x')]
              ),
            ]),
          ])
        );
      });
      EM()
        .linksOf(state.schema, state.entities, e.id)
        .filter(function (l) {
          return l.dir === 'in' && l.via !== 'variante de';
        })
        .forEach(function (l) {
          var other = EM().findById(state.entities, l.other);
          if (!other) return;
          var via = String(l.via);
          var label = l.inverse && l.inverse !== via ? l.inverse : via.indexOf(' / ') >= 0 ? 'Utilisé comme « ' + via.split(' / ').pop() + ' » par' : '← ' + via;
          rows.push(
            h('div', { class: 'en-prop en-prop--link is-in' }, [
              h('span', { class: 'en-prop-label', text: cap(label) }),
              h('div', { class: 'en-prop-value' }, [entityChip(other)]),
              h('span', { class: 'en-prop-meta' }),
            ])
          );
        });
      var others = state.entities.filter(function (x) {
        return x.id !== e.id;
      });
      if (others.length) {
        rows.push(state.linkOpen ? linkForm(e, others) : h('button', { class: 'en-set-add', type: 'button', onclick: function () { state.linkOpen = true; state.refocus = '.en-link-type'; paintMain(); } }, [icon('plus'), 'Ajouter un lien']));
      } else if (!rows.length) {
        rows.push(h('p', { class: 'en-set-empty', text: 'Créez une autre entité pour pouvoir les relier.' }));
      }
      return section('Liens', h('div', { class: 'en-set' }, rows), null, null, sectionIcon('liens'));
    }

    function linkForm(e, others) {
      var relType = h('input', {
        class: 'en-input en-link-type',
        type: 'text',
        placeholder: 'Lien (ex. situé dans, fait de)',
        'aria-label': 'Type de lien',
        list: 'en-rel-types',
        autocomplete: 'off',
      });
      var relList = h('datalist', { id: 'en-rel-types' });
      EM()
        .relationsFor(EM().naturesOf(state.schema, e))
        .forEach(function (d) {
          relList.appendChild(h('option', { value: d.name }));
        });
      var relTo = h('select', { class: 'en-input', 'aria-label': 'Entité liée' });
      others
        .slice()
        .sort(function (a, b) {
          return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
        })
        .forEach(function (x) {
          relTo.appendChild(h('option', { value: x.id, text: x.name }));
        });
      function submit() {
        if (!relTo.value) return;
        if (EM().wouldCycleRelation(state.schema, state.entities, e.id, relType.value, relTo.value)) {
          toast('Ce lien ferait contenir une entité par elle-même.', 'error');
          return;
        }
        state.linkOpen = false;
        applyEntity(
          function (cur) {
            return EM().addRelation(cur, relType.value, relTo.value);
          },
          { rebuild: true }
        );
      }
      relType.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') submit();
        else if (ev.key === 'Escape') cancel();
      });
      function cancel() {
        state.linkOpen = false;
        paintMain();
      }
      return h('div', { class: 'en-linkform' }, [
        relList,
        relType,
        relTo,
        h('button', { class: 'en-btn en-btn--primary', type: 'button', onclick: submit }, ['Lier']),
        h('button', { class: 'en-btn', type: 'button', onclick: cancel }, ['Annuler']),
      ]);
    }

    /** "Modèle et variantes": rarely needed, so a collapsed row unless this entity already follows a model or has variants. */
    function modelSection(e) {
      var base = e.base ? EM().findById(state.entities, e.base) : null;
      var variants = EM().variantsOf(state.entities, e.id);
      var open = state.openModel === undefined ? !!(base || variants.length) : state.openModel;
      var meta = base ? 'suit « ' + base.name + ' »' : variants.length ? variants.length + (variants.length > 1 ? ' variantes' : ' variante') : '';
      var box = h('section', { class: 'en-sec en-sec--disc' }, [
        disclosure('Modèle et variantes', meta, open, function () {
          state.openModel = !open;
          paintMain();
        }),
      ]);
      if (!open) return box;
      var sel = h('select', { class: 'en-ctl', id: 'en-model', 'aria-label': 'Modèle suivi par cette entité' });
      sel.appendChild(h('option', { value: '', text: 'Aucun (entité indépendante)' }));
      state.entities
        .slice()
        .sort(function (a, b) {
          return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
        })
        .forEach(function (x) {
          if (x.id === e.id || EM().wouldCycle(state.entities, e.id, x.id)) return;
          sel.appendChild(h('option', { value: x.id, text: x.name }));
        });
      sel.value = e.base || '';
      sel.addEventListener('change', function () {
        applyEntity(
          function (cur) {
            return EM().setBase(state.entities, cur, sel.value);
          },
          { rebuild: true }
        );
      });
      var rows = [h('div', { class: 'en-prop' }, [h('label', { class: 'en-prop-label', for: 'en-model', text: 'Modèle' }), h('div', { class: 'en-prop-value' }, [h('span', { class: 'en-select' }, [sel])]), h('span', { class: 'en-prop-meta' })])];
      if (variants.length) {
        rows.push(
          h('div', { class: 'en-prop en-prop--ctx' }, [
            h('span', { class: 'en-prop-label', text: 'Variantes' }),
            h('div', { class: 'en-prop-value en-crumb' }, variants.map(entityChip)),
            h('span', { class: 'en-prop-meta' }),
          ])
        );
      }
      rows.push(
        h('p', {
          class: 'en-set-note',
          text: base
            ? 'Les valeurs que vous ne modifiez pas suivent « ' + base.name + ' » ; ce que vous changez ici n’affecte jamais « ' + base.name + ' » ni ses autres variantes.'
            : 'Hérite des valeurs du modèle et ne garde que ses différences. Raccourci : « Créer une variante » dans le menu •••.',
        })
      );
      box.appendChild(h('div', { class: 'en-set' }, rows));
      return box;
    }

    function emptyState() {
      if (!state.loaded) return h('div', { class: 'en-empty' }, [h('p', { class: 'en-empty-text', text: 'Chargement…' })]);
      var has = state.entities.length > 0;
      var box = h('div', { class: 'en-empty' }, [
        h('span', { class: 'en-empty-ic' }, [icon('stack-2')]),
        h('h2', { class: 'en-empty-title', text: has ? 'Aucune entité sélectionnée' : 'Décrivez votre première entité' }),
        h('p', {
          class: 'en-empty-text',
          text: has
            ? 'Choisissez une entité dans la liste, ou composez-en une nouvelle.'
            : 'Une entité est une chose nommée — « Monstera », « Hôtel de Ville » — avec un type, des propriétés et des liens. L’assistant s’en sert pour comprendre « arroser mes plantes au travail ».',
        }),
        h('button', { class: 'en-btn en-btn--primary', type: 'button', onclick: function () { openComposer(); } }, [icon('wand'), 'Composer une entité']),
      ]);
      var hasPlant = state.schema.types.some(function (ty) {
        return ty.id === 'plante';
      });
      if (!hasPlant && !has) {
        box.appendChild(h('button', { class: 'en-link', type: 'button', onclick: addPlantExample }, [icon('plant'), 'Essayer avec un exemple : le type « Plante »']));
      }
      return box;
    }

    function addPlantExample() {
      var s = EM().upsertComponent(state.schema, {
        id: 'entretien',
        name: 'Entretien',
        fields: [
          { key: 'interval_days', label: 'Arroser tous les (jours)', kind: 'number' },
          { key: 'last_done', label: 'Dernier arrosage', kind: 'date' },
          { key: 'health', label: 'Santé', kind: 'choice', options: ['bonne', 'fragile', 'morte'] },
        ],
      });
      s = EM().upsertType(s, { id: 'plante', name: 'Plante', aliases: ['plant', 'verdure'], components: ['location', 'entretien'] });
      setSchema(s);
      toast('Type « Plante » ajouté. Créez des plantes, puis un lieu avec l’alias « travail ».');
    }

    /* ── 5. Schema editor ───────────────────────────────────────── */

    function setSchema(next) {
      state.schema = next;
      state.entities = state.entities.map(function (e) {
        return EM().normalizeEntity(e, next);
      });
      scheduleSave();
      paintList();
      paintMain();
    }

    function paintSchema(main) {
      main.appendChild(
        h('header', { class: 'en-hero en-hero--schema' }, [
          h(
            'button',
            {
              class: 'en-back',
              type: 'button',
              onclick: function () {
                state.mode = 'entity';
                paintList();
                paintMain();
              },
            },
            [icon('chevron-left'), 'Entités']
          ),
          h('h2', { class: 'en-page-title', text: 'Types et composants' }),
          h('p', {
            class: 'en-lead',
            text: 'Un composant est un groupe de champs (ex. Entretien : fréquence, dernier arrosage). Un type regroupe des composants (ex. Plante = Lieu + Entretien) ; une entité a un ou plusieurs types.',
          }),
        ])
      );
      if (global.EntitiesLibrary) main.appendChild(libraryCard());
      if (ES()) main.appendChild(systemsCard());
      main.appendChild(relationsCard());
      main.appendChild(h('h3', { class: 'en-h en-h--section', text: 'Types (archétypes)' }));
      state.schema.types.forEach(function (ty) {
        main.appendChild(typeCard(ty));
      });
      main.appendChild(
        h(
          'button',
          {
            class: 'en-btn',
            onclick: function () {
              var n = state.schema.types.length + 1;
              setSchema(EM().upsertType(state.schema, { name: 'Type ' + n, components: [] }));
            },
          },
          [icon('plus'), 'Nouveau type']
        )
      );
      main.appendChild(h('h3', { class: 'en-h en-h--section', text: 'Composants' }));
      state.schema.components.forEach(function (c) {
        main.appendChild(componentCard(c));
      });
      main.appendChild(
        h(
          'button',
          {
            class: 'en-btn',
            onclick: function () {
              var n = state.schema.components.length + 1;
              setSchema(EM().upsertComponent(state.schema, { name: 'Composant ' + n, fields: [] }));
            },
          },
          [icon('plus'), 'Nouveau composant']
        )
      );
    }

    /** Rules (Systems): what to watch for, ready-made or written in plain French and approved by the user. */
    function systemsCard() {
      var card = h('div', { class: 'en-card' }, [h('h3', { class: 'en-h', text: 'Règles' })]);
      (state.schema.systems || []).forEach(function (sys) {
        var on = h('input', { type: 'checkbox', checked: sys.enabled ? true : null, 'aria-label': 'Activer ' + sys.name });
        on.addEventListener('change', function () {
          setSchema(EM().upsertSystem(state.schema, Object.assign({}, sys, { enabled: on.checked })));
        });
        card.appendChild(
          h('div', { class: 'en-field-row' }, [
            h('label', { class: 'en-check' }, [on, sys.name]),
            h('span', { class: 'en-hint', text: ES().describe(state.schema, sys) }),
            h('button', { class: 'en-link', type: 'button', 'aria-label': 'Supprimer la règle ' + sys.name, onclick: function () { setSchema(EM().removeSystem(state.schema, sys.id)); } }, [icon('x')]),
          ])
        );
      });
      var have = {};
      (state.schema.systems || []).forEach(function (s) {
        have[s.id] = true;
      });
      var presets = ES().PRESETS.filter(function (p) {
        return !have[p.id];
      });
      if (presets.length) {
        var row = h('div', { class: 'en-lib-row' });
        presets.forEach(function (p) {
          row.appendChild(
            h('button', {
              class: 'en-btn en-btn--small',
              type: 'button',
              onclick: function () {
                var r = ES().install(state.schema, p.id);
                if (r.error) return toast('Règle impossible : schéma trop grand ou composant manquant.', 'error');
                setSchema(r.schema);
              },
            }, [icon('plus'), p.name])
          );
        });
        card.appendChild(row);
      }
      if (state.ai && ESAI()) {
        var input = h('input', { class: 'en-input', placeholder: 'Décrire une règle…', 'aria-label': 'Décrire une règle' });
        var go = function () {
          if (!input.value.trim()) return;
          input.disabled = true;
          ESAI()
            .author(t, state.schema, input.value)
            .then(function (r) {
              if (r.error) {
                input.disabled = false;
                return toast(r.error === 'unclear' ? 'Je n’ai pas compris cette règle avec vos composants.' : 'Le modèle n’a pas répondu.', 'error');
              }
              state.draftRule = r.system;
              paintMain();
            });
        };
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') go();
        });
        card.appendChild(h('div', { class: 'en-link-add' }, [input, h('button', { class: 'en-btn', type: 'button', onclick: go }, [icon('sparkles'), 'Écrire'])]));
      }
      if (state.draftRule) {
        var d = state.draftRule;
        card.appendChild(
          h('div', { class: 'en-notice en-notice--info' }, [
            icon('sparkles'),
            h('span', { text: d.name + ' : ' + ES().describe(state.schema, d) + ' → ' + d.then.text + (d.then.card ? ' (carte « ' + d.then.card + ' »)' : '') }),
            h('button', { class: 'en-link', type: 'button', onclick: function () { var next = EM().upsertSystem(state.schema, d); state.draftRule = null; setSchema(next); } }, ['Ajouter']),
            h('button', { class: 'en-link', type: 'button', onclick: function () { state.draftRule = null; paintMain(); } }, ['Annuler']),
          ])
        );
      }
      ES()
        .duplicateFields(state.schema)
        .slice(0, 3)
        .forEach(function (dup) {
          card.appendChild(
            h('div', { class: 'en-notice en-notice--info' }, [
              icon('copy'),
              h('span', {
                text:
                  'Champ en double : ' +
                  dup.label +
                  ' (' +
                  dup.paths
                    .map(function (p) {
                      var c = EM().findById(state.schema.components, p.split('.')[0]);
                      return c ? c.name : p;
                    })
                    .join(', ') +
                  ')',
              }),
            ])
          );
        });
      return card;
    }

    var CATEGORY_LABELS = {
      spatial: 'Spatial', mereological: 'Parties et touts', composition: 'Composition', production: 'Production', social: 'Social',
      taxonomic: 'Classification', grounding: 'Ancrage', causal: 'Causal', temporal: 'Temps', conceptual: 'Conceptuel', generic: 'Générique',
    };

    /** The relation vocabulary: built-in ones (read-only) and the user's own (name, inverse, category, containment). */
    function relationsCard() {
      var card = h('div', { class: 'en-card' }, [
        h('h3', { class: 'en-h', text: 'Relations' }),
        h('p', {
          class: 'en-hint',
          text: 'Un lien dont le nom est reconnu a un sens : son inverse (« situé dans » / « abrite »), et « situé dans » ou « fait partie de » forment la hiérarchie de contenance. Ajoutez les vôtres ; un nom inconnu reste un lien libre.',
        }),
      ]);
      var builtin = h('div', { class: 'en-chips' });
      EM().RELATIONS.forEach(function (d) {
        if (d.custom) return;
        builtin.appendChild(h('span', { class: 'en-chip', title: (CATEGORY_LABELS[d.category] || '') + (d.inverse ? ' · inverse : ' + d.inverse : ' · symétrique') }, [d.name]));
      });
      card.appendChild(builtin);
      (state.schema.relations || []).forEach(function (r) {
        var name = h('input', { class: 'en-input', value: r.name, 'aria-label': 'Nom du lien' });
        var inverse = h('input', { class: 'en-input', value: r.inverse, placeholder: 'inverse (ex. dirige)', 'aria-label': 'Inverse', disabled: r.symmetric ? true : null });
        var cat = h('select', { class: 'en-input', 'aria-label': 'Catégorie' });
        EM().RELATION_CATEGORIES.forEach(function (c) {
          cat.appendChild(h('option', { value: c, text: CATEGORY_LABELS[c] }));
        });
        cat.value = r.category;
        var sym = h('input', { type: 'checkbox', checked: r.symmetric ? true : null });
        var up = h('input', { type: 'checkbox', checked: r.up ? true : null, disabled: r.symmetric ? true : null });
        function save() {
          var next = EM().removeRelationDef(state.schema, r.id);
          setSchema(EM().upsertRelationDef(next, { name: name.value, inverse: inverse.value, category: cat.value, symmetric: sym.checked, up: up.checked }));
        }
        [name, inverse, cat, sym, up].forEach(function (el) {
          el.addEventListener('change', save);
        });
        card.appendChild(
          h('div', { class: 'en-field-row' }, [
            name,
            inverse,
            cat,
            h('label', { class: 'en-check', title: 'Pas d’inverse : « ressemble à »' }, [sym, 'symétrique']),
            h('label', { class: 'en-check', title: 'A situé dans B : B contient A (hiérarchie de contenance)' }, [up, 'contenant']),
            h('button', { class: 'en-link', 'aria-label': 'Supprimer le lien ' + r.name, onclick: function () { setSchema(EM().removeRelationDef(state.schema, r.id)); } }, [icon('x')]),
          ])
        );
      });
      var nn = h('input', { class: 'en-input', placeholder: 'Nouveau lien (ex. dirigé par)', 'aria-label': 'Nom du nouveau lien' });
      card.appendChild(
        h('div', { class: 'en-link-add' }, [
          nn,
          h(
            'button',
            {
              class: 'en-btn',
              onclick: function () {
                if (!nn.value.trim()) return;
                var next = EM().upsertRelationDef(state.schema, { name: nn.value });
                if ((next.relations || []).length === (state.schema.relations || []).length) {
                  toast('Ce nom est déjà un lien connu, ou est vide.', 'error');
                  return;
                }
                setSchema(next);
              },
            },
            [icon('plus'), 'Ajouter']
          ),
        ])
      );
      return card;
    }

    /** Ready-made types by group (matter, living, people, places, time, ideas): one click installs a type with its parents and components. */
    function libraryCard() {
      var EL = global.EntitiesLibrary;
      var card = h('div', { class: 'en-card' }, [
        h('h3', { class: 'en-h', text: 'Bibliothèque d’ontologie' }),
        h('p', {
          class: 'en-hint',
          text: 'Des types prêts à l’emploi, rangés par nature : crème pour les mains (produit), région du monde, pays, ville, bâtiment, personne, travailleur, organisation, événement, concept… Un clic ajoute le type avec ses parents et ses composants.',
        }),
      ]);
      EL.GROUPS.forEach(function (g) {
        var items = EL.listFor(state.schema, { group: g.id });
        if (!items.length) return;
        var row = h('div', { class: 'en-lib-row' }, [h('span', { class: 'en-lib-group' }, [icon(g.icon), g.name])]);
        items.forEach(function (x) {
          row.appendChild(
            x.installed
              ? h('span', { class: 'en-chip en-chip--ok', title: 'Déjà dans le schéma' }, [icon('check'), x.preset.name])
              : h(
                  'button',
                  {
                    class: 'en-btn en-btn--small',
                    title: x.preset.description,
                    onclick: function () {
                      var r = EL.install(state.schema, x.preset.id);
                      if (r.error) {
                        toast('Le schéma est trop grand pour ajouter ce type : supprimez des types ou composants inutilisés.', 'error');
                        return;
                      }
                      setSchema(r.schema);
                      toast('Ajouté : ' + r.added.types.join(', ') + '.');
                    },
                  },
                  [icon('plus'), x.preset.name]
                )
          );
        });
        card.appendChild(row);
      });
      return card;
    }

    /** A schema card that folds: a one-line summary until opened (the open ones are remembered across repaints). */
    function foldCard(id, summary, body) {
      var box = h('details', { class: 'en-fold' }, [h('summary', { class: 'en-fold-sum' }, summary.concat([icon('chevron-right')])), h('div', { class: 'en-fold-body' }, body)]);
      if (state.folds[id]) box.setAttribute('open', '');
      box.addEventListener('toggle', function () {
        state.folds[id] = box.open;
      });
      return box;
    }

    /** Default values of an archetype: what an entity gets for a field it leaves empty (links excluded). */
    function defaultsEditor(ty) {
      var defaults = ty.defaults || {};
      var box = h('details', { class: 'en-defaults' }, [h('summary', { text: 'Valeurs par défaut (' + Object.keys(defaults).length + ')' })]);
      if (state.openDefaults === ty.id) box.setAttribute('open', '');
      var any = false;
      ty.components.forEach(function (cid) {
        var comp = EM().findById(state.schema.components, cid);
        if (!comp) return;
        comp.fields.forEach(function (fd) {
          if (fd.kind === 'ref' || fd.kind === 'refs') return;
          any = true;
          var path = cid + '.' + fd.key;
          var cur = defaults[path];
          var ctl;
          if (fd.kind === 'bool' || fd.kind === 'choice') {
            ctl = h('select', { class: 'en-input', 'aria-label': 'Défaut : ' + fd.label });
            ctl.appendChild(h('option', { value: '', text: '—' }));
            (fd.kind === 'bool' ? ['oui', 'non'] : fd.options || []).forEach(function (o) {
              ctl.appendChild(h('option', { value: o, text: o }));
            });
            ctl.value = fd.kind === 'bool' ? (cur === true ? 'oui' : cur === false ? 'non' : '') : cur || '';
          } else {
            ctl = h('input', {
              class: 'en-input',
              type: fd.kind === 'number' || fd.kind === 'level' ? 'number' : fd.kind === 'date' ? 'date' : 'text',
              step: fd.kind === 'number' || fd.kind === 'level' ? 'any' : null,
              'aria-label': 'Défaut : ' + fd.label,
              value: Array.isArray(cur) ? cur.join(', ') : cur == null ? '' : String(cur),
            });
          }
          ctl.addEventListener('change', function () {
            state.openDefaults = ty.id;
            var v = fd.kind === 'multi' ? splitList(ctl.value) : ctl.value;
            try {
              setSchema(EM().setTypeDefault(state.schema, ty.id, path, v));
            } catch (err) {
              toast('Valeur refusée : ' + (err && err.message), 'error');
            }
          });
          box.appendChild(h('div', { class: 'en-field-row' }, [h('label', { text: comp.name + ' : ' + fd.label + (fd.unit ? ' (' + fd.unit + ')' : '') }), ctl]));
        });
      });
      if (!any) box.appendChild(h('p', { class: 'en-hint', text: 'Cet archétype n’a pas de composant propre avec des champs à préremplir.' }));
      return box;
    }

    function typeCard(ty) {
      var name = h('input', { class: 'en-input', value: ty.name, 'aria-label': 'Nom de l’archétype' });
      var aliases = h('input', { class: 'en-input', value: ty.aliases.join(', '), placeholder: 'alias : plant, verdure', 'aria-label': 'Alias de l’archétype' });
      var checks = h('div', { class: 'en-checks' });
      var chosen = ty.components.slice();
      var nature = h('select', { class: 'en-input', 'aria-label': 'Nature du type' });
      nature.appendChild(h('option', { value: '', text: ty.parents.length ? '(celle du type parent)' : '—' }));
      EM().NATURES.forEach(function (n) {
        nature.appendChild(h('option', { value: n.id, text: n.name }));
      });
      nature.value = ty.nature || '';
      var role = h('input', { type: 'checkbox', checked: ty.role ? true : null, 'aria-label': 'Rôle' });
      var desc = h('input', { class: 'en-input', value: ty.description || '', placeholder: 'En une phrase : qu’est-ce que c’est ?', 'aria-label': 'Description du type' });
      var parents = ty.parents.slice();
      var parentBox = h('div', { class: 'en-checks' });
      state.schema.types.forEach(function (p) {
        if (p.id === ty.id) return;
        parentBox.appendChild(
          h('label', { class: 'en-check' }, [
            h('input', {
              type: 'checkbox',
              checked: parents.indexOf(p.id) >= 0 ? true : null,
              onchange: function (ev) {
                parents = parents.filter(function (x) {
                  return x !== p.id;
                });
                if (ev.target.checked) parents.push(p.id);
                save();
              },
            }),
            p.name,
          ])
        );
      });
      function save() {
        setSchema(
          EM().upsertType(state.schema, {
            id: ty.id,
            name: name.value,
            aliases: splitList(aliases.value),
            icon: ty.icon,
            nature: nature.value,
            role: role.checked,
            description: desc.value,
            parents: parents,
            defaults: ty.defaults,
            components: chosen,
          })
        );
      }
      nature.addEventListener('change', save);
      role.addEventListener('change', save);
      desc.addEventListener('change', save);
      state.schema.components.forEach(function (c) {
        checks.appendChild(
          h('label', { class: 'en-check' }, [
            h('input', {
              type: 'checkbox',
              checked: chosen.indexOf(c.id) >= 0 ? true : null,
              onchange: function (ev) {
                chosen = chosen.filter(function (x) {
                  return x !== c.id;
                });
                if (ev.target.checked) chosen.push(c.id);
                save();
              },
            }),
            c.name,
          ])
        );
      });
      name.addEventListener('change', save);
      aliases.addEventListener('change', save);
      var delId = 'type:' + ty.id;
      var natureName = (EM().natureById(EM().natureOfType(state.schema, ty.id)) || {}).name;
      var nComp = ty.components.length;
      var summary = [
        tile({ types: [ty.id] }, 'sm'),
        h('span', { class: 'en-fold-name', text: ty.name }),
        h('span', { class: 'en-fold-meta', text: [natureName, nComp ? nComp + (nComp > 1 ? ' composants' : ' composant') : ''].filter(Boolean).join(' · ') }),
      ];
      return foldCard('type:' + ty.id, summary, [
        h('div', { class: 'en-field' }, [h('label', { text: 'Nom' }), name]),
        h('div', { class: 'en-field' }, [h('label', { text: 'Alias' }), aliases]),
        h('div', { class: 'en-field' }, [h('label', { text: 'Description' }), desc]),
        h('div', { class: 'en-field' }, [h('label', { text: 'Nature' }), nature]),
        h('div', { class: 'en-field' }, [h('label', { class: 'en-check' }, [role, 'Rôle (une entité l’est dans un contexte, pas par nature)'])]),
        ty.parents.length || state.schema.types.length > 1 ? h('div', { class: 'en-field' }, [h('label', { text: 'Inclut aussi les composants de' }), parentBox]) : null,
        h('div', { class: 'en-field' }, [h('label', { text: 'Composants de ce type (un type n’est qu’une liste de composants; une entité peut en avoir plusieurs)' }), checks]),
        defaultsEditor(ty),
        h(
          'button',
          {
            class: 'en-btn en-btn--danger',
            onclick: function () {
              if (state.confirm !== delId) {
                state.confirm = delId;
                paintMain();
                return;
              }
              state.confirm = '';
              setSchema(EM().removeType(state.schema, ty.id));
            },
          },
          [icon('trash'), state.confirm === delId ? 'Confirmer (les entités perdent cet archétype)' : 'Supprimer l’archétype']
        ),
      ]);
    }

    function componentCard(c) {
      if (c.builtin) {
        return foldCard(
          'comp:' + c.id,
          [h('span', { class: 'en-fold-name', text: c.name }), h('span', { class: 'en-fold-meta', text: 'intégré' })],
          [h('p', { class: 'en-hint', text: 'Composant intégré : les autres noms d’une entité (« travail », « work »). Ajoutez-le à un archétype ou à une entité comme n’importe quel composant.' })]
        );
      }
      var name =h('input', { class: 'en-input', value: c.name, 'aria-label': 'Nom du composant' });
      function build(fields) {
        return { id: c.id, name: name.value, fields: fields };
      }
      function saveFields(fields) {
        setSchema(EM().upsertComponent(state.schema, build(fields)));
      }
      name.addEventListener('change', function () {
        saveFields(c.fields);
      });
      var card = h('div', { class: 'en-fold-fields' }, [h('div', { class: 'en-field' }, [h('label', { text: 'Nom' }), name])]);
      c.fields.forEach(function (f, i) {
        var label = h('input', { class: 'en-input', value: f.label, 'aria-label': 'Nom du champ' });
        var kind = h('select', { class: 'en-input', 'aria-label': 'Type du champ' });
        EM().FIELD_KINDS.forEach(function (k) {
          kind.appendChild(h('option', { value: k, text: KIND_LABELS[k] }));
        });
        kind.value = f.kind;
        var extra = null;
        if (f.kind === 'choice' || f.kind === 'multi') {
          extra = h('input', { class: 'en-input', value: (f.options || []).join(', '), placeholder: 'choix : bonne, fragile, morte', 'aria-label': 'Choix possibles' });
        } else if (f.kind === 'level') {
          extra = h('span', { class: 'en-field-pair' }, [
            h('input', { class: 'en-input', value: f.unit || '', placeholder: 'unité : ml, %', 'aria-label': 'Unité' }),
            h('input', {
              class: 'en-input',
              value: f.maxField || (f.max != null ? String(f.max) : ''),
              placeholder: 'maximum : 100 ou champ',
              'aria-label': 'Maximum de la jauge',
              title: 'Un nombre fixe, ou la clé d’un champ nombre du même composant (ex. capacite). Le minimum est 0.',
            }),
          ]);
        } else if (f.kind === 'number') {
          extra = h('input', { class: 'en-input', value: f.unit || '', placeholder: 'unité : kg, ml, $', 'aria-label': 'Unité' });
        } else if (f.kind === 'ref' || f.kind === 'refs') {
          extra = h('input', {
            class: 'en-input',
            value: (f.refTypes || []).join(', '),
            placeholder: 'types autorisés (ids) : place',
            'aria-label': 'Types autorisés',
            title: 'Identifiants des types acceptés, séparés par des virgules (vide = toutes les entités). Disponibles : ' + state.schema.types.map(function (x) { return x.id; }).join(', '),
          });
        }
        function commitField() {
          var next = c.fields.slice();
          var nf = { key: f.key, label: label.value, kind: kind.value };
          if (f.rel) nf.rel = f.rel;
          if (kind.value === 'number') nf.unit = extra && f.kind === 'number' ? extra.value : f.unit || '';
          if (kind.value === 'level') {
            var keep = extra && f.kind === 'level';
            nf.unit = keep ? extra.firstChild.value : f.unit || '';
            var mv = keep ? extra.lastChild.value.trim() : f.maxField || (f.max != null ? String(f.max) : '');
            if (/^\d+([.,]\d+)?$/.test(mv)) nf.max = parseFloat(mv.replace(',', '.'));
            else if (mv) nf.maxField = mv;
            if (f.min) nf.min = f.min;
          }
          if (kind.value === 'choice' || kind.value === 'multi') nf.options = extra && (f.kind === 'choice' || f.kind === 'multi') ? splitList(extra.value) : f.options || [];
          if (kind.value === 'ref' || kind.value === 'refs') nf.refTypes = extra && f.kind === kind.value ? splitList(extra.value) : f.refTypes || [];
          next[i] = nf;
          saveFields(next);
        }
        label.addEventListener('change', commitField);
        kind.addEventListener('change', commitField);
        if (extra) extra.addEventListener('change', commitField);
        card.appendChild(
          h('div', { class: 'en-field-row' }, [
            label,
            kind,
            extra,
            h(
              'button',
              {
                class: 'en-link',
                'aria-label': 'Supprimer le champ',
                onclick: function () {
                  saveFields(
                    c.fields.filter(function (_x, j) {
                      return j !== i;
                    })
                  );
                },
              },
              [icon('x')]
            ),
          ])
        );
      });
      var delId = 'comp:' + c.id;
      card.appendChild(
        h('div', { class: 'en-actions' }, [
          h(
            'button',
            {
              class: 'en-btn',
              onclick: function () {
                var used = {};
                c.fields.forEach(function (f) {
                  used[f.key] = true;
                });
                var n = c.fields.length + 1;
                while (used['champ_' + n]) n += 1;
                saveFields(c.fields.concat([{ key: 'champ_' + n, label: 'Nouveau champ', kind: 'text' }]));
              },
            },
            [icon('plus'), 'Champ']
          ),
          h(
            'button',
            {
              class: 'en-btn en-btn--danger',
              onclick: function () {
                if (state.confirm !== delId) {
                  state.confirm = delId;
                  paintMain();
                  return;
                }
                state.confirm = '';
                setSchema(EM().removeComponent(state.schema, c.id));
              },
            },
            [icon('trash'), state.confirm === delId ? 'Confirmer (les valeurs saisies sont perdues)' : 'Supprimer']
          ),
        ])
      );
      var nFields = c.fields.length;
      return foldCard('comp:' + c.id, [h('span', { class: 'en-fold-name', text: c.name }), h('span', { class: 'en-fold-meta', text: nFields + (nFields > 1 ? ' champs' : ' champ') })], [card]);
    }

    /* ── 6. Saving ──────────────────────────────────────────────── */

    function paintStatus() {
      var map = { idle: '', dirty: 'Modifié…', saving: 'Enregistrement…', saved: 'Enregistré', error: 'Non enregistré' };
      els.status.textContent = map[state.saveState] || '';
      els.status.className = 'en-status en-status--' + state.saveState;
    }

    function scheduleSave() {
      if (!state.data) toast('Autorisez Trello pour enregistrer : ces changements ne sont pas sauvegardés.', 'error');
      dirty = true;
      state.saveState = 'dirty';
      paintStatus();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
    }

    function saveNow() {
      clearTimeout(saveTimer);
      if (!dirty || !state.data) return Promise.resolve();
      if (saving) {
        saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
        return Promise.resolve();
      }
      saving = true;
      dirty = false;
      state.saveState = 'saving';
      paintStatus();
      var beforeSave = global.EntitiesDirectories
        ? global.EntitiesDirectories.push(t, state.schema, state.entities).then(function (r) {
            if (r.changed) state.entities = r.entities; // people and places now carry their directory link
          })
        : Promise.resolve();
      return beforeSave
        .then(function () {
          return ET().commit(t, state.data, state.schema, state.entities);
        })
        .then(
          function () {
            state.saveState = dirty ? 'dirty' : 'saved';
            paintStatus();
          },
          function (err) {
            dirty = true; // keep the edits; the user can retry or reload
            state.saveState = 'error';
            paintStatus();
            failure(err);
          }
        )
        .then(function () {
          saving = false;
        });
    }

    /* ── 7. Boot ────────────────────────────────────────────────── */

    buildSide();
    paintList();
    paintMain();
    if (global.EntitiesComposerAI && global.EntitiesComposerAI.available) {
      global.EntitiesComposerAI.available(t).then(function (ok) {
        state.ai = ok;
        paintObserve();
        if (state.mode === 'schema') paintMain();
      });
    }

    function boot() {
      ET()
        .isAuthorized(t)
        .then(function (ok) {
          state.authOk = ok;
          paintBanner();
          if (!ok) {
            state.loaded = true;
            paintList();
            return;
          }
          return ET()
            .load(t, { force: true })
            .then(
              function (data) {
                state.data = data;
                state.schema = data.schema;
                state.entities = data.entities.slice();
                state.loaded = true;
                state.selId = state.entities.length ? state.entities[0].id : null;
                paintList({ reveal: true });
                paintMain();
                // People and Places are entities too: bring the directories in (saved with the next write)
                if (global.EntitiesDirectories)
                  global.EntitiesDirectories.pull(t, state.schema, state.entities).then(function (r) {
                    if (!r.changed) return;
                    state.schema = r.schema;
                    state.entities = r.entities;
                    scheduleSave();
                    paintList();
                    paintMain();
                  });
              },
              function (err) {
                state.loaded = true;
                paintList();
                failure(err);
              }
            );
        });
    }

    global.addEventListener('pagehide', function () {
      saveNow();
    });

    boot();

    return { state: state, saveNow: saveNow, reload: boot, openComposer: openComposer };
  }

  global.EntitiesUI = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
