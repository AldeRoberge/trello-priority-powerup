/**
 * priority-ui-info-field: createInfoField() part 5 of 8.
 * The body of createInfoField runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see priority-ui-info-field.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var P = (global.PriorityUIPartsMountCreateInfoField = global.PriorityUIPartsMountCreateInfoField || { list: [] });

  P.list.push({
    define: function (M) {
    M.tgOpenCreatePerson = function tgOpenCreatePerson(pt) {
      if (!M.onCustomAssigneesChange) return;
      M.tgCloseEditor();
      M.tgCreate.replaceChildren();
      M.tgCreate.hidden = false;
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'tg-editor-label';
      input.maxLength = S.MAX_CUSTOM_ASSIGNEE_NAME_LEN;
      input.placeholder = 'Nom de la nouvelle personne';
      input.setAttribute('aria-label', 'Nom de la nouvelle personne');
      M.tgCreate.appendChild(input);
      var busy = false;
      var submit = function () {
        var name = input.value.trim();
        if (!name || busy) return;
        busy = true;
        input.disabled = true;
        Promise.resolve(M.tgCreatePerson(name)).then(function (id) {
          M.tgCloseCreate();
          if (!id) return;
          M.tgPositions[id] = { x: M.tgSnap(pt.x), y: M.tgSnap(pt.y) };
          M.tgSavePositions();
          M.renderTeamGraph();
        });
      };
      input.addEventListener('keydown', function (event) {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        } else if (event.key === 'Escape') {
          M.tgCloseCreate();
        }
      });
      var hostW = M.tgHost.clientWidth || 320;
      var w = 256;
      var left = Math.max(0, Math.min(M.tgStage.offsetLeft + M.tgPan.x + pt.x * M.tgScale, hostW - w));
      var top = Math.max(0, Math.round(M.tgPan.y + pt.y * M.tgScale));
      M.tgCreate.style.left = left + 'px';
      M.tgCreate.style.top = top + 'px';
      M.tgFrame.style.minHeight = top + M.tgCreate.offsetHeight + 8 + 'px';
      M.onLayoutChange();
      setTimeout(function () {
        try {
          input.focus();
        } catch (err) {
          /* ignore */
        }
      }, 0);
    };
    M.tgResetView = function tgResetView() {
      M.tgPan.x = 0;
      M.tgPan.y = 0;
      M.tgZoomMul = 1;
      M.tgScale = Math.max(0.25, M.tgFit);
      M.tgApplyTransform();
    };
    M.tgMenuItems = function tgMenuItems(event) {
      var target = event && event.target;
      var closest = function (sel) {
        return target && target.closest ? target.closest(sel) : null;
      };
      if (closest('.tg-editor, .tg-create, .info-member-roles-picker-host, .tg-zoom-btn, .tg-resize, .tg-collapse')) {
        return [];
      }
      var pt = M.tgStagePoint(event);
      var items = [];

      var nodeEl = closest('.tg-node');
      var nodeId = nodeEl ? nodeEl.getAttribute('data-id') : '';
      var member = null;
      if (nodeId) {
        var all = M.displayAssignees();
        for (var i = 0; i < all.length; i++) {
          if (String(all[i].id) === nodeId) member = all[i];
        }
      }
      if (member) {
        var name = M.memberDisplayName(member) || 'Membre';
        var isCustom = !!member.custom || S.isCustomAssigneeId(nodeId);
        if (M.onMemberRolesChange) {
          items.push({
            id: 'edit-roles',
            label: 'Définir les rôles de ' + name + '…',
            disabled: M.memberRolesBusy,
            action: function () {
              M.toggleMemberRolesPicker(nodeId);
            }
          });
        }
        if ((isCustom && M.onCustomAssigneesChange) || (!isCustom && M.onMemberRemove)) {
          items.push({
            id: 'remove-person',
            label: 'Retirer ' + name + ' de la carte',
            danger: true,
            disabled: M.membersBusy || M.memberRolesBusy,
            action: function () {
              M.removeMemberFromCard(member);
            }
          });
        }
        if (M.tgPositions[nodeId]) {
          items.push({
            id: 'reset-node',
            icon: 'arrow-back-up',
            group: 'Affichage',
            label: 'Replacer ' + name + ' automatiquement',
            action: function () {
              delete M.tgPositions[nodeId];
              M.tgSavePositions();
              M.renderTeamGraph();
            }
          });
        }
      }

      if (M.onCustomAssigneesChange) {
        items.push({
          id: 'create-person',
          label: 'Créer une personne…',
          keywords: 'nouvelle personne assigné ajouter nom',
          action: function () {
            M.tgOpenCreatePerson(pt);
          }
        });
      }

      var existing = [];
      if (M.onCustomAssigneesChange) {
        M.availableCatalogAssignees().forEach(function (entry) {
          var display = S.customAssigneeToMember(entry, M.boardMembers);
          existing.push({
            id: 'add-person:' + entry.id,
            icon: 'user',
            label: (display && M.memberDisplayName(display)) || entry.name || 'Personne',
            action: function () {
              Promise.resolve(M.addCatalogAssigneeFromPicker(entry)).then(function () {
                if (M.selectedMemberIds()[String(entry.id)]) {
                  M.tgPositions[String(entry.id)] = { x: M.tgSnap(pt.x), y: M.tgSnap(pt.y) };
                  M.tgSavePositions();
                  M.renderTeamGraph();
                }
              });
            }
          });
        });
      }
      if (M.onMemberAdd) {
        M.availableBoardMembers().forEach(function (m) {
          existing.push({
            id: 'add-person:' + m.id,
            icon: 'brand-trello',
            label: M.memberDisplayName(m) || 'Membre',
            action: function () {
              Promise.resolve(M.addMemberFromPicker(m)).then(function () {
                if (M.selectedMemberIds()[String(m.id)]) {
                  M.tgPositions[String(m.id)] = { x: M.tgSnap(pt.x), y: M.tgSnap(pt.y) };
                  M.tgSavePositions();
                  M.renderTeamGraph();
                }
              });
            }
          });
        });
      }
      if (existing.length) {
        items.push({
          id: 'add-existing',
          icon: 'users-plus',
          group: 'Créer',
          label: 'Ajouter une personne existante',
          keywords: 'membre tableau catalogue',
          children: existing
        });
      }

      items.push({
        id: 'fit-view',
        label: 'Recentrer la vue',
        action: M.tgResetView
      });
      if (Object.keys(M.tgPositions).length) {
        items.push({
          id: 'reset-layout',
          label: 'Réorganiser automatiquement',
          action: function () {
            M.tgPositions = {};
            M.tgSavePositions();
            M.tgResetView();
            M.renderTeamGraph();
          }
        });
      }
      return items;
    };
    M.setTgExpanded = function setTgExpanded(next) {
      next = !!next;
      if (M.tgExpanded === next) return;
      M.tgExpanded = next;
      M.membersEl.hidden = M.tgExpanded;
      if (!M.tgExpanded) {
        M.tgPan.x = 0;
        M.tgPan.y = 0;
        M.tgZoomMul = 1;
        M.tgSetPending(null);
        M.tgCloseEditor();
        M.tgCloseCreate();
      }
      M.renderTeamGraph();
      M.onLayoutChange();
    };
    M.tgSvg = function tgSvg(tag, attrs) {
      var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.keys(attrs || {}).forEach(function (k) {
        node.setAttribute(k, attrs[k]);
      });
      return node;
    };
    M.tgHue = function tgHue(id) {
      var h = 0;
      for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
      return h;
    };
    M.tgPersonName = function tgPersonName(id) {
      var all = M.displayAssignees();
      for (var i = 0; i < all.length; i++) {
        if (String(all[i].id) === id) return M.memberDisplayName(all[i]) || 'Membre';
      }
      return 'Membre';
    };
    M.tgVisibleLinks = function tgVisibleLinks(ids) {
      return S.normalizeTeamLinks(M.teamLinks, ids);
    };
    M.persistTeamLinks = function persistTeamLinks(next, silent) {
      M.teamLinks = S.normalizeTeamLinks(next);
      if (!silent) {
        M.renderTeamGraph();
        M.onLayoutChange();
      }
      if (!M.onTeamLinksChange) return Promise.resolve({ ok: true, changed: false });
      return Promise.resolve(M.onTeamLinksChange(M.teamLinks)).catch(function (err) {
        console.error('Info team links save failed', err);
        M.setMembersStatus('Échec de l’enregistrement', 'error');
      });
    };
    M.tgCloseEditor = function tgCloseEditor() {
      if (!M.tgSelectedKey && M.tgEditor.hidden) return;
      M.tgSelectedKey = '';
      M.tgEditor.hidden = true;
      M.tgEditor.replaceChildren();
      M.tgFrame.style.minHeight = '';
      M.onLayoutChange();
      M.tgStage.querySelectorAll('.tg-wire-group.is-selected').forEach(function (g) {
        g.classList.remove('is-selected');
      });
    };
    M.tgSetPending = function tgSetPending(next) {
      M.tgPending = next;
      M.tgHost.classList.toggle('is-linking', !!next);
      M.tgHint.textContent = next
        ? ''
        : M.tgDefaultHint();
      M.tgStage.querySelectorAll('.tg-node').forEach(function (n) {
        n.classList.toggle(
          'is-link-source',
          !!next && n.getAttribute('data-id') === next.from
        );
      });
    };
    M.tgDefaultHint = function tgDefaultHint() {
      return '';
    };
    M.tgCommitLink = function tgCommitLink(from, to, kind) {
      if (!M.onTeamLinksChange || !from || !to || from === to) return;
      var next = S.connectTeamPeople(M.teamLinks, from, to, kind);
      M.tgSelectedKey = S.teamLinkPairKey(from, to);
      M.persistTeamLinks(next);
    };
    M.tgOpenEditor = function tgOpenEditor(link, mx, my) {
      M.tgCloseCreate();
      M.tgSelectedKey = S.teamLinkPairKey(link.from, link.to);
      M.tgEditor.replaceChildren();
      M.tgEditor.hidden = false;

      var title = document.createElement('div');
      title.className = 'tg-editor-title';
      var sentence = document.createElement('span');
      var meta = M.TG_KIND_META[link.kind];
      var who = document.createElement('strong');
      who.textContent = M.tgPersonName(link.from);
      var whom = document.createElement('strong');
      whom.textContent = M.tgPersonName(link.to);
      sentence.appendChild(who);
      sentence.appendChild(document.createTextNode(' ' + meta.verb + ' '));
      sentence.appendChild(whom);
      title.appendChild(sentence);
      M.tgEditor.appendChild(title);

      var seg = document.createElement('div');
      seg.className = 'tg-editor-seg';
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', 'Type de relation');
      ['asks', 'flow', 'both'].forEach(function (kind) {
        var m = M.TG_KIND_META[kind];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tg-editor-seg-btn tg-kind-' + kind + (link.kind === kind ? ' is-on' : '');
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', link.kind === kind ? 'true' : 'false');
        btn.innerHTML = '<i class="ti ' + m.icon + '" aria-hidden="true"></i>';
        var span = document.createElement('span');
        span.textContent = m.label;
        btn.appendChild(span);
        btn.addEventListener('click', function () {
          if (!M.onTeamLinksChange || link.kind === kind) return;
          var updated = { from: link.from, to: link.to, kind: kind };
          if (link.label) updated.label = link.label;
          M.persistTeamLinks(S.upsertTeamLink(M.teamLinks, updated));
        });
        seg.appendChild(btn);
      });
      M.tgEditor.appendChild(seg);

      var labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'tg-editor-label';
      labelInput.maxLength = S.MAX_TEAM_LINK_LABEL;
      labelInput.placeholder = 'Précision (ex. montage, sous-titres…)';
      labelInput.value = link.label || '';
      labelInput.setAttribute('aria-label', 'Précision sur la relation');
      labelInput.disabled = !M.onTeamLinksChange;
      var commitLabel = function (silent) {
        var value = labelInput.value.trim();
        if (value === (link.label || '')) return;
        var updated = { from: link.from, to: link.to, kind: link.kind };
        if (value) updated.label = value;
        link.label = value;
        M.persistTeamLinks(S.upsertTeamLink(M.teamLinks, updated), silent);
      };
      labelInput.addEventListener('keydown', function (event) {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commitLabel(false);
          M.tgCloseEditor();
        } else if (event.key === 'Escape') {
          M.tgCloseEditor();
        }
      });
      labelInput.addEventListener('blur', function () {
        // Silent: re-rendering here would swallow the click that caused the blur.
        commitLabel(true);
      });
      M.tgEditor.appendChild(labelInput);

      var actions = document.createElement('div');
      actions.className = 'tg-editor-actions';
      var swap = document.createElement('button');
      swap.type = 'button';
      swap.className = 'tg-editor-action';
      swap.innerHTML = '<i class="ti ti-switch-horizontal" aria-hidden="true"></i>';
      swap.appendChild(document.createTextNode(' Inverser'));
      swap.title = 'Inverser le sens';
      swap.disabled = !M.onTeamLinksChange || link.kind === 'both';
      swap.addEventListener('click', function () {
        var updated = { from: link.to, to: link.from, kind: link.kind };
        if (link.label) updated.label = link.label;
        M.persistTeamLinks(S.upsertTeamLink(M.teamLinks, updated));
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'tg-editor-action is-danger';
      del.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
      del.appendChild(document.createTextNode(' Supprimer'));
      del.disabled = !M.onTeamLinksChange;
      del.addEventListener('click', function () {
        M.tgSelectedKey = '';
        M.persistTeamLinks(S.removeTeamLink(M.teamLinks, link.from, link.to));
      });
      actions.appendChild(swap);
      actions.appendChild(del);
      M.tgEditor.appendChild(actions);

      var hostW = M.tgHost.clientWidth || 320;
      var edW = 256;
      var left = M.tgStage.offsetLeft + M.tgPan.x + mx * M.tgScale - edW / 2;
      left = Math.max(0, Math.min(left, hostW - edW));
      M.tgEditor.style.left = left + 'px';
      var edTop = Math.max(0, Math.round(M.tgPan.y + my * M.tgScale + 16));
      M.tgEditor.style.top = edTop + 'px';
      // Reserve room so the iframe grows instead of clipping the editor.
      M.tgFrame.style.minHeight = edTop + M.tgEditor.offsetHeight + 8 + 'px';
      M.onLayoutChange();
      M.tgStage.querySelectorAll('.tg-wire-group').forEach(function (g) {
        g.classList.toggle(
          'is-selected',
          g.getAttribute('data-key') === M.tgSelectedKey
        );
      });
    };
    M.tgBuildNode = function tgBuildNode(member) {
      var mid = String(member.id);
      var name = M.memberDisplayName(member) || 'Membre';
      var isCustom = !!member.custom || S.isCustomAssigneeId(mid);
      var node = document.createElement('div');
      node.className = 'tg-node' + (isCustom ? ' is-custom' : '');
      node.setAttribute('data-id', mid);
      node.style.width = M.TG_NODE_W + 'px';
      if (M.tgPending && M.tgPending.from === mid) node.classList.add('is-link-source');
      node.style.setProperty('--tg-hue', String(M.tgHue(mid)));
      node.setAttribute('aria-label', name);

      var head = document.createElement('div');
      head.className = 'tg-node-head';
      M.appendMemberAvatar(head, member);
      var nameEl = document.createElement('span');
      nameEl.className = 'tg-node-name';
      nameEl.textContent = name;
      nameEl.title = name + (isCustom ? ' (hors Trello)' : '');
      head.appendChild(nameEl);

      var canRemove =
        (isCustom && !!M.onCustomAssigneesChange) || (!isCustom && !!M.onMemberRemove);
      if (canRemove) {
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'tg-node-clear';
        clearBtn.setAttribute('aria-label', 'Retirer : ' + name);
        clearBtn.textContent = '×';
        clearBtn.disabled = M.membersBusy || M.memberRolesBusy;
        clearBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          M.removeMemberFromCard(member);
        });
        head.appendChild(clearBtn);
      }
      node.appendChild(head);

      var body = document.createElement('div');
      body.className = 'tg-node-roles';
      M.rolesForMember(mid).forEach(function (roleId) {
        var entry = S.getMemberRoleEntry(roleId);
        var label = (entry && entry.label) || roleId;
        var chip = document.createElement('span');
        chip.className = 'tg-role';
        chip.title = label;
        var icon = document.createElement('i');
        icon.className = 'ti ti-' + ((entry && entry.icon) || 'tag');
        icon.setAttribute('aria-hidden', 'true');
        var text = document.createElement('span');
        text.textContent = label;
        chip.appendChild(icon);
        chip.appendChild(text);
        if (M.onMemberRolesChange) {
          var x = document.createElement('button');
          x.type = 'button';
          x.className = 'tg-role-clear';
          x.setAttribute('aria-label', 'Retirer le rôle ' + label);
          x.textContent = '×';
          x.disabled = M.memberRolesBusy;
          x.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            M.removeRoleFromMember(mid, roleId);
          });
          chip.appendChild(x);
        }
        body.appendChild(chip);
      });
      if (M.onMemberRolesChange) {
        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'tg-role-add' + (M.memberRolesPickerMemberId === mid ? ' is-open' : '');
        add.title = 'Définir les rôles';
        add.setAttribute('aria-label', 'Définir les rôles de ' + name);
        add.setAttribute('aria-expanded', M.memberRolesPickerMemberId === mid ? 'true' : 'false');
        add.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
        if (!M.rolesForMember(mid).length) {
          var addText = document.createElement('span');
          addText.textContent = 'Rôle';
          add.appendChild(addText);
        }
        add.disabled = M.memberRolesBusy;
        add.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          M.toggleMemberRolesPicker(mid);
        });
        body.appendChild(add);
      }
      if (body.childNodes.length) node.appendChild(body);

      // Edges: hover a side to reveal its handle, then drag from it.
      //   bottom = "demande a", right = "enchaine vers"  (this person is the source)
      //   top / left = same relations, but this person is the target ("recoit de")
      if (M.onTeamLinksChange) {
        [
          { side: 'top', kind: 'asks', reverse: true, label: 'Relier quelqu’un qui te demande' },
          { side: 'left', kind: 'flow', reverse: true, label: 'Relier quelqu’un qui t’enchaîne' },
          { side: 'bottom', kind: 'asks', reverse: false, label: 'Demander à quelqu’un' },
          { side: 'right', kind: 'flow', reverse: false, label: 'Enchaîner vers quelqu’un' }
        ].forEach(function (def) {
          var edge = document.createElement('div');
          edge.className = 'tg-edge tg-edge-' + def.side + ' tg-kind-' + def.kind;
          edge.setAttribute('role', 'button');
          edge.tabIndex = 0;
          edge.setAttribute('data-kind', def.kind);
          edge.setAttribute('aria-label', name + ' : ' + def.label);
          edge.title = def.label;
          var dot = document.createElement('span');
          dot.className = 'tg-pin';
          dot.setAttribute('aria-hidden', 'true');
          edge.appendChild(dot);
          edge.addEventListener('pointerdown', function (event) {
            M.tgStartDrag(event, edge, mid, def.side, def.kind, def.reverse);
          });
          edge.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              M.tgSetPending({ from: mid, kind: def.kind, reverse: def.reverse });
            }
          });
          node.appendChild(edge);
        });
      }

      node.addEventListener('pointerdown', function (event) {
        if (event.button != null && event.button !== 0) return;
        if (M.tgPending || M.tgMoving) return;
        if (event.target.closest('.tg-node-clear, .tg-role-clear, .tg-role-add, .tg-edge, .tg-role')) return;
        var box = M.tgLayout && M.tgLayout.nodes[mid];
        if (!box) return;
        M.tgMoving = { id: mid, sx: event.clientX, sy: event.clientY, x0: box.x, y0: box.y, moved: false, raf: 0, pid: event.pointerId };
        try {
          M.tgFrame.setPointerCapture(event.pointerId);
        } catch (err) {
          /* optional */
        }
      });
      node.addEventListener('click', function (event) {
        if (!M.tgPending) return;
        if (event.target.closest('.tg-node-clear, .tg-role-clear, .tg-role-add, .tg-edge')) return;
        event.preventDefault();
        var pending = M.tgPending;
        M.tgSetPending(null);
        if (pending.from !== mid) {
          if (pending.reverse) M.tgCommitLink(mid, pending.from, pending.kind);
          else M.tgCommitLink(pending.from, mid, pending.kind);
        }
      });
      return node;
    };
    M.tgStagePoint = function tgStagePoint(event) {
      var rect = M.tgStage.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / M.tgScale,
        y: (event.clientY - rect.top) / M.tgScale
      };
    };
    M.tgCloseCreate = function tgCloseCreate() {
      if (M.tgCreate.hidden) return;
      M.tgCreate.hidden = true;
      M.tgCreate.replaceChildren();
      if (M.tgEditor.hidden) M.tgFrame.style.minHeight = '';
      M.onLayoutChange();
    };
    M.tgCreatePerson = function tgCreatePerson(rawName) {
      var name = String(rawName || '').trim();
      if (!name || M.membersBusy || !M.onCustomAssigneesChange) return Promise.resolve('');
      var key = name.toLocaleLowerCase('fr-FR');
      var all = M.displayAssignees();
      for (var i = 0; i < all.length; i++) {
        var existing = (M.memberDisplayName(all[i]) || '').toLocaleLowerCase('fr-FR');
        if (existing === key) return Promise.resolve(String(all[i].id));
      }
      var hit = S.findCustomAssigneeCatalogByName(name);
      var draft = hit
        ? S.normalizeCustomAssigneeEntry({
            id: hit.id,
            name: hit.name,
            trelloMemberId: hit.trelloMemberId || ''
          })
        : S.createCustomAssignee({ name: name, trelloMemberId: '' });
      if (!draft) {
        M.setMembersStatus('Nom invalide', 'error');
        return Promise.resolve('');
      }
      var before = S.getCustomAssigneeCatalog();
      var upserted = S.upsertCustomAssigneeCatalog(draft);
      if (!upserted) {
        M.setMembersStatus('Catalogue plein', 'error');
        return Promise.resolve('');
      }
      draft = upserted;
      var after = S.getCustomAssigneeCatalog();
      var saved =
        JSON.stringify(before) !== JSON.stringify(after)
          ? M.persistCustomAssigneeCatalog(after)
          : Promise.resolve({ ok: true });
      return Promise.resolve(saved).then(function (result) {
        if (result && result.ok === false) return '';
        return Promise.resolve(M.persistCustomAssignees(M.customAssignees.concat([draft]))).then(
          function () {
            return String(draft.id);
          }
        );
      });
    };
    M.tgOpenPicker = function tgOpenPicker(pt, fromId, kind, reverse) {
      M.tgCloseEditor();
      M.tgCreate.replaceChildren();
      M.tgCreate.hidden = false;

      var finish = function (idPromise) {
        Promise.resolve(idPromise).then(function (id) {
          M.tgCloseCreate();
          if (!id || id === fromId) return;
          if (reverse) M.tgCommitLink(id, fromId, kind);
          else M.tgCommitLink(fromId, id, kind);
        });
      };

      // One flat, ranked list: people already on the card, then saved people,
      // then board members. Only a few show up front; typing searches them all.
      var candidates = [];
      M.displayAssignees().forEach(function (m) {
        if (String(m.id) === fromId) return;
        candidates.push({
          member: m,
          name: M.memberDisplayName(m) || 'Membre',
          pick: function () {
            return Promise.resolve(String(m.id));
          }
        });
      });
      if (M.onCustomAssigneesChange) {
        M.availableCatalogAssignees().forEach(function (entry) {
          var display = S.customAssigneeToMember(entry, M.boardMembers);
          candidates.push({
            member: display,
            name: (display && M.memberDisplayName(display)) || entry.name || 'Personne',
            pick: function () {
              return Promise.resolve(M.addCatalogAssigneeFromPicker(entry)).then(function () {
                return M.selectedMemberIds()[String(entry.id)] ? String(entry.id) : '';
              });
            }
          });
        });
      }
      if (M.onMemberAdd) {
        M.availableBoardMembers().forEach(function (m) {
          candidates.push({
            member: m,
            name: M.memberDisplayName(m) || 'Membre',
            pick: function () {
              return Promise.resolve(M.addMemberFromPicker(m)).then(function () {
                return M.selectedMemberIds()[String(m.id)] ? String(m.id) : '';
              });
            }
          });
        });
      }

      var TG_PICK_SHOWN = 4;
      var tgFold = function (s) {
        return String(s || '')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase();
      };

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'tg-editor-label';
      input.maxLength = S.MAX_CUSTOM_ASSIGNEE_NAME_LEN;
      input.placeholder = M.onCustomAssigneesChange
        ? 'Relier à… (chercher ou créer)'
        : 'Relier à… (chercher)';
      input.setAttribute('aria-label', 'Relier ' + M.tgPersonName(fromId) + ' à');
      M.tgCreate.appendChild(input);

      var list = document.createElement('div');
      list.className = 'tg-pick-list';
      M.tgCreate.appendChild(list);

      var visible = [];
      var render = function () {
        var raw = input.value.trim();
        var q = tgFold(raw);
        visible = q
          ? candidates.filter(function (c) {
              return tgFold(c.name).indexOf(q) !== -1;
            })
          : candidates.slice();
        visible = visible.slice(0, q ? 6 : TG_PICK_SHOWN);
        if (
          raw &&
          M.onCustomAssigneesChange &&
          !candidates.some(function (c) {
            return tgFold(c.name) === q;
          })
        ) {
          visible.push({
            create: true,
            name: 'Créer « ' + raw + ' »',
            pick: function () {
              return M.tgCreatePerson(raw);
            }
          });
        }
        list.replaceChildren();
        visible.forEach(function (item, i) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tg-pick-option' + (i === 0 ? ' is-active' : '');
          if (item.member) M.appendMemberAvatar(btn, item.member);
          var text = document.createElement('span');
          text.textContent = item.name;
          btn.appendChild(text);
          btn.addEventListener('click', function () {
            list.querySelectorAll('button').forEach(function (b) {
              b.disabled = true;
            });
            finish(item.pick());
          });
          list.appendChild(btn);
        });
        list.hidden = !visible.length;
      };
      var choose = function () {
        var first = list.querySelector('.tg-pick-option');
        if (first) first.click();
      };
      input.addEventListener('input', render);
      input.addEventListener('keydown', function (event) {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          choose();
        } else if (event.key === 'Escape') {
          M.tgCloseCreate();
        }
      });
      render();

      var hostW = M.tgHost.clientWidth || 320;
      var w = 256;
      var left = M.tgStage.offsetLeft + M.tgPan.x + pt.x * M.tgScale - w / 2;
      left = Math.max(0, Math.min(left, hostW - w));
      var top = Math.max(0, Math.round(M.tgPan.y + pt.y * M.tgScale + 12));
      M.tgCreate.style.left = left + 'px';
      M.tgCreate.style.top = top + 'px';
      M.tgFrame.style.minHeight = top + M.tgCreate.offsetHeight + 8 + 'px';
      M.onLayoutChange();
      setTimeout(function () {
        try {
          if (input) input.focus();
        } catch (err) {
          /* ignore */
        }
      }, 0);
    };
    M.tgStartDrag = function tgStartDrag(event, edge, fromId, side, kind, reverse) {
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      M.tgCloseEditor();
      M.tgCloseCreate();
      var box = M.tgLayout && M.tgLayout.nodes[fromId];
      if (!box) return;
      var dir = M.TG_SIDE_DIR[side];
      var start =
        side === 'top'
          ? { x: box.x + box.w / 2, y: box.y }
          : side === 'bottom'
            ? { x: box.x + box.w / 2, y: box.y + box.h }
            : side === 'left'
              ? { x: box.x, y: box.y + box.h / 2 }
              : { x: box.x + box.w, y: box.y + box.h / 2 };
      var temp = M.tgSvg('path', { class: 'tg-wire-temp tg-kind-' + kind });
      M.tgWires.appendChild(temp);
      M.tgDrag = {
        from: fromId,
        kind: kind,
        moved: false,
        sx: event.clientX,
        sy: event.clientY,
        target: '',
        last: start
      };
      M.tgHost.classList.add('is-dragging');
      try {
        edge.setPointerCapture(event.pointerId);
      } catch (err) {
        /* capture is optional */
      }
      var move = function (e) {
        if (!M.tgDrag) return;
        if (Math.abs(e.clientX - M.tgDrag.sx) + Math.abs(e.clientY - M.tgDrag.sy) > 5) {
          M.tgDrag.moved = true;
        }
        var p = M.tgStagePoint(e);
        M.tgDrag.last = p;
        var d = Math.max(
          24,
          (Math.abs(p.x - start.x) * Math.abs(dir[0]) +
            Math.abs(p.y - start.y) * Math.abs(dir[1])) / 2
        );
        temp.setAttribute(
          'd',
          'M' + start.x + ' ' + start.y +
            ' C' + (start.x + dir[0] * d) + ' ' + (start.y + dir[1] * d) +
            ' ' + (p.x - dir[0] * d) + ' ' + (p.y - dir[1] * d) +
            ' ' + p.x + ' ' + p.y
        );
        var under = document.elementFromPoint(e.clientX, e.clientY);
        var nodeEl = under && under.closest ? under.closest('.tg-node') : null;
        var targetId = nodeEl ? nodeEl.getAttribute('data-id') : '';
        if (targetId === fromId) targetId = '';
        M.tgDrag.target = targetId;
        M.tgStage.querySelectorAll('.tg-node').forEach(function (n) {
          n.classList.toggle('is-drop-target', !!targetId && n.getAttribute('data-id') === targetId);
        });
      };
      var cleanup = function () {
        edge.removeEventListener('pointermove', move);
        edge.removeEventListener('pointerup', done);
        edge.removeEventListener('pointercancel', cancel);
        M.tgHost.classList.remove('is-dragging');
        temp.remove();
        M.tgStage.querySelectorAll('.tg-node.is-drop-target').forEach(function (n) {
          n.classList.remove('is-drop-target');
        });
      };
      var done = function () {
        var drag = M.tgDrag;
        M.tgDrag = null;
        cleanup();
        if (!drag) return;
        if (!drag.moved) {
          var same =
            M.tgPending &&
            M.tgPending.from === fromId &&
            M.tgPending.kind === kind &&
            !!M.tgPending.reverse === !!reverse;
          M.tgSetPending(same ? null : { from: fromId, kind: kind, reverse: !!reverse });
          return;
        }
        if (drag.target) {
          if (reverse) M.tgCommitLink(drag.target, fromId, kind);
          else M.tgCommitLink(fromId, drag.target, kind);
        } else {
          M.tgIgnoreClickUntil = Date.now() + 400;
          M.tgOpenPicker(drag.last, fromId, kind, !!reverse);
        }
      };
      var cancel = function () {
        M.tgDrag = null;
        cleanup();
      };
      edge.addEventListener('pointermove', move);
      edge.addEventListener('pointerup', done);
      edge.addEventListener('pointercancel', cancel);
    };
    M.renderTeamGraph = function renderTeamGraph() {
      if (M.tgDrag) return;
      var display = M.displayAssignees();
      var ids = display.map(function (m) {
        return String(m.id);
      });
      M.tgHost.hidden = !display.length || !M.tgExpanded;
      if (M.tgHost.hidden) {
        M.tgCloseEditor();
        M.tgCloseCreate();
        return;
      }
      M.tgNodes.replaceChildren();
      M.tgWires.replaceChildren();
      M.tgPills.replaceChildren();
      if (!display.length) {
        M.tgCloseEditor();
        return;
      }

      // Measure nodes at their natural height, then lay them out.
      display.forEach(function (member) {
        M.tgNodes.appendChild(M.tgBuildNode(member));
      });
      var heights = Object.create(null);
      M.tgNodes.querySelectorAll('.tg-node').forEach(function (n) {
        heights[n.getAttribute('data-id')] = n.offsetHeight;
      });
      var links = M.tgVisibleLinks(ids);
      var layout = S.layoutTeamGraph(ids, links, {
        nodeW: M.TG_NODE_W,
        hgap: 84,
        vgap: 60,
        heights: heights,
        defaultH: 72
      });
      var hasArc = links.some(function (l) {
        var a = layout.nodes[l.from];
        var b = layout.nodes[l.to];
        return a && b && a.row === b.row && Math.abs(a.col - b.col) > 1;
      });
      var padTop = hasArc ? 72 : M.TG_PAD;
      Object.keys(layout.nodes).forEach(function (id) {
        var p = M.tgPositions[id];
        if (p && isFinite(p.x) && isFinite(p.y)) {
          layout.nodes[id].x = p.x - M.TG_PAD;
          layout.nodes[id].y = p.y - padTop;
        }
      });
      var stageW = layout.width + M.TG_PAD * 2;
      var stageH = layout.height + padTop + M.TG_PAD;
      M.tgNodes.querySelectorAll('.tg-node').forEach(function (n) {
        var box = layout.nodes[n.getAttribute('data-id')];
        if (!box) return;
        n.style.left = box.x + M.TG_PAD + 'px';
        n.style.top = box.y + padTop + 'px';
      });
      // Shift boxes into stage space for wires / pins.
      var shifted = Object.create(null);
      Object.keys(layout.nodes).forEach(function (id) {
        var b = layout.nodes[id];
        shifted[id] = { x: b.x + M.TG_PAD, y: b.y + padTop, w: b.w, h: b.h, row: b.row, col: b.col, manual: !!M.tgPositions[id] };
      });
      M.tgLayout = { nodes: shifted, width: stageW, height: stageH };

      M.tgStage.style.width = stageW + 'px';
      M.tgStage.style.height = stageH + 'px';
      M.tgWires.setAttribute('width', String(stageW));
      M.tgWires.setAttribute('height', String(stageH));
      M.tgWires.setAttribute('viewBox', '0 0 ' + stageW + ' ' + stageH);

      var available = M.tgHost.clientWidth;
      M.tgFit = available > 0 && stageW > available ? Math.max(0.55, available / stageW) : 1;
      M.tgScale = Math.max(0.25, M.tgFit * M.tgZoomMul);
      M.tgApplyTransform();
      M.tgAutoH = Math.ceil(stageH * M.tgFit);
      M.tgApplyFrameHeight();

      var defs = M.tgSvg('defs');
      ['asks', 'flow', 'both'].forEach(function (kind) {
        var marker = M.tgSvg('marker', {
          id: 'tg-arrow-' + kind + '-' + M.tgUid,
          viewBox: '0 0 10 10',
          refX: '9',
          refY: '5',
          markerWidth: '9',
          markerHeight: '9',
          markerUnits: 'userSpaceOnUse',
          orient: 'auto-start-reverse'
        });
        marker.appendChild(
          M.tgSvg('path', { d: 'M0 1 L10 5 L0 9 z', class: 'tg-arrowhead tg-kind-' + kind })
        );
        defs.appendChild(marker);
      });
      M.tgWires.appendChild(defs);

      links.forEach(function (link) {
        var a = shifted[link.from];
        var b = shifted[link.to];
        if (!a || !b) return;
        var route = S.routeTeamLink(a, b);
        var key = S.teamLinkPairKey(link.from, link.to);
        var group = M.tgSvg('g', {
          class:
            'tg-wire-group tg-kind-' + link.kind + (key === M.tgSelectedKey ? ' is-selected' : ''),
          'data-key': key
        });
        var arrow = 'url(#tg-arrow-' + link.kind + '-' + M.tgUid + ')';
        var wire = M.tgSvg('path', { d: route.d, class: 'tg-wire', 'marker-end': arrow });
        if (link.kind === 'both') wire.setAttribute('marker-start', arrow);
        var glow = M.tgSvg('path', { d: route.d, class: 'tg-wire-glow' });
        var hit = M.tgSvg('path', { d: route.d, class: 'tg-wire-hit' });
        group.appendChild(glow);
        group.appendChild(wire);
        group.appendChild(hit);
        M.tgWires.appendChild(group);

        var pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'tg-pill tg-kind-' + link.kind + (link.label ? ' has-label' : '');
        pill.style.left = route.mx + 'px';
        pill.style.top = route.my + 'px';
        var meta = M.TG_KIND_META[link.kind];
        pill.innerHTML = '<i class="ti ' + meta.icon + '" aria-hidden="true"></i>';
        if (link.label) {
          var lab = document.createElement('span');
          lab.textContent = link.label;
          pill.appendChild(lab);
        }
        pill.setAttribute(
          'aria-label',
          M.tgPersonName(link.from) + ' ' + meta.verb + ' ' + M.tgPersonName(link.to)
        );
        pill.title = 'Modifier la relation';
        var open = function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (M.tgSelectedKey === key && !M.tgEditor.hidden) {
            M.tgCloseEditor();
            return;
          }
          M.tgOpenEditor(link, route.mx + 0, route.my);
        };
        pill.addEventListener('click', open);
        hit.addEventListener('click', open);
        M.tgPills.appendChild(pill);
      });

      if (M.tgSelectedKey) {
        var selected = links.filter(function (l) {
          return S.teamLinkPairKey(l.from, l.to) === M.tgSelectedKey;
        })[0];
        if (selected) {
          var r = S.routeTeamLink(shifted[selected.from], shifted[selected.to]);
          M.tgOpenEditor(selected, r.mx, r.my);
        } else {
          M.tgCloseEditor();
        }
      }
      M.tgHint.textContent = M.tgPending
        ? ''
        : M.tgDefaultHint();
      M.tgHint.hidden = !M.tgHint.textContent;
    };
    },
    run: function (M) {
    M.tgFrame.addEventListener('auxclick', function (event) {
      if (event.button === 1) event.preventDefault();
    });
    M.tgFrame.addEventListener('pointerdown', function (event) {
      var middle = event.button === 1;
      if (event.button != null && event.button !== 0 && !middle) return;
      if (middle) {
        if (event.target.closest('.tg-editor, .tg-create, .info-member-roles-picker-host')) return;
        event.preventDefault();
      } else if (event.target.closest('.tg-node, .tg-edge, .tg-pill, .tg-editor, .tg-collapse, .tg-zoom-btn, .tg-resize, .tg-wire-hit, .info-member-roles-picker-host')) {
        return;
      }
      var startX = event.clientX;
      var startY = event.clientY;
      var baseX = M.tgPan.x;
      var baseY = M.tgPan.y;
      var moved = false;
      try {
        M.tgFrame.setPointerCapture(event.pointerId);
      } catch (err) {
        /* optional */
      }
      var move = function (e) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        M.tgHost.classList.add('is-panning');
        var hostW = M.tgHost.clientWidth || 320;
        var frameH = M.tgFrame.clientHeight || 200;
        var sw = (M.tgLayout ? M.tgLayout.width : 0) * M.tgScale;
        var sh = (M.tgLayout ? M.tgLayout.height : 0) * M.tgScale;
        var margin = 48;
        var minX = margin - sw;
        var maxX = hostW - margin;
        M.tgPan.x = Math.round(Math.max(minX, Math.min(maxX, baseX + dx)));
        M.tgPan.y = Math.round(Math.max(margin - sh, Math.min(frameH - margin, baseY + dy)));
        M.tgApplyTransform();
      };
      var end = function () {
        M.tgFrame.removeEventListener('pointermove', move);
        M.tgFrame.removeEventListener('pointerup', end);
        M.tgFrame.removeEventListener('pointercancel', end);
        M.tgHost.classList.remove('is-panning');
      };
      M.tgFrame.addEventListener('pointermove', move);
      M.tgFrame.addEventListener('pointerup', end);
      M.tgFrame.addEventListener('pointercancel', end);
    });
    M.tgFrame.addEventListener('dblclick', function (event) {
      if (event.target.closest('.tg-node, .tg-edge, .tg-pill, .tg-editor, .tg-create, .tg-collapse, .tg-zoom-btn, .tg-resize, .info-member-roles-picker-host, button, input')) return;
      M.tgOpenCreatePerson(M.tgStagePoint(event));
    });
    if (global.ContextMenu && typeof global.ContextMenu.bind === 'function') {
      global.ContextMenu.bind(M.tgFrame, M.tgMenuItems);
    }
    M.tgCollapseBtn.addEventListener('click', function (event) {
      event.preventDefault();
      M.setTgExpanded(false);
    });
    M.TG_SIDE_DIR = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
    M.tgHost.addEventListener('click', function (event) {
      // The click that follows releasing a handle must not dismiss the picker it just opened.
      if (Date.now() < M.tgIgnoreClickUntil || event.target.closest('.tg-edge')) return;
      if (
        !event.target.closest('.tg-editor') &&
        !event.target.closest('.tg-pill') &&
        !event.target.closest('.tg-wire-hit')
      ) {
        M.tgCloseEditor();
        M.tgCloseCreate();
      }
    });
    M.tgHost.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (M.tgPending) M.tgSetPending(null);
        M.tgCloseEditor();
        M.tgCloseCreate();
      }
    });
    if (typeof global.ResizeObserver === 'function') {
      M.tgLastWidth = 0;
      new global.ResizeObserver(function () {
        var w = M.tgHost.clientWidth;
        if (Math.abs(w - M.tgLastWidth) < 2) return;
        M.tgLastWidth = w;
        M.renderTeamGraph();
        M.onLayoutChange();
      }).observe(M.tgHost);
    }
    }
  });
})(typeof window !== 'undefined' ? window : this);
