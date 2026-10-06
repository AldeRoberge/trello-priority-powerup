/*
 * Role: UI of the Entity composer: ONE page to create an entity. An ARCHETYPE is a predefined model (a bundle of
 * components with default values); an ENTITY is an instance of it that stores only its overrides. The page:
 *   1. Name      one field ("Monstera, une plante au travail" is understood: name, archetype, place) + aliases
 *   2. Archetype pills grouped by nature (installed ones, ready-made library ones with a "+", a new one);
 *                several can be combined
 *   3. Components one card per component the archetypes bring, filled in place; "+ Composant" adds more
 *                (existing ones, or a new one written in a line)
 *   4. Links     relations to other entities, with the relations that fit what is being created
 * Fields left empty take the archetype's default (shown as "par défaut"). Linking to something that does not
 * exist offers "Créer « Salon »": the same page opens for it and comes back. Nothing is written until the
 * final "Créer". Logic: EntitiesComposer.
 *
 * Usage: EntitiesComposerUI.open({ schema, entities, initialText?, initialTypes?, onDone(result) })
 *   result = { schema, entities, created, rootId, again, types }
 *
 * Contents: 1 helpers | 2 open: state | 3 page | 4 field controls | 5 links | 6 chrome | 7 flow
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

  function issueIcon(level) {
    return icon(level === 'error' ? 'alert-circle' : level === 'info' ? 'info-circle' : 'alert-triangle');
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
      stack: [], // frames: { id, from: {id, kind, path, relType}|null }
      rootId: '',
      confirmClose: false,
      newType: null, // { name, aliases, comps:[], fieldsText, nature, parents:[], role, error } while the inline form is open
      newComp: null, // { name, fieldsText, error } while the "new component" form is open
      filter: '', // archetype search
      libMsg: '', // outcome of the last library install
      focusName: true,
      pillsOpen: false, // full archetype list (grouped, searchable) shown instead of the few suggestions
      showAlias: false, // optional sections stay hidden until asked for (or until they hold something)
      showLinks: false,
      showComps: false,
      openComps: {}, // component cards the user opened
      ideas: [], // AI suggestions for the current name and genres
      ideasLoading: false,
      ideasSeq: 0,
    };

    var els = {
      overlay: h('div', { class: 'cp-overlay' }),
      header: h('header', { class: 'cp-head' }),
      main: h('section', { class: 'cp-main' }),
      aside: h('aside', { class: 'cp-aside', 'aria-label': 'Aperçu' }),
      footer: h('footer', { class: 'cp-foot' }),
    };
    var dialog = h(
      'div',
      { class: 'cp-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Composer une entité' },
      [els.header, h('div', { class: 'cp-body' }, [els.main, els.aside]), els.footer]
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
      return st.stack.length > 1;
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
    function addDraft(d, from) {
      setDraft(d);
      st.order.push(d.id);
      st.stack.push({ id: d.id, from: from || null });
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

    /* ── 3. Page ──────────────────────────────────────────────────── */

    /** Reads the typed text as a sentence once (name, archetypes, answers, links) and keeps only the name in the field. */
    function commitIntent() {
      var d = draft();
      var text = (d.intent || '').trim();
      if (!text || d.intentApplied === text) return false;
      var r = EC().readIntent(st.schema, st.entities, text);
      var structured = r.types.length || Object.keys(r.answers).length || r.relations.length;
      var nd = EC().pruneAnswers(st.schema, EC().applyIntent(st.schema, Object.assign({}, d, { name: '' }), r));
      nd.name = r.name || d.name;
      nd.intent = nd.name;
      nd.intentApplied = nd.name;
      setDraft(nd);
      nameSec = null; // the field now shows only the name
      return !!structured;
    }

    function nameBlock() {
      var sec = h('div', { class: 'cp-sec cp-sec--name' });
      var understood = h('div', { class: 'cp-understood', 'aria-live': 'polite' });
      var issuesBox = h('div', { class: 'cp-issues', 'aria-live': 'polite' });
      var input = h('input', {
        class: 'cp-input cp-input--big',
        placeholder: 'Nom',
        'aria-label': 'Nom',
        'data-name': '1',
        'data-noenter': '1',
        autocomplete: 'off',
        value: draft().intent || draft().name || '',
        oninput: function () {
          var text = input.value;
          var r = EC().readIntent(st.schema, st.entities, text);
          setDraft(Object.assign({}, draft(), { intent: text, name: r.name || '' }));
          paintUnderstood(r);
          paintIssues();
          refresh();
          renderRest(true);
          scheduleIdeas();
        },
        onblur: function () {
          if (commitIntent()) {
            renderMain();
            refresh();
          }
        },
        onkeydown: function (ev) {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          if (commitIntent()) {
            renderMain();
            refresh();
          }
        },
      });
      function paintUnderstood(r) {
        understood.textContent = '';
        r = r || EC().readIntent(st.schema, st.entities, draft().intent || '');
        if (r.name === (draft().intent || '').trim() && !r.types.length) return;
        r.types.forEach(function (t) {
          understood.appendChild(h('span', { class: 'cp-chip cp-chip--ok' }, [icon('category'), typeName(t)]));
        });
        Object.keys(r.answers).forEach(function (p) {
          var f = EM().fieldOf(st.schema, p);
          if (f) understood.appendChild(h('span', { class: 'cp-chip cp-chip--ok' }, [icon('link'), f.field.label + ' : ' + EM().formatValue(f.field, r.answers[p], st.entities)]));
        });
        r.relations.forEach(function (x) {
          understood.appendChild(h('span', { class: 'cp-chip cp-chip--ok' }, [icon('link'), x.type + ' ' + nameOf(x.to)]));
        });
      }
      function paintIssues() {
        issuesBox.textContent = '';
        EC()
          .issues(st.schema, st.entities, draft(), otherDrafts())
          .forEach(function (i) {
            if (i.code !== 'duplicate-name' && i.code !== 'alias-clash') return;
            issuesBox.appendChild(h('p', { class: 'cp-issue cp-issue--' + i.level }, [issueIcon(i.level), i.message]));
          });
      }
      var aliasBox = h('div', { class: 'cp-chipedit' });
      var aliasIn = h('input', {
        class: 'cp-chipedit-in',
        placeholder: 'Autres noms : travail, work, bureau…',
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
        var cur = draft().aliases;
        splitList(v).forEach(function (a) {
          var key = EM().normKey(a);
          if (key && !cur.some(function (x) { return EM().normKey(x) === key; })) cur = cur.concat([a]);
        });
        aliasIn.value = '';
        setDraft(Object.assign({}, draft(), { aliases: cur }));
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
              h('button', { class: 'cp-x', type: 'button', 'aria-label': 'Retirer l’alias ' + a, onclick: function () { setAliases(draft().aliases.filter(function (_x, j) { return j !== i; })); } }, [icon('x')]),
            ])
          );
        });
        aliasBox.appendChild(aliasIn);
      }
      paintAliases();
      paintUnderstood();
      paintIssues();
      sec.appendChild(input);
      sec.appendChild(understood);
      if (st.showAlias || draft().aliases.length) sec.appendChild(aliasBox);
      sec.appendChild(issuesBox);
      return sec;
    }

    /* Archetypes ------------------------------------------------------ */

    function installPreset(pid) {
      commitIntent();
      var r = global.EntitiesLibrary.install(st.schema, pid);
      if (r.error) {
        st.libMsg = 'Le schéma est trop grand pour ajouter cet archétype : retirez des archétypes ou composants inutilisés.';
        renderMain();
        return;
      }
      st.schema = r.schema;
      st.libMsg = r.added.types.length > 1 ? 'Ajouté aussi : ' + r.added.types.filter(function (n) { return n !== (global.EntitiesLibrary.presetType(pid) || {}).name; }).join(', ') + '.' : '';
      var tid = r.typeIds[pid];
      if (tid) setDraft(EC().pruneAnswers(st.schema, EC().toggleType(st.schema, draft(), tid, true)));
      renderMain();
      refresh();
    }

    /** A few archetypes worth proposing for what was typed: name matches first, then the most used ones. */
    function suggestedChoices(all, d) {
      var q = EM().normKey(d.name || '');
      var used = {};
      st.entities.forEach(function (e) {
        (e.types || []).forEach(function (t) {
          used[t] = (used[t] || 0) + 1;
        });
      });
      var rest = all.filter(function (c) {
        return d.types.indexOf(c.id) < 0;
      });
      function score(c) {
        var n = EM().normKey(c.name);
        var s = 0;
        if (q && (q.indexOf(n) >= 0 || n.indexOf(q) >= 0)) s += 1000;
        if (c.installed) s += 100 + Math.min(used[c.id] || 0, 99);
        return s;
      }
      return rest
        .map(function (c, i) {
          return { c: c, i: i, s: score(c) };
        })
        .sort(function (a, b) {
          return b.s - a.s || a.i - b.i;
        })
        .slice(0, 5)
        .map(function (o) {
          return o.c;
        });
    }

    function archetypeBlock() {
      var sec = h('div', { class: 'cp-sec cp-sec--arch' });
      var d = draft();
      var expanded = st.pillsOpen;
      sec.appendChild(h('h3', { class: 'cp-sec-title', text: d.types.length ? 'Genre' : 'Quel genre de chose ?' }));
      var search = h('input', {
        class: 'cp-input cp-input--small',
        type: 'search',
        placeholder: 'Chercher…',
        'aria-label': 'Chercher un archétype',
        'data-noenter': '1',
        value: st.filter,
        oninput: function () {
          st.filter = search.value;
          paintPills();
        },
      });
      var pills = h('div', { class: expanded ? 'cp-pgroups' : 'cp-pills' });
      function pillFor(c) {
        var on = d.types.indexOf(c.id) >= 0;
        return h(
          'button',
          {
            class: 'cp-pill' + (on ? ' is-on' : '') + (c.installed ? '' : ' is-lib'),
            type: 'button',
            'aria-pressed': c.installed ? (on ? 'true' : 'false') : null,
            title: c.description || null,
            onclick: function () {
              commitIntent();
              if (!c.installed) return installPreset(c.id);
              var cur = draft().types.indexOf(c.id) >= 0;
              setDraft(EC().pruneAnswers(st.schema, EC().toggleType(st.schema, draft(), c.id, !cur)));
              renderMain();
              refresh();
            },
          },
          [icon(c.installed ? c.icon : 'plus'), c.name, c.role ? h('em', { text: ' rôle' }) : null]
        );
      }
      function paintPills() {
        pills.textContent = '';
        var all = EC().archetypeChoices(st.schema, global.EntitiesLibrary);
        if (!expanded) {
          all
            .filter(function (c) {
              return d.types.indexOf(c.id) >= 0;
            })
            .concat(suggestedChoices(all, d))
            .forEach(function (c) {
              pills.appendChild(pillFor(c));
            });
          return;
        }
        var q = EM().normKey(st.filter);
        var list = all.filter(function (c) {
          return !q || EM().normKey(c.name).indexOf(q) >= 0;
        });
        var groups = {};
        var order = [];
        list.forEach(function (c) {
          var k = c.nature || '';
          if (!groups[k]) {
            groups[k] = [];
            order.push(k);
          }
          groups[k].push(c);
        });
        order.forEach(function (k) {
          var nat = EM().natureById(k);
          var row = h('div', { class: 'cp-pills' });
          groups[k].forEach(function (c) {
            row.appendChild(pillFor(c));
          });
          pills.appendChild(
            h('div', { class: 'cp-pgroup' }, [h('span', { class: 'cp-pgroup-name' }, [nat ? icon(nat.icon) : null, nat ? nat.name : 'Autre']), row])
          );
        });
        if (!list.length) pills.appendChild(h('span', { class: 'cp-hint', text: 'Aucun archétype ne correspond.' }));
      }
      paintPills();
      if (expanded) sec.appendChild(search);
      sec.appendChild(pills);
      var tools = h('div', { class: 'cp-row' }, [
        h(
          'button',
          {
            class: 'cp-quiet',
            type: 'button',
            onclick: function () {
              st.pillsOpen = !expanded;
              renderMain();
            },
          },
          [expanded ? 'Moins de choix' : 'Voir tous les genres']
        ),
      ]);
      if (expanded) {
        tools.appendChild(
          h(
            'button',
            {
              class: 'cp-quiet',
              type: 'button',
              onclick: function () {
                st.newType = st.newType || { name: '', aliases: '', comps: [], fieldsText: '', nature: '', parents: [], role: false, error: '' };
                renderMain();
              },
            },
            ['Créer un nouveau genre']
          )
        );
      }
      sec.appendChild(tools);
      if (st.libMsg) sec.appendChild(h('p', { class: 'cp-hint', role: 'status', text: st.libMsg }));
      if (st.newType) sec.appendChild(newTypeForm());
      return sec;
    }

    function newTypeForm() {
      var nt = st.newType;
      var nameIn = h('input', { class: 'cp-input', placeholder: 'Ex. : Outil', value: nt.name, 'aria-label': 'Nom de l’archétype', 'data-noenter': '1' });
      var aliasIn = h('input', { class: 'cp-input', placeholder: 'alias : tool, équipement', value: nt.aliases, 'aria-label': 'Alias de l’archétype', 'data-noenter': '1' });
      var fieldsIn = h('input', {
        class: 'cp-input',
        placeholder: 'Ex. : État (choix: neuf/usé), Achat (date), Lieu (lien: Lieu), Prix (nombre)',
        value: nt.fieldsText,
        'aria-label': 'Champs de l’archétype',
        'data-noenter': '1',
      });
      var preview = h('div', { class: 'cp-understood' });
      var errBox = h('p', { class: 'cp-error', role: 'alert', hidden: nt.error ? null : true, text: nt.error });
      function paintPreview() {
        preview.textContent = '';
        EC()
          .parseFieldSpec(fieldsIn.value, st.schema)
          .forEach(function (f) {
            var kind = {
              text: 'texte', number: 'nombre', date: 'date', bool: 'oui/non', choice: 'choix', ref: 'lien', refs: 'liens',
              multi: 'choix multiple', longtext: 'texte long', geo: 'coordonnées', url: 'lien web',
            }[f.kind];
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
      var natureSel = h('select', {
        class: 'cp-input',
        'aria-label': 'Nature de l’archétype',
        onchange: function () { nt.nature = natureSel.value; },
      });
      natureSel.appendChild(h('option', { value: '', text: 'Je ne sais pas / autre' }));
      EM().NATURES.forEach(function (n) {
        natureSel.appendChild(h('option', { value: n.id, text: n.name + ' : ' + n.hint }));
      });
      natureSel.value = nt.nature || '';
      var parentBox = h('div', { class: 'cp-checks' });
      st.schema.types.forEach(function (ty) {
        parentBox.appendChild(
          h('label', { class: 'cp-check' }, [
            h('input', {
              type: 'checkbox',
              checked: nt.parents.indexOf(ty.id) >= 0 ? true : null,
              onchange: function (ev) {
                nt.parents = nt.parents.filter(function (x) { return x !== ty.id; });
                if (ev.target.checked) nt.parents.push(ty.id);
              },
            }),
            ty.name,
          ])
        );
      });
      var roleIn = h('input', { type: 'checkbox', checked: nt.role ? true : null, onchange: function (ev) { nt.role = ev.target.checked; } });
      return h('div', { class: 'cp-card' }, [
        h('h3', { class: 'cp-sub', text: 'Nouvel archétype' }),
        h('label', { class: 'cp-label', text: 'Nom' }),
        nameIn,
        h('label', { class: 'cp-label', text: 'Nature : qu’est-ce que c’est, au fond ?' }),
        natureSel,
        st.schema.types.length ? h('label', { class: 'cp-label', text: 'Est une sorte de… (reprend ses composants et ses valeurs par défaut)' }) : null,
        st.schema.types.length ? parentBox : null,
        h('label', { class: 'cp-check' }, [roleIn, 'C’est un rôle : une entité l’est dans un contexte (Travailleur, Client), pas par nature']),
        h('label', { class: 'cp-label', text: 'Alias (séparés par des virgules)' }),
        aliasIn,
        st.schema.components.length ? h('label', { class: 'cp-label', text: 'Réutiliser des composants' }) : null,
        st.schema.components.length ? comps : null,
        h('label', { class: 'cp-label', text: 'Nouveaux champs (nom (genre: détail), …)' }),
        fieldsIn,
        preview,
        h('p', { class: 'cp-hint', text: 'Genres : texte, texte-long, nombre (ex. nombre: kg), date, oui-non, choix: a/b/c, choix-multiple: a/b, geo, url, lien: Type, liens: Type.' }),
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
                  nature: nt.nature,
                  parents: nt.parents,
                  role: nt.role,
                  component: { name: nt.name, fieldsText: nt.fieldsText },
                });
                if (r.error) {
                  nt.error =
                    r.error === 'type-exists' ? 'Un archétype porte déjà ce nom (ou cet alias).' : r.error === 'name-required' ? 'Donnez un nom à l’archétype.' : 'Impossible de créer l’archétype.';
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
            [icon('check'), 'Créer l’archétype et le choisir']
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

    /* Components ------------------------------------------------------ */

    function componentCard(cid) {
      var comp = EM().findById(st.schema.components, cid);
      if (!comp || !comp.fields.length) return null;
      var d = draft();
      var owners = d.types
        .filter(function (tid) {
          return EM()
            .typeLineage(st.schema, tid)
            .some(function (t) {
              return t.components.indexOf(cid) >= 0;
            });
        })
        .map(typeName);
      var filled = comp.fields.filter(function (f) {
        return d.answers[cid + '.' + f.key] !== undefined;
      }).length;
      var head = h('summary', { class: 'cp-ccard-head' }, [
        icon('chevron-right'),
        h('strong', { text: comp.name }),
        h('span', { class: 'cp-hint', text: filled ? filled + ' / ' + comp.fields.length : owners.join(' + ') }),
      ]);
      if (!owners.length) {
        head.appendChild(
          h(
            'button',
            {
              class: 'cp-x',
              type: 'button',
              'aria-label': 'Retirer le composant ' + comp.name,
              onclick: function (ev) {
                ev.preventDefault();
                setDraft(EC().toggleComponent(st.schema, draft(), cid, false));
                renderMain();
                refresh();
              },
            },
            [icon('x')]
          )
        );
      }
      var grid = h('div', { class: 'cp-fields' });
      comp.fields.forEach(function (f) {
        var path = cid + '.' + f.key;
        var wide = f.kind === 'longtext' || f.kind === 'refs' || f.kind === 'ref' || f.kind === 'multi' || f.kind === 'choice';
        grid.appendChild(
          h('div', { class: 'cp-field' + (wide ? ' cp-field--wide' : '') }, [
            h('label', { class: 'cp-field-label', text: f.label }),
            fieldControl(path, f),
            defaultLine(path, f),
          ])
        );
      });
      var card = h('details', { class: 'cp-ccard', open: filled || st.openComps[cid] ? true : null }, [head, grid]);
      card.addEventListener('toggle', function () {
        st.openComps[cid] = card.open;
      });
      return card;
    }

    function componentsBlock() {
      var d = draft();
      var ids = EM().componentIdsOf(st.schema, d);
      if (!ids.length && !st.showComps) return null;
      var sec = h('div', { class: 'cp-sec' });
      sec.appendChild(h('h3', { class: 'cp-sec-title', text: 'Détails' }));
      var list = h('div', { class: 'cp-ccards' });
      ids.forEach(function (cid) {
        var card = componentCard(cid);
        if (card) list.appendChild(card);
      });
      if (list.childNodes.length) sec.appendChild(list);
      if (!st.showComps) return sec;
      var more = h('div', { class: 'cp-pills' });
      EC()
        .componentsAvailable(st.schema, d)
        .forEach(function (c) {
          more.appendChild(
            h(
              'button',
              {
                class: 'cp-pill cp-pill--comp',
                type: 'button',
                title: c.fields.map(function (x) { return x.label; }).join(', '),
                onclick: function () {
                  setDraft(EC().toggleComponent(st.schema, draft(), c.id, true));
                  st.openComps[c.id] = true;
                  renderMain();
                  refresh();
                },
              },
              [icon('plus'), c.name]
            )
          );
        });
      more.appendChild(
        h(
          'button',
          {
            class: 'cp-pill cp-pill--new',
            type: 'button',
            onclick: function () {
              st.newComp = st.newComp || { name: '', fieldsText: '', error: '' };
              renderMain();
            },
          },
          [icon('plus'), 'Nouveau']
        )
      );
      sec.appendChild(more);
      if (st.newComp) sec.appendChild(newComponentForm());
      return sec;
    }

    function newComponentForm() {
      var nc = st.newComp;
      var nameIn = h('input', { class: 'cp-input', placeholder: 'Nom : Entretien', value: nc.name, 'aria-label': 'Nom du composant', 'data-noenter': '1' });
      var fieldsIn = h('input', {
        class: 'cp-input',
        placeholder: 'Champs : Arrosage tous les (nombre: jours), Dernier arrosage (date), Santé (choix: bonne/fragile)',
        value: nc.fieldsText,
        'aria-label': 'Champs du composant',
        'data-noenter': '1',
      });
      var preview = h('div', { class: 'cp-understood' });
      var err = h('p', { class: 'cp-error', role: 'alert', hidden: nc.error ? null : true, text: nc.error });
      var kindName = { text: 'texte', number: 'nombre', date: 'date', bool: 'oui/non', choice: 'choix', ref: 'lien', refs: 'liens', multi: 'choix multiple', longtext: 'texte long', geo: 'coordonnées', url: 'lien web' };
      function sync() {
        nc.name = nameIn.value;
        nc.fieldsText = fieldsIn.value;
        preview.textContent = '';
        EC()
          .parseFieldSpec(nc.fieldsText, st.schema)
          .forEach(function (f) {
            preview.appendChild(h('span', { class: 'cp-chip' }, [f.label, h('em', { text: ' ' + kindName[f.kind] })]));
          });
      }
      nameIn.addEventListener('input', sync);
      fieldsIn.addEventListener('input', sync);
      sync();
      return h('div', { class: 'cp-card' }, [
        h('h3', { class: 'cp-sub', text: 'Nouveau composant' }),
        nameIn,
        fieldsIn,
        preview,
        h('p', { class: 'cp-hint', text: 'Genres : texte, texte-long, nombre (ex. nombre: kg), date, oui-non, choix: a/b/c, choix-multiple: a/b, geo, url, lien: Archétype, liens: Archétype.' }),
        err,
        h('div', { class: 'cp-row' }, [
          h(
            'button',
            {
              class: 'cp-btn cp-btn--primary',
              type: 'button',
              onclick: function () {
                sync();
                var r = EC().defineComponent(st.schema, nc.name, nc.fieldsText);
                if (r.error) {
                  nc.error = r.error === 'name-required' ? 'Donnez un nom au composant.' : r.error === 'fields-required' ? 'Décrivez au moins un champ.' : 'Impossible de créer le composant.';
                  renderMain();
                  return;
                }
                st.schema = r.schema;
                st.newComp = null;
                setDraft(EC().toggleComponent(st.schema, draft(), r.componentId, true));
                renderMain();
                refresh();
              },
            },
            [icon('check'), 'Créer et ajouter']
          ),
          h('button', { class: 'cp-btn', type: 'button', onclick: function () { st.newComp = null; renderMain(); } }, ['Annuler']),
        ]),
      ]);
    }

    /* ── 4. Field controls ────────────────────────────────────────── */

    /** "par défaut : X (Plante)": what the field gets when left empty (archetype default or model entity). */
    function defaultLine(path, f) {
      if (draft().answers[path] !== undefined) return null;
      var df = EC().defaultFor(st.schema, st.entities, draft(), path);
      if (!df) return null;
      return h('span', { class: 'cp-inherit' }, [icon(df.source === 'model' ? 'git-fork' : 'sparkles'), 'par défaut : ' + valueText(f, df.value) + (df.from ? ' (' + df.from + ')' : '')]);
    }

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
      if (f.kind === 'multi') {
        wrap.className = 'cp-ctl cp-ctl--chips';
        (function paintMulti() {
          wrap.textContent = '';
          var cur = draft().answers[path] || [];
          (f.options || []).forEach(function (o) {
            var on = cur.indexOf(o) >= 0;
            wrap.appendChild(
              chip(o, on, function () {
                answer(path, on ? cur.filter(function (x) { return x !== o; }) : cur.concat([o]));
                paintMulti();
              })
            );
          });
        })();
        return wrap;
      }
      if (f.kind === 'longtext') {
        var ta = h('textarea', {
          class: 'cp-input cp-input--area',
          rows: '4',
          maxlength: '1500',
          'aria-label': f.label,
          oninput: function () { answer(path, ta.value); },
        });
        ta.value = val == null ? '' : String(val);
        wrap.appendChild(ta);
        return wrap;
      }
      var type = f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : f.kind === 'url' ? 'url' : 'text';
      var inp = h('input', {
        class: 'cp-input',
        type: type,
        step: f.kind === 'number' ? 'any' : null,
        placeholder: f.kind === 'geo' ? 'latitude, longitude (45.5017, -73.5673)' : f.kind === 'url' ? 'https://…' : null,
        value: val == null ? '' : String(val),
        'aria-label': f.label + (f.unit ? ' (' + f.unit + ')' : ''),
        oninput: function () {
          answer(path, inp.value);
        },
      });
      wrap.appendChild(f.unit ? h('div', { class: 'cp-unit' }, [inp, h('span', { class: 'cp-unit-sfx', text: f.unit })]) : inp);
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
          if (!EC().eligible(f, e, draft(), st.schema)) return false;
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
        addDraft(nd, { id: draft().id, kind: multi ? 'answers' : 'answer', path: path });
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
        st.stack.push({ id: id, from: null });
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
            if (e.draft && !seen[e.id] && EC().eligible(f, e, draft(), st.schema)) list.push(e);
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
        if (q && !pool().some(function (e) { return EM().normKey(e.name) === EM().normKey(q) && EC().eligible(f, e, draft(), st.schema); })) {
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

    /* ── 5. Links ─────────────────────────────────────────────────── */

    function renderLinks(box) {
      var d = draft();
      var ask = EC().linksPrompt(st.schema, d);
      box.appendChild(h('h3', { class: 'cp-sec-title', text: ask.title }));
      var remarks = h('div', { class: 'cp-issues', 'aria-live': 'polite' });
      var linkError = h('p', { class: 'cp-error', role: 'alert', hidden: true });
      function paintRemarks() {
        remarks.textContent = '';
        EC()
          .issues(st.schema, st.entities, draft(), otherDrafts())
          .forEach(function (i) {
            if (i.code === 'floating' || i.code === 'relation-nature' || i.code === 'cycle') {
              remarks.appendChild(h('p', { class: 'cp-issue cp-issue--' + i.level }, [issueIcon(i.level), i.message]));
            }
          });
      }
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
        paintRemarks();
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
      var choices = EC().relationChoices(st.schema, st.entities, d);
      choices.forEach(function (c) {
        dl.appendChild(h('option', { value: c.label }));
      });
      relType.value = ask.suggested[0] || choices[0].label;
      var relHint = h('span', { class: 'cp-hint' });
      function paintRelHint() {
        var m = EM().matchRelation(relType.value);
        relHint.textContent = m
          ? m.def.symmetric
            ? 'Lien symétrique.'
            : 'Vu de l’autre côté : « ' + EM().inverseLabel(relType.value) + ' ».'
          : 'Lien libre (non reconnu par l’ontologie).';
      }
      relType.addEventListener('input', paintRelHint);
      paintRelHint();
      var relChips = h('div', { class: 'cp-quick' });
      choices.slice(0, 5).forEach(function (c) {
        relChips.appendChild(
          chip(c.label, false, function () {
            relType.value = c.label;
            paintRelHint();
          }, c.inverse && c.inverse !== c.label ? 'Autre côté : ' + c.inverse : null)
        );
      });
      var search = h('input', { class: 'cp-input', placeholder: 'Chercher une entité, ou taper un nom à créer…', 'aria-label': 'Entité à lier', 'data-noenter': '1', oninput: paintOptions });
      var options = h('div', { class: 'cp-quick' });
      function link(id) {
        var all = st.entities.concat(
          st.order.map(function (did) {
            return EC().pseudoEntity(st.schema, st.drafts[did]);
          })
        );
        if (EM().wouldCycleRelation(st.schema, all, draft().id, relType.value, id)) {
          linkError.textContent = '« ' + nameOf(id) + ' » contient déjà « ' + (draft().name || 'cette entité') + ' » : ce lien ferait une boucle.';
          linkError.hidden = false;
          return;
        }
        linkError.hidden = true;
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
                  addDraft(nd, { id: draft().id, kind: 'relation', relType: relType.value });
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
      box.appendChild(remarks);
      box.appendChild(h('label', { class: 'cp-label', text: 'Type de lien' }));
      box.appendChild(relChips);
      box.appendChild(relType);
      box.appendChild(relHint);
      box.appendChild(dl);
      box.appendChild(linkError);
      box.appendChild(h('label', { class: 'cp-label', text: 'Avec' }));
      box.appendChild(search);
      box.appendChild(options);
    }

    function linksBlock() {
      if (!st.showLinks && !draft().relations.length) return null;
      var sec = h('div', { class: 'cp-sec cp-linksec' });
      renderLinks(sec);
      return sec;
    }

    /** Remarks about the draft that are not about its name: odd relations, floating concepts, loops. */
    function remarksBlock() {
      var list = EC()
        .issues(st.schema, st.entities, draft(), otherDrafts())
        .filter(function (i) {
          return i.code === 'relation-nature' || i.code === 'cycle' || i.code === 'floating' || i.code === 'too-many';
        });
      if (!list.length) return null;
      var box = h('div', { class: 'cp-issues', 'aria-live': 'polite' });
      list.forEach(function (i) {
        box.appendChild(h('p', { class: 'cp-issue cp-issue--' + i.level }, [issueIcon(i.level), i.message]));
      });
      return box;
    }

    /** Quiet text buttons that reveal the optional parts: other names, details, links. */
    function moreBlock() {
      var row = h('div', { class: 'cp-more' });
      function add(label, ic, fn) {
        row.appendChild(h('button', { class: 'cp-quiet', type: 'button', onclick: fn }, [icon(ic), label]));
      }
      if (!st.showAlias && !draft().aliases.length)
        add('Autres noms', 'tag', function () {
          st.showAlias = true;
          nameSec = null;
          renderMain();
          var i = els.main.querySelector('.cp-chipedit-in');
          if (i) i.focus();
        });
      if (!st.showComps)
        add('Détails', 'list-details', function () {
          st.showComps = true;
          renderMain();
        });
      if (!st.showLinks && !draft().relations.length)
        add('Lien', 'link', function () {
          st.showLinks = true;
          renderMain();
          var i = els.main.querySelector('.cp-linksec input[aria-label="Entité à lier"]');
          if (i) i.focus();
        });
      return row.childNodes.length ? row : null;
    }

    /* AI ideas ---------------------------------------------------- */

    var ideasBox = h('div', { class: 'cp-ideas', 'aria-live': 'polite' });
    var ideasTimer = null;
    var ideasKey = '';

    function AI() {
      return ctx.t ? global.EntitiesComposerAI : null;
    }

    function ideaStillOpen(it) {
      var d = draft();
      if (it.kind === 'type') return d.types.indexOf(it.typeId) < 0;
      if (it.kind === 'alias') return !d.aliases.some(function (a) { return EM().normKey(a) === EM().normKey(it.alias); });
      if (it.kind === 'answer') return d.answers[it.path] === undefined;
      return !d.relations.some(function (r) { return r.to === it.to; });
    }

    function acceptIdea(it) {
      commitIntent();
      if (it.kind === 'type' && !it.installed) return installPreset(it.typeId);
      setDraft(AI().apply(st.schema, draft(), it));
      if (it.kind === 'alias') nameSec = null;
      renderMain();
      refresh();
    }

    function paintIdeas() {
      ideasBox.textContent = '';
      var open = st.ideas.filter(ideaStillOpen);
      ideasBox.hidden = !open.length && !st.ideasLoading;
      if (ideasBox.hidden) return;
      var head = h('div', { class: 'cp-ideas-head' }, [icon('sparkles'), h('span', { text: st.ideasLoading && !open.length ? 'Je cherche des idées…' : 'Idées' })]);
      var all = open.filter(function (i) {
        return i.kind !== 'type' || i.installed;
      });
      if (all.length > 1) {
        head.appendChild(
          h('button', { class: 'cp-quiet', type: 'button', onclick: function () { all.forEach(function (i) { setDraft(AI().apply(st.schema, draft(), i)); }); nameSec = null; renderMain(); refresh(); } }, ['Tout accepter'])
        );
      }
      ideasBox.appendChild(head);
      if (!open.length) return;
      var row = h('div', { class: 'cp-pills' });
      open.forEach(function (it) {
        row.appendChild(
          h('button', { class: 'cp-idea', type: 'button', title: 'Ajouter', onclick: function () { acceptIdea(it); } }, [
            icon(it.icon),
            h('span', { class: 'cp-idea-detail', text: it.detail }),
            h('b', { text: it.label }),
          ])
        );
      });
      ideasBox.appendChild(row);
    }

    /** Asks for ideas once the name (or the chosen genres) stopped changing; stale answers are ignored. */
    function scheduleIdeas(delay) {
      if (!AI()) return;
      clearTimeout(ideasTimer);
      var d = draft();
      var key = d.id + '|' + d.name.trim() + '|' + d.types.join(',');
      if (key === ideasKey) return;
      var seq = ++st.ideasSeq;
      if (d.name.trim().length < 2) {
        ideasKey = '';
        st.ideas = [];
        st.ideasLoading = false;
        paintIdeas();
        return;
      }
      ideasTimer = setTimeout(function () {
        AI()
          .available(ctx.t)
          .then(function (ok) {
            if (!ok || seq !== st.ideasSeq) return null;
            ideasKey = key;
            st.ideasLoading = true;
            paintIdeas();
            return AI().suggest(ctx.t, {
              schema: st.schema,
              entities: st.entities,
              draft: draft(),
              choices: EC().archetypeChoices(st.schema, global.EntitiesLibrary),
            });
          })
          .then(function (items) {
            if (!items || seq !== st.ideasSeq) return;
            st.ideas = items;
            st.ideasLoading = false;
            paintIdeas();
          })
          .catch(function () {
            if (seq === st.ideasSeq) {
              st.ideasLoading = false;
              paintIdeas();
            }
          });
      }, delay == null ? 700 : delay);
    }

    var nameSec = null;
    var nameFor = '';
    var restBox = h('div', { class: 'cp-rest' });
    var restShown = null;

    function hasContent() {
      var d = draft();
      return !!(d.name.trim() || d.types.length);
    }

    /** Nothing worth previewing yet: just a name. The dialog stays compact and the preview card hidden. */
    function isSolo() {
      var d = draft();
      return !d.types.length && !d.relations.length && !Object.keys(d.answers).length && !d.base;
    }

    /** Everything after the name. Empty until there is something typed: the page starts as one field. */
    function renderRest(onlyIfRevealChanged) {
      var shown = hasContent();
      if (onlyIfRevealChanged && shown === restShown) return;
      restShown = shown;
      var keep = els.main.scrollTop;
      restBox.textContent = '';
      if (shown) {
        paintIdeas();
        restBox.appendChild(ideasBox);
        [archetypeBlock(), componentsBlock(), linksBlock(), moreBlock(), remarksBlock()].forEach(function (b) {
          if (b) restBox.appendChild(b);
        });
      }
      els.main.scrollTop = keep;
    }

    function renderMain() {
      if (!nameSec || nameFor !== frame().id) {
        nameSec = nameBlock();
        nameFor = frame().id;
        els.main.textContent = '';
        els.main.appendChild(nameSec);
        els.main.appendChild(restBox);
      }
      renderRest();
      if (st.focusName) {
        st.focusName = false;
        var n = els.main.querySelector('[data-name]');
        if (n) n.focus();
      }
    }

    /* ── 6. Chrome: header, aside, footer ─────────────────────────── */

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
      if (st.stack.length > 1) els.header.appendChild(crumbs);
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
            h('div', { class: 'cp-pv-types' }, d.types.length ? d.types.map(function (t) { return h('span', { class: 'cp-chip', text: typeName(t) }); }) : [h('span', { class: 'cp-hint', text: 'Sans archétype' })]),
            EC().naturesOfDraft(st.schema, d).length
              ? h('div', { class: 'cp-pv-natures' }, EC().naturesOfDraft(st.schema, d).map(function (n) {
                  var nat = EM().natureById(n);
                  return h('span', { class: 'cp-chip cp-chip--nature cp-chip--' + nat.realm, title: nat.hint }, [icon(nat.icon), nat.name]);
                }))
              : null,
          ]),
        ])
      );
      if (d.base) card.appendChild(h('div', { class: 'cp-pv-aliases' }, [icon('git-fork'), ' variante de ' + nameOf(d.base)]));
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
          var rows = c.fields.filter(function (f) {
            return d.answers[cid + '.' + f.key] !== undefined || EC().inheritedValue(st.entities, d, cid + '.' + f.key) !== undefined;
          });
          if (!rows.length) return;
          var sec = h('div', { class: 'cp-pv-sec' }, [h('div', { class: 'cp-pv-sech', text: c.name })]);
          rows.forEach(function (f) {
            var own = d.answers[cid + '.' + f.key];
            var val = own !== undefined ? own : EC().inheritedValue(st.entities, d, cid + '.' + f.key);
            sec.appendChild(
              h('div', { class: 'cp-pv-row' + (own === undefined ? ' is-inherited' : '') }, [
                h('span', { text: f.label + (own === undefined ? ' (hérité)' : '') }),
                h('b', { text: valueText(f, val) }),
              ])
            );
          });
          card.appendChild(sec);
        });
      if (d.relations.length) {
        var lsec = h('div', { class: 'cp-pv-sec' }, [h('div', { class: 'cp-pv-sech', text: 'Liens' })]);
        d.relations.forEach(function (r) {
          lsec.appendChild(h('div', { class: 'cp-pv-row' }, [h('span', { text: r.type }), h('b', { text: nameOf(r.to) })]));
          if (EM().matchRelation(r.type) === null) return;
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

    function renderFooter() {
      els.footer.textContent = '';
      var sub = isSub();
      var all = st.order.map(function (id) { return st.drafts[id]; });
      var blocked = all.some(function (x) {
        return EC().hasError(EC().issues(st.schema, st.entities, x, all.filter(function (o) { return o !== x; })).filter(function (i) { return i.code !== 'name-required'; }));
      });
      var noName = all.some(function (x) { return !x.name.trim(); });
      if (sub) {
        els.footer.appendChild(h('button', { class: 'cp-btn', type: 'button', onclick: back }, [icon('arrow-left'), 'Annuler cet ajout']));
      }
      els.footer.appendChild(h('span', { class: 'cp-spacer' }));
      if (sub) {
        els.footer.appendChild(
          h('button', { class: 'cp-btn cp-btn--primary', type: 'button', disabled: !draft().name.trim() ? true : null, onclick: returnToParent }, [icon('corner-down-left'), 'Ajouter et revenir'])
        );
        return;
      }
      var off = blocked || noName ? true : null;
      if (!noName)
        els.footer.appendChild(h('button', { class: 'cp-btn', type: 'button', disabled: off, onclick: function () { finish(true); } }, [icon('plus'), 'Créer et ajouter une autre']));
      els.footer.appendChild(
        h('button', { class: 'cp-btn cp-btn--primary', type: 'button', disabled: off, onclick: function () { finish(false); } }, [icon('check'), 'Créer ' + (all.length > 1 ? all.length + ' entités' : 'l’entité')])
      );
    }

    function refresh() {
      gc();
      scheduleIdeas();
      dialog.classList.toggle('cp-dialog--solo', isSolo() && !isSub());
      renderHeader();
      renderAside();
      renderFooter();
    }

    function render() {
      nameSec = null;
      st.focusName = true;
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

    /* ── 7. Flow ──────────────────────────────────────────────────── */

    /** Leaves a sub-page without keeping it (the link question it came from stays as it was). */
    function back() {
      if (st.stack.length < 2) return;
      var fr = st.stack.pop();
      if (fr.from) {
        delete st.drafts[fr.id];
        st.order = st.order.filter(function (id) { return id !== fr.id; });
      }
      render();
    }

    /** End of a sub-interview: link the new entity into the question it came from, and go back there. */
    function returnToParent() {
      commitIntent();
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
      clearTimeout(ideasTimer);
      st.ideasSeq++;
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
      }
    }

    // boot
    var root = EC().newDraft({ types: (ctx.initialTypes || []).filter(function (t) { return !!EM().findById(st.schema.types, t); }) });
    root.intent = ctx.initialText || '';
    st.rootId = root.id;
    addDraft(root, null);
    commitIntent();
    document.addEventListener('keydown', onKey, true);
    els.overlay.addEventListener('mousedown', function (ev) {
      if (ev.target === els.overlay) requestClose();
    });
    document.body.appendChild(els.overlay);
    render();

    return { close: close, state: st, els: els, back: back, finish: finish, render: render };
  }

  global.EntitiesComposerUI = { open: open };
})(typeof window !== 'undefined' ? window : this);
