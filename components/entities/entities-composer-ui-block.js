/**
 * entities-composer-ui: open() part 1 of 1.
 * The body of open runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see entities-composer-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.EntitiesComposerUiParts = global.EntitiesComposerUiParts || {});
  var P = (global.EntitiesComposerUiPartsMountOpen = global.EntitiesComposerUiPartsMountOpen || { list: [] });

  P.list.push({
    define: function (M) {
    M.frame = function frame() {
      return M.st.stack[M.st.stack.length - 1];
    };
    M.draft = function draft() {
      return M.st.drafts[M.frame().id];
    };
    M.setDraft = function setDraft(d) {
      M.st.drafts[d.id] = d;
    };
    M.isSub = function isSub() {
      return M.st.stack.length > 1;
    };
    M.pseudoOf = function pseudoOf(d) {
      return { id: d.id, name: d.name || 'Sans nom', types: d.types, aliases: d.aliases, relations: [], data: {}, updatedAt: '9', draft: true };
    };
    M.pool = function pool() {
      var cur = M.frame() ? M.frame().id : '';
      return M.st.entities.concat(
        M.st.order
          .filter(function (id) {
            return id !== cur;
          })
          .map(function (id) {
            return M.pseudoOf(M.st.drafts[id]);
          })
      );
    };
    M.nameOf = function nameOf(id) {
      var d = M.st.drafts[id];
      if (d) return d.name || 'Sans nom';
      var e = S.EM().findById(M.st.entities, id);
      return e ? e.name : '?';
    };
    M.typeName = function typeName(id) {
      var t = S.EM().findById(M.st.schema.types, id);
      return t ? t.name : id;
    };
    M.typeIcon = function typeIcon(d) {
      var t = d.types.length ? S.EM().findById(M.st.schema.types, d.types[0]) : null;
      return (t && t.icon) || 'stack-2';
    };
    M.addDraft = function addDraft(d, from) {
      M.setDraft(d);
      M.st.order.push(d.id);
      M.st.stack.push({ id: d.id, from: from || null });
    };
    M.otherDrafts = function otherDrafts() {
      return M.st.order
        .filter(function (id) {
          return id !== M.frame().id;
        })
        .map(function (id) {
          return M.st.drafts[id];
        });
    };
    M.commitIntent = function commitIntent() {
      var d = M.draft();
      var text = (d.intent || '').trim();
      if (!text || d.intentApplied === text) return false;
      var r = S.EC().readIntent(M.st.schema, M.st.entities, text);
      var structured = r.types.length || Object.keys(r.answers).length || r.relations.length;
      var nd = S.EC().pruneAnswers(M.st.schema, S.EC().applyIntent(M.st.schema, Object.assign({}, d, { name: '' }), r));
      nd.name = r.name || d.name;
      nd.intent = nd.name;
      nd.intentApplied = nd.name;
      M.setDraft(nd);
      M.nameSec = null; // the field now shows only the name
      return !!structured;
    };
    M.aliasCard = function aliasCard() {
      var n = M.draft().aliases.length;
      var fromType = S.EM().componentIdsOf(M.st.schema, { types: M.draft().types }).indexOf(S.EM().NAMES_COMPONENT) >= 0;
      var removeX = fromType
        ? null
        : S.h('button', {
            class: 'cp-x',
            type: 'button',
            'aria-label': 'Retirer le composant Autres noms',
            onclick: function (ev) {
              ev.preventDefault();
              M.setDraft(S.EC().toggleComponent(M.st.schema, M.draft(), S.EM().NAMES_COMPONENT, false));
              M.nameSec = null;
              M.renderMain();
              M.refresh();
            },
          }, [S.icon('x')]);
      var card = S.h('details', { class: 'cp-ccard', open: n || M.st.openComps.aliases ? true : null }, [
        S.h('summary', { class: 'cp-ccard-head' }, [S.icon('chevron-right'), S.h('strong', { text: 'Autres noms' }), n ? S.h('span', { class: 'cp-hint', text: String(n) }) : null, removeX]),
        S.h('div', { class: 'cp-fields' }, [S.h('div', { class: 'cp-field cp-field--wide' }, [S.h('label', { class: 'cp-field-label', text: 'Alias' }), M.aliasEditor])]),
      ]);
      card.addEventListener('toggle', function () {
        M.st.openComps.aliases = card.open;
      });
      return card;
    };
    M.nameBlock = function nameBlock() {
      var sec = S.h('div', { class: 'cp-sec cp-sec--name' });
      var understood = S.h('div', { class: 'cp-understood', 'aria-live': 'polite' });
      var issuesBox = S.h('div', { class: 'cp-issues', 'aria-live': 'polite' });
      var input = S.h('input', {
        class: 'cp-input cp-input--big',
        placeholder: 'Nom',
        'aria-label': 'Nom',
        'data-name': '1',
        'data-noenter': '1',
        autocomplete: 'off',
        value: M.draft().intent || M.draft().name || '',
        oninput: function () {
          var text = input.value;
          var r = S.EC().readIntent(M.st.schema, M.st.entities, text);
          M.setDraft(Object.assign({}, M.draft(), { intent: text, name: r.name || '' }));
          paintUnderstood(r);
          paintIssues();
          M.refresh();
          M.renderRest(true);
          M.scheduleIdeas();
        },
        onblur: function () {
          if (M.commitIntent()) {
            M.renderMain();
            M.refresh();
          }
        },
        onkeydown: function (ev) {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          if (M.commitIntent()) {
            M.renderMain();
            M.refresh();
          }
        },
      });
      function paintUnderstood(r) {
        understood.textContent = '';
        r = r || S.EC().readIntent(M.st.schema, M.st.entities, M.draft().intent || '');
        if (r.name === (M.draft().intent || '').trim() && !r.types.length) return;
        r.types.forEach(function (t) {
          understood.appendChild(S.h('span', { class: 'cp-chip cp-chip--ok' }, [S.icon('category'), M.typeName(t)]));
        });
        Object.keys(r.answers).forEach(function (p) {
          var f = S.EM().fieldOf(M.st.schema, p);
          if (f) understood.appendChild(S.h('span', { class: 'cp-chip cp-chip--ok' }, [S.icon('link'), f.field.label + ' : ' + S.EM().formatValue(f.field, r.answers[p], M.st.entities)]));
        });
        r.relations.forEach(function (x) {
          understood.appendChild(S.h('span', { class: 'cp-chip cp-chip--ok' }, [S.icon('link'), x.type + ' ' + M.nameOf(x.to)]));
        });
      }
      function paintIssues() {
        issuesBox.textContent = '';
        S.EC()
          .issues(M.st.schema, M.st.entities, M.draft(), M.otherDrafts())
          .forEach(function (i) {
            if (i.code !== 'duplicate-name' && i.code !== 'alias-clash') return;
            issuesBox.appendChild(S.h('p', { class: 'cp-issue cp-issue--' + i.level }, [S.issueIcon(i.level), i.message]));
          });
      }
      var aliasBox = S.h('div', { class: 'cp-chipedit' });
      var aliasIn = S.h('input', {
        class: 'cp-chipedit-in',
        placeholder: 'Autres noms : travail, work, bureau…',
        'aria-label': 'Alias',
        'data-noenter': '1',
        onkeydown: function (ev) {
          if (ev.key === 'Enter' || ev.key === ',') {
            ev.preventDefault();
            addAlias(aliasIn.value);
          } else if (ev.key === 'Backspace' && !aliasIn.value && M.draft().aliases.length) {
            setAliases(M.draft().aliases.slice(0, -1));
          }
        },
        onblur: function () {
          addAlias(aliasIn.value);
        },
      });
      function setAliases(list) {
        M.setDraft(Object.assign({}, M.draft(), { aliases: list }));
        paintAliases();
        paintIssues();
        M.refresh();
        aliasIn.focus();
      }
      function addAlias(v) {
        var cur = M.draft().aliases;
        S.splitList(v).forEach(function (a) {
          var key = S.EM().normKey(a);
          if (key && !cur.some(function (x) { return S.EM().normKey(x) === key; })) cur = cur.concat([a]);
        });
        aliasIn.value = '';
        M.setDraft(Object.assign({}, M.draft(), { aliases: cur }));
        paintAliases();
        paintIssues();
        M.refresh();
      }
      function paintAliases() {
        aliasBox.textContent = '';
        M.draft().aliases.forEach(function (a, i) {
          aliasBox.appendChild(
            S.h('span', { class: 'cp-chip' }, [
              a,
              S.h('button', { class: 'cp-x', type: 'button', 'aria-label': 'Retirer l’alias ' + a, onclick: function () { setAliases(M.draft().aliases.filter(function (_x, j) { return j !== i; })); } }, [S.icon('x')]),
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
      M.aliasEditor = aliasBox; // shown as the "Autres noms" component card (see aliasCard)
      sec.appendChild(issuesBox);
      return sec;
    };
    M.installPreset = function installPreset(pid) {
      M.commitIntent();
      var r = global.EntitiesLibrary.install(M.st.schema, pid);
      if (r.error) {
        M.st.libMsg = 'Le schéma est trop grand pour ajouter cet archétype : retirez des archétypes ou composants inutilisés.';
        M.renderMain();
        return;
      }
      M.st.schema = r.schema;
      M.st.libMsg = r.added.types.length > 1 ? 'Ajouté aussi : ' + r.added.types.filter(function (n) { return n !== (global.EntitiesLibrary.presetType(pid) || {}).name; }).join(', ') + '.' : '';
      var tid = r.typeIds[pid];
      if (tid) M.setDraft(S.EC().pruneAnswers(M.st.schema, S.EC().toggleType(M.st.schema, M.draft(), tid, true)));
      M.renderMain();
      M.refresh();
    };
    M.suggestedChoices = function suggestedChoices(all, d) {
      var q = S.EM().normKey(d.name || '');
      var used = {};
      M.st.entities.forEach(function (e) {
        (e.types || []).forEach(function (t) {
          used[t] = (used[t] || 0) + 1;
        });
      });
      var rest = all.filter(function (c) {
        return d.types.indexOf(c.id) < 0;
      });
      function score(c) {
        var n = S.EM().normKey(c.name);
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
    };
    M.archetypeBlock = function archetypeBlock() {
      var sec = S.h('div', { class: 'cp-sec cp-sec--arch' });
      var d = M.draft();
      var expanded = M.st.pillsOpen;
      sec.appendChild(S.h('h3', { class: 'cp-sec-title', text: d.types.length ? 'Genre' : 'Quel genre de chose ?' }));
      var search = S.h('input', {
        class: 'cp-input cp-input--small',
        type: 'search',
        placeholder: 'Chercher…',
        'aria-label': 'Chercher un archétype',
        'data-noenter': '1',
        value: M.st.filter,
        oninput: function () {
          M.st.filter = search.value;
          paintPills();
        },
      });
      var pills = S.h('div', { class: expanded ? 'cp-pgroups' : 'cp-pills' });
      function pillFor(c) {
        var on = d.types.indexOf(c.id) >= 0;
        return S.h(
          'button',
          {
            class: 'cp-pill' + (on ? ' is-on' : '') + (c.installed ? '' : ' is-lib'),
            type: 'button',
            'aria-pressed': c.installed ? (on ? 'true' : 'false') : null,
            title: c.description || null,
            onclick: function () {
              M.commitIntent();
              if (!c.installed) return M.installPreset(c.id);
              var cur = M.draft().types.indexOf(c.id) >= 0;
              M.setDraft(S.EC().pruneAnswers(M.st.schema, S.EC().toggleType(M.st.schema, M.draft(), c.id, !cur)));
              M.renderMain();
              M.refresh();
            },
          },
          [S.icon(c.installed ? c.icon : 'plus'), c.name, c.role ? S.h('em', { text: ' rôle' }) : null]
        );
      }
      function paintPills() {
        pills.textContent = '';
        var all = S.EC().archetypeChoices(M.st.schema, global.EntitiesLibrary);
        if (!expanded) {
          all
            .filter(function (c) {
              return d.types.indexOf(c.id) >= 0;
            })
            .concat(M.suggestedChoices(all, d))
            .forEach(function (c) {
              pills.appendChild(pillFor(c));
            });
          return;
        }
        var q = S.EM().normKey(M.st.filter);
        var list = all.filter(function (c) {
          return !q || S.EM().normKey(c.name).indexOf(q) >= 0;
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
          var nat = S.EM().natureById(k);
          var row = S.h('div', { class: 'cp-pills' });
          groups[k].forEach(function (c) {
            row.appendChild(pillFor(c));
          });
          pills.appendChild(
            S.h('div', { class: 'cp-pgroup' }, [S.h('span', { class: 'cp-pgroup-name' }, [nat ? S.icon(nat.icon) : null, nat ? nat.name : 'Autre']), row])
          );
        });
        if (!list.length) pills.appendChild(S.h('span', { class: 'cp-hint', text: 'Aucun archétype ne correspond.' }));
      }
      paintPills();
      if (expanded) sec.appendChild(search);
      sec.appendChild(pills);
      var tools = S.h('div', { class: 'cp-row' }, [
        S.h(
          'button',
          {
            class: 'cp-quiet',
            type: 'button',
            onclick: function () {
              M.st.pillsOpen = !expanded;
              M.renderMain();
            },
          },
          [expanded ? 'Moins de choix' : 'Voir tous les genres']
        ),
      ]);
      if (expanded) {
        tools.appendChild(
          S.h(
            'button',
            {
              class: 'cp-quiet',
              type: 'button',
              onclick: function () {
                M.st.newType = M.st.newType || { name: '', aliases: '', comps: [], fieldsText: '', nature: '', parents: [], role: false, error: '' };
                M.renderMain();
              },
            },
            ['Créer un nouveau genre']
          )
        );
      }
      sec.appendChild(tools);
      if (M.st.libMsg) sec.appendChild(S.h('p', { class: 'cp-hint', role: 'status', text: M.st.libMsg }));
      if (M.st.newType) sec.appendChild(M.newTypeForm());
      return sec;
    };
    M.newTypeForm = function newTypeForm() {
      var nt = M.st.newType;
      var nameIn = S.h('input', { class: 'cp-input', placeholder: 'Ex. : Outil', value: nt.name, 'aria-label': 'Nom de l’archétype', 'data-noenter': '1' });
      var aliasIn = S.h('input', { class: 'cp-input', placeholder: 'alias : tool, équipement', value: nt.aliases, 'aria-label': 'Alias de l’archétype', 'data-noenter': '1' });
      var fieldsIn = S.h('input', {
        class: 'cp-input',
        placeholder: 'Ex. : État (choix: neuf/usé), Achat (date), Lieu (lien: Lieu), Prix (nombre)',
        value: nt.fieldsText,
        'aria-label': 'Champs de l’archétype',
        'data-noenter': '1',
      });
      var preview = S.h('div', { class: 'cp-understood' });
      var errBox = S.h('p', { class: 'cp-error', role: 'alert', hidden: nt.error ? null : true, text: nt.error });
      function paintPreview() {
        preview.textContent = '';
        S.EC()
          .parseFieldSpec(fieldsIn.value, M.st.schema)
          .forEach(function (f) {
            var kind = {
              text: 'texte', number: 'nombre', date: 'date', bool: 'oui/non', choice: 'choix', ref: 'lien', refs: 'liens',
              multi: 'choix multiple', longtext: 'texte long', geo: 'coordonnées', url: 'lien web',
            }[f.kind];
            preview.appendChild(S.h('span', { class: 'cp-chip' }, [f.label, S.h('em', { text: ' ' + kind })]));
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
      var comps = S.h('div', { class: 'cp-checks' });
      M.st.schema.components.forEach(function (c) {
        comps.appendChild(
          S.h('label', { class: 'cp-check' }, [
            S.h('input', {
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
      var natureSel = S.h('select', {
        class: 'cp-input',
        'aria-label': 'Nature de l’archétype',
        onchange: function () { nt.nature = natureSel.value; },
      });
      natureSel.appendChild(S.h('option', { value: '', text: 'Je ne sais pas / autre' }));
      S.EM().NATURES.forEach(function (n) {
        natureSel.appendChild(S.h('option', { value: n.id, text: n.name + ' : ' + n.hint }));
      });
      natureSel.value = nt.nature || '';
      var parentBox = S.h('div', { class: 'cp-checks' });
      M.st.schema.types.forEach(function (ty) {
        parentBox.appendChild(
          S.h('label', { class: 'cp-check' }, [
            S.h('input', {
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
      var roleIn = S.h('input', { type: 'checkbox', checked: nt.role ? true : null, onchange: function (ev) { nt.role = ev.target.checked; } });
      return S.h('div', { class: 'cp-card' }, [
        S.h('h3', { class: 'cp-sub', text: 'Nouvel archétype' }),
        S.h('label', { class: 'cp-label', text: 'Nom' }),
        nameIn,
        S.h('label', { class: 'cp-label', text: 'Nature' }),
        natureSel,
        M.st.schema.types.length ? S.h('label', { class: 'cp-label', text: 'Est une sorte de' }) : null,
        M.st.schema.types.length ? parentBox : null,
        S.h('label', { class: 'cp-check' }, [roleIn, 'Rôle']),
        S.h('label', { class: 'cp-label', text: 'Alias' }),
        aliasIn,
        M.st.schema.components.length ? S.h('label', { class: 'cp-label', text: 'Réutiliser des composants' }) : null,
        M.st.schema.components.length ? comps : null,
        S.h('label', { class: 'cp-label', text: 'Champs' }),
        fieldsIn,
        preview,
        errBox,
        S.h('div', { class: 'cp-row' }, [
          S.h(
            'button',
            {
              class: 'cp-btn cp-btn--primary',
              type: 'button',
              onclick: function () {
                sync();
                var r = S.EC().defineType(M.st.schema, {
                  name: nt.name,
                  aliases: S.splitList(nt.aliases),
                  componentIds: nt.comps,
                  nature: nt.nature,
                  parents: nt.parents,
                  role: nt.role,
                  component: { name: nt.name, fieldsText: nt.fieldsText },
                });
                if (r.error) {
                  nt.error =
                    r.error === 'type-exists' ? 'Un archétype porte déjà ce nom (ou cet alias).' : r.error === 'name-required' ? 'Donnez un nom à l’archétype.' : 'Impossible de créer l’archétype.';
                  M.renderMain();
                  return;
                }
                M.st.schema = r.schema;
                M.st.newType = null;
                var nd = S.EC().toggleType(M.st.schema, M.draft(), r.typeId, true);
                M.setDraft(nd);
                M.renderMain();
                M.refresh();
              },
            },
            [S.icon('check'), 'Créer l’archétype et le choisir']
          ),
          S.h(
            'button',
            {
              class: 'cp-btn',
              type: 'button',
              onclick: function () {
                M.st.newType = null;
                M.renderMain();
              },
            },
            ['Annuler']
          ),
        ]),
      ]);
    };
    M.componentCard = function componentCard(cid) {
      var comp = S.EM().findById(M.st.schema.components, cid);
      if (!comp || !comp.fields.length) return null;
      var d = M.draft();
      var owners = d.types
        .filter(function (tid) {
          return S.EM()
            .typeLineage(M.st.schema, tid)
            .some(function (t) {
              return t.components.indexOf(cid) >= 0;
            });
        })
        .map(M.typeName);
      var filled = comp.fields.filter(function (f) {
        return d.answers[cid + '.' + f.key] !== undefined;
      }).length;
      var head = S.h('summary', { class: 'cp-ccard-head' }, [
        S.icon('chevron-right'),
        S.h('strong', { text: comp.name }),
        S.h('span', { class: 'cp-hint', text: filled ? filled + ' / ' + comp.fields.length : owners.join(' + ') }),
      ]);
      if (!owners.length) {
        head.appendChild(
          S.h(
            'button',
            {
              class: 'cp-x',
              type: 'button',
              'aria-label': 'Retirer le composant ' + comp.name,
              onclick: function (ev) {
                ev.preventDefault();
                M.setDraft(S.EC().toggleComponent(M.st.schema, M.draft(), cid, false));
                M.renderMain();
                M.refresh();
              },
            },
            [S.icon('x')]
          )
        );
      }
      var grid = S.h('div', { class: 'cp-fields' });
      comp.fields.forEach(function (f) {
        var path = cid + '.' + f.key;
        var wide = f.kind === 'longtext' || f.kind === 'refs' || f.kind === 'ref' || f.kind === 'multi' || f.kind === 'choice';
        grid.appendChild(
          S.h('div', { class: 'cp-field' + (wide ? ' cp-field--wide' : '') }, [
            S.h('label', { class: 'cp-field-label', text: f.label }),
            M.fieldControl(path, f),
            M.defaultLine(path, f),
          ])
        );
      });
      var card = S.h('details', { class: 'cp-ccard', open: filled || M.st.openComps[cid] ? true : null }, [head, grid]);
      card.addEventListener('toggle', function () {
        M.st.openComps[cid] = card.open;
      });
      return card;
    };
    M.componentsBlock = function componentsBlock() {
      var d = M.draft();
      var ids = S.EM().componentIdsOf(M.st.schema, d);
      var showAlias = !!(M.aliasEditor && (ids.indexOf(S.EM().NAMES_COMPONENT) >= 0 || d.aliases.length));
      if (!ids.length && !M.st.showComps && !showAlias) return null;
      var sec = S.h('div', { class: 'cp-sec' });
      sec.appendChild(S.h('h3', { class: 'cp-sec-title', text: 'Détails' }));
      var list = S.h('div', { class: 'cp-ccards' });
      if (showAlias) list.appendChild(M.aliasCard());
      ids.forEach(function (cid) {
        if (cid === S.EM().NAMES_COMPONENT) return; // drawn above by aliasCard
        var card = M.componentCard(cid);
        if (card) list.appendChild(card);
      });
      if (list.childNodes.length) sec.appendChild(list);
      if (!M.st.showComps) return sec;
      var more = S.h('div', { class: 'cp-pills' });
      S.EC()
        .componentsAvailable(M.st.schema, d)
        .forEach(function (c) {
          more.appendChild(
            S.h(
              'button',
              {
                class: 'cp-pill cp-pill--comp',
                type: 'button',
                title: c.fields.map(function (x) { return x.label; }).join(', '),
                onclick: function () {
                  M.setDraft(S.EC().toggleComponent(M.st.schema, M.draft(), c.id, true));
                  M.st.openComps[c.id === S.EM().NAMES_COMPONENT ? 'aliases' : c.id] = true;
                  M.renderMain();
                  M.refresh();
                },
              },
              [S.icon('plus'), c.name]
            )
          );
        });
      more.appendChild(
        S.h(
          'button',
          {
            class: 'cp-pill cp-pill--new',
            type: 'button',
            onclick: function () {
              M.st.newComp = M.st.newComp || { name: '', fieldsText: '', error: '' };
              M.renderMain();
            },
          },
          [S.icon('plus'), 'Nouveau']
        )
      );
      sec.appendChild(more);
      if (M.st.newComp) sec.appendChild(M.newComponentForm());
      return sec;
    };
    M.newComponentForm = function newComponentForm() {
      var nc = M.st.newComp;
      var nameIn = S.h('input', { class: 'cp-input', placeholder: 'Nom : Entretien', value: nc.name, 'aria-label': 'Nom du composant', 'data-noenter': '1' });
      var fieldsIn = S.h('input', {
        class: 'cp-input',
        placeholder: 'Champs : Arrosage tous les (nombre: jours), Dernier arrosage (date), Santé (choix: bonne/fragile)',
        value: nc.fieldsText,
        'aria-label': 'Champs du composant',
        'data-noenter': '1',
      });
      var preview = S.h('div', { class: 'cp-understood' });
      var err = S.h('p', { class: 'cp-error', role: 'alert', hidden: nc.error ? null : true, text: nc.error });
      var kindName = { text: 'texte', number: 'nombre', date: 'date', bool: 'oui/non', choice: 'choix', ref: 'lien', refs: 'liens', multi: 'choix multiple', longtext: 'texte long', geo: 'coordonnées', url: 'lien web' };
      function sync() {
        nc.name = nameIn.value;
        nc.fieldsText = fieldsIn.value;
        preview.textContent = '';
        S.EC()
          .parseFieldSpec(nc.fieldsText, M.st.schema)
          .forEach(function (f) {
            preview.appendChild(S.h('span', { class: 'cp-chip' }, [f.label, S.h('em', { text: ' ' + kindName[f.kind] })]));
          });
      }
      nameIn.addEventListener('input', sync);
      fieldsIn.addEventListener('input', sync);
      sync();
      return S.h('div', { class: 'cp-card' }, [
        S.h('h3', { class: 'cp-sub', text: 'Nouveau composant' }),
        nameIn,
        fieldsIn,
        preview,
        err,
        S.h('div', { class: 'cp-row' }, [
          S.h(
            'button',
            {
              class: 'cp-btn cp-btn--primary',
              type: 'button',
              onclick: function () {
                sync();
                var r = S.EC().defineComponent(M.st.schema, nc.name, nc.fieldsText);
                if (r.error) {
                  nc.error = r.error === 'name-required' ? 'Donnez un nom au composant.' : r.error === 'fields-required' ? 'Décrivez au moins un champ.' : 'Impossible de créer le composant.';
                  M.renderMain();
                  return;
                }
                M.st.schema = r.schema;
                M.st.newComp = null;
                M.setDraft(S.EC().toggleComponent(M.st.schema, M.draft(), r.componentId, true));
                M.renderMain();
                M.refresh();
              },
            },
            [S.icon('check'), 'Créer et ajouter']
          ),
          S.h('button', { class: 'cp-btn', type: 'button', onclick: function () { M.st.newComp = null; M.renderMain(); } }, ['Annuler']),
        ]),
      ]);
    };
    M.defaultLine = function defaultLine(path, f) {
      if (M.draft().answers[path] !== undefined) return null;
      var df = S.EC().defaultFor(M.st.schema, M.st.entities, M.draft(), path);
      if (!df) return null;
      return S.h('span', { class: 'cp-inherit' }, [S.icon(df.source === 'model' ? 'git-fork' : 'sparkles'), 'par défaut : ' + M.valueText(f, df.value) + (df.from ? ' (' + df.from + ')' : '')]);
    };
    M.answer = function answer(path, v) {
      M.setDraft(S.EC().setAnswer(M.draft(), path, v));
      M.refresh();
    };
    M.chip = function chip(label, on, onclick, title) {
      return S.h('button', { class: 'cp-pick' + (on ? ' is-on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', title: title || null, onclick: onclick }, [label]);
    };
    M.fieldControl = function fieldControl(path, f) {
      var val = M.draft().answers[path];
      var wrap = S.h('div', { class: 'cp-ctl' });
      var sugg = S.EC().suggest(M.st.schema, M.st.entities, M.draft(), path);
      if (f.kind === 'bool' || f.kind === 'choice') wrap.className = 'cp-ctl cp-ctl--chips';
      if (f.kind === 'bool') {
        function paint() {
          wrap.textContent = '';
          var cur = M.draft().answers[path];
          [['Oui', true], ['Non', false]].forEach(function (o) {
            wrap.appendChild(
              M.chip(o[0], cur === o[1], function () {
                M.answer(path, cur === o[1] ? '' : o[1]);
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
          var cur = M.draft().answers[path];
          (f.options || []).forEach(function (o) {
            wrap.appendChild(
              M.chip(o, cur === o, function () {
                M.answer(path, cur === o ? '' : o);
                paintChoice();
              })
            );
          });
        }
        paintChoice();
        return wrap;
      }
      if (f.kind === 'ref' || f.kind === 'refs') return M.refControl(path, f);
      if (f.kind === 'multi') {
        wrap.className = 'cp-ctl cp-ctl--chips';
        (function paintMulti() {
          wrap.textContent = '';
          var cur = M.draft().answers[path] || [];
          (f.options || []).forEach(function (o) {
            var on = cur.indexOf(o) >= 0;
            wrap.appendChild(
              M.chip(o, on, function () {
                M.answer(path, on ? cur.filter(function (x) { return x !== o; }) : cur.concat([o]));
                paintMulti();
              })
            );
          });
        })();
        return wrap;
      }
      if (f.kind === 'longtext') {
        var ta = S.h('textarea', {
          class: 'cp-input cp-input--area',
          rows: '4',
          maxlength: '1500',
          'aria-label': f.label,
          oninput: function () { M.answer(path, ta.value); },
        });
        ta.value = val == null ? '' : String(val);
        wrap.appendChild(ta);
        return wrap;
      }
      if (f.kind === 'level' && global.EntitiesLevelUI) {
        var cid = path.split('.')[0];
        wrap.appendChild(
          global.EntitiesLevelUI.create({
            field: f,
            value: val,
            bounds: S.EM().levelBounds(f, function (k) { return M.draft().answers[cid + '.' + k]; }),
            onChange: function (v) { M.answer(path, v); },
          })
        );
        return wrap;
      }
      var type = f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : f.kind === 'url' ? 'url' : 'text';
      var inp = S.h('input', {
        class: 'cp-input',
        type: type,
        step: f.kind === 'number' ? 'any' : null,
        placeholder: f.kind === 'geo' ? 'latitude, longitude (45.5017, -73.5673)' : f.kind === 'url' ? 'https://…' : null,
        value: val == null ? '' : String(val),
        'aria-label': f.label + (f.unit ? ' (' + f.unit + ')' : ''),
        oninput: function () {
          M.answer(path, inp.value);
        },
      });
      wrap.appendChild(f.unit ? S.h('div', { class: 'cp-unit' }, [inp, S.h('span', { class: 'cp-unit-sfx', text: f.unit })]) : inp);
      var quick = S.h('div', { class: 'cp-quick' });
      function setQuick(v) {
        inp.value = v;
        M.answer(path, v);
      }
      if (f.kind === 'date') {
        [['Aujourd’hui', 0], ['Demain', 1], ['Dans 7 jours', 7]].forEach(function (o) {
          var ic = document.createElement('i');
          ic.className = 'ti ti-' + (global.ContextMenu && global.ContextMenu.dayIcon ? global.ContextMenu.dayIcon(o[1]) : 'calendar');
          ic.setAttribute('aria-hidden', 'true');
          var b = M.chip(o[0], false, function () { setQuick(S.isoDay(o[1])); });
          b.insertBefore(ic, b.firstChild);
          quick.appendChild(b);
        });
      }
      if (f.kind === 'number' || f.kind === 'text') {
        sugg.forEach(function (s) {
          quick.appendChild(
            M.chip(String(s.value), false, function () { setQuick(String(s.value)); }, 'Utilisé par ' + s.count + ' autre' + (s.count > 1 ? 's' : ''))
          );
        });
      }
      if (quick.childNodes.length) wrap.appendChild(quick);
      return wrap;
    };
    M.refControl = function refControl(path, f) {
      var multi = f.kind === 'refs';
      var wrap = S.h('div', { class: 'cp-ctl cp-ctl--ref' });
      var picked = S.h('div', { class: 'cp-picked' });
      var options = S.h('div', { class: 'cp-quick' });
      var search = S.h('input', {
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
            return S.EM().normKey(e.name) === S.EM().normKey(q);
          })[0];
          if (exact || hits.length === 1) pick((exact || hits[0]).id);
          else create(q);
        },
      });
      function current() {
        var v = M.draft().answers[path];
        return v === undefined ? [] : multi ? v : [v];
      }
      function pick(id) {
        var cur = current();
        if (multi) M.answer(path, cur.indexOf(id) >= 0 ? cur.filter(function (x) { return x !== id; }) : cur.concat([id]));
        else M.answer(path, cur[0] === id ? '' : id);
        search.value = '';
        paintPicked();
        paintOptions();
        search.focus();
      }
      function matches(q) {
        var key = S.EM().normKey(q);
        return M.pool().filter(function (e) {
          if (!S.EC().eligible(f, e, M.draft(), M.st.schema)) return false;
          return [e.name].concat(e.aliases || []).some(function (l) {
            return S.EM().normKey(l).indexOf(key) >= 0;
          });
        });
      }
      function create(name) {
        var types = (f.refTypes || []).filter(function (t) {
          return !!S.EM().findById(M.st.schema.types, t);
        });
        var nd = S.EC().newDraft({ name: name, types: types });
        nd.preset = types.length > 0;
        M.addDraft(nd, { id: M.draft().id, kind: multi ? 'answers' : 'answer', path: path });
        M.render();
      }
      function paintPicked() {
        picked.textContent = '';
        current().forEach(function (id) {
          var isNew = !!M.st.drafts[id];
          picked.appendChild(
            S.h('span', { class: 'cp-chip cp-chip--on' }, [
              S.icon(isNew ? 'sparkles' : 'link'),
              M.nameOf(id),
              isNew ? S.h('em', { text: ' nouveau' }) : null,
              isNew
                ? S.h('button', { class: 'cp-x', type: 'button', 'aria-label': 'Modifier ' + M.nameOf(id), onclick: function () { edit(id); } }, [S.icon('pencil')])
                : null,
              S.h('button', { class: 'cp-x', type: 'button', 'aria-label': 'Retirer ' + M.nameOf(id), onclick: function () { pick(id); } }, [S.icon('x')]),
            ])
          );
        });
      }
      function edit(id) {
        M.st.stack.push({ id: id, from: null });
        M.render();
      }
      function paintOptions() {
        options.textContent = '';
        var q = search.value.trim();
        var chosen = current();
        var list;
        if (q) {
          list = matches(q);
        } else {
          var sugg = S.EC().suggest(M.st.schema, M.st.entities, M.draft(), path).slice(0, 6).map(function (s) {
            return { e: S.EM().findById(M.st.entities, s.value), count: s.count };
          });
          var seen = {};
          list = [];
          sugg.forEach(function (s) {
            if (s.e) {
              seen[s.e.id] = true;
              list.push(Object.assign({}, s.e, { _count: s.count }));
            }
          });
          M.pool().forEach(function (e) {
            if (e.draft && !seen[e.id] && S.EC().eligible(f, e, M.draft(), M.st.schema)) list.push(e);
          });
        }
        list
          .filter(function (e) {
            return chosen.indexOf(e.id) < 0;
          })
          .slice(0, 10)
          .forEach(function (e) {
            options.appendChild(
              M.chip(
                (e.draft ? '✦ ' : '') + e.name,
                false,
                function () { pick(e.id); },
                e._count ? 'Utilisé par ' + e._count + ' autre' + (e._count > 1 ? 's' : '') : e.draft ? 'Sera créé avec cette composition' : null
              )
            );
          });
        if (q && !M.pool().some(function (e) { return S.EM().normKey(e.name) === S.EM().normKey(q) && S.EC().eligible(f, e, M.draft(), M.st.schema); })) {
          options.appendChild(
            S.h('button', { class: 'cp-pick cp-pick--new', type: 'button', onclick: function () { create(q); } }, [S.icon('plus'), 'Créer « ' + q + ' »'])
          );
        }
      }
      paintPicked();
      paintOptions();
      wrap.appendChild(picked);
      wrap.appendChild(options);
      wrap.appendChild(search);
      return wrap;
    };
    M.renderLinks = function renderLinks(box) {
      var d = M.draft();
      var ask = S.EC().linksPrompt(M.st.schema, d);
      box.appendChild(S.h('h3', { class: 'cp-sec-title', text: ask.title }));
      var remarks = S.h('div', { class: 'cp-issues', 'aria-live': 'polite' });
      var linkError = S.h('p', { class: 'cp-error', role: 'alert', hidden: true });
      function paintRemarks() {
        remarks.textContent = '';
        S.EC()
          .issues(M.st.schema, M.st.entities, M.draft(), M.otherDrafts())
          .forEach(function (i) {
            if (i.code === 'floating' || i.code === 'relation-nature' || i.code === 'cycle') {
              remarks.appendChild(S.h('p', { class: 'cp-issue cp-issue--' + i.level }, [S.issueIcon(i.level), i.message]));
            }
          });
      }
      var list = S.h('div', { class: 'cp-linklist' });
      function paintList() {
        list.textContent = '';
        M.draft().relations.forEach(function (r) {
          list.appendChild(
            S.h('span', { class: 'cp-chip cp-chip--on' }, [
              S.icon('arrow-right'),
              r.type + ' ' + M.nameOf(r.to),
              S.h(
                'button',
                {
                  class: 'cp-x',
                  type: 'button',
                  'aria-label': 'Retirer le lien',
                  onclick: function () {
                    M.setDraft(S.EC().removeRelationFrom(M.draft(), r.type, r.to));
                    paintList();
                    M.refresh();
                  },
                },
                [S.icon('x')]
              ),
            ])
          );
        });
        if (!M.draft().relations.length) list.appendChild(S.h('span', { class: 'cp-hint', text: 'Aucun lien pour l’instant.' }));
        paintRemarks();
      }
      paintList();
      var relType = S.h('input', {
        class: 'cp-input',
        value: S.EC().relationTypes(M.st.entities)[0],
        list: 'cp-rel-types',
        'aria-label': 'Type de lien',
        'data-noenter': '1',
      });
      var dl = S.h('datalist', { id: 'cp-rel-types' });
      var choices = S.EC().relationChoices(M.st.schema, M.st.entities, d);
      choices.forEach(function (c) {
        dl.appendChild(S.h('option', { value: c.label }));
      });
      relType.value = ask.suggested[0] || choices[0].label;
      var relHint = S.h('span', { class: 'cp-hint' });
      function paintRelHint() {
        var m = S.EM().matchRelation(relType.value);
        relHint.textContent = m
          ? m.def.symmetric
            ? 'Lien symétrique.'
            : 'Vu de l’autre côté : « ' + S.EM().inverseLabel(relType.value) + ' ».'
          : 'Lien libre (non reconnu par l’ontologie).';
      }
      relType.addEventListener('input', paintRelHint);
      paintRelHint();
      var relChips = S.h('div', { class: 'cp-quick' });
      choices.slice(0, 5).forEach(function (c) {
        relChips.appendChild(
          M.chip(c.label, false, function () {
            relType.value = c.label;
            paintRelHint();
          }, c.inverse && c.inverse !== c.label ? 'Autre côté : ' + c.inverse : null)
        );
      });
      var search = S.h('input', { class: 'cp-input', placeholder: 'Chercher une entité, ou taper un nom à créer…', 'aria-label': 'Entité à lier', 'data-noenter': '1', oninput: paintOptions });
      var options = S.h('div', { class: 'cp-quick' });
      function link(id) {
        var all = M.st.entities.concat(
          M.st.order.map(function (did) {
            return S.EC().pseudoEntity(M.st.schema, M.st.drafts[did]);
          })
        );
        if (S.EM().wouldCycleRelation(M.st.schema, all, M.draft().id, relType.value, id)) {
          linkError.textContent = '« ' + M.nameOf(id) + ' » contient déjà « ' + (M.draft().name || 'cette entité') + ' » : ce lien ferait une boucle.';
          linkError.hidden = false;
          return;
        }
        linkError.hidden = true;
        M.setDraft(S.EC().addRelationTo(M.draft(), relType.value, id));
        search.value = '';
        paintList();
        paintOptions();
        M.refresh();
      }
      function paintOptions() {
        options.textContent = '';
        var q = S.EM().normKey(search.value);
        var taken = M.draft().relations.map(function (r) { return r.to; });
        var cand = M.pool().filter(function (e) {
          if (taken.indexOf(e.id) >= 0) return false;
          if (!q) return true;
          return [e.name].concat(e.aliases || []).some(function (l) { return S.EM().normKey(l).indexOf(q) >= 0; });
        });
        cand.slice(0, 8).forEach(function (e) {
          options.appendChild(M.chip((e.draft ? '✦ ' : '') + e.name, false, function () { link(e.id); }));
        });
        var raw = search.value.trim();
        if (raw && !cand.some(function (e) { return S.EM().normKey(e.name) === q; })) {
          options.appendChild(
            S.h(
              'button',
              {
                class: 'cp-pick cp-pick--new',
                type: 'button',
                onclick: function () {
                  var nd = S.EC().newDraft({ name: raw });
                  M.addDraft(nd, { id: M.draft().id, kind: 'relation', relType: relType.value });
                  M.render();
                },
              },
              [S.icon('plus'), 'Créer « ' + raw + ' »']
            )
          );
        }
      }
      paintOptions();
      box.appendChild(list);
      box.appendChild(remarks);
      box.appendChild(S.h('label', { class: 'cp-label', text: 'Type de lien' }));
      box.appendChild(relChips);
      box.appendChild(relType);
      box.appendChild(relHint);
      box.appendChild(dl);
      box.appendChild(linkError);
      box.appendChild(S.h('label', { class: 'cp-label', text: 'Avec' }));
      box.appendChild(search);
      box.appendChild(options);
    };
    M.linksBlock = function linksBlock() {
      if (!M.st.showLinks && !M.draft().relations.length) return null;
      var sec = S.h('div', { class: 'cp-sec cp-linksec' });
      M.renderLinks(sec);
      return sec;
    };
    M.remarksBlock = function remarksBlock() {
      var list = S.EC()
        .issues(M.st.schema, M.st.entities, M.draft(), M.otherDrafts())
        .filter(function (i) {
          return i.code === 'relation-nature' || i.code === 'cycle' || i.code === 'floating' || i.code === 'too-many';
        });
      if (!list.length) return null;
      var box = S.h('div', { class: 'cp-issues', 'aria-live': 'polite' });
      list.forEach(function (i) {
        box.appendChild(S.h('p', { class: 'cp-issue cp-issue--' + i.level }, [S.issueIcon(i.level), i.message]));
      });
      return box;
    };
    M.hasOwner = function hasOwner() {
      return S.EM().componentIdsOf(M.st.schema, M.draft()).indexOf('propriete') >= 0;
    };
    M.moreBlock = function moreBlock() {
      var row = S.h('div', { class: 'cp-more' });
      function add(label, ic, fn) {
        row.appendChild(S.h('button', { class: 'cp-quiet', type: 'button', onclick: fn }, [S.icon(ic), label]));
      }
      if (S.EM().componentIdsOf(M.st.schema, M.draft()).indexOf(S.EM().NAMES_COMPONENT) < 0 && !M.draft().aliases.length)
        add('Autres noms', 'tag', function () {
          M.setDraft(S.EC().toggleComponent(M.st.schema, M.draft(), S.EM().NAMES_COMPONENT, true));
          M.st.openComps.aliases = true;
          M.renderMain();
          var i = M.els.main.querySelector('.cp-chipedit-in');
          if (i) i.focus();
        });
      if (!M.hasOwner() && S.EM().findById(M.st.schema.components, 'propriete'))
        add('Propriétaire', 'user-circle', function () {
          M.setDraft(S.EC().toggleComponent(M.st.schema, M.draft(), 'propriete', true));
          M.st.openComps.propriete = true;
          M.renderMain();
          M.refresh();
          var i = M.els.main.querySelector('.cp-ccard[open] input[aria-label*="Propriétaire"]');
          if (i) i.focus();
        });
      if (!M.st.showComps)
        add('Détails', 'list-details', function () {
          M.st.showComps = true;
          M.renderMain();
        });
      if (!M.st.showLinks && !M.draft().relations.length)
        add('Lien', 'link', function () {
          M.st.showLinks = true;
          M.renderMain();
          var i = M.els.main.querySelector('.cp-linksec input[aria-label="Entité à lier"]');
          if (i) i.focus();
        });
      return row.childNodes.length ? row : null;
    };
    M.AI = function AI() {
      return M.ctx.t ? global.EntitiesComposerAI : null;
    };
    M.ideaStillOpen = function ideaStillOpen(it) {
      var d = M.draft();
      if (it.kind === 'type') return d.types.indexOf(it.typeId) < 0;
      if (it.kind === 'alias') return !d.aliases.some(function (a) { return S.EM().normKey(a) === S.EM().normKey(it.alias); });
      if (it.kind === 'answer') return d.answers[it.path] === undefined;
      return !d.relations.some(function (r) { return r.to === it.to; });
    };
    M.acceptIdea = function acceptIdea(it) {
      M.commitIntent();
      if (it.kind === 'type' && !it.installed) return M.installPreset(it.typeId);
      M.setDraft(M.AI().apply(M.st.schema, M.draft(), it));
      if (it.kind === 'alias') M.nameSec = null;
      M.renderMain();
      M.refresh();
    };
    M.paintIdeas = function paintIdeas() {
      M.ideasBox.textContent = '';
      var open = M.st.ideas.filter(M.ideaStillOpen);
      M.ideasBox.hidden = !open.length && !M.st.ideasLoading;
      if (M.ideasBox.hidden) return;
      var head = S.h('div', { class: 'cp-ideas-head' }, [S.icon('sparkles'), S.h('span', { text: M.st.ideasLoading && !open.length ? 'Je cherche des idées…' : 'Idées' })]);
      var all = open.filter(function (i) {
        return i.kind !== 'type' || i.installed;
      });
      if (all.length > 1) {
        head.appendChild(
          S.h('button', { class: 'cp-quiet', type: 'button', onclick: function () { all.forEach(function (i) { M.setDraft(M.AI().apply(M.st.schema, M.draft(), i)); }); M.nameSec = null; M.renderMain(); M.refresh(); } }, ['Tout accepter'])
        );
      }
      M.ideasBox.appendChild(head);
      if (!open.length) return;
      var row = S.h('div', { class: 'cp-pills' });
      open.forEach(function (it) {
        row.appendChild(
          S.h('button', { class: 'cp-idea', type: 'button', title: 'Ajouter', onclick: function () { M.acceptIdea(it); } }, [
            S.icon(it.icon),
            S.h('span', { class: 'cp-idea-detail', text: it.detail }),
            S.h('b', { text: it.label }),
          ])
        );
      });
      M.ideasBox.appendChild(row);
    };
    M.scheduleIdeas = function scheduleIdeas(delay) {
      if (!M.AI()) return;
      clearTimeout(M.ideasTimer);
      var d = M.draft();
      var key = d.id + '|' + d.name.trim() + '|' + d.types.join(',');
      if (key === M.ideasKey) return;
      var seq = ++M.st.ideasSeq;
      if (d.name.trim().length < 2) {
        M.ideasKey = '';
        M.st.ideas = [];
        M.st.ideasLoading = false;
        M.paintIdeas();
        return;
      }
      M.ideasTimer = setTimeout(function () {
        M.AI()
          .available(M.ctx.t)
          .then(function (ok) {
            if (!ok || seq !== M.st.ideasSeq) return null;
            M.ideasKey = key;
            M.st.ideasLoading = true;
            M.paintIdeas();
            return M.AI().suggest(M.ctx.t, {
              schema: M.st.schema,
              entities: M.st.entities,
              draft: M.draft(),
              choices: S.EC().archetypeChoices(M.st.schema, global.EntitiesLibrary),
            });
          })
          .then(function (items) {
            if (!items || seq !== M.st.ideasSeq) return;
            M.st.ideas = items;
            M.st.ideasLoading = false;
            M.paintIdeas();
          })
          .catch(function () {
            if (seq === M.st.ideasSeq) {
              M.st.ideasLoading = false;
              M.paintIdeas();
            }
          });
      }, delay == null ? 700 : delay);
    };
    M.hasContent = function hasContent() {
      var d = M.draft();
      return !!(d.name.trim() || d.types.length);
    };
    M.isSolo = function isSolo() {
      var d = M.draft();
      return !d.types.length && !d.relations.length && !Object.keys(d.answers).length && !d.base;
    };
    M.renderRest = function renderRest(onlyIfRevealChanged) {
      var shown = M.hasContent();
      if (onlyIfRevealChanged && shown === M.restShown) return;
      M.restShown = shown;
      var keep = M.els.main.scrollTop;
      M.restBox.textContent = '';
      if (shown) {
        M.paintIdeas();
        M.restBox.appendChild(M.ideasBox);
        [M.archetypeBlock(), M.componentsBlock(), M.linksBlock(), M.moreBlock(), M.remarksBlock()].forEach(function (b) {
          if (b) M.restBox.appendChild(b);
        });
      }
      M.els.main.scrollTop = keep;
    };
    M.renderMain = function renderMain() {
      if (!M.nameSec || M.nameFor !== M.frame().id) {
        M.nameSec = M.nameBlock();
        M.nameFor = M.frame().id;
        M.els.main.textContent = '';
        M.els.main.appendChild(M.nameSec);
        M.els.main.appendChild(M.restBox);
      }
      M.renderRest();
      if (M.st.focusName) {
        M.st.focusName = false;
        var n = M.els.main.querySelector('[data-name]');
        if (n) n.focus();
      }
    };
    M.renderHeader = function renderHeader() {
      M.els.header.textContent = '';
      var crumbs = S.h('ol', { class: 'cp-crumbs' });
      M.st.stack.forEach(function (fr, i) {
        var d = M.st.drafts[fr.id];
        crumbs.appendChild(
          S.h('li', { class: i === M.st.stack.length - 1 ? 'is-on' : '' }, [d.name || (i === 0 ? 'Nouvelle entité' : 'Nouveau')])
        );
      });
      M.els.header.appendChild(S.h('div', { class: 'cp-title' }, [S.icon('wand'), S.h('span', { text: 'Composer une entité' })]));
      if (M.st.stack.length > 1) M.els.header.appendChild(crumbs);
      if (M.st.confirmClose) {
        M.els.header.appendChild(
          S.h('div', { class: 'cp-confirm' }, [
            S.h('span', { text: 'Abandonner cette composition ?' }),
            S.h('button', { class: 'cp-btn cp-btn--danger', type: 'button', onclick: M.close }, ['Abandonner']),
            S.h('button', { class: 'cp-btn', type: 'button', onclick: function () { M.st.confirmClose = false; M.renderHeader(); } }, ['Continuer']),
          ])
        );
      } else {
        M.els.header.appendChild(S.h('button', { class: 'cp-x cp-x--lg', type: 'button', 'aria-label': 'Fermer', onclick: M.requestClose }, [S.icon('x')]));
      }
    };
    M.valueText = function valueText(f, v) {
      if (f.kind === 'ref') return M.nameOf(v);
      if (f.kind === 'refs') return v.map(M.nameOf).join(', ');
      return S.EM().formatValue(f, v, M.st.entities);
    };
    M.renderAside = function renderAside() {
      M.els.aside.textContent = '';
      var d = M.draft();
      var comp = S.EC().completeness(M.st.schema, d);
      var card = S.h('div', { class: 'cp-preview' });
      card.appendChild(
        S.h('div', { class: 'cp-pv-head' }, [
          S.h('span', { class: 'cp-pv-icon' }, [S.icon(M.typeIcon(d))]),
          S.h('div', {}, [
            S.h('div', { class: 'cp-pv-name' + (d.name ? '' : ' is-empty'), text: d.name || 'Sans nom' }),
            S.h('div', { class: 'cp-pv-types' }, d.types.length ? d.types.map(function (t) { return S.h('span', { class: 'cp-chip', text: M.typeName(t) }); }) : [S.h('span', { class: 'cp-hint', text: 'Sans archétype' })]),
            S.EC().naturesOfDraft(M.st.schema, d).length
              ? S.h('div', { class: 'cp-pv-natures' }, S.EC().naturesOfDraft(M.st.schema, d).map(function (n) {
                  var nat = S.EM().natureById(n);
                  return S.h('span', { class: 'cp-chip cp-chip--nature cp-chip--' + nat.realm, title: nat.hint }, [S.icon(nat.icon), nat.name]);
                }))
              : null,
          ]),
        ])
      );
      if (d.base) card.appendChild(S.h('div', { class: 'cp-pv-aliases' }, [S.icon('git-fork'), ' variante de ' + M.nameOf(d.base)]));
      if (d.aliases.length) card.appendChild(S.h('div', { class: 'cp-pv-aliases', text: 'aussi : ' + d.aliases.join(', ') }));
      if (comp.total) {
        card.appendChild(
          S.h('div', { class: 'cp-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(comp.total), 'aria-valuenow': String(comp.answered), 'aria-label': 'Réponses' }, [
            S.h('span', { style: 'width:' + Math.round(comp.ratio * 100) + '%' }),
          ])
        );
        card.appendChild(S.h('div', { class: 'cp-hint', text: comp.answered + ' / ' + comp.total + ' réponses' }));
      }
      S.EM()
        .componentIdsOf(M.st.schema, d)
        .forEach(function (cid) {
          var c = S.EM().findById(M.st.schema.components, cid);
          if (!c) return;
          var rows = c.fields.filter(function (f) {
            return d.answers[cid + '.' + f.key] !== undefined || S.EC().inheritedValue(M.st.entities, d, cid + '.' + f.key) !== undefined;
          });
          if (!rows.length) return;
          var sec = S.h('div', { class: 'cp-pv-sec' }, [S.h('div', { class: 'cp-pv-sech', text: c.name })]);
          rows.forEach(function (f) {
            var own = d.answers[cid + '.' + f.key];
            var val = own !== undefined ? own : S.EC().inheritedValue(M.st.entities, d, cid + '.' + f.key);
            sec.appendChild(
              S.h('div', { class: 'cp-pv-row' + (own === undefined ? ' is-inherited' : '') }, [
                S.h('span', { text: f.label + (own === undefined ? ' (hérité)' : '') }),
                S.h('b', { text: M.valueText(f, val) }),
              ])
            );
          });
          card.appendChild(sec);
        });
      if (d.relations.length) {
        var lsec = S.h('div', { class: 'cp-pv-sec' }, [S.h('div', { class: 'cp-pv-sech', text: 'Liens' })]);
        d.relations.forEach(function (r) {
          lsec.appendChild(S.h('div', { class: 'cp-pv-row' }, [S.h('span', { text: r.type }), S.h('b', { text: M.nameOf(r.to) })]));
          if (S.EM().matchRelation(r.type) === null) return;
        });
        card.appendChild(lsec);
      }
      var also = M.st.order.filter(function (id) { return id !== d.id; });
      if (also.length) {
        var asec = S.h('div', { class: 'cp-pv-sec' }, [S.h('div', { class: 'cp-pv-sech', text: 'Sera créé aussi' })]);
        also.forEach(function (id) {
          var o = M.st.drafts[id];
          asec.appendChild(S.h('div', { class: 'cp-pv-row' }, [S.h('span', { text: o.types.map(M.typeName).join(', ') || 'Entité' }), S.h('b', { text: o.name || 'Sans nom' })]));
        });
        card.appendChild(asec);
      }
      M.els.aside.appendChild(card);
    };
    M.renderFooter = function renderFooter() {
      M.els.footer.textContent = '';
      var sub = M.isSub();
      var all = M.st.order.map(function (id) { return M.st.drafts[id]; });
      var blocked = all.some(function (x) {
        return S.EC().hasError(S.EC().issues(M.st.schema, M.st.entities, x, all.filter(function (o) { return o !== x; })).filter(function (i) { return i.code !== 'name-required'; }));
      });
      var noName = all.some(function (x) { return !x.name.trim(); });
      if (sub) {
        M.els.footer.appendChild(S.h('button', { class: 'cp-btn', type: 'button', onclick: M.back }, [S.icon('arrow-left'), 'Annuler cet ajout']));
      }
      M.els.footer.appendChild(S.h('span', { class: 'cp-spacer' }));
      if (sub) {
        M.els.footer.appendChild(
          S.h('button', { class: 'cp-btn cp-btn--primary', type: 'button', disabled: !M.draft().name.trim() ? true : null, onclick: M.returnToParent }, [S.icon('corner-down-left'), 'Ajouter et revenir'])
        );
        return;
      }
      var off = blocked || noName ? true : null;
      if (!noName)
        M.els.footer.appendChild(S.h('button', { class: 'cp-btn', type: 'button', disabled: off, onclick: function () { M.finish(true); } }, [S.icon('plus'), 'Créer et ajouter une autre']));
      M.els.footer.appendChild(
        S.h('button', { class: 'cp-btn cp-btn--primary', type: 'button', disabled: off, onclick: function () { M.finish(false); } }, [S.icon('check'), 'Créer ' + (all.length > 1 ? all.length + ' entités' : 'l’entité')])
      );
    };
    M.refresh = function refresh() {
      M.gc();
      M.scheduleIdeas();
      M.dialog.classList.toggle('cp-dialog--solo', M.isSolo() && !M.isSub());
      M.renderHeader();
      M.renderAside();
      M.renderFooter();
    };
    M.render = function render() {
      M.nameSec = null;
      M.st.focusName = true;
      M.refresh();
      M.renderMain();
    };
    M.gc = function gc() {
      var keep = {};
      function visit(id) {
        if (keep[id] || !M.st.drafts[id]) return;
        keep[id] = true;
        var d = M.st.drafts[id];
        Object.keys(d.answers).forEach(function (p) {
          var v = d.answers[p];
          (Array.isArray(v) ? v : [v]).forEach(function (x) { if (typeof x === 'string') visit(x); });
        });
        d.relations.forEach(function (r) { visit(r.to); });
      }
      visit(M.st.rootId);
      M.st.stack.forEach(function (fr) { keep[fr.id] = true; });
      M.st.order = M.st.order.filter(function (id) {
        if (keep[id]) return true;
        delete M.st.drafts[id];
        return false;
      });
    };
    M.back = function back() {
      if (M.st.stack.length < 2) return;
      var fr = M.st.stack.pop();
      if (fr.from) {
        delete M.st.drafts[fr.id];
        M.st.order = M.st.order.filter(function (id) { return id !== fr.id; });
      }
      M.render();
    };
    M.returnToParent = function returnToParent() {
      M.commitIntent();
      var fr = M.st.stack.pop();
      var from = fr.from;
      if (from) {
        var parent = M.st.drafts[from.id];
        if (from.kind === 'answer') parent = S.EC().setAnswer(parent, from.path, fr.id);
        else if (from.kind === 'answers') parent = S.EC().setAnswer(parent, from.path, (parent.answers[from.path] || []).concat([fr.id]));
        else parent = S.EC().addRelationTo(parent, from.relType, fr.id);
        M.st.drafts[from.id] = parent;
      }
      M.render();
    };
    M.finish = function finish(again) {
      var all = M.st.order.map(function (id) { return M.st.drafts[id]; });
      var r = S.EC().finalize(M.st.schema, M.st.entities, all);
      var res = {
        schema: M.st.schema,
        entities: r.entities,
        created: r.created,
        rootId: M.st.rootId,
        again: !!again,
        types: M.st.drafts[M.st.rootId].types.slice(),
      };
      M.teardown();
      if (M.ctx.onDone) M.ctx.onDone(res);
    };
    M.requestClose = function requestClose() {
      var d = M.st.drafts[M.st.rootId];
      if (!d || (!d.name.trim() && !d.intent && M.st.order.length <= 1 && !d.types.length)) return M.close();
      M.st.confirmClose = true;
      M.renderHeader();
    };
    M.teardown = function teardown() {
      clearTimeout(M.ideasTimer);
      M.st.ideasSeq++;
      document.removeEventListener('keydown', M.onKey, true);
      if (M.els.overlay.parentNode) M.els.overlay.parentNode.removeChild(M.els.overlay);
      try {
        if (M.opener && M.opener.focus) M.opener.focus();
      } catch (e) {
        /* ignore */
      }
    };
    M.close = function close() {
      M.teardown();
      if (M.ctx.onClose) M.ctx.onClose();
    };
    M.onKey = function onKey(ev) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        if (M.st.confirmClose) {
          M.st.confirmClose = false;
          M.renderHeader();
        } else {
          M.requestClose();
        }
        return;
      }
      if (ev.key === 'Tab') {
        var f = Array.prototype.filter.call(M.dialog.querySelectorAll('button, input, select, textarea, [href]'), function (x) {
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
    };
    },
    run: function (M) {
    M.st = {
      schema: global.EntitiesLibrary ? global.EntitiesLibrary.ensureComponent(M.ctx.schema, 'propriete') : M.ctx.schema,
      entities: M.ctx.entities,
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
    M.els = {
      overlay: S.h('div', { class: 'cp-overlay' }),
      header: S.h('header', { class: 'cp-head' }),
      main: S.h('section', { class: 'cp-main' }),
      aside: S.h('aside', { class: 'cp-aside', 'aria-label': 'Aperçu' }),
      footer: S.h('footer', { class: 'cp-foot' }),
    };
    M.dialog = S.h(
      'div',
      { class: 'cp-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Composer une entité' },
      [M.els.header, S.h('div', { class: 'cp-body' }, [M.els.main, M.els.aside]), M.els.footer]
    );
    M.els.overlay.appendChild(M.dialog);
    M.opener = document.activeElement;
    M.aliasEditor = null;
    M.ideasBox = S.h('div', { class: 'cp-ideas', 'aria-live': 'polite' });
    M.ideasTimer = null;
    M.ideasKey = '';
    M.nameSec = null;
    M.nameFor = '';
    M.restBox = S.h('div', { class: 'cp-rest' });
    M.restShown = null;
    M.root = S.EC().newDraft({ types: (M.ctx.initialTypes || []).filter(function (t) { return !!S.EM().findById(M.st.schema.types, t); }) });
    M.root.intent = M.ctx.initialText || '';
    if (M.ctx.initialDrafts && M.ctx.initialDrafts.length) {
      M.root = M.ctx.initialDrafts[0];
      M.root.intent = M.root.name;
      M.root.intentApplied = M.root.name;
      M.ctx.initialDrafts.slice(1).forEach(function (d) {
        M.setDraft(d);
        M.st.order.push(d.id);
      });
    }
    M.st.rootId = M.root.id;
    M.addDraft(M.root, null);
    if (!(M.ctx.initialDrafts && M.ctx.initialDrafts.length)) M.commitIntent();
    document.addEventListener('keydown', M.onKey, true);
    M.els.overlay.addEventListener('mousedown', function (ev) {
      if (ev.target === M.els.overlay) M.requestClose();
    });
    document.body.appendChild(M.els.overlay);
    M.render();
    return { v: { close: M.close, state: M.st, els: M.els, back: M.back, finish: M.finish, render: M.render } };
    }
  });
})(typeof window !== 'undefined' ? window : this);
