/*
 * Role: UI of the Entities view ("Entités"): define rich things once ("Ficus", "Hôtel de Ville"), give them
 * types, typed properties, links and a history, then find them by describing them ("mes plantes au travail").
 *  - left: filter box (free text, or a request the model resolves into type + place chips) and the entities
 *  - right: the entity (name, aliases, types, properties per component, links, history with per-entry undo)
 *  - "Schéma": the components (groups of typed fields) and types (bundles of components)
 * Data + writes: EntitiesTrello; pure logic (schema, mutations, history, query, text resolution): EntitiesModel.
 *
 * Contents
 *   1. helpers   2. mount: state + skeleton   3. sidebar   4. entity editor   5. schema editor
 *   6. saving    7. boot
 */
(function (global) {
  'use strict';

  var EM = function () {
    return global.EntitiesModel;
  };
  var ET = function () {
    return global.EntitiesTrello;
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

    /* ── 3. Sidebar ─────────────────────────────────────────────── */

    var listBox = h('div', { class: 'en-list' });
    var chipBox = h('div', { class: 'en-chips' });
    var queryInput = h('input', {
      class: 'en-input',
      type: 'search',
      placeholder: 'Filtrer, ou décrire : mes plantes au travail',
      'aria-label': 'Filtrer les entités',
      oninput: function () {
        state.query = queryInput.value;
        paintList();
      },
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
          return e.types.indexOf(state.typeFilter) >= 0;
        });
      }
      return { list: list, info: info && info.recognized ? info : null };
    }

    function paintList() {
      var vis = visibleEntities();
      chipBox.textContent = '';
      if (vis.info) {
        vis.info.mentions.forEach(function (m) {
          var label = m.kind === 'type' ? 'Type : ' + m.name : m.kind === 'entity' ? m.name : 'Valeur : ' + m.name;
          chipBox.appendChild(h('span', { class: 'en-chip en-chip--' + m.kind, text: label }));
        });
        if (!vis.list.length) chipBox.appendChild(h('span', { class: 'en-hint', text: 'Aucune entité ne correspond.' }));
      }
      listBox.textContent = '';
      if (!state.loaded) {
        listBox.appendChild(h('p', { class: 'en-hint', text: 'Chargement…' }));
        return;
      }
      if (!state.entities.length) {
        listBox.appendChild(h('p', { class: 'en-hint', text: 'Aucune entité pour l’instant.' }));
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
      order.forEach(function (key) {
        listBox.appendChild(h('div', { class: 'en-group', text: key ? typeName(key) : 'Sans type' }));
        groups[key].forEach(function (e) {
          listBox.appendChild(
            h(
              'button',
              {
                class: 'en-row' + (e.id === state.selId && state.mode === 'entity' ? ' is-on' : ''),
                onclick: function () {
                  state.selId = e.id;
                  state.mode = 'entity';
                  state.confirm = '';
                  paintList();
                  paintMain();
                },
              },
              [h('span', { class: 'en-row-name', text: e.name }), h('span', { class: 'en-row-sub', text: rowSummary(e) })]
            )
          );
        });
      });
    }

    function rowSummary(e) {
      var parts = [];
      var data = EM().effectiveData(state.entities, e);
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

    function buildSide() {
      var typeSel = h('select', {
        class: 'en-input',
        'aria-label': 'Filtrer par type',
        onchange: function () {
          state.typeFilter = typeSel.value;
          paintList();
        },
      });
      function fillTypes() {
        typeSel.textContent = '';
        typeSel.appendChild(h('option', { value: '', text: 'Tous les types' }));
        state.schema.types.forEach(function (ty) {
          typeSel.appendChild(h('option', { value: ty.id, text: ty.name }));
        });
        typeSel.value = state.typeFilter;
      }
      buildSide.fillTypes = fillTypes;
      fillTypes();
      els.side.appendChild(
        h('div', { class: 'en-side-head' }, [
          h('div', { class: 'en-title' }, [icon('stack-2'), h('span', { text: 'Entités' }), els.status]),
          h('button', { class: 'en-btn en-btn--primary en-btn--block', onclick: function () { openComposer(); } }, [icon('wand'), 'Composer une entité']),
          queryInput,
          typeSel,
          chipBox,
        ])
      );
      els.side.appendChild(listBox);
      els.side.appendChild(
        h('div', { class: 'en-side-foot' }, [
          h('button', { class: 'en-btn en-btn--primary', onclick: function () { openComposer(); } }, [icon('wand'), 'Composer']),
          h('button', { class: 'en-btn', title: 'Créer une entité vide', onclick: newEntity }, [icon('plus'), 'Vide']),
          h(
            'button',
            {
              class: 'en-btn',
              onclick: function () {
                state.mode = 'schema';
                paintList();
                paintMain();
              },
            },
            [icon('settings'), 'Schéma']
          ),
        ])
      );
    }

    /** Opens the guided interview; what it creates (and any new type) is saved like any other edit. */
    function openComposer(opts) {
      if (!global.EntitiesComposerUI) return newEntity();
      global.EntitiesComposerUI.open({
        schema: state.schema,
        entities: state.entities,
        initialText: opts && opts.text,
        initialTypes: (opts && opts.types) || (state.typeFilter ? [state.typeFilter] : []),
        onDone: function (res) {
          state.schema = res.schema;
          state.entities = res.entities;
          state.selId = res.rootId;
          state.mode = 'entity';
          state.query = '';
          queryInput.value = '';
          scheduleSave();
          buildSide.fillTypes();
          paintList();
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
      paintList();
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

    var historyBox = h('div', { class: 'en-history' });

    function paintHistory() {
      historyBox.textContent = '';
      var e = selected();
      if (!e) return;
      historyBox.appendChild(h('h3', { class: 'en-h', text: 'Historique' }));
      var list = e.history.slice().reverse();
      list.forEach(function (entry) {
        var revertable = EM().isRevertable(entry);
        var when = entry.ts ? new Date(entry.ts).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' }) : '';
        historyBox.appendChild(
          h('div', { class: 'en-hist-row' + (entry.undoOf ? ' is-undo' : '') }, [
            h('span', { class: 'en-hist-when', text: when }),
            h('span', { class: 'en-hist-text', text: EM().describeEntry(state.schema, state.entities, entry) }),
            revertable
              ? h(
                  'button',
                  {
                    class: 'en-link',
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
    }

    function fieldInput(e, comp, field) {
      var path = comp.id + '.' + field.key;
      var val = EM().effectiveValue(state.entities, e, path);
      function commit(v) {
        applyEntity(
          function (cur) {
            return EM().setValue(state.schema, cur, path, v);
          },
          { rebuild: !!e.base }
        );
      }
      var aria = comp.name + ' : ' + field.label;
      if (field.kind === 'bool') {
        return h('input', {
          type: 'checkbox',
          'aria-label': aria,
          checked: val ? true : null,
          onchange: function (ev) {
            commit(ev.target.checked ? true : '');
          },
        });
      }
      if (field.kind === 'choice') {
        var sel = h('select', { class: 'en-input', 'aria-label': aria, onchange: function () { commit(sel.value); } });
        sel.appendChild(h('option', { value: '', text: '—' }));
        (field.options || []).forEach(function (o) {
          sel.appendChild(h('option', { value: o, text: o }));
        });
        sel.value = val || '';
        return sel;
      }
      if (field.kind === 'ref' || field.kind === 'refs') {
        var pool = state.entities.filter(function (x) {
          if (x.id === e.id) return false;
          if (!field.refTypes || !field.refTypes.length) return true;
          return x.types.some(function (ty) {
            return field.refTypes.indexOf(ty) >= 0;
          });
        });
        if (field.kind === 'ref') {
          var rs = h('select', { class: 'en-input', 'aria-label': aria, onchange: function () { commit(rs.value); } });
          rs.appendChild(h('option', { value: '', text: '—' }));
          pool.forEach(function (x) {
            rs.appendChild(h('option', { value: x.id, text: x.name }));
          });
          rs.value = val || '';
          return rs;
        }
        var ms = h('select', { class: 'en-input', multiple: true, size: Math.min(4, Math.max(2, pool.length)), 'aria-label': aria });
        pool.forEach(function (x) {
          var o = h('option', { value: x.id, text: x.name });
          if ((val || []).indexOf(x.id) >= 0) o.selected = true;
          ms.appendChild(o);
        });
        ms.addEventListener('change', function () {
          commit(
            Array.prototype.filter
              .call(ms.options, function (o) {
                return o.selected;
              })
              .map(function (o) {
                return o.value;
              })
          );
        });
        return ms;
      }
      var type = field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text';
      var inp = h('input', {
        class: 'en-input',
        type: type,
        step: field.kind === 'number' ? 'any' : null,
        'aria-label': aria,
        value: val == null ? '' : String(val),
        onchange: function () {
          commit(inp.value);
        },
      });
      return inp;
    }

    /** Label of a field with its provenance: inherited from the archetype, or overridden here (resettable). */
    function fieldLabel(e, comp, f) {
      var path = comp.id + '.' + f.key;
      var row = h('div', { class: 'en-flabel' }, [h('label', { text: f.label })]);
      if (!e.base) return row;
      var origin = EM().originOf(state.entities, e, path);
      var base = EM().findById(state.entities, e.base);
      if (origin && origin !== 'own') {
        row.appendChild(h('span', { class: 'en-badge en-badge--inherited', title: 'Suit le modèle : modifier ici crée une valeur propre' }, [icon('git-fork'), 'hérité de ' + (EM().findById(state.entities, origin) || { name: '?' }).name]));
      } else if (origin === 'own' && base && EM().effectiveValue(state.entities, base, path) !== undefined) {
        row.appendChild(h('span', { class: 'en-badge en-badge--own' }, ['modifié']));
        row.appendChild(
          h(
            'button',
            {
              class: 'en-link',
              title: 'Revenir à la valeur du modèle',
              onclick: function () {
                applyEntity(
                  function (cur) {
                    return EM().setValue(state.schema, cur, path, undefined);
                  },
                  { rebuild: true }
                );
              },
            },
            [icon('arrow-back-up'), 'Réinitialiser']
          )
        );
      } else if (origin === 'own') {
        row.appendChild(h('span', { class: 'en-badge en-badge--own' }, ['propre']));
      }
      return row;
    }

    /** Archetype selector, clone buttons and the list of variants. */
    function archetypeCard(e) {
      var base = e.base ? EM().findById(state.entities, e.base) : null;
      var sel = h('select', { class: 'en-input', 'aria-label': 'Modèle (archétype)' });
      sel.appendChild(h('option', { value: '', text: 'Aucun (entité indépendante)' }));
      state.entities.forEach(function (x) {
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
      var variants = EM().variantsOf(state.entities, e.id);
      var card = h('div', { class: 'en-card' }, [
        h('h3', { class: 'en-h', text: 'Modèle et variantes' }),
        h('div', { class: 'en-field' }, [h('label', { text: 'Basé sur' }), sel]),
        h('p', {
          class: 'en-hint',
          text: base
            ? 'Les valeurs non modifiées ici suivent « ' + base.name + ' » ; ce que vous changez ici n’affecte jamais « ' + base.name + ' » ni ses autres variantes.'
            : 'Choisissez un modèle pour hériter de ses valeurs et ne stocker que vos différences.',
        }),
      ]);
      var actions = h('div', { class: 'en-actions' }, [
        h('button', { class: 'en-btn', title: 'Nouvelle entité qui hérite de celle-ci', onclick: function () { cloneSelected(false); } }, [icon('git-fork'), 'Créer une variante']),
        h('button', { class: 'en-btn', title: 'Copie sans lien avec l’original', onclick: function () { cloneSelected(true); } }, [icon('copy'), 'Copie indépendante']),
      ]);
      if (base) {
        actions.appendChild(
          h(
            'button',
            {
              class: 'en-btn',
              title: 'Garde les valeurs actuelles mais ne suit plus le modèle',
              onclick: function () {
                applyEntity(
                  function (cur) {
                    return EM().detachEntity(state.entities, cur);
                  },
                  { rebuild: true }
                );
              },
            },
            [icon('unlink'), 'Détacher du modèle']
          )
        );
      }
      card.appendChild(actions);
      if (variants.length) {
        card.appendChild(h('div', { class: 'en-flabel' }, [h('label', { text: 'Variantes (' + variants.length + ')' })]));
        var list = h('div', { class: 'en-variants' });
        variants.forEach(function (v) {
          list.appendChild(
            h(
              'button',
              {
                class: 'en-btn',
                onclick: function () {
                  state.selId = v.id;
                  paintList();
                  paintMain();
                },
              },
              [v.name]
            )
          );
        });
        card.appendChild(list);
      }
      return card;
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
      paintList();
      paintMain();
      var input = els.main.querySelector('.en-name');
      if (input) {
        input.focus();
        input.select();
      }
    }

    function paintMain() {
      els.main.textContent = '';
      if (state.mode === 'schema') return paintSchema();
      var e = selected();
      if (!e) {
        els.main.appendChild(emptyState());
        return;
      }
      var nameInput = h('input', {
        class: 'en-input en-name',
        'aria-label': 'Nom',
        value: e.name,
        onchange: function () {
          applyEntity(function (cur) {
            return EM().renameEntity(cur, nameInput.value);
          });
          nameInput.value = (selected() || e).name;
        },
      });
      var aliasInput = h('input', {
        class: 'en-input',
        'aria-label': 'Alias',
        placeholder: 'ex. travail, work, bureau',
        value: e.aliases.join(', '),
        onchange: function () {
          applyEntity(function (cur) {
            return EM().setAliases(cur, splitList(aliasInput.value));
          });
        },
      });
      var typeBox = h('div', { class: 'en-checks' });
      state.schema.types.forEach(function (ty) {
        typeBox.appendChild(
          h('label', { class: 'en-check' }, [
            h('input', {
              type: 'checkbox',
              checked: e.types.indexOf(ty.id) >= 0 ? true : null,
              onchange: function (ev) {
                applyEntity(
                  function (cur) {
                    var set = cur.types.filter(function (x) {
                      return x !== ty.id;
                    });
                    if (ev.target.checked) set.push(ty.id);
                    return EM().setTypes(state.schema, cur, set);
                  },
                  { rebuild: true }
                );
              },
            }),
            ty.name,
          ])
        );
      });
      els.main.appendChild(
        h('div', { class: 'en-card' }, [
          h('div', { class: 'en-field' }, [h('label', { text: 'Nom' }), nameInput]),
          h('div', { class: 'en-field' }, [h('label', { text: 'Alias (séparés par des virgules)' }), aliasInput]),
          h('div', { class: 'en-field' }, [h('label', { text: 'Types' }), typeBox]),
        ])
      );
      els.main.appendChild(archetypeCard(e));
      EM()
        .componentIdsOf(state.schema, e)
        .forEach(function (cid) {
          var comp = EM().findById(state.schema.components, cid);
          if (!comp) return;
          var card = h('div', { class: 'en-card' }, [h('h3', { class: 'en-h', text: comp.name })]);
          if (!comp.fields.length) card.appendChild(h('p', { class: 'en-hint', text: 'Ce composant n’a aucun champ (voir Schéma).' }));
          comp.fields.forEach(function (f) {
            card.appendChild(h('div', { class: 'en-field' }, [fieldLabel(e, comp, f), fieldInput(e, comp, f)]));
          });
          els.main.appendChild(card);
        });
      els.main.appendChild(linksCard(e));
      els.main.appendChild(
        h('div', { class: 'en-card' }, [historyBox])
      );
      paintHistory();
      els.main.appendChild(
        h('div', { class: 'en-danger' }, [
          h(
            'button',
            {
              class: 'en-btn en-btn--danger',
              onclick: function () {
                if (state.confirm !== e.id) {
                  state.confirm = e.id;
                  paintMain();
                  return;
                }
                state.entities = EM().deleteEntity(state.schema, state.entities, e.id);
                state.selId = null;
                state.confirm = '';
                scheduleSave();
                paintList();
                paintMain();
              },
            },
            [icon('trash'), state.confirm === e.id ? 'Confirmer la suppression (retire aussi les liens)' : 'Supprimer l’entité']
          ),
        ])
      );
    }

    function emptyState() {
      var box = h('div', { class: 'en-empty' }, [
        icon('stack-2'),
        h('p', { text: 'Choisissez une entité, ou créez-en une.' }),
        h('button', { class: 'en-btn en-btn--primary', onclick: function () { openComposer(); } }, [icon('wand'), 'Composer une entité']),
        h('p', {
          class: 'en-hint',
          text: 'Une entité est un objet nommé (« Ficus », « Hôtel de Ville ») avec des types, des propriétés, des liens et un historique. L’assistant s’en sert pour comprendre « arroser mes plantes au travail ».',
        }),
      ]);
      var hasPlant = state.schema.types.some(function (ty) {
        return ty.id === 'plante';
      });
      if (!hasPlant) {
        box.appendChild(
          h(
            'button',
            { class: 'en-btn', onclick: addPlantExample },
            [icon('plant'), 'Ajouter le type « Plante » (lieu + entretien)']
          )
        );
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

    function linksCard(e) {
      var card = h('div', { class: 'en-card' }, [h('h3', { class: 'en-h', text: 'Liens' })]);
      e.relations.forEach(function (r) {
        var other = EM().findById(state.entities, r.to);
        card.appendChild(
          h('div', { class: 'en-link-row' }, [
            h('span', { text: r.type + ' → ' + (other ? other.name : '?') }),
            h(
              'button',
              {
                class: 'en-link',
                'aria-label': 'Retirer le lien',
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
          ])
        );
      });
      EM()
        .linksOf(state.schema, state.entities, e.id)
        .filter(function (l) {
          return l.dir === 'in';
        })
        .forEach(function (l) {
          var other = EM().findById(state.entities, l.other);
          card.appendChild(
            h('div', { class: 'en-link-row en-link-row--in' }, [
              h('span', { text: (other ? other.name : '?') + ' ← ' + l.via }),
              other
                ? h(
                    'button',
                    {
                      class: 'en-link',
                      onclick: function () {
                        state.selId = other.id;
                        paintList();
                        paintMain();
                      },
                    },
                    ['Ouvrir']
                  )
                : null,
            ])
          );
        });
      var relType = h('input', { class: 'en-input', placeholder: 'Type de lien (ex. contient, fait partie de)', 'aria-label': 'Type de lien' });
      var relTo = h('select', { class: 'en-input', 'aria-label': 'Entité liée' });
      state.entities.forEach(function (x) {
        if (x.id !== e.id) relTo.appendChild(h('option', { value: x.id, text: x.name }));
      });
      card.appendChild(
        h('div', { class: 'en-link-add' }, [
          relType,
          relTo,
          h(
            'button',
            {
              class: 'en-btn',
              onclick: function () {
                if (!relTo.value) return;
                applyEntity(
                  function (cur) {
                    return EM().addRelation(cur, relType.value, relTo.value);
                  },
                  { rebuild: true }
                );
              },
            },
            [icon('link'), 'Lier']
          ),
        ])
      );
      return card;
    }

    /* ── 5. Schema editor ───────────────────────────────────────── */

    function setSchema(next) {
      state.schema = next;
      state.entities = state.entities.map(function (e) {
        return EM().normalizeEntity(e, next);
      });
      scheduleSave();
      buildSide.fillTypes();
      paintList();
      paintMain();
    }

    function paintSchema() {
      var main = els.main;
      main.appendChild(
        h('div', { class: 'en-card' }, [
          h('h3', { class: 'en-h', text: 'Schéma' }),
          h('p', {
            class: 'en-hint',
            text: 'Un composant est un groupe de champs typés (ex. Entretien : fréquence, dernier arrosage). Un type regroupe des composants (ex. Plante = Lieu + Entretien). Une entité a un ou plusieurs types.',
          }),
          h(
            'button',
            {
              class: 'en-btn',
              onclick: function () {
                state.mode = 'entity';
                paintList();
                paintMain();
              },
            },
            [icon('arrow-left'), 'Retour aux entités']
          ),
        ])
      );
      main.appendChild(h('h3', { class: 'en-h en-h--section', text: 'Types' }));
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

    function typeCard(ty) {
      var name = h('input', { class: 'en-input', value: ty.name, 'aria-label': 'Nom du type' });
      var aliases = h('input', { class: 'en-input', value: ty.aliases.join(', '), placeholder: 'alias : plant, verdure', 'aria-label': 'Alias du type' });
      var checks = h('div', { class: 'en-checks' });
      var chosen = ty.components.slice();
      function save() {
        setSchema(
          EM().upsertType(state.schema, { id: ty.id, name: name.value, aliases: splitList(aliases.value), components: chosen })
        );
      }
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
      return h('div', { class: 'en-card' }, [
        h('div', { class: 'en-field' }, [h('label', { text: 'Nom' }), name]),
        h('div', { class: 'en-field' }, [h('label', { text: 'Alias' }), aliases]),
        h('div', { class: 'en-field' }, [h('label', { text: 'Composants' }), checks]),
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
          [icon('trash'), state.confirm === delId ? 'Confirmer (les entités perdent ce type)' : 'Supprimer le type']
        ),
      ]);
    }

    function componentCard(c) {
      var name = h('input', { class: 'en-input', value: c.name, 'aria-label': 'Nom du composant' });
      function build(fields) {
        return { id: c.id, name: name.value, fields: fields };
      }
      function saveFields(fields) {
        setSchema(EM().upsertComponent(state.schema, build(fields)));
      }
      name.addEventListener('change', function () {
        saveFields(c.fields);
      });
      var card = h('div', { class: 'en-card' }, [h('div', { class: 'en-field' }, [h('label', { text: 'Nom' }), name])]);
      c.fields.forEach(function (f, i) {
        var label = h('input', { class: 'en-input', value: f.label, 'aria-label': 'Nom du champ' });
        var kind = h('select', { class: 'en-input', 'aria-label': 'Type du champ' });
        EM().FIELD_KINDS.forEach(function (k) {
          kind.appendChild(h('option', { value: k, text: KIND_LABELS[k] }));
        });
        kind.value = f.kind;
        var extra = null;
        if (f.kind === 'choice') {
          extra = h('input', { class: 'en-input', value: (f.options || []).join(', '), placeholder: 'choix : bonne, fragile, morte', 'aria-label': 'Choix possibles' });
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
          if (kind.value === 'choice') nf.options = extra && f.kind === 'choice' ? splitList(extra.value) : f.options || [];
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
      return card;
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
      return ET()
        .commit(t, state.data, state.schema, state.entities)
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
                buildSide.fillTypes();
                paintList();
                paintMain();
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
