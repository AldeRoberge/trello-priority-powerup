/*
 * Role: UI of the Entity composer: a dialog that interviews the user to create an entity (and what it
 * needs: a new place, a new type) and creates everything linked in one go. Logic: EntitiesComposer.
 *
 *   header   title, breadcrumb of the entities being composed (nested), close
 *   rail     the steps for the current entity (Quoi ? Nom, one per component, Liens, Résumé)
 *   main     the questions of the current step
 *   aside    live preview card (name, types, answers, links, what will be created too)
 *   footer   Retour | Passer/Suivant | Créer
 *
 * Nesting: a link question can "Créer « Salon »": that pushes a sub-interview for the place; finishing
 * it returns to the question with the link set. Nothing is written until the final "Créer".
 *
 * Usage: EntitiesComposerUI.open({ schema, entities, initialText?, initialTypes?, onDone(result) })
 *   result = { schema, entities, created, rootId, again }
 *
 * Contents: 1 helpers | 2 open: state | 3 steps | 4 field controls | 5 chrome | 6 flow
 */
(function (global) {
  'use strict';

  function EM() {
    return global.EntitiesModel;
  }
  function EC() {
    return global.EntitiesComposer;
  }

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

  function isoDay(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    var p = function (n) {
      return (n < 10 ? '0' : '') + n;
    };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ── 2. Open: state ──────────────────────────────────────────────── */

  function open(ctx) {
    var st = {
      schema: ctx.schema,
      entities: ctx.entities,
      drafts: {},
      order: [],
      stack: [], // frames: { id, step, from: {id, kind, path, relType}|null }
      rootId: '',
      confirmClose: false,
      newType: null, // { name, aliases, comps:[], fieldsText, error } while the inline form is open
      shake: false,
    };

    var els = {
      overlay: h('div', { class: 'cp-overlay' }),
      header: h('header', { class: 'cp-head' }),
      rail: h('nav', { class: 'cp-rail', 'aria-label': 'Étapes' }),
      main: h('section', { class: 'cp-main' }),
      aside: h('aside', { class: 'cp-aside', 'aria-label': 'Aperçu' }),
      footer: h('footer', { class: 'cp-foot' }),
    };
    var dialog = h(
      'div',
      { class: 'cp-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Composer une entité' },
      [els.header, h('div', { class: 'cp-body' }, [els.rail, els.main, els.aside]), els.footer]
    );
    els.overlay.appendChild(dialog);

    var opener = document.activeElement;

    function frame() {
      return st.stack[st.stack.length - 1];
    }
    function draft() {
      return st.drafts[frame().id];
    }
    function setDraft(d) {
      st.drafts[d.id] = d;
    }
    function isSub() {
      return st.stack.length > 1 || (frame() && frame().from);
    }

    function pseudoOf(d) {
      return { id: d.id, name: d.name || 'Sans nom', types: d.types, aliases: d.aliases, relations: [], data: {}, updatedAt: '9', draft: true };
    }
    /** Existing entities plus the other drafts of this composition (they can be linked to as well). */
    function pool() {
      var cur = frame() ? frame().id : '';
      return st.entities.concat(
        st.order
          .filter(function (id) {
            return id !== cur;
          })
          .map(function (id) {
            return pseudoOf(st.drafts[id]);
          })
      );
    }
    function nameOf(id) {
      var d = st.drafts[id];
      if (d) return d.name || 'Sans nom';
      var e = EM().findById(st.entities, id);
      return e ? e.name : '?';
    }
    function typeName(id) {
      var t = EM().findById(st.schema.types, id);
      return t ? t.name : id;
    }
    function typeIcon(d) {
      var t = d.types.length ? EM().findById(st.schema.types, d.types[0]) : null;
      return (t && t.icon) || 'stack-2';
    }
    function steps() {
      var all = EC().stepsFor(st.schema, draft());
      var sub = isSub();
      return all.filter(function (s) {
        if (sub && (s.kind === 'links' || s.kind === 'review')) return false;
        if (draft().preset && s.kind === 'start') return false;
        return true;
      });
    }
    function stepIndex() {
      var list = steps();
      for (var i = 0; i < list.length; i++) if (list[i].key === frame().step) return i;
      return 0;
    }

    function addDraft(d, from, step) {
      setDraft(d);
      st.order.push(d.id);
      st.stack.push({ id: d.id, step: step || 'start', from: from || null });
    }

    /* ── 3. Steps ─────────────────────────────────────────────────── */

    function renderStart(box) {
      var d = draft();
      var input = h('input', {
        class: 'cp-input cp-input--big',
        'aria-label': 'Décrivez ce que vous ajoutez',
        placeholder: 'Ex. : Ficus, une plante au travail',
        value: d.intent || '',
        'data-autofocus': '1',
        'data-noenter': '1',
        oninput: function () {
          setDraft(Object.assign({}, draft(), { intent: input.value }));
          paintUnderstood();
        },
        onblur: function () {
          applyIntentNow();
          refresh();
        },
        onkeydown: function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            next();
          }
        },
      });
      var understood = h('div', { class: 'cp-understood', 'aria-live': 'polite' });
      function paintUnderstood() {
        understood.textContent = '';
        var text = draft().intent || '';
        if (!text.trim()) {
          understood.appendChild(
            h('span', { class: 'cp-hint', text: 'Écrivez un nom, puis (après une virgule) ce que c’est et où : je remplis le reste.' })
          );
          return;
        }
        var r = EC().readIntent(st.schema, st.entities, text);
        var chips = [];
        if (r.name) chips.push(['tag', 'Nom : ' + r.name]);
        r.types.forEach(function (t) {
          chips.push(['category', 'Type : ' + typeName(t)]);
        });
        Object.keys(r.answers).forEach(function (p) {
          var f = EM().fieldOf(st.schema, p);
          if (f) chips.push(['link', f.field.label + ' : ' + EM().formatValue(f.field, r.answers[p], st.entities)]);
        });
        r.relations.forEach(function (x) {
          chips.push(['link', x.type + ' ' + nameOf(x.to)]);
        });
        chips.forEach(function (c) {
          understood.appendChild(h('span', { class: 'cp-chip cp-chip--ok' }, [icon(c[0]), c[1]]));
        });
        if (r.name !== text && !r.types.length && !Object.keys(r.answers).length && !r.relations.length) {
          understood.appendChild(h('span', { class: 'cp-hint', text: 'Aucun type reconnu : choisissez-en un ci-dessous.' }));
        }
      }
      paintUnderstood();

      var grid = h('div', { class: 'cp-types', role: 'group', 'aria-label': 'Types' });
      st.schema.types.forEach(function (ty) {
        var on = draft().types.indexOf(ty.id) >= 0;
        var count = st.entities.filter(function (e) {
          return e.types.indexOf(ty.id) >= 0;
        }).length;
        var comps = ty.components
          .map(function (cid) {
            var c = EM().findById(st.schema.components, cid);
            return c ? c.name : cid;
          })
          .join(' + ');
        grid.appendChild(
          h(
            'button',
            {
              class: 'cp-type' + (on ? ' is-on' : ''),
              type: 'button',
              'aria-pressed': on ? 'true' : 'false',
              onclick: function () {
                applyIntentNow();
                var nd = EC().pruneAnswers(st.schema, EC().toggleType(st.schema, draft(), ty.id, !on));
                setDraft(nd);
                renderMain();
                refresh();
              },
            },
            [
              icon(ty.icon || 'stack-2'),
              h('span', { class: 'cp-type-name', text: ty.name }),
              h('span', { class: 'cp-type-sub', text: (comps || 'aucun composant') + ' · ' + count }),
            ]
          )
        );
      });
      grid.appendChild(
        h(
          'button',
          {
            class: 'cp-type cp-type--new',
            type: 'button',
            onclick: function () {
              st.newType = st.newType || { name: '', aliases: '', comps: [], fieldsText: '', error: '' };
              renderMain();
            },
          },
          [icon('plus'), h('span', { class: 'cp-type-name', text: 'Nouveau type' }), h('span', { class: 'cp-type-sub', text: 'Définir en une ligne' })]
        )
      );
      box.appendChild(h('h2', { class: 'cp-q', text: 'Que voulez-vous ajouter ?' }));
      box.appendChild(input);
      box.appendChild(understood);
      box.appendChild(h('h3', { class: 'cp-sub', text: 'Type' }));
      box.appendChild(grid);
      if (st.newType) box.appendChild(newTypeForm());
    }

    function newTypeForm() {
      var nt = st.newType;
      var nameIn = h('input', { class: 'cp-input', placeholder: 'Ex. : Outil', value: nt.name, 'aria-label': 'Nom du type', 'data-noenter': '1' });
      var aliasIn = h('input', { class: 'cp-input', placeholder: 'alias : tool, équipement', value: nt.aliases, 'aria-label': 'Alias du type', 'data-noenter': '1' });
      var fieldsIn = h('input', {
        class: 'cp-input',
        placeholder: 'Ex. : État (choix: neuf/usé), Achat (date), Lieu (lien: Lieu), Prix (nombre)',
        value: nt.fieldsText,
        'aria-label': 'Champs du type',
        'data-noenter': '1',
      });
      var preview = h('div', { class: 'cp-understood' });
      var errBox = h('p', { class: 'cp-error', role: 'alert', hidden: nt.error ? null : true, text: nt.error });
      function paintPreview() {
        preview.textContent = '';
        EC()
          .parseFieldSpec(fieldsIn.value, st.schema)
          .forEach(function (f) {
            var kind = { text: 'texte', number: 'nombre', date: 'date', bool: 'oui/non', choice: 'choix', ref: 'lien', refs: 'liens' }[f.kind];
            preview.appendChild(h('span', { class: 'cp-chip' }, [f.label, h('em', { text: ' ' + kind })]));
          });
      }
      function sync() {
        nt.name = nameIn.value;
        nt.aliases = aliasIn.value;
        nt.fieldsText = fieldsIn.value;
        paintPreview();
      }
      [nameIn, aliasIn, fieldsIn].forEach(function (i) {
        i.addEventListener('input', sync);
      });
      paintPreview();
      var comps = h('div', { class: 'cp-checks' });
      st.schema.components.forEach(function (c) {
        comps.appendChild(
          h('label', { class: 'cp-check' }, [
            h('input', {
              type: 'checkbox',
              checked: nt.comps.indexOf(c.id) >= 0 ? true : null,
              onchange: function (ev) {
                nt.comps = nt.comps.filter(function (x) {
                  return x !== c.id;
                });
                if (ev.target.checked) nt.comps.push(c.id);
              },
            }),
            c.name,
          ])
        );
      });
      return h('div', { class: 'cp-card' }, [
        h('h3', { class: 'cp-sub', text: 'Nouveau type' }),
        h('label', { class: 'cp-label', text: 'Nom' }),
        nameIn,
        h('label', { class: 'cp-label', text: 'Alias (séparés par des virgules)' }),
        aliasIn,
        st.schema.components.length ? h('label', { class: 'cp-label', text: 'Réutiliser des composants' }) : null,
        st.schema.components.length ? comps : null,
        h('label', { class: 'cp-label', text: 'Nouveaux champs (nom (genre: détail), …)' }),
        fieldsIn,
        preview,
        h('p', { class: 'cp-hint', text: 'Genres : texte, nombre, date, oui-non, choix: a/b/c, lien: Type, liens: Type.' }),
        errBox,
        h('div', { class: 'cp-row' }, [
          h(
            'button',
            {
              class: 'cp-btn cp-btn--primary',
              type: 'button',
              onclick: function () {
                sync();
                var r = EC().defineType(st.schema, {
                  name: nt.name,
                  aliases: splitList(nt.aliases),
                  componentIds: nt.comps,
                  component: { name: nt.name, fieldsText: nt.fieldsText },
                });
                if (r.error) {
                  nt.error =
                    r.error === 'type-exists' ? 'Un type porte déjà ce nom (ou cet alias).' : r.error === 'name-required' ? 'Donnez un nom au type.' : 'Impossible de créer le type.';
                  renderMain();
                  return;
                }
                st.schema = r.schema;
                st.newType = null;
                var nd = EC().toggleType(st.schema, draft(), r.typeId, true);
                setDraft(nd);
                renderMain();
                refresh();
              },
            },
            [icon('check'), 'Créer le type et le choisir']
          ),
          h(
            'button',
            {
              class: 'cp-btn',
              type: 'button',
              onclick: function () {
                st.newType = null;
                renderMain();
              },
            },
            ['Annuler']
          ),
        ]),
      ]);
    }

    function applyIntentNow() {
      var d = draft();
      var text = (d.intent || '').trim();
      if (!text || d.intentApplied === text) return;
      // a name taken from an earlier version of the sentence is replaced by the new one
      var base = d.autoName && d.name === d.autoName ? Object.assign({}, d, { name: '' }) : d;
      var r = EC().readIntent(st.schema, st.entities, text);
      var nd = EC().applyIntent(st.schema, base, r);
      nd.autoName = !base.name && nd.name ? nd.name : d.autoName;
      nd.intentApplied = text;
      setDraft(nd);
    }

    function renderIdentity(box) {
      var d = draft();
      var issuesBox = h('div', { class: 'cp-issues', 'aria-live': 'polite' });
      var nameIn = h('input', {
        class: 'cp-input cp-input--big',
        placeholder: 'Ex. : Ficus',
        value: d.name,
        'aria-label': 'Nom',
        'data-autofocus': '1',
        oninput: function () {
          setDraft(Object.assign({}, draft(), { name: nameIn.value }));
          refresh();
          paintIssues();
        },
      });
      function paintIssues() {
        issuesBox.textContent = '';
        EC()
          .issues(st.schema, st.entities, draft(), otherDrafts())
          .forEach(function (i) {
            if (i.code === 'name-required' || i.code === 'no-type') return;
            issuesBox.appendChild(h('p', { class: 'cp-issue cp-issue--' + i.level }, [icon(i.level === 'error' ? 'alert-circle' : 'alert-triangle'), i.message]));
          });
      }
      paintIssues();
      var aliasBox = h('div', { class: 'cp-chipedit' });
      var aliasIn = h('input', {
        class: 'cp-chipedit-in',
        placeholder: 'Ajouter un alias puis Entrée (ex. travail, work, bureau)',
        'aria-label': 'Alias',
        'data-noenter': '1',
        onkeydown: function (ev) {
          if (ev.key === 'Enter' || ev.key === ',') {
            ev.preventDefault();
            addAlias(aliasIn.value);
          } else if (ev.key === 'Backspace' && !aliasIn.value && draft().aliases.length) {
            setAliases(draft().aliases.slice(0, -1));
          }
        },
        onblur: function () {
          addAlias(aliasIn.value);
        },
      });
      function setAliases(list) {
        setDraft(Object.assign({}, draft(), { aliases: list }));
        paintAliases();
        paintIssues();
        refresh();
        aliasIn.focus();
      }
      function addAlias(v) {
        splitList(v).forEach(function (a) {
          var cur = draft().aliases;
          var key = EM().normKey(a);
          if (key && !cur.some(function (x) { return EM().normKey(x) === key; })) cur = cur.concat([a]);
          setDraft(Object.assign({}, draft(), { aliases: cur }));
        });
        aliasIn.value = '';
        paintAliases();
        paintIssues();
        refresh();
      }
      function paintAliases() {
        aliasBox.textContent = '';
        draft().aliases.forEach(function (a, i) {
          aliasBox.appendChild(
            h('span', { class: 'cp-chip' }, [
              a,
              h(
                'button',
                {
                  class: 'cp-x',
                  type: 'button',
                  'aria-label': 'Retirer l’alias ' + a,
                  onclick: function () {
                    setAliases(
                      draft().aliases.filter(function (_x, j) {
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
        aliasBox.appendChild(aliasIn);
      }
      paintAliases();
      box.appendChild(h('h2', { class: 'cp-q', text: 'Comment l’appelle-t-on ?' }));
      box.appendChild(nameIn);
      box.appendChild(issuesBox);
      box.appendChild(h('h3', { class: 'cp-sub', text: 'Alias' }));
      box.appendChild(h('p', { class: 'cp-hint', text: 'Les autres façons de le nommer : l’assistant retrouvera l’entité dans « arroser au travail » grâce à l’alias « travail ».' }));
      box.appendChild(aliasBox);
    }

    function otherDrafts() {
      return st.order
        .filter(function (id) {
          return id !== frame().id;
        })
        .map(function (id) {
          return st.drafts[id];
        });
    }

    function renderComponent(box, step) {
      var comp = EM().findById(st.schema.components, step.componentId);
      if (!comp) return;
      var d = draft();
      box.appendChild(h('h2', { class: 'cp-q', text: comp.name }));
      box.appendChild(h('p', { class: 'cp-hint', text: d.name ? 'Parlons de « ' + d.name + ' ». Tout est facultatif.' : 'Tout est facultatif.' }));
      comp.fields.forEach(function (f) {
        var path = comp.id + '.' + f.key;
        var q = EC().questionFor(comp, f, d);
        box.appendChild(
          h('div', { class: 'cp-ask' }, [
            h('label', { class: 'cp-ask-q', text: q.text }),
            h('span', { class: 'cp-hint', text: q.hint }),
            fieldControl(path, f),
          ])
        );
      });
    }

    /* ── 4. Field controls ────────────────────────────────────────── */

    function answer(path, v) {
      setDraft(EC().setAnswer(draft(), path, v));
      refresh();
    }

    function chip(label, on, onclick, title) {
      return h('button', { class: 'cp-pick' + (on ? ' is-on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', title: title || null, onclick: onclick }, [label]);
    }

    function fieldControl(path, f) {
      var val = draft().answers[path];
      var wrap = h('div', { class: 'cp-ctl' });
      var sugg = EC().suggest(st.schema, st.entities, draft(), path);
      if (f.kind === 'bool' || f.kind === 'choice') wrap.className = 'cp-ctl cp-ctl--chips';
      if (f.kind === 'bool') {
        function paint() {
          wrap.textContent = '';
          var cur = draft().answers[path];
          [['Oui', true], ['Non', false]].forEach(function (o) {
            wrap.appendChild(
              chip(o[0], cur === o[1], function () {
                answer(path, cur === o[1] ? '' : o[1]);
                paint();
              })
            );
          });
        }
        paint();
        return wrap;
      }
      if (f.kind === 'choice') {
        function paintChoice() {
          wrap.textContent = '';
          var cur = draft().answers[path];
          (f.options || []).forEach(function (o) {
            wrap.appendChild(
              chip(o, cur === o, function () {
                answer(path, cur === o ? '' : o);
                paintChoice();
              })
            );
          });
        }
        paintChoice();
        return wrap;
      }
      if (f.kind === 'ref' || f.kind === 'refs') return refControl(path, f);
      var type = f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text';
      var inp = h('input', {
        class: 'cp-input',
        type: type,
        step: f.kind === 'number' ? 'any' : null,
        value: val == null ? '' : String(val),
        'aria-label': f.label,
        oninput: function () {
          answer(path, inp.value);
        },
      });
      wrap.appendChild(inp);
      var quick = h('div', { class: 'cp-quick' });
      function setQuick(v) {
        inp.value = v;
        answer(path, v);
      }
      if (f.kind === 'date') {
        [['Aujourd’hui', 0], ['Demain', 1], ['Dans 7 jours', 7]].forEach(function (o) {
          quick.appendChild(chip(o[0], false, function () { setQuick(isoDay(o[1])); }));
        });
      }
      if (f.kind === 'number' || f.kind === 'text') {
        sugg.forEach(function (s) {
          quick.appendChild(
            chip(String(s.value), false, function () { setQuick(String(s.value)); }, 'Utilisé par ' + s.count + ' autre' + (s.count > 1 ? 's' : ''))
          );
        });
      }
      if (quick.childNodes.length) {
        if (f.kind !== 'date') quick.insertBefore(h('span', { class: 'cp-hint', text: 'Souvent :' }), quick.firstChild);
        wrap.appendChild(quick);
      }
      return wrap;
    }

    function refControl(path, f) {
      var multi = f.kind === 'refs';
      var wrap = h('div', { class: 'cp-ctl cp-ctl--ref' });
      var picked = h('div', { class: 'cp-picked' });
      var options = h('div', { class: 'cp-quick' });
      var search = h('input', {
        class: 'cp-input',
        placeholder: 'Chercher, ou taper un nom à créer…',
        'aria-label': f.label + ' : chercher ou créer',
        'data-noenter': '1',
        oninput: paintOptions,
        onkeydown: function (ev) {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          var q = search.value.trim();
          if (!q) return next();
          var hits = matches(q);
          var exact = hits.filter(function (e) {
            return EM().normKey(e.name) === EM().normKey(q);
          })[0];
          if (exact || hits.length === 1) pick((exact || hits[0]).id);
          else create(q);
        },
      });
      function current() {
        var v = draft().answers[path];
        return v === undefined ? [] : multi ? v : [v];
      }
      function pick(id) {
        var cur = current();
        if (multi) answer(path, cur.indexOf(id) >= 0 ? cur.filter(function (x) { return x !== id; }) : cur.concat([id]));
        else answer(path, cur[0] === id ? '' : id);
        search.value = '';
        paintPicked();
        paintOptions();
        search.focus();
      }
      function matches(q) {
        var key = EM().normKey(q);
        return pool().filter(function (e) {
          if (!EC().eligible(f, e, draft())) return false;
          return [e.name].concat(e.aliases || []).some(function (l) {
            return EM().normKey(l).indexOf(key) >= 0;
          });
        });
      }
      function create(name) {
        var types = (f.refTypes || []).filter(function (t) {
          return !!EM().findById(st.schema.types, t);
        });
        var nd = EC().newDraft({ name: name, types: types });
        nd.preset = types.length > 0;
        addDraft(nd, { id: draft().id, kind: multi ? 'answers' : 'answer', path: path }, types.length ? 'identity' : 'start');
        render();
      }
      function paintPicked() {
        picked.textContent = '';
        current().forEach(function (id) {
          var isNew = !!st.drafts[id];
          picked.appendChild(
            h('span', { class: 'cp-chip cp-chip--on' }, [
              icon(isNew ? 'sparkles' : 'link'),
              nameOf(id),
              isNew ? h('em', { text: ' nouveau' }) : null,
              isNew
                ? h('button', { class: 'cp-x', type: 'button', 'aria-label': 'Modifier ' + nameOf(id), onclick: function () { edit(id); } }, [icon('pencil')])
                : null,
              h('button', { class: 'cp-x', type: 'button', 'aria-label': 'Retirer ' + nameOf(id), onclick: function () { pick(id); } }, [icon('x')]),
            ])
          );
        });
      }
      function edit(id) {
        st.stack.push({ id: id, step: 'identity', from: null });
        render();
      }
      function paintOptions() {
        options.textContent = '';
        var q = search.value.trim();
        var chosen = current();
        var list;
        if (q) {
          list = matches(q);
        } else {
          var sugg = EC().suggest(st.schema, st.entities, draft(), path).slice(0, 6).map(function (s) {
            return { e: EM().findById(st.entities, s.value), count: s.count };
          });
          var seen = {};
          list = [];
          sugg.forEach(function (s) {
            if (s.e) {
              seen[s.e.id] = true;
              list.push(Object.assign({}, s.e, { _count: s.count }));
            }
          });
          pool().forEach(function (e) {
            if (e.draft && !seen[e.id] && EC().eligible(f, e, draft())) list.push(e);
          });
        }
        list
          .filter(function (e) {
            return chosen.indexOf(e.id) < 0;
          })
          .slice(0, 10)
          .forEach(function (e) {
            options.appendChild(
              chip(
                (e.draft ? '✦ ' : '') + e.name,
                false,
                function () { pick(e.id); },
                e._count ? 'Utilisé par ' + e._count + ' autre' + (e._count > 1 ? 's' : '') : e.draft ? 'Sera créé avec cette composition' : null
              )
            );
          });
        if (q && !pool().some(function (e) { return EM().normKey(e.name) === EM().normKey(q) && EC().eligible(f, e, draft()); })) {
          options.appendChild(
            h('button', { class: 'cp-pick cp-pick--new', type: 'button', onclick: function () { create(q); } }, [icon('plus'), 'Créer « ' + q + ' »'])
          );
        } else if (!q && !list.length && !chosen.length) {
          options.appendChild(h('span', { class: 'cp-hint', text: 'Aucune entité à proposer : tapez un nom pour la créer.' }));
        }
      }
      paintPicked();
      paintOptions();
      wrap.appendChild(picked);
      wrap.appendChild(options);
      wrap.appendChild(search);
      return wrap;
    }

    function renderLinks(box) {
      var d = draft();
      box.appendChild(h('h2', { class: 'cp-q', text: 'Autres liens ?' }));
      box.appendChild(h('p', { class: 'cp-hint', text: 'Relier « ' + (d.name || 'cette entité') + ' » à d’autres entités : contient, fait partie de, près de…' }));
      var list = h('div', { class: 'cp-linklist' });
      function paintList() {
        list.textContent = '';
        draft().relations.forEach(function (r) {
          list.appendChild(
            h('span', { class: 'cp-chip cp-chip--on' }, [
              icon('arrow-right'),
              r.type + ' ' + nameOf(r.to),
              h(
                'button',
                {
                  class: 'cp-x',
                  type: 'button',
                  'aria-label': 'Retirer le lien',
                  onclick: function () {
                    setDraft(EC().removeRelationFrom(draft(), r.type, r.to));
                    paintList();
                    refresh();
                  },
                },
                [icon('x')]
              ),
            ])
          );
        });
        if (!draft().relations.length) list.appendChild(h('span', { class: 'cp-hint', text: 'Aucun lien pour l’instant.' }));
      }
      paintList();
      var relType = h('input', {
        class: 'cp-input',
        value: EC().relationTypes(st.entities)[0],
        list: 'cp-rel-types',
        'aria-label': 'Type de lien',
        'data-noenter': '1',
      });
      var dl = h('datalist', { id: 'cp-rel-types' });
      EC()
        .relationTypes(st.entities)
        .forEach(function (t) {
          dl.appendChild(h('option', { value: t }));
        });
      var search = h('input', { class: 'cp-input', placeholder: 'Chercher une entité, ou taper un nom à créer…', 'aria-label': 'Entité à lier', 'data-noenter': '1', oninput: paintOptions });
      var options = h('div', { class: 'cp-quick' });
      function link(id) {
        setDraft(EC().addRelationTo(draft(), relType.value, id));
        search.value = '';
        paintList();
        paintOptions();
        refresh();
      }
      function paintOptions() {
        options.textContent = '';
        var q = EM().normKey(search.value);
        var taken = draft().relations.map(function (r) { return r.to; });
        var cand = pool().filter(function (e) {
          if (taken.indexOf(e.id) >= 0) return false;
          if (!q) return true;
          return [e.name].concat(e.aliases || []).some(function (l) { return EM().normKey(l).indexOf(q) >= 0; });
        });
        cand.slice(0, 8).forEach(function (e) {
          options.appendChild(chip((e.draft ? '✦ ' : '') + e.name, false, function () { link(e.id); }));
        });
        var raw = search.value.trim();
        if (raw && !cand.some(function (e) { return EM().normKey(e.name) === q; })) {
          options.appendChild(
            h(
              'button',
              {
                class: 'cp-pick cp-pick--new',
                type: 'button',
                onclick: function () {
                  var nd = EC().newDraft({ name: raw });
                  addDraft(nd, { id: draft().id, kind: 'relation', relType: relType.value }, 'start');
                  render();
                },
              },
              [icon('plus'), 'Créer « ' + raw + ' »']
            )
          );
        }
      }
      paintOptions();
      box.appendChild(list);
      box.appendChild(h('label', { class: 'cp-label', text: 'Type de lien' }));
      box.appendChild(relType);
      box.appendChild(dl);
      box.appendChild(h('label', { class: 'cp-label', text: 'Avec' }));
      box.appendChild(search);
      box.appendChild(options);
    }

    function renderReview(box) {
      box.appendChild(h('h2', { class: 'cp-q', text: 'Tout est bon ?' }));
      var all = st.order.map(function (id) { return st.drafts[id]; });
      all.forEach(function (d) {
        var list = EC().issues(st.schema, st.entities, d, all.filter(function (o) { return o !== d; }));
        var comp = EC().completeness(st.schema, d);
        var card = h('div', { class: 'cp-card' }, [
          h('div', { class: 'cp-card-head' }, [
            icon(typeIcon(d)),
            h('strong', { text: d.name || 'Sans nom' }),
            d.id === st.rootId ? null : h('span', { class: 'cp-chip cp-chip--ok', text: 'créé aussi' }),
            h(
              'button',
              {
                class: 'cp-link',
                type: 'button',
                onclick: function () {
                  if (d.id === frame().id) {
                    frame().step = 'identity';
                  } else {
                    st.stack.push({ id: d.id, step: 'identity', from: null });
                  }
                  render();
                },
              },
              [icon('pencil'), 'Modifier']
            ),
          ]),
          h('p', {
            class: 'cp-hint',
            text:
              (d.types.map(typeName).join(', ') || 'Sans type') +
              (comp.total ? ' · ' + comp.answered + '/' + comp.total + ' réponses' : '') +
              (d.relations.length ? ' · ' + d.relations.length + ' lien' + (d.relations.length > 1 ? 's' : '') : ''),
          }),
        ]);
        list.forEach(function (i) {
          card.appendChild(h('p', { class: 'cp-issue cp-issue--' + i.level }, [icon(i.level === 'error' ? 'alert-circle' : 'alert-triangle'), i.message]));
        });
        box.appendChild(card);
      });
    }

    function renderMain() {
      els.main.textContent = '';
      var step = steps()[stepIndex()];
      var box = els.main;
      if (step.kind === 'start') renderStart(box);
      else if (step.kind === 'identity') renderIdentity(box);
      else if (step.kind === 'component') renderComponent(box, step);
      else if (step.kind === 'links') renderLinks(box);
      else renderReview(box);
      var auto = box.querySelector('[data-autofocus]');
      if (auto && !els.main.querySelector(':focus')) {
        try {
          auto.focus();
        } catch (e) {
          /* detached in tests */
        }
      }
    }

    /* ── 5. Chrome: header, rail, aside, footer ───────────────────── */

    function renderHeader() {
      els.header.textContent = '';
      var crumbs = h('ol', { class: 'cp-crumbs' });
      st.stack.forEach(function (fr, i) {
        var d = st.drafts[fr.id];
        crumbs.appendChild(
          h('li', { class: i === st.stack.length - 1 ? 'is-on' : '' }, [d.name || (i === 0 ? 'Nouvelle entité' : 'Nouveau')])
        );
      });
      els.header.appendChild(h('div', { class: 'cp-title' }, [icon('wand'), h('span', { text: 'Composer une entité' })]));
      els.header.appendChild(crumbs);
      if (st.confirmClose) {
        els.header.appendChild(
          h('div', { class: 'cp-confirm' }, [
            h('span', { text: 'Abandonner cette composition ?' }),
            h('button', { class: 'cp-btn cp-btn--danger', type: 'button', onclick: close }, ['Abandonner']),
            h('button', { class: 'cp-btn', type: 'button', onclick: function () { st.confirmClose = false; renderHeader(); } }, ['Continuer']),
          ])
        );
      } else {
        els.header.appendChild(h('button', { class: 'cp-x cp-x--lg', type: 'button', 'aria-label': 'Fermer', onclick: requestClose }, [icon('x')]));
      }
    }

    function renderRail() {
      els.rail.textContent = '';
      var list = steps();
      var idx = stepIndex();
      var hasName = !!draft().name.trim();
      list.forEach(function (s, i) {
        var state = i < idx ? 'done' : i === idx ? 'on' : 'todo';
        var allowed = i <= 1 || hasName;
        els.rail.appendChild(
          h(
            'button',
            {
              class: 'cp-step cp-step--' + state,
              type: 'button',
              disabled: allowed ? null : true,
              'aria-current': state === 'on' ? 'step' : null,
              onclick: function () {
                goTo(s.key);
              },
            },
            [h('span', { class: 'cp-dot' }, [state === 'done' ? icon('check') : String(i + 1)]), h('span', { class: 'cp-step-name', text: s.title })]
          )
        );
      });
    }

    function valueText(f, v) {
      if (f.kind === 'ref') return nameOf(v);
      if (f.kind === 'refs') return v.map(nameOf).join(', ');
      return EM().formatValue(f, v, st.entities);
    }

    function renderAside() {
      els.aside.textContent = '';
      var d = draft();
      var comp = EC().completeness(st.schema, d);
      var card = h('div', { class: 'cp-preview' });
      card.appendChild(
        h('div', { class: 'cp-pv-head' }, [
          h('span', { class: 'cp-pv-icon' }, [icon(typeIcon(d))]),
          h('div', {}, [
            h('div', { class: 'cp-pv-name' + (d.name ? '' : ' is-empty'), text: d.name || 'Sans nom' }),
            h('div', { class: 'cp-pv-types' }, d.types.length ? d.types.map(function (t) { return h('span', { class: 'cp-chip', text: typeName(t) }); }) : [h('span', { class: 'cp-hint', text: 'Sans type' })]),
          ]),
        ])
      );
      if (d.aliases.length) card.appendChild(h('div', { class: 'cp-pv-aliases', text: 'aussi : ' + d.aliases.join(', ') }));
      if (comp.total) {
        card.appendChild(
          h('div', { class: 'cp-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(comp.total), 'aria-valuenow': String(comp.answered), 'aria-label': 'Réponses' }, [
            h('span', { style: 'width:' + Math.round(comp.ratio * 100) + '%' }),
          ])
        );
        card.appendChild(h('div', { class: 'cp-hint', text: comp.answered + ' / ' + comp.total + ' réponses' }));
      }
      EM()
        .componentIdsOf(st.schema, d)
        .forEach(function (cid) {
          var c = EM().findById(st.schema.components, cid);
          if (!c) return;
          var rows = c.fields.filter(function (f) { return d.answers[cid + '.' + f.key] !== undefined; });
          if (!rows.length) return;
          var sec = h('div', { class: 'cp-pv-sec' }, [h('div', { class: 'cp-pv-sech', text: c.name })]);
          rows.forEach(function (f) {
            sec.appendChild(h('div', { class: 'cp-pv-row' }, [h('span', { text: f.label }), h('b', { text: valueText(f, d.answers[cid + '.' + f.key]) })]));
          });
          card.appendChild(sec);
        });
      if (d.relations.length) {
        var lsec = h('div', { class: 'cp-pv-sec' }, [h('div', { class: 'cp-pv-sech', text: 'Liens' })]);
        d.relations.forEach(function (r) {
          lsec.appendChild(h('div', { class: 'cp-pv-row' }, [h('span', { text: r.type }), h('b', { text: nameOf(r.to) })]));
        });
        card.appendChild(lsec);
      }
      var also = st.order.filter(function (id) { return id !== d.id; });
      if (also.length) {
        var asec = h('div', { class: 'cp-pv-sec' }, [h('div', { class: 'cp-pv-sech', text: 'Sera créé aussi' })]);
        also.forEach(function (id) {
          var o = st.drafts[id];
          asec.appendChild(h('div', { class: 'cp-pv-row' }, [h('span', { text: o.types.map(typeName).join(', ') || 'Entité' }), h('b', { text: o.name || 'Sans nom' })]));
        });
        card.appendChild(asec);
      }
      els.aside.appendChild(card);
    }

    function stepHasAnswer(step) {
      if (step.kind !== 'component') return true;
      var comp = EM().findById(st.schema.components, step.componentId);
      return comp.fields.some(function (f) { return draft().answers[comp.id + '.' + f.key] !== undefined; });
    }

    function renderFooter() {
      els.footer.textContent = '';
      var list = steps();
      var idx = stepIndex();
      var step = list[idx];
      var last = idx === list.length - 1;
      var sub = isSub();
      var canBack = idx > 0 || (sub && !!frame().from);
      var backLabel = idx > 0 ? 'Retour' : sub && frame().from ? 'Annuler cet ajout' : 'Retour';
      els.footer.appendChild(
        h('button', { class: 'cp-btn', type: 'button', disabled: canBack || sub ? null : true, onclick: back }, [icon('arrow-left'), backLabel])
      );
      els.footer.appendChild(h('span', { class: 'cp-spacer' }));
      var nameMissing = !draft().name.trim() && step.kind !== 'start' && step.kind !== 'identity';
      if (step.kind === 'review') {
        var allDrafts = st.order.map(function (id) { return st.drafts[id]; });
        var blocked = allDrafts.some(function (d) {
          return EC().hasError(EC().issues(st.schema, st.entities, d, allDrafts.filter(function (o) { return o !== d; })));
        });
        els.footer.appendChild(
          h('button', { class: 'cp-btn', type: 'button', disabled: blocked ? true : null, onclick: function () { finish(true); } }, [icon('plus'), 'Créer et en ajouter une autre'])
        );
        els.footer.appendChild(
          h(
            'button',
            { class: 'cp-btn cp-btn--primary', type: 'button', disabled: blocked ? true : null, onclick: function () { finish(false); } },
            [icon('check'), 'Créer ' + allDrafts.length + (allDrafts.length > 1 ? ' entités' : ' l’entité')]
          )
        );
        return;
      }
      var label = last && sub ? 'Ajouter et revenir' : !stepHasAnswer(step) ? 'Passer' : 'Suivant';
      var blockedNext = step.kind === 'identity' && !draft().name.trim();
      els.footer.appendChild(
        h(
          'button',
          { class: 'cp-btn cp-btn--primary', type: 'button', disabled: blockedNext || nameMissing ? true : null, onclick: next },
          [label, icon(last && sub ? 'corner-down-left' : 'arrow-right')]
        )
      );
    }

    function refresh() {
      gc();
      renderHeader();
      renderRail();
      renderAside();
      renderFooter();
    }

    function render() {
      refresh();
      renderMain();
    }

    /** Drafts nobody links to any more (unselected from a question) are not created. */
    function gc() {
      var keep = {};
      function visit(id) {
        if (keep[id] || !st.drafts[id]) return;
        keep[id] = true;
        var d = st.drafts[id];
        Object.keys(d.answers).forEach(function (p) {
          var v = d.answers[p];
          (Array.isArray(v) ? v : [v]).forEach(function (x) { if (typeof x === 'string') visit(x); });
        });
        d.relations.forEach(function (r) { visit(r.to); });
      }
      visit(st.rootId);
      st.stack.forEach(function (fr) { keep[fr.id] = true; });
      st.order = st.order.filter(function (id) {
        if (keep[id]) return true;
        delete st.drafts[id];
        return false;
      });
    }

    /* ── 6. Flow ──────────────────────────────────────────────────── */

    function goTo(key) {
      if (frame().step === key) return;
      if (frame().step === 'start') applyIntentNow();
      frame().step = key;
      render();
    }

    function next() {
      var list = steps();
      var idx = stepIndex();
      var step = list[idx];
      if (step.kind === 'start') applyIntentNow();
      if (step.kind === 'identity' && !draft().name.trim()) {
        var n = els.main.querySelector('.cp-input--big');
        if (n) n.focus();
        return;
      }
      if (step.kind === 'review') return;
      if (idx === list.length - 1) return returnToParent();
      // the type picked on "start" may have changed the steps: recompute from the new list
      frame().step = steps()[Math.min(idx + 1, steps().length - 1)].key;
      render();
    }

    function back() {
      var idx = stepIndex();
      if (idx > 0) {
        frame().step = steps()[idx - 1].key;
        render();
        return;
      }
      if (st.stack.length > 1) {
        var fr = st.stack.pop();
        if (fr.from) {
          // cancelled sub-interview: the draft disappears
          delete st.drafts[fr.id];
          st.order = st.order.filter(function (id) { return id !== fr.id; });
        }
        render();
      }
    }

    /** End of a sub-interview: link the new entity into the question it came from, and go back there. */
    function returnToParent() {
      var fr = st.stack.pop();
      var from = fr.from;
      if (from) {
        var parent = st.drafts[from.id];
        if (from.kind === 'answer') parent = EC().setAnswer(parent, from.path, fr.id);
        else if (from.kind === 'answers') parent = EC().setAnswer(parent, from.path, (parent.answers[from.path] || []).concat([fr.id]));
        else parent = EC().addRelationTo(parent, from.relType, fr.id);
        st.drafts[from.id] = parent;
      }
      render();
    }

    function finish(again) {
      var all = st.order.map(function (id) { return st.drafts[id]; });
      var r = EC().finalize(st.schema, st.entities, all);
      var res = {
        schema: st.schema,
        entities: r.entities,
        created: r.created,
        rootId: st.rootId,
        again: !!again,
        types: st.drafts[st.rootId].types.slice(),
      };
      teardown();
      if (ctx.onDone) ctx.onDone(res);
    }

    function requestClose() {
      var d = st.drafts[st.rootId];
      if (!d || (!d.name.trim() && !d.intent && st.order.length <= 1 && !d.types.length)) return close();
      st.confirmClose = true;
      renderHeader();
    }

    function teardown() {
      document.removeEventListener('keydown', onKey, true);
      if (els.overlay.parentNode) els.overlay.parentNode.removeChild(els.overlay);
      try {
        if (opener && opener.focus) opener.focus();
      } catch (e) {
        /* ignore */
      }
    }

    function close() {
      teardown();
      if (ctx.onClose) ctx.onClose();
    }

    function onKey(ev) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        if (st.confirmClose) {
          st.confirmClose = false;
          renderHeader();
        } else {
          requestClose();
        }
        return;
      }
      if (ev.key === 'Tab') {
        var f = Array.prototype.filter.call(dialog.querySelectorAll('button, input, select, textarea, [href]'), function (x) {
          return !x.disabled && x.offsetParent !== null;
        });
        if (!f.length) return;
        var first = f[0];
        var lastEl = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault();
          lastEl.focus();
        } else if (!ev.shiftKey && document.activeElement === lastEl) {
          ev.preventDefault();
          first.focus();
        }
        return;
      }
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
        var tg = ev.target;
        if (tg && tg.tagName === 'INPUT' && tg.type !== 'checkbox' && !tg.hasAttribute('data-noenter')) {
          ev.preventDefault();
          next();
        }
      }
    }

    // boot
    var root = EC().newDraft({ types: (ctx.initialTypes || []).filter(function (t) { return !!EM().findById(st.schema.types, t); }) });
    root.intent = ctx.initialText || '';
    st.rootId = root.id;
    addDraft(root, null, 'start');
    if (root.intent) applyIntentNow();
    document.addEventListener('keydown', onKey, true);
    els.overlay.addEventListener('mousedown', function (ev) {
      if (ev.target === els.overlay) requestClose();
    });
    document.body.appendChild(els.overlay);
    render();

    return { close: close, state: st, els: els, next: next, back: back, finish: finish, render: render };
  }

  global.EntitiesComposerUI = { open: open };
})(typeof window !== 'undefined' ? window : this);
