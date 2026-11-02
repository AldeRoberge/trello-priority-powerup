/**
 * priority-ui-info-field: createInfoField() part 6 of 8.
 * The body of createInfoField runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see priority-ui-info-field.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var P = (global.PriorityUIPartsMountCreateInfoField = global.PriorityUIPartsMountCreateInfoField || { list: [] });

  P.list.push({
    define: function (M) {
    M.renderMembers = function renderMembers() {
      M.membersEl.replaceChildren();
      var display = M.displayAssignees();

      if (display.length) {
        display.forEach(function (member) {
          var name = M.memberDisplayName(member) || 'Membre';
          var mid = member && member.id != null ? String(member.id) : '';
          var isCustom = !!(member && member.custom) || S.isCustomAssigneeId(mid);
          var chip = document.createElement('div');
          chip.className =
            'info-member' +
            (isCustom ? ' is-custom' : '') +
            (M.memberRolesPickerMemberId === mid ? ' is-roles-open' : '');
          chip.title = name + ' \u2014 voir les relations';
          chip.setAttribute('aria-label', name + ', voir les relations');

          var main = document.createElement('div');
          main.className = 'info-member-main';
          if (mid) {
            main.classList.add('is-clickable');
            main.setAttribute('role', 'button');
            main.tabIndex = 0;
            main.setAttribute('aria-expanded', 'false');
            main.addEventListener('click', function (event) {
              if (event.target.closest('.info-member-clear')) return;
              event.preventDefault();
              event.stopPropagation();
              M.setTgExpanded(true);
            });
            main.addEventListener('keydown', function (event) {
              if (event.key === 'Enter' || event.key === ' ') {
                if (event.target.closest('.info-member-clear')) return;
                event.preventDefault();
                event.stopPropagation();
                M.setTgExpanded(true);
              }
            });
          }

          M.appendMemberAvatar(main, member);

          var nameEl = document.createElement('span');
          nameEl.className = 'info-member-name';
          nameEl.textContent = name;
          main.appendChild(nameEl);

          if (isCustom) {
            var badge = document.createElement('span');
            badge.className = 'info-member-custom-badge';
            badge.textContent = 'hors Trello';
            badge.title = member.trelloMemberId
              ? 'Personne hors Trello (li\u00e9e \u00e0 un membre)'
              : 'Personne hors Trello';
            main.appendChild(badge);
          }

          var canRemove =
            (isCustom && !!M.onCustomAssigneesChange) ||
            (!isCustom && !!M.onMemberRemove);
          if (canRemove) {
            var clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'info-member-clear';
            clearBtn.setAttribute(
              'aria-label',
              'Retirer\u00a0: ' + name
            );
            clearBtn.textContent = '\u00d7';
            clearBtn.disabled = M.membersBusy || M.memberRolesBusy;
            clearBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              M.removeMemberFromCard(member);
            });
            main.appendChild(clearBtn);
          }

          chip.appendChild(main);

          var rolesRow = document.createElement('div');
          rolesRow.className = 'info-member-roles';
          rolesRow.setAttribute('aria-label', 'R\u00f4les de ' + name);

          var roleIds = M.rolesForMember(mid);
          roleIds.forEach(function (roleId) {
            var entry = S.getMemberRoleEntry(roleId);
            var label = (entry && entry.label) || roleId;
            var roleChip = document.createElement('span');
            roleChip.className = 'info-member-role';
            roleChip.title = label;
            var roleIcon = document.createElement('i');
            roleIcon.className =
              'ti ti-' + ((entry && entry.icon) || 'tag');
            roleIcon.setAttribute('aria-hidden', 'true');
            var roleLabel = document.createElement('span');
            roleLabel.className = 'info-member-role-label';
            roleLabel.textContent = label;
            roleChip.appendChild(roleIcon);
            roleChip.appendChild(roleLabel);
            if (M.onMemberRolesChange) {
              var roleClear = document.createElement('button');
              roleClear.type = 'button';
              roleClear.className = 'info-member-role-clear';
              roleClear.setAttribute('aria-label', 'Retirer le r\u00f4le ' + label);
              roleClear.textContent = '\u00d7';
              roleClear.disabled = M.memberRolesBusy;
              roleClear.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                M.removeRoleFromMember(mid, roleId);
              });
              roleChip.appendChild(roleClear);
            }
            rolesRow.appendChild(roleChip);
          });

          if (M.onMemberRolesChange && mid) {
            var addRoleBtn = document.createElement('button');
            addRoleBtn.type = 'button';
            addRoleBtn.className = 'info-member-role-add';
            addRoleBtn.setAttribute('aria-label', 'D\u00e9finir les r\u00f4les de ' + name);
            addRoleBtn.title = 'D\u00e9finir les r\u00f4les';
            addRoleBtn.setAttribute(
              'aria-expanded',
              M.memberRolesPickerMemberId === mid ? 'true' : 'false'
            );
            addRoleBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
            addRoleBtn.disabled = M.memberRolesBusy;
            addRoleBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              M.toggleMemberRolesPicker(mid);
            });
            rolesRow.appendChild(addRoleBtn);
          }

          if (rolesRow.childNodes.length) {
            chip.appendChild(rolesRow);
          }

          if (
            global.ContextMenu &&
            typeof global.ContextMenu.bind === 'function' &&
            typeof global.ContextMenu.buildInfoChipItems === 'function'
          ) {
            ContextMenu.bind(chip, function () {
              return ContextMenu.buildInfoChipItems({
                kind: 'member',
                onEditRoles:
                  M.onMemberRolesChange && mid
                    ? function () {
                        M.toggleMemberRolesPicker(mid);
                      }
                    : null,
                onRemove: canRemove
                  ? function () {
                      M.removeMemberFromCard(member);
                    }
                  : null,
              });
            });
          }

          M.membersEl.appendChild(chip);
        });
      }

      M.renderTeamGraph();
      var canAdd = !!M.onMemberAdd || !!M.onCustomAssigneesChange;
      M.membersAddBtn.hidden = !canAdd;
      M.membersAddBtn.disabled = M.membersBusy || !canAdd || M.memberRolesBusy;
      if (M.membersPickerOpen) M.renderMembersPicker();
      if (M.memberRolesPickerMemberId) {
        if (!M.selectedMemberIds()[M.memberRolesPickerMemberId]) {
          M.setMemberRolesPickerOpen('');
        } else {
          M.renderMemberRolesPicker(M.memberRolesPickerMemberId);
        }
      }
      M.renderCreator();
    };
    M.addMemberFromPicker = function addMemberFromPicker(member) {
      if (!M.onMemberAdd || M.membersBusy || !member || !member.id) return;
      var id = String(member.id);
      if (M.selectedMemberIds()[id]) return;
      M.membersBusy = true;
      M.setMembersStatus('', 'saving');
      M.renderMembers();
      return Promise.resolve(M.onMemberAdd(member))
        .then(function (result) {
          M.membersBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              M.setAuthHint(result.reason);
              M.setMembersStatus('', 'error');
            } else {
              M.setMembersStatus('\u00c9chec de l\u2019ajout', 'error');
            }
            M.renderMembers();
            M.onLayoutChange();
            return result;
          }
          if (!M.selectedMemberIds()[id]) {
            M.members = M.members.concat([
              {
                id: member.id,
                fullName:
                  typeof member.fullName === 'string' ? member.fullName : '',
                username:
                  typeof member.username === 'string' ? member.username : '',
                initials:
                  typeof member.initials === 'string' ? member.initials : '',
                avatar:
                  typeof member.avatar === 'string' ? member.avatar : '',
                avatarUrl:
                  typeof member.avatarUrl === 'string' ? member.avatarUrl : '',
                avatarHash:
                  typeof member.avatarHash === 'string' ? member.avatarHash : ''
              }
            ]);
          }
          M.setAuthHint('');
          M.setMembersStatus('', 'ok');
          M.setMembersPickerOpen(false);
          M.renderMembers();
          setTimeout(function () {
            if (M.membersStatus.classList.contains('is-ok')) {
              M.setMembersStatus('');
            }
          }, 1400);
          M.onLayoutChange();
          return result;
        })
        .catch(function (err) {
          M.membersBusy = false;
          console.error('Info member add failed', err);
          M.setMembersStatus('\u00c9chec de l\u2019ajout', 'error');
          M.renderMembers();
          M.onLayoutChange();
        });
    };
    M.clearRolesForMemberId = function clearRolesForMemberId(id) {
      if (!M.memberRoles[id]) return;
      var nextMap = S.removeMemberFromRoles(M.memberRoles, id);
      M.memberRoles = nextMap;
      if (M.onMemberRolesChange) {
        var customs = S.pruneMemberRoleCustoms(S.getMemberRoleCustoms(), nextMap);
        S.setMemberRoleCustoms(customs);
        Promise.resolve(M.onMemberRolesChange(nextMap, customs)).catch(
          function (err) {
            console.error('Info member roles cleanup failed', err);
          }
        );
      }
    };
    M.removeMemberFromCard = function removeMemberFromCard(member) {
      if (M.membersBusy || !member || !member.id) return;
      var id = String(member.id);
      var isCustom = !!(member.custom) || S.isCustomAssigneeId(id);

      if (isCustom) {
        if (!M.onCustomAssigneesChange) return;
        var nextCustoms = M.customAssignees.filter(function (item) {
          return !(item && String(item.id) === id);
        });
        M.clearRolesForMemberId(id);
        if (M.memberRolesPickerMemberId === id) {
          M.setMemberRolesPickerOpen('');
        }
        M.persistCustomAssignees(nextCustoms);
        return;
      }

      if (!M.onMemberRemove) return;
      M.membersBusy = true;
      M.setMembersStatus('', 'saving');
      M.renderMembers();
      Promise.resolve(M.onMemberRemove(member))
        .then(function (result) {
          M.membersBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              M.setAuthHint(result.reason);
              M.setMembersStatus('', 'error');
            } else {
              M.setMembersStatus('\u00c9chec du retrait', 'error');
            }
            M.renderMembers();
            M.onLayoutChange();
            return result;
          }
          M.members = M.members.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          M.clearRolesForMemberId(id);
          if (M.memberRolesPickerMemberId === id) {
            M.setMemberRolesPickerOpen('');
          }
          M.setAuthHint('');
          M.setMembersStatus('', 'ok');
          M.renderMembers();
          setTimeout(function () {
            if (M.membersStatus.classList.contains('is-ok')) {
              M.setMembersStatus('');
            }
          }, 1400);
          M.onLayoutChange();
          return result;
        })
        .catch(function (err) {
          M.membersBusy = false;
          console.error('Info member remove failed', err);
          M.setMembersStatus('\u00c9chec du retrait', 'error');
          M.renderMembers();
          M.onLayoutChange();
        });
    };
    M.labelBaseColor = function labelBaseColor(color) {
      if (!color || typeof color !== 'string') return '';
      return color.replace(/_(light|dark)$/i, '').toLowerCase();
    };
    M.labelColorHex = function labelColorHex(color) {
      var base = M.labelBaseColor(color);
      if (base && Object.prototype.hasOwnProperty.call(M.LABEL_COLOR_HEX, base)) {
        return M.LABEL_COLOR_HEX[base];
      }
      return M.LABEL_COLOR_FALLBACK;
    };
    M.labelDisplayName = function labelDisplayName(label) {
      if (!label || typeof label !== 'object') return '\u00c9tiquette';
      if (typeof label.name === 'string' && label.name.trim()) {
        return label.name.trim();
      }
      var base = M.labelBaseColor(label.color);
      if (base && Object.prototype.hasOwnProperty.call(M.LABEL_COLOR_NAMES_FR, base)) {
        return M.LABEL_COLOR_NAMES_FR[base];
      }
      return 'Sans nom';
    };
    M.findLabelById = function findLabelById(list, id) {
      var needle = id != null ? String(id) : '';
      if (!needle) return null;
      var arr = Array.isArray(list) ? list : [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && String(arr[i].id) === needle) return arr[i];
      }
      return null;
    };
    M.applyLabelColorLocally = function applyLabelColorLocally(labelId, color) {
      var id = labelId != null ? String(labelId) : '';
      if (!id) return;
      M.labels = M.labels.map(function (item) {
        if (!item || String(item.id) !== id) return item;
        return Object.assign({}, item, { color: color });
      });
      M.boardLabels = M.boardLabels.map(function (item) {
        if (!item || String(item.id) !== id) return item;
        return Object.assign({}, item, { color: color });
      });
    };
    M.applyLabelNameLocally = function applyLabelNameLocally(labelId, name) {
      var id = labelId != null ? String(labelId) : '';
      if (!id) return;
      var nextName = typeof name === 'string' ? name : '';
      M.labels = M.labels.map(function (item) {
        if (!item || String(item.id) !== id) return item;
        return Object.assign({}, item, { name: nextName });
      });
      M.boardLabels = M.boardLabels.map(function (item) {
        if (!item || String(item.id) !== id) return item;
        return Object.assign({}, item, { name: nextName });
      });
    };
    M.cancelLabelRename = function cancelLabelRename(options) {
      options = options || {};
      if (!M.labelsRenameId) return;
      M.labelsRenameId = '';
      M.labelsRenameDraft = '';
      if (options.render !== false) {
        M.renderLabels();
        M.onLayoutChange();
      }
    };
    M.beginLabelRenameDraft = function beginLabelRenameDraft(label) {
      if (!M.onLabelRename || !label || !label.id) return;
      var id = String(label.id);
      M.labelsRenameId = id;
      M.labelsRenameDraft =
        typeof label.name === 'string' ? label.name : '';
    };
    M.flushLabelRenameIfNeeded = function flushLabelRenameIfNeeded(labelId) {
      var id = labelId != null ? String(labelId) : '';
      if (!id || !M.labelsRenameId || M.labelsRenameId !== id) return;
      var renamingLabel =
        M.findLabelById(M.labels, id) || M.findLabelById(M.boardLabels, id);
      if (!renamingLabel) {
        M.cancelLabelRename({ render: false });
        return;
      }
      var previousName =
        typeof renamingLabel.name === 'string' ? renamingLabel.name : '';
      var draft =
        typeof M.labelsRenameDraft === 'string' ? M.labelsRenameDraft.trim() : '';
      if (draft === previousName) {
        M.cancelLabelRename({ render: false });
        return;
      }
      M.commitLabelRename(renamingLabel, M.labelsRenameDraft);
    };
    M.spellcheckLabelName = function spellcheckLabelName(text) {
      var trimmed = typeof text === 'string' ? text.trim() : '';
      if (
        !trimmed ||
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        return Promise.resolve(trimmed);
      }
      return global.Spellcheck.correct(trimmed).then(
        function (corrected) {
          return typeof corrected === 'string' ? corrected.trim() : trimmed;
        },
        function () {
          return trimmed;
        }
      );
    };
    M.commitLabelRename = function commitLabelRename(label, rawName) {
      if (!M.onLabelRename || M.labelsBusy || !label || !label.id) return;
      var id = String(label.id);
      var previousName = typeof label.name === 'string' ? label.name : '';
      var typed =
        typeof rawName === 'string' ? rawName : M.labelsRenameDraft || '';
      M.labelsBusy = true;
      M.setLabelsStatus('', 'saving');
      M.renderLabels();
      M.spellcheckLabelName(typed)
        .then(function (nextName) {
          if (nextName === previousName) {
            M.labelsBusy = false;
            M.cancelLabelRename();
            M.setLabelsStatus('');
            return { ok: true, changed: false, name: nextName };
          }
          M.applyLabelNameLocally(id, nextName);
          M.labelsRenameDraft = nextName;
          M.renderLabels();
          return Promise.resolve(
            M.onLabelRename({
              id: id,
              name: nextName,
              label: label
            })
          ).then(function (result) {
            return { result: result, nextName: nextName };
          });
        })
        .then(function (payload) {
          if (!payload || payload.ok === true) {
            // Unchanged early exit.
            return payload;
          }
          var result = payload.result;
          var nextName = payload.nextName;
          M.labelsBusy = false;
          if (result && result.ok === false) {
            M.applyLabelNameLocally(id, previousName);
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              M.setAuthHint(result.reason);
              M.setLabelsStatus('', 'error');
            } else if (result.reason === 'name-too-long') {
              M.setLabelsStatus('Nom trop long', 'error');
            } else {
              M.setLabelsStatus('\u00c9chec du renommage', 'error');
            }
            M.labelsRenameId = id;
            M.labelsRenameDraft = previousName;
            M.renderLabels();
            M.onLayoutChange();
            return result;
          }
          var savedName =
            result && result.label && typeof result.label.name === 'string'
              ? result.label.name
              : result && typeof result.name === 'string'
                ? result.name
                : nextName;
          M.applyLabelNameLocally(id, savedName);
          M.setAuthHint('');
          M.setLabelsStatus('', 'ok');
          M.cancelLabelRename({ render: false });
          M.renderLabels();
          setTimeout(function () {
            if (M.labelsStatus.classList.contains('is-ok')) M.setLabelsStatus('');
          }, 1400);
          M.onLayoutChange();
          return result;
        })
        .catch(function (err) {
          M.labelsBusy = false;
          M.applyLabelNameLocally(id, previousName);
          console.error('Info label rename failed', err);
          M.setLabelsStatus('\u00c9chec du renommage', 'error');
          M.labelsRenameId = id;
          M.labelsRenameDraft = previousName;
          M.renderLabels();
          M.onLayoutChange();
        });
    };
    M.setLabelsColorPickerOpen = function setLabelsColorPickerOpen(labelId, options) {
      options = options || {};
      var nextId = labelId != null ? String(labelId) : '';
      if (!nextId || nextId === M.labelsColorEditId) {
        var closingId = M.labelsColorEditId;
        M.labelsColorEditId = '';
        M.labelsColorPicker.hidden = true;
        M.labelsColorPicker.replaceChildren();
        if (closingId) {
          if (options.discardRename) {
            M.cancelLabelRename({ render: false });
          } else {
            M.flushLabelRenameIfNeeded(closingId);
          }
        }
        M.renderLabels();
        M.onLayoutChange();
        return;
      }
      if (M.labelsRenameId && M.labelsRenameId !== nextId) {
        M.flushLabelRenameIfNeeded(M.labelsRenameId);
      }
      if (M.labelsPickerOpen) M.setLabelsPickerOpen(false);
      M.labelsColorEditId = nextId;
      var label =
        M.findLabelById(M.labels, nextId) || M.findLabelById(M.boardLabels, nextId);
      if (label) M.beginLabelRenameDraft(label);
      M.renderLabelsColorPicker();
      M.renderLabels();
      M.onLayoutChange();
    };
    M.renderLabelsColorPicker = function renderLabelsColorPicker() {
      M.labelsColorPicker.replaceChildren();
      var canEditLabel =
        !!M.labelsColorEditId &&
        !!(M.onLabelColorChange || M.onLabelRename || M.onLabelDelete);
      if (!canEditLabel) {
        M.labelsColorPicker.hidden = true;
        return;
      }
      var label =
        M.findLabelById(M.labels, M.labelsColorEditId) ||
        M.findLabelById(M.boardLabels, M.labelsColorEditId);
      if (!label) {
        M.labelsColorEditId = '';
        M.labelsColorPicker.hidden = true;
        return;
      }
      var current = M.labelBaseColor(label.color);
      var head = document.createElement('div');
      head.className = 'info-labels-color-picker-head';

      var title = document.createElement('div');
      title.className = 'info-labels-color-picker-title';
      title.textContent = 'Modifier l\u2019\u00e9tiquette';

      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'info-labels-color-picker-close';
      closeBtn.setAttribute('aria-label', 'Fermer');
      closeBtn.title = 'Fermer';
      closeBtn.textContent = '\u00d7';
      closeBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        M.setLabelsColorPickerOpen('');
      });

      head.appendChild(title);
      head.appendChild(closeBtn);
      M.labelsColorPicker.appendChild(head);

      if (M.onLabelRename) {
        var renameField = document.createElement('div');
        renameField.className = 'info-labels-color-picker-rename';

        var renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.className = 'info-labels-color-picker-name-input';
        renameInput.dataset.labelId = String(label.id);
        renameInput.value =
          M.labelsRenameId === String(label.id)
            ? M.labelsRenameDraft
            : typeof label.name === 'string'
              ? label.name
              : '';
        renameInput.maxLength = 16384;
        renameInput.setAttribute('aria-label', 'Nom de l\u2019\u00e9tiquette');
        renameInput.placeholder = 'Nom de l\u2019\u00e9tiquette';
        renameInput.disabled = M.labelsBusy;
        renameInput.addEventListener('click', function (event) {
          event.stopPropagation();
        });
        renameInput.addEventListener('input', function () {
          M.labelsRenameId = String(label.id);
          M.labelsRenameDraft = renameInput.value;
        });
        renameInput.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            M.commitLabelRename(label, renameInput.value);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            M.setLabelsColorPickerOpen('', { discardRename: true });
          }
        });
        renameField.appendChild(renameInput);
        M.labelsColorPicker.appendChild(renameField);
      }

      if (M.onLabelColorChange) {
        var grid = document.createElement('div');
        grid.className = 'info-labels-color-picker-grid';
        grid.setAttribute('role', 'listbox');
        grid.setAttribute('aria-label', 'Couleur de l\u2019\u00e9tiquette');
        M.LABEL_COLOR_KEYS.forEach(function (key) {
          var hex = M.LABEL_COLOR_HEX[key];
          var fr = M.LABEL_COLOR_NAMES_FR[key] || key;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-labels-color-swatch';
          if (current === key) btn.classList.add('is-selected');
          btn.style.setProperty('--label-color', hex);
          btn.setAttribute('role', 'option');
          btn.setAttribute('aria-label', fr);
          btn.title = fr;
          btn.disabled = M.labelsBusy;
          btn.dataset.color = key;
          if (current === key) {
            btn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>';
          }
          btn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            M.changeLabelColor(label, key);
          });
          grid.appendChild(btn);
        });
        M.labelsColorPicker.appendChild(grid);
      }

      if (M.onLabelDelete) {
        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'info-labels-color-picker-delete';
        deleteBtn.setAttribute(
          'aria-label',
          'Supprimer l\u2019\u00e9tiquette du tableau\u00a0: ' +
            M.labelDisplayName(label)
        );
        deleteBtn.title = 'Supprimer du tableau';
        deleteBtn.disabled = M.labelsBusy;
        deleteBtn.innerHTML =
          '<i class="ti ti-trash" aria-hidden="true"></i>' +
          '<span>Supprimer du tableau</span>';
        deleteBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          M.deleteLabelFromBoard(label);
        });
        M.labelsColorPicker.appendChild(deleteBtn);
      }

      M.labelsColorPicker.hidden = false;
    };
    M.labelNeedsDarkText = function labelNeedsDarkText(hex) {
      var raw = (hex || '').replace(/^#/, '');
      if (raw.length !== 6) return false;
      var r = parseInt(raw.slice(0, 2), 16);
      var g = parseInt(raw.slice(2, 4), 16);
      var b = parseInt(raw.slice(4, 6), 16);
      if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
      // Relative luminance (sRGB approx).
      var luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return luma > 0.62;
    };
    M.setLabelsStatus = function setLabelsStatus(text, kind) {
      M.applyInfoSaveStatus(M.labelsStatus, text, kind);
    };
    M.pruneLabelSuggestions = function pruneLabelSuggestions() {
      var selected = M.selectedLabelIds();
      var selectedNames = Object.create(null);
      M.labels.forEach(function (label) {
        var n =
          label && typeof label.name === 'string'
            ? label.name.trim().toLocaleLowerCase('fr-FR')
            : '';
        if (n) selectedNames[n] = true;
      });
      M.labelSuggestions = M.labelSuggestions.filter(function (label) {
        if (!label) return false;
        if (label.isNew) {
          var name =
            typeof label.name === 'string'
              ? label.name.trim().toLocaleLowerCase('fr-FR')
              : '';
          return !!name && !selectedNames[name] && !M.boardHasLabelName(label.name);
        }
        return label.id && !selected[String(label.id)];
      });
    };
    M.renderLabelSuggestions = function renderLabelSuggestions() {
      if (!M.labelsSuggestListEl || !M.labelsSuggestSection) return;
      M.labelsSuggestListEl.replaceChildren();
      M.pruneLabelSuggestions();
      if (!M.suggestLabelsFn || !M.labelSuggestions.length) {
        M.labelsSuggestSection.hidden = true;
        M.onLayoutChange();
        return;
      }
      M.labelsSuggestSection.hidden = false;
      M.labelSuggestions.forEach(function (label) {
        var name = M.labelDisplayName(label) || label.name || 'Suggestion';
        var hex = M.labelColorHex(label.color);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'info-labels-suggestion' + (label.isNew ? ' is-new' : '');
        btn.setAttribute('role', 'listitem');
        btn.style.setProperty('--label-color', hex);
        btn.style.setProperty(
          '--label-fg',
          M.labelNeedsDarkText(hex) ? '#172b4d' : '#ffffff'
        );
        btn.title = label.isNew
          ? 'Cr\u00e9er et ajouter\u00a0: ' + name
          : 'Ajouter\u00a0: ' + name;
        btn.disabled = M.labelsBusy;
        if (label.id) btn.dataset.labelId = String(label.id);

        var swatch = document.createElement('span');
        swatch.className = 'info-label-swatch';
        swatch.setAttribute('aria-hidden', 'true');

        var text = document.createElement('span');
        text.className = 'info-labels-suggestion-text';
        text.textContent = label.isNew ? '+ ' + name : name;

        btn.appendChild(swatch);
        btn.appendChild(text);
        btn.addEventListener('click', function () {
          if (label.isNew) M.createLabelSuggestion(label);
          else M.addLabelFromPicker(label);
        });
        M.labelsSuggestListEl.appendChild(btn);
      });
      M.onLayoutChange();
    };
    M.labelSuggestionsContextKey = function labelSuggestionsContextKey() {
      var title = (M.titleInput.value || '').trim() || M.titleText || '';
      var desc = (M.descInput.value || '').trim() || M.descText || '';
      var existing = M.labels
        .map(function (label) {
          return label && label.id ? String(label.id) : '';
        })
        .filter(Boolean)
        .sort()
        .join(',');
      var available = M.boardLabels
        .map(function (label) {
          return label && label.id ? String(label.id) : '';
        })
        .filter(Boolean)
        .sort()
        .join(',');
      return title + '\u0001' + desc + '\u0001' + existing + '\u0001' + available;
    };
    M.refreshLabelSuggestions = function refreshLabelSuggestions(force) {
      if (!M.suggestLabelsFn) {
        M.labelSuggestions = [];
        M.labelSuggestionsLoading = false;
        M.labelSuggestionsKey = '';
        M.renderLabelSuggestions();
        return Promise.resolve();
      }
      var title = (M.titleInput.value || '').trim() || M.titleText || '';
      var desc = (M.descInput.value || '').trim() || M.descText || '';
      if (!title && !desc && !M.boardLabels.length) {
        M.labelSuggestions = [];
        M.labelSuggestionsLoading = false;
        M.renderLabelSuggestions();
        return Promise.resolve();
      }
      var key = M.labelSuggestionsContextKey();
      if (!force && key === M.labelSuggestionsKey) {
        M.renderLabelSuggestions();
        return Promise.resolve();
      }

      var seq = ++M.labelSuggestionsSeq;
      M.labelSuggestionsLoading = true;
      M.labelSuggestionsKey = key;
      return Promise.resolve()
        .then(function () {
          return M.suggestLabelsFn({
            force: !!force,
            cardName: title,
            cardDesc: desc,
            priorityLabel: M.priorityLabel || '',
            existingLabels: M.labels.slice(),
            boardLabels: M.boardLabels.slice()
          });
        })
        .then(function (list) {
          if (seq !== M.labelSuggestionsSeq) return;
          var selected = M.selectedLabelIds();
          var seen = Object.create(null);
          var seenNames = Object.create(null);
          M.labelSuggestions = Array.isArray(list)
            ? list
                .filter(function (label) {
                  if (!label) return false;
                  if (label.isNew) {
                    var nm =
                      typeof label.name === 'string' ? label.name.trim() : '';
                    if (!nm) return false;
                    var nk = nm.toLocaleLowerCase('fr-FR');
                    if (seenNames[nk] || M.boardHasLabelName(nm)) return false;
                    seenNames[nk] = true;
                    return true;
                  }
                  if (!label.id) return false;
                  var id = String(label.id);
                  if (selected[id] || seen[id]) return false;
                  seen[id] = true;
                  return true;
                })
                .slice(0, 3)
            : [];
          M.labelSuggestionsLoading = false;
          M.renderLabelSuggestions();
        })
        .catch(function (err) {
          console.error('Info label suggestions failed', err);
          if (seq !== M.labelSuggestionsSeq) return;
          M.labelSuggestionsLoading = false;
          M.labelSuggestions = [];
          M.renderLabelSuggestions();
        });
    };
    M.scheduleLabelSuggestions = function scheduleLabelSuggestions(force) {
      if (!M.suggestLabelsFn) return;
      if (M.labelSuggestionsTimer) {
        clearTimeout(M.labelSuggestionsTimer);
        M.labelSuggestionsTimer = null;
      }
      M.labelSuggestionsTimer = setTimeout(function () {
        M.labelSuggestionsTimer = null;
        M.refreshLabelSuggestions(!!force);
      }, force ? 0 : 280);
    };
    M.createLabelSuggestion = function createLabelSuggestion(suggestion) {
      if (!M.onLabelCreate || M.labelsBusy || !suggestion || !suggestion.name) return;
      var name = String(suggestion.name || '').trim();
      if (!name || M.boardHasLabelName(name)) return;
      M.labelsBusy = true;
      M.setLabelsStatus('', 'saving');
      M.renderLabels();
      Promise.resolve(
        M.onLabelCreate({
          name: name,
          color: suggestion.color || undefined,
          existingLabels: M.boardLabels.slice()
        })
      )
        .then(function (result) {
          M.labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              M.setAuthHint(result.reason);
              M.setLabelsStatus('', 'error');
            } else {
              M.setLabelsStatus('\u00c9chec de la cr\u00e9ation', 'error');
            }
            M.renderLabels();
            M.onLayoutChange();
            return result;
          }
          var created =
            result && result.label && typeof result.label === 'object'
              ? result.label
              : null;
          if (created && created.id) {
            var createdId = String(created.id);
            var onBoard = false;
            for (var i = 0; i < M.boardLabels.length; i++) {
              if (M.boardLabels[i] && String(M.boardLabels[i].id) === createdId) {
                onBoard = true;
                break;
              }
            }
            if (!onBoard) {
              M.boardLabels = M.boardLabels.concat([
                {
                  id: created.id,
                  name: typeof created.name === 'string' ? created.name : name,
                  color: created.color != null ? created.color : suggestion.color,
                  idBoard: created.idBoard
                }
              ]);
            }
            if (!M.selectedLabelIds()[createdId]) {
              M.labels = M.labels.concat([
                {
                  id: created.id,
                  name: typeof created.name === 'string' ? created.name : name,
                  color: created.color != null ? created.color : suggestion.color,
                  idBoard: created.idBoard
                }
              ]);
            }
          }
          M.setAuthHint('');
          M.setLabelsStatus('', 'ok');
          M.renderLabels();
          M.scheduleLabelSuggestions(false);
          setTimeout(function () {
            if (M.labelsStatus.classList.contains('is-ok')) M.setLabelsStatus('');
          }, 1400);
          M.onLayoutChange();
          return result;
        })
        .catch(function (err) {
          M.labelsBusy = false;
          console.error('Info label suggestion create failed', err);
          M.setLabelsStatus('\u00c9chec de la cr\u00e9ation', 'error');
          M.renderLabels();
          M.onLayoutChange();
        });
    };
    M.selectedLabelIds = function selectedLabelIds() {
      var ids = Object.create(null);
      for (var i = 0; i < M.labels.length; i++) {
        if (M.labels[i] && M.labels[i].id) ids[String(M.labels[i].id)] = true;
      }
      return ids;
    };
    M.availableBoardLabels = function availableBoardLabels() {
      var selected = M.selectedLabelIds();
      var out = [];
      for (var i = 0; i < M.boardLabels.length; i++) {
        var label = M.boardLabels[i];
        if (!label || !label.id) continue;
        if (selected[String(label.id)]) continue;
        out.push(label);
      }
      return out;
    };
    M.setLabelsPickerOpen = function setLabelsPickerOpen(open) {
      M.labelsPickerOpen = !!open;
      M.labelsPicker.hidden = !M.labelsPickerOpen;
      M.labelsAddBtn.setAttribute('aria-expanded', M.labelsPickerOpen ? 'true' : 'false');
      M.labelsAddWrap.classList.toggle('is-open', M.labelsPickerOpen);
      if (M.labelsPickerOpen) {
        M.renderLabelsPicker();
        try {
          M.labelsSearchInput.focus();
          M.labelsSearchInput.select();
        } catch (e) {
          /* ignore */
        }
      } else {
        M.labelsSearchInput.value = '';
      }
      M.onLayoutChange();
    };
    M.filteredAvailableBoardLabels = function filteredAvailableBoardLabels(query) {
      var available = M.availableBoardLabels();
      var q = String(query || '')
        .trim()
        .toLowerCase();
      if (!q) return available;
      return available.filter(function (label) {
        return M.labelDisplayName(label).toLowerCase().indexOf(q) !== -1;
      });
    };
    M.boardHasLabelName = function boardHasLabelName(name) {
      var needle = String(name || '')
        .trim()
        .toLowerCase();
      if (!needle) return false;
      for (var i = 0; i < M.boardLabels.length; i++) {
        if (M.labelDisplayName(M.boardLabels[i]).toLowerCase() === needle) return true;
      }
      return false;
    };
    M.updateLabelsCreateButton = function updateLabelsCreateButton(query) {
      if (!M.onLabelCreate) {
        M.labelsCreateBtn.hidden = true;
        M.labelsCreateBtn.textContent = '';
        M.labelsCreateBtn.disabled = true;
        return;
      }
      var q = String(query || '').trim();
      M.labelsCreateBtn.hidden = false;
      if (!q) {
        M.labelsCreateBtn.hidden = true;
        M.labelsCreateBtn.disabled = true;
        M.labelsCreateBtn.textContent = '';
        return;
      }
      if (M.boardHasLabelName(q) || M.labelsBusy) {
        M.labelsCreateBtn.disabled = true;
        M.labelsCreateBtn.innerHTML =
          '<i class="ti ti-plus" aria-hidden="true"></i>' +
          '<span>Cr\u00e9er une nouvelle \u00e9tiquette</span>';
        M.labelsCreateBtn.title = M.boardHasLabelName(q)
          ? 'Cette \u00e9tiquette existe d\u00e9j\u00e0'
          : 'Cr\u00e9ation en cours\u2026';
        return;
      }
      M.labelsCreateBtn.disabled = false;
      M.labelsCreateBtn.innerHTML =
        '<i class="ti ti-plus" aria-hidden="true"></i>' +
        '<span>Cr\u00e9er une nouvelle \u00e9tiquette\u00a0: <strong></strong></span>';
      var strong = M.labelsCreateBtn.querySelector('strong');
      if (strong) strong.textContent = q;
      M.labelsCreateBtn.title = 'Cr\u00e9er l\u2019\u00e9tiquette\u00a0: ' + q;
    };
    M.filteredBoardLabels = function filteredBoardLabels(query) {
      var q = String(query || '')
        .trim()
        .toLowerCase();
      return M.boardLabels.filter(function (label) {
        if (!label || !label.id) return false;
        if (!q) return true;
        return M.labelDisplayName(label).toLowerCase().indexOf(q) !== -1;
      });
    };
    M.renderLabelsPicker = function renderLabelsPicker() {
      M.labelsPickerList.replaceChildren();
      var query = M.labelsSearchInput.value;
      var q = String(query || '').trim();
      // With delete enabled, list every board label so unused and applied
      // ones can be permanently removed from Trello via the row ×.
      var listed = M.onLabelDelete
        ? M.filteredBoardLabels(query)
        : M.filteredAvailableBoardLabels(query);
      var selected = M.selectedLabelIds();

      if (!listed.length) {
        var empty = document.createElement('div');
        empty.className = 'info-labels-picker-empty';
        if (q) {
          empty.textContent = 'Aucune \u00e9tiquette correspondante';
        } else if (M.boardLabels.length && !M.onLabelDelete) {
          empty.textContent =
            'Toutes les \u00e9tiquettes sont d\u00e9j\u00e0 sur la carte';
        } else {
          empty.textContent = 'Aucune \u00e9tiquette sur ce tableau';
        }
        M.labelsPickerList.appendChild(empty);
      } else {
        listed.forEach(function (label) {
          var name = M.labelDisplayName(label);
          var hex = M.labelColorHex(label.color);
          var onCard = !!selected[String(label.id)];
          var row = document.createElement('div');
          row.className = 'info-labels-picker-row';
          if (onCard) row.classList.add('is-on-card');
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', onCard ? 'true' : 'false');
          row.dataset.labelId = String(label.id);

          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-labels-picker-option';
          btn.style.setProperty('--label-color', hex);
          btn.style.setProperty(
            '--label-fg',
            M.labelNeedsDarkText(hex) ? '#172b4d' : '#ffffff'
          );
          btn.title = onCard ? name + ' (sur cette carte)' : name;
          btn.disabled = M.labelsBusy || onCard;

          var swatch = document.createElement('span');
          swatch.className = 'info-label-swatch';
          swatch.setAttribute('aria-hidden', 'true');

          var text = document.createElement('span');
          text.className = 'info-labels-picker-option-text';
          text.textContent = name;

          btn.appendChild(swatch);
          btn.appendChild(text);
          if (!onCard) {
            btn.addEventListener('click', function () {
              M.addLabelFromPicker(label);
            });
          }
          row.appendChild(btn);

          if (M.onLabelDelete) {
            var deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'info-labels-picker-delete';
            deleteBtn.setAttribute(
              'aria-label',
              'Supprimer l\u2019\u00e9tiquette du tableau\u00a0: ' + name
            );
            deleteBtn.title = 'Supprimer du tableau';
            deleteBtn.disabled = M.labelsBusy;
            deleteBtn.innerHTML =
              '<i class="ti ti-trash" aria-hidden="true"></i>';
            deleteBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              M.deleteLabelFromBoard(label);
            });
            row.appendChild(deleteBtn);
          }

          M.labelsPickerList.appendChild(row);
        });
      }

      M.updateLabelsCreateButton(query);
    };
    },
    run: function (M) {
    M.LABEL_COLOR_HEX = {
      green: '#61BD4F',
      yellow: '#F2D600',
      orange: '#FF9F1A',
      red: '#EB5A46',
      purple: '#C377E0',
      blue: '#0079BF',
      sky: '#00C2E0',
      lime: '#51E898',
      pink: '#FF78CB',
      black: '#344563'
    };
    M.LABEL_COLOR_KEYS = Object.keys(M.LABEL_COLOR_HEX);
    M.LABEL_COLOR_NAMES_FR = {
      green: 'Vert',
      yellow: 'Jaune',
      orange: 'Orange',
      red: 'Rouge',
      purple: 'Violet',
      blue: 'Bleu',
      sky: 'Ciel',
      lime: 'Citron',
      pink: 'Rose',
      black: 'Noir'
    };
    M.LABEL_COLOR_FALLBACK = '#B3BAC5';
    }
  });
})(typeof window !== 'undefined' ? window : this);
