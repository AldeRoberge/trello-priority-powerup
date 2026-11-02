/**
 * entities-ui: mount() part 2 of 3.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see entities-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.EntitiesUiParts = global.EntitiesUiParts || {});
  var P = (global.EntitiesUiPartsMountMount = global.EntitiesUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.moreMenu = function moreMenu(anchor, e) {
      M.openPop(
        anchor,
        function (el) {
          el.appendChild(M.menuItem('git-fork', 'Créer une variante', 'Une entité qui hérite de celle-ci', function () { M.cloneSelected(false); }));
          el.appendChild(M.menuItem('file-text', 'Document', '', function () {
            if (global.ViewTabs) global.ViewTabs.openSubject('entity', e.id);
          }));
          el.appendChild(M.menuItem('copy', 'Dupliquer', 'Une copie sans lien avec l’original', function () { M.cloneSelected(true); }));
          if (e.base) {
            el.appendChild(
              M.menuItem('unlink', 'Détacher du modèle', 'Garde les valeurs, ne le suit plus', function () {
                M.applyEntity(
                  function (cur) {
                    return S.EM().detachEntity(M.state.entities, cur);
                  },
                  { rebuild: true }
                );
              })
            );
          }
          el.appendChild(S.h('div', { class: 'en-menu-sep' }));
          var armed = false;
          var del = M.menuItem(
            'trash',
            'Supprimer l’entité',
            '',
            function () {
              if (!armed) {
                armed = true;
                del.querySelector('.en-menu-label').textContent = 'Confirmer la suppression';
                del.querySelector('.en-menu-text').appendChild(S.h('span', { class: 'en-menu-sub', text: 'Retire aussi les liens qui pointent vers elle' }));
                return;
              }
              M.closePop();
              M.deleteEntityNow(e);
            },
            { danger: true, keepOpen: true }
          );
          el.appendChild(del);
        },
        { align: 'end' }
      );
    };
    M.deleteEntityNow = function deleteEntityNow(e) {
      M.state.entities = S.EM().deleteEntity(M.state.schema, M.state.entities, e.id);
      if (global.EntitiesDirectories) global.EntitiesDirectories.forget(M.t, e); // its People / Places record goes too
      if (M.state.selId === e.id) M.state.selId = null;
      M.state.confirm = '';
      M.scheduleSave();
      M.paintList();
      M.paintMain();
    };
    M.CM = function CM() {
      return global.ContextMenu && typeof global.ContextMenu.show === 'function' ? global.ContextMenu : null;
    };
    M.copyToClipboard = function copyToClipboard(text, what) {
      try {
        navigator.clipboard.writeText(String(text)).then(
          function () { M.toast(what + ' copié'); },
          function () { M.toast('Copie impossible', 'error'); }
        );
      } catch (err) {
        M.toast('Copie impossible', 'error');
      }
    };
    M.scrollToSection = function scrollToSection(title) {
      var heads = M.els.main.querySelectorAll('.en-sec-title');
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].textContent !== title) continue;
        var box = heads[i].closest('.en-sec');
        if (box.classList.contains('is-collapsed')) box.querySelector('.en-sec-toggle').click();
        box.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
    };
    M.linkItems = function linkItems(e) {
      var out = [];
      e.relations.forEach(function (r) {
        var other = S.EM().findById(M.state.entities, r.to);
        if (other) out.push({ id: 'open-linked:' + r.type + r.to, label: S.cap(r.type) + ' : ' + other.name, icon: 'arrow-up-right', action: function () { M.openEntity(other.id); } });
      });
      // links held in the entity's own link fields (Contenu, Fabriqué par, Lieu...)
      S.EM()
        .componentIdsOf(M.state.schema, e)
        .forEach(function (cid) {
          var comp = S.EM().findById(M.state.schema.components, cid);
          if (!comp) return;
          comp.fields.forEach(function (f) {
            if (f.kind !== 'ref' && f.kind !== 'refs') return;
            var v = S.EM().effectiveValue(M.state.entities, e, cid + '.' + f.key, M.state.schema);
            (Array.isArray(v) ? v : v ? [v] : []).forEach(function (id) {
              var other = S.EM().findById(M.state.entities, id);
              if (other) out.push({ id: 'open-linked:' + cid + f.key + id, label: f.label + ' : ' + other.name, icon: 'arrow-up-right', action: function () { M.openEntity(other.id); } });
            });
          });
        });
      S.EM()
        .linksOf(M.state.schema, M.state.entities, e.id)
        .filter(function (l) {
          return l.dir === 'in' && l.via !== 'variante de';
        })
        .forEach(function (l) {
          var other = S.EM().findById(M.state.entities, l.other);
          if (!other) return;
          var via = String(l.via);
          var label = l.inverse && l.inverse !== via ? l.inverse : via.indexOf(' / ') >= 0 ? 'Utilisé comme « ' + via.split(' / ').pop() + ' » par' : '← ' + via;
          if (l.role) label += ' (' + l.role + ')';
          out.push({ id: 'open-linked:in' + l.other + via, label: S.cap(label) + ' : ' + other.name, icon: 'corner-down-left', action: function () { M.openEntity(other.id); } });
        });
      return out;
    };
    M.entityItems = function entityItems(e) {
      var links = M.linkItems(e);
      var comps = S.EM()
        .componentIdsOf(M.state.schema, e)
        .map(function (cid) { return S.EM().findById(M.state.schema.components, cid); })
        .filter(Boolean);
      function here(fn) {
        return function () {
          if (M.state.selId !== e.id || M.state.mode !== 'entity') M.openEntity(e.id);
          fn();
        };
      }
      var items = [];
      if (M.state.selId !== e.id || M.state.mode !== 'entity') items.push({ id: 'open-card', label: 'Ouvrir', icon: 'arrow-up-right', group: 'Ouvrir', action: function () { M.openEntity(e.id); } });
      items.push({
        id: 'open-document',
        label: 'Document',
        icon: 'file-text',
        group: 'Ouvrir',
        action: function () { if (global.ViewTabs) global.ViewTabs.openSubject('entity', e.id); },
      });
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
                action: here(function () { M.scrollToSection(c.name); }),
              };
            })
          : [{ id: 'no-components', label: 'Aucun composant', disabled: true }],
        disabled: !comps.length,
        action: comps.length ? null : function () {},
      });
      items.push({ id: 'open-history', label: 'Historique', icon: 'history', group: 'Ouvrir', action: here(function () { var d = M.els.main.querySelector('.en-sec--disc .en-disc:last-of-type, .en-sec--disc .en-disc'); if (d) { d.scrollIntoView({ block: 'center' }); if (!d.classList.contains('is-open')) d.click(); } }) });
      // a type is just a list of components: an entity can carry several, switched here with a check
      items.push({
        id: 'show-types',
        label: 'Types',
        icon: 'category',
        group: 'Modifier',
        hint: e.types.length ? String(e.types.length) : '',
        children: M.state.schema.types.map(function (ty) {
          var has = e.types.indexOf(ty.id) >= 0;
          return {
            id: 'type:' + ty.id,
            label: ty.name,
            icon: ty.icon || 'stack-2',
            checked: has,
            action: here(function () {
              M.applyEntity(
                function (cur) {
                  var set = has
                    ? cur.types.filter(function (x) { return x !== ty.id; })
                    : cur.types.concat([ty.id]);
                  return S.EM().setTypes(M.state.schema, cur, set);
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
          M.openEntity(e.id);
          M.state.linkOpen = true;
          M.state.refocus = '.en-link-type';
          M.paintMain();
        },
      });
      items.push({ id: 'create-variant', label: 'Créer une variante', icon: 'git-fork', group: 'Créer', action: here(function () { M.cloneSelected(false); }) });
      items.push({ id: 'duplicate', label: 'Dupliquer', icon: 'copy', group: 'Créer', action: here(function () { M.cloneSelected(true); }) });
      if (e.base) {
        items.push({
          id: 'detach',
          label: 'Détacher du modèle',
          icon: 'unlink',
          group: 'Modifier',
          action: here(function () {
            M.applyEntity(function (cur) { return S.EM().detachEntity(M.state.entities, cur); }, { rebuild: true });
          }),
        });
      }
      items.push({
        id: 'edit',
        label: 'Renommer',
        icon: 'edit',
        group: 'Modifier',
        action: here(function () {
          var input = M.els.main.querySelector('.en-name');
          if (input) {
            input.focus();
            input.select();
          }
        }),
      });
      items.push({ sep: true });
      items.push({ id: 'copy', label: 'Copier le nom', icon: 'copy', group: 'Presse-papiers', action: function () { M.copyToClipboard(e.name, 'Nom'); } });
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
            action: function () { M.deleteEntityNow(e); },
          },
        ],
      });
      return items;
    };
    M.listItems = function listItems() {
      var items = [
        { id: 'new-entity', label: 'Nouvelle entité', icon: 'plus', group: 'Créer', action: function () { M.openComposer(); } },
        { id: 'open-schema', label: 'Types et composants', icon: 'settings', group: 'Ouvrir', action: function () { M.schemaLink.click(); } },
      ];
      if (M.state.query) items.push({ id: 'filter-clear', label: 'Effacer la recherche', icon: 'x', group: 'Filtres', action: function () { M.setQuery(''); } });
      return items;
    };
    M.mainItems = function mainItems(ev) {
      var e = M.selected();
      if (!e || M.state.mode !== 'entity') return M.listItems();
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
        if (shown && shown !== '—') items.push({ id: 'copy-value', label: 'Copier la valeur', icon: 'copy', group: 'Presse-papiers', action: function () { M.copyToClipboard(shown, 'Valeur'); } });
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
      return items.concat(M.entityItems(e));
    };
    M.bindMenus = function bindMenus() {
      M.listBox.addEventListener('contextmenu', function (ev) {
        var cm = M.CM();
        if (!cm) return;
        var rowEl = ev.target.closest && ev.target.closest('.en-row');
        var e = rowEl && S.EM().findById(M.state.entities, rowEl.getAttribute('data-id'));
        ev.preventDefault();
        ev.stopPropagation();
        cm.show(ev, e ? M.entityItems(e) : M.listItems());
      });
      M.els.main.addEventListener('contextmenu', function (ev) {
        var cm = M.CM();
        if (!cm || cm.isNativeEditableTarget(ev.target)) return; // text fields keep the shared copy / paste menu
        ev.preventDefault();
        ev.stopPropagation();
        cm.show(ev, M.mainItems(ev));
      });
    };
    M.heroBlock = function heroBlock(e) {
      var nameInput = S.h('input', {
        class: 'en-name',
        type: 'text',
        'aria-label': 'Nom',
        placeholder: 'Nom',
        maxlength: '80',
        autocomplete: 'off',
        value: e.name,
        onchange: function () {
          M.applyEntity(function (cur) {
            return S.EM().renameEntity(cur, nameInput.value);
          });
          nameInput.value = (M.selected() || e).name;
        },
        onkeydown: function (ev) {
          if (ev.key === 'Enter') nameInput.blur();
          else if (ev.key === 'Escape') {
            nameInput.value = (M.selected() || e).name;
            nameInput.blur();
          }
        },
      });
      var moreBtn = S.h(
        'button',
        {
          class: 'en-icon-btn',
          type: 'button',
          title: 'Plus d’actions',
          'aria-label': 'Plus d’actions',
          'aria-haspopup': 'menu',
          'aria-expanded': 'false',
          onclick: function (ev) {
            M.moreMenu(ev.currentTarget, M.selected() || e);
          },
        },
        [S.icon('dots')]
      );

      var typesRow = S.h('div', { class: 'en-typesrow' });
      var typeNames = [];
      e.types.forEach(function (tid) {
        var ty = S.EM().findById(M.state.schema.types, tid);
        if (!ty) return;
        typeNames.push(S.fold(ty.name));
        var nat = S.EM().natureById(S.EM().natureOfType(M.state.schema, tid));
        typesRow.appendChild(
          S.h('span', { class: 'en-typepill', style: '--tile:' + ((nat && S.NATURE_COLORS[nat.id]) || S.NEUTRAL_COLOR) }, [
            S.icon(ty.icon || (nat && nat.icon) || 'tag'),
            S.h('span', { text: ty.name + (ty.role ? ' (rôle)' : '') }),
            S.h(
              'button',
              {
                class: 'en-typepill-x',
                type: 'button',
                title: 'Retirer le type ' + ty.name,
                'aria-label': 'Retirer le type ' + ty.name,
                onclick: function () {
                  M.applyEntity(
                    function (cur) {
                      return S.EM().setTypes(
                        M.state.schema,
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
              [S.icon('x')]
            ),
          ])
        );
      });
      S.EM()
        .naturesOf(M.state.schema, e)
        .forEach(function (n) {
          var nat = S.EM().natureById(n);
          if (typeNames.indexOf(S.fold(nat.name)) >= 0) return;
          typesRow.appendChild(S.h('span', { class: 'en-nature', title: nat.hint, text: nat.name }));
        });
      typesRow.appendChild(
        S.h(
          'button',
          {
            class: 'en-typeadd',
            type: 'button',
            'aria-haspopup': 'dialog',
            'aria-expanded': 'false',
            onclick: function (ev) {
              M.typePicker(ev.currentTarget, M.selected() || e);
            },
          },
          [S.icon('plus'), e.types.length ? 'Type' : 'Ajouter un type']
        )
      );
      var base = e.base ? S.EM().findById(M.state.entities, e.base) : null;
      if (base) {
        typesRow.appendChild(
          S.h('button', { class: 'en-typepill en-typepill--model', type: 'button', title: 'Cette entité suit son modèle : ouvrir « ' + base.name + ' »', onclick: function () { M.openEntity(base.id); } }, [S.icon('git-fork'), 'Variante de ' + base.name])
        );
      }

      return S.h('header', { class: 'en-hero' }, [S.h('div', { class: 'en-hero-top' }, [M.tile(e, 'lg'), nameInput, moreBtn]), typesRow]);
    };
    M.aliasesSection = function aliasesSection(e, removeBtn) {
      var aliasBox = S.h('div', { class: 'en-aliases' });
      function setAliasList(list, refocus) {
        M.applyEntity(function (cur) {
          return S.EM().setAliases(cur, list);
        });
        fillAliases();
        if (refocus) {
          var inp = aliasBox.querySelector('.en-alias-input');
          if (inp) inp.focus();
        }
      }
      function fillAliases() {
        var cur = M.selected() || e;
        aliasBox.textContent = '';
        cur.aliases.forEach(function (a) {
          aliasBox.appendChild(
            S.h('span', { class: 'en-token' }, [
              a,
              S.h('button', { class: 'en-token-x', type: 'button', 'aria-label': 'Retirer l’alias ' + a, onclick: function () { setAliasList(cur.aliases.filter(function (x) { return x !== a; }), true); } }, [S.icon('x')]),
            ])
          );
        });
        var input = S.h('input', {
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
          var parts = S.splitList(input.value);
          if (!parts.length) return;
          input.value = '';
          setAliasList((M.selected() || e).aliases.concat(parts), refocus);
        }
        aliasBox.appendChild(input);
      }
      fillAliases();
      var row = S.h('div', { class: 'en-prop en-prop--stack' }, [S.h('label', { class: 'en-prop-label', text: 'Alias' }), S.h('div', { class: 'en-prop-value' }, [aliasBox]), S.h('span', { class: 'en-prop-meta' })]);
      return M.section('Autres noms', S.h('div', { class: 'en-set' }, [row]), removeBtn, null, M.sectionIcon('names'));
    };
    M.paintMain = function paintMain() {
      var viewKey = M.state.mode + ':' + (M.state.selId || '');
      var same = M.els.main.dataset.view === viewKey;
      var keep = same ? M.els.main.scrollTop : 0;
      if (!same) {
        M.state.openModel = undefined;
        M.state.linkOpen = false;
      }
      M.closePop();
      M.els.main.textContent = '';
      M.els.main.dataset.view = viewKey;
      var page = S.h('div', { class: 'en-page' });
      M.els.main.appendChild(page);
      if (M.state.mode === 'schema') {
        page.classList.add('en-page--schema');
        M.paintSchema(page);
      } else M.paintEntity(page);
      M.root.classList.toggle(
        'is-entity-open',
        M.state.mode === 'schema' || !!(M.state.selId && M.selected())
      );
      M.els.main.scrollTop = keep;
      if (M.state.refocus) {
        var f = page.querySelector(M.state.refocus);
        M.state.refocus = '';
        if (f) f.focus();
      }
    };
    M.paintEntity = function paintEntity(page) {
      var e = M.selected();
      if (!M.state.loaded) {
        page.innerHTML = global.Skeleton.html('entities.main');
        return;
      }
      if (!e) {
        page.classList.add('en-page--empty');
        page.appendChild(M.emptyState());
        return;
      }
      page.appendChild(
        S.h(
          'button',
          {
            class: 'en-back en-back--list',
            type: 'button',
            title: 'Liste',
            'aria-label': 'Retour à la liste',
            onclick: function () {
              M.state.selId = null;
              M.state.mode = 'entity';
              M.paintMain();
              M.paintList();
            },
          },
          [S.icon('chevron-left'), 'Liste']
        )
      );
      page.appendChild(M.heroBlock(e));
      var shownNature = 0;
      S.EM()
        .ontologyIssues(M.state.schema, M.state.entities, e)
        .forEach(function (i) {
          if (i.code === 'relation-nature' && ++shownNature > 2) return;
          var fix =
            i.code === 'relation-nature'
              ? S.h(
                  'button',
                  {
                    class: 'en-link',
                    type: 'button',
                    title: 'Garde le lien, mais avec le lien général « lié à »',
                    onclick: function () {
                      M.applyEntity(
                        function (cur) {
                          return S.EM().addRelation(S.EM().removeRelation(cur, i.relType, i.other), 'lié à', i.other);
                        },
                        { rebuild: true }
                      );
                    },
                  },
                  ['Remplacer par « lié à »']
                )
              : null;
          page.appendChild(S.h('div', { class: 'en-notice en-notice--' + i.level, role: 'note' }, [S.icon(i.level === 'error' ? 'alert-circle' : i.level === 'info' ? 'info-circle' : 'alert-triangle'), S.h('span', { text: i.message }), fix]));
        });
      M.findings()
        .filter(function (f) {
          return f.entityId === e.id;
        })
        .forEach(function (f) {
          var cardBtn = f.card
            ? S.h('button', { class: 'en-link', type: 'button', onclick: function () { M.createFindingCard(f); } }, ['Créer la carte « ' + f.card + ' »'])
            : null;
          page.appendChild(S.h('div', { class: 'en-notice en-notice--' + (f.level === 'alert' ? 'error' : f.level), role: 'note' }, [S.icon(M.LEVEL_ICON[f.level] || 'info-circle'), S.h('span', { text: f.text }), cardBtn]));
        });
      var ownIds = S.EM().componentIdsOf(M.state.schema, { types: e.types });
      var comps = S.EM()
        .componentIdsOf(M.state.schema, e)
        .map(function (cid) {
          return S.EM().findById(M.state.schema.components, cid);
        })
        .filter(Boolean);
      // once something is filled in, the empty groups wait (collapsed) after the links so the page opens on what matters
      var isFilled = function (comp) {
        return comp.fields.some(function (f) {
          var v = S.EM().effectiveValue(M.state.entities, e, comp.id + '.' + f.key, M.state.schema);
          return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length) && v !== false;
        });
      };
      var anyFilled = comps.some(function (c) { return c.builtin !== 'aliases' && isFilled(c); });
      var emptyBlocks = [];
      comps.forEach(function (comp) {
        var own = ownIds.indexOf(comp.id) < 0;
        var removeBtn = own
          ? S.h(
              'button',
              {
                class: 'en-link',
                type: 'button',
                title: 'Retirer ces champs de cette entité (les valeurs saisies restent en mémoire)',
                onclick: function () {
                  M.applyEntity(
                    function (cur) {
                      var base = comp.builtin === 'aliases' ? S.EM().setAliases(cur, []) : cur; // the other names go with their component
                      var left = S.EM().setComponents(
                        M.state.schema,
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
          page.appendChild(M.aliasesSection(e, removeBtn));
          return;
        }
        var rows = comp.fields.map(function (f) {
          return M.propRow(e, comp, f);
        });
        if (!rows.length) rows = [S.h('p', { class: 'en-set-empty', text: 'Aucun champ.' })];
        var late = anyFilled && !isFilled(comp);
        var block = M.section(comp.name, S.h('div', { class: 'en-set' }, rows), removeBtn, null, M.sectionIcon(comp.id), late);
        if (late) emptyBlocks.push(block);
        else page.appendChild(block);
      });
      if (!comps.length) page.appendChild(S.h('p', { class: 'en-hint en-hint--lead', text: 'Aucun champ.' }));
      var addFields = M.addFieldsRow(e, !comps.length);
      if (addFields) page.appendChild(addFields);
      var people = M.peopleSection(e);
      if (people) page.appendChild(people);
      page.appendChild(M.linksSection(e));
      var ctx = M.contextSection(e);
      if (ctx) page.appendChild(ctx);
      emptyBlocks.forEach(function (b) { page.appendChild(b); });
      page.appendChild(M.modelSection(e));
      page.appendChild(M.historyBox);
      M.paintHistory();
    };
    M.addFieldsRow = function addFieldsRow(e, first) {
      var have = S.EM().componentIdsOf(M.state.schema, e);
      var avail = M.state.schema.components.filter(function (c) {
        return have.indexOf(c.id) < 0 && (c.fields.length || c.builtin) && S.EM().componentFits(M.state.schema, e, c.id);
      });
      if (!avail.length) return null;
      return S.h('div', { class: 'en-addrow' }, [
        S.h(
          'button',
          {
            class: 'en-btn en-btn--ghost',
            type: 'button',
            'aria-haspopup': 'menu',
            'aria-expanded': 'false',
            title: 'Ajouter un groupe de champs à cette entité seulement, sans changer son type',
            onclick: function (ev) {
              M.openPop(ev.currentTarget, function (el) {
                avail.forEach(function (c) {
                  el.appendChild(
                    M.menuItem(
                      'forms',
                      c.name,
                      c.fields
                        .map(function (x) {
                          return x.label;
                        })
                        .join(', '),
                      function () {
                        M.applyEntity(
                          function (cur) {
                            return S.EM().setComponents(M.state.schema, cur, (cur.components || []).concat([c.id]));
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
          [S.icon('plus'), first ? 'Ajouter des champs' : 'Ajouter d’autres champs']
        ),
      ]);
    };
    M.contextSection = function contextSection(e) {
      var rows = [];
      function row(label, nodes) {
        rows.push(S.h('div', { class: 'en-prop en-prop--ctx' }, [S.h('span', { class: 'en-prop-label', text: label }), S.h('div', { class: 'en-prop-value en-crumb' }, nodes), S.h('span', { class: 'en-prop-meta' })]));
      }
      function chain(ids) {
        var nodes = [];
        ids.forEach(function (id, i) {
          var o = S.EM().findById(M.state.entities, id);
          if (!o) return;
          if (i) nodes.push(S.h('span', { class: 'en-crumb-sep', text: '›' }));
          nodes.push(M.entityChip(o));
        });
        return nodes;
      }
      var path = S.EM().pathOf(M.state.schema, M.state.entities, e.id);
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
      var inside = S.EM().descendantsOf(M.state.schema, M.state.entities, e.id);
      if (inside.length) {
        var nodes = inside.slice(0, 12).map(function (id) {
          return S.EM().findById(M.state.entities, id);
        });
        nodes = nodes.filter(Boolean).map(M.entityChip);
        if (inside.length > 12) nodes.push(S.h('span', { class: 'en-hint', text: '+ ' + (inside.length - 12) }));
        row('Contient', nodes);
      }
      var g = S.EM().groundingOf(M.state.schema, M.state.entities, e.id);
      if (g.grounded && g.path.length > 1) row('Ancré par', chain(g.path.slice(1)));
      if (!rows.length) return null;
      return M.section('Contexte', S.h('div', { class: 'en-set' }, rows), null, null, M.sectionIcon('contexte'));
    };
    M.libraryTypeId = function libraryTypeId(presetId) {
      var EL = global.EntitiesLibrary;
      if (!EL) return '';
      var have = EL.installedAs(M.state.schema, presetId);
      if (have) return have.id;
      var r = EL.install(M.state.schema, presetId);
      if (!r || r.error) return '';
      M.state.schema = r.schema;
      M.scheduleSave();
      return (r.typeIds && r.typeIds[presetId]) || presetId;
    };
    M.setPersonRoles = function setPersonRoles(spec, toId, roles) {
      M.applyEntity(
        function (cur) {
          var next = cur;
          cur.relations.forEach(function (r) {
            if (r.to === toId && S.EM().normKey(r.type) === S.EM().normKey(spec.rel)) next = S.EM().removeRelation(next, r.type, toId, undefined, r.role);
          });
          if (roles === null) return next; // roles === null: take the person out
          (roles.length ? roles : ['']).forEach(function (role) {
            next = S.EM().addRelation(next, spec.rel, toId, undefined, role);
          });
          return next;
        },
        { rebuild: true }
      );
    };
    M.peopleSection = function peopleSection(e) {
      var spec = S.EM().peopleSpec(M.state.schema, e);
      if (!spec) return null;
      var order = [];
      var roles = {};
      S.EM().peopleRelations(M.state.schema, e, M.state.entities).forEach(function (r) {
        if (!roles[r.to]) {
          roles[r.to] = [];
          order.push(r.to);
        }
        if (r.role) roles[r.to].push(r.role);
      });
      var known = [];
      M.state.entities.forEach(function (x) {
        (x.relations || []).forEach(function (r) {
          if (r.role && known.indexOf(r.role) < 0) known.push(r.role);
        });
      });
      var roleList = S.h('datalist', { id: 'en-roles' }, known.map(function (r) { return S.h('option', { value: r }); }));
      var rows = [roleList];
      order.forEach(function (toId) {
        var other = S.EM().findById(M.state.entities, toId);
        var current = roles[toId].join(', ');
        var input = S.h('input', { class: 'en-people-role', type: 'text', value: current, placeholder: 'Rôle…', 'aria-label': 'Rôle de ' + (other ? other.name : ''), list: 'en-roles', autocomplete: 'off' });
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') input.blur();
        });
        input.addEventListener('change', function () {
          if (input.value.trim() === current) return;
          M.setPersonRoles(
            spec,
            toId,
            input.value
              .split(',')
              .map(function (s) { return s.trim(); })
              .filter(Boolean)
          );
        });
        rows.push(
          S.h('div', { class: 'en-prop en-prop--link en-prop--people' }, [
            S.h('span', { class: 'en-prop-label' }, [input]),
            S.h('div', { class: 'en-prop-value' }, [other ? M.entityChip(other) : S.h('span', { class: 'en-hint', text: '(supprimée)' })]),
            S.h('span', { class: 'en-prop-meta' }, [
              S.h('button', { class: 'en-reset', type: 'button', title: 'Retirer', 'aria-label': 'Retirer ' + (other ? other.name : ''), onclick: function (ev) { ev.stopPropagation(); M.setPersonRoles(spec, toId, null); } }, [S.icon('x')]),
            ]),
          ])
        );
      });
      var addBtn = S.h('button', { class: 'en-set-add', type: 'button', 'aria-haspopup': 'dialog' }, [S.icon('plus'), spec.add]);
      addBtn.addEventListener('click', function () {
        var personType = M.libraryTypeId('personne');
        var groupType = M.libraryTypeId('groupe');
        var pool = M.state.entities.filter(function (x) {
          if (x.id === e.id) return false;
          var ns = S.EM().naturesOf(M.state.schema, x);
          return ns.indexOf('agent') >= 0 || ns.indexOf('social') >= 0;
        });
        M.refPicker(addBtn, e, { refTypes: personType ? [personType] : [], alsoType: groupType }, pool, order, function (id) {
          M.setPersonRoles(spec, id, []);
        });
      });
      rows.push(addBtn);
      return M.section(spec.title, S.h('div', { class: 'en-set' }, rows), null, null, 'users');
    };
    M.linksSection = function linksSection(e) {
      var rows = [];
      var shownAsPeople = S.EM().peopleRelations(M.state.schema, e, M.state.entities);
      e.relations.forEach(function (r) {
        if (shownAsPeople.indexOf(r) >= 0) return;
        var other = S.EM().findById(M.state.entities, r.to);
        rows.push(
          S.h('div', { class: 'en-prop en-prop--link' }, [
            S.h('span', { class: 'en-prop-label', text: S.cap(r.type) }),
            S.h('div', { class: 'en-prop-value' }, [other ? M.entityChip(other) : S.h('span', { class: 'en-hint', text: '(supprimée)' })]),
            S.h('span', { class: 'en-prop-meta' }, [
              S.h(
                'button',
                {
                  class: 'en-reset',
                  type: 'button',
                  title: 'Retirer le lien',
                  'aria-label': 'Retirer le lien ' + r.type,
                  onclick: function () {
                    M.applyEntity(
                      function (cur) {
                        return S.EM().removeRelation(cur, r.type, r.to);
                      },
                      { rebuild: true }
                    );
                  },
                },
                [S.icon('x')]
              ),
            ]),
          ])
        );
      });
      S.EM()
        .linksOf(M.state.schema, M.state.entities, e.id)
        .filter(function (l) {
          return l.dir === 'in' && l.via !== 'variante de';
        })
        .forEach(function (l) {
          var other = S.EM().findById(M.state.entities, l.other);
          if (!other) return;
          var via = String(l.via);
          var label = l.inverse && l.inverse !== via ? l.inverse : via.indexOf(' / ') >= 0 ? 'Utilisé comme « ' + via.split(' / ').pop() + ' » par' : '← ' + via;
          if (l.role) label += ' (' + l.role + ')';
          rows.push(
            S.h('div', { class: 'en-prop en-prop--link is-in' }, [
              S.h('span', { class: 'en-prop-label', text: S.cap(label) }),
              S.h('div', { class: 'en-prop-value' }, [M.entityChip(other)]),
              S.h('span', { class: 'en-prop-meta' }),
            ])
          );
        });
      var others = M.state.entities.filter(function (x) {
        return x.id !== e.id;
      });
      if (others.length) {
        rows.push(M.state.linkOpen ? M.linkForm(e, others) : S.h('button', { class: 'en-set-add', type: 'button', onclick: function () { M.state.linkOpen = true; M.state.refocus = '.en-link-type'; M.paintMain(); } }, [S.icon('plus'), 'Ajouter un lien']));
      } else if (!rows.length) {
        rows.push(S.h('p', { class: 'en-set-empty', text: 'Aucun lien.' }));
      }
      return M.section('Liens', S.h('div', { class: 'en-set' }, rows), null, null, M.sectionIcon('liens'));
    };
    M.linkForm = function linkForm(e, others) {
      var relType = S.h('input', {
        class: 'en-input en-link-type',
        type: 'text',
        placeholder: 'Lien (ex. situé dans, fait de)',
        'aria-label': 'Type de lien',
        list: 'en-rel-types',
        autocomplete: 'off',
      });
      var relList = S.h('datalist', { id: 'en-rel-types' });
      S.EM()
        .relationsFor(S.EM().naturesOf(M.state.schema, e))
        .forEach(function (d) {
          relList.appendChild(S.h('option', { value: d.name }));
        });
      var relTo = S.h('select', { class: 'en-input', 'aria-label': 'Entité liée' });
      others
        .slice()
        .sort(function (a, b) {
          return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
        })
        .forEach(function (x) {
          relTo.appendChild(S.h('option', { value: x.id, text: x.name }));
        });
      function submit() {
        if (!relTo.value) return;
        if (S.EM().wouldCycleRelation(M.state.schema, M.state.entities, e.id, relType.value, relTo.value)) {
          M.toast('Ce lien ferait contenir une entité par elle-même.', 'error');
          return;
        }
        M.state.linkOpen = false;
        M.applyEntity(
          function (cur) {
            return S.EM().addRelation(cur, relType.value, relTo.value);
          },
          { rebuild: true }
        );
      }
      relType.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') submit();
        else if (ev.key === 'Escape') cancel();
      });
      function cancel() {
        M.state.linkOpen = false;
        M.paintMain();
      }
      return S.h('div', { class: 'en-linkform' }, [
        relList,
        relType,
        relTo,
        S.h('button', { class: 'en-btn en-btn--primary', type: 'button', onclick: submit }, ['Lier']),
        S.h('button', { class: 'en-btn', type: 'button', onclick: cancel }, ['Annuler']),
      ]);
    };
    M.modelSection = function modelSection(e) {
      var base = e.base ? S.EM().findById(M.state.entities, e.base) : null;
      var variants = S.EM().variantsOf(M.state.entities, e.id);
      var open = M.state.openModel === undefined ? !!(base || variants.length) : M.state.openModel;
      var meta = base ? 'suit « ' + base.name + ' »' : variants.length ? variants.length + (variants.length > 1 ? ' variantes' : ' variante') : '';
      var box = S.h('section', { class: 'en-sec en-sec--disc' }, [
        M.disclosure('Modèle et variantes', meta, open, function () {
          M.state.openModel = !open;
          M.paintMain();
        }),
      ]);
      if (!open) return box;
      var sel = S.h('select', { class: 'en-ctl', id: 'en-model', 'aria-label': 'Modèle suivi par cette entité' });
      sel.appendChild(S.h('option', { value: '', text: 'Aucun (entité indépendante)' }));
      M.state.entities
        .slice()
        .sort(function (a, b) {
          return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
        })
        .forEach(function (x) {
          if (x.id === e.id || S.EM().wouldCycle(M.state.entities, e.id, x.id)) return;
          sel.appendChild(S.h('option', { value: x.id, text: x.name }));
        });
      sel.value = e.base || '';
      sel.addEventListener('change', function () {
        M.applyEntity(
          function (cur) {
            return S.EM().setBase(M.state.entities, cur, sel.value);
          },
          { rebuild: true }
        );
      });
      var rows = [S.h('div', { class: 'en-prop' }, [S.h('label', { class: 'en-prop-label', for: 'en-model', text: 'Modèle' }), S.h('div', { class: 'en-prop-value' }, [S.h('span', { class: 'en-select' }, [sel])]), S.h('span', { class: 'en-prop-meta' })])];
      if (variants.length) {
        rows.push(
          S.h('div', { class: 'en-prop en-prop--ctx' }, [
            S.h('span', { class: 'en-prop-label', text: 'Variantes' }),
            S.h('div', { class: 'en-prop-value en-crumb' }, variants.map(M.entityChip)),
            S.h('span', { class: 'en-prop-meta' }),
          ])
        );
      }
      box.appendChild(S.h('div', { class: 'en-set' }, rows));
      return box;
    };
    M.emptyState = function emptyState() {
      var has = M.state.entities.length > 0;
      var box = S.h('div', { class: 'en-empty' }, [
        S.h('span', { class: 'en-empty-ic' }, [S.icon('stack-2')]),
        S.h('h2', { class: 'en-empty-title', text: has ? 'Aucune entité sélectionnée' : 'Aucune entité' }),
        S.h('button', { class: 'en-btn en-btn--primary', type: 'button', onclick: function () { M.openComposer(); } }, [S.icon('wand'), 'Composer une entité']),
      ]);
      var hasPlant = M.state.schema.types.some(function (ty) {
        return ty.id === 'plante';
      });
      if (!hasPlant && !has) {
        box.appendChild(S.h('button', { class: 'en-link', type: 'button', onclick: M.addPlantExample }, [S.icon('plant'), 'Exemple : Plante']));
      }
      return box;
    };
    M.addPlantExample = function addPlantExample() {
      var s = S.EM().upsertComponent(M.state.schema, {
        id: 'entretien',
        name: 'Entretien',
        fields: [
          { key: 'interval_days', label: 'Arroser tous les (jours)', kind: 'number' },
          { key: 'last_done', label: 'Dernier arrosage', kind: 'date' },
          { key: 'health', label: 'Santé', kind: 'choice', options: ['bonne', 'fragile', 'morte'] },
        ],
      });
      s = S.EM().upsertType(s, { id: 'plante', name: 'Plante', aliases: ['plant', 'verdure'], components: ['location', 'entretien'] });
      M.setSchema(s);
      M.toast('Type « Plante » ajouté. Créez des plantes, puis un lieu avec l’alias « travail ».');
    };
    M.setSchema = function setSchema(next) {
      M.state.schema = next;
      M.state.entities = M.state.entities.map(function (e) {
        return S.EM().normalizeEntity(e, next);
      });
      M.scheduleSave();
      M.paintList();
      M.paintMain();
    };
    M.paintSchema = function paintSchema(main) {
      main.appendChild(
        S.h('header', { class: 'en-hero en-hero--schema' }, [
          S.h(
            'button',
            {
              class: 'en-back',
              type: 'button',
              onclick: function () {
                M.state.mode = 'entity';
                M.paintList();
                M.paintMain();
              },
            },
            [S.icon('chevron-left'), 'Entités']
          ),
          S.h('h2', { class: 'en-page-title', text: 'Types et composants' }),
        ])
      );
      if (global.EntitiesLibrary) main.appendChild(M.libraryCard());
      if (S.ES()) main.appendChild(M.systemsCard());
      main.appendChild(M.relationsCard());
      main.appendChild(S.h('h3', { class: 'en-h en-h--section', text: 'Types (archétypes)' }));
      M.state.schema.types.forEach(function (ty) {
        main.appendChild(M.typeCard(ty));
      });
      main.appendChild(
        S.h(
          'button',
          {
            class: 'en-btn',
            onclick: function () {
              var n = M.state.schema.types.length + 1;
              M.setSchema(S.EM().upsertType(M.state.schema, { name: 'Type ' + n, components: [] }));
            },
          },
          [S.icon('plus'), 'Nouveau type']
        )
      );
      main.appendChild(S.h('h3', { class: 'en-h en-h--section', text: 'Composants' }));
      M.state.schema.components.forEach(function (c) {
        main.appendChild(M.componentCard(c));
      });
      main.appendChild(
        S.h(
          'button',
          {
            class: 'en-btn',
            onclick: function () {
              var n = M.state.schema.components.length + 1;
              M.setSchema(S.EM().upsertComponent(M.state.schema, { name: 'Composant ' + n, fields: [] }));
            },
          },
          [S.icon('plus'), 'Nouveau composant']
        )
      );
    };
    M.systemsCard = function systemsCard() {
      var card = S.h('div', { class: 'en-card' }, [S.h('h3', { class: 'en-h', text: 'Règles' })]);
      (M.state.schema.systems || []).forEach(function (sys) {
        var on = S.h('input', { type: 'checkbox', checked: sys.enabled ? true : null, 'aria-label': 'Activer ' + sys.name });
        on.addEventListener('change', function () {
          M.setSchema(S.EM().upsertSystem(M.state.schema, Object.assign({}, sys, { enabled: on.checked })));
        });
        card.appendChild(
          S.h('div', { class: 'en-field-row' }, [
            S.h('label', { class: 'en-check' }, [on, sys.name]),
            S.h('span', { class: 'en-hint', text: S.ES().describe(M.state.schema, sys) }),
            S.h('button', { class: 'en-link', type: 'button', 'aria-label': 'Supprimer la règle ' + sys.name, onclick: function () { M.setSchema(S.EM().removeSystem(M.state.schema, sys.id)); } }, [S.icon('x')]),
          ])
        );
      });
      var have = {};
      (M.state.schema.systems || []).forEach(function (s) {
        have[s.id] = true;
      });
      var presets = S.ES().PRESETS.filter(function (p) {
        return !have[p.id];
      });
      if (presets.length) {
        var row = S.h('div', { class: 'en-lib-row' });
        presets.forEach(function (p) {
          row.appendChild(
            S.h('button', {
              class: 'en-btn en-btn--small',
              type: 'button',
              onclick: function () {
                var r = S.ES().install(M.state.schema, p.id);
                if (r.error) return M.toast('Règle impossible : schéma trop grand ou composant manquant.', 'error');
                M.setSchema(r.schema);
              },
            }, [S.icon('plus'), p.name])
          );
        });
        card.appendChild(row);
      }
      if (M.state.ai && S.ESAI()) {
        var input = S.h('input', { class: 'en-input', placeholder: 'Décrire une règle…', 'aria-label': 'Décrire une règle' });
        var go = function () {
          if (!input.value.trim()) return;
          input.disabled = true;
          S.ESAI()
            .author(M.t, M.state.schema, input.value)
            .then(function (r) {
              if (r.error) {
                input.disabled = false;
                return M.toast(r.error === 'unclear' ? 'Je n’ai pas compris cette règle avec vos composants.' : 'Le modèle n’a pas répondu.', 'error');
              }
              M.state.draftRule = r.system;
              M.paintMain();
            });
        };
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') go();
        });
        card.appendChild(S.h('div', { class: 'en-link-add' }, [input, S.h('button', { class: 'en-btn', type: 'button', onclick: go }, [S.icon('sparkles'), 'Écrire'])]));
      }
      if (M.state.draftRule) {
        var d = M.state.draftRule;
        card.appendChild(
          S.h('div', { class: 'en-notice en-notice--info' }, [
            S.icon('sparkles'),
            S.h('span', { text: d.name + ' : ' + S.ES().describe(M.state.schema, d) + ' → ' + d.then.text + (d.then.card ? ' (carte « ' + d.then.card + ' »)' : '') }),
            S.h('button', { class: 'en-link', type: 'button', onclick: function () { var next = S.EM().upsertSystem(M.state.schema, d); M.state.draftRule = null; M.setSchema(next); } }, ['Ajouter']),
            S.h('button', { class: 'en-link', type: 'button', onclick: function () { M.state.draftRule = null; M.paintMain(); } }, ['Annuler']),
          ])
        );
      }
      S.ES()
        .duplicateFields(M.state.schema)
        .slice(0, 3)
        .forEach(function (dup) {
          card.appendChild(
            S.h('div', { class: 'en-notice en-notice--info' }, [
              S.icon('copy'),
              S.h('span', {
                text:
                  'Champ en double : ' +
                  dup.label +
                  ' (' +
                  dup.paths
                    .map(function (p) {
                      var c = S.EM().findById(M.state.schema.components, p.split('.')[0]);
                      return c ? c.name : p;
                    })
                    .join(', ') +
                  ')',
              }),
            ])
          );
        });
      return card;
    };
    },
    run: function (M) {
    M.CATEGORY_LABELS = {
      spatial: 'Spatial', mereological: 'Parties et touts', composition: 'Composition', production: 'Production', social: 'Social',
      taxonomic: 'Classification', grounding: 'Ancrage', causal: 'Causal', temporal: 'Temps', conceptual: 'Conceptuel', generic: 'Générique',
    };
    }
  });
})(typeof window !== 'undefined' ? window : this);
