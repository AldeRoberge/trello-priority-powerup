/**
 * entities-ui: mount() part 3 of 3.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see entities-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.EntitiesUiParts = global.EntitiesUiParts || {});
  var P = (global.EntitiesUiPartsMountMount = global.EntitiesUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.relationsCard = function relationsCard() {
      var card = S.h('div', { class: 'en-card' }, [S.h('h3', { class: 'en-h', text: 'Relations' })]);
      var builtin = S.h('div', { class: 'en-chips' });
      S.EM().RELATIONS.forEach(function (d) {
        if (d.custom) return;
        builtin.appendChild(S.h('span', { class: 'en-chip', title: (M.CATEGORY_LABELS[d.category] || '') + (d.inverse ? ' · inverse : ' + d.inverse : ' · symétrique') }, [d.name]));
      });
      card.appendChild(builtin);
      (M.state.schema.relations || []).forEach(function (r) {
        var name = S.h('input', { class: 'en-input', value: r.name, 'aria-label': 'Nom du lien' });
        var inverse = S.h('input', { class: 'en-input', value: r.inverse, placeholder: 'inverse (ex. dirige)', 'aria-label': 'Inverse', disabled: r.symmetric ? true : null });
        var cat = S.h('select', { class: 'en-input', 'aria-label': 'Catégorie' });
        S.EM().RELATION_CATEGORIES.forEach(function (c) {
          cat.appendChild(S.h('option', { value: c, text: M.CATEGORY_LABELS[c] }));
        });
        cat.value = r.category;
        var sym = S.h('input', { type: 'checkbox', checked: r.symmetric ? true : null });
        var up = S.h('input', { type: 'checkbox', checked: r.up ? true : null, disabled: r.symmetric ? true : null });
        function save() {
          var next = S.EM().removeRelationDef(M.state.schema, r.id);
          M.setSchema(S.EM().upsertRelationDef(next, { name: name.value, inverse: inverse.value, category: cat.value, symmetric: sym.checked, up: up.checked }));
        }
        [name, inverse, cat, sym, up].forEach(function (el) {
          el.addEventListener('change', save);
        });
        card.appendChild(
          S.h('div', { class: 'en-field-row' }, [
            name,
            inverse,
            cat,
            S.h('label', { class: 'en-check', title: 'Pas d’inverse : « ressemble à »' }, [sym, 'symétrique']),
            S.h('label', { class: 'en-check', title: 'A situé dans B : B contient A (hiérarchie de contenance)' }, [up, 'contenant']),
            S.h('button', { class: 'en-link', 'aria-label': 'Supprimer le lien ' + r.name, onclick: function () { M.setSchema(S.EM().removeRelationDef(M.state.schema, r.id)); } }, [S.icon('x')]),
          ])
        );
      });
      var nn = S.h('input', { class: 'en-input', placeholder: 'Nouveau lien (ex. dirigé par)', 'aria-label': 'Nom du nouveau lien' });
      card.appendChild(
        S.h('div', { class: 'en-link-add' }, [
          nn,
          S.h(
            'button',
            {
              class: 'en-btn',
              onclick: function () {
                if (!nn.value.trim()) return;
                var next = S.EM().upsertRelationDef(M.state.schema, { name: nn.value });
                if ((next.relations || []).length === (M.state.schema.relations || []).length) {
                  M.toast('Ce nom est déjà un lien connu, ou est vide.', 'error');
                  return;
                }
                M.setSchema(next);
              },
            },
            [S.icon('plus'), 'Ajouter']
          ),
        ])
      );
      return card;
    };
    M.libraryCard = function libraryCard() {
      var EL = global.EntitiesLibrary;
      var card = S.h('div', { class: 'en-card' }, [S.h('h3', { class: 'en-h', text: 'Bibliothèque' })]);
      EL.GROUPS.forEach(function (g) {
        var items = EL.listFor(M.state.schema, { group: g.id });
        if (!items.length) return;
        var row = S.h('div', { class: 'en-lib-row' }, [S.h('span', { class: 'en-lib-group' }, [S.icon(g.icon), g.name])]);
        items.forEach(function (x) {
          row.appendChild(
            x.installed
              ? S.h('span', { class: 'en-chip en-chip--ok', title: 'Déjà dans le schéma' }, [S.icon('check'), x.preset.name])
              : S.h(
                  'button',
                  {
                    class: 'en-btn en-btn--small',
                    title: x.preset.description,
                    onclick: function () {
                      var r = EL.install(M.state.schema, x.preset.id);
                      if (r.error) {
                        M.toast('Le schéma est trop grand pour ajouter ce type : supprimez des types ou composants inutilisés.', 'error');
                        return;
                      }
                      M.setSchema(r.schema);
                      M.toast('Ajouté : ' + r.added.types.join(', ') + '.');
                    },
                  },
                  [S.icon('plus'), x.preset.name]
                )
          );
        });
        card.appendChild(row);
      });
      return card;
    };
    M.foldCard = function foldCard(id, summary, body) {
      var box = S.h('details', { class: 'en-fold' }, [S.h('summary', { class: 'en-fold-sum' }, summary.concat([S.icon('chevron-right')])), S.h('div', { class: 'en-fold-body' }, body)]);
      if (M.state.folds[id]) box.setAttribute('open', '');
      box.addEventListener('toggle', function () {
        M.state.folds[id] = box.open;
      });
      return box;
    };
    M.defaultsEditor = function defaultsEditor(ty) {
      var defaults = ty.defaults || {};
      var box = S.h('details', { class: 'en-defaults' }, [S.h('summary', { text: 'Valeurs par défaut (' + Object.keys(defaults).length + ')' })]);
      if (M.state.openDefaults === ty.id) box.setAttribute('open', '');
      var any = false;
      ty.components.forEach(function (cid) {
        var comp = S.EM().findById(M.state.schema.components, cid);
        if (!comp) return;
        comp.fields.forEach(function (fd) {
          if (fd.kind === 'ref' || fd.kind === 'refs') return;
          any = true;
          var path = cid + '.' + fd.key;
          var cur = defaults[path];
          var ctl;
          if (fd.kind === 'bool' || fd.kind === 'choice') {
            ctl = S.h('select', { class: 'en-input', 'aria-label': 'Défaut : ' + fd.label });
            ctl.appendChild(S.h('option', { value: '', text: '—' }));
            (fd.kind === 'bool' ? ['oui', 'non'] : fd.options || []).forEach(function (o) {
              ctl.appendChild(S.h('option', { value: o, text: o }));
            });
            ctl.value = fd.kind === 'bool' ? (cur === true ? 'oui' : cur === false ? 'non' : '') : cur || '';
          } else {
            ctl = S.h('input', {
              class: 'en-input',
              type: fd.kind === 'number' || fd.kind === 'level' ? 'number' : fd.kind === 'date' ? 'date' : 'text',
              step: fd.kind === 'number' || fd.kind === 'level' ? 'any' : null,
              'aria-label': 'Défaut : ' + fd.label,
              value: Array.isArray(cur) ? cur.join(', ') : cur == null ? '' : String(cur),
            });
          }
          ctl.addEventListener('change', function () {
            M.state.openDefaults = ty.id;
            var v = fd.kind === 'multi' ? S.splitList(ctl.value) : ctl.value;
            try {
              M.setSchema(S.EM().setTypeDefault(M.state.schema, ty.id, path, v));
            } catch (err) {
              M.toast('Valeur refusée : ' + (err && err.message), 'error');
            }
          });
          box.appendChild(S.h('div', { class: 'en-field-row' }, [S.h('label', { text: comp.name + ' : ' + fd.label + (fd.unit ? ' (' + fd.unit + ')' : '') }), ctl]));
        });
      });
      if (!any) box.appendChild(S.h('p', { class: 'en-hint', text: 'Aucun champ.' }));
      return box;
    };
    M.typeCard = function typeCard(ty) {
      var name = S.h('input', { class: 'en-input', value: ty.name, 'aria-label': 'Nom de l’archétype' });
      var aliases = S.h('input', { class: 'en-input', value: ty.aliases.join(', '), placeholder: 'alias : plant, verdure', 'aria-label': 'Alias de l’archétype' });
      var checks = S.h('div', { class: 'en-checks' });
      var chosen = ty.components.slice();
      var nature = S.h('select', { class: 'en-input', 'aria-label': 'Nature du type' });
      nature.appendChild(S.h('option', { value: '', text: ty.parents.length ? '(celle du type parent)' : '—' }));
      S.EM().NATURES.forEach(function (n) {
        nature.appendChild(S.h('option', { value: n.id, text: n.name }));
      });
      nature.value = ty.nature || '';
      var role = S.h('input', { type: 'checkbox', checked: ty.role ? true : null, 'aria-label': 'Rôle' });
      var desc = S.h('input', { class: 'en-input', value: ty.description || '', placeholder: 'En une phrase : qu’est-ce que c’est ?', 'aria-label': 'Description du type' });
      var parents = ty.parents.slice();
      var parentBox = S.h('div', { class: 'en-checks' });
      M.state.schema.types.forEach(function (p) {
        if (p.id === ty.id) return;
        parentBox.appendChild(
          S.h('label', { class: 'en-check' }, [
            S.h('input', {
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
        M.setSchema(
          S.EM().upsertType(M.state.schema, {
            id: ty.id,
            name: name.value,
            aliases: S.splitList(aliases.value),
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
      M.state.schema.components.forEach(function (c) {
        checks.appendChild(
          S.h('label', { class: 'en-check' }, [
            S.h('input', {
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
      var natureName = (S.EM().natureById(S.EM().natureOfType(M.state.schema, ty.id)) || {}).name;
      var nComp = ty.components.length;
      var summary = [
        M.tile({ types: [ty.id] }, 'sm'),
        S.h('span', { class: 'en-fold-name', text: ty.name }),
        S.h('span', { class: 'en-fold-meta', text: [natureName, nComp ? nComp + (nComp > 1 ? ' composants' : ' composant') : ''].filter(Boolean).join(' · ') }),
      ];
      return M.foldCard('type:' + ty.id, summary, [
        S.h('div', { class: 'en-field' }, [S.h('label', { text: 'Nom' }), name]),
        S.h('div', { class: 'en-field' }, [S.h('label', { text: 'Alias' }), aliases]),
        S.h('div', { class: 'en-field' }, [S.h('label', { text: 'Description' }), desc]),
        S.h('div', { class: 'en-field' }, [S.h('label', { text: 'Nature' }), nature]),
        S.h('div', { class: 'en-field' }, [S.h('label', { class: 'en-check' }, [role, 'Rôle'])]),
        ty.parents.length || M.state.schema.types.length > 1 ? S.h('div', { class: 'en-field' }, [S.h('label', { text: 'Inclut aussi les composants de' }), parentBox]) : null,
        S.h('div', { class: 'en-field' }, [S.h('label', { text: 'Composants' }), checks]),
        M.defaultsEditor(ty),
        S.h(
          'button',
          {
            class: 'en-btn en-btn--danger',
            onclick: function () {
              if (M.state.confirm !== delId) {
                M.state.confirm = delId;
                M.paintMain();
                return;
              }
              M.state.confirm = '';
              M.setSchema(S.EM().removeType(M.state.schema, ty.id));
            },
          },
          [S.icon('trash'), M.state.confirm === delId ? 'Confirmer (les entités perdent cet archétype)' : 'Supprimer l’archétype']
        ),
      ]);
    };
    M.componentCard = function componentCard(c) {
      if (c.builtin) {
        return M.foldCard(
          'comp:' + c.id,
          [S.h('span', { class: 'en-fold-name', text: c.name }), S.h('span', { class: 'en-fold-meta', text: 'intégré' })],
          []
        );
      }
      var name =S.h('input', { class: 'en-input', value: c.name, 'aria-label': 'Nom du composant' });
      function build(fields) {
        return { id: c.id, name: name.value, fields: fields };
      }
      function saveFields(fields) {
        M.setSchema(S.EM().upsertComponent(M.state.schema, build(fields)));
      }
      name.addEventListener('change', function () {
        saveFields(c.fields);
      });
      var card = S.h('div', { class: 'en-fold-fields' }, [S.h('div', { class: 'en-field' }, [S.h('label', { text: 'Nom' }), name])]);
      c.fields.forEach(function (f, i) {
        var label = S.h('input', { class: 'en-input', value: f.label, 'aria-label': 'Nom du champ' });
        var kind = S.h('select', { class: 'en-input', 'aria-label': 'Type du champ' });
        S.EM().FIELD_KINDS.forEach(function (k) {
          kind.appendChild(S.h('option', { value: k, text: S.KIND_LABELS[k] }));
        });
        kind.value = f.kind;
        var extra = null;
        if (f.kind === 'choice' || f.kind === 'multi') {
          extra = S.h('input', { class: 'en-input', value: (f.options || []).join(', '), placeholder: 'choix : bonne, fragile, morte', 'aria-label': 'Choix possibles' });
        } else if (f.kind === 'level') {
          extra = S.h('span', { class: 'en-field-pair' }, [
            S.h('input', { class: 'en-input', value: f.unit || '', placeholder: 'unité : ml, %', 'aria-label': 'Unité' }),
            S.h('input', {
              class: 'en-input',
              value: f.maxField || (f.max != null ? String(f.max) : ''),
              placeholder: 'maximum : 100 ou champ',
              'aria-label': 'Maximum de la jauge',
              title: 'Un nombre fixe, ou la clé d’un champ nombre du même composant (ex. capacite). Le minimum est 0.',
            }),
          ]);
        } else if (f.kind === 'number') {
          extra = S.h('input', { class: 'en-input', value: f.unit || '', placeholder: 'unité : kg, ml, $', 'aria-label': 'Unité' });
        } else if (f.kind === 'ref' || f.kind === 'refs') {
          extra = S.h('input', {
            class: 'en-input',
            value: (f.refTypes || []).join(', '),
            placeholder: 'types autorisés (ids) : place',
            'aria-label': 'Types autorisés',
            title: 'Identifiants des types acceptés, séparés par des virgules (vide = toutes les entités). Disponibles : ' + M.state.schema.types.map(function (x) { return x.id; }).join(', '),
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
          if (kind.value === 'choice' || kind.value === 'multi') nf.options = extra && (f.kind === 'choice' || f.kind === 'multi') ? S.splitList(extra.value) : f.options || [];
          if (kind.value === 'ref' || kind.value === 'refs') nf.refTypes = extra && f.kind === kind.value ? S.splitList(extra.value) : f.refTypes || [];
          next[i] = nf;
          saveFields(next);
        }
        label.addEventListener('change', commitField);
        kind.addEventListener('change', commitField);
        if (extra) extra.addEventListener('change', commitField);
        card.appendChild(
          S.h('div', { class: 'en-field-row' }, [
            label,
            kind,
            extra,
            S.h(
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
              [S.icon('x')]
            ),
          ])
        );
      });
      var delId = 'comp:' + c.id;
      card.appendChild(
        S.h('div', { class: 'en-actions' }, [
          S.h(
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
            [S.icon('plus'), 'Champ']
          ),
          S.h(
            'button',
            {
              class: 'en-btn en-btn--danger',
              onclick: function () {
                if (M.state.confirm !== delId) {
                  M.state.confirm = delId;
                  M.paintMain();
                  return;
                }
                M.state.confirm = '';
                M.setSchema(S.EM().removeComponent(M.state.schema, c.id));
              },
            },
            [S.icon('trash'), M.state.confirm === delId ? 'Confirmer (les valeurs saisies sont perdues)' : 'Supprimer']
          ),
        ])
      );
      var nFields = c.fields.length;
      return M.foldCard('comp:' + c.id, [S.h('span', { class: 'en-fold-name', text: c.name }), S.h('span', { class: 'en-fold-meta', text: nFields + (nFields > 1 ? ' champs' : ' champ') })], [card]);
    };
    M.paintStatus = function paintStatus() {
      var map = { idle: '', dirty: 'Modifié…', saving: 'Enregistrement…', saved: 'Enregistré', error: 'Non enregistré' };
      M.els.status.textContent = map[M.state.saveState] || '';
      M.els.status.className = 'en-status en-status--' + M.state.saveState;
    };
    M.scheduleSave = function scheduleSave() {
      if (!M.state.data) M.toast('Autorisez Trello pour enregistrer : ces changements ne sont pas sauvegardés.', 'error');
      M.dirty = true;
      M.state.saveState = 'dirty';
      M.paintStatus();
      clearTimeout(M.saveTimer);
      M.saveTimer = setTimeout(M.saveNow, S.SAVE_DELAY_MS);
    };
    M.saveNow = function saveNow() {
      clearTimeout(M.saveTimer);
      if (!M.dirty || !M.state.data) return Promise.resolve();
      if (M.saving) {
        M.saveTimer = setTimeout(M.saveNow, S.SAVE_DELAY_MS);
        return Promise.resolve();
      }
      M.saving = true;
      M.dirty = false;
      M.state.saveState = 'saving';
      M.paintStatus();
      var beforeSave = global.EntitiesDirectories
        ? global.EntitiesDirectories.push(M.t, M.state.schema, M.state.entities).then(function (r) {
            if (r.changed) M.state.entities = r.entities; // people and places now carry their directory link
          })
        : Promise.resolve();
      return beforeSave
        .then(function () {
          return S.ET().commit(M.t, M.state.data, M.state.schema, M.state.entities);
        })
        .then(
          function () {
            M.state.saveState = M.dirty ? 'dirty' : 'saved';
            M.paintStatus();
          },
          function (err) {
            M.dirty = true; // keep the edits; the user can retry or reload
            M.state.saveState = 'error';
            M.paintStatus();
            M.failure(err);
          }
        )
        .then(function () {
          M.saving = false;
        });
    };
    M.boot = function boot() {
      S.ET()
        .isAuthorized(M.t)
        .then(function (ok) {
          M.state.authOk = ok;
          M.paintBanner();
          if (!ok) {
            M.state.loaded = true;
            M.paintList();
            return;
          }
          return S.ET()
            .load(M.t, { force: true })
            .then(
              function (data) {
                M.state.data = data;
                M.state.schema = data.schema;
                M.state.entities = data.entities.slice();
                M.state.loaded = true;
                M.state.selId = M.state.entities.length ? M.state.entities[0].id : null;
                try {
                  var preset = new URLSearchParams(global.location.search).get('entity') || '';
                  if (preset && M.state.entities.some(function (en) { return en.id === preset; })) {
                    M.state.selId = preset;
                    var addr = new URL(global.location.href);
                    addr.searchParams.delete('entity');
                    global.history.replaceState(null, '', addr.pathname + addr.search + addr.hash);
                  }
                } catch (eUrl) { /* keep the first entity */ }
                M.paintList({ reveal: true });
                M.paintMain();
                // People and Places are entities too: bring the directories in (saved with the next write)
                if (global.EntitiesDirectories)
                  global.EntitiesDirectories.pull(M.t, M.state.schema, M.state.entities).then(function (r) {
                    if (!r.changed) return;
                    M.state.schema = r.schema;
                    M.state.entities = r.entities;
                    M.scheduleSave();
                    M.paintList();
                    M.paintMain();
                  });
              },
              function (err) {
                M.state.loaded = true;
                M.paintList();
                M.failure(err);
              }
            );
        });
    };
    M.refreshQuiet = function refreshQuiet() {
      if (!S.ET() || typeof S.ET().load !== 'function') return;
      return S.ET().load(M.t, { force: true }).then(function (data) {
        if (!data) return;
        M.state.data = data;
        M.state.schema = data.schema;
        M.state.entities = data.entities.slice();
        if (!M.state.entities.some(function (en) { return en.id === M.state.selId; })) {
          M.state.selId = M.state.entities.length ? M.state.entities[0].id : null;
        }
        M.paintList();
        M.paintMain();
      }, function () {});
    };
    },
    run: function (M) {
    M.buildSide();
    M.paintList();
    M.paintMain();
    if (global.EntitiesComposerAI && global.EntitiesComposerAI.available) {
      global.EntitiesComposerAI.available(M.t).then(function (ok) {
        M.state.ai = ok;
        M.paintObserve();
        if (M.state.mode === 'schema') M.paintMain();
      });
    }
    global.addEventListener('pagehide', function () {
      M.saveNow();
    });
    M.boot();
    if (global.AssistantDock) {
      global.AssistantDock.mount({
        t: M.t,
        after: M.root,
        onRefresh: M.refreshQuiet,
        isBusy: function () {
          var ae = document.activeElement;
          return !!(ae && M.root.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable));
        },
      });
    }
    return { v: { state: M.state, saveNow: M.saveNow, reload: M.boot, openComposer: M.openComposer } };
    }
  });
})(typeof window !== 'undefined' ? window : this);
