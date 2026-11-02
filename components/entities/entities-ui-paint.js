/**
 * entities-ui: mount() part 1 of 3.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see entities-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.EntitiesUiParts = global.EntitiesUiParts || {});
  var P = (global.EntitiesUiPartsMountMount = global.EntitiesUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.toast = function toast(msg, kind) {
      M.els.toast.textContent = msg;
      M.els.toast.className = 'en-toast' + (kind ? ' en-toast--' + kind : '');
      M.els.toast.hidden = false;
      clearTimeout(M.toastTimer);
      M.toastTimer = setTimeout(function () {
        M.els.toast.hidden = true;
      }, 5000);
    };
    M.failure = function failure(err) {
      if (S.isAuthReason(err)) {
        M.state.authOk = false;
        M.paintBanner();
      }
      M.toast(S.reasonText(err), 'error');
    };
    M.selected = function selected() {
      return S.EM().findById(M.state.entities, M.state.selId);
    };
    M.typeName = function typeName(id) {
      var ty = S.EM().findById(M.state.schema.types, id);
      return ty ? ty.name : id;
    };
    M.paintBanner = function paintBanner() {
      M.els.banner.textContent = '';
      M.els.banner.hidden = M.state.authOk;
      if (M.state.authOk) return;
      M.els.banner.appendChild(S.icon('lock'));
      M.els.banner.appendChild(S.h('span', { text: 'Trello doit être autorisé pour lire et enregistrer les entités.' }));
      M.els.banner.appendChild(
        S.h(
          'button',
          {
            class: 'en-btn en-btn--primary',
            onclick: function () {
              S.ET().authorize(M.t).then(
                function () {
                  M.state.authOk = true;
                  M.paintBanner();
                  M.boot();
                },
                function (err) {
                  M.toast(S.reasonText(err), 'error');
                }
              );
            },
          },
          [S.icon('key'), 'Autoriser Trello']
        )
      );
    };
    M.closePop = function closePop(refocus) {
      if (!M.pop) return;
      var p = M.pop;
      M.pop = null;
      document.removeEventListener('mousedown', p.onDown, true);
      document.removeEventListener('keydown', p.onKey, true);
      global.removeEventListener('resize', p.onClose);
      M.els.main.removeEventListener('scroll', p.onClose);
      M.listBox.removeEventListener('scroll', p.onClose);
      if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
      p.anchor.setAttribute('aria-expanded', 'false');
      if (refocus && document.body.contains(p.anchor)) p.anchor.focus();
    };
    M.openPop = function openPop(anchor, build, opts) {
      opts = opts || {};
      var toggling = M.pop && M.pop.anchor === anchor;
      M.closePop();
      if (toggling) return;
      var el = S.h('div', { class: 'en-pop' + (opts.className ? ' ' + opts.className : ''), role: opts.role || 'menu' });
      build(el, function (refocus) {
        M.closePop(refocus);
      });
      M.root.appendChild(el);
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
          M.closePop();
        },
        onDown: function (ev) {
          if (!el.contains(ev.target) && !anchor.contains(ev.target)) M.closePop();
        },
        onKey: function (ev) {
          if (ev.key === 'Escape') {
            ev.preventDefault();
            ev.stopPropagation();
            M.closePop(true);
            return;
          }
          if (ev.key === 'Tab') {
            M.closePop();
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
      M.pop = p;
      document.addEventListener('mousedown', p.onDown, true);
      document.addEventListener('keydown', p.onKey, true);
      global.addEventListener('resize', p.onClose);
      M.els.main.addEventListener('scroll', p.onClose);
      M.listBox.addEventListener('scroll', p.onClose);
      var first = el.querySelector('.en-pop-search') || el.querySelector('.en-menu-item');
      if (first) first.focus();
    };
    M.menuItem = function menuItem(ic, label, sub, fn, opts) {
      opts = opts || {};
      return S.h(
        'button',
        {
          class: 'en-menu-item' + (opts.danger ? ' is-danger' : ''),
          type: 'button',
          role: 'menuitem',
          onclick: function (ev) {
            if (!opts.keepOpen) M.closePop();
            fn(ev);
          },
        },
        [
          S.icon(ic),
          S.h('span', { class: 'en-menu-text' }, [S.h('span', { class: 'en-menu-label', text: label }), sub ? S.h('span', { class: 'en-menu-sub', text: sub }) : null]),
          opts.check ? S.h('span', { class: 'en-menu-check' }, [S.icon('check')]) : null,
        ]
      );
    };
    M.setQuery = function setQuery(v, fromInput) {
      M.state.query = v;
      if (!fromInput) M.queryInput.value = v;
      M.clearBtn.hidden = !v;
      M.paintList();
    };
    M.visibleEntities = function visibleEntities() {
      var q = M.state.query.trim();
      var list = M.state.entities;
      var info = null;
      if (q) {
        info = S.EM().resolveText(M.state.schema, M.state.entities, q);
        if (info.recognized) list = info.entities;
        else list = S.EM().query(M.state.schema, M.state.entities, { text: q });
      }
      if (M.state.typeFilter) {
        list = list.filter(function (e) {
          return S.EM().isA(M.state.schema, e, M.state.typeFilter);
        });
      }
      return { list: list, info: info && info.recognized ? info : null };
    };
    M.entityVisual = function entityVisual(e) {
      var first = e && e.types && e.types.length ? S.EM().findById(M.state.schema.types, e.types[0]) : null;
      var nature = first ? S.EM().natureOfType(M.state.schema, first.id) : '';
      var nat = S.EM().natureById(nature);
      return {
        icon: (first && first.icon) || (nat && nat.icon) || (first ? 'tag' : 'circle-dashed'),
        color: S.NATURE_COLORS[nature] || S.NEUTRAL_COLOR,
      };
    };
    M.tile = function tile(e, size) {
      var v = M.entityVisual(e);
      return S.h('span', { class: 'en-tile en-tile--' + size, style: '--tile:' + v.color, 'aria-hidden': 'true' }, [S.icon(v.icon)]);
    };
    M.fillTypes = function fillTypes() {
      M.typeBar.textContent = '';
      var counts = {};
      M.state.entities.forEach(function (e) {
        S.EM()
          .typeClosure(M.state.schema, e.types)
          .forEach(function (id) {
            counts[id] = (counts[id] || 0) + 1;
          });
      });
      var used = M.state.schema.types
        .filter(function (ty) {
          return counts[ty.id] > 0 || ty.id === M.state.typeFilter;
        })
        .sort(function (a, b) {
          return (counts[b.id] || 0) - (counts[a.id] || 0) || a.name.localeCompare(b.name, 'fr');
        });
      M.typeBar.hidden = used.length < 2 && !M.state.typeFilter;
      if (M.typeBar.hidden) return;
      var MAX = 4;
      var shown = used.slice(0, MAX);
      var active = used.filter(function (ty) {
        return ty.id === M.state.typeFilter;
      })[0];
      if (active && shown.indexOf(active) < 0) shown[MAX - 1] = active;
      function pill(label, id, count) {
        var on = M.state.typeFilter === id;
        return S.h(
          'button',
          {
            class: 'en-pill' + (on ? ' is-on' : ''),
            type: 'button',
            'aria-pressed': String(on),
            onclick: function () {
              M.state.typeFilter = on ? '' : id;
              M.paintList();
            },
          },
          [label, count != null ? S.h('span', { class: 'en-pill-n', text: String(count) }) : null]
        );
      }
      M.typeBar.appendChild(pill('Tout', '', null));
      shown.forEach(function (ty) {
        M.typeBar.appendChild(pill(ty.name, ty.id, counts[ty.id] || 0));
      });
      var rest = used.filter(function (ty) {
        return shown.indexOf(ty) < 0;
      });
      if (rest.length) {
        M.typeBar.appendChild(
          S.h(
            'button',
            {
              class: 'en-pill en-pill--more',
              type: 'button',
              'aria-haspopup': 'menu',
              'aria-expanded': 'false',
              onclick: function (ev) {
                M.openPop(ev.currentTarget, function (el) {
                  rest.forEach(function (ty) {
                    el.appendChild(
                      M.menuItem(ty.icon || 'tag', ty.name, counts[ty.id] + (counts[ty.id] > 1 ? ' entités' : ' entité'), function () {
                        M.state.typeFilter = ty.id;
                        M.paintList();
                      })
                    );
                  });
                });
              },
            },
            ['Plus', S.icon('chevron-down')]
          )
        );
      }
    };
    M.paintList = function paintList(opts) {
      M.fillTypes();
      M.paintWatch();
      M.schemaLink.classList.toggle('is-on', M.state.mode === 'schema');
      var vis = M.visibleEntities();
      M.chipBox.textContent = '';
      if (vis.info) {
        vis.info.mentions.forEach(function (m) {
          var label = m.kind === 'type' ? 'Type : ' + m.name : m.kind === 'entity' ? m.name : 'Valeur : ' + m.name;
          M.chipBox.appendChild(S.h('span', { class: 'en-chip en-chip--' + m.kind, text: label }));
        });
      }
      M.listBox.textContent = '';
      if (!M.state.loaded) {
        M.listBox.innerHTML = global.Skeleton.html('entities.list');
        return;
      }
      if (!M.state.entities.length) {
        M.listBox.appendChild(S.h('p', { class: 'en-list-hint', text: 'Aucune entité pour l’instant.' }));
        M.appendAddRow();
        return;
      }
      if (!vis.list.length) {
        M.listBox.appendChild(S.h('p', { class: 'en-list-hint', text: 'Aucune entité ne correspond.' }));
        M.appendAddRow();
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
        return M.typeName(a).localeCompare(M.typeName(b), 'fr', { sensitivity: 'base' });
      });
      global.Skeleton.remember('entities', { groups: order.map(function (k) { return groups[k].length; }) });
      order.forEach(function (key) {
        M.listBox.appendChild(S.h('div', { class: 'sp-group en-group' }, [S.h('span', { text: key ? M.typeName(key) : 'Sans type' }), S.h('span', { class: 'sp-count', text: String(groups[key].length) })]));
        groups[key]
          .slice()
          .sort(function (a, b) {
            return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
          })
          .forEach(function (e) {
            var on = e.id === M.state.selId && M.state.mode === 'entity';
            var sub = M.rowSummary(e);
            M.listBox.appendChild(
              S.h(
                'button',
                {
                  class: 'sp-row en-row' + (on ? ' is-on' : ''),
                  type: 'button',
                  'data-id': e.id,
                  'aria-current': on ? 'true' : null,
                  onclick: function (ev) {
                    M.openEntity(e.id, { focus: ev.detail === 0 });
                  },
                },
                [M.tile(e, 'sm'), S.h('span', { class: 'en-row-text' }, [S.h('span', { class: 'en-row-name', text: e.name }), sub ? S.h('span', { class: 'en-row-sub', text: sub }) : null])]
              )
            );
          });
      });
      M.appendAddRow();
      var sel = M.listBox.querySelector('.en-row.is-on');
      if (sel && opts && opts.reveal) sel.scrollIntoView({ block: 'nearest' });
      if (sel && opts && opts.focus) sel.focus();
      if (global.InsertGap) {
        global.InsertGap.watch(M.listBox, {
          item: '.en-row',
          mode: 'split',
          placeholder: 'Nom…',
          onCreate: function (title, info) {
            var src = info.anchor === 'below' ? (info.below || info.above) : (info.above || info.below);
            var id = src && src.getAttribute('data-id');
            M.createNamed(title, id && M.state.entities.filter(function (e) { return e.id === id; })[0]);
          },
        });
      }
    };
    M.createNamed = function createNamed(title, near) {
      var types = near && near.types && near.types.length ? near.types.slice(0, 1) : (M.state.typeFilter ? [M.state.typeFilter] : []);
      var created = S.EM().createEntity(M.state.schema, { name: title, types: types });
      M.state.entities = M.state.entities.concat([created]);
      M.state.selId = created.id;
      M.state.mode = 'entity';
      M.scheduleSave();
      M.paintList({ reveal: true });
      M.paintMain();
    };
    M.appendAddRow = function appendAddRow() {
      if (!global.AddRow) return;
      M.listBox.appendChild(global.AddRow.line({
        label: 'Nouvelle entité',
        onSubmit: function (title) {
          M.createNamed(title, null);
          var next = M.listBox.querySelector('.ar-input');
          if (next) next.focus({ preventScroll: true });
        },
      }));
    };
    M.rowSummary = function rowSummary(e) {
      var parts = [];
      var data = S.EM().effectiveData(M.state.entities, e, M.state.schema);
      Object.keys(data).forEach(function (cid) {
        Object.keys(data[cid]).forEach(function (key) {
          var f = S.EM().fieldOf(M.state.schema, cid + '.' + key);
          if (f && f.field.kind === 'ref') parts.push(S.EM().formatValue(f.field, data[cid][key], M.state.entities));
        });
      });
      var base = e.base ? S.EM().findById(M.state.entities, e.base) : null;
      if (base) parts.unshift('variante de ' + base.name);
      return parts.join(' · ');
    };
    M.findings = function findings() {
      if (!S.ES() || !(M.state.schema.systems || []).length) return [];
      return S.ES()
        .evaluate(M.state.schema, M.state.entities)
        .filter(function (f) {
          return !M.state.handled[f.id];
        });
    };
    M.paintWatch = function paintWatch() {
      var list = M.findings();
      M.watchBox.textContent = '';
      M.watchBox.hidden = !list.length;
      if (!list.length) return;
      var box = S.h('details', { class: 'en-watch-box' }, [S.h('summary', { class: 'en-watch-sum' }, [S.icon('eye'), list.length + ' à surveiller', S.icon('chevron-right')])]);
      if (M.state.watchOpen) box.setAttribute('open', '');
      box.addEventListener('toggle', function () {
        M.state.watchOpen = box.open;
      });
      list.forEach(function (f) {
        box.appendChild(
          S.h('button', { class: 'en-watch-row en-watch-row--' + f.level, type: 'button', onclick: function () { M.openEntity(f.entityId); } }, [S.icon(M.LEVEL_ICON[f.level] || 'info-circle'), S.h('span', { text: f.text })])
        );
      });
      M.watchBox.appendChild(box);
    };
    M.createFindingCard = function createFindingCard(f) {
      S.ET()
        .createBoardCard(M.t, f.card, 'Proposée par la règle « ' + f.systemName + ' » pour ' + f.entityName + '.')
        .then(
          function () {
            M.state.handled[f.id] = true;
            M.toast('Carte créée : ' + f.card);
            M.paintList();
            M.paintMain();
          },
          M.failure
        );
    };
    M.paintObserve = function paintObserve() {
      M.observeBox.textContent = '';
      M.observeBox.hidden = !M.state.ai || !S.ESAI();
      if (M.observeBox.hidden) return;
      var input = S.h('input', { class: 'en-input en-observe-input', placeholder: 'Dire ce qui a changé…', 'aria-label': 'Dire ce qui a changé' });
      input.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' || !input.value.trim()) return;
        var text = input.value;
        input.disabled = true;
        S.ESAI()
          .observe(M.t, M.state.schema, M.state.entities, text)
          .then(function (r) {
            input.disabled = false;
            if (r.error) return M.toast(r.error === 'no-ai' ? 'Aucun modèle configuré.' : 'Je n’ai pas pu analyser la phrase.', 'error');
            if (!r.changes.length) return M.toast('Rien à changer pour les entités nommées.');
            M.state.proposals = r.changes;
            input.value = '';
            M.paintObserve();
          });
      });
      M.observeBox.appendChild(S.h('div', { class: 'en-search' }, [S.icon('sparkles'), input]));
      M.state.proposals.forEach(function (c) {
        function done() {
          M.state.proposals = M.state.proposals.filter(function (x) {
            return x !== c;
          });
          M.paintObserve();
        }
        M.observeBox.appendChild(
          S.h('div', { class: 'en-proposal' }, [
            S.h('span', { class: 'en-proposal-text', text: c.entityName + ' · ' + c.label + ' : ' + (c.from === undefined ? '' : S.EM().formatValue(S.EM().fieldOf(M.state.schema, c.path).field, c.from, M.state.entities) + ' → ') + c.display }),
            S.h('button', {
              class: 'en-icon-btn',
              type: 'button',
              title: 'Appliquer',
              'aria-label': 'Appliquer',
              onclick: function () {
                M.state.entities = M.state.entities.map(function (e) {
                  return e.id === c.entityId ? S.EM().setValue(M.state.schema, e, c.path, c.value) : e;
                });
                M.scheduleSave();
                done();
                M.paintList();
                M.paintMain();
              },
            }, [S.icon('check')]),
            S.h('button', { class: 'en-icon-btn', type: 'button', title: 'Ignorer', 'aria-label': 'Ignorer', onclick: done }, [S.icon('x')]),
          ])
        );
      });
    };
    M.buildSide = function buildSide() {
      var newBtn = S.h(
        'button',
        {
          class: 'sp-btn sp-btn--accent',
          type: 'button',
          title: 'Nouvelle entité',
          'aria-label': 'Nouvelle entité',
          onclick: function () {
            M.openComposer();
          },
        },
        [S.icon('plus')]
      );
      M.els.side.appendChild(global.SidePanel.head({ title: 'Entités', extra: [M.els.status], actions: [] }));
      M.els.side.lastChild.appendChild(newBtn);
      M.els.side.appendChild(global.SidePanel.search(M.queryInput, { clear: M.clearBtn }));
      M.els.side.appendChild(S.h('div', { class: 'en-side-head' }, [M.typeBar, M.chipBox]));
      M.els.side.appendChild(M.watchBox);
      M.els.side.appendChild(M.listBox);
      M.els.side.appendChild(S.h('div', { class: 'en-side-foot sp-foot' }, [M.observeBox, M.schemaLink]));
      global.SidePanel.resizable(M.els.side, 'entities');
      M.bindMenus();
    };
    M.openComposer = function openComposer(opts) {
      if (!global.EntitiesComposerUI) return M.newEntity();
      var Composer = global.EntitiesInterviewUI && global.EntitiesInterview ? global.EntitiesInterviewUI : global.EntitiesComposerUI;
      Composer.open({
        t: M.t,
        schema: M.state.schema,
        entities: M.state.entities,
        initialText: opts && opts.text,
        initialTypes: (opts && opts.types) || (M.state.typeFilter ? [M.state.typeFilter] : []),
        onDone: function (res) {
          M.state.schema = res.schema;
          M.state.entities = res.entities;
          M.state.selId = res.rootId;
          M.state.mode = 'entity';
          M.setQuery('');
          M.scheduleSave();
          M.paintList({ reveal: true });
          M.paintMain();
          M.toast(res.created.length > 1 ? res.created.length + ' entités créées et liées.' : 'Entité créée.');
          if (res.again) M.openComposer({ types: res.types });
        },
      });
    };
    M.newEntity = function newEntity() {
      M.state.mode = 'entity';
      var name = 'Nouvelle entité';
      var n = 1;
      while (
        M.state.entities.some(function (e) {
          return e.name === name;
        })
      ) {
        n += 1;
        name = 'Nouvelle entité ' + n;
      }
      var types = M.state.typeFilter ? [M.state.typeFilter] : [];
      var e = S.EM().createEntity(M.state.schema, { name: name, types: types });
      M.state.entities = M.state.entities.concat([e]);
      M.state.selId = e.id;
      M.scheduleSave();
      M.paintList({ reveal: true });
      M.paintMain();
      var input = M.els.main.querySelector('.en-name');
      if (input) {
        input.focus();
        input.select();
      }
    };
    M.applyEntity = function applyEntity(fn, opts) {
      var cur = M.selected();
      if (!cur) return;
      var next;
      try {
        next = fn(cur);
      } catch (err) {
        M.toast('Modification refusée : ' + (err && err.message), 'error');
        return;
      }
      if (!next || next === cur) return;
      M.state.entities = M.state.entities.map(function (e) {
        return e.id === cur.id ? next : e;
      });
      M.scheduleSave();
      M.paintList();
      if (opts && opts.rebuild) M.paintMain();
      else M.paintHistory();
    };
    M.sectionIcon = function sectionIcon(id) {
      return M.SECTION_ICONS[id] || 'category';
    };
    M.section = function section(title, body, aside, cls, iconName, autoCollapsed) {
      var isClosed = M.collapsedSections[title] !== undefined ? !!M.collapsedSections[title] : !!autoCollapsed;
      var box = S.h('section', { class: 'en-sec' + (cls ? ' ' + cls : '') + (isClosed ? ' is-collapsed' : '') });
      var toggle = S.h('button', { class: 'en-sec-toggle', type: 'button', 'aria-expanded': String(!isClosed) }, [
        S.icon('chevron-right'),
        iconName ? S.h('span', { class: 'en-sec-ico' }, [S.icon(iconName)]) : null,
        S.h('h3', { class: 'en-sec-title', text: title }),
      ]);
      toggle.addEventListener('click', function () {
        var collapsed = !box.classList.contains('is-collapsed');
        box.classList.toggle('is-collapsed', collapsed);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        M.collapsedSections[title] = collapsed;
        try {
          localStorage.setItem(M.COLLAPSE_KEY, JSON.stringify(M.collapsedSections));
        } catch (err) {}
      });
      box.appendChild(S.h('header', { class: 'en-sec-head' }, [toggle, aside || null]));
      box.appendChild(body);
      return box;
    };
    M.disclosure = function disclosure(title, meta, open, onToggle) {
      return S.h('button', { class: 'en-disc' + (open ? ' is-open' : ''), type: 'button', 'aria-expanded': String(open), onclick: onToggle }, [
        S.h('span', { class: 'en-disc-title', text: title }),
        meta ? S.h('span', { class: 'en-disc-meta', text: meta }) : null,
        S.icon('chevron-right'),
      ]);
    };
    M.paintHistory = function paintHistory() {
      M.historyBox.textContent = '';
      var e = M.selected();
      if (!e) return;
      var list = e.history.slice().reverse();
      var open = !!M.state.openHistory;
      M.historyBox.appendChild(
        M.disclosure('Historique', list.length + (list.length > 1 ? ' changements' : ' changement'), open, function () {
          M.state.openHistory = !M.state.openHistory;
          M.paintHistory();
        })
      );
      if (!open) return;
      var set = S.h('div', { class: 'en-set' });
      list.forEach(function (entry) {
        var revertable = S.EM().isRevertable(entry);
        set.appendChild(
          S.h('div', { class: 'en-hist-row' + (entry.undoOf ? ' is-undo' : '') }, [
            S.h('span', { class: 'en-hist-when', title: entry.ts ? new Date(entry.ts).toLocaleString('fr-CA') : '', text: S.whenText(entry.ts) }),
            S.h('span', { class: 'en-hist-text', text: S.EM().describeEntry(M.state.schema, M.state.entities, entry) }),
            revertable
              ? S.h(
                  'button',
                  {
                    class: 'en-link',
                    type: 'button',
                    title: 'Annuler ce changement',
                    onclick: function () {
                      M.applyEntity(
                        function (cur) {
                          return S.EM().revertEntry(M.state.schema, cur, entry.id);
                        },
                        { rebuild: true }
                      );
                    },
                  },
                  [S.icon('arrow-back-up'), 'Annuler']
                )
              : null,
          ])
        );
      });
      M.historyBox.appendChild(set);
    };
    M.refCreateType = function refCreateType(field) {
      var ids = (field.refTypes || []).filter(function (id) {
        return S.EM().findById(M.state.schema.types, id);
      });
      return ids[0] || '';
    };
    M.refPicker = function refPicker(anchor, e, field, pool, picked, pick) {
      var tid = M.refCreateType(field);
      var kind = tid ? M.typeName(tid).toLowerCase() : 'entité';
      M.openPop(
        anchor,
        function (el, close) {
          var search = S.h('input', { class: 'en-pop-search', type: 'search', placeholder: 'Chercher ou créer…', 'aria-label': 'Chercher ou créer', autocomplete: 'off' });
          var listEl = S.h('div', { class: 'en-pop-list' });
          function create(name, typeId) {
            var ne;
            try {
              ne = S.EM().createEntity(M.state.schema, { name: name, types: typeId || tid ? [typeId || tid] : [] });
            } catch (err) {
              M.toast('Création refusée : ' + (err && err.message), 'error');
              return;
            }
            M.state.entities = M.state.entities.concat([ne]);
            M.scheduleSave();
            close();
            pick(ne.id);
            M.toast('« ' + name + ' » créé et lié.');
          }
          function fill() {
            var raw = search.value.trim();
            var q = S.fold(raw);
            listEl.textContent = '';
            var n = 0;
            var exact = false;
            pool.forEach(function (x) {
              if (picked.indexOf(x.id) >= 0) return;
              if (S.fold(x.name) === q) exact = true;
              if (q && S.fold(x.name + ' ' + (x.aliases || []).join(' ')).indexOf(q) < 0) return;
              n += 1;
              var ty = S.EM().findById(M.state.schema.types, x.types[0]);
              listEl.appendChild(
                M.menuItem((ty && ty.icon) || 'map-pin', x.name, ty ? ty.name : '', function () {
                  pick(x.id);
                })
              );
            });
            if (!n) listEl.appendChild(S.h('p', { class: 'en-list-hint', text: raw ? 'Aucun résultat.' : 'Rien à lier pour l’instant.' }));
            if (raw && !exact) {
              listEl.appendChild(
                M.menuItem('plus', 'Créer « ' + raw + ' »', 'Nouveau ' + kind, function () {
                  create(raw);
                })
              );
              if (field.alsoType) {
                listEl.appendChild(
                  M.menuItem('users-group', 'Créer « ' + raw + ' » comme groupe', 'Plusieurs personnes sous un nom', function () {
                    create(raw, field.alsoType);
                  })
                );
              }
            }
          }
          search.addEventListener('input', fill);
          search.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            var first = listEl.querySelector('.en-menu-item');
            if (first) first.click();
          });
          el.appendChild(search);
          el.appendChild(listEl);
          fill();
        },
        { className: 'en-pop--picker', role: 'dialog' }
      );
    };
    M.refControl = function refControl(e, field, aria, val, pool, commit) {
      var linked = val ? S.EM().findById(M.state.entities, val) : null;
      var trigger;
      function choose(id) {
        commit(id || '', true);
      }
      function openPicker() {
        M.refPicker(trigger, e, field, pool, [], choose);
      }
      if (!linked) {
        trigger = S.h(
          'button',
          { class: 'en-ctl en-ref-btn is-empty', type: 'button', 'aria-label': aria, 'aria-haspopup': 'dialog', onclick: openPicker },
          [S.h('span', { text: 'Cliquer pour ajouter…' }), S.icon('search')]
        );
        return trigger;
      }
      var ty = S.EM().findById(M.state.schema.types, linked.types[0]);
      trigger = S.h(
        'button',
        { class: 'en-ctl en-ref-btn', type: 'button', 'aria-label': aria + ' : changer', title: 'Changer', 'aria-haspopup': 'dialog', onclick: openPicker },
        [S.icon((ty && ty.icon) || 'map-pin'), S.h('span', { class: 'en-ref-name', text: linked.name }), S.icon('selector')]
      );
      var row = S.h('div', { class: 'en-ref-row' }, [trigger]);
      function mini(ic, label, fn) {
        return S.h('button', { class: 'en-iconlink en-ref-act', type: 'button', title: label, 'aria-label': label, onclick: fn }, [S.icon(ic)]);
      }
      row.appendChild(
        mini('pencil', 'Renommer', function () {
          var inp = S.h('input', { class: 'en-ctl', type: 'text', maxlength: '80', 'aria-label': 'Renommer ' + linked.name, value: linked.name });
          var done = false;
          function save(apply) {
            if (done) return;
            done = true;
            if (apply && inp.value.trim() && inp.value.trim() !== linked.name) {
              M.state.entities = M.state.entities.map(function (x) {
                return x.id === linked.id ? S.EM().renameEntity(x, inp.value) : x;
              });
              M.scheduleSave();
            }
            commit(val, true);
          }
          inp.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') save(true);
            else if (ev.key === 'Escape') save(false);
          });
          inp.addEventListener('blur', function () { save(true); });
          row.textContent = '';
          row.appendChild(inp);
          inp.focus();
          inp.select();
        })
      );
      row.appendChild(mini('arrow-up-right', 'Ouvrir ' + linked.name, function () { M.openEntity(linked.id); }));
      row.appendChild(mini('x', 'Retirer le lien', function () { choose(''); }));
      return row;
    };
    M.fieldInput = function fieldInput(e, comp, field) {
      var path = comp.id + '.' + field.key;
      var val = S.EM().effectiveValue(M.state.entities, e, path, M.state.schema);
      function commit(v, rebuild) {
        M.applyEntity(
          function (cur) {
            return S.EM().setValue(M.state.schema, cur, path, v);
          },
          { rebuild: !!rebuild || !!e.base || M.hasDefaults(e) }
        );
      }
      function selectWrap(sel) {
        return S.h('span', { class: 'en-select' }, [sel]);
      }
      var aria = comp.name + ' : ' + field.label;
      if (field.kind === 'bool') {
        return S.h('input', {
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
        var sel = S.h('select', { class: 'en-ctl', 'aria-label': aria, onchange: function () { commit(sel.value); } });
        sel.appendChild(S.h('option', { value: '', text: '—' }));
        (field.options || []).forEach(function (o) {
          sel.appendChild(S.h('option', { value: o, text: o }));
        });
        sel.value = val || '';
        return selectWrap(sel);
      }
      if (field.kind === 'ref' || field.kind === 'refs') {
        var pool = M.state.entities
          .filter(function (x) {
            if (x.id === e.id) return false;
            if (!field.refTypes || !field.refTypes.length) return true;
            return field.refTypes.some(function (ty) {
              return S.EM().isA(M.state.schema, x, ty);
            });
          })
          .sort(function (a, b) {
            return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
          });
        if (field.kind === 'ref') return M.refControl(e, field, aria, val, pool, commit);
        var cur = Array.isArray(val) ? val.slice() : [];
        var wrap = S.h('div', { class: 'en-refs' });
        cur.forEach(function (id) {
          var o = S.EM().findById(M.state.entities, id);
          wrap.appendChild(
            S.h('span', { class: 'en-token' }, [
              o ? o.name : '?',
              S.h(
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
                [S.icon('x')]
              ),
            ])
          );
        });
        var addBtn = S.h(
          'button',
          {
            class: 'en-ctl en-ctl--add',
            type: 'button',
            'aria-label': aria + ' : ajouter',
            'aria-haspopup': 'dialog',
            onclick: function () {
              M.refPicker(addBtn, e, field, pool, cur, function (id) {
                if (id && cur.indexOf(id) < 0) commit(cur.concat([id]), true);
              });
            },
          },
          [S.icon('plus'), cur.length ? 'Ajouter' : 'Ajouter…']
        );
        wrap.appendChild(addBtn);
        return wrap;
      }
      if (field.kind === 'multi') {
        var box = S.h('div', { class: 'en-pills' });
        (field.options || []).forEach(function (o) {
          var on = (val || []).indexOf(o) >= 0;
          box.appendChild(
            S.h(
              'button',
              {
                class: 'en-pill' + (on ? ' is-on' : ''),
                type: 'button',
                'aria-pressed': String(on),
                onclick: function () {
                  var now = (S.EM().effectiveValue(M.state.entities, M.selected() || e, path, M.state.schema) || []).filter(function (x) {
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
        var ta = S.h('textarea', { class: 'en-ctl en-area', rows: '3', maxlength: '1500', placeholder: 'Ajouter…', 'aria-label': aria, onchange: function () { commit(ta.value); } });
        ta.value = val == null ? '' : String(val);
        return ta;
      }
      if (field.kind === 'level' && global.EntitiesLevelUI) {
        // a gauge: a slider between 0 and the capacity (how full, how charged)
        return global.EntitiesLevelUI.create({
          field: field,
          label: aria,
          value: val,
          bounds: S.EM().levelBounds(field, function (k) {
            return S.EM().effectiveValue(M.state.entities, e, comp.id + '.' + k, M.state.schema);
          }),
          onChange: function (v) { commit(v); },
        });
      }
      var type = field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : field.kind === 'url' ? 'url' : 'text';
      var inp = S.h('input', {
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
        return S.h('div', { class: 'en-unit' }, [
          inp,
          S.h('a', { class: 'en-iconlink', href: String(val), target: '_blank', rel: 'noopener noreferrer', title: 'Ouvrir le lien', 'aria-label': 'Ouvrir le lien' }, [S.icon('arrow-up-right')]),
        ]);
      }
      return field.unit ? S.h('div', { class: 'en-unit' }, [inp, S.h('span', { class: 'en-unit-sfx', text: field.unit })]) : inp;
    };
    M.hasDefaults = function hasDefaults(e) {
      return Object.keys(S.EM().archetypeDefaults(M.state.schema, e.types)).length > 0;
    };
    M.fieldMeta = function fieldMeta(e, comp, f) {
      var path = comp.id + '.' + f.key;
      var meta = S.h('span', { class: 'en-prop-meta' });
      var origin = S.EM().originOf(M.state.entities, e, path, M.state.schema);
      var base = e.base ? S.EM().findById(M.state.entities, e.base) : null;
      var archDefault = S.EM().archetypeDefaults(M.state.schema, e.types);
      var hasArch = !!(archDefault[comp.id] && archDefault[comp.id][f.key] !== undefined);
      function resetButton(title) {
        return S.h(
          'button',
          {
            class: 'en-reset',
            type: 'button',
            title: title,
            'aria-label': 'Réinitialiser : ' + title,
            onclick: function () {
              M.applyEntity(
                function (cur) {
                  return S.EM().setValue(M.state.schema, cur, path, undefined);
                },
                { rebuild: true }
              );
            },
          },
          [S.icon('arrow-back-up')]
        );
      }
      if (origin === 'archetype') {
        meta.appendChild(S.h('span', { class: 'en-prov', title: 'Valeur par défaut du type : la modifier ici crée une valeur propre à cette entité' }, [S.icon('sparkles'), 'par défaut']));
        return meta;
      }
      if (!base) {
        if (origin === 'own' && hasArch) meta.appendChild(resetButton('Revenir à la valeur par défaut du type'));
        return meta;
      }
      if (origin && origin !== 'own') {
        var from = (S.EM().findById(M.state.entities, origin) || { name: '?' }).name;
        meta.appendChild(S.h('span', { class: 'en-prov', title: 'Hérité de « ' + from + ' » : la modifier ici crée une valeur propre' }, [S.icon('git-fork'), 'hérité']));
      } else if (origin === 'own' && S.EM().effectiveValue(M.state.entities, base, path) !== undefined) {
        meta.appendChild(resetButton('Revenir à la valeur du modèle'));
      }
      return meta;
    };
    M.propRow = function propRow(e, comp, f) {
      var control = M.fieldInput(e, comp, f);
      var label = S.h('label', { class: 'en-prop-label', text: f.label });
      var focusable = control.matches('input,select,textarea') ? control : control.querySelector('input,select,textarea');
      if (focusable) {
        M.fieldUid += 1;
        focusable.id = 'en-f' + M.fieldUid;
        label.setAttribute('for', focusable.id);
      }
      var stack = f.kind === 'longtext' || f.kind === 'multi' || f.kind === 'refs';
      return S.h('div', { class: 'en-prop' + (stack ? ' en-prop--stack' : '') + (f.kind === 'bool' ? ' en-prop--switch' : '') }, [label, S.h('div', { class: 'en-prop-value' }, [control]), M.fieldMeta(e, comp, f)]);
    };
    M.cloneSelected = function cloneSelected(detach) {
      var cur = M.selected();
      if (!cur) return;
      var copy;
      try {
        copy = S.EM().cloneEntity(M.state.schema, M.state.entities, cur.id, { detach: detach });
      } catch (err) {
        M.toast('Copie refusée : ' + (err && err.message), 'error');
        return;
      }
      M.state.entities = M.state.entities.concat([copy]);
      M.state.selId = copy.id;
      M.scheduleSave();
      M.paintList({ reveal: true });
      M.paintMain();
      var input = M.els.main.querySelector('.en-name');
      if (input) {
        input.focus();
        input.select();
      }
    };
    M.openEntity = function openEntity(id, opts) {
      M.state.selId = id;
      M.state.mode = 'entity';
      M.state.confirm = '';
      M.state.linkOpen = false;
      M.paintList({ reveal: true, focus: opts && opts.focus });
      M.paintMain();
    };
    M.entityChip = function entityChip(other) {
      return S.h('button', { class: 'en-ref', type: 'button', onclick: function () { M.openEntity(other.id); } }, [M.tile(other, 'xs'), S.h('span', { text: other.name })]);
    };
    M.typePicker = function typePicker(anchor, e) {
      M.openPop(
        anchor,
        function (el, close) {
          var types = M.state.schema.types.slice().sort(function (a, b) {
            return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
          });
          var search = types.length > 7 ? S.h('input', { class: 'en-pop-search', type: 'search', placeholder: 'Chercher un type', 'aria-label': 'Chercher un type', autocomplete: 'off' }) : null;
          var listEl = S.h('div', { class: 'en-pop-list' });
          function fill() {
            var q = search ? S.fold(search.value) : '';
            listEl.textContent = '';
            var n = 0;
            types.forEach(function (ty) {
              if (q && S.fold(ty.name + ' ' + ty.aliases.join(' ')).indexOf(q) < 0) return;
              n += 1;
              var has = e.types.indexOf(ty.id) >= 0;
              var nat = S.EM().natureById(S.EM().natureOfType(M.state.schema, ty.id));
              listEl.appendChild(
                M.menuItem(
                  ty.icon || (nat && nat.icon) || 'tag',
                  ty.name,
                  nat ? nat.name : '',
                  function () {
                    M.applyEntity(
                      function (cur) {
                        var set = cur.types.filter(function (x) {
                          return x !== ty.id;
                        });
                        if (!has) set.push(ty.id);
                        return S.EM().setTypes(M.state.schema, cur, set);
                      },
                      { rebuild: true }
                    );
                  },
                  { check: has }
                )
              );
            });
            if (!n) listEl.appendChild(S.h('p', { class: 'en-list-hint', text: 'Aucun type ne correspond.' }));
          }
          if (search) {
            search.addEventListener('input', fill);
            el.appendChild(search);
          }
          el.appendChild(listEl);
          el.appendChild(
            S.h('div', { class: 'en-pop-foot' }, [
              M.menuItem('adjustments', 'Gérer les types…', '', function () {
                M.state.mode = 'schema';
                M.paintList();
                M.paintMain();
              }),
            ])
          );
          fill();
        },
        { className: 'en-pop--picker', role: 'dialog' }
      );
    };
    },
    run: function (M) {
    M.state = {
      data: null,
      schema: S.EM().defaultSchema(),
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
    M.saveTimer = null;
    M.saving = false;
    M.dirty = false;
    M.root.textContent = '';
    M.root.classList.add('en-root');
    M.els = {
      banner: S.h('div', { class: 'en-banner', hidden: true }),
      side: S.h('aside', { class: 'sp en-side' }),
      main: S.h('main', { class: 'en-main' }),
      toast: S.h('div', { class: 'en-toast', hidden: true, role: 'status' }),
      status: S.h('span', { class: 'en-status' }),
    };
    M.root.appendChild(M.els.banner);
    M.root.appendChild(S.h('div', { class: 'en-body' }, [M.els.side, M.els.main]));
    M.root.appendChild(M.els.toast);
    M.toastTimer = null;
    M.pop = null;
    M.listBox = S.h('div', { class: 'en-list' });
    M.chipBox = S.h('div', { class: 'en-chips' });
    M.typeBar = S.h('div', { class: 'en-filters', role: 'group', 'aria-label': 'Filtrer par type', hidden: true });
    M.clearBtn = S.h(
      'button',
      {
        class: 'sp-search-clear',
        type: 'button',
        hidden: true,
        'aria-label': 'Effacer la recherche',
        onclick: function () {
          M.setQuery('');
          M.queryInput.focus();
        },
      },
      [S.icon('x')]
    );
    M.queryInput = S.h('input', {
      class: 'en-search-input',
      type: 'search',
      placeholder: 'Rechercher…',
      title: 'Cherchez un nom, ou décrivez ce que vous voulez : « mes plantes au travail »',
      'aria-label': 'Rechercher les entités',
      autocomplete: 'off',
      oninput: function () {
        M.setQuery(M.queryInput.value, true);
      },
      onkeydown: function (ev) {
        if (ev.key === 'Escape' && M.queryInput.value) {
          ev.stopPropagation();
          M.setQuery('');
        } else if (ev.key === 'ArrowDown') {
          var first = M.listBox.querySelector('.en-row');
          if (first) {
            ev.preventDefault();
            first.focus();
          }
        }
      },
    });
    M.listBox.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      var rows = Array.prototype.slice.call(M.listBox.querySelectorAll('.en-row'));
      var i = rows.indexOf(document.activeElement);
      if (i < 0) return;
      ev.preventDefault();
      if (ev.key === 'ArrowUp' && i === 0) return M.queryInput.focus();
      var next = rows[ev.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : i - 1];
      if (next) next.focus();
    });
    M.schemaLink = S.h(
      'button',
      {
        class: 'sp-row en-side-link',
        type: 'button',
        onclick: function () {
          M.state.mode = 'schema';
          M.paintList();
          M.paintMain();
        },
      },
      [S.icon('adjustments'), 'Types et composants']
    );
    M.watchBox = S.h('div', { class: 'en-watch' });
    M.observeBox = S.h('div', { class: 'en-observe', hidden: true });
    M.LEVEL_ICON = { alert: 'alert-circle', warn: 'alert-triangle', info: 'info-circle' };
    M.COLLAPSE_KEY = 'tp-entities-collapsed-sections';
    M.collapsedSections = (function () {
      try {
        return JSON.parse(localStorage.getItem(M.COLLAPSE_KEY) || '{}') || {};
      } catch (err) {
        return {};
      }
    })();
    M.SECTION_ICONS = {
      propriete: 'key', adresse: 'map-pin', matiere: 'flask', provenance: 'world', acquisition: 'shopping-cart', location: 'map-pin',
      produit: 'package', contenant: 'box', identification: 'id', condition: 'heart-rate-monitor', vivant: 'leaf', personne: 'user',
      emploi: 'briefcase', organisation: 'building', geographie: 'map', pays: 'flag', construction: 'building', espace: 'ruler-measure',
      temps: 'clock', concept: 'bulb', regle: 'gavel', names: 'tag', contexte: 'sitemap', liens: 'link',
    };
    M.historyBox = S.h('section', { class: 'en-sec en-sec--disc' });
    M.fieldUid = 0;
    }
  });
})(typeof window !== 'undefined' ? window : this);
